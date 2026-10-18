# UI foundations: one set of primitives for every surface

**Owner's request (2026-10-09).** The five-area audit (shell, records, ops,
impact, settings) found the app "busy and slightly uneven rather than
broken", always for the same reasons: three or four card systems, 10 to 13
type sizes per area, five tab and segment styles, four or five empty-state
designs, semantic colour as decoration, and the same chrome on every row.
This spec defines the primitives that replace them and the order in which
each surface moves onto them.

**Order (owner decision 3).**
1. **Broken things** (in flight, separate PR, not re-specified here): phone
   header overlap, People overflow, Comms
   switches / phone / ticket detail, agent evidence line, Surveys padding,
   board scroll, health ring, Slack SVG, debug button, `accent-color`, dead
   navbar icons.
2. **Foundations** (this spec, one PR): primitives, tokens, house-rule
   tests, skill update. Almost no surface changes (section 8).
3. **Surface PRs**, one per area (section 9).

**Binding owner decisions.**

| # | Decision |
|---|---|
| 1 | One card standard: solid `bg-surface`, 1px `border-line`, `rounded-xl`, no shadow. **No card inside a card.** A list is **one** card whose rows are separated by `divide-y`, never a card per row. Works on the warm canvas and in dark mode. |
| 2 | Numbers use the **body font with `tabular-nums`**. DM Mono is only for IDs and code. This overrides revenact-design §4.3 ("numbers in DM Mono"); the skill is updated in the foundations PR (section 10). |
| 3 | Order: broken things, then foundations, then surface by surface. |

House rules that already bind and are restated, not changed: tokens only in
both themes; 44px touch targets below `sm`; one primary per form; a
`role="status"` live region is never `display: none`; no em dashes in UI
copy; sentence case; `min-h-[100dvh]`, never `h-screen`. The glass Ask rail
stays an owner-approved exception on the routes the skill lists (§4.4),
now including Contacts and Brain (owner, 2026-10-09). Account settings
(`/account-settings/*`, `/profile`) are out of scope this round (section 6.3).

---

## 1. Where the primitives live

A new folder, `src/components/ui/`, holds every primitive. Nothing in it
knows about organisations, pipelines or any feature.

| File | Exports |
|---|---|
| `styles.ts`, `type.ts` | `FOCUS`, `PRIMARY`, `BUTTON`, `QUIET`, `DANGER`, `ICON_BUTTON`, `SELECT`, `INPUT`, `OVERLAY`, `NUM`, `CODE`; `TYPE` |
| `Card.tsx`, `List.tsx`, `Tile.tsx`, `States.tsx` | `Card` + `CardHeader`/`CardBody`/`CardSection`/`CardFooter`; `ListCard`, `ListRow`, `ListHeaderRow`, `TABLE`/`TH`/`TD`; `Tile`, `tileRow()`; `LoadingState`, `EmptyState`, `ErrorState` |
| `Tabs.tsx`, `SegmentedControl.tsx`, `FilterChip.tsx`, `SearchInput.tsx`, `Select.tsx`, `Switch.tsx`, `Toolbar.tsx`, `Badge.tsx` | one control each (`FilterChipRow`, `HealthBadge`, `SentimentBadge` alongside; `Switch` is `rules/RuleSwitch.tsx` promoted) |
| `PageHeader.tsx`, `SettingsFrame.tsx` | `PageHeader`, `PageBody`; `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsSaveBar` |
| `index.ts` | re-exports |

`components/organizations/portfolio/styles.ts` keeps its exports as
re-exports from `ui/styles.ts`, so existing imports keep working
until each surface PR switches its imports.

A dev-only gallery route, `/__ui` (registered only when
`import.meta.env.DEV`), renders every primitive in every state. It is the
first page screenshotted in every PR (section 9.3).

---

## 2. Type scale

Four sizes, two weights. These are the only sizes `houseRules.ts` already
allows (11/13/15/22), so the rule stays and the scale finally gets roles.

| Role | `TYPE` key | Class string | Used for |
|---|---|---|---|
| Display | `TYPE.display` | `text-[22px] leading-7 font-semibold tracking-tight text-ink` | The one in-content page heading: a record's name on its detail page, a settings page's h1. Also a tile's value (with `NUM`). |
| Title | `TYPE.title` | `text-[15px] leading-6 font-semibold text-ink` | The top-bar page title, card and section titles, modal and sheet titles, empty-state titles. |
| Body | `TYPE.body` | `text-[13px] leading-5 text-ink` | Rows, paragraphs, inputs, buttons (buttons add `font-semibold`). |
| Meta | `TYPE.meta` | `text-[11px] leading-4 text-ink-muted` | Row meta lines, captions, helper text under inputs, badges, table column headers, timestamps. |
| Eyebrow | `TYPE.eyebrow` | `text-[11px] leading-4 font-semibold uppercase tracking-wider text-ink-muted` | **Only** tile labels and the settings nav's group labels. Section titles are `TYPE.title`, sentence case, never eyebrows. |
| Label | `TYPE.label` | `text-[13px] leading-5 font-semibold text-ink` | Form field labels, above the input. Never uppercase. |

**Weights.** `font-normal` (400) and `font-semibold` (600) only.
`font-bold` (661 uses), `font-medium` and `font-black` map to `font-semibold`
or `font-normal` mechanically when a surface PR touches the file.

**Off-scale sizes, mapped.** Each surface PR applies this table; the ratchet
test (section 9.4) stops new ones.

| Today | Becomes | Rule of thumb |
|---|---|---|
| `9.5`, `10`, `10.5`, `11.5`, `text-xs` | `11` | meta |
| `12` | `13` for controls, inputs, body text; `11` for captions, helper text, badges | look at the element, not the number |
| `12.5`, `13.5`, `14`, `14.5`, `text-sm`, `text-base` | `13` | body; a heading that used 14 becomes `15` |
| `16`, `16.5`, `17`, `18`, `text-lg` | `15` | title |
| `20`, `23`, `24`, `text-xl`, `text-2xl` | `22` | display |

**Exempt (Persuade-mode surfaces, revenact-design §2).** `font-display`
headings in `pages/auth/Login.tsx`, `pages/auth/WorkspaceSetup.tsx` and the
Copilot greeting (`pages/copilot/HomeView.tsx`), 24/26/34px, keep their sizes. They are listed
by path in the house-rule test's exemption list, not matched by pattern.

**Font wiring (owner confirmed, section 11).** This round
keeps the **system stack** for body text. Reason: decision 2 makes the body
font carry every figure, so it must have real tabular figures. SF Pro and
Segoe UI do; the Google Fonts build of Lato ships only 400/700/900 (so every
`font-semibold` would render at 700) and its tabular-figure support has not
been verified in the subset Google serves. Moving body to Lato is a one-line
change in `index.css` later, after a check that `tabular-nums` aligns a
column of `$1,111` / `$8,888` in Lato. Until then the Lato preload in
`index.html` downloads a font nothing uses; the foundations PR drops Lato
from the preload URL (owner's answer, section 11).

---

## 3. Numbers

| Constant | Class string | Use |
|---|---|---|
| `NUM` | `tabular-nums` | Every figure: money, counts, scores, percentages, dates in tables, durations ("17d"). Body font. |
| `CODE` | `font-mono-brand` | Revenact IDs, API keys and prefixes, endpoints, webhook URLs, raw JSON. Nothing else. |

Rules:
- Only the figure is wrapped, never the phrase: `Closes in <span class={NUM}>17d</span>`,
  not the whole sentence. Trailing punctuation stays outside the span.
- A tile value is `TYPE.display` + `NUM`. A row figure is `TYPE.body` + `NUM`,
  right-aligned in its column.
- One money format per surface: rows and tiles use `formatCompactMoney`
  (`$175K`); full `formatMoney` with cents appears only in edit fields and
  invoices.
- Words never go in `NUM` or `CODE` ("set by hand", "No renewal date").
- Initials avatars use the body font.

**Migration.** In the foundations PR `MONO` (232 uses, almost all figures)
becomes a deprecated alias of `NUM`, so every figure moves to the body font
in one step; the few `MONO` uses on IDs, keys and endpoints move to `CODE`
in the same PR. Direct `font-mono-brand` uses (108) move per surface. DM
Mono's slashed zero ("$Ø") goes with it.

---

## 4. Surfaces

### 4.1 Card

| Prop | Values | Class |
|---|---|---|
| (base) | | `rounded-xl border border-line bg-surface` |
| `pad` | `none` | (nothing; use the slots below) |
| | `sm` | `p-3` (tiles only) |
| | `md` (default) | `p-4` |
| `as` | `section` (default), `div`, `article`, `li` | |
| `className` | layout only (grid span, width, `min-w-0`) | never colour, border, radius or shadow |

No shadow. Overlays (menus, popovers, sheets, modals) are not cards: they
use `OVERLAY = 'rounded-xl border border-line bg-elevated shadow-lg'`.

**No card in a card, enforced.** `Card` provides a `CardDepthContext`; a
`Card` rendered inside another logs `console.error('Card inside Card')` in
development, and the primitive's test asserts it. Inside a card, group with
`CardSection`, `divide-y` or whitespace.

**Slots** (use with `pad="none"`):

| Slot | Class | Notes |
|---|---|---|
| `CardHeader({ title, level = 2, meta?, action? })` | `flex min-h-12 items-center justify-between gap-3 px-4 pt-4 pb-2` | title `TYPE.title` as `h{level}`; `meta` is `TYPE.meta` beside it; `action` is one `QUIET` or `ICON_BUTTON`. |
| `CardBody` | `px-4 pb-4 first:pt-4` | |
| `CardSection` | `border-t border-line-subtle px-4 py-4` | a divided block inside the same card (replaces nested boxes in Billing, Knowledge, Integrations, Defaults). |
| `CardFooter` | `flex items-center justify-end gap-2 border-t border-line-subtle px-4 py-3` | Save sits here when the card is a form. |

**Heights.** A card never has a fixed `h-[…]` or `max-h-[…]`. Only a chart's
canvas gets a height (`h-64`, `h-80`). Card grids use `items-start`, so a
short card does not stretch to its neighbour. Where an inner scroll is truly
needed (a list over about 20 rows), the scroller's sticky header is
`sticky top-0 z-10 bg-surface border-b border-line`, and a `CardFooter` with
"Show all" replaces the hard cut.

**Glass.** `.rv-card-glass` / `.rv-glass-inner` stay for the Ask rail on its
approved routes (and the Communications shell around the queue). Rows,
tiles and lists inside them are flat: `divide-y`, not boxes.

### 4.2 ListCard and ListRow

```tsx
<ListCard label="Organizations" header={<CardHeader title="Average" meta="4 · $245K" />} state={state}>
  <ListRow href="/organizations/19" title="Uber" meta="Carl CSM · Renewal" leading={ring}
           trailing={<Badge tone="danger">Risk 55</Badge>} actions={ask} selected={open} />
</ListCard>
```

`ListCard` is `Card pad="none"` + `overflow-hidden` + optional header +
`<ul role="list" aria-label={label} class="divide-y divide-line-subtle">`.
When `state` is given (loading, empty, error from section 4.4), it renders
in place of the `<ul>`, inside the same card.

`ListRow`:

| Aspect | Rule |
|---|---|
| Element | `<li class="group relative flex items-center gap-3 px-4">` |
| Density | `regular` (default): `min-h-14 py-3`. `compact`: `min-h-11 py-2`. One density per list. |
| Content | `leading` (32-40px), then `min-w-0 flex-1` column: title (`TYPE.body font-semibold truncate`) and **one** meta line (`TYPE.meta truncate`). No conditional third line; extras ("pulses disagree") go into the meta line or a badge, so every row in a list is the same height. |
| Columns | `columns` prop: a grid template, e.g. `grid-cols-[minmax(12rem,1fr)_6rem_8rem_7rem_auto]`. The row becomes `grid` instead of `flex`, so figures line up down the list (Pipelines, Comms queue, Members). `ListHeaderRow` above it uses the same template with `TH` cells. A column never moves between rows (fixes the wandering priority badge). |
| Clickable | Pass `href` (a `Link`) or `onSelect` (a `button`). The **title** is the real control, stretched over the row with `after:absolute after:inset-0`. Controls in `trailing`/`actions` get `relative z-10`. No `onClick` on the `li`. |
| Hover | clickable rows only: `hover:bg-subtle active:bg-line-subtle` |
| Focus | `has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent` (inset, so the card's `overflow-hidden` does not clip it) |
| Selected | `bg-subtle` and `aria-current="true"` on the title control. No stripe, no border. |
| Actions | `actions` slot follows the density rules (section 7): hidden until hover or focus from `sm`, always visible on touch. |

**Tables** (Members, Measure, AI usage, Actions & approvals) sit flush in a
`Card pad="none"` inside `overflow-x-auto`:
`TABLE = 'w-full text-left'`, `<tbody class="divide-y divide-line-subtle">`,
`TH = 'px-4 py-2 text-[11px] leading-4 font-semibold text-ink-muted'`
(sentence case), `TD = 'px-4 py-3 text-[13px] leading-5 align-middle'`,
numeric cells add `text-right ${NUM}`. No vertical rules, no bordered table
inside the card.

### 4.3 Tile (KPI)

`Tile({ label, value, meta?, action?, pressed?, children? })` inside
`<div className={tileRow(4)}>`:

| Part | Class |
|---|---|
| Tile | `Card pad="sm"` (`rounded-xl border border-line bg-surface p-3`), `role="group"` labelled by its label |
| Label row | `flex min-h-6 items-center justify-between gap-2`; label `TYPE.eyebrow` |
| Value | `mt-1 ${TYPE.display} ${NUM}` |
| Meta | `mt-0.5 ${TYPE.meta} line-clamp-2` |
| Breakdown (optional `children`) | at most **3** rows of `TYPE.meta` label + `NUM` figure; more than 3 moves out of the tile row into its own card below (Pipelines "Stages", Organizations "Lifecycle") |
| `pressed` (filter tiles) | `bg-subtle ring-1 ring-accent` and `aria-pressed` on the tile's button |

`tileRow(columns)` keeps today's behaviour (phone snap strip, `sm` 2-up,
`lg` n-up) and adds `items-start`, so tiles take their content's height and
never stretch to the tallest. Because every standard tile has the same
anatomy, a row of standard tiles is the same height without a fixed height.
Tile rows sit at the same offset on every page: first block under the
`PageHeader`, `gap-3` between tiles, `gap-4` below the row.

### 4.4 States inside cards

All three render **inside** the card that would hold the content; none
brings its own card or background.

| Component | Markup | Notes |
|---|---|---|
| `LoadingState({ label, variant = 'rows', count = 3 })` | `<div role="status" aria-busy="true">` + `<span class="sr-only">{label}</span>` + skeletons | `rows`: `count` × (`h-14 px-4` row with a `h-3 w-1/3 rounded bg-subtle` and `h-2.5 w-1/2` bar), divided like the real list. `tiles`: tile-shaped blocks. `block`: one `h-32`. Skeletons `motion-safe:animate-pulse`. |
| `EmptyState({ title, detail?, action?, icon?, size = 'section' })` | section: `flex flex-col items-center gap-2 px-4 py-10 text-center`; title `TYPE.title`, detail `TYPE.body text-ink-muted max-w-[48ch]`, optional Lucide icon 20px `text-ink-faint`, action `BUTTON` or `QUIET` | `inline`: one line, `px-4 py-3 ${TYPE.body} text-ink-muted`, for a blank section inside a populated page ("No open plans."). Always neutral colours; no illustrations, no green "Nothing scheduled". |
| `ErrorState({ message, detail?, onRetry? })` | `role="alert"`, `px-4 py-10 text-center`; message `text-[13px] font-semibold text-danger-ink`, detail `TYPE.meta`, retry `BUTTON` "Try again" | Default detail: "Nothing is shown rather than a partial list." |

**Live regions.** A `role="status"` element is always in the DOM while its
owner is mounted. Hide it visually with `sr-only`, never `hidden`,
`display:none` or conditional unmounting between updates. A list's result
count ("14 opportunities") is one such region (section 5.6).

---

## 5. Controls

### 5.1 Buttons

`PRIMARY`, `BUTTON`, `QUIET` keep their shape (`inline-flex min-h-11
sm:min-h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold`)
and move to `ui/styles.ts`. Changes:

| Constant | Change |
|---|---|
| all | `disabled:opacity-50` is removed. |
| `PRIMARY` disabled | `disabled:border-line disabled:bg-subtle disabled:text-ink-faint disabled:cursor-not-allowed`, same for `aria-disabled:` |
| `BUTTON` disabled | `disabled:bg-surface disabled:text-ink-faint disabled:hover:bg-surface disabled:cursor-not-allowed` |
| `QUIET` disabled | `disabled:text-ink-faint disabled:hover:bg-transparent disabled:cursor-not-allowed` |
| `DANGER` (new) | `BUTTON`'s shape with `text-danger-ink hover:bg-danger-dim`. Destructive actions only, usually in a `⋯` menu or a confirm dialog. |
| `ICON_BUTTON` (new) | `inline-flex min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle` + `FOCUS`; `aria-label` required (tested). Replaces `COLUMN_ICON_BUTTON`, `ROW_ACTION`. |

Loading: the button keeps its label, is disabled, sets `aria-busy="true"`
and shows Lucide `Loader2` 16px `motion-safe:animate-spin` before the label.
One button size. `.rv-pill-primary` / `.rv-pill-secondary` stay for account
settings, which are out of scope this round (section 6.3). Labels are sentence case ("Add team member").

### 5.2 Tabs (page-level, underline)

`Tabs({ label, items: { key, label, count?, to? }[], value, onChange? })`:

- With `to`: links, `aria-current="page"`. With `onChange`: `role="tablist"`,
  `role="tab"`, `aria-selected`, roving tabindex, Left/Right/Home/End (today's
  `DetailTabs` behaviour).
- Row: `flex h-full min-w-0 items-center gap-4 overflow-x-auto [scrollbar-width:none] rv-scroll-fade`.
- Tab: `inline-flex h-full min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-semibold focus-visible:outline-offset-[-2px]` + `FOCUS`;
  active `border-accent text-ink`; inactive `border-transparent text-ink-muted hover:text-ink`.
- Count: `<span class="text-[11px] text-ink-muted tabular-nums">`; a count
  that needs attention uses a neutral `Badge`, never amber.
- `.rv-scroll-fade` (new, `index.css`): a right-edge `mask-image` fade shown
  only while the row overflows (a `data-overflow` attribute set by a resize
  observer).
- **Placement.** Tabs live in the `PageHeader` (route views: List/Board,
  Brain, Work, Dashboard areas, Copilot/Cockpit), or directly under a detail
  page's name or a settings page's `h1` (record tabs, Settings › People,
  Attributes, AI feedback). **Never two tab rows stacked.**

### 5.3 SegmentedControl

`SegmentedControl({ label, options: { value, label }[], value, onChange, size = 'md' })`:

- Container: `inline-flex shrink-0 rounded-lg border border-line bg-surface p-0.5`, `role="group"` + `aria-label`.
- Segment `md`: `inline-flex min-h-11 sm:min-h-8 items-center justify-center rounded-md px-3 text-[13px] font-semibold` + `FOCUS`; `sm` (inside tiles): `min-h-11 sm:min-h-6 px-2 text-[11px] font-semibold`.
- Active `bg-subtle text-ink`, `aria-pressed="true"`; inactive `text-ink-muted hover:text-ink`.
- For 2 to 4 short options that filter or re-scope the **same** view: scope
  (Me / My team / Company), kind (Opportunities / Risks), window (30d / 90d),
  Appearance. Five or more options use `Select`.
- Placement: scope switches sit in the `PageHeader` actions on every tab of
  an area (Work Recommended moves its switch up). Kind switches lead the
  `Toolbar`. On phone the control stays a segmented control while it fits
  (up to 3 short options); it becomes a `Select` only when it overflows.

### 5.4 FilterChip

- Toggle chip: `inline-flex min-h-11 sm:min-h-8 items-center gap-1.5 rounded-full border px-3 text-[13px]` + `FOCUS`;
  off `border-line bg-surface text-ink-muted hover:bg-subtle hover:text-ink`;
  on `border-accent bg-accent-dim font-semibold text-ink`, `aria-pressed`.
  No black-filled chips.
- Removable chip (active filters): `border-transparent bg-subtle text-ink`,
  trailing `X` button with `aria-label="Remove filter: Owner: Carl"`.
- `FilterChipRow`: `flex gap-2 overflow-x-auto rv-scroll-fade` on phone, wraps from `sm`.
- Used for: Story/Activity filters, Feature requests and Anomalies status,
  Connections categories, the active-filter strip.

### 5.5 SearchInput and Select

`SearchInput({ label, value, onChange, inputRef?, width = 'grow' })`:
`<label class="relative min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-sm">`,
`sr-only` label, Lucide `Search` 16px at `left-3 text-ink-faint`, input
`w-full min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface pl-9 pr-9 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong` + `FOCUS`, and a
clear `ICON_BUTTON` ("Clear search") while there is a value. The placeholder
is at most 24 characters ("Search organizations") so it never truncates; the
full description goes in the label. No label-above search fields.

`Select({ label, labelPosition = 'above' | 'inline' | 'hidden', … })` wraps a
native `<select>` with
`SELECT = 'min-h-11 sm:min-h-9 w-full appearance-none rounded-lg border border-line bg-surface pl-3 pr-8 text-[13px] text-ink hover:border-line-strong disabled:bg-subtle disabled:text-ink-faint'` + `FOCUS`,
and a Lucide `ChevronDown` 16px `pointer-events-none absolute right-2.5 text-ink-muted`.
`inline` puts the label left of the control as `TYPE.body text-ink-muted`
("Sort by"). Replaces `FILTER_SELECT`, ScopeSwitch's `SELECT`, and every
bare `<select>` (Plans, Rules builder, Members, Knowledge, Actions grid).

`INPUT` (from `components/plans/styles.ts`) moves to `ui/styles.ts` with
`border-line` and the same disabled tokens; inputs are white (`bg-surface`)
everywhere this round touches (account settings are out of scope).

`Switch`: the `RuleSwitch` API becomes the one switch; the `InboxPanel`
switch and the `AgentsForm` `role="switch"` checkbox move onto it in their
surface PRs.

### 5.6 Toolbar

`Toolbar({ lead?, search, filters?, actions: { primary?, secondary[] }, count? })`:

- Layout: `flex flex-wrap items-center gap-2`; `lead`, `search` (grows),
  `filters`, then `ml-auto flex items-center gap-2` with up to **two**
  visible secondary actions (`BUTTON`) and the primary **last**. More than two
  secondaries collapse into a `⋯` `ICON_BUTTON` menu ("More actions").
- Below `sm`: search takes row 1 at full width; filters and actions share
  row 2; every secondary goes into the menu.
- `count` renders as `<p role="status" aria-live="polite" class="text-[13px] text-ink-muted tabular-nums">`
  directly after the search on the same row, not on a row of its own.
- One `Toolbar` for Organizations, Accounts, Contacts, Pipelines, Segments,
  Plans, Campaigns, Canvas and Communications. It sits at the same offset on
  every page: directly under the tile row, or under the `PageHeader` when
  there are no tiles.

### 5.7 Badge

`Badge({ tone = 'neutral', dot?, children })`, `HealthBadge({ band })`, `SentimentBadge({ value })`:

- Base: `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] leading-4 font-semibold`. Sentence case, never uppercase.
- Tones: `neutral` (default) `bg-subtle text-ink-muted`; `success`
  `bg-success-dim text-success-ink`; `warning` `bg-warning-dim text-warning-ink`;
  `danger` `bg-danger-dim text-danger-ink`; `info` `bg-info-dim text-info-ink`.
- `dot`: a leading `h-1.5 w-1.5 rounded-full bg-{tone}` instead of the tint
  (for inline status in dense tables).
- No solid fills (`bg-warning text-on-accent` goes), no outlined pills, no
  icons inside badges except the dot.
- `HealthBadge` and `SentimentBadge` hold the **only** tone maps for health
  bands and sentiment (replacing the seven copies in the dashboard and the
  rows): good → success, average → warning, poor → danger; positive →
  success, neutral → neutral, negative → danger.

**New tokens for readable status text.** `text-warning` (amber-500) on
`bg-warning-dim` is about 2:1 contrast. The foundations PR adds
`--color-success-ink`, `--color-warning-ink`, `--color-danger-ink`,
`--color-info-ink` to `@theme` and `html.dark`:

| Token | Light | Dark |
|---|---|---|
| `success-ink` | `#047857` | `#34D399` |
| `warning-ink` | `#B45309` | `#FBBF24` |
| `danger-ink` | `#B91C1C` | `#F87171` |
| `info-ink` | `#1D4ED8` | `#60A5FA` |

The plain `success/warning/danger/info` tokens stay for dots, bars, chart
marks and icons.

---

## 6. Page frame

### 6.1 PageHeader

Every route gets the same top bar. Today `Navbar.tsx` (677 lines) picks a
title per route with about 20 regexes and draws three different headers.

`PageHeader({ title, back?: { to, label }, tabs?, actions? })`; `back`
replaces the title, `actions` holds at most two controls plus a `⋯` menu.

- The page renders `PageHeader`; it portals into the bar through the
  existing `NavActionsSlotContext` (extended with a `title` slot). The
  `Navbar` keeps only the frame, the phone menu button, the Ask cluster on
  approved routes and the bell. Its per-route branches are deleted surface
  by surface; the last one goes in the Dashboard/Copilot PR.
- Bar: `relative z-20 flex h-16 shrink-0 items-center gap-3 px-4 border-b border-transparent data-[scrolled]:border-line-subtle`.
  It stays transparent on the canvas; the hairline appears once content has
  scrolled (a sentinel at the top of `PageBody` sets `data-scrolled`), so
  content no longer cuts against an invisible edge.
- Left: menu button (below `md`), then `back` (`QUIET`, Lucide `ChevronLeft`)
  or the `h1` title (`TYPE.title`), then `tabs`. Right: `actions`, the Ask
  cluster, the bell. Order and spacing are identical on every route.
- **One left edge.** The title's left edge equals the content's left edge:
  both use `px-4`. Copilot, Profile, Communications and Settings get the
  same bar (Copilot with "Copilot / Cockpit" as `Tabs`; Communications loses
  its own header).
- No dead icons, no second avatar (the sidebar owns the account menu), no
  search box in the bar.
- Phone (below `sm`): title plus scrolling tabs with `rv-scroll-fade`; the
  Ask cluster is one `ICON_BUTTON`; page actions move into a `⋯` menu.

### 6.2 Content width

`PageBody({ width })` wraps the scrolling content:
`flex w-full flex-col gap-4 px-4 pb-8` plus the width:

| `width` | Class | Used by |
|---|---|---|
| `full` | (none) | Record lists and boards, detail pages, Dashboard, Brain, Pipelines, Communications, Impact lists. The Ask rail, where present, takes its own column. |
| `reading` | `max-w-5xl` | Work (Today, Recommended, Activity, Team), Feature requests, Anomalies: single-column lists with no rail. |
| `form` | `max-w-3xl` | Builders and editors outside Settings (segment, rule, template). |

Prose blocks inside any width cap at `max-w-[68ch]` (the Brain brief, survey
answers). `pb-8` everywhere, so the last card never touches the viewport.
Card grids use `gap-4`; tiles `gap-3`.

### 6.3 SettingsFrame (every `/settings` page)

`WorkSettingsFrame`'s layout becomes a presentational `SettingsFrame`; its
data fetching stays in a thin `WorkSettingsFrame` wrapper.

`SettingsFrame({ title, intro, width = 'default', action? })` containing
`SettingsSection({ title, description?, footer? })` > `SettingsRow({ label, hint? })`,
plus `SettingsSaveBar({ dirty, saving, onSave })`:

| Part | Class / rule |
|---|---|
| Frame | `flex w-full flex-col gap-6 px-4 py-6 sm:px-6` + `max-w-3xl` (`default`) or `max-w-5xl` (`wide`: Connections, Attributes, AI usage, AI skills, Members). Always `w-full` (fixes People re-centring). |
| Heading | `h1` `TYPE.display`; intro `TYPE.body text-ink-muted max-w-[68ch]`; optional `action` (`BUTTON`, or the page's one `PRIMARY`) right-aligned on the heading row. The `h1` text equals the nav label. |
| `SettingsSection` | heading (`TYPE.title` `h2` + optional `TYPE.body text-ink-muted` description) **outside**, body in `Card pad="none"` with `divide-y divide-line-subtle`. Every form control lives in a section; nothing sits bare on the canvas. |
| `SettingsRow({ label, hint?, children })` | `grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center`; label `TYPE.label`, hint `TYPE.meta` under it. |
| Info callouts | no box: one line, Lucide `Info` 16px + `TYPE.body text-ink-muted`, inside the row or section that needs it. |
| Save | one `PRIMARY` per form. If the form is one section: in that section's `CardFooter`. If it spans sections: `SettingsSaveBar`, `sticky bottom-0 flex justify-end gap-2 border-t border-line bg-base py-3`, shown while dirty. Never a floating button on the canvas. |
| States | `LoadingState variant="block"` and `ErrorState` inside the first section's card; empty lists use `EmptyState` with auto height (no card stretched to the viewport bottom). |

**Account settings are out of scope** (owner, 2026-10-09: "don't touch
account settings right now, will work on that later"). `/account-settings/*`
and `/profile` keep `SettingsLayout.tsx`, `SettingsSidebar.tsx`, their
`rv-card`/`rv-pill` styling and their right rail until their own round.
Primitives must not break them: the `portfolio/styles.ts` re-exports keep
their current output for any class account settings import.

---

## 7. Density and colour rules

| Rule | Detail |
|---|---|
| One visible action per row | At most one always-visible control per row (often none: the row itself opens). Everything else (Ask about this, Snooze, Done, Why, Move, Open panel, `⋯`) shows on hover or focus from `sm`: `sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`. Opacity only, so the controls stay in tab order and on touch. |
| "Ask about this" | At most one per row, hover/focus only, never on rows inside the Ask rail. |
| Badges | At most **2** per row (one semantic plus one neutral) and **1** per tile or card header. Never a badge that restates the page's own context (the "Organization" pill on an organisation's page). |
| Uppercase | Only `TYPE.eyebrow` (tile labels, settings nav groups). |
| Separators | ` · ` between meta items; never bullets or pipes. |
| Icon chips | Decorative icon chips are `bg-subtle text-ink-muted`; never tinted by type or department. |
| Truncation | A name column is at least `minmax(12rem, 1fr)`; a truncated name always has a `title` attribute. |

**When amber or red is allowed.** Semantic colour means status, severity or
trend, nothing else.

| Allowed | Not allowed (use neutral) |
|---|---|
| Health band average / poor | Counts (open tickets, "47 recommended") |
| Risk at or above the server's threshold | Departments, categories, property types |
| Overdue, past SLA, renewal overdue | Routine waiting time below the SLA |
| Failed sync, errored connector, rejected | "Not connected yet", "Not set up", "Disabled" |
| A trend, next to its direction word ("down 12%") | Empty states, info callouts |
| Destructive actions (`DANGER`) | Decorative sparkles, zaps, hearts, gradients |

If more than about a third of the rows on a screen would be red or amber,
the threshold is wrong: show neutral and sort by severity instead.

---

## 8. What the foundations PR changes visibly

Mostly additive. The only app-wide visual changes: figures move to the body
font (`MONO` alias); `.rv-card` stays as it is (account settings and the
platform portal use it, out of scope this round); disabled buttons use the
token treatment; `Panel` renders through `Card` (same look); Lato leaves the
preload (owner's answer). Rows, tiles, toolbars and headers change
in the surface PRs.

---

## 9. Migration

### 9.1 Existing code onto primitives

| Today | Becomes |
|---|---|
| `.rv-card`; dashboard's ~40 inline `bg-surface border border-line-subtle rounded-lg shadow-sm` strings (`tabs/*/ControlsView.tsx`, `MovementView`, `RenewalView`, `OriginBar`); `health-overview` `CARD`; Knowledge's `border-line-subtle shadow-sm px-5 py-4` cards; `activity/HeadlinesTab` cards | `Card` (+ slots) |
| `pages/dashboard/shared/Panel.tsx` | `Card` + `CardHeader` (Panel removed in the Dashboard PR) |
| `brain/styles.ts` `LIST`, `NONE`, `FIGURES`, `SECTION_TITLE` | `ListCard`; `EmptyState size="inline"`; `Card` with `grid sm:grid-cols-3 sm:divide-x divide-line-subtle`; `TYPE.title` |
| `organizations/detail/listStyles.ts` `LIST`, `META`, `ROW_ICON`, `ROW_ACTION`, `SECTION_HEADING`, `TITLE_BUTTON` | `ListCard`, `ListRow` meta/leading/actions, `ICON_BUTTON`, `TYPE.title`, `ListRow` title control |
| Impact's six copies of `flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-surface px-3 py-2.5` (`SegmentRow`, `SendRow`, `RuleListItem`, `PlanRowItem`, `CampaignRowItem`, `AnswersSection`) and their `flex flex-col gap-1.5` lists | `ListRow` in one `ListCard` |
| `PipelineItem`, `AccountRow`, `ContactListItem`, Comms queue rows, `StoryItemRow`, `CallItem` | `ListRow` (grid `columns` for Pipelines and the Comms queue) |
| `portfolio/tileParts.tsx` `Tile`, `Switch`, `FilterButton`; `brain/styles.ts` `tileRow`; Brain `BrainTiles`/`ChangedTiles`/`DoingTiles`/`CustomerTiles`; `SendTiles`; `dashboard/shared/Kpi.tsx`; Cockpit KPI labels | `Tile`, `tileRow`, `SegmentedControl size="sm"` |
| `PortfolioSections` `ErrorBlock`, `EmptyState`, `RowSkeleton`; `dashboard/shared/DataState.tsx` `Loading`, `ErrorState`, `Empty`, `TruncatedNotice`; `MailboxView` `InboxZero` | `ErrorState`, `EmptyState`, `LoadingState` inside the owning card (`TruncatedNotice` becomes a neutral `CardFooter` line) |
| `DetailTabs`, `BrainTabs` `TAB`, `WorkTabs`, the Navbar's tab navs, `SurveysHome`/`ScenariosHome` tabs, Settings › People tabs, Attributes and AI feedback tabs | `Tabs` |
| `ScopeSwitch`, `PipelineKindSwitch`, `ProjectsHome` segment, Segments scope, Copilot/Cockpit pill (becomes `Tabs`), dashboard sub-area segments, Appearance control, Movement window chips | `SegmentedControl` |
| `portfolio/FilterChips`, Feature requests / Anomalies black chips, Story filter chips, Connections category pills | `FilterChip` |
| `toolbarParts` `ToolbarSearch`, Segments search, Canvas label-above search, Plans search, Navbar "Search all conversations" | `SearchInput` (the Navbar one is deleted) |
| `PortfolioToolbar`, `ContactsToolbar`, Pipelines toolbar, Impact list toolbars | `Toolbar` |
| `FILTER_SELECT`, ScopeSwitch `SELECT`, `ActionsGridForm` `SELECT`, every bare `<select>` | `Select` |
| `InboxPanel` switch, `RuleSwitch`, `AgentsForm` switch checkbox | `Switch` |
| Health/sentiment tone maps (`TriageView`, `AccountHealthDetailTable`, `SwingTable`, `GoingDarkTable`, `RenewalQueueTable`, `TriageQueue`, `DivergenceList`, row parts), Attributes property pills, Connections status pills, AI feedback chip, priority tags | `Badge`, `HealthBadge`, `SentimentBadge` |
| `portfolio/styles.ts` `PRIMARY`/`BUTTON`/`QUIET`/`FOCUS`/`MONO`/`COLUMN_ICON_BUTTON`; plans `INPUT`; `rv-pill-primary`/`rv-pill-secondary`; hand-rolled buttons (`CurrencySection`, `AgentAccessPage`, `BriefDeliveryPage`, `GlobalConfigSidebar`, `Integrations`, `ScenariosList`, `SurveysPage`) | `ui/styles.ts` constants (`MONO` → `NUM`/`CODE`) |
| `WorkSettingsFrame` layout; the ~29 pasted `text-[20px] font-bold` settings h1s and their per-page `max-w-*` wrappers; `routes.tsx` Billing `p-6 max-w-4xl` | `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsSaveBar` |
| `layouts/SettingsLayout.tsx`, `components/settings/SettingsSidebar.tsx` | `WorkspaceSettingsLayout` (You group) |
| Navbar route branches (`isFramed`, solid white header; the account-settings header stays), `IconButton` | `PageHeader` + `PageBody` |

### 9.2 Surface PRs, in order

Each is one frontend PR on its own branch, after foundations is merged.

| # | Surface | Routes | Main moves |
|---|---|---|---|
| 1 | **Records** | `/organizations/*`, `/accounts/*`, `/contacts/*` | `ListCard`/`ListRow` rows, `Tile`, `Toolbar` (Contacts joins it), `EmptyState`, Story/Calls rows with even heights, Knowledge cards flattened, board card actions on hover. Records go first: they hold the most off-scale sizes (524 in 105 files) and prove the row, tile and toolbar primitives for everyone else. |
| 2 | **Pipelines, Communications, Brain, Work** | `/pipelines/*`, `/communications`, `/brain/*`, `/work/*` | Grid-column rows for Pipelines and the Comms queue, flat rows in the glass shell, `SegmentedControl` for kind and scope, one section-title style on Brain, `PageBody width="reading"` for Work. |
| 3 | **Impact** | `/segments`, `/surveys`, `/scenarios`, `/projects`, `/campaigns`, `/canvas` | One `ListCard` per list, `Tabs`/`SegmentedControl`/`SearchInput` per role, detail headers with two actions plus `⋯` and Delete as `DANGER` in the menu, flattened builder boxes. Legacy Scenarios canvas and Logged scores per owner answer (section 11). |
| 4 | **Settings** | `/settings/*` (not `/account-settings/*`) | `SettingsFrame` on every page, sections and rows, Connections as a compact `divide-y` list or `p-4` cards, neutral property badges. |
| 5 | **Dashboard, Copilot and shell** | `/dashboard/*`, `/copilot`, sidebar, notifications | `Card` replaces the inline strings and `Panel`, fixed heights removed, `HealthBadge`, Copilot gets the `PageHeader`; the Navbar's last route branches are deleted; sidebar count badges neutral; notifications rows on a fixed grid. |

### 9.3 How each PR is verified

1. **Screenshots.** Foundations adds `scripts/ui-shots.mjs` (Playwright):
   route list in, demo admin login, `shots/<route>-<viewport>-<theme>.png`
   out for **1440×900 and 390×844, light and dark** (dark via
   `page.emulateMedia({ colorScheme: 'dark' })` with the user theme on
   `system`, since `ThemeSynchronizer` overwrites a hand-added `.dark`). The
   PR shows before/after pairs; `/__ui` is always included.
2. **Layout checks** in the same script fail the run on: horizontal scroll
   at 390 (`scrollWidth !== 390`), page content overlapping the header's
   box, or any console error.
3. **Tests.** Each primitive ships with unit tests (roles, names, keyboard on
   `Tabs`, `aria-pressed` on `SegmentedControl` and `FilterChip`, the
   stretched-link row opening on Enter, `LoadingState` being `role="status"`
   and never hidden, `ErrorState` `role="alert"`, `Badge` tone map,
   `ICON_BUTTON` requiring a label, the Card-in-Card dev error). Surface PRs
   update their page tests to the new markup.
4. `npm run lint`, `npm run build`, and the full Vitest run pass.

### 9.4 House-rule tests, extended

`src/test/houseRules.ts` gains:

| Rule | How |
|---|---|
| Off-scale sizes | Already enforced per migrated folder (11/13/15/22). Each surface PR adds its folders to a `houseRuleSuite`. |
| No raw card strings outside `components/ui/` | `cardOffenders(source)`: a class string holding `bg-surface` together with a `rounded-(lg\|xl\|2xl)` and a `border` or `shadow`, or `\brv-card\b` (not `rv-card-glass`), outside `components/ui/`. |
| No card shadows | `shadow-sm` / `shadow-md` outside `components/ui/` and overlay files. |
| No opacity-disabled controls | `disabled:opacity-` anywhere. |
| No mono for figures | `font-mono-brand` outside `ui/styles.ts` (`CODE`). |
| Weights | `font-bold`, `font-medium`, `font-black` (migrated folders). |
| No uppercase outside eyebrows | `\buppercase\b` outside `ui/type.ts` and the settings nav. |

**Ratchet.** Applying all of this to the whole app at once would fail on
day one. A new `src/test/uiRatchet.test.ts` globs every non-test `.tsx` under
`src/`, counts each offence (off-scale sizes, raw card strings, card
shadows, `disabled:opacity-`, `font-mono-brand`, `font-bold`) and asserts
each count is **at most** a baseline written in the test. Foundations
records the baselines; every surface PR must lower the numbers for its
folders and update the baselines down, never up. When a count reaches zero,
its rule moves from the ratchet into `houseRuleSuite` for the whole app.

Exemptions are named files, not patterns: the auth pages and the Copilot
greeting (`font-display` sizes), the Ask rail and Communications shell
(glass), `ui/*` itself.

---

## 10. Skill update (in the foundations PR)

`react-ts-app/.claude/skills/revenact-design/SKILL.md` (symlinked into the
monorepo's `.claude/skills`) changes in the same PR:

- §1 **Fonts**: DM Mono for IDs and code only; figures in the body font with
  `tabular-nums` (`NUM`); body font per section 11.
- §1 new row **Primitives**: card, list, tile, state, tab, segment, chip,
  search, select, toolbar, badge, header and settings-frame markup is
  written only in `src/components/ui/`.
- §1 **Radius / Elevation**: cards `rounded-xl border-line`, no shadow;
  `shadow-lg` only on overlays.
- §4.3: four sizes (11/13/15/22, roles in `ui/type.ts`); numbers in the body
  font with `tabular-nums`; DM Mono only for IDs and code.
- §4.4: glass exception extended to Contacts (`/contacts/*`) and Brain
  (`/brain/*`) by the owner's answer of 2026-10-09; account settings
  untouched this round. New §4 item: section 7's density and colour rules.

---

## 11. Owner answers (2026-10-09)

1. **Body font:** keep the system stack this round; drop the unused Lato
   preload. Lato can come later after a tabular-figures check.
2. **Glass Ask rail:** approved on Contacts and Brain (added to the skill's
   §4.4 list in the foundations PR).
3. **Account settings** (`/account-settings/*`, `/profile`, its rail,
   calendar card and Skills & Tasks page): out of scope; untouched until the
   owner's own account-settings round.
4. **Legacy Scenarios canvas tab and Surveys "Logged scores":** restyled onto
   the primitives in the Impact PR, not retired.
5. **`*-ink` text tokens:** part of this spec as written (section 5.7); the
   owner approves them with the spec.
