# Accounts: a portfolio list, the account's story, and Ask

Agreed with the owner on 2026-09-29.

## 0. Why

`/accounts` is a five-column table with stat cards: account, organisation, owner, lifecycle and health. Most of what an account carries never shows. `/accounts/:id` is the old tabbed page: General, Company View, Organizations, Contacts, Pipelines, Custom Objects, Success Plans and Canvas List, with a pinned-attributes panel.

The Organizations pages and Contacts have since been redesigned: portfolio rows instead of a table, filters in the URL, the organisation's story, and the ✦ Ask rail. The owner chose to **mirror Organizations** (2026-09-29). The Accounts list and Board become a portfolio, `/accounts/:id` becomes the account's story, and Ask Revenact follows.

The owner's standing rules apply: app-ready (phones included), never spreadsheet-like, and no information lost.

## Decisions (agreed 2026-09-29)

| Topic | Decision |
|---|---|
| Shape | Mirror Organizations: a portfolio list and Board, and an account story page, reusing the organisation page's parts |
| Scope and order | Three deliveries: (1) list and Board, (2) the account page, (3) Ask on both. Each is a backend PR, then a frontend PR |
| Backend | Account-specific services (`services/accounts_portfolio/`). They reuse Organizations' generic helpers (health and renewal filters, `signal_for`, `snapshot_history`, `triage`, the story sources) and keep account rules and fields their own. A generic "company kind" through every Organizations module was rejected: it couples two sets of rules |
| Frontend | The Organizations portfolio components (row, opened row, board, tiles, toolbar, selection) become kind-agnostic. Each page supplies its own fields, filters and actions |
| No archive or churn | Accounts have neither, so there is no Archive, Churn or churned filter on Accounts |
| Knowledge | Company knowledge is per organisation. The account page has no Knowledge tab; Details links to the organisation's |

## 1. The list and Board (delivery 1)

### Frame
The Organizations frame:
- a transparent top bar with **Accounts**, the **List | Board** switch, the (delivery 3) pill and the bell
- the content column, which scrolls on its own
- an empty 320px rail slot on the right, filled in delivery 3

### Summary tiles (clickable filters)
Health · NPS · Lifecycle · ARR · Renewing within 90 days. A tile sets its filter; tapping it again clears it.

### Toolbar and URL state
- **Search.**
- **Group:** health on the List, lifecycle on the Board. Owner and renewal window are also offered.
- **Sort:** risk, ARR, renewal, health, name.
- **Filters:** organisation, owner (with Unassigned), lifecycle, health, renews within, NPS band.
- **Export CSV** and **+ Add.**
- Every filter, the sort and the group live in the URL. Switching List/Board keeps them. Filter chips and "N of M accounts" sit under the toolbar.

### Row (`PortfolioRow`, kind-agnostic)
A rounded item on `bg-surface`, raised on hover, with no cell borders. Left to right:
1. **Selection checkbox**, in selection mode or on hover.
2. **Health ring**, with the score in DM Mono. The colour is the Good, Average or Poor token, and the score text carries the meaning too.
3. **Name**, with **"Organisation · owner · lifecycle · touched Nd ago"** beneath at 11px muted. An account linked to two or more organisations shows the first one the viewer may open (lowest id) and "+N".
4. **Trend**: a 6-month health sparkline from the account's `HealthSnapshot`s, with the accessible label "Health falling from 6.2 to 4.9 over 6 months".
5. **Renewal runway**: "in Nd", or "Nd overdue" in the danger token.
6. **ARR**: DM Mono, in the workspace's currency (the tenant `Organisation.currency`, as on Organizations).
7. **Pulse**: "AI n · CSM n", with "pulses disagree" as text when they differ by 2 or more.
8. **Signal tag**: at most one, from `signal_for`. Priority is renewal overdue, then risk ≥ 40 ("Risk NN"), then open High/Critical tickets ("N open tickets").
9. **Open control** (chevron).

Clicking the name navigates to `/accounts/:id`. Clicking elsewhere opens the row: inline on desktop, as a bottom sheet on phones.

### Opened row (`AccountPanels`)
Every account field appears exactly once:

| Panel | Fields |
|---|---|
| Commercial | ARR; renewal date on a timeline with a "today" marker, danger-coloured when overdue |
| Voice of the customer | NPS (promoter/passive/detractor bar), CSAT, AI pulse reason as a quote |
| Profile | Revenact ID, domain, industry, email, phone, address, organisation(s) as links |
| History | Created, updated, pulse recorded on |

These fields sit in the row header rather than a panel: name, owner, lifecycle, health, pulse (AI and CSM), ARR, renewal.

### Board
- **Columns:** lifecycle stages. Every stage gets a column, empty ones included. Each column is one paged read (`group_value`) that loads its next page as it scrolls, and its header shows the count and ARR.
- **Cards:** ring, name, organisation, ARR, signal and trend. Clicking a card opens the panels in a side panel (a bottom sheet on phones).
- **Moving an account:** drag between columns, or use the card's **Move to…** menu (the keyboard and touch path). The move is optimistic, saved through the single-account update, and rolled back with a message if it fails. Moving is off when grouped by anything else.
- **Phones:** full-width columns you swipe between, with a strip of stage tabs.

### Selection mode
Tick a checkbox, or long-press on phones. The bar shows "N selected" with **Change owner**, **Set lifecycle** (each with an explicit "Apply to N"), **Export selected** and ✕. Partial failures are reported per account. Selection clears when the filters change.

### Phones (< 640px)
Two-line cards, the opened row as a bottom sheet, and 44px targets. Layouts for phones and desktop are rendered conditionally.

### Retired
`AccountsTable`, `MetricsPanel`, `ActionBar`, and the old `/accounts/stats/` use on this page.

### Backend (delivery 1)
- **`GET /api/v1/accounts/portfolio/`**
  - Returns rows (the header fields), details (the panel fields), groups (key, label, count, ARR), a summary (the five tiles over the whole filtered set) and filter options (organisations and owners the viewer may see).
  - Cursor pages, with `group_value` for a Board column.
- **`GET /api/v1/accounts/portfolio/export.csv`**
  - The filtered set with every field.
  - Formula cells are neutralised, and the export is audited as `accounts.exported`.
- **`POST /api/v1/accounts/bulk/`**
  - Owner and lifecycle for many ids.
  - Each id is checked through `visible_accounts`, and only a user who may reassign may change the owner, as on Organizations.
  - Results are reported per id.
- **Access:** first `visible_accounts(user)`, then each record's own rule for anything counted from records (urgent tickets follow `visible_tickets`). The summary counts only what the viewer can see.
- **Currency:** ARR in the workspace's currency (`Organisation.currency`), as on Organizations.

## 2. The account page (delivery 2)

`/accounts/:id` is **the account's story**: the organisation page's design, scoped to one account.

1. **Frame:** the organisation page's bleed frame (full width, 24px gutter), with the ✦ rail slot for delivery 3.
2. **Name row:**
   - An initials avatar, the account name, then "owner · lifecycle · Touched Nd ago", and the signal tag.
   - **Part of** links beneath. Each opens `/organizations/:id?account=<this>`, with this account's chip chosen. There is one link per linked organisation the viewer may open.
   - **Edit** and **⋯** on the right. ⋯ holds Add contact, Log a call and New task.
3. **Tiles:**
   - **Health:** ring, score, 6-month trend. Tapping it opens the breakdown.
   - **ARR.**
   - **Renewal:** the runway.
   - **Pulse:** "AI n · CSM n", the dots, "pulses disagree".

   A tile jumps to its Details panel. On phones the tiles become a snapping strip.
4. **Tabs:** Story (default) · Details · People · Deals & risks · Files · Custom objects · Canvases. This is a real tablist, with the active tab in the URL (`?tab=`). There are no account chips.
5. **Story:**
   - **Needs attention**, shown only when something needs it:
     - renewal overdue, or due within 30 days
     - open High or Critical tickets (count and oldest age)
     - overdue tasks
   - **Filters:** All · Conversations · Tickets · Tasks & notes · Feedback · Health & usage, plus the Sources picker and search.
   - **+ Add:** Log a call, New task, New note, Log survey. These are the existing account create flows.
   - **Stream:** grouped by day, newest first. Only records filed on this account appear.
6. **Details:**
   - The four panels from §1, with Edit details.
   - The CSAT breakdown.
   - The account's AI attributes (`AIAttributesPanel` with the account id), as on the organisation page's Details.
   - "Knowledge for this account lives on Pizza Hut's page", with a link for each linked organisation.
7. **People:** the account's contacts as list items. A name opens `/contacts/:id`, and the list has a summary line and search.
8. **Deals & risks:** the Opportunities / Risks switch and its list items, as on the organisation page. Adds go to this account.
9. **Files:** Files and Calls sections, as on the organisation page. Uploads and logged calls go to this account.
9a. **Custom objects:** the account's custom object records (the existing `CustomObjectsTab`, which already reads by account id), restyled as list items. The tab's count comes from the tab itself.
9b. **Canvases:** the account's canvases (the existing `CanvasListTab` data), restyled as list items; New canvas opens `/canvas/create` for this account. Read through `GET /accounts/<id>/canvases/`.
10. **Removed:**
    - Company View (its knowledge lives on each linked organisation's Knowledge tab, linked from Details), the Organizations tab (its links move to the name row) and the pinned-attributes panel (its AI attributes move to Details).
    - The Success Plans placeholder. It comes back as a tab when real.
    - Every dead control.
11. **Phones:** the name row, a strip of tiles you swipe, the tabs (scrolling), then full-width content.

### Backend (delivery 2)
- **`GET /api/v1/accounts/<id>/story/`**
  - Returns items, counts and attention, in the organisation story's shapes and with its params (filters, sources, search, cursor).
  - An account scope for the story code (`resolve_account_scope`) gives a 404 when the viewer cannot open the account, whether or not it exists. Each source then applies its own record rule: mail by mailbox owner and chain, tickets by department, notes and tasks by their personal rules.
  - Only records with `account_id` = this account are included.
- **The `/accounts/<id>/…` endpoints** (contacts, opportunities, risks, files, calls, surveys, tasks, notes, canvases) serve the tabs and the create flows. An account filter or field is added only where one is missing.

## 3. Ask Revenact on Accounts (delivery 3)

The ✦ rail and pill on the list, the Board and the account page. There is one conversation across all three, as on Organizations.

- **List and Board:** the context is `{surface: "accounts", view: "list" | "board", filters}`. The server recomputes the asker's filtered accounts with the portfolio code, and the answer draws on the tiles, the sections, the ten riskiest accounts and the renewals due within 90 days.
- **Account page:** the context is `{surface: "accounts", view: "detail", account, focus?}`, where "Ask about this" on a story item sets the focus. The answer draws on the account's row, what needs attention, its last 30 days of story (at most 25 items) and the story item asked about. Each is re-read under its own rule.
- **Privacy, as on the organisation page (#70):**
  - The server builds the chip and History labels ("Accounts · Owner: Carl CSM", "Pizza Hut EMEA").
  - An account or item the asker cannot open is a 400 that reads the same whether it exists or not.
  - Record text is fenced as untrusted.
  - Shared replies snapshot the customer ids, every account covered, and every record quoted (`grounded_records`) and ticket counted. A mentioned-only reader who cannot see them all has the reply withheld; the check fails closed.
  - It is its own `accounts` surface and purpose, "Ask Revenact on Accounts", with a `Skill`.
- **Frontend:** `AccountsAskLayout` wraps the three routes with one `AskProvider`, using the shared `AskRail`, pill and sheet. History reopens `/accounts?<filters>`, `/accounts/board?<filters>` or `/accounts/:id`.

## 4. Delivery

1. **List and Board:** a backend PR (the portfolio, export and bulk), then a frontend PR (the kind-agnostic portfolio components, the Accounts list and Board, the old table and cards retired).
2. **The account page:** a backend PR (the account story and scope, plus any missing account filters), then a frontend PR (the page on the organisation page's parts).
3. **Ask:** a backend PR (the surface and its grounding and snapshots), then a frontend PR (the layout and rail).

Each delivery goes through subagent-driven development, with a review per task, a final whole-branch review, and a controller browser check at 1440px and 375px in both themes. A backend PR merges and deploys before its frontend, unless its change breaks the deployed frontend; then the frontend goes first, tolerating both shapes.

## 5. Testing

- **Backend** (skill `backend-testing`):
  - Unit, integration and e2e tests.
  - Privacy through the "blind to one account" setup: an account the viewer cannot open is absent from rows, summary, groups, export and bulk (404 or skipped per id), and from the story.
  - Mail, ticket, note and task record rules on the story.
  - Query counts pinned flat as rows and records grow.
  - Bulk owner-change gating.
  - The CSV formula neutralising.
  - Delivery 3's Ask privacy and snapshots, as on the organisation page.
- **Frontend** (skill `testing`):
  - Unit tests for the row, the panels, the Board card and the page parts.
  - Integration through the real store and router, with `fetch` stubbed in contract shapes.
  - A jsdom end-to-end journey per delivery.
  - The house-rules suite over the new files.
  - The Organizations pages' existing tests still pass on the kind-agnostic components.

## Out of scope
- Archive and churn for accounts.
- Account-level company knowledge.
- Success Plans as an account tab (it returns when real).
- Scenarios (deferred by the owner, 2026-09-29).

## Revisions
- 2026-09-30 (owner): the old account page's Custom Objects and Canvas List were real, not placeholders, and its pinned panel held real AI attributes. They stay: Custom objects and Canvases tabs, AI attributes on Details, and a flat `/accounts/<id>/canvases/` route.
