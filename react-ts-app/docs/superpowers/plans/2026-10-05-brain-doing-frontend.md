# Brain, delivery 3: What's being done (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **What's being done** at `/brain/doing`, open to every member and scoped **Me · My team · Company** through delivery 1's scope switch: three sections filtered to the scope's book (**Initiatives** with baseline → now → target, **Plans** with health and ARR then → now, **Rules at work** with last night's counts), section links synced to `?section=`, anyone may start an initiative on their own book (My team: on a report's), Knowledge by function moves here in Company, `/brain/initiatives` redirects here and Initiatives leaves the sidebar.

**Architecture:**
- **`src/features/brain/` (pure, unit-tested):** §3's types join `brainTypes.ts` (with the initiative types moved out of the soon-deleted `initiativesSlice`); what the page says goes in a new `doingText.ts`; `brainApi.ts` gains `fetchDoing`, `startInitiative`, `editInitiative`, `createCompanyInitiative`, `fetchMembers`, `fetchMetricList`, `fetchMetricCut`; the stateful contract stub `stubBrain` (`testBrain.ts`) learns `doing/`, `initiatives/` (POST, PATCH), `/auth/members/`, `/metrics/`, one cut and `/metrics/initiatives/` from new fixtures in `testDoingFixtures.ts`, keeping initiatives in a shared "world" so a second reader sees what the first started. No Redux, as deliveries 1 and 2.
- **`src/components/brain/` (new files):** `InitiativeForm.tsx` (the existing form, moved off Redux: Company mode as today, book mode limited to owner-cut metrics; plus the inline edit and close forms), `InitiativeRow`, `DoingPlanRow`, `DoingRuleRow`, `useDoing`, `DoingSkeleton`. `useBrainScope` keeps other query parameters when it sets `?scope=`.
- **`src/pages/brain/`:** `Doing.tsx` (new), `BrainRoutes.tsx` (`doing`; `initiatives` redirects), `WhatChanged.tsx` (drops Knowledge by function), `testPages.tsx` (a `user` option), `Initiatives.tsx` (+test) deleted.
- **Elsewhere (modify):** `Sidebar.tsx` (What's being done, Initiatives gone), `Navbar.tsx` (no `h1` on `/brain/doing`), `Graph.tsx` (initiative node link), `store.ts` (no `initiatives` slice), `features/initiatives/initiativesSlice.ts` deleted, `pages/rules/testPages.tsx` (`makeRulesStore` takes a user).

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, react-router 7, lucide-react, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-brain-doing-design.md`. This plan covers §0 (what exists), Decisions, §2 (frontend) and §3 (the API contract, binding; field names used exactly). §1 is the backend, read for behaviour the stub must mirror (who is in each scope's initiatives, Decision 2; who may start and edit, Decision 3 and §1.3; plans' order and `hidden`, §1.2; rules' counts for owner vs others, Decision 5).

**The API contract** is spec §3. The backend is built in parallel in `revenact-backend` against the same section, so every test here runs against `stubBrain`, never a live server. The stub answers in §3's shapes and checks in the backend's order: **400 `SCOPE_UNKNOWN` before 403 `SCOPE_NOT_ALLOWED`**. Where §3 is silent or the real frontend forces something, the assumption is under **Contract notes**. No §3 field is renamed or removed; additions are optional fields only.

**Builds on deliveries 1 and 2, already on this branch:** `features/brain/*` (`brainTypes`, `brainScope`, `brainText` with `SAY`, `valueText`, `dayOf`; `brainApi` with `isScopeRefusal`; `waitingText` with `recordPath`; `testBrain` `stubBrain`/`requests`, `testBrainFixtures`, `testWaitingFixtures` with `ALICE`, `CARL`, `DANA`), `components/brain/` (`ScopeSwitch`, `useBrainScope` with the 403 fallback, `LostAccessNotice`, `useWaiting` as the model for `useDoing`, `WaitingSkeleton`, `houseRules.test.ts`, `KnowledgeByFunctionPanel`), `pages/brain/WhatChanged.tsx`, `Waiting.tsx`, `BrainRoutes.tsx`, `testPages.tsx` (`renderBrain`), `Sidebar.tsx` (`WaitingNavItem`), `e2e/brain.test.tsx`. Reuse them: the page uses the same `useBrainScope`, `ScopeSwitch`, `LostAccessNotice`, `ErrorBlock` and states.

**Branch:** `feat/brain-doing` in `react-ts-app`, already checked out (the spec is its only commit over delivery 2). Stay on it. Never push. Do not touch `revenact-backend`.

## Contract notes (assumptions to reconcile with the backend plan)

1. **`?scope=` is always sent on `doing/` and on `POST initiatives/`**; the page never reads before the scope settles. `PATCH initiatives/<id>/` takes no scope. The stub treats a missing scope like an unknown one (400 `SCOPE_UNKNOWN`), then a scope not offered (403 `SCOPE_NOT_ALLOWED`), then `POST initiatives/?scope=company` (403 `SCOPE_NOT_ALLOWED`, §3).
2. **Metric keys are the registry's** (`revenact-backend services/metrics/registry.py`): ARR at risk is `at_risk_arr`. §3's `"arr_at_risk"` is read as illustrative; the fixtures use `at_risk_arr`.
3. **Which metrics have an owner cut.** `GET /metrics/` is `CanViewAllAccounts`, so a CSM cannot read the registry's `dimensions`. Outside Company the form offers a frontend constant, `OWNER_CUT_METRICS` in `doingText.ts`, mirroring the registry's five metrics with an `OWNER` slice today: `at_risk_arr` (ARR at risk), `forecast_arr` (Forecast ARR), `nrr` (Net revenue retention), `healthy_share` (Book in good health), `poor_health_count` (Customers in poor health). The server's 400 `{"detail": "That number can't be tracked for one person's book."}` is the backstop, shown at the form. If the registry gains or loses an owner cut, this list changes with it.
4. **"Whose book" in My team** lists the reader, then everyone below them through `reports_to`, from `GET /auth/members/` (open to every member, `UserSerializer` with `reports_to`; `DeskMember` reads only `id`, `name`, `reports_to`). The server validates `for_user` (§1.3). A failed members read offers the reader only. A My team initiative's **`owner` is the `for_user`** (Decision 3 says Me sets `owner=<me>`; the same rule is assumed for the person chosen).
5. **Expanding an initiative needs its hypothesis and tasks**, which §3's initiative does not carry. The frontend reads optional **`hypothesis`** (string), **`outcome`** (string) and **`work.tasks`** (the existing serializer's task rows: `id`, `title`, `parent_name`, `parent_type`, `parent_id`, `assignee_name`, `due_date`, `priority`, `status`) when present. Without any of them the row offers no Details, and Edit leaves the hypothesis alone. Additive; the backend is asked to send them.
6. **An initiative's `owner` may be `null`** (a Company initiative started with no owner, as the existing form allows): it reads "No owner", and only `view_all_accounts` may edit it (the stub's rule).
7. **`POST initiatives/` body** is §3's: `title`, `hypothesis`, `metric`, `target_value` (a string, as today's form sends), `target_by`, `status` (always `"active"`, the model's default) and, in My team only, `for_user`. The page uses only the 201's `id`, then reads `doing/` again, so the new row lands in the server's order.
8. **Company initiatives are still started through `POST /metrics/initiatives/`** with today's body (`title`, `hypothesis`, `metric`, `dimension`, `member`, `target_value`, `target_by`, `owner_id`), from today's form (§3: "403 SCOPE_NOT_ALLOWED for Company (use /metrics/initiatives/)"). Its metric list and cuts come from `GET /metrics/` and `GET /metrics/<key>/by/<dimension>/` (both `view_all_accounts`, which Company starting needs anyway). The page uses only the 201's `id`.
9. **`PATCH initiatives/<id>/`** is sent for every edit, close and reopen, in every scope (the brain route admits `view_all_accounts`, §1.3), with any of `title`, `hypothesis`, `target_value`, `target_by`, `status`, `outcome`. It answers the initiative in `doing/`'s shape (with `can_edit`), which replaces the row in place. 403 `{"detail": "You can't change this initiative."}` shows at the row's buttons.
10. **Plans.** `record.type` is `"customer"` or `"account"` (`recordPath`, `waitingText.ts`). §2.1 says a plan "opens on its record page", but a record page only lists its plans (`RecordPlans`), each linking to the plan's own page `/projects/<id>` (`PlanRowItem`); there is no per-plan anchor on a record page. So the plan's name links to `/projects/<id>` and the record's name to the record. `target_date` may be `null` ("No target date"). A figure that is `null` on one side reads "not recorded"; `null` on both sides is left out.
11. **Rules.** `paused_reason` is the rule's own code (`PausedReason` in `features/rules/ruleTypes.ts`: `segment_gone`, `segment_not_owned`, `owner_inactive`, `template_gone`, `campaign_gone`), or `null`/`""`. An inactive rule with no reason was switched off by hand and reads "Off". `segment` is the segment's name, or `null` ("No segment"). The rule's name links to `/scenarios/rules/<id>` only when `mine` is true: §3 carries no "readable" flag, and a rule shared with the reader is still reachable from Rules.
12. **`hidden` counts plans only** (§1.2), and is worded as plans.

## Global Constraints

Quoted text is verbatim from the caller's brief, the spec §2, or `.claude/skills/revenact-design/SKILL.md` §1 and §4.

- **Tokens only, no raw colours.** "Zero raw hex, rgb, or named colours in `src/**/*.tsx`; tokens only." Use `bg-surface`, `bg-subtle`, `text-ink`, `text-ink-muted`, `border-line`, `border-accent`, `bg-accent`, `text-on-accent`, and `text-danger` for errors only ("Semantic colours carry meaning only (status, trend, severity), never decoration"). The progress bar is `bg-accent` on `bg-subtle`.
- **DM Mono tabular-nums for figures.** Every baseline, now, target, days, task count, milestone count, health, ARR, rule count and date uses `MONO` (`font-mono-brand tabular-nums`, from `components/organizations/portfolio/styles.ts`), wrapping the figure only, not the words around it.
- **≤4 type sizes per surface.** Only `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]`.
- **No card in a card.** "Group with `border-line`, `divide-y`, or whitespace." Each section's list is one bordered surface (`divide-y`); each row is flat inside it, never a bordered or rounded box; the inline edit and close forms and the Details panel sit inside the row behind a `border-t`, not in a box. The New initiative form is its own bordered surface above the list, never inside a row.
- **No glass on these pages.** No `rv-card-glass`, `rv-glass-inner` or `backdrop-blur`.
- **44px touch targets or `min-h-9` dense desktop controls.** Every button, link, select, input and textarea gets `min-h-11 sm:min-h-9` (links in rows: `min-h-11 … sm:min-h-0`, as `WaitingRow`'s `LINK`), directly or through `BUTTON`, `PRIMARY`, `QUIET`, or a style constant in the same file.
- **Empty / loading (skeleton) / error states.** "Every list/table/chart has designed empty, loading (skeleton matching layout, not spinner), and error states."
- **375 / 768 / 1024 / 1440 with no horizontal scroll.** The header stacks below `sm`; the switch is a select below `sm`; section links, row meta and buttons wrap (`flex-wrap`); the form is one column below `md`; "`min-h-[100dvh]` never `h-screen`."
- **localStorage** stays in `features/brain/brainScope.ts` only, every read and write inside `try { … } catch { … }`; nothing new here touches storage.
- **Lucide only**, 16px inline, every icon `aria-hidden="true"`; no emoji. The sidebar item is `Flag`; New initiative carries `Plus`.
- **No colour-only meaning.** A refusal or failure is a sentence, never only red; a paused rule says "Paused" in words.
- **Copy.** Sentence case; no em dashes in UI copy; the spec's sentences exactly: "What's being done", "Initiatives", "Plans", "Rules at work", "New initiative", "No initiatives on your book yet.", "No open plans.", "No rules running.", "Started before starting figures were kept", "You no longer have access to that view."
- **Every write is sent once.** Save initiative, Save (edit), Close as done / Close as abandoned and Reopen go through `useSubmitOnce` (`components/plans/useSubmitOnce.ts`); tests double-click and count one request.
- **Focus is handled after rows change.** After a start, focus lands on the new row's first control; after Cancel, on New initiative; after an edit, on Edit; after a close, on Reopen; after a reopen, on Mark done; a refusal's sentence takes focus; a section link moves focus to its heading.
- **Commands.** `npx vitest run`, `npm run lint` and `npm run build` pass. Never run prettier. Type-check with `npx tsc -b --noEmit`; run focused tests with `npx vitest run --maxWorkers=2 <paths>`, one process at a time; `npm run lint` must end with **15 problems (0 errors, 15 warnings)** (the baseline).
- **Commits** are conventional (`feat(brain): …`, `refactor(brain): …`, `test(e2e): …`, `docs(brain): …`) and every commit message ends with a blank line and exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  Never push.
- **Tests** follow the `testing` skill: unit tests per module; component tests with `fetch` stubbed by `stubBrain`; page tests on the real router (`renderBrain`); jsdom journeys in `src/e2e/brain.test.tsx`; the Brain house-rules suite reusing `houseRuleSuite` and `rowsIconsTargetsSuite`. Every test must be able to fail, and its title claims only what it asserts.
- **Product documents** change in the same branch and describe only what ships: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (Task 8).

## Decisions made while planning (the owner may overrule any)

1. **No Redux for the page.** It reads through `useDoing`; the form reads its metrics, cuts and members through `brainApi` directly. The old Initiatives page was the only reader of `initiativesSlice`, so the slice is deleted with it (its types move to `brainTypes.ts`) and leaves the store. `metricsSlice` stays (its types are used; its reducer stays registered, now with no page reading it: a later cleanup). `components/brain/formatMetric.ts` goes if nothing else imports it.
2. **All three sections always render**, in the spec's order, with Knowledge by function after them in Company. The section links are links that set `?section=` (replace, keeping `?scope=`) and move focus to that section's heading (and scroll it into view); landing on `?section=` does the same once the work loads. `useBrainScope` is changed to keep other query parameters when it sets or drops `?scope=`, so `?section=` survives the scope settling.
3. **New initiative is the page's one `PRIMARY`**, in the Initiatives section's header (`aria-expanded`), shown in Me and My team to everyone and in Company to `view_all_accounts` readers. It opens the form above the list. The empty line sits beside it ("No initiatives on your book yet.").
4. **One form, two modes** (`InitiativeForm`): Company is today's form (Title, Hypothesis, Metric (every registry metric), Cut ("Whole company" or "By owner/product/size band/lifecycle stage"), "Which …" member, Target value, Target date, Owner). Book mode (Me, My team) drops Cut, member and Owner, offers only `OWNER_CUT_METRICS` with the hint "Only numbers that can be tracked for one person's book.", and in My team adds "Whose book" (the reader first). Labels above inputs, a field's refusal below it (`planErrors`), a form-level refusal at the foot in a focused `role="alert"`. Save initiative is the bordered `BUTTON` (the page keeps one primary).
5. **After a start** the form closes, one status line says "Initiative started.", `doing/` is read again, and focus lands on the new row's first control.
6. **An initiative row** reads: the title (`h3`, 15px); a meta line "ARR at risk · Carl CSM's book · Active · Carl CSM" (metric · whose book ("Your book" for the reader, "Whole company" when `for` is null, a cut's label otherwise) · status · owner); baseline → now → target in DM Mono over a progress bar (`role="progressbar"`, "Not measurable yet" when `progress_pct` is null); "56 days left" / "3 days overdue" (none once closed) and "by 30 Nov 2026"; "Tasks: 2 open · 1 done". Details (when there is a hypothesis, outcome or task list) expands the hypothesis, the outcome and the tasks (title, record link, assignee, due date, "To do" / "In progress" / "Done"). For `can_edit`: Edit (quiet), Mark done (bordered), Abandon (quiet) on an open one; Reopen (quiet) on a closed one. Edit and close are inline forms behind a `border-t`.
7. **A plan row**: the plan's name (to `/projects/<id>`) "on" the record's name (to the record), the meta line "At risk · 1 of 4 milestones · by 1 Nov 2026 · Carl CSM", then "Health 48 → 55 · ARR $69.6K → $69.6K" or "Started before starting figures were kept".
8. **A rule row**: the rule's name (a link when `mine`), "Detractors · On" / "Renewals in 90 days · Paused: its segment was deleted" / "No segment · Off", then "Last run 5 Oct: fired 4 · matched 12 · skipped 2" (others' rules: "fired 1" only) or "Not run yet". The run date is named rather than assuming "last night", since a paused rule's last run may be older.
9. **Copy for what §2.1 leaves open:** "No initiatives on your team's book yet." (My team), "No initiatives yet." (Company); "1 more plan on a record you can't open" / "2 more plans on records you can't open"; "Could not load what is being done."; "Could not save the initiative."; "Initiative started."
10. **Items show in the server's order**; the client never re-sorts.
11. **Knowledge by function** shows in Company for `view_all_accounts` readers only, as on What changed (the panel reads `view_all_accounts` endpoints), inside a region named "Company knowledge".
12. **Errors read "Try again"** through the house `ErrorBlock`, as deliveries 1 and 2 (the spec says "Retry").
13. **The Navbar shows "Brain" as a paragraph on `/brain/doing`** too, so "What's being done" is the page's only `h1`.
14. **The sidebar** has What's being done (`Flag`, `/brain/doing`) for every member after Waiting on you; Initiatives goes; Feature Requests and Anomalies keep their `view_all_accounts` gate. The Knowledge graph's initiative node links to `/brain/doing?section=initiatives`.
15. **`/brain/initiatives` redirects for everyone** (outside the `view_all_accounts` gate) to `/brain/doing?section=initiatives`.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/brain/brainTypes.ts` (modify) | §3's types plus the moved initiative types: `InitiativeStatus`, `InitiativeProgress`, `InitiativeTask`, `InitiativeBook`, `DoingInitiative`, `PlanFigures`, `DoingPlan`, `DoingRuleRun`, `DoingRule`, `DoingPayload`, `BookInitiativeWrite`, `InitiativeWrite`, `InitiativePatch`, `DeskMember` |
| `src/features/brain/doingText.ts` (+test) (new) | `DO` sentences, sections and `?section=`, `OWNER_CUT_METRICS`, whose book, figures, days, work, milestones, then → now, rule status and last run, empty and hidden lines, `bookPeople` |
| `src/features/brain/brainApi.ts` (modify) | `fetchDoing`, `startInitiative`, `editInitiative`, `createCompanyInitiative`, `fetchMembers`, `fetchMetricList`, `fetchMetricCut` |
| `src/features/brain/testDoingFixtures.ts` (new, test-only) | Members, initiatives, plans and rules on 5 Oct 2026; `doingWorld`; `DOING_REST`; metric list and bodies |
| `src/features/brain/testBrain.ts` (+test) (modify) | `stubBrain` answers `doing/`, `initiatives/` POST and PATCH, `/auth/members/`, `/metrics/`, a cut, `/metrics/initiatives/`; `bodies` |
| `src/pages/rules/testPages.tsx`, `src/pages/brain/testPages.tsx` (modify) | `makeRulesStore` and `renderBrain` take the signed-in user |
| `src/components/brain/InitiativeForm.tsx` (+test) (new) | New initiative (Company and book modes), edit and close forms, each sent once |
| `src/components/brain/InitiativeRow.tsx` (+test) (new) | One initiative: figures, bar, Details, Edit / Mark done / Abandon / Reopen |
| `src/components/brain/DoingPlanRow.tsx`, `DoingRuleRow.tsx` (+ `DoingRows.test.tsx`) (new) | One plan; one rule |
| `src/components/brain/useBrainScope.ts` (+test) (modify) | Keeps other query parameters |
| `src/components/brain/useDoing.ts`, `DoingSkeleton.tsx` (new) | The read with `replace`; the skeleton |
| `src/pages/brain/Doing.tsx` (+test) (new) | The page |
| `src/pages/brain/BrainRoutes.tsx` (+test), `WhatChanged.tsx` (+test) (modify) | `doing`, the redirect; Knowledge by function gone |
| `src/components/layout/Sidebar.tsx` (+test), `Navbar.tsx` (+test), `src/pages/brain/Graph.tsx`, `src/store.ts` (modify) | The sidebar item; the title; the node link; the slice gone |
| `src/pages/brain/Initiatives.tsx` (+test), `src/features/initiatives/initiativesSlice.ts`, `src/components/brain/formatMetric.ts` (delete) | The old page and its slice |
| `src/components/brain/houseRules.test.ts`, `src/e2e/brain.test.tsx` (modify) | House rules and the journeys |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (modify) | Product documents |

---

### Task 1: The contract types and what the page says

Spec §3 (types), §2.1 (sections, rows, empty lines, "Started before starting figures were kept"); Decisions 2, 3; Contract notes 2–5, 10–12; plan Decisions 6–9.

**Files:**
- Modify: `src/features/brain/brainTypes.ts` (append)
- Create: `src/features/brain/doingText.ts`
- Test: `src/features/brain/doingText.test.ts`

**Interfaces:**
- Consumes: `ScopeKey`, `Better`, `MetricUnit`, `WaitingPerson`, `WaitingRecord` (`brainTypes`); `valueText`, `dayOf` (`brainText`); `formatCompactMoney` (`features/customers/formatters`); `PlanStatus` (`features/plans/planTypes`); `PausedReason` (`features/rules/ruleTypes`); `CurrencyCode` (`features/auth/authSlice`).
- Produces:
  - `brainTypes.ts`: `InitiativeStatus`, `InitiativeProgress`, `InitiativeTask`, `InitiativeBook`, `DoingInitiative`, `PlanFigures`, `DoingPlan`, `DoingRuleRun`, `DoingRule`, `DoingPayload`, `BookInitiativeWrite`, `InitiativeWrite`, `InitiativePatch`, `DeskMember`.
  - `doingText.ts`: `DO`, `SectionKey`, `SECTIONS`, `sectionOf(param)`, `withSection(search, key)`, `TrackableMetric`, `OWNER_CUT_METRICS`, `canStart(scope, canSeeAll)`, `initiativeStatusLabel(status)`, `isClosed(status)`, `bookText(initiative, readerId)`, `progressFigures(progress, currency)`, `Counted`, `daysLeftParts(daysLeft, status)`, `workText(work)`, `milestonesText(m)`, `taskStatusText(status)`, `FigurePart`, `thenNowParts(plan, currency)`, `thenNowText(plan, currency)`, `ruleStatusText(rule)`, `RunParts`, `lastRunParts(rule)`, `lastRunText(rule)`, `segmentText(rule)`, `ruleHref(rule)`, `planHref(plan)`, `initiativesEmpty(scope)`, `hiddenPlansText(n)`, `bookPeople(members, reader)`.

- [ ] **Step 1: Write the failing test**

Create `src/features/brain/doingText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DeskMember, DoingPlan, DoingRule, InitiativeProgress } from './brainTypes';
import {
  bookPeople,
  bookText,
  canStart,
  daysLeftParts,
  DO,
  hiddenPlansText,
  initiativesEmpty,
  initiativeStatusLabel,
  isClosed,
  lastRunParts,
  lastRunText,
  milestonesText,
  OWNER_CUT_METRICS,
  planHref,
  progressFigures,
  ruleHref,
  ruleStatusText,
  sectionOf,
  segmentText,
  taskStatusText,
  thenNowParts,
  thenNowText,
  withSection,
  workText,
} from './doingText';

const P: InitiativeProgress = {
  baseline: 64100, current: 52000, target: 32000, progress_pct: 37.7, days_left: 56, direction: 'down', unit: 'money', better: 'down',
};
const plan = (then: DoingPlan['then'], now: DoingPlan['now']): DoingPlan => ({
  id: 8, name: 'Renewal save play', status: 'at_risk', record: { type: 'customer', id: 6, name: 'Pizza Hut' },
  owner: { id: 5, name: 'Carl CSM' }, target_date: '2026-11-01', milestones: { done: 1, total: 4 }, then, now,
});
const rule = (over: Partial<DoingRule> = {}): DoingRule => ({
  id: 3, name: 'Detractor follow-up', segment: 'Detractors', is_active: true, paused_reason: null, mine: true,
  last_run: { run_on: '2026-10-05', fired: 4, matched: 12, skipped: 2 }, ...over,
});
const TAKEN = '2026-09-01';

describe('doingText (spec §2.1)', () => {
  it('names the sections and reads and writes ?section=, keeping the scope', () => {
    expect(sectionOf('plans')).toBe('plans');
    expect(sectionOf('everything')).toBeNull();
    expect(sectionOf(null)).toBeNull();
    expect(withSection('?section=plans&scope=me', 'rules')).toBe('?section=rules&scope=me');
    expect(withSection('?scope=team', 'initiatives')).toBe('?scope=team&section=initiatives');
  });

  it('offers only the registry metrics with an owner cut (Contract note 3)', () => {
    expect(OWNER_CUT_METRICS.map((m) => m.key)).toEqual(['at_risk_arr', 'forecast_arr', 'nrr', 'healthy_share', 'poor_health_count']);
  });

  it('lets anyone start on their own book; Company needs view_all_accounts (Decision 3)', () => {
    expect(canStart('me', false)).toBe(true);
    expect(canStart('team', false)).toBe(true);
    expect(canStart('company', false)).toBe(false);
    expect(canStart('company', true)).toBe(true);
  });

  it('says whose book an initiative tracks', () => {
    const carls = { for: { dimension: 'owner', member: '5', label: 'Carl CSM' } };
    expect(bookText(carls, 5)).toBe('Your book');
    expect(bookText(carls, 1)).toBe("Carl CSM's book");
    expect(bookText({ for: { dimension: 'product', member: '4', label: 'Analytics Suite' } }, 1)).toBe('Analytics Suite');
    expect(bookText({ for: null }, 1)).toBe('Whole company');
  });

  it('reads baseline, now and target in the metric’s unit', () => {
    expect(progressFigures(P, 'USD')).toEqual({ baseline: '$64.1K', now: '$52K', target: '$32K' });
    expect(progressFigures({ ...P, unit: 'percent', baseline: null, current: 104, target: 110 }, 'USD')).toEqual({
      baseline: 'Not measured', now: '104%', target: '110%',
    });
  });

  it('counts days left or overdue, none once closed, and names each status', () => {
    expect(daysLeftParts(56, 'active')).toEqual({ n: 56, words: 'days left' });
    expect(daysLeftParts(1, 'planned')).toEqual({ n: 1, words: 'day left' });
    expect(daysLeftParts(-3, 'active')).toEqual({ n: 3, words: 'days overdue' });
    expect(daysLeftParts(10, 'done')).toBeNull();
    expect(isClosed('abandoned')).toBe(true);
    expect(isClosed('planned')).toBe(false);
    expect(initiativeStatusLabel('planned')).toBe('Planned');
    expect(taskStatusText('in-progress')).toBe('In progress');
  });

  it('words the work, the milestones, the empty lines and the hidden plans', () => {
    expect(workText({ open: 2, done: 1 })).toBe('2 open · 1 done');
    expect(milestonesText({ done: 3, total: 5 })).toBe('3 of 5 milestones');
    expect(initiativesEmpty('me')).toBe('No initiatives on your book yet.');
    expect(initiativesEmpty('team')).toBe("No initiatives on your team's book yet.");
    expect(initiativesEmpty('company')).toBe('No initiatives yet.');
    expect(hiddenPlansText(0)).toBeNull();
    expect(hiddenPlansText(1)).toBe("1 more plan on a record you can't open");
    expect(hiddenPlansText(2)).toBe("2 more plans on records you can't open");
    expect(planHref(plan(null, { health_score: 1, arr: 1 }))).toBe('/projects/8');
  });

  it('reads a plan’s health and ARR then → now (Decision 4; Contract note 10)', () => {
    expect(thenNowText(plan({ health_score: 62, arr: 40000, taken_on: TAKEN }, { health_score: 71, arr: 44000 }), 'USD')).toBe(
      'Health 62 → 71 · ARR $40K → $44K',
    );
    expect(thenNowParts(plan(null, { health_score: 71, arr: 44000 }), 'USD')).toBeNull();
    expect(thenNowText(plan(null, { health_score: 71, arr: 44000 }), 'USD')).toBe(DO.BEFORE_FIGURES);
    expect(DO.BEFORE_FIGURES).toBe('Started before starting figures were kept');
    expect(thenNowText(plan({ health_score: null, arr: 40000, taken_on: TAKEN }, { health_score: 55, arr: null }), 'USD')).toBe(
      'Health not recorded → 55 · ARR $40K → not recorded',
    );
    expect(thenNowText(plan({ health_score: null, arr: 40000, taken_on: TAKEN }, { health_score: null, arr: 44000 }), 'USD')).toBe(
      'ARR $40K → $44K',
    );
    expect(thenNowText(plan({ health_score: null, arr: null, taken_on: TAKEN }, { health_score: null, arr: null }), 'USD')).toBe(DO.NO_FIGURES);
  });

  it('says whether a rule is on, paused (and why) or off, and what its last run did (Decision 5; Contract note 11)', () => {
    expect(ruleStatusText(rule())).toBe('On');
    expect(ruleStatusText(rule({ is_active: false, paused_reason: 'segment_gone' }))).toBe('Paused: its segment was deleted');
    expect(ruleStatusText(rule({ is_active: false, paused_reason: null }))).toBe('Off');
    expect(ruleStatusText(rule({ is_active: false, paused_reason: '' }))).toBe('Off');
    expect(lastRunText(rule())).toBe('Last run 5 Oct: fired 4 · matched 12 · skipped 2');
    const others = rule({ mine: false, last_run: { run_on: '2026-10-04', fired: 1 } });
    expect(lastRunText(others)).toBe('Last run 4 Oct: fired 1');
    expect(lastRunParts(others)).toEqual({ on: '4 Oct', parts: [{ label: 'fired', n: 1 }] });
    expect(lastRunText(rule({ last_run: null }))).toBe('Not run yet');
    expect(lastRunParts(rule({ last_run: null }))).toBeNull();
    expect(segmentText(rule({ segment: null }))).toBe('No segment');
    expect(ruleHref(rule())).toBe('/scenarios/rules/3');
    expect(ruleHref(rule({ mine: false }))).toBeNull();
  });

  it('offers the reader, then everyone below them by name (Contract note 4)', () => {
    const members: DeskMember[] = [
      { id: 1, name: 'Alice Admin', reports_to: null },
      { id: 2, name: 'Bob Lead', reports_to: null },
      { id: 5, name: 'Carl CSM', reports_to: { id: 1, name: 'Alice Admin' } },
      { id: 7, name: 'Dana CSM', reports_to: { id: 2, name: 'Bob Lead' } },
      { id: 9, name: 'Ava Associate', reports_to: { id: 5, name: 'Carl CSM' } },
    ];
    expect(bookPeople(members, { id: 1, name: 'Alice' }).map((m) => m.name)).toEqual(['Alice Admin', 'Ava Associate', 'Carl CSM']);
    expect(bookPeople([], { id: 1, name: 'Alice' })).toEqual([{ id: 1, name: 'Alice', reports_to: null }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/brain/doingText.test.ts`
Expected: FAIL (`Failed to resolve import "./doingText"`).

- [ ] **Step 3: Append the types to `brainTypes.ts`**

Add to the imports at the top of `src/features/brain/brainTypes.ts`:

```ts
import type { PlanStatus } from '../plans/planTypes';
import type { PausedReason } from '../rules/ruleTypes';
```

Append at the end of the file:

```ts
// What's being done (spec 2026-10-05-brain-doing-design §3). The initiative
// types moved here from features/initiatives/initiativesSlice (deleted in
// Task 7). Contract notes 5, 6, 10 and 11: optional hypothesis, outcome and
// tasks; a nullable initiative owner, plan target date and rule segment;
// `paused_reason` is the rule's own code.

export type InitiativeStatus = 'planned' | 'active' | 'done' | 'abandoned';

export interface InitiativeProgress {
  /** The starting line, captured when the initiative was written. */
  baseline: number | null;
  current: number | null;
  target: number;
  /** 0–100; null when either end is unmeasured. */
  progress_pct: number | null;
  /** Negative once the target date has passed. */
  days_left: number;
  direction: 'up' | 'down';
  unit: MetricUnit | null;
  better: Better | null;
}

/** A task under an initiative (Contract note 5: the serializer's rows). */
export interface InitiativeTask {
  id: number;
  title: string;
  parent_name: string;
  parent_type: 'customer' | 'account';
  parent_id: number;
  assignee_name: string;
  due_date: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'completed';
}

/** The cut an initiative tracks: a person's book when `dimension` is "owner". */
export interface InitiativeBook {
  dimension: string;
  member: string;
  label: string;
}

export interface DoingInitiative {
  id: number;
  title: string;
  metric: string;
  metric_label: string;
  /** Null: the whole company. */
  for: InitiativeBook | null;
  status: InitiativeStatus;
  owner: WaitingPerson | null;
  target_by: string;
  progress: InitiativeProgress;
  work: { open: number; done: number; tasks?: InitiativeTask[] };
  can_edit: boolean;
  hypothesis?: string;
  outcome?: string;
}

export interface PlanFigures {
  health_score: number | null;
  arr: number | null;
}

export interface DoingPlan {
  id: number;
  name: string;
  status: PlanStatus;
  record: WaitingRecord;
  owner: WaitingPerson;
  target_date: string | null;
  milestones: { done: number; total: number };
  /** Null: started before starting figures were kept. */
  then: (PlanFigures & { taken_on: string }) | null;
  now: PlanFigures;
}

export interface DoingRuleRun {
  run_on: string;
  fired: number;
  /** Only on the reader's own rules. */
  matched?: number;
  skipped?: number;
}

export interface DoingRule {
  id: number;
  name: string;
  segment: string | null;
  is_active: boolean;
  paused_reason: PausedReason | null;
  mine: boolean;
  /** Null before a rule's first night. */
  last_run: DoingRuleRun | null;
}

/** GET doing/?scope= */
export interface DoingPayload {
  scope: ScopeKey;
  currency: CurrencyCode;
  /** Plans in the scope the reader can't open: counted, never named. */
  hidden: number;
  initiatives: DoingInitiative[];
  plans: DoingPlan[];
  rules: DoingRule[];
}

/** POST initiatives/?scope=me|team (Contract note 7). */
export interface BookInitiativeWrite {
  title: string;
  hypothesis: string;
  metric: string;
  target_value: string;
  target_by: string;
  status: InitiativeStatus;
  /** My team only. */
  for_user?: number;
}

/** POST /metrics/initiatives/ (Company, unchanged; Contract note 8). */
export interface InitiativeWrite {
  title: string;
  hypothesis: string;
  metric: string;
  dimension: string;
  member: string;
  target_value: string;
  target_by: string;
  owner_id: number | null;
}

/** PATCH initiatives/<id>/ (Contract note 9). */
export type InitiativePatch = Partial<Pick<BookInitiativeWrite, 'title' | 'hypothesis' | 'target_value' | 'target_by' | 'status'>> & {
  outcome?: string;
};

/** GET /auth/members/, as far as "Whose book" reads it (Contract note 4). */
export interface DeskMember {
  id: number;
  name: string;
  reports_to: WaitingPerson | null;
}
```

- [ ] **Step 4: Write `doingText.ts`**

Create `src/features/brain/doingText.ts`:

```ts
// What "What's being done" says (spec 2026-10-05-brain-doing-design §2.1),
// in one place so the tests and the page share it.
import type { CurrencyCode } from '../auth/authSlice';
import { formatCompactMoney } from '../customers/formatters';
import type { PausedReason } from '../rules/ruleTypes';
import { dayOf, valueText } from './brainText';
import type {
  Better,
  DeskMember,
  DoingInitiative,
  DoingPlan,
  DoingRule,
  InitiativeProgress,
  InitiativeStatus,
  InitiativeTask,
  MetricUnit,
  ScopeKey,
  WaitingPerson,
} from './brainTypes';

export const DO = {
  TITLE: "What's being done",
  SECTIONS: 'Sections',
  INITIATIVES: 'Initiatives',
  PLANS: 'Plans',
  RULES: 'Rules at work',
  LOAD: 'Could not load what is being done.',
  LOADING: 'Loading what is being done',
  NEW: 'New initiative',
  STARTED: 'Initiative started.',
  NO_PLANS: 'No open plans.',
  NO_RULES: 'No rules running.',
  BEFORE_FIGURES: 'Started before starting figures were kept',
  NO_FIGURES: 'No figures recorded',
  NOT_RECORDED: 'not recorded',
  NO_TARGET_DATE: 'No target date',
  NOT_MEASURABLE: 'Not measurable yet',
  NOT_RUN: 'Not run yet',
  NO_SEGMENT: 'No segment',
  WHOLE_COMPANY: 'Whole company',
  YOUR_BOOK: 'Your book',
  NO_OWNER: 'No owner',
  DETAILS: 'Details',
  HYPOTHESIS: 'Hypothesis',
  OUTCOME: 'Outcome',
  TASKS: 'Tasks',
  NO_TASKS: 'No tasks yet.',
  EDIT: 'Edit',
  EDIT_FORM: 'Edit initiative',
  MARK_DONE: 'Mark done',
  ABANDON: 'Abandon',
  REOPEN: 'Reopen',
  WHAT_HAPPENED: 'What happened?',
  CLOSE_DONE: 'Close as done',
  CLOSE_ABANDONED: 'Close as abandoned',
  SAVE: 'Save',
  SAVE_INITIATIVE: 'Save initiative',
  SAVING: 'Saving…',
  CANCEL: 'Cancel',
  SAVE_FAILED: 'Could not save the initiative.',
  FIELD_TITLE: 'Title',
  FIELD_HYPOTHESIS: 'Hypothesis',
  FIELD_METRIC: 'Metric',
  FIELD_CUT: 'Cut',
  FIELD_TARGET: 'Target value',
  FIELD_TARGET_BY: 'Target date',
  FIELD_OWNER: 'Owner',
  FIELD_WHOSE_BOOK: 'Whose book',
  OWNER_CUT_HINT: "Only numbers that can be tracked for one person's book.",
  CHOOSE: 'Choose…',
  LOADING_CHOICES: 'Loading…',
  LOAD_METRICS: 'Could not load the numbers you can track.',
} as const;

export type SectionKey = 'initiatives' | 'plans' | 'rules';
export const SECTIONS: readonly { key: SectionKey; label: string }[] = [
  { key: 'initiatives', label: DO.INITIATIVES },
  { key: 'plans', label: DO.PLANS },
  { key: 'rules', label: DO.RULES },
];

export function sectionOf(param: string | null): SectionKey | null {
  return SECTIONS.some((s) => s.key === param) ? (param as SectionKey) : null;
}

/** The page's query with `?section=` set, everything else kept. */
export function withSection(search: string, key: SectionKey): string {
  const next = new URLSearchParams(search);
  next.set('section', key);
  return `?${next.toString()}`;
}

export interface TrackableMetric {
  key: string;
  label: string;
  unit: MetricUnit;
  better: Better;
}

/** The registry's metrics with an owner cut (revenact-backend
 *  services/metrics/registry.py), offered outside Company (Contract note 3). */
export const OWNER_CUT_METRICS: readonly TrackableMetric[] = [
  { key: 'at_risk_arr', label: 'ARR at risk', unit: 'money', better: 'down' },
  { key: 'forecast_arr', label: 'Forecast ARR', unit: 'money', better: 'up' },
  { key: 'nrr', label: 'Net revenue retention', unit: 'percent', better: 'up' },
  { key: 'healthy_share', label: 'Book in good health', unit: 'percent', better: 'up' },
  { key: 'poor_health_count', label: 'Customers in poor health', unit: 'count', better: 'down' },
];

/** Decision 3: anyone on their own book; Company for view_all_accounts. */
export function canStart(scope: ScopeKey, canSeeAll: boolean): boolean {
  return scope !== 'company' || canSeeAll;
}

const STATUS: Record<InitiativeStatus, string> = { planned: 'Planned', active: 'Active', done: 'Done', abandoned: 'Abandoned' };
export const initiativeStatusLabel = (status: InitiativeStatus): string => STATUS[status];
export const isClosed = (status: InitiativeStatus): boolean => status === 'done' || status === 'abandoned';

const TASK_STATUS: Record<InitiativeTask['status'], string> = { pending: 'To do', 'in-progress': 'In progress', completed: 'Done' };
export const taskStatusText = (status: InitiativeTask['status']): string => TASK_STATUS[status];

/** Whose book an initiative tracks: yours, a person's, a cut, or the whole company. */
export function bookText(initiative: Pick<DoingInitiative, 'for'>, readerId: number): string {
  const book = initiative.for;
  if (!book) return DO.WHOLE_COMPANY;
  if (book.dimension !== 'owner') return book.label;
  return book.member === String(readerId) ? DO.YOUR_BOOK : `${book.label}'s book`;
}

export function progressFigures(p: InitiativeProgress, currency: CurrencyCode): { baseline: string; now: string; target: string } {
  const unit = p.unit ?? 'count';
  return { baseline: valueText(unit, p.baseline, currency), now: valueText(unit, p.current, currency), target: valueText(unit, p.target, currency) };
}

/** A figure and the words after it, so only the figure is set in DM Mono. */
export interface Counted {
  n: number;
  words: string;
}

export function daysLeftParts(daysLeft: number, status: InitiativeStatus): Counted | null {
  if (isClosed(status)) return null;
  const n = Math.abs(daysLeft);
  return { n, words: `${n === 1 ? 'day' : 'days'} ${daysLeft < 0 ? 'overdue' : 'left'}` };
}

export function workText(work: { open: number; done: number }): string {
  return `${work.open} open · ${work.done} done`;
}

export function milestonesText(m: { done: number; total: number }): string {
  return `${m.done} of ${m.total} milestones`;
}

export interface FigurePart {
  label: 'Health' | 'ARR';
  then: string;
  now: string;
}

/** Health and ARR then → now (Decision 4); null before figures were kept. A
 *  figure missing on one side reads "not recorded"; on both, it is left out. */
export function thenNowParts(plan: Pick<DoingPlan, 'then' | 'now'>, currency: CurrencyCode): FigurePart[] | null {
  const then = plan.then;
  if (!then) return null;
  const parts: FigurePart[] = [];
  const show = (value: number | null, money: boolean) =>
    value === null ? DO.NOT_RECORDED : money ? formatCompactMoney(value, currency) : String(Math.round(value));
  if (then.health_score !== null || plan.now.health_score !== null) {
    parts.push({ label: 'Health', then: show(then.health_score, false), now: show(plan.now.health_score, false) });
  }
  if (then.arr !== null || plan.now.arr !== null) {
    parts.push({ label: 'ARR', then: show(then.arr, true), now: show(plan.now.arr, true) });
  }
  return parts;
}

export function thenNowText(plan: Pick<DoingPlan, 'then' | 'now'>, currency: CurrencyCode): string {
  const parts = thenNowParts(plan, currency);
  if (parts === null) return DO.BEFORE_FIGURES;
  if (parts.length === 0) return DO.NO_FIGURES;
  return parts.map((p) => `${p.label} ${p.then} → ${p.now}`).join(' · ');
}

const PAUSED_SHORT: Record<Exclude<PausedReason, ''>, string> = {
  segment_gone: 'its segment was deleted',
  segment_not_owned: "its segment isn't its owner's",
  owner_inactive: 'its owner is inactive',
  template_gone: 'its survey template was deleted',
  campaign_gone: 'its campaign was deleted',
};

export function ruleStatusText(rule: Pick<DoingRule, 'is_active' | 'paused_reason'>): string {
  if (rule.is_active) return 'On';
  return rule.paused_reason ? `Paused: ${PAUSED_SHORT[rule.paused_reason]}` : 'Off';
}

export interface RunParts {
  on: string;
  parts: { label: 'fired' | 'matched' | 'skipped'; n: number }[];
}

/** The last run's counts: fired for everyone, matched and skipped for the owner (Decision 5). */
export function lastRunParts(rule: Pick<DoingRule, 'last_run'>): RunParts | null {
  const run = rule.last_run;
  if (!run) return null;
  const parts: RunParts['parts'] = [{ label: 'fired', n: run.fired }];
  if (run.matched !== undefined) parts.push({ label: 'matched', n: run.matched });
  if (run.skipped !== undefined) parts.push({ label: 'skipped', n: run.skipped });
  return { on: dayOf(run.run_on), parts };
}

export function lastRunText(rule: Pick<DoingRule, 'last_run'>): string {
  const run = lastRunParts(rule);
  if (!run) return DO.NOT_RUN;
  return `Last run ${run.on}: ${run.parts.map((p) => `${p.label} ${p.n}`).join(' · ')}`;
}

export const segmentText = (rule: Pick<DoingRule, 'segment'>): string => rule.segment ?? DO.NO_SEGMENT;
/** Contract note 11: only the reader's own rule is known to be readable. */
export const ruleHref = (rule: Pick<DoingRule, 'id' | 'mine'>): string | null => (rule.mine ? `/scenarios/rules/${rule.id}` : null);
/** Contract note 10: a plan's own page. */
export const planHref = (plan: Pick<DoingPlan, 'id'>): string => `/projects/${plan.id}`;

export function initiativesEmpty(scope: ScopeKey): string {
  if (scope === 'me') return 'No initiatives on your book yet.';
  return scope === 'team' ? "No initiatives on your team's book yet." : 'No initiatives yet.';
}

export function hiddenPlansText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 more plan on a record you can't open" : `${n} more plans on records you can't open`;
}

/** "Whose book" (Contract note 4): the reader, then everyone below them by name. */
export function bookPeople(members: DeskMember[], reader: WaitingPerson): DeskMember[] {
  const below: DeskMember[] = [];
  let frontier = [reader.id];
  while (frontier.length > 0) {
    const next = members.filter((m) => m.reports_to !== null && frontier.includes(m.reports_to.id) && !below.includes(m));
    below.push(...next);
    frontier = next.map((m) => m.id);
  }
  const me = members.find((m) => m.id === reader.id) ?? { ...reader, reports_to: null };
  return [me, ...below.sort((a, b) => a.name.localeCompare(b.name))];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/features/brain/doingText.test.ts && npx tsc -b --noEmit`
Expected: PASS, 10 tests; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/brain/brainTypes.ts src/features/brain/doingText.ts src/features/brain/doingText.test.ts
git commit -m "feat(brain): What's being done contract types and copy

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The API and the stateful contract stub

Spec §3 (shapes, 400 before 403, Company refused on `POST initiatives/`), §1.3 (who may start and edit, the two sentences), Decision 2 (who is in each scope's initiatives); Contract notes 1, 3, 4, 7–9.

**Files:**
- Modify: `src/features/brain/brainApi.ts`
- Create: `src/features/brain/testDoingFixtures.ts`
- Modify: `src/features/brain/testBrain.ts`
- Modify: `src/pages/rules/testPages.tsx` (`makeRulesStore` takes the user)
- Modify: `src/pages/brain/testPages.tsx` (`renderBrain` takes the user)
- Test: `src/features/brain/testBrain.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's types and `OWNER_CUT_METRICS`; `ALICE`, `CARL`, `DANA` (`testWaitingFixtures`); `MetricsPayload`, `SlicePayload` (types, `features/metrics/metricsSlice`).
- Produces:
  - `brainApi.ts`: `fetchDoing(scope): Promise<DoingPayload>`, `startInitiative(scope: 'me' | 'team', body: BookInitiativeWrite): Promise<DoingInitiative>`, `editInitiative(id, patch: InitiativePatch): Promise<DoingInitiative>`, `createCompanyInitiative(body: InitiativeWrite): Promise<{ id: number }>`, `fetchMembers(): Promise<DeskMember[]>`, `fetchMetricList(): Promise<MetricsPayload>`, `fetchMetricCut(metric, dimension): Promise<SlicePayload>`.
  - `testDoingFixtures.ts`: `BOB`, `MEMBERS`, `ALICE_INITIATIVE` (id 1), `CARL_INITIATIVE` (id 3), `COMPANY_INITIATIVE` (id 4), `DANA_INITIATIVE` (id 5), `CARL_PLAN` (8), `ALICE_PLAN` (9), `DANA_PLAN` (10), `MY_DOING_RULE` (3), `CARL_DOING_RULE` (6), `DANA_DOING_RULE` (8), `DoingRest`, `DOING_REST`, `DoingWorld`, `doingWorld(initiatives?)`, `STARTING_VALUE`, `METRIC_LIST`, `BOOK_BODY`, `COMPANY_BODY`, `FIRST_NEW_ID` (100).
  - `stubBrain` options `reader`, `viewAll`, `world`, `doing`, `failDoing`, `refuseNextInitiative`, `members`, `failMembers`; `bodies(spy, method, part): unknown[]`.
  - `makeRulesStore(role, who?: { id: number; name: string })`; `renderBrain(url, { …, user?: { id: number; name: string } })`.

- [ ] **Step 1: Write the failing tests**

In `src/features/brain/testBrain.test.ts`, add to the `./brainApi` import: `createCompanyInitiative`, `editInitiative`, `fetchDoing`, `fetchMembers`, `fetchMetricCut`, `fetchMetricList`, `startInitiative`. Change `import { requests, stubBrain } from './testBrain';` to `import { bodies, requests, stubBrain } from './testBrain';` and add:

```ts
import { ALICE_PLAN, BOOK_BODY, COMPANY_BODY, doingWorld, FIRST_NEW_ID, MEMBERS } from './testDoingFixtures';
import { ALICE, CARL } from './testWaitingFixtures';
```

(`testWaitingFixtures` is already imported for `DANA_RULE_REVIEW`, `deskOf`, `GENERATED_PROPOSAL`, `TEAM_WAITING`: add `ALICE` and `CARL` to that import instead of a second line.) Append:

```ts
describe('What’s being done on the contract stub (Doing §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads each scope’s initiatives, plans and rules for Alice (Decision 2)', async () => {
    const { spy } = stubBrain();
    const me = await fetchDoing('me');
    expect(me.initiatives.map((i) => i.id)).toEqual([1]);
    expect(me.plans).toEqual([ALICE_PLAN]);
    expect((await fetchDoing('team')).initiatives.map((i) => i.id)).toEqual([1, 3]);
    const company = await fetchDoing('company');
    expect(company.initiatives.map((i) => i.id)).toEqual([1, 3, 4, 5]);
    expect(company.hidden).toBe(2);
    expect(requests(spy, 'GET', '/brain/doing/')).toEqual(['/brain/doing/?scope=me', '/brain/doing/?scope=team', '/brain/doing/?scope=company']);
  });

  it('answers an unknown scope 400 before a refused one 403, and refuses a Company start (§3)', async () => {
    const { revoke } = stubBrain();
    revoke('team');
    expect((await refusal(fetchDoing('everything' as never)))?.status).toBe(400);
    expect(isScopeRefusal(await refusal(fetchDoing('team')))).toBe(true);
    expect(isScopeRefusal(await refusal(startInitiative('company' as never, BOOK_BODY)))).toBe(true);
  });

  it('starts an initiative on the reader’s own book, and their manager sees it in My team (Decision 3)', async () => {
    const world = doingWorld();
    const { spy } = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, world });
    const made = await startInitiative('me', BOOK_BODY);
    expect(made).toMatchObject({
      id: FIRST_NEW_ID, for: { dimension: 'owner', member: '5', label: 'Carl CSM' }, owner: CARL, can_edit: true, metric_label: 'ARR at risk',
    });
    expect(bodies(spy, 'POST', '/brain/initiatives/')).toEqual([BOOK_BODY]);
    vi.unstubAllGlobals();
    stubBrain({ reader: ALICE, offered: ['me', 'team'], viewAll: false, world });
    expect((await fetchDoing('team')).initiatives.find((i) => i.id === made.id)?.can_edit).toBe(true);
    expect((await fetchDoing('me')).initiatives.some((i) => i.id === made.id)).toBe(false);
  });

  it('refuses a metric with no owner cut and a book outside the team, in the server’s words (§1.3)', async () => {
    stubBrain({ offered: ['me', 'team'] });
    expect((await refusal(startInitiative('me', { ...BOOK_BODY, metric: 'active_customers' })))?.message).toBe(
      "That number can't be tracked for one person's book.",
    );
    expect((await refusal(startInitiative('team', { ...BOOK_BODY, for_user: 7 })))?.status).toBe(400);
    expect((await startInitiative('team', { ...BOOK_BODY, for_user: 5 })).for?.label).toBe('Carl CSM');
  });

  it('lets the owner, anyone above them and view_all edit; 403 otherwise (§1.3)', async () => {
    stubBrain({ offered: ['me', 'team'], viewAll: false });
    expect((await editInitiative(3, { title: 'Renamed' })).title).toBe('Renamed');
    const refused = await refusal(editInitiative(5, { status: 'abandoned' }));
    expect(refused?.status).toBe(403);
    expect(refused?.message).toBe("You can't change this initiative.");
  });

  it('starts a Company initiative through /metrics/initiatives/, for view_all only (Contract note 8)', async () => {
    const { spy } = stubBrain();
    const { id } = await createCompanyInitiative(COMPANY_BODY);
    expect((await fetchDoing('company')).initiatives.find((i) => i.id === id)).toMatchObject({
      for: { dimension: 'owner', member: '5', label: 'Carl CSM' }, owner: CARL,
    });
    expect(bodies(spy, 'POST', '/metrics/initiatives/')).toEqual([COMPANY_BODY]);
    vi.unstubAllGlobals();
    stubBrain({ offered: ['me'] });
    expect((await refusal(createCompanyInitiative(COMPANY_BODY)))?.status).toBe(403);
  });

  it('lists the members, the metrics and one cut (Contract notes 4, 8)', async () => {
    stubBrain();
    expect(await fetchMembers()).toEqual(MEMBERS);
    expect((await fetchMetricList()).metrics.map((m) => m.key)).toEqual(['at_risk_arr', 'nrr', 'active_customers']);
    expect((await fetchMetricCut('at_risk_arr', 'owner')).members.map((m) => m.label)).toEqual(['Alice Admin', 'Bob Lead', 'Carl CSM', 'Dana CSM']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/brain/testBrain.test.ts`
Expected: FAIL (`Failed to resolve import "./testDoingFixtures"`).

- [ ] **Step 3: Add the API wrappers**

In `src/features/brain/brainApi.ts`, add to the `./brainTypes` type import: `BookInitiativeWrite`, `DeskMember`, `DoingInitiative`, `DoingPayload`, `InitiativePatch`, `InitiativeWrite`; add `import type { MetricsPayload, SlicePayload } from '../metrics/metricsSlice';`. Append after `askAgent`:

```ts
// What's being done (Doing spec §3; Contract notes 1, 7–9).
export const fetchDoing = (scope: ScopeKey) => apiFetch<DoingPayload>(scoped('doing/', scope));
/** Me or My team only; Company starts go through createCompanyInitiative. */
export const startInitiative = (scope: Exclude<ScopeKey, 'company'>, body: BookInitiativeWrite) =>
  apiFetch<DoingInitiative>(scoped('initiatives/', scope), { method: 'POST', body });
export const editInitiative = (id: number, patch: InitiativePatch) =>
  apiFetch<DoingInitiative>(`${BASE}initiatives/${id}/`, { method: 'PATCH', body: patch });
/** The existing Company route (view_all_accounts); only the new id is read. */
export const createCompanyInitiative = (body: InitiativeWrite) => apiFetch<{ id: number }>('/metrics/initiatives/', { method: 'POST', body });
/** Every member, with whom they report to (Contract note 4). */
export const fetchMembers = () => apiFetch<DeskMember[]>('/auth/members/');
/** view_all_accounts: the Company form's metrics and cuts. */
export const fetchMetricList = () => apiFetch<MetricsPayload>('/metrics/');
export const fetchMetricCut = (metric: string, dimension: string) => apiFetch<SlicePayload>(`/metrics/${metric}/by/${dimension}/`);
```

- [ ] **Step 4: Write the fixtures**

Create `src/features/brain/testDoingFixtures.ts`:

```ts
// Test-only: §3-shaped "What's being done" on 5 Oct 2026. Alice (1)
// manages Carl (5); Bob (2) manages Dana (7). Initiatives live in one
// mutable world the stub filters per reader and scope (spec Decision 2), so
// a second reader sees what the first started; plans, rules and `hidden`
// are fixed per scope, in the server's order (open first, then the last 30
// days' done). Names are people, plans, rules and records, never personal data.
import type { MetricsPayload } from '../metrics/metricsSlice';
import type {
  BookInitiativeWrite,
  DeskMember,
  DoingInitiative,
  DoingPayload,
  DoingPlan,
  DoingRule,
  InitiativeWrite,
  ScopeKey,
} from './brainTypes';
import { ALICE, CARL, DANA } from './testWaitingFixtures';

export const BOB = { id: 2, name: 'Bob Lead' };
export const FIRST_NEW_ID = 100;

export const MEMBERS: DeskMember[] = [
  { id: 1, name: 'Alice Admin', reports_to: null },
  { id: 2, name: 'Bob Lead', reports_to: null },
  { id: 5, name: 'Carl CSM', reports_to: { id: 1, name: 'Alice Admin' } },
  { id: 7, name: 'Dana CSM', reports_to: { id: 2, name: 'Bob Lead' } },
];

export const ALICE_INITIATIVE: DoingInitiative = {
  id: 1, title: 'Fewer customers in poor health', metric: 'poor_health_count', metric_label: 'Customers in poor health',
  for: { dimension: 'owner', member: '1', label: 'Alice Admin' }, status: 'active', owner: ALICE, target_by: '2026-12-31',
  progress: { baseline: 6, current: 5, target: 2, progress_pct: 25, days_left: 87, direction: 'down', unit: 'count', better: 'down' },
  work: { open: 0, done: 0, tasks: [] }, hypothesis: 'Weekly check-ins lift health.', outcome: '', can_edit: true,
};

export const CARL_INITIATIVE: DoingInitiative = {
  id: 3, title: 'Halve ARR at risk on Analytics Suite', metric: 'at_risk_arr', metric_label: 'ARR at risk',
  for: { dimension: 'owner', member: '5', label: 'Carl CSM' }, status: 'active', owner: CARL, target_by: '2026-11-30',
  progress: { baseline: 64100, current: 52000, target: 32000, progress_pct: 37.7, days_left: 56, direction: 'down', unit: 'money', better: 'down' },
  work: {
    open: 1,
    done: 1,
    tasks: [
      { id: 21, title: 'Save play: Pizza Hut', parent_name: 'Pizza Hut', parent_type: 'customer', parent_id: 6, assignee_name: 'Carl CSM', due_date: '2026-10-20', priority: 'high', status: 'pending' },
      { id: 20, title: 'Usage review', parent_name: 'Uber EMEA', parent_type: 'account', parent_id: 12, assignee_name: 'Carl CSM', due_date: '2026-09-25', priority: 'medium', status: 'completed' },
    ],
  },
  hypothesis: 'Save plays on the two renewals halve the risk.', outcome: '', can_edit: true,
};

export const COMPANY_INITIATIVE: DoingInitiative = {
  id: 4, title: 'Lift NRR to 110%', metric: 'nrr', metric_label: 'Net revenue retention', for: null, status: 'planned',
  owner: null, target_by: '2026-12-31',
  progress: { baseline: 104, current: 104, target: 110, progress_pct: 0, days_left: 87, direction: 'up', unit: 'percent', better: 'up' },
  work: { open: 0, done: 0, tasks: [] }, hypothesis: '', outcome: '', can_edit: true,
};

export const DANA_INITIATIVE: DoingInitiative = {
  id: 5, title: "Clear Dana's at-risk book", metric: 'at_risk_arr', metric_label: 'ARR at risk',
  for: { dimension: 'owner', member: '7', label: 'Dana CSM' }, status: 'done', owner: DANA, target_by: '2026-09-30',
  progress: { baseline: 20000, current: 0, target: 0, progress_pct: 100, days_left: -5, direction: 'down', unit: 'money', better: 'down' },
  work: { open: 0, done: 2, tasks: [] }, hypothesis: '', outcome: 'Both renewals saved.', can_edit: true,
};

export const CARL_PLAN: DoingPlan = {
  id: 8, name: 'Renewal save play', status: 'at_risk', record: { type: 'customer', id: 6, name: 'Pizza Hut' }, owner: CARL,
  target_date: '2026-11-01', milestones: { done: 1, total: 4 },
  then: { health_score: 48, arr: 69600, taken_on: '2026-09-20' }, now: { health_score: 55, arr: 69600 },
};

/** Started before starting figures were kept (spec Decision 4). */
export const ALICE_PLAN: DoingPlan = {
  id: 9, name: 'Onboarding', status: 'on_track', record: { type: 'account', id: 12, name: 'Uber EMEA' }, owner: ALICE,
  target_date: '2026-10-30', milestones: { done: 3, total: 5 }, then: null, now: { health_score: 71, arr: 44000 },
};

export const DANA_PLAN: DoingPlan = {
  id: 10, name: 'QBR prep', status: 'done', record: { type: 'customer', id: 3, name: 'Uber' }, owner: DANA,
  target_date: null, milestones: { done: 2, total: 2 },
  then: { health_score: 62, arr: 40000, taken_on: '2026-09-01' }, now: { health_score: 71, arr: 44000 },
};

export const MY_DOING_RULE: DoingRule = {
  id: 3, name: 'Detractor follow-up', segment: 'Detractors', is_active: true, paused_reason: null, mine: true,
  last_run: { run_on: '2026-10-05', fired: 4, matched: 12, skipped: 2 },
};
export const CARL_DOING_RULE: DoingRule = {
  id: 6, name: 'Renewal nudge', segment: 'Renewals in 90 days', is_active: false, paused_reason: 'segment_gone', mine: false,
  last_run: { run_on: '2026-10-04', fired: 1 },
};
export const DANA_DOING_RULE: DoingRule = {
  id: 8, name: 'Win-back watch', segment: null, is_active: true, paused_reason: null, mine: false, last_run: null,
};

export type DoingRest = Pick<DoingPayload, 'plans' | 'rules' | 'hidden'>;
export const DOING_REST: Record<ScopeKey, DoingRest> = {
  me: { plans: [ALICE_PLAN], rules: [MY_DOING_RULE], hidden: 0 },
  team: { plans: [CARL_PLAN, ALICE_PLAN], rules: [MY_DOING_RULE, CARL_DOING_RULE], hidden: 0 },
  company: { plans: [CARL_PLAN, ALICE_PLAN, DANA_PLAN], rules: [MY_DOING_RULE, CARL_DOING_RULE, DANA_DOING_RULE], hidden: 2 },
};

export interface DoingWorld {
  initiatives: DoingInitiative[];
  nextId: number;
}

/** A fresh, mutable world; copies, so a test never changes the fixtures. */
export function doingWorld(initiatives: DoingInitiative[] = [ALICE_INITIATIVE, CARL_INITIATIVE, COMPANY_INITIATIVE, DANA_INITIATIVE]): DoingWorld {
  return { initiatives: initiatives.map((one) => ({ ...one })), nextId: FIRST_NEW_ID };
}

/** The baseline a new initiative captures, per metric. */
export const STARTING_VALUE: Record<string, number> = {
  at_risk_arr: 52000, forecast_arr: 300000, nrr: 104, healthy_share: 60, poor_health_count: 3, active_customers: 40,
};

export const METRIC_LIST: MetricsPayload = {
  as_of: '2026-10-05',
  currency: 'USD',
  metrics: [
    { key: 'at_risk_arr', label: 'ARR at risk', unit: 'money', better: 'down', note: '', value: 114540, previous: null, change: null, dimensions: ['owner', 'product'] },
    { key: 'nrr', label: 'Net revenue retention', unit: 'percent', better: 'up', note: '', value: 104, previous: null, change: null, dimensions: ['owner', 'product'] },
    { key: 'active_customers', label: 'Active customers', unit: 'count', better: 'none', note: '', value: 40, previous: null, change: null, dimensions: ['segment', 'lifecycle'] },
  ],
};

export const BOOK_BODY: BookInitiativeWrite = {
  title: 'Halve ARR at risk on my book', hypothesis: 'Save plays on the two renewals.', metric: 'at_risk_arr',
  target_value: '26000', target_by: '2026-11-30', status: 'active',
};

export const COMPANY_BODY: InitiativeWrite = {
  title: "Cut Carl's ARR at risk", hypothesis: '', metric: 'at_risk_arr', dimension: 'owner', member: '5',
  target_value: '30000', target_by: '2026-12-31', owner_id: 5,
};
```

- [ ] **Step 5: Teach the stub `doing/`, `initiatives/`, members, metrics**

In `src/features/brain/testBrain.ts`:

1. Extend the header comment's first sentence to name "and What's being done (Doing §3), with the initiative starts and edits it sends".
2. Add to the `./brainTypes` import: `BookInitiativeWrite`, `DeskMember`, `DoingInitiative`, `InitiativePatch`, `InitiativeWrite`, `WaitingPerson`. Add:

```ts
import { OWNER_CUT_METRICS } from './doingText';
import { DOING_REST, doingWorld, MEMBERS, METRIC_LIST, STARTING_VALUE, type DoingRest, type DoingWorld } from './testDoingFixtures';
import { ALICE } from './testWaitingFixtures';
```

(merge `ALICE` into the existing `./testWaitingFixtures` import.)

3. Add to `BrainStub`:

```ts
  /** Who is reading (Doing Decision 2, §1.3). Default ALICE (id 1, the store's user). */
  reader?: WaitingPerson;
  /** Whether the reader holds view_all_accounts. Default: Company is offered. */
  viewAll?: boolean;
  /** Initiatives, shared between stubs so a second reader sees the first's. Default: a fresh doingWorld(). */
  world?: DoingWorld;
  /** Plans, rules and hidden by scope. Default DOING_REST. */
  doing?: Partial<Record<ScopeKey, DoingRest>>;
  /** How many doing/ reads fail (500) first. */
  failDoing?: number;
  /** The next initiative start or edit answers this instead, once. */
  refuseNextInitiative?: { status: number; body: unknown };
  /** GET /auth/members/. Default MEMBERS. */
  members?: DeskMember[];
  /** How many /auth/members/ reads fail (500) first. */
  failMembers?: number;
```

4. Inside `stubBrain`, after the Waiting state (after `const itemKey = …`), add:

```ts
  const reader = stub.reader ?? ALICE;
  const viewAll = stub.viewAll ?? offered.has('company');
  const world = stub.world ?? doingWorld();
  const members = stub.members ?? MEMBERS;
  const rest: Record<ScopeKey, DoingRest> = { ...DOING_REST, ...stub.doing };
  let failDoing = stub.failDoing ?? 0;
  let failMembers = stub.failMembers ?? 0;
  let initiativeRefusal = stub.refuseNextInitiative ?? null;
  const FORBIDDEN = { detail: 'You do not have permission to perform this action.' };

  /** Everyone below `id` through reports_to. */
  function below(id: number): Set<number> {
    const out = new Set<number>();
    let frontier = [id];
    while (frontier.length > 0) {
      const next = members.filter((m) => m.reports_to !== null && frontier.includes(m.reports_to.id) && !out.has(m.id)).map((m) => m.id);
      next.forEach((n) => out.add(n));
      frontier = next;
    }
    return out;
  }
  const deskOf = (scope: ScopeKey) => new Set(scope === 'me' ? [reader.id] : [reader.id, ...below(reader.id)]);
  /** §1.3: the owner, anyone above them, or view_all_accounts. */
  const canEdit = (one: DoingInitiative) => viewAll || (one.owner !== null && (one.owner.id === reader.id || below(reader.id).has(one.owner.id)));
  const asSeen = (one: DoingInitiative): DoingInitiative => ({ ...one, can_edit: canEdit(one) });
  /** Decision 2: owned by, or cut to, someone on the desk; Company sees all. */
  function initiativesIn(scope: ScopeKey): DoingInitiative[] {
    if (scope === 'company') return world.initiatives.map(asSeen);
    const desk = deskOf(scope);
    return world.initiatives
      .filter((one) => (one.owner !== null && desk.has(one.owner.id)) || (one.for?.dimension === 'owner' && desk.has(Number(one.for.member))))
      .map(asSeen);
  }
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? (id === reader.id ? reader.name : `Member ${id}`);
  function refusedInitiative() {
    if (!initiativeRefusal) return null;
    const answer = json(initiativeRefusal.status, initiativeRefusal.body);
    initiativeRefusal = null;
    return answer;
  }

  /** POST initiatives/?scope=me|team (§1.3). */
  async function startOnBook(scope: ScopeKey, body: BookInitiativeWrite) {
    await gate;
    const refused = refusedInitiative();
    if (refused) return refused;
    const metric = OWNER_CUT_METRICS.find((m) => m.key === body.metric);
    if (!metric) return json(400, { detail: "That number can't be tracked for one person's book." });
    const forId = scope === 'team' ? (body.for_user ?? reader.id) : reader.id;
    if (!deskOf(scope).has(forId)) return json(400, { for_user: ['Choose yourself or someone on your team.'] });
    const baseline = STARTING_VALUE[metric.key];
    const target = Number(body.target_value);
    const person = { id: forId, name: nameOf(forId) };
    const made: DoingInitiative = {
      id: world.nextId++, title: body.title, metric: metric.key, metric_label: metric.label,
      for: { dimension: 'owner', member: String(forId), label: person.name }, status: body.status, owner: person, target_by: body.target_by,
      progress: { baseline, current: baseline, target, progress_pct: 0, days_left: 56, direction: target < baseline ? 'down' : 'up', unit: metric.unit, better: metric.better },
      work: { open: 0, done: 0, tasks: [] }, hypothesis: body.hypothesis, outcome: '', can_edit: true,
    };
    world.initiatives.unshift(made);
    return json(201, asSeen(made));
  }

  /** POST /metrics/initiatives/ (Contract note 8): view_all_accounts only. */
  async function startForCompany(body: InitiativeWrite) {
    await gate;
    if (!viewAll) return json(403, FORBIDDEN);
    const refused = refusedInitiative();
    if (refused) return refused;
    const metric = METRIC_LIST.metrics.find((m) => m.key === body.metric);
    if (!metric) return json(400, { metric: [`No metric called '${body.metric}'.`] });
    const baseline = STARTING_VALUE[metric.key] ?? 0;
    const target = Number(body.target_value);
    const label = body.dimension === 'owner' ? nameOf(Number(body.member)) : 'Analytics Suite';
    const made: DoingInitiative = {
      id: world.nextId++, title: body.title, metric: metric.key, metric_label: metric.label,
      for: body.dimension ? { dimension: body.dimension, member: body.member, label } : null, status: 'active',
      owner: body.owner_id === null ? null : { id: body.owner_id, name: nameOf(body.owner_id) }, target_by: body.target_by,
      progress: { baseline, current: baseline, target, progress_pct: 0, days_left: 87, direction: target < baseline ? 'down' : 'up', unit: metric.unit, better: metric.better },
      work: { open: 0, done: 0, tasks: [] }, hypothesis: body.hypothesis, outcome: '', can_edit: true,
    };
    world.initiatives.unshift(made);
    return json(201, { id: made.id, title: made.title });
  }

  /** PATCH initiatives/<id>/ (§1.3): 404, then 403, then the queued refusal. */
  async function editOne(id: number, patch: InitiativePatch) {
    await gate;
    const one = world.initiatives.find((i) => i.id === id);
    if (!one) return json(404, { detail: 'Not found.' });
    if (!canEdit(one)) return json(403, { detail: "You can't change this initiative." });
    const refused = refusedInitiative();
    if (refused) return refused;
    const { target_value: targetValue, ...fields } = patch;
    Object.assign(one, fields);
    if (targetValue !== undefined) one.progress = { ...one.progress, target: Number(targetValue) };
    return json(200, asSeen(one));
  }

  const sliceOf = (metric: string, dimension: string) => {
    const known = METRIC_LIST.metrics.find((m) => m.key === metric);
    const rows = dimension === 'owner' ? members.map((m) => ({ member: String(m.id), label: m.name })) : [{ member: '4', label: 'Analytics Suite' }];
    return {
      metric: known, dimension: { key: dimension, label: dimension }, currency: 'USD',
      members: rows.map((m) => ({ ...m, value: null, previous: null, change: null })),
    };
  };
  const bodyOf = (init?: RequestInit) => (init?.body ? JSON.parse(String(init.body)) : {});
```

5. In `spy`, directly after the `/knowledge/activity/` line, add:

```ts
    if (full === '/auth/members/' && method === 'GET') {
      if (failMembers > 0) { failMembers -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, members);
    }
    if (full === '/metrics/' && method === 'GET') return viewAll ? json(200, METRIC_LIST) : json(403, FORBIDDEN);
    const cut = /^\/metrics\/([^/]+)\/by\/([^/]+)\/$/.exec(full);
    if (cut && method === 'GET') return viewAll ? json(200, sliceOf(cut[1], cut[2])) : json(403, FORBIDDEN);
    if (full === '/metrics/initiatives/' && method === 'POST') return startForCompany(bodyOf(init) as InitiativeWrite);
```

6. After `const path = url.pathname.replace(/^\/api\/v1\/brain/, '');`, add the scope-less PATCH:

```ts
    const edit = /^\/initiatives\/(\d+)\/$/.exec(path);
    if (edit && method === 'PATCH') return editOne(Number(edit[1]), bodyOf(init) as InitiativePatch);
```

7. Widen the route regex to `/^\/(changed|brief|waiting|doing|initiatives|explanations\/([^/]+))\/$/` and, after the `waiting` branch, add:

```ts
    if (route[1] === 'doing' && method === 'GET') {
      if (failDoing > 0) { failDoing -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, { scope, currency: 'USD', ...rest[scope], initiatives: initiativesIn(scope) });
    }

    if (route[1] === 'initiatives' && method === 'POST') {
      // §3: Company starts use /metrics/initiatives/.
      if (scope === 'company') return json(403, SCOPE_NOT_ALLOWED);
      return startOnBook(scope, bodyOf(init) as BookInitiativeWrite);
    }
```

8. After `requests`, append:

```ts
/** The JSON bodies of every `method` request whose path contains `part`. */
export function bodies(spy: ReturnType<typeof vi.fn>, method: string, part: string): unknown[] {
  return spy.mock.calls
    .filter(([input, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method && new URL(String(input)).pathname.includes(part))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}
```

- [ ] **Step 6: Let the test store and `renderBrain` take the signed-in user**

In `src/pages/rules/testPages.tsx`, change the signature and the two user fields:

```ts
export function makeRulesStore(role: Role = 'admin', who: { id: number; name: string } = { id: 1, name: 'Alice' }) {
```

```ts
        user: {
          id: who.id,
          email: 'alice@acme.io',
          name: who.name,
```

and the doc comment's first line to "The real slices … The signed-in user is Alice (id 1, testSegments' ME) of "Acme Inc" unless `who` names another;". In `src/pages/brain/testPages.tsx`:

```ts
export function renderBrain(
  url: string,
  {
    width = 1440,
    role = 'admin',
    nav = false,
    waitingLink = false,
    user,
  }: { width?: number; role?: Role; nav?: boolean; waitingLink?: boolean; user?: { id: number; name: string } } = {},
) {
  setViewport(width);
  const store = makeRulesStore(role, user);
```

and its comment: "The signed-in user is Alice (id 1) unless `user` names another (Doing: a CSM, then their manager)."

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/brain/testBrain.test.ts && npx tsc -b --noEmit`
Expected: PASS (the earlier cases and the 7 new ones); no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/features/brain/brainApi.ts src/features/brain/testDoingFixtures.ts src/features/brain/testBrain.ts src/features/brain/testBrain.test.ts src/pages/rules/testPages.tsx src/pages/brain/testPages.tsx
git commit -m "feat(brain): What's being done API and contract stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The initiative forms, moved off the old page and shared

Spec §2.1 ("opens the existing initiative form, limited to metrics with an owner cut outside Company"; "Edit and close"), Decision 3, §1.3; Contract notes 3, 4, 7–9; plan Decisions 4, 6.

The old `NewInitiativeForm` (`src/pages/brain/Initiatives.tsx`) read its metrics and cuts through Redux and its members through `apiFetch`. It moves here with its fields and order unchanged, reading through `brainApi` instead (Decision 1), and gains a book mode. The inline edit and close forms live in the same file so the row (Task 4) shares its input style. The old page itself is deleted in Task 7.

**Files:**
- Create: `src/components/brain/InitiativeForm.tsx`
- Test: `src/components/brain/InitiativeForm.test.tsx`

**Interfaces:**
- Consumes: `createCompanyInitiative`, `startInitiative`, `fetchMembers`, `fetchMetricList`, `fetchMetricCut` (Task 2); `DO`, `OWNER_CUT_METRICS`, `bookPeople` (Task 1); `planErrors`, `NO_ERRORS`, `PlanErrors` (`features/plans/planErrors`); `useSubmitOnce`; `BUTTON`, `PRIMARY`, `QUIET`, `FOCUS` (portfolio `styles`).
- Produces:
  - `InitiativeFormProps = { onSaved: (id: number) => void; onCancel: () => void } & ({ mode: 'company' } | { mode: 'book'; scope: 'me' | 'team'; reader: WaitingPerson })`
  - `InitiativeForm(props)`: a `<form aria-label="New initiative">`.
  - `EditInitiativeForm({ initiative, busy, onSave(patch: InitiativePatch), onCancel })`: `<form aria-label="Edit initiative">`.
  - `CloseInitiativeForm({ as: 'done' | 'abandoned', busy, onClose(outcome: string), onCancel })`.

- [ ] **Step 1: Write the failing test**

Create `src/components/brain/InitiativeForm.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DO, OWNER_CUT_METRICS } from '../../features/brain/doingText';
import { bodies, requests, stubBrain } from '../../features/brain/testBrain';
import { BOOK_BODY, COMPANY_BODY, FIRST_NEW_ID } from '../../features/brain/testDoingFixtures';
import { ALICE } from '../../features/brain/testWaitingFixtures';
import { InitiativeForm } from './InitiativeForm';

const form = () => screen.getByRole('form', { name: DO.NEW });
const field = (label: string) => within(form()).getByLabelText(label);
const optionsOf = (label: string) => within(field(label)).getAllByRole('option').map((o) => o.textContent);
const save = () => within(form()).getByRole('button', { name: DO.SAVE_INITIATIVE });

async function fill(body: { title: string; target_value: string; target_by: string } = BOOK_BODY) {
  await userEvent.type(field(DO.FIELD_TITLE), body.title);
  await userEvent.type(field(DO.FIELD_TARGET), body.target_value);
  fireEvent.change(field(DO.FIELD_TARGET_BY), { target: { value: body.target_by } });
}

describe('InitiativeForm (spec §2.1, Decision 3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Me: offers only owner-cut metrics, no cut, owner or whose book, and starts it once on my book', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'] });
    const onSaved = vi.fn();
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} onSaved={onSaved} onCancel={vi.fn()} />);
    expect(field(DO.FIELD_TITLE)).toHaveFocus();
    expect(optionsOf(DO.FIELD_METRIC)).toEqual(OWNER_CUT_METRICS.map((m) => m.label));
    expect(within(form()).getByText(DO.OWNER_CUT_HINT)).toBeInTheDocument();
    for (const label of [DO.FIELD_CUT, DO.FIELD_OWNER, DO.FIELD_WHOSE_BOOK]) expect(within(form()).queryByLabelText(label)).toBeNull();
    await fill();
    await userEvent.dblClick(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(FIRST_NEW_ID));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(requests(spy, 'POST', '/brain/initiatives/')).toEqual(['/brain/initiatives/?scope=me']);
    expect(bodies(spy, 'POST', '/brain/initiatives/')).toEqual([{ ...BOOK_BODY, hypothesis: '' }]);
    expect(requests(spy, 'GET', '/metrics/')).toEqual([]);
    expect(requests(spy, 'GET', '/auth/members/')).toEqual([]);
  });

  it('My team: "Whose book" offers me and the people below me, and sends who (Contract note 4)', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'] });
    render(<InitiativeForm mode="book" scope="team" reader={ALICE} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(optionsOf(DO.FIELD_WHOSE_BOOK)).toEqual(['Alice Admin', 'Carl CSM']));
    await userEvent.selectOptions(field(DO.FIELD_WHOSE_BOOK), 'Carl CSM');
    await fill();
    await userEvent.click(save());
    await waitFor(() => expect(bodies(spy, 'POST', '/brain/initiatives/')).toEqual([{ ...BOOK_BODY, hypothesis: '', for_user: 5 }]));
    expect(requests(spy, 'POST', '/brain/initiatives/')).toEqual(['/brain/initiatives/?scope=team']);
  });

  it('offers only me when the members cannot be read', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'], failMembers: 1 });
    render(<InitiativeForm mode="book" scope="team" reader={ALICE} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(requests(spy, 'GET', '/auth/members/')).toHaveLength(1));
    expect(optionsOf(DO.FIELD_WHOSE_BOOK)).toEqual(['Alice Admin']);
  });

  it('says Saving… and sends nothing more while the start is on its way', async () => {
    const { spy, releaseWrites } = stubBrain({ offered: ['me', 'team'], holdWrites: true });
    const onSaved = vi.fn();
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} onSaved={onSaved} onCancel={vi.fn()} />);
    await fill();
    await userEvent.click(save());
    const saving = within(form()).getByRole('button', { name: DO.SAVING });
    expect(saving).toBeDisabled();
    fireEvent.submit(form());
    releaseWrites();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(requests(spy, 'POST', '/brain/initiatives/')).toHaveLength(1);
  });

  it('puts a field’s refusal under it and focuses it, then lets a retry through', async () => {
    const onSaved = vi.fn();
    stubBrain({ offered: ['me', 'team'], refuseNextInitiative: { status: 400, body: { title: ['Give it a shorter title.'] } } });
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} onSaved={onSaved} onCancel={vi.fn()} />);
    await fill();
    await userEvent.click(save());
    expect(await within(form()).findByText('Give it a shorter title.')).toBeInTheDocument();
    await waitFor(() => expect(field(DO.FIELD_TITLE)).toHaveFocus());
    expect(field(DO.FIELD_TITLE)).toHaveAttribute('aria-invalid', 'true');
    expect(field(DO.FIELD_TITLE)).toHaveAccessibleDescription('Give it a shorter title.');
    await userEvent.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(FIRST_NEW_ID));
  });

  it('shows the server’s sentence at the foot of the form, focused', async () => {
    stubBrain({ offered: ['me', 'team'], refuseNextInitiative: { status: 400, body: { detail: "That number can't be tracked for one person's book." } } });
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} onSaved={vi.fn()} onCancel={vi.fn()} />);
    await fill();
    await userEvent.click(save());
    const alert = await within(form()).findByRole('alert');
    expect(alert).toHaveTextContent("That number can't be tracked for one person's book.");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('Company: the existing form, any metric, a cut and an owner, through /metrics/initiatives/ (Contract note 8)', async () => {
    const { spy } = stubBrain();
    const onSaved = vi.fn();
    render(<InitiativeForm mode="company" onSaved={onSaved} onCancel={vi.fn()} />);
    await waitFor(() => expect(optionsOf(DO.FIELD_METRIC)).toEqual(['ARR at risk', 'Net revenue retention', 'Active customers']));
    expect(optionsOf(DO.FIELD_CUT)).toEqual(['Whole company', 'By owner', 'By product']);
    expect(within(form()).queryByText(DO.OWNER_CUT_HINT)).toBeNull();
    await userEvent.selectOptions(field(DO.FIELD_CUT), 'By owner');
    await waitFor(() => expect(optionsOf('Which owner')).toContain('Carl CSM'));
    await userEvent.selectOptions(field('Which owner'), 'Carl CSM');
    await waitFor(() => expect(optionsOf(DO.FIELD_OWNER)).toContain('Carl CSM'));
    await userEvent.selectOptions(field(DO.FIELD_OWNER), 'Carl CSM');
    await fill(COMPANY_BODY);
    await userEvent.click(save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(FIRST_NEW_ID));
    expect(bodies(spy, 'POST', '/metrics/initiatives/')).toEqual([COMPANY_BODY]);
    expect(requests(spy, 'POST', '/brain/initiatives/')).toEqual([]);
  });

  it('Company: says so, and saves nothing, when the metrics cannot be read', async () => {
    stubBrain({ offered: ['company'], viewAll: false });
    render(<InitiativeForm mode="company" onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(await within(form()).findByText(DO.LOAD_METRICS)).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('Cancel hands back without sending', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'] });
    const onCancel = vi.fn();
    render(<InitiativeForm mode="book" scope="me" reader={ALICE} onSaved={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(within(form()).getByRole('button', { name: DO.CANCEL }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(requests(spy, 'POST', '/')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/brain/InitiativeForm.test.tsx`
Expected: FAIL (`Failed to resolve import "./InitiativeForm"`).

- [ ] **Step 3: Write `InitiativeForm.tsx`**

Create `src/components/brain/InitiativeForm.tsx`:

```tsx
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createCompanyInitiative, fetchMembers, fetchMetricCut, fetchMetricList, startInitiative } from '../../features/brain/brainApi';
import type { DeskMember, DoingInitiative, InitiativePatch, InitiativeWrite, WaitingPerson } from '../../features/brain/brainTypes';
import { bookPeople, DO, OWNER_CUT_METRICS } from '../../features/brain/doingText';
import type { Metric, SliceMember } from '../../features/metrics/metricsSlice';
import { NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { BUTTON, FOCUS, QUIET } from '../organizations/portfolio/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-ink aria-[invalid=true]:border-danger ${FOCUS}`;
const LABEL = 'text-[11px] font-semibold text-ink-muted';
const FIELDS = ['title', 'hypothesis', 'metric', 'dimension', 'member', 'target_value', 'target_by', 'owner_id', 'for_user'] as const;
type FieldKey = (typeof FIELDS)[number];
const CUT_LABEL: Record<string, string> = { owner: 'owner', product: 'product', segment: 'size band', lifecycle: 'lifecycle stage' };
const EMPTY: InitiativeWrite = {
  title: '', hypothesis: '', metric: OWNER_CUT_METRICS[0].key, dimension: '', member: '', target_value: '', target_by: '', owner_id: null,
};

/** Label above, the control, then a hint and the field's refusal below. */
function Labelled({ id, label, hint, error, className = '', children }: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-ink-muted">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type InitiativeFormProps = { onSaved: (id: number) => void; onCancel: () => void } & (
  | { mode: 'company' }
  | { mode: 'book'; scope: 'me' | 'team'; reader: WaitingPerson }
);

/** New initiative (spec §2.1, Decision 3), the old Initiatives page's form.
 *  Company: any metric, the whole company or one cut, any owner, through
 *  /metrics/initiatives/ (Contract note 8). A book (Me, My team): only the
 *  metrics with an owner cut, for the reader or (My team) someone below
 *  them, through /brain/initiatives/ (Contract notes 3, 4, 7). Sent once. */
export function InitiativeForm(props: InitiativeFormProps) {
  const { onSaved, onCancel } = props;
  const company = props.mode === 'company';
  const team = props.mode === 'book' && props.scope === 'team';
  const reader = props.mode === 'book' ? props.reader : null;
  const id = useId();
  const fid = (key: FieldKey) => `${id}-${key}`;
  const [form, setForm] = useState<InitiativeWrite>(EMPTY);
  const [forUser, setForUser] = useState(reader?.id ?? 0);
  const [members, setMembers] = useState<DeskMember[]>([]);
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [metricsFailed, setMetricsFailed] = useState(false);
  const [cut, setCut] = useState<{ key: string; members: SliceMember[] } | null>(null);
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const { busy, run } = useSubmitOnce({ holdOnSuccess: true });
  const titleRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!company && !team) return;
    let alive = true;
    fetchMembers().then(
      (list) => {
        if (alive) setMembers(list);
      },
      () => {
        // Contract note 4: a failed read leaves only the reader (or no owners) to choose.
      },
    );
    return () => {
      alive = false;
    };
  }, [company, team]);

  useEffect(() => {
    if (!company) return;
    let alive = true;
    fetchMetricList().then(
      (payload) => {
        if (alive) setMetrics(payload.metrics);
      },
      () => {
        if (alive) setMetricsFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [company]);

  const cutKey = form.dimension ? `${form.metric}:${form.dimension}` : null;
  useEffect(() => {
    if (!company || !form.dimension) return;
    const key = `${form.metric}:${form.dimension}`;
    let alive = true;
    fetchMetricCut(form.metric, form.dimension).then(
      (slice) => {
        if (alive) setCut({ key, members: slice.members });
      },
      () => {
        if (alive) setCut({ key, members: [] });
      },
    );
    return () => {
      alive = false;
    };
  }, [company, form.metric, form.dimension]);
  const cutMembers = cut && cut.key === cutKey ? cut.members : null;

  // A refusal takes focus: the form's sentence, else the first refused field.
  useEffect(() => {
    if (errors.form) {
      formErrorRef.current?.focus();
      return;
    }
    const first = FIELDS.find((key) => errors.field[key]);
    if (first) document.getElementById(`${id}-${first}`)?.focus();
  }, [errors, id]);

  const set = <K extends keyof InitiativeWrite>(key: K, value: InitiativeWrite[K]) => setForm((f) => ({ ...f, [key]: value }));
  const invalid = (key: FieldKey) => (errors.field[key] ? { 'aria-invalid': true as const, 'aria-describedby': `${fid(key)}-error` } : {});
  const options = company ? (metrics ?? []).map(({ key, label }) => ({ key, label })) : OWNER_CUT_METRICS;
  const dimensions = company ? (metrics?.find((m) => m.key === form.metric)?.dimensions ?? []) : [];
  const people = reader ? bookPeople(members, reader) : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors(NO_ERRORS);
    const outcome = await run((): Promise<{ id: number }> =>
      props.mode === 'company'
        ? createCompanyInitiative(form)
        : startInitiative(props.scope, {
            title: form.title,
            hypothesis: form.hypothesis,
            metric: form.metric,
            target_value: form.target_value,
            target_by: form.target_by,
            status: 'active',
            ...(props.scope === 'team' ? { for_user: forUser } : {}),
          }),
    );
    if (!outcome) return;
    if (outcome.ok) onSaved(outcome.value.id);
    else setErrors(planErrors(outcome.error, FIELDS, DO.SAVE_FAILED));
  }

  return (
    <form aria-label={DO.NEW} onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Labelled id={fid('title')} label={DO.FIELD_TITLE} error={errors.field.title} className="md:col-span-2">
          <input id={fid('title')} ref={titleRef} required value={form.title} onChange={(e) => set('title', e.target.value)} className={INPUT} {...invalid('title')} />
        </Labelled>
        <Labelled id={fid('hypothesis')} label={DO.FIELD_HYPOTHESIS} error={errors.field.hypothesis} className="md:col-span-2">
          <textarea
            id={fid('hypothesis')}
            rows={2}
            value={form.hypothesis}
            onChange={(e) => set('hypothesis', e.target.value)}
            className={`${INPUT} py-2`}
            {...invalid('hypothesis')}
          />
        </Labelled>
        <Labelled id={fid('metric')} label={DO.FIELD_METRIC} hint={company ? undefined : DO.OWNER_CUT_HINT} error={errors.field.metric}>
          <select
            id={fid('metric')}
            value={form.metric}
            onChange={(e) => setForm((f) => ({ ...f, metric: e.target.value, dimension: '', member: '' }))}
            className={INPUT}
            {...invalid('metric')}
          >
            {company && metrics === null ? <option value={form.metric}>{DO.LOADING_CHOICES}</option> : null}
            {options.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </Labelled>
        {company ? (
          <Labelled id={fid('dimension')} label={DO.FIELD_CUT} error={errors.field.dimension}>
            <select
              id={fid('dimension')}
              value={form.dimension}
              onChange={(e) => setForm((f) => ({ ...f, dimension: e.target.value, member: '' }))}
              className={INPUT}
              {...invalid('dimension')}
            >
              <option value="">{DO.WHOLE_COMPANY}</option>
              {dimensions.map((d) => (
                <option key={d} value={d}>
                  {`By ${CUT_LABEL[d] ?? d}`}
                </option>
              ))}
            </select>
          </Labelled>
        ) : null}
        {company && form.dimension ? (
          <Labelled id={fid('member')} label={`Which ${CUT_LABEL[form.dimension] ?? form.dimension}`} error={errors.field.member}>
            <select id={fid('member')} required value={form.member} onChange={(e) => set('member', e.target.value)} className={INPUT} {...invalid('member')}>
              <option value="">{cutMembers ? DO.CHOOSE : DO.LOADING_CHOICES}</option>
              {(cutMembers ?? []).map((m) => (
                <option key={m.member} value={m.member}>
                  {m.label}
                </option>
              ))}
            </select>
          </Labelled>
        ) : null}
        {team ? (
          <Labelled id={fid('for_user')} label={DO.FIELD_WHOSE_BOOK} error={errors.field.for_user}>
            <select id={fid('for_user')} value={forUser} onChange={(e) => setForUser(Number(e.target.value))} className={INPUT} {...invalid('for_user')}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Labelled>
        ) : null}
        <Labelled id={fid('target_value')} label={DO.FIELD_TARGET} error={errors.field.target_value}>
          <input
            id={fid('target_value')}
            type="number"
            step="any"
            required
            value={form.target_value}
            onChange={(e) => set('target_value', e.target.value)}
            className={INPUT}
            {...invalid('target_value')}
          />
        </Labelled>
        <Labelled id={fid('target_by')} label={DO.FIELD_TARGET_BY} error={errors.field.target_by}>
          <input id={fid('target_by')} type="date" required value={form.target_by} onChange={(e) => set('target_by', e.target.value)} className={INPUT} {...invalid('target_by')} />
        </Labelled>
        {company ? (
          <Labelled id={fid('owner_id')} label={DO.FIELD_OWNER} error={errors.field.owner_id}>
            <select
              id={fid('owner_id')}
              value={form.owner_id ?? ''}
              onChange={(e) => set('owner_id', e.target.value ? Number(e.target.value) : null)}
              className={INPUT}
              {...invalid('owner_id')}
            >
              <option value="">{DO.NO_OWNER}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Labelled>
        ) : null}
      </div>
      {metricsFailed ? <p className="text-[13px] text-danger">{DO.LOAD_METRICS}</p> : null}
      {errors.form ? (
        <p ref={formErrorRef} tabIndex={-1} role="alert" className="text-[13px] text-danger outline-none">
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || metricsFailed} className={BUTTON}>
          {busy ? DO.SAVING : DO.SAVE_INITIATIVE}
        </button>
        <button type="button" onClick={onCancel} className={QUIET}>
          {DO.CANCEL}
        </button>
      </div>
    </form>
  );
}

/** Edit an initiative in its row (plan Decision 6): flat, behind a rule. The
 *  hypothesis is offered only when the server sent one (Contract note 5). */
export function EditInitiativeForm({ initiative, busy, onSave, onCancel }: {
  initiative: DoingInitiative;
  busy: boolean;
  onSave: (patch: InitiativePatch) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(initiative.title);
  const [hypothesis, setHypothesis] = useState(initiative.hypothesis ?? '');
  const [target, setTarget] = useState(String(initiative.progress.target));
  const [targetBy, setTargetBy] = useState(initiative.target_by);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const hasHypothesis = initiative.hypothesis !== undefined;

  return (
    <form
      aria-label={DO.EDIT_FORM}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ title, target_value: target, target_by: targetBy, ...(hasHypothesis ? { hypothesis } : {}) });
      }}
      className="flex flex-col gap-3 border-t border-line pt-3"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Labelled id={`${id}-title`} label={DO.FIELD_TITLE} className="md:col-span-2">
          <input id={`${id}-title`} ref={first} required value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
        </Labelled>
        {hasHypothesis ? (
          <Labelled id={`${id}-hypothesis`} label={DO.FIELD_HYPOTHESIS} className="md:col-span-2">
            <textarea id={`${id}-hypothesis`} rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} className={`${INPUT} py-2`} />
          </Labelled>
        ) : null}
        <Labelled id={`${id}-target`} label={DO.FIELD_TARGET}>
          <input id={`${id}-target`} type="number" step="any" required value={target} onChange={(e) => setTarget(e.target.value)} className={INPUT} />
        </Labelled>
        <Labelled id={`${id}-by`} label={DO.FIELD_TARGET_BY}>
          <input id={`${id}-by`} type="date" required value={targetBy} onChange={(e) => setTargetBy(e.target.value)} className={INPUT} />
        </Labelled>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? DO.SAVING : DO.SAVE}
        </button>
        <button type="button" onClick={onCancel} className={QUIET}>
          {DO.CANCEL}
        </button>
      </div>
    </form>
  );
}

/** Close an initiative as done or abandoned, with what happened. */
export function CloseInitiativeForm({ as, busy, onClose, onCancel }: {
  as: 'done' | 'abandoned';
  busy: boolean;
  onClose: (outcome: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [outcome, setOutcome] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  return (
    <form
      aria-label={as === 'done' ? DO.CLOSE_DONE : DO.CLOSE_ABANDONED}
      onSubmit={(event) => {
        event.preventDefault();
        onClose(outcome);
      }}
      className="flex flex-col gap-3 border-t border-line pt-3"
    >
      <Labelled id={`${id}-outcome`} label={DO.WHAT_HAPPENED}>
        <textarea id={`${id}-outcome`} ref={box} rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} className={`${INPUT} py-2`} />
      </Labelled>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? DO.SAVING : as === 'done' ? DO.CLOSE_DONE : DO.CLOSE_ABANDONED}
        </button>
        <button type="button" onClick={onCancel} className={QUIET}>
          {DO.CANCEL}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/brain/InitiativeForm.test.tsx src/components/brain/houseRules.test.ts && npx tsc -b --noEmit`
Expected: PASS, 9 form tests; the existing house-rules suite (which globs `components/brain/*.tsx`) still passes with the new file (tokens, sizes 11/13 only, icons none, 44px targets through `INPUT`, `BUTTON`, `QUIET`).

- [ ] **Step 5: Commit**

```bash
git add src/components/brain/InitiativeForm.tsx src/components/brain/InitiativeForm.test.tsx
git commit -m "feat(brain): the initiative form, shared, with a book mode for Me and My team

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: One initiative row

Spec §2.1 (title, metric and whose book, baseline → now → target as a progress bar in DM Mono, days left, status, owner, open/done tasks; expanding shows the hypothesis and tasks; edit and close for those allowed), §1.3; Contract notes 5, 6, 9; plan Decision 6.

**Files:**
- Create: `src/components/brain/InitiativeRow.tsx`
- Test: `src/components/brain/InitiativeRow.test.tsx`

**Interfaces:**
- Consumes: `editInitiative` (Task 2); `EditInitiativeForm`, `CloseInitiativeForm` (Task 3); `DO`, `bookText`, `daysLeftParts`, `initiativeStatusLabel`, `isClosed`, `progressFigures`, `taskStatusText` (Task 1); `recordHref` (`features/segments/segmentFields`); `formatDate`; `errorMessage` (`components/organizations/portfolio/usePagedRead`); `useSubmitOnce`.
- Produces: `InitiativeRow({ initiative: DoingInitiative; readerId: number; currency: CurrencyCode; onChanged: (next: DoingInitiative) => void })`: an `<li data-initiative={id}>` with a `data-part="meta"` line, a `role="progressbar"`, and controls marked `data-focus="edit" | "close" | "reopen"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/brain/InitiativeRow.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { DoingInitiative } from '../../features/brain/brainTypes';
import { DO } from '../../features/brain/doingText';
import { bodies, requests, stubBrain } from '../../features/brain/testBrain';
import { CARL_INITIATIVE, COMPANY_INITIATIVE, DANA_INITIATIVE } from '../../features/brain/testDoingFixtures';
import { InitiativeRow } from './InitiativeRow';

/** The row with its parent's state, so a saved change re-renders it. */
function Harness({ initial, readerId = 1, onChanged }: { initial: DoingInitiative; readerId?: number; onChanged?: (next: DoingInitiative) => void }) {
  const [one, setOne] = useState(initial);
  return (
    <MemoryRouter>
      <ul>
        <InitiativeRow
          initiative={one}
          readerId={readerId}
          currency="USD"
          onChanged={(next) => {
            onChanged?.(next);
            setOne(next);
          }}
        />
      </ul>
    </MemoryRouter>
  );
}
const row = () => screen.getByRole('listitem');
const button = (name: string) => within(row()).getByRole('button', { name });

describe('InitiativeRow (spec §2.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the metric, whose book, status, owner, the figures and bar, the days and the work', () => {
    render(<Harness initial={CARL_INITIATIVE} />);
    expect(within(row()).getByRole('heading', { level: 3, name: CARL_INITIATIVE.title })).toBeInTheDocument();
    expect(row().querySelector('[data-part="meta"]')).toHaveTextContent("ARR at risk · Carl CSM's book · Active · Carl CSM");
    expect(row().querySelector('[data-part="figures"]')).toHaveTextContent('$64.1K → $52K → $32K');
    expect(within(row()).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37.7');
    expect(row().querySelector('[data-part="when"]')).toHaveTextContent('56 days left · by 30 Nov 2026');
    expect(row().querySelector('[data-part="work"]')).toHaveTextContent('Tasks: 1 open · 1 done');
  });

  it('says "Whole company" and "No owner", and shows no bar when progress is unmeasurable', () => {
    render(<Harness initial={{ ...COMPANY_INITIATIVE, progress: { ...COMPANY_INITIATIVE.progress, progress_pct: null } }} />);
    expect(row().querySelector('[data-part="meta"]')).toHaveTextContent('Net revenue retention · Whole company · Planned · No owner');
    expect(within(row()).queryByRole('progressbar')).toBeNull();
    expect(within(row()).getByText(DO.NOT_MEASURABLE)).toBeInTheDocument();
  });

  it('expands to the hypothesis and the tasks, each linked to its record', async () => {
    render(<Harness initial={CARL_INITIATIVE} />);
    const details = button(DO.DETAILS);
    expect(details).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    const panel = row().querySelector('[data-part="details"]') as HTMLElement;
    expect(panel).toBeVisible();
    expect(panel).toHaveTextContent(`Hypothesis: ${CARL_INITIATIVE.hypothesis}`);
    expect(within(panel).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/6');
    expect(within(panel).getByRole('link', { name: 'Uber EMEA' })).toHaveAttribute('href', '/accounts/12');
    expect(panel).toHaveTextContent('Carl CSM · due 20 Oct 2026 · To do');
  });

  it('offers no Details without a hypothesis, outcome or tasks (Contract note 5)', () => {
    const bare: DoingInitiative = { ...CARL_INITIATIVE, hypothesis: undefined, outcome: undefined, work: { open: 1, done: 1 } };
    render(<Harness initial={bare} />);
    expect(within(row()).queryByRole('button', { name: DO.DETAILS })).toBeNull();
  });

  it('offers no Edit, Mark done or Abandon when the reader may not change it', () => {
    render(<Harness initial={{ ...CARL_INITIATIVE, can_edit: false }} />);
    for (const name of [DO.EDIT, DO.MARK_DONE, DO.ABANDON, DO.REOPEN]) expect(within(row()).queryByRole('button', { name })).toBeNull();
  });

  it('edits once, replaces the row, and hands focus back to Edit', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'], viewAll: false });
    const onChanged = vi.fn();
    render(<Harness initial={CARL_INITIATIVE} onChanged={onChanged} />);
    await userEvent.click(button(DO.EDIT));
    const edit = within(row()).getByRole('form', { name: DO.EDIT_FORM });
    const title = within(edit).getByLabelText(DO.FIELD_TITLE);
    expect(title).toHaveFocus();
    await userEvent.clear(title);
    await userEvent.type(title, 'Halve it by November');
    await userEvent.dblClick(within(edit).getByRole('button', { name: DO.SAVE }));
    await waitFor(() => expect(within(row()).getByRole('heading', { level: 3, name: 'Halve it by November' })).toBeInTheDocument());
    expect(requests(spy, 'PATCH', '/brain/initiatives/')).toEqual(['/brain/initiatives/3/']);
    expect(bodies(spy, 'PATCH', '/brain/initiatives/')).toEqual([
      { title: 'Halve it by November', hypothesis: CARL_INITIATIVE.hypothesis, target_value: '32000', target_by: '2026-11-30' },
    ]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button(DO.EDIT)).toHaveFocus());
  });

  it('closes as done with what happened, then focuses Reopen; Reopen sends active and focuses Mark done', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'], viewAll: false });
    render(<Harness initial={CARL_INITIATIVE} />);
    await userEvent.click(button(DO.MARK_DONE));
    const close = within(row()).getByRole('form', { name: DO.CLOSE_DONE });
    await userEvent.type(within(close).getByLabelText(DO.WHAT_HAPPENED), 'Both renewals saved.');
    await userEvent.dblClick(within(close).getByRole('button', { name: DO.CLOSE_DONE }));
    await waitFor(() => expect(button(DO.REOPEN)).toHaveFocus());
    expect(row().querySelector('[data-part="meta"]')).toHaveTextContent('· Done ·');
    expect(row().querySelector('[data-part="when"]')).not.toHaveTextContent('days left');
    await userEvent.dblClick(button(DO.REOPEN));
    await waitFor(() => expect(button(DO.MARK_DONE)).toHaveFocus());
    expect(bodies(spy, 'PATCH', '/brain/initiatives/')).toEqual([{ status: 'done', outcome: 'Both renewals saved.' }, { status: 'active' }]);
  });

  it('Cancel closes the form and focuses the button that opened it', async () => {
    stubBrain({ offered: ['me', 'team'] });
    render(<Harness initial={CARL_INITIATIVE} />);
    await userEvent.click(button(DO.ABANDON));
    await userEvent.click(within(row()).getByRole('button', { name: DO.CANCEL }));
    expect(within(row()).queryByRole('form')).toBeNull();
    await waitFor(() => expect(button(DO.MARK_DONE)).toHaveFocus());
  });

  it('shows the server’s refusal at the buttons, focused, and keeps the row (§1.3)', async () => {
    stubBrain({ offered: ['me', 'team'], viewAll: false });
    const onChanged = vi.fn();
    // Dana's initiative: the fixture says can_edit, the server (Alice, not above Dana) says no.
    render(<Harness initial={{ ...DANA_INITIATIVE, status: 'active' }} onChanged={onChanged} />);
    await userEvent.click(button(DO.MARK_DONE));
    await userEvent.click(within(row()).getByRole('button', { name: DO.CLOSE_DONE }));
    const alert = await within(row()).findByRole('alert');
    expect(alert).toHaveTextContent("You can't change this initiative.");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(onChanged).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/brain/InitiativeRow.test.tsx`
Expected: FAIL (`Failed to resolve import "./InitiativeRow"`).

- [ ] **Step 3: Write `InitiativeRow.tsx`**

Create `src/components/brain/InitiativeRow.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CurrencyCode } from '../../features/auth/authSlice';
import { editInitiative } from '../../features/brain/brainApi';
import type { DoingInitiative, InitiativePatch } from '../../features/brain/brainTypes';
import { bookText, daysLeftParts, DO, initiativeStatusLabel, isClosed, progressFigures, taskStatusText } from '../../features/brain/doingText';
import { formatDate } from '../../features/customers/formatters';
import { recordHref } from '../../features/segments/segmentFields';
import { BUTTON, FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { CloseInitiativeForm, EditInitiativeForm } from './InitiativeForm';

const LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;
type Mode = 'view' | 'edit' | 'done' | 'abandoned';
type Focus = 'edit' | 'close' | 'reopen';

/** One initiative (spec §2.1; plan Decision 6), flat inside the section's
 *  list. Edit, close and reopen are sent once; focus lands back on the
 *  control that fits what just changed. */
export function InitiativeRow({ initiative: one, readerId, currency, onChanged }: {
  initiative: DoingInitiative;
  readerId: number;
  currency: CurrencyCode;
  onChanged: (next: DoingInitiative) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('view');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce();
  const rowRef = useRef<HTMLLIElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const focusAfter = useRef<Focus | null>(null);
  const detailsId = useId();
  const figures = progressFigures(one.progress, currency);
  const days = daysLeftParts(one.progress.days_left, one.status);
  const closed = isClosed(one.status);
  const pct = one.progress.progress_pct;
  const hasDetails = Boolean(one.hypothesis) || Boolean(one.outcome) || one.work.tasks !== undefined;

  useEffect(() => {
    const target = focusAfter.current;
    if (!target || mode !== 'view') return;
    focusAfter.current = null;
    rowRef.current?.querySelector<HTMLElement>(`[data-focus="${target}"]`)?.focus();
  }, [one, mode]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function back(to: Focus) {
    focusAfter.current = to;
    setError(null);
    setMode('view');
  }

  async function send(patch: InitiativePatch, to: Focus) {
    setError(null);
    const outcome = await run(() => editInitiative(one.id, patch));
    if (!outcome) return;
    if (outcome.ok) {
      onChanged(outcome.value);
      back(to);
    } else setError(errorMessage(outcome.error, DO.SAVE_FAILED));
  }

  return (
    <li ref={rowRef} data-initiative={one.id} className="flex flex-col gap-2 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="text-[15px] font-semibold text-ink">{one.title}</h3>
        <p data-part="meta" className="text-[13px] text-ink-muted">
          {one.metric_label} · {bookText(one, readerId)} · {initiativeStatusLabel(one.status)} · {one.owner?.name ?? DO.NO_OWNER}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <p data-part="figures" className="text-[13px] text-ink">
          <span className={MONO}>{figures.baseline}</span> → <span className={MONO}>{figures.now}</span> → <span className={MONO}>{figures.target}</span>
        </p>
        {pct === null ? (
          <p className="text-[13px] text-ink-muted">{DO.NOT_MEASURABLE}</p>
        ) : (
          <div
            role="progressbar"
            aria-label={`${one.title}: progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-2 overflow-hidden rounded-full bg-subtle"
          >
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
          </div>
        )}
      </div>
      <p data-part="when" className="text-[13px] text-ink-muted">
        {days ? (
          <>
            <span className={MONO}>{days.n}</span> {days.words} ·{' '}
          </>
        ) : null}
        by <span className={MONO}>{formatDate(one.target_by)}</span>
      </p>
      <p data-part="work" className="text-[13px] text-ink-muted">
        Tasks: <span className={MONO}>{one.work.open}</span> open · <span className={MONO}>{one.work.done}</span> done
      </p>
      <div className="flex flex-wrap gap-2">
        {hasDetails ? (
          <button type="button" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((v) => !v)} className={QUIET}>
            {DO.DETAILS}
          </button>
        ) : null}
        {one.can_edit && mode === 'view' ? (
          closed ? (
            <button type="button" data-focus="reopen" disabled={busy} onClick={() => void send({ status: 'active' }, 'close')} className={QUIET}>
              {DO.REOPEN}
            </button>
          ) : (
            <>
              <button type="button" data-focus="edit" onClick={() => setMode('edit')} className={QUIET}>
                {DO.EDIT}
              </button>
              <button type="button" data-focus="close" onClick={() => setMode('done')} className={BUTTON}>
                {DO.MARK_DONE}
              </button>
              <button type="button" onClick={() => setMode('abandoned')} className={QUIET}>
                {DO.ABANDON}
              </button>
            </>
          )
        ) : null}
      </div>
      {error ? (
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-[13px] text-danger outline-none">
          {error}
        </p>
      ) : null}
      {mode === 'edit' ? (
        <EditInitiativeForm initiative={one} busy={busy} onSave={(patch) => void send(patch, 'edit')} onCancel={() => back('edit')} />
      ) : null}
      {mode === 'done' || mode === 'abandoned' ? (
        <CloseInitiativeForm
          as={mode}
          busy={busy}
          onClose={(outcome) => void send({ status: mode, outcome }, 'reopen')}
          onCancel={() => back('close')}
        />
      ) : null}
      {hasDetails ? (
        <div id={detailsId} hidden={!open} data-part="details" className="flex flex-col gap-2 border-t border-line pt-2">
          {one.hypothesis ? (
            <p className="text-[13px] text-ink">
              <span className="text-ink-muted">{DO.HYPOTHESIS}: </span>
              {one.hypothesis}
            </p>
          ) : null}
          {one.outcome ? (
            <p className="text-[13px] text-ink">
              <span className="text-ink-muted">{DO.OUTCOME}: </span>
              {one.outcome}
            </p>
          ) : null}
          {one.work.tasks === undefined ? null : one.work.tasks.length === 0 ? (
            <p className="text-[13px] text-ink-muted">{DO.NO_TASKS}</p>
          ) : (
            <ul aria-label={DO.TASKS} className="flex flex-col gap-1">
              {one.work.tasks.map((task) => (
                <li key={task.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="font-semibold text-ink">{task.title}</span>
                  <Link to={recordHref(task.parent_type, task.parent_id)} className={LINK}>
                    {task.parent_name}
                  </Link>
                  <span className="text-ink-muted">
                    {task.assignee_name} · due <span className={MONO}>{formatDate(task.due_date)}</span> · {taskStatusText(task.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/brain/InitiativeRow.test.tsx src/components/brain/houseRules.test.ts && npx tsc -b --noEmit`
Expected: PASS, 9 row tests; the house-rules suite still passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/brain/InitiativeRow.tsx src/components/brain/InitiativeRow.test.tsx
git commit -m "feat(brain): an initiative row with its progress, details, edit and close

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: A plan row and a rule row

Spec §2.1 (Plans: record linked, plan name, status, milestones "3 of 5", target date, owner, health and ARR then → now; Rules at work: name linked if readable, segment, status with the reason, last night's fired, and matched · skipped for my own), Decisions 4, 5; Contract notes 10, 11; plan Decisions 7, 8.

**Files:**
- Create: `src/components/brain/DoingPlanRow.tsx`
- Create: `src/components/brain/DoingRuleRow.tsx`
- Test: `src/components/brain/DoingRows.test.tsx`

**Interfaces:**
- Consumes: `DO`, `thenNowParts`, `planHref`, `ruleHref`, `ruleStatusText`, `segmentText`, `lastRunParts` (Task 1); `recordPath` (`waitingText`); `STATUS_LABEL` (`features/plans/planOptions`); `formatDate`; fixtures (Task 2).
- Produces: `DoingPlanRow({ plan: DoingPlan; currency: CurrencyCode })` → `<li data-plan={id}>` with `data-part="meta"` and `data-part="figures"`; `DoingRuleRow({ rule: DoingRule })` → `<li data-rule={id}>` with `data-part="meta"` and `data-part="run"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/brain/DoingRows.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { DO } from '../../features/brain/doingText';
import {
  ALICE_PLAN,
  CARL_DOING_RULE,
  CARL_PLAN,
  DANA_DOING_RULE,
  DANA_PLAN,
  MY_DOING_RULE,
} from '../../features/brain/testDoingFixtures';
import { DoingPlanRow } from './DoingPlanRow';
import { DoingRuleRow } from './DoingRuleRow';

const inList = (row: ReactNode) => render(<MemoryRouter><ul>{row}</ul></MemoryRouter>);
const part = (name: string) => screen.getByRole('listitem').querySelector(`[data-part="${name}"]`);

describe('DoingPlanRow (spec §2.1, Decision 4)', () => {
  it('links the plan and its record, and reads status, milestones, date, owner and then → now', () => {
    inList(<DoingPlanRow plan={CARL_PLAN} currency="USD" />);
    expect(screen.getByRole('link', { name: 'Renewal save play' })).toHaveAttribute('href', '/projects/8');
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/6');
    expect(part('meta')).toHaveTextContent('At risk · 1 of 4 milestones · by 1 Nov 2026 · Carl CSM');
    expect(part('figures')).toHaveTextContent('Health 48 → 55 · ARR $69.6K → $69.6K');
  });

  it('says a plan started before starting figures were kept, and links an account', () => {
    inList(<DoingPlanRow plan={ALICE_PLAN} currency="USD" />);
    expect(part('figures')).toHaveTextContent(DO.BEFORE_FIGURES);
    expect(screen.getByRole('link', { name: 'Uber EMEA' })).toHaveAttribute('href', '/accounts/12');
  });

  it('reads a done plan with no target date', () => {
    inList(<DoingPlanRow plan={DANA_PLAN} currency="USD" />);
    expect(part('meta')).toHaveTextContent('Done · 2 of 2 milestones · No target date · Dana CSM');
    expect(part('figures')).toHaveTextContent('Health 62 → 71 · ARR $40K → $44K');
  });
});

describe('DoingRuleRow (spec §2.1, Decision 5)', () => {
  it('links my own rule and gives its full counts', () => {
    inList(<DoingRuleRow rule={MY_DOING_RULE} />);
    expect(screen.getByRole('link', { name: 'Detractor follow-up' })).toHaveAttribute('href', '/scenarios/rules/3');
    expect(part('meta')).toHaveTextContent('Detractors · On');
    expect(part('run')).toHaveTextContent('Last run 5 Oct: fired 4 · matched 12 · skipped 2');
  });

  it('names someone else’s rule without a link, says why it paused, and gives fired only', () => {
    inList(<DoingRuleRow rule={CARL_DOING_RULE} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(within(screen.getByRole('listitem')).getByText('Renewal nudge')).toBeInTheDocument();
    expect(part('meta')).toHaveTextContent('Renewals in 90 days · Paused: its segment was deleted');
    expect(part('run')).toHaveTextContent('Last run 4 Oct: fired 1');
    expect(part('run')).not.toHaveTextContent('matched');
  });

  it('reads a rule with no segment that has not run yet', () => {
    inList(<DoingRuleRow rule={DANA_DOING_RULE} />);
    expect(part('meta')).toHaveTextContent('No segment · On');
    expect(part('run')).toHaveTextContent(DO.NOT_RUN);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/brain/DoingRows.test.tsx`
Expected: FAIL (`Failed to resolve import "./DoingPlanRow"`).

- [ ] **Step 3: Write the two rows**

Create `src/components/brain/DoingPlanRow.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { CurrencyCode } from '../../features/auth/authSlice';
import type { DoingPlan } from '../../features/brain/brainTypes';
import { DO, planHref, thenNowParts } from '../../features/brain/doingText';
import { recordPath } from '../../features/brain/waitingText';
import { formatDate } from '../../features/customers/formatters';
import { STATUS_LABEL } from '../../features/plans/planOptions';
import { FOCUS, MONO } from '../organizations/portfolio/styles';

const LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

/** One plan (spec §2.1; plan Decision 7): the plan's own page, its record,
 *  where it stands, and health and ARR then → now (Contract note 10). */
export function DoingPlanRow({ plan, currency }: { plan: DoingPlan; currency: CurrencyCode }) {
  const parts = thenNowParts(plan, currency);
  return (
    <li data-plan={plan.id} className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Link to={planHref(plan)} className={LINK}>
          {plan.name}
        </Link>
        <span className="text-[13px] text-ink-muted">on</span>
        <Link to={recordPath(plan.record)} className={LINK}>
          {plan.record.name}
        </Link>
      </div>
      <p data-part="meta" className="text-[13px] text-ink-muted">
        {STATUS_LABEL[plan.status]} · <span className={MONO}>{plan.milestones.done}</span> of <span className={MONO}>{plan.milestones.total}</span>{' '}
        milestones ·{' '}
        {plan.target_date ? (
          <>
            by <span className={MONO}>{formatDate(plan.target_date)}</span>
          </>
        ) : (
          DO.NO_TARGET_DATE
        )}{' '}
        · {plan.owner.name}
      </p>
      <p data-part="figures" className="text-[13px] text-ink">
        {parts === null
          ? DO.BEFORE_FIGURES
          : parts.length === 0
            ? DO.NO_FIGURES
            : parts.map((p, n) => (
                <span key={p.label}>
                  {n > 0 ? ' · ' : ''}
                  {p.label} <span className={MONO}>{p.then}</span> → <span className={MONO}>{p.now}</span>
                </span>
              ))}
      </p>
    </li>
  );
}
```

Create `src/components/brain/DoingRuleRow.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { DoingRule } from '../../features/brain/brainTypes';
import { DO, lastRunParts, ruleHref, ruleStatusText, segmentText } from '../../features/brain/doingText';
import { FOCUS, MONO } from '../organizations/portfolio/styles';

const LINK = `inline-flex min-h-11 items-center text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`;

/** One rule at work (spec §2.1, Decision 5; plan Decision 8): its name (a
 *  link when it is mine, Contract note 11), segment and status in words,
 *  and its last run: fired for everyone, matched and skipped for the owner. */
export function DoingRuleRow({ rule }: { rule: DoingRule }) {
  const href = ruleHref(rule);
  const run = lastRunParts(rule);
  return (
    <li data-rule={rule.id} className="flex flex-col gap-1 px-4 py-3">
      {href ? (
        <Link to={href} className={`${LINK} self-start`}>
          {rule.name}
        </Link>
      ) : (
        <p className="text-[13px] font-semibold text-ink">{rule.name}</p>
      )}
      <p data-part="meta" className="text-[13px] text-ink-muted">
        {segmentText(rule)} · {ruleStatusText(rule)}
      </p>
      <p data-part="run" className="text-[13px] text-ink-muted">
        {run === null ? (
          DO.NOT_RUN
        ) : (
          <>
            Last run {run.on}:{' '}
            {run.parts.map((p, n) => (
              <span key={p.label}>
                {n > 0 ? ' · ' : ''}
                {p.label} <span className={MONO}>{p.n}</span>
              </span>
            ))}
          </>
        )}
      </p>
    </li>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/brain/DoingRows.test.tsx src/components/brain/houseRules.test.ts && npx tsc -b --noEmit`
Expected: PASS, 6 row tests; the house-rules suite still passes.

- [ ] **Step 5: Commit**

```bash
git add src/components/brain/DoingPlanRow.tsx src/components/brain/DoingRuleRow.tsx src/components/brain/DoingRows.test.tsx
git commit -m "feat(brain): plan and rule rows for What's being done

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The What's being done page at `/brain/doing`

Spec §2.1 (header, section links synced to `?section=`, the three sections, Company-only Knowledge by function, empty states, skeleton, error with Retry, 375px), Decisions 1, 3, 6; plan Decisions 2, 3, 5, 9–12.

**Files:**
- Modify: `src/components/brain/useBrainScope.ts` (keep other query parameters)
- Test: `src/components/brain/useBrainScope.test.tsx` (append)
- Create: `src/components/brain/useDoing.ts`
- Create: `src/components/brain/DoingSkeleton.tsx`
- Create: `src/pages/brain/Doing.tsx`
- Modify: `src/pages/brain/BrainRoutes.tsx` (the `doing` route, so `renderBrain` reaches the page)
- Test: `src/pages/brain/Doing.test.tsx`

**Interfaces:**
- Consumes: `useBrainScope`, `ScopeSwitch`, `LostAccessNotice`, `KnowledgeByFunctionPanel` (deliveries 1–2); `fetchDoing` (Task 2); `InitiativeForm` (Task 3); `InitiativeRow` (Task 4); `DoingPlanRow`, `DoingRuleRow` (Task 5); `DO`, `SECTIONS`, `sectionOf`, `withSection`, `canStart`, `initiativesEmpty`, `hiddenPlansText` (Task 1); `ErrorBlock` (portfolio `PortfolioSections`); `PRIMARY`, `QUIET`, `FOCUS`; `useAppSelector`, `useCapability`.
- Produces: `useDoing(scope, onRefused) → { data: DoingPayload | null; error: string | null; retry(): void; replace(next: DoingInitiative): void }`; `DoingSkeleton()`; `DoingPage()`; route `/brain/doing`. Section headings carry ids `doing-initiatives`, `doing-plans`, `doing-rules`.

- [ ] **Step 1: Write the failing tests**

Append to the `describe` in `src/components/brain/useBrainScope.test.tsx`:

```tsx
  it('keeps the other query parameters when it settles or changes the scope (Doing plan Decision 2)', async () => {
    stubBrain();
    renderAt('/brain/doing?section=plans');
    await waitFor(() => expect(text('where')).toBe('/brain/doing?section=plans&scope=company'));
    await userEvent.click(screen.getByRole('button', { name: 'Choose me' }));
    expect(text('where')).toBe('/brain/doing?section=plans&scope=me');
  });
```

Create `src/pages/brain/Doing.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { DO } from '../../features/brain/doingText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { BOOK_BODY, doingWorld, FIRST_NEW_ID } from '../../features/brain/testDoingFixtures';
import { resetViewport } from '../../test/viewport';
import { renderBrain } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const rowOf = (selector: string) =>
  waitFor(() => {
    const found = document.querySelector(selector);
    expect(found).not.toBeNull();
    return found as HTMLElement;
  });
const meta = (row: Element) => row.querySelector('[data-part="meta"]');

describe("What's being done (spec §2.1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the skeleton until the scope and the work land', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me');
    expect(screen.getByRole('status', { name: DO.LOADING })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: DO.INITIATIVES })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: DO.LOADING })).toBeNull();
  });

  it('Me: my initiative on my book, my plan, my rule’s full counts, New initiative, no Company knowledge', async () => {
    const { spy } = stubBrain();
    renderBrain('/brain/doing?scope=me');
    expect(screen.getByRole('heading', { level: 1, name: DO.TITLE })).toBeInTheDocument();
    expect(meta(await rowOf('[data-initiative="1"]'))).toHaveTextContent('Customers in poor health · Your book · Active');
    expect(document.querySelectorAll('[data-initiative]')).toHaveLength(1);
    expect(document.querySelector('[data-plan="9"] [data-part="figures"]')).toHaveTextContent(DO.BEFORE_FIGURES);
    expect(document.querySelector('[data-rule="3"] [data-part="run"]')).toHaveTextContent('fired 4 · matched 12 · skipped 2');
    expect(screen.getByRole('button', { name: DO.NEW })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
    expect(requests(spy, 'GET', '/brain/doing/')).toEqual(['/brain/doing/?scope=me']);
  });

  it("My team: Carl's initiative on his book, his plan then → now, his rule's fired count only", async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=team');
    expect(meta(await rowOf('[data-initiative="3"]'))).toHaveTextContent("ARR at risk · Carl CSM's book · Active · Carl CSM");
    expect(document.querySelector('[data-plan="8"] [data-part="figures"]')).toHaveTextContent('Health 48 → 55 · ARR $69.6K → $69.6K');
    const run = document.querySelector('[data-rule="6"] [data-part="run"]');
    expect(run).toHaveTextContent('Last run 4 Oct: fired 1');
    expect(run).not.toHaveTextContent('matched');
  });

  it('Company: every initiative, the hidden plans and Knowledge by function for view_all_accounts (Decision 6)', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=company');
    expect(meta(await rowOf('[data-initiative="4"]'))).toHaveTextContent('Whole company');
    expect(document.querySelectorAll('[data-initiative]')).toHaveLength(4);
    expect(screen.getByText("2 more plans on records you can't open")).toBeInTheDocument();
    const knowledge = screen.getByRole('region', { name: SAY.KNOWLEDGE });
    expect(await within(knowledge).findByRole('region', { name: 'Knowledge by function' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DO.NEW })).toBeInTheDocument();
  });

  it('Company without view_all_accounts: no New initiative and no Knowledge by function (Decision 3)', async () => {
    stubBrain({ offered: ['company'], viewAll: false });
    renderBrain('/brain/doing', { role: 'csm' });
    await rowOf('[data-initiative="4"]');
    expect(screen.queryByRole('button', { name: DO.NEW })).toBeNull();
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
  });

  it('says so when a section is empty, and still offers New initiative', async () => {
    stubBrain({ world: doingWorld([]), doing: { me: { plans: [], rules: [], hidden: 0 } } });
    renderBrain('/brain/doing?scope=me');
    expect(await screen.findByText('No initiatives on your book yet.')).toBeInTheDocument();
    expect(screen.getByText(DO.NO_PLANS)).toBeInTheDocument();
    expect(screen.getByText(DO.NO_RULES)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: DO.NEW })).toBeInTheDocument();
  });

  it('offers Try again when the read fails, and the retry lands', async () => {
    stubBrain({ failDoing: 1 });
    renderBrain('/brain/doing?scope=me');
    expect(await screen.findByText(DO.LOAD)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await rowOf('[data-initiative="1"]')).toBeInTheDocument();
  });

  it('falls back to the default with the notice when the view is no longer offered', async () => {
    const { revoke } = stubBrain();
    revoke('team');
    renderBrain('/brain/doing?scope=team');
    expect(await screen.findByText(SAY.LOST_ACCESS)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/brain/doing?scope=company'));
  });

  it('lands on ?section= and focuses its heading; a section link moves there, keeping the scope (Decision 2)', async () => {
    stubBrain();
    renderBrain('/brain/doing?section=plans&scope=me');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.PLANS })).toHaveFocus());
    const nav = screen.getByRole('navigation', { name: DO.SECTIONS });
    expect(within(nav).getByRole('link', { name: DO.PLANS })).toHaveAttribute('aria-current', 'location');
    await userEvent.click(within(nav).getByRole('link', { name: DO.RULES }));
    expect(where()).toBe('/brain/doing?section=rules&scope=me');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.RULES })).toHaveFocus());
    expect(within(nav).getByRole('link', { name: DO.RULES })).toHaveAttribute('aria-current', 'location');
  });

  it('starts an initiative for a report in My team, once, then focuses its row (Decision 3)', async () => {
    const { spy } = stubBrain({ offered: ['me', 'team'], viewAll: false });
    renderBrain('/brain/doing?scope=team', { role: 'csm' });
    await rowOf('[data-initiative="3"]');
    const start = screen.getByRole('button', { name: DO.NEW });
    await userEvent.click(start);
    expect(start).toHaveAttribute('aria-expanded', 'true');
    const form = screen.getByRole('form', { name: DO.NEW });
    const whose = within(form).getByLabelText(DO.FIELD_WHOSE_BOOK);
    await waitFor(() => expect(within(whose).getAllByRole('option')).toHaveLength(2));
    await userEvent.selectOptions(whose, 'Carl CSM');
    await userEvent.type(within(form).getByLabelText(DO.FIELD_TITLE), BOOK_BODY.title);
    await userEvent.type(within(form).getByLabelText(DO.FIELD_TARGET), BOOK_BODY.target_value);
    fireEvent.change(within(form).getByLabelText(DO.FIELD_TARGET_BY), { target: { value: BOOK_BODY.target_by } });
    await userEvent.dblClick(within(form).getByRole('button', { name: DO.SAVE_INITIATIVE }));
    const made = await rowOf(`[data-initiative="${FIRST_NEW_ID}"]`);
    expect(meta(made)).toHaveTextContent("ARR at risk · Carl CSM's book · Active · Carl CSM");
    expect(screen.getByText(DO.STARTED)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: DO.NEW })).toBeNull();
    await waitFor(() => expect(made.contains(document.activeElement)).toBe(true));
    expect(requests(spy, 'POST', '/brain/initiatives/')).toEqual(['/brain/initiatives/?scope=team']);
    expect(requests(spy, 'GET', '/brain/doing/')).toEqual(['/brain/doing/?scope=team', '/brain/doing/?scope=team']);
  });

  it('Cancel closes the form and hands focus back to New initiative', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me');
    await rowOf('[data-initiative="1"]');
    await userEvent.click(screen.getByRole('button', { name: DO.NEW }));
    await userEvent.click(within(screen.getByRole('form', { name: DO.NEW })).getByRole('button', { name: DO.CANCEL }));
    expect(screen.queryByRole('form', { name: DO.NEW })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: DO.NEW })).toHaveFocus());
  });

  it('Company: New initiative opens the existing form, with its cut', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=company');
    await rowOf('[data-initiative="4"]');
    await userEvent.click(screen.getByRole('button', { name: DO.NEW }));
    expect(within(screen.getByRole('form', { name: DO.NEW })).getByLabelText(DO.FIELD_CUT)).toBeInTheDocument();
  });

  it('at 375px the view is a select and the section links wrap', async () => {
    stubBrain();
    renderBrain('/brain/doing?scope=me', { width: 375 });
    await rowOf('[data-initiative="1"]');
    expect(screen.getByLabelText('View')).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByRole('navigation', { name: DO.SECTIONS })).toHaveClass('flex-wrap');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/brain/useBrainScope.test.tsx src/pages/brain/Doing.test.tsx`
Expected: FAIL: the new `useBrainScope` case gets `/brain/doing?scope=company` (the section dropped); `Doing.test.tsx` fails to find the page (`/brain/doing` falls through to `/brain`).

- [ ] **Step 3: Keep the other query parameters in `useBrainScope`**

In `src/components/brain/useBrainScope.ts`, add `useRef` to the React import and replace `go` with:

```ts
  // Doing plan Decision 2: other parameters (`?section=`) ride along. Read
  // through a ref, kept in step before the settle effect below runs, so `go`
  // and the callbacks built on it stay stable.
  const searchRef = useRef(location.search);
  useEffect(() => {
    searchRef.current = location.search;
  }, [location.search]);

  const go = useCallback(
    (key: ScopeKey | null, lost: boolean) => {
      const next = new URLSearchParams(searchRef.current);
      if (key) next.set('scope', key);
      else next.delete('scope');
      const search = next.toString();
      navigate({ search: search ? `?${search}` : '' }, { replace: true, state: lost ? { scopeLost: true } : null });
    },
    [navigate],
  );
```

(The ref effect sits above `go`, so it runs before the settle effect that calls `go`.)

- [ ] **Step 4: Write `useDoing` and the skeleton**

Create `src/components/brain/useDoing.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { fetchDoing } from '../../features/brain/brainApi';
import type { DoingInitiative, DoingPayload, ScopeKey } from '../../features/brain/brainTypes';
import { DO } from '../../features/brain/doingText';

type Answer = { key: string; data: DoingPayload | null; error: string | null };

/** GET doing/?scope= for the settled scope, read again on Try again and
 *  after a start; a slower answer for another scope is dropped. A 403
 *  SCOPE_NOT_ALLOWED goes to `onRefused` and shows no error of its own.
 *  `replace` puts an edited initiative back in its place. */
export function useDoing(scope: ScopeKey | null, onRefused: (err: unknown) => boolean) {
  const [attempt, setAttempt] = useState(0);
  const key = scope ? `${scope}#${attempt}` : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!scope || !key) return;
    let alive = true;
    fetchDoing(scope).then(
      (data) => alive && setAnswer({ key, data, error: null }),
      (err: unknown) => {
        if (alive && !onRefused(err)) setAnswer({ key, data: null, error: DO.LOAD });
      },
    );
    return () => {
      alive = false;
    };
    // `key` carries the scope and the attempt; `onRefused` is the page's stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const replace = useCallback(
    (next: DoingInitiative) =>
      setAnswer((last) =>
        last?.data ? { ...last, data: { ...last.data, initiatives: last.data.initiatives.map((one) => (one.id === next.id ? next : one)) } } : last,
      ),
    [],
  );
  const current = key && answer?.key === key ? answer : null;
  return { data: current?.data ?? null, error: current?.error ?? null, retry: () => setAttempt((n) => n + 1), replace };
}
```

Create `src/components/brain/DoingSkeleton.tsx`:

```tsx
import { DO } from '../../features/brain/doingText';

const BAR = 'block animate-pulse rounded bg-subtle';

/** The page's shape while it loads: three sections of two rows. */
export function DoingSkeleton() {
  return (
    <div role="status" aria-label={DO.LOADING} className="flex flex-col gap-6">
      {[0, 1, 2].map((section) => (
        <div key={section} aria-hidden="true" className="flex flex-col gap-3">
          <span className={`${BAR} h-4 w-32`} />
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {[0, 1].map((row) => (
              <li key={row} className="flex flex-col gap-2 px-4 py-3">
                <span className={`${BAR} h-4 w-2/3`} />
                <span className={`${BAR} h-2 w-full`} />
                <span className={`${BAR} h-3 w-40`} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write the page**

Create `src/pages/brain/Doing.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { DoingPlanRow } from '../../components/brain/DoingPlanRow';
import { DoingRuleRow } from '../../components/brain/DoingRuleRow';
import { DoingSkeleton } from '../../components/brain/DoingSkeleton';
import { InitiativeForm } from '../../components/brain/InitiativeForm';
import { InitiativeRow } from '../../components/brain/InitiativeRow';
import { KnowledgeByFunctionPanel } from '../../components/brain/KnowledgeByFunctionPanel';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { ScopeSwitch } from '../../components/brain/ScopeSwitch';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useDoing } from '../../components/brain/useDoing';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { SAY } from '../../features/brain/brainText';
import type { ScopeKey } from '../../features/brain/brainTypes';
import { canStart, DO, hiddenPlansText, initiativesEmpty, sectionOf, SECTIONS, withSection, type SectionKey } from '../../features/brain/doingText';
import { useAppSelector, useCapability } from '../../hooks';

const LIST = 'divide-y divide-line rounded-xl border border-line bg-surface';
const NONE = 'rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink-muted';
const headingId = (key: SectionKey) => `doing-${key}`;

function Section({ id, title, action, children }: { id: SectionKey; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={headingId(id)} data-section={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId(id)} tabIndex={-1} className={`text-[15px] font-semibold text-ink ${FOCUS}`}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** /brain/doing: What's being done (spec 2026-10-05-brain-doing-design
 *  §2.1), for every member, scoped Me · My team · Company: the initiatives,
 *  plans and rules at work on the scope's book, and in Company, Knowledge
 *  by function. */
export function DoingPage() {
  const brain = useBrainScope();
  const scope = brain.scope;
  const doing = useDoing(scope, brain.refused);
  const data = doing.data;
  const canSeeAll = useCapability('view_all_accounts');
  const user = useAppSelector((state) => state.auth.user);
  const reader = user ? { id: user.id, name: user.name } : null;
  const [params] = useSearchParams();
  const { search } = useLocation();
  const section = sectionOf(params.get('section'));
  const [forming, setForming] = useState<ScopeKey | null>(null);
  const [status, setStatus] = useState<{ scope: ScopeKey; text: string } | null>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<number | 'NEW' | null>(null);
  const landed = useRef<SectionKey | null>(null);

  // Plan Decision 2: a section named in the URL takes focus once the work is here.
  useEffect(() => {
    if (!data || !section || landed.current === section) return;
    landed.current = section;
    const heading = document.getElementById(headingId(section));
    heading?.focus();
    heading?.scrollIntoView?.({ block: 'start' });
  }, [data, section]);

  // Plan Decision 5: after a start, the new row's first control; after Cancel, New initiative.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    if (target === 'NEW') {
      pendingFocus.current = null;
      newRef.current?.focus();
      return;
    }
    if (!data) return;
    pendingFocus.current = null;
    const row = document.querySelector(`[data-initiative="${target}"]`);
    (row?.querySelector<HTMLElement>('button, a[href]') ?? newRef.current)?.focus();
  }, [data, forming]);

  const showForm = scope !== null && forming === scope;

  function closeForm() {
    pendingFocus.current = 'NEW';
    setForming(null);
  }

  function started(id: number) {
    pendingFocus.current = id;
    setForming(null);
    if (scope) setStatus({ scope, text: DO.STARTED });
    doing.retry();
  }

  let body: ReactNode;
  if (brain.error) body = <ErrorBlock message={brain.error} onRetry={brain.retry} />;
  else if (doing.error) body = <ErrorBlock message={doing.error} onRetry={doing.retry} />;
  else if (!scope || !data || !reader) body = <DoingSkeleton />;
  else {
    const hidden = hiddenPlansText(data.hidden);
    const newButton = canStart(scope, canSeeAll) ? (
      <button ref={newRef} type="button" aria-expanded={showForm} onClick={() => (showForm ? closeForm() : setForming(scope))} className={PRIMARY}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {DO.NEW}
      </button>
    ) : null;
    body = (
      <>
        <Section id="initiatives" title={DO.INITIATIVES} action={newButton}>
          {showForm ? (
            scope === 'company' ? (
              <InitiativeForm mode="company" onSaved={started} onCancel={closeForm} />
            ) : (
              <InitiativeForm mode="book" scope={scope} reader={reader} onSaved={started} onCancel={closeForm} />
            )
          ) : null}
          {data.initiatives.length === 0 ? (
            <p data-part="none" className={NONE}>
              {initiativesEmpty(scope)}
            </p>
          ) : (
            <ul aria-label={DO.INITIATIVES} className={LIST}>
              {data.initiatives.map((one) => (
                <InitiativeRow key={one.id} initiative={one} readerId={reader.id} currency={data.currency} onChanged={doing.replace} />
              ))}
            </ul>
          )}
        </Section>
        <Section id="plans" title={DO.PLANS}>
          {data.plans.length === 0 ? (
            <p data-part="none" className={NONE}>
              {DO.NO_PLANS}
            </p>
          ) : (
            <ul aria-label={DO.PLANS} className={LIST}>
              {data.plans.map((plan) => (
                <DoingPlanRow key={plan.id} plan={plan} currency={data.currency} />
              ))}
            </ul>
          )}
          {hidden ? (
            <p data-part="hidden" className="text-[13px] text-ink-muted">
              {hidden}
            </p>
          ) : null}
        </Section>
        <Section id="rules" title={DO.RULES}>
          {data.rules.length === 0 ? (
            <p data-part="none" className={NONE}>
              {DO.NO_RULES}
            </p>
          ) : (
            <ul aria-label={DO.RULES} className={LIST}>
              {data.rules.map((rule) => (
                <DoingRuleRow key={rule.id} rule={rule} />
              ))}
            </ul>
          )}
        </Section>
        {scope === 'company' && canSeeAll ? (
          <section aria-label={SAY.KNOWLEDGE} className="flex flex-col gap-6">
            <KnowledgeByFunctionPanel />
          </section>
        ) : null}
      </>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-2 py-4 sm:px-4 lg:py-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="font-display text-[22px] text-ink">{DO.TITLE}</h1>
          {brain.offered && scope ? <ScopeSwitch scopes={brain.offered.scopes} value={scope} onChange={brain.choose} /> : null}
        </header>
        <nav aria-label={DO.SECTIONS} className="-mt-3 flex flex-wrap gap-1">
          {SECTIONS.map((s) => (
            <Link
              key={s.key}
              to={{ search: withSection(search, s.key) }}
              replace
              aria-current={section === s.key ? 'location' : undefined}
              onClick={() => {
                if (section === s.key) document.getElementById(headingId(s.key))?.focus();
              }}
              className={`${QUIET} ${section === s.key ? 'bg-subtle' : 'text-ink-muted'}`}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
        <p role="status" data-part="doing-status" className="min-h-[1.1em] text-[13px] text-ink-muted">
          {status && status.scope === scope ? status.text : ''}
        </p>
        {body}
      </div>
    </div>
  );
}
```

In `src/pages/brain/BrainRoutes.tsx`, add `import { DoingPage } from './Doing';` and, after the `waiting` route:

```tsx
      <Route path="doing" element={<DoingPage />} />
```

and extend the doc comment's first sentence: "What changed, Waiting on you and What's being done are open to every signed-in member (…; Doing spec §2.2)".

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/brain/useBrainScope.test.tsx src/pages/brain/Doing.test.tsx src/pages/brain/WhatChanged.test.tsx src/pages/brain/Waiting.test.tsx src/components/brain/houseRules.test.ts && npx tsc -b --noEmit`
Expected: PASS: the `useBrainScope` cases (the new one and every earlier one, since a URL with only `?scope=` is unchanged), the 13 page cases, and What changed, Waiting on you and the house rules unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/brain/useBrainScope.ts src/components/brain/useBrainScope.test.tsx src/components/brain/useDoing.ts src/components/brain/DoingSkeleton.tsx src/pages/brain/Doing.tsx src/pages/brain/Doing.test.tsx src/pages/brain/BrainRoutes.tsx
git commit -m "feat(brain): What's being done page at /brain/doing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The redirect, the sidebar, the title, and the old Initiatives page gone

Spec §2.2 (What's being done after Waiting on you, icon `Flag`; Initiatives leaves the sidebar; `/brain/initiatives` redirects; What changed drops the Company-only `KnowledgeByFunctionPanel`), Decisions 6, 7; plan Decisions 1, 13–15.

**Files:**
- Modify: `src/pages/brain/BrainRoutes.tsx`, `src/pages/brain/BrainRoutes.test.tsx`
- Modify: `src/components/layout/Sidebar.tsx`, `src/components/layout/Sidebar.test.tsx`
- Modify: `src/components/layout/Navbar.tsx`, `src/components/layout/Navbar.test.tsx`
- Modify: `src/pages/brain/WhatChanged.tsx`, `src/pages/brain/WhatChanged.test.tsx`, `src/e2e/brain.test.tsx` (What changed's journey step 3)
- Modify: `src/pages/brain/Graph.tsx`, `src/store.ts`
- Delete: `src/pages/brain/Initiatives.tsx`, `src/pages/brain/Initiatives.test.tsx`, `src/features/initiatives/initiativesSlice.ts`, and `src/components/brain/formatMetric.ts` if nothing else imports it

**Interfaces:**
- Consumes: `DoingPage` (Task 6).
- Produces: `/brain/initiatives` → `/brain/doing?section=initiatives` for every member; the sidebar link "What's being done" → `/brain/doing`; no `initiatives` key in the store's state.

- [ ] **Step 1: Write the failing tests**

In `src/pages/brain/BrainRoutes.test.tsx`, replace `vi.mock('./Initiatives', () => ({ InitiativesPage: () => <h1>Initiatives</h1> }));` with:

```tsx
vi.mock('./Doing', () => ({ DoingPage: () => <h1>What's being done</h1> }));
```

change the gated list to `it.each(['/brain/graph', '/brain/requests', '/brain/anomalies'])(`, and add after the "opens What changed to everyone" case:

```tsx
  it("opens What's being done to everyone (Doing spec §2.2)", () => {
    renderAt('/brain/doing', 'csm');
    expect(screen.getByRole('heading', { name: "What's being done" })).toBeInTheDocument();
    expect(where()).toBe('/brain/doing');
  });

  it.each(['csm', 'admin'] as const)("sends /brain/initiatives to What's being done's Initiatives for %s (Doing Decision 7)", (role) => {
    renderAt('/brain/initiatives', role);
    expect(where()).toBe('/brain/doing?section=initiatives');
    expect(screen.getByRole('heading', { name: "What's being done" })).toBeInTheDocument();
  });
```

In `src/components/layout/Sidebar.test.tsx`:

1. In the CSM case that checks What changed's `href` (it lists `['Review Queue', 'Initiatives', …]` as absent), add after the What changed assertion:

```tsx
    expect(screen.getByRole('link', { name: "What's being done" })).toHaveAttribute('href', '/brain/doing');
```

2. Replace the `adds Initiatives, Feature Requests and Anomalies for view_all_accounts, after Waiting on you` case with:

```tsx
  it("adds Feature Requests and Anomalies for view_all_accounts after What's being done; Initiatives is gone (Doing §2.2)", async () => {
    renderSidebar('admin');
    await screen.findByRole('link', { name: 'What changed' });
    const brain = ['What changed', 'Waiting on you', "What's being done", 'Feature Requests', 'Anomalies'].map((name) => screen.getByRole('link', { name }));
    for (let i = 1; i < brain.length; i++) {
      expect(brain[i - 1].compareDocumentPosition(brain[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    for (const name of ['Initiatives', 'Review Queue', 'Knowledge Graph', 'Brain Overview', 'Feedback Log', 'Agents', 'Skills']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Users/ })).toBeInTheDocument();
  });

  it("lights What's being done on /brain/doing, and not What changed", async () => {
    renderSidebar('csm', '/brain/doing');
    expect(await screen.findByRole('link', { name: "What's being done" })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'What changed' })).not.toHaveAttribute('aria-current');
  });
```

In `src/components/layout/Navbar.test.tsx`, after the `/brain/waiting` case:

```tsx
  it("titles /brain/doing without a heading, so \"What's being done\" is the only h1 (Doing plan Decision 13)", () => {
    renderNavbar('/brain/doing');
    expect(screen.getByText('Brain')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
```

In `src/pages/brain/WhatChanged.test.tsx`, rename the month-end case to `'month-end: the brief, what moved and everything we measure; Company knowledge has moved to What’s being done'` and replace its last two lines (the `knowledge` region and `Knowledge by function` within it) with:

```tsx
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
```

delete the `hides Company knowledge for a Leadership reader without view_all_accounts (M2)` case (What changed no longer has the region; `Doing.test.tsx` covers the same reader), and drop `within` from the Testing Library import if nothing else in the file uses it.

In `src/e2e/brain.test.tsx`, What changed's journey step 3, replace `expect(screen.getByRole('region', { name: SAY.KNOWLEDGE })).toBeInTheDocument();` with:

```tsx
    // Knowledge by function moved to What's being done (Doing Decision 6).
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/pages/brain/BrainRoutes.test.tsx src/components/layout/Sidebar.test.tsx src/components/layout/Navbar.test.tsx src/pages/brain/WhatChanged.test.tsx src/e2e/brain.test.tsx`
Expected: FAIL: `/brain/initiatives` lands on `/dashboard` for a CSM; no "What's being done" link; the Navbar shows an `h1` on `/brain/doing`; What changed still shows Company knowledge.

- [ ] **Step 3: Route, sidebar, title, What changed, graph, store**

`src/pages/brain/BrainRoutes.tsx`: remove `import { InitiativesPage } from './Initiatives';` and the gated `<Route path="initiatives" element={<InitiativesPage />} />`; after the `doing` route add:

```tsx
      <Route path="initiatives" element={<Navigate to="/brain/doing?section=initiatives" replace />} />
```

and end the doc comment with "/brain/initiatives redirects to /brain/doing?section=initiatives (Doing spec Decision 7)."

`src/components/layout/Sidebar.tsx`: replace the Brain group with

```tsx
        {/* KNOWLEDGE BRAIN (spec 2026-10-05 §2.1; Waiting spec §2.2; Doing
            spec §2.2): What changed, Waiting on you (with the reader's Me
            count) and What's being done for every member; Feature Requests
            and Anomalies keep their view_all_accounts gate until delivery 4.
            Initiatives now live on What's being done. The Knowledge graph
            has a quiet link in What changed's header; Agents, Skills and
            Feedback Log live in Settings > AI. */}
        <div className="h-px bg-line my-2 w-8" role="separator"></div>
        <NavItem to="/brain" end icon={<Brain className="w-5 h-5" />} label="What changed" />
        <WaitingNavItem />
        <NavItem to="/brain/doing" icon={<Flag className="w-5 h-5" />} label="What's being done" />
        {canSeeAll ? (
          <>
            <NavItem to="/brain/requests" icon={<Lightbulb className="w-5 h-5" />} label="Feature Requests" />
            <NavItem to="/brain/anomalies" icon={<Radar className="w-5 h-5" />} label="Anomalies" />
          </>
        ) : null}
```

`src/components/layout/Navbar.tsx`: the comment becomes "/brain, /brain/waiting and /brain/doing draw their own h1 (delivery 1 Decision 12; Waiting plan Decision 9; Doing plan Decision 13)." and the test becomes

```ts
  const isBrainHome = /^\/brain(\/waiting|\/doing)?\/?$/.test(location.pathname);
```

`src/pages/brain/WhatChanged.tsx`: remove the `KnowledgeByFunctionPanel` import and the `{scope === 'company' && canSeeAll ? (<section aria-label={SAY.KNOWLEDGE} …>…</section>) : null}` block (keep `canSeeAll`: the Knowledge graph link uses it). The body's success branch becomes:

```tsx
  else
    body = (
      <>
        <ScopeBriefCard key={`brief-${scope}`} scope={scope} scopeLabel={brain.label} onRefused={brain.refused} />
        <MovesList key={`moves-${scope}`} changed={data} onRefused={brain.refused} />
        <MeasureTable changed={data} />
      </>
    );
```

`src/pages/brain/Graph.tsx`: the initiative node's link becomes `{ to: '/brain/doing?section=initiatives', label: 'Open initiatives' }`.

`src/store.ts`: remove `import initiativesReducer from './features/initiatives/initiativesSlice';` and `initiatives: initiativesReducer,`.

- [ ] **Step 4: Delete the old page and its slice**

```bash
git rm src/pages/brain/Initiatives.tsx src/pages/brain/Initiatives.test.tsx src/features/initiatives/initiativesSlice.ts
grep -rn "formatMetric\|initiativesSlice\|InitiativesPage\|s\.initiatives\|state\.initiatives" src
```

Expected from the grep: only `src/components/brain/formatMetric.ts` itself (its comment and export). Then:

```bash
git rm src/components/brain/formatMetric.ts
```

(If the grep shows any other importer, keep `formatMetric.ts` and say so in the commit body.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/pages/brain src/components/layout src/components/brain src/e2e/brain.test.tsx && npx tsc -b --noEmit && npm run lint`
Expected: PASS; no type errors; lint `15 problems (0 errors, 15 warnings)`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/brain src/components/layout src/e2e/brain.test.tsx src/store.ts
git status --short   # the deletions from Step 4 are already staged by git rm
git commit -m "feat(brain): What's being done in the sidebar; /brain/initiatives redirects; old page gone

Knowledge by function moves off What changed; the Initiatives page and its
slice go with their last reader.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: House rules, the journeys, the documents and the full run

Spec §2.3 (tests: each section in each scope, whose book, create in Me and My team (owner-cut metrics only), edit permission, plan then → now and the "before starting figures" line, rules counts for owner vs others, hidden count, the redirect, house rules, a contract stub, and an e2e where a CSM starts an initiative on their own ARR at risk and sees it in their manager's My team); the caller's brief (the redirect, Initiatives leaving the sidebar, Knowledge by function moving).

**Files:**
- Modify: `src/components/brain/houseRules.test.ts`
- Modify: `src/e2e/brain.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new.

- [ ] **Step 1: Extend the Brain house rules**

In `src/components/brain/houseRules.test.ts`:

1. The header comment becomes "The house rules over What changed, Waiting on you and What's being done (all three specs §2): every Brain component and the three pages. Knowledge by function moved to What's being done unchanged (it keeps its table) and stays outside the suite."
2. Add to `all`:

```ts
  ...raw(import.meta.glob('../../pages/brain/Doing.tsx', { query: '?raw', eager: true, import: 'default' })),
```

3. Add to the coverage list: `'../../pages/brain/Doing.tsx'`, `'./InitiativeForm.tsx'`, `'./InitiativeRow.tsx'`, `'./DoingPlanRow.tsx'`, `'./DoingRuleRow.tsx'`, `'./DoingSkeleton.tsx'`.
4. Add `'./InitiativeRow.tsx'`, `'./DoingPlanRow.tsx'`, `'./DoingRuleRow.tsx'` to the files checked for `MONO`.
5. Append inside the `describe`:

```ts
  it('designs What’s being done’s loading, empty and error states', () => {
    const page = files['../../pages/brain/Doing.tsx'];
    expect(page).toMatch(/<DoingSkeleton \/>/);
    expect(page).toMatch(/<ErrorBlock /);
    expect(page).toMatch(/initiativesEmpty\(/);
    expect(page).toMatch(/DO\.NO_PLANS/);
    expect(page).toMatch(/DO\.NO_RULES/);
    expect(files['./DoingSkeleton.tsx']).toMatch(/animate-pulse/);
  });

  it('nests no card in a card: initiative, plan and rule rows are flat inside one bordered list', () => {
    for (const file of ['./InitiativeRow.tsx', './DoingPlanRow.tsx', './DoingRuleRow.tsx']) {
      expect(files[file]).not.toMatch(/rounded-xl|border border-line|shadow/);
    }
    expect(files['../../pages/brain/Doing.tsx']).toMatch(/divide-y divide-line rounded-xl border border-line/);
  });

  it('sends every initiative write once', () => {
    for (const file of ['./InitiativeForm.tsx', './InitiativeRow.tsx']) expect(files[file]).toMatch(/useSubmitOnce\(/);
  });

  it('keeps one primary on What’s being done: New initiative', () => {
    expect(files['../../pages/brain/Doing.tsx']).toMatch(/className=\{PRIMARY\}/);
    for (const file of ['./InitiativeForm.tsx', './InitiativeRow.tsx', './DoingPlanRow.tsx', './DoingRuleRow.tsx']) {
      expect(files[file]).not.toMatch(/\bPRIMARY\b/);
    }
  });
```

- [ ] **Step 2: Add the journeys**

In `src/e2e/brain.test.tsx`, add `fireEvent` to the Testing Library import, `bodies` to the `testBrain` import, and:

```ts
import { DO, OWNER_CUT_METRICS } from '../features/brain/doingText';
import { BOOK_BODY, doingWorld, FIRST_NEW_ID } from '../features/brain/testDoingFixtures';
import { ALICE, CARL, CARL_TASK_PROPOSAL, MY_QUESTION, WAITING_NOW } from '../features/brain/testWaitingFixtures';
```

(the last replaces the existing `testWaitingFixtures` import). Extend the header comment with "; Doing spec §2.3: a CSM starts an initiative on their own ARR at risk and their manager sees it in My team, and a manager lands from the old Initiatives link". Append:

```tsx
describe("Brain: What's being done", () => {
  const findRow = (id: number) =>
    waitFor(() => {
      const found = document.querySelector(`[data-initiative="${id}"]`);
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('a CSM starts an initiative on their own ARR at risk, and it shows in their manager’s My team', { timeout: 30000 }, async () => {
    const world = doingWorld();
    const carl = stubBrain({ reader: CARL, offered: ['me'], viewAll: false, world });
    const first = renderBrain('/brain/doing', { role: 'csm', user: CARL, nav: true });

    // 1. Carl's Me: only the metrics with an owner cut; no cut, owner or whose book.
    await userEvent.click(await screen.findByRole('button', { name: DO.NEW }));
    const form = screen.getByRole('form', { name: DO.NEW });
    expect(within(within(form).getByLabelText(DO.FIELD_METRIC)).getAllByRole('option').map((o) => o.textContent)).toEqual(
      OWNER_CUT_METRICS.map((m) => m.label),
    );
    expect(within(form).queryByLabelText(DO.FIELD_CUT)).toBeNull();
    expect(within(form).queryByLabelText(DO.FIELD_WHOSE_BOOK)).toBeNull();
    await userEvent.type(within(form).getByLabelText(DO.FIELD_TITLE), BOOK_BODY.title);
    await userEvent.type(within(form).getByLabelText(DO.FIELD_TARGET), BOOK_BODY.target_value);
    fireEvent.change(within(form).getByLabelText(DO.FIELD_TARGET_BY), { target: { value: BOOK_BODY.target_by } });

    // 2. Saved once, on his own book, ARR at risk the default.
    await userEvent.dblClick(within(form).getByRole('button', { name: DO.SAVE_INITIATIVE }));
    const mine = await findRow(FIRST_NEW_ID);
    expect(mine.querySelector('[data-part="meta"]')).toHaveTextContent('ARR at risk · Your book · Active · Carl CSM');
    expect(screen.getByText(DO.STARTED)).toBeInTheDocument();
    expect(requests(carl.spy, 'POST', '/brain/initiatives/')).toEqual(['/brain/initiatives/?scope=me']);
    expect(bodies(carl.spy, 'POST', '/brain/initiatives/')).toEqual([{ ...BOOK_BODY, hypothesis: '' }]);
    expect(requests(carl.spy, 'GET', '/metrics/')).toEqual([]);
    first.unmount();
    vi.unstubAllGlobals();

    // 3. Alice, his manager, in My team: Carl's book, hers to edit through the chain.
    stubBrain({ reader: ALICE, offered: ['me', 'team'], viewAll: false, world });
    renderBrain('/brain/doing?scope=team', { role: 'csm', nav: true });
    const seen = await findRow(FIRST_NEW_ID);
    expect(seen.querySelector('[data-part="meta"]')).toHaveTextContent("ARR at risk · Carl CSM's book · Active · Carl CSM");
    expect(within(seen).getByRole('button', { name: DO.EDIT })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([DO.TITLE]);
  });

  it('a manager lands from the old Initiatives link, reads plans then → now, and finds Knowledge by function in Company only', { timeout: 30000 }, async () => {
    stubBrain();
    renderBrain('/brain/initiatives', { nav: true });
    await waitFor(() => expect(where()).toBe('/brain/doing?section=initiatives&scope=company'));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: DO.INITIATIVES })).toHaveFocus());
    expect(document.querySelector('[data-plan="10"] [data-part="figures"]')).toHaveTextContent('Health 62 → 71 · ARR $40K → $44K');
    expect(document.querySelector('[data-plan="9"] [data-part="figures"]')).toHaveTextContent(DO.BEFORE_FIGURES);
    expect(screen.getByText("2 more plans on records you can't open")).toBeInTheDocument();
    expect(screen.getByRole('region', { name: SAY.KNOWLEDGE })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Me' }));
    await waitFor(() => expect(where()).toBe('/brain/doing?section=initiatives&scope=me'));
    await findRow(1);
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
  });
});
```

- [ ] **Step 3: Run the suite and the journeys**

Run: `npx vitest run --maxWorkers=2 src/components/brain/houseRules.test.ts src/e2e/brain.test.tsx`
Expected: PASS: the house-rule suites over every Brain file including the new ones, the four new house cases, and the four journeys (two What changed / Waiting, two What's being done).

- [ ] **Step 4: Update the product documents**

`docs/03-ui-ux-design.md`:

1. In "### Brain: What changed", the last bullet becomes: "- No glass anywhere on the page. The Navbar shows "Brain" as a paragraph, not a heading, on `/brain`, `/brain/waiting` and `/brain/doing`. Knowledge by function has moved to What's being done."
2. After the "### Brain: Waiting on you" section, add:

```markdown
### Brain: What's being done

Spec `docs/superpowers/specs/2026-10-05-brain-doing-design.md` §2. Same
folder and house-rules suite as What changed.

- **Header.** An `h1` at 22px in DM Serif Display ("What's being done"), the
  same scope switch, and section links (Initiatives · Plans · Rules at work):
  quiet links that set `?section=` and move focus to that section's heading;
  they wrap below `sm`.
- **Initiatives.** One bordered list, `divide-y`; each row flat: the title,
  "metric · whose book · status · owner" ("Your book", "Carl CSM's book",
  "Whole company"), baseline → now → target in DM Mono over a thin accent bar
  (`role="progressbar"`; "Not measurable yet" without one), "56 days left" or
  "3 days overdue" and the target date, "Tasks: 2 open · 1 done". Details
  expands the hypothesis, the outcome and the tasks. Edit, Mark done (the
  bordered button), Abandon and Reopen for those allowed, as flat forms
  inside the row. **New initiative** is the page's one primary button (Me and
  My team for everyone, Company for `view_all_accounts`); it opens a bordered
  form above the list: in Company the full form (metric, cut, owner), on a
  book only the numbers with an owner cut, and in My team "Whose book".
  Labels above inputs, a refusal below its field or at the form's foot.
- **Plans.** Rows: the plan (to its page) on its record (to the record),
  "status · 3 of 5 milestones · by date · owner", and "Health 62 → 71 · ARR
  $40K → $44K" in DM Mono, or "Started before starting figures were kept".
- **Rules at work.** Rows: the rule (a link when it is yours), "segment ·
  On / Paused: reason / Off", and "Last run 5 Oct: fired 4", with "matched
  12 · skipped 2" on your own rules.
- **Company only.** Knowledge by function under the three sections, for
  `view_all_accounts` readers.
- **States.** A skeleton of three sections, "Try again" on error, an empty
  line per section ("No initiatives on your book yet.", "No open plans.",
  "No rules running."), "N more plans on records you can't open".
- **Sidebar.** What's being done (Lucide `Flag`) after Waiting on you, for
  every member; Initiatives is gone from the sidebar.
```

`docs/04-app-flow.md`:

1. In the routes table, after the `/brain/review` row, add:

```markdown
| `/brain/doing` | `DoingPage`: What's being done, scoped Me / My team / Company (`?scope=`), sections in `?section=` | auth |
| `/brain/initiatives` | redirect to `/brain/doing?section=initiatives` | auth |
```

and change `| `/brain/{graph,initiatives,requests,anomalies}` |` to `| `/brain/{graph,requests,anomalies}` |`.
2. In "Navigation surfaces", the KNOWLEDGE BRAIN clause becomes "KNOWLEDGE BRAIN (What changed, Waiting on you, with the reader's Me count as its badge, and What's being done, for everyone; Feature Requests and Anomalies for `view_all_accounts`)".
3. In "### 4.11 Brain", in What changed's paragraph replace "Knowledge by function sits under Company only, for `view_all_accounts` readers." with "Knowledge by function has moved to What's being done." and replace "Initiatives, Feature Requests and Anomalies are likewise unchanged, still behind `view_all_accounts`." with "Feature Requests and Anomalies are likewise unchanged, still behind `view_all_accounts`." Then, before "Agents, Skills and Feedback Log have moved…", add:

```markdown
What's being done (`/brain/doing`, spec 2026-10-05 Doing §2) is open to
every member, on the same scope switch: `GET /brain/doing/?scope=` gives the
initiatives on the scope's book (Me: those I own or cut to me; My team: the
same for my desk; Company: all), the plans on its records (open first, then
the last 30 days' done and cancelled, with health and ARR then → now), the
rules owned on the desk (the full counts on my own, fired only on others'),
and how many plans the reader can't open. Section links set `?section=`,
which `useBrainScope` keeps while it settles `?scope=`. New initiative
starts one on the reader's own book (`POST /brain/initiatives/?scope=me`),
or in My team on a report's (`for_user`, chosen from `GET /auth/members/`
through `reports_to`), offering only the metrics with an owner cut; in
Company, for `view_all_accounts`, the full form posts to
`/metrics/initiatives/` as before. The page then reads `doing/` again and
focuses the new row. Edit, Mark done, Abandon and Reopen send `PATCH
/brain/initiatives/<id>/` once each; a 403 "You can't change this
initiative." stays on the row. Knowledge by function shows in Company for
`view_all_accounts` readers. `/brain/initiatives` redirects to
`/brain/doing?section=initiatives`.
```

4. In "## 6. Redux map", the opening becomes "30 slices. The ones that matter. What changed (`/brain`), Waiting on you (`/brain/waiting`) and What's being done (`/brain/doing`) are not among them: they read `/brain/` through hooks (`useBrainScope`, `useChanged`, `useKept`, `useWaiting`, `useWaitingCount`, `useDoing`), no slice." (30 is the store's real count after this delivery: `src/store.ts` registers 31 reducers today, the document's "26" is stale, and `initiatives` leaves) and the table row `| `metrics`, `initiatives` | Initiatives |` becomes `| `metrics` | Metric types for the Brain's initiative form (its reads have had no page since Brain delivery 3) |`.

`.agents/workflows/repo-architecture.md`:

1. `features/brain/` line: append "; What's being done's copy (`doingText.ts`), types and API; testDoingFixtures.ts".
2. `components/brain/` line: becomes "What changed, Waiting on you and What's being done: ScopeSwitch, useBrainScope, useChanged, useKept, ScopeBriefCard, MovesList, WhyPanel, MeasureTable, ChangedSkeleton, useWaiting, useWaitingCount, WaitingDesk, WaitingRow, ProposalDecision, WaitingSkeleton, LostAccessNotice, useDoing, InitiativeForm, InitiativeRow, DoingPlanRow, DoingRuleRow, DoingSkeleton, KnowledgeByFunctionPanel (shown on What's being done), styles; own house-rules suite" (drop `formatMetric` if Task 7 deleted it).
3. Routes line: "├── brain/*                    → BrainRoutes (What changed, Waiting on you and What's being done open to all; `/brain/review` and `/brain/initiatives` redirect; the rest needs view_all_accounts)".
4. If the file lists `features/initiatives/`, remove that line.

- [ ] **Step 5: The full run**

Run, one at a time:

```bash
npx vitest run
npx tsc -b --noEmit
npm run lint
npm run build
```

Expected: every test passes; no type errors; lint ends `15 problems (0 errors, 15 warnings)`; the build succeeds. Never run prettier.

- [ ] **Step 6: Commit**

```bash
git add src/components/brain/houseRules.test.ts src/e2e/brain.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): What's being done journeys, house rules and product documents

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

**Spec coverage.**
- §0 / Decision 1 (three sections filtered to the scope's book): Task 6 page; Task 2 stub filters per scope.
- Decision 2 (who is in each scope's initiatives): Task 2 `initiativesIn`, tested for Me [1], My team [1, 3], Company all; Task 6 Me/Team/Company cases.
- Decision 3 (anyone starts on their own book; My team asks whose; Company for view_all; owner, anyone above, view_all edit): Task 1 `canStart`, `bookPeople`; Task 2 stub start/edit rules and sentences; Task 3 form modes; Task 4 edit permission and 403; Task 6 New initiative per scope; Task 8 journey.
- Decision 4 (then → now; "Started before starting figures were kept"): Task 1 `thenNowParts`; Task 5 plan row; Task 8 journey.
- Decision 5 (rules on the desk; owner's full counts, fired for others, no record names): Task 1 `lastRunParts`; Task 5 rule row; Task 6 Team case.
- Decision 6 (Knowledge by function in Company, under the three sections): Task 6; Task 7 removes it from What changed; Task 8 journey.
- Decision 7 (redirect; Initiatives leaves the sidebar): Task 7 routes and sidebar; Task 8 journey.
- §2.1 header, section links synced to `?section=`: Task 6 (and the `useBrainScope` change); rows per section: Tasks 4, 5; New initiative with the existing form limited to owner-cut metrics: Task 3; empty states, skeleton, error with Retry, 375px: Task 6; house rules: Task 8.
- §2.2 sidebar (`Flag`, after Waiting on you), redirect, What changed drops the panel: Task 7.
- §2.3 tests: each listed case maps to Tasks 2–8 above; the contract stub is Task 2; the e2e is Task 8.
- §3 shapes: Task 1 types, Task 2 stub, with the additive fields in Contract notes 5–6 and 10–11.

**Placeholder scan.** No TBD/TODO; every code step carries the code; every test step carries the test.

**Type consistency.** `DoingInitiative`, `DoingPlan`, `DoingRule`, `DoingPayload`, `BookInitiativeWrite`, `InitiativeWrite`, `InitiativePatch`, `DeskMember` (Task 1) are the names used in Tasks 2–8; `startInitiative(scope, body)`, `editInitiative(id, patch)`, `createCompanyInitiative(body)` (Task 2) match their callers in Tasks 3–4; `InitiativeForm` props (`mode`, `scope`, `reader`, `onSaved(id)`, `onCancel`) match Task 6; `EditInitiativeForm`/`CloseInitiativeForm` props match Task 4; `useDoing` returns `replace`, used by Task 6; fixture names (`ALICE_PLAN`, `CARL_PLAN`, `DANA_PLAN`, `MY_DOING_RULE`, `CARL_DOING_RULE`, `DANA_DOING_RULE`, `FIRST_NEW_ID`, `BOOK_BODY`, `COMPANY_BODY`, `doingWorld`) are defined in Task 2 and used unchanged after.
