---
description: UI/UX design reference for the Revenact frontend — tokens, type, components, interaction rules, accessibility bar and current design debt.
---

# Revenact — UI/UX Design

Current as of 2026-10-09. The authority for any visual change is
`.claude/skills/revenact-design/SKILL.md`, the repo's own design skill, which
also routes to the twenty vendored design skills and settles the conflicts
between them. This document is the readable version of that truth plus a survey
of what the code actually does today.

Companion documents: [App Flow](04-app-flow.md),
[PRD](../../revenact-backend/docs/product/01-prd.md),
[TRD](../../revenact-backend/docs/product/02-trd.md).

---

## 1. Design position

Revenact is B2B customer-success intelligence. Almost every surface is what the
`impeccable` skill calls **Operate mode**: dashboards, tables, detail panes and
editors that someone stares at for hours. **Scanability and consistency outrank
expression.**

Three consequences:

1. Density is a feature. Twelve to thirteen pixel body text and tight rows are
   correct here, not a compromise.
2. Colour carries meaning only. One accent, semantic colours for status, nothing
   decorative.
3. Motion is an explanation, not a flourish. Nothing bounces.

Marketing and auth pages are the one exception, allowed more expression. The
`design-taste-frontend` skill is explicitly **not** for dashboards or data
tables.

---

## 2. Colour system

Defined once, in `src/index.css`, as Tailwind v4 `@theme` tokens. There is no
theme block in `tailwind.config.js`. The token names appear in roughly 4,700
places.

### Tier 0, the source of truth

| Token | Light | Dark | Role |
|---|---|---|---|
| `--color-base` | `#F5F3EF` | `#0B0C0E` | The canvas: warm off-white, with two faint radial gradients (`.rv-canvas`) |
| `--color-surface` | `#FFFFFF` | `#111215` | Cards, tables, inputs |
| `--color-elevated` | `#FFFFFF` | `#16171B` | Modals, popovers |
| `--color-subtle` | `#F0EEEA` | `#18191E` | Hover fills, muted blocks |
| `--color-ink` | `#141413` | `#F3F4F6` | Primary text |
| `--color-ink-muted` | `#6E6D69` | `#9CA3AF` | Secondary text |
| `--color-ink-faint` | `#9E9D98` | `#6B7280` | Hints, eyebrow labels |
| `--color-accent` | `#141413` | `#FFFFFF` | **The primary action, monochrome.** Black pills on light, white on dark |
| `--color-accent-hover` | `#000000` | `#E6E6E6` | |
| `--color-accent-dim` | `#ECEAE5` | `rgba(255,255,255,.08)` | Active nav, selected chips |
| `--color-on-accent` | `#FFFFFF` | `#0B0C0E` | Text and icons sitting on `accent` |
| `--color-brand` | `#F43F5E` | same | **Revenact Rose.** The mark, and nothing else |
| `--color-success` / `-dim` | `#10B981` / `#ECFDF5` | same / 12% tint | Good health, positive sentiment, upward moves |
| `--color-warning` / `-dim` | `#F59E0B` / `#FFFBEB` | same / 12% tint | Average health, stale, watch |
| `--color-danger` / `-dim` | `#EF4444` / `#FEF2F2` | same / 12% tint | Poor health, negative sentiment, destructive actions |
| `--color-info` / `-dim` | `#3B82F6` / `#EFF6FF` | same / 12% tint | Neutral information |
| `--color-success-ink` / `warning-ink` / `danger-ink` / `info-ink` | `#047857` / `#B45309` / `#B91C1C` / `#1D4ED8` | `#34D399` / `#FBBF24` / `#F87171` / `#60A5FA` | Readable status text on a `-dim` tint (badges, `DANGER`, error messages). The plain semantic tokens stay for dots, bars and chart marks |
| `--color-line-subtle` | `#EFECE6` | `#1E2026` | Hairlines inside a card |
| `--color-line` | `#E8E5DF` | `#272A33` | The default border |
| `--color-line-strong` | `#D8D4CC` | `#373B47` | Emphasised separation |

Utility vocabulary: `bg-base`, `bg-surface`, `bg-subtle`, `text-ink`,
`text-ink-muted`, `text-ink-faint`, `bg-accent`, `text-on-accent`,
`bg-accent-dim`, `bg-brand`, `text-success|warning|danger|info`, `border-line`.

Dark mode is the same tokens re-pointed under `html.dark` / `[data-theme="dark"]`;
`ThemeSynchronizer` in `App.tsx` sets both from the settings slice (light, dark,
or system). A bridge rule in `index.css` keeps legacy `bg-accent text-white`
pairs readable on the white dark-mode primary until they migrate to
`text-on-accent`. New code writes `text-on-accent`.

The `--rv-*` names used by the settings pages, navbar and assistant rail are
aliases of the tokens above, not a second palette. Only the few with no core
meaning (the canvas gradients, the sidebar's warmer fill, the calendar card's
teal) carry their own values.

### Tier 1 and 2

`:root` aliases (`--bg-*`, `--text-*`, `--accent*`, `--border-*`) exist for the
few places that need an inline `style`. Semantic aliases (`--color-surface-*`,
`--color-text-*`, `--color-border`) exist for component-level naming. Note that
in Tailwind v4 the `@theme` names are the real custom properties, so a bare
`var(--line)` silently draws nothing; use `var(--color-line)`.

### Rules

- **Never write a raw hex in a component.** Tokens only. The exception is a
  third party's logo (Google, Microsoft, the connector marks), whose brand
  terms forbid recolouring.
- One primary, and it is monochrome. Rose is the mark, never a button or a
  state.
- Semantic colours mean status, trend or severity. Never decoration.
- Both modes, always. A new colour goes into the light `@theme` block *and*
  the dark override, or it is not done.

---

## 3. Typography

`index.html` loads two families from Google Fonts:

| Family | Used for | Weights |
|---|---|---|
| DM Serif Display | Display headings on Persuade-mode pages (login, workspace setup, the Copilot greeting), the wordmark | 400 |
| DM Mono | IDs, API keys, endpoints, code (`CODE`) | 400, 500 |

The body is the system stack. Every figure is set in it with `tabular-nums`
(`NUM`), so columns align without a monospace face. Lato is no longer loaded
(owner, 2026-10-09).

### Scale

Four sizes, two weights, roles in `src/components/ui/type.ts`:

| Role | Class |
|---|---|
| Display | `text-[22px] leading-7 font-semibold tracking-tight` (the in-content h1, tile values) |
| Title | `text-[15px] leading-6 font-semibold` (top bar, card and section titles) |
| Body | `text-[13px] leading-5` (rows, inputs, buttons with `font-semibold`) |
| Meta | `text-[11px] leading-4 text-ink-muted` (meta lines, captions, badges) |
| Eyebrow | `text-[11px] font-semibold uppercase tracking-wider` (tile labels and settings nav groups only) |
| Label | `text-[13px] font-semibold` (form labels, never uppercase) |

Off-scale sizes in older files are counted by `src/test/uiRatchet.test.ts`
and removed surface by surface. Reading surfaces cap line length around 65
to 75 characters.

---

## 4. Iconography

**lucide-react exclusively.** This overrules every vendored skill that prefers
Phosphor or Hugeicons.

| Context | Size |
|---|---|
| Inline with a label | 16px |
| Standalone action | 20px |
| Section header | 24px |

An icon with no adjacent text needs an `aria-label`. No emoji as icons, ever.

---

## 5. Shape, elevation and space

| Property | Rule |
|---|---|
| Radius | `rounded-md` compact controls, `rounded-lg` the default, `rounded-xl` cards and popovers, `rounded-full` pills and avatars. Do not introduce `rounded-2xl` or larger without a documented reason |
| Elevation | Cards are flat (`Card`: `rounded-xl border border-line bg-surface`, no shadow). `shadow-lg` only on overlays (`OVERLAY`). `.rv-card` is the legacy class kept for account settings and the platform portal until their own round |
| Nesting | **No card inside a card.** Group with a border, a `divide-y` or whitespace |
| Page padding | `px-6 pt-5 pb-4` on list pages; `<main>` uses `p-2 md:p-3 lg:p-4` |
| Inputs | `INPUT` / `SELECT` in `ui/styles.ts`: `min-h-11 sm:min-h-9`, `bg-surface`, `border-line`, `rounded-lg`, `text-[13px]`, disabled `bg-subtle text-ink-faint` |

### Shell dimensions

| Element | Value |
|---|---|
| Sidebar collapsed / hover-expanded | 68px / 240px, 300ms transition, overlays below the `md` breakpoint |
| Navbar | 64px, bottom hairline, `shadow-sm` |
| Copilot tab bar | 56px |
| Dashboard area tabs (Overview/Revenue/Health/Support) | Inside the 64px Navbar, not a bar of their own: full-height links with a 2px bottom border on the active one; they carry only `owner`/`lifecycle`/`customer` across areas |
| Dashboard toolbar (`DashboardToolbar`, shared by all three areas) | Sub-view links `min-h-8` (32px) in a `p-0.5` bordered group; filter chips a fixed `h-9` (36px); the filter row is `min-h-9` and grows when it wraps rather than overlapping the content below |
| Dashboard page | `DashboardFrame` owns the scroll (`overflow-y-auto`) and adds `p-4` inside `<main>`'s own padding |

---

## 6. Component inventory

### Primitives (`src/components/ui/`)

Since 2026-10-09 (spec 2026-10-09-ui-foundations-design) every new surface
is built from: `Card` (+ `CardHeader`/`Body`/`Section`/`Footer`),
`ListCard`/`ListRow`/`ListHeaderRow` and the `TABLE`/`TH`/`TD` constants,
`Tile` + `tileRow()`, `LoadingState`/`EmptyState`/`ErrorState`, `Tabs`,
`SegmentedControl`, `FilterChip`/`RemovableChip`/`FilterChipRow`,
`SearchInput`, `Select`, `Switch` (with `busy` while its save runs), `Toolbar`, `Badge`/`HealthBadge`/
`SentimentBadge`, `PageHeader`/`PageBody` and `SettingsFrame`/
`SettingsSection`/`SettingsRow`, `SettingsDraftScope` + `useSettingsDraft` (the settings page's save bar, mounted by `SettingsFrame`), `Toast`/`ToastProvider` and `useInstantSave` (a settings control saved at once, with Undo), `DayChips`, `Banner`, `OverflowMenu` (the ⋯ menu for actions without room), `ActionCluster` (a toolbar's right-hand actions: two secondaries as buttons from sm, the rest in the menu, the primary last), `ROW_ACTIONS` (a list row's trailing actions, revealed on hover or focus from sm, always shown on touch) and `TD_NUM` (a right-aligned tabular-number table cell). Buttons are `PRIMARY`,
`BUTTON`, `QUIET`, `DANGER`, `ICON_BUTTON`; disabled controls use tokens,
never opacity. `/__ui` (development builds only) shows each in every state.
The inventory below describes surfaces as they are until their surface PR
moves them.

**Records surface (2026-10-09).** Organizations, Accounts and Contacts use
`PageHeader` (drawn into the Navbar's title slot), `Toolbar`, `Tile` rows
(container-sized; Lifecycle in its own card), `ListCard`/`ListRow` (portfolio
rows on a 60rem grid with column labels), board cards on `Card` with their
buttons shown on hover, the Story and Calls in day cards with rows of one
height, Knowledge as flat cards, and the detail tiles on one anatomy. Badges
are for real status only (signal: overdue and risk red, ticket counts
neutral).

**Ops surface (2026-10-09).** Pipelines, Communications, Brain and Work use
`PageHeader` in the Navbar's title slot (Brain and Work draw it once in their
route layouts; their scope switch is a `SegmentedControl` in the bar's actions
through `PageHeaderActions`, in place on a phone). Pipelines: the kind switch
leads the one `Toolbar`, tiles on `Tile` with Stages in its own card, rows on a
60rem grid with column labels (a flex line with the facts in the meta below),
board cards on `Card` with their buttons on hover, priority the one colour (High
only). Communications: the shared bar, the glass shell kept with everything
inside flat (folders, filters, rows, panes), the queue and mailbox on 44rem grid
rows, waiting time neutral (no SLA), Next event neutral. Brain: one section
style (a 15px title over one card), jump and filter tiles on `Tile`, list cards,
Knowledge by function a table card, statuses as `Badge`s and filters as
`FilterChip`s. Work: a reading column (`max-w-5xl`), list cards, History's
filters on `Select`.

**Impact surface (2026-10-10).** Segments, Surveys, Scenarios (rules and the
legacy canvas), Project Management (plans and templates), Campaigns and Canvas
use `PageHeader` in the Navbar's title slot: a list page titles the bar, a
record page leads back, Surveys and Scenarios carry their view tabs and the
tab's primary in the bar, and Plans' List | Board are the bar's tabs. Each list
page has one `Toolbar` (scope as a `SegmentedControl` where there is one,
`SearchInput`, `Select`s, the primary last) and one `ListCard` whose rows sit on
the list's own grid from a container breakpoint (column labels above), with Show
more inside the card. Record pages use `DetailHeader`: the name as the one
display `h1`, at most two visible controls, a menu with Delete and other
destructive items last in the danger tone, one meta line, and a status region
that stays mounted. Builder modals hold no boxes. Status badges carry a tone
only for real status (plan on track and at risk, campaign active, a low survey
score, overdue, failed). The legacy canvas builder shows a larger-screen notice
below md.

**Settings surface (2026-10-11, settings production PR 1).** Every workspace settings page (`/settings/*`) sits in one `SettingsFrame`, one width for every page (`max-w-[960px]`, left-aligned, 32px top, 24px sides from md and 16px below; no `wide`/`default`). Its `h1` is the nav item's label (read through `settingsTitle`: "Work", "AI", not the tab), with a muted intro and an optional one-line note; a tabbed item draws its tab row under the heading from `SettingsTabsRoute`. The bar says "Settings" as text below md only; from md the nav column's heading carries it. Every control sits in a `SettingsSection` as a `SettingsRow`: a form section is two columns from lg (title and help on the left, 260px; one card of divided rows on the right) and stacks below lg; a section with a `list` or a `header` (lists and tables) stays stacked at every width; `variant="danger"` colours the title only. Saving is a hybrid. Switches and single selects (and the Recommendations radios) save the moment they change through `useInstantSave`: not optimistic (the switch is `aria-busy` until the server answers), a refusal under the row, and on success a "Saved" toast with Undo, top right under the bar so it never covers the save bar, for 5 seconds, held while it is hovered or holds focus. Typed fields (numbers, day chips, the currency) are drafts: each section registers with `useSettingsDraft`, and one sticky bar, "Unsaved changes · Discard · Save", mounted by `SettingsFrame`, saves every edited section in order and stays while any is refused; Enter in a draft field saves through the same bar. Leaving with drafts asks "Leave without saving?" (`useUnsavedGuard`: in-app links, the phone section picker, closing the tab). There is no per-section "Save changes" any more. One-shot actions (Run now, Briefs' "Schedule it", Create key) keep their own buttons. A button that opens a form is a plain button; the form owns the one primary. Lists are one card of rows (Attributes and Custom objects on tested container grids); Members, Credit history, Imports, AI usage's recent calls and Actions & approvals are tables flush in their card. People & teams, Attributes and AI feedback switch with `Tabs` under the heading. A page-level warning is a `Banner`; permission notices are a quiet lock line, never an amber box; status colour is kept for real status (a failed delivery or sync, a refused import row, over budget, a seat limit reached, a verified or revoked domain). Account settings were folded into Settings on 2026-10-17: a **You** group (Account, Personalization, Your skills & tasks, About) heads the nav, those four pages keep their own look in a centred column for now, Plan & billing exists once (Workspace), and the account-settings right rail is gone. `/profile` keeps its own look. No em dashes.

### Data display

| Component | Where |
|---|---|
| Portfolio rows and board (`components/organizations/portfolio/`) | `/organizations/list`: `AccountRow` (a rounded item, not a table row; a two-line card below `sm`), `AccountDetails` (six panels, part of the row), `SummaryTiles`, `PortfolioToolbar`/`FiltersPanel`/`PinFieldsMenu`, `FilterChips`, `SelectionBar`, `PortfolioSections`, `AccountSheet`. `/organizations/board`: `PortfolioBoard`, `BoardColumn`, `BoardCard`, `AccountSidePanel`. They read a portfolio kind (`PortfolioKindContext`, Organizations by default), so `/accounts/list` and `/accounts/board` use them too, with `ACCOUNT_KIND` and `components/accounts/portfolio/AccountPanels`. The primitives they share with Pipelines (usePagedRead, tileParts, filterParts, ChipRow, MoveToMenu, useSearchText, SelectionActionsBar) live in the same folder. See "Portfolio rows and board" below |
| Pipelines book (`components/pipelines/portfolio/`) | `/pipelines/list` and `/pipelines/board`: `PipelineItem` (a rounded item: title, Part of, MRR, stage, priority, department, date line, one signal), `PipelineSections`, `PipelineTiles` (with the open-stage strip), `PipelineToolbar`/`PipelineFilters`, `PipelineBoard`/`PipelineColumn`/`PipelineCard`, `PipelineKindSwitch`, `PipelineModals`. Its own kinds (`OPPORTUNITIES_KIND`, `RISKS_KIND`), on the shared portfolio primitives. See "Portfolio rows and board (Pipelines)" below |
| Account page (`components/accounts/detail/`) | `/accounts/:id`: `AccountHeader`, `AccountTiles` (the shared `DetailTiles`, Health opening `AccountPulseBreakdown`), `AccountDetailsTab`, `MapsTab` (`components/canvas/`), `useAccount`, `useAccountPageParams`; the organization page's detail parts (`StoryTab`, `PeopleTab`, `DealsTab`, `FilesCallsTab`) given an account `scope`. See "Account page" below |
| Canvas (`components/canvas/`, `pages/canvas/`) | `/canvas` (`CanvasPage`: the gallery, search, Show more), `/canvas/:id` (`MapEditor`: live facts, an open plans strip, the board). Shared by both record pages' Maps tab (`MapsTab`, `MapRow`, `NewMapDialog`). `MapBoard`/`PersonNode`/`RelationshipEdge` (React Flow) draw every relationship as one neutral stroke carrying the label's own words, never a colour per kind; `NodeMenu`'s 44px target holds at every width, not just below `sm`; the board has no transitions, and Fit the map runs `fitView` without a duration; below 768px the board is read-only behind a People/Map toggle (`PeopleList`), defaulting to People |
| Contacts list and profile (`components/contacts/`) | `/contacts`: `ContactsToolbar` (summary line, search, organisation, account, sentiment and role filters in the URL, + Add), `ContactList` of `ContactListItem`s (never a table row; Load more), `ContactProfile` (sentiment and why, then `HistoryItems`: calls newest first, emails, tickets). See "Contacts" below |
| `KanbanBoard` | Generic over stage and item; HTML5 drag events; used by the Deals & risks tabs' board (organisation and account pages) |
| Dashboard tables | `AccountHealthDetailTable`, `RenewalQueueTable`, `ActivityDetailedTable`, `GoingDarkTable`, `SwingTable` |
| `PinnedAttributes` *(unused — no route renders it; kept for a later cleanup PR, see §4.4 of docs/04-app-flow.md)* | Label and value pairs typed as text, truncated, dot, owner or pulse |
| `EntityAvatar` | Company logo, else deterministic initials in one of five semantic hues |
| `PresenceStrip` | Session participants, maximum five |

### Dashboard primitives

Four small components, in `src/pages/dashboard/shared/`, that replaced what
used to be copied into every dashboard tab.

| Component | Rule |
|---|---|
| `DashboardToolbar` | The one row under the area tabs: a sub-view switch (`NavLink`s, hidden when there is only one view) on the left, `FilterSelect`s on the right, reading and writing the URL through `useDashboardFilters`. A period control (e.g. Forecast's horizon) is marked `clearable: false` and survives "Clear n"; the rest of the active filters do not. A chip shows as active only when its value differs from that filter's default, so a period on its default does not look filtered. An option may carry a short `display` label for the chip (Health's chips show the name; the count stays in the dropdown). The visible chip shows the focus ring of the invisible native `<select>` over it |
| `Kpi` / `KpiStrip` | `Kpi` is one label/value/detail figure; colour is reserved for `tone="loss"`/`"gain"`, never decorative. Given an `onDrill`, it renders as a `<button>` instead of a `<div>` — same type, size and layout, with `hover:bg-subtle` and a focus ring added, and an explicit `aria-label="<label> <value>, show accounts"` rather than relying on the visible digits; the detail line stays in the accessible description through `aria-describedby`, and the inner lines are block `<span>`s so the button holds only phrasing content. `KpiStrip` lays a row of them out four across from `md` (`columns={3}` for a three-figure summary, `columns={2}` inside a card; `stackFromLg` for a quarter-width card such as Tickets' KPIs, keeping every label to two lines), divided by hairlines rather than boxed — replaced six local `Tile`s that tinted a border by tone and coloured numbers that meant nothing |
| `Panel` | The one container on the dashboard: `bg-surface border border-line rounded-xl p-4`, an optional title/action header. Never nest one inside another — group inside with `divide-y` or whitespace instead |
| `DataState` (`Loading`, `ErrorState`, `Empty`, `TruncatedNotice`) | One wording for loading, error, empty and truncated, generalised from Health's own set so eight views stop describing the same outage eight different ways |

### Attention list

`src/pages/dashboard/overview/`, the Overview's landing content: one `Panel`
titled "Needs attention" beside a stack of three headline `Panel`s.

- **Row anatomy.** A `bg-subtle` kind chip (Renewal, Risk, Going quiet,
  Support, Anomaly — text only, no colour by severity), then the title: a
  `Link` to `/organizations/<id>` for every kind but anomaly, or, for an
  anomaly (which can span several companies), a left-aligned `<button>` that
  opens the drill panel over its company list. Below the title is an 11px
  `text-ink-muted` reason line. On the right, the at-stake figure
  (`font-mono-brand tabular-nums text-ink`, no colour — money at risk is
  never a severity cue) with a small "at stake" label under it, then
  **Snooze 7 days** and **Done**, both `min-h-9` with hover, focus-visible
  and disabled styling. Every action carries its own accessible name rather
  than relying on the visible word — `aria-label="Snooze <title> for 7
  days"`, `"Mark <title> done"`, `"Undo: <title>"` — since two rows can
  otherwise share a button's visible text. Acting on a row swaps it in place
  for a "Snoozed · `<title>`" / "Marked done · `<title>`" line with the Undo
  button; both the acted-on row's buttons and its own Undo disable while
  their request is in flight.
- **States.**
  - *Loading* (first load only): five rows shaped like the real row —
    chip-and-title, reason line and action-button placeholders as
    `animate-pulse` `bg-subtle` blocks — inside a `role="status"
    aria-busy="true"` wrapper, no spinner.
  - *Empty*: `Empty` — "Nothing needs you right now."
  - *Full error* (no rows to show at all, first load failed): `ErrorState` —
    "Could not load what needs attention."
  - *Stale rows plus a failed refetch*: the large `ErrorState` does not
    replace the list — a compact `role="alert"` line ("Could not load for
    these filters. Showing the last list.") sits above the old rows instead,
    so a filter change that fails never blanks a list the viewer was already
    reading.
  - A failed Snooze/Done/Undo shows its own `role="alert"` line in the panel
    header and restores the row, distinct from the load-error line above.
- **Headline cards** (`overview/HeadlineCards.tsx`): three stacked `Panel`s
  — Revenue, Health, Support — each with an "Open `<Area>` →" link in its
  header and a two-across `Kpi` row inside, no drill (the Overview only
  summarises; the area page is where a figure opens a list). Each shows a
  skeleton shaped like its own `Kpi`s (a label line over a figure line) until
  its data actually answers the current filters, and "—" in place of a
  figure on error.

### Drill panel

`src/pages/dashboard/drill/`, mounted once by `DashboardFrame` — one panel
for the whole dashboard, not one per view.

- **Trigger.** A `Kpi` with `onDrill` set (see above). A Recharts segment
  drawn as SVG can't be reached by keyboard or read by a screen reader on its
  own, so a chart that drills also renders `DrillTargets`: a labelled list of
  ordinary `<button>`s, one per segment, each named "`<name> <figure>, show
  accounts`" and hidden with `sr-only` until one of them receives focus
  (`focus-within:not-sr-only`), so a sighted mouse user still sees only the
  chart.
- **Shape.** `role="dialog"`, `aria-labelledby` the title. From `1024px`
  (`lg`) it takes exactly the Ask rail's box, 320px wide (`border
  border-line rounded-xl`). With the rail showing it lies over the rail
  (`lg:absolute lg:top-0 lg:right-4 lg:bottom-4`, `shadow-md`) and covers it
  exactly. With the rail hidden or collapsed it is a 320px flex item in the
  rail's place (`lg:static lg:shrink-0`, `shadow-sm`), so the content
  column narrows as if the rail were showing and widens again on close; it
  never covers the figures. `data-placement` says which (`rail`, `column`,
  `sheet`). Below `1024px` there is nowhere
  useful for focus to go beside it, so it becomes a full-screen sheet
  (`fixed inset-0`, `aria-modal="true"`) with its own Tab/Shift+Tab focus
  trap. Either shape slides in over 180ms `ease-out` (`.animate-slide-in-right`,
  skipped under reduced motion), moves focus to its close button on open (not
  when the viewport merely crosses `lg`), and closes on the close button,
  returning focus to whatever triggered it. Escape always closes the sheet;
  at `lg`, where the page beside it may want Escape for itself, it closes the
  panel only when focus is inside it and the event isn't already
  `defaultPrevented`.
- **Lifetime.** The panel closes when the area or any filter changes (path
  or query string), without pulling focus back to the old trigger. While a
  view refetches, its old figures stay on screen dimmed but its server
  drills are off, so a header can never show the old figure over the new
  list. A zero bucket in Tickets or Topics offers no drill target.
- **Rows.** A company name linking to `/organizations/<id>`, its ARR in
  `font-mono-brand tabular-nums`, and one small `text-ink-muted` detail line
  underneath worded for what the number counted — a risk score ("risk 62"),
  a day count ("45 days overdue" / "never contacted"), a share ("38% of
  ARR"), or a segment's own unit ("3 tickets", "62% used"). A ticket or
  interaction drill adds one 11px `text-ink-muted` line under the header:
  the list is companies with at least one matching record, records not
  linked to a company aren't listed, and one on a shared account counts for
  each of its companies. When the backend doesn't recognise a segment (no
  `drill` key in its answer) the panel says "This number can't be listed."
  rather than a generic failure. A server drill
  the backend itself capped at 500 shows "Showing n of count" above the
  list. "Open as a list" (`/organizations/list?ids=...`) appears only when
  the full count is known, 500 or fewer, and not truncated. A drill never
  opens at all from a list the view itself only shows a capped preview of
  (Forecast's `swing` table, Activity's `going_dark` table, Customer
  Overview's `concentration` beyond its own top three, Topics' `recent`
  table), or from a book a view has already flagged `truncated` (every
  Health view) or only partly loaded (Usage, until its full scatter has
  arrived) — a partial list can only ever show *some* of what a figure
  counted.

### Ask rail

`src/components/copilot/CopilotRail.tsx`, shared by Communications, the
Dashboard, Organizations (list, board and an organization's page), Contacts,
Accounts (list, board and an account's page), Pipelines (list and board) and
the Brain (its four tabs, Feature Requests, Anomalies and the Graph),
all variant `glass` at `w-[320px]` (the Dashboard's glass is the owner's
decision of 2026-09-24, Organizations' of 2026-09-26, Accounts' and
Pipelines' the same exception carried over; `plain`, a bordered `bg-surface`
column, is left for the phone sheet).

- **Dashboard shape.** The frame is Communications', class for class (owner's
  decision, 2026-09-24):
  - Top bar: the Navbar on `/dashboard/*` is Communications' header, `h-16
    shrink-0 flex items-center gap-3 px-4`, transparent (no `bg-surface`,
    border or shadow). Left: "Dashboard" and the area tabs. Right
    (`ml-auto`): the Ask pill, then the notification bell. No avatar or
    account menu there; the sidebar's avatar at the bottom carries it. Every
    other page's Navbar is unchanged.
  - Body: `DashboardFrame` is Communications' body, `flex-1 min-h-0 flex
    gap-3 px-4 pb-4` (`<main>` adds no padding on `/dashboard/*`), so the
    content column (filters toolbar and views, its own scroll) and the rail
    start at the same top and run the full height below the top bar. Hidden,
    the content takes the full width.
  - Controls: the same pill as Communications' top bar (`rounded-xl
    bg-surface/70 border-line p-1`, three `w-9 h-9` icon buttons: New chat,
    History, Sparkles "Show/Hide Copilot" with `bg-accent text-on-accent`
    while open), in the Navbar in place of its four decorative icons on
    `/dashboard/*`. History's popover hangs from the pill. The rail has no
    header row.
  - `xl` and wider: the rail is open by default beside the scroll area.
  - Below `xl`: hidden (not rendered) until the switch shows it.
  - Below `sm`: the switch opens a full-screen sheet with a single 44px
    Close (×) button at the top right.
  - From `lg` the drill panel takes the rail's box: over the rail when it
    shows (covering it exactly, 320px), in its place when it is hidden or
    collapsed, so the figures narrow rather than being covered.
- **Organizations shape.** The same pill in the same transparent top bar, and
  the same rail in `OrganizationsFrame`'s `rail` slot, on `/organizations/list`,
  `/organizations/board` and `/organizations/:id`. `OrganizationsAskLayout`
  draws the frame and the rail once, above all three; each page's own
  `OrganizationsFrame` inside it passes its content straight through rather
  than drawing a second frame. On an organisation's page the layout draws
  the page's `bleed` frame, so with the rail closed the page keeps its full
  width and 24px gutter; with it open the page narrows beside it, and the
  tiles wrap to their column (`@container`, four across from 36rem).
  Only the rail is glass: rows, cards, tiles, the side panel and the sheets
  stay solid `bg-surface`. The rail wins its room: from `xl` the side panel
  sits between the columns and the rail, both showing together; below `xl`,
  with the rail open, a card opens in the bottom sheet, and opening the rail
  closes an open side panel. Board columns are `w-64` beside it (`w-72`
  otherwise). List rows (`@min-[60rem]:flex-nowrap`) and the tiles
  (`@min-[50rem]:grid-cols-5`) respond to their `@container`, the content
  column, so they wrap beside the rail instead of scrolling sideways.
- **Contacts shape.** The same pill in the same transparent top bar, and the
  same rail in `ContactsFrame`'s `rail` slot, wired once by
  `ContactsAskLayout` above `ContactsPage` (its own preference key
  `revenact_contacts_ask`, so hiding it says nothing about the Dashboard's or
  Organizations' choice). The rail shows from `sm`, open by default from `xl`.
  With it open beside the page, the list and the profile stay two panes only
  from `xl` (the list narrowed to `w-[18rem]`, `w-[22rem] lg:w-[26rem]`
  otherwise); between `md` and `xl` while the rail is open it collapses to one
  pane (the profile, with its own "‹ Contacts" back link) until the rail is
  hidden. Below `sm` it is the same full-screen sheet as the other two
  surfaces. "Why this sentiment?" (Sparkles, 13px quiet link, under a
  person's sentiment line) drafts "Why is Lukas's sentiment neutral?" (first
  name only) with the sentiment focus and opens the rail without sending; it
  renders only inside `ContactsAskLayout` (the `draft` context is null off
  it), so it disappears rather than disables itself off that route. A person
  the asker cannot open refuses "You can't ask about this person here."; the
  filtered list refuses "You can't ask about this list. Clear the filters and
  ask again." — both keep the question on screen, with no Retry, like any
  other refusal.
- **Accounts shape** (delivery 3, spec 2026-09-29 §3). The same pill in the
  same transparent top bar, and the same rail in `OrganizationsFrame`'s `rail`
  slot, wired once by `AccountsAskLayout` above the List, the Board and every
  account's page (its own preference key `revenact_accounts_ask`, so hiding it
  says nothing about the other surfaces' choice) — one conversation from the
  List into the Board, into an account and back. Open by default from `xl`,
  the full-screen sheet below `sm`. The Board reuses Organizations'
  `useBoardRail`: from `xl` the side panel sits beside the rail, both showing;
  below `xl`, opening the rail closes an open side panel and narrows the
  columns to `w-64` (`w-72` otherwise), and a card then opens as the bottom
  sheet. On an account's page the layout draws the page's own `bleed` frame,
  as the organization page does. Only the rail is glass; the List's rows, the
  Board's cards and columns, the account page's tiles and story items and
  every side panel and sheet stay solid `bg-surface`, the same exception
  Organizations already carries. Opening a row or a card narrows nothing —
  Accounts' List and Board send no focus, unlike Organizations' (the server
  drops a focus on those views). An account the asker
  can no longer open refuses "You can no longer ask about this account."; a
  story item no longer open refuses "You can no longer ask about this item.
  Ask about the account instead."; the filtered List or Board refuses "You
  can't ask about this list. Clear the filters and ask again." — all three
  keep the question on screen, with no Retry.
- **Pipelines shape** (spec 2026-09-30 §3). The same pill in the same
  transparent top bar, and the same rail in `OrganizationsFrame`'s `rail`
  slot, wired once by `PipelinesAskLayout` above the List and the Board (its
  own preference key `revenact_pipelines_ask`) — one conversation across
  both views and both kinds (Opportunities and Risks). Open by default from
  `xl`, a sheet below `sm`. The live chip reads "Pipelines · Opportunities"
  or "Pipelines · Risks", then the page's own filter-chip labels, named from
  the filter options that page's own read of that kind reported ("Pipelines
  · Opportunities · Owner: Carl CSM"); until that read lands, or if it was of
  the other kind, the toolbar's placeholders show instead ("Owner: User 2").
  The live chip's wording and chip order are the toolbar's own, which can
  differ from the server's; the server's own stored `label` (its own order
  and words, e.g. Organisation before Owner) replaces the live chip once a
  sent question's answer lands, and never includes the focus — that is
  always named from `focus`, appended as " · This opportunity" or " · This
  risk" to either chip. A focus no longer open refuses "You can no longer ask
  about this opportunity." (or "…this risk."); the filtered List or Board
  refuses "You can't ask about this list. Clear the filters and ask again." —
  both keep the question on screen, with no Retry. Only the rail is glass —
  the same exception Accounts' rail already carries — the List's items, the
  Board's cards and columns and the Opportunity/Risk form all stay solid
  `bg-surface`. The Board reuses `useBoardRail` for `railOpen` alone (its
  `closeCard` is a no-op here, since a card opens its own form rather than a
  side panel): columns narrow to `w-64` (`w-72` otherwise) while the rail is
  open from `sm`; a card's form stays a modal above the rail at every width.
  Opening a row or a card narrows nothing — the explicit "Ask about this" is
  the one way to focus a question. History tags a conversation started here
  with the Target icon and the server's own `label`, read "Started on " for
  screen readers; picking it reopens `/pipelines/list` or `/pipelines/board`
  with the page's own query (never `/pipelines`, whose redirect drops it). A
  turn the server withheld shows no chip, and a conversation with no
  `origin` has no History tag and opens where the person already is.
- **Brain shape** (spec `docs/superpowers/specs/2026-10-06-brain-ask-design.md`
  §2). The same pill and the same glass rail, wired once by `BrainAskLayout`
  above every Brain route (its own preference key `revenact_brain_ask`):
  `BrainFrame` draws the rail beside its column, outside its scroll, with
  the 16px gutter to its right and below from `sm`, and each page's own
  `BrainFrame` passes its content through, so one conversation lasts
  through every tab and scope change and the rail is never remounted. In
  the bar the scope switch sits first, then the pill. Open by default from
  `xl`, a sheet below `sm`. The chip reads "Brain · What changed · Company"
  (the tab's title, then the scope's label) and is never removable. Until
  the page's scope settles the composer says "Ask opens once this view
  loads." and sends nothing; on Feature Requests, Anomalies and the Graph
  it says "Ask from one of the four Brain tabs." and sends nothing. While
  the conversation is empty on a tab, three fixed starter questions sit
  above the composer as 44px, 13px, left-aligned `bg-surface` buttons in
  a list named "Suggested questions"; pressing one sends it. No other
  surface shows starters. A refused scope reads "That view changed; ask
  again." with no Retry. History tags a Brain conversation with the Lucide
  `Brain` icon and "Brain · <tab> · <scope>", and reopens that tab with
  `?scope=`.
- **Chips.**
  - The composer's chip says what the next question is about ("Revenue ›
    Forecast · Owner: Priya · 2 accounts"). Its × removes only a focus, never
    the screen.
  - Each user question carries its own 11px `bg-subtle` chip above its bubble,
    on the Dashboard, Organizations, Contacts and Accounts (a conversation
    reopened in Communications or `/copilot` shows no chip, since only those
    four pass `chipLabel`). Organizations' chip is "Organizations", then the
    page's own filter-chip labels, then the focus ("1 account"). Contacts'
    chip is "Contacts", then the filtered organisation (and account),
    sentiment and role labels and a quoted search term (`listParts`), or, for
    an open person, their name and place ("Lukas Vermeer · Kraft Heinz ›
    Kraft Heinz EMEA") with "Sentiment" appended while the question is
    narrowed to their sentiment. Accounts' chip is "Accounts", then the
    List's or the Board's own filter-chip labels ("Accounts · Owner: Carl
    CSM"), or, for an open account, its own name from the page's row ("This
    account" until it lands) with the focused story item's kind appended
    ("Pizza EMEA · This call"); a reopened conversation's chip, on every
    surface, is the server's own `label`.
- **Empty.** Communications' empty state on both surfaces: one centred 13px
  `ink-faint` line, "Ask about what is in front of you. Answers use your
  accounts, mail and tickets." The dashboard's suggested questions were
  removed on 2026-09-24 at the owner's request, to match Communications.
- **Answers.** Rendered as plain text (`whitespace-pre-wrap`), not the
  Markdown formatting `/copilot`'s `AnswerText` applies. A reply withheld from
  a reader with narrower visibility in a shared session renders the same way,
  as plain text — the rail never special-cases it.
- **States.**
  - In flight: a three-line `bg-subtle animate-pulse` skeleton shaped like an
    answer (`role="status"`, "Thinking…" for screen readers).
  - Budget spent (`429`): an `ink-muted` line, "This month's AI budget is used
    up.", with no action.
  - Any other failure, including a `400` (a malformed context): a
    `text-danger` line with a Retry button; the question stays on screen.
    Retry resends the question exactly as first asked — its own context and
    focus, from the chip on the failed bubble — never the current screen.
  - Focus returns to the input after every send.
- **Entry points.**
  - Drill panel: "Ask about these" (secondary button, Sparkles icon), enabled
    only for a complete list of 200 accounts or fewer; above that it is
    disabled with an 11px note ("Ask about up to 200 accounts at a time.
    Narrow the filters to ask."). Clicking it closes the drill panel first —
    the drill takes the rail's box from `lg` — then opens the rail with an
    editable, unsent draft.
  - Attention row: "Why?", a quiet button after Done, named "Ask why <title>
    is on my list". Unlike the drill's draft, it sends at once. It is
    `aria-disabled` while an answer is on its way or while that row's
    Snooze/Done is in flight.
  - Contacts' "Why this sentiment?" (a person's profile, under the sentiment
    line, only inside `ContactsAskLayout`) drafts "Why is Lukas's sentiment
    neutral?" (the first name and the sentiment word) with the sentiment
    focus and opens the rail; like the drill panel's, it never sends until
    asked.
  - Every entry point (and a History pick, and New chat) opens the rail (or
    the phone sheet) for that visit only; only the Navbar pill's Sparkles
    switch, from `sm` up, persists the open/closed choice to `localStorage`
    (`revenact_dashboard_ask`, `revenact_organizations_ask` or
    `revenact_contacts_ask` — each surface keeps its own).
    The phone sheet's Close never saves anything; the sheet always starts
    closed. Sending at once (`ask()`)
    replaces any earlier drafted question and focus, so only one is ever
    pending.
- **History.** An 11px origin tag (LayoutDashboard icon + "Revenue › Forecast")
  on dashboard conversations — the area and view only, never the filters it
  was asked with; a question's own chip is what carries those. Organizations
  conversations carry the Network icon and "Organizations" followed by the
  server's own `labels` ("Organizations · Owner: Carl CSM"; there is no
  `origin_label` field), or, when started on an organisation's page, the
  server's `label` ("Pizza Hut · EMEA"), capped at 60% of the row and truncated.
  Contacts conversations carry the Users icon and the server's own `label`,
  read "Started on " for screen readers: "Contacts · Negative" for one
  started on the filtered list, or "Lukas Vermeer · Kraft Heinz" for one
  started on a person. Accounts conversations carry the Layers icon and the
  server's own `label`, read the same "Started on " way: "Accounts · Owner:
  Carl CSM" for one started on the List or the Board, or the account's own
  name ("Pizza EMEA") for one started on its page. Picking a conversation
  from History always navigates to the surface it started on (Dashboard,
  Organizations, Contacts or Accounts), whichever page is currently showing;
  a Contacts pick lands on `/contacts/:id` (a person) or `/contacts?<filters>`
  (a list), and an Accounts pick lands on `/accounts/list?<filters>`,
  `/accounts/board?<filters>` or `/accounts/:id` (never `/accounts`, whose
  redirect drops the query).

### Portfolio rows and board (Organizations)

The list is Operate mode without a spreadsheet: one rounded `bg-surface` item
per account on the canvas, grouped into sections whose headers show count and
ARR. Rules specific to it, enforced by
`components/organizations/portfolio/houseRules.test.ts`:

- Type sizes 11/13/15/22 px only; numbers in `font-mono-brand tabular-nums`.
- Health is a ring coloured by `HEALTH_COLORS` with the score as text; the trend
  line, runway and signal all carry words (the trend's label, "47d overdue",
  "Renewal overdue"), never colour alone. `renewal_overdue` and `risk` signals are
  danger-toned, `tickets` warning-toned.
- No card in a card: the opened row's panels are separated by whitespace; the
  summary tiles sit on the canvas. No glass on the list or the board
  themselves; only the Ask rail beside them is glass.
- Skeletons are row- and tile-shaped; the empty state is "No organizations match
  these filters" with Clear filters (or "No organizations yet" with Add).
- Every field of the old 34-column table renders exactly once in the row header
  or a panel (`fieldCoverage.test.tsx`); any panel field can be pinned as a chip.
- Frame: the Navbar on `/organizations/list` and `/organizations/board` is the
  dashboard's transparent top bar ("Organizations", List/Board carrying the
  query, the actions slot, the bell, no avatar); `OrganizationsFrame` is
  `DashboardFrame`'s body, with the Ask rail in its `rail` slot (see "Ask
  rail", Organizations shape).
- Board: columns sit on the canvas with no surface of their own, and cards
  (`bg-surface`, ring, name, owner, ARR, signal, trend) are the items, so there
  is no card in a card. A column header reads "Live · 1 · $69.6K". A dragged-over
  column shows `bg-accent-dim` with an accent ring. The drop-only Churn column
  is a dashed box. Each lifecycle column but Churn carries a header "+" that
  opens Add organization preset to that column's stage; the toolbar's own Add
  has no preset. A card's **Move to…** is a compact icon button in the card
  header (`ArrowRightLeft`, labelled "Move <name> to…", 44px on phones and
  `min-h-9` from `sm`), not a native `<select>` acting on change: it opens a
  real menu of the other stages and nothing moves until one is chosen. Arrow
  keys, Home and End move within it; Escape or choosing an item returns focus
  to the button; Tab or an outside press just closes it and leaves focus
  where it went; opening another card's menu closes this one. The menu opens
  on the side with more room inside the visible box (the window intersected
  with every clipping ancestor) and caps its height to that room, scrolling.
  After a move, focus lands on the moved card's Open button in its new
  column. From `sm` the page fills the frame: the page does not scroll, each
  column does (the board keeps 360px on short windows, which then scroll). The opened card is `AccountSidePanel`, a
  non-modal `bg-surface` column beside the board, not over it — the board
  stays usable while it is open. Skeletons are card-shaped; a column with
  nothing says so in words.

### Portfolio rows and board (Accounts)

`/accounts/list` and `/accounts/board` are the Organizations portfolio with
the account kind (`ACCOUNT_KIND`, `components/accounts/portfolio/accountKind.ts`),
which each page provides around itself through `PortfolioKindContext`.
Everything in the section above holds, with these differences:

- The line under a name reads "Organisation · owner · lifecycle · touched Nd
  ago". The organisation is the first linked one the viewer may open, then
  "+N" for the rest; a hidden one is never named or counted. A Board card's
  line is the organisation (else the owner).
- The opened row is `AccountPanels`:
  - Commercial: ARR in the workspace's currency, and the renewal date on a
    line with today marked, danger when overdue.
  - Voice of the customer: the NPS bar and band, CSAT, and the AI pulse
    reason as a quote.
  - Profile: the Revenact ID, each organisation as a link to
    `/organizations/:id?account=<id>`, then domain, industry, email, phone and
    address.
  - History: created, updated, pulse recorded on, and CSM pulse set.

  Every one of the 24 Account fields shows exactly once
  (`components/accounts/portfolio/fieldCoverage.test.tsx`).
- No archive and no churn: there is no Archive or Churn button and no
  "Include churned". Churn is an ordinary Board column with a "+", and a move
  there saves like any other. The bulk Set lifecycle offers Churn.
- The filters are organisation (checkboxes, after Owner), owner, lifecycle,
  health, renews within and NPS. The sorts are risk, ARR, renewal, health and
  name. There are no Pin fields.
- The Renewing tile opens on 90 days.
- An account none of whose organisations the viewer may open shows no Edit
  details and no Move to…, since both need its organisation's id. Bulk edits
  still reach it.
- The name, and the sheet's and side panel's "Open account page", open
  `/accounts/:id` by its id alone: the account page reads everything from
  the URL.
- The top bar is the framed one: "Accounts", List | Board keeping the query,
  the actions slot, and no avatar. `AccountsAskLayout` (delivery 3, spec
  2026-09-29 §3) draws the ✦ rail and pill here, above both views, as it does
  on Organizations: one `AskProvider` with the `accounts` surface and its own
  preference key (`revenact_accounts_ask`), so a conversation lasts from the
  List into the Board and an account and back, open by default from `xl` and
  a sheet below `sm`. Both views call `useReportAccountsOptions` with their
  own portfolio read's filter options, so a live chip names them for real
  ("Accounts · Owner: Carl CSM"); the server's own `label` on a sent question
  always wins. Opening a row or a card narrows nothing.

### Portfolio rows and board (Pipelines)

`/pipelines/list` and `/pipelines/board` are one book of opportunities or
risks across organisations and accounts (spec
`docs/superpowers/specs/2026-09-30-pipelines-redesign-design.md` §1), read
from `GET /pipelines/{opportunities,risks}/`. They look and behave like the
Organizations and Accounts portfolios, with their own kinds (`PipelineKind`:
`OPPORTUNITIES_KIND`, `RISKS_KIND` in `features/pipelines/pipelineKinds.ts`)
because a pipeline item has no health, lifecycle or ARR:

- The top bar is the framed one: "Pipelines", List | Board keeping the query,
  and Opportunities | Risks (`?kind=risks`; opportunities when absent). Below
  `sm` the kind switch is the page's first row instead.
  - The Ask pill sits in the actions slot.
  - `PipelinesAskLayout` draws the frame and the glass rail once, above both
    views and both kinds. The rail is open by default from `xl`, remembers
    its own choice (`revenact_pipelines_ask`) and is a sheet below `sm`.
- Five tiles, every figure the server's over every filtered row (the stage
  filter is the only one they ignore): Open pipeline / MRR at risk (a figure,
  count · MRR), Closing / Due within 30 or 90 days, Overdue, Won / Mitigated
  this quarter, and a strip of the open stages. Each but the first sets its
  filter and clears it when pressed again.
- An item is never a table row: the title (it opens the Opportunity or Risk
  form), "Part of" the organisation or account as a link (and an account's
  organisation), MRR in the workspace's currency, the stage tag, priority,
  department ("Whole company" when blank), the date line ("Closes in 12d",
  "Overdue 5d" in danger, "No date"; risks "Due in 12d"; a closed item, its
  date past or ahead, "Expected 5 Sep 2026" or a risk's "Due by 5 Sep 2026")
  and at most one signal (Overdue, else High priority on an open item, which
  then stands in for the priority tag). In a
  narrow column the facts wrap under the title; targets are 44px on phones.
  Under Ask, the item's line ends with the quiet "✦ Ask about this", hidden
  while selecting. It types "What should I know about this opportunity?"
  (or "…risk?") with the chip "… · This opportunity" (or "… · This risk")
  and does not send.
- Group by stage (the default on both views), close / due month (Overdue,
  the months, No date), organisation or account, owner (named people, "Not
  in your book", Unassigned), department or priority; the List also offers
  None. Sort by MRR, date, priority, stage or title. Filters: owner,
  organisation, account, stage (the List's default is the open stages, the
  Board's every stage), priority, department and the date windows. Everything
  is in the URL.
- Selection (the List only) offers Set stage, Set priority, Set department
  and Set date (a date, or Clear date), each armed and applied with "Apply to
  N", and Export selected.
- The Board has a column per stage; Closed Lost starts collapsed ("Show
  Closed Lost") and stays a drop target. Dragging a card (from `sm`) or its
  Move to… menu saves the item's stage; a card opens its form. The card's
  facts row ends with the same quiet "✦ Ask about this". The columns narrow
  to `w-64` while the Ask rail is open (`w-72` otherwise); a card still opens
  its form, a modal over the rail.
- The organisation and account pages' Deals & risks items gain the same date
  line and the Overdue signal; both forms gain the date ("Expected close" /
  "Due by") and Closed Lost.

### Account page (`/accounts/:id`)

The account's story: the organization page below, scoped to one account
(spec `docs/superpowers/specs/2026-09-29-accounts-redesign-design.md` §2),
read from the URL id alone. An id that is not a number, or one the viewer
may not open, shows "Account not found" with "Back to accounts". Rules
specific to it, enforced by `components/accounts/detail/houseRules.test.ts`
(which also scans `pages/accounts/Details.tsx`, `shared/CustomObjectsTab.tsx`
and `shared/OwnerTile.tsx`; `components/canvas/` has its own suite, see
"Canvas" below):

- Frame: the organization page's bleed frame, the transparent top bar with
  "‹ Accounts", and the glass Ask rail `AccountsAskLayout` draws above it
  (delivery 3, `bleed` on this route): the page calls `useReportAccountName`
  from its own row, so a live chip names the account ("Pizza EMEA") once the
  row lands, "This account" until then; the server's own `label` on a sent
  question always wins. Each story item's meta line ends with a quiet "Ask
  about this" (`StoryItemRow`, shared with the organization page below),
  which types in "What should I know about this `<kind>`?" and moves the
  chip to "`<account>` · This `<kind>`" without sending — the person can edit
  it — and the focus is spent by that one send; the question after it is
  about the account again.
- Name row (`AccountHeader`): initials, the name at 22px, "owner · lifecycle ·
  Touched Nd ago" at 13px and the signal tag; then "Part of" with one link per
  linked organisation the viewer may open (`/organizations/:id?account=<id>`;
  a hidden one is never named or counted); Edit (icon-only below sm) and ⋯
  (Add contact, Log a call, New task).
- Tiles (`AccountTiles`): Health (ring and trend; opens the account pulse, its
  five signals, with a note that an account's health has no rubric), ARR (the
  workspace's currency), Renewal (runway; jumps to Commercial) and Pulse (jumps
  to Voice of the customer). A grid of four from sm, a snapping strip below.
- Tabs: Story, Details, People, Maps, Deals & risks, Files and Custom objects
  (`?tab=story|details|people|maps|deals|files|objects`; an old `?tab=canvases`
  link reads as Maps). No account chips and no account tags: every record is
  this account's.
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
- Custom objects are list items, never tables: a summary line ("N records ·
  M objects"); a section per object with Add record, an item per record (its
  first field as the title, the others by name), Edit and Delete per item.
  Maps is the shared `components/canvas/MapsTab`: see "Canvas" below.
- Phones: the name row, a strip of tiles, the tabs scrolling sideways, then
  full-width content.

### Organization page (`/organizations/:id`)

The organization's story, framed like the list (transparent top bar with
"‹ Organizations", `OrganizationsFrame`, and the glass Ask rail beside it,
a sheet on phones). Each story item's meta line ends with a quiet "Ask about
this" (Sparkles, 11px, a 44px target below `sm`).
Rules specific to it, enforced by `components/organizations/detail/houseRules.test.ts`
(which also scans `pages/organizations/Details.tsx`):

- Name row: initials in a `bg-subtle` circle (never a third-party logo), the
  name at 22px, "owner · lifecycle · Touched Nd ago" at 13px, the signal tag,
  then Edit and Add account (both icon-only below sm) and a ⋯ menu (Archive, Churn while they apply).
- Tiles: Health (ring and trend; opens the five-part breakdown below the
  tiles), ARR (in the customer's own currency), Renewal (runway) and Pulse
  ("AI n · CSM n", dots, "pulses disagree"). Each is a button; the last three
  jump to their Details panel. A grid of four from `sm`, a snapping strip below.
- Account chips (All, each account, Organization) sit above the tabs on
  every tab, so the row never jumps (owner, 2026-09-28). Organization is
  always there, at 0 when nothing is on the organization itself. On Story,
  People, Deals & risks and Files they carry only a name and the active
  tab's count (story items, people, opportunities plus risks, files plus
  calls); the chosen one is `bg-accent text-on-accent`. On Details and
  Knowledge they filter nothing: names only, `text-ink-muted`, the chosen
  one outlined, with "Details and Knowledge cover the whole organization"
  tied to each chip by `aria-describedby`; a press still moves the kept
  `?account=`. "Edit <account>" ends the row on every tab.
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
- Details opens with Accounts (`detail/AccountsSection.tsx`): a summary line
  above the list shows counts, the health mix, total ARR, NPS with its
  promoter, passive and detractor split, average CSAT and average CSM (both
  averaged over scored accounts only, "—" when none are scored), and the
  lifecycle breakdown. Then one `bg-surface` list, an item per connected
  account: the name links to `/accounts/:id`, owner · domain, then a second
  line with health (score and category), lifecycle, ARR, renewal, NPS, CSAT,
  "AI n · CSM n" with the pulse dots and the AI reason, and the Revenact ID,
  with "—" for blanks. Add account is in the heading; each item has its own
  Edit. Under the six panels, in the same surface, "Contact and CSAT"
  (`CustomerFacts`): email as a `mailto:` link with the part before the `@`
  encoded, phone as a `tel:` link, industry, and the CSAT bands as bars at
  their true share.
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

### Contacts

Spec `docs/superpowers/specs/2026-09-28-contacts-redesign-design.md` §3–§5.
A list and a profile panel, like the Communications inbox but solid (no
glass), in `ContactsFrame` (the same bleed gutter as the organisation page —
`OrganizationsFrame`'s classes — with a slot for the Ask rail).
`ContactsAskLayout` (delivery 2, spec §4.4) draws the frame and the glass rail
once, above `/contacts/:id?`, the same way `OrganizationsAskLayout` does for
Organizations (see "Ask rail", Contacts shape); `ContactsPage`'s own
`ContactsFrame` inside it then passes its content straight through.

- **Header.** The summary line ("142 people · 38 decision makers · 120
  active · 61% positive · 12 negative · +12.5% growth (30d)", over the whole
  filtered set; "n active" and the growth only when the backend serves
  `summary.active` / `summary.growth_30d_pct`, and growth left out when it is
  null), then search and the
  organisation (one a deep link names past the first page of options is
  read by id for its name), account (waits for an organisation), sentiment and role
  filters — each with its own visible label, not a placeholder standing in
  for one — all in the URL (`q`, `customer`, `account`, `sentiment`, `role`),
  and + Add (the existing `ContactFormModal`).
- **List.** One item per person: initials, name and role, "Organisation ›
  Account" (or the organisation alone), sentiment in words in its colour with
  "n calls" beside it (every call of theirs the viewer can open, read or
  not), last contacted, and Active/Inactive. Load more at the end; skeleton,
  error with Try again, and empty states (Clear filters when filtered).
- **Profile.** `/contacts/:id` chooses the person. Name (22px), role and
  Active/Inactive,
  "Organisation › Account" (the organisation links to its page, the account
  to it with `?account=` so its chip is chosen), email and phone links
  (sanitised). Their sentiment and why ("Neutral: 3 positive · 2 neutral · 1
  negative across 6 calls and 2 emails, latest 12 Sep"), counted only over
  the viewer's readable analysed records (`sentiment_readable`) — never from
  the interactions listed below it, which can include kinds it doesn't
  count. When the stored sentiment also rests on records the viewer cannot
  open, it appends "Also rests on records you can't open."; when none of
  what it rests on is readable, it reads "Negative, from records you can't
  open." instead of the count. Under it, on phones
  too: "Last contacted 2 weeks ago" (or "Not contacted yet") and, for a
  computed sentiment, "Sentiment read 2 weeks ago" (`sentiment_computed_at`).
  An edit sends the sentiment only when it was changed (a sent one becomes
  hand-set and drops its evidence), then reads the person, their history and
  the summary line again. A hand-set sentiment reads "Negative. Set by
  hand." and, when some of their calls have been analysed, "…; their calls
  will be read again tonight" — never that nothing was analysed.
  `/contacts/abc` (no person can have that id) shows the same not-found
  state as a person the viewer cannot open. Calls newest first:
  date, title, sentiment or "Not enough to analyse" (nothing while pending —
  `readingOf()`: `not_analysable` → "Not enough to analyse", `pending` →
  nothing, otherwise the sentiment), the summary its title opens, the
  classification, host and length, the organisation › account tag and the
  recording. Then emails, then tickets ("Department · Status", falling back
  to the status alone when the ticket carries no department). Edit and
  Delete are the existing flows. "Why this sentiment?" (Sparkles, a quiet
  link under the sentiment line) drafts "Why is <first name>'s sentiment
  <word>?" with the sentiment focus and opens the rail without sending; it
  renders only inside `ContactsAskLayout` — hidden, not disabled, off that
  route (the existing `/contacts` route always has it, since it is a child of
  the layout; a bare render of `ContactsPage` in a test with no `AskProvider`
  is the only place it is absent).
- **Phones** (below 768px). The list is full width; a person opens as their
  own screen with a "‹ Contacts" back link that keeps the filters. Rendered
  conditionally, not hidden with CSS.
- **Organisation page ties.** A person's name on the People tab opens
  `/contacts/:id`; a call there with nothing to read says "Not enough to
  analyse" and a pending one shows no sentiment.
- **What a call's reading is read from** (backend, `services/customers/
  calls.py::call_text`): the classifier reads the summary first, else the
  transcript, else just the title — the transcript's own opening lines are
  often small talk, so a summary (a digest of the whole call) pre-empts it
  rather than the two being concatenated.

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
    (`SizeSparkline`, scaled to its own range), all in DM Mono. A single
    history point reads as its own label, "Size today: N, no history yet",
    rather than drawing a line.

  On someone else's segment those three figures are the owner's alone and
  read "—" (screen readers: "Only the owner sees this figure"). Phones wrap
  the figures under the name. With no segments, the empty state explains what
  a segment is and offers New segment and "Filter Organizations, then Save as
  segment". A reload that fails keeps the last list on screen with "{error}
  Showing the last result." and Try again, rather than clearing it.
- **Builder: a modal, not a page** (owner, 2026-10-03; `BuilderDialog`).
  New segment opens it over the Segments list (`/segments/new`), Edit over the
  segment's own page (`/segments/:id/edit`, which hands it the segment it has
  already read), and Save as segment over the list it was pressed on, which
  stays as it was.
  - **Frame:** centred from `sm` (up to 1100px wide, 90dvh tall), the whole
    screen below it. The title and Close sit in its header, Cancel and Save
    segment in a footer that stays put while the body scrolls. Focus starts in
    the name; Tab stays inside; Escape, Close and Cancel close it and focus
    returns to what opened it. A click on the scrim does not close it, so a
    stray click keeps the draft.
  - **Editor:** the parts are split by dividers (no panel inside the modal).
    - **Basics:** the name as a quiet 22px title field, the description as a
      quiet line under it (each with a small uppercase label), and the kind as
      three icon tiles (`RadioTile`; fixed once saved).
    - **Rules** (`RuleEditor`): a sentence, "Include organisations that match
      All/Any of these conditions", then one row per condition led by
      "Where", then "and" (All) or "or" (Any). A group is an indented block
      with a left rule and its own All/Any. The remove button shows on hover
      or focus where there is a mouse, and always on touch screens. + Add
      condition and + Add group are disabled at 20. The organisation kind's
      churned/archived default sits under the rows.
      Each type has its own input (`ValueInput`): number and percent boxes,
      days, date or date-window, checkboxes for "is any of", owner and
      product selects or chips, and a server-searched organisation or account
      picker (`RecordPicker`). A record the reader can't open shows as an
      italic "an organisation you can't open".
    - **Sharing** (`SharingFields`): Only me, Everyone in the workspace or
      Chosen teammates as icon tiles, with chips for the teammates.
    - **Alert me on changes:** a switch (a native checkbox underneath) with
      its explanation as the description.
  - **Preview** (`PreviewPanel`): a muted block beside the editor from `lg`,
    pinned while the rules scroll, under it on phones. It leads with the count at 22px
    ("41 organisations match"), then the totals (no Members figure, which the
    count already gives), the first ten and "and N more", or "Nothing matches
    these rules yet." While a newer answer loads, the last one stays, dimmed.
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
    - A Kept out disclosure lists what is kept out, with Let back in, ten at a
      time through the preview (Ruling G2), names sorted within each batch.
  - **Changes tab** (`ChangesTab`): 7, 30 or 90 days, one rounded item per day
    with its totals, Entered and Left with the reason, and "+N more". A
    reason falls back to the raw field key with its `attr:`/`parent.` prefix
    stripped (e.g. "csat_score" rather than "attr:csat_score").
- **Save as segment** (`SaveAsSegmentButton`, `components/organizations/
  portfolio/toolbarParts.tsx`) is one shared button, used beside Filters on
  the Organizations and Accounts lists and before Add on Contacts. It opens the
  builder modal over the list (`useSaveAsSegment`), not a new page.
- **Money** reads compact, e.g. "$512.0K" (the tiles' ARR covered).
- **Follow-up (G19):** the Delete confirmation still uses `ConfirmDialog`'s
  older styling rather than the house look; accepted, not fixed in this
  delivery.

### Surveys

Spec `docs/superpowers/specs/2026-10-03-surveys-design.md` §2 (plan
`docs/superpowers/plans/2026-10-03-surveys-frontend.md`). The pages sit in
`OrganizationsFrame` under the framed bar ("Surveys", or "‹ Surveys" on a
send, its edit modal and a new one).

- **`/surveys`, two tabs** (ui `Tabs` in the bar, `?tab=sends|logged`; `?customer=`
  alone opens Logged scores).
  - **Sends:** **New survey**, then one rounded row per send (`SendRow`): the
    name with its type chip (`TypeChip`, DM Mono), Draft and Workspace/Shared
    badges; the segment, date and sender under it; "31 of 42 answered · 74%"
    in DM Mono, or "Not sent" for a draft. The empty state explains a survey
    and offers New survey. The list reads again each time the New survey
    modal closes; a failed reload keeps the last list beside the error, with
    Try again.
  - **Logged scores:** the page as it was (Log Survey, the rollups, the trend
    chart, the table), without its own heading inside the tabs. A row a sent
    survey wrote shows "From a sent survey", a link to the send, instead of
    Mark Expired, Edit and Delete.
- **New survey: the segment builder's modal** (`BuilderDialog`) over the Sends
  list (`/surveys/new`), over a send's page (`/surveys/:id/edit`) or over a
  segment's page (`/segments/:id/survey`, Survey these).
  - **Left, split by dividers:** Name; Type as three icon tiles (`RadioTile`:
    NPS, CSAT, CES) with a hint; Email subject (filled with "A quick question
    from {workspace}"); Intro line (optional, a DM Mono count of 500);
    **Audience** (`AudienceFields`): the caller's own segments in a select
    grouped by kind and, for organisations and accounts, role checkboxes
    (Champion and Decision Maker ticked) with "Up to 3 people per
    organisation, in the order you tick the roles." ("per account" for an
    account segment); **Sharing**
    (`SharingFields`, with the survey's own note).
  - **Right, pinned from `lg`:** the preview (`SurveyPreview`, a muted block):
    the email line for line, then the form with the mark, the question and the
    score row as a picture. Under it **Who it reaches** (`AudienceSummary`):
    "42 people at 18 organisations" (the count at 22px), the skips, "N in the
    segment you can't open aren't included", and why it can't be sent.
  - **Footer:** the reason Send is off, then Cancel, Save draft and **Send to N
    people…**. A new survey keeps Save draft and Send off ("Loading your
    segments…") until the caller's segments load. Send saves the draft, asks
    for the count again and swaps the body for the confirm ("Send {name}
    now?", the count, the 14-day link) with Back and Send now; a fresh count
    of 0 or over 500 turns Send now off, described by the reason. Back returns
    focus to Send. If the workspace has no email set up, Send is refused with
    "Email isn't set up for this workspace yet, so surveys can't be sent." and
    the draft is kept. Refusals return to the form at their fields (focus on
    the first one); a limit or a 403 above the form (focused); a 409 (already
    sending or sent) opens the send. Once Send has saved the survey, closing
    the modal opens that draft's page (an edited draft's page shows the
    change).
  - After the send the modal holds only Name and Sharing, with a line saying
    why. Anyone but the owner reads "Only {owner} can edit this survey".
- **Send (`/surveys/:id`).**
  - **Header** (`SendHeader`): the name at 22px; the type chip, Draft, and "to
    {segment}" (a link only when the reader may open it); then "Sent 3 Oct
    2026 · By you · Shared with the workspace". Edit for the owner of a sent
    survey; Delete for the owner of a draft (`ConfirmDialog`). A deleted
    segment reads "to a deleted segment".
  - **Tiles** (`SendTiles`): Sent, Answered, Response rate ("—" with the
    reason for screen readers when nobody counted received it), the figure (NPS
    signed, CSAT and CES in percent, with what it counts) and Bands. The owner
    also reads the frozen counts in a line under them.
  - **Answers** (`AnswersSection`): All / Detractors (Low scores for CSAT and
    CES) / With comments as a switch (`?answers=`); rows of a score chip
    (tinted by band, the band named for screen readers), the person and the
    record as links, the date and the comment as plain text; Show more
    answers; "N more answers from people you can't open" (the same count
    whichever filter is open, not scoped to it).
  - **Not answered** (`NotAnswered`): a closed disclosure; opened, rows of who,
    where, and "Link expires 17 Oct 2026", "Link expired" or "Not delivered:
    {reason}" in the danger colour.
  - A draft shows "Not sent yet" with Edit and send instead.
- **Hosted form (`/s/:token`).** No app frame, light only whatever the
  setting (`lib/theme.ts`). The mark with the wordmark, then one bordered
  panel: the intro, the question as the page's heading, the score buttons
  (`ScaleButtons`: 44px radios that wrap on phones, the end labels under the
  first and last), "Anything to add? (optional)" with a count of 2000, and
  Submit. Then "Thanks, your answer was recorded." Every bad link reads "This
  link has expired."; a throttled one says to wait a minute.
- **Survey these** sits on a segment's page beside Export CSV, for its owner,
  opening the New survey modal over the segment's page at
  `/segments/:id/survey` with the segment already chosen.

### Rules (Scenarios)

Spec `docs/superpowers/specs/2026-10-04-rules-design.md` §2 (plan
`docs/superpowers/plans/2026-10-04-rules-frontend.md`). The pages sit in
`OrganizationsFrame` under the framed bar ("Scenarios", or "‹ Scenarios" on a
rule, its edit modal and a new one). The canvas builder keeps its full-canvas,
no-Navbar page.

- **`/scenarios`, two tabs** (ui `Tabs` in the bar, `?tab=rules|canvas`).
  - **Rules:** **New rule**, then one rounded row per rule (`RuleListItem`):
    the name with Paused and Workspace/Shared badges; the rule as one
    sentence (Segments' `RuleSentence`: "When CSAT falls below 60 in Renewal
    risk → survey, notify me", figures in DM Mono, a deleted segment in
    italics); the last night ("4 Oct · fired 3 · waiting for review", or
    "Last ran 28 Sep" for a reader, or "Not run yet") and whose it is. The
    owner's switch (`RuleSwitch`, "Run {name} every night") sits on the
    right; turning on asks first in `ConfirmDialog`; a reader reads On or
    Off. The empty state explains rules and offers New rule. A rule starts
    off when it is first saved.
  - **Canvas:** `ScenariosList` as it was.
- **The rule builder: the segment builder's modal** (`BuilderDialog`) over
  the Rules list (`/scenarios/rules/new`), over a rule (`/scenarios/rules/:id/edit`)
  or over a segment (`/segments/:id/rule`, Automate).
  - **Top:** the rule as one sentence, as it is being built.
  - **Left, split by dividers:** Name; **When** (`TriggerFields`: Trigger,
    worded by the segment's kind; Segment, the caller's own grouped by kind;
    for a score line Score, Direction and Value with its range; for a
    schedule Repeat and Day); **Then** (`ActionCards`: one to three bordered
    cards, each type once, with add buttons and Remove: Notify (Who,
    Teammates as chips, Message with a DM Mono count), Create a task (Task
    title, Assign to, Due in days), Change lifecycle (Stage, chosen first),
    Send a survey (Surveys' type tiles, subject, intro, roles, the
    500-person note, and **Send without review**, a switch that asks in
    place and then reads in the warning colour, letting the survey go out
    without waiting for review on Mine)); **Limits** (Once per record every
    N days, the nightly 200, and a hint when a weekly or monthly rule waits
    longer than its rhythm); **Sharing**; **Status** ("Run every night",
    asking in place; off by default).
  - **Right, pinned from `lg`:** **Test this rule** (`TestPanel`): a button
    that, on click, asks the server for a dry run and reports it as an
    estimate ("3 organisations would match if tonight's run happened now:
    …", the count at 22px, the skips, and for a score line the first-night
    note) — nothing is written, and the answer holds only while the rule is
    unchanged; then the survey's preview (`SurveyPreview`) when there is
    one.
  - **Footer:** Cancel and **Save rule**, which saves without a confirm; only
    turning a rule on, or Send without review, asks first. Client checks
    speak the backend's sentences; refusals land at their fields, an
    action's at its own card, focus on the first; the 50-rule limit above
    the form, focused. Anyone but the owner reads "Only {owner} can edit
    this rule" (or "… can automate this segment").
- **A rule (`/scenarios/rules/:id`).** The name at 22px, the sentence, "Yours
  · Shared with the workspace · Once per record every 30 days"; the owner's
  switch, Edit and **Delete** (`ConfirmDialog`); a warning-tinted notice when
  it switched itself off, saying why and, for the owner, what to do.
  **Nights**: rows whose button reads "4 Oct · fired 3 · skipped 2 · 1
  waiting for review" (a reader: "28 Sep · fired 1 · 2 you can't open"), with
  Review it while one waits; opening a night lists its records (name as a
  link, or an unlinked "A deleted record"; what each action did, e.g.
  "Notify: skipped (nobody to notify may open it)" when a Notify action's
  people may not open the record; or why a whole record was skipped: "Skipped:
  acted on in the last 30 days" (cooldown), "Skipped: every action failed; it
  is tried again next time" (`failed`), or "Skipped: nothing to do for it"
  (`nobody`: a record no action could act on, e.g. nobody it could be told
  to; counted in the night's skipped figure) and "N more records you can't
  open"; Show more nights. `?run=` opens one night.
- **Rule reviews wait on Work › Mine** (`/work?queue=mine`, Needs your
  decision; the Approvals chip shows them with agent approvals;
  `/brain/review` and `/brain/waiting` redirect to `/work?queue=mine&kind=approval`).
  A review's row: the review's title, "From <rule>", then "12 people across
  3 records" for a survey or "40 to email · 2 skipped" for a campaign (no
  "· 0 skipped" when nothing was), figures tabular, then Approve and Skip,
  each sent once (`ReviewDecision`, unchanged). Approving keeps the reader on
  Mine: the row leaves and the toast links "Open survey", or "Open
  campaign" (the campaign's send, or Campaigns if it was deleted). A refusal
  shows at Approve in the danger colour ("Surveys refused it: …") and takes
  focus. A review expires 7 days after its night, or sooner if the rule's
  segment or trigger changes ("This rule's segment or trigger has changed
  since this review was made, so it has expired."); an expired or
  already-decided row leaves, the toast saying so ("Already decided.").
- **Automate** sits on a segment's page beside Survey these, for its owner,
  opening the rule builder over the segment's page at `/segments/:id/rule`
  with the segment already chosen.

### Plans (Project Management)

Spec `docs/superpowers/specs/2026-10-04-plans-design.md` §2 (plan
`docs/superpowers/plans/2026-10-04-plans-frontend.md`). The pages sit in
`OrganizationsFrame` under the framed bar ("Project Management" on
`/projects`, "‹ Project Management" on every other plans page).

- **`/projects`.** A View group (List, Board; remembered in `localStorage`,
  List by default), **Templates** and **New plan**; then the filter bar: a
  Scope group (Mine, Has my tasks, All I can see: All for someone with
  reports, else Mine), Kind, Owner (outside Mine), Status (List only: Open,
  Draft, Done, Cancelled, All) and a search that commits 300 ms after typing. Every
  filter is in the URL.
  - **List:** one rounded row per plan (`PlanRowItem`): the name, the record
    as a link with the organisation or account icon, the kind chip, the
    owner's initials and name, a milestone bar with `3/5` in DM Mono, the next
    due date in DM Mono ("Overdue" with an icon in the danger colour when
    past), and the status pill (a word, an icon and a tint). A Draft (Agents delivery 2)
    has its own pill (Lucide `PencilLine`, `bg-info-dim text-info`) and shows
    "9 tasks to start" in DM Mono in place of the next due date; it is never
    counted or shown as open. Show more on the
    cursor. Empty: "No plans yet" or "No plans match these filters" with
    Clear filters.
  - **Board:** Not started · On track · At risk · Done, each with its count
    in DM Mono; Show cancelled adds Cancelled. Show drafts (`?drafts=1`) adds a Draft column
    first; its cards are not draggable and have no status menu, and dropping a
    card on it is refused with "Start a draft plan with Start plan." A missing draft count
    reads 0, and a board that holds only drafts shows its empty state while
    Show drafts is off. Editors drag a card between
    the open columns from `sm`, or use its "Status of …" select; Done waits
    until every milestone is done; Not started is never a target. A refusal
    shows in a dismissible alert and the card stays; a move is announced
    politely. Below 768px one column shows at a time, picked from a Column
    group with counts.
- **New plan:** the builder modal (`BuilderDialog`) over the list
  (`/projects/new`) or over an organisation or account
  (`…/:id/plans/new`, the record locked). 1. Record: a search over
  organisations and accounts. 2. Template: cards for Built-in, Yours and
  Shared with you, each with "4 milestones · 7 tasks · 60 days". 3. Review:
  Name ("<Template> · <Record>"), Owner, Start date; each milestone's name and
  due date, its tasks with title, assignee (the role resolved to a person),
  due date and priority, Remove and Add task; counts as `4/12 milestones ·
  7/50 tasks`. Start plan sends once; "This record already has an open
  <Template> plan." links to it; refusals sit at their fields, focus on the
  first.
- **A plan (`/projects/:id`).** The name at 22px; the record, kind, owner and
  "start → target" in DM Mono; the editor's Status select (else a pill),
  Edit, Save as template and a ⋯ menu (Cancel plan, Delete while nothing is
  done); "Started by <rule>" (unlinked for a rule the reader can't read),
  or "Started by the CS agent" when an agent action started it. A Draft
  shows a banner ("This plan is a draft: Start plan creates its 9 tasks, due
  from today.") with **Start plan**, the page's one primary, for editors (else
  "Only the plan's owner or their managers can start it."); Edit and Delete
  work on it, while the Status select, Cancel plan, Add task and the
  milestone Done checks wait for it to start. After a start a status line
  says "Started the plan." and takes focus; `NOT_DRAFT` and `PLAN_OPEN` show
  the server's sentence, `PLAN_OPEN` with "Open that plan".
  The timeline: milestones down a vertical line, each with its date,
  Overdue, `2/3 tasks done`, the editors' Done check, its tasks (checkbox,
  title, assignee, date, priority) and "N tasks you can't see"; Add task for
  editors. Edit turns each milestone into an inline form (name, date, Save,
  Move up, Move down, Remove — refused with "Some of its work is done; mark
  it done instead." when any of its tasks is done) and each task into Edit
  and Remove; Add milestone at the end. A done or cancelled plan shows a
  notice; only task checkboxes stay.
- **Templates (`/projects/templates`).** Built-in, Yours, Shared with you:
  each name opens the template in place (milestones as "Day 0 · Kick-off",
  tasks with priority and role) with Use; yours have Edit and Delete. The
  editor modal: name, kind, description, milestones (name, day) with their
  tasks (title, priority, day, assignee role), counts, and Sharing as
  Segments and Rules. Save as template is the narrow builder dialog (name
  and sharing), then "Saved as …" with Open template.
- **Elsewhere.** Organisation and account pages carry a Plans section under
  the header (open plans flat in one surface, Draft plans in their own list, Show finished (N), Start a
  plan). A task in a plan shows "<Plan> · <Milestone>" under its title in
  the story. The bell gives `plan_started` and `plan_task_assigned` an icon.
  The rule builder's fifth Then card is Start a plan (a template picker).

### Campaigns

Spec `docs/superpowers/specs/2026-10-04-campaigns-design.md` §2 (plan
`docs/superpowers/plans/2026-10-04-campaigns-frontend.md`). The pages sit in
`OrganizationsFrame` under the framed bar ("Campaigns" on `/campaigns`,
"‹ Campaigns" on a campaign, its editor and a new one).

- **`/campaigns`.** Tabs Mine and Shared with me (`?tab=shared`), Show
  archived (`?archived=1`) and **New campaign**. One rounded row per
  campaign (`CampaignRowItem`): the name and its status pill (Draft, Active,
  Archived: a word, an icon and a tint), the segment with its kind's icon,
  the owner, and the last send ("2 Oct · 6 sent · 2 skipped" in DM Mono,
  "Sending…", "Never sent", or "Choose a segment to send" on a migrated
  draft). Show more on the cursor. "No campaigns yet" with New campaign;
  an error with Try again.
- **The editor** (`BuilderDialog`, `/campaigns/new` over the list,
  `/campaigns/:id/edit` over the page; the scrim keeps the draft): Name; the
  segment (my own, grouped by kind) and, for organisation and account
  segments, `RoleFields` ("Who to email at each organisation"); Subject and
  Body with `0 of 150` / `0 of 5000` in DM Mono and three merge-field chips
  that insert at the caret; Sharing. The preview pane (beside from `lg`,
  below on phones) draws the typed text with the footer until the first
  save, then shows the server's rendering for one person of the audience
  (Preview for), 400 ms after typing stops. Save closes it; Send now… saves,
  counts again on the server ("Emails 212 people · Skips 14 unsubscribed ·
  9 emailed in the last 3 days · 3 already received it") and sends once.
  Field refusals sit at their fields; a refusal with no field (Email isn't
  set up…, This campaign is archived., Its owner is no longer active.) sits
  at the Send button and takes focus; a second click after it sends again.
- **A campaign (`/campaigns/:id`).** The name at 22px; status, segment,
  roles, owner and sharing; the owner's Send now… (the narrow builder
  dialog with the same confirm), Edit, Archive or Unarchive, and Delete
  while it was never sent; an archived notice. A migrated draft lists
  "Picked by hand before segments" with "Choose a segment to send". Sends
  are disclosure rows (date, "Sent by …" or "From rule …", figures in DM
  Mono, Migrated, "Sending…" polled every 3 s); one opens as sent (subject,
  body) with its deliveries: All / Sent / Skipped and a Reason select, each
  person linked with their organisation or account, the status and reason
  in words, and "N more people you can't open".
- **`/u/:token`.** Public, light only, no session: "Stop emails from
  <workspace>?" and Unsubscribe; then "You're unsubscribed."; one expired
  page for every bad link; its own words when throttled.
- **Elsewhere.** A contact who unsubscribed reads "Unsubscribed from
  campaigns on <date>" with Re-subscribe (asked first). The rule builder's
  sixth Then card is Send a campaign (a campaign picker and Send without
  review); a night reads "Campaign: waiting for your review" and the like;
  Mine shows campaign reviews (the rule, "4 to email", Approve and
  Skip; records are counted, never named). The bell gives
  `campaign_sent` a megaphone.

### Canvas

Spec `docs/superpowers/specs/2026-10-04-canvas-design.md` §2. Shared by the
organisation and account pages' Maps tab (`components/canvas/MapsTab`), with
its own house-rules suite (`components/canvas/houseRules.test.ts`).

- **Maps tab and `/canvas`.** One rounded row per map (`MapRow`): the name,
  the record, the people count in DM Mono, "Edited by X · <time>". New map
  (`NewMapDialog`): a name and From this record's people or Blank; created
  once, then the editor. `/canvas` is the gallery: search and Show more.
- **The editor (`/canvas/:id`).** The name at 22px (an input on desktop, with
  an sr-only h1; an h1 on phones), the record, who edited, Unsaved changes,
  Save and ⋯ Delete for those who may. The open plans strip. The board
  draws each relationship as one neutral stroke with its label's words; a
  node's ⋯ (44px at every width) opens the person panel or Add a
  relationship to…. Hidden people read "Someone you can't open", with no
  menu, no panel and no lines dragged to them. Sentiment, staleness and
  Unsubscribed are a word and an icon or dot, never a colour alone.
- **Lines and menus on the board.** A line runs between the sides of its two
  cards that face each other (`features/canvas/edgeGeometry`), not from fixed
  handles; cards carry a drag handle on all four sides, invisible until the
  card is hovered or focused or a line is being drawn, and the board connects
  loosely, while saved lines stay handle-less. Lines between the same two
  people (a two-way pair) bow apart, their labels a whole label apart top to
  bottom. A card's ⋯ menu renders in a portal (the shared `Menu`'s `portal`),
  so the board's edge never clips it, opens upward when there is no room
  below, stays inside the viewport and closes on a wheel zoom or pan. Removing a card (its menu or Delete) leaves focus on the board, and
  closing the person panel returns focus to the card that opened it last.
- **Widths.** From 768px the editor shows the tray ("Not on the map",
  collapsed to its button), the board and the person panel, which overlays
  the board below 1024px. Below 768px the map is read-only behind a
  People/Map toggle, defaulting to People.
- **Motion.** None on the board: no transitions, and `fitView` without a
  duration.

### Brain: the frame

Spec `docs/superpowers/specs/2026-10-06-brain-ui-design.md`. Every `/brain*`
route wears the framed bar: "Brain" as its `h1` at 15px, then a
`<nav aria-label="Brain">` of three underline tabs: What changed, What's
being done, and Customers, which stays lit on Feature Requests and
Anomalies. No tab carries a badge. Waiting on you was removed in work in one place delivery 2; what waited there is on Mine and My team and Rest of company. The Knowledge graph lights no tab. The tabs carry `?scope=` only;
below `sm` the row scrolls sideways and never wraps. The scope switch sits in
the bar's actions slot (`BrainControls`), and inline at the top of the page
below `sm`. The body is `BrainFrame`: full width, `px-4 pb-6`, no centred
column, with Ask Revenact's rail beside it (Ask rail, Brain shape). No Brain page draws a DM
Serif Display title. Section headings use the tile label style (11px,
uppercase, `text-ink-muted`), body text is 13px, figures are DM Mono, and
tile figures are 22px. Each of the four questions opens with a row of tiles
(`tileParts`, or `JumpTile` where a tile jumps to a section): a grid of 2 to
5 columns that scrolls sideways with snap below `sm`, loading as
`TilesSkeleton`. Feature Requests, Anomalies and the Knowledge graph lead
back ("‹ Customers", "‹ What changed", keeping the scope) above a 15px
semibold title. The Knowledge graph's Decisions column holds initiatives
and every waiting agent action the reader may read (named "agent action",
an `ink-faint` dot); a builder action has no relation and shows only while
no filter is set. Its detail names the agent and the action, and Open in
Work goes to `/work/activity?action=<id>`, which opens the waiting action's
bundle on Mine. The sidebar has one Brain item (Lucide `Brain`), lit on
every `/brain*` route, with no badge.

### Brain: What changed

Spec `docs/superpowers/specs/2026-10-05-brain-what-changed-design.md` §2.
`components/brain/` with its own house-rules suite
(`components/brain/houseRules.test.ts`).

- **Top of the page.** A toolbar row with the since line and the quiet
  "Knowledge graph" link, then four tiles: ARR, Net revenue retention, ARR at
  risk and Book in good health, matched by the registry keys `active_arr`,
  `nrr`, `at_risk_arr` and `healthy_share` (a key the scope lacks is
  skipped; the registry has no renewals-due metric). Each tile shows its
  label, the figure at 22px in DM Mono, then "down $13.4K, worse" in its
  trend colour. A withheld figure reads "No figure". The scope switch is in
  the bar: a segmented control from `sm`, a select below it, and one scope
  offered reads as a label, not a control.
- **Body.** From `lg` the brief (reading width) and What moved side by side,
  stacked below. Everything we measure runs full width beneath.
- **The brief card.** One bordered surface, never a card nested in a card.
  Its Write buttons ("Write my brief" / "Write the company brief" / "Write
  again") say "Uses AI credits." beside them.
- **What moved.** Rows, not a table: then → now and the change in DM Mono
  tabular figures, the change always a word ("up"/"down"/"unchanged")
  alongside its colour, never colour alone. Why? opens a flat panel inside
  the row, one at a time.
- **Everything we measure.** Rows, not a table (Decision 11): column heads
  from `sm`, each row stacking its own labels below it.
- **States.** A skeleton while loading, "Try again" on error, and the empty
  view (no customers yet) with the scope switch still available.
- No glass anywhere on the page. Knowledge by function has moved to What's
  being done.

### Brain: Waiting on you

Waiting on you was removed in work in one place delivery 2; what waited there is on Mine and My team and Rest of company.

### Brain: What's being done

Spec `docs/superpowers/specs/2026-10-05-brain-doing-design.md` §2. Same
folder and house-rules suite as What changed.

- **Tiles.** Three tiles that jump to their section, setting `?section=` and
  moving focus to its heading (`navigation` "Sections", in place of the
  section links): Initiatives (active, and how many are on track: measured
  and inside their date), Open plans (and how many are at risk), and Rules
  running (and how many fired last night).
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
  "status · 3 of 5 milestones · by date · owner", and "Health 6.2 → 7.1 · ARR
  $40K → $44K" in DM Mono, or "Started before starting figures were kept".
- **Rules at work.** Rows: the rule (a link when you can open it), "segment ·
  On / Paused: reason / Off", and "Last run 5 Oct: fired 4", with "matched
  12 · skipped 2" on your own rules.
- **Company only.** Knowledge by function under the three sections, for
  `view_all_accounts` readers.
- **States.** A skeleton of three sections, "Try again" on error, an empty
  line per section ("No initiatives on your book yet.", "No open plans.",
  "No rules running."), "N more plans on records you can't open".
- **Sections.** Their headings use the tile label style and take focus from
  a tile or `?section=`.

### Brain: What customers are saying

Spec `docs/superpowers/specs/2026-10-05-brain-customers-design.md` §2. Same
folder and house-rules suite as What changed.

- **Top of the page.** A quiet "See on the graph" link (Lucide `Network`) to
  the graph in the same scope, then five tiles that jump to their section:
  Asks (the total), Anomalies (the total, every status), NPS and CSAT (the
  Scores figures, "Not enough answers" under 5) and Negative contacts. From
  `lg`, Asks sits beside Anomalies and Scores beside Sentiment.
- **Asks and Anomalies.** One bordered list each, `divide-y`, rows flat: the
  title, then "Planned · $182.0K · 3 companies · 12 asks, up from 7" /
  "Live · $90.0K · 2 companies · last seen 4 Oct", figures in DM Mono, status in
  words. The header says "Top 5 of 7" when there are more, and See all (the
  bordered button) opens the full page in the same scope.
- **Scores.** NPS, CSAT and CES side by side from `sm` (stacked below), one
  bordered surface: the figure at 22px in DM Mono, the change as a sentence
  ("down 7 pts from +25") in its trend colour, never colour alone, and "22
  answers · 19 before"; "Not enough answers" under 5. Latest comments below as
  a sibling list: "NPS 4 · Uber · 3 Oct", the record linked, then the comment;
  "N more comments on records you can't open".
- **Sentiment.** "4 contacts negative", then who turned negative in the last
  30 days (or "since 20 Sep, when we started tracking changes"): the contact
  and the record linked, "was neutral · 2 Oct".
- **States.** A skeleton of four sections, "Try again" on error, an empty line
  per section. No primary button: the page only reads.
- **Feature Requests and Anomalies** open from See all, in the Brain frame,
  with the Customers tab lit and "‹ Customers" leading back.

### Work inbox and the bundle panel

Agent bundles delivery 1. `/work` is one inbox (`WorkInbox`).

- **The queue rail** (`QueueRail`, 14rem from `sm`): a `nav` of links, one per
  queue (Mine, My team, Rest of company, History) with tabular counts, the
  open one `aria-current`; History has no number, and a queue whose count
  failed shows none. Below `sm` it is a `Select` ("Mine (3)").
- **Kind chips** (`KindChips`) per queue: Mine has seven, My team six; the
  choice is `?kind=` in the URL; each chip has its own empty state.
- **The bundle row** (`BundleRow`): the title, the reason, the step kinds,
  a meta line and one bordered Review. No primary on the list.
- **The panel** (`BundleSheet`) is the organisation page's `Sheet` with
  `size="wide"`, `phone="full"` and `focus="heading"` (the heading takes
  focus; Shift+Tab from it wraps inside the trap). The footer is pinned:
  Run N selected is the one primary ("Choose at least one step to run."
  when none is ticked), Reject bundle is bordered and opens an inline reason
  form (Why takes focus; Cancel empties it and returns focus to Reject
  bundle), and the discard bar ("Discard your edits?", Keep editing focused)
  answers Escape, Close and the scrim whenever there are edits, a filled
  reject form included; Keep editing goes back to the form with its values,
  or to the steps with focus on Run. The meta line names the record once,
  with who the bundle is for ("For the whole company" when nobody); a long
  title wraps on phones. A lost bundle (404) titles it "You can't open that
  any more." with no record line and no footer.
- **Steps** are one `ListCard` of flat rows (`BundleStep`). The tick and its
  "1. Create a task" heading share one 44px choice label. A row shows the
  title, "Can't be undone" with `ShieldAlert`, the disabled reason (the step
  stays unticked), the preview (a placeholder in it, e.g. in a task's title,
  is a semibold chip, `PlaceholderText`, never braces; "Send a campaign: …"
  and "Send a survey: <name> (<segment>, <roles>): <subject>" for the send
  kinds), the fields (`BundleStepFields`; a Send step's audience
  sentence only while it waits), the state line ("Applied", or "Saved as a
  draft." for a send saved only as a draft), result links and Undo. A
  failed step shows its error and Retry.
- **Outside steps** (agent bundles delivery 3: email reply, Slack reply,
  Jira create, Jira assign) edit in the panel through `BundleOutsideFields`,
  only the fields the server lists as editable; labels sit above, errors
  below. All four say "Can't be undone" before Run, and Run stays the one
  primary.
  - **Email reply.** "From <mailbox>" when the reader's mailbox can send
    (otherwise "Connect your mailbox to send this." with its link), "Goes in
    the same email thread." on a threaded reply, then To and Cc (one typed
    line each, "Separate addresses with commas."; what is typed is kept
    while the list goes up), Subject and Reply.
  - **Slack reply.** "Posts as <identity>", a Channel select and a Message
    box.
  - **Jira comment** (round 2 D1). A step that comments on a ticket reads
    "Comment on SUP-12 in Jira" ("Comment in Jira on the issue from step 1"
    when the issue is a placeholder), says "Only your team sees this comment in Jira."
    when the comment is internal, shows a multi-line Comment field (the
    editable `body`) and "Can't be undone". Once run, its result link reads
    "Open the comment on SUP-12 in Jira (opens in a new tab)", in the panel
    and in History.
  - **One Jira error per step.** When Jira's live lists (projects,
    issue types, priorities, people) fail, the step shows one alert with the server's
    sentence and one Try again, not one per list.
  - **Placeholders are never read by position.** The backend lists a step's
    placeholders in stored-key order, so the UI never relies on their order:
    it finds one by its step and key, or by its field (the "Filled in from
    step N" hint names the lowest source step).
  - **Jira create.** "Created in Jira as <account>", Project, Issue type
    (shown once a project is chosen; until then "Choose a project."),
    Summary, Description, Priority (with "Jira's default") and Assignee
    (the label first, then a search, "Search people in Jira", then the list, with "Unassigned"). When the model
    named a person Jira has not been asked about, the line reads "<name>
    (matched in Jira by email when it runs)".
  - **Jira assign.** "Assigned in Jira as <account>", then the same Assignee
    search, with no "Unassigned" option.
  - **The pick lists** (`PickSelect`, `PickSearch`, `usePickList`) load live:
    "Loading Jira projects…" with the stored value still shown, then the
    options; a failure shows the server's detail when it sent one (for
    example "Couldn't reach Jira. Try again."), else "Couldn't load Jira
    projects.", with a bordered Try again; an empty list reads "Nothing to choose from." (a search
    with no hits, "Nobody matches."). A stored pick whose id is empty (the
    model's choice, resolved by name when the step runs) shows selected by
    its name; changing Project keeps the issue type's name and clears its id.
  - **Blocked.** A step the tool cannot take yet is unticked with its reason
    and **Open Connections** (a `LINK` with a 44px target) to Settings ›
    Connections. A step its tool blocks (a reason and a link) also shows what
    it would post, read only (`BundleStepText`): Slack "Message", a reply
    "Reply" with "To", Jira "Summary" and "Description", a comment "Comment",
    placeholders as chips. A step blocked only by rights keeps its excerpt.
  - **Who acts in Jira** (round 2 D2). When the person has linked Jira the
    lines read "Created in Jira as you (Carl Lee)", "Assigned in Jira as you
    (…)" and "Comments in Jira as you (…)". Otherwise the connection's name
    stays, with a hint under it: "Link your Jira account to act as yourself."
    and an **Open Connections** link, or "Your Jira link doesn't cover
    acme.atlassian.net." A lost link is the step's own reason and link.
  - **Slack channel** (round 2 D2). When the step lets the channel be chosen,
    a "Search channels" box over a "Channel" select (`PickSearch`, 300 ms
    pause) lists the channels the bot is in: "#support (This thread)",
    "#escalations (Not synced)", "#leads (Not synced, private)". The server's
    note shows under it as a meta line, for example "Slack didn't list its
    other channels. Try again in a minute." Against an older backend the
    connection select stays.
- *(Superseded 2026-10-16 by the Connections rows, see "Connections rows" below; kept for history.)*
- **Settings › Connections: Your Jira account** (round 2 D2,
  `components/integrations/JiraLinkSection`, under "Your mailbox"; words in
  `features/connectors/jiraLinkText.ts`). Shown when Jira is set up and the
  workspace has a Jira connection, or the person has a link. Not linked: "Link
  it so the Jira steps you run act as you. Until then they act as the Jira
  connection's account." and a bordered **Link your Jira account** ("Opening
  Atlassian…" while the browser leaves). Linked: "Linked as" (name and email)
  and "Acts as you in" (the connections' names, or "None of this workspace's Jira
  sites"), and a bordered **Unlink** behind a confirm ("Unlink your Jira
  account?"). Lost: the alert "Your Jira link stopped working. Link it again,
  or unlink it." with **Link again**. The landing shows "Jira account linked."
  or "Could not link Jira: <detail>" above the sections. Loading and read
  errors are their own lines.
  - **Result links** (`StepLinks`, panel and History): app pages open in the
    app; the tool's own pages open in a new tab, drawn with Lucide
    `ExternalLink` and the hidden words "(opens in a new tab)".
  - **The bell.** `agent_step_failed` gets Lucide `OctagonAlert` and opens
    the bundle in History at `/work?queue=history&bundle=<id>`.
- **The summary line** after a run takes focus ("2 done, 1 failed").
- **History rows** are laid out as bundle rows (the bundle icon, or a
  message bundle's channel icon, then the column), say who a bundle was
  for as its queue row does ("For Customer Success", "Unassigned"), and name who ran the bundle ("Ran by X") or "Applied on its
  own"; a rejected, expired or replaced row shows no finisher, and a
  rejected row names its reason ("Not relevant"), never the note. A finished
  bundle opens read-only with links and Undo.
- **Department and Unassigned queues** (agent bundles delivery 2). The rail
  gains a queue per department under Rest of company (tabular count) and,
  for an admin, Unassigned; History stays last; the phone select lists them
  all. A department's queue is titled "Waiting in Customer Success" and
  Unassigned "Waiting for an owner"; each shows bundles only with no kind
  chips (`?kind=` is ignored), loads with "Loading the queue" (also while
  the queue list itself is still loading, so no title shows without its
  name) and has its own empty state.
- **The source line** (`BundleSource`) on a message bundle: the channel icon,
  the channel in words, the ticket or sender and the last message time in
  the reader's zone, with " · " ending each part so a wrapped line never
  starts with a dot; "Open in Zendesk" opens the ticket in a new tab. The
  panel's meta line shows the source label only for nightly bundles (the
  source line names the channel); a queue row's meta line names the source
  label (for example Zendesk) for message bundles. A routed bundle says "For Customer
  Success" or "Unassigned"; an owner-routed or nightly one says nothing.
- **Saved edits.** A step field saves when it loses focus: "Saving…", then
  "Saved."; the step reads "Edited". Closing and reopening keeps the edit,
  and Escape with an unsaved field saves, then closes. The discard bar now
  appears only where edits would be lost: a step whose save failed, a failed
  step's edits on a partly done bundle, and a filled reject form. A bundle
  lost mid-save (404) closes without asking. A save that goes through
  clears that step's errors and an earlier save's form alert.
- **The newer-message banner** (`NewerMessage`): a bordered note ("New
  message since this was edited") with a bordered Refresh suggestions (busy:
  "Refreshing…", and Run and Reject are held meanwhile); the answer
  "Suggestions refreshed." takes focus and the list behind the panel reads
  again. Edited steps are kept, the others replaced; when a refresh leaves
  the whole bundle empty (superseded) the panel says "The agent no longer
  suggests this." instead. Run stays the one primary. On phones the button
  drops under its text; from `sm` they sit side by side.
- **History** names who rejected a bundle ("Rejected by <name>") beside its
  reason.

### Work: Mine's body, My team and the task panel

Spec `docs/superpowers/specs/2026-10-07-work-round-design.md` §1.5 and
`docs/superpowers/specs/2026-10-12-work-one-place-design.md` §5 (Mine,
delivery 1). Folders `src/components/work/`, `src/pages/work/`,
`src/features/work/`, with their own house-rules suite
(`components/work/houseRules.test.ts`, no em dash in any of the three
folders).

- **The bar.** `/work` wears the framed bar with "Work" as its only h1.
  There are no tabs: the queue rail below (Mine, My team, Rest of company,
  History) replaces the old My work, Team and Activity tabs (see Work inbox and the
  bundle panel).
- **The sidebar.** One Work item (Lucide `ListTodo`), first in the sidebar (Work, Brain, Copilot, Dashboard since 2026-10-17), lit
  on every Work route. Its badge is `GET /work/feed/count/` `badge`; its
  name says each part it has ("Work, 3 to decide, 1 overdue", "Work, 3 to
  decide", "Work, 1 overdue"). Brain has no badge.
- **Work home: the daily brief (2026-10-17).** Work is the home page. Mine
  with no kind chip is a brief, in this order: the greeting in DM Serif
  Display at 22px and 400 ("Good evening, Tushar"), a muted one-line summary
  joined by ` · `, then three `Tile`s (Needs you, Due today, Done with
  Revenact; one column below a 36rem queue column, three across above; the
  overdue meta is the only red, and only when something is overdue), Add a
  to-do (below `lg`) and the chips, then **Ready to run**: one `ListCard`
  of the `decide` group, a bundle drawn with its source in the meta line and
  its steps as quiet `bg-subtle` chips joined by chevrons, Review & run on
  the right from `sm`. The first row's button is the primary (Ready to run is
  the brief's one call to act; Add a to-do keeps its own). Five rows, then
  Show all expands in place. Under it, from `xl`, **Your to-dos** (the task
  groups, each with its h3 subheading) beside **Suggested** (five compact
  rows, actions in `ROW_ACTIONS`), stacked below `xl`. The brief takes the
  full width to the right pane; rows cap their own text at 68ch. Empty
  sections are a single muted line, not an empty state. A chip shows the
  plain grouped list below.
- **Mine** (`/work?queue=mine`; `/work/mine` redirects here). `WorkFrame` (a reading column capped at `max-w-5xl`, at the bar's left edge; the gear sits on its own line under the heading below `sm`).
  - **Quick-add** is the first card: a labelled box "Add a to-do" and
    **Add**, the page's one primary; More (a disclosure, `aria-expanded`)
    opens the record search (`RecordStep`), Due date, Priority and, once a
    record is picked, Who does it (the record's people, those who can't
    open it disabled). Labels above, errors below in the server's words;
    a refusal keeps the text and focus. Add is `aria-disabled` while it
    sends, so focus stays on it; after a success focus stays in the box.
  - **The chip row** under it: All · Tasks · To-dos · Approvals ·
    Questions · Suggested, each `aria-pressed`, in a row that scrolls
    sideways on phones rather than wrapping.
  - **Groups.** Needs your decision, Overdue, Today, This week, Later, No
    date, Blocked, Suggested; each a 15px heading with its count in
    tabular figures over one bordered `ListCard`; empty groups are not
    drawn. Show more (quiet) sits in the card's footer with "Showing 50
    of 72" while the server has more; when its page lands, focus moves to
    the first new row (focusable for that, with the accent ring inside the
    card).
  - **Rows** are flat and divided (`divide-y`), never cards: an icon by
    kind (Lucide `CircleCheck` for tasks and to-dos, `Bot` approvals,
    `ListChecks` rule reviews, `MessageCircleQuestion` questions, `Mail`
    drafts, `Lightbulb` suggestions), the title, then one 11px meta line:
    the record (a link) · "Due 5 Oct 2026" or "No date" (or who it is from
    · the date it arrived), "Overdue" in `text-danger-ink` in the Overdue
    group, the priority, and "Only you" with a Lucide `Lock` on a to-do.
    Task and to-do rows lead with the circle Done (44px, 36px from `sm`),
    and their title opens the task panel; a task row without Done (the
    Team queue's) leads with its kind's icon instead, with no gap. Approval rows reuse
    `AgentActionDecision` (Apply, Reject with note), review rows
    `ReviewDecision` (Approve, Skip) with their counts in tabular figures;
    on a phone their two buttons wrap. Questions answer in place (Answer
    opens a labelled box with Send answer and Cancel; sent once, the row
    leaves with the toast), with a quiet "Open thread" to the
    organisation's Knowledge tab when the question is on one; drafts
    Open draft. Suggestion rows show the facts as a short bulleted list,
    then Add to my work (bordered), Assign and Dismiss (quiet, each
    opening its existing form below); below `sm` Assign and Dismiss move
    into a ⋯ menu ("More actions") and Add to my work stays.
  - **Failure notices.** A source that failed shows one bordered notice
    card in its group's place ("Couldn't load approvals and questions.",
    `role="alert"`, `text-danger-ink`) with Try again; the other groups
    still show.
  - **Hidden.** "N more on records you can't open" under the groups,
    muted.
  - **The toast.** Fixed to the bottom (full width less 16px gutters on a
    phone, bottom right and at most `max-w-md` from `sm`) on the overlay
    surface: the sentence, an optional link (Open task, Open survey, Open
    campaign), Undo (bordered, only for Done and an undoable agent
    action) and Close (an icon button). No timer and no motion; the next
    toast replaces it. After a row leaves it takes focus (the row is
    gone); after quick-add it does not. Close returns focus to the element
    that had it before, or to the quick-add box. The sentence never ends
    in a doubled mark: a title ending in "?" or "!" gets no full stop.
  - **The gear.** For `manage_org_settings`, an icon link "Work settings"
    (Lucide `Settings`) in the header's actions, to
    `/settings/recommendations`.
  - **States.** A skeleton of one list, Try again, and the empty state
    "Nothing waiting on you." ("Add a to-do above. Approvals, questions
    and tasks show here when they need you.") under quick-add; under a
    chip it names that kind ("No approvals waiting.") with a quiet "Show
    all" button back to All (focus to the All chip).
- **Waiting on your team** (My team and Rest of company queues, above the per-person counts):
  My team · Company (Brain's switch without Me); a section headed "Waiting
  on your team" / "Waiting on the company" with To decide, Overdue and
  Suggested at `h3`, Mine's rows (approvals Apply/Reject where allowed,
  rule reviews read-only, questions answered in place with `manage_users`, overdue
  tasks open the panel with no Done, suggestions Assign and Dismiss), each
  meta line starting "For <name>" or "For the whole company"; Mine's
  toast and Undo; "N more on records you can't open". Empty: "Nothing is
  waiting on your team." Ask the agent: a bordered button with Lucide
  `Sparkles` in the section header at Company scope for view-all, its hint
  "Runs the Ops agent now. Uses AI credits." under it, a status line, a
  refusal as an alert. After a run the button is held (`aria-disabled`)
  until the queue's next whole read lands, so a second press cannot
  double-spend.
- **Team people** (`TeamPeople`, under My team's queue). One row per person in one `LIST`: a chevron, the name
  ("Unassigned (was X)" for a deactivated person), then "5 open · 1
  overdue · 1 blocked" with the figures in DM Mono and the overdue count
  in `text-danger` when above zero, and "Oldest due 3 Oct 2026" under it.
  The row is a button (`aria-expanded`, its name the counts in words) that
  opens that person's open tasks below it, flat, with the same rows minus
  Done. "N tasks you can't open" under the list. States: a skeleton, Try
  again (page and row), "No open tasks you can see."
- **The task panel.** The organisation page's `Sheet` at `?task=<id>` on
  any route: a panel from `sm`, a bottom sheet below. A polite status
  line says "Saved." after each save. Title (saved on Enter or blur), then
  Status, Assignee, Due (saved on Enter or blur) and Priority in two
  columns, Blocked's "Blocked on" input with Mark blocked / Save reason
  and Cancel, then the Description with Save description. A control being
  saved dims (`aria-disabled`) and keeps focus. Labels above (11px
  uppercase), errors below. A field the reader may not change is plain
  text. Then the record, plan or source and "Created 1 Oct 2026 by Mona
  Manager", and Activity: the trail in sentences ("You marked it blocked:
  Waiting on legal"), a comment's words under a left rule, relative times
  in DM Mono, and the comment box with its quiet bordered Comment button.
  States: a skeleton, Try again, "This task isn't there, or you can't
  open it." **On a to-do** the facts read "Only you" with a Lucide
  `Lock`, Assignee reads "You" as text, Due can be cleared, and an
  "Attach to a record" section under a rule holds the record search and
  one warning, "Attaching a record makes this to-do and its history
  visible to people who can see that record. This can't be undone.";
  once a record is picked it adds a due date for a dateless to-do and
  Attach (bordered, described by that warning).
- **The bell.** `task_assigned` gets Lucide `SquareCheck`; `recommendations_waiting` gets Lucide `Lightbulb`; `task_overdue` gets Lucide `AlarmClock` and `task_escalated` Lucide `TriangleAlert` (delivery 3), both opening the task panel like `task_assigned`; `agent_proposal_waiting` ("AI proposals are waiting for your decision.", at most once per person per workspace day) gets Lucide `Sparkles` and opens `/work?queue=mine&kind=approval`.

- **Settings › Connections: what agents may do** (`AgentAccess`, under each
  tool connection). A line "Agents: Read only", or "Agents: Can act" (with
  "Allowed by <name>" when known), and for people who manage integrations a
  bordered switch: **Allow agents to act** / **Make read only**, busy as
  "Allowing…" / "Saving…". The hint under a read-only line, shown only to people who see
  the switch, says what the tool needs ("Slack will ask you to let Revenact post.", "Needs a Slack bot token
  that can post (chat:write).", "Revenact checks this Jira account can create
  and assign issues."); a tool agents cannot act in reads "Agents can't act
  in Zendesk yet." with no button; a member sees the line and no button. A
  refusal is one danger line under it (the server's sentence, or "Could not
  change what agents may do."). For Slack the switch keeps its busy word
  while the browser leaves for Slack's consent, so a second press starts
  nothing; the return lands on `/integrations?connector=agents_on`, and the
  page then shows "Agents can now act through this connection."
  - **Reconnect hint** (round 2 D1). A connection whose tool is broken
    (`agents.needs` is `reconnect`) reads "Reconnect <tool> before agents can
    act." with no Allow button.

### Copilot Cockpit: Next up

Work in one place delivery 2 (`NextUpCard`, on `/copilot`'s Cockpit). It
replaces My tasks, and the sidebar's Questions for you is gone.

- **Next up**: the first five of decide, overdue and today from Mine's
  feed (no suggestions), the three groups' total beside the heading, Open
  Work to `/work?queue=mine`, Mine's rows acting in place, a question answered
  inline (Answer, a labelled box, Send answer, Cancel, and "Open thread"
  on an organisation), Mine's toast for what happened (it takes focus;
  Close returns it to the card), its own Try again. The heading row is the header of one
  `ListCard`, and its loading, error and empty states ("Nothing waiting on
  you.") live in that same card, so there is no card in a card. A failure
  never blanks the Cockpit. Undo as on Mine: Done reopens, an applied
  agent action undoes while its 7-day window is open.

### Settings › Work › Recommendations

Spec `docs/superpowers/specs/2026-10-07-work-round-design.md` §2.4.
The Recommended page moved into Mine's Suggested group in work in one
place delivery 1 (`/work/recommended` redirects to
`/work?queue=mine&kind=suggestion`).

- **Settings › Work › Recommendations** (`/settings/work/recommendations`,
  the Work item's first tab). The settings frame's h1 ("Work") and its
  intro, then, for an admin: Who receives them (two radios, each with its
  note under it, saved the moment one is chosen), Signals (four rows, Renewal due, Health drop, Urgent tickets and
  Anomalies, one `LIST` row
  per source: a switch with its name, saved at once, an 11px note, and its
  threshold inputs, labelled above, narrow from `sm`), Dismissals (After a
  dismissal (days)). Switches and radios show a "Saved" toast with Undo;
  thresholds and the cooldown are drafts in the page's save bar ("Unsaved
  changes · Discard · Save"; Enter in one saves through it). Then Run now
  (bordered) and what it did ("Run finished: 2 new, 5 updated, 1 expired.
  2 people told.", failed sources in `text-warning`; a failed notice is its
  own sentence, "Telling people about them failed this run. The
  recommendations stand.", never listed as a source). A member reads
  "Only admins can change these." and the values as text, figures in
  tabular body numerals. States: a skeleton, Try again.
- **Settings › Work › Tasks** (`/settings/work/tasks`; spec §3.3). On
  `WorkSettingsFrame` (`pages/settings/`: the frame's h1, intro, skeleton
  and Try again, shared with Notifications and Recommendations; a failed
  read says "Nothing is shown rather than settings that may be out of
  date.", and after Try again focus goes to the h1 (`tabIndex -1`) if it
  loads or back to Try again if it fails). For an admin: "Tell the manager
  after (working days overdue)" (a narrow number input) and Working days
  (`DayChips`: seven toggle buttons, Monday to Sunday, full day names as
  their labels) are drafts in the save bar; Timezone (a select, UTC first,
  then the browser's IANA zones) saves at once with Undo. Each has an 11px
  note and its error below in the server's words. A member reads "Only
  admins can change these." and three lines of text.
- **Settings › Work › Notifications** (`/settings/work/notifications`).
  When the server cannot send email (`email_ready` false), everyone first
  reads a warning `Banner`, "Email isn't set up on this server yet: digests
  are skipped". For an admin: Daily digest (a switch with its note) and
  Send after (a select of 00:00 to 23:00, noted "Local time in <timezone>,
  set under Tasks."), both saved the moment they change, with Undo; there
  is no save bar on this tab. A member reads the two values as text.
- **Briefs** is the Work item's fourth tab (`/settings/work/briefs`). It
  keeps its own "Schedule it" / "Save" button: the Slack URL is write-only
  and the schedule is one create. The Work tabs read Recommendations,
  Tasks, Notifications, Briefs.
- **The trail** (delivery 3): "Revenact reminded Carl CSM: 2 days
  overdue." and "Revenact told Mona Manager: 2 working days overdue."
  ("you" for the reader).

### Work: History and agent actions

Agents spec `docs/superpowers/specs/2026-10-08-agents-round-design.md` §1.8;
contract `revenact-backend docs/superpowers/plans/2026-10-08-agents-actions-api.md`.
Folders `src/components/agents/`, `src/features/agents/`, with their own
house-rules suite (`components/agents/houseRules.test.ts`, no em dash in any
of them). The Activity page (`/work/activity`) is gone: what it listed is
History on `/work`, one row per finished bundle.

- **History** (`/work?queue=history`, the rail's last queue, no count) is
  open to every member and lists only what the reader may open. A toolbar of
  three `Select`s (Agent: All agents, CS agent, Sales agent, Ops agent; Step
  kind: All step kinds, then the kinds; Status: All statuses, then the
  finished ones) writes `?agent=`, `?step_kind=` and `?status=`; Previous
  and Next write `?page=`. A row is flat inside one bordered list: the
  title, the meta line (who ran it, "Ran by Mona Manager", or "Applied on
  its own"; a rejected, expired or replaced row shows no finisher; a
  rejected row adds its reason, never the note), and a
  bordered Review that opens the bundle read-only (`?bundle=<id>`) with its
  result links and Undo.
- **Old links.** `/work/activity` lands on History; `/work/activity?action=<id>`
  reads the action and opens the bundle it belongs to: on Mine while the
  action still waits (`proposed`), in History otherwise (the bell's
  `agent_action_undone` link still uses it). A read that fails lands on
  History.
- **Delivery 2 kinds.** A `draft.reply` preview reads "Draft a reply to Ann
  Lee <ann@x.com>: Re: Renewal terms" (or "Draft a reply on TKT-1042: Export
  fails"), with the reply's first lines below it in a quiet `blockquote`. A
  `plan.start` reads "Start a plan: Onboarding, 3 milestones, 9 tasks". The
  Action filter lists both, between File a note and Start an initiative.
  Undo on a sent draft is refused in the server's words ("This draft has
  been sent."), with no Now and Agent set line.
- **Delivery 3 kinds (the builder).** "Build a segment: Poor health
  renewals, 2 conditions, 12 organisations" (the count is what the reader
  may open); "Build a scenario: Health watch, on Poor health renewals" with
  the server's trigger and steps below it ("Entered the segment · Task the
  owner · Notify me"); "Draft a campaign: Champion check-in (At-risk
  organisations, Champion): Checking in, {first_name}" with its opening
  lines in the same quiet `blockquote` a reply draft uses; "Map a record's
  people: Pizza Hut people, 6 people"; "Write a plan template: Save play
  for at-risk renewals (Save), 3 milestones, 9 tasks". Four are
  workspace-level, so their rows name no record. The links go to
  `/scenarios/rules/<id>`, `/campaigns/<id>`, `/segments/<id>`,
  `/canvas/<id>` and `/projects/templates/<id>/edit`, and leave once the
  action is undone. An undo refusal is the server's sentence ("A scenario,
  campaign or survey uses this segment now.").
- **Made by an agent.** A segment, a scenario (rule), a campaign, a map and
  a plan template an agent action made show "Made by the Ops agent,
  approved by Alice" (11px, `text-ink-muted`, Lucide `Bot`) under their
  owner or record line, from the server's `made_by`; a template shows it on
  its row in Templates and at the top of its editor. One shared component,
  `components/agents/MadeByLine.tsx`; nothing shows when a person made it.
- **Undo.** A quiet button when `undo` is not null. When `undo.allowed` is
  false a sentence shows instead: client copy chosen by the server's
  `undo.reason` code (`expired`, `cant_decide`, `changed_since`). A refusal
  to an Undo that was sent is shown in the server's words.
  `CHANGED_SINCE` adds "Now: Churn · Agent set: Renewal" with both values in
  DM Mono. Success replaces the row and says "Undone: <title>." in the page
  status, which takes focus. A 409 `ALREADY_DECIDED` also replaces the row,
  with the server's sentence ("Mona Manager already undid this."). Undo is
  open for 7 days after an action applies.
- **The bell.** `agent_action_undone` gets Lucide `Undo2` and opens
  `/work/activity?action=<id>`, which resolves to History as above.
  `agent_draft_ready` gets Lucide `FilePen` and opens
  `/communications?draft=<id>`.

### Work: Needs a customer (messages that matched no one)

Agent bundles round 2 delivery 3. Slack and Jira messages that matched no
customer wait in the queue of the department their connector belongs to, or
in Unassigned when the connector has none.

- **The list.** In a department or Unassigned queue, a `ListCard` titled
  "Needs a customer" with its count (an `h3`, like the queue's groups) above
  "To decide". It is not drawn when the queue has none, and the queue's
  empty state shows only when both the bundles and this list are empty.
  While it loads it reads "Loading messages that need a customer"; a failed
  read is a `role="alert"` "Could not load the messages that need a
  customer." with Retry. It pages 25 at a time with Show more; a refused
  cursor reloads the list from the top.
- **A row** (flat `divide-y`). The title, then a meta line such as "Jira SUP
  · SUP-31 · from Ann Lee (ann@newco.io) · 9:12 AM" (a clock time today, a
  full date another day), the text clamped to three lines with Show all or
  Show less when it is over 280 characters, and "Deleted on 13 Nov if no one
  matches it.". A `critical` priority shows the shared danger `Badge`
  "Critical". The actions: **Match to a customer** (bordered `BUTTON`),
  **Dismiss** (`QUIET`) and, when the message has a link, "Open in Jira" or
  "Open in Slack" (`META_LINK`, new tab, `rel="noreferrer"`). The queue has
  no primary button.
- **Match to a customer** (`BuilderDialog`). The shared record search
  (heading "Customer or account"), and, when the sender's email is known and
  not yet a contact, an unchecked checkbox "Also add ann@newco.io as a
  contact of the record, so their next messages match by themselves.".
  **Match** is the dialog's one primary ("Matching…" while busy). A refusal
  of the record or the contact sits under its field; "not covered" and
  "gone" show as the dialog's alert, and gone also removes the row. Success
  closes the dialog, removes the row, lowers the count and toasts "Matched to
  Pizza Hut. An agent reads it at the next run.".
- **Dismiss** asks first (`ConfirmDialog`): "Dismiss this message?", "It
  leaves this list and its text is deleted now. Revenact won't list it
  again.", confirm "Dismiss". Success removes the row and toasts
  "Dismissed.".
- **The rail.** A routed queue's count is its bundles plus its messages that
  need a customer; the phone select's option reads the same. When the server
  sends no such count, the bundle count shows alone.

### Slack as a conversation

Slack escalations delivery 1. A colleague's Slack message is a conversation on
the customer it names (or the channel's customer), not a ticket.

- **The story row.** On an organisation's and an account's Story, a Slack
  thread is kind `slack` (Lucide `MessagesSquare`) under Conversations; the
  Sources picker lists it as "Slack". The meta reads "Slack thread · Faiz
  Jamal · via Slack", the title is the top message's first line, and the
  summary is the server's "#all-alfiee · 2 replies". Tickets does not list it.
  The title is a button (`aria-haspopup="dialog"`) that opens the thread, as
  an email with a thread does; Escape closes it and focus returns to the title.
- **The thread** (`SlackThread`, a `Sheet` modelled on `EmailThread`). The
  title is the thread's title and the description "#all-alfiee · 3 messages".
  One `<ol>`, oldest first: the poster's name (13px semibold), the time
  (11px, muted, tabular), the text (`whitespace-pre-line`, wraps); the bot's
  own messages carry a `Badge` "App". Then the "Filed under" line: "Filed
  under Globex (QA) because the message names it." / "because the channel is
  set to it." / "Matched to Globex (QA) by hand." (nothing for an earlier
  import), then "Open in Slack" (`META_LINK` with `ExternalLink`, new tab,
  `rel="noopener noreferrer"`) when the link is http(s). The sheet has no
  primary button. Loading is `role="status"` "Opening the Slack thread"; a
  failed read is a `role="alert"` with the server's sentence or "Could not
  open this Slack thread." and Try again; a 404 reads "This Slack thread is no
  longer available to you.".
- **Mentioned chips.** In "Match to a customer", a Slack message that names
  customers shows a "Mentioned" row of `FilterChip`s above the search, one per
  record. Pressing one picks it (`aria-pressed`, and the record search shows
  it chosen); clearing the record unpresses it. Match stays the one primary.
  A Slack message never offers "Also add ... as a contact": the sender is a
  colleague.
- **Choose channels (Slack escalations D3).** A Slack connection's actions
  menu (admins) has "Choose channels" in place of "Choose its customer";
  it opens `components/integrations/SlackChannelsPanel.tsx` inside the row,
  never together with "Change who sees it". The row's state line reads
  "syncs 3 of 4 public channels" (`features/connectors/slackChannels.ts`,
  `scopeText`); an older backend without the counts keeps the earlier words.
  The panel is a bordered quiet list (`divide-y`), with no primary of its own:
  - **Top.** The summary ("Syncs 3 of 4 public channels. New ones are added
    on their own."), then the events line: "Events: receiving. The last one
    arrived 5 minutes ago." or "Events: not set up. Revenact checks one
    channel at each sync until they are."
  - **The join note.** While Slack has not granted `channels:join`, "Slack
    hasn't let Revenact join channels yet. Approve the app again so it can;
    until then it reads only the channels it is already in." with a `QUIET`
    **Approve again** (reconnects). Neither shows once the scope is granted.
  - **Search.** Above eight channels, a "Find a channel" `SearchInput`;
    "No channel has that name." when nothing matches.
  - **A row.** "#name" (semibold) over a meta line of parts joined with
    " · ": "Shared with another company", "Not synced", then why it is not
    read ("Joins on the next sync", "Revenact isn't in it", "Someone removed
    Revenact from it", "Slack wouldn't let Revenact join it"), "Replies
    there never carry Jira links" (shared and synced), the conversation
    count ("No conversations yet" / "2 conversations"), and "Files under
    Globex (QA)" or "Files under the customer each message names". The
    **Sync** switch ("Sync #random", `min-h-11`, busy while saving) and a
    **Customer** `QUIET` button ("Choose the customer of #random",
    `aria-expanded`).
  - **The Customer form** opens under its row (`ChannelCustomerForm`, now for
    any subject): the radios "Any customer the message names" and "Always
    this customer:", the shared record search (an "Organisation or account"
    searchbox), **Save** as the only primary and Cancel quiet. A refusal
    shows inside the form only; a switch's refusal is a `role="alert"` under
    its row.
  - **The status line** (`role="status"`): "Now syncing #random.", "Stopped
    syncing #random.", "#globex-escalations now files under Globex (QA).",
    "#globex-escalations now files under the customer each message names."
    Starting another change clears it.
  - **Done.** A `QUIET` **Done** at the panel's foot, after the list and also
    under the empty and error states, closes the panel and returns focus to
    the row's "More for Slack (workspace)" button. A channel saves one change
    at a time (the switch and its Customer form share it); closing the
    Customer form returns focus to that row's Customer button.
  - **States.** Loading "Loading channels…"; error "Couldn't load the
    channels." with Retry; empty "No public channels yet" / "They appear
    after the next sync."
- **A Communications source (owner, 2026-10-16).** The sidebar's
  Communications group (`pages/communications/sources.tsx`) is the inbox,
  Gmail, Slack and Jira. Slack narrows the inbox to `?kind=slack`: the Slack
  threads on records the reader may open, newest first, read as Slack
  showed them, each a "Slack thread" row whose detail offers **Open in
  Slack**. Slack has no folder tile and is not in the counts. A thread is
  still a conversation on its record, never a ticket.

### Slack escalations: the thread decides

Slack escalations delivery 4 (frontend). A Slack thread where colleagues settle
who takes a customer's problem becomes one bundle; the screens show what the
server decided and let the reader change it.

- **The reply first.** An escalation bundle (`bundle.escalation` not null)
  lists its Slack reply step first and the others by position. The reply keeps
  its run number and a meta line under its heading reads "Runs last, once the
  Jira issue exists" ("Runs last" when the bundle has no Jira issue). Every other
  bundle is listed as before.
- **Handled by** (`components/work/EscalationHandler.tsx`). A label, a source
  line and the person: `Assigned by the thread: Jesh, "@Faiz Jamal can you take
  this?"` and `Faiz Jamal (Customer Success)`; or the unresolved, team, head and
  nobody sentences the server's `via` selects; after a change, "The thread
  said: ..." above the new person. After a change to "Whoever handles a
  department" (R5) the server keeps the thread's decision, so the block still
  reads "The thread said: ..." above the head ("Jesh Sanghvi (Engineering
  head)") or the account team's person, never "No one was named"; when that
  department has nobody, "Choose who handles this" shows where the person
  would. It is a row inside the panel, not a card.
  When `can_change`, a `QUIET` "Change" ("Choose" when nobody has it) opens an
  inline form: a "Person" `Select` ("Whoever handles a department" first, then
  every active member as "Name · Department"); that first option adds a
  "Department" `Select`. The current person is always an option, so the select
  shows them while the members load or if they fail. Saving the person or
  department it already has closes the form and sends nothing. Save is `BUTTON`
  ("Saving…" while it works, the panel's Run stays the one primary) and is
  hidden once the bundle can no longer be changed; Cancel is `QUIET` and returns
  focus to Change, or to "Handled by" when Change is gone. A
  field refusal sits under its select (`FIELD_ERROR`), any other above the
  buttons (`FORM_ALERT`); a refusal that carries the bundle replaces the panel's
  copy, and a refused step save keeps the form open. The panel then says "Now
  handled by Erin Engineer."; when the answer has no handler (nobody handles
  that department) it says only "Choose who handles this", never "Now handled
  by whoever handles <Department>.". That status line and the block's own
  "Choose who handles this" line are two regions, so both show.
- **The reply's chips** (`components/work/ReplyText.tsx`). While the reply holds
  placeholders its field shows them as bracketed markers (`[Jira key]`,
  `[Jira link]`), and under it "Fills in when step 1 runs:" lists one chip per
  marker with a remove button ("Remove Jira key from step 1"). Markers are kept
  or removed, never typed: a marker typed by hand stays plain words. Removing a
  chip moves focus to the next chip's remove button, else the field. The hint
  reads "Keep the words in brackets as they are: they become the Jira key and
  link." Removing a chip whose marker sits in brackets takes the brackets and the
  space before them too ("Logged as [Jira key] ([Jira link]) with Faiz" becomes
  "Logged as [Jira key] with Faiz"; `withoutMarker`). The stored text keeps the
  placeholders (`features/agents/escalationText.ts`).
- **A step's note.** A skipped step with a `note` shows it where "Not run"
  would be; an applied step shows it as a meta line under its state.
- **Posts as you.** The Slack step reads "Posts as you (Faiz Jamal)" when the
  runner's Slack is linked, else "Posts as alfiee".
- **The participant view.** A person who took part in the thread but cannot open
  the customer reads "You can run this because you took part in the Slack
  thread." under the title. The record's name is plain text (no link) in the
  panel and on the Work row; the server sends no reason, rationale or evidence,
  and the screen adds nothing. The task step's assignee is read-only text there,
  and no members read is made.
- **Link lines on the organisation page** (`components/organizations/detail/LinkLines.tsx`,
  words in `features/organizations/linkText.ts`). Under a Slack item: one link
  per Jira issue, "KAN-2 · In progress · Faiz Jamal" ("Unassigned" when nobody),
  opening Jira in a new tab (plain text when it has no `https` URL). Under a
  ticket item: a button "From Slack: Tushar Aggarwal in #all-alfiee" that opens
  the thread sheet, which lists "Jira issues" the same way. A side the reader may
  not read is a count only ("Linked to 1 item you can't see"). The lines are 44px
  tall on a phone.

### Settings: Agents, and Actions & approvals

Same spec. Both pages sit on `AgentSettingsFrame` (`pages/settings/`: the
frame's 20px h1, intro, skeleton and Try again).

- **Settings › Agents** (`/settings/agents`, Lucide `Bot`). Three
  `AgentCard`s (CS, Sales, Ops): the agent's name, a switch,
  a monthly credits input, a spend bar (a `role="progressbar"` track with a
  computed-width fill, the only inline style allowed; `bg-danger` at or
  above budget) with "12 of 133 credits this month · resets on 1 Nov 2026",
  the last run's summary, and **Run now**, a bordered `type="button"` in the
  card's header that sends at once (it never submits the form). One form
  wraps the AI switch for the workspace, the Tone and the three cards. Run
  now's answer goes to an always-mounted `role="status"` line in the card; a
  failure is a separate `role="alert"` that takes focus. A successful run
  tells Mine and the badge to read again, and the task lists too
  when it applied something. The AI switch, the Tone and each agent's
  switch save the moment they change, with a "Saved" toast and Undo; the
  monthly credits are drafts in the page's save bar (Enter in one saves
  through the bar), checked in the browser only when typed, so a saved
  budget above a lowered plan never opens the bar on load. After a change
  to the AI switch or the tone, the signed-in user is read again so Copilot
  catches up. When AI is off, everyone reads "AI is off for this workspace:
  agents don't run." (13px `text-ink`, after a `text-warning` `TriangleAlert`).
  A member reads the cards as text with "Only admins can change these." and
  still sees Run now when the server's `can_run` is true. The UI never
  guesses rights: `can_edit` decides form or text.
- **Reading messages** (Settings › Agents, `MessageSources`). A section of
  the Agents page: How often (a select), then a switch per source with a
  "Not connected" hint where the source is not linked, and "Last read
  <time>." or "Not read yet.". The page intro says the agents read the
  workspace each night and customer messages on the schedule below.
  Each change saves at once with a toast and Undo; a member reads text.
- **Fast lane** (Settings › Agents, `FastLane`, a `SettingsSection` under
  Reading messages). A switch "Fast lane": urgent conversations are read
  after 2 quiet minutes instead of on the schedule, rules decide what is
  urgent and never AI, and each conversation read uses AI credits. When on:
  "Jira's top priority" (switch), "Slack channels" (a checkbox per Slack
  connection, or "No Slack connection yet."), "Words" (up to 20) and
  "Senders" (up to 50 addresses or @domains) as tag lists with an input, Add
  and a remove button per chip, "Customers in poor health" (switch, health
  score below 4) and "Limits" (selects Per hour 0 to 10 and Per day 0 to
  50). Lowering Per day below Per hour lowers Per hour with it, and both are
  sent. The line "Used in the last hour: 1 of 10. In the last 24 hours: 3 of
  50." shows while the lane is on. Every change saves at once with a toast
  and Undo, and a refusal shows the server's sentence under its row. A
  member reads `FastLaneSummary`: "Fast lane: On" or "Off" and, when on, the
  rules as text and the use line. Nothing is drawn when an older backend
  sends no fast lane.
- **Request type on a Jira step** (Decision 8 of the delivery's plan): not
  built. Jira Service Management: an issue an agent creates has no request type; set one in Jira so it shows in the portal and in request-type queues.
- **The credits note.** A card says "3 conversations are waiting: this
  agent's credits are used up until 1 Nov 2026." (or "the workspace is out of
  AI credits") when conversations wait on credits, in danger ink
  (`META_DANGER`); the date includes the year.
- **Settings › Agents › Actions & approvals** (`/settings/agents/actions`,
  the Agents item's second tab). A real `<table>` (the one exception to rows-not-tables,
  because it is a matrix): kinds as rows, the three agents as columns, in
  an `overflow-x-auto` wrapper so it scrolls inside itself on phones, its
  first column `sticky left-0 bg-surface`. Each cell is a select labelled
  "Change lifecycle stage for the CS agent" with Auto, Ask or Never, capped
  at the kind's `max_level` (a cap of Ask offers Ask and Never only); a
  cell an agent doesn't use reads "Not used". Delivery 2 adds Draft a reply
  (up to Auto) and Start a plan (capped at Ask), for the CS and Sales agents
  only. Delivery 3 adds Build a segment, Build a scenario, Draft a campaign
  and Write a plan template (the Ops agent only) and Map a record's people
  (every agent), all capped at Ask. A note says Never expires
  that agent's waiting actions of that kind. Save changes sends only the
  changed cells; a refusal shows under its cell, linked by
  `aria-describedby`, and focuses the first refused cell in row order. A
  member reads the same table with the level words in place of selects.
  The AI-off notice shows here too.
- **Nav.** Agents is one item in the Automation group, with two tabs:
  Agents (`/settings/agents`) and Actions & approvals
  (`/settings/agents/actions`). `/settings/agent-actions` redirects to the
  second tab and `/settings/ai-agent` to `/settings/agents`, keeping the
  query and hash.

### Communications: drafts

Agents spec §2, contract `revenact-backend
docs/superpowers/plans/2026-10-08-agents-drafts-api.md`. Components in
`src/components/agents/` (`DraftPanel`, `DraftForm`, `DraftLine`,
`AgentDraftsList`), under the agents house-rules suite.

- **Where.** `/communications?draft=<id>` replaces the inbox card (or the
  mailbox card) with a solid "Draft reply" section; the Copilot rail stays.
  Back to the inbox drops only `draft`, so the mailbox keeps its source.
- **The draft.** Its heading ("Reply to Ann Lee" or "Reply on TKT-1042",
  15px, focused on arrival), a meta line (Lucide `FilePen`, "The CS agent
  drafted a reply.", the record as a link, the date in DM Mono, Edited), what
  it answers in a quiet box, then the form or the read-only view. Loading is
  a skeleton; a 404 reads "Draft not found" ("That draft isn't there any
  more, or you can't open it."); a failed read has Try again.
- **Email form (the owner, open).** To as text, Subject and Reply as fields
  (labels above, errors below in the server's words, the first refused field
  focused). Send is the one primary and carries only changed fields; Save is
  dimmed until something changed; Discard asks first. `NO_MAILBOX` adds
  "Open Connections".
- **A send in flight.** `sending: 'pending'` reads "Sending…" as text, no
  form, no buttons. `'unconfirmed'` reads "We couldn't confirm this was sent.
  Check your Sent folder."; for whoever may send it, two buttons below (44px
  targets): **It was sent** (the one primary) and **Reopen draft**. The
  server's answer replaces the draft and the status line says "Marked as
  sent." or "Reopened the draft."; a refusal shows the server's sentence in
  an alert. Others see only the sentence.
- **Ticket form.** Reply only, with "Ticket replies are not sent from
  Revenact: copy it into the ticket, then mark it as sent." "Copy and open
  in Zendesk" (the primary) copies the reply and opens the ticket; with no
  source it is "Copy the reply". Mark as sent saves an edited reply first.
- **Status.** One always-present status line under Back, announced politely:
  "Sent to ..." or "Marked as sent." (focused), "Saved." and "Copied the
  reply." (not focused), "Discarded the draft." (focused, the draft gone),
  and the server's `ALREADY_SENT` or `NOT_YOURS` sentence (focused, the draft
  read again). A Discard refused as sent or "not yours" lands here too. Other
  refusals stay in the form's alert, focused. The draft panel keeps this line
  on the page for the draft's whole life; `onStale` (a refusal that shows the
  draft has changed) reads the draft again and refreshes the lists.
- **Read-only.** A sent draft ("Sent on 8 Oct 2026 by Alice.") or someone
  else's ("Only Carl CSM can change or send this draft.") shows To, Subject
  and Reply as text. `can_edit` alone decides.
- **The queue.** An email or ticket row with `draft` shows a quiet line in
  its detail pane: "The CS agent drafted a reply." and Open draft.
- **Mailbox › Drafts.** "From your agents" (the reader's own open email
  drafts: subject, To, record, agent, Edited, date) sits above "In your
  mailbox"; skeleton, "No drafts from your agents.", and Try again.
- **Never twice.** On the backend an agent never drafts the same source
  twice: an email, ever; a ticket, not within 7 days. A second run adds no
  second draft to the queue.

### Two-way Gmail, delivery 1: Connections, the mailbox and the portal

Spec `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §4; contract
`revenact-backend docs/superpowers/plans/2026-10-10-gmail-sync-api.md`.

- **Connections rows** (spec 2026-10-16-connections-page-design,
  `components/integrations/ConnectionRow`). Settings › Connections is one
  `SettingsCard` per tool (owner, 2026-10-16: the account-settings look, the
  old Integrations page's card per tool): Gmail, Slack, Jira, then Coming
  soon. A card has a 40px logo tile, the name (`TYPE.title`) and one line on
  the tool inside it, then a hairline and its parts as labelled rows
  (`ConnectionPart`): Workspace (`manage_integrations` only) before Your
  account; in a part the row shows the part's label (`TYPE.label`, 112px from
  `sm`) in place of its logo and name, and the group is named by the part.
  Coming soon is one card with a 2/3/5-column grid of greyed tiles (a
  grayscale 24px logo, the name and category, no buttons). The other
  Settings pages take the same look one by one through `SettingsSection
  look="card"` (title, description and action inside the card, the body under
  a hairline): General, People & teams and Plan & billing first; `split`
  stays the default until every page is moved. No right rail. Settings sits on
  the gradient canvas (`rv-canvas`) like Account settings (owner, 2026-10-16,
  replacing settings production spec §10.1's solid canvas), the settings
  nav transparent over it. A row: a 36px logo tile (`bg-subtle`, `ring-line-subtle`),
  the name (`TYPE.body` semibold), its state in words (`TYPE.meta`, or
  `META_DANGER` when it stopped working), one line on what it does
  (`TYPE.meta`), then exactly one primary button (`PRIMARY` to connect or link,
  `BUTTON` for Sync now, `DANGER` for Unlink) and an `OverflowMenu`
  ("More for <name>") for the rest. Forms open in the same row under a
  hairline, indented to the text column from `sm`. Success lines use `FORM_OK`; one `role="status"` region on the
  page stays mounted.
- *(Superseded 2026-10-16 by the Connections rows above; kept for history.)*
- **Connections › Your mailbox** (`components/integrations/MailboxSection`,
  on the primitives). A `SettingsSection` ("Your mailbox", its description
  outside the card). Inside, a Mailbox `SettingsRow`: the address (13px
  semibold) and provider, then the actions in a wrapping row: Sync now
  (`BUTTON`, "Syncing…" with a spinning icon while a queued Google sync waits,
  up to two minutes), Reconnect (`BUTTON`, Google only) and Disconnect
  (`DANGER`). Sync now, Reconnect and Connect use `aria-disabled` with early
  returns (focus stays), never `disabled`. Below, a `divide-y` facts list
  laid out like settings rows: Status ("Connected", the paused reason, the
  transient error, or "Needs attention: ..." in danger ink), and for Google
  Two-way ("On" or "Off: read-only"), Push ("On: new mail arrives within
  seconds" or "Off: checked every minute"), Import ("Importing mail: 4,210 of
  about 18,000", "... so far" without a total, then "Mail from the last 12
  months is imported."), and Last synced. Outlook and IMAP show Status and
  Last synced only. "Mailbox connected." sits in one status region that is
  always mounted (sr-only while empty).
- **The reconnect banner** is a warning `SettingsNote` row (ink text, amber
  icon): "Reconnect to turn on two-way", or "Google access was revoked:
  reconnect", with Reconnect Google as the section's one `PRIMARY`.
- **Disconnect** asks first (`ConfirmDialog`, danger): for Google, "Your own
  copies of this mailbox are deleted after 30 days, unless you reconnect the
  same account before then"; for Outlook and IMAP, "deletes your own copies
  of it now". After a Google disconnect the card says "<address> was
  disconnected on <date>. Your copies of its mail are kept until <date>:
  reconnect the same account before then to keep them." above the Connect
  row, and focus moves to the first Connect button (Cancel returns it to
  Disconnect).
- **Refusals.** A failing pre-OAuth gate replaces Connect Google with its
  sentence (muted body, under the Connect buttons). The callback's
  `?mailbox=refused&code=` shows the contract's sentence for the code as an
  alert; `WRONG_DOMAIN` shows the server's "Connect your <domain> account."
  only in that exact shape.
- **IMAP form.** A plain button opens it (Cancel clears the password);
  labels above every input (`INPUT`; the password `autoComplete="new-password"`,
  the rest `off`), two columns from `sm`, focus on Email address, Connect as
  the form's one primary.
- **Mailbox rows** carry up to two Gmail label chips and "+N" (neutral pills,
  the label's Gmail colour as a 6px dot) and a paperclip ("Has attachments"
  for screen readers). On a phone the meta line carries one chip.
- **The open message** adds Cc and Bcc lines (11px, addresses in the
  tooltip), every label chip, and attachment chips (Paperclip, name,
  extension and size in tabular figures; bordered, not clickable until
  delivery 2; inline parts hidden).
- **HTML mail** sits in a sandboxed frame (no scripts, no same-origin) that
  fills the reading pane and scrolls inside, painted on the light system
  canvas so mail written for white pages reads in dark mode. Remote images
  are blocked by a CSP until **Show images** (`QUIET`), next to "Images from
  the internet are hidden, so the sender can't tell you opened this." Mail
  without HTML keeps the text body.
  The frame's document inherits the app's own Content-Security-Policy
  header, so for Show images to load remote images in production the
  deployment's `img-src` must also allow `https:` (set in this repo's
  `deploy/nginx.conf`); until then images stay blocked, which fails safe.
- **The mailbox header** gains an always-mounted status line: the import
  progress (11px) and the paused reason (13px ink with `CirclePause`); Sync now there is disabled while the mailbox is
  paused.
- **Sends through a paused Gmail** show the server's `MAILBOX_PAUSED` sentence
  and the next step in the existing alert; a draft also shows Open
  Connections.
- **Platform portal.** The organisation page gains a "Google two-way mail"
  `Card` (meta On or Off): what it allows, "Connected here" (with paused in
  brackets) and "Google test users, all workspaces: N of 100" as a
  `divide-y` list, then a reason field (label above) and Turn on (`PRIMARY`)
  or Turn off (`DANGER`). The overview gains a "Google mailboxes" tile ("of
  100 test users · N workspaces on"); the organisations list a Gmail column
  ("Off", or the connected count).

### Two-way Gmail, delivery 2: actions, conversations, labels and files

Spec `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §3 and §4;
contract `revenact-backend docs/superpowers/plans/2026-10-11-gmail-actions-api.md`.

- **Conversations.** The mailbox lists conversations (`MailList`): the
  senders as the title ("Dana Ruiz, Ann Lee", "+N" past three), the message
  count in tabular figures before the subject, a Labels column (up to two
  chips and "+N") where Category was, the date. Sent and Drafts still list
  messages, titled "To <recipients>".
- **The open conversation** (`MailDetail`, `ThreadMessage`): the subject
  (15px), then "N messages", the category badge, the label chips and the
  record link. Messages run oldest first in a `divide-y` list; only the
  newest is open, older ones are one line (who, snippet, date) that opens
  on press; outside Trash, deleted messages sit behind "N deleted
  messages" (`QUIET`); a long thread says "Older messages in this
  conversation are only in Gmail." The reply answers the newest message
  from the other side. Every sentence the frontend writes about mail lives
  in `features/mail/mailText.ts`.
- **Actions** in a wrapping toolbar: Star, Mark unread, Labels, Delete (or
  Restore in Trash), the ⋯ menu with Report spam (or Not spam in Spam),
  Mute or Unmute, and Mark done (`BUTTON`). Each shows at once; a refusal
  puts it back and says why under the header in danger ink, with Open
  Connections when reconnecting is the way out. Outlook and IMAP show no
  Delete, Restore, spam or labels.
- **Read-only, paused or disconnected Gmail:** every action but Mute and
  Unmute is disabled with the reason as its title; the header's status line
  adds "Reconnect Google to turn on two-way: changes here can't reach Gmail
  yet." or "This message's mailbox is no longer connected." with Open
  Connections (a paused mailbox keeps its paused line).
- **Labels.** The sidebar lists them under the folders (and All mail): the
  Gmail colour as a 6px dot, the name, unread conversations in tabular
  figures; the open label is the current folder. A label made here and not
  yet in Gmail is faint, with a dashed chip edge and "Not in Gmail yet".
  The label menu (`LabelMenu`, an `OVERLAY` popover rendered into
  `document.body` so the glass mailbox card does not clip it) has a box per
  label, ticked when every message carries it and mixed when some do, and a
  "New label" field (label above) with Create; a refusal stays in the menu.
- **Bulk select.** Each row has a box (44px label), shown on hover or focus
  from `sm`, always on touch and once anything is ticked. A toolbar over the
  list: "Select every conversation on this page" (mixed when some are
  ticked), "N selected", Mark done (Move to Inbox in Done), Mark read or
  unread, Label, Delete (Restore in Trash), Clear (`QUIET`).
- **Keyboard:** e done, # delete, j and k next and previous, r reply; off in
  fields, menus, dialogs and the mail frame. j and k do nothing on the
  first or last row, or when the open conversation is not on this page.
  Mark done and Delete carry `aria-keyshortcuts`. Reply all, Forward and
  compose came with delivery 3 (below).
- **Attachments.** Chips are buttons (44px, bordered): images and PDFs open
  in a modal viewer (`AttachmentViewer`, rendered into `document.body`,
  `OVERLAY` on `bg-scrim`, Download and Close, focus returned to the chip);
  anything else downloads. A refusal is the server's sentence under the
  chips ("This file is too large to open here. Open it in Gmail."); a file
  that cannot be fetched is a plain chip with the reason as its title.
  `cid:` images inside HTML mail show in the sandboxed frame; each part is
  fetched once per tab (the cache holds the in-flight request).
- **What did not reach Gmail:** a quiet 11px line with `CircleAlert` on the
  message, a `CircleAlert` mark beside the row's date, and the
  `mail_action_failed` notification in the bell (`MailWarning`) linking to
  the conversation.
- **Files tab:** filed mail's attachments are rows like uploads, with a
  `Mail` icon, the email's subject and "Email from <sender>", and no Delete.

### Two-way Gmail, delivery 3: writing

Spec `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §3 and §4;
contract `revenact-backend docs/superpowers/plans/2026-10-11-gmail-writing-api.md`;
plan `docs/superpowers/plans/2026-10-11-gmail-writing-frontend.md`.

- **The composer** (`MailComposer`) takes the reading pane in place of the
  list or the conversation, with Back; below `sm` the mailbox header and
  search hide (only there, and only while composing) so it fills the card.
  Its title is the kind (New message, Reply, Reply all, Forward), beside one
  quiet status line: "Saving…", "Saved to Gmail", "Saved", or why Gmail does
  not have it yet. While Gmail is still saving, the draft is read again
  until it confirms. Gmail two-way only (paused included); Outlook, IMAP and
  read-only Google keep the reply box.
- **Addresses** (`RecipientField`): From as a meta line; To, then Cc and
  Bcc behind Add Cc and Add Bcc; each address a `bg-subtle` pill with its
  own Remove (44px below `sm`); commas, semicolons, Enter or leaving the
  field make chips; anything that is not an address stays in the field
  with "Check this address: …" in danger ink under it.
- **The editor** (`MailEditor`): a bordered box with a toolbar (Bold,
  Italic, Bulleted list, Numbered list, Link; `ICON_BUTTON`s with names)
  over an editable region at least 192px tall. Link opens an inline
  "Link address" field with Add link and Cancel (pressing Link again closes
  it too); only web and email addresses are taken. A paste or a drop keeps
  the text only. While a send is in flight the addresses, subject and text
  hold still. The Gmail signature is already in
  the text, in the muted ink; the quoted message is folded under "Show the
  quoted message" and shown in the sandboxed frame.
- **Attachments** (`ComposeAttachments`): bordered chips (name, "From the
  original" for a forwarded file, size, Remove), an upload's chip with a
  spinner and a thin progress bar, Attach files (`BUTTON`), and, once there
  are files, "N of 25 MB used": the message's size (files and bodies,
  contract decision 20) against the draft's own limit. A file over the limit or of a type Files does not take is
  refused before it uploads, in the server's words; the limit checked is the
  draft's own `max_bytes` and `total_bytes` (the compose prefill's before a
  draft exists, 25 MB if neither is there).
- **Filed on** (`DraftRecordLine`): one meta line, "Filed on <record>" (or
  "Not filed on a record"), "Suggested from the recipients" until the
  person picks, Change (the organisation and account search, labelled
  "File on") and Don't file; an agent's draft says "An agent draft stays
  on its record." instead.
- **Changed in Gmail:** a bordered alert above the fields says "This draft
  changed in Gmail.", shows that version's subject and text under a left
  rule, and offers both Use the Gmail version and Keep mine; Send waits.
- **Send** is the one `PRIMARY` (off while a file uploads or a choice
  waits); a refusal is one danger line beside it (with Open Connections
  when reconnecting is the way out), a field's refusal under its field.
  An unconfirmed send turns the composer into text with It was sent and
  Reopen draft; a confirmed "It was sent" closes the composer and reads the
  mailbox again, as a send does. "Message sent." shows under the mailbox
  header after a send, "Draft discarded." after a discard. Discard draft is
  the trash `ICON_BUTTON` at the end of the row; a draft already gone
  counts as discarded.
- **In a conversation**, Gmail two-way shows Reply, Reply all and Forward
  (`BUTTON`s with `aria-keyshortcuts` r, a, f) where the reply box was; a
  live draft is one line with a Draft badge, its snippet and Edit draft,
  and it never takes the conversation's open slot (the newest real message
  stays open). A conversation row whose newest message is a draft opens
  the conversation, not the composer; the toolbar and category speak for
  the newest real message.
- **Drafts** (Gmail two-way; Outlook, IMAP and read-only Google keep
  delivery 2's Drafts): a row opens the composer; an agent's draft row carries the
  agent's badge; the bulk bar offers only Delete (which discards the
  drafts, never the conversation) and Clear. Agent drafts that are also
  Gmail drafts are listed once, as the mailbox row; their draft panel
  links "Edit it in your mailbox".
- **Search:** a full-width search field under the mailbox header narrows
  the list; while it holds text on a Google mailbox the last row is
  "Search older mail in Gmail" (`QUIET`, off with the paused reason as its
  title). Its results replace the list: Back to your mail, "Results from
  Gmail" with "About N in Gmail", rows like the mailbox's with an "In
  Revenact" badge on what is already held, and More from Gmail.
- **Keyboard:** a reply all, f forward, c compose join e, #, j, k and r;
  every key is off inside the composer. In a Gmail two-way Drafts, #
  discards the focused draft and e does nothing.
- **Known limit:** the editor keeps basic formatting only (contract §11's
  tags), so rich formatting in a draft written in Gmail is still simplified
  once the draft is edited here. A Gmail signature is the exception (round 2
  D1): the editor shows its block as read only text, with no
  caret in it and the hint "Your Gmail signature goes out as it is in Gmail."

- **The mailbox card's signature** (`MailboxSignature`, round 2 D1). Outlook
  has a Signature field (up to 10 lines, "Added under every email you send
  from Revenact."), a Save button and "Signature saved."; more than 10 lines
  is refused. A Gmail mailbox shows its Gmail signature read only ("None in
  Gmail" when empty) with "Change it in Gmail." An IMAP mailbox shows no
  signature.

### The account team and department heads

Slack escalations delivery 2 (spec §4.4). Two surfaces say who takes a
customer's escalation.

- **Account team card** (`AccountTeamCard`, `components/organizations/detail/`),
  last on an organisation's Details. A `Card` ("Account team", with "Who
  handles Globex (QA) in each department" as a `TYPE.meta` paragraph under the
  title, so it wraps on phones instead of truncating) over a `divide-y` list with one row
  per function, label (`TYPE.label`) and a line (`TYPE.meta`) on the left, the
  picker on the right from `sm`; below `sm` the row stacks, label and line
  above the picker, with no sideways scroll.
- **The line.** Customer Success is the organisation's owner and reads
  "Account owner" while that person is active. Any other row nobody holds reads
  "Nobody yet · Jesh Sanghvi (Engineering head) takes it", or "Nobody yet · No
  Engineering head is set". A person who is deactivated is off duty: "Sam
  Seller is deactivated · Jesh Sanghvi (Engineering head) takes it". So is a
  person (not Customer Success) who no longer works in that department: "Sam
  Seller is no longer in Engineering · Jesh Sanghvi (Engineering head) takes
  it". A row someone on duty holds shows no line. The line is the picker's
  description. Customer Success is checked only for active: an owner from
  another department is still on duty.
- **The pickers.** A `Select` per row ("Engineering on the account team",
  label hidden), "Nobody yet" first, then the active members of that function
  (the current person is kept in the list even when off duty). It saves on
  change; a refusal shows under the row (`role="alert"`). People without
  view-all-accounts read the person's name in semibold with no picker. The
  Knowledge tab keeps its own owner pickers on the same data, so both agree.
- **Department heads** (`DepartmentHeadsSection`, `pages/users/`), under
  Members on Settings › People & teams. A `SettingsSection` with
  `look="card"`, matching Members, titled "Department heads", one `SettingsRow`
  per function with a `Select` of that function's active members and
  "Nobody" first. It saves on change with "Saved" and Undo. A function nobody
  works in reads "Nobody works in Analytics yet." Without
  `manage_org_settings` the section reads, with its selects disabled, and the
  description adds "Only someone who manages organisation settings can change
  them." A refusal shows verbatim under the row.

### Settings: the frame

Spec `docs/superpowers/specs/2026-10-11-settings-production-design.md` §4
(with its §10 amendments). Every `/settings/*` route sits in
`WorkspaceSettingsLayout` (`src/layouts/`) on a solid canvas: while the route
is `/settings/*`, `DashboardLayout` paints its content wrapper `bg-base`
instead of the `rv-canvas` glow. A nav column (`w-56`, `border-r
border-line`, `bg-base`, its own `rv-scrollbar` scroll) carries the heading
"Settings" (`TYPE.title`, a paragraph, not an h1), then the page column,
which scrolls on its own with `rv-scrollbar` and keeps the `ScrollSentinel`.
The nav reads `WORKSPACE_SETTINGS_NAV` (`pages/settings/workspaceSettingsNav.ts`):
twelve items in four groups, Workspace (General, People & teams,
Connections, Plan & billing), Data (Attributes, Defaults, Products,
Imports), Automation (Work, Agents, AI) and Developers (Webhooks & API
access), each group under a `TYPE.eyebrow` label. A row is `min-h-9` with a
16px Lucide icon and 13px text; the current row is `bg-subtle text-ink
font-semibold` with `aria-current="page"`, on any of its tabs; focus is
`focus-visible:outline-accent`. Work (Recommendations, Tasks,
Notifications, Briefs), Agents (Agents, Actions & approvals), AI
(Attributes, Skills, Usage, Feedback) and Webhooks & API access (Webhooks,
Agent access) are tabbed: `SettingsTabsRoute` provides the tab row and the
page's `SettingsFrame` draws it under its h1, which is the item's label.
Capabilities sit on the tab: Skills, Usage and Feedback need
`view_all_accounts`; a tab the person cannot open is not drawn, an item
with no tab left is dropped, and People & teams needs `manage_users`.
Below `md` the column is the ui `Select` ("Settings section", grouped by
the four groups, `min-h-11`) above the page; choosing one navigates through
the page's leave guard, so unsaved edits ask first, and nothing scrolls
sideways. The Navbar shows "Settings" as text below md only (phones have no
nav column); from md it shows nothing there. Solid surfaces, no glass.
Agents is drawn for everyone: members read it, admins change it.

### Overlays

The Organizations `FiltersPanel` and `PinFieldsMenu`, `ContactRowActionsPopover`,
the organization page's `Menu` (⋯ and + Add) and `SourcesPicker`, and the Navbar's
notification and account menus. All close on an outside `mousedown`; the
organization page's also close on Escape and hand focus back to their button.
The organization page's `Sheet` (+ Add, an email's thread) is modal: a
right-hand panel from `sm`, a bottom sheet below it, with a focus trap, the
page's scroll locked, and focus returned to what opened it.

### Forms

Fifteen modals. The pattern: a `fixed inset-0 z-50` container, a `bg-black/30`
scrim, `autoFocus` on the first field, labels above inputs, errors below,
`ConfirmDialog` for anything destructive with a "Working…" state on the confirm
button.

| Modal | Fields |
|---|---|
| `OrganizationFormModal` | Name, domain, address, industry, owner, lifecycle stage, currency, joined, renewal, contract start and end |
| `AccountFormModal` | Organization, name, domain, industry, owner, lifecycle stage, renewal date |
| `ChurnOrganizationModal` | Churn date, reason, comment |
| `ContactFormModal` | Name, company, account, role, status, email, phone, sentiment |
| `OpportunityFormModal` / `RiskFormModal` | Title, company, account, MRR, priority, department, stage |
| `SurveyFormModal` | Company, account, type, sent date, score |
| `ComposeEmailModal` | To, subject, message |
| `HandoffModal` | Member, note |
| `AddMemberModal` / `EditMemberModal` | Name, email, function, role, temporary password |

### Composite

`ActivityFeed`, once the largest shared component (five top tabs and
thirteen filter chips), is now dead code: both detail pages use the Story
instead (removing it is a follow-up, §4.4 of the app-flow doc). `MentionTextarea`
is a textarea with an `@` completion listbox supporting people and function
mentions.

### Charts

Roughly 45 Recharts components. Entry animation is disabled globally through
`STATIC_SERIES` in `src/components/shared/chartAnimation.ts`, because animating
forty charts on a dashboard tab change is noise, not information.

**Colour roles.** Every dashboard chart draws from `src/pages/dashboard/shared/chartPalette.ts`
rather than a literal colour — `chartPalette.test.ts` scans the dashboard and
health tree and fails the build if one shows up. Two roles only:

- `ROLE.ink` / `muted` / `faint` — the monochrome scale (the same three tones
  as `text-primary`/`text-secondary`/`text-tertiary`) for anything that is a
  category, not a status: a source, an area, a segment. `ROLE.inkStrong`,
  `inkSoft` and `gainSoft` are `color-mix()`s of a role colour with the
  surface it sits on, for a chart that needs more distinct values than three
  tones cover (a stacked bar with five statuses, a scatter with six usage
  bands) without inventing a fourth arbitrary hue or breaking dark mode.
- `ROLE.loss` / `gain` / `caution` — the three semantic tokens, reserved for a
  value that really is a loss, a gain or a caution.
- `CATEGORICAL` (`[ink, muted, faint]`) is for categories with no inherent
  order, always paired with a direct label since three greys alone are not
  reliably distinguishable.
- `TOOLTIP_STYLE` and `CURSOR_FILL` are the shared `<Tooltip contentStyle>`
  and bar-hover cursor fill for every recharts tooltip in the dashboard —
  replacing the translucent-black rgb literals and one-off hover washes each
  chart used to invent for itself.

Chart rules, from the `dataviz` and `ui-ux-pro-max` skills, backed by the
shared kit in `src/pages/dashboard/shared/`:

- Never encode meaning in hue alone. Pair colour with a line style, a shape or a
  direct label.
- Every chart needs a legend or direct labels, and a tooltip.
- An axis title is `chartAxis.ts`'s `axisLabel`, paired with `chartMargin` on
  the same side, which reserves the room the title lands in outside the tick
  band. Never an `inside*` label position or a negative margin — both clip
  the ticks. A category axis is `categoryAxis`, which measures its band per
  render and keeps names flat when they fit, slanting or truncating them only
  when the band is too narrow; a horizontal bar list wraps long names with
  `wrapTick` instead. A date axis reads its tick from the string via
  `dateTick`, never from a constructed `Date`, so nothing drifts a day with
  the viewer's timezone. A zero-value money tick is `zeroMoney`, not compact
  notation's "$0.0". Tick text is never smaller than 10px.
- A chart's key is `ChartLegend`; a health-coloured chart uses the shared
  `HEALTH_LEGEND` rather than redeclaring Good/Average/Poor.
- A table or list that can outgrow its card scrolls inside `ScrollTable` (or
  `ScrollArea` for a `<ul>`/`<ol>`), which pins the header on the surface
  colour and gives the region a focusable, labelled scroll box. A list that
  is already bounded (a fixed row count, a capped query) gets no scroll
  wrapper at all — that is decoration around content that never overflows.
- Every `<Tooltip contentStyle>` spreads `TOOLTIP_STYLE`, never a one-off
  literal, so it reads in dark mode; `chartPalette.test.ts` scans every chart
  file for a `contentStyle` that skips it.
- A stacked bar's total is drawn by `stackedTotalLabelList`, spread onto each
  series' own `LabelList`, never by pinning a label to one fixed series —
  Recharts skips a zero-height bar, so a label pinned to one series would go
  missing on exactly the rows where that series is empty, which are the ones
  worth reading. A category whose whole stack is zero still needs a visible
  value: `emptyStackMarker` draws a hairline and a "0"/"$0" there instead of
  leaving a gap that reads as missing data.
- A donut spreads the shared `DONUT` preset (`innerRadius: '58%'`,
  `outerRadius: '80%'`) rather than pixel radii, so it holds its proportions
  at any card size.
- Fewer than four points is a stat tile, not a line chart. More than six series
  is noise.
- Every multi-column row in a dashboard view lets its children shrink below
  their content (`[&>*]:min-w-0` or the item's own `min-w-0`), so a wide
  table or long header scrolls inside its own card instead of pushing the
  row past the viewport. `viewLayout.test.ts` enforces this across every
  tab's views.

---

## 7. Interaction and state

Every list, table and chart declares four states. This is a review gate, not a
suggestion.

| State | Standard |
|---|---|
| Default | |
| Loading | A skeleton matching the final layout, not a spinner. *Current code uses text lines instead; see debt.* |
| Empty | Sentence case, one line saying what is missing, a second explaining why or what to do. Existing copy to match: "No organizations", "No files yet", "Nothing renewing this quarter." |
| Error | The message from `ApiError`, plus a retry. The Health dashboard's wording is the model: it explains that nothing is shown rather than a partial picture |

Every interactive element declares default, hover, `focus-visible`, active,
disabled and loading states, with a 44px touch target or `min-h-9` for
desktop-only dense controls.

Copy rules: sentence case, labels above inputs, errors below inputs, never a
placeholder as a label, no filler verbs, no em dashes in new UI copy.

---

## 8. Motion

| Token | Value |
|---|---|
| `--dur-fast` | 120ms |
| `--dur-base` | 200ms |
| `--dur-slow` | 300ms |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)`, for entrances |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)`, for exits |

Transitions 120 to 200ms, reveals 200 to 300ms, nothing over 400ms. **No bounce
or elastic springs**; if a spring is ever used it must be critically damped and
finish inside 300ms. Keyboard-initiated changes never animate. High-frequency
interactions like row hover and fast tab switches do not animate. A global
`prefers-reduced-motion` override in `src/index.css` drops every animation to
0.01ms.

No Motion, Framer or GSAP is installed. Adding one is a decision for the product
owner, not a side effect of a polish task.

**Guided agent conversation (2026-10-18).** A guided bundle is drawn as a chat
(`components/work/GuidedConversation.tsx`, `GuidedParts.tsx`): the agent's
bubbles on the left on `bg-subtle` (a small Sparkles mark beside them), the
reader's answers on the right in ink (`bg-accent text-on-accent`; "Not now"
is outlined and muted), both `rounded-xl` with the near corner `rounded-sm`,
at most 85% of the sheet's width on a phone. The drafted email is a `Card`
in the thread, never inside a bubble. Yes is the sheet's only primary. New
lines fade up once with `animate-fade-up` (200ms, ease-out); lines already
there when the sheet opens do not. The working dots (`.rv-typing-dot` in
`src/index.css`) only change opacity, 900ms a cycle with each fade inside the
slow token, and are drawn still under `prefers-reduced-motion`. The Priority
badge is the only amber on these surfaces (a risk at the server's
threshold); the Work home banner that names it is neutral.

---

## 9. Accessibility

The stated bar is WCAG 2.1 AA.

**Met today:** semantic tables with real `th` cells; `aria-label` on icon buttons
in newer code; `aria-pressed` on filter chips; `aria-checked` on toggles;
`role="tablist"` with `aria-selected` on the feedback kinds; `role="listbox"` for
mention completion; `role="img"` on the knowledge graph SVG; `sr-only` file
inputs; labelled pagination buttons; the global reduced-motion override.

**Not met, in priority order:**

1. **Inconsistent `focus-visible` styling.** Newer surfaces (Dashboard,
   Communications, Copilot, Brain, Settings) declare `focus-visible:outline`
   widely, but inputs across the app still use
   `focus:outline-none focus:border-accent`, which removes the keyboard
   indicator on them entirely, and older controls elsewhere have neither.
2. **No focus trap or focus return in almost any dialog.** Fifteen modals
   plus several other floating ones declare `role="dialog"`
   (`ComposeEmailModal`, `PlatformOrganisations`,
   `EditNodePane`, `OnboardingCarousel`, the shared `CopilotRail`
   history popover, the dashboard's drill panel, the dashboard's Ask sheet) —
   of all of them, only the drill panel (in its sheet below `1024px`) and the
   Ask sheet (below `640px`) trap focus, and only those two return focus to
   their trigger on close.
3. **Escape closes almost nothing.** Only the mention list, one inline
   rename, the dashboard's drill panel and the Copilot history popover
   handle it.
4. Navbar Search, Plus, Help and Message buttons (off the dashboard; on
   `/dashboard/*` the Ask pill replaces them) have neither labels nor
   handlers.
5. Sidebar navigation relies on `title` when collapsed rather than a label.
6. No global toast system, so success feedback is inconsistent.

---

## 10. Responsive

Layouts are declared for 375, 768, 1024 and 1440. The sidebar is `absolute` below
`md` and overlays content. `<main>` padding scales. Forms use `md:grid-cols-*`.
No horizontal page scroll is acceptable.

One standing violation: the layout root uses `h-screen w-screen`, where the rule
is `min-h-[100dvh]`, which matters on mobile browsers whose toolbars change the
viewport height.

The dashboard's Ask rail changes shape at `sm` (sheet below it) and `xl` (open
by default from it); from `lg` the drill panel takes the rail's box (over the
rail when it shows, in its place when it does not).

Organizations' Ask rail changes shape at the same `sm` and `xl`. Below `xl`
it and the board's side panel never share the row: with the rail open a card
opens in the bottom sheet. Below `sm` it is the full-screen sheet from ✦,
which cannot open at the same time as an account's bottom sheet.

Accounts' Ask rail (`AccountsAskLayout`, delivery 3) changes shape the same
way, reusing Organizations' `useBoardRail`: below `xl`, opening the rail on
the Board closes an open side panel and turns the next opened card into the
bottom sheet, and the columns narrow to `w-64` (`w-72` with the rail closed).
Below `sm` it is the same full-screen sheet.

The Organizations list below `sm`: rows become two-line cards, the toolbar is
Search plus a Filters bottom sheet (group, sort, Export and Add inside), the
summary tiles swipe sideways in their own strip, an opened row is a bottom
sheet with a focus trap that locks page scroll while it is open, and a long
press starts selection. Every control is 44px.

The Organizations board below `sm`: each column is a full-width panel in a row
that snaps sideways, with a strip of column tabs ("Live 1") that jumps to one
and follows a swipe. Cards do not drag there; each card's Move to… menu moves
it, and a tapped card opens in the bottom sheet. Every control is 44px.

The organization page below `sm`: the name row, the tiles as a strip that
snaps sideways, the account chips and the tabs each scroll sideways in their
own row, Edit and Add account are icon-only, a person's email and phone take their own
line, Deals & risks has no board, and the content is full width. "+ Add" and an email's thread open as
bottom sheets. Every control is 44px.

---

## 11. Review checklist

A change is not finished until all eleven pass. This is the "anti-slop bar" from
the design skill, reproduced so a reviewer can work through it.

1. Zero raw hex, rgb or named colours in `src/**/*.tsx`. Tokens only.
2. One accent. Semantic colours carry meaning, never decoration.
3. At most four type sizes per surface. Numbers in DM Mono with `tabular-nums`.
   Reading line length 65 to 75 characters.
4. No card inside a card. No gradient buttons, no purple, no glow, no
   glassmorphism on product surfaces. Exception, by the owner's decision on
   2026-09-21: Communications (and, by the owner's decisions from 2026-09-24
   on, the Ask rail on the Dashboard, Organizations, Contacts, Accounts and
   Pipelines, the rail only), whose cards are `.rv-card-glass` /
   `.rv-glass-inner` so the canvas glow shows through, as in the reference
   mail client. The canvas gradients (`--rv-canvas-gradient-1/2`) were
   strengthened in both themes at the same time; that is the intended look
   for every `.rv-canvas` page, not a side effect. The mailbox's category dots
   are a categorical filing key, not status, and reuse the semantic tokens.
5. Every interactive element has all six states and a 44px target or `min-h-9`.
6. Every list, table and chart has designed empty, loading and error states, with
   a skeleton that matches the layout.
7. Motion inside the budget, never on keyboard-driven changes, never on
   high-frequency actions, always honouring reduced motion.
8. Labels above inputs, errors below, no placeholder-as-label, sentence case, no
   filler verbs.
9. Charts have accessible colour pairs, a legend or direct labels and a tooltip.
   No colour-only meaning. Entry timing through `chartAnimation.ts`.
10. Responsive at 375, 768, 1024 and 1440. No horizontal scroll.
    `min-h-[100dvh]`, never `h-screen`.
11. Tests added or updated. `npm run lint` and `npm run build` pass.

---

## 12. Current design debt

Ranked by leverage. Each is a task in the
[Implementation Plan](../../revenact-backend/docs/product/06-implementation-plan.md).

| # | Debt | Evidence |
|---|---|---|
| 1 | ~~Body text is still on the system stack~~ Decided (owner, 2026-10-09): keep the system stack; the Lato preload is dropped | Display and mono are wired (`.font-display` / `.font-mono-brand`); `src/index.css` deliberately has no `body` font rule |
| 2 | `focus-visible` styling is inconsistent | Newer surfaces declare it widely; inputs everywhere still use `focus:outline-none focus:border-accent`, which removes the indicator entirely |
| 3 | 108 raw hex values in components | Worst offenders: `Integrations.tsx` (11, vendor logos), `SurveysTab.tsx` (4), the recurring `text-[#0D0F0E]` on accent backgrounds |
| 4 | No focus trap or return in almost any `role="dialog"` | Of the app's several floating dialogs, only the dashboard's drill panel traps focus (and only in its sheet below `1024px`) and returns it on close |
| 5 | Loading states are text lines, not skeletons | Only `HeadlinesTab` shows a text-line affordance; `ChatView` uses a layout-matching skeleton since 2026-09-22 |
| 6 | `h-screen` in `DashboardLayout` | Rule says `min-h-[100dvh]` |
| 7 | `rounded-2xl` and `rounded-3xl` outside the scale | Contact detail, Account placeholder |
| 8 | `backdrop-blur-sm` on placeholder routes | Glassmorphism is banned on product surfaces (Communications' `.rv-card-glass`, also used by the Ask rail on the Dashboard, Organizations, Contacts, Accounts and Pipelines, is the one sanctioned exception) |
| 9 | `Login.css` requests Inter, which is never loaded | Falls through to the system stack |
| 10 | Dead files: `App.css` is never imported, the `counter` slice and the seeded `tasks` slice are unused | Template leftovers |
| 11 | Navbar has controls with no handlers | Search, Plus, Help, Message, title chevrons |

---

## 13. How to make a change

1. Read `.claude/skills/revenact-design/SKILL.md` first. It routes the task.
2. For a product surface, load `impeccable`. For a UX rule, accessibility
   criterion or chart choice, query `ui-ux-pro-max` with the right domain but do
   **not** adopt its palette or typography output. For motion, load
   `emil-design-eng` then `design-motion-principles`.
3. Work one surface per pull request.
4. Verify in the real app: `npm run dev`, then drive it with
   `npm run pw -- open http://localhost:5173` and take a snapshot.
5. Run the checklist in section 11 before asking for review.
