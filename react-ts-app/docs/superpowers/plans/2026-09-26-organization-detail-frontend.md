# The organisation page, frontend (delivery 1: the new page and the Story) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/organizations/:id` as the organization's story: the Organizations frame, a name row, four tiles, account chips, a real tablist (Story · Details · People · Deals & risks · Knowledge · Files), the Story (Needs attention, filters, Sources, search, + Add, a day-grouped stream that pages itself), Details on the List's six panels, today's People/Deals/Knowledge/Files content inside the new frame, and every removal in spec §1.10.

**Architecture:** Data lives in two small feature modules. `features/organizations/story*.ts` holds the §2 story contract (types, kinds, the API call, the day grouping) and `detailParams.ts` holds the page's URL state (`tab`, `account`, `group`, `source`, `q`). Presentational parts live in a new folder, `components/organizations/detail/`, beside `portfolio/`, whose `rowParts`, `AccountDetails`, `styles.ts`, `useEndSentinel`, `useDismiss` and section states they reuse. The page (`pages/organizations/Details.tsx`, rewritten) owns three reads: `useOrganization` (the portfolio row plus `/customers/{id}/`), the accounts (the existing `fetchAccountsForCustomer`) and `useStory` (the new endpoint, cursor-paged). It draws itself in `OrganizationsFrame` (no rail in delivery 1) under the Navbar's transparent top bar. "+ Add" reuses the existing create forms, lifted out of their tabs into a `Sheet`.

**Tech Stack:** React 19, TypeScript, react-router 7 (`useSearchParams`, `Link`), Redux Toolkit (the existing `customers`, `calls`, `files`, `knowledge`, `auth` slices), Tailwind v4 tokens, lucide-react, Vitest + Testing Library + user-event (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-26-organization-detail-design.md`. This plan covers §1 (page anatomy), §2 (the data it reads; the backend builds the story endpoint) and §4 delivery 1's frontend, with the frontend parts of §5. Ask on this page (§3) is delivery 3 and out of scope. The analysis behind the spec is `.superpowers/org-detail-analysis.md` (git-ignored scratch).

**Branch:** `feat/organization-detail` (it already exists and holds the spec). The companion backend PR (the story endpoint) merges and deploys first (spec §4).

## Global Constraints

- Header reads (spec §2): `GET /organizations/portfolio/?ids={id}&include_churned=1` (plus `limit=1`), which "gives one row with everything the List shows"; `ids` names archived rows too. `GET /customers/{id}/` adds `health_breakdown`, `csat_breakdown`, email, phone and industry.
- Accounts: `GET /customers/{id}/accounts/` gives the chips. "Their counts come from the story's `counts.by_account`."
- Story: `GET /api/v1/organizations/{id}/story/` (called as `/organizations/{id}/story/` through `apiFetch`, which prefixes `/api/v1`). **The backend is the source of truth** (`revenact-backend/docs/superpowers/plans/2026-09-26-organization-story-backend.md` and `services/organizations/story/` plus `OrganizationStoryView` in `services/organizations/views.py` on `feat/organization-story`, commits 04137dc (attention) and f2cf6b0 (the view), whose `tests/test_story_views.py` pins the response shape); Task 1 mirrors it. The view reads `today` as `timezone.localdate()` in the project's UTC time zone. `IsAuthenticated`; an organisation outside `visible_customers` is a **404** (it does not confirm the organisation exists). Parameters: `group` ∈ {conversations, tickets, tasks, feedback, health}; `source` (comma list of exact kinds); `account` (a positive account id, or `none` for the organization's own records; an id outside this organization's accounts in scope reads nothing, not a 404); `q` (trimmed, at most 200 characters); `thread` (an email `thread_id`: that thread's emails only; it narrows `items`, never `counts` or `attention`); `cursor`; `limit` (default 30, max 100; below 1 reads as 30). "Unknown values are dropped, never a 400."
- Story response: `{items, next_cursor, counts: {by_group, by_kind, by_account}, attention}`. Each item is `{id, kind, source, occurred_at, all_day, account: {id, name} | null, title, summary, actor: {id: number | null, name} | null, link: {thread_id: string | null, url: string | null}}`. `by_group` (keys `all` and the five groups) and `by_kind` (every kind) follow `account` and `q` but not `group` or `source`; `by_account` (keys `all`, `none` and every in-scope account id as a string) follows `group`, `source` and `q` but not `account`. `attention` follows `account` only. The shapes are fixed in Task 1 (pre-flight 10).
- Paging: one keyset cursor over `(occurred_at, kind, id)`, opaque, `null` on the last page, passed back verbatim (URL-encoded). The cursor is bound to `group`, `source`, `account`, `q` and `thread`: a cursor cut under other filters, or a malformed one, reads as page one. The page reads 30 at a time (`STORY_PAGE_SIZE`).
- The story is what has happened: anything dated from tomorrow (UTC) on (an upcoming meeting, a future-dated ticket) is left out of items and counts. A task is in the story at its `created_at`, not its due date (overdue tasks are the attention block's job). Health items are month-end `HealthSnapshot` changes of health category, AI pulse or CSM pulse only; lifecycle changes are not stored and never appear.
- Privacy is the server's (the twice-filter): the page shows exactly what arrives. The anomaly's `title` is always a string; for a viewer who does not see everything the server withholds the real title and sends "Similar reports across 1 of your companies", which the page shows as it came.
- Existing endpoints stay for create and edit: `/customers/{id}/…` tasks, notes, surveys, calls; `PATCH /customers/{id}/` (edit, churn); `POST /organizations/bulk/` (archive); `/customers/{id}/accounts/` (add and edit an account).
- Delivery 1 has no Ask on this page: no rail, no ✦ pill, no "Ask Copilot" link. The Navbar renders its empty actions slot, as on the List before delivery 3.
- House rules (spec §1 and `.claude/skills/revenact-design/SKILL.md` §1 and §4):
  - Tokens only: no hex, `rgb(`, `text-white` or named palette colours in `.tsx`.
  - One monochrome primary (`bg-accent` with `text-on-accent`); semantic colour only for status. Numbers in `font-mono-brand tabular-nums`.
  - Type sizes **11/13/15/22 px only** inside `components/organizations/detail/` and in `pages/organizations/Details.tsx` (the house-rules scan, Task 3 and Task 16).
  - No card-in-card; **no glass**. Rows and panels are `bg-surface` items on the canvas.
  - Skeletons shaped like what they stand for. Designed empty and error states.
  - Hover, focus-visible (`FOCUS` from `portfolio/styles.ts`), active and disabled states throughout. 44px touch targets below `sm` (`min-h-11 sm:min-h-9`). Motion only through existing tokens; the global reduced-motion override covers `transition-*` and `animate-pulse`.
  - No third-party images (no Clearbit logo, no pravatar avatar): initials only.
- Copy: sentence case, no em dashes in new UI copy ("—" standing alone as an empty value, as the List shows it, is a glyph, not punctuation, and is allowed), "organization"/"organizations" (US spelling) in UI text.
- Phones are `< 640px` (`SM = '(min-width: 640px)'` from `src/lib/useMediaQuery.ts`). jsdom has no `matchMedia`, so **`useMediaQuery` reads false (phone) in tests unless `setViewport(1440)` from `src/test/viewport.ts` runs first**. The page reads `isSm` once and passes it down. A layout that exists on phones only or on desktop only (the tile strip vs the grid, the bottom sheet vs the side panel) is rendered conditionally on `isSm`, never only CSS-hidden.
- jsdom has no `IntersectionObserver` and no `Element.prototype.scrollIntoView`. The code guards both (`useEndSentinel` does nothing without an observer and Show more does the paging; every `scrollIntoView` call is `?.()`).
- Tests follow `.claude/skills/testing/SKILL.md`: unit, integration (real store and router, network mocked at `fetch` with §2-shaped bodies through `stubOrganizationPage`), and e2e in `src/e2e/`.
- Gates: `npm run lint` passes with 0 errors and no new warnings in touched files, `npx tsc -b --noEmit`, `npx vitest run --maxWorkers=2`, and `npm run build`.
- Every commit ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Do not push. Do not switch branches.

## Pre-flight: where the spec meets the code

| # | Spec says | Code today | Resolution in this plan |
|---|---|---|---|
| 1 | Frame: the Organizations frame, a transparent top bar, `p-0`; the ✦ rail is delivery 3. | `/organizations/:id` is outside `OrganizationsAskLayout` (`App.tsx:203`). The Navbar draws a bordered 64px bar with a back chevron, a Clearbit logo and the uppercase name from `state.customers.selectedCustomer` (`Navbar.tsx:76-87, 270-288`). `DashboardLayout` pads `<main>`. | The route stays where it is. The page wraps itself in `OrganizationsFrame` (rail null). The Navbar gains `isOrgDetail` (`/^\/organizations\/\d+$/`): the framed transparent bar with a "‹ Organizations" link to `/organizations/list`, the empty actions slot and the bell, no avatar. Its old organization branch and the `selectedCustomer` read go. `DashboardLayout` adds the route to its `p-0` set (Task 17). |
| 2 | Header data: the portfolio row by `ids` plus `/customers/{id}/`. | `Details.tsx:58-65` fires six thunks into the global `customers` slice, and `ActivityFeed` fires eight more: about 15 requests. `parseInt('abc')` fetches `/customers/NaN/`. | `useOrganization(id, version)` (Task 4) fires both reads at once, keeps the old row on screen while a new version reloads, and says `notFound` when the portfolio returns no row for this viewer. A non-numeric id is not found with no request. Landing is exactly four requests: portfolio, customer, accounts, story. Every other tab reads when first opened. |
| 3 | Name row: initials avatar (no third-party logo), name, `owner · lifecycle · Touched Nd ago`, signal, Edit, ⋯ with Churn and Archive "gated as on the List". | The List offers Archive and Churn with no client-side capability check (the server applies its rules and reports each failure); Churn runs per account through `ChurnOrganizationModal`; Archive goes through `POST /organizations/bulk/`. | `OrganizationHeader` (Task 5) uses `row.initials`. ⋯ lists Archive unless the row is archived and Churn unless it has churned, and hides itself when neither applies. Archive confirms with `ConfirmDialog` and shows the server's failure reason there; Churn opens `ChurnOrganizationModal` for this one id. Edit opens `OrganizationFormModal` with the customer already read (disabled until it lands). |
| 4 | Tiles: Health (ring, trend, tap for the breakdown), ARR (customer's currency), Renewal (runway), Pulse (AI · CSM, dots, disagree). A tile jumps to its Details panel. Phones: a snapping strip. | `HealthPopover` exists, unused, as a fixed hover tooltip with an `rgba` shadow and 10-12px type. The portfolio row's `arr` is in the org currency; `details.commercial.arr_billed_at_account` is in the customer's own. | `HeaderTiles` (Task 6) reuses `HealthRing`, `TrendLine`, `RenewalRunway` and `PulsePair`. The Health tile toggles an inline `HealthBreakdown` (a token-only list of the five rubric components from `health_breakdown`). ARR shows `arr_billed_at_account` in `details.commercial.currency`. ARR, Renewal and Pulse jump to the Commercial, Contract timeline and Voice panels: the tab switches to Details and the panel scrolls into view and takes focus. From `sm` the tiles are a four-column grid; below it, a `snap-x` strip. |
| 5 | Pulse: the List's form; the blended "Account Pulse" is dropped. | `MetricsBanner` shows `account_pulse`; `PinnedAttributes` draws five fake teal dots. | Only `PulsePair` appears (tile), and the AI reason is in Details' Voice panel. Neither the banner nor the pinned panel survives the rewrite. |
| 6 | Account chips `All · <Account> <n>`, counts from `counts.by_account`, `?account=` in the URL; `account=none` means "Organisation". | Nothing names the `by_account` keys, or whether a count ignores the account filter. | The backend names them: `by_account` has `all` (the total), `none` (records on the organization itself) and one key per account in scope (its id as a string, 0 included); it follows `group`, `source` and `q` but ignores `account` (so every chip keeps its number while one is chosen). `by_group` (`all` plus the five groups) and `by_kind` follow `account` and `q` and ignore `group` and `source`. `AccountChips` (Task 7) shows All (`by_account.all`), each account (`by_account[id]`, 0 when absent, i.e. out of the viewer's scope) and an "Organization" chip when `none` has items or is chosen. |
| 7 | A chip filters Story, People and Deals & risks; delivery 2 turns People and Deals into list items "filtered by account". | `ContactsTab` and `PipelinesTab` have no account filter to take. | In delivery 1 the chips show on the Story tab only and filter only the story. `?account=` stays in the URL while other tabs are open, so delivery 2 can read it. |
| 8 | Six tabs; the Accounts tab is not among them. | The Accounts tab holds account Add/Edit (`AccountFormModal`), a banner, a spreadsheet table with dead controls and a drill to `/accounts/:id`, which falls back to mock data on refresh (spec §6). | The Accounts tab goes, but no account detail is lost (**owner's decision, 2026-09-26**). The chips stay on the Story tab as the filter; the chip row ends with **Add account** (`AccountFormModal` create, then the accounts reload) and, while an account chip is chosen, **Edit <account>** (`AccountFormModal` edit). The Details tab opens with an **Accounts** section (`AccountsSection`, Task 15): one list item per connected account, not a table, with its name linking to `/accounts/:id`, owner, domain, pulse dots, "AI n" with the AI label and the AI reason (every one a field `GET /customers/{id}/accounts/` serves; `Account` gains the served `ai_pulse_value`), Edit on each and Add account, with designed loading, error and empty states. `/accounts/:id` still falls back to mock data on refresh (spec §6); that page is its own work. |
| 9 | "Success Plans, Custom Objects and Canvases become tabs when built." | Custom Objects and Canvas List are real tabs today; `/accounts/:id` renders the same components. | They leave this page with the rest of the old tab bar. `CustomObjectsTab` and `CanvasListTab` stay in `components/shared/` for `/accounts/:id`. |
| 10 | §2 names the story fields but not their values. | The backend plan (`2026-09-26-organization-story-backend.md`) and its code on `feat/organization-story` (`services/organizations/story/params.py`, `cursor.py`, `items.py`, `health.py`, `scope.py`, `sources.py`, `attention.py`, `build.py`, and `OrganizationStoryView` in `views.py`, commit f2cf6b0) fix them; the code wins where the two differ. | Task 1 mirrors the backend exactly. `kind` ∈ {activity, calendar_event, call, email, health, note, survey, task, ticket} (a Call is its own kind, its `summary` is `Call.summary`); groups: conversations = activity, call, email, calendar_event; tickets = ticket; tasks = task, note; feedback = survey; health = health. `id` is the record's own pk (unique with `kind`). `source` is the provider in lower case: a connector's (`zendesk`, `jira`, `freshdesk`, `webhook`, `intercom`, `salesforce`, `hubspot`, `slack`, `gmail`, `ms_teams`, `zoom`, `github`, `figma`), a mailbox's (`google`, `microsoft`, `imap`), or `revenact` for anything logged in the app; the page names it with `sourceName`. `occurred_at` is always an ISO 8601 UTC timestamp; `all_day: true` marks a date-only record (activity, calendar event, ticket, note, survey, health), whose date is the date part of `occurred_at` (midnight UTC), not a moment. `actor` is `{id, name}` with `id` a user id when the row links a user and `null` when only a name is stored, or `null` (activity, calendar event, survey, health). `link` is `{thread_id, url}`: `thread_id` is an email's thread (null when blank); `url` is a ticket's `external_url` or a call's `recording_url`, sent only when it starts with `http://` or `https://`, else null. `attention` (`story/attention.py`) is exactly `{renewal: {date, days, overdue} \| null, tickets: {count, oldest_days} \| null, overdue_tasks: {count, oldest_days} \| null, questions: {count} \| null, anomaly: {id, title, first_seen_at, last_seen_at} \| null}`, each null when nothing needs attention: renewal only when overdue or due within 30 days and never for a churned organization; tickets are open High or Critical; `anomaly.title` is always a string (withheld as "Similar reports across 1 of your companies" unless the viewer sees everything). |
| 11 | Filters: All · Conversations · Tickets · Tasks & notes · Feedback · Health & usage, a Sources picker (exact types) and search. "A source with no real data never appears." | The feed's 13 chips include placeholders (Pulse, Conversations, Revenact Support), a fake Slack filter and browser-only Sessions. | `STORY_GROUPS` and `STORY_KINDS` (Task 1) list only the nine real kinds. The Sources picker offers the chosen group's kinds that have data (`counts.by_kind[kind] > 0`, the backend's answer to "a source with no real data never appears in Sources"), plus any already chosen; choosing a group drops sources outside it. `group`, `source` and `q` live in the URL too, so a filtered story survives refresh and Back; search writes `q` 300ms after typing stops (or on Enter), with `replace`. Filters with a zero count still show. |
| 12 | "+ Add: Log activity, New task, New note, Log survey. These are the existing create flows." | Each flow is an inline form toggled inside its own tab (`TasksTab`, `NotesTab`, `SurveysTab`, `CallSenseTab`). `Activity` has no create endpoint (`CustomerActivityListView` is list-only; backend pre-flight 22). A call create endpoint does exist: `_CallListView` is a `ListCreateAPIView` behind `POST /customers/{id}/calls/` and `POST /customers/{id}/accounts/{account_id}/calls/`, which CallSense's "Log a call" uses. | Task 12 lifts each form out as an exported component (`TaskForm`, `NoteForm`, `CallForm`, `LogSurveyForm`), leaving the tabs' behaviour and labels unchanged. `AddFlow` (Task 13) shows the chosen one in a `Sheet`; the menu reads **Log a call · New task · New note · Log survey**. It creates on the organization, or on the chosen account when an account chip is active. On success the sheet closes, the story reloads and a polite status says "Added to the story." |
| 13 | "Opening an email shows its thread." | `EmailThreadPanel` invents a kickoff message for every logged email (`buildThread`), loads pravatar avatars, and its Reply, Forward, quick-reply and emoji controls do nothing. | The backend has no thread endpoint; it adds `thread=<thread_id>` to the story (backend pre-flight 14): that thread's emails only, across the organization and its accounts, under the same rules, newest first; it narrows `items`, not `counts` or `attention`. A new `EmailThread` (Task 11) reads `GET /organizations/{id}/story/?thread=<link.thread_id>&limit=100` (every page, through `fetchThread`) and shows the messages oldest first, each with its sender (`actor`), time and summary (the backend's one-line, 240-character `summary`; the full message stays in Communications). An email whose `link.thread_id` is null (logged in Revenact) has no thread and opens in place like any other item. No reply controls on this page; replying stays in Communications. `EmailThreadPanel` stays for `/accounts/:id`. |
| 14 | "Other items open their existing detail." | Tasks, notes, activities, calendar events and health changes have no detail page; a ticket has its `external_url`, a call its `recording_url`; surveys are edited on `/surveys`. | A non-email item's title toggles it open in place (the full summary) and, when the server sends `link.url`, an "Open in <source>" link (external, new tab, `rel="noopener noreferrer"`, `http(s)://` only, as the backend already guarantees). The backend sends no in-app paths, so there are no in-app links. |
| 15 | Calls carry their CallSense summary. | CallSense is a feed sub-tab listing calls with recording, participants and transcript. | The story shows a call's summary (the backend's `summary`). The full CallSense list moves to the **Files** tab under a "Calls" heading, beside the files, as "current content". |
| 16 | Knowledge is today's Company View. | Headlines (an AI digest with Regenerate) and AI attributes are real and have no place in the six tabs. | Headlines go under Company View on the Knowledge tab. `AIAttributesPanel` goes under the six panels on the Details tab. |
| 17 | The next page loads at the end of the list. | `useEndSentinel` and `MoreButton` exist in `portfolio/`. | `StoryStream` (Task 10) reuses both: a 1px sentinel after the last day and a visible Show more as the fallback. The observer's root is the viewport (the frame is unchanged). |
| 18 | Details: the List's six panels, stacked on phones, with Edit details. | `AccountDetails` takes `stacked` and `onEdit`. | `DetailsTab` (Task 15) renders the Accounts section (pre-flight 8), then `AccountDetails stacked={!isSm}`, whose Edit details opens the same `OrganizationFormModal`, then `CustomerFacts`: the email, phone and industry and the CSAT response bands that `GET /customers/{id}/` adds (spec §2) and the six panels do not show (Voice shows only the CSAT score). |
| 19 | Removals (§1.10). | The Slack tab, fake pinned Pulse, invented NPS counts, placeholders, "Enable new 360 UI", every dead control, Clearbit and pravatar, `PinnedAttributes`, the All-attributes modal and the Overview sub-tab all live in `Details.tsx` or in shared components the account page also renders (`ActivityFeed`, `PinnedAttributes`, `SlackTab`, `EmailThreadPanel`). | The rewrite drops everything from this page. Shared components `/accounts/:id` still imports stay (spec §6 plans that page). `HealthPopover` and `CsatPopover` have no importers left and are deleted after a grep (Task 18). The house-rules scan also forbids `clearbit` and `pravatar` in the new folder and the page. |
| 20 | Tests at three levels. | `Details.test.tsx` has 40 tests, most about the old page. Its Contacts, Pipelines and Surveys tests are the only coverage of `ContactsTab`, `PipelinesTab` and `SurveysTab`, which live on. | Task 12 moves the survey tests to `SurveysTab.test.tsx` and Task 15 moves the contacts and pipelines tests to `PeopleTab.test.tsx` and `DealsTab.test.tsx`, by line range from the untouched file, rendering those components directly. Task 16 replaces `Details.test.tsx` with the new page's integration tests. |
| 21 | The Surveys page's row-click lands on this page's Surveys filter. | `SurveysPage.tsx:86` navigates with `state.activityFilter: 'Surveys'`. | It navigates to `/organizations/{id}?group=feedback` (Task 16). `ActivityFeed`'s `initialFilter` stays for `/accounts/:id`. |
| 22 | Every new part meets the house rules. | `portfolio/houseRules.test.ts` scans its own folder only. | Task 3 lifts its scanners into `src/test/houseRules.ts` (`houseRuleSuite`), adds a no-third-party-image rule, and points a second suite at `detail/` (and, from Task 16, at `pages/organizations/Details.tsx`). |
| 23 | The account tag reads "Organisation" when an item has no account. | The app's UI copy says "organization". | The tag and the chip read **Organization**, matching the app's US spelling rule. |
| 24 | Items are grouped by day. | `occurred_at` is always a UTC timestamp; `all_day` marks a date-only record (cast to midnight UTC). | `dayKey(item)` reads a timed item in the viewer's time zone and an `all_day` item as the date part of `occurred_at` (so a note never slips to the day before west of UTC); an `all_day` item shows no time. Days read "Today", "Yesterday" or "31 Aug 2026". |
| 25 | The story's scope in time and kind. | Backend pre-flight 7, 9 and 10. | Future-dated records are excluded (nothing on or after tomorrow's midnight UTC), a task appears at its `created_at`, and Health & usage holds only health-category, AI-pulse and CSM-pulse changes between month-end snapshots. The page adds no rule of its own; the test stub mirrors all three. |

## File map

Create:
- `src/features/organizations/`:
  - `storyTypes.ts`: the §2 story types.
  - `storyKinds.ts` (+ `.test.ts`): groups, kinds, labels, source names, the + Add flows.
  - `storyApi.ts` (+ `.test.ts`): `storyQuery`, `fetchStory`, `fetchThread`.
  - `storyDays.ts` (+ `.test.ts`): day keys, labels, grouping.
  - `detailParams.ts` (+ `.test.ts`): the page's URL state and tab ids.
  - `testStory.ts`: fixtures and `stubOrganizationPage`.
- `src/test/houseRules.ts` (+ `houseRules.test.ts`): the shared house-rules suite.
- `src/components/organizations/detail/`:
  - `houseRules.test.ts`, `fieldCoverage.test.tsx`
  - `useDetailParams.ts` (+ test), `useOrganization.ts` (+ test), `useStory.ts` (+ test)
  - `Sheet.tsx` (+ test), `Menu.tsx` (+ test)
  - `OrganizationHeader.tsx` (+ test), `HealthBreakdown.tsx`, `HeaderTiles.tsx` (+ test, covering the breakdown)
  - `AccountChips.tsx` (+ test), `DetailTabs.tsx` (+ test)
  - `AttentionBlock.tsx` (+ test), `SourcesPicker.tsx`, `StoryToolbar.tsx` (+ test, covering Sources)
  - `StoryItemRow.tsx`, `StoryStream.tsx` (+ test, covering the row)
  - `EmailThread.tsx` (+ test), `AddFlow.tsx` (+ test), `StoryTab.tsx` (+ test)
  - `CountChip.tsx`, `CustomerFacts.tsx` (+ test)
  - `AccountsSection.tsx` (+ test), `DetailsTab.tsx`, `PeopleTab.tsx` (+ test), `DealsTab.tsx` (+ test), `KnowledgeTab.tsx`, `FilesCallsTab.tsx` (+ `otherTabs.test.tsx`)
- `src/components/organizations/activity/SurveysTab.test.tsx` (moved tests).
- `src/pages/organizations/testDetail.tsx`: `makeDetailStore`, `renderOrganizationPage`.
- `src/e2e/organizationDetail.test.tsx`.

Modify:
- `src/components/organizations/portfolio/houseRules.test.ts` (uses the shared suite).
- `src/components/organizations/portfolio/styles.ts` (`PRIMARY`, Task 9) and `rowParts.tsx` (`PulseDots`, Task 15).
- `src/components/organizations/ConfirmDialog.tsx` (the `bg-scrim` token, Task 16).
- `src/components/organizations/activity/TasksTab.tsx`, `NotesTab.tsx`, `CallSenseTab.tsx`, `SurveysTab.tsx` (forms exported).
- `src/pages/organizations/Details.tsx` (rewrite), `Details.test.tsx` (rewrite), `OrganizationsFrame.tsx` (comment).
- `src/pages/surveys/SurveysPage.tsx` and `SurveysPage.test.tsx`.
- `src/components/layout/Navbar.tsx` and `Navbar.test.tsx`; `src/layouts/DashboardLayout.tsx` and `DashboardLayout.test.tsx`.
- `src/components/contacts/ContactRowActionsPopover.tsx` (one comment).
- `src/features/customers/customersSlice.ts` (`Account.ai_pulse_value`, Task 1).
- Docs: `docs/04-app-flow.md`, `docs/03-ui-ux-design.md`, `.agents/workflows/repo-architecture.md`.

Delete (Task 18): `src/components/organizations/HealthPopover.tsx`, `HealthPopover.test.tsx`, `CsatPopover.tsx`, `CsatPopover.test.tsx`.

Kept on purpose (used by `/accounts/:id` or other pages): `ActivityFeed`, `PinnedAttributes`, the `activity/*Tab` components, `EmailThreadPanel`, `SlackTab`, `accountActivityData`, `CustomObjectsTab`, `CanvasListTab`, `EntityAvatar`, `mapCustomerToOrgRow`, `mapAccountToAccountRow`, `AccountFormModal`.

---
### Task 1: The story contract, its kinds and the test stub

**Files:**
- Create: `src/features/organizations/storyTypes.ts`
- Create: `src/features/organizations/storyKinds.ts`
- Create: `src/features/organizations/storyApi.ts`
- Create: `src/features/organizations/testStory.ts`
- Modify: `src/features/customers/customersSlice.ts` (`Account` gains `ai_pulse_value?: number | null`, which `AccountSerializer` already serves; the fixtures below set it)
- Test: `src/features/organizations/storyKinds.test.ts`, `src/features/organizations/storyApi.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (`src/lib/apiClient.ts`); `buildPortfolio`, `customerFixture`, `pizzaHut` (`testPortfolio.ts`); `PortfolioRow`, `BulkRequest` (`portfolioTypes.ts`); `Account`, `Customer` (`customersSlice.ts`).
- Produces:
  - Types: `StoryGroup`, `StoryKind`, `StoryRef`, `StoryActor`, `StoryLink`, `StoryItem`, `StoryAttention`, `StoryCounts`, `StoryResponse` (exactly as below, mirroring the backend's `items.py`, `build.py` and its plan's Task 7).
  - `STORY_GROUPS: {key: StoryGroup | ''; label: string}[]`, `GROUP_KEYS: StoryGroup[]`, `STORY_KINDS: {kind; label; group}[]`, `KIND_GROUP: Record<StoryKind, StoryGroup>`, `KIND_NAME: Record<StoryKind, string>`, `isStoryKind(v: string): v is StoryKind`, `isStoryGroup(v: string): v is StoryGroup`, `kindsIn(group: StoryGroup | ''): StoryKind[]`, `offeredSources(group, byKind, selected): StoryKind[]`, `sourceName(source: string): string`, `type AddKind = 'call' | 'task' | 'note' | 'survey'`, `ADD_FLOWS: {key: AddKind; label: string}[]`.
  - `STORY_PAGE_SIZE = 30`, `THREAD_PAGE_SIZE = 100`, `storyPath(orgId: number): string`, `interface StoryFilters {group: StoryGroup | ''; sources: StoryKind[]; account: string; q: string}`, `storyQuery(f: StoryFilters, limit?: number): string`, `fetchStory(orgId: number, query: string, cursor?: string | null): Promise<StoryResponse>`, `fetchThread(orgId: number, threadId: string): Promise<StoryItem[]>`.
  - Test-only (`testStory.ts`): `EMEA`, `NORTH_AMERICA` (`StoryRef`), `ACCOUNTS: Account[]`, `pizzaHutCustomer: Customer`, `STORY_ITEMS: StoryItem[]`, `PIZZA_ATTENTION`, `QUIET_ATTENTION: StoryAttention`, `THREAD_ITEMS: StoryItem[]`, `MEMBERS`, `manyItems(n: number): StoryItem[]`, `buildStory(query, book, attention, accountIds): StoryResponse`, `stubOrganizationPage(stub?: OrganizationPageStub)` (returns the fetch spy; `failPortfolio`, `failCustomer` and `failStory` make the first reads fail), `storyQueries(spy): URLSearchParams[]`, `portfolioRequests(spy): URLSearchParams[]`, `postBodies(spy, path: string): Record<string, unknown>[]`, `requestPaths(spy): string[]`.

- [ ] **Step 1: Write the failing tests**

`src/features/organizations/storyKinds.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  ADD_FLOWS,
  GROUP_KEYS,
  KIND_GROUP,
  STORY_GROUPS,
  STORY_KINDS,
  isStoryGroup,
  isStoryKind,
  kindsIn,
  offeredSources,
  sourceName,
} from './storyKinds';

describe('story groups and kinds (spec §1.6 and "Where today\'s 13 feed filters go")', () => {
  it('lists the six filters in the spec order, All first', () => {
    expect(STORY_GROUPS.map((group) => group.label)).toEqual([
      'All',
      'Conversations',
      'Tickets',
      'Tasks & notes',
      'Feedback',
      'Health & usage',
    ]);
    expect(STORY_GROUPS.slice(1).map((group) => group.key)).toEqual(GROUP_KEYS);
  });

  it('files every real kind under one group and lists no placeholder source', () => {
    expect(STORY_KINDS.map((kind) => kind.kind)).toEqual([
      'call',
      'activity',
      'email',
      'calendar_event',
      'ticket',
      'task',
      'note',
      'survey',
      'health',
    ]);
    expect(kindsIn('conversations')).toEqual(['call', 'activity', 'email', 'calendar_event']);
    expect(kindsIn('tasks')).toEqual(['task', 'note']);
    expect(kindsIn('')).toHaveLength(9);
    expect(KIND_GROUP.survey).toBe('feedback');
    expect(isStoryKind('email')).toBe(true);
    expect(isStoryKind('slack')).toBe(false);
    expect(isStoryGroup('health')).toBe(true);
    expect(isStoryGroup('sessions')).toBe(false);
  });

  it('offers a group\'s sources that have data, keeps a chosen one, and offers all until counts land', () => {
    const byKind = { activity: 0, calendar_event: 0, call: 1, email: 1, health: 1, note: 0, survey: 0, task: 1, ticket: 1 };
    expect(offeredSources('tasks', byKind, [])).toEqual(['task']);
    expect(offeredSources('tasks', byKind, ['note'])).toEqual(['task', 'note']);
    expect(offeredSources('tasks', null, [])).toEqual(['task', 'note']);
  });

  it('names where a record came from, and nothing for a record logged in Revenact', () => {
    expect(sourceName('zendesk')).toBe('Zendesk');
    expect(sourceName('google')).toBe('Gmail');
    expect(sourceName('ms_teams')).toBe('Microsoft Teams');
    expect(sourceName('revenact')).toBe('');
    expect(sourceName('newcomer')).toBe('newcomer');
  });

  it('offers the four existing create flows (a call has a create endpoint; an activity has none)', () => {
    expect(ADD_FLOWS.map((flow) => flow.label)).toEqual(['Log a call', 'New task', 'New note', 'Log survey']);
  });
});
```

`src/features/organizations/storyApi.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStory, fetchThread, storyPath, storyQuery } from './storyApi';
import { manyItems, requestPaths, storyQueries, stubOrganizationPage } from './testStory';

const ALL = { group: '' as const, sources: [], account: '', q: '' };

describe('storyQuery', () => {
  it('writes only the filters that are set, in one fixed order, with the page size', () => {
    expect(storyQuery(ALL)).toBe('limit=30');
    const query = new URLSearchParams(
      storyQuery({ group: 'conversations', sources: ['email', 'call'], account: 'none', q: '  renewal ' }),
    );
    expect([...query.keys()]).toEqual(['group', 'source', 'account', 'q', 'limit']);
    expect(query.get('source')).toBe('email,call');
    expect(query.get('account')).toBe('none');
    expect(query.get('q')).toBe('renewal');
    expect(new URLSearchParams(storyQuery(ALL, 5)).get('limit')).toBe('5');
  });
});

describe('fetchStory', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads GET /api/v1/organizations/<id>/story/ and passes the cursor back verbatim', async () => {
    const spy = stubOrganizationPage({ items: manyItems(35) });
    const first = await fetchStory(7, storyQuery(ALL));
    expect(first.items).toHaveLength(30);
    expect(first.next_cursor).toBe('30');
    const second = await fetchStory(7, storyQuery(ALL), first.next_cursor);
    expect(second.items).toHaveLength(5);
    expect(second.next_cursor).toBeNull();
    expect(storyQueries(spy).map((query) => query.get('cursor'))).toEqual([null, '30']);
    expect(new URL(String(spy.mock.calls[0][0])).pathname).toBe('/api/v1/organizations/7/story/');
    expect(storyPath(7)).toBe('/organizations/7/story/');
  });

  it('counts each facet without its own filter, as the backend does', async () => {
    stubOrganizationPage();
    const data = await fetchStory(7, storyQuery({ ...ALL, group: 'tickets' }));
    expect(data.items.map((item) => `${item.kind}:${item.id}`)).toEqual(['ticket:88']);
    expect(data.counts.by_group).toEqual({ all: 5, conversations: 2, tickets: 1, tasks: 1, feedback: 0, health: 1 });
    expect(data.counts.by_kind).toEqual({
      activity: 0,
      calendar_event: 0,
      call: 1,
      email: 1,
      health: 1,
      note: 0,
      survey: 0,
      task: 1,
      ticket: 1,
    });
    expect(data.counts.by_account).toEqual({ all: 1, none: 0, '31': 0, '32': 1 });
  });

  it('reads one email thread through ?thread=, every page, oldest first', async () => {
    const spy = stubOrganizationPage();
    const thread = await fetchThread(7, 't-1');
    expect(thread.map((item) => item.id)).toEqual([40, 41]);
    expect(thread.every((item) => item.kind === 'email' && item.link.thread_id === 't-1')).toBe(true);
    expect(requestPaths(spy)).toEqual(['GET /organizations/7/story/']);
    expect(Object.fromEntries(storyQueries(spy)[0])).toEqual({ thread: 't-1', limit: '100' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/organizations/storyKinds.test.ts src/features/organizations/storyApi.test.ts`
Expected: FAIL with "Failed to resolve import './storyKinds'" (and './storyApi', './testStory').

- [ ] **Step 3: Implement**

The frontend `Account` type lacks the `ai_pulse_value` that `GET /customers/{id}/accounts/` serves (`AccountSerializer` in revenact-backend `services/customers/serializers.py`), and the fixtures below set it. In `src/features/customers/customersSlice.ts`, inside `export interface Account`, directly under `ai_pulse_reason: string;`, add:
```ts
  /** The AI pulse as a number (1-5), null when unscored; AccountSerializer's `ai_pulse_value`. Optional because older fixtures omit it. */
  ai_pulse_value?: number | null;
```

`src/features/organizations/storyTypes.ts`:
```ts
// Mirrors GET /api/v1/organizations/{id}/story/. The backend is the source of
// truth: revenact-backend services/organizations/story/ (params.py, items.py,
// build.py) and its plan's Task 7 (attention). Change the two together.

/** The story's filter groups (`group`). All is the absence of one. */
export type StoryGroup = 'conversations' | 'tickets' | 'tasks' | 'feedback' | 'health';

/** The exact record kinds (`source` takes a comma list of these). */
export type StoryKind =
  | 'activity'
  | 'calendar_event'
  | 'call'
  | 'email'
  | 'health'
  | 'note'
  | 'survey'
  | 'task'
  | 'ticket';

export interface StoryRef {
  id: number;
  name: string;
}

/** Who did it. `id` is a user id when the record links a user, null when it
 *  stores only a name (a sender, a call host, a ticket requester). */
export interface StoryActor {
  id: number | null;
  name: string;
}

export interface StoryLink {
  /** An email's thread (read with `?thread=`); null for every other kind and
   *  for an email with no thread. */
  thread_id: string | null;
  /** A ticket's external URL or a call's recording, only ever http(s); null
   *  otherwise. */
  url: string | null;
}

export interface StoryItem {
  /** The record's own id; unique together with `kind`. */
  id: number;
  kind: StoryKind;
  /** Where the record came from, in lower case: a connector's or mailbox's
   *  provider ('zendesk', 'zoom', 'google', ...), or 'revenact' when it was
   *  logged in the app. `sourceName` puts it in words. */
  source: string;
  /** Always an ISO 8601 UTC timestamp. */
  occurred_at: string;
  /** A date-only record: its day is the date part of `occurred_at` (midnight
   *  UTC), and it has no time of day. */
  all_day: boolean;
  /** The account it is filed against; null when it is on the organization itself. */
  account: StoryRef | null;
  title: string;
  /** One line, at most 240 characters. A call's is its CallSense summary. '' when there is none. */
  summary: string;
  /** Null when nobody is recorded (activities, meetings, surveys, health). */
  actor: StoryActor | null;
  link: StoryLink;
}

/** Needs attention (backend plan Task 7). It follows the account filter only;
 *  each part is null when nothing needs it. */
export interface StoryAttention {
  /** Only when overdue or due within 30 days; never for a churned organization. */
  renewal: { date: string; days: number; overdue: boolean } | null;
  /** Open High or Critical tickets, and the age of the oldest in days. */
  tickets: { count: number; oldest_days: number } | null;
  /** Open tasks past their due date, and how many days the oldest is late. */
  overdue_tasks: { count: number; oldest_days: number } | null;
  /** Unanswered Knowledge questions on the organization. */
  questions: { count: number } | null;
  /** The latest live anomaly. `title` is withheld server-side ("Similar
   *  reports across 1 of your companies") unless the viewer sees everything. */
  anomaly: { id: number; title: string; first_seen_at: string; last_seen_at: string } | null;
}

export interface StoryCounts {
  /** `all` and every group, under the account and search filters (not group or source). */
  by_group: Record<StoryGroup | 'all', number>;
  /** Every kind, under the account and search filters (not group or source). */
  by_kind: Record<StoryKind, number>;
  /** `all`, `none` (records on the organization itself) and every account in
   *  scope by id, under the group, source and search filters (not the account filter). */
  by_account: Record<string, number>;
}

export interface StoryResponse {
  items: StoryItem[];
  /** Opaque; null on the last page. */
  next_cursor: string | null;
  counts: StoryCounts;
  attention: StoryAttention;
}
```

`src/features/organizations/storyKinds.ts`:
```ts
import type { StoryGroup, StoryKind } from './storyTypes';

/** The story's filters in toolbar order (spec §1.6). '' is All. */
export const STORY_GROUPS: { key: StoryGroup | ''; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'tasks', label: 'Tasks & notes' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'health', label: 'Health & usage' },
];

export const GROUP_KEYS: StoryGroup[] = ['conversations', 'tickets', 'tasks', 'feedback', 'health'];

/** Every exact kind the story reads today, with its group (spec §1, "Where
 *  today's 13 feed filters go"). A source with no real data (Slack, in-app
 *  conversations, Revenact Support) is not listed until it is real. */
export const STORY_KINDS: { kind: StoryKind; label: string; group: StoryGroup }[] = [
  { kind: 'call', label: 'Calls', group: 'conversations' },
  { kind: 'activity', label: 'Activities', group: 'conversations' },
  { kind: 'email', label: 'Emails', group: 'conversations' },
  { kind: 'calendar_event', label: 'Calendar events', group: 'conversations' },
  { kind: 'ticket', label: 'Tickets', group: 'tickets' },
  { kind: 'task', label: 'Tasks', group: 'tasks' },
  { kind: 'note', label: 'Notes', group: 'tasks' },
  { kind: 'survey', label: 'Surveys', group: 'feedback' },
  { kind: 'health', label: 'Health changes', group: 'health' },
];

export const KIND_GROUP = Object.fromEntries(STORY_KINDS.map((k) => [k.kind, k.group])) as Record<StoryKind, StoryGroup>;

/** One item's kind in words, for its meta line ("Email · Carl CSM"). */
export const KIND_NAME: Record<StoryKind, string> = {
  call: 'Call',
  activity: 'Activity',
  email: 'Email',
  calendar_event: 'Calendar event',
  ticket: 'Ticket',
  task: 'Task',
  note: 'Note',
  survey: 'Survey',
  health: 'Health change',
};

export function isStoryKind(value: string): value is StoryKind {
  return STORY_KINDS.some((k) => k.kind === value);
}

export function isStoryGroup(value: string): value is StoryGroup {
  return (GROUP_KEYS as string[]).includes(value);
}

/** The kinds a group covers; every kind for All. */
export function kindsIn(group: StoryGroup | ''): StoryKind[] {
  return STORY_KINDS.filter((k) => !group || k.group === group).map((k) => k.kind);
}

/** The Sources picker's kinds: the group's kinds that have data (`by_kind`,
 *  the backend's "a source with no real data never appears in Sources"),
 *  plus any already chosen so it can be unchosen. Every kind until the
 *  counts land. */
export function offeredSources(
  group: StoryGroup | '',
  byKind: Record<StoryKind, number> | null,
  selected: StoryKind[],
): StoryKind[] {
  return kindsIn(group).filter((kind) => !byKind || byKind[kind] > 0 || selected.includes(kind));
}

/** Where a record came from, in words: the provider values of the backend's
 *  `Connector.Provider` and `MailboxConnection.Provider`. A record logged in
 *  Revenact names no source (''); an unknown provider reads as it came. */
const SOURCE_NAMES: Record<string, string> = {
  revenact: '',
  zendesk: 'Zendesk',
  jira: 'Jira',
  freshdesk: 'Freshdesk',
  webhook: 'Webhook',
  intercom: 'Intercom',
  salesforce: 'Salesforce',
  hubspot: 'HubSpot',
  slack: 'Slack',
  gmail: 'Gmail',
  ms_teams: 'Microsoft Teams',
  zoom: 'Zoom',
  github: 'GitHub',
  figma: 'Figma',
  google: 'Gmail',
  microsoft: 'Outlook',
  imap: 'IMAP',
};

export function sourceName(source: string): string {
  return SOURCE_NAMES[source] ?? source;
}

/** "+ Add" on the story (spec §1.6): the existing create flows. Activity has
 *  no create endpoint; a call has one (POST /customers/{id}/calls/ and the
 *  account's), which CallSense's "Log a call" uses, so it stands in for
 *  "Log activity". */
export type AddKind = 'call' | 'task' | 'note' | 'survey';
export const ADD_FLOWS: { key: AddKind; label: string }[] = [
  { key: 'call', label: 'Log a call' },
  { key: 'task', label: 'New task' },
  { key: 'note', label: 'New note' },
  { key: 'survey', label: 'Log survey' },
];
```

`src/features/organizations/storyApi.ts`:
```ts
// The organization story endpoint (spec §2), through apiFetch (/api/v1 prefix).
import { apiFetch } from '../../lib/apiClient';
import type { StoryGroup, StoryKind, StoryItem, StoryResponse } from './storyTypes';

export const STORY_PAGE_SIZE = 30;

export const storyPath = (orgId: number) => `/organizations/${orgId}/story/`;

export interface StoryFilters {
  group: StoryGroup | '';
  sources: StoryKind[];
  /** An account id, 'none' for the organization itself, or '' for all. */
  account: string;
  q: string;
}

/** The query for these filters in one fixed order, so equal filters make an
 *  equal string (the paging key). The backend binds its cursor to the same
 *  filters, so a changed filter always starts from page one. */
export function storyQuery(f: StoryFilters, limit = STORY_PAGE_SIZE): string {
  const query = new URLSearchParams();
  if (f.group) query.set('group', f.group);
  if (f.sources.length) query.set('source', f.sources.join(','));
  if (f.account) query.set('account', f.account);
  if (f.q.trim()) query.set('q', f.q.trim());
  query.set('limit', String(limit));
  return query.toString();
}

/** One page. The cursor is opaque and passed back exactly as it came. */
export function fetchStory(orgId: number, query: string, cursor?: string | null): Promise<StoryResponse> {
  const full = cursor ? `${query}&cursor=${encodeURIComponent(cursor)}` : query;
  return apiFetch<StoryResponse>(`${storyPath(orgId)}?${full}`);
}

export const THREAD_PAGE_SIZE = 100;

/** One email thread, oldest first: the story read with `thread` (the backend
 *  has no thread endpoint). It returns that thread's emails only, across the
 *  organization and its accounts, under the same rules; no other filter is
 *  sent, so the whole thread shows whatever chip is on. Its counts and
 *  attention are not narrowed and are not used here. */
export async function fetchThread(orgId: number, threadId: string): Promise<StoryItem[]> {
  const query = new URLSearchParams({ thread: threadId, limit: String(THREAD_PAGE_SIZE) }).toString();
  const items: StoryItem[] = [];
  let cursor: string | null = null;
  do {
    const page: StoryResponse = await fetchStory(orgId, query, cursor);
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return items.reverse();
}
```

`src/features/organizations/testStory.ts`:
```ts
import { vi } from 'vitest';
import type { Account, Customer } from '../customers/customersSlice';
import type { BulkRequest, PortfolioRow } from './portfolioTypes';
import { GROUP_KEYS, KIND_GROUP, STORY_KINDS } from './storyKinds';
import type { StoryActor, StoryAttention, StoryCounts, StoryItem, StoryKind, StoryRef, StoryResponse } from './storyTypes';
import { buildPortfolio, customerFixture, pizzaHut } from './testPortfolio';

// Test-only: story bodies in the backend's shapes (revenact-backend
// services/organizations/story/) and one fetch stub for the organization
// page. It answers the header's two reads, the accounts, the story (with the
// backend's facet counts, its `thread` read, its horizon and paging; the
// cursor is an offset here), the create endpoints "+ Add" uses (each adds its
// record to the story as the backend would render it), archive and PATCH,
// and empty lists for the other tabs' reads.

export const EMEA: StoryRef = { id: 31, name: 'EMEA' };
export const NORTH_AMERICA: StoryRef = { id: 32, name: 'North America' };
const CARL: StoryActor = { id: 2, name: 'Carl CSM' };
const ALICE: StoryActor = { id: 1, name: 'Alice' };
const NO_LINK = { thread_id: null, url: null };

function accountFixture(ref: StoryRef, extra: Partial<Account> = {}): Account {
  return {
    id: ref.id,
    customers: [{ id: 7, name: 'Pizza Hut' }],
    name: ref.name,
    domain: '',
    industry: '',
    address: '',
    email: '',
    phone: '',
    owner: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    lifecycle_stage: 'live',
    health_score: '5.0',
    health_category: 'average',
    pulse: [],
    ai_pulse_score: '',
    ai_pulse_reason: '',
    account_pulse: { value: null, label: 'No signal', category: 0, breakdown: [] },
    nps_score: null,
    csat_score: null,
    renewal_date: null,
    arr: '0.00',
    ai_pulse_value: null,
    ...extra,
  };
}

/** EMEA carries what the Details tab's Accounts section shows (owner, domain,
 *  pulse dots, AI score and reason); North America has none of it. */
export const ACCOUNTS: Account[] = [
  accountFixture(EMEA, {
    domain: 'emea.pizzahut.example',
    owner: { id: 2, name: 'Carl CSM' } as Account['owner'],
    pulse: [1, 1, 3],
    ai_pulse_score: 'satisfied',
    ai_pulse_value: 4,
    ai_pulse_reason: 'Usage is steady and the renewal talks are friendly.',
  }),
  accountFixture(NORTH_AMERICA),
];

/** GET /customers/7/: the edit form's fields plus the health rubric. */
export const pizzaHutCustomer = {
  ...customerFixture,
  health_score: '4.9',
  health_category: 'average',
  health_score_is_overridden: false,
  health_breakdown: [
    { key: 'usage', label: 'Product usage', weight: '3.0', points: '1.2', ratio: 0.4, available: true },
    { key: 'support', label: 'Support load', weight: '2.0', points: '1.6', ratio: 0.8, available: true },
    { key: 'sentiment', label: 'Sentiment', weight: '2.0', points: '0.9', ratio: 0.45, available: true },
    { key: 'engagement', label: 'Engagement', weight: '2.0', points: '1.2', ratio: 0.6, available: true },
    { key: 'nps', label: 'NPS', weight: '1.0', points: '0.0', ratio: null, available: false },
  ],
  csat_breakdown: { responses: 0, bands: [] },
} as unknown as Customer;

/** Pizza Hut's story, newest first, as the backend renders it. Timed items
 *  are at noon UTC (and 11:00) so the calendar day is the same in every time
 *  zone a test runs in; date-only items (`all_day`) are at midnight UTC. */
export const STORY_ITEMS: StoryItem[] = [
  {
    id: 41,
    kind: 'email',
    source: 'google',
    occurred_at: '2026-09-25T12:00:00+00:00',
    all_day: false,
    account: EMEA,
    title: 'Re: Renewal pricing',
    summary: 'Can we see the quote before the board meets on Friday?',
    actor: { id: null, name: 'Dana Buyer' },
    link: { thread_id: 't-1', url: null },
  },
  {
    id: 12,
    kind: 'call',
    source: 'revenact',
    occurred_at: '2026-09-25T11:00:00+00:00',
    all_day: false,
    account: null,
    title: 'Quarterly check-in',
    summary: 'The admin left and usage fell. Agreed a retraining session.',
    actor: { id: null, name: 'Carl CSM' },
    link: NO_LINK,
  },
  {
    id: 88,
    kind: 'ticket',
    source: 'zendesk',
    occurred_at: '2026-09-24T00:00:00+00:00',
    all_day: true,
    account: NORTH_AMERICA,
    title: 'SSO login fails',
    summary: 'ZD-88 · High · Open',
    actor: { id: null, name: 'Sam Admin' },
    link: { thread_id: null, url: 'https://acme.zendesk.example/tickets/88' },
  },
  {
    id: 5,
    kind: 'task',
    source: 'revenact',
    occurred_at: '2026-09-20T12:00:00+00:00',
    all_day: false,
    account: null,
    title: 'Send the renewal quote',
    summary: 'Due 2026-09-22 · High · Pending',
    actor: CARL,
    link: NO_LINK,
  },
  {
    id: 3,
    kind: 'health',
    source: 'revenact',
    occurred_at: '2026-08-31T00:00:00+00:00',
    all_day: true,
    account: null,
    title: 'Health fell to Average',
    summary: 'Health 5.5 → 4.9 · AI pulse 3 → 2',
    actor: null,
    link: NO_LINK,
  },
];

/** Thread t-1 as `?thread=t-1` returns it (newest first): the email in the
 *  story (41) and the message it answers (40), filed on the organization
 *  itself. 40 is left out of the default book so the other counts stay small. */
export const THREAD_ITEMS: StoryItem[] = [
  STORY_ITEMS[0],
  {
    id: 40,
    kind: 'email',
    source: 'google',
    occurred_at: '2026-09-24T10:00:00+00:00',
    all_day: false,
    account: null,
    title: 'Renewal pricing',
    summary: 'Sharing the renewal quote ahead of your board meeting.',
    actor: CARL,
    link: { thread_id: 't-1', url: null },
  },
];

export const PIZZA_ATTENTION: StoryAttention = {
  renewal: { date: '2026-08-09', days: -47, overdue: true },
  tickets: { count: 2, oldest_days: 9 },
  overdue_tasks: { count: 1, oldest_days: 4 },
  questions: { count: 3 },
  anomaly: {
    id: 17,
    title: 'Similar reports across 1 of your companies',
    first_seen_at: '2026-09-19T08:00:00+00:00',
    last_seen_at: '2026-09-21T08:00:00+00:00',
  },
};

export const QUIET_ATTENTION: StoryAttention = {
  renewal: null,
  tickets: null,
  overdue_tasks: null,
  questions: null,
  anomaly: null,
};

export const MEMBERS = [
  { id: 1, name: 'Alice', function: 'cs' },
  { id: 2, name: 'Carl CSM', function: 'cs' },
];

/** `n` tasks on the organization, newest first, created an hour apart (a
 *  task is in the story at its `created_at`). */
export function manyItems(n: number): StoryItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    kind: 'task' as const,
    source: 'revenact',
    occurred_at: new Date(Date.UTC(2026, 8, 20, 12) - i * 3_600_000).toISOString(),
    all_day: false,
    account: null,
    title: `Task ${i + 1}`,
    summary: 'Due 2026-10-01 · Medium · Pending',
    actor: ALICE,
    link: NO_LINK,
  }));
}

const newestFirst = (items: StoryItem[]) =>
  [...items].sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || b.kind.localeCompare(a.kind) || b.id - a.id);

/** Tomorrow's midnight UTC: the backend leaves out anything dated from then on. */
function horizon(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/** The backend's story rules over a book: the horizon, every filter, the
 *  facet counts (each facet without its own filter, `all` totals, every
 *  account in scope listed), search never matching health, and an offset
 *  cursor. `accountIds` are the organization's accounts in scope. */
export function buildStory(
  query: URLSearchParams,
  book: StoryItem[],
  attention: StoryAttention,
  accountIds: number[],
): StoryResponse {
  const group = query.get('group') ?? '';
  const sources = (query.get('source') ?? '').split(',').filter(Boolean);
  const account = query.get('account') ?? '';
  const q = (query.get('q') ?? '').trim().toLowerCase();
  const inGroup = (item: StoryItem) => !group || KIND_GROUP[item.kind] === group;
  const inSources = (item: StoryItem) => sources.length === 0 || sources.includes(item.kind);
  const inAccount = (item: StoryItem) =>
    !account || (account === 'none' ? item.account === null : String(item.account?.id) === account);
  const matches = (item: StoryItem) =>
    !q || (item.kind !== 'health' && `${item.title} ${item.summary} ${item.actor?.name ?? ''}`.toLowerCase().includes(q));
  const until = horizon();
  const sorted = newestFirst(book).filter((item) => Date.parse(item.occurred_at) < until);
  const set = sorted.filter((item) => inGroup(item) && inSources(item) && inAccount(item) && matches(item));

  const byKind = Object.fromEntries(STORY_KINDS.map((k) => [k.kind, 0])) as Record<StoryKind, number>;
  for (const item of sorted) if (inAccount(item) && matches(item)) byKind[item.kind] += 1;
  const byGroup = { all: 0, ...Object.fromEntries(GROUP_KEYS.map((key) => [key, 0])) } as StoryCounts['by_group'];
  for (const k of STORY_KINDS) {
    byGroup[k.group] += byKind[k.kind];
    byGroup.all += byKind[k.kind];
  }
  const byAccount: Record<string, number> = { all: 0, none: 0 };
  for (const id of accountIds) byAccount[String(id)] = 0;
  for (const item of sorted) {
    if (!inGroup(item) || !inSources(item) || !matches(item)) continue;
    const key = item.account ? String(item.account.id) : 'none';
    if (!(key in byAccount)) continue;
    byAccount[key] += 1;
    byAccount.all += 1;
  }

  const limit = Number(query.get('limit') ?? 30);
  const start = Number(query.get('cursor') ?? 0);
  return {
    items: set.slice(start, start + limit),
    next_cursor: start + limit < set.length ? String(start + limit) : null,
    counts: { by_group: byGroup, by_kind: byKind, by_account: byAccount },
    attention,
  };
}

export interface OrganizationPageStub {
  /** The organization the portfolio returns (default Pizza Hut); null means
   *  not visible to this viewer: no row, and 404s for its records. */
  row?: PortfolioRow | null;
  customer?: unknown;
  accounts?: Account[];
  /** The story's book (default STORY_ITEMS). "+ Add" appends to a copy. */
  items?: StoryItem[];
  attention?: StoryAttention;
  /** What `?thread=<id>` returns, by thread id (default: t-1 is THREAD_ITEMS).
   *  A thread not listed reads the book's emails in that thread. */
  threads?: Record<string, StoryItem[]>;
  /** How many portfolio reads fail (500 "Try later.") before they succeed. */
  failPortfolio?: number;
  /** How many GET /customers/{id}/ reads fail (500 "Try later.") before they succeed. */
  failCustomer?: number;
  /** How many story reads fail (500 "Try later.") before they succeed. */
  failStory?: number;
}

const EMPTY_LIST =
  /^\/customers\/\d+\/(?:accounts\/\d+\/)?(?:contacts|opportunities|risks|headlines|files|calls|questions|contributions)\/$/;
const EMPTY_BRIEF = {
  use_cases: [],
  stakeholders: [],
  open_threads: [],
  sources: [],
  hidden_sources: 0,
  generated_at: null,
  generated_by: null,
  gaps: [],
};

function json(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

function bodyOf(init?: RequestInit): Record<string, unknown> {
  if (init?.body instanceof FormData) return Object.fromEntries(init.body.entries());
  return init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
}

export function stubOrganizationPage(stub: OrganizationPageStub = {}) {
  let current: PortfolioRow | null = stub.row === undefined ? pizzaHut : stub.row;
  const book = [...(stub.items ?? STORY_ITEMS)];
  let portfolioFailures = stub.failPortfolio ?? 0;
  let customerFailures = stub.failCustomer ?? 0;
  let storyFailures = stub.failStory ?? 0;
  let created = 0;
  const accounts = stub.accounts ?? ACCOUNTS;

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const orgPath = current ? `/customers/${current.id}/` : null;

    if (path === '/organizations/portfolio/') {
      if (portfolioFailures > 0) {
        portfolioFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      return json(200, buildPortfolio(url.searchParams, current ? [current] : []));
    }

    const story = /^\/organizations\/(\d+)\/story\/$/.exec(path);
    if (story) {
      if (!current || Number(story[1]) !== current.id) return json(404, { detail: 'Not found.' });
      if (storyFailures > 0) {
        storyFailures -= 1;
        return json(500, { detail: 'Try later.' });
      }
      const accountIds = accounts.map((a) => a.id);
      const thread = url.searchParams.get('thread');
      if (thread) {
        // `thread` narrows the items to that thread's emails, never the counts.
        const rest = new URLSearchParams(url.searchParams);
        rest.delete('thread');
        const whole = buildStory(rest, book, stub.attention ?? PIZZA_ATTENTION, accountIds);
        const emails =
          stub.threads?.[thread] ??
          (thread === 't-1' ? THREAD_ITEMS : book.filter((item) => item.kind === 'email' && item.link.thread_id === thread));
        return json(200, { ...whole, items: newestFirst(emails), next_cursor: null });
      }
      return json(200, buildStory(url.searchParams, book, stub.attention ?? PIZZA_ATTENTION, accountIds));
    }

    if (path === '/organizations/bulk/' && method === 'POST') {
      const body = bodyOf(init) as unknown as BulkRequest;
      if (current && body.action === 'archive' && body.ids.includes(current.id)) current = { ...current, is_archived: true };
      return json(200, { updated: body.ids, failed: [] });
    }

    if (current && path === orgPath && method === 'PATCH') {
      const body = bodyOf(init);
      if (typeof body.name === 'string') current = { ...current, name: body.name };
      if (body.lifecycle_stage === 'churn') {
        current = { ...current, churned: true, lifecycle: { value: 'churn', label: 'Churn' }, signal: null };
      }
      return json(200, { ...((stub.customer ?? pizzaHutCustomer) as object), ...body });
    }

    const create = /^\/customers\/(\d+)\/(?:accounts\/(\d+)\/)?(tasks|notes|surveys|calls)\/$/.exec(path);
    if (create && method === 'POST') {
      const body = bodyOf(init);
      const accountId = create[2] ? Number(create[2]) : null;
      const account = accountId ? (accounts.find((a) => a.id === accountId) ?? null) : null;
      const ref = account ? { id: account.id, name: account.name } : null;
      created += 1;
      const id = 900 + created;
      const now = new Date().toISOString();
      const today = `${now.slice(0, 10)}T00:00:00+00:00`;
      const title = String(body.title ?? '');
      // Each new record joins the book as the backend renders it (items.py).
      const logged = { id, source: 'revenact', account: ref, link: NO_LINK };
      if (create[3] === 'tasks') {
        book.push({ ...logged, kind: 'task', occurred_at: now, all_day: false, title, summary: `Due ${String(body.due_date)} · Medium · Pending`, actor: ALICE });
        return json(201, { id, title, assignee_name: 'Alice', assignee: ALICE, created_by: ALICE, due_date: body.due_date, priority: body.priority, status: 'pending' });
      }
      if (create[3] === 'notes') {
        book.push({ ...logged, kind: 'note', occurred_at: today, all_day: true, title, summary: String(body.body ?? ''), actor: ALICE });
        return json(201, { id, title, author_name: 'Alice', author: ALICE, body: body.body, logged_at: now.slice(0, 10), links: 0 });
      }
      if (create[3] === 'surveys') {
        const type = String(body.survey_type ?? 'nps');
        const sent = String(body.sent_at ?? now).slice(0, 10);
        book.push({ ...logged, kind: 'survey', occurred_at: `${sent}T00:00:00+00:00`, all_day: true, title: `${type.toUpperCase()} survey`, summary: 'Sent · awaiting a response', actor: null });
        return json(201, {
          id,
          survey_type: type,
          survey_type_display: type.toUpperCase(),
          status: 'sent',
          status_display: 'Sent',
          score: null,
          sent_at: body.sent_at,
          responded_at: null,
          companies: [{ id: Number(create[1]), name: current?.name ?? '' }],
          account_id: accountId,
          account_name: account?.name ?? null,
          created_at: now,
        });
      }
      const at = body.occurred_at ? new Date(String(body.occurred_at)).toISOString() : now;
      book.push({ ...logged, kind: 'call', occurred_at: at, all_day: false, title, summary: String(body.summary ?? ''), actor: { id: null, name: 'Alice' } });
      return json(201, {
        id,
        title,
        host_name: 'Alice',
        occurred_at: body.occurred_at,
        duration_minutes: null,
        summary: String(body.summary ?? ''),
        sentiment: '',
        ai_area: '',
        ai_category: '',
        recording_url: '',
        connector_name: null,
        connector_provider: null,
        logged_by: ALICE,
        transcript: null,
        participants: [],
        links: 0,
        created_at: now,
      });
    }

    if (method === 'GET') {
      if (orgPath && path === orgPath) {
        if (customerFailures > 0) {
          customerFailures -= 1;
          return json(500, { detail: 'Try later.' });
        }
        return json(200, stub.customer ?? pizzaHutCustomer);
      }
      if (orgPath && path === `${orgPath}accounts/`) return json(200, accounts);
      if (path === '/auth/members/') return json(200, MEMBERS);
      if (/^\/customers\/\d+\/brief\/$/.test(path)) return json(200, EMPTY_BRIEF);
      if (/^\/customers\/\d+\/responsible\/$/.test(path)) return json(200, { responsible: [] });
      if (EMPTY_LIST.test(path) || path === '/attributes/values/' || path === '/knowledge/gaps/') return json(200, []);
    }
    return json(404, { detail: `Not stubbed: ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

type Calls = { mock: { calls: [RequestInfo | URL, RequestInit?][] } };

/** Every portfolio request so far, as parsed query strings, oldest first. */
export function portfolioRequests(spy: Calls): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname.endsWith('/organizations/portfolio/'))
    .map((url) => url.searchParams);
}

/** Every story request so far, as parsed query strings, oldest first. */
export function storyQueries(spy: Calls): URLSearchParams[] {
  return spy.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => /\/organizations\/\d+\/story\/$/.test(url.pathname))
    .map((url) => url.searchParams);
}

/** The JSON bodies POSTed to `path` (e.g. '/customers/7/tasks/'), oldest first. */
export function postBodies(spy: Calls, path: string): Record<string, unknown>[] {
  return spy.mock.calls
    .filter(([input, init]) => new URL(String(input)).pathname === `/api/v1${path}` && init?.method === 'POST')
    .map(([, init]) => bodyOf(init));
}

/** Every request's method and path (no query), oldest first: "GET /customers/7/". */
export function requestPaths(spy: Calls): string[] {
  return spy.mock.calls.map(
    ([input, init]) => `${init?.method ?? 'GET'} ${new URL(String(input)).pathname.replace(/^\/api\/v1/, '')}`,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/organizations/storyKinds.test.ts src/features/organizations/storyApi.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc -b --noEmit`
Expected: no output.

```bash
git add src/features/customers/customersSlice.ts src/features/organizations/storyTypes.ts src/features/organizations/storyKinds.ts src/features/organizations/storyKinds.test.ts src/features/organizations/storyApi.ts src/features/organizations/storyApi.test.ts src/features/organizations/testStory.ts
git commit -m "feat(organizations): the organization story contract, its kinds and a test stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The page's URL state and day grouping

**Files:**
- Create: `src/features/organizations/detailParams.ts`
- Create: `src/features/organizations/storyDays.ts`
- Create: `src/components/organizations/detail/useDetailParams.ts`
- Test: `src/features/organizations/detailParams.test.ts`, `src/features/organizations/storyDays.test.ts`, `src/components/organizations/detail/useDetailParams.test.tsx`

**Interfaces:**
- Consumes: `isStoryGroup`, `isStoryKind`, `kindsIn` (Task 1); `StoryFilters` (Task 1); `formatDate` (`features/customers/formatters.ts`).
- Produces:
  - `type DetailTab = 'story' | 'details' | 'people' | 'deals' | 'knowledge' | 'files'`, `DETAIL_TABS: {key: DetailTab; label: string}[]`, `interface DetailParams {tab; account: string; group: StoryGroup | ''; sources: StoryKind[]; q: string}`, `parseDetailParams(search: URLSearchParams): DetailParams`, `toDetailSearch(p: DetailParams): URLSearchParams`, `withPatch(p: DetailParams, patch: Partial<DetailParams>): DetailParams`, `storyFilters(p: DetailParams): StoryFilters`, `hasStoryFilters(p: DetailParams): boolean`, `detailTabId(base: string, tab: DetailTab): string`, `detailPanelId(base: string): string`.
  - `type Timed = {occurred_at: string; all_day: boolean}`, `localDay(date: Date): string`, `dayKey(item: Timed): string`, `timeLabel(item: Timed): string`, `dayLabel(key: string, today: string): string`, `groupByDay<T extends Timed>(items: T[]): {key: string; items: T[]}[]`.
  - `useDetailParams(): {params: DetailParams; update: (patch: Partial<DetailParams>, options?: {replace?: boolean}) => void}`. `update` merges into the URL as it is now; its identity changes with the URL (react-router's `setSearchParams` does), so a caller that must not re-run on it reads it through a ref.

- [ ] **Step 1: Write the failing tests**

`src/features/organizations/detailParams.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  DETAIL_TABS,
  detailPanelId,
  detailTabId,
  hasStoryFilters,
  parseDetailParams,
  storyFilters,
  toDetailSearch,
  withPatch,
} from './detailParams';

const parse = (search: string) => parseDetailParams(new URLSearchParams(search));

describe('the organization page URL state', () => {
  it('has six tabs, Story first (spec §1)', () => {
    expect(DETAIL_TABS.map((tab) => tab.label)).toEqual(['Story', 'Details', 'People', 'Deals & risks', 'Knowledge', 'Files']);
  });

  it('reads defaults, and drops unknown values rather than failing', () => {
    expect(parse('')).toEqual({ tab: 'story', account: '', group: '', sources: [], q: '' });
    expect(parse('tab=overview&account=emea&group=sessions&source=slack,email')).toEqual({
      tab: 'story',
      account: '',
      group: '',
      sources: ['email'],
      q: '',
    });
    expect(parse('tab=deals&account=31&q=renewal').tab).toBe('deals');
    expect(parse('account=none').account).toBe('none');
  });

  it('keeps only the sources inside the chosen group', () => {
    expect(parse('group=tickets&source=email,ticket').sources).toEqual(['ticket']);
    const p = parse('source=email,ticket,email');
    expect(p.sources).toEqual(['email', 'ticket']);
    expect(withPatch(p, { group: 'conversations' }).sources).toEqual(['email']);
  });

  it('writes only what differs from the default, in one order', () => {
    expect(toDetailSearch(parse('')).toString()).toBe('');
    const p = parse('q=quote&source=task&group=tasks&account=31&tab=story');
    expect([...toDetailSearch(p).keys()]).toEqual(['account', 'group', 'source', 'q']);
    expect(toDetailSearch({ ...p, tab: 'files' }).get('tab')).toBe('files');
  });

  it('hands the story its filters and says when any is set', () => {
    const p = parse('account=31&group=tasks&source=note&q=kickoff');
    expect(storyFilters(p)).toEqual({ group: 'tasks', sources: ['note'], account: '31', q: 'kickoff' });
    expect(hasStoryFilters(p)).toBe(true);
    expect(hasStoryFilters(parse('tab=files'))).toBe(false);
  });

  it('names the tab and its panel for aria wiring', () => {
    expect(detailTabId('x', 'people')).toBe('x-tab-people');
    expect(detailPanelId('x')).toBe('x-panel');
  });
});
```

`src/features/organizations/storyDays.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, groupByDay, localDay, timeLabel } from './storyDays';

// Local times built with the Date constructor, so each lands on the stated
// calendar day in whatever time zone the tests run. A date-only record comes
// from the backend as midnight UTC with `all_day: true`.
const at = (y: number, m: number, d: number, h: number, min = 0) => ({
  occurred_at: new Date(y, m - 1, d, h, min).toISOString(),
  all_day: false,
});
const onDay = (date: string) => ({ occurred_at: `${date}T00:00:00+00:00`, all_day: true });

describe('story days', () => {
  it("reads a timed item in the viewer's zone and an all-day item as its UTC date", () => {
    expect(dayKey(at(2026, 9, 25, 14, 5))).toBe('2026-09-25');
    expect(dayKey(onDay('2026-08-31'))).toBe('2026-08-31');
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('shows a time only when the record keeps one', () => {
    expect(timeLabel(at(2026, 9, 25, 14, 5))).toBe('2:05 PM');
    expect(timeLabel(onDay('2026-08-31'))).toBe('');
  });

  it('names today, yesterday and older days', () => {
    expect(dayLabel('2026-09-26', '2026-09-26')).toBe('Today');
    expect(dayLabel('2026-09-25', '2026-09-26')).toBe('Yesterday');
    expect(dayLabel('2026-02-28', '2026-03-01')).toBe('Yesterday');
    expect(dayLabel('2026-08-31', '2026-09-26')).toBe('31 Aug 2026');
  });

  it('groups by day in the order the items came, one group per day', () => {
    const items = [
      { id: 1, ...at(2026, 9, 25, 15) },
      { id: 2, ...at(2026, 9, 25, 9) },
      { id: 3, ...onDay('2026-09-24') },
      { id: 4, ...at(2026, 9, 25, 8) },
    ];
    expect(groupByDay(items).map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['2026-09-25', [1, 2, 4]],
      ['2026-09-24', [3]],
    ]);
  });
});
```

`src/components/organizations/detail/useDetailParams.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useDetailParams } from './useDetailParams';

function Probe() {
  const { params, update } = useDetailParams();
  const location = useLocation();
  return (
    <div>
      <p data-testid="where">{location.search}</p>
      <p data-testid="tab">{params.tab}</p>
      <button type="button" onClick={() => update({ tab: 'details' })}>Details</button>
      <button type="button" onClick={() => update({ account: '31' })}>EMEA</button>
      <button type="button" onClick={() => update({ group: 'tickets' })}>Tickets</button>
      <button type="button" onClick={() => update({ tab: 'story' })}>Story</button>
    </div>
  );
}

describe('useDetailParams', () => {
  it('reads and writes the URL, keeping the rest of it', async () => {
    render(
      <MemoryRouter initialEntries={['/organizations/7?source=email,ticket']}>
        <Probe />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tab')).toHaveTextContent('story');
    await userEvent.click(screen.getByRole('button', { name: 'EMEA' }));
    expect(screen.getByTestId('where')).toHaveTextContent('?account=31&source=email%2Cticket');
    await userEvent.click(screen.getByRole('button', { name: 'Tickets' }));
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).get('source')).toBe('ticket');
    await userEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByTestId('tab')).toHaveTextContent('details');
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).get('account')).toBe('31');
    await userEvent.click(screen.getByRole('button', { name: 'Story' }));
    expect(new URLSearchParams(screen.getByTestId('where').textContent!).has('tab')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/organizations/detailParams.test.ts src/features/organizations/storyDays.test.ts src/components/organizations/detail/useDetailParams.test.tsx`
Expected: FAIL with "Failed to resolve import" for `./detailParams`, `./storyDays` and `./useDetailParams`.

- [ ] **Step 3: Implement**

`src/features/organizations/detailParams.ts`:
```ts
import type { StoryFilters } from './storyApi';
import { isStoryGroup, isStoryKind, kindsIn } from './storyKinds';
import type { StoryGroup, StoryKind } from './storyTypes';

// The organization page's URL state (spec §1.4 and §1.5): the tab, the
// account chip and the story's filters. Unknown values read as the default.

export type DetailTab = 'story' | 'details' | 'people' | 'deals' | 'knowledge' | 'files';

export const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'details', label: 'Details' },
  { key: 'people', label: 'People' },
  { key: 'deals', label: 'Deals & risks' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'files', label: 'Files' },
];

export interface DetailParams {
  tab: DetailTab;
  /** An account id, 'none' (records on the organization itself), or '' for all. */
  account: string;
  group: StoryGroup | '';
  sources: StoryKind[];
  q: string;
}

const TAB_KEYS: string[] = DETAIL_TABS.map((tab) => tab.key);

const accountValue = (raw: string | null) => (raw && (/^\d+$/.test(raw) || raw === 'none') ? raw : '');

/** Sources are unique and inside the chosen group. */
function normalise(p: DetailParams): DetailParams {
  const allowed = kindsIn(p.group);
  return { ...p, sources: [...new Set(p.sources)].filter((kind) => allowed.includes(kind)) };
}

export function parseDetailParams(search: URLSearchParams): DetailParams {
  const tab = search.get('tab') ?? '';
  const group = search.get('group') ?? '';
  return normalise({
    tab: TAB_KEYS.includes(tab) ? (tab as DetailTab) : 'story',
    account: accountValue(search.get('account')),
    group: isStoryGroup(group) ? group : '',
    sources: (search.get('source') ?? '').split(',').filter(isStoryKind),
    q: search.get('q') ?? '',
  });
}

export function toDetailSearch(p: DetailParams): URLSearchParams {
  const out = new URLSearchParams();
  if (p.tab !== 'story') out.set('tab', p.tab);
  if (p.account) out.set('account', p.account);
  if (p.group) out.set('group', p.group);
  if (p.sources.length) out.set('source', p.sources.join(','));
  if (p.q) out.set('q', p.q);
  return out;
}

export function withPatch(p: DetailParams, patch: Partial<DetailParams>): DetailParams {
  return normalise({ ...p, ...patch });
}

export function storyFilters(p: DetailParams): StoryFilters {
  return { group: p.group, sources: p.sources, account: p.account, q: p.q };
}

export function hasStoryFilters(p: DetailParams): boolean {
  return Boolean(p.account || p.group || p.sources.length || p.q.trim());
}

export const detailTabId = (base: string, tab: DetailTab) => `${base}-tab-${tab}`;
export const detailPanelId = (base: string) => `${base}-panel`;
```

`src/features/organizations/storyDays.ts`:
```ts
import { formatDate } from '../customers/formatters';

// Day grouping for the story stream (spec §1.6 "grouped by day, newest first").

const pad = (n: number) => String(n).padStart(2, '0');

/** What the day grouping reads from a story item: `occurred_at` is always a
 *  UTC timestamp, and `all_day` marks a date-only record (midnight UTC). */
export type Timed = { occurred_at: string; all_day: boolean };

/** YYYY-MM-DD of a moment in the viewer's time zone. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The calendar day an item happened on: a timed item in the viewer's time
 *  zone; an all-day item is the date part of its timestamp, so it never
 *  moves to the day before west of UTC. */
export function dayKey(item: Timed): string {
  return item.all_day ? item.occurred_at.slice(0, 10) : localDay(new Date(item.occurred_at));
}

/** "2:05 PM", or '' for an all-day item. */
export function timeLabel(item: Timed): string {
  if (item.all_day) return '';
  return new Date(item.occurred_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "Today", "Yesterday" or "31 Aug 2026". */
export function dayLabel(key: string, today: string): string {
  if (key === today) return 'Today';
  const [y, m, d] = today.split('-').map(Number);
  if (key === localDay(new Date(y, m - 1, d - 1))) return 'Yesterday';
  return formatDate(key);
}

/** One group per day, days in the order they first appear. */
export function groupByDay<T extends Timed>(items: T[]): { key: string; items: T[] }[] {
  const days = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(item);
    const day = days.get(key);
    if (day) day.push(item);
    else days.set(key, [item]);
  }
  return [...days].map(([key, dayItems]) => ({ key, items: dayItems }));
}
```

`src/components/organizations/detail/useDetailParams.ts`:
```ts
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  parseDetailParams,
  toDetailSearch,
  withPatch,
  type DetailParams,
} from '../../../features/organizations/detailParams';

/** The organization page's URL state. `update` merges a patch into what the
 *  URL holds now and pushes a history entry unless `replace`. Its identity
 *  changes whenever the URL does (react-router's `setSearchParams` does), so
 *  a caller that must not re-run on it reads it through a ref. */
export function useDetailParams() {
  const [search, setSearch] = useSearchParams();
  const key = search.toString();
  const params = useMemo(() => parseDetailParams(new URLSearchParams(key)), [key]);
  const update = useCallback(
    (patch: Partial<DetailParams>, options: { replace?: boolean } = {}) => {
      setSearch((prev) => toDetailSearch(withPatch(parseDetailParams(prev), patch)), { replace: options.replace ?? false });
    },
    [setSearch],
  );
  return { params, update };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/organizations/detailParams.test.ts src/features/organizations/storyDays.test.ts src/components/organizations/detail/useDetailParams.test.tsx`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/organizations/detailParams.ts src/features/organizations/detailParams.test.ts src/features/organizations/storyDays.ts src/features/organizations/storyDays.test.ts src/components/organizations/detail/useDetailParams.ts src/components/organizations/detail/useDetailParams.test.tsx
git commit -m "feat(organizations): organization page URL state and story day grouping

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: One house-rules suite for both folders, and the `Sheet`

**Files:**
- Create: `src/test/houseRules.ts`
- Create: `src/test/houseRules.test.ts`
- Modify: `src/components/organizations/portfolio/houseRules.test.ts` (whole file)
- Create: `src/components/organizations/detail/houseRules.test.ts`
- Create: `src/components/organizations/detail/Sheet.tsx`
- Test: `src/components/organizations/detail/Sheet.test.tsx`

**Interfaces:**
- Consumes: `trapTab` (`src/lib/focusTrap.ts`), `FOCUS` (`portfolio/styles.ts`).
- Produces:
  - `RAW: RegExp`, `sizeOffenders(source: string): string[]`, `houseRuleSuite(title: string, files: Record<string, string>): void` (defines a `describe` block).
  - `Sheet({title: string; description?: string; isSm: boolean; onClose: () => void; children: ReactNode})`: a modal dialog, a right-hand panel from `sm` (`data-shape="panel"`) and a bottom sheet below it (`data-shape="sheet"`). Focus goes to its first field (or Close); Tab is trapped; body scroll is locked; Escape, Close or the scrim close it; focus returns to the opener.

- [ ] **Step 1: Write the failing tests**

`src/test/houseRules.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { RAW, sizeOffenders } from './houseRules';

describe('house-rules scanners', () => {
  it('flag real offenders and leave tokens alone', () => {
    expect(RAW.test('bg-orange-500')).toBe(true);
    expect(RAW.test('text-pink-600')).toBe(true);
    expect(RAW.test('bg-white')).toBe(true);
    expect(RAW.test('text-white')).toBe(true);
    expect(RAW.test('border-black')).toBe(true);
    expect(RAW.test('#fff')).toBe(true);
    expect(RAW.test('rgba(0,0,0,.5)')).toBe(true);
    expect(RAW.test('bg-surface')).toBe(false);
    expect(RAW.test('text-ink-muted')).toBe(false);
    expect(RAW.test('bg-danger-dim')).toBe(false);
    expect(RAW.test('accent-accent')).toBe(false);

    expect(sizeOffenders('text-[0.8rem]')).toEqual(['text-[0.8rem]']);
    expect(sizeOffenders('text-[10px]')).toEqual(['text-[10px]']);
    expect(sizeOffenders('text-[13px]')).toEqual([]);
    expect(sizeOffenders('text-sm')).toEqual(['named text size']);
    expect(sizeOffenders('text-[11px] text-ink')).toEqual([]);
  });
});
```

`src/components/organizations/detail/houseRules.test.ts`:
```ts
import { houseRuleSuite } from '../../../test/houseRules';

// Spec 2026-09-26 §1 and the design skill's §4 over every part of the
// organization page. Task 16 adds the page itself.
houseRuleSuite(
  'organization page house rules',
  import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>,
);
```

`src/components/organizations/detail/Sheet.test.tsx`:
```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './Sheet';

function Host({ isSm, withField = true }: { isSm: boolean; withField?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Sheet title="New task" description="On EMEA" isSm={isSm} onClose={() => setOpen(false)}>
          {withField ? <input aria-label="Task title" /> : <p>Nothing to type</p>}
          <button type="button">Save</button>
        </Sheet>
      ) : null}
    </>
  );
}

async function open(isSm: boolean, withField = true) {
  render(<Host isSm={isSm} withField={withField} />);
  await userEvent.click(screen.getByRole('button', { name: 'Open' }));
  return screen.getByRole('dialog', { name: 'New task' });
}

describe('Sheet', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('is a labelled modal panel from sm that takes focus to its first field and locks the page', async () => {
    const dialog = await open(true);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('On EMEA');
    expect(dialog.closest('[data-shape]')).toHaveAttribute('data-shape', 'panel');
    expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('is a bottom sheet on phones, and focuses Close when there is no field', async () => {
    const dialog = await open(false, false);
    expect(dialog.closest('[data-shape]')).toHaveAttribute('data-shape', 'sheet');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('keeps Tab inside', async () => {
    await open(true);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('closes on Escape and hands focus back to its opener', async () => {
    await open(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes from Close and from the scrim', async () => {
    await open(true);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(document.querySelector('[data-scrim]') as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/houseRules.test.ts src/components/organizations/detail/houseRules.test.ts src/components/organizations/detail/Sheet.test.tsx`
Expected: FAIL with "Failed to resolve import './houseRules'" and "'./Sheet'".

- [ ] **Step 3: Implement**

`src/test/houseRules.ts`:
```ts
import { describe, expect, it } from 'vitest';

// Spec §1 "House rules" and .claude/skills/revenact-design/SKILL.md §4, as one
// suite each folder points at its own sources (import.meta.glob must be
// written in the test file itself).

// The whole Tailwind colour palette, plus every prefix that can carry a
// colour utility. `-white`/`-black` are checked separately since they take
// no numeric shade.
const PALETTE =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone';
const PREFIXES = 'bg|text|border|fill|stroke|ring|outline|from|via|to|divide|decoration|shadow|accent';
export const RAW = new RegExp(
  `#[0-9a-fA-F]{3,8}\\b|rgba?\\(|\\b(?:${PREFIXES})-(?:${PALETTE})-\\d+\\b|\\b(?:${PREFIXES})-(?:white|black)\\b`,
);

// Only 11/13/15/22 px arbitrary sizes are allowed; every other unit
// (rem/em/%) and every named Tailwind size is a violation.
const PX_SIZE = /text-\[(\d+(?:\.\d+)?)px\]/g;
const NON_PX_SIZE = /text-\[[\d.]+(?:rem|em|%)\]/g;
const NAMED_SIZE = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl)\b/;

export function sizeOffenders(source: string): string[] {
  const offenders: string[] = [];
  for (const match of source.matchAll(PX_SIZE)) {
    if (!['11', '13', '15', '22'].includes(match[1])) offenders.push(match[0]);
  }
  for (const match of source.matchAll(NON_PX_SIZE)) offenders.push(match[0]);
  if (NAMED_SIZE.test(source)) offenders.push('named text size');
  return offenders;
}

/** The house rules over `files` (path → raw source); tests are skipped. */
export function houseRuleSuite(title: string, files: Record<string, string>): void {
  const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));

  describe(title, () => {
    it('has sources to check', () => expect(sources.length).toBeGreaterThan(0));

    it('uses tokens only: no hex, rgb() or named palette colours', () => {
      expect(sources.filter(([, s]) => RAW.test(s)).map(([f]) => f)).toEqual([]);
    });

    it('uses only the 11/13/15/22 px type sizes', () => {
      const offenders: string[] = [];
      for (const [file, source] of sources) {
        for (const bad of sizeOffenders(source)) offenders.push(`${file}: ${bad}`);
      }
      expect(offenders).toEqual([]);
    });

    it('keeps glass off (the Ask rail is the only glass surface)', () => {
      expect(sources.filter(([, s]) => /rv-card-glass|rv-glass-inner|backdrop-blur/.test(s)).map(([f]) => f)).toEqual([]);
    });

    it('dims behind sheets with the scrim token, which darkens in both themes', () => {
      expect(sources.filter(([, s]) => /\bbg-ink\/\d+/.test(s)).map(([f]) => f)).toEqual([]);
    });

    it('loads no third-party image (no Clearbit logo, no pravatar avatar)', () => {
      expect(sources.filter(([, s]) => /clearbit|pravatar/i.test(s)).map(([f]) => f)).toEqual([]);
    });
  });
}
```

`src/components/organizations/portfolio/houseRules.test.ts` (replace the whole file):
```ts
import { houseRuleSuite } from '../../../test/houseRules';

// Spec §1 "House rules", enforced over every portfolio component so a
// regression fails here rather than at design review. The scanners and
// their self-check live in src/test/houseRules.ts.
houseRuleSuite(
  'portfolio house rules',
  import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>,
);
```

`src/components/organizations/detail/Sheet.tsx`:
```tsx
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { trapTab } from '../../../lib/focusTrap';
import { FOCUS } from '../portfolio/styles';

const FIELD = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

/** A modal over the organization page: a panel on the right from `sm`, a
 *  bottom sheet below it (spec §1.11). Focus moves to its first field, or to
 *  Close when it has none; Tab stays inside; the page behind does not
 *  scroll; Escape, Close or the scrim close it and focus goes back to
 *  whatever opened it. */
export function Sheet({
  title,
  description,
  isSm,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  isSm: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // A caller passing a new inline onClose each render must not re-run the
  // mount effect (it would steal focus back to the first field).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = ref.current;
    (root?.querySelector<HTMLElement>(FIELD) ?? root?.querySelector<HTMLElement>('button'))?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        const target = event.target as Node | null;
        if (target === document.body || (target && ref.current?.contains(target))) onCloseRef.current();
      }
      if (event.key === 'Tab' && ref.current) trapTab(event, ref.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  return (
    <div data-shape={isSm ? 'panel' : 'sheet'} className="fixed inset-0 z-50 flex">
      <div data-scrim="" aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={
          isSm
            ? 'relative ml-auto flex h-full w-full max-w-lg flex-col bg-surface shadow-lg'
            : 'relative mt-auto flex max-h-[85dvh] w-full flex-col rounded-t-xl bg-surface pb-[env(safe-area-inset-bottom)]'
        }
      >
        <header className="flex items-start gap-3 border-b border-line-subtle px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[15px] font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="truncate text-[11px] text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle ${FOCUS}`}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/houseRules.test.ts src/components/organizations/portfolio/houseRules.test.ts src/components/organizations/detail/houseRules.test.ts src/components/organizations/detail/Sheet.test.tsx`
Expected: PASS (the portfolio suite's six checks, the detail suite's six, the self-check, and five Sheet tests).

- [ ] **Step 5: Commit**

```bash
git add src/test/houseRules.ts src/test/houseRules.test.ts src/components/organizations/portfolio/houseRules.test.ts src/components/organizations/detail/houseRules.test.ts src/components/organizations/detail/Sheet.tsx src/components/organizations/detail/Sheet.test.tsx
git commit -m "feat(organizations): shared house-rules suite and the organization page's Sheet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The page's reads: `useOrganization` and `useStory`

**Files:**
- Create: `src/components/organizations/detail/useOrganization.ts`
- Create: `src/components/organizations/detail/useStory.ts`
- Test: `src/components/organizations/detail/useOrganization.test.tsx`, `src/components/organizations/detail/useStory.test.tsx`

**Interfaces:**
- Consumes: `fetchPortfolio` (`portfolioApi.ts`), `apiFetch`, `errorMessage` (`portfolio/usePortfolio.ts`), `fetchStory` (Task 1), `stubOrganizationPage`, `manyItems`, `storyQueries`, `portfolioRequests` (Task 1).
- Produces:
  - `interface OrganizationState {row: PortfolioRow | null; customer: Customer | null; loading: boolean; notFound: boolean; error: string | null; customerError: string | null; retry: () => void}` and `useOrganization(id: number | null, version: number): OrganizationState`. The last row that landed stays in `row` while a new version reloads and after a reload fails (then `error` is set beside it).
  - `interface StoryState {data: StoryResponse | null; items: StoryItem[]; next: string | null; loading: boolean; error: string | null; loadingMore: boolean; moreError: string | null; loadMore: () => Promise<void>; retry: () => void}` and `useStory(orgId: number, query: string, version: number, enabled: boolean): StoryState`.

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/detail/useOrganization.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { portfolioRequests, stubOrganizationPage } from '../../../features/organizations/testStory';
import { useOrganization } from './useOrganization';

describe('useOrganization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the portfolio row by id (churned and archived included) and the customer beside it', async () => {
    const spy = stubOrganizationPage();
    const { result } = renderHook(() => useOrganization(7, 0));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza Hut'));
    await waitFor(() => expect(result.current.customer?.health_breakdown).toHaveLength(5));
    expect(Object.fromEntries(portfolioRequests(spy)[0])).toEqual({ ids: '7', include_churned: '1', limit: '1' });
    expect(result.current.notFound).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('is not found when the portfolio has no row for this viewer', async () => {
    stubOrganizationPage({ row: null });
    const { result } = renderHook(() => useOrganization(99, 0));
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.row).toBeNull();
  });

  it('is not found for an id that is not a number, with no request', () => {
    const spy = stubOrganizationPage();
    const { result } = renderHook(() => useOrganization(null, 0));
    expect(result.current.notFound).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the row on screen while a new version reloads', async () => {
    const spy = stubOrganizationPage();
    const { result, rerender } = renderHook(({ version }) => useOrganization(7, version), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.row).not.toBeNull());
    rerender({ version: 1 });
    expect(result.current.loading).toBe(true);
    expect(result.current.row?.id).toBe(7);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(portfolioRequests(spy)).toHaveLength(2);
  });

  it('reports a failed read, and Try again reads again', async () => {
    stubOrganizationPage({ failPortfolio: 1 });
    const { result } = renderHook(() => useOrganization(7, 0));
    await waitFor(() => expect(result.current.error).toBe('Try later.'));
    expect(result.current.row).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza Hut'));
    expect(result.current.error).toBeNull();
  });

  it('keeps the row on screen and reports the error when a reload fails', async () => {
    stubOrganizationPage();
    const { result, rerender } = renderHook(({ version }) => useOrganization(7, version), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.row?.name).toBe('Pizza Hut'));
    stubOrganizationPage({ failPortfolio: 1 });
    rerender({ version: 1 });
    await waitFor(() => expect(result.current.error).toBe('Try later.'));
    expect(result.current.row?.name).toBe('Pizza Hut');
    expect(result.current.loading).toBe(false);
    expect(result.current.notFound).toBe(false);
  });
});
```

`src/components/organizations/detail/useStory.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { manyItems, storyQueries, stubOrganizationPage } from '../../../features/organizations/testStory';
import { useStory } from './useStory';

describe('useStory', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads page one, then appends the next page with the cursor it was given', async () => {
    const spy = stubOrganizationPage({ items: manyItems(35) });
    const { result } = renderHook(() => useStory(7, 'limit=30', 0, true));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.items).toHaveLength(30));
    expect(result.current.next).toBe('30');
    expect(result.current.data?.counts.by_group.tasks).toBe(35);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.items).toHaveLength(35);
    expect(result.current.next).toBeNull();
    expect(storyQueries(spy).map((query) => query.get('cursor'))).toEqual([null, '30']);
  });

  it('reads nothing while disabled', () => {
    const spy = stubOrganizationPage();
    const { result } = renderHook(() => useStory(7, 'limit=30', 0, false));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the last answer on screen while a new query loads', async () => {
    stubOrganizationPage();
    const { result, rerender } = renderHook(({ query }) => useStory(7, query, 0, true), {
      initialProps: { query: 'limit=30' },
    });
    await waitFor(() => expect(result.current.items).toHaveLength(5));
    rerender({ query: 'group=tickets&limit=30' });
    expect(result.current.loading).toBe(true);
    expect(result.current.items).toHaveLength(5);
    expect(result.current.next).toBeNull();
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual([88]));
  });

  it('reports a failed read, and Try again reads again', async () => {
    stubOrganizationPage({ failStory: 1 });
    const { result } = renderHook(() => useStory(7, 'limit=30', 0, true));
    await waitFor(() => expect(result.current.error).toBe('Try later.'));
    expect(result.current.data).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.items).toHaveLength(5));
    expect(result.current.error).toBeNull();
  });

  it('reads again when the version changes (after something was added)', async () => {
    const spy = stubOrganizationPage();
    const { rerender } = renderHook(({ version }) => useStory(7, 'limit=30', version, true), { initialProps: { version: 0 } });
    await waitFor(() => expect(storyQueries(spy)).toHaveLength(1));
    rerender({ version: 1 });
    await waitFor(() => expect(storyQueries(spy)).toHaveLength(2));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/organizations/detail/useOrganization.test.tsx src/components/organizations/detail/useStory.test.tsx`
Expected: FAIL with "Failed to resolve import './useOrganization'" and "'./useStory'".

- [ ] **Step 3: Implement**

`src/components/organizations/detail/useOrganization.ts`:
```ts
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/apiClient';
import type { Customer } from '../../../features/customers/customersSlice';
import { fetchPortfolio } from '../../../features/organizations/portfolioApi';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { errorMessage } from '../portfolio/usePortfolio';

type RowLoad = { key: string; row: PortfolioRow | null } | { key: string; error: string };
type CustomerLoad = { key: string; customer: Customer } | { key: string; error: string };

export interface OrganizationState {
  /** The List's row for this organization; null until it lands, or when not
   *  found. The last one that landed stays while a reload runs or fails. */
  row: PortfolioRow | null;
  /** GET /customers/{id}/: the health breakdown and the edit form's record. */
  customer: Customer | null;
  /** The row for the current id and version has not landed (or failed) yet. */
  loading: boolean;
  /** Not a number, or the portfolio has no such row for this viewer. */
  notFound: boolean;
  error: string | null;
  customerError: string | null;
  retry: () => void;
}

/** The header's two reads (spec §2 "Header"), fired together: the portfolio
 *  row by `ids` (archived and churned rows included) and the customer. A new
 *  `version` (after an edit, churn or archive) reloads both while the old row
 *  stays on screen; a row for another id never shows. */
export function useOrganization(id: number | null, version: number): OrganizationState {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${version}#${attempt}`;
  const [rowLoad, setRowLoad] = useState<RowLoad | null>(null);
  // The last row that landed: it stays on screen while a new version reloads
  // and after a reload fails, so a failed refresh never blanks the page.
  const [lastRow, setLastRow] = useState<PortfolioRow | null>(null);
  const [customerLoad, setCustomerLoad] = useState<CustomerLoad | null>(null);

  useEffect(() => {
    if (id === null) return;
    let cancelled = false;
    const query = new URLSearchParams({ ids: String(id), include_churned: '1', limit: '1' }).toString();
    fetchPortfolio(query).then(
      (data) => {
        if (cancelled) return;
        const found = data.results.find((row) => row.id === id) ?? null;
        setRowLoad({ key, row: found });
        setLastRow(found);
      },
      (err: unknown) => {
        if (!cancelled) setRowLoad({ key, error: errorMessage(err, 'Could not load this organization.') });
      },
    );
    apiFetch<Customer>(`/customers/${id}/`).then(
      (customer) => {
        if (!cancelled) setCustomerLoad({ key, customer });
      },
      (err: unknown) => {
        if (!cancelled) setCustomerLoad({ key, error: errorMessage(err, 'Could not load the health breakdown.') });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const shown = rowLoad && 'row' in rowLoad ? rowLoad : null;
  const row = lastRow && lastRow.id === id ? lastRow : null;
  const customer = customerLoad && 'customer' in customerLoad && customerLoad.customer.id === id ? customerLoad.customer : null;
  return {
    row,
    customer,
    loading: id !== null && rowLoad?.key !== key,
    notFound: id === null || (shown !== null && shown.key === key && shown.row === null),
    error: rowLoad && 'error' in rowLoad && rowLoad.key === key ? rowLoad.error : null,
    customerError: customerLoad && 'error' in customerLoad && customerLoad.key === key ? customerLoad.error : null,
    retry,
  };
}
```

`src/components/organizations/detail/useStory.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStory } from '../../../features/organizations/storyApi';
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

/** The story, cursor-paged (spec §2 "Paging"). `version` reloads it (after
 *  "+ Add"); `enabled` is off while another tab is open. */
export function useStory(orgId: number, query: string, version: number, enabled: boolean): StoryState {
  const [attempt, setAttempt] = useState(0);
  const key = `${orgId}?${query}#${version}#${attempt}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [more, setMore] = useState<More | null>(null);
  // Bumped whenever the read changes or unmounts, so a page two that lands
  // for an older read is dropped rather than appended to a newer one.
  const generation = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchStory(orgId, query).then(
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
  }, [enabled, key, orgId, query]);

  const current = loaded && 'data' in loaded ? loaded : null;

  const loadMore = useCallback(async () => {
    if (!current || current.key !== key || !current.next || inFlight.current) return;
    const token = generation.current;
    inFlight.current = true;
    setMore({ key, loading: true, error: null });
    try {
      const page = await fetchStory(orgId, query, current.next);
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
  }, [current, key, orgId, query]);

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/useOrganization.test.tsx src/components/organizations/detail/useStory.test.tsx`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/useOrganization.ts src/components/organizations/detail/useOrganization.test.tsx src/components/organizations/detail/useStory.ts src/components/organizations/detail/useStory.test.tsx
git commit -m "feat(organizations): the organization page's header and story reads

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: The name row: `Menu` and `OrganizationHeader`

**Files:**
- Create: `src/components/organizations/detail/Menu.tsx`
- Create: `src/components/organizations/detail/OrganizationHeader.tsx`
- Test: `src/components/organizations/detail/Menu.test.tsx`, `src/components/organizations/detail/OrganizationHeader.test.tsx`

**Interfaces:**
- Consumes: `useDismiss` (`portfolio/useDismiss.ts`), `FOCUS`, `BUTTON` (`portfolio/styles.ts`), `SignalTag`, `touchText` (`portfolio/rowParts.tsx`), `PORTFOLIO_FIELDS` (`portfolioFields.ts`).
- Produces:
  - `interface MenuItem {key: string; label: string; onSelect: () => void; danger?: boolean}` and `Menu({label: string; trigger: ReactNode; triggerClassName: string; items: MenuItem[]; align?: 'start' | 'end'})`.
  - `OrganizationHeader({row: PortfolioRow; canEdit: boolean; editError?: string | null; onRetryEdit?: () => void; onEdit: () => void; onArchive: () => void; onChurn: () => void})`. While Edit is disabled because the record failed to load, `editError` shows under the name row as the reason ("Edit is unavailable: …", the Edit button's description) with Try again (`onRetryEdit`). It renders `data-field="organization"`, `"owner"` and `"lifecycleStage"` (header fields for the coverage test).

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/detail/Menu.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Menu } from './Menu';

function renderMenu() {
  const onArchive = vi.fn();
  const onChurn = vi.fn();
  render(
    <>
      <Menu
        label="More actions for Pizza Hut"
        trigger="More"
        triggerClassName=""
        items={[
          { key: 'archive', label: 'Archive', onSelect: onArchive },
          { key: 'churn', label: 'Churn', onSelect: onChurn, danger: true },
        ]}
      />
      <p>Outside</p>
    </>,
  );
  return { onArchive, onChurn, button: screen.getByRole('button', { name: 'More actions for Pizza Hut' }) };
}

describe('Menu', () => {
  it('opens with the first item focused; arrows, Home and End move and wrap', async () => {
    const { button } = renderMenu();
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'More actions for Pizza Hut' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Churn' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Churn' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the button', async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('runs the chosen item, closes, and focuses the button', async () => {
    const { button, onChurn } = renderMenu();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Churn' }));
    expect(onChurn).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes on a press outside, and opens from the keyboard with ArrowDown', async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.click(screen.getByText('Outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
  });
});
```

`src/components/organizations/detail/OrganizationHeader.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { OrganizationHeader } from './OrganizationHeader';

function renderHeader(row: PortfolioRow = pizzaHut, canEdit = true) {
  const handlers = { onEdit: vi.fn(), onArchive: vi.fn(), onChurn: vi.fn() };
  render(<OrganizationHeader row={row} canEdit={canEdit} {...handlers} />);
  return handlers;
}

describe('OrganizationHeader (spec §1.2)', () => {
  it('shows initials and no image, the name, owner · lifecycle · last touch, and the signal', () => {
    renderHeader();
    expect(screen.getByRole('heading', { level: 1, name: 'Pizza Hut' })).toHaveAttribute('data-field', 'organization');
    expect(screen.getByText('PH')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Carl CSM').closest('p')).toHaveTextContent('Carl CSM · Live · Touched 33d ago');
    expect(screen.getByText('Renewal overdue')).toBeInTheDocument();
  });

  it('Edit opens the edit form once the record is there', async () => {
    const { onEdit } = renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('Edit waits while the record loads', () => {
    renderHeader(pizzaHut, false);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says why Edit is off when the record could not load, and tries again', async () => {
    const onRetryEdit = vi.fn();
    render(
      <OrganizationHeader
        row={pizzaHut}
        canEdit={false}
        editError="Try later."
        onRetryEdit={onRetryEdit}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onChurn={vi.fn()}
      />,
    );
    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription('Edit is unavailable: Try later.');
    expect(screen.getByRole('alert')).toHaveTextContent('Edit is unavailable: Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryEdit).toHaveBeenCalledOnce();
  });

  it('⋯ holds Archive and Churn', async () => {
    const { onArchive, onChurn } = renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pizza Hut' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(onArchive).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pizza Hut' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Churn' }));
    expect(onChurn).toHaveBeenCalledOnce();
  });

  it('offers only what still applies: a churned account cannot churn again', async () => {
    renderHeader(initech);
    expect(screen.getByText('Churned')).toBeInTheDocument();
    expect(screen.getByText('Unassigned').closest('p')).toHaveTextContent('Unassigned · Churn · Never contacted');
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Initech' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Archive']);
  });

  it('has no ⋯ when nothing applies (churned and archived)', () => {
    renderHeader({ ...initech, is_archived: true });
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions for Initech' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/organizations/detail/Menu.test.tsx src/components/organizations/detail/OrganizationHeader.test.tsx`
Expected: FAIL with "Failed to resolve import './Menu'" and "'./OrganizationHeader'".

- [ ] **Step 3: Implement**

`src/components/organizations/detail/Menu.tsx`:
```tsx
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useDismiss } from '../portfolio/useDismiss';
import { FOCUS } from '../portfolio/styles';

export interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  /** A destructive action, in the danger tone. */
  danger?: boolean;
}

/** A menu button (WAI-ARIA): opening focuses the first item; arrows, Home
 *  and End move and wrap; Escape or choosing closes it and returns focus to
 *  the button; Tab or a press outside just closes it. */
export function Menu({
  label,
  trigger,
  triggerClassName,
  items,
  align = 'end',
}: {
  /** The button's and the menu's accessible name. */
  label: string;
  /** What the button shows: an icon, or an icon and a word. */
  trigger: ReactNode;
  triggerClassName: string;
  items: MenuItem[];
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  useDismiss(
    [buttonRef, menuRef],
    (reason) => {
      setOpen(false);
      if (reason === 'escape') buttonRef.current?.focus();
    },
    open,
  );

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onMenuKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => {
      event.preventDefault();
      all[(index + all.length) % all.length]?.focus();
    };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(all.length - 1);
    else if (event.key === 'Tab') setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open ? (
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`absolute top-full z-30 mt-1 min-w-44 rounded-lg border border-line bg-surface py-1 shadow-md ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                  item.onSelect();
                }}
                className={`flex min-h-11 w-full items-center px-3 text-left text-[13px] hover:bg-subtle active:bg-line-subtle sm:min-h-9 ${FOCUS} ${
                  item.danger ? 'text-danger' : 'text-ink'
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

`src/components/organizations/detail/OrganizationHeader.tsx`:
```tsx
import { useId } from 'react';
import { Ellipsis, Pencil } from 'lucide-react';
import { PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { SignalTag, touchText } from '../portfolio/rowParts';
import { BUTTON, FOCUS, QUIET } from '../portfolio/styles';
import { Menu, type MenuItem } from './Menu';

/** The name row (spec §1.2): initials (never a third-party logo), the name,
 *  owner · lifecycle · last touch, the signal, then Edit and ⋯. ⋯ offers
 *  Archive and Churn while they still apply; the server applies its own
 *  rules to both, as on the List. */
export function OrganizationHeader({
  row,
  canEdit,
  editError = null,
  onRetryEdit,
  onEdit,
  onArchive,
  onChurn,
}: {
  row: PortfolioRow;
  /** The customer record has landed, so the edit form can open. */
  canEdit: boolean;
  /** Why the record did not land; shown as Edit's reason while it is off. */
  editError?: string | null;
  onRetryEdit?: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onChurn: () => void;
}) {
  const reasonId = useId();
  const blocked = !canEdit && editError ? editError : null;
  const status = row.is_archived ? 'Archived' : row.churned ? 'Churned' : null;
  const actions: MenuItem[] = [
    ...(row.is_archived ? [] : [{ key: 'archive', label: 'Archive', onSelect: onArchive }]),
    ...(row.churned ? [] : [{ key: 'churn', label: 'Churn', onSelect: onChurn, danger: true }]),
  ];
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
          <h1 data-field="organization" className="min-w-0 truncate text-[22px] font-semibold leading-tight text-ink">
            {row.name}
          </h1>
          {status ? (
            <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-muted">{status}</span>
          ) : null}
          <SignalTag signal={row.signal} />
        </div>
        <p className="truncate text-[13px] text-ink-muted">
          <span data-field="owner">{PORTFOLIO_FIELDS.owner.value(row)}</span> ·{' '}
          <span data-field="lifecycleStage">{row.lifecycle.label}</span> · {touchText(row.last_touch_days)}
        </p>
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
          className={BUTTON}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </button>
        {actions.length ? (
          <Menu
            label={`More actions for ${row.name}`}
            trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />}
            triggerClassName={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:bg-subtle active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`}
            items={actions}
          />
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/Menu.test.tsx src/components/organizations/detail/OrganizationHeader.test.tsx src/components/organizations/detail/houseRules.test.ts`
Expected: PASS (4 + 7 tests, and the house rules over the new files).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/Menu.tsx src/components/organizations/detail/Menu.test.tsx src/components/organizations/detail/OrganizationHeader.tsx src/components/organizations/detail/OrganizationHeader.test.tsx
git commit -m "feat(organizations): the organization page's name row with Edit and its actions menu

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The four tiles and the health breakdown

**Files:**
- Create: `src/components/organizations/detail/HealthBreakdown.tsx`
- Create: `src/components/organizations/detail/HeaderTiles.tsx`
- Test: `src/components/organizations/detail/HeaderTiles.test.tsx`

**Interfaces:**
- Consumes: `HealthRing`, `TrendLine`, `RenewalRunway`, `PulsePair`, `renewalText` (`rowParts.tsx`); `HEALTH_LABEL` (`portfolioLabels.ts`); `PanelKey` (`portfolioFields.ts`); `formatCompactMoney`, `formatDate`; `Customer`, `HealthComponent` (`customersSlice.ts`); `pizzaHutCustomer` (Task 1).
- Produces:
  - `HealthBreakdown({id: string; customer: Customer | null; error: string | null})`: `<section aria-label="Health breakdown">`.
  - `HeaderTiles({row: PortfolioRow; customer: Customer | null; customerError: string | null; isSm: boolean; onJump: (panel: PanelKey) => void})`. Health toggles the breakdown; ARR → `onJump('commercial')`, Renewal → `onJump('contract')`, Pulse → `onJump('voice')`. It renders `data-field="health"`, `"pulse"` and `"aiPulseScore"` (through `HealthRing` and `PulsePair`).

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/HeaderTiles.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer } from '../../../features/customers/customersSlice';
import { pizzaHut } from '../../../features/organizations/testPortfolio';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { pizzaHutCustomer } from '../../../features/organizations/testStory';
import { HeaderTiles } from './HeaderTiles';

function renderTiles({
  row = pizzaHut,
  customer = pizzaHutCustomer as Customer | null,
  customerError = null as string | null,
  isSm = true,
} = {}) {
  const onJump = vi.fn();
  render(<HeaderTiles row={row} customer={customer} customerError={customerError} isSm={isSm} onJump={onJump} />);
  return onJump;
}

describe('HeaderTiles (spec §1.3)', () => {
  it('shows health as a ring and a trend, ARR, the renewal runway and the pulse pair', () => {
    renderTiles();
    expect(screen.getByRole('img', { name: 'Health 4.9, Average' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Health falling from 6\.2 to 4\.9/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ARR $69.6K. Show commercial details' })).toBeInTheDocument();
    expect(screen.getByText('47d overdue')).toBeInTheDocument();
    expect(screen.getByText('9 Aug 2026')).toBeInTheDocument();
    expect(screen.getByText('AI 1 · CSM 3')).toBeInTheDocument();
    expect(screen.getByText('pulses disagree')).toBeInTheDocument();
  });

  it("shows ARR in the customer's own currency", () => {
    const euros: PortfolioRow = {
      ...pizzaHut,
      details: { ...pizzaHut.details, commercial: { ...pizzaHut.details.commercial, currency: 'EUR' } },
    };
    renderTiles({ row: euros });
    expect(screen.getByRole('button', { name: /^ARR €69\.6K/ })).toBeInTheDocument();
    expect(screen.getByText('Billed at account, in EUR')).toBeInTheDocument();
  });

  it('ARR, Renewal and Pulse jump to their Details panels', async () => {
    const onJump = renderTiles();
    await userEvent.click(screen.getByRole('button', { name: /^ARR/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Renewal/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Pulse/ }));
    expect(onJump.mock.calls.map(([panel]) => panel)).toEqual(['commercial', 'contract', 'voice']);
  });

  it('Health opens and closes the five-part breakdown', async () => {
    renderTiles();
    const health = screen.getByRole('button', { name: /^Health 4\.9, Average/ });
    expect(health).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(health);
    expect(health).toHaveAttribute('aria-expanded', 'true');
    const breakdown = screen.getByRole('region', { name: 'Health breakdown' });
    expect(health).toHaveAttribute('aria-controls', breakdown.id);
    expect(within(breakdown).getAllByRole('listitem')).toHaveLength(5);
    expect(within(breakdown).getByText('Product usage').closest('li')).toHaveTextContent('1.2/3.0 · Average');
    expect(within(breakdown).getByText('Support load').closest('li')).toHaveTextContent('1.6/2.0 · Good');
    expect(within(breakdown).getByText('NPS').closest('li')).toHaveTextContent('No data');
    expect(breakdown).toHaveTextContent('Scored on the 4 components with data; the other is left out rather than counted as zero.');
    await userEvent.click(health);
    expect(screen.queryByRole('region', { name: 'Health breakdown' })).not.toBeInTheDocument();
  });

  it('says so while the breakdown loads', async () => {
    renderTiles({ customer: null });
    await userEvent.click(screen.getByRole('button', { name: /^Health/ }));
    expect(screen.getByRole('status', { name: 'Loading the health breakdown' })).toBeInTheDocument();
  });

  it('shows the read error in place of the breakdown', async () => {
    renderTiles({ customer: null, customerError: 'Could not load the health breakdown.' });
    await userEvent.click(screen.getByRole('button', { name: /^Health/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the health breakdown.');
  });

  it('is a four-column grid from sm', () => {
    renderTiles({ isSm: true });
    expect(screen.getByRole('button', { name: /^ARR/ }).parentElement).toHaveClass('grid', 'grid-cols-4');
  });

  it('is a snapping strip on phones', () => {
    renderTiles({ isSm: false });
    const strip = screen.getByRole('button', { name: /^ARR/ }).parentElement;
    expect(strip).toHaveClass('overflow-x-auto', 'snap-x', 'snap-mandatory');
    expect(strip).not.toHaveClass('grid');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/organizations/detail/HeaderTiles.test.tsx`
Expected: FAIL with "Failed to resolve import './HeaderTiles'".

- [ ] **Step 3: Implement**

`src/components/organizations/detail/HealthBreakdown.tsx`:
```tsx
import type { Customer, HealthComponent } from '../../../features/customers/customersSlice';

/** A component's share of its weight, in the rubric's own bands and in words. */
function band(ratio: number): { word: string; bar: string } {
  if (ratio >= 0.7) return { word: 'Good', bar: 'bg-success' };
  if (ratio >= 0.4) return { word: 'Average', bar: 'bg-warning' };
  return { word: 'Poor', bar: 'bg-danger' };
}

const ROW = 'grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]';

function Row({ component }: { component: HealthComponent }) {
  if (!component.available || component.ratio == null) {
    return (
      <li className={`${ROW} text-ink-muted`}>
        <span className="truncate">{component.label}</span>
        <span aria-hidden="true" className="h-1.5 rounded-full bg-line" />
        <span>No data</span>
      </li>
    );
  }
  const tone = band(component.ratio);
  return (
    <li className={ROW}>
      <span className="truncate text-ink">{component.label}</span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-line">
        <span className={`block h-full ${tone.bar}`} style={{ width: `${component.ratio * 100}%` }} />
      </span>
      <span className="text-ink-muted">
        <span className="font-mono-brand tabular-nums text-ink">
          {component.points}/{component.weight}
        </span>{' '}
        · {tone.word}
      </span>
    </li>
  );
}

/** What the health score is made of: the five rubric components from
 *  `/customers/{id}/`'s `health_breakdown`, each as points of its weight. */
export function HealthBreakdown({ id, customer, error }: { id: string; customer: Customer | null; error: string | null }) {
  return (
    <section id={id} aria-label="Health breakdown" className="rounded-xl bg-surface p-3">
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : !customer ? (
        <div role="status" aria-label="Loading the health breakdown" className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} aria-hidden="true" className="block h-3 w-full animate-pulse rounded bg-subtle" />
          ))}
        </div>
      ) : (
        <Components customer={customer} />
      )}
    </section>
  );
}

function Components({ customer }: { customer: Customer }) {
  const rows = customer.health_breakdown;
  const measured = rows.filter((c) => c.available).length;
  const unmeasured = rows.length - measured;
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {rows.map((component) => (
          <Row key={component.key} component={component} />
        ))}
      </ul>
      {customer.health_score_is_overridden ? (
        <p className="mt-2 text-[11px] text-ink-muted">
          This score was set by hand. The components are what the calculation would have given.
        </p>
      ) : unmeasured > 0 ? (
        <p className="mt-2 text-[11px] text-ink-muted">
          Scored on the {measured} components with data; {unmeasured === 1 ? 'the other is' : `the other ${unmeasured} are`} left
          out rather than counted as zero.
        </p>
      ) : null}
    </>
  );
}
```

`src/components/organizations/detail/HeaderTiles.tsx`:
```tsx
import { useId, useState, type ReactNode } from 'react';
import type { Customer } from '../../../features/customers/customersSlice';
import { formatCompactMoney, formatDate } from '../../../features/customers/formatters';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import { HEALTH_LABEL } from '../../../features/organizations/portfolioLabels';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { HealthRing, PulsePair, RenewalRunway, TrendLine, renewalText } from '../portfolio/rowParts';
import { FOCUS } from '../portfolio/styles';
import { HealthBreakdown } from './HealthBreakdown';

const TILE = `flex min-w-[11rem] shrink-0 snap-start flex-col gap-2 rounded-xl bg-surface p-3 text-left hover:bg-subtle active:bg-line-subtle sm:min-w-0 ${FOCUS}`;

function Title({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{children}</span>;
}

/** The four tiles (spec §1.3). Health opens its breakdown below them; ARR,
 *  Renewal and Pulse jump to their Details panel. A four-column grid from
 *  `sm`; a strip that snaps sideways on phones. */
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
  const [open, setOpen] = useState(false);
  const breakdownId = useId();
  const commercial = row.details.commercial;
  const arr = commercial.arr_billed_at_account == null ? '—' : formatCompactMoney(commercial.arr_billed_at_account, commercial.currency);
  const pulse = row.pulse;
  const pulseWords = `AI ${pulse.ai ?? 'not set'}, CSM ${pulse.csm ?? 'not set'}${pulse.disagree ? ', pulses disagree' : ''}`;
  const band = HEALTH_LABEL[row.health.category];

  return (
    <div className="flex flex-col gap-3">
      <div className={isSm ? 'grid grid-cols-4 gap-3' : '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4'}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={open ? breakdownId : undefined}
          aria-label={`Health ${row.health.score.toFixed(1)}, ${band}. ${open ? 'Hide' : 'Show'} the breakdown`}
          className={TILE}
        >
          <Title>Health</Title>
          <span className="flex items-center gap-3">
            <HealthRing score={row.health.score} category={row.health.category} />
            <TrendLine trend={row.health.trend} category={row.health.category} />
          </span>
          <span className="text-[11px] text-ink-muted">
            {band} · {open ? 'Hide' : 'Show'} breakdown
          </span>
        </button>

        <button type="button" onClick={() => onJump('commercial')} aria-label={`ARR ${arr}. Show commercial details`} className={TILE}>
          <Title>ARR</Title>
          <span className="font-mono-brand text-[22px] leading-tight tabular-nums text-ink">{arr}</span>
          <span className="text-[11px] text-ink-muted">Billed at account, in {commercial.currency}</span>
        </button>

        <button
          type="button"
          onClick={() => onJump('contract')}
          aria-label={`Renewal ${renewalText(row.renewal.days)}. Show the contract timeline`}
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
      {open ? <HealthBreakdown id={breakdownId} customer={customer} error={customerError} /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/HeaderTiles.test.tsx src/components/organizations/detail/houseRules.test.ts`
Expected: PASS (8 tests, and the house rules).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/HealthBreakdown.tsx src/components/organizations/detail/HeaderTiles.tsx src/components/organizations/detail/HeaderTiles.test.tsx
git commit -m "feat(organizations): the organization page's four tiles and health breakdown

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Account chips and the tablist

**Files:**
- Create: `src/components/organizations/detail/CountChip.tsx`
- Create: `src/components/organizations/detail/AccountChips.tsx`
- Create: `src/components/organizations/detail/DetailTabs.tsx`
- Test: `src/components/organizations/detail/AccountChips.test.tsx`, `src/components/organizations/detail/DetailTabs.test.tsx`

**Interfaces:**
- Consumes: `Account` (`customersSlice.ts`); `DETAIL_TABS`, `DetailTab`, `detailTabId`, `detailPanelId` (Task 2); `FOCUS`, `QUIET` (`styles.ts`); `ACCOUNTS` (Task 1).
- Produces:
  - `CountChip({label: string; count: number | null; pressed: boolean; onClick: () => void})`: the rounded, `aria-pressed` chip with an optional mono count, shared by the account chips and the story's filters (Task 9). The caller sets `key`.
  - `AccountChips({accounts: Account[]; loading: boolean; error: string | null; counts: Record<string, number> | null; selected: string; onSelect: (value: string) => void; onRetry: () => void; onAdd: () => void; onEdit: (account: Account) => void})`. Chips: All (`counts.all`), each account (`counts[id] ?? 0`), and Organization (`counts.none`) when it has items or is chosen. `counts` is the backend's `by_account`: `all`, `none` and every in-scope account id. Pressing the chosen account chip again returns to All (`onSelect('')`).
  - `DetailTabs({idBase: string; active: DetailTab; onChange: (tab: DetailTab) => void})`: `role="tablist"`, roving tab index, arrows/Home/End with automatic activation, the active tab scrolled into view.

- [ ] **Step 1: Write the failing tests**

`src/components/organizations/detail/AccountChips.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ACCOUNTS } from '../../../features/organizations/testStory';
import { AccountChips } from './AccountChips';

function renderChips(props: Partial<ComponentProps<typeof AccountChips>> = {}) {
  const handlers = { onSelect: vi.fn(), onRetry: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn() };
  render(
    <AccountChips
      accounts={ACCOUNTS}
      loading={false}
      error={null}
      counts={{ all: 5, none: 3, '31': 1, '32': 1 }}
      selected=""
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const chips = () => within(screen.getByRole('group', { name: 'Filter by account' })).queryAllByRole('button');

describe('AccountChips (spec §1.4)', () => {
  it("shows All, each account and the organization itself with the story's counts", () => {
    renderChips();
    expect(chips().map((chip) => chip.textContent)).toEqual(['All 5', 'EMEA 1', 'North America 1', 'Organization 3']);
    expect(screen.getByRole('button', { name: 'All 5' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows no numbers until the story has counted', () => {
    renderChips({ counts: null });
    expect(chips().map((chip) => chip.textContent)).toEqual(['All', 'EMEA', 'North America']);
  });

  it('gives an account the story does not list a 0, and hides Organization when it has none', () => {
    renderChips({ counts: { all: 2, none: 0, '31': 2 } });
    expect(chips().map((chip) => chip.textContent)).toEqual(['All 2', 'EMEA 2', 'North America 0']);
  });

  it('chooses an account, and pressing it again goes back to All', async () => {
    const { onSelect } = renderChips({ selected: '31' });
    expect(screen.getByRole('button', { name: 'EMEA 1' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'North America 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'EMEA 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Organization 3' }));
    expect(onSelect.mock.calls.map(([value]) => value)).toEqual(['32', '', 'none']);
  });

  it('adds an account, and edits the chosen one', async () => {
    const { onAdd, onEdit } = renderChips({ selected: '31' });
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAdd).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Edit EMEA' }));
    expect(onEdit).toHaveBeenCalledWith(ACCOUNTS[0]);
  });

  it('offers no edit while All is chosen, and only Add when there are no accounts', () => {
    renderChips({ accounts: [] });
    expect(chips()).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeInTheDocument();
  });

  it('shows a skeleton while the accounts load', () => {
    renderChips({ accounts: [], loading: true });
    expect(screen.getByRole('status', { name: 'Loading accounts' })).toBeInTheDocument();
  });

  it('shows the error with Try again', async () => {
    const { onRetry } = renderChips({ accounts: [], error: 'Could not load accounts.' });
    expect(screen.getByText('Could not load accounts.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

`src/components/organizations/detail/DetailTabs.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { detailPanelId, detailTabId, type DetailTab } from '../../../features/organizations/detailParams';
import { DetailTabs } from './DetailTabs';

function Host() {
  const [tab, setTab] = useState<DetailTab>('story');
  return (
    <>
      <DetailTabs idBase="t" active={tab} onChange={setTab} />
      <div role="tabpanel" id={detailPanelId('t')} aria-labelledby={detailTabId('t', tab)}>
        {tab}
      </div>
    </>
  );
}

describe('DetailTabs (spec §1.5)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('is a tablist of the six tabs with the active one selected and alone in the tab order', () => {
    render(<Host />);
    expect(screen.getByRole('tablist', { name: 'Organization sections' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Story', 'Details', 'People', 'Deals & risks', 'Knowledge', 'Files']);
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1']);
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-controls', 't-panel');
    expect(screen.getByRole('tabpanel', { name: 'Story' })).toBeInTheDocument();
  });

  it('moves with the arrows, Home and End, wrapping, and selects as it goes', async () => {
    render(<Host />);
    screen.getByRole('tab', { name: 'Story' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('details');
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Files' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects on click and scrolls the chosen tab into view', async () => {
    render(<Host />);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    const knowledge = screen.getByRole('tab', { name: 'Knowledge' });
    await userEvent.click(knowledge);
    expect(screen.getByRole('tabpanel', { name: 'Knowledge' })).toHaveTextContent('knowledge');
    expect(scroll.mock.contexts).toContain(knowledge);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/organizations/detail/AccountChips.test.tsx src/components/organizations/detail/DetailTabs.test.tsx`
Expected: FAIL with "Failed to resolve import './AccountChips'" and "'./DetailTabs'".

- [ ] **Step 3: Implement**

`src/components/organizations/detail/CountChip.tsx`:
```tsx
import { FOCUS } from '../portfolio/styles';

const CHIP = `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] sm:min-h-8 ${FOCUS}`;

/** A pressable chip with an optional count: the account chips and the
 *  story's filters. The chosen one is the monochrome primary. */
export function CountChip({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string;
  /** Null until the story has counted: the chip shows no number. */
  count: number | null;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`${CHIP} ${pressed ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink hover:bg-subtle active:bg-line-subtle'}`}
    >
      <span className="max-w-[12rem] truncate">{label}</span>
      {count == null ? null : (
        <>
          {' '}
          <span className={`font-mono-brand text-[11px] tabular-nums ${pressed ? '' : 'text-ink-muted'}`}>{count}</span>
        </>
      )}
    </button>
  );
}
```

`src/components/organizations/detail/AccountChips.tsx`:
```tsx
import { Pencil, Plus } from 'lucide-react';
import type { Account } from '../../../features/customers/customersSlice';
import { QUIET } from '../portfolio/styles';
import { CountChip } from './CountChip';

/** The account chips (spec §1.4): All, each account and the organization
 *  itself, numbered by the story's `counts.by_account`. Accounts store no
 *  health, ARR or renewal, so a chip carries only its name and count. The
 *  row also adds an account and edits the chosen one (the old Accounts tab's
 *  two real actions). */
export function AccountChips({
  accounts,
  loading,
  error,
  counts,
  selected,
  onSelect,
  onRetry,
  onAdd,
  onEdit,
}: {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  /** `counts.by_account` from the story (`all`, `none`, each account in
   *  scope by id); null until it lands. */
  counts: Record<string, number> | null;
  /** An account id, 'none', or '' for All. */
  selected: string;
  onSelect: (value: string) => void;
  onRetry: () => void;
  onAdd: () => void;
  onEdit: (account: Account) => void;
}) {
  const total = counts ? (counts.all ?? 0) : null;
  const orgCount = counts?.none ?? 0;
  const current = accounts.find((account) => String(account.id) === selected) ?? null;

  const chip = (value: string, label: string, n: number | null) => {
    const pressed = selected === value;
    return (
      <CountChip key={value || 'all'} label={label} count={n} pressed={pressed} onClick={() => onSelect(pressed && value ? '' : value)} />
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Filter by account" className="flex min-w-0 max-w-full gap-2 overflow-x-auto sm:flex-wrap">
        {loading && accounts.length === 0 ? (
          <span role="status" aria-label="Loading accounts" className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} aria-hidden="true" className="h-8 w-24 animate-pulse rounded-full bg-subtle" />
            ))}
          </span>
        ) : error ? (
          <span className="inline-flex items-center gap-2 text-[13px] text-danger">
            {error}
            <button type="button" onClick={onRetry} className={QUIET}>
              Try again
            </button>
          </span>
        ) : accounts.length ? (
          <>
            {chip('', 'All', total)}
            {accounts.map((account) => chip(String(account.id), account.name, counts ? (counts[String(account.id)] ?? 0) : null))}
            {orgCount > 0 || selected === 'none' ? chip('none', 'Organization', counts ? orgCount : null) : null}
          </>
        ) : null}
      </div>
      {current ? (
        <button type="button" onClick={() => onEdit(current)} className={QUIET}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit {current.name}
        </button>
      ) : null}
      <button type="button" onClick={onAdd} className={QUIET}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add account
      </button>
    </div>
  );
}
```

`src/components/organizations/detail/DetailTabs.tsx`:
```tsx
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { DETAIL_TABS, detailPanelId, detailTabId, type DetailTab } from '../../../features/organizations/detailParams';
import { FOCUS } from '../portfolio/styles';

/** The page's tabs (spec §1.5): a real tablist whose selection lives in the
 *  URL. Arrows, Home and End move and select (automatic activation); only
 *  the selected tab is in the tab order. On phones the row scrolls sideways
 *  and the selected tab scrolls into view. */
export function DetailTabs({
  idBase,
  active,
  onChange,
}: {
  idBase: string;
  active: DetailTab;
  onChange: (tab: DetailTab) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const onKey = (event: KeyboardEvent, index: number) => {
    const last = DETAIL_TABS.length - 1;
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
    const tab = DETAIL_TABS[next].key;
    onChange(tab);
    document.getElementById(detailTabId(idBase, tab))?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Organization sections"
      className="-mx-4 flex gap-4 overflow-x-auto border-b border-line-subtle px-4 sm:mx-0 sm:px-0"
    >
      {DETAIL_TABS.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            id={detailTabId(idBase, tab.key)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={selected ? detailPanelId(idBase) : undefined}
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/AccountChips.test.tsx src/components/organizations/detail/DetailTabs.test.tsx src/components/organizations/detail/houseRules.test.ts`
Expected: PASS (8 + 3 tests, and the house rules).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/CountChip.tsx src/components/organizations/detail/AccountChips.tsx src/components/organizations/detail/AccountChips.test.tsx src/components/organizations/detail/DetailTabs.tsx src/components/organizations/detail/DetailTabs.test.tsx
git commit -m "feat(organizations): account chips and a real tablist for the organization page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Needs attention

**Files:**
- Create: `src/components/organizations/detail/AttentionBlock.tsx`
- Test: `src/components/organizations/detail/AttentionBlock.test.tsx`

**Interfaces:**
- Consumes: `StoryAttention`, `StoryGroup` (Task 1), `DetailTab` (Task 2), `PanelKey`, `formatDate`, `FOCUS`; `PIZZA_ATTENTION`, `QUIET_ATTENTION` (Task 1).
- Produces: `AttentionBlock({attention: StoryAttention; onFilter: (group: StoryGroup) => void; onOpenTab: (tab: DetailTab) => void; onJump: (panel: PanelKey) => void})`. Reads the backend's keys (`renewal`, `tickets`, `overdue_tasks`, `questions`, `anomaly`; backend plan Task 7). Renders nothing when every part is null. Renewal (`overdue` sets the tone) → `onJump('contract')`; tickets → `onFilter('tickets')`; overdue tasks → `onFilter('tasks')`; questions → `onOpenTab('knowledge')`; the anomaly is text only: its `title` as sent (already withheld for a viewer who does not see everything) and its `last_seen_at` date.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/AttentionBlock.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StoryAttention } from '../../../features/organizations/storyTypes';
import { PIZZA_ATTENTION, QUIET_ATTENTION } from '../../../features/organizations/testStory';
import { AttentionBlock } from './AttentionBlock';

function renderBlock(attention: StoryAttention = PIZZA_ATTENTION) {
  const handlers = { onFilter: vi.fn(), onOpenTab: vi.fn(), onJump: vi.fn() };
  const { container } = render(<AttentionBlock attention={attention} {...handlers} />);
  return { ...handlers, container };
}

describe('AttentionBlock (spec §1.6 "Needs attention")', () => {
  it('lists each thing that needs attention, in words', () => {
    renderBlock();
    const block = screen.getByRole('region', { name: 'Needs attention' });
    expect(within(block).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Renewal 47d overdue · 9 Aug 2026',
      '2 open High or Critical tickets · oldest 9d',
      '1 overdue task · oldest 4d',
      '3 unanswered questions',
      'Similar reports across 1 of your companies · 21 Sep 2026',
    ]);
  });

  it("shows the anomaly's title as the server sends it, and a renewal that is coming", () => {
    renderBlock({
      ...QUIET_ATTENTION,
      renewal: { date: '2026-10-10', days: 14, overdue: false },
      anomaly: { id: 9, title: 'Logins fell 60%', first_seen_at: '2026-09-20T08:00:00+00:00', last_seen_at: '2026-09-21T08:00:00+00:00' },
    });
    expect(screen.getByText('Renews in 14d')).toBeInTheDocument();
    expect(screen.getByText('Logins fell 60%')).toBeInTheDocument();
  });

  it('takes each row to what it is about', async () => {
    const { onFilter, onOpenTab, onJump } = renderBlock();
    await userEvent.click(screen.getByRole('button', { name: /^Renewal 47d overdue/ }));
    await userEvent.click(screen.getByRole('button', { name: /^2 open High or Critical tickets/ }));
    await userEvent.click(screen.getByRole('button', { name: /^1 overdue task/ }));
    await userEvent.click(screen.getByRole('button', { name: '3 unanswered questions' }));
    expect(onJump).toHaveBeenCalledWith('contract');
    expect(onFilter.mock.calls.map(([group]) => group)).toEqual(['tickets', 'tasks']);
    expect(onOpenTab).toHaveBeenCalledWith('knowledge');
    expect(screen.queryByRole('button', { name: /Similar reports/ })).not.toBeInTheDocument();
  });

  it('is not shown when nothing needs attention', () => {
    const { container } = renderBlock(QUIET_ATTENTION);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/organizations/detail/AttentionBlock.test.tsx`
Expected: FAIL with "Failed to resolve import './AttentionBlock'".

- [ ] **Step 3: Implement**

`src/components/organizations/detail/AttentionBlock.tsx`:
```tsx
import { useId } from 'react';
import { CircleAlert } from 'lucide-react';
import { formatDate } from '../../../features/customers/formatters';
import type { DetailTab } from '../../../features/organizations/detailParams';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import type { StoryAttention, StoryGroup } from '../../../features/organizations/storyTypes';
import { FOCUS } from '../portfolio/styles';

interface Row {
  key: string;
  tone: string;
  text: string;
  detail?: string;
  action?: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Needs attention (spec §1.6), shown only when something does. Each row
 *  says what it is in words and, where there is one, goes to it. */
export function AttentionBlock({
  attention,
  onFilter,
  onOpenTab,
  onJump,
}: {
  attention: StoryAttention;
  onFilter: (group: StoryGroup) => void;
  onOpenTab: (tab: DetailTab) => void;
  onJump: (panel: PanelKey) => void;
}) {
  const headingId = useId();
  const { renewal, tickets, overdue_tasks, questions, anomaly } = attention;
  const rows: Row[] = [];
  if (renewal) {
    rows.push({
      key: 'renewal',
      tone: renewal.overdue ? 'text-danger' : 'text-warning',
      text: renewal.overdue ? `Renewal ${-renewal.days}d overdue` : renewal.days === 0 ? 'Renews today' : `Renews in ${renewal.days}d`,
      detail: formatDate(renewal.date),
      action: () => onJump('contract'),
    });
  }
  if (tickets) {
    rows.push({
      key: 'tickets',
      tone: 'text-danger',
      text: plural(tickets.count, 'open High or Critical ticket', 'open High or Critical tickets'),
      detail: `oldest ${tickets.oldest_days}d`,
      action: () => onFilter('tickets'),
    });
  }
  if (overdue_tasks) {
    rows.push({
      key: 'tasks',
      tone: 'text-warning',
      text: plural(overdue_tasks.count, 'overdue task', 'overdue tasks'),
      detail: `oldest ${overdue_tasks.oldest_days}d`,
      action: () => onFilter('tasks'),
    });
  }
  if (questions) {
    rows.push({
      key: 'questions',
      tone: 'text-warning',
      text: plural(questions.count, 'unanswered question', 'unanswered questions'),
      action: () => onOpenTab('knowledge'),
    });
  }
  if (anomaly) {
    // The server already withholds the title from a viewer who does not see
    // everything; the page shows what it sends.
    rows.push({
      key: 'anomaly',
      tone: 'text-warning',
      text: anomaly.title,
      detail: formatDate(anomaly.last_seen_at.slice(0, 10)),
    });
  }
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="rounded-xl bg-surface p-3">
      <h2 id={headingId} className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        Needs attention
      </h2>
      <ul className="flex flex-col">
        {rows.map((row) => {
          const content = (
            <>
              <CircleAlert className={`h-4 w-4 shrink-0 ${row.tone}`} aria-hidden="true" />
              <span className="min-w-0 truncate text-ink">{row.text}</span>
              {row.detail ? (
                <>
                  {' · '}
                  <span className="shrink-0 font-mono-brand text-[11px] tabular-nums text-ink-muted">{row.detail}</span>
                </>
              ) : null}
            </>
          );
          return (
            <li key={row.key}>
              {row.action ? (
                <button
                  type="button"
                  onClick={row.action}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-[13px] text-ink-muted hover:bg-subtle active:bg-line-subtle sm:min-h-9 ${FOCUS}`}
                >
                  {content}
                </button>
              ) : (
                <div className="flex min-h-11 items-center gap-2 px-1 text-[13px] text-ink-muted sm:min-h-9">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/AttentionBlock.test.tsx src/components/organizations/detail/houseRules.test.ts`
Expected: PASS (4 tests, and the house rules).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/AttentionBlock.tsx src/components/organizations/detail/AttentionBlock.test.tsx
git commit -m "feat(organizations): the story's Needs attention block

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The story toolbar: filters, Sources, search and + Add

**Files:**
- Modify: `src/components/organizations/portfolio/styles.ts` (add `PRIMARY`)
- Create: `src/components/organizations/detail/SourcesPicker.tsx`
- Create: `src/components/organizations/detail/StoryToolbar.tsx`
- Test: `src/components/organizations/detail/StoryToolbar.test.tsx`

**Interfaces:**
- Consumes: `STORY_GROUPS`, `STORY_KINDS`, `offeredSources`, `ADD_FLOWS`, `AddKind`, `StoryCounts` (Task 1); `Menu` (Task 5); `CountChip` (Task 7); `useDismiss`; `BUTTON`, `FOCUS`, `QUIET`.
- Produces (styles): `PRIMARY` in `portfolio/styles.ts`, the monochrome primary button (`bg-accent text-on-accent`, no surface colours to fight it).
- Produces:
  - `SourcesPicker({offered: StoryKind[]; selected: StoryKind[]; onChange: (next: StoryKind[]) => void})`: a button "Sources" (with "· n" when some are chosen) opening a checkbox panel and an "Every source" reset.
  - `StoryToolbar({group; sources; q; byGroup: StoryCounts['by_group'] | null; byKind: StoryCounts['by_kind'] | null; isSm: boolean; onGroup: (group: StoryGroup | '') => void; onSources: (sources: StoryKind[]) => void; onSearch: (q: string) => void; onAdd: (what: AddKind) => void})`. All's count is `byGroup.all`. Search calls `onSearch(trimmed)` 300ms after typing stops, or at once on Enter; the draft follows `q` when it changes from outside. The Add button's name is "Add to the story".

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/StoryToolbar.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoryToolbar } from './StoryToolbar';

const COUNTS = { all: 5, conversations: 2, tickets: 1, tasks: 1, feedback: 0, health: 1 };
const BY_KIND = { activity: 0, calendar_event: 0, call: 1, email: 1, health: 1, note: 0, survey: 0, task: 1, ticket: 1 };

function renderToolbar(props: Partial<ComponentProps<typeof StoryToolbar>> = {}) {
  const handlers = { onGroup: vi.fn(), onSources: vi.fn(), onSearch: vi.fn(), onAdd: vi.fn() };
  const base = { group: '' as const, sources: [], q: '', byGroup: COUNTS, byKind: BY_KIND, isSm: true, ...handlers };
  const view = render(<StoryToolbar {...base} {...props} />);
  return { ...handlers, rerender: (next: Partial<ComponentProps<typeof StoryToolbar>>) => view.rerender(<StoryToolbar {...base} {...props} {...next} />) };
}

const filters = () => within(screen.getByRole('group', { name: 'Show' })).getAllByRole('button');

describe('StoryToolbar (spec §1.6)', () => {
  it('shows the six filters with their counts, All pressed', () => {
    renderToolbar();
    expect(filters().map((button) => button.textContent)).toEqual([
      'All 5',
      'Conversations 2',
      'Tickets 1',
      'Tasks & notes 1',
      'Feedback 0',
      'Health & usage 1',
    ]);
    expect(screen.getByRole('button', { name: 'All 5' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the filters without numbers until the story has counted', () => {
    renderToolbar({ byGroup: null, byKind: null });
    expect(filters().map((button) => button.textContent)).toEqual(['All', 'Conversations', 'Tickets', 'Tasks & notes', 'Feedback', 'Health & usage']);
  });

  it('chooses a filter', async () => {
    const { onGroup } = renderToolbar({ group: 'tickets' });
    expect(screen.getByRole('button', { name: 'Tickets 1' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Conversations 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'All 5' }));
    expect(onGroup.mock.calls.map(([group]) => group)).toEqual(['conversations', '']);
  });

  it("offers the chosen filter's exact sources that have data, and resets them", async () => {
    const { onSources } = renderToolbar({ group: 'conversations', sources: ['email'] });
    const sources = screen.getByRole('button', { name: 'Sources · 1' });
    await userEvent.click(sources);
    expect(sources).toHaveAttribute('aria-expanded', 'true');
    const boxes = screen.getAllByRole('checkbox');
    // by_kind has no activities or calendar events, so neither is offered.
    expect(boxes.map((box) => box.closest('label')?.textContent)).toEqual(['Calls', 'Emails']);
    expect(screen.getByRole('checkbox', { name: 'Emails' })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Calls' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Emails' }));
    await userEvent.click(screen.getByRole('button', { name: 'Every source' }));
    expect(onSources.mock.calls.map(([next]) => next)).toEqual([['email', 'call'], [], []]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(sources).toHaveFocus();
  });

  it('searches once typing stops, and at once on Enter', async () => {
    const { onSearch } = renderToolbar();
    const box = screen.getByRole('searchbox', { name: 'Search the story' });
    await userEvent.type(box, 'retraining');
    expect(onSearch).not.toHaveBeenCalled();
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('retraining'));
    expect(onSearch).toHaveBeenCalledTimes(1);
    await userEvent.clear(box);
    await userEvent.type(box, ' quote {Enter}');
    expect(onSearch).toHaveBeenLastCalledWith('quote');
  });

  it('follows a search that changes from outside (Clear filters)', () => {
    const { rerender } = renderToolbar({ q: 'quote' });
    expect(screen.getByRole('searchbox', { name: 'Search the story' })).toHaveValue('quote');
    rerender({ q: '' });
    expect(screen.getByRole('searchbox', { name: 'Search the story' })).toHaveValue('');
  });

  it('+ Add offers the four existing create flows', async () => {
    const { onAdd } = renderToolbar();
    const add = screen.getByRole('button', { name: 'Add to the story' });
    // The primary: accent fill and its own text colour, with no surface fill to fight it.
    expect(add).toHaveClass('bg-accent', 'text-on-accent');
    expect(add).not.toHaveClass('bg-surface');
    expect(add).not.toHaveClass('text-ink');
    await userEvent.click(add);
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Log a call', 'New task', 'New note', 'Log survey']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    expect(onAdd).toHaveBeenCalledWith('task');
  });

  it('lets the filters scroll sideways on phones', () => {
    renderToolbar({ isSm: false });
    expect(screen.getByRole('group', { name: 'Show' })).toHaveClass('overflow-x-auto');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/organizations/detail/StoryToolbar.test.tsx`
Expected: FAIL with "Failed to resolve import './StoryToolbar'".

- [ ] **Step 3: Implement**

In `src/components/organizations/portfolio/styles.ts`, append:
```ts

/** The monochrome primary button (one per surface): accent fill, its own
 *  text colour. Written out rather than layered on BUTTON, whose surface
 *  fill and ink text would win in the stylesheet's order. */
export const PRIMARY = `inline-flex min-h-11 sm:min-h-9 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 text-[13px] font-semibold text-on-accent hover:bg-accent-hover active:bg-accent-hover disabled:opacity-50 ${FOCUS}`;
```

`src/components/organizations/detail/SourcesPicker.tsx`:
```tsx
import { useId, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { STORY_KINDS } from '../../../features/organizations/storyKinds';
import type { StoryKind } from '../../../features/organizations/storyTypes';
import { useDismiss } from '../portfolio/useDismiss';
import { BUTTON, FOCUS, QUIET } from '../portfolio/styles';

/** Sources (spec §1.6): a multi-select of the exact kinds the chosen filter
 *  covers. Escape or a press outside closes it. */
export function SourcesPicker({
  offered,
  selected,
  onChange,
}: {
  offered: StoryKind[];
  selected: StoryKind[];
  onChange: (next: StoryKind[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useDismiss(
    [buttonRef, panelRef],
    (reason) => {
      setOpen(false);
      if (reason === 'escape') buttonRef.current?.focus();
    },
    open,
  );

  const toggle = (kind: StoryKind) => onChange(selected.includes(kind) ? selected.filter((k) => k !== kind) : [...selected, kind]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={BUTTON}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Sources
        {selected.length ? (
          <>
            {' '}
            <span className="font-mono-brand tabular-nums">· {selected.length}</span>
          </>
        ) : null}
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-line bg-surface p-2 shadow-md">
          <fieldset>
            <legend className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Sources</legend>
            {STORY_KINDS.filter((k) => offered.includes(k.kind)).map((k) => (
              <label
                key={k.kind}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1 text-[13px] text-ink hover:bg-subtle sm:min-h-8"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(k.kind)}
                  onChange={() => toggle(k.kind)}
                  className={`h-4 w-4 accent-accent ${FOCUS}`}
                />
                {k.label}
              </label>
            ))}
          </fieldset>
          <button type="button" onClick={() => onChange([])} disabled={selected.length === 0} className={`${QUIET} mt-1 w-full`}>
            Every source
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

`src/components/organizations/detail/StoryToolbar.tsx`:
```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { ADD_FLOWS, STORY_GROUPS, offeredSources, type AddKind } from '../../../features/organizations/storyKinds';
import type { StoryCounts, StoryGroup, StoryKind } from '../../../features/organizations/storyTypes';
import { FOCUS, PRIMARY } from '../portfolio/styles';
import { CountChip } from './CountChip';
import { Menu } from './Menu';
import { SourcesPicker } from './SourcesPicker';

const SEARCH_DELAY_MS = 300;

/** The story's toolbar (spec §1.6): the six filters with their counts,
 *  Sources, search and + Add. */
export function StoryToolbar({
  group,
  sources,
  q,
  byGroup,
  byKind,
  isSm,
  onGroup,
  onSources,
  onSearch,
  onAdd,
}: {
  group: StoryGroup | '';
  sources: StoryKind[];
  q: string;
  /** `counts.by_group` from the story (`all` and the five groups); null until it lands. */
  byGroup: StoryCounts['by_group'] | null;
  /** `counts.by_kind` from the story; null until it lands. */
  byKind: StoryCounts['by_kind'] | null;
  isSm: boolean;
  onGroup: (group: StoryGroup | '') => void;
  onSources: (sources: StoryKind[]) => void;
  onSearch: (q: string) => void;
  onAdd: (what: AddKind) => void;
}) {
  const searchId = useId();
  const [draft, setDraft] = useState(q);
  // The URL's q changed from outside (Clear filters, Back): the box follows.
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setDraft(q);
  }

  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    if (draft.trim() === q.trim()) return;
    const timer = window.setTimeout(() => onSearchRef.current(draft.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, q]);

  const total = byGroup ? byGroup.all : null;

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Show" className={isSm ? 'flex flex-wrap gap-1.5' : '-mx-4 flex gap-1.5 overflow-x-auto px-4'}>
        {STORY_GROUPS.map((option) => (
          <CountChip
            key={option.key || 'all'}
            label={option.label}
            count={option.key ? (byGroup?.[option.key] ?? null) : total}
            pressed={group === option.key}
            onClick={() => onGroup(option.key)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchRef.current(draft.trim());
          }}
          className="relative min-w-0 flex-1 sm:max-w-xs"
        >
          <label htmlFor={searchId} className="sr-only">
            Search the story
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search the story"
            className={`min-h-11 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-[15px] text-ink placeholder:text-ink-muted sm:min-h-9 sm:text-[13px] ${FOCUS}`}
          />
        </form>
        <SourcesPicker offered={offeredSources(group, byKind, sources)} selected={sources} onChange={onSources} />
        <Menu
          label="Add to the story"
          trigger={
            <>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </>
          }
          triggerClassName={PRIMARY}
          items={ADD_FLOWS.map((flow) => ({ key: flow.key, label: flow.label, onSelect: () => onAdd(flow.key) }))}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/StoryToolbar.test.tsx src/components/organizations/detail/houseRules.test.ts`
Expected: PASS (8 tests, and the house rules).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/styles.ts src/components/organizations/detail/SourcesPicker.tsx src/components/organizations/detail/StoryToolbar.tsx src/components/organizations/detail/StoryToolbar.test.tsx
git commit -m "feat(organizations): the story toolbar with filters, Sources, search and Add

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The stream: items grouped by day, paging, and its states

**Files:**
- Create: `src/components/organizations/detail/StoryItemRow.tsx`
- Create: `src/components/organizations/detail/StoryStream.tsx`
- Test: `src/components/organizations/detail/StoryStream.test.tsx`

**Interfaces:**
- Consumes: `StoryItem`, `StoryKind` (Task 1), `KIND_NAME`, `sourceName` (Task 1), `timeLabel`, `dayLabel`, `groupByDay`, `localDay` (Task 2), `StoryState` (Task 4), `EmptyState`, `ErrorBlock`, `MoreButton` (`portfolio/PortfolioSections.tsx`), `useEndSentinel`, `FOCUS`, `QUIET`; `installIntersectionObserver` (`src/test/intersection.ts`).
- Produces:
  - `StoryItemRow({item: StoryItem; onOpenEmail: (item: StoryItem) => void})`: `<li data-story-item="<kind>:<id>">`. An email with a `link.thread_id` has a title button that calls `onOpenEmail`; any other item (an email with no thread included), when it has a summary or a `link.url`, has a title that toggles it open (`aria-expanded`), showing the full summary and an "Open in <source>" link to `link.url`.
  - `StoryStream({story: StoryState; filtered: boolean; today?: string; onClearFilters: () => void; onOpenEmail: (item: StoryItem) => void})`.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/StoryStream.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { StoryItem, StoryResponse } from '../../../features/organizations/storyTypes';
import { QUIET_ATTENTION, STORY_ITEMS } from '../../../features/organizations/testStory';
import { installIntersectionObserver } from '../../../test/intersection';
import { StoryStream } from './StoryStream';
import type { StoryState } from './useStory';

const response = (items: StoryItem[]): StoryResponse => ({
  items,
  next_cursor: null,
  counts: {
    by_group: { all: 0, conversations: 0, tickets: 0, tasks: 0, feedback: 0, health: 0 },
    by_kind: { activity: 0, calendar_event: 0, call: 0, email: 0, health: 0, note: 0, survey: 0, task: 0, ticket: 0 },
    by_account: { all: 0, none: 0 },
  },
  attention: QUIET_ATTENTION,
});

function state(partial: Partial<StoryState> = {}): StoryState {
  const items = partial.items ?? STORY_ITEMS;
  return {
    data: response(items),
    items,
    next: null,
    loading: false,
    error: null,
    loadingMore: false,
    moreError: null,
    loadMore: vi.fn(async () => {}),
    retry: vi.fn(),
    ...partial,
  };
}

function renderStream(story: StoryState, filtered = false) {
  const handlers = { onClearFilters: vi.fn(), onOpenEmail: vi.fn() };
  render(
    <MemoryRouter>
      <StoryStream story={story} filtered={filtered} today="2026-09-25" {...handlers} />
    </MemoryRouter>,
  );
  return handlers;
}

const row = (key: string) => document.querySelector(`[data-story-item="${key}"]`) as HTMLElement;

describe('StoryStream (spec §1.6 "Stream")', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('groups the items by day, newest first', () => {
    renderStream(state());
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Today',
      'Yesterday',
      '20 Sep 2026',
      '31 Aug 2026',
    ]);
    expect(within(screen.getByRole('region', { name: 'Today' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('gives each item its kind, account, who and source, and its time unless it is all-day', () => {
    renderStream(state());
    expect(within(row('email:41')).getByText('EMEA')).toBeInTheDocument();
    expect(within(row('email:41')).getByText('Email · Dana Buyer · via Gmail')).toBeInTheDocument();
    expect(within(row('call:12')).getByText('Organization')).toBeInTheDocument();
    expect(within(row('call:12')).getByText('The admin left and usage fell. Agreed a retraining session.')).toBeInTheDocument();
    // Logged in Revenact: no "via".
    expect(within(row('call:12')).getByText('Call · Carl CSM')).toBeInTheDocument();
    expect(within(row('ticket:88')).getByText('Ticket · Sam Admin · via Zendesk')).toBeInTheDocument();
    expect(within(row('health:3')).getByText('Health change')).toBeInTheDocument();
    expect(row('call:12').querySelector('time')).not.toBeNull();
    expect(row('ticket:88').querySelector('time')).toBeNull();
    expect(row('health:3').querySelector('time')).toBeNull();
    expect(row('email:41').querySelector('img')).toBeNull();
  });

  it('opens an email that has a thread as its thread', async () => {
    const { onOpenEmail } = renderStream(state());
    const title = within(row('email:41')).getByRole('button', { name: 'Re: Renewal pricing' });
    expect(title).toHaveAttribute('aria-haspopup', 'dialog');
    // A 44px target below sm, like every control.
    expect(title).toHaveClass('min-h-11', 'sm:min-h-0');
    await userEvent.click(title);
    expect(onOpenEmail).toHaveBeenCalledWith(STORY_ITEMS[0]);
  });

  it('opens another item in place, with its link in the source system', async () => {
    renderStream(state());
    const title = within(row('ticket:88')).getByRole('button', { name: 'SSO login fails' });
    expect(title).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    const link = within(row('ticket:88')).getByRole('link', { name: 'Open in Zendesk' });
    expect(link).toHaveAttribute('href', 'https://acme.zendesk.example/tickets/88');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('opens an email with no thread in place, links only http(s), and has no toggle with nothing to show', async () => {
    const onDay = { occurred_at: '2026-09-20T00:00:00+00:00', all_day: true };
    const items: StoryItem[] = [
      { ...STORY_ITEMS[0], id: 59, title: 'Logged email', summary: 'Typed in Revenact.', source: 'revenact', link: { thread_id: null, url: null } },
      { ...STORY_ITEMS[1], id: 60, title: 'Recorded call', link: { thread_id: null, url: 'http://rec.example/60' } },
      { ...STORY_ITEMS[3], ...onDay, id: 61, kind: 'note', title: 'Odd link', summary: 'x', link: { thread_id: null, url: 'javascript:alert(1)' } },
      { ...STORY_ITEMS[3], id: 62, kind: 'task', title: 'Bare task', summary: '', link: { thread_id: null, url: null } },
    ];
    const { onOpenEmail } = renderStream(state({ items }));
    const logged = within(row('email:59')).getByRole('button', { name: 'Logged email' });
    expect(logged).not.toHaveAttribute('aria-haspopup');
    await userEvent.click(logged);
    expect(logged).toHaveAttribute('aria-expanded', 'true');
    expect(onOpenEmail).not.toHaveBeenCalled();
    await userEvent.click(within(row('call:60')).getByRole('button', { name: 'Recorded call' }));
    expect(within(row('call:60')).getByRole('link', { name: 'Open the recording' })).toHaveAttribute('href', 'http://rec.example/60');
    await userEvent.click(within(row('note:61')).getByRole('button', { name: 'Odd link' }));
    expect(within(row('note:61')).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row('task:62')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a skeleton before the first page', () => {
    renderStream(state({ data: null, items: [], loading: true }));
    expect(screen.getByRole('status', { name: 'Loading the story' })).toBeInTheDocument();
  });

  it('shows the error with Try again', async () => {
    const story = state({ data: null, items: [], error: 'Try later.' });
    renderStream(story);
    expect(screen.getByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(story.retry).toHaveBeenCalledOnce();
  });

  it('says when nothing matches the filters, with Clear filters', async () => {
    const { onClearFilters } = renderStream(state({ items: [] }), true);
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('says when there is nothing yet', () => {
    renderStream(state({ items: [] }));
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('loads the next page when the end scrolls into view, or on Show more', async () => {
    const io = installIntersectionObserver();
    const story = state({ next: '30' });
    renderStream(story);
    act(() => io.reveal(document.querySelector('[data-sentinel]') as Element));
    expect(story.loadMore).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(story.loadMore).toHaveBeenCalledTimes(2);
  });

  it('does not ask again while a page is loading', () => {
    const io = installIntersectionObserver();
    const story = state({ next: '30', loadingMore: true });
    renderStream(story);
    expect(io.watching(document.querySelector('[data-sentinel]') as Element)).toBe(false);
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
  });

  it('shows a failed page under Show more and stops asking until Show more is pressed', async () => {
    const io = installIntersectionObserver();
    const story = state({ next: '30', moreError: 'Could not load more of the story.' });
    renderStream(story);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load more of the story.');
    expect(io.watching(document.querySelector('[data-sentinel]') as Element)).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(story.loadMore).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/organizations/detail/StoryStream.test.tsx`
Expected: FAIL with "Failed to resolve import './StoryStream'".

- [ ] **Step 3: Implement**

`src/components/organizations/detail/StoryItemRow.tsx`:
```tsx
import { useId, useState } from 'react';
import {
  Activity,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  HeartPulse,
  LifeBuoy,
  Mail,
  Phone,
  SquareCheck,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { KIND_NAME, sourceName } from '../../../features/organizations/storyKinds';
import { timeLabel } from '../../../features/organizations/storyDays';
import type { StoryItem, StoryKind } from '../../../features/organizations/storyTypes';
import { FOCUS } from '../portfolio/styles';

const ICON: Record<StoryKind, LucideIcon> = {
  activity: Activity,
  call: Phone,
  email: Mail,
  calendar_event: CalendarDays,
  ticket: LifeBuoy,
  task: SquareCheck,
  note: StickyNote,
  survey: ClipboardList,
  health: HeartPulse,
};

const LINK = `mt-1 inline-flex min-h-11 items-center gap-1 rounded-sm text-[13px] font-semibold text-ink underline sm:min-h-0 ${FOCUS}`;

/** `link.url`: a ticket in its source system or a call's recording, in a new
 *  tab. The backend sends only http(s) URLs; the check stays because the
 *  value lands in an href. The backend sends no in-app paths. */
function ItemLink({ item }: { item: StoryItem }) {
  const url = item.link.url ?? '';
  if (!/^https?:\/\//i.test(url)) return null;
  const name = sourceName(item.source);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={LINK}>
      {item.kind === 'call' && !name ? 'Open the recording' : `Open in ${name || 'its source'}`}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}

/** One story item (spec §1.6): icon, title, time, a one-line summary, then
 *  the account tag and kind · who · source. An email with a thread opens it;
 *  any other item with more to show opens in place. */
export function StoryItemRow({ item, onOpenEmail }: { item: StoryItem; onOpenEmail: (item: StoryItem) => void }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const Icon = ICON[item.kind] ?? Activity;
  const time = timeLabel(item);
  const threaded = item.kind === 'email' && Boolean(item.link.thread_id);
  const expandable = !threaded && Boolean(item.summary || item.link.url);
  const source = sourceName(item.source);
  const meta = [KIND_NAME[item.kind] ?? 'Record', item.actor?.name, source ? `via ${source}` : null]
    .filter(Boolean)
    .join(' · ');
  // A 44px target below sm (the line height centres the title in it).
  const titleButton = `inline-block min-h-11 max-w-full truncate rounded-sm text-left leading-[2.75rem] hover:underline active:opacity-70 sm:min-h-0 sm:leading-normal ${FOCUS}`;

  return (
    <li data-story-item={`${item.kind}:${item.id}`} className="flex gap-3 px-3 py-2.5">
      <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-muted">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            {threaded ? (
              <button type="button" aria-haspopup="dialog" onClick={() => onOpenEmail(item)} className={titleButton}>
                {item.title}
              </button>
            ) : expandable ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? detailId : undefined}
                onClick={() => setExpanded((value) => !value)}
                className={titleButton}
              >
                {item.title}
              </button>
            ) : (
              item.title
            )}
          </h3>
          {time ? (
            <time dateTime={item.occurred_at} className="shrink-0 font-mono-brand text-[11px] tabular-nums text-ink-muted">
              {time}
            </time>
          ) : null}
        </div>
        {expanded ? (
          <div id={detailId}>
            {item.summary ? <p className="whitespace-pre-line break-words text-[13px] text-ink-muted">{item.summary}</p> : null}
            <ItemLink item={item} />
          </div>
        ) : item.summary ? (
          <p className="truncate text-[13px] text-ink-muted">{item.summary}</p>
        ) : null}
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
          <span className="inline-flex max-w-[10rem] truncate rounded-full bg-subtle px-2 py-0.5 text-ink">
            {item.account?.name ?? 'Organization'}
          </span>
          <span className="min-w-0 truncate">{meta}</span>
        </p>
      </div>
    </li>
  );
}
```

`src/components/organizations/detail/StoryStream.tsx`:
```tsx
import { useId } from 'react';
import { dayLabel, groupByDay, localDay } from '../../../features/organizations/storyDays';
import type { StoryItem } from '../../../features/organizations/storyTypes';
import { EmptyState, ErrorBlock, MoreButton } from '../portfolio/PortfolioSections';
import { useEndSentinel } from '../portfolio/useEndSentinel';
import { QUIET } from '../portfolio/styles';
import { StoryItemRow } from './StoryItemRow';
import type { StoryState } from './useStory';

function Skeleton() {
  return (
    <div role="status" aria-label="Loading the story">
      <ul aria-hidden="true" className="divide-y divide-line-subtle rounded-xl bg-surface">
        {[0, 1, 2, 3, 4].map((i) => (
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

function Day({ label, items, onOpenEmail }: { label: string; items: StoryItem[]; onOpenEmail: (item: StoryItem) => void }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </h2>
      <ul className="divide-y divide-line-subtle rounded-xl bg-surface">
        {items.map((item) => (
          <StoryItemRow key={`${item.kind}:${item.id}`} item={item} onOpenEmail={onOpenEmail} />
        ))}
      </ul>
    </section>
  );
}

/** The stream (spec §1.6): a clean list grouped by day, newest first, in the
 *  Communications inbox's manner. The next page loads when the end scrolls
 *  into view, with Show more as the fallback. */
export function StoryStream({
  story,
  filtered,
  today = localDay(new Date()),
  onClearFilters,
  onOpenEmail,
}: {
  story: StoryState;
  /** Any account, filter, source or search is set (the empty state offers Clear filters). */
  filtered: boolean;
  today?: string;
  onClearFilters: () => void;
  onOpenEmail: (item: StoryItem) => void;
}) {
  const sentinel = useEndSentinel(() => void story.loadMore(), Boolean(story.next) && !story.loadingMore && !story.moreError);

  if (story.error) return <ErrorBlock message={story.error} onRetry={story.retry} />;
  if (!story.data) return <Skeleton />;
  if (story.items.length === 0) {
    return filtered ? (
      <EmptyState
        title="Nothing matches these filters"
        detail="Try another account, filter or search."
        action={
          <button type="button" onClick={onClearFilters} className={`${QUIET} border border-line`}>
            Clear filters
          </button>
        }
      />
    ) : (
      <EmptyState title="Nothing here yet" detail="Calls, emails, tickets, tasks and notes appear here as they happen." action={null} />
    );
  }

  return (
    <div aria-busy={story.loading} className="flex flex-col gap-3">
      {groupByDay(story.items).map((day) => (
        <Day key={day.key} label={dayLabel(day.key, today)} items={day.items} onOpenEmail={onOpenEmail} />
      ))}
      <div ref={sentinel} data-sentinel="" aria-hidden="true" className="h-px" />
      <MoreButton next={story.next} loading={story.loadingMore} error={story.moreError} label="Show more" onClick={() => void story.loadMore()} />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/StoryStream.test.tsx src/components/organizations/detail/houseRules.test.ts`
Expected: PASS (12 tests, and the house rules).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/StoryItemRow.tsx src/components/organizations/detail/StoryStream.tsx src/components/organizations/detail/StoryStream.test.tsx
git commit -m "feat(organizations): the story stream, grouped by day and paged

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Opening an email shows its thread

**Files:**
- Create: `src/components/organizations/detail/EmailThread.tsx`
- Test: `src/components/organizations/detail/EmailThread.test.tsx`

**Interfaces:**
- Consumes: `fetchThread`, `sourceName` (Task 1), `StoryItem`, `errorMessage`, `QUIET`, `Sheet` (Task 3), `THREAD_ITEMS`, `stubOrganizationPage`, `requestPaths`, `storyQueries` (Task 1).
- Produces: `EmailThread({orgId: number; threadId: string; openedId: number; title: string; isSm: boolean; onClose: () => void})`: reads the thread through the story endpoint (`GET /organizations/{orgId}/story/?thread=<threadId>&limit=100`, every page; backend pre-flight 14) and shows it oldest first in a `Sheet` titled `title`.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/EmailThread.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestPaths, storyQueries, stubOrganizationPage } from '../../../features/organizations/testStory';
import { EmailThread } from './EmailThread';

function renderThread() {
  const onClose = vi.fn();
  render(<EmailThread orgId={7} threadId="t-1" openedId={41} title="Re: Renewal pricing" isSm onClose={onClose} />);
  return onClose;
}

describe('EmailThread (spec §1.6 "Opening an email shows its thread")', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('reads the thread from the story with ?thread= and shows it oldest first, with no reply controls', async () => {
    const spy = stubOrganizationPage();
    renderThread();
    const dialog = screen.getByRole('dialog', { name: 'Re: Renewal pricing' });
    expect(within(dialog).getByRole('status', { name: 'Opening the email' })).toBeInTheDocument();
    const messages = await within(dialog).findAllByRole('listitem');
    expect(messages.map((message) => message.querySelector('p')?.textContent)).toEqual(['Carl CSM', 'Dana Buyer']);
    expect(messages[1]).toHaveAttribute('aria-current', 'true');
    expect(within(dialog).getByText('Sharing the renewal quote ahead of your board meeting.')).toBeInTheDocument();
    expect(within(dialog).getByText('Can we see the quote before the board meets on Friday?')).toBeInTheDocument();
    expect(within(dialog).getByText('Organization · via Gmail')).toBeInTheDocument();
    expect(within(dialog).getByText('EMEA · via Gmail')).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription('2 messages');
    expect(within(dialog).queryByRole('button', { name: /Reply|Forward/ })).not.toBeInTheDocument();
    expect(dialog.querySelector('img')).toBeNull();
    expect(requestPaths(spy)).toEqual(['GET /organizations/7/story/']);
    expect(Object.fromEntries(storyQueries(spy)[0])).toEqual({ thread: 't-1', limit: '100' });
  });

  it('says so when the email is no longer there for this viewer', async () => {
    stubOrganizationPage({ threads: { 't-1': [] } });
    renderThread();
    expect(await screen.findByText('This email is no longer available to you.')).toBeInTheDocument();
  });

  it('shows a failed read with Try again', async () => {
    const spy = stubOrganizationPage({ failStory: 1 });
    renderThread();
    expect(await screen.findByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
    expect(requestPaths(spy)).toHaveLength(2);
  });

  it('closes from Close', async () => {
    stubOrganizationPage();
    const onClose = renderThread();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/organizations/detail/EmailThread.test.tsx`
Expected: FAIL with "Failed to resolve import './EmailThread'".

- [ ] **Step 3: Implement**

`src/components/organizations/detail/EmailThread.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { fetchThread } from '../../../features/organizations/storyApi';
import { sourceName } from '../../../features/organizations/storyKinds';
import type { StoryItem } from '../../../features/organizations/storyTypes';
import { errorMessage } from '../portfolio/usePortfolio';
import { QUIET } from '../portfolio/styles';
import { Sheet } from './Sheet';

type Load = { key: string; items: StoryItem[] } | { key: string; error: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function Message({ item, current }: { item: StoryItem; current: boolean }) {
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
      <p className="mt-1 text-[11px] text-ink-muted">{[item.account?.name ?? 'Organization', source ? `via ${source}` : null].filter(Boolean).join(' · ')}</p>
    </li>
  );
}

/** One email's thread (spec §1.6). The backend has no thread endpoint: the
 *  story read with `thread` returns that thread's emails, across the
 *  organization and its accounts, each under its own visibility rule. Each
 *  message shows its sender, time and the story's one-line summary; the full
 *  message and replying stay in Communications. */
export function EmailThread({
  orgId,
  threadId,
  openedId,
  title,
  isSm,
  onClose,
}: {
  orgId: number;
  threadId: string;
  /** The email that was opened; it is marked current in the thread. */
  openedId: number;
  title: string;
  isSm: boolean;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = `${orgId}#${threadId}#${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchThread(orgId, threadId).then(
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
  }, [key, orgId, threadId]);

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/EmailThread.test.tsx src/components/organizations/detail/houseRules.test.ts`
Expected: PASS (4 tests, and the house rules).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/EmailThread.tsx src/components/organizations/detail/EmailThread.test.tsx
git commit -m "feat(organizations): open a story email as its real thread

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12: Lift the four create forms out of their tabs (and move the survey tests)

**Files:**
- Modify: `src/components/organizations/activity/TasksTab.tsx` (the `NewTaskForm` function)
- Modify: `src/components/organizations/activity/NotesTab.tsx` (the `NewNoteForm` function)
- Modify: `src/components/organizations/activity/CallSenseTab.tsx` (the `LogCallForm` function)
- Modify: `src/components/organizations/activity/SurveysTab.tsx` (imports, state, `handleLogSurvey`, the log form block; new `LogSurveyForm`)
- Create: `src/pages/organizations/testDetail.tsx`
- Create (moved tests): `src/components/organizations/activity/SurveysTab.test.tsx`

**Interfaces:**
- Consumes: the slices' `createSurveyForCustomer`, `createSurveyForAccount`, `fetchSurveysForCustomer`; `useMembers`; `LogCallInput` (`callsSlice.ts`); `Contact`.
- Produces:
  - `TaskForm({onCreate: (task: NewTask) => Promise<boolean>; onDone?: () => void})` (exported from `TasksTab.tsx`).
  - `NoteForm({onCreate: (note: {title: string; body: string}) => Promise<boolean>; onDone?: () => void})` (exported from `NotesTab.tsx`).
  - `CallForm({onLog: (input: LogCallInput) => Promise<boolean>; saving: boolean; error: string | null; contacts: Contact[]; onDone?: () => void})` (exported from `CallSenseTab.tsx`).
  - `interface LogSurveyFormProps {customerId: number; accountId?: number; allowCes: boolean; onLogged: () => void | Promise<void>; onCancel: () => void}` and `LogSurveyForm(props)` (exported from `SurveysTab.tsx`).
  - Each form clears itself and calls `onDone`/`onLogged` after a successful save. Labels and buttons are unchanged ("Task title", "Save task", "Note title", "Save note", "Call title", "Log call", "Type", "Sent", "Log").
  - `makeDetailStore()` (`testDetail.tsx`): a store with the real `customers`, `auth` (Alice, admin, every capability), `notifications`, `knowledge`, `files` and `calls` slices.

`Details.test.tsx` stays untouched until Task 16: this task and Task 15 copy tests out of it by line number. Check that first:

- [ ] **Step 1: Check the source of the moved tests**

Run:
```bash
git diff --quiet HEAD -- src/pages/organizations/Details.test.tsx && echo unchanged
sed -n '15p;71p;363p;585p' src/pages/organizations/Details.test.tsx
```
Expected:
```
unchanged
const globex = {
};
  it('fetches this organization\'s own real surveys on the General tab, under the Surveys filter', async () => {
  });
```

- [ ] **Step 2: Create the test store helper**

`src/pages/organizations/testDetail.tsx`:
```tsx
// Test-only helpers for the organization page. Task 16 adds renderOrganizationPage.
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../features/auth/authSlice';
import callsReducer from '../../features/calls/callsSlice';
import customersReducer from '../../features/customers/customersSlice';
import filesReducer from '../../features/files/filesSlice';
import knowledgeReducer from '../../features/knowledge/knowledgeSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { ALL_CAPABILITIES } from '../../test/capabilities';

/** The real slices the organization page and its tabs dispatch into. Only
 *  fetch is stubbed, by the caller (stubOrganizationPage, or a test's own). */
export function makeDetailStore() {
  return configureStore({
    reducer: {
      customers: customersReducer,
      auth: authReducer,
      notifications: notificationsReducer,
      knowledge: knowledgeReducer,
      files: filesReducer,
      calls: callsReducer,
    },
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
```

- [ ] **Step 3: Move the survey tests (they stay red until the form exists)**

Run:
```bash
OLD=src/pages/organizations/Details.test.tsx
NEW=src/components/organizations/activity/SurveysTab.test.tsx
{
  cat <<'EOF'
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchSurveysForCustomer } from '../../../features/customers/customersSlice';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { LogSurveyForm, SurveysTab } from './SurveysTab';

// These tests lived in the old organization page's test, under its Surveys
// feed filter. The organization page no longer has that filter, but
// SurveysTab still serves the account page's feed, so they render it
// directly, fed the way ActivityFeed feeds it.
function SurveysHarness() {
  const dispatch = useAppDispatch();
  const { entitySurveys, entitySurveysLoading, entitySurveysError } = useAppSelector((state) => state.customers);
  useEffect(() => {
    dispatch(fetchSurveysForCustomer(10));
  }, [dispatch]);
  return (
    <SurveysTab
      surveys={entitySurveys}
      isLoading={entitySurveysLoading}
      error={entitySurveysError}
      entityType="organization"
      entityId={10}
    />
  );
}

function renderSurveys() {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <SurveysHarness />
      </MemoryRouter>
    </Provider>,
  );
}

EOF
  sed -n '12,71p' "$OLD"
  cat <<'EOF'

describe('SurveysTab on an organization (moved from the old organization page)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

EOF
  sed -n '363,585p' "$OLD"
  cat <<'EOF'
});

describe('LogSurveyForm (the "Log survey" flow the organization page reuses)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs on an account, without CES, and hands back', async () => {
    const fetchMock = vi.fn((_url: string, options?: { method?: string; body?: string }) =>
      Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 1, ...JSON.parse(options?.body ?? '{}') }) }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onLogged = vi.fn();
    render(
      <Provider store={makeDetailStore()}>
        <LogSurveyForm customerId={7} accountId={31} allowCes={false} onLogged={onLogged} onCancel={() => {}} />
      </Provider>,
    );
    expect(screen.queryByRole('option', { name: 'CES' })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'csat');
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    await waitFor(() => expect(onLogged).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/customers/7/accounts/31/surveys/');
    expect(JSON.parse(String(init?.body))).toMatchObject({ survey_type: 'csat' });
  });

  it('shows why a log failed and stays open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 400, json: async () => ({ detail: 'Pick a date.' }) })),
    );
    const onLogged = vi.fn();
    render(
      <Provider store={makeDetailStore()}>
        <LogSurveyForm customerId={7} allowCes onLogged={onLogged} onCancel={() => {}} />
      </Provider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(await screen.findByText('Pick a date.')).toBeInTheDocument();
    expect(onLogged).not.toHaveBeenCalled();
  });
});
EOF
} > "$NEW"
perl -0pi -e 's/renderDetails\(\x2710\x27\);/renderSurveys();/g; s/\n[ \t]*await user\.click\(await screen\.findByRole\(\x27button\x27, \{ name: \x27Surveys\x27 \}\)\);//g' "$NEW"
grep -c "renderDetails\|name: 'Surveys' }" "$NEW"
```
Expected: the last command prints `0`.

In `SurveysTab.test.tsx`, the first moved test no longer uses its `user`. Replace:
```tsx
    renderSurveys();
    const user = userEvent.setup();

    // 'NPS' alone is ambiguous
```
with:
```tsx
    renderSurveys();

    // 'NPS' alone is ambiguous
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/components/organizations/activity/SurveysTab.test.tsx`
Expected: FAIL: "LogSurveyForm" is not exported (`does not provide an export named 'LogSurveyForm'`).

- [ ] **Step 5: Lift the forms out**

In `src/components/organizations/activity/TasksTab.tsx`, replace the whole `function NewTaskForm(…) { … }` (from `function NewTaskForm({ onCreate }` to the `}` before `export function TasksTab`) with:
```tsx
/** The new-task form on its own, so the organization page's "+ Add" can show
 *  it in a sheet. It clears itself and calls `onDone` once the task is saved. */
export function TaskForm({ onCreate, onDone }: { onCreate: (task: NewTask) => Promise<boolean>; onDone?: () => void }) {
  const members = useMembers();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    setSaving(true);
    const ok = await onCreate({ title: title.trim(), due_date: dueDate, priority, assignee_id: assignee ? Number(assignee) : null });
    setSaving(false);
    if (ok) {
      setTitle('');
      setDueDate('');
      setAssignee('');
      onDone?.();
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-2">
      <input aria-label="Task title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" className="md:col-span-2 px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
      <input aria-label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
      <select aria-label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])} className="px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent">
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <select aria-label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="md:col-span-3 px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent">
        <option value="">Assign to me</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <button type="submit" disabled={saving} className="px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[12px] font-bold disabled:opacity-50">
        {saving ? 'Saving…' : 'Save task'}
      </button>
    </form>
  );
}

function NewTaskForm({ onCreate }: { onCreate: (task: NewTask) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-6 py-2 border-b border-line-subtle flex flex-col gap-2 bg-surface">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-ink-faint">A task is seen by its creator, its assignee and their management chains.</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[12px] font-bold">
          {open ? 'Cancel' : 'New task'}
        </button>
      </div>
      {open && <TaskForm onCreate={onCreate} onDone={() => setOpen(false)} />}
    </div>
  );
}
```

In `src/components/organizations/activity/NotesTab.tsx`, replace the whole `function NewNoteForm(…) { … }` (up to the `}` before `export function NotesTab`) with:
```tsx
/** The new-note form on its own, so the organization page's "+ Add" can show
 *  it in a sheet. It clears itself and calls `onDone` once the note is saved. */
export function NoteForm({
  onCreate,
  onDone,
}: {
  onCreate: (note: { title: string; body: string }) => Promise<boolean>;
  onDone?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    const ok = await onCreate({ title: title.trim(), body: body.trim() });
    setSaving(false);
    if (ok) {
      setTitle('');
      setBody('');
      onDone?.();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input aria-label="Note title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
      <textarea aria-label="Note body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What do you want the team above you to know?" rows={4} className="px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent resize-y" />
      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[12px] font-bold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </form>
  );
}

function NewNoteForm({ onCreate }: { onCreate: (note: { title: string; body: string }) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-6 py-2 border-b border-line-subtle flex flex-col gap-2 bg-surface">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-ink-faint">Notes you write here are seen by you and your management chain only.</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[12px] font-bold">
          {open ? 'Cancel' : 'New note'}
        </button>
      </div>
      {open && <NoteForm onCreate={onCreate} onDone={() => setOpen(false)} />}
    </div>
  );
}
```

In `src/components/organizations/activity/CallSenseTab.tsx`, replace the whole `function LogCallForm(…) { … }` (up to the `}` before `function CallCard`) with:
```tsx
/** The log-a-call form on its own, so the organization page's "+ Add" can
 *  show it in a sheet. It clears itself and calls `onDone` once logged. */
export function CallForm({
  onLog,
  saving,
  error,
  contacts,
  onDone,
}: {
  onLog: (input: LogCallInput) => Promise<boolean>;
  saving: boolean;
  error: string | null;
  /** This company's contacts, offered as participants. */
  contacts: Contact[];
  onDone?: () => void;
}) {
  const [participants, setParticipants] = useState<number[]>([]);
  const [title, setTitle] = useState('');
  const [host, setHost] = useState('');
  const [when, setWhen] = useState('');
  const [duration, setDuration] = useState('');
  const [summary, setSummary] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !when) return;
    const file = fileInput.current?.files?.[0] ?? null;
    const ok = await onLog({
      title: title.trim(),
      host_name: host.trim() || undefined,
      occurred_at: new Date(when).toISOString(),
      duration_minutes: duration ? Number(duration) : null,
      summary: summary.trim() || undefined,
      recording_url: recordingUrl.trim() || undefined,
      transcript_text: transcriptText.trim() || undefined,
      transcriptFile: file,
      participant_ids: participants.length ? participants : undefined,
    });
    if (ok) {
      setTitle(''); setHost(''); setWhen(''); setDuration(''); setSummary(''); setTranscriptText(''); setRecordingUrl(''); setParticipants([]);
      if (fileInput.current) fileInput.current.value = '';
      onDone?.();
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-4 gap-2" aria-label="Log a call">
      <input aria-label="Call title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Renewal readiness check-in" className="md:col-span-2 px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
      <input aria-label="Host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host (you, by default)" className="px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
      <input aria-label="When" required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
      <input aria-label="Duration in minutes" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Minutes" className="px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
      <input aria-label="Recording link" value={recordingUrl} onChange={(e) => setRecordingUrl(e.target.value)} placeholder="Recording link (optional)" className="md:col-span-3 px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent" />
      <textarea aria-label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary — leave blank to have it written from the transcript" rows={3} className="md:col-span-2 px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent resize-y" />
      <textarea aria-label="Transcript" value={transcriptText} onChange={(e) => setTranscriptText(e.target.value)} placeholder="Paste the transcript…" rows={3} className="md:col-span-2 px-3 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent resize-y" />
      <label className="md:col-span-3 flex items-center gap-2 text-[12px] text-ink-muted">
        <Mic className="w-3.5 h-3.5" /> or upload the transcript file
        <input ref={fileInput} type="file" accept=".txt,.vtt,.srt,.md" aria-label="Transcript file" className="text-[12px]" />
      </label>
      {contacts.length > 0 && (
        <fieldset className="md:col-span-4 flex items-center gap-2 flex-wrap text-[12px] text-ink-muted" aria-label="Who was on the call">
          <legend className="sr-only">Who was on the call</legend>
          <Users className="w-3.5 h-3.5" /> Who was on it (their sentiment is read from this call):
          {contacts.map((c) => {
            const on = participants.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setParticipants((p) => (on ? p.filter((id) => id !== c.id) : [...p, c.id]))}
                className={`px-2 py-0.5 rounded-full border text-[11.5px] font-semibold ${on ? 'bg-accent-dim border-accent/40 text-accent' : 'bg-surface border-line text-ink-muted hover:border-line-strong'}`}
              >
                {c.name}
              </button>
            );
          })}
          <span className="text-ink-faint">Anyone the transcript names is added too.</span>
        </fieldset>
      )}
      <button type="submit" disabled={saving} className="px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[12.5px] font-bold disabled:opacity-50">
        {saving ? 'Logging…' : 'Log call'}
      </button>
      {error && <div className="md:col-span-4 text-[12px] text-danger font-semibold" role="alert">{error}</div>}
    </form>
  );
}

function LogCallForm({
  onLog,
  saving,
  error,
  contacts,
}: {
  onLog: (input: LogCallInput) => Promise<boolean>;
  saving: boolean;
  error: string | null;
  contacts: Contact[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-6 py-3 border-b border-line-subtle flex flex-col gap-2 bg-surface shrink-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-ink-faint">Log a call with its summary, or hand over the transcript and the summary is written for you. Every call is read for sentiment and counts toward the pulse.</span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-on-accent rounded-lg text-[12px] font-bold shrink-0">
          <Plus className="w-3.5 h-3.5" /> {open ? 'Cancel' : 'Log a call'}
        </button>
      </div>
      {open && <CallForm onLog={onLog} saving={saving} error={error} contacts={contacts} onDone={() => setOpen(false)} />}
    </div>
  );
}
```

In `src/components/organizations/activity/SurveysTab.tsx`:

1. Replace `import { useState } from 'react';` with `import { useId, useState } from 'react';`.
2. Delete these four lines from `SurveysTab`'s state:
```tsx
  const [newType, setNewType] = useState<Survey['survey_type']>('nps');
  const [newSentAt, setNewSentAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
```
3. Delete the whole `async function handleLogSurvey() { … }` (from `async function handleLogSurvey() {` to its closing `}` after the `finally` block).
4. Replace the log form block (from `{showLogForm && (` through `{logError && <p className="text-[12.5px] text-danger">{logError}</p>}`) with:
```tsx
      {showLogForm && canLog && (
        <LogSurveyForm
          customerId={entityType === 'organization' ? Number(entityId) : (customerId as number)}
          accountId={entityType === 'account' ? Number(entityId) : undefined}
          allowCes={entityType === 'organization'}
          onLogged={async () => {
            await refetch();
            setShowLogForm(false);
          }}
          onCancel={() => setShowLogForm(false)}
        />
      )}
```
5. Add, directly above `export function SurveysTab(`:
```tsx
export interface LogSurveyFormProps {
  customerId: number;
  /** Set to log it on one of the organization's accounts. */
  accountId?: number;
  /** CES is asked of an organization only. */
  allowCes: boolean;
  onLogged: () => void | Promise<void>;
  onCancel: () => void;
}

/** "Log Survey" on its own: records that a survey was sent (no email goes
 *  out). SurveysTab shows it inline; the organization page's "+ Add" shows it
 *  in a sheet. */
export function LogSurveyForm({ customerId, accountId, allowCes, onLogged, onCancel }: LogSurveyFormProps) {
  const dispatch = useAppDispatch();
  const typeId = useId();
  const sentId = useId();
  const [newType, setNewType] = useState<Survey['survey_type']>('nps');
  const [newSentAt, setNewSentAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  async function handleLogSurvey() {
    setLogError(null);
    setIsLogging(true);
    try {
      if (accountId === undefined) {
        await dispatch(createSurveyForCustomer({ customerId, survey_type: newType, sent_at: newSentAt })).unwrap();
      } else {
        await dispatch(createSurveyForAccount({ customerId, accountId, survey_type: newType, sent_at: newSentAt })).unwrap();
      }
      setIsLogging(false);
      await onLogged();
    } catch (err) {
      setLogError(typeof err === 'string' ? err : err instanceof ApiError ? err.message : 'Could not log that survey.');
      setIsLogging(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2 p-3 bg-surface rounded-xl border border-line-subtle shadow-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor={typeId} className="text-[11px] font-bold text-ink-faint uppercase tracking-wide">Type</label>
          <select
            id={typeId}
            value={newType}
            onChange={(e) => setNewType(e.target.value as Survey['survey_type'])}
            className="px-2.5 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent"
          >
            <option value="nps">NPS</option>
            <option value="csat">CSAT</option>
            {allowCes && <option value="ces">CES</option>}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={sentId} className="text-[11px] font-bold text-ink-faint uppercase tracking-wide">Sent</label>
          <input
            id={sentId}
            type="date"
            value={newSentAt}
            onChange={(e) => setNewSentAt(e.target.value)}
            className="px-2.5 py-1.5 bg-surface border border-line rounded-lg text-[13px] text-ink focus:outline-none focus:border-accent"
          />
        </div>
        <button
          type="button"
          onClick={handleLogSurvey}
          disabled={isLogging}
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-on-accent rounded-lg text-[12px] font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLogging ? 'Logging…' : 'Log'}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 text-[12px] font-semibold text-ink-muted hover:text-ink">
          Cancel
        </button>
      </div>
      {logError && <p className="text-[12.5px] text-danger">{logError}</p>}
    </div>
  );
}
```

- [ ] **Step 6: Run the tab tests to verify they pass and nothing else moved**

Run: `npx vitest run src/components/organizations/activity src/pages/organizations/Details.test.tsx src/pages/accounts/Details.test.tsx`
Expected: PASS. The moved survey tests and the two `LogSurveyForm` tests pass; `TasksTab.test`, `NotesTab.test` and `CallSenseTab.test` pass unchanged; the old `Details.test.tsx` still passes (its page still renders these tabs).

- [ ] **Step 7: Commit**

```bash
git add src/components/organizations/activity/TasksTab.tsx src/components/organizations/activity/NotesTab.tsx src/components/organizations/activity/CallSenseTab.tsx src/components/organizations/activity/SurveysTab.tsx src/components/organizations/activity/SurveysTab.test.tsx src/pages/organizations/testDetail.tsx
git commit -m "refactor(organizations): lift the task, note, call and survey forms out of their tabs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: "+ Add" in a sheet: `AddFlow`

**Files:**
- Create: `src/components/organizations/detail/AddFlow.tsx`
- Test: `src/components/organizations/detail/AddFlow.test.tsx`

**Interfaces:**
- Consumes: `TaskForm`, `NoteForm`, `CallForm`, `LogSurveyForm` (Task 12); `createTask`, `createNote` (`customersSlice.ts`); `logCall` (`callsSlice.ts`); `FileParent`; `Sheet` (Task 3); `ADD_FLOWS`, `AddKind` (Task 1); `makeDetailStore` (Task 12); `stubOrganizationPage`, `postBodies` (Task 1).
- Produces: `AddFlow({what: AddKind; customerId: number; accountId?: number; accountName?: string; isSm: boolean; onAdded: () => void; onClose: () => void})`: a `Sheet` titled with the flow's label ("New task") and described "On EMEA" or "On the organization". It saves on the account when `accountId` is set.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/AddFlow.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { AddKind } from '../../../features/organizations/storyKinds';
import { postBodies, stubOrganizationPage } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { AddFlow } from './AddFlow';

function renderAdd(what: AddKind, accountId?: number) {
  const onAdded = vi.fn();
  const onClose = vi.fn();
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <AddFlow
          what={what}
          customerId={7}
          accountId={accountId}
          accountName={accountId ? 'EMEA' : undefined}
          isSm
          onAdded={onAdded}
          onClose={onClose}
        />
      </MemoryRouter>
    </Provider>,
  );
  return { onAdded, onClose };
}

describe('AddFlow (spec §1.6 "+ Add")', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('creates a task on the organization with the existing form', async () => {
    const spy = stubOrganizationPage();
    const { onAdded } = renderAdd('task');
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    expect(dialog).toHaveAccessibleDescription('On the organization');
    const title = within(dialog).getByRole('textbox', { name: 'Task title' });
    expect(title).toHaveFocus();
    await userEvent.type(title, 'Book the retraining');
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/customers/7/tasks/')).toEqual([
      { title: 'Book the retraining', due_date: '2026-10-01', priority: 'medium', assignee_id: null },
    ]);
  });

  it('creates a note on the chosen account', async () => {
    const spy = stubOrganizationPage();
    const { onAdded } = renderAdd('note', 31);
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    expect(dialog).toHaveAccessibleDescription('On EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note title' }), 'Kickoff');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note body' }), 'Met the new admin.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/customers/7/accounts/31/notes/')).toEqual([{ title: 'Kickoff', body: 'Met the new admin.' }]);
  });

  it('logs a call with the CallSense form', async () => {
    const spy = stubOrganizationPage();
    const { onAdded } = renderAdd('call');
    const dialog = screen.getByRole('dialog', { name: 'Log a call' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Call title' }), 'Renewal check-in');
    fireEvent.change(within(dialog).getByLabelText('When'), { target: { value: '2026-09-25T10:00' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log call' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/customers/7/calls/')[0]).toMatchObject({ title: 'Renewal check-in' });
  });

  it('logs a survey, and its own Cancel closes the sheet', async () => {
    const spy = stubOrganizationPage();
    const { onAdded, onClose } = renderAdd('survey');
    const dialog = screen.getByRole('dialog', { name: 'Log survey' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(postBodies(spy, '/customers/7/surveys/')[0]).toMatchObject({ survey_type: 'nps' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes from Close without saving', async () => {
    const spy = stubOrganizationPage();
    const { onAdded, onClose } = renderAdd('task');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onAdded).not.toHaveBeenCalled();
    expect(postBodies(spy, '/customers/7/tasks/')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/organizations/detail/AddFlow.test.tsx`
Expected: FAIL with "Failed to resolve import './AddFlow'".

- [ ] **Step 3: Implement**

`src/components/organizations/detail/AddFlow.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { apiFetch } from '../../../lib/apiClient';
import { logCall, type LogCallInput } from '../../../features/calls/callsSlice';
import { createNote, createTask, type Contact } from '../../../features/customers/customersSlice';
import type { FileParent } from '../../../features/files/filesSlice';
import { ADD_FLOWS, type AddKind } from '../../../features/organizations/storyKinds';
import { CallForm } from '../activity/CallSenseTab';
import { NoteForm } from '../activity/NotesTab';
import { LogSurveyForm } from '../activity/SurveysTab';
import { TaskForm } from '../activity/TasksTab';
import { Sheet } from './Sheet';

/** "+ Add" (spec §1.6): one of the existing create flows in a sheet, saved on
 *  the organization, or on the chosen account when an account chip is on. */
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
  customerId: number;
  accountId?: number;
  accountName?: string;
  isSm: boolean;
  onAdded: () => void;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { saving, saveError } = useAppSelector((state) => state.calls);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const parent: FileParent = accountId ? { entityType: 'account', customerId, accountId } : { entityType: 'organization', customerId };

  // A call offers the company's contacts as participants, as CallSense does.
  useEffect(() => {
    if (what !== 'call') return;
    let cancelled = false;
    const path = accountId ? `/customers/${customerId}/accounts/${accountId}/contacts/` : `/customers/${customerId}/contacts/`;
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/AddFlow.test.tsx src/components/organizations/detail/houseRules.test.ts`
Expected: PASS (5 tests, and the house rules).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/AddFlow.tsx src/components/organizations/detail/AddFlow.test.tsx
git commit -m "feat(organizations): + Add on the story reuses the existing create forms in a sheet

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The Story tab

**Files:**
- Create: `src/components/organizations/detail/StoryTab.tsx`
- Test: `src/components/organizations/detail/StoryTab.test.tsx`

**Interfaces:**
- Consumes: `AttentionBlock` (Task 8), `StoryToolbar` (Task 9), `StoryStream` (Task 10), `EmailThread` (Task 11), `AddFlow` (Task 13), `StoryState` (Task 4), `DetailParams`, `DetailTab`, `hasStoryFilters`, `parseDetailParams` (Task 2), `Account`, `PanelKey`.
- Produces: `StoryTab({orgId: number; story: StoryState; params: DetailParams; accounts: Account[]; isSm: boolean; onUpdate: (patch: Partial<DetailParams>, options?: {replace?: boolean}) => void; onAdded: () => void; onOpenTab: (tab: DetailTab) => void; onJump: (panel: PanelKey) => void})`. Search writes `q` with `replace`; Clear filters clears `account`, `group`, `sources` and `q`; a save closes the sheet, calls `onAdded` and says "Added to the story." politely.

- [ ] **Step 1: Write the failing test**

`src/components/organizations/detail/StoryTab.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { parseDetailParams } from '../../../features/organizations/detailParams';
import type { StoryResponse } from '../../../features/organizations/storyTypes';
import {
  ACCOUNTS,
  PIZZA_ATTENTION,
  STORY_ITEMS,
  postBodies,
  storyQueries,
  stubOrganizationPage,
} from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { StoryTab } from './StoryTab';
import type { StoryState } from './useStory';

const DATA: StoryResponse = {
  items: STORY_ITEMS,
  next_cursor: null,
  counts: {
    by_group: { all: 5, conversations: 2, tickets: 1, tasks: 1, feedback: 0, health: 1 },
    by_kind: { activity: 0, calendar_event: 0, call: 1, email: 1, health: 1, note: 0, survey: 0, task: 1, ticket: 1 },
    by_account: { all: 5, none: 3, '31': 1, '32': 1 },
  },
  attention: PIZZA_ATTENTION,
};

function story(partial: Partial<StoryState> = {}): StoryState {
  return {
    data: DATA,
    items: STORY_ITEMS,
    next: null,
    loading: false,
    error: null,
    loadingMore: false,
    moreError: null,
    loadMore: vi.fn(async () => {}),
    retry: vi.fn(),
    ...partial,
  };
}

function renderTab(state: StoryState = story(), search = '') {
  const handlers = { onUpdate: vi.fn(), onAdded: vi.fn(), onOpenTab: vi.fn(), onJump: vi.fn() };
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <StoryTab
          orgId={7}
          story={state}
          params={parseDetailParams(new URLSearchParams(search))}
          accounts={ACCOUNTS}
          isSm
          {...handlers}
        />
      </MemoryRouter>
    </Provider>,
  );
  return handlers;
}

describe('StoryTab (spec §1.6)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  it('shows Needs attention, the toolbar and the stream, and wires each to the URL', async () => {
    stubOrganizationPage();
    const { onUpdate, onOpenTab, onJump } = renderTab();
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-story-item]')).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: /^1 overdue task/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Tickets 1' }));
    await userEvent.click(screen.getByRole('button', { name: '3 unanswered questions' }));
    await userEvent.click(screen.getByRole('button', { name: /^Renewal 47d overdue/ }));
    expect(onUpdate.mock.calls.map(([patch]) => patch)).toEqual([{ group: 'tasks' }, { group: 'tickets' }]);
    expect(onOpenTab).toHaveBeenCalledWith('knowledge');
    expect(onJump).toHaveBeenCalledWith('contract');
  });

  it('writes the search with replace', async () => {
    stubOrganizationPage();
    const { onUpdate } = renderTab();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the story' }), 'quote{Enter}');
    expect(onUpdate).toHaveBeenCalledWith({ q: 'quote' }, { replace: true });
  });

  it('Clear filters clears the account, the filter, the sources and the search', async () => {
    stubOrganizationPage();
    const { onUpdate } = renderTab(story({ items: [] }), 'account=31&group=tasks&q=zzz');
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onUpdate).toHaveBeenCalledWith({ account: '', group: '', sources: [], q: '' });
  });

  it('adds on the chosen account, closes the sheet, and says so', async () => {
    const spy = stubOrganizationPage();
    const { onAdded } = renderTab(story(), 'account=31');
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New note' }));
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    expect(dialog).toHaveAccessibleDescription('On EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note title' }), 'Kickoff');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Note body' }), 'Met the new admin.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onAdded).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Added to the story.');
    expect(postBodies(spy, '/customers/7/accounts/31/notes/')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add to the story' })).toHaveFocus();
  });

  it('opens an email as its thread, read with ?thread= whatever account is chosen', async () => {
    const spy = stubOrganizationPage();
    renderTab(story(), 'account=31');
    await userEvent.click(screen.getByRole('button', { name: 'Re: Renewal pricing' }));
    const dialog = screen.getByRole('dialog', { name: 'Re: Renewal pricing' });
    expect(await within(dialog).findAllByRole('listitem')).toHaveLength(2);
    expect(Object.fromEntries(storyQueries(spy)[0])).toEqual({ thread: 't-1', limit: '100' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Re: Renewal pricing' })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/organizations/detail/StoryTab.test.tsx`
Expected: FAIL with "Failed to resolve import './StoryTab'".

- [ ] **Step 3: Implement**

`src/components/organizations/detail/StoryTab.tsx`:
```tsx
import { useCallback, useState } from 'react';
import type { Account } from '../../../features/customers/customersSlice';
import { hasStoryFilters, type DetailParams, type DetailTab } from '../../../features/organizations/detailParams';
import type { PanelKey } from '../../../features/organizations/portfolioFields';
import type { AddKind } from '../../../features/organizations/storyKinds';
import type { StoryItem } from '../../../features/organizations/storyTypes';
import { AddFlow } from './AddFlow';
import { AttentionBlock } from './AttentionBlock';
import { EmailThread } from './EmailThread';
import { StoryStream } from './StoryStream';
import { StoryToolbar } from './StoryToolbar';
import type { StoryState } from './useStory';

/** The Story tab (spec §1.6): Needs attention, the toolbar, then the stream.
 *  Filters live in the URL (through `onUpdate`); "+ Add" and an opened email
 *  are sheets over the page. */
export function StoryTab({
  orgId,
  story,
  params,
  accounts,
  isSm,
  onUpdate,
  onAdded,
  onOpenTab,
  onJump,
}: {
  orgId: number;
  story: StoryState;
  params: DetailParams;
  accounts: Account[];
  isSm: boolean;
  onUpdate: (patch: Partial<DetailParams>, options?: { replace?: boolean }) => void;
  onAdded: () => void;
  onOpenTab: (tab: DetailTab) => void;
  onJump: (panel: PanelKey) => void;
}) {
  const [adding, setAdding] = useState<AddKind | null>(null);
  const [email, setEmail] = useState<StoryItem | null>(null);
  const [notice, setNotice] = useState('');
  const accountId = /^\d+$/.test(params.account) ? Number(params.account) : undefined;
  const accountName = accountId === undefined ? undefined : accounts.find((account) => account.id === accountId)?.name;
  const onSearch = useCallback((q: string) => onUpdate({ q }, { replace: true }), [onUpdate]);

  return (
    <div className="flex flex-col gap-3">
      {story.data ? (
        <AttentionBlock
          attention={story.data.attention}
          onFilter={(group) => onUpdate({ group })}
          onOpenTab={onOpenTab}
          onJump={onJump}
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
      <p role="status" className="sr-only">
        {notice}
      </p>
      <StoryStream
        story={story}
        filtered={hasStoryFilters(params)}
        onClearFilters={() => onUpdate({ account: '', group: '', sources: [], q: '' })}
        onOpenEmail={setEmail}
      />
      {adding ? (
        <AddFlow
          what={adding}
          customerId={orgId}
          accountId={accountId}
          accountName={accountName}
          isSm={isSm}
          onClose={() => setAdding(null)}
          onAdded={() => {
            setAdding(null);
            setNotice('Added to the story.');
            onAdded();
          }}
        />
      ) : null}
      {email?.link.thread_id ? (
        <EmailThread
          orgId={orgId}
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail/StoryTab.test.tsx src/components/organizations/detail/houseRules.test.ts`
Expected: PASS (5 tests, and the house rules).

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/StoryTab.tsx src/components/organizations/detail/StoryTab.test.tsx
git commit -m "feat(organizations): the Story tab composing attention, toolbar, stream and sheets

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Details, People, Deals & risks, Knowledge and Files (and the moved contacts and pipelines tests)

**Files:**
- Modify: `src/components/organizations/portfolio/rowParts.tsx` (`PulseDots`, shared with `PulsePair`)
- Create: `src/components/organizations/detail/AccountsSection.tsx`
- Create: `src/components/organizations/detail/CustomerFacts.tsx`
- Create: `src/components/organizations/detail/DetailsTab.tsx`
- Create: `src/components/organizations/detail/PeopleTab.tsx`
- Create: `src/components/organizations/detail/DealsTab.tsx`
- Create: `src/components/organizations/detail/KnowledgeTab.tsx`
- Create: `src/components/organizations/detail/FilesCallsTab.tsx`
- Test: `src/components/organizations/detail/AccountsSection.test.tsx`, `src/components/organizations/detail/CustomerFacts.test.tsx`, `src/components/organizations/detail/otherTabs.test.tsx`, `src/components/organizations/detail/fieldCoverage.test.tsx`
- Create (moved tests): `src/components/organizations/detail/PeopleTab.test.tsx`, `src/components/organizations/detail/DealsTab.test.tsx`

**Interfaces:**
- Consumes: `Account` (with `ai_pulse_value`, Task 1), `Customer`, `CsatBreakdown` (`customersSlice.ts`), `AI_PULSE_LABELS` (`formatters.ts`), `pulseWords` (`portfolioFields.ts`), `QUIET`, `FOCUS`, `ACCOUNTS`, `pizzaHutCustomer` (Task 1); `AccountDetails` (`portfolio/AccountDetails.tsx`, `stacked`, `onEdit`); `AIAttributesPanel`, `ContactsTab`, `PipelinesTab` (`components/shared`); `CompanyViewTab`; `HeadlinesTab`, `FilesTab`, `CallSenseTab` (`components/organizations/activity`); thunks `fetchContactsForCustomer`, `fetchOpportunitiesForCustomer`, `fetchRisksForCustomer`, `fetchHeadlinesForCustomer`, `regenerateHeadlines`; `OrganizationHeader` (Task 5), `HeaderTiles` (Task 6); `makeDetailStore` (Task 12).
- Produces:
  - `interface AccountsSectionProps {items: Account[]; loading: boolean; error: string | null; onRetry: () => void; onAdd: () => void; onEdit: (account: Account) => void}` and `AccountsSection(props)`: the owner's Accounts section (2026-09-26): a heading with Add account, then one list item per connected account (not a table) with its name linking to `/accounts/:id`, owner, domain, "AI n" with the AI label, the pulse dots, the AI reason, and Edit; designed loading, error and empty states.
  - `PulseDots({history: number[]; field?: string})` (`rowParts.tsx`): the stored pulse dots as one `role="img"` with "Pulse history: …"; `PulsePair` renders it with `field="pulse"`, `AccountsSection` without a field.
  - `CustomerFacts({customer: Customer | null; error: string | null; stacked: boolean; onRetry: () => void})`: `<section aria-label "Contact and CSAT">` with the email (a `mailto:` link), phone (a `tel:` link) and industry ("—" when blank), and the CSAT response bands from `csat_breakdown` (count and share per band, a bar at the share's width, "No CSAT survey has been answered yet." at zero); a skeleton while the record loads and the read error with Try again. None of these four is among the 34 table fields; Voice shows only the CSAT score.
  - `DetailsTab({row: PortfolioRow; customerId: number; isSm: boolean; accounts: AccountsSectionProps; customer: Customer | null; customerError: string | null; onRetryCustomer: () => void; onEdit?: () => void})`: the Accounts section, then the six panels (`stacked` below `sm`) with Edit details, then `CustomerFacts`, then AI attributes.
  - `PeopleTab({customerId: number})`, `DealsTab({customerId: number})`, `KnowledgeTab({customerId: number; customerName: string})`, `FilesCallsTab({customerId: number})`: today's content, each reading its data when first opened.

- [ ] **Step 1: Check the source of the moved tests**

Run:
```bash
git diff --quiet HEAD -- src/pages/organizations/Details.test.tsx && echo unchanged
sed -n '629p;886p;888p;955p;1002p;1285p' src/pages/organizations/Details.test.tsx
```
Expected:
```
unchanged
  it('fetches and renders this organization\'s own real contacts on the Contacts tab', async () => {
  });
  it('fetches and renders this organization\'s own real opportunities and risks on the Pipelines tab', async () => {
  });
  describe('Pipelines tab search/Add/Edit/Delete', () => {
  });
```

- [ ] **Step 2: Move the contacts and pipelines tests (red until the tabs exist)**

Run:
```bash
OLD=src/pages/organizations/Details.test.tsx
DIR=src/components/organizations/detail
{
  cat <<'EOF'
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { PeopleTab } from './PeopleTab';

// These tests lived in the old organization page's test, under its Contacts
// tab. People keeps that content in delivery 1 (spec §4), so they render
// PeopleTab directly; it reads the contacts itself when opened.
function renderPeople() {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <PeopleTab customerId={10} />
      </MemoryRouter>
    </Provider>,
  );
}

EOF
  sed -n '12,71p' "$OLD"
  cat <<'EOF'

describe('People tab (the Contacts tab inside the organization page)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

EOF
  sed -n '629,886p' "$OLD"
  printf '});\n'
} > "$DIR/PeopleTab.test.tsx"
{
  cat <<'EOF'
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { DealsTab } from './DealsTab';

// These tests lived in the old organization page's test, under its Pipelines
// tab. Deals & risks keeps that content in delivery 1 (spec §4), so they
// render DealsTab directly; it reads opportunities and risks when opened.
function renderDeals() {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <DealsTab customerId={10} />
      </MemoryRouter>
    </Provider>,
  );
}

EOF
  sed -n '12,71p' "$OLD"
  cat <<'EOF'

describe('Deals & risks tab (the Pipelines tab inside the organization page)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

EOF
  sed -n '888,955p' "$OLD"
  printf '\n'
  sed -n '1002,1285p' "$OLD"
  printf '});\n'
} > "$DIR/DealsTab.test.tsx"
perl -0pi -e 's/renderDetails\(\x2710\x27\);/renderPeople();/g; s/\n[ \t]*await user\.click\(await screen\.findByRole\(\x27button\x27, \{ name: \/\^Contacts\/ \}\)\);//g' "$DIR/PeopleTab.test.tsx"
perl -0pi -e 's/renderDetails\(\x2710\x27\);/renderDeals();/g; s/\n[ \t]*await user\.click\(await screen\.findByRole\(\x27button\x27, \{ name: \/\^Pipelines\/ \}\)\);//g' "$DIR/DealsTab.test.tsx"
grep -c "renderDetails\|name: /^Contacts/\|name: /^Pipelines/" "$DIR/PeopleTab.test.tsx" "$DIR/DealsTab.test.tsx"
```
Expected: the last command prints `…PeopleTab.test.tsx:0` and `…DealsTab.test.tsx:0`.

In `PeopleTab.test.tsx`, the first moved test no longer uses its `user`. Replace:
```tsx
    renderPeople();
    const user = userEvent.setup();

    expect(await screen.findByText('Sarah Chen')).toBeInTheDocument();
```
with:
```tsx
    renderPeople();

    expect(await screen.findByText('Sarah Chen')).toBeInTheDocument();
```

- [ ] **Step 3: Write the new failing tests**

The Accounts section reads only what `GET /customers/{id}/accounts/` serves (`AccountSerializer` in revenact-backend `services/customers/serializers.py`): `name`, `owner` (nested user), `domain`, `pulse` (the stored dots), `ai_pulse_score` (the category), `ai_pulse_value` (the number) and `ai_pulse_reason`. All seven exist, so nothing is dropped (Task 1 gave `Account` its `ai_pulse_value`).

`CustomerFacts` shows what `GET /customers/{id}/` adds to the List's row (spec §2) that no panel shows: email, phone, industry and the CSAT spread (`csat_breakdown`; the Voice panel has only the score). It sits under the six panels, in the same surface, divided like them.

`src/components/organizations/detail/CustomerFacts.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer } from '../../../features/customers/customersSlice';
import { pizzaHutCustomer } from '../../../features/organizations/testStory';
import { CustomerFacts } from './CustomerFacts';

const band = (key: string, label: string, count: number, share: number) => ({ key, label, count, share });

const FULL = {
  ...pizzaHutCustomer,
  email: 'ap@pizzahut.example',
  phone: '+1 972 555 0100',
  industry: 'Restaurants',
  csat_breakdown: {
    responses: 8,
    bands: [
      band('very_satisfied', 'Very Satisfied', 3, 37.5),
      band('satisfied', 'Satisfied', 3, 37.5),
      band('neutral', 'Neutral', 2, 25),
      band('dissatisfied', 'Dissatisfied', 0, 0),
      band('very_dissatisfied', 'Very Dissatisfied', 0, 0),
    ],
  },
} as Customer;

function renderFacts(props: Partial<ComponentProps<typeof CustomerFacts>> = {}) {
  const onRetry = vi.fn();
  render(<CustomerFacts customer={FULL} error={null} stacked={false} onRetry={onRetry} {...props} />);
  return onRetry;
}

const value = (term: string) => screen.getByText(term).nextElementSibling as HTMLElement;

describe('CustomerFacts (spec §2: what GET /customers/{id}/ adds)', () => {
  it('shows the email and phone as links, and the industry', () => {
    renderFacts();
    const section = screen.getByRole('region', { name: 'Contact and CSAT' });
    expect(within(section).getByRole('link', { name: 'ap@pizzahut.example' })).toHaveAttribute('href', 'mailto:ap@pizzahut.example');
    expect(within(section).getByRole('link', { name: '+1 972 555 0100' })).toHaveAttribute('href', 'tel:+19725550100');
    expect(value('Industry')).toHaveTextContent('Restaurants');
  });

  it('shows a blank field as "—" with no link', () => {
    renderFacts({ customer: pizzaHutCustomer });
    for (const term of ['Email', 'Phone', 'Industry']) expect(value(term)).toHaveTextContent('—');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('spreads the CSAT responses across their bands at their true share', () => {
    renderFacts();
    expect(screen.getByText('CSAT responses').closest('p')).toHaveTextContent('8 CSAT responses');
    const rows = within(screen.getByRole('list', { name: 'CSAT responses by band' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Very Satisfied3 · 37.5%',
      'Satisfied3 · 37.5%',
      'Neutral2 · 25%',
      'Dissatisfied0 · 0%',
      'Very Dissatisfied0 · 0%',
    ]);
    expect(rows[2].querySelector('[data-share]')).toHaveStyle({ width: '25%' });
  });

  it('says when no CSAT survey has been answered', () => {
    renderFacts({ customer: pizzaHutCustomer });
    expect(screen.getByText('No CSAT survey has been answered yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'CSAT responses by band' })).not.toBeInTheDocument();
  });

  it('shows a skeleton while the record loads', () => {
    renderFacts({ customer: null });
    expect(screen.getByRole('status', { name: 'Loading contact details and CSAT' })).toBeInTheDocument();
  });

  it('shows the read error with Try again', async () => {
    const onRetry = renderFacts({ customer: null, error: 'Try later.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Try later.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('puts the two halves side by side from md unless stacked', () => {
    renderFacts({ stacked: true });
    expect(screen.getByText('Email').closest('[data-facts]')).not.toHaveClass('md:grid-cols-2');
  });
});
```

`src/components/organizations/detail/AccountsSection.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ACCOUNTS } from '../../../features/organizations/testStory';
import { AccountsSection } from './AccountsSection';

function renderSection(props: Partial<ComponentProps<typeof AccountsSection>> = {}) {
  const handlers = { onRetry: vi.fn(), onAdd: vi.fn(), onEdit: vi.fn() };
  render(
    <MemoryRouter>
      <AccountsSection items={ACCOUNTS} loading={false} error={null} {...handlers} {...props} />
    </MemoryRouter>,
  );
  return handlers;
}

const item = (id: number) => document.querySelector(`[data-account="${id}"]`) as HTMLElement;

describe('AccountsSection (owner decision 2026-09-26: no account detail is lost)', () => {
  it('lists each connected account as an item, not a table, with what the accounts endpoint serves', () => {
    renderSection();
    const section = screen.getByRole('region', { name: 'Accounts' });
    expect(within(section).queryByRole('table')).not.toBeInTheDocument();
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    const emea = item(31);
    expect(within(emea).getByRole('link', { name: 'EMEA' })).toHaveAttribute('href', '/accounts/31');
    expect(within(emea).getByText('Carl CSM · emea.pizzahut.example')).toBeInTheDocument();
    expect(within(emea).getByText('AI 4')).toBeInTheDocument();
    expect(within(emea).getByText('Satisfied')).toBeInTheDocument();
    expect(within(emea).getByRole('img', { name: 'Pulse history: good, good, mixed' })).toBeInTheDocument();
    expect(within(emea).getByText('Usage is steady and the renewal talks are friendly.')).toBeInTheDocument();
    // North America has no owner, domain, score or pulse: it says so, and invents nothing.
    const na = item(32);
    expect(within(na).getByRole('link', { name: 'North America' })).toHaveAttribute('href', '/accounts/32');
    expect(within(na).getByText('No owner')).toBeInTheDocument();
    expect(within(na).getByText('AI —')).toBeInTheDocument();
    expect(within(na).queryByRole('img')).not.toBeInTheDocument();
  });

  it('adds an account, and edits each one', async () => {
    const { onAdd, onEdit } = renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(onAdd).toHaveBeenCalledOnce();
    await userEvent.click(within(item(32)).getByRole('button', { name: 'Edit North America' }));
    expect(onEdit).toHaveBeenCalledWith(ACCOUNTS[1]);
  });

  it('gives every control a 44px target below sm', () => {
    renderSection();
    for (const control of [...screen.getAllByRole('button'), ...screen.getAllByRole('link')]) {
      expect(control).toHaveClass('min-h-11');
    }
  });

  it('shows a skeleton while the accounts load', () => {
    renderSection({ items: [], loading: true });
    expect(screen.getByRole('status', { name: 'Loading accounts' })).toBeInTheDocument();
  });

  it('shows the error with Try again', async () => {
    const { onRetry } = renderSection({ items: [], error: 'Could not load accounts.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load accounts.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says when no account is connected yet, and still offers Add account', () => {
    renderSection({ items: [] });
    expect(screen.getByText('No accounts yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeInTheDocument();
  });
});
```

`src/components/organizations/detail/otherTabs.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { pizzaHut } from '../../../features/organizations/testPortfolio';
import { ACCOUNTS, pizzaHutCustomer, requestPaths, stubOrganizationPage } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { DetailsTab } from './DetailsTab';
import { FilesCallsTab } from './FilesCallsTab';
import { KnowledgeTab } from './KnowledgeTab';

const NO_ACCOUNTS = { items: [], loading: false, error: null, onRetry: () => {}, onAdd: () => {}, onEdit: () => {} };
const CUSTOMER = { customer: pizzaHutCustomer, customerError: null, onRetryCustomer: () => {} };

function renderWithStore(ui: ReactNode) {
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
}

describe('the other tabs in delivery 1', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Details shows the Accounts section, the List's six panels with Edit details, contact and CSAT, then the AI attributes", async () => {
    stubOrganizationPage();
    const onEdit = vi.fn();
    const onEditAccount = vi.fn();
    renderWithStore(
      <DetailsTab row={pizzaHut} customerId={7} isSm accounts={{ ...NO_ACCOUNTS, items: ACCOUNTS, onEdit: onEditAccount }} {...CUSTOMER} onEdit={onEdit} />,
    );
    expect(screen.getByRole('region', { name: 'Accounts' }).compareDocumentPosition(document.querySelector('[data-panel="commercial"]')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit EMEA' }));
    expect(onEditAccount).toHaveBeenCalledWith(ACCOUNTS[0]);
    for (const panel of ['commercial', 'contract', 'adoption', 'voice', 'profile', 'history']) {
      expect(document.querySelector(`[data-panel="${panel}"]`)).not.toBeNull();
    }
    expect(document.querySelector('[data-panel="commercial"]')!.parentElement).toHaveClass('md:grid-cols-2');
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(onEdit).toHaveBeenCalledOnce();
    const facts = screen.getByRole('region', { name: 'Contact and CSAT' });
    expect(document.querySelector('[data-panel="history"]')!.compareDocumentPosition(facts)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(facts.compareDocumentPosition(screen.getByRole('region', { name: 'AI attributes' }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('Details stacks the panels on phones', () => {
    stubOrganizationPage();
    renderWithStore(<DetailsTab row={pizzaHut} customerId={7} isSm={false} accounts={NO_ACCOUNTS} {...CUSTOMER} />);
    expect(document.querySelector('[data-panel="commercial"]')!.parentElement).not.toHaveClass('md:grid-cols-2');
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });

  it("Knowledge is today's Company View with the headlines below it", async () => {
    const spy = stubOrganizationPage();
    renderWithStore(<KnowledgeTab customerId={7} customerName="Pizza Hut" />);
    expect(screen.getByRole('region', { name: 'Headlines' })).toBeInTheDocument();
    await waitFor(() => expect(requestPaths(spy)).toContain('GET /customers/7/headlines/'));
    expect(requestPaths(spy)).toContain('GET /customers/7/brief/');
  });

  it('Files holds the files and the CallSense calls', async () => {
    const spy = stubOrganizationPage();
    renderWithStore(<FilesCallsTab customerId={7} />);
    expect(screen.getByRole('region', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Calls' })).toBeInTheDocument();
    await waitFor(() => expect(requestPaths(spy)).toEqual(expect.arrayContaining(['GET /customers/7/files/', 'GET /customers/7/calls/'])));
  });
});
```

`src/components/organizations/detail/fieldCoverage.test.tsx`:
```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ALL_COLUMNS } from '../tableData';
import { PANEL_ORDER, PORTFOLIO_FIELDS } from '../../../features/organizations/portfolioFields';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { initech, pizzaHut } from '../../../features/organizations/testPortfolio';
import { stubOrganizationPage } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { DetailsTab } from './DetailsTab';
import { HeaderTiles } from './HeaderTiles';
import { OrganizationHeader } from './OrganizationHeader';

// Spec §0: the page used to show fewer fields than the List. With the name
// row, the tiles and the Details tab it shows every one of the 34, once.
// The churned fixture is used because the churn fields show only when churned.
function renderPage(row: PortfolioRow) {
  stubOrganizationPage({ row });
  return render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>
        <section data-part="header">
          <OrganizationHeader row={row} canEdit onEdit={() => {}} onArchive={() => {}} onChurn={() => {}} />
          <HeaderTiles row={row} customer={null} customerError={null} isSm onJump={() => {}} />
        </section>
        <DetailsTab
          row={row}
          customerId={row.id}
          isSm
          accounts={{ items: [], loading: false, error: null, onRetry: () => {}, onAdd: () => {}, onEdit: () => {} }}
          customer={null}
          customerError={null}
          onRetryCustomer={() => {}}
          onEdit={() => {}}
        />
      </MemoryRouter>
    </Provider>,
  ).container;
}

describe('the organization page shows the 34 table fields', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('walks the whole list', () => {
    expect(ALL_COLUMNS).toHaveLength(34);
  });

  it.each(ALL_COLUMNS.map((column) => [column.id, column.label] as const))(
    '%s (%s) renders exactly once, in the header or its Details panel',
    (id) => {
      const container = renderPage(initech);
      const found = container.querySelectorAll(`[data-field="${id}"]`);
      expect(found).toHaveLength(1);
      const said = found[0].textContent?.trim() || found[0].getAttribute('aria-label')?.trim();
      expect(said ?? '').not.toBe('');
      const place = PORTFOLIO_FIELDS[id].place;
      if (place === 'header') expect(found[0].closest('[data-part="header"]')).not.toBeNull();
      else expect(found[0].closest(`[data-panel="${place}"]`)).not.toBeNull();
    },
  );

  it('keeps each panel field in its own panel', () => {
    const container = renderPage(initech);
    for (const [panel, ids] of Object.entries(PANEL_ORDER)) {
      const section = container.querySelector(`[data-panel="${panel}"]`) as HTMLElement;
      for (const id of ids) expect(section.querySelector(`[data-field="${id}"]`)).not.toBeNull();
    }
  });

  it('an organization that has not churned shows the other 31', () => {
    const container = renderPage(pizzaHut);
    const shown = ALL_COLUMNS.filter((column) => container.querySelector(`[data-field="${column.id}"]`));
    expect(shown).toHaveLength(31);
    expect(shown.map((column) => column.id)).not.toContain('churnReason');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/components/organizations/detail/AccountsSection.test.tsx src/components/organizations/detail/CustomerFacts.test.tsx src/components/organizations/detail/otherTabs.test.tsx src/components/organizations/detail/fieldCoverage.test.tsx src/components/organizations/detail/PeopleTab.test.tsx src/components/organizations/detail/DealsTab.test.tsx`
Expected: FAIL with "Failed to resolve import './AccountsSection'" (and CustomerFacts, DetailsTab, PeopleTab, DealsTab, KnowledgeTab, FilesCallsTab).

- [ ] **Step 5: Implement the tabs**

In `src/components/organizations/portfolio/rowParts.tsx`, replace the dots inside `PulsePair`:
```tsx
        <span data-field="pulse" role="img" aria-label={`Pulse history: ${pulseWords(pulse.history)}`} className="flex gap-[3px]">
          {pulse.history.map((n, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${DOT[n] ?? DOT[0]}`} />
          ))}
        </span>
```
with:
```tsx
        <PulseDots history={pulse.history} field="pulse" />
```
and add, directly above `/** "AI n · CSM n", the stored pulse dots`:
```tsx
/** The stored pulse dots, oldest first, as one image described in words.
 *  `field` marks it for the field-coverage test where it is the row's Pulse
 *  column (the organization's), and is left off an account's dots. */
export function PulseDots({ history, field }: { history: number[]; field?: string }) {
  return (
    <span data-field={field} role="img" aria-label={`Pulse history: ${pulseWords(history)}`} className="flex gap-[3px]">
      {history.map((n, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${DOT[n] ?? DOT[0]}`} />
      ))}
    </span>
  );
}

```

`src/components/organizations/detail/AccountsSection.tsx`:
```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import type { Account } from '../../../features/customers/customersSlice';
import { AI_PULSE_LABELS } from '../../../features/customers/formatters';
import { PulseDots } from '../portfolio/rowParts';
import { FOCUS, QUIET } from '../portfolio/styles';

export interface AccountsSectionProps {
  /** `GET /customers/{id}/accounts/`, the same read as the chips. */
  items: Account[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAdd: () => void;
  onEdit: (account: Account) => void;
}

function AccountItem({ account, onEdit }: { account: Account; onEdit: (account: Account) => void }) {
  const ai = account.ai_pulse_value;
  return (
    <li data-account={account.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="min-w-0 flex-1">
        <Link
          to={`/accounts/${account.id}`}
          className={`inline-flex min-h-11 max-w-full items-center truncate rounded-sm text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}
        >
          {account.name}
        </Link>
        <p className="truncate text-[11px] text-ink-muted">{[account.owner?.name ?? 'No owner', account.domain || null].filter(Boolean).join(' · ')}</p>
        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
          <span className="font-mono-brand tabular-nums text-ink">AI {ai == null ? '—' : ai}</span>
          {account.ai_pulse_score ? <span>{AI_PULSE_LABELS[account.ai_pulse_score]}</span> : null}
          {account.pulse.length ? <PulseDots history={account.pulse} /> : null}
        </p>
        {account.ai_pulse_reason ? <p className="mt-1 line-clamp-2 text-[13px] text-ink-muted">{account.ai_pulse_reason}</p> : null}
      </div>
      <button type="button" aria-label={`Edit ${account.name}`} onClick={() => onEdit(account)} className={`${QUIET} self-start`}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
        Edit
      </button>
    </li>
  );
}

/** Accounts on the Details tab (the owner's decision, 2026-09-26: an
 *  account's details are not lost with the old Accounts tab). One list item
 *  per connected account with only what the accounts endpoint serves; the
 *  name opens `/accounts/:id`. Add and Edit are also on the Story tab's chip
 *  row. On phones the item's Edit wraps under its details. */
export function AccountsSection({ items, loading, error, onRetry, onAdd, onEdit }: AccountsSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-xl bg-surface">
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <h2 id={headingId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Accounts
        </h2>
        <button type="button" onClick={onAdd} className={QUIET}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add account
        </button>
      </div>
      {loading && items.length === 0 ? (
        <div role="status" aria-label="Loading accounts">
          <ul aria-hidden="true" className="divide-y divide-line-subtle">
            {[0, 1].map((i) => (
              <li key={i} className="flex flex-col gap-1.5 px-3 py-2.5">
                <span className="block h-3 w-40 animate-pulse rounded bg-subtle" />
                <span className="block h-2.5 w-56 animate-pulse rounded bg-subtle" />
                <span className="block h-2.5 w-full animate-pulse rounded bg-subtle" />
              </li>
            ))}
          </ul>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-2 px-3 pb-3">
          <p className="text-[13px] text-danger">{error}</p>
          <button type="button" onClick={onRetry} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : items.length ? (
        <ul className="divide-y divide-line-subtle">
          {items.map((account) => (
            <AccountItem key={account.id} account={account} onEdit={onEdit} />
          ))}
        </ul>
      ) : (
        <div className="px-3 pb-3">
          <p className="text-[13px] font-semibold text-ink">No accounts yet</p>
          <p className="text-[13px] text-ink-muted">Accounts connected to this organization appear here, each with its owner and pulse.</p>
        </div>
      )}
    </section>
  );
}
```

`src/components/organizations/detail/CustomerFacts.tsx`:
```tsx
import { useId, type ReactNode } from 'react';
import type { CsatBreakdown, Customer } from '../../../features/customers/customersSlice';
import { FOCUS, QUIET } from '../portfolio/styles';

/** Bands run best to worst; the tone follows the band, not the customer. */
const BAND_TONE: Record<string, string> = {
  very_satisfied: 'bg-success',
  satisfied: 'bg-success',
  neutral: 'bg-warning',
  dissatisfied: 'bg-danger',
  very_dissatisfied: 'bg-danger',
};

const LINK = `inline-flex min-h-11 max-w-full items-center truncate rounded-sm text-ink underline sm:min-h-0 ${FOCUS}`;

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{term}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </>
  );
}

function CsatSpread({ breakdown }: { breakdown: CsatBreakdown }) {
  const { responses, bands } = breakdown;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] text-ink">
        <span className="font-mono-brand tabular-nums">{responses}</span> <span>CSAT responses</span>
      </p>
      {responses === 0 ? (
        <p className="text-[13px] text-ink-muted">No CSAT survey has been answered yet.</p>
      ) : (
        <ul aria-label="CSAT responses by band" className="flex flex-col gap-1.5">
          {bands.map((band) => (
            <li key={band.key} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
              <span className="truncate text-ink-muted">{band.label}</span>
              <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-line">
                <span data-share="" className={`block h-full ${BAND_TONE[band.key] ?? 'bg-line-strong'}`} style={{ width: `${band.share}%` }} />
              </span>
              <span className="font-mono-brand tabular-nums text-ink">
                {band.count} · {band.share}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What GET /customers/{id}/ adds to the List's row (spec §2) that none of
 *  the six panels shows: how to reach the organization, its industry, and
 *  how its answered CSAT surveys spread (the Voice panel has the score
 *  only). Under the panels, divided like them, in the same surface. */
export function CustomerFacts({
  customer,
  error,
  stacked,
  onRetry,
}: {
  customer: Customer | null;
  error: string | null;
  /** One column at every width (phones). */
  stacked: boolean;
  onRetry: () => void;
}) {
  const headingId = useId();
  const phoneHref = customer?.phone ? `tel:${customer.phone.replace(/[^\d+]/g, '')}` : '';
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 border-t border-line-subtle px-3 pt-3 pb-4">
      <h3 id={headingId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        Contact and CSAT
      </h3>
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-[13px] text-danger">{error}</p>
          <button type="button" onClick={onRetry} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : !customer ? (
        <div role="status" aria-label="Loading contact details and CSAT" className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} aria-hidden="true" className="block h-3 w-full animate-pulse rounded bg-subtle" />
          ))}
        </div>
      ) : (
        <div data-facts="" className={`grid gap-x-8 gap-y-4 ${stacked ? '' : 'md:grid-cols-2'}`}>
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] content-start gap-x-3 gap-y-1.5 text-[13px]">
            <Fact term="Email">
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className={LINK}>
                  {customer.email}
                </a>
              ) : (
                '—'
              )}
            </Fact>
            <Fact term="Phone">
              {customer.phone ? (
                <a href={phoneHref} className={LINK}>
                  {customer.phone}
                </a>
              ) : (
                '—'
              )}
            </Fact>
            <Fact term="Industry">{customer.industry || '—'}</Fact>
          </dl>
          <CsatSpread breakdown={customer.csat_breakdown} />
        </div>
      )}
    </section>
  );
}
```

`src/components/organizations/detail/DetailsTab.tsx`:
```tsx
import type { Customer } from '../../../features/customers/customersSlice';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { AIAttributesPanel } from '../../shared/AIAttributesPanel';
import { AccountDetails } from '../portfolio/AccountDetails';
import { AccountsSection, type AccountsSectionProps } from './AccountsSection';
import { CustomerFacts } from './CustomerFacts';

/** Details (spec §1.7): the connected accounts (the owner's decision,
 *  2026-09-26), then the List's six panels with every field and Edit
 *  details, stacked on phones, then contact and CSAT from the customer
 *  record (spec §2), then the AI attributes that used to sit in the pinned
 *  panel. */
export function DetailsTab({
  row,
  customerId,
  isSm,
  accounts,
  customer,
  customerError,
  onRetryCustomer,
  onEdit,
}: {
  row: PortfolioRow;
  customerId: number;
  isSm: boolean;
  accounts: AccountsSectionProps;
  /** GET /customers/{id}/; null while it loads or when it failed. */
  customer: Customer | null;
  customerError: string | null;
  onRetryCustomer: () => void;
  /** Absent until the customer record has landed. */
  onEdit?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <AccountsSection {...accounts} />
      <div className="rounded-xl bg-surface">
        <AccountDetails row={row} stacked={!isSm} onEdit={onEdit ? () => onEdit() : undefined} />
        <CustomerFacts customer={customer} error={customerError} stacked={!isSm} onRetry={onRetryCustomer} />
        <div className="px-3 pb-4">
          <AIAttributesPanel customerId={customerId} />
        </div>
      </div>
    </div>
  );
}
```

`src/components/organizations/detail/PeopleTab.tsx`:
```tsx
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchContactsForCustomer } from '../../../features/customers/customersSlice';
import { ContactsTab } from '../../shared/ContactsTab';

/** People: today's Contacts tab inside the new frame (spec §4, delivery 1).
 *  It reads the contacts when first opened, not when the page lands.
 *  Delivery 2 turns it into list items filtered by account. */
export function PeopleTab({ customerId }: { customerId: number }) {
  const dispatch = useAppDispatch();
  const { contacts, contactsLoading, contactsError } = useAppSelector((state) => state.customers);
  useEffect(() => {
    dispatch(fetchContactsForCustomer(customerId));
  }, [dispatch, customerId]);
  return <ContactsTab contacts={contacts} isLoading={contactsLoading} error={contactsError} customerId={customerId} />;
}
```

`src/components/organizations/detail/DealsTab.tsx`:
```tsx
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchOpportunitiesForCustomer, fetchRisksForCustomer } from '../../../features/customers/customersSlice';
import { PipelinesTab } from '../../shared/PipelinesTab';

/** Deals & risks: today's Pipelines tab inside the new frame (spec §4,
 *  delivery 1). It reads opportunities and risks when first opened. */
export function DealsTab({ customerId }: { customerId: number }) {
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
```

`src/components/organizations/detail/KnowledgeTab.tsx`:
```tsx
import { useEffect, useId } from 'react';
import { useAppDispatch, useAppSelector } from '../../../hooks';
import { fetchHeadlinesForCustomer, regenerateHeadlines } from '../../../features/customers/customersSlice';
import { HeadlinesTab } from '../activity/HeadlinesTab';
import { CompanyViewTab } from '../CompanyViewTab';

/** Knowledge (spec §1.9): today's Company View (the brief, who answers, and
 *  questions), then the AI headlines that used to be a feed sub-tab.
 *  Delivery 2 restyles it. */
export function KnowledgeTab({ customerId, customerName }: { customerId: number; customerName: string }) {
  const dispatch = useAppDispatch();
  const headingId = useId();
  const { headlines, headlinesLoading, headlinesError, headlinesGenerating, headlinesGenerateError } = useAppSelector(
    (state) => state.customers,
  );
  useEffect(() => {
    dispatch(fetchHeadlinesForCustomer(customerId));
  }, [dispatch, customerId]);
  return (
    <div className="flex flex-col gap-6">
      <CompanyViewTab customerId={customerId} customerName={customerName} />
      <section aria-labelledby={headingId} className="flex flex-col gap-2">
        <h2 id={headingId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Headlines
        </h2>
        <HeadlinesTab
          headlines={headlines}
          isLoading={headlinesLoading}
          error={headlinesError}
          onRegenerate={async () => {
            await dispatch(regenerateHeadlines({ customerId }));
          }}
          isRegenerating={headlinesGenerating}
          regenerateError={headlinesGenerateError}
        />
      </section>
    </div>
  );
}
```

`src/components/organizations/detail/FilesCallsTab.tsx`:
```tsx
import { useId } from 'react';
import { CallSenseTab } from '../activity/CallSenseTab';
import { FilesTab } from '../activity/FilesTab';

/** Files (spec §1.8): today's Files and CallSense sub-tabs inside the new
 *  frame. The story already carries each call's summary; here are the
 *  recordings, participants and transcripts. */
export function FilesCallsTab({ customerId }: { customerId: number }) {
  const filesId = useId();
  const callsId = useId();
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={filesId} className="flex flex-col gap-2">
        <h2 id={filesId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Files
        </h2>
        <FilesTab entityType="organization" entityId={customerId} />
      </section>
      <section aria-labelledby={callsId} className="flex flex-col gap-2">
        <h2 id={callsId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Calls
        </h2>
        <CallSenseTab entityType="organization" entityId={customerId} />
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/organizations/detail src/pages/organizations/Details.test.tsx`
Expected: PASS: the six Accounts section tests, the seven CustomerFacts tests, the four new tab tests, the 37 field-coverage cases, every moved contacts and pipelines test, the whole `detail/` folder (house rules included), and the old `Details.test.tsx` (still untouched).

- [ ] **Step 7: Commit**

```bash
git add src/components/organizations/portfolio/rowParts.tsx src/components/organizations/detail/AccountsSection.tsx src/components/organizations/detail/AccountsSection.test.tsx src/components/organizations/detail/CustomerFacts.tsx src/components/organizations/detail/CustomerFacts.test.tsx src/components/organizations/detail/DetailsTab.tsx src/components/organizations/detail/PeopleTab.tsx src/components/organizations/detail/DealsTab.tsx src/components/organizations/detail/KnowledgeTab.tsx src/components/organizations/detail/FilesCallsTab.tsx src/components/organizations/detail/otherTabs.test.tsx src/components/organizations/detail/fieldCoverage.test.tsx src/components/organizations/detail/PeopleTab.test.tsx src/components/organizations/detail/DealsTab.test.tsx
git commit -m "feat(organizations): Details with the connected accounts and the List's panels, and today's other tabs in the new frame

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 16: The page: rewrite `Details.tsx` (integration tests, phones included)

**Files:**
- Modify: `src/pages/organizations/Details.tsx` (rewrite, whole file)
- Modify: `src/pages/organizations/Details.test.tsx` (rewrite, whole file)
- Modify: `src/pages/organizations/testDetail.tsx` (add `renderOrganizationPage`)
- Modify: `src/pages/organizations/OrganizationsFrame.tsx` (doc comment's first line)
- Modify: `src/components/organizations/detail/houseRules.test.ts` (scan the page too)
- Modify: `src/pages/surveys/SurveysPage.tsx` (`handleRowClick`), `src/pages/surveys/SurveysPage.test.tsx` (`DetailsStub`, one expectation)
- Modify: `src/components/organizations/ConfirmDialog.tsx` (its backdrop takes the `bg-scrim` token, as Archive's confirm now opens from the name row)

**Interfaces:**
- Consumes: everything from Tasks 1-15; `OrganizationsFrame`; `OrganizationFormModal`, `ChurnOrganizationModal`, `ConfirmDialog`, `AccountFormModal`; `bulkUpdate`; `fetchAccountsForCustomer`; `EmptyState`, `ErrorBlock`, `errorMessage`, `FOCUS`, `QUIET`; `SM`, `useMediaQuery`.
- Produces:
  - `Details()` (the same export `App.tsx` routes to `/organizations/:id`). Its states: "Organization not found"; the header's first read failing (`ErrorBlock` with Try again); a header skeleton, and a tab skeleton on Details ("Loading details") and Knowledge ("Loading knowledge"), until the row lands; a failed reload with the row still on screen (an inline alert, "Could not refresh this organization: …", with Try again); Edit off with its reason when the customer record failed.
  - `renderOrganizationPage(url?: string, options?: {width?: number; nav?: boolean; list?: boolean}): {store}` (`testDetail.tsx`): the real store and router with the page at `/organizations/:id` and, at `/organizations/list`, the real `List` when `list` is set (a marker otherwise), each with a `data-testid="where"` line; `nav` adds the real `Navbar`.

- [ ] **Step 1: Add the page render helper**

In `src/pages/organizations/testDetail.tsx`, replace the first line (`// Test-only helpers for the organization page. Task 16 adds renderOrganizationPage.`) and the imports below it with:
```tsx
// Test-only helpers for the organization page: its store and its render.
// Never hot-reloaded: Where sits beside the helpers so a test imports one module.
/* eslint-disable react-refresh/only-export-components */
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import authReducer from '../../features/auth/authSlice';
import callsReducer from '../../features/calls/callsSlice';
import customersReducer from '../../features/customers/customersSlice';
import filesReducer from '../../features/files/filesSlice';
import knowledgeReducer from '../../features/knowledge/knowledgeSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { ALL_CAPABILITIES } from '../../test/capabilities';
import { setViewport } from '../../test/viewport';
import { Details } from './Details';
import { List } from './List';
```
and append to the end of the file:
```tsx
function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

/** The organization page on the real store and router. `list` puts the real
 *  List at /organizations/list (a marker otherwise); `nav` adds the real
 *  Navbar. Only fetch is stubbed, by the caller (stubOrganizationPage). */
export function renderOrganizationPage(
  url = '/organizations/7',
  { width = 1440, nav = false, list = false }: { width?: number; nav?: boolean; list?: boolean } = {},
) {
  setViewport(width);
  const store = makeDetailStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        {nav ? <Navbar /> : null}
        <Routes>
          <Route
            path="/organizations/:id"
            element={
              <>
                <Details />
                <Where />
              </>
            }
          />
          <Route
            path="/organizations/list"
            element={
              <>
                {list ? <List /> : <p>Organizations list</p>}
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

- [ ] **Step 2: Write the failing integration tests**

Replace the whole of `src/pages/organizations/Details.test.tsx` with:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  manyItems,
  portfolioRequests,
  postBodies,
  requestPaths,
  storyQueries,
  stubOrganizationPage,
} from '../../features/organizations/testStory';
import { resetViewport } from '../../test/viewport';
import { renderOrganizationPage } from './testDetail';

// Integration tier: the real page, store and router; only fetch is stubbed,
// with bodies in the shapes of spec 2026-09-26 §2 (stubOrganizationPage).
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const itemKeys = () => [...document.querySelectorAll('[data-story-item]')].map((el) => el.getAttribute('data-story-item'));
const landed = () => screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
const lastStory = (spy: Parameters<typeof storyQueries>[0]) => {
  const all = storyQueries(spy);
  return all[all.length - 1];
};

describe('the organization page (/organizations/:id)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('lands in four requests: the name row, the tiles, the account chips and the story', async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage();
    await landed();
    const header = document.querySelector('[data-part="header"]') as HTMLElement;
    expect(within(header).getByText('Carl CSM').closest('p')).toHaveTextContent('Carl CSM · Live · Touched 33d ago');
    expect(within(header).getByText('Renewal overdue')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'ARR $69.6K. Show commercial details' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'EMEA 1' })).toBeInTheDocument();
    // The Show filters have an "All 5" too: the account chips are their own group.
    const chips = screen.getByRole('group', { name: 'Filter by account' });
    expect(within(chips).getByRole('button', { name: 'All 5' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getByRole('button', { name: 'Organization 3' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Needs attention' })).toBeInTheDocument();
    expect(itemKeys()).toEqual(['email:41', 'call:12', 'ticket:88', 'task:5', 'health:3']);
    expect(screen.getByRole('tab', { name: 'Story' })).toHaveAttribute('aria-selected', 'true');
    expect([...requestPaths(spy)].sort()).toEqual([
      'GET /customers/7/',
      'GET /customers/7/accounts/',
      'GET /organizations/7/story/',
      'GET /organizations/portfolio/',
    ]);
    expect(Object.fromEntries(portfolioRequests(spy)[0])).toEqual({ ids: '7', include_churned: '1', limit: '1' });
    expect(storyQueries(spy)[0].toString()).toBe('limit=30');
  });

  it('has none of the removed parts (spec §1.10)', async () => {
    stubOrganizationPage();
    renderOrganizationPage();
    await landed();
    await screen.findByRole('button', { name: 'EMEA 1' });
    for (const gone of [
      /Enable new 360 UI/,
      /Ask Copilot/,
      /coming soon/i,
      /^Slack$/,
      /^Sessions$/,
      /Success Plans/,
      /Custom Objects/,
      /Canvas List/,
      /All attributes/i,
      /Pinned attributes/i,
      /Account Pulse/,
      /Promoters/,
    ]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
    expect(document.querySelector('img')).toBeNull();
  });

  it('filters the story by account in the URL, and shows the chips on the Story tab only', async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage();
    await userEvent.click(await screen.findByRole('button', { name: 'EMEA 1' }));
    expect(where().searchParams.get('account')).toBe('31');
    await waitFor(() => expect(itemKeys()).toEqual(['email:41']));
    expect(lastStory(spy).get('account')).toBe('31');
    expect(screen.getByRole('button', { name: 'EMEA 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Edit EMEA' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'People' }));
    expect(where().searchParams.get('tab')).toBe('people');
    expect(screen.queryByRole('group', { name: 'Filter by account' })).not.toBeInTheDocument();
    expect(where().searchParams.get('account')).toBe('31');
  });

  it('opens a deep link on its tab, and reads the story only on Story', async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage('/organizations/7?tab=details');
    await landed();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Details' });
    expect(within(panel).getByText('Total contract value')).toBeInTheDocument();
    const facts = within(panel).getByRole('region', { name: 'Contact and CSAT' });
    expect(await within(facts).findByText('No CSAT survey has been answered yet.')).toBeInTheDocument();
    expect(within(panel).getByRole('region', { name: 'AI attributes' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter by account' })).not.toBeInTheDocument();
    expect(storyQueries(spy)).toHaveLength(0);
    await userEvent.click(screen.getByRole('tab', { name: 'Story' }));
    await waitFor(() => expect(storyQueries(spy)).toHaveLength(1));
  });

  it('shows a skeleton on Details and Knowledge until the organization lands', async () => {
    stubOrganizationPage();
    renderOrganizationPage('/organizations/7?tab=details');
    expect(screen.getByRole('status', { name: 'Loading details' })).toBeInTheDocument();
    await landed();
    expect(screen.queryByRole('status', { name: 'Loading details' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Knowledge' }));
    expect(await screen.findByRole('region', { name: 'Headlines' })).toBeInTheDocument();
  });

  it('shows the Knowledge skeleton on a deep link until the organization lands', async () => {
    stubOrganizationPage();
    renderOrganizationPage('/organizations/7?tab=knowledge');
    expect(screen.getByRole('status', { name: 'Loading knowledge' })).toBeInTheDocument();
    await landed();
    expect(await screen.findByRole('region', { name: 'Headlines' })).toBeInTheDocument();
  });

  it('jumps from a tile to its Details panel, and opens the health breakdown', async () => {
    stubOrganizationPage();
    renderOrganizationPage();
    await landed();
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /^ARR/ }));
    expect(where().searchParams.get('tab')).toBe('details');
    const commercial = document.querySelector('[data-panel="commercial"]');
    await waitFor(() => expect(commercial).toHaveFocus());
    // The panel itself scrolled into view, not only the tab row.
    expect(scroll.mock.contexts).toContain(commercial);
    await userEvent.click(screen.getByRole('button', { name: /^Pulse/ }));
    await waitFor(() => expect(document.querySelector('[data-panel="voice"]')).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: /^Health 4\.9/ }));
    const breakdown = await screen.findByRole('region', { name: 'Health breakdown' });
    expect(within(breakdown).getByText('Product usage')).toBeInTheDocument();
  });

  it('moves between the tabs from the keyboard, each reading its data when opened', async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage();
    await landed();
    screen.getByRole('tab', { name: 'Story' }).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'People' })).toHaveFocus();
    expect(where().searchParams.get('tab')).toBe('people');
    await waitFor(() => expect(requestPaths(spy)).toContain('GET /customers/7/contacts/'));
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(requestPaths(spy)).toContain('GET /customers/7/opportunities/'));
    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('region', { name: 'Headlines' })).toBeInTheDocument();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('region', { name: 'Calls' })).toBeInTheDocument();
    expect(where().searchParams.get('tab')).toBe('files');
  });

  it('filters by kind, source and search, all kept in the URL', async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Tickets 1' }));
    expect(where().searchParams.get('group')).toBe('tickets');
    await waitFor(() => expect(itemKeys()).toEqual(['ticket:88']));
    await userEvent.click(screen.getByRole('button', { name: /^Sources/ }));
    expect(screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual(['Tickets']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: /^All/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the story' }), 'retraining');
    await waitFor(() => expect(where().searchParams.get('q')).toBe('retraining'));
    await waitFor(() => expect(itemKeys()).toEqual(['call:12']));
    expect(lastStory(spy).get('q')).toBe('retraining');
    expect(where().searchParams.has('group')).toBe(false);
  });

  it('takes Needs attention rows to what needs attention', async () => {
    stubOrganizationPage();
    renderOrganizationPage();
    await userEvent.click(await screen.findByRole('button', { name: /^1 overdue task/ }));
    expect(where().searchParams.get('group')).toBe('tasks');
    await waitFor(() => expect(itemKeys()).toEqual(['task:5']));
    await userEvent.click(screen.getByRole('button', { name: '3 unanswered questions' }));
    expect(where().searchParams.get('tab')).toBe('knowledge');
  });

  it('opens an email as its real thread (?thread= on the story), and gives focus back to it', async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage();
    const title = await screen.findByRole('button', { name: 'Re: Renewal pricing' });
    await userEvent.click(title);
    const dialog = screen.getByRole('dialog', { name: 'Re: Renewal pricing' });
    expect(await within(dialog).findByText('Can we see the quote before the board meets on Friday?')).toBeInTheDocument();
    expect(within(dialog).getByText('Sharing the renewal quote ahead of your board meeting.')).toBeInTheDocument();
    expect(lastStory(spy).get('thread')).toBe('t-1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(title).toHaveFocus();
  });

  it('adds a task on the chosen account and shows it in the story', async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage('/organizations/7?account=31');
    await screen.findByRole('button', { name: 'EMEA 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    expect(dialog).toHaveAccessibleDescription('On EMEA');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Task title' }), 'Book the retraining');
    fireEvent.change(within(dialog).getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postBodies(spy, '/customers/7/accounts/31/tasks/')).toEqual([
      { title: 'Book the retraining', due_date: '2026-10-01', priority: 'medium', assignee_id: null },
    ]);
    expect(await screen.findByRole('button', { name: 'Book the retraining' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'EMEA 2' })).toBeInTheDocument();
    expect(screen.getByText('Added to the story.')).toBeInTheDocument();
  });

  it('edits, archives and churns from the name row', async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage();
    await landed();
    const edit = screen.getByRole('button', { name: 'Edit' });
    await waitFor(() => expect(edit).toBeEnabled());
    await userEvent.click(edit);
    expect(await screen.findByRole('heading', { name: 'Edit Pizza Hut' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pizza Hut' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(screen.getByText('Archive Pizza Hut?')).toBeInTheDocument();
    // The confirm dims the page with the scrim token, which darkens in both themes.
    expect(screen.getByText('Archive Pizza Hut?').closest('.fixed')).toHaveClass('bg-scrim');
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(postBodies(spy, '/organizations/bulk/')).toEqual([{ ids: [7], action: 'archive', value: null }]));
    expect(await screen.findByText('Archived')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pizza Hut' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Churn']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Churn' }));
    expect(screen.getByText('Churn Pizza Hut?')).toBeInTheDocument();
  });

  it('lists every connected account on Details, each linking to its page and editable, at 375px too', async () => {
    stubOrganizationPage();
    renderOrganizationPage('/organizations/7?tab=details', { width: 375 });
    const section = await screen.findByRole('region', { name: 'Accounts' });
    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(2));
    expect(within(section).getByRole('link', { name: 'EMEA' })).toHaveAttribute('href', '/accounts/31');
    expect(within(section).getByText('Usage is steady and the renewal talks are friendly.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter by account' })).not.toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Edit EMEA' }));
    expect(screen.getByRole('heading', { name: 'Edit EMEA' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(section).getByRole('button', { name: 'Add account' }));
    expect(screen.getByRole('heading', { name: 'Add Account' })).toBeInTheDocument();
  });

  it('adds an account from the chip row, and edits the chosen one', async () => {
    stubOrganizationPage();
    renderOrganizationPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Add account' }));
    expect(screen.getByRole('heading', { name: 'Add Account' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'EMEA 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit EMEA' }));
    expect(screen.getByRole('heading', { name: 'Edit EMEA' })).toBeInTheDocument();
  });

  it('keeps the page and says so when a reload fails, with Try again', async () => {
    stubOrganizationPage();
    renderOrganizationPage();
    await landed();
    // The next header read fails: archive, then the reload after it.
    stubOrganizationPage({ failPortfolio: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Pizza Hut' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not refresh this organization: Try later.');
    expect(screen.getByRole('heading', { level: 1, name: 'Pizza Hut' })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByText('Archived')).toBeInTheDocument();
  });

  it('says why Edit is off when the record did not load, and Try again brings it back', async () => {
    stubOrganizationPage({ failCustomer: 1 });
    renderOrganizationPage();
    await landed();
    expect(await screen.findByText('Edit is unavailable: Try later.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    const header = document.querySelector('[data-part="header"]') as HTMLElement;
    await userEvent.click(within(header).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled());
    expect(screen.queryByText('Edit is unavailable: Try later.')).not.toBeInTheDocument();
  });

  it('says an organization this viewer cannot see is not found', async () => {
    stubOrganizationPage({ row: null });
    renderOrganizationPage('/organizations/99');
    expect(await screen.findByText('Organization not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to organizations' })).toHaveAttribute('href', '/organizations/list');
  });

  it('asks for nothing when the id is not a number', () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage('/organizations/abc');
    expect(screen.getByText('Organization not found')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows a failed header read with Try again', async () => {
    stubOrganizationPage({ failPortfolio: 1 });
    renderOrganizationPage();
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await landed();
  });

  it('shows a failed story with Try again, then pages the rest', async () => {
    const spy = stubOrganizationPage({ items: manyItems(35), failStory: 1 });
    renderOrganizationPage();
    await landed();
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(itemKeys()).toHaveLength(30));
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(itemKeys()).toHaveLength(35));
    expect(lastStory(spy).get('cursor')).toBe('30');
  });

  it('lays the tiles out as a grid from sm', async () => {
    stubOrganizationPage();
    renderOrganizationPage();
    await landed();
    expect(screen.getByRole('button', { name: /^ARR/ }).parentElement).toHaveClass('grid', 'grid-cols-4');
  });

  it('on phones: a tile strip, scrolling tabs, and sheets from the bottom', async () => {
    stubOrganizationPage();
    renderOrganizationPage('/organizations/7', { width: 375 });
    await landed();
    const strip = screen.getByRole('button', { name: /^ARR/ }).parentElement;
    expect(strip).toHaveClass('overflow-x-auto', 'snap-x');
    expect(strip).not.toHaveClass('grid');
    expect(screen.getByRole('tablist')).toHaveClass('overflow-x-auto');
    await userEvent.click(await screen.findByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New note' }));
    expect(screen.getByRole('dialog', { name: 'New note' }).closest('[data-shape]')).toHaveAttribute('data-shape', 'sheet');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/pages/organizations/Details.test.tsx`
Expected: FAIL. The old page renders "General", no `data-part="header"`, and none of the new tabs, so "Unable to find role="heading" … name "Pizza Hut"" and similar.

- [ ] **Step 4: Rewrite the page**

Replace the whole of `src/pages/organizations/Details.tsx` with:
```tsx
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { fetchAccountsForCustomer, type Account } from '../../features/customers/customersSlice';
import { detailPanelId, detailTabId, storyFilters } from '../../features/organizations/detailParams';
import { bulkUpdate } from '../../features/organizations/portfolioApi';
import type { PanelKey } from '../../features/organizations/portfolioFields';
import { storyQuery } from '../../features/organizations/storyApi';
import { ChurnOrganizationModal } from '../../components/organizations/ChurnOrganizationModal';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { OrganizationFormModal } from '../../components/organizations/OrganizationFormModal';
import { AccountChips } from '../../components/organizations/detail/AccountChips';
import { DealsTab } from '../../components/organizations/detail/DealsTab';
import { DetailsTab } from '../../components/organizations/detail/DetailsTab';
import { DetailTabs } from '../../components/organizations/detail/DetailTabs';
import { FilesCallsTab } from '../../components/organizations/detail/FilesCallsTab';
import { HeaderTiles } from '../../components/organizations/detail/HeaderTiles';
import { KnowledgeTab } from '../../components/organizations/detail/KnowledgeTab';
import { OrganizationHeader } from '../../components/organizations/detail/OrganizationHeader';
import { PeopleTab } from '../../components/organizations/detail/PeopleTab';
import { StoryTab } from '../../components/organizations/detail/StoryTab';
import { useDetailParams } from '../../components/organizations/detail/useDetailParams';
import { useOrganization } from '../../components/organizations/detail/useOrganization';
import { useStory } from '../../components/organizations/detail/useStory';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { errorMessage } from '../../components/organizations/portfolio/usePortfolio';
import { FOCUS, QUIET } from '../../components/organizations/portfolio/styles';
import { AccountFormModal } from './AccountFormModal';
import { OrganizationsFrame } from './OrganizationsFrame';

/** Archive through the bulk endpoint, as the List does. ConfirmDialog shows a
 *  thrown string as the reason, so a refusal says why. */
async function archiveOrganization(id: number): Promise<void> {
  let failure: string | null = null;
  try {
    const result = await bulkUpdate({ ids: [id], action: 'archive', value: null });
    failure = result.failed[0]?.reason ?? null;
  } catch (err) {
    failure = errorMessage(err, 'Could not archive this organization.');
  }
  if (failure) throw failure;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <OrganizationsFrame>
      <div className="mx-auto w-full max-w-6xl py-6">{children}</div>
    </OrganizationsFrame>
  );
}

/** A tab's content before the organization's row lands. */
function TabSkeleton({ label }: { label: string }) {
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

function HeaderSkeleton({ isSm }: { isSm: boolean }) {
  return (
    <div role="status" aria-label="Loading organization" className="flex flex-col gap-3">
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

/** /organizations/:id, the organization's story (spec 2026-09-26, delivery 1):
 *  the name row and tiles from the List's own row, the account chips, and six
 *  tabs whose choice, like the story's filters, lives in the URL. It lands in
 *  four requests; every other tab reads its data when first opened. Ask on
 *  this page is delivery 3, so the frame has no rail yet. */
export function Details() {
  const { id } = useParams<{ id: string }>();
  const orgId = id && /^\d+$/.test(id) ? Number(id) : null;
  const isSm = useMediaQuery(SM);
  const dispatch = useAppDispatch();
  const { params, update } = useDetailParams();
  const idBase = useId();

  const [version, setVersion] = useState(0);
  const [storyVersion, setStoryVersion] = useState(0);
  const reloadHeader = useCallback(() => setVersion((v) => v + 1), []);
  const org = useOrganization(orgId, version);
  const story = useStory(orgId ?? 0, storyQuery(storyFilters(params)), storyVersion, orgId !== null && params.tab === 'story');

  const { accountsForCustomer, accountsLoading, accountsError } = useAppSelector((state) => state.customers);
  const [accountsAttempt, setAccountsAttempt] = useState(0);
  useEffect(() => {
    if (orgId !== null) dispatch(fetchAccountsForCustomer(orgId));
  }, [dispatch, orgId, accountsAttempt]);

  const [editing, setEditing] = useState(false);
  const [churning, setChurning] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // A tile jumps to its Details panel: the tab switches, then the panel
  // scrolls into view and takes focus. Each jump is numbered, so a second
  // jump while already on Details still moves.
  const [jump, setJump] = useState<{ panel: PanelKey; n: number } | null>(null);
  const handledJump = useRef(0);
  const jumpTo = useCallback(
    (panel: PanelKey) => {
      setJump((prev) => ({ panel, n: (prev?.n ?? 0) + 1 }));
      update({ tab: 'details' });
    },
    [update],
  );
  useEffect(() => {
    if (!jump || jump.n === handledJump.current || params.tab !== 'details' || !org.row) return;
    handledJump.current = jump.n;
    const section = document.querySelector<HTMLElement>(`[data-panel="${jump.panel}"]`);
    if (!section) return;
    section.setAttribute('tabindex', '-1');
    section.scrollIntoView?.({ block: 'start' });
    section.focus();
  }, [jump, params.tab, org.row]);

  if (orgId === null || org.notFound) {
    return (
      <Centered>
        <EmptyState
          title="Organization not found"
          detail="It may have been removed, or you may not have access to it."
          action={
            <Link to="/organizations/list" className={`${QUIET} border border-line`}>
              Back to organizations
            </Link>
          }
        />
      </Centered>
    );
  }
  if (org.error && !org.row) {
    return (
      <Centered>
        <ErrorBlock message={org.error} onRetry={org.retry} />
      </Centered>
    );
  }

  const row = org.row;
  const tab = params.tab;
  return (
    <OrganizationsFrame>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-6">
        {row ? (
          <section data-part="header" aria-label="Organization summary" className="flex flex-col gap-3">
            <OrganizationHeader
              row={row}
              canEdit={org.customer !== null}
              editError={org.customerError}
              onRetryEdit={org.retry}
              onEdit={() => setEditing(true)}
              onArchive={() => setArchiving(true)}
              onChurn={() => setChurning(true)}
            />
            <HeaderTiles row={row} customer={org.customer} customerError={org.customerError} isSm={isSm} onJump={jumpTo} />
          </section>
        ) : (
          <HeaderSkeleton isSm={isSm} />
        )}

        {row && org.error ? (
          // A reload (after an edit, archive or churn) failed: the last row stays.
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 text-[13px] text-danger">
            <span>Could not refresh this organization: {org.error}</span>
            <button type="button" onClick={org.retry} className={QUIET}>
              Try again
            </button>
          </div>
        ) : null}

        {tab === 'story' ? (
          <AccountChips
            accounts={accountsForCustomer}
            loading={accountsLoading}
            error={accountsError}
            counts={story.data?.counts.by_account ?? null}
            selected={params.account}
            onSelect={(account) => update({ account })}
            onRetry={() => setAccountsAttempt((n) => n + 1)}
            onAdd={() => setAddingAccount(true)}
            onEdit={setEditingAccount}
          />
        ) : null}

        <DetailTabs idBase={idBase} active={tab} onChange={(next) => update({ tab: next })} />

        <div
          role="tabpanel"
          id={detailPanelId(idBase)}
          aria-labelledby={detailTabId(idBase, tab)}
          tabIndex={0}
          className={`min-w-0 rounded-sm ${FOCUS}`}
        >
          {tab === 'story' ? (
            <StoryTab
              orgId={orgId}
              story={story}
              params={params}
              accounts={accountsForCustomer}
              isSm={isSm}
              onUpdate={update}
              onAdded={() => setStoryVersion((v) => v + 1)}
              onOpenTab={(next) => update({ tab: next })}
              onJump={jumpTo}
            />
          ) : tab === 'details' ? (
            row ? (
              <DetailsTab
                row={row}
                customerId={orgId}
                isSm={isSm}
                accounts={{
                  items: accountsForCustomer,
                  loading: accountsLoading,
                  error: accountsError,
                  onRetry: () => setAccountsAttempt((n) => n + 1),
                  onAdd: () => setAddingAccount(true),
                  onEdit: setEditingAccount,
                }}
                customer={org.customer}
                customerError={org.customerError}
                onRetryCustomer={org.retry}
                onEdit={org.customer ? () => setEditing(true) : undefined}
              />
            ) : (
              <TabSkeleton label="Loading details" />
            )
          ) : tab === 'people' ? (
            <PeopleTab customerId={orgId} />
          ) : tab === 'deals' ? (
            <DealsTab customerId={orgId} />
          ) : tab === 'knowledge' ? (
            row ? <KnowledgeTab customerId={orgId} customerName={row.name} /> : <TabSkeleton label="Loading knowledge" />
          ) : (
            <FilesCallsTab customerId={orgId} />
          )}
        </div>
      </div>

      {editing && org.customer ? (
        <OrganizationFormModal customer={org.customer} onSaved={reloadHeader} onClose={() => setEditing(false)} />
      ) : null}
      {churning && row ? (
        <ChurnOrganizationModal
          customerIds={[row.id]}
          customerNames={[row.name]}
          onChurned={reloadHeader}
          onClose={() => setChurning(false)}
        />
      ) : null}
      {archiving && row ? (
        <ConfirmDialog
          title={`Archive ${row.name}?`}
          message="Hidden from the Organizations list and its summary, but not deleted. You can unarchive later."
          confirmLabel="Archive"
          danger
          onConfirm={async () => {
            await archiveOrganization(row.id);
            reloadHeader();
          }}
          onClose={() => setArchiving(false)}
        />
      ) : null}
      {addingAccount ? (
        <AccountFormModal customerId={orgId} onSaved={() => setAccountsAttempt((n) => n + 1)} onClose={() => setAddingAccount(false)} />
      ) : null}
      {editingAccount ? (
        <AccountFormModal customerId={orgId} account={editingAccount} onClose={() => setEditingAccount(null)} />
      ) : null}
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 5: Point the house rules at the page, name the frame's third user, and land the Surveys page's row-click on Feedback**

Replace the whole of `src/components/organizations/detail/houseRules.test.ts` with:
```ts
import { houseRuleSuite } from '../../../test/houseRules';

// Spec 2026-09-26 §1 and the design skill's §4 over every part of the
// organization page, and the page itself.
houseRuleSuite('organization page house rules', {
  ...(import.meta.glob('./**/*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>),
  ...(import.meta.glob('../../../pages/organizations/Details.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<
    string,
    string
  >),
});
```

In `src/components/organizations/ConfirmDialog.tsx`, replace:
```tsx
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4" onClick={onClose}>
```
with:
```tsx
    <div className="fixed inset-0 bg-scrim flex items-center justify-center z-[200] p-4" onClick={onClose}>
```

In `src/pages/organizations/OrganizationsFrame.tsx`, replace:
```tsx
/** The Organizations list's and board's frame: DashboardFrame's body, class for class
```
with:
```tsx
/** The Organizations frame (the list, the board and an organization's page): DashboardFrame's body, class for class
```

In `src/pages/surveys/SurveysPage.tsx`, replace:
```tsx
    navigate(`/organizations/${customerId}`, { state: { activityFilter: 'Surveys' } });
```
with:
```tsx
    // The organization page's Story, filtered to Feedback (surveys).
    navigate(`/organizations/${customerId}?group=feedback`);
```

In `src/pages/surveys/SurveysPage.test.tsx`, replace:
```tsx
function DetailsStub() {
  const { id } = useParams();
  const location = useLocation();
  const state = location.state as { activityFilter?: string } | null;
  return (
    <div>
      Organization {id} — filter: {state?.activityFilter ?? 'none'}
    </div>
  );
}
```
with:
```tsx
function DetailsStub() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <div>
      Organization {id} — {location.search || 'no filter'}
    </div>
  );
}
```
and replace:
```tsx
    expect(await screen.findByText('Organization 6 — filter: Surveys')).toBeInTheDocument();
```
with:
```tsx
    expect(await screen.findByText('Organization 6 — ?group=feedback')).toBeInTheDocument();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/pages/organizations src/components/organizations src/pages/surveys src/features/organizations`
Expected: PASS: the new page tests (23), the house rules over `detail/` and `Details.tsx`, the Surveys page test, and every organizations test besides.

- [ ] **Step 7: Type-check, lint and commit**

Run: `npx tsc -b --noEmit && npx eslint src/pages/organizations src/components/organizations src/features/organizations src/pages/surveys src/test`
Expected: no output from tsc; eslint reports 0 errors and no warnings in these paths.

```bash
git add src/pages/organizations/Details.tsx src/pages/organizations/Details.test.tsx src/pages/organizations/testDetail.tsx src/pages/organizations/OrganizationsFrame.tsx src/components/organizations/ConfirmDialog.tsx src/components/organizations/detail/houseRules.test.ts src/pages/surveys/SurveysPage.tsx src/pages/surveys/SurveysPage.test.tsx
git commit -m "feat(organizations): the organization page as the organization's story

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Chrome: the transparent top bar and `p-0` on `/organizations/:id`

**Files:**
- Modify: `src/components/layout/Navbar.tsx` (imports; the organization-detail block near lines 76-87; `isOrgView`/`isFramed`; the `organization` header branch near lines 270-288)
- Modify: `src/components/layout/Navbar.test.tsx` (the `Navbar organization breadcrumb (/organizations/:id)` describe block)
- Modify: `src/layouts/DashboardLayout.tsx` (`isOrgView`), `src/layouts/DashboardLayout.test.tsx` (the `p-0` list)

**Interfaces:**
- Consumes: nothing new.
- Produces: on `/^\/organizations\/\d+$/` the Navbar is the framed transparent bar (`h-16 shrink-0 flex items-center gap-3 px-4`) with a "‹ Organizations" link to `/organizations/list` inside `nav[aria-label="Breadcrumb"]`, the empty actions slot, the bell, and no avatar; it reads nothing from `state.customers.selectedCustomer`. `DashboardLayout` gives that route `p-0`.

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/Navbar.test.tsx`, replace the whole `describe('Navbar organization breadcrumb (/organizations/:id)', () => { … });` block with:
```tsx
describe('Navbar on an organization page (/organizations/:id)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('wears the Organizations frame: transparent bar, a way back to the list, the actions slot, no avatar', () => {
    const setSlot = vi.fn();
    renderNavbar('/organizations/10', globex, null, [], setSlot);
    const header = document.querySelector('header');
    expect(header).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    for (const cls of ['bg-surface', 'border-b', 'shadow-sm']) expect(header).not.toHaveClass(cls);
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Organizations' });
    expect(back).toHaveAttribute('href', '/organizations/list');
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(header!.querySelector('[data-nav-actions-slot]')).not.toBeNull();
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
  });

  it('leaves the name to the page (no uppercase heading, no third-party logo)', () => {
    renderNavbar('/organizations/10', globex);
    expect(screen.queryByRole('heading', { name: 'Globex Corp' })).not.toBeInTheDocument();
    expect(document.querySelector('header img')).toBeNull();
  });

  it('takes you back to the list', async () => {
    renderNavbar('/organizations/10', globex);
    await userEvent.click(screen.getByRole('link', { name: 'Organizations' }));
    expect(await screen.findByText('Organizations Marker')).toBeInTheDocument();
  });
});
```

In `src/layouts/DashboardLayout.test.tsx`, replace:
```tsx
  it.each(['/dashboard/overview', '/communications', '/organizations/list', '/organizations/board'])('adds no padding around %s', (url) => {
```
with:
```tsx
  it.each(['/dashboard/overview', '/communications', '/organizations/list', '/organizations/board', '/organizations/7'])('adds no padding around %s', (url) => {
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.test.tsx`
Expected: FAIL: the header still has `border-b`, no Breadcrumb navigation exists, and `/organizations/7` is padded.

- [ ] **Step 3: Implement**

In `src/components/layout/Navbar.tsx`:

1. Replace `import { NavLink, useLocation, useNavigate } from 'react-router-dom';` with `import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';`, and delete the line `import { mapCustomerToOrgRow } from '../../features/customers/mapToOrgRow';`.
2. Delete the block that starts `  // Detect organization details path. Reads the same selectedCustomer that` and ends with `    orgId && selectedCustomer?.id === orgId ? mapCustomerToOrgRow(selectedCustomer) : null;` (the comment, `orgDetailMatch`, `orgId`, `selectedCustomer` and `organization`).
3. Replace:
```tsx
  const isOrgView = location.pathname === '/organizations/list' || location.pathname === '/organizations/board';
  const isFramed = isDashboard || isOrgView;
```
with:
```tsx
  const isOrgView = location.pathname === '/organizations/list' || location.pathname === '/organizations/board';
  // An organization's page wears the same frame (organization page spec
  // §1.1): the page draws its own name row, so the bar only leads back.
  const isOrgDetail = /^\/organizations\/\d+$/.test(location.pathname);
  const isFramed = isDashboard || isOrgView || isOrgDetail;
```
4. Delete the header branch that starts `        ) : organization ? (` and ends on the line before `        ) : isOrgView ? (` (the back chevron, the Clearbit `EntityAvatar` and the uppercase `<h1>`), and put in its place:
```tsx
        ) : isOrgDetail ? (
          <nav aria-label="Breadcrumb" className="flex items-center h-full">
            <Link
              to="/organizations/list"
              className="-ml-2 inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Organizations
            </Link>
          </nav>
```

In `src/layouts/DashboardLayout.tsx`, replace:
```tsx
  const isOrgView = location.pathname === '/organizations/list' || location.pathname === '/organizations/board';
```
with:
```tsx
  // The Organizations frame: the list, the board and an organization's page.
  const isOrgView =
    location.pathname === '/organizations/list' ||
    location.pathname === '/organizations/board' ||
    /^\/organizations\/\d+$/.test(location.pathname);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/layout src/layouts`
Expected: PASS (the three new Navbar tests, the widened layout test, and every other Navbar and layout test).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx
git commit -m "feat(organizations): the organization page wears the Organizations frame

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Removals: prove what is gone, delete what nothing imports

**Files:**
- Delete: `src/components/organizations/HealthPopover.tsx`, `src/components/organizations/HealthPopover.test.tsx`, `src/components/organizations/CsatPopover.tsx`, `src/components/organizations/CsatPopover.test.tsx`
- Modify: `src/components/contacts/ContactRowActionsPopover.tsx` (one comment)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new; `HealthBreakdown` (Task 6) is the page's health breakdown.

- [ ] **Step 1: Prove every §1.10 removal is off the page**

Run:
```bash
grep -rnE "ActivityFeed|PinnedAttributes|SlackTab|SessionsTab|EmailThreadPanel|MetricsBanner|AccountsMetricsBanner|clearbit|pravatar|Enable new 360 UI|Coming Soon|coming soon|Ask Copilot|Success Plans|CustomObjectsTab|CanvasListTab|account_pulse|Promoters" src/pages/organizations/Details.tsx src/components/organizations/detail --include='*.tsx' --include='*.ts' | grep -v '\.test\.' || echo "gone from the organization page"
```
Expected: `gone from the organization page`.

- [ ] **Step 2: Show which shared parts other pages still use (so they stay)**

Run:
```bash
for name in ActivityFeed PinnedAttributes SlackTab EmailThreadPanel CustomObjectsTab CanvasListTab accountActivityData EntityAvatar mapCustomerToOrgRow mapAccountToAccountRow; do
  printf '%s: ' "$name"; grep -rl "$name" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -vE "/$name\.tsx?$" | tr '\n' ' '; echo
done
```
Expected: each name lists at least one importer outside its own file (`pages/accounts/Details.tsx`, `components/shared/index.ts`, `pages/health/HealthDistribution.tsx`, `pages/lifecycle/LifecyclePage.tsx`, `pages/accounts/Board.tsx` and so on). Nothing here is deleted.

- [ ] **Step 3: Delete the two popovers nothing imports**

Run:
```bash
grep -rn "HealthPopover\|CsatPopover" src --include='*.ts' --include='*.tsx'
```
Expected: hits only in `components/organizations/HealthPopover.tsx`, `HealthPopover.test.tsx`, `CsatPopover.tsx`, `CsatPopover.test.tsx`, and the comment in `components/contacts/ContactRowActionsPopover.tsx`.

In `src/components/contacts/ContactRowActionsPopover.tsx`, replace:
```tsx
// Same shape/positioning convention as the org popovers (HealthPopover)
// — a per-row "..." menu — just a shorter Edit/Delete list (Contact has
// no Archive/Churn-equivalent state to manage).
```
with:
```tsx
// A per-row "..." menu with a short Edit/Delete list (Contact has no
// Archive/Churn-equivalent state to manage).
```

Then:
```bash
git rm src/components/organizations/HealthPopover.tsx src/components/organizations/HealthPopover.test.tsx src/components/organizations/CsatPopover.tsx src/components/organizations/CsatPopover.test.tsx
grep -rn "HealthPopover\|CsatPopover" src --include='*.ts' --include='*.tsx' || echo "no importers left"
```
Expected: `no importers left`.

- [ ] **Step 4: Run the gates that could notice**

Run: `npx tsc -b --noEmit && npx vitest run src/components/organizations src/components/contacts`
Expected: no tsc output; tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/ContactRowActionsPopover.tsx
git commit -m "chore(organizations): delete the unused health and CSAT popovers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: End-to-end (jsdom): open, filter by account, open an email, add a task, see it

**Files:**
- Create: `src/e2e/organizationDetail.test.tsx`

**Interfaces:**
- Consumes: `renderOrganizationPage(url, {nav, list})` (Task 16), `stubOrganizationPage` (its default thread t-1), `postBodies` (Task 1), `resetViewport`.
- Produces: nothing.

- [ ] **Step 1: Write the test**

`src/e2e/organizationDetail.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { postBodies, stubOrganizationPage } from '../features/organizations/testStory';
import { renderOrganizationPage } from '../pages/organizations/testDetail';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the List, the
// organization page, the store and the router. Only fetch is stubbed, with
// §2-shaped bodies; "+ Add" writes into the stub's story.
const where = () => new URL(`http://x${screen.getByTestId('where').textContent}`);
const itemKeys = () => [...document.querySelectorAll('[data-story-item]')].map((el) => el.getAttribute('data-story-item'));

describe('the organization page, end to end (spec §5)', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('opens an organization, filters by an account, opens an email, adds a task and sees it in the story', { timeout: 30000 }, async () => {
    const spy = stubOrganizationPage();
    renderOrganizationPage('/organizations/list', { nav: true, list: true });

    // 1. Open Pizza Hut from the List; the page wears the Organizations frame.
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza Hut' }));
    expect(where().pathname).toBe('/organizations/7');
    expect(await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Organizations' })).toHaveAttribute(
      'href',
      '/organizations/list',
    );
    expect(document.querySelector('header')).not.toHaveClass('border-b');

    // 2. Filter the story by EMEA.
    await userEvent.click(await screen.findByRole('button', { name: 'EMEA 1' }));
    expect(where().searchParams.get('account')).toBe('31');
    await waitFor(() => expect(itemKeys()).toEqual(['email:41']));

    // 3. Open the email: its real thread (the message on the organization
    // itself included, though EMEA is chosen), then back to where we were.
    const email = screen.getByRole('button', { name: 'Re: Renewal pricing' });
    await userEvent.click(email);
    const thread = screen.getByRole('dialog', { name: 'Re: Renewal pricing' });
    expect(await within(thread).findByText('Can we see the quote before the board meets on Friday?')).toBeInTheDocument();
    expect(within(thread).getByText('Sharing the renewal quote ahead of your board meeting.')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(email).toHaveFocus();

    // 4. Add a task; the chosen account is where it goes.
    await userEvent.click(screen.getByRole('button', { name: 'Add to the story' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'New task' }));
    const sheet = screen.getByRole('dialog', { name: 'New task' });
    expect(sheet).toHaveAccessibleDescription('On EMEA');
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Task title' }), 'Send the EMEA quote');
    fireEvent.change(within(sheet).getByLabelText('Due date'), { target: { value: '2026-10-01' } });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save task' }));

    // 5. It is in the story, filed under EMEA, and the chip counts it.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postBodies(spy, '/customers/7/accounts/31/tasks/')).toHaveLength(1);
    const added = await screen.findByRole('button', { name: 'Send the EMEA quote' });
    expect(added.closest('[data-story-item]')).toHaveTextContent('EMEA');
    expect(await screen.findByRole('button', { name: 'EMEA 2' })).toHaveAttribute('aria-pressed', 'true');

    // 6. Back to All: the whole story, the new task included.
    await userEvent.click(screen.getByRole('button', { name: 'All 6' }));
    expect(where().searchParams.has('account')).toBe(false);
    await waitFor(() => expect(itemKeys()).toHaveLength(6));

    // 7. Back to the List through the top bar.
    await userEvent.click(screen.getByRole('link', { name: 'Organizations' }));
    expect(where().pathname).toBe('/organizations/list');
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/e2e/organizationDetail.test.tsx`
Expected: PASS (1 test). If a step fails, fix the owning task's code (with its own commit), not the test.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/organizationDetail.test.tsx
git commit -m "test(organizations): end to end, from the list through the organization's story

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 20: Docs: `04-app-flow`, `03-ui-ux-design`, repo architecture

**Files:**
- Modify: `docs/04-app-flow.md` (§ Organizations steps 4-6, §4.4, the placeholders table)
- Modify: `docs/03-ui-ux-design.md` (§6 Overlays and Composite, a new "Organization page" subsection, §10 Responsive, §12 debt row 11)
- Modify: `.agents/workflows/repo-architecture.md` (route tree, Details View section, dependency tree)

**Interfaces:** none (docs only). Product documents are updated in the same PR as the change (the memory's "Product documents" rule): the frontend holds two of the six, `03` and `04`.

- [ ] **Step 1: `docs/04-app-flow.md`**

Replace:
```markdown
4. On a row, the organisation name links to `/organizations/:id`; a row click
   or the chevron opens the row instead (inline on desktop, a sheet on
   phones). `/organizations/:id` dispatches six parallel fetches:
   the customer, its accounts, contacts, opportunities, risks and canvases.
5. Tabs: General (metrics banner, `PinnedAttributes`, `ActivityFeed`), Company
   View, Accounts, Contacts, Pipelines, Custom Objects, Success Plans.
   Under the pinned attributes, `AIAttributesPanel` lists the AI attributes
   defined in Settings > AI Attributes with the Copilot's latest answer, a
   "why" with reasoning and cited sources, the history of answers and
   corrections, an inline override and a refresh (see the backend's
   `attributes` contract)
   (placeholder), Canvas List.
6. "Ask Copilot" navigates to `/copilot?forCustomerId=&forCustomerName=`.
```
with:
```markdown
4. On a row, the organisation name links to `/organizations/:id`; a row click
   or the chevron opens the row instead (inline on desktop, a sheet on
   phones).
5. `/organizations/:id` is the organization's story
   (`docs/superpowers/specs/2026-09-26-organization-detail-design.md`). It lands
   in four requests: `GET /organizations/portfolio/?ids={id}&include_churned=1`
   (the List's own row: the name row and the tiles), `GET /customers/{id}/`
   (the health breakdown and the edit form), `GET /customers/{id}/accounts/`
   (the account chips) and `GET /organizations/{id}/story/` (the Story). The
   tabs, in the URL as `?tab=`, are Story, Details (the connected accounts as
   list items linking to `/accounts/:id`, with Add and Edit; then the List's six
   panels; then the email, phone, industry and CSAT response bands from
   `GET /customers/{id}/`; then `AIAttributesPanel`), People (contacts), Deals & risks (opportunities and
   risks), Knowledge (Company View, then headlines) and Files (files, then
   CallSense calls); the last four read their data when first opened. The
   account chips (`?account=`, an id or `none`) filter the Story, whose filters
   (`group`, `source`, `q`) live in the URL too. "+ Add" logs a call or a
   survey, or creates a task or a note, with the existing forms, on the chosen
   account when there is one; an email opens its thread; any other item opens
   in place, with its link when it has one. Edit opens `OrganizationFormModal`;
   ⋯ archives (`POST /organizations/bulk/`) or churns
   (`ChurnOrganizationModal`). A tile jumps to its Details panel; Health opens
   its breakdown. An id that is not a number, or one the viewer cannot see,
   says "Organization not found".
6. Ask Revenact on this page is delivery 3 of that spec; there is no Ask link
   here meanwhile.
```

Replace:
```markdown
Shared by both detail pages. Five top tabs and thirteen filter chips.
```
with:
```markdown
The account page's (`/accounts/:id`) feed. The organization page replaced it
with the Story (§ Organizations, step 5). Five top tabs and thirteen filter
chips.
```

In the placeholders table, replace:
```markdown
| Success Plans tab on both detail pages | "Coming Soon" |
| Activity feed: Pulse, Conversations, Revenact Support | "coming soon" |
| Activity feed: search box, "Add Action", filter icon | No handler |
```
with:
```markdown
| Success Plans tab on the account page | "Coming Soon" |
| Account page feed: Pulse, Conversations, Revenact Support | "coming soon" |
| Account page feed: search box, "Add Action", filter icon | No handler |
```

- [ ] **Step 2: `docs/03-ui-ux-design.md`**

Replace:
```markdown
### Overlays

`HealthPopover` (five real rubric components with weights), `CsatPopover`
(response bands at true scale), the Organizations
`FiltersPanel` and `PinFieldsMenu`, `ContactRowActionsPopover`, and the Navbar's notification
and account menus. All close on an outside `mousedown`.
```
with:
```markdown
### Organization page (`/organizations/:id`)

The organization's story, framed like the list (transparent top bar with
"‹ Organizations", `OrganizationsFrame`, no rail until Ask arrives in delivery 3).
Rules specific to it, enforced by `components/organizations/detail/houseRules.test.ts`
(which also scans `pages/organizations/Details.tsx`):

- Name row: initials in a `bg-subtle` circle (never a third-party logo), the
  name at 22px, "owner · lifecycle · Touched Nd ago" at 13px, the signal tag,
  then Edit and a ⋯ menu (Archive, Churn while they apply).
- Tiles: Health (ring and trend; opens the five-part breakdown below the
  tiles), ARR (in the customer's own currency), Renewal (runway) and Pulse
  ("AI n · CSM n", dots, "pulses disagree"). Each is a button; the last three
  jump to their Details panel. A grid of four from `sm`, a snapping strip below.
- Account chips (All, each account, Organization) carry only a name and the
  story's count; the chosen one is `bg-accent text-on-accent`.
- Details opens with Accounts: one `bg-surface` list, an item per connected
  account (name linking to its page, owner · domain, "AI n", the AI label,
  the pulse dots, the AI reason, Edit), with Add account in its heading.
  Under the six panels, in the same surface, "Contact and CSAT": email and
  phone as links, industry, and the CSAT bands as bars at their true share.
- The one primary on the Story is "+ Add" (`PRIMARY` in `portfolio/styles.ts`:
  `bg-accent text-on-accent`, never layered on the surface button).
- Tabs are a real tablist (`role="tab"`, roving tab index, arrows, Home, End),
  underlined like the Navbar's views.
- Story: Needs attention (each row says what it is in words and goes to it),
  the filters with counts, Sources, search and "+ Add", then the stream: days
  as small uppercase headings, each day one `bg-surface` list with dividers,
  in the Communications inbox's manner. An item is a Lucide icon in a circle,
  its title, the time in DM Mono, a one-line summary, then the account tag and
  "kind · who · via source". No card in a card.
- Every one of the 34 table fields renders once across the name row, the
  tiles and Details (`detail/fieldCoverage.test.tsx`).

### Overlays

The Organizations `FiltersPanel` and `PinFieldsMenu`, `ContactRowActionsPopover`,
the organization page's `Menu` (⋯ and + Add) and `SourcesPicker`, and the Navbar's
notification and account menus. All close on an outside `mousedown`; the
organization page's also close on Escape and hand focus back to their button.
The organization page's `Sheet` (+ Add, an email's thread) is modal: a
right-hand panel from `sm`, a bottom sheet below it, with a focus trap, the
page's scroll locked, and focus returned to what opened it.
```

Replace:
```markdown
`ActivityFeed` is the largest shared component: five top tabs (Activity Feed,
Headlines, Overview, Files, CallSense) and thirteen filter chips.
```
with:
```markdown
`ActivityFeed` (the account page only, since the organization page's Story
replaced it there) is the largest shared component: five top tabs (Activity
Feed, Headlines, Overview, Files, CallSense) and thirteen filter chips.
```

In §10, replace:
```markdown
and follows a swipe. Cards do not drag there; each card's Move to… menu moves
it, and a tapped card opens in the bottom sheet. Every control is 44px.
```
with:
```markdown
and follows a swipe. Cards do not drag there; each card's Move to… menu moves
it, and a tapped card opens in the bottom sheet. Every control is 44px.

The organization page below `sm`: the name row, the tiles as a strip that
snaps sideways, the account chips and the tabs each scroll sideways in their
own row, and the content is full width. "+ Add" and an email's thread open as
bottom sheets. Every control is 44px.
```

In §12, replace:
```markdown
| 11 | Navbar and ActivityFeed have controls with no handlers | Search, Plus, Help, Message, feed search, "Add Action", title chevrons |
```
with:
```markdown
| 11 | Navbar and the account page's ActivityFeed have controls with no handlers | Search, Plus, Help, Message, feed search, "Add Action", title chevrons |
```

- [ ] **Step 3: `.agents/workflows/repo-architecture.md`**

Replace:
```markdown
│   └── :id                    → Organization Details page (full detail)
```
with:
```markdown
│   └── :id                    → Organization page (Details.tsx: the story, on GET /organizations/{id}/story/)
```

Replace everything from the heading `#### Details View (\`pages/organizations/Details.tsx\`)` down to (not including) the `---` line above `### 4. Accounts (\`pages/accounts/Details.tsx\`)` with:
```markdown
#### Details View (`pages/organizations/Details.tsx`)
The organization's story (spec `docs/superpowers/specs/2026-09-26-organization-detail-design.md`,
delivery 1). It draws itself in `OrganizationsFrame` (no rail until delivery 3).

- **Reads:** `useOrganization` (the portfolio row by `ids` plus `GET /customers/{id}/`),
  `fetchAccountsForCustomer` (the chips) and `useStory` (`GET /organizations/{id}/story/`,
  cursor-paged). Four requests on landing; the other tabs read when first opened.
- **URL state:** `useDetailParams` (`features/organizations/detailParams.ts`):
  `tab`, `account`, `group`, `source`, `q`.
- **Header:** `OrganizationHeader` (initials, name, owner · lifecycle · last touch,
  signal, Edit, ⋯ Archive/Churn) and `HeaderTiles` (Health with `HealthBreakdown`,
  ARR, Renewal, Pulse; each of the last three jumps to its Details panel).
- **Story:** `StoryTab` → `AttentionBlock`, `StoryToolbar` (filters, `SourcesPicker`,
  search, + Add via `Menu`), `StoryStream` → `StoryItemRow`; `EmailThread` and
  `AddFlow` open in a `Sheet`. `AddFlow` reuses `TaskForm`, `NoteForm`, `CallForm`
  and `LogSurveyForm` from `components/organizations/activity/`.
- **Other tabs:** `DetailsTab` (`AccountsSection`, portfolio `AccountDetails`, `CustomerFacts` + `AIAttributesPanel`),
  `PeopleTab` (`ContactsTab`), `DealsTab` (`PipelinesTab`), `KnowledgeTab`
  (`CompanyViewTab` + `HeadlinesTab`), `FilesCallsTab` (`FilesTab` + `CallSenseTab`).
- **Tests:** unit tests beside each part in `components/organizations/detail/`, the
  house-rules scan and field coverage there, `Details.test.tsx` (integration with
  `testDetail.tsx`'s `renderOrganizationPage` and `testStory.ts`'s
  `stubOrganizationPage`), and `src/e2e/organizationDetail.test.tsx`.
```

Replace:
```markdown
  ├── pages/organizations/Details.tsx & pages/accounts/Details.tsx
  │     ├── components/shared/PinnedAttributes
```
with:
```markdown
  ├── pages/organizations/Details.tsx  (portfolio row, /customers/{id}/, accounts, /organizations/{id}/story/)
  │     ├── OrganizationsFrame; components/organizations/detail/* (OrganizationHeader, HeaderTiles,
  │     │     AccountChips, DetailTabs, StoryTab → AttentionBlock, StoryToolbar, StoryStream, EmailThread, AddFlow, Sheet)
  │     ├── Details: detail/AccountsSection + portfolio/AccountDetails + detail/CustomerFacts + shared/AIAttributesPanel
  │     └── People, Deals & risks, Knowledge, Files: shared/ContactsTab, shared/PipelinesTab,
  │           CompanyViewTab + activity/HeadlinesTab, activity/FilesTab + activity/CallSenseTab
  │
  ├── pages/accounts/Details.tsx
  │     ├── components/shared/PinnedAttributes
```

- [ ] **Step 4: Check the old wording is gone, and commit**

Run: `grep -n "dispatches six parallel fetches\|HealthPopover\|CsatPopover\|Organization Details page (full detail)" docs/04-app-flow.md docs/03-ui-ux-design.md .agents/workflows/repo-architecture.md || echo updated`
Expected: `updated`.

```bash
git add docs/04-app-flow.md docs/03-ui-ux-design.md .agents/workflows/repo-architecture.md
git commit -m "docs(organizations): app flow, UI/UX and architecture for the organization page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Full checks

**Files:** none, unless a check fails. A fix goes back into the task that owns the behaviour and gets its own commit.

- [ ] **Step 1: Static and test gates**

Run each and read the output:
```bash
npm run lint                              # expected: 0 errors; no new warnings in files this plan touched
npx tsc -b --noEmit                       # expected: no output
npx vitest run --maxWorkers=2             # expected: every file passes, including src/e2e/organizationDetail.test.tsx
npm run build                             # expected: vite build completes
```
To check the warnings: `npx eslint $(git diff --name-only main -- 'src/**/*.ts' 'src/**/*.tsx')` reports none.

- [ ] **Step 2: The house anti-slop scan on the touched files**

```bash
git diff main --name-only --diff-filter=AM -- 'src/**/*.tsx' | grep -v '\.test\.' | xargs grep -nE '#[0-9a-fA-F]{3,6}\b|rgba?\(|text-white|text-(blue|rose|purple|amber|emerald|red|green)-|clearbit|pravatar' || echo "no raw colours or third-party images"
```
Expected: hits only in `src/components/organizations/activity/*.tsx`, `src/components/layout/Navbar.tsx`, `src/pages/surveys/SurveysPage.tsx` `src/components/contacts/ContactRowActionsPopover.tsx` (Task 18 edits a comment there; its `rgba` shadow is older) and `src/components/organizations/ConfirmDialog.tsx` (Task 16 gives its backdrop `bg-scrim`; its danger button's `bg-danger text-white` is the app-wide pattern, as there is no `on-danger` token yet) from lines this plan did not write (their existing classes), or `no raw colours or third-party images`. Anything in `src/components/organizations/detail/` or `src/pages/organizations/Details.tsx` is a failure to fix; `detail/houseRules.test.ts` already enforces them.

- [ ] **Step 3: The removals held**

```bash
grep -rnE "ActivityFeed|PinnedAttributes|SlackTab|logo\.clearbit|pravatar|Enable new 360 UI|Ask Copilot" src/pages/organizations/Details.tsx src/components/organizations/detail || echo "removed"
grep -rn "HealthPopover\|CsatPopover" src || echo "deleted"
```
Expected: `removed` and `deleted`.

---

### Task 22: Browser check at desktop and 375px, both themes (controller)

**Files:** none, unless a check fails (then fix it in the owning task, with a commit). The controller does this task, not a subagent.

- [ ] **Step 1: Run both apps**

- Backend: `../revenact-backend` with the story endpoint merged (the companion backend PR), on `http://localhost:8000`, seeded with an organization that has two accounts, a synced email thread on one account, a Zendesk ticket, a call with a CallSense summary, an overdue task, an unanswered Knowledge question and a month of HealthSnapshots; and one archived, one churned organization.
- Frontend: `npm run dev` (Vite on `http://localhost:5173`), signed in once as a CSM with `view_all_accounts` and once as a CSM without it (to see a withheld anomaly title and department-scoped tickets).

- [ ] **Step 2: Desktop, 1440×900, light theme**

Drive it with `npm run pw` (playwright-cli) or Claude in Chrome. From `/organizations/list`, open the seeded organization:
1. The top bar is transparent: "‹ Organizations", then the bell, no avatar, no bordered bar. No page-level horizontal scroll. DevTools' Network tab shows four requests on landing.
2. The name row: initials (no image), the name, "owner · lifecycle · Touched Nd ago", the signal, Edit and ⋯. The tiles agree with the List's row for the same organization (health, trend, runway, pulse); ARR is in the customer's currency.
3. Health opens the five-part breakdown; ARR, Renewal and Pulse land on their Details panels with a focus ring on the panel. Details opens with Accounts: each connected account as an item (name, owner, domain, AI score and reason, pulse dots), its name opening `/accounts/:id`, Edit and Add account opening the account form. Under the six panels, "Contact and CSAT" shows the email, phone and industry and the CSAT bands.
4. The chips read "All n · <accounts> · Organization n"; choosing one narrows the story and puts `?account=` in the URL; refresh keeps it. Add account and Edit <account> open the account form.
5. Needs attention shows each row in words; its rows go to Tickets, Tasks & notes, Knowledge and the contract panel.
6. Filters, Sources and search each narrow the story and survive a refresh and Back. Clear filters empties them.
7. + Add → New task saves and the task appears at the top of the story (on the chosen account when one is chosen); likewise New note, Log a call and Log survey.
8. The email opens its thread (only real messages, oldest first); Escape returns focus to the email. The ticket opens in place with "Open in Zendesk" (new tab).
9. Scroll to the end: the next page loads before the end; Show more is still there.
10. Tab through the page: every tile, chip, tab (arrows move), filter, menu item and story title shows a focus ring.
11. "+ Add" is the accent button (dark text on light in dark mode, light on dark in light mode), never a pale label on a pale fill.
12. ⋯ → Archive shows the reason if refused; on the archived organization ⋯ offers only Churn; the churned one offers only Archive.

- [ ] **Step 3: Phone, 375×812, light theme**

1. Name row, tile strip (snaps sideways), chips and tabs each scroll in their own row; no horizontal page scroll. On Details, each account item wraps (Edit under its details) with no sideways scroll.
2. + Add and an email open as bottom sheets with a focus trap; the page behind does not scroll.
3. Every control is at least 44px (chips, filters, tabs, Sources, Add, menu items, Close).

- [ ] **Step 4: Dark theme, both widths**

Switch the theme in Settings > Personalization and repeat 2.1-2.8 and 3.1-3.2. Check that tiles, chips (the chosen one is ink on white), the stream, the breakdown bars, the sheet and its scrim all use tokens (nothing stays light), and danger, warning and success tones stay readable on `bg-surface`.

- [ ] **Step 5: Record and stop**

Save screenshots at 1440 and 375 in both themes for the PR description. Then the branch is ready for `superpowers:finishing-a-development-branch`. Do not push.

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| §1 Purpose, Accounts ("one story, filtered by account"), Layout (six tabs), Pulse (the List's form) | 6, 7, 10, 14, 16 |
| §1.1 Frame: Organizations frame, transparent top bar, `p-0` (rail is delivery 3) | 16, 17 |
| §1.2 Name row: initials, name, owner · lifecycle · touched, signal, Edit, ⋯ Churn/Archive gated as on the List | 5, 16 |
| §1.3 Tiles: Health (ring, trend, breakdown), ARR (customer's currency), Renewal (runway), Pulse (AI · CSM, dots, disagree); jump to Details; phone strip | 6, 16 |
| §1.4 Account chips with `by_account` counts, `?account=` | 7, 16 (pre-flight 6-8) |
| §1.5 Tabs: real tablist, `?tab=`, horizontal scroll on phones | 2, 7, 16 |
| §1.6 Needs attention (renewal, open High/Critical tickets, overdue tasks, questions, anomaly with a server-withheld title), in the backend's `attention` keys | 8, 14 (pre-flight 10) |
| §1.6 Filters, Sources, search | 1, 2, 9, 14 |
| §1.6 + Add with the existing create flows | 12, 13, 14 |
| §1.6 Stream: by day (`all_day` aware), Lucide icons, account tag, one-line summary, who, time; CallSense summary on calls; email thread via `?thread=`; other items' detail with `link.url`; paging | 10, 11, 14 (pre-flight 13-15, 24, 25) |
| §1.7 Details: the connected accounts as items (owner's decision, 2026-09-26), the List's six panels, stacked on phones, Edit details; §2's email, phone, industry and `csat_breakdown` (`CustomerFacts`) | 15, 16 (pre-flight 8, 18) |
| §1.8 People, Deals & risks, Files: current content in the new frame | 15 |
| §1.9 Knowledge: today's Company View | 15 |
| §1.10 Removals (Slack, fake Pulse, invented NPS, placeholders, 360 toggle, dead controls, Clearbit/pravatar, pinned panel, All-attributes modal, Overview) | 16, 18, 21 (pre-flight 19) |
| §1.11 Phones: conditional layouts, full-width content (Ask sheet is delivery 3) | 3, 6, 7, 9, 16, 22 |
| "Where today's 13 feed filters go" | 1 (kinds and groups), 15 (Files holds CallSense; Headlines under Knowledge), pre-flight 11 |
| §2 Header reads, accounts, story endpoint (params incl. `thread`, response incl. `by_kind` and `all_day`, paging, `link` object, 404), existing endpoints stay, landing cost | 1, 4, 11, 16 |
| §4 delivery 1 frontend | whole plan |
| §5 Unit tests (tiles, chips, stream item, attention, filters, Sources) | 5-11, 13, 14 |
| §5 Integration through the real store and router, `fetch` mocked in §2 shapes | 16 (and 4, 12-15) |
| §5 jsdom e2e: open, filter by account, open an email, add a task, see it | 19 |
| §5 House-rules scan and field coverage for Details | 3, 15, 16 |
| §5 Browser check, desktop and 375px, both themes | 22 |
| Docs | 20 |
| Full checks | 21 |

**Placeholder scan:** no step says "TBD", "handle edge cases" or "similar to Task N". Every code step has its code; every test step has its test; every edit names the exact text it replaces, or the exact start and end of the block it replaces where the old block carries trailing whitespace (the Navbar branch, the `Details View` section).

**Type consistency, checked across tasks:**
- `StoryGroup`, `StoryKind`, `StoryActor`, `StoryLink`, `StoryItem`, `StoryAttention`, `StoryCounts`, `StoryResponse` (Task 1) mirror the backend (`items.py`, `build.py`, backend plan Task 7) and are used by Tasks 2, 4, 8-11, 14 and the stub. `STORY_GROUPS`, `STORY_KINDS`, `KIND_GROUP`, `KIND_NAME`, `kindsIn`, `offeredSources`, `sourceName`, `isStoryKind`, `isStoryGroup`, `ADD_FLOWS`, `AddKind` (Task 1) are used by Tasks 2, 9, 10, 11, 13, 14.
- `storyQuery(f: StoryFilters, limit?)` and `fetchStory(orgId, query, cursor?)` (Task 1) are used by `useStory` (Task 4) and the page (Task 16) with `storyFilters(params)` (Task 2); `fetchThread(orgId, threadId)` (Task 1) by `EmailThread` (Task 11), which `StoryTab` (Task 14) opens only for an email whose `link.thread_id` is set.
- `dayKey`, `timeLabel` and `groupByDay` (Task 2) take items (`{occurred_at, all_day}`), as `StoryItemRow` and `StoryStream` (Task 10) pass them.
- `DetailParams`, `DetailTab`, `DETAIL_TABS`, `parseDetailParams`, `withPatch`, `hasStoryFilters`, `detailTabId`, `detailPanelId` (Task 2) are used by Tasks 7, 8, 14 and 16; `useDetailParams().update(patch, {replace})` is `StoryTab`'s `onUpdate`.
- `useOrganization(id, version)` → `{row, customer, loading, notFound, error, customerError, retry}` and `useStory(orgId, query, version, enabled)` → `StoryState` (Task 4) are used by the page (Task 16); `StoryState` by `StoryStream` (Task 10) and `StoryTab` (Task 14).
- `Sheet({title, description, isSm, onClose, children})` (Task 3) is used by `EmailThread` (Task 11) and `AddFlow` (Task 13). `Menu({label, trigger, triggerClassName, items, align})` (Task 5) is used by `OrganizationHeader` (Task 5) and `StoryToolbar` (Task 9).
- `HeaderTiles`' and `AttentionBlock`'s `onJump(panel: PanelKey)` meet the page's `jumpTo` (Task 16); `AttentionBlock`'s `onFilter(group)` and `onOpenTab(tab)` meet `StoryTab`'s `onUpdate({group})` and the page's `update({tab})`.
- `TaskForm`, `NoteForm`, `CallForm`, `LogSurveyForm` (Task 12) take `onDone`/`onLogged`, which `AddFlow` (Task 13) passes as `onAdded`.
- `makeDetailStore()` (Task 12) is used by Tasks 13-16 and the moved tests; `renderOrganizationPage(url, {width, nav, list})` (Task 16) by Task 19.
- `stubOrganizationPage`, `storyQueries`, `portfolioRequests`, `postBodies`, `requestPaths` (Task 1) take the stub's spy structurally (`Calls`), so no test mixes it with `testPortfolio`'s typed spy helpers.
