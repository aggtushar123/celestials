# Organisation page, delivery 2 (frontend): the other tabs as lists — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn People, Deals & risks and Files on `/organizations/:id` into app-like lists filtered by the account chips (which move above the tabs and count per tab), move "+ Add account" into the name row, and give `/surveys` an organisation filter the page links to.

**Architecture:** The organisation page gets its own list components in `src/components/organizations/detail/` (PeopleTab, DealsTab, FilesSection, CallsSection and one item component each); the shared `ContactsTab`, `PipelinesTab`, `FilesTab` and `CallSenseTab` are not changed in behaviour, so `/accounts/:id` and every other route render as before. The lists keep reading the existing Redux slots (organisation roll-up endpoints) and filter client-side by the new `account_id` through one pure module (`features/organizations/accountScope.ts`); the page derives the chips' counts for the active tab from the same slots (`useChipCounts`). `/surveys` reads `?customer=` from the URL and passes it to `GET /surveys/?customer=<id>`.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, Redux Toolkit, react-router 7, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-27-organization-detail-delivery-2.md` (extends `docs/superpowers/specs/2026-09-26-organization-detail-design.md` §4). House rules: `.claude/skills/revenact-design/SKILL.md` §1 and §4.

## Global Constraints

- Owner's standing rules: app-ready, never spreadsheet-like, no information lost.
- Other routes must not change. `ContactsTab`, `PipelinesTab` (`src/components/shared/`), `FilesTab` and `CallSenseTab` (`src/components/organizations/activity/`) keep today's behaviour and markup; only pure helpers may move out of them (Task 6), with their tests still passing.
- Visited tabs stay mounted, inactive panels `hidden` (Details.tsx `visited` set). A list that opens a portal sheet closes it when its tab is not `active`.
- Page edges are pinned by `alignment.test.tsx`: the column stays `mx-auto w-full max-w-[1800px]` inside the frame's 24px gutter (`px-0 sm:px-6`, `px-4 sm:px-0`). Lists span the column; no `max-w-*`, no side padding, no inner scroll area.
- The chip row renders above the tabs on Story, People, Deals & risks and Files, never on Details or Knowledge. The selection stays in `?account=` (an id, `none`, or absent for All) and carries across those tabs.
- A chip's count follows the active tab: story items (Story), people (People), opportunities + risks (Deals & risks), files + calls (Files). With an account selected, "Edit <account>" stays at the end of the chip row.
- "+ Add account" moves into the name row, beside Edit (and ⋯).
- Backend contract (built in parallel, merged and deployed first): `/customers/{id}/files/` and `/customers/{id}/calls/` roll up organisation-level plus visible accounts' records, each with `account_id` and `account_name` (`account_id` null for organisation-level); `GET /surveys/?customer=<id>` filters to one organisation (unknown or invisible ids give an empty list); contacts, opportunities and risks gain `account_id`.
- In the TypeScript types `account_id` is optional (`account_id?: number | null`): absent reads as null (organisation-level). Other routes' fixtures predate the field.
- House rules §1/§4: tokens only (no hex, rgb or palette colours); type sizes 11/13/15/22 px only; numbers in DM Mono (`font-mono-brand tabular-nums`); Lucide icons only, `aria-hidden` when beside text; no card inside a card (one `bg-surface` list with `divide-y`); 44px targets below `sm` (`min-h-11 sm:min-h-9`, icon buttons `h-11 w-11 sm:h-9 sm:w-9`); designed empty, loading (skeleton, not spinner) and error-with-retry states on every list; phone layouts rendered conditionally from `isSm`; sentence-case copy; both themes through tokens; no motion added.
- Tests per the `testing` skill: a unit test per list item, integration through the real store and router (`makeDetailStore`, `renderOrganizationPage`, `stubOrganizationPage`), a jsdom end-to-end (choose an account, see People/Deals/Files narrow, upload to that account), and the house-rules suite over the new files (`detail/houseRules.test.ts` globs `./**/*.tsx`).
- Run Vitest with `--maxWorkers=2`.
- No new dependencies.
- Commits: conventional (`feat(organizations): …`, `test(organizations): …`), each ending with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Decisions this plan makes where the spec is silent

1. **Chip scope on the list tabs.** Story keeps its rule (a chip only for accounts the story counts). The list tabs count over every account the accounts endpoint returns, showing 0 where this viewer sees nothing; the lists themselves only ever hold visible records.
2. **"Average sentiment"** in the People summary is today's figure (the share of people with positive sentiment), shown as "N% positive sentiment".
3. **Creating on the chosen account** applies to Add contact and Log a call too (the spec states it for Deals and file uploads). With "Organization" or All chosen, records go on the organisation.
4. **Search stays** on People and on Deals & risks (title search, as today). Summaries follow the chip, not the search.
5. **Board** is offered from `sm`; phones get the list only (the board scrolls sideways).
6. **Deleting a file** now asks first (ConfirmDialog), as contacts and deals already do.
7. **Calls keep "Log a call"**, through the same "+ Add" sheet the Story uses (`AddFlow`).
8. **The `/surveys` picker** lists the first page of `/customers/`; an id not on it still shows as its own option.

## File structure

| File | Responsibility |
|---|---|
| `src/features/organizations/accountScope.ts` (new) | The chip rule over records: `inAccount`, `byAccount`, `countByAccount`, `chosenAccount`, `scopeLabel`, `accountTag` |
| `src/features/organizations/listSummaries.ts` (new) | The one-line summaries' figures (people, opportunities, risks, calls) |
| `src/features/organizations/detailParams.ts` | + `ACCOUNT_TABS` |
| `src/features/organizations/testStory.ts` | + list fixtures; stub serves, saves, edits and deletes contacts, opportunities, risks, files and calls |
| `src/features/files/fileFormat.ts` (new) | `FILE_ACCEPT`, `formatSize` (moved out of `FilesTab`); `canDeleteFile` (new, the same rule as `FilesTab`'s inline `canDelete`, which stays) |
| `src/features/calls/callFormat.ts` (new) | `durationLabel` (moved out of `CallSenseTab`) |
| `src/lib/contactLinks.ts` (new) | `mailtoHref`, `telHref` (moved out of `CustomerFacts`) |
| `src/features/customers/customersSlice.ts` | `account_id` on Contact/Opportunity/Risk; `fetchSurveys(customerId?)` with a latest-request guard |
| `src/features/files/filesSlice.ts`, `src/features/calls/callsSlice.ts` | `account_id`/`account_name` on Attachment and Call |
| `detail/listStyles.ts` (new) | Class strings the lists share |
| `detail/ListParts.tsx` (new) | `AccountTag`, `SummaryLine`, `ListSkeleton`, `ScopedEmpty`, `NoMatch`, `ListSearch` |
| `detail/PersonItem.tsx`, `detail/PeopleTab.tsx` | People list (PeopleTab rewritten) |
| `detail/DealItem.tsx`, `detail/DealsTab.tsx` | Deals & risks list (DealsTab rewritten) |
| `detail/FileItem.tsx`, `detail/FilesSection.tsx` | Files section |
| `detail/CallItem.tsx`, `detail/CallsSection.tsx` | Calls section |
| `detail/FilesCallsTab.tsx` | Composes the two sections (rewritten) |
| `detail/useChipCounts.ts` (new) | The chips' counts for the active tab |
| `detail/AccountChips.tsx`, `detail/OrganizationHeader.tsx` | Add account leaves the chips for the name row |
| `detail/StoryTab.tsx` | Manage surveys → `/surveys?customer=<id>`; uses `chosenAccount` |
| `src/pages/organizations/Details.tsx` | Wiring |
| `src/pages/surveys/SurveysPage.tsx` | `?customer=` filter and picker |
| `src/components/shared/ContactsTab.test.tsx`, `PipelinesTab.test.tsx` (moved) | Pin the shared tabs other routes still use |
| `docs/04-app-flow.md`, `docs/03-ui-ux-design.md` | Product documents |

---

### Task 1: The account-scope rule, the chip tabs and the `account_id` types

**Files:**
- Create: `src/features/organizations/accountScope.ts`
- Create: `src/features/organizations/accountScope.test.ts`
- Modify: `src/features/organizations/detailParams.ts` (append `ACCOUNT_TABS`)
- Modify: `src/features/organizations/detailParams.test.ts`
- Modify: `src/features/customers/customersSlice.ts` (Contact, Opportunity, Risk)
- Modify: `src/features/files/filesSlice.ts` (Attachment)
- Modify: `src/features/calls/callsSlice.ts` (Call)

**Interfaces:**
- Produces: `interface AccountTagged { account_id?: number | null }`; `inAccount(record: AccountTagged, selected: string): boolean`; `byAccount<T extends AccountTagged>(records: T[], selected: string): T[]`; `countByAccount(records: AccountTagged[], accountIds: number[]): Record<string, number>`; `chosenAccount(accounts: Account[], selected: string): Account | undefined`; `scopeLabel(accounts: Account[], selected: string): string | null`; `accountTag(record: { account_name?: string | null }): string`; `ACCOUNT_TABS: ReadonlySet<DetailTab>`; the optional `account_id` on `Contact`, `Opportunity`, `Risk`, `Attachment`, `Call` and `account_name` on `Attachment`, `Call`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/organizations/accountScope.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { accountTag, byAccount, chosenAccount, countByAccount, inAccount, scopeLabel } from './accountScope';
import { ACCOUNTS } from './testStory';

const onEmea = { account_id: 31 };
const onOrg = { account_id: null };
const untagged = {};

describe('the account chips on the lists (spec 2026-09-27 §1)', () => {
  it('All takes everything; Organization only records on the organization itself; an id only its own', () => {
    expect([onEmea, onOrg, untagged].map((r) => inAccount(r, ''))).toEqual([true, true, true]);
    expect([onEmea, onOrg, untagged].map((r) => inAccount(r, 'none'))).toEqual([false, true, true]);
    expect([onEmea, onOrg, untagged].map((r) => inAccount(r, '31'))).toEqual([true, false, false]);
  });

  it('filters a list, and hands All back the same array', () => {
    const list = [onEmea, onOrg];
    expect(byAccount(list, '')).toBe(list);
    expect(byAccount(list, '31')).toEqual([onEmea]);
    expect(byAccount(list, 'none')).toEqual([onOrg]);
  });

  it("counts in the story's shape: all, none, and every account at 0 when it has none", () => {
    expect(countByAccount([onEmea, onEmea, onOrg, { account_id: 99 }], [31, 32])).toEqual({
      all: 4,
      none: 1,
      '31': 2,
      '32': 0,
      '99': 1,
    });
    expect(countByAccount([], [31])).toEqual({ all: 0, none: 0, '31': 0 });
  });

  it('names the chosen account, and nothing for All, Organization or an id the organization does not have', () => {
    expect(chosenAccount(ACCOUNTS, '31')?.name).toBe('EMEA');
    expect(chosenAccount(ACCOUNTS, '')).toBeUndefined();
    expect(chosenAccount(ACCOUNTS, 'none')).toBeUndefined();
    expect(chosenAccount(ACCOUNTS, '99')).toBeUndefined();
  });

  it('labels the scope an empty list is empty for', () => {
    expect(scopeLabel(ACCOUNTS, '')).toBeNull();
    expect(scopeLabel(ACCOUNTS, 'none')).toBe('the organization itself');
    expect(scopeLabel(ACCOUNTS, '32')).toBe('North America');
    expect(scopeLabel(ACCOUNTS, '99')).toBe('this account');
  });

  it('tags a record with its account, or Organization', () => {
    expect(accountTag({ account_name: 'EMEA' })).toBe('EMEA');
    expect(accountTag({ account_name: null })).toBe('Organization');
    expect(accountTag({})).toBe('Organization');
  });
});
```

In `src/features/organizations/detailParams.test.ts`, add `ACCOUNT_TABS,` as the first name in the import from `./detailParams`, and add this test inside `describe('the organization page URL state', …)`, right after the "has six tabs" test:

```ts
  it('lets the account chips filter Story, People, Deals & risks and Files, not Details or Knowledge (spec 2026-09-27 §1)', () => {
    expect(DETAIL_TABS.filter(({ key }) => ACCOUNT_TABS.has(key)).map(({ key }) => key)).toEqual(['story', 'people', 'deals', 'files']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/organizations/accountScope.test.ts src/features/organizations/detailParams.test.ts --maxWorkers=2`
Expected: FAIL — `Failed to resolve import "./accountScope"` and `ACCOUNT_TABS` is undefined.

- [ ] **Step 3: Write the implementation**

Create `src/features/organizations/accountScope.ts`:

```ts
import type { Account } from '../customers/customersSlice';

// The account chips' rule on the organization page's lists (spec 2026-09-27
// §1): People, Deals & risks and Files read the organization's roll-up once
// and narrow it here by `account_id`, which is null on a record kept on the
// organization itself.

/** A record the chips can place. Optional in the types because other
 *  routes' fixtures predate the field; absent reads as null. */
export interface AccountTagged {
  account_id?: number | null;
}

/** Whether `record` is under the chip `selected`: '' is All, 'none' the
 *  organization itself, anything else an account id. */
export function inAccount(record: AccountTagged, selected: string): boolean {
  if (!selected) return true;
  const id = record.account_id ?? null;
  if (selected === 'none') return id === null;
  return id !== null && String(id) === selected;
}

/** The records under the chip; All hands back the same array. */
export function byAccount<T extends AccountTagged>(records: T[], selected: string): T[] {
  return selected ? records.filter((record) => inAccount(record, selected)) : records;
}

/** Counts in the story's `counts.by_account` shape: `all`, `none`, and
 *  every account of the organization (0 when it has nothing here). */
export function countByAccount(records: AccountTagged[], accountIds: number[]): Record<string, number> {
  const counts: Record<string, number> = { all: records.length, none: 0 };
  for (const id of accountIds) counts[String(id)] = 0;
  for (const record of records) {
    const key = record.account_id == null ? 'none' : String(record.account_id);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** The account the chip names, or undefined for All, Organization, or an id
 *  the organization does not have (a stale or hand-edited ?account=). New
 *  records go on it; without one they go on the organization. */
export function chosenAccount(accounts: Account[], selected: string): Account | undefined {
  return /^\d+$/.test(selected) ? accounts.find((account) => account.id === Number(selected)) : undefined;
}

/** What an empty list is empty for: null under All. */
export function scopeLabel(accounts: Account[], selected: string): string | null {
  if (!selected) return null;
  if (selected === 'none') return 'the organization itself';
  return chosenAccount(accounts, selected)?.name ?? 'this account';
}

/** The tag a list item shows: its account's name, or "Organization". */
export function accountTag(record: { account_name?: string | null }): string {
  return record.account_name ?? 'Organization';
}
```

Append to `src/features/organizations/detailParams.ts` (after `DETAIL_TABS`):

```ts
/** The tabs the account chips filter (spec 2026-09-27 §1). Details and
 *  Knowledge are the whole organization's, so the chips are not shown there. */
export const ACCOUNT_TABS: ReadonlySet<DetailTab> = new Set<DetailTab>(['story', 'people', 'deals', 'files']);
```

In `src/features/customers/customersSlice.ts`:

Replace (in `Contact`)

```ts
  last_contacted_at: string | null;
  companies: CompanyRef[];
  account_name: string | null;
}
```

with

```ts
  last_contacted_at: string | null;
  companies: CompanyRef[];
  account_name: string | null;
  /** The account it is on; null on the organization itself (spec
   *  2026-09-27 §6). Optional: fixtures from before it read as null. */
  account_id?: number | null;
}
```

Replace

```ts
  companies: CompanyRef[];
  account_name: string | null;
}

// The fields the Add/Edit Opportunity form actually exposes.
```

with

```ts
  companies: CompanyRef[];
  account_name: string | null;
  /** The account it is on; null on the organization itself. */
  account_id?: number | null;
}

// The fields the Add/Edit Opportunity form actually exposes.
```

Replace

```ts
  companies: CompanyRef[];
  account_name: string | null;
}

// The fields the Add/Edit Risk form actually exposes.
```

with

```ts
  companies: CompanyRef[];
  account_name: string | null;
  /** The account it is on; null on the organization itself. */
  account_id?: number | null;
}

// The fields the Add/Edit Risk form actually exposes.
```

In `src/features/files/filesSlice.ts`, replace

```ts
  download_url: string;
  created_at: string;
}
```

with

```ts
  download_url: string;
  created_at: string;
  /** The account it is on; null on the organization itself. The
   *  organization's list rolls up its visible accounts' files. */
  account_id?: number | null;
  account_name?: string | null;
}
```

In `src/features/calls/callsSlice.ts`, replace

```ts
  links: number;
  created_at: string;
}
```

with

```ts
  links: number;
  created_at: string;
  /** The account it is on; null on the organization itself. The
   *  organization's list rolls up its visible accounts' calls. */
  account_id?: number | null;
  account_name?: string | null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/organizations/accountScope.test.ts src/features/organizations/detailParams.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/organizations/accountScope.ts src/features/organizations/accountScope.test.ts src/features/organizations/detailParams.ts src/features/organizations/detailParams.test.ts src/features/customers/customersSlice.ts src/features/files/filesSlice.ts src/features/calls/callsSlice.ts
git commit -m "feat(organizations): the account chips' rule over list records

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Pin the shared ContactsTab and PipelinesTab before the page stops using them

The page's People and Deals tests exercise the shared tabs other routes still render. They move next to those components, on a harness that reads the data the way the old page tabs did, so Tasks 9 and 11 can replace the page tabs without losing that coverage. These are characterisation tests: they pass as soon as they are moved.

**Files:**
- Move: `src/components/organizations/detail/PeopleTab.test.tsx` → `src/components/shared/ContactsTab.test.tsx`
- Move: `src/components/organizations/detail/DealsTab.test.tsx` → `src/components/shared/PipelinesTab.test.tsx`

**Interfaces:**
- Consumes: `ContactsTab`, `PipelinesTab`, `makeDetailStore` (unchanged).
- Produces: nothing new.

- [ ] **Step 1: Move the files**

```bash
git mv src/components/organizations/detail/PeopleTab.test.tsx src/components/shared/ContactsTab.test.tsx
git mv src/components/organizations/detail/DealsTab.test.tsx src/components/shared/PipelinesTab.test.tsx
```

- [ ] **Step 2: Put ContactsTab on a harness**

In `src/components/shared/ContactsTab.test.tsx`, replace everything from the first line through the closing brace of `renderPeople` (the import block, the comment and `function renderPeople() { … }`) with:

```tsx
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { fetchContactsForCustomer } from '../../features/customers/customersSlice';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { makeDetailStore } from '../../pages/organizations/testDetail';
import { ContactsTab } from './ContactsTab';

// These tests pinned the organization page's People tab while it rendered
// this shared tab (delivery 1). Delivery 2 gives that page its own list; the
// account page still renders ContactsTab, so they stay here, on a harness
// that reads one organization's contacts the way the old People tab did.
function Harness({ customerId }: { customerId: number }) {
  const dispatch = useAppDispatch();
  const { contacts, contactsLoading, contactsError } = useAppSelector((state) => state.customers);
  useEffect(() => {
    dispatch(fetchContactsForCustomer(customerId));
  }, [dispatch, customerId]);
  return <ContactsTab contacts={contacts} isLoading={contactsLoading} error={contactsError} customerId={customerId} />;
}

function renderPeople() {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <Harness customerId={10} />
      </MemoryRouter>
    </Provider>,
  );
}
```

- [ ] **Step 3: Put PipelinesTab on a harness**

In `src/components/shared/PipelinesTab.test.tsx`, replace everything from the first line through the closing brace of `renderDeals` with:

```tsx
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { fetchOpportunitiesForCustomer, fetchRisksForCustomer } from '../../features/customers/customersSlice';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { makeDetailStore } from '../../pages/organizations/testDetail';
import { PipelinesTab } from './PipelinesTab';

// These tests pinned the organization page's Deals & risks tab while it
// rendered this shared tab (delivery 1). The account page still renders
// PipelinesTab, so they stay here, on a harness that reads one
// organization's opportunities and risks the way the old tab did.
function Harness({ customerId }: { customerId: number }) {
  const dispatch = useAppDispatch();
  const {
    pipelineOpportunities,
    pipelineOpportunitiesLoading,
    pipelineOpportunitiesError,
    pipelineRisks,
    pipelineRisksLoading,
    pipelineRisksError,
  } = useAppSelector((state) => state.customers);
  useEffect(() => {
    dispatch(fetchOpportunitiesForCustomer(customerId));
    dispatch(fetchRisksForCustomer(customerId));
  }, [dispatch, customerId]);
  return (
    <PipelinesTab
      opportunities={pipelineOpportunities}
      opportunitiesLoading={pipelineOpportunitiesLoading}
      opportunitiesError={pipelineOpportunitiesError}
      risks={pipelineRisks}
      risksLoading={pipelineRisksLoading}
      risksError={pipelineRisksError}
      customerId={customerId}
    />
  );
}

function renderDeals() {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <Harness customerId={10} />
      </MemoryRouter>
    </Provider>,
  );
}
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/components/shared/ContactsTab.test.tsx src/components/shared/PipelinesTab.test.tsx --maxWorkers=2`
Expected: PASS (every test that passed at its old path passes here).

- [ ] **Step 5: Commit**

(`git mv` already staged the removal of the old paths; naming them in `git add` fails with "pathspec did not match".)

```bash
git add src/components/shared/ContactsTab.test.tsx src/components/shared/PipelinesTab.test.tsx
git commit -m "test(shared): pin ContactsTab and PipelinesTab where other routes use them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The page stub serves, saves, edits and deletes the lists

**Files:**
- Modify: `src/features/organizations/testStory.ts`
- Create: `src/features/organizations/testStory.lists.test.ts`

**Interfaces:**
- Produces: fixtures `CONTACTS: Contact[]` (51 Dana Buyer on EMEA 31, 52 Sam Admin on North America 32, 53 Pat Finance on the organization), `OPPORTUNITIES: Opportunity[]` (61 on 31, 62 on the organization), `RISKS: Risk[]` (71 on 32), `FILES: Attachment[]` (81 on 31, uploaded by Alice; 82 on the organization, by Carl), `CALLS: Call[]` (12 on the organization, 13 on 31), `ORGANIZATION_LISTS: OrganizationLists`; `interface OrganizationLists { contacts?; opportunities?; risks?; files?; calls? }`; `OrganizationPageStub.lists?: OrganizationLists`. The stub answers `GET /customers/7/{contacts|opportunities|risks|files|calls}/` from `lists` (default empty), `POST /customers/7/[accounts/<id>/]{contacts|opportunities|risks|files}/` (tagged with that account), `PATCH|DELETE /{contacts|opportunities|risks|files}/<id>/`, and adds a logged call to `lists.calls` tagged with its account.

- [ ] **Step 1: Write the failing test**

Create `src/features/organizations/testStory.lists.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Contact, Opportunity } from '../customers/customersSlice';
import type { Call } from '../calls/callsSlice';
import { ORGANIZATION_LISTS, stubOrganizationPage } from './testStory';

const read = async (path: string, init?: RequestInit) => (await fetch(`http://localhost/api/v1${path}`, init)).json();

describe('stubOrganizationPage: the lists People, Deals & risks and Files read', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serves empty lists by default, and the given ones when asked', async () => {
    stubOrganizationPage();
    expect(await read('/customers/7/contacts/')).toEqual([]);
    vi.unstubAllGlobals();
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    expect(((await read('/customers/7/contacts/')) as Contact[]).map((c) => c.name)).toEqual(['Dana Buyer', 'Sam Admin', 'Pat Finance']);
    expect(((await read('/customers/7/calls/')) as Call[]).map((c) => c.account_id)).toEqual([null, 31]);
  });

  it('tags an upload with the account whose path it was sent to, and lists it first', async () => {
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    const form = new FormData();
    form.append('file', new File(['x'], 'Notes.txt', { type: 'text/plain' }));
    const saved = await read('/customers/7/accounts/31/files/', { method: 'POST', body: form });
    expect(saved).toMatchObject({ name: 'Notes.txt', account_id: 31, account_name: 'EMEA' });
    expect((await read('/customers/7/files/'))[0].id).toBe(saved.id);
  });

  it('saves an opportunity on an account, edits it and deletes it', async () => {
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    const saved = await read('/customers/7/accounts/32/opportunities/', { method: 'POST', body: JSON.stringify({ title: 'Upsell' }) });
    expect(saved).toMatchObject({ title: 'Upsell', account_id: 32, account_name: 'North America' });
    await read(`/opportunities/${saved.id}/`, { method: 'PATCH', body: JSON.stringify({ title: 'Upsell v2' }) });
    expect(((await read('/customers/7/opportunities/')) as Opportunity[]).map((o) => o.title)).toContain('Upsell v2');
    await fetch(`http://localhost/api/v1/opportunities/${saved.id}/`, { method: 'DELETE' });
    expect(((await read('/customers/7/opportunities/')) as Opportunity[]).map((o) => o.id)).toEqual([61, 62]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/organizations/testStory.lists.test.ts --maxWorkers=2`
Expected: FAIL — `ORGANIZATION_LISTS` is not exported.

- [ ] **Step 3: Extend the stub**

In `src/features/organizations/testStory.ts`:

(a) Replace `import type { Account, Customer } from '../customers/customersSlice';` with:

```ts
import type { Account, Contact, Customer, Opportunity, Risk } from '../customers/customersSlice';
import type { Attachment } from '../files/filesSlice';
import type { Call } from '../calls/callsSlice';
```

(b) Right after the `MEMBERS` constant, add:

```ts
const PIZZA_REF = [{ id: 7, name: 'Pizza Hut' }];

function contactFixture(id: number, name: string, extra: Partial<Contact>): Contact {
  return {
    id,
    name,
    role: 'other',
    role_display: 'Other',
    email: '',
    phone: '',
    status: 'active',
    sentiment: 'neutral',
    sentiment_source: 'manual',
    sentiment_evidence: {},
    sentiment_computed_at: null,
    last_contacted_at: null,
    companies: PIZZA_REF,
    account_name: null,
    account_id: null,
    ...extra,
  };
}

/** Pizza Hut's people: one on each account and one on the organization.
 *  The phone number is in Ofcom's range reserved for drama. */
export const CONTACTS: Contact[] = [
  contactFixture(51, 'Dana Buyer', {
    role: 'decision_maker',
    role_display: 'Decision Maker',
    email: 'dana@emea.northwind.example',
    phone: '+44 20 7946 0000',
    sentiment: 'positive',
    last_contacted_at: '2026-09-25T12:00:00Z',
    account_id: 31,
    account_name: 'EMEA',
  }),
  contactFixture(52, 'Sam Admin', {
    role: 'technical_lead',
    role_display: 'Technical Lead',
    email: 'sam@na.northwind.example',
    account_id: 32,
    account_name: 'North America',
  }),
  contactFixture(53, 'Pat Finance', { role: 'finance_manager', role_display: 'Finance Manager', status: 'inactive', sentiment: 'negative' }),
];

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: 61,
    title: 'EMEA seat expansion',
    mrr: '1200.00',
    stage: 'negotiation',
    stage_display: 'Negotiation',
    priority: 'high',
    priority_display: 'High',
    department: 'cs',
    department_display: 'Customer Success',
    companies: PIZZA_REF,
    account_id: 31,
    account_name: 'EMEA',
  },
  {
    id: 62,
    title: 'Analytics add-on',
    mrr: '300.00',
    stage: 'discovery',
    stage_display: 'Discovery',
    priority: 'medium',
    priority_display: 'Medium',
    department: '',
    department_display: '',
    companies: PIZZA_REF,
    account_id: null,
    account_name: null,
  },
];

export const RISKS: Risk[] = [
  {
    id: 71,
    title: 'Admin left',
    mrr: '800.00',
    stage: 'open',
    stage_display: 'Open',
    priority: 'high',
    priority_display: 'High',
    department: 'cs',
    department_display: 'Customer Success',
    companies: PIZZA_REF,
    account_id: 32,
    account_name: 'North America',
  },
];

export const FILES: Attachment[] = [
  {
    id: 81,
    name: 'Order form.pdf',
    content_type: 'application/pdf',
    size: 245760,
    description: 'Signed order form',
    source: 'upload',
    uploaded_by: { id: 1, name: 'Alice' },
    download_url: '/api/v1/files/81/download/',
    created_at: '2026-09-20T12:00:00Z',
    account_id: 31,
    account_name: 'EMEA',
  },
  {
    id: 82,
    name: 'QBR deck.pptx',
    content_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    size: 3145728,
    description: '',
    source: 'upload',
    uploaded_by: { id: 2, name: 'Carl CSM' },
    download_url: '/api/v1/files/82/download/',
    created_at: '2026-09-18T12:00:00Z',
    account_id: null,
    account_name: null,
  },
];

function callFixture(extra: Partial<Call> & Pick<Call, 'id' | 'title' | 'occurred_at'>): Call {
  return {
    host_name: 'Carl CSM',
    duration_minutes: 30,
    summary: '',
    sentiment: '',
    ai_area: '',
    ai_category: '',
    recording_url: '',
    connector_name: null,
    connector_provider: null,
    logged_by: { id: 2, name: 'Carl CSM' },
    transcript: null,
    participants: [],
    links: 0,
    created_at: extra.occurred_at,
    account_id: null,
    account_name: null,
    ...extra,
  };
}

/** Newest first, at noon UTC so each stays on its calendar day everywhere. */
export const CALLS: Call[] = [
  callFixture({
    id: 12,
    title: 'Quarterly check-in',
    occurred_at: '2026-09-25T12:00:00Z',
    summary: 'The admin left and usage fell. Agreed a retraining session.',
    sentiment: 'negative',
    participants: [{ id: 53, name: 'Pat Finance', role_display: 'Finance Manager', sentiment: 'negative' }],
  }),
  callFixture({
    id: 13,
    title: 'EMEA renewal call',
    occurred_at: '2026-09-24T12:00:00Z',
    summary: 'Quote accepted in principle.',
    sentiment: 'positive',
    duration_minutes: 45,
    recording_url: 'https://recordings.example/13',
    account_id: 31,
    account_name: 'EMEA',
  }),
];

/** What People, Deals & risks and Files read for Pizza Hut. */
export interface OrganizationLists {
  contacts?: Contact[];
  opportunities?: Opportunity[];
  risks?: Risk[];
  files?: Attachment[];
  calls?: Call[];
}

export const ORGANIZATION_LISTS: OrganizationLists = {
  contacts: CONTACTS,
  opportunities: OPPORTUNITIES,
  risks: RISKS,
  files: FILES,
  calls: CALLS,
};
```

(c) In `interface OrganizationPageStub`, after `failStory?: number;`, add:

```ts
  /** What People, Deals & risks and Files read (default: every list empty).
   *  Saves on these paths append, tagged with the account as the backend's
   *  serializers tag them; PATCH and DELETE change them in place. */
  lists?: OrganizationLists;
```

(d) In `stubOrganizationPage`, after `const accounts = stub.accounts ?? ACCOUNTS;`, add:

```ts
  const lists = {
    contacts: [...(stub.lists?.contacts ?? [])],
    opportunities: [...(stub.lists?.opportunities ?? [])],
    risks: [...(stub.lists?.risks ?? [])],
    files: [...(stub.lists?.files ?? [])],
    calls: [...(stub.lists?.calls ?? [])],
  };
  type ListKey = keyof typeof lists;
```

(e) Immediately before the line `const create = /^\/customers\/(\d+)\/(?:accounts\/(\d+)\/)?(tasks|notes|surveys|calls)\/$/.exec(path);`, add:

```ts
    const save = /^\/customers\/(\d+)\/(?:accounts\/(\d+)\/)?(contacts|opportunities|risks|files)\/$/.exec(path);
    if (save && method === 'POST') {
      const body = bodyOf(init);
      const accountId = save[2] ? Number(save[2]) : null;
      const account = accountId ? (accounts.find((a) => a.id === accountId) ?? null) : null;
      const tag = { account_id: accountId, account_name: account?.name ?? null };
      created += 1;
      const id = 900 + created;
      if (save[3] === 'files') {
        const file = body.file as File;
        const record: Attachment = {
          id,
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          size: file.size,
          description: String(body.description ?? ''),
          source: 'upload',
          uploaded_by: { id: 1, name: 'Alice' },
          download_url: `/api/v1/files/${id}/download/`,
          created_at: new Date().toISOString(),
          ...tag,
        };
        lists.files.unshift(record);
        return json(201, record);
      }
      const companies = [{ id: Number(save[1]), name: current?.name ?? '' }];
      if (save[3] === 'contacts') {
        const record: Contact = {
          id,
          name: String(body.name ?? ''),
          role: (body.role as Contact['role']) ?? 'other',
          role_display: 'Other',
          email: String(body.email ?? ''),
          phone: String(body.phone ?? ''),
          status: 'active',
          sentiment: 'neutral',
          sentiment_source: 'manual',
          sentiment_evidence: {},
          sentiment_computed_at: null,
          last_contacted_at: null,
          companies,
          ...tag,
        };
        lists.contacts.push(record);
        return json(201, record);
      }
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
      if (save[3] === 'opportunities') {
        const record: Opportunity = { ...deal, stage: (body.stage as Opportunity['stage']) ?? 'discovery', stage_display: 'Discovery' };
        lists.opportunities.push(record);
        return json(201, record);
      }
      const record: Risk = { ...deal, stage: (body.stage as Risk['stage']) ?? 'open', stage_display: 'Open' };
      lists.risks.push(record);
      return json(201, record);
    }

    const one = /^\/(contacts|opportunities|risks|files)\/(\d+)\/$/.exec(path);
    if (one && (method === 'PATCH' || method === 'DELETE')) {
      const list = lists[one[1] as ListKey] as { id: number }[];
      const at = list.findIndex((item) => item.id === Number(one[2]));
      if (at === -1) return json(404, { detail: 'Not found.' });
      if (method === 'DELETE') {
        list.splice(at, 1);
        return json(204, null);
      }
      list[at] = { ...list[at], ...bodyOf(init) };
      return json(200, list[at]);
    }
```

(f) In the `create` branch, replace the call's final return (from `      return json(201, {` with `host_name: 'Alice',` through its closing `      });`) with:

```ts
      const call: Call = {
        id,
        title,
        host_name: 'Alice',
        occurred_at: String(body.occurred_at ?? at),
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
        account_id: accountId,
        account_name: account?.name ?? null,
      };
      lists.calls.unshift(call);
      return json(201, call);
```

(g) In the `if (method === 'GET') {` block, immediately before `if (EMPTY_LIST.test(path) || …`, add:

```ts
      const listRead = /^\/customers\/(\d+)\/(contacts|opportunities|risks|files|calls)\/$/.exec(path);
      if (listRead && current && Number(listRead[1]) === current.id) {
        // A fresh copy of each record: the store freezes what it keeps.
        return json(200, (lists[listRead[2] as ListKey] as object[]).map((record) => ({ ...record })));
      }
```

Update the file's opening comment's list of what the stub answers to end with: "…archive and PATCH, and the lists People, Deals & risks and Files read (empty unless `lists` is given), with their saves, edits and deletes."

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/organizations src/pages/organizations src/components/organizations/detail --maxWorkers=2`
Expected: PASS (the new file, and every existing page test unchanged: lists default to empty).

- [ ] **Step 5: Commit**

```bash
git add src/features/organizations/testStory.ts src/features/organizations/testStory.lists.test.ts
git commit -m "test(organizations): the page stub serves and saves the tabs' lists

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: "+ Add account" moves into the name row

**Files:**
- Modify: `src/components/organizations/detail/OrganizationHeader.tsx`
- Modify: `src/components/organizations/detail/OrganizationHeader.test.tsx`
- Modify: `src/components/organizations/detail/fieldCoverage.test.tsx` (renders the header: the new required prop)
- Modify: `src/components/organizations/detail/AccountChips.tsx`
- Modify: `src/components/organizations/detail/AccountChips.test.tsx`
- Modify: `src/pages/organizations/Details.tsx`
- Modify: `src/pages/organizations/Details.test.tsx`

**Interfaces:**
- Produces: `OrganizationHeader` prop `onAddAccount: () => void` (required). `AccountChips` loses `onAdd`.

- [ ] **Step 1: Write the failing tests**

In `OrganizationHeader.test.tsx`, change the handlers in `renderHeader` to:

```ts
  const handlers = { onEdit: vi.fn(), onArchive: vi.fn(), onChurn: vi.fn(), onAddAccount: vi.fn() };
```

in the test "says why Edit is off when the record could not load, and tries again", add `onAddAccount={vi.fn()}` after `onChurn={vi.fn()}` in its own `<OrganizationHeader …>` render (the prop is required, so `tsc -b` fails without it),

and add, after the "Edit opens the edit form once the record is there" test:

```tsx
  it('adds an account from the name row, beside Edit, with a 44px target below sm', async () => {
    const { onAddAccount } = renderHeader();
    const add = screen.getByRole('button', { name: 'Add account' });
    expect(add.parentElement).toBe(screen.getByRole('button', { name: 'Edit' }).parentElement);
    expect(add).toHaveClass('min-h-11', 'min-w-11', 'sm:min-h-9', 'sm:min-w-0');
    await userEvent.click(add);
    expect(onAddAccount).toHaveBeenCalledOnce();
  });

  it('keeps Add account while the record loads: it needs only the organization', () => {
    renderHeader(pizzaHut, false);
    expect(screen.getByRole('button', { name: 'Add account' })).toBeEnabled();
  });
```

In `fieldCoverage.test.tsx`, in `renderPage`, change `onChurn={() => {}} />` on the `<OrganizationHeader …>` line to `onChurn={() => {}} onAddAccount={() => {}} />`.

In `AccountChips.test.tsx`:
- In `renderChips`, change the handlers to `const handlers = { onSelect: vi.fn(), onRetry: vi.fn(), onEdit: vi.fn() };`.
- Replace the test "adds an account, and edits the chosen one" with:

```tsx
  it('edits the chosen account, and leaves adding one to the name row', async () => {
    const { onEdit } = renderChips({ selected: '31' });
    expect(screen.queryByRole('button', { name: 'Add account' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit EMEA' }));
    expect(onEdit).toHaveBeenCalledWith(ACCOUNTS[0]);
  });
```

- Replace the test "offers no edit while All is chosen, and only Add when there are no accounts" with:

```tsx
  it('offers no edit while All is chosen, and nothing when there are no accounts', () => {
    renderChips({ accounts: [] });
    expect(chips()).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });
```

- In "keeps the chips, Edit and Add account in one wrapping row from sm", rename it to "keeps the chips and Edit in one wrapping row from sm" and delete its last line (the `Add account` `parentElement` expectation).

In `src/pages/organizations/Details.test.tsx`, replace the head of the test "adds an account from the chip row, and edits the chosen one":

```tsx
  it('adds an account from the chip row, and edits the chosen one', async () => {
    stubOrganizationPage();
    renderOrganizationPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }));
```

with

```tsx
  it('adds an account from the name row, and edits the chosen one from the chips', async () => {
    stubOrganizationPage();
    renderOrganizationPage();
    await landed();
    const header = document.querySelector('[data-part="header"]') as HTMLElement;
    await userEvent.click(within(header).getByRole('button', { name: 'Add account' }));
```

(the rest of that test stays).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/organizations/detail/OrganizationHeader.test.tsx src/components/organizations/detail/AccountChips.test.tsx src/pages/organizations/Details.test.tsx --maxWorkers=2`
Expected: FAIL — no "Add account" button in the header; the chips still render one.

- [ ] **Step 3: Implement**

In `OrganizationHeader.tsx`:
- Change the icon import to `import { Ellipsis, Pencil, Plus } from 'lucide-react';`.
- Update the doc comment's first sentence to: "The name row (spec §1.2, and 2026-09-27 §1): initials (never a third-party logo), the name, owner · lifecycle · last touch, the signal, then Edit, Add account and ⋯."
- Add the prop (after `onChurn: () => void;` in the type, and `onChurn,` in the destructuring):

```ts
  /** Opens the new-account form; it needs only the organization's id. */
  onAddAccount: () => void;
```

- In the actions `div`, right after the Edit `</button>`, add:

```tsx
        <button type="button" onClick={onAddAccount} className={`${BUTTON} min-w-11 justify-center sm:min-w-0`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {/* Icon-only below sm, where the row is short of room; the name stays. */}
          <span className="sr-only sm:not-sr-only">Add account</span>
        </button>
```

In `AccountChips.tsx`:
- Change the icon import to `import { Pencil } from 'lucide-react';`.
- Remove `onAdd,` from the destructuring and `onAdd: () => void;` from the props type.
- Delete the Add account button (the last `<button … onClick={onAdd} …>…Add account</button>`).
- Replace the doc comment with:

```ts
/** The account chips (spec §1.4, and 2026-09-27 §1): All, each account and
 *  the organization itself, numbered by the active tab's counts (the story's
 *  `counts.by_account` on Story; the lists' own on People, Deals & risks and
 *  Files). The chips stay name plus count; account figures live on the
 *  Details tab's Accounts section. With an account chosen the row ends with
 *  Edit <account>; adding one is on the name row. */
```

- Replace the comment above `const shown` with:

```ts
  // The accounts endpoint lists every account of the organization; the
  // story counts only those in this viewer's scope, so on Story an account
  // it leaves out is not this viewer's to filter by. The lists count every
  // account (0 where this viewer sees nothing), so there every chip shows.
```

- Replace the comment inside the returned `div` with: `{/* From sm the group lends its chips to the row (display: contents), so the chips and Edit wrap as one row; on phones the chips scroll sideways and Edit follows. */}`

In `Details.tsx`:
- In `<OrganizationHeader …>`, after `onChurn={() => setChurning(true)}`, add `onAddAccount={() => setAddingAccount(true)}`.
- In `<AccountChips …>`, delete `onAdd={() => setAddingAccount(true)}`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/pages/organizations --maxWorkers=2 && npx tsc -b`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/OrganizationHeader.tsx src/components/organizations/detail/OrganizationHeader.test.tsx src/components/organizations/detail/fieldCoverage.test.tsx src/components/organizations/detail/AccountChips.tsx src/components/organizations/detail/AccountChips.test.tsx src/pages/organizations/Details.tsx src/pages/organizations/Details.test.tsx
git commit -m "feat(organizations): Add account moves into the name row

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The chips sit above the tabs on Story, People, Deals & risks and Files, counting the active tab

**Files:**
- Create: `src/components/organizations/detail/useChipCounts.ts`
- Create: `src/components/organizations/detail/useChipCounts.test.tsx`
- Modify: `src/pages/organizations/Details.tsx`
- Modify: `src/pages/organizations/Details.test.tsx`

**Interfaces:**
- Consumes: `countByAccount`, `ACCOUNT_TABS` (Task 1); fixtures (Task 3).
- Produces: `useChipCounts(tab: DetailTab, storyCounts: Record<string, number> | null, accounts: Account[]): Record<string, number> | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/organizations/detail/useChipCounts.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { fetchCalls } from '../../../features/calls/callsSlice';
import { fetchContactsForCustomer, fetchOpportunitiesForCustomer, fetchRisksForCustomer } from '../../../features/customers/customersSlice';
import { fetchFiles } from '../../../features/files/filesSlice';
import type { DetailTab } from '../../../features/organizations/detailParams';
import { ACCOUNTS, CALLS, CONTACTS, FILES, OPPORTUNITIES, RISKS } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { useChipCounts } from './useChipCounts';

const ORG = { entityType: 'organization' as const, customerId: 7 };

function setup(tab: DetailTab, storyCounts: Record<string, number> | null = null) {
  const store = makeDetailStore();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useChipCounts(tab, storyCounts, ACCOUNTS), { wrapper });
  return { store, result };
}

describe('useChipCounts: the chips count the active tab (spec 2026-09-27 §1)', () => {
  it("Story: the story's own facet counts", () => {
    expect(setup('story', { all: 5, none: 3, '31': 1, '32': 1 }).result.current).toEqual({ all: 5, none: 3, '31': 1, '32': 1 });
  });

  it('People: the people by account, and no numbers while they load', () => {
    const { store, result } = setup('people');
    act(() => {
      store.dispatch(fetchContactsForCustomer.pending('r1', 7));
    });
    expect(result.current).toBeNull();
    act(() => {
      store.dispatch(fetchContactsForCustomer.fulfilled(CONTACTS, 'r1', 7));
    });
    expect(result.current).toEqual({ all: 3, none: 1, '31': 1, '32': 1 });
  });

  it('Deals & risks: opportunities plus risks, once both have landed', () => {
    const { store, result } = setup('deals');
    act(() => {
      store.dispatch(fetchOpportunitiesForCustomer.pending('r1', 7));
      store.dispatch(fetchRisksForCustomer.pending('r2', 7));
      store.dispatch(fetchOpportunitiesForCustomer.fulfilled(OPPORTUNITIES, 'r1', 7));
    });
    expect(result.current).toBeNull();
    act(() => {
      store.dispatch(fetchRisksForCustomer.fulfilled(RISKS, 'r2', 7));
    });
    expect(result.current).toEqual({ all: 3, none: 1, '31': 1, '32': 1 });
  });

  it('Files: files plus calls', () => {
    const { store, result } = setup('files');
    act(() => {
      store.dispatch(fetchFiles.fulfilled(FILES, 'r1', ORG));
      store.dispatch(fetchCalls.fulfilled(CALLS, 'r2', ORG));
    });
    expect(result.current).toEqual({ all: 4, none: 2, '31': 2, '32': 0 });
  });

  it('shows no numbers after a failed read', () => {
    const { store, result } = setup('people');
    act(() => {
      store.dispatch(fetchContactsForCustomer.rejected(null, 'r1', 7, 'Could not load contacts.'));
    });
    expect(result.current).toBeNull();
  });

  it('has nothing to count on Details and Knowledge', () => {
    expect(setup('details').result.current).toBeNull();
    expect(setup('knowledge').result.current).toBeNull();
  });
});
```

In `src/pages/organizations/Details.test.tsx`, rename the test "filters the story by account in the URL, and shows the chips on the Story tab only" to "filters the story by account in the URL, and keeps the chips on Story, People, Deals & risks and Files", and replace its last four lines:

```tsx
    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(where().searchParams.get('tab')).toBe('people');
    expect(screen.queryByRole('group', { name: 'Filter by account' })).not.toBeInTheDocument();
    expect(where().searchParams.get('account')).toBe('31');
```

with:

```tsx
    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(where().searchParams.get('tab')).toBe('people');
    const chips = screen.getByRole('group', { name: 'Filter by account' });
    expect(within(chips).getByRole('button', { name: /^EMEA/ })).toHaveAttribute('aria-pressed', 'true');
    // The chips sit above the tabs.
    expect(chips.compareDocumentPosition(screen.getByRole('tablist'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    for (const whole of ['Details', 'Knowledge']) {
      await userEvent.click(screen.getByRole('tab', { name: whole }));
      expect(screen.queryByRole('group', { name: 'Filter by account' })).not.toBeInTheDocument();
    }
    expect(where().searchParams.get('account')).toBe('31');
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/organizations/detail/useChipCounts.test.tsx src/pages/organizations/Details.test.tsx --maxWorkers=2`
Expected: FAIL — `./useChipCounts` does not resolve; the People tab has no chip group.

- [ ] **Step 3: Implement**

Create `src/components/organizations/detail/useChipCounts.ts`:

```ts
import { useMemo } from 'react';
import { useAppSelector } from '../../../hooks';
import type { Account } from '../../../features/customers/customersSlice';
import { countByAccount } from '../../../features/organizations/accountScope';
import type { DetailTab } from '../../../features/organizations/detailParams';

/** The account chips' numbers on the active tab (spec 2026-09-27 §1): the
 *  story's own facet counts on Story; people, opportunities plus risks, and
 *  files plus calls on the other three, counted from the lists those tabs
 *  read. Null while a list loads or after it failed, so a chip shows no
 *  number rather than a wrong one, and on Details and Knowledge. */
export function useChipCounts(
  tab: DetailTab,
  storyCounts: Record<string, number> | null,
  accounts: Account[],
): Record<string, number> | null {
  const contacts = useAppSelector((state) => state.customers.contacts);
  const contactsBusy = useAppSelector((state) => state.customers.contactsLoading || state.customers.contactsError !== null);
  const opportunities = useAppSelector((state) => state.customers.pipelineOpportunities);
  const risks = useAppSelector((state) => state.customers.pipelineRisks);
  const dealsBusy = useAppSelector(
    (state) =>
      state.customers.pipelineOpportunitiesLoading ||
      state.customers.pipelineRisksLoading ||
      state.customers.pipelineOpportunitiesError !== null ||
      state.customers.pipelineRisksError !== null,
  );
  const files = useAppSelector((state) => state.files.items);
  const calls = useAppSelector((state) => state.calls.items);
  const filesBusy = useAppSelector(
    (state) => state.files.isLoading || state.calls.isLoading || state.files.error !== null || state.calls.error !== null,
  );

  return useMemo(() => {
    const ids = accounts.map((account) => account.id);
    switch (tab) {
      case 'story':
        return storyCounts;
      case 'people':
        return contactsBusy ? null : countByAccount(contacts, ids);
      case 'deals':
        return dealsBusy ? null : countByAccount([...opportunities, ...risks], ids);
      case 'files':
        return filesBusy ? null : countByAccount([...files, ...calls], ids);
      default:
        return null;
    }
  }, [tab, storyCounts, accounts, contacts, contactsBusy, opportunities, risks, dealsBusy, files, calls, filesBusy]);
}
```

In `src/pages/organizations/Details.tsx`:
- In the import from `'../../features/organizations/detailParams'`, add `ACCOUNT_TABS,` before `DETAIL_TABS,`.
- After `import { useStory } from '../../components/organizations/detail/useStory';`, add `import { useChipCounts } from '../../components/organizations/detail/useChipCounts';`.
- Right after the effect that dispatches `fetchAccountsForCustomer(orgId)`, add:

```ts
  // The chips' numbers follow the tab (spec 2026-09-27 §1).
  const chipCounts = useChipCounts(params.tab, story.data?.counts.by_account ?? null, accounts);
```

- Replace `{tab === 'story' ? (` (the one opening `<AccountChips`) with `{ACCOUNT_TABS.has(tab) ? (`, and in `<AccountChips …>` replace `counts={story.data?.counts.by_account ?? null}` with `counts={chipCounts}`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/pages/organizations --maxWorkers=2 && npx tsc -b`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/useChipCounts.ts src/components/organizations/detail/useChipCounts.test.tsx src/pages/organizations/Details.tsx src/pages/organizations/Details.test.tsx
git commit -m "feat(organizations): account chips above the tabs, counting the active tab

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Pure helpers the lists need (summaries, sizes, durations, contact links)

`formatSize`, the file `accept` list, `durationLabel` and the mailto rule move out of components so the new lists reuse them; the old components import them back, unchanged in behaviour.

**Files:**
- Create: `src/features/organizations/listSummaries.ts`, `src/features/organizations/listSummaries.test.ts`
- Create: `src/features/files/fileFormat.ts`, `src/features/files/fileFormat.test.ts`
- Create: `src/features/calls/callFormat.ts`, `src/features/calls/callFormat.test.ts`
- Create: `src/lib/contactLinks.ts`, `src/lib/contactLinks.test.ts`
- Modify: `src/components/organizations/activity/FilesTab.tsx` (import `FILE_ACCEPT`, `formatSize`)
- Modify: `src/components/organizations/activity/CallSenseTab.tsx` (import `durationLabel`)
- Modify: `src/components/organizations/detail/CustomerFacts.tsx` (import `mailtoHref`)

**Interfaces:**
- Produces: `interface SummaryPart { value: string; label: string }`; `peopleSummary(people: Contact[]): SummaryPart[]`; `opportunitiesSummary(rows: Opportunity[], currency: CurrencyCode): SummaryPart[]`; `risksSummary(rows: Risk[], currency: CurrencyCode): SummaryPart[]`; `callsSummary(calls: Call[]): SummaryPart[]`; `FILE_ACCEPT: string`; `formatSize(bytes: number): string`; `canDeleteFile(file: Pick<Attachment, 'uploaded_by'>, meId: number | null, isAdmin: boolean): boolean`; `durationLabel(minutes: number | null): string`; `mailtoHref(email: string): string | null`; `telHref(phone: string): string | null`.

- [ ] **Step 1: Write the failing tests**

`src/features/organizations/listSummaries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { callsSummary, opportunitiesSummary, peopleSummary, risksSummary, type SummaryPart } from './listSummaries';
import { CALLS, CONTACTS, OPPORTUNITIES, RISKS } from './testStory';

const text = (parts: SummaryPart[]) => parts.map((part) => `${part.value} ${part.label}`).join(' · ');

describe('the one-line summaries that replace the stat cards (spec 2026-09-27 §2–4)', () => {
  it('people: count, decision makers, active, and the share with positive sentiment', () => {
    expect(text(peopleSummary(CONTACTS))).toBe('3 people · 1 decision maker · 2 active · 33% positive sentiment');
    expect(text(peopleSummary([CONTACTS[0]]))).toBe('1 person · 1 decision maker · 1 active · 100% positive sentiment');
    expect(text(peopleSummary([]))).toBe('0 people · 0 decision makers · 0 active · 0% positive sentiment');
  });

  it("opportunities and risks: today's four figures each", () => {
    expect(text(opportunitiesSummary(OPPORTUNITIES, 'USD'))).toBe('2 opportunities · $1,500.00 pipeline MRR · 1 high priority · 0 closed won');
    expect(text(risksSummary(RISKS, 'USD'))).toBe('1 risk · $800.00 MRR at risk · 1 high priority · 0 realised');
  });

  it('calls: count, time on calls when known, and the sentiment split', () => {
    expect(text(callsSummary(CALLS))).toBe('2 calls · 1 h 15 min on calls · 1 positive · 0 neutral · 1 negative');
    expect(text(callsSummary([{ ...CALLS[0], duration_minutes: null }]))).toBe('1 call · 0 positive · 0 neutral · 1 negative');
  });
});
```

`src/features/files/fileFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canDeleteFile, formatSize } from './fileFormat';

describe('file formatting', () => {
  it('sizes in B, KB and MB', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(245760)).toBe('240 KB');
    expect(formatSize(3145728)).toBe('3.0 MB');
  });

  it('lets the uploader or an admin delete, nobody else', () => {
    const file = { uploaded_by: { id: 2, name: 'Carl CSM' } };
    expect(canDeleteFile(file, 2, false)).toBe(true);
    expect(canDeleteFile(file, 1, true)).toBe(true);
    expect(canDeleteFile(file, 1, false)).toBe(false);
    expect(canDeleteFile({ uploaded_by: null }, null, false)).toBe(false);
  });
});
```

`src/features/calls/callFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { durationLabel } from './callFormat';

describe('durationLabel', () => {
  it('reads minutes as minutes and hours', () => {
    expect(durationLabel(null)).toBe('');
    expect(durationLabel(45)).toBe('45 min');
    expect(durationLabel(60)).toBe('1 h');
    expect(durationLabel(75)).toBe('1 h 15 min');
  });
});
```

`src/lib/contactLinks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mailtoHref, telHref } from './contactLinks';

describe('contact links', () => {
  it('encodes only the part before the @, and refuses an address that could carry its own query', () => {
    expect(mailtoHref('dana@emea.northwind.example')).toBe('mailto:dana@emea.northwind.example');
    expect(mailtoHref('a b@x.example')).toBe('mailto:a%20b@x.example');
    expect(mailtoHref('a?cc=b@x.example')).toBeNull();
    expect(mailtoHref('')).toBeNull();
  });

  it('keeps only digits and the plus in a tel: link', () => {
    expect(telHref('+44 20 7946 0000')).toBe('tel:+442079460000');
    expect(telHref('n/a')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/organizations/listSummaries.test.ts src/features/files/fileFormat.test.ts src/features/calls/callFormat.test.ts src/lib/contactLinks.test.ts --maxWorkers=2`
Expected: FAIL — none of the four modules exist.

- [ ] **Step 3: Implement**

`src/features/calls/callFormat.ts`:

```ts
/** "45 min", "1 h", "1 h 15 min"; '' when the length is not known. */
export function durationLabel(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
```

`src/features/files/fileFormat.ts`:

```ts
import type { Attachment } from './filesSlice';

/** What the Files upload accepts (the backend enforces the same list). */
export const FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.md,.vtt,.srt,.json,.png,.jpg,.jpeg,.gif,.webp,.mp3,.m4a,.wav';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The uploader or an admin may delete a file (the server applies the same rule). */
export function canDeleteFile(file: Pick<Attachment, 'uploaded_by'>, meId: number | null, isAdmin: boolean): boolean {
  return isAdmin || (meId !== null && file.uploaded_by?.id === meId);
}
```

`src/lib/contactLinks.ts`:

```ts
/** A `mailto:` for an address, or null when it must be shown as text: an
 *  address with `?`, `&` or `#` could carry its own mailto query (cc=, bcc=,
 *  body=). Only the local part (before the last `@`) is encoded; the domain
 *  never is, and the visible text stays the raw address. */
export function mailtoHref(email: string): string | null {
  if (!email || /[?&#]/.test(email)) return null;
  const at = email.lastIndexOf('@');
  if (at === -1) return `mailto:${encodeURIComponent(email)}`;
  return `mailto:${encodeURIComponent(email.slice(0, at))}@${email.slice(at + 1)}`;
}

/** A `tel:` keeping only digits and the plus, or null when none are left. */
export function telHref(phone: string): string | null {
  const dialled = phone.replace(/[^\d+]/g, '');
  return dialled ? `tel:${dialled}` : null;
}
```

`src/features/organizations/listSummaries.ts`:

```ts
import type { CurrencyCode } from '../auth/authSlice';
import { durationLabel } from '../calls/callFormat';
import type { Call } from '../calls/callsSlice';
import type { Contact, Opportunity, Risk } from '../customers/customersSlice';
import { formatMoney } from '../customers/formatters';

// The one-line summaries above the organization page's lists (spec
// 2026-09-27 §2–4). They replace the stat cards with the same figures, over
// the records the account chip selects.

export interface SummaryPart {
  /** Shown in DM Mono. */
  value: string;
  label: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const DECISION_ROLES: ReadonlySet<Contact['role']> = new Set(['executive_sponsor', 'decision_maker', 'economic_buyer']);
const sumMrr = (rows: { mrr: string }[]) => rows.reduce((sum, row) => sum + Number(row.mrr), 0);

export function peopleSummary(people: Contact[]): SummaryPart[] {
  const n = people.length;
  const deciders = people.filter((person) => DECISION_ROLES.has(person.role)).length;
  const active = people.filter((person) => person.status === 'active').length;
  const positive = people.filter((person) => person.sentiment === 'positive').length;
  return [
    { value: String(n), label: plural(n, 'person', 'people') },
    { value: String(deciders), label: plural(deciders, 'decision maker', 'decision makers') },
    { value: String(active), label: 'active' },
    { value: `${n ? Math.round((positive / n) * 100) : 0}%`, label: 'positive sentiment' },
  ];
}

export function opportunitiesSummary(rows: Opportunity[], currency: CurrencyCode): SummaryPart[] {
  return [
    { value: String(rows.length), label: plural(rows.length, 'opportunity', 'opportunities') },
    { value: formatMoney(sumMrr(rows), currency), label: 'pipeline MRR' },
    { value: String(rows.filter((row) => row.priority === 'high').length), label: 'high priority' },
    { value: String(rows.filter((row) => row.stage === 'closed_won').length), label: 'closed won' },
  ];
}

export function risksSummary(rows: Risk[], currency: CurrencyCode): SummaryPart[] {
  return [
    { value: String(rows.length), label: plural(rows.length, 'risk', 'risks') },
    { value: formatMoney(sumMrr(rows), currency), label: 'MRR at risk' },
    { value: String(rows.filter((row) => row.priority === 'high').length), label: 'high priority' },
    { value: String(rows.filter((row) => row.stage === 'realised').length), label: 'realised' },
  ];
}

export function callsSummary(calls: Call[]): SummaryPart[] {
  const minutes = calls.reduce((sum, call) => sum + (call.duration_minutes ?? 0), 0);
  const count = (sentiment: Call['sentiment']) => String(calls.filter((call) => call.sentiment === sentiment).length);
  return [
    { value: String(calls.length), label: plural(calls.length, 'call', 'calls') },
    ...(minutes > 0 ? [{ value: durationLabel(minutes), label: 'on calls' }] : []),
    { value: count('positive'), label: 'positive' },
    { value: count('neutral'), label: 'neutral' },
    { value: count('negative'), label: 'negative' },
  ];
}
```

Move the originals:
- `FilesTab.tsx`: delete the `const ACCEPT = …;` line and the whole `function formatSize(…) {…}`; add `import { FILE_ACCEPT, formatSize } from '../../../features/files/fileFormat';`; change `accept={ACCEPT}` to `accept={FILE_ACCEPT}`.
- `CallSenseTab.tsx`: delete the whole `function durationLabel(…) {…}`; add `import { durationLabel } from '../../../features/calls/callFormat';`.
- `CustomerFacts.tsx`: delete the `UNSAFE_EMAIL` constant and the `mailtoHref` function with their comments; add `import { mailtoHref } from '../../../lib/contactLinks';`; replace

```tsx
              {customer.email && UNSAFE_EMAIL.test(customer.email) ? (
                customer.email
              ) : customer.email ? (
                <a href={mailtoHref(customer.email)} className={LINK}>
```

with

```tsx
              {customer.email && !mailtoHref(customer.email) ? (
                customer.email
              ) : customer.email ? (
                <a href={mailtoHref(customer.email) ?? undefined} className={LINK}>
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features src/lib src/components/organizations --maxWorkers=2 && npx tsc -b`
Expected: PASS (the four new files, and `FilesTab`, `CallSenseTab` and `CustomerFacts` tests unchanged); tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/organizations/listSummaries.ts src/features/organizations/listSummaries.test.ts src/features/files/fileFormat.ts src/features/files/fileFormat.test.ts src/features/calls/callFormat.ts src/features/calls/callFormat.test.ts src/lib/contactLinks.ts src/lib/contactLinks.test.ts src/components/organizations/activity/FilesTab.tsx src/components/organizations/activity/CallSenseTab.tsx src/components/organizations/detail/CustomerFacts.tsx
git commit -m "refactor(organizations): summaries, sizes, durations and contact links as shared helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The list parts every tab shares

**Files:**
- Create: `src/components/organizations/detail/listStyles.ts`
- Create: `src/components/organizations/detail/ListParts.tsx`
- Create: `src/components/organizations/detail/ListParts.test.tsx`
- Modify: `src/components/organizations/detail/houseRules.test.ts` (scan `listStyles.ts` too)

**Interfaces:**
- Consumes: `SummaryPart` (Task 6); `EmptyState` (`../portfolio/PortfolioSections`); `FOCUS`, `QUIET` (`../portfolio/styles`).
- Produces: class strings `LIST`, `ROW_ICON`, `META`, `ROW_ACTION`, `TITLE_BUTTON`, `ITEM_LINK`, `SECTION_HEADING`; components `AccountTag({ name })`, `SummaryLine({ parts })` (renders `data-summary`), `ListSkeleton({ label, rows? })`, `ScopedEmpty({ what, scope, detail, onShowAll })`, `NoMatch({ q, onClear })`, `ListSearch({ label, value, onChange, isSm })`.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/ListParts.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountTag, ListSearch, ListSkeleton, NoMatch, ScopedEmpty, SummaryLine } from './ListParts';

describe('the list parts People, Deals & risks and Files share', () => {
  it('tags a record with its account, truncating a long name', () => {
    render(<AccountTag name="EMEA" />);
    expect(screen.getByText('EMEA')).toHaveClass('truncate', 'bg-subtle', 'rounded-full');
  });

  it('writes a summary as one line, its figures in DM Mono', () => {
    render(
      <SummaryLine
        parts={[
          { value: '3', label: 'people' },
          { value: '67%', label: 'positive sentiment' },
        ]}
      />,
    );
    expect(document.querySelector('[data-summary]')).toHaveTextContent('3 people · 67% positive sentiment');
    expect(screen.getByText('67%')).toHaveClass('font-mono-brand', 'tabular-nums');
  });

  it('shows a named skeleton list while loading', () => {
    render(<ListSkeleton label="Loading people" />);
    expect(screen.getByRole('status', { name: 'Loading people' })).toBeInTheDocument();
  });

  it('offers All when the chosen account has nothing, and says "yet" otherwise', async () => {
    const onShowAll = vi.fn();
    const { unmount } = render(<ScopedEmpty what="people" scope="EMEA" detail="Add the people you work with here." onShowAll={onShowAll} />);
    expect(screen.getByText('No people on EMEA')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(onShowAll).toHaveBeenCalledOnce();
    unmount();
    render(<ScopedEmpty what="people" scope={null} detail="Add the people you work with here." onShowAll={onShowAll} />);
    expect(screen.getByText('No people yet')).toBeInTheDocument();
    expect(screen.getByText('Add the people you work with here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all accounts' })).not.toBeInTheDocument();
  });

  it('says nothing matches a search, and clears it', async () => {
    const onClear = vi.fn();
    render(<NoMatch q=" zzz " onClear={onClear} />);
    expect(screen.getByText('Nothing matches “zzz”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('labels its search, with a 44px field below sm', async () => {
    const onChange = vi.fn();
    render(<ListSearch label="Search people" value="" onChange={onChange} isSm={false} />);
    const box = screen.getByRole('searchbox', { name: 'Search people' });
    expect(box).toHaveClass('min-h-11', 'sm:min-h-9');
    await userEvent.type(box, 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/detail/ListParts.test.tsx --maxWorkers=2`
Expected: FAIL — `./ListParts` does not resolve.

- [ ] **Step 3: Implement**

`src/components/organizations/detail/listStyles.ts`:

```ts
import { FOCUS } from '../portfolio/styles';

// Class strings the organization page's lists share (People, Deals & risks,
// Files), so an item reads the same on every tab as in the Story stream.

/** One list surface: items divided, no card in a card. */
export const LIST = 'divide-y divide-line-subtle overflow-hidden rounded-xl bg-surface';

/** An item's leading icon or initials. */
export const ROW_ICON = 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-muted';

/** The line under an item's title: the account tag, who and what, at 11px. */
export const META = 'mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted';

/** An icon button at an item's end (⋯, delete): 44px below sm, 36px from sm. */
export const ROW_ACTION = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`;

/** An item's title as a button: a 44px target below sm (the line height
 *  centres the title in it), as in the Story. */
export const TITLE_BUTTON = `inline-block min-h-11 max-w-full truncate rounded-sm text-left leading-[2.75rem] hover:underline active:opacity-70 sm:min-h-0 sm:leading-normal ${FOCUS}`;

/** A link, or a link-like button, inside an item. */
export const ITEM_LINK = `inline-flex min-h-11 min-w-0 items-center gap-1 rounded-sm text-ink underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`;

/** A section's small uppercase heading (Files, Calls, a day), as the Story's days. */
export const SECTION_HEADING = 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted';
```

`src/components/organizations/detail/ListParts.tsx`:

```tsx
import { Fragment, useId } from 'react';
import { Search } from 'lucide-react';
import type { SummaryPart } from '../../../features/organizations/listSummaries';
import { EmptyState } from '../portfolio/PortfolioSections';
import { FOCUS, QUIET } from '../portfolio/styles';
import { LIST } from './listStyles';

/** The account a record is on, as the Story tags it. */
export function AccountTag({ name }: { name: string }) {
  return (
    <span className="inline-block min-w-0 max-w-[10rem] truncate rounded-full bg-subtle px-2 py-0.5 text-ink">{name}</span>
  );
}

/** The one line above a list that replaces the stat cards: figures in DM
 *  Mono, parted by middle dots, wrapping between parts only. */
export function SummaryLine({ parts }: { parts: SummaryPart[] }) {
  return (
    <p data-summary="" className="text-[13px] text-ink-muted">
      {parts.map((part, i) => (
        <Fragment key={part.label}>
          {i > 0 ? ' · ' : null}
          <span className="whitespace-nowrap">
            <span className="font-mono-brand tabular-nums text-ink">{part.value}</span> {part.label}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/** A list's loading state: rows shaped like its items, not a spinner. */
export function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label}>
      <ul aria-hidden="true" className={LIST}>
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex gap-3 px-3 py-2.5">
            <span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-subtle" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="block h-3 w-48 animate-pulse rounded bg-subtle" />
              <span className="block h-2.5 w-full animate-pulse rounded bg-subtle" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An empty list: under an account chip it offers All; under All it says
 *  there is nothing yet and how things arrive. */
export function ScopedEmpty({
  what,
  scope,
  detail,
  onShowAll,
}: {
  /** Plural noun: "people", "files". */
  what: string;
  /** From scopeLabel: null under All. */
  scope: string | null;
  detail: string;
  onShowAll: () => void;
}) {
  if (scope) {
    return (
      <EmptyState
        title={`No ${what} on ${scope}`}
        detail="The other accounts' show under All."
        action={
          <button type="button" onClick={onShowAll} className={`${QUIET} border border-line`}>
            Show all accounts
          </button>
        }
      />
    );
  }
  return <EmptyState title={`No ${what} yet`} detail={detail} action={null} />;
}

export function NoMatch({ q, onClear }: { q: string; onClear: () => void }) {
  return (
    <EmptyState
      title={`Nothing matches “${q.trim()}”`}
      detail="Try another word, or clear the search."
      action={
        <button type="button" onClick={onClear} className={`${QUIET} border border-line`}>
          Clear search
        </button>
      }
    />
  );
}

/** A list's search, as the Story's: 15px and 44px on phones, 13px and 36px from sm. */
export function ListSearch({
  label,
  value,
  onChange,
  isSm,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isSm: boolean;
}) {
  const id = useId();
  return (
    <div role="search" className={isSm ? 'relative min-w-0 max-w-xs flex-1' : 'relative w-full'}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className={`min-h-11 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[15px] text-ink placeholder:text-ink-muted sm:min-h-9 sm:text-[13px] ${FOCUS}`}
      />
    </div>
  );
}
```

In `houseRules.test.ts`, extend the first suite's sources by adding this spread inside the object passed to `houseRuleSuite` (after the Details.tsx glob):

```ts
  ...(import.meta.glob('./listStyles.ts', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail/ListParts.test.tsx src/components/organizations/detail/houseRules.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/listStyles.ts src/components/organizations/detail/ListParts.tsx src/components/organizations/detail/ListParts.test.tsx src/components/organizations/detail/houseRules.test.ts
git commit -m "feat(organizations): list parts shared by the page's tabs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: One person as a list item

**Files:**
- Create: `src/components/organizations/detail/PersonItem.tsx`
- Create: `src/components/organizations/detail/PersonItem.test.tsx`

**Interfaces:**
- Consumes: `mailtoHref`, `telHref` (Task 6); `AccountTag`, `ROW_ICON`, `META`, `ROW_ACTION`, `ITEM_LINK` (Task 7); `accountTag` (Task 1); `Menu` (`./Menu`).
- Produces: `PersonItem({ contact: Contact; isSm: boolean; onEdit: () => void; onDelete: () => void })`, an `<li data-person={id}>`.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/PersonItem.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONTACTS } from '../../../features/organizations/testStory';
import { PersonItem } from './PersonItem';

function renderItem(index: number, isSm = true, extra = {}) {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn() };
  render(
    <ul>
      <PersonItem contact={{ ...CONTACTS[index], ...extra }} isSm={isSm} {...handlers} />
    </ul>,
  );
  return handlers;
}

describe('PersonItem (spec 2026-09-27 §2)', () => {
  it('shows initials, name and role, how to reach them, the account, status, sentiment and last contact', () => {
    renderItem(0);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('DB')).toHaveClass('font-mono-brand');
    expect(within(item).getByRole('heading', { name: 'Dana Buyer' })).toBeInTheDocument();
    expect(within(item).getByText('Decision Maker')).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'dana@emea.northwind.example' })).toHaveAttribute('href', 'mailto:dana@emea.northwind.example');
    expect(within(item).getByRole('link', { name: '+44 20 7946 0000' })).toHaveAttribute('href', 'tel:+442079460000');
    for (const text of ['EMEA', 'Active', 'Positive sentiment']) expect(within(item).getByText(text)).toBeInTheDocument();
    expect(within(item).getByText(/^Contacted .+ ago$/)).toBeInTheDocument();
  });

  it('tags a person on the organization itself, and says when nobody has been in touch', () => {
    renderItem(2);
    const item = screen.getByRole('listitem');
    for (const text of ['Organization', 'Inactive', 'Negative sentiment', 'Not contacted yet']) {
      expect(within(item).getByText(text)).toBeInTheDocument();
    }
    expect(within(item).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows an address that could carry its own mailto query as text', () => {
    renderItem(0, true, { email: 'dana?cc=x@emea.northwind.example' });
    expect(screen.queryByRole('link', { name: /dana\?cc/ })).not.toBeInTheDocument();
    expect(screen.getByText('dana?cc=x@emea.northwind.example')).toBeInTheDocument();
  });

  it('edits and deletes through ⋯', async () => {
    const { onEdit, onDelete } = renderItem(0);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Dana Buyer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Dana Buyer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('on phones: the links take their own line as 44px targets, and ⋯ is 44px', () => {
    renderItem(0, false);
    const email = screen.getByRole('link', { name: 'dana@emea.northwind.example' });
    expect(email).toHaveClass('min-h-11');
    expect(email.closest('[data-links]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Actions for Dana Buyer' })).toHaveClass('h-11', 'w-11');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/detail/PersonItem.test.tsx --maxWorkers=2`
Expected: FAIL — `./PersonItem` does not resolve.

- [ ] **Step 3: Implement**

`src/components/organizations/detail/PersonItem.tsx`:

```tsx
import { Ellipsis, Mail, Phone } from 'lucide-react';
import type { Contact } from '../../../features/customers/customersSlice';
import { capitalize, formatRelativeTime, initials } from '../../../features/customers/formatters';
import { accountTag } from '../../../features/organizations/accountScope';
import { mailtoHref, telHref } from '../../../lib/contactLinks';
import { AccountTag } from './ListParts';
import { ITEM_LINK, META, ROW_ACTION, ROW_ICON } from './listStyles';
import { Menu } from './Menu';

const SENTIMENT_TONE: Record<Contact['sentiment'], string> = {
  positive: 'bg-success-dim text-success',
  neutral: 'bg-subtle text-ink-muted',
  negative: 'bg-danger-dim text-danger',
};

/** How to reach a person: an address that could carry its own mailto query
 *  is shown as text, never linked. */
function Links({ contact }: { contact: Contact }) {
  const email = contact.email ? mailtoHref(contact.email) : null;
  const phone = contact.phone ? telHref(contact.phone) : null;
  return (
    <>
      {contact.email && email ? (
        <a href={email} className={ITEM_LINK}>
          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{contact.email}</span>
        </a>
      ) : contact.email ? (
        <span className="truncate">{contact.email}</span>
      ) : null}
      {contact.phone && phone ? (
        <a href={phone} className={ITEM_LINK}>
          <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="font-mono-brand tabular-nums">{contact.phone}</span>
        </a>
      ) : null}
    </>
  );
}

/** One person (spec 2026-09-27 §2): initials, name and role, how to reach
 *  them, the account tag, status, sentiment and when they were last
 *  contacted; ⋯ edits or deletes through the existing flows. Phones put the
 *  links on their own line, as 44px targets. */
export function PersonItem({
  contact,
  isSm,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  isSm: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const contacted = contact.last_contacted_at ? `Contacted ${formatRelativeTime(contact.last_contacted_at)}` : 'Not contacted yet';
  const active = contact.status === 'active';
  return (
    <li data-person={contact.id} className="flex gap-3 px-3 py-2.5">
      <span aria-hidden="true" className={`${ROW_ICON} font-mono-brand text-[11px] font-semibold text-ink`}>
        {initials(contact.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="min-w-0 truncate text-[13px] font-semibold text-ink">{contact.name}</h3>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">{contact.role_display}</span>
          {isSm ? <span className="shrink-0 text-[11px] text-ink-muted">{contacted}</span> : null}
        </div>
        <p className={META}>
          <AccountTag name={accountTag(contact)} />
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success' : 'bg-line-strong'}`} />
            {capitalize(contact.status)}
          </span>
          <span className={`rounded-full px-2 py-0.5 ${SENTIMENT_TONE[contact.sentiment]}`}>{capitalize(contact.sentiment)} sentiment</span>
          {isSm ? <Links contact={contact} /> : <span>{contacted}</span>}
        </p>
        {isSm ? null : (
          <div data-links="" className="flex min-w-0 flex-col text-[13px]">
            <Links contact={contact} />
          </div>
        )}
      </div>
      <Menu
        label={`Actions for ${contact.name}`}
        trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />}
        triggerClassName={ROW_ACTION}
        items={[
          { key: 'edit', label: 'Edit', onSelect: onEdit },
          { key: 'delete', label: 'Delete', onSelect: onDelete, danger: true },
        ]}
      />
    </li>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail/PersonItem.test.tsx src/components/organizations/detail/houseRules.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/PersonItem.tsx src/components/organizations/detail/PersonItem.test.tsx
git commit -m "feat(organizations): a person as a list item

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: People as a list, narrowed by the chip

**Files:**
- Modify (rewrite): `src/components/organizations/detail/PeopleTab.tsx`
- Create: `src/components/organizations/detail/PeopleTab.test.tsx` (the old one moved in Task 2)
- Modify: `src/pages/organizations/Details.tsx`

**Interfaces:**
- Consumes: `byAccount`, `chosenAccount`, `scopeLabel` (Task 1); `peopleSummary` (Task 6); `ListSearch`, `ListSkeleton`, `NoMatch`, `ScopedEmpty`, `SummaryLine`, `LIST` (Task 7); `PersonItem` (Task 8); fixtures and stub (Task 3).
- Produces: `PeopleTab({ customerId: number; account: string; accounts: Account[]; isSm: boolean; onShowAll: () => void })`. Details gains `showAll` (`update({ account: '' })`), reused by Tasks 11 and 14.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/PeopleTab.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import {
  ACCOUNTS,
  CONTACTS,
  ORGANIZATION_LISTS,
  postBodies,
  requestPaths,
  stubOrganizationPage,
  type OrganizationLists,
} from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { PeopleTab } from './PeopleTab';

function ui(props: Partial<ComponentProps<typeof PeopleTab>> = {}) {
  return (
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <PeopleTab customerId={7} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} {...props} />
      </MemoryRouter>
    </Provider>
  );
}

function renderPeople(props: Partial<ComponentProps<typeof PeopleTab>> = {}, lists: OrganizationLists = ORGANIZATION_LISTS) {
  const spy = stubOrganizationPage({ lists });
  const onShowAll = vi.fn();
  render(ui({ onShowAll, ...props }));
  return { spy, onShowAll };
}

const people = () => [...document.querySelectorAll('[data-person]')].map((el) => el.getAttribute('data-person'));
const summary = () => document.querySelector('[data-summary]');

describe('People (spec 2026-09-27 §2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists every person with a one-line summary in place of the stat cards, read once', async () => {
    const { spy } = renderPeople();
    expect(screen.getByRole('status', { name: 'Loading people' })).toBeInTheDocument();
    await waitFor(() => expect(people()).toEqual(['51', '52', '53']));
    expect(summary()).toHaveTextContent('3 people · 1 decision maker · 2 active · 33% positive sentiment');
    expect(screen.queryByText('Total Contacts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /filter|download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(requestPaths(spy).filter((path) => path === 'GET /customers/7/contacts/')).toHaveLength(1);
  });

  it('narrows to the chosen account, and the summary follows', async () => {
    renderPeople({ account: '31' });
    await waitFor(() => expect(people()).toEqual(['51']));
    expect(summary()).toHaveTextContent('1 person · 1 decision maker · 1 active · 100% positive sentiment');
  });

  it('narrows to the people on the organization itself', async () => {
    renderPeople({ account: 'none' });
    await waitFor(() => expect(people()).toEqual(['53']));
  });

  it('searches by name, role or email, and says when nothing matches', async () => {
    renderPeople();
    await waitFor(() => expect(people()).toHaveLength(3));
    const box = screen.getByRole('searchbox', { name: 'Search people' });
    await userEvent.type(box, 'technical');
    expect(people()).toEqual(['52']);
    await userEvent.clear(box);
    await userEvent.type(box, 'zzz');
    expect(screen.getByText('Nothing matches “zzz”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(people()).toHaveLength(3);
  });

  it('adds a person on the chosen account, then reads the list again', async () => {
    const { spy } = renderPeople({ account: '31' });
    await waitFor(() => expect(people()).toEqual(['51']));
    await userEvent.click(screen.getByRole('button', { name: 'Add contact to EMEA' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByLabelText(/^Email/), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    expect(await screen.findByRole('heading', { name: 'Robin Ops' })).toBeInTheDocument();
    expect(postBodies(spy, '/customers/7/accounts/31/contacts/')).toEqual([expect.objectContaining({ name: 'Robin Ops' })]);
    expect(requestPaths(spy).filter((path) => path === 'GET /customers/7/contacts/')).toHaveLength(2);
  });

  it('adds on the organization under All', async () => {
    const { spy } = renderPeople();
    await waitFor(() => expect(people()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await userEvent.type(screen.getByLabelText(/^Name/), 'Robin Ops');
    await userEvent.type(screen.getByLabelText(/^Email/), 'robin@pizzahut.example');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Contact' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(postBodies(spy, '/customers/7/contacts/')).toHaveLength(1));
  });

  it('edits and deletes through ⋯ with the existing flows', async () => {
    const { spy } = renderPeople();
    await waitFor(() => expect(people()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Pat Finance' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const name = screen.getByLabelText(/^Name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Pat Treasurer');
    // Email is required on the form, and Pat has none yet.
    await userEvent.type(screen.getByLabelText(/^Email/), 'pat@pizzahut.example');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('heading', { name: 'Pat Treasurer' })).toBeInTheDocument();
    expect(requestPaths(spy)).toContain('PATCH /contacts/53/');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Pat Treasurer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByText('Delete Pat Treasurer?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(people()).toEqual(['51', '52']));
    expect(requestPaths(spy)).toContain('DELETE /contacts/53/');
  });

  it('designs its empty states: nobody yet, and nobody on the chosen account', async () => {
    renderPeople({}, {});
    expect(await screen.findByText('No people yet')).toBeInTheDocument();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    const { onShowAll } = renderPeople({ account: '32' }, { contacts: [CONTACTS[0]] });
    expect(await screen.findByText('No people on North America')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it('shows a failed read with Try again', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (fail && new URL(String(input)).pathname.endsWith('/customers/7/contacts/')) {
          fail = false;
          return { ok: false, status: 500, json: async () => ({ detail: 'Try later.' }) };
        }
        return spy(input, init);
      }),
    );
    render(ui());
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(people()).toEqual(['51', '52', '53']));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/detail/PeopleTab.test.tsx --maxWorkers=2`
Expected: FAIL — the current PeopleTab renders the shared table (no `data-person`, no "Loading people").

- [ ] **Step 3: Implement**

Replace `src/components/organizations/detail/PeopleTab.tsx` with:

```tsx
import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { deleteContact, fetchContactsForCustomer, type Account, type Contact } from '../../../features/customers/customersSlice';
import { byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { peopleSummary } from '../../../features/organizations/listSummaries';
import { ContactFormModal } from '../../contacts/ContactFormModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorBlock } from '../portfolio/PortfolioSections';
import { BUTTON } from '../portfolio/styles';
import { ListSearch, ListSkeleton, NoMatch, ScopedEmpty, SummaryLine } from './ListParts';
import { LIST } from './listStyles';
import { PersonItem } from './PersonItem';

/** People (spec 2026-09-27 §2): a list item per person the organization's
 *  roll-up holds, narrowed by the account chip, with a one-line summary and
 *  search. Add, Edit and Delete are the existing flows; with an account
 *  chosen, Add saves on it. Read when the tab first opens. */
export function PeopleTab({
  customerId,
  account,
  accounts,
  isSm,
  onShowAll,
}: {
  customerId: number;
  /** The chip: '' All, 'none' the organization itself, or an account id. */
  account: string;
  accounts: Account[];
  isSm: boolean;
  /** Clears the chip (the empty state's Show all accounts). */
  onShowAll: () => void;
}) {
  const dispatch = useAppDispatch();
  const { contacts, contactsLoading, contactsError } = useAppSelector((state) => state.customers);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  // Read before paint: the read marks the shared slot loading at once, so
  // neither this list nor the chips show people another page left there.
  useLayoutEffect(() => {
    void dispatch(fetchContactsForCustomer(customerId)).then(() => setLoaded(true));
  }, [dispatch, customerId, attempt]);

  const inScope = useMemo(() => byAccount(contacts, account), [contacts, account]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return inScope;
    return inScope.filter((person) => `${person.name} ${person.role_display} ${person.email}`.toLowerCase().includes(needle));
  }, [inScope, q]);
  const target = chosenAccount(accounts, account);
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
    <div aria-busy={contactsLoading} className="flex flex-col gap-3">
      <div className={isSm ? 'flex items-center gap-2' : 'flex flex-col gap-2'}>
        <ListSearch label="Search people" value={q} onChange={setQ} isSm={isSm} />
        <button type="button" onClick={() => setAdding(true)} className={`${BUTTON} ${isSm ? 'ml-auto' : 'justify-center'}`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {target ? `Add contact to ${target.name}` : 'Add contact'}
        </button>
      </div>
      {loaded && !failed && inScope.length > 0 ? <SummaryLine parts={peopleSummary(inScope)} /> : null}
      {body}

      {adding ? (
        <ContactFormModal
          customerId={customerId}
          accountId={target?.id}
          onClose={() => setAdding(false)}
          onSaved={() => void dispatch(fetchContactsForCustomer(customerId))}
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
  );
}
```

In `src/pages/organizations/Details.tsx`:
- Right after the `chipCounts` line (Task 5), add:

```ts
  const showAll = useCallback(() => update({ account: '' }), [update]);
```

- Replace `<PeopleTab customerId={orgId} />` with:

```tsx
              <PeopleTab customerId={orgId} account={params.account} accounts={accounts} isSm={isSm} onShowAll={showAll} />
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/pages/organizations --maxWorkers=2 && npx tsc -b`
Expected: PASS (including Details' "keeps a visited tab mounted: People, Story, People reads the contacts once"); tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/PeopleTab.tsx src/components/organizations/detail/PeopleTab.test.tsx src/pages/organizations/Details.tsx
git commit -m "feat(organizations): People as a list, narrowed by the account chip

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: One opportunity or risk as a list item

**Files:**
- Create: `src/components/organizations/detail/DealItem.tsx`
- Create: `src/components/organizations/detail/DealItem.test.tsx`

**Interfaces:**
- Consumes: `AccountTag` (Task 7); `accountTag` (Task 1); `PRIORITY_COLORS` (`../../pipelines/kanbanConfig`); `useOrgCurrency`.
- Produces: `DealItem({ deal: Opportunity | Risk; onOpen: () => void })`, an `<li data-deal={id}>` wrapping one button.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/DealItem.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { Opportunity, Risk } from '../../../features/customers/customersSlice';
import { OPPORTUNITIES, RISKS } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { DealItem } from './DealItem';

function renderItem(deal: Opportunity | Risk) {
  const onOpen = vi.fn();
  render(
    <Provider store={makeDetailStore()}>
      <ul>
        <DealItem deal={deal} onOpen={onOpen} />
      </ul>
    </Provider>,
  );
  return onOpen;
}

describe('DealItem (spec 2026-09-27 §3)', () => {
  it('shows title, MRR in DM Mono, stage, priority, department and account', () => {
    renderItem(OPPORTUNITIES[0]);
    const button = screen.getByRole('button', { name: /EMEA seat expansion/ });
    expect(within(button).getByText('$1,200.00')).toHaveClass('font-mono-brand', 'tabular-nums');
    for (const text of ['Negotiation', 'High priority', 'Customer Success', 'EMEA']) expect(within(button).getByText(text)).toBeInTheDocument();
  });

  it('says Whole company and Organization when the record has no department or account', () => {
    renderItem(OPPORTUNITIES[1]);
    expect(screen.getByText('Whole company')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
  });

  it('renders a risk the same way', () => {
    renderItem(RISKS[0]);
    for (const text of ['Admin left', 'Open', '$800.00', 'North America']) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('opens on select, with a 44px target', async () => {
    const onOpen = renderItem(OPPORTUNITIES[0]);
    const button = screen.getByRole('button', { name: /EMEA seat expansion/ });
    expect(button).toHaveClass('min-h-11');
    await userEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/detail/DealItem.test.tsx --maxWorkers=2`
Expected: FAIL — `./DealItem` does not resolve.

- [ ] **Step 3: Implement**

`src/components/organizations/detail/DealItem.tsx`:

```tsx
import { useOrgCurrency } from '../../../hooks';
import type { Opportunity, Risk } from '../../../features/customers/customersSlice';
import { formatMoney } from '../../../features/customers/formatters';
import { accountTag } from '../../../features/organizations/accountScope';
import { PRIORITY_COLORS } from '../../pipelines/kanbanConfig';
import { FOCUS } from '../portfolio/styles';
import { AccountTag } from './ListParts';
import { META } from './listStyles';

/** One opportunity or risk (spec 2026-09-27 §3): the title and its MRR,
 *  then stage, priority, department and the account tag. The whole item
 *  opens the record's existing edit form. Priority is the only colour: it
 *  carries severity. */
export function DealItem({ deal, onOpen }: { deal: Opportunity | Risk; onOpen: () => void }) {
  const currency = useOrgCurrency();
  return (
    <li data-deal={deal.id}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex min-h-11 w-full min-w-0 flex-col px-3 py-2.5 text-left hover:bg-subtle active:bg-line-subtle ${FOCUS}`}
      >
        <span className="flex w-full min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{deal.title}</span>
          <span className="shrink-0 text-[13px] text-ink-muted">
            <span className="font-mono-brand tabular-nums text-ink">{formatMoney(deal.mrr, currency)}</span> MRR
          </span>
        </span>
        <span className={META}>
          <span className="rounded-full bg-subtle px-2 py-0.5 text-ink">{deal.stage_display}</span>
          <span className={`rounded-full border px-2 py-0.5 ${PRIORITY_COLORS[deal.priority]}`}>{deal.priority_display} priority</span>
          <span>{deal.department ? deal.department_display : 'Whole company'}</span>
          <AccountTag name={accountTag(deal)} />
        </span>
      </button>
    </li>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail/DealItem.test.tsx src/components/organizations/detail/houseRules.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/DealItem.tsx src/components/organizations/detail/DealItem.test.tsx
git commit -m "feat(organizations): an opportunity or risk as a list item

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Deals & risks as a list with an Opportunities / Risks switch

**Files:**
- Modify (rewrite): `src/components/organizations/detail/DealsTab.tsx`
- Create: `src/components/organizations/detail/DealsTab.test.tsx` (the old one moved in Task 2)
- Modify: `src/pages/organizations/Details.tsx`

**Interfaces:**
- Consumes: `byAccount`, `chosenAccount`, `scopeLabel` (Task 1); `opportunitiesSummary`, `risksSummary` (Task 6); list parts (Task 7); `DealItem` (Task 10); `CountChip` (`./CountChip`); `KanbanBoard`, `PipelineCardContent`, stage columns; `OpportunityFormModal`, `RiskFormModal`, `ConfirmDialog`; `showAll` in Details (Task 9).
- Produces: `DealsTab({ customerId: number; account: string; accounts: Account[]; isSm: boolean; onShowAll: () => void })`.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/DealsTab.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import {
  ACCOUNTS,
  ORGANIZATION_LISTS,
  postBodies,
  requestPaths,
  stubOrganizationPage,
  type OrganizationLists,
} from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { DealsTab } from './DealsTab';

function ui(props: Partial<ComponentProps<typeof DealsTab>> = {}) {
  return (
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <DealsTab customerId={7} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} {...props} />
      </MemoryRouter>
    </Provider>
  );
}

function renderDeals(props: Partial<ComponentProps<typeof DealsTab>> = {}, lists: OrganizationLists = ORGANIZATION_LISTS) {
  const spy = stubOrganizationPage({ lists });
  const onShowAll = vi.fn();
  render(ui({ onShowAll, ...props }));
  return { spy, onShowAll };
}

const deals = () => [...document.querySelectorAll('[data-deal]')].map((el) => el.getAttribute('data-deal'));
const summary = () => document.querySelector('[data-summary]');

describe('Deals & risks (spec 2026-09-27 §3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the opportunities with a summary line, and switches to the risks', async () => {
    renderDeals();
    expect(screen.getByRole('status', { name: 'Loading opportunities' })).toBeInTheDocument();
    await waitFor(() => expect(deals()).toEqual(['61', '62']));
    expect(summary()).toHaveTextContent('2 opportunities · $1,500.00 pipeline MRR · 1 high priority · 0 closed won');
    expect(screen.getByRole('button', { name: 'Opportunities 2' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Risks 1' }));
    expect(deals()).toEqual(['71']);
    expect(summary()).toHaveTextContent('1 risk · $800.00 MRR at risk · 1 high priority · 0 realised');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('narrows to the chosen account; the switch counts follow, and an empty kind offers All', async () => {
    const { onShowAll } = renderDeals({ account: '31' });
    await waitFor(() => expect(deals()).toEqual(['61']));
    await userEvent.click(screen.getByRole('button', { name: 'Risks 0' }));
    expect(screen.getByText('No risks on EMEA')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it('searches titles, and says when nothing matches', async () => {
    renderDeals();
    await waitFor(() => expect(deals()).toHaveLength(2));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search opportunities' }), 'add-on');
    expect(deals()).toEqual(['62']);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search opportunities' }), 'zzz');
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  it('opens the edit form on select, and deletes from it', async () => {
    const { spy } = renderDeals();
    await waitFor(() => expect(deals()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: /EMEA seat expansion/ }));
    expect(screen.getByRole('heading', { name: 'Edit EMEA seat expansion' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete EMEA seat expansion?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deals()).toEqual(['62']));
    expect(requestPaths(spy)).toContain('DELETE /opportunities/61/');
  });

  it('adds an opportunity on the chosen account, and a risk too', async () => {
    const { spy } = renderDeals({ account: '31' });
    await waitFor(() => expect(deals()).toEqual(['61']));
    await userEvent.click(screen.getByRole('button', { name: 'Add opportunity to EMEA' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Upsell');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Opportunity' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(deals()).toHaveLength(2));
    expect(postBodies(spy, '/customers/7/accounts/31/opportunities/')).toEqual([expect.objectContaining({ title: 'Upsell' })]);

    await userEvent.click(screen.getByRole('button', { name: /^Risks/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add risk to EMEA' }));
    await userEvent.type(screen.getByLabelText(/^Title/), 'Budget freeze');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Risk' }).find((button) => button.closest('form'))!);
    await waitFor(() => expect(postBodies(spy, '/customers/7/accounts/31/risks/')).toHaveLength(1));
  });

  it('keeps the board as an option from sm, and lists only on phones', async () => {
    renderDeals();
    await waitFor(() => expect(deals()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(screen.getByText('Solution Validation')).toBeInTheDocument();
    expect(screen.getByText('EMEA seat expansion')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(deals()).toEqual(['61', '62']);

    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    renderDeals({ isSm: false });
    await waitFor(() => expect(deals()).toHaveLength(2));
    expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument();
  });

  it('shows a failed read with Try again', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (fail && new URL(String(input)).pathname.endsWith('/customers/7/opportunities/')) {
          fail = false;
          return { ok: false, status: 500, json: async () => ({ detail: 'Try later.' }) };
        }
        return spy(input, init);
      }),
    );
    render(ui());
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(deals()).toEqual(['61', '62']));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/organizations/detail/DealsTab.test.tsx --maxWorkers=2`
Expected: FAIL — the current DealsTab renders the shared table (no `data-deal`).

- [ ] **Step 3: Implement**

Replace `src/components/organizations/detail/DealsTab.tsx` with:

```tsx
import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { LayoutGrid, List as ListIcon, Plus } from 'lucide-react';
import { useAppDispatch, useAppSelector, useOrgCurrency } from '../../../hooks';
import {
  deleteOpportunity,
  deleteRisk,
  fetchOpportunitiesForCustomer,
  fetchRisksForCustomer,
  updateOpportunity,
  updateRisk,
  type Account,
  type Opportunity,
  type Risk,
} from '../../../features/customers/customersSlice';
import { byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
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
import { ListSearch, ListSkeleton, NoMatch, ScopedEmpty, SummaryLine } from './ListParts';
import { LIST } from './listStyles';

type Kind = 'opportunities' | 'risks';

/** The List / Board switch: desktop only, so 36px is its target. */
const SEGMENT = `inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold ${FOCUS}`;

const titled = (title: string, q: string) => title.toLowerCase().includes(q.trim().toLowerCase());

/** Deals & risks (spec 2026-09-27 §3): an Opportunities / Risks switch over
 *  list items, narrowed by the account chip, each with a one-line summary.
 *  The board stays an option from sm. Selecting an item opens its existing
 *  edit form; Add saves on the chosen account when there is one. */
export function DealsTab({
  customerId,
  account,
  accounts,
  isSm,
  onShowAll,
}: {
  customerId: number;
  /** The chip: '' All, 'none' the organization itself, or an account id. */
  account: string;
  accounts: Account[];
  isSm: boolean;
  onShowAll: () => void;
}) {
  const dispatch = useAppDispatch();
  const currency = useOrgCurrency();
  const {
    pipelineOpportunities: opportunities,
    pipelineOpportunitiesLoading,
    pipelineOpportunitiesError,
    pipelineRisks: risks,
    pipelineRisksLoading,
    pipelineRisksError,
  } = useAppSelector((state) => state.customers);
  const [kind, setKind] = useState<Kind>('opportunities');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState({ opportunities: false, risks: false });
  const [attempt, setAttempt] = useState(0);
  const [addingOpportunity, setAddingOpportunity] = useState<Opportunity['stage'] | null>(null);
  const [addingRisk, setAddingRisk] = useState<Risk['stage'] | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [deletingOpportunity, setDeletingOpportunity] = useState<Opportunity | null>(null);
  const [deletingRisk, setDeletingRisk] = useState<Risk | null>(null);

  // Read before paint, as People does: the chips never count another page's
  // records left in the shared slots.
  useLayoutEffect(() => {
    void dispatch(fetchOpportunitiesForCustomer(customerId)).then(() => setLoaded((was) => ({ ...was, opportunities: true })));
    void dispatch(fetchRisksForCustomer(customerId)).then(() => setLoaded((was) => ({ ...was, risks: true })));
  }, [dispatch, customerId, attempt]);

  const scopedOpportunities = useMemo(() => byAccount(opportunities, account), [opportunities, account]);
  const scopedRisks = useMemo(() => byAccount(risks, account), [risks, account]);
  const shownOpportunities = useMemo(() => scopedOpportunities.filter((row) => titled(row.title, q)), [scopedOpportunities, q]);
  const shownRisks = useMemo(() => scopedRisks.filter((row) => titled(row.title, q)), [scopedRisks, q]);
  const target = chosenAccount(accounts, account);

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
        onAddClick={(stage) => setAddingOpportunity(stage)}
        onMove={(id, stage) => dispatch(updateOpportunity({ id, stage }))}
        minHeight="400px"
      />
    ) : (
      <KanbanBoard
        columns={RISK_STAGE_COLUMNS}
        entities={shownRisks}
        renderCard={(entity) => PipelineCardContent(entity, currency)}
        onCardClick={setEditingRisk}
        onAddClick={(stage) => setAddingRisk(stage)}
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
          className={`${BUTTON} ${isSm ? 'ml-auto' : 'justify-center'}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {`Add ${isOpps ? 'opportunity' : 'risk'}${target ? ` to ${target.name}` : ''}`}
        </button>
      </div>
      {loaded[kind] && !failed && scopedCount > 0 ? (
        <SummaryLine parts={isOpps ? opportunitiesSummary(scopedOpportunities, currency) : risksSummary(scopedRisks, currency)} />
      ) : null}
      {body}

      {addingOpportunity ? (
        <OpportunityFormModal
          customerId={customerId}
          accountId={target?.id}
          defaultStage={addingOpportunity}
          onClose={() => setAddingOpportunity(null)}
          onSaved={() => void dispatch(fetchOpportunitiesForCustomer(customerId))}
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
          customerId={customerId}
          accountId={target?.id}
          defaultStage={addingRisk}
          onClose={() => setAddingRisk(null)}
          onSaved={() => void dispatch(fetchRisksForCustomer(customerId))}
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
  );
}
```

In `src/pages/organizations/Details.tsx`, replace `<DealsTab customerId={orgId} />` with:

```tsx
              <DealsTab customerId={orgId} account={params.account} accounts={accounts} isSm={isSm} onShowAll={showAll} />
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/pages/organizations --maxWorkers=2 && npx tsc -b`
Expected: PASS; tsc exits 0. ("Add Risk" is RiskFormModal's submit label, as "Add Opportunity" is OpportunityFormModal's.)

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/DealsTab.tsx src/components/organizations/detail/DealsTab.test.tsx src/pages/organizations/Details.tsx
git commit -m "feat(organizations): Deals & risks as lists with an Opportunities / Risks switch

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The Files section (organisation and accounts, tagged; upload on the chosen account)

**Files:**
- Create: `src/components/organizations/detail/FileItem.tsx`
- Create: `src/components/organizations/detail/FileItem.test.tsx`
- Create: `src/components/organizations/detail/FilesSection.tsx`
- Create: `src/components/organizations/detail/FilesSection.test.tsx`

**Interfaces:**
- Consumes: `FILE_ACCEPT`, `formatSize`, `canDeleteFile` (Task 6); `byAccount`, `chosenAccount`, `scopeLabel`, `accountTag` (Task 1); list parts (Task 7); `fetchFiles`, `uploadFile`, `deleteFile`, `downloadAttachment` (filesSlice); `useCapability('manage_org_settings')`.
- Produces: `FileItem({ file: Attachment; canDelete: boolean; onDownload: () => void; onDelete: () => void })` (`<li data-file={id}>`); `FilesSection({ customerId: number; account: string; accounts: Account[]; isSm: boolean; onShowAll: () => void })` (a region named "Files").

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/detail/FileItem.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Attachment } from '../../../features/files/filesSlice';
import { FILES } from '../../../features/organizations/testStory';
import { FileItem } from './FileItem';

function renderItem(file: Attachment, canDelete = true) {
  const handlers = { onDownload: vi.fn(), onDelete: vi.fn() };
  render(
    <ul>
      <FileItem file={file} canDelete={canDelete} {...handlers} />
    </ul>,
  );
  return handlers;
}

describe('FileItem (spec 2026-09-27 §4)', () => {
  it('shows name, size, description, account, uploader, source and date', () => {
    renderItem(FILES[0]);
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('240 KB')).toHaveClass('font-mono-brand', 'tabular-nums');
    for (const text of ['Signed order form', 'EMEA', 'Alice · Upload', '20 Sep 2026']) expect(within(item).getByText(text)).toBeInTheDocument();
  });

  it('names a call transcript as such, and tags a file on the organization', () => {
    renderItem({ ...FILES[1], source: 'transcript' });
    expect(screen.getByText('Carl CSM · Call transcript')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
  });

  it('downloads from its name, and deletes only where allowed', async () => {
    const { onDownload, onDelete } = renderItem(FILES[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Order form.pdf' }));
    expect(onDownload).toHaveBeenCalledOnce();
    const del = screen.getByRole('button', { name: 'Delete Order form.pdf' });
    expect(del).toHaveClass('h-11', 'w-11', 'sm:h-9', 'sm:w-9');
    await userEvent.click(del);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('offers no delete to someone who may not', () => {
    renderItem(FILES[0], false);
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });
});
```

`src/components/organizations/detail/FilesSection.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import {
  ACCOUNTS,
  ORGANIZATION_LISTS,
  postBodies,
  requestPaths,
  stubOrganizationPage,
  type OrganizationLists,
} from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { FilesSection } from './FilesSection';

function ui(props: Partial<ComponentProps<typeof FilesSection>> = {}) {
  return (
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <FilesSection customerId={7} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} {...props} />
      </MemoryRouter>
    </Provider>
  );
}

function renderFiles(props: Partial<ComponentProps<typeof FilesSection>> = {}, lists: OrganizationLists = ORGANIZATION_LISTS) {
  const spy = stubOrganizationPage({ lists });
  const onShowAll = vi.fn();
  render(ui({ onShowAll, ...props }));
  return { spy, onShowAll };
}

const fileIds = () => [...document.querySelectorAll('[data-file]')].map((el) => el.getAttribute('data-file'));
const note = () => new File(['x'], 'Notes.txt', { type: 'text/plain' });

describe('FilesSection (spec 2026-09-27 §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the organization's files and every visible account's, each tagged, read once", async () => {
    const { spy } = renderFiles();
    expect(screen.getByRole('status', { name: 'Loading files' })).toBeInTheDocument();
    await waitFor(() => expect(fileIds()).toEqual(['81', '82']));
    const [order, deck] = within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem');
    expect(within(order).getByText('EMEA')).toBeInTheDocument();
    expect(within(deck).getByText('Organization')).toBeInTheDocument();
    expect(requestPaths(spy).filter((path) => path === 'GET /customers/7/files/')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Files' }).querySelector('.overflow-y-auto, .overflow-auto')).toBeNull();
  });

  it('narrows to the chosen account, and to the organization itself', async () => {
    renderFiles({ account: '31' });
    await waitFor(() => expect(fileIds()).toEqual(['81']));
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    renderFiles({ account: 'none' });
    await waitFor(() => expect(fileIds()).toEqual(['82']));
  });

  it('says so when the chosen account has none, and offers All', async () => {
    const { onShowAll } = renderFiles({ account: '32' });
    expect(await screen.findByText('No files on North America')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(onShowAll).toHaveBeenCalledOnce();
  });

  it('uploads on the chosen account with its description, and lists the file first', async () => {
    const { spy } = renderFiles({ account: '31' });
    await waitFor(() => expect(fileIds()).toEqual(['81']));
    expect(screen.getByText(/New files go on EMEA\./)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Description (optional)'), 'Kick-off notes');
    await userEvent.upload(screen.getByLabelText('Choose files'), note());
    await waitFor(() => expect(fileIds()).toHaveLength(2));
    expect(postBodies(spy, '/customers/7/accounts/31/files/')).toEqual([expect.objectContaining({ description: 'Kick-off notes' })]);
    const first = within(screen.getByRole('list', { name: 'Files' })).getAllByRole('listitem')[0];
    expect(within(first).getByText('Notes.txt')).toBeInTheDocument();
    expect(within(first).getByText('EMEA')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('');
  });

  it('uploads on the organization under All', async () => {
    const { spy } = renderFiles();
    await waitFor(() => expect(fileIds()).toHaveLength(2));
    expect(screen.getByText(/New files go on the organization\./)).toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText('Choose files'), note());
    await waitFor(() => expect(postBodies(spy, '/customers/7/files/')).toHaveLength(1));
  });

  it('deletes after a confirm', async () => {
    const { spy } = renderFiles();
    await waitFor(() => expect(fileIds()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Delete QBR deck.pptx' }));
    expect(screen.getByText('Delete QBR deck.pptx?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(fileIds()).toEqual(['81']));
    expect(requestPaths(spy)).toContain('DELETE /files/82/');
  });

  it('says when a download fails', async () => {
    renderFiles();
    await userEvent.click(await screen.findByRole('button', { name: 'Order form.pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not download Order form.pdf.');
  });

  it('says there are none yet under All', async () => {
    renderFiles({}, {});
    expect(await screen.findByText('No files yet')).toBeInTheDocument();
  });

  it('shows a failed read with Try again', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (fail && new URL(String(input)).pathname.endsWith('/customers/7/files/')) {
          fail = false;
          return { ok: false, status: 500, json: async () => ({ detail: 'Try later.' }) };
        }
        return spy(input, init);
      }),
    );
    render(ui());
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fileIds()).toEqual(['81', '82']));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/organizations/detail/FileItem.test.tsx src/components/organizations/detail/FilesSection.test.tsx --maxWorkers=2`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement**

`src/components/organizations/detail/FileItem.tsx`:

```tsx
import { FileText, Mic, Trash2 } from 'lucide-react';
import { formatDate } from '../../../features/customers/formatters';
import { formatSize } from '../../../features/files/fileFormat';
import type { Attachment } from '../../../features/files/filesSlice';
import { accountTag } from '../../../features/organizations/accountScope';
import { AccountTag } from './ListParts';
import { META, ROW_ACTION, ROW_ICON, TITLE_BUTTON } from './listStyles';

/** One file (spec 2026-09-27 §4): the name downloads it; size, description,
 *  the account tag, who uploaded it, its source and date; delete where the
 *  viewer may. */
export function FileItem({
  file,
  canDelete,
  onDownload,
  onDelete,
}: {
  file: Attachment;
  canDelete: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const source = file.source === 'transcript' ? 'Call transcript' : 'Upload';
  const Icon = file.source === 'transcript' ? Mic : FileText;
  return (
    <li data-file={file.id} className="flex gap-3 px-3 py-2.5">
      <span aria-hidden="true" className={ROW_ICON}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            <button type="button" onClick={onDownload} className={TITLE_BUTTON}>
              {file.name}
            </button>
          </h3>
          <span className="shrink-0 font-mono-brand text-[11px] tabular-nums text-ink-muted">{formatSize(file.size)}</span>
        </div>
        {file.description ? <p className="truncate text-[13px] text-ink-muted">{file.description}</p> : null}
        <p className={META}>
          <AccountTag name={accountTag(file)} />
          <span className="min-w-0 truncate">{[file.uploaded_by?.name, source].filter(Boolean).join(' · ')}</span>
          <time dateTime={file.created_at} className="font-mono-brand tabular-nums">
            {formatDate(file.created_at.slice(0, 10))}
          </time>
        </p>
      </div>
      {canDelete ? (
        <button type="button" onClick={onDelete} aria-label={`Delete ${file.name}`} className={`${ROW_ACTION} hover:text-danger`}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}
```

`src/components/organizations/detail/FilesSection.tsx`:

```tsx
import { useId, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';
import { useAppDispatch, useAppSelector, useCapability } from '../../../hooks';
import type { Account } from '../../../features/customers/customersSlice';
import { canDeleteFile, FILE_ACCEPT } from '../../../features/files/fileFormat';
import { deleteFile, downloadAttachment, fetchFiles, uploadFile, type Attachment, type FileParent } from '../../../features/files/filesSlice';
import { byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorBlock } from '../portfolio/PortfolioSections';
import { BUTTON, FOCUS } from '../portfolio/styles';
import { FileItem } from './FileItem';
import { ListSkeleton, ScopedEmpty } from './ListParts';
import { LIST, SECTION_HEADING } from './listStyles';

/** Files (spec 2026-09-27 §4): the organization's own files and every
 *  visible account's, each tagged, narrowed by the account chip. Uploading
 *  (the button or a drop) while an account is chosen attaches to that
 *  account. Downloads go through the session: the API never exposes a URL a
 *  plain link could open. */
export function FilesSection({
  customerId,
  account,
  accounts,
  isSm,
  onShowAll,
}: {
  customerId: number;
  /** The chip: '' All, 'none' the organization itself, or an account id. */
  account: string;
  accounts: Account[];
  isSm: boolean;
  onShowAll: () => void;
}) {
  const dispatch = useAppDispatch();
  const { items, isLoading, error, uploading, uploadError } = useAppSelector((state) => state.files);
  const me = useAppSelector((state) => state.auth.user);
  const isAdmin = useCapability('manage_org_settings');
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const descriptionId = useId();

  // Before paint, as People does.
  useLayoutEffect(() => {
    void dispatch(fetchFiles({ entityType: 'organization', customerId })).then(() => setLoaded(true));
  }, [dispatch, customerId, attempt]);

  const target = chosenAccount(accounts, account);
  const parent: FileParent = target ? { entityType: 'account', customerId, accountId: target.id } : { entityType: 'organization', customerId };
  const shown = byAccount(items, account);
  const failed = error !== null && !isLoading;

  async function send(files: FileList | File[]) {
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
          <p className="text-[13px] text-ink-muted">Up to 25 MB each. New files go on {target?.name ?? 'the organization'}.</p>
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
          <button type="button" onClick={() => input.current?.click()} disabled={uploading} className={`${BUTTON} justify-center`}>
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            {uploading ? 'Uploading…' : 'Upload file'}
          </button>
        </div>
      </div>
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
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail/FileItem.test.tsx src/components/organizations/detail/FilesSection.test.tsx src/components/organizations/detail/houseRules.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/FileItem.tsx src/components/organizations/detail/FileItem.test.tsx src/components/organizations/detail/FilesSection.tsx src/components/organizations/detail/FilesSection.test.tsx
git commit -m "feat(organizations): Files lists the organisation's and its accounts' files, tagged

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The Calls section (day-grouped plain rows)

**Files:**
- Create: `src/components/organizations/detail/CallItem.tsx`
- Create: `src/components/organizations/detail/CallItem.test.tsx`
- Create: `src/components/organizations/detail/CallsSection.tsx`
- Create: `src/components/organizations/detail/CallsSection.test.tsx`

**Interfaces:**
- Consumes: `durationLabel` (Task 6); `callsSummary` (Task 6); `byAccount`, `chosenAccount`, `scopeLabel`, `accountTag` (Task 1); list parts (Task 7); `groupByDay`, `dayLabel`, `localDay`, `timeLabel` (`features/organizations/storyDays`); `fetchCalls` (callsSlice); `downloadAttachment`; `AddFlow` (`./AddFlow`).
- Produces: `CallItem({ call: Call })` (`<li data-call={id}>`); `CallsSection({ customerId: number; account: string; accounts: Account[]; isSm: boolean; active: boolean; version: number; onLogged: () => void; onShowAll: () => void })` (a region named "Calls").

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/detail/CallItem.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Call } from '../../../features/calls/callsSlice';
import { CALLS, FILES } from '../../../features/organizations/testStory';
import { CallItem } from './CallItem';

function renderItem(call: Call) {
  render(
    <ul>
      <CallItem call={call} />
    </ul>,
  );
  return screen.getByRole('listitem');
}

describe('CallItem (spec 2026-09-27 §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows title, time, a one-line summary, then the account, host, duration and sentiment', () => {
    const item = renderItem(CALLS[1]);
    expect(within(item).getByRole('heading', { name: 'EMEA renewal call' })).toBeInTheDocument();
    expect(within(item).getByText('Quote accepted in principle.')).toHaveClass('truncate');
    for (const text of ['EMEA', 'Carl CSM · 45 min', 'Positive']) expect(within(item).getByText(text)).toBeInTheDocument();
    expect(item.querySelector('time')).toHaveClass('font-mono-brand', 'tabular-nums');
  });

  it('opens the whole summary in place from its title', async () => {
    const item = renderItem(CALLS[0]);
    const title = within(item).getByRole('button', { name: 'Quarterly check-in' });
    expect(title).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(within(item).getByText('The admin left and usage fell. Agreed a retraining session.')).toHaveClass('whitespace-pre-line');
  });

  it('names who was on it, and links the recording in a new tab', () => {
    const item = renderItem({ ...CALLS[1], participants: CALLS[0].participants });
    expect(within(item).getByText('With Pat Finance')).toBeInTheDocument();
    const recording = within(item).getByRole('link', { name: 'Recording' });
    expect(recording).toHaveAttribute('href', 'https://recordings.example/13');
    expect(recording).toHaveAttribute('target', '_blank');
  });

  it('never links a recording that is not http(s), and says when there is no summary', () => {
    const item = renderItem({ ...CALLS[1], recording_url: 'javascript:alert(1)', summary: '' });
    expect(within(item).queryByRole('link')).not.toBeInTheDocument();
    expect(within(item).getByText('No summary yet.')).toBeInTheDocument();
    expect(within(item).queryByRole('button', { name: 'EMEA renewal call' })).not.toBeInTheDocument();
  });

  it('downloads the transcript, and says when that fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'Try later.' }) })));
    const item = renderItem({ ...CALLS[0], transcript: { ...FILES[0], name: 'Transcript.vtt', source: 'transcript' } });
    await userEvent.click(within(item).getByRole('button', { name: 'Transcript' }));
    expect(await within(item).findByRole('alert')).toHaveTextContent('Could not download the transcript.');
  });
});
```

`src/components/organizations/detail/CallsSection.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import {
  ACCOUNTS,
  CALLS,
  ORGANIZATION_LISTS,
  postBodies,
  requestPaths,
  stubOrganizationPage,
  type OrganizationLists,
} from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { CallsSection } from './CallsSection';

type Props = ComponentProps<typeof CallsSection>;
const BASE: Props = { customerId: 7, account: '', accounts: ACCOUNTS, isSm: true, active: true, version: 0, onLogged: () => {}, onShowAll: () => {} };

function renderCalls(props: Partial<Props> = {}, lists: OrganizationLists = ORGANIZATION_LISTS) {
  const spy = stubOrganizationPage({ lists });
  const store = makeDetailStore();
  const ui = (extra: Partial<Props> = {}) => (
    <Provider store={store}>
      <MemoryRouter>
        <CallsSection {...BASE} {...props} {...extra} />
      </MemoryRouter>
    </Provider>
  );
  const { rerender } = render(ui());
  return { spy, rerender: (extra: Partial<Props>) => rerender(ui(extra)) };
}

const callIds = () => [...document.querySelectorAll('[data-call]')].map((el) => el.getAttribute('data-call'));
const readsOfCalls = (spy: Parameters<typeof requestPaths>[0]) => requestPaths(spy).filter((path) => path === 'GET /customers/7/calls/').length;

describe('CallsSection (spec 2026-09-27 §4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('groups the calls by day, newest first, under a summary line, with no rail and no inner scroll', async () => {
    renderCalls();
    expect(screen.getByRole('status', { name: 'Loading calls' })).toBeInTheDocument();
    await waitFor(() => expect(callIds()).toEqual(['12', '13']));
    const section = screen.getByRole('region', { name: 'Calls' });
    expect(within(section).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(document.querySelector('[data-summary]')).toHaveTextContent('2 calls · 1 h 15 min on calls · 1 positive · 0 neutral · 1 negative');
    expect(section.querySelector('.overflow-y-auto, .overflow-auto, [data-calls-list]')).toBeNull();
  });

  it('narrows to the chosen account', async () => {
    renderCalls({ account: '31' });
    await waitFor(() => expect(callIds()).toEqual(['13']));
  });

  it('says so when the organization itself has none', async () => {
    renderCalls({ account: 'none' }, { calls: [CALLS[1]] });
    expect(await screen.findByText('No calls on the organization itself')).toBeInTheDocument();
  });

  it('logs a call on the chosen account from the + Add sheet, and tells the page', async () => {
    const onLogged = vi.fn();
    const { spy } = renderCalls({ account: '31', onLogged });
    await waitFor(() => expect(callIds()).toEqual(['13']));
    await userEvent.click(screen.getByRole('button', { name: 'Log a call' }));
    const dialog = screen.getByRole('dialog', { name: 'Log a call' });
    expect(within(dialog).getByText('On EMEA')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Call title' }), 'Pricing follow-up');
    fireEvent.change(within(dialog).getByLabelText('When'), { target: { value: '2026-09-26T12:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log call' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postBodies(spy, '/customers/7/accounts/31/calls/')).toHaveLength(1);
    expect(onLogged).toHaveBeenCalledOnce();
    await waitFor(() => expect(callIds()).toHaveLength(2));
  });

  it('closes the sheet when its tab is hidden', async () => {
    const { rerender } = renderCalls();
    await waitFor(() => expect(callIds()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Log a call' }));
    expect(screen.getByRole('dialog', { name: 'Log a call' })).toBeInTheDocument();
    rerender({ active: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reads again when the page bumps the version (a call logged from the Story)', async () => {
    const { spy, rerender } = renderCalls();
    await waitFor(() => expect(readsOfCalls(spy)).toBe(1));
    rerender({ version: 1 });
    await waitFor(() => expect(readsOfCalls(spy)).toBe(2));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/organizations/detail/CallItem.test.tsx src/components/organizations/detail/CallsSection.test.tsx --maxWorkers=2`
Expected: FAIL — neither module exists.

- [ ] **Step 3: Implement**

`src/components/organizations/detail/CallItem.tsx`:

```tsx
import { useId, useState } from 'react';
import { ExternalLink, FileText, Phone } from 'lucide-react';
import { durationLabel } from '../../../features/calls/callFormat';
import type { Call } from '../../../features/calls/callsSlice';
import { downloadAttachment } from '../../../features/files/filesSlice';
import { accountTag } from '../../../features/organizations/accountScope';
import { timeLabel } from '../../../features/organizations/storyDays';
import { AccountTag } from './ListParts';
import { ITEM_LINK, META, ROW_ICON, TITLE_BUTTON } from './listStyles';

const SENTIMENT: Record<Exclude<Call['sentiment'], ''>, { label: string; tone: string }> = {
  positive: { label: 'Positive', tone: 'bg-success-dim text-success' },
  neutral: { label: 'Neutral', tone: 'bg-subtle text-ink-muted' },
  negative: { label: 'Negative', tone: 'bg-danger-dim text-danger' },
};

/** One call as a plain row, like a Story item (spec 2026-09-27 §4): title
 *  and time, a one-line summary its title opens in place, then the account
 *  tag, host, duration and sentiment, who was on it, and the transcript and
 *  recording. */
export function CallItem({ call }: { call: Call }) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const detailId = useId();
  const sentiment = call.sentiment ? SENTIMENT[call.sentiment] : null;
  // The value lands in an href: only http(s) is linked.
  const recording = /^https?:\/\//i.test(call.recording_url) ? call.recording_url : null;
  const via = call.connector_name ? `via ${call.connector_name}` : null;
  const who = [call.host_name, durationLabel(call.duration_minutes) || null, via].filter(Boolean).join(' · ');
  const transcript = call.transcript;

  async function openTranscript() {
    if (!transcript) return;
    setFailed(false);
    try {
      await downloadAttachment(transcript);
    } catch {
      setFailed(true);
    }
  }

  return (
    <li data-call={call.id} className="flex gap-3 px-3 py-2.5">
      <span aria-hidden="true" className={ROW_ICON}>
        <Phone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h4 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            {call.summary ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? detailId : undefined}
                onClick={() => setExpanded((value) => !value)}
                className={TITLE_BUTTON}
              >
                {call.title}
              </button>
            ) : (
              call.title
            )}
          </h4>
          <time dateTime={call.occurred_at} className="shrink-0 font-mono-brand text-[11px] tabular-nums text-ink-muted">
            {timeLabel({ occurred_at: call.occurred_at, all_day: false })}
          </time>
        </div>
        {!call.summary ? (
          <p className="text-[13px] text-ink-muted">No summary yet.</p>
        ) : expanded ? (
          <p id={detailId} className="whitespace-pre-line break-words text-[13px] text-ink-muted">
            {call.summary}
          </p>
        ) : (
          <p className="truncate text-[13px] text-ink-muted">{call.summary}</p>
        )}
        <p className={META}>
          <AccountTag name={accountTag(call)} />
          <span className="min-w-0 truncate">{who}</span>
          {sentiment ? <span className={`rounded-full px-2 py-0.5 ${sentiment.tone}`}>{sentiment.label}</span> : null}
        </p>
        {call.participants.length ? (
          <p className="mt-0.5 truncate text-[11px] text-ink-muted">With {call.participants.map((person) => person.name).join(', ')}</p>
        ) : null}
        {transcript || recording ? (
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] font-semibold">
            {transcript ? (
              <button type="button" onClick={() => void openTranscript()} className={`${ITEM_LINK} underline`}>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Transcript
              </button>
            ) : null}
            {recording ? (
              <a href={recording} target="_blank" rel="noopener noreferrer" className={`${ITEM_LINK} underline`}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Recording
              </a>
            ) : null}
          </p>
        ) : null}
        {failed ? (
          <p role="alert" className="text-[11px] text-danger">
            Could not download the transcript.
          </p>
        ) : null}
      </div>
    </li>
  );
}
```

`src/components/organizations/detail/CallsSection.tsx`:

```tsx
import { useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchCalls } from '../../../features/calls/callsSlice';
import type { Account } from '../../../features/customers/customersSlice';
import { byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { callsSummary } from '../../../features/organizations/listSummaries';
import { dayLabel, groupByDay, localDay } from '../../../features/organizations/storyDays';
import { ErrorBlock } from '../portfolio/PortfolioSections';
import { BUTTON } from '../portfolio/styles';
import { AddFlow } from './AddFlow';
import { CallItem } from './CallItem';
import { ListSkeleton, ScopedEmpty, SummaryLine } from './ListParts';
import { LIST, SECTION_HEADING } from './listStyles';

/** Calls (spec 2026-09-27 §4): the organization's calls and every visible
 *  account's, narrowed by the account chip, as day-grouped plain rows like
 *  the Story's. No timeline rail and no scroll area of its own: the page
 *  scrolls. "Log a call" is the Story's + Add sheet, on the chosen account
 *  when there is one. */
export function CallsSection({
  customerId,
  account,
  accounts,
  isSm,
  active,
  version,
  onLogged,
  onShowAll,
}: {
  customerId: number;
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
}) {
  const dispatch = useAppDispatch();
  const { items, isLoading, error } = useAppSelector((state) => state.calls);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [logging, setLogging] = useState(false);
  if (!active && logging) setLogging(false);
  const headingId = useId();

  // Before paint, as People does.
  useLayoutEffect(() => {
    void dispatch(fetchCalls({ entityType: 'organization', customerId })).then(() => setLoaded(true));
  }, [dispatch, customerId, version, attempt]);

  const target = chosenAccount(accounts, account);
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
    <section aria-labelledby={headingId} aria-busy={isLoading} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className={SECTION_HEADING}>
          Calls
        </h2>
        <button type="button" onClick={() => setLogging(true)} className={BUTTON}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Log a call
        </button>
      </div>
      {loaded && !failed && shown.length > 0 ? <SummaryLine parts={callsSummary(shown)} /> : null}
      {body}
      {active && logging ? (
        <AddFlow
          what="call"
          customerId={customerId}
          accountId={target?.id}
          accountName={target?.name}
          isSm={isSm}
          onClose={() => setLogging(false)}
          onAdded={() => {
            setLogging(false);
            onLogged();
          }}
        />
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail/CallItem.test.tsx src/components/organizations/detail/CallsSection.test.tsx src/components/organizations/detail/houseRules.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/CallItem.tsx src/components/organizations/detail/CallItem.test.tsx src/components/organizations/detail/CallsSection.tsx src/components/organizations/detail/CallsSection.test.tsx
git commit -m "feat(organizations): Calls as day-grouped rows, tagged by account

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The Files tab composes the two sections

**Files:**
- Modify (rewrite): `src/components/organizations/detail/FilesCallsTab.tsx`
- Modify: `src/components/organizations/detail/alignment.test.tsx`
- Modify: `src/components/organizations/detail/otherTabs.test.tsx`
- Modify: `src/pages/organizations/Details.tsx`

**Interfaces:**
- Consumes: `FilesSection` (Task 12), `CallsSection` (Task 13), `showAll` (Task 9).
- Produces: `FilesCallsTab({ customerId: number; account: string; accounts: Account[]; isSm: boolean; active: boolean; callsVersion?: number; onCallLogged: () => void; onShowAll: () => void })`.

- [ ] **Step 1: Write the failing tests**

In `alignment.test.tsx`, replace the test "has one Files heading and no scroll area inside the calls" with:

```tsx
    it('has one Files and one Calls heading, and no scroll area or rail inside either', () => {
      renderWithStore(<FilesCallsTab customerId={7} account="" accounts={[]} isSm active onCallLogged={() => {}} onShowAll={() => {}} />);
      expect(screen.getAllByRole('heading', { name: 'Files' })).toHaveLength(1);
      expect(screen.getAllByRole('heading', { name: 'Calls' })).toHaveLength(1);
      for (const name of ['Files', 'Calls']) {
        const section = screen.getByRole('region', { name });
        expect(section.querySelector('.overflow-y-auto, .overflow-auto, [data-calls-list]')).toBeNull();
        expect(section).not.toHaveClass('max-w-7xl', 'mx-auto', 'px-6', 'px-8');
      }
    });
```

(keep the next test, "CallSenseTab keeps its own scroll by default (the account page feed)", unchanged.)

In `otherTabs.test.tsx`, replace the test "Files holds the files and the CallSense calls" with:

```tsx
  it('Files holds the files and the calls, each read once for the organization', async () => {
    const spy = stubOrganizationPage();
    renderWithStore(<FilesCallsTab customerId={7} account="" accounts={ACCOUNTS} isSm active onCallLogged={() => {}} onShowAll={() => {}} />);
    expect(screen.getByRole('region', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Calls' })).toBeInTheDocument();
    await waitFor(() => expect(requestPaths(spy)).toEqual(expect.arrayContaining(['GET /customers/7/files/', 'GET /customers/7/calls/'])));
    expect(requestPaths(spy).filter((path) => path === 'GET /customers/7/files/')).toHaveLength(1);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/organizations/detail/alignment.test.tsx src/components/organizations/detail/otherTabs.test.tsx --maxWorkers=2`
Expected: FAIL — `FilesCallsTab` does not accept these props (tsc in vitest reports nothing, but the current tab still renders `FilesTab`'s own `<h3>Files` and CallSense's `data-calls-list`, so the new expectations fail).

- [ ] **Step 3: Implement**

Replace `src/components/organizations/detail/FilesCallsTab.tsx` with:

```tsx
import type { Account } from '../../../features/customers/customersSlice';
import { CallsSection } from './CallsSection';
import { FilesSection } from './FilesSection';

/** Files (spec 2026-09-27 §4): two sections, Files then Calls, each holding
 *  the organization's own records and every visible account's, tagged and
 *  narrowed by the account chip. */
export function FilesCallsTab({
  customerId,
  account,
  accounts,
  isSm,
  active,
  callsVersion = 0,
  onCallLogged,
  onShowAll,
}: {
  customerId: number;
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
}) {
  return (
    <div className="flex flex-col gap-6">
      <FilesSection customerId={customerId} account={account} accounts={accounts} isSm={isSm} onShowAll={onShowAll} />
      <CallsSection
        customerId={customerId}
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

In `src/pages/organizations/Details.tsx`, replace `<FilesCallsTab customerId={orgId} callsVersion={callsVersion} />` with:

```tsx
              <FilesCallsTab
                customerId={orgId}
                account={params.account}
                accounts={accounts}
                isSm={isSm}
                active={tab === 'files'}
                callsVersion={callsVersion}
                // The call is in the calls list already; the story reads again.
                onCallLogged={() => setStoryVersion((v) => v + 1)}
                onShowAll={showAll}
              />
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations src/pages/organizations --maxWorkers=2 && npx tsc -b`
Expected: PASS (including Details' "reads the calls again when + Add logs one while Files is open behind the Story tab"); tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/FilesCallsTab.tsx src/components/organizations/detail/alignment.test.tsx src/components/organizations/detail/otherTabs.test.tsx src/pages/organizations/Details.tsx
git commit -m "feat(organizations): the Files tab as two sections, Files and Calls

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: `/surveys?customer=<id>`, with a picker, linked from the organisation page

**Files:**
- Modify: `src/features/customers/customersSlice.ts` (`fetchSurveys`, `surveysRequestId`)
- Create: `src/features/customers/fetchSurveys.test.ts`
- Modify: `src/pages/surveys/SurveysPage.tsx`
- Modify: `src/pages/surveys/SurveysPage.test.tsx`
- Modify: `src/components/organizations/detail/StoryTab.tsx`
- Modify: `src/pages/organizations/Details.test.tsx`

**Interfaces:**
- Consumes: `chosenAccount` (Task 1).
- Produces: `fetchSurveys(customerId?: number)` (thunk arg `number | void`); `CustomersState.surveysRequestId?: string`; `/surveys` reads and writes `?customer=<id>`.

- [ ] **Step 1: Write the failing tests**

`src/features/customers/fetchSurveys.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import customersReducer, { fetchSurveys, type Survey } from './customersSlice';

const survey = (id: number, customer: number): Survey => ({
  id,
  survey_type: 'nps',
  survey_type_display: 'NPS',
  status: 'sent',
  status_display: 'Sent',
  score: null,
  sent_at: '2026-09-01',
  responded_at: null,
  companies: [{ id: customer, name: `Company ${customer}` }],
  account_id: null,
  account_name: null,
  created_at: '2026-09-01T00:00:00Z',
});

describe('fetchSurveys: every survey, or one organization\'s (spec 2026-09-27 §5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for one organization with ?customer=', async () => {
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, status: 200, url, json: async () => [] }));
    vi.stubGlobal('fetch', fetchMock);
    const store = configureStore({ reducer: { customers: customersReducer } });
    await store.dispatch(fetchSurveys());
    await store.dispatch(fetchSurveys(7));
    const asked = fetchMock.mock.calls.map(([url]) => {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search}`;
    });
    expect(asked).toEqual(['/api/v1/surveys/', '/api/v1/surveys/?customer=7']);
  });

  it('keeps the latest read when an earlier one answers last', async () => {
    const answers: Record<string, (body: unknown) => void> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string) =>
          new Promise((resolve) => {
            answers[new URL(url).search || 'all'] = (body) => resolve({ ok: true, status: 200, json: async () => body });
          }),
      ),
    );
    const store = configureStore({ reducer: { customers: customersReducer } });
    const whole = store.dispatch(fetchSurveys());
    const one = store.dispatch(fetchSurveys(7));
    answers['?customer=7']([survey(1, 7)]);
    await one;
    answers.all([survey(1, 7), survey(2, 8)]);
    await whole;
    expect(store.getState().customers.surveys.map((s) => s.id)).toEqual([1]);
    expect(store.getState().customers.surveysLoading).toBe(false);
  });
});
```

In `src/pages/surveys/SurveysPage.test.tsx`:
- Add `within` to the `@testing-library/react` import.
- Add, after `DetailsStub`:

```tsx
function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}
```

- Change `function renderPage() {` to `function renderPage(url = '/surveys') {`, `initialEntries={['/surveys']}` to `initialEntries={[url]}`, and the `/surveys` route's element to:

```tsx
          <Route
            path="/surveys"
            element={
              <>
                <SurveysPage />
                <Where />
              </>
            }
          />
```

- In "logging a survey posts to /surveys/ with customer_id and shows it in the table", replace `expect(await screen.findByText('Shopify')).toBeInTheDocument();` with `expect(await within(await screen.findByRole('table')).findByText('Shopify')).toBeInTheDocument();` (the organization picker now lists Shopify too).
- Append inside the top-level `describe`:

```tsx
  it('filters to one organization from ?customer=, and the picker keeps its choice in the URL', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/surveys/?customer=6')) return Promise.resolve(jsonResponse(200, [sentNps]));
      if (url.endsWith('/surveys/')) return Promise.resolve(jsonResponse(200, [sentNps, respondedCsat]));
      if (url.includes('/customers/')) {
        return Promise.resolve(
          jsonResponse(200, { count: 2, next: null, previous: null, results: [{ id: 6, name: 'Shopify' }, { id: 8, name: 'WeWork' }] }),
        );
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderPage('/surveys?customer=6');

    const table = await screen.findByRole('table');
    expect(await within(table).findByText('Shopify')).toBeInTheDocument();
    expect(within(table).queryByText('WeWork')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Organization')).toHaveValue('6');
    expect(await screen.findByText('Every NPS/CSAT/CES survey logged for Shopify and its accounts.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Organization'), '');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/surveys$/);
    expect(await within(screen.getByRole('table')).findByText('WeWork')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Organization'), '8');
    expect(screen.getByTestId('where')).toHaveTextContent('/surveys?customer=8');
  });

  it('shows an organization it cannot name as its own option, with an empty list rather than an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(jsonResponse(200, url.includes('/surveys/') ? [] : EMPTY_CUSTOMERS_PAGE)),
      ),
    );
    renderPage('/surveys?customer=999');
    expect(await screen.findByText('No surveys logged for Organization 999 yet.')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Organization 999' })).toBeInTheDocument();
  });

  it('ignores a malformed ?customer= and reads every survey', async () => {
    const fetchMock = makeFetchMock({ surveys: [sentNps] });
    vi.stubGlobal('fetch', fetchMock);
    renderPage('/surveys?customer=abc');
    expect(await screen.findByText('Shopify')).toBeInTheDocument();
    expect(screen.getByLabelText('Organization')).toHaveValue('');
  });
```

In `src/pages/organizations/Details.test.tsx`, in "links Feedback to the Surveys page, where surveys are edited, expired and deleted", rename it to "links Feedback to the Surveys page filtered to this organization" and change `toHaveAttribute('href', '/surveys')` to `toHaveAttribute('href', '/surveys?customer=7')`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/customers/fetchSurveys.test.ts src/pages/surveys/SurveysPage.test.tsx src/pages/organizations/Details.test.tsx --maxWorkers=2`
Expected: FAIL — `fetchSurveys(7)` still asks `/surveys/`; no Organization picker; the link is `/surveys`.

- [ ] **Step 3: Implement**

In `src/features/customers/customersSlice.ts`:
- In the state interface, after `surveysError: string | null;`, add:

```ts
  /** The last fetchSurveys asked for: an earlier, slower read (another
   *  organization's) never overwrites it. */
  surveysRequestId?: string;
```

- Replace the `fetchSurveys` thunk with:

```ts
// Powers the standalone Surveys page — every Survey across every
// Customer/Account the caller's organisation owns, or with `customerId`
// one organisation's (organisation-level and its visible accounts', spec
// 2026-09-27 §5). Unpaginated (see SurveyListView's own docstring on the
// backend — its own rollup cards are computed client-side from this list).
export const fetchSurveys = createAsyncThunk<Survey[], number | void, { rejectValue: string }>(
  'customers/fetchSurveys',
  async (customerId, { rejectWithValue }) => {
    try {
      return await apiFetch<Survey[]>(customerId ? `/surveys/?customer=${customerId}` : '/surveys/');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not load surveys.';
      return rejectWithValue(message);
    }
  }
);
```

- Replace the three `fetchSurveys` cases in `extraReducers` with:

```ts
      .addCase(fetchSurveys.pending, (state, action) => {
        state.surveysLoading = true;
        state.surveysError = null;
        state.surveysRequestId = action.meta.requestId;
      })
      .addCase(fetchSurveys.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.surveysRequestId) return;
        state.surveysLoading = false;
        state.surveys = action.payload;
      })
      .addCase(fetchSurveys.rejected, (state, action) => {
        if (action.meta.requestId !== state.surveysRequestId) return;
        state.surveysLoading = false;
        state.surveysError = action.payload ?? 'Could not load surveys.';
      })
```

In `src/pages/surveys/SurveysPage.tsx`:
- Change the React import to `import { useEffect, useId, useMemo, useState } from 'react';` and the router import to `import { useNavigate, useSearchParams } from 'react-router-dom';`.
- Replace the mount effect

```tsx
  useEffect(() => {
    dispatch(fetchSurveys());
    // Company picker for "Log Survey" — same source as PipelinesPage's
    // own Add Opportunity/Add Risk.
    dispatch(fetchCustomers());
  }, [dispatch]);

  const companies = useMemo(() => customers.map((c) => ({ id: c.id, name: c.name })), [customers]);
```

with

```tsx
  // ?customer=<id> narrows the page to one organization (spec 2026-09-27
  // §5); the organization page's "Manage surveys" links here with it.
  const [search, setSearch] = useSearchParams();
  const pickerId = useId();
  const customerParam = search.get('customer') ?? '';
  const customerId = /^[1-9]\d*$/.test(customerParam) ? Number(customerParam) : null;

  useEffect(() => {
    dispatch(fetchSurveys(customerId ?? undefined));
  }, [dispatch, customerId]);
  useEffect(() => {
    // The company pickers (Log Survey, and the organization filter) — same
    // source as PipelinesPage's own Add Opportunity/Add Risk.
    dispatch(fetchCustomers());
  }, [dispatch]);

  const companies = useMemo(() => customers.map((c) => ({ id: c.id, name: c.name })), [customers]);
  // The picker lists the first page of organizations; one not on it is
  // named from its surveys, or by its id.
  const filteredName =
    customerId === null
      ? null
      : (companies.find((c) => c.id === customerId)?.name ??
        surveys.flatMap((s) => s.companies).find((c) => c.id === customerId)?.name ??
        `Organization ${customerId}`);
```

- Replace the subtitle paragraph's text `Every NPS/CSAT/CES survey logged across every Organization and Account.` with `{filteredName ? `Every NPS/CSAT/CES survey logged for ${filteredName} and its accounts.` : 'Every NPS/CSAT/CES survey logged across every Organization and Account.'}`.
- Insert, right after the header `</div>` (the one closing the title and Log Survey row) and before `{surveysError && …}`:

```tsx
      <div className="flex flex-col gap-1">
        <label htmlFor={pickerId} className="text-[13px] font-semibold text-ink">
          Organization
        </label>
        <select
          id={pickerId}
          value={customerId === null ? '' : String(customerId)}
          onChange={(e) => setSearch(e.target.value ? { customer: e.target.value } : {})}
          className="min-h-11 w-full max-w-xs rounded-lg border border-line bg-surface px-3 text-[13px] text-ink sm:min-h-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <option value="">All organizations</option>
          {customerId !== null && !companies.some((c) => c.id === customerId) ? (
            <option value={String(customerId)}>{filteredName}</option>
          ) : null}
          {companies.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
```

- Replace `<p className="text-[14px] font-semibold text-ink-muted">No surveys logged yet.</p>` with `<p className="text-[14px] font-semibold text-ink-muted">{filteredName ? `No surveys logged for ${filteredName} yet.` : 'No surveys logged yet.'}</p>`.

In `src/components/organizations/detail/StoryTab.tsx`:
- Add `import { chosenAccount } from '../../../features/organizations/accountScope';`.
- Replace

```ts
  const chosen = /^\d+$/.test(params.account) ? accounts.find((account) => account.id === Number(params.account)) : undefined;
```

with

```ts
  const chosen = chosenAccount(accounts, params.account);
```

- Replace the comment `// Surveys are edited, expired and deleted on the Surveys page, which` / `// has no per-organization filter yet, so this links to all of them.` with `// Surveys are edited, expired and deleted on the Surveys page, filtered to this organization.`, and `<Link to="/surveys"` with ``<Link to={`/surveys?customer=${orgId}`}``.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/features/customers src/pages/surveys src/pages/organizations src/components/organizations/detail src/components/layout --maxWorkers=2 && npx tsc -b`
Expected: PASS (Navbar.test's preloaded customers state compiles: the new field is optional); tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/customers/customersSlice.ts src/features/customers/fetchSurveys.test.ts src/pages/surveys/SurveysPage.tsx src/pages/surveys/SurveysPage.test.tsx src/components/organizations/detail/StoryTab.tsx src/pages/organizations/Details.test.tsx
git commit -m "feat(surveys): filter by organisation in the URL, linked from the organisation page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: End to end in jsdom — choose an account, see the lists narrow, upload to it

**Files:**
- Create: `src/pages/organizations/DetailsLists.test.tsx`

**Interfaces:**
- Consumes: everything above; `renderOrganizationPage`, `stubOrganizationPage({ lists: ORGANIZATION_LISTS })`, `postBodies`.

- [ ] **Step 1: Write the test**

`src/pages/organizations/DetailsLists.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ORGANIZATION_LISTS, postBodies, stubOrganizationPage } from '../../features/organizations/testStory';
import { resetViewport } from '../../test/viewport';
import { renderOrganizationPage } from './testDetail';

// End to end in jsdom (spec 2026-09-27 §7): the real page, store and router;
// only fetch is stubbed. Choosing an account on the Story narrows People,
// Deals & risks and Files, the chips count each tab, and a file uploaded
// while the account is chosen lands on it.
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const chips = () => screen.getByRole('group', { name: 'Filter by account' });
const chip = (name: string) => within(chips()).getByRole('button', { name });

describe('the organization page, delivery 2: the lists and the account chips', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('narrows People, Deals & risks and Files to the chosen account, counting each tab, and uploads to it', async () => {
    const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    renderOrganizationPage();
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
    await userEvent.click(await within(chips()).findByRole('button', { name: 'EMEA 1' }));
    expect(where().searchParams.get('account')).toBe('31');

    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    const people = screen.getByRole('tabpanel', { name: 'People' });
    expect(await within(people).findByRole('heading', { name: 'Dana Buyer' })).toBeInTheDocument();
    expect(within(people).queryByText('Sam Admin')).not.toBeInTheDocument();
    await waitFor(() => expect(chip('All 3')).toBeInTheDocument());
    expect(chip('EMEA 1')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('North America 1')).toBeInTheDocument();
    expect(chip('Organization 1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Deals & risks' }));
    const deals = screen.getByRole('tabpanel', { name: 'Deals & risks' });
    expect(await within(deals).findByText('EMEA seat expansion')).toBeInTheDocument();
    expect(within(deals).queryByText('Analytics add-on')).not.toBeInTheDocument();
    await waitFor(() => expect(chip('All 3')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('tab', { name: 'Files' }));
    const files = screen.getByRole('tabpanel', { name: 'Files' });
    expect(await within(files).findByText('Order form.pdf')).toBeInTheDocument();
    expect(within(files).queryByText('QBR deck.pptx')).not.toBeInTheDocument();
    expect(await within(files).findByText('EMEA renewal call')).toBeInTheDocument();
    expect(within(files).queryByText('Quarterly check-in')).not.toBeInTheDocument();
    await waitFor(() => expect(chip('All 4')).toBeInTheDocument());
    expect(chip('EMEA 2')).toBeInTheDocument();

    await userEvent.upload(within(files).getByLabelText('Choose files'), new File(['x'], 'Notes.txt', { type: 'text/plain' }));
    expect(await within(files).findByText('Notes.txt')).toBeInTheDocument();
    expect(postBodies(spy, '/customers/7/accounts/31/files/')).toHaveLength(1);
    await waitFor(() => expect(chip('EMEA 3')).toBeInTheDocument());
    expect(where().searchParams.get('account')).toBe('31');

    // Back on the Story, the chips count story items again.
    await userEvent.click(screen.getByRole('tab', { name: 'Story' }));
    expect(chip('EMEA 1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.queryByRole('group', { name: 'Filter by account' })).not.toBeInTheDocument();
  });

  it('renders the phone layouts at 375px: links on their own line, no board, 44px chips', async () => {
    stubOrganizationPage({ lists: ORGANIZATION_LISTS });
    renderOrganizationPage('/organizations/7?tab=people', { width: 375 });
    const email = await screen.findByRole('link', { name: 'dana@emea.northwind.example' });
    expect(email).toHaveClass('min-h-11');
    expect(email.closest('[data-links]')).not.toBeNull();
    for (const button of within(chips()).getAllByRole('button')) expect(button).toHaveClass('min-h-11');
    const header = document.querySelector('[data-part="header"]') as HTMLElement;
    expect(within(header).getByRole('button', { name: 'Add account' })).toHaveClass('min-w-11');
    await userEvent.click(screen.getByRole('tab', { name: 'Deals & risks' }));
    expect(await screen.findByText('EMEA seat expansion')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/pages/organizations/DetailsLists.test.tsx --maxWorkers=2`
Expected: PASS. If it fails, the failure is a real integration bug in Tasks 5–14: fix the code (not the test) with superpowers:systematic-debugging, then re-run.

- [ ] **Step 3: Commit**

```bash
git add src/pages/organizations/DetailsLists.test.tsx
git commit -m "test(organizations): end to end, the chips narrow every list and uploads land on the account

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: The product documents

**Files:**
- Modify: `docs/04-app-flow.md`
- Modify: `docs/03-ui-ux-design.md`

- [ ] **Step 1: App Flow**

In `docs/04-app-flow.md`, step 5 of the Organizations flow:

Replace

```
   `GET /customers/{id}/`; then `AIAttributesPanel`), People (contacts), Deals & risks (opportunities and
   risks), Knowledge (Company View, then headlines) and Files (files, then
   CallSense calls); the last four read their data when first opened. Opening a
```

with

```
   `GET /customers/{id}/`; then `AIAttributesPanel`), People (a list item per
   person, with a summary line and search), Deals & risks (an Opportunities /
   Risks switch over list items, the board from `sm`), Knowledge (Company
   View, then headlines) and Files (files, then calls grouped by day; both
   roll up the organisation's own records and every visible account's, each
   tagged); the last four read their data when first opened. Opening a
```

Replace

```
   Story is read only once Story has been opened. The account chips
   (`?account=`, an id or `none`) filter the Story, whose filters (`group`,
   `source`, `q`) live in the URL too. "+ Add" offers Log a call, New task, New
```

with

```
   Story is read only once Story has been opened. The account chips
   (`?account=`, an id or `none`) sit above the tabs on Story, People, Deals &
   risks and Files and filter each (the lists client-side by `account_id`);
   a chip counts the active tab: story items, people, opportunities plus
   risks, or files plus calls. New contacts, opportunities, risks, files and
   calls go on the chosen account. The Story's filters (`group`, `source`,
   `q`) live in the URL too. "+ Add" offers Log a call, New task, New
```

Replace

```
   The Feedback filter group shows "Manage surveys", a link to `/surveys`
   (that page has no per-organization filter yet, a follow-up). Edit opens
   `OrganizationFormModal`;
```

with

```
   The Feedback filter group shows "Manage surveys", a link to
   `/surveys?customer={id}`. Edit opens `OrganizationFormModal`; Add account,
   beside it, opens `AccountFormModal`;
```

In the route table, change the `/surveys` row to: ``| `/surveys` (`?customer=<id>` filters to one organisation, `GET /surveys/?customer=<id>`) | `SurveysPage` | auth |``.

- [ ] **Step 2: UI/UX**

In `docs/03-ui-ux-design.md`, under "Organization page (`/organizations/:id`)":

Replace the name-row bullet's last line `then Edit and a ⋯ menu (Archive, Churn while they apply).` with `then Edit, Add account (icon-only below sm) and a ⋯ menu (Archive, Churn while they apply).`

Replace

```
- Account chips (All, each account, Organization) carry only a name and the
  story's count; the chosen one is `bg-accent text-on-accent`.
```

with

```
- Account chips (All, each account, Organization) sit above the tabs on
  Story, People, Deals & risks and Files, never on Details or Knowledge.
  They carry only a name and the active tab's count (story items, people,
  opportunities plus risks, files plus calls); the chosen one is
  `bg-accent text-on-accent`, and "Edit <account>" ends the row.
- People, Deals & risks and Files are lists, never tables
  (`detail/ListParts.tsx`, `detail/listStyles.ts`): a one-line summary with
  its figures in DM Mono replaces the stat cards; each tab is one
  `bg-surface` list with dividers; an item is a leading icon or initials, a
  13px title with its figure or time in DM Mono on the right, then an 11px
  line with the account tag (as the Story's). People's ⋯ holds Edit and
  Delete; a deal opens its edit form; a file's name downloads it. Calls are
  grouped by day like the Story, with no rail and no inner scroll. Each list
  has a skeleton, an error with Try again, and empty states that offer "Show
  all accounts" under an account chip. Phones put a person's links on their
  own line and drop the board.
```

In the "below `sm`" paragraph for the organization page, replace

```
snaps sideways, the account chips and the tabs each scroll sideways in their
own row, and the content is full width. "+ Add" and an email's thread open as
```

with

```
snaps sideways, the account chips and the tabs each scroll sideways in their
own row, Add account is icon-only, a person's email and phone take their own
line, Deals & risks has no board, and the content is full width. "+ Add" and an email's thread open as
```

- [ ] **Step 3: Commit**

```bash
git add docs/04-app-flow.md docs/03-ui-ux-design.md
git commit -m "docs(organizations): the tabs as lists, chips across tabs, surveys filter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Final verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Whole test suite**

Run: `npx vitest run --maxWorkers=2`
Expected: every file passes, 0 failed.

- [ ] **Step 2: Types**

Run: `npx tsc -b`
Expected: exit 0, no output.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors (warnings no more than on `main`; compare with `git stash && npm run lint` only if the count looks higher).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `tsc -b && vite build` completes; `dist/` written.

- [ ] **Step 5: Other routes unchanged**

Run: `git diff main --stat -- src/components/shared/ContactsTab.tsx src/components/shared/PipelinesTab.tsx src/pages/accounts`
Expected: no changes listed. Then `git diff main -- src/components/organizations/activity/FilesTab.tsx src/components/organizations/activity/CallSenseTab.tsx` shows only the moved helpers (imports of `FILE_ACCEPT`, `formatSize`, `durationLabel`).

- [ ] **Step 6: If anything failed**

Fix with superpowers:systematic-debugging, commit the fix as `fix(organizations): <what>` with the Co-Authored-By line, and repeat Steps 1–5 until all pass. Use superpowers:verification-before-completion before reporting.

---

### Task 19: Controller browser check at 1440px and 375px, both themes

Run by the controller (not a subagent), after the backend delivery-2 PR is merged and running locally (`revenact-backend` on its usual port) and `npm run dev` is up. Use the claude-in-chrome tools (load them in one ToolSearch call, including `resize_window`). Take a screenshot at each checkpoint.

- [ ] **Step 1: Pick the data.** Sign in; open `/organizations/<id>` for an organisation with at least two accounts, contacts on both an account and the organisation, an opportunity, a risk, a file and a call.

- [ ] **Step 2: 1440px, light theme.**
  - Name row: Edit, Add account, ⋯ in one row; Add account opens the account form.
  - Chips above the tabs on Story, People, Deals & risks and Files; absent on Details and Knowledge; counts change with the tab (story items → people → opportunities + risks → files + calls).
  - Choose an account: `?account=` in the URL survives tab changes; each list narrows; "Edit <account>" ends the chip row.
  - People: items (initials, name, role, email and phone links, tag, status, sentiment, last contacted), summary line, search, ⋯ Edit/Delete; no stat cards, no Filter or Download buttons.
  - Deals & risks: switch, items, summary line, Board toggle shows the board; Add opportunity names the chosen account.
  - Files: files tagged; upload while an account is chosen shows the new file tagged with it; calls day-grouped with no rail and no inner scroll; a summary expands in place.
  - Feedback → Manage surveys opens `/surveys?customer=<id>` with the picker on that organisation; changing the picker updates the URL.
  - Page edges: the column spans the frame with the 24px gutter, nothing capped narrower.

- [ ] **Step 3: 1440px, dark theme.** Repeat Step 2's visual checks: every surface, tag, pill and focus ring legible; no raw white or black.

- [ ] **Step 4: 375px, light and dark.** No horizontal page scroll on any tab; Add account icon-only; chips scroll sideways; people's links on their own line; no Board toggle; every control at least 44px; sheets (Log a call) come up from the bottom.

- [ ] **Step 5: Other routes.** Open `/accounts/<id>` Contacts, Pipelines, Files and CallSense: unchanged from `main`.

- [ ] **Step 6: Record.** Note anything off as a follow-up or fix it in this branch (with a test) before the PR.

---

## Self-review

**Spec coverage.**
- §1 Header: Add account in the name row (Task 4); chips above the tabs, filter Story/People/Deals/Files, `?account=` carries, not on Details/Knowledge (Task 5); counts per tab (Tasks 5, 16); Edit <account> stays at the row's end (Task 4 keeps it; tested in AccountChips and Details).
- §2 People: list items with every listed field and ⋯ Edit/Delete (Tasks 8, 9); one-line summary replaces the cards; search stays; Filter and Download gone (Task 9 test).
- §3 Deals & risks: switch, items with title/stage/MRR (DM Mono)/priority/department/account, select opens edit (Tasks 10, 11); summary per switch with today's figures (Tasks 6, 11); Board kept (Task 11); Add on the chosen account (Task 11).
- §4 Files: both sections roll up and tag (Tasks 12, 13; backend contract); file fields, download, delete where allowed, upload on the chosen account (Task 12); calls day-grouped plain rows with host, title, duration, sentiment, expandable summary, participants, transcript and recording, no rail, no inner scroll (Task 13).
- §5 Surveys: `?customer=` with a picker; Manage surveys links with it (Task 15).
- §6 Backend: consumed, not built here (Global Constraints; types in Task 1).
- §7 States, phones, tests: skeleton/error/empty on every list (Tasks 7, 9, 11–13); 44px targets and conditional phone layouts (Tasks 8, 11, 12, 16); tokens and sizes by the house-rules suite (Task 7 extends it); unit per item, integration, jsdom e2e (Task 16); browser check (Task 19).
- §8 Delivery: frontend PR after the backend's; Task 19 assumes the backend is merged.

**Placeholder scan.** No TBD/TODO or "similar to Task N"; every code step carries its code, and every form label the tests use ("Add Contact", "Add Opportunity", "Add Risk", "Name *", "Email *", "Title *", "Save changes") was checked against the modals; ContactFormModal's Email is required, so every People add or edit test types one.

**Pre-flight (2026-09-28).** Tasks 1–17 were applied verbatim to a throwaway copy of `feat/organization-detail-d2` and checked with `npx tsc -b --noEmit`, `npx vitest run --maxWorkers=2`, `npm run lint` and `npm run build`; the findings and their fixes are in `.superpowers/sdd/2026-09-27-organization-detail-d2-frontend/progress.md`.

**Type consistency.** `account: string`, `accounts: Account[]`, `isSm: boolean`, `onShowAll: () => void` are the same on PeopleTab, DealsTab, FilesSection, CallsSection and FilesCallsTab. `CallsSection` takes `version`/`onLogged`; `FilesCallsTab` maps `callsVersion`/`onCallLogged` onto them. `SummaryPart` is defined once (`listSummaries.ts`) and imported by `ListParts.tsx`. `useChipCounts(tab, storyCounts, accounts)` matches its call in Details. `chosenAccount`, `scopeLabel`, `byAccount`, `accountTag` names match across Tasks 1, 8–15. `fetchSurveys` takes `number | void` and is called as `fetchSurveys(customerId ?? undefined)`.
