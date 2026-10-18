# Account page (frontend, delivery 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old tabbed `/accounts/:id` (mock fallback, nav-state dependence, dead controls) with the account's story: the organisation page's design scoped to one account, loaded by the URL id alone, with seven tabs (Story · Details · People · Deals & risks · Files · Custom objects · Canvases).

**Architecture:**
- The organisation page's parts (`src/components/organizations/detail/*`) become usable on either page through one seam: a part is told its page by `customerId` (the organisation page, exactly as today) **or** by `scope: {kind: 'account', id, name}`. A story function takes a bare organisation id (as today) **or** a scope. No organisation call site, behaviour or test changes.
- Every account-scoped thunk (`customersSlice`, `filesSlice`, `callsSlice`) takes an optional organisation: with one it keeps the nested `/customers/<cid>/accounts/<id>/…` route, without one it uses backend #75's flat `/accounts/<id>/…` route. The account page never needs an organisation id.
- The page reads three things by its URL id: its portfolio row (`GET /accounts/portfolio/?ids=<id>&limit=1`: name row, tiles, Details panels, currency, "Part of"), its record (`GET /accounts/<id>/`: owner with function, account pulse, the edit form) and, once Story is open, `GET /accounts/<id>/story/`. Other tabs read when first opened and stay mounted.
- Account-only pieces live in `src/components/accounts/detail/` (header, tiles, account pulse, Details tab, canvases wrapper, hooks). `CustomObjectsTab` and `CanvasListTab` are restyled in place as list items.
- The old page's nav-state plumbing (`accountNavRow`, the Navbar's `ACCOUNTS_DATA` branch) is retired; the account page wears the organisation page's bleed frame and a framed "‹ Accounts" top bar.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, Redux Toolkit, react-router 7, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-29-accounts-redesign-design.md`: §2 (the account page, all but its "Backend" subsection), the "Revisions" note (owner, 2026-09-30), §1's row shape and four panels, the Decisions table, §4 (delivery) and §5 (frontend testing). Delivery 3 (Ask) is out of scope; the rail slot is kept. The backend contract is backend PR #75 (`revenact-backend` branch `feat/account-story`, `docs/API_CONTRACTS.md` → `account_story` and `accounts_portfolio`), which merges and deploys before this frontend.

## Global Constraints

- **The owner's standing rules (spec §0):** "app-ready (phones included), never spreadsheet-like, and no information lost."
- **The page (spec §2):** "`/accounts/:id` is **the account's story**: the organisation page's design, scoped to one account."
- **Frame (§2.1):** "the organisation page's bleed frame (full width, 24px gutter), with the ✦ rail slot for delivery 3."
- **Name row (§2.2):**
  - "An initials avatar, the account name, then "owner · lifecycle · Touched Nd ago", and the signal tag."
  - "**Part of** links beneath. Each opens `/organizations/:id?account=<this>`, with this account's chip chosen. There is one link per linked organisation the viewer may open."
  - "**Edit** and **⋯** on the right. ⋯ holds Add contact, Log a call and New task."
- **Tiles (§2.3):** "**Health:** ring, score, 6-month trend. Tapping it opens the breakdown." · "**ARR.**" · "**Renewal:** the runway." · "**Pulse:** "AI n · CSM n", the dots, "pulses disagree"." · "A tile jumps to its Details panel. On phones the tiles become a snapping strip."
- **Tabs (§2.4 with the Revisions note):** "Story (default) · Details · People · Deals & risks · Files · Custom objects · Canvases. This is a real tablist, with the active tab in the URL (`?tab=`). There are no account chips."
- **Story (§2.5):** "**Needs attention**, shown only when something needs it: renewal overdue, or due within 30 days; open High or Critical tickets (count and oldest age); overdue tasks." · "**Filters:** All · Conversations · Tickets · Tasks & notes · Feedback · Health & usage, plus the Sources picker and search." · "**+ Add:** Log a call, New task, New note, Log survey. These are the existing account create flows." · "**Stream:** grouped by day, newest first. Only records filed on this account appear."
- **Details (§2.6):** "The four panels from §1, with Edit details." · "The CSAT breakdown." · "The account's AI attributes (`AIAttributesPanel` with the account id), as on the organisation page's Details." · ""Knowledge for this account lives on Pizza Hut's page", with a link for each linked organisation."
- **People (§2.7):** "the account's contacts as list items. A name opens `/contacts/:id`, and the list has a summary line and search."
- **Deals & risks (§2.8):** "the Opportunities / Risks switch and its list items, as on the organisation page. Adds go to this account."
- **Files (§2.9):** "Files and Calls sections, as on the organisation page. Uploads and logged calls go to this account."
- **Custom objects (§2.9a):** "the account's custom object records (the existing `CustomObjectsTab`, which already reads by account id), restyled as list items. The tab's count comes from the tab itself."
- **Canvases (§2.9b):** "the account's canvases (the existing `CanvasListTab` data), restyled as list items; New canvas opens `/canvas/create` for this account. Read through `GET /accounts/<id>/canvases/`."
- **Removed (§2.10 and the owner's 2026-09-30 ruling):** Company View, the Organizations tab, the pinned-attributes panel, the Success Plans placeholder and every dead control: the "Enable new 360 UI" toggle, the message / refresh / ⋯ icon buttons that do nothing, the "Integrating Salesforce Data" placeholder and the `ACCOUNTS_DATA` mock fallback.
- **Phones (§2.11):** "the name row, a strip of tiles you swipe, the tabs (scrolling), then full-width content."
- **Knowledge (spec Decisions):** "Company knowledge is per organisation. The account page has no Knowledge tab; Details links to the organisation's".
- **Testing (spec §5, frontend):** "Unit tests for the row, the panels, the Board card and the page parts." · "Integration through the real store and router, with `fetch` stubbed in contract shapes." · "A jsdom end-to-end journey per delivery." · "The house-rules suite over the new files." · "The Organizations pages' existing tests still pass on the kind-agnostic components."
- **Loads by URL alone:** many pages link to `/accounts/<id>` with no navigation state (Copilot `sourceHref`/`CockpitView`, `CustomObjectRecordsPage`, Brain Feature requests / Initiatives / Anomalies, Communications `DetailPane`/`MailDetail`, the organisation page's `AccountsSection`, `ACCOUNT_KIND.href`). The page reads everything from the id; a non-numeric id, or one the viewer cannot open, shows the organisation page's not-found state ("Account not found"). No mock data anywhere.
- **Privacy (twice-filter rule):** never show a count or a name of a record or organisation the viewer cannot open. The API already filters (`customers`/`organisations` list only openable organisations; every list applies its record rule); the UI never reconstructs hidden data (no "+N hidden", no total from another source).
- **House rules** (`.claude/skills/revenact-design/SKILL.md` §1 and §4): tokens only (no hex, rgb or palette colours); monochrome primary (`bg-accent text-on-accent`), rose only on the mark; type sizes 11/13/15/22 px, numbers in DM Mono (`font-mono-brand tabular-nums`); Lucide icons, `aria-hidden` beside text; no card in a card; 44px targets below `sm` (`min-h-11 sm:min-h-9`); designed empty, loading (skeletons) and error states; sentence-case copy; both themes; no motion added; glass only on the Ask rail (none here).
- **Backend contract (backend #75):**
  - `GET/PATCH /accounts/<id>/`: `AccountSerializer` (`customers` lists only openable organisations; `owner` nested with `function`; `account_pulse {value, label, category, breakdown[]}`; PATCH takes `owner_id` + `handover_note`, gated by `may_change_owner`). `404` when the viewer cannot open it, whether or not it exists.
  - `GET /accounts/<id>/story/`: the organisation story's shape and params (`group, source, q, thread, cursor, limit`); `account` is ignored; `attention.questions` and `attention.anomaly` are always `null`; `counts.by_account` is `{all, none: 0, "<id>": n}`.
  - `GET/POST /accounts/<id>/{contacts,opportunities,risks,files,calls,surveys,tasks,notes,canvases}/`: the nested views of the same names, keyed by the account alone.
  - `GET /accounts/portfolio/?ids=<id>&limit=1`: the delivery 1 row (`organisation`, `extra_organisations`, `details.{commercial,voice,profile,history}`, `profile.organisations` = openable organisations, lowest id first) and `currency`.
- Run Vitest as `npx vitest run --maxWorkers=2 <paths>`, one process at a time. No new dependencies.
- Work on `feat/account-page` in `react-ts-app`. Commits are conventional (`feat(accounts): …`, `refactor(organizations): …`, `test(accounts): …`, `docs(accounts): …`) and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Update the product documents in the same PR: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` and `.agents/workflows/repo-architecture.md` (the three product docs this repo keeps; the PRD, TRD and Schema live in the backend). This repo keeps no CHANGELOG.

## Decisions (where the spec is silent)

1. **The header, tiles and Details read the portfolio row**, `GET /accounts/portfolio/?ids=<id>&limit=1`, as the organisation page reads its own row. It already carries every header field and all four panels in the list's shapes (`AccountPanels` renders it unchanged), and the workspace currency. `GET /accounts/<id>/` is read beside it for what the row lacks: the owner's function, `account_pulse` and the edit form's record. **Not found** is "no row for this id" (the portfolio filters by `visible_accounts`), exactly the organisation page's rule. *Reason:* one row, one set of numbers, identical to the list the user came from.
2. **"Part of" links come from the row's `details.profile.organisations`**, not from `GET /accounts/<id>/`'s `customers`. Both lists are the same server-filtered set (openable organisations only, `visible_customers`), but the row's lands with the header, so the name row never re-renders when the record arrives, and it is the same list the Profile panel shows. *Reason:* one source of truth for the name row; no flash.
3. **The Health tile opens the account pulse.** An account has no health rubric (`AccountSerializer` has no `health_breakdown`; `health_score` is a stored field). What an account *does* break down per signal is `account_pulse` (AI pulse, CSM pulse, recent sentiment, last contact, open tickets), which the old page's "Account Pulse" banner showed. The Health tile opens it as "Account pulse", with a line saying accounts have no component rubric. *Reason:* the spec's "opens the breakdown" has no rubric to open, and this keeps the old banner's information (no information lost). **Owner may overrule.**
4. **The CSAT breakdown is computed in the browser** from `GET /accounts/<id>/surveys/` (answered CSAT surveys) with the backend's own bands (`CSAT_BANDS`, `csat_breakdown` in `services/customers/models.py`), shown with the organisation page's `CsatSpread`. `AccountSerializer` has no `csat_breakdown`. The surveys list is already filtered by the account rule, so nothing hidden is counted. *Reason:* the spec asks for it and the API has no account field for it. Follow-up: a server-side `csat_breakdown` on `AccountSerializer`.
5. **Owner handover sits at the top of Details** as the shared `OwnerTile` (plain row): "Assign" / "Hand over" with a handover note, saved through `PATCH /accounts/<id>/ {owner_id, handover_note}`. It is offered when the viewer has `view_all_accounts`, the account is unowned, or they own it (the old page's rule); the backend's `may_change_owner` decides for real. `OwnerTile`'s type sizes and targets are brought to house rules (11/13px, 44px targets); its structure and classes the organisation page's Knowledge tests read are unchanged. *Reason:* the old page's real owner-change feature is carried; Details is where the owner's panel-less facts live.
6. **"Ask Copilot" is removed now**, not kept until delivery 3, as the organisation page removed it in its own delivery 1 before its Ask rail arrived. *Reason:* the ✦ rail replaces it and a second, differently-styled Ask entry would be retired within a week. **Owner may overrule** (keep a quiet "Ask Copilot" link in the name row until delivery 3).
7. **The kind-agnostic seam is a prop union, not a context.** Each part already takes `customerId`; it now takes `customerId` **or** `scope` (`ScopeProps`), and the story functions take a bare organisation id **or** a scope (`StoryTarget`). Organisation call sites and tests pass exactly what they pass today. *Reason:* the type system then proves every part knows its page; a context default would silently fall back to "organisation 0".
8. **Account-scoped API calls take an optional organisation.** With one: the nested route (unchanged). Without: backend #75's flat `/accounts/<id>/…`. The shared list slots key an account-only read as `account:<id>` (`listScope(null, id)`), so an organisation's roll-up or another account's list never shows under this page. *Reason:* the account page must work for an account whose organisations the viewer cannot open.
9. **No account tags on the account page.** Every record there is this account's, so each item's account chip would repeat the page's name. The page provides `ShowAccountTags = false`; the organisation page keeps the default (`true`). *Reason:* noise, not information.
10. **`?tab=` values** are `story` (default, omitted), `details`, `people`, `deals`, `files`, `objects`, `canvases`. The tablist carries no counts (as on the organisation page); Custom objects shows its own count as its summary line ("N records · M objects"), and Canvases as "N canvases". *Reason:* matches the organisation page's tabs; "the tab's count comes from the tab itself".
11. **"Manage surveys" on the account page links to `/surveys`** (unfiltered). The Surveys page filters by organisation only; linking to one organisation would name it even when the account has several. *Reason:* no wrong filter, no extra organisation named.
12. **New canvas opens `/canvas/create?accountId=<id>`**, and `CanvasEditor` accepts an account alone (reads `/accounts/<id>/contacts/`, saves `account_id`). *Reason:* an account without an openable organisation can still get a canvas.
13. **Navigation state is retired.** `ACCOUNT_KIND.linkState` returns `undefined`; `accountNavState.ts` (`accountNavRow`) is deleted; the Navbar's `/accounts/:id` branch (which fell back to `ACCOUNTS_DATA`) becomes the framed "‹ Accounts" breadcrumb, as "‹ Organizations" on an organisation's page. *Reason:* the page no longer reads state, and dead state is a trap.
14. **Edit details reuses `AccountFormModal`.** It PATCHes through the first openable organisation when there is one (as the Accounts list does) and through the flat `/accounts/<id>/` when there is none, fixing the `?? 0` fallback that sent `/customers/0/…`. The page reloads its row and story when the form closes (the form reports edits through `updateAccount`'s reducers only). *Reason:* one edit form everywhere.
15. **The name row's ⋯ opens the same flows at page level:** Add contact (`ContactFormModal` on the account), Log a call and New task (the Story's `AddFlow` sheet). Each refreshes what shows it (People's slot, the Story, the Calls list). *Reason:* spec §2.2; the flows exist.
16. **Not carried, recorded for the owner:** the old feed's account **Headlines** (AI headlines per account). There is no flat `/accounts/<id>/headlines/` route in #75 and the spec's tab list omits them; company knowledge lives on each organisation. The old feed's Slack mock, Sessions and "coming soon" filters are dropped, as on the organisation page. **Owner may want headlines back** (a backend route plus a Details section).
17. **Dead modules are left for a sweep PR.** After this page, `ActivityFeed`, `PinnedAttributes`, `shared/ContactsTab`, `shared/PipelinesTab`, `accountsData.ts`, `accountActivityData.ts` and `mapToAccountRow.ts` have no route using them. Deleting them (and their tests) is a separate, reviewable change. *Reason:* keep this PR to the page.
18. **Skeletons and the tile jump are shared.** The organisation page's `HeaderSkeleton`/`TabSkeleton` move to `detail/Skeletons.tsx` and its jump-to-panel logic to `detail/usePanelJump.ts`; both pages use them. `HeaderTiles` becomes a thin wrapper over a kind-agnostic `DetailTiles`. *Reason:* reuse, don't duplicate; the organisation tests prove the move.
19. **The rail slot stays empty** (`OrganizationsFrame` with no `rail`), as the Accounts list did in delivery 1, until delivery 3.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/accountPaths.ts` (new) | `accountBase(accountId, customerId?)`: nested route with an organisation, flat without |
| `src/lib/listScope.ts` | `listScope(null, id)` = `account:<id>`; `parentScope` accepts a null organisation |
| `src/features/customers/customersSlice.ts` | account thunks take `customerId?: number \| null` (contacts, opportunities, risks, surveys, canvases, tasks, notes, `updateAccount`) |
| `src/features/files/filesSlice.ts`, `src/features/calls/callsSlice.ts` | `FileParent.customerId: number \| null`; flat paths for an account alone |
| `src/components/contacts/ContactFormModal.tsx`, `src/components/pipelines/{Opportunity,Risk}FormModal.tsx`, `src/components/organizations/activity/SurveysTab.tsx` (`LogSurveyForm`), `src/pages/organizations/AccountFormModal.tsx`, `src/pages/canvas/CanvasEditor.tsx` | save on an account alone |
| `src/features/organizations/detailScope.ts` (new) | `DetailScope`, `ScopeProps`, `StoryTarget`, `resolveScope`, `scopeProps`, `scopeSlot`, `storyScope`, `storyPathOf` |
| `src/features/organizations/detailParams.ts` | + `StoryParams`, `parseStoryParams`, `writeStoryParams`, `normaliseStory`; id helpers take any tab key |
| `src/features/organizations/storyApi.ts` | `storyPath`/`fetchStory`/`fetchThread` take a `StoryTarget`; + `fetchStoryAt`, `fetchThreadAt` |
| `src/features/accounts/accountPageParams.ts` (new) | `AccountTab`, `ACCOUNT_TABS`, `AccountPageParams`, parse / write / patch, `parseAccountId` |
| `src/features/accounts/csat.ts` (new) | `csatBreakdown(surveys)`, the backend's CSAT bands |
| `src/features/accounts/testAccountPage.ts` (new, test-only) | fixtures and `stubAccountPage()` in backend #75's shapes |
| `src/components/organizations/detail/useStory.ts`, `EmailThread.tsx` | read by `StoryTarget` |
| `src/components/organizations/detail/accountNames.ts`, `ListParts.tsx`, `StoryItemRow.tsx` | + `ShowAccountTags` context |
| `src/components/organizations/detail/DetailTabs.tsx` | generic tabs and label |
| `src/components/organizations/detail/AttentionBlock.tsx` | `renewalPanel`; `onOpenTab` optional |
| `src/components/organizations/detail/{StoryTab,AddFlow,PeopleTab,DealsTab,FilesSection,CallsSection,FilesCallsTab}.tsx` | take `customerId` or `scope` |
| `src/components/organizations/detail/HeaderTiles.tsx` | + `DetailTiles` (kind-agnostic); `HeaderTiles` wraps it |
| `src/components/organizations/detail/Skeletons.tsx`, `usePanelJump.ts` (new) | moved out of the organisation page |
| `src/components/organizations/detail/CustomerFacts.tsx` | exports `CsatSpread` |
| `src/components/shared/OwnerTile.tsx` | house type sizes and targets |
| `src/components/shared/CustomObjectsTab.tsx`, `CanvasListTab.tsx` | restyled as list items; retry; account-alone New canvas |
| `src/components/accounts/detail/*` (new) | `useAccountPageParams`, `useAccount`, `useAccountCsat`, `AccountHeader`, `AccountTiles`, `AccountPulseBreakdown`, `AccountDetailsTab`, `CanvasesTab`, tests, house rules |
| `src/pages/accounts/Details.tsx` | the account page (rewritten) |
| `src/pages/accounts/testDetail.tsx` (new, test-only) | `renderAccountPage()` |
| `src/pages/organizations/Details.tsx` | uses `Skeletons`, `usePanelJump` |
| `src/layouts/DashboardLayout.tsx`, `src/components/layout/Navbar.tsx` | the account page in the framed shell |
| `src/components/accounts/portfolio/accountKind.ts`, `src/features/accounts/accountNavState.ts` (deleted), `src/pages/accounts/testList.tsx` | nav state retired |
| `src/e2e/accountPage.test.tsx` (new) | the jsdom journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | product docs |

---

### Task 1: Account-only API routes in the thunks and slices

**Files:**
- Create: `src/lib/accountPaths.ts`, `src/lib/accountPaths.test.ts`, `src/features/customers/accountOnlyPaths.test.ts`
- Modify: `src/lib/listScope.ts` (whole file), `src/features/customers/customersSlice.ts` (twelve thunks: `updateAccount`, `createTask`, `createNote`, `fetchContactsForAccount`, `createContactForAccount`, `fetchOpportunitiesForAccount`, `createOpportunityForAccount`, `fetchRisksForAccount`, `createRiskForAccount`, `fetchSurveysForAccount`, `fetchCanvasesForAccount`, `createSurveyForAccount`), `src/features/files/filesSlice.ts` (`FileParent`, `filesPath`, the upload reducer), `src/features/calls/callsSlice.ts` (`callsPath`, the log reducer)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `accountBase(accountId: number, customerId?: number | null): string` → `'/customers/7/accounts/31'` or `'/accounts/12'` (no trailing slash).
  - `listScope(customerId: number | null | undefined, accountId?: number | null): string` → `'organization:7'`, `'account:7:31'`, or `'account:12'` when the organisation is null/undefined.
  - `parentScope(parent: { entityType: 'organization' | 'account'; customerId: number | null; accountId?: number }): string`.
  - `FileParent = { entityType: 'organization' | 'account'; customerId: number | null; accountId?: number }`.
  - The twelve thunks accept `customerId?: number | null` (was `customerId: number`); `updateAccount` accepts `{ customerId?: number | null; id: number } & AccountWritePayload`. With `customerId` given they call exactly the URL they call today.

- [ ] **Step 1: Write the failing tests**

`src/lib/accountPaths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { accountBase } from './accountPaths';
import { listScope, parentScope } from './listScope';

describe('accountBase', () => {
  it('is the nested route through an organisation, and the flat one without', () => {
    expect(accountBase(31, 7)).toBe('/customers/7/accounts/31');
    expect(accountBase(12)).toBe('/accounts/12');
    expect(accountBase(12, null)).toBe('/accounts/12');
  });
});

describe('listScope', () => {
  it('keeps the keys it always had for an organisation and an account read through one', () => {
    expect(listScope(7)).toBe('organization:7');
    expect(listScope(7, null)).toBe('organization:7');
    expect(listScope(7, 31)).toBe('account:7:31');
  });

  it('keys an account read on its own by the account alone', () => {
    expect(listScope(null, 12)).toBe('account:12');
    expect(listScope(undefined, 12)).toBe('account:12');
    expect(parentScope({ entityType: 'account', customerId: null, accountId: 12 })).toBe('account:12');
    expect(parentScope({ entityType: 'account', customerId: 7, accountId: 31 })).toBe('account:7:31');
    expect(parentScope({ entityType: 'organization', customerId: 7 })).toBe('organization:7');
  });
});
```

`src/features/customers/accountOnlyPaths.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import callsReducer, { fetchCalls, logCall } from '../calls/callsSlice';
import filesReducer, { fetchFiles, uploadFile } from '../files/filesSlice';
import customersReducer, {
  createContactForAccount,
  createNote,
  createOpportunityForAccount,
  createRiskForAccount,
  createSurveyForAccount,
  createTask,
  fetchCanvasesForAccount,
  fetchContactsForAccount,
  fetchOpportunitiesForAccount,
  fetchRisksForAccount,
  fetchSurveysForAccount,
  updateAccount,
} from './customersSlice';

// Backend #75 serves an account's tabs at /accounts/<id>/…, keyed by the
// account alone. Without an organisation the thunks use that route; with one
// they keep the nested route every existing caller uses.

function stubFetch() {
  const spy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = method === 'GET' ? [] : { id: 900, name: 'Saved', created_at: '2026-09-30T10:00:00Z' };
    return { ok: true, status: method === 'POST' ? 201 : 200, json: async () => body, blob: async () => new Blob([]) };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type Spy = ReturnType<typeof stubFetch>;
const sent = (spy: Spy) =>
  spy.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${new URL(String(input)).pathname.replace(/^\/api\/v1/, '')}`);
const makeStore = () => configureStore({ reducer: { customers: customersReducer, files: filesReducer, calls: callsReducer } });

describe('account-scoped thunks without an organisation (backend #75)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('read an account alone on the flat routes', async () => {
    const spy = stubFetch();
    const store = makeStore();
    await store.dispatch(fetchContactsForAccount({ accountId: 12 }));
    await store.dispatch(fetchOpportunitiesForAccount({ accountId: 12 }));
    await store.dispatch(fetchRisksForAccount({ accountId: 12 }));
    await store.dispatch(fetchSurveysForAccount({ accountId: 12 }));
    await store.dispatch(fetchCanvasesForAccount({ accountId: 12 }));
    await store.dispatch(fetchFiles({ entityType: 'account', customerId: null, accountId: 12 }));
    await store.dispatch(fetchCalls({ entityType: 'account', customerId: null, accountId: 12 }));
    expect(sent(spy)).toEqual([
      'GET /accounts/12/contacts/',
      'GET /accounts/12/opportunities/',
      'GET /accounts/12/risks/',
      'GET /accounts/12/surveys/',
      'GET /accounts/12/canvases/',
      'GET /accounts/12/files/',
      'GET /accounts/12/calls/',
    ]);
  });

  it('save on an account alone on the flat routes', async () => {
    const spy = stubFetch();
    const store = makeStore();
    await store.dispatch(createContactForAccount({ accountId: 12, name: 'Robin Ops', email: 'robin@pizzahut.example' }));
    await store.dispatch(createOpportunityForAccount({ accountId: 12, title: 'Upsell' }));
    await store.dispatch(createRiskForAccount({ accountId: 12, title: 'Budget freeze' }));
    await store.dispatch(createSurveyForAccount({ accountId: 12, survey_type: 'nps', sent_at: '2026-09-30' }));
    await store.dispatch(createTask({ accountId: 12, title: 'Book the retraining', due_date: '2026-10-01', priority: 'medium' }));
    await store.dispatch(createNote({ accountId: 12, title: 'Kickoff', body: 'Met the new admin.' }));
    await store.dispatch(updateAccount({ id: 12, owner_id: 1, handover_note: 'Covering while Carl is away' }));
    await store.dispatch(uploadFile({ entityType: 'account', customerId: null, accountId: 12, file: new File(['x'], 'Notes.txt') }));
    await store.dispatch(
      logCall({ entityType: 'account', customerId: null, accountId: 12, input: { title: 'Check-in', occurred_at: '2026-09-30T10:00' } }),
    );
    expect(sent(spy)).toEqual([
      'POST /accounts/12/contacts/',
      'POST /accounts/12/opportunities/',
      'POST /accounts/12/risks/',
      'POST /accounts/12/surveys/',
      'POST /accounts/12/tasks/',
      'POST /accounts/12/notes/',
      'PATCH /accounts/12/',
      'POST /accounts/12/files/',
      'POST /accounts/12/calls/',
    ]);
  });

  it('keep the nested routes when an organisation is given', async () => {
    const spy = stubFetch();
    const store = makeStore();
    await store.dispatch(fetchContactsForAccount({ customerId: 7, accountId: 31 }));
    await store.dispatch(createTask({ customerId: 7, accountId: 31, title: 'T', due_date: '2026-10-01', priority: 'medium' }));
    await store.dispatch(createTask({ customerId: 7, title: 'T', due_date: '2026-10-01', priority: 'medium' }));
    await store.dispatch(updateAccount({ customerId: 7, id: 31, name: 'EMEA' }));
    await store.dispatch(fetchFiles({ entityType: 'account', customerId: 7, accountId: 31 }));
    expect(sent(spy)).toEqual([
      'GET /customers/7/accounts/31/contacts/',
      'POST /customers/7/accounts/31/tasks/',
      'POST /customers/7/tasks/',
      'PATCH /customers/7/accounts/31/',
      'GET /customers/7/accounts/31/files/',
    ]);
  });

  it('file an account-alone read under account:<id>, and an upload lands in it', async () => {
    stubFetch();
    const store = makeStore();
    await store.dispatch(fetchContactsForAccount({ accountId: 12 }));
    await store.dispatch(fetchFiles({ entityType: 'account', customerId: null, accountId: 12 }));
    expect(store.getState().customers.contactsFor).toBe('account:12');
    expect(store.getState().files.scope).toBe('account:12');
    await store.dispatch(uploadFile({ entityType: 'account', customerId: null, accountId: 12, file: new File(['x'], 'Notes.txt') }));
    expect(store.getState().files.items.map((file) => file.id)).toEqual([900]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/lib/accountPaths.test.ts src/features/customers/accountOnlyPaths.test.ts`
Expected: FAIL. `accountPaths.test.ts` fails to import `./accountPaths` ("Failed to resolve import"); `accountOnlyPaths.test.ts` reports paths such as `GET /customers/undefined/accounts/12/contacts/`.

- [ ] **Step 3: Implement**

Create `src/lib/accountPaths.ts`:

```ts
/** Where an account's records live. Through the organisation a page came
 *  from, the nested route every existing caller uses; without one, the flat
 *  route the account page uses (backend #75: the same view classes keyed by
 *  the account alone, since a viewer may open an account and none of its
 *  organisations). No trailing slash: callers add `/contacts/` and so on. */
export function accountBase(accountId: number, customerId?: number | null): string {
  return customerId == null ? `/accounts/${accountId}` : `/customers/${customerId}/accounts/${accountId}`;
}
```

Replace `src/lib/listScope.ts` with:

```ts
/** Which organization or account a shared list slot holds, so a read for one
 *  never lands under another: `organization:<customer>`; an account read
 *  through its organisation, `account:<customer>:<account>`; an account read
 *  on its own page (no organisation), `account:<account>`. */
export function listScope(customerId: number | null | undefined, accountId?: number | null): string {
  if (accountId == null) return `organization:${customerId}`;
  return customerId == null ? `account:${accountId}` : `account:${customerId}:${accountId}`;
}

/** The scope of a Files / CallSense parent. */
export function parentScope(parent: { entityType: 'organization' | 'account'; customerId: number | null; accountId?: number }): string {
  return listScope(parent.customerId, parent.entityType === 'account' ? parent.accountId : null);
}
```

In `src/features/customers/customersSlice.ts`, add `import { accountBase } from '../../lib/accountPaths';` beside the `listScope` import, then replace each thunk below (its leading comment stays):

```ts
export const updateAccount = createAsyncThunk<
  Account,
  { customerId?: number | null; id: number } & AccountWritePayload,
  { rejectValue: string }
>('customers/updateAccount', async ({ customerId, id, ...data }, { rejectWithValue }) => {
  try {
    return await apiFetch<Account>(`${accountBase(id, customerId)}/`, {
      method: 'PATCH',
      body: data,
    });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not update account.';
    return rejectWithValue(message);
  }
});
```

```ts
export const createTask = createAsyncThunk<
  Task,
  { customerId?: number | null; accountId?: number; title: string; due_date: string; priority: Task['priority']; assignee_id?: number | null },
  { rejectValue: string }
>('customers/createTask', async ({ customerId, accountId, ...body }, { rejectWithValue }) => {
  const path = accountId ? `${accountBase(accountId, customerId)}/tasks/` : `/customers/${customerId}/tasks/`;
  try {
    return await apiFetch<Task>(path, { method: 'POST', body });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not save the task.';
    return rejectWithValue(message);
  }
});
```

```ts
export const createNote = createAsyncThunk<
  Note,
  { customerId?: number | null; accountId?: number; title: string; body: string },
  { rejectValue: string }
>('customers/createNote', async ({ customerId, accountId, ...body }, { rejectWithValue }) => {
  const path = accountId ? `${accountBase(accountId, customerId)}/notes/` : `/customers/${customerId}/notes/`;
  try {
    return await apiFetch<Note>(path, { method: 'POST', body });
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not save the note.';
    return rejectWithValue(message);
  }
});
```

```ts
export const fetchContactsForAccount = createAsyncThunk<
  Contact[],
  { customerId?: number | null; accountId: number },
  { rejectValue: string }
>(
  'customers/fetchContactsForAccount',
  async ({ customerId, accountId }, { rejectWithValue }) => {
    try {
      return await apiFetch<Contact[]>(`${accountBase(accountId, customerId)}/contacts/`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load contacts.';
      return rejectWithValue(message);
    }
  }
);
```

```ts
export const createContactForAccount = createAsyncThunk<
  Contact,
  { customerId?: number | null; accountId: number } & ContactWritePayload & { name: string; email: string },
  { rejectValue: string }
>(
  'customers/createContactForAccount',
  async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
    try {
      return await apiFetch<Contact>(`${accountBase(accountId, customerId)}/contacts/`, {
        method: 'POST',
        body: data,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add contact.';
      return rejectWithValue(message);
    }
  }
);
```

```ts
export const fetchOpportunitiesForAccount = createAsyncThunk<
  Opportunity[],
  { customerId?: number | null; accountId: number },
  { rejectValue: string }
>(
  'customers/fetchOpportunitiesForAccount',
  async ({ customerId, accountId }, { rejectWithValue }) => {
    try {
      return await apiFetch<Opportunity[]>(`${accountBase(accountId, customerId)}/opportunities/`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load opportunities.';
      return rejectWithValue(message);
    }
  }
);
```

```ts
export const createOpportunityForAccount = createAsyncThunk<
  Opportunity,
  { customerId?: number | null; accountId: number } & OpportunityWritePayload & { title: string },
  { rejectValue: string }
>(
  'customers/createOpportunityForAccount',
  async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
    try {
      return await apiFetch<Opportunity>(`${accountBase(accountId, customerId)}/opportunities/`, { method: 'POST', body: data });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add opportunity.';
      return rejectWithValue(message);
    }
  }
);
```

```ts
export const fetchRisksForAccount = createAsyncThunk<
  Risk[],
  { customerId?: number | null; accountId: number },
  { rejectValue: string }
>('customers/fetchRisksForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Risk[]>(`${accountBase(accountId, customerId)}/risks/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load risks.';
    return rejectWithValue(message);
  }
});
```

```ts
export const createRiskForAccount = createAsyncThunk<
  Risk,
  { customerId?: number | null; accountId: number } & RiskWritePayload & { title: string },
  { rejectValue: string }
>(
  'customers/createRiskForAccount',
  async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
    try {
      return await apiFetch<Risk>(`${accountBase(accountId, customerId)}/risks/`, {
        method: 'POST',
        body: data,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add risk.';
      return rejectWithValue(message);
    }
  }
);
```

```ts
export const fetchSurveysForAccount = createAsyncThunk<
  Survey[],
  { customerId?: number | null; accountId: number },
  { rejectValue: string }
>('customers/fetchSurveysForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Survey[]>(`${accountBase(accountId, customerId)}/surveys/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load surveys.';
    return rejectWithValue(message);
  }
});
```

```ts
export const fetchCanvasesForAccount = createAsyncThunk<
  Canvas[],
  { customerId?: number | null; accountId: number },
  { rejectValue: string }
>('customers/fetchCanvasesForAccount', async ({ customerId, accountId }, { rejectWithValue }) => {
  try {
    return await apiFetch<Canvas[]>(`${accountBase(accountId, customerId)}/canvases/`);
  } catch (err) {
    const message = err instanceof ApiError ? err.message : 'Could not load canvases.';
    return rejectWithValue(message);
  }
});
```

```ts
export const createSurveyForAccount = createAsyncThunk<
  Survey,
  { customerId?: number | null; accountId: number } & SurveyWritePayload & {
      survey_type: Survey['survey_type'];
      sent_at: string;
    },
  { rejectValue: string }
>(
  'customers/createSurveyForAccount',
  async ({ customerId, accountId, ...data }, { rejectWithValue }) => {
    try {
      return await apiFetch<Survey>(`${accountBase(accountId, customerId)}/surveys/`, {
        method: 'POST',
        body: data,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add survey.';
      return rejectWithValue(message);
    }
  }
);
```

The reducers that call `listScope(action.meta.arg.customerId, action.meta.arg.accountId)` need no change: `listScope` now accepts an undefined organisation.

In `src/features/files/filesSlice.ts`, add `import { accountBase } from '../../lib/accountPaths';` and replace `FileParent` and `filesPath`:

```ts
export interface FileParent {
  entityType: 'organization' | 'account';
  /** The organisation; null for an account read on its own page (the flat route). */
  customerId: number | null;
  accountId?: number;
}

export function filesPath({ entityType, customerId, accountId }: FileParent): string {
  return entityType === 'organization'
    ? `/customers/${customerId}/files/`
    : `${accountBase(accountId ?? 0, customerId)}/files/`;
}
```

and in its `uploadFile.fulfilled` case replace the last two lines with:

```ts
        const { customerId } = action.meta.arg;
        const rollUp = customerId !== null && state.scope === listScope(customerId);
        if (state.scope === parentScope(action.meta.arg) || rollUp) state.items.unshift(action.payload);
```

In `src/features/calls/callsSlice.ts`, add `import { accountBase } from '../../lib/accountPaths';`, replace `callsPath`:

```ts
export function callsPath({ entityType, customerId, accountId }: FileParent): string {
  return entityType === 'organization'
    ? `/customers/${customerId}/calls/`
    : `${accountBase(accountId ?? 0, customerId)}/calls/`;
}
```

and in `logCall.fulfilled` replace the guard line with:

```ts
        const { customerId } = action.meta.arg;
        const rollUp = customerId !== null && state.scope === listScope(customerId);
        if (state.scope !== parentScope(action.meta.arg) && !rollUp) return;
```

- [ ] **Step 4: Run the tests to verify they pass, and nothing else moved**

Run: `npx vitest run --maxWorkers=2 src/lib src/features/customers src/features/files src/features/calls src/components/organizations src/components/shared src/pages/organizations`
Expected: PASS, 0 failed. Every organisation test still sees its nested URLs.

Run: `npx tsc -b`
Expected: exit 0 (every existing caller passes a number where `number | null | undefined` is now accepted).

- [ ] **Step 5: Commit**

```bash
git add src/lib/accountPaths.ts src/lib/accountPaths.test.ts src/lib/listScope.ts src/features/customers/customersSlice.ts src/features/customers/accountOnlyPaths.test.ts src/features/files/filesSlice.ts src/features/calls/callsSlice.ts
git commit -m "$(cat <<'EOF'
feat(accounts): account-scoped reads and saves without an organisation

With no organisation the account thunks use backend #75's flat
/accounts/<id>/... routes and file their reads under account:<id>; with
one they keep the nested routes every existing caller uses.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The create and edit forms save on an account alone

**Files:**
- Modify: `src/components/contacts/ContactFormModal.tsx`, `src/components/pipelines/OpportunityFormModal.tsx`, `src/components/pipelines/RiskFormModal.tsx`, `src/components/organizations/activity/SurveysTab.tsx` (`LogSurveyForm`), `src/pages/organizations/AccountFormModal.tsx`, `src/pages/canvas/CanvasEditor.tsx`
- Create: `src/components/accounts/detail/accountForms.test.tsx`
- Modify (add one test): `src/pages/canvas/CanvasEditor.test.tsx`

**Interfaces:**
- Consumes (Task 1): `createContactForAccount`, `createOpportunityForAccount`, `createRiskForAccount`, `createSurveyForAccount`, `updateAccount`, `fetchContactsForAccount` with `customerId` omitted.
- Produces:
  - `ContactFormModal`, `OpportunityFormModal`, `RiskFormModal` given `accountId` and no `customerId`: no Company or Account picker; save on that account through the flat route; call `onSaved`.
  - `LogSurveyFormProps.customerId?: number` (was required); with `accountId` it logs on the account.
  - `AccountFormModal` edit with no `customerId` and no linked organisation PATCHes `/accounts/<id>/`.
  - `CanvasEditor` at `/canvas/create?accountId=<id>` works with no `customerId`.

- [ ] **Step 1: Write the failing tests**

`src/components/accounts/detail/accountForms.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { accountFixture, initechApac, pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountFormModal } from '../../../pages/organizations/AccountFormModal';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { ContactFormModal } from '../../contacts/ContactFormModal';
import { LogSurveyForm } from '../../organizations/activity/SurveysTab';
import { OpportunityFormModal } from '../../pipelines/OpportunityFormModal';
import { RiskFormModal } from '../../pipelines/RiskFormModal';

// The account page has no organisation id to hand these forms (an account
// can be open to a viewer while none of its organisations is): given only
// `accountId`, each saves on that account through backend #75's flat route.

type Sent = { method: string; path: string; body: Record<string, unknown> };

function stubSaves() {
  const sent: Sent[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
      if (method === 'GET') return { ok: true, status: 200, json: async () => [] };
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sent.push({ method, path, body });
      return { ok: true, status: method === 'POST' ? 201 : 200, json: async () => ({ id: 900, ...body }) };
    }),
  );
  return sent;
}

function renderWithStore(ui: ReactNode) {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
}

const submit = (name: string) => userEvent.click(screen.getAllByRole('button', { name }).find((button) => button.closest('form'))!);

describe('the forms on an account alone', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds a person on the account, with no organisation or account to pick', async () => {
    const sent = stubSaves();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithStore(<ContactFormModal accountId={12} onClose={onClose} onSaved={onSaved} />);
    expect(screen.queryByLabelText(/^Company/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Account/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByLabelText(/^Email/), 'robin@pizzahut.example');
    await submit('Add Contact');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(sent).toEqual([
      { method: 'POST', path: '/accounts/12/contacts/', body: expect.objectContaining({ name: 'Robin Ops', email: 'robin@pizzahut.example' }) },
    ]);
  });

  it('adds an opportunity on the account', async () => {
    const sent = stubSaves();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderWithStore(<OpportunityFormModal accountId={12} defaultStage="discovery" onClose={onClose} onSaved={onSaved} />);
    expect(screen.queryByLabelText(/^Company/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Upsell');
    await submit('Add Opportunity');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(sent).toEqual([
      { method: 'POST', path: '/accounts/12/opportunities/', body: expect.objectContaining({ title: 'Upsell', stage: 'discovery' }) },
    ]);
  });

  it('adds a risk on the account', async () => {
    const sent = stubSaves();
    const onClose = vi.fn();
    renderWithStore(<RiskFormModal accountId={12} defaultStage="open" onClose={onClose} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText(/^Company/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Title/), 'Budget freeze');
    await submit('Add Risk');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(sent).toEqual([{ method: 'POST', path: '/accounts/12/risks/', body: expect.objectContaining({ title: 'Budget freeze' }) }]);
  });

  it('logs a survey on the account, with no CES', async () => {
    const sent = stubSaves();
    const onLogged = vi.fn();
    renderWithStore(<LogSurveyForm accountId={12} allowCes={false} onLogged={onLogged} onCancel={vi.fn()} />);
    expect(screen.queryByRole('option', { name: 'CES' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
    expect(sent[0]).toMatchObject({ method: 'POST', path: '/accounts/12/surveys/', body: { survey_type: 'nps' } });
  });

  it('edits an account none of whose organisations the viewer may open on the flat route', async () => {
    const sent = stubSaves();
    const onClose = vi.fn();
    renderWithStore(<AccountFormModal account={accountFixture(initechApac)} onClose={onClose} />);
    await submit('Save changes');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(sent).toEqual([{ method: 'PATCH', path: '/accounts/14/', body: expect.objectContaining({ name: 'Initech APAC' }) }]);
  });

  it('still edits through the first organisation when there is one', async () => {
    const sent = stubSaves();
    const onClose = vi.fn();
    renderWithStore(<AccountFormModal account={accountFixture(pizzaEmea)} onClose={onClose} />);
    await submit('Save changes');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(sent[0]).toMatchObject({ method: 'PATCH', path: '/customers/7/accounts/12/' });
  });
});
```

Add to `src/pages/canvas/CanvasEditor.test.tsx`, inside `describe('CanvasEditor', …)` after the "no company was chosen" test:

```tsx
  it('starts a new canvas on an account alone, reading its people and saving on it', async () => {
    const created = canvasFixture({ id: 11, account_id: 12, account_name: 'Pizza EMEA' });
    const fetchMock = vi.fn((url: string, options?: FetchOptions) => {
      if (url.includes('/accounts/12/contacts/')) return Promise.resolve(jsonResponse(200, [jamesContact]));
      if (options?.method === 'POST') return Promise.resolve(jsonResponse(201, created));
      return Promise.resolve(jsonResponse(200, created));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <Provider store={configureStore({ reducer: { customers: customersReducer, auth: authReducer } })}>
        <MemoryRouter initialEntries={['/canvas/create?accountId=12']}>
          <Routes>
            <Route path="/canvas/create" element={<CanvasEditor />} />
            <Route path="/canvas/:id" element={<CanvasEditor />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByDisplayValue('Untitled Canvas')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/accounts/12/contacts/'))).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const postCall = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(postCall![1]!.body!)).toMatchObject({ account_id: 12 });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/accounts/detail/accountForms.test.tsx src/pages/canvas/CanvasEditor.test.tsx`
Expected: FAIL. The contact test fails on "Pick a company." (no request sent); the opportunity and risk tests find a Company select; the account edit test sees `PATCH /customers/0/accounts/14/`; the canvas test shows "No company was chosen for this canvas — go back and pick one.".

- [ ] **Step 3: Implement**

`src/components/contacts/ContactFormModal.tsx`:
- In `handleSubmit`, replace `if (!isEdit && !selectedCompanyId) {` with `if (!isEdit && accountId === undefined && !selectedCompanyId) {`.
- Replace the `accountId !== undefined` branch's dispatch with:

```ts
        // The account page (no organisation id: the flat route) or the
        // organisation page's chosen account (the nested one) — either
        // way the only account it could be.
        await dispatch(createContactForAccount({ customerId, accountId, ...payload })).unwrap();
```

- In the JSX, replace `) : customerId === undefined ? (` (the Company select) with `) : customerId === undefined && accountId === undefined ? (`.
- Update the `accountId` prop's doc comment to: `Add-only: the account to create the contact on. With a fixed \`customerId\` it saves through the nested route (the organisation page's chosen account); alone it saves through /accounts/<id>/contacts/ (the account page). Either way no Company or Account picker shows.`

`src/components/pipelines/OpportunityFormModal.tsx`:
- Replace `if (!isEdit && customerId === undefined && !selectedCompanyId) {` with `if (!isEdit && customerId === undefined && accountId === undefined && !selectedCompanyId) {`.
- Insert before `} else if (customerId !== undefined) {`:

```ts
      } else if (customerId === undefined && accountId !== undefined) {
        // The account page: no organisation id, the flat account route.
        // Like the scoped branch below, the caller reads its list again.
        await dispatch(createOpportunityForAccount({ accountId, ...data })).unwrap();
        onSaved?.();
```

- Replace `) : customerId === undefined ? (` (the Company select) with `) : customerId === undefined && accountId === undefined ? (`.

`src/components/pipelines/RiskFormModal.tsx`: the same three edits, with `createRiskForAccount`:

```ts
      } else if (customerId === undefined && accountId !== undefined) {
        // The account page: no organisation id, the flat account route.
        await dispatch(createRiskForAccount({ accountId, ...data })).unwrap();
        onSaved?.();
```

`src/components/organizations/activity/SurveysTab.tsx`: in `LogSurveyFormProps`, replace `customerId: number;` with:

```ts
  /** The organization; absent on the account page, where `accountId` is the account itself. */
  customerId?: number;
```

and replace the `try` block's `if … else` in `handleLogSurvey` with:

```ts
      if (accountId !== undefined) {
        await dispatch(createSurveyForAccount({ customerId, accountId, survey_type: newType, sent_at: newSentAt })).unwrap();
      } else if (customerId !== undefined) {
        await dispatch(createSurveyForCustomer({ customerId, survey_type: newType, sent_at: newSentAt })).unwrap();
      } else {
        throw new Error('Nowhere to log this survey.');
      }
```

`src/pages/organizations/AccountFormModal.tsx`: in the edit branch replace `customerId: customerId ?? account.customers[0]?.id ?? 0,` with:

```ts
            // No openable organisation: the flat /accounts/<id>/ (backend #75).
            customerId: customerId ?? account.customers[0]?.id,
```

`src/pages/canvas/CanvasEditor.tsx`: replace the contacts effect and the guard:

```ts
  useEffect(() => {
    // An account alone (the account page's New canvas) reads its people
    // through /accounts/<id>/contacts/; with an organisation, as before.
    if (accountId !== undefined) {
      dispatch(fetchContactsForAccount({ customerId, accountId }));
    } else if (customerId !== undefined) {
      dispatch(fetchContactsForCustomer(customerId));
    }
  }, [dispatch, customerId, accountId]);
```

```tsx
  if (!routeId && customerId === undefined && accountId === undefined) {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/accounts/detail/accountForms.test.tsx src/pages/canvas src/components/contacts src/components/pipelines src/components/organizations src/pages/organizations src/pages/accounts src/pages/contacts`
Expected: PASS, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/ContactFormModal.tsx src/components/pipelines/OpportunityFormModal.tsx src/components/pipelines/RiskFormModal.tsx src/components/organizations/activity/SurveysTab.tsx src/pages/organizations/AccountFormModal.tsx src/pages/canvas/CanvasEditor.tsx src/pages/canvas/CanvasEditor.test.tsx src/components/accounts/detail/accountForms.test.tsx
git commit -m "$(cat <<'EOF'
feat(accounts): the create and edit forms save on an account alone

Given only an account id, the contact, opportunity, risk and survey forms
save through /accounts/<id>/..., the account form edits through
/accounts/<id>/ when no organisation is openable (not /customers/0/), and
a canvas can be started on an account.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The page's scope, URL state, CSAT bands, story reads and test stub

**Files:**
- Create: `src/features/organizations/detailScope.ts`, `src/features/organizations/detailScope.test.ts`, `src/features/accounts/accountPageParams.ts`, `src/features/accounts/accountPageParams.test.ts`, `src/features/accounts/csat.ts`, `src/features/accounts/csat.test.ts`, `src/features/accounts/testAccountPage.ts`, `src/features/accounts/testAccountPage.test.ts`, `src/components/accounts/detail/useAccountPageParams.ts`, `src/components/accounts/detail/story.test.tsx`
- Modify: `src/features/organizations/detailParams.ts` (whole file), `src/features/organizations/storyApi.ts` (whole file), `src/components/organizations/detail/useStory.ts` (whole file)

**Interfaces:**
- Consumes (Task 1): `listScope`.
- Produces:
  - `detailScope.ts`:
    - `type DetailScope = { kind: 'organization'; id: number } | { kind: 'account'; id: number; name: string }`
    - `type ScopeProps = { customerId: number; scope?: undefined } | { scope: DetailScope; customerId?: undefined }`
    - `type StoryTarget = number | DetailScope` (a bare number is an organisation id)
    - `resolveScope(props: { customerId?: number; scope?: DetailScope }): DetailScope`
    - `scopeProps(scope: DetailScope): ScopeProps`
    - `scopeSlot(scope: { kind: DetailScope['kind']; id: number }): string` (`'organization:7'` / `'account:12'`)
    - `storyScope(target: StoryTarget): DetailScope`, `storyPathOf(scope: DetailScope): string`
  - `detailParams.ts`: `interface StoryParams { account: string; group: StoryGroup | ''; sources: StoryKind[]; q: string }`; `DetailParams extends StoryParams { tab: DetailTab }`; `parseStoryParams(search): StoryParams`; `writeStoryParams(out: URLSearchParams, p: StoryParams): void`; `normaliseStory<P extends StoryParams>(p: P): P`; `storyFilters(p: StoryParams)`, `hasStoryFilters(p: StoryParams)`; `detailTabId(base: string, tab: string)`, `detailPanelId(base: string, tab: string)`. Everything the organisation page used keeps its name and output.
  - `storyApi.ts`: `storyPath(target: StoryTarget)`, `fetchStory(target, query, cursor?)`, `fetchThread(target, threadId)`, plus `fetchStoryAt(path, query, cursor?)` and `fetchThreadAt(path, threadId)`.
  - `useStory(target: StoryTarget, query: string, version: number, enabled: boolean): StoryState` (same state shape).
  - `accountPageParams.ts`: `type AccountTab = 'story' | 'details' | 'people' | 'deals' | 'files' | 'objects' | 'canvases'`; `ACCOUNT_TABS: { key: AccountTab; label: string }[]`; `interface AccountPageParams extends StoryParams { tab: AccountTab }`; `parseAccountPageParams(search)`, `toAccountPageSearch(p)`, `withAccountPagePatch(p, patch)`, `parseAccountId(raw: string | undefined): number | null`.
  - `useAccountPageParams(): { params: AccountPageParams; update: (patch: Partial<AccountPageParams>, options?: { replace?: boolean }) => void }`.
  - `csat.ts`: `csatBand(score: number): string`, `csatBreakdown(surveys: Survey[]): CsatBreakdown`.
  - `testAccountPage.ts` (test-only): `PIZZA_EMEA_REF`, `ACCOUNT_STORY_ITEMS`, `ACCOUNT_THREAD`, `ACCOUNT_ATTENTION`, `pizzaEmeaRecord`, `ACCOUNT_SURVEYS`, `ACCOUNT_CANVASES`, `LINE_ITEMS`, `LINE_ITEM_RECORDS`, `ACCOUNT_LISTS`, `interface AccountPageStub`, `stubAccountPage(stub?)`, `accountStoryQueries(spy)`. `postBodies` and `requestPaths` are reused from `features/organizations/testStory`.

- [ ] **Step 1: Write the failing tests**

`src/features/organizations/detailScope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveScope, scopeProps, scopeSlot, storyPathOf, storyScope } from './detailScope';

const EMEA = { kind: 'account' as const, id: 12, name: 'Pizza EMEA' };

describe('a detail part\'s page', () => {
  it('is the organisation named by customerId, or the scope it was given', () => {
    expect(resolveScope({ customerId: 7 })).toEqual({ kind: 'organization', id: 7 });
    expect(resolveScope({ scope: EMEA })).toBe(EMEA);
    expect(scopeProps({ kind: 'organization', id: 7 })).toEqual({ customerId: 7 });
    expect(scopeProps(EMEA)).toEqual({ scope: EMEA });
  });

  it('files its lists where the account thunks file them', () => {
    expect(scopeSlot({ kind: 'organization', id: 7 })).toBe('organization:7');
    expect(scopeSlot(EMEA)).toBe('account:12');
  });

  it('reads its story from the organisation story or the account story', () => {
    expect(storyScope(7)).toEqual({ kind: 'organization', id: 7 });
    expect(storyScope(EMEA)).toBe(EMEA);
    expect(storyPathOf({ kind: 'organization', id: 7 })).toBe('/organizations/7/story/');
    expect(storyPathOf(EMEA)).toBe('/accounts/12/story/');
  });
});
```

`src/features/accounts/accountPageParams.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ACCOUNT_TABS, parseAccountId, parseAccountPageParams, toAccountPageSearch, withAccountPagePatch } from './accountPageParams';

const parse = (search: string) => parseAccountPageParams(new URLSearchParams(search));

describe('the account page\'s URL state', () => {
  it('has the seven tabs in the spec\'s order', () => {
    expect(ACCOUNT_TABS.map((tab) => tab.label)).toEqual([
      'Story',
      'Details',
      'People',
      'Deals & risks',
      'Files',
      'Custom objects',
      'Canvases',
    ]);
  });

  it('opens on Story, reads a known tab and ignores an unknown one', () => {
    expect(parse('').tab).toBe('story');
    expect(parse('tab=objects').tab).toBe('objects');
    expect(parse('tab=canvases').tab).toBe('canvases');
    expect(parse('tab=knowledge').tab).toBe('story');
  });

  it('reads the story filters and never an account chip', () => {
    expect(parse('group=conversations&source=email,call&q=quote&account=31')).toEqual({
      tab: 'story',
      account: '',
      group: 'conversations',
      sources: ['email', 'call'],
      q: 'quote',
    });
    expect(parse('group=tickets&source=email').sources).toEqual([]);
  });

  it('writes a canonical URL, the default tab left out', () => {
    expect(toAccountPageSearch(parse('account=31')).toString()).toBe('');
    expect(toAccountPageSearch(parse('tab=files&source=call,email&group=conversations')).toString()).toBe(
      'tab=files&group=conversations&source=call%2Cemail',
    );
  });

  it('patches without letting an account chip in', () => {
    const next = withAccountPagePatch(parse('tab=people'), { tab: 'story', account: '31', group: 'tasks' });
    expect(next).toEqual({ tab: 'story', account: '', group: 'tasks', sources: [], q: '' });
  });

  it('reads an id as a positive whole number only', () => {
    expect(parseAccountId('12')).toBe(12);
    for (const bad of [undefined, '', '0', '-3', '12a', '1.5', 'abc']) expect(parseAccountId(bad)).toBeNull();
  });
});
```

`src/features/accounts/csat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Survey } from '../customers/customersSlice';
import { csatBand, csatBreakdown } from './csat';

function survey(score: number | null, extra: Partial<Survey> = {}): Survey {
  return {
    id: 1,
    survey_type: 'csat',
    survey_type_display: 'CSAT',
    status: 'responded',
    status_display: 'Responded',
    score,
    sent_at: '2026-09-01',
    responded_at: '2026-09-03',
    companies: [],
    account_id: 12,
    account_name: 'Pizza EMEA',
    created_at: '2026-09-01T10:00:00Z',
    ...extra,
  };
}

describe('csatBand (the backend\'s CSAT_BANDS)', () => {
  it('puts a score in the first band whose upper bound it reaches', () => {
    expect(csatBand(0)).toBe('very_dissatisfied');
    expect(csatBand(20)).toBe('very_dissatisfied');
    expect(csatBand(21)).toBe('dissatisfied');
    expect(csatBand(60)).toBe('neutral');
    expect(csatBand(80)).toBe('satisfied');
    expect(csatBand(100)).toBe('very_satisfied');
    expect(csatBand(120)).toBe('very_satisfied');
  });
});

describe('csatBreakdown (the backend\'s csat_breakdown)', () => {
  it('counts answered CSAT surveys only, every band listed best first', () => {
    const out = csatBreakdown([
      survey(90),
      survey(75),
      survey(75),
      survey(50),
      survey(10),
      survey(40, { survey_type: 'nps' }),
      survey(null, { status: 'sent' }),
      survey(null),
    ]);
    expect(out.responses).toBe(5);
    expect(out.bands).toEqual([
      { key: 'very_satisfied', label: 'Very Satisfied', count: 1, share: 20 },
      { key: 'satisfied', label: 'Satisfied', count: 2, share: 40 },
      { key: 'neutral', label: 'Neutral', count: 1, share: 20 },
      { key: 'dissatisfied', label: 'Dissatisfied', count: 0, share: 0 },
      { key: 'very_dissatisfied', label: 'Very Dissatisfied', count: 1, share: 20 },
    ]);
  });

  it('rounds shares to two places and is all zeros with no answers', () => {
    expect(csatBreakdown([survey(90), survey(90), survey(10)]).bands[0].share).toBe(66.67);
    expect(csatBreakdown([]).bands.every((band) => band.count === 0 && band.share === 0)).toBe(true);
  });
});
```

`src/features/accounts/testAccountPage.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initechApac } from './testPortfolio';
import { ACCOUNT_LISTS, stubAccountPage } from './testAccountPage';

// The stub answers the account page as backend #75 does.
async function read(path: string, init?: RequestInit) {
  const response = (await fetch(`http://api.test/api/v1${path}`, init)) as unknown as { status: number; json: () => Promise<unknown> };
  return { status: response.status, body: await response.json() };
}

describe('stubAccountPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers the row by ids, the record and the story, ignoring an account chip', async () => {
    stubAccountPage();
    const portfolio = (await read('/accounts/portfolio/?ids=12&limit=1')).body as { results: { id: number }[]; currency: string };
    expect(portfolio.results.map((row) => row.id)).toEqual([12]);
    expect(portfolio.currency).toBe('USD');
    expect(((await read('/accounts/12/')).body as { name: string }).name).toBe('Pizza EMEA');
    const story = (await read('/accounts/12/story/?account=31&limit=30')).body as { items: unknown[]; counts: { by_account: object } };
    expect(story.items).toHaveLength(5);
    expect(story.counts.by_account).toEqual({ all: 5, none: 0, '12': 5 });
  });

  it('reads 404 for an account the viewer cannot open, and no row', async () => {
    stubAccountPage({ row: null });
    expect((await read('/accounts/12/')).status).toBe(404);
    expect((await read('/accounts/12/story/?limit=30')).status).toBe(404);
    expect(((await read('/accounts/portfolio/?ids=12&limit=1')).body as { results: unknown[] }).results).toEqual([]);
  });

  it('tags a saved record with the account and answers its lists', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    const saved = await read('/accounts/12/contacts/', { method: 'POST', body: JSON.stringify({ name: 'Robin Ops', email: 'r@x.example' }) });
    expect(saved.body).toMatchObject({ name: 'Robin Ops', account_id: 12, account_name: 'Pizza EMEA' });
    expect(((await read('/accounts/12/contacts/')).body as unknown[]).length).toBe(ACCOUNT_LISTS.contacts.length + 1);
  });

  it('hands an owner change to the next row read', async () => {
    stubAccountPage();
    await read('/accounts/12/', { method: 'PATCH', body: JSON.stringify({ owner_id: 1, handover_note: 'Cover' }) });
    const portfolio = (await read('/accounts/portfolio/?ids=12&limit=1')).body as { results: { owner: { name: string } }[] };
    expect(portfolio.results[0].owner.name).toBe('Alice');
    expect(((await read('/accounts/12/')).body as { owner: { name: string } }).owner.name).toBe('Alice');
  });

  it('serves an account with no openable organisation on its own id', async () => {
    stubAccountPage({ row: initechApac });
    expect(((await read('/accounts/14/')).body as { customers: unknown[] }).customers).toEqual([]);
    expect((await read('/accounts/12/')).status).toBe(404);
  });
});
```

`src/components/accounts/detail/story.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { accountStoryQueries, stubAccountPage } from '../../../features/accounts/testAccountPage';
import { useStory } from '../../organizations/detail/useStory';

const EMEA = { kind: 'account' as const, id: 12, name: 'Pizza EMEA' };

describe('useStory on one account', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the account story and pages it', async () => {
    const spy = stubAccountPage();
    const { result } = renderHook(() => useStory(EMEA, 'limit=2', 0, true));
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([141, 112]));
    expect(result.current.next).toBe('2');
    await act(() => result.current.loadMore());
    expect(result.current.items.map((item) => item.id)).toEqual([141, 112, 188, 105]);
    expect(accountStoryQueries(spy).map((query) => query.toString())).toEqual(['limit=2', 'limit=2&cursor=2']);
  });

  it('does not read again when the same account arrives as a new object', async () => {
    const spy = stubAccountPage();
    const { rerender, result } = renderHook(({ name }) => useStory({ kind: 'account', id: 12, name }, 'limit=30', 0, true), {
      initialProps: { name: '' },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(5));
    rerender({ name: 'Pizza EMEA' });
    expect(accountStoryQueries(spy)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/organizations/detailScope.test.ts src/features/accounts/accountPageParams.test.ts src/features/accounts/csat.test.ts src/features/accounts/testAccountPage.test.ts src/components/accounts/detail/story.test.tsx`
Expected: FAIL, each on "Failed to resolve import" (`./detailScope`, `./accountPageParams`, `./csat`, `./testAccountPage`).

- [ ] **Step 3: Implement**

Create `src/features/organizations/detailScope.ts`:

```ts
import { listScope } from '../../lib/listScope';

// Which page a detail part is on (spec 2026-09-29 §2): an organisation's
// (its roll-up, with account chips) or one account's (every record filed on
// it, no chips). The organisation page names its page with `customerId`, as
// it always has; the account page passes a scope.

export type DetailScope = { kind: 'organization'; id: number } | { kind: 'account'; id: number; name: string };

/** A part is told its page one of two ways, never both. */
export type ScopeProps = { customerId: number; scope?: undefined } | { scope: DetailScope; customerId?: undefined };

/** What a story read takes: a bare organisation id (its original argument) or a scope. */
export type StoryTarget = number | DetailScope;

export function resolveScope(props: { customerId?: number; scope?: DetailScope }): DetailScope {
  return props.scope ?? { kind: 'organization', id: props.customerId ?? 0 };
}

/** The props that name `scope` to a child part. */
export function scopeProps(scope: DetailScope): ScopeProps {
  return scope.kind === 'organization' ? { customerId: scope.id } : { scope };
}

/** The shared list slot a page's reads land under (the thunks' listScope). */
export function scopeSlot(scope: { kind: DetailScope['kind']; id: number }): string {
  return scope.kind === 'organization' ? listScope(scope.id) : listScope(null, scope.id);
}

export function storyScope(target: StoryTarget): DetailScope {
  return typeof target === 'number' ? { kind: 'organization', id: target } : target;
}

/** The story endpoint: the organisation's roll-up, or one account's (backend #75). */
export function storyPathOf(scope: DetailScope): string {
  return scope.kind === 'organization' ? `/organizations/${scope.id}/story/` : `/accounts/${scope.id}/story/`;
}
```

Replace `src/features/organizations/detailParams.ts` with:

```ts
import type { StoryFilters } from './storyApi';
import { isStoryGroup, isStoryKind, kindsIn } from './storyKinds';
import type { StoryGroup, StoryKind } from './storyTypes';

// The organization page's URL state (spec §1.4 and §1.5): the tab, the
// account chip and the story's filters. Unknown values read as the default.
// The story's part is shared with the account page (accountPageParams.ts).

export type DetailTab = 'story' | 'details' | 'people' | 'deals' | 'knowledge' | 'files';

export const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'details', label: 'Details' },
  { key: 'people', label: 'People' },
  { key: 'deals', label: 'Deals & risks' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'files', label: 'Files' },
];

/** The story's filters in the URL, on either page. */
export interface StoryParams {
  /** An account id, 'none' (records on the organization itself), or '' for
   *  all. Always '' on the account page, which has no chips. */
  account: string;
  group: StoryGroup | '';
  sources: StoryKind[];
  q: string;
}

export interface DetailParams extends StoryParams {
  tab: DetailTab;
}

const TAB_KEYS: string[] = DETAIL_TABS.map((tab) => tab.key);

const accountValue = (raw: string | null) => (raw && (/^[1-9]\d*$/.test(raw) || raw === 'none') ? raw : '');

/** Sources are unique and inside the chosen group. */
export function normaliseStory<P extends StoryParams>(p: P): P {
  const allowed = kindsIn(p.group);
  return { ...p, sources: [...new Set(p.sources)].filter((kind) => allowed.includes(kind)) };
}

export function parseStoryParams(search: URLSearchParams): StoryParams {
  const group = search.get('group') ?? '';
  return normaliseStory({
    account: accountValue(search.get('account')),
    group: isStoryGroup(group) ? group : '',
    sources: (search.get('source') ?? '').split(',').filter(isStoryKind),
    q: search.get('q') ?? '',
  });
}

export function parseDetailParams(search: URLSearchParams): DetailParams {
  const tab = search.get('tab') ?? '';
  return { tab: TAB_KEYS.includes(tab) ? (tab as DetailTab) : 'story', ...parseStoryParams(search) };
}

/** Sources are written sorted, so equal filters make the same URL. */
export function writeStoryParams(out: URLSearchParams, p: StoryParams): void {
  if (p.account) out.set('account', p.account);
  if (p.group) out.set('group', p.group);
  if (p.sources.length) out.set('source', [...p.sources].sort().join(','));
  if (p.q) out.set('q', p.q);
}

export function toDetailSearch(p: DetailParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.tab !== 'story') out.set('tab', p.tab);
  writeStoryParams(out, p);
  return out;
}

export function withPatch(p: DetailParams, patch: Partial<DetailParams>): DetailParams {
  return normaliseStory({ ...p, ...patch });
}

export function storyFilters(p: StoryParams): StoryFilters {
  return { group: p.group, sources: p.sources, account: p.account, q: p.q };
}

export function hasStoryFilters(p: StoryParams): boolean {
  return Boolean(p.account || p.group || p.sources.length || p.q.trim());
}

/** The tabs the account chips filter (spec 2026-09-27 §1). Details and
 *  Knowledge are the whole organization's: the chips show there dimmed and
 *  filter nothing, while `?account=` is kept for the other tabs (owner,
 *  2026-09-28). */
export const ACCOUNT_TABS: ReadonlySet<DetailTab> = new Set<DetailTab>(['story', 'people', 'deals', 'files']);

/** Any page's tab keys: the organization page's and the account page's. */
export const detailTabId = (base: string, tab: string) => `${base}-tab-${tab}`;
/** One panel per tab: a visited tab stays mounted, hidden, while another shows. */
export const detailPanelId = (base: string, tab: string) => `${base}-panel-${tab}`;
```

Create `src/features/accounts/accountPageParams.ts`:

```ts
import { normaliseStory, parseStoryParams, writeStoryParams, type StoryParams } from '../organizations/detailParams';

// The account page's URL state (spec 2026-09-29 §2.4): the tab and the
// story's filters. One account has no account chips, so `?account=` is never
// read or written. Unknown values read as the default.

export type AccountTab = 'story' | 'details' | 'people' | 'deals' | 'files' | 'objects' | 'canvases';

export const ACCOUNT_TABS: { key: AccountTab; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'details', label: 'Details' },
  { key: 'people', label: 'People' },
  { key: 'deals', label: 'Deals & risks' },
  { key: 'files', label: 'Files' },
  { key: 'objects', label: 'Custom objects' },
  { key: 'canvases', label: 'Canvases' },
];

export interface AccountPageParams extends StoryParams {
  tab: AccountTab;
}

const TAB_KEYS: string[] = ACCOUNT_TABS.map((tab) => tab.key);

export function parseAccountPageParams(search: URLSearchParams): AccountPageParams {
  const tab = search.get('tab') ?? '';
  return { ...parseStoryParams(search), account: '', tab: TAB_KEYS.includes(tab) ? (tab as AccountTab) : 'story' };
}

export function toAccountPageSearch(p: AccountPageParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.tab !== 'story') out.set('tab', p.tab);
  writeStoryParams(out, { ...p, account: '' });
  return out;
}

export function withAccountPagePatch(p: AccountPageParams, patch: Partial<AccountPageParams>): AccountPageParams {
  return normaliseStory({ ...p, ...patch, account: '' });
}

/** `/accounts/12` gives 12; anything but a positive whole number is no account. */
export function parseAccountId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}
```

Create `src/components/accounts/detail/useAccountPageParams.ts`:

```ts
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  parseAccountPageParams,
  toAccountPageSearch,
  withAccountPagePatch,
  type AccountPageParams,
} from '../../../features/accounts/accountPageParams';

/** The account page's URL state, as useDetailParams is the organization
 *  page's: `update` merges a patch into what the URL holds now and pushes a
 *  history entry unless `replace`. */
export function useAccountPageParams() {
  const [search, setSearch] = useSearchParams();
  const key = search.toString();
  const params = useMemo(() => parseAccountPageParams(new URLSearchParams(key)), [key]);
  const update = useCallback(
    (patch: Partial<AccountPageParams>, options: { replace?: boolean } = {}) => {
      setSearch((prev) => toAccountPageSearch(withAccountPagePatch(parseAccountPageParams(prev), patch)), {
        replace: options.replace ?? false,
      });
    },
    [setSearch],
  );
  return { params, update };
}
```

Create `src/features/accounts/csat.ts`:

```ts
import type { CsatBreakdown, Survey } from '../customers/customersSlice';

// How an account's answered CSAT surveys spread over the five bands. The
// backend computes this for an organisation (`Customer.csat_breakdown`) but
// AccountSerializer has none, so the account page computes it from
// GET /accounts/<id>/surveys/ with the backend's own rule
// (services/customers/models.py: CSAT_BANDS, csat_band, csat_breakdown).

const BANDS: { upper: number; key: string; label: string }[] = [
  { upper: 20, key: 'very_dissatisfied', label: 'Very Dissatisfied' },
  { upper: 40, key: 'dissatisfied', label: 'Dissatisfied' },
  { upper: 60, key: 'neutral', label: 'Neutral' },
  { upper: 80, key: 'satisfied', label: 'Satisfied' },
  { upper: 100, key: 'very_satisfied', label: 'Very Satisfied' },
];

/** The first band whose upper bound the score reaches; above 100 is Very Satisfied. */
export function csatBand(score: number): string {
  return (BANDS.find((band) => score <= band.upper) ?? BANDS[BANDS.length - 1]).key;
}

/** Answered CSAT surveys only; every band listed, best first, shares to two places. */
export function csatBreakdown(surveys: Survey[]): CsatBreakdown {
  const counts: Record<string, number> = Object.fromEntries(BANDS.map((band) => [band.key, 0]));
  let responses = 0;
  for (const survey of surveys) {
    if (survey.survey_type !== 'csat' || survey.status !== 'responded' || survey.score == null) continue;
    counts[csatBand(survey.score)] += 1;
    responses += 1;
  }
  return {
    responses,
    bands: [...BANDS].reverse().map((band) => ({
      key: band.key,
      label: band.label,
      count: counts[band.key],
      share: responses ? Math.round((counts[band.key] / responses) * 10000) / 100 : 0,
    })),
  };
}
```

Replace `src/features/organizations/storyApi.ts` with:

```ts
// The story endpoints (organisation spec §2; account spec 2026-09-29 §2),
// through apiFetch (/api/v1 prefix). A bare number is an organisation id,
// as every caller passed before the account page.
import { apiFetch } from '../../lib/apiClient';
import { storyPathOf, storyScope, type StoryTarget } from './detailScope';
import type { StoryGroup, StoryKind, StoryItem, StoryResponse } from './storyTypes';

export const STORY_PAGE_SIZE = 30;

export const storyPath = (target: StoryTarget) => storyPathOf(storyScope(target));

export interface StoryFilters {
  group: StoryGroup | '';
  sources: StoryKind[];
  /** An account id, 'none' for the organization itself, or '' for all. */
  account: string;
  q: string;
}

/** The query for these filters in one fixed order, sources sorted, so equal
 *  filters make an equal string (the paging key). The backend binds its cursor to the same
 *  filters, so a changed filter always starts from page one. */
export function storyQuery(f: StoryFilters, limit = STORY_PAGE_SIZE): string {
  const query = new URLSearchParams();
  if (f.group) query.set('group', f.group);
  if (f.sources.length) query.set('source', [...f.sources].sort().join(','));
  if (f.account) query.set('account', f.account);
  if (f.q.trim()) query.set('q', f.q.trim());
  query.set('limit', String(limit));
  return query.toString();
}

/** One page of the story at `path`. The cursor is opaque and passed back exactly as it came. */
export function fetchStoryAt(path: string, query: string, cursor?: string | null): Promise<StoryResponse> {
  const full = cursor ? `${query}&cursor=${encodeURIComponent(cursor)}` : query;
  return apiFetch<StoryResponse>(`${path}?${full}`);
}

export function fetchStory(target: StoryTarget, query: string, cursor?: string | null): Promise<StoryResponse> {
  return fetchStoryAt(storyPath(target), query, cursor);
}

export const THREAD_PAGE_SIZE = 100;

/** One email thread, oldest first: the story read with `thread` (the backend
 *  has no thread endpoint). It returns that thread's emails only, across the
 *  page's scope, under the same rules; no other filter is sent, so the whole
 *  thread shows whatever chip is on. Its counts and attention are not
 *  narrowed and are not used here. */
export async function fetchThreadAt(path: string, threadId: string): Promise<StoryItem[]> {
  const query = new URLSearchParams({ thread: threadId, limit: String(THREAD_PAGE_SIZE) }).toString();
  const items: StoryItem[] = [];
  let cursor: string | null = null;
  do {
    const page: StoryResponse = await fetchStoryAt(path, query, cursor);
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return items.reverse();
}

export function fetchThread(target: StoryTarget, threadId: string): Promise<StoryItem[]> {
  return fetchThreadAt(storyPath(target), threadId);
}
```

Replace `src/components/organizations/detail/useStory.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryTarget } from '../../../features/organizations/detailScope';
import { fetchStoryAt, storyPath } from '../../../features/organizations/storyApi';
import type { StoryItem, StoryResponse } from '../../../features/organizations/storyTypes';
import { errorMessage } from '../portfolio/usePortfolio';

type Loaded = { key: string; data: StoryResponse; items: StoryItem[]; next: string | null } | { key: string; error: string };
type More = { key: string; loading: boolean; error: string | null };

export interface StoryState {
  /** Page one of the latest answer (its counts and attention). While a new
   *  query loads the previous answer stays, so the page does not flash empty. */
  data: StoryResponse | null;
  items: StoryItem[];
  /** The next page's cursor, for the current query only. */
  next: string | null;
  /** Page one of the current query has not landed yet. */
  loading: boolean;
  error: string | null;
  loadingMore: boolean;
  moreError: string | null;
  loadMore: () => Promise<void>;
  retry: () => void;
}

/** The story, cursor-paged (spec §2 "Paging"): an organisation's (a bare id)
 *  or one account's (a scope). Keyed by its endpoint, so a scope object made
 *  afresh each render never reads again. `version` reloads it (after
 *  "+ Add"); `enabled` is off while another tab is open. */
export function useStory(target: StoryTarget, query: string, version: number, enabled: boolean): StoryState {
  const path = storyPath(target);
  const [attempt, setAttempt] = useState(0);
  const key = `${path}?${query}#${version}#${attempt}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [more, setMore] = useState<More | null>(null);
  // Bumped whenever the read changes or unmounts, so a page two that lands
  // for an older read is dropped rather than appended to a newer one.
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchStoryAt(path, query).then(
      (data) => {
        if (!cancelled) setLoaded({ key, data, items: data.items, next: data.next_cursor });
      },
      (err: unknown) => {
        if (!cancelled) setLoaded({ key, error: errorMessage(err, 'Could not load the story.') });
      },
    );
    return () => {
      cancelled = true;
      generation.current += 1;
      inFlight.current = false;
    };
  }, [enabled, key, path, query]);

  const current = loaded && 'data' in loaded ? loaded : null;
  // The latest `current`, read through a ref so `loadMore` keeps one
  // identity while pages land (see the organisation page's history).
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  });

  const loadMore = useCallback(async () => {
    const latest = currentRef.current;
    if (!latest || latest.key !== key || !latest.next || inFlight.current) return;
    const token = generation.current;
    inFlight.current = true;
    setMore({ key, loading: true, error: null });
    try {
      const page = await fetchStoryAt(path, query, latest.next);
      if (generation.current !== token) return;
      setLoaded((prev) =>
        prev && 'data' in prev && prev.key === key
          ? { ...prev, items: [...prev.items, ...page.items], next: page.next_cursor }
          : prev,
      );
      setMore({ key, loading: false, error: null });
    } catch (err) {
      if (generation.current !== token) return;
      setMore({ key, loading: false, error: errorMessage(err, 'Could not load more of the story.') });
    } finally {
      if (generation.current === token) inFlight.current = false;
    }
  }, [key, path, query]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    data: current?.data ?? null,
    items: current?.items ?? [],
    next: current && current.key === key ? current.next : null,
    loading: enabled && loaded?.key !== key,
    error: loaded && 'error' in loaded && loaded.key === key ? loaded.error : null,
    loadingMore: more?.key === key ? more.loading : false,
    moreError: more?.key === key ? more.error : null,
    loadMore,
    retry,
  };
}
```

Create `src/features/accounts/testAccountPage.ts`:

```ts
import { vi } from 'vitest';
import type { Call } from '../calls/callsSlice';
import type { Account, Canvas, Contact, Opportunity, Risk, Survey } from '../customers/customersSlice';
import { LIFECYCLE_LABELS } from '../customers/formatters';
import type { CustomObjectDefinition, CustomObjectRecord } from '../customObjects/types';
import type { Attachment } from '../files/filesSlice';
import type { LifecycleValue } from '../organizations/portfolioTypes';
import type { StoryAttention, StoryItem } from '../organizations/storyTypes';
import { CALLS, CONTACTS, FILES, MEMBERS, OPPORTUNITIES, RISKS, buildStory } from '../organizations/testStory';
import type { AccountPortfolioRow } from './portfolioTypes';
import { accountFixture, buildAccountPortfolio, pizzaEmea } from './testPortfolio';

// Test-only: the account page (/accounts/:id) in backend #75's shapes, and a
// fetch stub that answers it. It serves the portfolio row by `ids`, the
// record (GET/PATCH /accounts/<id>/ and the nested PATCH the edit form may
// use), the story (the organisation story's rules, `account` ignored), the
// tab lists and their creates on /accounts/<id>/…, record edits and deletes,
// members, AI attributes and custom objects. Anything else goes to
// `fallback` (the Accounts list's stub in the e2e journey) or reads 404.

export const PIZZA_EMEA_REF = { id: 12, name: 'Pizza EMEA' };
const NO_LINK = { thread_id: null, url: null };

/** Pizza EMEA's story, newest first; noon UTC keeps each item on its day everywhere. */
export const ACCOUNT_STORY_ITEMS: StoryItem[] = [
  {
    id: 141,
    kind: 'email',
    source: 'google',
    occurred_at: '2026-09-25T12:00:00+00:00',
    all_day: false,
    account: PIZZA_EMEA_REF,
    title: 'Re: EMEA renewal',
    summary: 'Can we see the quote before Friday?',
    actor: { id: null, name: 'Dana Buyer' },
    link: { thread_id: 't-9', url: null },
  },
  {
    id: 112,
    kind: 'call',
    source: 'revenact',
    occurred_at: '2026-09-25T11:00:00+00:00',
    all_day: false,
    account: PIZZA_EMEA_REF,
    title: 'EMEA check-in',
    summary: 'Usage fell after the admin left.',
    actor: { id: null, name: 'Carl CSM' },
    link: NO_LINK,
  },
  {
    id: 188,
    kind: 'ticket',
    source: 'zendesk',
    occurred_at: '2026-09-24T00:00:00+00:00',
    all_day: true,
    account: PIZZA_EMEA_REF,
    title: 'SSO login fails',
    summary: 'ZD-188 · High · Open',
    actor: { id: null, name: 'Sam Admin' },
    link: { thread_id: null, url: 'https://acme.zendesk.example/tickets/188' },
  },
  {
    id: 105,
    kind: 'task',
    source: 'revenact',
    occurred_at: '2026-09-20T12:00:00+00:00',
    all_day: false,
    account: PIZZA_EMEA_REF,
    title: 'Send the EMEA quote',
    summary: 'Due 2026-09-22 · High · Pending',
    actor: { id: 2, name: 'Carl CSM' },
    link: NO_LINK,
  },
  {
    id: 103,
    kind: 'health',
    source: 'revenact',
    occurred_at: '2026-08-31T00:00:00+00:00',
    all_day: true,
    account: PIZZA_EMEA_REF,
    title: 'Health fell to Average',
    summary: 'Health 5.0 → 4.9',
    actor: null,
    link: NO_LINK,
  },
];

/** Thread t-9 as `?thread=t-9` returns it, newest first. */
export const ACCOUNT_THREAD: StoryItem[] = [
  ACCOUNT_STORY_ITEMS[0],
  {
    id: 140,
    kind: 'email',
    source: 'google',
    occurred_at: '2026-09-24T10:00:00+00:00',
    all_day: false,
    account: PIZZA_EMEA_REF,
    title: 'EMEA renewal',
    summary: 'Sharing the quote ahead of your board meeting.',
    actor: { id: 2, name: 'Carl CSM' },
    link: { thread_id: 't-9', url: null },
  },
];

/** Accounts have no Knowledge questions and no anomaly (backend #75). */
export const ACCOUNT_ATTENTION: StoryAttention = {
  renewal: { date: '2026-08-09', days: -47, overdue: true },
  tickets: { count: 1, oldest_days: 6 },
  overdue_tasks: { count: 1, oldest_days: 8 },
  questions: null,
  anomaly: null,
};

/** GET /accounts/12/: the edit form's record, the owner with their function, the account pulse. */
export const pizzaEmeaRecord: Account = {
  ...accountFixture(pizzaEmea),
  owner: { id: 2, name: 'Carl CSM', function: 'cs' } as Account['owner'],
  ai_pulse_value: 1,
  csm_pulse_score: 3,
  account_pulse: {
    value: '2.4',
    label: 'At risk',
    category: 2,
    breakdown: [
      { key: 'ai_pulse', label: 'AI pulse', weight: '3.0', reading: '1.0', note: 'High Risk' },
      { key: 'csm_pulse', label: 'CSM pulse', weight: '2.5', reading: '3.0', note: 'Set 12 days ago' },
      { key: 'sentiment', label: 'Recent sentiment', weight: '2.0', reading: '2.2', note: '3 of 10 classified negative' },
      { key: 'touch', label: 'Last contact', weight: '1.5', reading: '3.6', note: '33 days ago' },
      { key: 'support', label: 'Open tickets', weight: '1.0', reading: null, note: 'No tickets' },
    ],
  },
};

function surveyFixture(id: number, extra: Partial<Survey>): Survey {
  return {
    id,
    survey_type: 'csat',
    survey_type_display: 'CSAT',
    status: 'responded',
    status_display: 'Responded',
    score: null,
    sent_at: '2026-09-01',
    responded_at: '2026-09-03',
    companies: [{ id: 7, name: 'Pizza Hut' }],
    account_id: 12,
    account_name: 'Pizza EMEA',
    created_at: '2026-09-01T10:00:00Z',
    ...extra,
  };
}

/** Two answered CSAT surveys (very satisfied and neutral), an NPS and an unanswered CSAT. */
export const ACCOUNT_SURVEYS: Survey[] = [
  surveyFixture(401, { score: 90 }),
  surveyFixture(402, { score: 55 }),
  surveyFixture(403, { survey_type: 'nps', survey_type_display: 'NPS', score: 40 }),
  surveyFixture(404, { status: 'sent', status_display: 'Sent', responded_at: null }),
];

export const ACCOUNT_CANVASES: Canvas[] = [
  {
    id: 301,
    name: 'EMEA buying group',
    nodes: [
      { id: 'n1', type: 'contact', position: { x: 0, y: 0 }, data: { contact_id: 51 } },
      { id: 'n2', type: 'contact', position: { x: 200, y: 0 }, data: { contact_id: 52 } },
    ],
    edges: [],
    companies: [{ id: 7, name: 'Pizza Hut' }],
    account_id: 12,
    account_name: 'Pizza EMEA',
    created_at: '2026-09-10T10:00:00Z',
    updated_at: '2026-09-28T10:00:00Z',
  },
];

export const LINE_ITEMS: CustomObjectDefinition = {
  id: 4,
  name: 'Line item',
  api_name: 'line_item',
  applies_to_customer: false,
  applies_to_account: true,
  fields: [
    { id: 9, name: 'Product', api_name: 'product', field_type: 'text', field_type_display: 'Text', is_required: true, picklist_options: [], order: 1, created_at: '2026-09-06T00:00:00Z' },
    { id: 10, name: 'Quantity', api_name: 'qty', field_type: 'number', field_type_display: 'Number', is_required: false, picklist_options: [], order: 2, created_at: '2026-09-06T00:00:00Z' },
  ],
  records_count: 1,
  created_at: '2026-09-06T00:00:00Z',
};

export const LINE_ITEM_RECORDS: CustomObjectRecord[] = [
  {
    id: 21,
    object_definition_id: 4,
    customer_id: null,
    account_id: 12,
    parent_name: 'Pizza EMEA',
    parent_type: 'account',
    data: { product: 'Seat licence', qty: 50 },
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
  },
];

const onEmea = <T extends { account_id?: number | null; account_name?: string | null }>(record: T): T => ({
  ...record,
  account_id: 12,
  account_name: 'Pizza EMEA',
});

export interface AccountLists {
  contacts?: Contact[];
  opportunities?: Opportunity[];
  risks?: Risk[];
  files?: Attachment[];
  calls?: Call[];
  surveys?: Survey[];
  canvases?: Canvas[];
}

/** Pizza Hut's lists, filed on Pizza EMEA. */
export const ACCOUNT_LISTS: Required<AccountLists> = {
  contacts: CONTACTS.map(onEmea),
  opportunities: OPPORTUNITIES.map(onEmea),
  risks: RISKS.map(onEmea),
  files: FILES.map(onEmea),
  calls: CALLS.map(onEmea),
  surveys: ACCOUNT_SURVEYS,
  canvases: ACCOUNT_CANVASES,
};

export interface AccountPageStub {
  /** The account (default Pizza EMEA). null: the viewer may not open it, so
   *  no row and 404 for its record, story and lists. */
  row?: AccountPortfolioRow | null;
  /** GET /accounts/<id>/ (default pizzaEmeaRecord for Pizza EMEA, else accountFixture(row)). */
  record?: Account;
  items?: StoryItem[];
  attention?: StoryAttention;
  lists?: AccountLists;
  definitions?: CustomObjectDefinition[];
  records?: CustomObjectRecord[];
  /** How many portfolio reads fail (500 "Try later.") before they succeed. */
  failPortfolio?: number;
  /** How many story reads fail before they succeed. */
  failStory?: number;
  /** Answers every request this stub does not (the Accounts list's stub, say). */
  fallback?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
}

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) };
}

function bodyOf(init?: RequestInit): Record<string, unknown> {
  if (init?.body instanceof FormData) return Object.fromEntries(init.body.entries());
  return init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
}

const byNewest = (items: StoryItem[]) => [...items].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));

export function stubAccountPage(stub: AccountPageStub = {}) {
  let row: AccountPortfolioRow | null = stub.row === undefined ? pizzaEmea : stub.row;
  let record: Account | null = stub.record ?? (row ? (row.id === pizzaEmea.id ? pizzaEmeaRecord : accountFixture(row)) : null);
  const book = [...(stub.items ?? ACCOUNT_STORY_ITEMS)];
  let portfolioFailures = stub.failPortfolio ?? 0;
  let storyFailures = stub.failStory ?? 0;
  let created = 0;
  const lists = {
    contacts: [...(stub.lists?.contacts ?? [])],
    opportunities: [...(stub.lists?.opportunities ?? [])],
    risks: [...(stub.lists?.risks ?? [])],
    files: [...(stub.lists?.files ?? [])],
    calls: [...(stub.lists?.calls ?? [])],
    surveys: [...(stub.lists?.surveys ?? [])],
    canvases: [...(stub.lists?.canvases ?? [])],
  };
  type ListKey = keyof typeof lists;
  const definitions = stub.definitions ?? [];
  const objectRecords = [...(stub.records ?? [])];

  /** A PATCH as the backend applies it to the record and to the next row read. */
  function patch(body: Record<string, unknown>) {
    if (!row || !record) return;
    if ('owner_id' in body) {
      const member = MEMBERS.find((m) => m.id === body.owner_id) ?? null;
      record = { ...record, owner: member as Account['owner'] };
      row = { ...row, owner: member ? { id: member.id, name: member.name } : null };
    }
    if (typeof body.name === 'string') {
      record = { ...record, name: body.name };
      row = { ...row, name: body.name };
    }
    if (typeof body.lifecycle_stage === 'string') {
      const stage = body.lifecycle_stage as LifecycleValue;
      record = { ...record, lifecycle_stage: stage };
      row = { ...row, lifecycle: { value: stage, label: LIFECYCLE_LABELS[stage] } };
    }
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';

    if (path === '/accounts/portfolio/' && url.searchParams.has('ids')) {
      if (portfolioFailures > 0) {
        portfolioFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      return json(200, buildAccountPortfolio(url.searchParams, row ? [row] : []));
    }

    const nested = /^\/customers\/\d+\/accounts\/(\d+)\/$/.exec(path);
    if (nested && method === 'PATCH' && row && Number(nested[1]) === row.id) {
      patch(bodyOf(init));
      return json(200, record);
    }

    const own = /^\/accounts\/(\d+)\/(.*)$/.exec(path);
    if (own) {
      if (!row || !record || Number(own[1]) !== row.id) return json(404, { detail: 'Not found.' });
      const rest = own[2];
      const tag = { account_id: row.id, account_name: row.name };
      const ref = { id: row.id, name: row.name };
      if (rest === '' && method === 'GET') return json(200, record);
      if (rest === '' && method === 'PATCH') {
        patch(bodyOf(init));
        return json(200, record);
      }
      if (rest === 'story/') {
        if (storyFailures > 0) {
          storyFailures -= 1;
          return json(500, { detail: 'Try later.' });
        }
        const query = new URLSearchParams(url.searchParams);
        // One account has no chips: `account` is ignored (backend #75).
        query.delete('account');
        const attention = stub.attention ?? ACCOUNT_ATTENTION;
        const thread = query.get('thread');
        if (thread) {
          query.delete('thread');
          const whole = buildStory(query, book, attention, [row.id]);
          const emails = thread === 't-9' ? ACCOUNT_THREAD : book.filter((item) => item.kind === 'email' && item.link.thread_id === thread);
          return json(200, { ...whole, items: byNewest(emails), next_cursor: null });
        }
        return json(200, buildStory(query, book, attention, [row.id]));
      }
      const list = /^(contacts|opportunities|risks|files|calls|surveys|canvases)\/$/.exec(rest);
      if (list && method === 'GET') {
        // A fresh copy of each record: the store freezes what it keeps.
        return json(200, (lists[list[1] as ListKey] as object[]).map((item) => ({ ...item })));
      }
      if (list && method === 'POST') {
        const body = bodyOf(init);
        created += 1;
        const id = 900 + created;
        const now = new Date().toISOString();
        const companies = row.details.profile.organisations;
        if (list[1] === 'contacts') {
          const contact: Contact = {
            id,
            name: String(body.name ?? ''),
            role: (body.role as Contact['role']) ?? 'other',
            role_display: 'Other',
            email: String(body.email ?? ''),
            phone: String(body.phone ?? ''),
            status: 'active',
            sentiment: 'neutral',
            sentiment_source: 'manual',
            sentiment_computed_at: null,
            last_contacted_at: null,
            companies,
            ...tag,
          };
          lists.contacts.push(contact);
          return json(201, contact);
        }
        if (list[1] === 'opportunities' || list[1] === 'risks') {
          const deal = {
            id,
            title: String(body.title ?? ''),
            mrr: String(body.mrr || '0.00'),
            priority: (body.priority as Opportunity['priority']) ?? 'medium',
            priority_display: 'Medium',
            department: (body.department as Opportunity['department']) ?? '',
            department_display: '',
            companies,
            ...tag,
          };
          if (list[1] === 'opportunities') {
            const opportunity: Opportunity = { ...deal, stage: (body.stage as Opportunity['stage']) ?? 'discovery', stage_display: 'Discovery' };
            lists.opportunities.push(opportunity);
            return json(201, opportunity);
          }
          const risk: Risk = { ...deal, stage: (body.stage as Risk['stage']) ?? 'open', stage_display: 'Open' };
          lists.risks.push(risk);
          return json(201, risk);
        }
        if (list[1] === 'files') {
          const file = body.file as File;
          const attachment: Attachment = {
            id,
            name: file.name,
            content_type: file.type || 'application/octet-stream',
            size: file.size,
            description: String(body.description ?? ''),
            source: 'upload',
            uploaded_by: { id: 1, name: 'Alice' },
            download_url: `/api/v1/files/${id}/download/`,
            created_at: now,
            ...tag,
          };
          lists.files.unshift(attachment);
          return json(201, attachment);
        }
        if (list[1] === 'surveys') {
          const type = String(body.survey_type ?? 'nps') as Survey['survey_type'];
          const sent = String(body.sent_at ?? now).slice(0, 10);
          const saved = surveyFixture(id, { survey_type: type, survey_type_display: type.toUpperCase(), status: 'sent', status_display: 'Sent', sent_at: sent, responded_at: null, companies });
          lists.surveys.push(saved);
          book.push({ id, kind: 'survey', source: 'revenact', occurred_at: `${sent}T00:00:00+00:00`, all_day: true, account: ref, title: `${type.toUpperCase()} survey`, summary: 'Sent · awaiting a response', actor: null, link: NO_LINK });
          return json(201, saved);
        }
        if (list[1] === 'calls') {
          const at = body.occurred_at ? new Date(String(body.occurred_at)).toISOString() : now;
          const call: Call = {
            id,
            title: String(body.title ?? ''),
            host_name: 'Alice',
            occurred_at: at,
            duration_minutes: null,
            summary: String(body.summary ?? ''),
            sentiment: '',
            ai_area: '',
            ai_category: '',
            recording_url: '',
            connector_name: null,
            connector_provider: null,
            logged_by: { id: 1, name: 'Alice' },
            transcript: null,
            participants: [],
            links: 0,
            created_at: now,
            ...tag,
          };
          lists.calls.unshift(call);
          book.push({ id, kind: 'call', source: 'revenact', occurred_at: at, all_day: false, account: ref, title: call.title, summary: call.summary, actor: { id: null, name: 'Alice' }, link: NO_LINK });
          return json(201, call);
        }
      }
      const create = /^(tasks|notes)\/$/.exec(rest);
      if (create && method === 'POST') {
        const body = bodyOf(init);
        created += 1;
        const id = 900 + created;
        const now = new Date().toISOString();
        const title = String(body.title ?? '');
        const actor = { id: 1, name: 'Alice' };
        if (create[1] === 'tasks') {
          book.push({ id, kind: 'task', source: 'revenact', occurred_at: now, all_day: false, account: ref, title, summary: `Due ${String(body.due_date)} · Medium · Pending`, actor, link: NO_LINK });
          return json(201, { id, title, assignee_name: 'Alice', assignee: actor, created_by: actor, due_date: body.due_date, priority: body.priority, status: 'pending' });
        }
        book.push({ id, kind: 'note', source: 'revenact', occurred_at: `${now.slice(0, 10)}T00:00:00+00:00`, all_day: true, account: ref, title, summary: String(body.body ?? ''), actor, link: NO_LINK });
        return json(201, { id, title, author_name: 'Alice', author: actor, body: body.body, logged_at: now.slice(0, 10), links: 0 });
      }
      return json(404, { detail: `Not stubbed: ${method} ${path}` });
    }

    const one = /^\/(contacts|opportunities|risks|files|canvases)\/(\d+)\/$/.exec(path);
    if (one && (method === 'PATCH' || method === 'DELETE')) {
      const target = lists[one[1] as ListKey] as { id: number }[];
      const at = target.findIndex((item) => item.id === Number(one[2]));
      if (at === -1) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        target.splice(at, 1);
        return json(204, null);
      }
      target[at] = { ...target[at], ...bodyOf(init) };
      return json(200, target[at]);
    }

    if (path === '/custom-objects/definitions/' && method === 'GET') return json(200, definitions);
    if (path === '/custom-objects/records/' && method === 'GET') {
      const definition = Number(url.searchParams.get('definition'));
      const account = Number(url.searchParams.get('account'));
      return json(200, objectRecords.filter((r) => r.object_definition_id === definition && r.account_id === account));
    }
    if (path === '/custom-objects/records/' && method === 'POST') {
      const body = bodyOf(init) as { object_definition_id: number; account_id: number; data: CustomObjectRecord['data'] };
      created += 1;
      const saved: CustomObjectRecord = {
        id: 900 + created,
        object_definition_id: body.object_definition_id,
        customer_id: null,
        account_id: body.account_id,
        parent_name: row?.name ?? '',
        parent_type: 'account',
        data: body.data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      objectRecords.push(saved);
      return json(201, saved);
    }
    const objectRecord = /^\/custom-objects\/records\/(\d+)\/$/.exec(path);
    if (objectRecord && (method === 'PATCH' || method === 'DELETE')) {
      const at = objectRecords.findIndex((r) => r.id === Number(objectRecord[1]));
      if (at === -1) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        objectRecords.splice(at, 1);
        return json(204, null);
      }
      objectRecords[at] = { ...objectRecords[at], ...(bodyOf(init) as Partial<CustomObjectRecord>) };
      return json(200, objectRecords[at]);
    }

    if (method === 'GET' && path === '/auth/members/') return json(200, MEMBERS);
    if (method === 'GET' && path === '/attributes/values/') return json(200, []);
    if (stub.fallback) return stub.fallback(input, init);
    return json(404, { detail: `Not stubbed: ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type Calls = { mock: { calls: [RequestInfo | URL, RequestInit?][] } };

/** Every account story request so far, as parsed query strings, oldest first. */
export function accountStoryQueries(spy: Calls): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => /\/accounts\/\d+\/story\/$/.test(url.pathname))
    .map((url) => url.searchParams);
}
```

- [ ] **Step 4: Run the tests to verify they pass, and the organisation page's still do**

Run: `npx vitest run --maxWorkers=2 src/features/organizations src/features/accounts src/components/accounts/detail/story.test.tsx src/components/organizations/detail src/pages/organizations`
Expected: PASS, 0 failed (`detailParams.test.ts`, `storyApi.test.ts` and `useStory.test.tsx` unchanged and green).

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/organizations/detailScope.ts src/features/organizations/detailScope.test.ts src/features/organizations/detailParams.ts src/features/organizations/storyApi.ts src/components/organizations/detail/useStory.ts src/features/accounts/accountPageParams.ts src/features/accounts/accountPageParams.test.ts src/features/accounts/csat.ts src/features/accounts/csat.test.ts src/features/accounts/testAccountPage.ts src/features/accounts/testAccountPage.test.ts src/components/accounts/detail/useAccountPageParams.ts src/components/accounts/detail/story.test.tsx
git commit -m "$(cat <<'EOF'
feat(accounts): the account page's scope, URL state and story reads

A detail part's page is an organisation (customerId, as before) or one
account (a scope); the story reads either endpoint, keyed by its path. The
account page's ?tab= and story filters, the backend's CSAT bands, and a
fetch stub in backend #75's shapes.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The Story's parts work on one account

**Files:**
- Modify: `src/components/organizations/detail/accountNames.ts` (whole file), `ListParts.tsx` (`AccountTag`), `StoryItemRow.tsx` (the tag), `EmailThread.tsx` (whole file), `DetailTabs.tsx` (whole file), `AttentionBlock.tsx` (props, two actions), `StoryTab.tsx` (whole file), `AddFlow.tsx` (whole file) — all under `src/components/organizations/detail/`
- Create: `src/components/accounts/detail/storyParts.test.tsx`

**Interfaces:**
- Consumes (Task 3): `DetailScope`, `resolveScope`, `StoryTarget`, `storyPath`, `fetchThreadAt`, `StoryParams`, `ACCOUNT_TABS`, `AccountTab`, `stubAccountPage`, `ACCOUNT_ATTENTION`, `ACCOUNT_LISTS`, `accountStoryQueries`. (Task 1): `accountBase`, `FileParent` with a null organisation.
- Produces:
  - `ShowAccountTags: React.Context<boolean>` (default `true`), exported from `detail/accountNames.ts`.
  - `DetailTabs<K extends string = DetailTab>(props: { idBase: string; active: K; onChange: (tab: K) => void; tabs?: readonly { key: K; label: string }[]; label?: string })`.
  - `AttentionBlock` props: + `renewalPanel?: PanelKey` (default `'contract'`); `onOpenTab?: (tab: DetailTab) => void` (was required).
  - `StoryTab` props: `({ orgId: number } | { scope: DetailScope }) & { story; params: StoryParams; accounts: Account[]; isSm; active; onUpdate: (patch: Partial<StoryParams>, options?: { replace?: boolean }) => void; onAdded: (what: AddKind) => void; onOpenTab?: (tab: DetailTab) => void; onJump: (panel: PanelKey) => void }`.
  - `AddFlow` props: `customerId?: number` (absent on the account page, where `accountId` is the account itself).
  - `EmailThread` prop `orgId: StoryTarget`.

- [ ] **Step 1: Write the failing tests**

`src/components/accounts/detail/storyParts.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ACCOUNT_TABS, type AccountTab } from '../../../features/accounts/accountPageParams';
import { ACCOUNT_ATTENTION, ACCOUNT_LISTS, accountStoryQueries, stubAccountPage } from '../../../features/accounts/testAccountPage';
import { storyFilters, type StoryParams } from '../../../features/organizations/detailParams';
import type { DetailScope } from '../../../features/organizations/detailScope';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import { storyQuery } from '../../../features/organizations/storyApi';
import { postBodies, requestPaths } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { AddFlow } from '../../organizations/detail/AddFlow';
import { AttentionBlock } from '../../organizations/detail/AttentionBlock';
import { DetailTabs } from '../../organizations/detail/DetailTabs';
import { StoryTab } from '../../organizations/detail/StoryTab';
import { ShowAccountTags } from '../../organizations/detail/accountNames';
import { useStory } from '../../organizations/detail/useStory';

// The organisation page's Story parts on one account (spec 2026-09-29 §2.5):
// the account story, no account tags, + Add on the account, renewal to the
// Commercial panel.

const EMEA: DetailScope = { kind: 'account', id: 12, name: 'Pizza EMEA' };
const itemKeys = () => [...document.querySelectorAll('[data-story-item]')].map((el) => el.getAttribute('data-story-item'));

function TabsHarness() {
  const [active, setActive] = useState<AccountTab>('story');
  return <DetailTabs idBase="t" active={active} tabs={ACCOUNT_TABS} label="Account sections" onChange={setActive} />;
}

function StoryHarness({ onJump }: { onJump: (panel: PanelKey) => void }) {
  const [params, setParams] = useState<StoryParams>({ account: '', group: '', sources: [], q: '' });
  const [version, setVersion] = useState(0);
  const story = useStory(EMEA, storyQuery(storyFilters(params)), version, true);
  return (
    <ShowAccountTags.Provider value={false}>
      <StoryTab
        scope={EMEA}
        story={story}
        params={params}
        accounts={[]}
        isSm
        active
        onUpdate={(patch) => setParams((prev) => ({ ...prev, ...patch }))}
        onAdded={() => setVersion((v) => v + 1)}
        onJump={onJump}
      />
    </ShowAccountTags.Provider>
  );
}

function renderStory() {
  const onJump = vi.fn();
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <StoryHarness onJump={onJump} />
      </MemoryRouter>
    </Provider>,
  );
  return onJump;
}

describe('the Story parts on one account', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('DetailTabs takes the account page\'s seven tabs and its own name', async () => {
    render(<TabsHarness />);
    const list = screen.getByRole('tablist', { name: 'Account sections' });
    expect(within(list).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(ACCOUNT_TABS.map((tab) => tab.label));
    screen.getByRole('tab', { name: 'Story' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    const canvases = screen.getByRole('tab', { name: 'Canvases' });
    expect(canvases).toHaveAttribute('aria-selected', 'true');
    expect(canvases).toHaveFocus();
    expect(canvases).toHaveAttribute('aria-controls', 't-panel-canvases');
  });

  it('Needs attention sends the renewal to the Commercial panel and has no Knowledge row', async () => {
    const onJump = vi.fn();
    const onFilter = vi.fn();
    render(<AttentionBlock attention={ACCOUNT_ATTENTION} onFilter={onFilter} onJump={onJump} renewalPanel="commercial" />);
    const block = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(block).getAllByRole('listitem')).toHaveLength(3);
    expect(block).not.toHaveTextContent(/question/);
    await userEvent.click(within(block).getByRole('button', { name: /^Renewal 47d overdue/ }));
    expect(onJump).toHaveBeenCalledWith('commercial');
    await userEvent.click(within(block).getByRole('button', { name: /^1 overdue task/ }));
    expect(onFilter).toHaveBeenCalledWith('tasks');
  });

  it('reads the account story, with no account tag on any item', async () => {
    const spy = stubAccountPage();
    renderStory();
    await waitFor(() => expect(itemKeys()).toEqual(['email:141', 'call:112', 'ticket:188', 'task:105', 'health:103']));
    for (const item of document.querySelectorAll('[data-story-item]')) expect(item).not.toHaveTextContent('Pizza EMEA');
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
    expect(accountStoryQueries(spy)[0].toString()).toBe('limit=30');
  });

  it('sends the renewal row to Commercial', async () => {
    stubAccountPage();
    const onJump = renderStory();
    await userEvent.click(await screen.findByRole('button', { name: /^Renewal 47d overdue/ }));
    expect(onJump).toHaveBeenCalledWith('commercial');
  });

  it('+ Add saves a task on the account, and the story reads it again', async () => {
    const spy = stubAccountPage();
    renderStory();
    await waitFor(() => expect(itemKeys()).toHaveLength(5));
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    expect(dialog).toHaveAccessibleDescription('On Pizza EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Task title' }), 'Book the retraining');
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(itemKeys()).toContain('task:901'));
    expect(postBodies(spy, '/accounts/12/tasks/')).toEqual([
      { title: 'Book the retraining', due_date: '2026-10-01', priority: 'medium', assignee_id: null },
    ]);
  });

  it('Feedback links to the Surveys page, unfiltered', async () => {
    stubAccountPage();
    renderStory();
    await waitFor(() => expect(itemKeys()).toHaveLength(5));
    await userEvent.click(screen.getByRole('button', { name: /^Feedback/ }));
    expect(screen.getByRole('link', { name: 'Manage surveys' })).toHaveAttribute('href', '/surveys');
  });

  it('opens an email\'s thread from the account story', async () => {
    const spy = stubAccountPage();
    renderStory();
    await userEvent.click(await screen.findByRole('button', { name: 'Re: EMEA renewal' }));
    const sheet = screen.getByRole('dialog', { name: 'Re: EMEA renewal' });
    expect(await within(sheet).findByText('Sharing the quote ahead of your board meeting.')).toBeInTheDocument();
    expect(sheet).not.toHaveTextContent('Pizza EMEA');
    expect(accountStoryQueries(spy).some((query) => query.get('thread') === 't-9')).toBe(true);
  });

  it('+ Add logs a call on the account alone, offering its people', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    const onAdded = vi.fn();
    render(
      <Provider store={makeDetailStore()}>
        <MemoryRouter>
          <AddFlow what="call" accountId={12} accountName="Pizza EMEA" isSm onAdded={onAdded} onClose={vi.fn()} />
        </MemoryRouter>
      </Provider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Log a call' });
    expect(dialog).toHaveAccessibleDescription('On Pizza EMEA');
    await waitFor(() => expect(requestPaths(spy)).toContain('GET /accounts/12/contacts/'));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Call title' }), 'Renewal check-in');
    fireEvent.change(within(dialog).getByLabelText('When'), { target: { value: '2026-09-25T10:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log call' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/accounts/12/calls/')[0]).toMatchObject({ title: 'Renewal check-in' });
  });

  it('+ Add logs a survey on the account, with no CES', async () => {
    const spy = stubAccountPage();
    const onAdded = vi.fn();
    render(
      <Provider store={makeDetailStore()}>
        <MemoryRouter>
          <AddFlow what="survey" accountId={12} accountName="Pizza EMEA" isSm onAdded={onAdded} onClose={vi.fn()} />
        </MemoryRouter>
      </Provider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Log survey' });
    expect(within(dialog).queryByRole('option', { name: 'CES' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/accounts/12/surveys/')[0]).toMatchObject({ survey_type: 'nps' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/accounts/detail/storyParts.test.tsx`
Expected: FAIL. `ShowAccountTags` is not exported from `accountNames` yet, so every Story harness throws reading `.Provider` of undefined; `DetailTabs` shows the organisation page's six tabs and "Organization sections"; `AttentionBlock` sends the renewal to `'contract'`; `AddFlow` without `customerId` reads `/customers/undefined/…`.

- [ ] **Step 3: Implement**

Replace `src/components/organizations/detail/accountNames.ts` with:

```ts
import { createContext } from 'react';
import type { Account } from '../../../features/customers/customersSlice';

/** The organization's accounts, for the list items' account tags: a tag is
 *  named from here by `account_id`, so renaming an account from the chips
 *  shows on every item at once. Empty outside a list tab. */
export const AccountNames = createContext<Account[]>([]);

/** Whether list and story items show their account tag. On an account's page
 *  every record is that account's, so the tag would only repeat the page's
 *  name: that page provides false. */
export const ShowAccountTags = createContext(true);
```

In `src/components/organizations/detail/ListParts.tsx`, import `ShowAccountTags` beside `AccountNames` (`import { AccountNames, ShowAccountTags } from './accountNames';`) and replace `AccountTag` with:

```tsx
/** The account a record is on, as the Story tags it, named from the
 *  organization's accounts when a list tab provides them. None on an
 *  account's own page. */
export function AccountTag({ record }: { record: { account_id?: number | null; account_name?: string | null } }) {
  const accounts = useContext(AccountNames);
  const shown = useContext(ShowAccountTags);
  if (!shown) return null;
  return (
    <span className="inline-block min-w-0 max-w-[10rem] truncate rounded-full bg-subtle px-2 py-0.5 text-ink">
      {accountTag(record, accounts)}
    </span>
  );
}
```

In `src/components/organizations/detail/StoryItemRow.tsx`, add `import { ShowAccountTags } from './accountNames';`, add `const showTag = useContext(ShowAccountTags);` as the first line of `StoryItemRow`, and replace the tag `<span>` in the meta line with:

```tsx
          {showTag ? (
            <span className="inline-block min-w-0 max-w-[10rem] truncate rounded-full bg-subtle px-2 py-0.5 text-ink">
              {item.account?.name ?? 'Organization'}
            </span>
          ) : null}
```

Replace `src/components/organizations/detail/EmailThread.tsx` with:

```tsx
import { useContext, useEffect, useState } from 'react';
import type { StoryTarget } from '../../../features/organizations/detailScope';
import { fetchThreadAt, storyPath } from '../../../features/organizations/storyApi';
import { sourceName } from '../../../features/organizations/storyKinds';
import type { StoryItem } from '../../../features/organizations/storyTypes';
import { errorMessage } from '../portfolio/usePortfolio';
import { QUIET } from '../portfolio/styles';
import { ShowAccountTags } from './accountNames';
import { Sheet } from './Sheet';

type Load = { key: string; items: StoryItem[] } | { key: string; error: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function Message({ item, current }: { item: StoryItem; current: boolean }) {
  const showTag = useContext(ShowAccountTags);
  const source = sourceName(item.source);
  return (
    <li aria-current={current ? 'true' : undefined} className="py-3">
      <p className="text-[13px] font-semibold text-ink">{item.actor?.name ?? 'Unknown sender'}</p>
      <p className="text-[11px] text-ink-muted">
        <time dateTime={item.occurred_at} className="font-mono-brand tabular-nums">
          {when(item.occurred_at)}
        </time>
      </p>
      {item.summary ? <p className="mt-2 whitespace-pre-line break-words text-[13px] text-ink">{item.summary}</p> : null}
      <p className="mt-1 text-[11px] text-ink-muted">
        {[showTag ? (item.account?.name ?? 'Organization') : null, source ? `via ${source}` : null].filter(Boolean).join(' · ')}
      </p>
    </li>
  );
}

/** One email's thread (spec §1.6). The backend has no thread endpoint: the
 *  story read with `thread` returns that thread's emails, across the page's
 *  scope (an organization and its accounts, or one account), each under its
 *  own visibility rule. Each message shows its sender, time and the story's
 *  one-line summary; the full message and replying stay in Communications. */
export function EmailThread({
  orgId,
  threadId,
  openedId,
  title,
  isSm,
  onClose,
}: {
  /** The page: an organization id, or a scope. */
  orgId: StoryTarget;
  threadId: string;
  /** The email that was opened; it is marked current in the thread. */
  openedId: number;
  title: string;
  isSm: boolean;
  onClose: () => void;
}) {
  const path = storyPath(orgId);
  const [attempt, setAttempt] = useState(0);
  const key = `${path}#${threadId}#${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchThreadAt(path, threadId).then(
      (items) => {
        if (!cancelled) setLoad({ key, items });
      },
      (err: unknown) => {
        if (!cancelled) setLoad({ key, error: errorMessage(err, 'Could not open this email.') });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, path, threadId]);

  const current = load && load.key === key ? load : null;
  // The opened email may have gone (or no longer be visible) since the story loaded.
  const thread = current && 'items' in current && current.items.some((item) => item.id === openedId) ? current.items : null;

  return (
    <Sheet title={title} description={thread && thread.length > 1 ? `${thread.length} messages` : undefined} isSm={isSm} onClose={onClose}>
      {!current ? (
        <div role="status" aria-label="Opening the email" className="flex flex-col gap-2 py-3">
          <span aria-hidden="true" className="block h-3 w-32 animate-pulse rounded bg-subtle" />
          <span aria-hidden="true" className="block h-3 w-full animate-pulse rounded bg-subtle" />
          <span aria-hidden="true" className="block h-3 w-2/3 animate-pulse rounded bg-subtle" />
        </div>
      ) : 'error' in current ? (
        <div role="alert" className="flex flex-col items-start gap-2 py-3">
          <p className="text-[13px] text-danger">{current.error}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : thread ? (
        <ol className="flex flex-col divide-y divide-line-subtle">
          {thread.map((item) => (
            <Message key={item.id} item={item} current={item.id === openedId} />
          ))}
        </ol>
      ) : (
        <p className="py-3 text-[13px] text-ink-muted">This email is no longer available to you.</p>
      )}
    </Sheet>
  );
}
```

Replace `src/components/organizations/detail/DetailTabs.tsx` with:

```tsx
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { DETAIL_TABS, detailPanelId, detailTabId, type DetailTab } from '../../../features/organizations/detailParams';
import { FOCUS } from '../portfolio/styles';

/** A detail page's tabs (organisation spec §1.5; account spec §2.4): a real
 *  tablist whose selection lives in the URL. Arrows, Home and End move and
 *  select (automatic activation); only the selected tab is in the tab order.
 *  On phones the row scrolls sideways and the selected tab scrolls into view.
 *  The organization page's tabs unless `tabs` is given. */
export function DetailTabs<K extends string = DetailTab>({
  idBase,
  active,
  onChange,
  tabs,
  label = 'Organization sections',
}: {
  idBase: string;
  active: K;
  onChange: (tab: K) => void;
  tabs?: readonly { key: K; label: string }[];
  /** The tablist's accessible name. */
  label?: string;
}) {
  const list = tabs ?? (DETAIL_TABS as unknown as readonly { key: K; label: string }[]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const onKey = (event: KeyboardEvent, index: number) => {
    const last = list.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const tab = list[next].key;
    onChange(tab);
    document.getElementById(detailTabId(idBase, tab))?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className="-mx-4 flex gap-4 overflow-x-auto border-b border-line-subtle px-4 sm:mx-0 sm:px-0"
    >
      {list.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            id={detailTabId(idBase, tab.key)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={detailPanelId(idBase, tab.key)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => onKey(event, index)}
            className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 text-[13px] font-semibold sm:min-h-9 ${FOCUS} ${
              selected ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

In `src/components/organizations/detail/AttentionBlock.tsx`:
- Add `renewalPanel = 'contract',` to the destructured props and to the props type:

```ts
  /** Where the renewal row goes: the organisation's contract timeline, or
   *  an account's Commercial panel. */
  renewalPanel?: PanelKey;
  /** Where the questions row goes. The account page has no Knowledge tab
   *  and never has questions. */
  onOpenTab?: (tab: DetailTab) => void;
```

  (replacing the existing required `onOpenTab: (tab: DetailTab) => void;`).
- In the renewal row, replace `action: () => onJump('contract'),` with `action: () => onJump(renewalPanel),`.
- In the questions row, replace `action: () => onOpenTab('knowledge'),` with `action: onOpenTab ? () => onOpenTab('knowledge') : undefined,`.

Replace `src/components/organizations/detail/StoryTab.tsx` with:

```tsx
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Account } from '../../../features/customers/customersSlice';
import { chosenAccount } from '../../../features/organizations/accountScope';
import { hasStoryFilters, type DetailTab, type StoryParams } from '../../../features/organizations/detailParams';
import { resolveScope, type DetailScope } from '../../../features/organizations/detailScope';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import type { AddKind } from '../../../features/organizations/storyKinds';
import type { StoryItem } from '../../../features/organizations/storyTypes';
import { QUIET } from '../portfolio/styles';
import { AddFlow } from './AddFlow';
import { AttentionBlock } from './AttentionBlock';
import { EmailThread } from './EmailThread';
import { StoryStream } from './StoryStream';
import { StoryToolbar } from './StoryToolbar';
import type { StoryState } from './useStory';

type StoryTabProps = ({ orgId: number; scope?: undefined } | { scope: DetailScope; orgId?: undefined }) & {
  story: StoryState;
  params: StoryParams;
  accounts: Account[];
  isSm: boolean;
  /** Whether the Story tab is the one showing. A hidden tab closes its
   *  sheets (browser Back to another tab must not leave one open over it). */
  active: boolean;
  onUpdate: (patch: Partial<StoryParams>, options?: { replace?: boolean }) => void;
  /** A record was added through + Add; the page reloads what shows it. */
  onAdded: (what: AddKind) => void;
  /** Where Needs attention's questions row goes (the organization page's Knowledge). */
  onOpenTab?: (tab: DetailTab) => void;
  onJump: (panel: PanelKey) => void;
};

/** The Story tab (organisation spec §1.6; account spec §2.5): Needs
 *  attention, the toolbar, then the stream. Filters live in the URL (through
 *  `onUpdate`); "+ Add" and an opened email are sheets over the page. On an
 *  organization (`orgId`) + Add saves on the chosen account chip or the
 *  organization; on one account (`scope`) it always saves on that account. */
export function StoryTab(props: StoryTabProps) {
  const { story, params, accounts, isSm, active, onUpdate, onAdded, onOpenTab, onJump } = props;
  const scope = resolveScope({ customerId: props.orgId, scope: props.scope });
  const [adding, setAdding] = useState<AddKind | null>(null);
  const [email, setEmail] = useState<StoryItem | null>(null);
  const [notice, setNotice] = useState('');
  if (!active && (adding || email)) {
    setAdding(null);
    setEmail(null);
  }
  // An account the organization does not have (a stale or hand-edited
  // ?account=) is no place to save: + Add saves on the organization.
  const chosen = scope.kind === 'account' ? undefined : chosenAccount(accounts, params.account);
  const accountId = scope.kind === 'account' ? scope.id : chosen?.id;
  const accountName = scope.kind === 'account' ? scope.name : chosen?.name;
  const onSearch = useCallback((q: string) => onUpdate({ q }, { replace: true }), [onUpdate]);

  return (
    <div className="flex flex-col gap-3">
      {story.data ? (
        <AttentionBlock
          attention={story.data.attention}
          // The attention counts ignore the search and the sources, so its
          // row opens the whole group, not a narrowed slice of it.
          onFilter={(group) => onUpdate({ group, q: '', sources: [] })}
          onOpenTab={onOpenTab}
          onJump={onJump}
          renewalPanel={scope.kind === 'account' ? 'commercial' : 'contract'}
        />
      ) : null}
      <StoryToolbar
        group={params.group}
        sources={params.sources}
        q={params.q}
        byGroup={story.data?.counts.by_group ?? null}
        byKind={story.data?.counts.by_kind ?? null}
        isSm={isSm}
        onGroup={(group) => onUpdate({ group })}
        onSources={(sources) => onUpdate({ sources })}
        onSearch={onSearch}
        onAdd={(what) => {
          setNotice('');
          setAdding(what);
        }}
      />
      {params.group === 'feedback' ? (
        // Surveys are edited, expired and deleted on the Surveys page: filtered
        // to this organization, or whole for an account (it filters by
        // organization only, and an account may have several).
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
          <span>Edit, expire or delete a survey on the Surveys page.</span>
          <Link to={scope.kind === 'organization' ? `/surveys?customer=${scope.id}` : '/surveys'} className={`${QUIET} border border-line`}>
            Manage surveys
          </Link>
        </p>
      ) : null}
      <p role="status" className="sr-only">
        {notice}
      </p>
      <StoryStream
        story={story}
        filtered={hasStoryFilters(params)}
        onClearFilters={() => onUpdate({ account: '', group: '', sources: [], q: '' })}
        onOpenEmail={setEmail}
      />
      {active && adding ? (
        <AddFlow
          what={adding}
          customerId={scope.kind === 'organization' ? scope.id : undefined}
          accountId={accountId}
          accountName={accountName}
          isSm={isSm}
          onClose={() => setAdding(null)}
          onAdded={() => {
            setAdding(null);
            setNotice('Added to the story.');
            onAdded(adding);
          }}
        />
      ) : null}
      {active && email?.link.thread_id ? (
        <EmailThread
          orgId={scope}
          threadId={email.link.thread_id}
          openedId={email.id}
          title={email.title}
          isSm={isSm}
          onClose={() => setEmail(null)}
        />
      ) : null}
    </div>
  );
}
```

Replace `src/components/organizations/detail/AddFlow.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { accountBase } from '../../../lib/accountPaths';
import { apiFetch } from '../../../lib/apiClient';
import { clearCallSaveError, logCall, type LogCallInput } from '../../../features/calls/callsSlice';
import { createNote, createTask, type Contact } from '../../../features/customers/customersSlice';
import type { FileParent } from '../../../features/files/filesSlice';
import { ADD_FLOWS, type AddKind } from '../../../features/organizations/storyKinds';
import { CallForm } from '../activity/CallSenseTab';
import { NoteForm } from '../activity/NotesTab';
import { LogSurveyForm } from '../activity/SurveysTab';
import { TaskForm } from '../activity/TasksTab';
import { Sheet } from './Sheet';

/** "+ Add" (spec §1.6): one of the existing create flows in a sheet, saved on
 *  the organization, on the chosen account when an account chip is on, or,
 *  on an account's own page (no `customerId`), on that account through its
 *  flat routes. */
export function AddFlow({
  what,
  customerId,
  accountId,
  accountName,
  isSm,
  onAdded,
  onClose,
}: {
  what: AddKind;
  /** The organization; absent on the account page, where `accountId` is the account itself. */
  customerId?: number;
  accountId?: number;
  accountName?: string;
  isSm: boolean;
  onAdded: () => void;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { saving, saveError } = useAppSelector((state) => state.calls);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const parent: FileParent = accountId
    ? { entityType: 'account', customerId: customerId ?? null, accountId }
    : { entityType: 'organization', customerId: customerId ?? null };

  // The calls slice is global: an earlier sheet's (or CallSense's) failure
  // must not greet this one.
  useEffect(() => {
    if (what === 'call') dispatch(clearCallSaveError());
  }, [dispatch, what]);

  // A call offers the company's contacts as participants, as CallSense does.
  useEffect(() => {
    if (what !== 'call') return;
    let cancelled = false;
    const path = accountId ? `${accountBase(accountId, customerId)}/contacts/` : `/customers/${customerId}/contacts/`;
    apiFetch<Contact[]>(path).then(
      (rows) => {
        if (!cancelled) setContacts(Array.isArray(rows) ? rows : []);
      },
      () => {
        if (!cancelled) setContacts([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [what, customerId, accountId]);

  const title = ADD_FLOWS.find((flow) => flow.key === what)?.label ?? 'Add';
  return (
    <Sheet title={title} description={`On ${accountName ?? 'the organization'}`} isSm={isSm} onClose={onClose}>
      {what === 'task' ? (
        <TaskForm
          onCreate={async (task) => createTask.fulfilled.match(await dispatch(createTask({ customerId, accountId, ...task })))}
          onDone={onAdded}
        />
      ) : null}
      {what === 'note' ? (
        <NoteForm
          onCreate={async (note) => createNote.fulfilled.match(await dispatch(createNote({ customerId, accountId, ...note })))}
          onDone={onAdded}
        />
      ) : null}
      {what === 'call' ? (
        <CallForm
          contacts={contacts}
          saving={saving}
          error={saveError}
          onLog={async (input: LogCallInput) => logCall.fulfilled.match(await dispatch(logCall({ ...parent, input })))}
          onDone={onAdded}
        />
      ) : null}
      {what === 'survey' ? (
        <LogSurveyForm customerId={customerId} accountId={accountId} allowCes={!accountId} onLogged={onAdded} onCancel={onClose} />
      ) : null}
    </Sheet>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass, and the organisation page's still do**

Run: `npx vitest run --maxWorkers=2 src/components/accounts/detail/storyParts.test.tsx src/components/organizations/detail src/pages/organizations src/e2e`
Expected: PASS, 0 failed.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/accountNames.ts src/components/organizations/detail/ListParts.tsx src/components/organizations/detail/StoryItemRow.tsx src/components/organizations/detail/EmailThread.tsx src/components/organizations/detail/DetailTabs.tsx src/components/organizations/detail/AttentionBlock.tsx src/components/organizations/detail/StoryTab.tsx src/components/organizations/detail/AddFlow.tsx src/components/accounts/detail/storyParts.test.tsx
git commit -m "$(cat <<'EOF'
refactor(organizations): the Story's parts work on one account too

StoryTab, AddFlow and EmailThread take an account scope (the account
story, saves on the account, no account tags); DetailTabs takes any tab
list and name; Needs attention sends an account's renewal to Commercial.
The organization page passes what it always did.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: People, Deals & risks and Files read and save on one account

**Files:**
- Modify (whole files): `src/components/organizations/detail/PeopleTab.tsx`, `DealsTab.tsx`, `FilesSection.tsx`, `CallsSection.tsx`, `FilesCallsTab.tsx`
- Create: `src/components/accounts/detail/lists.test.tsx`

**Interfaces:**
- Consumes (Task 1): `fetchContactsForAccount`, `fetchOpportunitiesForAccount`, `fetchRisksForAccount`, `fetchFiles`/`uploadFile`/`fetchCalls` with `customerId: null`. (Task 2): the forms given `accountId` alone. (Task 3): `ScopeProps`, `resolveScope`, `scopeProps`, `scopeSlot`, `stubAccountPage`, `ACCOUNT_LISTS`. (Task 4): `AddFlow` without `customerId`.
- Produces: `PeopleTab`, `DealsTab`, `FilesSection`, `CallsSection`, `FilesCallsTab` props are `ScopeProps & { … }` (the rest unchanged). With `customerId` they behave exactly as today; with `scope={{ kind: 'account', id, name }}` they read `/accounts/<id>/…`, wait for the `account:<id>` slot, and add on that account. The account page passes `account=""` and `accounts={[]}`.

- [ ] **Step 1: Write the failing tests**

`src/components/accounts/detail/lists.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { fetchContactsForCustomer } from '../../../features/customers/customersSlice';
import { ACCOUNT_LISTS, stubAccountPage } from '../../../features/accounts/testAccountPage';
import type { DetailScope } from '../../../features/organizations/detailScope';
import { postBodies, requestPaths } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { CallsSection } from '../../organizations/detail/CallsSection';
import { DealsTab } from '../../organizations/detail/DealsTab';
import { FilesSection } from '../../organizations/detail/FilesSection';
import { PeopleTab } from '../../organizations/detail/PeopleTab';
import { ShowAccountTags } from '../../organizations/detail/accountNames';

// The organisation page's lists on one account (spec 2026-09-29 §2.7–2.9):
// read by the account alone, no account tags, adds on the account.

const EMEA: DetailScope = { kind: 'account', id: 12, name: 'Pizza EMEA' };
const ids = (attr: string) => [...document.querySelectorAll(`[${attr}]`)].map((el) => el.getAttribute(attr));

function renderOnAccount(ui: ReactNode, store = makeDetailStore()) {
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ShowAccountTags.Provider value={false}>{ui}</ShowAccountTags.Provider>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

describe('the lists on one account', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('People reads the account\'s people, with a summary, no account tags, and names that open the person', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<PeopleTab scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />);
    await waitFor(() => expect(ids('data-person')).toEqual(['51', '52', '53']));
    expect(requestPaths(spy)).toContain('GET /accounts/12/contacts/');
    expect(document.querySelector('[data-summary]')).not.toBeNull();
    for (const person of document.querySelectorAll('[data-person]')) expect(person).not.toHaveTextContent('Pizza EMEA');
    expect(screen.getByRole('link', { name: 'Dana Buyer' })).toHaveAttribute('href', '/contacts/51');
  });

  it('People adds a person on the account and reads the list again', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<PeopleTab scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />);
    await waitFor(() => expect(ids('data-person')).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(screen.queryByLabelText(/^Company/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByLabelText(/^Email/), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(ids('data-person')).toHaveLength(4));
    expect(postBodies(spy, '/accounts/12/contacts/')).toEqual([expect.objectContaining({ name: 'Robin Ops' })]);
    expect(requestPaths(spy).filter((path) => path === 'GET /accounts/12/contacts/')).toHaveLength(2);
  });

  it('People never shows an organisation\'s people left in the shared slot', async () => {
    const store = makeDetailStore();
    // Another page's read (an organisation's roll-up) lands in the slot first.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ ...ACCOUNT_LISTS.contacts[0], id: 77, name: 'Other Org Person' }] })));
    await store.dispatch(fetchContactsForCustomer(7));
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<PeopleTab scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />, store);
    expect(screen.queryByText('Other Org Person')).not.toBeInTheDocument();
    await waitFor(() => expect(ids('data-person')).toEqual(['51', '52', '53']));
  });

  it('Deals & risks reads both lists by the account and adds on it', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<DealsTab scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />);
    await waitFor(() => expect(ids('data-deal')).toEqual(['61', '62']));
    expect(requestPaths(spy)).toEqual(expect.arrayContaining(['GET /accounts/12/opportunities/', 'GET /accounts/12/risks/']));
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Upsell');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Opportunity' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(ids('data-deal')).toHaveLength(3));
    expect(postBodies(spy, '/accounts/12/opportunities/')).toEqual([expect.objectContaining({ title: 'Upsell' })]);

    await userEvent.click(screen.getByRole('button', { name: /^Risks/ }));
    await waitFor(() => expect(ids('data-deal')).toEqual(['71']));
    await userEvent.click(screen.getByRole('button', { name: 'Add risk' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Budget freeze');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Risk' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(postBodies(spy, '/accounts/12/risks/')).toHaveLength(1));
  });

  it('Files reads the account\'s files and uploads on it', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderOnAccount(<FilesSection scope={EMEA} account="" accounts={[]} isSm onShowAll={vi.fn()} />);
    await waitFor(() => expect(ids('data-file')).toEqual(['81', '82']));
    expect(screen.getByText(/New files go on Pizza EMEA\./)).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText('Choose files'), new File(['x'], 'Notes.txt', { type: 'text/plain' }));
    await waitFor(() => expect(ids('data-file')).toHaveLength(3));
    expect(postBodies(spy, '/accounts/12/files/')).toHaveLength(1);
    const first = within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem')[0];
    expect(within(first).getByText('Notes.txt')).toBeInTheDocument();
    expect(first).not.toHaveTextContent('Pizza EMEA');
  });

  it('Calls reads the account\'s calls and logs one on it', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    const onLogged = vi.fn();
    renderOnAccount(
      <CallsSection scope={EMEA} account="" accounts={[]} isSm active version={0} onLogged={onLogged} onShowAll={vi.fn()} />,
    );
    await waitFor(() => expect(ids('data-call')).toEqual(['12', '13']));
    await userEvent.click(screen.getByRole('button', { name: 'Log a call' }));
    const dialog = screen.getByRole('dialog', { name: 'Log a call' });
    expect(within(dialog).getByText('On Pizza EMEA')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Call title' }), 'Pricing follow-up');
    fireEvent.change(within(dialog).getByLabelText('When'), { target: { value: '2026-09-26T12:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log call' }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/accounts/12/calls/')).toHaveLength(1);
    await waitFor(() => expect(ids('data-call')).toHaveLength(3));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/accounts/detail/lists.test.tsx`
Expected: FAIL: the lists ignore `scope` and read `/customers/undefined/…`, which the stub answers 404, so each test fails on its first `waitFor`.

- [ ] **Step 3: Implement**

Replace `src/components/organizations/detail/PeopleTab.tsx` with:

```tsx
import { useCallback, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import {
  deleteContact,
  fetchContactsForAccount,
  fetchContactsForCustomer,
  type Account,
  type Contact,
} from '../../../features/customers/customersSlice';
import { awaitingAccount, byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { resolveScope, scopeSlot, type ScopeProps } from '../../../features/organizations/detailScope';
import { peopleSummary } from '../../../features/organizations/listSummaries';
import { ContactFormModal } from '../../contacts/ContactFormModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorBlock } from '../portfolio/PortfolioSections';
import { BUTTON } from '../portfolio/styles';
import { AccountNames } from './accountNames';
import { AddPaused, ListSearch, ListSkeleton, NoMatch, ScopedEmpty, SummaryLine } from './ListParts';
import { LIST } from './listStyles';
import { PersonItem } from './PersonItem';

type PeopleTabProps = ScopeProps & {
  /** The chip: '' All, 'none' the organization itself, or an account id. Always '' on an account's page. */
  account: string;
  accounts: Account[];
  isSm: boolean;
  /** Clears the chip (the empty state's Show all accounts). */
  onShowAll: () => void;
};

/** People (spec 2026-09-27 §2; account spec §2.7): a list item per person —
 *  the organization's roll-up narrowed by the account chip, or one account's
 *  own — with a one-line summary and search. Add, Edit and Delete are the
 *  existing flows; Add saves on the chosen account, or on the page's account.
 *  Read when the tab first opens. */
export function PeopleTab(props: PeopleTabProps) {
  const { account, accounts, isSm, onShowAll } = props;
  const scope = resolveScope(props);
  const kind = scope.kind;
  const scopeId = scope.id;
  const dispatch = useAppDispatch();
  const { contacts, contactsLoading, contactsError, contactsFor } = useAppSelector((state) => state.customers);
  // The shared slot holds this page's people (not another's, left behind or on its way).
  const loaded = contactsFor === scopeSlot({ kind, id: scopeId });
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const readPeople = useCallback(() => {
    if (kind === 'account') void dispatch(fetchContactsForAccount({ accountId: scopeId }));
    else void dispatch(fetchContactsForCustomer(scopeId));
  }, [dispatch, kind, scopeId]);

  // Read before paint: the read marks the shared slot loading at once, so
  // neither this list nor the chips show people another page left there.
  useLayoutEffect(() => {
    readPeople();
  }, [readPeople, attempt]);

  const inScope = useMemo(() => byAccount(contacts, account), [contacts, account]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return inScope;
    return inScope.filter((person) => `${person.name} ${person.role_display} ${person.email}`.toLowerCase().includes(needle));
  }, [inScope, q]);
  const target = chosenAccount(accounts, account);
  const paused = awaitingAccount(accounts, account);
  const pausedId = useId();
  const failed = contactsError !== null && !contactsLoading;

  let body: ReactNode;
  if (failed) body = <ErrorBlock message={contactsError} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (!loaded) body = <ListSkeleton label="Loading people" />;
  else if (inScope.length === 0) {
    body = (
      <ScopedEmpty
        what="people"
        scope={scopeLabel(accounts, account)}
        detail="Add the people you work with here, or they arrive from calls and email."
        onShowAll={onShowAll}
      />
    );
  } else if (shown.length === 0) body = <NoMatch q={q} onClear={() => setQ('')} />;
  else {
    body = (
      <ul aria-label="People" className={LIST}>
        {shown.map((person) => (
          <PersonItem key={person.id} contact={person} isSm={isSm} onEdit={() => setEditing(person)} onDelete={() => setDeleting(person)} />
        ))}
      </ul>
    );
  }

  return (
    <AccountNames.Provider value={accounts}>
      <div aria-busy={contactsLoading} className="flex flex-col gap-3">
        <div className={isSm ? 'flex items-center gap-2' : 'flex flex-col gap-2'}>
          <ListSearch label="Search people" value={q} onChange={setQ} isSm={isSm} />
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={paused}
            aria-describedby={paused ? pausedId : undefined}
            className={`${BUTTON} ${isSm ? 'ml-auto' : 'justify-center'}`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {target ? `Add contact to ${target.name}` : 'Add contact'}
          </button>
        </div>
        {paused ? <AddPaused id={pausedId} /> : null}
        {loaded && !failed && inScope.length > 0 ? <SummaryLine parts={peopleSummary(inScope)} /> : null}
        {body}

        {adding ? (
          <ContactFormModal
            customerId={kind === 'organization' ? scopeId : undefined}
            accountId={kind === 'account' ? scopeId : target?.id}
            onClose={() => setAdding(false)}
            onSaved={readPeople}
          />
        ) : null}
        {editing ? <ContactFormModal contact={editing} onClose={() => setEditing(null)} onSaved={() => {}} /> : null}
        {deleting ? (
          <ConfirmDialog
            title={`Delete ${deleting.name}?`}
            message="This can't be undone."
            confirmLabel="Delete"
            danger
            onConfirm={async () => {
              await dispatch(deleteContact(deleting.id)).unwrap();
            }}
            onClose={() => setDeleting(null)}
          />
        ) : null}
      </div>
    </AccountNames.Provider>
  );
}
```

Replace `src/components/organizations/detail/DealsTab.tsx` with:

```tsx
import { useCallback, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutGrid, List as ListIcon, Plus } from 'lucide-react';
import { useAppDispatch, useAppSelector, useOrgCurrency } from '../../../hooks';
import {
  deleteOpportunity,
  deleteRisk,
  fetchOpportunitiesForAccount,
  fetchOpportunitiesForCustomer,
  fetchRisksForAccount,
  fetchRisksForCustomer,
  updateOpportunity,
  updateRisk,
  type Account,
  type Opportunity,
  type Risk,
} from '../../../features/customers/customersSlice';
import { awaitingAccount, byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { resolveScope, scopeSlot, type ScopeProps } from '../../../features/organizations/detailScope';
import { opportunitiesSummary, risksSummary } from '../../../features/organizations/listSummaries';
import { KanbanBoard, PipelineCardContent } from '../../pipelines/KanbanBoard';
import { OPPORTUNITY_STAGE_COLUMNS, RISK_STAGE_COLUMNS } from '../../pipelines/kanbanConfig';
import { OpportunityFormModal } from '../../pipelines/OpportunityFormModal';
import { RiskFormModal } from '../../pipelines/RiskFormModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorBlock } from '../portfolio/PortfolioSections';
import { BUTTON, FOCUS } from '../portfolio/styles';
import { CountChip } from './CountChip';
import { DealItem } from './DealItem';
import { AccountNames } from './accountNames';
import { AddPaused, ListSearch, ListSkeleton, NoMatch, ScopedEmpty, SummaryLine } from './ListParts';
import { LIST } from './listStyles';

type Kind = 'opportunities' | 'risks';

/** The List / Board switch: desktop only, so 36px is its target. */
const SEGMENT = `inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold ${FOCUS}`;

const titled = (title: string, q: string) => title.toLowerCase().includes(q.trim().toLowerCase());

type DealsTabProps = ScopeProps & {
  /** The chip: '' All, 'none' the organization itself, or an account id. Always '' on an account's page. */
  account: string;
  accounts: Account[];
  isSm: boolean;
  onShowAll: () => void;
};

/** Deals & risks (spec 2026-09-27 §3; account spec §2.8): an Opportunities /
 *  Risks switch over list items — the organization's, narrowed by the
 *  account chip, or one account's — each with a one-line summary. The board
 *  stays an option from sm. Selecting an item opens its existing edit form;
 *  Add saves on the chosen account, or on the page's account. */
export function DealsTab(props: DealsTabProps) {
  const { account, accounts, isSm, onShowAll } = props;
  const scope = resolveScope(props);
  const kindOfPage = scope.kind;
  const scopeId = scope.id;
  const dispatch = useAppDispatch();
  const currency = useOrgCurrency();
  const {
    pipelineOpportunities: opportunities,
    pipelineOpportunitiesLoading,
    pipelineOpportunitiesError,
    pipelineRisks: risks,
    pipelineRisksLoading,
    pipelineRisksError,
    pipelineOpportunitiesFor,
    pipelineRisksFor,
  } = useAppSelector((state) => state.customers);
  const [kind, setKind] = useState<Kind>('opportunities');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [q, setQ] = useState('');
  // Each shared slot holds this page's records (not another's).
  const slot = scopeSlot({ kind: kindOfPage, id: scopeId });
  const loaded = {
    opportunities: pipelineOpportunitiesFor === slot,
    risks: pipelineRisksFor === slot,
  };
  const [attempt, setAttempt] = useState(0);
  const [addingOpportunity, setAddingOpportunity] = useState<Opportunity['stage'] | null>(null);
  const [addingRisk, setAddingRisk] = useState<Risk['stage'] | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [deletingOpportunity, setDeletingOpportunity] = useState<Opportunity | null>(null);
  const [deletingRisk, setDeletingRisk] = useState<Risk | null>(null);

  const readOpportunities = useCallback(() => {
    if (kindOfPage === 'account') void dispatch(fetchOpportunitiesForAccount({ accountId: scopeId }));
    else void dispatch(fetchOpportunitiesForCustomer(scopeId));
  }, [dispatch, kindOfPage, scopeId]);
  const readRisks = useCallback(() => {
    if (kindOfPage === 'account') void dispatch(fetchRisksForAccount({ accountId: scopeId }));
    else void dispatch(fetchRisksForCustomer(scopeId));
  }, [dispatch, kindOfPage, scopeId]);

  // Read before paint, as People does: the chips never count another page's
  // records left in the shared slots.
  useLayoutEffect(() => {
    readOpportunities();
    readRisks();
  }, [readOpportunities, readRisks, attempt]);

  const scopedOpportunities = useMemo(() => byAccount(opportunities, account), [opportunities, account]);
  const scopedRisks = useMemo(() => byAccount(risks, account), [risks, account]);
  const shownOpportunities = useMemo(() => scopedOpportunities.filter((row) => titled(row.title, q)), [scopedOpportunities, q]);
  const shownRisks = useMemo(() => scopedRisks.filter((row) => titled(row.title, q)), [scopedRisks, q]);
  const target = chosenAccount(accounts, account);
  const paused = awaitingAccount(accounts, account);
  const pausedId = useId();
  // New records go on the page's account, or the chosen chip's, or the organization.
  const addOn = {
    customerId: kindOfPage === 'organization' ? scopeId : undefined,
    accountId: kindOfPage === 'account' ? scopeId : target?.id,
  };

  const isOpps = kind === 'opportunities';
  const error = isOpps ? pipelineOpportunitiesError : pipelineRisksError;
  const busy = isOpps ? pipelineOpportunitiesLoading : pipelineRisksLoading;
  const failed = error !== null && !busy;
  const scopedCount = isOpps ? scopedOpportunities.length : scopedRisks.length;
  const shownCount = isOpps ? shownOpportunities.length : shownRisks.length;
  const board = isSm && view === 'board';

  let body: ReactNode;
  if (failed) body = <ErrorBlock message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (!loaded[kind]) body = <ListSkeleton label={isOpps ? 'Loading opportunities' : 'Loading risks'} />;
  else if (board) {
    body = isOpps ? (
      <KanbanBoard
        columns={OPPORTUNITY_STAGE_COLUMNS}
        entities={shownOpportunities}
        renderCard={(entity) => PipelineCardContent(entity, currency)}
        onCardClick={setEditingOpportunity}
        onAddClick={paused ? undefined : (stage) => setAddingOpportunity(stage)}
        onMove={(id, stage) => dispatch(updateOpportunity({ id, stage }))}
        minHeight="400px"
      />
    ) : (
      <KanbanBoard
        columns={RISK_STAGE_COLUMNS}
        entities={shownRisks}
        renderCard={(entity) => PipelineCardContent(entity, currency)}
        onCardClick={setEditingRisk}
        onAddClick={paused ? undefined : (stage) => setAddingRisk(stage)}
        onMove={(id, stage) => dispatch(updateRisk({ id, stage }))}
        minHeight="400px"
      />
    );
  } else if (scopedCount === 0) {
    body = (
      <ScopedEmpty
        what={kind}
        scope={scopeLabel(accounts, account)}
        detail={isOpps ? 'Opportunities added here show on the Pipelines board too.' : 'Risks added here show on the Pipelines board too.'}
        onShowAll={onShowAll}
      />
    );
  } else if (shownCount === 0) body = <NoMatch q={q} onClear={() => setQ('')} />;
  else {
    body = (
      <ul aria-label={isOpps ? 'Opportunities' : 'Risks'} className={LIST}>
        {isOpps
          ? shownOpportunities.map((row) => <DealItem key={row.id} deal={row} onOpen={() => setEditingOpportunity(row)} />)
          : shownRisks.map((row) => <DealItem key={row.id} deal={row} onOpen={() => setEditingRisk(row)} />)}
      </ul>
    );
  }

  const segment = (value: 'list' | 'board', label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => setView(value)}
      className={`${SEGMENT} ${view === value ? 'bg-subtle text-ink' : 'text-ink-muted hover:bg-subtle active:bg-line-subtle'}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <AccountNames.Provider value={accounts}>
      <div aria-busy={pipelineOpportunitiesLoading || pipelineRisksLoading} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Deals or risks" className="flex gap-2">
            <CountChip
              label="Opportunities"
              count={loaded.opportunities ? scopedOpportunities.length : null}
              pressed={isOpps}
              onClick={() => setKind('opportunities')}
            />
            <CountChip label="Risks" count={loaded.risks ? scopedRisks.length : null} pressed={!isOpps} onClick={() => setKind('risks')} />
          </div>
          {isSm ? (
            <div role="group" aria-label="View" className="ml-auto flex gap-1 rounded-lg border border-line p-0.5">
              {segment('list', 'List', <ListIcon className="h-4 w-4" aria-hidden="true" />)}
              {segment('board', 'Board', <LayoutGrid className="h-4 w-4" aria-hidden="true" />)}
            </div>
          ) : null}
        </div>
        <div className={isSm ? 'flex items-center gap-2' : 'flex flex-col gap-2'}>
          <ListSearch label={isOpps ? 'Search opportunities' : 'Search risks'} value={q} onChange={setQ} isSm={isSm} />
          <button
            type="button"
            onClick={() => (isOpps ? setAddingOpportunity('discovery') : setAddingRisk('open'))}
            disabled={paused}
            aria-describedby={paused ? pausedId : undefined}
            className={`${BUTTON} ${isSm ? 'ml-auto' : 'justify-center'}`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {`Add ${isOpps ? 'opportunity' : 'risk'}${target ? ` to ${target.name}` : ''}`}
          </button>
        </div>
        {paused ? <AddPaused id={pausedId} /> : null}
        {loaded[kind] && !failed && scopedCount > 0 ? (
          <SummaryLine parts={isOpps ? opportunitiesSummary(scopedOpportunities, currency) : risksSummary(scopedRisks, currency)} />
        ) : null}
        {body}

        {addingOpportunity ? (
          <OpportunityFormModal
            customerId={addOn.customerId}
            accountId={addOn.accountId}
            defaultStage={addingOpportunity}
            onClose={() => setAddingOpportunity(null)}
            onSaved={readOpportunities}
          />
        ) : null}
        {editingOpportunity ? (
          <OpportunityFormModal
            opportunity={editingOpportunity}
            onClose={() => setEditingOpportunity(null)}
            onDeleteRequest={() => {
              setDeletingOpportunity(editingOpportunity);
              setEditingOpportunity(null);
            }}
          />
        ) : null}
        {deletingOpportunity ? (
          <ConfirmDialog
            title={`Delete ${deletingOpportunity.title}?`}
            message="This can't be undone."
            confirmLabel="Delete"
            danger
            onConfirm={async () => {
              await dispatch(deleteOpportunity(deletingOpportunity.id)).unwrap();
            }}
            onClose={() => setDeletingOpportunity(null)}
          />
        ) : null}
        {addingRisk ? (
          <RiskFormModal
            customerId={addOn.customerId}
            accountId={addOn.accountId}
            defaultStage={addingRisk}
            onClose={() => setAddingRisk(null)}
            onSaved={readRisks}
          />
        ) : null}
        {editingRisk ? (
          <RiskFormModal
            risk={editingRisk}
            onClose={() => setEditingRisk(null)}
            onDeleteRequest={() => {
              setDeletingRisk(editingRisk);
              setEditingRisk(null);
            }}
          />
        ) : null}
        {deletingRisk ? (
          <ConfirmDialog
            title={`Delete ${deletingRisk.title}?`}
            message="This can't be undone."
            confirmLabel="Delete"
            danger
            onConfirm={async () => {
              await dispatch(deleteRisk(deletingRisk.id)).unwrap();
            }}
            onClose={() => setDeletingRisk(null)}
          />
        ) : null}
      </div>
    </AccountNames.Provider>
  );
}
```

Replace `src/components/organizations/detail/FilesSection.tsx` with:

```tsx
import { useId, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';
import { useAppDispatch, useAppSelector, useCapability } from '../../../hooks';
import type { Account } from '../../../features/customers/customersSlice';
import { canDeleteFile, FILE_ACCEPT } from '../../../features/files/fileFormat';
import { deleteFile, downloadAttachment, fetchFiles, uploadFile, type Attachment, type FileParent } from '../../../features/files/filesSlice';
import { awaitingAccount, byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { resolveScope, scopeSlot, type ScopeProps } from '../../../features/organizations/detailScope';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorBlock } from '../portfolio/PortfolioSections';
import { BUTTON, FOCUS } from '../portfolio/styles';
import { FileItem } from './FileItem';
import { AccountNames } from './accountNames';
import { AddPaused, ListSkeleton, ScopedEmpty } from './ListParts';
import { LIST, SECTION_HEADING } from './listStyles';

type FilesSectionProps = ScopeProps & {
  /** The chip: '' All, 'none' the organization itself, or an account id. Always '' on an account's page. */
  account: string;
  accounts: Account[];
  isSm: boolean;
  onShowAll: () => void;
};

/** Files (spec 2026-09-27 §4; account spec §2.9): the organization's own
 *  files and every visible account's, each tagged and narrowed by the account
 *  chip, or one account's own. Uploading (the button or a drop) attaches to
 *  the chosen account, or the page's account. Downloads go through the
 *  session: the API never exposes a URL a plain link could open. */
export function FilesSection(props: FilesSectionProps) {
  const { account, accounts, isSm, onShowAll } = props;
  const scope = resolveScope(props);
  const kind = scope.kind;
  const scopeId = scope.id;
  const pageAccountName = scope.kind === 'account' ? scope.name : null;
  const dispatch = useAppDispatch();
  const { items, isLoading, error, uploading, uploadError, scope: slot } = useAppSelector((state) => state.files);
  const me = useAppSelector((state) => state.auth.user);
  const isAdmin = useCapability('manage_org_settings');
  // The shared slot holds this page's files (not another's).
  const loaded = slot === scopeSlot({ kind, id: scopeId });
  const [attempt, setAttempt] = useState(0);
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const pausedId = useId();

  // Before paint, as People does.
  useLayoutEffect(() => {
    void dispatch(
      fetchFiles(kind === 'account' ? { entityType: 'account', customerId: null, accountId: scopeId } : { entityType: 'organization', customerId: scopeId }),
    );
  }, [dispatch, kind, scopeId, attempt]);

  const target = chosenAccount(accounts, account);
  const paused = awaitingAccount(accounts, account);
  const parent: FileParent =
    kind === 'account'
      ? { entityType: 'account', customerId: null, accountId: scopeId }
      : target
        ? { entityType: 'account', customerId: scopeId, accountId: target.id }
        : { entityType: 'organization', customerId: scopeId };
  const shown = byAccount(items, account);
  const failed = error !== null && !isLoading;

  async function send(files: FileList | File[]) {
    if (paused) return;
    for (const file of Array.from(files)) {
      await dispatch(uploadFile({ ...parent, file, description: description.trim() || undefined }));
    }
    setDescription('');
    if (input.current) input.current.value = '';
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void send(event.dataTransfer.files);
  }

  async function download(file: Attachment) {
    setDownloadError(null);
    try {
      await downloadAttachment(file);
    } catch {
      setDownloadError(`Could not download ${file.name}.`);
    }
  }

  let body: ReactNode;
  if (failed) body = <ErrorBlock message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (!loaded) body = <ListSkeleton label="Loading files" />;
  else if (shown.length === 0) {
    body = (
      <ScopedEmpty
        what="files"
        scope={scopeLabel(accounts, account)}
        detail="Contracts, decks and transcripts the team keeps here. Drop files on this section or use Upload file."
        onShowAll={onShowAll}
      />
    );
  } else {
    body = (
      <ul aria-label="Files" className={LIST}>
        {shown.map((file) => (
          <FileItem
            key={file.id}
            file={file}
            canDelete={canDeleteFile(file, me?.id ?? null, isAdmin)}
            onDownload={() => void download(file)}
            onDelete={() => setDeleting(file)}
          />
        ))}
      </ul>
    );
  }

  return (
    <AccountNames.Provider value={accounts}>
      <section
        aria-labelledby={headingId}
        className={`flex flex-col gap-2 rounded-xl ${dragging ? 'bg-subtle' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className={isSm ? 'flex items-end justify-between gap-3' : 'flex flex-col gap-2'}>
          <div className="min-w-0">
            <h2 id={headingId} className={SECTION_HEADING}>
              Files
            </h2>
            <p className="text-[13px] text-ink-muted">
              Up to 25 MB each. New files go on {pageAccountName ?? target?.name ?? 'the organization'}.
            </p>
          </div>
          <div className={isSm ? 'flex items-end gap-2' : 'flex flex-col gap-2'}>
            <div className="flex flex-col gap-1">
              <label htmlFor={descriptionId} className="text-[11px] font-semibold text-ink-muted">
                Description (optional)
              </label>
              <input
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={`min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[15px] text-ink sm:min-h-9 sm:w-56 sm:text-[13px] ${FOCUS}`}
              />
            </div>
            <input
              ref={input}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              tabIndex={-1}
              aria-label="Choose files"
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) void send(event.target.files);
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={uploading || paused}
              aria-describedby={paused ? pausedId : undefined}
              className={`${BUTTON} justify-center`}
            >
              <UploadCloud className="h-4 w-4" aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Upload file'}
            </button>
          </div>
        </div>
        {paused ? <AddPaused id={pausedId} /> : null}
        {uploadError || downloadError ? (
          <p role="alert" className="text-[13px] text-danger">
            {downloadError ?? uploadError}
          </p>
        ) : null}
        {body}
        {deleting ? (
          <ConfirmDialog
            title={`Delete ${deleting.name}?`}
            message="This can't be undone."
            confirmLabel="Delete"
            danger
            onConfirm={async () => {
              await dispatch(deleteFile(deleting.id)).unwrap();
            }}
            onClose={() => setDeleting(null)}
          />
        ) : null}
      </section>
    </AccountNames.Provider>
  );
}
```

Replace `src/components/organizations/detail/CallsSection.tsx` with:

```tsx
import { useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchCalls } from '../../../features/calls/callsSlice';
import type { Account } from '../../../features/customers/customersSlice';
import { awaitingAccount, byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { resolveScope, scopeSlot, type ScopeProps } from '../../../features/organizations/detailScope';
import { callsSummary } from '../../../features/organizations/listSummaries';
import { dayLabel, groupByDay, localDay } from '../../../features/organizations/storyDays';
import { ErrorBlock } from '../portfolio/PortfolioSections';
import { BUTTON } from '../portfolio/styles';
import { AddFlow } from './AddFlow';
import { CallItem } from './CallItem';
import { AccountNames } from './accountNames';
import { AddPaused, ListSkeleton, ScopedEmpty, SummaryLine } from './ListParts';
import { LIST, SECTION_HEADING } from './listStyles';

type CallsSectionProps = ScopeProps & {
  account: string;
  accounts: Account[];
  isSm: boolean;
  /** Whether the Files tab is showing: a hidden tab closes its sheet. */
  active: boolean;
  /** Bumped when the Story's + Add logs a call, so the list reads again. */
  version: number;
  /** A call was logged here; the page reads the story again. */
  onLogged: () => void;
  onShowAll: () => void;
};

/** Calls (spec 2026-09-27 §4; account spec §2.9): the organization's calls
 *  and every visible account's, narrowed by the account chip, or one
 *  account's own, as day-grouped plain rows like the Story's. No timeline
 *  rail and no scroll area of its own: the page scrolls. "Log a call" is the
 *  Story's + Add sheet, on the chosen account or the page's account. */
export function CallsSection(props: CallsSectionProps) {
  const { account, accounts, isSm, active, version, onLogged, onShowAll } = props;
  const scope = resolveScope(props);
  const kind = scope.kind;
  const scopeId = scope.id;
  const pageAccountName = scope.kind === 'account' ? scope.name : undefined;
  const dispatch = useAppDispatch();
  const { items, isLoading, error, scope: slot } = useAppSelector((state) => state.calls);
  // The shared slot holds this page's calls (not another's).
  const loaded = slot === scopeSlot({ kind, id: scopeId });
  const [attempt, setAttempt] = useState(0);
  const [logging, setLogging] = useState(false);
  if (!active && logging) setLogging(false);
  const headingId = useId();
  const pausedId = useId();

  // Before paint, as People does.
  useLayoutEffect(() => {
    void dispatch(
      fetchCalls(kind === 'account' ? { entityType: 'account', customerId: null, accountId: scopeId } : { entityType: 'organization', customerId: scopeId }),
    );
  }, [dispatch, kind, scopeId, version, attempt]);

  const target = chosenAccount(accounts, account);
  const paused = awaitingAccount(accounts, account);
  const shown = useMemo(() => byAccount(items, account), [items, account]);
  const days = useMemo(() => groupByDay(shown.map((call) => ({ ...call, all_day: false }))), [shown]);
  const today = localDay(new Date());
  const failed = error !== null && !isLoading;

  let body: ReactNode;
  if (failed) body = <ErrorBlock message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (!loaded) body = <ListSkeleton label="Loading calls" />;
  else if (shown.length === 0) {
    body = (
      <ScopedEmpty
        what="calls"
        scope={scopeLabel(accounts, account)}
        detail="Calls logged here or from a recorder arrive with their summaries."
        onShowAll={onShowAll}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <div key={day.key}>
            <h3 className={`mb-1.5 px-1 ${SECTION_HEADING}`}>{dayLabel(day.key, today)}</h3>
            <ul className={LIST}>
              {day.items.map((call) => (
                <CallItem key={call.id} call={call} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <AccountNames.Provider value={accounts}>
      <section aria-labelledby={headingId} aria-busy={isLoading} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={headingId} className={SECTION_HEADING}>
            Calls
          </h2>
          <button
            type="button"
            onClick={() => setLogging(true)}
            disabled={paused}
            aria-describedby={paused ? pausedId : undefined}
            className={BUTTON}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Log a call
          </button>
        </div>
        {paused ? <AddPaused id={pausedId} /> : null}
        {loaded && !failed && shown.length > 0 ? <SummaryLine parts={callsSummary(shown)} /> : null}
        {body}
        {active && logging ? (
          <AddFlow
            what="call"
            customerId={kind === 'organization' ? scopeId : undefined}
            accountId={kind === 'account' ? scopeId : target?.id}
            accountName={pageAccountName ?? target?.name}
            isSm={isSm}
            onClose={() => setLogging(false)}
            onAdded={() => {
              setLogging(false);
              onLogged();
            }}
          />
        ) : null}
      </section>
    </AccountNames.Provider>
  );
}
```

Replace `src/components/organizations/detail/FilesCallsTab.tsx` with:

```tsx
import type { Account } from '../../../features/customers/customersSlice';
import { resolveScope, scopeProps, type ScopeProps } from '../../../features/organizations/detailScope';
import { CallsSection } from './CallsSection';
import { FilesSection } from './FilesSection';

type FilesCallsTabProps = ScopeProps & {
  account: string;
  accounts: Account[];
  isSm: boolean;
  /** Whether this tab is showing (it stays mounted, hidden, once visited). */
  active: boolean;
  /** Bumped when the Story's + Add logs a call, so the calls read again. */
  callsVersion?: number;
  /** A call was logged on this tab. */
  onCallLogged: () => void;
  onShowAll: () => void;
};

/** Files (spec 2026-09-27 §4; account spec §2.9): two sections, Files then
 *  Calls — the organization's own records and every visible account's,
 *  tagged and narrowed by the account chip, or one account's own. */
export function FilesCallsTab(props: FilesCallsTabProps) {
  const { account, accounts, isSm, active, callsVersion = 0, onCallLogged, onShowAll } = props;
  const where = scopeProps(resolveScope(props));
  return (
    <div className="flex flex-col gap-6">
      <FilesSection {...where} account={account} accounts={accounts} isSm={isSm} onShowAll={onShowAll} />
      <CallsSection
        {...where}
        account={account}
        accounts={accounts}
        isSm={isSm}
        active={active}
        version={callsVersion}
        onLogged={onCallLogged}
        onShowAll={onShowAll}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass, and the organisation page's still do**

Run: `npx vitest run --maxWorkers=2 src/components/accounts/detail/lists.test.tsx src/components/organizations/detail src/pages/organizations src/e2e`
Expected: PASS, 0 failed.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/PeopleTab.tsx src/components/organizations/detail/DealsTab.tsx src/components/organizations/detail/FilesSection.tsx src/components/organizations/detail/CallsSection.tsx src/components/organizations/detail/FilesCallsTab.tsx src/components/accounts/detail/lists.test.tsx
git commit -m "$(cat <<'EOF'
refactor(organizations): People, Deals & risks and Files on one account

Each list reads either an organization's roll-up (customerId, as before) or
one account's own records by its flat routes, waits for its own slot, and
adds on the page's account.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The name row, the tiles and the account pulse

**Files:**
- Create: `src/components/organizations/detail/Skeletons.tsx`, `src/components/organizations/detail/usePanelJump.ts`, `src/components/organizations/detail/usePanelJump.test.tsx`, `src/components/accounts/detail/useAccount.ts`, `src/components/accounts/detail/useAccount.test.tsx`, `src/components/accounts/detail/AccountHeader.tsx`, `src/components/accounts/detail/AccountHeader.test.tsx`, `src/components/accounts/detail/AccountPulseBreakdown.tsx`, `src/components/accounts/detail/AccountTiles.tsx`, `src/components/accounts/detail/AccountTiles.test.tsx`
- Modify: `src/components/organizations/detail/HeaderTiles.tsx` (whole file), `src/pages/organizations/Details.tsx` (imports, the two skeletons, the jump block)

**Interfaces:**
- Consumes (Task 3): `stubAccountPage`, `pizzaEmeaRecord`. Delivery 1: `fetchAccountPortfolio`, `AccountPortfolioRow`, `pizzaEmea`, `initechApac`, `rowParts` (`HealthRing`, `TrendLine`, `RenewalRunway`, `PulsePair`, `SignalTag`, `touchText`, `renewalText`), `Menu`, `BUTTON`/`FOCUS`/`QUIET`.
- Produces:
  - `TabSkeleton({ label }: { label: string })`, `HeaderSkeleton({ isSm, label }: { isSm: boolean; label: string })`.
  - `usePanelJump(onDetails: boolean, ready: boolean, openDetails: () => void): (panel: PanelKey) => void`.
  - `DetailTiles({ row: PortfolioRowBase; arr: string; arrNote: string; renewalPanel: 'contract' | 'commercial'; breakdownWord: string; breakdown: (id: string) => ReactNode; isSm: boolean; onJump: (panel: PanelKey) => void })`; `HeaderTiles` keeps its props and output.
  - `useAccount(id: number | null, version: number): AccountState` with `AccountState = { row: AccountPortfolioRow | null; currency: CurrencyCode; account: Account | null; loading: boolean; notFound: boolean; error: string | null; accountError: string | null; retry: () => void }`.
  - `AccountHeader({ row: AccountPortfolioRow; canEdit: boolean; editError?: string | null; onRetryEdit?: () => void; onEdit: () => void; onAddContact: () => void; onLogCall: () => void; onNewTask: () => void })`.
  - `AccountPulseBreakdown({ id: string; pulse: AccountPulse | null; error: string | null })`.
  - `AccountTiles({ row: AccountPortfolioRow; currency: CurrencyCode; account: Account | null; accountError: string | null; isSm: boolean; onJump: (panel: PanelKey) => void })`.

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/detail/usePanelJump.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { usePanelJump } from './usePanelJump';

function Harness({ onDetails, ready, openDetails }: { onDetails: boolean; ready: boolean; openDetails: () => void }) {
  const jump = usePanelJump(onDetails, ready, openDetails);
  return (
    <>
      <button type="button" onClick={() => jump('commercial')}>
        Jump
      </button>
      {onDetails ? <section data-panel="commercial">Commercial</section> : null}
    </>
  );
}

describe('usePanelJump', () => {
  it('opens Details, then focuses the panel once Details shows and the row is there', async () => {
    const openDetails = vi.fn();
    const { rerender } = render(<Harness onDetails={false} ready={false} openDetails={openDetails} />);
    await userEvent.click(screen.getByRole('button', { name: 'Jump' }));
    expect(openDetails).toHaveBeenCalledOnce();
    rerender(<Harness onDetails ready={false} openDetails={openDetails} />);
    expect(screen.getByText('Commercial')).not.toHaveFocus();
    rerender(<Harness onDetails ready openDetails={openDetails} />);
    expect(screen.getByText('Commercial')).toHaveFocus();
    expect(screen.getByText('Commercial')).toHaveAttribute('tabindex', '-1');
  });

  it('moves again on a second jump while already on Details', async () => {
    const openDetails = vi.fn();
    render(<Harness onDetails ready openDetails={openDetails} />);
    await userEvent.click(screen.getByRole('button', { name: 'Jump' }));
    expect(screen.getByText('Commercial')).toHaveFocus();
    screen.getByRole('button', { name: 'Jump' }).focus();
    await userEvent.click(screen.getByRole('button', { name: 'Jump' }));
    expect(screen.getByText('Commercial')).toHaveFocus();
    expect(openDetails).toHaveBeenCalledTimes(2);
  });
});
```

`src/components/accounts/detail/useAccount.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { stubAccountPage } from '../../../features/accounts/testAccountPage';
import { requestPaths } from '../../../features/organizations/testStory';
import { useAccount } from './useAccount';

type Spy = ReturnType<typeof stubAccountPage>;
const portfolioQuery = (spy: Spy) =>
  spy.mock.calls.map(([input]) => new URL(String(input))).find((url) => url.pathname.endsWith('/accounts/portfolio/'))!.searchParams;

describe('useAccount', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the portfolio row by id and the record beside it, by the id alone', async () => {
    const spy = stubAccountPage();
    const { result } = renderHook(() => useAccount(12, 0));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza EMEA'));
    await waitFor(() => expect(result.current.account?.owner?.name).toBe('Carl CSM'));
    expect(result.current.currency).toBe('USD');
    expect(result.current.notFound).toBe(false);
    expect(Object.fromEntries(portfolioQuery(spy))).toEqual({ ids: '12', limit: '1' });
    expect([...requestPaths(spy)].sort()).toEqual(['GET /accounts/12/', 'GET /accounts/portfolio/']);
  });

  it('is not found when the viewer may not open it, or there is no id', async () => {
    stubAccountPage({ row: null });
    const { result } = renderHook(() => useAccount(12, 0));
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.row).toBeNull();
    expect(renderHook(() => useAccount(null, 0)).result.current.notFound).toBe(true);
  });

  it('keeps the last row while a new version reads, says so if that read fails, and retries', async () => {
    stubAccountPage();
    const { result, rerender } = renderHook(({ version }) => useAccount(12, version), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza EMEA'));
    stubAccountPage({ failPortfolio: 1 });
    rerender({ version: 1 });
    await waitFor(() => expect(result.current.error).toBe('Try later.'));
    expect(result.current.row?.name).toBe('Pizza EMEA');
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.row?.name).toBe('Pizza EMEA');
  });
});
```

`src/components/accounts/detail/AccountHeader.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { initechApac, pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountHeader } from './AccountHeader';

function renderHeader({ row = pizzaEmea as AccountPortfolioRow, canEdit = true, editError = null as string | null } = {}) {
  const handlers = { onEdit: vi.fn(), onAddContact: vi.fn(), onLogCall: vi.fn(), onNewTask: vi.fn(), onRetryEdit: vi.fn() };
  render(
    <MemoryRouter>
      <AccountHeader row={row} canEdit={canEdit} editError={editError} {...handlers} />
    </MemoryRouter>,
  );
  return handlers;
}

describe('AccountHeader (spec 2026-09-29 §2.2)', () => {
  it('shows initials, the name, owner · lifecycle · last touch and the signal', () => {
    renderHeader();
    expect(screen.getByRole('heading', { level: 1, name: 'Pizza EMEA' })).toBeInTheDocument();
    expect(screen.getByText('PE')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Carl CSM').closest('p')).toHaveTextContent('Carl CSM · Live · Touched 33d ago');
    expect(screen.getByText('Renewal overdue')).toBeInTheDocument();
  });

  it('links each organisation the viewer may open, with this account chosen', () => {
    renderHeader();
    const partOf = document.querySelector('[data-part="part-of"]') as HTMLElement;
    expect(within(partOf).getByText('Part of')).toBeInTheDocument();
    expect(within(partOf).getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Pizza Hut', '/organizations/7?account=12'],
      ['Yum Brands', '/organizations/9?account=12'],
    ]);
  });

  it('names no organisation when the viewer may open none, and says Unassigned', () => {
    renderHeader({ row: initechApac });
    expect(document.querySelector('[data-part="part-of"]')).toBeNull();
    expect(screen.getByText('Unassigned').closest('p')).toHaveTextContent('Unassigned · Churn · Never contacted');
  });

  it('holds Edit until the record lands, and says why when it failed', async () => {
    const { onEdit, onRetryEdit } = renderHeader({ canEdit: false, editError: 'Try later.' });
    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription('Edit is unavailable: Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryEdit).toHaveBeenCalledOnce();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('⋯ holds Add contact, Log a call and New task', async () => {
    const { onAddContact, onLogCall, onNewTask, onEdit } = renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
    const more = screen.getByRole('button', { name: 'More actions for Pizza EMEA' });
    await userEvent.click(more);
    const menu = screen.getByRole('menu', { name: 'More actions for Pizza EMEA' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Add contact', 'Log a call', 'New task']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Add contact' }));
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log a call' }));
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    expect([onAddContact, onLogCall, onNewTask].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });
});
```

`src/components/accounts/detail/AccountTiles.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Account } from '../../../features/customers/customersSlice';
import { pizzaEmeaRecord } from '../../../features/accounts/testAccountPage';
import { pizzaEmea } from '../../../features/accounts/testPortfolio';
import { AccountTiles } from './AccountTiles';

function renderTiles({ account = pizzaEmeaRecord as Account | null, accountError = null as string | null, isSm = true } = {}) {
  const onJump = vi.fn();
  render(<AccountTiles row={pizzaEmea} currency="USD" account={account} accountError={accountError} isSm={isSm} onJump={onJump} />);
  return onJump;
}

describe('AccountTiles (spec 2026-09-29 §2.3)', () => {
  it('shows health as a ring and a trend, ARR in the workspace currency, the runway and the pulse pair', () => {
    renderTiles();
    expect(screen.getByRole('img', { name: 'Health 4.9, Average' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Health falling from 6\.2 to 4\.9/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ARR $69.6K. Show commercial details' })).toBeInTheDocument();
    expect(screen.getByText('Annual, in USD')).toBeInTheDocument();
    expect(screen.getByText('47d overdue')).toBeInTheDocument();
    expect(screen.getByText('9 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('AI 1 · CSM 3')).toBeInTheDocument();
    expect(screen.getByText('pulses disagree')).toBeInTheDocument();
  });

  it('ARR and Renewal jump to Commercial, Pulse to the voice of the customer', async () => {
    const onJump = renderTiles();
    await userEvent.click(screen.getByRole('button', { name: /^ARR/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Renewal 47d overdue. Show the renewal timeline' }));
    await userEvent.click(screen.getByRole('button', { name: /^Pulse/ }));
    expect(onJump.mock.calls.map(([panel]) => panel)).toEqual(['commercial', 'commercial', 'voice']);
  });

  it('Health opens the account pulse, signal by signal', async () => {
    renderTiles();
    const health = screen.getByRole('button', { name: 'Health 4.9, Average. Show the account pulse' });
    expect(health).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(health);
    const pulse = screen.getByRole('region', { name: 'Account pulse' });
    expect(health).toHaveAttribute('aria-controls', pulse.id);
    expect(pulse).toHaveTextContent('Account pulse: At risk · 2.4 / 5');
    expect(within(pulse).getAllByRole('listitem')).toHaveLength(5);
    expect(within(pulse).getByText('AI pulse').closest('li')).toHaveTextContent('1.0/5 · Poor');
    expect(within(pulse).getByText('AI pulse').closest('li')).toHaveTextContent('High Risk');
    expect(within(pulse).getByText('CSM pulse').closest('li')).toHaveTextContent('3.0/5 · Average');
    expect(within(pulse).getByText('Open tickets').closest('li')).toHaveTextContent('No data');
    expect(pulse).toHaveTextContent('An account has no health rubric');
    await userEvent.click(screen.getByRole('button', { name: 'Health 4.9, Average. Hide the account pulse' }));
    expect(screen.queryByRole('region', { name: 'Account pulse' })).not.toBeInTheDocument();
  });

  it('says so while the record loads, and when it failed', async () => {
    renderTiles({ account: null });
    await userEvent.click(screen.getByRole('button', { name: /^Health/ }));
    expect(screen.getByRole('status', { name: 'Loading the account pulse' })).toBeInTheDocument();
  });

  it('shows the read\'s failure in place of the pulse', async () => {
    renderTiles({ account: null, accountError: 'Try later.' });
    await userEvent.click(screen.getByRole('button', { name: /^Health/ }));
    expect(within(screen.getByRole('region', { name: 'Account pulse' })).getByRole('alert')).toHaveTextContent('Try later.');
  });

  it('is a snapping strip on phones', () => {
    renderTiles({ isSm: false });
    expect(screen.getByRole('button', { name: /^ARR/ }).parentElement).toHaveClass('snap-x', 'snap-mandatory', 'overflow-x-auto');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/organizations/detail/usePanelJump.test.tsx src/components/accounts/detail/useAccount.test.tsx src/components/accounts/detail/AccountHeader.test.tsx src/components/accounts/detail/AccountTiles.test.tsx`
Expected: FAIL, each on "Failed to resolve import" (`./usePanelJump`, `./useAccount`, `./AccountHeader`, `./AccountTiles`).

- [ ] **Step 3: Implement**

Create `src/components/organizations/detail/Skeletons.tsx`:

```tsx
/** A tab's content before the page's row lands. */
export function TabSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {[0, 1].map((i) => (
        <div key={i} aria-hidden="true" className="flex flex-col gap-2 rounded-xl bg-surface p-3">
          <span className="block h-3 w-32 animate-pulse rounded bg-subtle" />
          <span className="block h-3 w-full animate-pulse rounded bg-subtle" />
          <span className="block h-3 w-2/3 animate-pulse rounded bg-subtle" />
        </div>
      ))}
    </div>
  );
}

/** The name row and the four tiles before the page's row lands: a grid of
 *  four from sm, a strip on phones, as the tiles themselves. */
export function HeaderSkeleton({ isSm, label }: { isSm: boolean; label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <div aria-hidden="true" className="flex items-center gap-3">
        <span className="h-11 w-11 animate-pulse rounded-full bg-subtle" />
        <span className="flex flex-col gap-1.5">
          <span className="block h-5 w-48 animate-pulse rounded bg-subtle" />
          <span className="block h-3 w-64 animate-pulse rounded bg-subtle" />
        </span>
      </div>
      <div aria-hidden="true" className={isSm ? 'grid grid-cols-4 gap-3' : 'flex gap-3 overflow-hidden'}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="block h-24 min-w-[11rem] animate-pulse rounded-xl bg-surface sm:min-w-0" />
        ))}
      </div>
    </div>
  );
}
```

Create `src/components/organizations/detail/usePanelJump.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelKey } from '../../../features/organizations/portfolioFields';

/** A tile jumps to its Details panel: `openDetails` switches the tab, then,
 *  once Details shows and the page's row has landed (`ready`), the panel
 *  (`[data-panel="<key>"]`) scrolls into view and takes focus. Each jump is
 *  numbered, so a second jump while already on Details still moves. */
export function usePanelJump(onDetails: boolean, ready: boolean, openDetails: () => void): (panel: PanelKey) => void {
  const [jump, setJump] = useState<{ panel: PanelKey; n: number } | null>(null);
  const handled = useRef(0);
  const jumpTo = useCallback(
    (panel: PanelKey) => {
      setJump((prev) => ({ panel, n: (prev?.n ?? 0) + 1 }));
      openDetails();
    },
    [openDetails],
  );
  useEffect(() => {
    if (!jump || jump.n === handled.current || !onDetails || !ready) return;
    handled.current = jump.n;
    const section = document.querySelector<HTMLElement>(`[data-panel="${jump.panel}"]`);
    if (!section) return;
    section.setAttribute('tabindex', '-1');
    section.scrollIntoView?.({ block: 'start' });
    section.focus();
  }, [jump, onDetails, ready]);
  return jumpTo;
}
```

In `src/pages/organizations/Details.tsx`:
- Change the React import to `import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';` (no `useRef`), delete `import type { PanelKey } from '../../features/organizations/portfolioFields';`, and add `import { HeaderSkeleton, TabSkeleton } from '../../components/organizations/detail/Skeletons';` and `import { usePanelJump } from '../../components/organizations/detail/usePanelJump';`.
- Delete the local `TabSkeleton` and `HeaderSkeleton` functions.
- Replace the block from `// A tile jumps to its Details panel: the tab switches, then the` down to the end of its `useEffect` (`}, [jump, params.tab, org.row]);`) with:

```ts
  // A tile jumps to its Details panel (usePanelJump).
  const openDetails = useCallback(() => update({ tab: 'details' }), [update]);
  const jumpTo = usePanelJump(params.tab === 'details', org.row !== null, openDetails);
```

- Replace `<HeaderSkeleton isSm={isSm} />` with `<HeaderSkeleton isSm={isSm} label="Loading organization" />`.

Replace `src/components/organizations/detail/HeaderTiles.tsx` with:

```tsx
import { useId, useState, type ReactNode } from 'react';
import type { Customer } from '../../../features/customers/customersSlice';
import { formatCompactMoney, formatDate } from '../../../features/customers/formatters';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import { HEALTH_LABEL } from '../../../features/organizations/portfolioLabels';
import type { PortfolioRow, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import { HealthRing, PulsePair, RenewalRunway, TrendLine, renewalText } from '../portfolio/rowParts';
import { FOCUS } from '../portfolio/styles';
import { HealthBreakdown } from './HealthBreakdown';

const TILE = `flex min-w-[11rem] shrink-0 snap-start flex-col gap-2 rounded-xl bg-surface p-3 text-left hover:bg-subtle active:bg-line-subtle sm:min-w-0 ${FOCUS}`;

function Title({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{children}</span>;
}

/** The four tiles on either detail page (organisation spec §1.3; account
 *  spec §2.3). Health opens what the page breaks it into below them; ARR,
 *  Renewal and Pulse jump to their Details panel. From `sm` a grid that
 *  wraps to its own column, not the window (`@container`): four across once
 *  the column is 36rem wide, two beside the open rail on a narrow window. A
 *  strip that snaps sideways on phones. */
export function DetailTiles({
  row,
  arr,
  arrNote,
  renewalPanel,
  breakdownWord,
  breakdown,
  isSm,
  onJump,
}: {
  row: PortfolioRowBase;
  /** ARR as the page prints it, "—" when there is none. */
  arr: string;
  /** The line under it: which figure, in which currency. */
  arrNote: string;
  /** Where Renewal jumps: the organization's contract timeline, or the account's Commercial panel. */
  renewalPanel: 'contract' | 'commercial';
  /** What Health opens, in words: "breakdown", "account pulse". */
  breakdownWord: string;
  /** What Health opens, given the id its button controls. */
  breakdown: (id: string) => ReactNode;
  isSm: boolean;
  onJump: (panel: PanelKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const breakdownId = useId();
  const pulse = row.pulse;
  const pulseWords = `AI ${pulse.ai ?? 'not set'}, CSM ${pulse.csm ?? 'not set'}${pulse.disagree ? ', pulses disagree' : ''}`;
  const band = HEALTH_LABEL[row.health.category];
  const renewalHint = renewalPanel === 'contract' ? 'Show the contract timeline' : 'Show the renewal timeline';

  return (
    <div className="@container flex flex-col gap-3">
      <div
        className={
          isSm ? 'grid grid-cols-2 gap-3 @min-[36rem]:grid-cols-4' : '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4'
        }
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={open ? breakdownId : undefined}
          aria-label={`Health ${row.health.score.toFixed(1)}, ${band}. ${open ? 'Hide' : 'Show'} the ${breakdownWord}`}
          className={TILE}
        >
          <Title>Health</Title>
          <span className="flex items-center gap-3">
            <HealthRing score={row.health.score} category={row.health.category} />
            <TrendLine trend={row.health.trend} category={row.health.category} />
          </span>
          <span className="text-[11px] text-ink-muted">
            {band} · {open ? 'Hide' : 'Show'} {breakdownWord}
          </span>
        </button>

        <button type="button" onClick={() => onJump('commercial')} aria-label={`ARR ${arr}. Show commercial details`} className={TILE}>
          <Title>ARR</Title>
          <span className="font-mono-brand text-[22px] leading-tight tabular-nums text-ink">{arr}</span>
          <span className="text-[11px] text-ink-muted">{arrNote}</span>
        </button>

        <button
          type="button"
          onClick={() => onJump(renewalPanel)}
          aria-label={`Renewal ${renewalText(row.renewal.days)}. ${renewalHint}`}
          className={TILE}
        >
          <Title>Renewal</Title>
          <RenewalRunway renewal={row.renewal} className="flex" />
          <span className="text-[11px] text-ink-muted">{row.renewal.date ? formatDate(row.renewal.date) : 'No renewal date'}</span>
        </button>

        <button type="button" onClick={() => onJump('voice')} aria-label={`Pulse ${pulseWords}. Show the voice of the customer`} className={TILE}>
          <Title>Pulse</Title>
          <PulsePair pulse={pulse} className="flex" />
        </button>
      </div>
      {open ? breakdown(breakdownId) : null}
    </div>
  );
}

/** The organization page's tiles (spec §1.3): ARR billed at the account in
 *  the customer's own currency; Health opens the five-part rubric. */
export function HeaderTiles({
  row,
  customer,
  customerError,
  isSm,
  onJump,
}: {
  row: PortfolioRow;
  customer: Customer | null;
  customerError: string | null;
  isSm: boolean;
  onJump: (panel: PanelKey) => void;
}) {
  const commercial = row.details.commercial;
  const arr = commercial.arr_billed_at_account == null ? '—' : formatCompactMoney(commercial.arr_billed_at_account, commercial.currency);
  return (
    <DetailTiles
      row={row}
      arr={arr}
      arrNote={`Billed at account, in ${commercial.currency}`}
      renewalPanel="contract"
      breakdownWord="breakdown"
      breakdown={(id) => <HealthBreakdown id={id} customer={customer} error={customerError} />}
      isSm={isSm}
      onJump={onJump}
    />
  );
}
```

Create `src/components/accounts/detail/useAccount.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import { fetchAccountPortfolio } from '../../../features/accounts/portfolioApi';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import type { Account } from '../../../features/customers/customersSlice';
import { apiFetch } from '../../../lib/apiClient';
import { errorMessage } from '../../organizations/portfolio/usePortfolio';

type RowLoad = { key: string; row: AccountPortfolioRow | null; currency: CurrencyCode } | { key: string; error: string };
type RecordLoad = { key: string; account: Account } | { key: string; error: string };

export interface AccountState {
  /** The Accounts list's row for this account; null until it lands, or when
   *  not found. The last one that landed stays while a reload runs or fails. */
  row: AccountPortfolioRow | null;
  /** The workspace's currency, which the row's ARR is in. */
  currency: CurrencyCode;
  /** GET /accounts/<id>/: the owner and their function, the account pulse and the edit form's record. */
  account: Account | null;
  /** The row for the current id and version has not landed (or failed) yet. */
  loading: boolean;
  /** Not a number, or the viewer may not open it (no row for its id). */
  notFound: boolean;
  error: string | null;
  accountError: string | null;
  retry: () => void;
}

/** The account page's two reads (spec 2026-09-29 §2), by the URL id alone
 *  and fired together: the portfolio row by `ids` and the record. A new
 *  `version` (after an edit or an owner change) reloads both while the old
 *  row stays on screen; a row for another id never shows. */
export function useAccount(id: number | null, version: number): AccountState {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${version}#${attempt}`;
  const [rowLoad, setRowLoad] = useState<RowLoad | null>(null);
  const [last, setLast] = useState<{ row: AccountPortfolioRow; currency: CurrencyCode } | null>(null);
  const [recordLoad, setRecordLoad] = useState<RecordLoad | null>(null);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    fetchAccountPortfolio(new URLSearchParams({ ids: String(id), limit: '1' }).toString()).then(
      (data) => {
        if (cancelled) return;
        const found = data.results.find((row) => row.id === id) ?? null;
        setRowLoad({ key, row: found, currency: data.currency });
        setLast(found ? { row: found, currency: data.currency } : null);
      },
      (err: unknown) => {
        if (!cancelled) setRowLoad({ key, error: errorMessage(err, 'Could not load this account.') });
      },
    );
    apiFetch<Account>(`/accounts/${id}/`).then(
      (account) => {
        if (!cancelled) setRecordLoad({ key, account });
      },
      (err: unknown) => {
        if (!cancelled) setRecordLoad({ key, error: errorMessage(err, 'Could not load this account\'s record.') });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const shown = rowLoad && 'row' in rowLoad ? rowLoad : null;
  const current = last && last.row.id === id ? last : null;
  const account = recordLoad && 'account' in recordLoad && recordLoad.account.id === id ? recordLoad.account : null;
  return {
    row: current?.row ?? null,
    currency: current?.currency ?? 'USD',
    account,
    loading: id !== null && rowLoad?.key !== key,
    notFound: id === null || (shown !== null && shown.key === key && shown.row === null),
    error: rowLoad && 'error' in rowLoad && rowLoad.key === key ? rowLoad.error : null,
    accountError: recordLoad && 'error' in recordLoad && recordLoad.key === key ? recordLoad.error : null,
    retry,
  };
}
```

Create `src/components/accounts/detail/AccountHeader.tsx`:

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Ellipsis, Pencil } from 'lucide-react';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { Menu } from '../../organizations/detail/Menu';
import { SignalTag, touchText } from '../../organizations/portfolio/rowParts';
import { BUTTON, FOCUS, QUIET } from '../../organizations/portfolio/styles';

const PART_OF_LINK = `inline-flex min-h-11 items-center rounded-sm text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`;

/** The account page's name row (spec 2026-09-29 §2.2): initials (never a
 *  third-party logo), the name, owner · lifecycle · last touch, the signal,
 *  then "Part of" with one link per linked organisation the viewer may open
 *  (the row lists only those; a hidden one is never named or counted). Edit
 *  and ⋯ (Add contact, Log a call, New task) on the right. */
export function AccountHeader({
  row,
  canEdit,
  editError = null,
  onRetryEdit,
  onEdit,
  onAddContact,
  onLogCall,
  onNewTask,
}: {
  row: AccountPortfolioRow;
  /** The account record has landed, so the edit form can open. */
  canEdit: boolean;
  /** Why the record did not land; shown as Edit's reason while it is off. */
  editError?: string | null;
  onRetryEdit?: () => void;
  onEdit: () => void;
  onAddContact: () => void;
  onLogCall: () => void;
  onNewTask: () => void;
}) {
  const reasonId = useId();
  const blocked = !canEdit && editError ? editError : null;
  const organisations = row.details.profile.organisations;
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-subtle font-mono-brand text-[13px] font-semibold text-ink"
      >
        {row.initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h1 data-field="account" className="min-w-0 truncate text-[22px] font-semibold leading-tight text-ink">
            {row.name}
          </h1>
          <SignalTag signal={row.signal} />
        </div>
        <p className="truncate text-[13px] text-ink-muted">
          <span data-field="owner">{row.owner?.name ?? 'Unassigned'}</span> ·{' '}
          <span data-field="lifecycleStage">{row.lifecycle.label}</span> · {touchText(row.last_touch_days)}
        </p>
        {organisations.length ? (
          <p data-part="part-of" className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-ink-muted">
            <span>Part of</span>
            {organisations.map((organisation, index) => (
              <span key={organisation.id} className="inline-flex items-center">
                <Link to={`/organizations/${organisation.id}?account=${row.id}`} className={PART_OF_LINK}>
                  {organisation.name}
                </Link>
                {index < organisations.length - 1 ? <span aria-hidden="true">,</span> : null}
              </span>
            ))}
          </p>
        ) : null}
        {blocked ? (
          <p role="alert" className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-danger">
            <span id={reasonId}>Edit is unavailable: {blocked}</span>
            {onRetryEdit ? (
              <button type="button" onClick={onRetryEdit} className={QUIET}>
                Try again
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onEdit}
          disabled={!canEdit}
          aria-describedby={blocked ? reasonId : undefined}
          className={`${BUTTON} min-w-11 justify-center sm:min-w-0`}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {/* Icon-only below sm: the name gets the room. */}
          <span className="sr-only sm:not-sr-only">Edit</span>
        </button>
        <Menu
          label={`More actions for ${row.name}`}
          trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />}
          triggerClassName={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:bg-subtle active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`}
          items={[
            { key: 'contact', label: 'Add contact', onSelect: onAddContact },
            { key: 'call', label: 'Log a call', onSelect: onLogCall },
            { key: 'task', label: 'New task', onSelect: onNewTask },
          ]}
        />
      </div>
    </div>
  );
}
```

Create `src/components/accounts/detail/AccountPulseBreakdown.tsx`:

```tsx
import type { AccountPulse, AccountPulseReading } from '../../../features/customers/customersSlice';

/** A 1–5 reading's share of the scale, in the rubric's own bands and in words. */
function tone(reading: number): { word: string; bar: string } {
  const ratio = (reading - 1) / 4;
  if (ratio >= 0.7) return { word: 'Good', bar: 'bg-success' };
  if (ratio >= 0.4) return { word: 'Average', bar: 'bg-warning' };
  return { word: 'Poor', bar: 'bg-danger' };
}

const ROW = 'grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]';

function Reading({ reading }: { reading: AccountPulseReading }) {
  const value = reading.reading == null ? null : Number(reading.reading);
  const band = value == null ? null : tone(value);
  return (
    <li className="flex flex-col gap-0.5">
      <div className={`${ROW} ${band ? '' : 'text-ink-muted'}`}>
        <span className={`truncate ${band ? 'text-ink' : ''}`}>{reading.label}</span>
        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-line">
          {band && value != null ? <span className={`block h-full ${band.bar}`} style={{ width: `${((value - 1) / 4) * 100}%` }} /> : null}
        </span>
        {band ? (
          <span className="text-ink-muted">
            <span className="font-mono-brand tabular-nums text-ink">{reading.reading}</span>/5 · {band.word}
          </span>
        ) : (
          <span>No data</span>
        )}
      </div>
      <p className="text-[11px] text-ink-muted">{reading.note}</p>
    </li>
  );
}

/** What the Health tile opens on an account (decision 3): an account's
 *  health is set on the account with no component rubric, so the per-signal
 *  view it has is its pulse (`account_pulse` from GET /accounts/<id>/: AI
 *  pulse, CSM pulse, recent sentiment, last contact, open tickets). */
export function AccountPulseBreakdown({ id, pulse, error }: { id: string; pulse: AccountPulse | null; error: string | null }) {
  return (
    <section id={id} aria-label="Account pulse" className="rounded-xl bg-surface p-3">
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : !pulse ? (
        <div role="status" aria-label="Loading the account pulse" className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} aria-hidden="true" className="block h-3 w-full animate-pulse rounded bg-subtle" />
          ))}
        </div>
      ) : (
        <>
          <p className="mb-2 text-[13px] text-ink">
            Account pulse: <span className="font-semibold">{pulse.label}</span>
            {pulse.value ? (
              <>
                {' · '}
                <span className="font-mono-brand tabular-nums">{pulse.value}</span> / 5
              </>
            ) : null}
          </p>
          <ul className="flex flex-col gap-2">
            {pulse.breakdown.map((reading) => (
              <Reading key={reading.key} reading={reading} />
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-muted">
            An account has no health rubric: its score is set on the account. These are the signals behind how the relationship feels
            now.
          </p>
        </>
      )}
    </section>
  );
}
```

Create `src/components/accounts/detail/AccountTiles.tsx`:

```tsx
import type { CurrencyCode } from '../../../features/auth/authSlice';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import type { Account } from '../../../features/customers/customersSlice';
import { formatCompactMoney } from '../../../features/customers/formatters';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import { DetailTiles } from '../../organizations/detail/HeaderTiles';
import { AccountPulseBreakdown } from './AccountPulseBreakdown';

/** The account page's four tiles (spec 2026-09-29 §2.3): ARR in the
 *  workspace's currency, Renewal to the Commercial panel (where an account's
 *  renewal date lives), Health opening the account pulse. */
export function AccountTiles({
  row,
  currency,
  account,
  accountError,
  isSm,
  onJump,
}: {
  row: AccountPortfolioRow;
  currency: CurrencyCode;
  /** GET /accounts/<id>/; null while it loads or when it failed. */
  account: Account | null;
  accountError: string | null;
  isSm: boolean;
  onJump: (panel: PanelKey) => void;
}) {
  const arr = row.arr == null ? '—' : formatCompactMoney(row.arr, currency);
  return (
    <DetailTiles
      row={row}
      arr={arr}
      arrNote={`Annual, in ${currency}`}
      renewalPanel="commercial"
      breakdownWord="account pulse"
      breakdown={(id) => <AccountPulseBreakdown id={id} pulse={account?.account_pulse ?? null} error={accountError} />}
      isSm={isSm}
      onJump={onJump}
    />
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass, and the organisation page's still do**

Run: `npx vitest run --maxWorkers=2 src/components/organizations/detail src/components/accounts/detail src/pages/organizations src/e2e`
Expected: PASS, 0 failed (`HeaderTiles.test.tsx` and `Details.test.tsx` for organisations unchanged and green).

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/Skeletons.tsx src/components/organizations/detail/usePanelJump.ts src/components/organizations/detail/usePanelJump.test.tsx src/components/organizations/detail/HeaderTiles.tsx src/pages/organizations/Details.tsx src/components/accounts/detail/useAccount.ts src/components/accounts/detail/useAccount.test.tsx src/components/accounts/detail/AccountHeader.tsx src/components/accounts/detail/AccountHeader.test.tsx src/components/accounts/detail/AccountPulseBreakdown.tsx src/components/accounts/detail/AccountTiles.tsx src/components/accounts/detail/AccountTiles.test.tsx
git commit -m "$(cat <<'EOF'
feat(accounts): the account page's name row, tiles and account pulse

The name row with Part of links to each openable organisation and Edit and
the ⋯ flows; the four tiles through a kind-agnostic DetailTiles, Health
opening the account pulse; the row and record read by the URL id alone.
The organization page's skeletons and tile jump move to shared parts.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The Details tab: owner, the four panels, CSAT, AI attributes and knowledge

**Files:**
- Create: `src/components/accounts/detail/useAccountCsat.ts`, `src/components/accounts/detail/AccountDetailsTab.tsx`, `src/components/accounts/detail/AccountDetailsTab.test.tsx`
- Modify: `src/components/shared/OwnerTile.tsx` (whole file), `src/components/organizations/detail/CustomerFacts.tsx` (export `CsatSpread`)

**Interfaces:**
- Consumes (Task 3): `csatBreakdown`, `stubAccountPage`, `ACCOUNT_LISTS`/`ACCOUNT_SURVEYS`. Delivery 1: `AccountPanels` (`data-panel` sections `commercial`, `voice`, `profile`, `history`). Existing: `AIAttributesPanel({ accountId })`, `useMembers()`, `OwnerTile`, `OwnerSummary`.
- Produces:
  - `export function CsatSpread({ breakdown }: { breakdown: CsatBreakdown })` from `CustomerFacts.tsx` (unchanged markup).
  - `useAccountCsat(accountId: number): { breakdown: CsatBreakdown | null; error: string | null; retry: () => void }` (reads `GET /accounts/<id>/surveys/`).
  - `AccountDetailsTab({ row: AccountPortfolioRow; currency: CurrencyCode; isSm: boolean; owner: OwnerSummary | null | undefined; mayChangeOwner: boolean; onSaveOwner: (userId: number | null, note: string) => Promise<boolean>; onEdit?: () => void })`. `owner === undefined` means the record has not landed.
  - `OwnerTile`: same props and structure; text at 11/13px, 44px targets below `sm`, focus rings.

- [ ] **Step 1: Write the failing test**

`src/components/accounts/detail/AccountDetailsTab.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { ACCOUNT_LISTS, stubAccountPage } from '../../../features/accounts/testAccountPage';
import { initechApac, pizzaEmea } from '../../../features/accounts/testPortfolio';
import { resetMembersCache } from '../../../features/knowledge/useMembers';
import { requestPaths } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import type { OwnerSummary } from '../../shared/OwnerTile';
import { AccountDetailsTab } from './AccountDetailsTab';

const CARL: OwnerSummary = { id: 2, name: 'Carl CSM', function: 'cs' };

function renderDetails({
  row = pizzaEmea as AccountPortfolioRow,
  owner = CARL as OwnerSummary | null | undefined,
  mayChangeOwner = true,
  onEdit = vi.fn() as (() => void) | undefined,
} = {}) {
  const onSaveOwner = vi.fn(async () => true);
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <AccountDetailsTab
          row={row}
          currency="USD"
          isSm
          owner={owner}
          mayChangeOwner={mayChangeOwner}
          onSaveOwner={onSaveOwner}
          onEdit={onEdit}
        />
      </MemoryRouter>
    </Provider>,
  );
  return { onSaveOwner, onEdit };
}

describe('AccountDetailsTab (spec 2026-09-29 §2.6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetMembersCache();
  });

  it('shows the owner, the four panels with Edit details, and the AI attributes for this account', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    const { onEdit } = renderDetails();
    const section = screen.getByRole('region', { name: 'Account details' });
    expect(within(section).getByText('Carl CSM · Customer Success')).toBeInTheDocument();
    for (const title of ['Commercial', 'Voice of the customer', 'Profile', 'History']) {
      expect(within(section).getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(section.querySelectorAll('[data-panel]')).toHaveLength(4);
    await userEvent.click(within(section).getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledOnce();
    await waitFor(() => expect(requestPaths(spy)).toContain('GET /attributes/values/'));
    const attributes = spy.mock.calls.map(([input]) => new URL(String(input))).find((url) => url.pathname.endsWith('/attributes/values/'))!;
    expect(attributes.searchParams.get('account')).toBe('12');
  });

  it('shows how the account\'s answered CSAT surveys spread', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderDetails();
    const csat = screen.getByRole('region', { name: 'CSAT responses' });
    expect(await within(csat).findByText('CSAT responses', { selector: 'span' })).toBeInTheDocument();
    expect(csat).toHaveTextContent('2 CSAT responses');
    const bands = within(csat).getByRole('list', { name: 'CSAT responses by band' });
    expect(within(bands).getByText('Very Satisfied').closest('li')).toHaveTextContent('1 · 50%');
    expect(within(bands).getByText('Neutral').closest('li')).toHaveTextContent('1 · 50%');
    expect(requestPaths(spy)).toContain('GET /accounts/12/surveys/');
  });

  it('sends knowledge to each linked organisation the viewer may open', () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderDetails();
    const knowledge = screen.getByRole('region', { name: 'Knowledge' });
    expect(knowledge).toHaveTextContent('Knowledge for this account lives on its organizations\' pages: Pizza Hut, Yum Brands.');
    expect(within(knowledge).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/organizations/7?tab=knowledge',
      '/organizations/9?tab=knowledge',
    ]);
  });

  it('with one organisation names its page; with none it names nothing', () => {
    stubAccountPage();
    renderDetails({ row: { ...pizzaEmea, details: { ...pizzaEmea.details, profile: { ...pizzaEmea.details.profile, organisations: [{ id: 7, name: 'Pizza Hut' }] } } } });
    expect(screen.getByRole('region', { name: 'Knowledge' })).toHaveTextContent('Knowledge for this account lives on Pizza Hut\'s page.');
  });

  it('names no organisation for an account the viewer may open none of', () => {
    stubAccountPage({ row: initechApac });
    renderDetails({ row: initechApac, owner: null });
    const knowledge = screen.getByRole('region', { name: 'Knowledge' });
    expect(knowledge).toHaveTextContent('Company knowledge is kept on organization pages, and there is none for this account that you can open.');
    expect(within(knowledge).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Nobody yet')).toBeInTheDocument();
  });

  it('hands the account over with a note', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    const { onSaveOwner } = renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Hand over' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Alice · Customer Success' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('New account owner'), '1');
    await userEvent.type(screen.getByLabelText('Handover note'), 'Covering while Carl is away');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSaveOwner).toHaveBeenCalledWith(1, 'Covering while Carl is away');
  });

  it('offers no handover to a viewer who may not, and waits for the record', () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderDetails({ mayChangeOwner: false });
    expect(screen.queryByRole('button', { name: 'Hand over' })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderDetails({ owner: undefined, onEdit: undefined });
    expect(screen.getByRole('status', { name: 'Loading the owner' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/accounts/detail/AccountDetailsTab.test.tsx`
Expected: FAIL with "Failed to resolve import './AccountDetailsTab'".

- [ ] **Step 3: Implement**

In `src/components/organizations/detail/CustomerFacts.tsx`, change `function CsatSpread(` to `export function CsatSpread(` (nothing else).

Replace `src/components/shared/OwnerTile.tsx` with:

```tsx
import { useState } from 'react';
import { FUNCTION_LABELS, type User, type UserFunction } from '../../features/auth/authSlice';

export type OwnerSummary = { id: number; name: string; function: UserFunction | null };

type Props = {
  title?: string;
  owner: OwnerSummary | null;
  members: User[];
  /** Whether the viewer may assign or hand over (the backend decides for real). */
  mayChange: boolean;
  /** Save the new owner (null clears) with a handover note; resolve true on success. */
  onSave: (userId: number | null, note: string) => Promise<boolean>;
  /** A row divided from what is above it, not a tinted box: for a card
   *  that already has its own surface (no card in a card). Off by default. */
  plain?: boolean;
};

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
const CONTROL = `min-h-11 rounded-lg border border-line bg-surface px-2 text-[15px] text-ink sm:min-h-9 sm:text-[13px] ${FOCUS}`;

/**
 * One accountable person, from any function, for an organisation or an
 * account: who it is, and "Assign" / "Hand over" with a note that is written
 * down for the record. The same tile on both pages so ownership reads and
 * behaves the same wherever it appears. House type sizes (11/13, 15 in
 * phone inputs) and 44px targets below sm.
 */
export function OwnerTile({ title = 'Account owner', owner, members, mayChange, onSave, plain = false }: Props) {
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function save() {
    if (pending === null) return;
    if (await onSave(pending ? Number(pending) : null, note)) {
      setPending(null);
      setNote('');
    }
  }

  return (
    <div
      data-owner-tile={plain ? 'row' : 'tile'}
      className={plain ? 'border-t border-line-subtle pt-3 flex flex-col gap-1.5' : 'border border-accent/30 bg-accent-dim/40 rounded-lg px-3 py-2 flex flex-col gap-1.5'}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${plain ? 'text-ink-muted' : 'text-accent'}`}>{title}</div>
          <div className="text-[13px] font-semibold text-ink">
            {owner ? `${owner.name}${owner.function ? ` · ${FUNCTION_LABELS[owner.function]}` : ''}` : 'Nobody yet'}
          </div>
        </div>
        {mayChange && pending === null && (
          <button
            type="button"
            onClick={() => setPending(owner ? String(owner.id) : '')}
            className={`inline-flex min-h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-ink hover:bg-subtle active:bg-line-subtle sm:min-h-9 ${FOCUS}`}
          >
            {owner ? 'Hand over' : 'Assign'}
          </button>
        )}
      </div>
      {pending !== null && (
        <div className="flex flex-col gap-1.5">
          <select aria-label="New account owner" value={pending} onChange={(e) => setPending(e.target.value)} className={CONTROL}>
            <option value="">Nobody</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.function ? ` · ${FUNCTION_LABELS[m.function]}` : ''}
              </option>
            ))}
          </select>
          <input
            aria-label="Handover note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is it moving? (written down for the record)"
            className={CONTROL}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              className={`inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover sm:min-h-9 ${FOCUS}`}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className={`inline-flex min-h-11 items-center rounded-lg px-3 text-[13px] font-semibold text-ink-muted hover:bg-subtle sm:min-h-9 ${FOCUS}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

Create `src/components/accounts/detail/useAccountCsat.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { csatBreakdown } from '../../../features/accounts/csat';
import type { CsatBreakdown, Survey } from '../../../features/customers/customersSlice';
import { apiFetch } from '../../../lib/apiClient';
import { errorMessage } from '../../organizations/portfolio/usePortfolio';

type Load = { key: string; breakdown: CsatBreakdown } | { key: string; error: string };

/** How the account's answered CSAT surveys spread (decision 4): its surveys
 *  (GET /accounts/<id>/surveys/, the account's rule) banded as the backend
 *  bands an organisation's. */
export function useAccountCsat(accountId: number): { breakdown: CsatBreakdown | null; error: string | null; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const key = `${accountId}#${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Survey[]>(`/accounts/${accountId}/surveys/`).then(
      (surveys) => {
        if (!cancelled) setLoad({ key, breakdown: csatBreakdown(Array.isArray(surveys) ? surveys : []) });
      },
      (err: unknown) => {
        if (!cancelled) setLoad({ key, error: errorMessage(err, 'Could not load the CSAT responses.') });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accountId, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const current = load && load.key === key ? load : null;
  return {
    breakdown: current && 'breakdown' in current ? current.breakdown : null,
    error: current && 'error' in current ? current.error : null,
    retry,
  };
}
```

Create `src/components/accounts/detail/AccountDetailsTab.tsx`:

```tsx
import { Fragment, useId } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import type { AccountPortfolioRow } from '../../../features/accounts/portfolioTypes';
import { useMembers } from '../../../features/knowledge/useMembers';
import { CsatSpread } from '../../organizations/detail/CustomerFacts';
import { BUTTON, FOCUS, QUIET } from '../../organizations/portfolio/styles';
import { AIAttributesPanel } from '../../shared/AIAttributesPanel';
import { OwnerTile, type OwnerSummary } from '../../shared/OwnerTile';
import { AccountPanels } from '../portfolio/AccountPanels';
import { useAccountCsat } from './useAccountCsat';

const HEADING = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';
const LINK = `inline-flex min-h-11 items-center rounded-sm text-ink underline sm:min-h-0 ${FOCUS}`;

/** Company knowledge is per organisation (spec Decisions): one link per
 *  linked organisation the viewer may open, and none named otherwise. */
function KnowledgeLine({ organisations }: { organisations: { id: number; name: string }[] }) {
  if (organisations.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted">
        Company knowledge is kept on organization pages, and there is none for this account that you can open.
      </p>
    );
  }
  const links = organisations.map((organisation, index) => (
    <Fragment key={organisation.id}>
      {index > 0 ? ', ' : null}
      <Link to={`/organizations/${organisation.id}?tab=knowledge`} className={LINK}>
        {organisation.name}
      </Link>
    </Fragment>
  ));
  return organisations.length === 1 ? (
    <p className="text-[13px] text-ink-muted">Knowledge for this account lives on {links}'s page.</p>
  ) : (
    <p className="text-[13px] text-ink-muted">Knowledge for this account lives on its organizations' pages: {links}.</p>
  );
}

/** Details (spec 2026-09-29 §2.6): who owns the account (hand over with a
 *  note), the four panels from the Accounts list with Edit details on the
 *  heading row, how its CSAT answers spread, its AI attributes, and where
 *  its company knowledge lives. One surface, divided, never boxed twice. */
export function AccountDetailsTab({
  row,
  currency,
  isSm,
  owner,
  mayChangeOwner,
  onSaveOwner,
  onEdit,
}: {
  row: AccountPortfolioRow;
  currency: CurrencyCode;
  isSm: boolean;
  /** From GET /accounts/<id>/ (with their function); undefined while it loads. */
  owner: OwnerSummary | null | undefined;
  mayChangeOwner: boolean;
  onSaveOwner: (userId: number | null, note: string) => Promise<boolean>;
  /** Absent until the account record has landed. */
  onEdit?: () => void;
}) {
  const headingId = useId();
  const csatId = useId();
  const knowledgeId = useId();
  const members = useMembers();
  const csat = useAccountCsat(row.id);

  return (
    <section aria-labelledby={headingId} className="rounded-xl bg-surface">
      <div data-part="details-heading" className="flex items-center justify-between gap-2 px-3 pt-2 pb-2">
        <h2 id={headingId} className={HEADING}>
          Account details
        </h2>
        {onEdit ? (
          <button type="button" onClick={() => onEdit()} className={BUTTON}>
            <Pencil className="w-4 h-4" aria-hidden="true" />
            Edit details
          </button>
        ) : null}
      </div>
      <div className="px-3 pb-3">
        {owner === undefined ? (
          <div role="status" aria-label="Loading the owner" className="border-t border-line-subtle pt-3">
            <span aria-hidden="true" className="block h-3 w-40 animate-pulse rounded bg-subtle" />
          </div>
        ) : (
          <OwnerTile owner={owner} members={members} mayChange={mayChangeOwner} onSave={onSaveOwner} plain />
        )}
      </div>
      <AccountPanels row={row} currency={currency} stacked={!isSm} />
      <section aria-labelledby={csatId} className="flex flex-col gap-3 border-t border-line-subtle px-3 pt-3 pb-4">
        <h3 id={csatId} className={HEADING}>
          CSAT responses
        </h3>
        {csat.error ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-[13px] text-danger">{csat.error}</p>
            <button type="button" onClick={csat.retry} className={`${QUIET} border border-line`}>
              Try again
            </button>
          </div>
        ) : !csat.breakdown ? (
          <div role="status" aria-label="Loading CSAT responses" className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} aria-hidden="true" className="block h-3 w-full animate-pulse rounded bg-subtle" />
            ))}
          </div>
        ) : (
          <CsatSpread breakdown={csat.breakdown} />
        )}
      </section>
      <div className="border-t border-line-subtle px-3 pt-3 pb-4">
        <AIAttributesPanel accountId={row.id} />
      </div>
      <section aria-labelledby={knowledgeId} className="flex flex-col gap-2 border-t border-line-subtle px-3 pt-3 pb-4">
        <h3 id={knowledgeId} className={HEADING}>
          Knowledge
        </h3>
        <KnowledgeLine organisations={row.details.profile.organisations} />
      </section>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass, and the owner tile still reads as it did on the organisation page**

Run: `npx vitest run --maxWorkers=2 src/components/accounts/detail/AccountDetailsTab.test.tsx src/components/organizations src/components/shared src/pages/organizations`
Expected: PASS, 0 failed (`alignment.test.tsx` still finds `data-owner-tile="row"` with `border-t`, and `"tile"` with its tinted classes).

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/CustomerFacts.tsx src/components/shared/OwnerTile.tsx src/components/accounts/detail/useAccountCsat.ts src/components/accounts/detail/AccountDetailsTab.tsx src/components/accounts/detail/AccountDetailsTab.test.tsx
git commit -m "$(cat <<'EOF'
feat(accounts): the account page's Details tab

The owner with a handover note, the four panels with Edit details, how
the account's CSAT answers spread (the backend's bands over its surveys),
its AI attributes, and a link to each openable organisation's knowledge.
The owner tile moves to house type sizes and targets.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Custom objects and Canvases as list items

**Files:**
- Modify: `src/components/shared/CustomObjectsTab.tsx` (whole file), `src/components/shared/CustomObjectsTab.test.tsx` (whole file), `src/components/shared/CanvasListTab.tsx` (whole file)
- Create: `src/components/accounts/detail/CanvasesTab.tsx`, `src/components/accounts/detail/CanvasesTab.test.tsx`

**Interfaces:**
- Consumes (Task 1): `fetchCanvasesForAccount({ accountId })`. (Task 3): `stubAccountPage`, `ACCOUNT_LISTS`, `ACCOUNT_CANVASES`. Existing: `ListSkeleton`, `SummaryLine`, `EmptyState`, `ErrorBlock`, `LIST`, `META`, `ROW_ACTION`, `ROW_ICON`, `TITLE_BUTTON`, `SECTION_HEADING`, `BUTTON`, `PRIMARY`, `QUIET`, `FieldInput`, `displayValue`, `ConfirmDialog`.
- Produces:
  - `CustomObjectsTab({ customerId?, accountId?, onCountChange? })`: same props; one section per applicable object, its records as list items (title = first field's value; the other fields as label and value), "Add record", "Edit <title>", "Delete <title>", a summary line ("N records · M objects"), a skeleton, an error with Try again, an empty state.
  - `CanvasListTab({ canvases, isLoading, error, customerId?, accountId?, onRetry })`: list items (title links to `/canvas/<id>`, "N contacts · Updated …", "Delete <name>"), "New canvas" when a customer or an account is given (`/canvas/create?customerId=…&accountId=…`, either alone), a summary line ("N canvases").
  - `CanvasesTab({ accountId }: { accountId: number })`: reads `GET /accounts/<id>/canvases/` into the store's `entityCanvases` and renders `CanvasListTab` with it.

- [ ] **Step 1: Write the failing tests**

Replace `src/components/shared/CustomObjectsTab.test.tsx` with:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomObjectsTab } from './CustomObjectsTab';

// Integration tier (see the `testing` skill): no store needed — this
// component talks to apiFetch directly (see customObjectsApi.ts), same
// "self-contained feature fetches its own data" reasoning as
// CockpitView.tsx's own tests. Only the fetch boundary is mocked.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function lineItemDefinition(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    name: 'Opportunity Line Item',
    api_name: 'opportunity_line_item',
    applies_to_customer: false,
    applies_to_account: true,
    fields: [
      {
        id: 9,
        name: 'Product',
        api_name: 'product',
        field_type: 'text',
        field_type_display: 'Text',
        is_required: true,
        picklist_options: [],
        order: 1,
        created_at: '2026-09-06T00:00:00Z',
      },
      {
        id: 10,
        name: 'Quantity',
        api_name: 'qty',
        field_type: 'number',
        field_type_display: 'Number',
        is_required: false,
        picklist_options: [],
        order: 2,
        created_at: '2026-09-06T00:00:00Z',
      },
    ],
    records_count: 1,
    created_at: '2026-09-06T00:00:00Z',
    ...overrides,
  };
}

function lineItemRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 21,
    object_definition_id: 4,
    customer_id: null,
    account_id: 17,
    data: { product: 'Seat License', qty: 50 },
    created_at: '2026-09-06T00:00:00Z',
    updated_at: '2026-09-06T00:00:00Z',
    ...overrides,
  };
}

function stubFetch(
  handler: (url: string, options?: RequestInit) => ReturnType<typeof jsonResponse> | undefined
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options?: RequestInit) => {
      const response = handler(url, options);
      return Promise.resolve(response ?? jsonResponse(404, { detail: 'unhandled in test' }));
    })
  );
}

describe('CustomObjectsTab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an empty state when the org has defined no applicable objects', async () => {
    stubFetch((url) => {
      if (url.includes('/custom-objects/definitions/')) return jsonResponse(200, []);
      return undefined;
    });

    render(<CustomObjectsTab accountId={17} />);

    expect(await screen.findByText('No custom objects yet')).toBeInTheDocument();
  });

  it('only shows definitions that apply to the given parent type', async () => {
    stubFetch((url) => {
      if (url.includes('/custom-objects/definitions/')) {
        return jsonResponse(200, [
          lineItemDefinition(), // applies_to_account only
          { ...lineItemDefinition({ id: 5, name: 'Renewal Note', applies_to_customer: true, applies_to_account: false, fields: [], records_count: 0 }) },
        ]);
      }
      if (url.includes('/custom-objects/records/')) return jsonResponse(200, []);
      return undefined;
    });

    render(<CustomObjectsTab accountId={17} />);

    expect(await screen.findByRole('heading', { name: 'Opportunity Line Item' })).toBeInTheDocument();
    expect(screen.queryByText('Renewal Note')).not.toBeInTheDocument();
    expect(screen.getByText('No Opportunity Line Item records yet.')).toBeInTheDocument();
  });

  it('lists each record as an item: its first field as the title, the others by name, never a table', async () => {
    stubFetch((url) => {
      if (url.includes('/custom-objects/definitions/')) return jsonResponse(200, [lineItemDefinition()]);
      if (url.includes('/custom-objects/records/')) return jsonResponse(200, [lineItemRecord()]);
      return undefined;
    });

    render(<CustomObjectsTab accountId={17} />);

    const item = (await screen.findByRole('heading', { name: 'Seat License' })).closest('li')!;
    expect(within(item).getByText('Quantity')).toBeInTheDocument();
    expect(within(item).getByText('50')).toBeInTheDocument();
    expect(document.querySelector('table')).toBeNull();
    expect(document.querySelector('[data-summary]')).toHaveTextContent('1 record · 1 object');
  });

  it('reports the real total record count once loaded', async () => {
    stubFetch((url) => {
      if (url.includes('/custom-objects/definitions/')) return jsonResponse(200, [lineItemDefinition()]);
      if (url.includes('/custom-objects/records/')) return jsonResponse(200, [lineItemRecord(), lineItemRecord({ id: 22 })]);
      return undefined;
    });
    const onCountChange = vi.fn();

    render(<CustomObjectsTab accountId={17} onCountChange={onCountChange} />);
    await screen.findAllByRole('heading', { name: 'Seat License' });

    // The count is reported from an effect after the rows render, so wait for it.
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));
  });

  it('adding a record posts real data and shows the new record', async () => {
    stubFetch((url, options) => {
      if (url.includes('/custom-objects/definitions/')) return jsonResponse(200, [lineItemDefinition({ records_count: 0 })]);
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        return jsonResponse(201, lineItemRecord({ id: 30, data: body.data }));
      }
      if (url.includes('/custom-objects/records/')) return jsonResponse(200, []);
      return undefined;
    });
    const user = userEvent.setup();

    render(<CustomObjectsTab accountId={17} />);
    await screen.findByRole('heading', { name: 'Opportunity Line Item' });

    await user.click(screen.getByRole('button', { name: 'Add record' }));
    await user.type(screen.getByLabelText('Product'), 'Enterprise Plan');
    await user.type(screen.getByLabelText('Quantity'), '10');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('heading', { name: 'Enterprise Plan' })).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('a failed add shows the real backend error instead of silently closing', async () => {
    stubFetch((url, options) => {
      if (url.includes('/custom-objects/definitions/')) return jsonResponse(200, [lineItemDefinition({ records_count: 0 })]);
      if (options?.method === 'POST') return jsonResponse(400, { data: ['Product is required.'] });
      if (url.includes('/custom-objects/records/')) return jsonResponse(200, []);
      return undefined;
    });
    const user = userEvent.setup();

    render(<CustomObjectsTab accountId={17} />);
    await screen.findByRole('heading', { name: 'Opportunity Line Item' });
    await user.click(screen.getByRole('button', { name: 'Add record' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Product is required.');
  });

  it('editing a record saves real changes', async () => {
    stubFetch((url, options) => {
      if (url.includes('/custom-objects/definitions/')) return jsonResponse(200, [lineItemDefinition()]);
      if (options?.method === 'PATCH') {
        const body = JSON.parse(options.body as string);
        return jsonResponse(200, lineItemRecord({ data: body.data }));
      }
      if (url.includes('/custom-objects/records/')) return jsonResponse(200, [lineItemRecord()]);
      return undefined;
    });
    const user = userEvent.setup();

    render(<CustomObjectsTab accountId={17} />);
    await screen.findByRole('heading', { name: 'Seat License' });

    await user.click(screen.getByRole('button', { name: 'Edit Seat License' }));
    const productInput = screen.getByLabelText('Product');
    await user.clear(productInput);
    await user.type(productInput, 'Seat License Renewed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Seat License Renewed' })).toBeInTheDocument();
  });

  it('deleting a record removes it after confirming', async () => {
    stubFetch((url, options) => {
      if (url.includes('/custom-objects/definitions/')) return jsonResponse(200, [lineItemDefinition()]);
      if (options?.method === 'DELETE') return jsonResponse(204, null);
      if (url.includes('/custom-objects/records/')) return jsonResponse(200, [lineItemRecord()]);
      return undefined;
    });
    const user = userEvent.setup();

    render(<CustomObjectsTab accountId={17} />);
    await screen.findByRole('heading', { name: 'Seat License' });

    await user.click(screen.getByRole('button', { name: 'Delete Seat License' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Seat License' })).not.toBeInTheDocument());
  });

  it('says so when the read fails, and Try again reads again', async () => {
    let fail = true;
    stubFetch((url) => {
      if (url.includes('/custom-objects/definitions/')) return fail ? jsonResponse(500, { detail: 'Try later.' }) : jsonResponse(200, [lineItemDefinition()]);
      if (url.includes('/custom-objects/records/')) return jsonResponse(200, [lineItemRecord()]);
      return undefined;
    });
    const user = userEvent.setup();

    render(<CustomObjectsTab accountId={17} />);
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Seat License' })).toBeInTheDocument();
  });
});
```

`src/components/accounts/detail/CanvasesTab.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ACCOUNT_LISTS, stubAccountPage } from '../../../features/accounts/testAccountPage';
import { requestPaths } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { CanvasesTab } from './CanvasesTab';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderCanvases() {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter initialEntries={['/accounts/12?tab=canvases']}>
        <Routes>
          <Route path="/accounts/:id" element={<CanvasesTab accountId={12} />} />
          <Route path="/canvas/*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe('CanvasesTab (spec 2026-09-29 §2.9b)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the account\'s canvases as items read by the account alone', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderCanvases();
    const list = await screen.findByRole('list', { name: 'Canvases' });
    const item = within(list).getAllByRole('listitem')[0];
    expect(within(item).getByRole('link', { name: 'EMEA buying group' })).toHaveAttribute('href', '/canvas/301');
    expect(item).toHaveTextContent('2 contacts');
    expect(item).toHaveTextContent(/Updated /);
    expect(document.querySelector('[data-summary]')).toHaveTextContent('1 canvas');
    expect(requestPaths(spy)).toContain('GET /accounts/12/canvases/');
  });

  it('New canvas opens the editor for this account', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderCanvases();
    await screen.findByRole('list', { name: 'Canvases' });
    await userEvent.click(screen.getByRole('button', { name: 'New canvas' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/canvas/create?accountId=12');
  });

  it('deletes a canvas after confirming', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderCanvases();
    await screen.findByRole('list', { name: 'Canvases' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete EMEA buying group' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('No canvases yet')).toBeInTheDocument());
    expect(requestPaths(spy)).toContain('DELETE /canvases/301/');
  });

  it('says there are none yet, and keeps New canvas', async () => {
    stubAccountPage();
    renderCanvases();
    expect(await screen.findByText('No canvases yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New canvas' })).toBeInTheDocument();
  });

  it('says so when the read fails, and Try again reads again', async () => {
    stubAccountPage({ row: null });
    renderCanvases();
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    stubAccountPage({ lists: ACCOUNT_LISTS });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Canvases' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/shared/CustomObjectsTab.test.tsx src/components/accounts/detail/CanvasesTab.test.tsx`
Expected: FAIL. `CustomObjectsTab` still renders a table (no "Seat License" heading, no "Add record"); `CanvasesTab.test.tsx` fails with "Failed to resolve import './CanvasesTab'".

- [ ] **Step 3: Implement**

Replace `src/components/shared/CustomObjectsTab.tsx` with:

```tsx
import { useEffect, useId, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import {
  createCustomObjectRecord,
  deleteCustomObjectRecord,
  fetchCustomObjectDefinitions,
  fetchCustomObjectRecords,
  updateCustomObjectRecord,
} from '../../features/customObjects/customObjectsApi';
import { displayValue } from '../../features/customObjects/displayValue';
import { FieldInput } from '../../features/customObjects/FieldInput';
import { initialFormValues, toPayload } from '../../features/customObjects/recordForm';
import type { FormValues } from '../../features/customObjects/recordForm';
import type { CustomFieldDefinition, CustomObjectDefinition, CustomObjectRecord } from '../../features/customObjects/types';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { ListSkeleton, SummaryLine } from '../organizations/detail/ListParts';
import { LIST, META, ROW_ACTION, SECTION_HEADING } from '../organizations/detail/listStyles';
import { EmptyState, ErrorBlock } from '../organizations/portfolio/PortfolioSections';
import { BUTTON, PRIMARY, QUIET } from '../organizations/portfolio/styles';

export interface CustomObjectsTabProps {
  /** Set on an organization's page. */
  customerId?: number;
  /** Set on an account's page. */
  accountId?: number;
  /** Reports the total record count across every applicable object once
   *  loaded; the tab shows it itself as its summary line. */
  onCountChange?: (count: number) => void;
}

/** An item's title: its first field's value, else the object's name and the record's id. */
function titleOf(definition: CustomObjectDefinition, record: CustomObjectRecord): string {
  const first = definition.fields[0];
  const value = first ? displayValue(first, record) : '—';
  return value === '—' ? `${definition.name} ${record.id}` : value;
}

/** The add and edit forms: a label above each input (the input carries it too). */
function RecordFields({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldDefinition[];
  values: FormValues;
  onChange: (apiName: string, value: string | boolean) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.id} className="flex flex-col gap-1">
          <span aria-hidden="true" className="text-[11px] font-semibold text-ink-muted">
            {field.name}
            {field.is_required ? ' (required)' : ''}
          </span>
          <FieldInput field={field} value={values[field.api_name] ?? ''} onChange={(value) => onChange(field.api_name, value)} />
        </div>
      ))}
    </div>
  );
}

/** Custom objects (account spec 2026-09-29 §2.9a): each object that applies
 *  to this parent, its records as list items (never a table): the first
 *  field as the title, the others by name. Add, edit and delete in place.
 *  Reads its own data (definitions, then each object's records), since
 *  custom objects are admin-defined and dynamic. */
export function CustomObjectsTab({ customerId, accountId, onCountChange }: CustomObjectsTabProps) {
  const baseId = useId();
  const [definitions, setDefinitions] = useState<CustomObjectDefinition[]>([]);
  const [recordsByDefinition, setRecordsByDefinition] = useState<Record<number, CustomObjectRecord[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [addingForId, setAddingForId] = useState<number | null>(null);
  const [addValues, setAddValues] = useState<FormValues>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingRecord, setEditingRecord] = useState<CustomObjectRecord | null>(null);
  const [editValues, setEditValues] = useState<FormValues>({});

  const [deleteTarget, setDeleteTarget] = useState<{ record: CustomObjectRecord; title: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const allDefinitions = await fetchCustomObjectDefinitions();
        const applicable = allDefinitions.filter((d) => (customerId !== undefined ? d.applies_to_customer : d.applies_to_account));
        const parent = customerId !== undefined ? { customerId } : { accountId: accountId! };
        const recordLists = await Promise.all(applicable.map((definition) => fetchCustomObjectRecords(definition.id, parent)));
        if (cancelled) return;

        setDefinitions(applicable);
        const byDefinition: Record<number, CustomObjectRecord[]> = {};
        applicable.forEach((definition, i) => {
          byDefinition[definition.id] = recordLists[i];
        });
        setRecordsByDefinition(byDefinition);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load custom objects.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (customerId !== undefined || accountId !== undefined) load();
    return () => {
      cancelled = true;
    };
  }, [customerId, accountId, attempt]);

  // Derived from the state the list renders: one source for "how many records exist now".
  const total = Object.values(recordsByDefinition).reduce((sum, records) => sum + records.length, 0);
  useEffect(() => {
    onCountChange?.(total);
  }, [total, onCountChange]);

  function retry() {
    setLoadError(null);
    setIsLoading(true);
    setAttempt((n) => n + 1);
  }

  function startAdding(definition: CustomObjectDefinition) {
    setAddingForId(definition.id);
    setAddValues(initialFormValues(definition.fields));
    setFormError(null);
  }

  async function handleAdd(definition: CustomObjectDefinition) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const record = await createCustomObjectRecord({
        object_definition_id: definition.id,
        ...(customerId !== undefined ? { customer_id: customerId } : { account_id: accountId! }),
        data: toPayload(definition.fields, addValues),
      });
      setRecordsByDefinition((current) => ({
        ...current,
        [definition.id]: [record, ...(current[definition.id] ?? [])],
      }));
      setAddingForId(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not add this record.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEditing(record: CustomObjectRecord, definition: CustomObjectDefinition) {
    setEditingRecord(record);
    setEditValues(initialFormValues(definition.fields, record));
    setFormError(null);
  }

  async function handleSaveEdit(definition: CustomObjectDefinition) {
    if (!editingRecord) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      const updated = await updateCustomObjectRecord(editingRecord.id, {
        data: toPayload(definition.fields, editValues),
      });
      setRecordsByDefinition((current) => ({
        ...current,
        [definition.id]: current[definition.id].map((r) => (r.id === updated.id ? updated : r)),
      }));
      setEditingRecord(null);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save this record.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <ListSkeleton label="Loading custom objects" />;
  if (loadError) return <ErrorBlock message={loadError} onRetry={retry} />;
  if (definitions.length === 0) {
    return (
      <EmptyState
        title="No custom objects yet"
        detail="An organization admin can add one in Settings, under Custom objects."
        action={null}
      />
    );
  }

  const formErrorLine = formError ? (
    <p role="alert" className="text-[13px] text-danger">
      {formError}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <SummaryLine
        parts={[
          { value: String(total), label: total === 1 ? 'record' : 'records' },
          { value: String(definitions.length), label: definitions.length === 1 ? 'object' : 'objects' },
        ]}
      />
      {definitions.map((definition) => {
        const records = recordsByDefinition[definition.id] ?? [];
        const headingId = `${baseId}-${definition.id}`;
        const rest = definition.fields.slice(1);
        return (
          <section key={definition.id} aria-labelledby={headingId} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={headingId} className={SECTION_HEADING}>
                {definition.name}
              </h2>
              <button type="button" onClick={() => startAdding(definition)} className={BUTTON}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add record
              </button>
            </div>

            {addingForId === definition.id ? (
              <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
                <RecordFields
                  fields={definition.fields}
                  values={addValues}
                  onChange={(apiName, value) => setAddValues((v) => ({ ...v, [apiName]: value }))}
                />
                {formErrorLine}
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => handleAdd(definition)} disabled={isSubmitting} className={PRIMARY}>
                    {isSubmitting ? 'Adding…' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setAddingForId(null)} className={QUIET}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {records.length === 0 && addingForId !== definition.id ? (
              <p className="rounded-xl bg-surface px-3 py-4 text-[13px] text-ink-muted">No {definition.name} records yet.</p>
            ) : records.length > 0 ? (
              <ul aria-label={definition.name} className={LIST}>
                {records.map((record) => {
                  const title = titleOf(definition, record);
                  if (editingRecord?.id === record.id) {
                    return (
                      <li key={record.id} data-record={record.id} className="flex flex-col gap-3 px-3 py-2.5">
                        <RecordFields
                          fields={definition.fields}
                          values={editValues}
                          onChange={(apiName, value) => setEditValues((v) => ({ ...v, [apiName]: value }))}
                        />
                        {formErrorLine}
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => handleSaveEdit(definition)} disabled={isSubmitting} className={PRIMARY}>
                            {isSubmitting ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" onClick={() => setEditingRecord(null)} className={QUIET}>
                            Cancel
                          </button>
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li key={record.id} data-record={record.id} className="flex items-start gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[13px] font-semibold text-ink">{title}</h3>
                        {rest.length ? (
                          <dl className={META}>
                            {rest.map((field) => (
                              <div key={field.id} className="inline-flex min-w-0 gap-1">
                                <dt>{field.name}</dt>
                                <dd className="font-mono-brand tabular-nums text-ink">{displayValue(field, record)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                      </div>
                      <button type="button" onClick={() => startEditing(record, definition)} aria-label={`Edit ${title}`} className={ROW_ACTION}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => setDeleteTarget({ record, title })} aria-label={`Delete ${title}`} className={ROW_ACTION}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}

      {deleteTarget ? (
        <ConfirmDialog
          title={`Delete ${deleteTarget.title}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteCustomObjectRecord(deleteTarget.record.id);
            setRecordsByDefinition((current) => ({
              ...current,
              [deleteTarget.record.object_definition_id]: current[deleteTarget.record.object_definition_id].filter(
                (r) => r.id !== deleteTarget.record.id
              ),
            }));
          }}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
```

Replace `src/components/shared/CanvasListTab.tsx` with:

```tsx
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus, Trash2 } from 'lucide-react';
import { useAppDispatch } from '../../hooks';
import { deleteCanvas, type Canvas } from '../../features/customers/customersSlice';
import { formatRelativeTime } from '../../features/customers/formatters';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { ListSkeleton, SummaryLine } from '../organizations/detail/ListParts';
import { LIST, META, ROW_ACTION, ROW_ICON, TITLE_BUTTON } from '../organizations/detail/listStyles';
import { EmptyState, ErrorBlock } from '../organizations/portfolio/PortfolioSections';
import { BUTTON } from '../organizations/portfolio/styles';

export interface CanvasListTabProps {
  canvases: Canvas[];
  isLoading: boolean;
  error: string | null;
  /** The organization a new canvas goes on, if the page has one. */
  customerId?: number;
  /** The account a new canvas goes on (the account page passes only this). */
  accountId?: number;
  onRetry: () => void;
}

/** Canvases (account spec 2026-09-29 §2.9b): a page's canvases as list items
 *  (the name opens the editor; how many contacts it maps; when it changed;
 *  delete), and New canvas straight into the editor for this parent. */
export function CanvasListTab({ canvases, isLoading, error, customerId, accountId, onRetry }: CanvasListTabProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [deletingCanvas, setDeletingCanvas] = useState<Canvas | null>(null);
  const canCreate = customerId !== undefined || accountId !== undefined;

  function handleNewCanvas() {
    const params = new URLSearchParams();
    if (customerId !== undefined) params.set('customerId', String(customerId));
    if (accountId !== undefined) params.set('accountId', String(accountId));
    navigate(`/canvas/create?${params.toString()}`);
  }

  let body: ReactNode;
  if (error) body = <ErrorBlock message={error} onRetry={onRetry} />;
  else if (isLoading) body = <ListSkeleton label="Loading canvases" />;
  else if (canvases.length === 0) {
    body = <EmptyState title="No canvases yet" detail="A canvas maps the people on this account and how they connect." action={null} />;
  } else {
    body = (
      <ul aria-label="Canvases" className={LIST}>
        {canvases.map((canvas) => (
          <li key={canvas.id} data-canvas={canvas.id} className="flex gap-3 px-3 py-2.5">
            <span aria-hidden="true" className={ROW_ICON}>
              <LayoutGrid className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="min-w-0 truncate text-[13px] font-semibold text-ink">
                <Link to={`/canvas/${canvas.id}`} className={TITLE_BUTTON}>
                  {canvas.name}
                </Link>
              </h3>
              <p className={META}>
                <span>
                  <span className="font-mono-brand tabular-nums">{canvas.nodes.length}</span>{' '}
                  {canvas.nodes.length === 1 ? 'contact' : 'contacts'}
                </span>
                <span>Updated {formatRelativeTime(canvas.updated_at)}</span>
              </p>
            </div>
            <button type="button" onClick={() => setDeletingCanvas(canvas)} aria-label={`Delete ${canvas.name}`} className={ROW_ACTION}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isLoading && !error && canvases.length > 0 ? (
          <SummaryLine parts={[{ value: String(canvases.length), label: canvases.length === 1 ? 'canvas' : 'canvases' }]} />
        ) : (
          <span />
        )}
        {canCreate ? (
          <button type="button" onClick={handleNewCanvas} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New canvas
          </button>
        ) : null}
      </div>
      {body}
      {deletingCanvas ? (
        <ConfirmDialog
          title={`Delete ${deletingCanvas.name}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await dispatch(deleteCanvas(deletingCanvas.id)).unwrap();
          }}
          onClose={() => setDeletingCanvas(null)}
        />
      ) : null}
    </div>
  );
}
```

Create `src/components/accounts/detail/CanvasesTab.tsx`:

```tsx
import { useLayoutEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchCanvasesForAccount } from '../../../features/customers/customersSlice';
import { CanvasListTab } from '../../shared/CanvasListTab';

/** Canvases on the account page: read through GET /accounts/<id>/canvases/
 *  (backend #75) into the store's canvas list, which edits and deletes
 *  anywhere patch. Read before paint, so another page's canvases never show. */
export function CanvasesTab({ accountId }: { accountId: number }) {
  const dispatch = useAppDispatch();
  const { entityCanvases, entityCanvasesLoading, entityCanvasesError } = useAppSelector((state) => state.customers);
  const [attempt, setAttempt] = useState(0);

  useLayoutEffect(() => {
    void dispatch(fetchCanvasesForAccount({ accountId }));
  }, [dispatch, accountId, attempt]);

  return (
    <CanvasListTab
      canvases={entityCanvases}
      isLoading={entityCanvasesLoading}
      error={entityCanvasesError}
      accountId={accountId}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/shared src/components/accounts/detail src/pages/customObjects src/pages/settings src/pages/canvas`
Expected: PASS, 0 failed.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/CustomObjectsTab.tsx src/components/shared/CustomObjectsTab.test.tsx src/components/shared/CanvasListTab.tsx src/components/accounts/detail/CanvasesTab.tsx src/components/accounts/detail/CanvasesTab.test.tsx
git commit -m "$(cat <<'EOF'
feat(accounts): custom objects and canvases as list items

Custom object records and canvases read as list items with a summary line,
skeletons, empty and error states (never a table), and New canvas opens the
editor for the account alone.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The account page

**Files:**
- Modify (rewrite): `src/pages/accounts/Details.tsx`, `src/pages/accounts/Details.test.tsx`
- Create: `src/pages/accounts/testDetail.tsx`, `src/components/accounts/detail/houseRules.test.ts`
- Modify: `src/pages/accounts/houseRules.test.ts`

**Interfaces:**
- Consumes: everything above — `parseAccountId`, `ACCOUNT_TABS`, `AccountTab`, `useAccountPageParams` (Task 3); `DetailScope`, `storyFilters`, `storyQuery`, `useStory`, `detailTabId`/`detailPanelId` (Task 3); `StoryTab`, `AddFlow`, `DetailTabs`, `ShowAccountTags` (Task 4); `PeopleTab`, `DealsTab`, `FilesCallsTab` with `scope` (Task 5); `useAccount`, `AccountHeader`, `AccountTiles`, `HeaderSkeleton`, `TabSkeleton`, `usePanelJump` (Task 6); `AccountDetailsTab` (Task 7); `CustomObjectsTab`, `CanvasesTab` (Task 8); `updateAccount({ id, owner_id, handover_note })`, `fetchContactsForAccount({ accountId })` (Task 1); `ContactFormModal` and `AccountFormModal` on an account alone (Task 2). Existing: `OrganizationsFrame`, `EmptyState`, `ErrorBlock`, `makeDetailStore`, `Where` (from `pages/accounts/testList.tsx`).
- Produces: `export function AccountDetails()` (the route element `App.tsx` already imports; no route change) and, test-only, `renderAccountPage(url?: string, options?: { width?: number; nav?: boolean }): { store }`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/accounts/testDetail.tsx`:

```tsx
// Test-only: the account page on the real store and router. Never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { makeDetailStore } from '../organizations/testDetail';
import { AccountDetails } from './Details';
import { Where } from './testList';

/** /accounts/:id as App.tsx routes it, with markers (each a Where) for the
 *  places it links to. `nav` adds the real Navbar. Only fetch is stubbed, by
 *  the caller (stubAccountPage). */
export function renderAccountPage(url = '/accounts/12', { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeDetailStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              path="/accounts/:id"
              element={
                <>
                  <AccountDetails />
                  <Where />
                </>
              }
            />
            {['/accounts/list', '/organizations/:id', '/contacts/:id', '/canvas/create', '/canvas/:id'].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <>
                    <p>Elsewhere</p>
                    <Where />
                  </>
                }
              />
            ))}
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

Replace `src/pages/accounts/Details.test.tsx` with:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ACCOUNT_LISTS,
  LINE_ITEMS,
  LINE_ITEM_RECORDS,
  accountStoryQueries,
  stubAccountPage,
} from '../../features/accounts/testAccountPage';
import { initechApac } from '../../features/accounts/testPortfolio';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { postBodies, requestPaths } from '../../features/organizations/testStory';
import { resetViewport } from '../../test/viewport';
import { renderAccountPage } from './testDetail';

// Integration tier: the real page, store and router; only fetch is stubbed,
// in backend #75's shapes (stubAccountPage). Every render starts from the
// URL alone: no navigation state, no mock data (spec 2026-09-29 §2).

const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const itemKeys = () => [...document.querySelectorAll('[data-story-item]')].map((el) => el.getAttribute('data-story-item'));
const landed = (name = 'Pizza EMEA') => screen.findByRole('heading', { level: 1, name });
const header = () => document.querySelector('[data-part="header"]') as HTMLElement;
type Spy = ReturnType<typeof stubAccountPage>;
const patches = (spy: Spy) =>
  spy.mock.calls
    .filter(([, init]) => init?.method === 'PATCH')
    .map(([input, init]) => [new URL(String(input)).pathname.replace(/^\/api\/v1/, ''), JSON.parse(String(init?.body))]);

describe('the account page (/accounts/:id)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    document.body.style.overflow = '';
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('lands by the URL id alone in three requests: the row, the record and the story', async () => {
    const spy = stubAccountPage();
    renderAccountPage();
    await landed();
    expect(within(header()).getByText('Carl CSM').closest('p')).toHaveTextContent('Carl CSM · Live · Touched 33d ago');
    expect(within(header()).getByText('Renewal overdue')).toBeInTheDocument();
    expect(within(header()).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7?account=12');
    expect(within(header()).getByRole('link', { name: 'Yum Brands' })).toHaveAttribute('href', '/organizations/9?account=12');
    expect(within(header()).getByRole('button', { name: 'ARR $69.6K. Show commercial details' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
    await waitFor(() => expect(itemKeys()).toEqual(['email:141', 'call:112', 'ticket:188', 'task:105', 'health:103']));
    for (const item of document.querySelectorAll('[data-story-item]')) expect(item).not.toHaveTextContent('Pizza EMEA');
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
    expect([...requestPaths(spy)].sort()).toEqual(['GET /accounts/12/', 'GET /accounts/12/story/', 'GET /accounts/portfolio/']);
    expect(accountStoryQueries(spy)[0].toString()).toBe('limit=30');
  });

  it('has the seven tabs, no account chips, and none of the removed parts', async () => {
    stubAccountPage();
    renderAccountPage();
    await landed();
    const tablist = screen.getByRole('tablist', { name: 'Account sections' });
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Story',
      'Details',
      'People',
      'Deals & risks',
      'Files',
      'Custom objects',
      'Canvases',
    ]);
    expect(screen.queryByRole('group', { name: 'Filter by account' })).not.toBeInTheDocument();
    for (const gone of [/Company View/, /Enable new 360 UI/, /Ask Copilot/, /Success Plans/, /coming soon/i, /Integrating Salesforce Data/, /Canvas List/]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('tab', { name: 'Organizations' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Knowledge' })).not.toBeInTheDocument();
  });

  it('keeps the tab in the URL, with arrows moving it, and never reads the story twice', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage();
    await landed();
    await waitFor(() => expect(itemKeys()).toHaveLength(5));
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(where().searchParams.get('tab')).toBe('details');
    await userEvent.keyboard('{ArrowRight}');
    expect(where().searchParams.get('tab')).toBe('people');
    expect(screen.getByRole('tab', { name: 'People' })).toHaveFocus();
    await userEvent.click(screen.getByRole('tab', { name: 'Story' }));
    expect(where().search).toBe('');
    expect(accountStoryQueries(spy)).toHaveLength(1);
  });

  it('opens on the tab the URL names, reading only what it shows', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage('/accounts/12?tab=canvases');
    await landed();
    expect(screen.getByRole('tab', { name: 'Canvases' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('link', { name: 'EMEA buying group' })).toHaveAttribute('href', '/canvas/301');
    expect(accountStoryQueries(spy)).toHaveLength(0);
  });

  it('reads an unknown tab as the Story', async () => {
    stubAccountPage();
    renderAccountPage('/accounts/12?tab=knowledge');
    await landed();
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
  });

  it('says the account is not found when the viewer may not open it', async () => {
    stubAccountPage({ row: null });
    renderAccountPage();
    expect(await screen.findByText('Account not found')).toBeInTheDocument();
    expect(screen.getByText('It may have been removed, or you may not have access to it.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to accounts' })).toHaveAttribute('href', '/accounts/list');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('says the account is not found for an id that is not a number, without asking the server', async () => {
    const spy = stubAccountPage();
    renderAccountPage('/accounts/acc-1');
    expect(await screen.findByText('Account not found')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('says so when the row cannot be read, and Try again reads it again', async () => {
    stubAccountPage({ failPortfolio: 1 });
    renderAccountPage();
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await landed()).toBeInTheDocument();
  });

  it('a tile jumps to its Details panel and focuses it', async () => {
    stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage();
    await landed();
    await userEvent.click(screen.getByRole('button', { name: 'ARR $69.6K. Show commercial details' }));
    expect(where().searchParams.get('tab')).toBe('details');
    await waitFor(() => expect(document.querySelector('[data-panel="commercial"]')).toHaveFocus());
  });

  it('Health opens the account pulse', async () => {
    stubAccountPage();
    renderAccountPage();
    await landed();
    await userEvent.click(screen.getByRole('button', { name: 'Health 4.9, Average. Show the account pulse' }));
    const pulse = screen.getByRole('region', { name: 'Account pulse' });
    expect(await within(pulse).findByText('AI pulse')).toBeInTheDocument();
    expect(pulse).toHaveTextContent('Account pulse: At risk · 2.4 / 5');
  });

  it('Edit saves through the first organisation, and the page reads the account again', async () => {
    const spy = stubAccountPage();
    renderAccountPage();
    await landed();
    const edit = within(header()).getByRole('button', { name: 'Edit' });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    expect(screen.getByRole('heading', { name: 'Edit Pizza EMEA' })).toBeInTheDocument();
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Pizza Europe');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await landed('Pizza Europe')).toBeInTheDocument();
    expect(patches(spy)).toEqual([['/customers/7/accounts/12/', expect.objectContaining({ name: 'Pizza Europe' })]]);
  });

  it('Edit on an account with no organisation the viewer may open saves on the account itself', async () => {
    const spy = stubAccountPage({ row: initechApac });
    renderAccountPage('/accounts/14');
    await landed('Initech APAC');
    const edit = within(header()).getByRole('button', { name: 'Edit' });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patches(spy)).toEqual([['/accounts/14/', expect.objectContaining({ name: 'Initech APAC' })]]));
  });

  it('hands the account over from Details with a note, and the name row follows', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage('/accounts/12?tab=details');
    await landed();
    await userEvent.click(await screen.findByRole('button', { name: 'Hand over' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Alice · Customer Success' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('New account owner'), '1');
    await userEvent.type(screen.getByLabelText('Handover note'), 'Covering while Carl is away');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(header()).getByText('Alice')).toBeInTheDocument());
    expect(patches(spy)).toEqual([['/accounts/12/', { owner_id: 1, handover_note: 'Covering while Carl is away' }]]);
  });

  it('⋯ adds a contact and a task on the account, and People and the Story show them', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS });
    renderAccountPage();
    await landed();
    await waitFor(() => expect(itemKeys()).toHaveLength(5));
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pizza EMEA' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add contact' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByLabelText(/^Email/), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(postBodies(spy, '/accounts/12/contacts/')).toHaveLength(1));
    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(await screen.findByRole('link', { name: 'Robin Ops' })).toHaveAttribute('href', '/contacts/901');

    await userEvent.click(screen.getByRole('tab', { name: 'Story' }));
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pizza EMEA' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    expect(dialog).toHaveAccessibleDescription('On Pizza EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Task title' }), 'Book the retraining');
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(itemKeys()).toContain('task:902'));
    expect(postBodies(spy, '/accounts/12/tasks/')).toHaveLength(1);
  });

  it('reads every other tab by the account alone, never through an organisation', async () => {
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS, definitions: [LINE_ITEMS], records: LINE_ITEM_RECORDS });
    renderAccountPage();
    await landed();
    for (const name of ['People', 'Deals & risks', 'Files', 'Custom objects', 'Canvases']) {
      await userEvent.click(screen.getByRole('tab', { name }));
    }
    expect(await screen.findByRole('heading', { name: 'Seat licence' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'EMEA buying group' })).toBeInTheDocument();
    await waitFor(() =>
      expect(requestPaths(spy)).toEqual(
        expect.arrayContaining([
          'GET /accounts/12/contacts/',
          'GET /accounts/12/opportunities/',
          'GET /accounts/12/risks/',
          'GET /accounts/12/files/',
          'GET /accounts/12/calls/',
          'GET /custom-objects/definitions/',
          'GET /custom-objects/records/',
          'GET /accounts/12/canvases/',
        ]),
      ),
    );
    expect(requestPaths(spy).filter((path) => path.includes('/customers/'))).toEqual([]);
  });

  it('never links an organisation the viewer may not open', async () => {
    stubAccountPage({ row: initechApac });
    renderAccountPage('/accounts/14?tab=details');
    await landed('Initech APAC');
    expect(document.querySelector('[data-part="part-of"]')).toBeNull();
    expect(screen.getByRole('region', { name: 'Knowledge' })).toHaveTextContent('there is none for this account that you can open');
    expect(document.querySelectorAll('a[href^="/organizations/"]')).toHaveLength(0);
  });

  it('on phones: the name row, a strip of tiles, then the scrolling tabs', async () => {
    stubAccountPage();
    renderAccountPage('/accounts/12', { width: 375 });
    await landed();
    expect(within(header()).getByRole('button', { name: /^ARR/ }).parentElement).toHaveClass('snap-x', 'overflow-x-auto');
    const tablist = screen.getByRole('tablist', { name: 'Account sections' });
    expect(tablist).toHaveClass('overflow-x-auto');
    expect(header().compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

Create `src/components/accounts/detail/houseRules.test.ts`:

```ts
import { houseRuleSuite } from '../../../test/houseRules';

// The design skill's §4 over every part of the account page, the page
// itself, and the shared parts it restyled.
houseRuleSuite('account page house rules', {
  ...(import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob(
    ['../../../pages/accounts/Details.tsx', '../../shared/CustomObjectsTab.tsx', '../../shared/CanvasListTab.tsx', '../../shared/OwnerTile.tsx'],
    { query: '?raw', eager: true, import: 'default' },
  ) as Record<string, string>),
});
```

Replace `src/pages/accounts/houseRules.test.ts` with:

```ts
import { houseRuleSuite } from '../../test/houseRules';

// The Accounts pages: the portfolio List and Board, and the account page.
houseRuleSuite(
  'accounts pages house rules',
  import.meta.glob(['./List.tsx', './Board.tsx', './Details.tsx'], { query: '?raw', eager: true, import: 'default' }) as Record<string, string>,
);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/pages/accounts/Details.test.tsx src/pages/accounts/houseRules.test.ts src/components/accounts/detail/houseRules.test.ts`
Expected: FAIL. The old page renders `ACCOUNTS_DATA[0]` (no "Pizza EMEA" heading, "Enable new 360 UI" present), and both house-rule suites flag the old `Details.tsx` (`text-[13.5px]`, `rgba(`).

- [ ] **Step 3: Implement**

Replace `src/pages/accounts/Details.tsx` with:

```tsx
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { ACCOUNT_TABS, parseAccountId, type AccountTab } from '../../features/accounts/accountPageParams';
import { fetchContactsForAccount, updateAccount, type Account } from '../../features/customers/customersSlice';
import { detailPanelId, detailTabId, storyFilters } from '../../features/organizations/detailParams';
import type { DetailScope } from '../../features/organizations/detailScope';
import { storyQuery } from '../../features/organizations/storyApi';
import type { AddKind } from '../../features/organizations/storyKinds';
import { AccountDetailsTab } from '../../components/accounts/detail/AccountDetailsTab';
import { AccountHeader } from '../../components/accounts/detail/AccountHeader';
import { AccountTiles } from '../../components/accounts/detail/AccountTiles';
import { CanvasesTab } from '../../components/accounts/detail/CanvasesTab';
import { useAccount } from '../../components/accounts/detail/useAccount';
import { useAccountPageParams } from '../../components/accounts/detail/useAccountPageParams';
import { ContactFormModal } from '../../components/contacts/ContactFormModal';
import { AddFlow } from '../../components/organizations/detail/AddFlow';
import { DealsTab } from '../../components/organizations/detail/DealsTab';
import { DetailTabs } from '../../components/organizations/detail/DetailTabs';
import { FilesCallsTab } from '../../components/organizations/detail/FilesCallsTab';
import { PeopleTab } from '../../components/organizations/detail/PeopleTab';
import { HeaderSkeleton, TabSkeleton } from '../../components/organizations/detail/Skeletons';
import { StoryTab } from '../../components/organizations/detail/StoryTab';
import { ShowAccountTags } from '../../components/organizations/detail/accountNames';
import { usePanelJump } from '../../components/organizations/detail/usePanelJump';
import { useStory } from '../../components/organizations/detail/useStory';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, QUIET } from '../../components/organizations/portfolio/styles';
import { CustomObjectsTab } from '../../components/shared/CustomObjectsTab';
import type { OwnerSummary } from '../../components/shared/OwnerTile';
import { AccountFormModal } from '../organizations/AccountFormModal';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

/** One account has no account chips: the organization page's lists get none. */
const NO_ACCOUNTS: Account[] = [];
const noop = () => {};

/** The page's column: the full width inside the frame's gutter, capped only
 *  past about 1920px, as the organization page's. */
const PAGE_COLUMN = 'mx-auto w-full max-w-[1800px]';

function Centered({ children }: { children: ReactNode }) {
  return (
    <OrganizationsFrame bleed>
      <div className={`${PAGE_COLUMN} py-6`}>{children}</div>
    </OrganizationsFrame>
  );
}

function NotFound() {
  return (
    <Centered>
      <EmptyState
        title="Account not found"
        detail="It may have been removed, or you may not have access to it."
        action={
          <Link to="/accounts/list" className={`${QUIET} border border-line`}>
            Back to accounts
          </Link>
        }
      />
    </Centered>
  );
}

/** Keyed by the route's id, so moving to another account starts from
 *  nothing: no story, sheets or visited tabs of the last one show under the
 *  next one's name. */
export function AccountDetails() {
  const { id } = useParams<{ id: string }>();
  const accountId = parseAccountId(id);
  // Not a number: nothing to ask the server.
  if (accountId === null) return <NotFound />;
  return <AccountPage key={accountId} accountId={accountId} />;
}

/** /accounts/:id, the account's story (spec 2026-09-29 §2): the organization
 *  page's design scoped to one account, read by the URL id alone (no
 *  navigation state, no mock). The name row and tiles come from the Accounts
 *  list's own row; the record adds the owner, the account pulse and the
 *  edit form; seven tabs whose choice, like the story's filters, lives in
 *  the URL. The rail slot waits for Ask (delivery 3). */
function AccountPage({ accountId }: { accountId: number }) {
  const isSm = useMediaQuery(SM);
  const dispatch = useAppDispatch();
  const { params, update } = useAccountPageParams();
  const idBase = useId();
  const me = useAppSelector((state) => state.auth.user);
  const canAssign = useCapability('view_all_accounts');

  const [version, setVersion] = useState(0);
  const [storyVersion, setStoryVersion] = useState(0);
  const [callsVersion, setCallsVersion] = useState(0);
  const reloadHeader = useCallback(() => setVersion((v) => v + 1), []);
  const account = useAccount(accountId, version);
  const row = account.row;
  const record = account.account;
  const name = row?.name ?? '';
  const scope = useMemo<DetailScope>(() => ({ kind: 'account', id: accountId, name }), [accountId, name]);

  // A tab mounts when first opened and then stays mounted, hidden while
  // another shows, as on the organization page: its data is read once and
  // the story keeps its place. Tracked during render, so the tab mounts in
  // the same render that selects it.
  const [visited, setVisited] = useState<ReadonlySet<AccountTab>>(() => new Set([params.tab]));
  if (!visited.has(params.tab)) setVisited(new Set(visited).add(params.tab));
  const story = useStory(scope, storyQuery(storyFilters(params)), storyVersion, visited.has('story'));

  const openDetails = useCallback(() => update({ tab: 'details' }), [update]);
  const jumpTo = usePanelJump(params.tab === 'details', row !== null, openDetails);

  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [adding, setAdding] = useState<AddKind | null>(null);

  // The owner as the record names them (with their function); undefined
  // until it lands. Who may hand over: the old page's rule, which the
  // backend's may_change_owner enforces for real.
  const owner: OwnerSummary | null | undefined = record
    ? record.owner
      ? { id: record.owner.id, name: record.owner.name, function: record.owner.function ?? null }
      : null
    : undefined;
  const mayChangeOwner = record !== null && (canAssign || !record.owner || record.owner.id === me?.id);
  const saveOwner = useCallback(
    async (userId: number | null, note: string) => {
      const result = await dispatch(updateAccount({ id: accountId, owner_id: userId, handover_note: note }));
      if (!updateAccount.fulfilled.match(result)) return false;
      reloadHeader();
      return true;
    },
    [dispatch, accountId, reloadHeader],
  );

  if (account.notFound) return <NotFound />;
  if (account.error && !row) {
    return (
      <Centered>
        <ErrorBlock message={account.error} onRetry={account.retry} />
      </Centered>
    );
  }

  const tab = params.tab;
  return (
    <OrganizationsFrame bleed>
      <ShowAccountTags.Provider value={false}>
        <div data-part="column" className={`${PAGE_COLUMN} flex flex-col gap-3 pb-6`}>
          {row ? (
            <section data-part="header" aria-label="Account summary" className="flex flex-col gap-3">
              <AccountHeader
                row={row}
                canEdit={record !== null}
                editError={account.accountError}
                onRetryEdit={account.retry}
                onEdit={() => setEditing(true)}
                onAddContact={() => setAddingContact(true)}
                onLogCall={() => setAdding('call')}
                onNewTask={() => setAdding('task')}
              />
              <AccountTiles
                row={row}
                currency={account.currency}
                account={record}
                accountError={account.accountError}
                isSm={isSm}
                onJump={jumpTo}
              />
            </section>
          ) : (
            <HeaderSkeleton isSm={isSm} label="Loading account" />
          )}

          {row && account.error ? (
            // A reload (after an edit or a handover) failed: the last row stays.
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 text-[13px] text-danger">
              <span>Could not refresh this account: {account.error}</span>
              <button type="button" onClick={account.retry} className={QUIET}>
                Try again
              </button>
            </div>
          ) : null}

          <DetailTabs idBase={idBase} active={tab} tabs={ACCOUNT_TABS} label="Account sections" onChange={(next) => update({ tab: next })} />

          {ACCOUNT_TABS.filter(({ key }) => key === tab || visited.has(key)).map(({ key }) => (
            <div
              key={key}
              role="tabpanel"
              id={detailPanelId(idBase, key)}
              aria-labelledby={detailTabId(idBase, key)}
              hidden={key !== tab}
              tabIndex={0}
              className={`min-w-0 rounded-sm ${FOCUS}`}
            >
              {key === 'story' ? (
                <StoryTab
                  scope={scope}
                  story={story}
                  params={params}
                  accounts={NO_ACCOUNTS}
                  isSm={isSm}
                  active={tab === 'story'}
                  onUpdate={update}
                  onAdded={(what) => {
                    setStoryVersion((v) => v + 1);
                    // Files keeps Calls mounted once opened: a call logged here reads its list again.
                    if (what === 'call') setCallsVersion((v) => v + 1);
                  }}
                  onJump={jumpTo}
                />
              ) : key === 'details' ? (
                row ? (
                  <AccountDetailsTab
                    row={row}
                    currency={account.currency}
                    isSm={isSm}
                    owner={owner}
                    mayChangeOwner={mayChangeOwner}
                    onSaveOwner={saveOwner}
                    onEdit={record ? () => setEditing(true) : undefined}
                  />
                ) : (
                  <TabSkeleton label="Loading details" />
                )
              ) : key === 'people' ? (
                <PeopleTab scope={scope} account="" accounts={NO_ACCOUNTS} isSm={isSm} onShowAll={noop} />
              ) : key === 'deals' ? (
                <DealsTab scope={scope} account="" accounts={NO_ACCOUNTS} isSm={isSm} onShowAll={noop} />
              ) : key === 'files' ? (
                <FilesCallsTab
                  scope={scope}
                  account=""
                  accounts={NO_ACCOUNTS}
                  isSm={isSm}
                  active={tab === 'files'}
                  callsVersion={callsVersion}
                  // The call is in the calls list already; the story reads again.
                  onCallLogged={() => setStoryVersion((v) => v + 1)}
                  onShowAll={noop}
                />
              ) : key === 'objects' ? (
                <CustomObjectsTab accountId={accountId} />
              ) : (
                <CanvasesTab accountId={accountId} />
              )}
            </div>
          ))}
        </div>
      </ShowAccountTags.Provider>

      {editing && record ? (
        <AccountFormModal
          account={record}
          onClose={() => {
            // The form reports an edit only through updateAccount's reducers:
            // read the row (name row, tiles, panels) and the story (Needs
            // attention's renewal) again.
            setEditing(false);
            reloadHeader();
            setStoryVersion((v) => v + 1);
          }}
        />
      ) : null}
      {addingContact ? (
        <ContactFormModal
          accountId={accountId}
          onClose={() => setAddingContact(false)}
          onSaved={() => void dispatch(fetchContactsForAccount({ accountId }))}
        />
      ) : null}
      {adding ? (
        <AddFlow
          what={adding}
          accountId={accountId}
          accountName={name || undefined}
          isSm={isSm}
          onClose={() => setAdding(null)}
          onAdded={() => {
            if (adding === 'call') setCallsVersion((v) => v + 1);
            setAdding(null);
            setStoryVersion((v) => v + 1);
          }}
        />
      ) : null}
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/pages/accounts src/components/accounts src/pages/organizations src/components/organizations`
Expected: PASS, 0 failed. (`List.test.tsx` and `Board.test.tsx` still pass: they route `/accounts/:id` to their own stand-in, not this page.)

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/pages/accounts/Details.tsx src/pages/accounts/Details.test.tsx src/pages/accounts/testDetail.tsx src/pages/accounts/houseRules.test.ts src/components/accounts/detail/houseRules.test.ts
git commit -m "$(cat <<'EOF'
feat(accounts): /accounts/:id is the account's story (delivery 2)

The organization page's design scoped to one account, read by the URL id
alone: the name row with Part of links, four tiles, and Story, Details,
People, Deals & risks, Files, Custom objects and Canvases in ?tab=. The
mock fallback, Company View, the Organizations tab, the pinned panel,
Success Plans and every dead control are gone.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The framed shell, and navigation state retired

**Files:**
- Modify: `src/layouts/DashboardLayout.tsx`, `src/layouts/DashboardLayout.test.tsx`, `src/components/layout/Navbar.tsx`, `src/components/layout/Navbar.test.tsx`, `src/components/accounts/portfolio/accountKind.ts`, `src/components/accounts/portfolio/accountKind.test.tsx`, `src/features/accounts/accountFields.test.ts`, `src/pages/accounts/testList.tsx`, `src/pages/accounts/List.test.tsx`, `src/pages/accounts/Board.test.tsx`, `src/e2e/accountsPortfolio.test.tsx`
- Delete: `src/features/accounts/accountNavState.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `/accounts/:id` renders inside `<main className="… p-0">` and under the framed Navbar with a "‹ Accounts" breadcrumb (`nav[aria-label="Breadcrumb"]` → `/accounts/list`). `ACCOUNT_KIND.linkState(row)` returns `undefined`. `accountNavRow` no longer exists.

- [ ] **Step 1: Write the failing tests**

In `src/layouts/DashboardLayout.test.tsx`, add `'/accounts/12'` and `'/accounts/12/'` to the `it.each` list after `'/accounts/board'`, with the comment `// …and an account's page, the organization page's bleed frame (accounts spec 2026-09-29 §2.1).`, and replace the "keeps the padding on other pages" test with:

```tsx
  it('keeps the padding on other pages', () => {
    const main = renderAt('/pipelines/board');
    expect(main).toHaveClass('p-2', 'md:p-3', 'lg:p-4');
  });
```

In `src/components/layout/Navbar.test.tsx`:
- add `<Route path="/accounts/list" element={<div>Accounts Marker</div>} />` to `renderNavbar`'s `<Routes>`;
- delete the `apacDivision` fixture and the whole `describe('Navbar account breadcrumb (/accounts/:id)', …)` block, and put in their place:

```tsx
describe('Navbar on an account page (/accounts/:id)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('wears the framed bar: a way back to Accounts, the actions slot, no avatar', () => {
    const setSlot = vi.fn();
    renderNavbar('/accounts/17', null, null, [], setSlot);
    const header = document.querySelector('header');
    expect(header).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    for (const cls of ['bg-surface', 'border-b', 'shadow-sm']) expect(header).not.toHaveClass(cls);
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Accounts' });
    expect(back).toHaveAttribute('href', '/accounts/list');
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(header!.querySelector('[data-nav-actions-slot]')).not.toBeNull();
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
  });

  it('leaves the name to the page and ignores navigation state (there is no mock account)', () => {
    renderNavbar({ pathname: '/accounts/17', state: { account: { name: 'APAC Division', orgName: 'Kraft Heinz' } } });
    expect(screen.queryByText('APAC Division')).not.toBeInTheDocument();
    expect(screen.queryByText('Kraft Heinz')).not.toBeInTheDocument();
    expect(document.querySelector('header img')).toBeNull();
  });

  it('takes you back to the list', async () => {
    renderNavbar('/accounts/17');
    await userEvent.click(screen.getByRole('link', { name: 'Accounts' }));
    expect(await screen.findByText('Accounts Marker')).toBeInTheDocument();
  });

  it('shows no breadcrumb on /accounts/list', () => {
    renderNavbar('/accounts/list');
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });
});
```

In `src/components/accounts/portfolio/accountKind.test.tsx`, delete the `accountNavRow` import and replace the "links to the account page with the row that page reads" test with:

```tsx
  it('links to the account page by its id alone', () => {
    expect(ACCOUNT_KIND.href(pizzaEmea)).toBe('/accounts/12');
    expect(ACCOUNT_KIND.linkState(pizzaEmea)).toBeUndefined();
  });
```

In `src/features/accounts/accountFields.test.ts`, delete the `import { accountNavRow } from './accountNavState';` line and the whole `describe('the row the account page reads', …)` block.

In `src/pages/accounts/testList.tsx`, add `useParams` to the `react-router-dom` import and replace the `AccountPage` stand-in with:

```tsx
/** Stands in for /accounts/:id (Details.tsx), saying which id it was sent to. */
function AccountPage() {
  const { id } = useParams();
  return <p data-testid="account-page">{`Account page ${id}`}</p>;
}
```

and change its route for organisations to `<Route path="/organizations/:id" element={<><p>Organization page</p><Where /></>} />`.

In `src/pages/accounts/List.test.tsx` rename `it("opens an account's page from its name, carrying the row that page reads", …)` to `it("opens an account's page from its name, by its id alone", …)` and change its assertion to `expect(await screen.findByTestId('account-page')).toHaveTextContent('Account page 12');`.
In `src/pages/accounts/Board.test.tsx` (test "opens a card in the side panel with its panels, and the account page from there") and `src/e2e/accountsPortfolio.test.tsx` (step 6; its comment becomes `// 6. Its name opens the account page by its id alone.`) change `'Pizza EMEA · organization 7'` to `'Account page 12'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.test.tsx src/components/accounts/portfolio/accountKind.test.tsx src/pages/accounts/List.test.tsx src/pages/accounts/Board.test.tsx src/e2e/accountsPortfolio.test.tsx`
Expected: FAIL: `/accounts/12` keeps `p-2`; the Navbar shows the mock account header (no Breadcrumb navigation); `linkState` returns `{ account: … }`.

- [ ] **Step 3: Implement**

In `src/layouts/DashboardLayout.tsx`, replace the `isAccountsView` comment and line with:

```ts
  // The Accounts list and board wear the Organizations frame too (accounts
  // spec 2026-09-29 §1), whose own px-4 pb-4 already gutters them — without
  // this <main> doubled the side padding and added a gap under the
  // transparent bar (fix round 1, 2026-09-30). An account's page wears the
  // organization page's bleed frame (§2.1), so it takes no padding either.
  const isAccountsView = /^\/accounts\/(list|board|\d+)\/?$/.test(location.pathname);
```

In `src/components/layout/Navbar.tsx`:
- delete `import { ACCOUNTS_DATA } from '../organizations/accountsData';`, `import type { AccountRow } from '../organizations/accountsData';` and `import { EntityAvatar } from '../shared';`;
- delete the block from `// Detect account details path (/accounts/:id — not /accounts/list,` through `    : null;` (the `accountMatch`, `accountId`, `accountNavState` and `account` constants);
- replace the `isAccountsView` comment's last sentence (`/accounts/:id is claimed by the \`account\` branch first.`) with nothing, and after the `isAccountsView` line add:

```ts
  // An account's page wears the same frame (accounts spec 2026-09-29 §2.1):
  // the page draws its own name row from the URL id, so the bar only leads
  // back, as on an organization's page. A trailing slash is the same route.
  const isAccountDetail = /^\/accounts\/\d+\/?$/.test(location.pathname);
```

- change `const isFramed = isDashboard || isOrgView || isOrgDetail || isContacts || isAccountsView;` to `const isFramed = isDashboard || isOrgView || isOrgDetail || isContacts || isAccountsView || isAccountDetail;`;
- replace the whole `{account ? ( … ) : isContacts ? (` opening (the mock header's JSX, from `{account ? (` down to the line before `) : isContacts ? (`) with:

```tsx
        {isAccountDetail ? (
          <nav aria-label="Breadcrumb" className="flex items-center h-full">
            <Link
              to="/accounts/list"
              className="-ml-2 inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Accounts
            </Link>
          </nav>
```

  so the chain continues `) : isContacts ? (` exactly as before.

In `src/components/accounts/portfolio/accountKind.ts`, delete `import { accountNavRow } from '../../../features/accounts/accountNavState';` and replace `linkState: (row) => ({ account: accountNavRow(row) }),` with:

```ts
  // The account page reads everything from its URL id (spec 2026-09-29 §2).
  linkState: () => undefined,
```

and change the kind's doc comment's last sentence to: `A move saves through the single-account PATCH on the first linked organisation the viewer may open.` (drop "and the account page with its row in the link").

Delete `src/features/accounts/accountNavState.ts`:

```bash
git rm src/features/accounts/accountNavState.ts
```

- [ ] **Step 4: Run the tests to verify they pass, and nothing reads the old helpers**

Run: `npx vitest run --maxWorkers=2 src/layouts src/components/layout src/components/accounts src/features/accounts src/pages/accounts src/e2e`
Expected: PASS, 0 failed.

Run: `grep -rn "accountNavRow\|accountNavState\|ACCOUNTS_DATA" src --include='*.ts' --include='*.tsx' | grep -v "components/organizations/accountsData.ts\|components/organizations/accountActivityData.ts"`
Expected: no output.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/components/accounts/portfolio/accountKind.ts src/components/accounts/portfolio/accountKind.test.tsx src/features/accounts/accountFields.test.ts src/pages/accounts/testList.tsx src/pages/accounts/List.test.tsx src/pages/accounts/Board.test.tsx src/e2e/accountsPortfolio.test.tsx
git commit -m "$(cat <<'EOF'
feat(accounts): the account page in the framed shell, nav state retired

/accounts/:id takes the organization page's bleed frame and a framed
"‹ Accounts" top bar; the Navbar's mock-account header is gone, and links
to an account no longer carry a row the page used to need.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: The jsdom journey, and the product documents

**Files:**
- Create: `src/e2e/accountPage.test.tsx`
- Modify: `src/pages/accounts/testList.tsx` (`realPage` option, files and calls slices), `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: `renderAccounts`, `stubAccountsPortfolio` (delivery 1); `stubAccountPage({ fallback })`, `ACCOUNT_LISTS` (Task 3); the page (Task 9) and shell (Task 10).
- Produces: `renderAccounts(url, { width?, nav?, realPage? })`: with `realPage`, `/accounts/:id` renders the real `AccountDetails`.

- [ ] **Step 1: Write the failing journey**

In `src/pages/accounts/testList.tsx`:
- add `import callsReducer from '../../features/calls/callsSlice';`, `import filesReducer from '../../features/files/filesSlice';` and `import { AccountDetails } from './Details';`;
- in `makeStore`, make the reducer `{ customers: customersReducer, auth: authReducer, notifications: notificationsReducer, files: filesReducer, calls: callsReducer }`;
- change the signature to `export function renderAccounts(url: string, { width = 1440, nav = false, realPage = false }: { width?: number; nav?: boolean; realPage?: boolean } = {})` and the `/accounts/:id` route's `<AccountPage />` to `{realPage ? <AccountDetails /> : <AccountPage />}`; update its doc comment's first line to `Both Accounts views, and the account page (the real one with \`realPage\`, else a stand-in), on the real store and router.`

Create `src/e2e/accountPage.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACCOUNT_LISTS, stubAccountPage } from '../features/accounts/testAccountPage';
import { stubAccountsPortfolio } from '../features/accounts/testPortfolio';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { postBodies } from '../features/organizations/testStory';
import { renderAccounts } from '../pages/accounts/testList';
import { resetViewport } from '../test/viewport';

// Delivery 2's journey in jsdom (spec 2026-09-29 §5): from the Accounts list
// to an account's story by its id alone, a note added to it, its Details,
// and on to one of its organisations with this account chosen. Only fetch is
// stubbed: the list's endpoints (stubAccountsPortfolio) behind the account
// page's (stubAccountPage).

const where = () => screen.getByTestId('where').textContent;
const itemKeys = () => [...document.querySelectorAll('[data-story-item]')].map((el) => el.getAttribute('data-story-item'));

describe('the account page, end to end', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
    document.body.style.overflow = '';
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('goes from the list to the story, adds a note, reads Details and opens an organisation', async () => {
    const list = stubAccountsPortfolio();
    const spy = stubAccountPage({ lists: ACCOUNT_LISTS, fallback: list });
    renderAccounts('/accounts/list', { nav: true, realPage: true });

    // 1. The list's name opens the account's story by its id alone.
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza EMEA' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Pizza EMEA' })).toBeInTheDocument();
    expect(where()).toBe('/accounts/12');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Accounts' })).toHaveAttribute(
      'href',
      '/accounts/list',
    );
    await waitFor(() => expect(itemKeys()).toHaveLength(5));

    // 2. + Add a note: saved on the account, and the story shows it.
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New note' }));
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    expect(dialog).toHaveAccessibleDescription('On Pizza EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note title' }), 'Kickoff');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note body' }), 'Met the new admin.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(itemKeys()).toContain('note:901'));
    expect(postBodies(spy, '/accounts/12/notes/')).toEqual([{ title: 'Kickoff', body: 'Met the new admin.' }]);

    // 3. Details: the panels, the CSAT bands and where knowledge lives.
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(where()).toBe('/accounts/12?tab=details');
    expect(screen.getByRole('region', { name: 'Account details' })).toBeInTheDocument();
    expect(await screen.findByText('CSAT responses', { selector: 'span' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Knowledge' })).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute(
      'href',
      '/organizations/7?tab=knowledge',
    );

    // 4. "Part of" opens the organisation with this account's chip chosen.
    const header = document.querySelector('[data-part="header"]') as HTMLElement;
    await userEvent.click(within(header).getByRole('link', { name: 'Pizza Hut' }));
    expect(await screen.findByText('Organization page')).toBeInTheDocument();
    expect(where()).toBe('/organizations/7?account=12');
  });
});
```

- [ ] **Step 2: Run the journey to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/e2e/accountPage.test.tsx`
Expected: FAIL at step 1 until `testList.tsx` is changed (the stand-in renders "Account page 12", no heading); after the `testList.tsx` edit above it runs against the real page. If Tasks 1–10 are in, it passes after Step 3's `testList.tsx` change — run it again then.

- [ ] **Step 3: Make it pass, and update the product documents**

Apply the `testList.tsx` edits above, then run:

Run: `npx vitest run --maxWorkers=2 src/e2e src/pages/accounts`
Expected: PASS, 0 failed.

`docs/03-ui-ux-design.md`:
- In the component table, after the row that starts `| Portfolio rows and board (\`components/organizations/portfolio/\`)`, add:

```markdown
| Account page (`components/accounts/detail/`) | `/accounts/:id`: `AccountHeader`, `AccountTiles` (the shared `DetailTiles`, Health opening `AccountPulseBreakdown`), `AccountDetailsTab`, `CanvasesTab`, `useAccount`, `useAccountPageParams`; the organization page's detail parts (`StoryTab`, `PeopleTab`, `DealsTab`, `FilesCallsTab`, `DetailTabs`) given an account `scope`. See "Account page" below |
```

- In "Portfolio rows and board (Accounts)", replace the bullet that begins "The name, and the sheet's and side panel's "Open account page", pass the row" with:

```markdown
- The name, and the sheet's and side panel's "Open account page", open
  `/accounts/:id` by its id alone: the account page reads everything from
  the URL.
```

- Insert, immediately before `### Organization page (\`/organizations/:id\`)`:

```markdown
### Account page (`/accounts/:id`)

The account's story: the organization page below, scoped to one account
(spec `docs/superpowers/specs/2026-09-29-accounts-redesign-design.md` §2),
read from the URL id alone. An id that is not a number, or one the viewer
may not open, shows "Account not found" with "Back to accounts". Rules
specific to it, enforced by `components/accounts/detail/houseRules.test.ts`
(which also scans `pages/accounts/Details.tsx`, `shared/CustomObjectsTab.tsx`,
`shared/CanvasListTab.tsx` and `shared/OwnerTile.tsx`):

- Frame: the organization page's bleed frame, the transparent top bar with
  "‹ Accounts", and the rail slot kept empty until Ask (delivery 3).
- Name row (`AccountHeader`): initials, the name at 22px, "owner · lifecycle ·
  Touched Nd ago" at 13px and the signal tag; then "Part of" with one link per
  linked organisation the viewer may open (`/organizations/:id?account=<id>`;
  a hidden one is never named or counted); Edit (icon-only below sm) and ⋯
  (Add contact, Log a call, New task).
- Tiles (`AccountTiles`): Health (ring and trend; opens the account pulse, its
  five signals, with a note that an account's health has no rubric), ARR (the
  workspace's currency), Renewal (runway; jumps to Commercial) and Pulse (jumps
  to Voice of the customer). A grid of four from sm, a snapping strip below.
- Tabs: Story, Details, People, Deals & risks, Files, Custom objects and
  Canvases (`?tab=story|details|people|deals|files|objects|canvases`). No
  account chips and no account tags: every record is this account's.
- Story: the organization page's Story on the account's story. Needs attention
  has no Knowledge row and its renewal row goes to Commercial; Feedback's
  "Manage surveys" opens `/surveys`.
- Details: the owner (Assign / Hand over with a note), the four
  `AccountPanels` with Edit details on the heading row, "CSAT responses" (the
  organization page's band bars over the account's answered CSAT surveys), the
  AI attributes, and Knowledge: a link to each openable organisation's
  Knowledge tab, or a line saying there is none the viewer can open.
- People, Deals & risks and Files: the organization page's lists, read and
  saved on the account alone.
- Custom objects and Canvases are list items, never tables: a summary line
  ("N records · M objects", "N canvases"); a section per object with Add
  record, an item per record (its first field as the title, the others by
  name), Edit and Delete per item; a canvas links to its editor, and New
  canvas opens `/canvas/create?accountId=<id>`.
- Phones: the name row, a strip of tiles, the tabs scrolling sideways, then
  full-width content.
```

`docs/04-app-flow.md`:
- In the route table, change the `/accounts/{list,board,:id}` row's middle cell to `` `AccountsList`, `AccountsBoard` (the Accounts portfolio), `AccountDetails` (the account's story, read by the URL id alone) ``.
- In §4.3, replace step 5 and the "Known flaw" blockquote after it with:

```markdown
5. An account's name opens `/accounts/:id` by its id alone (no navigation
   state).
6. `/accounts/:id` is the account's story
   (`docs/superpowers/specs/2026-09-29-accounts-redesign-design.md` §2). It
   lands in three requests: `GET /accounts/portfolio/?ids={id}&limit=1` (the
   list's own row: the name row, the tiles, the four Details panels and the
   currency), `GET /accounts/{id}/` (the owner and their function, the account
   pulse and the edit form) and `GET /accounts/{id}/story/` (the Story; no
   `account` is sent). An id that is not a number, or one with no row (the
   viewer may not open it), says "Account not found". The tabs, in the URL as
   `?tab=`, are Story, Details, People, Deals & risks, Files, Custom objects
   and Canvases; each other tab reads its data when first opened and stays
   mounted: People `GET /accounts/{id}/contacts/`, Deals & risks
   `…/opportunities/` and `…/risks/`, Files `…/files/` and `…/calls/`, Details
   `…/surveys/` (the CSAT bands) and `GET /attributes/values/?account={id}`,
   Custom objects `GET /custom-objects/definitions/` then
   `…/records/?definition={d}&account={id}`, Canvases `…/canvases/`. Every
   create goes to `/accounts/{id}/…` (contacts, opportunities, risks, files,
   calls, surveys, tasks, notes); none needs an organisation id.
7. Edit opens `AccountFormModal`, which PATCHes
   `/customers/{first openable organisation}/accounts/{id}/`, or
   `/accounts/{id}/` when there is none; the page then reads the row and the
   story again. Details' owner handover PATCHes
   `/accounts/{id}/ {owner_id, handover_note}`. ⋯ opens Add contact, Log a call
   and New task; New canvas opens `/canvas/create?accountId={id}`.
```

- In §4.4, replace its first paragraph ("The account page's (`/accounts/:id`) feed. …") with: `The old account page's feed. Both detail pages now use the Story (§4.2 step 5, §4.3 step 6), so no route renders \`ActivityFeed\`; removing it is a follow-up.`
- In §7, delete the rows "Success Plans tab on the account page", "Account page feed: Pulse, Conversations, Revenact Support", "Account page feed: search box, "Add Action", filter icon" and "`/accounts/:id` on refresh".

`.agents/workflows/repo-architecture.md`:
- In the component tree, after the `accounts/portfolio/` line add `│   │   ├── accounts/detail/    ← the account page: AccountHeader, AccountTiles, AccountPulseBreakdown, AccountDetailsTab, CanvasesTab, useAccount`.
- In the route tree, change `│   └── :id                    → Account Details page` to `│   └── :id                    → Account page (Details.tsx: the account's story, on GET /accounts/{id}/story/)`.
- In the table row for `features/accounts/*`, replace `` `accountNavRow`, `` with `` `accountPageParams`, `csat`, `` and add `` `features/accounts/testAccountPage.ts` (`stubAccountPage`) and `pages/accounts/testDetail.tsx` (`renderAccountPage`), `` before `and pages/accounts/testList.tsx`.
- Replace the body of `### 4. Accounts (\`pages/accounts/Details.tsx\`)` (the lines after the heading, up to the `---`) with:

```markdown
The account's story (spec 2026-09-29 §2), read by the URL id alone.
- `useAccount` reads the portfolio row (`GET /accounts/portfolio/?ids=`) and the record (`GET /accounts/<id>/`); `useAccountPageParams` keeps `?tab=` and the story's filters.
- The organization page's detail parts render with `scope={{kind: 'account', id, name}}` (`features/organizations/detailScope.ts`): the Story on `/accounts/<id>/story/`, People, Deals & risks and Files on `/accounts/<id>/…`; the account thunks take no organisation id (`lib/accountPaths.ts`).
- Its own parts are in `components/accounts/detail/`; Custom objects and Canvases are the restyled `shared/CustomObjectsTab` and `shared/CanvasListTab`.
```

- In the dependency tree, replace the `pages/accounts/Details.tsx` entry (its five indented lines) with:

```text
  ├── pages/accounts/Details.tsx  (GET /accounts/portfolio/?ids=, /accounts/{id}/, /accounts/{id}/story/)
  │     ├── components/accounts/detail/* (AccountHeader, AccountTiles, AccountDetailsTab, CanvasesTab, useAccount)
  │     ├── organizations/detail/* with an account scope (StoryTab, PeopleTab, DealsTab, FilesCallsTab, DetailTabs)
  │     └── shared/CustomObjectsTab, shared/CanvasListTab, shared/OwnerTile, shared/AIAttributesPanel
```

- [ ] **Step 4: Check the documents name only what exists**

Run: `grep -n "accountNavRow\|ACCOUNTS_DATA\|Known flaw" docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/e2e/accountPage.test.tsx src/pages/accounts/testList.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "$(cat <<'EOF'
test(accounts): the account page journey, and its product documents

From the Accounts list to an account's story by its id alone, a note added,
Details read, and on to its organisation with the account chosen. The UI,
app-flow and architecture documents describe the page.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Final verification, the browser check, and finishing the branch

**Files:** none changed unless a check fails.

- [ ] **Step 1: The whole suite, one process**

Run: `npx vitest run --maxWorkers=2`
Expected: every file passes, 0 failed.

- [ ] **Step 2: No organisation test was changed**

Run: `git diff --diff-filter=M --name-only "$(git merge-base HEAD main)" -- 'src/**/*.test.ts' 'src/**/*.test.tsx'`
Expected: exactly `src/components/accounts/portfolio/accountKind.test.tsx`, `src/components/layout/Navbar.test.tsx`, `src/components/shared/CustomObjectsTab.test.tsx`, `src/e2e/accountsPortfolio.test.tsx`, `src/features/accounts/accountFields.test.ts`, `src/layouts/DashboardLayout.test.tsx`, `src/pages/accounts/Board.test.tsx`, `src/pages/accounts/Details.test.tsx`, `src/pages/accounts/List.test.tsx`, `src/pages/accounts/houseRules.test.ts`, `src/pages/canvas/CanvasEditor.test.tsx`. No file under `components/organizations/`, `pages/organizations/`, `features/organizations/` or `src/e2e/organizations*`.

- [ ] **Step 3: Types, lint, build**

Run: `npx tsc -b`
Expected: exit 0, no output.

Run: `npm run lint`
Expected: 0 errors and 16 warnings (the count on `main` before this branch, all `react-hooks/set-state-in-effect` in older files); no file this branch added or changed appears in the output.

Run: `npm run build`
Expected: `tsc -b && vite build` completes and writes `dist/` (the existing chunk-size warning is not new).

- [ ] **Step 4: Nothing of the old page is left**

Run: `grep -rn "ACCOUNTS_DATA\|accountNavRow\|Integrating Salesforce\|Enable new 360" src --include='*.tsx' --include='*.ts' | grep -v "components/organizations/accountsData.ts\|components/organizations/accountActivityData.ts\|\.test\."`
Expected: no output.

- [ ] **Step 5: If anything failed**

Fix it with superpowers:systematic-debugging and commit the fix as `fix(accounts): <what>` with the Co-Authored-By line. Repeat Steps 1–4 until all pass; use superpowers:verification-before-completion before reporting.

- [ ] **Step 6: Controller browser check (the controller, not a subagent)**

Prerequisites: `revenact-backend` running on `:8000` on branch `feat/account-story` (backend #75, with `seed_demo_customers` and `seed_demo_accounts` data), and `npm run dev` on `:5173`. Load the claude-in-chrome tools in one ToolSearch call that includes `resize_window`. Screenshot each checkpoint.

1. Sign in as an admin. From `/accounts/list`, note an account linked to two organisations, one with an overdue renewal, and (if one exists) a user who owns an account whose organisation they cannot open.
2. **1440px, light.** Open an account from the list. The top bar is transparent with "‹ Accounts" and no avatar; the page has the 24px gutter and fills the width. The name row shows initials, name, "owner · lifecycle · Touched Nd ago", the signal and "Part of" links; ⋯ holds Add contact, Log a call, New task.
3. **Reload the page** (a direct visit): the same real account shows — never a mock. Change the id to a nonsense number: "Account not found".
4. **Tiles.** Health opens the account pulse (five signals); ARR and Renewal land on Commercial with the panel focused; Pulse lands on Voice of the customer.
5. **Story.** Needs attention appears only when something needs it; filters, Sources and search set the URL; + Add logs a task and it appears; an email opens its thread; no item carries an account tag.
6. **Tabs.** Details (owner with Hand over, the four panels, CSAT responses, AI attributes, the Knowledge link opening the organisation's Knowledge tab); People (summary, search, a name opens `/contacts/:id`); Deals & risks (switch, add an opportunity); Files (upload a small file; Calls, log one); Custom objects (records as items; add, edit, delete); Canvases (items; New canvas opens the editor for this account). `?tab=` follows every switch and survives a reload.
7. **Part of** opens `/organizations/:id?account=<id>` with this account's chip chosen.
8. **Dark theme at 1440px.** Repeat 2, 4 and 6 visually: every surface, tag, bar, ring and focus ring legible; no raw white or black.
9. **375px, light and dark.** Name row, then a swipeable strip of tiles, then tabs scrolling sideways, then full-width content; no horizontal page scroll; every control at least 44px; + Add and the email thread open as bottom sheets.
10. **Unchanged:** `/organizations/<id>` (chips, Knowledge, Archive/Churn, the health rubric breakdown) and `/accounts/list`, `/accounts/board` behave as before.
11. Record anything off as a follow-up, or fix it on this branch with a test before the PR.

- [ ] **Step 7: Whole-branch review and finishing**

1. Run superpowers:requesting-code-review over the whole branch (`git diff "$(git merge-base HEAD main)"`), answer it with superpowers:receiving-code-review, and commit fixes as `fix(accounts): …`.
2. Run superpowers:finishing-a-development-branch. Open the PR from `feat/account-page` with a body that lists the Decisions above that the owner may overrule (3, 6, 16), the follow-ups (a server-side account `csat_breakdown`; account headlines; the dead-module sweep of decision 17), the browser-check screenshots, and ends with:

```text
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

3. **Merge order:** backend #75 (`feat/account-story`) merges and deploys first; this frontend reads `/accounts/<id>/story/` and the flat `/accounts/<id>/…` routes, which do not exist before it. Merge this PR only after #75 is on `main` and deployed.

---

## Self-review

**Spec coverage.**
- §2.1 Frame (bleed frame, 24px gutter, rail slot): Task 9 (`OrganizationsFrame bleed`, no rail), Task 10 (`<main>` p-0, framed Navbar); decision 19.
- §2.2 Name row: initials, name, "owner · lifecycle · Touched Nd ago", signal — Task 6 `AccountHeader`; "Part of" links to `/organizations/:id?account=<this>`, only openable ones — Task 6 (decision 2), privacy test in Task 9; Edit and ⋯ (Add contact, Log a call, New task) — Tasks 6 and 9 (decision 15).
- §2.3 Tiles: Health ring, score, trend, breakdown — Task 6 (decision 3); ARR; Renewal runway; Pulse "AI n · CSM n", dots, "pulses disagree"; jumps to Details panels — Task 6 `DetailTiles`/`AccountTiles`, `usePanelJump`, Task 9 test; phones strip — Tasks 6 and 9.
- §2.4 Tabs (seven, real tablist, `?tab=`, no chips): Task 3 (`ACCOUNT_TABS`, params), Task 4 (`DetailTabs`), Task 9 tests.
- §2.5 Story: Needs attention (renewal, tickets, overdue tasks; no questions/anomaly) — Task 4 (`AttentionBlock`, `renewalPanel`); filters, Sources, search — the organisation `StoryToolbar` via `StoryTab` (Task 4); + Add four flows on the account — Tasks 2 and 4; stream by day, only this account's records — backend #75 plus `useStory` on the account path (Task 3).
- §2.6 Details: four panels with Edit details — Task 7 (`AccountPanels`); CSAT breakdown — Tasks 3 and 7 (decision 4); AI attributes with the account id — Task 7; knowledge line with a link per linked organisation — Task 7.
- §2.7 People (list items, name → `/contacts/:id`, summary, search) — Task 5.
- §2.8 Deals & risks (switch, list items, adds on the account) — Tasks 2 and 5.
- §2.9 Files (Files and Calls, uploads and calls on the account) — Tasks 1, 4 and 5.
- §2.9a Custom objects (existing tab, list items, count from the tab) — Task 8 (decision 10).
- §2.9b Canvases (list items, New canvas for this account, read through `/accounts/<id>/canvases/`) — Tasks 1, 2 and 8 (decision 12).
- §2.10 Removed (Company View, Organizations tab, pinned panel, Success Plans, 360 toggle, dead icon buttons, Salesforce placeholder, mock fallback): Task 9 (rewrite and the "removed parts" test), Task 10 (Navbar mock branch, nav state); "Ask Copilot" — decision 6.
- §2.11 Phones — Tasks 6 and 9 (strip, scrolling tabs, order), Task 12 step 6.9.
- Revisions (Custom objects, Canvases, AI attributes on Details, flat canvases route) — Tasks 7 and 8.
- Decisions table: no Knowledge tab, Details links to the organisation's — Task 7; frontend reuses the organisation page's parts — Tasks 4–6 (decision 7).
- §4 Delivery (review per task, whole-branch review, browser check at 1440 and 375 in both themes, backend first) — Task 12.
- §5 Testing: unit tests for the page parts (Tasks 3, 4, 6, 7, 8), integration through the real store and router with `fetch` stubbed in contract shapes (Tasks 5, 7, 9 via `stubAccountPage`), a jsdom journey (Task 11), the house-rules suite over the new files (Task 9), and the organisation pages' tests unchanged (every task's Step 4 and Task 12 step 2).
- Global constraints beyond the spec: URL-alone loading (Tasks 6, 9, 10), privacy (Tasks 6, 7, 9), `?tab=` (Tasks 3, 9), docs (Task 11), no CHANGELOG in this repo.

**Placeholder scan.** No step says "TBD", "handle edge cases" or "similar to Task N"; every code step shows the code, and every edit to an existing file names the exact text it replaces.

**Type consistency.**
- `DetailScope`, `ScopeProps`, `StoryTarget`, `resolveScope`, `scopeProps`, `scopeSlot`, `storyScope`, `storyPathOf` are defined in Task 3 and used with those names in Tasks 4, 5 and 9.
- `StoryParams`, `parseStoryParams`, `writeStoryParams`, `normaliseStory` (Task 3) are what `accountPageParams.ts` (Task 3) and `StoryTab` (Task 4) use.
- `fetchStoryAt`/`fetchThreadAt` (Task 3) are what `useStory` (Task 3) and `EmailThread` (Task 4) call.
- `listScope(null, id)` (Task 1) is what `scopeSlot` (Task 3) returns for an account, and what the account thunks file under (`listScope(undefined, id)`).
- `useAccount` returns `{ row, currency, account, loading, notFound, error, accountError, retry }` (Task 6), read by those names in Task 9; `AccountDetailsTab`'s `owner: OwnerSummary | null | undefined` (Task 7) is what Task 9 computes.
- `renewalPanel` is `PanelKey` on `AttentionBlock` (Task 4) and `'contract' | 'commercial'` on `DetailTiles` (Task 6); both values are `PanelKey`s.
- `AddFlow`'s `customerId?: number` (Task 4) is what `CallsSection` (Task 5) and the page (Task 9) pass (`undefined` on an account).
- `CanvasListTab`'s required `onRetry` (Task 8) is passed by its only caller, `CanvasesTab` (Task 8).
