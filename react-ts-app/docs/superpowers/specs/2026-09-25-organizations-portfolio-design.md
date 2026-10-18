# Organizations portfolio — design

Date: 2026-09-25. This covers the redesign of `/organizations` (the list and the board). The organisation detail page (`/organizations/:id`) gets its own spec after this one.

## Goal

Replace the spreadsheet-style Organizations table with an app-ready portfolio view that:

- keeps every piece of information the table shows today (all 34 fields),
- keeps the Board,
- serves four jobs: scan the portfolio, find and open one account, manage in bulk, and compare segments,
- brings the Ask Revenact rail onto the page, as on Dashboard and Communications, grounded in the accounts in view.

"App-ready" means every surface is built from components that map one-to-one onto a phone layout. There are no grid lines, no frozen columns and no horizontal-scroll tables.

## Decisions (agreed 2026-09-25)

| Question | Decision |
|---|---|
| Which page first | The list (with the board). The detail page follows in its own spec. |
| Layout | **Portfolio rows**: one rounded list item per account, grouped into sections. |
| Row content | All eight elements: (1) health ring + score, (2) owner · lifecycle under the name, (3) 6-month health trend line, (4) renewal runway bar, (5) ARR, (6) CSM vs AI pulse, (7) last touch, (8) one signal tag. |
| Spreadsheet feel | None. Each row is a card-like item. On phones the same component becomes a two-line card. |
| The other fields | Nothing is lost. Opening a row reveals all remaining fields in six visual panels. Any field can be pinned onto the row as a chip, and used to sort, group or filter. Every field is in Export. |
| Board | Kept, using the same card. It groups by lifecycle by default and can group by owner, health or any categorical field. The 25-account cap is fixed. |
| Summary strip | Keeps everything shown today (health split, NPS, lifecycle mix, count and ARR, renewals). Each tile filters the list on click, and its numbers follow the filters. |
| Filters | Real and URL-based, shown as removable chips with an "N of M organizations" count. They replace the dead Filter button and the dead sort arrows. |
| Bulk work | Selection mode (checkbox, or long-press on phones) with an action bar: Change owner, Set lifecycle, Export, Archive, Churn. |
| Ask Revenact | The rail and pill are the same as on Dashboard and Communications. A new copilot surface, `organizations`, is grounded on the server in the filtered list. Opening a row focuses the question on that account. |
| Data approach | **A**: a new endpoint built for this page, `GET /api/v1/organizations/portfolio/`. `/customers/` stays unchanged for its other consumers. |

## 1. Page anatomy (desktop)

```text
[Organizations]  [List | Board]                        [ New chat · History · ✦ ]  [bell]
┌ Summary tiles (5, clickable) ───────────────────────┐ ┌ Ask Revenact rail ┐
│ Health · NPS · Lifecycle · Accounts·ARR · Renewing   │ │  (glass, 320px,   │
├ Toolbar ─────────────────────────────────────────────┤ │   same as         │
│ Search · Group ▾ · Sort ▾ · Filters · Export · + Add │ │   Communications) │
├ Filter chips · "3 of 12 organizations" ──────────────┤ │                   │
│ ▸ Needs attention · 2 · $164.6K                      │ │                   │
│   (row) (row)                                        │ │                   │
│ ▸ Healthy · 5 · $444K                                │ │  [Ask Revenact]   │
│   (row) …                                            │ └───────────────────┘
└──────────────────────────────────────────────────────┘
```

The frame matches Communications and the Dashboard:

- a transparent top bar containing the title, the List/Board switch, the pill (New chat · History · ✦) and the bell;
- a full-height, 320px glass rail on the right, which ✦ hides completely;
- the content column scrolls on its own.

### Account row (`AccountRow`)

The row is a rounded item on `bg-surface`, shown as a hover-raised list item, with no borders between cells. From left to right:

1. **Selection checkbox**, visible in selection mode or on hover.
2. **Health ring** with the score in DM Mono. The ring colour is Good, Average or Poor from `HEALTH_COLORS`, and the score text carries the meaning as well as the colour.
3. **Name**, with **owner · lifecycle · touched Nd ago** beneath it at 11px muted.
4. **Trend**: a 6-month sparkline of health score from snapshots, coloured by the current category. Its accessible label is "Health falling from 6.2 to 4.9 over 6 months".
5. **Renewal runway**: a bar filling toward the renewal date. It turns danger-coloured with the text "Nd overdue" when overdue, and shows "in Nd" otherwise.
6. **Pinned chips**: zero to three user-pinned fields, for example "NPS −80" or "Seats 16%".
7. **ARR**: DM Mono, in the organisation currency.
8. **Pulse**: "AI n · CSM n". When they differ by 2 or more, a "pulses disagree" marker shows as text, not colour alone.
9. **Signal tag**: at most one. Priority is renewal overdue, then risk ≥ 40 ("Risk NN"), then open High/Critical tickets ("N open tickets"), then none.
10. **Open control** (chevron). It expands the row inline on desktop and opens a bottom sheet on phones.

Clicking the name navigates to `/organizations/:id`. Clicking elsewhere on the row opens it.

### Opened row (`AccountDetails`)

The opened row holds six panels in a responsive grid: 3 columns at xl, 2 at md, 1 on phones. Every current table field appears exactly once:

| Panel | Fields | Visual form |
|---|---|---|
| Commercial | ARR billed at account, ARR billed at HQ, Total Contract Value, Forecasted Renewal Revenue, Implementation Fee | label/value pairs (DM Mono) |
| Contract timeline | Joined Date, Contract Start, Renewal Date, Contract End | a horizontal timeline with a "today" marker; renewal is danger-coloured when overdue |
| Adoption | Total Contracted Seats, Total Active Seats, Seat Usage Utilisation, Total Hires, Products Utilized, Scope WebApp | seats meter (active/contracted), product chips, values |
| Voice of the customer | NPS, CSAT, CES %, AI Pulse Reason | NPS promoter/passive/detractor bar, values, the reason as a quote |
| Profile | Revenact ID, Domain, Name / Address, Top Source Channel | label/value pairs |
| History | Created by/date, Modified by/date, Churn Date, Churn Reason, Churn Comment | label/value pairs; the churn fields show only when churned |

Fields from the old table that sit in the row header rather than a panel: Organization, Owner, Lifecycle Stage, Health, Pulse, AI Pulse Score.

### Board (`PortfolioBoard`)

- **Columns** are the groups: lifecycle stage by default, with owner, health or renewal window as alternatives. Each column header shows its count and ARR.
- **Cards** use the phone-card layout of `AccountRow`: ring, name, owner, ARR, signal tag, trend.
- **Loading**: each column loads more as it scrolls (paginated per column), so there is no cap.
- **Drag**: dragging between lifecycle columns changes the stage, as today. Dropping into Churn opens the existing churn modal.
- **Other groupings**: when grouped by anything other than lifecycle, drag is disabled.

Decided with the owner on 2026-09-26 (delivery 2):

- **Shared top of the page**: the Board uses the List's frame, tiles, toolbar, filters, chips and "N of M" count. Filters live in the URL, so switching tabs keeps them. Group defaults to **lifecycle** on the Board (health on the List).
- **Columns**: each column is one `usePagedPortfolio` read (`group_value=<key>`) that loads its next page when its end scrolls into view. Grouped by lifecycle, every stage gets a column, empty ones included, so there is always a drop target.
- **Card click**: opens the six detail panels in a side panel on the right (a bottom sheet on phones), so the board stays in place. The account name still links to `/organizations/:id`.
- **Moving an account**: drag between lifecycle columns, or use the card's **Move to…** menu (the keyboard and touch path). The card moves optimistically, saves through the single-customer update, and returns to its column with a message if the save fails. Moving into Churn opens `ChurnOrganizationModal` instead. Moving is off for other groupings.
- **Phones**: columns become full-width panels you swipe between, with a strip of stage tabs to jump to one.
- **Chrome**: the Board gets the transparent top bar and the frame's (empty) rail slot, like the List. `MetricsPanel` and `RenewalPopover` retire with this delivery. `KanbanBoard` stays for Pipelines.
- **Backend**: none. The portfolio endpoint's `group_value` and cursor already page each column.

### Selection mode (`SelectionBar`)

- **Entry**: tick a checkbox, or long-press a row on phones.
- **The bar**: shows "N selected" with Change owner, Set lifecycle, Export (selected), Archive, Churn and ✕.
- **Scope**: actions apply to the selected ids, and the bar reports partial failures per account.
- **Exit**: selection clears when filters change.

### Summary tiles (`SummaryTiles`)

There are five tiles, computed by the server for the current filters:

1. **Health**: counts per category, with a Count/MRR/ARR switch as today. Clicking a segment filters to that health band.
2. **NPS**: the score plus a promoter/passive/detractor bar. Clicking a segment filters by NPS band.
3. **Lifecycle**: a mini bar per stage. Clicking a bar filters to that stage.
4. **Accounts · ARR**: the count and total ARR.
5. **Renewing**: the count within 30 or 90 days, chosen by a switch. Clicking filters to `renews_within`.

### Toolbar, filters, sort, group

- **Search** covers name, Revenact ID and external ID.
- **Group**: none, health (the default, with sections Poor, Average, Good in that order), owner, lifecycle, product, or renewal window. Each section header shows its count and ARR.
- **Sort**: ARR, health score, renewal date, last touch, risk, name, or any numeric field.
- **Filters** (sheet or popover): owner (including Unassigned), lifecycle (multi), health (multi), product (multi), renews within 30/90/180 days, NPS band, and "includes churned".
- **URL state**: every filter, sort and group lives in the URL. `?ids=` from the dashboard's "Open as a list" still works, shown as a chip "Opened from the dashboard (N)".
- **Pin a field**: this replaces the old "Edit columns" popover. The user picks up to three fields to show as row chips, remembered per user in localStorage (wrapped in try/catch).
- **Export**: a CSV of the current query with all 34 fields.
- **+ Add organization**: the existing create flow.

### Phones (< 640px)

- Rows become two-line cards: the ring, name and owner on top, and ARR with the signal tag and trend below.
- The toolbar collapses to Search plus a Filters sheet, with group and sort living inside the sheet.
- The summary tiles become a horizontally swipeable row of five.
- An opened row appears as a bottom sheet.
- Ask Revenact is a full-screen sheet opened from ✦.
- Long-press starts selection mode.

### House rules

- Tokens only.
- One monochrome primary; semantic colour means status only.
- Numbers in `font-mono-brand tabular-nums`.
- Type sizes 11/13/15/22 only (retiring the 16 sizes in use today).
- No card-in-card: rows are items on the page background, and the opened row is part of its row.
- Glass only on the Ask rail.
- Loading skeletons shaped like rows, cards and tiles.
- Designed empty states ("No organizations match these filters", with Clear filters) and error states.
- Hover, focus-visible, active and disabled states throughout, with a 44px touch target on phones.
- Reduced-motion respected.

## 2. Backend — `GET /api/v1/organizations/portfolio/`

- **Auth**: `IsAuthenticated`.
- **Scope**: `visible_customers(user)`, excluding archived. Churned customers are included only when `lifecycle` includes `churn` or `include_churned=1`, matching today's list.
- **Query parameters** (unknown values are ignored, as the dashboard endpoints do):

| Param | Meaning |
|---|---|
| `search` | name / Revenact ID / external ID, case-insensitive contains |
| `owner` | user id or `unassigned` |
| `lifecycle` | comma list of stages |
| `health` | comma list of `good,average,poor` |
| `product` | comma list of product ids |
| `renews_within` | `30`, `90`, `180` (days, overdue included) |
| `nps` | `promoter`, `passive` or `detractor` band |
| `ids` | comma list, max 500. Archived customers named in the list are included, as on `/customers/?ids=`. |
| `include_churned` | `1` |
| `sort` | `arr`, `health`, `renewal`, `touch`, `risk`, `name`, or a numeric field key; `-` prefix for descending. Default `-arr`. |
| `group` | `health`, `owner`, `lifecycle`, `product`, `renewal`, or empty |
| `group_value` | restrict to one group (used by board columns) |
| `cursor`, `limit` | cursor pagination; `limit` defaults to 50, max 100 |

**Response `200`:**

```json
{
  "results": [ {
    "id": 7, "name": "Pizza Hut", "initials": "PH",
    "owner": {"id": 2, "name": "Carl CSM"} ,
    "lifecycle": {"value": "live", "label": "Live"},
    "health": {"score": 4.9, "category": "average", "trend": [6.2, 5.8, 5.5, 5.1, 5.0, 4.9]},
    "renewal": {"date": "2026-08-09", "days": -47},
    "arr": 69600.0,
    "pulse": {"csm": 3, "ai": 1, "reason": "…"},
    "last_touch_days": 33,
    "signal": {"kind": "renewal_overdue", "label": "Renewal overdue"},
    "details": { "commercial": {…}, "contract": {…}, "adoption": {…}, "voice": {…}, "profile": {…}, "history": {…} }
  } ],
  "next_cursor": "…",
  "count": 12,
  "groups": [ {"key": "average", "label": "Average", "count": 4, "arr": 244000.0} ],
  "summary": { "health": {"good": 5, "average": 4, "poor": 0, "arr": {…}, "mrr": {…}},
               "nps": {"score": 44, "promoters": 6, "passives": 1, "detractors": 2},
               "lifecycle": [ {"value": "live", "label": "Live", "count": 2} ],
               "accounts": 12, "arr": 688600.0,
               "renewing": {"30": 1, "90": 3} },
  "filters": { "owners": […], "lifecycles": […], "products": […] },
  "currency": "USD"
}
```

**Computation:**

- **Row signals** reuse the dashboard code, so the numbers agree:
  - `with_health_inputs`
  - the health snapshot history (6 months, one query)
  - `services/customers/triage.py` (risk)
  - the last-touch rule from `activity_tracking`
  - open High/Critical tickets through `visible_tickets`
  - ARR converted like the dashboard figures
- **Groups and summary** are computed over the whole filtered set, not the page.
- **The query count is constant per page**, pinned by a test.

**Other endpoints:**

- **Export**: `GET /api/v1/organizations/portfolio/export.csv` takes the same params and returns every row (no pagination) with all 34 fields. Audit event: `organizations.exported`.
- **Bulk edit**: `POST /api/v1/organizations/bulk/` with `{ids, action: "set_owner"|"set_lifecycle"|"archive", value}`.
  - It applies per id using the existing update rules and permissions.
  - It returns `{updated: [...], failed: [{id, reason}]}`.
  - Audit: `organizations.bulk_updated` with the ids and action.
  - Churn keeps its existing modal and endpoint, run per account.

## 3. Ask Revenact on Organizations

- **Frontend reuse**: the rail and pill are reused from `src/components/copilot` and `src/pages/dashboard/ask`. The provider generalises to take a context builder per surface.
- **Context**: `useOrganizationsContext` builds `{surface: "organizations", filters: {...portfolio params except cursor}, focus}`.
- **Focus**: an opened row sets `focus: {kind: "companies", ids: [id]}`, which lasts one question, as on the dashboard.
- **Backend validation**: `DashboardContextSerializer` generalises to a context serializer that accepts `surface ∈ {dashboard, organizations}`. For `organizations`, filters are validated against the portfolio params.
- **Grounding**: a new `organizations_grounding`.
  - It recomputes the filtered list for the asker, reusing the portfolio query code. Visibility comes first.
  - The digest is the summary tiles, the groups, the ten riskiest accounts, renewals inside 90 days, and the filter labels.
  - Records behind the question use the existing retrieval with its per-record rules. Activities are already gated.
  - The prompt fences the digest in `<dashboard_data>`, as today.
  - Metering uses a new purpose, `organizations`.
- **History**: `Conversation.origin` stores the surface and filters. The history tag reads "Organizations · Owner: Carl CSM", and reopening restores the filters on `/organizations/list`.
- **Shared sessions**: unchanged. The existing readability rule for dashboard replies extends to `organizations` replies (the asker's filtered book).

## 4. Delivery

Three PR pairs. In each pair the backend merges and deploys first.

1. **Portfolio data**: the backend endpoint, export and bulk; the frontend list with rows, the opened row, tiles, toolbar, filters, chips, selection mode, pinned chips and phones.
2. **Board** on the portfolio endpoint (per-column pagination and drag). This is frontend-only if the endpoint's `group_value` covers it.
3. **Ask Revenact on Organizations**: the backend surface and grounding; the frontend rail, context, history tag and restore.

## 5. Testing

- **Backend**
  - Row signals equal the dashboard's figures for the same account: health, trend, triage risk, last touch and ARR.
  - Every filter, sort and group, and cursor pagination.
  - Group and summary totals are over the whole filtered set.
  - Customers outside visibility never appear, including via `ids`.
  - A pinned query-count test.
  - Export includes all 34 fields and is audited.
  - Bulk respects permissions and reports partial failures.
  - Ask: surface validation, the grounding digest equals the endpoint, and the privacy rules as on the dashboard.
- **Frontend**
  - Unit and integration tests for each component.
  - Every one of the 34 fields is rendered in either the row header or the opened row, asserted by a test over the field list.
  - Filters round-trip through the URL.
  - Tiles filter on click.
  - Selection mode and bulk results.
  - Board pagination and drag.
  - Phone layouts (cards, bottom sheet, filters sheet).
  - An e2e flow: filter → open → pin → select → board → ask.
- **Browser check**: desktop and 375px, in both themes.

## Out of scope

- The organisation detail page (`/organizations/:id`), which gets the next spec.
- The `/accounts` list (same pattern, later).
- Saved views.
- Streaming Ask answers.
