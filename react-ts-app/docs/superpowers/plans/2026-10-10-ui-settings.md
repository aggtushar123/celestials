# UI Settings Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every workspace settings page (`/settings/*`, the twenty items of the grouped settings nav) onto the shared UI primitives in `src/components/ui/`: the settings bar titled through `PageHeader`, one `SettingsFrame` per page (its `h1` equal to the nav label, one width rule, no pasted 20px headings or per-page `max-w-*` wrappers), every form control inside a `SettingsSection` of `SettingsRow`s, one `PRIMARY` per form (in the section's footer, or in a sticky `SettingsSaveBar` when the form spans sections), lists as one card of divided rows (Attributes and Custom objects on tested container grids), tables flush in their card (Members, Credit history, Imports, AI usage calls, Actions & approvals), `Tabs` for People & teams, Attributes and AI feedback, loading, empty and error states inside their cards, the four-size type scale, figures in the body font, and colour only where it means status. Account settings (`/account-settings/*`, `/profile`) are not touched.

**Architecture:** The same shape as the Records, Ops and Impact PRs. Task 1 closes the primitive gaps Settings needs (a `PageHeader` title that is not a heading, a `SettingsFrame` note and focusable heading, a `SettingsSection` action, list body, header and state, a `SettingsRow` error, hint id, stacked and group layouts, a `SettingsSave` for a one-section form, a `SettingsSaveBar` whose status region stays mounted, a `SettingsNote` for the one-line callouts, `MetaParts`, four form constants) and adds the two Settings list grids with their summed-minimum test, plus `settingsTitle(path)` so every page's `h1` is read from the nav. Task 2 moves the "Settings" title into the framed bar. Tasks 3 to 13 convert the pages, area by area; Task 14 holds the Settings files to every foundations rule, lowers the ratchet, updates the docs and runs the full verification.

**Tech Stack:** React 19 + TypeScript, Vite 8, Tailwind v4 (`@theme` in `src/index.css`, container queries `@container` / `@min-[NNrem]:`), react-router 7, lucide-react, Redux Toolkit (the settings slices), Vitest + Testing Library (jsdom), `scripts/ui-shots.mjs` (Playwright CLI) for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-09-ui-foundations-design.md` (owner-approved 2026-10-09, binding): §2 type scale, §3 numbers, §4 surfaces, §5 controls, §6.1 the bar, **§6.3 SettingsFrame** (`SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsSaveBar`; `WorkSettingsFrame` becomes a thin data wrapper; `default` max-w-3xl, `wide` max-w-5xl for Connections, Attributes, AI usage, AI skills, Members; one `PRIMARY` per form; info callouts are one line, no box; states inside the first section's card), §7 density and colour rules, **§9.1** (the pasted settings `h1`s and their per-page `max-w-*` wrappers, `routes.tsx` Billing `p-6 max-w-4xl`, Settings › People, Attributes and AI feedback tabs onto `Tabs`, Attributes property pills and Connections status pills onto `Badge`, Connections category pills onto `FilterChip`, every bare `<select>` onto `Select`, the `AgentsForm` switch onto `Switch`), §9.2 row 4 (Settings: `SettingsFrame` on every page, sections and rows, Connections as a compact `divide-y` list, neutral property badges), §9.3 verification, §9.4 house rules and ratchet, §11 owner answers (answer 3: account settings untouched). Read it alongside this plan. The Impact plan (`docs/superpowers/plans/2026-10-10-ui-impact.md`), the Ops plan and the Records plan are the models: where a step says "as Impact did", the merged code (#132) is the reference.

**Owner decisions that bind this plan (2026-10-10):** account settings are out of scope (do not touch `/account-settings/*`, `/profile`, `src/layouts/SettingsLayout.tsx`, `src/components/settings/SettingsSidebar.tsx`, and do not change the output of any class those import); bordered quiet cards, a list is one card of `divide-y` rows; body-font tabular numbers, DM Mono only for IDs and code; keep the system font; status colours only for real status. Spec §9.1's row "`SettingsLayout`/`SettingsSidebar` → `WorkspaceSettingsLayout` (You group)" is therefore **not** done here: it is an account-settings move.

## Global Constraints

- Worktree `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/ui-settings-fe`, branch `feat/ui-settings`, cut from `main` 17f5013 (holds #128 broken fixes, #129 foundations, #130 Records, #131 Ops, #132 Impact). All paths below are relative to the worktree. If `main` moves before this PR merges, rebase onto it in Task 14 Step 8.
- Scope: the twenty routes under `WorkspaceSettingsLayout` (`src/pages/settings/routes.tsx`) and the files they render: `layouts/WorkspaceSettingsLayout.tsx`; `pages/settings/{GeneralSettingsPage,DefaultsPage,CurrencySection,LifecycleDefaultSection,ProductsPage,EntityUploadsPage,WebhooksPage,AgentAccessPage,AIAttributesPage,BriefDeliveryPage,SettingsPage,AttributesTabContent,AttributesTable,CustomObjectsPage,GlobalConfigSidebar,WorkSettingsFrame,AgentSettingsFrame,WorkRecommendationsPage,WorkTasksPage,WorkNotificationsPage,AgentsSettingsPage,AgentActionsPage,routes,workspaceSettingsNav}.ts(x)`; `pages/users/{UserManagement,AccessTab}.tsx`; `pages/integrations/Integrations.tsx`; `components/integrations/{MailboxSection,ConnectSourceForm}.tsx`; `pages/brain/{Agents,Skills,Feedback}.tsx` (routed only under Settings); `components/work/{WorkSettingsForm,WorkSettingsSummary,WorkTasksForm,WorkTasksSummary,WorkNotificationsForm,WorkNotificationsSummary}.tsx`; `components/agents/{AgentCard,AgentsForm,AgentsSummary,ActionsGridForm,ActionsGridSummary,AiOffNotice}.tsx`; one Navbar branch.
- **Out of scope, never edited:** `src/layouts/SettingsLayout.tsx`, `src/components/settings/*` (`SettingsSidebar`, `AccountSecurity`), `src/pages/settings/{AccountSettingsPage,IntegrationsSettingsPage,PersonalizationPage,SkillsTasksPage,AboutSettingsPage,BillingSettingsPage}.tsx` and their tests, `src/pages/profile/*`, the Navbar's `isAccountSettings` header, `.rv-card`/`.rv-pill-*` in `index.css`, `components/organizations/portfolio/styles.ts`. `BillingSettingsPage` renders `/account-settings/billing`, so `/settings/billing` gets a new page (Task 6) instead of a restyle. Also out of scope: `ConfirmDialog` (shared; its look changes in the shell round), the custom object records page (`/custom-objects/:id`), the `features/*` slices and copy constants except where a task names one line.
- Tokens only, both themes: no hex, `rgb()`, named palette colour, `bg-white`/`text-white`/`bg-black/NN` in any `src` file this PR touches. The one exception is the brand logos (Task 12), moved into `components/integrations/providerLogos.tsx` and exempted by name from the token rule only.
- Type sizes 11/13/15/22 px only, through `TYPE` (`ui/type.ts`) wherever a role fits; weights `font-normal` and `font-semibold` only. `ui/type.ts` forbids a colour class after a `TYPE` string (two text colours resolve by stylesheet order): use `TYPE.bodyMuted` for muted body text, and where a role needs another colour write the size classes out (`text-[13px] leading-5 text-danger-ink`).
- Figures use `NUM` (`tabular-nums`, body font); `CODE` only for IDs, keys, endpoints, webhook URLs, DNS records, attribute API names and the workspace slug. Wrap the figure, never the phrase or a word ("Nobody on it", "Not set" are words).
- One card standard (`Card`, `ListCard`, `Tile`, `SettingsSection`'s card): `rounded-xl border border-line bg-surface`, no shadow, **no card inside a card**. `shadow-lg` only on overlays (`OVERLAY`). Inside a section's card nothing is boxed: groups are separated by the card's `divide-y` and whitespace; a code value sits on `bg-subtle` with no border.
- **Every settings page is one `SettingsFrame`** (`default` width, or `wide` for Connections, Attributes, AI usage, AI skills, People & teams), its `h1` text read from the nav through `settingsTitle(path)` (Task 1). No page writes `<h1`, `text-[20px]`, `p-6`, `mx-auto` or a `max-w-*` page wrapper. `WorkSettingsFrame` and `AgentSettingsFrame` are thin data wrappers around `SettingsFrame` (spec §6.3).
- **Every form control lives in a `SettingsSection`.** Labels: in a `SettingsRow` the label sits in the row's label column (above the control below `sm`, beside it from `sm`, spec §6.3), `stacked` puts it above at every width (long controls: a textarea, a URL); everywhere else (a dialog, a sub-field inside a list row) the label is above its control in `TYPE.label`. Never uppercase. Errors sit below the control (`SettingsRow` `error`/`errorId`, or `FIELD_ERROR`), the control carries `aria-invalid` and `aria-describedby` naming the hint and the error, and the frame shows the danger edge through `INVALID`.
- **One `PRIMARY` per form.** A form that is one section puts `SettingsSave` in that section's `footer`; a form that spans sections ends with `SettingsSaveBar`. A button that only opens a form ("Add product", "New attribute", "Add webhook", "New object", "New role", "Add rate", "Add team member") is a `BUTTON`; the form it opens owns the `PRIMARY`. A Save that stays focused after saving uses `aria-disabled`, never `disabled` (both primitives do this).
- One-line callouts use `SettingsNote` (`info`, `lock` for "you can't change this", `warning` for a real consequence): no tinted box, no border. "You don't have permission" is a `lock` note, never amber.
- 44px targets below `sm` (`min-h-11`); a `role="status"` region is never `display:none`, never `empty:hidden`, and never unmounted between updates: the element is always rendered and only its children change (`sr-only` or `empty:sr-only` when it carries spacing); every such region added here gets a same-node test (`expect(screen.getByRole('status')).toBe(region)` after the update). `min-h-[100dvh]`, never `h-screen`; Lucide icons only, `aria-hidden="true"` when decorative; every icon-only button has an `aria-label`.
- Hover-revealed row actions use `ROW_ACTIONS` (`ui/List.tsx`): opacity only, so they stay in the tab order, and always visible on touch (`[@media(hover:none)]:opacity-100`). At most one always-visible control per row; destructive items go last in the row's `⋯` (`OverflowMenu`) with `danger: true`.
- `INLINE_TARGET` links never sit inside a `truncate` or `overflow-hidden` wrapper (the AI skills "Shows on" link, Task 13).
- Container grids (Task 1: `ATTRIBUTE_GRID`, `OBJECT_GRID`) are proven by a summed-minimum test and must reach their breakpoint at 1440 inside the `wide` frame (61rem of content: no Settings page has an Ask rail, so there is no rail state to subtract). Below the breakpoint the row's meta line carries every fact the columns show (`narrowOnly`), so a phone row never loses status.
- An empty state beside a `SearchInput` whose action clears the search is named `Clear search for “q”` (the input's own clear button is "Clear search").
- Meta lines are separate spans with a trailing " ·" (`MetaParts`, Task 1).
- Colour (spec §7): amber/red only for a failed sync or delivery, an errored connector or mailbox ("Needs attention"), a rejected or failed model call, over budget, a seat limit reached, a budget at or past 90% (red) or 70% (amber), a failed import row, a revoked domain, destructive actions. Counts, kinds, roles, functions, departments, categories, attribute types and properties, "Not set up", "Not connected yet", "Disabled", "Deactivated", "Retired", "Trial", "Not verified yet", "Not configured" and empty states are neutral. Success tone only on a real success state: a verified domain, a delivered webhook, a created import row, a connected source (as a `dot` badge). At most 2 badges per row and no icon inside a badge.
- Copy: sentence case ("Add team member", "Custom objects", "New object", "Global configuration", "Default lifecycle stage"); **no em dash (U+2014) in any non-test `.tsx` file in scope, comments included** (Task 14 adds the test; about 80 exist today, every task removes its own: replace with a colon, a comma or a full stop, and the no-value mark with `NO_VALUE` from `ui/format.ts`). `features/*` keep theirs.
- Order: Tasks run in number order inside each batch (below). Every task needs Task 1. Tasks 3 to 13 need Task 2. Task 14 is last.
- Never run prettier. Never `git stash`. `git add` explicit paths only. Never push.
- Commits: conventional (`feat(settings): ...`, `feat(ui): ...`, `refactor(ui): ...`, `test(ui): ...`, `docs(ui): ...`), each message ending with the trailer line exactly: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- Checks: `npm test` (Vitest), `npm run lint`, `npm run build`. One file: `npx vitest run <path>`. Every task ends with its own test files green plus `npm run lint`; Task 14 runs everything.
- Screenshots: API at `http://localhost:8000`; Vite from this worktree on 5175 via `VITE_API_URL= npx vite --config scripts/ui-shots.vite.config.mjs --port 5175`; runner `node scripts/ui-shots.mjs --seed ../../revenact-backend/services/accounts/management/commands/seed_demo.py --cli node_modules/.bin/playwright-cli ...`. Never write the demo password anywhere. `shots/` is gitignored.

## Execution batches (for review)

Each batch is one review gate; inside a batch the tasks are independent except where noted.

| Batch | Tasks | Why together |
|---|---|---|
| A | 1, 2 | The primitives and the bar every page task consumes. Serial: Task 2 uses `PageHeader`'s `titleAs` from Task 1. |
| B | 3, 4 | The two data frames (`WorkSettingsFrame`, `AgentSettingsFrame`) and their forms; both touch an area house test (`components/work`, `components/agents`) that pins the old frame. |
| C | 5, 6, 7, 8, 9 | The small single-file pages (General, Defaults, Plan & billing, Products, Imports, Webhooks, Agent access, Briefs, AI attributes). No shared files; any order. |
| D | 10, 11, 12, 13 | The four large pages (Attributes, People & teams, Connections, the three AI pages), each its own folder or file set. Any order. |
| E | 14 | The Settings house rules, the ratchet, docs and the full verification. |

## Conversion rules (apply in every file a task touches)

These are the mechanical rules (the Impact table, adjusted for Settings' habits); each task lists the non-mechanical moves.

| Today | Becomes |
|---|---|
| `<h1 className="text-[20px] font-bold text-ink tracking-tight">…</h1>` + `<p className="text-[13px] text-ink-faint font-medium mt-0.5">…</p>` | `SettingsFrame` `title={settingsTitle('/settings/…')}` `intro="…"` |
| The page wrapper `flex flex-col h-full w-full overflow-y-auto p-6 gap-6 max-w-2xl` (and `max-w-3xl`, `max-w-4xl`, `max-w-4xl mx-auto py-8 px-4`, `px-8 … max-w-7xl mx-auto`, `routes.tsx`'s `p-6 max-w-4xl`) | removed: `SettingsFrame` owns padding, gap and width |
| A "Company Brain" eyebrow with an accent icon above an `h1` | removed (the bar and the nav say where you are) |
| `bg-surface rounded-xl border border-line-subtle shadow-sm p-5/p-6 flex flex-col gap-4` (a form or list box), `rv-card`, `rounded-xl border p-3.5` inner boxes | `SettingsSection` (heading outside, one card inside) or, inside a section, a row of its `divide-y` |
| A warning box `flex items-center gap-2.5 px-4 py-3 rounded-lg bg-warning-dim border border-warning/30 … text-warning` saying "You don't have permission…" | `SettingsFrame` `note={<SettingsNote icon="lock">…</SettingsNote>}` |
| An info box `bg-accent-dim/40 border border-accent/30` / `bg-info-dim … border-info/20` / `bg-subtle border border-line-subtle rounded-lg px-4 py-3` | `SettingsNote icon="info"` in the row or section that needs it |
| A field label `text-[12px] font-bold text-ink-muted uppercase tracking-wide` (`LABEL`), `text-[11px] font-semibold text-ink-muted` | `SettingsRow` `label`, or `TYPE.label` above the control |
| A text input `px-3 py-2 bg-surface border border-line rounded-lg text-[13px] … focus:outline-none focus:border-accent` (`INPUT`, `FIELD`, `inputClass`), `CONTROL` from `activity/formStyles` | ui `INPUT` + `INVALID` (+ `NUM` on a number field); a textarea `${INPUT} ${INVALID} min-h-20 py-2` |
| A bare `<select>` | ui `Select` (`labelPosition="external"` with an `id` inside a `SettingsRow` `htmlFor`, `hidden` in a table cell or a row, `above` in a dialog) |
| A checkbox or radio label `flex items-center gap-2 text-[13px] font-medium text-ink-muted cursor-pointer` / `CHOICE`, `BOX` | ui `CHOICE` and `CHECKBOX` (Task 1) |
| `<input type="checkbox" role="switch">` and a hand-made knob switch (`w-8 h-[18px] rounded-full … bg-success`) | ui `Switch` (`label` = its accessible name; the visible children say On or Off) |
| `px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent rounded-lg text-[13px] font-bold … disabled:opacity-50` (Save, Create, Add) | `PRIMARY` (or `SettingsSave` / `SettingsSaveBar` for a settings form's Save) |
| An accent "+ Add …" / "New …" opener button | `BUTTON` with the `Plus` icon |
| `text-[13px] font-semibold text-ink-muted hover:text-ink` Cancel / `text-accent hover:underline` text buttons | `QUIET` |
| `p-1.5 hover:bg-subtle rounded-md text-ink-faint hover:text-danger` icon buttons | `ICON_BUTTON` + `aria-label`, in `ROW_ACTIONS`; Delete moves into the row's `OverflowMenu` with `danger: true` when the row has other actions |
| `text-danger` / `text-warning` / `text-success` on **text** | `text-danger-ink` / `text-warning-ink` / `text-success-ink` (icons and bars keep the plain tokens), or neutral where spec §7 says neutral |
| `{error && <p className="text-[12.5px] text-danger">…</p>}` under a form | `FORM_ALERT` (`role="alert"`) under the section, or `SettingsRow` `error` under the field it belongs to |
| `{saved && <span className="text-[12px] text-success font-medium">Saved.</span>}`, `{note && <p role="status">…`, `{sent && <span role="status">…` | one always-rendered region: `SettingsSave`/`SettingsSaveBar` `status`, or `<p role="status" className={`${TYPE.bodyMuted} empty:sr-only`}>{text}</p>` |
| "Loading…" text, `animate-pulse` blocks, hand-made error lines with Retry | `LoadingState` (`variant="block"` or `rows`) / `ErrorState` with `onRetry`, in the section's `state` or a `<Card pad="none">` |
| A `<table>` of records (Webhooks, AI attributes, Custom objects) | `SettingsSection list=…` of `ListRow`s (or `li` with `px-4 py-3` when the row holds an inline form) |
| A `<table>` that is a real matrix or log (Members, Credit history, Imports mapping and results, AI usage calls, Actions & approvals) | flush in its section's card: `<div className="overflow-x-auto"><table className={TABLE}>`, `TH`, `TD`, `TD_NUM`, `<tbody className="divide-y divide-line-subtle">`, sentence-case headers, no uppercase, no tinted header row |
| Pill toggles `bg-subtle/50 p-0.5 rounded-lg border` with `bg-surface text-accent shadow-sm` (People, Attributes), `role="tablist"` buttons (AI feedback) | ui `Tabs` with `onChange` and `idBase`, directly under the `h1`, and a `role="tabpanel"` with `tabPanelId`/`tabId` |
| A second tab row under a tab row (Attributes › Pipeline's Opportunities / Risks) | `SegmentedControl` leading that tab's `Toolbar` |
| Category pills (Connections) | `FilterChip` in a `FilterChipRow` |
| A search `<input>` with a hand-placed icon | `SearchInput` (placeholder at most 24 characters, the full description in `label`) |
| Status pills (`bg-success-dim text-success` Active, Connected, Verified; `bg-warning-dim` trialing) and property pills | `Badge` with the tone the colour rules allow; sentence case; no icon |
| Tinted decorative icon chips and accent icons (`text-accent`, `bg-info-dim/50 text-info`) | `IconChip` (neutral) or nothing |
| `font-mono-brand` / `font-mono` on an ID, key, URL, slug or record | `CODE`; on a figure `NUM`; on a word removed |
| `font-bold`, `font-medium` | `font-semibold` on headings, labels, buttons; removed on body text |
| `text-[9px]`..`[10.5px]`, `[11.5px]`, `text-xs` | `text-[11px]` (`TYPE.meta`) |
| `text-[12px]`, `[12.5px]`, `[13.5px]`, `[14px]`, `text-sm` | `13` (controls, body, inputs) or `11` (captions, helper text, badges); a heading that used 14 becomes `TYPE.title` |
| `text-lg`, `text-[15px] font-bold` section headings | `SettingsSection` `title` (`TYPE.title`) |
| `disabled:opacity-*`, `opacity-60` while loading | removed; disabled states come from `BUTTON`/`QUIET`/`PRIMARY`/`DANGER`/`ICON_BUTTON`/`INPUT`/`SELECT`; a list reading again takes `busy` |
| `shadow-sm`, `shadow-inner`, `shadow-md` on a box or popover | removed; a popover takes `OVERLAY` |
| `transition-colors`, `transition-all`, `transition-transform` on rows, chips and buttons | removed (a disclosure chevron's `rotate-180` stays, without a transition) |
| `bg-black/40` scrims and the hand-made modal (`ModalShell`) | `BuilderDialog size="narrow"` (`components/segments/BuilderDialog.tsx`: focus trap, Escape, `bg-scrim`, focus return) |
| Title Case UI copy ("Add Team Member", "New Role", "Custom Objects", "Exchange Rates", "Global Configuration", "Set Global Attributes", "Add Webhook", "New Object", "Import 12 Organizations") | sentence case ("Add team member", "New role", "Custom objects", "Exchange rates", "Global configuration", "Save changes", "Add webhook", "New object", "Import 12 organizations") |
| `'—'` / `—` anywhere in a touched `.tsx` | `NO_VALUE` for a no-value mark; otherwise reword |
| Imports | from the ui index: `import { … } from '../../components/ui';` (from `pages/<area>/`), `'../ui'` (from `components/<area>/`), `'../components/ui'` (from `layouts/`) |

## Overlaps with the Records (#130), Ops (#131) and Impact (#132) code and the foundations (#129)

| File | State on `main` 17f5013 | This plan |
|---|---|---|
| `src/components/ui/{SettingsFrame,PageHeader,styles,index}.ts(x)` + tests, `src/pages/dev/UiGallery.tsx` | `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsSaveBar` as foundations left them (used only by the gallery) | Task 1 extends them (additive props; `SettingsSaveBar`'s Save becomes `aria-disabled` while saving and its status region stays mounted), adds `SettingsSave`, `SettingsNote`, `MetaParts`, `FIELD_ERROR`, `FORM_ALERT`, `CHOICE`, `CHECKBOX`, and `PageHeader` `titleAs`; Records, Ops and Impact output unchanged |
| `src/components/layout/Navbar.tsx`, `Navbar.test.tsx` | the "Settings" `h1` branch in the solid white header | Task 2 puts Settings in `titledByPage` and `isFramed` and deletes the branch; the `isAccountSettings` header is not touched |
| `src/layouts/WorkspaceSettingsLayout.tsx` + test | the nav column, the phone `<select>` | Task 2: `PageHeader title="Settings" titleAs="p"`, `ScrollSentinel`, `TYPE.eyebrow` group labels, ui `Select` |
| `src/components/work/houseRules.test.ts` | pins `WorkSettingsFrame`'s `<ErrorBlock` and `animate-pulse`, `className={PRIMARY}` in the three Work forms, `MONO|NUM` in the summaries | Task 3 updates it to `<ErrorState`/`<LoadingState`, `<SettingsSave`/`<SettingsSaveBar`, `NUM` |
| `src/components/agents/houseRules.test.ts` | pins `AgentSettingsFrame`'s `<ErrorBlock` and `animate-pulse`, `className={PRIMARY}` in `AgentsForm`/`ActionsGridForm`, the `AgentCard` width style | Task 4 updates it the same way; the `AgentCard` style line stays byte-identical |
| `src/components/ops.houseRules.test.ts` | excludes `pages/brain/{Agents,Skills,Feedback}.tsx` and the Work and Agents settings pieces ("their own PRs") | read only; Task 14's `settings.houseRules.test.ts` covers them |
| `src/components/segments/BuilderDialog.tsx` | the Impact builders' modal | read only (Task 11's member dialogs use it, `size="narrow"`) |
| `src/components/organizations/ConfirmDialog.tsx` | the shared yes/no dialog | read only; every Settings delete keeps calling it |
| `src/components/organizations/portfolio/{PortfolioSections,styles,usePagedRead}.ts(x)` | `ErrorBlock`, `PRIMARY`/`FOCUS`/`MONO`, `errorMessage` | Settings stops importing `ErrorBlock`, `PRIMARY`, `FOCUS`, `MONO` from here (ui instead); `errorMessage` stays imported |
| `src/components/organizations/activity/formStyles.ts` | `CONTROL` (with `disabled:opacity-50`), `FORM_ERROR` | Settings stops importing them (ui `INPUT`, `FORM_ALERT`); the file is not edited |
| `src/features/agents/agentsText.ts` | the Agents copy | Task 4 adds one key, `GRID_TITLE` |
| `src/test/listGrid.ts` | `IMPACT_COLUMN_AT_1440_REM` | Task 1 adds `SETTINGS_WIDE_AT_1440_REM` and `SETTINGS_DEFAULT_AT_1440_REM` |
| `src/test/inlineTargets.test.ts` | 16 files | Task 14 adds `pages/brain/Skills.tsx` (17) |
| `src/test/uiRatchet.test.ts` | baselines `905 / 163 / 151 / 85 / 38 / 511` | Task 14 lowers them |

No other Records, Ops or Impact file is touched.

## File structure

| Path | Responsibility |
|---|---|
| `src/components/ui/SettingsFrame.tsx` (+ test) | `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsSave`, `SettingsSaveBar`, `SettingsNote` |
| `src/components/ui/MetaParts.tsx` (new, + test) | A meta line's parts as separate spans with a trailing " ·" |
| `src/components/ui/{PageHeader,styles,index}.ts(x)` | `titleAs`; `FIELD_ERROR`, `FORM_ALERT`, `CHOICE`, `CHECKBOX`; re-exports |
| `src/pages/settings/workspaceSettingsNav.ts` (+ test) | `settingsTitle(path)`: a page's `h1` is its nav label |
| `src/pages/settings/{attributeGrid,objectGrid}.ts` (new) | The Attributes and Custom objects list grids |
| `src/pages/settings/settingsGrids.test.ts` (new) | Each grid fits its breakpoint and is reached at 1440 in the wide frame |
| `src/e2e/settingsBar.test.tsx` (new) | Every settings route titles the framed bar "Settings", as text |
| `src/pages/settings/PlanBillingPage.tsx` (new, + test) | `/settings/billing` on the primitives (the account copy stays) |
| `src/pages/settings/GlobalConfigSection.tsx` (renamed from `GlobalConfigSidebar.tsx`, + test) | The headline-field mapping and the workspace name, as a section |
| `src/components/integrations/providerLogos.tsx` (new) | The brand marks, the only hex in Settings |
| `src/components/settings.houseRules.test.ts` (new, Task 14) | The Settings files under every foundations rule; account files excluded by name |
| Modified, bar | `components/layout/Navbar.tsx`, `layouts/WorkspaceSettingsLayout.tsx` |
| Modified, pages | every file listed under Scope above |
| Tests | each task's own; page tests and `src/e2e/{workSettings,agents,aiAttributes}.test.tsx` updated where they pin legacy markup |
| Docs | `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` (Task 14) |

Route list for screenshots (Task 1 and Task 14): `/settings/general /settings/people /settings/connections /settings/billing /settings/data /settings/defaults /settings/products /settings/entity-uploads /settings/recommendations /settings/work-tasks /settings/work-notifications /settings/brief-delivery /settings/agents /settings/agent-actions /settings/ai-attributes /settings/ai-skills /settings/ai-usage /settings/ai-feedback /settings/webhooks /settings/agent-access /account-settings/account /account-settings/billing` (22 routes; the last two are the out-of-scope control: their before and after shots must match). Settings has no Ask rail, so every 1440 shot is the page as it is. In-page states that are not routes are captured by hand as extras: sign in through the same `playwright-cli -s=ui-shots` session flow the runner uses (never print or write the password), click to the state, and save `shots/<label>-extra-<name>-<desktop|phone>-<light|dark>.png`; take the same extras before and after: People › Roles and People › Access, the Add team member dialog, Attributes › Pipeline and Attributes › Custom objects, Products with the add form open, Webhooks with one webhook expanded (add one first if the seed has none), Connections with Zendesk's connect form open, Imports after choosing a small CSV (`name,domain\nAcme,acme.io\n`; save it under `shots/`, never commit it), Defaults with the add-rate form open.

---

### Task 1: Before screenshots, the primitive gaps Settings needs, `settingsTitle`, and the Settings list grids

**Files:**
- Create: `src/components/ui/MetaParts.tsx`, `src/components/ui/MetaParts.test.tsx`, `src/pages/settings/attributeGrid.ts`, `src/pages/settings/objectGrid.ts`, `src/pages/settings/settingsGrids.test.ts`
- Modify: `src/components/ui/SettingsFrame.tsx`, `src/components/ui/PageHeader.tsx`, `src/components/ui/styles.ts`, `src/components/ui/index.ts`, `src/pages/settings/workspaceSettingsNav.ts`, `src/test/listGrid.ts`, `src/pages/dev/UiGallery.tsx`
- Test: `src/components/ui/{SettingsFrame,PageHeader,styles}.test.ts(x)`, `src/pages/settings/workspaceSettingsNav.test.ts`

**Interfaces:**
- Consumes: the primitives as Impact left them.
- Produces (later tasks rely on these exact names):
  - `PageHeader` gains `titleAs?: 'h1' | 'p'` (default `'h1'`): with `'p'` the bar's title is text, not a heading (Settings, whose pages each own an `h1`).
  - `SettingsFrame({ title, intro?, note?, width?: 'default' | 'wide', action?, headingRef?, children })`: `note` sits under the intro (a `SettingsNote`); `headingRef` makes the `h1` focusable (`tabIndex={-1}` and the focus ring).
  - `SettingsSection({ title, description?, action?, footer?, list?, header?, state?, headingRef?, children? })`: `action` sits on the heading row (one `BUTTON`, or a `Badge`); `list` makes the body a `<ul role="list" aria-label={list}>` for `ListRow`s or `li`s; `header` renders inside the card above the body (a `ListHeaderRow`); `state` (a `LoadingState`, `ErrorState` or `EmptyState`) replaces the body inside the same card; the section root is an `@container`.
  - `SettingsRow({ label, hint?, hintId?, htmlFor?, error?, errorId?, stacked?, group?, children })`: `error` renders under the control as `FIELD_ERROR` with `role="alert"` and `id={errorId}`; `stacked` puts the label above the control at every width; `group` makes the row `role="group"` named by its label (a set of checkboxes or a switch with words).
  - `SettingsSave({ dirty, saving, status?, onSave?, label?, busyLabel? })`: a form's status region (always mounted) and its one `PRIMARY` (`type="submit"` without `onSave`; `aria-disabled` while clean or saving; `Loader2` while saving). For a section's `footer`.
  - `SettingsSaveBar` takes the same props: sticky at the bottom while dirty, saving or showing a status; otherwise an empty `sr-only` status region (the same node).
  - `SettingsNote({ icon?: 'info' | 'lock' | 'warning', children })`: one line, a 16px icon, no box.
  - `MetaParts({ parts })` from `ui/MetaParts.tsx`: falsy parts dropped, each kept part a `<span>`, every span but the last ending " ·", one space between.
  - `FIELD_ERROR = 'mt-1 text-[11px] leading-4 text-danger-ink'`, `FORM_ALERT = 'text-[13px] leading-5 text-danger-ink'`, `CHOICE = 'flex min-h-11 sm:min-h-9 items-center gap-2 text-[13px] leading-5 text-ink'`, `CHECKBOX` (`h-4 w-4 shrink-0 accent-accent` + `FOCUS`) from `ui/styles.ts`.
  - `settingsTitle(path: string): string` from `pages/settings/workspaceSettingsNav.ts`: the nav label of that path; throws for an unknown path.
  - `ATTRIBUTE_GRID` (`pages/settings/attributeGrid.ts`) and `OBJECT_GRID` (`pages/settings/objectGrid.ts`), each a `ListGrid`.
  - `src/test/listGrid.ts`: `SETTINGS_WIDE_AT_1440_REM` (`61`), `SETTINGS_DEFAULT_AT_1440_REM` (`45`).

Why: spec §6.3 (every page one frame; heading equals the nav label; every control in a section; save in the section's footer or a sticky bar; info callouts one line; states inside the first section's card), §6.1 (one bar title), §4.2 (lists as one card on a tested grid), §4.4 (live regions stay mounted), §7. The Records, Ops and Impact reviews: a container grid needs a summed-minimum test, and a live region needs a same-node test.

- [ ] **Step 1: Take the before set**

Start Vite (background; reused in Task 14):

```bash
VITE_API_URL= npx vite --config scripts/ui-shots.vite.config.mjs --port 5175
```

Then:

```bash
node scripts/ui-shots.mjs --label before \
  --seed ../../revenact-backend/services/accounts/management/commands/seed_demo.py \
  --cli node_modules/.bin/playwright-cli \
  /settings/general /settings/people /settings/connections /settings/billing \
  /settings/data /settings/defaults /settings/products /settings/entity-uploads \
  /settings/recommendations /settings/work-tasks /settings/work-notifications /settings/brief-delivery \
  /settings/agents /settings/agent-actions \
  /settings/ai-attributes /settings/ai-skills /settings/ai-usage /settings/ai-feedback \
  /settings/webhooks /settings/agent-access \
  /account-settings/account /account-settings/billing
```

Expected: 92 paths under `shots/` (the `/__ui` gallery first, 4 per route). Layout problems the runner reports now are pre-existing (the audit expects Attributes at 390 to scroll its table sideways inside the page, and Connections at 390 to be one very long column): copy the list into your notes for Task 14. Take the extras named under "Route list" above, same names before and after. Open three PNGs with the Read tool to confirm they show the signed-in app. Stop Vite.

- [ ] **Step 2: Write the failing tests**

Replace the last case of `src/components/ui/SettingsFrame.test.tsx` ("shows the save bar only while dirty, busy while saving") and append, so the file ends:

```tsx
  it('shows the save bar while dirty, saving or saying something, and keeps its status region one node', async () => {
    const onSave = vi.fn();
    const { rerender } = render(<SettingsSaveBar dirty={false} saving={false} onSave={onSave} />);
    const region = screen.getByRole('status');
    expect(region).toHaveClass('sr-only');
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    rerender(<SettingsSaveBar dirty saving={false} onSave={onSave} />);
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save.parentElement).toHaveClass('sticky', 'bottom-0', 'bg-base', 'border-t');
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    rerender(<SettingsSaveBar dirty saving onSave={onSave} />);
    const busy = screen.getByRole('button', { name: 'Saving…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(busy);
    expect(onSave).toHaveBeenCalledTimes(1);
    rerender(<SettingsSaveBar dirty={false} saving={false} status="Saved." onSave={onSave} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Saved.');
    expect(region).not.toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('SettingsFrame, Settings PR additions', () => {
  it('takes a note under the intro and a focusable heading', () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <SettingsFrame title="Defaults" intro="What the workspace assumes." note={<SettingsNote icon="lock">You can't change this.</SettingsNote>} headingRef={ref}>
        Body
      </SettingsFrame>,
    );
    const title = screen.getByRole('heading', { level: 1, name: 'Defaults' });
    expect(ref.current).toBe(title);
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(title).toHaveClass('focus-visible:outline-accent');
    const note = screen.getByText("You can't change this.").closest('[data-part="settings-note"]')!;
    expect(note).toHaveClass('text-[13px]', 'text-ink-muted');
    expect(note).not.toHaveClass('rounded-lg');
    expect(note.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('puts an action on the section heading row, a list body, a header inside the card, and a state in place of the body', () => {
    const { rerender } = render(
      <SettingsSection title="Catalogue" action={<button type="button">Add product</button>} list="Products" header={<div data-testid="labels" />}>
        <li>Product A</li>
      </SettingsSection>,
    );
    const section = screen.getByRole('region', { name: 'Catalogue' });
    expect(section).toHaveClass('@container');
    expect(screen.getByRole('button', { name: 'Add product' }).closest('.rounded-xl')).toBeNull();
    const list = screen.getByRole('list', { name: 'Products' });
    expect(list).toHaveClass('divide-y', 'divide-line-subtle');
    expect(screen.getByTestId('labels').nextElementSibling).toBe(list);
    expect(list.closest('.rounded-xl')).toHaveClass('overflow-hidden');
    rerender(
      <SettingsSection title="Catalogue" list="Products" state={<p>Loading products</p>}>
        <li>Product A</li>
      </SettingsSection>,
    );
    expect(screen.queryByRole('list', { name: 'Products' })).toBeNull();
    expect(screen.getByText('Loading products').closest('.rounded-xl')).not.toBeNull();
  });

  it('shows a field error under the control, a stacked label above it, and names a group by its label', () => {
    render(
      <SettingsSection title="Webhook">
        <SettingsRow label="URL" htmlFor="url" hint="Where it posts." hintId="url-hint" error="Enter a full URL." errorId="url-error" stacked>
          <input id="url" aria-invalid="true" aria-describedby="url-hint url-error" />
        </SettingsRow>
        <SettingsRow label="Applies to" group>
          <label>
            <input type="checkbox" /> Organizations
          </label>
        </SettingsRow>
      </SettingsSection>,
    );
    const input = screen.getByRole('textbox', { name: 'URL' });
    expect(input).toHaveAccessibleDescription('Where it posts. Enter a full URL.');
    const error = screen.getByRole('alert');
    expect(error).toHaveAttribute('id', 'url-error');
    expect(error).toHaveClass('text-[11px]', 'text-danger-ink');
    expect(input.closest('.flex-col.px-4')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Applies to' })).toContainElement(screen.getByRole('checkbox', { name: 'Organizations' }));
  });

  it('draws a one-section form save: the status region first and always there, then the one primary', async () => {
    const { rerender } = render(
      <form onSubmit={(event) => event.preventDefault()}>
        <SettingsSave dirty={false} saving={false} />
      </form>,
    );
    const region = screen.getByRole('status');
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toHaveAttribute('type', 'submit');
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveClass('bg-accent');
    rerender(
      <form onSubmit={(event) => event.preventDefault()}>
        <SettingsSave dirty={false} saving={false} status="Saved." label="Save" />
      </form>,
    );
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Saved.');
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-busy');
  });

  it('draws a warning note in ink with the warning icon, never a tinted box', () => {
    render(<SettingsNote icon="warning">Saving clears 2 exchange rates.</SettingsNote>);
    const note = screen.getByText('Saving clears 2 exchange rates.').closest('[data-part="settings-note"]')!;
    expect(note).toHaveClass('text-ink');
    expect(note.querySelector('svg')).toHaveClass('text-warning');
    expect(note.className).not.toMatch(/bg-|border/);
  });
});
```

and add `createRef` (from `react`) and `SettingsNote`, `SettingsSave` to the file's imports.

Create `src/components/ui/MetaParts.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { MetaParts } from './MetaParts';

describe('MetaParts (a meta line, spec §7 separators)', () => {
  it('drops empty parts and ends every span but the last with " ·"', () => {
    const { container } = render(
      <p>
        <MetaParts parts={['Ends 4f2a', false, null, '', 'made 3 Oct 2026', 'never used']} />
      </p>,
    );
    const spans = [...container.querySelectorAll('p > span')];
    expect(spans.map((span) => span.textContent)).toEqual(['Ends 4f2a ·', 'made 3 Oct 2026 ·', 'never used']);
    expect(container.querySelector('p')!.textContent).toBe('Ends 4f2a · made 3 Oct 2026 · never used');
  });

  it('renders nothing for no parts', () => {
    const { container } = render(
      <p>
        <MetaParts parts={[false, undefined]} />
      </p>,
    );
    expect(container.querySelector('p')).toBeEmptyDOMElement();
  });
});
```

Append to `src/components/ui/PageHeader.test.tsx`:

```tsx
describe('PageHeader title as text (Settings PR)', () => {
  it('draws the title as text, not a heading, when the page owns its h1', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Settings" titleAs="p" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    const title = screen.getByText('Settings');
    expect(title.tagName).toBe('P');
    expect(title).toHaveClass('truncate', 'text-[15px]', 'font-semibold');
  });
});
```

Append to `src/components/ui/styles.test.ts` (and add `CHECKBOX, CHOICE, FIELD_ERROR, FORM_ALERT` to its import from `./styles`):

```ts
describe('ui/styles form pieces (Settings PR)', () => {
  it('sets field and form errors in the readable danger ink, on the scale', () => {
    expect(FIELD_ERROR).toBe('mt-1 text-[11px] leading-4 text-danger-ink');
    expect(FORM_ALERT).toBe('text-[13px] leading-5 text-danger-ink');
  });

  it('gives a checkbox or radio label a 44px target below sm, and the box the accent and the focus ring', () => {
    expect(CHOICE).toMatch(/\bmin-h-11\b/);
    expect(CHOICE).toMatch(/\bsm:min-h-9\b/);
    expect(CHECKBOX).toContain('accent-accent');
    expect(CHECKBOX).toContain(FOCUS);
    expect(`${CHOICE} ${CHECKBOX}`).not.toMatch(/opacity|font-medium|text-ink-muted/);
  });
});
```

Append to `src/pages/settings/workspaceSettingsNav.test.ts` (add `settingsTitle` to its import):

```ts
describe('settingsTitle (UI foundations spec §6.3: the h1 equals the nav label)', () => {
  it('reads every page title from the nav', () => {
    expect(settingsTitle('/settings/brief-delivery')).toBe('Briefs');
    expect(settingsTitle('/settings/ai-skills')).toBe('AI skills');
    expect(settingsTitle('/settings/people')).toBe('People & teams');
    for (const item of WORKSPACE_SETTINGS_NAV.flatMap((group) => group.items)) expect(settingsTitle(item.path)).toBe(item.label);
  });

  it('refuses a path the nav does not hold', () => {
    expect(() => settingsTitle('/settings/nowhere')).toThrow('No settings page at /settings/nowhere');
  });
});
```

Create `src/pages/settings/settingsGrids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ListGrid } from '../../components/ui';
import { SETTINGS_WIDE_AT_1440_REM, minimumRem, trackRems } from '../../test/listGrid';
import { ATTRIBUTE_GRID } from './attributeGrid';
import { OBJECT_GRID } from './objectGrid';

const GRIDS: [string, ListGrid][] = [
  ['Attributes', ATTRIBUTE_GRID],
  ['Custom objects', OBJECT_GRID],
];

describe.each(GRIDS)('the %s list grid (UI foundations spec §4.2)', (_name, grid) => {
  it('restates its template in tracksRem', () => {
    expect(trackRems(grid)).toEqual([...grid.tracksRem]);
  });

  it('fits its container breakpoint: tracks, the gaps between them and the row padding', () => {
    expect(minimumRem(grid)).toBeLessThanOrEqual(grid.breakpointRem);
  });

  it('reaches that breakpoint at 1440 in the wide settings frame (61rem of content, no Ask rail)', () => {
    expect(SETTINGS_WIDE_AT_1440_REM).toBe(61);
    expect(grid.breakpointRem).toBeLessThanOrEqual(SETTINGS_WIDE_AT_1440_REM);
  });

  it('writes the breakpoint into every class, literally, so Tailwind sees it', () => {
    const at = `@min-[${grid.breakpointRem}rem]:`;
    expect(grid.columns.split(' ').every((cls) => cls.startsWith(at))).toBe(true);
    expect(grid.gridAt).toEqual({ row: `${at}grid`, cell: `${at}block` });
    expect(grid.headerShow).toBe(`${at}grid`);
    expect(grid.narrowOnly).toBe(`${at}hidden`);
    expect(grid.gapRem).toBe(0.75);
  });

  it('has a label and an alignment per track', () => {
    expect(grid.labels).toHaveLength(grid.tracksRem.length);
    expect(grid.aligns).toHaveLength(grid.tracksRem.length);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/components/ui/SettingsFrame.test.tsx src/components/ui/MetaParts.test.tsx src/components/ui/PageHeader.test.tsx src/components/ui/styles.test.ts src/pages/settings/workspaceSettingsNav.test.ts src/pages/settings/settingsGrids.test.ts`
Expected: FAIL (`SettingsNote`, `SettingsSave`, `MetaParts`, the four constants, `settingsTitle`, the grids and the `listGrid` constants do not exist; `titleAs` is ignored; the save bar unmounts its button and has no status region).

- [ ] **Step 4: Implement**

`src/components/ui/SettingsFrame.tsx`, whole file:

```tsx
import { useEffect, useId, type ReactNode, type Ref } from 'react';
import { Info, Loader2, Lock, TriangleAlert } from 'lucide-react';
import { Card, CardFooter } from './Card';
import { FIELD_ERROR, FOCUS, PRIMARY } from './styles';
import { TYPE } from './type';

/** Every /settings page's frame (UI foundations spec §6.3): the h1 (its
 *  text equals the nav label: pass `settingsTitle(path)`), a muted intro, an
 *  optional one-line note (a SettingsNote: "you can't change this"), an
 *  optional action on the heading row, then sections. Always full width up
 *  to its cap, so it never re-centres. `wide` for Connections, Attributes,
 *  AI usage, AI skills and People & teams. `headingRef` makes the h1 a
 *  focus target (after a Try again). Account settings keep their own
 *  layout this round. */
export function SettingsFrame({
  title,
  intro,
  note,
  width = 'default',
  action,
  headingRef,
  children,
}: {
  title: string;
  intro?: ReactNode;
  note?: ReactNode;
  width?: 'default' | 'wide';
  action?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <div className={`flex w-full flex-col gap-6 px-4 py-6 sm:px-6 ${width === 'wide' ? 'max-w-5xl' : 'max-w-3xl'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={headingRef ? `${TYPE.display} rounded-sm ${FOCUS}` : TYPE.display}>
            {title}
          </h1>
          {intro ? <p className={`${TYPE.bodyMuted} max-w-[68ch]`}>{intro}</p> : null}
          {note ? <div className="mt-1">{note}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** A titled section: the heading (and one `action`) outside, one card
 *  inside. The body is divided rows, or with `list` a labelled list of
 *  rows; `header` sits inside the card above it (column labels); `state`
 *  (loading, empty, error) takes the body's place in the same card. A
 *  one-section form puts SettingsSave in `footer`. The section is the
 *  container its list grid queries. */
export function SettingsSection({
  title,
  description,
  action,
  footer,
  list,
  header,
  state,
  headingRef,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  list?: string;
  header?: ReactNode;
  state?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
}) {
  const headingId = useId();
  const body =
    state ??
    (list ? (
      <ul role="list" aria-label={list} className="divide-y divide-line-subtle">
        {children}
      </ul>
    ) : (
      <div className="divide-y divide-line-subtle">{children}</div>
    ));
  return (
    <section aria-labelledby={headingId} className="@container flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} ref={headingRef} tabIndex={headingRef ? -1 : undefined} className={headingRef ? `${TYPE.title} rounded-sm ${FOCUS}` : TYPE.title}>
            {title}
          </h2>
          {description ? <div className={`${TYPE.bodyMuted} max-w-[68ch]`}>{description}</div> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <Card as="div" pad="none" className={list ? 'overflow-hidden' : ''}>
        {header}
        {body}
        {footer ? <CardFooter>{footer}</CardFooter> : null}
      </Card>
    </section>
  );
}

/** One setting: label and hint on the left from sm, the control on the
 *  right (`stacked`: the label above at every width). Pass `htmlFor` when
 *  the control is a single input or select, `group` when it is a set of
 *  checkboxes or a switch with words (the row is a group named by the
 *  label). An `error` sits under the control with `errorId`: the control
 *  names it in `aria-describedby` and carries `aria-invalid`. */
export function SettingsRow({
  label,
  hint,
  hintId,
  htmlFor,
  error,
  errorId,
  stacked = false,
  group = false,
  children,
}: {
  label: string;
  hint?: ReactNode;
  hintId?: string;
  htmlFor?: string;
  error?: ReactNode;
  errorId?: string;
  stacked?: boolean;
  group?: boolean;
  children: ReactNode;
}) {
  const labelId = useId();
  useEffect(() => {
    if (import.meta.env.DEV && error && !errorId) console.error('SettingsRow: an error needs the errorId its control points at');
  }, [error, errorId]);
  return (
    <div
      role={group ? 'group' : undefined}
      aria-labelledby={group ? labelId : undefined}
      className={stacked ? 'flex flex-col gap-2 px-4 py-3' : 'grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center'}
    >
      <div className="flex flex-col gap-0.5">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={TYPE.label}>
            {label}
          </label>
        ) : (
          <p id={group ? labelId : undefined} className={TYPE.label}>
            {label}
          </p>
        )}
        {hint ? (
          <p id={hintId} className={TYPE.meta}>
            {hint}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        {children}
        {error ? (
          <p id={errorId} role="alert" className={FIELD_ERROR}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface SaveProps {
  dirty: boolean;
  saving: boolean;
  /** "Saved.", "No changes to save.": announced politely, never unmounted. */
  status?: string;
  /** Without it the button submits its form. */
  onSave?: () => void;
  label?: string;
  busyLabel?: string;
}

/** The one PRIMARY. aria-disabled, never disabled: after a save it keeps
 *  focus (a disabled button would drop it to the page). */
function SaveButton({ dirty, saving, onSave, label = 'Save changes', busyLabel = 'Saving…' }: SaveProps) {
  return (
    <button
      type={onSave ? 'button' : 'submit'}
      onClick={
        onSave
          ? () => {
              if (dirty && !saving) onSave();
            }
          : undefined
      }
      aria-disabled={!dirty || saving || undefined}
      aria-busy={saving || undefined}
      className={PRIMARY}
    >
      {saving ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
      {saving ? busyLabel : label}
    </button>
  );
}

/** A one-section form's Save, for that section's footer: its status
 *  region (always there) and its one PRIMARY. A submit handler still
 *  returns early while nothing changed. */
export function SettingsSave(props: SaveProps) {
  return (
    <>
      <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
        {props.status ?? ''}
      </p>
      <SaveButton {...props} />
    </>
  );
}

/** Save for a form that spans sections: sticky at the bottom of the page
 *  while there are unsaved changes, a save is running or it has something
 *  to say ("Saved."); never a button floating on the canvas. Its status
 *  region is the same node throughout. */
export function SettingsSaveBar(props: SaveProps) {
  const shown = props.dirty || props.saving || Boolean(props.status);
  return (
    <div data-part="save-bar" className={shown ? 'sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-line bg-base py-3' : ''}>
      <p role="status" className={shown ? `mr-auto ${TYPE.bodyMuted}` : 'sr-only'}>
        {props.status ?? ''}
      </p>
      {shown ? <SaveButton {...props} /> : null}
    </div>
  );
}

const NOTE_ICON = { info: Info, lock: Lock, warning: TriangleAlert } as const;

/** A one-line callout (spec §6.3): an icon and a sentence, no box. `lock`
 *  says why a control is read-only; `warning` names a real consequence and
 *  is set in ink (amber text fails contrast). */
export function SettingsNote({ icon = 'info', children }: { icon?: keyof typeof NOTE_ICON; children: ReactNode }) {
  const Icon = NOTE_ICON[icon];
  return (
    <p data-part="settings-note" className={`flex items-start gap-2 ${icon === 'warning' ? TYPE.body : TYPE.bodyMuted}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon === 'warning' ? 'text-warning' : 'text-ink-faint'}`} aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
```

`src/components/ui/MetaParts.tsx`:

```tsx
import { Fragment, type ReactNode } from 'react';

/** A meta line's parts (spec §7: " · " between items): each kept part its
 *  own span ending " ·" except the last, so a line that wraps or truncates
 *  never strands a separator at the start of a part. */
export function MetaParts({ parts }: { parts: readonly ReactNode[] }) {
  const shown = parts.filter((part) => part !== null && part !== undefined && part !== false && part !== '');
  return (
    <>
      {shown.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? ' ' : null}
          <span>
            {part}
            {index < shown.length - 1 ? ' ·' : ''}
          </span>
        </Fragment>
      ))}
    </>
  );
}
```

`src/components/ui/styles.ts`, append after `INVALID`:

```ts
/** A field's error, under the control it belongs to (with `role="alert"`
 *  and an id the control names in `aria-describedby`). */
export const FIELD_ERROR = 'mt-1 text-[11px] leading-4 text-danger-ink';

/** A form's failure that belongs to no one field, under the form. */
export const FORM_ALERT = 'text-[13px] leading-5 text-danger-ink';

/** A checkbox or radio with its words: the label is the 44px target. */
export const CHOICE = 'flex min-h-11 sm:min-h-9 items-center gap-2 text-[13px] leading-5 text-ink';

/** The box itself, in the accent, with the focus ring. */
export const CHECKBOX = `h-4 w-4 shrink-0 accent-accent ${FOCUS}`;
```

`src/components/ui/index.ts`: add `export * from './MetaParts';` after `export * from './format';`.

`src/components/ui/PageHeader.tsx`: add the prop and use it.

```tsx
export function PageHeader({
  title,
  titleAs = 'h1',
  back,
  tabs,
  actions,
}: {
  title?: string;
  /** `p` when the page owns its h1 (Settings: each page is named by its
   *  own SettingsFrame heading, and the bar only says where you are). */
  titleAs?: 'h1' | 'p';
  back?: { to: string; label: string };
  tabs?: ReactNode;
  actions?: { primary?: ReactNode; secondary?: UiAction[] };
}) {
```

and the title branch becomes:

```tsx
  ) : title ? (
    titleAs === 'p' ? (
      <p className={`min-w-0 truncate ${TYPE.title}`}>{title}</p>
    ) : (
      <h1 className={`min-w-0 truncate ${TYPE.title}`}>{title}</h1>
    )
  ) : null;
```

`src/pages/settings/workspaceSettingsNav.ts`, append:

```ts
/** A settings page's h1 (UI foundations spec §6.3: it equals the nav
 *  label), read from the nav so the two never drift apart. */
export function settingsTitle(path: string): string {
  const item = WORKSPACE_SETTINGS_NAV.flatMap((group) => group.items).find((entry) => entry.path === path);
  if (!item) throw new Error(`No settings page at ${path}`);
  return item.label;
}
```

`src/test/listGrid.ts`, append:

```ts
/** A wide settings page's content at 1440: the frame's max-w-5xl (64rem)
 *  less its sm:px-6 gutters (3rem). The 1440 viewport less the 72px sidebar
 *  and the 224px settings nav leaves 71.4rem, so the cap is what binds.
 *  No settings page has an Ask rail. */
export const SETTINGS_WIDE_AT_1440_REM = 64 - 3;

/** A default settings page's content: max-w-3xl (48rem) less 3rem. */
export const SETTINGS_DEFAULT_AT_1440_REM = 48 - 3;
```

`src/pages/settings/attributeGrid.ts`:

```ts
import type { ListGrid } from '../../components/ui';

/** Attributes (spec §4.2, §9.2 row 4): display name over its API name; the
 *  type; Required (a neutral badge, or nothing); how full it is, once the
 *  section's @container is 40rem. Below it the meta line says all three. */
export const ATTRIBUTE_GRID = {
  tracksRem: [14, 7, 6, 8],
  gapRem: 0.75,
  breakpointRem: 40,
  columns: '@min-[40rem]:grid-cols-[minmax(14rem,1fr)_7rem_6rem_8rem]',
  gridAt: { row: '@min-[40rem]:grid', cell: '@min-[40rem]:block' },
  headerShow: '@min-[40rem]:grid',
  narrowOnly: '@min-[40rem]:hidden',
  labels: ['Attribute', 'Type', 'Required', 'Filled'],
  aligns: ['left', 'left', 'left', 'right'],
} as const satisfies ListGrid;
```

`src/pages/settings/objectGrid.ts`:

```ts
import type { ListGrid } from '../../components/ui';

/** Custom objects: the name (it opens the object); what it applies to; its
 *  fields and records; the row's Delete (one 44px icon button), once the
 *  section's @container is 44rem. Below it the meta line says the rest. */
export const OBJECT_GRID = {
  tracksRem: [12, 11, 5, 6, 2.75],
  gapRem: 0.75,
  breakpointRem: 44,
  columns: '@min-[44rem]:grid-cols-[minmax(12rem,1fr)_11rem_5rem_6rem_2.75rem]',
  gridAt: { row: '@min-[44rem]:grid', cell: '@min-[44rem]:block' },
  headerShow: '@min-[44rem]:grid',
  narrowOnly: '@min-[44rem]:hidden',
  labels: ['Object', 'Applies to', 'Fields', 'Records', ''],
  aligns: ['left', 'left', 'right', 'right', 'right'],
} as const satisfies ListGrid;
```

(Attribute minimum: 14 + 7 + 6 + 8 + 3 × 0.75 + 2 = 39.25rem ≤ 40. Object minimum: 12 + 11 + 5 + 6 + 2.75 + 4 × 0.75 + 2 = 41.75rem ≤ 44. Both ≤ 61.)

`src/pages/dev/UiGallery.tsx`: in the "Settings frame" `Section`, give the frame `note={<SettingsNote icon="lock">Only admins can change these.</SettingsNote>}`, add a second `SettingsSection title="Catalogue" list="Products" action={<button type="button" className={BUTTON}><Plus className="h-4 w-4" aria-hidden="true" />Add product</button>}` holding two `ListRow`s (`title="Product A" meta={<MetaParts parts={['5 customers', 'Visible in pickers']} />}`, `title="Legacy suite" trailing={<Badge>Retired</Badge>}`), a third `SettingsSection title="Currency" footer={<SettingsSave dirty saving={false} status="" label="Save" />}` holding one row with a `Select labelPosition="external"`, and a `SettingsSection title="Exchange rates" state={<LoadingState label="Loading exchange rates" variant="rows" count={2} />}`; the existing save-bar sample passes `status="Saved."`. Import `MetaParts`, `SettingsNote`, `SettingsSave`, `Plus` as needed.

- [ ] **Step 5: Run the tests and the gallery's own test**

Run: `npx vitest run src/components/ui src/pages/settings/workspaceSettingsNav.test.ts src/pages/settings/settingsGrids.test.ts src/pages/dev`
Expected: PASS. The two existing `SettingsFrame` cases ("heads the page…", "puts a section heading outside one divided card…") pass unchanged; `ui/houseRules.test.ts` passes (no off-scale size, no opacity, no uppercase outside `type.ts`).

Run: `npm run lint` (expected: clean).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/SettingsFrame.tsx src/components/ui/SettingsFrame.test.tsx src/components/ui/MetaParts.tsx src/components/ui/MetaParts.test.tsx \
  src/components/ui/PageHeader.tsx src/components/ui/PageHeader.test.tsx src/components/ui/styles.ts src/components/ui/styles.test.ts src/components/ui/index.ts \
  src/pages/settings/workspaceSettingsNav.ts src/pages/settings/workspaceSettingsNav.test.ts src/pages/settings/attributeGrid.ts src/pages/settings/objectGrid.ts \
  src/pages/settings/settingsGrids.test.ts src/test/listGrid.ts src/pages/dev/UiGallery.tsx
git commit -m "feat(ui): the settings frame pieces every settings page needs

SettingsSection takes an action, a list body, a header and a state;
SettingsRow an error, a hint id, stacked and group layouts; SettingsSave
and SettingsSaveBar keep their status region mounted; SettingsNote,
MetaParts and the form constants; PageHeader can title the bar without a
heading; settingsTitle reads each page's h1 from the nav; the Attributes
and Custom objects grids with their summed-minimum test.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The settings bar: "Settings" in the framed bar, the nav on the primitives

**Files:**
- Modify: `src/components/layout/Navbar.tsx`, `src/layouts/WorkspaceSettingsLayout.tsx`
- Create: `src/e2e/settingsBar.test.tsx`
- Test (update): `src/components/layout/Navbar.test.tsx`, `src/layouts/WorkspaceSettingsLayout.test.tsx`

**Interfaces:**
- Consumes: `PageHeader` `titleAs` (Task 1), `ScrollSentinel`, `Select`, `TYPE`, `FOCUS` (ui).
- Produces: on every `/settings/*` route the Navbar draws the framed bar (`data-page-header`, transparent, hairline on scroll) with an empty `[data-nav-title-slot]`; `WorkspaceSettingsLayout` draws `PageHeader title="Settings" titleAs="p"` into it once for every page, so no route under the layout can miss the bar, and no page draws a `PageHeader` of its own. The `isAccountSettings` header is unchanged.

Why: spec §6.1 (every route gets the same bar; "Settings get the same bar"), §9.1 (the Navbar's per-route branches go surface by surface), the Records/Ops lesson (every `PageHeader` route is in `titledByPage`), and one `h1` per page (the bar's old "Settings" `h1` sat above each page's own).

- [ ] **Step 1: Write the failing tests**

In `src/components/layout/Navbar.test.tsx`, replace the describe "Navbar on Settings (settings spec 2026-10-06 §2.1)" with:

```tsx
describe('Navbar on Settings (UI foundations spec §6.1, Settings PR)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/settings/general', '/settings/data', '/settings/ai-usage', '/settings/people'])(
    'draws the framed bar with an empty title slot on %s, and no title of its own',
    (url) => {
      renderNavbar(url);
      const header = document.querySelector('header')!;
      expect(header).toHaveAttribute('data-page-header');
      expect(header).toHaveClass('h-16', 'px-4', 'border-transparent');
      expect(header.querySelector('[data-nav-title-slot]')).toBeEmptyDOMElement();
      expect(within(header).queryByRole('heading')).toBeNull();
      expect(within(header).queryByText('Settings')).toBeNull();
    },
  );

  it('leaves the account settings header alone', () => {
    renderNavbar('/account-settings/account');
    const header = document.querySelector('header')!;
    expect(header).not.toHaveAttribute('data-page-header');
    expect(header.querySelector('[data-nav-title-slot]')).toBeNull();
  });
});
```

(`within` comes from `@testing-library/react`; add it to the import if the file lacks it.) In "Navbar left wrapper height", keep `'/settings/data'` in the `it.each` and change the comment's "the non-framed header (Settings, which isn't in isFramed)" to "a framed settings page".

In `src/layouts/WorkspaceSettingsLayout.test.tsx`, append:

```tsx
describe('WorkspaceSettingsLayout on the primitives (Settings PR)', () => {
  it('says Settings in its bar as text, so each page h1 is the only heading 1', () => {
    setViewport(1280);
    renderLayout('/settings/general');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByText('Settings', { selector: 'p' })).toHaveClass('text-[15px]', 'font-semibold');
  });

  it('labels the nav groups as eyebrows and gives the scroll column its hairline sentinel', () => {
    setViewport(1280);
    renderLayout('/settings/general');
    const label = document.getElementById('settings-nav-workspace')!;
    expect(label).toHaveClass('text-[11px]', 'font-semibold', 'uppercase', 'tracking-wider', 'text-ink-muted');
    const column = screen.getByTestId('where').closest('.overflow-y-auto')!;
    expect(column.firstElementChild).toHaveAttribute('data-part', 'scroll-sentinel');
  });

  it('draws the phone picker with the ui Select: its chevron and frame', () => {
    setViewport(375);
    renderLayout('/settings/webhooks');
    const select = screen.getByRole('combobox', { name: 'Settings section' });
    expect(select).toHaveClass('appearance-none', 'border-line', 'bg-surface');
    expect(select.parentElement!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
```

Create `src/e2e/settingsBar.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { settingsRoutes } from '../pages/settings/routes';
import { WORKSPACE_SETTINGS_NAV } from '../pages/settings/workspaceSettingsNav';
import { makeRulesStore } from '../pages/rules/testPages';
import { SlotHost } from '../test/SlotHost';
import { resetViewport, setViewport } from '../test/viewport';

// Every settings route, through the real route tree and the real Navbar:
// the layout draws "Settings" into the framed bar once, as text, so a page
// never misses its bar and never shows a second h1 (UI foundations spec
// §6.1, §6.3). Each page is stubbed: this is about the bar.
const PATHS = WORKSPACE_SETTINGS_NAV.flatMap((group) => group.items.map((item) => item.path));

function renderSettings(url: string) {
  setViewport(1440);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
  render(
    <Provider store={makeRulesStore('admin')}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={false}>
          <Navbar />
          <Routes>{settingsRoutes(() => <p>Page body</p>)}</Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
}

describe('settings routes title the bar (UI foundations spec §6.1)', () => {
  afterEach(() => {
    cleanup();
    resetViewport();
    vi.unstubAllGlobals();
  });

  it('covers all twenty items', () => {
    expect(PATHS).toHaveLength(20);
  });

  it.each(PATHS)('%s: "Settings" in the framed bar as text, at the content edge, and no h1 in the bar', async (path) => {
    renderSettings(path);
    const header = document.querySelector('header')!;
    expect(header).toHaveAttribute('data-page-header');
    const slot = header.querySelector<HTMLElement>('[data-nav-title-slot]')!;
    const title = await within(slot).findByText('Settings');
    expect(title.tagName).toBe('P');
    expect(within(header).queryByRole('heading')).toBeNull();
  });
});
```

(If `makeRulesStore`'s admin lacks a capability a gated route asks for, use the store the area tests use for that route; `capabilitiesForRole('admin')` holds every capability today.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/layout/Navbar.test.tsx src/layouts/WorkspaceSettingsLayout.test.tsx src/e2e/settingsBar.test.tsx`
Expected: FAIL (the Navbar still draws its own "Settings" `h1` in the solid header; the layout has no `PageHeader`, no sentinel, the old group label and a bare select).

- [ ] **Step 3: Implement**

`src/components/layout/Navbar.tsx`:
1. Replace `const isSettings = location.pathname.startsWith('/settings');` with:

```tsx
  // Workspace settings (UI foundations spec §6.1, Settings PR): every page
  // under WorkspaceSettingsLayout, which draws "Settings" into this bar's
  // title slot once (as text: each page's SettingsFrame owns the h1).
  // /account-settings keeps its own header, above.
  const isSettings = /^\/settings(\/|$)/.test(location.pathname);
```

2. Add `|| isSettings` to the end of both `titledByPage` and `isFramed`, and extend the comment above `titledByPage` to "Records, Ops, Impact and Settings (UI foundations spec §6.1): …".
3. Delete the branch `) : isSettings ? ( <h1 className="min-w-0 truncate text-[15px] font-bold text-ink tracking-tight">Settings</h1>` (the left area goes from the `titledByPage` slot straight to `) : isDashboard ? (`). Update the "Critical fix (review round 2)" comment's list "Organizations/Accounts/Pipelines/Settings tabs" to "Organizations/Accounts/Pipelines tabs".

`src/layouts/WorkspaceSettingsLayout.tsx`, whole file:

```tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks';
import type { Capability } from '../features/auth/authSlice';
import { MD, useMediaQuery } from '../lib/useMediaQuery';
import { visibleSettingsNav } from '../pages/settings/workspaceSettingsNav';
import { FOCUS, PageHeader, ScrollSentinel, Select, TYPE } from '../components/ui';

// A stable empty list, so the selector does not hand back a new array (and a
// re-render) on every store change while signed out.
const NO_PERMISSIONS: Capability[] = [];

const groupId = (label: string) => `settings-nav-${label.toLowerCase()}`;
const LINK = `flex min-h-9 items-center gap-2 rounded-lg px-2 text-[13px] leading-5 ${FOCUS}`;

/** Workspace settings' frame (settings spec 2026-10-06 §2.1; UI foundations
 *  spec §6.1, §6.3): "Settings" in the bar (as text: each page's
 *  SettingsFrame owns the h1), the grouped nav column from md, the ui Select
 *  above the page below it, and the page beside or under it, keeping its own
 *  scroll (whose sentinel shows the bar's hairline once it scrolls). One nav
 *  or the other is rendered, never both, so a screen reader meets one. */
export function WorkspaceSettingsLayout() {
  const permissions = useAppSelector((state) => state.auth.user?.permissions ?? NO_PERMISSIONS);
  const groups = visibleSettingsNav(permissions);
  const isMdUp = useMediaQuery(MD);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  const options = [
    ...(current ? [] : [{ value: '', label: 'Choose a section' }]),
    ...groups.map((group) => ({ label: group.label, options: group.items.map((item) => ({ value: item.path, label: item.label })) })),
  ];

  return (
    <>
      <PageHeader title="Settings" titleAs="p" />
      <div className="flex h-full min-h-0 w-full flex-1 flex-col md:flex-row">
        {isMdUp ? (
          <nav aria-label="Workspace settings" className="flex w-56 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line px-3 py-4">
            {groups.map((group) => (
              <div key={group.label} role="group" aria-labelledby={groupId(group.label)} className="flex flex-col gap-0.5">
                <span id={groupId(group.label)} className={`px-2 pb-1 ${TYPE.eyebrow}`}>
                  {group.label}
                </span>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) => `${LINK} ${isActive ? 'bg-subtle font-semibold text-ink' : 'text-ink-muted hover:bg-subtle hover:text-ink'}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
        ) : (
          <div className="shrink-0 px-4 pt-4">
            <Select
              label="Settings section"
              labelPosition="hidden"
              value={current?.path ?? ''}
              onChange={(path) => {
                if (path) navigate(path);
              }}
              options={options}
            />
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <ScrollSentinel />
          <Outlet />
        </div>
      </div>
    </>
  );
}
```

(The existing "marks the current item" case asserts `bg-subtle`, `text-ink`, `font-semibold`, `min-h-9`: still true. The existing phone cases assert `min-h-11` on the select and the option list: `SELECT` carries `min-h-11`, and `Select` draws the groups as `<optgroup>`.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/layout src/layouts src/e2e/settingsBar.test.tsx src/pages/settings/routes.test.tsx`
Expected: PASS. If a page test elsewhere found the Navbar's "Settings" `h1`, it now finds the text `Settings` (a `p`); keep its intent.

Run: `npm run lint` and `npm run build` (expected: clean, success).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/layouts/WorkspaceSettingsLayout.tsx \
  src/layouts/WorkspaceSettingsLayout.test.tsx src/e2e/settingsBar.test.tsx
git commit -m "feat(settings): Settings in the framed bar, the nav on the primitives

WorkspaceSettingsLayout draws \"Settings\" into the Navbar's title slot as
text, so each page's own h1 is the only one; the Navbar's solid Settings
header goes. The nav's group labels are eyebrows, the phone picker is the
ui Select, and the scroll column shows the bar's hairline.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Settings › Work: the frame as a thin wrapper, Recommendations, Tasks and Notifications in sections

**Files:**
- Modify: `src/pages/settings/{WorkSettingsFrame,WorkRecommendationsPage,WorkTasksPage,WorkNotificationsPage}.tsx`, `src/components/work/{WorkSettingsForm,WorkSettingsSummary,WorkTasksForm,WorkTasksSummary,WorkNotificationsForm,WorkNotificationsSummary}.tsx`
- Test (update): `src/pages/settings/{WorkRecommendationsPage,WorkTasksPage,WorkNotificationsPage}.test.tsx`, `src/e2e/workSettings.test.tsx`, `src/components/work/houseRules.test.ts`

**Interfaces:**
- Consumes: `SettingsFrame` (`headingRef`), `SettingsSection`, `SettingsRow`, `SettingsSave`, `SettingsSaveBar`, `SettingsNote`, `Switch`, `Select`, `INPUT`, `INVALID`, `NUM`, `CHOICE`, `CHECKBOX`, `FIELD_ERROR`, `FORM_ALERT`, `LoadingState`, `ErrorState`, `Card`, `BUTTON`, `TYPE` (ui); `settingsTitle` (Task 1).
- Produces: `WorkSettingsFrame({ title, intro, loading?, loadFailed?, children })` keeps its signature and its fetch, retry and focus logic; it renders `SettingsFrame` and draws its loading and error states inside a `Card pad="none"`.

Why: spec §6.3 ("`WorkSettingsFrame`'s layout becomes a presentational `SettingsFrame`; its data fetching stays in a thin wrapper"; every control in a section; Save in the footer or a sticky bar; states inside the card), §5.5 (`Switch`, `Select`), §3 (figures in `NUM`).

| Page | Sections |
|---|---|
| Recommendations (admin) | "Who receives them" (the two radios, one row each), "Signals" (a list: each source's switch, detail and threshold fields), "Dismissals" (one row), then `SettingsSaveBar`; "Run now" (its own section, outside the form) |
| Recommendations (member) | `SettingsNote icon="lock"` (READ_ONLY) in the frame's `note`, then the same three sections as text |
| Tasks (admin) | one section "Reminders" with three rows (escalation, timezone, working days) and `SettingsSave` in its footer |
| Notifications (admin) | the email-not-ready `SettingsNote icon="warning"`, then one section "Daily digest" with two rows (the switch, the hour) and `SettingsSave` in its footer |
| Tasks, Notifications (member) | the lock note, then the section's rows as text |

- [ ] **Step 1: Update the tests to the new markup (they fail first)**

`src/pages/settings/WorkRecommendationsPage.test.tsx`:
- In "shows an admin the form…", replace `expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true');` with:

```tsx
    // A multi-section form: Save sits in the sticky bar, shown once something changes.
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Signals' })).toContainElement(screen.getByRole('switch', { name: 'Health drop' }));
    expect(screen.getByRole('list', { name: 'Signals' })).toHaveClass('divide-y');
```

- Append:

```tsx
describe('Settings › Work › Recommendations on the settings frame (UI foundations spec §6.3)', () => {
  it('heads the page with the nav label in the display size, inside the default frame', async () => {
    stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    const title = screen.getByRole('heading', { level: 1, name: 'Recommendations' });
    expect(title).toHaveClass('text-[22px]', 'font-semibold');
    expect(title.closest('.max-w-3xl')).not.toBeNull();
    await screen.findByRole('radio', { name: 'The suggested person' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Who receives them', 'Signals', 'Dismissals', 'Run now']);
  });

  it('shows the save bar once something changes, keeps it after Saved., and its status region is one node', async () => {
    stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    const bar = (await screen.findByRole('radio', { name: 'The suggested person' })).closest('form')!.querySelector('[data-part="save-bar"]')!;
    const region = within(bar as HTMLElement).getByRole('status');
    await userEvent.click(screen.getByRole('radio', { name: 'The suggested person' }));
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save.parentElement).toHaveClass('sticky', 'bottom-0');
    await userEvent.click(save);
    expect(await within(bar as HTMLElement).findByText('Saved.')).toBe(region);
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('marks a refused threshold on its field: the danger edge, the error under it, named by the field', async () => {
    stubWork();
    renderPage(<WorkRecommendationsPage />, URL);
    await screen.findByLabelText('Within (days)');
    await retype('Within (days)', '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const field = screen.getByLabelText('Within (days)');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveClass('aria-[invalid=true]:border-danger');
    const error = within(row('renewal_due')).getByRole('alert');
    expect(error).toHaveClass('text-[11px]', 'text-danger-ink');
    expect(field.getAttribute('aria-describedby')).toContain(error.id);
  });
});
```

(If `validateDraft` accepts `0` for that field, use the value the existing refusal test types; keep the assertion on `aria-invalid`, the class, the alert and `aria-describedby`.)

`src/pages/settings/WorkNotificationsPage.test.tsx`:
- `screen.getByRole('status', { name: 'Loading these settings' })` (twice) becomes `screen.getByText('Loading these settings')` (the `LoadingState` label is its sr-only text; a status region takes no name from its content).
- `expect(screen.getByRole('switch', { name: 'Daily digest' }).closest('label')).toHaveClass('min-h-11');` becomes `expect(screen.getByRole('switch', { name: 'Daily digest' })).toHaveClass('min-h-11');` (the ui `Switch` is the 44px button itself).
- The email-not-ready case keeps `toHaveClass('text-ink')` and `not.toHaveClass('text-warning')` on the line (`SettingsNote icon="warning"` sets the words in `text-ink`, the icon in `text-warning`); find the line with `screen.getByText(TRACK.NO_EMAIL).closest('[data-part="settings-note"]')`.

`src/pages/settings/WorkTasksPage.test.tsx`: the same two edits (the loading text; the working-day checkboxes keep `closest('label')` with `min-h-11`, now `CHOICE`). Append:

```tsx
describe('Settings › Work › Tasks on the settings frame (UI foundations spec §6.3)', () => {
  it('puts the three settings in one section with Save in its footer, the status region beside it', async () => {
    stubWork();
    renderPage(<WorkTasksPage />, '/settings/work-tasks');
    const section = await screen.findByRole('region', { name: 'Reminders' });
    expect(within(section).getByLabelText('Tell the manager after (working days overdue)')).toHaveClass('tabular-nums');
    expect(within(section).getByRole('combobox', { name: 'Timezone' })).toHaveClass('appearance-none');
    expect(within(section).getByRole('group', { name: 'Working days' })).toBeInTheDocument();
    const save = within(section).getByRole('button', { name: 'Save changes' });
    expect(save.parentElement).toHaveClass('border-t', 'justify-end');
    expect(save.previousElementSibling).toHaveAttribute('role', 'status');
  });
});
```

`src/e2e/workSettings.test.tsx`: the member half asserts `screen.queryByRole('checkbox')` and `queryByRole('switch')` are null and reads `[data-setting=…]`: unchanged. No other edit.

`src/components/work/houseRules.test.ts`:
- `PRIMARY_OWNERS` becomes `['../../pages/work/Today.tsx']`, and add `const SAVE_OWNERS = ['./WorkSettingsForm.tsx', './WorkTasksForm.tsx', './WorkNotificationsForm.tsx'];` with, in the primaries case, `for (const file of SAVE_OWNERS) expect(files[file], file).toMatch(/<SettingsSave(Bar)? /);` (the one primary of each settings form is drawn by `SettingsSave`/`SettingsSaveBar`).
- In "designs loading, empty and error states", the two `WorkSettingsFrame.tsx` lines become `toMatch(/<ErrorState /)` and `toMatch(/<LoadingState /)`.
- In "sets every figure with tabular figures", the three summaries keep `/\b(MONO|NUM)\b/` (they now use `NUM`).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/WorkRecommendationsPage.test.tsx src/pages/settings/WorkTasksPage.test.tsx src/pages/settings/WorkNotificationsPage.test.tsx src/components/work/houseRules.test.ts`
Expected: FAIL (no sections, the 20px `h1`, the old loading block, a checkbox-switch, `PRIMARY` in the forms).

- [ ] **Step 3: The frame**

`src/pages/settings/WorkSettingsFrame.tsx`: keep the imports of `fetchWorkSettings`, `TRACK`, `WorkSettings`, `errorMessage`, the `STALE` constant, every hook and `retry` exactly as they are; drop the `ErrorBlock` and `FOCUS` imports; import `{ Card, ErrorState, LoadingState, SettingsFrame } from '../../components/ui'`. The doc comment's first sentence becomes "A Settings › Work page (delivery 3 Decision 7; UI foundations spec §6.3): a thin data wrapper around SettingsFrame." The body after `retry`:

```tsx
  let body: ReactNode;
  if (!settings && error)
    body = (
      <Card pad="none">
        <div ref={errorRef}>
          <ErrorState message={error} detail={STALE} onRetry={retry} />
        </div>
      </Card>
    );
  else if (!settings)
    body = (
      <Card pad="none">
        <LoadingState label={loading} variant="block" />
      </Card>
    );
  else body = children(settings, setSettings);

  return (
    <SettingsFrame title={title} intro={intro} headingRef={headingRef}>
      {body}
    </SettingsFrame>
  );
```

The three pages pass `title={settingsTitle('/settings/recommendations')}`, `title={settingsTitle('/settings/work-tasks')}`, `title={settingsTitle('/settings/work-notifications')}` (import `settingsTitle` from `'./workspaceSettingsNav'`), keeping their intros and load words. `WorkNotificationsPage`'s warning becomes:

```tsx
      {(settings, onSaved) => (
        <>
          {settings.email_ready ? null : <SettingsNote icon="warning">{TRACK.NO_EMAIL}</SettingsNote>}
          {settings.can_edit ? <WorkNotificationsForm settings={settings} onSaved={onSaved} /> : <WorkNotificationsSummary settings={settings} />}
        </>
      )}
```

(drop `TriangleAlert`; import `SettingsNote` from `'../../components/ui'`).

- [ ] **Step 4: Recommendations, the form and the summary**

`src/components/work/WorkSettingsForm.tsx`: the state, `setEnabled`, `setValue`, `save` and `runNow` stay exactly as they are. Imports: drop `LIST`, `CONTROL`, `FORM_ERROR`, `BUTTON`, `FOCUS`, `PRIMARY` from their old homes; add `import { BUTTON, CHECKBOX, FIELD_ERROR, FORM_ALERT, INPUT, INVALID, NUM, SettingsRow, SettingsSaveBar, SettingsSection, Switch, TYPE } from '../ui';`. Delete the local `INPUT`, `CHOICE`, `BOX`, `HEADING`, `NOTE`, `ERROR` constants and add:

```tsx
// A threshold: a short number field, the danger edge while refused.
const FIELD = `${INPUT} ${INVALID} ${NUM} sm:w-28`;
// A radio and its words fill the row, so the whole row is the target.
const RADIO_ROW = 'flex min-h-11 cursor-pointer items-start gap-3 px-4 py-3';
const RUN = `${BUTTON} aria-disabled:cursor-not-allowed aria-disabled:text-ink-faint aria-disabled:hover:bg-surface`;
```

The return:

```tsx
  const cooldownId = `${ids}-cooldown`;
  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={(event) => void save(event)} noValidate aria-label={SET.TITLE} className="flex flex-col gap-6">
        <SettingsSection title={SET.RECEIVES}>
          <fieldset className="min-w-0 divide-y divide-line-subtle">
            <legend className="sr-only">{SET.RECEIVES}</legend>
            {RECEIVE_OPTIONS.map((option) => {
              const detailId = `${ids}-receives-${option.value}`;
              return (
                <label key={option.value} className={RADIO_ROW}>
                  <input
                    type="radio"
                    name={`${ids}-receives`}
                    value={option.value}
                    checked={draft.recommend_to === option.value}
                    aria-describedby={detailId}
                    onChange={() => setDraft((current) => ({ ...current, recommend_to: option.value }))}
                    className={`mt-0.5 ${CHECKBOX}`}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className={TYPE.label}>{option.label}</span>
                    <span id={detailId} className={TYPE.meta}>
                      {option.detail}
                    </span>
                  </span>
                </label>
              );
            })}
            {errors.recommend_to ? (
              <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
                {errors.recommend_to}
              </p>
            ) : null}
          </fieldset>
        </SettingsSection>

        <SettingsSection title={SET.SIGNALS} list={SET.SIGNALS}>
          {SOURCE_SPECS.map((spec) => {
            const source = draft.sources[spec.kind];
            const failed = errors.sources[spec.kind] ?? {};
            const detailId = `${ids}-${spec.kind}-detail`;
            const own = failed.enabled ?? failed.source;
            return (
              <li key={spec.kind} data-source={spec.kind} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={TYPE.label}>{spec.label}</span>
                  <Switch checked={source.enabled} label={spec.label} describedBy={detailId} onChange={(next) => setEnabled(spec.kind, next)}>
                    {source.enabled ? SET.ON : SET.OFF}
                  </Switch>
                </div>
                <p id={detailId} className={TYPE.meta}>
                  {spec.detail}
                </p>
                {spec.fields.length > 0 ? (
                  <div className="flex flex-wrap gap-4">
                    {spec.fields.map((field) => {
                      const id = `${ids}-${spec.kind}-${field.field}`;
                      const error = failed[field.field];
                      return (
                        <div key={field.field} className="flex min-w-0 flex-col gap-1">
                          <label htmlFor={id} className={TYPE.label}>
                            {field.label}
                          </label>
                          <input
                            id={id}
                            inputMode={field.whole ? 'numeric' : 'decimal'}
                            value={source.values[field.field] ?? ''}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? `${id}-error` : undefined}
                            onChange={(event) => setValue(spec.kind, field.field, event.target.value)}
                            className={FIELD}
                          />
                          {error ? (
                            <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
                              {error}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {own ? (
                  <p role="alert" className={FORM_ALERT}>
                    {own}
                  </p>
                ) : null}
              </li>
            );
          })}
        </SettingsSection>

        <SettingsSection title={SET.DISMISSALS}>
          <SettingsRow
            label={SET.COOLDOWN}
            htmlFor={cooldownId}
            hint={SET.COOLDOWN_DETAIL}
            hintId={`${cooldownId}-detail`}
            error={errors.dismiss_cooldown_days || undefined}
            errorId={`${cooldownId}-error`}
          >
            <input
              id={cooldownId}
              inputMode="numeric"
              value={draft.cooldown}
              aria-invalid={Boolean(errors.dismiss_cooldown_days)}
              aria-describedby={errors.dismiss_cooldown_days ? `${cooldownId}-detail ${cooldownId}-error` : `${cooldownId}-detail`}
              onChange={(event) => setDraft((current) => ({ ...current, cooldown: event.target.value }))}
              className={FIELD}
            />
          </SettingsRow>
        </SettingsSection>

        {errors.form ? (
          <p role="alert" className={FORM_ALERT}>
            {errors.form}
          </p>
        ) : null}
        <SettingsSaveBar dirty={dirty} saving={saving.busy} status={status} label={SET.SAVE} busyLabel={SET.SAVING} />
      </form>

      <SettingsSection title={SET.RUN} description={SET.RUN_HINT}>
        <div className="flex flex-col items-start gap-2 px-4 py-3">
          <button type="button" onClick={() => void runNow()} aria-disabled={running.busy || undefined} className={RUN}>
            {running.busy ? SET.RUNNING : SET.RUN}
          </button>
          {/* Always mounted (spec §4.4): the run's answer is announced. */}
          <div role="status" className={`flex flex-col gap-1 ${TYPE.body} empty:sr-only`}>
            {run ? (
              <p>
                <Figured text={run.text} />
              </p>
            ) : null}
            {run?.failed ? <p className="text-[13px] leading-5 text-warning-ink">{run.failed}</p> : null}
          </div>
          {runError ? (
            <p role="alert" className={FORM_ALERT}>
              {runError}
            </p>
          ) : null}
        </div>
      </SettingsSection>
    </div>
  );
```

(`runNow` returns early while `running.busy`, as `save` does while clean: check its first line and add `if (running.busy) return;` if it lacks one, since the button is `aria-disabled`, not `disabled`.)

`src/components/work/WorkSettingsSummary.tsx`, whole file:

```tsx
import { RECEIVE_OPTIONS, SET, SOURCE_SPECS } from '../../features/work/workSettings';
import type { WorkSettings } from '../../features/work/workTypes';
import { MetaParts, NUM, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../ui';

/** The recommender's settings for a member (Decision 10): the values as
 *  text in the same sections, never disabled controls, and who may change
 *  them. */
export function WorkSettingsSummary({ settings }: { settings: WorkSettings }) {
  const receives = RECEIVE_OPTIONS.find((option) => option.value === settings.recommend_to)?.label ?? settings.recommend_to;
  return (
    <div className="flex flex-col gap-6">
      <SettingsNote icon="lock">{SET.READ_ONLY}</SettingsNote>
      <SettingsSection title={SET.RECEIVES}>
        <SettingsRow label={SET.RECEIVES}>
          <p className={TYPE.body}>{receives}</p>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title={SET.SIGNALS} list={SET.SIGNALS}>
        {SOURCE_SPECS.map((spec) => {
          const saved = settings.sources[spec.kind];
          return (
            <li key={spec.kind} data-source={spec.kind} className="flex flex-col gap-1 px-4 py-3">
              <p className={TYPE.body}>
                <span className="font-semibold">{spec.label}:</span>{' '}
                <MetaParts
                  parts={[
                    saved?.enabled ? SET.ON : SET.OFF,
                    ...spec.fields.map((field) => (
                      <>
                        {field.label} <span className={NUM}>{saved?.[field.field] ?? ''}</span>
                      </>
                    )),
                  ]}
                />
              </p>
              <p className={TYPE.meta}>{spec.detail}</p>
            </li>
          );
        })}
      </SettingsSection>
      <SettingsSection title={SET.DISMISSALS}>
        <SettingsRow label={SET.COOLDOWN}>
          <p className={`${TYPE.body} ${NUM}`}>{settings.dismiss_cooldown_days}</p>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
```

(The member's lock note sits in the body, not the frame's `note`, because the frame cannot know `can_edit` before the read. A test that read "On · Within (days) 30" as one string still reads it: `MetaParts` writes "On · Within (days) 30 · …".)

- [ ] **Step 5: Tasks and Notifications, forms and summaries**

`src/components/work/WorkTasksForm.tsx`: state, `edit`, `toggleDay` and `save` unchanged. Imports: drop `CONTROL`, `FORM_ERROR`, `FOCUS`, `PRIMARY`; add `import { CHECKBOX, CHOICE, FORM_ALERT, INPUT, INVALID, NUM, Select, SettingsRow, SettingsSave, SettingsSection } from '../ui';`. Delete the local constants; keep `const FIELD = `${INPUT} ${INVALID} ${NUM} sm:w-28`;`. The return:

```tsx
  const escalateId = `${ids}-escalate`;
  const zoneId = `${ids}-zone`;
  return (
    <form onSubmit={(event) => void save(event)} noValidate aria-label={TRACK.TASKS_TITLE} className="flex flex-col gap-3">
      <SettingsSection title={TRACK.REMINDERS} footer={<SettingsSave dirty={dirty} saving={saving.busy} status={status} label={SET.SAVE} busyLabel={SET.SAVING} />}>
        <SettingsRow
          label={TRACK.ESCALATE}
          htmlFor={escalateId}
          hint={TRACK.ESCALATE_DETAIL}
          hintId={`${escalateId}-detail`}
          error={failed.escalate_after_days || undefined}
          errorId={`${escalateId}-error`}
        >
          <input
            id={escalateId}
            inputMode="numeric"
            value={draft.escalate}
            aria-invalid={Boolean(failed.escalate_after_days)}
            aria-describedby={failed.escalate_after_days ? `${escalateId}-detail ${escalateId}-error` : `${escalateId}-detail`}
            onChange={(event) => edit('escalate_after_days', (current) => ({ ...current, escalate: event.target.value }))}
            className={FIELD}
          />
        </SettingsRow>
        <SettingsRow label={TRACK.TIMEZONE} htmlFor={zoneId} hint={TRACK.TIMEZONE_DETAIL} hintId={`${zoneId}-detail`} error={failed.timezone || undefined} errorId={`${zoneId}-error`}>
          <Select
            id={zoneId}
            label={TRACK.TIMEZONE}
            labelPosition="external"
            value={draft.timezone}
            invalid={Boolean(failed.timezone)}
            describedBy={failed.timezone ? `${zoneId}-detail ${zoneId}-error` : `${zoneId}-detail`}
            onChange={(value) => edit('timezone', (current) => ({ ...current, timezone: value }))}
            options={zones.map((zone) => ({ value: zone, label: zone }))}
            className="sm:w-72"
          />
        </SettingsRow>
        <SettingsRow label={TRACK.WORKING_DAYS} group hint={TRACK.WORKING_DAYS_DETAIL} hintId={`${ids}-days-detail`} error={failed.working_days || undefined} errorId={`${ids}-days-error`}>
          <div className="flex flex-wrap gap-x-4">
            {WEEKDAYS.map((day) => (
              <label key={day.value} className={CHOICE}>
                <input type="checkbox" checked={draft.working_days.includes(day.value)} onChange={() => toggleDay(day.value)} className={CHECKBOX} />
                {day.label}
              </label>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
```

Add `REMINDERS: 'Reminders',` to `TRACK` in `src/features/work/workTracking.ts` (one line, after `TASKS_INTRO`), and `DIGEST_SECTION: 'Daily digest',` after `NOTICES_INTRO`.

`src/components/work/WorkNotificationsForm.tsx`: state, `edit` and `save` unchanged; imports as in Tasks (plus `Switch`, without `CHECKBOX`, `CHOICE`). The return:

```tsx
  const hourId = `${ids}-hour`;
  const digestDescribed = failed.digest_enabled ? `${ids}-digest-detail ${ids}-digest-error` : `${ids}-digest-detail`;
  return (
    <form onSubmit={(event) => void save(event)} noValidate aria-label={TRACK.NOTICES_TITLE} className="flex flex-col gap-3">
      <SettingsSection title={TRACK.DIGEST_SECTION} footer={<SettingsSave dirty={dirty} saving={saving.busy} status={status} label={SET.SAVE} busyLabel={SET.SAVING} />}>
        <SettingsRow label={TRACK.DIGEST} hint={TRACK.DIGEST_DETAIL} hintId={`${ids}-digest-detail`} error={failed.digest_enabled || undefined} errorId={`${ids}-digest-error`}>
          <Switch
            checked={draft.digest_enabled}
            label={TRACK.DIGEST}
            describedBy={digestDescribed}
            onChange={(next) => edit('digest_enabled', (current) => ({ ...current, digest_enabled: next }))}
          >
            {draft.digest_enabled ? SET.ON : SET.OFF}
          </Switch>
        </SettingsRow>
        <SettingsRow label={TRACK.DIGEST_HOUR} htmlFor={hourId} hint={hourNote(settings.timezone)} hintId={`${hourId}-detail`} error={failed.digest_hour || undefined} errorId={`${hourId}-error`}>
          <Select
            id={hourId}
            label={TRACK.DIGEST_HOUR}
            labelPosition="external"
            value={String(draft.digest_hour)}
            invalid={Boolean(failed.digest_hour)}
            describedBy={failed.digest_hour ? `${hourId}-detail ${hourId}-error` : `${hourId}-detail`}
            onChange={(value) => edit('digest_hour', (current) => ({ ...current, digest_hour: Number(value) }))}
            options={HOURS.map((hour) => ({ value: String(hour), label: hourLabel(hour) }))}
            className="sm:w-28"
          />
        </SettingsRow>
      </SettingsSection>
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
    </form>
  );
```

`src/components/work/WorkTasksSummary.tsx`, whole file:

```tsx
import { SET } from '../../features/work/workSettings';
import { TRACK, weekdayNames } from '../../features/work/workTracking';
import type { WorkSettings } from '../../features/work/workTypes';
import { NUM, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../ui';

/** Settings › Work › Tasks for a member (delivery 3 Decision 6): the values as text. */
export function WorkTasksSummary({ settings }: { settings: WorkSettings }) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsNote icon="lock">{SET.READ_ONLY}</SettingsNote>
      <SettingsSection title={TRACK.REMINDERS}>
        <div data-setting="escalate">
          <SettingsRow label={TRACK.ESCALATE}>
            <p className={`${TYPE.body} ${NUM}`}>{settings.escalate_after_days}</p>
          </SettingsRow>
        </div>
        <div data-setting="timezone">
          <SettingsRow label={TRACK.TIMEZONE}>
            <p className={TYPE.body}>{settings.timezone}</p>
          </SettingsRow>
        </div>
        <div data-setting="working_days">
          <SettingsRow label={TRACK.WORKING_DAYS}>
            <p className={TYPE.body}>{weekdayNames(settings.working_days)}</p>
          </SettingsRow>
        </div>
      </SettingsSection>
    </div>
  );
}
```

`src/components/work/WorkNotificationsSummary.tsx` follows the same shape: the lock note, then `SettingsSection title={TRACK.DIGEST_SECTION}` with `data-setting="digest"` (`SET.ON`/`SET.OFF`) and `data-setting="digest_hour"` (`<p className={`${TYPE.body} ${NUM}`}>{hourLabel(settings.digest_hour)}</p>`) rows.

The e2e reads `[data-setting="escalate"]` as `${ESCALATE}: 4` and `Daily digest: Off`. The rows now read "Tell the manager after (working days overdue)4" (label and value in separate elements): change those two e2e assertions to `toHaveTextContent(ESCALATE)` plus `toHaveTextContent('4')`, and `toHaveTextContent('Daily digest')` plus `toHaveTextContent('Off')`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/pages/settings/WorkRecommendationsPage.test.tsx src/pages/settings/WorkTasksPage.test.tsx src/pages/settings/WorkNotificationsPage.test.tsx src/e2e/workSettings.test.tsx src/components/work`
Expected: PASS. Expected updates beyond Step 1 (keep each test's intent): a case that found Save on a clean Recommendations form now finds none until a change; a case that clicked a switch inside its `label` clicks the switch; "uses at most four type sizes across the section" passes (11/13/15/22 only).

Run: `npm run lint` (expected: clean).

- [ ] **Step 7: Commit**

```bash
git add src/pages/settings/WorkSettingsFrame.tsx src/pages/settings/WorkRecommendationsPage.tsx src/pages/settings/WorkTasksPage.tsx src/pages/settings/WorkNotificationsPage.tsx \
  src/components/work/WorkSettingsForm.tsx src/components/work/WorkSettingsSummary.tsx src/components/work/WorkTasksForm.tsx src/components/work/WorkTasksSummary.tsx \
  src/components/work/WorkNotificationsForm.tsx src/components/work/WorkNotificationsSummary.tsx src/features/work/workTracking.ts \
  src/pages/settings/WorkRecommendationsPage.test.tsx src/pages/settings/WorkTasksPage.test.tsx src/pages/settings/WorkNotificationsPage.test.tsx \
  src/e2e/workSettings.test.tsx src/components/work/houseRules.test.ts
git commit -m "feat(settings): Work settings on the settings frame

WorkSettingsFrame is a thin data wrapper around SettingsFrame with its
states inside a card; Recommendations, Tasks and Notifications put every
control in a section, use the ui Switch and Select, show errors under
their fields, and save from the section footer or the sticky save bar.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Settings › Agents: the frame as a thin wrapper, each agent a section, Actions & approvals flush in its card

**Files:**
- Modify: `src/pages/settings/{AgentSettingsFrame,AgentsSettingsPage,AgentActionsPage}.tsx`, `src/components/agents/{AgentCard,AgentsForm,AgentsSummary,ActionsGridForm,ActionsGridSummary,AiOffNotice}.tsx`, `src/features/agents/agentsText.ts` (three keys)
- Test (update): `src/pages/settings/{AgentsSettingsPage,AgentActionsPage}.test.tsx`, `src/e2e/agents.test.tsx` (only if it pins the frame), `src/components/agents/houseRules.test.ts`

**Interfaces:**
- Consumes: as Task 3, plus `TABLE`, `TH`, `TD`.
- Produces: `AgentSettingsFrame({ title, intro, children })` keeps its signature and `SettingsUpdate` export; `AgentCard({ card, canRun, onRan, children })` keeps its signature and now renders a `SettingsSection` titled by the agent (its `children` are `SettingsRow`s); `AiOffNotice` renders a `SettingsNote icon="warning"`; three new `AGENTS` keys: `GRID_TITLE = 'What each agent may do'`, `WORKSPACE_AI = 'Workspace AI'`, `AGENT_SWITCH = 'This agent'`.

Why: spec §6.3 (thin wrapper; sections; Save in a footer or a sticky bar), §4.2 (Actions & approvals is one of the four tables that sit flush in their card), §5.5 (the `AgentsForm` switch onto `Switch`; bare selects onto `Select`), §4.1 (`AgentCard` was a hand-written card).

| Page | Layout |
|---|---|
| Agents (admin) | one `<form>`: section "Workspace AI" (rows: the AI switch, Tone), the AI-off note, one section per agent (`AgentCard`: the spend row with Run now in the section's action, then the agent's switch and Monthly credits rows), the form error, `SettingsSaveBar` |
| Agents (member) | the lock note, "Workspace AI" as text, one section per agent with its values as text and Run now when `can_run` |
| Actions & approvals (admin) | the AI-off note; section `GRID_TITLE` (the matrix flush in its card, `NEVER_NOTE` as its description, `SettingsSave` in its footer); section "What each action does" (a list) |
| Actions & approvals (member) | the lock note, the same two sections with words in the cells |

- [ ] **Step 1: Update the tests to the new markup (they fail first)**

`src/pages/settings/AgentsSettingsPage.test.tsx`:
- `screen.getByRole('status', { name: 'Loading the agent settings' })` becomes `screen.getByText('Loading the agent settings')`.
- A case that expected Save present (`aria-disabled`) on a clean form now expects `queryByRole('button', { name: 'Save changes' })` to be null until a change (the multi-section form's Save is in the sticky bar).
- Append:

```tsx
describe('Settings › Agents on the settings frame (UI foundations spec §6.3)', () => {
  it('heads the page from the nav, and makes each agent a section with Run now on its heading row', async () => {
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    expect(screen.getByRole('heading', { level: 1, name: 'Agents' })).toHaveClass('text-[22px]');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    expect(within(cs).getByRole('heading', { level: 2, name: 'CS agent' })).toHaveClass('text-[15px]');
    const run = within(cs).getByRole('button', { name: 'Run now' });
    expect(run.closest('.rounded-xl')).toBeNull();
    expect(within(cs).getByRole('switch', { name: /^CS agent/ })).toHaveAttribute('aria-checked');
    expect(within(cs).getByLabelText('Monthly credits for the CS agent')).toHaveClass('tabular-nums');
    expect(screen.getByRole('region', { name: 'Workspace AI' })).toContainElement(screen.getByRole('switch', { name: 'AI for this workspace' }));
  });

  it('keeps each agent card a section with no card inside a card', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    await screen.findByRole('region', { name: 'CS agent' });
    expect(errors.mock.calls.filter(([message]) => message === 'Card inside Card')).toEqual([]);
    errors.mockRestore();
  });

  it('keeps an agent run answer in a status region that is one node from before the run', async () => {
    stubAgents();
    renderPage(<AgentsSettingsPage />, '/settings/agents');
    const cs = await screen.findByRole('region', { name: 'CS agent' });
    const region = within(cs).getByRole('status');
    await userEvent.click(within(cs).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(region).not.toBeEmptyDOMElement());
    expect(within(cs).getByRole('status')).toBe(region);
  });
});
```

(`stubAgents()` and `renderPage` are the file's own helpers; with no options the stub lets a run succeed, as the second run in "runs an agent now…" shows.)

`src/pages/settings/AgentActionsPage.test.tsx`:
- The select-width case: the ui `Select` wraps the native select, so `expect(select).toHaveClass('w-28', 'min-w-28', …)` becomes `expect(select.closest('.w-28')).toHaveClass('min-w-28')` plus `expect(select).toHaveClass('min-h-11', 'sm:min-h-9', 'rounded-lg', 'border-line', 'bg-surface')`; drop `not.toHaveClass('w-full')` (the native select fills its 7rem wrapper) and keep `not.toHaveClass('min-w-0')` on the wrapper: `expect(select.closest('.w-28')).not.toHaveClass('min-w-0')`.
- `expect(table.parentElement).toHaveClass('overflow-x-auto')` stays.
- Append:

```tsx
describe('Actions & approvals on the settings frame (UI foundations spec §4.2, §6.3)', () => {
  it('sits the matrix flush in its section card, with sentence-case headers and Save in the footer', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agent-actions');
    const table = await screen.findByRole('table', { name: 'Actions & approvals' });
    const section = screen.getByRole('region', { name: 'What each agent may do' });
    expect(section).toContainElement(table);
    expect(within(table).getByRole('columnheader', { name: 'Action' })).toHaveClass('text-[11px]', 'font-semibold', 'text-ink-muted');
    expect(within(table).getByRole('columnheader', { name: 'Action' }).className).not.toMatch(/uppercase/);
    const save = within(section).getByRole('button', { name: 'Save changes' });
    expect(save.parentElement).toHaveClass('border-t', 'justify-end');
    expect(screen.getByRole('region', { name: 'What each action does' })).toContainElement(screen.getByRole('list', { name: 'What each action does' }));
  });
});
```

`src/components/agents/houseRules.test.ts`:
- `PRIMARY_OWNERS` becomes `['./DraftForm.tsx', './DraftPanel.tsx']`; add `const SAVE_OWNERS = ['./AgentsForm.tsx', './ActionsGridForm.tsx'];` and in "keeps one primary per settings form and none elsewhere" assert `for (const file of SAVE_OWNERS) expect(files[file], file).toMatch(/<SettingsSave(Bar)? /);` (they reach no `PRIMARY` of their own, so the "none elsewhere" loop already covers them).
- In "gives every list a skeleton and an error state", the two `AgentSettingsFrame.tsx` lines become `toContain('<LoadingState')` and `toContain('<ErrorState')`.
- "allows an inline style only for the spend bar width" stays: keep `AgentCard`'s `style={{ width: `${width}%` }} />` line byte-identical.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/AgentsSettingsPage.test.tsx src/pages/settings/AgentActionsPage.test.tsx src/components/agents/houseRules.test.ts`
Expected: FAIL.

- [ ] **Step 3: The frame, the pages and the notice**

`src/pages/settings/AgentSettingsFrame.tsx`: keep `SettingsUpdate`, the state, the effect, `update` and `retry`; drop `ErrorBlock`; import `{ Card, ErrorState, LoadingState, SettingsFrame } from '../../components/ui'`. The body:

```tsx
  let body: ReactNode;
  if (!settings && error)
    body = (
      <Card pad="none">
        <ErrorState message={error} onRetry={retry} />
      </Card>
    );
  else if (!settings)
    body = (
      <Card pad="none">
        <LoadingState label={AGENTS.LOADING} variant="block" />
      </Card>
    );
  else body = children(settings, update);

  return (
    <SettingsFrame title={title} intro={intro}>
      {body}
    </SettingsFrame>
  );
```

`AgentsSettingsPage` passes `title={settingsTitle('/settings/agents')}`, `AgentActionsPage` `title={settingsTitle('/settings/agent-actions')}`.

`src/components/agents/AiOffNotice.tsx`:

```tsx
import { AGENTS } from '../../features/agents/agentsText';
import { SettingsNote } from '../ui';

/** One line above the agents while AI is off: a real consequence, so the
 *  warning icon, with the words in ink (amber text fails contrast). */
export function AiOffNotice() {
  return <SettingsNote icon="warning">{AGENTS.AI_OFF}</SettingsNote>;
}
```

`src/features/agents/agentsText.ts`: add `GRID_TITLE: 'What each agent may do',`, `WORKSPACE_AI: 'Workspace AI',` and `AGENT_SWITCH: 'This agent',` after `ACTIONS_INTRO`.

- [ ] **Step 4: `AgentCard`, `AgentsForm`, `AgentsSummary`**

`src/components/agents/AgentCard.tsx`: the state, effect and `runNow` stay; imports: drop `useId`, `BUTTON`, `FOCUS` from `portfolio/styles`; add `import { BUTTON, FOCUS, SettingsSection, TYPE } from '../ui';`. The return:

```tsx
  return (
    <SettingsSection
      title={card.label}
      action={
        canRun ? (
          <button type="button" disabled={busy} onClick={() => void runNow()} className={BUTTON}>
            {busy ? AGENTS.RUNNING : AGENTS.RUN}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1 px-4 py-3">
        <div
          role="progressbar"
          aria-label={`${card.label} credits this month`}
          aria-valuemin={0}
          aria-valuemax={Math.max(1, card.monthly_credits)}
          aria-valuenow={Math.min(card.spent_this_month, card.monthly_credits)}
          className="h-2 w-full overflow-hidden rounded-full bg-subtle"
        >
          <div className={`h-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${width}%` }} />
        </div>
        <p className={TYPE.meta}>
          <Figured text={budgetText(card)} />
        </p>
        <p className={TYPE.meta}>
          <Figured text={lastRunText(card)} />
        </p>
        {/* Always mounted and never display:none (M10, as Waiting's), so the
            success is announced; a failure is its own focused alert. */}
        <p role="status" className={`${TYPE.body} empty:sr-only`}>
          {said && !said.failed ? said.text : null}
        </p>
        {said?.failed ? (
          <p ref={alertRef} tabIndex={-1} role="alert" className={`rounded-sm text-[13px] leading-5 text-danger-ink ${FOCUS}`}>
            {said.text}
          </p>
        ) : null}
      </div>
      {children}
    </SettingsSection>
  );
```

The doc comment's "its name, the spend bar…" stays and gains "drawn as a SettingsSection (UI foundations spec §6.3): the name is its h2, Run now its one action".

`src/components/agents/AgentsForm.tsx`: the state, `edit`, `budgetError`, `save` and `ran` stay. Imports: drop `CONTROL`, `FORM_ERROR`, `FOCUS`, `PRIMARY`; add `import { FORM_ALERT, INPUT, INVALID, NUM, Select, SettingsRow, SettingsSaveBar, SettingsSection, Switch } from '../ui';`. Delete the local constants except `TONES`; add `const BUDGET = `${INPUT} ${INVALID} ${NUM} sm:w-28`;`. The return:

```tsx
  const toneId = `${ids}-tone`;
  return (
    <form onSubmit={(event) => void save(event)} noValidate aria-label={AGENTS.SETTINGS_TITLE} className="flex flex-col gap-6">
      <SettingsSection title={AGENTS.WORKSPACE_AI}>
        <SettingsRow label={AGENTS.AI_SWITCH} hint={AGENTS.AI_DETAIL} hintId={`${ids}-ai-detail`} error={refusal.top.ai_enabled || undefined} errorId={`${ids}-ai-error`}>
          <Switch
            checked={draft.ai_enabled}
            label={AGENTS.AI_SWITCH}
            describedBy={refusal.top.ai_enabled ? `${ids}-ai-detail ${ids}-ai-error` : `${ids}-ai-detail`}
            onChange={(next) => edit((current) => ({ ...current, ai_enabled: next }))}
          >
            {draft.ai_enabled ? AGENTS.ON : AGENTS.OFF}
          </Switch>
        </SettingsRow>
        <SettingsRow label={AGENTS.TONE} htmlFor={toneId} error={refusal.top.tone || undefined} errorId={`${toneId}-error`}>
          <Select
            id={toneId}
            label={AGENTS.TONE}
            labelPosition="external"
            value={draft.tone}
            invalid={Boolean(refusal.top.tone)}
            describedBy={refusal.top.tone ? `${toneId}-error` : undefined}
            onChange={(value) => edit((current) => ({ ...current, tone: value }))}
            options={TONES}
            className="sm:w-56"
          />
        </SettingsRow>
      </SettingsSection>
      {settings.ai_enabled ? null : <AiOffNotice />}
      {AGENT_KINDS.map((kind) => {
        const card = settings.agents.find((c) => c.kind === kind);
        if (!card) return null;
        const budgetId = `${ids}-${kind}-budget`;
        const message = budgetError(kind);
        const serverAgent = refusal.agents[kind];
        const enabledMessage = typeof serverAgent === 'object' ? (serverAgent.enabled ?? null) : null;
        return (
          <AgentCard key={kind} card={card} canRun={canRun} onRan={ran}>
            <SettingsRow label={AGENTS.AGENT_SWITCH} error={enabledMessage || undefined} errorId={`${budgetId}-enabled-error`}>
              <Switch
                checked={draft[kind].enabled}
                label={`${card.label}: ${draft[kind].enabled ? AGENTS.ON : AGENTS.OFF}`}
                describedBy={enabledMessage ? `${budgetId}-enabled-error` : undefined}
                onChange={(next) => edit((current) => ({ ...current, [kind]: { ...current[kind], enabled: next } }), kind)}
              >
                {draft[kind].enabled ? AGENTS.ON : AGENTS.OFF}
              </Switch>
            </SettingsRow>
            <SettingsRow label={AGENTS.BUDGET} htmlFor={budgetId} error={message || undefined} errorId={`${budgetId}-error`}>
              <input
                id={budgetId}
                ref={(node) => {
                  budgets.current[kind] = node;
                }}
                inputMode="numeric"
                aria-label={`Monthly credits for the ${card.label}`}
                value={draft[kind].budget}
                aria-invalid={Boolean(message)}
                aria-describedby={message ? `${budgetId}-error` : undefined}
                onChange={(event) => edit((current) => ({ ...current, [kind]: { ...current[kind], budget: event.target.value } }), kind)}
                className={BUDGET}
              />
            </SettingsRow>
          </AgentCard>
        );
      })}
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
      <SettingsSaveBar dirty={dirty} saving={saving.busy} status={status} />
    </form>
  );
```

`TONES` becomes `const TONES: { value: AgentTone; label: string }[]` (unchanged values; `Select` takes it as options). `save`'s early return while clean stays, and the "Nothing to save" path keeps setting `AGENTS.NO_CHANGES` as the status (the bar shows it).

`src/components/agents/AgentsSummary.tsx`, whole file:

```tsx
import { AGENTS } from '../../features/agents/agentsText';
import type { AgentSettings } from '../../features/agents/agentTypes';
import type { SettingsUpdate } from '../../pages/settings/AgentSettingsFrame';
import { NUM, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../ui';
import { AgentCard } from './AgentCard';
import { AiOffNotice } from './AiOffNotice';

const TONE: Record<AgentSettings['tone'], string> = { professional: 'Professional', friendly: 'Friendly', concise: 'Concise' };

/** Settings › Agents for a member (Decision 7): the values as text in the
 *  same sections, with Run now when the server says `can_run`. */
export function AgentsSummary({ settings, onSaved }: { settings: AgentSettings; onSaved: (next: SettingsUpdate) => void }) {
  const canRun = settings.can_run;
  return (
    <div className="flex flex-col gap-6">
      <SettingsNote icon="lock">{AGENTS.READ_ONLY}</SettingsNote>
      <SettingsSection title={AGENTS.WORKSPACE_AI}>
        <SettingsRow label={AGENTS.AI_SWITCH}>
          <p className={TYPE.body}>{settings.ai_enabled ? AGENTS.ON : AGENTS.OFF}</p>
        </SettingsRow>
        <SettingsRow label={AGENTS.TONE}>
          <p className={TYPE.body}>{TONE[settings.tone]}</p>
        </SettingsRow>
      </SettingsSection>
      {settings.ai_enabled ? null : <AiOffNotice />}
      {settings.agents.map((card) => (
        <AgentCard key={card.kind} card={card} canRun={canRun} onRan={(next) => onSaved((current) => ({ ...current, agents: current.agents.map((c) => (c.kind === next.kind ? next : c)) }))}>
          <SettingsRow label={AGENTS.AGENT_SWITCH}>
            <p className={TYPE.body}>
              {card.enabled ? AGENTS.ON : AGENTS.OFF} · <span className={NUM}>{card.monthly_credits}</span> credits a month
            </p>
          </SettingsRow>
        </AgentCard>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Actions & approvals**

`src/components/agents/ActionsGridSummary.tsx`: `CELL` becomes `` `${TD}` `` with `text-left` (`export const CELL = `${TD} text-left`;`) and `HEAD` becomes `export const HEAD = TH;` (both still exported; `TD`'s `align-middle` keeps fix 6); import `{ SettingsNote, SettingsSection, TABLE, TD, TH, TYPE } from '../ui'`. `ActionsExplained` becomes:

```tsx
/** "What each action does": each kind's label and example, as a list. */
export function ActionsExplained({ settings }: { settings: AgentSettings }) {
  return (
    <SettingsSection title={AGENTS.WHAT_EACH_DOES} list={AGENTS.WHAT_EACH_DOES}>
      {settings.kinds.map((spec) => (
        <li key={spec.kind} className="flex flex-col gap-0.5 px-4 py-3">
          <span className={TYPE.label}>{spec.label}</span>
          <span className={TYPE.bodyMuted}>{spec.example}</span>
        </li>
      ))}
    </SettingsSection>
  );
}
```

and `ActionsGridSummary`'s return:

```tsx
    <div className="flex flex-col gap-6">
      <SettingsNote icon="lock">{AGENTS.READ_ONLY}</SettingsNote>
      <SettingsSection title={AGENTS.GRID_TITLE}>
        <div className="overflow-x-auto">
          <table aria-label={AGENTS.ACTIONS_TITLE} className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={`${HEAD} sticky left-0 bg-surface`}>
                  {AGENTS.ACTION}
                </th>
                {AGENT_KINDS.map((agent) => (
                  <th key={agent} scope="col" className={HEAD}>
                    {AGENT_LABEL[agent]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {settings.kinds.map((spec) => (
                <tr key={spec.kind}>
                  <th scope="row" className={`${CELL} sticky left-0 bg-surface font-semibold`}>
                    {spec.label}
                  </th>
                  {AGENT_KINDS.map((agent) => {
                    const level = usesKind(settings.kinds, agent, spec.kind) ? settings.levels[agent][spec.kind] : undefined;
                    return (
                      <td key={agent} className={level ? CELL : `${CELL} text-ink-muted`}>
                        {level ? LEVEL_LABEL[level] : AGENTS.NOT_USED}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsSection>
      <ActionsExplained settings={settings} />
    </div>
```

(`TD` is `px-4 py-3 text-[13px] leading-5 align-middle`; `text-ink-muted` after it is a colour after a non-`TYPE` string, which is allowed. The rows' borders now come from `divide-y`.)

`src/components/agents/ActionsGridForm.tsx`: state, effect and `save` stay. Imports: drop `FORM_ERROR`, `FOCUS`, `PRIMARY`; add `import { FIELD_ERROR, FORM_ALERT, Select, SettingsSave, SettingsSection, TABLE } from '../ui';`; delete the local `SELECT` (the fix-6 comment moves onto the `Select`'s `className`). The return:

```tsx
  return (
    <form onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-6">
      <SettingsSection
        title={AGENTS.GRID_TITLE}
        description={AGENTS.NEVER_NOTE}
        footer={<SettingsSave dirty={dirty} saving={saving.busy} status={status} />}
      >
        <div className="overflow-x-auto">
          <table aria-label={AGENTS.ACTIONS_TITLE} className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={`${HEAD} sticky left-0 bg-surface`}>
                  {AGENTS.ACTION}
                </th>
                {AGENT_KINDS.map((agent) => (
                  <th key={agent} scope="col" className={HEAD}>
                    {AGENT_LABEL[agent]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {settings.kinds.map((spec) => (
                <tr key={spec.kind}>
                  <th scope="row" className={`${CELL} sticky left-0 min-w-32 bg-surface font-semibold`}>
                    {spec.label}
                  </th>
                  {AGENT_KINDS.map((agent) => {
                    if (!usesKind(settings.kinds, agent, spec.kind)) {
                      return (
                        <td key={agent} className={`${CELL} text-ink-muted`}>
                          {AGENTS.NOT_USED}
                        </td>
                      );
                    }
                    const message = refusal.levels[agent]?.[spec.kind];
                    const options = levelsUpTo(capFor(settings.kinds, spec.kind));
                    const stored = draft[agent][spec.kind] ?? 'ask';
                    const id = `level-${agent}-${spec.kind}`;
                    return (
                      <td key={agent} className={CELL}>
                        {/* UI broken-things fix 6: a fixed 7rem floor holds "Never" and the chevron; the grid scrolls sideways inside its card. */}
                        <Select
                          id={id}
                          label={`${spec.label} for the ${AGENT_LABEL[agent]}`}
                          labelPosition="hidden"
                          value={options.includes(stored) ? stored : options[0]}
                          invalid={Boolean(message)}
                          describedBy={message ? `${id}-error` : undefined}
                          onChange={(level) => {
                            setStatus('');
                            setRefusal(NO_AGENT_REFUSAL);
                            setDraft((current) => ({ ...current, [agent]: { ...current[agent], [spec.kind]: level } }));
                          }}
                          options={options.map((level) => ({ value: level, label: LEVEL_LABEL[level] }))}
                          className="w-28 min-w-28"
                        />
                        {message ? (
                          <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
                            {message}
                          </p>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsSection>
      {refusal.form ? (
        <p role="alert" className={FORM_ALERT}>
          {refusal.form}
        </p>
      ) : null}
      <ActionsExplained settings={settings} />
    </form>
  );
```

(`Select`'s `onChange` hands the value typed as the option values' union: `ActionLevel`. A `hidden` label is `sr-only`, so the cell's accessible name is unchanged. `focusCell` still finds `level-${agent}-${kind}`: `Select` puts `id` on the native select.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/pages/settings/AgentsSettingsPage.test.tsx src/pages/settings/AgentActionsPage.test.tsx src/components/agents src/e2e/agents.test.tsx`
Expected: PASS (keep each updated test's intent; a case that found the AI switch as a checkbox now finds a `switch` button, `toBeChecked` reads its `aria-checked`).

Run: `npm run lint` (expected: clean).

- [ ] **Step 7: Commit**

```bash
git add src/pages/settings/AgentSettingsFrame.tsx src/pages/settings/AgentsSettingsPage.tsx src/pages/settings/AgentActionsPage.tsx \
  src/components/agents/AgentCard.tsx src/components/agents/AgentsForm.tsx src/components/agents/AgentsSummary.tsx \
  src/components/agents/ActionsGridForm.tsx src/components/agents/ActionsGridSummary.tsx src/components/agents/AiOffNotice.tsx \
  src/features/agents/agentsText.ts src/pages/settings/AgentsSettingsPage.test.tsx src/pages/settings/AgentActionsPage.test.tsx \
  src/components/agents/houseRules.test.ts
git add <src/e2e/agents.test.tsx if Step 6 changed it>
git commit -m "feat(settings): Agents settings on the settings frame

AgentSettingsFrame is a thin data wrapper; each agent is a section with
Run now on its heading row and its switch and credits as rows; the AI
switch and every agent switch use the ui Switch, the selects the ui
Select; Actions & approvals sits flush in its section with Save in the
footer, and What each action does is a list.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: General and Defaults (Currency, Exchange rates, New organisations)

**Files:**
- Modify: `src/pages/settings/{GeneralSettingsPage,DefaultsPage,CurrencySection,LifecycleDefaultSection}.tsx`
- Test (update): `src/pages/settings/{GeneralSettingsPage,DefaultsPage,CurrencySection,LifecycleDefaultSection}.test.tsx`

**Interfaces:**
- Consumes: `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsSave`, `SettingsNote`, `Select`, `INPUT`, `INVALID`, `NUM`, `CODE`, `PRIMARY`, `QUIET`, `BUTTON`, `ICON_BUTTON`, `ROW_ACTIONS`, `OverflowMenu`, `FIELD_ERROR`, `FORM_ALERT`, `LoadingState`, `ErrorState`, `EmptyState`, `TYPE` (ui); `settingsTitle`.
- Produces: `CurrencySection` returns two sibling sections ("Currency", and for admins "Exchange rates"); `LifecycleDefaultSection` returns one ("New organisations"). Both keep their exports and their own Save.

Why: spec §6.3 (rows in sections; one primary per form in its footer; the "Default Lifecycle Stage" uppercase label and the tinted info box; the read-only notice once), §7 (the amber permission box and the green "Saved." are not status), §3 (the preview figure in `NUM`, the slug in `CODE`).

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/settings/GeneralSettingsPage.test.tsx` (it already defines `alice`, `bob`, `person`, `ALICE_OWNS`, `BOB_OWNS`, `jsonResponse`, `renderPage` and `stubServer`):

```tsx
describe('General on the settings frame (UI foundations spec §6.3)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('heads the page from the nav and shows the workspace as rows, the slug as code', async () => {
    stubServer(() => alice);
    renderPage(alice);
    expect(screen.getByRole('heading', { level: 1, name: 'General' })).toHaveClass('text-[22px]', 'font-semibold');
    const workspace = screen.getByRole('region', { name: 'Workspace' });
    expect(within(workspace).getByText('acme-inc')).toHaveClass('font-mono-brand');
    expect(within(workspace).getByText('Name')).toHaveClass('text-[13px]', 'font-semibold');
    await screen.findByRole('option', { name: 'Bob Builder' });
  });

  it('keeps the ownership status region one node while the transfer turns the owner into a member', async () => {
    let owner = ALICE_OWNS;
    stubServer(
      () => (owner.id === 1 ? alice : person({ is_owner: false, organisation: { ...alice.organisation, owner: BOB_OWNS } })),
      () => {
        owner = BOB_OWNS;
        return jsonResponse(200, { owner: { id: 2, name: 'Bob Builder' } });
      },
    );
    const user = userEvent.setup();
    renderPage(alice);
    const ownership = screen.getByRole('region', { name: 'Ownership' });
    const region = within(ownership).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    const picker = screen.getByRole('combobox', { name: 'New owner' });
    await within(picker).findByRole('option', { name: 'Bob Builder' });
    await user.selectOptions(picker, 'Bob Builder');
    await user.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer' }));
    await waitFor(() => expect(region).toHaveTextContent('Ownership passed to Bob Builder.'));
    expect(within(screen.getByRole('region', { name: 'Ownership' })).getByRole('status')).toBe(region);
    expect(screen.queryByRole('button', { name: 'Transfer ownership' })).toBeNull();
  });
});
```

In `src/pages/settings/DefaultsPage.test.tsx`, "tells a member without manage_org_settings once…": the notice is now `screen.getByText("You don't have permission to change this.").closest('[data-part="settings-note"]')`, assert it `not.toHaveClass('bg-warning-dim')` and that its `svg` is the lock (`toHaveClass('text-ink-faint')`); "renders Currency, then New organisations, under one h1" asserts `getAllByRole('heading', { level: 2 }).map((h) => h.textContent)` equals `['Currency', 'New organisations']` for a member and `['Currency', 'Exchange rates', 'New organisations']` for an admin.

Append to `src/pages/settings/CurrencySection.test.tsx` (it defines `jsonResponse`, `makeStore` and `renderPage`; add `waitFor` and `within` to its testing-library import):

```tsx
const EUR_RATE = { id: 1, currency: 'EUR', currency_display: 'Euro (€)', rate_to_org_currency: '1.080000', updated_at: '2026-09-04T00:00:00Z' };
const rateLine = (text: string) => (_: string, element: Element | null) => element?.tagName === 'P' && element.textContent === text;

describe('Currency on the settings frame (UI foundations spec §6.3, §7)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts the currency in a row with the preview figure, and Save in the section footer beside a status region that stays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: { method?: string }) =>
        Promise.resolve(
          options?.method === 'PATCH'
            ? jsonResponse(200, { id: 1, name: 'Acme Inc', slug: 'acme-inc', currency: 'GBP', currency_display: 'British Pound (£)', default_lifecycle_stage: '' })
            : jsonResponse(200, []),
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'USD'));
    const currency = screen.getByRole('region', { name: 'Currency' });
    expect(within(currency).getByLabelText('Currency')).toHaveClass('appearance-none');
    expect(within(currency).getByText('$12,345.00')).toHaveClass('tabular-nums');
    const region = within(currency).getByRole('status');
    await user.selectOptions(within(currency).getByLabelText('Currency'), 'GBP');
    await user.click(within(currency).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(region).toHaveTextContent('Saved.'));
    expect(region).not.toHaveClass('text-success');
    expect(within(screen.getByRole('region', { name: 'Currency' })).getByRole('status')).toBe(region);
  });

  it('lists exchange rates as rows with Edit shown on hover and Delete last in the row menu', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [EUR_RATE]))));
    const user = userEvent.setup();
    renderPage(makeStore('admin', 'USD'));
    const rates = await screen.findByRole('list', { name: 'Exchange rates' });
    const row = within(rates).getByText(rateLine('1 EUR = 1.080000 USD')).closest('li')!;
    expect(within(row).getByText('1.080000')).toHaveClass('tabular-nums');
    expect(within(row).getByRole('button', { name: 'Edit rate for EUR' }).parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
    await user.click(within(row).getByRole('button', { name: 'More actions for EUR' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.at(-1)).toHaveTextContent('Delete');
    expect(items.at(-1)).toHaveClass('text-danger-ink');
  });
});
```

Existing cases: "lists configured rates" finds the line with `screen.findByText(rateLine('1 EUR = 1.080000 USD'))` (the figure is its own `NUM` span now); selecting by option text reads `USD: US Dollar ($)` where a case used the label (the em dash goes; by value is unchanged); the CSM case's `queryByText('Exchange Rates')` becomes `queryByRole('region', { name: 'Exchange rates' })`; the warning that saving clears rates is a `SettingsNote icon="warning"` (assert its text and `closest('[data-part="settings-note"]')`); the delete case opens `More actions for EUR` and picks Delete before confirming; the edit case's "Save rate" and "Cancel editing" names are unchanged.

In `src/pages/settings/LifecycleDefaultSection.test.tsx`: find the select by its label `Default lifecycle stage` (was `Default Lifecycle Stage — new Organizations`), and add to "an admin can change and save the default stage" a check that `screen.getByRole('status')` holds `Saved.` and is `not.toHaveClass('text-success')`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/GeneralSettingsPage.test.tsx src/pages/settings/DefaultsPage.test.tsx src/pages/settings/CurrencySection.test.tsx src/pages/settings/LifecycleDefaultSection.test.tsx`
Expected: FAIL.

- [ ] **Step 3: General**

`src/pages/settings/GeneralSettingsPage.tsx`: hooks, effects and `handleTransfer` unchanged. Imports: drop `ConfirmDialog`'s neighbours `PRIMARY` (portfolio) and `CODE` (ui/styles path); add `import { CODE, PRIMARY, Select, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';` and `import { settingsTitle } from './workspaceSettingsNav';`; delete `SELECT` and `DetailRow`. The return:

```tsx
  return (
    <SettingsFrame title={settingsTitle('/settings/general')} intro="This workspace, and who owns it.">
      <SettingsSection title="Workspace">
        <SettingsRow label="Name">
          <p className={TYPE.body}>{organisation.name}</p>
        </SettingsRow>
        <SettingsRow label="Slug">
          <p className={`${TYPE.body} ${CODE}`}>{organisation.slug}</p>
        </SettingsRow>
        <SettingsRow label="Owner">
          <p className={TYPE.body}>{ownerName ?? 'Not set'}</p>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Ownership"
        headingRef={ownershipHeadingRef}
        footer={
          <>
            {/* Outside the owner branch: the transfer makes this person a member, and the news must survive that. */}
            <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
              {passedTo ? `Ownership passed to ${passedTo}.` : ''}
            </p>
            {isOwner ? (
              <button type="button" disabled={!picked} onClick={() => setIsConfirming(true)} className={PRIMARY}>
                Transfer ownership
              </button>
            ) : null}
          </>
        }
      >
        {isOwner ? (
          <SettingsRow
            label="New owner"
            htmlFor={pickerId}
            hint="An active member other than you. You keep your role."
            error={error ?? (membersFailed ? 'Could not load members.' : undefined)}
            errorId={`${pickerId}-error`}
          >
            <Select
              id={pickerId}
              label="New owner"
              labelPosition="external"
              value={pickedId}
              invalid={Boolean(error)}
              describedBy={error || membersFailed ? `${pickerId}-error` : undefined}
              onChange={setPickedId}
              options={[{ value: '', label: 'Choose a member' }, ...candidates.map((member) => ({ value: String(member.id), label: member.name }))]}
              className="sm:max-w-sm"
            />
          </SettingsRow>
        ) : (
          <div className="px-4 py-3">
            <SettingsNote icon="lock">{ownerName ? `Only the owner, ${ownerName}, can hand the workspace on.` : 'Only the owner can hand the workspace on.'}</SettingsNote>
          </div>
        )}
      </SettingsSection>

      {isConfirming && picked && (
        <ConfirmDialog
          title={`Transfer ownership to ${picked.name}?`}
          message={`${picked.name} becomes the owner of ${organisation.name}. You keep your role but lose the owner's rights.`}
          confirmLabel="Transfer"
          onConfirm={() => handleTransfer(picked.id, picked.name)}
          onClose={() => setIsConfirming(false)}
        />
      )}
    </SettingsFrame>
  );
```

(The focus effect on `passedTo` still sends focus to the Ownership heading, now the section's `h2` through `headingRef`. The test "shows the server's message below the picker" now finds it as the row's `alert`.)

- [ ] **Step 4: Defaults, Currency, Exchange rates, New organisations**

`src/pages/settings/DefaultsPage.tsx`, whole file:

```tsx
import { useCapability } from '../../hooks';
import { SettingsFrame, SettingsNote } from '../../components/ui';
import { CurrencySection } from './CurrencySection';
import { LifecycleDefaultSection } from './LifecycleDefaultSection';
import { settingsTitle } from './workspaceSettingsNav';

/** Settings › Data › Defaults (settings spec 2026-10-06 §3.2): the
 *  workspace's currency with its FX rates, then what a new organisation
 *  starts as. Each section keeps its own Save; both need
 *  manage_org_settings, so one note under the heading says so. */
export function DefaultsPage() {
  const canEdit = useCapability('manage_org_settings');
  return (
    <SettingsFrame
      title={settingsTitle('/settings/defaults')}
      intro="What the workspace assumes until a record says otherwise."
      note={canEdit ? undefined : <SettingsNote icon="lock">You don't have permission to change this.</SettingsNote>}
    >
      <CurrencySection />
      <LifecycleDefaultSection />
    </SettingsFrame>
  );
}
```

`src/pages/settings/CurrencySection.tsx`: every state, effect and handler stays (rewrite its comments without em dashes: "Real, admin-gated persistence via Organisation.currency; the preview uses the same currency-aware formatMoney() that backs every money value. Exchange rates are Tier 1's admin-maintained FX table (fxRatesApi.ts, the backend's services.fx_rates)."). Imports: drop `ShieldAlert`, `Plus` stays, `Pencil`, `Check`, `X` stay, `Trash2` goes; add `import { BUTTON, EmptyState, ErrorState, FIELD_ERROR, FORM_ALERT, ICON_BUTTON, INPUT, INVALID, LoadingState, NUM, OverflowMenu, PRIMARY, QUIET, ROW_ACTIONS, Select, SettingsNote, SettingsRow, SettingsSave, SettingsSection, TYPE } from '../../components/ui';`. Add `function cancelAdd() { setShowAddRate(false); setAddRateError(null); }`. The return:

```tsx
  const rateCount = rates.length;
  return (
    <>
      <SettingsSection
        title="Currency"
        description="The billing currency this organisation operates in."
        footer={isAdmin ? <SettingsSave dirty={isDirty} saving={isSaving} status={!isDirty && savedAt ? 'Saved.' : ''} onSave={() => void handleSave()} label="Save" /> : undefined}
      >
        <SettingsRow label="Currency" htmlFor="currency-select">
          <Select
            id="currency-select"
            label="Currency"
            labelPosition="external"
            value={selected}
            disabled={!isAdmin}
            onChange={setSelected}
            options={CURRENCY_OPTIONS.map((c) => ({ value: c.code, label: `${c.code}: ${c.label} (${c.symbol})` }))}
            className="sm:max-w-xs"
          />
        </SettingsRow>
        <SettingsRow label="Preview">
          <p className={`${TYPE.body} ${NUM}`}>{formatMoney(12345, selected)}</p>
        </SettingsRow>
        {isDirty && rateCount > 0 ? (
          <div className="px-4 py-3">
            <SettingsNote icon="warning">
              Saving clears your {rateCount} exchange rate{rateCount === 1 ? '' : 's'}: they are no longer valid for a different base currency.
            </SettingsNote>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
            {error}
          </p>
        ) : null}
      </SettingsSection>

      {isAdmin ? (
        <SettingsSection
          title="Exchange rates"
          description={`A customer can bill in its own currency; these rates convert those amounts into ${savedCurrency} for the totals.`}
          action={
            availableCurrencies.length > 0 && !showAddRate ? (
              <button type="button" onClick={() => setShowAddRate(true)} className={BUTTON}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add rate
              </button>
            ) : undefined
          }
          list="Exchange rates"
          state={
            ratesLoading ? (
              <LoadingState label="Loading exchange rates" count={2} />
            ) : ratesError ? (
              <ErrorState message={ratesError} />
            ) : rates.length === 0 && !showAddRate ? (
              <EmptyState size="inline" title={`No exchange rates yet: every customer is assumed to bill in ${savedCurrency}.`} />
            ) : undefined
          }
        >
          {showAddRate ? (
            <li className="px-4 py-3">
              <form
                aria-label="New exchange rate"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleAddRate();
                }}
                className="flex flex-wrap items-end gap-3"
              >
                <Select
                  label="Currency"
                  value={newRateCurrency}
                  onChange={setNewRateCurrency}
                  options={[{ value: '', label: 'Choose…' }, ...availableCurrencies.map((c) => ({ value: c.code, label: c.code }))]}
                  className="w-32"
                />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="new-rate-value" className={TYPE.label}>
                    1 {newRateCurrency || 'unit'} in {savedCurrency}
                  </label>
                  <input
                    id="new-rate-value"
                    type="number"
                    step="any"
                    value={newRateValue}
                    onChange={(event) => setNewRateValue(event.target.value)}
                    aria-invalid={Boolean(addRateError)}
                    aria-describedby={addRateError ? 'new-rate-error' : undefined}
                    className={`${INPUT} ${INVALID} ${NUM} w-32`}
                  />
                </div>
                <button type="button" onClick={cancelAdd} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" disabled={!newRateCurrency || !newRateValue.trim() || isAddingRate} className={PRIMARY}>
                  {isAddingRate ? 'Adding…' : 'Add rate'}
                </button>
              </form>
              {addRateError ? (
                <p id="new-rate-error" role="alert" className={FIELD_ERROR}>
                  {addRateError}
                </p>
              ) : null}
            </li>
          ) : null}
          {rates.map((rate) => (
            <li key={rate.id} className="group relative flex min-h-14 flex-wrap items-center gap-3 px-4 py-3">
              {editingRateId === rate.id ? (
                <>
                  <label htmlFor={`rate-${rate.id}`} className={TYPE.body}>
                    1 {rate.currency} =
                  </label>
                  <input
                    id={`rate-${rate.id}`}
                    type="number"
                    step="any"
                    value={editRateValue}
                    onChange={(event) => setEditRateValue(event.target.value)}
                    autoFocus
                    aria-invalid={Boolean(editRateError)}
                    aria-describedby={editRateError ? `rate-${rate.id}-error` : undefined}
                    className={`${INPUT} ${INVALID} ${NUM} w-28`}
                  />
                  <span className={TYPE.bodyMuted}>{savedCurrency}</span>
                  <button type="button" onClick={() => void handleSaveEdit(rate.id)} aria-label="Save rate" className={ICON_BUTTON}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setEditingRateId(null)} aria-label="Cancel editing" className={ICON_BUTTON}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {editRateError ? (
                    <p id={`rate-${rate.id}-error`} role="alert" className={`w-full ${FIELD_ERROR}`}>
                      {editRateError}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className={`min-w-0 flex-1 ${TYPE.body}`}>
                    1 {rate.currency} = <span className={NUM}>{rate.rate_to_org_currency}</span> {savedCurrency}
                  </p>
                  <div className={ROW_ACTIONS}>
                    <button type="button" onClick={() => startEditing(rate)} aria-label={`Edit rate for ${rate.currency}`} className={ICON_BUTTON}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <OverflowMenu label={`More actions for ${rate.currency}`} items={[{ key: 'delete', label: 'Delete', onSelect: () => setDeleteTarget(rate), danger: true }]} />
                  </div>
                </>
              )}
            </li>
          ))}
        </SettingsSection>
      ) : null}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this exchange rate?"
          message={`Customers billing in ${deleteTarget.currency} are left out of MRR and ARR totals until a new rate is added.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteFxRate(deleteTarget.id);
            setRates((current) => current.filter((r) => r.id !== deleteTarget.id));
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
```

(`CURRENCY_OPTIONS`' code type is `CurrencyCode`, so `Select`'s `onChange` hands `setSelected` a `CurrencyCode`; `setNewRateCurrency` takes `CurrencyCode | ''`.)

`src/pages/settings/LifecycleDefaultSection.tsx`: state and `handleSave` stay; imports: drop `Info`; add `import { FORM_ALERT, Select, SettingsRow, SettingsSave, SettingsSection } from '../../components/ui';`. The comment's "Settings › Data › Defaults › New organisations" sentence stays; the return:

```tsx
  return (
    <SettingsSection
      title="New organisations"
      description="Applied when a new organisation is created; you can still change it on each one."
      footer={isAdmin ? <SettingsSave dirty={isDirty} saving={isSaving} status={!isDirty && savedAt ? 'Saved.' : ''} onSave={() => void handleSave()} label="Save" /> : undefined}
    >
      <SettingsRow label="Default lifecycle stage" htmlFor="default-stage-select" hint="Add organization starts here. Any organisation can still start at another stage." hintId="default-stage-hint">
        <Select
          id="default-stage-select"
          label="Default lifecycle stage"
          labelPosition="external"
          value={selected}
          disabled={!isAdmin}
          describedBy="default-stage-hint"
          onChange={setSelected}
          options={[{ value: '', label: 'No default (starts at Onboarding)' }, ...STAGE_OPTIONS.map((stage) => ({ value: stage, label: LIFECYCLE_LABELS[stage] }))]}
          className="sm:max-w-sm"
        />
      </SettingsRow>
      {error ? (
        <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
          {error}
        </p>
      ) : null}
    </SettingsSection>
  );
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/pages/settings/GeneralSettingsPage.test.tsx src/pages/settings/DefaultsPage.test.tsx src/pages/settings/CurrencySection.test.tsx src/pages/settings/LifecycleDefaultSection.test.tsx`
Expected: PASS.

Run: `npm run lint` (expected: clean).

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings/GeneralSettingsPage.tsx src/pages/settings/DefaultsPage.tsx src/pages/settings/CurrencySection.tsx src/pages/settings/LifecycleDefaultSection.tsx \
  src/pages/settings/GeneralSettingsPage.test.tsx src/pages/settings/DefaultsPage.test.tsx src/pages/settings/CurrencySection.test.tsx src/pages/settings/LifecycleDefaultSection.test.tsx
git commit -m "feat(settings): General and Defaults on the settings frame

General shows the workspace as rows and keeps its transfer news in a
status region that survives the owner becoming a member; Defaults puts
the currency, the exchange rates and the new-organisation stage in
sections with their own Save, the read-only notice once, quietly.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Plan & billing: a workspace page on the primitives (the account copy stays as it is)

**Files:**
- Create: `src/pages/settings/PlanBillingPage.tsx`, `src/pages/settings/PlanBillingPage.test.tsx`
- Modify: `src/pages/settings/routes.tsx`
- Not touched: `src/pages/settings/BillingSettingsPage.tsx` and its test (they render `/account-settings/billing`)

**Interfaces:**
- Consumes: the billing slice (`fetchBillingSummary`, `fetchPlans`, `fetchBillingLedger`, `BillingSummary`); `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsNote`, `Tile`, `tileRow`, `Badge`, `MetaParts`, `Card`, `LoadingState`, `ErrorState`, `EmptyState`, `TABLE`, `TH`, `TD`, `TD_NUM`, `NUM`, `FORM_ALERT`, `TYPE` (ui).
- Produces: `PlanBillingPage` (named export) at `/settings/billing`; `routes.tsx` routes it with no wrapper.

Why: spec §9.1 ("`routes.tsx` Billing `p-6 max-w-4xl`" → `SettingsFrame`), §4.3 (seats and credits are KPI tiles), §4.2 (Credit history is a log: a flush table), §7 (status tones). The owner's rule that account settings are untouched means `BillingSettingsPage` cannot change, so the workspace route gets its own page reading the same slice.

| Part | Rule |
|---|---|
| Tiles | "Seats" (`3 of 3`, meta "Every seat is taken…" or "2 free."), "AI credits" (balance, meta "One credit per Copilot or agent call…"), in `tileRow(2)` under the heading |
| Current plan | section with the status `Badge` as its action: Trial neutral, Active success `dot`, Past due warning, Canceled danger; rows Plan, Price, Period ends; the beta note |
| Plans | a list: name, meta "10 seats · 2,000 AI credits a month", the price (`NUM`) trailing; the current one marked by a neutral "Current plan" badge (no accent border) |
| Credit history | admins only; the table flush in its card; sentence-case headers; Change and Balance right-aligned in `NUM`; no green on credits |

- [ ] **Step 1: Write the failing test**

Create `src/pages/settings/PlanBillingPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { type User } from '../../features/auth/authSlice';
import billingReducer from '../../features/billing/billingSlice';
import { PlanBillingPage } from './PlanBillingPage';

const summary = {
  plan: { code: 'trial', name: 'Trial', seats_included: 3, monthly_credits: 200, price_cents: 0, currency: 'USD', is_trial: true },
  status: 'trialing',
  seats: { used: 3, limit: 3 },
  credits: { balance: 0 },
  trial_ends_at: '2026-10-05T00:00:00Z',
  current_period_end: null,
  enforced: true,
};
const TEAM = { code: 'team', name: 'Team', seats_included: 10, monthly_credits: 2000, price_cents: 4900, currency: 'USD' };
const LEDGER = [{ id: 1, kind: 'grant', amount: 200, balance_after: 200, reason: 'Trial', actor: null, at: '2026-09-21T00:00:00Z' }];

function jsonResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

function stub({ ledger = true, account = 200 }: { ledger?: boolean; account?: number } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/billing/account/')) return account === 200 ? jsonResponse(200, summary) : jsonResponse(account, { detail: 'Could not load the plan.' });
    if (url.includes('/billing/plans/')) return jsonResponse(200, [TEAM]);
    if (url.includes('/billing/ledger/') && ledger) return jsonResponse(200, LEDGER);
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(permissions: string[]) {
  const user = { id: 1, email: 'a@acme.io', name: 'A', permissions, organisation: { id: 1, name: 'Acme', slug: 'acme' }, is_active: true } as unknown as User;
  const store = configureStore({
    reducer: { auth: authReducer, billing: billingReducer },
    preloadedState: { auth: { user, accessToken: 'a', refreshToken: 'r', isAuthenticated: true, isLoading: false, error: null } },
  });
  render(
    <Provider store={store}>
      <PlanBillingPage />
    </Provider>,
  );
}

describe('Settings › Plan & billing (UI foundations spec §6.3, §9.1)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('heads the page from the nav, shows seats and credits as tiles, and the plan status as a neutral trial badge', async () => {
    stub();
    renderPage(['manage_org_settings']);
    expect(screen.getByRole('heading', { level: 1, name: 'Plan & billing' })).toHaveClass('text-[22px]', 'font-semibold');
    const seats = await screen.findByRole('group', { name: 'Seats' });
    expect(within(seats).getByText('3')).toHaveClass('tabular-nums');
    expect(within(seats).getByText(/Every seat is taken/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'AI credits' })).toHaveTextContent('None left: the Copilot will refuse');
    const plan = screen.getByRole('region', { name: 'Current plan' });
    expect(within(plan).getByText('Trial', { selector: 'span' })).toHaveClass('bg-subtle', 'text-ink-muted');
  });

  it('lists the plans with the current one marked by a neutral badge, and the credit history flush in its card', async () => {
    stub();
    renderPage(['manage_org_settings']);
    const plans = await screen.findByRole('list', { name: 'Plans' });
    expect(within(plans).getByText('Team')).toBeInTheDocument();
    expect(within(plans).getByText('$49')).toHaveClass('tabular-nums');
    const table = await screen.findByRole('table', { name: 'Credit history' });
    expect(table.closest('.rounded-xl')).not.toBeNull();
    expect(within(table).getByRole('columnheader', { name: 'Change' })).toHaveClass('text-right');
    expect(within(table).getByText('+200')).not.toHaveClass('text-success');
  });

  it('hides the credit history from someone without manage_org_settings and never asks for it', async () => {
    const fetchMock = stub({ ledger: false });
    renderPage([]);
    await screen.findByRole('region', { name: 'Current plan' });
    expect(screen.queryByRole('region', { name: 'Credit history' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/billing/ledger/'), expect.anything());
  });

  it('shows a failed read inside a card, with nothing partial', async () => {
    stub({ account: 500 });
    renderPage([]);
    const alert = await screen.findByRole('alert');
    expect(alert.closest('.rounded-xl')).not.toBeNull();
    expect(screen.queryByRole('group', { name: 'Seats' })).toBeNull();
  });
});
```

(If the plans fetch formats `$49` as `$49.00` in jsdom's locale, match what `money()` returns; it uses `maximumFractionDigits: 0`.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/settings/PlanBillingPage.test.tsx`
Expected: FAIL (no such module).

- [ ] **Step 3: Implement**

`src/pages/settings/PlanBillingPage.tsx`:

```tsx
// Settings › Workspace › Plan & billing: what this workspace has and has used
// (UI foundations spec §6.3, §9.1). Every number is the server's. Seats are
// people (an active member holds one); credits are AI (one per model call).
// /account-settings/billing keeps BillingSettingsPage, untouched until the
// account settings round; both read the same billing slice.

import { useEffect } from 'react';
import { CalendarClock } from 'lucide-react';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { fetchBillingLedger, fetchBillingSummary, fetchPlans, type BillingSummary } from '../../features/billing/billingSlice';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  FORM_ALERT,
  LoadingState,
  MetaParts,
  NUM,
  SettingsFrame,
  SettingsNote,
  SettingsRow,
  SettingsSection,
  TABLE,
  TD,
  TD_NUM,
  TH,
  TYPE,
  Tile,
  tileRow,
  type BadgeTone,
} from '../../components/ui';
import { settingsTitle } from './workspaceSettingsNav';

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
}

const KIND_LABEL: Record<string, string> = {
  grant: 'Granted',
  consume: 'Model call',
  refund: 'Refunded',
  adjust: 'Adjusted by Revenact',
  expire: 'Expired',
};

/** Status colour only for real status (spec §7): a trial is neutral. */
const STATUS: Record<BillingSummary['status'], { label: string; tone: BadgeTone; dot?: boolean }> = {
  trialing: { label: 'Trial', tone: 'neutral' },
  active: { label: 'Active', tone: 'success', dot: true },
  past_due: { label: 'Past due', tone: 'warning' },
  canceled: { label: 'Canceled', tone: 'danger' },
};

export function PlanBillingPage() {
  const dispatch = useAppDispatch();
  const { summary, ledger, plans, error } = useAppSelector((state) => state.billing);
  const canSeeLedger = useCapability('manage_org_settings');

  useEffect(() => {
    dispatch(fetchBillingSummary());
    dispatch(fetchPlans());
    if (canSeeLedger) dispatch(fetchBillingLedger());
  }, [dispatch, canSeeLedger]);

  const title = settingsTitle('/settings/billing');
  const intro = 'What this workspace has and has used.';
  if (!summary) {
    return (
      <SettingsFrame title={title} intro={intro}>
        <Card pad="none">{error ? <ErrorState message={error} /> : <LoadingState label="Loading the plan" variant="block" />}</Card>
      </SettingsFrame>
    );
  }

  const full = summary.seats.used >= summary.seats.limit;
  const seatPct = summary.seats.limit > 0 ? Math.min(100, Math.round((summary.seats.used / summary.seats.limit) * 100)) : 0;
  const trialEnds = when(summary.trial_ends_at);
  const status = STATUS[summary.status];
  return (
    <SettingsFrame title={title} intro={intro}>
      {/* A later read (the ledger) failed: say so above what did load. */}
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
      <div className={tileRow(2)}>
        <Tile
          label="Seats"
          value={
            <>
              <span className={NUM}>{summary.seats.used}</span> <span className={TYPE.bodyMuted}>of {summary.seats.limit}</span>
            </>
          }
          meta={full ? 'Every seat is taken. Free one, or upgrade, before approving anyone else.' : `${summary.seats.limit - summary.seats.used} free.`}
        >
          <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-subtle">
            <span className={`block h-full rounded-full ${full ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${seatPct}%` }} />
          </span>
        </Tile>
        <Tile
          label="AI credits"
          value={<span className={NUM}>{summary.credits.balance}</span>}
          meta={`One credit per Copilot or agent call. A failed call costs nothing.${summary.credits.balance === 0 ? ' None left: the Copilot will refuse until credits are added.' : ''}`}
        />
      </div>

      <SettingsSection
        title="Current plan"
        action={
          <Badge tone={status.tone} dot={status.dot}>
            {status.label}
          </Badge>
        }
      >
        <SettingsRow label="Plan">
          <p className={TYPE.body}>{summary.plan.name}</p>
        </SettingsRow>
        <SettingsRow label="Price">
          <p className={TYPE.body}>
            {summary.plan.is_trial ? (
              trialEnds ? (
                `Free until ${trialEnds}. Seats stay at ${summary.plan.seats_included} until a plan is bought.`
              ) : (
                'Free while you evaluate.'
              )
            ) : (
              <MetaParts
                parts={[
                  <>
                    <span className={NUM}>{money(summary.plan.price_cents, summary.plan.currency)}</span> a month
                  </>,
                  <>
                    <span className={NUM}>{summary.plan.seats_included}</span> seats
                  </>,
                  <>
                    <span className={NUM}>{summary.plan.monthly_credits}</span> AI credits a month
                  </>,
                ]}
              />
            )}
          </p>
        </SettingsRow>
        {summary.current_period_end ? (
          <SettingsRow label="Period ends">
            <p className={`flex items-center gap-1.5 ${TYPE.body}`}>
              <CalendarClock className="h-4 w-4 text-ink-faint" aria-hidden="true" />
              {when(summary.current_period_end)}
            </p>
          </SettingsRow>
        ) : null}
        {summary.enforced ? null : (
          <div className="px-4 py-3">
            <SettingsNote>Limits are recorded but not enforced during the beta.</SettingsNote>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Plans"
        description="Online checkout is coming. To change plans today, contact Revenact and it is applied to your account the same day."
        list="Plans"
        state={plans.length === 0 ? <EmptyState size="inline" title="No plans are published yet." /> : undefined}
      >
        {plans.map((plan) => (
          <li key={plan.code} className="flex min-h-14 items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <p className={`${TYPE.body} font-semibold`}>{plan.name}</p>
              <p className={TYPE.meta}>
                <MetaParts
                  parts={[
                    <>
                      <span className={NUM}>{plan.seats_included}</span> seats
                    </>,
                    <>
                      <span className={NUM}>{plan.monthly_credits}</span> AI credits a month
                    </>,
                  ]}
                />
              </p>
            </div>
            {plan.code === summary.plan.code ? <Badge>Current plan</Badge> : null}
            <p className={TYPE.body}>
              <span className={NUM}>{money(plan.price_cents, plan.currency)}</span>
              <span className={TYPE.meta}> a month</span>
            </p>
          </li>
        ))}
      </SettingsSection>

      {canSeeLedger ? (
        <SettingsSection
          title="Credit history"
          description="Every movement, newest first. Your balance is computed from this record."
          state={ledger.length === 0 ? <EmptyState size="inline" title="Nothing yet." /> : undefined}
        >
          <div className="overflow-x-auto">
            <table aria-label="Credit history" className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    When
                  </th>
                  <th scope="col" className={TH}>
                    What
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Change
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td className={`${TD} whitespace-nowrap text-ink-muted ${NUM}`}>{new Date(row.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className={TD}>
                      <MetaParts parts={[KIND_LABEL[row.kind] ?? row.kind, row.reason]} />
                    </td>
                    <td className={TD_NUM}>{row.amount > 0 ? `+${row.amount}` : row.amount}</td>
                    <td className={TD_NUM}>{row.balance_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsSection>
      ) : null}
    </SettingsFrame>
  );
}
```

(`Tile`'s `role="group"` is named by its label, so the test finds "Seats" and "AI credits". The seat bar's danger fill is the one status colour here: a limit reached. `Tile` children are its breakdown slot; a decorative bar belongs there.)

`src/pages/settings/routes.tsx`: import `PlanBillingPage` from `'./PlanBillingPage'` (drop the `BillingSettingsPage` import), delete the comment "Billing leans on account settings' frame for its padding.", and route `<Route path="billing" element={el(<PlanBillingPage />)} />`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/pages/settings/PlanBillingPage.test.tsx src/pages/settings/BillingSettingsPage.test.tsx src/pages/settings/routes.test.tsx`
Expected: PASS (the account page's own test is unchanged and still passes: proof its output did not move).

Run: `npm run lint` (expected: clean).

- [ ] **Step 5: Commit**

```bash
git add src/pages/settings/PlanBillingPage.tsx src/pages/settings/PlanBillingPage.test.tsx src/pages/settings/routes.tsx
git commit -m "feat(settings): Plan & billing on the settings frame

/settings/billing gets its own page on the primitives: seats and credits
as tiles, the plan with a status badge whose tone follows real status,
the plans as a list and the credit history flush in its card. The
account settings copy keeps its look until its own round.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Products and Imports

**Files:**
- Modify: `src/pages/settings/{ProductsPage,EntityUploadsPage}.tsx`
- Test (update): `src/pages/settings/{ProductsPage,EntityUploadsPage}.test.tsx`

**Interfaces:**
- Consumes: `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsNote`, `MetaParts`, `Badge`, `BUTTON`, `PRIMARY`, `QUIET`, `ICON_BUTTON`, `ROW_ACTIONS`, `OverflowMenu`, `INPUT`, `INVALID`, `FIELD_ERROR`, `FORM_ALERT`, `Select`, `TABLE`, `TH`, `TD`, `TD_NUM`, `NUM`, `LoadingState`, `ErrorState`, `EmptyState`, `TYPE` (ui); `settingsTitle`.
- Produces: nothing new.

Why: spec §6.3 (sections, rows, one primary per form, the read-only note once), §4.2 (a list is one card of rows; Imports' mapping and results are tables flush in their card), §5.1 (the opener is a `BUTTON`), §7 (Retired is neutral; a failed import row is real status), §4.1 (no fixed `max-h-96` card height: a long result list ends in "Show all" inside the card).

| Products | Layout |
|---|---|
| Heading | `settingsTitle('/settings/products')`, intro "What this organisation sells: the list every product picker and the Product Usage dashboard read from.", the lock note for non-managers |
| New product | a section shown while adding: one stacked row "Name" (`INPUT`), footer QUIET Cancel + PRIMARY Add |
| Catalogue | section with `action` BUTTON "Add product" (managers, while not adding); description "Names are unique, ignoring case. Renaming a product renames it on every customer at once." plus, when any are retired, " Retired products stay on the customers already recorded against them and on the Product Usage dashboard; they are only hidden from the pickers."; `list="Products"`; each row: name (no strike-through), a neutral "Retired" badge, meta "5 customers" / "Nobody on it"; `ROW_ACTIONS`: Rename (`ICON_BUTTON`) and `More actions for <name>` (Retire or Bring back, then Delete last in danger, only when nobody is on it) |

| Imports | Layout |
|---|---|
| No file | section "Choose a file": one row "CSV file" (hint "First row: column headers. A Name column is required."), the control a `label` styled as `BUTTON` wrapping an `sr-only` file input (keyboard reachable; the old `hidden` input was not) |
| Parse error | the same section with the error as `FORM_ALERT` (`role="alert"`) and QUIET "Try another file" |
| Mapping | section "Map columns", description `orgs.csv · 2 rows` (`MetaParts`), action QUIET "Choose a different file"; the table flush in the card: one `TH` per CSV column (sentence case as given), a row of `Select labelPosition="hidden"` (`label` "Field for <column>"), five preview rows; "2 more rows not shown." in a `TYPE.meta` line under the table; footer: the hint "Map a column to Name to continue." (`TYPE.bodyMuted`, `id`, named by the button's `aria-describedby`) when needed, a persistent status region ("Importing 3 of 12…"), PRIMARY "Import 12 organizations" |
| Results | section "Results", description `MetaParts` of "10 created" and, when any, a `text-danger-ink` "2 failed"; action QUIET "Upload another file"; the table flush: Row (`NUM`), Name, Result (a success or danger icon and the detail, `text-danger-ink` on a failure); first 20 rows, then a footer QUIET "Show all 64" |

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/settings/ProductsPage.test.tsx` (it defines `mockApi`, `renderPage`, `rowOf`, `CATALOGUE`):

```tsx
const line = (text: string) => (_: string, element: Element | null) => element?.tagName === 'P' && element.textContent === text;

describe('Products on the settings frame (UI foundations spec §6.3, §4.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('heads the page from the nav and lists the catalogue as one card of rows, Retired as a neutral badge', async () => {
    mockApi();
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Products' })).toHaveClass('text-[22px]');
    const list = await screen.findByRole('list', { name: 'Products' });
    expect(list).toHaveClass('divide-y');
    expect(within(rowOf('Product A')).getByText('5')).toHaveClass('tabular-nums');
    const retired = within(rowOf('Legacy Suite')).getByText('Retired');
    expect(retired).toHaveClass('bg-subtle', 'text-ink-muted');
    expect(within(rowOf('Legacy Suite')).getByText('Legacy Suite')).not.toHaveClass('line-through');
    expect(screen.getByRole('button', { name: 'Add product' })).not.toHaveClass('bg-accent');
  });

  it('keeps Rename on hover and puts Retire then Delete in the row menu, Delete last in danger', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Pilot Add-on');
    const row = rowOf('Pilot Add-on');
    expect(within(row).getByRole('button', { name: 'Rename Pilot Add-on' }).parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
    await user.click(within(row).getByRole('button', { name: 'More actions for Pilot Add-on' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Retire', 'Delete']);
    expect(items[1]).toHaveClass('text-danger-ink');
  });

  it('tells a CSM once, quietly, under the heading', async () => {
    mockApi();
    renderPage('csm');
    await screen.findByText('Product A');
    const note = screen.getByText(/You can see the list but not change it/).closest('[data-part="settings-note"]')!;
    expect(note).not.toHaveClass('bg-warning-dim');
    expect(screen.queryByRole('button', { name: /More actions for/ })).toBeNull();
  });
});
```

Existing cases: "lists the catalogue…" reads `within(rowOf('Product A')).getByText(line('5 customers'))` (the figure is its own span; the words "nobody on it" become "Nobody on it", a meta line's first word); "retires a product…" opens `More actions for Product A` and picks `Retire` (a `menuitem`), "brings a retired product back" picks `Bring back`, "deletes a product nobody is on" picks `Delete` before confirming; "adds a product…" clicks the BUTTON "Add product", types into `Name`, clicks the PRIMARY `Add`.

Append to `src/pages/settings/EntityUploadsPage.test.tsx` (it defines `renderPage`, `csvFile`, `jsonResponse`):

```tsx
describe('Imports on the settings frame (UI foundations spec §6.3, §4.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('heads the page from the nav and chooses a file with a real button the keyboard reaches', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Imports' })).toHaveClass('text-[22px]', 'font-semibold');
    const input = screen.getByLabelText('Choose a CSV file');
    expect(input).toHaveClass('sr-only');
    expect(input).not.toHaveClass('hidden');
    expect(input.closest('label')).toHaveClass('min-h-11', 'border-line');
  });

  it('maps columns in a table flush in its card, with sentence-case headers and a select per column', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Name,Domain\nAcme,acme.io\nGlobex,globex.com\n'));
    const section = await screen.findByRole('region', { name: 'Map columns' });
    expect(section).toHaveTextContent('orgs.csv · 2 rows');
    const table = within(section).getByRole('table');
    expect(table.parentElement).toHaveClass('overflow-x-auto');
    expect(within(table).getByRole('columnheader', { name: /Name/ }).className).not.toMatch(/uppercase/);
    expect(within(table).getByRole('combobox', { name: 'Field for Domain' })).toHaveValue('domain');
    const status = within(section).getByRole('status');
    expect(status).toBeEmptyDOMElement();
    expect(within(section).getByRole('button', { name: 'Import 2 organizations' })).toHaveClass('bg-accent');
  });

  it('reports the results in a table, the failure in the danger ink and the count as status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options?: { body?: string }) =>
        Promise.resolve(
          JSON.parse(options?.body ?? '{}').name === 'Bad Co'
            ? jsonResponse(400, { name: ['A customer with this name already exists.'] })
            : jsonResponse(201, { id: 9, name: 'Acme' }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await user.upload(screen.getByLabelText('Choose a CSV file'), csvFile('Name\nAcme\nBad Co\n'));
    await user.click(await screen.findByRole('button', { name: 'Import 2 organizations' }));
    const results = await screen.findByRole('region', { name: 'Results' });
    expect(within(results).getByText('1 failed')).toHaveClass('text-danger-ink');
    const bad = within(results).getByText('Bad Co').closest('tr')!;
    expect(within(bad).getByText('A customer with this name already exists.')).toHaveClass('text-danger-ink');
    expect(results.querySelector('.max-h-96')).toBeNull();
  });
});
```

(Use the response shape the file's own "a row that fails…" case stubs if the slice reads another error field.) Existing cases: `getByLabelText(/Click to choose a CSV file/)` becomes `getByLabelText('Choose a CSV file')`; `findByText('orgs.csv — 2 rows')` becomes `findByRole('region', { name: 'Map columns' })` plus `toHaveTextContent('orgs.csv · 2 rows')`; `Import 2 Organizations` becomes `Import 2 organizations`; `Import 1 Organization` becomes `Import 1 organization`; the disabled Import is `aria-disabled="true"` (`toHaveAttribute('aria-disabled', 'true')` in place of `toBeDisabled()`); `findByText('2 created')` becomes `findByText(/^2 created/)` (a meta part may end " ·"); the 20px heading assertion goes (the new case covers the heading).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/ProductsPage.test.tsx src/pages/settings/EntityUploadsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Products**

`src/pages/settings/ProductsPage.tsx`: state, `load`, `ordered`, `retiredCount`, `handleAdd`, `startEditing`, `saveEdit`, `setActive` stay. Rewrite the file comment without em dashes (keep its argument: rename fixes the name everywhere; retire, don't delete, once anyone is on it). Imports: drop `ShieldAlert`, `Archive`, `ArchiveRestore`, `Trash2`; keep `Plus`, `Pencil`, `Check`, `X`; add `import { BUTTON, Badge, EmptyState, ErrorState, FIELD_ERROR, ICON_BUTTON, INPUT, INVALID, LoadingState, MetaParts, NUM, OverflowMenu, PRIMARY, QUIET, ROW_ACTIONS, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';` and `import { settingsTitle } from './workspaceSettingsNav';`; delete `inputClass`. Add:

```tsx
  function cancelAdd() {
    setShowAdd(false);
    setAddError(null);
    setNewName('');
  }

  const customersText = (n: number) =>
    n === 0 ? (
      'Nobody on it'
    ) : (
      <>
        <span className={NUM}>{n}</span> {n === 1 ? 'customer' : 'customers'}
      </>
    );
```

The return:

```tsx
  return (
    <SettingsFrame
      title={settingsTitle('/settings/products')}
      intro="What this organisation sells: the list every product picker and the Product Usage dashboard read from."
      note={
        canManage ? undefined : (
          <SettingsNote icon="lock">You can see the list but not change it: adding, renaming and retiring products needs organisation settings access.</SettingsNote>
        )
      }
    >
      {showAdd && canManage ? (
        <form onSubmit={handleAdd} aria-label="New product">
          <SettingsSection
            title="New product"
            footer={
              <>
                <button type="button" onClick={cancelAdd} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" disabled={!newName.trim() || isAdding} className={PRIMARY}>
                  {isAdding ? 'Adding…' : 'Add'}
                </button>
              </>
            }
          >
            <SettingsRow label="Name" htmlFor="new-product-name" error={addError ?? undefined} errorId="new-product-error">
              <input
                id="new-product-name"
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Integrations Module"
                autoFocus
                aria-invalid={Boolean(addError)}
                aria-describedby={addError ? 'new-product-error' : undefined}
                className={`${INPUT} ${INVALID}`}
              />
            </SettingsRow>
          </SettingsSection>
        </form>
      ) : null}

      <SettingsSection
        title="Catalogue"
        description={
          <>
            Names are unique, ignoring case. Renaming a product renames it on every customer at once.
            {retiredCount > 0 ? ' Retired products stay on the customers already recorded against them and on the Product Usage dashboard; they are only hidden from the pickers.' : ''}
          </>
        }
        action={
          canManage && !showAdd ? (
            <button type="button" onClick={() => setShowAdd(true)} className={BUTTON}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add product
            </button>
          ) : undefined
        }
        list="Products"
        state={
          isLoading ? (
            <LoadingState label="Loading products" />
          ) : loadError ? (
            <ErrorState message={loadError} />
          ) : products.length === 0 ? (
            <EmptyState title="No products yet" detail="Until one is added, no customer can be recorded on a product and the Product Usage dashboard has nothing to compare." />
          ) : undefined
        }
      >
        {ordered.map((product) => (
          <li key={product.id} className="group relative flex min-h-14 flex-col justify-center gap-1 px-4 py-3">
            {editingId === product.id ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveEdit(product.id);
                    if (event.key === 'Escape') setEditingId(null);
                  }}
                  aria-label={`New name for ${product.name}`}
                  aria-invalid={rowError?.id === product.id || undefined}
                  aria-describedby={rowError?.id === product.id ? `product-${product.id}-error` : undefined}
                  autoFocus
                  className={`${INPUT} ${INVALID} flex-1`}
                />
                <button type="button" onClick={() => void saveEdit(product.id)} aria-label={`Save name for ${product.name}`} className={ICON_BUTTON}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel renaming" className={ICON_BUTTON}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <p title={product.name} className={`${TYPE.body} truncate font-semibold`}>
                    {product.name}
                  </p>
                  <p className={TYPE.meta}>{customersText(product.customers)}</p>
                </div>
                {product.is_active ? null : <Badge>Retired</Badge>}
                {canManage ? (
                  <div className={ROW_ACTIONS}>
                    <button type="button" onClick={() => startEditing(product)} aria-label={`Rename ${product.name}`} className={ICON_BUTTON}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <OverflowMenu
                      label={`More actions for ${product.name}`}
                      items={[
                        product.is_active
                          ? { key: 'retire', label: 'Retire', onSelect: () => void setActive(product, false) }
                          : { key: 'restore', label: 'Bring back', onSelect: () => void setActive(product, true) },
                        // Delete only when nobody is on it: the backend refuses otherwise, and retire is what people want then.
                        ...(product.customers === 0 ? [{ key: 'delete', label: 'Delete', onSelect: () => setDeleteTarget(product), danger: true }] : []),
                      ]}
                    />
                  </div>
                ) : null}
              </div>
            )}
            {rowError?.id === product.id ? (
              <p id={`product-${product.id}-error`} role="alert" className={FIELD_ERROR}>
                {rowError.message}
              </p>
            ) : null}
          </li>
        ))}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.name}?`}
          message="Nobody is recorded on it, so nothing else changes. If it was ever sold, retire it instead: deleting is for a product added by mistake."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteProduct(deleteTarget.id);
            } catch (err) {
              // ConfirmDialog prints a thrown string; an ApiError's message is the backend saying who is still on it.
              throw err instanceof ApiError ? err.message : 'Could not delete that product.';
            }
            setProducts((current) => current.filter((p) => p.id !== deleteTarget.id));
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </SettingsFrame>
  );
```

(`MetaParts` is not needed here: the meta line has one part. Drop it from the import if lint flags it.)

- [ ] **Step 4: Imports**

`src/pages/settings/EntityUploadsPage.tsx`: `FieldKey`, `DATE_RE`, `LIFECYCLE_BY_LABEL`, `CURRENCY_CODES`, `guessField`, the coercers, `RowResult`, the state, `reset`, `handleFileChange`, `previewRows`, `buildPayload` and `handleImport` stay. Rewrite the comments without em dashes. `FIELD_OPTIONS`' first entry becomes `{ value: 'skip', label: 'Skip this column' }` and its labels go sentence case (`'Lifecycle stage'`, `'Joined date (YYYY-MM-DD)'`, `'Renewal date (YYYY-MM-DD)'`). The parse messages lose their em dash: `'That file only has a header row: nothing to import.'`. Add `const [showAll, setShowAll] = useState(false);` (reset to `false` in `reset()`) and `const RESULTS_PAGE = 20;` at module scope. Imports: drop `UploadCloud`; keep `CheckCircle2`, `XCircle`, `RotateCcw`; add `import { BUTTON, FORM_ALERT, MetaParts, NUM, PRIMARY, QUIET, Select, SettingsFrame, SettingsRow, SettingsSection, TABLE, TD, TH, TYPE } from '../../components/ui';` and `settingsTitle`. The return:

```tsx
  const rowWord = (n: number) => `${n} row${n === 1 ? '' : 's'}`;
  const shownResults = results && !showAll ? results.slice(0, RESULTS_PAGE) : results;
  return (
    <SettingsFrame title={settingsTitle('/settings/entity-uploads')} intro='Bulk-create organizations from a CSV file: one real "Add organization" per row.'>
      {!fileName || parseError ? (
        <SettingsSection title="Choose a file">
          <SettingsRow label="CSV file" hint="First row: column headers. A Name column is required.">
            <label className={`${BUTTON} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-accent`}>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileChange} />
              Choose a CSV file
            </label>
          </SettingsRow>
          {parseError ? (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <p role="alert" className={`flex items-center gap-2 ${FORM_ALERT}`}>
                <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                {parseError}
              </p>
              <button type="button" onClick={reset} className={`ml-auto ${QUIET}`}>
                Try another file
              </button>
            </div>
          ) : null}
        </SettingsSection>
      ) : null}

      {fileName && !parseError && !results ? (
        <SettingsSection
          title="Map columns"
          description={<MetaParts parts={[fileName, rowWord(dataRows.length)]} />}
          action={
            <button type="button" onClick={reset} className={QUIET}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Choose a different file
            </button>
          }
          footer={
            <>
              {/* Always mounted: the run's progress is announced as it moves. */}
              <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
                {isImporting ? `Importing ${progress} of ${dataRows.length}…` : ''}
              </p>
              {nameColumnIndex === -1 ? (
                <p id="import-needs-name" className={TYPE.bodyMuted}>
                  Map a column to "Name" to continue.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (canImport) void handleImport();
                }}
                aria-disabled={!canImport || undefined}
                aria-describedby={nameColumnIndex === -1 ? 'import-needs-name' : undefined}
                className={PRIMARY}
              >
                Import {dataRows.length} organization{dataRows.length === 1 ? '' : 's'}
              </button>
            </>
          }
        >
          <div>
            <div className="overflow-x-auto">
              <table className={TABLE}>
                <thead>
                  <tr>
                    {headers.map((header, index) => (
                      <th key={index} scope="col" className={`${TH} whitespace-nowrap`}>
                        {header || `Column ${index + 1}`}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {headers.map((header, index) => (
                      <td key={index} className="px-4 pb-2">
                        <Select
                          label={`Field for ${header || `Column ${index + 1}`}`}
                          labelPosition="hidden"
                          value={mapping[index]}
                          onChange={(value) => setMapping((current) => current.map((field, at) => (at === index ? value : field)))}
                          options={FIELD_OPTIONS}
                          className="min-w-40"
                        />
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {previewRows.map((row, r) => (
                    <tr key={r}>
                      {headers.map((_, index) => (
                        <td key={index} title={row[index]} className={`${TD} max-w-[200px] truncate whitespace-nowrap text-ink-muted`}>
                          {row[index]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dataRows.length > previewRows.length ? (
              <p className={`px-4 py-3 ${TYPE.meta}`}>
                <span className={NUM}>{dataRows.length - previewRows.length}</span> more {dataRows.length - previewRows.length === 1 ? 'row' : 'rows'} not shown.
              </p>
            ) : null}
          </div>
        </SettingsSection>
      ) : null}

      {results ? (
        <SettingsSection
          title="Results"
          description={
            <MetaParts
              parts={[
                `${successCount} created`,
                failureCount > 0 ? <span className="text-[13px] leading-5 text-danger-ink">{failureCount} failed</span> : null,
              ]}
            />
          }
          action={
            <button type="button" onClick={reset} className={QUIET}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Upload another file
            </button>
          }
          footer={
            results.length > RESULTS_PAGE && !showAll ? (
              <button type="button" onClick={() => setShowAll(true)} className={QUIET}>
                Show all {results.length}
              </button>
            ) : undefined
          }
        >
          <div className="overflow-x-auto">
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Row
                  </th>
                  <th scope="col" className={TH}>
                    Name
                  </th>
                  <th scope="col" className={TH}>
                    Result
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {shownResults!.map((result) => (
                  <tr key={result.row}>
                    <td className={`${TD} text-ink-muted ${NUM}`}>{result.row}</td>
                    <td className={`${TD} font-semibold`}>{result.name}</td>
                    <td className={TD}>
                      <span className={`flex items-center gap-1.5 ${result.status === 'ok' ? '' : 'text-danger-ink'}`.trim()}>
                        {result.status === 'ok' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                        )}
                        {result.detail}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsSection>
      ) : null}
    </SettingsFrame>
  );
```

(The danger "N failed" is set in a span with its own size and colour, so `MetaParts` keeps it as a separate part; the description's muted ink stays on "created". `FieldKey` is the options' value union, so `Select` hands `setMapping` a `FieldKey`.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/pages/settings/ProductsPage.test.tsx src/pages/settings/EntityUploadsPage.test.tsx src/pages/settings/csvParser.test.ts`
Expected: PASS.

Run: `npm run lint` (expected: clean).

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings/ProductsPage.tsx src/pages/settings/EntityUploadsPage.tsx src/pages/settings/ProductsPage.test.tsx src/pages/settings/EntityUploadsPage.test.tsx
git commit -m "feat(settings): Products and Imports on the settings frame

Products is one card of rows with Retired as a neutral badge, Rename on
hover and Retire then Delete in the row menu, and the add form as its own
section. Imports chooses a file with a keyboard-reachable button, maps
and reports in tables flush in their cards, keeps its progress in a
status region, and ends a long result list in Show all.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Webhooks and Agent access (Developers)

**Files:**
- Modify: `src/pages/settings/{WebhooksPage,AgentAccessPage}.tsx`
- Test (update): `src/pages/settings/{WebhooksPage,AgentAccessPage}.test.tsx`

**Interfaces:**
- Consumes: `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsNote`, `MetaParts`, `Switch`, `IconChip`, `BUTTON`, `PRIMARY`, `QUIET`, `DANGER`, `ICON_BUTTON`, `ROW_ACTIONS`, `INPUT`, `INVALID`, `CODE`, `FIELD_ERROR`, `FORM_ALERT`, `LoadingState`, `ErrorState`, `EmptyState`, `TYPE` (ui); `settingsTitle`.
- Produces: nothing new.

Why: spec §6.3, §4.2 (a list is one card of rows; a table of three records is not a table), §3 (webhook URLs, the MCP endpoint and the issued key are code: `CODE`), §5.5 (the hand-made knob switch becomes `Switch`), §7 (a failed delivery is status; "Disabled" is neutral; Revoke is destructive).

| Webhooks | Layout |
|---|---|
| Member | the frame with the lock note "You don't have permission to view or manage webhooks." and nothing else (unchanged behaviour: no fetch) |
| Admin heading | intro "Get notified at a URL of your choosing when something happens in Revenact."; the frame's `action` BUTTON "Add webhook" while not adding |
| New webhook | section shown while adding: stacked row "URL" (`INPUT`, `type="url"`, hint "Sends when: Organization created"), footer QUIET Cancel + PRIMARY Add |
| Endpoints | section `list="Webhooks"`: each row a disclosure button (the URL in `CODE`, `aria-expanded`, a chevron), meta `MetaParts` of the event and "added 3 days ago"; trailing the `Switch` (name "Webhook for <url>", words On or Off); `ROW_ACTIONS` Delete (`ICON_BUTTON`, Trash2); expanded: "Recent deliveries" (`TYPE.label`) and one line per delivery: a success or danger icon, the time, "HTTP 200" (`NUM`), the error in `text-danger-ink` |

| Agent access | Layout |
|---|---|
| Heading | intro unchanged in words; `note` = `SettingsNote` info "Point the agent at `/api/v1/mcp/` and give it the key as a bearer token." (the path in `CODE`) |
| New key (issued) | section "Your new key" shown once: the key in a `CODE` block (`bg-subtle`, no border) with BUTTON Copy (words Copy or Copied), the warning note "This is the only time it can be shown…", footer BUTTON Done |
| Create | section "New key": row "What is it for" (`INPUT`), footer status region + PRIMARY "Create a key" |
| Keys | section `list="Agent keys"`: `IconChip` KeyRound, the label, meta `MetaParts` of "Ends …7fQx", "made 1 Sep 2026", "Last used 22 Sep 2026" or "Never used"; `ROW_ACTIONS` `DANGER` Revoke (name "Revoke <label>"); loading/error/empty in the section's `state` (Try again on the error) |

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/settings/WebhooksPage.test.tsx` (add `within` to its testing-library import; it defines `jsonResponse`, `webhook`, `renderPage`):

```tsx
describe('Webhooks on the settings frame (UI foundations spec §6.3, §4.2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists webhooks as rows: the URL as code, the ui Switch, Delete on hover', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [webhook()]))));
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Webhooks' })).toHaveClass('text-[22px]');
    const list = await screen.findByRole('list', { name: 'Webhooks' });
    expect(within(list).getByText('https://example.com/hook')).toHaveClass('font-mono-brand');
    const toggle = within(list).getByRole('switch', { name: 'Webhook for https://example.com/hook' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle).toHaveTextContent('On');
    expect(within(list).getByRole('button', { name: 'Delete webhook for https://example.com/hook' }).parentElement).toHaveClass('sm:opacity-0');
    expect(screen.getByRole('button', { name: 'Add webhook' })).not.toHaveClass('bg-accent');
  });

  it('opens a row as a disclosure and shows a failed delivery in the danger ink', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(200, [webhook({ recent_deliveries: [{ id: 7, success: false, status_code: null, error: 'Connection refused', sent_at: '2026-09-05T00:00:00Z' }] })]),
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    const open = await screen.findByRole('button', { name: 'https://example.com/hook' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    await user.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Connection refused/)).toHaveClass('text-danger-ink');
  });

  it('tells a member once, with a lock and no box', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage('csm');
    const note = screen.getByText(/You don't have permission to view or manage webhooks/).closest('[data-part="settings-note"]')!;
    expect(note).not.toHaveClass('bg-warning-dim');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

Existing cases: "Add Webhook" becomes "Add webhook"; "lists real webhooks…" drops the knob assertion (`querySelector('span')` with `translate-x-[16px]`) for `toHaveTextContent('On')`; "expanding a row…" clicks the disclosure button found by its exact name, the URL (`getByRole('button', { name: 'https://example.com/hook' })`; a regex would also match the row's Delete).

Append to `src/pages/settings/AgentAccessPage.test.tsx`:

```tsx
describe('Agent access on the settings frame (UI foundations spec §6.3, §3)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('heads the page from the nav, names the endpoint as code, and lists keys as rows with Revoke on hover', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [existing]));
    render(<AgentAccessPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Agent access' })).toHaveClass('text-[22px]');
    expect(screen.getByText('/api/v1/mcp/')).toHaveClass('font-mono-brand');
    const list = await screen.findByRole('list', { name: 'Agent keys' });
    const revoke = within(list).getByRole('button', { name: 'Revoke Claude Desktop' });
    expect(revoke).toHaveClass('text-danger-ink');
    expect(revoke.parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
  });

  it('shows a load failure inside the keys card with Try again', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: 'Boom' }));
    render(<AgentAccessPage />);
    const alert = await screen.findByRole('alert');
    expect(alert.closest('section')).toHaveAccessibleName('Keys');
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the new key once as code, in a section of its own, with the warning in ink', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, []))
      .mockResolvedValueOnce(jsonResponse(201, { id: 2, label: 'My agent', token: 'rvn_mcp_secret-value', hint: '…alue', created_at: '2026-10-10T00:00:00Z', last_used_at: null }))
      .mockResolvedValue(jsonResponse(200, []));
    render(<AgentAccessPage />);
    await screen.findByText(/No agent has access/);
    await userEvent.type(screen.getByLabelText('What is it for'), 'My agent');
    await userEvent.click(screen.getByRole('button', { name: 'Create a key' }));
    const key = await screen.findByText('rvn_mcp_secret-value');
    expect(key).toHaveClass('font-mono-brand');
    expect(key.closest('section')).toHaveAccessibleName('Your new key');
    expect(screen.getByText(/only time/i).closest('[data-part="settings-note"]')).toHaveClass('text-ink');
  });
});
```

(Match the issue response to the file's own "issues one…" case if its shape differs.) Existing cases: "shows the error with a retry" clicks `Try again` (was `Retry`); the rest keep their names.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/WebhooksPage.test.tsx src/pages/settings/AgentAccessPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Webhooks**

`src/pages/settings/WebhooksPage.tsx`: state, `load`, `handleAdd`, `toggleActive` stay; rewrite the file comment without em dashes ("Backs Settings › Webhooks. Viewing and changing both need manage_integrations server-side (IsOrgAdmin on GET too), so a member gets a notice and no fetch."). Imports: drop `ShieldAlert`, `Plus` stays, `Fragment` goes; add `import { BUTTON, CODE, EmptyState, ErrorState, ICON_BUTTON, INPUT, INVALID, LoadingState, MetaParts, NUM, PRIMARY, QUIET, ROW_ACTIONS, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, Switch, TYPE } from '../../components/ui';` and `settingsTitle`. Add `function cancelAdd() { setShowAddForm(false); setAddError(null); }`. The member return:

```tsx
  const title = settingsTitle('/settings/webhooks');
  if (!isAdmin) {
    return (
      <SettingsFrame title={title} intro="Outbound integrations for this organisation." note={<SettingsNote icon="lock">You don't have permission to view or manage webhooks.</SettingsNote>}>
        {null}
      </SettingsFrame>
    );
  }
```

The admin return:

```tsx
  return (
    <SettingsFrame
      title={title}
      intro="Get notified at a URL of your choosing when something happens in Revenact."
      action={
        showAddForm ? undefined : (
          <button type="button" onClick={() => setShowAddForm(true)} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add webhook
          </button>
        )
      }
    >
      {showAddForm ? (
        <form
          aria-label="New webhook"
          onSubmit={(event) => {
            event.preventDefault();
            if (newUrl.trim() && !isSubmitting) void handleAdd();
          }}
        >
          <SettingsSection
            title="New webhook"
            footer={
              <>
                <button type="button" onClick={cancelAdd} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" disabled={!newUrl.trim() || isSubmitting} className={PRIMARY}>
                  {isSubmitting ? 'Adding…' : 'Add'}
                </button>
              </>
            }
          >
            <SettingsRow label="URL" htmlFor="webhook-url" hint="Sends when: Organization created" hintId="webhook-url-hint" error={addError ?? undefined} errorId="webhook-url-error" stacked>
              <input
                id="webhook-url"
                type="url"
                value={newUrl}
                onChange={(event) => setNewUrl(event.target.value)}
                placeholder="https://example.com/hooks/revenact"
                aria-invalid={Boolean(addError)}
                aria-describedby={addError ? 'webhook-url-hint webhook-url-error' : 'webhook-url-hint'}
                className={`${INPUT} ${INVALID} ${CODE}`}
              />
            </SettingsRow>
          </SettingsSection>
        </form>
      ) : null}

      <SettingsSection
        title="Endpoints"
        list="Webhooks"
        state={
          isLoading ? (
            <LoadingState label="Loading webhooks" count={2} />
          ) : loadError ? (
            <ErrorState message={loadError} />
          ) : webhooks.length === 0 ? (
            <EmptyState title="No webhooks yet." detail="Add one to get notified when an organization is created." />
          ) : undefined
        }
      >
        {webhooks.map((webhook) => {
          const open = expandedId === webhook.id;
          const panelId = `webhook-${webhook.id}-deliveries`;
          return (
            <li key={webhook.id} className="group relative flex flex-col">
              <div className="flex min-h-14 items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setExpandedId((id) => (id === webhook.id ? null : webhook.id))}
                    className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-sm text-left sm:min-h-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <ChevronDown className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                    <span title={webhook.url} className={`${TYPE.body} ${CODE} truncate font-semibold`}>
                      {webhook.url}
                    </span>
                  </button>
                  <p className={TYPE.meta}>
                    <MetaParts parts={[webhook.event_display, `added ${formatRelativeTime(webhook.created_at)}`]} />
                  </p>
                </div>
                <Switch checked={webhook.is_active} label={`Webhook for ${webhook.url}`} onChange={() => void toggleActive(webhook)}>
                  {webhook.is_active ? 'On' : 'Off'}
                </Switch>
                <div className={ROW_ACTIONS}>
                  <button type="button" onClick={() => setDeleteTarget(webhook)} aria-label={`Delete webhook for ${webhook.url}`} className={ICON_BUTTON}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {open ? (
                <div id={panelId} className="flex flex-col gap-2 border-t border-line-subtle px-4 py-3">
                  <p className={TYPE.label}>Recent deliveries</p>
                  {webhook.recent_deliveries.length === 0 ? (
                    <p className={TYPE.bodyMuted}>No deliveries yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {webhook.recent_deliveries.map((delivery) => (
                        <li key={delivery.id} className={`flex items-center gap-2 ${TYPE.bodyMuted}`}>
                          {delivery.success ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                          ) : (
                            <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                          )}
                          <span className="sr-only">{delivery.success ? 'Delivered' : 'Failed'}</span>
                          <MetaParts
                            parts={[
                              formatRelativeTime(delivery.sent_at),
                              delivery.status_code ? (
                                <>
                                  HTTP <span className={NUM}>{delivery.status_code}</span>
                                </>
                              ) : null,
                              delivery.error ? <span className="text-[13px] leading-5 text-danger-ink">{delivery.error}</span> : null,
                            ]}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this webhook?"
          message="This can't be undone: Revenact stops notifying this URL."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteWebhook(deleteTarget.id);
            setWebhooks((current) => current.filter((w) => w.id !== deleteTarget.id));
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </SettingsFrame>
  );
```

(`SettingsFrame`'s `children` is required; the member branch passes `{null}`. `addError` was a bare paragraph; it is now the URL field's error.)

- [ ] **Step 4: Agent access**

`src/pages/settings/AgentAccessPage.tsx`: `MONTHS`, `shortDate`, `errorText`, the state, the effect, `create`, `revoke`, `copy` stay; drop the local `FOCUS`; imports: drop `Bot`; add `import { BUTTON, CODE, DANGER, EmptyState, ErrorState, IconChip, INPUT, LoadingState, MetaParts, PRIMARY, ROW_ACTIONS, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';` and `settingsTitle`. Rewrite the file comment without em dashes. The return:

```tsx
  return (
    <SettingsFrame
      title={settingsTitle('/settings/agent-access')}
      intro="Let an agent read Revenact as you, over MCP. It sees exactly what you see in the app: your book, your mail, your department's tickets. It cannot change anything."
      note={
        <SettingsNote>
          Point the agent at <code className={`${CODE} text-ink`}>/api/v1/mcp/</code> and give it the key as a bearer token.
        </SettingsNote>
      }
    >
      {actionError ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {actionError}
        </p>
      ) : null}

      {issued ? (
        <SettingsSection
          title="Your new key"
          description={`The key for ${issued.label}.`}
          footer={
            <button
              type="button"
              onClick={() => {
                setIssued(null);
                setCopied(false);
              }}
              className={BUTTON}
            >
              Done
            </button>
          }
        >
          <div className="flex flex-col gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <code className={`grow break-all rounded-lg bg-subtle px-3 py-2 ${TYPE.body} ${CODE}`}>{issued.token}</code>
              <button type="button" onClick={() => void copy()} className={BUTTON}>
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <SettingsNote icon="warning">This is the only time it can be shown. Nobody can recover it afterwards, not even an admin; if it is lost, make another and revoke this one.</SettingsNote>
          </div>
        </SettingsSection>
      ) : null}

      <form
        aria-label="New key"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void create();
        }}
      >
        <SettingsSection
          title="New key"
          footer={
            <button type="submit" disabled={!label.trim() || busy} className={PRIMARY}>
              {busy ? 'Creating…' : 'Create a key'}
            </button>
          }
        >
          <SettingsRow label="What is it for" htmlFor="agent-label">
            <input id="agent-label" type="text" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Claude Desktop" className={INPUT} />
          </SettingsRow>
        </SettingsSection>
      </form>

      <SettingsSection
        title="Keys"
        list="Agent keys"
        state={
          loadError ? (
            <ErrorState message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
          ) : tokens === null ? (
            <LoadingState label="Loading your keys" count={1} />
          ) : tokens.length === 0 ? (
            <EmptyState icon={Bot} title="No agent has access yet." />
          ) : undefined
        }
      >
        {(tokens ?? []).map((token) => (
          <li key={token.id} className="group relative flex min-h-14 items-center gap-3 px-4 py-3">
            <IconChip icon={KeyRound} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p title={token.label} className={`${TYPE.body} truncate font-semibold`}>
                {token.label}
              </p>
              <p className={TYPE.meta}>
                <MetaParts
                  parts={[
                    <>
                      Ends <span className={CODE}>{token.hint}</span>
                    </>,
                    `made ${shortDate(token.created_at)}`,
                    token.last_used_at ? `Last used ${shortDate(token.last_used_at)}` : 'Never used',
                  ]}
                />
              </p>
            </div>
            <div className={ROW_ACTIONS}>
              <button type="button" onClick={() => setRevoking(token)} aria-label={`Revoke ${token.label}`} className={DANGER}>
                Revoke
              </button>
            </div>
          </li>
        ))}
      </SettingsSection>

      {revoking && (
        <ConfirmDialog
          title={`Revoke ${revoking.label}?`}
          message="Anything using this key stops working immediately. This cannot be undone."
          confirmLabel="Revoke"
          danger
          onConfirm={revoke}
          onClose={() => setRevoking(null)}
        />
      )}
    </SettingsFrame>
  );
```

Keep `Bot` in the lucide import (it is the empty state's icon). The test that found the hint with `getByText(/…7fQx/)` still finds it: the hint is the `CODE` span's text.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/pages/settings/WebhooksPage.test.tsx src/pages/settings/AgentAccessPage.test.tsx`
Expected: PASS.

Run: `npm run lint` (expected: clean).

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings/WebhooksPage.tsx src/pages/settings/AgentAccessPage.tsx src/pages/settings/WebhooksPage.test.tsx src/pages/settings/AgentAccessPage.test.tsx
git commit -m "feat(settings): Webhooks and Agent access on the settings frame

Webhooks are rows with the URL as code, the ui Switch and a disclosure
for their deliveries; Agent access names the endpoint and the key as
code, shows a new key once in its own section, and lists keys as rows
with Revoke in the danger tone on hover.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Briefs and AI attributes

**Files:**
- Modify: `src/pages/settings/{BriefDeliveryPage,AIAttributesPage}.tsx`
- Test (update): `src/pages/settings/{BriefDeliveryPage,AIAttributesPage}.test.tsx`, `src/e2e/aiAttributes.test.tsx` (only where it pins the old table or heading)

**Interfaces:**
- Consumes: `SettingsFrame`, `SettingsSection`, `SettingsRow`, `SettingsNote`, `MetaParts`, `Select`, `INPUT`, `INVALID`, `NUM`, `CHOICE`, `CHECKBOX`, `BUTTON`, `PRIMARY`, `QUIET`, `DANGER`, `ICON_BUTTON`, `ROW_ACTIONS`, `FORM_ALERT`, `LoadingState`, `ErrorState`, `EmptyState`, `TYPE` (ui); `settingsTitle`.
- Produces: nothing new.

Why: spec §6.3 (the `h1` equals the nav label: "Brief delivery" becomes **Briefs** and "AI Attributes" becomes **AI attributes**; one section per form; the read-only notice), §4.2 (AI attributes is a list of definitions, not a six-column table), §4.4 (the send-now note and each Fill all result are live regions that stay mounted), §7 (Stop sending is destructive).

| Briefs | Layout |
|---|---|
| Member | the frame and the lock note "You don't have permission to change this. Ask an admin where the management brief should go." (no fetch) |
| Loading | the "Schedule" section's `state` is `LoadingState variant="block"`; a load failure is its `ErrorState` |
| Schedule | section "Schedule", description "It goes out on its day, when the overnight job runs. A month with no such day sends on its last day instead."; rows: "Now" (the schedule in words, meta `MetaParts` of "Posting to the hook ending …abcd" and "last sent 22 Sep 2026" / "not sent yet"; when live, BUTTON "Send one now" and `DANGER` "Stop sending" beside it), "Slack webhook URL" (stacked `INPUT`, hint "Written once and never shown again. Anyone holding it can post to that channel.") or, when live and not editing, QUIET "Change the channel", "How often" (`Select`), "Day" (`Select` weekly, `INPUT` + `NUM` monthly); footer: the one status region (the send-now note), QUIET Cancel while editing, PRIMARY "Schedule it" or "Save" |

| AI attributes | Layout |
|---|---|
| Member | the frame and the lock note (no fetch) |
| Heading | intro unchanged; the frame's `action` BUTTON "New attribute" while not adding |
| New attribute | section "New attribute" shown while adding: rows Name, Question (stacked textarea, hint), Answer type (`Select`), Refresh (`Select`), Options (picklist only, hint), Applies to (`group`, two `CHOICE` checkboxes); footer QUIET Cancel + PRIMARY Create |
| Attributes | section `list="AI attributes"`; each row: the name (`TYPE.body` semibold), the question (`TYPE.bodyMuted`, two lines at most), meta `MetaParts` of the type, "Organizations & Accounts", the picklist options when any, the refresh last; `ROW_ACTIONS` QUIET "Fill all" (name "Fill all for <name>") and `ICON_BUTTON` Delete (name "Delete <name>"); one always-mounted `TYPE.meta` status region per row for its fill result |

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/settings/BriefDeliveryPage.test.tsx` (add `within` to its import; it defines `fetchMock`, `jsonResponse`, `nothing`, `weekly`, `renderPage`):

```tsx
describe('Briefs on the settings frame (UI foundations spec §6.3)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('heads the page with the nav label, Briefs, and puts the whole schedule in one section', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, weekly));
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Briefs' })).toHaveClass('text-[22px]');
    const schedule = await screen.findByRole('region', { name: 'Schedule' });
    expect(within(schedule).getByText(/Every Tuesday/)).toBeInTheDocument();
    expect(within(schedule).getByRole('button', { name: 'Stop sending' })).toHaveClass('text-danger-ink');
    expect(within(schedule).getByRole('button', { name: 'Save' })).toHaveClass('bg-accent');
  });

  it('keeps the send-now note in one status region that was there before the send', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, weekly)).mockResolvedValueOnce(jsonResponse(200, { detail: 'Sent to Slack.' }));
    renderPage();
    const schedule = await screen.findByRole('region', { name: 'Schedule' });
    const region = within(schedule).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    await userEvent.click(within(schedule).getByRole('button', { name: 'Send one now' }));
    expect(await within(schedule).findByText('Sent to Slack.')).toBe(region);
  });

  it('tells a member once, with a lock and no box, and fetches nothing', () => {
    renderPage('csm');
    const note = screen.getByText(/ask an admin/i).closest('[data-part="settings-note"]')!;
    expect(note).not.toHaveClass('bg-warning-dim');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

(Match the send-now answer to the shape the file's "sends one now…" case stubs; the page shows `result.detail`.)

Append to `src/pages/settings/AIAttributesPage.test.tsx` (add `within` to its import; it uses `attribute`, `jsonResponse`, `makeStore` from `test/attributesFixtures` and the module-level `fetchMock`):

```tsx
describe('AI attributes on the settings frame (UI foundations spec §6.3, §4.2)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('heads the page with the nav label and lists attributes as rows, the actions on hover', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, [attribute()]));
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'AI attributes' })).toHaveClass('text-[22px]');
    const list = await screen.findByRole('list', { name: 'AI attributes' });
    expect(screen.queryByRole('table')).toBeNull();
    const row = within(list).getByText('Product tier').closest('li')!;
    expect(within(row).getByRole('button', { name: 'Fill all for Product tier' }).parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
    expect(within(row).getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'New attribute' })).not.toHaveClass('bg-accent');
  });

  it('builds a new attribute in a section of rows, Applies to as a named group', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New attribute' }));
    const form = screen.getByRole('region', { name: 'New attribute' });
    expect(within(form).getByRole('group', { name: 'Applies to' })).toContainElement(within(form).getByRole('checkbox', { name: 'Applies to Organizations' }));
    expect(within(form).getByLabelText('Question')).toHaveClass('min-h-20');
    expect(within(form).getByRole('button', { name: 'Create' })).toHaveClass('bg-accent');
  });
});
```

(`attribute()` builds "Product tier" with the nightly refresh in the shared fixtures; pass overrides the way the file's other cases do if its defaults differ.) Existing cases: "lists what is defined…" keeps `getByText('Nightly')` (the refresh is the meta line's last part, so its span has no trailing " ·"); the delete case keeps `Delete Product tier`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/BriefDeliveryPage.test.tsx src/pages/settings/AIAttributesPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Briefs**

`src/pages/settings/BriefDeliveryPage.tsx`: `MONTHS`, `shortDate`, `ordinal`, `describe`, `errorText`, the state, the effect, `save`, `stop`, `sendNow` stay; rewrite the file comment without the em dash; drop `FOCUS`, `FIELD`, `LABEL`, `ShieldAlert`; keep `Hash` (the "Now" row's icon) and `Send`; add `import { BUTTON, DANGER, ErrorState, FORM_ALERT, INPUT, INVALID, LoadingState, MetaParts, NUM, PRIMARY, QUIET, Select, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';` and `settingsTitle`. The member branch:

```tsx
  const title = settingsTitle('/settings/brief-delivery');
  if (!isAdmin) {
    return (
      <SettingsFrame title={title} note={<SettingsNote icon="lock">You don't have permission to change this. Ask an admin where the management brief should go.</SettingsNote>}>
        {null}
      </SettingsFrame>
    );
  }
```

The admin return:

```tsx
  const needsDestination = !live || editing;
  return (
    <SettingsFrame title={title} intro="Post the management brief to a Slack channel on a schedule. It posts the brief that exists; it never writes one on its own.">
      {actionError ? (
        <p role="alert" className={FORM_ALERT}>
          {actionError}
        </p>
      ) : null}
      <form
        aria-label="Brief schedule"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void save();
        }}
      >
        <SettingsSection
          title="Schedule"
          description="It goes out on its day, when the overnight job runs. A month with no such day sends on its last day instead."
          state={loadError ? <ErrorState message={loadError} /> : !loaded ? <LoadingState label="Loading the schedule" variant="block" /> : undefined}
          footer={
            <>
              {/* Always mounted: the answer to Send one now is announced. */}
              <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
                {note ?? ''}
              </p>
              {editing ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDestination('');
                  }}
                  className={QUIET}
                >
                  Cancel
                </button>
              ) : null}
              <button type="submit" disabled={busy || (needsDestination && !destination.trim())} className={PRIMARY}>
                {busy ? 'Saving…' : live ? 'Save' : 'Schedule it'}
              </button>
            </>
          }
        >
          <SettingsRow label="Now">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <Hash className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
                <div className="flex min-w-0 flex-col">
                  <p className={`${TYPE.body} font-semibold`}>{live ? describe(schedule!) : 'Nothing is scheduled yet.'}</p>
                  <p className={TYPE.meta}>
                    {live ? (
                      <MetaParts
                        parts={[`Posting to the hook ending ${schedule!.destination_hint}`, schedule!.last_sent_at ? `last sent ${shortDate(schedule!.last_sent_at)}` : 'not sent yet']}
                      />
                    ) : (
                      'Paste a Slack incoming webhook and choose when it should go.'
                    )}
                  </p>
                </div>
              </div>
              {live ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => void sendNow()} disabled={busy} className={BUTTON}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Send one now
                  </button>
                  <button type="button" onClick={() => void stop()} disabled={busy} className={DANGER}>
                    Stop sending
                  </button>
                </div>
              ) : null}
            </div>
          </SettingsRow>
          {needsDestination ? (
            <SettingsRow label="Slack webhook URL" htmlFor="brief-hook" hint="Written once and never shown again. Anyone holding it can post to that channel." hintId="brief-hook-hint" stacked>
              <input
                id="brief-hook"
                type="url"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="https://hooks.slack.com/services/…"
                aria-describedby="brief-hook-hint"
                className={`${INPUT} ${INVALID}`}
              />
            </SettingsRow>
          ) : (
            <div className="px-4 py-3">
              <button type="button" onClick={() => setEditing(true)} className={QUIET}>
                Change the channel
              </button>
            </div>
          )}
          <SettingsRow label="How often" htmlFor="brief-cadence">
            <Select
              id="brief-cadence"
              label="How often"
              labelPosition="external"
              value={cadence}
              onChange={setCadence}
              options={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
              className="sm:max-w-xs"
            />
          </SettingsRow>
          <SettingsRow label="Day" htmlFor="brief-day">
            {cadence === 'weekly' ? (
              <Select
                id="brief-day"
                label="Day"
                labelPosition="external"
                value={weekday}
                onChange={setWeekday}
                options={WEEKDAYS.map((name, index) => ({ value: String(index), label: name }))}
                className="sm:max-w-xs"
              />
            ) : (
              <input id="brief-day" type="number" min="1" max="31" value={day} onChange={(event) => setDay(event.target.value)} className={`${INPUT} ${NUM} sm:w-28`} />
            )}
          </SettingsRow>
        </SettingsSection>
      </form>
    </SettingsFrame>
  );
```

(`Cadence` is `'weekly' | 'monthly'`, the options' union, so `onChange={setCadence}` type-checks. A refusal of the destination stays the page-level `alert` above the section, as the existing "refuses a destination…" case expects; the load error now shows inside the section.)

- [ ] **Step 4: AI attributes**

`src/pages/settings/AIAttributesPage.tsx`: the state, `load`, `resetForm`, `optionList`, `canCreate`, `handleCreate`, `handleDelete`, `handleFillAll` stay; delete `INPUT` and `LABEL`; imports: drop `ShieldAlert`, `Sparkles` stays (the empty state's icon), `Plus`, `Trash2` stay; add `import { BUTTON, CHECKBOX, CHOICE, EmptyState, ErrorState, ICON_BUTTON, INPUT, INVALID, LoadingState, MetaParts, PRIMARY, QUIET, ROW_ACTIONS, Select, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE, FORM_ALERT } from '../../components/ui';` and `settingsTitle`. Rewrite the file comment ("Backs Settings › AI › AI attributes. Same admin-only write and list, add form and ConfirmDialog shape as Custom objects: an AI attribute is workspace-wide schema. The answers live on each company page (AIAttributesPanel).").

```tsx
  const title = settingsTitle('/settings/ai-attributes');
  const intro = 'Ask a question of every company in plain English. The Copilot answers it from the records, with its reasoning and sources, and keeps every answer.';
  if (!isAdmin) {
    return (
      <SettingsFrame
        title={title}
        intro={intro}
        note={<SettingsNote icon="lock">You don't have permission to define AI attributes. Ask an admin to add one; the answers show on every organization and account page.</SettingsNote>}
      >
        {null}
      </SettingsFrame>
    );
  }

  return (
    <SettingsFrame
      title={title}
      intro={intro}
      action={
        showAddForm ? undefined : (
          <button type="button" onClick={() => setShowAddForm(true)} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New attribute
          </button>
        )
      }
    >
      {showAddForm ? (
        <form
          aria-label="New attribute"
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreate) void handleCreate();
          }}
        >
          <SettingsSection
            title="New attribute"
            footer={
              <>
                <button type="button" onClick={resetForm} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" disabled={!canCreate} className={PRIMARY}>
                  {isSubmitting ? 'Creating…' : 'Create'}
                </button>
              </>
            }
          >
            <SettingsRow label="Name" htmlFor="attr-name">
              <input id="attr-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Product tier" className={INPUT} />
            </SettingsRow>
            <SettingsRow
              label="Question"
              htmlFor="attr-prompt"
              hint="Written as you would ask a colleague. The Copilot reads the company's notes, emails, tickets and calls to answer it."
              hintId="attr-prompt-hint"
              stacked
            >
              <textarea
                id="attr-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={2}
                placeholder="Which tier of our product does this company use?"
                aria-describedby="attr-prompt-hint"
                className={`${INPUT} ${INVALID} min-h-20 resize-y py-2`}
              />
            </SettingsRow>
            <SettingsRow label="Answer type" htmlFor="attr-type">
              <Select
                id="attr-type"
                label="Answer type"
                labelPosition="external"
                value={valueType}
                onChange={setValueType}
                options={(Object.keys(VALUE_TYPE_LABELS) as AttributeValueType[]).map((type) => ({ value: type, label: VALUE_TYPE_LABELS[type] }))}
                className="sm:max-w-xs"
              />
            </SettingsRow>
            <SettingsRow label="Refresh" htmlFor="attr-refresh">
              <Select
                id="attr-refresh"
                label="Refresh"
                labelPosition="external"
                value={refresh}
                onChange={setRefresh}
                options={[
                  { value: 'manual', label: 'When someone asks' },
                  { value: 'nightly', label: 'Nightly, when there is new activity' },
                ]}
                className="sm:max-w-xs"
              />
            </SettingsRow>
            {valueType === 'picklist' ? (
              <SettingsRow label="Options" htmlFor="attr-options" hint="Comma separated. The answer must be one of these." hintId="attr-options-hint">
                <input
                  id="attr-options"
                  type="text"
                  value={options}
                  onChange={(event) => setOptions(event.target.value)}
                  placeholder="SMB, Mid-market, Enterprise"
                  aria-describedby="attr-options-hint"
                  className={INPUT}
                />
              </SettingsRow>
            ) : null}
            <SettingsRow label="Applies to" group>
              <div className="flex flex-wrap gap-x-5">
                <label className={CHOICE}>
                  <input type="checkbox" checked={toCustomer} onChange={(event) => setToCustomer(event.target.checked)} className={CHECKBOX} />
                  Applies to Organizations
                </label>
                <label className={CHOICE}>
                  <input type="checkbox" checked={toAccount} onChange={(event) => setToAccount(event.target.checked)} className={CHECKBOX} />
                  Applies to Accounts
                </label>
              </div>
            </SettingsRow>
            {addError ? (
              <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
                {addError}
              </p>
            ) : null}
          </SettingsSection>
        </form>
      ) : null}

      {actionError ? (
        <p role="alert" className={FORM_ALERT}>
          {actionError}
        </p>
      ) : null}

      <SettingsSection
        title="Questions"
        list="AI attributes"
        state={
          isLoading ? (
            <LoadingState label="Loading AI attributes" count={2} />
          ) : loadError ? (
            <ErrorState message={loadError} />
          ) : attributes.length === 0 ? (
            <EmptyState icon={Sparkles} title="No AI attributes yet." detail="Add one and the Copilot answers it on every organization or account page." />
          ) : undefined
        }
      >
        {attributes.map((attribute) => (
          <li key={attribute.id} className="group relative flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className={`${TYPE.body} font-semibold`}>{attribute.name}</p>
              <p className={`${TYPE.bodyMuted} line-clamp-2`}>{attribute.prompt}</p>
              <p className={TYPE.meta}>
                <MetaParts
                  parts={[
                    VALUE_TYPE_LABELS[attribute.value_type],
                    [attribute.applies_to_customer && 'Organizations', attribute.applies_to_account && 'Accounts'].filter(Boolean).join(' & '),
                    attribute.value_type === 'picklist' ? attribute.picklist_options.join(', ') : null,
                    REFRESH_LABELS[attribute.refresh],
                  ]}
                />
              </p>
              {/* Always mounted: each Fill all result is announced in its own row. */}
              <p role="status" className={`${TYPE.meta} empty:sr-only`}>
                {fillNote[attribute.id] ?? ''}
              </p>
            </div>
            <div className={ROW_ACTIONS}>
              <button
                type="button"
                onClick={() => void handleFillAll(attribute)}
                disabled={filling === attribute.id}
                aria-label={`Fill all for ${attribute.name}`}
                className={QUIET}
              >
                {filling === attribute.id ? 'Filling…' : 'Fill all'}
              </button>
              <button type="button" onClick={() => setDeleteTarget(attribute)} aria-label={`Delete ${attribute.name}`} className={ICON_BUTTON}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.name}?`}
          message="Every answer the Copilot or a colleague recorded for it goes with it."
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </SettingsFrame>
  );
```

(The picklist options join with ", " rather than " · " so they read as one meta part.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/pages/settings/BriefDeliveryPage.test.tsx src/pages/settings/AIAttributesPage.test.tsx src/e2e/aiAttributes.test.tsx`
Expected: PASS (if the e2e looked for the old `table` or the "AI Attributes" heading, it now finds the list and "AI attributes").

Run: `npm run lint` (expected: clean).

- [ ] **Step 6: Commit**

```bash
git add src/pages/settings/BriefDeliveryPage.tsx src/pages/settings/AIAttributesPage.tsx src/pages/settings/BriefDeliveryPage.test.tsx src/pages/settings/AIAttributesPage.test.tsx
git add <src/e2e/aiAttributes.test.tsx if Step 5 changed it>
git commit -m "feat(settings): Briefs and AI attributes on the settings frame

Both pages are headed by their nav label; Briefs keeps the whole schedule
in one section with its send-now answer in a status region that stays;
AI attributes is a list of questions with Fill all and Delete on hover,
and its new-attribute form is a section of rows.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Attributes: tabs under the heading, attribute lists on their grid, Custom objects, and Global configuration as a section

**Files:**
- Modify: `src/pages/settings/{SettingsPage,AttributesTabContent,AttributesTable,CustomObjectsPage}.tsx`
- Rename: `src/pages/settings/GlobalConfigSidebar.tsx` → `src/pages/settings/GlobalConfigSection.tsx`, `src/pages/settings/GlobalConfigSidebar.test.tsx` → `src/pages/settings/GlobalConfigSection.test.tsx` (`git mv`)
- Test (update): `src/pages/settings/{SettingsPage,AttributesTabContent,CustomObjectsPage,GlobalConfigSection}.test.tsx`

**Interfaces:**
- Consumes: `ATTRIBUTE_GRID`, `OBJECT_GRID` (Task 1); `SettingsFrame` (`wide`), `SettingsSection` (`list`, `header`, `state`, `action`, `footer`), `SettingsRow`, `SettingsSave`, `SettingsNote`, `Tabs`, `tabId`, `tabPanelId`, `SegmentedControl`, `Toolbar`, `SearchInput`, `ListRow`, `ListHeaderRow`, `Badge`, `Card`, `LoadingState`, `ErrorState`, `EmptyState`, `Select`, `INPUT`, `INVALID`, `CHOICE`, `CHECKBOX`, `CODE`, `NUM`, `BUTTON`, `PRIMARY`, `QUIET`, `ICON_BUTTON`, `OVERLAY`, `FORM_ALERT`, `TYPE` (ui); `settingsTitle`.
- Produces: `GlobalConfigSection` (named export, was `GlobalConfigSidebar`); `AttributesTabContent` loses `modelName` (it only fed the disabled Add Attribute button, removed) and gains `lead?: ReactNode` (the toolbar's lead: Pipeline's Opportunities / Risks switch); `CustomObjectsPage` renders sections only (it is a tab's content; no heading of its own).

Why: spec §9.1 (Attributes tabs onto `Tabs`; Attributes property pills onto `Badge`), §9.2 row 4 (neutral property badges), §5.2 ("never two tab rows stacked": Pipeline's second row becomes a `SegmentedControl`), §5.6 (one `Toolbar`), §4.2 (a list is one card of rows on a tested grid; more than about 20 rows end in "Show all" inside the card; no fixed height), §6.3 (the Global configuration rail becomes a section of rows with Save in its footer), §7 (no tinted type chips; no badge that restates its context: every row is "Visible", and "UI editable" restates the Custom section).

| Part | Layout |
|---|---|
| Heading | `settingsTitle('/settings/data')` ("Attributes"), intro "The fields every organization, account, contact and pipeline record carries, and how full each one is.", `width="wide"` |
| Tabs | directly under the heading: Organization, Account, Contact, Pipeline, Custom objects (`Tabs` with `onChange`, `idBase="attributes"`), the panel `role="tabpanel"` |
| Entity tab | `Toolbar`: lead (Pipeline only: `SegmentedControl` "Pipeline records" Opportunities / Risks), `SearchInput` (label "Search 41 organization attributes", placeholder "Search attributes"), count "41 attributes", actions.extra: Filter (a `BUTTON` with its count, opening an `OVERLAY` popover) and Download (`ICON_BUTTON`); then "Custom attributes" and "System attributes" sections, each a list on `ATTRIBUTE_GRID` with column labels; System shows 20 rows then "Show all 35" in its footer |
| Row | title the display name, meta the API name in `CODE` and, below the grid's breakpoint, type · Required · 64% filled; cells: type, a neutral "Required" badge when required, a neutral usage bar and the percentage in `NUM`; no drag handle, no edit pencil, no `⋯` (none of them did anything) |
| Custom objects tab | admins: section "Custom objects" (action BUTTON "New object"; list on `OBJECT_GRID`: name links to the object, applies to, fields, records, Delete on hover), and "New object" section while adding; members: the lock note |
| Global configuration | a section after the tab panel: rows Organization name (`INPUT`), Organization ARR, Organization MRR, Renewal date, Joined date (`Select`s with their hints); footer: status region, QUIET Reset, PRIMARY "Save changes"; read-only: a lock note in the description and disabled controls |

- [ ] **Step 1: Write the failing tests**

`src/pages/settings/SettingsPage.test.tsx`: in "fetches every organization…", replace the `text-[20px]` assertion with `toHaveClass('text-[22px]', 'font-semibold')`, and `findByText('Custom Attributes')` / `getByText('System Attributes')` with `findByRole('region', { name: 'Custom attributes' })` / `getByRole('region', { name: 'System attributes' })` (every case in the file that waits on 'Custom Attributes' waits on the region instead). Replace "stacks the Global Configuration form under the table below md (UI broken-things fix 5)" with:

```tsx
  it('puts Global configuration in a section after the tab panel, not in a side rail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { count: 2, next: null, previous: null, results: [filledOrg, blankOrg] }))));
    renderSettingsPageAsAdmin();
    await screen.findByRole('region', { name: 'Custom attributes' });
    const form = screen.getByRole('form', { name: 'Global configuration' });
    expect(form).not.toHaveClass('md:w-[320px]');
    const panel = screen.getByRole('tabpanel');
    expect(panel.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(form).getByRole('region', { name: 'Global configuration' })).toBeInTheDocument();
  });

  it('switches attribute sets with tabs directly under the heading, one tab row only', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { count: 2, next: null, previous: null, results: [filledOrg, blankOrg] }))));
    renderSettingsPageAsAdmin();
    const tabs = screen.getByRole('tablist', { name: 'Attribute sets' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Organization', 'Account', 'Contact', 'Pipeline', 'Custom objects']);
    expect(within(tabs).getByRole('tab', { name: 'Organization' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', within(tabs).getByRole('tab', { name: 'Organization' }).id);
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Pipeline' }));
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Pipeline records' })).toBeInTheDocument();
  });

  it('draws attribute rows on the grid: the API name as code, a neutral Required badge, no dead controls', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, { count: 2, next: null, previous: null, results: [filledOrg, blankOrg] }))));
    renderSettingsPageAsAdmin();
    const system = await screen.findByRole('region', { name: 'System attributes' });
    const list = within(system).getByRole('list', { name: 'System attributes' });
    const row = within(list).getAllByRole('listitem')[0];
    expect(row).toHaveClass('@min-[40rem]:grid', '@min-[40rem]:grid-cols-[minmax(14rem,1fr)_7rem_6rem_8rem]');
    expect(row.querySelector('.font-mono-brand')).not.toBeNull();
    expect(within(system).queryAllByText('Visible')).toEqual([]);
    expect(within(system).queryAllByText('UI Editable')).toEqual([]);
    for (const required of within(system).queryAllByText('Required', { selector: 'span.rounded-full' })) expect(required).toHaveClass('bg-subtle', 'text-ink-muted');
    expect(row.querySelector('button')).toBeNull();
  });
```

(`within` and `userEvent` are imported at the top of the file; add them if not.) In "switching to Custom Objects shows the real page…", click the `tab` named "Custom objects" and expect the region "Custom objects" (no `h1` "Custom Objects"). Each Pipeline case clicks the `tab` "Pipeline" and, for Risks, the `SegmentedControl` button "Risks" (`aria-pressed`). A case that looks for a system attribute past the twentieth clicks "Show all" first.

`src/pages/settings/AttributesTabContent.test.tsx`: `renderTab` drops `modelName`. Replace "lets the table scroll sideways inside its own box" with:

```tsx
  it('lists the attributes in cards of rows on the attribute grid, its labels above them from the breakpoint', () => {
    renderTab();
    const custom = screen.getByRole('list', { name: 'Custom attributes' });
    expect(custom.closest('section')).toHaveClass('@container');
    const labels = custom.previousElementSibling!;
    expect(labels).toHaveAttribute('aria-hidden', 'true');
    expect(labels).toHaveClass('hidden', '@min-[40rem]:grid');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('names the empty-state Clear search after the query, apart from the field’s own Clear search', () => {
    render(
      <AttributesTabContent entityLabel="organization" attributes={[]} allAttributes={ATTRS} entities={ROWS} isLoading={false} error={null} searchQuery="zzz" setSearchQuery={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Clear search for “zzz”' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  it('keeps the count beside the search as a polite region', () => {
    renderTab();
    expect(screen.getByRole('status')).toHaveTextContent(`${ATTRS.length} attributes`);
  });
```

The filter cases keep their names ("Filter attributes", "Filter attributes, 1 active", "Clear", "Clear filters"); the popover is found by `getByRole('group', { name: 'Attribute filters' })` and now has `toHaveClass('shadow-lg', 'bg-elevated')`.

`git mv src/pages/settings/GlobalConfigSidebar.test.tsx src/pages/settings/GlobalConfigSection.test.tsx`; in it import `GlobalConfigSection` from `'./GlobalConfigSection'`, render `<GlobalConfigSection />`, rename the describe "GlobalConfigSection", and update: `/Organization Name/` → `/Organization name/`, `/Renewal Date/` → `/Renewal date/` (the option's display value stays the attribute's own display name), `'Set Global Attributes'` → `'Save changes'` (clean: `toHaveAttribute('aria-disabled', 'true')` in place of `toBeDisabled()`), `findByRole('button', { name: 'Saved' })` → `findByText('Saved.')` inside `getByRole('status')`, and "is read-only…": `getByText(/Read-only/)` inside the lock note, no "Save changes" button. Append:

```tsx
  it('lays the configuration out as rows in one section, Save in its footer with a status region that stays', async () => {
    renderCard('admin');
    const user = userEvent.setup();
    const section = screen.getByRole('region', { name: 'Global configuration' });
    expect(within(section).getByLabelText(/Organization ARR/)).toHaveClass('appearance-none');
    const region = within(section).getByRole('status');
    const save = within(section).getByRole('button', { name: 'Save changes' });
    expect(save.parentElement).toHaveClass('border-t', 'justify-end');
    await user.selectOptions(within(section).getByLabelText(/Organization ARR/), 'total_contract_value');
    await user.click(save);
    await waitFor(() => expect(region).toHaveTextContent('Saved.'));
    expect(within(section).getByRole('status')).toBe(region);
  });
```

(add `within` to the file's testing-library import).

`src/pages/settings/CustomObjectsPage.test.tsx`: `name: /New Object/` → `'New object'`; the CSM notice is found in `closest('[data-part="settings-note"]')`; append:

```tsx
  it('lists objects on the object grid: the name links, the figures right-aligned, Delete on hover', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(200, [definition()]))));
    renderPage();
    const link = await screen.findByRole('link', { name: 'Opportunity Line Item' });
    const row = link.closest('li')!;
    expect(row).toHaveClass('@min-[44rem]:grid');
    expect(screen.getByRole('list', { name: 'Custom objects' }).closest('section')).toHaveClass('@container');
    expect(within(row).getByRole('button', { name: 'Delete Opportunity Line Item' }).parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
```

(add `within` to its import).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/settings/SettingsPage.test.tsx src/pages/settings/AttributesTabContent.test.tsx src/pages/settings/GlobalConfigSection.test.tsx src/pages/settings/CustomObjectsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: The page and its tabs**

`src/pages/settings/SettingsPage.tsx`: `filterAttributes`, the five `useAllEntities` reads and the five filtered memos stay; the active tab becomes a key:

```tsx
type AttributeTab = 'organization' | 'account' | 'contact' | 'pipeline' | 'objects';
const TABS: { key: AttributeTab; label: string }[] = [
  { key: 'organization', label: 'Organization' },
  { key: 'account', label: 'Account' },
  { key: 'contact', label: 'Contact' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'objects', label: 'Custom objects' },
];
const PIPELINE = [
  { value: 'Opportunities', label: 'Opportunities' },
  { value: 'Risks', label: 'Risks' },
] as const;
const ID = 'attributes';
```

`const [activeSubTab, setActiveSubTab] = useState<AttributeTab>('organization');` and each `useAllEntities` enable flag compares with the key (`activeSubTab === 'organization'`, …, `activeSubTab === 'pipeline' && pipelineEntity === 'Opportunities'`). Imports: drop `GlobalConfigSidebar`; add `import { GlobalConfigSection } from './GlobalConfigSection';`, `import { SegmentedControl, SettingsFrame, Tabs, tabId, tabPanelId } from '../../components/ui';`, `import { settingsTitle } from './workspaceSettingsNav';`. Every `AttributesTabContent` call drops `modelName`. The return:

```tsx
  const pipelineSwitch = (
    <SegmentedControl label="Pipeline records" options={PIPELINE} value={pipelineEntity} onChange={setPipelineEntity} />
  );
  return (
    <SettingsFrame
      title={settingsTitle('/settings/data')}
      intro="The fields every organization, account, contact and pipeline record carries, and how full each one is."
      width="wide"
    >
      <div className="h-11 border-b border-line-subtle">
        <Tabs label="Attribute sets" idBase={ID} items={TABS} value={activeSubTab} onChange={setActiveSubTab} />
      </div>
      <div role="tabpanel" id={tabPanelId(ID, activeSubTab)} aria-labelledby={tabId(ID, activeSubTab)} className="flex flex-col gap-6">
        {activeSubTab === 'organization' ? (
          <AttributesTabContent key="organization" entityLabel="organization" attributes={filteredOrgAttributes} allAttributes={ORGANIZATION_ATTRIBUTES} entities={organizations} isLoading={orgLoading} error={orgError} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        ) : activeSubTab === 'account' ? (
          <AttributesTabContent key="account" entityLabel="account" attributes={filteredAccountAttributes} allAttributes={ACCOUNT_ATTRIBUTES} entities={accounts} isLoading={accountLoading} error={accountError} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        ) : activeSubTab === 'contact' ? (
          <AttributesTabContent key="contact" entityLabel="contact" attributes={filteredContactAttributes} allAttributes={CONTACT_ATTRIBUTES} entities={contacts} isLoading={contactLoading} error={contactError} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        ) : activeSubTab === 'pipeline' ? (
          // Opportunities and Risks: the Pipelines book's own two kinds, one at a time (their field names collide), switched in the toolbar (spec §5.2: never two tab rows).
          pipelineEntity === 'Opportunities' ? (
            <AttributesTabContent key="opportunity" lead={pipelineSwitch} entityLabel="opportunity" pluralLabel="opportunities" attributes={filteredOpportunityAttributes} allAttributes={OPPORTUNITY_ATTRIBUTES} entities={opportunities} isLoading={opportunityLoading} error={opportunityError} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
          ) : (
            <AttributesTabContent key="risk" lead={pipelineSwitch} entityLabel="risk" attributes={filteredRiskAttributes} allAttributes={RISK_ATTRIBUTES} entities={risks} isLoading={riskLoading} error={riskError} searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
          )
        ) : (
          <CustomObjectsPage />
        )}
      </div>
      <GlobalConfigSection />
    </SettingsFrame>
  );
```

(`pipelineEntity`'s type stays `'Opportunities' | 'Risks'`, the `PIPELINE` values' union. Format the calls one prop per line as the file did; they are written on one line here only for length.)

- [ ] **Step 4: The tab content and the lists**

`src/pages/settings/AttributesTabContent.tsx`: the filter state, memos and the outside-click/Escape effect stay. Props: remove `modelName`; add `/** The toolbar's lead: Pipeline's Opportunities / Risks switch. */ lead?: ReactNode;`. Delete `ICON_BUTTON` and `QUIET_BUTTON` locals and the disabled "Add Attribute" button. Imports: add `import { BUTTON, CHECKBOX, CHOICE, Card, EmptyState, ErrorState, ICON_BUTTON, LoadingState, NUM, OVERLAY, QUIET, SearchInput, TYPE, Toolbar } from '../../components/ui';`; drop `Search`, `Plus`. The return:

```tsx
  const query = searchQuery.trim();
  const filterControl = (
    <div ref={filterRef} className="relative">
      <button
        ref={filterButtonRef}
        type="button"
        aria-label={active > 0 ? `Filter attributes, ${active} active` : 'Filter attributes'}
        aria-expanded={isFilterOpen}
        onClick={() => setIsFilterOpen((open) => !open)}
        className={BUTTON}
      >
        <Filter className="h-4 w-4" aria-hidden="true" />
        Filter
        {active > 0 ? <span className={NUM}>{active}</span> : null}
      </button>
      {isFilterOpen ? (
        <div role="group" aria-label="Attribute filters" className={`absolute right-0 top-full z-20 mt-1 flex w-56 flex-col gap-3 p-3 ${OVERLAY}`}>
          <fieldset className="flex flex-col">
            <legend className={`mb-1 ${TYPE.label}`}>Type</legend>
            {typesPresent.map((type) => (
              <label key={type} className={CHOICE}>
                <input type="checkbox" checked={filters.types.includes(type)} onChange={() => setFilters((current) => ({ ...current, types: toggled(current.types, type) }))} className={CHECKBOX} />
                {ATTRIBUTE_TYPE_LABELS[type]}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col">
            <legend className={`mb-1 ${TYPE.label}`}>Usage</legend>
            {USAGE_OPTIONS.map((option) => (
              <label key={option.key} className={CHOICE}>
                <input type="checkbox" checked={filters.usage.includes(option.key)} onChange={() => setFilters((current) => ({ ...current, usage: toggled(current.usage, option.key) }))} className={CHECKBOX} />
                {option.label}
              </label>
            ))}
          </fieldset>
          <button type="button" disabled={active === 0} onClick={() => setFilters(NO_ATTRIBUTE_FILTERS)} className={QUIET}>
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );

  let body: ReactNode;
  if (isLoading && entities.length === 0)
    body = (
      <Card pad="none">
        <LoadingState label={`Loading ${pluralLabel}`} />
      </Card>
    );
  else if (error)
    body = (
      <Card pad="none">
        <ErrorState message={error} />
      </Card>
    );
  else if (active > 0 && visible.length === 0)
    body = (
      <Card pad="none">
        <EmptyState
          title="No attributes match these filters"
          action={
            <button type="button" onClick={() => setFilters(NO_ATTRIBUTE_FILTERS)} className={QUIET}>
              Clear filters
            </button>
          }
        />
      </Card>
    );
  else if (query && visible.length === 0)
    body = (
      <Card pad="none">
        <EmptyState
          title={`No attributes match “${query}”`}
          action={
            <button type="button" onClick={() => setSearchQuery('')} className={QUIET}>
              Clear search for “{query}”
            </button>
          }
        />
      </Card>
    );
  else body = <AttributesTable entities={entities} attributes={visible} />;

  return (
    <>
      <Toolbar
        lead={lead}
        search={<SearchInput label={`Search ${allAttributes.length} ${entityLabel} attributes`} placeholder="Search attributes" value={searchQuery} onChange={setSearchQuery} />}
        count={`${visible.length} ${visible.length === 1 ? 'attribute' : 'attributes'}`}
        actions={{
          extra: (
            <>
              {filterControl}
              <button type="button" aria-label="Download attributes as CSV" onClick={() => downloadCsv(`${entityLabel}-attributes.csv`, attributesCsv(visible, entities))} className={`${ICON_BUTTON} border border-line`}>
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          ),
        }}
      />
      {body}
    </>
  );
```

(Rewrite the file's comments without em dashes. `ReactNode` joins the `react` import.)

`src/pages/settings/AttributesTable.tsx`, whole file:

```tsx
import { useState } from 'react';
import { Badge, CODE, ListHeaderRow, ListRow, MetaParts, NUM, QUIET, SettingsSection, TYPE } from '../../components/ui';
import { ATTRIBUTE_TYPE_LABELS, usagePercent, type AttributeDef } from './attributeConfig';
import { ATTRIBUTE_GRID } from './attributeGrid';

/** Rows shown before "Show all" (spec §4.1: a list over about 20 rows ends
 *  in Show all inside its card, never a fixed height). */
const PAGE = 20;

export interface AttributesTableProps<T> {
  /** Every record of this entity currently loaded: Filled is computed from these, never fabricated. */
  entities: T[];
  /** Already filtered by the search and the Filter: split into Custom and System here. */
  attributes: AttributeDef<T>[];
}

/** An entity's attributes (settings spec 2026-10-06 §3.3; UI foundations
 *  spec §4.2, §9.2 row 4): Custom, then System, each one card of rows on
 *  the attribute grid. Only Required is a badge, in the neutral tone:
 *  every row is visible, and "UI editable" is what Custom already says. */
export function AttributesTable<T>({ entities, attributes }: AttributesTableProps<T>) {
  return (
    <>
      <AttributeSection title="Custom attributes" attributes={attributes.filter((attr) => attr.isCustom)} entities={entities} />
      <AttributeSection title="System attributes" attributes={attributes.filter((attr) => !attr.isCustom)} entities={entities} />
    </>
  );
}

function AttributeSection<T>({ title, attributes, entities }: { title: string; attributes: AttributeDef<T>[]; entities: T[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? attributes : attributes.slice(0, PAGE);
  return (
    <SettingsSection
      title={title}
      action={<span className={`${TYPE.meta} ${NUM}`}>{attributes.length}</span>}
      list={title}
      header={<ListHeaderRow columns={ATTRIBUTE_GRID.columns} labels={ATTRIBUTE_GRID.labels} align={ATTRIBUTE_GRID.aligns} show={ATTRIBUTE_GRID.headerShow} />}
      state={attributes.length === 0 ? <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>None here.</p> : undefined}
      footer={
        attributes.length > PAGE && !showAll ? (
          <button type="button" onClick={() => setShowAll(true)} className={QUIET}>
            Show all {attributes.length}
          </button>
        ) : undefined
      }
    >
      {shown.map((attr) => {
        const usage = usagePercent(attr, entities);
        const type = ATTRIBUTE_TYPE_LABELS[attr.type];
        return (
          <ListRow
            key={attr.name}
            dataAttrs={{ 'data-attribute': attr.name }}
            title={attr.displayName}
            columns={ATTRIBUTE_GRID.columns}
            gridAt={ATTRIBUTE_GRID.gridAt}
            meta={
              <>
                <span className={CODE}>{attr.name}</span>
                <span className={ATTRIBUTE_GRID.narrowOnly}>
                  {' · '}
                  <MetaParts parts={[type, attr.required ? 'Required' : null, `${usage}% filled`]} />
                </span>
              </>
            }
            cells={[
              <span key="type" className={TYPE.body}>
                {type}
              </span>,
              <span key="required">{attr.required ? <Badge>Required</Badge> : null}</span>,
              <span key="filled" className="flex items-center justify-end gap-2">
                <span aria-hidden="true" className="h-1 w-12 overflow-hidden rounded-full bg-subtle">
                  <span className="block h-full rounded-full bg-ink-muted" style={{ width: `${usage}%` }} />
                </span>
                <span className={`${TYPE.body} ${NUM}`}>{usage}%</span>
              </span>,
            ]}
          />
        );
      })}
    </SettingsSection>
  );
}
```

(The empty card line is a plain `p`, not an `li`, because `state` replaces the list.)

`src/pages/settings/CustomObjectsPage.tsx`: state, effect, `resetAddForm`, `handleAdd` stay; rewrite the long comment without em dashes. Imports: drop `ShieldAlert`; keep `Plus`, `Trash2`; drop `Link` (the row's `href` makes it); add `import { BUTTON, CHECKBOX, CHOICE, EmptyState, ErrorState, ICON_BUTTON, INPUT, ListHeaderRow, ListRow, LoadingState, MetaParts, NUM, PRIMARY, QUIET, SettingsNote, SettingsRow, SettingsSection, TYPE, FORM_ALERT } from '../../components/ui';` and `import { OBJECT_GRID } from './objectGrid';`. The member return: `return <SettingsNote icon="lock">You don't have permission to define custom objects: ask an admin to add one, or open an organization or account page to use what is already there.</SettingsNote>;`. The admin return:

```tsx
  const appliesTo = (definition: CustomObjectDefinition) =>
    [definition.applies_to_customer && 'Organizations', definition.applies_to_account && 'Accounts'].filter(Boolean).join(' & ');
  return (
    <>
      {showAddForm ? (
        <form
          aria-label="New object"
          onSubmit={(event) => {
            event.preventDefault();
            if (newName.trim() && (newAppliesToCustomer || newAppliesToAccount) && !isSubmitting) void handleAdd();
          }}
        >
          <SettingsSection
            title="New object"
            footer={
              <>
                <button type="button" onClick={resetAddForm} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" disabled={!newName.trim() || (!newAppliesToCustomer && !newAppliesToAccount) || isSubmitting} className={PRIMARY}>
                  {isSubmitting ? 'Creating…' : 'Create'}
                </button>
              </>
            }
          >
            <SettingsRow label="Name" htmlFor="object-name">
              <input id="object-name" type="text" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Opportunity line item" className={INPUT} />
            </SettingsRow>
            <SettingsRow label="Applies to" group>
              <div className="flex flex-wrap gap-x-5">
                <label className={CHOICE}>
                  <input type="checkbox" checked={newAppliesToCustomer} onChange={(event) => setNewAppliesToCustomer(event.target.checked)} className={CHECKBOX} />
                  Applies to Organizations
                </label>
                <label className={CHOICE}>
                  <input type="checkbox" checked={newAppliesToAccount} onChange={(event) => setNewAppliesToAccount(event.target.checked)} className={CHECKBOX} />
                  Applies to Accounts
                </label>
              </div>
            </SettingsRow>
            {addError ? (
              <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
                {addError}
              </p>
            ) : null}
          </SettingsSection>
        </form>
      ) : null}

      <SettingsSection
        title="Custom objects"
        description="Your own object types for organizations and accounts. Open one to manage its fields and records."
        action={
          showAddForm ? undefined : (
            <button type="button" onClick={() => setShowAddForm(true)} className={BUTTON}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New object
            </button>
          )
        }
        list="Custom objects"
        header={<ListHeaderRow columns={OBJECT_GRID.columns} labels={OBJECT_GRID.labels} align={OBJECT_GRID.aligns} show={OBJECT_GRID.headerShow} />}
        state={
          isLoading ? (
            <LoadingState label="Loading custom objects" count={2} />
          ) : loadError ? (
            <ErrorState message={loadError} />
          ) : definitions.length === 0 ? (
            <EmptyState title="No custom objects yet." detail="Create one to start tracking your own data on organizations and accounts." />
          ) : undefined
        }
      >
        {definitions.map((definition) => (
          <ListRow
            key={definition.id}
            title={definition.name}
            href={`/custom-objects/${definition.id}`}
            columns={OBJECT_GRID.columns}
            gridAt={OBJECT_GRID.gridAt}
            meta={
              <span className={OBJECT_GRID.narrowOnly}>
                <MetaParts
                  parts={[
                    appliesTo(definition),
                    <>
                      <span className={NUM}>{definition.fields.length}</span> fields
                    </>,
                    <>
                      <span className={NUM}>{definition.records_count}</span> records
                    </>,
                  ]}
                />
              </span>
            }
            cells={[
              <span key="applies" className={TYPE.body}>
                {appliesTo(definition)}
              </span>,
              <span key="fields" className={`block text-right ${TYPE.body} ${NUM}`}>
                {definition.fields.length}
              </span>,
              <span key="records" className={`block text-right ${TYPE.body} ${NUM}`}>
                {definition.records_count}
              </span>,
            ]}
            actions={
              <button type="button" onClick={() => setDeleteTarget(definition)} aria-label={`Delete ${definition.name}`} className={ICON_BUTTON}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            }
          />
        ))}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete "${deleteTarget.name}"?`}
          message="This deletes every field and every record of this object type. It can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await deleteCustomObjectDefinition(deleteTarget.id);
            setDefinitions((current) => current.filter((d) => d.id !== deleteTarget.id));
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
```

(The test "an admin sees the real list…" expected `getByText('Accounts')`: the applies-to cell holds it, hidden below the breakpoint by `@min-[44rem]:block` only visually in a browser; jsdom has no container queries, so the cell and the narrow meta both render the text. Use `getAllByText('Accounts')[0]` there.)

- [ ] **Step 5: Global configuration as a section**

`git mv src/pages/settings/GlobalConfigSidebar.tsx src/pages/settings/GlobalConfigSection.tsx`. In it: rename the export to `GlobalConfigSection`; `CONCEPTS`' labels become sentence case where they are words (`'Organization ARR'`, `'Organization MRR'`, `'Renewal date'`, `'Joined date'`); the state, the effect and `submit` stay, except that `status` keeps `'saved'` until the next edit (delete the `setTimeout`) and `setName`/`setMapping` set `status` back to `'idle'`. Imports: drop `HelpCircle`, `Info`; add `import { INPUT, INVALID, QUIET, Select, SettingsNote, SettingsRow, SettingsSave, SettingsSection, FORM_ALERT } from '../../components/ui';`. The doc comment's first line becomes "Global configuration (settings spec 2026-10-06 §3.3; UI foundations spec §6.3): a section of rows, no longer a side rail." The return:

```tsx
  return (
    <form onSubmit={submit} aria-label="Global configuration">
      <SettingsSection
        title="Global configuration"
        description={
          canManage ? (
            'These choices apply across the whole organisation: every screen that shows ARR, MRR, a renewal or a joined date reads the field chosen here.'
          ) : (
            <SettingsNote icon="lock">Read-only: changing these needs organisation settings access.</SettingsNote>
          )
        }
        action={
          canManage && dirty ? (
            <button type="button" onClick={resetFromServer} className={QUIET}>
              Reset
            </button>
          ) : undefined
        }
        footer={canManage ? <SettingsSave dirty={dirty} saving={status === 'saving'} status={status === 'saved' ? 'Saved.' : ''} /> : undefined}
      >
        <SettingsRow label="Organization name" htmlFor="org-name" hint="Required." hintId="org-name-hint">
          <input id="org-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!canManage} required aria-describedby="org-name-hint" className={`${INPUT} ${INVALID}`} />
        </SettingsRow>
        {CONCEPTS.map((concept) => (
          <SettingsRow key={concept.key} label={concept.label} htmlFor={`global-${concept.key}`} hint={concept.hint} hintId={`global-${concept.key}-hint`}>
            <Select
              id={`global-${concept.key}`}
              label={concept.label}
              labelPosition="external"
              value={mapping[concept.key]}
              disabled={!canManage}
              describedBy={`global-${concept.key}-hint`}
              onChange={(value) => setMapping({ ...mapping, [concept.key]: value })}
              options={(choices?.[concept.key] ?? [mapping[concept.key]]).map((field) => ({ value: field, label: displayName(field) }))}
            />
          </SettingsRow>
        ))}
        {error ? (
          <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
            {error}
          </p>
        ) : null}
      </SettingsSection>
    </form>
  );
```

(Reset sits on the section's heading row while there are edits to drop; the footer keeps the status region and the one primary last. `submit` still returns early while clean.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/pages/settings/SettingsPage.test.tsx src/pages/settings/AttributesTabContent.test.tsx src/pages/settings/GlobalConfigSection.test.tsx src/pages/settings/CustomObjectsPage.test.tsx src/pages/settings/attributeFilters.test.ts src/pages/settings/settingsGrids.test.ts`
Expected: PASS ("resets unsaved edits…" finds Reset on the heading row while dirty).

Run: `npm run lint` (expected: clean; no file imports `GlobalConfigSidebar` any more: `grep -rn GlobalConfigSidebar src` prints nothing).

- [ ] **Step 7: Commit**

```bash
git add src/pages/settings/SettingsPage.tsx src/pages/settings/AttributesTabContent.tsx src/pages/settings/AttributesTable.tsx src/pages/settings/CustomObjectsPage.tsx \
  src/pages/settings/GlobalConfigSection.tsx src/pages/settings/GlobalConfigSection.test.tsx \
  src/pages/settings/SettingsPage.test.tsx src/pages/settings/AttributesTabContent.test.tsx src/pages/settings/CustomObjectsPage.test.tsx
git commit -m "feat(settings): Attributes on the settings frame

Attribute sets are tabs under the heading, Pipeline's kinds a segmented
control in the toolbar; each set is two cards of rows on the attribute
grid with Required as the one neutral badge and Show all past twenty;
Custom objects sit on their own grid; Global configuration leaves the
side rail for a section of rows with Save in its footer.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(`git mv` in Step 5 staged the rename; the `git add` picks up its edits.)

---

### Task 11: People & teams: tabs under the heading, the Members table flush in its card, Roles and Access in sections, dialogs on `BuilderDialog`

**Files:**
- Modify: `src/pages/users/UserManagement.tsx`, `src/pages/users/AccessTab.tsx`
- Test (update): `src/pages/users/UserManagement.test.tsx`, `src/pages/users/AccessTab.test.tsx`

**Interfaces:**
- Consumes: `BuilderDialog` (`components/segments/BuilderDialog.tsx`, `size="narrow"`); `SettingsFrame` (`wide`), `SettingsSection`, `SettingsRow`, `Tabs`, `tabId`, `tabPanelId`, `Select`, `Badge`, `MetaParts`, `OverflowMenu`, `ROW_ACTIONS`, `TABLE`, `TH`, `TD`, `INPUT`, `INVALID`, `CHOICE`, `CHECKBOX`, `CODE`, `NUM`, `BUTTON`, `PRIMARY`, `QUIET`, `ICON_BUTTON`, `FIELD_ERROR`, `FORM_ALERT`, `EmptyState`, `LoadingState`, `TYPE` (ui); `settingsTitle`.
- Produces: nothing new. `AccessTab({ roles })` keeps its signature.

Why: spec §9.1 (Settings › People tabs onto `Tabs`; the per-page `max-w-4xl mx-auto` wrapper; every bare select onto `Select`), §4.2 (Members is one of the four tables flush in their card; Roles and Access are lists, one card of rows each, not a card per role), §5.1 (one primary per form: the "Add team member" opener is a `BUTTON`, the dialog owns its primary), §7 (Active and Deactivated are not alarms; Verified is a real success; a domain proved by another organisation is a real failure), the house rules (`bg-black/40`, `text-white`, an unnamed close button and an untrapped modal go).

| Part | Layout |
|---|---|
| Heading | `settingsTitle('/settings/people')`, intro "The people in your organisation and what each role is allowed to do.", `width="wide"`; on Members, the frame's `action` BUTTON "Add team member" |
| Tabs | Members, Roles, Access (`Tabs` with `onChange`, `idBase="people"`) directly under the heading; the panel `role="tabpanel"`; a tab change clears the slice's error |
| Members | section "Members" (count in the action slot), the table flush: Name (avatar and name), Email (truncated with `title`), Role, Function, Manager (`Select labelPosition="hidden"`), Status ("Active" in muted text, or a neutral "Deactivated" badge), and `Actions for <name>` (`OverflowMenu`: Edit, then Deactivate in danger or Reactivate); sentence-case `TH` |
| Roles | section "Roles" (action BUTTON "New role"), a list: each role's name, a neutral "Built-in" badge, "3 people" (`NUM`), Delete on hover (custom roles), and its capability checkboxes in two columns; "New role" section while adding: Role name, Permissions (`group`), footer QUIET Cancel + PRIMARY "Create role" |
| Access | "Waiting to join" (a list: name, `MetaParts` email · asked 3 Oct, the role `Select`, BUTTON Approve, Reject on hover), "Invitations" (a form section: Work email, Role, footer status + PRIMARY "Send invitation"), "Pending invitations" (a list when any: email, `MetaParts` role · invited by · expires, Cancel on hover), and for `manage_org_settings` "Email domains" (a form section: Domain, footer PRIMARY "Add domain") and "Domains" (a list: domain, its state in words, a success "Verified" or danger "Claimed elsewhere" badge, or BUTTON "Check DNS"; the TXT record on `bg-subtle` in `CODE` with Copy; a per-row status region) |
| Dialogs | Add team member and Edit <name> on `BuilderDialog size="narrow"`: labels above, hint and error under each field, footer QUIET Cancel + PRIMARY |

- [ ] **Step 1: Update the tests to the new markup (they fail first)**

`src/pages/users/UserManagement.test.tsx`:
- "lists every member on mount…": the heading assertion becomes `toHaveClass('text-[22px]', 'font-semibold')`; `screen.getByRole('table').parentElement` keeps `overflow-x-auto`.
- Replace "keeps the page to its frame on a phone and the table within its card on desktop (UI broken-things fix 4)" with:

```tsx
  it('keeps the page in the wide settings frame, the table flush in its card with the house cells (UI broken-things fix 4)', async () => {
    stubFetch(() => undefined);
    renderPage();
    await screen.findAllByText('Carl CSM');
    const heading = screen.getByRole('heading', { level: 1, name: 'People & teams' });
    const frame = heading.closest('.max-w-5xl')!;
    expect(frame).toHaveClass('w-full');
    expect(frame).not.toHaveClass('mx-auto');
    const table = screen.getByRole('table');
    expect(table.closest('.rounded-xl')).not.toBeNull();
    for (const header of within(table).getAllByRole('columnheader')) {
      expect(header).toHaveClass('px-4', 'text-[11px]', 'font-semibold');
      expect(header.className).not.toMatch(/uppercase/);
    }
    expect(screen.getByTitle('carl@acme.io')).toHaveClass('max-w-[16rem]', 'truncate');
  });

  it('switches Members, Roles and Access with tabs under the heading', async () => {
    stubFetch(() => undefined);
    renderPage();
    const tabs = screen.getByRole('tablist', { name: 'People sections' });
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Members', 'Roles', 'Access']);
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Roles' }));
    expect(within(tabs).getByRole('tab', { name: 'Roles' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', within(tabs).getByRole('tab', { name: 'Roles' }).id);
    expect(screen.queryByRole('button', { name: 'Add team member' })).toBeNull();
  });

  it('shows a deactivated member as a neutral badge, never red, and active as plain words', async () => {
    stubFetch((_url, options) => (options?.method === 'PATCH' ? jsonResponse(200, { ...carl, is_active: false }) : undefined));
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    expect(within(screen.getByRole('table')).getAllByText('Active')[0]).not.toHaveClass('bg-success-dim');
    await user.click(screen.getByRole('button', { name: 'Actions for Carl CSM' }));
    await user.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
    const badge = await screen.findByText('Deactivated');
    expect(badge).toHaveClass('bg-subtle', 'text-ink-muted');
  });

  it('adds a member in a trapped dialog: labels above, the short password marked on its field', async () => {
    stubFetch(() => undefined);
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText('Carl CSM');
    await user.click(screen.getByRole('button', { name: 'Add team member' }));
    const dialog = screen.getByRole('dialog', { name: 'Add team member' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Name'), 'Dana New');
    await user.type(within(dialog).getByLabelText('Email'), 'dana@acme.io');
    await user.type(within(dialog).getByLabelText('Temporary password'), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Add member' }));
    const password = within(dialog).getByLabelText('Temporary password');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription(/Password must be at least 8 characters\./);
  });
```

- Existing cases: `/Add Team Member/` → `'Add team member'`; `'Add Member'` → `'Add member'` (inside the dialog); "deactivates a member from the row action" opens `Actions for Carl CSM` and picks the `menuitem` `Deactivate`; "edits a member…" opens the same menu and picks `Edit`, then finds the dialog `Edit Carl CSM`; `openRolesTab` clicks the `tab` "Roles" (was the button "roles"); `/New Role/` → `'New role'`; `'Create Role'` → `'Create role'`; "a custom role can be deleted…" keeps `Delete Support Lead`.

`src/pages/users/AccessTab.test.tsx`: "cancels an invitation" clicks `Cancel the invitation to <email>` (the fixture's address); append:

```tsx
describe('Access on the settings frame (UI foundations spec §6.3, §7)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts each part in its own section and the invitation news in a status region that stays', async () => {
    stubFetch(() => undefined);
    renderTab();
    const waiting = await screen.findByRole('region', { name: 'Waiting to join' });
    expect(within(waiting).getByRole('list', { name: 'Waiting to join' })).toHaveClass('divide-y');
    const invitations = screen.getByRole('region', { name: 'Invitations' });
    const region = within(invitations).getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(within(invitations).getByRole('button', { name: 'Send invitation' })).toHaveClass('bg-accent');
  });

  it('shows the TXT record as code on a quiet ground, not a box', async () => {
    stubFetch(() => undefined);
    renderTab();
    const domains = await screen.findByRole('region', { name: 'Domains' });
    const code = within(domains).getAllByText((_, element) => element?.tagName === 'CODE')[0];
    expect(code).toHaveClass('font-mono-brand');
    expect(code.className).not.toMatch(/\bborder\b/);
  });
});
```

(`stubFetch` and `renderTab` are the file's own; `stubFetch(() => undefined)` answers the three reads with the default fixtures.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/users`
Expected: FAIL.

- [ ] **Step 3: The page, the tabs and Members**

`src/pages/users/UserManagement.tsx`: rewrite the file comment without em dashes ("Settings › Workspace › People & teams: Members, Roles and Access (AccessTab.tsx). Reachable with manage_users, which the backend enforces on every endpoint here."). Imports: drop `X`, `AlertCircle`, `ShieldCheck`; keep `Plus`, `Trash2`; add `import { BuilderDialog } from '../../components/segments/BuilderDialog';`, `import { BUTTON, Badge, CHECKBOX, EmptyState, FIELD_ERROR, FORM_ALERT, ICON_BUTTON, INPUT, INVALID, LoadingState, NUM, OverflowMenu, PRIMARY, QUIET, ROW_ACTIONS, Select, SettingsFrame, SettingsRow, SettingsSection, TABLE, TD, TH, TYPE, Tabs, tabId, tabPanelId } from '../../components/ui';` and `import { settingsTitle } from '../settings/workspaceSettingsNav';`. Delete `ModalShell`, `FormField`, `SelectField`, `ModalError`.

```tsx
type PeopleTab = 'members' | 'roles' | 'access';
const TABS: { key: PeopleTab; label: string }[] = [
  { key: 'members', label: 'Members' },
  { key: 'roles', label: 'Roles' },
  { key: 'access', label: 'Access' },
];
const ID = 'people';
const FUNCTIONS = (Object.keys(FUNCTION_LABELS) as UserFunction[]).map((key) => ({ value: key, label: FUNCTION_LABELS[key] }));
// A disabled capability (a built-in role): the words in the muted ink, the box not clickable.
const CHOICE_OFF = 'flex min-h-11 sm:min-h-9 cursor-not-allowed items-center gap-2 text-[13px] leading-5 text-ink-muted';
const CHOICE_ON = 'flex min-h-11 sm:min-h-9 cursor-pointer items-center gap-2 text-[13px] leading-5 text-ink';

export function UserManagement() {
  const dispatch = useAppDispatch();
  const { members, roles, isLoading, error } = useAppSelector((state) => state.userManagement);
  const [tab, setTab] = useState<PeopleTab>('members');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  useEffect(() => {
    dispatch(fetchMembers());
    dispatch(fetchRoles());
    dispatch(fetchCapabilities());
  }, [dispatch]);

  return (
    <SettingsFrame
      title={settingsTitle('/settings/people')}
      intro="The people in your organisation and what each role is allowed to do."
      width="wide"
      action={
        tab === 'members' ? (
          <button type="button" onClick={() => setShowAddModal(true)} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add team member
          </button>
        ) : undefined
      }
    >
      <div className="h-11 border-b border-line-subtle">
        <Tabs
          label="People sections"
          idBase={ID}
          items={TABS}
          value={tab}
          onChange={(next) => {
            setTab(next);
            dispatch(clearUserManagementError());
          }}
        />
      </div>
      <div role="tabpanel" id={tabPanelId(ID, tab)} aria-labelledby={tabId(ID, tab)} className="flex flex-col gap-6">
        {error ? (
          <p role="alert" className={FORM_ALERT}>
            {error}
          </p>
        ) : null}
        {tab === 'members' ? <MembersTab members={members} roles={roles} isLoading={isLoading} onEdit={setEditingMember} /> : null}
        {tab === 'roles' ? <RolesTab /> : null}
        {tab === 'access' ? <AccessTab roles={roles} /> : null}
      </div>
      {showAddModal ? <AddMemberModal roles={roles} onClose={() => setShowAddModal(false)} /> : null}
      {editingMember ? <EditMemberModal member={editingMember} onClose={() => setEditingMember(null)} /> : null}
    </SettingsFrame>
  );
}

function MembersTab({ members, roles, isLoading, onEdit }: { members: Member[]; roles: Role[]; isLoading: boolean; onEdit: (member: Member) => void }) {
  return (
    <SettingsSection
      title="Members"
      action={<span className={`${TYPE.meta} ${NUM}`}>{members.length}</span>}
      state={isLoading && members.length === 0 ? <LoadingState label="Loading members" /> : members.length === 0 ? <EmptyState title="No team members yet." /> : undefined}
    >
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              {['Name', 'Email', 'Role', 'Function', 'Manager', 'Status'].map((label) => (
                <th key={label} scope="col" className={TH}>
                  {label}
                </th>
              ))}
              <th scope="col" className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {members.map((member) => (
              <MemberRow key={member.id} member={member} roles={roles} members={members} onEdit={() => onEdit(member)} />
            ))}
          </tbody>
        </table>
      </div>
    </SettingsSection>
  );
}

function MemberRow({ member, roles, members, onEdit }: { member: Member; roles: Role[]; members: Member[]; onEdit: () => void }) {
  const dispatch = useAppDispatch();
  return (
    <tr>
      <td className={TD}>
        <div className="flex items-center gap-2.5">
          <img src={member.avatar} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
          <span className="truncate font-semibold">{member.name}</span>
        </div>
      </td>
      <td className={`${TD} text-ink-muted`}>
        {/* A block inside the cell: table cells ignore max-width (fix round 1). */}
        <span title={member.email} className="block max-w-[16rem] truncate">
          {member.email}
        </span>
      </td>
      <td className={TD}>
        {/* Inline, so reassigning somebody is one choice. The backend refuses to strip the last person who can manage users; that refusal lands in the page alert. */}
        <Select
          label={`Role for ${member.name}`}
          labelPosition="hidden"
          value={String(member.role_id ?? '')}
          onChange={(value) => dispatch(updateMember({ id: member.id, role_id: Number(value) }))}
          options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
          className="min-w-36"
        />
      </td>
      <td className={TD}>
        {/* Where they work: stamps their contributions and finds "the responsible person". Not a permission. */}
        <Select
          label={`Function for ${member.name}`}
          labelPosition="hidden"
          value={member.function}
          onChange={(value) => dispatch(updateMember({ id: member.id, function: value }))}
          options={FUNCTIONS}
          className="min-w-36"
        />
      </td>
      <td className={TD}>
        {/* The org chart: what a person may see of what others say is read from it. The backend refuses a loop. */}
        <Select
          label={`Manager for ${member.name}`}
          labelPosition="hidden"
          value={String(member.reports_to?.id ?? '')}
          onChange={(value) => dispatch(updateMember({ id: member.id, reports_to_id: value ? Number(value) : null }))}
          options={[{ value: '', label: 'Nobody' }, ...members.filter((m) => m.id !== member.id).map((m) => ({ value: String(m.id), label: m.name }))]}
          className="min-w-40 max-w-[12rem]"
        />
      </td>
      <td className={TD}>{member.is_active ? <span className="text-ink-muted">Active</span> : <Badge>Deactivated</Badge>}</td>
      <td className={`${TD} text-right`}>
        <OverflowMenu
          label={`Actions for ${member.name}`}
          items={[
            { key: 'edit', label: 'Edit', onSelect: onEdit },
            member.is_active
              ? { key: 'deactivate', label: 'Deactivate', onSelect: () => void dispatch(updateMember({ id: member.id, is_active: false })), danger: true }
              : { key: 'reactivate', label: 'Reactivate', onSelect: () => void dispatch(updateMember({ id: member.id, is_active: true })) },
          ]}
        />
      </td>
    </tr>
  );
}
```

(`FUNCTIONS`' values are `UserFunction`, so `updateMember` gets a `UserFunction`. The avatar's `alt` is empty: the name beside it says who it is.)

- [ ] **Step 4: Roles**

```tsx
function RolesTab() {
  const dispatch = useAppDispatch();
  const { roles, capabilities } = useAppSelector((state) => state.userManagement);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPermissions, setNewPermissions] = useState<Capability[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  function resetForm() {
    setShowAddForm(false);
    setNewName('');
    setNewPermissions([]);
    setAddError(null);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    setIsSaving(true);
    try {
      await dispatch(addRole({ name: newName, permissions: newPermissions })).unwrap();
      resetForm();
    } catch (err) {
      setAddError(typeof err === 'string' ? err : 'Could not create this role.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {showAddForm ? (
        <form onSubmit={handleAdd} aria-label="New role">
          <SettingsSection
            title="New role"
            footer={
              <>
                <button type="button" onClick={resetForm} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" disabled={isSaving || !newName.trim()} className={PRIMARY}>
                  {isSaving ? 'Creating…' : 'Create role'}
                </button>
              </>
            }
          >
            <SettingsRow label="Role name" htmlFor="new-role-name" error={addError ?? undefined} errorId="new-role-error">
              <input
                id="new-role-name"
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                autoFocus
                aria-invalid={Boolean(addError)}
                aria-describedby={addError ? 'new-role-error' : undefined}
                className={`${INPUT} ${INVALID}`}
              />
            </SettingsRow>
            <SettingsRow label="Permissions" group stacked>
              <CapabilityCheckboxes capabilities={capabilities} selected={newPermissions} onChange={setNewPermissions} />
            </SettingsRow>
          </SettingsSection>
        </form>
      ) : null}

      <SettingsSection
        title="Roles"
        description="A role grants a set of permissions. The built-in Admin and CSM roles can't be changed."
        action={
          showAddForm ? undefined : (
            <button type="button" onClick={() => setShowAddForm(true)} className={BUTTON}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New role
            </button>
          )
        }
        list="Roles"
      >
        {roles.map((role) => (
          <RoleRow key={role.id} role={role} capabilities={capabilities} onDelete={() => setDeleteTarget(role)} />
        ))}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete the "${deleteTarget.name}" role?`}
          message="This can't be undone. Anyone still holding it must be moved to another role first."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await dispatch(deleteRole(deleteTarget.id)).unwrap();
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

function RoleRow({ role, capabilities, onDelete }: { role: Role; capabilities: { key: Capability; label: string }[]; onDelete: () => void }) {
  const dispatch = useAppDispatch();
  function toggle(capability: Capability, checked: boolean) {
    const next = checked ? [...role.permissions, capability] : role.permissions.filter((c) => c !== capability);
    dispatch(updateRole({ id: role.id, permissions: next }));
  }
  return (
    <li className="group relative flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <p className={`${TYPE.body} font-semibold`}>{role.name}</p>
        {role.is_system ? <Badge>Built-in</Badge> : null}
        <span className={TYPE.meta}>
          <span className={NUM}>{role.users_count}</span> {role.users_count === 1 ? 'person' : 'people'}
        </span>
        {role.is_system ? null : (
          <div className={`ml-auto ${ROW_ACTIONS}`}>
            <button type="button" onClick={onDelete} aria-label={`Delete ${role.name}`} className={ICON_BUTTON}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <CapabilityCheckboxes capabilities={capabilities} selected={role.permissions} onChange={() => {}} onToggle={role.is_system ? undefined : toggle} disabled={role.is_system} />
    </li>
  );
}

function CapabilityCheckboxes({
  capabilities,
  selected,
  onChange,
  onToggle,
  disabled,
}: {
  capabilities: { key: Capability; label: string }[];
  selected: Capability[];
  onChange: (next: Capability[]) => void;
  /** Provided when each tick should save at once (an existing role); otherwise the form collects them and submits once. */
  onToggle?: (capability: Capability, checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
      {capabilities.map((capability) => (
        <label key={capability.key} className={disabled ? CHOICE_OFF : CHOICE_ON}>
          <input
            type="checkbox"
            disabled={disabled}
            checked={selected.includes(capability.key)}
            onChange={(event) => {
              if (onToggle) {
                onToggle(capability.key, event.target.checked);
                return;
              }
              onChange(event.target.checked ? [...selected, capability.key] : selected.filter((c) => c !== capability.key));
            }}
            className={CHECKBOX}
          />
          {capability.label}
        </label>
      ))}
    </div>
  );
}
```

(`CHOICE` from ui is the same string as `CHOICE_ON` minus `cursor-pointer`; the two local strings exist because a disabled choice needs the muted ink, and a colour may not follow another in one class list.)

- [ ] **Step 5: The member dialogs**

```tsx
/** A dialog field: the label above, a hint and an error under it, the control naming both. */
function Field({
  label,
  id,
  hint,
  error,
  children,
}: {
  label: string;
  id: string;
  hint?: string;
  error?: string | null;
  children: (described: string | undefined) => ReactNode;
}) {
  const described = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      {children(described)}
      {hint ? (
        <p id={`${id}-hint`} className={TYPE.meta}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

const DIALOG_BODY = 'flex flex-col gap-4 overflow-y-auto px-4 py-4';
const DIALOG_FOOTER = 'flex justify-end gap-2 border-t border-line-subtle px-4 py-3';

function AddMemberModal({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const ids = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [fn, setFn] = useState<UserFunction>('cs');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPasswordError(null);
    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    setIsSaving(true);
    try {
      await dispatch(addMember({ name, email, password, function: fn, ...(roleId ? { role_id: Number(roleId) } : {}) })).unwrap();
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Could not add team member.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <BuilderDialog title="Add team member" size="narrow" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-col">
        <div className={DIALOG_BODY}>
          <Field label="Name" id={`${ids}-name`}>
            {(described) => <input id={`${ids}-name`} type="text" value={name} onChange={(event) => setName(event.target.value)} aria-describedby={described} className={INPUT} />}
          </Field>
          <Field label="Email" id={`${ids}-email`}>
            {(described) => <input id={`${ids}-email`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={described} className={INPUT} />}
          </Field>
          <Select label="Function" value={fn} onChange={setFn} options={FUNCTIONS} />
          <Select label="Role" value={roleId} onChange={setRoleId} options={[{ value: '', label: 'CSM (default)' }, ...roles.map((role) => ({ value: String(role.id), label: role.name }))]} />
          <Field label="Temporary password" id={`${ids}-password`} hint="Share this with them directly: no invite email is sent." error={passwordError}>
            {(described) => (
              <input
                id={`${ids}-password`}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(passwordError)}
                aria-describedby={described}
                className={`${INPUT} ${INVALID}`}
              />
            )}
          </Field>
          {error ? (
            <p role="alert" className={FORM_ALERT}>
              {error}
            </p>
          ) : null}
        </div>
        <div className={DIALOG_FOOTER}>
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving || !name || !email || !password} className={PRIMARY}>
            {isSaving ? 'Adding…' : 'Add member'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}
```

`EditMemberModal` takes the same shape: `BuilderDialog title={`Edit ${member.name}`} size="narrow"`, a `Name` field, a `Reset password (optional)` field (placeholder "Leave blank to keep the current password", hint "Sets a new password directly: share it with them yourself.", error "New password must be at least 8 characters." on that field), the form `error` as `FORM_ALERT`, footer QUIET Cancel + PRIMARY "Save changes". `ReactNode` and `useId` join the `react` import.

- [ ] **Step 6: Access**

`src/pages/users/AccessTab.tsx`: `formatDate` and every handler stay; rewrite the header comment without em dashes. Imports: drop `AlertCircle`, `Clock`, `Globe`, `Mail`, `ShieldCheck`, `X`; keep `Check`, `Copy`, `Loader2`; add `import { BUTTON, Badge, CODE, FORM_ALERT, INPUT, INVALID, MetaParts, PRIMARY, QUIET, ROW_ACTIONS, Select, SettingsRow, SettingsSection, TYPE } from '../../components/ui';`.

`AccessTab`'s return:

```tsx
  return (
    <>
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
      <RequestsSection requests={requests} roles={roles} />
      <InvitationsSection invitations={invitations} roles={roles} />
      {canManageDomains ? <DomainsSection domains={domains} /> : null}
    </>
  );
```

`RequestsSection`'s return:

```tsx
  return (
    <SettingsSection
      title="Waiting to join"
      description="They signed in with a company address and hold nothing until you choose a role and approve."
      list="Waiting to join"
      state={requests.length === 0 ? <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>Nobody is waiting.</p> : undefined}
    >
      {requests.map((request) => (
        <li key={request.id} className="group relative flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <p title={request.user_name} className={`${TYPE.body} truncate font-semibold`}>
              {request.user_name}
            </p>
            <p className={`${TYPE.meta} truncate`}>
              <MetaParts parts={[request.email, `asked ${formatDate(request.requested_at)}`]} />
            </p>
          </div>
          <Select
            id={`request-role-${request.id}`}
            label={`Role for ${request.user_name}`}
            labelPosition="hidden"
            value={String(chosenRole[request.id] ?? defaultRole?.id ?? '')}
            onChange={(value) => setChosenRole((current) => ({ ...current, [request.id]: Number(value) }))}
            options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
            className="w-40"
          />
          <button type="button" onClick={() => void decide(request, 'approve')} disabled={busy === request.id || !defaultRole} className={BUTTON}>
            <Check className="h-4 w-4" aria-hidden="true" />
            Approve
          </button>
          <div className={ROW_ACTIONS}>
            <button type="button" onClick={() => void decide(request, 'reject')} disabled={busy === request.id} className={QUIET}>
              Reject
            </button>
          </div>
        </li>
      ))}
    </SettingsSection>
  );
```

`InvitationsSection`'s return:

```tsx
  return (
    <>
      <form onSubmit={handleInvite} noValidate aria-label="Invite someone">
        <SettingsSection
          title="Invitations"
          description="They sign in with the invited address and are let straight in with this role. Nothing to forward; open for seven days."
          footer={
            <>
              {/* Always mounted: the sent news is announced. */}
              <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
                {sent ? `Invitation sent to ${sent}.` : ''}
              </p>
              <button type="submit" disabled={sending} aria-busy={sending || undefined} className={PRIMARY}>
                {sending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
                Send invitation
              </button>
            </>
          }
        >
          <SettingsRow label="Work email" htmlFor="invite-email" error={formError ?? undefined} errorId="invite-error">
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'invite-error' : undefined}
              className={`${INPUT} ${INVALID}`}
            />
          </SettingsRow>
          <SettingsRow label="Role" htmlFor="invite-role">
            <Select
              id="invite-role"
              label="Role"
              labelPosition="external"
              value={String(effectiveRole ?? '')}
              onChange={(value) => setRoleId(Number(value))}
              options={roles.map((role) => ({ value: String(role.id), label: role.name }))}
              className="sm:max-w-xs"
            />
          </SettingsRow>
        </SettingsSection>
      </form>
      {invitations.length > 0 ? (
        <SettingsSection title="Pending invitations" list="Pending invitations">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="group relative flex items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <p title={invitation.email} className={`${TYPE.body} truncate font-semibold`}>
                  {invitation.email}
                </p>
                <p className={`${TYPE.meta} truncate`}>
                  <MetaParts parts={[invitation.role_name, invitation.invited_by_name ? `invited by ${invitation.invited_by_name}` : null, `expires ${formatDate(invitation.expires_at)}`]} />
                </p>
              </div>
              <div className={ROW_ACTIONS}>
                <button type="button" onClick={() => dispatch(cancelInvitation(invitation.id))} aria-label={`Cancel the invitation to ${invitation.email}`} className={QUIET}>
                  Cancel
                </button>
              </div>
            </li>
          ))}
        </SettingsSection>
      ) : null}
    </>
  );
```

`DomainsSection`'s return:

```tsx
  return (
    <>
      <form onSubmit={handleAdd} noValidate aria-label="Add a domain">
        <SettingsSection
          title="Email domains"
          description="Prove a domain with a DNS record and anyone signing in with it is routed here to ask to join. Adding one proves nothing on its own."
          footer={
            <button type="submit" disabled={adding || !domain.trim()} className={PRIMARY}>
              Add domain
            </button>
          }
        >
          <SettingsRow label="Domain" htmlFor="domain-name" error={formError ?? undefined} errorId="domain-error">
            <input
              id="domain-name"
              type="text"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              placeholder="company.com"
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'domain-error' : undefined}
              className={`${INPUT} ${INVALID} ${CODE}`}
            />
          </SettingsRow>
        </SettingsSection>
      </form>
      {domains.length > 0 ? (
        <SettingsSection title="Domains" list="Domains">
          {domains.map((record) => (
            <li key={record.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className={`${TYPE.body} ${CODE} truncate font-semibold`}>{record.domain}</p>
                  <p className={TYPE.meta}>
                    {record.verification_status === 'verified'
                      ? `Verified ${formatDate(record.verified_at)}`
                      : record.verification_status === 'revoked'
                        ? 'Another organisation proved this domain'
                        : 'Not verified yet'}
                  </p>
                </div>
                {record.verification_status === 'verified' ? (
                  <Badge tone="success">Verified</Badge>
                ) : record.verification_status === 'revoked' ? (
                  <Badge tone="danger">Claimed elsewhere</Badge>
                ) : (
                  <button type="button" onClick={() => void handleVerify(record)} disabled={verifying === record.id} aria-busy={verifying === record.id || undefined} className={BUTTON}>
                    {verifying === record.id ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : null}
                    Check DNS
                  </button>
                )}
              </div>
              {record.dns_record ? (
                <div className={`flex flex-col gap-1.5 rounded-lg bg-subtle px-3 py-2 ${TYPE.meta}`}>
                  <p>
                    Publish this <span className={`${CODE} text-ink`}>TXT</span> record on <span className={`${CODE} text-ink`}>{record.dns_record.name}</span>:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className={`flex-1 break-all ${CODE} text-[11px] leading-4 text-ink`}>{record.dns_record.value}</code>
                    <button type="button" onClick={() => void copyRecord(record)} aria-label="Copy record value" className={QUIET}>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      {copied === record.id ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              ) : null}
              {/* Always mounted per row: the Check DNS answer is announced. */}
              <p role="status" className={`${TYPE.meta} empty:sr-only`}>
                {verifyMessage[record.id] ?? ''}
              </p>
            </li>
          ))}
        </SettingsSection>
      ) : null}
    </>
  );
```

(The DNS block is `bg-subtle` with no border, so it is not a card inside the card. `QUIET` carries its own 44px target.)

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/pages/users src/pages/settings/routes.test.tsx`
Expected: PASS.

Run: `npm run lint` (expected: clean).

- [ ] **Step 8: Commit**

```bash
git add src/pages/users/UserManagement.tsx src/pages/users/AccessTab.tsx src/pages/users/UserManagement.test.tsx src/pages/users/AccessTab.test.tsx
git commit -m "feat(settings): People & teams on the settings frame

Members, Roles and Access are tabs under the heading; the members table
sits flush in its card with the ui Select and a row menu, Deactivated
as a neutral badge; roles are one list; access is sections of forms and
lists with their news in status regions; the member dialogs are trapped
BuilderDialogs with labels above and errors under their fields.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Connections: the mailbox as a section, the tools as one compact list

**Files:**
- Create: `src/components/integrations/providerLogos.tsx`
- Modify: `src/pages/integrations/Integrations.tsx`, `src/components/integrations/{MailboxSection,ConnectSourceForm}.tsx`
- Test (update): `src/pages/integrations/Integrations.test.tsx`, `src/components/integrations/MailboxSection.test.tsx`

**Interfaces:**
- Consumes: `SettingsFrame` (`wide`), `SettingsSection` (`header`, `list`, `state`), `SettingsRow`, `Toolbar`, `SearchInput`, `FilterChip`, `FilterChipRow`, `Badge`, `MetaParts`, `OverflowMenu`, `Select`, `INPUT`, `INVALID`, `CODE`, `NUM`, `BUTTON`, `PRIMARY`, `QUIET`, `DANGER`, `FORM_ALERT`, `EmptyState`, `LoadingState`, `TYPE` (ui); `settingsTitle`.
- Produces: `PROVIDER_LOGOS: Record<Provider, ReactNode>` from `components/integrations/providerLogos.tsx` (each mark 20px; the only file in Settings allowed hex, for the brands' own colours).

Why: spec §9.2 row 4 ("Connections as a compact `divide-y` list"), §9.1 (category pills onto `FilterChip`; status pills onto `Badge`; the `px-8 … max-w-7xl mx-auto` wrappers), §5.6 (one toolbar), §7 ("Not set up", "Disabled", "Not connected yet" are neutral; "Needs attention" is a real failure; decorative icons are neutral), §6.3 (one primary per form; labels above the IMAP fields, which today have placeholders only).

| Part | Layout |
|---|---|
| Heading | `settingsTitle('/settings/connections')`, intro "Your mailbox and the tools Revenact reads from.", `width="wide"`; the OAuth outcome under it (`text-success-ink` "Source connected." / `FORM_ALERT` "Could not connect: …") |
| Your mailbox | section "Your mailbox", description "Emails you send and receive with customers appear on their records. Only you and your management chain can read them."; connected: a row "Mailbox" (address, `MetaParts` provider · "Last synced 21 Sep 2026", or "Needs attention: …" in `text-danger-ink`) with BUTTON "Sync now" and `DANGER` "Disconnect"; not connected: a row "Connect" with one BUTTON per OAuth provider and BUTTON "Connect another mailbox (IMAP/SMTP)"; the IMAP form as stacked rows with labels above (Email address, Password or app password, IMAP host, IMAP port, SMTP host, SMTP port) and PRIMARY "Connect" in the footer |
| Tools | section "Tools", `list="Tools"`, `header` = a `Toolbar` (search "Search tools", category `FilterChip`s All · CRM · Communication · Productivity · Support, count "13 tools") inside the card; one row per provider: a 36px `bg-subtle` logo tile, the name, `MetaParts` category · description, a status `Badge` (Connected: success `dot`; Needs attention: danger; Disabled, Not set up: neutral), BUTTON "Connect" / "Add another" (managers); the connect form under the row; the provider's connections as a nested list under it, indented to the name |
| Connection row | the name; `MetaParts` scope · department (sources) · what it brought in (`NUM` figures) · "Disabled" when off; the source's sync line (neutral, or `text-danger-ink` "Needs attention: …"); one visible action ("Set up" for a source with no credentials) and `Actions for <name>` (`OverflowMenu`: Sync now, Reconnect, Enable or Disable, then Disconnect last in danger) |

- [ ] **Step 1: Update the tests to the new markup (they fail first)**

`src/pages/integrations/Integrations.test.tsx` (`card(name)` keeps working: each provider's row holds a `role="group"` named by the provider):
- "shows each provider…": the heading assertion becomes `toHaveClass('text-[22px]', 'font-semibold')`; `getByText(/42 tickets · last/)` becomes `getByText((_, el) => el?.tagName === 'P' && /42 tickets/.test(el.textContent ?? '') && /last/.test(el.textContent ?? ''))` (the figure is its own `NUM` span; use the same matcher shape for `/1 organization/` and `/7 calls/`).
- "lets an integrations manager connect…": Zoom's "Enable" is in its connection's menu: `await user.click(within(card('Zoom')).getByRole('button', { name: /^Actions for / }))` then `await user.click(screen.getByRole('menuitem', { name: 'Enable' }))`.
- "shows a ticket source its department…": `Sync Zendesk (EU) now` → open `Actions for Zendesk (EU)` and pick `Sync now`; `getByText('Reconnect')` → the same menu's `Reconnect`; "form closed again" becomes `await waitFor(() => expect(within(z).queryByLabelText('API token')).toBeNull())`; `Disconnect Zendesk (EU)` → the menu's `Disconnect`.
- Append:

```tsx
describe('Connections on the settings frame (UI foundations spec §6.3, §9.2 row 4)', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('lists the tools as one card of rows with the toolbar inside it, never a grid of cards', async () => {
    mockApi();
    renderPage();
    await screen.findByText('Zendesk (EU)');
    const tools = screen.getByRole('list', { name: 'Tools' });
    expect(tools).toHaveClass('divide-y');
    expect(tools.closest('.rounded-xl')).toContainElement(screen.getByRole('searchbox', { name: 'Search tools' }));
    expect(document.querySelector('.grid-cols-3, .lg\\:grid-cols-3')).toBeNull();
    expect(screen.getByRole('button', { name: 'CRM' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('13 tools');
  });

  it('tones the status badges by real status: Connected a success dot, Not set up and Disabled neutral', async () => {
    mockApi();
    renderPage();
    await screen.findByText('Zendesk (EU)');
    expect(within(card('Zendesk')).getByText('Connected')).toHaveClass('text-ink-muted');
    expect(within(card('Zendesk')).getByText('Connected').querySelector('.bg-success')).not.toBeNull();
    expect(within(card('Slack')).getByText('Not set up')).toHaveClass('bg-subtle', 'text-ink-muted');
    expect(within(card('Zoom')).getAllByText('Disabled')[0]).not.toHaveClass('line-through');
  });

  it('names the empty-state Clear search after the query', async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Zendesk (EU)');
    await user.type(screen.getByRole('searchbox', { name: 'Search tools' }), 'zzz');
    expect(screen.getByRole('button', { name: 'Clear search for “zzz”' })).toBeInTheDocument();
  });
});
```

(`mockApi` and `renderPage` are the file's own. `Badge`'s `dot` draws a `bg-success` dot before neutral words, which is what the second assertion reads.)

`src/components/integrations/MailboxSection.test.tsx`: the IMAP fields are found by their visible labels (unchanged names); `/Connect another mailbox/` and `Connect Google Workspace / Gmail` keep their names; the connected row's `Disconnect` keeps its name; append:

```tsx
  it('draws the mailbox as a settings section with labelled IMAP fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ connection: null, providers: [{ key: 'imap', label: 'IMAP / SMTP', uses_oauth: false }] }) })),
    );
    renderSection();
    const section = await screen.findByRole('region', { name: 'Your mailbox' });
    await userEvent.click(within(section).getByRole('button', { name: /Connect another mailbox/ }));
    expect(within(section).getByText('IMAP host', { selector: 'label' })).toHaveClass('text-[13px]', 'font-semibold');
    expect(within(section).getByRole('button', { name: 'Connect' })).toHaveClass('bg-accent');
  });
```

(`renderSection` is the file's own; add `within` to its testing-library import.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/integrations src/components/integrations`
Expected: FAIL.

- [ ] **Step 3: The logos**

Create `src/components/integrations/providerLogos.tsx`: move `GMAIL_SVG`, `SALESFORCE_SVG`, `SLACK_SVG`, `JIRA_SVG`, `ZENDESK_SVG`, `HUBSPOT_SVG` here unchanged except `className="w-10 h-10"` → `className="h-5 w-5"`, and export:

```tsx
import type { ReactNode } from 'react';
import { GitBranch, LifeBuoy, MessageCircle, PenTool, Users, Video, Webhook } from 'lucide-react';
import type { Provider } from '../../features/connectors/connectorsSlice';

// The brands' own marks, in their own colours: the one place in Settings
// that may hold hex (named in settings.houseRules.test.ts). Systems with no
// mark here take a neutral Lucide icon (spec §7: decorative icons are
// never tinted).

const ICON = 'h-5 w-5 text-ink-muted';

// GMAIL_SVG, SALESFORCE_SVG, SLACK_SVG, JIRA_SVG, ZENDESK_SVG, HUBSPOT_SVG go here:
// cut from Integrations.tsx and pasted byte for byte, with the two edits below.

export const PROVIDER_LOGOS: Record<Provider, ReactNode> = {
  salesforce: SALESFORCE_SVG,
  hubspot: HUBSPOT_SVG,
  zendesk: ZENDESK_SVG,
  freshdesk: <LifeBuoy className={ICON} aria-hidden="true" />,
  intercom: <MessageCircle className={ICON} aria-hidden="true" />,
  webhook: <Webhook className={ICON} aria-hidden="true" />,
  jira: JIRA_SVG,
  github: <GitBranch className={ICON} aria-hidden="true" />,
  figma: <PenTool className={ICON} aria-hidden="true" />,
  gmail: GMAIL_SVG,
  slack: SLACK_SVG,
  ms_teams: <Users className={ICON} aria-hidden="true" />,
  zoom: <Video className={ICON} aria-hidden="true" />,
};
```

(The two edits to each pasted `<svg>`: `className="h-5 w-5"` and `aria-hidden="true"`. Delete the two comment lines once the constants are in.)

- [ ] **Step 4: The page and its rows**

`src/pages/integrations/Integrations.tsx`: `PROVIDERS` keeps `id`, `name`, `category`, `desc`, `tickets` and drops `icon` (the row reads `PROVIDER_LOGOS[provider.id]`); Slack's description becomes "Every message in a support channel becomes a ticket; a check-mark reaction resolves it." (the house rules ban emoji in UI files). `CATEGORIES`, `DEPARTMENTS`, `departmentLabel`, `scopeLabel` stay. Replace `statusLabel` and `ingestedLabel` with:

```tsx
/** A ticket source's sync line: a failure is status; everything else is words. */
function statusLine(c: Connector): { text: string; failed: boolean } {
  if (c.status === 'error') return { text: `Needs attention: ${c.error}`, failed: true };
  if (!c.has_credentials) return { text: 'Not connected yet', failed: false };
  if (!c.last_synced_at) return { text: 'Connected · not synced yet', failed: false };
  return { text: `Synced ${formatDate(c.last_synced_at.slice(0, 10))}${c.last_sync_note ? ` · ${c.last_sync_note}` : ''}`, failed: false };
}

/** What a connection brought in, its figures in NUM. */
function ingested(c: Connector): ReactNode {
  const parts: ReactNode[] = [];
  if (c.ticket_count) parts.push(<><span className={NUM}>{c.ticket_count}</span> {c.ticket_count === 1 ? 'ticket' : 'tickets'}</>);
  if (c.call_count) parts.push(<><span className={NUM}>{c.call_count}</span> {c.call_count === 1 ? 'call' : 'calls'}</>);
  if (parts.length === 0) return 'no records yet';
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? ', ' : null}
          {part}
        </Fragment>
      ))}
      {c.last_record_at ? ` · last ${formatDate(c.last_record_at)}` : ''}
    </>
  );
}

function ProviderStatus({ connectors, tickets }: { connectors: Connector[]; tickets?: boolean }) {
  if (connectors.some((c) => c.status === 'error')) return <Badge tone="danger">Needs attention</Badge>;
  if (connectors.some((c) => c.is_enabled && (!tickets || c.has_credentials)))
    return (
      <Badge tone="success" dot>
        Connected
      </Badge>
    );
  return <Badge>{connectors.length ? 'Disabled' : 'Not set up'}</Badge>;
}
```

(`scopeLabel` keeps its words; its counts stay inside the phrase "1 organization" as text, so wrap them the same way: return a `ReactNode` with `<span className={NUM}>{c.customers.length}</span>` and `<span className={NUM}>{c.accounts.length}</span>`, joined by ", ".)

`ConnectorRow`, the hooks unchanged; the return:

```tsx
  const line = isSource ? statusLine(connector) : null;
  const menu = canManage
    ? [
        ...(isSource && connector.has_credentials ? [{ key: 'sync', label: 'Sync now', onSelect: () => void dispatch(syncConnector(connector.id)) }] : []),
        ...(isSource && connector.has_credentials && !open ? [{ key: 'reconnect', label: 'Reconnect', onSelect: () => onToggle(true) }] : []),
        { key: 'enabled', label: connector.is_enabled ? 'Disable' : 'Enable', onSelect: () => void dispatch(updateConnector({ id: connector.id, is_enabled: !connector.is_enabled })) },
        ...(isSource && connector.has_credentials ? [{ key: 'disconnect', label: 'Disconnect', onSelect: () => void dispatch(disconnectConnector(connector.id)), danger: true }] : []),
      ]
    : [];
  return (
    <li className="group relative flex flex-col gap-2 px-4 py-3 sm:pl-16">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className={`${TYPE.body} font-semibold`}>{connector.name}</p>
          <p className={TYPE.meta}>
            <MetaParts parts={[scopeLabel(connector), isSource ? departmentLabel(connector.department) : null, ingested(connector), connector.is_enabled ? null : 'Disabled']} />
          </p>
          {line ? <p className={line.failed ? 'text-[11px] leading-4 text-danger-ink' : TYPE.meta}>{line.text}</p> : null}
        </div>
        {canManage && isSource && !connector.has_credentials && !open ? (
          <button type="button" onClick={() => onToggle(true)} className={BUTTON}>
            Set up
          </button>
        ) : null}
        {menu.length ? <OverflowMenu label={`Actions for ${connector.name}`} items={menu} /> : null}
      </div>
      {canManage && isSource && open ? <ConnectSourceForm connector={connector} onDone={() => onToggle(false)} /> : null}
    </li>
  );
```

(The busy flag `saving` no longer disables a button here; the slice ignores a second sync while one runs.)

`ProviderCard` becomes `ProviderRow` (same props, same state and `submit`); the return:

```tsx
  return (
    <li data-provider={provider.id}>
      <div role="group" aria-label={provider.name} className="flex flex-col">
        <div className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle">
            {PROVIDER_LOGOS[provider.id]}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className={`${TYPE.body} font-semibold`}>{provider.name}</p>
            <p className={TYPE.meta}>
              <MetaParts parts={[provider.category, provider.desc]} />
            </p>
          </div>
          <ProviderStatus connectors={connectors} tickets={provider.tickets} />
          {canManage && !connecting ? (
            <button type="button" onClick={() => setConnecting(true)} className={BUTTON}>
              {connectors.length ? 'Add another' : 'Connect'}
            </button>
          ) : null}
        </div>
        {canManage && connecting ? (
          <form onSubmit={submit} aria-label={`Connect ${provider.name}`} className="flex flex-wrap items-end gap-3 border-t border-line-subtle px-4 py-3 sm:pl-16">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor={`name-${provider.id}`} className={TYPE.label}>
                Name for {provider.name}
              </label>
              <input id={`name-${provider.id}`} value={name} onChange={(event) => setName(event.target.value)} placeholder={`${provider.name} (EU)`} autoFocus className={INPUT} />
            </div>
            {provider.tickets ? (
              <Select
                id={`department-${provider.id}`}
                label={`Department for ${provider.name}`}
                value={department}
                onChange={setDepartment}
                options={DEPARTMENTS.map((d) => ({ value: d, label: departmentLabel(d) }))}
                className="sm:w-48"
              />
            ) : null}
            <button type="button" onClick={() => setConnecting(false)} className={QUIET}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={PRIMARY}>
              Save
            </button>
          </form>
        ) : null}
        {connectors.length > 0 ? (
          <ul aria-label={`${provider.name} connections`} className="divide-y divide-line-subtle border-t border-line-subtle">
            {connectors.map((c) => (
              <ConnectorRow key={c.id} connector={c} canManage={canManage} open={formFor === c.id} onToggle={(open) => setFormFor(open ? c.id : null)} />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
```

(The department picker's old `title` sentence moves into the Select's visible label context: add the hint under it, `<p className={TYPE.meta}>Only this department and Leadership can read its tickets.</p>`, inside a wrapping `div` with the `Select`.)

`Integrations`' return:

```tsx
  const q = search.trim();
  return (
    <SettingsFrame title={settingsTitle('/settings/connections')} intro="Your mailbox and the tools Revenact reads from." width="wide">
      {outcome === 'connected' ? <p className="text-[13px] leading-5 text-success-ink">Source connected.</p> : null}
      {outcome === 'error' ? (
        <p role="alert" className={FORM_ALERT}>
          Could not connect: {outcomeDetail || 'the provider refused.'}
        </p>
      ) : null}
      {error || saveError ? (
        <p role="alert" className={FORM_ALERT}>
          {error ?? saveError}
        </p>
      ) : null}
      <MailboxSection />
      <SettingsSection
        title="Tools"
        list="Tools"
        header={
          <div className="border-b border-line-subtle px-4 py-3">
            <Toolbar
              search={<SearchInput label="Search tools" placeholder="Search tools" value={search} onChange={setSearch} />}
              filters={
                <FilterChipRow label="Categories">
                  {CATEGORIES.map((category) => (
                    <FilterChip key={category} label={category} pressed={activeTab === category} onToggle={() => setActiveTab(category)} />
                  ))}
                </FilterChipRow>
              }
              count={`${shown.length} ${shown.length === 1 ? 'tool' : 'tools'}`}
            />
          </div>
        }
        state={
          shown.length === 0 ? (
            <EmptyState
              title="No tools found"
              detail="Try another search or category."
              action={
                q ? (
                  <button type="button" onClick={() => setSearch('')} className={QUIET}>
                    Clear search for “{q}”
                  </button>
                ) : (
                  <button type="button" onClick={() => setActiveTab('All')} className={QUIET}>
                    Show all categories
                  </button>
                )
              }
            />
          ) : undefined
        }
      >
        {shown.map((provider) => (
          <ProviderRow key={provider.id} provider={provider} connectors={byProvider.get(provider.id) ?? []} canManage={canManage} />
        ))}
      </SettingsSection>
    </SettingsFrame>
  );
```

Imports: drop `Search`, `CheckCircle2`, `SlidersHorizontal`, `GitBranch`, `PenTool`, `Users`, `MessageCircle`, `Video`, `LifeBuoy`, `Webhook`, `RefreshCw`, `Unplug`; add `Fragment`, `type ReactNode` to the `react` import; `import { PROVIDER_LOGOS } from '../../components/integrations/providerLogos';`; `import { BUTTON, Badge, EmptyState, FORM_ALERT, FilterChip, FilterChipRow, INPUT, MetaParts, NUM, OverflowMenu, PRIMARY, QUIET, SearchInput, Select, SettingsFrame, SettingsSection, TYPE, Toolbar } from '../../components/ui';`; `import { settingsTitle } from '../settings/workspaceSettingsNav';`. Rewrite the comments without em dashes.

- [ ] **Step 5: The mailbox and the source form**

`src/components/integrations/MailboxSection.tsx`: hooks, `connect` and `submitImap` stay. Imports: drop `Mail`, `RefreshCw` stays (Sync now icon), `Unplug` stays; add `import { BUTTON, DANGER, FORM_ALERT, INPUT, MetaParts, PRIMARY, SettingsRow, SettingsSection, TYPE } from '../ui';`. Add a field helper and the return:

```tsx
const IMAP_FIELDS = [
  { key: 'address', label: 'Email address', placeholder: 'you@company.com', type: 'email', required: true },
  { key: 'password', label: 'Password or app password', placeholder: 'App password', type: 'password', required: true },
  { key: 'imap_host', label: 'IMAP host', placeholder: 'imap.company.com', type: 'text', required: true },
  { key: 'imap_port', label: 'IMAP port', placeholder: '993', type: 'text', required: false },
  { key: 'smtp_host', label: 'SMTP host', placeholder: 'smtp.company.com', type: 'text', required: true },
  { key: 'smtp_port', label: 'SMTP port', placeholder: '587', type: 'text', required: false },
] as const;
```

```tsx
  return (
    <SettingsSection
      title="Your mailbox"
      description="Emails you send and receive with customers appear on their records. Only you and your management chain can read them."
    >
      {outcome === 'connected' ? <p className="px-4 py-3 text-[13px] leading-5 text-success-ink">Mailbox connected.</p> : null}
      {outcome === 'error' ? (
        <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
          Could not connect: {outcomeDetail || 'the provider refused.'}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={`px-4 py-3 ${FORM_ALERT}`}>
          {error}
        </p>
      ) : null}
      {!loaded ? (
        <p className={`px-4 py-3 ${TYPE.bodyMuted}`}>Loading your mailbox…</p>
      ) : connection ? (
        <SettingsRow label="Mailbox">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <p className={`${TYPE.body} font-semibold`}>{connection.address}</p>
              <p className={connection.status === 'error' ? 'text-[11px] leading-4 text-danger-ink' : TYPE.meta}>
                {connection.status === 'error' ? (
                  `Needs attention: ${connection.error}`
                ) : (
                  <MetaParts parts={[connection.provider_display, connection.last_synced_at ? `Last synced ${formatDate(connection.last_synced_at.slice(0, 10))}` : 'Not synced yet']} />
                )}
              </p>
            </div>
            <button type="button" onClick={() => dispatch(syncMailbox())} disabled={saving} className={BUTTON}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Sync now
            </button>
            <button type="button" onClick={() => dispatch(disconnectMailbox())} className={DANGER}>
              <Unplug className="h-4 w-4" aria-hidden="true" />
              Disconnect
            </button>
          </div>
        </SettingsRow>
      ) : (
        <>
          <SettingsRow label="Connect" hint={oauthProviders.length === 0 ? 'Google and Microsoft sign-in are not set up on this deployment yet; IMAP/SMTP works with an app password.' : undefined}>
            <div className="flex flex-wrap items-center gap-2">
              {oauthProviders.map((p) => (
                <button key={p.key} type="button" onClick={() => void connect(p.key)} className={BUTTON}>
                  Connect {p.label}
                </button>
              ))}
              {imapAvailable ? (
                <button type="button" onClick={() => setShowImap((v) => !v)} aria-expanded={showImap} className={BUTTON}>
                  {showImap ? 'Cancel' : 'Connect another mailbox (IMAP/SMTP)'}
                </button>
              ) : null}
            </div>
          </SettingsRow>
          {showImap ? (
            <form onSubmit={submitImap} aria-label="IMAP and SMTP" className="flex flex-col gap-3 px-4 py-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {IMAP_FIELDS.map((field) => (
                  <div key={field.key} className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={`imap-${field.key}`} className={TYPE.label}>
                      {field.label}
                    </label>
                    <input
                      id={`imap-${field.key}`}
                      type={field.type}
                      required={field.required}
                      value={form[field.key]}
                      onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                      placeholder={field.placeholder}
                      className={INPUT}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={saving} className={PRIMARY}>
                  {saving ? 'Checking login…' : 'Connect'}
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </SettingsSection>
  );
```

(The IMAP form is a block inside the section's card, divided like a row; its one `PRIMARY` is its submit.)

`src/components/integrations/ConnectSourceForm.tsx`: hooks, `submit`, `signIn` and `copy` stay; imports add `import { BUTTON, CODE, INPUT, PRIMARY, QUIET, TYPE } from '../ui';`. The minted return:

```tsx
    return (
      <div className="flex flex-col gap-2">
        <p className={`${TYPE.body} font-semibold`}>Your system posts tickets to:</p>
        <code className={`select-all break-all rounded-lg bg-subtle px-3 py-2 ${TYPE.body} ${CODE}`}>{minted.inbound_url}</code>
        <p className={`${TYPE.body} font-semibold`}>
          with the header <code className={CODE}>X-Revenact-Token</code> set to this secret. It is shown once:
        </p>
        <div className="flex items-center gap-2">
          <code aria-label="Webhook secret" className={`flex-1 select-all break-all rounded-lg bg-subtle px-3 py-2 ${TYPE.body} ${CODE}`}>
            {minted.token}
          </code>
          <button type="button" onClick={() => void copy(minted.token ?? '')} className={BUTTON}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? 'Copied' : 'Copy secret'}
          </button>
        </div>
        <p className={TYPE.meta}>
          Send one ticket object or <code className={CODE}>{'{"tickets": [...]}'}</code> with external_id, title and optionally description, status, priority, requester_email, requester_name, assignee_name, url, opened_at, resolved_at.
        </p>
        <button type="button" onClick={onDone} className={`self-start ${BUTTON}`}>
          Done
        </button>
      </div>
    );
```

and the form's return:

```tsx
  return (
    <form onSubmit={submit} aria-label={`Connect ${connector.name}`} className="flex flex-col gap-3">
      {setup.fields.map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <label htmlFor={`${connector.id}-${field.name}`} className={TYPE.label}>
            {field.label}
            {field.required ? null : <span className={`font-normal ${TYPE.meta}`}> (optional)</span>}
          </label>
          <input
            id={`${connector.id}-${field.name}`}
            type={field.secret ? 'password' : 'text'}
            autoComplete={field.secret ? 'new-password' : 'off'}
            required={field.required && !(setup.uses_oauth && field.secret)}
            value={form[field.name] ?? ''}
            onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
            placeholder={field.placeholder}
            className={INPUT}
          />
        </div>
      ))}
      {setup.help ? <p className={TYPE.meta}>{setup.help}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onDone} className={QUIET}>
          Cancel
        </button>
        {setup.uses_oauth ? (
          <button type="button" onClick={() => void signIn()} disabled={saving} className={BUTTON}>
            Sign in with {setup.label}
          </button>
        ) : null}
        <button type="submit" disabled={saving} className={PRIMARY}>
          {saving ? 'Checking…' : setup.fields.length ? 'Connect' : 'Generate secret'}
        </button>
      </div>
    </form>
  );
```

(The label's `(optional)` sits inside the label so the field's name keeps it, as before. The copy button's name becomes "Copy secret" on screen; the test that used `Copy secret` by `aria-label` still finds it by its words.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/pages/integrations src/components/integrations src/pages/settings/routes.test.tsx`
Expected: PASS.

Run: `npm run lint` (expected: clean).

- [ ] **Step 7: Commit**

```bash
git add src/components/integrations/providerLogos.tsx src/pages/integrations/Integrations.tsx src/components/integrations/MailboxSection.tsx \
  src/components/integrations/ConnectSourceForm.tsx src/pages/integrations/Integrations.test.tsx src/components/integrations/MailboxSection.test.tsx
git commit -m "feat(settings): Connections on the settings frame

The mailbox is a section with labelled IMAP fields; the tools are one
compact list with the search, category chips and count inside its card,
each tool's status a badge toned by real status and its connections
nested beneath with one visible action and the rest in a menu.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: AI usage, AI skills and AI feedback

**Files:**
- Modify: `src/pages/brain/{Agents,Skills,Feedback}.tsx` (routed only under Settings: `/settings/ai-usage`, `/settings/ai-skills`, `/settings/ai-feedback`)
- Test (update): `src/pages/brain/{Agents,Skills,Feedback}.test.tsx`

**Interfaces:**
- Consumes: `SettingsFrame` (`wide` for AI usage and AI skills), `SettingsSection`, `SettingsNote`, `MetaParts`, `Tabs`, `tabId`, `tabPanelId`, `Badge`, `TABLE`, `TH`, `TD`, `TD_NUM`, `NUM`, `INPUT`, `PRIMARY`, `QUIET`, `ROW_ACTIONS`, `INLINE_TARGET`, `NO_VALUE`, `FORM_ALERT`, `LoadingState`, `EmptyState`, `TYPE` (ui); `settingsTitle`.
- Produces: nothing new.

Why: spec §6.3 (the `h1` equals the nav label: "Skills" becomes **AI skills**; the "Company Brain" eyebrow and the accent icon above each heading go: the bar and the nav say where you are), §9.1 (AI feedback tabs onto `Tabs`), §4.2 (AI usage's recent calls is one of the four tables flush in their card; purposes and skills are lists, not a card each), §7 (a budget at 90% is red and at 70% amber; below it neutral, not blue; "not configured" is neutral; a failed or over-budget call and a rejected proposal are real status; the May / Never headings are not status), §3 (every token count and share in `NUM`).

| Page | Layout |
|---|---|
| AI usage | intro "Every model call the brain makes: what it spent this month, against what it may spend."; the lock note without view-all-accounts; section "This month" (description "From 1 Oct 2026." and, for non-managers, "Budgets are set by organisation settings managers."), a list of purposes: label, `MetaParts` calls · failed (`text-danger-ink`), the spend bar with the share in `NUM`, `MetaParts` "11K of 50K tokens this month" · in · out · budget source; `ROW_ACTIONS` QUIET "Set budget" and "Use default"; the budget form inline in the row (label above, `INPUT` + `NUM`, QUIET Cancel, PRIMARY Save); section "Recent calls", the table flush |
| AI skills | intro unchanged; the frame's `action` a QUIET link "Budgets and the call log" to `/settings/ai-usage`; the lock note; section "Skills" (description `MetaParts` "12 skills" · "usage since 1 Oct 2026"), a list: each skill an `article` named by the skill: name, summary, "Runs when …" and "Shows on <link>" (an `INLINE_TARGET` link, never inside a truncating line), Reads / May / Never as three plain lists (`sm:grid-cols-3`, `TYPE.label` headings, no tint, no "·" bullets), and a `MetaParts` line: who may ask · tokens and share · failed · produced · last run with its outcome |
| AI feedback | intro unchanged; the lock note; `Tabs` "Kinds" (All, Classifications, Proposals, Health overrides, each with its count) under the heading; the panel holds section "Corrections", a list: a neutral kind `Badge`, the subject, `MetaParts` who · when, the before → after lines (before struck through, after semibold, figures in `NUM`, `NO_VALUE` for nothing), the proposal decision (`text-success-ink` approved / `text-danger-ink` rejected), the person's note |

- [ ] **Step 1: Update the tests to the new markup (they fail first)**

`src/pages/brain/Agents.test.tsx`:
- `const card = (label: string) => screen.getByRole('heading', { name: label }).closest('li') as HTMLElement;` (each purpose is a row).
- The heading assertion becomes `toHaveClass('text-[22px]', 'font-semibold')`.
- `getByText(/1 failed/)` becomes `getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '1 failed')`.
- `expect(screen.getByText('over budget')).toHaveClass('text-danger')` becomes `toHaveClass('text-danger-ink')`.
- Append:

```tsx
describe('AI usage on the settings frame (UI foundations spec §4.2, §7)', () => {
  it('lists the purposes as rows, the share in tabular figures, and the recent calls flush in their card', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('heading', { name: 'Management brief' });
    expect(screen.getByRole('list', { name: 'Spend by purpose' })).toHaveClass('divide-y');
    expect(within(card('Ops agent proposals')).getByText('90%')).toHaveClass('tabular-nums');
    const table = screen.getByRole('table', { name: 'Recent calls' });
    expect(table.closest('.rounded-xl')).not.toBeNull();
    expect(within(table).getByRole('columnheader', { name: 'In' })).toHaveClass('text-right');
    expect(screen.queryByText('Company Brain')).toBeNull();
  });

  it('draws a budget bar under 70% in the neutral ink, not blue', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('heading', { name: 'Management brief' });
    const brief = card('Management brief');
    expect(brief.querySelector('[data-part="spend"]')).toHaveClass('bg-ink-muted');
  });
});
```

(`mockApi`, `renderPage` and `card` are the file's own; "Management brief" is the fixture whose share is below 70%.)

`src/pages/brain/Skills.test.tsx`:
- `getByText('· Propose a task on an account')` becomes `getByText('Propose a task on an account')` (and the same for "Run anything without approval": the "·" bullets go).
- Append:

```tsx
  it('heads the page with the nav label and lists skills in one card, the Shows on link outside any truncation', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'AI skills' })).toHaveClass('text-[22px]');
    const ops = await screen.findByRole('article', { name: 'Ops agent' });
    expect(ops.closest('ul')).toHaveAttribute('aria-label', 'Skills');
    const link = within(ops).getByRole('link', { name: '/brain/review' });
    expect(link.closest('.truncate')).toBeNull();
    expect(link.className).toContain('before:h-11');
    expect(within(ops).getByText('May')).not.toHaveClass('text-success');
    expect(within(ops).getByText('Never')).not.toHaveClass('text-danger');
  });
```

(`renderPage` stubs the fetch itself in this file. The first case's `toHaveTextContent(/last run .* by Alice · ok/)` becomes `/last run .* by Alice: OK/`; `'4 proposals · 1 approved'` still matches, because produced and approved are separate meta parts.)

`src/pages/brain/Feedback.test.tsx`:
- The heading assertion becomes `toHaveClass('text-[22px]', 'font-semibold')`.
- `expect(within(decided).getByText('rejected')).toHaveClass('text-danger')` becomes `toHaveClass('text-danger-ink')`.
- The tab cases keep `getByRole('tab', { name: /All 3/ })` and `/Proposals 1/`; append:

```tsx
  it('switches kinds with the ui tabs, the list in one card under them', async () => {
    mockApi();
    renderPage();
    await screen.findByText('Slow page load for large accounts');
    const tabs = screen.getByRole('tablist', { name: 'Kinds' });
    expect(within(tabs).getByRole('tab', { name: /All 3/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toContainElement(screen.getByRole('list', { name: 'Corrections' }));
    const kind = within(screen.getByText('Slow page load for large accounts').closest('li')!).getByText('Classification');
    expect(kind).toHaveClass('bg-subtle', 'text-ink-muted');
    expect(kind.className).not.toMatch(/uppercase/);
  });
```

(`mockApi` and `renderPage` are the file's own; the kind label is the fixture's `kind_display`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/pages/brain/Agents.test.tsx src/pages/brain/Skills.test.tsx src/pages/brain/Feedback.test.tsx`
Expected: FAIL.

- [ ] **Step 3: AI usage**

`src/pages/brain/Agents.tsx`: `compact` stays; `OUTCOME` becomes:

```tsx
const OUTCOME: Record<ModelCallRow['outcome'], { label: string; className: string }> = {
  ok: { label: 'OK', className: 'text-ink-muted' },
  failed: { label: 'Failed', className: 'font-semibold text-danger-ink' },
  unconfigured: { label: 'Not configured', className: 'text-ink-muted' },
  over_budget: { label: 'Over budget', className: 'font-semibold text-danger-ink' },
};
```

(The tests' `getByText('over budget')` becomes `getByText('Over budget')`: sentence case.) Imports: drop `Bot`, `ShieldAlert`; add `import { FORM_ALERT, INPUT, MetaParts, NUM, PRIMARY, QUIET, ROW_ACTIONS, SettingsFrame, SettingsNote, SettingsSection, TABLE, TD, TD_NUM, TH, TYPE, EmptyState } from '../../components/ui';` and `import { settingsTitle } from '../settings/workspaceSettingsNav';`. `PurposeCard` becomes `PurposeRow` (same state and `submit`):

```tsx
function PurposeRow({ row, canManage }: { row: PurposeUsage; canManage: boolean }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.budget));
  const share = row.budget > 0 ? Math.min(100, (row.spent / row.budget) * 100) : 0;
  // Status colour only for real status (spec §7): near or past the budget.
  const bar = share >= 90 ? 'bg-danger' : share >= 70 ? 'bg-warning' : 'bg-ink-muted';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) return;
    await dispatch(setBudget({ purpose: row.purpose, monthly_tokens: Math.round(n) }));
    setEditing(false);
  }

  return (
    <li className="group relative flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className={`${TYPE.body} font-semibold`}>{row.label}</h3>
        <p className={TYPE.meta}>
          <MetaParts
            parts={[
              <>
                <span className={NUM}>{row.calls}</span> {row.calls === 1 ? 'call' : 'calls'}
              </>,
              row.failed > 0 ? (
                <span className="text-[11px] leading-4 text-danger-ink">
                  <span className={NUM}>{row.failed}</span> failed
                </span>
              ) : null,
            ]}
          />
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
          <div data-part="spend" className={`h-full rounded-full ${bar}`} style={{ width: `${share}%` }} />
        </div>
        <span className={`${TYPE.body} ${NUM}`}>{share.toFixed(0)}%</span>
      </div>
      <p className={TYPE.meta}>
        <MetaParts
          parts={[
            <>
              <span className={NUM}>{compact(row.spent)}</span> of <span className={NUM}>{compact(row.budget)}</span> tokens this month
            </>,
            <>
              <span className={NUM}>{compact(row.input_tokens)}</span> in
            </>,
            <>
              <span className={NUM}>{compact(row.output_tokens)}</span> out
            </>,
            row.custom_budget ? 'budget set for this organisation' : 'default budget',
          ]}
        />
      </p>
      {canManage && !editing ? (
        <div className={ROW_ACTIONS}>
          <button
            type="button"
            onClick={() => {
              setDraft(String(row.budget));
              setEditing(true);
            }}
            className={QUIET}
          >
            Set budget
          </button>
          {row.custom_budget ? (
            <button type="button" onClick={() => dispatch(setBudget({ purpose: row.purpose, monthly_tokens: null }))} className={QUIET}>
              Use default
            </button>
          ) : null}
        </div>
      ) : null}
      {canManage && editing ? (
        <form onSubmit={submit} aria-label={`Budget for ${row.label}`} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`budget-${row.purpose}`} className={TYPE.label}>
              Tokens a month
            </label>
            <input id={`budget-${row.purpose}`} type="number" min={0} step={1000} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus className={`${INPUT} ${NUM} w-36`} />
          </div>
          <button type="button" onClick={() => setEditing(false)} className={QUIET}>
            Cancel
          </button>
          <button type="submit" className={PRIMARY}>
            Save
          </button>
        </form>
      ) : null}
    </li>
  );
}
```

`AgentsPage`'s return:

```tsx
  return (
    <SettingsFrame
      title={settingsTitle('/settings/ai-usage')}
      intro="Every model call the brain makes: what it spent this month, against what it may spend."
      width="wide"
      note={canSeeAll ? undefined : <SettingsNote icon="lock">Model usage is organisation-wide, which needs the view-all-accounts capability.</SettingsNote>}
    >
      {error || saveError ? (
        <p role="alert" className={FORM_ALERT}>
          {error ?? saveError}
        </p>
      ) : null}
      {data ? (
        <>
          <SettingsSection
            title="This month"
            description={`From ${data.month_start}.${canManage ? '' : ' Budgets are set by organisation settings managers.'}`}
            list="Spend by purpose"
          >
            {data.purposes.map((row) => (
              <PurposeRow key={row.purpose} row={row} canManage={canManage} />
            ))}
          </SettingsSection>
          <SettingsSection title="Recent calls" state={data.recent.length === 0 ? <EmptyState size="inline" title="No model calls yet." /> : undefined}>
            <div className="overflow-x-auto">
              <table aria-label="Recent calls" className={`${TABLE} min-w-[640px]`}>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>When</th>
                    <th scope="col" className={TH}>Purpose</th>
                    <th scope="col" className={TH}>Asked by</th>
                    <th scope="col" className={`${TH} text-right`}>In</th>
                    <th scope="col" className={`${TH} text-right`}>Out</th>
                    <th scope="col" className={`${TH} text-right`}>Latency</th>
                    <th scope="col" className={TH}>Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {data.recent.map((call) => (
                    <tr key={call.id}>
                      <td className={`${TD} whitespace-nowrap text-ink-muted ${NUM}`}>{call.created_at.slice(0, 16).replace('T', ' ')}</td>
                      <td className={TD}>{call.purpose_label}</td>
                      <td className={`${TD} text-ink-muted`}>{call.user ?? 'scheduled'}</td>
                      <td className={TD_NUM}>{call.input_tokens.toLocaleString()}</td>
                      <td className={TD_NUM}>{call.output_tokens.toLocaleString()}</td>
                      <td className={TD_NUM}>{(call.latency_ms / 1000).toFixed(1)}s</td>
                      <td className={TD} title={call.error}>
                        <span className={OUTCOME[call.outcome].className}>{OUTCOME[call.outcome].label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SettingsSection>
        </>
      ) : isLoading ? (
        <SettingsSection title="This month" state={<LoadingState label="Loading AI usage" />} />
      ) : null}
    </SettingsFrame>
  );
```

(Import `LoadingState` too. Write each `th` on its own lines as the formatter would; they are compact here for length. Rewrite the doc comment without em dashes. `SettingsSection`'s `children` is optional, so the loading section has none.)

- [ ] **Step 4: AI skills**

`src/pages/brain/Skills.tsx`: `compact` stays; `OUTCOME` as in Step 3 (same four entries); `List` becomes:

```tsx
function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <h4 className={`mb-1 ${TYPE.label}`}>{title}</h4>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item} className={TYPE.bodyMuted}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`SkillCard` becomes `SkillRow`:

```tsx
function SkillRow({ skill }: { skill: Skill }) {
  const share = skill.usage.budget > 0 ? Math.min(100, (skill.usage.spent / skill.usage.budget) * 100) : 0;
  const surface = skill.surface.split(' ')[0];
  return (
    <li>
      <article aria-label={skill.name} className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h3 className={`${TYPE.body} font-semibold`}>{skill.name}</h3>
          <p className={TYPE.bodyMuted}>{skill.summary}</p>
          <p className={TYPE.meta}>
            <MetaParts
              parts={[
                `Runs when ${skill.trigger.charAt(0).toLowerCase()}${skill.trigger.slice(1)}`,
                <>
                  Shows on{' '}
                  <Link to={surface} className={`${INLINE_TARGET} text-ink hover:underline`}>
                    {skill.surface}
                  </Link>
                </>,
              ]}
            />
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <List title="Reads" items={skill.reads} />
          <List title="May" items={skill.may} />
          <List title="Never" items={skill.never} />
        </div>
        <p className={`border-t border-line-subtle pt-2 ${TYPE.meta}`}>
          <MetaParts
            parts={[
              `Who may ask: ${skill.gate}`,
              <span title={`${skill.usage.calls} calls this month, ${skill.usage.failed} failed`}>
                <span className={NUM}>{compact(skill.usage.spent)}</span> of <span className={NUM}>{compact(skill.usage.budget)}</span> tokens (<span className={NUM}>{share.toFixed(0)}%</span>)
              </span>,
              skill.usage.failed > 0 ? (
                <span className="text-[11px] leading-4 text-danger-ink">
                  <span className={NUM}>{skill.usage.failed}</span> failed
                </span>
              ) : null,
              skill.produced ? (
                <>
                  <span className={NUM}>{skill.produced.count}</span> {skill.produced.label}
                </>
              ) : null,
              skill.produced?.approved !== undefined ? (
                <>
                  <span className={NUM}>{skill.produced.approved}</span> approved
                </>
              ) : null,
              skill.last_run ? (
                <>
                  last run {formatDate(skill.last_run.at.slice(0, 10))}
                  {skill.last_run.user ? ` by ${skill.last_run.user}` : ''}: <span className={OUTCOME[skill.last_run.outcome].className}>{OUTCOME[skill.last_run.outcome].label}</span>
                </>
              ) : (
                'never run'
              ),
            ]}
          />
        </p>
      </article>
    </li>
  );
}
```

(The meta lines wrap rather than truncate, so the `INLINE_TARGET` link is never clipped. The existing test reads `never run` and `45K`: both stay.)

`SkillsPage`'s return:

```tsx
  return (
    <SettingsFrame
      title={settingsTitle('/settings/ai-skills')}
      intro="What each agent is given, what it may do, what it may never do, and how it has been used."
      width="wide"
      note={canSeeAll ? undefined : <SettingsNote icon="lock">The skills catalogue reports organisation-wide usage, which needs the view-all-accounts capability.</SettingsNote>}
      action={
        data ? (
          <Link to="/settings/ai-usage" className={QUIET}>
            Budgets and the call log
          </Link>
        ) : undefined
      }
    >
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
      {data || (isLoading && canSeeAll) ? (
        <SettingsSection
          title="Skills"
          description={data ? <MetaParts parts={[`${data.skills.length} skills`, `usage since ${formatDate(data.month_start)}`]} /> : undefined}
          list="Skills"
          state={data ? undefined : <LoadingState label="Loading the skills" />}
        >
          {data?.skills.map((skill) => (
            <SkillRow key={skill.purpose} skill={skill} />
          ))}
        </SettingsSection>
      ) : null}
    </SettingsFrame>
  );
```

Imports: drop `ShieldAlert`, `Wand2`; add `import { FORM_ALERT, INLINE_TARGET, LoadingState, MetaParts, NUM, QUIET, SettingsFrame, SettingsNote, SettingsSection, TYPE } from '../../components/ui';` and `settingsTitle`. Rewrite the doc comment without em dashes.

- [ ] **Step 5: AI feedback**

`src/pages/brain/Feedback.tsx`: `KINDS` gains tab keys:

```tsx
type KindTab = FeedbackKind | 'all';
const KINDS: { key: KindTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'classification', label: 'Classifications' },
  { key: 'proposal', label: 'Proposals' },
  { key: 'health_override', label: 'Health overrides' },
];
const ID = 'feedback';
```

and `const [tab, setTab] = useState<KindTab>('all'); const kind: FeedbackKind | '' = tab === 'all' ? '' : tab;` (the fetch effect keeps reading `kind`). `Change`:

```tsx
/** A before→after line for one field, or nothing if it didn't change. */
function Change({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  if (before === after) return null;
  const show = (v: unknown) => (v === null || v === undefined || v === '' ? NO_VALUE : String(v));
  const figure = (v: unknown) => (typeof v === 'number' ? NUM : '');
  return (
    <li className={TYPE.body}>
      <span className="text-ink-muted">{label}: </span>
      <span className={`text-ink-muted line-through ${figure(before)}`.trim()}>{show(before)}</span>
      <span className="text-ink-muted"> → </span>
      <span className={`font-semibold ${figure(after)}`.trim()}>{show(after)}</span>
    </li>
  );
}
```

The proposal line's decision span: `className={`font-semibold ${decision === 'approved' ? 'text-success-ink' : 'text-danger-ink'}`}`. `FeedbackLogPage`'s return:

```tsx
  const total = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <SettingsFrame
      title={settingsTitle('/settings/ai-feedback')}
      intro="Every time a person corrected the system: what it said, and what they said."
      note={canSeeAll ? undefined : <SettingsNote icon="lock">The feedback log spans every book, which needs the view-all-accounts capability.</SettingsNote>}
    >
      {canSeeAll ? (
        <>
          <div className="h-11 border-b border-line-subtle">
            <Tabs
              label="Kinds"
              idBase={ID}
              items={KINDS.map((k) => ({ key: k.key, label: k.label, count: k.key === 'all' ? total : (data?.counts[k.key] ?? 0) }))}
              value={tab}
              onChange={setTab}
            />
          </div>
          <div role="tabpanel" id={tabPanelId(ID, tab)} aria-labelledby={tabId(ID, tab)} className="flex flex-col gap-6">
            {error ? (
              <p role="alert" className={FORM_ALERT}>
                {error}
              </p>
            ) : null}
            <SettingsSection
              title="Corrections"
              list="Corrections"
              state={
                !data && isLoading ? (
                  <LoadingState label="Loading corrections" />
                ) : data && data.feedback.length === 0 && !isLoading ? (
                  <EmptyState title="Nothing corrected yet." detail="Corrections arrive from the AI Trending table, Waiting on you and health-score overrides." />
                ) : undefined
              }
            >
              {data?.feedback.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge>{entry.kind_display}</Badge>
                      <p title={entry.subject_label} className={`${TYPE.body} truncate font-semibold`}>
                        {entry.subject_label}
                      </p>
                    </div>
                    <p className={TYPE.meta}>
                      <MetaParts parts={[entry.made_by ?? 'someone', formatDate(entry.created_at.slice(0, 10))]} />
                    </p>
                  </div>
                  <EntryBody entry={entry} />
                  {entry.note ? <p className={`${TYPE.bodyMuted} italic`}>“{entry.note}”</p> : null}
                </li>
              ))}
            </SettingsSection>
          </div>
        </>
      ) : null}
    </SettingsFrame>
  );
```

`EntryBody`'s lists keep `<ul className="flex flex-col gap-0.5">`; its proposal paragraph becomes `TYPE.bodyMuted` with the kind in `font-semibold text-ink`. Imports: drop `MessageSquareWarning`, `ShieldAlert`; add `import { Badge, EmptyState, FORM_ALERT, LoadingState, MetaParts, NO_VALUE, NUM, SettingsFrame, SettingsNote, SettingsSection, TYPE, Tabs, tabId, tabPanelId } from '../../components/ui';` and `settingsTitle`. Rewrite comments without em dashes.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/pages/brain/Agents.test.tsx src/pages/brain/Skills.test.tsx src/pages/brain/Feedback.test.tsx src/pages/brain/BrainRoutes.test.tsx`
Expected: PASS (the old Brain addresses still redirect to the settings routes).

Run: `npm run lint` (expected: clean).

- [ ] **Step 7: Commit**

```bash
git add src/pages/brain/Agents.tsx src/pages/brain/Skills.tsx src/pages/brain/Feedback.tsx \
  src/pages/brain/Agents.test.tsx src/pages/brain/Skills.test.tsx src/pages/brain/Feedback.test.tsx
git commit -m "feat(settings): AI usage, AI skills and AI feedback on the settings frame

Each page is headed by its nav label without the Company Brain eyebrow;
purposes and skills are lists, the recent calls flush in their card;
budget bars are neutral until 70 and 90 percent; AI feedback switches
kinds with the ui tabs and keeps its corrections in one card.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: House rules for the Settings surface, the ratchet, docs, full verification

**Files:**
- Create: `src/components/settings.houseRules.test.ts`
- Modify: `src/test/uiRatchet.test.ts` (baselines), `src/test/inlineTargets.test.ts`, the comments in `src/components/ops.houseRules.test.ts`, `src/components/work/houseRules.test.ts` and `src/components/agents/houseRules.test.ts`, `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`
- Modify only if a rule fails: the offending Settings file (fix it; the commit goes with this task)

**Interfaces:**
- Consumes: `houseRuleSuite`, `uiRuleSuite`, `sizeOffenders` (`src/test/houseRules.ts`), `UI_OFFENCES`, `uiOffences`.
- Produces: the Settings files under every foundations rule, the em-dash ban, the live-region rule and the page-frame rules; account settings proven untouched; lower ratchet baselines.

- [ ] **Step 1: Write the Settings rule suite**

`src/components/settings.houseRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite, sizeOffenders, uiRuleSuite } from '../test/houseRules';

// The Settings surface (UI foundations spec §9.2 row 4): every page under
// WorkspaceSettingsLayout and the components only they render, on every
// house rule and every foundations rule (§9.4). Account settings
// (/account-settings/*, /profile, SettingsLayout, SettingsSidebar) are out
// of scope (owner, 2026-10-09 and 2026-10-10): named below, never globbed.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(
    import.meta.glob(
      [
        '../pages/settings/*.{ts,tsx}',
        '!../pages/settings/*.test.{ts,tsx}',
        '!../pages/settings/testAttributes.ts',
        '!../pages/settings/AccountSettingsPage.tsx',
        '!../pages/settings/IntegrationsSettingsPage.tsx',
        '!../pages/settings/PersonalizationPage.tsx',
        '!../pages/settings/SkillsTasksPage.tsx',
        '!../pages/settings/AboutSettingsPage.tsx',
        '!../pages/settings/BillingSettingsPage.tsx',
      ],
      { query: '?raw', eager: true, import: 'default' },
    ),
  ),
  ...raw(import.meta.glob(['../pages/users/*.tsx', '!../pages/users/*.test.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['../pages/integrations/*.tsx', '!../pages/integrations/*.test.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['./integrations/*.tsx', '!./integrations/*.test.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['../pages/brain/Agents.tsx', '../pages/brain/Skills.tsx', '../pages/brain/Feedback.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../layouts/WorkspaceSettingsLayout.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(
    import.meta.glob(
      [
        './work/WorkSettingsForm.tsx',
        './work/WorkSettingsSummary.tsx',
        './work/WorkTasksForm.tsx',
        './work/WorkTasksSummary.tsx',
        './work/WorkNotificationsForm.tsx',
        './work/WorkNotificationsSummary.tsx',
        './agents/AgentCard.tsx',
        './agents/AgentsForm.tsx',
        './agents/AgentsSummary.tsx',
        './agents/ActionsGridForm.tsx',
        './agents/ActionsGridSummary.tsx',
        './agents/AiOffNotice.tsx',
      ],
      { query: '?raw', eager: true, import: 'default' },
    ),
  ),
};

// The brands' own marks keep their colours (owner-visible choice, Settings
// PR): exempt from the token rule only, by name.
const LOGOS = ['./integrations/providerLogos.tsx'];
// Out of scope, never in this suite (the account settings round).
const ACCOUNT = /AccountSettingsPage|IntegrationsSettingsPage|PersonalizationPage|SkillsTasksPage|AboutSettingsPage|BillingSettingsPage|components\/settings\/|layouts\/SettingsLayout/;
// The twenty pages of the settings nav (their route elements in routes.tsx).
const PAGES = [
  '../pages/settings/GeneralSettingsPage.tsx',
  '../pages/users/UserManagement.tsx',
  '../pages/integrations/Integrations.tsx',
  '../pages/settings/PlanBillingPage.tsx',
  '../pages/settings/SettingsPage.tsx',
  '../pages/settings/DefaultsPage.tsx',
  '../pages/settings/ProductsPage.tsx',
  '../pages/settings/EntityUploadsPage.tsx',
  '../pages/settings/WorkRecommendationsPage.tsx',
  '../pages/settings/WorkTasksPage.tsx',
  '../pages/settings/WorkNotificationsPage.tsx',
  '../pages/settings/BriefDeliveryPage.tsx',
  '../pages/settings/AgentsSettingsPage.tsx',
  '../pages/settings/AgentActionsPage.tsx',
  '../pages/settings/AIAttributesPage.tsx',
  '../pages/brain/Skills.tsx',
  '../pages/brain/Agents.tsx',
  '../pages/brain/Feedback.tsx',
  '../pages/settings/WebhooksPage.tsx',
  '../pages/settings/AgentAccessPage.tsx',
];
// The only tables: real matrices and logs (spec §4.2).
const TABLES = [
  '../pages/users/UserManagement.tsx',
  '../pages/settings/PlanBillingPage.tsx',
  '../pages/settings/EntityUploadsPage.tsx',
  '../pages/brain/Agents.tsx',
  './agents/ActionsGridForm.tsx',
  './agents/ActionsGridSummary.tsx',
];
const CONDITIONAL_STATUS = /(?:\?|&&)\s*\(?\s*<\w+[^>]*\brole="status"/;
const HIDDEN_STATUS = /role="status"[^>]*\bempty:hidden\b/;

const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));
const tsx = sources.filter(([file]) => file.endsWith('.tsx'));
const outside = (names: string[]) => Object.fromEntries(Object.entries(files).filter(([file]) => !names.includes(file)));

houseRuleSuite('Settings: house rules', outside(LOGOS));
uiRuleSuite('Settings: foundations rules', files);

describe('Settings: frame, copy, live regions and scope', () => {
  it('never reads an account settings file', () => {
    expect(Object.keys(files).filter((file) => ACCOUNT.test(file))).toEqual([]);
  });

  it('keeps the brand marks on the type scale', () => {
    for (const file of LOGOS) expect(sizeOffenders(files[file]), file).toEqual([]);
  });

  it('heads every page with a SettingsFrame titled from the nav', () => {
    for (const page of PAGES) {
      expect(files[page], page).toMatch(/<(Work|Agent)?SettingsFrame\b/);
      expect(files[page], page).toContain('settingsTitle(');
    }
  });

  it('writes no page heading or page wrapper by hand', () => {
    const offenders = tsx.filter(([, source]) => /<h1\b|text-\[20px\]|\bmx-auto\b|\bmax-w-(?:2xl|4xl|7xl)\b|className="[^"]*\bp-6\b/.test(source)).map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('writes no em dash in a settings UI file, comments included', () => {
    expect(tsx.filter(([, source]) => source.includes('\u2014')).map(([file]) => file)).toEqual([]);
  });

  it('never hides or unmounts a role="status" region between updates', () => {
    expect(tsx.filter(([, source]) => CONDITIONAL_STATUS.test(source) || HIDDEN_STATUS.test(source)).map(([file]) => file)).toEqual([]);
  });

  it('draws a table only for a real matrix or log', () => {
    expect(tsx.filter(([file, source]) => /<table\b/.test(source) && !TABLES.includes(file)).map(([file]) => file)).toEqual([]);
  });

  it('uses the ui Select and Switch: no bare select, no hand-made switch', () => {
    expect(tsx.filter(([, source]) => /<select\b/.test(source)).map(([file]) => file)).toEqual([]);
    expect(tsx.filter(([, source]) => /role="switch"/.test(source)).map(([file]) => file)).toEqual([]);
  });

  it('covers every page and the pieces only they render', () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining([...PAGES, '../layouts/WorkspaceSettingsLayout.tsx', './integrations/MailboxSection.tsx', './agents/AgentCard.tsx', './work/WorkSettingsForm.tsx', '../pages/settings/GlobalConfigSection.tsx']));
  });
});
```

Notes for the executor:
- `uiRuleSuite` with no exemptions: `CODE` and the eyebrow come from `ui`, so no Settings file writes `font-mono-brand` or `uppercase` itself.
- `CONDITIONAL_STATUS` sees only a literal `role="status"` right after `?` or `&&`: `LoadingState` in a ternary is a component, and is how a card's loading state is meant to come and go.
- `.ts` helpers (`attributeConfig.ts`, `csvParser.ts`) are scanned by the house and foundations suites but not by the em-dash rule (they hold data, not UI copy).

In `src/test/inlineTargets.test.ts`, add `'../pages/brain/Skills.tsx'` to the glob; the count becomes 17 and the comment gains "and the AI skills Shows on link (Settings PR)".

Comments: in `src/components/ops.houseRules.test.ts`, "…and the AI usage, skills and feedback pages (pages/brain/Agents, Skills, Feedback, routed under Settings)." gains "; components/settings.houseRules.test.ts holds them since the Settings PR."; in `src/components/work/houseRules.test.ts` and `src/components/agents/houseRules.test.ts`, "(they keep the settings frame's own 20px h1)" becomes "(their frame is SettingsFrame since the Settings PR; components/settings.houseRules.test.ts holds them to the foundations rules)".

- [ ] **Step 2: Run it and fix every offender in a Settings file**

Run: `npx vitest run src/components/settings.houseRules.test.ts src/test/inlineTargets.test.ts`
Expected: PASS. If a rule fails, the message lists `file: offence`. Fix the file by the conversion rules (it belongs to one of Tasks 2 to 13; this is the safety net). Never exempt an in-scope file; never add an account settings file.

Then run every folder suite this PR touched: `npx vitest run src/components/work/houseRules.test.ts src/components/agents/houseRules.test.ts src/components/ops.houseRules.test.ts src/components/layout/houseRules.test.ts src/layouts/houseRules.test.ts src/components/ui/houseRules.test.ts` (expected: PASS).

- [ ] **Step 3: Prove account settings did not move**

```bash
git diff --stat 17f5013 -- src/layouts/SettingsLayout.tsx src/components/settings \
  src/pages/settings/AccountSettingsPage.tsx src/pages/settings/IntegrationsSettingsPage.tsx src/pages/settings/PersonalizationPage.tsx \
  src/pages/settings/SkillsTasksPage.tsx src/pages/settings/AboutSettingsPage.tsx src/pages/settings/BillingSettingsPage.tsx \
  src/pages/settings/BillingSettingsPage.test.tsx src/pages/settings/AccountSettingsPage.test.tsx src/pages/profile \
  src/components/organizations/portfolio/styles.ts src/index.css
```

Expected: no output. Run `npx vitest run src/pages/settings/AccountSettingsPage.test.tsx src/pages/settings/BillingSettingsPage.test.tsx src/pages/profile src/layouts/houseRules.test.ts` (expected: PASS, unchanged).

- [ ] **Step 4: Lower the ratchet**

Run: `npx vitest run src/test/uiRatchet.test.ts`
Expected: "keeps every baseline tight" fails, printing the measured totals (each `has no more … than the baseline` must pass: if one fails, a change raised an offence; find it with the test's "worst files" message and fix it). Write the measured totals into `BASELINE` and rerun: PASS. Each of `sizes`, `cards`, `shadows`, `opacityDisabled`, `mono`, `bold` must be lower than before this PR (`905 / 163 / 151 / 85 / 38 / 511` on `main` 17f5013). Measured before this PR, the in-scope files (account settings and `BillingSettingsPage` excluded) held about: sizes 252, cards 46, shadows 35, opacityDisabled 36, mono 5, bold 151 (plus the Navbar's one Settings `h1`); the totals should fall by close to those (about `653 / 117 / 116 / 49 / 33 / 359`). Record before and after in the commit body.

- [ ] **Step 5: Product docs**

`docs/03-ui-ux-design.md`: after the "Impact surface (2026-10-10)" paragraph add:

"**Settings surface (2026-10-10).** Every workspace settings page (`/settings/*`) sits in one `SettingsFrame`: its `h1` is the nav label (read through `settingsTitle`), with a muted intro and an optional one-line note; `default` width, or `wide` for Connections, Attributes, AI usage, AI skills and People & teams. The bar says "Settings" as text, drawn once by `WorkspaceSettingsLayout`. Every control sits in a `SettingsSection` (the heading outside, one card of divided rows inside) as a `SettingsRow`; a one-section form saves from its footer (`SettingsSave`), a form across sections from the sticky `SettingsSaveBar`, and each keeps its status region mounted. A button that opens a form is a plain button; the form owns the one primary. Lists are one card of rows (Attributes and Custom objects on tested container grids); Members, Credit history, Imports, AI usage's recent calls and Actions & approvals are tables flush in their card. People & teams, Attributes and AI feedback switch with `Tabs` under the heading. Permission notices are a quiet lock line, never an amber box; status colour is kept for real status (a failed delivery or sync, a refused import row, over budget, a seat limit reached, a verified or revoked domain). Account settings (`/account-settings/*`, `/profile`) keep their own look until their round; `/account-settings/billing` still renders the older billing page. No em dashes."

`docs/04-app-flow.md`: after the Impact paragraph add:

"Every workspace settings route (`/settings/*`) is under `WorkspaceSettingsLayout`, which draws `PageHeader title="Settings" titleAs="p"` into the Navbar's title slot once: the bar names the area as text and each page's `SettingsFrame` owns the page's only `h1`. The Navbar's Settings branch is gone; `/account-settings/*` keeps its own header."

- [ ] **Step 6: Full checks and the after set**

Run: `npm run lint` (expected: clean), `npm run build` (expected: success), `npm test` (expected: every file passes).

Start Vite as in Task 1 Step 1, then:

```bash
node scripts/ui-shots.mjs --label after \
  --seed ../../revenact-backend/services/accounts/management/commands/seed_demo.py \
  --cli node_modules/.bin/playwright-cli \
  /settings/general /settings/people /settings/connections /settings/billing \
  /settings/data /settings/defaults /settings/products /settings/entity-uploads \
  /settings/recommendations /settings/work-tasks /settings/work-notifications /settings/brief-delivery \
  /settings/agents /settings/agent-actions \
  /settings/ai-attributes /settings/ai-skills /settings/ai-usage /settings/ai-feedback \
  /settings/webhooks /settings/agent-access \
  /account-settings/account /account-settings/billing
```

Expected: 92 paths, `/__ui` first; no layout or console problem that was not in the before list (the gallery must report none). Take the same extras as in Task 1. Read each before/after pair (desktop and phone, light and dark) with the Read tool and check against the spec:
- the bar: "Settings" at the content's 16px left edge, transparent, the hairline once the page scrolls; no second title;
- every page: the display `h1` equal to the nav label, the intro under it, the frame's left edge the same on every page, no page re-centring (People), `wide` pages at 64rem;
- one card standard, no shadows, no card inside a card (the DNS record, the issued key, the TXT value on `bg-subtle` without a border);
- at most the four sizes and two weights; figures in the body font; IDs, keys, URLs, the slug and attribute API names in DM Mono; no uppercase outside the nav's group labels;
- forms: labels in the row's label column (beside from sm, above on a phone) or above in dialogs; errors under their fields; one accent button per form; the sticky save bar on Recommendations and Agents only while there is something to save or say;
- lists one card of divided rows; at 1440 the column labels over Attributes and Custom objects; on phones each row one line with its facts in the meta;
- colour only for status: no amber permission boxes, no green "Saved.", no blue budget bars, no tinted type icons, no accent "Add" openers;
- the two account settings routes: before and after identical (any difference is a bug in this PR: find what changed under Step 3's paths);
- dark mode: card borders visible on the canvas, badges readable on their tints, checkboxes and radios in the accent.
Fix any miss in the task that owns the file (its own commit), then rerun the affected tests and the screenshots of that route.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings.houseRules.test.ts src/test/uiRatchet.test.ts src/test/inlineTargets.test.ts \
  src/components/ops.houseRules.test.ts src/components/work/houseRules.test.ts src/components/agents/houseRules.test.ts \
  docs/03-ui-ux-design.md docs/04-app-flow.md
git add <each Settings file Step 2 fixed, by path>
git commit -m "test(ui): hold the Settings surface to the foundations rules and lower the ratchet

Ratchet before -> after: sizes A -> a, cards B -> b, shadows C -> c,
opacityDisabled D -> d, mono E -> e, bold F -> f. Account settings files
are named out of the suite and unchanged since 17f5013.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Replace the letters with the measured numbers.)

- [ ] **Step 8: Rebase if `main` moved**

```bash
git fetch origin
git log --oneline HEAD..origin/main
```

If `origin/main` has new commits: `git rebase origin/main`, resolve conflicts keeping both sides' intent (most likely in `Navbar.tsx`, `Navbar.test.tsx`, `src/components/ui/*`, `src/test/inlineTargets.test.ts` and `src/test/uiRatchet.test.ts`), rerun `npm test`; if the ratchet's tight test reports new totals, set `BASELINE` to them in a commit `test(ui): re-record the UI ratchet after rebasing the Settings PR` (body: which counts moved and why). Rerun lint, build and the after screenshots, and Step 3's diff against the new base.

- [ ] **Step 9: Hand off**

Do not push. Report: the commit list, test/lint/build results, the before/after screenshot paths for the PR body (per route: desktop and phone, light and dark, the extras, and `/__ui`), the layout problems the runner reported before and after, the account settings diff (empty) and the ratchet numbers.

---

## Not in this PR (noted for later rounds)

- **Account settings** (`/account-settings/*`, `/profile`, `SettingsLayout.tsx`, `SettingsSidebar.tsx`, `AccountSecurity`, `BillingSettingsPage`): the owner's own round. Spec §9.1's move of `SettingsLayout`/`SettingsSidebar` into `WorkspaceSettingsLayout` (a "You" group) waits for it; so does retiring `BillingSettingsPage` in favour of `PlanBillingPage`.
- `ConfirmDialog` (shared by every Settings delete and by Records): its `shadow-sm` confirm and `disabled:opacity-50` move in the shell round.
- The custom object records page (`/custom-objects/:id`, `ManageFieldsPanel`): reached from Settings but not under it.
- Real custom attributes ("Add attribute"): the disabled button is gone because nothing behind it exists; the feature is a backend change.
- Online checkout on Plan & billing ("Online checkout is coming").
- Where Global configuration lives (Attributes, after the tabs, in this PR; Defaults is the alternative): an owner question in the summary.
- People & teams' tab in the URL (`?tab=roles`): a small follow-up; the tab is local state today, as before.
- `components/organizations/activity/formStyles.ts` `CONTROL` (`disabled:opacity-50`) and `components/brain/styles.ts` `LIST`: no Settings file imports them any more; their remaining callers (the task panel, the create forms) move in their own rounds.
