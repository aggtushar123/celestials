# Settings: production redesign

Date: 2026-10-11. Status: approved in conversation, awaiting written-spec review.
Scope: workspace Settings (`/settings/*`) in react-ts-app only. Builds on the
Settings UI cleanup (PR #134) and the scrollbar fix (62e5168).

## 1. Why

A Playwright tour of all 20 Settings pages (1440x900, light and dark) found the
section reads as unfinished:

- The frame: the orange/teal canvas glow sits behind the nav and forms; three
  layers of navigation (icon rail, a floating "Settings" bar title, a 20-item
  nav that is cut off at 650-900px tall); the page scroll uses the browser's
  white scrollbar; page widths vary (720px on General, Defaults, Billing;
  976px on People, Attributes) so narrow pages leave half the screen empty.
- Patterns: a footer row holding a greyed-out Save on nearly every card; an
  "On" label beside every toggle; three different label/control layouts.
- Long pages: AI usage is 23 near-empty cards at 0%; AI skills is a wall of
  text; Actions & approvals is about 40 identical "Ask" dropdowns.
- Content: Connections lists Zendesk and Intercom twice (tool row, then source
  row) with mismatched status pills; Billing shows a full red seats bar and
  "Free until 5 October 2026" after that date; Defaults crams its hint into
  the dropdown text.

Goal: Settings that look and behave like a production control panel
(reference points: Vercel, GitHub, Linear, Stripe settings), with no change
to what each setting does.

## 2. Owner decisions (2026-10-11)

1. Layout: two-column sections (title and help on the left, one card of
   controls on the right), one width for every page.
2. Navigation: merge the 20 pages into 12 nav items; related pages become one
   page with tabs; old URLs redirect.
3. Saving: hybrid. Toggles and single selects save instantly (toast, Undo);
   text and number fields collect into one sticky unsaved-changes bar.
4. Background: Settings uses a solid calm canvas, no glow. The rest of the app
   keeps its glow.

## 3. Out of scope

- Account settings (`/account-settings/*`, `/profile`): untouched, as in every
  UI round so far.
- Backend and API changes. Every call the pages make today stays the same.
- New settings. Rule from the settings rework: no setting for a feature that
  does not exist.

## 4. Frame

### 4.1 `WorkspaceSettingsLayout`

- Solid background: the layout root sets `bg-canvas-solid` (a new Tier-2
  token alias of the existing warm canvas colour, light and dark) and covers
  the `.rv-canvas` glow for the Settings route only. No new hex values.
- The bar's `PageHeader title="Settings"` is removed. "Settings" becomes the
  nav column's heading (`TYPE` heading size, not an h1; each page keeps its
  own h1). The notifications bell and other bar actions stay in the bar.
- Nav column: full height, `w-56`, solid surface, `border-r border-line`,
  scrolls on its own with `rv-scrollbar` only if the window is shorter than
  the 12 items.
- Content column: scrolls on its own with `rv-scrollbar` (fixes the white
  page scrollbar), keeps the `ScrollSentinel`.
- Below `md`: keep today's section `Select`; its options follow the new
  12-item nav, and a tabbed page shows its tabs under the page header.

### 4.2 Navigation (`workspaceSettingsNav.ts`)

| Group | Item | Path | Tabs (path) | Old paths redirected |
|---|---|---|---|---|
| Workspace | General | `/settings/general` | | |
| | People & teams | `/settings/people` | Members, Roles, Access (as today) | |
| | Connections | `/settings/connections` | | |
| | Plan & billing | `/settings/billing` | | |
| Data | Attributes | `/settings/data` | as today | |
| | Defaults | `/settings/defaults` | | |
| | Products | `/settings/products` | | |
| | Imports | `/settings/entity-uploads` | | |
| Automation | Work | `/settings/work` | Recommendations (`/recommendations`), Tasks (`/tasks`), Notifications (`/notifications`), Briefs (`/briefs`) | `/settings/recommendations`, `/settings/work-tasks`, `/settings/work-notifications`, `/settings/brief-delivery` |
| | Agents | `/settings/agents` | Agents (`/settings/agents`), Actions & approvals (`/settings/agents/actions`) | `/settings/agent-actions` |
| | AI | `/settings/ai` | Attributes (`/attributes`), Skills (`/skills`), Usage (`/usage`), Feedback (`/feedback`) | `/settings/ai-attributes`, `/settings/ai-skills`, `/settings/ai-usage`, `/settings/ai-feedback` |
| Developers | Webhooks & API access | `/settings/developers` | Webhooks (`/webhooks`), Agent access (`/agent-access`) | `/settings/webhooks`, `/settings/agent-access` |

- Tab paths are children of the item path (for example
  `/settings/work/tasks`); the bare item path redirects to its first visible
  tab.
- Capabilities move to the tab: Skills, Usage and Feedback keep
  `view_all_accounts`. An item shows when at least one of its tabs is
  visible; a tab the person cannot see is not rendered and its URL keeps its
  `RequireCapability` guard.
- Redirects keep the query string (Connections' OAuth return already relies
  on this pattern in `redirects.tsx`).
- Every in-app link to an old path (Copilot, Brain, notifications, tests) is
  updated to the new path; the redirects cover bookmarks and old emails.

## 5. Shared parts (`src/components/ui/SettingsFrame.tsx` and neighbours)

### 5.1 `SettingsFrame` (page shell)

- One content width: `max-w-[960px]`, left-aligned in the content column, 32px
  top padding, 24px side padding from `md` (16px below).
- Header: h1, one-line description (`text-ink-muted`), at most one action on
  the right (the page's primary, for example "Add team member").
- Optional `tabs` prop: the shared `Tabs` component in its bar style, under
  the header, each tab a route link.
- `wide` prop for table pages (People, Attributes, Imports, AI usage, AI
  feedback, Connections): tables span the full 960px under the header; they
  are not forced into the two-column section.

### 5.2 `SettingsSection` (two columns)

- From `lg` (1024px): grid `[260px_1fr]`, gap 32px. Left: section title
  (`TYPE` section size) and help text (muted, max 40ch). Right: one card.
- Below `lg`: title and help stack above the card.
- Sections are separated by `border-t border-line` with 32px vertical
  padding; the first has no rule.
- Card: the UI-cleanup standard (solid surface, 1px `border-line`,
  `rounded-xl`, no shadow), rows `divide-y`.
- `variant="danger"`: title in `text-danger`, card border `border-danger/30`;
  used once, for ownership transfer.

### 5.3 `SettingsRow`

- Label (and optional hint under it, muted, smaller) on the left; control
  right-aligned. From `sm`, the label column takes the remaining width and
  the control sits at its natural width (selects `w-64`, number inputs
  `w-24`); below `sm`, the control goes under the label at full width.
- Min height 56px, 16px padding.
- The trailing "On"/"Off" text beside `Switch` is removed everywhere; the
  switch keeps its `aria-label` from the row label.
- The footer row with a Save button is removed from every section.

### 5.4 Saving

**Instant controls** (Switch, a single Select, segmented controls): on change
the page calls its existing save call at once.

- Success: toast "Saved" with an Undo button (5 seconds) that re-sends the
  previous value through the same call. Every instant control in §6 can be
  reversed this way.
- Failure: the control reverts to its previous value and an inline error
  shows under the row; no toast.
- While saving, the control is `aria-busy` and ignores further input.

**Draft fields** (text, number, URL, day chips, multi-field forms):

- `useSettingsDraft(sectionId, { initial, save })` registers a section with a
  page-level `SettingsDraftProvider` (mounted by `SettingsFrame`). It returns
  `{ value, setValue, error, dirty }`.
- `SettingsSaveBar`: sticky at the bottom of the content column, shown while
  any section is dirty. Copy: "Unsaved changes" · "Discard" · "Save". Save
  runs every dirty section's `save` in order; a failing section keeps its
  draft and shows its error under the field; the bar stays until every dirty
  section is saved or discarded. Enter in a draft field saves; Escape in the
  bar discards after focus moves there.
- Leaving with unsaved drafts (in-app navigation, tab switch, browser
  unload): react-router `useBlocker` opens a confirm dialog, "Leave without
  saving?", "Stay" / "Leave"; `beforeunload` covers closing the tab.
- Motion: the bar slides up 200ms `--ease-out`, down 120ms `--ease-in`; no
  motion under reduced motion.

**Destructive and one-shot actions** (Deactivate, Disconnect, Transfer
ownership, Create key, Run now, Stop sending): unchanged, keep their own
buttons and confirm dialogs; not part of the draft bar.

### 5.5 Other shared pieces

- `StatusBadge`: dot plus word, one size. Tones: success "Connected",
  warning "Needs attention", neutral "Not set up" / "Off", danger "Error".
  Replaces the ad-hoc pills on Connections, Webhooks, Agents and People.
- `SegmentedControl`: radio group with roving focus (arrow keys), 32px high,
  for Auto | Ask | Never and similar small enums.
- `DayChips`: seven toggle buttons (M T W T F S S) with full day names as
  accessible labels.
- `SettingsEmpty`: icon, one sentence, optional action, inside the card.
- Loading: skeleton rows shaped like `SettingsRow`, never a spinner.
- `Banner`: tone (info, warning), icon, one sentence, optional link; used for
  "Email isn't set up on this server yet" and similar.

## 6. Pages

**General.** Sections Workspace (name, slug in mono, owner) and Danger zone
(ownership transfer: new-owner select plus "Transfer ownership" quiet danger
button, existing confirm).

**People & teams** (`wide`). Members table: avatar and name, email, role,
function, manager, status badge, a row menu. Role, function and manager show
as text; the row menu holds "Change role…", "Change function…", "Change
manager…", "Deactivate" (existing confirm). Changing opens a small popover
with the same select and saves instantly (toast, Undo). Search box and a
member count in the table toolbar. "Add team member" is the page action.
Roles and Access tabs keep their content inside the new section styles.

**Connections** (`wide`).
- Your mailbox: one section; connected state shows address, last sync and
  "Disconnect"; not connected shows the two provider buttons.
- Tools: toolbar (search, count, category tabs All, CRM, Communication,
  Productivity, Support); one row per tool with logo, name, category and one
  line of description, `StatusBadge` and its action (Connect / Add another).
  A tool's configured sources render as indented child rows under it (scope,
  counts, last sync, Set up / row menu), so a tool appears once.

**Plan & billing.** Header tiles: Seats (used of total, bar neutral below
90%, warning from 90% to 100%, danger only over), AI credits (balance) and
Plan (name and state). Plan section: when the trial end is in the past, "Trial
ended {date}" with the hint "Contact Revenact to choose a plan; it is applied
the same day." (text only, no new link); when in the future, "Free until {date}". The "No plans are published
yet" card is removed. Credit history: compact table (when, what, change,
balance; numbers right-aligned, `tabular-nums`) showing 25 rows and an
"Older" button that reveals 25 more of the already-loaded list.

**Attributes** (`wide`). Tabs, search, Filter and Download unchanged. Table
rows 48px: name over key (mono), type, Required badge, filled bar plus
percentage.

**Defaults.** Currency section (select, instant; preview line under it).
Exchange rates section: table (currency, rate, row menu) with "Add rate"
as the section action; empty state "No exchange rates yet: every customer is
assumed to bill in USD." New organisations section: default lifecycle select
(instant); the "starts at Onboarding" note moves to the row hint.

**Products.** Table of name and customer count; row menu Rename (inline
input, draft) and Delete (existing confirm). "Add product" is the page action.

**Imports** (`wide`). Drop zone: "Drop a CSV here or choose a file", hint
"First row: column headers. A Name column is required." Then the existing
preview and mapping steps, restyled into sections.

**Work → Recommendations.** Who receives them: the two radio rows with
descriptions, as today (instant). Signals: one row per signal with its switch (instant); the
threshold inputs sit inline in the hint sentence ("A renewal within [30] days,
or overdue."), as draft fields.

**Work → Tasks.** Reminders section: overdue threshold (number, draft),
timezone (select, instant), working days (`DayChips`, draft).

**Work → Notifications.** Warning `Banner` when email is not configured.
Daily digest: switch (instant), send after (select, instant).

**Work → Briefs.** Status row: "Not scheduled" or "Weekly on Monday" with the
masked channel webhook; Slack webhook URL (draft, write-only as today), how
often and day (selects, part of the same draft since they only make sense
with the URL); "Stop sending" keeps its confirm.

**Agents → Agents.** Workspace AI section: master switch, tone select (both
instant). One section per agent: switch (instant), monthly credits (number,
draft), a usage bar with "{used} of {budget} credits this month · resets
{date}", last run line, "Run now" as the section action.

**Agents → Actions & approvals** (`wide`). Table: rows grouped Records,
Tasks, Outreach (group headers in the table); one column per agent; each cell
a `SegmentedControl` Auto | Ask | Never, or "Not used" text. Column header
menu "Set all to…". Each change saves instantly (toast, Undo).

**AI → Attributes.** Unchanged content, new section styles; "New attribute"
is the page action.

**AI → Skills.** A list: skill name, where it runs, usage this month, last
run. Selecting a skill opens the existing side panel pattern with Reads / May
/ Never, who may ask, budget and last run. The "Budgets and the call log"
link becomes a link to the Usage tab.

**AI → Usage** (`wide`). One table sorted by tokens used: skill, calls,
tokens used of budget, percentage bar. Skills with 0 calls this month
collapse under a "Not used this month ({n})" disclosure row.

**AI → Feedback** (`wide`). Tabs unchanged. List rows: type badge, title,
verdict as a `StatusBadge` (approved success, rejected neutral), person and
date; comments clamp to two lines with "Show more".

**Developers → Webhooks.** Table: URL (mono, truncated), events, status
switch (instant), row menu (Edit, Delete with existing confirm). "Add
webhook" is the page action.

**Developers → Agent access.** The MCP endpoint `Banner` (info). "Create
key" is the page action and opens a dialog with the "What is it for" field;
the key is shown once in the dialog as today. Keys table keeps its empty
state.

## 7. Accessibility and responsive

- Every control keeps a visible label or `aria-label`; segmented controls and
  day chips are keyboard operable; focus returns to the trigger after a
  popover or dialog closes.
- Toasts are announced politely; inline errors are tied with
  `aria-describedby`.
- Layout checked at 375, 768, 1024 and 1440; no horizontal scroll (wide
  tables scroll inside `ScrollTable`).

## 8. Testing

- Unit: `useSettingsDraft` and `SettingsSaveBar` (dirty, save all, partial
  failure, discard, blocker), `SegmentedControl`, `DayChips`, `StatusBadge`,
  nav visibility and redirects (every old path lands on its tab with the
  query kept).
- Integration: each page's existing tests updated to the new structure;
  instant-save success, failure revert and Undo on at least one page per
  control type.
- Full suite, `npm run lint`, `npm run build`, style ratchet baselines must
  not rise.
- Playwright screenshots of every page at 1440 and 375, light and dark,
  before and after, attached to the PRs.

## 9. Delivery

Branch `feat/settings-production` (worktree `.worktrees/settings-prod-fe`),
currently stacked on `feat/ui-settings`; rebased onto main once #134 merges.

1. PR 1: frame (§4), shared parts (§5), nav merge and redirects, the save
   model wired into the pages with simple forms (General, Defaults, Work
   tabs, Agents tab, Briefs, Notifications).
2. PR 2: the page-specific rebuilds (People, Connections, Billing,
   Attributes, Products, Imports, Actions & approvals, AI tabs, Developers).

## 10. Amendments after reading the code (2026-10-11, while planning)

These override the sections they name.

1. §4.1 Solid background: no new token. `DashboardLayout` puts `bg-base`
   (the existing warm canvas colour, both modes) instead of `rv-canvas` on its
   content wrapper while the route is `/settings/*`.
2. §4.1 The bar's "Settings" `PageHeader` stays below `md` (phones have no
   nav column to carry the word); from `md` the nav's heading carries it.
3. §4.2 Tabs reach the page through a context: a tabbed item's route element
   (`SettingsTabsRoute`) provides the tab row, and `SettingsFrame` draws
   whatever that context holds under its header. Pages keep rendering their
   own `SettingsFrame`; their h1 becomes the item's label ("Work", "AI").
4. §5.2 Sections with a `list` or a `header` (lists and tables) stay stacked
   (title above the card) at every width; only form sections use the two
   columns. `variant="danger"` colours the title only (no border override).
5. §5.4 Instant controls are not optimistic: the control keeps its value
   while the request runs (the switch is `aria-busy`), and shows the new
   value when the server answers. A failure therefore has nothing to
   revert; the error shows under the row.
6. §5.4 The save bar has no exit animation and no Escape shortcut; it
   appears with the existing `animate-fade-up` (200ms, ease-out, off under
   reduced motion). The toast sits top-right under the bar, so it never
   covers the save bar.
7. §5.4 Leaving with unsaved drafts reuses `useUnsavedGuard` and
   `UnsavedChangesDialog` (in-app links and closing the tab; the browser's
   Back button is not intercepted, as elsewhere in the app).
8. §6 Defaults: the currency select stays a draft field in the save bar,
   because saving a new currency clears every exchange rate; its warning
   note stays. The default lifecycle select is instant.
9. §6 Recommendations: thresholds keep their current place under each
   signal's description (labelled compact inputs); the switch drops its
   On/Off words. No sentence-embedded inputs.
10. §6 Briefs keeps its own "Schedule it" / "Save" button: the Slack URL is
    write-only and the schedule is one create, so it behaves like Create
    key, not like a draft field.
11. §5.5 `StatusBadge` and `SettingsEmpty` move to PR 2, where their pages
    are rebuilt; PR 1 adds `Toast`, `useInstantSave`, the draft scope and
    bar, `DayChips` and `Banner`.
