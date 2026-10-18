# UI Records Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Organizations, Accounts and Contacts (`/organizations/*`, `/accounts/*`, `/contacts/*`) onto the shared UI primitives in `src/components/ui/`: one card standard, lists as one divided card, tiles, one toolbar, designed states, badges with real meaning only, the four-size type scale, figures in the body font, and the page title drawn by the page through `PageHeader` in the Navbar bar.

**Architecture:** Records-owned components switch their markup to the primitives; shared legacy helpers that other surfaces still import (`PortfolioSections` `EmptyState`/`ErrorBlock`/`ItemSkeleton`/`MoreButton`, `detail/listStyles.ts`, `detail/ListParts.tsx`, `detail/DetailTabs.tsx`, `portfolio/tileParts.tsx`, `portfolio/filterParts.tsx`, `BoardLayout`) keep their exports and output for those surfaces until their own PRs. Where a shared component must change for Records (`PagedSections`, `GroupSortFields`, `AccountRow`, `MapRow`), the change is opt-in by prop or applied everywhere with the other surfaces' tests run. A few gaps in the primitives found while mapping (Toolbar's phone layout with a `lead`, Tile with an action and a press, container-sized tile rows, ListRow data attributes, tab scroll-into-view, chip counts, badge truncation, avatars) are closed first, then `Menu` moves into `ui/`, then `PageHeader` gets a title slot in the Navbar bar.

**Tech Stack:** React 19 + TypeScript, Vite 8, Tailwind v4 (`@theme` in `src/index.css`, container queries `@container` / `@min-[NNrem]:`), react-router 7, lucide-react, Vitest + Testing Library (jsdom), `scripts/ui-shots.mjs` (Playwright CLI) for screenshots.

**Spec:** `docs/superpowers/specs/2026-10-09-ui-foundations-design.md` (owner-approved 2026-10-09, binding): §2 type scale, §3 numbers, §4 surfaces, §5 controls, §6.1 PageHeader, §7 density and colour rules, §9.1 mapping, §9.2 row 1 (Records), §9.3 verification, §9.4 house rules and ratchet, §11 owner answers (glass Ask rail approved on Organizations, Accounts, Contacts, Brain, Pipelines, Dashboard; account settings untouched). Read it alongside this plan. The Records audit (`.../scratchpad/ui/records-findings.md`, findings S1 to S10) explains why each change is made; this plan does not depend on it.

## Global Constraints

- Worktree `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/ui-records-fe`, branch `feat/ui-records`, cut from `feat/ui-foundations` 2d80d97 (PR #129, not merged). All paths below are relative to the worktree. After #128 and #129 merge, this branch is rebased onto `origin/main` (Task 14 Step 6). Plan on top of #128: assume its changes are in main (see "Overlaps").
- Scope: the routes above and the components they render. Out of scope: account settings (`/account-settings/*`, `/profile`, `SettingsLayout.tsx`, `SettingsSidebar.tsx`), the legacy `.rv-card` class, the create/edit modals (`OrganizationFormModal`, `ChurnOrganizationModal`, `ConfirmDialog`, `pages/organizations/AccountFormModal`, `ContactFormModal`, `ContactRowActionsPopover`), the `+ Add` sheet forms (`activity/CallSenseTab`, `NotesTab`, `SurveysTab`, `TasksTab`, shared with Work), the other legacy `activity/*` tabs, `RecordPlans` (plans folder, Impact PR), and the glass Ask rail (`AskRail`, `.rv-card-glass`, kept exactly as is).
- Tokens only, both themes: no hex, `rgb()`, named palette colour, `bg-white`/`text-black` in any `src` file.
- Type sizes 11/13/15/22 px only, through `TYPE` (`ui/type.ts`) wherever a role fits; weights `font-normal` and `font-semibold` only.
- Figures use `NUM` (`tabular-nums`, body font); `CODE`/`font-mono-brand` only for IDs, keys, endpoints. Wrap the figure, never the phrase, never a word ("set by hand", "No renewal date").
- One card standard (`Card`, `ListCard`, `Tile`): `rounded-xl border border-line bg-surface`, no shadow, no card inside a card. `shadow-lg` only on overlays (`OVERLAY`).
- 44px targets below `sm` (`min-h-11`); one primary per form or toolbar; a `role="status"` region is never `display:none` or unmounted between updates (use `sr-only`); `min-h-[100dvh]`, never `h-screen`; Lucide icons only, `aria-hidden="true"` when decorative; every icon-only button has an `aria-label`.
- Colour (spec §7): amber/red only for health band average/poor, risk at or above threshold, overdue, failed/rejected, a trend next to its direction word, destructive actions. Counts, departments, categories, "open" and "not set" are neutral. At most 2 badges per row (one semantic, one neutral) and 1 per tile or card header; never a badge that restates the page's own record.
- Copy: sentence case; **no em dash (U+2014) in any added `src` line** (code, comments, tests). Lines that already hold the `'—'` no-value mark stay byte-identical; restyle around them. If such a line must change, use `NO_VALUE` from `src/components/ui/format.ts` (Task 2).
- Order: Tasks run in number order. Tasks 3, 4 and 7 edit #128's files and need #128 in the branch (`test -f src/components/layout/phoneHeader.ts`); if it is not, run Task 14 Step 6's rebase as soon as #128 is merged, or do the other tasks first. Task 7 needs Task 4; Task 13 needs Tasks 9 and 10; every task needs Tasks 1 and 2.
- Never run prettier. Never `git stash`. `git add` explicit paths only. Never push.
- Commits: conventional (`feat(records): ...`, `refactor(ui): ...`, `test(records): ...`, `docs(ui): ...`), each message ending with the trailer line exactly: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- Checks: `npm test` (Vitest), `npm run lint`, `npm run build`. One file: `npx vitest run <path>`. Every task ends with its own test files green plus `npm run lint`; Task 14 runs everything.
- Screenshots: API at `http://localhost:8000`; Vite from this worktree on 5175 via `VITE_API_URL= npx vite --config scripts/ui-shots.vite.config.mjs --port 5175`; runner `node scripts/ui-shots.mjs --seed ../../revenact-backend/services/accounts/management/commands/seed_demo.py --cli node_modules/.bin/playwright-cli ...`. Never write the demo password anywhere. `shots/` is gitignored.

## Conversion rules (apply in every file a task touches)

These are the mechanical rules; each task's table lists the non-mechanical moves.

| Today | Becomes |
|---|---|
| `font-mono-brand tabular-nums` (or `font-mono-brand`) on a figure | `NUM` (`tabular-nums`) |
| `font-mono-brand` on words or initials | removed (body font) |
| `font-bold`, `font-extrabold`, `font-medium` | `font-semibold` on headings, labels, buttons; removed on body text |
| `text-[9.5px]`, `[10px]`, `[10.5px]`, `[11.5px]`, `text-xs` | `text-[11px]` (`TYPE.meta`) |
| `text-[12px]` | `13` on controls, inputs, body; `11` on captions, helper text, badges |
| `text-[12.5px]`, `[13.5px]`, `[14px]`, `[14.5px]`, `text-sm`, `text-base` | `text-[13px]` (`TYPE.body`/`TYPE.bodyMuted`); a heading that used 14 becomes `TYPE.title` |
| `text-[16px]`..`[18px]`, `text-lg` | `TYPE.title` |
| A section heading `text-[11px] font-semibold uppercase tracking-wider text-ink-muted` | `TYPE.title` (an `h2` or `CardHeader`); inside a card's sub-section `TYPE.label` (`h3`). Uppercase stays only on tile labels (`TYPE.eyebrow`). |
| `text-danger` / `text-warning` / `text-success` / `text-info` on **text** | `text-danger-ink` / `text-warning-ink` / `text-success-ink` / `text-info-ink` (dots, bars, icons keep the plain tokens) |
| `text-ink-faint` on readable copy | `text-ink-muted` (faint is for placeholders, disabled text, decorative icons) |
| `disabled:opacity-50` (any `disabled:opacity-*`) | removed; the control uses `BUTTON`/`QUIET`/`PRIMARY`/`ICON_BUTTON`/`SELECT`/`INPUT`, whose disabled states are token-based; a checkbox keeps only `disabled:cursor-not-allowed` |
| `shadow-sm`, `shadow-md`, `hover:shadow-*` on a card or row | removed |
| `shadow-md` on a popover, menu or floating bar | `OVERLAY` (`rounded-xl border border-line bg-elevated shadow-lg`) |
| `rounded-xl bg-surface` box (with or without `border`/`shadow`), `rounded-lg border border-line-subtle` box inside a card | `Card` / `ListCard` / `CardSection`, or flat `divide-y divide-line-subtle` inside the owning card |
| Hand-written icon button (`inline-flex w-11 h-11 sm:w-8 sm:h-8 ... rounded-lg text-ink-muted hover:bg-subtle ...`) | `ICON_BUTTON` + `aria-label` |
| Hand-written accent button (`bg-accent text-on-accent ...`) | `PRIMARY` (one per form/toolbar); otherwise `BUTTON` |
| `` `${QUIET} border border-line` `` | `BUTTON` |
| Bare `<select>` | `Select` (`labelPosition` `above` in forms, `inline` in toolbars, `hidden` when the first option names it) |
| Bare search `<input type="search">` | `SearchInput` (placeholder at most 24 characters) |
| `px-3 py-2.5` row padding | `px-4 py-3` (`ListRow` regular) |
| Imports | from the ui index: `import { Card, ListCard, ... } from '<relative>/ui';` (e.g. `'../../ui'` from `components/organizations/portfolio/`). Where a file also imports the legacy `EmptyState`/`ErrorBlock` from `PortfolioSections` or `ErrorState` from `dashboard/shared/DataState`, import the ui ones as `EmptyState as UiEmptyState`, `ErrorState as UiErrorState` |

## Overlaps with #128 (`fix/ui-broken`, assume merged) and #129 (`feat/ui-foundations`, this branch's base)

| File | #128 change | This plan |
|---|---|---|
| `src/components/layout/Navbar.tsx` | phone header: `PHONE_UNWRAP`/`PHONE_TABS` on the framed wrappers and the Organizations/Accounts/Pipelines/Dashboard tab navs, `min-w-0 truncate` titles, `data-testid="nav-tools"`, dead icons and `IconButton` removed | Task 3 deletes the Organizations, Accounts, Contacts and record-page branches #128 edited and puts a title slot in their place (inside #128's `PHONE_UNWRAP` wrappers); adds `data-page-header` and the hairline to the framed header |
| `src/components/layout/Navbar.test.tsx` | phone tests (`it.each` over `/organizations/list`, `/accounts/board`, `/contacts`, ...) | Task 3 removes those three rows and rewrites the record-route describes; a new `pageHeaderSlot.test.tsx` covers the phone rows for Records |
| `src/components/layout/phoneHeader.ts` | new (`PHONE_UNWRAP`, `PHONE_TABS`) | read only (Navbar's title slot uses `PHONE_UNWRAP`) |
| `src/layouts/DashboardLayout.tsx` | `isSurveys` frame | Task 3 adds the title-slot state (different hunk) |
| `src/components/organizations/portfolio/rowParts.tsx` + `rowParts.test.tsx` | `HealthRing` shows "10" for a full score | Task 4 keeps `shown`, changes the classes around it and the ring track |
| `src/components/organizations/portfolio/BoardCard.tsx` | figures line `flex-wrap gap-x-2 gap-y-1` | Task 7 rewrites the card on `Card`, keeping that line |
| `src/components/organizations/portfolio/PortfolioBoard.tsx` | `useMoreToTheRight`, `MORE_FADE`, `rv-scrollbar` on the column row | Task 7 changes only the empty/error states and the phone column chips' figures |
| `src/pages/organizations/Board.test.tsx` | scroll-fade test finds the figures line through `.font-mono-brand` | Task 7 changes that lookup to `[data-part="arr"]` |
| `src/components/ui/*`, `src/test/houseRules.ts`, `src/test/uiRatchet.test.ts`, `src/pages/dev/UiGallery.tsx`, `portfolio/styles.ts` | (#129) the primitives, rules and baselines | Tasks 1, 2, 3 extend primitives; Task 14 lowers the ratchet baselines and adds `uiRuleSuite` for Records |

No file in this plan is touched by #128 other than the ones listed. If #129 changes in review, rebase and re-run Task 2's tests first.

## File structure

| Path | Responsibility |
|---|---|
| `src/components/ui/Menu.tsx` (moved from `organizations/detail/Menu.tsx`) | The one menu button: portalled by default, `OVERLAY` surface |
| `src/lib/useDismiss.ts` (moved from `organizations/portfolio/useDismiss.ts`) | Outside press / Escape dismissal for popups (ui must not import features) |
| `src/components/ui/Avatar.tsx` (new) | `Initials`, `IconChip`: the 32/44px leading circles rows and headers use |
| `src/components/ui/format.ts` (new) | `NO_VALUE`, the no-value mark, for lines that must change |
| `src/components/ui/{Toolbar,Tile,tileRow,List,Tabs,FilterChip,Badge,Card,PageHeader,index}.ts(x)` | Gaps closed (Task 2) and the title slot (Task 3) |
| `src/layouts/navActionsSlot.ts` | Context gains `titleSlot` / `setTitleSlot` |
| `src/components/organizations/portfolio/ViewTabs.tsx` (new) | List / Board link tabs that carry the query |
| `src/components/organizations/portfolio/rowColumns.ts` (new) | The portfolio row's grid template and header labels |
| `src/components/organizations/portfolio/LifecycleCard.tsx` (new) | The Lifecycle breakdown, moved out of the tile row (spec §4.3) |
| `src/components/organizations/portfolio/filterCount.ts` (new) | `useFilterCount`: the "14 organizations" line the toolbar announces |
| `src/components/contacts/ContactsTiles.tsx` (new) | The Contacts summary as four tiles |
| Modified, Records | `components/organizations/{portfolio,detail}/*`, `components/organizations/{CompanyViewTab,AccountBriefPanel,QuestionsPanel}.tsx`, `components/organizations/activity/HeadlinesTab.tsx`, `components/accounts/**`, `components/contacts/{ContactList,ContactListItem,ContactsToolbar,ContactProfile,HistoryItems}.tsx`, `components/shared/{CustomObjectsTab,OwnerTile}.tsx`, `components/canvas/{MapsTab,MapRow}.tsx`, `pages/{organizations,accounts,contacts}/**` |
| Modified, shared (callers only) | `components/plans/PlanHeader.tsx`, `components/canvas/{EdgeLabelMenu,MapHeader,NodeMenu}.tsx` (Menu import), `components/segments/MembersTab.tsx` (framed sections), `components/copilot/AskAboutButton.tsx` (none; reused as is) |
| Tests | each task's own; `src/components/layout/pageHeaderSlot.test.tsx` (new), `src/components/organizations/portfolio/ViewTabs.test.tsx` (new), `src/components/records.houseRules.test.ts` (new, Task 14), `src/test/uiRatchet.test.ts` |
| Docs | `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` (Task 14) |

Route list for screenshots (used in Task 1 and Task 14), with the demo seed's ids: `/organizations/list /organizations/board /organizations/19 /organizations/19?tab=details /organizations/19?tab=people /organizations/19?tab=maps /organizations/19?tab=deals /organizations/19?tab=knowledge /organizations/19?tab=files /accounts/list /accounts/board /accounts/4 /accounts/4?tab=details /accounts/4?tab=objects /contacts /contacts/11`. If an id is missing in the local seed, pick any organisation, account and contact from the list pages and use the same ids before and after.

---

### Task 1: Before screenshots, `Menu` into `ui/`, `useDismiss` into `lib/`

**Files:**
- Move: `src/components/organizations/detail/Menu.tsx` → `src/components/ui/Menu.tsx`; `src/components/organizations/detail/Menu.test.tsx` → `src/components/ui/Menu.test.tsx`
- Move: `src/components/organizations/portfolio/useDismiss.ts` → `src/lib/useDismiss.ts`; `src/components/organizations/portfolio/useDismiss.test.tsx` → `src/lib/useDismiss.test.tsx`
- Modify: `src/components/ui/OverflowMenu.tsx`, `src/components/ui/index.ts`
- Modify (import path only): `src/components/organizations/detail/{StoryToolbar,DetailNameRow,PersonItem,OrganizationHeader,SourcesPicker}.tsx`, `src/components/organizations/portfolio/{PinFieldsMenu,MoveToMenu}.tsx`, `src/components/plans/PlanHeader.tsx`, `src/components/canvas/{EdgeLabelMenu,MapHeader,NodeMenu}.tsx`

**Interfaces:**
- Produces: `Menu({ label, trigger, triggerClassName, items, align = 'end', portal = true })` and `type MenuItem = { key: string; label: string; onSelect: () => void; danger?: boolean }` from `src/components/ui/Menu.tsx` (re-exported by `ui/index.ts`); `useDismiss(refs, onDismiss, active?)` and `type DismissReason` from `src/lib/useDismiss.ts`.

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
  /organizations/list /organizations/board /organizations/19 "/organizations/19?tab=details" "/organizations/19?tab=people" \
  "/organizations/19?tab=maps" "/organizations/19?tab=deals" "/organizations/19?tab=knowledge" "/organizations/19?tab=files" \
  /accounts/list /accounts/board /accounts/4 "/accounts/4?tab=details" "/accounts/4?tab=objects" /contacts /contacts/11
```

Expected: 68 paths under `shots/` (the `/__ui` gallery first, 4 per route). Layout problems the runner reports now are pre-existing: copy the list into your notes for Task 14. Open three PNGs with the Read tool to confirm they show the signed-in app. Stop Vite.

- [ ] **Step 2: Move the files with history**

```bash
git mv src/components/organizations/portfolio/useDismiss.ts src/lib/useDismiss.ts
git mv src/components/organizations/portfolio/useDismiss.test.tsx src/lib/useDismiss.test.tsx
git mv src/components/organizations/detail/Menu.tsx src/components/ui/Menu.tsx
git mv src/components/organizations/detail/Menu.test.tsx src/components/ui/Menu.test.tsx
```

Fix the relative imports inside the two moved test files if they import anything other than `./useDismiss` / `./Menu`.

- [ ] **Step 3: Write the failing tests**

Append to `src/components/ui/Menu.test.tsx` (inside the top-level `describe`; reuse its imports, adding `render`, `screen`, `userEvent` if missing):

```tsx
  it('portals by default and floats on the overlay surface (UI foundations spec §4.1)', async () => {
    render(<Menu label="More actions" trigger="More" triggerClassName="" items={[{ key: 'open', label: 'Open', onSelect: () => {} }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass('rounded-xl', 'border-line', 'bg-elevated', 'shadow-lg');
    expect(menu.className).not.toMatch(/shadow-md/);
  });

  it('sets a destructive item in the readable danger ink', async () => {
    render(<Menu label="Actions" trigger="More" triggerClassName="" items={[{ key: 'churn', label: 'Churn', onSelect: () => {}, danger: true }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menuitem', { name: 'Churn' })).toHaveClass('text-danger-ink');
  });
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run src/components/ui/Menu.test.tsx`
Expected: FAIL (import errors until Step 5, then the two new tests fail on `parentElement` and the classes).

- [ ] **Step 5: Implement**

In `src/components/ui/Menu.tsx`:
- Imports: `import { useDismiss } from '../../lib/useDismiss';` and `import { FOCUS, OVERLAY } from './styles';` (drop the two `../portfolio/...` imports).
- Signature: `portal = true` (was `false`). Doc comment: replace "With `portal` the menu renders at the end of the page" with "Portalled by default: the menu renders at the end of the page".
- The `<ul>` className becomes:

```tsx
      className={
        portal
          ? `z-50 min-w-44 py-1 ${OVERLAY}`
          : `absolute top-full z-30 mt-1 min-w-44 py-1 ${OVERLAY} ${align === 'end' ? 'right-0' : 'left-0'}`
      }
```

- The item button's tone: `item.danger ? 'text-danger-ink' : 'text-ink'`.

In `src/components/ui/OverflowMenu.tsx`: `import { Menu, type MenuItem } from './Menu';`.

In `src/components/ui/index.ts` add `export * from './Menu';` after `export * from './Switch';`.

Update every importer (find them with `grep -rln "detail/Menu'\|from './Menu'\|portfolio/useDismiss'\|from './useDismiss'" src`):
- `organizations/detail/{StoryToolbar,DetailNameRow,PersonItem,OrganizationHeader}.tsx`: `from '../../ui/Menu'`
- `plans/PlanHeader.tsx`, `canvas/{EdgeLabelMenu,MapHeader,NodeMenu}.tsx`: `from '../ui/Menu'`
- `organizations/detail/SourcesPicker.tsx`, `organizations/portfolio/{PinFieldsMenu,MoveToMenu}.tsx`: `from '../../../lib/useDismiss'`

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/ui src/lib/useDismiss.test.tsx src/components/organizations/detail src/components/plans src/components/canvas src/components/organizations/portfolio`
Expected: PASS. A test that looked for a menu item `within(...)` a row or card now fails because the menu is portalled: change that lookup to `screen` (same role and name). Do not pass `portal={false}` to make a test pass.

Run: `npm run lint` (expected: clean).

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Menu.tsx src/components/ui/Menu.test.tsx src/lib/useDismiss.ts src/lib/useDismiss.test.tsx \
  src/components/ui/OverflowMenu.tsx src/components/ui/index.ts \
  src/components/organizations/detail/StoryToolbar.tsx src/components/organizations/detail/DetailNameRow.tsx \
  src/components/organizations/detail/PersonItem.tsx src/components/organizations/detail/OrganizationHeader.tsx \
  src/components/organizations/detail/SourcesPicker.tsx src/components/organizations/portfolio/PinFieldsMenu.tsx \
  src/components/organizations/portfolio/MoveToMenu.tsx src/components/plans/PlanHeader.tsx \
  src/components/canvas/EdgeLabelMenu.tsx src/components/canvas/MapHeader.tsx src/components/canvas/NodeMenu.tsx
git add <any test file Step 6 changed, by path>
git commit -m "refactor(ui): move the menu button into ui, portalled on the overlay surface

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Close the primitive gaps Records needs

**Files:**
- Modify: `src/components/ui/Toolbar.tsx`, `Tile.tsx`, `tileRow.ts`, `List.tsx`, `Tabs.tsx`, `FilterChip.tsx`, `Badge.tsx`, `Card.tsx`, `index.ts`
- Create: `src/components/ui/Avatar.tsx`, `src/components/ui/format.ts`
- Test: `src/components/ui/{Toolbar,Tile,List,Tabs,FilterChip,Badge,Card}.test.tsx`, `src/components/ui/Avatar.test.tsx` (new)

**Interfaces:**
- Consumes: the primitives as they are on this branch.
- Produces (later tasks rely on these exact names):
  - `Toolbar({ lead?, search, filters?, actions?, count? })`: below `sm`, row 1 is search + count (`data-part="toolbar-search"`, `basis-full`); `lead` (`data-part="toolbar-lead"`), filters and actions share row 2; from `sm` the lead moves first (`sm:order-first`).
  - `Tile({ label, value, meta?, action?, pressed?, onPress?, onOpen?, expanded?, controls?, buttonLabel?, children? })`: `onPress` is a filter toggle (`aria-pressed`); `onOpen` opens or jumps (`aria-expanded` only when `expanded` is given); with `action` and a handler the label row and action sit outside the button, which is named by label and value unless `buttonLabel` is given.
  - `tileRow(columns: 2 | 3 | 4 | 5, within: 'viewport' | 'container' = 'viewport'): string`: `container` sizes the grid with `@min-[50rem]:grid-cols-N` (needs an `@container` ancestor).
  - `ListHeaderRow({ columns, labels, show = 'sm:grid' })`; `ListRow` gains `dataAttrs?: Record<`data-${string}`, string | number>` spread on the `li`.
  - `Tabs`: scrolls the selected tab into view when `value` changes.
  - `FilterChip({ label, pressed, onToggle, count?, describedBy? })`: `count` (`number | null`) after the label, accessible name "Story 12".
  - `Badge({ tone?, dot?, truncate?, children })`: `truncate` caps at `max-w-[10rem]` with an ellipsis.
  - `CardHeader({ title, level?, meta?, action?, id? })`: `id` on the heading (for `aria-labelledby`).
  - `Initials({ text, size = 'md' | 'lg' })`, `IconChip({ icon })` from `ui/Avatar.tsx`; `NO_VALUE` from `ui/format.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/ui/Toolbar.test.tsx` (inside the describe):

```tsx
  it('puts the search and count on row 1 below sm, and the lead, filters and actions on row 2', () => {
    setViewport(390);
    const { container } = renderToolbar('14 organizations');
    const bar = container.firstElementChild as HTMLElement;
    const search = screen.getByRole('textbox', { name: 'Search' }).closest('[data-part="toolbar-search"]')!;
    expect(bar.firstElementChild).toBe(search);
    expect(search).toHaveClass('basis-full', 'sm:flex-1', 'sm:basis-auto');
    const lead = screen.getByRole('button', { name: 'Opportunities' }).closest('[data-part="toolbar-lead"]')!;
    expect(search.nextElementSibling).toBe(lead);
    expect(lead).toHaveClass('sm:order-first');
  });
```

Append to `src/components/ui/Tile.test.tsx` (inside `describe('Tile ...')`):

```tsx
  it("keeps the action outside a filter tile's button, which its label and value name", async () => {
    const onPress = vi.fn();
    render(<Tile label="Renewing" value="4" meta="within 30 days" onPress={onPress} pressed action={<button type="button">30d</button>} />);
    const button = screen.getByRole('button', { name: 'Renewing 4' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).not.toContainElement(screen.getByRole('button', { name: '30d' }));
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('opens rather than presses: aria-expanded and aria-controls, never aria-pressed', () => {
    render(<Tile label="Health" value="6.2" onOpen={() => {}} expanded controls="breakdown" buttonLabel="Health 6.2, Average. Hide the breakdown" />);
    const button = screen.getByRole('button', { name: 'Health 6.2, Average. Hide the breakdown' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'breakdown');
    expect(button).not.toHaveAttribute('aria-pressed');
  });
```

and inside `describe('tileRow')`:

```tsx
  it('sizes the columns by the container when asked (the Ask rail narrows the column, not the window)', () => {
    const row = tileRow(4, 'container').split(' ');
    expect(row).toContain('@min-[50rem]:grid-cols-4');
    expect(row).not.toContain('lg:grid-cols-4');
  });
```

Append to `src/components/ui/List.test.tsx`:

```tsx
describe('ListRow and ListHeaderRow additions', () => {
  it('carries data attributes onto the row, and shows column labels from a chosen breakpoint', () => {
    const columns = '@min-[60rem]:grid-cols-[auto_minmax(12rem,1fr)]';
    render(
      <MemoryRouter>
        <ListCard label="Files" header={<ListHeaderRow columns={columns} labels={['', 'Name']} show="@min-[60rem]:grid" />}>
          <ListRow title="Brief.pdf" dataAttrs={{ 'data-file': 7 }} />
        </ListCard>
      </MemoryRouter>,
    );
    expect(screen.getByText('Brief.pdf').closest('li')).toHaveAttribute('data-file', '7');
    const header = screen.getByText('Name').parentElement!;
    expect(header).toHaveClass('hidden', '@min-[60rem]:grid');
    expect(header).not.toHaveClass('sm:grid');
  });
});
```

Append to `src/components/ui/Tabs.test.tsx` (top-level; add `vi` to the vitest import if missing):

```tsx
describe('Tabs scrolling', () => {
  it('scrolls the newly selected tab into view (a phone scrolls the row sideways)', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const items = [
      { key: 'story', label: 'Story' },
      { key: 'files', label: 'Files' },
    ] as const;
    const { rerender } = render(<Tabs label="Sections" items={items} value="story" onChange={() => {}} />);
    scroll.mockClear();
    rerender(<Tabs label="Sections" items={items} value="files" onChange={() => {}} />);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole('tab', { name: 'Files' }));
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });
});
```

Append to `src/components/ui/FilterChip.test.tsx`:

```tsx
  it('shows a count after the label, inside the name, and points at a description', () => {
    render(
      <>
        <p id="why">Waiting for the account.</p>
        <FilterChip label="Story" count={12} pressed={false} onToggle={() => {}} describedBy="why" />
      </>,
    );
    const chip = screen.getByRole('button', { name: 'Story 12' });
    expect(chip).toHaveAttribute('aria-describedby', 'why');
    expect(screen.getByText('12')).toHaveClass('text-[11px]', 'tabular-nums');
  });

  it('shows no count while it is not known', () => {
    render(<FilterChip label="Story" count={null} pressed={false} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Story' })).toBeInTheDocument();
  });
```

Append to `src/components/ui/Badge.test.tsx`:

```tsx
  it('truncates a long name when asked, keeping the full text in the DOM', () => {
    render(<Badge truncate>Pizza Hut US Operations and Franchise Partners</Badge>);
    const text = screen.getByText('Pizza Hut US Operations and Franchise Partners');
    expect(text).toHaveClass('truncate');
    expect(text.parentElement).toHaveClass('max-w-[10rem]');
  });
```

Append to `src/components/ui/Card.test.tsx`:

```tsx
  it("gives the header's heading an id when asked, for aria-labelledby", () => {
    render(<CardHeader title="Details" id="details-heading" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Details' })).toHaveAttribute('id', 'details-heading');
  });
```

Create `src/components/ui/Avatar.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Phone } from 'lucide-react';
import { IconChip, Initials } from './Avatar';
import { NO_VALUE } from './format';

describe('Avatar (UI foundations spec §3, §7)', () => {
  it('draws initials in the body font, 32px in rows and 44px in headers, hidden from screen readers', () => {
    const { rerender } = render(<Initials text="CB" />);
    const avatar = screen.getByText('CB');
    expect(avatar).toHaveAttribute('aria-hidden', 'true');
    expect(avatar).toHaveClass('h-8', 'w-8', 'text-[11px]', 'font-semibold', 'bg-subtle');
    expect(avatar.className).not.toMatch(/font-mono-brand/);
    rerender(<Initials text="CB" size="lg" />);
    expect(screen.getByText('CB')).toHaveClass('h-11', 'w-11', 'text-[13px]');
  });

  it('draws a neutral icon chip', () => {
    const { container } = render(<IconChip icon={Phone} />);
    expect(container.firstElementChild).toHaveClass('h-8', 'w-8', 'rounded-full', 'bg-subtle', 'text-ink-muted');
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('exports the no-value mark', () => {
    expect(NO_VALUE).toBe('\u2014');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/ui`
Expected: FAIL on each new test (missing props, missing files).

- [ ] **Step 3: Implement**

`src/components/ui/Toolbar.tsx`, the returned JSX (the doc comment: "Below sm the search and count take row 1; the lead, filters and actions share row 2. From sm the lead comes first."):

```tsx
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div data-part="toolbar-search" className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
        {search}
        <p role="status" aria-live="polite" className="shrink-0 text-[13px] text-ink-muted tabular-nums">
          {count}
        </p>
      </div>
      {lead ? (
        <div data-part="toolbar-lead" className="flex shrink-0 items-center sm:order-first">
          {lead}
        </div>
      ) : null}
      {filters}
      <ActionCluster primary={actions.primary} secondary={actions.secondary} />
    </div>
  );
```

`src/components/ui/Tile.tsx`, whole component:

```tsx
export function Tile({
  label,
  value,
  meta,
  action,
  pressed = false,
  onPress,
  onOpen,
  expanded,
  controls,
  buttonLabel,
  children,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  /** A filter tile: pressing toggles the list's filter (`aria-pressed`). */
  pressed?: boolean;
  onPress?: () => void;
  /** A tile that opens or jumps to more, with no pressed state. */
  onOpen?: () => void;
  /** With `onOpen`: whether what it opens is showing, and its id. */
  expanded?: boolean;
  controls?: string;
  /** The button's name when label, value and meta do not say what it does. */
  buttonLabel?: string;
  children?: ReactNode;
}) {
  const labelId = useId();
  const valueId = useId();
  const labelRow = (withAction: boolean) => (
    <span className="flex min-h-6 items-center justify-between gap-2">
      <span id={labelId} className={TYPE.eyebrow}>
        {label}
      </span>
      {withAction ? action : null}
    </span>
  );
  const figures = (
    <>
      <span id={valueId} className={`mt-1 block ${TYPE.display} ${NUM}`}>
        {value}
      </span>
      {meta ? <span className={`mt-0.5 block ${TYPE.meta} line-clamp-2`}>{meta}</span> : null}
      {children ? <span className="mt-2 flex flex-col gap-0.5">{children}</span> : null}
    </>
  );
  const handler = onPress ?? onOpen;
  if (handler) {
    const isPressed = onPress ? pressed : undefined;
    const states = {
      'aria-pressed': isPressed,
      'aria-expanded': onOpen ? expanded : undefined,
      'aria-controls': onOpen && expanded ? controls : undefined,
    };
    if (action) {
      return (
        <Card as="div" pad="none" selected={Boolean(isPressed)} className={WIDTH}>
          <span className="block px-3 pt-3">{labelRow(true)}</span>
          <button
            type="button"
            {...states}
            aria-label={buttonLabel}
            aria-labelledby={buttonLabel ? undefined : `${labelId} ${valueId}`}
            onClick={handler}
            className={`flex min-h-11 w-full flex-col rounded-b-xl px-3 pb-3 text-left hover:bg-subtle ${FOCUS}`}
          >
            {figures}
          </button>
        </Card>
      );
    }
    return (
      <Card as="div" pad="none" selected={Boolean(isPressed)} className={WIDTH}>
        <button type="button" {...states} aria-label={buttonLabel} onClick={handler} className={`flex min-h-11 w-full flex-col rounded-xl p-3 text-left hover:bg-subtle ${FOCUS}`}>
          {labelRow(false)}
          {figures}
        </button>
      </Card>
    );
  }
  return (
    <Card as="div" pad="sm" role="group" aria-labelledby={labelId} className={WIDTH}>
      {labelRow(true)}
      {figures}
    </Card>
  );
}
```

Update its doc comment: "`onPress` makes a filter tile (`aria-pressed`); `onOpen` a tile that opens or jumps to more. Children inside a button must be inline (`span`)."

`src/components/ui/tileRow.ts`:

```ts
const TILE_COLUMNS = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' } as const;
const CONTAINER_COLUMNS = { 2: '@min-[50rem]:grid-cols-2', 3: '@min-[50rem]:grid-cols-3', 4: '@min-[50rem]:grid-cols-4', 5: '@min-[50rem]:grid-cols-5' } as const;

/** A row of tiles (UI foundations spec §4.3): below sm a sideways snap strip
 *  that bleeds to the frame's edge (the page never scrolls sideways), from
 *  sm a grid of two, and `columns` from lg, or, with `within="container"`,
 *  once the nearest `@container` is 50rem wide (pages beside the Ask rail,
 *  which narrows the column, not the window). `items-start`, so each tile
 *  takes its own content's height instead of stretching to the tallest. */
export function tileRow(columns: 2 | 3 | 4 | 5, within: 'viewport' | 'container' = 'viewport'): string {
  const wide = within === 'container' ? CONTAINER_COLUMNS[columns] : TILE_COLUMNS[columns];
  return `-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 ${wide}`;
}
```

`src/components/ui/List.tsx`:
- `ListHeaderRow({ columns, labels, show = 'sm:grid' }: { columns: string; labels: string[]; show?: string })`, className `` `hidden items-center gap-3 border-b border-line-subtle px-4 py-2 ${show} ${columns}` ``; doc: "`show` is the breakpoint the labels appear at (default sm; a portfolio row's container query otherwise)."
- `ListRowProps` gains `/** Data attributes for the row's li (tests and field coverage read them). */ dataAttrs?: Record<`data-${string}`, string | number>;`, destructured and spread: `<li {...dataAttrs} className={classes}>`.

`src/components/ui/Tabs.tsx`: add `useEffect` to the react import and, after `const tabRefs = ...`:

```tsx
  // The selected tab scrolls into view when it changes (a phone scrolls the
  // row sideways), as the detail pages' tabs did.
  useEffect(() => {
    rowRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value, rowRef]);
```

`src/components/ui/FilterChip.tsx`, `FilterChip`:

```tsx
export function FilterChip({
  label,
  pressed,
  onToggle,
  count,
  describedBy,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
  /** A figure after the label ("Story 12"); null while unknown. */
  count?: number | null;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-describedby={describedBy}
      onClick={onToggle}
      className={`${CHIP} ${pressed ? 'border-accent bg-accent-dim font-semibold text-ink' : 'border-line bg-surface text-ink-muted hover:bg-subtle hover:text-ink'}`}
    >
      <span className="max-w-[12rem] truncate">{label}</span>
      {count == null ? null : (
        <>
          {' '}
          <span className={`text-[11px] tabular-nums ${pressed ? 'text-ink' : 'text-ink-muted'}`}>{count}</span>
        </>
      )}
    </button>
  );
}
```

`src/components/ui/Badge.tsx`, `Badge`:

```tsx
export function Badge({ tone = 'neutral', dot = false, truncate = false, children }: { tone?: BadgeTone; dot?: boolean; truncate?: boolean; children: ReactNode }) {
  const body = truncate ? <span className="min-w-0 truncate">{children}</span> : children;
  const cap = truncate ? ' max-w-[10rem]' : '';
  if (dot) {
    return (
      <span className={`${BASE}${cap} text-ink-muted`}>
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
        {body}
      </span>
    );
  }
  return <span className={`${BASE}${cap} ${TINT[tone]}`}>{body}</span>;
}
```

`src/components/ui/Card.tsx`, `CardHeader`: add `id?: string` to the props type and `<Heading id={id} className=...>`.

Create `src/components/ui/Avatar.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';

/** A person's or record's initials (UI foundations spec §3: the body font,
 *  never DM Mono): 32px in rows, 44px beside a page's name. Decorative; the
 *  name beside it carries the meaning. */
export function Initials({ text, size = 'md' }: { text: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-subtle font-semibold text-ink ${size === 'lg' ? 'h-11 w-11 text-[13px]' : 'h-8 w-8 text-[11px]'}`}
    >
      {text}
    </span>
  );
}

/** A row's leading icon (spec §7: icon chips are neutral, never tinted by
 *  type or department). */
export function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-muted">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}
```

Create `src/components/ui/format.ts`:

```ts
/** The mark in a figure's place when there is no value (ARR not set, no
 *  pulse). Written as an escape so no added line carries the character. */
export const NO_VALUE = '\u2014';
```

`src/components/ui/index.ts`: add `export * from './Avatar';` and `export * from './format';`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/ui src/pages/dev`
Expected: PASS (the existing Toolbar button-order test still passes: the DOM order of buttons is unchanged).

Run: `npm run lint` (expected: clean).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Toolbar.tsx src/components/ui/Toolbar.test.tsx src/components/ui/Tile.tsx src/components/ui/Tile.test.tsx \
  src/components/ui/tileRow.ts src/components/ui/List.tsx src/components/ui/List.test.tsx src/components/ui/Tabs.tsx \
  src/components/ui/Tabs.test.tsx src/components/ui/FilterChip.tsx src/components/ui/FilterChip.test.tsx \
  src/components/ui/Badge.tsx src/components/ui/Badge.test.tsx src/components/ui/Card.tsx src/components/ui/Card.test.tsx \
  src/components/ui/Avatar.tsx src/components/ui/Avatar.test.tsx src/components/ui/format.ts src/components/ui/index.ts
git commit -m "feat(ui): close the primitive gaps the Records surface needs

Toolbar's phone rows with a lead, tiles that open or filter with an
action, container-sized tile rows, row data attributes, column labels
from any breakpoint, tab scroll-into-view, chip counts, truncating
badges, header ids, initials and icon chips.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: `PageHeader` draws the Records titles in the Navbar bar

**Precondition:** the branch contains #128 (`test -f src/components/layout/phoneHeader.ts`). If it does not, do Tasks 5, 6 and 8 to 13 first and come back after Task 14 Step 6's rebase. Tasks 3, 4 and 7 edit #128's files.

**Files:**
- Modify: `src/layouts/navActionsSlot.ts`, `src/layouts/DashboardLayout.tsx`, `src/components/layout/Navbar.tsx`, `src/components/ui/PageHeader.tsx`
- Modify: `src/pages/organizations/OrganizationsFrame.tsx`, `src/pages/contacts/ContactsFrame.tsx`
- Modify: `src/pages/organizations/{List,Board,Details}.tsx`, `src/pages/accounts/{List,Board,Details}.tsx`, `src/pages/contacts/ContactsPage.tsx`
- Create: `src/components/organizations/portfolio/ViewTabs.tsx`, `src/components/organizations/portfolio/ViewTabs.test.tsx`, `src/components/layout/pageHeaderSlot.test.tsx`
- Test (update): `src/components/ui/PageHeader.test.tsx`, `src/components/layout/Navbar.test.tsx`, `src/test/SlotHost.tsx`, `src/pages/organizations/testList.tsx`, `src/pages/organizations/OrganizationsFrame.test.tsx`, `src/pages/organizations/{List,Board,Details}.test.tsx`, `src/pages/accounts/{List,Board,Details}.test.tsx`, `src/pages/contacts/ContactsPage.test.tsx`

**Interfaces:**
- Consumes: `Tabs` (Task 2 scroll-into-view), `QUIET`, `TYPE`, `ActionCluster`.
- Produces:
  - `NavActionsSlot = { slot; setSlot; titleSlot?: HTMLElement | null; setTitleSlot?: (element: HTMLElement | null) => void }` (the two new fields optional, so every existing provider still type-checks).
  - `PageHeader({ title?, back?, tabs?, actions? })`: portals heading, tabs and actions into `titleSlot` when the context has one, else draws its own bar as today. With `back`, a `nav` named "Breadcrumb" holds the link, and an `h1` (sr-only) renders only when `title` is given.
  - `ScrollSentinel()`: a 1px marker a scroll column puts first; while it is scrolled out of view the element `[data-page-header]` gets `data-scrolled` (its hairline).
  - `ViewTabs({ label, base, value })`: List | Board link tabs carrying `location.search`.
  - The Navbar draws `<div data-nav-title-slot>` (with `PHONE_UNWRAP`) on `/organizations/list|board`, `/organizations/:id`, `/accounts/list|board`, `/accounts/:id`, `/contacts(/:id)` instead of its own title; its framed header carries `data-page-header`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/ui/PageHeader.test.tsx` (add `within` to the testing-library import, and `import { NavActionsSlotContext } from '../../layouts/navActionsSlot';`, `import { ScrollSentinel } from './PageHeader';` merged into the existing import):

```tsx
describe('PageHeader in the Navbar bar (Records PR)', () => {
  it('draws into the title slot when the layout has one, and no bar of its own', () => {
    const slot = document.createElement('div');
    document.body.append(slot);
    render(
      <MemoryRouter>
        <NavActionsSlotContext.Provider value={{ slot: null, setSlot: () => {}, titleSlot: slot, setTitleSlot: () => {} }}>
          <PageHeader title="Organizations" tabs={<nav aria-label="Organizations views">tabs</nav>} />
        </NavActionsSlotContext.Provider>
      </MemoryRouter>,
    );
    const heading = screen.getByRole('heading', { level: 1, name: 'Organizations' });
    expect(slot).toContainElement(heading);
    expect(heading).toHaveClass('min-w-0', 'truncate', 'text-[15px]');
    expect(screen.getByRole('navigation', { name: 'Organizations views' }).parentElement).toHaveClass('max-sm:order-last', 'max-sm:basis-full', 'max-sm:h-11');
    expect(document.querySelector('[data-page-header]')).toBeNull();
    slot.remove();
  });

  it('leads back from a record page inside a Breadcrumb nav, with no h1 when the page names itself', () => {
    render(
      <MemoryRouter>
        <PageHeader back={{ to: '/organizations/list', label: 'Organizations' }} />
      </MemoryRouter>,
    );
    const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Organizations' });
    expect(back).toHaveAttribute('href', '/organizations/list');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});

describe('ScrollSentinel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('marks the page header scrolled while the sentinel is out of view', () => {
    let callback: Callback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Callback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    render(
      <>
        <header data-page-header="" />
        <ScrollSentinel />
      </>,
    );
    const bar = document.querySelector('[data-page-header]')!;
    act(() => callback([{ isIntersecting: false }]));
    expect(bar).toHaveAttribute('data-scrolled');
    act(() => callback([{ isIntersecting: true }]));
    expect(bar).not.toHaveAttribute('data-scrolled');
    expect(document.querySelector('[data-part="scroll-sentinel"]')).toHaveClass('h-px', '-mb-px', 'shrink-0');
  });
});
```

Create `src/components/organizations/portfolio/ViewTabs.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ViewTabs } from './ViewTabs';

describe('ViewTabs', () => {
  it('links List and Board carrying the query, the current view marked', () => {
    render(
      <MemoryRouter initialEntries={['/accounts/board?health=poor&sort=-arr']}>
        <ViewTabs label="Accounts views" base="/accounts" value="board" />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Accounts views' });
    expect(within(nav).getByRole('link', { name: 'List' })).toHaveAttribute('href', '/accounts/list?health=poor&sort=-arr');
    const board = within(nav).getByRole('link', { name: 'Board' });
    expect(board).toHaveAttribute('href', '/accounts/board?health=poor&sort=-arr');
    expect(board).toHaveAttribute('aria-current', 'page');
    expect(board).toHaveClass('shrink-0', 'whitespace-nowrap');
  });
});
```

Create `src/components/layout/pageHeaderSlot.test.tsx` (the Navbar and a page together, as DashboardLayout wires them):

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { useMemo, useState, type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { resetViewport, setViewport } from '../../test/viewport';
import { PageHeader } from '../ui/PageHeader';
import { ViewTabs } from '../organizations/portfolio/ViewTabs';
import { Navbar } from './Navbar';

function Shell({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ slot, setSlot, titleSlot, setTitleSlot }), [slot, titleSlot]);
  return (
    <NavActionsSlotContext.Provider value={value}>
      <Navbar />
      <main>{children}</main>
    </NavActionsSlotContext.Provider>
  );
}

function renderAt(url: string) {
  const store = configureStore({ reducer: { auth: authReducer, notifications: notificationsReducer } });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Shell>
          <Routes>
            <Route path="/organizations/list" element={<PageHeader title="Organizations" tabs={<ViewTabs label="Organizations views" base="/organizations" value="list" />} />} />
            <Route path="/organizations/:id" element={<PageHeader back={{ to: '/organizations/list', label: 'Organizations' }} />} />
          </Routes>
        </Shell>
      </MemoryRouter>
    </Provider>,
  );
}

describe('PageHeader in the Navbar bar (UI foundations spec §6.1, Records)', () => {
  afterEach(() => resetViewport());

  it("puts the page's title and List | Board in the bar; on a phone the tabs take the bar's own second row", async () => {
    setViewport(390);
    renderAt('/organizations/list?health=poor');
    const header = document.querySelector('header')!;
    expect(header).toHaveAttribute('data-page-header');
    expect(header).toHaveClass('border-b', 'border-transparent', 'data-[scrolled]:border-line-subtle');
    expect(await within(header).findByRole('heading', { level: 1, name: 'Organizations' })).toHaveClass('truncate');
    const nav = within(header).getByRole('navigation', { name: 'Organizations views' });
    const row = nav.parentElement!;
    expect(row).toHaveClass('max-sm:order-last', 'max-sm:basis-full');
    // Every wrapper between the header and the tab row dissolves on a phone (#128's fix 1).
    expect(row.parentElement!.closest(':not(.max-sm\\:contents)')).toBe(header);
    expect(within(nav).getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/organizations/board?health=poor');
    expect(within(header).getByTestId('nav-tools')).toHaveClass('ml-auto', 'shrink-0');
    expect(screen.getByRole('main').querySelector('[data-page-header]')).toBeNull();
  });

  it('leads back to the list from a record page, in the bar, with no h1 there', async () => {
    renderAt('/organizations/19');
    const header = document.querySelector('header')!;
    const back = await within(header).findByRole('link', { name: 'Organizations' });
    expect(back).toHaveAttribute('href', '/organizations/list');
    expect(back.closest('nav')).toHaveAccessibleName('Breadcrumb');
    expect(within(header).queryByRole('heading', { level: 1 })).toBeNull();
  });
});
```

(If `authReducer`/`notificationsReducer` are not default exports, import them the way `src/pages/organizations/testList.tsx` does.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/ui/PageHeader.test.tsx src/components/organizations/portfolio/ViewTabs.test.tsx src/components/layout/pageHeaderSlot.test.tsx`
Expected: FAIL (no `titleSlot`, no `ScrollSentinel`, no `ViewTabs`, Navbar still draws its own title).

- [ ] **Step 3: Implement the slot and `PageHeader`**

`src/layouts/navActionsSlot.ts`:

```ts
import { createContext } from 'react';

/** Places in the Navbar that a page portals into. `slot`: the right-hand
 *  actions (the Ask pill, a scope switch). `titleSlot`: the left-hand title,
 *  where a page's PageHeader draws its h1 or Back link and its tabs (UI
 *  foundations spec §6.1); the Navbar renders it only on routes whose pages
 *  title themselves. DashboardLayout owns both elements; each is null
 *  anywhere else. */
export interface NavActionsSlot {
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
  titleSlot?: HTMLElement | null;
  setTitleSlot?: (element: HTMLElement | null) => void;
}

export const NavActionsSlotContext = createContext<NavActionsSlot>({ slot: null, setSlot: () => {}, titleSlot: null, setTitleSlot: () => {} });
```

`src/layouts/DashboardLayout.tsx` (lines 77-79 today):

```tsx
  // The Navbar's actions slot (the Ask pill, a scope switch) and its title
  // slot (a page's PageHeader), which pages below portal into.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);
  const slotValue = useMemo(() => ({ slot, setSlot, titleSlot, setTitleSlot }), [slot, titleSlot]);
```

`src/components/ui/PageHeader.tsx`: imports become

```tsx
import { useContext, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { ActionCluster } from './ActionCluster';
import type { UiAction } from './OverflowMenu';
import { QUIET } from './styles';
import { TYPE } from './type';
```

and `PageHeader`, the hairline hook, `PageBody` and `ScrollSentinel`:

```tsx
/** Below sm the bar wraps and its tabs take a full-width second row (the
 *  Navbar's wrappers dissolve there: UI broken-things fix 1). */
const TAB_ROW = 'h-full min-w-0 max-sm:order-last max-sm:basis-full max-sm:h-11';

/** A page's top bar (UI foundations spec §6.1): the h1 title, or a Back link
 *  (with an sr-only h1 only when `title` is given: a record page names
 *  itself in its content), the page's tabs, and on the right at most two
 *  actions plus the ⋯ menu, the primary last. Inside DashboardLayout it
 *  draws into the Navbar's title slot on the routes that have one; anywhere
 *  else it draws its own bar, transparent on the canvas, whose hairline
 *  shows once the content has scrolled. */
export function PageHeader({
  title,
  back,
  tabs,
  actions,
}: {
  title?: string;
  back?: { to: string; label: string };
  tabs?: ReactNode;
  actions?: { primary?: ReactNode; secondary?: UiAction[] };
}) {
  const { titleSlot } = useContext(NavActionsSlotContext);
  const heading = back ? (
    <>
      <nav aria-label="Breadcrumb" className="flex h-full shrink-0 items-center">
        <Link to={back.to} className={`-ml-3 ${QUIET}`}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
      </nav>
      {title ? <h1 className="sr-only">{title}</h1> : null}
    </>
  ) : title ? (
    <h1 className={`min-w-0 truncate ${TYPE.title}`}>{title}</h1>
  ) : null;
  const cluster = actions ? <ActionCluster primary={actions.primary} secondary={actions.secondary} /> : null;
  if (titleSlot) {
    return createPortal(
      <>
        {heading}
        {tabs ? <div className={TAB_ROW}>{tabs}</div> : null}
        {cluster}
      </>,
      titleSlot,
    );
  }
  return (
    <div data-page-header="" className="relative z-20 flex h-16 shrink-0 items-center gap-3 px-4 border-b border-transparent data-[scrolled]:border-line-subtle">
      <div className="flex h-full min-w-0 flex-1 items-center gap-4">
        {heading}
        {tabs ? <div className="h-full min-w-0 flex-1">{tabs}</div> : null}
      </div>
      {cluster}
    </div>
  );
}

/** While `sentinel` is out of view, the page header shows its hairline. */
function useHeaderHairline(sentinel: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = sentinel.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      const header = document.querySelector('[data-page-header]');
      if (!header) return;
      if (entry.isIntersecting) header.removeAttribute('data-scrolled');
      else header.setAttribute('data-scrolled', '');
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [sentinel]);
}

const WIDTH = { full: '', reading: 'max-w-5xl', form: 'max-w-3xl' } as const;

/** (PageBody: keep today's doc comment.) */
export function PageBody({ width = 'full', children }: { width?: keyof typeof WIDTH; children: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  useHeaderHairline(sentinel);
  return (
    <div className={`flex w-full flex-col gap-4 px-4 pb-8 ${WIDTH[width]}`.trim()}>
      <div ref={sentinel} aria-hidden="true" data-part="scroll-sentinel" className="-mb-4 h-px" />
      {children}
    </div>
  );
}

/** A scroll column's first child in a frame that is not a PageBody (the
 *  Organizations and Contacts frames): the same hairline trigger. */
export function ScrollSentinel() {
  const sentinel = useRef<HTMLDivElement>(null);
  useHeaderHairline(sentinel);
  return <div ref={sentinel} aria-hidden="true" data-part="scroll-sentinel" className="-mb-px h-px shrink-0" />;
}
```

The existing PageHeader test "shows Back instead of the title, keeping the h1 for screen readers" still passes (it passes `title="Uber"`).

- [ ] **Step 4: Implement the Navbar side**

In `src/components/layout/Navbar.tsx` (as #128 left it):
1. `const { setSlot, setTitleSlot } = useContext(NavActionsSlotContext);`
2. After the `isContacts` constant add:

```tsx
  // Records (UI foundations spec §6.1): each page draws its own title, Back
  // link and tabs through PageHeader into this bar's title slot.
  const titledByPage = isOrgView || isOrgDetail || isAccountsView || isAccountDetail || isContacts;
```

3. In the left area, replace the opening `{isCanvasPage ? (` with:

```tsx
        {titledByPage ? (
          <div ref={setTitleSlot} data-nav-title-slot="" className={`flex h-full min-w-0 items-center gap-4 ${PHONE_UNWRAP}`} />
        ) : isCanvasPage ? (
```

4. Delete these branches whole (each from its `) : isX ? (` to the line before the next `) : isY ? (`): `isAccountDetail`, `isContacts`, `isOrgDetail`, `isOrgView`, `isOrganizations` (the legacy text-accent tabs), `isAccountsView`. Delete `const isOrganizations = ...` and the now-unused `ChevronDown` import. `NavLink` stays (Pipelines, Dashboard).
5. The framed header: add `data-page-header={isFramed ? '' : undefined}` and, in the framed class string, `border-b border-transparent data-[scrolled]:border-line-subtle` right after `px-4` (keep every `max-sm:` class #128 added).

`src/pages/organizations/OrganizationsFrame.tsx`: import `ScrollSentinel` from `'../../components/ui'`; outer div `bleed ? 'px-0 sm:px-4' : 'px-4'` (was `sm:px-6`: spec §6.1 "one left edge", the title and the content both at 16px); first child of the scroll column: `<ScrollSentinel />` (before `{children}`). Update the doc comment's "From sm up the gutter is 24px" to "From sm up the gutter is 16px, the bar's own (UI foundations spec §6.1)".

`src/pages/contacts/ContactsFrame.tsx`: outer div `px-0 sm:px-4` (was `sm:px-6`), `<ScrollSentinel />` first in the column, doc comment likewise.

Create `src/components/organizations/portfolio/ViewTabs.tsx`:

```tsx
import { useLocation } from 'react-router-dom';
import { Tabs } from '../../ui';

/** List | Board under a portfolio's title (Organizations, Accounts): links
 *  that carry the query, so filters, sort and group survive the switch. */
export function ViewTabs({ label, base, value }: { label: string; base: string; value: 'list' | 'board' }) {
  const { search } = useLocation();
  return (
    <Tabs
      label={label}
      value={value}
      items={[
        { key: 'list', label: 'List', to: `${base}/list${search}` },
        { key: 'board', label: 'Board', to: `${base}/board${search}` },
      ]}
    />
  );
}
```

- [ ] **Step 5: The Records pages render their header**

| File | Change |
|---|---|
| `pages/organizations/List.tsx` | first child inside `<OrganizationsFrame>`: `<PageHeader title="Organizations" tabs={<ViewTabs label="Organizations views" base="/organizations" value="list" />} />` |
| `pages/organizations/Board.tsx` | same, `value="board"` |
| `pages/accounts/List.tsx`, `pages/accounts/Board.tsx` | `<PageHeader title="Accounts" tabs={<ViewTabs label="Accounts views" base="/accounts" value="list" />} />` (`"board"` on the Board) |
| `pages/organizations/Details.tsx` | `const header = <PageHeader back={{ to: '/organizations/list', label: 'Organizations' }} />;` before the early returns; render `{header}` as the first child of every return: `<>{header}<NotFound /></>`, `<>{header}<DetailLoadFailed ... /></>`, and first inside `<OrganizationsFrame bleed>` |
| `pages/accounts/Details.tsx` | the same with `{ to: '/accounts/list', label: 'Accounts' }` |
| `pages/contacts/ContactsPage.tsx` | before `let body`: `const single = !twoPanes && (selectedId !== null \|\| badId);` and render first inside `<ContactsFrame>`: `<PageHeader title="Contacts" back={single ? { to: `/contacts${suffix}`, label: 'Contacts' } : undefined} />`; delete the in-page `<Link to={listPath} className={BACK}>…Contacts</Link>` (lines 180-183) and the `BACK` constant if now unused |

Imports: `PageHeader` from `'../../components/ui'`, `ViewTabs` from `'../../components/organizations/portfolio/ViewTabs'`.

- [ ] **Step 6: Update the test hosts and the Navbar tests**

- `src/test/SlotHost.tsx` and the host in `src/pages/organizations/testList.tsx` (lines 74-81): add `const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null);` and pass `{ slot, setSlot, titleSlot, setTitleSlot }` (deps `[slot, titleSlot]`). With the real Navbar (`nav`) the page's tabs then land in the bar and the List/Board switching tests keep working; without it they render in place on the page.
- `src/components/layout/Navbar.test.tsx`: replace the describes "Navbar on an organization page", "Navbar on an account page", "Navbar on Contacts", "Navbar on the Organizations list" and "Navbar on the Accounts list and board" with one describe:

```tsx
describe('Navbar on the Records routes (the page titles itself through PageHeader)', () => {
  it.each(['/organizations/list', '/organizations/board', '/organizations/10', '/accounts/list', '/accounts/board', '/accounts/17', '/accounts/not-a-number', '/contacts', '/contacts/11'])(
    'on %s draws the framed bar with an empty title slot, the actions slot and no avatar',
    (url) => {
      renderNavbar(url, null, null, [], vi.fn());
      const header = document.querySelector('header')!;
      expect(header).toHaveClass('h-16', 'max-sm:flex-wrap');
      expect(header).toHaveAttribute('data-page-header');
      const titleSlot = header.querySelector('[data-nav-title-slot]')!;
      expect(titleSlot).toBeEmptyDOMElement();
      expect(titleSlot).toHaveClass('max-sm:contents');
      expect(header.querySelector('[data-nav-actions-slot]')).not.toBeNull();
      expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
      expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
    },
  );
});
```

  Keep whatever "no avatar" assertion the removed describes used (copy it into the `it.each`). In "Navbar on a phone (UI broken-things fix 1)" delete the `['/organizations/list', 'Organizations views']` and `['/accounts/board', 'Accounts views']` rows of the tabs `it.each` and the `['/contacts', 'Contacts']` row of the title `it.each` (`pageHeaderSlot.test.tsx` covers Records now). The query-carrying assertions move to `ViewTabs.test.tsx`.
- `src/pages/organizations/OrganizationsFrame.test.tsx` line 20: `toHaveClass('px-0', 'sm:px-4')` and `not.toHaveClass('sm:px-6')`.
- Page tests: run them; where a test found "Organizations"/"Accounts"/"Contacts" as the only `h1`, or the in-page Contacts back link, expect the PageHeader's (an in-place bar when rendered without the Navbar). Keep each test's intent.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/components/ui src/components/layout src/layouts src/pages/organizations src/pages/accounts src/pages/contacts src/components/organizations/portfolio/ViewTabs.test.tsx`
Expected: PASS.

Run: `npm run lint` and `npm run build` (expected: clean, success).

- [ ] **Step 8: Commit**

```bash
git add src/layouts/navActionsSlot.ts src/layouts/DashboardLayout.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx \
  src/components/layout/pageHeaderSlot.test.tsx src/components/ui/PageHeader.tsx src/components/ui/PageHeader.test.tsx \
  src/components/organizations/portfolio/ViewTabs.tsx src/components/organizations/portfolio/ViewTabs.test.tsx \
  src/pages/organizations/OrganizationsFrame.tsx src/pages/organizations/OrganizationsFrame.test.tsx src/pages/contacts/ContactsFrame.tsx \
  src/pages/organizations/List.tsx src/pages/organizations/Board.tsx src/pages/organizations/Details.tsx \
  src/pages/accounts/List.tsx src/pages/accounts/Board.tsx src/pages/accounts/Details.tsx src/pages/contacts/ContactsPage.tsx \
  src/test/SlotHost.tsx src/pages/organizations/testList.tsx
git add <each page test file Step 6 changed, by path>
git commit -m "feat(records): the Records pages title themselves in the Navbar bar

PageHeader portals its title, Back link and tabs into a new title slot;
the Navbar drops its Organizations, Accounts and Contacts branches and
keeps #128's phone rows. The frames use the bar's 16px edge and show the
bar's hairline once content scrolls under it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Portfolio rows on the row anatomy (Organizations and Accounts lists)

**Precondition:** #128 in the branch (it edits `rowParts.tsx`).

**Files:**
- Create: `src/components/organizations/portfolio/rowColumns.ts`
- Modify: `src/components/organizations/portfolio/{AccountRow,rowParts,PortfolioSections}.tsx`, `src/pages/organizations/List.tsx`, `src/pages/accounts/List.tsx`, `src/components/segments/MembersTab.tsx`
- Test (update): `src/components/organizations/portfolio/{AccountRow,rowParts,PortfolioSections,containerFit,kindRows,fieldCoverage,sharedParts}.test.tsx`, `src/components/accounts/portfolio/fieldCoverage.test.tsx`, `src/pages/organizations/List.test.tsx`, `src/pages/accounts/List.test.tsx`, `src/components/segments/MembersTab*.test.tsx`

**Interfaces:**
- Consumes: `ListCard`, `ListHeaderRow({ show })`, `LoadingState`, `EmptyState`, `ErrorState`, `Badge`, `BadgeTone`, `ICON_BUTTON`, `NUM`, `TYPE`, `BUTTON`, `PRIMARY` (Task 2).
- Produces:
  - `rowColumns(pinned: boolean): string`, `rowLabels(pinned: boolean): string[]` (`rowColumns.ts`).
  - `PagedSections` gains `framed?: boolean` and `listHeader?: ReactNode`; `PortfolioSections` gains `pinned?: boolean` and always renders framed; `EmptyBookState` (same props as `EmptyBook`) returns a ui `EmptyState` for use inside a card.
  - `SignalTag` renders a `Badge` (`renewal_overdue`/`risk` danger, `tickets` neutral).

Why: a list is one card whose rows are divided (spec §4.2, decision 1); figures line up in columns with labels (audit S2, S3); the "pulses disagree" third line goes into the meta line so every row is one height (spec §4.2); routine ticket counts are neutral (spec §7).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/organizations/portfolio/rowParts.test.tsx`:

```tsx
describe('row parts on the primitives (Records PR)', () => {
  it('sets the score in the body font with tabular figures, on a ring track visible in both themes', () => {
    const { container } = render(<HealthRing score={6.2} category="average" />);
    expect(screen.getByText('6.2')).toHaveClass('tabular-nums', 'text-[11px]', 'font-semibold');
    expect(screen.getByText('6.2').className).not.toMatch(/font-mono-brand/);
    expect(container.querySelector('circle')).toHaveAttribute('stroke', 'var(--color-line-strong)');
  });

  it('keeps pulses on two lines, "pulses disagree" in the second', () => {
    render(<PulsePair pulse={{ ai: 3, csm: 8, history: [1, 2], ai_label: 'Mixed', disagree: true }} className="flex" />);
    const second = screen.getByText('pulses disagree').parentElement!;
    expect(second).toContainElement(screen.getByText('Mixed'));
    expect(screen.getByText('pulses disagree')).toHaveClass('text-warning-ink');
  });

  it.each([
    ['renewal_overdue', 'Renewal overdue', 'text-danger-ink'],
    ['risk', 'Risk 55', 'text-danger-ink'],
    ['tickets', '3 open tickets', 'text-ink-muted'],
  ] as const)('tones the %s signal as a badge', (kind, label, ink) => {
    render(<SignalTag signal={{ kind, label }} />);
    expect(screen.getByText(label)).toHaveClass('rounded-full', 'text-[11px]', ink);
  });
});
```

(Adjust the `pulse` and `signal` literals to the exact `PortfolioRowBase` field types if they need more fields.)

Append to `src/components/organizations/portfolio/AccountRow.test.tsx` (reuse its row fixture and render helper):

```tsx
  it('is a flat row of the one list card: no card of its own, a grid once its column is 60rem wide', () => {
    renderRow();
    const li = document.querySelector('[data-row-id]')!;
    expect(li.className).not.toMatch(/rounded-xl|bg-surface|shadow/);
    const header = li.querySelector('[data-part="header"]')!;
    expect(header).toHaveClass('px-4', 'py-3', 'hover:bg-subtle', '@min-[60rem]:grid', 'flex-wrap', '@min-[60rem]:flex-nowrap');
    expect(header.className).toContain('@min-[60rem]:grid-cols-[auto_minmax(12rem,1fr)_4rem_7rem_5rem_9rem_9rem_auto]');
  });
```

Append to `src/components/organizations/portfolio/PortfolioSections.test.tsx` (reuse its fixtures):

```tsx
  it('draws the flat list as one card with column labels, and its states inside a card', async () => {
    renderSections();
    const list = await screen.findByRole('list', { name: /list$/ });
    expect(list).toHaveClass('divide-y', 'divide-line-subtle');
    expect(list.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'overflow-hidden');
    expect(list.parentElement!.querySelector('[aria-hidden="true"].hidden')).toHaveClass('@min-[60rem]:grid');
  });
```

(`renderSections` stands for the file's existing render helper; use its real name.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/portfolio/rowParts.test.tsx src/components/organizations/portfolio/AccountRow.test.tsx src/components/organizations/portfolio/PortfolioSections.test.tsx`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

Create `src/components/organizations/portfolio/rowColumns.ts`:

```ts
// The portfolio row's grid (UI foundations spec §4.2: figures line up down
// the list) once its @container is 60rem wide: the checkbox and ring, the
// name, trend, renewal, pinned fields (only when any are pinned), ARR,
// pulse, signal, then the row's own buttons. Below 60rem the row wraps as
// it always has. Literal strings, so Tailwind sees every class.

const COLUMNS = '@min-[60rem]:grid-cols-[auto_minmax(12rem,1fr)_4rem_7rem_5rem_9rem_9rem_auto]';
const COLUMNS_PINNED = '@min-[60rem]:grid-cols-[auto_minmax(12rem,1fr)_4rem_7rem_minmax(0,10rem)_5rem_9rem_9rem_auto]';

export function rowColumns(pinned: boolean): string {
  return pinned ? COLUMNS_PINNED : COLUMNS;
}

/** The column labels above the rows, on the same template. */
export function rowLabels(pinned: boolean): string[] {
  return ['', 'Name', 'Trend', 'Renewal', ...(pinned ? ['Pinned'] : []), 'ARR', 'Pulse', 'Signal', ''];
}
```

`AccountRow.tsx` (line numbers as on this branch):

| Lines | Before | After |
|---|---|---|
| 1-11 imports | `FOCUS` from `./styles` | add `import { Badge, FOCUS, ICON_BUTTON, NUM, TYPE } from '../../ui';` and `import { rowColumns } from './rowColumns';`; drop `./styles` |
| 46-49 doc | "One account as a rounded item on the page" | "One account as a row of the one list card (UI foundations spec §4.2). From a 60rem column it is a grid row on `rowColumns`; below, the same elements wrap into two lines (an `order-*` break element does the wrapping, so nothing renders twice)." |
| 109-112 `li` | `group rounded-xl bg-surface transition-shadow ... hover:shadow-sm ${selected ? 'ring-1 ring-accent' : ''}` | `<li data-row-id={row.id} className="group">` |
| 120 header `div` | `flex flex-wrap @min-[60rem]:flex-nowrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 cursor-pointer select-none sm:select-auto` | `HEADER` + `` ` ${rowColumns(isSm && pins.length > 0)}` `` + the selected tint (code below the table) |
| 122-141 | the checkbox `label`, then `<HealthRing />` | both inside one lead cell `<span className="flex shrink-0 items-center gap-2">…</span>`; the checkbox `input` drops `disabled:opacity-50` (keeps `disabled:cursor-not-allowed`) |
| 150 name `Link` | `... truncate rounded-sm text-[13px] font-semibold text-ink hover:underline ${FOCUS}` | `` `flex min-h-11 min-w-0 items-center sm:block sm:min-h-0 truncate rounded-sm ${TYPE.body} font-semibold hover:underline ${FOCUS}` `` |
| 154-156 status | `<span className="shrink-0 rounded-full bg-subtle px-1.5 ...">{status}</span>` | `<Badge>{status}</Badge>` |
| 158 subtitle | `truncate text-[11px] text-ink-muted` | `` `truncate ${TYPE.meta}` `` |
| 166-179 pins | rendered whenever `isSm`, each a `rounded-full bg-subtle` pill with a mono value | rendered only when `isSm && pins.length > 0`; wrapper `flex min-w-0 flex-wrap gap-x-2`; each `<span key={id} data-pin={id} className={TYPE.meta}>{field.short} <span className={`${NUM} text-ink`}>{field.value(row as unknown as PortfolioRow)}</span></span>` (pinned fields are data, not badges) |
| 181 ARR | `... font-mono-brand tabular-nums text-[13px] text-ink` | `` `order-2 sm:order-none sm:w-20 sm:text-right ${TYPE.body} ${NUM}` `` |
| 191-212 | `menu` span, then the open button `shrink-0 w-11 h-11 sm:w-8 sm:h-8 inline-flex ...` | both in `<span className="flex shrink-0 items-center gap-1">`; the open button `className={ICON_BUTTON}` (keeps its `aria-*`) |
| 71 | `const arr = row.arr == null ? '—' : ...` | unchanged (holds the no-value mark) |

The header `div`'s class, written in `AccountRow.tsx` above the component:

```tsx
/** The row's own line: wraps below a 60rem column, a grid row from there
 *  (rowColumns), hover and press tints on the whole line. */
const HEADER =
  'flex flex-wrap @min-[60rem]:flex-nowrap @min-[60rem]:grid items-center gap-x-3 gap-y-1.5 px-4 py-3 cursor-pointer select-none sm:select-auto hover:bg-subtle active:bg-line-subtle';
```

and in JSX: ``className={`${HEADER} ${rowColumns(isSm && pins.length > 0)} ${selected || open ? 'bg-subtle' : ''}`}``.

`rowParts.tsx`:
- Import `import { Badge, NUM, TYPE, type BadgeTone } from '../../ui';`.
- `HealthRing` line 45: `stroke="var(--color-line-strong)"` (the `--border-default` track was invisible in dark mode); the number span: `` className={`${NUM} text-[11px] font-semibold text-ink`} `` (keep #128's `{shown}`).
- `TrendLine` line 84: `stroke="var(--color-line-strong)"`.
- `RenewalRunway` line 100: `` className={`text-[11px] leading-4 ${renewal.days == null ? '' : NUM} ${overdue ? 'font-semibold text-danger-ink' : 'text-ink-muted'}`} ``.
- `PulsePair`: line 137 `` className={`${TYPE.body} ${NUM}`} ``; line 140 `` className={`flex min-w-0 items-center gap-1.5 ${TYPE.meta}`} ``; line 142 unchanged; delete line 144 and add, inside the line-140 span after line 142: `{pulse.disagree ? <span className="shrink-0 font-semibold text-warning-ink">pulses disagree</span> : null}`.
- `SignalTag`:

```tsx
const SIGNAL_TONE: Record<NonNullable<PortfolioRowBase['signal']>['kind'], BadgeTone> = {
  renewal_overdue: 'danger',
  risk: 'danger',
  // A routine count: neutral (spec §7), however many rows carry one.
  tickets: 'neutral',
};

export function SignalTag({ signal }: { signal: PortfolioRowBase['signal'] }) {
  if (!signal) return null;
  return <Badge tone={SIGNAL_TONE[signal.kind]}>{signal.label}</Badge>;
}
```

`PortfolioSections.tsx`:
- Imports: `import { BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, ListCard, ListHeaderRow, LoadingState, NUM } from '../../ui';` and `import { rowColumns, rowLabels } from './rowColumns';`.
- `Section` header (lines 225-231): the two `font-mono-brand tabular-nums` spans become `className={NUM}`.
- New export after `EmptyBook`:

```tsx
/** EmptyBook drawn inside the list's own card (UI foundations spec §4.4):
 *  neutral, no box of its own. The toolbar holds the page's one primary,
 *  so Add here is a plain button. */
export function EmptyBookState({ filtered, noun, title, detail, onClearFilters, onAdd }: Parameters<typeof EmptyBook>[0]) {
  return filtered ? (
    <UiEmptyState
      title={`No ${noun.many} match these filters`}
      detail="Remove a filter, or clear them all."
      action={
        <button type="button" onClick={onClearFilters} className={BUTTON}>
          Clear filters
        </button>
      }
    />
  ) : (
    <UiEmptyState
      title={title}
      detail={detail}
      action={
        <button type="button" onClick={onAdd} className={BUTTON}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {`Add ${noun.one}`}
        </button>
      }
    />
  );
}
```

- `Section` and `PagedSections` gain `framed?: boolean` and `listHeader?: ReactNode` (passed from `PagedSections` to each `Section`). When `framed`:
  - `PagedSections`: `!data && error` → `<ListCard label={listHeading} state={<UiErrorState message={error} onRetry={book.retry} />} />`; `!data` → `<ListCard label={listHeading} state={<LoadingState label={`Loading ${noun.many}`} count={6} />} />`; `data.count === 0` → `<ListCard label={listHeading} state={empty} />`; the flat list's `<ul className="flex flex-col gap-1.5">` → `<ListCard label={listHeading} header={listHeader}>{rows}</ListCard>` (the `div aria-busy`, the sr-only `h2`, `staleError` and `MoreButton` stay around it).
  - `Section` body (lines 236-249): error → `<ListCard label={group.label} state={<UiErrorState message={page.error} onRetry={page.retry} />} />`; first load → `<ListCard label={group.label} state={<LoadingState label={`Loading ${group.label}`} count={Math.min(3, group.count)} />} />`; rows → `<div aria-busy={page.loading}><ListCard label={group.label} header={listHeader}>{rows}</ListCard></div>`.
  - Not framed: exactly today's markup (Pipelines keeps it until its PR).
- `PortfolioSections` gains `pinned = false` and passes `framed`, `listHeader={<ListHeaderRow columns={rowColumns(pinned)} labels={rowLabels(pinned)} show="@min-[60rem]:grid" />}`, and `empty={<EmptyBookState ... />}` (same props as today's `EmptyBook`).

Pages: `pages/organizations/List.tsx` passes `pinned={pins.length > 0}` to `PortfolioSections`; `pages/accounts/List.tsx` passes nothing (no pins).

`components/segments/MembersTab.tsx`: its `PagedSections` gets `framed`; `emptyMembers` returns `UiEmptyState` (from `'../ui'`) instead of the legacy `EmptyState` (same titles and details). Its flat `ul` path (`MEMBER_LIST`) is unchanged: `LIST` is already one divided card.

- [ ] **Step 4: Run the tests and update the ones that pinned old markup**

Run: `npx vitest run src/components/organizations/portfolio src/components/accounts/portfolio src/pages/organizations/List.test.tsx src/pages/accounts/List.test.tsx src/components/segments src/pages/segments`
Expected after updates: PASS. Expected updates (keep each test's intent): `font-mono-brand` on a figure → `tabular-nums`; a row's `ring-1 ring-accent` when selected → `bg-subtle` on `[data-part="header"]`; signal tones (`bg-warning-dim text-warning` → `bg-subtle text-ink-muted` for tickets; `text-danger` → `text-danger-ink`); "pulses disagree" now in the second pulse line; the empty Add button is `BUTTON`, not the accent; skeletons are `role="status"` with an sr-only label "Loading organizations" (query `getByRole('status', { name: ... })` → `getByRole('status')` + `getByText('Loading organizations')` where needed); `containerFit.test.tsx` keeps passing (`flex-wrap`, `@min-[60rem]:flex-nowrap`).

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/rowColumns.ts src/components/organizations/portfolio/AccountRow.tsx \
  src/components/organizations/portfolio/rowParts.tsx src/components/organizations/portfolio/PortfolioSections.tsx \
  src/pages/organizations/List.tsx src/pages/accounts/List.tsx src/components/segments/MembersTab.tsx \
  src/components/organizations/portfolio/rowParts.test.tsx src/components/organizations/portfolio/AccountRow.test.tsx \
  src/components/organizations/portfolio/PortfolioSections.test.tsx
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): portfolio rows as one divided card with aligned columns

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Summary tiles on `Tile`, Lifecycle as its own card

**Files:**
- Create: `src/components/organizations/portfolio/LifecycleCard.tsx`
- Modify: `src/components/organizations/portfolio/SummaryTiles.tsx`, `src/pages/organizations/{List,Board}.tsx`, `src/pages/accounts/{List,Board}.tsx`
- Test (update): `src/components/organizations/portfolio/{SummaryTiles,containerFit,kindControls}.test.tsx`, the four page tests

**Interfaces:**
- Consumes: `Tile` (`onPress` + `action`, `buttonLabel`), `tileRow(4, 'container')`, `SegmentedControl` (`size="sm"`), `Card`, `CardHeader`, `LoadingState` (`variant="tiles"`), `NUM`, `TYPE` (Task 2).
- Produces: `SummaryTiles` (same props) renders four tiles; `LifecycleCard({ summary, params, onFilter })` renders the lifecycle stages as filter rows in a card.

Why: spec §4.3 (one tile anatomy, at most three breakdown rows, Lifecycle moves out of the tile row), audit "Summary tiles have unequal content density".

| Today (`SummaryTiles.tsx`) | After |
|---|---|
| 74 row `-mx-4 flex snap-x ... @min-[50rem]:grid-cols-5` | `<div className={tileRow(4, 'container')}>` (the page's `@container` stays) |
| 48 `<TilesSkeleton />` | `<LoadingState label="Loading summary" variant="tiles" count={4} />` |
| 49-54 failed box `rounded-xl bg-surface p-3` | `<Card pad="sm"><p className={TYPE.label}>Summary unavailable</p><p className={TYPE.meta}>The tiles return once the list loads.</p></Card>` |
| 75-110 Health `Tile title action={<Switch/>}` + bar + 3 `FilterButton` | `<Tile label="Health" value={show(bandTotal)} meta={`${mode === 'count' ? capitalise(kind.noun.many) : mode.toUpperCase()} by health band`} action={<SegmentedControl size="sm" label="Health measure" value={mode} onChange={setMode} options={[...same three]} />}>`; children: the band bar as `<span aria-hidden="true" className="mb-1 flex h-2 overflow-hidden rounded-full bg-line">…</span>`, then the three `FilterButton`s (kept from `tileParts`, `compact`), each figure `` className={`${NUM} text-ink`} `` |
| 112-125 NPS | `<Tile label="NPS" value={signed(nps.score)}>` with the bar (as above) and the three band `FilterButton`s |
| 127-148 Lifecycle | removed from the row; rendered by the page as `<LifecycleCard … />` directly under the tile row |
| 150-158 Accounts · ARR | `<Tile label="Accounts · ARR" value={summary.accounts} meta={<>{formatCompactMoney(summary.arr, currency)} ARR{summary.unconverted_count > 0 ? <> · <span className={NUM}>{summary.unconverted_count}</span> without an exchange rate, left out of ARR</> : null}</>} />` (`formatCompactMoney` output wrapped in `<span className={NUM}>`) |
| 160-179 Renewing `Tile` + `TileButton` | `<Tile label="Renewing" value={renewing} meta={`within ${span} days, overdue included`} pressed={params.renews_within === span} onPress={() => onFilter({ renews_within: params.renews_within === span ? '' : span })} buttonLabel={`Renewing within ${span} days: ${renewing}`} action={<SegmentedControl size="sm" label="Renewal window" value={span} onChange={setSpan} options={spans.map((days) => ({ value: days, label: `${days}d` }))} />} />` |
| 9 `MONO` import | `NUM` from `'../../ui'`; `Switch`, `TileButton`, `TilesSkeleton`, `Tile` imports from `./tileParts` dropped (only `FilterButton` stays) |

The value `show(bandTotal)` (accounts or money across the three bands, in the chosen measure) is the Health tile's figure because the tile anatomy needs one (decision recorded in the plan's report).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/organizations/portfolio/SummaryTiles.test.tsx` (reuse its summary fixture and render helper; `within` from testing-library):

```tsx
  it('draws four standard tiles in a container-sized row, and no Lifecycle tile', () => {
    renderTiles();
    const groups = screen.getAllByRole('group').filter((group) => group.classList.contains('rounded-xl'));
    expect(screen.queryByRole('group', { name: 'Lifecycle' })).toBeNull();
    const row = screen.getByRole('group', { name: 'Health' }).parentElement!;
    expect(row).toHaveClass('@min-[50rem]:grid-cols-4', 'items-start');
    expect(groups.length).toBeGreaterThanOrEqual(3);
  });

  it('makes Renewing a filter tile whose window switch sits outside its button', async () => {
    const onFilter = vi.fn();
    renderTiles({ onFilter });
    const button = screen.getByRole('button', { name: /^Renewing within \d+ days/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toContainElement(screen.getByRole('group', { name: 'Renewal window' }));
    await userEvent.click(button);
    expect(onFilter).toHaveBeenCalledWith({ renews_within: expect.any(String) });
  });
```

Create `src/components/organizations/portfolio/LifecycleCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LifecycleCard } from './LifecycleCard';

const summary = {
  lifecycle: [
    { value: 'onboarding', label: 'Onboarding', count: 4 },
    { value: 'adoption', label: 'Adoption', count: 9 },
    { value: 'renewal', label: 'Renewal', count: 2 },
    { value: 'expansion', label: 'Expansion', count: 1 },
    { value: 'churn', label: 'Churn', count: 0 },
  ],
};

describe('LifecycleCard (spec §4.3: more than three rows leave the tile row)', () => {
  it('lists every stage with a count as a filter, full labels, in one card', async () => {
    const onFilter = vi.fn();
    render(<LifecycleCard summary={summary as never} params={{ lifecycle: [] } as never} onFilter={onFilter} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Lifecycle' })).toBeInTheDocument();
    const onboarding = screen.getByRole('button', { name: /Onboarding\s*4/ });
    expect(onboarding).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: /Churn/ })).toBeNull();
    await userEvent.click(onboarding);
    expect(onFilter).toHaveBeenCalledWith({ lifecycle: ['onboarding'] });
  });
});
```

(Use the real `PortfolioSummary` and `PortfolioParams` shapes from `features/organizations/portfolioTypes` and the `SummaryTiles.test.tsx` fixture instead of `as never` if the types make that easy.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/portfolio/SummaryTiles.test.tsx src/components/organizations/portfolio/LifecycleCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/components/organizations/portfolio/LifecycleCard.tsx`:

```tsx
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { PortfolioSummary } from '../../../features/organizations/portfolioTypes';
import { Card, CardBody, CardHeader, NUM } from '../../ui';
import { FilterButton } from './tileParts';

const only = <T,>(values: T[], value: T) => values.length === 1 && values[0] === value;

/** The lifecycle stages with their counts, each a filter (UI foundations
 *  spec §4.3: a breakdown of more than three rows leaves the tile row for
 *  its own card). Stages with nobody in them are left out. */
export function LifecycleCard({
  summary,
  params,
  onFilter,
}: {
  summary: Pick<PortfolioSummary, 'lifecycle'>;
  params: Pick<PortfolioParams, 'lifecycle'>;
  onFilter: (patch: Partial<PortfolioParams>) => void;
}) {
  const stages = summary.lifecycle.filter((stage) => stage.count > 0);
  if (stages.length === 0) return null;
  const max = Math.max(1, ...stages.map((stage) => stage.count));
  return (
    <Card pad="none">
      <CardHeader title="Lifecycle" />
      <CardBody>
        <div className="grid gap-x-6 sm:grid-cols-2 @min-[50rem]:grid-cols-4">
          {stages.map((stage) => (
            <FilterButton
              key={stage.value}
              pressed={only(params.lifecycle, stage.value)}
              onClick={() => onFilter({ lifecycle: only(params.lifecycle, stage.value) ? [] : [stage.value] })}
            >
              <span className="min-w-0 truncate text-left">{stage.label}</span>{' '}
              <span aria-hidden="true" className="mx-1 h-1 flex-1 rounded-full bg-line">
                <span className="block h-full rounded-full bg-ink-muted" style={{ width: `${(stage.count / max) * 100}%` }} />
              </span>
              <span className={`${NUM} text-ink`}>{stage.count}</span>
            </FilterButton>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
```

Rewrite `SummaryTiles.tsx` per the table above (the Lifecycle constants `stages`, `stageMax`, `twoColumns` move out with it). In each of the four pages, directly after the `@container` div holding `SummaryTiles`, render inside the same `@container` wrapper:

```tsx
{portfolio.data ? <LifecycleCard summary={portfolio.data.summary} params={params} onFilter={update} /> : null}
```

(the wrapper becomes `<div className="@container flex flex-col gap-3">`, so the card sits `gap-3` under the tiles).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/portfolio src/pages/organizations src/pages/accounts`
Expected after updates: PASS. Updates: `containerFit.test.tsx` "five tiles" → four tiles at `@min-[50rem]:grid-cols-4`; a test that clicked a Lifecycle stage inside the tiles now finds it in the Lifecycle card (same button name); a Renewing test that clicked the `TileButton` by its aria-label keeps working (`buttonLabel`); `Switch` button names ("Count", "MRR", "ARR", "30d", "90d") are unchanged under `SegmentedControl`.

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/LifecycleCard.tsx src/components/organizations/portfolio/LifecycleCard.test.tsx \
  src/components/organizations/portfolio/SummaryTiles.tsx src/components/organizations/portfolio/SummaryTiles.test.tsx \
  src/pages/organizations/List.tsx src/pages/organizations/Board.tsx src/pages/accounts/List.tsx src/pages/accounts/Board.tsx
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): summary tiles on Tile, Lifecycle in its own card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: One `Toolbar` for the Organizations and Accounts list and board

**Files:**
- Create: `src/components/organizations/portfolio/filterCount.ts`
- Modify: `src/components/organizations/portfolio/{PortfolioToolbar,FilterChips,toolbarParts,filterParts,FiltersPanel}.tsx`, `src/pages/organizations/{List,Board}.tsx`, `src/pages/accounts/{List,Board}.tsx`
- Test (update): `src/components/organizations/portfolio/{PortfolioToolbar,FilterChips,FiltersPanel,kindControls,sharedParts}.test.tsx`, the four page tests, and (shared parts) `src/components/pipelines/**/*.test.tsx`, `src/components/segments/**/*.test.tsx`, `src/pages/pipelines/*.test.tsx`

**Interfaces:**
- Consumes: `Toolbar`, `SearchInput`, `Select`, `FilterChipRow`, `RemovableChip`, `Badge`, `BUTTON`, `PRIMARY`, `QUIET`, `ICON_BUTTON`, `OVERLAY`, `TYPE`, `NUM`, `type UiAction` (Tasks 1, 2).
- Produces:
  - `useFilterCount(params, options, count, total, failed?): string` (`filterCount.ts`), the "14 of 120 organizations" line.
  - `PortfolioToolbar` gains a required `count: string` prop (rendered as the Toolbar's live count beside the search).
  - `FilterChips({ params, options, onChange, onClearAll })` (the `count`, `total`, `failed` props are gone); renders nothing without active filters.
  - `GroupSortFields` (shared) on `Select labelPosition="inline"`; `FILTER_SELECT` keeps its export with token-based disabled colours; `FilterGroup`'s legend is `TYPE.label`; `FilterSheet`'s popover uses `OVERLAY`; `FiltersTrigger`'s count is a neutral `Badge`.

Why: spec §5.6 (one toolbar, the count beside the search, two visible secondaries and the primary last; below sm, search on row 1), §5.4 (removable chips), §5.5 (selects), audit S5.

Layout of the toolbar (from `sm`; below `sm` in brackets):
- `search`: `SearchInput` (label "Search by name or Revenact ID", placeholder "Search by name or ID").
- `filters`: from `sm` `GroupSortControls`; `FiltersTrigger`; from `sm` "Pin fields" (List only, keeps its trigger ref for the popover); [below `sm` the `SelectToggle`, a mode switch that keeps `aria-pressed`].
- `actions.secondary`: "Save as segment" (List only) and, from `sm`, "Export" (below `sm` Export stays in the Filters sheet footer, as today). Two secondaries at most, so nothing folds at `sm`.
- `actions.primary`: from `sm` the "Add organization"/"Add account" `PRIMARY` button; below `sm` Add stays in the Filters sheet footer (today's phone behaviour; one primary on screen).
- `count`: `useFilterCount(...)`.
- The active-filter chips sit on their own row under the toolbar (`FilterChips`), only when there are any.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/organizations/portfolio/PortfolioToolbar.test.tsx` (reuse its render helper; pass `count="14 organizations"` in it from now on):

```tsx
  it('is the one toolbar: search and count first, filters, two secondaries, the primary last', () => {
    setViewport(1440);
    renderToolbar({ onSaveAsSegment: vi.fn(), count: '14 organizations' });
    const search = screen.getByRole('searchbox', { name: 'Search by name or Revenact ID' });
    expect(search).toHaveAttribute('placeholder', 'Search by name or ID');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('14 organizations');
    expect(status.parentElement).toContainElement(search);
    const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim());
    expect(names.slice(-3)).toEqual(['Save as segment', 'Export', 'Add organization']);
    expect(screen.getByRole('button', { name: 'Add organization' })).toHaveClass('bg-accent');
    expect(screen.getByLabelText('Group').tagName).toBe('SELECT');
  });

  it('keeps Add and Export in the Filters sheet on a phone, and Select in reach', () => {
    setViewport(390);
    renderToolbar({ onToggleSelectMode: vi.fn(), count: '14 organizations' });
    expect(screen.queryByRole('button', { name: 'Add organization' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'false');
  });
```

(`renderToolbar` stands for the file's helper; its props default the rest. `getAllByRole('button')` also returns "Filters", "Pin fields" and the sort direction button earlier in the order.)

Append to `src/components/organizations/portfolio/FilterChips.test.tsx`:

```tsx
  it('renders each active filter as a removable chip and Clear all, and nothing when no filter is on', async () => {
    const onChange = vi.fn();
    const { rerender } = renderChips({ params: { ...EMPTY_PARAMS, health: ['poor'] }, onChange });
    const group = screen.getByRole('group', { name: 'Active filters' });
    await userEvent.click(within(group).getByRole('button', { name: 'Remove filter: Health: Poor' }));
    expect(onChange).toHaveBeenCalled();
    expect(within(group).getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    rerender(chipsElement({ params: EMPTY_PARAMS }));
    expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull();
  });
```

(`renderChips`/`chipsElement`/`EMPTY_PARAMS` stand for the file's helpers and default params; the chip label is whatever `filterChips()` produces for `health: ['poor']`, already asserted elsewhere in that file.)

Create `src/components/organizations/portfolio/filterCount.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilterCount } from './filterCount';
import { DEFAULT_PARAMS } from '../../../features/organizations/portfolioParams';

describe('useFilterCount', () => {
  it('says how many records the list holds, of how many when filtered', () => {
    expect(renderHook(() => useFilterCount(DEFAULT_PARAMS, null, 14, 120)).result.current).toBe('14 organizations');
    expect(renderHook(() => useFilterCount({ ...DEFAULT_PARAMS, health: ['poor'] }, null, 3, 120)).result.current).toBe('3 of 120 organizations');
    expect(renderHook(() => useFilterCount(DEFAULT_PARAMS, null, null, null, true)).result.current).toBe('Organizations unavailable');
  });
});
```

(Use the real default-params export name from `features/organizations/portfolioParams`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/portfolio/PortfolioToolbar.test.tsx src/components/organizations/portfolio/FilterChips.test.tsx src/components/organizations/portfolio/filterCount.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/components/organizations/portfolio/filterCount.ts`:

```ts
import { countText, filterChips } from '../../../features/organizations/filterChips';
import type { PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { FilterOptions } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';

/** The toolbar's live count (UI foundations spec §5.6): "14 organizations",
 *  "3 of 120 organizations" under a filter, the kind's own words. */
export function useFilterCount(
  params: PortfolioParams,
  options: FilterOptions | null,
  count: number | null,
  total: number | null,
  failed = false,
): string {
  const kind = usePortfolioKind();
  return countText(count, total, filterChips(params, options).length > 0, failed, kind.noun);
}
```

`PortfolioToolbar.tsx`, the component body after the state hooks:

```tsx
  const secondary: UiAction[] = [
    ...(onSaveAsSegment ? [{ key: 'segment', label: 'Save as segment', onSelect: onSaveAsSegment }] : []),
    // Below sm, Export and Add live in the Filters sheet's footer.
    ...(isSm
      ? [
          {
            key: 'export',
            label: exporting ? 'Exporting…' : 'Export',
            onSelect: () => {
              if (!exporting) onExport();
            },
          },
        ]
      : []),
  ];

  return (
    <div className="relative">
      <Toolbar
        search={<SearchInput label={LABEL} placeholder="Search by name or ID" value={text} onChange={setText} inputRef={searchRef} />}
        count={count}
        filters={
          <>
            {isSm ? <GroupSortControls params={params} update={update} groupOptions={groupOptions} /> : null}
            <FiltersTrigger triggerRef={filtersTriggerRef} open={open === 'filters'} onClick={() => setOpen(open === 'filters' ? null : 'filters')} count={active} />
            {isSm && onTogglePin ? (
              <button ref={pinsTriggerRef} type="button" aria-expanded={open === 'pins'} aria-haspopup="dialog" onClick={() => setOpen(open === 'pins' ? null : 'pins')} className={BUTTON}>
                <Pin className="h-4 w-4" aria-hidden="true" />
                Pin fields
              </button>
            ) : null}
            {!isSm && onToggleSelectMode ? <SelectToggle pressed={selectMode} onClick={onToggleSelectMode} /> : null}
          </>
        }
        actions={{
          secondary,
          primary: isSm ? (
            <button type="button" onClick={onAdd} className={PRIMARY}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {`Add ${kind.noun.one}`}
            </button>
          ) : undefined,
        }}
      />
      {/* the FiltersPanel and PinFieldsMenu popovers, unchanged */}
    </div>
  );
```

with `const active = activeFilters(params);` (renamed from `count`), the new prop `count: string` in the props type (doc: `/** "14 organizations", announced beside the search. */`), imports `import { BUTTON, PRIMARY, SearchInput, Toolbar, type UiAction } from '../../ui';` and `import { Pin, Plus } from 'lucide-react';`; drop `ToolbarSearch`, `ToolbarActions`, `SaveAsSegmentButton` from the `./toolbarParts` import (they stay exported for Pipelines and Contacts until those move).

`FilterChips.tsx`: keep `RemovableChip<P>` type and `ChipRow` (Pipelines uses them) unchanged; replace the `FilterChips` component:

```tsx
/** The active filters under the toolbar (UI foundations spec §5.4): one
 *  removable chip per filter and Clear all. The count lives in the toolbar. */
export function FilterChips({
  params,
  options,
  onChange,
  onClearAll,
}: {
  params: PortfolioParams;
  options: FilterOptions | null;
  onChange: (patch: Partial<PortfolioParams>) => void;
  onClearAll: () => void;
}) {
  const chips = filterChips(params, options);
  if (chips.length === 0) return null;
  return (
    <FilterChipRow label="Active filters">
      {chips.map((chip) => (
        <UiRemovableChip key={chip.key} label={chip.label} onRemove={() => onChange(chip.patch)} />
      ))}
      <button type="button" onClick={onClearAll} className={QUIET}>
        Clear all
      </button>
    </FilterChipRow>
  );
}
```

with `import { FilterChipRow, QUIET, RemovableChip as UiRemovableChip } from '../../ui';` (the file's own `RemovableChip` type keeps its name) and `ChipRow`'s `MONO` import kept for Pipelines.

`toolbarParts.tsx` `FiltersTrigger` line 55: `{count > 0 ? <Badge>{count}</Badge> : null}` (neutral; `import { Badge } from '../../ui';`).

`filterParts.tsx`:
- `FILTER_SELECT`: `disabled:opacity-50` → `disabled:bg-subtle disabled:text-ink-faint`.
- `FilterGroup` legend: `` className={`mb-1 ${TYPE.label}`} ``.
- `GroupSortFields` body:

```tsx
  const descending = sort.startsWith('-');
  const field = sort.replace(/^-/, '');
  return (
    <>
      <Select label="Group" labelPosition="inline" value={group} onChange={onGroup} options={groupOptions} />
      <span className="flex items-center gap-1.5">
        <Select label="Sort by" labelPosition="inline" value={field} onChange={(value) => onSort(`${descending ? '-' : ''}${value}`)} options={sortOptions} />
        <button
          type="button"
          aria-pressed={descending}
          aria-label={descending ? 'Descending' : 'Ascending'}
          title={descending ? 'High to low' : 'Low to high'}
          onClick={() => onSort(descending ? field : `-${field}`)}
          className={`${ICON_BUTTON} border border-line`}
        >
          {descending ? <ArrowDown className="h-4 w-4" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
        </button>
      </span>
    </>
  );
```

  (drop the two `useId` calls; `import { ICON_BUTTON, OVERLAY, Select, TYPE } from '../../ui';`).
- `FilterSheet` popover (line 208): `` className={`absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[22rem] overflow-y-auto p-4 ${OVERLAY}`} ``.

`FiltersPanel.tsx`: each label-above `label` + `select` pair (Owner and the others) becomes `<Select label="Owner" value={params.owner} onChange={(owner) => update({ owner })} options={[...]} id={ownerId} />` keeping the `ownerRef` initial focus by giving `Select` the id and focusing `document.getElementById(ownerId)` if `Select` has no ref prop (or keep the Owner field as a bare `select` with `SELECT` from ui plus a `TYPE.label` label, the only exception, if the initial-focus test needs the ref); uppercase labels → `TYPE.label`; `text-[11px] ... uppercase` notes → `TYPE.meta`.

Pages (`List`, `Board`, both kinds): compute `const countLine = useFilterCount(params, options, portfolio.data?.count ?? null, portfolio.total, failed);` (`failed` = `!portfolio.data && portfolio.error !== null` as the pages already compute) and pass `count={countLine}` to `PortfolioToolbar`; `FilterChips` loses `count`, `total`, `failed`. In the Accounts pages the hook runs inside the component wrapped by `PortfolioKindContext.Provider` (`AccountsList`, and the Board's equivalent), never in the wrapper. Notices: `text-danger` → `text-danger-ink`; the Board's two dismiss buttons (lines 205-213, 218-226) → `className={ICON_BUTTON}` (keep `aria-label="Dismiss"`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/portfolio src/pages/organizations src/pages/accounts src/components/pipelines src/pages/pipelines src/components/segments src/pages/segments`
Expected after updates: PASS. Updates (keep intent): removing a chip finds "Remove filter: …" (was "Remove …"); the live count is the toolbar's `role="status"` (it moved out of the chip row); Group/Sort selects are found by label as before; Pipelines/Segments tests that asserted `FILTER_SELECT` classes on Group/Sort now see `SELECT`; the Filters count is a neutral badge (was an accent pill).

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/filterCount.ts src/components/organizations/portfolio/filterCount.test.tsx \
  src/components/organizations/portfolio/PortfolioToolbar.tsx src/components/organizations/portfolio/PortfolioToolbar.test.tsx \
  src/components/organizations/portfolio/FilterChips.tsx src/components/organizations/portfolio/FilterChips.test.tsx \
  src/components/organizations/portfolio/toolbarParts.tsx src/components/organizations/portfolio/filterParts.tsx \
  src/components/organizations/portfolio/FiltersPanel.tsx \
  src/pages/organizations/List.tsx src/pages/organizations/Board.tsx src/pages/accounts/List.tsx src/pages/accounts/Board.tsx
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): one toolbar for the Organizations and Accounts list and board

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Board cards, side panel, sheet and the selection bar

**Precondition:** #128 in the branch (it edits `BoardCard.tsx`, `PortfolioBoard.tsx`, `Board.test.tsx`). Depends on Task 4 (`SignalTag` as a badge).

**Files:**
- Modify: `src/components/organizations/portfolio/{BoardCard,BoardColumn,PortfolioBoard,AccountSidePanel,AccountSheet,AccountDetails,SelectionBar,SelectionActionsBar,MoveToMenu,PinFieldsMenu}.tsx`, `src/components/accounts/portfolio/AccountPanels.tsx`
- Test (update): `src/components/organizations/portfolio/{BoardCard,PortfolioBoard,AccountSidePanel,AccountSheet,AccountDetails,SelectionBar,SelectionActionsBar,MoveToMenu,PinFieldsMenu,kindBoard}.test.tsx`, `src/components/accounts/portfolio/AccountPanels.test.tsx`, `src/pages/organizations/Board.test.tsx`, `src/pages/accounts/Board.test.tsx`

**Interfaces:**
- Consumes: `Card`, `ICON_BUTTON`, `PRIMARY`, `BUTTON`, `DANGER`, `OVERLAY`, `NUM`, `TYPE`, `Badge`, `EmptyBookState` (Task 4).
- Produces: `BOARD_ACTIONS` (module constant in `BoardCard.tsx`); the ARR span on a card carries `data-part="arr"`.

Why: spec §4.1 (a board card is a `Card`, no shadow), §7 (controls beyond the first on hover or focus from sm, always on touch), audit S3 (two always-visible 36px buttons truncate the names).

`BoardCard.tsx` (#128's version):

| Lines | Before | After |
|---|---|---|
| imports | `FOCUS` from `./styles` | `import { Card, FOCUS, ICON_BUTTON, NUM, TYPE } from '../../ui';` |
| 69 | `const startDrag = (event: DragEvent<HTMLLIElement>) =>` | `DragEvent<HTMLElement>` |
| 77-86 `li` | `cursor-pointer rounded-xl bg-surface p-3 transition-shadow ... hover:shadow-sm ${open ? 'ring-1 ring-accent' : ''} ...` | `<Card as="li" pad="sm" selected={open} data-card-id={row.id} draggable={draggable} onDragStart={draggable ? startDrag : undefined} onDragEnd={draggable ? onDragEnd : undefined} onClick={() => onOpen(row)} className={`group relative cursor-pointer ${draggable ? 'active:cursor-grabbing' : ''}`}>` |
| 95 name `Link` | `... text-[13px] font-semibold text-ink ...` | `` `flex min-h-11 min-w-0 items-center truncate rounded-sm ${TYPE.body} font-semibold hover:underline sm:block sm:min-h-0 ${FOCUS}` `` and `title={row.name}` |
| 99 subtitle | `truncate text-[11px] text-ink-muted` | `` `truncate ${TYPE.meta}` `` |
| 101-123 | `MoveToMenu` and the Open button directly in the header row | both inside `<div className={open ? 'flex shrink-0 items-center gap-1' : BOARD_ACTIONS}>`; the Open button `className={ICON_BUTTON}` (keeps `data-part="open"` and its `aria-*`) |
| 126 ARR | `font-mono-brand tabular-nums text-[13px] text-ink` | `` <span data-part="arr" className={`${TYPE.body} ${NUM}`}>{arr}</span> `` (#128's wrapping line 125 stays) |

with, above the component:

```tsx
/** A card's Move to… and Open buttons (UI foundations spec §7): in the row
 *  on phones; from sm they float over the card's top-right corner on hover
 *  or focus, so the name keeps the card's whole width; always shown on a
 *  touch screen, and in the row while the card is open. */
const BOARD_ACTIONS =
  'relative z-10 flex shrink-0 items-center gap-1 sm:absolute sm:right-2 sm:top-2 sm:rounded-lg sm:bg-surface sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:opacity-100';
```

Other files:

| File:line | Before | After |
|---|---|---|
| `BoardColumn.tsx:88,92` (`ColumnFigures`, shared with Pipelines) | `font-mono-brand tabular-nums` | `NUM` |
| `BoardColumn.tsx:206,301` | dashed placeholder boxes `text-[13px] text-ink-muted` | unchanged (a drop zone, not a card); `text-[13px] text-ink-muted` → `TYPE.bodyMuted` |
| `BoardColumn.tsx:304` | `` `${QUIET} border border-line` `` | `BUTTON` |
| `PortfolioBoard.tsx:239-241` (stale error) | `text-danger` | `text-danger-ink` |
| `PortfolioBoard.tsx` the `PortfolioBoard` component's empty and first-load error (it renders `EmptyBook` / `ErrorBlock`) | legacy boxes | `<Card pad="none"><EmptyBookState … /></Card>` and `<Card pad="none"><ErrorState message={…} onRetry={…} /></Card>` (ui); `BoardLayout`/`BoardSkeleton` (Pipelines) unchanged |
| `PortfolioBoard.tsx:271` (phone column chips' count, in `BoardLayout`) | `font-mono-brand tabular-nums text-[11px]` | `` `${NUM} text-[11px]` `` |
| `AccountSidePanel.tsx:53-58` | `<aside id=… aria-labelledby=… onKeyDown=… className="flex w-[26rem] shrink-0 flex-col overflow-y-auto rounded-xl bg-surface">` | `<Card as="aside" pad="none" id={DETAILS_PANEL_ID} aria-labelledby={titleId} onKeyDown={onKeyDown} className="flex w-[26rem] shrink-0 flex-col overflow-y-auto">` (`as` gains `'aside'` in `Card`'s union in `Card.tsx`, one word, no test change); its sticky header (line 59) keeps `bg-surface`, now `px-4` |
| `AccountSidePanel.tsx:62`, `AccountSheet.tsx:79` | `truncate text-[15px] font-semibold text-ink` | `` `truncate ${TYPE.title}` `` |
| `AccountSidePanel.tsx:65`, `AccountSheet.tsx:82` | `truncate text-[11px] text-ink-muted` | `` `truncate ${TYPE.meta}` `` |
| `AccountSidePanel.tsx:72`, `AccountSheet.tsx:88` | hand-written close buttons | `ICON_BUTTON` (keep `aria-label`) |
| `AccountSidePanel.tsx:78`, `AccountSheet.tsx:94` | `font-mono-brand tabular-nums text-[15px] text-ink` | `` `${TYPE.title} ${NUM}` `` |
| `AccountSidePanel.tsx:59,77,87`, `AccountSheet.tsx:76,93,103` | `px-3` | `px-4` |
| `AccountSidePanel.tsx:91`, `AccountSheet.tsx:107` | hand-written accent link | `` `${PRIMARY} justify-center` `` |
| `AccountDetails.tsx:40`, `AccountPanels.tsx:19` | panel `h3` `mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted` | `` `mb-2 ${TYPE.label}` `` |
| `AccountDetails.tsx:70`, `AccountPanels.tsx:47` | `${mono ? 'font-mono-brand tabular-nums' : ''}` | `${mono ? NUM : ''}`; any `text-danger`/`text-warning` in the `tone` maps → `-ink` |
| `AccountDetails.tsx:134,180`, `AccountPanels.tsx:103` | `font-mono-brand tabular-nums` | `NUM` |
| `AccountDetails.tsx:144,146` | product pills `rounded-full bg-subtle px-2 py-0.5 text-[11px]` | `<Badge>{primary.name}</Badge>`, `<Badge>(+{additional_count})</Badge>` |
| `AccountDetails.tsx:216`, `AccountPanels.tsx:161` | `border-t border-line-subtle px-3 pt-3 pb-4` | `border-t border-line-subtle px-4 py-4` |
| `SelectionActionsBar.tsx:102` | `` `${BUTTON} bg-accent text-on-accent border-accent hover:bg-accent-hover` `` | `PRIMARY` |
| `SelectionActionsBar.tsx:103,130` | `font-mono-brand tabular-nums` | `NUM` |
| `SelectionActionsBar.tsx:124` | `sticky bottom-3 z-20 flex flex-col gap-2 rounded-xl border border-line bg-elevated px-3 py-2 shadow-md ${FOCUS}` | `` `sticky bottom-3 z-20 flex flex-col gap-2 px-4 py-2 ${OVERLAY} ${FOCUS}` `` |
| `SelectionActionsBar.tsx:184` | hand-written close button | `ICON_BUTTON` |
| `SelectionActionsBar.tsx:196,200` | `text-danger` | `text-danger-ink` |
| `SelectionBar.tsx:73` | `` `${BUTTON} text-danger` `` (Churn) | `DANGER` |
| `MoveToMenu.tsx:127` | `` `inline-flex min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle disabled:opacity-50 ${FOCUS}` `` | `className={ICON_BUTTON}` (the same box; its disabled state is token-based; keep the `aria-*` and `title`) |
| `MoveToMenu.tsx:139` | `... rounded-lg border border-line bg-elevated py-1 shadow-md` | `` `absolute right-0 z-20 flex w-44 ${placement…} flex-col overflow-y-auto py-1 ${OVERLAY}` `` |
| `PinFieldsMenu.tsx:46` | `... rounded-xl border border-line bg-elevated p-4 shadow-md` | `` `absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[20rem] overflow-y-auto p-4 ${OVERLAY}` `` |
| `PinFieldsMenu.tsx:47,49,53,63` | `text-[15px] font-semibold text-ink`; mono count; uppercase legend; `disabled:opacity-50` | `TYPE.title`; `` `${NUM} ${TYPE.meta}` ``; `TYPE.label`; removed |

- [ ] **Step 1: Write the failing tests**

Append to `src/components/organizations/portfolio/BoardCard.test.tsx` (reuse its card render helper):

```tsx
  it('is a flat Card whose buttons wait for hover or focus from sm, and stay in the row on phones and while open', () => {
    const { rerender } = renderCard({ open: false });
    const card = document.querySelector('[data-card-id]')!;
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface', 'p-3', 'group', 'relative');
    expect(card.className).not.toMatch(/shadow/);
    const open = card.querySelector('[data-part="open"]')!;
    expect(open.parentElement).toHaveClass('sm:absolute', 'sm:opacity-0', 'sm:group-hover:opacity-100', 'sm:group-focus-within:opacity-100', '[@media(hover:none)]:opacity-100');
    expect(card.querySelector('[data-part="arr"]')).toHaveClass('tabular-nums');
    rerender(cardElement({ open: true }));
    const shown = document.querySelector('[data-card-id] [data-part="open"]')!.parentElement!;
    expect(shown.className).not.toMatch(/opacity-0/);
    expect(document.querySelector('[data-card-id]')).toHaveClass('ring-1', 'ring-accent');
  });
```

(`renderCard`/`cardElement` stand for the file's helpers.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/organizations/portfolio/BoardCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the tables above.

In `src/pages/organizations/Board.test.tsx`, #128's scroll-fade test: replace

```tsx
    const figures = [...card.querySelectorAll('.font-mono-brand')].map((el) => el.parentElement!);
```

with

```tsx
    const figures = [...card.querySelectorAll('[data-part="arr"]')].map((el) => el.parentElement!);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/portfolio src/components/accounts/portfolio src/pages/organizations src/pages/accounts src/components/pipelines src/pages/pipelines`
Expected after updates (keep intent): PASS. Typical updates: `font-mono-brand` → `tabular-nums` on figures; the open card's `ring-1 ring-accent` is now on the `Card` (same classes); popovers have `shadow-lg` (were `shadow-md`); Churn is `text-danger-ink`.

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/portfolio/BoardCard.tsx src/components/organizations/portfolio/BoardCard.test.tsx \
  src/components/organizations/portfolio/BoardColumn.tsx src/components/organizations/portfolio/PortfolioBoard.tsx \
  src/components/organizations/portfolio/AccountSidePanel.tsx src/components/organizations/portfolio/AccountSheet.tsx \
  src/components/organizations/portfolio/AccountDetails.tsx src/components/organizations/portfolio/SelectionBar.tsx \
  src/components/organizations/portfolio/SelectionActionsBar.tsx src/components/organizations/portfolio/MoveToMenu.tsx \
  src/components/organizations/portfolio/PinFieldsMenu.tsx src/components/accounts/portfolio/AccountPanels.tsx \
  src/components/ui/Card.tsx src/pages/organizations/Board.test.tsx
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): board cards on Card with their buttons on hover, panels on the type scale

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: Detail page chrome: name row, tiles, tabs, account chips, attention, states

**Files:**
- Modify: `src/components/organizations/detail/{DetailNameRow,OrganizationHeader,HeaderTiles,AttentionBlock,AccountChips,CountChip,DetailPage,Skeletons}.tsx`, `src/components/accounts/detail/{AccountHeader,AccountTiles}.tsx`, `src/pages/organizations/Details.tsx`, `src/pages/accounts/Details.tsx`
- Test (update): `src/components/organizations/detail/{OrganizationHeader,HeaderTiles,AttentionBlock,AccountChips,DetailPage,DetailTabs,alignment,orgSwitch}.test.tsx`, `src/components/accounts/detail/{AccountHeader,AccountTiles}.test.tsx`, `src/pages/organizations/Details.test.tsx`, `src/pages/accounts/Details.test.tsx`

**Interfaces:**
- Consumes: `Tile` (`onOpen`, `expanded`, `controls`, `buttonLabel`), `tileRow(4, 'container')`, `Tabs` (tablist with `idBase`), `Card`, `CardHeader`, `ErrorState`, `EmptyState`, `LoadingState`, `Initials`, `Badge`, `FilterChip`, `BUTTON`, `ICON_BUTTON`, `NUM`, `TYPE`, `NO_VALUE` (Task 2); `PageHeader` back (Task 3).
- Produces: `DetailTiles` (same props) on `Tile`; the Records detail pages use `Tabs` from ui; `DetailTabs.tsx` stays for Campaigns, Scenarios, Segments and Surveys (unchanged).

Why: spec §2 (the record's name is the one display heading), §4.3 (tiles share one anatomy: audit "four tiles with four layouts"), §5.2 (one tab style), §5.4 (no black-filled chips), §7 (one badge per card header; the status pill and signal are badges), audit S6 (states).

| File:line | Before | After |
|---|---|---|
| `DetailNameRow.tsx:47-52` | `<span … font-mono-brand text-[13px] font-semibold …>{row.initials}</span>` | `<Initials text={row.initials} size="lg" />` |
| `DetailNameRow.tsx:55` | `h1` `min-w-0 truncate text-[22px] font-semibold leading-tight text-ink` | `` `min-w-0 truncate ${TYPE.display}` `` and `title={row.name}` |
| `DetailNameRow.tsx:61` | `truncate text-[13px] text-ink-muted` | `` `truncate ${TYPE.bodyMuted}` `` |
| `DetailNameRow.tsx:67` | `text-[11px] text-danger` | `` `mt-1 flex flex-wrap items-center gap-x-2 ${TYPE.meta} text-danger-ink` `` (keep `role="alert"`) |
| `DetailNameRow.tsx:94` | ⋯ trigger `inline-flex h-11 w-11 … border border-line bg-surface …` | `` `${ICON_BUTTON} border border-line` `` (same 44/36px box) |
| `OrganizationHeader.tsx:43` | status pill `rounded-full bg-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-muted` | `<Badge>{status}</Badge>` |
| `HeaderTiles.tsx:11-15` | `TILE`, `Title` | deleted |
| `HeaderTiles.tsx:55-100` | the four hand-made tile buttons in `isSm ? 'grid grid-cols-2 … @min-[36rem]:grid-cols-4' : '-mx-4 flex snap-x …'` | `<div className={tileRow(4, 'container')}>` holding the four tiles below; the outer `@container flex flex-col gap-3` stays; the `isSm` prop stays in the signature (callers pass it) but is unused: rename it `_isSm` in destructuring or drop it from both callers (`HeaderTiles`, `AccountTiles`) and the props type |
| `HeaderSkeleton` / `TabSkeleton` (`Skeletons.tsx`) | hand-made pulse blocks in `rounded-xl bg-surface` boxes | `TabSkeleton`: `<Card pad="none"><LoadingState label={label} variant="block" /></Card>`; `HeaderSkeleton`: `<div className="flex flex-col gap-3"><LoadingState label={label} variant="tiles" count={4} /></div>` (the `isSm` prop kept, unused, or dropped with its callers) |
| `AttentionBlock.tsx:19-21` | `Num` with `font-mono-brand tabular-nums` | `<span className={NUM}>` |
| `AttentionBlock.tsx:109-113` | `<section aria-labelledby className="rounded-xl bg-surface p-3"><h2 … uppercase …>` | `<Card as="section" pad="none" aria-labelledby={headingId}><CardHeader id={headingId} title="Needs attention" />` and `<ul className="divide-y divide-line-subtle">` |
| `AttentionBlock.tsx:124` | `shrink-0 font-mono-brand text-[11px] tabular-nums text-ink-muted` | `` `shrink-0 ${TYPE.meta} ${NUM}` `` |
| `AttentionBlock.tsx:135,140` | `flex min-h-11 w-full items-center gap-2 rounded-lg px-1 …` | `flex min-h-11 w-full items-center gap-2 px-4 text-left text-[13px] text-ink-muted hover:bg-subtle active:bg-line-subtle sm:min-h-9 ${FOCUS}` (no radius: rows of the card) and the `div` variant `px-4` |
| `CountChip.tsx` (used by `AccountChips` and `StoryToolbar`) | `bg-accent text-on-accent` when pressed (black-filled), mono count | not dimmed: `return <FilterChip label={label} count={count} pressed={pressed} onToggle={onClick} describedBy={describedBy} />`; dimmed: today's button with `CHIP = `inline-flex min-h-11 sm:min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] ${FOCUS}``, look `${pressed ? 'border-accent' : 'border-line'} bg-surface text-ink-muted hover:bg-subtle`, count `` `text-[11px] ${NUM}` `` |
| `AccountChips.tsx:81` | `text-danger` | `text-danger-ink` |
| `AccountChips.tsx:77` | loading pills `h-8 w-24 animate-pulse rounded-full bg-subtle` | `motion-safe:animate-pulse` (keep the shape) |
| `DetailPage.tsx:36-50` `DetailNotFound` | legacy `EmptyState` with a `` `${QUIET} border border-line` `` link | `<Card pad="none"><UiEmptyState title={title} detail="It may have been removed, or you may not have access to it." action={<Link to={backTo} className={BUTTON}>{backLabel}</Link>} /></Card>` inside `Centered` |
| `DetailPage.tsx:53-58` `DetailLoadFailed` | `ErrorBlock` | `<Card pad="none"><UiErrorState message={message} onRetry={onRetry} /></Card>` |
| `DetailPage.tsx:62-72` `RefreshFailed` | `rounded-xl bg-surface px-3 py-2 text-[13px] text-danger` box | `` <div role="alert" className={`flex flex-wrap items-center gap-2 ${TYPE.body} text-danger-ink`}> `` (one line, no box) with the `QUIET` Try again |
| `pages/organizations/Details.tsx` (`<DetailTabs idBase={idBase} active={tab} onChange={(next) => update({ tab: next })} />`) | `DetailTabs` (default label "Organization sections") | `<Tabs label="Organization sections" idBase={idBase} items={DETAIL_TABS} value={tab} onChange={(next) => update({ tab: next })} />` |
| `pages/accounts/Details.tsx` (`<DetailTabs … tabs={ACCOUNT_PAGE_TABS} label=… />`) | `DetailTabs` | `<Tabs label="Account sections" idBase={idBase} items={ACCOUNT_PAGE_TABS} value={tab} onChange={(next) => update({ tab: next })} />` (line 153 today) |
| Both pages | tabs flush in the column | wrap the `Tabs` in `<div className="-mx-4 h-11 border-b border-line-subtle px-4 sm:mx-0 sm:px-0">` so the underline row reads as one line under the name and tiles (the row scrolls sideways on phones through `Tabs`) |

`DetailPage.tsx` already imports the legacy `EmptyState`/`ErrorBlock` from `PortfolioSections`; import the ui ones as `import { BUTTON, Card, EmptyState as UiEmptyState, ErrorState as UiErrorState, TYPE } from '../../ui';` and drop the legacy imports once unused.

The four tiles in `DetailTiles` (each inside `tileRow(4, 'container')`):

```tsx
        <Tile
          label="Health"
          value={row.health.score.toFixed(1)}
          meta={`${band} · ${open ? 'Hide' : 'Show'} ${breakdownWord}`}
          onOpen={() => setOpen((value) => !value)}
          expanded={open}
          controls={breakdownId}
          buttonLabel={`Health ${row.health.score.toFixed(1)}, ${band}. ${open ? 'Hide' : 'Show'} the ${breakdownWord}`}
        >
          <TrendLine trend={row.health.trend} category={row.health.category} />
        </Tile>
        <Tile label="ARR" value={arr} meta={arrNote} onOpen={() => onJump('commercial')} buttonLabel={`ARR ${arr}. Show commercial details`} />
        <Tile
          label="Renewal"
          value={renewalText(row.renewal.days)}
          meta={row.renewal.date ? formatDate(row.renewal.date) : undefined}
          onOpen={() => onJump(renewalPanel)}
          buttonLabel={`Renewal ${renewalText(row.renewal.days)}. ${renewalHint}`}
        >
          <RenewalBar renewal={row.renewal} />
        </Tile>
        <Tile
          label="Pulse"
          value={`AI ${pulse.ai ?? NO_VALUE} · CSM ${pulse.csm ?? NO_VALUE}`}
          meta={[pulse.ai_label, pulse.disagree ? 'pulses disagree' : null].filter(Boolean).join(' · ') || undefined}
          onOpen={() => onJump('voice')}
          buttonLabel={`Pulse ${pulseWords}. Show the voice of the customer`}
        />
```

`RenewalBar` is new in `rowParts.tsx`, the bar part of `RenewalRunway` on its own (a `span`, so it can sit inside the tile's button):

```tsx
/** Just the runway bar: a year's runway filling toward the renewal date. */
export function RenewalBar({ renewal }: { renewal: PortfolioRowBase['renewal'] }) {
  const overdue = renewal.days != null && renewal.days < 0;
  const fill = renewal.days == null ? 0 : overdue ? 1 : Math.max(0, 1 - renewal.days / 365);
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
      <span className={`block h-full rounded-full ${overdue ? 'bg-danger' : 'bg-ink-muted'}`} style={{ width: `${fill * 100}%` }} />
    </span>
  );
}
```

and `RenewalRunway` reuses it (`<RenewalBar renewal={renewal} />` in place of its first child span).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/organizations/detail/HeaderTiles.test.tsx` (reuse its row fixture and render helper):

```tsx
  it('draws four standard tiles: eyebrow label, display figure, one meta line, in a container-sized row', () => {
    renderTiles();
    const health = screen.getByRole('button', { name: /^Health \d+\.\d, \w+\. Show the breakdown$/ });
    expect(health).toHaveAttribute('aria-expanded', 'false');
    expect(health).not.toHaveAttribute('aria-pressed');
    const row = health.parentElement!.parentElement!; // button, its Card, the tile row
    expect(row).toHaveClass('@min-[50rem]:grid-cols-4', 'items-start');
    for (const label of ['Health', 'ARR', 'Renewal', 'Pulse']) {
      expect(screen.getByText(label)).toHaveClass('uppercase', 'text-[11px]');
    }
    expect(screen.getByRole('button', { name: /^ARR .*Show commercial details$/ }).querySelector('.text-\\[22px\\]')).toHaveClass('tabular-nums');
  });
```

Append to `src/components/organizations/detail/OrganizationHeader.test.tsx`:

```tsx
  it('names the record in the one display heading, initials in the body font, status as a badge', () => {
    renderHeader({ row: { ...ROW, is_archived: true } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-[22px]', 'font-semibold', 'truncate');
    expect(screen.getByText(ROW.initials)).not.toHaveClass('font-mono-brand');
    expect(screen.getByText('Archived')).toHaveClass('rounded-full', 'bg-subtle', 'text-ink-muted');
  });
```

Append to `src/components/organizations/detail/AttentionBlock.test.tsx`:

```tsx
  it('is a card titled Needs attention whose rows are divided, figures in tabular body figures', () => {
    renderBlock();
    const region = screen.getByRole('region', { name: 'Needs attention' });
    expect(region).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(screen.getByRole('heading', { level: 2, name: 'Needs attention' })).toHaveClass('text-[15px]');
    expect(region.querySelector('ul')).toHaveClass('divide-y');
    expect(region.querySelector('.font-mono-brand')).toBeNull();
  });
```

(`renderTiles`, `renderHeader`, `ROW`, `renderBlock` stand for each file's existing helpers and fixtures.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/detail/HeaderTiles.test.tsx src/components/organizations/detail/OrganizationHeader.test.tsx src/components/organizations/detail/AttentionBlock.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the table and the tile code above. Imports from `'../../ui'` (detail) and `'../../../components/ui'` (pages). The pages import `DETAIL_TABS` (already imported) and drop the `DetailTabs` import.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/components/accounts/detail src/pages/organizations src/pages/accounts src/components/ui`
Expected after updates (keep intent): PASS. Typical updates: the tab panels' ids are unchanged (`tabId`/`tabPanelId` produce the same strings as `detailTabId`/`detailPanelId`); tab keyboard tests pass on `Tabs` (same keys); the pressed account chip is `bg-accent-dim` (was `bg-accent text-on-accent`); the header's figures are `tabular-nums`; tile tests that found "Health" by its button's `aria-label` still do (`buttonLabel`); `alignment.test.tsx` expectations of `px-3` become `px-4`.

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/DetailNameRow.tsx src/components/organizations/detail/OrganizationHeader.tsx \
  src/components/organizations/detail/HeaderTiles.tsx src/components/organizations/detail/AttentionBlock.tsx \
  src/components/organizations/detail/AccountChips.tsx src/components/organizations/detail/CountChip.tsx \
  src/components/organizations/detail/DetailPage.tsx src/components/organizations/detail/Skeletons.tsx \
  src/components/organizations/portfolio/rowParts.tsx src/components/accounts/detail/AccountHeader.tsx \
  src/components/accounts/detail/AccountTiles.tsx src/pages/organizations/Details.tsx src/pages/accounts/Details.tsx \
  src/components/organizations/detail/HeaderTiles.test.tsx src/components/organizations/detail/OrganizationHeader.test.tsx \
  src/components/organizations/detail/AttentionBlock.test.tsx
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): detail pages' name, tiles, tabs and states on the primitives

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The Story: toolbar, day cards and rows of even height

**Files:**
- Create: `src/components/organizations/detail/rowTitle.ts`
- Modify: `src/components/organizations/detail/{StoryToolbar,StoryStream,StoryItemRow,StoryTab,SourcesPicker,EmailThread}.tsx`
- Test (update): `src/components/organizations/detail/{StoryToolbar,StoryStream,StoryItemRow,StoryTab}.test.tsx`, `src/components/accounts/detail/{story,storyParts}.test.tsx`, `src/pages/organizations/ask/askAboutThis.test.tsx`, `src/pages/organizations/Details.test.tsx`, `src/pages/accounts/Details.test.tsx`

**Interfaces:**
- Consumes: `Toolbar`, `SearchInput`, `FilterChipRow`, `CountChip` (Task 8, on `FilterChip`), `ListCard`, `CardHeader`, `LoadingState`, `EmptyState`, `ErrorState`, `Badge`, `IconChip`, `ROW_ACTIONS`, `PRIMARY`, `BUTTON`, `NUM`, `TYPE`, `Menu`.
- Produces: `TITLE_CONTROL` (exported from `StoryItemRow.tsx`, reused by `CallItem` and `HistoryItems` in Tasks 10 and 13): a row title that opens something, 44px on phones through its line box and one text line from `sm`.

Why: audit S3 and S4 (20 identical "Organization" pills and "Ask about this" links; the 36px line box on interactive titles making rows uneven and dropping the time), spec §4.2 (one meta line, actions on hover from sm), §7 (no badge restating the page's own record), §5.4 (chips), §5.6 (toolbar).

`StoryItemRow.tsx`:

| Lines | Before | After |
|---|---|---|
| 37 `LINK` | `mt-1 inline-flex min-h-11 items-center gap-1 rounded-sm text-[13px] font-semibold text-ink underline sm:min-h-9 ${FOCUS}` | unchanged |
| 38 `PLAN_LINK` | `… text-[11px] font-semibold text-ink-muted …` | unchanged (already on scale) |
| 98-100 `titleButton` | `inline-block min-h-11 max-w-full truncate rounded-sm text-left leading-[2.75rem] hover:underline active:opacity-70 sm:min-h-9 sm:leading-9 ${FOCUS}` | module constant `TITLE_CONTROL` (below), used for the task link, the thread button and the expand button |
| 103 `li` | `flex gap-3 px-3 py-2.5` | `group relative flex gap-3 px-4 py-3` |
| 104-106 icon | hand-made circle | `<IconChip icon={Icon} />` |
| 108 title row | `flex min-w-0 items-baseline gap-2` | `flex min-w-0 items-baseline gap-2 max-sm:min-h-11` |
| 109 `h3` | `min-w-0 flex-1 truncate text-[13px] font-semibold text-ink` | `` `min-w-0 flex-1 truncate ${TYPE.body} font-semibold` `` |
| 131 `time` | `shrink-0 font-mono-brand text-[11px] tabular-nums text-ink-muted` | `` `shrink-0 ${TYPE.meta} ${NUM}` `` |
| 144, 148 summary | `text-[13px] text-ink-muted` | `TYPE.bodyMuted` (keep `whitespace-pre-line break-words` / `truncate`) |
| 152-165 meta line | the "Organization"/account pill on every item when tags show, the kind line, and `AskAboutButton` at the end (`ml-auto`) | `` <p className={`mt-0.5 flex min-w-0 items-center gap-2 ${TYPE.meta}`}> `` holding `{showTag && item.account ? <Badge truncate>{item.account.name}</Badge> : null}` (an organisation-level item no longer says "Organization" on its own organisation's page) and `<span className="min-w-0 truncate">{meta}</span>`; `AskAboutButton` moves out of it (next row) |
| after the content `div` | (nothing) | `<div className={`${ROW_ACTIONS} self-start`}><AskAboutButton name={item.title} question={…same…} focus={…same…} /></div>` (hover/focus from sm, always on touch; spec §7 "Ask about this: at most one per row, hover/focus only") |

```tsx
/** A row title that opens something (a task, a thread, more text): a 44px
 *  line box on phones, one plain line from sm, so every row in a list is
 *  the same height whatever its title does (Records audit S4). */
export const TITLE_CONTROL = `inline-block max-w-full truncate rounded-sm text-left align-top hover:underline max-sm:leading-[2.75rem] ${FOCUS}`;
```

(`export const` beside a component trips `react-refresh/only-export-components`; put it in a new `src/components/organizations/detail/rowTitle.ts` and import it in `StoryItemRow.tsx`, `CallItem.tsx` and `contacts/HistoryItems.tsx`.)

`StoryStream.tsx`:

| Lines | Before | After |
|---|---|---|
| 10-26 `Skeleton` | hand-made list | deleted; the loading state is `<ListCard label="The story" state={<LoadingState label="Loading the story" count={5} />} />` |
| 28-42 `Day` | `section` + uppercase `h2` + `ul … rounded-xl bg-surface` | `<ListCard label={label} header={<CardHeader title={label} level={2} />}>{items.map(… <StoryItemRow …/>)}</ListCard>` |
| 63 error | `ErrorBlock` | `<ListCard label="The story" state={<UiErrorState message={story.error} onRetry={story.retry} />} />` |
| 66-78 empty | legacy `EmptyState` + `` `${QUIET} border border-line` `` | `<ListCard label="The story" state={<UiEmptyState title=… detail=… action={filtered ? <button type="button" onClick={onClearFilters} className={BUTTON}>Clear filters</button> : undefined} />} />` (same titles and details) |
| 82 | `flex flex-col gap-3` | `flex flex-col gap-4` (cards in a column: spec §6.2) |

`StoryToolbar.tsx`:
- The search `form` (61-83) keeps `role="search"` and its submit; inside, `<SearchInput label="Search the story" placeholder="Search the story" value={draft} onChange={setDraft} width="full" />`; the form's class: `min-w-0 flex-1 sm:max-w-sm`.
- The chips row (103-113): `<FilterChipRow label="Show">{STORY_GROUPS.map(… <CountChip … />)}</FilterChipRow>` (`CountChip` is on `FilterChip` since Task 8; the row scrolls with the edge fade on phones).
- The search and actions (114-125): `<Toolbar search={search} filters={<SourcesPicker … />} actions={{ primary: <Menu label="Add to the story" trigger={<><Plus className="h-4 w-4" aria-hidden="true" />Add</>} triggerClassName={PRIMARY} items={…same…} /> }} />` (Toolbar puts the search on row 1 below sm, as the hand-made layout did).
- Order: the chips row first, the `Toolbar` under it (the chips are the story's main filter).
- `useId` and `isSm` become unused in the component: remove `searchId`; keep `isSm` in the props (callers pass it) or drop it with its two callers.

`StoryTab.tsx:60` `flex flex-col gap-3` → `flex flex-col gap-4`; line 91 `text-[13px] text-ink-muted` → `TYPE.bodyMuted`; line 93 `` `${QUIET} border border-line` `` → `BUTTON`.

`SourcesPicker.tsx` (the Story's Sources popover): line 50 `font-mono-brand tabular-nums` → `NUM`; line 55 `absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-line bg-surface p-2 shadow-md` → `` `absolute right-0 top-full z-30 mt-1 w-64 p-2 ${OVERLAY}` ``; line 57 legend `… uppercase tracking-wider …` → `` `px-1 pb-1 ${TYPE.label}` ``. `EmailThread.tsx:23` `font-mono-brand tabular-nums` → `NUM` (its sheet, `Sheet.tsx`, keeps `shadow-lg`: an overlay).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/organizations/detail/StoryItemRow.test.tsx` (reuse its item fixtures and render helper; the helper must wrap in `ShowAccountTags.Provider value={true}` for the tag cases):

```tsx
describe('StoryItemRow on the primitives (Records PR)', () => {
  it('keeps every row one height: the title control is one line from sm, the time a tabular figure', () => {
    renderRow(TASK_ITEM);
    const title = screen.getByRole('link', { name: TASK_ITEM.title });
    expect(title).toHaveClass('max-sm:leading-[2.75rem]', 'truncate');
    expect(title.className).not.toMatch(/sm:leading-9|sm:min-h-9/);
    expect(document.querySelector('time')).toHaveClass('text-[11px]', 'tabular-nums');
  });

  it("tags an account's item with its account, and an organisation's own item with nothing", () => {
    const { unmount } = renderRow({ ...NOTE_ITEM, account: { id: 4, name: 'EMEA' } }, { tags: true });
    expect(screen.getByText('EMEA')).toHaveClass('truncate');
    unmount();
    renderRow({ ...NOTE_ITEM, account: null }, { tags: true });
    expect(screen.queryByText('Organization')).toBeNull();
  });

  it('puts Ask about this in the row actions, shown on hover or focus from sm', () => {
    renderRow(NOTE_ITEM, { ask: true });
    const ask = screen.getByRole('button', { name: `Ask about this: ${NOTE_ITEM.title}` });
    expect(ask.parentElement).toHaveClass('sm:opacity-0', 'sm:group-hover:opacity-100', 'sm:group-focus-within:opacity-100', '[@media(hover:none)]:opacity-100');
  });
});
```

(`renderRow`, `TASK_ITEM`, `NOTE_ITEM` stand for the file's helpers and fixtures; `ask: true` wraps in the `AskDraftContext` provider the existing Ask tests use.)

Append to `src/components/organizations/detail/StoryStream.test.tsx`:

```tsx
  it('draws each day as one card titled by the day, its items divided', () => {
    renderStream(TWO_DAYS);
    const today = screen.getByRole('list', { name: 'Today' });
    expect(today).toHaveClass('divide-y');
    expect(today.parentElement).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(screen.getByRole('heading', { level: 2, name: 'Today' })).toHaveClass('text-[15px]');
    expect(screen.getByRole('heading', { level: 2, name: 'Today' }).className).not.toMatch(/uppercase/);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/detail/StoryItemRow.test.tsx src/components/organizations/detail/StoryStream.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the tables above (create `rowTitle.ts` with `TITLE_CONTROL` and its doc comment; `import { FOCUS } from '../../ui';` there).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/components/accounts/detail src/pages/organizations src/pages/accounts`
Expected after updates (keep intent): PASS. Typical updates: a day found by `region`/heading inside a `section` is now the `list` named by the day and an `h2` in its card; the "Organization" tag on org-level items is gone (assert it is absent); "Ask about this" is in the row's actions (same name); the empty and error states are inside a card (`role="alert"` for the error, the empty title as text); the story search is found by its label "Search the story" (now a `searchbox` role through `type="search"`, as before).

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/rowTitle.ts src/components/organizations/detail/StoryItemRow.tsx \
  src/components/organizations/detail/StoryStream.tsx src/components/organizations/detail/StoryToolbar.tsx \
  src/components/organizations/detail/StoryTab.tsx src/components/organizations/detail/SourcesPicker.tsx \
  src/components/organizations/detail/EmailThread.tsx src/components/organizations/detail/StoryItemRow.test.tsx \
  src/components/organizations/detail/StoryStream.test.tsx
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): the story as day cards with rows of one height

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: People, Deals and risks, Files, Calls and Maps tabs

**Files:**
- Create: `src/components/organizations/detail/dealColumns.ts` (`export const DEAL_COLUMNS = 'sm:grid-cols-[minmax(12rem,1fr)_7rem_auto]';`)
- Modify: `src/components/organizations/detail/{PersonItem,PeopleTab,DealItem,DealsTab,FileItem,FilesSection,CallItem,CallsSection,ListParts}.tsx`, `src/components/canvas/{MapsTab,MapRow}.tsx`, `src/features/contacts/contactsFormat.ts`
- Test (update): `src/components/organizations/detail/{PersonItem,PeopleTab,DealItem,DealsTab,FileItem,FilesSection,CallItem,CallsSection,ListParts,otherTabs,fieldCoverage,addWaitsForAccount}.test.tsx`, `src/pages/organizations/DetailsLists.test.tsx`, `src/components/accounts/detail/lists.test.tsx`, `src/components/canvas/{MapsTab,MapRow}.test.tsx` (if present), `src/pages/canvas/CanvasPage.test.tsx`, `src/features/contacts/contactsFormat.test.ts`

**Interfaces:**
- Consumes: `ListCard`, `ListRow` (`dataAttrs`, `columns`, `href`, `onSelect`, `leading`, `meta`, `cells`, `trailing`, `actions`), `ListHeaderRow`, `CardHeader`, `LoadingState`, `EmptyState`, `ErrorState`, `SearchInput`, `SegmentedControl`, `Badge`, `SentimentBadge`, `Initials`, `IconChip`, `Menu`, `ICON_BUTTON`, `BUTTON`, `INPUT`, `ROW_ACTIONS`, `NUM`, `TYPE`, `TITLE_CONTROL` (Task 9).
- Produces:
  - `readingBadge(record: { analysis?: Analysis; sentiment: string | null }): { label: string; tone: BadgeTone } | null` in `features/contacts/contactsFormat.ts` (beside `readingOf`, same rules; tones: positive success, neutral neutral, negative danger, "Not enough to analyse" neutral).
  - `AccountTag` (ListParts) returns `<Badge truncate>` or null.
  - `SummaryLine` sets figures in `NUM` (shared with `CustomObjectsTab`).
  - `ScopedEmpty`, `NoMatch` return ui `EmptyState` (no box; their callers put them in the list's card).
  - `ListSearch` renders `SearchInput` (label and placeholder the same string; keep each caller's label under 24 characters or pass a shorter placeholder).
  - `PersonItem({ contact, onEdit, onDelete })` (the `isSm` prop is gone; `PeopleTab` stops passing it).

Why: spec §4.2 (ListRow, one meta line, actions on hover, grid columns where figures line up), §7 (badges: sentiment and overdue only; priority, stage and department neutral words; no restating badges), §3 (one money format: rows use `formatCompactMoney`), audit S6 (states), S7 (mono on words).

New row code:

`PersonItem.tsx` (whole component; `Links` deleted):

```tsx
export function PersonItem({ contact, onEdit, onDelete }: { contact: Contact; onEdit: () => void; onDelete: () => void }) {
  const contacted = contact.last_contacted_at ? `Contacted ${formatRelativeTime(contact.last_contacted_at)}` : 'Not contacted yet';
  const email = contact.email ? mailtoHref(contact.email) : null;
  const phone = contact.phone ? telHref(contact.phone) : null;
  return (
    <ListRow
      dataAttrs={{ 'data-person': contact.id }}
      title={contact.name}
      href={`/contacts/${contact.id}`}
      leading={<Initials text={initials(contact.name)} />}
      meta={[contact.role_display, capitalize(contact.status), contacted].filter(Boolean).join(' · ')}
      trailing={
        <>
          <AccountTag record={contact} />
          <SentimentBadge value={contact.sentiment}>{capitalize(contact.sentiment)} sentiment</SentimentBadge>
        </>
      }
      actions={
        <>
          {email ? (
            <a href={email} aria-label={`Email ${contact.name}`} title={contact.email ?? undefined} className={ICON_BUTTON}>
              <Mail className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : null}
          {phone ? (
            <a href={phone} aria-label={`Call ${contact.name}`} title={contact.phone ?? undefined} className={ICON_BUTTON}>
              <Phone className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : null}
          <Menu
            label={`Actions for ${contact.name}`}
            trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />}
            triggerClassName={ICON_BUTTON}
            items={[
              { key: 'edit', label: 'Edit', onSelect: onEdit },
              { key: 'delete', label: 'Delete', onSelect: onDelete, danger: true },
            ]}
          />
        </>
      }
    />
  );
}
```

(An address `mailtoHref` refuses gets no link in the row, as today; the person's profile still shows it as text.)

`DealItem.tsx` (whole component):

```tsx
// DEAL_COLUMNS comes from './dealColumns' ("The deals list's grid (spec §4.2): name, MRR, then the tags.").
export function DealItem({ deal, onOpen, today = localDay(new Date()) }: { deal: Opportunity | Risk; onOpen: () => void; today?: string }) {
  const currency = useOrgCurrency();
  const date = dealDateLine(deal, today);
  return (
    <ListRow
      dataAttrs={{ 'data-deal': deal.id }}
      title={deal.title}
      onSelect={onOpen}
      columns={DEAL_COLUMNS}
      meta={[deal.stage_display, `${deal.priority_display} priority`, deal.department ? deal.department_display : 'Whole company', date.text].filter(Boolean).join(' · ')}
      cells={[
        <span key="mrr" className={`block ${TYPE.body} sm:text-right`}>
          <span className={NUM}>{formatCompactMoney(deal.mrr, currency)}</span> <span className="text-ink-muted">MRR</span>
        </span>,
      ]}
      trailing={
        <>
          <AccountTag record={deal} />
          {date.overdue ? <Badge tone="danger">Overdue</Badge> : null}
        </>
      }
    />
  );
}
```

(`DEAL_COLUMNS` lives in its own `.ts` file because a non-component export from a `.tsx` trips `react-refresh/only-export-components`.)

`FileItem.tsx` (whole component):

```tsx
export function FileItem({ file, canDelete, onDownload, onDelete }: { file: Attachment; canDelete: boolean; onDownload: () => void; onDelete: () => void }) {
  const source = file.source === 'transcript' ? 'Call transcript' : 'Upload';
  const Icon = file.source === 'transcript' ? Mic : FileText;
  const who = [file.uploaded_by?.name, source].filter(Boolean).join(' · ');
  return (
    <ListRow
      dataAttrs={{ 'data-file': file.id }}
      title={file.name}
      onSelect={onDownload}
      leading={<IconChip icon={Icon} />}
      meta={
        <>
          <span className={NUM}>{formatSize(file.size)}</span>
          {file.description ? ` · ${file.description}` : null}
          {` · ${who} · `}
          <time dateTime={file.created_at} className={NUM}>
            {formatDate(file.created_at.slice(0, 10))}
          </time>
        </>
      }
      trailing={<AccountTag record={file} />}
      actions={
        canDelete ? (
          <button type="button" onClick={onDelete} aria-label={`Delete ${file.name}`} className={`${ICON_BUTTON} hover:text-danger-ink`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null
      }
    />
  );
}
```

`CallItem.tsx` (Story anatomy, one height; participants move into the opened detail, the transcript and recording into the row actions):

| Lines | Before | After |
|---|---|---|
| 44 `li` | `flex gap-3 px-3 py-2.5` | `group relative flex gap-3 px-4 py-3` |
| 45-47 | hand-made icon | `<IconChip icon={Phone} />` |
| 49 | title row | `flex min-w-0 items-baseline gap-2 max-sm:min-h-11` |
| 50 `h4` | `text-[13px] font-semibold text-ink` | `` `min-w-0 flex-1 truncate ${TYPE.body} font-semibold` `` |
| 51-63 | expand only when there is a summary | expandable when `call.summary \|\| participants`; the button `className={TITLE_CONTROL}` |
| 65 `time` | `font-mono-brand text-[11px] tabular-nums text-ink-muted` | `` `shrink-0 ${TYPE.meta} ${NUM}` `` |
| 69-77 | summary lines `text-[13px] text-ink-muted` | `TYPE.bodyMuted`; the expanded `p` becomes `<div id={detailId}>` holding the full summary (if any) and `{participants ? <p className={`mt-1 ${TYPE.meta}`}>With {participants}</p> : null}` |
| 78-90 meta | `META` with the account tag, who, source, sentiment pill `${sentiment.tone}`, classification | `` <p className={`mt-0.5 flex min-w-0 items-center gap-2 ${TYPE.meta}`}> ``: `<AccountTag record={call} />`, `<span className="min-w-0 truncate">{[who, source, classification ? humanise(classification) : null].filter(Boolean).join(' · ')}</span>` (keep the `data-ai` span and its sr-only "AI classification: " around the classification text, inside the truncating span), and `{reading ? <Badge tone={reading.tone}>{reading.label}</Badge> : null}` with `const reading = readingBadge(call);` |
| 91 | `With {participants}` line always shown | moved into the opened detail (above) |
| 92-107 | transcript and recording links as a third line | `<div className={`${ROW_ACTIONS} self-start`}>` after the content `div`, holding the same `button` and `a`, each `className={QUIET}` (keep their names "Transcript", "Recording") |
| 108-112 | `text-[11px] text-danger` | `` `${TYPE.meta} text-danger-ink` `` |

with, in `CallItem.tsx`: `const humanise = (value: string) => value.replace(/_/g, ' ');` (topics read "account management", not "account_management": audit S9).

Containers:

| File | Before | After |
|---|---|---|
| `ListParts.tsx` `AccountTag` (13-22) | `rounded-full bg-subtle px-2 py-0.5 text-ink` span | `return <Badge truncate>{accountTag(record, accounts)}</Badge>;` |
| `ListParts.tsx` `SummaryLine` (42) | `font-mono-brand tabular-nums text-ink` | `` `${NUM} text-ink` `` |
| `ListParts.tsx` `ListSkeleton` (51-67) | hand-made pulse rows in `LIST` | kept for `CustomObjectsTab`/`MapsTab` callers until Task 11 moves them; Records callers stop using it |
| `ListParts.tsx` `ScopedEmpty`, `NoMatch` | legacy `EmptyState`, `` `${QUIET} border border-line` `` | ui `EmptyState` (same titles and details), actions `BUTTON` |
| `ListParts.tsx` `ListSearch` | hand-made input | `<div role="search" className={isSm ? 'min-w-0 max-w-xs flex-1' : 'w-full'}><SearchInput label={label} placeholder={label} value={value} onChange={onChange} width="full" /></div>` |
| `PeopleTab.tsx:75-90` | `ErrorBlock` / `ListSkeleton` / `ScopedEmpty` / `NoMatch` / `<ul aria-label="People" className={LIST}>` as siblings | one `<ListCard label="People" header={<CardHeader title="People" meta={loaded && !failed && inScope.length > 0 ? <SummaryLine parts={peopleSummary(inScope)} /> : undefined} />} state={state}>{rows}</ListCard>` where `state` is `<UiErrorState …/>`, `<LoadingState label="Loading people" />`, `<ScopedEmpty …/>` or `<NoMatch …/>` as today's branches choose; the separate `SummaryLine` paragraph (line 114) goes (it is the header's meta now); `SummaryLine`'s `p` becomes a `span` when used as meta (give `SummaryLine` an `as?: 'p' \| 'span'` prop, default `'p'`) |
| `PeopleTab.tsx:99-112` | search + Add row, `isSm ? 'flex items-center gap-2' : 'flex flex-col gap-2'` | one row on every width: `<div className="flex flex-wrap items-center gap-2">`, the `ListSearch`, then the Add `BUTTON` with `ml-auto` (a tab's small search row, not the page `Toolbar`: it has no count, filters or primary) |
| `DealsTab.tsx:132-170` | same pattern with `LIST` | same `ListCard` pattern, label `Opportunities`/`Risks`, header `<ListHeaderRow columns={DEAL_COLUMNS} labels={[isOpps ? 'Opportunity' : 'Risk', 'MRR', '']} />` under a `CardHeader` with the summary as meta (pass both: `header={<><CardHeader …/><ListHeaderRow …/></>}`) |
| `DealsTab.tsx:181-205` | hand-made Opportunities/Risks buttons and the List/Board segment | `<SegmentedControl label="Deals or risks" options={[{ value: 'opportunities', label: 'Opportunities' }, { value: 'risks', label: 'Risks' }]} value={kind} onChange={setKind} />` and `<SegmentedControl label="View" options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]} value={view} onChange={setView} />` (use the real state names and setters; the icons in the View segment go: text labels are the names) |
| `FilesSection.tsx:96-110` | same pattern | `ListCard label="Files"` with `CardHeader title="Files"` |
| `FilesSection.tsx:127-185` | drop zone `rounded-xl` with the heading, the description input `text-[15px] … sm:text-[13px]` floating right, Upload `BUTTON` | the drop zone wraps the `ListCard` (keeps its `dragging ? 'bg-subtle' : ''`); the `CardHeader`'s `action` is the Upload `BUTTON`; the description field moves into a `CardSection`-like block at the top of the card body: `<div className="flex flex-col gap-1.5 border-b border-line-subtle px-4 py-3"><label htmlFor={descriptionId} className={TYPE.label}>Description (optional)</label><input id={descriptionId} … className={INPUT} /></div>` (audit "the input floats top-right, detached from the drop zone"); errors `text-danger-ink` |
| `CallsSection.tsx:84-118` | per-day `h3` uppercase + `ul LIST`; `h2 SECTION_HEADING`; Log a call `BUTTON` | per day `<ListCard label={dayLabel(…)} header={<CardHeader title={dayLabel(…)} level={3} />}>`; the section heading `` <h2 id={headingId} className={TYPE.title}>Calls</h2> `` with the summary line under it as `TYPE.bodyMuted`; states as in PeopleTab, each in a `ListCard` |
| `FilesCallsTab.tsx:26` | `flex flex-col gap-6` | unchanged |
| `canvas/MapsTab.tsx` | `ErrorBlock` / `ListSkeleton` / legacy `EmptyState` / `<ul aria-label="Maps" className={LIST}>` and a lone "New map" row above | `<ListCard label="Maps" header={<CardHeader title="Maps" action={newMap} />} state={…ui states…}>{rows}</ListCard>`; the separate `flex justify-end` row goes |
| `canvas/MapRow.tsx` (also the `/canvas` gallery's row, inside its `LIST`) | `li` + `ROW_ICON` + `TITLE_BUTTON` link + `META` | `<ListRow dataAttrs={{ 'data-map': row.id }} title={row.name} href={`/canvas/${row.id}`} leading={<IconChip icon={Share2} />} meta={<>{showRecord ? <>{row.record.name} · </> : null}<span className={NUM}>{row.people}</span> {peopleText(row.people)} · {who ? `Edited by ${who} · ` : 'Edited '}<RelativeTime iso={row.updated_at} /></>} />`; `RelativeTime` keeps its export (canvas uses it elsewhere) and its `MONO` → `NUM` |

Shared-file note: `MapRow` is also the `/canvas` gallery's row (Impact surface). It becomes a `ListRow` inside that page's `LIST`, which is already one divided card, so the gallery keeps its look; run the canvas page tests.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/organizations/detail/PersonItem.test.tsx` (reuse its contact fixture; wrap in `MemoryRouter`):

```tsx
  it('is a list row: the name links to the profile, one meta line, sentiment as the one semantic badge, reach and edit on hover', () => {
    renderPerson(CONTACT);
    const name = screen.getByRole('link', { name: CONTACT.name });
    expect(name).toHaveAttribute('href', `/contacts/${CONTACT.id}`);
    const row = name.closest('li')!;
    expect(row).toHaveAttribute('data-person', String(CONTACT.id));
    expect(within(row).getByText(/sentiment$/)).toHaveClass('rounded-full');
    const email = within(row).getByRole('link', { name: `Email ${CONTACT.name}` });
    expect(email.parentElement).toHaveClass('sm:opacity-0', '[@media(hover:none)]:opacity-100');
    expect(within(row).getByRole('button', { name: `Actions for ${CONTACT.name}` })).toBeInTheDocument();
    expect(row.querySelector('.font-mono-brand')).toBeNull();
  });
```

Append to `src/components/organizations/detail/DealItem.test.tsx`:

```tsx
  it('lines MRR up in its own column in compact money, priority in words, Overdue the only colour', () => {
    renderDeal({ ...OPPORTUNITY, mrr: 175000 }, { overdue: true });
    const row = document.querySelector('[data-deal]')!;
    expect(row).toHaveClass('sm:grid-cols-[minmax(12rem,1fr)_7rem_auto]');
    expect(within(row as HTMLElement).getByText('$175K')).toHaveClass('tabular-nums');
    expect(within(row as HTMLElement).getByText('Overdue')).toHaveClass('text-danger-ink');
    expect(within(row as HTMLElement).queryByText(/priority$/, { selector: '.rounded-full' })).toBeNull();
  });
```

Append to `src/components/organizations/detail/CallItem.test.tsx`:

```tsx
  it('stays one height: who it was with opens with the title, transcript and recording wait in the row actions', async () => {
    renderCall({ ...CALL, participants: [{ name: 'Connor Blake', role_display: 'Decision Maker' }], ai_category: 'account_management' });
    expect(screen.queryByText(/^With /)).toBeNull();
    expect(screen.getByText(/account management/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: CALL.title }));
    expect(screen.getByText('With Connor Blake · Decision Maker')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Transcript' }).parentElement).toHaveClass('sm:opacity-0');
  });
```

Add to `src/features/contacts/contactsFormat.test.ts`:

```ts
describe('readingBadge', () => {
  it('tones a reading for a Badge', () => {
    expect(readingBadge({ sentiment: 'positive' })).toEqual({ label: 'Positive', tone: 'success' });
    expect(readingBadge({ sentiment: 'negative' })).toEqual({ label: 'Negative', tone: 'danger' });
    expect(readingBadge({ analysis: 'not_analysable', sentiment: null })).toEqual({ label: 'Not enough to analyse', tone: 'neutral' });
    expect(readingBadge({ analysis: 'pending', sentiment: null })).toBeNull();
  });
});
```

(`renderPerson`, `CONTACT`, `renderDeal`, `OPPORTUNITY`, `renderCall`, `CALL` stand for each file's helpers and fixtures; `renderDeal`'s second argument pins `today` past the deal's date for the overdue case, as the file already does for its overdue test. Use the labels `SENTIMENT_LABEL` really produces.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/detail/PersonItem.test.tsx src/components/organizations/detail/DealItem.test.tsx src/components/organizations/detail/CallItem.test.tsx src/features/contacts/contactsFormat.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`readingBadge` in `src/features/contacts/contactsFormat.ts` (beside `readingOf`):

```ts
const READING_TONE: Record<Reading, BadgeTone> = { positive: 'success', neutral: 'neutral', negative: 'danger' };

/** readingOf for a Badge (UI foundations spec §5.7): the same words, the
 *  shared tone map's tones. */
export function readingBadge(record: { analysis?: Analysis; sentiment: string | null }): { label: string; tone: BadgeTone } | null {
  if (record.analysis === 'not_analysable') return { label: 'Not enough to analyse', tone: 'neutral' };
  if (record.analysis === 'pending') return null;
  const sentiment = record.sentiment as Reading | null;
  if (!sentiment || !(sentiment in SENTIMENT_LABEL)) return null;
  return { label: SENTIMENT_LABEL[sentiment], tone: READING_TONE[sentiment] };
}
```

with `import type { BadgeTone } from '../../components/ui/Badge';` (a type-only import; adjust `Reading`'s key set to the file's real type). Then the row code and container tables above.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/components/accounts/detail src/pages/organizations src/pages/accounts src/components/canvas src/pages/canvas src/features/contacts`
Expected after updates (keep intent): PASS. Typical updates: a person's email/phone links are named "Email Connor Blake"/"Call Connor Blake" (were the address and number); deal MRR reads `$175K` (compact) and no longer carries the priority colour; files' size and date are `tabular-nums`; call participants show after opening; lists are `list` roles inside cards with their states inside; `fieldCoverage.test.tsx` data attributes are unchanged (`data-person`, `data-deal`, `data-file`, `data-call`).

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/PersonItem.tsx src/components/organizations/detail/PeopleTab.tsx \
  src/components/organizations/detail/DealItem.tsx src/components/organizations/detail/dealColumns.ts \
  src/components/organizations/detail/DealsTab.tsx src/components/organizations/detail/FileItem.tsx \
  src/components/organizations/detail/FilesSection.tsx src/components/organizations/detail/CallItem.tsx \
  src/components/organizations/detail/CallsSection.tsx src/components/organizations/detail/ListParts.tsx \
  src/components/canvas/MapsTab.tsx src/components/canvas/MapRow.tsx src/features/contacts/contactsFormat.ts \
  src/components/organizations/detail/PersonItem.test.tsx src/components/organizations/detail/DealItem.test.tsx \
  src/components/organizations/detail/CallItem.test.tsx src/features/contacts/contactsFormat.test.ts
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): People, Deals, Files, Calls and Maps tabs as list cards of rows

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 11: Details tabs and Custom objects as cards with sections

**Files:**
- Modify: `src/components/organizations/detail/{DetailsTab,AccountsSection,CustomerFacts,HealthBreakdown}.tsx`, `src/components/accounts/detail/{AccountDetailsTab,AccountPulseBreakdown}.tsx`, `src/components/shared/CustomObjectsTab.tsx`
- Test (update): `src/components/organizations/detail/{AccountsSection,CustomerFacts,otherTabs,fieldCoverage}.test.tsx`, `src/components/accounts/detail/{AccountDetailsTab,AccountPulseBreakdown}.test.tsx`, `src/pages/accounts/Details.test.tsx`, `src/components/shared/CustomObjectsTab.test.tsx` (if present)

**Interfaces:**
- Consumes: `Card`, `CardHeader` (`id`, `action`), `CardBody`, `CardSection`, `ListCard`, `LoadingState`, `EmptyState`, `ErrorState`, `Badge`, `ICON_BUTTON`, `BUTTON`, `QUIET`, `NUM`, `TYPE` (Task 2).
- Produces: no new names.

Why: spec §4.1 (one card, sections inside it, no nested boxes), §2 (section titles `TYPE.title`, sub-sections `TYPE.label`, never uppercase), §3, audit S6 (the "No accounts yet" and Custom objects empty states).

| File:line | Before | After |
|---|---|---|
| `DetailsTab.tsx:42-56` | `<section aria-labelledby className="rounded-xl bg-surface">`, heading row `px-3 pt-2 pb-2`, uppercase `h2`, body `px-3 pb-4` | `<Card as="section" pad="none" aria-labelledby={headingId}>`, `<CardHeader id={headingId} title="Details" action={onEdit ? <button … className={BUTTON}><Pencil …/>Edit details</button> : undefined} />` (keep `data-part="details-heading"`: put it on a wrapper `div` around `CardHeader`, or drop it and update the one test that reads it), body `<CardBody>` |
| `AccountDetailsTab.tsx:79-91` | same pattern with `HEADING` | same mapping; the `HEADING` constant becomes `TYPE.title` for the `h2` and `TYPE.label` for the `h3`s (lines 111, 135) |
| `AccountDetailsTab.tsx:94,115` | `text-[13px] text-danger` | `text-danger-ink`; retry buttons `` `${QUIET} border border-line` `` → `BUTTON` |
| `AccountDetailsTab.tsx:110,134`, `CustomerFacts.tsx:78`, `AccountDetails.tsx:216` (done in Task 7) | `border-t border-line-subtle px-3 pt-3 pb-4` | `border-t border-line-subtle px-4 py-4` (these are the card's sections; keep the `section` element and its `aria-labelledby`) |
| `CustomerFacts.tsx:34,48` | `font-mono-brand tabular-nums` | `NUM` |
| `CustomerFacts.tsx:79` | uppercase `h3` | `TYPE.label` |
| `CustomerFacts.tsx:84,85` | `text-danger`; `` `${QUIET} border border-line` `` | `text-danger-ink`; `BUTTON` |
| `CustomerFacts.tsx:90-93`, `AccountDetailsTab.tsx:101-103,122-125` | hand-made pulse bars | `<LoadingState label={…same label…} variant="block" />` (the `role="status"` and its name stay, now as the sr-only label) |
| `HealthBreakdown.tsx:48` | `<section id aria-label className="rounded-xl bg-surface p-3">` | `<Card as="section" id={id} aria-label={label}>` (pad `md`) |
| `HealthBreakdown.tsx:23`, `AccountPulseBreakdown.tsx:23,48` | `font-mono-brand tabular-nums` | `NUM` |
| `HealthBreakdown.tsx:50` | `text-[13px] text-danger` | `text-danger-ink` |
| `AccountsSection.tsx:50` (`Num`) | `font-mono-brand tabular-nums text-ink` | `` `${NUM} text-ink` `` |
| `AccountsSection.tsx:217-222` | `rounded-xl bg-surface` section, uppercase `h2`, Add `QUIET` | `<Card as="section" pad="none" aria-labelledby={headingId}><CardHeader id={headingId} title="Accounts" action={<button type="button" onClick={onAdd} className={QUIET}><Plus …/>Add account</button>} />` (the name stays "Add account") |
| `AccountsSection.tsx:146` row `li` | `px-3 py-2.5` | `px-4 py-3`; line 150 link `text-[13px] font-semibold text-ink` → `TYPE.body` + `font-semibold`; 154 and 159 `text-[11px] text-ink-muted` → `TYPE.meta`; 163 overdue `text-danger` → `text-danger-ink`; 177 `text-[13px] text-ink-muted` → `TYPE.bodyMuted`; 179 Edit `` `${QUIET} self-start` `` with only an icon → `` `${ICON_BUTTON} self-start` `` (keeps `aria-label`) |
| `AccountsSection.tsx:229-235` | hand-made skeleton | `<LoadingState label="Loading accounts" />` |
| `AccountsSection.tsx:240-244` | error | `<UiErrorState message={error} onRetry={onRetry} />` |
| `AccountsSection.tsx:256-259` | "No accounts yet" left-aligned title and line | `<UiEmptyState title="No accounts yet" detail="Accounts connected to this organization appear here, each with its owner and pulse." />` |
| `shared/CustomObjectsTab.tsx` | `LIST`, `META`, `ROW_ACTION`, `SECTION_HEADING`, `ListSkeleton`, legacy `EmptyState`/`ErrorBlock`, `SummaryLine` | per object type one `ListCard` with `CardHeader title={type name} meta={<SummaryLine as="span" … />}`; rows: the existing `li`s with `px-4 py-3` and `TYPE.meta` for `META`; `ROW_ACTION` → `ICON_BUTTON`; `SECTION_HEADING` → the `CardHeader`; `ListSkeleton` → `ListCard state={<LoadingState …/>}`; empty and error → ui `EmptyState`/`ErrorState` inside the card (the "No Salesforce.com records yet." line becomes the empty state's title); its `BUTTON`/`PRIMARY`/`QUIET` imports move to `'../ui'` |

- [ ] **Step 1: Write the failing tests**

Append to `src/components/organizations/detail/AccountsSection.test.tsx` (reuse its helpers):

```tsx
  it('is one card titled Accounts, with its states inside it', () => {
    renderSection({ accounts: [] });
    const card = screen.getByRole('region', { name: 'Accounts' });
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(screen.getByRole('heading', { level: 2, name: 'Accounts' })).toHaveClass('text-[15px]');
    expect(within(card).getByText('No accounts yet')).toHaveClass('text-[15px]', 'font-semibold');
    expect(within(card).getByRole('button', { name: /Add account/ })).toBeInTheDocument();
  });
```

Append to `src/components/organizations/detail/CustomerFacts.test.tsx`:

```tsx
  it('titles its section in sentence case and sets the CSAT figures in the body font', () => {
    renderFacts();
    expect(screen.getByRole('heading', { level: 3 }).className).not.toMatch(/uppercase/);
    expect(document.querySelector('[data-count]')).toHaveClass('tabular-nums');
    expect(document.querySelector('.font-mono-brand')).toBeNull();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/detail/AccountsSection.test.tsx src/components/organizations/detail/CustomerFacts.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the table above.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations/detail src/components/accounts/detail src/components/shared src/pages/organizations src/pages/accounts src/pages/settings/CustomObjectsPage.test.tsx src/pages/customObjects`
Expected after updates (keep intent): PASS.

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/DetailsTab.tsx src/components/organizations/detail/AccountsSection.tsx \
  src/components/organizations/detail/CustomerFacts.tsx src/components/organizations/detail/HealthBreakdown.tsx \
  src/components/accounts/detail/AccountDetailsTab.tsx src/components/accounts/detail/AccountPulseBreakdown.tsx \
  src/components/shared/CustomObjectsTab.tsx src/components/organizations/detail/AccountsSection.test.tsx \
  src/components/organizations/detail/CustomerFacts.test.tsx
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): Details and Custom objects as cards with sections

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Knowledge flattened (no card in a card)

**Files:**
- Modify: `src/components/organizations/detail/KnowledgeTab.tsx`, `src/components/organizations/{CompanyViewTab,AccountBriefPanel,QuestionsPanel}.tsx`, `src/components/organizations/activity/HeadlinesTab.tsx`, `src/components/shared/OwnerTile.tsx`
- Test (update): `src/components/organizations/{CompanyViewTab,AccountBriefPanel,QuestionsPanel}.test.tsx`, `src/components/shared/OwnerTile.test.tsx` (if present), `src/components/organizations/detail/otherTabs.test.tsx`, `src/pages/organizations/Details.test.tsx`, `src/components/accounts/detail/AccountDetailsTab.test.tsx`

**Interfaces:**
- Consumes: `Card`, `CardHeader`, `CardBody`, `CardSection`, `CardFooter`, `FilterChipRow`, `FilterChip`, `Select`, `Badge`, `EmptyState`, `ErrorState`, `LoadingState`, `PRIMARY`, `BUTTON`, `QUIET`, `ICON_BUTTON`, `INPUT`, `TYPE`, `NUM` (Task 2).
- Produces: no new names. `OwnerTile`'s `plain` prop keeps its meaning (a row inside a card); the tinted tile variant (`plain` false) is restyled neutral.

Why: spec §4.1 (decision 1, no card in a card; Knowledge's `border-line-subtle shadow-sm px-5 py-4` cards named in §9.1), §7 (department tags neutral: audit S8; open questions neutral), §5.5 (selects, inputs), audit S1 (14px bold titles, 12.5px buttons, 12px selects), §2 (no em dash in copy).

Target structure of the Knowledge tab (`KnowledgeTab` → `CompanyViewTab embedded` → panels), top to bottom, each a single `Card pad="none"`, `flex flex-col gap-4` between them:

1. **Account brief** (`AccountBriefPanel`): `CardHeader title="Account brief" meta={updated line}` with `action` = the Write/Rewrite button as `BUTTON` (one primary per form: the brief has no form until a gap is answered). The brief's `Lines` blocks and Stakeholders: `CardBody`, each sub-heading `h3` `TYPE.label` (was `text-[10.5px] font-bold uppercase`); lists `TYPE.body`; "Written from" sources: neutral `Badge`s inside links (`<a … className={`${FOCUS} rounded-full`}><Badge>…</Badge></a>`), the source type in the badge text (`{source.type} · {source.label}`, no uppercase 9.5px). Gaps (`Gaps`): a `CardSection` (`border-t`) with `h3 TYPE.label` "What we cannot answer" (keep its text), rows `divide-y`, answer `textarea` `INPUT` + `resize-y min-h-20 py-2`, Save `PRIMARY`, Cancel `QUIET`, dismiss `ICON_BUTTON`. Loading: `LoadingState variant="block"`; errors `text-danger-ink` lines with `QUIET` retry.
2. **Who answers** (the `section` at `CompanyViewTab.tsx:96`): `CardHeader title={`Who answers for ${accountName ?? customerName}`} meta={accountName ? `knowledge of ${customerName}` : undefined}` (the `Users` icon and `text-accent` go); body: the owner row (`OwnerTile plain`) then the owners grid `grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3` of `Select labelPosition="above"` per function (label `r.function_display`, options "Nobody yet" + members), or, without `canAssign`, a `dl` of label (`TYPE.meta`) and name (`TYPE.body font-semibold`); the per-function bordered boxes (`border border-line-subtle rounded-lg px-3 py-2`) and their `text-[10px] uppercase` labels go.
3. **Questions** (`QuestionsPanel`): `CardHeader title={`Questions about ${customerName}`} meta={open.length ? <><span className={NUM}>{open.length}</span> open</> : undefined}` (neutral, was `text-warning`); the ask form in `CardBody`: `textarea` `INPUT` (`py-2`), "Who should answer" `Select labelPosition="inline"`, Ask `PRIMARY` (was `bg-accent … text-[12px] font-bold disabled:opacity-50`); the list `ul divide-y divide-line-subtle border-t border-line-subtle` (no per-question boxes, no warning tint); each question's status `<Badge tone={isOpen ? 'neutral' : 'success'}>{q.status_display}</Badge>` (was uppercase coloured text); the answer quote `border-l-2 border-line pl-3 TYPE.bodyMuted` (was `border-success/40`); the answer form label `TYPE.label` (was uppercase), `textarea` `INPUT`, Answer `PRIMARY`; "No questions yet." `EmptyState size="inline"`.
4. **What we know** (the contributions `section` at `CompanyViewTab.tsx:152`): `CardHeader title="What we know"`; the form in `CardBody` (label `TYPE.label`, `textarea` `INPUT py-2`, the visibility note `TYPE.meta`, Add `PRIMARY`); the function filter `FilterChipRow label="Filter by function"` of `FilterChip`s (`label={FUNCTION_LABELS[k]}`, `count={counts[k]}`, "All" with `rows.length`) in a `CardSection`; the list `ul divide-y` in the card; each contribution `li px-4 py-3` with `<Badge>{row.function_display}</Badge>` (neutral: `FUNCTION_TONE` deleted), author `TYPE.body font-semibold`, date `TYPE.meta` with the figure in `NUM`, Remove `QUIET` (`hover:text-danger-ink`); body `TYPE.body whitespace-pre-wrap`. Empty: `EmptyState size="inline"` with the copy below.
5. **Headlines** (`KnowledgeTab` + `HeadlinesTab embedded`): `KnowledgeTab` drops its uppercase `h2` and section wrapper; `HeadlinesTab` (both modes) renders `Card pad="none"` with `CardHeader title="Headlines" action={regenerateButton}` (Regenerate as `QUIET` with `RefreshCw` `motion-safe:animate-spin` while running, not `text-accent font-bold`); groups as `CardSection`s headed `TYPE.label` (was a grey pill); each headline a `div` row in a `divide-y` stack (no `HeadlineCard` box, no `shadow-sm hover:shadow-md`), title `TYPE.body font-semibold` (was `text-[14.5px] font-extrabold … group-hover:text-accent`), status dot + `TYPE.meta`, summary `TYPE.bodyMuted`, sources/period `TYPE.meta`, "Read more" `QUIET`; loading `LoadingState variant="block"`; error `ErrorState`; empty `EmptyState title="No headlines yet" action={regenerateButton}`; the regenerate error a one-line `role="alert"` `text-danger-ink`.

`OwnerTile.tsx`: the tinted variant `border border-accent/30 bg-accent-dim/40 rounded-lg px-3 py-2` becomes `border-t border-line-subtle pt-3` like `plain` (no tinted box inside a card); its uppercase title (`text-[11px] font-semibold uppercase tracking-wider …`) → `TYPE.label`; `CONTROL` selects/inputs → `Select`/`INPUT`; `text-danger` → `text-danger-ink`.

Copy with an em dash that these lines carry (they change, so the dash goes):
- `CompanyViewTab.tsx:167` placeholder → `"A fact, a risk or a change a colleague or the Copilot should know"`
- `CompanyViewTab.tsx:190` empty line → `"Nothing here you can see yet. What your team, your reports and leadership write about this customer appears here."`
- `QuestionsPanel.tsx:59` placeholder → `"Ask someone: pick a person below, or @mention them"`
- `AccountBriefPanel.tsx:157` `<span className="text-ink-muted"> — {person.cares_about}</span>` → `<span className="text-ink-muted">: {person.cares_about}</span>`

Placeholders above 24 characters are fine here: these are `textarea` prompts, not search fields (spec §5.5's limit is for `SearchInput`).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/organizations/CompanyViewTab.test.tsx` (reuse its store/render helper):

```tsx
  it('draws flat cards: no card inside another, no shadow, neutral function tags, sentence-case titles', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderCompanyView({ embedded: true });
    await screen.findByRole('heading', { level: 2, name: /^Who answers for/ });
    expect(errors).not.toHaveBeenCalledWith('Card inside Card');
    const cards = document.querySelectorAll('.rounded-xl.border-line.bg-surface');
    for (const card of cards) expect(card.querySelector('.rounded-xl.border-line.bg-surface')).toBeNull();
    expect(document.querySelector('[class*="shadow-sm"], [class*="shadow-md"]')).toBeNull();
    expect(document.querySelector('.uppercase')).toBeNull();
    for (const tag of document.querySelectorAll('li .rounded-full')) expect(tag).toHaveClass('bg-subtle', 'text-ink-muted');
    errors.mockRestore();
  });
```

Append to `src/components/organizations/QuestionsPanel.test.tsx`:

```tsx
  it('counts open questions in neutral ink and marks each status with a badge', async () => {
    renderQuestions({ questions: [OPEN_QUESTION, ANSWERED_QUESTION] });
    expect(await screen.findByText('open')).not.toHaveClass('text-warning');
    expect(screen.getByText(OPEN_QUESTION.status_display)).toHaveClass('rounded-full', 'bg-subtle');
    expect(screen.getByText(ANSWERED_QUESTION.status_display)).toHaveClass('bg-success-dim', 'text-success-ink');
    expect(screen.getByRole('combobox', { name: 'Who should answer' })).toHaveClass('min-h-11');
  });
```

(`renderCompanyView`, `renderQuestions`, `OPEN_QUESTION`, `ANSWERED_QUESTION` stand for each file's helpers and fixtures; add fixtures if the file has none, shaped like the slice's `Question`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/organizations/CompanyViewTab.test.tsx src/components/organizations/QuestionsPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the structure above. Imports from `'../ui'` (`components/organizations/*.tsx`), `'../../ui'` (`activity/`, `detail/`), `'../ui'` (`shared/`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/organizations src/components/shared src/components/accounts/detail src/pages/organizations src/pages/accounts`
Expected after updates (keep intent): PASS. Typical updates: headings found by the new sentence-case titles ("Who answers for Uber", "What we know", "Headlines", "Account brief"); the function filter chips are `aria-pressed` buttons named "Sales 2" (label and count) instead of "Sales (2)"; the owners' selects keep their names (`${function_display} owner` was the `aria-label`; it is now the visible label of `Select`, so `getByRole('combobox', { name: 'Sales owner' })` becomes `{ name: 'Sales' }` unless you pass the old name as `label`: pass `label={`${r.function_display} owner`}` to keep the tests' names).

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/organizations/detail/KnowledgeTab.tsx src/components/organizations/CompanyViewTab.tsx \
  src/components/organizations/AccountBriefPanel.tsx src/components/organizations/QuestionsPanel.tsx \
  src/components/organizations/activity/HeadlinesTab.tsx src/components/shared/OwnerTile.tsx \
  src/components/organizations/CompanyViewTab.test.tsx src/components/organizations/QuestionsPanel.test.tsx
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): Knowledge as flat cards with neutral tags

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Contacts joins the toolbar; list and profile on the primitives

**Files:**
- Create: `src/components/contacts/ContactsTiles.tsx`, `src/components/contacts/ContactsTiles.test.tsx`
- Modify: `src/components/contacts/{ContactsToolbar,ContactList,ContactListItem,ContactProfile,HistoryItems}.tsx`, `src/pages/contacts/ContactsPage.tsx`
- Test (update): `src/components/contacts/{ContactsToolbar,ContactList,ContactListItem,ContactProfile,HistoryItems}.test.tsx`, `src/pages/contacts/ContactsPage.test.tsx`, `src/pages/contacts/ask/contactsAsk.test.tsx`

**Interfaces:**
- Consumes: `Toolbar`, `SearchInput`, `Select`, `Tile`, `tileRow(4, 'container')`, `ListCard`, `ListRow`, `Card`, `CardHeader`, `CardBody`, `CardSection`, `LoadingState`, `EmptyState`, `ErrorState`, `Badge`, `SentimentBadge`, `Initials`, `IconChip`, `Menu`, `ROW_ACTIONS`, `ICON_BUTTON`, `BUTTON`, `PRIMARY`, `DANGER`, `QUIET`, `NUM`, `TYPE`, `NO_VALUE` (Tasks 1, 2); `TITLE_CONTROL` (Task 9); `readingBadge` (Task 10); `PageHeader` (Task 3).
- Produces: `ContactsTiles({ summary })`; `ContactsToolbar` gains `count: string` and loses `summary`.

Why: spec §5.6 (Contacts joins the one toolbar), §4.3 (the page summary as tiles, like Organizations and Accounts: audit "a third style of page summary"), §4.2, §7 (sentiment is the row's one semantic badge), §3 (audit S7: "set by hand" in mono, mono initials and phone), audit S10 (the name squeezed by Edit and Delete on phones).

`ContactsTiles.tsx`:

```tsx
import type { ContactsSummary } from '../../features/contacts/contactsTypes';
import { NO_VALUE, NUM, Tile, tileRow } from '../ui';

/** The Contacts summary (spec 2026-09-28 §3) as four tiles, the shape the
 *  Organizations and Accounts pages use (UI foundations spec §4.3). */
export function ContactsTiles({ summary }: { summary: ContactsSummary }) {
  const positive = summary.total ? Math.round((summary.positive / summary.total) * 100) : 0;
  const growth = summary.growth_30d_pct;
  return (
    <div className="@container">
      <div className={tileRow(4, 'container')}>
        <Tile label="People" value={summary.total} meta={summary.active !== undefined ? <><span className={NUM}>{summary.active}</span> active</> : undefined} />
        <Tile label="Decision makers" value={summary.decision_makers} />
        <Tile label="Sentiment" value={`${positive}%`} meta={<>positive · <span className={NUM}>{summary.negative}</span> negative</>} />
        <Tile label="Growth (30d)" value={typeof growth === 'number' ? `${growth > 0 ? '+' : ''}${growth}%` : NO_VALUE} />
      </div>
    </div>
  );
}
```

`ContactsToolbar.tsx`:

| Lines | Before | After |
|---|---|---|
| 13 `SELECT`, 15-39 local `Select` | label-above uppercase selects, `disabled:opacity-50`, 15px on phones | deleted; use ui `Select` with `labelPosition="hidden"` (the first option names each: "All organisations", "All accounts", "Any sentiment", "Any role"; the hidden labels stay "Organisation", "Account", "Sentiment", "Role", so the accessible names do not change) |
| 141-142 | `SummaryLine` above the toolbar | removed (the page renders `ContactsTiles`; the props type drops `summary`) |
| 143-191 | hand-made layout | `<Toolbar search={<SearchInput label="Search people" placeholder="Search people" value={text} onChange={setText} />} count={count} filters={<>{the four Selects}</>} actions={{ secondary: onSaveAsSegment ? [{ key: 'segment', label: 'Save as segment', onSelect: onSaveAsSegment }] : [], primary: <button type="button" onClick={onAdd} className={PRIMARY}><Plus className="h-4 w-4" aria-hidden="true" />Add person</button> }} />` |

Each select's `options` array is built from the same values the `<option>`s list today (`[{ value: '', label: 'All organisations' }, ...organisations.map((o) => ({ value: String(o.id), label: o.name })), ...(orgMissing ? [{ value: params.customer, label: orgLabel }] : [])]`, and so on). The Add button reads "Add person" (sentence case with its object; was "Add"): update the tests that click "Add".

`ContactListItem.tsx` (whole component):

```tsx
export function ContactListItem({ contact, to, selected }: { contact: Contact; to: string; selected: boolean }) {
  const place = placeLabel(placeOf(contact));
  const contacted = contact.last_contacted_at ? `Contacted ${formatRelativeTime(contact.last_contacted_at)}` : 'Not contacted yet';
  return (
    <ListRow
      dataAttrs={{ 'data-contact': contact.id }}
      title={contact.name}
      href={to}
      selected={selected}
      leading={<Initials text={initials(contact.name)} />}
      meta={[contact.role_display, place, callsLabel(contact), contacted, contact.status === 'inactive' ? 'Inactive' : null].filter(Boolean).join(' · ')}
      trailing={<SentimentBadge value={contact.sentiment}>{SENTIMENT_LABEL[contact.sentiment]}</SentimentBadge>}
    />
  );
}
```

`to` becomes a `string` (`ListRow.href` is a string): `ContactsPage.linkFor` returns `` `/contacts/${personId}${suffix}` ``; `ContactList`'s `linkFor` prop type is `(id: number) => string`. The `actions` prop is dropped (no caller passes it: confirm with `grep -rn "ContactListItem" src`). The selected row is marked by `ListRow` (`bg-subtle`, `aria-current="true"` on the link; was `aria-current="page"`: update that test). `SENTIMENT_TEXT`/`SENTIMENT_DOT` imports go if unused. `callsLabel` text ("12 calls", "set by hand") stays words in the meta line: no mono (audit S7).

`ContactList.tsx`: `<ListCard label="People" state={…}>{rows}</ListCard>` with `state` = `<UiErrorState message={error} onRetry={onRetry} />` / `<LoadingState label="Loading people" count={6} />` / ui `EmptyState` (same titles and details; Clear filters `BUTTON`); `MoreButton` stays under the card. In the two-pane layout the list pane (`data-pane="list"`) keeps its own scroll; the `ListCard`'s `overflow-hidden` keeps the selected row's tint inside the card's radius (audit "the selected row pokes past the corner").

`ContactProfile.tsx`:

| Lines | Before | After |
|---|---|---|
| 20-36 `Section` | uppercase `h3` with a mono count; `ul divide-y`; "The newest N of M." | `<CardSection>` holding `` <h3 id={id} className={`flex items-baseline gap-2 ${TYPE.label}`}>{title} <span className={`${TYPE.meta} ${NUM}`}>{count}</span></h3> ``, the empty line `` <p className={`py-2 ${TYPE.bodyMuted}`}>{empty}</p> ``, the list `ul divide-y divide-line-subtle`, and "The newest …" as `TYPE.meta` with the figures in `NUM` (keep the `section` + `aria-labelledby` inside `CardSection`: `<CardSection><section aria-labelledby={id}>…</section></CardSection>`) |
| 84-90 load error | `rounded-xl bg-surface` + `` `${QUIET} border border-line` `` | `<Card pad="none"><UiErrorState message={…} onRetry={() => setAttempt((n) => n + 1)} /></Card>` |
| skeleton (`ListSkeleton` use) | | `<Card pad="none"><LoadingState label="Loading this person" variant="block" /></Card>` (keep the existing label text if a test reads it) |
| 101 `article` | `flex flex-col gap-5 rounded-xl bg-surface p-4` | `<Card as="article" pad="none" aria-label={contact.name}>`, the header block in `CardBody` (`flex flex-wrap items-start gap-3`) |
| 103 | mono initials | `<Initials text={initials(contact.name)} size="lg" />` |
| 107 `h2` | `break-words text-[22px] font-semibold text-ink` | `` `min-w-0 break-words ${TYPE.display}` `` |
| 108 | `text-[13px] text-ink-muted` | `TYPE.bodyMuted` |
| 142,145 phone | `font-mono-brand tabular-nums` | `NUM` |
| 149-158 Edit + Delete | `BUTTON` and `` `${BUTTON} text-danger` `` beside the name | Edit stays a `BUTTON` (`editButton` ref kept); Delete moves into a `Menu label={`More actions for ${contact.name}`} trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />} triggerClassName={`${ICON_BUTTON} border border-line`} items={[{ key: 'delete', label: 'Delete', onSelect: () => setDeleting(true), danger: true }]}` (audit S10: the name gets the room on phones) |
| 162-168 unsubscribed | a bare `section` line | a `CardSection` with the same content; the Resubscribe button stays `BUTTON` |
| 171-195 sentiment | bare `section` with a dot, "Why this sentiment?" `` `${QUIET} -ml-2 w-fit` `` indented 16px past the line above | a `CardSection`: `<SentimentBadge value={history.sentiment} />` then the reason as `TYPE.body`, the meta line `TYPE.meta`, and "Why this sentiment?" `` `${QUIET} -ml-3 w-fit` `` (aligned with the text above: audit) |
| Calls / Emails / Tickets | three `Section`s | three `Section`s as above, each a `CardSection` of the same card |

`HistoryItems.tsx`: the three items take Task 9's anatomy (`li` `group relative flex gap-3 py-3` (no `px`: inside the `CardSection`'s padding), `IconChip`, title row `flex min-w-0 items-baseline gap-2 max-sm:min-h-11`, `h4` `` `min-w-0 flex-1 truncate ${TYPE.body} font-semibold` ``, title button `TITLE_CONTROL`, `When` → `` `shrink-0 ${TYPE.meta} ${NUM}` ``, summary `TYPE.bodyMuted`, meta `` `mt-0.5 flex min-w-0 items-center gap-2 ${TYPE.meta}` ``); `Reading` → `const reading = readingBadge(record); return reading ? <Badge tone={reading.tone}>{reading.label}</Badge> : null;`; `Place` → `<Badge truncate>{label}</Badge>`; the ticket number (`font-mono-brand tabular-nums text-ink-muted`) → `CODE`-free `NUM` (`#1234` is a figure; it is not a Revenact id); the recording/source links move into `<div className={`${ROW_ACTIONS} self-start`}>` as `QUIET` links (same names).

`ContactsPage.tsx`:
- Render `{allContactsSummary ? <ContactsTiles summary={allContactsSummary} /> : <LoadingState label="Loading the summary" variant="tiles" count={4} />}` above the toolbar in both layouts (in the two-pane layout: first in the `flex min-h-0 flex-1 flex-col gap-3` column).
- `ContactsToolbar` gets `count={allContactsLoading ? '' : `${allContactsCount} ${allContactsCount === 1 ? 'person' : 'people'}`}` and no `summary`.
- `profile` when `badId` (159-161): `<Card pad="none"><UiErrorState message="Could not open this person" detail={CONTACT_NOT_FOUND} /></Card>`; when nothing is chosen (173): `<Card pad="none"><UiEmptyState title="Choose a person" detail="Their sentiment and why, and their calls, emails and tickets, show here." /></Card>`.
- Gaps: the single-column layouts `flex flex-col gap-3 pb-4` → `gap-4 pb-8`.

- [ ] **Step 1: Write the failing tests**

`src/components/contacts/ContactsTiles.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactsTiles } from './ContactsTiles';

describe('ContactsTiles', () => {
  it('shows the summary as four standard tiles, figures in tabular body figures', () => {
    render(<ContactsTiles summary={{ total: 16, decision_makers: 7, active: 12, positive: 4, negative: 2, growth_30d_pct: 0 } as never} />);
    expect(screen.getByRole('group', { name: 'People' })).toHaveTextContent('16');
    expect(screen.getByText('16')).toHaveClass('text-[22px]', 'tabular-nums');
    expect(screen.getByRole('group', { name: 'Sentiment' })).toHaveTextContent('25%');
    expect(screen.getByRole('group', { name: 'Growth (30d)' })).toHaveTextContent('0%');
    expect(screen.getByRole('group', { name: 'People' }).parentElement).toHaveClass('@min-[50rem]:grid-cols-4');
  });
});
```

(Use the real `ContactsSummary` fields; drop `as never` if the literal matches the type.)

Append to `src/components/contacts/ContactListItem.test.tsx`:

```tsx
  it('is a list row: the name opens the profile, one meta line in the body font, sentiment the one badge', () => {
    renderItem({ ...CONTACT, calls: 0 });
    const link = screen.getByRole('link', { name: CONTACT.name });
    const row = link.closest('li')!;
    expect(row).toHaveAttribute('data-contact', String(CONTACT.id));
    expect(row.querySelector('.font-mono-brand')).toBeNull();
    expect(row.querySelectorAll('.rounded-full.px-2')).toHaveLength(1); // the sentiment badge only
  });
```

Append to `src/components/contacts/ContactsToolbar.test.tsx`:

```tsx
  it('is the one toolbar: search and count first, the four filters, Save as segment, then Add person', () => {
    setViewport(1440);
    renderToolbar({ count: '16 people', onSaveAsSegment: vi.fn() });
    expect(screen.getByRole('status')).toHaveTextContent('16 people');
    for (const name of ['Organisation', 'Account', 'Sentiment', 'Role']) expect(screen.getByRole('combobox', { name })).toHaveClass('min-h-11');
    const buttons = screen.getAllByRole('button').map((button) => button.textContent?.trim());
    expect(buttons.slice(-2)).toEqual(['Save as segment', 'Add person']);
    expect(document.querySelector('.uppercase')).toBeNull();
  });
```

Append to `src/components/contacts/ContactProfile.test.tsx`:

```tsx
  it('is one card with sections; Delete waits in the More actions menu as a destructive item', async () => {
    renderProfile();
    const card = await screen.findByRole('article', { name: CONTACT.name });
    expect(card).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: `More actions for ${CONTACT.name}` }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveClass('text-danger-ink');
    expect(screen.getByRole('heading', { level: 3, name: /^Calls/ }).className).not.toMatch(/uppercase/);
  });
```

(`renderItem`, `CONTACT`, `renderToolbar`, `renderProfile` stand for each file's helpers and fixtures; `setViewport` from `src/test/viewport`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/contacts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement** the code and tables above. Imports from `'../ui'` (`components/contacts/`) and `'../../components/ui'` (`pages/contacts/`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/contacts src/pages/contacts`
Expected after updates (keep intent): PASS. Typical updates: Delete is a menu item; the selected row's `aria-current` is `"true"`; filters found by the same names (now `combobox`es with hidden labels); "Add" → "Add person"; the summary is tiles (`group` roles) instead of a line; the profile's error and empty states are inside a card.

Run: `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/components/contacts/ContactsTiles.tsx src/components/contacts/ContactsTiles.test.tsx \
  src/components/contacts/ContactsToolbar.tsx src/components/contacts/ContactList.tsx \
  src/components/contacts/ContactListItem.tsx src/components/contacts/ContactProfile.tsx \
  src/components/contacts/HistoryItems.tsx src/pages/contacts/ContactsPage.tsx \
  src/components/contacts/ContactListItem.test.tsx src/components/contacts/ContactsToolbar.test.tsx \
  src/components/contacts/ContactProfile.test.tsx
git add <each other test file Step 4 changed, by path>
git commit -m "feat(records): Contacts joins the one toolbar, tiles, list rows and a sectioned profile

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: House rules for Records, the ratchet, docs, full verification

**Files:**
- Create: `src/components/records.houseRules.test.ts`
- Modify: `src/test/uiRatchet.test.ts` (baselines), `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`
- Modify only if a rule fails: the offending Records file (fix it; the commit goes with this task)

**Interfaces:**
- Consumes: `houseRuleSuite`, `uiRuleSuite` (`src/test/houseRules.ts`), `UI_OFFENCES`, `uiOffences`.
- Produces: the Records folders under every foundations rule; lower ratchet baselines.

- [ ] **Step 1: Write the Records rule suite**

`src/components/records.houseRules.test.ts`:

```ts
import { houseRuleSuite, uiRuleSuite } from '../test/houseRules';

// The Records surface (UI foundations spec §9.2 row 1): Organizations,
// Accounts and Contacts, on every house rule and every foundations rule
// (§9.4). Out of this PR and not globbed: the create and edit modals, the
// + Add sheet forms and the other legacy activity tabs.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob(['./organizations/portfolio/**/*.{ts,tsx}', './organizations/detail/**/*.{ts,tsx}'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['./organizations/CompanyViewTab.tsx', './organizations/AccountBriefPanel.tsx', './organizations/QuestionsPanel.tsx', './organizations/activity/HeadlinesTab.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('./accounts/**/*.{ts,tsx}', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['./contacts/ContactList.tsx', './contacts/ContactListItem.tsx', './contacts/ContactsToolbar.tsx', './contacts/ContactProfile.tsx', './contacts/HistoryItems.tsx', './contacts/ContactsTiles.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['./shared/CustomObjectsTab.tsx', './shared/OwnerTile.tsx', './canvas/MapsTab.tsx', './canvas/MapRow.tsx'], { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob(['../pages/organizations/**/*.tsx', '../pages/accounts/**/*.tsx', '../pages/contacts/**/*.tsx', '!../pages/organizations/AccountFormModal.tsx'], { query: '?raw', eager: true, import: 'default' })),
};

// Shared legacy parts other surfaces still import with their old look,
// named one by one (spec §9.4: exemptions are files, not patterns). Each
// owning surface PR removes its line: tileParts (Pipelines, Brain,
// Segments, Surveys tiles), listStyles (Canvas, Segments, shared tabs).
const LEGACY = {
  tileParts: './organizations/portfolio/tileParts.tsx',
  listStyles: './organizations/detail/listStyles.ts',
};

houseRuleSuite('Records: house rules', files);
uiRuleSuite('Records: foundations rules', files, {
  uppercase: [LEGACY.tileParts, LEGACY.listStyles],
  shadows: [LEGACY.tileParts],
});
```

Notes for the executor:
- `houseRuleSuite` fails on glass: the Ask rail lives in `pages/dashboard/ask/`, not in these globs, so Records files must hold no `rv-card-glass`/`backdrop-blur` (they do not today).
- The `.test.` filter inside the suites skips tests; `*.ts` helpers (hooks, `rowColumns.ts`, `filterCount.ts`) are scanned for sizes and colours too, which is fine.
- `uiRuleSuite`'s exemptions take the glob's keys exactly (`./organizations/...` from this file's folder).

- [ ] **Step 2: Run it and fix every offender in a Records file**

Run: `npx vitest run src/components/records.houseRules.test.ts`
Expected: PASS. If a rule fails, the message lists `file: offence`. Fix the file by the conversion rules (it belongs to one of Tasks 4 to 13; this is the safety net). Add a file to `LEGACY` only when it is imported by a surface this PR does not migrate and fixing it would change that surface; say which surface in the comment. Never exempt a Records-only file.

- [ ] **Step 3: Lower the ratchet**

Run: `npx vitest run src/test/uiRatchet.test.ts`
Expected: "keeps every baseline tight" fails, printing the measured totals (each `has no more … than the baseline` must pass: if one fails, a change raised an offence: find it with the test's "worst files" message and fix it). Write the measured totals into `BASELINE` and rerun: PASS. Each of `sizes`, `cards`, `shadows`, `opacityDisabled`, `mono`, `bold` must be lower than before this PR (before = the baseline on the branch after rebasing onto #128, or `1110 / 217 / 197 / 110 / 107 / 662` if #128 is not in yet); record before and after in the commit body.

The ~3 clickable cards the ratchet's focus-visible exemption hides (`CONTROL_MARK` skips class strings holding `focus-visible:`/`focus-within:`) are `pages/copilot/HomeView.tsx` (suggestion card), `pages/copilot/ChatView.tsx` (composer) and `pages/communications/BucketTiles.tsx`: none is in a Records folder, so this PR does not lower `cards` for them; note them in the commit body for the Dashboard/Copilot and Communications PRs.

- [ ] **Step 4: Product docs**

`docs/03-ui-ux-design.md`: in the section the foundations PR added about the primitives, add a "Records surface (2026-10-09)" paragraph: Organizations, Accounts and Contacts use `PageHeader` (in the Navbar's title slot), `Toolbar`, `Tile` rows (container-sized; Lifecycle in its own card), `ListCard`/`ListRow` (portfolio rows on a 60rem grid with column labels), board cards on `Card` with their buttons on hover, the Story and Calls in day cards with rows of one height, Knowledge as flat cards, the detail tiles on one anatomy; badges only for real status (signal: overdue and risk red, ticket counts neutral). `docs/04-app-flow.md`: where it describes the top bar, say that on the Records routes the page draws its own title, Back link and List | Board tabs through `PageHeader` into the Navbar's title slot (`NavActionsSlotContext.titleSlot`), and that the frames sit at the bar's 16px edge. No em dashes in added lines.

- [ ] **Step 5: Full checks and the after set**

Run: `npm run lint` (expected: clean), `npm run build` (expected: success), `npm test` (expected: every file passes).

Start Vite as in Task 1 Step 1, then:

```bash
node scripts/ui-shots.mjs --label after \
  --seed ../../revenact-backend/services/accounts/management/commands/seed_demo.py \
  --cli node_modules/.bin/playwright-cli \
  /organizations/list /organizations/board /organizations/19 "/organizations/19?tab=details" "/organizations/19?tab=people" \
  "/organizations/19?tab=maps" "/organizations/19?tab=deals" "/organizations/19?tab=knowledge" "/organizations/19?tab=files" \
  /accounts/list /accounts/board /accounts/4 "/accounts/4?tab=details" "/accounts/4?tab=objects" /contacts /contacts/11
```

Expected: 68 paths, `/__ui` first; no layout or console problem that was not in the before list (the gallery must report none). Read each before/after pair (desktop and phone, light and dark) with the Read tool and check against the spec:
- one card standard, no shadows on cards or rows, no card inside a card (Knowledge, Details, profile);
- at most the four sizes and two weights; figures in the body font;
- the title and the content share the 16px left edge; on phones the List | Board tabs sit on the bar's second row and nothing overlaps them;
- portfolio rows one height, columns aligned with labels from a 60rem column; the "N open tickets" signal neutral, overdue and risk red;
- tiles one anatomy per row (Health, NPS, Accounts · ARR, Renewing; detail Health, ARR, Renewal, Pulse); Lifecycle in its own card;
- board names not truncated by always-visible buttons; buttons appear on hover;
- Story and Calls rows even, the time on the title line, no "Organization" pill on an organisation's own items, Ask about this on hover;
- Contacts: tiles, one toolbar, list rows with one badge, the profile one card with sections, the name not squeezed on phones;
- dark mode: card borders visible on the canvas, badges readable on their tints, the health ring's track visible.
Fix any miss in the task that owns the file (its own commit), then rerun the affected tests and the screenshots of that route.

- [ ] **Step 6: Rebase onto main after #128 and #129 merge**

When both are merged:

```bash
git fetch origin
git rebase origin/main
```

Expected conflicts: none in files #128 and this PR share if the branch already held #128 (it should, by Tasks 3, 4 and 7's precondition); otherwise in `Navbar.tsx` (keep #128's `PHONE_UNWRAP`/`PHONE_TABS` on the remaining branches and this PR's title slot in place of the Records branches), `Navbar.test.tsx` (keep #128's phone tests minus the three Records rows), `rowParts.tsx` (keep `shown`, this PR's classes), `BoardCard.tsx` (keep #128's wrapping figures line inside this PR's `Card`), `PortfolioBoard.tsx` (keep both), `Board.test.tsx` (this PR's `[data-part="arr"]` lookup). Then rerun `npm test`; if the ratchet's tight test reports new totals, set `BASELINE` to them in a commit `test(ui): re-record the UI ratchet after rebasing the Records PR` (body: which counts moved and why). Rerun lint, build and the after screenshots.

- [ ] **Step 7: Commit**

```bash
git add src/components/records.houseRules.test.ts src/test/uiRatchet.test.ts docs/03-ui-ux-design.md docs/04-app-flow.md
git add <each Records file Step 2 fixed, by path>
git commit -m "test(records): hold the Records surface to the foundations rules and lower the ratchet

Ratchet before -> after: sizes A -> a, cards B -> b, shadows C -> c,
opacityDisabled D -> d, mono E -> e, bold F -> f. The clickable cards
the focus-visible exemption hides (Copilot HomeView and ChatView,
Communications BucketTiles) are outside Records and stay for their PRs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Replace the letters with the measured numbers.)

- [ ] **Step 8: Hand off**

Do not push. Report: the commit list, test/lint/build results, the before/after screenshot paths for the PR body (per route: desktop and phone, light and dark, and `/__ui`), the layout problems the runner reported before and after, and the ratchet numbers.

---

## Not in this PR (noted for later rounds)

- `RecordPlans` (the Plans card above the tabs on every detail page, audit S6): plans folder, Impact PR.
- The create/edit modals and the `+ Add` sheet forms (`activity/*`, shared with Work): forms round.
- Pipelines' use of `ChipRow`, `ToolbarSearch`, `ToolbarActions`, `tileParts` `Tile`/`Switch`/`TileButton`, `BoardLayout`'s phone column chips and the non-framed `PagedSections`: Pipelines PR (surface 2).
- `listStyles.ts`, `ListParts` `ListSkeleton`, `DetailTabs.tsx`: still used by Canvas gallery, Segments, Campaigns, Scenarios, Surveys (Impact PR).
- Audit items outside the spec's Records row: the Details "contract end before renewal" data warning, the WebSocket token in the URL (`lib/socket.ts`), task due dates in ISO in the Story.
