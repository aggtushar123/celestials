# Brain UI: one frame, top tabs, tiles

Owner's request (2026-10-06): the Brain pages "don't look good". The
navigation is still the original design, the font differs from the rest of the
app, and there is a lot of padding on both sides. The Brain is the product's
main selling point, so it should look elegant. Ask Revenact on the Brain was
approved as the **next** delivery. This spec covers the UI only.

Frontend only. No data, scope, privacy or behaviour changes.

## 0. What exists (origin/main after #115/#116)

- **Pages.** `/brain` (WhatChanged), `/brain/waiting`, `/brain/doing` and
  `/brain/customers` all share one wrapper: `mx-auto max-w-4xl gap-6 px-2 py-4
  sm:px-4 lg:py-6`. Each draws its own `font-display text-[22px]` h1 and an
  inline `ScopeSwitch` at the top right.
- **Sub-pages.** `/brain/requests`, `/brain/anomalies` and `/brain/graph` use
  `p-6 gap-5`, `max-w-6xl` (the graph has no max width) and a bold sans h1.
- **Layout padding.** `DashboardLayout` gives Brain routes
  `p-2 md:p-3 lg:p-4` on `<main>`, which doubles the page's own padding.
- **Navbar.** `isBrainHome` draws a bare "Brain" h1 in the tall, unframed bar.
  Brain is not part of `isFramed`, so it gets no tabs and no actions slot.
- **Sidebar.** Four Brain items: What changed, WaitingNavItem (with the count
  badge), What's being done, What customers are saying (forceActive on
  requests/anomalies).
- **The Organizations pattern.**
  - Framed bar: the title plus underline `NavLink` tabs that keep
    `location.search`.
  - `NavActionsSlotContext`: pages portal their controls into the bar's
    right side, as AskControls does.
  - `OrganizationsFrame`: `px-4 pb-4`, full width.
  - `SummaryTiles` / `tileParts.tsx` (`Tile`, `TileButton`,
    `TilesSkeleton`): a row of KPI tiles.

## 1. Shell

1. **Framed Brain bar.**
   - Add every `/brain*` route to `isFramed`.
   - The new Navbar branch renders an h1 "Brain" and a
     `<nav aria-label="Brain">` with four tabs, using the same classes as the
     Organizations tabs:
     - What changed → `/brain` (active only at exactly `/brain`)
     - Waiting on you → `/brain/waiting`, with the count from
       `useWaitingCount`, shown like the sidebar badge and folded into the
       accessible name as "…, N waiting"
     - What's being done → `/brain/doing`
     - Customers → `/brain/customers`, also active on `/brain/requests*`
       and `/brain/anomalies*`
   - The Knowledge graph (`/brain/graph`) highlights no tab.
   - Tabs keep `location.search`, so `?scope=` carries over. On phones the
     tab row scrolls sideways and never wraps.
   - Remove the old bare "Brain" h1 branch.
2. **The scope switch moves into the bar.** A `BrainControls` component
   portals `ScopeSwitch` into `NavActionsSlotContext`'s slot, the same way
   AskControls does. Each Brain page renders `<BrainControls …>` instead of
   an inline switch.
   - Below `sm`, where the slot may not fit, `BrainControls` renders inline
     at the top of the page instead.
   - Pages that have no scope today keep none.
3. **Sidebar.**
   - One `NavItem` labelled "Brain" (Brain icon) goes to `/brain`, with
     `forceActive` on any path starting with `/brain`.
   - It keeps the waiting badge and its refresh-on-route behaviour.
   - Remove the other three items.
4. **Frame.**
   - Add Brain routes to `DashboardLayout`'s `p-0` list.
   - New `BrainFrame` (in `src/components/brain/BrainFrame.tsx`):
     `h-full overflow-y-auto`, inner `flex flex-col gap-4 px-4 pb-6`, full
     width, no `mx-auto` and no max width. This matches `OrganizationsFrame`,
     with a `rail` prop reserved for the Ask delivery.
   - All seven Brain routes use it.
5. **Type.**
   - No `font-display` h1 on any Brain page: the title lives in the bar.
   - Section headings use the tile label style (11px, uppercase, tracking,
     `text-ink-muted`). Body text is 13px. Figures are in DM Mono with
     `tabular-nums`. Tile figures are 22px.
   - At most four sizes per surface: 11, 13, 15, 22.
   - Reading text (brief paragraphs, Watch next) is capped at about 70ch.

## 2. Pages

Each page opens with a row of tiles built from `tileParts` (`Tile` /
`TileButton`). The row is a grid of 2 to 5 columns that scrolls sideways
(snap) below `sm`. The loading state is `TilesSkeleton`. Tiles come from data
the page already loads; there are no new API calls.

- **What changed.**
  - Four tiles from `ChangedPayload.metrics`, in this order: active ARR,
    NRR, ARR at risk, book in good health (the healthy share). The registry
    has no renewals-due metric, so there is no fifth tile.
  - Match by metric key, and skip any the scope doesn't have.
  - Each tile shows the label, now (Figured), the change against then, and a
    sentence direction from `better`. A withheld figure shows "No figure".
  - Body at `lg`: two columns, the Brief (`ScopeBriefCard`, reading width) on
    the left and "What moved" (`MovesList`) on the right. Below `lg` they
    stack.
  - "Every metric" (`MeasureTable`) runs full width beneath.
  - The Knowledge graph link stays as a small link in the toolbar row.
- **Waiting on you.**
  - Four `TileButton`s: Rule reviews, Proposals, Questions, Overdue tasks.
    Each shows its count, is pressed when it's the active filter, and
    pressing it again clears back to All.
  - These replace the chip row. Keep an "All N" control, either a fifth tile
    or a clear link.
  - The list runs full width.
  - "Ask the agent" (Company and view_all only) sits in a toolbar row above
    the list. Its status line is unchanged.
- **What's being done.**
  - Tiles: Initiatives (active, with how many are on track), Open plans (with
    how many are at risk), Rules running (fired last night).
  - Each tile scrolls to its section and sets `?section=`, replacing the
    section links.
  - The three sections follow full width, then Knowledge by function
    (Company only).
- **Customers.**
  - Tiles: Asks (total), Anomalies (total, every status), NPS, CSAT,
    Negative contacts. NPS and CSAT reuse the `ScoresPanel` figures logic,
    including "Not enough answers".
  - At `lg`, Asks and Anomalies sit side by side; below that they stack.
    Scores (with comments) and Sentiment also sit side by side.
  - The section links are replaced by the tiles, each scrolling to its
    section.
- **Feature Requests, Anomalies and Knowledge graph.**
  - They use `BrainFrame`.
  - Their h1 becomes a 15px semibold section title with a back link
    ("Customers" for requests and anomalies; "What changed" for the graph,
    keeping scope).
  - Their scope switch moves to `BrainControls`.
  - Content stays the same, just full width (the graph already is).

## 3. Not changing

Data, API, scope rules, privacy (twice-filter), curation gating, the
delivery 4 stale-scope guards, the graph URL filters, and empty, error and
refusal states (only restyled into the frame).

## 4. Tests

- **Navbar:** the Brain bar renders four tabs on each Brain route, with the
  right one active. The Customers tab is active on requests and anomalies.
  `?scope=` is kept. The waiting badge shows on the tab.
- **Sidebar:** one Brain item, active on every `/brain*` route, with the
  badge.
- **BrainControls:** portals into the slot when there is one, otherwise
  renders inline.
- **Each page:** the tiles render from its payload (including the
  skip-missing-metric and withheld cases). Waiting tiles filter and clear.
  Doing and Customers tiles jump and set `?section=`. There is no
  `font-display` h1.
- **House rules:** the Brain suites stay green, and they gain BrainFrame and
  BrainControls.
- **E2E:** the existing Brain journeys still pass.
- **Browser check:**
  - 1440px and 375px on all seven routes, in light and dark;
  - side gutters measured at 16px;
  - no horizontal overflow at 375px.

## 5. Out of scope

Ask Revenact on the Brain (next delivery: `BrainAskLayout`, surface
`'brain'`, a grounding context, the rail through `BrainFrame`'s `rail` slot),
and any change to what a page shows.
