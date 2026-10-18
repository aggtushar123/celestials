# Brain, delivery 1: scopes and "What changed" (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Brain Overview with **What changed** at `/brain`, open to every member and scoped **Me · My team · Company** (a switch carried in `?scope=` and remembered in `localStorage`), showing the scope's brief (kept, stale, or Write my brief, sent once), what moved materially with drivers, handovers and an inline **Why?** explanation (Explain this, sent once), and every metric in one compact list; move Agents, Skills and Feedback Log to **Settings > AI usage / AI skills / AI feedback**; drop the Knowledge Graph from the sidebar.

**Architecture:**
- **`src/features/brain/` (new, pure, unit-tested):** the §4 contract types (`brainTypes.ts`), the scope choice and its remembered value (`brainScope.ts`, the only file that touches `localStorage`), display text and the spec's sentences (`brainText.ts`), the API and the scope-refusal test (`brainApi.ts`), fixtures (`testBrainFixtures.ts`) and a stateful contract stub (`testBrain.ts`, `stubBrain`). No Redux: as Canvas, Segments and Plans, the page reads through small hooks.
- **`src/components/brain/` (new files beside the old):** `useBrainScope` (server scopes + URL + memory + the 403 fallback), `ScopeSwitch`, `useKept` (a kept AI text: read free, written once), `useChanged`, `ScopeBriefCard`, `MovesList`, `WhyPanel`, `MeasureTable`, `ChangedSkeleton`, `styles.ts`, `houseRules.test.ts`. `BriefPanel`, `ExplanationCard`, `SignalsPanel`, `MetricLayerPanel`, `DriversPanel` and their tests are deleted (Task 8); `QuestionsWaitingPanel` and `KnowledgeByFunctionPanel` stay unchanged.
- **`src/pages/brain/`:** `WhatChanged.tsx` (new), `testPages.tsx` (new, test-only), `BrainRoutes.tsx` (index is What changed for everyone; old paths redirect), `Dashboard.tsx` deleted.
- **Elsewhere (modify):** `Sidebar.tsx` (Brain group for everyone, starting with What changed), `Navbar.tsx` (three AI tabs in the Settings strip; "Brain" is not a heading on `/brain`), `App.tsx` (three Settings routes), `pages/settings/aiSettingsTabs.ts` (new), `pages/brain/Skills.tsx` (its link), `features/metrics/metricsSlice.ts` and `components/brain/formatMetric.ts` (trimmed to what Initiatives still uses).

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, react-router 7 (`BrowserRouter`), lucide-react, Vitest 5 + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-brain-what-changed-design.md`. This plan covers §0 (context), §2 (frontend) and §4 (the API contract, binding; field names used exactly). §1 is the backend, read for behaviour the stub must mirror (scope keys and who is offered what §1.1, baseline and team-changed §1.3, handovers §1.4, brief and explanation refusals §1.5–1.6, the scope check order).

**The API contract** is spec §4. The backend is built in parallel in `revenact-backend` against the same section, so every test here runs against `stubBrain` (Task 2), never a live server. The stub answers in §4's shapes and checks in the backend's order: **400 `SCOPE_UNKNOWN` before 403 `SCOPE_NOT_ALLOWED`**. Where §4 is silent or does not fit the real frontend, the assumption is in **Contract notes** below. No §4 shape is changed.

**Branch:** `feat/brain-changed` in `react-ts-app`, already checked out (the spec is its only commit over `main`). Stay on it. Never push. Do not touch `revenact-backend`.

## Contract notes (assumptions to reconcile with the backend plan)

1. **`?scope=` is always sent.** Every Brain call carries `?scope=<key>`; the page never calls before the scope is settled. The stub treats a missing `scope` like an unknown one (400 `SCOPE_UNKNOWN`); if the backend defaults a missing scope instead, nothing here changes.
2. **Check order on explanations.** `GET/POST explanations/<metric>/?scope=` checks the scope first (400, then 403) and the metric after (404 `{"detail": "No such metric."}`). The stub does the same.
3. **A scope refusal is recognised by its code.** The frontend treats a response as "you lost this view" only when it is **403 with `code: "SCOPE_NOT_ALLOWED"`** (`isScopeRefusal`). Any other 403, and 400 `SCOPE_UNKNOWN`, are shown as ordinary errors.
4. **`generated_by` may be `null`** (a deleted user), on briefs and explanations; the "Written …" line then leaves out "by …". §4 shows only a string.
5. **`improved` is `boolean | null`** on a signal: `null` for a metric whose `better` is `none`, as the whole-organisation signals answer today. §4 shows only `false`.
6. **200 and 201 on POST read the same.** Either way the answer's `brief` (or `explanation`) replaces what the card shows; the frontend does not tell them apart.
7. **Refusal text.** 422, 429, 503 and 502 are `{"detail": "<message>"}`; `apiFetch` turns `detail` into `ApiError.message`, which the card shows as given (spec §2.3 item 2).
8. **`since_kind` is ignored when `since` is `null`** (Company with no month-end yet); the page reads "No month-end recorded yet; moves start from the first one".
9. **`handover.people` is one list for both directions.** The page names the people on the "handed to" clause when `out > 0`, else on "taken over from" (Decision 9).
10. **No `metric_label` on an explanation.** The Why? panel takes its label from the signal row it opened under.
11. **`/questions/` and `/knowledge/activity/`** are read by the two unchanged Company knowledge panels; the stub answers both empty so page tests never hit an unstubbed path.

## Global Constraints

Quoted text is verbatim from the caller's brief, the spec §2.4, or `.claude/skills/revenact-design/SKILL.md` §1 and §4.

- **Tokens only, no raw colours.** "Zero raw hex, rgb, or named colours in `src/**/*.tsx`; tokens only." Use `bg-surface`, `bg-subtle`, `text-ink`, `text-ink-muted`, `border-line`, `bg-accent`, `text-on-accent`, and the semantic `text-success` / `text-danger` for trend only ("Semantic colours carry meaning only (status, trend, severity), never decoration").
- **DM Mono tabular-nums for figures.** Every then, now and change figure uses `MONO` (`font-mono-brand tabular-nums`, from `components/organizations/portfolio/styles.ts`).
- **≤4 type sizes per surface.** Only `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]`.
- **No card in a card.** "Group with `border-line`, `divide-y`, or whitespace." The brief card, the moves list and the measure list are each one bordered surface; the Why? panel opens inside a row as a flat block (`border-t`, `bg-subtle`), never a bordered box.
- **No glass on these pages.** No `rv-card-glass`, `rv-glass-inner` or `backdrop-blur` ("the Ask rail isn't part of this round").
- **44px touch targets or `min-h-9` dense desktop controls.** Every button, link and select gets `min-h-11 sm:min-h-9`, directly or through `BUTTON`, `PRIMARY`, `QUIET`, or a style constant in the same file.
- **Empty / loading (skeleton) / error states.** "Every list/table/chart has designed empty, loading (skeleton matching layout, not spinner), and error states."
- **375 / 768 / 1024 / 1440 with no horizontal scroll.** The header stacks below `sm`; the switch is a select below `sm`; each measure row stacks below `sm`. "`min-h-[100dvh]` never `h-screen`."
- **localStorage wrapped in try/catch.** Only `features/brain/brainScope.ts` touches it, key `revenact_brain_scope`, every read and write inside `try { … } catch { … }`.
- **Lucide only**, 16px inline, every icon `aria-hidden="true"`; no emoji.
- **No colour-only meaning.** A change always carries its direction word ("up", "down", "unchanged") as well as its colour.
- **Copy.** Sentence case; no em dashes in UI copy; the spec's sentences exactly: "What changed", "Since 30 Sep month-end", "Since 5 Oct, when your view started", "Your team changed on 12 Oct; moves start from then", "Watch next", "Written 5 Oct by Alice Admin for My team", "The numbers have moved since this brief", "Write again", "Write my brief", "Uses AI credits.", "Write the company brief", "Writing…", "What moved", "most of it: Analytics Suite", "includes 2 customers handed to Dana CSM", "Why?", "Explain this", "2 more accounts you can't open", "Nothing moved materially since 30 Sep.", "Everything we measure", "Not measured", "You don't own any customers yet", "You no longer have access to that view."
- **Submit once.** Write my brief and Explain this go through `useSubmitOnce` (`components/plans/useSubmitOnce.ts`); tests double-click and count one request.
- **Commands.** `npx vitest run`, `npm run lint` and `npm run build` pass. Never run prettier. Type-check with `npx tsc -b --noEmit`; run focused tests with `npx vitest run --maxWorkers=2 <paths>`, one process at a time; `npm run lint` must end with **15 problems (0 errors, 15 warnings)** (the branch's baseline, measured 2026-10-05).
- **Commits** are conventional (`feat(brain): …`, `refactor(brain): …`, `test(e2e): …`) and every commit message ends with a blank line and exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
  Never push.
- **Tests** follow the `testing` skill: unit tests per module; component tests with `fetch` stubbed by `stubBrain`; page tests on the real router; one jsdom journey in `src/e2e/brain.test.tsx`; a Brain house-rules suite reusing `houseRuleSuite` and `rowsIconsTargetsSuite`. Every test must be able to fail, and its title claims only what it asserts.
- **Product documents** change in the same branch and describe only what ships: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (Task 9).

## Decisions made while planning (the owner may overrule any)

1. **Folders.** `src/features/brain/` (pure), new files in `src/components/brain/`, the page in `src/pages/brain/WhatChanged.tsx`. No Redux slice for the Brain; `metricsSlice` keeps only what Initiatives reads (Task 8).
2. **The URL is written once the scope settles**, with `replace` (switching views adds no history entries). The page never fetches before `?scope=` names an offered scope, so one switch is one `changed/` read.
3. **Only a click on the switch is remembered.** Opening a link with `?scope=team` shows My team but does not overwrite the stored choice.
4. **A link naming a scope the reader isn't offered** (`?scope=company` for a CSM) moves to the stored or default scope and shows the same "You no longer have access to that view." A value that is not a scope key at all is replaced silently.
5. **After a 403 `SCOPE_NOT_ALLOWED`** the page forgets the stored scope, re-reads `scopes/` (the org chart may have changed) and moves to its new default, keeping the notice until the reader picks a view.
6. **Errors read "Try again"** through the house `ErrorBlock`, as every other page (the spec says "Retry"). Load errors use fixed copy ("Could not load what changed."); write errors show the server's `detail`.
7. **An empty My team** reads "Your team doesn't own any customers yet" (the spec names only the empty Me). An empty scope shows the header, the switch and that empty state only: no brief, no lists.
8. **Company with no month-end:** the line reads "No month-end recorded yet; moves start from the first one", What moved reads "Nothing to compare yet.", and a change with no earlier figure reads "Not compared".
9. **Handover copy:** out only "includes 2 customers handed to Dana CSM"; in only "includes 1 customer taken over from Dana CSM"; both "includes 1 customer taken over and 2 customers handed to Dana CSM"; no names "includes 1 customer handed on".
10. **A stale explanation** says "The numbers have moved since this explanation" and offers **Explain again**, mirroring the brief.
11. **"Everything we measure" is a list of rows, not a `<table>`** (house rule "rows, never tables", enforced by `rowsIconsTargetsSuite`): a header row from `sm`, and on phones each row stacks with its own Then / Now / Change labels.
12. **The Navbar title on `/brain`** stays "Brain" but is a paragraph, not an `h1`, so "What changed" is the page's only `h1`. Other Brain pages keep today's title.
13. **Settings > AI tabs** show only to `view_all_accounts` (their pages redirect everyone else to `/dashboard`, as today). Order: Agent Access, AI usage, AI skills, AI feedback.
14. **`/brain/<anything unknown>`** goes to `/brain` for everyone (it went to `/dashboard` for a CSM, because What changed was gated). `/brain/graph` stays behind `view_all_accounts`.
15. **The Review Queue badge** stays for `view_all_accounts` only (its count is only fetched for them), as today.
16. **Brief "Write" buttons:** "Write my brief" for Me and My team, "Write the company brief" for Company, "Write again" on a stale brief; the first two are the page's one `PRIMARY`, "Write again" is a quiet `BUTTON`.
17. **Company knowledge** shows under Company only, in a section labelled "Company knowledge". The panels gate themselves on `view_all_accounts`, so a Leadership member without that capability sees Company without them (unchanged panels, spec §2.3 item 5).
18. **`formatMetric.ts`** keeps `formatMetricValue` (Initiatives); `formatMetricChange` and `monthName` go with their last users (Task 8). The new page formats through `brainText.ts`.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/brain/brainTypes.ts` (new) | §4's types, field for field; `SCOPE_KEYS` |
| `src/features/brain/brainScope.ts` (new) | `revenact_brain_scope` read/write/forget (try/catch), `isScopeKey`, `chooseScope` |
| `src/features/brain/brainText.ts` (new) | The spec's sentences (`SAY`), since line, value and change text, tone, driver, handover, written line, hidden accounts |
| `src/features/brain/brainApi.ts` (new) | `apiFetch` wrappers for every §4 endpoint; `isScopeRefusal` |
| `src/features/brain/testBrainFixtures.ts`, `testBrain.ts` (new, test-only) | §4-shaped payloads; `stubBrain` (stateful, 400 before 403, 404 metric, refusals, held writes), `requests` |
| `src/components/brain/useBrainScope.ts` (new) | Server scopes + `?scope=` + memory; the 403 fallback and its notice |
| `src/components/brain/ScopeSwitch.tsx` (new) | Me · My team · Company: segmented from `sm`, select below, a label for one scope |
| `src/components/brain/useKept.ts` (new) | A kept AI text for one scope: read on mount and Try again; written once |
| `src/components/brain/useChanged.ts` (new) | `GET changed/?scope=` with Try again |
| `src/components/brain/styles.ts` (new) | `TONE_CLASS` (good/bad/neutral → token) |
| `src/components/brain/WhyPanel.tsx`, `MovesList.tsx`, `MeasureTable.tsx`, `ScopeBriefCard.tsx`, `ChangedSkeleton.tsx` (new) | The page's parts |
| `src/components/brain/houseRules.test.ts` (new) | The Brain house rules |
| `src/pages/brain/WhatChanged.tsx`, `testPages.tsx` (new) | The page; its test render |
| `src/pages/brain/BrainRoutes.tsx` (+test) (modify) | Index for everyone; redirects |
| `src/pages/settings/aiSettingsTabs.ts` (+test) (new) | The three AI tabs, shared by the Navbar and checked against `App.tsx` |
| `src/App.tsx`, `src/components/layout/Sidebar.tsx` (+test), `src/components/layout/Navbar.tsx` (+test), `src/pages/brain/Skills.tsx` (modify) | Routes, sidebar, title and tabs, a link |
| `src/pages/brain/Dashboard.tsx`; `src/components/brain/{BriefPanel,ExplanationCard,SignalsPanel,MetricLayerPanel,DriversPanel}.tsx` and `{BriefPanel,ExplanationCard,MetricLayerPanel,whyPanels}.test.tsx` (delete) | The old Overview |
| `src/features/metrics/metricsSlice.ts`, `src/components/brain/formatMetric.ts` (modify) | Trimmed to Initiatives' needs |
| `src/e2e/brain.test.tsx` (new) | The journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (modify) | Product documents |

---

### Task 1: The contract types, the remembered scope and the display text

Spec §4 (types), §2.2 (stored scope, dropped when no longer offered), §2.3 (header line, change with a direction word, top driver, handover, "Written …", hidden accounts, empty lines); Contract notes 4, 5, 8, 9; Decisions 4, 7, 8, 9.

**Files:**
- Create: `src/features/brain/brainTypes.ts`, `src/features/brain/brainScope.ts`, `src/features/brain/brainText.ts`
- Test: `src/features/brain/brainScope.test.ts`, `src/features/brain/brainText.test.ts`

**Interfaces:**
- Consumes: `CurrencyCode` (`features/auth/authSlice`); `MetricUnit` (`features/metrics/metricsSlice`); `formatCompactMoney` (`features/customers/formatters`); `dayMonth` (`features/contacts/contactsFormat`).
- Produces:
  - `brainTypes.ts`: `ScopeKey`, `SCOPE_KEYS`, `Better`, `MetricUnit`, `ScopeOption`, `ScopesPayload`, `ChangedMetric`, `Driver`, `Handover`, `ChangedSignal`, `ChangedPayload`, `ScopeBrief`, `BriefPayload`, `WrittenBrief`, `ScopeExplanation`, `ExplanationPayload`, `WrittenExplanation`.
  - `brainScope.ts`: `SCOPE_STORAGE_KEY`, `isScopeKey(v): v is ScopeKey`, `readStoredScope(): ScopeKey | null`, `storeScope(key): void`, `forgetScope(): void`, `ScopeChoice`, `chooseScope(url: string | null, stored: ScopeKey | null, offered: ScopesPayload): ScopeChoice`.
  - `brainText.ts`: `SAY`, `Tone`, `dayOf(iso)`, `sinceLine(c)`, `nothingMoved(since)`, `valueText(unit, value, currency)`, `changeText(unit, change, currency)`, `toneOf(better, change, improved?)`, `driverText(drivers)`, `handoverText(h?)`, `writtenLine(brief, scopeLabel)`, `hiddenText(n)`, `emptyTitle(scope)`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/brain/brainScope.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseScope, forgetScope, isScopeKey, readStoredScope, SCOPE_STORAGE_KEY, storeScope } from './brainScope';
import type { ScopesPayload } from './brainTypes';

const ALL: ScopesPayload = {
  scopes: [{ key: 'me', label: 'Me' }, { key: 'team', label: 'My team' }, { key: 'company', label: 'Company' }],
  default: 'company',
};
const ME_ONLY: ScopesPayload = { scopes: [{ key: 'me', label: 'Me' }], default: 'me' };

describe('the remembered scope (spec §2.2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads, writes and forgets revenact_brain_scope, ignoring anything that is not a scope', () => {
    expect(readStoredScope()).toBeNull();
    storeScope('team');
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('team');
    expect(readStoredScope()).toBe('team');
    localStorage.setItem(SCOPE_STORAGE_KEY, 'everything');
    expect(readStoredScope()).toBeNull();
    forgetScope();
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBeNull();
  });

  it('keeps working when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(readStoredScope()).toBeNull();
    expect(() => storeScope('me')).not.toThrow();
    expect(() => forgetScope()).not.toThrow();
  });

  it('knows the three keys only', () => {
    expect(['me', 'team', 'company', 'all', null].map(isScopeKey)).toEqual([true, true, true, false, false]);
  });
});

describe('chooseScope', () => {
  it('takes the URL when the server offers it', () => {
    expect(chooseScope('team', 'me', ALL)).toEqual({ key: 'team', dropStored: false, urlRefused: false });
  });

  it('falls back to the remembered choice, then the server default', () => {
    expect(chooseScope(null, 'me', ALL)).toEqual({ key: 'me', dropStored: false, urlRefused: false });
    expect(chooseScope(null, null, ALL)).toEqual({ key: 'company', dropStored: false, urlRefused: false });
  });

  it('drops a remembered scope the server no longer offers, without a notice', () => {
    expect(chooseScope(null, 'company', ME_ONLY)).toEqual({ key: 'me', dropStored: true, urlRefused: false });
  });

  it('refuses a URL scope the reader is not offered (Decision 4), but replaces junk silently', () => {
    expect(chooseScope('company', null, ME_ONLY)).toEqual({ key: 'me', dropStored: false, urlRefused: true });
    expect(chooseScope('everything', null, ME_ONLY)).toEqual({ key: 'me', dropStored: false, urlRefused: false });
  });
});
```

Create `src/features/brain/brainText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  changeText,
  driverText,
  emptyTitle,
  handoverText,
  hiddenText,
  nothingMoved,
  SAY,
  sinceLine,
  toneOf,
  valueText,
  writtenLine,
} from './brainText';
import type { ScopeBrief } from './brainTypes';

const BRIEF: ScopeBrief = {
  id: 9, scope: 'team', as_of: '2026-10-05', baseline: '2026-09-30', headline: 'h', body: 'b', watch: [],
  generated_at: '2026-10-05T09:12:00Z', generated_by: 'Alice Admin', stale: false,
};

describe('brain display text', () => {
  it('says what the moves are compared with (spec §2.3 item 1)', () => {
    expect(sinceLine({ since: '2026-09-30', since_kind: 'month_end', team_changed_on: null })).toBe('Since 30 Sep month-end');
    expect(sinceLine({ since: '2026-10-05', since_kind: 'baseline', team_changed_on: null })).toBe('Since 5 Oct, when your view started');
    expect(sinceLine({ since: '2026-10-12', since_kind: 'baseline', team_changed_on: '2026-10-12' })).toBe('Your team changed on 12 Oct; moves start from then');
    expect(sinceLine({ since: null, since_kind: 'month_end', team_changed_on: null })).toBe(SAY.NO_MONTH_END);
  });

  it('says nothing moved since the day compared with, or that nothing can be compared yet', () => {
    expect(nothingMoved('2026-09-30')).toBe('Nothing moved materially since 30 Sep.');
    expect(nothingMoved(null)).toBe('Nothing to compare yet.');
  });

  it('writes a value in its unit, and null as Not measured', () => {
    expect(valueText('money', 114540, 'USD')).toBe('$114.5K');
    expect(valueText('percent', 104, 'USD')).toBe('104%');
    expect(valueText('count', 12.4, 'USD')).toBe('12');
    expect(valueText('money', null, 'USD')).toBe('Not measured');
  });

  it('writes a change with a direction word, never only a sign (spec §2.3 item 3)', () => {
    expect(changeText('money', 50450, 'USD')).toBe('up $50.5K');
    expect(changeText('money', -13400, 'USD')).toBe('down $13.4K');
    expect(changeText('percent', -4, 'USD')).toBe('down 4 pts');
    expect(changeText('percent', 1, 'USD')).toBe('up 1 pt');
    expect(changeText('count', 0, 'USD')).toBe('unchanged');
    expect(changeText('money', null, 'USD')).toBe('Not compared');
  });

  it('reads good or bad news from the direction that is better, or from the server', () => {
    expect([toneOf('down', 50450), toneOf('up', 12000), toneOf('up', -4)]).toEqual(['bad', 'good', 'bad']);
    expect([toneOf('none', 5), toneOf('up', 0), toneOf('up', null)]).toEqual(['neutral', 'neutral', 'neutral']);
    expect([toneOf('up', 5, false), toneOf('down', 5, true), toneOf('none', 5, null)]).toEqual(['bad', 'good', 'neutral']);
  });

  it('names the top driver', () => {
    expect(driverText([{ dimension: 'product', member: '4', label: 'Analytics Suite', change: 50450 }, { dimension: 'owner', member: '5', label: 'Dana CSM', change: 10 }])).toBe('most of it: Analytics Suite');
    expect(driverText([])).toBeNull();
  });

  it('says how many customers changed hands, and with whom (Decision 9)', () => {
    expect(handoverText({ in: 0, out: 2, people: ['Dana CSM'] })).toBe('includes 2 customers handed to Dana CSM');
    expect(handoverText({ in: 1, out: 0, people: ['Dana CSM'] })).toBe('includes 1 customer taken over from Dana CSM');
    expect(handoverText({ in: 1, out: 2, people: ['Dana CSM', 'Eli CSM'] })).toBe('includes 1 customer taken over and 2 customers handed to Dana CSM and Eli CSM');
    expect(handoverText({ in: 0, out: 1, people: [] })).toBe('includes 1 customer handed on');
    expect(handoverText({ in: 0, out: 0, people: [] })).toBeNull();
    expect(handoverText(undefined)).toBeNull();
  });

  it('says who wrote a brief, when, and for which view', () => {
    expect(writtenLine(BRIEF, 'My team')).toBe('Written 5 Oct by Alice Admin for My team');
    expect(writtenLine({ ...BRIEF, generated_by: null }, 'Me')).toBe('Written 5 Oct for Me');
  });

  it('counts the accounts the reader cannot open', () => {
    expect([hiddenText(0), hiddenText(1), hiddenText(2)]).toEqual([null, "1 more account you can't open", "2 more accounts you can't open"]);
  });

  it('words an empty view by whose book it is (Decision 7)', () => {
    expect(emptyTitle('me')).toBe("You don't own any customers yet");
    expect(emptyTitle('team')).toBe("Your team doesn't own any customers yet");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/brain`
Expected: FAIL, "Failed to resolve import './brainScope'" and "'./brainText'".

- [ ] **Step 3: Write the types**

Create `src/features/brain/brainTypes.ts`:

```ts
// The /api/v1/brain/ contract (spec 2026-10-05 §4), field for field. Contract
// notes 4 and 5 widen `generated_by` and `improved` to allow null.
import type { CurrencyCode } from '../auth/authSlice';
import type { MetricUnit } from '../metrics/metricsSlice';

export type { MetricUnit };
export type ScopeKey = 'me' | 'team' | 'company';
export const SCOPE_KEYS: readonly ScopeKey[] = ['me', 'team', 'company'];
/** Which direction is good news; 'none' is context. */
export type Better = 'up' | 'down' | 'none';

export interface ScopeOption {
  key: ScopeKey;
  label: string;
}

/** GET scopes/: only the scopes the reader may use, narrowest first. */
export interface ScopesPayload {
  scopes: ScopeOption[];
  default: ScopeKey;
}

export interface ChangedMetric {
  key: string;
  label: string;
  unit: MetricUnit;
  better: Better;
  now: number | null;
  then: number | null;
  change: number | null;
  material: boolean;
}

export interface Driver {
  dimension: string;
  member: string;
  label: string;
  change: number;
}

/** Present only on money metrics in Me and My team, when a customer moved. */
export interface Handover {
  in: number;
  out: number;
  people: string[];
}

export interface ChangedSignal {
  key: string;
  label: string;
  unit: MetricUnit;
  better: Better;
  now: number;
  then: number;
  change: number;
  improved: boolean | null;
  drivers: Driver[];
  handover?: Handover;
}

/** GET changed/?scope= */
export interface ChangedPayload {
  scope: ScopeKey;
  as_of: string;
  /** Null only when Company has no month-end yet. */
  since: string | null;
  since_kind: 'month_end' | 'baseline';
  team_changed_on: string | null;
  currency: CurrencyCode;
  /** A Me or My team scope that covers no customers. */
  empty: boolean;
  metrics: ChangedMetric[];
  signals: ChangedSignal[];
}

export interface ScopeBrief {
  id: number;
  scope: ScopeKey;
  as_of: string;
  baseline: string | null;
  headline: string;
  /** Paragraphs separated by blank lines. */
  body: string;
  watch: string[];
  generated_at: string;
  generated_by: string | null;
  stale: boolean;
}

export interface BriefPayload {
  brief: ScopeBrief | null;
}

/** POST brief/?scope= (201 written, 200 written by another request). */
export interface WrittenBrief {
  brief: ScopeBrief;
}

export interface ScopeExplanation {
  id: number;
  metric: string;
  scope: ScopeKey;
  as_of: string;
  text: string;
  evidence: string[];
  /** Accounts in the scope the reader can't open. */
  hidden: number;
  generated_at: string;
  generated_by: string | null;
  stale: boolean;
}

export interface ExplanationPayload {
  explanation: ScopeExplanation | null;
}

export interface WrittenExplanation {
  explanation: ScopeExplanation;
}
```

- [ ] **Step 4: Write the remembered scope**

Create `src/features/brain/brainScope.ts`:

```ts
// The Brain's scope choice (spec §2.2): the URL first, then the reader's last
// choice (localStorage, every touch wrapped: storage can be off), then the
// server's default. The only file in the Brain that touches storage.
import { SCOPE_KEYS, type ScopeKey, type ScopesPayload } from './brainTypes';

export const SCOPE_STORAGE_KEY = 'revenact_brain_scope';

export function isScopeKey(value: unknown): value is ScopeKey {
  return typeof value === 'string' && (SCOPE_KEYS as readonly string[]).includes(value);
}

export function readStoredScope(): ScopeKey | null {
  try {
    const raw = localStorage.getItem(SCOPE_STORAGE_KEY);
    return isScopeKey(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeScope(key: ScopeKey): void {
  try {
    localStorage.setItem(SCOPE_STORAGE_KEY, key);
  } catch {
    // Storage is off: the choice still holds for this visit, in the URL.
  }
}

export function forgetScope(): void {
  try {
    localStorage.removeItem(SCOPE_STORAGE_KEY);
  } catch {
    // Storage is off: there is nothing remembered to forget.
  }
}

export interface ScopeChoice {
  key: ScopeKey;
  /** The remembered scope is no longer offered: forget it. */
  dropStored: boolean;
  /** The URL named a real scope the reader isn't offered (Decision 4). */
  urlRefused: boolean;
}

export function chooseScope(url: string | null, stored: ScopeKey | null, offered: ScopesPayload): ScopeChoice {
  const offers = (key: string | null): key is ScopeKey => key !== null && offered.scopes.some((s) => s.key === key);
  const dropStored = stored !== null && !offers(stored);
  if (offers(url)) return { key: url, dropStored, urlRefused: false };
  return { key: offers(stored) ? stored : offered.default, dropStored, urlRefused: isScopeKey(url) };
}
```

- [ ] **Step 5: Write the display text**

Create `src/features/brain/brainText.ts`:

```ts
// What the Brain says (spec §2.3), in one place so tests and pages share it.
import type { CurrencyCode } from '../auth/authSlice';
import { dayMonth } from '../contacts/contactsFormat';
import { formatCompactMoney } from '../customers/formatters';
import type { Better, ChangedPayload, Driver, Handover, MetricUnit, ScopeBrief, ScopeKey } from './brainTypes';

export const SAY = {
  TITLE: 'What changed',
  LOST_ACCESS: 'You no longer have access to that view.',
  NOT_MEASURED: 'Not measured',
  NOT_COMPARED: 'Not compared',
  NO_MONTH_END: 'No month-end recorded yet; moves start from the first one',
  NOTHING_TO_COMPARE: 'Nothing to compare yet.',
  EMPTY_DETAIL: 'Their numbers show here once customers are assigned.',
  BRIEF: 'Brief',
  WATCH: 'Watch next',
  STALE_BRIEF: 'The numbers have moved since this brief',
  STALE_EXPLANATION: 'The numbers have moved since this explanation',
  WRITE_MINE: 'Write my brief',
  WRITE_COMPANY: 'Write the company brief',
  WRITE_AGAIN: 'Write again',
  WRITING: 'Writing…',
  CREDITS: 'Uses AI credits.',
  EXPLAIN: 'Explain this',
  EXPLAIN_AGAIN: 'Explain again',
  EXPLAINING: 'Explaining…',
  MOVED: 'What moved',
  MEASURE: 'Everything we measure',
  KNOWLEDGE: 'Company knowledge',
  LOAD_SCOPES: 'Could not load your views.',
  LOAD_CHANGED: 'Could not load what changed.',
  LOAD_BRIEF: 'Could not load the brief.',
  LOAD_EXPLANATION: 'Could not load the explanation.',
  WRITE_FAILED: 'Could not write the brief.',
  EXPLAIN_FAILED: 'Could not write the explanation.',
} as const;

export type Tone = 'good' | 'bad' | 'neutral';

/** "30 Sep", from a date or a timestamp, in UTC. */
export function dayOf(iso: string): string {
  return dayMonth(iso);
}

export function sinceLine(c: Pick<ChangedPayload, 'since' | 'since_kind' | 'team_changed_on'>): string {
  if (c.team_changed_on) return `Your team changed on ${dayOf(c.team_changed_on)}; moves start from then`;
  if (c.since === null) return SAY.NO_MONTH_END;
  return c.since_kind === 'baseline' ? `Since ${dayOf(c.since)}, when your view started` : `Since ${dayOf(c.since)} month-end`;
}

export function nothingMoved(since: string | null): string {
  return since ? `Nothing moved materially since ${dayOf(since)}.` : SAY.NOTHING_TO_COMPARE;
}

export function valueText(unit: MetricUnit, value: number | null, currency: CurrencyCode): string {
  if (value === null) return SAY.NOT_MEASURED;
  if (unit === 'money') return formatCompactMoney(value, currency);
  if (unit === 'percent') return `${value}%`;
  return String(Math.round(value));
}

/** "up $50.5K", "down 4 pts", "unchanged": the direction is a word, not only a colour. */
export function changeText(unit: MetricUnit, change: number | null, currency: CurrencyCode): string {
  if (change === null) return SAY.NOT_COMPARED;
  if (change === 0) return 'unchanged';
  const size = Math.abs(change);
  const amount = unit === 'percent' ? `${size} ${size === 1 ? 'pt' : 'pts'}` : valueText(unit, size, currency);
  return `${change > 0 ? 'up' : 'down'} ${amount}`;
}

/** Good or bad news. A signal brings the server's `improved`; a plain metric
 *  is read from the direction that is better. */
export function toneOf(better: Better, change: number | null, improved?: boolean | null): Tone {
  if (improved !== undefined) return improved === null ? 'neutral' : improved ? 'good' : 'bad';
  if (change === null || change === 0 || better === 'none') return 'neutral';
  return (better === 'up') === change > 0 ? 'good' : 'bad';
}

export function driverText(drivers: Driver[]): string | null {
  return drivers.length ? `most of it: ${drivers[0].label}` : null;
}

function listNames(names: string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const customers = (n: number) => `${n} ${n === 1 ? 'customer' : 'customers'}`;

export function handoverText(h?: Handover): string | null {
  if (!h || (h.in === 0 && h.out === 0)) return null;
  const who = listNames(h.people);
  if (h.out === 0) return `includes ${customers(h.in)} taken over${who ? ` from ${who}` : ''}`;
  const out = `${customers(h.out)} handed ${who ? `to ${who}` : 'on'}`;
  return h.in === 0 ? `includes ${out}` : `includes ${customers(h.in)} taken over and ${out}`;
}

export function writtenLine(brief: Pick<ScopeBrief, 'generated_at' | 'generated_by'>, scopeLabel: string): string {
  return `Written ${dayOf(brief.generated_at)}${brief.generated_by ? ` by ${brief.generated_by}` : ''} for ${scopeLabel}`;
}

export function hiddenText(n: number): string | null {
  return n > 0 ? `${n} more ${n === 1 ? 'account' : 'accounts'} you can't open` : null;
}

export function emptyTitle(scope: ScopeKey): string {
  return scope === 'team' ? "Your team doesn't own any customers yet" : "You don't own any customers yet";
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/brain`
Expected: PASS (2 files).

- [ ] **Step 7: Commit**

```bash
git add src/features/brain/brainTypes.ts src/features/brain/brainScope.ts src/features/brain/brainText.ts src/features/brain/brainScope.test.ts src/features/brain/brainText.test.ts
git commit -m "feat(brain): scope contract types, remembered scope and display text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The API, the scope refusal and the stateful contract stub

Spec §4 (every endpoint, 400 `SCOPE_UNKNOWN` before 403 `SCOPE_NOT_ALLOWED`, 404 unknown metric, 201/200 writes, 422/429/503/502 refusals); §1.1 (default = widest); Contract notes 1, 2, 3, 11.

**Files:**
- Create: `src/features/brain/brainApi.ts`, `src/features/brain/testBrainFixtures.ts`, `src/features/brain/testBrain.ts`
- Test: `src/features/brain/testBrain.test.ts`

**Interfaces:**
- Consumes: Task 1's types; `apiFetch`, `ApiError` (`lib/apiClient`).
- Produces:
  - `brainApi.ts`: `fetchScopes(): Promise<ScopesPayload>`, `fetchChanged(scope)`, `fetchBrief(scope): Promise<BriefPayload>`, `writeBrief(scope): Promise<WrittenBrief>`, `fetchExplanation(metric, scope): Promise<ExplanationPayload>`, `writeExplanation(metric, scope): Promise<WrittenExplanation>`, `isScopeRefusal(err): boolean`.
  - `testBrainFixtures.ts`: `AS_OF`, `MONTH_END`, `LABELS`, `METRIC_KEYS`, `AT_RISK_SIGNAL`, `EXPANSION_SIGNAL`, `COMPANY`, `TEAM`, `ME_BASELINE`, `ME_EMPTY`, `TEAM_RESET`, `COMPANY_FIRST`, `COMPANY_BRIEF`, `ME_STALE_BRIEF`, `COMPANY_EXPLANATION`.
  - `testBrain.ts`: `BrainStub`, `stubBrain(stub?) → { spy, revoke(key), releaseWrites() }`, `requests(spy, method, part): string[]` (path + query without `/api/v1`).

- [ ] **Step 1: Write the failing test**

Create `src/features/brain/testBrain.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { fetchBrief, fetchChanged, fetchExplanation, fetchScopes, isScopeRefusal, writeBrief, writeExplanation } from './brainApi';
import { requests, stubBrain } from './testBrain';
import { COMPANY_BRIEF, COMPANY_EXPLANATION, TEAM } from './testBrainFixtures';

const refusal = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as ApiError);

describe('brain API on the contract stub (spec §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers only the reader’s scopes, narrowest first, with the widest as default', async () => {
    stubBrain({ offered: ['me', 'team'] });
    expect(await fetchScopes()).toEqual({ scopes: [{ key: 'me', label: 'Me' }, { key: 'team', label: 'My team' }], default: 'team' });
  });

  it('reads what changed and the kept brief for a scope', async () => {
    const { spy } = stubBrain();
    expect(await fetchChanged('team')).toEqual(TEAM);
    expect(await fetchBrief('company')).toEqual({ brief: COMPANY_BRIEF });
    expect(await fetchBrief('team')).toEqual({ brief: null });
    expect(requests(spy, 'GET', '/brain/')).toEqual(['/brain/changed/?scope=team', '/brain/brief/?scope=company', '/brain/brief/?scope=team']);
  });

  it('answers an unknown scope 400 before a refused one 403', async () => {
    const { revoke } = stubBrain();
    revoke('company');
    const unknown = await refusal(fetchChanged('everything' as never));
    expect([unknown?.status, (unknown?.body as { code: string }).code]).toEqual([400, 'SCOPE_UNKNOWN']);
    const refused = await refusal(fetchChanged('company'));
    expect([refused?.status, (refused?.body as { code: string }).code]).toEqual([403, 'SCOPE_NOT_ALLOWED']);
    expect(isScopeRefusal(refused)).toBe(true);
    expect(isScopeRefusal(unknown)).toBe(false);
    expect(isScopeRefusal(new ApiError(403, { detail: 'No.' }, 'No.'))).toBe(false);
  });

  it('checks the scope before the metric (Contract note 2)', async () => {
    const { revoke } = stubBrain();
    revoke('team');
    expect((await refusal(fetchExplanation('nope', 'team')))?.status).toBe(403);
    const missing = await refusal(fetchExplanation('nope', 'company'));
    expect([missing?.status, missing?.message]).toEqual([404, 'No such metric.']);
  });

  it('writes a brief and an explanation, then reads them back', async () => {
    stubBrain({ hidden: 2 });
    const { brief } = await writeBrief('team');
    expect(brief).toMatchObject({ scope: 'team', generated_by: 'Alice Admin', stale: false });
    expect(await fetchBrief('team')).toEqual({ brief });
    expect(await fetchExplanation('arr_at_risk', 'company')).toEqual({ explanation: COMPANY_EXPLANATION });
    const { explanation } = await writeExplanation('arr_at_risk', 'team');
    expect(explanation).toMatchObject({ metric: 'arr_at_risk', scope: 'team', hidden: 2 });
  });

  it('refuses the next write with the server’s detail, once', async () => {
    stubBrain({ refuseNextWrite: { status: 429, detail: 'The AI budget for this month is spent.' } });
    const refused = await refusal(writeBrief('company'));
    expect([refused?.status, refused?.message]).toEqual([429, 'The AI budget for this month is spent.']);
    expect((await writeBrief('company')).brief.scope).toBe('company');
  });

  it('holds writes until released', async () => {
    const { releaseWrites } = stubBrain({ holdWrites: true });
    let done = false;
    const write = writeBrief('me').then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    releaseWrites();
    await write;
    expect(done).toBe(true);
  });

  it('fails the first reads when asked', async () => {
    stubBrain({ failScopes: 1, failChanged: 1 });
    expect((await refusal(fetchScopes()))?.status).toBe(500);
    expect((await fetchScopes()).default).toBe('company');
    expect((await refusal(fetchChanged('me')))?.status).toBe(500);
    expect((await fetchChanged('me')).scope).toBe('me');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/brain/testBrain.test.ts`
Expected: FAIL, "Failed to resolve import './brainApi'".

- [ ] **Step 3: Write the API**

Create `src/features/brain/brainApi.ts`:

```ts
// Thin apiFetch wrappers over revenact-backend's /api/v1/brain/ (spec §4).
// Every call names its scope (Contract note 1).
import { ApiError, apiFetch } from '../../lib/apiClient';
import type {
  BriefPayload,
  ChangedPayload,
  ExplanationPayload,
  ScopeKey,
  ScopesPayload,
  WrittenBrief,
  WrittenExplanation,
} from './brainTypes';

const BASE = '/brain/';
const scoped = (path: string, scope: ScopeKey) => `${BASE}${path}?scope=${scope}`;
const explanationPath = (metric: string) => `explanations/${encodeURIComponent(metric)}/`;

export const fetchScopes = () => apiFetch<ScopesPayload>(`${BASE}scopes/`);
export const fetchChanged = (scope: ScopeKey) => apiFetch<ChangedPayload>(scoped('changed/', scope));
export const fetchBrief = (scope: ScopeKey) => apiFetch<BriefPayload>(scoped('brief/', scope));
/** A real, paid model call: only ever from a click. */
export const writeBrief = (scope: ScopeKey) => apiFetch<WrittenBrief>(scoped('brief/', scope), { method: 'POST' });
export const fetchExplanation = (metric: string, scope: ScopeKey) => apiFetch<ExplanationPayload>(scoped(explanationPath(metric), scope));
/** A real, paid model call: only ever from a click. */
export const writeExplanation = (metric: string, scope: ScopeKey) =>
  apiFetch<WrittenExplanation>(scoped(explanationPath(metric), scope), { method: 'POST' });

/** 403 SCOPE_NOT_ALLOWED: the reader lost this view (Contract note 3). */
export function isScopeRefusal(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  const body = err.body;
  return typeof body === 'object' && body !== null && (body as { code?: unknown }).code === 'SCOPE_NOT_ALLOWED';
}
```

- [ ] **Step 4: Write the fixtures**

Create `src/features/brain/testBrainFixtures.ts`:

```ts
// Test-only: §4-shaped payloads for a manager (Alice, view_all_accounts, one
// report) on 5 Oct 2026, compared with the 30 Sep month-end. Names are
// owners, products and segments only, never customers (spec §1.4).
import type { ChangedMetric, ChangedPayload, ChangedSignal, MetricUnit, ScopeBrief, ScopeExplanation, ScopeKey, Better } from './brainTypes';

export const AS_OF = '2026-10-05';
export const MONTH_END = '2026-09-30';
export const LABELS: Record<ScopeKey, string> = { me: 'Me', team: 'My team', company: 'Company' };
export const METRIC_KEYS = ['arr', 'arr_at_risk', 'expansion', 'nrr', 'usage'];

function metric(key: string, label: string, unit: MetricUnit, better: Better, now: number | null, then: number | null, material = false): ChangedMetric {
  return { key, label, unit, better, now, then, change: now === null || then === null ? null : now - then, material };
}

export const AT_RISK_SIGNAL: ChangedSignal = {
  key: 'arr_at_risk', label: 'ARR at risk', unit: 'money', better: 'down', now: 114540, then: 64090, change: 50450, improved: false,
  drivers: [{ dimension: 'product', member: '4', label: 'Analytics Suite', change: 50450 }],
};

export const EXPANSION_SIGNAL: ChangedSignal = {
  key: 'expansion', label: 'Expansion ARR', unit: 'money', better: 'up', now: 42000, then: 30000, change: 12000, improved: true,
  drivers: [{ dimension: 'segment', member: 'enterprise', label: 'Enterprise', change: 9000 }],
};

export const COMPANY: ChangedPayload = {
  scope: 'company', as_of: AS_OF, since: MONTH_END, since_kind: 'month_end', team_changed_on: null, currency: 'USD', empty: false,
  metrics: [
    metric('arr', 'ARR', 'money', 'up', 688600, 702000),
    metric('arr_at_risk', 'ARR at risk', 'money', 'down', 114540, 64090, true),
    metric('expansion', 'Expansion ARR', 'money', 'up', 42000, 30000, true),
    metric('nrr', 'Net revenue retention', 'percent', 'up', 104, 108),
    metric('usage', 'Weekly active usage', 'percent', 'up', null, null),
  ],
  // Bad news first, as the server orders them.
  signals: [AT_RISK_SIGNAL, EXPANSION_SIGNAL],
};

export const TEAM: ChangedPayload = {
  ...COMPANY,
  scope: 'team',
  metrics: [
    metric('arr', 'ARR', 'money', 'up', 240000, 251000),
    metric('arr_at_risk', 'ARR at risk', 'money', 'down', 90000, 40000, true),
    metric('usage', 'Weekly active usage', 'percent', 'up', null, null),
  ],
  signals: [
    {
      ...AT_RISK_SIGNAL, now: 90000, then: 40000, change: 50000,
      drivers: [{ dimension: 'product', member: '4', label: 'Analytics Suite', change: 50000 }],
      handover: { in: 0, out: 2, people: ['Dana CSM'] },
    },
  ],
};

/** Alice's first look at Me: a baseline taken today, nothing material. */
export const ME_BASELINE: ChangedPayload = {
  ...COMPANY,
  scope: 'me',
  since: AS_OF,
  since_kind: 'baseline',
  metrics: [
    metric('arr', 'ARR', 'money', 'up', 120000, 120000),
    metric('arr_at_risk', 'ARR at risk', 'money', 'down', 12000, 11000),
    metric('usage', 'Weekly active usage', 'percent', 'up', null, null),
  ],
  signals: [],
};

export const ME_EMPTY: ChangedPayload = {
  ...ME_BASELINE,
  empty: true,
  metrics: ME_BASELINE.metrics.map((m) => ({ ...m, now: null, then: null, change: null })),
};

export const TEAM_RESET: ChangedPayload = {
  ...TEAM,
  as_of: '2026-10-12',
  since: '2026-10-12',
  since_kind: 'baseline',
  team_changed_on: '2026-10-12',
  metrics: TEAM.metrics.map((m) => ({ ...m, then: m.now, change: m.now === null ? null : 0, material: false })),
  signals: [],
};

/** Company before its first month-end (§4: `since` null, every `then` null). */
export const COMPANY_FIRST: ChangedPayload = {
  ...COMPANY,
  since: null,
  metrics: COMPANY.metrics.map((m) => ({ ...m, then: null, change: null, material: false })),
  signals: [],
};

export const COMPANY_BRIEF: ScopeBrief = {
  id: 9, scope: 'company', as_of: AS_OF, baseline: MONTH_END,
  headline: 'Risk rose on Analytics Suite',
  body: 'ARR at risk rose by $50.5K since the month-end.\n\nEnterprise expansion offset part of it.',
  watch: ['Analytics Suite renewals in November'],
  generated_at: '2026-10-05T09:12:00Z', generated_by: 'Alice Admin', stale: false,
};

export const ME_STALE_BRIEF: ScopeBrief = {
  ...COMPANY_BRIEF, id: 10, scope: 'me', headline: 'Your book held steady', generated_at: '2026-10-01T09:00:00Z', stale: true,
};

export const COMPANY_EXPLANATION: ScopeExplanation = {
  id: 4, metric: 'arr_at_risk', scope: 'company', as_of: AS_OF,
  text: 'Two Analytics Suite renewals slipped into the risk band.',
  evidence: ['ARR at risk 64,090 to 114,540'], hidden: 0,
  generated_at: '2026-10-05T09:20:00Z', generated_by: 'Alice Admin', stale: false,
};
```

- [ ] **Step 5: Write the stub**

Create `src/features/brain/testBrain.ts`:

```ts
// Test-only: one stateful fetch stub for /api/v1/brain/ (spec §4). It checks
// in the backend's order: an unknown or missing scope is 400 SCOPE_UNKNOWN
// before a scope the reader can't use is 403 SCOPE_NOT_ALLOWED; an unknown
// metric is 404 after both (Contract notes 1, 2). Writes are kept, so a
// later read returns them. The two Company knowledge panels' reads answer
// empty (Contract note 11).
import { vi } from 'vitest';
import { SCOPE_KEYS, type ChangedPayload, type ScopeBrief, type ScopeExplanation, type ScopeKey } from './brainTypes';
import { COMPANY, COMPANY_BRIEF, COMPANY_EXPLANATION, LABELS, ME_BASELINE, ME_STALE_BRIEF, METRIC_KEYS, TEAM } from './testBrainFixtures';

export interface BrainStub {
  /** The scopes the reader may use. Default: all three (a manager with view_all_accounts). */
  offered?: ScopeKey[];
  changed?: Partial<Record<ScopeKey, ChangedPayload>>;
  /** Kept briefs by scope. Default: a Company brief and a stale Me brief. */
  briefs?: Partial<Record<ScopeKey, ScopeBrief>>;
  /** Kept explanations. Default: Company's ARR at risk. */
  explanations?: ScopeExplanation[];
  /** `hidden` on explanations the stub writes. */
  hidden?: number;
  /** How many scopes/ reads fail (500) first. */
  failScopes?: number;
  /** How many changed/ reads fail (500) first. */
  failChanged?: number;
  /** The next write (brief or explanation) answers this instead, once. */
  refuseNextWrite?: { status: number; detail: string };
  /** Writes wait until `releaseWrites()`. */
  holdWrites?: boolean;
}

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const SCOPE_UNKNOWN = { code: 'SCOPE_UNKNOWN', detail: 'Choose me, team or company.' };
const SCOPE_NOT_ALLOWED = { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." };
const WRITTEN_AT = '2026-10-05T12:00:00Z';
const ACTIVITY_SINCE = '2026-09-05';

export function stubBrain(stub: BrainStub = {}) {
  const offered = new Set<ScopeKey>(stub.offered ?? SCOPE_KEYS);
  const changed: Record<ScopeKey, ChangedPayload> = { me: ME_BASELINE, team: TEAM, company: COMPANY, ...stub.changed };
  const briefs = new Map<ScopeKey, ScopeBrief>(Object.entries(stub.briefs ?? { company: COMPANY_BRIEF, me: ME_STALE_BRIEF }) as [ScopeKey, ScopeBrief][]);
  const explanations = new Map<string, ScopeExplanation>((stub.explanations ?? [COMPANY_EXPLANATION]).map((e) => [`${e.scope}:${e.metric}`, e]));
  let failScopes = stub.failScopes ?? 0;
  let failChanged = stub.failChanged ?? 0;
  let refusal = stub.refuseNextWrite ?? null;
  let nextId = 500;
  let release: () => void = () => {};
  const gate = stub.holdWrites ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();

  /** A write waits for the gate, then answers the queued refusal once. */
  async function refusedWrite() {
    await gate;
    if (!refusal) return null;
    const answer = json(refusal.status, { detail: refusal.detail });
    refusal = null;
    return answer;
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname.endsWith('/questions/')) return json(200, []);
    if (url.pathname.endsWith('/knowledge/activity/')) return json(200, { days: 30, since: ACTIVITY_SINCE, functions: [] });
    const path = url.pathname.replace(/^\/api\/v1\/brain/, '');

    if (path === '/scopes/' && method === 'GET') {
      if (failScopes > 0) { failScopes -= 1; return json(500, { detail: 'Try later.' }); }
      const scopes = SCOPE_KEYS.filter((key) => offered.has(key)).map((key) => ({ key, label: LABELS[key] }));
      // §1.1: the default is the widest scope offered.
      return json(200, { scopes, default: scopes[scopes.length - 1]?.key ?? 'me' });
    }

    const route = /^\/(changed|brief|explanations\/([^/]+))\/$/.exec(path);
    if (!route) return json(404, { detail: `Not stubbed: ${method} ${path}` });
    const raw = url.searchParams.get('scope');
    if (!SCOPE_KEYS.includes(raw as ScopeKey)) return json(400, SCOPE_UNKNOWN);
    const scope = raw as ScopeKey;
    if (!offered.has(scope)) return json(403, SCOPE_NOT_ALLOWED);

    if (route[1] === 'changed' && method === 'GET') {
      if (failChanged > 0) { failChanged -= 1; return json(500, { detail: 'Try later.' }); }
      return json(200, changed[scope]);
    }

    if (route[1] === 'brief') {
      if (method === 'GET') return json(200, { brief: briefs.get(scope) ?? null });
      if (method === 'POST') {
        const refused = await refusedWrite();
        if (refused) return refused;
        const c = changed[scope];
        const brief: ScopeBrief = {
          id: nextId++, scope, as_of: c.as_of, baseline: c.since,
          headline: `A fresh brief for ${LABELS[scope]}`, body: 'What moved, and why.\n\nWhat to do next.',
          watch: ['Renewals next month'], generated_at: WRITTEN_AT, generated_by: 'Alice Admin', stale: false,
        };
        briefs.set(scope, brief);
        return json(201, { brief });
      }
    }

    const metric = route[2];
    if (metric !== undefined) {
      if (!METRIC_KEYS.includes(metric)) return json(404, { detail: 'No such metric.' });
      const id = `${scope}:${metric}`;
      if (method === 'GET') return json(200, { explanation: explanations.get(id) ?? null });
      if (method === 'POST') {
        const refused = await refusedWrite();
        if (refused) return refused;
        const explanation: ScopeExplanation = {
          id: nextId++, metric, scope, as_of: changed[scope].as_of,
          text: `Why ${metric} moved for ${LABELS[scope]}.`, evidence: ['Two renewals slipped'], hidden: stub.hidden ?? 0,
          generated_at: WRITTEN_AT, generated_by: 'Alice Admin', stale: false,
        };
        explanations.set(id, explanation);
        return json(201, { explanation });
      }
    }
    return json(405, { detail: 'Method not allowed.' });
  });
  vi.stubGlobal('fetch', spy);

  return {
    spy,
    /** The reader loses a scope (an org-chart change): later calls for it answer 403. */
    revoke: (key: ScopeKey) => offered.delete(key),
    releaseWrites: () => release(),
  };
}

/** Every `method` request whose path contains `part`, as path + query without /api/v1. */
export function requests(spy: ReturnType<typeof vi.fn>, method: string, part: string): string[] {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), method: (init as RequestInit | undefined)?.method ?? 'GET' }))
    .filter((call) => call.method === method && call.url.pathname.includes(part))
    .map((call) => `${call.url.pathname.replace(/^\/api\/v1/, '')}${call.url.search}`);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/features/brain`
Expected: PASS (3 files). Then `npx tsc -b --noEmit` → no output.

- [ ] **Step 7: Commit**

```bash
git add src/features/brain/brainApi.ts src/features/brain/testBrainFixtures.ts src/features/brain/testBrain.ts src/features/brain/testBrain.test.ts
git commit -m "feat(brain): brain API and a stateful contract stub (400 before 403)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The scope switch and the scope hook

Spec §2.2 (segmented control with only offered scopes, a label for one, a select below `sm`; URL, memory, default; 403 fallback with its sentence); Decisions 2–5.

**Files:**
- Create: `src/components/brain/ScopeSwitch.tsx`, `src/components/brain/useBrainScope.ts`
- Test: `src/components/brain/ScopeSwitch.test.tsx`, `src/components/brain/useBrainScope.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`chooseScope`, `forgetScope`, `readStoredScope`, `storeScope`, `SAY`, types); Task 2 (`fetchScopes`, `isScopeRefusal`, `stubBrain`); `SM`, `useMediaQuery` (`lib/useMediaQuery`); `FOCUS` (`components/organizations/portfolio/styles`).
- Produces:
  - `ScopeSwitch({ scopes: ScopeOption[]; value: ScopeKey; onChange(key: ScopeKey): void })`.
  - `useBrainScope(): BrainScope` with `{ offered: ScopesPayload | null; scope: ScopeKey | null; label: string; error: string | null; notice: string | null; retry(): void; choose(key): void; refused(err: unknown): boolean }`. `scope` is non-null only once `?scope=` names an offered scope. `refused` returns true (and moves the page) only for a 403 `SCOPE_NOT_ALLOWED`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/brain/ScopeSwitch.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScopeOption } from '../../features/brain/brainTypes';
import { resetViewport, setViewport } from '../../test/viewport';
import { ScopeSwitch } from './ScopeSwitch';

const ALL: ScopeOption[] = [{ key: 'me', label: 'Me' }, { key: 'team', label: 'My team' }, { key: 'company', label: 'Company' }];

describe('ScopeSwitch (spec §2.2)', () => {
  afterEach(() => resetViewport());

  it('is a segmented control of the offered scopes from sm, the current one pressed', async () => {
    setViewport(1024);
    const onChange = vi.fn();
    render(<ScopeSwitch scopes={ALL} value="team" onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'View' });
    expect(group).toHaveTextContent('MeMy teamCompany');
    expect(screen.getByRole('button', { name: 'My team' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Me' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    expect(onChange.mock.calls).toEqual([['company']]);
  });

  it('is a select below sm', async () => {
    setViewport(375);
    const onChange = vi.fn();
    render(<ScopeSwitch scopes={ALL} value="me" onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'View' });
    expect(select).toHaveValue('me');
    await userEvent.selectOptions(select, 'company');
    expect(onChange).toHaveBeenCalledWith('company');
  });

  it('shows a single scope as a label, not a control', () => {
    setViewport(1024);
    render(<ScopeSwitch scopes={[{ key: 'me', label: 'Me' }]} value="me" onChange={vi.fn()} />);
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
```

Create `src/components/brain/useBrainScope.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fetchChanged } from '../../features/brain/brainApi';
import { SCOPE_STORAGE_KEY } from '../../features/brain/brainScope';
import { SAY } from '../../features/brain/brainText';
import { stubBrain } from '../../features/brain/testBrain';
import { Where } from '../../pages/organizations/testList';
import { useBrainScope } from './useBrainScope';

function Probe() {
  const brain = useBrainScope();
  return (
    <>
      <p data-testid="scope">{brain.scope ?? 'none'}</p>
      <p data-testid="notice">{brain.notice ?? ''}</p>
      <p data-testid="error">{brain.error ?? ''}</p>
      <button type="button" onClick={() => brain.choose('me')}>Choose me</button>
      <button type="button" onClick={() => brain.retry()}>Retry</button>
      <button type="button" onClick={() => fetchChanged('team').catch((err: unknown) => brain.refused(err))}>Read team</button>
      <Where />
    </>
  );
}

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><Probe /></MemoryRouter>);
const text = (id: string) => screen.getByTestId(id).textContent;

describe('useBrainScope (spec §2.2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has no scope until the URL names an offered one, then the server default', async () => {
    stubBrain();
    renderAt('/brain');
    expect(text('scope')).toBe('none');
    await waitFor(() => expect(text('scope')).toBe('company'));
    expect(text('where')).toBe('/brain?scope=company');
  });

  it('uses the remembered choice, and remembers a new one', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'team');
    stubBrain();
    renderAt('/brain');
    await waitFor(() => expect(text('where')).toBe('/brain?scope=team'));
    await userEvent.click(screen.getByRole('button', { name: 'Choose me' }));
    expect(text('where')).toBe('/brain?scope=me');
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('me');
  });

  it('does not remember a scope opened from a link (Decision 3)', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'me');
    stubBrain();
    renderAt('/brain?scope=team');
    await waitFor(() => expect(text('scope')).toBe('team'));
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('me');
  });

  it('drops a remembered scope no longer offered, quietly', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'company');
    stubBrain({ offered: ['me'] });
    renderAt('/brain');
    await waitFor(() => expect(text('scope')).toBe('me'));
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBeNull();
    expect(text('notice')).toBe('');
  });

  it('moves a link to a scope not offered to the default, with the notice (Decision 4)', async () => {
    stubBrain({ offered: ['me', 'team'] });
    renderAt('/brain?scope=company');
    await waitFor(() => expect(text('where')).toBe('/brain?scope=team'));
    expect(text('notice')).toBe(SAY.LOST_ACCESS);
    await userEvent.click(screen.getByRole('button', { name: 'Choose me' }));
    expect(text('notice')).toBe('');
  });

  it('after a 403 SCOPE_NOT_ALLOWED forgets the scope, re-reads the scopes and moves to the new default', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'team');
    const { spy, revoke } = stubBrain({ offered: ['me', 'team'] });
    renderAt('/brain');
    await waitFor(() => expect(text('scope')).toBe('team'));
    revoke('team');
    await userEvent.click(screen.getByRole('button', { name: 'Read team' }));
    await waitFor(() => expect(text('where')).toBe('/brain?scope=me'));
    expect(text('notice')).toBe(SAY.LOST_ACCESS);
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBeNull();
    expect(spy.mock.calls.filter(([u]) => String(u).endsWith('/brain/scopes/'))).toHaveLength(2);
  });

  it('says it could not load the views, and tries again', async () => {
    stubBrain({ failScopes: 1 });
    renderAt('/brain');
    await waitFor(() => expect(text('error')).toBe(SAY.LOAD_SCOPES));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(text('scope')).toBe('company'));
    expect(text('error')).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/brain/ScopeSwitch.test.tsx src/components/brain/useBrainScope.test.tsx`
Expected: FAIL, "Failed to resolve import './ScopeSwitch'" and "'./useBrainScope'".

- [ ] **Step 3: Write the switch**

Create `src/components/brain/ScopeSwitch.tsx`:

```tsx
import type { ScopeKey, ScopeOption } from '../../features/brain/brainTypes';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { FOCUS } from '../organizations/portfolio/styles';

const SEGMENT = `inline-flex min-h-11 sm:min-h-9 items-center justify-center rounded-md px-3 text-[13px] font-semibold ${FOCUS}`;
const SELECT = `min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[13px] font-semibold text-ink ${FOCUS}`;

/** Me · My team · Company (spec §2.2): only the scopes the server offered.
 *  One scope is a label, not a control; below sm it is a select. */
export function ScopeSwitch({ scopes, value, onChange }: { scopes: ScopeOption[]; value: ScopeKey; onChange: (key: ScopeKey) => void }) {
  const wide = useMediaQuery(SM);
  if (scopes.length === 1) {
    return <p className="text-[13px] font-semibold text-ink-muted">{scopes[0].label}</p>;
  }
  if (!wide) {
    return (
      <label className="flex w-full flex-col gap-1">
        <span className="text-[11px] font-semibold text-ink-muted">View</span>
        <select value={value} onChange={(event) => onChange(event.target.value as ScopeKey)} className={SELECT}>
          {scopes.map((scope) => (
            <option key={scope.key} value={scope.key}>
              {scope.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div role="group" aria-label="View" className="flex shrink-0 rounded-lg border border-line bg-surface p-0.5">
      {scopes.map((scope) => {
        const active = scope.key === value;
        return (
          <button
            key={scope.key}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(scope.key);
            }}
            className={`${SEGMENT} ${active ? 'bg-subtle text-ink' : 'text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle'}`}
          >
            {scope.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write the hook**

Create `src/components/brain/useBrainScope.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchScopes, isScopeRefusal } from '../../features/brain/brainApi';
import { chooseScope, forgetScope, readStoredScope, storeScope } from '../../features/brain/brainScope';
import { SAY } from '../../features/brain/brainText';
import type { ScopeKey, ScopesPayload } from '../../features/brain/brainTypes';

export interface BrainScope {
  offered: ScopesPayload | null;
  /** Non-null only once ?scope= names an offered scope (Decision 2). */
  scope: ScopeKey | null;
  label: string;
  error: string | null;
  notice: string | null;
  retry: () => void;
  choose: (key: ScopeKey) => void;
  /** True when `err` was a 403 SCOPE_NOT_ALLOWED; the page then moves to the new default. */
  refused: (err: unknown) => boolean;
}

type Answer = { attempt: number; offered: ScopesPayload | null; error: string | null };

/** The Brain's scope (spec §2.2): the server's scopes, `?scope=`, the reader's
 *  last choice. The notice rides on the navigation's state, so it lasts until
 *  the reader picks a view and needs no state set in an effect. */
export function useBrainScope(): BrainScope {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    let alive = true;
    fetchScopes().then(
      (offered) => alive && setAnswer({ attempt, offered, error: null }),
      () => alive && setAnswer({ attempt, offered: null, error: SAY.LOAD_SCOPES }),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const current = answer?.attempt === attempt ? answer : null;
  const offered = current?.offered ?? null;
  const urlScope = params.get('scope');
  const notice = (location.state as { scopeLost?: boolean } | null)?.scopeLost ? SAY.LOST_ACCESS : null;
  const choice = useMemo(() => (offered ? chooseScope(urlScope, readStoredScope(), offered) : null), [offered, urlScope]);

  const go = useCallback(
    (key: ScopeKey | null, lost: boolean) => navigate({ search: key ? `?scope=${key}` : '' }, { replace: true, state: lost ? { scopeLost: true } : null }),
    [navigate],
  );

  useEffect(() => {
    if (!choice) return;
    if (choice.dropStored) forgetScope();
    if (urlScope !== choice.key) go(choice.key, choice.urlRefused || notice !== null);
  }, [choice, urlScope, notice, go]);

  const choose = useCallback(
    (key: ScopeKey) => {
      storeScope(key);
      go(key, false);
    },
    [go],
  );

  const refused = useCallback(
    (err: unknown) => {
      if (!isScopeRefusal(err)) return false;
      forgetScope();
      go(null, true);
      setAttempt((n) => n + 1);
      return true;
    },
    [go],
  );

  const scope = choice && urlScope === choice.key ? choice.key : null;
  return {
    offered,
    scope,
    label: offered?.scopes.find((s) => s.key === scope)?.label ?? '',
    error: current?.error ?? null,
    notice,
    retry: () => setAttempt((n) => n + 1),
    choose,
    refused,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/brain/ScopeSwitch.test.tsx src/components/brain/useBrainScope.test.tsx`
Expected: PASS. Then `npx eslint src/components/brain/ScopeSwitch.tsx src/components/brain/useBrainScope.ts` → no output (no `set-state-in-effect` warning: the only effect sets nothing but the URL).

- [ ] **Step 6: Commit**

```bash
git add src/components/brain/ScopeSwitch.tsx src/components/brain/useBrainScope.ts src/components/brain/ScopeSwitch.test.tsx src/components/brain/useBrainScope.test.tsx
git commit -m "feat(brain): scope switch, URL and remembered scope, 403 fallback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: What moved, Why?, and Everything we measure

Spec §2.3 items 3 and 4 (one row per signal, then → now in DM Mono, the change with a direction word, top driver, handover; Why? inline, one open at a time, kept explanation or Explain this, hidden accounts; empty "Nothing moved materially since 30 Sep."; every metric with "Not measured"; rows stack on phones); Decisions 8, 10, 11.

**Files:**
- Create: `src/components/brain/useKept.ts`, `src/components/brain/styles.ts`, `src/components/brain/WhyPanel.tsx`, `src/components/brain/MovesList.tsx`, `src/components/brain/MeasureTable.tsx`
- Test: `src/components/brain/MovesList.test.tsx`, `src/components/brain/MeasureTable.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–2; `useSubmitOnce` (`components/plans/useSubmitOnce`); `errorMessage` (`components/organizations/portfolio/usePagedRead`); `BUTTON`, `QUIET`, `MONO` (`components/organizations/portfolio/styles`).
- Produces:
  - `useKept<T>({ read: () => Promise<T | null>; write: () => Promise<T>; onRefused: (err: unknown) => boolean; readFallback: string; writeFallback: string }) → { value: T | null | undefined; loadError: string | null; retry(): void; save(): Promise<void>; writing: boolean; writeError: string | null }`. `undefined` while loading. The caller keys the component by scope, so `read`/`write` are fixed for its life.
  - `TONE_CLASS: Record<Tone, string>`.
  - `WhyPanel({ metric: string; label: string; scope: ScopeKey; onRefused })`, `MovesList({ changed: ChangedPayload; onRefused })`, `MeasureTable({ changed: ChangedPayload })`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/brain/MovesList.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { COMPANY, COMPANY_EXPLANATION, ME_BASELINE, TEAM } from '../../features/brain/testBrainFixtures';
import { MovesList } from './MovesList';

const rows = () => within(screen.getByRole('list', { name: SAY.MOVED })).getAllByRole('listitem');

describe('What moved (spec §2.3 item 3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists one row per signal in the server’s order, bad news first, with words for the direction', () => {
    stubBrain();
    render(<MovesList changed={COMPANY} onRefused={() => false} />);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent('ARR at risk');
    expect(rows()[0]).toHaveTextContent('$64.1K → $114.5K');
    expect(within(rows()[0]).getByText('up $50.5K')).toHaveClass('text-danger', 'font-mono-brand', 'tabular-nums');
    expect(rows()[0]).toHaveTextContent('most of it: Analytics Suite');
    expect(within(rows()[1]).getByText('up $12.0K')).toHaveClass('text-success');
  });

  it('carries the handover on a team’s money signal', () => {
    stubBrain();
    render(<MovesList changed={TEAM} onRefused={() => false} />);
    expect(rows()[0]).toHaveTextContent('most of it: Analytics Suite · includes 2 customers handed to Dana CSM');
  });

  it('says nothing moved since the day compared with', () => {
    stubBrain();
    render(<MovesList changed={ME_BASELINE} onRefused={() => false} />);
    expect(screen.getByText('Nothing moved materially since 5 Oct.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: SAY.MOVED })).toBeNull();
  });

  it('opens the kept explanation under the row, one at a time', async () => {
    const { spy } = stubBrain();
    render(<MovesList changed={COMPANY} onRefused={() => false} />);
    const why = screen.getByRole('button', { name: 'Why? ARR at risk' });
    await userEvent.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    expect(await within(panel).findByText(COMPANY_EXPLANATION.text)).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: SAY.EXPLAIN })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Why? Expansion ARR' }));
    expect(screen.queryByRole('region', { name: 'Why ARR at risk moved' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Why Expansion ARR moved' })).toBeInTheDocument();
    expect(requests(spy, 'GET', '/explanations/')).toEqual([
      '/brain/explanations/arr_at_risk/?scope=company',
      '/brain/explanations/expansion/?scope=company',
    ]);
  });

  it('offers Explain this when none is kept, sends it once, and names how many accounts are hidden', async () => {
    const { spy, releaseWrites } = stubBrain({ hidden: 2, holdWrites: true });
    render(<MovesList changed={TEAM} onRefused={() => false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    const panel = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    const explain = await within(panel).findByRole('button', { name: SAY.EXPLAIN });
    expect(within(panel).getByText(SAY.CREDITS)).toBeInTheDocument();
    await userEvent.dblClick(explain);
    expect(within(panel).getByRole('button', { name: SAY.EXPLAINING })).toBeDisabled();
    releaseWrites();
    expect(await within(panel).findByText('Why arr_at_risk moved for My team.')).toBeInTheDocument();
    expect(within(panel).getByText("2 more accounts you can't open")).toBeInTheDocument();
    expect(requests(spy, 'POST', '/explanations/')).toEqual(['/brain/explanations/arr_at_risk/?scope=team']);
  });

  it('shows the server’s refusal under the button', async () => {
    stubBrain({ refuseNextWrite: { status: 503, detail: 'The AI assistant is not configured.' } });
    render(<MovesList changed={TEAM} onRefused={() => false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    await userEvent.click(await screen.findByRole('button', { name: SAY.EXPLAIN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI assistant is not configured.');
    expect(screen.getByRole('button', { name: SAY.EXPLAIN })).toBeEnabled();
  });

  it('offers Explain again on a stale explanation (Decision 10)', async () => {
    stubBrain({ explanations: [{ ...COMPANY_EXPLANATION, stale: true }] });
    render(<MovesList changed={COMPANY} onRefused={() => false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    expect(await screen.findByText(SAY.STALE_EXPLANATION)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SAY.EXPLAIN_AGAIN })).toBeInTheDocument();
  });

  it('hands a 403 SCOPE_NOT_ALLOWED to the page instead of showing it', async () => {
    const { revoke } = stubBrain();
    const onRefused = vi.fn(() => true);
    render(<MovesList changed={TEAM} onRefused={onRefused} />);
    revoke('team');
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    await waitFor(() => expect(onRefused).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(SAY.LOAD_EXPLANATION)).toBeNull();
  });
});
```

Create `src/components/brain/MeasureTable.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SAY } from '../../features/brain/brainText';
import { COMPANY, COMPANY_FIRST } from '../../features/brain/testBrainFixtures';
import { MeasureTable } from './MeasureTable';

const row = (label: string) => within(screen.getByRole('list', { name: SAY.MEASURE })).getAllByRole('listitem').find((li) => li.textContent?.startsWith(label)) as HTMLElement;

describe('Everything we measure (spec §2.3 item 4)', () => {
  it('lists every metric with then, now and change, small moves included', () => {
    render(<MeasureTable changed={COMPANY} />);
    expect(within(screen.getByRole('list', { name: SAY.MEASURE })).getAllByRole('listitem')).toHaveLength(5);
    expect(row('ARR')).toHaveTextContent('Then$702.0KNow$688.6KChangedown $13.4K');
    expect(within(row('ARR')).getByText('down $13.4K')).toHaveClass('text-danger', 'font-mono-brand', 'tabular-nums');
    expect(within(row('Net revenue retention')).getByText('down 4 pts')).toBeInTheDocument();
  });

  it('reads null as Not measured, never zero', () => {
    render(<MeasureTable changed={COMPANY} />);
    expect(within(row('Weekly active usage')).getAllByText(SAY.NOT_MEASURED)).toHaveLength(2);
    expect(within(row('Weekly active usage')).getByText(SAY.NOT_COMPARED)).toBeInTheDocument();
  });

  it('reads Not compared before the first month-end (Decision 8)', () => {
    render(<MeasureTable changed={COMPANY_FIRST} />);
    expect(within(row('ARR')).getByText(SAY.NOT_COMPARED)).toBeInTheDocument();
  });

  it('stacks each row on phones: column heads from sm, labels in each row below it', () => {
    render(<MeasureTable changed={COMPANY} />);
    expect(screen.getByTestId('measure-head')).toHaveClass('hidden', 'sm:grid');
    expect(within(row('ARR')).getByText('Then')).toHaveClass('sm:sr-only');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/brain/MovesList.test.tsx src/components/brain/MeasureTable.test.tsx`
Expected: FAIL, "Failed to resolve import './MovesList'" and "'./MeasureTable'".

- [ ] **Step 3: Write the kept-text hook and the tone classes**

Create `src/components/brain/useKept.ts`:

```ts
import { useEffect, useState } from 'react';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';

type Answer<T> = { attempt: number; value: T | null; error: string | null };

/** A kept AI text for one scope (a brief, an explanation), spec §2.3: read
 *  free on mount and on Try again; written only from a click, once however
 *  fast it is clicked (useSubmitOnce). A failed write keeps the old text and
 *  says why in the server's words; a 403 SCOPE_NOT_ALLOWED goes to
 *  `onRefused` instead. The caller keys the component by scope, so `read`
 *  and `write` are fixed for its life. */
export function useKept<T>({
  read,
  write,
  onRefused,
  readFallback,
  writeFallback,
}: {
  read: () => Promise<T | null>;
  write: () => Promise<T>;
  onRefused: (err: unknown) => boolean;
  readFallback: string;
  writeFallback: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer<T> | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce();

  useEffect(() => {
    let alive = true;
    read().then(
      (value) => alive && setAnswer({ attempt, value, error: null }),
      (err: unknown) => {
        if (alive && !onRefused(err)) setAnswer({ attempt, value: null, error: readFallback });
      },
    );
    return () => {
      alive = false;
    };
    // `read`, `onRefused` and `readFallback` are fixed for the component's life (keyed by scope).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  async function save() {
    setWriteError(null);
    const outcome = await run(write);
    if (!outcome) return;
    if (outcome.ok) setAnswer({ attempt, value: outcome.value, error: null });
    else if (!onRefused(outcome.error)) setWriteError(errorMessage(outcome.error, writeFallback));
  }

  const current = answer?.attempt === attempt ? answer : null;
  return {
    value: current ? current.value : undefined,
    loadError: current?.error ?? null,
    retry: () => setAttempt((n) => n + 1),
    save,
    writing: busy,
    writeError,
  };
}
```

Create `src/components/brain/styles.ts`:

```ts
import type { Tone } from '../../features/brain/brainText';

/** A change's colour: trend only, always beside its direction word. */
export const TONE_CLASS: Record<Tone, string> = {
  good: 'text-success',
  bad: 'text-danger',
  neutral: 'text-ink-muted',
};
```

- [ ] **Step 4: Write the Why? panel**

Create `src/components/brain/WhyPanel.tsx`:

```tsx
import { Sparkles } from 'lucide-react';
import { fetchExplanation, writeExplanation } from '../../features/brain/brainApi';
import { hiddenText, SAY } from '../../features/brain/brainText';
import type { ScopeExplanation, ScopeKey } from '../../features/brain/brainTypes';
import { BUTTON, MONO, QUIET } from '../organizations/portfolio/styles';
import { useKept } from './useKept';

/** Why one signal moved, for this scope (spec §2.3 item 3): the kept
 *  explanation, or Explain this. A flat block inside its row, not a card. */
export function WhyPanel({ metric, label, scope, onRefused }: { metric: string; label: string; scope: ScopeKey; onRefused: (err: unknown) => boolean }) {
  const kept = useKept<ScopeExplanation>({
    read: () => fetchExplanation(metric, scope).then((p) => p.explanation),
    write: () => writeExplanation(metric, scope).then((p) => p.explanation),
    onRefused,
    readFallback: SAY.LOAD_EXPLANATION,
    writeFallback: SAY.EXPLAIN_FAILED,
  });
  const explanation = kept.value;
  const hidden = explanation ? hiddenText(explanation.hidden) : null;

  return (
    <div id={`why-${metric}`} role="region" aria-label={`Why ${label} moved`} className="flex flex-col gap-2 border-t border-line bg-subtle px-4 py-3">
      {explanation === undefined && !kept.loadError ? (
        <div role="status" aria-label="Loading the explanation" className="flex flex-col gap-1.5">
          <span aria-hidden="true" className="block h-3 w-3/4 animate-pulse rounded bg-line-subtle" />
          <span aria-hidden="true" className="block h-3 w-1/2 animate-pulse rounded bg-line-subtle" />
        </div>
      ) : null}
      {kept.loadError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-ink-muted">{kept.loadError}</p>
          <button type="button" onClick={kept.retry} className={QUIET}>
            Try again
          </button>
        </div>
      ) : null}
      {explanation ? (
        <>
          <p className="max-w-prose text-[13px] leading-relaxed text-ink">{explanation.text}</p>
          {explanation.evidence.length ? (
            <ul aria-label="Figures used" className="flex flex-col gap-0.5">
              {explanation.evidence.map((line) => (
                <li key={line} className={`text-[11px] text-ink-muted ${MONO}`}>
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {hidden ? <p className="text-[11px] text-ink-muted">{hidden}</p> : null}
          {explanation.stale ? <p className="text-[11px] text-ink-muted">{SAY.STALE_EXPLANATION}</p> : null}
        </>
      ) : null}
      {explanation === null || explanation?.stale ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={kept.save} disabled={kept.writing} className={BUTTON}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {kept.writing ? SAY.EXPLAINING : explanation ? SAY.EXPLAIN_AGAIN : SAY.EXPLAIN}
          </button>
          <span className="text-[11px] text-ink-muted">{SAY.CREDITS}</span>
        </div>
      ) : null}
      {kept.writeError ? (
        <p role="alert" className="text-[13px] text-danger">
          {kept.writeError}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Write the moves list**

Create `src/components/brain/MovesList.tsx`:

```tsx
import { useState } from 'react';
import { changeText, driverText, handoverText, nothingMoved, SAY, toneOf, valueText } from '../../features/brain/brainText';
import type { ChangedPayload, ChangedSignal } from '../../features/brain/brainTypes';
import { MONO, QUIET } from '../organizations/portfolio/styles';
import { TONE_CLASS } from './styles';
import { WhyPanel } from './WhyPanel';

/** What moved materially (spec §2.3 item 3), in the server's order (bad news
 *  first). Why? opens one explanation at a time, inline under its row. */
export function MovesList({ changed, onRefused }: { changed: ChangedPayload; onRefused: (err: unknown) => boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-labelledby="moves-heading" className="flex flex-col gap-2">
      <h2 id="moves-heading" className="text-[15px] font-semibold text-ink">
        {SAY.MOVED}
      </h2>
      {changed.signals.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-6 text-[13px] text-ink-muted">{nothingMoved(changed.since)}</p>
      ) : (
        <ul aria-label={SAY.MOVED} className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {changed.signals.map((signal) => (
            <MoveRow
              key={signal.key}
              signal={signal}
              changed={changed}
              open={open === signal.key}
              onToggle={() => setOpen(open === signal.key ? null : signal.key)}
              onRefused={onRefused}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MoveRow({
  signal,
  changed,
  open,
  onToggle,
  onRefused,
}: {
  signal: ChangedSignal;
  changed: ChangedPayload;
  open: boolean;
  onToggle: () => void;
  onRefused: (err: unknown) => boolean;
}) {
  const { unit } = signal;
  const context = [driverText(signal.drivers), handoverText(signal.handover)].filter(Boolean).join(' · ');
  return (
    <li>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[13px] font-semibold text-ink">{signal.label}</p>
          <p className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink-muted">
            <span className={MONO}>
              {valueText(unit, signal.then, changed.currency)} → <span className="text-ink">{valueText(unit, signal.now, changed.currency)}</span>
            </span>
            <span className={`${MONO} font-semibold ${TONE_CLASS[toneOf(signal.better, signal.change, signal.improved)]}`}>
              {changeText(unit, signal.change, changed.currency)}
            </span>
          </p>
          {context ? <p className="text-[11px] text-ink-muted">{context}</p> : null}
        </div>
        <button
          type="button"
          aria-label={`Why? ${signal.label}`}
          aria-expanded={open}
          aria-controls={open ? `why-${signal.key}` : undefined}
          onClick={onToggle}
          className={`${QUIET} border border-line`}
        >
          Why?
        </button>
      </div>
      {open ? <WhyPanel metric={signal.key} label={signal.label} scope={changed.scope} onRefused={onRefused} /> : null}
    </li>
  );
}
```

- [ ] **Step 6: Write the measure list**

Create `src/components/brain/MeasureTable.tsx`:

```tsx
import { changeText, SAY, toneOf, valueText } from '../../features/brain/brainText';
import type { ChangedPayload } from '../../features/brain/brainTypes';
import { MONO } from '../organizations/portfolio/styles';
import { TONE_CLASS } from './styles';

const COLUMNS = 'sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]';

/** Every metric for the scope (spec §2.3 item 4): rows, not a table
 *  (Decision 11); a header row from sm, and on phones each row stacks with
 *  its own labels. Null reads "Not measured", never zero. */
export function MeasureTable({ changed }: { changed: ChangedPayload }) {
  const { currency } = changed;
  return (
    <section aria-labelledby="measure-heading" className="flex flex-col gap-2">
      <h2 id="measure-heading" className="text-[15px] font-semibold text-ink">
        {SAY.MEASURE}
      </h2>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div data-testid="measure-head" aria-hidden="true" className={`hidden gap-3 border-b border-line px-4 py-2 text-[11px] font-semibold text-ink-muted sm:grid ${COLUMNS}`}>
          <span>Metric</span>
          <span className="text-right">Then</span>
          <span className="text-right">Now</span>
          <span className="text-right">Change</span>
        </div>
        <ul aria-label={SAY.MEASURE} className="divide-y divide-line">
          {changed.metrics.map((m) => (
            <li key={m.key} className={`grid grid-cols-3 gap-x-3 gap-y-1 px-4 py-2.5 sm:items-baseline ${COLUMNS}`}>
              <span className="col-span-3 text-[13px] font-semibold text-ink sm:col-span-1">{m.label}</span>
              <Cell label="Then" value={valueText(m.unit, m.then, currency)} figure={m.then !== null} />
              <Cell label="Now" value={valueText(m.unit, m.now, currency)} figure={m.now !== null} />
              <Cell label="Change" value={changeText(m.unit, m.change, currency)} figure={m.change !== null} tone={TONE_CLASS[toneOf(m.better, m.change)]} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Cell({ label, value, figure, tone = 'text-ink' }: { label: string; value: string; figure: boolean; tone?: string }) {
  return (
    <span className="flex flex-col sm:block sm:text-right">
      <span className="text-[11px] text-ink-muted sm:sr-only">{label}</span>
      <span className={figure ? `${MONO} text-[13px] ${tone}` : 'text-[13px] text-ink-muted'}>{value}</span>
    </span>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/brain/MovesList.test.tsx src/components/brain/MeasureTable.test.tsx`
Expected: PASS. Then `npx eslint src/components/brain/useKept.ts src/components/brain/WhyPanel.tsx src/components/brain/MovesList.tsx src/components/brain/MeasureTable.tsx src/components/brain/styles.ts` → no output.

- [ ] **Step 8: Commit**

```bash
git add src/components/brain/useKept.ts src/components/brain/styles.ts src/components/brain/WhyPanel.tsx src/components/brain/MovesList.tsx src/components/brain/MeasureTable.tsx src/components/brain/MovesList.test.tsx src/components/brain/MeasureTable.test.tsx
git commit -m "feat(brain): what moved with inline Why?, and everything we measure

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The scope's brief

Spec §2.3 item 2 (kept: headline, body, "Watch next", "Written 5 Oct by Alice Admin for My team"; stale line and Write again; none: Write my brief / Write the company brief and "Uses AI credits."; "Writing…" disabled, one request; errors under the button with the server's text, the old brief stays); §1.5 (POST 200 or 201); Decision 16.

**Files:**
- Create: `src/components/brain/ScopeBriefCard.tsx`
- Test: `src/components/brain/ScopeBriefCard.test.tsx`

**Interfaces:**
- Consumes: `useKept` (Task 4); `fetchBrief`, `writeBrief` (Task 2); `SAY`, `writtenLine` (Task 1); `BUTTON`, `PRIMARY`, `QUIET` (`components/organizations/portfolio/styles`).
- Produces: `ScopeBriefCard({ scope: ScopeKey; scopeLabel: string; onRefused: (err: unknown) => boolean })`.

- [ ] **Step 1: Write the failing test**

Create `src/components/brain/ScopeBriefCard.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { COMPANY_BRIEF, ME_STALE_BRIEF } from '../../features/brain/testBrainFixtures';
import { ScopeBriefCard } from './ScopeBriefCard';

const card = () => screen.getByRole('region', { name: SAY.BRIEF });

describe('The scope’s brief (spec §2.3 item 2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows a kept brief: headline, paragraphs, Watch next and who wrote it for which view', async () => {
    const { spy } = stubBrain();
    render(<ScopeBriefCard scope="company" scopeLabel="Company" onRefused={() => false} />);
    expect(await within(card()).findByRole('heading', { name: COMPANY_BRIEF.headline })).toBeInTheDocument();
    expect(within(card()).getByText('Enterprise expansion offset part of it.')).toBeInTheDocument();
    expect(within(card()).getByRole('heading', { name: SAY.WATCH })).toBeInTheDocument();
    expect(within(card()).getByText('Analytics Suite renewals in November')).toBeInTheDocument();
    expect(within(card()).getByText('Written 5 Oct by Alice Admin for Company')).toBeInTheDocument();
    expect(within(card()).queryByRole('button')).toBeNull();
    expect(requests(spy, 'POST', '/brain/brief/')).toEqual([]);
  });

  it('marks a stale brief and offers Write again', async () => {
    stubBrain();
    render(<ScopeBriefCard scope="me" scopeLabel="Me" onRefused={() => false} />);
    expect(await screen.findByText(ME_STALE_BRIEF.headline)).toBeInTheDocument();
    expect(screen.getByText(SAY.STALE_BRIEF)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SAY.WRITE_AGAIN })).toBeInTheDocument();
  });

  it('offers Write my brief when none is kept, and sends it once however fast it is clicked', async () => {
    const { spy, releaseWrites } = stubBrain({ holdWrites: true });
    render(<ScopeBriefCard scope="team" scopeLabel="My team" onRefused={() => false} />);
    const write = await screen.findByRole('button', { name: SAY.WRITE_MINE });
    expect(screen.getByText(SAY.CREDITS)).toBeInTheDocument();
    await userEvent.dblClick(write);
    await userEvent.click(write);
    expect(screen.getByRole('button', { name: SAY.WRITING })).toBeDisabled();
    releaseWrites();
    expect(await screen.findByRole('heading', { name: 'A fresh brief for My team' })).toBeInTheDocument();
    expect(screen.getByText('Written 5 Oct by Alice Admin for My team')).toBeInTheDocument();
    expect(requests(spy, 'POST', '/brain/brief/')).toEqual(['/brain/brief/?scope=team']);
  });

  it('says Write the company brief for Company', async () => {
    stubBrain({ briefs: {} });
    render(<ScopeBriefCard scope="company" scopeLabel="Company" onRefused={() => false} />);
    expect(await screen.findByRole('button', { name: SAY.WRITE_COMPANY })).toBeInTheDocument();
  });

  it('shows the server’s refusal under the button and keeps the old brief', async () => {
    stubBrain({ refuseNextWrite: { status: 422, detail: 'There is nothing to brief on yet.' } });
    render(<ScopeBriefCard scope="me" scopeLabel="Me" onRefused={() => false} />);
    await userEvent.click(await screen.findByRole('button', { name: SAY.WRITE_AGAIN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('There is nothing to brief on yet.');
    expect(screen.getByText(ME_STALE_BRIEF.headline)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SAY.WRITE_AGAIN })).toBeEnabled();
  });

  it('says it could not load the brief, and tries again', async () => {
    const { revoke } = stubBrain();
    const onRefused = vi.fn(() => false);
    revoke('company');
    render(<ScopeBriefCard scope="company" scopeLabel="Company" onRefused={onRefused} />);
    expect(await screen.findByText(SAY.LOAD_BRIEF)).toBeInTheDocument();
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('hands a 403 SCOPE_NOT_ALLOWED on writing to the page', async () => {
    const { revoke } = stubBrain();
    const onRefused = vi.fn(() => true);
    render(<ScopeBriefCard scope="me" scopeLabel="Me" onRefused={onRefused} />);
    const write = await screen.findByRole('button', { name: SAY.WRITE_AGAIN });
    revoke('me');
    await userEvent.click(write);
    await waitFor(() => expect(onRefused).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
```

(The load-error test's `onRefused` answers `false`, standing for a page that did not recognise the error, so the card shows its own error; the real page's `refused` would move away instead.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/brain/ScopeBriefCard.test.tsx`
Expected: FAIL, "Failed to resolve import './ScopeBriefCard'".

- [ ] **Step 3: Write the card**

Create `src/components/brain/ScopeBriefCard.tsx`:

```tsx
import { Sparkles } from 'lucide-react';
import { fetchBrief, writeBrief } from '../../features/brain/brainApi';
import { SAY, writtenLine } from '../../features/brain/brainText';
import type { ScopeBrief, ScopeKey } from '../../features/brain/brainTypes';
import { BUTTON, PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { useKept } from './useKept';

/** The scope's brief (spec §2.3 item 2). Never written on load: a brief is a
 *  paid model call, so writing is a button that says so. */
export function ScopeBriefCard({ scope, scopeLabel, onRefused }: { scope: ScopeKey; scopeLabel: string; onRefused: (err: unknown) => boolean }) {
  const kept = useKept<ScopeBrief>({
    read: () => fetchBrief(scope).then((p) => p.brief),
    write: () => writeBrief(scope).then((p) => p.brief),
    onRefused,
    readFallback: SAY.LOAD_BRIEF,
    writeFallback: SAY.WRITE_FAILED,
  });
  const brief = kept.value;
  const offerWrite = brief === null || Boolean(brief?.stale);
  const label = kept.writing ? SAY.WRITING : brief ? SAY.WRITE_AGAIN : scope === 'company' ? SAY.WRITE_COMPANY : SAY.WRITE_MINE;

  return (
    <section aria-labelledby="brief-heading" className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-4 sm:px-5">
      <h2 id="brief-heading" className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {SAY.BRIEF}
      </h2>
      {brief === undefined && !kept.loadError ? (
        <div role="status" aria-label="Loading the brief" className="flex flex-col gap-2">
          <span aria-hidden="true" className="block h-4 w-2/3 animate-pulse rounded bg-subtle" />
          <span aria-hidden="true" className="block h-3 w-full animate-pulse rounded bg-subtle" />
          <span aria-hidden="true" className="block h-3 w-5/6 animate-pulse rounded bg-subtle" />
        </div>
      ) : null}
      {kept.loadError ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] text-ink-muted">{kept.loadError}</p>
          <button type="button" onClick={kept.retry} className={QUIET}>
            Try again
          </button>
        </div>
      ) : null}
      {brief ? (
        <article className="flex flex-col gap-3">
          <h3 className="text-[15px] font-semibold leading-snug text-ink">{brief.headline}</h3>
          <div className="flex max-w-prose flex-col gap-2">
            {brief.body.split(/\n\s*\n/).map((paragraph, index) => (
              <p key={index} className="text-[13px] leading-relaxed text-ink-muted">
                {paragraph}
              </p>
            ))}
          </div>
          {brief.watch.length ? (
            <div className="flex flex-col gap-1">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{SAY.WATCH}</h4>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {brief.watch.map((item) => (
                  <li key={item} className="text-[13px] text-ink-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-[11px] text-ink-muted">{writtenLine(brief, scopeLabel)}</p>
        </article>
      ) : null}
      {brief?.stale ? <p className="text-[13px] text-ink-muted">{SAY.STALE_BRIEF}</p> : null}
      {offerWrite ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={kept.save} disabled={kept.writing} className={brief ? BUTTON : PRIMARY}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
          <span className="text-[11px] text-ink-muted">{SAY.CREDITS}</span>
        </div>
      ) : null}
      {kept.writeError ? (
        <p role="alert" className="text-[13px] text-danger">
          {kept.writeError}
        </p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/brain/ScopeBriefCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/brain/ScopeBriefCard.tsx src/components/brain/ScopeBriefCard.test.tsx
git commit -m "feat(brain): scoped brief card, written once on demand

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The What changed page at `/brain`

Spec §2.3 (header with `h1`, switch, one line; brief; What moved; Everything we measure; Company knowledge for Company only; skeleton, error with retry, empty Me with the switch still offered); §2.1 (`/brain` for everyone, `/brain/dashboard` redirects); §2.2 (403 fallback on any Brain call); Decisions 6, 7, 14, 17.

**Files:**
- Create: `src/components/brain/useChanged.ts`, `src/components/brain/ChangedSkeleton.tsx`, `src/pages/brain/WhatChanged.tsx`, `src/pages/brain/testPages.tsx`
- Modify: `src/pages/brain/BrainRoutes.tsx`, `src/pages/brain/BrainRoutes.test.tsx`
- Test: `src/pages/brain/WhatChanged.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–5; `ErrorBlock`, `EmptyState` (`components/organizations/portfolio/PortfolioSections`); `QuestionsWaitingPanel`, `KnowledgeByFunctionPanel` (unchanged); `makeRulesStore`, `Role` (`pages/rules/testPages`); `SlotHost`, `setViewport`, `Where`.
- Produces:
  - `useChanged(scope: ScopeKey | null, onRefused) → { data: ChangedPayload | null; error: string | null; retry(): void }`.
  - `ChangedSkeleton()`; `WhatChangedPage()`.
  - `renderBrain(url, { width?: number; role?: Role; nav?: boolean }) → { store; unmount }` (test-only): `/brain/*` on `BrainRoutes`, plus `Where` everywhere.

- [ ] **Step 1: Write the failing page test**

Create `src/pages/brain/WhatChanged.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCOPE_STORAGE_KEY } from '../../features/brain/brainScope';
import { SAY } from '../../features/brain/brainText';
import { requests, stubBrain } from '../../features/brain/testBrain';
import { COMPANY_FIRST, ME_EMPTY, TEAM_RESET } from '../../features/brain/testBrainFixtures';
import { resetViewport } from '../../test/viewport';
import { renderBrain } from './testPages';

const where = () => screen.getByTestId('where').textContent;

describe('What changed: the scope (spec §2.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens on the server default, in the URL, with the switch pressed', async () => {
    stubBrain();
    renderBrain('/brain');
    await waitFor(() => expect(where()).toBe('/brain?scope=company'));
    expect(screen.getByRole('heading', { level: 1, name: SAY.TITLE })).toBeInTheDocument();
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Company' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches with one read per view and remembers the choice for next time', async () => {
    const { spy } = stubBrain();
    const first = renderBrain('/brain?scope=company');
    await screen.findByText('Since 30 Sep month-end');
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=team'));
    expect(await screen.findByText(/includes 2 customers handed to Dana CSM/)).toBeInTheDocument();
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('team');
    expect(requests(spy, 'GET', '/brain/changed/')).toEqual(['/brain/changed/?scope=company', '/brain/changed/?scope=team']);
    first.unmount();
    renderBrain('/brain');
    await waitFor(() => expect(where()).toBe('/brain?scope=team'));
  });

  it('is a select on phones', async () => {
    stubBrain();
    renderBrain('/brain?scope=team', { width: 375 });
    const select = await screen.findByRole('combobox', { name: 'View' });
    await userEvent.selectOptions(select, 'me');
    await waitFor(() => expect(where()).toBe('/brain?scope=me'));
  });

  it('moves to the default and says so when a Brain call answers 403 SCOPE_NOT_ALLOWED', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'team');
    const { revoke } = stubBrain();
    renderBrain('/brain');
    await screen.findByText(/includes 2 customers handed to Dana CSM/);
    revoke('team');
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    expect(await screen.findByText(SAY.LOST_ACCESS)).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/brain?scope=company'));
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole('button', { name: 'My team' })).toBeNull();
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
  });
});

describe('What changed: states (spec §2.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows a skeleton matching the layout while loading', () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    expect(screen.getByRole('status', { name: 'Loading what changed' })).toBeInTheDocument();
  });

  it('month-end: the brief, what moved, everything we measure and Company knowledge', async () => {
    stubBrain();
    renderBrain('/brain?scope=company');
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: SAY.BRIEF })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: SAY.MOVED })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: SAY.MEASURE })).toBeInTheDocument();
    const knowledge = screen.getByRole('region', { name: SAY.KNOWLEDGE });
    expect(within(knowledge).getByRole('region', { name: 'Questions waiting' })).toBeInTheDocument();
    expect(within(knowledge).getByRole('region', { name: 'Knowledge by function' })).toBeInTheDocument();
  });

  it('baseline: since the view started, nothing moved, no Company knowledge', async () => {
    stubBrain();
    renderBrain('/brain?scope=me');
    expect(await screen.findByText('Since 5 Oct, when your view started')).toBeInTheDocument();
    expect(screen.getByText('Nothing moved materially since 5 Oct.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: SAY.KNOWLEDGE })).toBeNull();
  });

  it('team changed: moves start from the change', async () => {
    stubBrain({ changed: { team: TEAM_RESET } });
    renderBrain('/brain?scope=team');
    expect(await screen.findByText('Your team changed on 12 Oct; moves start from then')).toBeInTheDocument();
  });

  it('Company before its first month-end (Decision 8)', async () => {
    stubBrain({ changed: { company: COMPANY_FIRST } });
    renderBrain('/brain?scope=company');
    expect(await screen.findByText(SAY.NO_MONTH_END)).toBeInTheDocument();
    expect(screen.getByText(SAY.NOTHING_TO_COMPARE)).toBeInTheDocument();
  });

  it('an empty Me: the empty state, the switch still offering the other views, no brief read', async () => {
    const { spy } = stubBrain({ changed: { me: ME_EMPTY } });
    renderBrain('/brain?scope=me');
    expect(await screen.findByText("You don't own any customers yet")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My team' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Company' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: SAY.MOVED })).toBeNull();
    expect(requests(spy, 'GET', '/brain/brief/')).toEqual([]);
  });

  it('an error with Try again (Decision 6)', async () => {
    stubBrain({ failChanged: 1 });
    renderBrain('/brain?scope=company');
    expect(await screen.findByText(SAY.LOAD_CHANGED)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
  });

  it('a failed scopes read with Try again', async () => {
    stubBrain({ failScopes: 1 });
    renderBrain('/brain');
    expect(await screen.findByText(SAY.LOAD_SCOPES)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
  });

  it('is open to a member without view_all_accounts', async () => {
    stubBrain({ offered: ['me'] });
    renderBrain('/brain', { role: 'csm' });
    await waitFor(() => expect(where()).toBe('/brain?scope=me'));
    expect(screen.getByText('Me')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
  });
});
```

Update `src/pages/brain/BrainRoutes.test.tsx`: add `vi.mock('./WhatChanged', () => ({ WhatChangedPage: () => <h1>What changed</h1> }));` beside the other mocks, and replace the two `it.each` blocks with:

```tsx
  it('opens What changed to everyone (spec §2.1)', () => {
    renderAt('/brain', 'csm');
    expect(screen.getByRole('heading', { name: 'What changed' })).toBeInTheDocument();
    expect(where()).toBe('/brain');
  });

  it.each(['/brain/dashboard', '/brain/nowhere'])('sends %s to /brain for everyone (Decision 14)', (url) => {
    renderAt(url, 'csm');
    expect(where()).toBe('/brain');
    expect(screen.getByRole('heading', { name: 'What changed' })).toBeInTheDocument();
  });

  it.each(['/brain/graph', '/brain/initiatives', '/brain/requests', '/brain/anomalies', '/brain/feedback', '/brain/agents', '/brain/skills'])(
    'keeps %s behind view_all_accounts',
    (url) => {
      renderAt(url, 'csm');
      expect(where()).toBe('/dashboard');
    },
  );

  it.each([
    ['/brain/graph', 'Knowledge graph', '/brain/graph'],
    ['/brain/requests', 'Feature requests', '/brain/requests'],
    ['/brain/review', 'Review queue', '/brain/review'],
  ])('routes %s for view_all_accounts as before', (url, heading, path) => {
    renderAt(url, 'admin');
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(where()).toBe(path);
  });
```

(`/brain/feedback`, `/brain/agents` and `/brain/skills` stay gated in this task; Task 7 turns them into redirects and updates that row.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/pages/brain/WhatChanged.test.tsx src/pages/brain/BrainRoutes.test.tsx`
Expected: FAIL, "Failed to resolve import './testPages'" and "'./WhatChanged'".

- [ ] **Step 3: Write the read hook and the skeleton**

Create `src/components/brain/useChanged.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchChanged } from '../../features/brain/brainApi';
import { SAY } from '../../features/brain/brainText';
import type { ChangedPayload, ScopeKey } from '../../features/brain/brainTypes';

type Answer = { key: string; data: ChangedPayload | null; error: string | null };

/** GET changed/?scope= for the settled scope, read again on Try again; a
 *  slower answer for another scope is dropped. A 403 SCOPE_NOT_ALLOWED goes
 *  to `onRefused` and shows no error of its own. */
export function useChanged(scope: ScopeKey | null, onRefused: (err: unknown) => boolean) {
  const [attempt, setAttempt] = useState(0);
  const key = scope ? `${scope}#${attempt}` : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!scope || !key) return;
    let alive = true;
    fetchChanged(scope).then(
      (data) => alive && setAnswer({ key, data, error: null }),
      (err: unknown) => {
        if (alive && !onRefused(err)) setAnswer({ key, data: null, error: SAY.LOAD_CHANGED });
      },
    );
    return () => {
      alive = false;
    };
    // `key` carries the scope and the attempt; `onRefused` is the page's stable callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = key && answer?.key === key ? answer : null;
  return { data: current?.data ?? null, error: current?.error ?? null, retry: () => setAttempt((n) => n + 1) };
}
```

Create `src/components/brain/ChangedSkeleton.tsx`:

```tsx
const BAR = 'block animate-pulse rounded bg-subtle';

/** The page's shape while it loads: the brief, three moves, five measures. */
export function ChangedSkeleton() {
  return (
    <div role="status" aria-label="Loading what changed" className="flex flex-col gap-6">
      <div aria-hidden="true" className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-4">
        <span className={`${BAR} h-3 w-16`} />
        <span className={`${BAR} h-4 w-2/3`} />
        <span className={`${BAR} h-3 w-full`} />
      </div>
      <ul aria-hidden="true" className="divide-y divide-line rounded-xl border border-line bg-surface">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex flex-col gap-2 px-4 py-3">
            <span className={`${BAR} h-3 w-32`} />
            <span className={`${BAR} h-3 w-48`} />
          </li>
        ))}
      </ul>
      <ul aria-hidden="true" className="divide-y divide-line rounded-xl border border-line bg-surface">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex justify-between gap-3 px-4 py-3">
            <span className={`${BAR} h-3 w-36`} />
            <span className={`${BAR} h-3 w-20`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/pages/brain/WhatChanged.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ChangedSkeleton } from '../../components/brain/ChangedSkeleton';
import { KnowledgeByFunctionPanel } from '../../components/brain/KnowledgeByFunctionPanel';
import { MeasureTable } from '../../components/brain/MeasureTable';
import { MovesList } from '../../components/brain/MovesList';
import { QuestionsWaitingPanel } from '../../components/brain/QuestionsWaitingPanel';
import { ScopeBriefCard } from '../../components/brain/ScopeBriefCard';
import { ScopeSwitch } from '../../components/brain/ScopeSwitch';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useChanged } from '../../components/brain/useChanged';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { emptyTitle, SAY, sinceLine } from '../../features/brain/brainText';

/** /brain: What changed (spec 2026-10-05 §2.3), for every member, scoped Me ·
 *  My team · Company. The Brain says why and what to do; the Dashboard keeps
 *  the "what is" tiles. */
export function WhatChangedPage() {
  const brain = useBrainScope();
  const changed = useChanged(brain.scope, brain.refused);
  const data = changed.data;
  const scope = brain.scope;

  let body: ReactNode;
  if (brain.error) body = <ErrorBlock message={brain.error} onRetry={brain.retry} />;
  else if (changed.error) body = <ErrorBlock message={changed.error} onRetry={changed.retry} />;
  else if (!scope || !data) body = <ChangedSkeleton />;
  else if (data.empty) body = <EmptyState title={emptyTitle(scope)} detail={SAY.EMPTY_DETAIL} action={null} />;
  else
    body = (
      <>
        <ScopeBriefCard key={`brief-${scope}`} scope={scope} scopeLabel={brain.label} onRefused={brain.refused} />
        <MovesList key={`moves-${scope}`} changed={data} onRefused={brain.refused} />
        <MeasureTable changed={data} />
        {scope === 'company' ? (
          <section aria-label={SAY.KNOWLEDGE} className="flex flex-col gap-6">
            <QuestionsWaitingPanel />
            <KnowledgeByFunctionPanel />
          </section>
        ) : null}
      </>
    );

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-2 py-4 sm:px-4 lg:py-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-[22px] text-ink">{SAY.TITLE}</h1>
            {data ? <p className="text-[13px] text-ink-muted">{sinceLine(data)}</p> : null}
          </div>
          {brain.offered && scope ? <ScopeSwitch scopes={brain.offered.scopes} value={scope} onChange={brain.choose} /> : null}
        </header>
        {brain.notice ? (
          <p role="status" className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink">
            {brain.notice}
          </p>
        ) : null}
        {body}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Route `/brain` to it for everyone**

Replace `src/pages/brain/BrainRoutes.tsx` with:

```tsx
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { RequireCapability } from '../../components/auth/RequireCapability';
import { AgentsPage } from './Agents';
import { AnomaliesPage } from './Anomalies';
import { FeatureRequestsPage } from './FeatureRequests';
import { FeedbackLogPage } from './Feedback';
import { GraphPage } from './Graph';
import { InitiativesPage } from './Initiatives';
import { ReviewQueuePage } from './Review';
import { SkillsPage } from './Skills';
import { WhatChangedPage } from './WhatChanged';

/** /brain/*: the Company Brain. What changed and the Review Queue are open to
 *  every signed-in member (spec 2026-10-05 §2.1; rules spec §2.4); the rest
 *  still needs view_all_accounts until deliveries 2–4 replace it. */
export function BrainRoutes() {
  return (
    <Routes>
      <Route index element={<WhatChangedPage />} />
      <Route path="review" element={<ReviewQueuePage />} />
      <Route path="dashboard" element={<Navigate to="/brain" replace />} />
      <Route
        element={
          <RequireCapability capability="view_all_accounts">
            <Outlet />
          </RequireCapability>
        }
      >
        <Route path="initiatives" element={<InitiativesPage />} />
        <Route path="feedback" element={<FeedbackLogPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="requests" element={<FeatureRequestsPage />} />
        <Route path="anomalies" element={<AnomaliesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/brain" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 6: Write the test render**

Create `src/pages/brain/testPages.tsx`:

```tsx
// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore, type Role } from '../rules/testPages';
import { BrainRoutes } from './BrainRoutes';

/** The Brain routes on the real store and router, as App.tsx routes them.
 *  The signed-in user is Alice (id 1). Only fetch is stubbed (stubBrain). */
export function renderBrain(url: string, { width = 1440, role = 'admin', nav = false }: { width?: number; role?: Role; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeRulesStore(role);
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route path="/brain/*" element={<><BrainRoutes /><Where /></>} />
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/pages/brain/WhatChanged.test.tsx src/pages/brain/BrainRoutes.test.tsx`
Expected: PASS. Then `npx tsc -b --noEmit` → no output; `npx eslint src/pages/brain src/components/brain/useChanged.ts src/components/brain/ChangedSkeleton.tsx` → no new findings.

- [ ] **Step 8: Commit**

```bash
git add src/components/brain/useChanged.ts src/components/brain/ChangedSkeleton.tsx src/pages/brain/WhatChanged.tsx src/pages/brain/WhatChanged.test.tsx src/pages/brain/testPages.tsx src/pages/brain/BrainRoutes.tsx src/pages/brain/BrainRoutes.test.tsx
git commit -m "feat(brain): What changed at /brain for every member

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The sidebar, Settings > AI, the redirects and the Navbar title

Spec §2.1 (What changed first in a Brain group shown to everyone; Knowledge Graph leaves the sidebar; three tabs after Agent Access with the same pages and permissions; `/brain/agents|skills|feedback` redirect); Decisions 12, 13, 15.

**Files:**
- Create: `src/pages/settings/aiSettingsTabs.ts`, `src/pages/settings/aiSettingsTabs.test.ts`
- Modify: `src/pages/brain/BrainRoutes.tsx`, `src/pages/brain/BrainRoutes.test.tsx`, `src/App.tsx:43-44,327-340`, `src/components/layout/Sidebar.tsx`, `src/components/layout/Sidebar.test.tsx`, `src/components/layout/Navbar.tsx:445-470,495-502`, `src/components/layout/Navbar.test.tsx`, `src/pages/brain/Skills.tsx:128`

**Interfaces:**
- Consumes: `AgentsPage`, `SkillsPage`, `FeedbackLogPage` (`pages/brain`), `RequireCapability`, `useCapability`.
- Produces: `AI_SETTINGS_TABS: readonly { name: string; path: string }[]` (`'AI usage' /settings/ai-usage`, `'AI skills' /settings/ai-skills`, `'AI feedback' /settings/ai-feedback`).

- [ ] **Step 1: Write the failing tests**

Create `src/pages/settings/aiSettingsTabs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import app from '../../App.tsx?raw';
import { AI_SETTINGS_TABS } from './aiSettingsTabs';

// App.tsx's route table is not rendered by any test; this pins the three
// Settings > AI routes to their pages and their gate (spec §2.1).
describe('Settings > AI (spec §2.1)', () => {
  it('names the three tabs in order', () => {
    expect(AI_SETTINGS_TABS).toEqual([
      { name: 'AI usage', path: '/settings/ai-usage' },
      { name: 'AI skills', path: '/settings/ai-skills' },
      { name: 'AI feedback', path: '/settings/ai-feedback' },
    ]);
  });

  it.each([
    ['ai-usage', 'AgentsPage'],
    ['ai-skills', 'SkillsPage'],
    ['ai-feedback', 'FeedbackLogPage'],
  ])('routes %s to %s behind view_all_accounts', (segment, page) => {
    expect(app).toContain(`<Route path="${segment}" element={<RequireCapability capability="view_all_accounts"><${page} /></RequireCapability>} />`);
  });
});
```

In `src/pages/brain/BrainRoutes.test.tsx`, add after the "opens What changed" test:

```tsx
  it.each([
    ['/brain/agents', '/settings/ai-usage'],
    ['/brain/skills', '/settings/ai-skills'],
    ['/brain/feedback', '/settings/ai-feedback'],
  ])('redirects %s to %s (spec §2.1)', (url, path) => {
    renderAt(url, 'admin');
    expect(where()).toBe(path);
  });
```

and remove `'/brain/feedback', '/brain/agents', '/brain/skills'` from the "keeps %s behind view_all_accounts" list. Its render tree gains `<Route path="/settings/*" element={<h1>Settings</h1>} />` beside `/dashboard`.

In `src/components/layout/Sidebar.test.tsx`, replace the `describe('Sidebar and role-based access', …)` block with:

```tsx
describe('Sidebar Brain group (spec 2026-10-05 §2.1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, []))));
  });

  it('shows every member What changed first and the Review Queue, without the badge request', async () => {
    const spy = vi.fn<(url: string) => Promise<unknown>>(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal('fetch', spy);
    renderSidebar('csm');
    expect(await screen.findByRole('link', { name: 'What changed' })).toHaveAttribute('href', '/brain');
    expect(screen.getByRole('link', { name: 'Review Queue' })).toHaveAttribute('href', '/brain/review');
    for (const name of ['Initiatives', 'Feature Requests', 'Anomalies', 'Knowledge Graph', 'Users']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(spy.mock.calls.some(([url]) => url.includes('/metrics/proposals/'))).toBe(false);
  });

  it('adds Initiatives, Feature Requests and Anomalies for view_all_accounts; the AI pages and the graph have left', async () => {
    renderSidebar('admin');
    const whatChanged = await screen.findByRole('link', { name: 'What changed' });
    const brain = ['What changed', 'Initiatives', 'Feature Requests', 'Anomalies', 'Review Queue'].map((name) => screen.getByRole('link', { name }));
    expect(brain[0]).toBe(whatChanged);
    for (let i = 1; i < brain.length; i++) {
      expect(brain[i - 1].compareDocumentPosition(brain[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    for (const name of ['Knowledge Graph', 'Brain Overview', 'Feedback Log', 'Agents', 'Skills']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Users/ })).toBeInTheDocument();
  });

  it('lights What changed on /brain only, not on the Review Queue', async () => {
    renderSidebar('csm', '/brain/review');
    expect(await screen.findByRole('link', { name: 'What changed' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Review Queue' })).toHaveAttribute('aria-current', 'page');
  });
});
```

In `src/components/layout/Navbar.test.tsx`, give `renderNavbar` a sixth parameter `user: typeof mockUser = mockUser` and use it for `auth.user` in `preloadedState`; then add:

```tsx
describe('Navbar on the Brain and Settings > AI (spec 2026-10-05 §2.1)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('titles /brain without a heading, so the page’s "What changed" is the only h1 (Decision 12)', () => {
    renderNavbar('/brain');
    expect(screen.getByText('Brain')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('adds AI usage, AI skills and AI feedback after Agent Access for view_all_accounts', () => {
    renderNavbar('/settings/ai-usage');
    const names = screen.getAllByRole('link').map((link) => link.textContent);
    const at = names.indexOf('Agent Access');
    expect(names.slice(at, at + 4)).toEqual(['Agent Access', 'AI usage', 'AI skills', 'AI feedback']);
    expect(screen.getByRole('link', { name: 'AI usage' })).toHaveAttribute('href', '/settings/ai-usage');
    expect(screen.getByRole('link', { name: 'AI feedback' })).toHaveAttribute('href', '/settings/ai-feedback');
  });

  it('leaves them out for a member without view_all_accounts (Decision 13)', () => {
    renderNavbar('/settings/data', null, null, [], () => {}, { ...mockUser, role: 'csm' as never, role_name: 'CSM', permissions: [] });
    expect(screen.getByRole('link', { name: 'Agent Access' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'AI usage' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/pages/settings/aiSettingsTabs.test.ts src/pages/brain/BrainRoutes.test.tsx src/components/layout/Sidebar.test.tsx src/components/layout/Navbar.test.tsx`
Expected: FAIL: `./aiSettingsTabs` does not resolve; the redirects land on `/dashboard`; there is no "What changed" link; the Navbar has an `h1` "brain" and no AI tabs.

- [ ] **Step 3: Add the tab list and the Settings routes**

Create `src/pages/settings/aiSettingsTabs.ts`:

```ts
/** Settings > AI (spec 2026-10-05 §2.1): the Brain's former Agents, Skills
 *  and Feedback Log pages, after Agent Access. Read with view_all_accounts;
 *  budgets change with manage_org_settings, as before. */
export const AI_SETTINGS_TABS = [
  { name: 'AI usage', path: '/settings/ai-usage' },
  { name: 'AI skills', path: '/settings/ai-skills' },
  { name: 'AI feedback', path: '/settings/ai-feedback' },
] as const;
```

In `src/App.tsx`, import the three pages beside `AgentAccessPage` (line 43):

```tsx
import { AgentsPage } from './pages/brain/Agents';
import { SkillsPage } from './pages/brain/Skills';
import { FeedbackLogPage } from './pages/brain/Feedback';
```

(and `RequireCapability` from `./components/auth/RequireCapability` if App.tsx does not import it yet), and after `<Route path="agent-access" element={<AgentAccessPage />} />` add:

```tsx
            <Route path="ai-usage" element={<RequireCapability capability="view_all_accounts"><AgentsPage /></RequireCapability>} />
            <Route path="ai-skills" element={<RequireCapability capability="view_all_accounts"><SkillsPage /></RequireCapability>} />
            <Route path="ai-feedback" element={<RequireCapability capability="view_all_accounts"><FeedbackLogPage /></RequireCapability>} />
```

- [ ] **Step 4: Redirect the old Brain paths**

In `src/pages/brain/BrainRoutes.tsx`, remove the `AgentsPage`, `SkillsPage` and `FeedbackLogPage` imports and their three gated routes, and add after the `dashboard` redirect:

```tsx
      <Route path="agents" element={<Navigate to="/settings/ai-usage" replace />} />
      <Route path="skills" element={<Navigate to="/settings/ai-skills" replace />} />
      <Route path="feedback" element={<Navigate to="/settings/ai-feedback" replace />} />
```

In `src/pages/brain/Skills.tsx` line 128, change `to="/brain/agents"` to `to="/settings/ai-usage"`.

- [ ] **Step 5: Rebuild the sidebar's Brain group**

In `src/components/layout/Sidebar.tsx`:

1. Remove `Bot`, `MessageSquareWarning` and `Wand2` from the lucide import (`Network` stays for Organizations).
2. Replace the whole `{canSeeAll ? ( … ) : ( … )}` Brain block with:

```tsx
        {/* KNOWLEDGE BRAIN (spec 2026-10-05 §2.1): What changed and the
            Review Queue for every member; Initiatives, Feature Requests and
            Anomalies keep their view_all_accounts gate until deliveries 2–4.
            The Knowledge Graph is linked from the pages, not listed here;
            Agents, Skills and Feedback Log live in Settings > AI. */}
        <div className="h-px bg-line my-2 w-8" role="separator"></div>
        <NavItem to="/brain" end icon={<Brain className="w-5 h-5" />} label="What changed" />
        {canSeeAll ? (
          <>
            <NavItem to="/brain/initiatives" icon={<Flag className="w-5 h-5" />} label="Initiatives" />
            <NavItem to="/brain/requests" icon={<Lightbulb className="w-5 h-5" />} label="Feature Requests" />
            <NavItem to="/brain/anomalies" icon={<Radar className="w-5 h-5" />} label="Anomalies" />
          </>
        ) : null}
        <NavItem to="/brain/review" icon={<CheckSquare className="w-5 h-5" />} label="Review Queue" badge={canSeeAll ? pendingProposals : undefined} />
```

3. Give `NavItem` an `end` prop passed to `NavLink`:

```tsx
function NavItem({ icon, to, label, isActiveOverride = false, badge, end = false }: { icon: React.ReactNode, to: string, label: string, isActiveOverride?: boolean, badge?: number, end?: boolean }) {
```

and `<NavLink ref={ref} {...hover.handlers} to={to} end={end} aria-label={label} …>`.

- [ ] **Step 6: The Navbar: the AI tabs and the /brain title**

In `src/components/layout/Navbar.tsx`:

1. Import `useCapability` from `'../../hooks'` (beside `useAppDispatch, useAppSelector`) and `AI_SETTINGS_TABS` from `'../../pages/settings/aiSettingsTabs'`.
2. Near `isSettings`, add:

```tsx
  // Settings > AI (spec 2026-10-05 §2.1, Decision 13): only for those who can open the pages.
  const canSeeAll = useCapability('view_all_accounts');
  // /brain's page draws its own h1, "What changed" (Decision 12).
  const isBrainHome = /^\/brain\/?$/.test(location.pathname);
```

3. In the Settings tab array, after `{ name: 'Agent Access', path: '/settings/agent-access' }`, add `...(canSeeAll ? AI_SETTINGS_TABS : [])` (the array literal's element list becomes `[…, { name: 'Agent Access', path: '/settings/agent-access' }, ...(canSeeAll ? AI_SETTINGS_TABS : [])]`).
4. Before the final default-title branch (`) : (` that renders `location.pathname.split('/')[1]`), add:

```tsx
        ) : isBrainHome ? (
          <div className="flex items-center gap-2 py-1.5 px-2 -ml-2 rounded-md">
            <p className="text-[17px] font-bold text-ink tracking-tight">Brain</p>
          </div>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/pages/settings/aiSettingsTabs.test.ts src/pages/brain src/components/layout`
Expected: PASS. Then `npx tsc -b --noEmit` → no output.

(`import app from '../../App.tsx?raw'` type-checks through `/// <reference types="vite/client" />` in `src/vite-env.d.ts`, which declares `*?raw`.)

- [ ] **Step 8: Commit**

```bash
git add src/pages/settings/aiSettingsTabs.ts src/pages/settings/aiSettingsTabs.test.ts src/App.tsx src/pages/brain/BrainRoutes.tsx src/pages/brain/BrainRoutes.test.tsx src/pages/brain/Skills.tsx src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx
git commit -m "feat(brain): Brain group for everyone, Settings > AI tabs and redirects

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Remove the old Overview

Spec §2.3 last paragraph ("`MetricLayerPanel`, `SignalsPanel`, `DriversPanel` and the old `Dashboard.tsx` are removed once nothing imports them; `BriefPanel` and `ExplanationCard` are replaced"); Decision 18.

**Files:**
- Delete: `src/pages/brain/Dashboard.tsx`, `src/components/brain/BriefPanel.tsx`, `src/components/brain/BriefPanel.test.tsx`, `src/components/brain/ExplanationCard.tsx`, `src/components/brain/ExplanationCard.test.tsx`, `src/components/brain/SignalsPanel.tsx`, `src/components/brain/MetricLayerPanel.tsx`, `src/components/brain/MetricLayerPanel.test.tsx`, `src/components/brain/DriversPanel.tsx`, `src/components/brain/whyPanels.test.tsx`
- Modify: `src/features/metrics/metricsSlice.ts`, `src/components/brain/formatMetric.ts`, `src/pages/brain/BrainRoutes.test.tsx` (drop the `./Dashboard` mock)

**Interfaces:**
- Consumes: nothing new.
- Produces: `metricsSlice` keeps `MetricUnit`, `MetricDirection`, `Metric`, `SliceMember`, `SlicePayload`, `MetricsPayload`, `sliceKey`, `fetchMetrics`, `fetchMetricSlice` and their state (`data`, `isLoading`, `error`, `slices`, `sliceLoading`, `sliceError`); `formatMetric.ts` keeps `formatMetricValue`.

- [ ] **Step 1: Confirm nothing else imports the old parts**

Run: `grep -rnE "BriefPanel|ExplanationCard|SignalsPanel|MetricLayerPanel|DriversPanel|BrainDashboard|fetchBrief|generateBrief|fetchExplanation|generateExplanation|fetchSignals|monthName|formatMetricChange" src | grep -v "^src/components/brain/\(BriefPanel\|ExplanationCard\|SignalsPanel\|MetricLayerPanel\|DriversPanel\|whyPanels\)" | grep -v "^src/pages/brain/Dashboard.tsx" | grep -v "^src/features/metrics/metricsSlice.ts" | grep -v "^src/components/brain/formatMetric.ts" | grep -v "^src/features/brain/"`
Expected: only `src/pages/brain/BrainRoutes.test.tsx` (the `./Dashboard` mock) and `src/components/organizations/AccountBriefPanel*` (its own component; not ours, untouched).

- [ ] **Step 2: Delete the files and the dead mock**

```bash
git rm src/pages/brain/Dashboard.tsx src/components/brain/BriefPanel.tsx src/components/brain/BriefPanel.test.tsx src/components/brain/ExplanationCard.tsx src/components/brain/ExplanationCard.test.tsx src/components/brain/SignalsPanel.tsx src/components/brain/MetricLayerPanel.tsx src/components/brain/MetricLayerPanel.test.tsx src/components/brain/DriversPanel.tsx src/components/brain/whyPanels.test.tsx
```

In `src/pages/brain/BrainRoutes.test.tsx`, delete the line `vi.mock('./Dashboard', () => ({ BrainDashboard: () => <h1>Brain dashboard</h1> }));`.

- [ ] **Step 3: Trim the metrics slice**

In `src/features/metrics/metricsSlice.ts` delete: the `Driver`, `Signal`, `SignalsPayload`, `Brief` and `Explanation` interfaces; the state fields `signals`, `signalsError`, `brief`, `briefGenerating`, `briefError`, `explanations`, `explaining`, `explainErrors` (from `MetricsState` and `initialState`); the thunks `fetchExplanation`, `generateExplanation`, `fetchBrief`, `generateBrief`, `fetchSignals`; and every `.addCase` for those five thunks. Update the header comment's last line to: "Initiatives reads it; the Brain's scoped figures come from /api/v1/brain/ (features/brain)." The resulting state is:

```ts
interface MetricsState {
  data: MetricsPayload | null;
  isLoading: boolean;
  error: string | null;
  /** Keyed `${metric}:${dimension}` — a cut fetched once is kept. */
  slices: Record<string, SlicePayload>;
  sliceLoading: string | null;
  sliceError: string | null;
}

const initialState: MetricsState = {
  data: null,
  isLoading: false,
  error: null,
  slices: {},
  sliceLoading: null,
  sliceError: null,
};
```

- [ ] **Step 4: Trim the formatter**

Replace `src/components/brain/formatMetric.ts` with:

```ts
import type { CurrencyCode } from '../../features/auth/authSlice';
import type { MetricUnit } from '../../features/metrics/metricsSlice';
import { formatCompactMoney } from '../../features/customers/formatters';

/** A metric value in its own unit; a dash for unmeasured, never a zero.
 *  Initiatives reads it; the Brain page formats through features/brain/brainText. */
export function formatMetricValue(unit: MetricUnit, value: number | null, currency: CurrencyCode): string {
  if (value === null) return '—';
  if (unit === 'money') return formatCompactMoney(value, currency);
  if (unit === 'percent') return `${value}%`;
  return String(Math.round(value));
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc -b --noEmit` → no output.
Run: `npx vitest run --maxWorkers=2 src/pages/brain src/components/brain src/features/brain`
Expected: PASS (Initiatives included).

- [ ] **Step 6: Commit**

```bash
git add -A src/pages/brain src/components/brain src/features/metrics/metricsSlice.ts
git commit -m "refactor(brain): remove the old Overview and its whole-organisation panels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: House rules, the journey, the documents and the full run

Spec §2.4 (Brain house-rules suite: tokens, type sizes, touch targets, empty and error states; e2e journey: a manager switches Me → My team → Company, writes a brief, opens Why?; `03-ui-ux-design` and `04-app-flow` describe only what ships); Global Constraints.

**Files:**
- Create: `src/components/brain/houseRules.test.ts`, `src/e2e/brain.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: everything above; `houseRuleSuite`, `rowsIconsTargetsSuite`, `sizeOffenders` (`src/test/houseRules`).
- Produces: nothing new.

- [ ] **Step 1: Write the house-rules suite**

Create `src/components/brain/houseRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over What changed (spec §2.4): every new Brain component and
// the page. The two Company knowledge panels ride along unchanged (spec §2.3
// item 5) with their older sizes and table; delivery 2 moves and rebuilds them.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const all = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/brain/WhatChanged.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const UNCHANGED = ['./QuestionsWaitingPanel.tsx', './KnowledgeByFunctionPanel.tsx'];
const files = Object.fromEntries(Object.entries(all).filter(([file]) => !UNCHANGED.includes(file)));
const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));

houseRuleSuite('brain house rules', files);
rowsIconsTargetsSuite('brain rows, icons and targets', files);

describe('brain: coverage, figures, states, storage, copy', () => {
  it('covers the page and every new component', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/brain/WhatChanged.tsx',
        './ScopeSwitch.tsx',
        './ScopeBriefCard.tsx',
        './MovesList.tsx',
        './WhyPanel.tsx',
        './MeasureTable.tsx',
        './ChangedSkeleton.tsx',
      ]),
    );
  });

  it('uses at most four type sizes across the page', () => {
    const sizes = new Set(sources.flatMap(([, s]) => [...s.matchAll(/text-\[(\d+)px\]/g)].map((m) => m[1])));
    expect(sizes.size).toBeLessThanOrEqual(4);
  });

  it('sets every figure in DM Mono with tabular-nums', () => {
    for (const file of ['./MovesList.tsx', './MeasureTable.tsx', './WhyPanel.tsx']) {
      expect(files[file]).toMatch(/\bMONO\b/);
    }
  });

  it('designs loading, empty and error states', () => {
    const page = files['../../pages/brain/WhatChanged.tsx'];
    expect(page).toMatch(/<ChangedSkeleton \/>/);
    expect(page).toMatch(/<EmptyState /);
    expect(page).toMatch(/<ErrorBlock /);
    expect(files['./MovesList.tsx']).toMatch(/nothingMoved\(/);
    for (const file of ['./ScopeBriefCard.tsx', './WhyPanel.tsx']) {
      expect(files[file]).toMatch(/animate-pulse/);
      expect(files[file]).toMatch(/Try again/);
    }
  });

  it('nests no card in a card: the Why? panel is a flat block', () => {
    expect(files['./WhyPanel.tsx']).not.toMatch(/rounded-(lg|xl)/);
  });

  it('touches localStorage only in features/brain/brainScope.ts', () => {
    expect(sources.filter(([, s]) => /localStorage|sessionStorage/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('writes no em dash in its copy', () => {
    expect(sources.filter(([, s]) => s.includes('—')).map(([f]) => f)).toEqual([]);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/brain/houseRules.test.ts`
Expected: PASS. A failure names the file and the rule; fix the file, not the suite.

- [ ] **Step 2: Write the journey**

Create `src/e2e/brain.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCOPE_STORAGE_KEY } from '../features/brain/brainScope';
import { SAY } from '../features/brain/brainText';
import { requests, stubBrain } from '../features/brain/testBrain';
import { COMPANY_EXPLANATION, ME_STALE_BRIEF } from '../features/brain/testBrainFixtures';
import { renderBrain } from '../pages/brain/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, BrainRoutes, the page
// and the router. Only fetch is stubbed, by a stateful stub in §4's shapes
// (spec §2.4: a manager switches Me → My team → Company, writes a brief,
// opens Why?).
const where = () => screen.getByTestId('where').textContent;

describe('Brain: What changed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('a manager switches Me → My team → Company, writes the company brief once, and opens Why?', { timeout: 30000 }, async () => {
    const { spy } = stubBrain({ briefs: { me: ME_STALE_BRIEF }, hidden: 2 });
    renderBrain('/brain?scope=me', { nav: true });

    // 1. Me: a baseline taken today, a stale brief, nothing material.
    expect(await screen.findByText('Since 5 Oct, when your view started')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([SAY.TITLE]);
    expect(await screen.findByText(SAY.STALE_BRIEF)).toBeInTheDocument();
    expect(screen.getByText('Nothing moved materially since 5 Oct.')).toBeInTheDocument();

    // 2. My team: the month-end, a handover, and an explanation written once.
    await userEvent.click(screen.getByRole('button', { name: 'My team' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=team'));
    expect(await screen.findByText('Since 30 Sep month-end')).toBeInTheDocument();
    expect(screen.getByText(/includes 2 customers handed to Dana CSM/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    const teamWhy = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    await userEvent.dblClick(await within(teamWhy).findByRole('button', { name: SAY.EXPLAIN }));
    expect(await within(teamWhy).findByText("2 more accounts you can't open")).toBeInTheDocument();
    expect(requests(spy, 'POST', '/explanations/')).toEqual(['/brain/explanations/arr_at_risk/?scope=team']);

    // 3. Company: write the company brief (one request), then Why? shows the kept explanation.
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await waitFor(() => expect(where()).toBe('/brain?scope=company'));
    await userEvent.dblClick(await screen.findByRole('button', { name: SAY.WRITE_COMPANY }));
    expect(await screen.findByRole('heading', { name: 'A fresh brief for Company' })).toBeInTheDocument();
    expect(screen.getByText('Written 5 Oct by Alice Admin for Company')).toBeInTheDocument();
    expect(requests(spy, 'POST', '/brain/brief/')).toEqual(['/brain/brief/?scope=company']);
    await userEvent.click(screen.getByRole('button', { name: 'Why? ARR at risk' }));
    const companyWhy = screen.getByRole('region', { name: 'Why ARR at risk moved' });
    expect(await within(companyWhy).findByText(COMPANY_EXPLANATION.text)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: SAY.KNOWLEDGE })).toBeInTheDocument();

    // 4. The last choice is remembered.
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('company');
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/e2e/brain.test.tsx`
Expected: PASS.

- [ ] **Step 3: Update the product documents (only what ships)**

- `docs/04-app-flow.md`:
  - Routes table: replace the two `/brain/…` rows with:
    `| `/brain` | `WhatChangedPage`: What changed, scoped Me / My team / Company (`?scope=`) | auth |`
    `| `/brain/review` | `ReviewQueuePage`: From your rules for everyone; the AI proposals for `view_all_accounts` only | auth |`
    `| `/brain/{graph,initiatives,requests,anomalies}` | one page each (`pages/brain/BrainRoutes.tsx`) | `view_all_accounts` |`
    `| `/brain/dashboard`, `/brain/agents`, `/brain/skills`, `/brain/feedback` | redirect to `/brain`, `/settings/ai-usage`, `/settings/ai-skills`, `/settings/ai-feedback` | auth |`
    and add `ai-usage,ai-skills,ai-feedback` (the former Agents, Skills, Feedback Log pages, `view_all_accounts`) to the Settings rows.
  - Navigation: the KNOWLEDGE BRAIN sentence becomes "KNOWLEDGE BRAIN (What changed and Review Queue for everyone; Initiatives, Feature Requests and Anomalies for `view_all_accounts`, with a live pending-proposal badge on Review Queue for them)".
  - §4.11 Brain: replace its paragraph with: What changed at `/brain` for every member; the scope switch (only the scopes `GET /brain/scopes/` offers; a label for one; a select on phones; `?scope=`, else the last choice in `localStorage`, else the server's default; a 403 `SCOPE_NOT_ALLOWED` drops back to the default with "You no longer have access to that view."); the header line (month-end, baseline, team changed); the brief (kept, stale with Write again, Write my brief / Write the company brief, sent once); What moved with drivers, handovers and an inline Why? (kept explanation or Explain this, hidden accounts counted); Everything we measure; Company knowledge under Company. Initiatives, Feature Requests, Anomalies, Review Queue and the Knowledge Graph (linked, not in the sidebar) unchanged; Agents, Skills and Feedback Log are Settings > AI usage / AI skills / AI feedback.
  - Slice table: the `metrics` row keeps "Initiatives"; the Brain page reads `/brain/` through hooks (`features/brain`), no slice.
- `docs/03-ui-ux-design.md`: add a "### Brain: What changed" entry after Canvas: spec path; `components/brain/` with its own house-rules suite; the header (`h1` at 22px in DM Serif Display, the since line, the switch: segmented from `sm`, select below, a label for one scope); the brief card (one bordered surface; Write buttons say "Uses AI credits."); What moved (rows; then → now and the change in DM Mono tabular, the change a word and a colour; Why? opens a flat panel inside the row, one at a time); Everything we measure (rows not a table; column heads from `sm`, stacked labelled rows below); states (skeleton, Try again, the empty view); no glass; the Navbar shows "Brain" as a paragraph on `/brain`.
- `.agents/workflows/repo-architecture.md`: line 144 becomes `├── brain/*                    → BrainRoutes (What changed and review open to all; the rest needs view_all_accounts)`; add `features/brain/` (contract, scope choice, text, API, stub) and the new `components/brain/` files to the tree; note `pages/settings/aiSettingsTabs.ts`.

Run: `grep -rnE "Brain Overview|BrainDashboard|/brain/dashboard\b|MetricLayerPanel|SignalsPanel|DriversPanel|BriefPanel\b|ExplanationCard" docs .agents src | grep -v "docs/superpowers/"`
Expected: only the redirect row in `docs/04-app-flow.md` and `src/pages/brain/BrainRoutes.tsx`/its test (the `/brain/dashboard` redirect).

- [ ] **Step 4: Full verification**

Run, one at a time:
- `npx tsc -b --noEmit` → no output.
- `npm run lint` → `✖ 15 problems (0 errors, 15 warnings)`.
- `npm run build` → succeeds.
- `npx vitest run --maxWorkers=2` → every file passes.

If the full run shows a failure outside the Brain folders, it is almost certainly a test that read the old sidebar entries ("Brain Overview", "Knowledge Graph"), the Navbar's lowercase "brain" heading, or `/brain/agents`; fix that test to the new behaviour (Task 7 lists the known ones).

- [ ] **Step 5: Commit**

```bash
git add src/components/brain/houseRules.test.ts src/e2e/brain.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): brain journey, house rules and product documents

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

**Spec coverage.** §0 context → Architecture, Contract notes, Task 8 (what is removed). §2.1 sidebar (What changed first, group for everyone, gates kept, Knowledge Graph out), `/brain/dashboard` redirect, Settings > AI tabs after Agent Access with the same pages and permissions, old paths redirect → Tasks 6, 7. §2.2 switch (offered scopes only, label for one, select below `sm`), `?scope=`, `revenact_brain_scope` in try/catch, server default, stale stored scope dropped, 403 fallback with its sentence, reusable component → Tasks 1, 3, 6. §2.3 header and its three lines → Tasks 1, 6; brief (kept, stale, none, Company wording, Writing… once, errors with the old brief kept) → Task 5; What moved (row content, handover, Why? inline one at a time, kept or Explain this, hidden, empty) → Task 4; Everything we measure (Not measured, small moves, stacking) → Task 4; Company knowledge for Company only → Task 6; states (skeleton, error with retry, empty Me with the switch) → Task 6; removals → Task 8. §2.4 look and house rules → Global Constraints, Task 9; tests (switch/URL/memory, 403, each state, writes once, redirects) → Tasks 3–7; stub and journey → Tasks 2, 9; documents → Task 9. §4 every endpoint and field → Tasks 1, 2.

**Placeholder scan.** No TBD/TODO; every code step carries its code. Where an existing file is edited (BrainRoutes test, Sidebar, Navbar, App, metricsSlice, docs), the exact lines to add, remove or replace are given.

**Type consistency.** `ScopeKey`, `ScopeOption`, `ScopesPayload`, `ChangedPayload`, `ChangedSignal`, `ScopeBrief`, `ScopeExplanation`, `WrittenBrief`, `WrittenExplanation` (Task 1) are used unchanged in Tasks 2–9; `useBrainScope`'s `{ offered, scope, label, error, notice, retry, choose, refused }` match `WhatChangedPage`; `useKept`'s `{ value, loadError, retry, save, writing, writeError }` match `WhyPanel` and `ScopeBriefCard`; `stubBrain`'s options (`offered`, `changed`, `briefs`, `explanations`, `hidden`, `failScopes`, `failChanged`, `refuseNextWrite`, `holdWrites`) and returns (`spy`, `revoke`, `releaseWrites`) match every test; `requests` returns paths without `/api/v1` everywhere; `SAY` keys used in tests (`TITLE`, `LOST_ACCESS`, `NOT_MEASURED`, `NOT_COMPARED`, `NO_MONTH_END`, `NOTHING_TO_COMPARE`, `BRIEF`, `WATCH`, `STALE_BRIEF`, `STALE_EXPLANATION`, `WRITE_MINE`, `WRITE_COMPANY`, `WRITE_AGAIN`, `WRITING`, `CREDITS`, `EXPLAIN`, `EXPLAIN_AGAIN`, `EXPLAINING`, `MOVED`, `MEASURE`, `KNOWLEDGE`, `LOAD_SCOPES`, `LOAD_CHANGED`, `LOAD_BRIEF`, `LOAD_EXPLANATION`) are all defined in Task 1.
