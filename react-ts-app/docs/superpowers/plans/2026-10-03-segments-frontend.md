# Segments (frontend, delivery 1 of the tools section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Under Construction" `/segments` with the Segments list, the builder (`/segments/new`, `/segments/:id/edit`) with its live preview, and the segment page (`/segments/:id`) with its tiles and its Members and Changes tabs. Add **Save as segment** to the Organizations, Accounts and Contacts lists. Everything runs on backend PR #84's `/api/v1/segments/` endpoints.

**Architecture:**
- **`src/features/segments/` (new, all pure and unit-tested).** It holds:
  - the contract types and the API;
  - a mirror of the backend field registry (`segmentFields.ts`);
  - the rules-as-a-sentence renderer;
  - the editable rule draft;
  - the mapping from a list's URL filters to rules;
  - the pages' URL state and the tile figures;
  - a contract-shaped fetch stub for tests.
- **`src/components/segments/` and `src/pages/segments/` (new).** The components are the value inputs, the rule editor, the preview, sharing, the list row, the tiles, the header and the Members and Changes tabs. The pages are `SegmentsList`, `Builder` and `SegmentPage`. Each page sits in `OrganizationsFrame` under the framed Navbar bar.
- **The Members tab reuses each kind's own list rows.** Which rows is decided in one place (Decision 8):
  - organisations and accounts render `AccountRow` under `ORGANIZATION_KIND` / `ACCOUNT_KIND`, through `PagedSections` and `usePagedBook`;
  - contacts render `ContactListItem` through `usePagedRead`.
- **Three shared parts gain one optional prop each.** Without the new prop each one behaves exactly as before:
  - `AccountRow`: `selectable` and `menu`;
  - `ContactListItem`: `actions`;
  - `MoveToMenu`: `label`, `menuLabel` and `icon`.

  `PortfolioToolbar` and `ContactsToolbar` gain an optional `onSaveAsSegment`.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, Redux Toolkit (auth only), react-router 7, lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-03-segments-design.md`. This plan covers §3 (pages), §4 item 2 (the frontend PR) and the frontend half of §5 (testing).

The backend contract is `revenact-backend` branch `feat/segments`, PR #84:
- `docs/API_CONTRACTS.md`, section `segments`;
- `services/segments/{registry,views,payloads,members,history,rules,serializers,urls}.py`.

That PR merges and deploys **before** this frontend.

## Global Constraints

- **House rules (spec §3):** "All pages use the Kinso look: tokens only, type at 11, 13, 15 and 22px, numbers in DM Mono, 44px touch targets on phones, and lists made of rows rather than tables. They work on phones." In this repo that means:
  - colour tokens only, with no hex, `rgb()` or palette class;
  - arbitrary sizes `text-[11px]`, `text-[13px]`, `text-[15px]` and `text-[22px]` only;
  - figures in `font-mono-brand tabular-nums` (`MONO`);
  - `min-h-11 sm:min-h-9` (or `w-11 h-11 sm:…`) on every control;
  - Lucide icons with `aria-hidden="true"`;
  - no `<table>`;
  - no glass;
  - no `h-screen`;
  - both themes;
  - sentence-case copy;
  - no added motion.
- **List (spec §3):** "Each row shows the name, kind, member count with today's change ("+3 / −1"), a 30-day size sparkline, the owner, and a shared badge." "Mine, Shared with me and All tabs; a search box; and **+ New segment**." "An empty state explains what a segment is and offers the shortcut below."
- **Builder (spec §3):**
  - "**Basics:** name, kind and description."
  - "**Rules:** written as readable rows ("*CSAT %* is less than *60*"). There is an All/Any switch, **+ Add condition** and **+ Add group**. Each field gets the right value input: number, percent, date window, choice list, owner picker, or a server-searched organisation or account picker."
  - "**Live preview** beside the rules (stacked on phones): "41 organisations match", the first ten, and the totals."
  - "**Sharing** and **Alert me on changes**."
- **Segment page (spec §3):**
  - "**Header:** the name, and the rules as one sentence. The owner and sharing, then Edit, Duplicate, Delete and Export CSV. Edit and Delete are for the owner only."
  - "**Tiles:** members, ARR covered, average health, average CSAT, and entered and left in the last 7 days."
  - "**Members tab:** reuses the Organizations, Accounts or Contacts list rows, search, sort and grouping. Each row has **Pin** and **Keep out** in its menu (owner only)."
  - "**Changes tab:** a day-by-day history of entries and exits, with the reason."
  - "**For a shared viewer:** "12 more members you can't open"."
- **Save as segment (spec §3):** "The Organizations, Accounts and Contacts lists gain a **Save as segment** action beside Filters. It turns the current URL filters into a new segment's rules and opens the builder."
- **Not in this delivery (spec §3):** Ask Revenact on Segments; Segments as survey or campaign audiences; scenario triggers on entry and exit.
- **Testing (spec §5, frontend):**
  - "Unit tests for the rule rows and the sentence rendering."
  - "Integration tests through the real store and router, with fetch stubbed in contract shapes."
  - "A jsdom journey: build, preview, save, open, pin, Changes, Save as segment."
  - "The house-rules suite over the new files."
  - "The Organizations, Accounts and Contacts tests still pass."
  - "A browser check at 1440px (light and dark) and at 375px."
- **Backend contract facts every task honours (PR #84):**
  - **Ruling S8.** `member_count`, `today` and `sparkline` are the owner's nightly figures. They are `null` on a list row the reader does not own, and `member_count` is `null` on the detail for a non-owner. They render as "—", never as a guess.
  - **Members parameters.** `GET /segments/<id>/members/` passes only `sort`, `group`, `group_value`, `search`, `cursor` and `limit` to the kind's list code. Contacts are by name, with `search`, `cursor` and `limit` only.
  - **Changes.** `GET /segments/<id>/changes/?days=` takes 1–90 (default 30). Each day names at most 100 records per direction. Each day also carries `totals` (every record the reader may open that moved) and `more` (the ones the cap left unnamed), so the UI shows "+N more".
  - **Hidden records.**
    - `hidden_count` is a count only, on members and on changes.
    - A rule id the reader can't open comes back as `null` with no label. It renders as "an organisation you can't open", "an account you can't open", "an owner you can't open" or "a product you can't open".
  - **Writes.** PATCH, DELETE, pin and keep out are owner-only. Another reader gets `403 {"detail": "Only the segment's owner can change it."}`. A segment the reader can't read is a `404`, identical to a missing one.
  - **Limits.**
    - 50 segments per owner: `400 {"detail": "You can own at most 50 segments."}`.
    - 20 conditions, counting those inside groups.
    - Groups do not nest, and a group may not be empty.
    - 500 pins and 500 keep-outs: `400 {"detail": "A segment can pin at most 500 records, and keep out as many."}`.
    - `shared_with` holds 1–50 teammates when `sharing` is `people`.
  - **400 shapes.**
    - `{"rules": ["<text>"]}`, `{"name": [...]}`, `{"shared_with": [...]}` and `{"kind": ["A segment's kind cannot change."]}`.
    - The preview checks rules exactly as a save does.
    - `POST /segments/` takes no `pinned_ids` or `excluded_ids`. Pins have their own endpoint, `PATCH /segments/<id>/members/<record_id>/ {"state": "pinned" | "excluded" | "none"}`.
  - **The new notification kind `segment_changes`.** Its message is `"<name>: 3 entered, 1 left"` and its link is `/segments/<id>?tab=changes`.
- **Copy:** the spec's own words for this section, "organisations" (as in "41 organisations match"). Kind labels are Organisations, Accounts and Contacts.
- **Tests** follow the `testing` skill: unit tests; integration tests on the real store and router with `fetch` stubbed in contract shapes (`stubSegments`); a jsdom journey in `src/e2e/`; and the house-rules suite.
  - Run Vitest as `npx vitest run --maxWorkers=2 <paths>`, one process at a time. The full suite is slow on this machine, so keep each new test focused and run only the files a task touches until Task 17.
  - Every test must be able to fail, and its title claims only what it asserts.
  - No new dependencies.
- **Branch and commits.** Work on `feat/segments` in `react-ts-app`. That branch already holds the spec commit. Commits are conventional (`feat(segments): …`, `test(segments): …`, `docs(segments): …`, `refactor(portfolio): …`) and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Product documents** are updated in the same PR: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` and `.agents/workflows/repo-architecture.md`.

## Decisions this plan makes where the spec is silent (the owner may overrule any)

1. **The rules sentence is rendered on the client, naming ids only from the server's `labels`.**
   - `ruleSentence(rules, kind, labels, attributes)` builds the sentence. Field and operator words come from the frontend's registry mirror, and attribute names come from `GET /attributes/definitions/`.
   - Ids are named only from the response's `labels`. A `null` id, or one with no label, reads "an organisation you can't open" and so on. The server never has to render copy, and a hidden record is never named.
   - The registry mirror is pinned to the backend's field lists by a test (Task 2). A field the backend adds later reads as its raw key until the mirror learns it.
2. **Value inputs by registry type (and operator shape):**

   | Type | `is` / `is_not` / `gt` / `lt` | `between` | `in` | `within_next` / `within_last` |
   |---|---|---|---|---|
   | number | number box | two boxes, "and" | — | — |
   | percent | number box, 0–100, "%" | two boxes | — | — |
   | days | whole-number box, "days" | two boxes | — | — |
   | date | date input | two date inputs | — | number box, "days" |
   | choice | select | — | checkboxes | — |
   | text | text box (100 max) | — | comma-separated box | — |
   | boolean | Yes / No select | — | — | — |
   | owner | select: Unassigned + active teammates | — | chips + "Add…" select | — |
   | record: product | select from `GET /products/` | — | chips + "Add…" select | — |
   | record: organisation / account | server-searched picker (`GET /customers/?search=`, `GET /accounts/?search=`, first page) | — | the same picker, many chips | — |

   `is_empty` and `is_not_empty` take no input. A `null` value (a hidden id in saved rules) shows as a chip or option reading "an organisation you can't open" and can be removed.
3. **Preview: debounced and latest-wins.**
   - The builder asks `POST /segments/preview/` 400 ms after the last edit, and only when every condition is complete.
   - Each request is keyed by its JSON body. An answer is used only if its key is still the latest, so a superseded answer is dropped. A pending debounce is cleared on every change.
   - `apiFetch` takes no `AbortSignal` today, and adding one is outside this delivery, so the stale request still completes on the network but is never shown.
   - While a newer answer loads, the last one stays visible, dimmed.
   - A preview `400` shows its `rules` text at the Rules section, the same place a save's `400` shows.
4. **A non-owner on `/segments/:id/edit` sees a read-only notice, not the form.**
   - The notice reads "Only Carl CSM can edit this segment", with **Open segment** and **Duplicate to edit**. Duplicate POSTs `/duplicate/` and opens the copy's builder.
   - A missing or unreadable segment reads "Segment not found", on the builder and on the page alike. The `404` is the same either way.
5. **Save as segment opens the builder at `/segments/new?kind=<kind>&<the list's own filter query>`.** The builder turns that query into rules with `rulesFromList` (Task 5). The address can be reloaded or shared, and no router state is needed.
   - **Organizations:**
     - `owner` → `owner is <id | "unassigned">`;
     - `lifecycle` → `lifecycle_stage is/in`;
     - `health` → `health_category is/in`;
     - `product` → `product is/in`;
     - `renews_within` → `renewal_date within_next <days>`;
     - `nps` → `nps_band is`;
     - `include_churned=1` → the group `(Churned is yes or Churned is no)`.
       - The compiler counts a `churned` condition at any depth as naming churn, so this lifts the churned default the way the list's own toggle does, and still matches everyone.
       - It is left out when `lifecycle` already names `churn`.
   - **Accounts:** the same, plus `organisation` → `organisation is/in`. The Accounts URL has no product or churned filter.
   - **Contacts:** `customer` → `organisation is`, `account` → `account is`, `sentiment is` and `role is`.
   - **Not carried over, each named in a note above the rules:**
     - the search (`search`, or the Contacts list's `q`), per the contract;
     - picked `ids`, since a rule can't name records one by one and a new segment can't be pinned before it is saved.
     - When nothing became a rule, a note says the segment starts with none. Rules that are empty match nobody.
   - **Names.** The organisations and accounts the rules name are named through the existing portfolio reads with `ids` (`fetchPortfolio`, `fetchAccountPortfolio`), so only records the reader may open get a name.
6. **Changes are read by window: 7, 30 or 90 days** (`?days=`, default 30, from a switch). There is no paging beyond the server's own cap: each day lists up to 100 names per direction and then "+N more". The tab's `hidden_count` reads "3 more changes involve records you can't open."
7. **Members tab: search, sort and grouping.**
   - **Organisations and accounts:**
     - search, plus Group and Sort with the kind's own options (`GroupSortFields`);
     - default `-arr`, ungrouped;
     - all in the page URL (`search`, `sort`, `group`, beside `tab` and `days`);
     - grouped sections read their own pages (`group_value`).
   - **Contacts:** search only, by name.
   - **Shared:**
     - 50 rows a page, with Show more;
     - the count line reads "3 organisations", or "1 of 3 organisations" while searching;
     - the tiles come from one separate `limit=1` read, so they always cover every member, as the contract says.
8. **The segment's kind picks the rows in one place, `MembersTab.tsx`:**
   - `customer` → `ORGANIZATION_KIND`;
   - `account` → `ACCOUNT_KIND`, each with `AccountRow` and the kind's opened-row panels (inline from `sm`, `AccountSheet` on phones);
   - `contact` → `ContactListItem` rows linking to `/contacts/:id`.

   Member rows are never selectable (`selectable={false}`): there is no bulk action on a segment.
9. **Pin and Keep out live in the row menu (owner only), built on `MoveToMenu`** with a "More" icon and its own labels.
   - **The menu's choices:** a member that is not pinned offers Pin and Keep out; a pinned member offers Unpin and Keep out.
   - **Kept-out records** are no longer members. They are listed under a **Kept out (N)** disclosure on the Members tab, each with **Let back in**.
   - **How the names are read.** The names come from `POST /segments/preview/` with empty rules and the kept-out ids as pins, which is exactly "those records, as the reader may open them". It returns the first ten and "and N more". It is the only read in the contract that names a list of ids for any kind; contacts have no `ids` filter.
10. **The pages wear the framed bar**, as Contacts does:
    - **Bar:** transparent, with the actions slot and the bell, and no avatar.
    - **Title:** "Segments" on `/segments`, and "‹ Segments" (back to the list) on `/segments/new`, `/segments/:id` and `/segments/:id/edit`.
    - **Layout:** `DashboardLayout` gives `<main>` no padding, and the pages draw `OrganizationsFrame`'s `px-4`.
11. **The list opens on All** (the API's default). The tabs are a switch (`?scope=mine|shared`), and the search is `?search=` (debounced 300 ms with `useSearchText`).
12. **A segment's kind can't change once saved.** The builder shows it as text when editing. On a new segment, changing the kind clears the rules, because the fields differ per kind.
13. **A contacts segment shows two tiles, Members and Last 7 days.** ARR, average health and average CSAT are always `null` for contacts.
14. **An owner-only figure on someone else's segment reads "—"**, with the screen-reader text "Only the owner sees this figure".
15. **The bell needs no change** beyond the new kind in `NotificationKind`. It already shows any notification's server-written `message` and navigates to its `link`. The segment page reads `?tab=changes` from that link.
16. **A contact's parent fields read "<field> of their organisation or account"** ("CSAT % of their organisation or account"), grouped in the field picker under "Their organisation or account".
17. **Client checks before a save:**
    - a name;
    - every condition complete (the first unfinished row is marked);
    - at least one teammate when sharing with chosen teammates;
    - at most 20 conditions (+ Add is disabled at 20).

    Everything else is the server's, shown where its key points (Decision 3, Task 11).

## File structure

| File | Responsibility |
|---|---|
| `src/features/segments/segmentTypes.ts` (new) | The contract's types; `NO_LABELS` |
| `src/features/segments/segmentApi.ts` (new) | `fetchSegments`, `fetchSegment`, `createSegment`, `updateSegment`, `deleteSegment`, `duplicateSegment`, `fetchMembers`, `exportMembers`, `setMemberState`, `fetchChanges`, `previewSegment`, `searchRecords`, `fetchRecordNames` |
| `src/features/segments/testSegments.ts` (new, test only) | Fixtures (`RENEWAL_RISK`, `EMEA_ACCOUNTS`, `CHAMPIONS`, `CHANGES`, `TEAM`), `stubSegments`, `requests` |
| `src/features/segments/segmentFields.ts` (new) | The registry mirror: `FieldDef`, `OPERATORS`, `operatorsOf`, `fieldsFor`, `findField`, kind labels and nouns, `recordHref` |
| `src/features/segments/ruleSentence.ts` (new) | `ruleSentence`, `conditionParts`, `opText`, `dayText`, `HIDDEN_NAME`, `reasonText`, `sentenceText` |
| `src/features/segments/ruleDraft.ts` (new) | The editable rules: uids, `fromRules`/`toRules`, `withField`/`withOp`, `isComplete`, tree edits |
| `src/features/segments/segmentErrors.ts` (new) | `formErrors`, `rulesMessage`: a 400 to the field it names |
| `src/features/segments/fromListFilters.ts` (new) | `rulesFromList`, `saveAsSegmentHref`, `INCLUDE_CHURNED` |
| `src/features/segments/segmentParams.ts` (new) | List and page URL state, `membersQuery`, member sort/group options |
| `src/features/segments/summaryFigures.ts` (new) | `summaryFigures`, `movesText`, `memberCountText`, `OWNER_ONLY` |
| `src/components/segments/{Chip,RecordPicker,ValueInput,RuleEditor,RuleSentence,PreviewPanel,SharingFields,SizeSparkline,SegmentRow,SegmentTiles,SegmentHeader,SegmentStates,MemberMenu,KeptOut,MembersTab,ChangesTab}.tsx` (new) | The parts |
| `src/components/segments/{usePreview,useSegment,useBuilderOptions}.ts` (new) | The preview read, the segment read, attributes and products |
| `src/components/segments/houseRules.test.ts` (new) | The house rules over the new components and pages |
| `src/pages/segments/{SegmentsList,Builder,SegmentPage}.tsx` (new) | The three pages |
| `src/pages/segments/testPages.tsx` (new, test only) | `renderSegments`, `renderInApp` on the real store and router |
| `src/components/organizations/portfolio/AccountRow.tsx` | `selectable`, `menu` |
| `src/components/organizations/portfolio/MoveToMenu.tsx` | `label`, `menuLabel`, `icon` |
| `src/components/contacts/ContactListItem.tsx` | `actions` |
| `src/components/organizations/portfolio/PortfolioToolbar.tsx`, `src/components/contacts/ContactsToolbar.tsx` | `onSaveAsSegment` |
| `src/pages/organizations/List.tsx`, `src/pages/accounts/List.tsx`, `src/pages/contacts/ContactsPage.tsx` | Save as segment |
| `src/pages/organizations/testList.tsx`, `src/pages/accounts/testList.tsx`, `src/pages/contacts/testPage.tsx` | A `/segments/new` stand-in route |
| `src/App.tsx`, `src/components/layout/Navbar.tsx`, `src/layouts/DashboardLayout.tsx` | Routes, the framed bar, no `<main>` padding |
| `src/features/notifications/types.ts` | `segment_changes` |
| `src/e2e/segments.test.tsx` (new) | The journey |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | The product documents |

---

### Task 1: The contract, the API, the test stub and the notification kind

**Files:**
- Create: `src/features/segments/segmentTypes.ts`
- Create: `src/features/segments/segmentApi.ts`
- Create: `src/features/segments/testSegments.ts`
- Modify: `src/features/notifications/types.ts` (`NotificationKind`)
- Modify: `src/components/layout/Navbar.test.tsx` (one route in `renderNavbar`, one test in "Navbar notification bell")
- Test: `src/features/segments/segmentApi.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `apiFetchBlob` via `downloadAttachment` (`features/files/filesSlice`), `localDay` (`features/organizations/storyDays`), `fetchPortfolio` (`features/organizations/portfolioApi`), `fetchAccountPortfolio` (`features/accounts/portfolioApi`); test fixtures `ALL_ROWS`/`buildPortfolio`, `ACCOUNT_ROWS`/`buildAccountPortfolio`, `PEOPLE`.
- Produces:

```ts
// segmentTypes.ts
export type SegmentKind = 'customer' | 'account' | 'contact';
export type SegmentScope = 'all' | 'mine' | 'shared';
export type Sharing = 'private' | 'workspace' | 'people';
export type Match = 'all' | 'any';
export type Operator = 'is' | 'is_not' | 'in' | 'gt' | 'lt' | 'between' | 'within_next' | 'within_last' | 'is_empty' | 'is_not_empty';
export type RuleScalar = number | string | boolean | null;
export type RuleValue = RuleScalar | RuleScalar[];
export interface Condition { field: string; op: Operator; value?: RuleValue }
export interface ConditionGroup { group: { match: Match; conditions: Condition[] } }
export interface Rules { match: Match; conditions: (Condition | ConditionGroup)[] }
export interface RuleLabels { organisations: Record<string, string>; accounts: Record<string, string>; products: Record<string, string>; people: Record<string, string> }
export const NO_LABELS: RuleLabels;
export interface PersonRef { id: number; name: string }
export interface DayMoves { entered: number; left: number }
export interface SegmentListRow { id; name; kind; owner: PersonRef; is_owner; sharing; paused; member_count: number | null; today: DayMoves | null; sparkline: number[] | null; updated_at }
export interface Segment { id; name; description; kind; rules: Rules; labels: RuleLabels; pinned_ids: number[]; excluded_ids: number[]; sharing; shared_with: PersonRef[]; owner: PersonRef; is_owner; alert_on_changes; paused; member_count: number | null; last_evaluated_on: string | null; created_at; updated_at }
export interface SegmentWrite { name; kind; description; rules; sharing; shared_with: number[]; alert_on_changes }
export interface SegmentSummary { members; arr: number | null; unconverted_count; avg_health: number | null; avg_csat: number | null; entered_7d: number | null; left_7d: number | null; currency: CurrencyCode; contacts?: ContactsSummary }
export interface SegmentMembersPage<R> { kind; results: R[]; next_cursor: string | null; count; groups: PortfolioGroup[]; currency: CurrencyCode; hidden_count; summary: SegmentSummary }
export interface ChangeRecord { id; name; reason: string[] }
export interface ChangeDay { date; entered: ChangeRecord[]; left: ChangeRecord[]; totals: DayMoves; more: DayMoves }
export interface SegmentChanges { kind; days: ChangeDay[]; hidden_count }
export interface PreviewRequest { kind; rules: Rules; pinned_ids?: number[]; excluded_ids?: number[] }
export interface PreviewCompany { id; name; owner: PersonRef | null; health: { score: number; category: HealthBand } }
export interface PreviewContact { id; name; role: string; parent: { kind: 'customer' | 'account'; id: number; name: string } }
export interface PreviewResponse { kind; count; results: (PreviewCompany | PreviewContact)[]; summary: SegmentSummary }
export type MemberStateValue = 'pinned' | 'excluded' | 'none';
export interface MemberState { pinned_ids: number[]; excluded_ids: number[] }
// segmentApi.ts
export const SEGMENTS_PATH = '/segments/';
export type PickerRecord = 'customer' | 'account';
export function fetchSegments(scope: SegmentScope, search: string): Promise<SegmentListRow[]>;
export function fetchSegment(id: number): Promise<Segment>;
export function createSegment(body: SegmentWrite): Promise<Segment>;
export function updateSegment(id: number, body: Partial<Omit<SegmentWrite, 'kind'>>): Promise<Segment>;
export function deleteSegment(id: number): Promise<null>;
export function duplicateSegment(id: number): Promise<Segment>;
export function fetchMembers<R>(id: number, query: string): Promise<SegmentMembersPage<R>>;
export function exportMembers(id: number, query: string, today?: Date): Promise<void>;
export function setMemberState(id: number, recordId: number, state: MemberStateValue): Promise<MemberState>;
export function fetchChanges(id: number, days: number): Promise<SegmentChanges>;
export function previewSegment(body: PreviewRequest): Promise<PreviewResponse>;
export function searchRecords(record: PickerRecord, search: string): Promise<PersonRef[]>;
export function fetchRecordNames(record: PickerRecord, ids: number[]): Promise<Record<string, string>>;
// testSegments.ts (test only)
export const ME, CARL, DANA: PersonRef;            // ids 1, 4, 5; ME is the signed-in "Alice"
export const TEAM: { id; name; email; is_active }[];
export const RENEWAL_RISK: Segment;                // id 7, customer, mine, workspace
export const EMEA_ACCOUNTS: Segment;               // id 8, account, Carl's, shared with me, rule names [7, null]
export const CHAMPIONS: Segment;                   // id 9, contact, mine, private
export const SEGMENTS: Segment[];
export function listRow(segment: Segment): SegmentListRow;
export function summaryOf(members: number, kind: SegmentKind): SegmentSummary;
export const CHANGES: SegmentChanges;
export interface SegmentsStub { segments?; list?; create?; patch?; preview?; changes?; hidden?; attributes? }
export function stubSegments(stub?: SegmentsStub): SegmentsSpy;
export function requests(spy: SegmentsSpy, method: string, pattern: RegExp): { path: string; query: URLSearchParams; body: unknown }[];
```

- [ ] **Step 1: Write the failing API test**

```ts
// src/features/segments/segmentApi.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSegment,
  deleteSegment,
  duplicateSegment,
  fetchChanges,
  fetchMembers,
  fetchRecordNames,
  fetchSegment,
  fetchSegments,
  previewSegment,
  searchRecords,
  setMemberState,
  updateSegment,
} from './segmentApi';
import { RENEWAL_RISK, requests, stubSegments, type SegmentsSpy } from './testSegments';

/** "METHOD /path?query" for every request so far, oldest first. */
function called(spy: SegmentsSpy): string[] {
  return spy.mock.calls.map(([input, init]) => {
    const url = new URL(String(input));
    return `${init?.method ?? 'GET'} ${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`;
  });
}

describe('segment API (backend PR #84)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists with no query for All, and sends scope and search only when set', async () => {
    const spy = stubSegments();
    await fetchSegments('all', '');
    await fetchSegments('shared', 'risk');
    expect(called(spy)).toEqual(['GET /segments/', 'GET /segments/?scope=shared&search=risk']);
  });

  it('reads, creates, edits, duplicates and deletes on the contract paths, with the edit body as given', async () => {
    const spy = stubSegments();
    expect((await fetchSegment(7)).name).toBe('Renewal risk');
    await createSegment({
      name: 'Quiet',
      kind: 'customer',
      description: '',
      rules: { match: 'all', conditions: [] },
      sharing: 'private',
      shared_with: [],
      alert_on_changes: false,
    });
    await updateSegment(7, { name: 'Renewal risk Q4' });
    await duplicateSegment(7);
    await deleteSegment(7);
    expect(called(spy)).toEqual([
      'GET /segments/7/',
      'POST /segments/',
      'PATCH /segments/7/',
      'POST /segments/7/duplicate/',
      'DELETE /segments/7/',
    ]);
    expect(requests(spy, 'PATCH', /^\/segments\/7\/$/)[0].body).toEqual({ name: 'Renewal risk Q4' });
  });

  it('reads members with the query given, pins with a state, reads changes by days and previews unsaved rules', async () => {
    const spy = stubSegments();
    expect((await fetchMembers(7, 'search=piz&sort=-arr')).summary.members).toBe(3);
    expect(await setMemberState(7, 2, 'pinned')).toEqual({ pinned_ids: [2], excluded_ids: [] });
    await fetchChanges(7, 90);
    await previewSegment({ kind: 'customer', rules: RENEWAL_RISK.rules });
    expect(called(spy)).toEqual([
      'GET /segments/7/members/?search=piz&sort=-arr',
      'PATCH /segments/7/members/2/',
      'GET /segments/7/changes/?days=90',
      'POST /segments/preview/',
    ]);
    expect(requests(spy, 'PATCH', /members\/2\/$/)[0].body).toEqual({ state: 'pinned' });
  });

  it('searches organisations or accounts by name on their own lists', async () => {
    const spy = stubSegments();
    expect(await searchRecords('customer', 'piz')).toEqual([{ id: 7, name: 'Pizza Hut' }]);
    expect(await searchRecords('account', 'emea')).toEqual([{ id: 12, name: 'Pizza EMEA' }]);
    expect(called(spy)).toEqual(['GET /customers/?search=piz', 'GET /accounts/?search=emea']);
  });

  it('names ids from the kind portfolio, asks nothing for none, and leaves out ids that do not come back', async () => {
    const spy = stubSegments();
    expect(await fetchRecordNames('customer', [])).toEqual({});
    expect(spy).not.toHaveBeenCalled();
    expect(await fetchRecordNames('customer', [7])).toEqual({ '7': 'Pizza Hut' });
    expect(await fetchRecordNames('account', [12, 99])).toEqual({ '12': 'Pizza EMEA' });
    expect(called(spy)).toEqual([
      'GET /organizations/portfolio/?ids=7&limit=100',
      'GET /accounts/portfolio/?ids=12%2C99&limit=100',
    ]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/features/segments/segmentApi.test.ts`
Expected: FAIL, "Failed to resolve import "./segmentApi"".

- [ ] **Step 3: Write the types**

```ts
// src/features/segments/segmentTypes.ts
// The Segments contract (revenact-backend PR #84, docs/API_CONTRACTS.md
// `segments`), field for field. A segment stores rules, never members:
// every read is computed for the reader over what they may open.
import type { CurrencyCode } from '../auth/authSlice';
import type { ContactsSummary } from '../contacts/contactsTypes';
import type { HealthBand, PortfolioGroup } from '../organizations/portfolioTypes';

/** `customer` is an organisation (the backend's model name). */
export type SegmentKind = 'customer' | 'account' | 'contact';
export type SegmentScope = 'all' | 'mine' | 'shared';
export type Sharing = 'private' | 'workspace' | 'people';
export type Match = 'all' | 'any';
export type Operator =
  | 'is'
  | 'is_not'
  | 'in'
  | 'gt'
  | 'lt'
  | 'between'
  | 'within_next'
  | 'within_last'
  | 'is_empty'
  | 'is_not_empty';

/** A rule value as stored. An id the reader cannot open reads `null`. */
export type RuleScalar = number | string | boolean | null;
export type RuleValue = RuleScalar | RuleScalar[];

export interface Condition {
  field: string;
  op: Operator;
  /** Absent for `is_empty` / `is_not_empty`. */
  value?: RuleValue;
}

/** One group: its own all/any. Groups do not nest. */
export interface ConditionGroup {
  group: { match: Match; conditions: Condition[] };
}

export interface Rules {
  match: Match;
  conditions: (Condition | ConditionGroup)[];
}

/** Names for the ids in `rules` the reader may open, by id. People are named
 *  only from the reader's own workspace. */
export interface RuleLabels {
  organisations: Record<string, string>;
  accounts: Record<string, string>;
  products: Record<string, string>;
  people: Record<string, string>;
}

export const NO_LABELS: RuleLabels = { organisations: {}, accounts: {}, products: {}, people: {} };

export interface PersonRef {
  id: number;
  name: string;
}

export interface DayMoves {
  entered: number;
  left: number;
}

export interface SegmentListRow {
  id: number;
  name: string;
  kind: SegmentKind;
  owner: PersonRef;
  is_owner: boolean;
  sharing: Sharing;
  paused: boolean;
  /** The owner's nightly figures, naming nobody: null on a row the reader
   *  does not own (Ruling S8). `sparkline` is 30 sizes, oldest first, and
   *  `[]` before the first evaluation. */
  member_count: number | null;
  today: DayMoves | null;
  sparkline: number[] | null;
  updated_at: string;
}

export interface Segment {
  id: number;
  name: string;
  description: string;
  kind: SegmentKind;
  rules: Rules;
  labels: RuleLabels;
  /** Only the ones the reader may open. */
  pinned_ids: number[];
  excluded_ids: number[];
  sharing: Sharing;
  shared_with: PersonRef[];
  owner: PersonRef;
  is_owner: boolean;
  alert_on_changes: boolean;
  paused: boolean;
  /** The owner's nightly figure: null for anyone else (Ruling S8). */
  member_count: number | null;
  last_evaluated_on: string | null;
  created_at: string;
  updated_at: string;
}

/** POST /segments/ (PATCH takes the same without `kind`). Pins have their
 *  own endpoint. */
export interface SegmentWrite {
  name: string;
  kind: SegmentKind;
  description: string;
  rules: Rules;
  sharing: Sharing;
  shared_with: number[];
  alert_on_changes: boolean;
}

/** The tiles, over every member the reader may open (search narrows the
 *  rows, never these). A contacts segment has no ARR, health or CSAT. The
 *  preview's `entered_7d` / `left_7d` are null. */
export interface SegmentSummary {
  members: number;
  arr: number | null;
  unconverted_count: number;
  avg_health: number | null;
  avg_csat: number | null;
  entered_7d: number | null;
  left_7d: number | null;
  currency: CurrencyCode;
  contacts?: ContactsSummary;
}

/** GET /segments/<id>/members/: the kind's own rows and paging, the tiles,
 *  and how many of the owner's members the reader may not open (a count). */
export interface SegmentMembersPage<R> {
  kind: SegmentKind;
  results: R[];
  next_cursor: string | null;
  count: number;
  groups: PortfolioGroup[];
  currency: CurrencyCode;
  hidden_count: number;
  summary: SegmentSummary;
}

export interface ChangeRecord {
  id: number;
  name: string;
  /** Field keys, or `pinned`, `deleted`, `access`, `churned`, `archived`. */
  reason: string[];
}

/** One day: at most 100 named per direction; `totals` counts every record
 *  the reader may open that moved, `more` the ones the cap left unnamed. */
export interface ChangeDay {
  date: string;
  entered: ChangeRecord[];
  left: ChangeRecord[];
  totals: DayMoves;
  more: DayMoves;
}

export interface SegmentChanges {
  kind: SegmentKind;
  days: ChangeDay[];
  hidden_count: number;
}

export interface PreviewRequest {
  kind: SegmentKind;
  rules: Rules;
  pinned_ids?: number[];
  excluded_ids?: number[];
}

export interface PreviewCompany {
  id: number;
  name: string;
  owner: PersonRef | null;
  health: { score: number; category: HealthBand };
}

export interface PreviewContact {
  id: number;
  name: string;
  role: string;
  parent: { kind: 'customer' | 'account'; id: number; name: string };
}

export interface PreviewResponse {
  kind: SegmentKind;
  count: number;
  /** The first ten by name. */
  results: (PreviewCompany | PreviewContact)[];
  summary: SegmentSummary;
}

export type MemberStateValue = 'pinned' | 'excluded' | 'none';

export interface MemberState {
  pinned_ids: number[];
  excluded_ids: number[];
}
```

- [ ] **Step 4: Write the API**

```ts
// src/features/segments/segmentApi.ts
// Thin apiFetch wrappers over revenact-backend's /api/v1/segments/ (PR #84).
import { apiFetch } from '../../lib/apiClient';
import { fetchAccountPortfolio } from '../accounts/portfolioApi';
import { downloadAttachment } from '../files/filesSlice';
import { fetchPortfolio } from '../organizations/portfolioApi';
import { localDay } from '../organizations/storyDays';
import type {
  MemberState,
  MemberStateValue,
  PersonRef,
  PreviewRequest,
  PreviewResponse,
  Segment,
  SegmentChanges,
  SegmentListRow,
  SegmentMembersPage,
  SegmentScope,
  SegmentWrite,
} from './segmentTypes';

export const SEGMENTS_PATH = '/segments/';
const one = (id: number) => `${SEGMENTS_PATH}${id}/`;

/** The records a rule's picker names: organisations or accounts. */
export type PickerRecord = 'customer' | 'account';

/** Unpaginated, by name. `scope` and `search` are sent only when set. */
export function fetchSegments(scope: SegmentScope, search: string): Promise<SegmentListRow[]> {
  const query = new URLSearchParams();
  if (scope !== 'all') query.set('scope', scope);
  if (search) query.set('search', search);
  const text = query.toString();
  return apiFetch<SegmentListRow[]>(text ? `${SEGMENTS_PATH}?${text}` : SEGMENTS_PATH);
}

export function fetchSegment(id: number): Promise<Segment> {
  return apiFetch<Segment>(one(id));
}

export function createSegment(body: SegmentWrite): Promise<Segment> {
  return apiFetch<Segment>(SEGMENTS_PATH, { method: 'POST', body });
}

/** Owner only: another reader gets 403, a segment they can't read 404. */
export function updateSegment(id: number, body: Partial<Omit<SegmentWrite, 'kind'>>): Promise<Segment> {
  return apiFetch<Segment>(one(id), { method: 'PATCH', body });
}

export function deleteSegment(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

/** Any reader: a private copy they own, rules as they read them. */
export function duplicateSegment(id: number): Promise<Segment> {
  return apiFetch<Segment>(`${one(id)}duplicate/`, { method: 'POST' });
}

/** `query` carries only sort, group, group_value, search, cursor and limit
 *  (the server drops anything else). */
export function fetchMembers<R>(id: number, query: string): Promise<SegmentMembersPage<R>> {
  return apiFetch<SegmentMembersPage<R>>(query ? `${one(id)}members/?${query}` : `${one(id)}members/`);
}

/** Every member the reader may open as CSV (audited server-side), fetched
 *  with the session's token. Named for the reader's own calendar day. */
export function exportMembers(id: number, query: string, today: Date = new Date()): Promise<void> {
  const path = query ? `${one(id)}members/export.csv?${query}` : `${one(id)}members/export.csv`;
  return downloadAttachment({ download_url: path, name: `segment-${id}-${localDay(today)}.csv` });
}

export function setMemberState(id: number, recordId: number, state: MemberStateValue): Promise<MemberState> {
  return apiFetch<MemberState>(`${one(id)}members/${recordId}/`, { method: 'PATCH', body: { state } });
}

export function fetchChanges(id: number, days: number): Promise<SegmentChanges> {
  return apiFetch<SegmentChanges>(`${one(id)}changes/?days=${days}`);
}

/** Unsaved rules, checked exactly as a save is: a 400 reads `{rules: [...]}`. */
export function previewSegment(body: PreviewRequest): Promise<PreviewResponse> {
  return apiFetch<PreviewResponse>(`${SEGMENTS_PATH}preview/`, { method: 'POST', body });
}

/** A rule picker's search: GET /customers/?search= or /accounts/?search=,
 *  first page only, scoped server-side to what the reader may open. */
export async function searchRecords(record: PickerRecord, search: string): Promise<PersonRef[]> {
  const base = record === 'customer' ? '/customers/' : '/accounts/';
  const query = search ? `?${new URLSearchParams({ search }).toString()}` : '';
  const page = await apiFetch<{ results: PersonRef[] }>(`${base}${query}`);
  return page.results.map(({ id, name }) => ({ id, name }));
}

/** Names for the ids a list's filters named (Save as segment), read from the
 *  kind's own portfolio with `ids`: only records the reader may open come
 *  back, so the rest stay unnamed ("an organisation you can't open"). */
export async function fetchRecordNames(record: PickerRecord, ids: number[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const query = new URLSearchParams({ ids: ids.join(','), limit: '100' }).toString();
  const page = record === 'customer' ? await fetchPortfolio(query) : await fetchAccountPortfolio(query);
  return Object.fromEntries(page.results.map((row) => [String(row.id), row.name]));
}
```

- [ ] **Step 5: Write the fixtures and the stub**

```ts
// src/features/segments/testSegments.ts
// Test-only: segments in the backend's contract shapes (revenact-backend PR
// #84, docs/API_CONTRACTS.md `segments`) and one fetch stub answering every
// endpoint the Segments pages read, plus the portfolio reads Save as segment
// and the Organizations list use.
import { vi } from 'vitest';
import { ACCOUNT_ROWS, buildAccountPortfolio } from '../accounts/testPortfolio';
import { PEOPLE } from '../contacts/testContacts';
import { ALL_ROWS, buildPortfolio } from '../organizations/testPortfolio';
import {
  NO_LABELS,
  type PersonRef,
  type PreviewRequest,
  type PreviewResponse,
  type Segment,
  type SegmentChanges,
  type SegmentKind,
  type SegmentListRow,
  type SegmentSummary,
} from './segmentTypes';

/** The signed-in user in pages/segments/testPages.tsx. */
export const ME: PersonRef = { id: 1, name: 'Alice' };
export const CARL: PersonRef = { id: 4, name: 'Carl CSM' };
export const DANA: PersonRef = { id: 5, name: 'Dana CSM' };
/** GET /auth/members/. */
export const TEAM = [ME, CARL, DANA].map((person) => ({ ...person, email: '', is_active: true }));

const BASE = {
  description: '',
  labels: NO_LABELS,
  pinned_ids: [] as number[],
  excluded_ids: [] as number[],
  shared_with: [] as PersonRef[],
  alert_on_changes: false,
  paused: false,
  last_evaluated_on: '2026-10-03',
  created_at: '2026-10-01T09:00:00Z',
  updated_at: '2026-10-03T09:12:00Z',
};

/** Mine: organisations, shared with the workspace, alerts on. */
export const RENEWAL_RISK: Segment = {
  ...BASE,
  id: 7,
  name: 'Renewal risk',
  description: 'Unhappy and renewing soon',
  kind: 'customer',
  rules: {
    match: 'all',
    conditions: [
      { field: 'csat_score', op: 'lt', value: 60 },
      {
        group: {
          match: 'any',
          conditions: [
            { field: 'renewal_date', op: 'within_next', value: 90 },
            { field: 'health_category', op: 'is', value: 'poor' },
          ],
        },
      },
    ],
  },
  sharing: 'workspace',
  owner: ME,
  is_owner: true,
  alert_on_changes: true,
  member_count: 3,
};

/** Carl's: accounts, shared with me by name. Its rule names one organisation
 *  I may open and one I may not (`null`, no label). */
export const EMEA_ACCOUNTS: Segment = {
  ...BASE,
  id: 8,
  name: 'EMEA accounts',
  kind: 'account',
  rules: { match: 'all', conditions: [{ field: 'organisation', op: 'in', value: [7, null] }] },
  labels: { ...NO_LABELS, organisations: { '7': 'Pizza Hut' } },
  sharing: 'people',
  shared_with: [ME],
  owner: CARL,
  is_owner: false,
  member_count: null,
};

/** Mine: contacts, private. */
export const CHAMPIONS: Segment = {
  ...BASE,
  id: 9,
  name: 'Champions',
  kind: 'contact',
  rules: { match: 'all', conditions: [{ field: 'role', op: 'is', value: 'champion' }] },
  sharing: 'private',
  owner: ME,
  is_owner: true,
  member_count: 3,
};

export const SEGMENTS: Segment[] = [RENEWAL_RISK, EMEA_ACCOUNTS, CHAMPIONS];

/** The list's row for a segment: the owner's figures only on mine (S8). */
export function listRow(segment: Segment): SegmentListRow {
  const own = segment.is_owner;
  return {
    id: segment.id,
    name: segment.name,
    kind: segment.kind,
    owner: segment.owner,
    is_owner: own,
    sharing: segment.sharing,
    paused: segment.paused,
    member_count: own ? segment.member_count : null,
    today: own ? { entered: 3, left: 1 } : null,
    sparkline: own ? [1, 2, 2, 3] : null,
    updated_at: segment.updated_at,
  };
}

export function summaryOf(members: number, kind: SegmentKind): SegmentSummary {
  return kind === 'contact'
    ? { members, arr: null, unconverted_count: 0, avg_health: null, avg_csat: null, entered_7d: 1, left_7d: 0, currency: 'USD' }
    : { members, arr: 512000, unconverted_count: 0, avg_health: 5.4, avg_csat: 71.2, entered_7d: 6, left_7d: 2, currency: 'USD' };
}

/** Two days: the newest names one entry of two (`more` 1) and one exit. */
export const CHANGES: SegmentChanges = {
  kind: 'customer',
  days: [
    {
      date: '2026-10-03',
      entered: [{ id: 7, name: 'Pizza Hut', reason: ['csat_score', 'health_category'] }],
      left: [{ id: 1, name: 'Globex', reason: ['access'] }],
      totals: { entered: 2, left: 1 },
      more: { entered: 1, left: 0 },
    },
    {
      date: '2026-10-01',
      entered: [{ id: 2, name: 'Initech', reason: ['pinned'] }],
      left: [],
      totals: { entered: 1, left: 0 },
      more: { entered: 0, left: 0 },
    },
  ],
  hidden_count: 3,
};

type Answer = { status: number; body: unknown };

export interface SegmentsStub {
  /** The store the stub reads and writes (copied; default SEGMENTS). */
  segments?: Segment[];
  list?: () => Answer;
  create?: (body: Record<string, unknown>) => Answer;
  patch?: (id: number, body: Record<string, unknown>) => Answer;
  preview?: (body: PreviewRequest) => Answer;
  changes?: (id: number, days: number) => Answer;
  /** Members' `hidden_count` (default 0 for the owner, 2 for anyone else). */
  hidden?: number;
  /** GET /attributes/definitions/ (default none). */
  attributes?: unknown[];
}

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) };
}

/** What POST /segments/preview/ answers: every row of the kind's fixtures,
 *  or, with no conditions, only the pins (as the backend: no rule matches
 *  nobody, then pins are added). */
function previewOf(request: PreviewRequest): PreviewResponse {
  const all: PreviewResponse['results'] =
    request.kind === 'contact'
      ? PEOPLE.map((person) => ({ id: person.id, name: person.name, role: person.role_display, parent: { kind: 'customer' as const, id: 7, name: 'Pizza Hut' } }))
      : (request.kind === 'customer' ? ALL_ROWS : ACCOUNT_ROWS).map((row) => ({
          id: row.id,
          name: row.name,
          owner: row.owner,
          health: { score: row.health.score, category: row.health.category },
        }));
  const results = request.rules.conditions.length === 0 ? all.filter((row) => (request.pinned_ids ?? []).includes(row.id)) : all;
  return { kind: request.kind, count: results.length, results, summary: { ...summaryOf(results.length, request.kind), entered_7d: null, left_7d: null } };
}

/** GET /segments/<id>/members/: the kind's own fixture rows through the
 *  list builders, keep-outs removed; the tiles over all of them. */
function membersOf(segment: Segment, query: URLSearchParams, hidden: number) {
  const keep = <R extends { id: number }>(rows: R[]) => rows.filter((row) => !segment.excluded_ids.includes(row.id));
  const listQuery = new URLSearchParams(query);
  listQuery.set('include_churned', '1');
  let page: { results: unknown[]; next_cursor: string | null; count: number; groups: unknown[] };
  let total: number;
  if (segment.kind === 'customer') {
    const rows = keep(ALL_ROWS);
    page = buildPortfolio(listQuery, rows);
    total = rows.length;
  } else if (segment.kind === 'account') {
    const rows = keep(ACCOUNT_ROWS);
    page = buildAccountPortfolio(listQuery, rows);
    total = rows.length;
  } else {
    const search = (query.get('search') ?? '').toLowerCase();
    const rows = keep(PEOPLE);
    const found = rows.filter((person) => person.name.toLowerCase().includes(search));
    page = { results: found, next_cursor: null, count: found.length, groups: [] };
    total = rows.length;
  }
  return {
    kind: segment.kind,
    results: page.results,
    next_cursor: page.next_cursor,
    count: page.count,
    groups: page.groups,
    currency: 'USD',
    hidden_count: hidden,
    summary: summaryOf(total, segment.kind),
  };
}

const teammates = (ids: unknown): PersonRef[] =>
  ((ids as number[] | undefined) ?? []).flatMap((id) => TEAM.filter((person) => person.id === id).map(({ id: pk, name }) => ({ id: pk, name })));

export function stubSegments(stub: SegmentsStub = {}) {
  const store: Segment[] = (stub.segments ?? SEGMENTS).map((segment) => ({ ...segment }));
  let nextId = 100;
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    if (path === '/segments/' && method === 'GET') {
      if (stub.list) return reply(stub.list());
      const scope = url.searchParams.get('scope');
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const rows = store
        .filter((s) => (scope === 'mine' ? s.is_owner : scope === 'shared' ? !s.is_owner : true))
        .filter((s) => s.name.toLowerCase().includes(search))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(listRow);
      return json(200, rows);
    }
    if (path === '/segments/' && method === 'POST') {
      if (stub.create) return reply(stub.create(body));
      const created = {
        ...BASE,
        ...body,
        id: nextId++,
        shared_with: teammates(body.shared_with),
        owner: ME,
        is_owner: true,
        member_count: 0,
      } as Segment;
      store.push(created);
      return json(201, created);
    }
    if (path === '/segments/preview/' && method === 'POST') {
      const request = body as unknown as PreviewRequest;
      return stub.preview ? reply(stub.preview(request)) : json(200, previewOf(request));
    }
    const found = /^\/segments\/(\d+)\/(.*)$/.exec(path);
    if (found) {
      const id = Number(found[1]);
      const rest = found[2];
      const segment = store.find((s) => s.id === id);
      if (!segment) return json(404, { detail: 'Not found.' });
      const forbidden = json(403, { detail: "Only the segment's owner can change it." });
      if (rest === '' && method === 'GET') return json(200, segment);
      if (rest === '' && method === 'PATCH') {
        if (stub.patch) return reply(stub.patch(id, body));
        if (!segment.is_owner) return forbidden;
        Object.assign(segment, body, 'shared_with' in body ? { shared_with: teammates(body.shared_with) } : {});
        return json(200, segment);
      }
      if (rest === '' && method === 'DELETE') {
        if (!segment.is_owner) return forbidden;
        store.splice(store.indexOf(segment), 1);
        return json(204, null);
      }
      if (rest === 'duplicate/' && method === 'POST') {
        const copy: Segment = {
          ...segment,
          id: 200,
          name: `${segment.name} (copy)`,
          owner: ME,
          is_owner: true,
          sharing: 'private',
          shared_with: [],
          alert_on_changes: false,
          member_count: 0,
        };
        store.push(copy);
        return json(201, copy);
      }
      if (rest === 'members/' && method === 'GET') {
        return json(200, membersOf(segment, url.searchParams, stub.hidden ?? (segment.is_owner ? 0 : 2)));
      }
      if (rest === 'members/export.csv') {
        return { ok: true, status: 200, json: async () => null, blob: async () => new Blob(['id,name\n'], { type: 'text/csv' }) };
      }
      const member = /^members\/(\d+)\/$/.exec(rest);
      if (member && method === 'PATCH') {
        if (!segment.is_owner) return forbidden;
        const recordId = Number(member[1]);
        segment.pinned_ids = segment.pinned_ids.filter((pk) => pk !== recordId);
        segment.excluded_ids = segment.excluded_ids.filter((pk) => pk !== recordId);
        if (body.state === 'pinned') segment.pinned_ids = [...segment.pinned_ids, recordId];
        if (body.state === 'excluded') segment.excluded_ids = [...segment.excluded_ids, recordId];
        return json(200, { pinned_ids: segment.pinned_ids, excluded_ids: segment.excluded_ids });
      }
      if (rest === 'changes/' && method === 'GET') {
        const days = Number(url.searchParams.get('days'));
        return stub.changes ? reply(stub.changes(id, days)) : json(200, { ...CHANGES, kind: segment.kind });
      }
    }
    if (path === '/auth/members/') return json(200, TEAM);
    if (path === '/attributes/definitions/') return json(200, stub.attributes ?? []);
    if (path === '/products/') return json(200, [{ id: 3, name: 'Analytics', is_active: true, customers: 1, created_at: '', updated_at: '' }]);
    if (path === '/customers/' || path === '/accounts/') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const rows = (path === '/customers/' ? ALL_ROWS : ACCOUNT_ROWS)
        .filter((row) => row.name.toLowerCase().includes(search))
        .map(({ id, name }) => ({ id, name }));
      return json(200, { count: rows.length, next: null, previous: null, results: rows });
    }
    if (path === '/organizations/portfolio/') return json(200, buildPortfolio(url.searchParams));
    if (path === '/accounts/portfolio/') return json(200, buildAccountPortfolio(url.searchParams));
    return json(404, { detail: `Not stubbed: ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

export type SegmentsSpy = ReturnType<typeof stubSegments>;

/** Every `method` request whose path (without /api/v1) matches `pattern`,
 *  oldest first, with its query and JSON body. */
export function requests(spy: SegmentsSpy, method: string, pattern: RegExp) {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), init }))
    .filter(({ url, init }) => (init?.method ?? 'GET') === method && pattern.test(url.pathname.replace(/^\/api\/v1/, '')))
    .map(({ url, init }) => ({
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: url.searchParams,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    }));
}
```

- [ ] **Step 6: Run the API test**

Run: `npx vitest run --maxWorkers=2 src/features/segments/segmentApi.test.ts`
Expected: PASS (5 tests). If `buildPortfolio` / `buildAccountPortfolio` do not filter by `ids`, the last test fails on extra names. Read `features/organizations/testPortfolio.ts`'s `buildPortfolio` (it parses `ids`) before changing anything, and fix the stub, not the assertion.

- [ ] **Step 7: Add the notification kind, and prove the bell opens a segment's Changes tab**

In `src/components/layout/Navbar.test.tsx`:

1. Add `useLocation` to the `react-router-dom` import.
2. Above `function renderNavbar`, add:

```tsx
/** Stands in for /segments/:id, saying where the bell sent it. */
function SegmentMarker() {
  const location = useLocation();
  return <p data-testid="segment-marker">{`${location.pathname}${location.search}`}</p>;
}
```

3. Inside `renderNavbar`'s `<Routes>`, after the `/contacts/:id` route, add `<Route path="/segments/:id" element={<SegmentMarker />} />`.
4. After `const readAssignment …;`, add:

```tsx
// Backend PR #84: the nightly step's alert to a segment's owner.
const segmentAlert: Notification = {
  id: 3,
  kind: 'segment_changes',
  message: 'Renewal risk: 3 entered, 1 left',
  link: '/segments/7?tab=changes',
  actor: null,
  is_read: false,
  created_at: '2026-10-03T06:00:00Z',
};
```

5. At the end of `describe('Navbar notification bell', …)`, add:

```tsx
  it('lists a segment alert by its message and opens that segment on its Changes tab', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [segmentAlert]);

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByText('Renewal risk: 3 entered, 1 left'));

    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(3);
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/segments/7?tab=changes');
  });
```

Run: `npx tsc -b`
Expected: FAIL: `Type '"segment_changes"' is not assignable to type 'NotificationKind'`.

In `src/features/notifications/types.ts`, extend the union:

```ts
export type NotificationKind =
  | 'copilot_invite'
  | 'copilot_handoff'
  | 'customer_assigned'
  | 'account_assigned'
  | 'question_asked'
  | 'question_answered'
  // A segment's daily alert to its owner: "<name>: 3 entered, 1 left",
  // linking to /segments/<id>?tab=changes (backend PR #84).
  | 'segment_changes';
```

Run: `npx tsc -b && npx vitest run --maxWorkers=2 src/components/layout/Navbar.test.tsx`
Expected: no type errors; PASS, the new test included. The bell renders every kind the same way, as the server's `message` plus a relative time, and navigates to `link`, so there is no per-kind rendering to add (Decision 15).

- [ ] **Step 8: Commit**

```bash
git add src/features/segments/segmentTypes.ts src/features/segments/segmentApi.ts src/features/segments/testSegments.ts src/features/segments/segmentApi.test.ts src/features/notifications/types.ts src/components/layout/Navbar.test.tsx
git commit -m "feat(segments): the contract types, API and test stub; the segment_changes notification kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The field registry, mirrored

**Files:**
- Create: `src/features/segments/segmentFields.ts`
- Test: `src/features/segments/segmentFields.test.ts`

**Interfaces:**
- Consumes: `AIAttribute` (`features/attributes/types`), `CONTACT_ROLES`, `SENTIMENTS` (`features/contacts/contactsParams`), `LIFECYCLE_LABELS` (`features/customers/formatters`), `HEALTH_LABEL`, `NPS_BANDS`, `PortfolioNoun` (`features/organizations/portfolioLabels`), `HEALTH_BANDS`, `LIFECYCLE_VALUES` (`features/organizations/portfolioParams`), `Operator`, `SegmentKind` (Task 1).
- Produces:

```ts
export type ValueType = 'number' | 'percent' | 'days' | 'date' | 'choice' | 'text' | 'boolean' | 'owner' | 'record';
export type RecordKind = 'user' | 'customer' | 'account' | 'product';
export interface Choice { value: string; label: string }
export interface FieldDef { key: string; label: string; type: ValueType; choices: Choice[]; record: RecordKind | ''; optional: boolean; section: 'own' | 'parent' | 'attribute' }
export const OPERATORS: Record<ValueType, Operator[]>;
export const VALUELESS: Operator[];               // ['is_empty', 'is_not_empty']
export const MAX_CONDITIONS = 20;
export const KIND_LABEL: Record<SegmentKind, string>;      // Organisations, Accounts, Contacts
export const KIND_NOUN: Record<SegmentKind, PortfolioNoun>; // organisation(s), account(s), contact(s)
export function operatorsOf(field: FieldDef): Operator[];
export function fieldsFor(kind: SegmentKind, attributes: AIAttribute[]): FieldDef[];
export function findField(kind: SegmentKind, key: string, attributes: AIAttribute[]): FieldDef | null;
export function recordHref(kind: SegmentKind, id: number): string;
```

- [ ] **Step 1: Write the failing test**

```ts
// src/features/segments/segmentFields.test.ts
import { describe, expect, it } from 'vitest';
import type { AIAttribute } from '../attributes/types';
import { OPERATORS, fieldsFor, findField, operatorsOf, recordHref } from './segmentFields';

const attribute = (over: Partial<AIAttribute>): AIAttribute => ({
  id: 1,
  name: 'Tier',
  api_name: 'tier',
  prompt: '',
  value_type: 'picklist',
  picklist_options: ['SMB', 'Enterprise'],
  applies_to_customer: true,
  applies_to_account: false,
  refresh: 'manual',
  created_at: '',
  updated_at: '',
  ...over,
});

const keys = (kind: 'customer' | 'account' | 'contact', attributes: AIAttribute[] = []) => fieldsFor(kind, attributes).map((f) => f.key);

// Pinned to revenact-backend services/segments/registry.py and
// docs/API_CONTRACTS.md `segments` (PR #84): a field added there fails here
// until the mirror learns it.
describe('segment fields mirror the backend registry', () => {
  it('lists exactly the organisation fields, in the registry order', () => {
    expect(keys('customer')).toEqual([
      'lifecycle_stage', 'health_score', 'health_category', 'csat_score', 'nps_score', 'nps_band', 'arr',
      'renewal_date', 'owner', 'open_tickets', 'last_touch', 'ai_pulse', 'csm_pulse', 'created',
      'ces_percentage', 'product', 'seat_use', 'churned', 'archived',
    ]);
  });

  it('gives accounts the shared fields plus organisation, and none of CES, product, seat use, churned or archived', () => {
    expect(keys('account')).toEqual([
      'lifecycle_stage', 'health_score', 'health_category', 'csat_score', 'nps_score', 'nps_band', 'arr',
      'renewal_date', 'owner', 'open_tickets', 'last_touch', 'ai_pulse', 'csm_pulse', 'created', 'organisation',
    ]);
  });

  it('gives contacts their seven fields, then parent.<every organisation field>, never parent.organisation', () => {
    const contact = keys('contact');
    expect(contact.slice(0, 7)).toEqual(['role', 'sentiment', 'status', 'language', 'last_contacted', 'organisation', 'account']);
    expect(contact.slice(7)).toEqual(keys('customer').map((key) => `parent.${key}`));
    expect(contact).not.toContain('parent.organisation');
  });

  it('takes each type\'s operators as the contract lists them', () => {
    expect(OPERATORS).toEqual({
      number: ['gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
      percent: ['gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
      days: ['gt', 'lt', 'between', 'is_empty'],
      date: ['within_next', 'within_last', 'gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
      choice: ['is', 'is_not', 'in'],
      text: ['is', 'is_not', 'in', 'is_empty', 'is_not_empty'],
      boolean: ['is'],
      owner: ['is', 'is_not', 'in'],
      record: ['is', 'is_not', 'in'],
    });
  });

  it('adds an AI attribute only where it applies, with its options and "not answered yet"', () => {
    const tier = attribute({});
    const seats = attribute({ id: 2, name: 'Seats band', api_name: 'seats', value_type: 'number', picklist_options: [], applies_to_customer: false, applies_to_account: true });
    expect(keys('customer', [tier, seats])).toContain('attr:tier');
    expect(keys('customer', [tier, seats])).not.toContain('attr:seats');
    expect(keys('account', [tier, seats])).toContain('attr:seats');
    expect(keys('account', [tier, seats])).not.toContain('attr:tier');
    expect(keys('contact', [tier, seats])).toEqual(expect.arrayContaining(['parent.attr:tier', 'parent.attr:seats']));
    expect(keys('contact', [tier, seats])).not.toContain('attr:tier');
    const field = findField('customer', 'attr:tier', [tier])!;
    expect(field.label).toBe('Tier');
    expect(field.choices.map((c) => c.value)).toEqual(['SMB', 'Enterprise']);
    expect(operatorsOf(field)).toEqual(['is', 'is_not', 'in', 'is_empty', 'is_not_empty']);
    expect(operatorsOf(findField('account', 'attr:seats', [seats])!)).toEqual(['gt', 'lt', 'between', 'is_empty', 'is_not_empty']);
  });

  it('labels a contact\'s parent field for what it reads, and finds nothing for a key the kind lacks', () => {
    expect(findField('contact', 'parent.csat_score', [])?.label).toBe('CSAT % of their organisation or account');
    expect(findField('contact', 'parent.csat_score', [])?.section).toBe('parent');
    expect(findField('customer', 'mood', [])).toBeNull();
    expect(findField('account', 'churned', [])).toBeNull();
  });

  it('links a record to its own page by kind', () => {
    expect([recordHref('customer', 7), recordHref('account', 12), recordHref('contact', 41)]).toEqual([
      '/organizations/7',
      '/accounts/12',
      '/contacts/41',
    ]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/features/segments/segmentFields.test.ts`
Expected: FAIL, "Failed to resolve import "./segmentFields"".

- [ ] **Step 3: Write the registry mirror**

```ts
// src/features/segments/segmentFields.ts
// What a segment rule may name, per kind, and the operators each type takes:
// a mirror of revenact-backend services/segments/registry.py (PR #84),
// pinned by segmentFields.test.ts. The backend refuses anything else with a
// 400; this list only decides what the builder offers and how a rule reads.
import type { AIAttribute } from '../attributes/types';
import { CONTACT_ROLES, SENTIMENTS } from '../contacts/contactsParams';
import { LIFECYCLE_LABELS } from '../customers/formatters';
import { HEALTH_LABEL, NPS_BANDS, type PortfolioNoun } from '../organizations/portfolioLabels';
import { HEALTH_BANDS, LIFECYCLE_VALUES } from '../organizations/portfolioParams';
import type { Operator, SegmentKind } from './segmentTypes';

export type ValueType = 'number' | 'percent' | 'days' | 'date' | 'choice' | 'text' | 'boolean' | 'owner' | 'record';
/** What an id in an owner or record value names. */
export type RecordKind = 'user' | 'customer' | 'account' | 'product';

export interface Choice {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: ValueType;
  choices: Choice[];
  record: RecordKind | '';
  /** An AI attribute: "not answered yet" is worth asking, so its type also
   *  takes is_empty / is_not_empty. */
  optional: boolean;
  /** Where the field picker lists it. */
  section: 'own' | 'parent' | 'attribute';
}

export const OPERATORS: Record<ValueType, Operator[]> = {
  number: ['gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
  percent: ['gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
  days: ['gt', 'lt', 'between', 'is_empty'],
  date: ['within_next', 'within_last', 'gt', 'lt', 'between', 'is_empty', 'is_not_empty'],
  choice: ['is', 'is_not', 'in'],
  text: ['is', 'is_not', 'in', 'is_empty', 'is_not_empty'],
  boolean: ['is'],
  owner: ['is', 'is_not', 'in'],
  record: ['is', 'is_not', 'in'],
};

export const VALUELESS: Operator[] = ['is_empty', 'is_not_empty'];
/** Counting each condition inside a group (backend MAX_CONDITIONS). */
export const MAX_CONDITIONS = 20;

export const KIND_LABEL: Record<SegmentKind, string> = { customer: 'Organisations', account: 'Accounts', contact: 'Contacts' };
export const KIND_NOUN: Record<SegmentKind, PortfolioNoun> = {
  customer: { one: 'organisation', many: 'organisations' },
  account: { one: 'account', many: 'accounts' },
  contact: { one: 'contact', many: 'contacts' },
};

export const PARENT_PREFIX = 'parent.';
export const ATTRIBUTE_PREFIX = 'attr:';
const PARENT_SUFFIX = ' of their organisation or account';

export function operatorsOf(field: FieldDef): Operator[] {
  const operators = OPERATORS[field.type];
  return field.optional ? [...operators, ...VALUELESS.filter((op) => !operators.includes(op))] : operators;
}

function field(key: string, label: string, type: ValueType, extra: Partial<FieldDef> = {}): FieldDef {
  return { key, label, type, choices: [], record: '', optional: false, section: 'own', ...extra };
}

const LIFECYCLE: Choice[] = LIFECYCLE_VALUES.map((value) => ({ value, label: LIFECYCLE_LABELS[value] }));
const HEALTH: Choice[] = HEALTH_BANDS.map((value) => ({ value, label: HEALTH_LABEL[value] }));
const NPS_WORDS: Record<string, string> = { promoter: 'Promoter', passive: 'Passive', detractor: 'Detractor' };
const NPS: Choice[] = NPS_BANDS.map((value) => ({ value, label: NPS_WORDS[value] }));
const STATUS: Choice[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/** What an organisation and an account both have, in the registry's order. */
const SHARED: FieldDef[] = [
  field('lifecycle_stage', 'Lifecycle stage', 'choice', { choices: LIFECYCLE }),
  field('health_score', 'Health score', 'number'),
  field('health_category', 'Health', 'choice', { choices: HEALTH }),
  field('csat_score', 'CSAT %', 'percent'),
  field('nps_score', 'NPS', 'number'),
  field('nps_band', 'NPS band', 'choice', { choices: NPS }),
  field('arr', 'ARR', 'number'),
  field('renewal_date', 'Renewal date', 'date'),
  field('owner', 'Owner', 'owner', { record: 'user' }),
  field('open_tickets', 'Open tickets', 'number'),
  field('last_touch', 'Days since last touch', 'days'),
  field('ai_pulse', 'AI pulse', 'number'),
  field('csm_pulse', 'CSM pulse', 'number'),
  field('created', 'Created date', 'date'),
];

const CUSTOMER: FieldDef[] = [
  ...SHARED,
  field('ces_percentage', 'CES %', 'percent'),
  field('product', 'Product', 'record', { record: 'product' }),
  field('seat_use', 'Seat use %', 'percent'),
  field('churned', 'Churned', 'boolean'),
  field('archived', 'Archived', 'boolean'),
];

const ACCOUNT: FieldDef[] = [...SHARED, field('organisation', 'Organisation', 'record', { record: 'customer' })];

const CONTACT: FieldDef[] = [
  field('role', 'Role', 'choice', { choices: CONTACT_ROLES }),
  field('sentiment', 'Sentiment', 'choice', { choices: SENTIMENTS }),
  field('status', 'Status', 'choice', { choices: STATUS }),
  field('language', 'Language', 'text'),
  field('last_contacted', 'Days since last contacted', 'days'),
  field('organisation', 'Organisation', 'record', { record: 'customer' }),
  field('account', 'Account', 'record', { record: 'account' }),
];

const ATTRIBUTE_TYPES: Record<AIAttribute['value_type'], ValueType> = {
  number: 'number',
  boolean: 'boolean',
  picklist: 'choice',
  text: 'text',
};

function attributeField(attribute: AIAttribute): FieldDef {
  return field(`${ATTRIBUTE_PREFIX}${attribute.api_name}`, attribute.name, ATTRIBUTE_TYPES[attribute.value_type], {
    choices: attribute.picklist_options.map((option) => ({ value: option, label: option })),
    optional: true,
    section: 'attribute',
  });
}

/** A contacts rule's `parent.<key>`: read on the contact's own organisation
 *  or account. Every organisation field qualifies (the account's own fields
 *  are a subset of them, and `organisation` is the contact's own). */
function parentField(own: FieldDef): FieldDef {
  return { ...own, key: `${PARENT_PREFIX}${own.key}`, label: `${own.label}${PARENT_SUFFIX}`, section: 'parent' };
}

export function fieldsFor(kind: SegmentKind, attributes: AIAttribute[]): FieldDef[] {
  if (kind === 'customer') return [...CUSTOMER, ...attributes.filter((a) => a.applies_to_customer).map(attributeField)];
  if (kind === 'account') return [...ACCOUNT, ...attributes.filter((a) => a.applies_to_account).map(attributeField)];
  return [
    ...CONTACT,
    ...CUSTOMER.map(parentField),
    ...attributes.filter((a) => a.applies_to_customer || a.applies_to_account).map((a) => parentField(attributeField(a))),
  ];
}

export function findField(kind: SegmentKind, key: string, attributes: AIAttribute[]): FieldDef | null {
  return fieldsFor(kind, attributes).find((f) => f.key === key) ?? null;
}

/** A member's own page. */
export function recordHref(kind: SegmentKind, id: number): string {
  if (kind === 'customer') return `/organizations/${id}`;
  if (kind === 'account') return `/accounts/${id}`;
  return `/contacts/${id}`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --maxWorkers=2 src/features/segments/segmentFields.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/segments/segmentFields.ts src/features/segments/segmentFields.test.ts
git commit -m "feat(segments): mirror the backend's rule fields and operators per kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The rules as one sentence

**Files:**
- Create: `src/features/segments/ruleSentence.ts`
- Create: `src/components/segments/RuleSentence.tsx`
- Test: `src/features/segments/ruleSentence.test.ts`, `src/components/segments/RuleSentence.test.tsx`

**Interfaces:**
- Consumes: `findField`, `KIND_LABEL`, `KIND_NOUN`, `FieldDef`, `RecordKind` (Task 2); `Condition`, `ConditionGroup`, `Match`, `Operator`, `RuleLabels`, `RuleScalar`, `Rules`, `SegmentKind` (Task 1); `MONO` (`components/organizations/portfolio/styles`).
- Produces:

```ts
export interface SentencePart { text: string; role: 'kind' | 'field' | 'op' | 'value' | 'join' | 'hidden' }
export const HIDDEN_NAME: Record<RecordKind, string>;   // "an organisation you can't open", …
export function dayText(iso: string): string;           // "2026-10-05" → "5 Oct 2026"
export function opText(op: Operator, field: FieldDef | null): string;
export function conditionParts(condition: Condition, field: FieldDef | null, labels: RuleLabels): SentencePart[];
export function ruleSentence(rules: Rules, kind: SegmentKind, labels: RuleLabels, attributes: AIAttribute[]): SentencePart[];
export function sentenceText(parts: SentencePart[]): string;
export function reasonText(keys: string[], direction: 'entered' | 'left', kind: SegmentKind, attributes: AIAttribute[]): string;
// RuleSentence.tsx
export function RuleSentence({ parts, className }: { parts: SentencePart[]; className?: string }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/segments/ruleSentence.test.ts
import { describe, expect, it } from 'vitest';
import type { AIAttribute } from '../attributes/types';
import { conditionParts, dayText, reasonText, ruleSentence, sentenceText } from './ruleSentence';
import { findField } from './segmentFields';
import { NO_LABELS, type Condition, type Rules } from './segmentTypes';
import { EMEA_ACCOUNTS, RENEWAL_RISK } from './testSegments';

const tier: AIAttribute = {
  id: 1, name: 'Tier', api_name: 'tier', prompt: '', value_type: 'picklist', picklist_options: ['SMB'],
  applies_to_customer: true, applies_to_account: true, refresh: 'manual', created_at: '', updated_at: '',
};
const read = (condition: Condition, kind: 'customer' | 'account' | 'contact' = 'customer', labels = NO_LABELS) =>
  sentenceText(conditionParts(condition, findField(kind, condition.field, [tier]), labels));

describe('ruleSentence', () => {
  it('reads the rules as one sentence, a group in brackets with its own and/or', () => {
    expect(sentenceText(ruleSentence(RENEWAL_RISK.rules, 'customer', NO_LABELS, []))).toBe(
      'Organisations where CSAT % is less than 60 and (Renewal date is in the next 90 days or Health is Poor)',
    );
  });

  it('joins with "or" when any condition will do', () => {
    const rules: Rules = { match: 'any', conditions: [{ field: 'churned', op: 'is', value: true }, { field: 'archived', op: 'is', value: false }] };
    expect(sentenceText(ruleSentence(rules, 'customer', NO_LABELS, []))).toBe('Organisations where Churned is yes or Archived is no');
  });

  it('names an organisation from the labels and never names one the reader cannot open', () => {
    const parts = ruleSentence(EMEA_ACCOUNTS.rules, 'account', EMEA_ACCOUNTS.labels, []);
    expect(sentenceText(parts)).toBe("Accounts where Organisation is any of Pizza Hut, an organisation you can't open");
    expect(parts.filter((p) => p.role === 'hidden').map((p) => p.text)).toEqual(["an organisation you can't open"]);
  });

  it('reads an owner as their name, Unassigned, or an owner you cannot open', () => {
    const labels = { ...NO_LABELS, people: { '4': 'Carl CSM' } };
    expect(read({ field: 'owner', op: 'in', value: [4, 'unassigned', 99, null] }, 'customer', labels)).toBe(
      "Owner is any of Carl CSM, Unassigned, an owner you can't open, an owner you can't open",
    );
  });

  it('reads dates, windows, ranges, days, empties, choices and text in words', () => {
    expect(read({ field: 'created', op: 'between', value: ['2026-01-05', '2026-03-31'] })).toBe('Created date is between 5 Jan 2026 and 31 Mar 2026');
    expect(read({ field: 'renewal_date', op: 'within_last', value: 30 })).toBe('Renewal date was in the last 30 days');
    expect(read({ field: 'renewal_date', op: 'gt', value: '2026-12-01' })).toBe('Renewal date is after 1 Dec 2026');
    expect(read({ field: 'last_touch', op: 'gt', value: 45 })).toBe('Days since last touch is more than 45 days');
    expect(read({ field: 'last_touch', op: 'is_empty' })).toBe('Days since last touch is never');
    expect(read({ field: 'arr', op: 'is_not_empty' })).toBe('ARR is not empty');
    expect(read({ field: 'lifecycle_stage', op: 'is_not', value: 'churn' })).toBe('Lifecycle stage is not Churn');
    expect(read({ field: 'language', op: 'is', value: 'de' }, 'contact')).toBe('Language is "de"');
  });

  it('labels parent and AI attribute fields, and falls back to the bare key for one it does not know', () => {
    expect(read({ field: 'parent.health_category', op: 'is', value: 'good' }, 'contact')).toBe('Health of their organisation or account is Good');
    expect(read({ field: 'attr:tier', op: 'is', value: 'SMB' })).toBe('Tier is SMB');
    expect(sentenceText(conditionParts({ field: 'attr:gone', op: 'is_empty' }, null, NO_LABELS))).toBe('gone is empty');
  });

  it('says a segment with no rules holds only its pins', () => {
    expect(sentenceText(ruleSentence({ match: 'all', conditions: [] }, 'contact', NO_LABELS, []))).toBe('No rules: only pinned contacts are members');
  });

  it('writes a day as day, short month and year, whatever the time zone', () => {
    expect(dayText('2026-10-05')).toBe('5 Oct 2026');
  });

  it('reads a change\'s reasons as field names, or what happened to the record', () => {
    expect(reasonText(['csat_score', 'health_category'], 'entered', 'customer', [])).toBe('CSAT %, Health');
    expect(reasonText(['pinned'], 'entered', 'customer', [])).toBe('Pinned');
    expect(reasonText(['pinned'], 'left', 'customer', [])).toBe('Unpinned');
    expect(reasonText(['access', 'deleted'], 'left', 'account', [])).toBe("No longer in the owner's book, Deleted");
  });
});
```

```tsx
// src/components/segments/RuleSentence.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ruleSentence } from '../../features/segments/ruleSentence';
import { EMEA_ACCOUNTS, RENEWAL_RISK } from '../../features/segments/testSegments';
import { NO_LABELS } from '../../features/segments/segmentTypes';
import { RuleSentence } from './RuleSentence';

describe('RuleSentence', () => {
  it('sets fields in ink, numbers in DM Mono, and a record the reader cannot open apart', () => {
    const { unmount } = render(<RuleSentence parts={ruleSentence(RENEWAL_RISK.rules, 'customer', NO_LABELS, [])} />);
    expect(screen.getByText('CSAT %')).toHaveClass('font-semibold', 'text-ink');
    expect(screen.getByText('60')).toHaveClass('font-mono-brand', 'tabular-nums');
    unmount();
    render(<RuleSentence parts={ruleSentence(EMEA_ACCOUNTS.rules, 'account', EMEA_ACCOUNTS.labels, [])} />);
    expect(screen.getByText("an organisation you can't open").tagName).toBe('EM');
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run --maxWorkers=2 src/features/segments/ruleSentence.test.ts src/components/segments/RuleSentence.test.tsx`
Expected: FAIL, "Failed to resolve import "./ruleSentence"" (and "../../features/segments/ruleSentence").

- [ ] **Step 3: Write the sentence**

```ts
// src/features/segments/ruleSentence.ts
// A segment's rules as one sentence (spec §3: "the rules as one sentence"),
// built on the client (plan Decision 1): field and operator words from the
// registry mirror, record names only from the server's `labels`. An id with
// no label, or a null one, is a record the reader can't open and is never
// named.
import type { AIAttribute } from '../attributes/types';
import { findField, KIND_LABEL, KIND_NOUN, type FieldDef, type RecordKind } from './segmentFields';
import type { Condition, ConditionGroup, Match, Operator, RuleLabels, RuleScalar, Rules, SegmentKind } from './segmentTypes';

export interface SentencePart {
  text: string;
  role: 'kind' | 'field' | 'op' | 'value' | 'join' | 'hidden';
}

export const HIDDEN_NAME: Record<RecordKind, string> = {
  customer: "an organisation you can't open",
  account: "an account you can't open",
  product: "a product you can't open",
  user: "an owner you can't open",
};

const LABEL_GROUP: Record<RecordKind, keyof RuleLabels> = {
  customer: 'organisations',
  account: 'accounts',
  product: 'products',
  user: 'people',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-05" → "5 Oct 2026", read as a calendar day (no time zone). */
export function dayText(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return year && month && day ? `${day} ${MONTHS[month - 1]} ${year}` : iso;
}

export function opText(op: Operator, field: FieldDef | null): string {
  const date = field?.type === 'date';
  switch (op) {
    case 'is':
      return 'is';
    case 'is_not':
      return 'is not';
    case 'in':
      return 'is any of';
    case 'gt':
      return date ? 'is after' : 'is more than';
    case 'lt':
      return date ? 'is before' : 'is less than';
    case 'between':
      return 'is between';
    case 'within_next':
      return 'is in the next';
    case 'within_last':
      return 'was in the last';
    case 'is_empty':
      // "Days since" with no date: never touched, never contacted.
      return field?.type === 'days' ? 'is never' : 'is empty';
    case 'is_not_empty':
      return 'is not empty';
  }
}

function valuePart(value: RuleScalar, field: FieldDef | null, op: Operator, labels: RuleLabels): SentencePart {
  if (field?.record) {
    if (field.type === 'owner' && value === 'unassigned') return { text: 'Unassigned', role: 'value' };
    const name = value === null ? undefined : labels[LABEL_GROUP[field.record]][String(value)];
    return name ? { text: name, role: 'value' } : { text: HIDDEN_NAME[field.record], role: 'hidden' };
  }
  if (field?.type === 'boolean') return { text: value ? 'yes' : 'no', role: 'value' };
  if (field?.type === 'choice') return { text: field.choices.find((c) => c.value === value)?.label ?? String(value), role: 'value' };
  if (op === 'within_next' || op === 'within_last' || field?.type === 'days') return { text: `${value} days`, role: 'value' };
  if (field?.type === 'date') return { text: dayText(String(value)), role: 'value' };
  if (field?.type === 'text') return { text: `"${value}"`, role: 'value' };
  return { text: String(value), role: 'value' };
}

/** One condition: "CSAT %", " is less than", " ", "60". A field the mirror
 *  does not know reads as its bare key. */
export function conditionParts(condition: Condition, field: FieldDef | null, labels: RuleLabels): SentencePart[] {
  const parts: SentencePart[] = [
    { text: field?.label ?? condition.field.replace(/^parent\./, '').replace(/^attr:/, ''), role: 'field' },
    { text: ` ${opText(condition.op, field)}`, role: 'op' },
  ];
  if (condition.op === 'is_empty' || condition.op === 'is_not_empty') return parts;
  const values = Array.isArray(condition.value) ? condition.value : [condition.value ?? null];
  const joiner = condition.op === 'between' ? ' and ' : ', ';
  values.forEach((value, index) => {
    parts.push({ text: index === 0 ? ' ' : joiner, role: 'join' });
    parts.push(valuePart(value, field, condition.op, labels));
  });
  return parts;
}

const isGroup = (condition: Condition | ConditionGroup): condition is ConditionGroup => 'group' in condition;

function joined(items: SentencePart[][], match: Match): SentencePart[] {
  return items.flatMap((item, index) => (index === 0 ? item : [{ text: match === 'all' ? ' and ' : ' or ', role: 'join' as const }, ...item]));
}

export function ruleSentence(rules: Rules, kind: SegmentKind, labels: RuleLabels, attributes: AIAttribute[]): SentencePart[] {
  if (rules.conditions.length === 0) {
    return [{ text: `No rules: only pinned ${KIND_NOUN[kind].many} are members`, role: 'join' }];
  }
  const leaf = (condition: Condition) => conditionParts(condition, findField(kind, condition.field, attributes), labels);
  const items = rules.conditions.map((condition) =>
    isGroup(condition)
      ? [{ text: '(', role: 'join' as const }, ...joined(condition.group.conditions.map(leaf), condition.group.match), { text: ')', role: 'join' as const }]
      : leaf(condition),
  );
  return [{ text: KIND_LABEL[kind], role: 'kind' }, { text: ' where ', role: 'join' }, ...joined(items, rules.match)];
}

export function sentenceText(parts: SentencePart[]): string {
  return parts.map((part) => part.text).join('');
}

/** A change's reason: the field keys that changed the match, or what
 *  happened to the record itself. Never a value. */
export function reasonText(keys: string[], direction: 'entered' | 'left', kind: SegmentKind, attributes: AIAttribute[]): string {
  return keys
    .map((key) => {
      if (key === 'pinned') return direction === 'entered' ? 'Pinned' : 'Unpinned';
      if (key === 'deleted') return 'Deleted';
      if (key === 'access') return "No longer in the owner's book";
      if (key === 'churned') return 'Churned';
      if (key === 'archived') return 'Archived';
      return findField(kind, key, attributes)?.label ?? key;
    })
    .join(', ');
}
```

```tsx
// src/components/segments/RuleSentence.tsx
import type { SentencePart } from '../../features/segments/ruleSentence';
import { MONO } from '../organizations/portfolio/styles';

/** The rules as one line: fields and values in ink, figures in DM Mono, a
 *  record the reader can't open in italics, the joining words muted. */
export function RuleSentence({ parts, className = '' }: { parts: SentencePart[]; className?: string }) {
  return (
    <p className={`text-[13px] text-ink-muted ${className}`}>
      {parts.map((part, index) => {
        if (part.role === 'kind' || part.role === 'field') {
          return (
            <span key={index} className="font-semibold text-ink">
              {part.text}
            </span>
          );
        }
        if (part.role === 'value') {
          return (
            <span key={index} className={`text-ink ${/^\d/.test(part.text) ? MONO : ''}`}>
              {part.text}
            </span>
          );
        }
        if (part.role === 'hidden') return <em key={index}>{part.text}</em>;
        return <span key={index}>{part.text}</span>;
      })}
    </p>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/features/segments/ruleSentence.test.ts src/components/segments/RuleSentence.test.tsx`
Expected: PASS (9 + 1 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/segments/ruleSentence.ts src/features/segments/ruleSentence.test.ts src/components/segments/RuleSentence.tsx src/components/segments/RuleSentence.test.tsx
git commit -m "feat(segments): read a segment's rules as one sentence, never naming what the reader can't open

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The editable rule draft, and 400s by field

**Files:**
- Create: `src/features/segments/ruleDraft.ts`
- Create: `src/features/segments/segmentErrors.ts`
- Test: `src/features/segments/ruleDraft.test.ts`, `src/features/segments/segmentErrors.test.ts`

**Interfaces:**
- Consumes: `operatorsOf`, `VALUELESS`, `FieldDef`, `findField` (Task 2); `Condition`, `Match`, `Operator`, `RuleScalar`, `Rules` (Task 1); `ApiError` (`lib/apiClient`).
- Produces:

```ts
// ruleDraft.ts
export type DraftValue = RuleScalar | undefined | (RuleScalar | undefined)[];
export interface DraftCondition { uid: string; field: string; op: Operator; value: DraftValue }
export interface DraftGroup { uid: string; match: Match; conditions: DraftCondition[] }
export type DraftNode = DraftCondition | DraftGroup;
export interface DraftRules { match: Match; conditions: DraftNode[] }
export type Shape = 'none' | 'one' | 'two' | 'many' | 'days';
export function isDraftGroup(node: DraftNode): node is DraftGroup;
export function fromRules(rules: Rules | null | undefined): DraftRules;
export function toRules(draft: DraftRules): Rules;
export function shapeOf(op: Operator): Shape;
export function initialValue(field: FieldDef, op: Operator): DraftValue;
export function newCondition(field: FieldDef): DraftCondition;
export function withField(condition: DraftCondition, field: FieldDef): DraftCondition;
export function withOp(condition: DraftCondition, field: FieldDef, op: Operator): DraftCondition;
export function isComplete(condition: DraftCondition, field: FieldDef | null): boolean;
export function leaves(draft: DraftRules): DraftCondition[];
export function conditionCount(draft: DraftRules): number;
export function firstIncomplete(draft: DraftRules, fieldOf: (key: string) => FieldDef | null): string | null;
export function addCondition(draft: DraftRules, field: FieldDef, groupUid?: string): DraftRules;
export function addGroup(draft: DraftRules, field: FieldDef): DraftRules;
export function updateCondition(draft: DraftRules, uid: string, update: (c: DraftCondition) => DraftCondition): DraftRules;
export function removeNode(draft: DraftRules, uid: string): DraftRules;
export function setMatch(draft: DraftRules, match: Match, groupUid?: string): DraftRules;
// segmentErrors.ts
export type FormErrors = Partial<Record<'name' | 'description' | 'kind' | 'rules' | 'sharing' | 'shared_with' | 'form', string>>;
export function formErrors(err: unknown, fallback?: string): FormErrors;
export function rulesMessage(err: unknown): string;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/segments/ruleDraft.test.ts
import { describe, expect, it } from 'vitest';
import {
  addCondition,
  addGroup,
  conditionCount,
  firstIncomplete,
  fromRules,
  isComplete,
  isDraftGroup,
  newCondition,
  removeNode,
  setMatch,
  toRules,
  updateCondition,
  withField,
  withOp,
  type DraftCondition,
} from './ruleDraft';
import { findField, type FieldDef } from './segmentFields';
import { RENEWAL_RISK } from './testSegments';

const f = (key: string): FieldDef => findField('customer', key, [])!;
const fieldOf = (key: string) => findField('customer', key, []);

describe('rule draft', () => {
  it('round-trips saved rules, groups included, and leaves no value on a valueless condition', () => {
    expect(toRules(fromRules(RENEWAL_RISK.rules))).toEqual(RENEWAL_RISK.rules);
    const draft = fromRules({ match: 'any', conditions: [{ field: 'arr', op: 'is_empty' }] });
    expect(toRules(draft).conditions[0]).toEqual({ field: 'arr', op: 'is_empty' });
  });

  it('starts a condition on the field\'s first operator, and a yes/no one on yes', () => {
    expect(newCondition(f('csat_score'))).toMatchObject({ field: 'csat_score', op: 'gt', value: undefined });
    expect(newCondition(f('churned'))).toMatchObject({ op: 'is', value: true });
    expect(newCondition(f('lifecycle_stage'))).toMatchObject({ op: 'is', value: undefined });
  });

  it('resets the operator and value when the field changes', () => {
    const csat: DraftCondition = { uid: 'x', field: 'csat_score', op: 'between', value: [50, 70] };
    expect(withField(csat, f('renewal_date'))).toEqual({ uid: 'x', field: 'renewal_date', op: 'within_next', value: undefined });
  });

  it('keeps what still fits when the operator changes, and starts over when it does not', () => {
    const base: DraftCondition = { uid: 'x', field: 'csat_score', op: 'gt', value: 60 };
    expect(withOp(base, f('csat_score'), 'lt').value).toBe(60);
    expect(withOp(base, f('csat_score'), 'between').value).toEqual([60, undefined]);
    expect(withOp({ ...base, op: 'between', value: [40, 70] }, f('csat_score'), 'gt').value).toBe(40);
    expect(withOp(base, f('csat_score'), 'is_empty').value).toBeUndefined();
    const stage: DraftCondition = { uid: 'y', field: 'lifecycle_stage', op: 'is', value: 'live' };
    expect(withOp(stage, f('lifecycle_stage'), 'in').value).toEqual(['live']);
    expect(withOp({ ...stage, op: 'in', value: ['live', 'renewal'] }, f('lifecycle_stage'), 'is_not').value).toBe('live');
    const renewal: DraftCondition = { uid: 'z', field: 'renewal_date', op: 'gt', value: '2026-12-01' };
    expect(withOp(renewal, f('renewal_date'), 'within_next').value).toBeUndefined();
  });

  it('calls a condition complete only with every value its operator needs', () => {
    const c = (op: DraftCondition['op'], value: DraftCondition['value'], field = 'csat_score'): DraftCondition => ({ uid: 'x', field, op, value });
    expect(isComplete(c('gt', 60), f('csat_score'))).toBe(true);
    expect(isComplete(c('gt', undefined), f('csat_score'))).toBe(false);
    expect(isComplete(c('between', [60, undefined]), f('csat_score'))).toBe(false);
    expect(isComplete(c('is_empty', undefined), f('csat_score'))).toBe(true);
    expect(isComplete(c('in', [], 'lifecycle_stage'), f('lifecycle_stage'))).toBe(false);
    expect(isComplete(c('is', null, 'owner'), f('owner'))).toBe(true);
    expect(isComplete(c('is', 'live', 'lifecycle_stage'), null)).toBe(false);
    expect(isComplete(c('is', 'live', 'lifecycle_stage'), f('csat_score'))).toBe(false);
  });

  it('adds a group asking the other question, counts conditions inside groups, and finds the first unfinished one', () => {
    let draft = addCondition(fromRules(null), f('csat_score'));
    draft = addGroup(draft, f('lifecycle_stage'));
    const group = draft.conditions[1];
    expect(isDraftGroup(group) && group.match).toBe('any');
    draft = addCondition(draft, f('health_category'), group.uid);
    expect(conditionCount(draft)).toBe(3);
    expect(firstIncomplete(draft, fieldOf)).toBe(draft.conditions[0].uid);
    const first = draft.conditions[0].uid;
    draft = updateCondition(draft, first, (c) => ({ ...c, value: 60 }));
    expect(firstIncomplete(draft, fieldOf)).toBe(isDraftGroup(group) ? group.conditions[0].uid : null);
  });

  it('removes a group with its last condition, and sets all/any on the rules or on one group', () => {
    let draft = addGroup(fromRules(null), f('csat_score'));
    const group = draft.conditions[0];
    draft = setMatch(draft, 'all', group.uid);
    expect(isDraftGroup(draft.conditions[0]) && draft.conditions[0].match).toBe('all');
    draft = setMatch(draft, 'any');
    expect(draft.match).toBe('any');
    const only = isDraftGroup(group) ? group.conditions[0].uid : '';
    expect(removeNode(draft, only).conditions).toEqual([]);
  });
});
```

Note on the second-to-last test: `group` is read from the draft before the third `addCondition`, so its `conditions[0]` is the group's first condition (the one `addGroup` made). That condition is still unfinished after the first is filled.

```ts
// src/features/segments/segmentErrors.test.ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { formErrors, rulesMessage } from './segmentErrors';

describe('segment 400s by field', () => {
  it('puts each field\'s first message at that field, and a detail at the form', () => {
    const err = new ApiError(400, { name: ['This field may not be blank.'], rules: ['Unknown field "mood" for organisations.'] }, 'x');
    expect(formErrors(err)).toEqual({ name: 'This field may not be blank.', rules: 'Unknown field "mood" for organisations.' });
    expect(formErrors(new ApiError(400, { detail: 'You can own at most 50 segments.' }, 'x'))).toEqual({ form: 'You can own at most 50 segments.' });
    expect(formErrors(new ApiError(400, { shared_with: ['Choose at least one teammate.'] }, 'x'))).toEqual({ shared_with: 'Choose at least one teammate.' });
  });

  it('falls back to the error\'s own message, or the caller\'s words for a network failure', () => {
    expect(formErrors(new ApiError(500, null, 'Request failed (500)'))).toEqual({ form: 'Request failed (500)' });
    expect(formErrors(new TypeError('Failed to fetch'))).toEqual({ form: 'Could not save this segment. Try again.' });
  });

  it('reads a preview refusal as its rules message', () => {
    expect(rulesMessage(new ApiError(400, { rules: ['"is" cannot be used with Health score.'] }, 'x'))).toBe('"is" cannot be used with Health score.');
    expect(rulesMessage(new TypeError('Failed to fetch'))).toBe('Could not preview this segment.');
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run --maxWorkers=2 src/features/segments/ruleDraft.test.ts src/features/segments/segmentErrors.test.ts`
Expected: FAIL, "Failed to resolve import "./ruleDraft"" and "./segmentErrors".

- [ ] **Step 3: Write the draft**

```ts
// src/features/segments/ruleDraft.ts
// The builder's rules while they are being written: every condition and
// group carries a uid (React keys, the "unfinished" mark), a value may be
// missing, and the edits keep the backend's shape rules (one level of
// groups, no empty group). `toRules` strips the uids for the API.
import { operatorsOf, VALUELESS, type FieldDef } from './segmentFields';
import type { Condition, Match, Operator, RuleScalar, Rules } from './segmentTypes';

export type DraftValue = RuleScalar | undefined | (RuleScalar | undefined)[];

export interface DraftCondition {
  uid: string;
  field: string;
  op: Operator;
  value: DraftValue;
}

export interface DraftGroup {
  uid: string;
  match: Match;
  conditions: DraftCondition[];
}

export type DraftNode = DraftCondition | DraftGroup;

export interface DraftRules {
  match: Match;
  conditions: DraftNode[];
}

/** What value an operator takes: none, one, a range, a list, or a number of days. */
export type Shape = 'none' | 'one' | 'two' | 'many' | 'days';

let counter = 0;
const nextUid = () => `rule-${++counter}`;

export const isDraftGroup = (node: DraftNode): node is DraftGroup => 'match' in node;

export function fromRules(rules: Rules | null | undefined): DraftRules {
  const leaf = (condition: Condition): DraftCondition => ({ uid: nextUid(), field: condition.field, op: condition.op, value: condition.value });
  return {
    match: rules?.match ?? 'all',
    conditions: (rules?.conditions ?? []).map((condition) =>
      'group' in condition ? { uid: nextUid(), match: condition.group.match, conditions: condition.group.conditions.map(leaf) } : leaf(condition),
    ),
  };
}

export function toRules(draft: DraftRules): Rules {
  const leaf = ({ field, op, value }: DraftCondition): Condition =>
    value === undefined ? { field, op } : { field, op, value: value as Condition['value'] };
  return {
    match: draft.match,
    conditions: draft.conditions.map((node) => (isDraftGroup(node) ? { group: { match: node.match, conditions: node.conditions.map(leaf) } } : leaf(node))),
  };
}

export function shapeOf(op: Operator): Shape {
  if (VALUELESS.includes(op)) return 'none';
  if (op === 'between') return 'two';
  if (op === 'in') return 'many';
  if (op === 'within_next' || op === 'within_last') return 'days';
  return 'one';
}

export function initialValue(field: FieldDef, op: Operator): DraftValue {
  const shape = shapeOf(op);
  if (shape === 'two') return [undefined, undefined];
  if (shape === 'many') return [];
  if (shape === 'one' && field.type === 'boolean') return true;
  return undefined;
}

export function newCondition(field: FieldDef): DraftCondition {
  const op = operatorsOf(field)[0];
  return { uid: nextUid(), field: field.key, op, value: initialValue(field, op) };
}

export function withField(condition: DraftCondition, field: FieldDef): DraftCondition {
  const op = operatorsOf(field)[0];
  return { ...condition, field: field.key, op, value: initialValue(field, op) };
}

/** A new operator keeps the value where its shape allows (60 stays 60 from
 *  "more than" to "less than"; "is Live" becomes "is any of Live"). */
export function withOp(condition: DraftCondition, field: FieldDef, op: Operator): DraftCondition {
  const from = shapeOf(condition.op);
  const to = shapeOf(op);
  const value = condition.value;
  const first = Array.isArray(value) ? value[0] : value;
  let next: DraftValue;
  if (from === to) next = value;
  else if (from === 'one' && to === 'two') next = [first, undefined];
  else if ((from === 'two' || from === 'many') && to === 'one') next = first;
  else if (from === 'one' && to === 'many') next = first === undefined ? [] : [first];
  else next = initialValue(field, op);
  return { ...condition, op, value: next };
}

const filled = (value: RuleScalar | undefined) => value !== undefined && value !== '';

/** Whether the condition can be sent: a known field, an operator it takes,
 *  and every value that operator needs. A `null` (a record the reader can't
 *  open, kept from saved rules) counts as a value. */
export function isComplete(condition: DraftCondition, field: FieldDef | null): boolean {
  if (!field || !operatorsOf(field).includes(condition.op)) return false;
  const value = condition.value;
  switch (shapeOf(condition.op)) {
    case 'none':
      return true;
    case 'two':
      return Array.isArray(value) && value.length === 2 && value.every(filled);
    case 'many':
      return Array.isArray(value) && value.length > 0;
    default:
      return !Array.isArray(value) && filled(value);
  }
}

export function leaves(draft: DraftRules): DraftCondition[] {
  return draft.conditions.flatMap((node) => (isDraftGroup(node) ? node.conditions : [node]));
}

/** Counting each condition inside a group, as the 20 limit does. */
export function conditionCount(draft: DraftRules): number {
  return leaves(draft).length;
}

export function firstIncomplete(draft: DraftRules, fieldOf: (key: string) => FieldDef | null): string | null {
  return leaves(draft).find((condition) => !isComplete(condition, fieldOf(condition.field)))?.uid ?? null;
}

export function addCondition(draft: DraftRules, field: FieldDef, groupUid?: string): DraftRules {
  const condition = newCondition(field);
  if (!groupUid) return { ...draft, conditions: [...draft.conditions, condition] };
  return {
    ...draft,
    conditions: draft.conditions.map((node) => (isDraftGroup(node) && node.uid === groupUid ? { ...node, conditions: [...node.conditions, condition] } : node)),
  };
}

/** A group asks the other question: inside "all", a group of "any". */
export function addGroup(draft: DraftRules, field: FieldDef): DraftRules {
  const match: Match = draft.match === 'all' ? 'any' : 'all';
  return { ...draft, conditions: [...draft.conditions, { uid: nextUid(), match, conditions: [newCondition(field)] }] };
}

export function updateCondition(draft: DraftRules, uid: string, update: (condition: DraftCondition) => DraftCondition): DraftRules {
  const one = (condition: DraftCondition) => (condition.uid === uid ? update(condition) : condition);
  return { ...draft, conditions: draft.conditions.map((node) => (isDraftGroup(node) ? { ...node, conditions: node.conditions.map(one) } : one(node))) };
}

/** Removes a condition or a group. A group never stays empty (the backend
 *  refuses one), so removing its last condition removes it too. */
export function removeNode(draft: DraftRules, uid: string): DraftRules {
  const conditions: DraftNode[] = [];
  for (const node of draft.conditions) {
    if (node.uid === uid) continue;
    if (isDraftGroup(node)) {
      const inner = node.conditions.filter((condition) => condition.uid !== uid);
      if (inner.length > 0) conditions.push({ ...node, conditions: inner });
    } else {
      conditions.push(node);
    }
  }
  return { ...draft, conditions };
}

export function setMatch(draft: DraftRules, match: Match, groupUid?: string): DraftRules {
  if (!groupUid) return { ...draft, match };
  return { ...draft, conditions: draft.conditions.map((node) => (isDraftGroup(node) && node.uid === groupUid ? { ...node, match } : node)) };
}
```

```ts
// src/features/segments/segmentErrors.ts
// A segment write's 400, put where its key points (spec §3: messages at the
// field): name, description, kind, rules, sharing and shared_with at their
// own fields; a `detail` (the 50-segment limit, a 403) at the form.
import { ApiError } from '../../lib/apiClient';

const FIELDS = ['name', 'description', 'kind', 'rules', 'sharing', 'shared_with'] as const;

export type FormErrors = Partial<Record<(typeof FIELDS)[number] | 'form', string>>;

export function formErrors(err: unknown, fallback = 'Could not save this segment. Try again.'): FormErrors {
  if (!(err instanceof ApiError)) return { form: fallback };
  const out: FormErrors = {};
  const body = err.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    for (const key of FIELDS) {
      const value = record[key];
      if (Array.isArray(value) && typeof value[0] === 'string') out[key] = value[0];
    }
    if (typeof record.detail === 'string') out.form = record.detail;
  }
  return Object.keys(out).length > 0 ? out : { form: err.message };
}

/** The preview's refusal: its `rules` text (it checks rules as a save does). */
export function rulesMessage(err: unknown): string {
  const errors = formErrors(err, 'Could not preview this segment.');
  return errors.rules ?? errors.form ?? 'Could not preview this segment.';
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/features/segments/ruleDraft.test.ts src/features/segments/segmentErrors.test.ts`
Expected: PASS (7 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/segments/ruleDraft.ts src/features/segments/ruleDraft.test.ts src/features/segments/segmentErrors.ts src/features/segments/segmentErrors.test.ts
git commit -m "feat(segments): the builder's editable rule draft, and 400s placed by field

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Save as segment: a list's URL filters as rules

**Files:**
- Create: `src/features/segments/fromListFilters.ts`
- Test: `src/features/segments/fromListFilters.test.ts`

**Interfaces:**
- Consumes: `parseParams`, `DEFAULT_GROUP`, `ORGANIZATION_PARAMS` (`features/organizations/portfolioParams`), `ACCOUNT_PARAMS` (`features/accounts/portfolioParams`), `parseContactsParams` (`features/contacts/contactsParams`), `KIND_NOUN` (Task 2), `Condition`, `ConditionGroup`, `Rules`, `SegmentKind` (Task 1).
- Produces:

```ts
export interface ListRules { rules: Rules; notes: string[]; ids: { customer: number[]; account: number[] } }
export const INCLUDE_CHURNED: ConditionGroup;  // (Churned is yes or Churned is no)
export const NO_RULES_NOTE: string;
export function rulesFromList(kind: SegmentKind, search: URLSearchParams): ListRules;
export function saveAsSegmentHref(kind: SegmentKind, listQuery: string): string;  // "/segments/new?kind=<kind>&<listQuery>"
```

- [ ] **Step 1: Write the failing test**

```ts
// src/features/segments/fromListFilters.test.ts
import { describe, expect, it } from 'vitest';
import { INCLUDE_CHURNED, NO_RULES_NOTE, rulesFromList, saveAsSegmentHref } from './fromListFilters';

const q = (text: string) => new URLSearchParams(text);

describe('Save as segment: list filters to rules (plan Decision 5)', () => {
  it('turns every Organizations filter into one condition, in the list\'s own order', () => {
    const { rules, notes, ids } = rulesFromList('customer', q('owner=2&lifecycle=live,renewal&health=poor&product=3&renews_within=90&nps=detractor'));
    expect(rules).toEqual({
      match: 'all',
      conditions: [
        { field: 'owner', op: 'is', value: 2 },
        { field: 'lifecycle_stage', op: 'in', value: ['live', 'renewal'] },
        { field: 'health_category', op: 'is', value: 'poor' },
        { field: 'product', op: 'is', value: 3 },
        { field: 'renewal_date', op: 'within_next', value: 90 },
        { field: 'nps_band', op: 'is', value: 'detractor' },
      ],
    });
    expect(notes).toEqual([]);
    expect(ids).toEqual({ customer: [], account: [] });
  });

  it('keeps an unassigned owner as the word the registry takes', () => {
    expect(rulesFromList('customer', q('owner=unassigned')).rules.conditions).toEqual([{ field: 'owner', op: 'is', value: 'unassigned' }]);
  });

  it('lifts the churned default for include_churned=1 with "churned or not", unless a lifecycle already names churn', () => {
    expect(rulesFromList('customer', q('health=good&include_churned=1')).rules.conditions).toEqual([
      { field: 'health_category', op: 'is', value: 'good' },
      INCLUDE_CHURNED,
    ]);
    expect(INCLUDE_CHURNED).toEqual({
      group: { match: 'any', conditions: [{ field: 'churned', op: 'is', value: true }, { field: 'churned', op: 'is', value: false }] },
    });
    expect(rulesFromList('customer', q('lifecycle=churn&include_churned=1')).rules.conditions).toEqual([
      { field: 'lifecycle_stage', op: 'is', value: 'churn' },
    ]);
  });

  it('names what does not carry over: the search and the picked records', () => {
    const { rules, notes } = rulesFromList('customer', q('search=pizza&ids=7,1&health=poor'));
    expect(rules.conditions).toEqual([{ field: 'health_category', op: 'is', value: 'poor' }]);
    expect(notes).toEqual([
      'The search "pizza" isn\'t carried over: a segment has no search rule.',
      "2 picked organisations from the list aren't carried over: a rule can't name records one by one.",
    ]);
  });

  it('says the segment starts with no rules when nothing became one', () => {
    expect(rulesFromList('customer', q('search=pizza')).notes).toEqual([
      'The search "pizza" isn\'t carried over: a segment has no search rule.',
      NO_RULES_NOTE,
    ]);
    expect(rulesFromList('account', q('')).notes).toEqual([NO_RULES_NOTE]);
  });

  it('turns the Accounts filters, organisations included, and asks for those organisations\' names', () => {
    const { rules, ids } = rulesFromList('account', q('organisation=7,9&lifecycle=live&product=3&include_churned=1'));
    expect(rules.conditions).toEqual([
      { field: 'lifecycle_stage', op: 'is', value: 'live' },
      { field: 'organisation', op: 'in', value: [7, 9] },
    ]);
    expect(ids).toEqual({ customer: [7, 9], account: [] });
  });

  it('turns the Contacts filters into organisation, account, sentiment and role, and its q into a note', () => {
    const { rules, notes, ids } = rulesFromList('contact', q('q=lu&customer=6&account=31&sentiment=negative&role=champion'));
    expect(rules.conditions).toEqual([
      { field: 'organisation', op: 'is', value: 6 },
      { field: 'account', op: 'is', value: 31 },
      { field: 'sentiment', op: 'is', value: 'negative' },
      { field: 'role', op: 'is', value: 'champion' },
    ]);
    expect(notes).toEqual(['The search "lu" isn\'t carried over: a segment has no search rule.']);
    expect(ids).toEqual({ customer: [6], account: [31] });
  });

  it('opens the builder with the kind first and the list query unchanged', () => {
    expect(saveAsSegmentHref('customer', 'search=pizza&owner=2')).toBe('/segments/new?kind=customer&search=pizza&owner=2');
    expect(saveAsSegmentHref('contact', '')).toBe('/segments/new?kind=contact');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/features/segments/fromListFilters.test.ts`
Expected: FAIL, "Failed to resolve import "./fromListFilters"".

- [ ] **Step 3: Write the mapping**

```ts
// src/features/segments/fromListFilters.ts
// "Save as segment" (spec §3): a list's current URL filters as a new
// segment's rules, read with each list's own parser so a value the list
// would drop is dropped here too. What has no rule (the search, picked ids)
// is named in a note rather than lost silently (plan Decision 5).
import { ACCOUNT_PARAMS } from '../accounts/portfolioParams';
import { parseContactsParams } from '../contacts/contactsParams';
import { DEFAULT_GROUP, ORGANIZATION_PARAMS, parseParams } from '../organizations/portfolioParams';
import { KIND_NOUN } from './segmentFields';
import type { Condition, ConditionGroup, Rules, SegmentKind } from './segmentTypes';

export interface ListRules {
  rules: Rules;
  /** What did not carry over, in the builder's words. */
  notes: string[];
  /** Organisation and account ids the rules name, to read their names. */
  ids: { customer: number[]; account: number[] };
}

/** The Organizations list's "Include churned": churned or not, so everyone
 *  counts, and naming `churned` lifts the default exactly as the toggle does
 *  (API_CONTRACTS `segments`, Save as segment; the compiler reads a churned
 *  condition at any depth). */
export const INCLUDE_CHURNED: ConditionGroup = {
  group: {
    match: 'any',
    conditions: [
      { field: 'churned', op: 'is', value: true },
      { field: 'churned', op: 'is', value: false },
    ],
  },
};

export const NO_RULES_NOTE = 'Nothing on the list became a rule, so this segment starts with none: add one below.';

const searchNote = (text: string) => `The search "${text}" isn't carried over: a segment has no search rule.`;

function oneOrMany(field: string, values: (string | number)[]): Condition {
  return values.length === 1 ? { field, op: 'is', value: values[0] } : { field, op: 'in', value: values };
}

function portfolioRules(kind: 'customer' | 'account', search: URLSearchParams): ListRules {
  const p = parseParams(search, DEFAULT_GROUP, kind === 'customer' ? ORGANIZATION_PARAMS : ACCOUNT_PARAMS);
  const conditions: (Condition | ConditionGroup)[] = [];
  if (p.owner) conditions.push({ field: 'owner', op: 'is', value: p.owner === 'unassigned' ? 'unassigned' : Number(p.owner) });
  if (p.lifecycle.length) conditions.push(oneOrMany('lifecycle_stage', p.lifecycle));
  if (p.health.length) conditions.push(oneOrMany('health_category', p.health));
  if (p.product.length) conditions.push(oneOrMany('product', p.product.map(Number)));
  const organisations = (p.organisation ?? []).map(Number);
  if (organisations.length) conditions.push(oneOrMany('organisation', organisations));
  if (p.renews_within) conditions.push({ field: 'renewal_date', op: 'within_next', value: Number(p.renews_within) });
  if (p.nps) conditions.push({ field: 'nps_band', op: 'is', value: p.nps });
  if (p.include_churned && !p.lifecycle.includes('churn')) conditions.push(INCLUDE_CHURNED);

  const notes: string[] = [];
  if (p.search) notes.push(searchNote(p.search));
  if (p.ids.length) {
    const noun = p.ids.length === 1 ? KIND_NOUN[kind].one : KIND_NOUN[kind].many;
    notes.push(`${p.ids.length} picked ${noun} from the list ${p.ids.length === 1 ? "isn't" : "aren't"} carried over: a rule can't name records one by one.`);
  }
  if (conditions.length === 0) notes.push(NO_RULES_NOTE);
  return { rules: { match: 'all', conditions }, notes, ids: { customer: organisations, account: [] } };
}

function contactRules(search: URLSearchParams): ListRules {
  const p = parseContactsParams(search);
  const conditions: Condition[] = [];
  if (p.customer) conditions.push({ field: 'organisation', op: 'is', value: Number(p.customer) });
  if (p.account) conditions.push({ field: 'account', op: 'is', value: Number(p.account) });
  if (p.sentiment) conditions.push({ field: 'sentiment', op: 'is', value: p.sentiment });
  if (p.role) conditions.push({ field: 'role', op: 'is', value: p.role });
  const notes = p.q.trim() ? [searchNote(p.q.trim())] : [];
  if (conditions.length === 0) notes.push(NO_RULES_NOTE);
  return {
    rules: { match: 'all', conditions },
    notes,
    ids: { customer: p.customer ? [Number(p.customer)] : [], account: p.account ? [Number(p.account)] : [] },
  };
}

export function rulesFromList(kind: SegmentKind, search: URLSearchParams): ListRules {
  return kind === 'contact' ? contactRules(search) : portfolioRules(kind, search);
}

/** The builder's address for a list's Save as segment: the kind, then the
 *  list's own filter query, unchanged (it reloads and shares as it is). */
export function saveAsSegmentHref(kind: SegmentKind, listQuery: string): string {
  const query = new URLSearchParams([['kind', kind], ...new URLSearchParams(listQuery)]);
  return `/segments/new?${query.toString()}`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --maxWorkers=2 src/features/segments/fromListFilters.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/segments/fromListFilters.ts src/features/segments/fromListFilters.test.ts
git commit -m "feat(segments): turn a list's URL filters into a new segment's rules, naming what can't carry over

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The pages' URL state and the tile figures

**Files:**
- Create: `src/features/segments/segmentParams.ts`
- Create: `src/features/segments/summaryFigures.ts`
- Test: `src/features/segments/segmentParams.test.ts`, `src/features/segments/summaryFigures.test.ts`

**Interfaces:**
- Consumes: `SORT_OPTIONS` (`features/organizations/portfolioFields`), `GROUP_OPTIONS`, `GroupOption` (`features/organizations/portfolioGroups`), `DEFAULT_SORT` (`features/organizations/portfolioParams`), `ACCOUNT_SORT_OPTIONS`, `ACCOUNT_GROUP_OPTIONS` (`features/accounts/accountFields`), `formatCompactMoney` (`features/customers/formatters`), `KIND_NOUN` (Task 2), `SegmentKind`, `SegmentScope`, `SegmentSummary`, `DayMoves` (Task 1).
- Produces:

```ts
// segmentParams.ts
export const SCOPES: { value: SegmentScope; label: string }[];      // All, Mine, Shared with me
export interface ListParams { scope: SegmentScope; search: string }
export function parseListParams(search: URLSearchParams): ListParams;
export function toListSearch(p: ListParams): URLSearchParams;
export type SegmentTab = 'members' | 'changes';
export const CHANGE_WINDOWS: readonly [7, 30, 90];
export type ChangeWindow = 7 | 30 | 90;
export const MEMBERS_PAGE_SIZE = 50;
export interface SegmentPageParams { tab: SegmentTab; search: string; sort: string; group: string; days: ChangeWindow }
export function memberSortOptions(kind: SegmentKind): { value: string; label: string }[];
export function memberGroupOptions(kind: SegmentKind): GroupOption[];
export function parseSegmentPage(search: URLSearchParams, kind: SegmentKind): SegmentPageParams;
export function toSegmentPageSearch(p: SegmentPageParams): URLSearchParams;
export function membersQuery(p: SegmentPageParams, kind: SegmentKind, extra?: Record<string, string>): string;
// summaryFigures.ts
export const OWNER_ONLY = 'Only the owner sees this figure';
export interface Figure { key: string; label: string; value: string; detail?: string }
export function summaryFigures(summary: SegmentSummary, kind: SegmentKind): Figure[];
export function movesText(moves: DayMoves): string;                 // "+3 / −1"
export function memberCountText(count: number, total: number, search: string, kind: SegmentKind): string;
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/segments/segmentParams.test.ts
import { describe, expect, it } from 'vitest';
import { membersQuery, parseListParams, parseSegmentPage, toListSearch, toSegmentPageSearch } from './segmentParams';

const q = (text: string) => new URLSearchParams(text);

describe('segments URL state', () => {
  it('reads the list\'s scope and search, All by default, and writes only what is set', () => {
    expect(parseListParams(q(''))).toEqual({ scope: 'all', search: '' });
    expect(parseListParams(q('scope=shared&search= risk '))).toEqual({ scope: 'shared', search: 'risk' });
    expect(parseListParams(q('scope=everyone')).scope).toBe('all');
    expect(toListSearch({ scope: 'all', search: '' }).toString()).toBe('');
    expect(toListSearch({ scope: 'mine', search: 'risk' }).toString()).toBe('scope=mine&search=risk');
  });

  it('reads a segment page\'s tab, search, sort, group and window, dropping what the kind does not take', () => {
    expect(parseSegmentPage(q(''), 'customer')).toEqual({ tab: 'members', search: '', sort: '-arr', group: '', days: 30 });
    expect(parseSegmentPage(q('tab=changes&days=90&sort=name&group=owner&search=piz'), 'customer')).toEqual({
      tab: 'changes', search: 'piz', sort: 'name', group: 'owner', days: 90,
    });
    // Accounts have no product grouping or seat sort; 45 is not a window.
    expect(parseSegmentPage(q('group=product&sort=-seat_utilization_percentage&days=45'), 'account')).toEqual({
      tab: 'members', search: '', sort: '-arr', group: '', days: 30,
    });
  });

  it('writes the page URL with its defaults left out', () => {
    expect(toSegmentPageSearch({ tab: 'members', search: '', sort: '-arr', group: '', days: 30 }).toString()).toBe('');
    expect(toSegmentPageSearch({ tab: 'changes', search: 'a', sort: 'name', group: 'health', days: 7 }).toString()).toBe(
      'tab=changes&search=a&sort=name&group=health&days=7',
    );
  });

  it('asks the members endpoint only for the names it reads, and contacts only for search', () => {
    const p = { tab: 'members' as const, search: 'piz', sort: 'name', group: 'health', days: 30 as const };
    expect(membersQuery(p, 'customer', { limit: '50' })).toBe('search=piz&sort=name&group=health&limit=50');
    expect(membersQuery(p, 'contact', { limit: '50' })).toBe('search=piz&limit=50');
  });
});
```

```ts
// src/features/segments/summaryFigures.test.ts
import { describe, expect, it } from 'vitest';
import { memberCountText, movesText, summaryFigures } from './summaryFigures';
import { summaryOf } from './testSegments';

describe('segment tile figures', () => {
  it('reads members, ARR covered, average health, average CSAT and the last 7 days for organisations', () => {
    expect(summaryFigures(summaryOf(41, 'customer'), 'customer').map((f) => [f.label, f.value])).toEqual([
      ['Members', '41'],
      ['ARR covered', '$512K'],
      ['Average health', '5.4'],
      ['Average CSAT', '71%'],
      ['Last 7 days', '+6 / −2'],
    ]);
  });

  it('says how much ARR could not be converted, and shows a dash for an average nobody has', () => {
    const figures = summaryFigures({ ...summaryOf(2, 'account'), unconverted_count: 1, avg_csat: null }, 'account');
    expect(figures.find((f) => f.key === 'arr')?.detail).toBe('1 not converted');
    expect(figures.find((f) => f.key === 'csat')?.value).toBe('—');
  });

  it('gives contacts only Members and the last 7 days, and the preview no last 7 days', () => {
    expect(summaryFigures(summaryOf(3, 'contact'), 'contact').map((f) => f.key)).toEqual(['members', 'moves']);
    expect(summaryFigures({ ...summaryOf(3, 'customer'), entered_7d: null, left_7d: null }, 'customer').map((f) => f.key)).not.toContain('moves');
  });

  it('writes a day\'s moves and the members count line', () => {
    expect(movesText({ entered: 3, left: 1 })).toBe('+3 / −1');
    expect(memberCountText(3, 3, '', 'customer')).toBe('3 organisations');
    expect(memberCountText(1, 1, '', 'contact')).toBe('1 contact');
    expect(memberCountText(1, 3, 'piz', 'account')).toBe('1 of 3 accounts');
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run --maxWorkers=2 src/features/segments/segmentParams.test.ts src/features/segments/summaryFigures.test.ts`
Expected: FAIL, "Failed to resolve import "./segmentParams"" and "./summaryFigures".

- [ ] **Step 3: Write the URL state and the figures**

```ts
// src/features/segments/segmentParams.ts
// The Segments pages' URL state: the list's scope and search, and a
// segment page's tab, members search/sort/group and changes window. Values
// a kind does not take are dropped, as the backend drops them.
import { ACCOUNT_GROUP_OPTIONS, ACCOUNT_SORT_OPTIONS } from '../accounts/accountFields';
import { SORT_OPTIONS } from '../organizations/portfolioFields';
import { GROUP_OPTIONS, type GroupOption } from '../organizations/portfolioGroups';
import { DEFAULT_SORT } from '../organizations/portfolioParams';
import type { SegmentKind, SegmentScope } from './segmentTypes';

export const SCOPES: { value: SegmentScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'shared', label: 'Shared with me' },
];

export interface ListParams {
  scope: SegmentScope;
  search: string;
}

export function parseListParams(search: URLSearchParams): ListParams {
  const scope = search.get('scope');
  return {
    scope: scope === 'mine' || scope === 'shared' ? scope : 'all',
    search: (search.get('search') ?? '').trim(),
  };
}

export function toListSearch(p: ListParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.scope !== 'all') out.set('scope', p.scope);
  if (p.search) out.set('search', p.search);
  return out;
}

export type SegmentTab = 'members' | 'changes';
export const CHANGE_WINDOWS = [7, 30, 90] as const;
export type ChangeWindow = (typeof CHANGE_WINDOWS)[number];
export const MEMBERS_PAGE_SIZE = 50;
const DEFAULT_WINDOW: ChangeWindow = 30;

export interface SegmentPageParams {
  tab: SegmentTab;
  search: string;
  /** A sort key, '-' first when descending. Contacts ignore it (by name). */
  sort: string;
  /** '' is ungrouped. Contacts never group. */
  group: string;
  days: ChangeWindow;
}

export function memberSortOptions(kind: SegmentKind): { value: string; label: string }[] {
  if (kind === 'customer') return SORT_OPTIONS;
  if (kind === 'account') return ACCOUNT_SORT_OPTIONS;
  return [];
}

export function memberGroupOptions(kind: SegmentKind): GroupOption[] {
  if (kind === 'customer') return GROUP_OPTIONS;
  if (kind === 'account') return ACCOUNT_GROUP_OPTIONS;
  return [];
}

export function parseSegmentPage(search: URLSearchParams, kind: SegmentKind): SegmentPageParams {
  const sorts = memberSortOptions(kind).map((option) => option.value);
  const groups = memberGroupOptions(kind)
    .map((option) => option.value)
    .filter((value) => value !== 'none');
  const sort = search.get('sort') ?? '';
  const group = search.get('group') ?? '';
  const days = Number(search.get('days'));
  return {
    tab: search.get('tab') === 'changes' ? 'changes' : 'members',
    search: (search.get('search') ?? '').trim(),
    sort: sorts.includes(sort.replace(/^-/, '')) ? sort : DEFAULT_SORT,
    group: (groups as string[]).includes(group) ? group : '',
    days: (CHANGE_WINDOWS as readonly number[]).includes(days) ? (days as ChangeWindow) : DEFAULT_WINDOW,
  };
}

export function toSegmentPageSearch(p: SegmentPageParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.tab !== 'members') out.set('tab', p.tab);
  if (p.search) out.set('search', p.search);
  if (p.sort !== DEFAULT_SORT) out.set('sort', p.sort);
  if (p.group) out.set('group', p.group);
  if (p.days !== DEFAULT_WINDOW) out.set('days', String(p.days));
  return out;
}

/** The members endpoint's query: only names it passes on (sort, group,
 *  group_value, search, cursor, limit). Contacts are by name: search only. */
export function membersQuery(p: SegmentPageParams, kind: SegmentKind, extra: Record<string, string> = {}): string {
  const out = new URLSearchParams();
  if (p.search) out.set('search', p.search);
  if (kind !== 'contact') {
    out.set('sort', p.sort);
    if (p.group) out.set('group', p.group);
  }
  for (const [key, value] of Object.entries(extra)) out.set(key, value);
  return out.toString();
}
```

```ts
// src/features/segments/summaryFigures.ts
// The tiles' figures (spec §3: members, ARR covered, average health,
// average CSAT, entered and left in the last 7 days), shared by the segment
// page's tiles and the builder's preview totals.
import { formatCompactMoney } from '../customers/formatters';
import { KIND_NOUN } from './segmentFields';
import type { DayMoves, SegmentKind, SegmentSummary } from './segmentTypes';

/** What "—" means on someone else's segment (Ruling S8). */
export const OWNER_ONLY = 'Only the owner sees this figure';

export interface Figure {
  key: string;
  label: string;
  value: string;
  detail?: string;
}

export function movesText(moves: DayMoves): string {
  return `+${moves.entered} / −${moves.left}`;
}

/** Contacts have no ARR, health or CSAT (always null): only Members and the
 *  last 7 days (plan Decision 13). The preview has no last 7 days. */
export function summaryFigures(summary: SegmentSummary, kind: SegmentKind): Figure[] {
  const figures: Figure[] = [{ key: 'members', label: 'Members', value: String(summary.members) }];
  if (kind !== 'contact') {
    figures.push({
      key: 'arr',
      label: 'ARR covered',
      value: summary.arr === null ? '—' : formatCompactMoney(summary.arr, summary.currency),
      detail: summary.unconverted_count ? `${summary.unconverted_count} not converted` : undefined,
    });
    figures.push({ key: 'health', label: 'Average health', value: summary.avg_health === null ? '—' : summary.avg_health.toFixed(1) });
    figures.push({ key: 'csat', label: 'Average CSAT', value: summary.avg_csat === null ? '—' : `${Math.round(summary.avg_csat)}%` });
  }
  if (summary.entered_7d !== null && summary.left_7d !== null) {
    figures.push({ key: 'moves', label: 'Last 7 days', value: movesText({ entered: summary.entered_7d, left: summary.left_7d }), detail: 'entered / left' });
  }
  return figures;
}

/** "3 organisations", or "1 of 3 accounts" while a search narrows the rows. */
export function memberCountText(count: number, total: number, search: string, kind: SegmentKind): string {
  const noun = KIND_NOUN[kind];
  if (search) return `${count} of ${total} ${total === 1 ? noun.one : noun.many}`;
  return `${count} ${count === 1 ? noun.one : noun.many}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/features/segments/segmentParams.test.ts src/features/segments/summaryFigures.test.ts`
Expected: PASS (4 + 4 tests). `formatCompactMoney(512000, 'USD')` is `$512K` (en-US compact).

- [ ] **Step 5: Commit**

```bash
git add src/features/segments/segmentParams.ts src/features/segments/segmentParams.test.ts src/features/segments/summaryFigures.ts src/features/segments/summaryFigures.test.ts
git commit -m "feat(segments): the pages' URL state, the members query and the tile figures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The value inputs, one per registry type

**Files:**
- Create: `src/components/segments/Chip.tsx`
- Create: `src/components/segments/RecordPicker.tsx`
- Create: `src/components/segments/ValueInput.tsx`
- Create: `src/components/segments/useBuilderOptions.ts`
- Test: `src/components/segments/ValueInput.test.tsx`

**Interfaces:**
- Consumes: `searchRecords`, `PickerRecord` (Task 1); `FieldDef`, `findField` (Task 2); `HIDDEN_NAME` (Task 3); `shapeOf`, `DraftCondition`, `DraftValue` (Task 4); `Check` (`components/organizations/portfolio/filterParts`); `FOCUS`, `MONO` (`styles`); `errorMessage` (`usePagedRead`); `fetchAttributes` (`features/attributes/attributesApi`); `fetchProducts` (`pages/settings/productsApi`).
- Produces:

```ts
// Chip.tsx
export function Chip({ name, hidden, onRemove }: { name: string; hidden?: boolean; onRemove: () => void }): JSX.Element; // an <li>
// RecordPicker.tsx
export function RecordPicker(props: { record: PickerRecord; multiple: boolean; value: DraftValue; label: string; labels: RuleLabels; onNamed: ValueOptions['onNamed']; onChange: (value: DraftValue) => void }): JSX.Element;
// ValueInput.tsx
export interface ValueOptions {
  people: PersonRef[];                     // active people in the workspace
  products: PersonRef[];                   // {id, name}
  labels: RuleLabels;                      // names for ids: saved labels + looked-up + picked
  onNamed: (group: 'organisations' | 'accounts', id: number, name: string) => void;
}
export function ValueInput(props: { field: FieldDef; condition: DraftCondition; options: ValueOptions; label: string; invalid: boolean; onChange: (value: DraftValue) => void }): JSX.Element | null;
// useBuilderOptions.ts
export function useAttributes(): AIAttribute[];   // [] until loaded, and on failure
export function useProducts(): PersonRef[];
```

Labels: a single box or select is named `label` ("Condition 1 value"); a range's boxes are `${label} from` and `${label} to`; a list is a group or list named `label`, with its add control `${label}: add`; the record picker's box is `${label}: search` and its results list `${label}: matches`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/segments/ValueInput.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DraftCondition, DraftValue } from '../../features/segments/ruleDraft';
import { findField } from '../../features/segments/segmentFields';
import { NO_LABELS, type Operator, type RuleLabels } from '../../features/segments/segmentTypes';
import { CARL, DANA, stubSegments } from '../../features/segments/testSegments';
import { ValueInput, type ValueOptions } from './ValueInput';

function Harness({ kind = 'customer', field, op, initial, labels = NO_LABELS, onNamed = vi.fn() }: {
  kind?: 'customer' | 'account' | 'contact';
  field: string;
  op: Operator;
  initial: DraftValue;
  labels?: RuleLabels;
  onNamed?: ValueOptions['onNamed'];
}) {
  const [value, setValue] = useState<DraftValue>(initial);
  const condition: DraftCondition = { uid: 'c1', field, op, value };
  const options: ValueOptions = { people: [CARL, DANA], products: [{ id: 3, name: 'Analytics' }], labels, onNamed };
  return (
    <>
      <ValueInput field={findField(kind, field, [])!} condition={condition} options={options} label="Condition 1 value" invalid={false} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value ?? 'unset')}</output>
    </>
  );
}

const value = () => screen.getByTestId('value').textContent;

describe('ValueInput (plan Decision 2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes a number range as two boxes, in DM Mono, with "%" for a percent', async () => {
    render(<Harness field="csat_score" op="between" initial={[undefined, undefined]} />);
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Condition 1 value from' }), '60');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Condition 1 value to' }), '80');
    expect(value()).toBe('[60,80]');
    expect(screen.getByRole('spinbutton', { name: 'Condition 1 value from' })).toHaveClass('font-mono-brand');
    expect(screen.getAllByText('%')).toHaveLength(2);
  });

  it('takes a date window as a number of days, and a date as a date', async () => {
    const { unmount } = render(<Harness field="renewal_date" op="within_next" initial={undefined} />);
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Condition 1 value' }), '90');
    expect(value()).toBe('90');
    expect(screen.getByText('days')).toBeInTheDocument();
    unmount();
    render(<Harness field="renewal_date" op="lt" initial={undefined} />);
    const date = screen.getByLabelText('Condition 1 value');
    expect(date).toHaveAttribute('type', 'date');
  });

  it('takes "is any of" a choice list as checkboxes', async () => {
    render(<Harness field="lifecycle_stage" op="in" initial={[]} />);
    const group = screen.getByRole('group', { name: 'Condition 1 value' });
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Live' }));
    await userEvent.click(within(group).getByRole('checkbox', { name: 'Renewal' }));
    expect(value()).toBe('["live","renewal"]');
  });

  it('offers an owner as Unassigned or an active teammate, and names a hidden one as such', async () => {
    const { unmount } = render(<Harness field="owner" op="is" initial={undefined} />);
    const select = screen.getByRole('combobox', { name: 'Condition 1 value' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'Unassigned', 'Carl CSM', 'Dana CSM']);
    await userEvent.selectOptions(select, 'Carl CSM');
    expect(value()).toBe('4');
    await userEvent.selectOptions(select, 'Unassigned');
    expect(value()).toBe('"unassigned"');
    unmount();
    render(<Harness field="owner" op="is" initial={null} />);
    expect(screen.getByRole('combobox', { name: 'Condition 1 value' })).toHaveDisplayValue("an owner you can't open");
  });

  it('adds owners to "is any of" as chips, and removes them', async () => {
    render(<Harness field="owner" op="in" initial={[]} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Condition 1 value: add' }), 'Dana CSM');
    expect(value()).toBe('[5]');
    await userEvent.click(within(screen.getByRole('list', { name: 'Condition 1 value' })).getByRole('button', { name: 'Remove Dana CSM' }));
    expect(value()).toBe('[]');
  });

  it('searches organisations on the server, picks one by name, and shows a hidden one as such', async () => {
    const spy = stubSegments();
    const onNamed = vi.fn();
    const { unmount } = render(<Harness kind="account" field="organisation" op="is" initial={undefined} onNamed={onNamed} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Condition 1 value: search' }), 'piz');
    const matches = await screen.findByRole('list', { name: 'Condition 1 value: matches' });
    await userEvent.click(within(matches).getByRole('button', { name: 'Pizza Hut' }));
    expect(value()).toBe('7');
    expect(onNamed).toHaveBeenCalledWith('organisations', 7, 'Pizza Hut');
    expect(spy.mock.calls.map(([input]) => new URL(String(input)).search)).toContain('?search=piz');
    unmount();
    render(<Harness kind="account" field="organisation" op="in" initial={[7, null]} labels={{ ...NO_LABELS, organisations: { '7': 'Pizza Hut' } }} />);
    const chosen = screen.getByRole('list', { name: 'Condition 1 value' });
    expect(within(chosen).getByText('Pizza Hut')).toBeInTheDocument();
    expect(within(chosen).getByText("an organisation you can't open").tagName).toBe('EM');
  });

  it('asks nothing for "is empty"', () => {
    const { container } = render(<Harness field="arr" op="is_empty" initial={undefined} />);
    expect(container.querySelectorAll('input, select')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/components/segments/ValueInput.test.tsx`
Expected: FAIL, "Failed to resolve import "./ValueInput"".

- [ ] **Step 3: Write the chip, the record picker, the value input and the options hooks**

```tsx
// src/components/segments/Chip.tsx
import { X } from 'lucide-react';
import { FOCUS } from '../organizations/portfolio/styles';

/** A chosen value with its Remove button (a record, an owner, a teammate).
 *  `hidden` is a record the reader can't open: named only as such. */
export function Chip({ name, hidden = false, onRemove }: { name: string; hidden?: boolean; onRemove: () => void }) {
  return (
    <li className="inline-flex items-center gap-0.5 rounded-full bg-subtle pl-2.5 text-[13px] text-ink">
      {hidden ? <em className="text-ink-muted">{name}</em> : name}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-line-subtle hover:text-ink sm:h-7 sm:w-7 ${FOCUS}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </li>
  );
}
```

```tsx
// src/components/segments/RecordPicker.tsx
import { useEffect, useState } from 'react';
import type { DraftValue } from '../../features/segments/ruleDraft';
import { HIDDEN_NAME } from '../../features/segments/ruleSentence';
import { searchRecords, type PickerRecord } from '../../features/segments/segmentApi';
import type { PersonRef, RuleLabels } from '../../features/segments/segmentTypes';
import { FOCUS } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { Chip } from './Chip';
import type { ValueOptions } from './ValueInput';

const GROUP = { customer: 'organisations', account: 'accounts' } as const;

type Answer = { query: string; rows: PersonRef[] } | { query: string; error: string };

/** An organisation or account picker that asks the server by name, 300ms
 *  after typing stops (first page, only what the reader may open). Chosen
 *  records are chips; one the reader can't open (a `null` kept from saved
 *  rules, or an id with no name) reads "an organisation you can't open". */
export function RecordPicker({
  record,
  multiple,
  value,
  label,
  labels,
  onNamed,
  onChange,
}: {
  record: PickerRecord;
  multiple: boolean;
  value: DraftValue;
  label: string;
  labels: RuleLabels;
  onNamed: ValueOptions['onNamed'];
  onChange: (value: DraftValue) => void;
}) {
  const chosen = (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter((id) => id !== undefined) as (number | null)[];
  const names = labels[GROUP[record]];
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const query = text.trim();

  useEffect(() => {
    if (!query) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      searchRecords(record, query).then(
        (rows) => {
          if (alive) setAnswer({ query, rows });
        },
        (err: unknown) => {
          if (alive) setAnswer({ query, error: errorMessage(err, 'Could not search.') });
        },
      );
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [record, query]);

  const current = answer && answer.query === query ? answer : null;
  const nameOf = (id: number | null) => (id === null ? undefined : names[String(id)]);
  const pick = (row: PersonRef) => {
    onNamed(GROUP[record], row.id, row.name);
    onChange(multiple ? [...chosen.filter((id) => id !== row.id), row.id] : row.id);
    setText('');
  };
  const remove = (index: number) => onChange(multiple ? chosen.filter((_, i) => i !== index) : undefined);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {chosen.length > 0 ? (
        <ul aria-label={label} className="flex flex-wrap gap-1.5">
          {chosen.map((id, index) => (
            <Chip key={`${id}-${index}`} name={nameOf(id) ?? HIDDEN_NAME[record]} hidden={!nameOf(id)} onRemove={() => remove(index)} />
          ))}
        </ul>
      ) : null}
      {multiple || chosen.length === 0 ? (
        <div className="flex flex-col gap-1">
          <input
            type="search"
            aria-label={`${label}: search`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={record === 'customer' ? 'Search organisations' : 'Search accounts'}
            className={`min-h-11 w-56 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong sm:min-h-9 ${FOCUS}`}
          />
          {query && current ? (
            'error' in current ? (
              <p role="alert" className="text-[11px] text-danger">
                {current.error}
              </p>
            ) : (
              <ul aria-label={`${label}: matches`} className="flex max-h-56 w-56 flex-col overflow-y-auto rounded-lg border border-line bg-elevated py-1 shadow-md">
                {current.rows.length === 0 ? (
                  <li className="px-3 py-2 text-[13px] text-ink-muted">No matches</li>
                ) : (
                  current.rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => pick(row)}
                        className={`flex min-h-11 w-full items-center px-3 text-left text-[13px] text-ink hover:bg-subtle sm:min-h-8 ${FOCUS}`}
                      >
                        {row.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

```tsx
// src/components/segments/ValueInput.tsx
import { useState } from 'react';
import { shapeOf, type DraftCondition, type DraftValue } from '../../features/segments/ruleDraft';
import { HIDDEN_NAME } from '../../features/segments/ruleSentence';
import type { FieldDef } from '../../features/segments/segmentFields';
import type { PersonRef, RuleLabels, RuleScalar } from '../../features/segments/segmentTypes';
import { Check } from '../organizations/portfolio/filterParts';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { Chip } from './Chip';
import { RecordPicker } from './RecordPicker';

export interface ValueOptions {
  /** Active people in the workspace (the owner picker). */
  people: PersonRef[];
  products: PersonRef[];
  /** Names for ids: the segment's labels, Save as segment's look-up and the
   *  picker's own picks. */
  labels: RuleLabels;
  onNamed: (group: 'organisations' | 'accounts', id: number, name: string) => void;
}

type Scalar = RuleScalar | undefined;

const BOX = `min-h-11 rounded-lg border bg-surface px-2 text-[13px] text-ink hover:border-line-strong sm:min-h-9 ${FOCUS}`;
const SUFFIX = 'text-[13px] text-ink-muted';
/** The option standing for a record the reader can't open (a saved `null`). */
const HIDDEN_OPTION = '__hidden';

const hiddenName = (field: FieldDef) => HIDDEN_NAME[field.record || 'customer'];

/** A select's choices: a choice list, Unassigned + people, or products. */
function choicesOf(field: FieldDef, options: ValueOptions): { value: string; label: string }[] {
  if (field.type === 'owner') return [{ value: 'unassigned', label: 'Unassigned' }, ...options.people.map((p) => ({ value: String(p.id), label: p.name }))];
  if (field.record === 'product') return options.products.map((p) => ({ value: String(p.id), label: p.name }));
  return field.choices;
}

function decode(field: FieldDef, raw: string): Scalar {
  if (raw === '') return undefined;
  if (raw === HIDDEN_OPTION) return null;
  if (field.type === 'choice') return raw;
  if (field.type === 'owner' && raw === 'unassigned') return raw;
  return Number(raw);
}

/** A saved value no longer offered (a deactivated owner, a retired product). */
function savedName(field: FieldDef, value: string, labels: RuleLabels): string {
  if (field.type === 'owner') return labels.people[value] ?? hiddenName(field);
  if (field.record === 'product') return labels.products[value] ?? hiddenName(field);
  return value;
}

function ScalarInput({ field, options, value, label, invalid, onChange }: {
  field: FieldDef;
  options: ValueOptions;
  value: Scalar;
  label: string;
  invalid: boolean;
  onChange: (value: Scalar) => void;
}) {
  const border = invalid ? 'border-danger' : 'border-line';
  if (field.type === 'number' || field.type === 'percent' || field.type === 'days') {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          aria-label={label}
          step={field.type === 'days' ? 1 : 'any'}
          min={field.type === 'number' ? undefined : 0}
          max={field.type === 'percent' ? 100 : undefined}
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
          className={`${BOX} ${border} w-24 ${MONO}`}
        />
        {field.type === 'percent' ? <span className={SUFFIX}>%</span> : field.type === 'days' ? <span className={SUFFIX}>days</span> : null}
      </span>
    );
  }
  if (field.type === 'date') {
    return (
      <input
        type="date"
        aria-label={label}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={`${BOX} ${border} ${MONO}`}
      />
    );
  }
  if (field.type === 'text') {
    return (
      <input
        type="text"
        aria-label={label}
        maxLength={100}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
        className={`${BOX} ${border} w-40`}
      />
    );
  }
  if (field.type === 'boolean') {
    return (
      <select aria-label={label} value={String(value ?? true)} onChange={(event) => onChange(event.target.value === 'true')} className={`${BOX} ${border}`}>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }
  const items = choicesOf(field, options);
  const encoded = value === null ? HIDDEN_OPTION : value === undefined ? '' : String(value);
  const saved = value !== null && value !== undefined && !items.some((item) => item.value === encoded);
  return (
    <select aria-label={label} value={encoded} onChange={(event) => onChange(decode(field, event.target.value))} className={`${BOX} ${border} max-w-[14rem]`}>
      <option value="">Choose…</option>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
      {value === null ? <option value={HIDDEN_OPTION}>{hiddenName(field)}</option> : null}
      {saved ? <option value={encoded}>{savedName(field, encoded, options.labels)}</option> : null}
    </select>
  );
}

/** Comma-separated text values, kept as typed until the next comma. */
function TextList({ values, label, onChange }: { values: Scalar[]; label: string; onChange: (value: DraftValue) => void }) {
  const [text, setText] = useState(values.filter((v) => typeof v === 'string').join(', '));
  return (
    <input
      type="text"
      aria-label={label}
      placeholder="de, fr, es"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(event.target.value.split(',').map((part) => part.trim()).filter(Boolean));
      }}
      className={`${BOX} border-line w-56`}
    />
  );
}

function ManyInput({ field, options, values, label, onChange }: {
  field: FieldDef;
  options: ValueOptions;
  values: Scalar[];
  label: string;
  onChange: (value: DraftValue) => void;
}) {
  if (field.type === 'choice') {
    return (
      <fieldset aria-label={label} className="flex flex-wrap gap-x-3">
        {field.choices.map((choice) => (
          <Check
            key={choice.value}
            label={choice.label}
            checked={values.includes(choice.value)}
            onChange={() => onChange(values.includes(choice.value) ? values.filter((v) => v !== choice.value) : [...values, choice.value])}
          />
        ))}
      </fieldset>
    );
  }
  if (field.type === 'text') return <TextList values={values} label={label} onChange={onChange} />;
  const items = choicesOf(field, options);
  const nameOf = (v: Scalar) => (v === null ? hiddenName(field) : (items.find((item) => item.value === String(v))?.label ?? savedName(field, String(v), options.labels)));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.length > 0 ? (
        <ul aria-label={label} className="flex flex-wrap gap-1.5">
          {values.map((v, index) => (
            <Chip key={`${String(v)}-${index}`} name={nameOf(v)} hidden={v === null} onRemove={() => onChange(values.filter((_, i) => i !== index))} />
          ))}
        </ul>
      ) : null}
      <select
        aria-label={`${label}: add`}
        value=""
        onChange={(event) => {
          const next = decode(field, event.target.value);
          if (next !== undefined) onChange([...values, next]);
        }}
        className={`${BOX} border-line`}
      >
        <option value="">Add…</option>
        {items
          .filter((item) => !values.some((v) => String(v) === item.value))
          .map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
      </select>
    </div>
  );
}

/** The right input for a condition's field and operator (plan Decision 2):
 *  nothing for is empty / is not empty; a days box for a date window; two
 *  boxes for between; checkboxes, chips or a comma list for "is any of";
 *  a server-searched picker for an organisation or an account. */
export function ValueInput({ field, condition, options, label, invalid, onChange }: {
  field: FieldDef;
  condition: DraftCondition;
  options: ValueOptions;
  label: string;
  invalid: boolean;
  onChange: (value: DraftValue) => void;
}) {
  const shape = shapeOf(condition.op);
  const value = condition.value;
  if (shape === 'none') return null;
  if (field.record === 'customer' || field.record === 'account') {
    return (
      <RecordPicker
        record={field.record}
        multiple={shape === 'many'}
        value={value}
        label={label}
        labels={options.labels}
        onNamed={options.onNamed}
        onChange={onChange}
      />
    );
  }
  if (shape === 'days') {
    return <ScalarInput field={{ ...field, type: 'days' }} options={options} value={Array.isArray(value) ? undefined : value} label={label} invalid={invalid} onChange={onChange} />;
  }
  if (shape === 'many') {
    return <ManyInput field={field} options={options} values={Array.isArray(value) ? value : []} label={label} onChange={onChange} />;
  }
  if (shape === 'two') {
    const pair = Array.isArray(value) && value.length === 2 ? value : [undefined, undefined];
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <ScalarInput field={field} options={options} value={pair[0]} label={`${label} from`} invalid={invalid} onChange={(next) => onChange([next, pair[1]])} />
        <span className={SUFFIX}>and</span>
        <ScalarInput field={field} options={options} value={pair[1]} label={`${label} to`} invalid={invalid} onChange={(next) => onChange([pair[0], next])} />
      </span>
    );
  }
  return <ScalarInput field={field} options={options} value={Array.isArray(value) ? undefined : value} label={label} invalid={invalid} onChange={onChange} />;
}
```

```ts
// src/components/segments/useBuilderOptions.ts
import { useEffect, useState } from 'react';
import { fetchAttributes } from '../../features/attributes/attributesApi';
import type { AIAttribute } from '../../features/attributes/types';
import type { PersonRef } from '../../features/segments/segmentTypes';
import { fetchProducts } from '../../pages/settings/productsApi';

/** The workspace's AI attributes: rule fields, and their names in a
 *  sentence. None until read, and none if the read fails (a rule on one then
 *  reads as its key). */
export function useAttributes(): AIAttribute[] {
  const [attributes, setAttributes] = useState<AIAttribute[]>([]);
  useEffect(() => {
    let alive = true;
    fetchAttributes().then(
      (rows) => {
        if (alive) setAttributes(rows);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  return attributes;
}

/** The product catalogue (GET /products/, open to every member). */
export function useProducts(): PersonRef[] {
  const [products, setProducts] = useState<PersonRef[]>([]);
  useEffect(() => {
    let alive = true;
    fetchProducts().then(
      (rows) => {
        if (alive) setProducts(rows.map(({ id, name }) => ({ id, name })));
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  return products;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --maxWorkers=2 src/components/segments/ValueInput.test.tsx`
Expected: PASS (7 tests).
- The choice list is a `<fieldset aria-label>`, so its role is `group`.
- If `getByLabelText('Condition 1 value')` finds two elements in the date test, the range boxes leaked in; that test uses `lt`, which is one box.

- [ ] **Step 5: Commit**

```bash
git add src/components/segments/Chip.tsx src/components/segments/RecordPicker.tsx src/components/segments/ValueInput.tsx src/components/segments/useBuilderOptions.ts src/components/segments/ValueInput.test.tsx
git commit -m "feat(segments): a value input per field type, with server-searched organisation and account pickers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The rule editor

**Files:**
- Create: `src/components/segments/RuleEditor.tsx`
- Test: `src/components/segments/RuleEditor.test.tsx`

**Interfaces:**
- Consumes: `ValueInput`, `ValueOptions` (Task 7); `addCondition`, `addGroup`, `conditionCount`, `isDraftGroup`, `leaves`, `removeNode`, `setMatch`, `updateCondition`, `withField`, `withOp`, `DraftCondition`, `DraftRules` (Task 4); `opText` (Task 3); `MAX_CONDITIONS`, `operatorsOf`, `FieldDef` (Task 2); `Switch` (`tileParts`); `BUTTON`, `FOCUS` (`styles`).
- Produces:

```ts
export interface RuleEditorProps {
  draft: DraftRules;
  fields: FieldDef[];               // fieldsFor(kind, attributes); the first is "+ Add condition"'s field
  options: ValueOptions;
  invalidUid: string | null;        // the condition Save found unfinished
  error: string | null;             // a save's or the preview's `rules` 400
  onChange: (draft: DraftRules) => void;
}
export function RuleEditor(props: RuleEditorProps): JSX.Element;
```

Names: the match switch is a group "Match" with All / Any; each group's is "Group N match". Rows are `li[data-condition]` with selects "Condition N field" and "Condition N operator", the value named "Condition N value", and "Remove condition N". Groups are `li[data-group]` with "Remove group N" and "Add condition to group".

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/segments/RuleEditor.test.tsx
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fromRules, toRules, type DraftRules } from '../../features/segments/ruleDraft';
import { fieldsFor } from '../../features/segments/segmentFields';
import { NO_LABELS, type Rules } from '../../features/segments/segmentTypes';
import { CARL } from '../../features/segments/testSegments';
import { RuleEditor } from './RuleEditor';

function Harness({ initial, invalid = false, error = null }: { initial: Rules | null; invalid?: boolean; error?: string | null }) {
  const [draft, setDraft] = useState<DraftRules>(() => fromRules(initial));
  const first = draft.conditions[0]?.uid ?? null;
  return (
    <>
      <RuleEditor
        draft={draft}
        fields={fieldsFor('customer', [])}
        options={{ people: [CARL], products: [], labels: NO_LABELS, onNamed: () => {} }}
        invalidUid={invalid ? first : null}
        error={error}
        onChange={setDraft}
      />
      <output data-testid="rules">{JSON.stringify(toRules(draft))}</output>
    </>
  );
}

const rules = () => JSON.parse(screen.getByTestId('rules').textContent ?? '{}') as Rules;
const row = (n: number) => document.querySelectorAll('[data-condition]')[n - 1] as HTMLElement;

describe('RuleEditor', () => {
  it('reads a condition as a row, field then operator then value, and adds one on the first field', async () => {
    render(<Harness initial={{ match: 'all', conditions: [{ field: 'csat_score', op: 'lt', value: 60 }] }} />);
    expect(within(row(1)).getByRole('combobox', { name: 'Condition 1 field' })).toHaveDisplayValue('CSAT %');
    expect(within(row(1)).getByRole('combobox', { name: 'Condition 1 operator' })).toHaveDisplayValue('is less than');
    expect(within(row(1)).getByRole('spinbutton', { name: 'Condition 1 value' })).toHaveValue(60);
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(rules().conditions[1]).toEqual({ field: 'lifecycle_stage', op: 'is' });
  });

  it('offers only the field\'s operators, and starts the value over when the field changes', async () => {
    render(<Harness initial={{ match: 'all', conditions: [{ field: 'csat_score', op: 'lt', value: 60 }] }} />);
    const ops = within(row(1)).getByRole('combobox', { name: 'Condition 1 operator' });
    expect(within(ops).getAllByRole('option').map((o) => o.textContent)).toEqual(['is more than', 'is less than', 'is between', 'is empty', 'is not empty']);
    await userEvent.selectOptions(within(row(1)).getByRole('combobox', { name: 'Condition 1 field' }), 'Renewal date');
    expect(rules().conditions[0]).toEqual({ field: 'renewal_date', op: 'within_next' });
  });

  it('switches all to any, adds a group asking the other way, and removes the group with its last condition', async () => {
    render(<Harness initial={{ match: 'all', conditions: [] }} />);
    await userEvent.click(within(screen.getByRole('group', { name: 'Match' })).getByRole('button', { name: 'Any' }));
    expect(rules().match).toBe('any');
    await userEvent.click(screen.getByRole('button', { name: 'Add group' }));
    const group = document.querySelector('[data-group]') as HTMLElement;
    expect(within(within(group).getByRole('group', { name: 'Group 1 match' })).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'Add condition to group' }));
    expect(rules().conditions).toEqual([{ group: { match: 'all', conditions: [{ field: 'lifecycle_stage', op: 'is' }, { field: 'lifecycle_stage', op: 'is' }] } }]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove condition 1' }));
    expect(rules().conditions).toEqual([]);
    expect(document.querySelector('[data-group]')).toBeNull();
  });

  it('stops adding at 20 conditions and says why', () => {
    const twenty: Rules = { match: 'all', conditions: Array.from({ length: 20 }, () => ({ field: 'arr', op: 'is_empty' as const })) };
    render(<Harness initial={twenty} />);
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add group' })).toBeDisabled();
    expect(screen.getByText('A segment can have at most 20 conditions.')).toBeInTheDocument();
  });

  it('marks the unfinished condition and shows the server\'s rules message', () => {
    render(<Harness initial={{ match: 'all', conditions: [{ field: 'csat_score', op: 'lt' }] }} invalid error='"is" cannot be used with Health score.' />);
    expect(row(1)).toHaveClass('border-danger');
    expect(within(row(1)).getByText('Finish this condition, or remove it.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('"is" cannot be used with Health score.');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/components/segments/RuleEditor.test.tsx`
Expected: FAIL, "Failed to resolve import "./RuleEditor"".

- [ ] **Step 3: Write the editor**

```tsx
// src/components/segments/RuleEditor.tsx
import { useId } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  addCondition,
  addGroup,
  conditionCount,
  isDraftGroup,
  leaves,
  removeNode,
  setMatch,
  updateCondition,
  withField,
  withOp,
  type DraftCondition,
  type DraftRules,
} from '../../features/segments/ruleDraft';
import { opText } from '../../features/segments/ruleSentence';
import { MAX_CONDITIONS, operatorsOf, type FieldDef } from '../../features/segments/segmentFields';
import type { Match, Operator } from '../../features/segments/segmentTypes';
import { BUTTON, FOCUS } from '../organizations/portfolio/styles';
import { Switch } from '../organizations/portfolio/tileParts';
import { ValueInput, type ValueOptions } from './ValueInput';

const MATCHES: { value: Match; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'any', label: 'Any' },
];
const SELECT = `min-h-11 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink hover:border-line-strong disabled:opacity-50 sm:min-h-9 ${FOCUS}`;
const ICON = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink sm:h-8 sm:w-8 ${FOCUS}`;
const SECTIONS = [
  { key: 'own', label: 'Fields' },
  { key: 'parent', label: 'Their organisation or account' },
  { key: 'attribute', label: 'AI attributes' },
] as const;

export interface RuleEditorProps {
  draft: DraftRules;
  /** The kind's fields; the first is what + Add condition starts on. */
  fields: FieldDef[];
  options: ValueOptions;
  /** The condition Save found unfinished. */
  invalidUid: string | null;
  /** A save's or the preview's `rules` 400. */
  error: string | null;
  onChange: (draft: DraftRules) => void;
}

function FieldSelect({ fields, value, label, onChange }: { fields: FieldDef[]; value: string; label: string; onChange: (key: string) => void }) {
  const known = fields.some((field) => field.key === value);
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={`${SELECT} max-w-[16rem]`}>
      {known ? null : <option value={value}>{value}</option>}
      {SECTIONS.map((section) => {
        const inSection = fields.filter((field) => field.section === section.key);
        return inSection.length > 0 ? (
          <optgroup key={section.key} label={section.label}>
            {inSection.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

function ConditionRow({ condition, number, fields, options, invalid, onChange, onRemove }: {
  condition: DraftCondition;
  number: number;
  fields: FieldDef[];
  options: ValueOptions;
  invalid: boolean;
  onChange: (condition: DraftCondition) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === condition.field) ?? null;
  const name = `Condition ${number}`;
  return (
    <li data-condition={condition.uid} className={`flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-2 ${invalid ? 'border-danger' : 'border-line'}`}>
      <FieldSelect
        fields={fields}
        value={condition.field}
        label={`${name} field`}
        onChange={(key) => {
          const next = fields.find((f) => f.key === key);
          if (next) onChange(withField(condition, next));
        }}
      />
      <select
        aria-label={`${name} operator`}
        value={condition.op}
        disabled={!field}
        onChange={(event) => {
          if (field) onChange(withOp(condition, field, event.target.value as Operator));
        }}
        className={SELECT}
      >
        {(field ? operatorsOf(field) : [condition.op]).map((op) => (
          <option key={op} value={op}>
            {opText(op, field)}
          </option>
        ))}
      </select>
      {field ? (
        <ValueInput field={field} condition={condition} options={options} label={`${name} value`} invalid={invalid} onChange={(value) => onChange({ ...condition, value })} />
      ) : null}
      <button type="button" onClick={onRemove} aria-label={`Remove condition ${number}`} className={`${ICON} ml-auto`}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      {invalid ? (
        <p className="basis-full text-[11px] text-danger">
          {field ? 'Finish this condition, or remove it.' : 'This field no longer exists. Choose another, or remove it.'}
        </p>
      ) : null}
    </li>
  );
}

/** The rules as readable rows (spec §3): an All/Any switch, conditions and
 *  one level of groups, + Add condition and + Add group, the right value
 *  input per field. */
export function RuleEditor({ draft, fields, options, invalidUid, error, onChange }: RuleEditorProps) {
  const headingId = useId();
  const full = conditionCount(draft) >= MAX_CONDITIONS;
  const first = fields[0];
  const numbers = new Map(leaves(draft).map((condition, index) => [condition.uid, index + 1]));
  const groupNumbers = new Map(draft.conditions.filter(isDraftGroup).map((group, index) => [group.uid, index + 1]));

  const row = (condition: DraftCondition) => (
    <ConditionRow
      key={condition.uid}
      condition={condition}
      number={numbers.get(condition.uid) ?? 0}
      fields={fields}
      options={options}
      invalid={condition.uid === invalidUid}
      onChange={(next) => onChange(updateCondition(draft, condition.uid, () => next))}
      onRemove={() => onChange(removeNode(draft, condition.uid))}
    />
  );

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3 rounded-xl bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-[15px] font-semibold text-ink">
          Rules
        </h2>
        <Switch label="Match" options={MATCHES} value={draft.match} onChange={(match) => onChange(setMatch(draft, match))} />
      </div>
      <p className="text-[13px] text-ink-muted">{draft.match === 'all' ? 'Members match every condition.' : 'Members match at least one condition.'}</p>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      {draft.conditions.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No conditions yet. With none, only pinned records are members.</p>
      ) : (
        <ul aria-label="Conditions" className="flex flex-col gap-2">
          {draft.conditions.map((node) => {
            if (!isDraftGroup(node)) return row(node);
            const n = groupNumbers.get(node.uid) ?? 0;
            return (
              <li key={node.uid} data-group={node.uid} className="flex flex-col gap-2 rounded-lg bg-subtle p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">Group</span>
                  <Switch label={`Group ${n} match`} options={MATCHES} value={node.match} onChange={(match) => onChange(setMatch(draft, match, node.uid))} />
                  <span className="text-[11px] text-ink-muted">{node.match === 'all' ? 'every one of these' : 'any one of these'}</span>
                  <button type="button" onClick={() => onChange(removeNode(draft, node.uid))} aria-label={`Remove group ${n}`} className={`${ICON} ml-auto`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <ul className="flex flex-col gap-2">{node.conditions.map(row)}</ul>
                <button type="button" disabled={full} onClick={() => onChange(addCondition(draft, first, node.uid))} className={`${BUTTON} self-start`}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add condition to group
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={full} onClick={() => onChange(addCondition(draft, first))} className={BUTTON}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add condition
        </button>
        <button type="button" disabled={full} onClick={() => onChange(addGroup(draft, first))} className={BUTTON}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add group
        </button>
        {full ? <span className="text-[11px] text-ink-muted">A segment can have at most {MAX_CONDITIONS} conditions.</span> : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --maxWorkers=2 src/components/segments/RuleEditor.test.tsx`
Expected: PASS (5 tests). In the third test the group's switch reads All because `addGroup` asks the other question of an "any" rule.

- [ ] **Step 5: Commit**

```bash
git add src/components/segments/RuleEditor.tsx src/components/segments/RuleEditor.test.tsx
git commit -m "feat(segments): the rule editor: readable rows, All/Any, one level of groups, 20 at most

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The live preview

**Files:**
- Create: `src/components/segments/usePreview.ts`
- Create: `src/components/segments/PreviewPanel.tsx`
- Test: `src/components/segments/usePreview.test.tsx`, `src/components/segments/PreviewPanel.test.tsx`

**Interfaces:**
- Consumes: `previewSegment` (Task 1); `rulesMessage` (Task 4); `KIND_NOUN` (Task 2); `summaryFigures` (Task 6); `ItemSkeleton` (`PortfolioSections`); `MONO`.
- Produces:

```ts
// usePreview.ts
export const PREVIEW_DEBOUNCE_MS = 400;
export type PreviewState =
  | { status: 'incomplete' }
  | { status: 'loading'; last: PreviewResponse | null }
  | { status: 'ready'; data: PreviewResponse }
  | { status: 'error'; message: string };
export function usePreview(request: PreviewRequest | null): PreviewState;   // null: a condition is unfinished
// PreviewPanel.tsx
export function PreviewPanel({ kind, state }: { kind: SegmentKind; state: PreviewState }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/segments/usePreview.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ApiError } from '../../lib/apiClient';
import * as api from '../../features/segments/segmentApi';
import type { PreviewRequest, PreviewResponse } from '../../features/segments/segmentTypes';
import { summaryOf } from '../../features/segments/testSegments';
import { PREVIEW_DEBOUNCE_MS, usePreview } from './usePreview';

vi.mock('../../features/segments/segmentApi');

const request = (value: number): PreviewRequest => ({ kind: 'customer', rules: { match: 'all', conditions: [{ field: 'csat_score', op: 'lt', value }] } });
const answer = (count: number): PreviewResponse => ({ kind: 'customer', count, results: [], summary: summaryOf(count, 'customer') });

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('usePreview (plan Decision 3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(api.previewSegment).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('asks nothing while a condition is unfinished', async () => {
    const { result } = renderHook(() => usePreview(null));
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS * 2);
    });
    expect(result.current).toEqual({ status: 'incomplete' });
    expect(api.previewSegment).not.toHaveBeenCalled();
  });

  it('asks once, 400ms after the last change, with the last rules', async () => {
    vi.mocked(api.previewSegment).mockResolvedValue(answer(41));
    const { result, rerender } = renderHook(({ r }) => usePreview(r), { initialProps: { r: request(50) } });
    rerender({ r: request(55) });
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS - 1);
    });
    rerender({ r: request(60) });
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    });
    expect(api.previewSegment).toHaveBeenCalledTimes(1);
    expect(api.previewSegment).toHaveBeenCalledWith(request(60));
    expect(result.current).toEqual({ status: 'ready', data: answer(41) });
  });

  it('drops an answer a newer request superseded, keeping the last good one on screen meanwhile', async () => {
    const first = deferred<PreviewResponse>();
    const second = deferred<PreviewResponse>();
    vi.mocked(api.previewSegment).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ r }) => usePreview(r), { initialProps: { r: request(50) } });
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    });
    rerender({ r: request(60) });
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    });
    await act(async () => {
      second.resolve(answer(12));
    });
    expect(result.current).toEqual({ status: 'ready', data: answer(12) });
    await act(async () => {
      first.resolve(answer(99));
    });
    expect(result.current).toEqual({ status: 'ready', data: answer(12) });
    rerender({ r: request(70) });
    expect(result.current).toEqual({ status: 'loading', last: answer(12) });
  });

  it('reads a refusal as its rules message', async () => {
    vi.mocked(api.previewSegment).mockRejectedValue(new ApiError(400, { rules: ['"is" cannot be used with Health score.'] }, 'x'));
    const { result } = renderHook(() => usePreview(request(50)));
    await act(async () => {
      vi.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    });
    expect(result.current).toEqual({ status: 'error', message: '"is" cannot be used with Health score.' });
  });
});
```

```tsx
// src/components/segments/PreviewPanel.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { summaryOf } from '../../features/segments/testSegments';
import { PreviewPanel } from './PreviewPanel';

const data = {
  kind: 'customer' as const,
  count: 41,
  results: [
    { id: 7, name: 'Pizza Hut', owner: { id: 4, name: 'Carl CSM' }, health: { score: 4.9, category: 'average' as const } },
    { id: 2, name: 'Initech', owner: null, health: { score: 3, category: 'poor' as const } },
  ],
  summary: { ...summaryOf(41, 'customer'), entered_7d: null, left_7d: null },
};

describe('PreviewPanel', () => {
  it('says how many match, lists the first ones, the rest as a number, and the totals', () => {
    render(<PreviewPanel kind="customer" state={{ status: 'ready', data }} />);
    expect(document.querySelector('[data-part="match-count"]')).toHaveTextContent('41 organisations match');
    const first = screen.getByRole('list', { name: 'First matches' });
    expect(within(first).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Pizza HutCarl CSM', 'InitechUnassigned']);
    expect(screen.getByText('39')).toHaveClass('font-mono-brand');
    expect(screen.getByText('ARR covered').nextSibling).toHaveTextContent('$512K');
    expect(screen.queryByText('Last 7 days')).not.toBeInTheDocument();
  });

  it('asks for finished conditions, and for fixed rules after a refusal, instead of a count', () => {
    const { unmount } = render(<PreviewPanel kind="contact" state={{ status: 'incomplete' }} />);
    expect(screen.getByText('Finish each condition to see who matches.')).toBeInTheDocument();
    unmount();
    render(<PreviewPanel kind="contact" state={{ status: 'error', message: 'x' }} />);
    expect(screen.getByText('Fix the rules to see who matches.')).toBeInTheDocument();
  });

  it('keeps the last answer, dimmed and busy, while a newer one loads', () => {
    render(<PreviewPanel kind="customer" state={{ status: 'loading', last: data }} />);
    expect(screen.getByRole('region', { name: 'Preview' })).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('[data-part="match-count"]')?.parentElement).toHaveClass('opacity-60');
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run --maxWorkers=2 src/components/segments/usePreview.test.tsx src/components/segments/PreviewPanel.test.tsx`
Expected: FAIL, "Failed to resolve import "./usePreview"" and "./PreviewPanel".

- [ ] **Step 3: Write the hook and the panel**

```ts
// src/components/segments/usePreview.ts
import { useEffect, useRef, useState } from 'react';
import { previewSegment } from '../../features/segments/segmentApi';
import { rulesMessage } from '../../features/segments/segmentErrors';
import type { PreviewRequest, PreviewResponse } from '../../features/segments/segmentTypes';

export const PREVIEW_DEBOUNCE_MS = 400;

export type PreviewState =
  | { status: 'incomplete' }
  | { status: 'loading'; last: PreviewResponse | null }
  | { status: 'ready'; data: PreviewResponse }
  | { status: 'error'; message: string };

type Answer = { key: string; data: PreviewResponse } | { key: string; error: string };

/** The builder's live preview (plan Decision 3): POST /segments/preview/
 *  400ms after the last change, never while a condition is unfinished
 *  (`request` null). Each request is keyed by its body and an answer counts
 *  only while its key is the latest, so a superseded one is dropped; a
 *  pending debounce is cleared on every change. */
export function usePreview(request: PreviewRequest | null): PreviewState {
  const key = request ? JSON.stringify(request) : null;
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [last, setLast] = useState<PreviewResponse | null>(null);
  const latest = useRef<string | null>(null);

  useEffect(() => {
    latest.current = key;
    if (!key) return;
    const body = JSON.parse(key) as PreviewRequest;
    const timer = window.setTimeout(() => {
      previewSegment(body).then(
        (data) => {
          if (latest.current !== key) return;
          setAnswer({ key, data });
          setLast(data);
        },
        (err: unknown) => {
          if (latest.current === key) setAnswer({ key, error: rulesMessage(err) });
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  if (!key) return { status: 'incomplete' };
  if (answer?.key === key) return 'data' in answer ? { status: 'ready', data: answer.data } : { status: 'error', message: answer.error };
  return { status: 'loading', last };
}
```

```tsx
// src/components/segments/PreviewPanel.tsx
import { useId } from 'react';
import { KIND_NOUN } from '../../features/segments/segmentFields';
import type { SegmentKind } from '../../features/segments/segmentTypes';
import { summaryFigures } from '../../features/segments/summaryFigures';
import { ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { MONO } from '../organizations/portfolio/styles';
import type { PreviewState } from './usePreview';

/** Beside the rules (stacked on phones): "41 organisations match", the
 *  first ten, and the totals (spec §3). */
export function PreviewPanel({ kind, state }: { kind: SegmentKind; state: PreviewState }) {
  const headingId = useId();
  const noun = KIND_NOUN[kind];
  const data = state.status === 'ready' ? state.data : state.status === 'loading' ? state.last : null;
  let body;
  if (state.status === 'incomplete') {
    body = <p className="text-[13px] text-ink-muted">Finish each condition to see who matches.</p>;
  } else if (state.status === 'error') {
    body = <p className="text-[13px] text-ink-muted">Fix the rules to see who matches.</p>;
  } else if (!data) {
    body = <ItemSkeleton count={3} label="Loading preview" avatar={false} />;
  } else {
    body = (
      <div className={`flex flex-col gap-2 ${state.status === 'loading' ? 'opacity-60' : ''}`}>
        <p data-part="match-count" className="text-[15px] font-semibold text-ink">
          <span className={MONO}>{data.count}</span> {data.count === 1 ? noun.one : noun.many} match
        </p>
        {data.results.length > 0 ? (
          <ul aria-label="First matches" className="flex flex-col divide-y divide-line-subtle">
            {data.results.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-2 py-1.5">
                <span className="truncate text-[13px] text-ink">{row.name}</span>
                <span className="shrink-0 truncate text-[11px] text-ink-muted">
                  {'role' in row ? `${row.role} · ${row.parent.name}` : (row.owner?.name ?? 'Unassigned')}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {data.count > data.results.length ? (
          <p className="text-[11px] text-ink-muted">
            and <span className={MONO}>{data.count - data.results.length}</span> more
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-2 border-t border-line-subtle pt-2">
          {summaryFigures(data.summary, kind).map((figure) => (
            <div key={figure.key}>
              <dt className="text-[11px] text-ink-muted">{figure.label}</dt>
              <dd className={`${MONO} text-[13px] text-ink`}>{figure.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return (
    <section aria-labelledby={headingId} aria-busy={state.status === 'loading'} className="flex min-w-0 flex-col gap-3 rounded-xl bg-surface p-3">
      <h2 id={headingId} className="text-[15px] font-semibold text-ink">
        Preview
      </h2>
      {body}
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/components/segments/usePreview.test.tsx src/components/segments/PreviewPanel.test.tsx`
Expected: PASS (4 + 3 tests). To show the stale-answer test can fail, delete `if (latest.current !== key) return;` and run it again: the last expectation then reads 99. Put the line back.

- [ ] **Step 5: Commit**

```bash
git add src/components/segments/usePreview.ts src/components/segments/usePreview.test.tsx src/components/segments/PreviewPanel.tsx src/components/segments/PreviewPanel.test.tsx
git commit -m "feat(segments): the builder's live preview, debounced, latest answer wins

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The Segments list

**Files:**
- Create: `src/components/segments/SizeSparkline.tsx`
- Create: `src/components/segments/SegmentRow.tsx`
- Create: `src/pages/segments/SegmentsList.tsx`
- Create: `src/pages/segments/testPages.tsx`
- Test: `src/pages/segments/SegmentsList.test.tsx`

**Interfaces:**
- Consumes: `fetchSegments` (Task 1); `KIND_LABEL` (Task 2); `parseListParams`, `toListSearch`, `SCOPES` (Task 6); `movesText`, `OWNER_ONLY` (Task 6); `OrganizationsFrame`; `ToolbarSearch` (`toolbarParts`); `useSearchText`; `Switch` (`tileParts`); `EmptyState`, `ErrorBlock`, `ItemSkeleton` (`PortfolioSections`); `errorMessage`; `FOCUS`, `MONO`, `PRIMARY`, `QUIET`; `SM`, `useMediaQuery`; test helpers `Where` (`pages/organizations/testList`), `setViewport`, `ALL_CAPABILITIES`, `SlotHost`.
- Produces:

```ts
// SizeSparkline.tsx
export function SizeSparkline({ sizes }: { sizes: number[] }): JSX.Element;      // role="img", "Size over 30 days: 38 to 41"
// SegmentRow.tsx
export function SegmentRow({ row }: { row: SegmentListRow }): JSX.Element;       // <li data-segment={id}>
// SegmentsList.tsx
export function SegmentsList(): JSX.Element;
// testPages.tsx (test only)
export function makeSegmentsStore(): Store;                                      // auth (Alice, id 1), customers, notifications, files, calls
export function renderInApp(ui: ReactNode, opts?: { url?: string; width?: number }): { store };
export function renderSegments(url: string, opts?: { width?: number; nav?: boolean }): { store };
```

`renderSegments` routes `/segments` here. Task 11 adds `/segments/new` and `/segments/:id/edit`, Task 14 adds `/segments/:id`, and Task 16 adds `/organizations/list`. Each route renders the page plus `<Where />`; anything else renders `<Where />` alone.

- [ ] **Step 1: Write the harness and the failing test**

```tsx
// src/pages/segments/testPages.tsx
// Test-only helpers, never hot-reloaded.
/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import callsReducer from '../../features/calls/callsSlice';
import customersReducer from '../../features/customers/customersSlice';
import filesReducer from '../../features/files/filesSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { Navbar } from '../../components/layout/Navbar';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { SegmentsList } from './SegmentsList';

// Test-only. The Segments routes on the real store and router, as App.tsx
// routes them. Only fetch is stubbed, by the caller (stubSegments). The
// signed-in user is Alice, id 1 (testSegments' ME).

export function makeSegmentsStore() {
  return configureStore({
    reducer: { auth: authReducer, customers: customersReducer, notifications: notificationsReducer, files: filesReducer, calls: callsReducer },
    preloadedState: {
      auth: {
        user: {
          id: 1,
          email: 'alice@acme.io',
          name: 'Alice',
          avatar: '',
          role: 'admin' as const,
          role_id: 1,
          role_name: 'Admin',
          permissions: ALL_CAPABILITIES,
          function: 'cs' as const,
          function_display: 'Customer Success',
          reports_to: null,
          organisation: {
            id: 1,
            name: 'Acme Inc',
            slug: 'acme-inc',
            currency: 'USD' as const,
            currency_display: 'US Dollar ($)',
            default_lifecycle_stage: '',
            ai_agent_enabled: true,
            ai_agent_tone: 'professional' as const,
            ai_agent_tone_display: 'Professional',
          },
          is_active: true,
        },
        accessToken: 'token',
        refreshToken: 'refresh',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
    },
  });
}

/** One component on the real store and a router at `url`. */
export function renderInApp(ui: ReactNode, { url = '/', width = 1440 }: { url?: string; width?: number } = {}) {
  setViewport(width);
  const store = makeSegmentsStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="*" element={<>{ui}<Where /></>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

/** The Segments pages at `url`; `nav` adds the real Navbar. */
export function renderSegments(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeSegmentsStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route path="/segments" element={<><SegmentsList /><Where /></>} />
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

```tsx
// src/pages/segments/SegmentsList.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requests, stubSegments } from '../../features/segments/testSegments';
import { resetViewport } from '../../test/viewport';
import { renderSegments } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const row = (id: number) => document.querySelector(`[data-segment="${id}"]`) as HTMLElement;

describe('/segments (spec §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows each segment\'s kind, owner, count, today\'s change and 30-day size, with a badge when shared', async () => {
    stubSegments();
    renderSegments('/segments');
    const mine = await waitFor(() => row(7));
    expect(within(mine).getByRole('link', { name: 'Renewal risk' })).toHaveAttribute('href', '/segments/7');
    expect(mine).toHaveTextContent('Organisations · You');
    expect(within(mine).getByText('Workspace')).toBeInTheDocument();
    expect(within(mine).getByText('3')).toHaveClass('font-mono-brand');
    expect(within(mine).getByText('+3 / −1')).toHaveClass('font-mono-brand');
    expect(within(mine).getByRole('img', { name: 'Size over 30 days: 1 to 3' })).toBeInTheDocument();
    expect(row(9)).toHaveTextContent('Contacts · You');
    expect(within(row(9)).queryByText('Shared')).not.toBeInTheDocument();
  });

  it('shows a dash, never a guess, for the owner\'s figures on a segment shared with me', async () => {
    stubSegments();
    renderSegments('/segments');
    const shared = await waitFor(() => row(8));
    expect(shared).toHaveTextContent('Accounts · Carl CSM');
    expect(within(shared).getByText('Shared')).toBeInTheDocument();
    expect(within(shared).getAllByText('—')).toHaveLength(3);
    expect(within(shared).getAllByText('Only the owner sees this figure')).toHaveLength(3);
    expect(within(shared).queryByRole('img')).not.toBeInTheDocument();
  });

  it('switches between All, Mine and Shared with me in the URL, asking the server for each', async () => {
    const spy = stubSegments();
    renderSegments('/segments');
    await waitFor(() => row(7));
    await userEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Shared with me' }));
    await waitFor(() => expect(where()).toBe('/segments?scope=shared'));
    await waitFor(() => expect(row(7)).toBeNull());
    expect(row(8)).not.toBeNull();
    expect(requests(spy, 'GET', /^\/segments\/$/).map((r) => r.query.get('scope'))).toEqual([null, 'shared']);
  });

  it('searches by name once typing stops', async () => {
    const spy = stubSegments();
    renderSegments('/segments');
    await waitFor(() => row(7));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search segments by name' }), 'champ');
    await waitFor(() => expect(where()).toBe('/segments?search=champ'));
    await waitFor(() => expect(row(7)).toBeNull());
    expect(row(9)).not.toBeNull();
    expect(requests(spy, 'GET', /^\/segments\/$/).at(-1)?.query.get('search')).toBe('champ');
  });

  it('explains what a segment is when there are none, with New segment and the Organizations shortcut', async () => {
    stubSegments({ segments: [] });
    renderSegments('/segments');
    expect(await screen.findByText('No segments yet')).toBeInTheDocument();
    expect(screen.getByText(/A segment is a saved group of organisations, accounts or contacts/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'New segment' });
    expect(links.every((link) => link.getAttribute('href') === '/segments/new')).toBe(true);
    expect(screen.getByRole('link', { name: 'Filter Organizations, then Save as segment' })).toHaveAttribute('href', '/organizations/list');
  });

  it('says so when nothing matches a search, and Clear search clears it', async () => {
    stubSegments();
    renderSegments('/segments?search=zzz');
    expect(await screen.findByText('No segments match "zzz"')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(where()).toBe('/segments'));
  });

  it('shows the failure with Try again, and the list once it works', async () => {
    let fail = true;
    stubSegments({ list: () => (fail ? { status: 500, body: { detail: 'Server error.' } } : { status: 200, body: [] }) });
    renderSegments('/segments');
    expect(await screen.findByText('Server error.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No segments yet')).toBeInTheDocument();
  });
});
```

The empty state has two "New segment" links: the toolbar's and its own. The test checks both.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/segments/SegmentsList.test.tsx`
Expected: FAIL, "Failed to resolve import "./SegmentsList"".

- [ ] **Step 3: Write the sparkline, the row and the page**

```tsx
// src/components/segments/SizeSparkline.tsx
/** A segment's size over its last 30 days (oldest first), scaled to its own
 *  range; level when it never moved, dashed before any history. */
export function SizeSparkline({ sizes }: { sizes: number[] }) {
  const width = 64;
  const height = 20;
  const low = Math.min(...sizes);
  const high = Math.max(...sizes);
  const y = (size: number) => (high === low ? height / 2 : height - 2 - ((size - low) / (high - low)) * (height - 4));
  const points =
    sizes.length < 2 ? '' : sizes.map((size, i) => `${((i / (sizes.length - 1)) * width).toFixed(1)},${y(size).toFixed(1)}`).join(' ');
  const label = sizes.length > 0 ? `Size over 30 days: ${sizes[0]} to ${sizes[sizes.length - 1]}` : 'No size history yet';
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 text-ink-muted">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-5 w-16" aria-hidden="true">
        {points ? (
          <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeDasharray="2 3" />
        )}
      </svg>
    </span>
  );
}
```

```tsx
// src/components/segments/SegmentRow.tsx
import { Link } from 'react-router-dom';
import { KIND_LABEL } from '../../features/segments/segmentFields';
import type { SegmentListRow } from '../../features/segments/segmentTypes';
import { movesText, OWNER_ONLY } from '../../features/segments/summaryFigures';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { SizeSparkline } from './SizeSparkline';

const BADGE = 'shrink-0 rounded-full bg-subtle px-1.5 text-[11px] font-semibold text-ink-muted';
const SHARING_BADGE = { private: null, workspace: 'Workspace', people: 'Shared' } as const;

/** "—" where the figure is the owner's alone (Ruling S8). */
function OwnerOnly() {
  return (
    <span className={`${MONO} text-[13px] text-ink-muted`}>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{OWNER_ONLY}</span>
    </span>
  );
}

/** One segment in the list (spec §3), a rounded row, never a table row:
 *  name with its sharing and paused badges, kind and owner under it, then
 *  the member count, today's change and the 30-day size. Phones wrap the
 *  figures under the name. */
export function SegmentRow({ row }: { row: SegmentListRow }) {
  const badge = SHARING_BADGE[row.sharing];
  return (
    <li data-segment={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-surface px-3 py-2.5">
      <div className="min-w-0 flex-1 basis-56">
        <span className="flex min-w-0 items-center gap-1.5">
          <Link to={`/segments/${row.id}`} className={`flex min-h-11 min-w-0 items-center rounded-sm text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
            <span className="truncate">{row.name}</span>
          </Link>
          {badge ? <span className={BADGE}>{badge}</span> : null}
          {row.paused ? <span className={BADGE}>Paused</span> : null}
        </span>
        <p className="truncate text-[11px] text-ink-muted">
          {KIND_LABEL[row.kind]} · {row.is_owner ? 'You' : row.owner.name}
        </p>
      </div>
      <span data-part="count" className="flex w-20 flex-col">
        {row.member_count === null ? <OwnerOnly /> : <span className={`${MONO} text-[13px] text-ink`}>{row.member_count}</span>}
        <span className="text-[11px] text-ink-muted">members</span>
      </span>
      <span data-part="today" className="flex w-20 flex-col">
        {row.today === null ? <OwnerOnly /> : <span className={`${MONO} text-[13px] text-ink`}>{movesText(row.today)}</span>}
        <span className="text-[11px] text-ink-muted">today</span>
      </span>
      <span data-part="sparkline" className="flex w-16 items-center">
        {row.sparkline === null ? <OwnerOnly /> : <SizeSparkline sizes={row.sparkline} />}
      </span>
    </li>
  );
}
```

```tsx
// src/pages/segments/SegmentsList.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchSegments } from '../../features/segments/segmentApi';
import { parseListParams, SCOPES, toListSearch, type ListParams } from '../../features/segments/segmentParams';
import type { SegmentListRow } from '../../features/segments/segmentTypes';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { EmptyState, ErrorBlock, ItemSkeleton } from '../../components/organizations/portfolio/PortfolioSections';
import { PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { Switch } from '../../components/organizations/portfolio/tileParts';
import { ToolbarSearch } from '../../components/organizations/portfolio/toolbarParts';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { useSearchText } from '../../components/organizations/portfolio/useSearchText';
import { SegmentRow } from '../../components/segments/SegmentRow';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

type Answer = { key: string; rows: SegmentListRow[] } | { key: string; error: string };

/** /segments (spec §3): Mine, Shared with me and All, a search box and
 *  + New segment, then a row per segment. Scope and search live in the URL. */
export function SegmentsList() {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseListParams(search), [search]);
  const update = useCallback((patch: Partial<ListParams>) => setSearch(toListSearch({ ...params, ...patch }), { replace: true }), [params, setSearch]);
  const commitSearch = useCallback((text: string) => update({ search: text }), [update]);
  const [text, setText] = useSearchText(params.search, commitSearch);
  const searchRef = useRef<HTMLInputElement>(null);
  const isSm = useMediaQuery(SM);

  const [attempt, setAttempt] = useState(0);
  const key = `${params.scope}#${params.search}#${attempt}`;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSegments(params.scope, params.search).then(
      (rows) => {
        if (alive) setAnswer({ key, rows });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, error: errorMessage(err, 'Could not load segments.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, params.scope, params.search]);

  // The last list stays while a new scope or search loads.
  const rows = answer && 'rows' in answer ? answer.rows : null;
  const error = answer && 'error' in answer && answer.key === key ? answer.error : null;
  const loading = answer?.key !== key;

  let body;
  if (error && !rows) {
    body = <ErrorBlock message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  } else if (!rows) {
    body = <ItemSkeleton count={4} label="Loading segments" avatar={false} />;
  } else if (rows.length === 0 && params.search) {
    body = (
      <EmptyState
        title={`No segments match "${params.search}"`}
        detail="Try another name, or clear the search."
        action={
          <button type="button" onClick={() => update({ search: '' })} className={`${QUIET} border border-line`}>
            Clear search
          </button>
        }
      />
    );
  } else if (rows.length === 0 && params.scope === 'shared') {
    body = <EmptyState title="Nothing is shared with you yet" detail="When a teammate shares a segment with you or the workspace, it shows here." action={null} />;
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        title="No segments yet"
        detail="A segment is a saved group of organisations, accounts or contacts that match your rules. It updates itself as they change, and can tell you each day who entered and who left."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/segments/new" className={PRIMARY}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New segment
            </Link>
            <Link to="/organizations/list" className={`${QUIET} border border-line`}>
              Filter Organizations, then Save as segment
            </Link>
          </div>
        }
      />
    );
  } else {
    body = (
      <ul aria-label="Segments" aria-busy={loading} className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <SegmentRow key={row.id} row={row} />
        ))}
      </ul>
    );
  }

  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Switch label="Show" options={SCOPES} value={params.scope} onChange={(scope) => update({ scope })} />
          <ToolbarSearch label="Search segments by name" searchRef={searchRef} value={text} onChange={setText} isSm={isSm} />
          <Link to="/segments/new" className={`${PRIMARY} sm:ml-auto`}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New segment
          </Link>
        </div>
        {error && rows ? (
          <p role="alert" className="text-[13px] text-danger">
            {error} Showing the last result.
          </p>
        ) : null}
        {body}
      </div>
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --maxWorkers=2 src/pages/segments/SegmentsList.test.tsx`
Expected: PASS (7 tests). `ErrorBlock` shows the message from `errorMessage` (the `ApiError`'s `detail`, "Server error.").

- [ ] **Step 5: Commit**

```bash
git add src/components/segments/SizeSparkline.tsx src/components/segments/SegmentRow.tsx src/pages/segments/SegmentsList.tsx src/pages/segments/testPages.tsx src/pages/segments/SegmentsList.test.tsx
git commit -m "feat(segments): the Segments list: Mine, Shared with me and All, search, rows with the owner's figures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Sharing, and the builder page

**Files:**
- Create: `src/components/segments/SharingFields.tsx`
- Create: `src/components/segments/useSegment.ts`
- Create: `src/components/segments/SegmentStates.tsx`
- Create: `src/pages/segments/Builder.tsx`
- Modify: `src/pages/segments/testPages.tsx` (two routes)
- Test: `src/pages/segments/Builder.test.tsx`

**Interfaces:**
- Consumes:
  - from Task 1: `createSegment`, `updateSegment`, `duplicateSegment`, `fetchSegment`, `fetchRecordNames`;
  - from Task 2: `fieldsFor`, `KIND_LABEL`;
  - from Task 4: `fromRules`, `toRules`, `firstIncomplete`, `formErrors`;
  - from Task 5: `rulesFromList`;
  - from Tasks 7–9: `RuleEditor`, `PreviewPanel`, `usePreview`, `useAttributes`, `useProducts`, `Chip`, `ValueOptions`;
  - shared: `useMembers` (`features/knowledge/useMembers`), `useAppSelector`, `Radio`, `FILTER_SELECT` (`filterParts`), `EmptyState`, `ErrorBlock`, `ItemSkeleton`, `PRIMARY`, `QUIET`, `FOCUS`, `errorMessage`, `ApiError`, `OrganizationsFrame`.
- Produces:

```ts
// SharingFields.tsx
export function SharingFields(props: { sharing: Sharing; sharedWith: PersonRef[]; teammates: PersonRef[]; error: string | null; onChange: (sharing: Sharing, sharedWith: PersonRef[]) => void }): JSX.Element;
// useSegment.ts
export type SegmentLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; segment: Segment };
export function useSegment(id: number): [SegmentLoad, (segment: Segment) => void, () => void];  // [load, replace, retry]
// SegmentStates.tsx
export function SegmentLoading(): JSX.Element;
export function SegmentMissing(): JSX.Element;                       // "Segment not found", link "All segments"
export function SegmentFailed(props: { message: string; onRetry: () => void }): JSX.Element;
// Builder.tsx
export function Builder(): JSX.Element;   // /segments/new (reads ?kind= and a list's filters) and /segments/:id/edit
```

- [ ] **Step 1: Add the builder routes to the harness**

In `src/pages/segments/testPages.tsx`, add `import { Builder } from './Builder';` and, in `renderSegments`'s `<Routes>` after the `/segments` route:

```tsx
            <Route path="/segments/new" element={<><Builder /><Where /></>} />
            <Route path="/segments/:id/edit" element={<><Builder /><Where /></>} />
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/pages/segments/Builder.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { RENEWAL_RISK, requests, stubSegments } from '../../features/segments/testSegments';
import { resetViewport } from '../../test/viewport';
import { renderSegments } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const row = (n: number) => document.querySelectorAll('[data-condition]')[n - 1] as HTMLElement;
const matchCount = () => document.querySelector('[data-part="match-count"]');

describe('the segment builder (spec §3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('creates a segment from its basics, rules, sharing and alert, previewing it on the way, then opens it', async () => {
    const spy = stubSegments();
    renderSegments('/segments/new');
    expect(screen.getByRole('heading', { name: 'New segment' })).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Renewals');
    expect(screen.getByRole('radio', { name: 'Organisations' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(screen.getByText('Finish each condition to see who matches.')).toBeInTheDocument();
    await userEvent.selectOptions(within(row(1)).getByRole('combobox', { name: 'Condition 1 value' }), 'Renewal');
    await waitFor(() => expect(matchCount()).toHaveTextContent('3 organisations match'));
    await userEvent.click(screen.getByRole('radio', { name: 'Chosen teammates' }));
    await screen.findByRole('option', { name: 'Dana CSM' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Add a teammate' }), 'Dana CSM');
    expect(within(screen.getByRole('list', { name: 'Shared with' })).getByText('Dana CSM')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Alert me on changes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    await waitFor(() => expect(where()).toBe('/segments/100'));
    expect(requests(spy, 'POST', /^\/segments\/$/)[0].body).toEqual({
      name: 'Renewals',
      kind: 'customer',
      description: '',
      rules: { match: 'all', conditions: [{ field: 'lifecycle_stage', op: 'is', value: 'renewal' }] },
      sharing: 'people',
      shared_with: [5],
      alert_on_changes: true,
    });
  });

  it('starts from a list\'s filters, names the organisation they named, and says what did not carry over', async () => {
    stubSegments();
    renderSegments('/segments/new?kind=account&organisation=7&search=piz');
    expect(screen.getByRole('radio', { name: 'Accounts' })).toBeChecked();
    expect(
      within(screen.getByRole('list', { name: 'From the list' })).getByText('The search "piz" isn\'t carried over: a segment has no search rule.'),
    ).toBeInTheDocument();
    expect(within(row(1)).getByRole('combobox', { name: 'Condition 1 field' })).toHaveDisplayValue('Organisation');
    expect(await within(row(1)).findByText('Pizza Hut')).toBeInTheDocument();
  });

  it('asks for a name and a finished condition before saving, and sends nothing until then', async () => {
    const spy = stubSegments();
    renderSegments('/segments/new');
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    expect(screen.getByText('Give the segment a name.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true');
    expect(row(1)).toHaveClass('border-danger');
    expect(within(row(1)).getByText('Finish this condition, or remove it.')).toBeInTheDocument();
    expect(requests(spy, 'POST', /^\/segments\/$/)).toEqual([]);
  });

  it('shows the server\'s refusals at the fields they name, and the 50-segment limit above the form', async () => {
    let answer: { status: number; body: unknown } = {
      status: 400,
      body: { name: ['Ensure this field has no more than 120 characters.'], rules: ['"is" cannot be used with Health score.'] },
    };
    stubSegments({ create: () => answer });
    renderSegments('/segments/new');
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Too long');
    await userEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    expect(await screen.findByText('Ensure this field has no more than 120 characters.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Rules' })).getByRole('alert')).toHaveTextContent('"is" cannot be used with Health score.');
    answer = { status: 400, body: { detail: 'You can own at most 50 segments.' } };
    await userEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    expect(await screen.findByText('You can own at most 50 segments.')).toHaveAttribute('role', 'alert');
    expect(where()).toBe('/segments/new');
  });

  it('edits a segment I own, showing its kind as fixed and never sending it', async () => {
    const spy = stubSegments();
    renderSegments('/segments/7/edit');
    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Renewal risk');
    expect(screen.getByText(/A segment's kind can't change\./)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Accounts' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Everyone in the workspace' })).toBeChecked();
    await userEvent.clear(name);
    await userEvent.type(name, 'Renewal risk Q4');
    await userEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    await waitFor(() => expect(where()).toBe('/segments/7'));
    const body = requests(spy, 'PATCH', /^\/segments\/7\/$/)[0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty('kind');
    expect(body).toMatchObject({ name: 'Renewal risk Q4', rules: RENEWAL_RISK.rules, sharing: 'workspace', shared_with: [], alert_on_changes: true });
  });

  it('keeps someone else\'s segment read-only, with Open segment and Duplicate to edit', async () => {
    const spy = stubSegments();
    renderSegments('/segments/8/edit');
    expect(await screen.findByText('Only Carl CSM can edit this segment')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open segment' })).toHaveAttribute('href', '/segments/8');
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate to edit' }));
    await waitFor(() => expect(where()).toBe('/segments/200/edit'));
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('EMEA accounts (copy)');
    expect(requests(spy, 'POST', /^\/segments\/8\/duplicate\/$/)).toHaveLength(1);
  });

  it('reads a segment that is not there, or not shared with me, as not found', async () => {
    stubSegments();
    renderSegments('/segments/99/edit');
    expect(await screen.findByText('Segment not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All segments' })).toHaveAttribute('href', '/segments');
  });

  it('clears the rules when a new segment\'s kind changes, since each kind has its own fields', async () => {
    stubSegments();
    renderSegments('/segments/new');
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(document.querySelectorAll('[data-condition]')).toHaveLength(1);
    await userEvent.click(screen.getByRole('radio', { name: 'Contacts' }));
    expect(document.querySelectorAll('[data-condition]')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(within(row(1)).getByRole('combobox', { name: 'Condition 1 field' })).toHaveDisplayValue('Role');
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/segments/Builder.test.tsx`
Expected: FAIL, "Failed to resolve import "./Builder"" (from testPages.tsx).

- [ ] **Step 4: Write sharing, the segment read, the states and the builder**

```tsx
// src/components/segments/SharingFields.tsx
import { useId } from 'react';
import type { PersonRef, Sharing } from '../../features/segments/segmentTypes';
import { FILTER_SELECT, Radio } from '../organizations/portfolio/filterParts';
import { Chip } from './Chip';

const OPTIONS: { value: Sharing; label: string }[] = [
  { value: 'private', label: 'Only me' },
  { value: 'workspace', label: 'Everyone in the workspace' },
  { value: 'people', label: 'Chosen teammates' },
];
/** The backend's MAX_SHARED. */
const MAX_SHARED = 50;

/** Private, the workspace, or chosen teammates (spec Decisions, Sharing),
 *  with a people picker of active teammates. Leaving "Chosen teammates"
 *  clears the choice, as the backend does. */
export function SharingFields({ sharing, sharedWith, teammates, error, onChange }: {
  sharing: Sharing;
  sharedWith: PersonRef[];
  /** Active people in the workspace, the owner left out. */
  teammates: PersonRef[];
  error: string | null;
  onChange: (sharing: Sharing, sharedWith: PersonRef[]) => void;
}) {
  const name = useId();
  const rest = teammates.filter((person) => !sharedWith.some((chosen) => chosen.id === person.id));
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-[15px] font-semibold text-ink">Sharing</legend>
      <p className="text-[11px] text-ink-muted">Teammates see the same rules, but only the members they may open, and a count of the rest. Only you can change it.</p>
      {OPTIONS.map((option) => (
        <Radio
          key={option.value}
          name={name}
          label={option.label}
          checked={sharing === option.value}
          onChange={() => onChange(option.value, option.value === 'people' ? sharedWith : [])}
        />
      ))}
      {sharing === 'people' ? (
        <div className="flex flex-col gap-2 pl-6">
          {sharedWith.length > 0 ? (
            <ul aria-label="Shared with" className="flex flex-wrap gap-1.5">
              {sharedWith.map((person) => (
                <Chip key={person.id} name={person.name} onRemove={() => onChange('people', sharedWith.filter((chosen) => chosen.id !== person.id))} />
              ))}
            </ul>
          ) : null}
          <select
            aria-label="Add a teammate"
            value=""
            disabled={sharedWith.length >= MAX_SHARED}
            onChange={(event) => {
              const person = rest.find((candidate) => String(candidate.id) === event.target.value);
              if (person) onChange('people', [...sharedWith, person]);
            }}
            className={`${FILTER_SELECT} self-start`}
          >
            <option value="">Add a teammate…</option>
            {rest.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
```

```ts
// src/components/segments/useSegment.ts
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchSegment } from '../../features/segments/segmentApi';
import type { Segment } from '../../features/segments/segmentTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type SegmentLoad =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; segment: Segment };

/** One segment, read for the reader: `missing` for a 404, which is the
 *  same for a segment that does not exist and one not shared with them.
 *  `replace` swaps in a newer copy (after a pin, say); `retry` reads again. */
export function useSegment(id: number): [SegmentLoad, (segment: Segment) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: SegmentLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSegment(id).then(
      (segment) => {
        if (alive) setAnswer({ key, load: { status: 'ready', segment } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this segment.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((segment: Segment) => setAnswer({ key, load: { status: 'ready', segment } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}
```

```tsx
// src/components/segments/SegmentStates.tsx
import { Link } from 'react-router-dom';
import { EmptyState, ErrorBlock, ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { QUIET } from '../organizations/portfolio/styles';

export function SegmentLoading() {
  return <ItemSkeleton count={3} label="Loading segment" avatar={false} />;
}

/** A 404: missing and not-shared read the same (backend Access rule). */
export function SegmentMissing() {
  return (
    <EmptyState
      title="Segment not found"
      detail="It may have been deleted, or it isn't shared with you."
      action={
        <Link to="/segments" className={`${QUIET} border border-line`}>
          All segments
        </Link>
      }
    />
  );
}

export function SegmentFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorBlock message={message} onRetry={onRetry} />;
}
```

```tsx
// src/pages/segments/Builder.tsx
import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { useMembers } from '../../features/knowledge/useMembers';
import { rulesFromList, type ListRules } from '../../features/segments/fromListFilters';
import { firstIncomplete, fromRules, toRules, type DraftRules } from '../../features/segments/ruleDraft';
import { createSegment, duplicateSegment, fetchRecordNames, updateSegment } from '../../features/segments/segmentApi';
import { formErrors, type FormErrors } from '../../features/segments/segmentErrors';
import { fieldsFor, KIND_LABEL } from '../../features/segments/segmentFields';
import {
  NO_LABELS,
  type PersonRef,
  type PreviewRequest,
  type RuleLabels,
  type Segment,
  type SegmentKind,
  type Sharing,
} from '../../features/segments/segmentTypes';
import { Radio } from '../../components/organizations/portfolio/filterParts';
import { EmptyState } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { PreviewPanel } from '../../components/segments/PreviewPanel';
import { RuleEditor } from '../../components/segments/RuleEditor';
import { SegmentFailed, SegmentLoading, SegmentMissing } from '../../components/segments/SegmentStates';
import { SharingFields } from '../../components/segments/SharingFields';
import { useAttributes, useProducts } from '../../components/segments/useBuilderOptions';
import { usePreview } from '../../components/segments/usePreview';
import { useSegment } from '../../components/segments/useSegment';
import type { ValueOptions } from '../../components/segments/ValueInput';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

const KINDS: SegmentKind[] = ['customer', 'account', 'contact'];
const INPUT = `min-h-11 rounded-lg border bg-surface px-2 text-[13px] text-ink hover:border-line-strong sm:min-h-9 ${FOCUS}`;
const NO_IDS: ListRules['ids'] = { customer: [], account: [] };

interface Initial {
  segment: Segment | null;
  kind: SegmentKind;
  draft: DraftRules;
  /** What a list's Save as segment could not carry over. */
  notes: string[];
  labels: RuleLabels;
  /** Organisation and account ids to name (Save as segment). */
  nameIds: ListRules['ids'];
}

/** /segments/new: `?kind=` and, from a list's Save as segment, that list's
 *  own filters (plan Decision 5). */
function fromList(search: URLSearchParams): Initial {
  const raw = search.get('kind');
  const kind: SegmentKind = raw === 'account' || raw === 'contact' ? raw : 'customer';
  const list = raw ? rulesFromList(kind, search) : null;
  return { segment: null, kind, draft: fromRules(list?.rules), notes: list?.notes ?? [], labels: NO_LABELS, nameIds: list?.ids ?? NO_IDS };
}

function fromSegment(segment: Segment): Initial {
  return { segment, kind: segment.kind, draft: fromRules(segment.rules), notes: [], labels: segment.labels, nameIds: NO_IDS };
}

/** /segments/new and /segments/:id/edit (spec §3): basics, the rules with a
 *  live preview beside them (stacked on phones), sharing and the alert. */
export function Builder() {
  const { id } = useParams();
  const [search] = useSearchParams();
  if (id === undefined) return <NewBuilder search={search} />;
  if (!/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <SegmentMissing />
      </OrganizationsFrame>
    );
  }
  return <EditBuilder key={id} id={Number(id)} />;
}

function NewBuilder({ search }: { search: URLSearchParams }) {
  const [initial] = useState(() => fromList(search));
  return <BuilderForm initial={initial} />;
}

function EditBuilder({ id }: { id: number }) {
  const [load, , retry] = useSegment(id);
  if (load.status === 'ready' && load.segment.is_owner) return <BuilderForm initial={fromSegment(load.segment)} />;
  return (
    <OrganizationsFrame>
      {load.status === 'loading' ? <SegmentLoading /> : null}
      {load.status === 'missing' ? <SegmentMissing /> : null}
      {load.status === 'failed' ? <SegmentFailed message={load.message} onRetry={retry} /> : null}
      {load.status === 'ready' ? <ReadOnly segment={load.segment} /> : null}
    </OrganizationsFrame>
  );
}

/** Someone else's segment (plan Decision 4): only its owner edits it. */
function ReadOnly({ segment }: { segment: Segment }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const duplicate = async () => {
    setBusy(true);
    setError(null);
    try {
      const copy = await duplicateSegment(segment.id);
      navigate(`/segments/${copy.id}/edit`);
    } catch (err) {
      setError(errorMessage(err, 'Could not duplicate this segment.'));
      setBusy(false);
    }
  };
  return (
    <EmptyState
      title={`Only ${segment.owner.name} can edit this segment`}
      detail="Duplicate it to make your own copy, then edit that."
      action={
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-2">
            <Link to={`/segments/${segment.id}`} className={`${QUIET} border border-line`}>
              Open segment
            </Link>
            <button type="button" onClick={() => void duplicate()} disabled={busy} className={PRIMARY}>
              {busy ? 'Duplicating…' : 'Duplicate to edit'}
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          ) : null}
        </div>
      }
    />
  );
}

function BuilderForm({ initial }: { initial: Initial }) {
  const navigate = useNavigate();
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const attributes = useAttributes();
  const products = useProducts();
  const editing = initial.segment;
  const nameId = useId();
  const descriptionId = useId();
  const kindName = useId();

  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [kind, setKind] = useState<SegmentKind>(initial.kind);
  const [draft, setDraft] = useState<DraftRules>(initial.draft);
  const [sharing, setSharing] = useState<Sharing>(editing?.sharing ?? 'private');
  const [sharedWith, setSharedWith] = useState<PersonRef[]>(editing?.shared_with ?? []);
  const [alertOn, setAlertOn] = useState(editing?.alert_on_changes ?? false);
  const [labels, setLabels] = useState<RuleLabels>(initial.labels);
  const [errors, setErrors] = useState<FormErrors>({});
  const [invalidUid, setInvalidUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Save as segment: name the organisations and accounts the list named.
  // An id that does not come back stays "an organisation you can't open".
  const nameIds = JSON.stringify(initial.nameIds);
  useEffect(() => {
    const ids = JSON.parse(nameIds) as ListRules['ids'];
    if (ids.customer.length === 0 && ids.account.length === 0) return;
    let alive = true;
    Promise.all([fetchRecordNames('customer', ids.customer), fetchRecordNames('account', ids.account)]).then(
      ([organisations, accounts]) => {
        if (!alive) return;
        setLabels((current) => ({
          ...current,
          organisations: { ...current.organisations, ...organisations },
          accounts: { ...current.accounts, ...accounts },
        }));
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [nameIds]);

  const fields = useMemo(() => fieldsFor(kind, attributes), [kind, attributes]);
  const fieldOf = useCallback((key: string) => fields.find((field) => field.key === key) ?? null, [fields]);
  const people = useMemo(() => members.filter((m) => m.is_active).map((m) => ({ id: m.id, name: m.name })), [members]);
  const teammates = useMemo(() => people.filter((person) => person.id !== me), [people, me]);
  const complete = firstIncomplete(draft, fieldOf) === null;
  const request = useMemo<PreviewRequest | null>(
    () => (complete ? { kind, rules: toRules(draft), pinned_ids: editing?.pinned_ids ?? [], excluded_ids: editing?.excluded_ids ?? [] } : null),
    [complete, kind, draft, editing],
  );
  const preview = usePreview(request);
  const options = useMemo<ValueOptions>(
    () => ({
      people,
      products,
      labels,
      onNamed: (group, id, picked) => setLabels((current) => ({ ...current, [group]: { ...current[group], [String(id)]: picked } })),
    }),
    [people, products, labels],
  );
  const rulesError = errors.rules ?? (preview.status === 'error' ? preview.message : null);

  const changeKind = (next: SegmentKind) => {
    setKind(next);
    setDraft(fromRules(null));
    setInvalidUid(null);
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    const unfinished = firstIncomplete(draft, fieldOf);
    const found: FormErrors = {};
    if (!name.trim()) found.name = 'Give the segment a name.';
    if (unfinished) found.rules = 'Finish each condition, or remove it.';
    if (sharing === 'people' && sharedWith.length === 0) found.shared_with = 'Choose at least one teammate.';
    setInvalidUid(unfinished);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = {
      name: name.trim(),
      description: description.trim(),
      rules: toRules(draft),
      sharing,
      shared_with: sharedWith.map((person) => person.id),
      alert_on_changes: alertOn,
    };
    setSaving(true);
    try {
      // PATCH never sends `kind` (it cannot change).
      const saved = editing ? await updateSegment(editing.id, body) : await createSegment({ ...body, kind });
      navigate(`/segments/${saved.id}`);
    } catch (err) {
      setErrors(formErrors(err));
      setSaving(false);
    }
  }

  return (
    <OrganizationsFrame>
      <form onSubmit={(event) => void save(event)} noValidate className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 pb-6">
        <h1 className="text-[22px] font-semibold text-ink">{editing ? `Edit ${editing.name}` : 'New segment'}</h1>
        {errors.form ? (
          <p role="alert" className="text-[13px] text-danger">
            {errors.form}
          </p>
        ) : null}
        {initial.notes.length > 0 ? (
          <ul aria-label="From the list" className="flex flex-col gap-1 rounded-xl bg-surface p-3 text-[13px] text-ink-muted">
            {initial.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}

        <section aria-label="Basics" className="flex flex-col gap-3 rounded-xl bg-surface p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={nameId} className="text-[13px] font-semibold text-ink">
              Name
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? `${nameId}-error` : undefined}
              className={`${INPUT} ${errors.name ? 'border-danger' : 'border-line'}`}
            />
            {errors.name ? (
              <p id={`${nameId}-error`} className="text-[11px] text-danger">
                {errors.name}
              </p>
            ) : null}
          </div>
          {editing ? (
            <p className="text-[13px] text-ink">
              <span className="font-semibold">Kind:</span> {KIND_LABEL[kind]} <span className="text-ink-muted">· A segment's kind can't change.</span>
            </p>
          ) : (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-[13px] font-semibold text-ink">Kind</legend>
              <div className="flex flex-wrap gap-x-4">
                {KINDS.map((option) => (
                  <Radio key={option} name={kindName} label={KIND_LABEL[option]} checked={kind === option} onChange={() => changeKind(option)} />
                ))}
              </div>
              {errors.kind ? <p className="text-[11px] text-danger">{errors.kind}</p> : null}
            </fieldset>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor={descriptionId} className="text-[13px] font-semibold text-ink">
              Description <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <textarea
              id={descriptionId}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${INPUT} border-line py-2`}
            />
            {errors.description ? <p className="text-[11px] text-danger">{errors.description}</p> : null}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <RuleEditor
            draft={draft}
            fields={fields}
            options={options}
            invalidUid={invalidUid}
            error={rulesError}
            onChange={(next) => {
              setDraft(next);
              setInvalidUid(null);
            }}
          />
          <PreviewPanel kind={kind} state={preview} />
        </div>

        <section aria-label="Sharing and alerts" className="flex flex-col gap-4 rounded-xl bg-surface p-3">
          <SharingFields
            sharing={sharing}
            sharedWith={sharedWith}
            teammates={teammates}
            error={errors.shared_with ?? errors.sharing ?? null}
            onChange={(nextSharing, nextPeople) => {
              setSharing(nextSharing);
              setSharedWith(nextPeople);
            }}
          />
          <div className="flex flex-col gap-0.5">
            <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink sm:min-h-9">
              <input type="checkbox" checked={alertOn} onChange={(event) => setAlertOn(event.target.checked)} className={`h-4 w-4 accent-accent ${FOCUS}`} />
              Alert me on changes
            </label>
            <p className="text-[11px] text-ink-muted">Once a day, in your notifications, when anyone enters or leaves.</p>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={saving} className={PRIMARY}>
            {saving ? 'Saving…' : 'Save segment'}
          </button>
          <Link to={editing ? `/segments/${editing.id}` : '/segments'} className={QUIET}>
            Cancel
          </Link>
        </div>
      </form>
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run --maxWorkers=2 src/pages/segments/Builder.test.tsx`
Expected: PASS (8 tests). The first test waits up to a second for the preview: the 400 ms debounce plus the stubbed reply.

- [ ] **Step 6: Commit**

```bash
git add src/components/segments/SharingFields.tsx src/components/segments/useSegment.ts src/components/segments/SegmentStates.tsx src/pages/segments/Builder.tsx src/pages/segments/testPages.tsx src/pages/segments/Builder.test.tsx
git commit -m "feat(segments): the builder: basics, rules beside a live preview, sharing, the alert, 400s at their fields

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: The Members tab, on each kind's own rows, with Pin and Keep out

**Files:**
- Modify: `src/components/organizations/portfolio/AccountRow.tsx` (props, `startPress`, the checkbox, a menu slot before the open button)
- Modify: `src/components/organizations/portfolio/MoveToMenu.tsx` (props `label`, `menuLabel`, `icon`)
- Modify: `src/components/contacts/ContactListItem.tsx` (prop `actions`)
- Create: `src/components/segments/MemberMenu.tsx`
- Create: `src/components/segments/KeptOut.tsx`
- Create: `src/components/segments/MembersTab.tsx`
- Test: `src/components/organizations/portfolio/AccountRow.test.tsx` (two tests), `src/components/organizations/portfolio/MoveToMenu.test.tsx` (new), `src/components/contacts/ContactListItem.test.tsx` (one test), `src/components/segments/MembersTab.test.tsx` (new)

**Interfaces:**
- Consumes:
  - from Task 1: `fetchMembers`, `setMemberState`, `previewSegment`;
  - from Task 2: `KIND_NOUN`;
  - from Task 6: `membersQuery`, `memberSortOptions`, `memberGroupOptions`, `MEMBERS_PAGE_SIZE`, `SegmentPageParams`, `memberCountText`;
  - `ORGANIZATION_KIND` (`portfolio/organizationKind`), `ACCOUNT_KIND` (`components/accounts/portfolio/accountKind`), `PortfolioKindContext`, `usePortfolioKind`;
  - `AccountRow`, `AccountSheet`, `PagedSections`, `ItemSkeleton`, `EmptyState`, `ErrorBlock`, `MoreButton`, `usePagedBook`, `usePagedRead`, `errorMessage`, `SECTION_PAGE_SIZE` (`usePortfolio`);
  - `GroupSortFields`, `ToolbarSearch`, `useSearchText`, `MoveToMenu`, `ContactListItem`, `LIST` (`organizations/detail/listStyles`);
  - `formatCompactMoney`, `useOrgCurrency`, `SM`/`useMediaQuery`.
- Produces:

```ts
// AccountRow.tsx (new optional props; defaults keep today's behaviour)
selectable?: boolean;      // default true; false: no checkbox, no long press
menu?: ReactNode;          // rendered before the open button; its clicks never open the row
// MoveToMenu.tsx (new optional props)
label?: string;            // default `Move ${name} to…`
menuLabel?: string;        // default `Move ${name} to`
icon?: ReactNode;          // default the move arrows
// ContactListItem.tsx (new optional prop)
actions?: ReactNode;       // beside the row's link; the item becomes a flex row only when given
// MemberMenu.tsx
export function MemberMenu(props: { name: string; state: MemberStateValue; disabled: boolean; onChoose: (state: MemberStateValue) => void }): JSX.Element;
// KeptOut.tsx
export function KeptOut(props: { segment: Segment; disabled: boolean; onLetBackIn: (id: number) => void }): JSX.Element;
// MembersTab.tsx
export function MembersTab(props: {
  segment: Segment; params: SegmentPageParams; update: (patch: Partial<SegmentPageParams>) => void;
  version: number; onChanged: (state: MemberState) => void; onNotice: (message: string | null) => void;
}): JSX.Element;
```

The menu button is named "Actions for {name}" and its menu "{name} actions". The choices are:
- a member that is not pinned: **Pin**, **Keep out**;
- a pinned member: **Unpin**, **Keep out**;
- a kept-out record, in the Kept out list: **Let back in**.

- [ ] **Step 1: Write the failing tests for the shared parts**

Append inside `describe('AccountRow', …)` in `src/components/organizations/portfolio/AccountRow.test.tsx`:

```tsx
  it('has no checkbox and ignores a long press when it is not selectable', () => {
    vi.useFakeTimers();
    const { props, header } = renderRow({ selectable: false });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.pointerDown(header);
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(props.onLongPress).not.toHaveBeenCalled();
  });

  it('puts a menu in the row whose clicks never open the row', () => {
    const { props } = renderRow({ menu: <button type="button">Row menu</button> });
    fireEvent.click(screen.getByRole('button', { name: 'Row menu' }));
    expect(props.onToggleOpen).not.toHaveBeenCalled();
  });
```

Append inside `describe('ContactListItem (spec 2026-09-28 §3)', …)` in `src/components/contacts/ContactListItem.test.tsx`:

```tsx
  it('puts actions beside the link without making them part of it', () => {
    render(
      <MemoryRouter>
        <ul>
          <ContactListItem contact={LUKAS} to="/contacts/41" selected={false} actions={<button type="button">Actions for Lukas Vermeer</button>} />
        </ul>
      </MemoryRouter>,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByRole('button', { name: 'Actions for Lukas Vermeer' }).closest('a')).toBeNull();
    expect(within(item).getByRole('link')).toHaveAttribute('href', '/contacts/41');
  });
```

```tsx
// src/components/organizations/portfolio/MoveToMenu.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MoveToMenu } from './MoveToMenu';

describe('MoveToMenu', () => {
  it('keeps its move words by default', async () => {
    render(<MoveToMenu name="Pizza Hut" disabled={false} note={null} targets={[{ value: 'live', label: 'Live' }]} onChoose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Pizza Hut to…' }));
    expect(screen.getByRole('menu', { name: 'Move Pizza Hut to' })).toBeInTheDocument();
  });

  it('takes its own button and menu names for another menu, and reports the choice', async () => {
    const onChoose = vi.fn();
    render(
      <MoveToMenu
        name="Pizza Hut"
        disabled={false}
        note={null}
        targets={[{ value: 'pinned', label: 'Pin' }]}
        onChoose={onChoose}
        label="Actions for Pizza Hut"
        menuLabel="Pizza Hut actions"
        icon={<span aria-hidden="true">…</span>}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Pizza Hut' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Pizza Hut actions' })).getByRole('menuitem', { name: 'Pin' }));
    expect(onChoose).toHaveBeenCalledWith('pinned');
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/organizations/portfolio/AccountRow.test.tsx src/components/organizations/portfolio/MoveToMenu.test.tsx src/components/contacts/ContactListItem.test.tsx`
Expected: FAIL. In the not-selectable test the checkbox exists. The menu test can't find "Row menu", because `AccountRow` doesn't render a `menu` yet (Ruling G21). `MoveToMenu`'s custom names aren't found. The actions button isn't rendered.

- [ ] **Step 2: Give the three shared parts their optional props**

`src/components/organizations/portfolio/AccountRow.tsx`:

1. In `AccountRowProps`, after `onToggleOpen`, add:

```ts
  /** False where rows are never selected (a segment's Members tab): no
   *  checkbox, and a long press does nothing. */
  selectable?: boolean;
  /** A row menu (a segment's Pin and Keep out), before the open button.
   *  Its clicks never reach the row. */
  menu?: ReactNode;
```

2. In the destructuring, after `onToggleOpen,` add `selectable = true,` and `menu,`.
3. In `startPress`, change the guard to `if (event.pointerType === 'mouse' || selectDisabled || !selectable) return;`.
4. Wrap the whole `<label …>…</label>` holding the checkbox in `{selectable ? ( … ) : null}`.
5. Immediately before the open/close `<button … aria-expanded={open} …>`, add:

```tsx
        {menu ? (
          <span className="shrink-0" onClick={(event) => event.stopPropagation()}>
            {menu}
          </span>
        ) : null}
```

`src/components/organizations/portfolio/MoveToMenu.tsx`:

1. Change the first import to `import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';`.
2. Add to the props type and the destructuring:

```ts
  /** The button's name; default "Move {name} to…". */
  label?: string;
  /** The menu's name; default "Move {name} to". */
  menuLabel?: string;
  /** The button's icon; default the move arrows. */
  icon?: ReactNode;
```

3. In the button, use `aria-label={label ?? \`Move ${name} to…\`}` and replace the `<ArrowRightLeft … />` child with `{icon ?? <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />}`.
4. In the menu `<div role="menu">`, use `aria-label={menuLabel ?? \`Move ${name} to\`}`.
5. Update the component's doc comment's first line to "A card's "Move to…" control, or any record's short menu (a segment's Pin / Keep out)".

`src/components/contacts/ContactListItem.tsx`:

1. Add `import type { ReactNode } from 'react';`.
2. Change the signature to:

```tsx
export function ContactListItem({ contact, to, selected, actions }: { contact: Contact; to: To; selected: boolean; actions?: ReactNode }) {
```

3. Change the returned `<li data-contact={contact.id}>` to `<li data-contact={contact.id} className={actions ? 'flex items-center pr-1' : undefined}>`.
4. On the `<Link>`, add `${actions ? 'min-w-0 flex-1' : ''}` to its `className` template.
5. After `</Link>`, add `{actions}`.

Run the three files again.
Expected: PASS, the existing tests in them unchanged.

- [ ] **Step 3: Write the failing Members tab test**

```tsx
// src/components/segments/MembersTab.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseSegmentPage, toSegmentPageSearch, type SegmentPageParams } from '../../features/segments/segmentParams';
import type { Segment } from '../../features/segments/segmentTypes';
import { CHAMPIONS, EMEA_ACCOUNTS, RENEWAL_RISK, requests, stubSegments } from '../../features/segments/testSegments';
import { renderInApp } from '../../pages/segments/testPages';
import { resetViewport } from '../../test/viewport';
import { MembersTab } from './MembersTab';

/** The page's part of the contract: the segment, its URL state, and a
 *  reload after a pin. */
function Host({ initial }: { initial: Segment }) {
  const [segment, setSegment] = useState(initial);
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useSearchParams();
  const params = parseSegmentPage(search, segment.kind);
  const update = (patch: Partial<SegmentPageParams>) => setSearch(toSegmentPageSearch({ ...params, ...patch }), { replace: true });
  return (
    <>
      <MembersTab
        segment={segment}
        params={params}
        update={update}
        version={version}
        onChanged={(state) => {
          setSegment((current) => ({ ...current, ...state }));
          setVersion((v) => v + 1);
        }}
        onNotice={setNotice}
      />
      {notice ? <p data-testid="notice">{notice}</p> : null}
    </>
  );
}

const where = () => screen.getByTestId('where').textContent;
const count = () => document.querySelector('[data-part="member-count"]');

describe('MembersTab (spec §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('lists an organisations segment\'s members as Organizations rows, never selectable', async () => {
    stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    expect(await screen.findByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(screen.getByRole('link', { name: 'Globex' })).toBeInTheDocument();
    expect(count()).toHaveTextContent('3 organisations');
    expect(screen.queryByRole('checkbox', { name: 'Select Pizza Hut' })).not.toBeInTheDocument();
  });

  it('pins a member from its row menu, and the menu then offers Unpin', async () => {
    const spy = stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Pizza Hut' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Pizza Hut actions' })).getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(requests(spy, 'PATCH', /^\/segments\/7\/members\/7\/$/).map((r) => r.body)).toEqual([{ state: 'pinned' }]));
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Pizza Hut' }));
    expect(within(screen.getByRole('menu', { name: 'Pizza Hut actions' })).getByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument();
  });

  it('keeps a member out, lists it under Kept out, and lets it back in', async () => {
    const spy = stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Globex' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Globex actions' })).getByRole('menuitem', { name: 'Keep out' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Globex' })).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^Kept out/ }));
    const kept = await screen.findByRole('list', { name: 'Kept out' });
    await userEvent.click(within(kept).getByRole('button', { name: 'Let Globex back in' }));
    expect(await screen.findByRole('link', { name: 'Globex' })).toBeInTheDocument();
    expect(requests(spy, 'PATCH', /^\/segments\/7\/members\/1\/$/).map((r) => r.body)).toEqual([{ state: 'excluded' }, { state: 'none' }]);
    expect(requests(spy, 'POST', /^\/segments\/preview\/$/)[0].body).toEqual({ kind: 'customer', rules: { match: 'all', conditions: [] }, pinned_ids: [1] });
  });

  it('searches, sorts and groups in the URL, asking the endpoint only for the names it reads', async () => {
    const spy = stubSegments();
    renderInApp(<Host initial={RENEWAL_RISK} />, { url: '/segments/7' });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search members by name' }), 'piz');
    await waitFor(() => expect(where()).toBe('/segments/7?search=piz'));
    await waitFor(() => expect(count()).toHaveTextContent('1 of 3 organisations'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'Health');
    await waitFor(() => expect(where()).toBe('/segments/7?search=piz&group=health'));
    const reads = () => requests(spy, 'GET', /^\/segments\/7\/members\/$/).map((r) => r.query);
    await waitFor(() => expect(reads().some((q) => q.get('group') === 'health' && !q.has('group_value'))).toBe(true));
    const frame = reads().find((q) => q.get('group') === 'health' && !q.has('group_value'))!;
    expect([...frame.keys()].sort()).toEqual(['group', 'limit', 'search', 'sort']);
    expect(frame.get('limit')).toBe('1');
    const allowed = ['sort', 'group', 'group_value', 'search', 'cursor', 'limit'];
    expect(reads().every((q) => [...q.keys()].every((key) => allowed.includes(key)))).toBe(true);
  });

  it('gives a segment shared with me its rows but no row menu', async () => {
    stubSegments();
    renderInApp(<Host initial={EMEA_ACCOUNTS} />, { url: '/segments/8' });
    expect(await screen.findByRole('link', { name: 'Pizza EMEA' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Kept out/ })).not.toBeInTheDocument();
  });

  it('lists a contacts segment\'s members as Contacts rows, searched by name, with no grouping', async () => {
    stubSegments();
    renderInApp(<Host initial={CHAMPIONS} />, { url: '/segments/9' });
    expect(await screen.findByRole('link', { name: /Lukas Vermeer/ })).toHaveAttribute('href', '/contacts/41');
    expect(count()).toHaveTextContent('3 contacts');
    expect(screen.queryByRole('combobox', { name: 'Group' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Lukas Vermeer' })).toBeInTheDocument();
  });
});
```

The Kept out list's button is named "Let {name} back in", so each one is distinct.

- [ ] **Step 4: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/components/segments/MembersTab.test.tsx`
Expected: FAIL, "Failed to resolve import "./MembersTab"".

- [ ] **Step 5: Write the menu, the kept-out list and the tab**

```tsx
// src/components/segments/MemberMenu.tsx
import { MoreHorizontal } from 'lucide-react';
import type { MemberStateValue } from '../../features/segments/segmentTypes';
import { MoveToMenu } from '../organizations/portfolio/MoveToMenu';

const CHOICES: Record<MemberStateValue, { value: MemberStateValue; label: string }[]> = {
  none: [
    { value: 'pinned', label: 'Pin' },
    { value: 'excluded', label: 'Keep out' },
  ],
  pinned: [
    { value: 'none', label: 'Unpin' },
    { value: 'excluded', label: 'Keep out' },
  ],
  excluded: [{ value: 'none', label: 'Let back in' }],
};

/** A member row's menu (owner only, spec §3): Pin keeps it in whatever the
 *  rules say, Keep out keeps it out. */
export function MemberMenu({ name, state, disabled, onChoose }: {
  name: string;
  state: MemberStateValue;
  disabled: boolean;
  onChoose: (state: MemberStateValue) => void;
}) {
  return (
    <MoveToMenu
      name={name}
      disabled={disabled}
      note={null}
      targets={CHOICES[state]}
      onChoose={(value) => onChoose(value as MemberStateValue)}
      label={`Actions for ${name}`}
      menuLabel={`${name} actions`}
      icon={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
    />
  );
}
```

```tsx
// src/components/segments/KeptOut.tsx
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { previewSegment } from '../../features/segments/segmentApi';
import type { PreviewResponse, Segment } from '../../features/segments/segmentTypes';
import { ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type Answer = { key: string; data: PreviewResponse } | { key: string; error: string };

/** The owner's kept-out records, which are no longer members, each with
 *  Let back in (plan Decision 9). Named through the preview with no rules
 *  and these ids as pins: exactly those records, as the reader may open
 *  them, first ten by name. */
export function KeptOut({ segment, disabled, onLetBackIn }: { segment: Segment; disabled: boolean; onLetBackIn: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const key = segment.excluded_ids.join(',');
  const kind = segment.kind;

  useEffect(() => {
    if (!open || !key) return;
    let alive = true;
    previewSegment({ kind, rules: { match: 'all', conditions: [] }, pinned_ids: key.split(',').map(Number) }).then(
      (data) => {
        if (alive) setAnswer({ key, data });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, error: errorMessage(err, 'Could not load who is kept out.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [open, key, kind]);

  const current = answer?.key === key ? answer : null;
  return (
    <section className="rounded-xl bg-surface p-3">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-[13px] font-semibold text-ink hover:bg-subtle sm:min-h-9 ${FOCUS}`}
        >
          <ChevronRight className={`h-4 w-4 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
          Kept out <span className={`${MONO} font-normal text-ink-muted`}>{segment.excluded_ids.length}</span>
        </button>
      </h2>
      {open ? (
        !current ? (
          <ItemSkeleton count={Math.min(3, segment.excluded_ids.length)} label="Loading kept-out records" avatar={false} />
        ) : 'error' in current ? (
          <p role="alert" className="text-[13px] text-danger">
            {current.error}
          </p>
        ) : (
          <>
            <ul aria-label="Kept out" className="mt-1 flex flex-col">
              {current.data.results.map((record) => (
                <li key={record.id} className="flex min-h-11 items-center justify-between gap-2 sm:min-h-9">
                  <span className="truncate text-[13px] text-ink">{record.name}</span>
                  <button type="button" disabled={disabled} onClick={() => onLetBackIn(record.id)} aria-label={`Let ${record.name} back in`} className={QUIET}>
                    Let back in
                  </button>
                </li>
              ))}
            </ul>
            {current.data.count > current.data.results.length ? (
              <p className="text-[11px] text-ink-muted">
                and <span className={MONO}>{current.data.count - current.data.results.length}</span> more
              </p>
            ) : null}
          </>
        )
      ) : null}
    </section>
  );
}
```

```tsx
// src/components/segments/MembersTab.tsx
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { Contact } from '../../features/customers/customersSlice';
import { formatCompactMoney } from '../../features/customers/formatters';
import type { PortfolioGroup, PortfolioRowBase } from '../../features/organizations/portfolioTypes';
import { fetchMembers, setMemberState } from '../../features/segments/segmentApi';
import { KIND_NOUN } from '../../features/segments/segmentFields';
import {
  MEMBERS_PAGE_SIZE,
  memberGroupOptions,
  membersQuery,
  memberSortOptions,
  type SegmentPageParams,
} from '../../features/segments/segmentParams';
import type { MemberState, MemberStateValue, Segment, SegmentMembersPage } from '../../features/segments/segmentTypes';
import { memberCountText } from '../../features/segments/summaryFigures';
import { useOrgCurrency } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { ACCOUNT_KIND } from '../accounts/portfolio/accountKind';
import { ContactListItem } from '../contacts/ContactListItem';
import { LIST } from '../organizations/detail/listStyles';
import { AccountRow } from '../organizations/portfolio/AccountRow';
import { AccountSheet } from '../organizations/portfolio/AccountSheet';
import { GroupSortFields } from '../organizations/portfolio/filterParts';
import { ORGANIZATION_KIND } from '../organizations/portfolio/organizationKind';
import { PortfolioKindContext, usePortfolioKind } from '../organizations/portfolio/portfolioKind';
import { EmptyState, ErrorBlock, ItemSkeleton, MoreButton, PagedSections } from '../organizations/portfolio/PortfolioSections';
import { ToolbarSearch } from '../organizations/portfolio/toolbarParts';
import { usePagedBook } from '../organizations/portfolio/usePagedBook';
import { errorMessage, usePagedRead } from '../organizations/portfolio/usePagedRead';
import { SECTION_PAGE_SIZE } from '../organizations/portfolio/usePortfolio';
import { useSearchText } from '../organizations/portfolio/useSearchText';
import { KeptOut } from './KeptOut';
import { MemberMenu } from './MemberMenu';

type MenuFor = (id: number, name: string) => ReactNode;
const noop = () => {};

function emptyMembers(search: string): ReactNode {
  return search ? (
    <EmptyState title={`No members match "${search}"`} detail="Try another name." action={null} />
  ) : (
    <EmptyState title="No members yet" detail="Nobody matches the rules today. Edit the rules, or pin a record." action={null} />
  );
}

function MembersToolbar({ segment, params, update }: { segment: Segment; params: SegmentPageParams; update: (patch: Partial<SegmentPageParams>) => void }) {
  const isSm = useMediaQuery(SM);
  const searchRef = useRef<HTMLInputElement>(null);
  const commit = useCallback((search: string) => update({ search }), [update]);
  const [text, setText] = useSearchText(params.search, commit);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolbarSearch label="Search members by name" searchRef={searchRef} value={text} onChange={setText} isSm={isSm} />
      {segment.kind !== 'contact' ? (
        <GroupSortFields
          group={params.group || 'none'}
          sort={params.sort}
          groupOptions={memberGroupOptions(segment.kind)}
          sortOptions={memberSortOptions(segment.kind)}
          onGroup={(group) => update({ group: group === 'none' ? '' : group })}
          onSort={(sort) => update({ sort })}
        />
      ) : null}
    </div>
  );
}

/** Organisations and accounts: the kind's own rows, groups and opened-row
 *  panels (inline from sm, a sheet on phones), never selectable. */
function PortfolioMemberList({ segment, params, version, menu }: { segment: Segment; params: SegmentPageParams; version: number; menu: MenuFor }) {
  const kind = usePortfolioKind();
  const isSm = useMediaQuery(SM);
  const orgCurrency = useOrgCurrency();
  const grouped = params.group !== '';
  const noun = KIND_NOUN[segment.kind];
  const read = useCallback((query: string) => fetchMembers<PortfolioRowBase>(segment.id, query), [segment.id]);
  const frameQuery = membersQuery(params, segment.kind, { limit: grouped ? '1' : String(MEMBERS_PAGE_SIZE) });
  const book = usePagedBook<PortfolioRowBase, SegmentMembersPage<PortfolioRowBase>>(read, noun, frameQuery, grouped, version, undefined, null, 0);
  const [openRow, setOpenRow] = useState<PortfolioRowBase | null>(null);
  const currency = book.data?.currency ?? orgCurrency;

  const renderRow = (row: PortfolioRowBase) => {
    const open = openRow?.id === row.id;
    return (
      <AccountRow
        key={row.id}
        row={row}
        currency={currency}
        pins={[]}
        isSm={isSm}
        selectable={false}
        selecting={false}
        selected={false}
        open={open}
        onToggleSelect={noop}
        onLongPress={noop}
        onToggleOpen={(r) => setOpenRow((current) => (current?.id === r.id ? null : r))}
        menu={menu(row.id, row.name)}
      >
        {open && isSm ? kind.renderDetails({ row, currency, id: `account-${row.id}-details` }) : null}
      </AccountRow>
    );
  };

  return (
    <div className="@container flex flex-col gap-2">
      {book.data ? (
        <p data-part="member-count" className="text-[13px] text-ink-muted">
          {memberCountText(book.data.count, book.data.summary.members, params.search, segment.kind)}
        </p>
      ) : null}
      <PagedSections<PortfolioRowBase, SegmentMembersPage<PortfolioRowBase>, PortfolioGroup>
        book={book}
        read={read}
        noun={noun}
        grouped={grouped}
        listHeading="Members"
        sectionQuery={(groupKey) => membersQuery(params, segment.kind, { group_value: groupKey, limit: String(SECTION_PAGE_SIZE) })}
        version={version}
        groupMoney={(group) => formatCompactMoney(group.arr, currency)}
        renderRow={renderRow}
        onRowsLoaded={noop}
        empty={emptyMembers(params.search)}
        skeleton={(n) => <ItemSkeleton count={n} label="Loading members" />}
      />
      {!isSm && openRow ? <AccountSheet row={openRow} currency={currency} onClose={() => setOpenRow(null)} /> : null}
    </div>
  );
}

/** Contacts: the Contacts list's own rows, by name, with Show more. */
function ContactMemberList({ segment, params, version, menu }: { segment: Segment; params: SegmentPageParams; version: number; menu: MenuFor }) {
  const read = useCallback((query: string) => fetchMembers<Contact>(segment.id, query), [segment.id]);
  const page = usePagedRead<Contact, SegmentMembersPage<Contact>>(
    read,
    KIND_NOUN.contact,
    membersQuery(params, 'contact', { limit: String(MEMBERS_PAGE_SIZE) }),
    true,
    version,
  );
  if (!page.data && page.error) return <ErrorBlock message={page.error} onRetry={page.retry} />;
  if (!page.data) return <ItemSkeleton count={6} label="Loading members" />;
  if (page.data.count === 0) return <>{emptyMembers(params.search)}</>;
  return (
    <div className="flex flex-col gap-2">
      <p data-part="member-count" className="text-[13px] text-ink-muted">
        {memberCountText(page.data.count, page.data.summary.members, params.search, 'contact')}
      </p>
      <ul aria-label="Members" aria-busy={page.loading} className={LIST}>
        {page.rows.map((contact) => (
          <ContactListItem key={contact.id} contact={contact} to={`/contacts/${contact.id}`} selected={false} actions={menu(contact.id, contact.name)} />
        ))}
      </ul>
      <MoreButton next={page.next} loading={page.loadingMore} error={page.moreError} label="Show more members" onClick={() => void page.loadMore()} />
    </div>
  );
}

/** A segment's Members tab (spec §3): the kind's own list rows, search,
 *  sort and grouping; for the owner, Pin and Keep out in each row's menu and
 *  the Kept out list. The kind picks the rows here and only here (plan
 *  Decision 8). */
export function MembersTab({ segment, params, update, version, onChanged, onNotice }: {
  segment: Segment;
  params: SegmentPageParams;
  update: (patch: Partial<SegmentPageParams>) => void;
  version: number;
  onChanged: (state: MemberState) => void;
  onNotice: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const stateOf = (id: number): MemberStateValue =>
    segment.pinned_ids.includes(id) ? 'pinned' : segment.excluded_ids.includes(id) ? 'excluded' : 'none';
  const choose = async (recordId: number, state: MemberStateValue) => {
    setBusy(true);
    onNotice(null);
    try {
      onChanged(await setMemberState(segment.id, recordId, state));
    } catch (err) {
      onNotice(errorMessage(err, 'Could not change this member.'));
    } finally {
      setBusy(false);
    }
  };
  const menu: MenuFor = (id, name) =>
    segment.is_owner ? <MemberMenu name={name} state={stateOf(id)} disabled={busy} onChoose={(state) => void choose(id, state)} /> : null;

  return (
    <div role="tabpanel" aria-label="Members" className="flex flex-col gap-3">
      <MembersToolbar segment={segment} params={params} update={update} />
      {segment.kind === 'contact' ? (
        <ContactMemberList segment={segment} params={params} version={version} menu={menu} />
      ) : (
        <PortfolioKindContext.Provider value={segment.kind === 'customer' ? ORGANIZATION_KIND : ACCOUNT_KIND}>
          <PortfolioMemberList segment={segment} params={params} version={version} menu={menu} />
        </PortfolioKindContext.Provider>
      )}
      {segment.is_owner && segment.excluded_ids.length > 0 ? (
        <KeptOut segment={segment} disabled={busy} onLetBackIn={(id) => void choose(id, 'none')} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/components/segments/MembersTab.test.tsx src/components/organizations/portfolio src/components/contacts`
Expected: PASS, with the Organizations portfolio's and Contacts' own tests unchanged.
- `ORGANIZATION_KIND`'s `PortfolioKind<PortfolioRow>` stands where the context's `PortfolioKind` is expected, as the Accounts pages do with `ACCOUNT_KIND`.
- If the "1 of 3 organisations" line fails, check that `buildPortfolio` honours `search`. It does for the Organizations list's own tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/organizations/portfolio/AccountRow.tsx src/components/organizations/portfolio/AccountRow.test.tsx src/components/organizations/portfolio/MoveToMenu.tsx src/components/organizations/portfolio/MoveToMenu.test.tsx src/components/contacts/ContactListItem.tsx src/components/contacts/ContactListItem.test.tsx src/components/segments/MemberMenu.tsx src/components/segments/KeptOut.tsx src/components/segments/MembersTab.tsx src/components/segments/MembersTab.test.tsx
git commit -m "feat(segments): the Members tab on each kind's own rows, with Pin, Keep out and Let back in for the owner

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: The Changes tab

**Files:**
- Create: `src/components/segments/ChangesTab.tsx`
- Test: `src/components/segments/ChangesTab.test.tsx`

**Interfaces:**
- Consumes: `fetchChanges` (Task 1); `recordHref` (Task 2); `dayText`, `reasonText` (Task 3); `CHANGE_WINDOWS`, `ChangeWindow` (Task 6); `Switch`; `EmptyState`, `ErrorBlock`, `ItemSkeleton`; `FOCUS`, `MONO`; `errorMessage`.
- Produces:

```ts
export function ChangesTab(props: { segment: Segment; days: ChangeWindow; onDays: (days: ChangeWindow) => void; attributes: AIAttribute[] }): JSX.Element;
// each day is <li data-day="YYYY-MM-DD">; its "+N more" lines are [data-part="more"]
```

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/segments/ChangesTab.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearchParams } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { parseSegmentPage, toSegmentPageSearch } from '../../features/segments/segmentParams';
import type { Segment } from '../../features/segments/segmentTypes';
import { RENEWAL_RISK, requests, stubSegments } from '../../features/segments/testSegments';
import { renderInApp } from '../../pages/segments/testPages';
import { resetViewport } from '../../test/viewport';
import { ChangesTab } from './ChangesTab';

function Host({ segment }: { segment: Segment }) {
  const [search, setSearch] = useSearchParams();
  const params = parseSegmentPage(search, segment.kind);
  return (
    <ChangesTab
      segment={segment}
      days={params.days}
      onDays={(days) => setSearch(toSegmentPageSearch({ ...params, days }), { replace: true })}
      attributes={[]}
    />
  );
}

const day = (date: string) => document.querySelector(`[data-day="${date}"]`) as HTMLElement;

describe('ChangesTab (spec §3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('lists each day, newest first, with its totals, who entered and left and why, and the rest as +N more', async () => {
    stubSegments();
    renderInApp(<Host segment={RENEWAL_RISK} />, { url: '/segments/7?tab=changes' });
    await waitFor(() => expect(day('2026-10-03')).not.toBeNull());
    expect([...document.querySelectorAll('[data-day]')].map((li) => li.getAttribute('data-day'))).toEqual(['2026-10-03', '2026-10-01']);
    const newest = day('2026-10-03');
    expect(within(newest).getByRole('heading')).toHaveTextContent('3 Oct 2026 · 2 entered · 1 left');
    const entered = within(newest).getByRole('list', { name: 'Entered' });
    expect(within(entered).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(within(entered).getByText('CSAT %, Health')).toBeInTheDocument();
    expect(within(newest).getByRole('list', { name: 'Left' })).toHaveTextContent("Globex No longer in the owner's book");
    expect(newest.querySelector('[data-part="more"]')).toHaveTextContent('+1 more');
    expect(within(day('2026-10-01')).getByText('Pinned')).toBeInTheDocument();
    expect(day('2026-10-01').querySelector('[data-part="more"]')).toBeNull();
    expect(screen.getByText(/more changes involve records you can't open\./)).toHaveTextContent("3 more changes involve records you can't open.");
  });

  it('reads 7, 30 or 90 days from its switch, kept in the URL', async () => {
    const spy = stubSegments();
    renderInApp(<Host segment={RENEWAL_RISK} />, { url: '/segments/7?tab=changes' });
    await waitFor(() => expect(day('2026-10-03')).not.toBeNull());
    await userEvent.click(within(screen.getByRole('group', { name: 'Changes window' })).getByRole('button', { name: '90 days' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/segments/7?tab=changes&days=90'));
    await waitFor(() => expect(requests(spy, 'GET', /^\/segments\/7\/changes\/$/).map((r) => r.query.get('days'))).toEqual(['30', '90']));
  });

  it('says nobody moved in the window, and that a paused segment records nothing', async () => {
    stubSegments({ changes: () => ({ status: 200, body: { kind: 'customer', days: [], hidden_count: 0 } }) });
    renderInApp(<Host segment={{ ...RENEWAL_RISK, paused: true }} />, { url: '/segments/7?tab=changes&days=7' });
    expect(await screen.findByText('Nobody entered or left in the last 7 days.')).toBeInTheDocument();
    expect(screen.getByText('Paused: its owner is inactive, so no changes are recorded until they are back.')).toBeInTheDocument();
    expect(screen.queryByText(/records you can't open/)).not.toBeInTheDocument();
  });
});
```

The first test's `?tab=changes` is only there to match the page's own URL. `Host` reads `days` alone.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/components/segments/ChangesTab.test.tsx`
Expected: FAIL, "Failed to resolve import "./ChangesTab"".

- [ ] **Step 3: Write the tab**

```tsx
// src/components/segments/ChangesTab.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AIAttribute } from '../../features/attributes/types';
import { dayText, reasonText } from '../../features/segments/ruleSentence';
import { fetchChanges } from '../../features/segments/segmentApi';
import { recordHref } from '../../features/segments/segmentFields';
import { CHANGE_WINDOWS, type ChangeWindow } from '../../features/segments/segmentParams';
import type { ChangeDay, ChangeRecord, Segment, SegmentChanges } from '../../features/segments/segmentTypes';
import { EmptyState, ErrorBlock, ItemSkeleton } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { Switch } from '../organizations/portfolio/tileParts';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

const WINDOWS = CHANGE_WINDOWS.map((days) => ({ value: String(days), label: `${days} days` }));

type Answer = { key: string; data: SegmentChanges } | { key: string; error: string };

function Moves({ title, direction, records, more, segment, attributes }: {
  title: string;
  direction: 'entered' | 'left';
  records: ChangeRecord[];
  more: number;
  segment: Segment;
  attributes: AIAttribute[];
}) {
  if (records.length === 0 && more === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{title}</p>
      <ul aria-label={title} className="flex flex-col gap-0.5">
        {records.map((record) => (
          <li key={record.id} className="flex min-w-0 flex-wrap items-center gap-x-2">
            <Link
              to={recordHref(segment.kind, record.id)}
              className={`inline-flex min-h-11 items-center truncate rounded-sm text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}
            >
              {record.name}
            </Link>{' '}
            <span className="text-[11px] text-ink-muted">{reasonText(record.reason, direction, segment.kind, attributes)}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p data-part="more" className="text-[11px] text-ink-muted">
          <span className={MONO}>+{more}</span> more
        </p>
      ) : null}
    </div>
  );
}

function DayItem({ day, segment, attributes }: { day: ChangeDay; segment: Segment; attributes: AIAttribute[] }) {
  return (
    <li data-day={day.date} className="flex flex-col gap-2 rounded-xl bg-surface p-3">
      <h3 className="text-[13px] font-semibold text-ink">
        {dayText(day.date)}
        <span className="font-normal text-ink-muted">
          {' · '}
          <span className={MONO}>{day.totals.entered}</span> entered{' · '}
          <span className={MONO}>{day.totals.left}</span> left
        </span>
      </h3>
      <Moves title="Entered" direction="entered" records={day.entered} more={day.more.entered} segment={segment} attributes={attributes} />
      <Moves title="Left" direction="left" records={day.left} more={day.more.left} segment={segment} attributes={attributes} />
    </li>
  );
}

/** A segment's Changes tab (spec §3): who entered and who left, day by day,
 *  with the reason; 7, 30 or 90 days (plan Decision 6). A day names at most
 *  100 each way, then "+N more"; moves of records the reader can't open are
 *  only counted. */
export function ChangesTab({ segment, days, onDays, attributes }: {
  segment: Segment;
  days: ChangeWindow;
  onDays: (days: ChangeWindow) => void;
  attributes: AIAttribute[];
}) {
  const [attempt, setAttempt] = useState(0);
  const key = `${segment.id}#${days}#${attempt}`;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let alive = true;
    fetchChanges(segment.id, days).then(
      (data) => {
        if (alive) setAnswer({ key, data });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, error: errorMessage(err, 'Could not load the changes.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [segment.id, days, key]);

  const current = answer?.key === key ? answer : null;
  let body;
  if (!current) body = <ItemSkeleton count={3} label="Loading changes" avatar={false} />;
  else if ('error' in current) body = <ErrorBlock message={current.error} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (current.data.days.length === 0) body = <EmptyState title="No changes" detail={`Nobody entered or left in the last ${days} days.`} action={null} />;
  else {
    body = (
      <ol aria-label="Days" className="flex flex-col gap-2">
        {current.data.days.map((day) => (
          <DayItem key={day.date} day={day} segment={segment} attributes={attributes} />
        ))}
      </ol>
    );
  }
  const hidden = current && 'data' in current ? current.data.hidden_count : 0;

  return (
    <div role="tabpanel" aria-label="Changes" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-muted">Who entered and who left, newest day first.</p>
        <Switch label="Changes window" options={WINDOWS} value={String(days)} onChange={(value) => onDays(Number(value) as ChangeWindow)} />
      </div>
      {segment.paused ? <p className="text-[13px] text-ink-muted">Paused: its owner is inactive, so no changes are recorded until they are back.</p> : null}
      {body}
      {hidden > 0 ? (
        <p className="text-[13px] text-ink-muted">
          <span className={MONO}>{hidden}</span> more {hidden === 1 ? 'change involves a record' : 'changes involve records'} you can't open.
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --maxWorkers=2 src/components/segments/ChangesTab.test.tsx`
Expected: PASS (3 tests). The "Left" list's text runs name and reason together with one space (the `{' '}` between them), which is what the `toHaveTextContent` checks.

- [ ] **Step 5: Commit**

```bash
git add src/components/segments/ChangesTab.tsx src/components/segments/ChangesTab.test.tsx
git commit -m "feat(segments): the Changes tab: entries and exits day by day, with reasons, totals and +N more

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The segment page: header, tiles and tabs

**Files:**
- Create: `src/components/segments/SegmentTiles.tsx`
- Create: `src/components/segments/SegmentHeader.tsx`
- Create: `src/pages/segments/SegmentPage.tsx`
- Modify: `src/pages/segments/testPages.tsx` (one route)
- Test: `src/pages/segments/SegmentPage.test.tsx`

**Interfaces:**
- Consumes:
  - from Task 1: `fetchMembers`, `duplicateSegment`, `deleteSegment`, `exportMembers`;
  - from Task 3: `ruleSentence`, `RuleSentence`;
  - from Task 6: `parseSegmentPage`, `toSegmentPageSearch`, `membersQuery`, `summaryFigures`;
  - from Tasks 11–13: `useSegment`, `SegmentLoading`, `SegmentMissing`, `SegmentFailed`, `useAttributes`, `MembersTab`, `ChangesTab`;
  - shared: `Tile`, `TilesSkeleton` (`tileParts`), `ConfirmDialog` (`components/organizations/ConfirmDialog`), `DismissibleAlert`, `BUTTON`, `FOCUS`, `MONO`, `errorMessage`, `OrganizationsFrame`.
- Produces:

```ts
export function SegmentTiles(props: { summary: SegmentSummary | null; kind: SegmentKind; failed: boolean }): JSX.Element;
export function SegmentHeader(props: { segment: Segment; parts: SentencePart[]; exportQuery: string; onNotice: (message: string | null) => void }): JSX.Element;
export function SegmentPage(): JSX.Element;    // /segments/:id, ?tab=members|changes (the alert links ?tab=changes)
```

- [ ] **Step 1: Add the page route to the harness**

In `src/pages/segments/testPages.tsx`, add `import { SegmentPage } from './SegmentPage';` and, after the `/segments/:id/edit` route:

```tsx
            <Route path="/segments/:id" element={<><SegmentPage /><Where /></>} />
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/pages/segments/SegmentPage.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requests, stubSegments } from '../../features/segments/testSegments';
import { resetViewport } from '../../test/viewport';
import { renderSegments } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const tile = (name: string) => screen.getByRole('group', { name });

describe('/segments/:id (spec §3)', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('heads my segment with its name, its rules as one sentence, owner and sharing, and Edit, Duplicate, Export CSV and Delete', async () => {
    stubSegments();
    renderSegments('/segments/7');
    expect(await screen.findByRole('heading', { level: 1, name: 'Renewal risk' })).toBeInTheDocument();
    expect(screen.getByText('Organisations').closest('p')).toHaveTextContent(
      'Organisations where CSAT % is less than 60 and (Renewal date is in the next 90 days or Health is Poor)',
    );
    expect(screen.getByText('Yours · Shared with the workspace')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/segments/7/edit');
    for (const name of ['Duplicate', 'Export CSV', 'Delete']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  it('shows the tiles over every member: members, ARR covered, average health and CSAT, and the last 7 days', async () => {
    stubSegments();
    renderSegments('/segments/7');
    expect(await within(await screen.findByRole('group', { name: 'Members' })).findByText('3')).toHaveClass('font-mono-brand');
    expect(within(tile('ARR covered')).getByText('$512K')).toBeInTheDocument();
    expect(within(tile('Average health')).getByText('5.4')).toBeInTheDocument();
    expect(within(tile('Average CSAT')).getByText('71%')).toBeInTheDocument();
    expect(within(tile('Last 7 days')).getByText('+6 / −2')).toBeInTheDocument();
  });

  it('shows a shared reader the rules with what they cannot open unnamed, the count of the rest, and no Edit or Delete', async () => {
    stubSegments();
    renderSegments('/segments/8');
    expect(await screen.findByText("an organisation you can't open")).toBeInTheDocument();
    expect(screen.getByText('Owned by Carl CSM · Shared with Alice')).toBeInTheDocument();
    expect(await screen.findByText(/more members you can't open\./)).toHaveTextContent("2 more members you can't open.");
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
  });

  it('deletes after confirming, then returns to the list', async () => {
    const spy = stubSegments();
    renderSegments('/segments/7');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete Renewal risk?')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(where()).toBe('/segments'));
    expect(requests(spy, 'DELETE', /^\/segments\/7\/$/)).toHaveLength(1);
  });

  it('duplicates into a copy of my own and opens it', async () => {
    stubSegments();
    renderSegments('/segments/8');
    await userEvent.click(await screen.findByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(where()).toBe('/segments/200'));
    expect(await screen.findByRole('heading', { level: 1, name: 'EMEA accounts (copy)' })).toBeInTheDocument();
  });

  it('exports the members the way the tab lists them', async () => {
    const spy = stubSegments();
    renderSegments('/segments/7?search=piz&sort=name');
    await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(requests(spy, 'GET', /^\/segments\/7\/members\/export\.csv$/)).toHaveLength(1));
    expect(requests(spy, 'GET', /export\.csv$/)[0].query.toString()).toBe('search=piz&sort=name');
  });

  it('opens on the Changes tab from the alert\'s link, and switches tabs in the URL', async () => {
    stubSegments();
    renderSegments('/segments/7?tab=changes');
    expect(await screen.findByRole('tab', { name: 'Changes' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tabpanel', { name: 'Changes' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Members' }));
    await waitFor(() => expect(where()).toBe('/segments/7'));
    expect(screen.getByRole('tabpanel', { name: 'Members' })).toBeInTheDocument();
  });

  it('gives a contacts segment only the Members and Last 7 days tiles', async () => {
    stubSegments();
    renderSegments('/segments/9');
    await screen.findByRole('group', { name: 'Members' });
    expect(tile('Last 7 days')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'ARR covered' })).not.toBeInTheDocument();
  });

  it('reads a segment that is not there, or not shared with me, as not found', async () => {
    stubSegments();
    renderSegments('/segments/99');
    expect(await screen.findByText('Segment not found')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/segments/SegmentPage.test.tsx`
Expected: FAIL, "Failed to resolve import "./SegmentPage"" (from testPages.tsx).

- [ ] **Step 4: Write the tiles, the header and the page**

```tsx
// src/components/segments/SegmentTiles.tsx
import type { SegmentKind, SegmentSummary } from '../../features/segments/segmentTypes';
import { summaryFigures } from '../../features/segments/summaryFigures';
import { MONO } from '../organizations/portfolio/styles';
import { Tile, TilesSkeleton } from '../organizations/portfolio/tileParts';

/** The tiles (spec §3) over every member the reader may open; a search on
 *  the Members tab narrows the rows, never these. Phones swipe the strip
 *  sideways inside itself; the page never scrolls sideways. */
export function SegmentTiles({ summary, kind, failed }: { summary: SegmentSummary | null; kind: SegmentKind; failed: boolean }) {
  if (failed) {
    return (
      <p role="alert" className="text-[13px] text-danger">
        Could not load the totals.
      </p>
    );
  }
  if (!summary) return <TilesSkeleton count={kind === 'contact' ? 2 : 5} />;
  return (
    <div className="flex snap-x gap-2 overflow-x-auto [&>*]:flex-1">
      {summaryFigures(summary, kind).map((figure) => (
        <Tile key={figure.key} title={figure.label}>
          <p className={`${MONO} text-[22px] font-semibold text-ink`}>{figure.value}</p>
          {figure.detail ? <p className="text-[11px] text-ink-muted">{figure.detail}</p> : null}
        </Tile>
      ))}
    </div>
  );
}
```

```tsx
// src/components/segments/SegmentHeader.tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Download, Pencil, Trash2 } from 'lucide-react';
import type { SentencePart } from '../../features/segments/ruleSentence';
import { deleteSegment, duplicateSegment, exportMembers } from '../../features/segments/segmentApi';
import type { PersonRef, Segment } from '../../features/segments/segmentTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { BUTTON } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { RuleSentence } from './RuleSentence';

function names(people: PersonRef[]): string {
  if (people.length <= 2) return people.map((person) => person.name).join(' and ');
  return `${people[0].name}, ${people[1].name} and ${people.length - 2} more`;
}

function sharingText(segment: Segment): string {
  if (segment.sharing === 'private') return 'Private';
  if (segment.sharing === 'workspace') return 'Shared with the workspace';
  return `Shared with ${names(segment.shared_with)}`;
}

/** The segment's header (spec §3): name, the rules as one sentence, owner
 *  and sharing, then Edit, Duplicate, Export CSV and Delete. Edit and Delete
 *  are the owner's only. */
export function SegmentHeader({ segment, parts, exportQuery, onNotice }: {
  segment: Segment;
  parts: SentencePart[];
  /** The Members tab's own search and sort, so the file matches the list. */
  exportQuery: string;
  onNotice: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'duplicate' | 'export' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const run = async (what: 'duplicate' | 'export') => {
    setBusy(what);
    onNotice(null);
    try {
      if (what === 'duplicate') {
        const copy = await duplicateSegment(segment.id);
        navigate(`/segments/${copy.id}`);
      } else {
        await exportMembers(segment.id, exportQuery);
      }
    } catch (err) {
      onNotice(errorMessage(err, what === 'duplicate' ? 'Could not duplicate this segment.' : 'Could not export the members.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold text-ink">{segment.name}</h1>
          {segment.description ? <p className="text-[13px] text-ink-muted">{segment.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {segment.is_owner ? (
            <Link to={`/segments/${segment.id}/edit`} className={BUTTON}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </Link>
          ) : null}
          <button type="button" onClick={() => void run('duplicate')} disabled={busy !== null} className={BUTTON}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {busy === 'duplicate' ? 'Duplicating…' : 'Duplicate'}
          </button>
          <button type="button" onClick={() => void run('export')} disabled={busy !== null} className={BUTTON}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {busy === 'export' ? 'Exporting…' : 'Export CSV'}
          </button>
          {segment.is_owner ? (
            <button type="button" onClick={() => setDeleting(true)} className={`${BUTTON} text-danger`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </button>
          ) : null}
        </div>
      </div>
      <RuleSentence parts={parts} />
      <p className="text-[11px] text-ink-muted">
        {segment.is_owner ? 'Yours' : `Owned by ${segment.owner.name}`} · {sharingText(segment)}
        {segment.paused ? ' · Paused' : ''}
      </p>
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${segment.name}?`}
          message="Its rules, pins and history are deleted. The records in it are not touched."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteSegment(segment.id);
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw errorMessage(err, 'Could not delete this segment.');
            }
            navigate('/segments');
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </header>
  );
}
```

```tsx
// src/pages/segments/SegmentPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ruleSentence } from '../../features/segments/ruleSentence';
import { fetchMembers } from '../../features/segments/segmentApi';
import { membersQuery, parseSegmentPage, toSegmentPageSearch, type SegmentPageParams, type SegmentTab } from '../../features/segments/segmentParams';
import type { Segment, SegmentMembersPage } from '../../features/segments/segmentTypes';
import { DismissibleAlert } from '../../components/organizations/portfolio/DismissibleAlert';
import { FOCUS, MONO } from '../../components/organizations/portfolio/styles';
import { ChangesTab } from '../../components/segments/ChangesTab';
import { MembersTab } from '../../components/segments/MembersTab';
import { SegmentHeader } from '../../components/segments/SegmentHeader';
import { SegmentFailed, SegmentLoading, SegmentMissing } from '../../components/segments/SegmentStates';
import { SegmentTiles } from '../../components/segments/SegmentTiles';
import { useAttributes } from '../../components/segments/useBuilderOptions';
import { useSegment } from '../../components/segments/useSegment';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

const TABS: { value: SegmentTab; label: string }[] = [
  { value: 'members', label: 'Members' },
  { value: 'changes', label: 'Changes' },
];

/** /segments/:id (spec §3): the header, the tiles, "N more members you
 *  can't open" for a shared reader, then Members or Changes (`?tab=`). */
export function SegmentPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <SegmentMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedSegment key={id} id={Number(id)} />;
}

function LoadedSegment({ id }: { id: number }) {
  const [load, replace, retry] = useSegment(id);
  if (load.status === 'ready') return <SegmentView segment={load.segment} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      {load.status === 'loading' ? <SegmentLoading /> : null}
      {load.status === 'missing' ? <SegmentMissing /> : null}
      {load.status === 'failed' ? <SegmentFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

/** The tiles and hidden count: one `limit=1` read of the members, over all
 *  of them whatever the tab's search (plan Decision 7). The last totals stay
 *  while a reload after a pin is in flight. */
function useTotals(id: number, version: number) {
  const key = `${id}#${version}`;
  const [answer, setAnswer] = useState<{ key: string; page: SegmentMembersPage<unknown> | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMembers<unknown>(id, 'limit=1').then(
      (page) => {
        if (alive) setAnswer({ key, page });
      },
      () => {
        if (alive) setAnswer({ key, page: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  return { page: answer?.page ?? null, failed: answer?.key === key && answer.page === null };
}

function SegmentView({ segment, onReplace }: { segment: Segment; onReplace: (segment: Segment) => void }) {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseSegmentPage(search, segment.kind), [search, segment.kind]);
  const update = useCallback(
    (patch: Partial<SegmentPageParams>) => setSearch(toSegmentPageSearch({ ...params, ...patch }), { replace: true }),
    [params, setSearch],
  );
  const attributes = useAttributes();
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const totals = useTotals(segment.id, version);
  const parts = useMemo(() => ruleSentence(segment.rules, segment.kind, segment.labels, attributes), [segment, attributes]);
  const hidden = totals.page?.hidden_count ?? 0;

  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <SegmentHeader segment={segment} parts={parts} exportQuery={membersQuery(params, segment.kind)} onNotice={setNotice} />
        {notice ? <DismissibleAlert message={notice} onDismiss={() => setNotice(null)} /> : null}
        <div className="@container">
          <SegmentTiles summary={totals.page?.summary ?? null} kind={segment.kind} failed={totals.failed} />
        </div>
        {hidden > 0 ? (
          <p data-part="hidden-members" className="text-[13px] text-ink-muted">
            <span className={MONO}>{hidden}</span> more {hidden === 1 ? 'member' : 'members'} you can't open.
          </p>
        ) : null}
        <div role="tablist" aria-label="Segment views" className="flex gap-4 border-b border-line-subtle">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={params.tab === tab.value}
              onClick={() => update({ tab: tab.value })}
              className={`-mb-px min-h-11 border-b-2 px-1 text-[13px] font-semibold sm:min-h-9 ${FOCUS} ${
                params.tab === tab.value ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {params.tab === 'members' ? (
          <MembersTab
            segment={segment}
            params={params}
            update={update}
            version={version}
            onChanged={(state) => {
              onReplace({ ...segment, ...state });
              setVersion((v) => v + 1);
            }}
            onNotice={setNotice}
          />
        ) : (
          <ChangesTab segment={segment} days={params.days} onDays={(days) => update({ days })} attributes={attributes} />
        )}
      </div>
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run --maxWorkers=2 src/pages/segments/SegmentPage.test.tsx`
Expected: PASS (9 tests).
- In the shared-reader test, the stub's members answer `hidden_count: 2` for a non-owner.
- In the delete test, the last "Delete" button is the dialog's confirm; the header's own one comes first in the DOM.

- [ ] **Step 6: Commit**

```bash
git add src/components/segments/SegmentTiles.tsx src/components/segments/SegmentHeader.tsx src/pages/segments/SegmentPage.tsx src/pages/segments/testPages.tsx src/pages/segments/SegmentPage.test.tsx
git commit -m "feat(segments): the segment page: rules as a sentence, owner actions, tiles, Members and Changes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Routes, the framed bar, and Save as segment on the three lists

**Files:**
- Modify: `src/App.tsx` (imports; a `segments` route block before `surveys`)
- Modify: `src/components/layout/Navbar.tsx` (`isSegments`, `isSegmentPage`, `isFramed`, two branches at the head of the title chain)
- Modify: `src/layouts/DashboardLayout.tsx` (`isSegments`, no `<main>` padding)
- Modify: `src/components/organizations/portfolio/PortfolioToolbar.tsx` (`onSaveAsSegment`)
- Modify: `src/components/contacts/ContactsToolbar.tsx` (`onSaveAsSegment`, the action pair)
- Modify: `src/pages/organizations/List.tsx`, `src/pages/accounts/List.tsx`, `src/pages/contacts/ContactsPage.tsx`
- Modify: `src/pages/organizations/testList.tsx`, `src/pages/accounts/testList.tsx`, `src/pages/contacts/testPage.tsx` (a `/segments/new` route each)
- Test: `src/components/layout/Navbar.test.tsx` (one describe), `src/layouts/DashboardLayout.test.tsx` (four URLs), `src/pages/segments/saveAsSegment.test.tsx` (new)

**Interfaces:**
- Consumes: `SegmentsList`, `Builder`, `SegmentPage` (Tasks 10, 11, 14); `saveAsSegmentHref` (Task 5); `filterQuery` (`features/organizations/portfolioParams`); `toContactsSearch` (already imported by `ContactsPage` as `query`).
- Produces:

```ts
// PortfolioToolbar / ContactsToolbar (new optional prop)
onSaveAsSegment?: () => void;   // a "Save as segment" button beside Filters (Contacts: before Add)
```

App routes: `/segments` → `SegmentsList`, `/segments/new` and `/segments/:id/edit` → `Builder`, `/segments/:id` → `SegmentPage`. `App.tsx` has no test of its own. The harnesses mirror these routes, and Task 18's browser check proves the real ones.

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/Navbar.test.tsx`, after the `describe('Navbar on Contacts …')` block, add:

```tsx
describe('Navbar on Segments (segments spec 2026-10-03 §3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('wears the framed bar on /segments: "Segments", the actions slot, no avatar', () => {
    const setSlot = vi.fn();
    renderNavbar('/segments', null, null, [], setSlot);
    const header = document.querySelector('header');
    expect(header).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    expect(screen.getByRole('heading', { name: 'Segments' })).toBeInTheDocument();
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
  });

  it.each(['/segments/new', '/segments/7', '/segments/7/edit'])('leads back to the list from %s, in the same frame', (url) => {
    renderNavbar(url);
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Segments' });
    expect(back).toHaveAttribute('href', '/segments');
    expect(document.querySelector('header')).toHaveClass('h-16', 'px-4');
  });
});
```

In `src/layouts/DashboardLayout.test.tsx`, add to the `it.each([...])` list, after `'/pipelines/board',`:

```ts
    // Segments wear the same frame (segments spec 2026-10-03 §3).
    '/segments',
    '/segments/new',
    '/segments/7',
    '/segments/7/edit',
```

Add a `/segments/new` stand-in to each list harness:
- `src/pages/organizations/testList.tsx`: after `<Route path="/organizations/:id" element={<p>Organization page</p>} />`, add `<Route path="/segments/new" element={<Where />} />`.
- `src/pages/accounts/testList.tsx`: after its `/organizations/:id` route, add `<Route path="/segments/new" element={<Where />} />`.
- `src/pages/contacts/testPage.tsx`: after `<Route path="/organizations/:id" element={<Where />} />`, add `<Route path="/segments/new" element={<Where />} />`.

```tsx
// src/pages/segments/saveAsSegment.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubAccountsPortfolio } from '../../features/accounts/testPortfolio';
import { stubContactsApi } from '../../features/contacts/testContacts';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPortfolio } from '../../features/organizations/testPortfolio';
import { resetViewport } from '../../test/viewport';
import { renderAccounts } from '../accounts/testList';
import { renderContactsPage } from '../contacts/testPage';
import { renderList } from '../organizations/testList';

const where = () => screen.getByTestId('where').textContent;

// Spec §3: "Save as segment" beside Filters turns the list's current URL
// filters into a new segment's rules and opens the builder (plan Decision 5).
describe('Save as segment on the lists', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens the builder from Organizations with the kind and the list\'s own filters, search included for its note', async () => {
    stubPortfolio();
    renderList('/organizations/list?owner=2&health=poor&search=pizza');
    await userEvent.click(await screen.findByRole('button', { name: 'Save as segment' }));
    await waitFor(() => expect(where()).toBe('/segments/new?kind=customer&search=pizza&owner=2&health=poor'));
  });

  it('opens the builder from Accounts with its organisation filter', async () => {
    stubAccountsPortfolio();
    renderAccounts('/accounts/list?organisation=7');
    await userEvent.click(await screen.findByRole('button', { name: 'Save as segment' }));
    await waitFor(() => expect(where()).toBe('/segments/new?kind=account&organisation=7'));
  });

  it('opens the builder from Contacts with its organisation and role', async () => {
    stubContactsApi();
    renderContactsPage('/contacts?customer=6&role=champion');
    await userEvent.click(await screen.findByRole('button', { name: 'Save as segment' }));
    await waitFor(() => expect(where()).toBe('/segments/new?kind=contact&customer=6&role=champion'));
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.test.tsx src/pages/segments/saveAsSegment.test.tsx`
Expected: FAIL:
- the Segments heading and breadcrumb aren't found;
- the four segments URLs keep `p-2`;
- there's no "Save as segment" button.

- [ ] **Step 2: The routes**

In `src/App.tsx`, add the imports after `import { CampaignEditor } from './pages/campaigns/CampaignEditor';`:

```tsx
import { Builder as SegmentBuilder } from './pages/segments/Builder';
import { SegmentPage } from './pages/segments/SegmentPage';
import { SegmentsList } from './pages/segments/SegmentsList';
```

Then, immediately before `<Route path="surveys" element={<SurveysPage />} />`, add:

```tsx
          {/* Segments (spec 2026-10-03 §3): the list, a segment, its builder
              and a new one. Replaces the Under Construction catch-all here. */}
          <Route path="segments">
            <Route index element={<SegmentsList />} />
            <Route path="new" element={<SegmentBuilder />} />
            <Route path=":id" element={<SegmentPage />} />
            <Route path=":id/edit" element={<SegmentBuilder />} />
          </Route>
```

- [ ] **Step 3: The framed bar and the unpadded main**

In `src/components/layout/Navbar.tsx`:

1. After the `const isContacts = …;` line (and its comment), add:

```ts
  // Segments wear the same frame (segments spec 2026-10-03 §3, plan Decision
  // 10): "Segments" on the list; on a segment, its builder and a new one, the
  // bar only leads back to the list.
  const isSegments = /^\/segments\/?$/.test(location.pathname);
  const isSegmentPage = /^\/segments\/[^/]+(\/edit)?\/?$/.test(location.pathname);
```

2. Change the `isFramed` line to:

```ts
  const isFramed = isDashboard || isOrgView || isOrgDetail || isContacts || isAccountsView || isAccountDetail || isPipelinesView || isSegments || isSegmentPage;
```

3. Replace the line `        {isAccountDetail ? (` (the head of the title chain; it occurs once) with:

```tsx
        {isSegmentPage ? (
          <nav aria-label="Breadcrumb" className="flex items-center h-full">
            <Link
              to="/segments"
              className="-ml-2 inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Segments
            </Link>
          </nav>
        ) : isSegments ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Segments</h1>
          </div>
        ) : isAccountDetail ? (
```

The `text-[17px]` title matches every other framed title in this file. The Navbar is outside the house-rules globs, and this plan doesn't restyle it.

In `src/layouts/DashboardLayout.tsx`:

1. After the `const isPipelinesView = …;` line, add:

```ts
  // Segments wear the Organizations frame too (segments spec 2026-10-03 §3):
  // the list, a segment, its builder and a new one, guttered by the frame.
  const isSegments = /^\/segments(\/[^/]+(\/edit)?)?\/?$/.test(location.pathname);
```

2. In the `<main className=…>` condition, change `isAccountsView || isPipelinesView)` to `isAccountsView || isPipelinesView || isSegments)`.

- [ ] **Step 4: Save as segment on the toolbars and the three lists**

`src/components/organizations/portfolio/PortfolioToolbar.tsx`:
1. Change the lucide import to `import { BookmarkPlus, Pin } from 'lucide-react';`.
2. Add to the props type, after `groupOptions?: GroupOption[];`:

```ts
  /** The List's "Save as segment" (segments spec §3): beside Filters. The
   *  Board passes none. */
  onSaveAsSegment?: () => void;
```

3. Add `onSaveAsSegment,` to the destructuring.
4. Directly after the `<FiltersTrigger … />` element, add:

```tsx
      {onSaveAsSegment ? (
        <button type="button" onClick={onSaveAsSegment} className={BUTTON}>
          <BookmarkPlus className="w-4 h-4" aria-hidden="true" />
          Save as segment
        </button>
      ) : null}
```

`src/components/contacts/ContactsToolbar.tsx`:
1. Change the styles import to `import { BUTTON, FOCUS, PRIMARY } from '../organizations/portfolio/styles';`. Add `BookmarkPlus` to its lucide import.
2. Add `onSaveAsSegment` to the props (`onSaveAsSegment?: () => void;`, with the comment "Save as segment (segments spec §3), before Add.") and to the destructuring.
3. Replace the Add button block

```tsx
        <button type="button" onClick={onAdd} className={`${PRIMARY} justify-center sm:ml-auto`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </button>
```

with

```tsx
        <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
          {onSaveAsSegment ? (
            <button type="button" onClick={onSaveAsSegment} className={`${BUTTON} justify-center`}>
              <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
              Save as segment
            </button>
          ) : null}
          <button type="button" onClick={onAdd} className={`${PRIMARY} justify-center`}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </button>
        </div>
```

`src/pages/organizations/List.tsx`:
1. Add `import { useNavigate } from 'react-router-dom';` and `import { saveAsSegmentHref } from '../../features/segments/fromListFilters';`. Add `filterQuery` to the `portfolioParams` import.
2. In `List()`, after `const isSm = useMediaQuery(SM);`, add `const navigate = useNavigate();`.
3. In the `<PortfolioToolbar … />` props, after `onAdd={() => setAdding(true)}`, add:

```tsx
          onSaveAsSegment={() => navigate(saveAsSegmentHref('customer', filterQuery(params)))}
```

`src/pages/accounts/List.tsx`:
1. Add `import { useNavigate } from 'react-router-dom';` and `import { saveAsSegmentHref } from '../../features/segments/fromListFilters';`. Add `filterQuery` to the `portfolioParams` import.
2. In `AccountsList()`, after `const isSm = useMediaQuery(SM);`, add `const navigate = useNavigate();`.
3. In the `<PortfolioToolbar … />` props, after `onAdd={() => forms.openAdd()}`, add:

```tsx
          onSaveAsSegment={() => navigate(saveAsSegmentHref('account', filterQuery(params)))}
```

`src/pages/contacts/ContactsPage.tsx`:
1. Add `import { saveAsSegmentHref } from '../../features/segments/fromListFilters';`.
2. In the `<ContactsToolbar … />` props, after `onAdd={() => setAdding(true)}`, add:

```tsx
      onSaveAsSegment={() => navigate(saveAsSegmentHref('contact', query))}
```

(`query` is the page's own `toContactsSearch(params).toString()`, and `navigate` is already in scope.)

- [ ] **Step 5: Run the tests, and the suites the edits touch**

Run: `npx vitest run --maxWorkers=2 src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.test.tsx src/pages/segments/saveAsSegment.test.tsx`
Expected: PASS.

Run: `npx vitest run --maxWorkers=2 src/pages/organizations src/pages/accounts src/pages/contacts src/components/organizations/portfolio src/components/contacts`
Expected: PASS. The Organizations, Accounts and Contacts tests are unchanged and still pass (spec §5). A toolbar test that counted its buttons would now see one more; none do today. If one does, add the new button to its expectation rather than removing the button.

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx src/components/organizations/portfolio/PortfolioToolbar.tsx src/components/contacts/ContactsToolbar.tsx src/pages/organizations/List.tsx src/pages/accounts/List.tsx src/pages/contacts/ContactsPage.tsx src/pages/organizations/testList.tsx src/pages/accounts/testList.tsx src/pages/contacts/testPage.tsx src/pages/segments/saveAsSegment.test.tsx
git commit -m "feat(segments): route the pages, frame them, and add Save as segment to Organizations, Accounts and Contacts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: The house rules, the journey, and the product documents

**Files:**
- Create: `src/components/segments/houseRules.test.ts`
- Create: `src/e2e/segments.test.tsx`
- Modify: `src/pages/segments/testPages.tsx` (an `/organizations/list` route)
- Modify: `docs/03-ui-ux-design.md` (a "Segments" section before "### Overlays")
- Modify: `docs/04-app-flow.md` (the route table, a §4.5h, the dead-ends table)
- Modify: `.agents/workflows/repo-architecture.md` (the tree, the route map, the portfolio file table, a §11, Known Stubs)

**Interfaces:**
- Consumes: `houseRuleSuite` (`src/test/houseRules.ts`); `renderSegments`, `stubSegments`, `requests`; `List` (`pages/organizations/List`).
- Produces: nothing new.

- [ ] **Step 1: The house rules over the new files**

```ts
// src/components/segments/houseRules.test.ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite } from '../../test/houseRules';

// Spec §3's house rules over the Segments components and pages.
const files = {
  ...(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../pages/segments/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
};

houseRuleSuite('segments house rules', files);

const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));

describe('segments house rules beyond the shared suite', () => {
  it('lays every list out as rows, never a table or grid', () => {
    expect(sources.filter(([, source]) => /<table|role="(table|grid)"/.test(source)).map(([file]) => file)).toEqual([]);
  });

  it('hides every Lucide icon from screen readers', () => {
    const offenders: string[] = [];
    for (const [file, source] of sources) {
      const icons = [...source.matchAll(/import \{([^}]+)\} from 'lucide-react'/g)].flatMap((m) => m[1].split(',').map((name) => name.trim()).filter(Boolean));
      for (const icon of icons) {
        for (const use of source.matchAll(new RegExp(`<${icon}\\b[^>]*>`, 'g'))) {
          if (!use[0].includes('aria-hidden')) offenders.push(`${file}: ${use[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/segments/houseRules.test.ts`
Expected: PASS. A failure names the file and the rule; fix the file, not the rule. To see the icon check fail once, remove `aria-hidden="true"` from `Chip.tsx`'s `<X …/>`, run it, then put it back.

- [ ] **Step 2: Add the Organizations list to the harness, and write the journey**

In `src/pages/segments/testPages.tsx`, add `import { List as OrganizationsList } from '../organizations/List';` and, before the `*` route:

```tsx
            <Route path="/organizations/list" element={<><OrganizationsList /><Where /></>} />
```

```tsx
// src/e2e/segments.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { requests, stubSegments } from '../features/segments/testSegments';
import { renderSegments } from '../pages/segments/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the Organizations
// list, the three Segments pages, the store and the router. Only fetch is
// stubbed, in backend PR #84's shapes (spec §5: build, preview, save, open,
// pin, Changes, Save as segment).
const where = () => screen.getByTestId('where').textContent;

describe('Segments', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('saves a filtered list as a segment, previews and saves it, opens it, pins a member, reads its changes and finds it in the list', { timeout: 30000 }, async () => {
    const spy = stubSegments();
    renderSegments('/organizations/list?health=poor', { nav: true });

    // 1. Save as segment from the filtered Organizations list.
    await userEvent.click(await screen.findByRole('button', { name: 'Save as segment' }));
    await waitFor(() => expect(where()).toBe('/segments/new?kind=customer&health=poor'));
    const row = document.querySelector('[data-condition]') as HTMLElement;
    expect(within(row).getByRole('combobox', { name: 'Condition 1 field' })).toHaveDisplayValue('Health');
    expect(within(row).getByRole('combobox', { name: 'Condition 1 value' })).toHaveDisplayValue('Poor');

    // 2. Name it; the preview answers.
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Poor health');
    await waitFor(() => expect(document.querySelector('[data-part="match-count"]')).toHaveTextContent('3 organisations match'));

    // 3. Save: the segment opens, its rules as one sentence, its tiles.
    await userEvent.click(screen.getByRole('button', { name: 'Save segment' }));
    await waitFor(() => expect(where()).toBe('/segments/100'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Poor health' })).toBeInTheDocument();
    expect(screen.getByText('Organisations').closest('p')).toHaveTextContent('Organisations where Health is Poor');
    expect(requests(spy, 'POST', /^\/segments\/$/)[0].body).toMatchObject({
      kind: 'customer',
      rules: { match: 'all', conditions: [{ field: 'health_category', op: 'is', value: 'poor' }] },
    });

    // 4. Pin a member from its row menu.
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Pizza Hut' }));
    await userEvent.click(within(screen.getByRole('menu', { name: 'Pizza Hut actions' })).getByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(requests(spy, 'PATCH', /^\/segments\/100\/members\/7\/$/).map((r) => r.body)).toEqual([{ state: 'pinned' }]));

    // 5. The Changes tab, day by day.
    await userEvent.click(screen.getByRole('tab', { name: 'Changes' }));
    await waitFor(() => expect(where()).toBe('/segments/100?tab=changes'));
    expect(await screen.findByText('3 Oct 2026')).toBeInTheDocument();

    // 6. Back to the list through the bar: the new segment is there.
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Segments' }));
    await waitFor(() => expect(where()).toBe('/segments'));
    expect(await screen.findByRole('link', { name: 'Poor health' })).toHaveAttribute('href', '/segments/100');
  });
});
```

`findByText('3 Oct 2026')` matches the day heading's own text node. The totals sit in a child span.

Run: `npx vitest run --maxWorkers=2 src/e2e/segments.test.tsx`
Expected: PASS.

- [ ] **Step 3: `docs/03-ui-ux-design.md`**

Before the line `### Overlays`, add:

```markdown
### Segments

Spec `docs/superpowers/specs/2026-10-03-segments-design.md` §3 (plan
`docs/superpowers/plans/2026-10-03-segments-frontend.md`). Three pages in
`OrganizationsFrame` under the framed bar ("Segments", or "‹ Segments" on a
segment, its builder and a new one).

- **List (`/segments`).** A switch for All, Mine and Shared with me, a search
  box and **New segment**, then one rounded row per segment (`SegmentRow`):
  - the name, with a Workspace or Shared badge and Paused when paused;
  - the kind and owner under it ("Organisations · You");
  - the member count, today's change ("+3 / −1") and a 30-day size sparkline
    (`SizeSparkline`, scaled to its own range), all in DM Mono.

  On someone else's segment those three figures are the owner's alone and
  read "—" (screen readers: "Only the owner sees this figure"). Phones wrap
  the figures under the name. With no segments, the empty state explains what
  a segment is and offers New segment and "Filter Organizations, then Save as
  segment".
- **Builder (`/segments/new`, `/segments/:id/edit`).**
  - **Basics:** name, kind (fixed once saved) and description.
  - **Rules** (`RuleEditor`): readable rows of field, operator and value; All/Any;
    one level of groups; + Add condition and + Add group, disabled at 20.
    Each type has its own input (`ValueInput`): number and percent boxes, days,
    date or date-window, checkboxes for "is any of", owner and product selects
    or chips, and a server-searched organisation or account picker
    (`RecordPicker`). A record the reader can't open shows as an italic
    "an organisation you can't open".
  - **Preview** (`PreviewPanel`): beside the rules from `lg`, under them on
    phones. It reads "41 organisations match", the first ten, "and N more", and
    the totals. While a newer answer loads, the last one stays, dimmed.
  - **Sharing** (`SharingFields`): Only me, Everyone in the workspace, or Chosen
    teammates with chips.
  - **Alert me on changes.**
  - **400s** show at the field they name, and a limit above the form.

  A non-owner sees "Only {owner} can edit this segment" with Open segment and
  Duplicate to edit.
- **Segment (`/segments/:id`).**
  - **Header** (`SegmentHeader`): the name at 22px, the rules as one sentence
    (`RuleSentence`: fields and values in ink, figures in DM Mono, hidden
    records in italics), owner and sharing, then Edit, Duplicate, Export CSV
    and Delete. Edit and Delete are the owner's only.
  - **Tiles** (`SegmentTiles`): Members, ARR covered, Average health, Average
    CSAT and Last 7 days. Contacts get only Members and Last 7 days.
  - **Hidden members.** A shared reader sees "N more members you can't open".
  - **Members tab** (`MembersTab`):
    - Organisations and accounts use `AccountRow` (not selectable) with the
      kind's own search, Group and Sort; contacts use `ContactListItem`.
    - The owner's row menu has Pin / Unpin and Keep out.
    - A Kept out disclosure lists what is kept out, with Let back in.
  - **Changes tab** (`ChangesTab`): 7, 30 or 90 days, one rounded item per day
    with its totals, Entered and Left with the reason, and "+N more".
- **Save as segment** sits beside Filters on the Organizations and Accounts
  lists and before Add on Contacts.
```

- [ ] **Step 4: `docs/04-app-flow.md`**

1. In the route table, after the `/pipelines/{list,board}` row, add:

```markdown
| `/segments`, `/segments/new`, `/segments/:id`, `/segments/:id/edit` | `SegmentsList`, `Builder`, `SegmentPage` (`pages/segments/`). The list reads `GET /segments/?scope=&search=`. The builder reads `GET /segments/<id>/` to edit, previews with `POST /segments/preview/` (400 ms after the last change, latest answer wins), and saves with `POST /segments/` or `PATCH /segments/<id>/` (no `kind`); `?kind=` plus a list's own filters starts a new one from Save as segment. The page reads `GET /segments/<id>/`, `GET /segments/<id>/members/` (rows, and a `limit=1` read for the tiles and `hidden_count`), `GET /segments/<id>/changes/?days=` and `GET /segments/<id>/members/export.csv`; `?tab=changes` opens the Changes tab (the `segment_changes` alert's link). A 404 reads "Segment not found" for a missing segment and one not shared with the reader alike | auth |
```

2. Before `### 4.6 Copilot and multiplayer sessions`, add:

```markdown
### 4.5h Segments

Spec `docs/superpowers/specs/2026-10-03-segments-design.md`. Every read is the
reader's own: members are computed over what they may open, and a shared
reader also gets `hidden_count`, a count only.

1. **List.** `/segments` → `GET /segments/` (`scope=mine|shared`, `search=`
   when set). The owner's nightly figures (`member_count`, `today`, `sparkline`)
   are null on rows the reader does not own and read "—".
2. **Build.**
   - **Draft and preview.** `/segments/new` keeps the rules as a draft (uids,
     missing values). Each complete draft is previewed with
     `POST /segments/preview/ {kind, rules, pinned_ids, excluded_ids}`, 400 ms
     after the last change; an answer a newer draft superseded is dropped.
   - **Save.** `POST /segments/`, or `PATCH /segments/<id>/` without `kind`, then
     the segment opens.
   - **400s.** `{rules}`, `{name}`, `{shared_with}` and `{kind}` show at their
     fields, and `{detail}` (the 50-segment limit) above the form.
   - **Someone else's segment.** `/segments/<id>/edit` shows a read-only notice;
     **Duplicate to edit** POSTs `/segments/<id>/duplicate/` and opens the
     copy's builder.
3. **Save as segment.**
   - The Organizations, Accounts and Contacts lists open
     `/segments/new?kind=<kind>&<their own filter query>`.
   - `rulesFromList` turns it into rules: owner, lifecycle, health, product,
     renewal window, NPS band, organisation, account, sentiment and role.
     `include_churned=1` becomes "Churned is yes or no".
   - The search and picked `ids` don't carry over, and a note says so.
   - Names for the organisations and accounts named come from
     `GET /organizations/portfolio/?ids=` and `GET /accounts/portfolio/?ids=`.
4. **Open.**
   - `/segments/<id>` reads the segment, then the members (the kind's own rows;
     `search`, `sort` and `group` in the page URL; only `sort`, `group`,
     `group_value`, `search`, `cursor` and `limit` are sent).
   - A separate `limit=1` read gives the tiles and `hidden_count`.
   - **Pin, Unpin, Keep out and Let back in** are
     `PATCH /segments/<id>/members/<record>/ {state}` (owner only), then the
     members and tiles reload.
   - The **Kept out** list is named through the preview, with no rules and
     those ids as pins.
   - **Export CSV** fetches `members/export.csv` with the tab's search and sort.
   - **Delete** confirms, then DELETEs and returns to the list.
5. **Changes.** `?tab=changes&days=7|30|90` → `GET /segments/<id>/changes/?days=`.
   It shows each day's totals, up to 100 names each way and "+N more", and
   reasons as field names.
6. **Alert.** The nightly step's `segment_changes` notification shows in the
   bell like any other; clicking it opens `/segments/<id>?tab=changes`.
```

3. In "7. Dead ends a user can reach", change `| Sidebar: Product Feedbacks, Segments, Project Management | "Under Construction" |` to `| Sidebar: Product Feedbacks, Project Management | "Under Construction" |`.

- [ ] **Step 5: `.agents/workflows/repo-architecture.md`**

1. **Tree:**
   - under `features/`, after the `pipelines/` line, add `│   │   ├── segments/           ← Segments: types, API, the field registry mirror, the rule sentence and draft, list filters → rules, URL state`;
   - under `components/`, after its `pipelines/` line, add `│   │   ├── segments/           ← the rule editor and value inputs, preview, sharing, rows, tiles, header, Members and Changes tabs`;
   - under `pages/`, after its `pipelines/` line, add `│       ├── segments/           ← SegmentsList, Builder, SegmentPage`.
2. **Route map:** change the final `└── pipelines/` block's first line to `├── pipelines/`, prefix its children with `│   ` instead of four spaces, and append:

```
└── segments/
    ├── (index)                → SegmentsList (GET /segments/, scope and search in the URL)
    ├── new                    → Builder (?kind= and a list's filters from Save as segment)
    ├── :id                    → SegmentPage (?tab=members|changes)
    └── :id/edit               → Builder (owner; a read-only notice for anyone else)
```

3. **Portfolio file table:** after the `features/pipelines/*` row, add:

```markdown
| `features/segments/*`, `components/segments/*`, `pages/segments/*` | Segments: `segmentTypes`, `segmentApi`, `segmentFields` (the backend registry, mirrored and pinned by its test), `ruleSentence`, `ruleDraft`, `segmentErrors`, `fromListFilters`, `segmentParams`, `summaryFigures`; `RuleEditor`, `ValueInput`, `RecordPicker`, `Chip`, `PreviewPanel` + `usePreview`, `SharingFields`, `SegmentRow`, `SizeSparkline`, `SegmentTiles`, `SegmentHeader`, `MembersTab` (the one place the kind picks `AccountRow` under `ORGANIZATION_KIND`/`ACCOUNT_KIND` or `ContactListItem`), `MemberMenu` (on `MoveToMenu`), `KeptOut`, `ChangesTab`, `useSegment`; `features/segments/testSegments.ts` (`stubSegments`) and `pages/segments/testPages.tsx` (`renderSegments`, `renderInApp`) for tests |
```

4. After §10 Pipelines (before its closing `---`), add:

```markdown
### 11. Segments (`pages/segments/`)

Saved, rule-based groups of organisations, accounts or contacts (spec
`docs/superpowers/specs/2026-10-03-segments-design.md`), on backend
`services/segments`: the list, the builder with a live preview, and a
segment's page with tiles, Members (each kind's own rows, Pin and Keep out for
the owner) and Changes. Save as segment on the Organizations, Accounts and
Contacts lists opens the builder from their URL filters. Shared parts gained
optional props only: `AccountRow` `selectable`/`menu`, `ContactListItem`
`actions`, `MoveToMenu` `label`/`menuLabel`/`icon`, the toolbars'
`onSaveAsSegment`. See `docs/03-ui-ux-design.md` "Segments".
```

5. **Known Stubs:** change `| \`/segments\`, \`/projects\`, \`/surveys\`, \`/campaigns\`, \`/canvas\` | No route defined |` to `| \`/projects\`, \`/surveys\`, \`/campaigns\`, \`/canvas\` | No route defined |`.

- [ ] **Step 6: Commit**

```bash
git add src/components/segments/houseRules.test.ts src/e2e/segments.test.tsx src/pages/segments/testPages.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "docs(segments): the pages in the product documents; the house rules and the end-to-end journey

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Final verification

**Files:** none new.

- [ ] **Step 1: Everything Segments touches, one process**

Run: `npx vitest run --maxWorkers=2 src/features/segments src/components/segments src/pages/segments src/e2e/segments.test.tsx src/components/layout src/layouts src/components/organizations/portfolio src/components/contacts src/pages/organizations src/pages/accounts src/pages/contacts src/e2e/accountsPortfolio.test.tsx src/e2e/contacts.test.tsx`
Expected: every file passes.

- [ ] **Step 2: The whole suite, once, before the PR**

Run: `npx vitest run --maxWorkers=2`
Expected: every file passes. It is slow on this machine. Run it once here, not after each task.

`git diff origin/main --stat -- src/pages/organizations src/pages/accounts src/pages/contacts src/components/organizations src/components/contacts` should show test edits only in these places:
- the three `testList`/`testPage` harnesses (one route each);
- `AccountRow.test.tsx` (+2 tests);
- `ContactListItem.test.tsx` (+1 test);
- `MoveToMenu.test.tsx` (new).

- [ ] **Step 3: Types, lint, build**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: no errors. The only warnings are the known `react-hooks/set-state-in-effect` ones in the older forms.

- [ ] **Step 4: The anti-slop bar on the new files**

Run: `grep -nE "#[0-9a-fA-F]{3,8}\b|rgba?\(|text-\[(1[024]|12|14|16|17|18)(\.5)?px\]|h-screen|<table" src/components/segments/*.tsx src/pages/segments/*.tsx`
Expected: no output.

- [ ] **Step 5: Commit any fix** the steps above needed, with a message naming it (`fix(segments): …`).

---

### Task 18: Browser check, then finishing the branch

**Files:** none (a fix found here gets its own commit).

- [ ] **Step 1: Run the app against the backend branch**

Run the backend `feat/segments` (PR #84) locally with its migration applied:
- create two or three segments of each kind as an admin;
- share one with the workspace and one with a CSM limited to one department;
- run `run_health_maintenance` once so the nightly figures, sparklines and changes exist.

Start the frontend with `npm run dev`. Sign in as the admin, then as the limited CSM.

- [ ] **Step 2: Check at 1440px, light and dark** (claude-in-chrome or playwright-cli; screenshots go into the PR)

- `/segments`:
  - the framed bar reads "Segments";
  - All / Mine / Shared with me;
  - rows show count, "+N / −N" and a sparkline on mine, and "—" on the CSM's view of the admin's segment;
  - badges;
  - search;
  - the empty state as a user with none.
- `/segments/new`:
  - add conditions of every type (a percent range, a renewal window, lifecycle "is any of", an owner, an organisation picked by search, an AI attribute if one exists) and a group;
  - the preview updates about 400 ms after typing stops, without flashing;
  - save with no name, then with a bad value: messages at the field.
- Save as segment from `/organizations/list?health=poor&include_churned=1&search=a`: the builder shows Health is Poor, the churned-or-not group, and the search note.
- `/segments/:id`:
  - the sentence names records, and the CSM sees "an organisation you can't open" where they should;
  - the tiles;
  - the Members tab with search, group and sort;
  - Pin, Keep out, then Let back in;
  - Export CSV downloads;
  - the Changes tab at 7 / 30 / 90 days;
  - Delete and Duplicate;
  - the CSM sees "N more members you can't open" and no Edit or Delete;
  - the bell's segment alert opens the Changes tab.
- Dark mode: every surface is a token, with no light-only greys, and the italic hidden names stay readable.

- [ ] **Step 3: Check at 375px**

- the list rows wrap their figures under the name;
- the builder stacks the preview under the rules, and condition rows wrap field / operator / value;
- the tiles swipe sideways inside their strip, and the page never does;
- the Members rows are the Organizations, Accounts and Contacts phone rows, an opened row is a sheet, and the row menu is reachable;
- every control is at least 44px;
- the Changes days stack.

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch. The merge order is fixed: **backend PR #84 (`feat/segments`) merges and deploys first**, then this frontend PR. The PR description:
- links #84;
- lists the Decisions above for the owner;
- carries the 1440 (light and dark) and 375 screenshots;
- ends with the attribution line the session asks for.

---

## Self-review

**Spec coverage** (§3, §4 item 2, §5 frontend):

- **List:**
  - kind, count with today's change, 30-day sparkline, owner, shared badge → Task 10 (`SegmentRow`, `SizeSparkline`);
  - null owner figures as "—" (S8) → Task 10, Decision 14;
  - Mine / Shared with me / All, search, + New segment, empty state with the shortcut → Task 10.
- **Builder:**
  - basics → Task 11;
  - readable rule rows, All/Any, + Add condition / + Add group, groups that don't nest → Tasks 4 and 8;
  - a value input per type, with server-searched organisation and account pickers and the owner picker → Task 7, Decision 2;
  - live preview, debounced and cancelling stale answers → Task 9, Decision 3;
  - sharing with a people picker → Task 11 (`SharingFields`);
  - alert toggle → Task 11;
  - 400s at the field → Tasks 4 (`formErrors`) and 11;
  - the 20-condition limit → Task 8;
  - the 50-segment limit → Task 11.
- **Non-owner on the builder** → Task 11, Decision 4.
- **Segment page:**
  - header with the rules as a sentence → Tasks 3 and 14, Decision 1;
  - owner and sharing, Edit / Duplicate / Delete / Export with owner-only actions hidden → Task 14;
  - tiles → Tasks 6 and 14;
  - Members tab reusing each kind's rows with Pin / Keep out for the owner → Task 12, Decisions 8 and 9;
  - Changes tab day by day with totals and "+N more" → Task 13, Decision 6;
  - "N more members you can't open" → Task 14.
- **Save as segment** on Organizations, Accounts and Contacts, with search not carried over and `include_churned` mapped → Tasks 5 and 15, Decision 5.
- **Contract facts:**
  - members' six parameters → Tasks 6 and 12, the latter asserting it;
  - `hidden_count` a count only → Tasks 13 and 14;
  - null rule ids → Tasks 3 and 7;
  - 403/404 → Tasks 11 and 14;
  - 500 pins (its 400 detail surfaces through `onNotice`) → Task 12;
  - the `segment_changes` kind and what the bell renders → Task 1, Decision 15.
- **Routes, the framed bar, `DashboardLayout`** → Task 15, Decision 10.
- **Tests:**
  - unit: Tasks 1–9;
  - integration (real store and router, fetch stubbed) → Tasks 10–15;
  - the jsdom journey → Task 16;
  - house rules → Task 16;
  - Organizations / Accounts / Contacts still pass → Tasks 12, 15 and 17.
- **Docs** → Task 16. **Browser check, merge order and finishing** → Task 18.
- **Gaps:**
  - Spec §1's AI-attribute rules work through `useAttributes`, but no test seeds an attribute end-to-end. The unit tests in Task 2 cover the field shapes, and the browser check covers one real attribute.
  - The pin-limit 400 is surfaced but not asserted by a test, because the stub has no member-PATCH override. If the owner wants it pinned, add a `memberState` hook to `stubSegments` and one test in `MembersTab.test.tsx`.

**Placeholder scan:**
- Every code step shows its code.
- Every edit to an existing file names its anchor (an exact line or element) and gives the new text.
- The docs steps give the text to add.
- Tasks 9 and 16 say how to make a test fail once and how to restore it.

**Type consistency:**
- `SegmentKind`, `Rules`, `RuleLabels`, `Segment`, `SegmentListRow`, `SegmentSummary`, `SegmentMembersPage<R>`, `SegmentChanges`, `PreviewRequest`/`PreviewResponse` and `MemberStateValue`/`MemberState` are defined in Task 1 and used unchanged in Tasks 3–16.
- `FieldDef` (`key`, `label`, `type`, `choices`, `record`, `optional`, `section`) and `fieldsFor`/`findField`/`operatorsOf` are the same in Tasks 2, 3, 4, 7, 8, 11 and 13.
- `DraftRules`/`DraftCondition`/`DraftValue`, `shapeOf` and `firstIncomplete(draft, fieldOf)` are the same in Tasks 4, 7, 8 and 11.
- `ValueOptions` (`people`, `products`, `labels`, `onNamed(group, id, name)`) is the same in Tasks 7, 8 and 11.
- `PreviewState` (`incomplete` | `loading{last}` | `ready{data}` | `error{message}`) is the same in Tasks 9 and 11.
- `SegmentPageParams` (`tab`, `search`, `sort`, `group`, `days`) and `membersQuery(p, kind, extra)` are the same in Tasks 6, 12, 13 and 14.
- `summaryFigures(summary, kind)` takes no currency (the summary carries it) in Tasks 6, 9 and 14.
- `useSegment(id)` returns `[load, replace, retry]` in Tasks 11 and 14.
- `stubSegments`/`requests` and the fixtures' ids are the same everywhere: 7 Renewal risk (mine, customer), 8 EMEA accounts (Carl's, account), 9 Champions (mine, contact), a create gets 100, a duplicate 200, Alice is 1, Carl 4, Dana 5.
- `renderSegments(url, {width, nav})` and `renderInApp(ui, {url, width})` are the same in Tasks 10–16.

**Open ambiguity, for the owner:**
- Decision 9 names kept-out records through the preview endpoint. A dedicated `GET …/members/?state=excluded` on the backend would be cleaner; that is a backend change and is not in #84.
- Decision 5 maps `include_churned=1` to "Churned is yes or Churned is no". The contract's own example is a single `churned is …` condition, which would narrow the list to one side. Confirm the group reading.
