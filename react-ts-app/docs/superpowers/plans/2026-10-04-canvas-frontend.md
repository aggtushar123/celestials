# Canvas: live stakeholder maps (frontend, delivery 6 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the stakeholder maps on the backend's new contract: a **Maps** tab on the organisation and account pages with a New map dialog (from the record's people or blank), the map editor at `/canvas/:id` (live person facts on every node, the record's open plans in a strip, lines with one of four labels, a ⋯ menu on every node so every edit works without dragging, a person panel, a "Not on the map" tray, optimistic-concurrency Save with a 409 Reload, Delete for the creator and their managers, a leave-with-unsaved-changes prompt), a read-only People view on phones, and the `/canvas` gallery with search and Show more.

**Architecture:**
- **`src/features/canvas/` (new, pure, unit-tested):** the §4 contract types (`canvasTypes.ts`), limits, labels and sentences (`canvasOptions.ts`), display text (`canvasText.ts`), the board model on React Flow's types (`canvasBoard.ts`: server map ⇄ flow, write body, dirty check, next free grid spot, add/remove person, add/relabel/remove line, the tray), refusals (`canvasErrors.ts`), URL bits (`canvasParams.ts`), the API (`canvasApi.ts`), fixtures (`testCanvasFixtures.ts`) and a stateful contract stub (`testCanvases.ts`, `stubCanvases`). No Redux: as Segments, Surveys, Rules, Plans and Campaigns, pages read through small hooks. The old canvas thunks and state in `customersSlice.ts` are deleted (Task 9).
- **`src/components/canvas/` (new):** `MapRow`, `RelativeTime`, `useRecordMaps`, `MapsTab`, `NewMapDialog`; the facts (`facts.tsx`), `PersonCard`, `EdgeLabelMenu`; the editor's `useMap`, `MapContext`, `MapHeader`, `OpenPlansStrip`, `PersonNode`, `RelationshipEdge`, `MapBoard`, `NodeMenu`, `AddRelationshipDialog`, `PersonPanel`, `NotOnMapTray`, `useUnsavedGuard`, `PeopleList`; `houseRules.test.ts`.
- **`src/pages/canvas/` (rebuilt):** `CanvasPage.tsx` (the gallery, rewritten), `MapEditor.tsx` (new), `testPages.tsx`. `CanvasEditor.tsx`, `ContactNode.tsx`, `CanvasEdge.tsx`, `CanvasSidebar.tsx`, `NewCanvasModal.tsx` and their tests are deleted.
- **Elsewhere (modify):** the organisation page's tabs (`detailParams.ts`, `pages/organizations/Details.tsx`), the account page's tabs (`accountPageParams.ts`, `pages/accounts/Details.tsx`), their test stubs, `App.tsx`, `Navbar.tsx`, `DashboardLayout.tsx`, `customersSlice.ts`; `components/accounts/detail/CanvasesTab.tsx` and `components/shared/CanvasListTab.tsx` are deleted.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, react-router 7 (`BrowserRouter`, not a data router), `@xyflow/react` 12, lucide-react, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-canvas-design.md`. This plan covers §0 (context), §2 (frontend) and §4 (the API contract, binding; field names used exactly). §1 is the backend, read for behaviour the stub must mirror (validation §1.1, who may delete §1.2, live facts and node classes §1.3, new maps §1.4, routes §1.5).

**The API contract** is spec §4. The backend is planned in parallel against the same section, so every test here runs against `stubCanvases` (Task 3), never a live server. Where §4 is silent or does not fit the real frontend, the assumption is written in **Contract notes** below, to be reconciled with the backend plan.

**Branch:** `feat/canvas` in `react-ts-app`, already checked out at `a35a57c` (`main` with Campaigns #104 and the spec). Stay on it. Never push. Do not touch `revenact-backend`.

## Contract notes (assumptions to reconcile with the backend plan)

Notes marked **(backend plan, binding)** were confirmed by the Canvas backend plan against the real backend code (2026-10-04); the rest remain assumptions.

1. **The account page's list path.** §4 names `GET customers/:id/accounts/:aid/canvases/`, but the account page knows only the account (`accountBase(accountId)` in `lib/accountPaths.ts`, backend #75's flat routes). The account Maps tab reads **`GET /accounts/:aid/canvases/`**, assumed to answer the same `{results: CanvasRow[]}`. The organisation tab reads `GET /customers/:id/canvases/`, which **includes its accounts' maps (backend plan, binding)**; a row whose `record` is not the page's record shows its record's name. Maps are created only through `POST canvases/` (the nested routes answer 405).
2. **List shapes (backend plan, binding).** The old lists answered bare arrays; `GET canvases/` now answers `{results, next}` and the record lists `{results}`. `next` is an opaque cursor sent back as `?cursor=` (as Campaigns). Gallery page size 50.
3. **Roles (backend plan, binding).** `MapPerson.role` and `not_on_map[].role` are slugs (`decision_maker`, `economic_buyer`, `champion`, `influencer`, …), and both gain **`role_display`**, the label shown. The frontend shows `role_display` and never maps slugs itself. This adds a field to §4's `MapPerson` and `not_on_map` items.
4. **Sentiment (backend plan, binding).** `MapPerson.sentiment` is the slug `'positive' | 'neutral' | 'negative'`, never null; `sentiment_label` is the word shown.
5. **`last_contacted_at`** counts the reader-visible calls and emails only (meetings carry no person link; backend plan, binding), so the copy says "Contacted …" and never "met". `null` reads "Not contacted yet", in the warning tone with its icon (the spec defines only the 60+ case; Decision 12).
6. **Hidden nodes** are sent back unchanged in every PATCH (same id, position and `contact_id`); nodes already on the stored map stay allowed even if the saver can't open them (backend plan, binding).
7. **Removed nodes** are sent back unchanged until someone uses Remove from map; a node already on the stored map survives a save even though its contact was deleted (backend plan, binding). Sending `nodes` without `edges` would drop lines touching removed nodes, so the editor always sends both.
8. **PATCH always sends `{name, nodes, edges, version}`** (backend plan, binding: `version` is required, else 400; the 409 check runs before field checks), the whole map, with React Flow's keys stripped (`type`, `width`, `height`, `measured`, `selected`, `dragging`, `deletable`, `draggable`, `data` on edges); the stub refuses any extra key so a leak fails a test. Reads return nodes as `{id, position, data: {contact_id}}` and edges as `{id, source, target, label}` (a missing label reads `""`); the frontend adds React Flow's `type` itself (`toFlow`).
9. **Ids made in the browser:** a node added here is `c<contact_id>` (then `c<contact_id>-2`, `-3`… if taken); a line is `e-<source>-<target>` (then `-2`…). Both stay within 64 characters for any id the server makes.
10. **409** is `{code: 'CANVAS_CHANGED', detail}`; the banner shows the spec's sentence (`SAY.CHANGED`), which equals the server's `detail`. **403** on DELETE shows its `detail` in the confirm dialog. **404** on `GET canvases/:id/` shows "This map doesn't exist or isn't shared with you."
11. **400 refusals** are `{field: [message]}`; the summary lists `name`, `nodes`, `edges`, then `non_field_errors` and any other key, first message of each. A `detail` string (403/429) is listed too.
12. **POST** sends `customer` or `account` (backend plan, binding; the old editor sent `customer_id`/`account_id`). Bad input is 400; a record the caller can't open is 404, shown as the dialog's form-level refusal. The 201 answer is a full `Canvas`; the dialog opens `/canvas/<id>`.
13. **`CanvasRow.people`** counts every node, hidden and removed ones included (§4: "node count").
14. **People added from the tray** have only `{id, name, role}` until the next save; their card shows name and role and "Save to see their facts." The save's answer brings their facts.
15. **`open_plans`** holds the record's own open plans only (backend plan, binding: as `GET plans/?customer=`); the strip still filters with Plans' `isOpen` so a stray finished plan never shows. `latest_survey` carries no comment.
16. **`created_by`** is typed but not shown; `can_delete` alone decides whether Delete is offered, never a guess from roles (backend plan, binding: an admin who is not above the creator gets 403).

## Global Constraints

Quoted text is verbatim from the spec or `.claude/skills/revenact-design/SKILL.md` §1 and §4.

- **Commands.** Never run prettier (the repo has no config). Type-check with `npx tsc -b --noEmit`; lint changed files with `npx eslint <changed files>`; `npm run lint` must end with **15 pre-existing warnings, 0 errors**; `npm run build` must pass. Run focused tests with `npx vitest run --maxWorkers=2 <paths>`, one process at a time; run the full `npx vitest run --maxWorkers=2` before finishing (Task 10).
- **Commits** are conventional (`feat(canvas): …`, `refactor(canvas): …`, `test(e2e): …`, `docs(canvas): …`) and every message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.
- **Tokens only.** "Zero raw hex, rgb, or named colours in `src/**/*.tsx`; tokens only." Use `bg-surface`, `bg-subtle`, `bg-base`, `text-ink`, `text-ink-muted`, `border-line`, `border-line-strong`, `bg-accent`, `text-on-accent`, and the semantic `success`/`warning`/`danger` with their `-dim` tints. Inline React Flow styles use `var(--border-strong)` only. "Semantic colours carry meaning only (status, trend, severity), never decoration."
- **Both themes.** "Every colour is a token with a light value in `@theme` and a dark override". This plan adds no colour.
- **Lucide only.** "Lucide React exclusively. 16px inline, 20px standalone action, 24px section header." Every icon carries `aria-hidden="true"`; an icon-only button has an `aria-label`. "No emoji as icons."
- **Touch targets.** "a 44px touch target or `min-h-9` on desktop-only dense controls": every button, link, select and text input gets `min-h-11 sm:min-h-9` (or `h-11 w-11`), directly or through `BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, or a style constant in the same file. **The node ⋯ menu is `h-11 w-11` at every width** (spec §2.4: "44px targets (the node ⋯ menu, not the drag handles)"). React Flow's `Handle`s are drag handles and are exempt.
- **Layouts at 375 / 768 / 1024 / 1440.** "no horizontal scroll; `min-h-[100dvh]` never `h-screen`." Under 768px (`useMediaQuery(MD)` false) the editor is read-only with a People view (Task 8).
- **Type.** "at most four sizes per surface": `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]` only. "numbers and IDs in DM Mono with `tabular-nums`": people counts, days, survey scores and dates use `MONO` (`font-mono-brand tabular-nums`).
- **No card inside a card.** "Group with `border-line`, `divide-y`, or whitespace." The board is one bordered surface; nodes on it are the only cards; the panel, tray and plan strip are flat lists. No glass, no gradients.
- **No colour-only meaning.** Sentiment is a dot **and** its word; staleness is a warning icon **and** the words; Unsubscribed is an icon and the word; a line's meaning is its label's words (all lines share one neutral stroke).
- **Copy.** Sentence case; "Labels above inputs, errors below inputs, no placeholder-as-label"; **no em dashes in UI copy** (use a colon, a comma or " · ").
- **Every edit is possible without dragging** (spec §2.2): add a person (tray click), add a line (node ⋯ → Add a relationship to…), label a line (its menu, or the person panel's select), remove a line (its Remove button, the panel, or Delete), remove a person (node ⋯).
- **No animation in the editor.** "Keyboard-driven changes never animate." No `transition`, `animate-*` (skeleton pulse excepted), `duration` or `animated` in the board's files; `fitView()` is called without a duration (the house-rules suite checks it, Task 10).
- **A refusal with no field takes focus** (spec §2.2): the save summary, the 409 banner and the New map dialog's form-level error are `tabIndex={-1}` with `data-error` and get focus once, when they arrive (`useRefusalFocus`).
- **Submit once:** Create map, Save and Delete go through `useSubmitOnce` (`components/plans/useSubmitOnce.ts`); tests double-click each and count one request.
- **States.** "Every list/table/chart has designed empty, loading (skeleton matching layout, not spinner), and error states."
- **Rows, never tables.** No `<table>`, no `role="table"`/`"grid"`.
- **Never store anything in the browser** (no `localStorage`/`sessionStorage`).
- **Exact copy from the spec:** "Maps", "New map", "<Record> map", "From this record's people", "Blank", "No maps yet", "Edited by <name> · <relative time>", "Save", "Unsaved changes", "Delete", "No open plans", "Start a plan", "Contacted 12 days ago", "Not contacted in 60+ days", "NPS 9 · 3 Oct", "Unsubscribed", "Someone you can't open", "Removed contact", "Remove from map", "No label", "Reports to", "Introduced by", "Blocks", "Influences", "Open person", "Add a relationship to…", "Open contact", "Not on the map", "Someone else changed this map. Reload to see their changes.", "Reload", "People", "A reports to B", "Edit maps on a larger screen.", "Give the map a name.", "Add people from this organisation or account.", "Only the map's creator or their managers can delete it."
- **Tests** follow the `testing` skill: unit tests per module and component; page tests on the real router with `fetch` stubbed by `stubCanvases`; one jsdom journey in `src/e2e/canvas.test.tsx`; a Canvas house-rules suite reusing `houseRuleSuite` and `rowsIconsTargetsSuite`. Every test must be able to fail, and its title claims only what it asserts. Absolute fixture times are midday UTC (`…T12:00:00Z`); relative ones are built from `Date.now()` so "12 days ago" holds on any day.
- **Product documents** change in the same branch: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (Task 10).

## Decisions made while planning (the owner may overrule any)

1. **Folders.** `src/features/canvas/`, `src/components/canvas/`, `src/pages/canvas/` (rebuilt), so the house-rules suite globs them whole. The canvas thunks and state leave `customersSlice.ts`.
2. **Tab place and key.** Maps sits right after People on **both** pages (the spec places it there on the organisation page; the account page follows so the two read alike). Its key is `maps`; an old `?tab=canvases` link reads as `maps`. Maps is not an account-chip tab (the chips dim on it).
3. **No New map in the gallery.** A map belongs to one record, so maps start from a record's Maps tab. `/canvas/create` redirects to `/canvas`. The gallery's empty state says "Start one from an organisation's or account's Maps tab."
4. **Frame and title.** `/canvas` and `/canvas/:id` wear the Organizations frame (`DashboardLayout` gives them `p-0`). The Navbar reads "Canvas" (h1) on the gallery and "‹ Canvas" (a link back) on a map, as Campaigns does.
5. **Errors read "Try again"** through the house `ErrorBlock`, as every other tab (the spec says "Retry").
6. **Leaving with unsaved changes.** The app uses `BrowserRouter`, so react-router's `useBlocker` (data routers only) is unavailable. `useUnsavedGuard` catches in-app link clicks (capture phase, any link on the page, the sidebar included) and asks "Leave without saving?" ("Your changes to this map will be lost.", Leave / Cancel), and sets `beforeunload` for closing or reloading the tab. The browser's Back button is not intercepted.
7. **One neutral stroke for every line;** the label's words carry its meaning. A line with no label shows "No label" on its menu button.
8. **Add a relationship** opens a narrow `BuilderDialog` "Add a relationship" with **Person** (the other people on the map, by name; hidden and removed people are left out) and **Relationship** (the four labels, then "No label"), and a live sentence "Rosa Diaz reports to Tom Lee". The node whose menu opened it is the line's source.
9. **Tray placement.** Clicking or dropping a tray person puts them at the next free spot of the 240 × 160 grid, six to a row (spec §2.2), never at the drop point.
10. **Hidden people** have no ⋯ menu, can't be dragged or deleted, and open no panel; lines to them can still be relabelled or removed.
11. **Phones.** Under 768px: a "Map" / "People" switch (`aria-pressed`, People first and default), the note "Edit maps on a larger screen.", no tray, no Save, no ⋯ menus, no Delete, the name as plain text; the board pans and zooms only.
12. **"Not contacted yet"** for `last_contacted_at: null`, in the warning tone (Contract note 5). "Contacted today" for 0 days, "Contacted 1 day ago", "Contacted 12 days ago"; 60 days or more reads "Not contacted in 60+ days".
13. **Person panel** opens beside the board (from 768px, `w-72`) when a person's card is clicked or Open person is chosen: their facts, **Open contact** (link to `/contacts/<id>`), and **Relationships**: each line touching them as a sentence with a Relationship select and a Remove button.
14. **Board refusals** (a duplicate line, a line to oneself, 60 people, 150 lines) show in one polite status line under the header (`role="status"`), cleared by the next edit.
15. **Dates.** A survey's day reads "3 Oct" (`dayMonth`, UTC); "Edited …" uses `formatRelativeTime` ("2 days ago"), its leading number in DM Mono.
16. **After Delete** the editor goes to the record's page on the Maps tab (`/organizations/7?tab=maps`, `replace`).

## File Structure

| File | Responsibility |
|---|---|
| `src/features/canvas/canvasTypes.ts` (new) | §4's types, field for field, and the write bodies |
| `src/features/canvas/canvasOptions.ts` (new) | Labels, limits, grid, survey names, the spec's sentences (`SAY`), the board's own refusals (`CHECK`) |
| `src/features/canvas/canvasText.ts` (new) | People count, default name, role label, sentiment word, contacted line, survey line, edited by, relationship sentence |
| `src/features/canvas/canvasBoard.ts` (new) | Flow ⇄ server shapes, write body, dirty check, node kinds, people, tray, next free spot, every board edit |
| `src/features/canvas/canvasErrors.ts` (new) | Save, create and delete refusals; the missing-map sentence |
| `src/features/canvas/canvasParams.ts` (new) | Map id from the route, the gallery query |
| `src/features/canvas/canvasApi.ts` (new) | `apiFetch` wrappers for every §4 endpoint |
| `src/features/canvas/testCanvasFixtures.ts`, `testCanvases.ts` (new, test-only) | Records, people, maps, a plan; `stubCanvases` (stateful, §1.1 validation, §1.3 classes, §1.4 layout, 409, 403) |
| `src/test/reactFlow.ts` (new, test-only) | `mockReactFlow()`: React Flow's documented jsdom mocks, so nodes measure and lines render |
| `src/components/canvas/MapRow.tsx`, `useRecordMaps.ts`, `MapsTab.tsx`, `NewMapDialog.tsx` (new) | A map row; a record's maps; the Maps tab; the New map dialog |
| `src/components/canvas/facts.tsx`, `PersonCard.tsx`, `EdgeLabelMenu.tsx` (new) | A person's facts; a node's card body; a line's label menu |
| `src/components/canvas/useMap.ts`, `MapContext.ts`, `MapHeader.tsx`, `OpenPlansStrip.tsx`, `PersonNode.tsx`, `RelationshipEdge.tsx`, `MapBoard.tsx` (new) | The editor's state and save; the board's shared context; header; plans strip; React Flow node and edge; the board |
| `src/components/canvas/NodeMenu.tsx`, `AddRelationshipDialog.tsx`, `PersonPanel.tsx`, `NotOnMapTray.tsx` (new) | Edits without dragging |
| `src/components/canvas/useUnsavedGuard.ts`, `PeopleList.tsx`, `houseRules.test.ts` (new) | Leaving; the phone view; the house rules |
| `src/pages/canvas/MapEditor.tsx`, `testPages.tsx` (new); `CanvasPage.tsx` (rewrite) | The editor route; test renders; the gallery |
| `src/pages/canvas/CanvasEditor.tsx`, `ContactNode.tsx`, `CanvasEdge.tsx`, `CanvasSidebar.tsx`, `NewCanvasModal.tsx`, `CanvasEditor.test.tsx` (delete) | The old editor |
| `src/components/accounts/detail/CanvasesTab.tsx` (+test), `src/components/shared/CanvasListTab.tsx` (+test) (delete) | The old tab |
| `src/features/organizations/detailParams.ts`, `src/pages/organizations/Details.tsx`, `src/features/organizations/testStory.ts` (modify) | The organisation page's Maps tab |
| `src/features/accounts/accountPageParams.ts`, `src/pages/accounts/Details.tsx`, `src/features/accounts/testAccountPage.ts` (modify) | The account page's Maps tab |
| `src/App.tsx`, `src/components/layout/Navbar.tsx`, `src/layouts/DashboardLayout.tsx` (modify) | Routes, title, frame |
| `src/features/customers/customersSlice.ts` (modify) | Canvas thunks and state removed |

---

### Task 1: The contract types, the options and the display text

Spec §4 (types), §2.1 (row text), §2.2 (node card text), §2.2 phones ("A reports to B"); Contract notes 3, 4, 5 (`role_display`, `sentiment_label`); Decisions 12, 15.

**Files:**
- Create: `src/features/canvas/canvasTypes.ts`, `src/features/canvas/canvasOptions.ts`, `src/features/canvas/canvasText.ts`
- Test: `src/features/canvas/canvasText.test.ts`

**Interfaces:**
- Consumes: `PersonRef` (`features/segments/segmentTypes`); `PlanRow`, `RecordRef`, `RecordKind` (`features/plans/planTypes`); `dayMonth` (`features/contacts/contactsFormat`); `formatRelativeTime` (`features/customers/formatters`).
- Produces:
  - `canvasTypes.ts`: `RelationshipLabel`, `PersonRef`, `RecordRef`, `RecordKind`, `CanvasNode`, `CanvasEdge`, `SurveyType`, `LatestSurvey`, `MapPerson`, `PersonFacts` (`MapPerson & {pending?: true}`), `NotOnMap`, `CanvasRow`, `Canvas`, `GalleryPage`, `RecordMaps`, `MapStart`, `CanvasCreate`, `CanvasPatch`, `Reading`.
  - `canvasOptions.ts`: `RELATIONSHIP_LABELS`, `NO_LABEL`, `NAME_MAX` 120, `NODES_MAX` 60, `EDGES_MAX` 150, `GRID` `{x: 240, y: 160, perRow: 6}`, `STALE_DAYS` 60, `GALLERY_PAGE` 50, `SEARCH_DEBOUNCE_MS` 300, `SURVEY_LABEL`, `SAY`, `CHECK`.
  - `canvasText.ts`: `peopleText(n)`, `defaultMapName(recordName)`, `sentimentOf(person) → {reading, word}`, `Contacted`, `contacted(iso, now?) → Contacted`, `contactedText(c)`, `surveyParts(s) → {label, score, day}`, `surveyText(s)`, `editedBy(row) → {who, when}`, `editedText(row)`, `labelText(label)`, `relationshipText(source, label, target)`.

- [ ] **Step 1: Write the failing test**

Create `src/features/canvas/canvasText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  contacted,
  contactedText,
  defaultMapName,
  editedText,
  labelText,
  peopleText,
  relationshipText,
  sentimentOf,
  surveyText,
} from './canvasText';

const NOW = new Date('2026-10-04T12:00:00Z');
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('canvas display text', () => {
  it('counts people with the right noun', () => {
    expect([0, 1, 2].map((n) => `${n} ${peopleText(n)}`)).toEqual(['0 people', '1 person', '2 people']);
  });

  it('names a new map after its record, within 120 characters', () => {
    expect(defaultMapName('Pizza Hut')).toBe('Pizza Hut map');
    expect(defaultMapName(null)).toBe('New map');
    expect(defaultMapName('x'.repeat(130))).toHaveLength(120);
  });

  it("reads sentiment as the server's word, keeping the slug for the dot (Contract note 4)", () => {
    expect(sentimentOf({ sentiment: 'positive', sentiment_label: 'Positive' })).toEqual({ reading: 'positive', word: 'Positive' });
    expect(sentimentOf({ sentiment: 'negative', sentiment_label: 'Unhappy' })).toEqual({ reading: 'negative', word: 'Unhappy' });
  });

  it('reads the last contact in days, and 60 or more as stale (spec §2.2, Decision 12)', () => {
    expect(contactedText(contacted(daysBefore(0), NOW))).toBe('Contacted today');
    expect(contactedText(contacted(daysBefore(1), NOW))).toBe('Contacted 1 day ago');
    expect(contacted(daysBefore(12), NOW)).toEqual({ stale: false, lead: 'Contacted ', figure: '12', tail: ' days ago' });
    expect(contacted(daysBefore(59), NOW).stale).toBe(false);
    expect(contacted(daysBefore(60), NOW)).toEqual({ stale: true, lead: 'Not contacted in ', figure: '60+', tail: ' days' });
    expect(contactedText(contacted(daysBefore(60), NOW))).toBe('Not contacted in 60+ days');
    expect(contacted(null, NOW)).toEqual({ stale: true, lead: 'Not contacted yet', figure: null, tail: '' });
  });

  it('writes the latest survey as "NPS 9 · 3 Oct"', () => {
    expect(surveyText({ type: 'nps', score: 9, answered_at: '2026-10-03T12:00:00Z' })).toBe('NPS 9 · 3 Oct');
    expect(surveyText({ type: 'csat', score: 4, answered_at: '2026-09-21T12:00:00Z' })).toBe('CSAT 4 · 21 Sep');
  });

  it('says who edited last, or only when when nobody is recorded', () => {
    const at = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(editedText({ updated_at: at, updated_by: { id: 5, name: 'Dana CSM' } })).toBe('Edited by Dana CSM · 2 days ago');
    expect(editedText({ updated_at: at, updated_by: null })).toBe('Edited 2 days ago');
  });

  it('writes a line as a sentence, and an empty label as "No label"', () => {
    expect(relationshipText('Rosa', 'Reports to', 'Tom')).toBe('Rosa reports to Tom');
    expect(relationshipText('Rosa', 'Introduced by', 'Tom')).toBe('Rosa was introduced by Tom');
    expect(relationshipText('Rosa', 'Blocks', 'Tom')).toBe('Rosa blocks Tom');
    expect(relationshipText('Rosa', 'Influences', 'Tom')).toBe('Rosa influences Tom');
    expect(relationshipText('Rosa', '', 'Tom')).toBe('Rosa is linked to Tom');
    expect(labelText('')).toBe('No label');
    expect(labelText('Blocks')).toBe('Blocks');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/canvas/canvasText.test.ts`
Expected: FAIL with "Failed to resolve import './canvasText'".

- [ ] **Step 3: Write the types and options**

Create `src/features/canvas/canvasTypes.ts`:

```ts
// Spec 2026-10-04-canvas-design §4, field for field (binding for both plans).
import type { PlanRow, RecordKind, RecordRef } from '../plans/planTypes';
import type { PersonRef } from '../segments/segmentTypes';

export type { PersonRef, RecordKind, RecordRef };

export type RelationshipLabel = 'Reports to' | 'Introduced by' | 'Blocks' | 'Influences' | '';
export type Reading = 'positive' | 'neutral' | 'negative';

export interface CanvasNode {
  id: string;
  position: { x: number; y: number };
  data: { contact_id: number };
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label: RelationshipLabel;
}

export type SurveyType = 'nps' | 'csat' | 'ces';

export interface LatestSurvey {
  type: SurveyType;
  score: number;
  answered_at: string;
}

export interface MapPerson {
  name: string;
  /** The role slug (Contract note 3). */
  role: string;
  /** The role's label, shown (Contract note 3). */
  role_display: string;
  /** Never null (Contract note 4). */
  sentiment: Reading;
  /** The word shown. */
  sentiment_label: string;
  last_contacted_at: string | null;
  latest_survey: LatestSurvey | null;
  campaigns_unsubscribed: boolean;
}

/** A person added from the tray has no facts until the next save (Contract note 14). */
export type PersonFacts = MapPerson & { pending?: true };

export interface NotOnMap {
  id: number;
  name: string;
  role: string;
  role_display: string;
}

export interface CanvasRow {
  id: number;
  name: string;
  record: RecordRef;
  /** Node count, hidden and removed nodes included (Contract note 13). */
  people: number;
  updated_at: string;
  updated_by: PersonRef | null;
}

export interface Canvas extends CanvasRow {
  version: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** Keyed by contact id, as a string. */
  people_by_contact: Record<string, MapPerson>;
  /** Node ids whose contact the reader can't open. */
  hidden: string[];
  /** Node ids whose contact no longer exists. */
  removed: string[];
  not_on_map: NotOnMap[];
  open_plans: PlanRow[];
  can_delete: boolean;
  created_by: PersonRef | null;
}

export interface GalleryPage {
  results: CanvasRow[];
  next: string | null;
}

export interface RecordMaps {
  results: CanvasRow[];
}

export type MapStart = 'people' | 'blank';

/** Exactly one of `customer` or `account`. */
export interface CanvasCreate {
  name: string;
  customer?: number;
  account?: number;
  start: MapStart;
}

export interface CanvasPatch {
  name?: string;
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
  version: number;
}
```

Create `src/features/canvas/canvasOptions.ts`:

```ts
import type { RelationshipLabel, SurveyType } from './canvasTypes';

/** The four labels, in the spec's order; '' is "No label". */
export const RELATIONSHIP_LABELS: readonly Exclude<RelationshipLabel, ''>[] = ['Reports to', 'Introduced by', 'Blocks', 'Influences'];
export const NO_LABEL = 'No label';

export const NAME_MAX = 120;
export const NODES_MAX = 60;
export const EDGES_MAX = 150;
/** Spec §1.4: a 240 × 160 grid, six to a row. */
export const GRID = { x: 240, y: 160, perRow: 6 } as const;
export const STALE_DAYS = 60;
export const GALLERY_PAGE = 50;
export const SEARCH_DEBOUNCE_MS = 300;

export const SURVEY_LABEL: Record<SurveyType, string> = { nps: 'NPS', csat: 'CSAT', ces: 'CES' };

/** The spec's sentences, used verbatim. */
export const SAY = {
  CHANGED: 'Someone else changed this map. Reload to see their changes.',
  NOT_DELETER: "Only the map's creator or their managers can delete it.",
  NAME: 'Give the map a name.',
  PEOPLE: 'Add people from this organisation or account.',
  HIDDEN: "Someone you can't open",
  REMOVED: 'Removed contact',
  NO_MAPS: 'No maps yet',
  NO_PLANS: 'No open plans',
  UNSAVED: 'Unsaved changes',
  UNSUBSCRIBED: 'Unsubscribed',
  NOT_ON_MAP: 'Not on the map',
  PHONE_NOTE: 'Edit maps on a larger screen.',
  MISSING: "This map doesn't exist or isn't shared with you.",
} as const;

/** The board's own refusals, before anything is sent (Decision 14). */
export const CHECK = {
  FULL: `A map holds at most ${NODES_MAX} people.`,
  LINES_FULL: `A map holds at most ${EDGES_MAX} lines.`,
  ALREADY_ON: 'They are already on the map.',
  SELF: 'Pick someone else to connect them to.',
  DUPLICATE: 'They already have this relationship.',
  PENDING: 'Save to see their facts.',
} as const;
```

- [ ] **Step 4: Write the display text**

Create `src/features/canvas/canvasText.ts`:

```ts
// What the Maps tab, the gallery and the editor say (spec §2.1-§2.3).
import { dayMonth } from '../contacts/contactsFormat';
import { formatRelativeTime } from '../customers/formatters';
import { NAME_MAX, NO_LABEL, STALE_DAYS, SURVEY_LABEL } from './canvasOptions';
import type { CanvasRow, LatestSurvey, MapPerson, Reading, RelationshipLabel } from './canvasTypes';

const DAY = 86_400_000;

export const peopleText = (n: number) => (n === 1 ? 'person' : 'people');

export function defaultMapName(recordName: string | null): string {
  return recordName ? `${recordName} map`.slice(0, NAME_MAX) : 'New map';
}

/** The slug for the dot, the server's word to read (Contract note 4). */
export function sentimentOf(person: Pick<MapPerson, 'sentiment' | 'sentiment_label'>): { reading: Reading; word: string } {
  return { reading: person.sentiment, word: person.sentiment_label };
}

/** "Contacted 12 days ago": the figure apart, for DM Mono. */
export interface Contacted {
  stale: boolean;
  lead: string;
  figure: string | null;
  tail: string;
}

export function contacted(iso: string | null, now: Date = new Date()): Contacted {
  if (!iso) return { stale: true, lead: 'Not contacted yet', figure: null, tail: '' };
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));
  if (days >= STALE_DAYS) return { stale: true, lead: 'Not contacted in ', figure: `${STALE_DAYS}+`, tail: ' days' };
  if (days === 0) return { stale: false, lead: 'Contacted today', figure: null, tail: '' };
  return { stale: false, lead: 'Contacted ', figure: String(days), tail: days === 1 ? ' day ago' : ' days ago' };
}

export const contactedText = (c: Contacted) => `${c.lead}${c.figure ?? ''}${c.tail}`;

export function surveyParts(s: LatestSurvey): { label: string; score: string; day: string } {
  return { label: SURVEY_LABEL[s.type], score: String(s.score), day: dayMonth(s.answered_at) };
}

export function surveyText(s: LatestSurvey): string {
  const p = surveyParts(s);
  return `${p.label} ${p.score} · ${p.day}`;
}

export function editedBy(row: Pick<CanvasRow, 'updated_at' | 'updated_by'>): { who: string | null; when: string } {
  return { who: row.updated_by?.name ?? null, when: formatRelativeTime(row.updated_at) };
}

export function editedText(row: Pick<CanvasRow, 'updated_at' | 'updated_by'>): string {
  const e = editedBy(row);
  return e.who ? `Edited by ${e.who} · ${e.when}` : `Edited ${e.when}`;
}

export const labelText = (label: RelationshipLabel) => label || NO_LABEL;

const VERB: Record<RelationshipLabel, string> = {
  'Reports to': 'reports to',
  'Introduced by': 'was introduced by',
  Blocks: 'blocks',
  Influences: 'influences',
  '': 'is linked to',
};

/** "A reports to B" (spec §2.2, phones). */
export function relationshipText(source: string, label: RelationshipLabel, target: string): string {
  return `${source} ${VERB[label]} ${target}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/features/canvas/canvasText.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/features/canvas`
Expected: no output.

```bash
git add src/features/canvas
git commit -m "feat(canvas): contract types, options and display text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The board model

Spec §1.1 (limits, one edge per source/target/label, no self lines), §1.4 (grid), §2.2 (tray, next free spot, hidden/removed); Contract notes 6-9, 14; Decisions 9, 10, 14.

**Files:**
- Create: `src/features/canvas/canvasBoard.ts`
- Test: `src/features/canvas/canvasBoard.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `GRID`, `NODES_MAX`, `EDGES_MAX`, `CHECK`.
- Produces:
  - `FlowNode = Node<{ contact_id: number }, 'person'>`, `FlowEdge = Edge<{ label: RelationshipLabel }, 'relationship'>`, `People = Record<string, PersonFacts>`, `NodeKind = 'person' | 'hidden' | 'removed'`, `Change<T> = { ok: true; value: T } | { ok: false; refused: string }`.
  - `toFlow(canvas) → { nodes: FlowNode[]; edges: FlowEdge[] }`
  - `toWrite(nodes, edges) → { nodes: CanvasNode[]; edges: CanvasEdge[] }`
  - `sameMap(a, b) → boolean`
  - `peopleOf(canvas) → People`
  - `nodeKind(node, hidden: ReadonlySet<string>, people) → NodeKind`
  - `trayOf(canvas, nodes, people) → NotOnMap[]`
  - `nextFreeSpot(nodes) → { x: number; y: number }`
  - `addPerson(nodes, person: NotOnMap) → Change<FlowNode[]>`
  - `removeNode(nodes, edges, id) → { nodes; edges }`
  - `addRelationship(edges, source, target, label) → Change<FlowEdge[]>`
  - `relabel(edges, id, label) → Change<FlowEdge[]>`
  - `removeEdge(edges, id) → FlowEdge[]`
  - `edgesOf(edges, nodeId) → FlowEdge[]`
  - `pendingPerson(person: NotOnMap) → PersonFacts`

- [ ] **Step 1: Write the failing test**

Create `src/features/canvas/canvasBoard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addPerson,
  addRelationship,
  edgesOf,
  nextFreeSpot,
  nodeKind,
  peopleOf,
  relabel,
  removeEdge,
  removeNode,
  sameMap,
  toFlow,
  toWrite,
  trayOf,
  type FlowEdge,
  type FlowNode,
} from './canvasBoard';
import { CHECK } from './canvasOptions';
import type { Canvas } from './canvasTypes';

const person = (name: string, role = 'champion') => ({
  name,
  role,
  role_display: 'Champion',
  sentiment: 'positive' as const,
  sentiment_label: 'Positive',
  last_contacted_at: null,
  latest_survey: null,
  campaigns_unsubscribed: false,
});

const CANVAS: Pick<Canvas, 'nodes' | 'edges' | 'hidden' | 'removed' | 'people_by_contact' | 'not_on_map'> = {
  nodes: [
    { id: 'a', position: { x: 0, y: 0 }, data: { contact_id: 51 } },
    { id: 'b', position: { x: 240, y: 0 }, data: { contact_id: 52 } },
    { id: 'h', position: { x: 480, y: 0 }, data: { contact_id: 54 } },
    { id: 'r', position: { x: 0, y: 160 }, data: { contact_id: 59 } },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b', label: 'Reports to' }],
  hidden: ['h'],
  removed: ['r'],
  people_by_contact: { '51': person('Rosa Diaz'), '52': person('Tom Lee') },
  not_on_map: [{ id: 55, name: 'Omar Farouk', role: 'other', role_display: 'Other' }],
};
const OMAR = { id: 55, name: 'Omar Farouk', role: 'other', role_display: 'Other' };

const node = (id: string, contact: number, x = 0, y = 0): FlowNode => ({ id, type: 'person', position: { x, y }, data: { contact_id: contact } });

describe('the board model', () => {
  it('turns the server map into flow nodes and lines, hidden nodes fixed in place', () => {
    const { nodes, edges } = toFlow(CANVAS);
    expect(nodes.map((n) => [n.id, n.type, n.draggable, n.deletable])).toEqual([
      ['a', 'person', true, true],
      ['b', 'person', true, true],
      ['h', 'person', false, false],
      ['r', 'person', true, true],
    ]);
    expect(edges).toEqual([{ id: 'e1', type: 'relationship', source: 'a', target: 'b', data: { label: 'Reports to' } }]);
  });

  it('writes back only the contract keys (Contract note 8)', () => {
    const { nodes, edges } = toFlow(CANVAS);
    const messy = nodes.map((n) => ({ ...n, selected: true, dragging: false, measured: { width: 208, height: 96 }, width: 208 }));
    expect(toWrite(messy, edges)).toEqual({ nodes: CANVAS.nodes, edges: CANVAS.edges });
  });

  it('calls two maps the same when only React Flow bookkeeping differs', () => {
    const { nodes, edges } = toFlow(CANVAS);
    const saved = toWrite(nodes, edges);
    expect(sameMap(toWrite(nodes.map((n) => ({ ...n, selected: true })), edges), saved)).toBe(true);
    expect(sameMap(toWrite(nodes.map((n) => (n.id === 'a' ? { ...n, position: { x: 1, y: 0 } } : n)), edges), saved)).toBe(false);
  });

  it('classes nodes as people, hidden or removed (spec §1.3)', () => {
    const people = peopleOf(CANVAS as Canvas);
    const hidden = new Set(CANVAS.hidden);
    expect(toFlow(CANVAS).nodes.map((n) => nodeKind(n, hidden, people))).toEqual(['person', 'person', 'hidden', 'removed']);
  });

  it('fills the tray from not_on_map, adds back people removed here, and leaves out people placed here', () => {
    const people = peopleOf(CANVAS as Canvas);
    const { nodes } = toFlow(CANVAS);
    const withoutTom = nodes.filter((n) => n.id !== 'b');
    expect(trayOf(CANVAS as Canvas, withoutTom, people).map((p) => p.name)).toEqual(['Omar Farouk', 'Tom Lee']);
    const withOmar = [...nodes, node('c55', 55)];
    expect(trayOf(CANVAS as Canvas, withOmar, people)).toEqual([]);
  });

  it('finds the next free spot on the 240 x 160 grid, six to a row (Decision 9)', () => {
    expect(nextFreeSpot([])).toEqual({ x: 0, y: 0 });
    expect(nextFreeSpot([node('a', 1, 0, 0), node('b', 2, 240, 0)])).toEqual({ x: 480, y: 0 });
    const fullRow = [0, 1, 2, 3, 4, 5].map((i) => node(`n${i}`, i + 1, i * 240, 0));
    expect(nextFreeSpot(fullRow)).toEqual({ x: 0, y: 160 });
    expect(nextFreeSpot([node('a', 1, 10, 5)])).toEqual({ x: 240, y: 0 });
  });

  it('adds a person once, with a fresh id, and never past 60', () => {
    const added = addPerson([node('c55', 99)], OMAR);
    expect(added.ok && added.value.map((n) => [n.id, n.data.contact_id, n.position])).toEqual([
      ['c55', 99, { x: 0, y: 0 }],
      ['c55-2', 55, { x: 240, y: 0 }],
    ]);
    expect(addPerson([node('x', 55)], OMAR)).toEqual({ ok: false, refused: CHECK.ALREADY_ON });
    const full = Array.from({ length: 60 }, (_, i) => node(`n${i}`, i + 1000));
    expect(addPerson(full, OMAR)).toEqual({ ok: false, refused: CHECK.FULL });
  });

  it('removes a person with every line that touches them', () => {
    const { nodes, edges } = toFlow(CANVAS);
    const after = removeNode(nodes, edges, 'a');
    expect(after.nodes.map((n) => n.id)).toEqual(['b', 'h', 'r']);
    expect(after.edges).toEqual([]);
  });

  it('adds a line once per source, target and label, never to oneself, never past 150', () => {
    const { edges } = toFlow(CANVAS);
    const added = addRelationship(edges, 'a', 'b', 'Influences');
    expect(added.ok && added.value.at(-1)).toEqual({ id: 'e-a-b', type: 'relationship', source: 'a', target: 'b', data: { label: 'Influences' } });
    const again = added.ok ? addRelationship(added.value, 'a', 'b', '') : added;
    expect(again.ok && again.value.at(-1)?.id).toBe('e-a-b-2');
    expect(addRelationship(edges, 'a', 'b', 'Reports to')).toEqual({ ok: false, refused: CHECK.DUPLICATE });
    expect(addRelationship(edges, 'a', 'a', '')).toEqual({ ok: false, refused: CHECK.SELF });
    const full: FlowEdge[] = Array.from({ length: 150 }, (_, i) => ({ id: `e${i}`, type: 'relationship', source: 'a', target: `t${i}`, data: { label: '' } }));
    expect(addRelationship(full, 'a', 'b', '')).toEqual({ ok: false, refused: CHECK.LINES_FULL });
  });

  it('relabels a line unless that makes a duplicate, and removes one', () => {
    const { edges } = toFlow(CANVAS);
    const two = addRelationship(edges, 'a', 'b', '');
    if (!two.ok) throw new Error(two.refused);
    const relabelled = relabel(two.value, 'e1', 'Blocks');
    expect(relabelled.ok && relabelled.value[0].data).toEqual({ label: 'Blocks' });
    expect(relabel(two.value, 'e-a-b', 'Reports to')).toEqual({ ok: false, refused: CHECK.DUPLICATE });
    expect(removeEdge(two.value, 'e1').map((e) => e.id)).toEqual(['e-a-b']);
    expect(edgesOf(two.value, 'b').map((e) => e.id)).toEqual(['e1', 'e-a-b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/canvas/canvasBoard.test.ts`
Expected: FAIL with "Failed to resolve import './canvasBoard'".

- [ ] **Step 3: Write the board model**

Create `src/features/canvas/canvasBoard.ts`:

```ts
// The editor's board as plain data (spec §1.1, §1.4, §2.2): the server's map
// as React Flow nodes and lines and back, and every edit as a pure function,
// so the ⋯ menus, the panel, the tray and dragging all share one rule set.
import type { Edge, Node } from '@xyflow/react';
import { CHECK, EDGES_MAX, GRID, NODES_MAX } from './canvasOptions';
import type { Canvas, CanvasEdge, CanvasNode, NotOnMap, PersonFacts, RelationshipLabel } from './canvasTypes';

export type FlowNode = Node<{ contact_id: number }, 'person'>;
export type FlowEdge = Edge<{ label: RelationshipLabel }, 'relationship'>;
export type People = Record<string, PersonFacts>;
export type NodeKind = 'person' | 'hidden' | 'removed';
export type Change<T> = { ok: true; value: T } | { ok: false; refused: string };

type MapShape = Pick<Canvas, 'nodes' | 'edges' | 'hidden'>;

export function toFlow(canvas: MapShape): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const hidden = new Set(canvas.hidden);
  return {
    nodes: canvas.nodes.map((n) => ({
      id: n.id,
      type: 'person',
      position: { x: n.position.x, y: n.position.y },
      data: { contact_id: n.data.contact_id },
      draggable: !hidden.has(n.id),
      deletable: !hidden.has(n.id),
    })),
    edges: canvas.edges.map((e) => ({ id: e.id, type: 'relationship', source: e.source, target: e.target, data: { label: e.label } })),
  };
}

/** Only the contract's keys (Contract note 8). */
export function toWrite(nodes: FlowNode[], edges: FlowEdge[]): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  return {
    nodes: nodes.map((n) => ({ id: n.id, position: { x: n.position.x, y: n.position.y }, data: { contact_id: n.data.contact_id } })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.data?.label ?? '' })),
  };
}

export function sameMap(a: ReturnType<typeof toWrite>, b: ReturnType<typeof toWrite>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function peopleOf(canvas: Pick<Canvas, 'people_by_contact'>): People {
  return { ...canvas.people_by_contact };
}

export function nodeKind(node: FlowNode, hidden: ReadonlySet<string>, people: People): NodeKind {
  if (hidden.has(node.id)) return 'hidden';
  return people[String(node.data.contact_id)] ? 'person' : 'removed';
}

/** A tray person on the board before the next save (Contract note 14). */
export function pendingPerson(person: NotOnMap): PersonFacts {
  return {
    name: person.name,
    role: person.role,
    role_display: person.role_display,
    // Never shown while pending (Contract note 14); the save's answer replaces it.
    sentiment: 'neutral',
    sentiment_label: '',
    last_contacted_at: null,
    latest_survey: null,
    campaigns_unsubscribed: false,
    pending: true,
  };
}

/** "Not on the map": the server's list, plus readable people removed here, less anyone placed here. */
export function trayOf(canvas: Pick<Canvas, 'nodes' | 'hidden' | 'not_on_map'>, nodes: FlowNode[], people: People): NotOnMap[] {
  const placed = new Set(nodes.map((n) => n.data.contact_id));
  const hidden = new Set(canvas.hidden);
  const out = new Map<number, NotOnMap>();
  for (const p of canvas.not_on_map) if (!placed.has(p.id)) out.set(p.id, p);
  for (const n of canvas.nodes) {
    const id = n.data.contact_id;
    const facts = people[String(id)];
    if (!placed.has(id) && !hidden.has(n.id) && facts) out.set(id, { id, name: facts.name, role: facts.role, role_display: facts.role_display });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const cellOf = (n: FlowNode) => `${Math.round(n.position.x / GRID.x)},${Math.round(n.position.y / GRID.y)}`;

export function nextFreeSpot(nodes: FlowNode[]): { x: number; y: number } {
  const taken = new Set(nodes.map(cellOf));
  for (let row = 0; ; row++) {
    for (let col = 0; col < GRID.perRow; col++) {
      if (!taken.has(`${col},${row}`)) return { x: col * GRID.x, y: row * GRID.y };
    }
  }
}

function freshId(taken: ReadonlySet<string>, base: string): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function addPerson(nodes: FlowNode[], person: NotOnMap): Change<FlowNode[]> {
  if (nodes.some((n) => n.data.contact_id === person.id)) return { ok: false, refused: CHECK.ALREADY_ON };
  if (nodes.length >= NODES_MAX) return { ok: false, refused: CHECK.FULL };
  const id = freshId(new Set(nodes.map((n) => n.id)), `c${person.id}`);
  const added: FlowNode = { id, type: 'person', position: nextFreeSpot(nodes), data: { contact_id: person.id }, draggable: true, deletable: true };
  return { ok: true, value: [...nodes, added] };
}

export function removeNode(nodes: FlowNode[], edges: FlowEdge[], id: string): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return { nodes: nodes.filter((n) => n.id !== id), edges: edges.filter((e) => e.source !== id && e.target !== id) };
}

const sameLine = (e: FlowEdge, source: string, target: string, label: RelationshipLabel) =>
  e.source === source && e.target === target && (e.data?.label ?? '') === label;

export function addRelationship(edges: FlowEdge[], source: string, target: string, label: RelationshipLabel): Change<FlowEdge[]> {
  if (source === target) return { ok: false, refused: CHECK.SELF };
  if (edges.some((e) => sameLine(e, source, target, label))) return { ok: false, refused: CHECK.DUPLICATE };
  if (edges.length >= EDGES_MAX) return { ok: false, refused: CHECK.LINES_FULL };
  const id = freshId(new Set(edges.map((e) => e.id)), `e-${source}-${target}`);
  return { ok: true, value: [...edges, { id, type: 'relationship', source, target, data: { label } }] };
}

export function relabel(edges: FlowEdge[], id: string, label: RelationshipLabel): Change<FlowEdge[]> {
  const line = edges.find((e) => e.id === id);
  if (!line) return { ok: true, value: edges };
  if (edges.some((e) => e.id !== id && sameLine(e, line.source, line.target, label))) return { ok: false, refused: CHECK.DUPLICATE };
  return { ok: true, value: edges.map((e) => (e.id === id ? { ...e, data: { label } } : e)) };
}

export const removeEdge = (edges: FlowEdge[], id: string) => edges.filter((e) => e.id !== id);

export const edgesOf = (edges: FlowEdge[], nodeId: string) => edges.filter((e) => e.source === nodeId || e.target === nodeId);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/features/canvas/canvasBoard.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Type-check, lint, commit**

Run: `npx tsc -b --noEmit && npx eslint src/features/canvas`

```bash
git add src/features/canvas/canvasBoard.ts src/features/canvas/canvasBoard.test.ts
git commit -m "feat(canvas): the board model, every edit a pure function

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The API, the refusals and the contract stub

Spec §4 (every endpoint), §1.1 (validation the stub mirrors), §1.2 (403), §1.3 (classes, tray, open plans), §1.4 (people layout), §1.5 (409, gallery order and search); Contract notes 1, 2, 7, 8, 10, 11, 12.

**Files:**
- Create: `src/features/canvas/canvasParams.ts`, `src/features/canvas/canvasApi.ts`, `src/features/canvas/canvasErrors.ts`, `src/features/canvas/testCanvasFixtures.ts`, `src/features/canvas/testCanvases.ts`, `src/test/reactFlow.ts`
- Test: `src/features/canvas/canvasApi.test.ts`, `src/features/canvas/canvasErrors.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `SAY`; `apiFetch`, `ApiError` (`lib/apiClient`); `accountBase` (`lib/accountPaths`); `ME`, `CARL`, `DANA` (`features/segments/testSegments`); `PlanRow` (`features/plans/planTypes`); `OPEN_STATUSES`/`isOpen` (`features/plans/planText`).
- Produces:
  - `canvasParams.ts`: `parseMapId(raw: string | undefined) → number | null`, `galleryQuery(q: string, cursor: string | null) → string`.
  - `canvasApi.ts`: `CANVASES_PATH`, `fetchGallery(q, cursor) → Promise<GalleryPage>`, `fetchRecordMaps(record: {kind, id}) → Promise<RecordMaps>`, `recordMapsPath(record) → string`, `createMap(body: CanvasCreate) → Promise<Canvas>`, `fetchMap(id) → Promise<Canvas>`, `saveMap(id, body: CanvasPatch) → Promise<Canvas>`, `deleteMap(id) → Promise<null>`.
  - `canvasErrors.ts`: `SaveRefusal = { changed: boolean; messages: string[] }`, `saveRefusal(err) → SaveRefusal`, `CreateErrors = { name?: string; form?: string }`, `createErrors(err) → CreateErrors`, `deleteRefusal(err) → string`, `loadError(err) → { missing: boolean; message: string }`.
  - `testCanvasFixtures.ts`: `PIZZA_HUT`, `PIZZA_EMEA` (`RecordRef`), `ROSA`, `TOM`, `PRIYA`, `HIDDEN_HAL`, `OMAR`, `GONE_GIL` (`StoredPerson`), `PEOPLE`, `EMEA_MAP`, `HUT_MAP`, `DANA_MAP`, `MAPS` (`StoredMap`), `EMEA_PLAN` (`PlanRow`), `daysAgo(n)`.
  - `testCanvases.ts`: `stubCanvases(stub?: CanvasesStub) → { spy; maps: StoredMap[]; otherSave(id, change: (map: StoredMap) => void): void }`, `sentBodies(spy, method) → unknown[]`.
  - `src/test/reactFlow.ts`: `mockReactFlow(): void`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/canvas/canvasErrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { createErrors, deleteRefusal, loadError, saveRefusal } from './canvasErrors';
import { SAY } from './canvasOptions';

const api = (status: number, body: unknown) => new ApiError(status, body, 'Request failed');

describe('canvas refusals', () => {
  it('reads a 409 CANVAS_CHANGED as "someone else changed it"', () => {
    expect(saveRefusal(api(409, { code: 'CANVAS_CHANGED', detail: SAY.CHANGED }))).toEqual({ changed: true, messages: [SAY.CHANGED] });
  });

  it('lists field refusals name, nodes, edges first, then the rest (Contract note 11)', () => {
    const body = { non_field_errors: ['Odd.'], edges: ['Bad line.'], nodes: [SAY.PEOPLE, 'second'], name: [SAY.NAME] };
    expect(saveRefusal(api(400, body))).toEqual({ changed: false, messages: [SAY.NAME, SAY.PEOPLE, 'Bad line.', 'Odd.'] });
  });

  it('falls back to a sentence for anything unreadable', () => {
    expect(saveRefusal(new Error('boom'))).toEqual({ changed: false, messages: ['Could not save this map. Try again.'] });
    expect(saveRefusal(api(403, { detail: 'No.' }))).toEqual({ changed: false, messages: ['No.'] });
  });

  it('puts a create refusal at the name, or above the form', () => {
    expect(createErrors(api(400, { name: [SAY.NAME] }))).toEqual({ name: SAY.NAME });
    expect(createErrors(api(400, { start: ['Pick one.'] }))).toEqual({ form: 'Pick one.' });
    expect(createErrors(new Error('x'))).toEqual({ form: 'Could not create the map. Try again.' });
  });

  it("shows the server's 403 sentence for a delete", () => {
    expect(deleteRefusal(api(403, { detail: SAY.NOT_DELETER }))).toBe(SAY.NOT_DELETER);
    expect(deleteRefusal(new Error('x'))).toBe('Could not delete the map. Try again.');
  });

  it('reads a 404 load as missing', () => {
    expect(loadError(api(404, { detail: 'Not found.' }))).toEqual({ missing: true, message: SAY.MISSING });
    expect(loadError(api(500, {}))).toEqual({ missing: false, message: 'Request failed' });
  });
});
```

Create `src/features/canvas/canvasApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMap, deleteMap, fetchGallery, fetchMap, fetchRecordMaps, saveMap } from './canvasApi';
import { galleryQuery, parseMapId } from './canvasParams';

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });

function stub(body: unknown = { results: [], next: null }, status = 200) {
  const spy = vi.fn(async () => ok(body, status));
  vi.stubGlobal('fetch', spy);
  return spy;
}
const sent = (spy: ReturnType<typeof stub>) =>
  spy.mock.calls.map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${String(url).replace(/^.*\/api\/v1/, '')}`);

describe('canvas api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the gallery with q and the cursor', async () => {
    const spy = stub();
    await fetchGallery('', null);
    await fetchGallery('pizza hut', 'abc');
    expect(sent(spy)).toEqual(['GET /canvases/', 'GET /canvases/?q=pizza+hut&cursor=abc']);
  });

  it("reads a record's maps: the organisation nested, the account flat (Contract note 1)", async () => {
    const spy = stub({ results: [] });
    await fetchRecordMaps({ kind: 'organization', id: 7 });
    await fetchRecordMaps({ kind: 'account', id: 12 });
    expect(sent(spy)).toEqual(['GET /customers/7/canvases/', 'GET /accounts/12/canvases/']);
  });

  it('creates, reads, saves and deletes a map', async () => {
    const spy = stub({});
    await createMap({ name: 'Pizza Hut map', customer: 7, start: 'people' });
    await fetchMap(3);
    await saveMap(3, { name: 'x', nodes: [], edges: [], version: 2 });
    await deleteMap(3);
    expect(sent(spy)).toEqual(['POST /canvases/', 'GET /canvases/3/', 'PATCH /canvases/3/', 'DELETE /canvases/3/']);
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body))).toEqual({ name: 'Pizza Hut map', customer: 7, start: 'people' });
  });

  it('reads a map id from the route', () => {
    expect([parseMapId('12'), parseMapId('0'), parseMapId('create'), parseMapId(undefined)]).toEqual([12, null, null, null]);
    expect(galleryQuery('  ', null)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/canvas/canvasErrors.test.ts src/features/canvas/canvasApi.test.ts`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Write params, API and refusals**

Create `src/features/canvas/canvasParams.ts`:

```ts
/** `/canvas/12` gives 12; anything but a positive whole number is no map. */
export function parseMapId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

export function galleryQuery(q: string, cursor: string | null): string {
  const query = new URLSearchParams();
  if (q.trim()) query.set('q', q.trim());
  if (cursor) query.set('cursor', cursor);
  return query.toString();
}
```

Create `src/features/canvas/canvasApi.ts`:

```ts
// Thin apiFetch wrappers over revenact-backend's /api/v1/canvases/ (spec §4).
import { accountBase } from '../../lib/accountPaths';
import { apiFetch } from '../../lib/apiClient';
import { galleryQuery } from './canvasParams';
import type { Canvas, CanvasCreate, CanvasPatch, GalleryPage, RecordKind, RecordMaps } from './canvasTypes';

export const CANVASES_PATH = '/canvases/';
const one = (id: number) => `${CANVASES_PATH}${id}/`;

export function fetchGallery(q: string, cursor: string | null): Promise<GalleryPage> {
  const query = galleryQuery(q, cursor);
  return apiFetch<GalleryPage>(query ? `${CANVASES_PATH}?${query}` : CANVASES_PATH);
}

/** Contract note 1: an account's maps through the flat account route. */
export function recordMapsPath(record: { kind: RecordKind; id: number }): string {
  return record.kind === 'organization' ? `/customers/${record.id}/canvases/` : `${accountBase(record.id)}/canvases/`;
}

export function fetchRecordMaps(record: { kind: RecordKind; id: number }): Promise<RecordMaps> {
  return apiFetch<RecordMaps>(recordMapsPath(record));
}

export function createMap(body: CanvasCreate): Promise<Canvas> {
  return apiFetch<Canvas>(CANVASES_PATH, { method: 'POST', body });
}

export function fetchMap(id: number): Promise<Canvas> {
  return apiFetch<Canvas>(one(id));
}

export function saveMap(id: number, body: CanvasPatch): Promise<Canvas> {
  return apiFetch<Canvas>(one(id), { method: 'PATCH', body });
}

export function deleteMap(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}
```

Create `src/features/canvas/canvasErrors.ts`:

```ts
// A refusal, put where it belongs (spec §2.2: the 409 banner, a summary that
// takes focus; §2.1: the New map dialog).
import { ApiError } from '../../lib/apiClient';
import { SAY } from './canvasOptions';

export interface SaveRefusal {
  /** 409 CANVAS_CHANGED: offer Reload. */
  changed: boolean;
  messages: string[];
}

const FIRST = ['name', 'nodes', 'edges'];

function messagesOf(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const entries = Object.entries(body as Record<string, unknown>);
  const rank = (key: string) => (FIRST.includes(key) ? FIRST.indexOf(key) : FIRST.length);
  const out: string[] = [];
  for (const [key, value] of [...entries].sort(([a], [b]) => rank(a) - rank(b))) {
    if (key === 'detail' && typeof value === 'string') out.push(value);
    else if (Array.isArray(value) && typeof value[0] === 'string') out.push(value[0]);
  }
  return out;
}

export function saveRefusal(err: unknown): SaveRefusal {
  if (err instanceof ApiError && err.status === 409) {
    const body = err.body as { code?: string } | null;
    if (body?.code === 'CANVAS_CHANGED') return { changed: true, messages: [SAY.CHANGED] };
  }
  const messages = err instanceof ApiError ? messagesOf(err.body) : [];
  return { changed: false, messages: messages.length ? messages : ['Could not save this map. Try again.'] };
}

export interface CreateErrors {
  name?: string;
  form?: string;
}

export function createErrors(err: unknown): CreateErrors {
  const fallback = { form: 'Could not create the map. Try again.' };
  if (!(err instanceof ApiError) || !err.body || typeof err.body !== 'object') return fallback;
  const body = err.body as Record<string, unknown>;
  const name = Array.isArray(body.name) && typeof body.name[0] === 'string' ? body.name[0] : undefined;
  const rest = messagesOf(Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'name')));
  const out: CreateErrors = {};
  if (name) out.name = name;
  if (rest[0]) out.form = rest[0];
  return out.name || out.form ? out : fallback;
}

export function deleteRefusal(err: unknown): string {
  return (err instanceof ApiError ? messagesOf(err.body)[0] : undefined) ?? 'Could not delete the map. Try again.';
}

export function loadError(err: unknown): { missing: boolean; message: string } {
  if (err instanceof ApiError && err.status === 404) return { missing: true, message: SAY.MISSING };
  return { missing: false, message: err instanceof ApiError ? err.message : 'Could not load this map.' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/canvas/canvasErrors.test.ts src/features/canvas/canvasApi.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the fixtures**

Create `src/features/canvas/testCanvasFixtures.ts`:

```ts
// Test-only: two records, their people and three maps (spec §1.3's three
// node classes), shared by every Canvas test and the stub.
import type { PlanRow } from '../plans/planTypes';
import { CARL, DANA, ME } from '../segments/testSegments';
import type { CanvasEdge, CanvasNode, MapPerson, PersonRef, RecordRef } from './canvasTypes';

export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const PIZZA_HUT: RecordRef = { kind: 'organization', id: 7, name: 'Pizza Hut' };
export const PIZZA_EMEA: RecordRef = { kind: 'account', id: 12, name: 'Pizza EMEA' };
/** A record the reader can't open: its maps never show. */
export const SECRET_CO: RecordRef = { kind: 'organization', id: 99, name: 'Secret Co' };

export interface StoredPerson {
  id: number;
  name: string;
  role: string;
  role_display: string;
  /** Where they work: an account's people are also the organisation's. */
  record: RecordRef;
  readable: boolean;
  deleted?: boolean;
  facts: Omit<MapPerson, 'name' | 'role' | 'role_display'>;
}

const facts = (over: Partial<MapPerson> = {}): Omit<MapPerson, 'name' | 'role' | 'role_display'> => ({
  sentiment: 'neutral',
  sentiment_label: 'Neutral',
  last_contacted_at: null,
  latest_survey: null,
  campaigns_unsubscribed: false,
  ...over,
});

export const ROSA: StoredPerson = {
  id: 51, name: 'Rosa Diaz', role: 'decision_maker', role_display: 'Decision Maker', record: PIZZA_EMEA, readable: true,
  facts: facts({ sentiment: 'positive', sentiment_label: 'Positive', last_contacted_at: daysAgo(12), latest_survey: { type: 'nps', score: 9, answered_at: '2026-10-03T12:00:00Z' } }),
};
export const TOM: StoredPerson = {
  id: 52, name: 'Tom Lee', role: 'champion', role_display: 'Champion', record: PIZZA_EMEA, readable: true,
  facts: facts({ last_contacted_at: daysAgo(70), campaigns_unsubscribed: true }),
};
export const PRIYA: StoredPerson = {
  id: 53, name: 'Priya Shah', role: 'influencer', role_display: 'Influencer', record: PIZZA_HUT, readable: true,
  facts: facts({ sentiment: 'negative', sentiment_label: 'Negative' }),
};
/** Exists, but the reader may not open them (spec §1.3 `hidden`). */
export const HIDDEN_HAL: StoredPerson = { id: 54, name: 'Hal Hidden', role: 'economic_buyer', role_display: 'Economic Buyer', record: PIZZA_EMEA, readable: false, facts: facts() };
export const OMAR: StoredPerson = { id: 55, name: 'Omar Farouk', role: 'other', role_display: 'Other', record: PIZZA_EMEA, readable: true, facts: facts() };
/** Deleted since being mapped (spec §1.3 `removed`). */
export const GONE_GIL: StoredPerson = { id: 59, name: 'Gil Gone', role: 'other', role_display: 'Other', record: PIZZA_EMEA, readable: true, deleted: true, facts: facts() };
export const PEOPLE: StoredPerson[] = [ROSA, TOM, PRIYA, HIDDEN_HAL, OMAR, GONE_GIL];

export interface StoredMap {
  id: number;
  name: string;
  record: RecordRef;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  version: number;
  created_by: PersonRef | null;
  updated_by: PersonRef | null;
  updated_at: string;
}

const at = (id: string, contact: number, x: number, y: number): CanvasNode => ({ id, position: { x, y }, data: { contact_id: contact } });

/** Rosa reports to Tom; Hal is hidden; Gil is removed; Omar is in the tray. */
export const EMEA_MAP: StoredMap = {
  id: 301, name: 'EMEA buying group', record: PIZZA_EMEA,
  nodes: [at('n1', 51, 0, 0), at('n2', 52, 240, 0), at('n3', 54, 480, 0), at('n4', 59, 0, 160)],
  edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'Reports to' }],
  version: 4, created_by: CARL, updated_by: DANA, updated_at: daysAgo(2),
};
export const HUT_MAP: StoredMap = {
  id: 302, name: 'Pizza Hut leadership', record: PIZZA_HUT, nodes: [at('n1', 53, 0, 0)], edges: [],
  version: 1, created_by: ME, updated_by: ME, updated_at: daysAgo(5),
};
/** Dana's map: Alice (ME) is not above Dana, so she may not delete it. */
export const DANA_MAP: StoredMap = {
  id: 303, name: "Dana's renewal map", record: PIZZA_EMEA, nodes: [], edges: [],
  version: 1, created_by: DANA, updated_by: DANA, updated_at: daysAgo(9),
};
export const SECRET_MAP: StoredMap = {
  id: 304, name: 'Secret map', record: SECRET_CO, nodes: [], edges: [],
  version: 1, created_by: DANA, updated_by: DANA, updated_at: daysAgo(1),
};
export const MAPS: StoredMap[] = [EMEA_MAP, HUT_MAP, DANA_MAP, SECRET_MAP];

export const EMEA_PLAN: PlanRow = {
  id: 41, name: 'EMEA onboarding', kind: 'onboarding', status: 'on_track', record: PIZZA_EMEA, owner: ME,
  start_date: '2026-09-01', target_date: '2026-11-30', milestones_done: 1, milestones_total: 3,
  tasks_done: 2, tasks_total: 6, next_due: '2026-10-20', is_overdue: false, can_edit: true,
};
```

- [ ] **Step 6: Write the stub**

Create `src/features/canvas/testCanvases.ts`:

```ts
// Test-only: one stateful fetch stub for every Canvas endpoint (spec §4).
// It validates as §1.1 does, classes nodes as §1.3 does, lays new maps out as
// §1.4 does, answers 409 on a stale version and 403 to a non-deleter.
// `otherSave` is a second editor's save (Dana), bumping the version.
import { vi } from 'vitest';
import { isOpen } from '../plans/planText';
import type { PlanRow } from '../plans/planTypes';
import { CARL, DANA, ME } from '../segments/testSegments';
import { EDGES_MAX, GRID, NAME_MAX, NODES_MAX, RELATIONSHIP_LABELS, SAY } from './canvasOptions';
import type { Canvas, CanvasEdge, CanvasNode, CanvasRow, MapPerson, RecordRef } from './canvasTypes';
import { MAPS, PEOPLE, PIZZA_EMEA, PIZZA_HUT, SECRET_CO, type StoredMap, type StoredPerson } from './testCanvasFixtures';

export interface CanvasesStub {
  maps?: StoredMap[];
  people?: StoredPerson[];
  plans?: PlanRow[];
  pageSize?: number;
  /** How many gallery or record-list reads fail (500) first. */
  failList?: number;
}

const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const RECORDS = [PIZZA_HUT, PIZZA_EMEA, SECRET_CO];
const readableRecord = (r: RecordRef) => r.id !== SECRET_CO.id;
/** Alice manages Carl (as the Plans fixtures): she may delete his maps. */
const mayDelete = (map: StoredMap) => !map.created_by || map.created_by.id === ME.id || map.created_by.id === CARL.id;
const sameRecord = (a: RecordRef, b: RecordRef) => a.kind === b.kind && a.id === b.id;
/** An organisation's people include its accounts' (§1.1). */
const ofRecord = (p: StoredPerson, r: RecordRef) => sameRecord(p.record, r) || (r.kind === 'organization' && r.id === PIZZA_HUT.id && p.record.id === PIZZA_EMEA.id);
const ROW_ORDER = [['decision_maker', 'economic_buyer'], ['champion'], ['influencer']];

export function stubCanvases(stub: CanvasesStub = {}) {
  const maps = (stub.maps ?? MAPS).map((m) => structuredClone(m));
  const people = stub.people ?? PEOPLE;
  const pageSize = stub.pageSize ?? 50;
  let failures = stub.failList ?? 0;
  let nextId = 700;

  const row = (m: StoredMap): CanvasRow => ({ id: m.id, name: m.name, record: m.record, people: m.nodes.length, updated_at: m.updated_at, updated_by: m.updated_by });
  const byNewest = (a: StoredMap, b: StoredMap) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id;

  function payload(m: StoredMap): Canvas {
    const people_by_contact: Record<string, MapPerson> = {};
    const hidden: string[] = [];
    const removed: string[] = [];
    for (const n of m.nodes) {
      const p = people.find((one) => one.id === n.data.contact_id);
      if (!p || p.deleted) removed.push(n.id);
      else if (!p.readable) hidden.push(n.id);
      else people_by_contact[String(p.id)] = { name: p.name, role: p.role, role_display: p.role_display, ...p.facts };
    }
    const onMap = new Set(m.nodes.map((n) => n.data.contact_id));
    const not_on_map = people
      .filter((p) => ofRecord(p, m.record) && p.readable && !p.deleted && !onMap.has(p.id))
      .map(({ id, name, role, role_display }) => ({ id, name, role, role_display }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 200);
    const open_plans = (stub.plans ?? []).filter((plan) => sameRecord(plan.record, m.record) && isOpen(plan.status));
    return { ...row(m), version: m.version, nodes: structuredClone(m.nodes), edges: structuredClone(m.edges), people_by_contact, hidden, removed, not_on_map, open_plans, can_delete: mayDelete(m), created_by: m.created_by };
  }

  function layout(r: RecordRef): CanvasNode[] {
    const placed = people
      .filter((p) => ofRecord(p, r) && p.readable && !p.deleted)
      .sort((a, b) => {
        const rank = (p: StoredPerson) => { const i = ROW_ORDER.findIndex((g) => g.includes(p.role)); return i === -1 ? ROW_ORDER.length : i; };
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      })
      .slice(0, NODES_MAX);
    const nodes: CanvasNode[] = [];
    let y = 0;
    for (let group = 0; group <= ROW_ORDER.length; group++) {
      const members = placed.filter((p) => { const i = ROW_ORDER.findIndex((g) => g.includes(p.role)); return (i === -1 ? ROW_ORDER.length : i) === group; });
      for (let i = 0; i < members.length; i++) {
        if (i > 0 && i % GRID.perRow === 0) y += GRID.y;
        nodes.push({ id: `p${members[i].id}`, position: { x: (i % GRID.perRow) * GRID.x, y }, data: { contact_id: members[i].id } });
      }
      if (members.length) y += GRID.y;
    }
    return nodes;
  }

  function invalid(m: StoredMap, body: Record<string, unknown>): Record<string, string[]> | null {
    const errors: Record<string, string[]> = {};
    if ('name' in body && (typeof body.name !== 'string' || !body.name.trim() || body.name.length > NAME_MAX)) errors.name = [SAY.NAME];
    const nodes = (body.nodes ?? m.nodes) as CanvasNode[];
    const edges = (body.edges ?? m.edges) as CanvasEdge[];
    const stored = new Set(m.nodes.map((n) => `${n.id}:${n.data.contact_id}`));
    const ids = new Set<string>();
    const contacts = new Set<number>();
    for (const n of nodes) {
      const keys = Object.keys(n).sort().join(',');
      const p = people.find((one) => one.id === n.data?.contact_id);
      const known = p && !p.deleted && ofRecord(p, m.record);
      // Contract note 7: a removed node already on the stored map is kept.
      const keptRemoved = stored.has(`${n.id}:${n.data?.contact_id}`);
      if (keys !== 'data,id,position' || ids.has(n.id) || contacts.has(n.data.contact_id) || (!known && !keptRemoved)) errors.nodes = [SAY.PEOPLE];
      ids.add(n.id);
      contacts.add(n.data.contact_id);
    }
    if (nodes.length > NODES_MAX) errors.nodes = [SAY.PEOPLE];
    const seen = new Set<string>();
    for (const e of edges) {
      const keys = Object.keys(e).sort().join(',');
      const key = `${e.source}|${e.target}|${e.label}`;
      if (keys !== 'id,label,source,target' || !ids.has(e.source) || !ids.has(e.target) || e.source === e.target || seen.has(key) || !['', ...RELATIONSHIP_LABELS].includes(e.label)) errors.edges = ['Lines must join two people on the map.'];
      seen.add(key);
    }
    if (edges.length > EDGES_MAX) errors.edges = ['Lines must join two people on the map.'];
    return Object.keys(errors).length ? errors : null;
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    const list = /^\/(?:customers\/(\d+)|accounts\/(\d+))\/canvases\/$/.exec(path);
    if (list && method === 'GET') {
      if (failures > 0) { failures -= 1; return json(500, { detail: 'Try later.' }); }
      const record = list[1] ? RECORDS.find((r) => r.kind === 'organization' && r.id === Number(list[1])) : RECORDS.find((r) => r.kind === 'account' && r.id === Number(list[2]));
      if (!record || !readableRecord(record)) return json(404, { detail: 'Not found.' });
      // Contract note 1: an organisation's list includes its accounts' maps.
      const mine = (m: StoredMap) => sameRecord(m.record, record) || (record.kind === 'organization' && record.id === PIZZA_HUT.id && m.record.id === PIZZA_EMEA.id && m.record.kind === 'account');
      return json(200, { results: maps.filter(mine).sort(byNewest).slice(0, 100).map(row) });
    }

    if (path === '/canvases/' && method === 'GET') {
      if (failures > 0) { failures -= 1; return json(500, { detail: 'Try later.' }); }
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      const rows = maps.filter((m) => readableRecord(m.record) && (!q || m.name.toLowerCase().includes(q) || m.record.name.toLowerCase().includes(q))).sort(byNewest);
      const page = rows.slice(offset, offset + pageSize).map(row);
      return json(200, { results: page, next: offset + pageSize < rows.length ? String(offset + pageSize) : null });
    }

    if (path === '/canvases/' && method === 'POST') {
      const record = typeof body.customer === 'number' ? RECORDS.find((r) => r.kind === 'organization' && r.id === body.customer) : RECORDS.find((r) => r.kind === 'account' && r.id === body.account);
      if (!record || ('customer' in body && 'account' in body)) return json(400, { non_field_errors: ['Choose an organisation or an account.'] });
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > NAME_MAX) return json(400, { name: [SAY.NAME] });
      const made: StoredMap = { id: nextId++, name: body.name, record, nodes: body.start === 'people' ? layout(record) : [], edges: [], version: 1, created_by: ME, updated_by: ME, updated_at: new Date().toISOString() };
      maps.push(made);
      return json(201, payload(made));
    }

    const one = /^\/canvases\/(\d+)\/$/.exec(path);
    const m = one ? maps.find((x) => x.id === Number(one[1]) && readableRecord(x.record)) : undefined;
    if (one && !m) return json(404, { detail: 'Not found.' });
    if (m && method === 'GET') return json(200, payload(m));
    if (m && method === 'PATCH') {
      if (typeof body.version !== 'number') return json(400, { version: ['This field is required.'] });
      if (body.version !== m.version) return json(409, { code: 'CANVAS_CHANGED', detail: SAY.CHANGED });
      const refused = invalid(m, body);
      if (refused) return json(400, refused);
      if (typeof body.name === 'string') m.name = body.name;
      if (body.nodes) m.nodes = body.nodes as CanvasNode[];
      if (body.edges) m.edges = body.edges as CanvasEdge[];
      m.version += 1;
      m.updated_by = ME;
      m.updated_at = new Date().toISOString();
      return json(200, payload(m));
    }
    if (m && method === 'DELETE') {
      if (!mayDelete(m)) return json(403, { detail: SAY.NOT_DELETER });
      maps.splice(maps.indexOf(m), 1);
      return json(204, null);
    }
    return json(404, { detail: `Not stubbed: ${method} ${path}` });
  });
  vi.stubGlobal('fetch', spy);

  /** A second editor (Dana) saves: whatever `change` does, then a new version. */
  function otherSave(id: number, change: (map: StoredMap) => void) {
    const m = maps.find((x) => x.id === id);
    if (!m) throw new Error(`No map ${id}`);
    change(m);
    m.version += 1;
    m.updated_by = DANA;
    m.updated_at = new Date().toISOString();
  }

  return { spy, maps, otherSave };
}

/** The parsed bodies of every `method` request, in order. */
export function sentBodies(spy: ReturnType<typeof vi.fn>, method: string): unknown[] {
  return spy.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === method)
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}
```

Create `src/test/reactFlow.ts`:

```ts
// React Flow's documented jsdom mocks (reactflow.dev "Testing"): a
// ResizeObserver that reports at once, DOMMatrixReadOnly, and element sizes,
// so nodes measure, show (`visibility` stops being hidden) and lines render.
// Call it at the top of a test file; vitest isolates each file's globals.
class ResizeObserverNow {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyStub {
  m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([1-9.]+)\)/)?.[1];
    this.m22 = scale !== undefined ? Number(scale) : 1;
  }
}

let done = false;

export function mockReactFlow(): void {
  if (done) return;
  done = true;
  globalThis.ResizeObserver = ResizeObserverNow as unknown as typeof ResizeObserver;
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = DOMMatrixReadOnlyStub;
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { configurable: true, get(this: HTMLElement) { return parseFloat(this.style.height) || 1; } },
    offsetWidth: { configurable: true, get(this: HTMLElement) { return parseFloat(this.style.width) || 1; } },
  });
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
}
```

- [ ] **Step 7: Type-check, lint, run, commit**

Run: `npx tsc -b --noEmit && npx eslint src/features/canvas src/test/reactFlow.ts && npx vitest run --maxWorkers=2 src/features/canvas`
Expected: no lint output; all canvas feature tests PASS.

```bash
git add src/features/canvas src/test/reactFlow.ts
git commit -m "feat(canvas): the API, refusals and a stateful contract stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The Maps tab and the New map dialog, on both record pages

Spec §2.1; Contract notes 1, 12; Decisions 2, 5.

**Files:**
- Create: `src/components/canvas/MapRow.tsx`, `src/components/canvas/useRecordMaps.ts`, `src/components/canvas/MapsTab.tsx`, `src/components/canvas/NewMapDialog.tsx`
- Test: `src/components/canvas/MapsTab.test.tsx`
- Modify: `src/features/organizations/detailParams.ts` (+ `detailParams.test.ts`), `src/pages/organizations/Details.tsx`, `src/features/organizations/testStory.ts`, `src/pages/organizations/Details.test.tsx`; `src/features/accounts/accountPageParams.ts` (+ `accountPageParams.test.ts`), `src/pages/accounts/Details.tsx`, `src/features/accounts/testAccountPage.ts`, `src/pages/accounts/Details.test.tsx`, `src/components/accounts/detail/storyParts.test.tsx`, `src/components/accounts/detail/houseRules.test.ts`, `src/components/shared/index.ts`
- Delete: `src/components/accounts/detail/CanvasesTab.tsx`, `CanvasesTab.test.tsx`, `src/components/shared/CanvasListTab.tsx`, `CanvasListTab.test.tsx`

**Interfaces:**
- Consumes: Task 3's `fetchRecordMaps`, `createMap`, `createErrors`; Task 1's `defaultMapName`, `peopleText`, `editedBy`, `SAY`, `NAME_MAX`; `BuilderDialog` (`components/segments/BuilderDialog`), `useSubmitOnce`, `useRefusalFocus`, `ANY_REFUSAL`, `INPUT`; `ListSkeleton`, `LIST`, `META`, `ROW_ICON`, `TITLE_BUTTON`, `EmptyState`, `ErrorBlock`, `BUTTON`, `PRIMARY`, `QUIET`, `MONO`; `RecordIcon` (`components/plans/parts`).
- Produces:
  - `MapRow({ row, showRecord }: { row: CanvasRow; showRecord: boolean })` (an `<li>`), `RelativeTime({ iso }: { iso: string })`.
  - `useRecordMaps(record) → { rows: CanvasRow[] | null; error: string | null; retry(): void }`.
  - `MapsTab({ record }: { record: { kind: RecordKind; id: number; name: string | null } })`.
  - `NewMapDialog({ record, onClose }: { record: { kind; id; name: string | null }; onClose(): void })`, navigating to `/canvas/<id>` on success.
  - Tab keys: `DetailTab` gains `'maps'`; `AccountTab`'s `'canvases'` becomes `'maps'`.

- [ ] **Step 1: Write the failing test**

Create `src/components/canvas/MapsTab.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SAY } from '../../features/canvas/canvasOptions';
import { sentBodies, stubCanvases } from '../../features/canvas/testCanvases';
import { Where } from '../../pages/organizations/testList';
import { MapsTab } from './MapsTab';

function renderTab(record = { kind: 'account' as const, id: 12, name: 'Pizza EMEA' }) {
  render(
    <MemoryRouter initialEntries={['/here']}>
      <Routes>
        <Route path="/here" element={<MapsTab record={record} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MapsTab (spec §2.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists the record's maps, newest edit first, with people and who edited", async () => {
    stubCanvases();
    renderTab();
    const list = await screen.findByRole('list', { name: 'Maps' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual(['EMEA buying group', "Dana's renewal map"]);
    expect(rows[0]).toHaveTextContent('4 people');
    expect(rows[0]).toHaveTextContent('Edited by Dana CSM · 2 days ago');
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/canvas/301');
  });

  it('shows a skeleton, then "No maps yet" with New map', async () => {
    stubCanvases({ maps: [] });
    renderTab();
    expect(screen.getByRole('status', { name: 'Loading maps' })).toBeInTheDocument();
    expect(await screen.findByText(SAY.NO_MAPS)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New map' }).length).toBeGreaterThan(0);
  });

  it('reads again after an error', async () => {
    stubCanvases({ failList: 1 });
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'EMEA buying group' })).toBeInTheDocument();
  });

  it('creates a map from the record\'s people once, then opens the editor', async () => {
    const { spy } = stubCanvases();
    renderTab({ kind: 'organization', id: 7, name: 'Pizza Hut' });
    await userEvent.click(await screen.findByRole('button', { name: 'New map' }));
    const dialog = screen.getByRole('dialog', { name: 'New map' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Pizza Hut map');
    expect(within(dialog).getByRole('radio', { name: "From this record's people" })).toBeChecked();
    await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Create map' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/canvas/700'));
    expect(sentBodies(spy, 'POST')).toEqual([{ name: 'Pizza Hut map', customer: 7, start: 'people' }]);
  });

  it('starts a blank account map, and shows a name refusal at the name', async () => {
    const { spy } = stubCanvases();
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'New map' }));
    const dialog = screen.getByRole('dialog', { name: 'New map' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await userEvent.clear(name);
    await userEvent.type(name, '   ');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Blank' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create map' }));
    expect(await within(dialog).findByText(SAY.NAME)).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(sentBodies(spy, 'POST')).toEqual([{ name: '   ', account: 12, start: 'blank' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/canvas/MapsTab.test.tsx`
Expected: FAIL with "Failed to resolve import './MapsTab'".

- [ ] **Step 3: Write the row, the hook, the tab and the dialog**

Create `src/components/canvas/MapRow.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { editedBy, peopleText } from '../../features/canvas/canvasText';
import type { CanvasRow } from '../../features/canvas/canvasTypes';
import { formatRelativeTime } from '../../features/customers/formatters';
import { META, ROW_ICON, TITLE_BUTTON } from '../organizations/detail/listStyles';
import { MONO } from '../organizations/portfolio/styles';
import { RecordIcon } from '../plans/parts';

/** "2 days ago", the leading number in DM Mono. */
export function RelativeTime({ iso }: { iso: string }) {
  const text = formatRelativeTime(iso);
  const match = /^(\d+)(\D.*)$/.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      <span className={MONO}>{match[1]}</span>
      {match[2]}
    </>
  );
}

/** One map (spec §2.1, §2.3): its name to the editor, its record when the
 *  list spans records, how many people, and who edited it last. */
export function MapRow({ row, showRecord }: { row: CanvasRow; showRecord: boolean }) {
  const { who } = editedBy(row);
  return (
    <li data-map={row.id} className="flex gap-3 px-3 py-2.5">
      <span aria-hidden="true" className={ROW_ICON}>
        <Share2 className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="min-w-0 truncate text-[13px] font-semibold text-ink">
          <Link to={`/canvas/${row.id}`} className={TITLE_BUTTON}>
            {row.name}
          </Link>
        </h3>
        <p className={META}>
          {showRecord ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <RecordIcon kind={row.record.kind} />
              <span className="truncate">{row.record.name}</span>
            </span>
          ) : null}
          <span>
            <span className={MONO}>{row.people}</span> {peopleText(row.people)}
          </span>
          <span>
            {who ? `Edited by ${who} · ` : 'Edited '}
            <RelativeTime iso={row.updated_at} />
          </span>
        </p>
      </div>
    </li>
  );
}
```

Create `src/components/canvas/useRecordMaps.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchRecordMaps } from '../../features/canvas/canvasApi';
import type { CanvasRow, RecordKind } from '../../features/canvas/canvasTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type Answer = { key: string; rows: CanvasRow[] | null; error: string | null };

/** A record's maps (spec §1.5), read again on Try again; a slower answer for
 *  another record or attempt is dropped. */
export function useRecordMaps(record: { kind: RecordKind; id: number }) {
  const [attempt, setAttempt] = useState(0);
  const key = `${record.kind}:${record.id}#${attempt}`;
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let alive = true;
    fetchRecordMaps(record).then(
      ({ results }) => alive && setAnswer({ key, rows: results, error: null }),
      (err: unknown) => alive && setAnswer({ key, rows: null, error: errorMessage(err, 'Could not load maps.') }),
    );
    return () => {
      alive = false;
    };
    // `key` carries the record and the attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = answer?.key === key ? answer : null;
  return { rows: current?.rows ?? null, error: current?.error ?? null, retry: () => setAttempt((n) => n + 1) };
}
```

Create `src/components/canvas/MapsTab.tsx`:

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SAY } from '../../features/canvas/canvasOptions';
import type { RecordKind } from '../../features/canvas/canvasTypes';
import { ListSkeleton } from '../organizations/detail/ListParts';
import { LIST } from '../organizations/detail/listStyles';
import { EmptyState, ErrorBlock } from '../organizations/portfolio/PortfolioSections';
import { BUTTON } from '../organizations/portfolio/styles';
import { MapRow } from './MapRow';
import { NewMapDialog } from './NewMapDialog';
import { useRecordMaps } from './useRecordMaps';

/** Maps (spec §2.1): the record's stakeholder maps and New map. */
export function MapsTab({ record }: { record: { kind: RecordKind; id: number; name: string | null } }) {
  const { rows, error, retry } = useRecordMaps(record);
  const [creating, setCreating] = useState(false);
  const newMap = (
    <button type="button" onClick={() => setCreating(true)} className={BUTTON}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      New map
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      {rows && rows.length > 0 ? <div className="flex justify-end">{newMap}</div> : null}
      {error ? (
        <ErrorBlock message={error} onRetry={retry} />
      ) : !rows ? (
        <ListSkeleton label="Loading maps" />
      ) : rows.length === 0 ? (
        <EmptyState title={SAY.NO_MAPS} detail="A map shows who matters on this record and how they connect." action={newMap} />
      ) : (
        <ul aria-label="Maps" className={LIST}>
          {rows.map((row) => (
            <MapRow key={row.id} row={row} showRecord={row.record.kind !== record.kind || row.record.id !== record.id} />
          ))}
        </ul>
      )}
      {creating ? <NewMapDialog record={record} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
```

Create `src/components/canvas/NewMapDialog.tsx`:

```tsx
import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMap } from '../../features/canvas/canvasApi';
import { createErrors, type CreateErrors } from '../../features/canvas/canvasErrors';
import { NAME_MAX } from '../../features/canvas/canvasOptions';
import { defaultMapName } from '../../features/canvas/canvasText';
import type { MapStart, RecordKind } from '../../features/canvas/canvasTypes';
import { PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { ANY_REFUSAL, useRefusalFocus } from '../plans/useRefusalFocus';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BuilderDialog } from '../segments/BuilderDialog';

const STARTS: { value: MapStart; label: string }[] = [
  { value: 'people', label: "From this record's people" },
  { value: 'blank', label: 'Blank' },
];

/** New map (spec §2.1): a name and where to start; submitted once, then the editor. */
export function NewMapDialog({ record, onClose }: { record: { kind: RecordKind; id: number; name: string | null }; onClose: () => void }) {
  const navigate = useNavigate();
  const nameId = useId();
  const nameErrorId = useId();
  const [name, setName] = useState(defaultMapName(record.name));
  const [start, setStart] = useState<MapStart>('people');
  const [errors, setErrors] = useState<CreateErrors>({});
  const { busy, run } = useSubmitOnce();
  const { ref, focusRefusal } = useRefusalFocus<HTMLFormElement>(ANY_REFUSAL);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const where = record.kind === 'organization' ? { customer: record.id } : { account: record.id };
    const outcome = await run(() => createMap({ name, ...where, start }));
    if (!outcome) return;
    if (outcome.ok) {
      navigate(`/canvas/${outcome.value.id}`);
      return;
    }
    setErrors(createErrors(outcome.error));
    focusRefusal();
  }

  return (
    <BuilderDialog title="New map" size="narrow" onClose={onClose}>
      <form ref={ref} onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {errors.form ? (
            <p role="alert" tabIndex={-1} data-error="" className="text-[13px] text-danger">
              {errors.form}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor={nameId} className="text-[13px] font-semibold text-ink">
              Name
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? 'true' : undefined}
              aria-describedby={errors.name ? nameErrorId : undefined}
              className={`${INPUT} ${errors.name ? 'border-danger' : 'border-line'}`}
            />
            {errors.name ? (
              <p id={nameErrorId} className="text-[13px] text-danger">
                {errors.name}
              </p>
            ) : null}
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[13px] font-semibold text-ink">Start from</legend>
            {STARTS.map((option) => (
              <label key={option.value} className="flex min-h-11 items-center gap-2 text-[13px] text-ink sm:min-h-9">
                <input type="radio" name="start" value={option.value} checked={start === option.value} onChange={() => setStart(option.value)} />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line-subtle p-4">
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? 'Creating…' : 'Create map'}
          </button>
        </footer>
      </form>
    </BuilderDialog>
  );
}
```

- [ ] **Step 4: Run the tab test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/canvas/MapsTab.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire the organisation page**

In `src/features/organizations/detailParams.ts`:

```ts
export type DetailTab = 'story' | 'details' | 'people' | 'maps' | 'deals' | 'knowledge' | 'files';

export const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'details', label: 'Details' },
  { key: 'people', label: 'People' },
  { key: 'maps', label: 'Maps' },
  { key: 'deals', label: 'Deals & risks' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'files', label: 'Files' },
];
```

`ACCOUNT_TABS` stays `['story', 'people', 'deals', 'files']` (Decision 2). In `detailParams.test.ts` add:

```ts
it('reads ?tab=maps, the Maps tab after People (canvas spec §2.1)', () => {
  expect(parseDetailParams(new URLSearchParams('tab=maps')).tab).toBe('maps');
  expect(DETAIL_TABS.map(({ label }) => label).slice(2, 4)).toEqual(['People', 'Maps']);
  expect(ACCOUNT_TABS.has('maps')).toBe(false);
});
```

In `src/pages/organizations/Details.tsx`, import `MapsTab` from `../../components/canvas/MapsTab` and add the branch right after the `people` one:

```tsx
            ) : key === 'maps' ? (
              <MapsTab record={{ kind: 'organization', id: orgId, name: row?.name ?? null }} />
```

In `src/features/organizations/testStory.ts`, add `canvases?: CanvasRow[]` to `OrganizationPageStub` (import the type from `../canvas/canvasTypes`) and, next to the `plans` line:

```ts
    if (/^\/customers\/\d+\/canvases\/$/.test(path) && method === 'GET') return json(200, { results: stub.canvases ?? [] });
```

In `src/pages/organizations/Details.test.tsx` add (with `HUT_MAP` from `testCanvasFixtures`, mapped to a row):

```tsx
  it('has a Maps tab after People that lists the organisation\'s maps (canvas spec §2.1)', async () => {
    const { spy } = stubOrganizationPage({ canvases: [{ id: 302, name: 'Pizza Hut leadership', record: PIZZA_HUT, people: 1, updated_at: daysAgo(5), updated_by: ME }] });
    renderOrganizationPage();
    await landed();
    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs.slice(tabs.indexOf('People'), tabs.indexOf('People') + 2)).toEqual(['People', 'Maps']);
    await userEvent.click(screen.getByRole('tab', { name: 'Maps' }));
    expect(await screen.findByRole('link', { name: 'Pizza Hut leadership' })).toHaveAttribute('href', '/canvas/302');
    expect(requestPaths(spy)).toContain('GET /customers/7/canvases/');
  });
```

(`stubOrganizationPage`, `landed`, `requestPaths` and `renderOrganizationPage` are the file's existing helpers; if `stubOrganizationPage` returns the spy under another name, use that name.)

- [ ] **Step 6: Wire the account page**

In `src/features/accounts/accountPageParams.ts`:

```ts
export type AccountTab = 'story' | 'details' | 'people' | 'maps' | 'deals' | 'files' | 'objects';

export const ACCOUNT_PAGE_TABS: { key: AccountTab; label: string }[] = [
  { key: 'story', label: 'Story' },
  { key: 'details', label: 'Details' },
  { key: 'people', label: 'People' },
  { key: 'maps', label: 'Maps' },
  { key: 'deals', label: 'Deals & risks' },
  { key: 'files', label: 'Files' },
  { key: 'objects', label: 'Custom objects' },
];
```

and in `parseAccountPageParams`, read an old link (Decision 2):

```ts
  const raw = search.get('tab') ?? '';
  const tab = raw === 'canvases' ? 'maps' : raw;
```

In `accountPageParams.test.ts`, replace `'Canvases'` in the label list with `'Maps'` at its new place, and the `tab=canvases` expectation with:

```ts
    expect(parse('tab=maps').tab).toBe('maps');
    expect(parse('tab=canvases').tab).toBe('maps');
```

In `src/pages/accounts/Details.tsx` replace the `CanvasesTab` import with `MapsTab` and the branches so `maps` follows `people`:

```tsx
              ) : key === 'maps' ? (
                <MapsTab record={{ kind: 'account', id: accountId, name: row?.name ?? null }} />
              ) : key === 'deals' ? (
```

and the final `else` branch becomes `<CustomObjectsTab accountId={accountId} />` (the `objects` key is the last tab).

In `src/features/accounts/testAccountPage.ts`: type `canvases?: CanvasRow[]` in `AccountLists`, make `ACCOUNT_CANVASES` a `CanvasRow[]` (`{ id: 301, name: 'EMEA buying group', record: { kind: 'account', id: 12, name: 'Pizza EMEA' }, people: 2, updated_at: '2026-09-28T10:00:00Z', updated_by: null }`), drop `canvases` from the bare-array list regex, and answer it before that regex:

```ts
      if (rest === 'canvases/' && method === 'GET') return json(200, { results: lists.canvases.map((item) => ({ ...item })) });
```

and drop `canvases` from the PATCH/DELETE `one` regex.

In `src/pages/accounts/Details.test.tsx`: the tab label list gets `'Maps'` after `'People'` (no `'Canvases'`); `?tab=canvases` now selects the tab named `Maps`; the visiting test clicks `Maps` (keeping `'GET /accounts/12/canvases/'`). In `src/components/accounts/detail/storyParts.test.tsx` the ArrowLeft-from-Story case now lands on the last tab, `Custom objects` (`aria-controls` `t-panel-objects`). In `src/components/accounts/detail/houseRules.test.ts` remove `'../../shared/CanvasListTab.tsx'`. In `src/components/shared/index.ts` remove the two `CanvasListTab` exports.

- [ ] **Step 7: Delete the old tab**

```bash
git rm src/components/accounts/detail/CanvasesTab.tsx src/components/accounts/detail/CanvasesTab.test.tsx src/components/shared/CanvasListTab.tsx src/components/shared/CanvasListTab.test.tsx
```

Run: `grep -rn "CanvasesTab\|CanvasListTab" src`
Expected: no output.

- [ ] **Step 8: Verify and commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/canvas src/pages/organizations/Details.tsx src/pages/accounts/Details.tsx src/features/organizations src/features/accounts && npx vitest run --maxWorkers=2 src/components/canvas src/features/organizations src/features/accounts src/pages/organizations/Details.test.tsx src/pages/accounts/Details.test.tsx src/components/accounts/detail`
Expected: PASS.

```bash
git add -A src/components/canvas src/components/accounts src/components/shared src/features/organizations src/features/accounts src/pages/organizations src/pages/accounts
git commit -m "feat(canvas): Maps tab and New map on organisation and account pages

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: A person's facts, the node card and the line's label menu

Spec §2.2 (node card, hidden and removed people, line labels); Contract notes 4, 5, 14; Decisions 7, 12.

**Files:**
- Create: `src/components/canvas/facts.tsx`, `src/components/canvas/PersonCard.tsx`, `src/components/canvas/EdgeLabelMenu.tsx`
- Test: `src/components/canvas/PersonCard.test.tsx`, `src/components/canvas/EdgeLabelMenu.test.tsx`

**Interfaces:**
- Consumes: Task 1 text; `SENTIMENT_DOT`, `SENTIMENT_TEXT` (`features/contacts/contactsFormat`); `Menu`, `MenuItem` (`components/organizations/detail/Menu`); `MONO`, `FOCUS`.
- Produces:
  - `facts.tsx`: `SentimentWord({ person })`, `ContactedLine({ iso })`, `SurveyLine({ survey })`, `UnsubscribedChip()`, `PersonFactsList({ person })` (a `<ul aria-label="Facts">` of the four, or the pending line).
  - `PersonCard({ kind, person, menu }: { kind: NodeKind; person: PersonFacts | null; menu: ReactNode })`.
  - `EdgeLabelMenu({ label, sentence, editable, selected, onPick, onRemove }: { label: RelationshipLabel; sentence: string; editable: boolean; selected: boolean; onPick(label: RelationshipLabel): void; onRemove(): void })`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/canvas/PersonCard.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SAY, CHECK } from '../../features/canvas/canvasOptions';
import type { PersonFacts } from '../../features/canvas/canvasTypes';
import { daysAgo } from '../../features/canvas/testCanvasFixtures';
import { PersonCard } from './PersonCard';

const ROSA: PersonFacts = {
  name: 'Rosa Diaz', role: 'decision_maker', role_display: 'Decision Maker', sentiment: 'positive', sentiment_label: 'Positive',
  last_contacted_at: daysAgo(12), latest_survey: { type: 'nps', score: 9, answered_at: '2026-10-03T12:00:00Z' }, campaigns_unsubscribed: false,
};

describe('PersonCard (spec §2.2)', () => {
  it('shows name, role, sentiment as a dot and a word, the last contact and the latest survey in mono', () => {
    render(<PersonCard kind="person" person={ROSA} menu={null} />);
    expect(screen.getByText('Rosa Diaz')).toBeInTheDocument();
    expect(screen.getByText('Decision Maker')).toBeInTheDocument();
    const facts = screen.getByRole('list', { name: 'Facts' });
    expect(within(facts).getByText('Positive').closest('[data-sentiment]')).toHaveAttribute('data-sentiment', 'positive');
    expect(facts).toHaveTextContent('Contacted 12 days ago');
    expect(facts).toHaveTextContent('NPS 9 · 3 Oct');
    expect(within(facts).getByText('12')).toHaveClass('font-mono-brand');
    expect(within(facts).getByText('9')).toHaveClass('font-mono-brand');
    expect(screen.queryByText(SAY.UNSUBSCRIBED)).toBeNull();
  });

  it('warns in words with an icon when nobody has been in touch for 60+ days, and shows Unsubscribed', () => {
    render(<PersonCard kind="person" person={{ ...ROSA, last_contacted_at: daysAgo(70), campaigns_unsubscribed: true }} menu={null} />);
    const stale = screen.getByText(/Not contacted in/).closest('[data-stale]');
    expect(stale).toHaveTextContent('Not contacted in 60+ days');
    expect(stale?.querySelector('svg')).not.toBeNull();
    expect(screen.getByText(SAY.UNSUBSCRIBED)).toBeInTheDocument();
  });

  it('says a newly added person has facts after saving (Contract note 14)', () => {
    render(<PersonCard kind="person" person={{ ...ROSA, pending: true }} menu={null} />);
    expect(screen.getByText(CHECK.PENDING)).toBeInTheDocument();
    expect(screen.queryByText('Positive')).toBeNull();
  });

  it('names nobody on a hidden node, and offers its menu on a removed one', () => {
    const { rerender } = render(<PersonCard kind="hidden" person={null} menu={null} />);
    expect(screen.getByText(SAY.HIDDEN)).toBeInTheDocument();
    rerender(<PersonCard kind="removed" person={null} menu={<button type="button">menu</button>} />);
    expect(screen.getByText(SAY.REMOVED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'menu' })).toBeInTheDocument();
  });
});
```

Create `src/components/canvas/EdgeLabelMenu.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EdgeLabelMenu } from './EdgeLabelMenu';

describe('EdgeLabelMenu (spec §2.2: a small menu with the four labels plus No label)', () => {
  it('picks a label from the menu', async () => {
    const onPick = vi.fn();
    render(<EdgeLabelMenu label="" sentence="Rosa Diaz is linked to Tom Lee" editable selected={false} onPick={onPick} onRemove={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Relationship: No label. Rosa Diaz is linked to Tom Lee' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Reports to', 'Introduced by', 'Blocks', 'Influences', 'No label']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Blocks' }));
    expect(onPick).toHaveBeenCalledWith('Blocks');
  });

  it('offers Remove only on a selected line', async () => {
    const onRemove = vi.fn();
    const { rerender } = render(<EdgeLabelMenu label="Blocks" sentence="Rosa Diaz blocks Tom Lee" editable selected={false} onPick={() => {}} onRemove={onRemove} />);
    expect(screen.queryByRole('button', { name: 'Remove the line: Rosa Diaz blocks Tom Lee' })).toBeNull();
    rerender(<EdgeLabelMenu label="Blocks" sentence="Rosa Diaz blocks Tom Lee" editable selected onPick={() => {}} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove the line: Rosa Diaz blocks Tom Lee' }));
    expect(onRemove).toHaveBeenCalled();
  });

  it('shows a read-only label as text, and nothing for no label', () => {
    const { rerender } = render(<EdgeLabelMenu label="Influences" sentence="x" editable={false} selected={false} onPick={() => {}} onRemove={() => {}} />);
    expect(screen.getByText('Influences')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<EdgeLabelMenu label="" sentence="x" editable={false} selected={false} onPick={() => {}} onRemove={() => {}} />);
    expect(screen.queryByText('No label')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/canvas/PersonCard.test.tsx src/components/canvas/EdgeLabelMenu.test.tsx`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Write the facts, the card and the menu**

Create `src/components/canvas/facts.tsx`:

```tsx
import { AlertTriangle, MailX } from 'lucide-react';
import { CHECK, SAY } from '../../features/canvas/canvasOptions';
import { contacted, sentimentOf, surveyParts } from '../../features/canvas/canvasText';
// SENTIMENT_DOT/TEXT are keyed by the same three slugs (Contract note 4).
import type { LatestSurvey, PersonFacts } from '../../features/canvas/canvasTypes';
import { SENTIMENT_DOT, SENTIMENT_TEXT } from '../../features/contacts/contactsFormat';
import { MONO } from '../organizations/portfolio/styles';

/** Sentiment as a dot and its word (never colour alone). */
export function SentimentWord({ person }: { person: PersonFacts }) {
  const s = sentimentOf(person);
  return (
    <span data-sentiment={s.reading} className={`inline-flex items-center gap-1 font-semibold ${SENTIMENT_TEXT[s.reading]}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${SENTIMENT_DOT[s.reading]}`} />
      {s.word}
    </span>
  );
}

/** "Contacted 12 days ago", or the warning with its icon and words. */
export function ContactedLine({ iso }: { iso: string | null }) {
  const c = contacted(iso);
  return (
    <span data-stale={c.stale ? '' : undefined} className={`inline-flex items-center gap-1 ${c.stale ? 'font-semibold text-warning' : ''}`}>
      {c.stale ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      <span>
        {c.lead}
        {c.figure ? <span className={MONO}>{c.figure}</span> : null}
        {c.tail}
      </span>
    </span>
  );
}

/** "NPS 9 · 3 Oct", the score and day in DM Mono. */
export function SurveyLine({ survey }: { survey: LatestSurvey }) {
  const p = surveyParts(survey);
  return (
    <span>
      {p.label} <span className={MONO}>{p.score}</span> · <span className={MONO}>{p.day}</span>
    </span>
  );
}

export function UnsubscribedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 font-semibold text-ink-muted">
      <MailX className="h-3.5 w-3.5" aria-hidden="true" />
      {SAY.UNSUBSCRIBED}
    </span>
  );
}

/** A person's live facts (spec §2.2), as one short list. */
export function PersonFactsList({ person }: { person: PersonFacts }) {
  if (person.pending) return <p className="text-[11px] text-ink-muted">{CHECK.PENDING}</p>;
  return (
    <ul aria-label="Facts" className="flex flex-col gap-1 text-[11px] text-ink-muted">
      <li>
        <SentimentWord person={person} />
      </li>
      <li>
        <ContactedLine iso={person.last_contacted_at} />
      </li>
      {person.latest_survey ? (
        <li>
          <SurveyLine survey={person.latest_survey} />
        </li>
      ) : null}
      {person.campaigns_unsubscribed ? (
        <li>
          <UnsubscribedChip />
        </li>
      ) : null}
    </ul>
  );
}
```

Create `src/components/canvas/PersonCard.tsx`:

```tsx
import type { ReactNode } from 'react';
import { EyeOff, UserX } from 'lucide-react';
import type { NodeKind } from '../../features/canvas/canvasBoard';
import { SAY } from '../../features/canvas/canvasOptions';
import type { PersonFacts } from '../../features/canvas/canvasTypes';
import { PersonFactsList } from './facts';

/** A node's body (spec §2.2): a person with their facts; someone the reader
 *  can't open, with no details; or a removed contact. `menu` is the ⋯ menu. */
export function PersonCard({ kind, person, menu }: { kind: NodeKind; person: PersonFacts | null; menu: ReactNode }) {
  if (kind !== 'person' || !person) {
    const Icon = kind === 'hidden' ? EyeOff : UserX;
    return (
      <div className="flex items-center gap-2 p-3">
        <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-muted">{kind === 'hidden' ? SAY.HIDDEN : SAY.REMOVED}</span>
        {menu}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{person.name}</p>
          <p className="truncate text-[11px] text-ink-muted">{person.role_display}</p>
        </div>
        {menu}
      </div>
      <PersonFactsList person={person} />
    </div>
  );
}
```

Create `src/components/canvas/EdgeLabelMenu.tsx`:

```tsx
import { X } from 'lucide-react';
import { RELATIONSHIP_LABELS } from '../../features/canvas/canvasOptions';
import { labelText } from '../../features/canvas/canvasText';
import type { RelationshipLabel } from '../../features/canvas/canvasTypes';
import { Menu, type MenuItem } from '../organizations/detail/Menu';
import { FOCUS } from '../organizations/portfolio/styles';

const PILL = `inline-flex min-h-11 sm:min-h-9 items-center rounded-full border border-line bg-surface px-2 text-[11px] font-semibold text-ink hover:bg-subtle ${FOCUS}`;
const REMOVE = `inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-muted hover:text-danger ${FOCUS}`;
const LABELS: RelationshipLabel[] = [...RELATIONSHIP_LABELS, ''];

/** A line's label (spec §2.2): a small menu of the four labels and No label;
 *  Remove on a selected line. Read-only, just the words. */
export function EdgeLabelMenu({
  label,
  sentence,
  editable,
  selected,
  onPick,
  onRemove,
}: {
  label: RelationshipLabel;
  sentence: string;
  editable: boolean;
  selected: boolean;
  onPick: (label: RelationshipLabel) => void;
  onRemove: () => void;
}) {
  if (!editable) {
    return label ? <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink">{label}</span> : null;
  }
  const items: MenuItem[] = LABELS.map((option) => ({ key: option || 'none', label: labelText(option), onSelect: () => onPick(option) }));
  return (
    <span className="flex items-center gap-1">
      <Menu label={`Relationship: ${labelText(label)}. ${sentence}`} trigger={labelText(label)} triggerClassName={PILL} items={items} align="start" />
      {selected ? (
        <button type="button" onClick={onRemove} aria-label={`Remove the line: ${sentence}`} className={REMOVE}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/canvas/PersonCard.test.tsx src/components/canvas/EdgeLabelMenu.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint and commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/canvas`

```bash
git add src/components/canvas
git commit -m "feat(canvas): live person facts, node card and line label menu

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The editor: load, header, open plans, board and Save

Spec §2.2 (header, open plans strip, board, lines by dragging, Save with `version`, field refusals summary); Contract notes 8, 10, 11, 15; Decisions 4, 7, 15.

**Files:**
- Create: `src/components/canvas/useMap.ts`, `src/components/canvas/MapContext.ts`, `src/components/canvas/MapHeader.tsx`, `src/components/canvas/OpenPlansStrip.tsx`, `src/components/canvas/PersonNode.tsx`, `src/components/canvas/RelationshipEdge.tsx`, `src/components/canvas/MapBoard.tsx`, `src/pages/canvas/MapEditor.tsx`, `src/pages/canvas/testPages.tsx`
- Test: `src/pages/canvas/MapEditor.test.tsx`
- Modify: `src/App.tsx` (`canvas/:id` → `MapEditor`, `canvas/create` → `<Navigate to="/canvas" replace />`)
- Delete: `src/pages/canvas/CanvasEditor.tsx`, `CanvasEditor.test.tsx`, `ContactNode.tsx`, `CanvasEdge.tsx`, `CanvasSidebar.tsx`

**Interfaces:**
- Consumes: Tasks 1-5; `useSubmitOnce`, `useRefusalFocus`, `FORM_REFUSAL`; `OrganizationsFrame`; `StatusPill`, `NextDue`, `RecordLink` (`components/plans/parts`); `isOpen`, `newPlanPath`, `recordHref` (`features/plans/planText`); `useMediaQuery`, `MD`; `@xyflow/react`.
- Produces:
  - `useMap(id: number)` → `MapApi`: `{ canvas: Canvas | null; error: string | null; missing: boolean; name: string; setName(v); nodes: FlowNode[]; edges: FlowEdge[]; people: People; hidden: ReadonlySet<string>; tray: NotOnMap[]; dirty: boolean; saving: boolean; refusal: SaveRefusal | null; notice: string | null; onNodesChange; onEdgesChange; connect(c: Connection); addFromTray(p: NotOnMap); removePerson(nodeId); link(source, target, label); relabelLine(id, label); removeLine(id); save(): Promise<void>; reload(): void; nameOf(nodeId): string }`.
  - `MapContext` / `useMapContext()` → `{ editable: boolean; people: People; hidden: ReadonlySet<string>; nameOf(nodeId): string; openPerson(nodeId): void; askRelationship(nodeId): void; removePerson(nodeId): void; relabelLine(id, label): void; removeLine(id): void }`.
  - `MapHeader({ map, editable, onDelete, refusalRef })`, `OpenPlansStrip({ plans, record })`, `PersonNode`, `RelationshipEdge`, `MapBoard({ map, editable, onOpen })`, `MapEditor`.
  - `testPages.tsx`: `renderCanvas(url, { width?, nav? })` with routes `/canvas`, `/canvas/:id`, `/organizations/:id` and `/accounts/:id` (each a `MapsTab` stand-in with `Where`), `*` → `Where`.

- [ ] **Step 1: Write the test render**

Create `src/pages/canvas/testPages.tsx`:

```tsx
// Test-only helpers, never hot-reloaded.
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { MapsTab } from '../../components/canvas/MapsTab';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore } from '../rules/testPages';
import { CanvasPage } from './CanvasPage';
import { MapEditor } from './MapEditor';

const NAMES: Record<string, string> = { organization: 'Pizza Hut', account: 'Pizza EMEA' };

/** A record page's Maps tab, standing in for the organisation and account pages. */
function RecordStandIn({ kind }: { kind: 'organization' | 'account' }) {
  const { id } = useParams();
  return (
    <>
      <MapsTab record={{ kind, id: Number(id), name: NAMES[kind] }} />
      <Where />
    </>
  );
}

/** The Canvas routes on the real store and router, as App.tsx routes them.
 *  The signed-in user is Alice (id 1). Only fetch is stubbed (stubCanvases). */
export function renderCanvas(url: string, { width = 1440, nav = false }: { width?: number; nav?: boolean } = {}) {
  setViewport(width);
  const store = makeRulesStore();
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route path="/canvas" element={<><CanvasPage /><Where /></>} />
            <Route path="/canvas/:id" element={<><MapEditor /><Where /></>} />
            <Route path="/organizations/:id" element={<RecordStandIn kind="organization" />} />
            <Route path="/accounts/:id" element={<RecordStandIn kind="account" />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}
```

- [ ] **Step 2: Write the failing test**

Create `src/pages/canvas/MapEditor.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/canvas/canvasOptions';
import { EMEA_PLAN } from '../../features/canvas/testCanvasFixtures';
import { sentBodies, stubCanvases } from '../../features/canvas/testCanvases';
import { mockReactFlow } from '../../test/reactFlow';
import { resetViewport } from '../../test/viewport';
import { renderCanvas } from './testPages';

mockReactFlow();

describe('MapEditor: load, header, plans, board, save (spec §2.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the name, the record, who edited, the open plans and every node class', async () => {
    stubCanvases({ plans: [EMEA_PLAN] });
    renderCanvas('/canvas/301');
    expect(await screen.findByRole('textbox', { name: 'Map name' })).toHaveValue('EMEA buying group');
    expect(screen.getByRole('link', { name: 'Pizza EMEA' })).toHaveAttribute('href', '/accounts/12');
    expect(screen.getByText(/Edited by Dana CSM/)).toBeInTheDocument();
    const plans = screen.getByRole('region', { name: 'Open plans' });
    expect(within(plans).getByRole('link', { name: /EMEA onboarding/ })).toHaveAttribute('href', '/projects/41');
    expect(within(plans).getByText('On track')).toBeInTheDocument();
    expect(screen.getByText('Rosa Diaz')).toBeInTheDocument();
    expect(screen.getByText(SAY.HIDDEN)).toBeInTheDocument();
    expect(screen.queryByText('Hal Hidden')).toBeNull();
    expect(screen.getByText(SAY.REMOVED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByText(SAY.UNSAVED)).toBeNull();
  });

  it('says No open plans with Start a plan', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    const plans = await screen.findByRole('region', { name: 'Open plans' });
    expect(plans).toHaveTextContent(SAY.NO_PLANS);
    expect(within(plans).getByRole('link', { name: 'Start a plan' })).toHaveAttribute('href', '/accounts/12/plans/new');
  });

  it('renames, shows Unsaved changes, and saves once with the version and only the contract keys', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'EMEA buyers');
    expect(screen.getByText(SAY.UNSAVED)).toBeInTheDocument();
    await userEvent.dblClick(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByText(SAY.UNSAVED)).toBeNull());
    const [body] = sentBodies(spy, 'PATCH') as { name: string; version: number; nodes: object[]; edges: object[] }[];
    expect(sentBodies(spy, 'PATCH')).toHaveLength(1);
    expect(body.name).toBe('EMEA buyers');
    expect(body.version).toBe(4);
    expect(body.nodes.map((n) => Object.keys(n).sort())).toEqual(Array(4).fill(['data', 'id', 'position']));
    expect(body.edges).toEqual([{ id: 'e1', source: 'n1', target: 'n2', label: 'Reports to' }]);
    expect(screen.getByText(/Edited by Alice/)).toBeInTheDocument();
  });

  it('lists field refusals in a summary that takes focus', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent(SAY.NAME);
    expect(summary).toHaveFocus();
  });

  it('labels a line from its menu', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: /^Relationship: Reports to\./ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Influences' }));
    expect(screen.getByRole('button', { name: /^Relationship: Influences\. Rosa Diaz influences Tom Lee/ })).toBeInTheDocument();
    expect(screen.getByText(SAY.UNSAVED)).toBeInTheDocument();
  });

  it('says a missing map is missing', async () => {
    stubCanvases();
    renderCanvas('/canvas/304');
    expect(await screen.findByText(SAY.MISSING)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/canvas/MapEditor.test.tsx`
Expected: FAIL with "Failed to resolve import './MapEditor'".

- [ ] **Step 4: Write the state hook and the context**

Create `src/components/canvas/MapContext.ts`:

```ts
import { createContext, useContext } from 'react';
import type { People } from '../../features/canvas/canvasBoard';
import type { RelationshipLabel } from '../../features/canvas/canvasTypes';

/** What a node or a line on the board may read and do. React Flow node data
 *  holds only `contact_id` (spec §0), so the rest travels here. */
export interface MapContextValue {
  editable: boolean;
  people: People;
  hidden: ReadonlySet<string>;
  nameOf: (nodeId: string) => string;
  openPerson: (nodeId: string) => void;
  askRelationship: (nodeId: string) => void;
  removePerson: (nodeId: string) => void;
  relabelLine: (id: string, label: RelationshipLabel) => void;
  removeLine: (id: string) => void;
}

export const MapContext = createContext<MapContextValue | null>(null);

export function useMapContext(): MapContextValue {
  const value = useContext(MapContext);
  if (!value) throw new Error('useMapContext needs a MapContext provider');
  return value;
}
```

Create `src/components/canvas/useMap.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react';
import { fetchMap, saveMap } from '../../features/canvas/canvasApi';
import {
  addPerson,
  addRelationship,
  nodeKind,
  pendingPerson,
  peopleOf,
  relabel,
  removeEdge,
  removeNode,
  sameMap,
  toFlow,
  toWrite,
  trayOf,
  type Change,
  type FlowEdge,
  type FlowNode,
  type People,
} from '../../features/canvas/canvasBoard';
import { loadError, saveRefusal, type SaveRefusal } from '../../features/canvas/canvasErrors';
import { SAY } from '../../features/canvas/canvasOptions';
import type { Canvas, NotOnMap, RelationshipLabel } from '../../features/canvas/canvasTypes';
import { useSubmitOnce } from '../plans/useSubmitOnce';

type Load = { key: string; canvas: Canvas | null; error: string | null; missing: boolean };

/** One map in the editor (spec §2.2): read, edited locally, saved whole
 *  with its `version`; a save's answer or Reload replaces the local copy. */
export function useMap(id: number) {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [load, setLoad] = useState<Load | null>(null);
  const [name, setName] = useState('');
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [people, setPeople] = useState<People>({});
  const [refusal, setRefusal] = useState<SaveRefusal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce();

  const adopt = useCallback((canvas: Canvas, at: string) => {
    const flow = toFlow(canvas);
    setLoad({ key: at, canvas, error: null, missing: false });
    setName(canvas.name);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setPeople(peopleOf(canvas));
    setRefusal(null);
    setNotice(null);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchMap(id).then(
      (canvas) => alive && adopt(canvas, key),
      (err: unknown) => {
        if (!alive) return;
        const { missing, message } = loadError(err);
        setLoad({ key, canvas: null, error: message, missing });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key, adopt]);

  const canvas = load?.canvas ?? null;
  const hidden = useMemo(() => new Set(canvas?.hidden ?? []), [canvas]);
  const saved = useMemo(() => (canvas ? toWrite(toFlow(canvas).nodes, toFlow(canvas).edges) : null), [canvas]);
  const dirty = canvas !== null && saved !== null && (name !== canvas.name || !sameMap(toWrite(nodes, edges), saved));
  const tray = useMemo(() => (canvas ? trayOf(canvas, nodes, people) : []), [canvas, nodes, people]);

  /** Applies a board edit, or shows why not (Decision 14). */
  function apply<T>(change: Change<T>, set: (value: T) => void) {
    if (change.ok) {
      set(change.value);
      setNotice(null);
    } else setNotice(change.refused);
  }

  const nameOf = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return SAY.REMOVED;
    const kind = nodeKind(node, hidden, people);
    return kind === 'person' ? people[String(node.data.contact_id)].name : kind === 'hidden' ? SAY.HIDDEN : SAY.REMOVED;
  };

  async function save() {
    if (!canvas) return;
    // Always the whole map, nodes and edges together (Contract notes 7-8).
    const outcome = await run(() => saveMap(id, { name, ...toWrite(nodes, edges), version: canvas.version }));
    if (!outcome) return;
    if (outcome.ok) adopt(outcome.value, key);
    else setRefusal(saveRefusal(outcome.error));
  }

  return {
    canvas,
    error: load?.key === key ? load.error : null,
    missing: load?.key === key ? load.missing : false,
    name,
    setName,
    nodes,
    edges,
    people,
    hidden,
    tray,
    dirty,
    saving: busy,
    refusal,
    notice,
    nameOf,
    onNodesChange: (changes: NodeChange<FlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current)),
    onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => setEdges((current) => applyEdgeChanges(changes, current)),
    connect: (c: Connection) => apply(addRelationship(edges, c.source, c.target, ''), setEdges),
    addFromTray: (person: NotOnMap) =>
      apply(addPerson(nodes, person), (next) => {
        setNodes(next);
        setPeople((current) => (current[String(person.id)] ? current : { ...current, [String(person.id)]: pendingPerson(person) }));
      }),
    removePerson: (nodeId: string) => {
      const next = removeNode(nodes, edges, nodeId);
      setNodes(next.nodes);
      setEdges(next.edges);
      setNotice(null);
    },
    link: (source: string, target: string, label: RelationshipLabel) => apply(addRelationship(edges, source, target, label), setEdges),
    relabelLine: (lineId: string, label: RelationshipLabel) => apply(relabel(edges, lineId, label), setEdges),
    removeLine: (lineId: string) => setEdges((current) => removeEdge(current, lineId)),
    save,
    reload: () => setAttempt((n) => n + 1),
  };
}

export type MapApi = ReturnType<typeof useMap>;
```

(The PATCH sends `name` exactly as typed; the server owns "Give the map a name.")

- [ ] **Step 5: Write the node, the line and the board**

Create `src/components/canvas/PersonNode.tsx`:

```tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { nodeKind, type FlowNode } from '../../features/canvas/canvasBoard';
import { useMapContext } from './MapContext';
import { NodeMenu } from './NodeMenu';
import { PersonCard } from './PersonCard';

const HANDLE = '!h-3 !w-3 !border-2 !border-line-strong !bg-surface';

/** A person on the board (spec §2.2). Drag handles top and bottom; the ⋯
 *  menu (44px) does everything a drag does. Hidden people have no menu. */
export const PersonNode = memo(function PersonNode({ id, data, selected }: NodeProps<FlowNode>) {
  const map = useMapContext();
  const kind = nodeKind({ id, data, position: { x: 0, y: 0 }, type: 'person' }, map.hidden, map.people);
  const person = map.people[String(data.contact_id)] ?? null;
  const menu = map.editable && kind !== 'hidden' ? <NodeMenu nodeId={id} kind={kind} name={map.nameOf(id)} /> : null;
  return (
    <div data-node={id} data-kind={kind} className={`w-52 rounded-xl border bg-surface shadow-sm ${selected ? 'border-line-strong outline outline-2 outline-accent' : 'border-line'}`}>
      <Handle type="target" position={Position.Top} className={HANDLE} isConnectable={map.editable} />
      <PersonCard kind={kind} person={person} menu={menu} />
      <Handle type="source" position={Position.Bottom} className={HANDLE} isConnectable={map.editable} />
    </div>
  );
});
```

Create `src/components/canvas/NodeMenu.tsx` now with the one item this task needs; Task 7 adds the rest:

```tsx
import type { KeyboardEvent, MouseEvent } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { NodeKind } from '../../features/canvas/canvasBoard';
import { Menu, type MenuItem } from '../organizations/detail/Menu';
import { FOCUS } from '../organizations/portfolio/styles';
import { useMapContext } from './MapContext';

/** 44px at every width (spec §2.4); `nodrag nopan` so React Flow leaves it alone. */
const TRIGGER = `nodrag nopan inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink ${FOCUS}`;

/** A node's ⋯ menu: every edit without dragging (spec §2.2). Clicks and keys
 *  stop here, so the node is not selected or moved by them. */
export function NodeMenu({ nodeId, kind, name }: { nodeId: string; kind: NodeKind; name: string }) {
  const map = useMapContext();
  const items: MenuItem[] = [{ key: 'remove', label: 'Remove from map', onSelect: () => map.removePerson(nodeId), danger: true }];
  const stop = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();
  void kind;
  return (
    <span className="nodrag nopan" onClick={stop} onKeyDown={stop}>
      <Menu label={`Actions for ${name}`} trigger={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />} triggerClassName={TRIGGER} items={items} />
    </span>
  );
}
```

Create `src/components/canvas/RelationshipEdge.tsx`:

```tsx
import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import type { FlowEdge } from '../../features/canvas/canvasBoard';
import { relationshipText } from '../../features/canvas/canvasText';
import { EdgeLabelMenu } from './EdgeLabelMenu';
import { useMapContext } from './MapContext';

/** A line (spec §2.2): one neutral stroke (Decision 7); its label's words
 *  carry the meaning, picked from a small menu. */
export const RelationshipEdge = memo(function RelationshipEdge(props: EdgeProps<FlowEdge>) {
  const map = useMapContext();
  const [path, labelX, labelY] = getBezierPath(props);
  const label = props.data?.label ?? '';
  const sentence = relationshipText(map.nameOf(props.source), label, map.nameOf(props.target));
  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={{ stroke: 'var(--border-strong)', strokeWidth: props.selected ? 3 : 2 }} />
      <EdgeLabelRenderer>
        <div className="nodrag nopan absolute" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}>
          <EdgeLabelMenu
            label={label}
            sentence={sentence}
            editable={map.editable}
            selected={Boolean(props.selected)}
            onPick={(next) => map.relabelLine(props.id, next)}
            onRemove={() => map.removeLine(props.id)}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
```

Create `src/components/canvas/MapBoard.tsx`:

```tsx
import { Background, BackgroundVariant, Panel, ReactFlow, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import type { FlowNode } from '../../features/canvas/canvasBoard';
import { FOCUS } from '../organizations/portfolio/styles';
import { PersonNode } from './PersonNode';
import { RelationshipEdge } from './RelationshipEdge';
import type { MapApi } from './useMap';

const nodeTypes = { person: PersonNode };
const edgeTypes = { relationship: RelationshipEdge };
const ZOOM = `inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink ${FOCUS}`;
/** dataTransfer type for a tray person dragged onto the board. */
export const PERSON_DRAG = 'application/x-revenact-person';

function Zoom() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  // No durations: keyboard-driven changes never animate (spec §2.2).
  return (
    <Panel position="top-right" className="flex gap-1 rounded-lg border border-line bg-surface p-1 shadow-sm">
      <button type="button" onClick={() => zoomIn()} aria-label="Zoom in" className={ZOOM}>
        <ZoomIn className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => zoomOut()} aria-label="Zoom out" className={ZOOM}>
        <ZoomOut className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => fitView()} aria-label="Fit the map" className={ZOOM}>
        <Maximize className="h-4 w-4" aria-hidden="true" />
      </button>
    </Panel>
  );
}

/** The board (spec §2.2). Read-only boards pan and zoom only. */
export function MapBoard({ map, editable, onOpen }: { map: MapApi; editable: boolean; onOpen: (nodeId: string) => void }) {
  return (
    <div
      data-part="board"
      aria-label="Map board"
      role="region"
      className="relative h-[min(70dvh,720px)] min-h-[420px] w-full min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-base"
      onDragOver={(event) => {
        if (editable && event.dataTransfer.types.includes(PERSON_DRAG)) event.preventDefault();
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData(PERSON_DRAG);
        const person = map.tray.find((p) => String(p.id) === raw);
        if (!editable || !person) return;
        event.preventDefault();
        map.addFromTray(person);
      }}
    >
      <ReactFlowProvider>
        <ReactFlow<FlowNode>
          nodes={map.nodes}
          edges={map.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={map.onNodesChange}
          onEdgesChange={map.onEdgesChange}
          onConnect={map.connect}
          onNodeClick={(_, node) => onOpen(node.id)}
          nodesDraggable={editable}
          nodesConnectable={editable}
          elementsSelectable={editable}
          edgesFocusable={editable}
          deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
          minZoom={0.3}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border-strong)" />
          <Zoom />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
```

- [ ] **Step 6: Write the header, the strip and the page**

Create `src/components/canvas/OpenPlansStrip.tsx`:

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { SAY } from '../../features/canvas/canvasOptions';
import type { RecordRef } from '../../features/canvas/canvasTypes';
import { isOpen, newPlanPath } from '../../features/plans/planText';
import type { PlanRow } from '../../features/plans/planTypes';
import { BUTTON, FOCUS } from '../organizations/portfolio/styles';
import { NextDue, StatusPill } from '../plans/parts';

/** The record's open plans above the board (spec §2.2). */
export function OpenPlansStrip({ plans, record }: { plans: PlanRow[]; record: RecordRef }) {
  const headingId = useId();
  const open = plans.filter((plan) => isOpen(plan.status));
  return (
    <section aria-labelledby={headingId} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2">
      <h2 id={headingId} className="text-[13px] font-semibold text-ink">
        Open plans
      </h2>
      {open.length === 0 ? (
        <>
          <span className="text-[13px] text-ink-muted">{SAY.NO_PLANS}</span>
          <Link to={newPlanPath(record)} className={BUTTON}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Start a plan
          </Link>
        </>
      ) : (
        <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1">
          {open.map((plan) => (
            <li key={plan.id}>
              <Link to={`/projects/${plan.id}`} className={`inline-flex min-h-11 sm:min-h-9 items-center gap-2 rounded-lg text-[13px] text-ink hover:underline ${FOCUS}`}>
                <span className="truncate font-semibold">{plan.name}</span>
                <StatusPill status={plan.status} />
                <NextDue date={plan.next_due} overdue={plan.is_overdue} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Create `src/components/canvas/MapHeader.tsx`:

```tsx
import { MoreHorizontal } from 'lucide-react';
import { NAME_MAX, SAY } from '../../features/canvas/canvasOptions';
import { editedBy } from '../../features/canvas/canvasText';
import { Menu } from '../organizations/detail/Menu';
import { COLUMN_ICON_BUTTON, FOCUS, PRIMARY } from '../organizations/portfolio/styles';
import { RecordLink } from '../plans/parts';
import { RelativeTime } from './MapRow';
import type { MapApi } from './useMap';

const NAME = `min-h-11 sm:min-h-9 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-[22px] font-semibold text-ink hover:border-line focus:border-line-strong ${FOCUS}`;

/** The editor's header (spec §2.2): the name (inline), the record, who
 *  edited, Unsaved changes, Save, and ⋯ with Delete for those who may. */
export function MapHeader({ map, editable, onDelete }: { map: MapApi; editable: boolean; onDelete: () => void }) {
  const canvas = map.canvas!;
  const { who } = editedBy(canvas);
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="min-w-0 flex-1">
        {editable ? (
          <input aria-label="Map name" value={map.name} maxLength={NAME_MAX} onChange={(e) => map.setName(e.target.value)} className={NAME} />
        ) : (
          <h1 className="truncate px-2 text-[22px] font-semibold text-ink">{canvas.name}</h1>
        )}
        <p className="flex flex-wrap items-center gap-x-2 px-2 text-[13px] text-ink-muted">
          <RecordLink record={canvas.record} />
          <span>
            {who ? `Edited by ${who} · ` : 'Edited '}
            <RelativeTime iso={canvas.updated_at} />
          </span>
        </p>
      </div>
      {editable ? (
        <div className="flex items-center gap-2">
          {map.dirty ? (
            <span role="status" className="text-[13px] text-ink-muted">
              {SAY.UNSAVED}
            </span>
          ) : null}
          <button type="button" onClick={() => void map.save()} disabled={!map.dirty || map.saving} className={PRIMARY}>
            {map.saving ? 'Saving…' : 'Save'}
          </button>
          {canvas.can_delete ? (
            <Menu
              label="Map actions"
              trigger={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
              triggerClassName={COLUMN_ICON_BUTTON}
              items={[{ key: 'delete', label: 'Delete', onSelect: onDelete, danger: true }]}
            />
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
```

Create `src/pages/canvas/MapEditor.tsx` (Tasks 7-8 add the panel, tray, dialogs, guard and phone view to this page):

```tsx
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { MapBoard } from '../../components/canvas/MapBoard';
import { MapContext, type MapContextValue } from '../../components/canvas/MapContext';
import { MapHeader } from '../../components/canvas/MapHeader';
import { OpenPlansStrip } from '../../components/canvas/OpenPlansStrip';
import { useMap } from '../../components/canvas/useMap';
import { ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { FORM_REFUSAL, useRefusalFocus } from '../../components/plans/useRefusalFocus';
import { parseMapId } from '../../features/canvas/canvasParams';
import { SAY } from '../../features/canvas/canvasOptions';
import { MD, useMediaQuery } from '../../lib/useMediaQuery';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

function EditorSkeleton() {
  return (
    <div role="status" aria-label="Loading map" className="flex flex-col gap-3">
      <span aria-hidden="true" className="block h-12 w-1/2 animate-pulse rounded-lg bg-subtle" />
      <span aria-hidden="true" className="block h-10 animate-pulse rounded-lg bg-subtle" />
      <span aria-hidden="true" className="block h-[420px] animate-pulse rounded-xl bg-subtle" />
    </div>
  );
}

/** A map (spec §2.2). */
export function MapEditor() {
  const { id: raw } = useParams();
  const id = parseMapId(raw);
  const wide = useMediaQuery(MD);
  const editable = wide;
  const map = useMap(id ?? 0);
  const { ref, focusRefusal } = useRefusalFocus<HTMLDivElement>(FORM_REFUSAL);
  useEffect(() => {
    if (map.refusal) focusRefusal();
  }, [map.refusal, focusRefusal]);

  const context = useMemo<MapContextValue>(
    () => ({
      editable,
      people: map.people,
      hidden: map.hidden,
      nameOf: map.nameOf,
      openPerson: () => {},
      askRelationship: () => {},
      removePerson: map.removePerson,
      relabelLine: map.relabelLine,
      removeLine: map.removeLine,
    }),
    // The map's functions close over its state; rebuild when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, map.people, map.hidden, map.nodes, map.edges],
  );

  if (id === null || map.missing) {
    return (
      <OrganizationsFrame>
        <p className="py-12 text-center text-[15px] text-ink">{SAY.MISSING}</p>
      </OrganizationsFrame>
    );
  }
  if (!map.canvas) {
    return <OrganizationsFrame>{map.error ? <ErrorBlock message={map.error} onRetry={map.reload} /> : <EditorSkeleton />}</OrganizationsFrame>;
  }

  return (
    <OrganizationsFrame>
      <div ref={ref} className="flex min-h-0 flex-1 flex-col gap-3">
        <MapHeader map={map} editable={editable} onDelete={() => {}} />
        {map.refusal ? (
          <div role="alert" tabIndex={-1} data-error="" className="flex items-start gap-2 rounded-xl bg-danger-dim p-3 text-[13px] text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <ul className="flex flex-col gap-1">
              {map.refusal.messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {map.notice ? (
          <p role="status" className="text-[13px] text-ink-muted">
            {map.notice}
          </p>
        ) : null}
        <OpenPlansStrip plans={map.canvas.open_plans} record={map.canvas.record} />
        <MapContext.Provider value={context}>
          <MapBoard map={map} editable={editable} onOpen={() => {}} />
        </MapContext.Provider>
      </div>
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 7: Route it and delete the old editor**

In `src/App.tsx`: replace the `CanvasEditor` import with `import { MapEditor } from './pages/canvas/MapEditor';`, and inside `<Route path="canvas">`:

```tsx
            <Route index element={<CanvasPage />} />
            <Route path="create" element={<Navigate to="/canvas" replace />} />
            <Route path=":id" element={<MapEditor />} />
```

```bash
git rm src/pages/canvas/CanvasEditor.tsx src/pages/canvas/CanvasEditor.test.tsx src/pages/canvas/ContactNode.tsx src/pages/canvas/CanvasEdge.tsx src/pages/canvas/CanvasSidebar.tsx
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/pages/canvas/MapEditor.test.tsx`
Expected: PASS (6 tests). If nodes are found by text but `getByRole` misses their buttons, `mockReactFlow()` did not take effect: check it runs before the first render and that `globalThis.ResizeObserver` is the reporting mock.

- [ ] **Step 9: Verify and commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/canvas src/pages/canvas src/App.tsx && npx vitest run --maxWorkers=2 src/components/canvas src/pages/canvas src/features/canvas`

```bash
git add -A src/components/canvas src/pages/canvas src/App.tsx
git commit -m "feat(canvas): map editor with live facts, open plans and versioned save

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Every edit without dragging: node menu, relationships, person panel, tray

Spec §2.2 (⋯ menu items, Add a relationship to…, person panel with Open contact, "Not on the map" tray, removed people's Remove from map, hidden people stay); Decisions 8, 9, 10, 13, 14.

**Files:**
- Create: `src/components/canvas/AddRelationshipDialog.tsx`, `src/components/canvas/PersonPanel.tsx`, `src/components/canvas/NotOnMapTray.tsx`
- Modify: `src/components/canvas/NodeMenu.tsx`, `src/pages/canvas/MapEditor.tsx`
- Test: `src/pages/canvas/MapEditor.edits.test.tsx`

**Interfaces:**
- Consumes: Task 6's `MapApi`, `MapContext`, `PERSON_DRAG`; Task 5's `PersonFactsList`; `BuilderDialog`, `PRIMARY`, `QUIET`, `QUIET`; `relationshipText`, `labelText`, `RELATIONSHIP_LABELS`, `edgesOf`, `nodeKind`.
- Produces:
  - `NodeMenu` items: person → Open person, Add a relationship to…, Remove from map; removed → Remove from map.
  - `AddRelationshipDialog({ map, sourceId, onClose })`.
  - `PersonPanel({ map, nodeId, onClose })` (an `<aside aria-label="<name>">`).
  - `NotOnMapTray({ map })` (a disclosure; each person a button "Add <name> to the map", draggable with `PERSON_DRAG`).
  - `MapEditor` state: `openId: string | null`, `relatingFrom: string | null`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/canvas/MapEditor.edits.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/canvas/canvasOptions';
import { sentBodies, stubCanvases } from '../../features/canvas/testCanvases';
import { mockReactFlow } from '../../test/reactFlow';
import { resetViewport } from '../../test/viewport';
import { renderCanvas } from './testPages';

mockReactFlow();

type Patch = { nodes: { id: string; position: { x: number; y: number }; data: { contact_id: number } }[]; edges: { source: string; target: string; label: string }[] };

describe('MapEditor: every edit without dragging (spec §2.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('opens a person from their menu: facts, Open contact and their relationships', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Rosa Diaz' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Open person', 'Add a relationship to…', 'Remove from map']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open person' }));
    const panel = screen.getByRole('complementary', { name: 'Rosa Diaz' });
    expect(within(panel).getByRole('link', { name: 'Open contact' })).toHaveAttribute('href', '/contacts/51');
    expect(within(panel).getByRole('list', { name: 'Facts' })).toHaveTextContent('Contacted 12 days ago');
    expect(within(panel).getByRole('list', { name: 'Relationships' })).toHaveTextContent('Rosa Diaz reports to Tom Lee');
  });

  it('adds a relationship by picking a person and a label', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Tom Lee' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add a relationship to…' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a relationship' });
    expect(within(dialog).getAllByRole('option', { hidden: true }).map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['Rosa Diaz', 'Reports to', 'Introduced by', 'Blocks', 'Influences', 'No label']),
    );
    expect(within(dialog).queryByRole('option', { name: SAY.HIDDEN })).toBeNull();
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Person' }), 'n1');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Relationship' }), 'Influences');
    expect(dialog).toHaveTextContent('Tom Lee influences Rosa Diaz');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(1));
    expect((sentBodies(spy, 'PATCH')[0] as Patch).edges).toContainEqual({ id: 'e-n2-n1', source: 'n2', target: 'n1', label: 'Influences' });
  });

  it('refuses a duplicate relationship with a status line', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add a relationship to…' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a relationship' });
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Person' }), 'n2');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Relationship' }), 'Reports to');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('They already have this relationship.')).toBeInTheDocument();
  });

  it('relabels and removes a line from the person panel', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Tom Lee' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open person' }));
    const panel = screen.getByRole('complementary', { name: 'Tom Lee' });
    await userEvent.selectOptions(within(panel).getByRole('combobox', { name: 'Relationship: Rosa Diaz reports to Tom Lee' }), 'Blocks');
    expect(within(panel).getByRole('list', { name: 'Relationships' })).toHaveTextContent('Rosa Diaz blocks Tom Lee');
    await userEvent.click(within(panel).getByRole('button', { name: 'Remove the line: Rosa Diaz blocks Tom Lee' }));
    expect(within(panel).getByText('No relationships yet.')).toBeInTheDocument();
  });

  it('adds a tray person at the next free grid spot, and they leave the tray', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    const tray = await screen.findByRole('region', { name: SAY.NOT_ON_MAP });
    await userEvent.click(within(tray).getByRole('button', { name: /^Not on the map/ }));
    await userEvent.click(within(tray).getByRole('button', { name: 'Add Omar Farouk to the map' }));
    expect(within(tray).queryByRole('button', { name: 'Add Omar Farouk to the map' })).toBeNull();
    expect(screen.getByText('Omar Farouk')).toBeInTheDocument();
    expect(screen.getByText('Save to see their facts.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(1));
    // n1-n3 fill row 0's first three cells and n4 row 1's first: the next free one is row 0, column 4.
    expect((sentBodies(spy, 'PATCH')[0] as Patch).nodes.at(-1)).toEqual({ id: 'c55', position: { x: 720, y: 0 }, data: { contact_id: 55 } });
    expect(await screen.findByText('Not contacted yet')).toBeInTheDocument();
  });

  it('removes a removed contact, keeps the hidden one without a menu', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: `Actions for ${SAY.REMOVED}` }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Remove from map']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove from map' }));
    expect(screen.queryByText(SAY.REMOVED)).toBeNull();
    expect(screen.queryByRole('button', { name: `Actions for ${SAY.HIDDEN}` })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(1));
    expect((sentBodies(spy, 'PATCH')[0] as Patch).nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/canvas/MapEditor.edits.test.tsx`
Expected: FAIL (the menu has only Remove from map; no panel, dialog or tray).

- [ ] **Step 3: Complete the node menu**

Replace the body of `NodeMenu` in `src/components/canvas/NodeMenu.tsx`:

```tsx
export function NodeMenu({ nodeId, kind, name }: { nodeId: string; kind: NodeKind; name: string }) {
  const map = useMapContext();
  const remove: MenuItem = { key: 'remove', label: 'Remove from map', onSelect: () => map.removePerson(nodeId), danger: true };
  const items: MenuItem[] =
    kind === 'person'
      ? [
          { key: 'open', label: 'Open person', onSelect: () => map.openPerson(nodeId) },
          { key: 'relate', label: 'Add a relationship to…', onSelect: () => map.askRelationship(nodeId) },
          remove,
        ]
      : [remove];
  const stop = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();
  return (
    <span className="nodrag nopan" onClick={stop} onKeyDown={stop}>
      <Menu label={`Actions for ${name}`} trigger={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />} triggerClassName={TRIGGER} items={items} />
    </span>
  );
}
```

- [ ] **Step 4: Write the dialog, the panel and the tray**

Create `src/components/canvas/AddRelationshipDialog.tsx`:

```tsx
import { useId, useState, type FormEvent } from 'react';
import { nodeKind } from '../../features/canvas/canvasBoard';
import { RELATIONSHIP_LABELS } from '../../features/canvas/canvasOptions';
import { labelText, relationshipText } from '../../features/canvas/canvasText';
import type { RelationshipLabel } from '../../features/canvas/canvasTypes';
import { PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { BuilderDialog } from '../segments/BuilderDialog';
import type { MapApi } from './useMap';

const LABELS: RelationshipLabel[] = [...RELATIONSHIP_LABELS, ''];

/** Add a relationship to… (spec §2.2, Decision 8): pick a person, then a label. */
export function AddRelationshipDialog({ map, sourceId, onClose }: { map: MapApi; sourceId: string; onClose: () => void }) {
  const personId = useId();
  const labelId = useId();
  const others = map.nodes.filter((n) => n.id !== sourceId && nodeKind(n, map.hidden, map.people) === 'person');
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const [label, setLabel] = useState<RelationshipLabel>('Reports to');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    map.link(sourceId, target, label);
    onClose();
  }

  return (
    <BuilderDialog title="Add a relationship" size="narrow" onClose={onClose}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={personId} className="text-[13px] font-semibold text-ink">Person</label>
            <select id={personId} value={target} onChange={(e) => setTarget(e.target.value)} className={`${INPUT} border-line`}>
              {others.map((n) => (
                <option key={n.id} value={n.id}>{map.nameOf(n.id)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={labelId} className="text-[13px] font-semibold text-ink">Relationship</label>
            <select id={labelId} value={label} onChange={(e) => setLabel(e.target.value as RelationshipLabel)} className={`${INPUT} border-line`}>
              {LABELS.map((option) => (
                <option key={option || 'none'} value={option}>{labelText(option)}</option>
              ))}
            </select>
          </div>
          {target ? <p className="text-[13px] text-ink-muted">{relationshipText(map.nameOf(sourceId), label, map.nameOf(target))}</p> : <p className="text-[13px] text-ink-muted">Add someone else to the map first.</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-line-subtle p-4">
          <button type="button" onClick={onClose} className={QUIET}>Cancel</button>
          <button type="submit" disabled={!target} className={PRIMARY}>Add</button>
        </footer>
      </form>
    </BuilderDialog>
  );
}
```

Create `src/components/canvas/PersonPanel.tsx`:

```tsx
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { edgesOf } from '../../features/canvas/canvasBoard';
import { RELATIONSHIP_LABELS } from '../../features/canvas/canvasOptions';
import { labelText, relationshipText } from '../../features/canvas/canvasText';
import type { RelationshipLabel } from '../../features/canvas/canvasTypes';
import { BUTTON, FOCUS } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { PersonFactsList } from './facts';
import type { MapApi } from './useMap';

const LABELS: RelationshipLabel[] = [...RELATIONSHIP_LABELS, ''];
const ICON = `inline-flex h-11 w-11 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink ${FOCUS}`;

/** A person's facts beside the board (spec §2.2, Decision 13), with every
 *  line touching them as a sentence to relabel or remove. */
export function PersonPanel({ map, nodeId, onClose }: { map: MapApi; nodeId: string; onClose: () => void }) {
  const headingId = useId();
  const node = map.nodes.find((n) => n.id === nodeId);
  const person = node ? map.people[String(node.data.contact_id)] : undefined;
  if (!node || !person) return null;
  const lines = edgesOf(map.edges, nodeId);
  return (
    <aside aria-label={person.name} className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl bg-surface p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="truncate text-[15px] font-semibold text-ink">{person.name}</h2>
          <p className="text-[13px] text-ink-muted">{person.role_display}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className={ICON}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <PersonFactsList person={person} />
      <Link to={`/contacts/${node.data.contact_id}`} className={BUTTON}>Open contact</Link>
      <h3 className="text-[13px] font-semibold text-ink">Relationships</h3>
      {lines.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No relationships yet.</p>
      ) : (
        <ul aria-label="Relationships" className="flex flex-col divide-y divide-line-subtle">
          {lines.map((line) => {
            const label = line.data?.label ?? '';
            const sentence = relationshipText(map.nameOf(line.source), label, map.nameOf(line.target));
            return (
              <li key={line.id} className="flex flex-col gap-1 py-2">
                <span className="text-[13px] text-ink">{sentence}</span>
                <span className="flex items-center gap-1">
                  <select aria-label={`Relationship: ${sentence}`} value={label} onChange={(e) => map.relabelLine(line.id, e.target.value as RelationshipLabel)} className={`${INPUT} border-line`}>
                    {LABELS.map((option) => (
                      <option key={option || 'none'} value={option}>{labelText(option)}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => map.removeLine(line.id)} aria-label={`Remove the line: ${sentence}`} className={ICON}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
```

Create `src/components/canvas/NotOnMapTray.tsx`:

```tsx
import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { SAY } from '../../features/canvas/canvasOptions';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { PERSON_DRAG } from './MapBoard';
import type { MapApi } from './useMap';

const ROW = `flex min-h-11 sm:min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-subtle ${FOCUS}`;

/** "Not on the map" (spec §2.2): collapsible; click or drag a person to add
 *  them at the next free grid spot (Decision 9). */
export function NotOnMapTray({ map }: { map: MapApi }) {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const listId = useId();
  return (
    <section role="region" aria-labelledby={headingId} className="flex w-60 shrink-0 flex-col gap-1 rounded-xl bg-surface p-2">
      <h2 id={headingId} className="sr-only">{SAY.NOT_ON_MAP}</h2>
      <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)} className={`${ROW} font-semibold text-[13px] text-ink`}>
        {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        {SAY.NOT_ON_MAP} <span className={MONO}>{map.tray.length}</span>
      </button>
      {open ? (
        map.tray.length === 0 ? (
          <p id={listId} className="px-2 text-[13px] text-ink-muted">Everyone is on the map.</p>
        ) : (
          <ul id={listId} className="flex flex-col">
            {map.tray.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PERSON_DRAG, String(person.id));
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => map.addFromTray(person)}
                  aria-label={`Add ${person.name} to the map`}
                  className={ROW}
                >
                  <Plus className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{person.name}</span>
                    <span className="block truncate text-[11px] text-ink-muted">{person.role_display}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Wire them into the page**

In `src/pages/canvas/MapEditor.tsx`: add `const [openId, setOpenId] = useState<string | null>(null);` and `const [relatingFrom, setRelatingFrom] = useState<string | null>(null);`; a person may be opened only when `nodeKind` is `person` (Decision 10):

```tsx
  const openPerson = (nodeId: string) => {
    const node = map.nodes.find((n) => n.id === nodeId);
    if (node && nodeKind(node, map.hidden, map.people) === 'person') setOpenId(nodeId);
  };
```

In the context use `openPerson`, `askRelationship: setRelatingFrom`, and a `removePerson` that also clears the panel: `(nodeId) => { map.removePerson(nodeId); setOpenId((cur) => (cur === nodeId ? null : cur)); }`. Replace the board line with:

```tsx
        <MapContext.Provider value={context}>
          <div className="flex min-h-0 flex-1 gap-3">
            {editable ? <NotOnMapTray map={map} /> : null}
            <MapBoard map={map} editable={editable} onOpen={openPerson} />
            {openId && editable ? <PersonPanel map={map} nodeId={openId} onClose={() => setOpenId(null)} /> : null}
          </div>
          {relatingFrom ? <AddRelationshipDialog map={map} sourceId={relatingFrom} onClose={() => setRelatingFrom(null)} /> : null}
        </MapContext.Provider>
```

Add `openId` and `relatingFrom` to the context memo's dependencies.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/pages/canvas`
Expected: PASS (both editor files).

- [ ] **Step 7: Lint and commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/canvas src/pages/canvas`

```bash
git add src/components/canvas src/pages/canvas
git commit -m "feat(canvas): node menu, relationships, person panel and the tray

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Reload after 409, leaving with unsaved changes, Delete, and phones

Spec §2.2 (409 with Reload and a confirm, "Leaving with unsaved changes asks first", Delete only when `can_delete`, phones read-only with a People list view and the note); Contract note 10; Decisions 6, 11, 16.

**Files:**
- Create: `src/components/canvas/useUnsavedGuard.ts`, `src/components/canvas/PeopleList.tsx`
- Modify: `src/pages/canvas/MapEditor.tsx`
- Test: `src/pages/canvas/MapEditor.flows.test.tsx`

**Interfaces:**
- Consumes: Tasks 6-7; `ConfirmDialog` (`components/organizations/ConfirmDialog`); `deleteMap`, `deleteRefusal`; `recordHref`; `useSubmitOnce`.
- Produces:
  - `useUnsavedGuard(dirty: boolean) → { pending: string | null; stay(): void; leave(): void }`.
  - `PeopleList({ map })`: a `<section aria-label="People">` of people (facts, Open contact) then "Relationships" sentences.

- [ ] **Step 1: Write the failing test**

Create `src/pages/canvas/MapEditor.flows.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/canvas/canvasOptions';
import { stubCanvases } from '../../features/canvas/testCanvases';
import { mockReactFlow } from '../../test/reactFlow';
import { resetViewport } from '../../test/viewport';
import { renderCanvas } from './testPages';

mockReactFlow();
const where = () => screen.getByTestId('where').textContent;

describe('MapEditor: 409, leaving, delete, phones (spec §2.2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('shows the 409 sentence with Reload, which discards local edits after a confirm', async () => {
    const { otherSave } = stubCanvases();
    renderCanvas('/canvas/301');
    const name = await screen.findByRole('textbox', { name: 'Map name' });
    await userEvent.type(name, ' 2');
    otherSave(301, (m) => { m.name = 'Renamed by Dana'; });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SAY.CHANGED);
    expect(alert).toHaveFocus();
    await userEvent.click(within(alert).getByRole('button', { name: 'Reload' }));
    const confirm = screen.getByRole('dialog', { name: 'Discard your changes?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Map name' })).toHaveValue('Renamed by Dana'));
    expect(screen.queryByText(SAY.UNSAVED)).toBeNull();
  });

  it('asks before leaving with unsaved changes, and stays on Cancel', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.type(await screen.findByRole('textbox', { name: 'Map name' }), ' 2');
    await userEvent.click(screen.getByRole('link', { name: 'Pizza EMEA' }));
    const ask = screen.getByRole('dialog', { name: 'Leave without saving?' });
    expect(where()).toBe('/canvas/301');
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(where()).toBe('/canvas/301');
    await userEvent.click(screen.getByRole('link', { name: 'Pizza EMEA' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(where()).toBe('/accounts/12'));
  });

  it('leaves without asking when nothing changed', async () => {
    stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('link', { name: 'Pizza EMEA' }));
    await waitFor(() => expect(where()).toBe('/accounts/12'));
  });

  it("deletes a map its creator's manager may delete, once, then opens the record's Maps tab", async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas/301');
    await userEvent.click(await screen.findByRole('button', { name: 'Map actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.dblClick(within(screen.getByRole('dialog', { name: 'Delete EMEA buying group?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/accounts/12?tab=maps'));
    expect(spy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toHaveLength(1);
  });

  it("offers no Delete on a map someone else's team made", async () => {
    stubCanvases();
    renderCanvas('/canvas/303');
    await screen.findByRole('textbox', { name: 'Map name' });
    expect(screen.queryByRole('button', { name: 'Map actions' })).toBeNull();
  });

  it('is read-only on a phone, with a People view, relationships as sentences and the note', async () => {
    stubCanvases();
    renderCanvas('/canvas/301', { width: 375 });
    expect(await screen.findByText(SAY.PHONE_NOTE)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'EMEA buying group' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('button', { name: 'People' })).toHaveAttribute('aria-pressed', 'true');
    const people = screen.getByRole('region', { name: 'People' });
    expect(within(people).getByText('Rosa Diaz')).toBeInTheDocument();
    expect(within(people).getByText(SAY.HIDDEN)).toBeInTheDocument();
    expect(within(people).queryByText('Hal Hidden')).toBeNull();
    expect(within(people).getByRole('list', { name: 'Relationships' })).toHaveTextContent('Rosa Diaz reports to Tom Lee');
    await userEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByRole('region', { name: 'Map board' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Rosa Diaz' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/canvas/MapEditor.flows.test.tsx`
Expected: FAIL (no Reload, no guard, no Delete dialog, no People view).

- [ ] **Step 3: Write the guard**

Create `src/components/canvas/useUnsavedGuard.ts`:

```ts
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** "Leaving with unsaved changes asks first" (spec §2.2, Decision 6). The app
 *  runs on BrowserRouter, where useBlocker is unavailable, so while `dirty`
 *  this catches in-app link clicks in the capture phase (before React or the
 *  router sees them) and asks; closing or reloading the tab gets the
 *  browser's own prompt. The browser's Back button is not intercepted. */
export function useUnsavedGuard(dirty: boolean) {
  const navigate = useNavigate();
  const location = useLocation();
  const here = `${location.pathname}${location.search}${location.hash}`;
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = `${url.pathname}${url.search}${url.hash}`;
      if (to === here) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(to);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, here]);

  return {
    pending,
    stay: () => setPending(null),
    leave: () => {
      const to = pending;
      setPending(null);
      if (to) navigate(to);
    },
  };
}
```

- [ ] **Step 4: Write the phone view**

Create `src/components/canvas/PeopleList.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { nodeKind } from '../../features/canvas/canvasBoard';
import { SAY } from '../../features/canvas/canvasOptions';
import { relationshipText } from '../../features/canvas/canvasText';
import { ITEM_LINK } from '../organizations/detail/listStyles';
import { PersonFactsList } from './facts';
import type { MapApi } from './useMap';

/** The phone view (spec §2.2): people with their facts, then relationships
 *  as "A reports to B". Hidden people stay nameless. */
export function PeopleList({ map }: { map: MapApi }) {
  return (
    <section role="region" aria-label="People" className="flex flex-col gap-3 rounded-xl bg-surface p-3">
      <ul className="flex flex-col divide-y divide-line-subtle">
        {map.nodes.map((node) => {
          const kind = nodeKind(node, map.hidden, map.people);
          const person = map.people[String(node.data.contact_id)];
          return (
            <li key={node.id} className="flex flex-col gap-1 py-2">
              {kind === 'person' && person ? (
                <>
                  <span className="text-[13px] font-semibold text-ink">{person.name}</span>
                  <span className="text-[11px] text-ink-muted">{person.role_display}</span>
                  <PersonFactsList person={person} />
                  <Link to={`/contacts/${node.data.contact_id}`} className={ITEM_LINK}>Open contact</Link>
                </>
              ) : (
                <span className="text-[13px] text-ink-muted">{kind === 'hidden' ? SAY.HIDDEN : SAY.REMOVED}</span>
              )}
            </li>
          );
        })}
      </ul>
      <h2 className="text-[13px] font-semibold text-ink">Relationships</h2>
      {map.edges.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No relationships yet.</p>
      ) : (
        <ul aria-label="Relationships" className="flex flex-col gap-1 text-[13px] text-ink">
          {map.edges.map((line) => (
            <li key={line.id}>{relationshipText(map.nameOf(line.source), line.data?.label ?? '', map.nameOf(line.target))}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Wire Reload, the guard, Delete and phones into the page**

In `src/pages/canvas/MapEditor.tsx`:

```tsx
  const navigate = useNavigate();
  const guard = useUnsavedGuard(editable && map.dirty);
  const [confirmReload, setConfirmReload] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState<'people' | 'map'>('people');
  const remover = useSubmitOnce();
  const reload = () => (map.dirty ? setConfirmReload(true) : map.reload());
```

Pass `onDelete={() => setDeleting(true)}` to `MapHeader`. Inside the refusal alert, after the messages, when `map.refusal.changed`:

```tsx
            {map.refusal.changed ? (
              <button type="button" onClick={reload} className={`${QUIET} border border-line`}>
                Reload
              </button>
            ) : null}
```

Under 768px render, instead of the tray/board/panel row:

```tsx
        {editable ? (
          /* the Task 7 row: tray, board, panel */
        ) : (
          <>
            <p className="text-[13px] text-ink-muted">{SAY.PHONE_NOTE}</p>
            <div className="flex gap-2" role="group" aria-label="View">
              <button type="button" aria-pressed={view === 'people'} onClick={() => setView('people')} className={`${QUIET} border border-line`}>People</button>
              <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')} className={`${QUIET} border border-line`}>Map</button>
            </div>
            {view === 'people' ? <PeopleList map={map} /> : <MapBoard map={map} editable={false} onOpen={() => {}} />}
          </>
        )}
```

and the dialogs at the end of the frame:

```tsx
      {confirmReload ? (
        <ConfirmDialog
          title="Discard your changes?"
          message="Reloading shows their changes and drops yours."
          confirmLabel="Reload"
          danger
          onConfirm={async () => map.reload()}
          onClose={() => setConfirmReload(false)}
        />
      ) : null}
      {guard.pending ? (
        <ConfirmDialog
          title="Leave without saving?"
          message="Your changes to this map will be lost."
          confirmLabel="Leave"
          danger
          onConfirm={async () => guard.leave()}
          onClose={guard.stay}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${map.canvas.name}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            const outcome = await remover.run(() => deleteMap(map.canvas!.id));
            if (!outcome) return;
            if (!outcome.ok) throw deleteRefusal(outcome.error);
            navigate(`${recordHref(map.canvas!.record)}?tab=maps`, { replace: true });
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
```

(`ConfirmDialog` shows a thrown string as its refusal, so a 403 reads "Only the map's creator or their managers can delete it." inside it. Imports: `useNavigate`, `useState`, `ConfirmDialog`, `QUIET`, `useSubmitOnce`, `deleteMap`, `deleteRefusal`, `recordHref`, `useUnsavedGuard`, `PeopleList`.)

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/pages/canvas`
Expected: PASS (all three editor files).

- [ ] **Step 7: Lint and commit**

Run: `npx tsc -b --noEmit && npx eslint src/components/canvas src/pages/canvas`

```bash
git add src/components/canvas src/pages/canvas
git commit -m "feat(canvas): reload after 409, unsaved-changes prompt, delete and phone view

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The `/canvas` gallery, the frame, and the old slice code removed

Spec §2.3; Contract note 2; Decisions 3, 4.

**Files:**
- Modify (rewrite): `src/pages/canvas/CanvasPage.tsx`, `src/pages/canvas/CanvasPage.test.tsx`
- Modify: `src/components/layout/Navbar.tsx` (+ `Navbar.test.tsx`), `src/layouts/DashboardLayout.tsx` (+ `DashboardLayout.test.tsx`), `src/features/customers/customersSlice.ts`, `src/features/customers/customersSlice.test.ts`, `src/features/customers/accountOnlyPaths.test.ts`
- Delete: `src/pages/canvas/NewCanvasModal.tsx`

**Interfaces:**
- Consumes: `usePagedList` (`components/campaigns/usePagedList`), `fetchGallery`, `MapRow`, `SEARCH_DEBOUNCE_MS`, `ListSkeleton`, `LIST`, `EmptyState`, `ErrorBlock`, `QUIET`, `INPUT`.
- Produces: `CanvasPage` (`/canvas?q=`).

- [ ] **Step 1: Write the failing test**

Replace `src/pages/canvas/CanvasPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { stubCanvases } from '../../features/canvas/testCanvases';
import { resetViewport } from '../../test/viewport';
import { renderCanvas } from './testPages';

const names = () => within(screen.getByRole('list', { name: 'Maps' })).getAllByRole('link').map((link) => link.textContent);

describe('the /canvas gallery (spec §2.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('lists maps on records the reader may open, newest edit first, with record, people and last edit', async () => {
    stubCanvases();
    renderCanvas('/canvas');
    await screen.findByRole('list', { name: 'Maps' });
    expect(names()).toEqual(['EMEA buying group', 'Pizza Hut leadership', "Dana's renewal map"]);
    const first = screen.getAllByRole('listitem')[0];
    expect(first).toHaveTextContent('Pizza EMEA');
    expect(first).toHaveTextContent('4 people');
    expect(first).toHaveTextContent('Edited by Dana CSM · 2 days ago');
  });

  it('searches map and record names through the URL', async () => {
    const { spy } = stubCanvases();
    renderCanvas('/canvas');
    await screen.findByRole('list', { name: 'Maps' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search maps' }), 'hut');
    await waitFor(() => expect(names()).toEqual(['Pizza Hut leadership']));
    expect(screen.getByTestId('where')).toHaveTextContent('/canvas?q=hut');
    expect(spy.mock.calls.some(([url]) => String(url).endsWith('/canvases/?q=hut'))).toBe(true);
  });

  it('shows more on the cursor', async () => {
    stubCanvases({ pageSize: 2 });
    renderCanvas('/canvas');
    await screen.findByRole('list', { name: 'Maps' });
    expect(names()).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(names()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('has empty, loading and error states', async () => {
    stubCanvases({ maps: [], failList: 1 });
    renderCanvas('/canvas');
    expect(screen.getByRole('status', { name: 'Loading maps' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No maps yet')).toBeInTheDocument();
    expect(screen.getByText("Start one from an organisation's or account's Maps tab.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/canvas/CanvasPage.test.tsx`
Expected: FAIL (the old gallery reads the slice and renders cards).

- [ ] **Step 3: Rewrite the gallery**

Replace `src/pages/canvas/CanvasPage.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapRow } from '../../components/canvas/MapRow';
import { usePagedList } from '../../components/campaigns/usePagedList';
import { ListSkeleton } from '../../components/organizations/detail/ListParts';
import { LIST } from '../../components/organizations/detail/listStyles';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { QUIET } from '../../components/organizations/portfolio/styles';
import { INPUT } from '../../components/plans/styles';
import { fetchGallery } from '../../features/canvas/canvasApi';
import { SAY, SEARCH_DEBOUNCE_MS } from '../../features/canvas/canvasOptions';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

/** Your maps across the records you can open (spec §2.3). */
export function CanvasPage() {
  const searchId = useId();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [typed, setTyped] = useState(q);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (typed.trim() !== q) setParams(typed.trim() ? { q: typed.trim() } : {}, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [typed, q, setParams]);
  const list = usePagedList(q, (cursor) => fetchGallery(q, cursor), { error: 'Could not load maps.', more: 'Could not load more maps.' });

  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 sm:max-w-sm">
          <label htmlFor={searchId} className="text-[13px] font-semibold text-ink">Search maps</label>
          <input id={searchId} type="search" value={typed} onChange={(e) => setTyped(e.target.value)} className={`${INPUT} border-line`} />
        </div>
        {list.error ? (
          <ErrorBlock message={list.error} onRetry={list.retry} />
        ) : !list.rows ? (
          <ListSkeleton label="Loading maps" />
        ) : list.rows.length === 0 ? (
          <EmptyState title={SAY.NO_MAPS} detail={q ? 'No map or record matches that search.' : "Start one from an organisation's or account's Maps tab."} action={null} />
        ) : (
          <>
            <ul aria-label="Maps" className={LIST}>
              {list.rows.map((row) => (
                <MapRow key={row.id} row={row} showRecord />
              ))}
            </ul>
            {list.more.error ? <p role="alert" className="text-[13px] text-danger">{list.more.error}</p> : null}
            {list.next ? (
              <button type="button" onClick={list.showMore} disabled={list.more.busy} className={`${QUIET} self-center border border-line`}>
                {list.more.busy ? 'Loading…' : 'Show more'}
              </button>
            ) : null}
          </>
        )}
      </div>
    </OrganizationsFrame>
  );
}
```

```bash
git rm src/pages/canvas/NewCanvasModal.tsx
```

- [ ] **Step 4: Frame and title**

In `src/layouts/DashboardLayout.tsx` add, beside `isCampaigns`:

```ts
  // Canvas wears the Organizations frame too (canvas spec 2026-10-04 §2, Decision 4).
  const isCanvas = /^\/canvas(\/\d+)?\/?$/.test(location.pathname);
```

and `|| isCanvas` in the `p-0` list. In `src/components/layout/Navbar.tsx`:

```ts
  // Canvas wears the same frame (canvas spec 2026-10-04 §2, Decision 4):
  // "Canvas" on the gallery; on a map, the bar leads back.
  const isCanvas = /^\/canvas\/?$/.test(location.pathname);
  const isCanvasPage = /^\/canvas\/\d+\/?$/.test(location.pathname);
```

add both to `isFramed`, and before the `isCampaignPage` branch:

```tsx
        {isCanvasPage ? (
          <nav aria-label="Breadcrumb" className="flex items-center h-full">
            <Link
              to="/canvas"
              className="-ml-2 inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Canvas
            </Link>
          </nav>
        ) : isCanvas ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Canvas</h1>
          </div>
        ) : isCampaignPage ? (
```

Add to `Navbar.test.tsx` (following its Campaigns cases): `/canvas` shows the heading "Canvas"; `/canvas/301` shows the link "Canvas" to `/canvas`. Add to `DashboardLayout.test.tsx` (following its Campaigns case): `/canvas` and `/canvas/301` render the Navbar with a `p-0` `<main>`.

- [ ] **Step 5: Remove the old canvas code from the slice**

In `src/features/customers/customersSlice.ts` delete: the `Canvas` and `CanvasWritePayload` interfaces; the thunks `fetchCanvases`, `createCanvas`, `fetchCanvasById`, `updateCanvas`, `deleteCanvas`, `fetchCanvasesForCustomer`, `fetchCanvasesForAccount`; the reducer `clearCanvases` and its export; the state keys `entityCanvases`, `entityCanvasesLoading`, `entityCanvasesError`, `entityCanvasesRequestId`, `canvases`, `canvasesLoading`, `canvasesError` (interface and `initialState`); every `addCase` for those thunks; and the `import type { Node, Edge } from '@xyflow/react'` line if `grep -n "Node\[\]\|Edge\[\]" src/features/customers/customersSlice.ts` then finds nothing. Delete the canvas `describe` block in `customersSlice.test.ts` and its imports; in `accountOnlyPaths.test.ts` drop the `fetchCanvasesForAccount` import, dispatch and `'GET /accounts/12/canvases/'`; in `Navbar.test.tsx` drop the seven canvas keys from the preloaded `customers` state.

Run: `grep -rn "fetchCanvas\|createCanvas\|updateCanvas\|deleteCanvas\|entityCanvases\|clearCanvases\|canvasesLoading" src`
Expected: no output.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc -b --noEmit && npx eslint src/pages/canvas src/components/layout src/layouts src/features/customers && npx vitest run --maxWorkers=2 src/pages/canvas src/components/layout src/layouts src/features/customers`
Expected: PASS.

```bash
git add -A src/pages/canvas src/components/layout src/layouts src/features/customers
git commit -m "feat(canvas): /canvas gallery with search and Show more; old canvas state removed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: House rules, the journey, the documents and the full run

Spec §2.4 (house rules; the e2e-style journey); Global Constraints (no animation, no em dash, no storage).

**Files:**
- Create: `src/components/canvas/houseRules.test.ts`, `src/e2e/canvas.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: everything above; `houseRuleSuite`, `rowsIconsTargetsSuite` (`src/test/houseRules`).
- Produces: nothing new.

- [ ] **Step 1: Write the house-rules suite**

Create `src/components/canvas/houseRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over Canvas (spec §2.4): both folders whole.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/canvas/*.tsx', { query: '?raw', eager: true, import: 'default' })),
};
const sources = Object.entries(files).filter(([file]) => !file.includes('.test.') && !file.endsWith('/testPages.tsx'));
const BOARD = ['./PersonNode.tsx', './RelationshipEdge.tsx', './MapBoard.tsx', './EdgeLabelMenu.tsx', './NodeMenu.tsx', './PersonCard.tsx', './facts.tsx'];

houseRuleSuite('canvas house rules', files);
rowsIconsTargetsSuite('canvas house rules beyond the shared suite', files);

describe('canvas: coverage, motion, copy, targets', () => {
  it('covers the pages, the board and every edit surface', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/canvas/CanvasPage.tsx',
        '../../pages/canvas/MapEditor.tsx',
        ...BOARD,
        './MapsTab.tsx',
        './NewMapDialog.tsx',
        './PersonPanel.tsx',
        './NotOnMapTray.tsx',
        './AddRelationshipDialog.tsx',
        './PeopleList.tsx',
      ]),
    );
  });

  it('never animates the board (keyboard-driven changes never animate)', () => {
    const offenders = BOARD.filter((file) => /\btransition\b|transition-|animate-|duration|\banimated\b/.test(files[file]));
    expect(offenders).toEqual([]);
  });

  it('gives the node menu a 44px target at every width (spec §2.4)', () => {
    expect(files['./NodeMenu.tsx']).toMatch(/const TRIGGER = `[^`]*\bh-11 w-11\b/);
    expect(files['./NodeMenu.tsx']).not.toMatch(/sm:h-9/);
  });

  it('writes no em dash in its copy', () => {
    expect(sources.filter(([, source]) => source.includes('—')).map(([file]) => file)).toEqual([]);
  });

  it('never stores anything in the browser', () => {
    expect(sources.filter(([, source]) => /localStorage|sessionStorage/.test(source)).map(([file]) => file)).toEqual([]);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/canvas/houseRules.test.ts`
Expected: PASS. A failure names the file and the rule; fix the file, not the suite.

- [ ] **Step 2: Write the journey**

Create `src/e2e/canvas.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../features/canvas/canvasOptions';
import { sentBodies, stubCanvases } from '../features/canvas/testCanvases';
import { renderCanvas } from '../pages/canvas/testPages';
import { mockReactFlow } from '../test/reactFlow';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the Maps tab, the
// editor and the router. Only fetch is stubbed, by a stateful stub in the
// contract's shapes (spec §2.4: new map from people, add a relationship, save,
// a second editor's save gets 409 and reloads, a hidden person stays nameless).
mockReactFlow();
const where = () => screen.getByTestId('where').textContent;
type Patch = { version: number; nodes: { id: string; data: { contact_id: number } }[]; edges: { source: string; target: string; label: string }[] };

describe('Canvas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('builds a map from people, saves a relationship, meets a 409, reloads, and keeps a hidden person nameless', { timeout: 30000 }, async () => {
    const { spy, otherSave } = stubCanvases();

    // 1. New map from the organisation's people.
    renderCanvas('/organizations/7', { nav: true });
    await userEvent.click(await screen.findByRole('button', { name: 'New map' }));
    const dialog = screen.getByRole('dialog', { name: 'New map' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create map' }));
    await waitFor(() => expect(where()).toBe('/canvas/700'));
    expect(await screen.findByRole('link', { name: 'Canvas' })).toHaveAttribute('href', '/canvas');
    expect(screen.getByText('Rosa Diaz')).toBeInTheDocument();
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();

    // 2. Rosa reports to Tom, without dragging; save.
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add a relationship to…' }));
    const relate = screen.getByRole('dialog', { name: 'Add a relationship' });
    await userEvent.selectOptions(within(relate).getByRole('combobox', { name: 'Person' }), 'p52');
    await userEvent.selectOptions(within(relate).getByRole('combobox', { name: 'Relationship' }), 'Reports to');
    await userEvent.click(within(relate).getByRole('button', { name: 'Add' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByText(SAY.UNSAVED)).toBeNull());
    expect((sentBodies(spy, 'PATCH')[0] as Patch).edges).toEqual([{ id: 'e-p51-p52', source: 'p51', target: 'p52', label: 'Reports to' }]);

    // 3. A second editor (Dana) saves first and adds Hal, whom Alice can't open.
    otherSave(700, (m) => m.nodes.push({ id: 'd54', position: { x: 480, y: 480 }, data: { contact_id: 54 } }));

    // 4. Alice's next save is refused with 409; Reload takes Dana's version.
    await userEvent.type(screen.getByRole('textbox', { name: 'Map name' }), ' (EMEA)');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SAY.CHANGED);
    await userEvent.click(within(alert).getByRole('button', { name: 'Reload' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Discard your changes?' })).getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Map name' })).toHaveValue('Pizza Hut map'));

    // 5. Hal is on the map, nameless, with no menu; the relationship survived.
    expect(screen.getByText(SAY.HIDDEN)).toBeInTheDocument();
    expect(screen.queryByText('Hal Hidden')).toBeNull();
    expect(screen.queryByRole('button', { name: `Actions for ${SAY.HIDDEN}` })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Rosa Diaz' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open person' }));
    expect(within(screen.getByRole('complementary', { name: 'Rosa Diaz' })).getByRole('list', { name: 'Relationships' })).toHaveTextContent('Rosa Diaz reports to Tom Lee');

    // 6. Saving again keeps Hal's node as stored, on the new version.
    await userEvent.type(screen.getByRole('textbox', { name: 'Map name' }), ' (EMEA)');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sentBodies(spy, 'PATCH')).toHaveLength(3));
    const last = sentBodies(spy, 'PATCH')[2] as Patch;
    expect(last.version).toBe(3);
    expect(last.nodes).toContainEqual({ id: 'd54', position: { x: 480, y: 480 }, data: { contact_id: 54 } });
    expect(screen.getByRole('textbox', { name: 'Map name' })).toHaveValue('Pizza Hut map (EMEA)');
  });
});
```

(The stub lays the organisation's readable people out with ids `p<contact_id>`: Rosa `p51` (Decision Maker, row 1), Tom `p52` (Champion, row 2), Priya `p53` (Influencer, row 3), Omar `p55` (Other, row 4); Hal is unreadable and Gil deleted, so neither is placed.)

Run: `npx vitest run --maxWorkers=2 src/e2e/canvas.test.tsx`
Expected: PASS.

- [ ] **Step 3: Update the product documents**

- `docs/04-app-flow.md`: the routes row for `/canvas` becomes "`/canvas`, `/canvas/:id` | `CanvasPage` (the gallery: search, Show more), `MapEditor` (live stakeholder map); `/canvas/create` redirects to `/canvas`". In the account page section, "Canvases" becomes "Maps" (after People, `MapsTab`, `GET /accounts/{id}/canvases/`, New map opens a dialog and then `/canvas/<id>`), and the organisation page section gains the same Maps tab (`GET /customers/{id}/canvases/`). Replace the "**Canvas**: drag contacts…" paragraph with a short account of spec §2.2: live facts, open plans strip, lines with four labels, the ⋯ menu, the person panel, the tray, versioned Save and 409 Reload, Delete by creator or managers, read-only People view under 768px. In the slice table, drop "canvases" from the `customers` row.
- `docs/03-ui-ux-design.md`: in the Account page row, `CanvasesTab` becomes `MapsTab` (`components/canvas/`); add a "Canvas" entry listing `components/canvas/` and its rules (one neutral stroke with the label's words, 44px node menu, no animation on the board, People view on phones).
- `.agents/workflows/repo-architecture.md`: line 60's `CanvasesTab` becomes the shared `components/canvas/MapsTab`; line 468 names `components/canvas/MapsTab` instead of `shared/CanvasListTab`; add `features/canvas/` and `components/canvas/` to the tree, and `pages/canvas/` as `CanvasPage` and `MapEditor`.

Run: `grep -rn "CanvasListTab\|CanvasesTab\|CanvasEditor\|NewCanvasModal" docs .agents src`
Expected: no output except historical plan and spec files under `docs/superpowers/`.

- [ ] **Step 4: Full verification**

Run, one at a time:
- `npx tsc -b --noEmit` → no output.
- `npm run lint` → `✖ 15 problems (0 errors, 15 warnings)`.
- `npm run build` → succeeds.
- `npx vitest run --maxWorkers=2` → every file passes.

If the full run shows a failure outside the canvas folders, it is almost certainly a test that read the old `Canvases` tab, `canvas*` slice keys, or `/canvas/create`; fix that test to the new behaviour (Tasks 4 and 9 list the known ones).

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/houseRules.test.ts src/e2e/canvas.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): canvas journey, house rules and product documents

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review (done while writing)

**Spec coverage.** §2.1 Maps tab on both pages, rows, New map dialog, states → Task 4. §2.2 header (inline name, record link, Edited by, Save disabled until changes, Unsaved changes, ⋯ Delete when `can_delete`) → Tasks 6, 8; leave prompt → Task 8; open plans strip with Start a plan → Task 6; node card facts, hidden and removed nodes → Tasks 5-7; lines by dragging, label menu, selected line removal → Tasks 5-6; ⋯ menu items, every edit without dragging, no animation → Tasks 6-7, 10; person panel with Open contact → Task 7; tray click and drag at next free spot → Task 7; Save with `version` once, 409 with Reload after a confirm, field refusals summary with focus → Tasks 6, 8; phones read-only with People view and note → Task 8. §2.3 gallery with search, Show more, states → Task 9. §2.4 house rules and tests, the journey → Task 10. §4 every endpoint and field → Tasks 1, 3.

**Placeholder scan.** No TBD/TODO; every code step carries its code. Where an existing test file is edited (Details tests, Navbar, DashboardLayout), the exact assertion to add or change is named.

**Type consistency.** `FlowNode`/`FlowEdge`/`People`/`NodeKind`/`Change` (Task 2) are used unchanged in Tasks 5-8; `MapApi` members (`nodes`, `edges`, `people`, `hidden`, `tray`, `nameOf`, `addFromTray`, `removePerson`, `link`, `relabelLine`, `removeLine`, `save`, `reload`, `refusal.changed`) match their uses; `MapContextValue` members match `NodeMenu`, `PersonNode` and `RelationshipEdge`; `renderCanvas` routes match every page test; `sentBodies`, `otherSave` and fixture ids (`301`, `303`, `304`, `700`, `n1`-`n4`, `p51`-`p55`) agree between the stub and the tests.
