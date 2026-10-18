# Plans: Project Management (frontend, delivery 4 of the Impact section) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the sidebar's Project Management link a real home: `/projects` (a list and a board of plans), the New plan modal (`/projects/new`, and over an organisation or account at `…/:id/plans/new`), a plan's page (`/projects/:id`) with its milestone timeline and inline edits, the templates page and editor (`/projects/templates…`), a Plans section on organisation and account pages, a plan link on plan tasks in the activity story, a fifth rule action **Start a plan**, and the two plan notification kinds, all on the backend's `/api/v1/plans/…` contract.

**Architecture:**
- **`src/features/plans/` (new, pure, unit-tested):** the §4 contract types (`planTypes.ts`), labels, limits and the sentences (`planOptions.ts`), dates and display text (`planText.ts`), the list's URL state and the remembered view (`planParams.ts`), the New plan draft (`planDraft.ts`), the template editor's draft (`templateDraft.ts`), 400/409 bodies mapped to fields (`planErrors.ts`), the API (`planApi.ts`), template fixtures shared with the Rules stub (`testTemplates.ts`) and a stateful contract stub (`testPlans.ts`, `stubPlans`) that falls through to `stubRules` → `stubSurveys` → `stubSegments`. No Redux slice: like Segments, Surveys and Rules, pages read through small hooks.
- **`src/components/plans/` (new):** the shared row parts (`parts.tsx`: status pill, kind chip, progress bar, record link, owner, next due), `PlanRowItem`, `PlanFilters`, `PlansList`, `PlansBoard`, the modal's three steps (`RecordStep`, `TemplateStep`, `ReviewStep`), the plan page's `PlanHeader`, `Timeline`, `MilestoneEditor`, `TaskEditor`, the template editor's `TemplateMilestones`, `SaveAsTemplateDialog`, the record pages' `RecordPlans`, and hooks (`usePlan`, `useTemplates`, `usePlanRecord`, `useHasReports`, `useSubmitOnce`).
- **`src/pages/plans/` (new):** `ProjectsHome` (`/projects`, its `Outlet` holds the modal), `NewPlan.tsx` (`NewPlanForm`, `NewPlanRoute`, `RecordPlanRoute`), `PlanPage`, `TemplatesPage`, `TemplateEditor.tsx` (`NewTemplateRoute`, `EditTemplateRoute`), test helpers.
- **Rules (modify):** a `plan` action in the types, options, draft, sentence, night results, paused reason `template_gone` and dry run; a `PlanFields` card in the builder.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind v4 tokens, react-router 7, lucide-react, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-plans-design.md`. This plan covers §0 (context), §2 (frontend) and §4 (the API contract, binding; field names used exactly). §1 is the backend, read for behaviour the stub must mirror (status rules §1.2, permissions §1.3, built-in templates §1.6, rules §1.8).

**The API contract** is spec §4. The backend is planned in parallel against the same section, so every test here runs against `stubPlans` (Task 2), never a live server. Where §4 is silent or does not fit the real frontend, the assumption is written in **Contract notes** below, to be reconciled with the backend plan.

**Branch:** `feat/plans` in `react-ts-app`, already checked out (spec commits `dab8df6`, `e88485e` on top of the merged Rules frontend). Stay on it. Never push. Do not touch `revenact-backend`.

## Contract notes (assumptions to reconcile with the backend plan)

1. **The rule's plan action has two shapes.** §4 writes `{action: 'plan', template: id}` and reads `{action: 'plan', template: {id, name} | null}`. Today `RuleWrite.actions` and `RuleRow.actions` share one `RuleAction` type. This plan splits them: `RuleAction` (read) gains `PlanAction {action: 'plan'; template: {id; name} | null}`; a new `RuleActionWrite` (sent by `POST/PATCH rules/` and `POST rules/test/`) has `PlanActionWrite {action: 'plan'; template: number | null}`. The builder's draft keeps the read shape (it needs the name for the sentence); `toActions` sends the id. `null` is only ever sent if the client check is bypassed; the check refuses it with "Choose a template you can use." (spec §1.8).
2. **A plan action's night result** (backend plan, binding): `ActionResult {action: 'plan', status: 'done', detail: 'started'}` when it started one, `{status: 'unchanged', detail: 'already had one'}` when the record already had an open plan from the template (not `skipped`), or `{status: 'failed', detail}`. `unchanged` counts as acted, so such a record is `outcome: 'fired'`. Shown as "Plan: started", "Plan: already had one", "Plan: failed (…)".
3. **Dry run:** `RuleTestResult.plans?: {would_start: number; already_open: number}`, optional (present only with a plan action).
4. **Paused reason `template_gone`:** the notice reads the server's `paused_message` ("Its plan template was deleted.") and adds, for the owner, "Choose another template in Edit, then turn it on."
5. **The live activity feed is the Story, not the task serializer.** `ActivityFeed`/`TasksTab` are not rendered anywhere (`.agents/workflows/repo-architecture.md` says so). Organisation and account pages show tasks through `GET organizations/:id/story/` and `GET accounts/:id/story/`, whose items are `StoryItem`s. This plan assumes a story item of `kind: 'task'` carries the same two fields §4 adds to the task serializer, `plan: {id, name} | null` and `milestone: {id, name} | null`, typed **optional** (absent reads as none) The backend plan adds them (its Task 6 addendum, reconciled). `customers.Task` gains them too, optional.
6. **`PATCH plans/:id/`** takes only `{name, owner, status}` (§4). §1.4's "target, dates" are not editable on the plan itself: dates move through milestones (the target is the last milestone's due date). `not_started` is not a PATCH value, so the board refuses a drop on Not started on the client with "A plan can't go back to Not started.", and the status select never offers it.
7. **The board reads one `GET plans/?status=<s>&…` per column** (cursor pages of 50, Show more per column). A column's count is that page's `counts[s]`; `counts` covers every status under the same filters, so any column's page also tells the board whether there are any plans at all.
8. **The list's status "All"** is sent as `status=open&status=done&status=cancelled`. Rows come newest first (`id` descending); §4 does not order the list, the stub does so.
9. **Resolving `record_owner` in the New plan review** reads the record through the existing `GET customers/:id/` or `GET accounts/:id/` (`accountBase` with no customer), using its `owner {id, name} | null`. An owner who is not an active member, or none, falls back to the plan's owner.
10. **`POST plans/` always sends `name`, `owner`, `start_date` and `milestones`** (the reviewed copy, assignees resolved to ids), even when nothing was edited. This is allowed by §4 and keeps what was shown exactly what is started.
11. **Nested refusals:** a 400 on `milestones` is read as a list aligned with the milestones sent, each `{name?, due_date?, tasks?: [{title?, assignee?, due_date?, priority?}]}` with string-list messages (DRF nested list serializers), or as a plain `["message"]` list for the whole list. The template editor reads `milestones` the same way (`offset_days`, `assignee_role` inside). `non_field_errors` and `detail` go to the form.
12. **403 bodies** (`{detail}`) are shown verbatim at the form or beside the control. The stub's wording, "Only the plan's owner or their managers can change it.", "Built-in templates can't be changed." and "Only the template's owner can change it.", matches the backend plan's constants verbatim (reconciled).
13. **409 `PLAN_OPEN`:** the UI composes "This record already has an open {Template} plan." from the chosen template's name (spec §2.2), not from `detail`, and links to `plan_id`. A name already ending in "plan" is not doubled ("an open Save plan").
14. **The 51st personal template:** assumed `400 {non_field_errors: ["You can own at most 50 templates."]}`; any 400/429 with a message shows above the form.
15. **"Has reports"** (the scope default, §2.1) is read from `GET /auth/members/`: someone's `reports_to.id` is the signed-in user. There is no server flag.
16. **Task ticks** go through `PATCH plans/:id/tasks/:tid/ {status}` (`completed` ↔ `pending`), which returns the `Plan`; the existing task route is not used here.
17. **Notifications** need no client change beyond the two kinds: `link` is `/projects/<id>` and the bell already navigates to `link`.
18. **`Plan.started_by_rule` may be `{id: null, name: "a rule"}`** when the reader can't read the rule (backend plan, binding). The type is `{id: number | null; name: string} | null`; with a null id the header reads "Started by a rule", unlinked.
19. **Status codes** (backend plan, binding): `POST plans/:id/milestones/` and `POST plans/:id/tasks/` answer 201 with the `Plan`; the other structure routes answer 200. Structure edits on a done or cancelled plan answer 400 `non_field_errors` ("This plan is finished…"); the UI offers none there. A plan needs 1–12 milestones: removing the last one is refused with a 400, and the UI disables Remove on a plan's only milestone.
20. **Hidden tasks** (backend plan, binding): a plan task the caller can't see answers 404, even for an editor; Save as template copies only the tasks the caller can see.

## Global Constraints

Quoted text is verbatim from the spec or the house design skill.

- **Commands.** Never run prettier (the repo has no config). Type-check with `npx tsc -b --noEmit`; lint changed files with `npx eslint <changed files>`; `npm run lint` must end with **16 pre-existing warnings, 0 errors**; `npm run build` must pass. Run focused tests with `npx vitest run --maxWorkers=2 <paths>`, one process at a time; run the full `npx vitest run --maxWorkers=2` before finishing (Task 15).
- **Commits** are conventional (`feat(plans): …`, `feat(rules): …`, `test(e2e): …`, `docs(plans): …`) and every message ends with a blank line and exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Never push.
- **Tokens only.** "Zero raw hex, rgb, or named colours in `src/**/*.tsx`; tokens only." Use `bg-surface`, `bg-subtle`, `text-ink`, `text-ink-muted`, `border-line`, `bg-accent`, `text-on-accent`, and the semantic `success`/`warning`/`danger`/`info` with their `-dim` tints. "Semantic colours carry meaning only (status, trend, severity), never decoration."
- **Both themes.** "Every colour is a token with a light value in `@theme` and a dark override". This plan adds no colour; it only uses existing tokens.
- **Lucide only.** "Lucide React exclusively. 16px inline, 20px standalone action, 24px section header." Every icon carries `aria-hidden="true"`; an icon-only button has an `aria-label`. "No emoji as icons."
- **Touch targets.** "a 44px touch target or `min-h-9` on desktop-only dense controls": every button, link, select and text input gets `min-h-11 sm:min-h-9` (or `h-11 w-11` for an icon button), directly or through `BUTTON`, `PRIMARY`, `QUIET`, `FILTER_SELECT`, `COLUMN_ICON_BUTTON`, or a style constant defined in the same file. Checkboxes and radios take their target from their label.
- **Layouts at 375 / 768 / 1024 / 1440.** "no horizontal scroll; `min-h-[100dvh]` never `h-screen`." Below 768px the board shows one column at a time.
- **Type.** "at most four sizes per surface": `text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]` only. "numbers and IDs in DM Mono with `tabular-nums`": figures, counts and dates use `MONO` (`font-mono-brand tabular-nums`).
- **No card inside a card.** "Group with `border-line`, `divide-y`, or whitespace." A row inside a section that is itself `bg-surface` is flat (`divide-y`), never another rounded `bg-surface`. No glass, no gradients.
- **No colour-only meaning.** A status is a word and an icon as well as a tint; "Overdue" is a word and an icon as well as the danger colour; a chosen template card shows a check as well as its border.
- **Copy.** "Labels above inputs, errors below inputs, no placeholder-as-label, sentence-case UI copy, no filler verbs". No em dashes in UI copy (use a colon, a comma or " · ").
- **States.** "Every list/table/chart has designed empty, loading (skeleton matching layout, not spinner), and error states." "Every interactive element has default, hover, focus-visible, active, disabled, loading states".
- **Motion.** No new animation. The only motion is the existing skeleton pulse.
- **Rows, never tables.** No `<table>`, no `role="table"`/`"grid"` (the house-rules suite checks it).
- **Never render server text as markup** (`dangerouslySetInnerHTML` is banned in the new folders).
- **Visibility (spec §1.3, §2.3).** Plans on records the reader cannot open are never listed; a direct read is a 404 reading "This plan doesn't exist or you can't open its record." Progress on lists counts only the tasks the reader can see; hidden tasks show as "N tasks you can't see". Edits are offered only when `can_edit`; a task checkbox only when `can_check`; Delete only when `can_delete`.
- **Limits (spec §1.1):** up to 12 milestones and 50 tasks per plan and per template; template names ≤ 120, descriptions ≤ 500, task titles ≤ 255, offsets 0–365 days; 50 personal templates per owner.
- **Exact copy from the spec:** "Project Management"; "New plan"; "Templates"; "Mine", "Has my tasks", "All I can see"; "No plans yet"; "No plans match these filters"; "Clear filters"; "Show cancelled"; "Start plan"; "This record already has an open <Template> plan."; "They can't open this record."; "Cancel it instead: some of its work is done."; "Its open tasks stay on their owners' lists."; "This plan doesn't exist or you can't open its record."; "N tasks you can't see"; "+ Add task" (rendered as a Plus icon and "Add task"); "Started by <rule>"; "Show finished (N)"; "Start a plan"; "Choose a template you can use."; "Its plan template was deleted."; "would start N plans · M already have one"; limits shown as counts, e.g. `8/12 milestones`, `31/50 tasks`.
- **Tests** follow the `testing` skill: unit tests per module and component; page tests on the real store and router with `fetch` stubbed by `stubPlans`; one jsdom journey in `src/e2e/plans.test.tsx`; a Plans house-rules suite reusing `houseRuleSuite` and `rowsIconsTargetsSuite`. Every test must be able to fail, and its title claims only what it asserts. Tests that depend on today's date freeze it with `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(new Date(2026, 9, 4, 9, 0))`, and call `vi.useRealTimers()` after.
- **Product documents** change in the same branch: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` (Task 14).

## Decisions made while planning (the owner may overrule any)

1. **Folders.** `src/features/plans/`, `src/components/plans/`, `src/pages/plans/`, so the house-rules suite can glob them whole.
2. **Title and frame.** As Scenarios: `/projects` wears the framed Navbar titled "Project Management"; every other `/projects/…` page (new, a plan, templates, the template editor) reads "‹ Project Management" back to `/projects`. Pages sit in `OrganizationsFrame`; `DashboardLayout` gives `/projects…` the `p-0` frame.
3. **List / Board toggle** is two buttons (`aria-pressed`) in a group named "View", stored under `localStorage` key `revenact_plans_view`, read and written in `try/catch`, List by default.
4. **Filters in the URL:** `scope` (`mine` | `tasks` | `all`, absent = the default), `kind`, `owner` (an id), `status` (`open` default, `done`, `cancelled`, `all`; List only), `q` (300 ms debounce through `useSearchText`), `cancelled=1` (the board's Show cancelled). "Mine" sends `owner=me`; "Has my tasks" sends `mine=tasks`; the Owner select shows only outside Mine.
5. **Scope default:** "All I can see" when someone reports to the signed-in user, else "Mine". The list waits for `/auth/members/` before its first read, so it never reads twice.
6. **The board's status menu** is a native `<select>` named "Status of {plan}" on each editable open card: the keyboard and touch alternative to dragging. Drag is HTML5, from `sm` (no touch drag). Moves are not optimistic: the card stays put until the server answers, then every column reads again; a refusal (client or server) shows in a dismissible alert ("toast") and nothing moves. A polite status line says "Moved {plan} to On track.".
7. **Done on the board** is enabled only when every milestone is done (the option is disabled, a drop is refused with "Mark every milestone done first."). Cancelled is never a drop target; a plan is cancelled from its page, which asks first.
8. **The plan page's Edit** is a toggle ("Edit" / "Done editing") that turns each milestone into an inline form (name, due date, Save, Move up, Move down, Remove) and each task into Edit and Remove buttons; "Add milestone" appears at the end. "Add task" shows under every milestone for editors of an open plan, editing or not. Removing asks first in `ConfirmDialog`.
9. **The status on the plan page** is a select (On track, At risk, Done; Not started only while current, disabled; Done disabled until every milestone is done) for editors of an open plan, else a pill. Cancel plan and Delete live in the **⋯** menu (the existing `Menu`), Delete only when `can_delete`.
10. **Templates' View** is a disclosure on each row that lists the milestones ("Day 0 · Kick-off") and tasks, with **Use** (`/projects/new?template=<id>`) inside it for every template. Yours also have Edit and Delete.
11. **Save as template** opens `BuilderDialog` with a new `size="narrow"` (`sm:max-w-lg`). On success it says "Saved as {name}." with "Open template" (`/projects/templates/<id>/edit`) and Close.
12. **The Plans section on a record page** sits under the header (and its refresh error), above the account chips on an organisation and above the tabs on an account, so it is the same on every tab. It is one `bg-surface` section with flat rows.
13. **Start a plan from a record** is a child route (`/organizations/:id/plans/new`, `/accounts/:id/plans/new`) rendered through an `<Outlet />` on the record page, so the page stays under the modal. The six path patterns that identify a record page (Navbar, DashboardLayout, `detailIdOf`, `accountsViewOf`) learn an optional `/plans/new`.
14. **Dates.** Headers and the timeline read "4 Oct 2026" (`formatDate`); rows, cards and tasks read "4 Oct" (`shortDay`). "Today" is the browser's local date.
15. **The rule sentence** for a plan action reads "start a Save plan", "start an Onboarding plan", "start a QBR plan" ("a"/"an" by the first letter; " plan" added unless the name ends in "plan"); with no template, "start a plan". The builder's sentence and the turn-on confirm now read the draft's actions (they need the template's name), not the written ones.
16. **Notification icons:** the bell gets an icon only for the two plan kinds (`ClipboardList` for `plan_started`, `ListChecks` for `plan_task_assigned`), through `NotificationKindIcon`; other kinds keep today's look.
17. **Submit once** everywhere a write starts from a button: `useSubmitOnce` guards with a ref set before React re-renders, so Enter twice or a double click sends one request.

## File Structure

| File | Responsibility |
|---|---|
| `src/features/plans/planTypes.ts` (new) | §4's types, field for field, and the write bodies |
| `src/features/plans/planOptions.ts` (new) | Limits, labels, column order, the spec's sentences (`SAY`) and the client's own check words (`CHECK`), `PLAN_NOUN` |
| `src/features/plans/planText.ts` (new) | Date maths, the default name, lengths, hidden counts, the 409 sentence, finished notices, move notices and refusals, record paths |
| `src/features/plans/planParams.ts` (new) | `/projects` URL state, list and column queries, the remembered view, `?template=` |
| `src/features/plans/planDraft.ts` (new) | New plan: the draft from a template, start-date shifts, assignee resolution, the `POST plans/` body, client checks |
| `src/features/plans/templateDraft.ts` (new) | The template editor's draft, its write body, counts and checks |
| `src/features/plans/planErrors.ts` (new) | 400 bodies to fields, nested milestones and tasks; the 409 `PLAN_OPEN` guard |
| `src/features/plans/planApi.ts` (new) | `apiFetch` wrappers for every §4 endpoint, the record read and the record search |
| `src/features/plans/testTemplates.ts` (new, test-only) | The four built-in templates of §1.6, mine, shared, unreadable |
| `src/features/plans/testPlans.ts` (new, test-only) | Plan fixtures, `stubPlans` (stateful, §1.2 status rules), falling through to `stubRules` |
| `src/components/plans/parts.tsx` (new) | `StatusPill`, `KindChip`, `ProgressBar`, `RecordIcon`, `RecordLink`, `OwnerName`, `NextDue` |
| `src/components/plans/PlanRowItem.tsx` (new) | One plan row (list and record section) |
| `src/components/plans/useSubmitOnce.ts`, `useHasReports.ts`, `useTemplates.ts`, `usePlanRecord.ts`, `usePlan.ts` (new) | Hooks |
| `src/components/plans/PlanFilters.tsx`, `PlansList.tsx`, `PlansBoard.tsx` (new) | The filter bar, the list, the board |
| `src/components/plans/RecordStep.tsx`, `TemplateStep.tsx`, `ReviewStep.tsx`, `fields.tsx` (new) | The New plan modal's three steps; the shared person and priority selects |
| `src/components/plans/PlanStates.tsx`, `PlanHeader.tsx`, `Timeline.tsx`, `MilestoneEditor.tsx`, `TaskEditor.tsx` (new) | The plan page's parts |
| `src/components/plans/TemplateMilestones.tsx`, `SaveAsTemplateDialog.tsx` (new) | The template editor's milestones and tasks; Save as template |
| `src/components/plans/RecordPlans.tsx` (new) | The Plans section on organisation and account pages |
| `src/components/plans/houseRules.test.ts` (new) | The house rules over the new components and pages |
| `src/pages/plans/ProjectsHome.tsx`, `NewPlan.tsx`, `PlanPage.tsx`, `TemplatesPage.tsx`, `TemplateEditor.tsx`, `testPages.tsx` (new) | The routes' pages and the test render |
| `src/features/rules/ruleTypes.ts`, `ruleOptions.ts`, `ruleDraft.ts`, `ruleText.ts`, `testRules.ts` (modify) | The `plan` action, `template_gone`, the dry run's `plans` |
| `src/components/rules/ActionFields.tsx`, `ActionCards.tsx`, `TestPanel.tsx` (modify); `src/pages/rules/RuleBuilder.tsx` (modify) | The Start a plan card, the dry-run line, the sentence from the draft |
| `src/components/segments/BuilderDialog.tsx` (modify) | `size="narrow"` |
| `src/features/organizations/storyTypes.ts`, `src/features/customers/customersSlice.ts`, `src/components/organizations/detail/StoryItemRow.tsx` (modify) | `plan`/`milestone` on tasks; the "<Plan> · <Milestone>" link |
| `src/pages/organizations/Details.tsx`, `src/pages/accounts/Details.tsx`, their `testDetail.tsx`, `src/features/organizations/testStory.ts`, `src/features/accounts/testAccountPage.ts` (modify) | The Plans section, the modal's Outlet, the stubs' empty plans |
| `src/features/organizations/detailAskContext.ts`, `src/features/accounts/askContext.ts`, `src/components/layout/Navbar.tsx`, `src/layouts/DashboardLayout.tsx` (modify) | Record paths with `/plans/new`; the `/projects` frame and bar |
| `src/features/notifications/types.ts` (modify), `src/components/layout/NotificationKindIcon.tsx` (new) | `plan_started`, `plan_task_assigned` and their icons |
| `src/App.tsx` (modify) | The `/projects` routes and the record pages' `plans/new` |
| `src/e2e/plans.test.tsx` (new) | Start from a template → tick a task → mark a milestone done → On track on the board |
| docs (modify) | `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` |

---
### Task 1: The contract types, the options and the display text

Spec §4 "Shared shapes", §1.1 (limits), §2.1–§2.3 (copy); Decisions 14, 15.

**Files:**
- Create: `src/features/plans/planTypes.ts`, `src/features/plans/planOptions.ts`, `src/features/plans/planText.ts`
- Test: `src/features/plans/planText.test.ts`

**Interfaces:**
- Consumes: `PersonRef`, `Sharing` (`features/segments/segmentTypes`); `SentencePart` (`features/segments/ruleSentence`); `formatDate` (`features/customers/formatters`); `PortfolioNoun` (`features/organizations/portfolioLabels`).
- Produces:
  - `planTypes.ts`: `PlanKind`, `PlanStatus`, `Priority`, `TaskStatus`, `AssigneeRole`, `RecordKind`, `RecordRef`, `TemplateTask`, `TemplateMilestone`, `PlanTemplate`, `TemplateLists`, `PlanRow`, `PlanTask`, `Milestone`, `Plan`, `PlansPage`, `StartTask`, `StartMilestone`, `PlanStart`, `SettableStatus`, `PlanPatch`, `MilestoneWrite`, `MilestonePatch`, `TaskWrite`, `TaskPatch`, `TemplateWrite`, `SaveAsTemplate`, `PlanOpenBody`, `PlanRecord`, and re-exports `PersonRef`, `Sharing`.
  - `planOptions.ts`: `NAME_MAX = 120`, `DESCRIPTION_MAX = 500`, `TASK_TITLE_MAX = 255`, `OFFSET_MAX = 365`, `MILESTONES_MAX = 12`, `TASKS_MAX = 50`, `STATUSES`, `OPEN_STATUSES`, `BOARD_COLUMNS`, `STATUS_LABEL`, `KIND_LABEL`, `KINDS`, `PRIORITIES`, `PRIORITY_LABEL`, `ROLE_LABEL`, `SAY`, `CHECK`, `PLAN_NOUN`.
  - `planText.ts`: `isOpen(status)`, `addDays(iso, days)`, `daysBetween(from, to)`, `todayIso(now?)`, `shortDay(iso)`, `dateRange(start, target)`, `progress(done, total)`, `planNoun(name)`, `defaultPlanName(template, record)`, `lengthParts(t)`, `hiddenTasks(n)`, `planOpenText(templateName)`, `recordHref(record)`, `newPlanPath(record)`, `finishedNotice(status)`, `moveNotice(name, status)`, `allMilestonesDone(row)`, `moveRefusal(row, to)`.

- [ ] **Step 1: Write the failing test**

Create `src/features/plans/planText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BOARD_COLUMNS, KIND_LABEL, OPEN_STATUSES, STATUS_LABEL } from './planOptions';
import {
  addDays,
  allMilestonesDone,
  dateRange,
  daysBetween,
  defaultPlanName,
  finishedNotice,
  hiddenTasks,
  isOpen,
  lengthParts,
  moveNotice,
  moveRefusal,
  newPlanPath,
  planNoun,
  planOpenText,
  recordHref,
  shortDay,
  todayIso,
} from './planText';
import type { PlanRow } from './planTypes';

const ROW: PlanRow = {
  id: 43, name: 'QBR · Pizza Hut', kind: 'qbr', status: 'not_started', record: { kind: 'organization', id: 7, name: 'Pizza Hut' },
  owner: { id: 1, name: 'Alice' }, start_date: '2026-10-06', target_date: '2026-10-20', milestones_done: 0, milestones_total: 3,
  tasks_done: 0, tasks_total: 5, next_due: '2026-10-06', is_overdue: false, can_edit: true,
};

describe('plan options', () => {
  it('orders the board columns, with cancelled apart', () => {
    expect(BOARD_COLUMNS.map((status) => STATUS_LABEL[status])).toEqual(['Not started', 'On track', 'At risk', 'Done']);
    expect(STATUS_LABEL.cancelled).toBe('Cancelled');
    expect(OPEN_STATUSES).toEqual(['not_started', 'on_track', 'at_risk']);
    expect(Object.values(KIND_LABEL)).toEqual(['Onboarding', 'Success', 'Save', 'QBR', 'Other']);
  });
});

describe('plan dates', () => {
  it('adds days across months and years without a time zone shift', () => {
    expect(addDays('2026-10-04', 0)).toBe('2026-10-04');
    expect(addDays('2026-10-20', 14)).toBe('2026-11-03');
    expect(addDays('2026-12-25', 10)).toBe('2027-01-04');
    expect(addDays('2026-11-03', -14)).toBe('2026-10-20');
  });

  it('counts the days between two dates', () => {
    expect(daysBetween('2026-10-04', '2026-12-03')).toBe(60);
    expect(daysBetween('2026-10-06', '2026-10-04')).toBe(-2);
  });

  it("reads today's local date", () => {
    expect(todayIso(new Date(2026, 9, 4, 23, 30))).toBe('2026-10-04');
    expect(todayIso(new Date(2026, 0, 9, 0, 5))).toBe('2026-01-09');
  });

  it('reads a range with the year and a short day without it', () => {
    expect(dateRange('2026-10-04', '2026-12-03')).toBe('4 Oct 2026 → 3 Dec 2026');
    expect(shortDay('2026-10-04')).toBe('4 Oct');
  });
});

describe('plan words', () => {
  it('names a new plan after its template and record', () => {
    expect(defaultPlanName('Onboarding', 'Globex')).toBe('Onboarding · Globex');
  });

  it('adds "plan" to a template name only when it lacks it', () => {
    expect(planNoun('Onboarding')).toBe('Onboarding plan');
    expect(planNoun('Save plan')).toBe('Save plan');
    expect(planOpenText('Save plan')).toBe('This record already has an open Save plan.');
    expect(planOpenText('Onboarding')).toBe('This record already has an open Onboarding plan.');
  });

  it("reads a template's length with its figures apart", () => {
    const parts = lengthParts({ milestone_count: 4, task_count: 7, length_days: 60 });
    expect(parts.map((part) => part.text).join('')).toBe('4 milestones · 7 tasks · 60 days');
    expect(parts.filter((part) => part.numeric).map((part) => part.text)).toEqual(['4', '7', '60']);
    expect(lengthParts({ milestone_count: 1, task_count: 1, length_days: 1 }).map((part) => part.text).join('')).toBe('1 milestone · 1 task · 1 day');
  });

  it('counts the tasks the reader cannot see', () => {
    expect(hiddenTasks(1)).toEqual({ n: 1, text: "task you can't see" });
    expect(hiddenTasks(3)).toEqual({ n: 3, text: "tasks you can't see" });
  });

  it("links a plan's record and starts a plan over it", () => {
    expect(recordHref({ kind: 'organization', id: 1 })).toBe('/organizations/1');
    expect(recordHref({ kind: 'account', id: 12 })).toBe('/accounts/12');
    expect(newPlanPath({ kind: 'organization', id: 1 })).toBe('/organizations/1/plans/new');
    expect(newPlanPath({ kind: 'account', id: 12 })).toBe('/accounts/12/plans/new');
  });

  it('says what a finished plan still allows', () => {
    expect(finishedNotice('done')).toBe('This plan is done. Only its tasks can still be ticked.');
    expect(finishedNotice('cancelled')).toBe("This plan was cancelled. Its open tasks stay on their owners' lists, and only tasks can still be ticked.");
    expect(finishedNotice('on_track')).toBeNull();
  });

  it('says where a plan moved', () => {
    expect(moveNotice('QBR · Pizza Hut', 'on_track')).toBe('Moved QBR · Pizza Hut to On track.');
  });
});

describe('plan rules on the client', () => {
  it('knows the open statuses and when every milestone is done', () => {
    expect(isOpen('at_risk')).toBe(true);
    expect(isOpen('done')).toBe(false);
    expect(allMilestonesDone(ROW)).toBe(false);
    expect(allMilestonesDone({ ...ROW, milestones_done: 3 })).toBe(true);
    expect(allMilestonesDone({ ...ROW, milestones_done: 0, milestones_total: 0 })).toBe(false);
  });

  it('refuses the moves the contract cannot make, before asking', () => {
    expect(moveRefusal(ROW, 'on_track')).toBeNull();
    expect(moveRefusal(ROW, 'at_risk')).toBeNull();
    expect(moveRefusal({ ...ROW, status: 'on_track' }, 'not_started')).toBe("A plan can't go back to Not started.");
    expect(moveRefusal(ROW, 'done')).toBe('Mark every milestone done first.');
    expect(moveRefusal({ ...ROW, milestones_done: 3 }, 'done')).toBeNull();
    expect(moveRefusal(ROW, 'cancelled')).toBe('Cancel a plan from its own page.');
    expect(moveRefusal({ ...ROW, can_edit: false }, 'on_track')).toBe("Only the plan's owner or their managers can move it.");
    expect(moveRefusal({ ...ROW, status: 'done' }, 'on_track')).toBe('A finished plan stays where it is.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/plans/planText.test.ts`
Expected: FAIL, "Failed to resolve import "./planOptions"".

- [ ] **Step 3: Write the types**

Create `src/features/plans/planTypes.ts`:

```ts
// The Plans contract (spec 2026-10-04-plans-design.md §4), field for field.
// Every read is computed for the reader: plans only on records they may
// open, tasks only those they may see, the rest as counts.
import type { PersonRef, Sharing } from '../segments/segmentTypes';

export type { PersonRef, Sharing };

export type PlanKind = 'onboarding' | 'success' | 'save' | 'qbr' | 'other';
export type PlanStatus = 'not_started' | 'on_track' | 'at_risk' | 'done' | 'cancelled';
/** customers.Task.Priority */
export type Priority = 'high' | 'medium' | 'low';
/** customers.Task.Status */
export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type AssigneeRole = 'plan_owner' | 'record_owner';
export type RecordKind = 'organization' | 'account';

export interface RecordRef {
  kind: RecordKind;
  id: number;
  name: string;
}

export interface TemplateTask {
  title: string;
  priority: Priority;
  offset_days: number;
  assignee_role: AssigneeRole;
}

export interface TemplateMilestone {
  name: string;
  offset_days: number;
  tasks: TemplateTask[];
}

export interface PlanTemplate {
  id: number;
  name: string;
  kind: PlanKind;
  description: string;
  is_builtin: boolean;
  is_owner: boolean;
  owner: PersonRef | null;
  sharing: Sharing;
  shared_with: PersonRef[];
  milestones: TemplateMilestone[];
  milestone_count: number;
  task_count: number;
  /** The largest offset over milestones and tasks. */
  length_days: number;
  updated_at: string;
}

/** GET plans/templates/ */
export interface TemplateLists {
  builtin: PlanTemplate[];
  mine: PlanTemplate[];
  shared: PlanTemplate[];
}

/** The list, the board and a record's section. */
export interface PlanRow {
  id: number;
  name: string;
  kind: PlanKind;
  status: PlanStatus;
  record: RecordRef;
  owner: PersonRef;
  start_date: string;
  target_date: string;
  milestones_done: number;
  milestones_total: number;
  /** Tasks the reader can see. */
  tasks_done: number;
  tasks_total: number;
  /** The earliest due date of a milestone not done. */
  next_due: string | null;
  /** `next_due` is before today. */
  is_overdue: boolean;
  can_edit: boolean;
}

export interface PlanTask {
  id: number;
  title: string;
  priority: Priority;
  status: TaskStatus;
  due_date: string;
  assignee: PersonRef | null;
  can_check: boolean;
}

export interface Milestone {
  id: number;
  name: string;
  position: number;
  due_date: string;
  done_at: string | null;
  is_overdue: boolean;
  tasks: PlanTask[];
  hidden_tasks: number;
  /** Visible tasks. */
  tasks_done: number;
  tasks_total: number;
}

export interface Plan extends PlanRow {
  template: { id: number; name: string } | null;
  started_by: PersonRef | null;
  /** `id` is null when the reader can't read the rule (Contract note 18). */
  started_by_rule: { id: number | null; name: string } | null;
  status_set_by: 'person' | 'system';
  done_at: string | null;
  created_at: string;
  milestones: Milestone[];
  hidden_tasks: number;
  /** can_edit and no completed task. */
  can_delete: boolean;
}

/** GET plans/: `counts` covers the same filters ignoring `status`. */
export interface PlansPage {
  results: PlanRow[];
  next: string | null;
  counts: Record<PlanStatus, number>;
}

export interface StartTask {
  title: string;
  priority: Priority;
  due_date: string;
  assignee: number;
}

export interface StartMilestone {
  name: string;
  due_date: string;
  tasks: StartTask[];
}

/** POST plans/: exactly one of `customer` and `account`. */
export interface PlanStart {
  template: number;
  customer?: number;
  account?: number;
  name?: string;
  owner?: number;
  start_date?: string;
  milestones?: StartMilestone[];
}

export type SettableStatus = 'on_track' | 'at_risk' | 'cancelled' | 'done';

export interface PlanPatch {
  name?: string;
  owner?: number;
  status?: SettableStatus;
}

export interface MilestoneWrite {
  name: string;
  due_date: string;
}

export interface MilestonePatch {
  name?: string;
  due_date?: string;
  done?: boolean;
}

export interface TaskWrite {
  milestone: number;
  title: string;
  priority: Priority;
  due_date: string;
  assignee: number;
}

export type TaskPatch = Partial<TaskWrite> & { status?: TaskStatus };

export interface TemplateWrite {
  name: string;
  kind: PlanKind;
  description: string;
  milestones: TemplateMilestone[];
  sharing: Sharing;
  shared_with: number[];
}

export interface SaveAsTemplate {
  name: string;
  sharing?: Sharing;
  shared_with?: number[];
}

/** 409 on POST plans/. */
export interface PlanOpenBody {
  code: 'PLAN_OPEN';
  plan_id: number;
  detail: string;
}

/** GET customers/:id/ or accounts/:id/, as far as Plans reads it (Contract note 9). */
export interface PlanRecord extends RecordRef {
  owner: PersonRef | null;
}
```

- [ ] **Step 4: Write the options**

Create `src/features/plans/planOptions.ts`:

```ts
// Plans' choices, labels, limits and sentences (spec §1.1, §2, §4).
import type { PortfolioNoun } from '../organizations/portfolioLabels';
import type { AssigneeRole, PlanKind, PlanStatus, Priority } from './planTypes';

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 500;
export const TASK_TITLE_MAX = 255;
export const OFFSET_MAX = 365;
export const MILESTONES_MAX = 12;
export const TASKS_MAX = 50;

export const STATUSES: readonly PlanStatus[] = ['not_started', 'on_track', 'at_risk', 'done', 'cancelled'];
/** "Open means one of the first three" (spec §1.1). */
export const OPEN_STATUSES: readonly PlanStatus[] = ['not_started', 'on_track', 'at_risk'];
/** Cancelled is hidden until Show cancelled (spec Decisions, Board). */
export const BOARD_COLUMNS: readonly PlanStatus[] = ['not_started', 'on_track', 'at_risk', 'done'];

export const STATUS_LABEL: Record<PlanStatus, string> = {
  not_started: 'Not started',
  on_track: 'On track',
  at_risk: 'At risk',
  done: 'Done',
  cancelled: 'Cancelled',
};
export const KIND_LABEL: Record<PlanKind, string> = { onboarding: 'Onboarding', success: 'Success', save: 'Save', qbr: 'QBR', other: 'Other' };
export const KINDS = Object.keys(KIND_LABEL) as PlanKind[];
export const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
export const ROLE_LABEL: Record<AssigneeRole, string> = { record_owner: "The record's owner", plan_owner: "The plan's owner" };

/** The spec's own sentences (§1.3, §1.8, §2.3). */
export const SAY = {
  CANT_OPEN: "They can't open this record.",
  HAS_DONE_WORK: 'Cancel it instead: some of its work is done.',
  CHOOSE_TEMPLATE: 'Choose a template you can use.',
  NOT_FOUND: "This plan doesn't exist or you can't open its record.",
  TEMPLATE_GONE: 'Its plan template was deleted.',
} as const;

/** The client's own words, for what it checks before asking. */
export const CHECK = {
  PLAN_NAME: 'Give the plan a name.',
  MILESTONE_NAME: 'Give the milestone a name.',
  TASK_TITLE: 'Give the task a title.',
  TEMPLATE_NAME: 'Give the template a name.',
  DATE: 'Choose a date.',
  OFFSET: 'Choose 0 to 365 days.',
  RECORD: 'Choose an organisation or account.',
  TEMPLATE: 'Choose a template.',
  NO_MILESTONES: 'Add at least one milestone.',
  TOO_MANY_MILESTONES: 'A plan holds at most 12 milestones.',
  TOO_MANY_TASKS: 'A plan holds at most 50 tasks.',
  NO_PEOPLE: 'Choose at least one teammate.',
  ALL_MILESTONES_DONE: 'Mark every milestone done first.',
  NOT_BACK: "A plan can't go back to Not started.",
  CANCEL_ON_PAGE: 'Cancel a plan from its own page.',
  NOT_EDITOR: "Only the plan's owner or their managers can move it.",
  FINISHED: 'A finished plan stays where it is.',
} as const;

export const PLAN_NOUN: PortfolioNoun = { one: 'plan', many: 'plans' };
```

- [ ] **Step 5: Write the text**

Create `src/features/plans/planText.ts`:

```ts
// Plans' dates and words, as data. Figures stay apart from their words so
// a component can set them in DM Mono.
import { formatDate } from '../customers/formatters';
import type { SentencePart } from '../segments/ruleSentence';
import { CHECK, OPEN_STATUSES, STATUS_LABEL } from './planOptions';
import type { PlanRow, PlanStatus, PlanTemplate, RecordKind } from './planTypes';

const DAY = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const pad = (n: number) => String(n).padStart(2, '0');

export const isOpen = (status: PlanStatus) => OPEN_STATUSES.includes(status);

/** "2026-10-20" + 14 → "2026-11-03", in UTC so no zone shifts the day. */
export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY);
}

/** The browser's own date (Decision 14). */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "2026-10-04" → "4 Oct" (rows, cards, tasks). */
export function shortDay(iso: string): string {
  return formatDate(iso).replace(/ \d{4}$/, '');
}

export function dateRange(start: string, target: string): string {
  return `${formatDate(start)} → ${formatDate(target)}`;
}

export const progress = (done: number, total: number) => `${done}/${total}`;

/** "Onboarding" → "Onboarding plan"; "Save plan" stays (Contract note 13). */
export function planNoun(name: string): string {
  return /\bplan$/i.test(name.trim()) ? name.trim() : `${name.trim()} plan`;
}

/** "<Template> · <Record>" (spec §2.2). */
export function defaultPlanName(template: string, record: string): string {
  return `${template} · ${record}`;
}

const count = (n: number, one: string, many: string): SentencePart[] => [
  { text: String(n), role: 'value', numeric: true },
  { text: ` ${n === 1 ? one : many}`, role: 'join' },
];

/** "4 milestones · 7 tasks · 60 days" (spec §2.2, a template card). */
export function lengthParts(template: Pick<PlanTemplate, 'milestone_count' | 'task_count' | 'length_days'>): SentencePart[] {
  return [
    ...count(template.milestone_count, 'milestone', 'milestones'),
    { text: ' · ', role: 'join' },
    ...count(template.task_count, 'task', 'tasks'),
    { text: ' · ', role: 'join' },
    ...count(template.length_days, 'day', 'days'),
  ];
}

/** "N tasks you can't see" (spec §2.3), the figure apart. */
export function hiddenTasks(n: number): { n: number; text: string } {
  return { n, text: `${n === 1 ? 'task' : 'tasks'} you can't see` };
}

/** The 409 PLAN_OPEN sentence (spec §2.2). */
export function planOpenText(templateName: string): string {
  return `This record already has an open ${planNoun(templateName)}.`;
}

export function recordHref(record: { kind: RecordKind; id: number }): string {
  return record.kind === 'organization' ? `/organizations/${record.id}` : `/accounts/${record.id}`;
}

/** The New plan modal over a record's page (spec §2.2). */
export function newPlanPath(record: { kind: RecordKind; id: number }): string {
  return `${recordHref(record)}/plans/new`;
}

/** The notice on a done or cancelled plan (spec §2.3), or null. */
export function finishedNotice(status: PlanStatus): string | null {
  if (status === 'done') return 'This plan is done. Only its tasks can still be ticked.';
  if (status === 'cancelled') return "This plan was cancelled. Its open tasks stay on their owners' lists, and only tasks can still be ticked.";
  return null;
}

export function moveNotice(name: string, status: PlanStatus): string {
  return `Moved ${name} to ${STATUS_LABEL[status]}.`;
}

export function allMilestonesDone(row: Pick<PlanRow, 'milestones_done' | 'milestones_total'>): boolean {
  return row.milestones_total > 0 && row.milestones_done === row.milestones_total;
}

/** Why a board move can't be asked for (Decisions 6, 7; Contract note 6), or null. */
export function moveRefusal(row: PlanRow, to: PlanStatus): string | null {
  if (!row.can_edit) return CHECK.NOT_EDITOR;
  if (!isOpen(row.status)) return CHECK.FINISHED;
  if (to === 'not_started') return CHECK.NOT_BACK;
  if (to === 'cancelled') return CHECK.CANCEL_ON_PAGE;
  if (to === 'done' && !allMilestonesDone(row)) return CHECK.ALL_MILESTONES_DONE;
  return null;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/features/plans/planText.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 7: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/features/plans/planTypes.ts src/features/plans/planOptions.ts src/features/plans/planText.ts src/features/plans/planText.test.ts
git add src/features/plans/planTypes.ts src/features/plans/planOptions.ts src/features/plans/planText.ts src/features/plans/planText.test.ts
git commit -m "feat(plans): the contract types, options and display text

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The API and the contract stub

Spec §4 "Endpoints" and "Refusals"; §1.2 (status rules the stub mirrors), §1.3 (visibility, editors, delete), §1.6 (the built-in templates); Contract notes 7–14, 16.

**Files:**
- Create: `src/features/plans/planApi.ts`, `src/features/plans/testTemplates.ts`, `src/features/plans/testPlans.ts`
- Test: `src/features/plans/planApi.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `OPEN_STATUSES`, `STATUSES`, `SAY`, `CHECK`, `addDays`, `daysBetween`, `defaultPlanName`, `isOpen`; `apiFetch` (`lib/apiClient`); `searchRecords` (`features/segments/segmentApi`); `stubRules`, `RulesStub` (`features/rules/testRules`); `ME`, `CARL`, `DANA`, `TEAM` (`features/segments/testSegments`); `requestsOf` (`features/surveys/testSurveys`).
- Produces:
  - `planApi.ts`: `PLANS_PATH`, `TEMPLATES_PATH`, `fetchPlans(query)`, `fetchPlansPaged(query)`, `fetchPlan(id)`, `startPlan(body)`, `updatePlan(id, body)`, `deletePlan(id)`, `addMilestone(id, body)`, `updateMilestone(id, mid, body)`, `deleteMilestone(id, mid)`, `reorderMilestones(id, order)`, `addTask(id, body)`, `updateTask(id, tid, body)`, `deleteTask(id, tid)`, `fetchTemplates()`, `fetchTemplate(id)`, `createTemplate(body)`, `updateTemplate(id, body)`, `deleteTemplate(id)`, `saveAsTemplate(id, body)`, `fetchRecordPlans(record)`, `fetchPlanRecord(kind, id)`, `searchPlanRecords(search)`.
  - `testTemplates.ts`: `withCounts`, `ONBOARDING` (1), `SUCCESS` (2), `SAVE` (3), `QBR` (4), `BUILTINS`, `MINE_TEMPLATE` (10, "Renewal prep"), `SHARED_TEMPLATE` (11, "Carl's expansion play"), `DANA_TEMPLATE` (12, unreadable), `TEMPLATES`, `readableTemplate(t)`, `templateRef(id)`.
  - `testPlans.ts`: `TODAY = '2026-10-04'`, `RECORDS`, `MEMBERS` (Carl reports to Alice), `StoredTask`, `StoredMilestone`, `StoredPlan`, plan fixtures `GLOBEX_ONBOARDING` (41), `INITECH_APAC_SAVE` (42, Dana's, read-only, overdue, 2 hidden tasks), `PIZZA_QBR` (43, not started, deletable), `GLOBEX_NA_SUCCESS` (44, done), `INITECH_RENEWAL` (45, cancelled), `DANA_PRIVATE_PLAN` (46, unreadable), `PIZZA_EMEA_SAVE` (47, Carl's, started by rule 10), `PLANS`, `NOT_EDITOR`, `FINISHED_PLAN`, `LAST_MILESTONE`, `PlansStub`, `stubPlans(stub?) → { spy, runNight, plansOf }`. New plans get ids from 500, milestones from 5000, tasks from 50000, templates from 900.

- [ ] **Step 1: Write the failing test**

Create `src/features/plans/planApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { requestsOf } from '../surveys/testSurveys';
import {
  addMilestone,
  addTask,
  createTemplate,
  deleteMilestone,
  deletePlan,
  deleteTask,
  fetchPlan,
  fetchPlanRecord,
  fetchPlans,
  fetchRecordPlans,
  fetchTemplate,
  fetchTemplates,
  reorderMilestones,
  saveAsTemplate,
  searchPlanRecords,
  startPlan,
  updateMilestone,
  updatePlan,
  updateTask,
  updateTemplate,
} from './planApi';
import { FINISHED_PLAN, LAST_MILESTONE, NOT_EDITOR, stubPlans } from './testPlans';

const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err instanceof ApiError ? { status: err.status, body: err.body } : err;
  }
  throw new Error('expected a refusal');
};
const ids = (rows: { id: number }[]) => rows.map((row) => row.id);

describe('the plans API on the contract stub', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists open plans newest first, with every status counted, never an unreadable one', async () => {
    stubPlans();
    const page = await fetchPlans('status=open');
    expect(ids(page.results)).toEqual([47, 43, 42, 41]);
    expect(page.counts).toEqual({ not_started: 2, on_track: 1, at_risk: 1, done: 1, cancelled: 1 });
    expect(page.next).toBeNull();
    expect(page.results.find((row) => row.id === 42)).toMatchObject({
      record: { kind: 'account', id: 14, name: 'Initech APAC' }, owner: { id: 5, name: 'Dana CSM' }, status: 'at_risk',
      milestones_done: 1, milestones_total: 3, tasks_done: 1, tasks_total: 3, next_due: '2026-09-15', is_overdue: true, can_edit: false,
    });
  });

  it('filters by kind, owner, my tasks, search, record and status', async () => {
    stubPlans();
    expect(ids((await fetchPlans('status=open&kind=save')).results)).toEqual([47, 42]);
    expect((await fetchPlans('status=open&kind=save')).counts).toEqual({ not_started: 1, on_track: 0, at_risk: 1, done: 0, cancelled: 0 });
    expect(ids((await fetchPlans('owner=me&status=open')).results)).toEqual([43, 41]);
    expect(ids((await fetchPlans('mine=tasks&status=open')).results)).toEqual([42, 41]);
    expect(ids((await fetchPlans('q=pizza&status=open')).results)).toEqual([47, 43]);
    expect(ids((await fetchPlans('customer=1&status=open')).results)).toEqual([41]);
    expect(ids((await fetchPlans('account=12&status=open')).results)).toEqual([47]);
    expect(ids((await fetchPlans('status=done')).results)).toEqual([44]);
    expect(ids((await fetchPlans('status=open&status=done&status=cancelled')).results)).toEqual([47, 45, 44, 43, 42, 41]);
  });

  it('pages under an opaque cursor', async () => {
    const { spy } = stubPlans({ pageSize: 2 });
    const first = await fetchPlans('status=open');
    expect(ids(first.results)).toEqual([47, 43]);
    const second = await fetchPlans(`status=open&cursor=${encodeURIComponent(first.next!)}`);
    expect(ids(second.results)).toEqual([42, 41]);
    expect(second.next).toBeNull();
    expect(requestsOf(spy, 'GET', /^\/plans\/$/)[1].query.get('cursor')).toBe(first.next);
  });

  it('reads one plan: milestones in order, visible tasks, hidden counts, overdue marks; unreadable is a 404', async () => {
    stubPlans();
    const plan = await fetchPlan(42);
    expect(plan.milestones.map((m) => [m.name, m.is_overdue, m.hidden_tasks, m.tasks.length])).toEqual([
      ['Diagnose', false, 0, 2],
      ['Act', true, 2, 0],
      ['Confirm', true, 0, 1],
    ]);
    expect(plan).toMatchObject({ hidden_tasks: 2, can_edit: false, can_delete: false, status_set_by: 'system', template: { id: 3, name: 'Save plan' } });
    expect(plan.milestones[0].tasks.map((task) => [task.title, task.can_check])).toEqual([
      ['Talk to the champion about the risk', false],
      ['Write down the root cause', true],
    ]);
    expect(await fetchPlan(47)).toMatchObject({ started_by: null, started_by_rule: { id: 10, name: 'Save at-risk renewals' } });
    expect(await refusal(fetchPlan(46))).toEqual({ status: 404, body: { detail: 'Not found.' } });
  });

  it('starts a plan from a template as it is, owned by me, record-owner tasks to the record owner', async () => {
    stubPlans();
    const plan = await startPlan({ template: 1, customer: 2 });
    expect(plan).toMatchObject({ id: 500, name: 'Onboarding · Initech', status: 'not_started', owner: { id: 1 }, start_date: '2026-10-04', target_date: '2026-12-03' });
    expect(plan.milestones.map((m) => m.due_date)).toEqual(['2026-10-04', '2026-10-18', '2026-11-03', '2026-12-03']);
    expect(plan.milestones[3].tasks.map((task) => [task.title, task.assignee?.name])).toEqual([
      ['Run the onboarding review', 'Carl CSM'],
      ['Hand over to the account owner', 'Alice'],
    ]);
  });

  it('starts a plan from an edited copy', async () => {
    const { spy } = stubPlans();
    const body = {
      template: 3, account: 13, name: 'Save Globex NA', owner: 1, start_date: '2026-10-05',
      milestones: [{ name: 'Diagnose', due_date: '2026-10-05', tasks: [{ title: 'Call the champion', priority: 'high' as const, due_date: '2026-10-06', assignee: 1 }] }],
    };
    const plan = await startPlan(body);
    expect(plan).toMatchObject({ id: 500, name: 'Save Globex NA', target_date: '2026-10-05', milestones: [{ name: 'Diagnose', tasks: [{ title: 'Call the champion' }] }] });
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)[0].body).toEqual(body);
  });

  it('refuses a second open plan from one template, and people who cannot open the record', async () => {
    stubPlans();
    expect(await refusal(startPlan({ template: 1, customer: 1 }))).toEqual({
      status: 409,
      body: { code: 'PLAN_OPEN', plan_id: 41, detail: 'This record already has an open plan from this template.' },
    });
    expect(await refusal(startPlan({ template: 2, customer: 1, owner: 5 }))).toEqual({ status: 400, body: { owner: ["They can't open this record."] } });
    const tasks = [
      { title: 'x', priority: 'low' as const, due_date: '2026-10-04', assignee: 1 },
      { title: 'y', priority: 'low' as const, due_date: '2026-10-04', assignee: 5 },
    ];
    expect(await refusal(startPlan({ template: 2, customer: 1, milestones: [{ name: 'A', due_date: '2026-10-04', tasks }] }))).toEqual({
      status: 400,
      body: { milestones: [{ tasks: [{}, { assignee: ["They can't open this record."] }] }] },
    });
  });

  it('moves a plan on track at its first ticked task, and completes a milestone with its last', async () => {
    stubPlans();
    let plan = await updateTask(43, 4311, { status: 'completed' });
    expect(plan.status).toBe('on_track');
    expect(plan.milestones[0].done_at).toBeNull();
    plan = await updateTask(43, 4312, { status: 'completed' });
    expect(plan.milestones[0].done_at).not.toBeNull();
    plan = await updateTask(43, 4312, { status: 'pending' });
    expect(plan.milestones[0].done_at).toBeNull();
  });

  it('marks milestones done by hand, refuses Done early, and finishes the plan with the last one', async () => {
    stubPlans();
    await updateMilestone(43, 431, { done: true });
    expect(await refusal(updatePlan(43, { status: 'done' }))).toEqual({ status: 400, body: { status: ['Mark every milestone done first.'] } });
    await updateMilestone(43, 432, { done: true });
    const plan = await updateMilestone(43, 433, { done: true });
    expect(plan).toMatchObject({ status: 'done', milestones_done: 3 });
    expect(plan.done_at).not.toBeNull();
  });

  it("edits milestones and tasks for editors; a reader may tick only their own task", async () => {
    stubPlans();
    let plan = await addMilestone(43, { name: 'Wrap up', due_date: '2026-10-30' });
    const wrap = plan.milestones[3].id;
    expect(plan.target_date).toBe('2026-10-30');
    plan = await updateMilestone(43, 431, { name: 'Prepare the review' });
    plan = await reorderMilestones(43, [433, 431, 432, wrap]);
    expect(plan.milestones.map((m) => m.name)).toEqual(['Follow up', 'Prepare the review', 'Meet', 'Wrap up']);
    plan = await deleteMilestone(43, wrap);
    expect(plan.milestones).toHaveLength(3);
    plan = await addTask(43, { milestone: 432, title: 'Book the room', priority: 'low', due_date: '2026-10-15', assignee: 4 });
    const room = plan.milestones.find((m) => m.id === 432)!.tasks.find((task) => task.title === 'Book the room')!;
    plan = await updateTask(43, room.id, { milestone: 433 });
    expect(plan.milestones.find((m) => m.id === 433)!.tasks.map((task) => task.title)).toContain('Book the room');
    plan = await deleteTask(43, room.id);
    expect(plan.milestones.flatMap((m) => m.tasks).map((task) => task.title)).not.toContain('Book the room');
    expect(await refusal(updatePlan(42, { status: 'on_track' }))).toEqual({ status: 403, body: { detail: NOT_EDITOR } });
    expect((await updateTask(42, 4212, { status: 'completed' })).milestones[0].tasks[1].status).toBe('completed');
    expect(await refusal(updateTask(42, 4231, { status: 'completed' }))).toEqual({ status: 403, body: { detail: NOT_EDITOR } });
    expect(await refusal(addTask(41, { milestone: 412, title: 'Ask Dana', priority: 'low', due_date: '2026-10-04', assignee: 5 }))).toEqual({
      status: 400,
      body: { assignee: ["They can't open this record."] },
    });
    expect(await refusal(updateTask(41, 4142, { status: 'completed' }))).toMatchObject({ status: 404 });
    expect(await refusal(addMilestone(44, { name: 'Late', due_date: '2026-10-30' }))).toEqual({ status: 400, body: { non_field_errors: [FINISHED_PLAN] } });
    await deleteMilestone(43, 431);
    await deleteMilestone(43, 432);
    expect(await refusal(deleteMilestone(43, 433))).toEqual({ status: 400, body: { non_field_errors: [LAST_MILESTONE] } });
  });

  it('deletes a plan only while none of its work is done', async () => {
    stubPlans();
    expect(await refusal(deletePlan(41))).toEqual({ status: 409, body: { code: 'PLAN_HAS_DONE_WORK', detail: 'Cancel it instead: some of its work is done.' } });
    expect(await deletePlan(43)).toBeNull();
    expect(await refusal(fetchPlan(43))).toMatchObject({ status: 404 });
  });

  it('lists templates by section, creates one, and refuses edits that are not the owner\'s', async () => {
    const { spy } = stubPlans();
    const lists = await fetchTemplates();
    expect(lists.builtin.map((t) => t.name)).toEqual(['Onboarding', 'Success plan', 'Save plan', 'QBR']);
    expect(lists.builtin[0]).toMatchObject({ milestone_count: 4, task_count: 7, length_days: 60, is_builtin: true, owner: null });
    expect(lists.mine.map((t) => t.name)).toEqual(['Renewal prep']);
    expect(lists.shared.map((t) => t.name)).toEqual(["Carl's expansion play"]);
    const body = { name: 'Escalation', kind: 'save' as const, description: '', sharing: 'private' as const, shared_with: [], milestones: [{ name: 'Call', offset_days: 0, tasks: [] }] };
    expect(await createTemplate(body)).toMatchObject({ id: 900, name: 'Escalation', is_owner: true, milestone_count: 1, task_count: 0, length_days: 0 });
    expect(requestsOf(spy, 'POST', /^\/plans\/templates\/$/)[0].body).toEqual(body);
    expect(await refusal(updateTemplate(1, { name: 'Mine now' }))).toEqual({ status: 403, body: { detail: "Built-in templates can't be changed." } });
    expect(await refusal(updateTemplate(11, { name: 'Mine now' }))).toEqual({ status: 403, body: { detail: "Only the template's owner can change it." } });
    expect(await refusal(fetchTemplate(12))).toEqual({ status: 404, body: { detail: 'Not found.' } });
  });

  it("saves a plan as a template: offsets from its start, the record's owner by role", async () => {
    stubPlans();
    const made = await saveAsTemplate(41, { name: 'Our onboarding' });
    expect(made).toMatchObject({ id: 900, name: 'Our onboarding', is_owner: true, sharing: 'private' });
    expect(made.milestones.map((m) => m.offset_days)).toEqual([0, 14, 30, 60]);
    expect(made.milestones[1].tasks.map((task) => [task.title, task.offset_days, task.assignee_role])).toEqual([
      ['Connect data sources', 10, 'record_owner'],
      ["Invite the customer's team", 14, 'plan_owner'],
    ]);
    expect(made.milestones[3].tasks.map((task) => task.title)).toEqual(['Run the onboarding review']);
  });

  it("reads a record's plans open first, the record's owner, and searches both kinds", async () => {
    stubPlans();
    expect(ids((await fetchRecordPlans({ kind: 'organization', id: 2 })).results)).toEqual([45]);
    expect(ids((await fetchRecordPlans({ kind: 'account', id: 13 })).results)).toEqual([44]);
    expect(await fetchPlanRecord('account', 14)).toEqual({ kind: 'account', id: 14, name: 'Initech APAC', owner: { id: 5, name: 'Dana CSM' } });
    expect(await searchPlanRecords('initech')).toEqual([
      { kind: 'organization', id: 2, name: 'Initech' },
      { kind: 'account', id: 14, name: 'Initech APAC' },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/features/plans/planApi.test.ts`
Expected: FAIL, "Failed to resolve import "./planApi"".

- [ ] **Step 3: Write the API**

Create `src/features/plans/planApi.ts`:

```ts
// apiFetch wrappers over /api/v1/plans/… (spec 2026-10-04-plans-design.md §4).
// Every write on a plan answers with the whole Plan, read for the caller.
import { apiFetch } from '../../lib/apiClient';
import { searchRecords } from '../segments/segmentApi';
import type {
  MilestonePatch,
  MilestoneWrite,
  PersonRef,
  Plan,
  PlanPatch,
  PlanRecord,
  PlanRow,
  PlansPage,
  PlanStart,
  PlanTemplate,
  RecordKind,
  RecordRef,
  SaveAsTemplate,
  TaskPatch,
  TaskWrite,
  TemplateLists,
  TemplateWrite,
} from './planTypes';

export const PLANS_PATH = '/plans/';
export const TEMPLATES_PATH = '/plans/templates/';
const one = (id: number) => `${PLANS_PATH}${id}/`;
const template = (id: number) => `${TEMPLATES_PATH}${id}/`;

/** One page of 50 with the column counts; `query` has no leading "?". */
export function fetchPlans(query: string): Promise<PlansPage> {
  return apiFetch<PlansPage>(query ? `${PLANS_PATH}?${query}` : PLANS_PATH);
}

/** The same page, shaped for usePagedRead (`next_cursor`). */
export async function fetchPlansPaged(query: string): Promise<PlansPage & { next_cursor: string | null }> {
  const page = await fetchPlans(query);
  return { ...page, next_cursor: page.next };
}

export function fetchPlan(id: number): Promise<Plan> {
  return apiFetch<Plan>(one(id));
}

/** 201 with the plan; 409 `{code: 'PLAN_OPEN', plan_id, detail}`. */
export function startPlan(body: PlanStart): Promise<Plan> {
  return apiFetch<Plan>(PLANS_PATH, { method: 'POST', body });
}

export function updatePlan(id: number, body: PlanPatch): Promise<Plan> {
  return apiFetch<Plan>(one(id), { method: 'PATCH', body });
}

/** 204; 409 `{code: 'PLAN_HAS_DONE_WORK', detail}`. */
export function deletePlan(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

export function addMilestone(id: number, body: MilestoneWrite): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}milestones/`, { method: 'POST', body });
}

export function updateMilestone(id: number, milestoneId: number, body: MilestonePatch): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}milestones/${milestoneId}/`, { method: 'PATCH', body });
}

/** Its tasks are deleted with it. */
export function deleteMilestone(id: number, milestoneId: number): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}milestones/${milestoneId}/`, { method: 'DELETE' });
}

/** Every milestone id, once. */
export function reorderMilestones(id: number, order: number[]): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}milestones/reorder/`, { method: 'POST', body: { order } });
}

export function addTask(id: number, body: TaskWrite): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}tasks/`, { method: 'POST', body });
}

/** Editors change anything; the assignee and the creator may change `status`. */
export function updateTask(id: number, taskId: number, body: TaskPatch): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}tasks/${taskId}/`, { method: 'PATCH', body });
}

export function deleteTask(id: number, taskId: number): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}tasks/${taskId}/`, { method: 'DELETE' });
}

export function fetchTemplates(): Promise<TemplateLists> {
  return apiFetch<TemplateLists>(TEMPLATES_PATH);
}

export function fetchTemplate(id: number): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(template(id));
}

export function createTemplate(body: TemplateWrite): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(TEMPLATES_PATH, { method: 'POST', body });
}

/** The owner's only; built-in templates answer 403. */
export function updateTemplate(id: number, body: Partial<TemplateWrite>): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(template(id), { method: 'PATCH', body });
}

export function deleteTemplate(id: number): Promise<null> {
  return apiFetch<null>(template(id), { method: 'DELETE' });
}

export function saveAsTemplate(id: number, body: SaveAsTemplate): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(`${one(id)}save-as-template/`, { method: 'POST', body });
}

/** A record's plans, open first, then newest; 404 if the reader can't open it. */
export function fetchRecordPlans(record: { kind: RecordKind; id: number }): Promise<{ results: PlanRow[] }> {
  const base = record.kind === 'organization' ? '/customers/' : '/accounts/';
  return apiFetch<{ results: PlanRow[] }>(`${base}${record.id}/plans/`);
}

/** The record's name and owner, through the record's own read (Contract note 9). */
export async function fetchPlanRecord(kind: RecordKind, id: number): Promise<PlanRecord> {
  const path = kind === 'organization' ? `/customers/${id}/` : `/accounts/${id}/`;
  const read = await apiFetch<{ id: number; name: string; owner: PersonRef | null }>(path);
  return { kind, id: read.id, name: read.name, owner: read.owner ? { id: read.owner.id, name: read.owner.name } : null };
}

/** Organisations, then accounts, the reader may open, by name. */
export async function searchPlanRecords(search: string): Promise<RecordRef[]> {
  const [organisations, accounts] = await Promise.all([searchRecords('customer', search), searchRecords('account', search)]);
  return [
    ...organisations.map((row): RecordRef => ({ kind: 'organization', id: row.id, name: row.name })),
    ...accounts.map((row): RecordRef => ({ kind: 'account', id: row.id, name: row.name })),
  ];
}
```

- [ ] **Step 4: Write the template fixtures**

Create `src/features/plans/testTemplates.ts`:

```ts
// Test-only: plan templates in the contract's shape (spec §1.6 and §4),
// shared by the Plans stub and the Rules stub's "Start a plan" action. The
// viewer is ME (Alice, id 1).
import { CARL, DANA, ME } from '../segments/testSegments';
import type { AssigneeRole, PlanTemplate, Priority, TemplateMilestone, TemplateTask } from './planTypes';

const task = (title: string, priority: Priority, offset_days: number, assignee_role: AssigneeRole = 'record_owner'): TemplateTask => ({
  title,
  priority,
  offset_days,
  assignee_role,
});
const step = (name: string, offset_days: number, tasks: TemplateTask[]): TemplateMilestone => ({ name, offset_days, tasks });

/** The counts the server computes: `length_days` is the largest offset. */
export function withCounts(template: Omit<PlanTemplate, 'milestone_count' | 'task_count' | 'length_days'>): PlanTemplate {
  const offsets = template.milestones.flatMap((milestone) => [milestone.offset_days, ...milestone.tasks.map((one) => one.offset_days)]);
  return {
    ...template,
    milestone_count: template.milestones.length,
    task_count: template.milestones.reduce((n, milestone) => n + milestone.tasks.length, 0),
    length_days: offsets.length > 0 ? Math.max(...offsets) : 0,
  };
}

const BUILT_IN = { description: '', is_builtin: true, is_owner: false, owner: null, sharing: 'workspace' as const, shared_with: [], updated_at: '2026-10-01T00:00:00Z' };

export const ONBOARDING = withCounts({
  ...BUILT_IN,
  id: 1,
  name: 'Onboarding',
  kind: 'onboarding',
  milestones: [
    step('Kick-off', 0, [task('Hold the kick-off call', 'high', 0), task('Confirm goals and success criteria', 'high', 3)]),
    step('Set up', 14, [task('Connect data sources', 'high', 10), task("Invite the customer's team", 'medium', 14)]),
    step('First value', 30, [task('Review first results with the champion', 'high', 28)]),
    step('Hand-off', 60, [task('Run the onboarding review', 'medium', 55), task('Hand over to the account owner', 'medium', 60, 'plan_owner')]),
  ],
});
export const SUCCESS = withCounts({
  ...BUILT_IN,
  id: 2,
  name: 'Success plan',
  kind: 'success',
  milestones: [
    step('Agree outcomes', 0, [task('Write the success plan with the customer', 'high', 7)]),
    step('Check-in', 30, [task('Review progress against outcomes', 'medium', 30)]),
    step('Expand adoption', 60, [task('Find the next team or use case', 'medium', 60)]),
    step('Review', 90, [task('Run the quarterly success review', 'high', 90)]),
  ],
});
export const SAVE = withCounts({
  ...BUILT_IN,
  id: 3,
  name: 'Save plan',
  kind: 'save',
  milestones: [
    step('Diagnose', 0, [task('Talk to the champion about the risk', 'high', 2), task('Write down the root cause', 'high', 5)]),
    step('Act', 14, [task('Agree a recovery plan with the customer', 'high', 10), task('Bring in an executive sponsor', 'medium', 14, 'plan_owner')]),
    step('Confirm', 30, [task('Check health and usage have recovered', 'high', 30)]),
  ],
});
export const QBR = withCounts({
  ...BUILT_IN,
  id: 4,
  name: 'QBR',
  kind: 'qbr',
  milestones: [
    step('Prepare', 0, [task("Pull the quarter's usage and outcomes", 'medium', 0), task('Draft the deck', 'medium', 5)]),
    step('Meet', 10, [task('Hold the business review', 'high', 10)]),
    step('Follow up', 14, [task('Send notes and next steps', 'high', 12), task('Log decisions on the account', 'medium', 14)]),
  ],
});
export const BUILTINS: PlanTemplate[] = [ONBOARDING, SUCCESS, SAVE, QBR];

/** Mine, private. */
export const MINE_TEMPLATE = withCounts({
  id: 10,
  name: 'Renewal prep',
  kind: 'other',
  description: 'What I do before every renewal.',
  is_builtin: false,
  is_owner: true,
  owner: ME,
  sharing: 'private',
  shared_with: [],
  milestones: [step('Prepare', 0, [task('Review the contract', 'high', 0, 'plan_owner')]), step('Renew', 30, [])],
  updated_at: '2026-10-02T09:00:00Z',
});
/** Carl's, shared with me by name. */
export const SHARED_TEMPLATE = withCounts({
  id: 11,
  name: "Carl's expansion play",
  kind: 'success',
  description: '',
  is_builtin: false,
  is_owner: false,
  owner: CARL,
  sharing: 'people',
  shared_with: [ME],
  milestones: [step('Find the team', 0, [task('Map the next team', 'medium', 7, 'plan_owner')])],
  updated_at: '2026-10-03T09:00:00Z',
});
/** Dana's, private: unreadable, so a 404 like a missing id. */
export const DANA_TEMPLATE = withCounts({
  id: 12,
  name: "Dana's private play",
  kind: 'save',
  description: '',
  is_builtin: false,
  is_owner: false,
  owner: DANA,
  sharing: 'private',
  shared_with: [],
  milestones: [step('Call', 0, [])],
  updated_at: '2026-10-03T09:00:00Z',
});
export const TEMPLATES: PlanTemplate[] = [...BUILTINS, MINE_TEMPLATE, SHARED_TEMPLATE, DANA_TEMPLATE];

export const readableTemplate = (one: PlanTemplate) =>
  one.is_builtin || one.is_owner || one.sharing === 'workspace' || (one.sharing === 'people' && one.shared_with.some((person) => person.id === ME.id));

/** `{id, name}` for a template ME may use, else null (spec §1.8). */
export function templateRef(id: number): { id: number; name: string } | null {
  const found = TEMPLATES.find((one) => one.id === id && readableTemplate(one));
  return found ? { id: found.id, name: found.name } : null;
}
```

- [ ] **Step 5: Write the stub**

Create `src/features/plans/testPlans.ts`:

```ts
// Test-only: plans in the contract's shapes (spec §4) and one fetch stub for
// every endpoint the Plans pages read. It keeps state and mirrors the status
// rules of spec §1.2: the first ticked task or done milestone puts a plan on
// track; a milestone completes with its last task and re-opens when one
// re-opens, unless it was marked done by hand; the last done milestone
// finishes the plan. Paths it does not own fall through to stubRules (then
// stubSurveys, then stubSegments). The viewer is ME (Alice, id 1) of "Acme
// Inc"; Carl reports to her.
import { vi } from 'vitest';
import { stubRules, type RulesStub } from '../rules/testRules';
import type { PersonRef } from '../segments/segmentTypes';
import { CARL, DANA, ME, TEAM } from '../segments/testSegments';
import { CHECK, OPEN_STATUSES, SAY, STATUSES } from './planOptions';
import { addDays, daysBetween, defaultPlanName, isOpen } from './planText';
import { readableTemplate, TEMPLATES, withCounts } from './testTemplates';
import type {
  Milestone,
  Plan,
  PlanKind,
  PlanRecord,
  PlanRow,
  PlanStatus,
  PlanTask,
  PlanTemplate,
  Priority,
  RecordKind,
  RecordRef,
  StartMilestone,
  TaskStatus,
  TemplateMilestone,
} from './planTypes';

type Answer = { status: number; body: unknown };

/** The stub's today: `is_overdue` is "before this day". */
export const TODAY = '2026-10-04';
const NOW = '2026-10-04T09:00:00Z';
export const NOT_EDITOR = "Only the plan's owner or their managers can change it.";
/** The backend's refusal of a structure edit on a done or cancelled plan (Contract note 19). */
export const FINISHED_PLAN = 'This plan is finished; only its tasks can change.';
export const LAST_MILESTONE = 'A plan needs at least one milestone.';

/** GET customers/:id/ and accounts/:id/ as Plans reads them. Ids match the
 *  segments stub's record search (Globex 1, Initech 2, Pizza Hut 7; Pizza
 *  EMEA 12, Globex NA 13, Initech APAC 14). */
export const RECORDS: PlanRecord[] = [
  { kind: 'organization', id: 1, name: 'Globex', owner: ME },
  { kind: 'organization', id: 2, name: 'Initech', owner: CARL },
  { kind: 'organization', id: 7, name: 'Pizza Hut', owner: CARL },
  { kind: 'account', id: 12, name: 'Pizza EMEA', owner: CARL },
  { kind: 'account', id: 13, name: 'Globex NA', owner: ME },
  { kind: 'account', id: 14, name: 'Initech APAC', owner: DANA },
];
/** Who can't open which record (spec §1.3): Dana can't open Globex. */
const CANT_OPEN: Record<string, number[]> = { 'organization:1': [DANA.id] };
const cantOpen = (record: { kind: RecordKind; id: number }, person: number) => (CANT_OPEN[`${record.kind}:${record.id}`] ?? []).includes(person);

/** GET /auth/members/: Carl reports to Alice, so she has reports. */
export const MEMBERS = TEAM.map((person) => ({ ...person, reports_to: person.id === CARL.id ? { id: ME.id, name: ME.name } : null }));
const active = (id: number): PersonRef | null => {
  const found = TEAM.find((person) => person.id === id && person.is_active);
  return found ? { id: found.id, name: found.name } : null;
};

export interface StoredTask extends PlanTask {
  /** Whether ME may see it (spec §1.3: creator, assignee, their managers). */
  visible: boolean;
}
export interface StoredMilestone {
  id: number;
  name: string;
  due_date: string;
  done_at: string | null;
  /** Marked done by a person; stays done when a task re-opens. */
  by_hand: boolean;
  tasks: StoredTask[];
}
export interface StoredPlan {
  id: number;
  name: string;
  kind: PlanKind;
  status: PlanStatus;
  status_set_by: 'person' | 'system';
  record: RecordRef;
  owner: PersonRef;
  start_date: string;
  template: { id: number; name: string } | null;
  started_by: PersonRef | null;
  started_by_rule: { id: number | null; name: string } | null;
  done_at: string | null;
  created_at: string;
  can_edit: boolean;
  readable: boolean;
  milestones: StoredMilestone[];
}

const T = (
  id: number,
  title: string,
  priority: Priority,
  due_date: string,
  assignee: PersonRef | null,
  status: TaskStatus = 'pending',
  extra: Partial<StoredTask> = {},
): StoredTask => ({ id, title, priority, status, due_date, assignee, can_check: true, visible: true, ...extra });
const M = (id: number, name: string, due_date: string, tasks: StoredTask[], done_at: string | null = null): StoredMilestone => ({
  id,
  name,
  due_date,
  done_at,
  by_hand: done_at !== null,
  tasks,
});
const BASE = { status_set_by: 'person' as const, started_by: ME, started_by_rule: null, done_at: null, can_edit: true, readable: true };

/** Mine, on track: Kick-off done, Set up due today, one task hidden. */
export const GLOBEX_ONBOARDING: StoredPlan = {
  ...BASE, id: 41, name: 'Onboarding · Globex', kind: 'onboarding', status: 'on_track', record: { kind: 'organization', id: 1, name: 'Globex' },
  owner: ME, start_date: '2026-09-20', template: { id: 1, name: 'Onboarding' }, created_at: '2026-09-20T09:00:00Z',
  milestones: [
    M(411, 'Kick-off', '2026-09-20', [
      T(4111, 'Hold the kick-off call', 'high', '2026-09-20', ME, 'completed'),
      T(4112, 'Confirm goals and success criteria', 'high', '2026-09-23', ME, 'completed'),
    ], '2026-09-22T10:00:00Z'),
    M(412, 'Set up', '2026-10-04', [T(4121, 'Connect data sources', 'high', '2026-09-30', ME), T(4122, "Invite the customer's team", 'medium', '2026-10-04', CARL)]),
    M(413, 'First value', '2026-10-20', [T(4131, 'Review first results with the champion', 'high', '2026-10-18', ME)]),
    M(414, 'Hand-off', '2026-11-19', [
      T(4141, 'Run the onboarding review', 'medium', '2026-11-14', ME),
      T(4142, 'Hand over to the account owner', 'medium', '2026-11-19', DANA, 'pending', { visible: false }),
    ]),
  ],
};
/** Dana's, at risk (the night set it), Act overdue with both tasks hidden; I may tick only my own task. */
export const INITECH_APAC_SAVE: StoredPlan = {
  ...BASE, id: 42, name: 'Save plan · Initech APAC', kind: 'save', status: 'at_risk', status_set_by: 'system',
  record: { kind: 'account', id: 14, name: 'Initech APAC' }, owner: DANA, start_date: '2026-09-01', template: { id: 3, name: 'Save plan' },
  started_by: DANA, created_at: '2026-09-01T09:00:00Z', can_edit: false,
  milestones: [
    M(421, 'Diagnose', '2026-09-01', [
      T(4211, 'Talk to the champion about the risk', 'high', '2026-09-03', DANA, 'completed', { can_check: false }),
      T(4212, 'Write down the root cause', 'high', '2026-09-06', ME),
    ], '2026-09-03T10:00:00Z'),
    M(422, 'Act', '2026-09-15', [
      T(4221, 'Agree a recovery plan with the customer', 'high', '2026-09-11', DANA, 'pending', { visible: false, can_check: false }),
      T(4222, 'Bring in an executive sponsor', 'medium', '2026-09-15', DANA, 'pending', { visible: false, can_check: false }),
    ]),
    M(423, 'Confirm', '2026-10-01', [T(4231, 'Check health and usage have recovered', 'high', '2026-10-01', DANA, 'pending', { can_check: false })]),
  ],
};
/** Mine, not started, nothing done: deletable. */
export const PIZZA_QBR: StoredPlan = {
  ...BASE, id: 43, name: 'QBR · Pizza Hut', kind: 'qbr', status: 'not_started', record: { kind: 'organization', id: 7, name: 'Pizza Hut' },
  owner: ME, start_date: '2026-10-06', template: { id: 4, name: 'QBR' }, created_at: '2026-10-03T09:00:00Z',
  milestones: [
    M(431, 'Prepare', '2026-10-06', [T(4311, "Pull the quarter's usage and outcomes", 'medium', '2026-10-06', CARL), T(4312, 'Draft the deck', 'medium', '2026-10-11', CARL)]),
    M(432, 'Meet', '2026-10-16', [T(4321, 'Hold the business review', 'high', '2026-10-16', CARL)]),
    M(433, 'Follow up', '2026-10-20', [T(4331, 'Send notes and next steps', 'high', '2026-10-18', CARL), T(4332, 'Log decisions on the account', 'medium', '2026-10-20', CARL)]),
  ],
};
/** Mine, done. */
export const GLOBEX_NA_SUCCESS: StoredPlan = {
  ...BASE, id: 44, name: 'Success plan · Globex NA', kind: 'success', status: 'done', status_set_by: 'system', record: { kind: 'account', id: 13, name: 'Globex NA' },
  owner: ME, start_date: '2026-06-01', template: { id: 2, name: 'Success plan' }, done_at: '2026-09-01T09:00:00Z', created_at: '2026-06-01T09:00:00Z',
  milestones: [
    M(441, 'Agree outcomes', '2026-06-01', [T(4411, 'Write the success plan with the customer', 'high', '2026-06-08', ME, 'completed')], '2026-06-08T09:00:00Z'),
    M(442, 'Check-in', '2026-07-01', [T(4421, 'Review progress against outcomes', 'medium', '2026-07-01', ME, 'completed')], '2026-07-01T09:00:00Z'),
    M(443, 'Expand adoption', '2026-07-31', [T(4431, 'Find the next team or use case', 'medium', '2026-07-31', ME, 'completed')], '2026-07-31T09:00:00Z'),
    M(444, 'Review', '2026-08-30', [T(4441, 'Run the quarterly success review', 'high', '2026-08-30', ME, 'completed')], '2026-09-01T09:00:00Z'),
  ],
};
/** Mine, cancelled. */
export const INITECH_RENEWAL: StoredPlan = {
  ...BASE, id: 45, name: 'Renewal prep · Initech', kind: 'other', status: 'cancelled', record: { kind: 'organization', id: 2, name: 'Initech' },
  owner: ME, start_date: '2026-08-01', template: { id: 10, name: 'Renewal prep' }, created_at: '2026-08-01T09:00:00Z',
  milestones: [M(451, 'Prepare', '2026-08-01', [T(4511, 'Review the contract', 'high', '2026-08-01', ME)]), M(452, 'Renew', '2026-08-31', [])],
};
/** On a record I can't open: never listed, a 404. */
export const DANA_PRIVATE_PLAN: StoredPlan = {
  ...BASE, id: 46, name: "Dana's plan", kind: 'other', status: 'on_track', record: { kind: 'organization', id: 99, name: 'Hooli' },
  owner: DANA, start_date: '2026-09-01', template: null, started_by: DANA, created_at: '2026-09-01T09:00:00Z', can_edit: false, readable: false,
  milestones: [M(461, 'Call', '2026-09-30', [])],
};
/** Carl's (my report, so I edit it), started by a rule. */
export const PIZZA_EMEA_SAVE: StoredPlan = {
  ...BASE, id: 47, name: 'Save plan · Pizza EMEA', kind: 'save', status: 'not_started', status_set_by: 'system',
  record: { kind: 'account', id: 12, name: 'Pizza EMEA' }, owner: CARL, start_date: '2026-10-05', template: { id: 3, name: 'Save plan' },
  started_by: null, started_by_rule: { id: 10, name: 'Save at-risk renewals' }, created_at: '2026-10-04T02:00:00Z',
  milestones: [
    M(471, 'Diagnose', '2026-10-05', [T(4711, 'Talk to the champion about the risk', 'high', '2026-10-07', CARL), T(4712, 'Write down the root cause', 'high', '2026-10-10', CARL)]),
    M(472, 'Act', '2026-10-19', [T(4721, 'Agree a recovery plan with the customer', 'high', '2026-10-15', CARL), T(4722, 'Bring in an executive sponsor', 'medium', '2026-10-19', CARL)]),
    M(473, 'Confirm', '2026-11-04', [T(4731, 'Check health and usage have recovered', 'high', '2026-11-04', CARL)]),
  ],
};
export const PLANS: StoredPlan[] = [GLOBEX_ONBOARDING, INITECH_APAC_SAVE, PIZZA_QBR, GLOBEX_NA_SUCCESS, INITECH_RENEWAL, DANA_PRIVATE_PLAN, PIZZA_EMEA_SAVE];

const NOT_FOUND: Answer = { status: 404, body: { detail: 'Not found.' } };
const bad = (body: unknown): Answer => ({ status: 400, body });
const blank = (value: unknown) => typeof value !== 'string' || !value.trim();
const BLANK = ['This field may not be blank.'];
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob([JSON.stringify(body)]) });
const clonePlan = (plan: StoredPlan): StoredPlan => ({
  ...plan,
  milestones: plan.milestones.map((milestone) => ({ ...milestone, tasks: milestone.tasks.map((one) => ({ ...one })) })),
});
const cloneTemplate = (one: PlanTemplate): PlanTemplate => ({ ...one, milestones: one.milestones.map((m) => ({ ...m, tasks: m.tasks.map((t) => ({ ...t })) })) });

/** The plan as the reader reads it (spec §4 `Plan`). */
function toPlan(plan: StoredPlan): Plan {
  const milestones: Milestone[] = plan.milestones.map((milestone, position) => {
    const seen: PlanTask[] = milestone.tasks
      .filter((one) => one.visible)
      .map((one) => ({ id: one.id, title: one.title, priority: one.priority, status: one.status, due_date: one.due_date, assignee: one.assignee, can_check: one.can_check }));
    return {
      id: milestone.id,
      name: milestone.name,
      position,
      due_date: milestone.due_date,
      done_at: milestone.done_at,
      is_overdue: milestone.done_at === null && milestone.due_date < TODAY,
      tasks: seen,
      hidden_tasks: milestone.tasks.length - seen.length,
      tasks_done: seen.filter((one) => one.status === 'completed').length,
      tasks_total: seen.length,
    };
  });
  const next_due = milestones.filter((m) => m.done_at === null).map((m) => m.due_date).sort()[0] ?? null;
  return {
    id: plan.id,
    name: plan.name,
    kind: plan.kind,
    status: plan.status,
    record: plan.record,
    owner: plan.owner,
    start_date: plan.start_date,
    target_date: plan.milestones.length > 0 ? plan.milestones[plan.milestones.length - 1].due_date : plan.start_date,
    milestones_done: milestones.filter((m) => m.done_at !== null).length,
    milestones_total: milestones.length,
    tasks_done: milestones.reduce((n, m) => n + m.tasks_done, 0),
    tasks_total: milestones.reduce((n, m) => n + m.tasks_total, 0),
    next_due,
    is_overdue: next_due !== null && next_due < TODAY,
    can_edit: plan.can_edit,
    template: plan.template,
    started_by: plan.started_by,
    started_by_rule: plan.started_by_rule,
    status_set_by: plan.status_set_by,
    done_at: plan.done_at,
    created_at: plan.created_at,
    milestones,
    hidden_tasks: milestones.reduce((n, m) => n + m.hidden_tasks, 0),
    can_delete: plan.can_edit && !plan.milestones.some((m) => m.tasks.some((one) => one.status === 'completed')),
  };
}

function toRow(plan: StoredPlan): PlanRow {
  const full = toPlan(plan);
  return {
    id: full.id, name: full.name, kind: full.kind, status: full.status, record: full.record, owner: full.owner, start_date: full.start_date,
    target_date: full.target_date, milestones_done: full.milestones_done, milestones_total: full.milestones_total, tasks_done: full.tasks_done,
    tasks_total: full.tasks_total, next_due: full.next_due, is_overdue: full.is_overdue, can_edit: full.can_edit,
  };
}

/** Spec §1.2, in brief. A finished plan's status never moves here. */
function progressed(plan: StoredPlan) {
  if (!isOpen(plan.status)) return;
  const any = plan.milestones.some((m) => m.done_at !== null || m.tasks.some((one) => one.status === 'completed'));
  if (plan.status === 'not_started' && any) Object.assign(plan, { status: 'on_track', status_set_by: 'system' });
  if (plan.milestones.length > 0 && plan.milestones.every((m) => m.done_at !== null)) Object.assign(plan, { status: 'done', status_set_by: 'system', done_at: NOW });
}

function settle(plan: StoredPlan, milestone: StoredMilestone) {
  if (milestone.tasks.length > 0) {
    const all = milestone.tasks.every((one) => one.status === 'completed');
    if (all && milestone.done_at === null) Object.assign(milestone, { done_at: NOW, by_hand: false });
    if (!all && milestone.done_at !== null && !milestone.by_hand) milestone.done_at = null;
  }
  progressed(plan);
}

/** A template's milestone list, checked as the backend would (spec §1.1). */
function checkMilestones(milestones: unknown): Answer | null {
  if (!Array.isArray(milestones) || milestones.length === 0 || milestones.length > 12) return bad({ milestones: ['A template holds 1 to 12 milestones.'] });
  const list = milestones as TemplateMilestone[];
  if (list.reduce((n, m) => n + m.tasks.length, 0) > 50) return bad({ milestones: [CHECK.TOO_MANY_TASKS] });
  const errors = list.map((m) => {
    const field: Record<string, unknown> = {};
    if (blank(m.name)) field.name = BLANK;
    if (!Number.isInteger(m.offset_days) || m.offset_days < 0 || m.offset_days > 365) field.offset_days = ['Ensure this value is between 0 and 365.'];
    const tasks = m.tasks.map((one) => (blank(one.title) ? { title: BLANK } : {}));
    if (tasks.some((one) => Object.keys(one).length > 0)) field.tasks = tasks;
    return field;
  });
  return errors.some((one) => Object.keys(one).length > 0) ? bad({ milestones: errors }) : null;
}

export interface PlansStub {
  plans?: StoredPlan[];
  templates?: PlanTemplate[];
  /** GET /auth/members/ (default MEMBERS: Carl reports to Alice). */
  members?: unknown[];
  /** Rows a page holds (default 50). */
  pageSize?: number;
  /** GET plans/: an answer overrides; undefined falls through. */
  list?: (query: URLSearchParams) => Answer | undefined;
  /** POST plans/: an answer (or a promise of one) overrides; undefined falls through. */
  start?: (body: Record<string, unknown>) => Answer | Promise<Answer> | undefined;
  /** PATCH plans/:id/: an answer overrides; undefined falls through. */
  patch?: (id: number, body: Record<string, unknown>) => Answer | undefined;
  /** DELETE plans/:id/: an answer overrides; undefined falls through. */
  remove?: (id: number) => Answer | undefined;
  /** GET customers/:id/plans/ and accounts/:id/plans/: an answer overrides. */
  recordPlans?: (kind: RecordKind, id: number) => Answer | undefined;
  /** Passed to stubRules for everything this stub does not own. */
  rules?: RulesStub;
}

export function stubPlans(stub: PlansStub = {}) {
  const plans = (stub.plans ?? PLANS).map(clonePlan);
  const templates = (stub.templates ?? TEMPLATES).map(cloneTemplate);
  const pageSize = stub.pageSize ?? 50;
  const rules = stubRules(stub.rules);
  let nextPlan = 500;
  let nextMilestone = 5000;
  let nextTask = 50000;
  let nextTemplate = 900;

  const readable = () => plans.filter((plan) => plan.readable);
  const matching = (query: URLSearchParams, withStatus: boolean) => {
    let rows = readable();
    const kind = query.get('kind');
    if (kind) rows = rows.filter((plan) => plan.kind === kind);
    const owner = query.get('owner');
    if (owner) rows = rows.filter((plan) => plan.owner.id === (owner === 'me' ? ME.id : Number(owner)));
    if (query.get('mine') === 'tasks') rows = rows.filter((plan) => plan.milestones.some((m) => m.tasks.some((one) => one.visible && one.assignee?.id === ME.id)));
    const customer = query.get('customer');
    if (customer) rows = rows.filter((plan) => plan.record.kind === 'organization' && plan.record.id === Number(customer));
    const account = query.get('account');
    if (account) rows = rows.filter((plan) => plan.record.kind === 'account' && plan.record.id === Number(account));
    const q = (query.get('q') ?? '').toLowerCase();
    if (q) rows = rows.filter((plan) => plan.name.toLowerCase().includes(q) || plan.record.name.toLowerCase().includes(q));
    if (withStatus) {
      const asked = query.getAll('status');
      const wanted = new Set<string>((asked.length > 0 ? asked : ['open']).flatMap((status) => (status === 'open' ? [...OPEN_STATUSES] : [status])));
      rows = rows.filter((plan) => wanted.has(plan.status));
    }
    return rows.sort((a, b) => b.id - a.id);
  };

  const templateLists = () => {
    const seen = templates.filter(readableTemplate);
    return { builtin: seen.filter((one) => one.is_builtin), mine: seen.filter((one) => one.is_owner), shared: seen.filter((one) => !one.is_builtin && !one.is_owner) };
  };

  const start = (data: Record<string, unknown>): Answer => {
    const template = templates.find((one) => one.id === data.template && readableTemplate(one));
    if (!template) return bad({ template: [SAY.CHOOSE_TEMPLATE] });
    const kind: RecordKind | null = data.customer !== undefined && data.account === undefined ? 'organization' : data.account !== undefined && data.customer === undefined ? 'account' : null;
    if (!kind) return bad({ non_field_errors: ['Choose an organisation or an account.'] });
    const record = RECORDS.find((one) => one.kind === kind && one.id === Number(kind === 'organization' ? data.customer : data.account));
    if (!record) return NOT_FOUND;
    if ('name' in data && blank(data.name)) return bad({ name: BLANK });
    const clash = plans.find((plan) => plan.template?.id === template.id && plan.record.kind === record.kind && plan.record.id === record.id && isOpen(plan.status));
    if (clash) return { status: 409, body: { code: 'PLAN_OPEN', plan_id: clash.id, detail: 'This record already has an open plan from this template.' } };
    const ownerId = Number(data.owner ?? ME.id);
    const owner = active(ownerId);
    if (!owner || cantOpen(record, ownerId)) return bad({ owner: [SAY.CANT_OPEN] });
    const startDate = typeof data.start_date === 'string' ? data.start_date : TODAY;
    const sent: StartMilestone[] = Array.isArray(data.milestones)
      ? (data.milestones as StartMilestone[])
      : template.milestones.map((m) => ({
          name: m.name,
          due_date: addDays(startDate, m.offset_days),
          tasks: m.tasks.map((one) => ({
            title: one.title,
            priority: one.priority,
            due_date: addDays(startDate, one.offset_days),
            assignee: one.assignee_role === 'record_owner' && record.owner ? record.owner.id : ownerId,
          })),
        }));
    const errors = sent.map((m) => {
      const tasks = m.tasks.map((one) => (active(one.assignee) === null || cantOpen(record, one.assignee) ? { assignee: [SAY.CANT_OPEN] } : {}));
      return tasks.some((one) => Object.keys(one).length > 0) ? { tasks } : {};
    });
    if (errors.some((one) => Object.keys(one).length > 0)) return bad({ milestones: errors });
    const plan: StoredPlan = {
      ...BASE,
      id: nextPlan++,
      name: typeof data.name === 'string' ? data.name.trim() : defaultPlanName(template.name, record.name),
      kind: template.kind,
      status: 'not_started',
      record: { kind: record.kind, id: record.id, name: record.name },
      owner,
      start_date: startDate,
      template: { id: template.id, name: template.name },
      created_at: NOW,
      milestones: sent.map((m) => M(nextMilestone++, m.name, m.due_date, m.tasks.map((one) => T(nextTask++, one.title, one.priority, one.due_date, active(one.assignee))))),
    };
    plans.push(plan);
    return { status: 201, body: toPlan(plan) };
  };

  const planRoute = (plan: StoredPlan, rest: string, method: string, data: Record<string, unknown>): Answer => {
    const forbidden = { status: 403, body: { detail: NOT_EDITOR } };
    if (rest === '' && method === 'GET') return { status: 200, body: toPlan(plan) };
    if (rest === '' && method === 'PATCH') {
      const override = stub.patch?.(plan.id, data);
      if (override) return override;
      if (!plan.can_edit) return forbidden;
      if ('name' in data && blank(data.name)) return bad({ name: BLANK });
      if ('owner' in data) {
        const owner = active(Number(data.owner));
        if (!owner || cantOpen(plan.record, Number(data.owner))) return bad({ owner: [SAY.CANT_OPEN] });
        plan.owner = owner;
      }
      if ('name' in data) plan.name = String(data.name).trim();
      if ('status' in data) {
        const next = data.status as PlanStatus;
        if (next === 'done' && plan.milestones.some((m) => m.done_at === null)) return bad({ status: [CHECK.ALL_MILESTONES_DONE] });
        Object.assign(plan, { status: next, status_set_by: 'person', done_at: next === 'done' ? NOW : null });
      }
      return { status: 200, body: toPlan(plan) };
    }
    if (rest === '' && method === 'DELETE') {
      const override = stub.remove?.(plan.id);
      if (override) return override;
      if (!plan.can_edit) return forbidden;
      if (!toPlan(plan).can_delete) return { status: 409, body: { code: 'PLAN_HAS_DONE_WORK', detail: SAY.HAS_DONE_WORK } };
      plans.splice(plans.indexOf(plan), 1);
      return { status: 204, body: null };
    }
    if (rest === 'save-as-template/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      if (blank(data.name)) return bad({ name: BLANK });
      const recordOwner = RECORDS.find((one) => one.kind === plan.record.kind && one.id === plan.record.id)?.owner?.id ?? null;
      const made = withCounts({
        id: nextTemplate++,
        name: String(data.name).trim(),
        kind: plan.kind,
        description: '',
        is_builtin: false,
        is_owner: true,
        owner: ME,
        sharing: (data.sharing as PlanTemplate['sharing'] | undefined) ?? 'private',
        shared_with: ((data.shared_with as number[] | undefined) ?? []).flatMap((id) => (active(id) ? [active(id)!] : [])),
        milestones: plan.milestones.map((m) => ({
          name: m.name,
          offset_days: daysBetween(plan.start_date, m.due_date),
          // Only the tasks the caller can see (Contract note 20).
          tasks: m.tasks.filter((one) => one.visible).map((one) => ({
            title: one.title,
            priority: one.priority,
            offset_days: daysBetween(plan.start_date, one.due_date),
            assignee_role: one.assignee !== null && one.assignee.id === recordOwner ? ('record_owner' as const) : ('plan_owner' as const),
          })),
        })),
        updated_at: NOW,
      });
      templates.push(made);
      return { status: 201, body: made };
    }
    const milestoneOf = (taskId: number) => plan.milestones.find((m) => m.tasks.some((one) => one.id === taskId)) ?? null;
    const statusOnly = Object.keys(data).every((key) => key === 'status');
    const structure = rest.startsWith('milestones/') || (rest.startsWith('tasks/') && !(method === 'PATCH' && statusOnly));
    if (structure && plan.can_edit && !isOpen(plan.status)) return bad({ non_field_errors: [FINISHED_PLAN] });
    if (rest === 'milestones/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      if (blank(data.name)) return bad({ name: BLANK });
      plan.milestones.push(M(nextMilestone++, String(data.name).trim(), String(data.due_date), []));
      return { status: 201, body: toPlan(plan) };
    }
    if (rest === 'milestones/reorder/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      const order = (data.order as number[] | undefined) ?? [];
      const known = plan.milestones.map((m) => m.id);
      if (order.length !== known.length || !known.every((id) => order.includes(id))) return bad({ order: ['Send every milestone once.'] });
      plan.milestones.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      return { status: 200, body: toPlan(plan) };
    }
    const milestoneMatch = /^milestones\/(\d+)\/$/.exec(rest);
    if (milestoneMatch) {
      const milestone = plan.milestones.find((m) => m.id === Number(milestoneMatch[1]));
      if (!milestone) return NOT_FOUND;
      if (!plan.can_edit) return forbidden;
      if (method === 'DELETE') {
        if (plan.milestones.length === 1) return bad({ non_field_errors: [LAST_MILESTONE] });
        plan.milestones.splice(plan.milestones.indexOf(milestone), 1);
        progressed(plan);
        return { status: 200, body: toPlan(plan) };
      }
      if (method === 'PATCH') {
        if ('name' in data && blank(data.name)) return bad({ name: BLANK });
        if ('name' in data) milestone.name = String(data.name).trim();
        if ('due_date' in data) milestone.due_date = String(data.due_date);
        if (data.done === true) Object.assign(milestone, { done_at: NOW, by_hand: true });
        if (data.done === false) Object.assign(milestone, { done_at: null, by_hand: false });
        progressed(plan);
        return { status: 200, body: toPlan(plan) };
      }
    }
    if (rest === 'tasks/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      const milestone = plan.milestones.find((m) => m.id === Number(data.milestone));
      if (!milestone) return bad({ milestone: ['Choose a milestone.'] });
      if (blank(data.title)) return bad({ title: BLANK });
      const assignee = active(Number(data.assignee));
      if (!assignee || cantOpen(plan.record, assignee.id)) return bad({ assignee: [SAY.CANT_OPEN] });
      milestone.tasks.push(T(nextTask++, String(data.title).trim(), data.priority as Priority, String(data.due_date), assignee));
      return { status: 201, body: toPlan(plan) };
    }
    const taskMatch = /^tasks\/(\d+)\/$/.exec(rest);
    if (taskMatch) {
      const taskId = Number(taskMatch[1]);
      const milestone = milestoneOf(taskId);
      const one = milestone?.tasks.find((candidate) => candidate.id === taskId);
      if (!milestone || !one || !one.visible) return NOT_FOUND;
      if (method === 'DELETE') {
        if (!plan.can_edit) return forbidden;
        milestone.tasks.splice(milestone.tasks.indexOf(one), 1);
        return { status: 200, body: toPlan(plan) };
      }
      if (method === 'PATCH') {
        const onlyStatus = Object.keys(data).every((key) => key === 'status');
        if (!(plan.can_edit || (onlyStatus && one.can_check))) return forbidden;
        if ('title' in data && blank(data.title)) return bad({ title: BLANK });
        if ('assignee' in data) {
          const assignee = active(Number(data.assignee));
          if (!assignee || cantOpen(plan.record, assignee.id)) return bad({ assignee: [SAY.CANT_OPEN] });
          one.assignee = assignee;
        }
        if ('title' in data) one.title = String(data.title).trim();
        if ('priority' in data) one.priority = data.priority as Priority;
        if ('due_date' in data) one.due_date = String(data.due_date);
        if ('status' in data) one.status = data.status as TaskStatus;
        if ('milestone' in data && Number(data.milestone) !== milestone.id) {
          const target = plan.milestones.find((m) => m.id === Number(data.milestone));
          if (!target) return bad({ milestone: ['Choose a milestone.'] });
          milestone.tasks.splice(milestone.tasks.indexOf(one), 1);
          target.tasks.push(one);
          settle(plan, target);
        }
        settle(plan, milestone);
        return { status: 200, body: toPlan(plan) };
      }
    }
    return NOT_FOUND;
  };

  const templateRoute = (one: PlanTemplate, method: string, data: Record<string, unknown>): Answer => {
    if (method === 'GET') return { status: 200, body: one };
    if (one.is_builtin) return { status: 403, body: { detail: "Built-in templates can't be changed." } };
    if (!one.is_owner) return { status: 403, body: { detail: "Only the template's owner can change it." } };
    if (method === 'DELETE') {
      templates.splice(templates.indexOf(one), 1);
      return { status: 204, body: null };
    }
    if ('name' in data && blank(data.name)) return bad({ name: BLANK });
    if ('milestones' in data) {
      const refused = checkMilestones(data.milestones);
      if (refused) return refused;
    }
    const people = 'shared_with' in data ? ((data.shared_with as number[]) ?? []).flatMap((id) => (active(id) ? [active(id)!] : [])) : one.shared_with;
    const sharing = (data.sharing as PlanTemplate['sharing'] | undefined) ?? one.sharing;
    if (sharing === 'people' && people.length === 0) return bad({ shared_with: [CHECK.NO_PEOPLE] });
    const next = withCounts({ ...one, ...(data as Partial<PlanTemplate>), sharing, shared_with: sharing === 'people' ? people : [], updated_at: NOW });
    templates.splice(templates.indexOf(one), 1, next);
    return { status: 200, body: next };
  };

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const data = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (answer: Answer) => json(answer.status, answer.body);

    if (path === '/auth/members/') return json(200, stub.members ?? MEMBERS);
    if (path === '/plans/' && method === 'GET') {
      const override = stub.list?.(url.searchParams);
      if (override) return reply(override);
      const rows = matching(url.searchParams, true);
      const base = matching(url.searchParams, false);
      const startAt = url.searchParams.get('cursor') ? Number(atob(url.searchParams.get('cursor')!)) || 0 : 0;
      const counts = Object.fromEntries(STATUSES.map((status) => [status, base.filter((plan) => plan.status === status).length])) as Record<PlanStatus, number>;
      return json(200, {
        results: rows.slice(startAt, startAt + pageSize).map(toRow),
        next: startAt + pageSize < rows.length ? btoa(String(startAt + pageSize)) : null,
        counts,
      });
    }
    if (path === '/plans/' && method === 'POST') {
      const override = await stub.start?.(data);
      return reply(override ?? start(data));
    }
    if (path === '/plans/templates/' && method === 'GET') return json(200, templateLists());
    if (path === '/plans/templates/' && method === 'POST') {
      if (blank(data.name)) return reply(bad({ name: BLANK }));
      const refused = checkMilestones(data.milestones);
      if (refused) return reply(refused);
      const people = ((data.shared_with as number[] | undefined) ?? []).flatMap((id) => (active(id) ? [active(id)!] : []));
      if (data.sharing === 'people' && people.length === 0) return reply(bad({ shared_with: [CHECK.NO_PEOPLE] }));
      if (templates.filter((one) => one.is_owner).length >= 50) return reply(bad({ non_field_errors: ['You can own at most 50 templates.'] }));
      const made = withCounts({
        id: nextTemplate++,
        name: String(data.name).trim(),
        kind: data.kind as PlanKind,
        description: String(data.description ?? ''),
        is_builtin: false,
        is_owner: true,
        owner: ME,
        sharing: data.sharing as PlanTemplate['sharing'],
        shared_with: data.sharing === 'people' ? people : [],
        milestones: data.milestones as TemplateMilestone[],
        updated_at: NOW,
      });
      templates.push(made);
      return json(201, made);
    }
    const templateMatch = /^\/plans\/templates\/(\d+)\/$/.exec(path);
    if (templateMatch) {
      const one = templates.find((candidate) => candidate.id === Number(templateMatch[1]));
      if (!one || !readableTemplate(one)) return reply(NOT_FOUND);
      return reply(templateRoute(one, method, data));
    }
    const recordPlans = /^\/(customers|accounts)\/(\d+)\/plans\/$/.exec(path);
    if (recordPlans && method === 'GET') {
      const kind: RecordKind = recordPlans[1] === 'customers' ? 'organization' : 'account';
      const id = Number(recordPlans[2]);
      const override = stub.recordPlans?.(kind, id);
      if (override) return reply(override);
      if (!RECORDS.some((one) => one.kind === kind && one.id === id)) return reply(NOT_FOUND);
      const rows = readable()
        .filter((plan) => plan.record.kind === kind && plan.record.id === id)
        .sort((a, b) => Number(isOpen(b.status)) - Number(isOpen(a.status)) || b.id - a.id)
        .map(toRow);
      return json(200, { results: rows });
    }
    const recordRead = /^\/(customers|accounts)\/(\d+)\/$/.exec(path);
    if (recordRead && method === 'GET') {
      const kind: RecordKind = recordRead[1] === 'customers' ? 'organization' : 'account';
      const found = RECORDS.find((one) => one.kind === kind && one.id === Number(recordRead[2]));
      return found ? json(200, { id: found.id, name: found.name, owner: found.owner }) : reply(NOT_FOUND);
    }
    const planMatch = /^\/plans\/(\d+)\/(.*)$/.exec(path);
    if (planMatch) {
      const plan = plans.find((candidate) => candidate.id === Number(planMatch[1]));
      // A plan on a record the reader can't open reads as missing, on every sub-path.
      if (!plan || !plan.readable) return reply(NOT_FOUND);
      return reply(planRoute(plan, planMatch[2], method, data));
    }
    return rules.spy(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return { spy, runNight: rules.runNight, plansOf: () => plans };
}

export type PlansSpy = ReturnType<typeof stubPlans>['spy'];
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/features/plans/planApi.test.ts`
Expected: PASS (14 tests). If a figure differs, fix the stub, never the expectation: the expectations are the contract and the fixtures above.

- [ ] **Step 7: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/features/plans/planApi.ts src/features/plans/testTemplates.ts src/features/plans/testPlans.ts src/features/plans/planApi.test.ts
git add src/features/plans/planApi.ts src/features/plans/testTemplates.ts src/features/plans/testPlans.ts src/features/plans/planApi.test.ts
git commit -m "feat(plans): the API and the contract stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The drafts, their checks, and refusals at their fields

Spec §2.2 (Review: name default, owner, start date, computed due dates, assignee roles resolved, edits before starting), §2.4 (template editor fields and limits), §4 "Refusals"; Contract notes 9–11, 13.

**Files:**
- Create: `src/features/plans/planErrors.ts`, `src/features/plans/planDraft.ts`, `src/features/plans/templateDraft.ts`
- Test: `src/features/plans/planErrors.test.ts`, `src/features/plans/planDraft.test.ts`, `src/features/plans/templateDraft.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `CHECK`, `MILESTONES_MAX`, `TASKS_MAX`, `NAME_MAX`, `OFFSET_MAX`, `addDays`, `daysBetween`, `defaultPlanName`; `ApiError`; Task 2's `ONBOARDING`, `MINE_TEMPLATE`.
- Produces:
  - `planErrors.ts`: `NestedErrors { field: Record<string, string>; tasks: Record<string, string>[] }`, `PlanErrors { form?: string; field: Record<string, string>; milestones: NestedErrors[] }`, `NO_ERRORS`, `hasErrors(e)`, `planErrors(err, fields, fallback)`, `firstError(e)`, `isPlanOpen(err)`.
  - `planDraft.ts`: `DraftTask { key; title; priority; due_date; role: AssigneeRole | null; assignee: number | null }`, `DraftMilestone { key; name; due_date; tasks }`, `StartDraft { name; owner; start_date; milestones }`, `startDraft(template, record, owner, start)`, `withStart(draft, start)`, `assigneeOf(task, owner, recordOwner)`, `newTask(milestone)`, `taskCount(draft)`, `toStart(draft, templateId, record, recordOwner)`, `checkStart(draft)`.
  - `templateDraft.ts`: `TemplateTaskDraft`, `TemplateMilestoneDraft`, `TemplateDraft`, `emptyTemplateDraft()`, `templateDraftOf(template)`, `newTemplateMilestone()`, `newTemplateTask()`, `templateCounts(draft)`, `toTemplateWrite(draft)`, `checkTemplate(draft)`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/plans/planErrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { firstError, hasErrors, isPlanOpen, NO_ERRORS, planErrors } from './planErrors';

const refused = (status: number, body: unknown) => new ApiError(status, body, 'Request failed');
const FIELDS = ['name', 'owner', 'start_date', 'milestones'];

describe('planErrors (spec §4 "Refusals")', () => {
  it('puts a field refusal at its field and an unknown key on the form', () => {
    expect(planErrors(refused(400, { owner: ["They can't open this record."], colour: ['No.'] }), FIELDS, 'Could not.')).toEqual({
      form: 'No.',
      field: { owner: "They can't open this record." },
      milestones: [],
    });
  });

  it('aligns nested milestone and task refusals with what was sent', () => {
    const body = { milestones: [{}, { name: ['This field may not be blank.'], tasks: [{}, { assignee: ["They can't open this record."] }] }] };
    expect(planErrors(refused(400, body), FIELDS, 'Could not.').milestones).toEqual([
      { field: {}, tasks: [] },
      { field: { name: 'This field may not be blank.' }, tasks: [{}, { assignee: "They can't open this record." }] },
    ]);
  });

  it('reads a message for the whole list of milestones as a field', () => {
    expect(planErrors(refused(400, { milestones: ['A plan holds at most 12 milestones.'] }), FIELDS, 'Could not.').field).toEqual({
      milestones: 'A plan holds at most 12 milestones.',
    });
  });

  it('puts detail and non_field_errors on the form, and falls back for anything else', () => {
    expect(planErrors(refused(403, { detail: "Only the plan's owner or their managers can change it." }), FIELDS, 'Could not.').form).toBe(
      "Only the plan's owner or their managers can change it.",
    );
    expect(planErrors(refused(400, { non_field_errors: ['You can own at most 50 templates.'] }), FIELDS, 'Could not.').form).toBe('You can own at most 50 templates.');
    expect(planErrors(new Error('offline'), FIELDS, 'Could not.')).toEqual({ form: 'Could not.', field: {}, milestones: [] });
    expect(planErrors(refused(404, { detail: 'Not found.' }), FIELDS, 'Could not.').form).toBe('It is no longer there, or you can no longer open it.');
  });

  it('says whether anything was refused, and its first message', () => {
    expect(hasErrors(NO_ERRORS)).toBe(false);
    expect(hasErrors({ field: {}, milestones: [{ field: {}, tasks: [{ title: 'Give the task a title.' }] }] })).toBe(true);
    expect(firstError({ field: {}, milestones: [{ field: {}, tasks: [{ title: 'Give the task a title.' }] }] })).toBe('Give the task a title.');
    expect(firstError({ form: 'No.', field: { name: 'Later.' }, milestones: [] })).toBe('No.');
  });

  it('knows a PLAN_OPEN conflict', () => {
    expect(isPlanOpen(refused(409, { code: 'PLAN_OPEN', plan_id: 41, detail: 'x' }))).toBe(true);
    expect(isPlanOpen(refused(409, { code: 'PLAN_HAS_DONE_WORK', detail: 'x' }))).toBe(false);
    expect(isPlanOpen(new Error('x'))).toBe(false);
  });
});
```

Create `src/features/plans/planDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assigneeOf, checkStart, newTask, startDraft, taskCount, toStart, withStart, type StartDraft } from './planDraft';
import { ONBOARDING } from './testTemplates';

const INITECH = { kind: 'organization' as const, id: 2, name: 'Initech' };
const draft = (): StartDraft => startDraft(ONBOARDING, INITECH, 1, '2026-10-04');

describe('the New plan draft (spec §2.2)', () => {
  it('copies the template: the default name, due dates from the start, roles to resolve', () => {
    const made = draft();
    expect(made.name).toBe('Onboarding · Initech');
    expect(made.owner).toBe(1);
    expect(made.start_date).toBe('2026-10-04');
    expect(made.milestones.map((m) => [m.name, m.due_date])).toEqual([
      ['Kick-off', '2026-10-04'],
      ['Set up', '2026-10-18'],
      ['First value', '2026-11-03'],
      ['Hand-off', '2026-12-03'],
    ]);
    expect(made.milestones[0].tasks.map((task) => [task.title, task.due_date, task.role, task.assignee])).toEqual([
      ['Hold the kick-off call', '2026-10-04', 'record_owner', null],
      ['Confirm goals and success criteria', '2026-10-07', 'record_owner', null],
    ]);
    expect(made.milestones[3].tasks[1].role).toBe('plan_owner');
    expect(taskCount(made)).toBe(7);
  });

  it("resolves a role to the record's owner or the plan's owner; a hand-picked person wins", () => {
    const [first] = draft().milestones[0].tasks;
    expect(assigneeOf(first, 1, 4)).toBe(4);
    expect(assigneeOf(first, 1, null)).toBe(1);
    expect(assigneeOf({ ...first, role: 'plan_owner' }, 1, 4)).toBe(1);
    expect(assigneeOf({ ...first, role: null, assignee: 5 }, 1, 4)).toBe(5);
  });

  it('moves every date by the same days when the start date changes', () => {
    const moved = withStart({ ...draft(), milestones: draft().milestones.map((m, i) => (i === 1 ? { ...m, due_date: '2026-10-20' } : m)) }, '2026-10-06');
    expect(moved.start_date).toBe('2026-10-06');
    expect(moved.milestones.map((m) => m.due_date)).toEqual(['2026-10-06', '2026-10-22', '2026-11-05', '2026-12-05']);
    expect(moved.milestones[0].tasks[1].due_date).toBe('2026-10-09');
    expect(withStart(draft(), '').milestones[0].due_date).toBe('2026-10-04');
  });

  it("adds a task due with its milestone, for the plan's owner", () => {
    const milestone = draft().milestones[2];
    expect(newTask(milestone)).toMatchObject({ title: '', priority: 'medium', due_date: '2026-11-03', role: 'plan_owner', assignee: null });
  });

  it('builds the POST body: the record by kind, trimmed words, assignees resolved', () => {
    const made = draft();
    made.name = '  Onboarding · Initech  ';
    made.milestones = made.milestones.slice(0, 1);
    expect(toStart(made, 1, INITECH, 4)).toEqual({
      template: 1,
      customer: 2,
      name: 'Onboarding · Initech',
      owner: 1,
      start_date: '2026-10-04',
      milestones: [
        {
          name: 'Kick-off',
          due_date: '2026-10-04',
          tasks: [
            { title: 'Hold the kick-off call', priority: 'high', due_date: '2026-10-04', assignee: 4 },
            { title: 'Confirm goals and success criteria', priority: 'high', due_date: '2026-10-07', assignee: 4 },
          ],
        },
      ],
    });
    expect(toStart(made, 1, { kind: 'account', id: 14, name: 'Initech APAC' }, null)).toMatchObject({ account: 14, milestones: [{ tasks: [{ assignee: 1 }, { assignee: 1 }] }] });
  });

  it('checks before asking, in its own words, at each field', () => {
    const made = draft();
    made.name = ' ';
    made.start_date = '';
    made.milestones[1].name = '';
    made.milestones[2].tasks[0].title = ' ';
    made.milestones[3].due_date = '';
    const found = checkStart(made);
    expect(found.field).toEqual({ name: 'Give the plan a name.', start_date: 'Choose a date.' });
    expect(found.milestones[1].field).toEqual({ name: 'Give the milestone a name.' });
    expect(found.milestones[2].tasks[0]).toEqual({ title: 'Give the task a title.' });
    expect(found.milestones[3].field).toEqual({ due_date: 'Choose a date.' });
    expect(checkStart({ ...draft(), milestones: [] }).field).toEqual({ milestones: 'Add at least one milestone.' });
    const crowded = draft();
    crowded.milestones[0].tasks = Array.from({ length: 50 }, () => newTask(crowded.milestones[0]));
    crowded.milestones[0].tasks.forEach((task) => (task.title = 'Call'));
    expect(checkStart(crowded).field).toEqual({ milestones: 'A plan holds at most 50 tasks.' });
  });
});
```

Create `src/features/plans/templateDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkTemplate, emptyTemplateDraft, newTemplateMilestone, newTemplateTask, templateCounts, templateDraftOf, toTemplateWrite } from './templateDraft';
import { MINE_TEMPLATE, SHARED_TEMPLATE } from './testTemplates';

describe('the template editor draft (spec §2.4)', () => {
  it('starts with one empty milestone on day 0, private, kind Other', () => {
    const draft = emptyTemplateDraft();
    expect(draft).toMatchObject({ name: '', kind: 'other', description: '', sharing: 'private', sharedWith: [] });
    expect(draft.milestones).toHaveLength(1);
    expect(draft.milestones[0]).toMatchObject({ name: '', offset: '0', tasks: [] });
  });

  it('round-trips a template into its write body', () => {
    expect(toTemplateWrite(templateDraftOf(MINE_TEMPLATE))).toEqual({
      name: 'Renewal prep',
      kind: 'other',
      description: 'What I do before every renewal.',
      milestones: MINE_TEMPLATE.milestones,
      sharing: 'private',
      shared_with: [],
    });
    expect(toTemplateWrite(templateDraftOf(SHARED_TEMPLATE)).shared_with).toEqual([1]);
  });

  it('adds blank milestones and tasks and counts them', () => {
    const draft = emptyTemplateDraft();
    draft.milestones.push(newTemplateMilestone(30));
    draft.milestones[0].tasks.push(newTemplateTask(), newTemplateTask());
    expect(draft.milestones[1]).toMatchObject({ offset: '30', tasks: [] });
    expect(draft.milestones[0].tasks[0]).toMatchObject({ title: '', priority: 'medium', offset: '0', role: 'record_owner' });
    expect(templateCounts(draft)).toEqual({ milestones: 2, tasks: 2 });
  });

  it('checks names, offsets, limits and sharing before asking', () => {
    const draft = emptyTemplateDraft();
    draft.milestones[0].offset = '400';
    draft.milestones[0].tasks.push({ ...newTemplateTask(), title: '', offset: '-1' });
    draft.sharing = 'people';
    const found = checkTemplate(draft);
    expect(found.field).toEqual({ name: 'Give the template a name.', shared_with: 'Choose at least one teammate.' });
    expect(found.milestones[0].field).toEqual({ name: 'Give the milestone a name.', offset_days: 'Choose 0 to 365 days.' });
    expect(found.milestones[0].tasks[0]).toEqual({ title: 'Give the task a title.', offset_days: 'Choose 0 to 365 days.' });
    const many = { ...emptyTemplateDraft(), name: 'Big', milestones: Array.from({ length: 13 }, () => ({ ...newTemplateMilestone(0), name: 'Step' })) };
    expect(checkTemplate(many).field).toEqual({ milestones: 'A plan holds at most 12 milestones.' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/plans/planErrors.test.ts src/features/plans/planDraft.test.ts src/features/plans/templateDraft.test.ts`
Expected: FAIL, "Failed to resolve import "./planErrors"" (and the other two).

- [ ] **Step 3: Write the refusals**

Create `src/features/plans/planErrors.ts`:

```ts
// A refusal, put where its keys point (spec §4 "Refusals"; Contract note
// 11): `detail` and `non_field_errors` on the form; `milestones` as a list
// aligned with the milestones sent, each with its `tasks`; a message for
// the whole list on the `milestones` field. Keys outside `fields` go to the
// form. A client check builds the same shape.
import { ApiError } from '../../lib/apiClient';
import type { PlanOpenBody } from './planTypes';

export interface NestedErrors {
  field: Record<string, string>;
  tasks: Record<string, string>[];
}

export interface PlanErrors {
  form?: string;
  field: Record<string, string>;
  milestones: NestedErrors[];
}

export const NO_ERRORS: PlanErrors = { field: {}, milestones: [] };
const GONE = 'It is no longer there, or you can no longer open it.';

const first = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const flat = (value: unknown): Record<string, string> =>
  isObject(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([key, messages]) => {
          const message = first(messages);
          return message ? [[key, message]] : [];
        }),
      )
    : {};

export function hasErrors(errors: PlanErrors): boolean {
  return (
    Boolean(errors.form) ||
    Object.keys(errors.field).length > 0 ||
    errors.milestones.some((one) => Object.keys(one.field).length > 0 || one.tasks.some((task) => Object.keys(task).length > 0))
  );
}

export function planErrors(err: unknown, fields: readonly string[], fallback: string): PlanErrors {
  if (!(err instanceof ApiError)) return { form: fallback, field: {}, milestones: [] };
  if (err.status === 404) return { form: GONE, field: {}, milestones: [] };
  const out: PlanErrors = { field: {}, milestones: [] };
  const body = err.body;
  if (isObject(body)) {
    for (const [key, value] of Object.entries(body)) {
      if (key === 'detail' && typeof value === 'string') {
        out.form = value;
        continue;
      }
      if (key === 'non_field_errors') {
        out.form ??= first(value) ?? undefined;
        continue;
      }
      if (key === 'milestones' && Array.isArray(value) && value.some(isObject)) {
        out.milestones = value.map((item) => {
          const own = isObject(item) ? item : {};
          const { tasks, ...rest } = own;
          return { field: flat(rest), tasks: Array.isArray(tasks) ? tasks.map(flat) : [] };
        });
        continue;
      }
      const message = first(value);
      if (!message) continue;
      if (fields.includes(key)) out.field[key] = message;
      else out.form ??= message;
    }
  }
  return hasErrors(out) ? out : { form: fallback, field: {}, milestones: [] };
}

/** One line, for a place with no fields (a checkbox, a confirm dialog). */
export function firstError(errors: PlanErrors): string {
  return (
    errors.form ??
    Object.values(errors.field)[0] ??
    errors.milestones.flatMap((one) => [...Object.values(one.field), ...one.tasks.flatMap((task) => Object.values(task))])[0] ??
    'Something went wrong.'
  );
}

/** 409 `{code: 'PLAN_OPEN', plan_id, detail}` on POST plans/. */
export function isPlanOpen(err: unknown): err is ApiError & { body: PlanOpenBody } {
  return err instanceof ApiError && err.status === 409 && isObject(err.body) && err.body.code === 'PLAN_OPEN' && typeof err.body.plan_id === 'number';
}
```

- [ ] **Step 4: Write the New plan draft**

Create `src/features/plans/planDraft.ts`:

```ts
// The New plan modal's review (spec §2.2) as plain data: copied from a
// template, its dates computed from the start date, each task's role
// resolved to a person, checked before it is sent.
import type { NestedErrors, PlanErrors } from './planErrors';
import { CHECK, MILESTONES_MAX, TASKS_MAX } from './planOptions';
import { addDays, daysBetween, defaultPlanName } from './planText';
import type { AssigneeRole, PlanStart, PlanTemplate, Priority, RecordRef } from './planTypes';

export interface DraftTask {
  key: string;
  title: string;
  priority: Priority;
  due_date: string;
  /** The template's role; null once a person is picked by hand. */
  role: AssigneeRole | null;
  /** A hand-picked person, else null (the role decides). */
  assignee: number | null;
}

export interface DraftMilestone {
  key: string;
  name: string;
  due_date: string;
  tasks: DraftTask[];
}

export interface StartDraft {
  name: string;
  owner: number;
  start_date: string;
  milestones: DraftMilestone[];
}

let sequence = 0;
const key = (prefix: string) => `${prefix}${++sequence}`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function startDraft(template: PlanTemplate, record: RecordRef, owner: number, start: string): StartDraft {
  return {
    name: defaultPlanName(template.name, record.name),
    owner,
    start_date: start,
    milestones: template.milestones.map((milestone) => ({
      key: key('m'),
      name: milestone.name,
      due_date: addDays(start, milestone.offset_days),
      tasks: milestone.tasks.map((task) => ({
        key: key('t'),
        title: task.title,
        priority: task.priority,
        due_date: addDays(start, task.offset_days),
        role: task.assignee_role,
        assignee: null,
      })),
    })),
  };
}

/** A new start date moves every date by the same days, so a date changed
 *  by hand keeps its place relative to the rest. A half-typed date moves
 *  nothing. */
export function withStart(draft: StartDraft, start: string): StartDraft {
  if (!DATE.test(start) || !DATE.test(draft.start_date)) return { ...draft, start_date: start };
  const shift = daysBetween(draft.start_date, start);
  const move = (iso: string) => (DATE.test(iso) ? addDays(iso, shift) : iso);
  return {
    ...draft,
    start_date: start,
    milestones: draft.milestones.map((milestone) => ({
      ...milestone,
      due_date: move(milestone.due_date),
      tasks: milestone.tasks.map((task) => ({ ...task, due_date: move(task.due_date) })),
    })),
  };
}

/** A hand-picked person; else the record's owner for `record_owner` (when
 *  there is an active one); else the plan's owner. */
export function assigneeOf(task: DraftTask, owner: number, recordOwner: number | null): number {
  if (task.assignee !== null) return task.assignee;
  if (task.role === 'record_owner' && recordOwner !== null) return recordOwner;
  return owner;
}

export function newTask(milestone: DraftMilestone): DraftTask {
  return { key: key('t'), title: '', priority: 'medium', due_date: milestone.due_date, role: 'plan_owner', assignee: null };
}

export function taskCount(draft: StartDraft): number {
  return draft.milestones.reduce((n, milestone) => n + milestone.tasks.length, 0);
}

/** POST plans/ (spec §4; Contract note 10). */
export function toStart(draft: StartDraft, templateId: number, record: RecordRef, recordOwner: number | null): PlanStart {
  return {
    template: templateId,
    ...(record.kind === 'organization' ? { customer: record.id } : { account: record.id }),
    name: draft.name.trim(),
    owner: draft.owner,
    start_date: draft.start_date,
    milestones: draft.milestones.map((milestone) => ({
      name: milestone.name.trim(),
      due_date: milestone.due_date,
      tasks: milestone.tasks.map((task) => ({
        title: task.title.trim(),
        priority: task.priority,
        due_date: task.due_date,
        assignee: assigneeOf(task, draft.owner, recordOwner),
      })),
    })),
  };
}

/** What the server would refuse, said first, at the same places. */
export function checkStart(draft: StartDraft): PlanErrors {
  const field: Record<string, string> = {};
  if (!draft.name.trim()) field.name = CHECK.PLAN_NAME;
  if (!DATE.test(draft.start_date)) field.start_date = CHECK.DATE;
  if (draft.milestones.length === 0) field.milestones = CHECK.NO_MILESTONES;
  else if (draft.milestones.length > MILESTONES_MAX) field.milestones = CHECK.TOO_MANY_MILESTONES;
  else if (taskCount(draft) > TASKS_MAX) field.milestones = CHECK.TOO_MANY_TASKS;
  const milestones: NestedErrors[] = draft.milestones.map((milestone) => {
    const own: Record<string, string> = {};
    if (!milestone.name.trim()) own.name = CHECK.MILESTONE_NAME;
    if (!DATE.test(milestone.due_date)) own.due_date = CHECK.DATE;
    const tasks = milestone.tasks.map((task) => {
      const one: Record<string, string> = {};
      if (!task.title.trim()) one.title = CHECK.TASK_TITLE;
      if (!DATE.test(task.due_date)) one.due_date = CHECK.DATE;
      return one;
    });
    return { field: own, tasks };
  });
  return { field, milestones };
}
```

- [ ] **Step 5: Write the template draft**

Create `src/features/plans/templateDraft.ts`:

```ts
// The template editor (spec §2.4) as plain data. Offsets are kept as typed
// so a half-typed number is the person's to finish.
import type { NestedErrors, PlanErrors } from './planErrors';
import { CHECK, MILESTONES_MAX, OFFSET_MAX, TASKS_MAX } from './planOptions';
import type { AssigneeRole, PersonRef, PlanKind, PlanTemplate, Priority, Sharing, TemplateWrite } from './planTypes';

export interface TemplateTaskDraft {
  key: string;
  title: string;
  priority: Priority;
  offset: string;
  role: AssigneeRole;
}

export interface TemplateMilestoneDraft {
  key: string;
  name: string;
  offset: string;
  tasks: TemplateTaskDraft[];
}

export interface TemplateDraft {
  name: string;
  kind: PlanKind;
  description: string;
  milestones: TemplateMilestoneDraft[];
  sharing: Sharing;
  sharedWith: PersonRef[];
}

let sequence = 0;
const key = (prefix: string) => `${prefix}${++sequence}`;

export function newTemplateMilestone(offset = 0): TemplateMilestoneDraft {
  return { key: key('tm'), name: '', offset: String(offset), tasks: [] };
}

export function newTemplateTask(offset = 0): TemplateTaskDraft {
  return { key: key('tt'), title: '', priority: 'medium', offset: String(offset), role: 'record_owner' };
}

export function emptyTemplateDraft(): TemplateDraft {
  return { name: '', kind: 'other', description: '', milestones: [newTemplateMilestone(0)], sharing: 'private', sharedWith: [] };
}

export function templateDraftOf(template: PlanTemplate): TemplateDraft {
  return {
    name: template.name,
    kind: template.kind,
    description: template.description,
    milestones: template.milestones.map((milestone) => ({
      key: key('tm'),
      name: milestone.name,
      offset: String(milestone.offset_days),
      tasks: milestone.tasks.map((task) => ({ key: key('tt'), title: task.title, priority: task.priority, offset: String(task.offset_days), role: task.assignee_role })),
    })),
    sharing: template.sharing,
    sharedWith: template.shared_with,
  };
}

export function templateCounts(draft: TemplateDraft): { milestones: number; tasks: number } {
  return { milestones: draft.milestones.length, tasks: draft.milestones.reduce((n, milestone) => n + milestone.tasks.length, 0) };
}

export function toTemplateWrite(draft: TemplateDraft): TemplateWrite {
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    description: draft.description.trim(),
    milestones: draft.milestones.map((milestone) => ({
      name: milestone.name.trim(),
      offset_days: Number(milestone.offset),
      tasks: milestone.tasks.map((task) => ({ title: task.title.trim(), priority: task.priority, offset_days: Number(task.offset), assignee_role: task.role })),
    })),
    sharing: draft.sharing,
    shared_with: draft.sharing === 'people' ? draft.sharedWith.map((person) => person.id) : [],
  };
}

const offsetBad = (typed: string) => {
  const value = Number(typed);
  return typed.trim() === '' || !Number.isInteger(value) || value < 0 || value > OFFSET_MAX;
};

export function checkTemplate(draft: TemplateDraft): PlanErrors {
  const field: Record<string, string> = {};
  const counts = templateCounts(draft);
  if (!draft.name.trim()) field.name = CHECK.TEMPLATE_NAME;
  if (counts.milestones === 0) field.milestones = CHECK.NO_MILESTONES;
  else if (counts.milestones > MILESTONES_MAX) field.milestones = CHECK.TOO_MANY_MILESTONES;
  else if (counts.tasks > TASKS_MAX) field.milestones = CHECK.TOO_MANY_TASKS;
  if (draft.sharing === 'people' && draft.sharedWith.length === 0) field.shared_with = CHECK.NO_PEOPLE;
  const milestones: NestedErrors[] = draft.milestones.map((milestone) => {
    const own: Record<string, string> = {};
    if (!milestone.name.trim()) own.name = CHECK.MILESTONE_NAME;
    if (offsetBad(milestone.offset)) own.offset_days = CHECK.OFFSET;
    const tasks = milestone.tasks.map((task) => {
      const one: Record<string, string> = {};
      if (!task.title.trim()) one.title = CHECK.TASK_TITLE;
      if (offsetBad(task.offset)) one.offset_days = CHECK.OFFSET;
      return one;
    });
    return { field: own, tasks };
  });
  return { field, milestones };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/plans/planErrors.test.ts src/features/plans/planDraft.test.ts src/features/plans/templateDraft.test.ts`
Expected: PASS (6 + 6 + 4 tests).

- [ ] **Step 7: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/features/plans/planErrors.ts src/features/plans/planDraft.ts src/features/plans/templateDraft.ts src/features/plans/planErrors.test.ts src/features/plans/planDraft.test.ts src/features/plans/templateDraft.test.ts
git add src/features/plans/planErrors.ts src/features/plans/planDraft.ts src/features/plans/templateDraft.ts src/features/plans/planErrors.test.ts src/features/plans/planDraft.test.ts src/features/plans/templateDraft.test.ts
git commit -m "feat(plans): the New plan and template drafts, their checks, refusals at fields

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The row parts, the plan row, and submit-once

Spec §2.1 (a row: name; record as a link with an organisation or account icon; kind chip; owner's avatar and name; milestone progress bar with `3/5` in mono; next due in mono, danger with "Overdue" when past; status pill), §2.6 (no colour-only meaning); Decisions 12, 14, 17.

**Files:**
- Create: `src/components/plans/parts.tsx`, `src/components/plans/PlanRowItem.tsx`, `src/components/plans/useSubmitOnce.ts`
- Test: `src/components/plans/parts.test.tsx`

**Interfaces:**
- Consumes: Task 1's `STATUS_LABEL`, `KIND_LABEL`, `progress`, `recordHref`, `shortDay`, types; `FOCUS`, `MONO` (`components/organizations/portfolio/styles`).
- Produces:
  - `parts.tsx`: `StatusPill({ status })` (`data-status`), `KindChip({ kind })`, `ProgressBar({ done, total, label })`, `RecordIcon({ kind })`, `RecordLink({ record })`, `OwnerName({ person })`, `NextDue({ date, overdue })`.
  - `PlanRowItem({ row, showRecord = true, flat = false })`: an `<li data-plan={id}>`; `flat` drops its own surface for use inside a section that has one.
  - `useSubmitOnce(): { busy: boolean; run<T>(work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> }` (`null` when a call was already running).

- [ ] **Step 1: Write the failing test**

Create `src/components/plans/parts.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { act, render, renderHook, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PlanRow } from '../../features/plans/planTypes';
import { NextDue, ProgressBar, StatusPill } from './parts';
import { PlanRowItem } from './PlanRowItem';
import { useSubmitOnce } from './useSubmitOnce';

const ROW: PlanRow = {
  id: 42, name: 'Save plan · Initech APAC', kind: 'save', status: 'at_risk', record: { kind: 'account', id: 14, name: 'Initech APAC' },
  owner: { id: 5, name: 'Dana CSM' }, start_date: '2026-09-01', target_date: '2026-10-01', milestones_done: 1, milestones_total: 3,
  tasks_done: 1, tasks_total: 3, next_due: '2026-09-15', is_overdue: true, can_edit: false,
};

describe('plan row parts', () => {
  it('shows a status as a word and an icon, not a colour alone', () => {
    const { container } = render(<StatusPill status="at_risk" />);
    const pill = container.querySelector('[data-status="at_risk"]') as HTMLElement;
    expect(pill).toHaveTextContent('At risk');
    expect(pill.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(pill).toHaveClass('text-warning');
  });

  it('reads progress as figures in DM Mono, with words for screen readers', () => {
    const { container } = render(<ProgressBar done={3} total={5} label="milestones" />);
    expect(container.querySelector('.font-mono-brand')).toHaveTextContent('3/5');
    expect(container).toHaveTextContent('3/5 milestones done');
  });

  it('marks an overdue date with the word, an icon and the danger colour', () => {
    const { container, rerender } = render(<NextDue date="2026-09-15" overdue />);
    const due = container.firstElementChild as HTMLElement;
    expect(due).toHaveTextContent('Overdue · 15 Sep');
    expect(due).toHaveClass('text-danger');
    expect(due.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(due.querySelector('.font-mono-brand')).toHaveTextContent('15 Sep');
    rerender(<NextDue date="2026-10-20" overdue={false} />);
    expect(container.firstElementChild).toHaveTextContent('Next 20 Oct');
    rerender(<NextDue date={null} overdue={false} />);
    expect(container.firstElementChild).toHaveTextContent('Nothing left to do');
  });

  it('lays a plan out as one row: its page, its record, kind, owner, progress, due and status', () => {
    render(
      <MemoryRouter>
        <ul>
          <PlanRowItem row={ROW} />
        </ul>
      </MemoryRouter>,
    );
    const row = document.querySelector('[data-plan="42"]') as HTMLElement;
    expect(within(row).getByRole('link', { name: 'Save plan · Initech APAC' })).toHaveAttribute('href', '/projects/42');
    expect(within(row).getByRole('link', { name: 'Initech APAC' })).toHaveAttribute('href', '/accounts/14');
    expect(row).toHaveTextContent('Save');
    expect(row).toHaveTextContent('Dana CSM');
    expect(row).toHaveTextContent('1/3');
    expect(row).toHaveTextContent('Overdue');
    expect(row.querySelector('[data-status="at_risk"]')).not.toBeNull();
    expect(row).toHaveClass('rounded-xl', 'bg-surface');
  });

  it('leaves the record out, and its own surface, when asked', () => {
    render(
      <MemoryRouter>
        <ul>
          <PlanRowItem row={ROW} showRecord={false} flat />
        </ul>
      </MemoryRouter>,
    );
    const row = document.querySelector('[data-plan="42"]') as HTMLElement;
    expect(within(row).queryByRole('link', { name: 'Initech APAC' })).toBeNull();
    expect(row).not.toHaveClass('bg-surface');
  });
});

describe('useSubmitOnce', () => {
  it('runs one write however often it is asked for while it runs', async () => {
    let calls = 0;
    let finish: (value: string) => void = () => {};
    const work = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    };
    const { result } = renderHook(() => useSubmitOnce());
    let first: Promise<unknown> = Promise.resolve();
    let second: unknown;
    await act(async () => {
      first = result.current.run(work);
      second = await result.current.run(work);
    });
    expect(second).toBeNull();
    expect(calls).toBe(1);
    expect(result.current.busy).toBe(true);
    await act(async () => {
      finish('done');
      await first;
    });
    expect(await first).toEqual({ ok: true, value: 'done' });
    expect(result.current.busy).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/plans/parts.test.tsx`
Expected: FAIL, "Failed to resolve import "./parts"".

- [ ] **Step 3: Write the parts**

Create `src/components/plans/parts.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Layers, Network, XCircle, type LucideIcon } from 'lucide-react';
import { KIND_LABEL, STATUS_LABEL } from '../../features/plans/planOptions';
import { progress, recordHref, shortDay } from '../../features/plans/planText';
import type { PersonRef, PlanKind, PlanStatus, RecordKind, RecordRef } from '../../features/plans/planTypes';
import { FOCUS, MONO } from '../organizations/portfolio/styles';

const STATUS_ICON: Record<PlanStatus, LucideIcon> = {
  not_started: Circle,
  on_track: CircleDot,
  at_risk: AlertTriangle,
  done: CheckCircle2,
  cancelled: XCircle,
};
/** Semantic tints for status only (house rule §4.2). */
const STATUS_TONE: Record<PlanStatus, string> = {
  not_started: 'bg-subtle text-ink-muted',
  on_track: 'bg-success-dim text-success',
  at_risk: 'bg-warning-dim text-warning',
  done: 'bg-subtle text-ink',
  cancelled: 'bg-subtle text-ink-muted',
};

/** The status as a word and an icon, tinted; never colour alone. */
export function StatusPill({ status }: { status: PlanStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span data-status={status} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status]}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function KindChip({ kind }: { kind: PlanKind }) {
  return <span className="inline-flex shrink-0 items-center rounded-full bg-subtle px-2 py-0.5 text-[11px] font-semibold text-ink-muted">{KIND_LABEL[kind]}</span>;
}

/** A bar for the eye and "3/5" in DM Mono; the bar is hidden from screen
 *  readers, which read "3/5 milestones done". */
export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </span>
      <span className="text-[11px] text-ink-muted">
        <span className={MONO}>{progress(done, total)}</span>
        <span className="sr-only"> {label} done</span>
      </span>
    </span>
  );
}

export function RecordIcon({ kind }: { kind: RecordKind }) {
  const Icon = kind === 'organization' ? Network : Layers;
  return <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />;
}

/** The record, with its kind's icon (the sidebar's), as a link to its page. */
export function RecordLink({ record }: { record: RecordRef }) {
  return (
    <Link to={recordHref(record)} className={`inline-flex min-h-11 min-w-0 items-center gap-1 rounded-sm text-[13px] text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
      <RecordIcon kind={record.kind} />
      <span className="truncate">{record.name}</span>
    </Link>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');

/** The owner's initials in a circle, then their name. */
export function OwnerName({ person }: { person: PersonRef }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ink-muted">
      <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-subtle text-[11px] font-semibold text-ink-muted">
        {initials(person.name)}
      </span>
      <span className="truncate">{person.name}</span>
    </span>
  );
}

/** The next due date in DM Mono; past, it reads "Overdue" with an icon in
 *  the danger colour (spec §2.1). */
export function NextDue({ date, overdue }: { date: string | null; overdue: boolean }) {
  if (!date) return <span className="shrink-0 text-[11px] text-ink-muted">Nothing left to do</span>;
  if (overdue) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-danger">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Overdue · <span className={MONO}>{shortDay(date)}</span>
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[11px] text-ink-muted">
      Next <span className={MONO}>{shortDay(date)}</span>
    </span>
  );
}
```

- [ ] **Step 4: Write the row and the hook**

Create `src/components/plans/PlanRowItem.tsx`:

```tsx
import { Link } from 'react-router-dom';
import type { PlanRow } from '../../features/plans/planTypes';
import { FOCUS } from '../organizations/portfolio/styles';
import { KindChip, NextDue, OwnerName, ProgressBar, RecordLink, StatusPill } from './parts';

/** One plan (spec §2.1), a rounded row, never a table row. `flat` for a
 *  section that is already a surface (no card inside a card). */
export function PlanRowItem({ row, showRecord = true, flat = false }: { row: PlanRow; showRecord?: boolean; flat?: boolean }) {
  return (
    <li data-plan={row.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5 ${flat ? '' : 'rounded-xl bg-surface'}`}>
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
        <Link to={`/projects/${row.id}`} className={`flex min-h-11 min-w-0 items-center rounded-sm text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
          <span className="truncate">{row.name}</span>
        </Link>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {showRecord ? <RecordLink record={row.record} /> : null}
          <KindChip kind={row.kind} />
          <OwnerName person={row.owner} />
        </span>
      </div>
      <ProgressBar done={row.milestones_done} total={row.milestones_total} label="milestones" />
      <NextDue date={row.next_due} overdue={row.is_overdue} />
      <StatusPill status={row.status} />
    </li>
  );
}
```

Create `src/components/plans/useSubmitOnce.ts`:

```ts
import { useCallback, useRef, useState } from 'react';

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** One write at a time, however often it is asked for (Decision 17): the
 *  guard is a ref, set before React re-renders, so Enter twice or a double
 *  click sends one request. A call made while one runs answers null. */
export function useSubmitOnce() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(work: () => Promise<T>): Promise<Outcome<T> | null> => {
    if (running.current) return null;
    running.current = true;
    setBusy(true);
    try {
      return { ok: true, value: await work() };
    } catch (error) {
      return { ok: false, error };
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/components/plans/parts.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/components/plans/parts.tsx src/components/plans/PlanRowItem.tsx src/components/plans/useSubmitOnce.ts src/components/plans/parts.test.tsx
git add src/components/plans/parts.tsx src/components/plans/PlanRowItem.tsx src/components/plans/useSubmitOnce.ts src/components/plans/parts.test.tsx
git commit -m "feat(plans): the row parts, the plan row, and submit-once

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `/projects`: the header, the filters in the URL, and the list

Spec §2.1 (header, filter bar, scope default, list, Show more, states); Decisions 2, 4, 5; Contract notes 8, 15.

**Files:**
- Create: `src/features/plans/planParams.ts`, `src/components/plans/useHasReports.ts`, `src/components/plans/PlanFilters.tsx`, `src/components/plans/PlansList.tsx`, `src/pages/plans/ProjectsHome.tsx`, `src/pages/plans/testPages.tsx`
- Test: `src/features/plans/planParams.test.ts`, `src/pages/plans/ProjectsHome.test.tsx`

**Interfaces:**
- Consumes: Task 1's `KINDS`, `KIND_LABEL`, `PLAN_NOUN`, types; Task 2's `fetchPlansPaged`, `stubPlans`, `MEMBERS`; Task 4's `PlanRowItem`; `usePagedRead` (`components/organizations/portfolio/usePagedRead`); `EmptyState`, `ErrorBlock`, `ItemSkeleton`, `MoreButton` (`…/portfolio/PortfolioSections`); `useSearchText`; `FILTER_SELECT`; `BUTTON`, `PRIMARY`, `QUIET`, `FOCUS`; `OrganizationsFrame`; `loadMembers`, `useMembers`, `resetMembersCache` (`features/knowledge/useMembers`); `makeRulesStore`, `Role` (`pages/rules/testPages`); `Where` (`pages/organizations/testList`); `SlotHost`; `setViewport`, `resetViewport`.
- Produces:
  - `planParams.ts`: `PlanScope`, `StatusFilter`, `PlansView`, `PlanParams { scope: PlanScope | null; kind: PlanKind | ''; owner: number | null; status: StatusFilter; q: string; cancelled: boolean }`, `DEFAULT_PARAMS`, `parsePlanParams(search)`, `toPlanSearch(params)`, `scopeOf(params, hasReports)`, `listQuery(params, scope)`, `columnQuery(params, scope, status)`, `isFiltered(params)`, `cleared(params)`, `VIEW_KEY`, `readView()`, `writeView(view)`, `templateParam(search)`.
  - `useHasReports(): boolean | null`.
  - `PlanFilters({ params, scope, view, owners, onChange })`.
  - `PlansList({ query, filtered, onClear })` (`<ul aria-label="Plans">`).
  - `ProjectsHome()` (renders `<Outlet />` for the modal routes).
  - `renderPlans(url, { width?, nav?, role? }) → { store, unmount }` on the real store and router; later tasks add routes to it.

- [ ] **Step 1: Write the failing tests**

Create `src/features/plans/planParams.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleared,
  columnQuery,
  DEFAULT_PARAMS,
  isFiltered,
  listQuery,
  parsePlanParams,
  readView,
  scopeOf,
  templateParam,
  toPlanSearch,
  writeView,
} from './planParams';

const parse = (query: string) => parsePlanParams(new URLSearchParams(query));

describe('/projects URL state (Decision 4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('reads the defaults, and ignores what it does not know', () => {
    expect(parse('')).toEqual(DEFAULT_PARAMS);
    expect(parse('scope=everyone&kind=party&owner=0&status=lost')).toEqual(DEFAULT_PARAMS);
    expect(parse('scope=tasks&kind=save&owner=4&status=all&q=%20pizza%20&cancelled=1')).toEqual({
      scope: 'tasks', kind: 'save', owner: 4, status: 'all', q: 'pizza', cancelled: true,
    });
  });

  it('writes only what differs from the defaults', () => {
    expect(toPlanSearch(DEFAULT_PARAMS)).toEqual({});
    expect(toPlanSearch({ ...DEFAULT_PARAMS, scope: 'mine', status: 'done', q: 'globex', cancelled: true })).toEqual({ scope: 'mine', status: 'done', q: 'globex', cancelled: '1' });
  });

  it('defaults the scope to All with reports, else Mine', () => {
    expect(scopeOf(DEFAULT_PARAMS, true)).toBe('all');
    expect(scopeOf(DEFAULT_PARAMS, false)).toBe('mine');
    expect(scopeOf({ ...DEFAULT_PARAMS, scope: 'tasks' }, false)).toBe('tasks');
  });

  it('asks the server for the list and for each column', () => {
    expect(listQuery(DEFAULT_PARAMS, 'all')).toBe('status=open');
    expect(listQuery({ ...DEFAULT_PARAMS, owner: 4 }, 'mine')).toBe('owner=me&status=open');
    expect(listQuery({ ...DEFAULT_PARAMS, owner: 4, kind: 'save', q: 'pizza', status: 'all' }, 'tasks')).toBe(
      'owner=4&mine=tasks&kind=save&q=pizza&status=open&status=done&status=cancelled',
    );
    expect(columnQuery({ ...DEFAULT_PARAMS, status: 'done', kind: 'qbr' }, 'all', 'on_track')).toBe('kind=qbr&status=on_track');
  });

  it('knows a filtered list, and clears it but keeps the scope and the board choice', () => {
    expect(isFiltered(DEFAULT_PARAMS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_PARAMS, scope: 'mine' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_PARAMS, status: 'done' })).toBe(true);
    expect(cleared({ scope: 'tasks', kind: 'save', owner: 4, status: 'all', q: 'x', cancelled: true })).toEqual({ ...DEFAULT_PARAMS, scope: 'tasks', cancelled: true });
  });

  it('remembers the view, List by default, and survives storage that throws', () => {
    expect(readView()).toBe('list');
    writeView('board');
    expect(readView()).toBe('board');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readView()).toBe('list');
    expect(() => writeView('list')).not.toThrow();
  });

  it('reads a template to start from', () => {
    expect(templateParam(new URLSearchParams('template=3'))).toBe(3);
    expect(templateParam(new URLSearchParams('template=abc'))).toBeNull();
  });
});
```

Create `src/pages/plans/ProjectsHome.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPlans } from '../../features/plans/testPlans';
import { TEAM } from '../../features/segments/testSegments';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

// Integration tier: the real store and router, fetch stubbed in the
// contract's shapes (stubPlans).
const where = () => screen.getByTestId('where').textContent;
const ids = () => within(screen.getByRole('list', { name: 'Plans' })).getAllByRole('listitem').map((item) => item.getAttribute('data-plan'));
const rowOf = (name: string) => screen.getByRole('link', { name }).closest('li') as HTMLElement;

describe('/projects: the list (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
    localStorage.clear();
  });

  it('shows the header actions and, for someone with reports, every open plan they can see', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects');
    expect(screen.getByRole('link', { name: 'New plan' })).toHaveAttribute('href', '/projects/new');
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute('href', '/projects/templates');
    await waitFor(() => expect(ids()).toEqual(['47', '43', '42', '41']));
    expect(screen.getByRole('button', { name: 'All I can see' })).toHaveAttribute('aria-pressed', 'true');
    const reads = requestsOf(spy, 'GET', /^\/plans\/$/);
    expect(reads).toHaveLength(1);
    expect(reads[0].query.toString()).toBe('status=open');
    const qbr = rowOf('QBR · Pizza Hut');
    expect(within(qbr).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(qbr).toHaveTextContent('Not started');
    expect(qbr).toHaveTextContent('0/3');
    expect(qbr).toHaveTextContent('Next 6 Oct');
    expect(rowOf('Save plan · Initech APAC')).toHaveTextContent('Overdue · 15 Sep');
  });

  it('opens on Mine for someone without reports, with no Owner filter', async () => {
    const { spy } = stubPlans({ members: TEAM });
    renderPlans('/projects');
    await waitFor(() => expect(ids()).toEqual(['43', '41']));
    expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('combobox', { name: 'Owner' })).toBeNull();
    expect(requestsOf(spy, 'GET', /^\/plans\/$/)[0].query.get('owner')).toBe('me');
  });

  it('keeps every filter in the URL, the search after a pause', async () => {
    stubPlans();
    renderPlans('/projects');
    await waitFor(() => expect(ids()).toHaveLength(4));
    await userEvent.click(screen.getByRole('button', { name: 'Has my tasks' }));
    await waitFor(() => expect(where()).toBe('/projects?scope=tasks'));
    await waitFor(() => expect(ids()).toEqual(['42', '41']));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), 'save');
    await waitFor(() => expect(where()).toBe('/projects?scope=tasks&kind=save'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'all');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search plans' }), 'initech');
    await waitFor(() => expect(where()).toBe('/projects?scope=tasks&kind=save&status=all&q=initech'));
    await waitFor(() => expect(ids()).toEqual(['42']));
  });

  it('says when filters match nothing, and Clear filters goes back to open plans', async () => {
    stubPlans();
    renderPlans('/projects?status=done&q=zzz');
    expect(await screen.findByText('No plans match these filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(where()).toBe('/projects'));
    await waitFor(() => expect(ids()).toHaveLength(4));
  });

  it('says there are no plans yet, with a way to start one', async () => {
    stubPlans({ plans: [] });
    renderPlans('/projects');
    expect(await screen.findByText('No plans yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New plan' })).toHaveLength(2);
  });

  it('shows the error with Try again, then the list', async () => {
    let fail = true;
    stubPlans({ list: () => (fail ? { status: 500, body: { detail: 'Try later.' } } : undefined) });
    renderPlans('/projects');
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(ids()).toHaveLength(4));
  });

  it('shows more plans on the cursor', async () => {
    stubPlans({ pageSize: 2 });
    renderPlans('/projects');
    await waitFor(() => expect(ids()).toEqual(['47', '43']));
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(ids()).toEqual(['47', '43', '42', '41']));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/plans/planParams.test.ts src/pages/plans/ProjectsHome.test.tsx`
Expected: FAIL, "Failed to resolve import "./planParams"" and "./testPages".

- [ ] **Step 3: Write the URL state**

Create `src/features/plans/planParams.ts`:

```ts
// /projects' URL state (Decision 4), the queries it sends (Contract notes 7,
// 8), and the remembered List / Board choice (Decision 3).
import { KINDS } from './planOptions';
import type { PlanKind, PlanStatus } from './planTypes';

export type PlanScope = 'mine' | 'tasks' | 'all';
export type StatusFilter = 'open' | 'done' | 'cancelled' | 'all';
export type PlansView = 'list' | 'board';

export interface PlanParams {
  /** Null: the default for the person (Decision 5). */
  scope: PlanScope | null;
  kind: PlanKind | '';
  owner: number | null;
  /** The List's only. */
  status: StatusFilter;
  q: string;
  /** The board's Show cancelled. */
  cancelled: boolean;
}

const SCOPES: readonly string[] = ['mine', 'tasks', 'all'];
const FILTERS: readonly string[] = ['open', 'done', 'cancelled', 'all'];
export const DEFAULT_PARAMS: PlanParams = { scope: null, kind: '', owner: null, status: 'open', q: '', cancelled: false };

export function parsePlanParams(search: URLSearchParams): PlanParams {
  const scope = search.get('scope') ?? '';
  const kind = search.get('kind') ?? '';
  const owner = search.get('owner') ?? '';
  const status = search.get('status') ?? '';
  return {
    scope: SCOPES.includes(scope) ? (scope as PlanScope) : null,
    kind: (KINDS as readonly string[]).includes(kind) ? (kind as PlanKind) : '',
    owner: /^[1-9]\d*$/.test(owner) ? Number(owner) : null,
    status: FILTERS.includes(status) ? (status as StatusFilter) : 'open',
    q: (search.get('q') ?? '').trim(),
    cancelled: search.get('cancelled') === '1',
  };
}

export function toPlanSearch(params: PlanParams): Record<string, string> {
  const out: Record<string, string> = {};
  if (params.scope) out.scope = params.scope;
  if (params.kind) out.kind = params.kind;
  if (params.owner !== null) out.owner = String(params.owner);
  if (params.status !== 'open') out.status = params.status;
  if (params.q) out.q = params.q;
  if (params.cancelled) out.cancelled = '1';
  return out;
}

export function scopeOf(params: PlanParams, hasReports: boolean): PlanScope {
  return params.scope ?? (hasReports ? 'all' : 'mine');
}

/** Mine is `owner=me` (the Owner filter is set aside); Has my tasks is `mine=tasks`. */
function baseQuery(params: PlanParams, scope: PlanScope): URLSearchParams {
  const query = new URLSearchParams();
  if (scope === 'mine') query.set('owner', 'me');
  else if (params.owner !== null) query.set('owner', String(params.owner));
  if (scope === 'tasks') query.set('mine', 'tasks');
  if (params.kind) query.set('kind', params.kind);
  if (params.q) query.set('q', params.q);
  return query;
}

/** GET plans/ for the List; All is open, done and cancelled. */
export function listQuery(params: PlanParams, scope: PlanScope): string {
  const query = baseQuery(params, scope);
  for (const status of params.status === 'all' ? ['open', 'done', 'cancelled'] : [params.status]) query.append('status', status);
  return query.toString();
}

/** GET plans/ for one board column. */
export function columnQuery(params: PlanParams, scope: PlanScope, status: PlanStatus): string {
  const query = baseQuery(params, scope);
  query.set('status', status);
  return query.toString();
}

export function isFiltered(params: PlanParams): boolean {
  return Boolean(params.kind) || params.owner !== null || Boolean(params.q) || params.status !== 'open';
}

export function cleared(params: PlanParams): PlanParams {
  return { ...DEFAULT_PARAMS, scope: params.scope, cancelled: params.cancelled };
}

export const VIEW_KEY = 'revenact_plans_view';

/** List unless Board was chosen here before; storage may be blocked. */
export function readView(): PlansView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
}

export function writeView(view: PlansView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // A private window or blocked storage: the choice lasts this visit only.
  }
}

/** /projects/new?template=<id> (Templates' Use, Decision 10). */
export function templateParam(search: URLSearchParams): number | null {
  const value = search.get('template') ?? '';
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}
```

- [ ] **Step 4: Write the hook, the filters and the list**

Create `src/components/plans/useHasReports.ts`:

```ts
import { useEffect, useState } from 'react';
import { useAppSelector } from '../../hooks';
import { loadMembers } from '../../features/knowledge/useMembers';

/** Whether anyone reports to the signed-in person, read from GET
 *  /auth/members/ (Contract note 15); null until the members load. It
 *  decides the scope's default, so the list waits for it (Decision 5). */
export function useHasReports(): boolean | null {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const [answer, setAnswer] = useState<{ me: number | null; value: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    loadMembers().then((members) => {
      if (alive) setAnswer({ me, value: members.some((member) => member.reports_to?.id === me) });
    });
    return () => {
      alive = false;
    };
  }, [me]);
  return answer?.me === me ? answer.value : null;
}
```

Create `src/components/plans/PlanFilters.tsx`:

```tsx
import { useCallback } from 'react';
import { KIND_LABEL, KINDS } from '../../features/plans/planOptions';
import type { PlanParams, PlanScope, PlansView, StatusFilter } from '../../features/plans/planParams';
import type { PersonRef, PlanKind } from '../../features/plans/planTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS } from '../organizations/portfolio/styles';
import { useSearchText } from '../organizations/portfolio/useSearchText';

const SEGMENT = `inline-flex min-h-11 sm:min-h-8 items-center rounded-md px-3 text-[13px] hover:text-ink active:bg-line-subtle ${FOCUS}`;
const SCOPES: readonly { value: PlanScope; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'tasks', label: 'Has my tasks' },
  { value: 'all', label: 'All I can see' },
];
const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

/** The filter bar (spec §2.1): scope, kind, owner (outside Mine), status
 *  (List only) and a search that commits 300 ms after typing stops. The
 *  chosen scope is weight and fill, and `aria-pressed`, not a colour alone. */
export function PlanFilters({ params, scope, view, owners, onChange }: {
  params: PlanParams;
  scope: PlanScope;
  view: PlansView;
  owners: PersonRef[];
  onChange: (next: PlanParams) => void;
}) {
  const commit = useCallback((q: string) => onChange({ ...params, q }), [params, onChange]);
  const [text, setText] = useSearchText(params.q, commit);
  return (
    <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Scope" className="inline-flex flex-wrap rounded-lg border border-line p-0.5">
        {SCOPES.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={scope === option.value}
            onClick={() => onChange({ ...params, scope: option.value })}
            className={`${SEGMENT} ${scope === option.value ? 'bg-subtle font-semibold text-ink' : 'font-normal text-ink-muted'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <select aria-label="Kind" value={params.kind} onChange={(event) => onChange({ ...params, kind: event.target.value as PlanKind | '' })} className={FILTER_SELECT}>
        <option value="">All kinds</option>
        {KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {KIND_LABEL[kind]}
          </option>
        ))}
      </select>
      {scope !== 'mine' ? (
        <select
          aria-label="Owner"
          value={params.owner ?? ''}
          onChange={(event) => onChange({ ...params, owner: event.target.value ? Number(event.target.value) : null })}
          className={FILTER_SELECT}
        >
          <option value="">Any owner</option>
          {owners.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      ) : null}
      {view === 'list' ? (
        <select aria-label="Status" value={params.status} onChange={(event) => onChange({ ...params, status: event.target.value as StatusFilter })} className={FILTER_SELECT}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      <input
        type="search"
        aria-label="Search plans"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Plan or record name"
        autoComplete="off"
        className={`${FILTER_SELECT} w-full placeholder:text-ink-muted sm:w-56`}
      />
    </div>
  );
}
```

Create `src/components/plans/PlansList.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchPlansPaged } from '../../features/plans/planApi';
import { PLAN_NOUN } from '../../features/plans/planOptions';
import { EmptyState, ErrorBlock, ItemSkeleton, MoreButton } from '../organizations/portfolio/PortfolioSections';
import { QUIET } from '../organizations/portfolio/styles';
import { usePagedRead } from '../organizations/portfolio/usePagedRead';
import { PlanRowItem } from './PlanRowItem';

const EXPLAINER = 'A plan sets out the work on one customer over weeks: milestones, and the tasks under them.';

/** The List (spec §2.1): one row per plan, Show more on the cursor, and its
 *  empty, loading and error states. While a new query loads the last rows
 *  stay, marked busy. */
export function PlansList({ query, filtered, onClear }: { query: string; filtered: boolean; onClear: () => void }) {
  const read = usePagedRead(fetchPlansPaged, PLAN_NOUN, query, true, 0);
  if (read.error && read.rows.length === 0) return <ErrorBlock message={read.error} onRetry={read.retry} />;
  if (read.loading && read.rows.length === 0) return <ItemSkeleton count={5} label="Loading plans" avatar={false} />;
  if (read.rows.length === 0) {
    return filtered ? (
      <EmptyState
        title="No plans match these filters"
        detail="Remove a filter, or clear them all."
        action={
          <button type="button" onClick={onClear} className={`${QUIET} border border-line`}>
            Clear filters
          </button>
        }
      />
    ) : (
      <EmptyState
        title="No plans yet"
        detail={EXPLAINER}
        action={
          <Link to="/projects/new" className={`${QUIET} border border-line`}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New plan
          </Link>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {read.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
          <span>{read.error} Showing the last result.</span>
          <button type="button" onClick={read.retry} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : null}
      <ul aria-label="Plans" aria-busy={read.loading} className="flex flex-col gap-1.5">
        {read.rows.map((row) => (
          <PlanRowItem key={row.id} row={row} />
        ))}
      </ul>
      <MoreButton next={read.next} loading={read.loadingMore} error={read.moreError} label="Show more" onClick={() => void read.loadMore()} />
    </div>
  );
}
```

- [ ] **Step 5: Write the page and the test render**

Create `src/pages/plans/ProjectsHome.tsx`:

```tsx
import { useCallback, useMemo } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router-dom';
import { FileStack, Plus } from 'lucide-react';
import { useMembers } from '../../features/knowledge/useMembers';
import { cleared, isFiltered, listQuery, parsePlanParams, scopeOf, toPlanSearch, type PlanParams } from '../../features/plans/planParams';
import type { PersonRef } from '../../features/plans/planTypes';
import { ItemSkeleton } from '../../components/organizations/portfolio/PortfolioSections';
import { BUTTON, PRIMARY } from '../../components/organizations/portfolio/styles';
import { PlanFilters } from '../../components/plans/PlanFilters';
import { PlansList } from '../../components/plans/PlansList';
import { useHasReports } from '../../components/plans/useHasReports';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

/** /projects (spec §2.1), under the framed bar titled "Project Management"
 *  (Decision 2). New plan (/projects/new) opens its modal over this page
 *  through the Outlet. */
export function ProjectsHome() {
  const [search, setSearch] = useSearchParams();
  const params = parsePlanParams(search);
  const hasReports = useHasReports();
  const members = useMembers();
  const owners = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active).map(({ id, name }) => ({ id, name })), [members]);
  const change = useCallback((next: PlanParams) => setSearch(toPlanSearch(next), { replace: true }), [setSearch]);
  const scope = hasReports === null ? null : scopeOf(params, hasReports);
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/projects/templates" className={`${BUTTON} sm:ml-auto`}>
            <FileStack className="h-4 w-4" aria-hidden="true" />
            Templates
          </Link>
          <Link to="/projects/new" className={PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New plan
          </Link>
        </div>
        {scope === null ? (
          <ItemSkeleton count={5} label="Loading plans" avatar={false} />
        ) : (
          <>
            <PlanFilters params={params} scope={scope} view="list" owners={owners} onChange={change} />
            <PlansList query={listQuery(params, scope)} filtered={isFiltered(params)} onClear={() => change(cleared(params))} />
          </>
        )}
      </div>
      {/* /projects/new: the New plan modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}
```

Create `src/pages/plans/testPages.tsx`:

```tsx
// Test-only helpers, never hot-reloaded.
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from '../../components/layout/Navbar';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore, type Role } from '../rules/testPages';
import { ProjectsHome } from './ProjectsHome';

/** The Plans routes on the real store and router, as App.tsx routes them.
 *  The signed-in user is Alice (id 1) of "Acme Inc" (makeRulesStore). Only
 *  fetch is stubbed, by the caller (stubPlans). `nav` adds the real Navbar. */
export function renderPlans(url: string, { width = 1440, nav = false, role = 'admin' }: { width?: number; nav?: boolean; role?: Role } = {}) {
  setViewport(width);
  const store = makeRulesStore(role);
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          <Routes>
            <Route
              element={
                <>
                  <ProjectsHome />
                  <Where />
                </>
              }
            >
              <Route path="/projects" element={null} />
            </Route>
            {/* ROUTES: later tasks add their routes here. */}
            <Route path="*" element={<Where />} />
          </Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store, unmount: view.unmount };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/plans/planParams.test.ts src/pages/plans/ProjectsHome.test.tsx`
Expected: PASS (7 + 7 tests).

- [ ] **Step 7: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/features/plans/planParams.ts src/features/plans/planParams.test.ts src/components/plans/useHasReports.ts src/components/plans/PlanFilters.tsx src/components/plans/PlansList.tsx src/pages/plans/ProjectsHome.tsx src/pages/plans/testPages.tsx src/pages/plans/ProjectsHome.test.tsx
git add src/features/plans/planParams.ts src/features/plans/planParams.test.ts src/components/plans/useHasReports.ts src/components/plans/PlanFilters.tsx src/components/plans/PlansList.tsx src/pages/plans/ProjectsHome.tsx src/pages/plans/testPages.tsx src/pages/plans/ProjectsHome.test.tsx
git commit -m "feat(plans): /projects with its filters in the URL and the list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The board, its moves, and the remembered List / Board choice

Spec §2.1 (List / Board toggle in `localStorage`; four columns with counts; Show cancelled; drag between Not started, On track and At risk, Done only when every milestone is done; a refusal snaps back with a toast; a status menu on each card; one column at a time below 768px; no sideways scroll); Decisions 3, 6, 7; Contract notes 6, 7.

**Files:**
- Create: `src/components/plans/PlansBoard.tsx`
- Modify: `src/pages/plans/ProjectsHome.tsx` (the View toggle and the board)
- Test: `src/components/plans/PlansBoard.test.tsx`

**Interfaces:**
- Consumes: Task 1's `BOARD_COLUMNS`, `STATUS_LABEL`, `PLAN_NOUN`, `allMilestonesDone`, `isOpen`, `moveNotice`, `moveRefusal`; Task 2's `fetchPlansPaged`, `updatePlan`, `stubPlans`; Task 4's parts; Task 5's `columnQuery`, `PlanParams`, `PlanScope`, `readView`, `writeView`, `renderPlans`; `usePagedRead`, `errorMessage`; `DismissibleAlert`; `FILTER_SELECT`; `useMediaQuery`, `MD`, `SM`; `EmptyState`, `ErrorBlock`, `ItemSkeleton`, `MoreButton`.
- Produces: `PlansBoard({ params, scope, onChange })`; `ProjectsHome` now renders `PlanFilters` with the current view and the List or the Board.

- [ ] **Step 1: Write the failing test**

Create `src/components/plans/PlansBoard.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { renderPlans } from '../../pages/plans/testPages';
import { resetViewport } from '../../test/viewport';

// Integration tier on /projects with the Board chosen.
const column = (label: string) => screen.getByRole('region', { name: new RegExp(`^${label}`) });
const cardIds = (label: string) => within(column(label)).queryAllByRole('listitem').map((item) => item.getAttribute('data-plan'));
const openBoard = async (url = '/projects', width = 1440) => {
  localStorage.setItem('revenact_plans_view', 'board');
  const view = renderPlans(url, { width });
  await waitFor(() => expect(cardIds('On track')).toEqual(['41']));
  return view;
};

describe('/projects: the board (spec §2.1)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
    localStorage.clear();
  });

  it('opens on the remembered view, and switching remembers it', async () => {
    stubPlans();
    renderPlans('/projects');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    expect(localStorage.getItem('revenact_plans_view')).toBe('board');
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(cardIds('At risk')).toEqual(['42']));
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
  });

  it('shows four columns, each with its count in DM Mono, and Show cancelled adds a fifth', async () => {
    const { spy } = stubPlans();
    await openBoard();
    expect(cardIds('Not started')).toEqual(['47', '43']);
    expect(cardIds('At risk')).toEqual(['42']);
    expect(cardIds('Done')).toEqual(['44']);
    expect(within(column('Not started')).getByRole('heading').querySelector('.font-mono-brand')).toHaveTextContent('2');
    expect(screen.queryByRole('region', { name: /^Cancelled/ })).toBeNull();
    expect(requestsOf(spy, 'GET', /^\/plans\/$/).map((read) => read.query.get('status')).sort()).toEqual(['at_risk', 'done', 'not_started', 'on_track']);
    await userEvent.click(screen.getByRole('button', { name: 'Show cancelled' }));
    await waitFor(() => expect(cardIds('Cancelled')).toEqual(['45']));
    expect(screen.getByTestId('where')).toHaveTextContent('/projects?cancelled=1');
  });

  it("moves a card with its status menu, says so, and reads every column again", async () => {
    const { spy } = stubPlans();
    await openBoard();
    const card = within(column('Not started')).getByRole('link', { name: 'QBR · Pizza Hut' }).closest('li') as HTMLElement;
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Status of QBR · Pizza Hut' }), 'on_track');
    await waitFor(() => expect(cardIds('On track')).toEqual(['43', '41']));
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/$/)[0].body).toEqual({ status: 'on_track' });
    expect(screen.getByRole('status')).toHaveTextContent('Moved QBR · Pizza Hut to On track.');
  });

  it('drags a card to another open column, and refuses Done and Not started before asking', async () => {
    const { spy } = stubPlans();
    await openBoard();
    const globex = within(column('On track')).getByRole('link', { name: 'Onboarding · Globex' }).closest('li') as HTMLElement;
    expect(globex).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(globex);
    fireEvent.dragOver(column('Done'));
    fireEvent.drop(column('Done'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mark every milestone done first.');
    fireEvent.dragStart(globex);
    fireEvent.drop(column('Not started'));
    expect(screen.getByRole('alert')).toHaveTextContent("A plan can't go back to Not started.");
    expect(requestsOf(spy, 'PATCH', /^\/plans\/41\/$/)).toHaveLength(0);
    fireEvent.dragStart(globex);
    fireEvent.dragOver(column('At risk'));
    fireEvent.drop(column('At risk'));
    await waitFor(() => expect(cardIds('At risk')).toEqual(['42', '41']));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("keeps the card where it was and shows the server's reason when it refuses", async () => {
    stubPlans({ patch: () => ({ status: 400, body: { status: ['Mark every milestone done first.'] } }) });
    await openBoard();
    const card = within(column('On track')).getByRole('link', { name: 'Onboarding · Globex' }).closest('li') as HTMLElement;
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Status of Onboarding · Globex' }), 'at_risk');
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not move Onboarding · Globex: Mark every milestone done first.');
    expect(cardIds('On track')).toEqual(['41']);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("gives a reader's card no status menu and no drag", async () => {
    stubPlans();
    await openBoard();
    const card = within(column('At risk')).getByRole('link', { name: 'Save plan · Initech APAC' }).closest('li') as HTMLElement;
    expect(within(card).queryByRole('combobox')).toBeNull();
    expect(card).toHaveAttribute('draggable', 'false');
  });

  it('shows one column at a time below 768px, chosen by its name and count', async () => {
    stubPlans();
    localStorage.setItem('revenact_plans_view', 'board');
    renderPlans('/projects', { width: 375 });
    const picker = await screen.findByRole('group', { name: 'Column' });
    await waitFor(() => expect(within(picker).getByRole('button', { name: /^On track/ })).toHaveTextContent('On track1'));
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(within(picker).getByRole('button', { name: /^Not started/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(picker).getByRole('button', { name: /^At risk/ }));
    await waitFor(() => expect(cardIds('At risk')).toEqual(['42']));
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('says there are no plans yet when every column is empty', async () => {
    stubPlans({ plans: [] });
    localStorage.setItem('revenact_plans_view', 'board');
    renderPlans('/projects');
    expect(await screen.findByText('No plans yet')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/components/plans/PlansBoard.test.tsx`
Expected: FAIL, the first test cannot find the "List" button (and "./PlansBoard" is not yet imported anywhere).

- [ ] **Step 3: Write the board**

Create `src/components/plans/PlansBoard.tsx`:

```tsx
import { useCallback, useEffect, useId, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { MD, SM, useMediaQuery } from '../../lib/useMediaQuery';
import { fetchPlansPaged, updatePlan } from '../../features/plans/planApi';
import { BOARD_COLUMNS, PLAN_NOUN, STATUS_LABEL } from '../../features/plans/planOptions';
import { columnQuery, isFiltered, cleared, type PlanParams, type PlanScope } from '../../features/plans/planParams';
import { allMilestonesDone, isOpen, moveNotice, moveRefusal } from '../../features/plans/planText';
import type { PlanRow, PlanStatus, SettableStatus } from '../../features/plans/planTypes';
import { DismissibleAlert } from '../organizations/portfolio/DismissibleAlert';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { EmptyState, ErrorBlock, ItemSkeleton, MoreButton } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage, usePagedRead } from '../organizations/portfolio/usePagedRead';
import { NextDue, OwnerName, ProgressBar, RecordLink } from './parts';

const PICK = `inline-flex min-h-11 sm:min-h-8 items-center gap-1.5 rounded-md px-3 text-[13px] hover:text-ink active:bg-line-subtle ${FOCUS}`;

/** The keyboard and touch alternative to dragging (Decision 6). Not started
 *  is never offered (Contract note 6); Done waits for every milestone. */
function StatusMenu({ row, disabled, onMove }: { row: PlanRow; disabled: boolean; onMove: (row: PlanRow, to: PlanStatus) => void }) {
  return (
    <select
      aria-label={`Status of ${row.name}`}
      value={row.status}
      disabled={disabled}
      onChange={(event) => onMove(row, event.target.value as PlanStatus)}
      className={`${FILTER_SELECT} w-full`}
    >
      {row.status === 'not_started' ? (
        <option value="not_started" disabled>
          Not started
        </option>
      ) : null}
      <option value="on_track">On track</option>
      <option value="at_risk">At risk</option>
      <option value="done" disabled={!allMilestonesDone(row)}>
        Done
      </option>
    </select>
  );
}

function PlanCard({ row, draggable, busy, onDragStart, onDragEnd, onMove }: {
  row: PlanRow;
  draggable: boolean;
  busy: boolean;
  onDragStart: (row: PlanRow) => void;
  onDragEnd: () => void;
  onMove: (row: PlanRow, to: PlanStatus) => void;
}) {
  const start = (event: DragEvent<HTMLLIElement>) => {
    // jsdom has no DataTransfer; browsers get the id so Firefox starts the drag.
    event.dataTransfer?.setData?.('text/plain', String(row.id));
    onDragStart(row);
  };
  return (
    <li
      data-plan={row.id}
      draggable={draggable}
      onDragStart={draggable ? start : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      aria-busy={busy}
      className={`flex flex-col gap-1.5 rounded-xl bg-surface px-3 py-2.5 ${busy ? 'opacity-50' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <Link to={`/projects/${row.id}`} draggable={false} className={`flex min-h-11 min-w-0 items-center rounded-sm text-[13px] font-semibold text-ink hover:underline sm:min-h-0 ${FOCUS}`}>
        <span className="truncate">{row.name}</span>
      </Link>
      <RecordLink record={row.record} />
      <OwnerName person={row.owner} />
      <span className="flex flex-wrap items-center justify-between gap-2">
        <ProgressBar done={row.milestones_done} total={row.milestones_total} label="milestones" />
        <NextDue date={row.next_due} overdue={row.is_overdue} />
      </span>
      {row.can_edit && isOpen(row.status) ? <StatusMenu row={row} disabled={busy} onMove={onMove} /> : null}
    </li>
  );
}

/** One column: one GET plans/?status=<s> under the same filters (Contract
 *  note 7). A card dropped on it asks the board to move it. */
function PlanColumn({ status, query, version, dragging, moving, isSm, onCount, onDragStart, onDragEnd, onDrop, onMove }: {
  status: PlanStatus;
  query: string;
  version: number;
  dragging: PlanRow | null;
  moving: number | null;
  isSm: boolean;
  onCount: (counts: Record<PlanStatus, number>) => void;
  onDragStart: (row: PlanRow) => void;
  onDragEnd: () => void;
  onDrop: (to: PlanStatus) => void;
  onMove: (row: PlanRow, to: PlanStatus) => void;
}) {
  const headingId = useId();
  const read = usePagedRead(fetchPlansPaged, PLAN_NOUN, query, true, version);
  const counts = read.data?.counts ?? null;
  useEffect(() => {
    if (counts) onCount(counts);
  }, [counts, onCount]);
  const [over, setOver] = useState(false);
  return (
    <section
      aria-labelledby={headingId}
      data-column={status}
      onDragOver={(event) => {
        if (!dragging) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onDrop(status);
      }}
      className={`flex min-w-0 flex-col gap-2 rounded-xl p-2 ${over ? 'bg-subtle' : ''}`}
    >
      <h2 id={headingId} className="flex items-center gap-2 px-1 text-[13px] font-semibold text-ink">
        {STATUS_LABEL[status]}
        <span className={`${MONO} text-[11px] text-ink-muted`}>{counts ? counts[status] : ''}</span>
      </h2>
      {read.error && read.rows.length === 0 ? <ErrorBlock message={read.error} onRetry={read.retry} /> : null}
      {read.loading && read.rows.length === 0 && !read.error ? <ItemSkeleton count={2} label={`Loading ${STATUS_LABEL[status]}`} avatar={false} /> : null}
      {!read.loading && !read.error && read.rows.length === 0 ? <p className="px-1 text-[11px] text-ink-muted">No plans</p> : null}
      {read.rows.length > 0 ? (
        <ul aria-label={`${STATUS_LABEL[status]} plans`} aria-busy={read.loading} className="flex flex-col gap-1.5">
          {read.rows.map((row) => (
            <PlanCard
              key={row.id}
              row={row}
              draggable={isSm && row.can_edit && isOpen(row.status) && moving === null}
              busy={moving === row.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMove={onMove}
            />
          ))}
        </ul>
      ) : null}
      <MoreButton next={read.next} loading={read.loadingMore} error={read.moreError} label="Show more" onClick={() => void read.loadMore()} />
    </section>
  );
}

/** The board (spec §2.1): Not started · On track · At risk · Done, and
 *  Cancelled on Show cancelled. Moves are not optimistic (Decision 6): the
 *  card stays until the server answers, then every column reads again. */
export function PlansBoard({ params, scope, onChange }: { params: PlanParams; scope: PlanScope; onChange: (next: PlanParams) => void }) {
  const isMd = useMediaQuery(MD);
  const isSm = useMediaQuery(SM);
  const columns: PlanStatus[] = params.cancelled ? [...BOARD_COLUMNS, 'cancelled'] : [...BOARD_COLUMNS];
  const [picked, setPicked] = useState<PlanStatus>('not_started');
  const shown = isMd ? columns : [columns.includes(picked) ? picked : 'not_started'];
  const [version, setVersion] = useState(0);
  const [dragging, setDragging] = useState<PlanRow | null>(null);
  const [moving, setMoving] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Every column's page carries every status's count; keep the latest for
  // these filters, so the picker and the empty board can read them.
  const base = columnQuery(params, scope, 'not_started');
  const [counts, setCounts] = useState<{ base: string; counts: Record<PlanStatus, number> } | null>(null);
  const onCount = useCallback((next: Record<PlanStatus, number>) => setCounts({ base, counts: next }), [base]);
  const known = counts?.base === base ? counts.counts : null;
  const empty = known !== null && Object.values(known).every((n) => n === 0);

  async function move(row: PlanRow, to: PlanStatus) {
    if (to === row.status || moving !== null) return;
    setNotice('');
    const refusal = moveRefusal(row, to);
    if (refusal) {
      setError(refusal);
      return;
    }
    setError(null);
    setMoving(row.id);
    try {
      await updatePlan(row.id, { status: to as SettableStatus });
      setNotice(moveNotice(row.name, to));
      setVersion((n) => n + 1);
    } catch (err) {
      setError(`Could not move ${row.name}: ${errorMessage(err, 'try again.')}`);
    } finally {
      setMoving(null);
    }
  }
  const drop = (to: PlanStatus) => {
    const row = dragging;
    setDragging(null);
    if (row) void move(row, to);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!isMd ? (
          <div role="group" aria-label="Column" className="inline-flex flex-wrap rounded-lg border border-line p-0.5">
            {columns.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={shown[0] === status}
                onClick={() => setPicked(status)}
                className={`${PICK} ${shown[0] === status ? 'bg-subtle font-semibold text-ink' : 'font-normal text-ink-muted'}`}
              >
                {STATUS_LABEL[status]}
                <span className={`${MONO} text-[11px]`}>{known ? known[status] : ''}</span>
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          aria-pressed={params.cancelled}
          onClick={() => onChange({ ...params, cancelled: !params.cancelled })}
          className={`${QUIET} border border-line sm:ml-auto`}
        >
          {params.cancelled ? 'Hide cancelled' : 'Show cancelled'}
        </button>
      </div>
      <p role="status" className="text-[13px] text-ink-muted empty:hidden">
        {notice}
      </p>
      {error ? <DismissibleAlert message={error} onDismiss={() => setError(null)} /> : null}
      {empty ? (
        isFiltered(params) ? (
          <EmptyState
            title="No plans match these filters"
            detail="Remove a filter, or clear them all."
            action={
              <button type="button" onClick={() => onChange(cleared(params))} className={`${QUIET} border border-line`}>
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState
            title="No plans yet"
            detail="A plan sets out the work on one customer over weeks: milestones, and the tasks under them."
            action={
              <Link to="/projects/new" className={`${QUIET} border border-line`}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New plan
              </Link>
            }
          />
        )
      ) : null}
      {/* Hidden, not unmounted, while empty: the columns keep reading as the filters change. */}
      <div hidden={empty} className={`grid gap-3 md:grid-cols-2 lg:grid-cols-4 ${columns.length === 5 ? 'xl:grid-cols-5' : ''}`}>
        {shown.map((status) => (
          <PlanColumn
            key={status}
            status={status}
            query={columnQuery(params, scope, status)}
            version={version}
            dragging={dragging}
            moving={moving}
            isSm={isSm}
            onCount={onCount}
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            onDrop={drop}
            onMove={(row, to) => void move(row, to)}
          />
        ))}
      </div>
    </div>
  );
}
```

Note on the drop handler: `onDragEnd` fires after `onDrop` in browsers, so `drop` reads `dragging` before it is cleared.

- [ ] **Step 4: Add the View toggle and the board to the page**

Replace `src/pages/plans/ProjectsHome.tsx` with:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useSearchParams } from 'react-router-dom';
import { Columns3, FileStack, List, Plus } from 'lucide-react';
import { useMembers } from '../../features/knowledge/useMembers';
import { cleared, isFiltered, listQuery, parsePlanParams, readView, scopeOf, toPlanSearch, writeView, type PlanParams, type PlansView } from '../../features/plans/planParams';
import type { PersonRef } from '../../features/plans/planTypes';
import { ItemSkeleton } from '../../components/organizations/portfolio/PortfolioSections';
import { BUTTON, FOCUS, PRIMARY } from '../../components/organizations/portfolio/styles';
import { PlanFilters } from '../../components/plans/PlanFilters';
import { PlansBoard } from '../../components/plans/PlansBoard';
import { PlansList } from '../../components/plans/PlansList';
import { useHasReports } from '../../components/plans/useHasReports';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

const VIEW_BUTTON = `inline-flex min-h-11 sm:min-h-8 items-center gap-1.5 rounded-md px-3 text-[13px] hover:text-ink active:bg-line-subtle ${FOCUS}`;
const VIEWS = [
  { value: 'list', label: 'List', icon: List },
  { value: 'board', label: 'Board', icon: Columns3 },
] as const;

/** /projects (spec §2.1), under the framed bar titled "Project Management"
 *  (Decision 2): List or Board, remembered here (Decision 3). New plan
 *  (/projects/new) opens its modal over this page through the Outlet. */
export function ProjectsHome() {
  const [search, setSearch] = useSearchParams();
  const params = parsePlanParams(search);
  const hasReports = useHasReports();
  const members = useMembers();
  const owners = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active).map(({ id, name }) => ({ id, name })), [members]);
  const change = useCallback((next: PlanParams) => setSearch(toPlanSearch(next), { replace: true }), [setSearch]);
  const [view, setView] = useState<PlansView>(readView);
  const pick = (next: PlansView) => {
    setView(next);
    writeView(next);
  };
  const scope = hasReports === null ? null : scopeOf(params, hasReports);
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="View" className="inline-flex rounded-lg border border-line p-0.5">
            {VIEWS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={view === option.value}
                onClick={() => pick(option.value)}
                className={`${VIEW_BUTTON} ${view === option.value ? 'bg-subtle font-semibold text-ink' : 'font-normal text-ink-muted'}`}
              >
                <option.icon className="h-4 w-4" aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
          <Link to="/projects/templates" className={`${BUTTON} sm:ml-auto`}>
            <FileStack className="h-4 w-4" aria-hidden="true" />
            Templates
          </Link>
          <Link to="/projects/new" className={PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New plan
          </Link>
        </div>
        {scope === null ? (
          <ItemSkeleton count={5} label="Loading plans" avatar={false} />
        ) : (
          <>
            <PlanFilters params={params} scope={scope} view={view} owners={owners} onChange={change} />
            {view === 'list' ? (
              <PlansList query={listQuery(params, scope)} filtered={isFiltered(params)} onClear={() => change(cleared(params))} />
            ) : (
              <PlansBoard params={params} scope={scope} onChange={change} />
            )}
          </>
        )}
      </div>
      {/* /projects/new: the New plan modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}
```

The house-rules suite looks for `<option.icon …>` as a Lucide tag only by imported names, so the dynamic `option.icon` passes; it is still hidden with `aria-hidden="true"`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/plans/PlansBoard.test.tsx src/pages/plans/ProjectsHome.test.tsx`
Expected: PASS (8 + 7 tests).

- [ ] **Step 6: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/components/plans/PlansBoard.tsx src/components/plans/PlansBoard.test.tsx src/pages/plans/ProjectsHome.tsx
git add src/components/plans/PlansBoard.tsx src/components/plans/PlansBoard.test.tsx src/pages/plans/ProjectsHome.tsx
git commit -m "feat(plans): the board, its moves, and the remembered view

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The New plan modal: record, template, review, Start plan

Spec §2.2 (routes, `BuilderDialog` frame, a scrim click keeps the draft; three steps in one scrolling modal; template cards with milestone count, task count and length; review fields and edits; Start plan submits once; 409 `PLAN_OPEN` with a link; field refusals at their fields, a refusal with no field takes focus; on success `/projects/:id`); Decisions 10, 17; Contract notes 9, 10, 11, 13.

**Files:**
- Create: `src/components/plans/useTemplates.ts`, `src/components/plans/usePlanRecord.ts`, `src/components/plans/fields.tsx`, `src/components/plans/RecordStep.tsx`, `src/components/plans/TemplateStep.tsx`, `src/components/plans/ReviewStep.tsx`, `src/pages/plans/NewPlan.tsx`
- Modify: `src/pages/plans/testPages.tsx` (the `/projects/new` route)
- Test: `src/pages/plans/NewPlan.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3 (`startPlan`, `fetchTemplates`, `fetchPlanRecord`, `searchPlanRecords`, `startDraft`, `withStart`, `assigneeOf`, `newTask`, `taskCount`, `toStart`, `checkStart`, `planErrors`, `hasErrors`, `NO_ERRORS`, `isPlanOpen`, `planOpenText`, `todayIso`, `lengthParts`, `CHECK`, `PRIORITIES`, `PRIORITY_LABEL`, `MILESTONES_MAX`, `TASKS_MAX`, `NAME_MAX`, `TASK_TITLE_MAX`); Task 4's `KindChip`, `RecordIcon`, `useSubmitOnce`; Task 5's `templateParam`, `renderPlans`; `Field` (`components/rules/Field`); `Parts` (`components/rules/Parts`); `BuilderDialog`; `useMembers`; `useSearchText`; `errorMessage`.
- Produces:
  - `useTemplates(version?) → [TemplatesLoad, retry]` with `TemplatesLoad = { status: 'loading' } | { status: 'failed'; message } | { status: 'ready'; lists: TemplateLists }`.
  - `usePlanRecord(target: { kind; id } | null) → { record: PlanRecord | null; error: string | null }`.
  - `fields.tsx`: `Aria`, `PersonSelect({ id, aria, value, people, onChange })`, `PrioritySelect({ id, aria, value, onChange })`.
  - `RecordStep({ record, locked, loading, error, onPick, onClear })`, `TemplateStep({ load, chosen, error, onPick, onRetry })`, `ReviewStep({ draft, people, recordOwner, errors, onChange })`. Milestone rows carry `data-milestone-draft={index}`, task rows `data-task-draft={index}`.
  - `NewPlanForm({ fixed, initialTemplate, onClose })` (exported for Task 11's `RecordPlanRoute`), `NewPlanRoute()` (`/projects/new`, `?template=`).

- [ ] **Step 1: Write the failing test**

Create `src/pages/plans/NewPlan.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const open = async (url = '/projects/new') => {
  renderPlans(url);
  return screen.findByRole('dialog', { name: 'New plan' });
};
async function pickRecord(modal: HTMLElement, search: string, group: 'Organisations' | 'Accounts', name: string) {
  await userEvent.type(within(modal).getByRole('searchbox', { name: 'Organisation or account' }), search);
  const list = await within(modal).findByRole('list', { name: group });
  await userEvent.click(within(list).getByRole('button', { name }));
}
async function pickTemplate(modal: HTMLElement, name: RegExp) {
  await userEvent.click(await within(modal).findByRole('radio', { name }));
}
const milestone = (modal: HTMLElement, index: number) => modal.querySelector(`[data-milestone-draft="${index}"]`) as HTMLElement;
const task = (row: HTMLElement, index: number) => row.querySelector(`[data-task-draft="${index}"]`) as HTMLElement;

describe('New plan (spec §2.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
    localStorage.clear();
  });

  it('opens over the list, finds a record by name, offers templates with their length, and reviews the copy', async () => {
    stubPlans();
    const modal = await open();
    expect(where()).toBe('/projects/new');
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    expect(modal.querySelector('[data-part="record"]')).toHaveTextContent('Initech');
    const onboarding = await within(modal).findByRole('radio', { name: /^Onboarding/ });
    expect(onboarding.closest('label')).toHaveTextContent('4 milestones · 7 tasks · 60 days');
    expect(within(modal).getByRole('group', { name: 'Yours' })).toHaveTextContent('Renewal prep');
    expect(within(modal).getByRole('group', { name: 'Shared with you' })).toHaveTextContent("Carl's expansion play");
    await userEvent.click(onboarding);
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Onboarding · Initech');
    await waitFor(() => expect(within(modal).getByRole('combobox', { name: 'Owner' })).toHaveDisplayValue('Alice'));
    expect(within(modal).getByLabelText('Start date')).toHaveValue('2026-10-04');
    const handoff = milestone(modal, 3);
    expect(within(handoff).getByRole('textbox', { name: 'Milestone' })).toHaveValue('Hand-off');
    expect(within(handoff).getByLabelText('Milestone due')).toHaveValue('2026-12-03');
    await waitFor(() => expect(within(task(handoff, 0)).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Carl CSM'));
    expect(within(task(handoff, 1)).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Alice');
    expect(modal).toHaveTextContent('4/12 milestones · 7/50 tasks');
  });

  it('starts the reviewed copy, edits and all, and opens the plan', async () => {
    const { spy } = stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await pickTemplate(modal, /^Onboarding/);
    const kickoff = milestone(modal, 0);
    await userEvent.clear(within(kickoff).getByRole('textbox', { name: 'Milestone' }));
    await userEvent.type(within(kickoff).getByRole('textbox', { name: 'Milestone' }), 'Kick-off call');
    await waitFor(() => expect(within(task(kickoff, 0)).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Carl CSM'));
    await userEvent.selectOptions(within(task(kickoff, 0)).getByRole('combobox', { name: 'Assignee' }), '1');
    fireEvent.change(within(milestone(modal, 1)).getByLabelText('Milestone due'), { target: { value: '2026-10-20' } });
    const value = milestone(modal, 2);
    await userEvent.click(within(value).getByRole('button', { name: 'Remove Review first results with the champion' }));
    await userEvent.click(within(value).getByRole('button', { name: 'Add task' }));
    await userEvent.type(within(task(value, 0)).getByRole('textbox', { name: 'Task' }), 'Book the review');
    await userEvent.selectOptions(within(task(value, 0)).getByRole('combobox', { name: 'Assignee' }), '5');
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(where()).toBe('/projects/500'));
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)[0].body).toEqual({
      template: 1,
      customer: 2,
      name: 'Onboarding · Initech',
      owner: 1,
      start_date: '2026-10-04',
      milestones: [
        {
          name: 'Kick-off call',
          due_date: '2026-10-04',
          tasks: [
            { title: 'Hold the kick-off call', priority: 'high', due_date: '2026-10-04', assignee: 1 },
            { title: 'Confirm goals and success criteria', priority: 'high', due_date: '2026-10-07', assignee: 4 },
          ],
        },
        {
          name: 'Set up',
          due_date: '2026-10-20',
          tasks: [
            { title: 'Connect data sources', priority: 'high', due_date: '2026-10-14', assignee: 4 },
            { title: "Invite the customer's team", priority: 'medium', due_date: '2026-10-18', assignee: 4 },
          ],
        },
        { name: 'First value', due_date: '2026-11-03', tasks: [{ title: 'Book the review', priority: 'medium', due_date: '2026-11-03', assignee: 5 }] },
        {
          name: 'Hand-off',
          due_date: '2026-12-03',
          tasks: [
            { title: 'Run the onboarding review', priority: 'medium', due_date: '2026-11-28', assignee: 4 },
            { title: 'Hand over to the account owner', priority: 'medium', due_date: '2026-12-03', assignee: 1 },
          ],
        },
      ],
    });
  });

  it('starts once however often Start plan is pressed', async () => {
    const { spy } = stubPlans({ start: () => new Promise(() => {}) });
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await pickTemplate(modal, /^QBR/);
    const start = within(modal).getByRole('button', { name: 'Start plan' });
    await userEvent.click(start);
    await userEvent.click(start);
    await userEvent.keyboard('{Enter}');
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)).toHaveLength(1);
    expect(within(modal).getByRole('button', { name: 'Starting…' })).toBeDisabled();
  });

  it('moves every date by the same days when the start date changes', async () => {
    stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await pickTemplate(modal, /^Onboarding/);
    fireEvent.change(within(modal).getByLabelText('Start date'), { target: { value: '2026-10-06' } });
    expect(within(milestone(modal, 3)).getByLabelText('Milestone due')).toHaveValue('2026-12-05');
    expect(within(task(milestone(modal, 0), 1)).getByLabelText('Due')).toHaveValue('2026-10-09');
  });

  it("says the record already has an open plan from that template, links to it, and focuses the sentence", async () => {
    stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Glo', 'Organisations', 'Globex');
    await pickTemplate(modal, /^Onboarding/);
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    const conflict = await within(modal).findByText('This record already has an open Onboarding plan.', { exact: false });
    const line = conflict.closest('[data-part="plan-open"]') as HTMLElement;
    expect(within(line).getByRole('link', { name: 'Open that plan' })).toHaveAttribute('href', '/projects/41');
    await waitFor(() => expect(line).toHaveFocus());
    expect(where()).toBe('/projects/new');
  });

  it('puts refusals at their fields and focuses the first', async () => {
    stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Glo', 'Organisations', 'Globex');
    await pickTemplate(modal, /^Success plan/);
    const owner = within(modal).getByRole('combobox', { name: 'Owner' });
    await waitFor(() => expect(owner).toHaveDisplayValue('Alice'));
    await userEvent.selectOptions(owner, '5');
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(owner).toHaveFocus());
    expect(owner).toHaveAttribute('aria-invalid', 'true');
    expect(owner.closest('div')).toHaveTextContent("They can't open this record.");
    await userEvent.selectOptions(owner, '1');
    const first = task(milestone(modal, 0), 0);
    await userEvent.selectOptions(within(first).getByRole('combobox', { name: 'Assignee' }), '5');
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(within(first).getByRole('combobox', { name: 'Assignee' })).toHaveFocus());
    expect(first).toHaveTextContent("They can't open this record.");
  });

  it('checks the name before asking', async () => {
    const { spy } = stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await pickTemplate(modal, /^QBR/);
    await userEvent.clear(within(modal).getByRole('textbox', { name: 'Name' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    expect(await within(modal).findByText('Give the plan a name.')).toBeInTheDocument();
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)).toHaveLength(0);
  });

  it('starts from the template Use chose', async () => {
    stubPlans();
    const modal = await open('/projects/new?template=3');
    expect(await within(modal).findByRole('radio', { name: /^Save plan/ })).toBeChecked();
  });

  it('keeps the draft on a scrim click; Cancel goes back to the list', async () => {
    stubPlans();
    const modal = await open();
    await pickRecord(modal, 'Ini', 'Organisations', 'Initech');
    await userEvent.click(document.querySelector('[data-scrim]') as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'New plan' })).toHaveTextContent('Initech');
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(where()).toBe('/projects'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/plans/NewPlan.test.tsx`
Expected: FAIL, no dialog named "New plan" (the route is not there yet).

- [ ] **Step 3: Write the hooks and the shared selects**

Create `src/components/plans/useTemplates.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { fetchTemplates } from '../../features/plans/planApi';
import type { TemplateLists } from '../../features/plans/planTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type TemplatesLoad = { status: 'loading' } | { status: 'failed'; message: string } | { status: 'ready'; lists: TemplateLists };

/** GET plans/templates/, again when `version` changes or on `retry`. */
export function useTemplates(version = 0): [TemplatesLoad, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${version}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: TemplatesLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTemplates().then(
      (lists) => {
        if (alive) setAnswer({ key, load: { status: 'ready', lists } });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key, load: { status: 'failed', message: errorMessage(err, 'Could not load templates.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, retry];
}
```

Create `src/components/plans/usePlanRecord.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchPlanRecord } from '../../features/plans/planApi';
import type { PlanRecord, RecordKind } from '../../features/plans/planTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** The chosen record's name and owner (Contract note 9); nothing while none is chosen. */
export function usePlanRecord(target: { kind: RecordKind; id: number } | null): { record: PlanRecord | null; error: string | null } {
  const kind = target?.kind ?? null;
  const id = target?.id ?? null;
  const key = kind && id !== null ? `${kind}:${id}` : '';
  const [answer, setAnswer] = useState<{ key: string; record: PlanRecord | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!kind || id === null) return;
    let alive = true;
    fetchPlanRecord(kind, id).then(
      (record) => {
        if (alive) setAnswer({ key: `${kind}:${id}`, record, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: `${kind}:${id}`, record: null, error: errorMessage(err, 'Could not load this record.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [kind, id]);
  return answer && answer.key === key ? { record: answer.record, error: answer.error } : { record: null, error: null };
}
```

Create `src/components/plans/fields.tsx`:

```tsx
import { PRIORITIES, PRIORITY_LABEL } from '../../features/plans/planOptions';
import type { PersonRef, Priority } from '../../features/plans/planTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';

/** What `Field` hands its control. */
export type Aria = { 'aria-describedby'?: string; 'aria-invalid': boolean };

/** Active teammates; a chosen person the list does not hold yet (the
 *  members still loading) stays chosen under a placeholder name. */
export function PersonSelect({ id, aria, value, people, onChange }: { id: string; aria: Aria; value: number; people: PersonRef[]; onChange: (id: number) => void }) {
  const options = people.some((person) => person.id === value) ? people : [{ id: value, name: 'Loading teammates' }, ...people];
  return (
    <select id={id} {...aria} value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${FILTER_SELECT} w-full ${aria['aria-invalid'] ? 'border-danger' : ''}`}>
      {options.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </select>
  );
}

export function PrioritySelect({ id, aria, value, onChange }: { id: string; aria: Aria; value: Priority; onChange: (priority: Priority) => void }) {
  return (
    <select id={id} {...aria} value={value} onChange={(event) => onChange(event.target.value as Priority)} className={`${FILTER_SELECT} w-full ${aria['aria-invalid'] ? 'border-danger' : ''}`}>
      {PRIORITIES.map((priority) => (
        <option key={priority} value={priority}>
          {PRIORITY_LABEL[priority]}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Write the three steps**

Create `src/components/plans/RecordStep.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { searchPlanRecords } from '../../features/plans/planApi';
import type { RecordKind, RecordRef } from '../../features/plans/planTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSearchText } from '../organizations/portfolio/useSearchText';
import { RecordIcon } from './parts';

const GROUPS: readonly { kind: RecordKind; label: string }[] = [
  { kind: 'organization', label: 'Organisations' },
  { kind: 'account', label: 'Accounts' },
];
type Answer = { search: string; rows: RecordRef[] } | { search: string; error: string };

/** 1. Record (spec §2.2): a search over organisations and accounts the
 *  person can open, 300 ms after typing stops; the latest answer wins.
 *  Locked when the modal opened over a record's page. */
export function RecordStep({ record, locked, loading, error, onPick, onClear }: {
  record: RecordRef | null;
  locked: boolean;
  loading: boolean;
  error?: string;
  onPick: (record: RecordRef) => void;
  onClear: () => void;
}) {
  const headingId = useId();
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [text, setText] = useSearchText(search, setSearch);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!search) return;
    let alive = true;
    searchPlanRecords(search).then(
      (rows) => {
        if (alive) setAnswer({ search, rows });
      },
      (err: unknown) => {
        if (alive) setAnswer({ search, error: errorMessage(err, 'Could not search.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [search]);
  const current = text.trim() && answer && answer.search === search ? answer : null;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-[15px] font-semibold text-ink">
        1. Record
      </h3>
      {record ? (
        <div data-part="record" className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
          <RecordIcon kind={record.kind} />
          <span className="font-semibold">{record.name}</span>
          <span className="text-[11px] text-ink-muted">{record.kind === 'organization' ? 'Organisation' : 'Account'}</span>
          {!locked ? (
            <button type="button" onClick={onClear} className={QUIET}>
              Change
            </button>
          ) : null}
        </div>
      ) : loading ? (
        <p className="text-[13px] text-ink-muted">Loading the record…</p>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={searchId} className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Organisation or account
          </label>
          <input
            id={searchId}
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search by name"
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${searchId}-error` : undefined}
            className={`${FILTER_SELECT} w-full placeholder:text-ink-muted sm:w-80 ${error ? 'border-danger' : ''}`}
          />
          {current && 'error' in current ? (
            <p role="alert" className="text-[11px] text-danger">
              {current.error}
            </p>
          ) : null}
          {current && 'rows' in current && current.rows.length === 0 ? <p className="text-[13px] text-ink-muted">No matches</p> : null}
          {current && 'rows' in current
            ? GROUPS.map((group) => {
                const rows = current.rows.filter((row) => row.kind === group.kind);
                if (rows.length === 0) return null;
                return (
                  <div key={group.kind} className="flex flex-col gap-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{group.label}</p>
                    <ul aria-label={group.label} className="flex flex-col">
                      {rows.map((row) => (
                        <li key={`${row.kind}-${row.id}`}>
                          <button
                            type="button"
                            onClick={() => {
                              onPick(row);
                              setText('');
                            }}
                            className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] text-ink hover:bg-subtle active:bg-line-subtle sm:min-h-9 ${FOCUS}`}
                          >
                            <RecordIcon kind={row.kind} />
                            {row.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            : null}
        </div>
      )}
      {error ? (
        <p id={`${searchId}-error`} role="alert" data-error tabIndex={-1} className={`text-[11px] text-danger ${FOCUS}`}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
```

Create `src/components/plans/TemplateStep.tsx`:

```tsx
import { useId } from 'react';
import { Check } from 'lucide-react';
import { lengthParts } from '../../features/plans/planText';
import type { PlanTemplate, TemplateLists } from '../../features/plans/planTypes';
import { FOCUS, QUIET } from '../organizations/portfolio/styles';
import { Parts } from '../rules/Parts';
import { KindChip } from './parts';
import type { TemplatesLoad } from './useTemplates';

const SECTIONS: readonly { key: keyof TemplateLists; label: string }[] = [
  { key: 'builtin', label: 'Built-in' },
  { key: 'mine', label: 'Yours' },
  { key: 'shared', label: 'Shared with you' },
];

/** A radio drawn as a card: the whole label is the target; chosen reads as
 *  a border, a fill and a check, not a colour alone. */
function TemplateCard({ name, template, checked, onChange }: { name: string; template: PlanTemplate; checked: boolean; onChange: () => void }) {
  return (
    <label
      data-template={template.id}
      className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
        checked ? 'border-accent bg-subtle' : 'border-line hover:border-line-strong'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{template.name}</span>
        <KindChip kind={template.kind} />
        {checked ? <Check className="h-4 w-4 shrink-0 text-ink" aria-hidden="true" /> : null}
      </span>
      <span className="text-[11px] text-ink-muted">
        <Parts parts={lengthParts(template)} />
      </span>
    </label>
  );
}

/** 2. Template (spec §2.2): the four built-in, then Yours and Shared with
 *  you, each card with its milestone count, task count and length. */
export function TemplateStep({ load, chosen, error, onPick, onRetry }: {
  load: TemplatesLoad;
  chosen: number | null;
  error?: string;
  onPick: (id: number) => void;
  onRetry: () => void;
}) {
  const headingId = useId();
  const name = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-[15px] font-semibold text-ink">
        2. Template
      </h3>
      {load.status === 'loading' ? (
        <div role="status" aria-label="Loading templates" className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((n) => (
            <span key={n} aria-hidden="true" className="block h-14 animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      ) : null}
      {load.status === 'failed' ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
          <span>{load.message}</span>
          <button type="button" onClick={onRetry} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : null}
      {load.status === 'ready'
        ? SECTIONS.map((section) => {
            const list = load.lists[section.key];
            if (list.length === 0) return null;
            return (
              <fieldset key={section.key} className="flex flex-col gap-2">
                <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{section.label}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.map((template) => (
                    <TemplateCard key={template.id} name={name} template={template} checked={chosen === template.id} onChange={() => onPick(template.id)} />
                  ))}
                </div>
              </fieldset>
            );
          })
        : null}
      {error ? (
        <p role="alert" data-error tabIndex={-1} className={`text-[11px] text-danger ${FOCUS}`}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
```

Create `src/components/plans/ReviewStep.tsx`:

```tsx
import { useId } from 'react';
import { Plus, X } from 'lucide-react';
import { assigneeOf, newTask, taskCount, withStart, type DraftMilestone, type DraftTask, type StartDraft } from '../../features/plans/planDraft';
import type { NestedErrors, PlanErrors } from '../../features/plans/planErrors';
import { MILESTONES_MAX, NAME_MAX, TASK_TITLE_MAX, TASKS_MAX } from '../../features/plans/planOptions';
import type { PersonRef } from '../../features/plans/planTypes';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { Field } from '../rules/Field';
import { PersonSelect, PrioritySelect } from './fields';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const ICON_BUTTON = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`;
const border = (error?: string) => (error ? 'border-danger' : 'border-line');
const NONE: NestedErrors = { field: {}, tasks: [] };

function ReviewTask({ index, task, assignee, people, errors, onChange, onRemove }: {
  index: number;
  task: DraftTask;
  assignee: number;
  people: PersonRef[];
  errors: Record<string, string>;
  onChange: (next: DraftTask) => void;
  onRemove: () => void;
}) {
  const titleId = useId();
  const assigneeId = useId();
  const dueId = useId();
  const priorityId = useId();
  return (
    <li data-task-draft={index} className="grid items-start gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem_7rem_auto]">
      <Field id={titleId} label="Task" error={errors.title}>
        {(aria) => (
          <input id={titleId} {...aria} value={task.title} maxLength={TASK_TITLE_MAX} onChange={(event) => onChange({ ...task, title: event.target.value })} className={`${INPUT} ${border(errors.title)}`} />
        )}
      </Field>
      <Field id={assigneeId} label="Assignee" error={errors.assignee}>
        {(aria) => <PersonSelect id={assigneeId} aria={aria} value={assignee} people={people} onChange={(id) => onChange({ ...task, assignee: id, role: null })} />}
      </Field>
      <Field id={dueId} label="Due" error={errors.due_date}>
        {(aria) => (
          <input id={dueId} {...aria} type="date" value={task.due_date} onChange={(event) => onChange({ ...task, due_date: event.target.value })} className={`${INPUT} ${MONO} ${border(errors.due_date)}`} />
        )}
      </Field>
      <Field id={priorityId} label="Priority" error={errors.priority}>
        {(aria) => <PrioritySelect id={priorityId} aria={aria} value={task.priority} onChange={(priority) => onChange({ ...task, priority })} />}
      </Field>
      <button type="button" onClick={onRemove} aria-label={`Remove ${task.title.trim() || 'this task'}`} className={`${ICON_BUTTON} self-end`}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function ReviewMilestone({ index, milestone, owner, people, recordOwner, canAdd, errors, onChange }: {
  index: number;
  milestone: DraftMilestone;
  owner: number;
  people: PersonRef[];
  recordOwner: number | null;
  canAdd: boolean;
  errors: NestedErrors;
  onChange: (next: DraftMilestone) => void;
}) {
  const nameId = useId();
  const dueId = useId();
  const setTask = (at: number, next: DraftTask) => onChange({ ...milestone, tasks: milestone.tasks.map((task, i) => (i === at ? next : task)) });
  return (
    <li data-milestone-draft={index} className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <Field id={nameId} label="Milestone" error={errors.field.name}>
          {(aria) => (
            <input id={nameId} {...aria} value={milestone.name} maxLength={NAME_MAX} onChange={(event) => onChange({ ...milestone, name: event.target.value })} className={`${INPUT} ${border(errors.field.name)}`} />
          )}
        </Field>
        <Field id={dueId} label="Milestone due" error={errors.field.due_date}>
          {(aria) => (
            <input
              id={dueId}
              {...aria}
              type="date"
              value={milestone.due_date}
              onChange={(event) => onChange({ ...milestone, due_date: event.target.value })}
              className={`${INPUT} ${MONO} ${border(errors.field.due_date)}`}
            />
          )}
        </Field>
      </div>
      {milestone.tasks.length > 0 ? (
        <ul aria-label={`Tasks in ${milestone.name.trim() || 'this milestone'}`} className="flex flex-col divide-y divide-line-subtle">
          {milestone.tasks.map((task, at) => (
            <ReviewTask
              key={task.key}
              index={at}
              task={task}
              assignee={assigneeOf(task, owner, recordOwner)}
              people={people}
              errors={errors.tasks[at] ?? {}}
              onChange={(next) => setTask(at, next)}
              onRemove={() => onChange({ ...milestone, tasks: milestone.tasks.filter((_, i) => i !== at) })}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-ink-muted">No tasks: it is marked done by hand.</p>
      )}
      <button type="button" onClick={() => onChange({ ...milestone, tasks: [...milestone.tasks, newTask(milestone)] })} disabled={!canAdd} className={`${QUIET} self-start`}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add task
      </button>
    </li>
  );
}

/** 3. Review (spec §2.2): the name, the owner and the start date; then each
 *  milestone with its computed due date and its tasks, each role resolved
 *  to a real person, all editable before the plan starts. */
export function ReviewStep({ draft, people, recordOwner, errors, onChange }: {
  draft: StartDraft;
  people: PersonRef[];
  recordOwner: number | null;
  errors: PlanErrors;
  onChange: (next: StartDraft) => void;
}) {
  const headingId = useId();
  const nameId = useId();
  const ownerId = useId();
  const startId = useId();
  const total = taskCount(draft);
  const setMilestone = (at: number, next: DraftMilestone) => onChange({ ...draft, milestones: draft.milestones.map((milestone, i) => (i === at ? next : milestone)) });
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-[15px] font-semibold text-ink">
        3. Review
      </h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem_11rem]">
        <Field id={nameId} label="Name" error={errors.field.name}>
          {(aria) => (
            <input id={nameId} {...aria} value={draft.name} maxLength={NAME_MAX} onChange={(event) => onChange({ ...draft, name: event.target.value })} className={`${INPUT} ${border(errors.field.name)}`} />
          )}
        </Field>
        <Field id={ownerId} label="Owner" error={errors.field.owner}>
          {(aria) => <PersonSelect id={ownerId} aria={aria} value={draft.owner} people={people} onChange={(owner) => onChange({ ...draft, owner })} />}
        </Field>
        <Field id={startId} label="Start date" error={errors.field.start_date}>
          {(aria) => (
            <input id={startId} {...aria} type="date" value={draft.start_date} onChange={(event) => onChange(withStart(draft, event.target.value))} className={`${INPUT} ${MONO} ${border(errors.field.start_date)}`} />
          )}
        </Field>
      </div>
      <p data-part="counts" className="text-[11px] text-ink-muted">
        <span className={MONO}>
          {draft.milestones.length}/{MILESTONES_MAX}
        </span>{' '}
        milestones · <span className={MONO}>{total}/{TASKS_MAX}</span> tasks
      </p>
      {errors.field.milestones ? (
        <p role="alert" data-error tabIndex={-1} className={`text-[11px] text-danger ${FOCUS}`}>
          {errors.field.milestones}
        </p>
      ) : null}
      <ol aria-label="Milestones to start" className="flex flex-col gap-3">
        {draft.milestones.map((milestone, at) => (
          <ReviewMilestone
            key={milestone.key}
            index={at}
            milestone={milestone}
            owner={draft.owner}
            people={people}
            recordOwner={recordOwner}
            canAdd={total < TASKS_MAX}
            errors={errors.milestones[at] ?? NONE}
            onChange={(next) => setMilestone(at, next)}
          />
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 5: Write the modal and its route**

Create `src/pages/plans/NewPlan.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { useMembers } from '../../features/knowledge/useMembers';
import { startPlan } from '../../features/plans/planApi';
import { checkStart, startDraft, toStart, type StartDraft } from '../../features/plans/planDraft';
import { hasErrors, isPlanOpen, NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { CHECK } from '../../features/plans/planOptions';
import { templateParam } from '../../features/plans/planParams';
import { planOpenText, todayIso } from '../../features/plans/planText';
import type { PersonRef, RecordKind, RecordRef } from '../../features/plans/planTypes';
import { FOCUS, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { RecordStep } from '../../components/plans/RecordStep';
import { ReviewStep } from '../../components/plans/ReviewStep';
import { TemplateStep } from '../../components/plans/TemplateStep';
import { usePlanRecord } from '../../components/plans/usePlanRecord';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { useTemplates } from '../../components/plans/useTemplates';
import { BuilderDialog } from '../../components/segments/BuilderDialog';

const START_FIELDS = ['name', 'owner', 'start_date', 'template', 'customer', 'account', 'milestones'] as const;

/** The New plan modal (spec §2.2): record, template and review in one
 *  scrolling dialog. `fixed` is the record a record's page opened it over
 *  (locked). A change of record or template rebuilds the review. */
export function NewPlanForm({ fixed, initialTemplate, onClose }: {
  fixed: { kind: RecordKind; id: number } | null;
  initialTemplate: number | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const me = useAppSelector((state) => state.auth.user?.id ?? 0);
  const members = useMembers();
  const people = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active).map(({ id, name }) => ({ id, name })), [members]);
  const [picked, setPicked] = useState<RecordRef | null>(null);
  const loaded = usePlanRecord(fixed ?? picked);
  const record: RecordRef | null = loaded.record ?? picked;
  const owned = loaded.record?.owner ?? null;
  const recordOwner = owned && people.some((person) => person.id === owned.id) ? owned.id : null;
  const [templatesLoad, retryTemplates] = useTemplates();
  const [templateId, setTemplateId] = useState<number | null>(initialTemplate);
  const lists = templatesLoad.status === 'ready' ? templatesLoad.lists : null;
  const template = lists ? ([...lists.builtin, ...lists.mine, ...lists.shared].find((one) => one.id === templateId) ?? null) : null;

  const draftKey = record && template ? `${record.kind}:${record.id}:${template.id}` : '';
  const [draft, setDraft] = useState<{ key: string; value: StartDraft } | null>(null);
  if (draftKey && record && template && draft?.key !== draftKey) {
    setDraft({ key: draftKey, value: startDraft(template, record, me, todayIso()) });
  }
  const review = draft && draft.key === draftKey ? draft.value : null;

  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const [conflict, setConflict] = useState<{ planId: number; name: string } | null>(null);
  const { busy, run } = useSubmitOnce();
  const [focusTick, setFocusTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusTick === 0) return;
    bodyRef.current?.querySelector<HTMLElement>('[data-error], [aria-invalid="true"]')?.focus();
  }, [focusTick]);
  const refuse = (found: PlanErrors) => {
    setErrors(found);
    setFocusTick((n) => n + 1);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setConflict(null);
    const found: PlanErrors = review ? checkStart(review) : { field: {}, milestones: [] };
    if (!record) found.field.record = CHECK.RECORD;
    if (!template) found.field.template = CHECK.TEMPLATE;
    if (hasErrors(found) || !review || !record || !template) {
      refuse(found);
      return;
    }
    setErrors(NO_ERRORS);
    const outcome = await run(() => startPlan(toStart(review, template.id, record, recordOwner)));
    if (!outcome) return;
    if (outcome.ok) {
      navigate(`/projects/${outcome.value.id}`);
      return;
    }
    if (isPlanOpen(outcome.error)) {
      setConflict({ planId: outcome.error.body.plan_id, name: template.name });
      setFocusTick((n) => n + 1);
      return;
    }
    refuse(planErrors(outcome.error, START_FIELDS, 'Could not start this plan. Try again.'));
  }

  return (
    <BuilderDialog title="New plan" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} data-part="builder-body" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4">
          {conflict ? (
            <p role="alert" data-part="plan-open" data-error tabIndex={-1} className={`flex flex-wrap items-center gap-x-2 text-[13px] text-danger ${FOCUS}`}>
              {planOpenText(conflict.name)}
              <Link to={`/projects/${conflict.planId}`} className={`inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`}>
                Open that plan
              </Link>
            </p>
          ) : null}
          {errors.form ? (
            <p role="alert" data-error tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
              {errors.form}
            </p>
          ) : null}
          <RecordStep
            record={record}
            locked={fixed !== null}
            loading={fixed !== null && !loaded.record && !loaded.error}
            error={errors.field.record ?? errors.field.customer ?? errors.field.account ?? loaded.error ?? undefined}
            onPick={(next) => {
              setPicked(next);
              setConflict(null);
            }}
            onClear={() => setPicked(null)}
          />
          <TemplateStep
            load={templatesLoad}
            chosen={templateId}
            error={errors.field.template}
            onPick={(id) => {
              setTemplateId(id);
              setConflict(null);
            }}
            onRetry={retryTemplates}
          />
          {review ? (
            <ReviewStep draft={review} people={people} recordOwner={recordOwner} errors={errors} onChange={(value) => setDraft({ key: draftKey, value })} />
          ) : (
            <p className="text-[13px] text-ink-muted">Choose a record and a template, and the plan's milestones show here to review.</p>
          )}
        </div>
        <div data-part="builder-footer" className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !review} className={PRIMARY}>
            {busy ? 'Starting…' : 'Start plan'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

/** /projects/new over the list; `?template=` from Templates' Use. */
export function NewPlanRoute() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  return <NewPlanForm fixed={null} initialTemplate={templateParam(search)} onClose={() => navigate('/projects')} />;
}
```

- [ ] **Step 6: Route it in the test render**

In `src/pages/plans/testPages.tsx`, add `import { NewPlanRoute } from './NewPlan';` and, inside the layout route under `<Route path="/projects" element={null} />`, add:

```tsx
              <Route path="/projects/new" element={<NewPlanRoute />} />
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/pages/plans/NewPlan.test.tsx`
Expected: PASS (9 tests). The third test's third press is Enter on the focused button; it must not post a second time.

- [ ] **Step 8: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/components/plans/useTemplates.ts src/components/plans/usePlanRecord.ts src/components/plans/fields.tsx src/components/plans/RecordStep.tsx src/components/plans/TemplateStep.tsx src/components/plans/ReviewStep.tsx src/pages/plans/NewPlan.tsx src/pages/plans/testPages.tsx src/pages/plans/NewPlan.test.tsx
git add src/components/plans/useTemplates.ts src/components/plans/usePlanRecord.ts src/components/plans/fields.tsx src/components/plans/RecordStep.tsx src/components/plans/TemplateStep.tsx src/components/plans/ReviewStep.tsx src/pages/plans/NewPlan.tsx src/pages/plans/testPages.tsx src/pages/plans/NewPlan.test.tsx
git commit -m "feat(plans): the New plan modal: record, template, review, start once

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The plan page: header, status, timeline, ticks, Cancel and Delete

Spec §2.3 (header with record, kind, owner, start → target in mono, a status select for editors and a pill for everyone else, the ⋯ menu with Cancel plan and Delete only when nothing is completed, "Started by <rule>"; the timeline with each milestone's name, due date, done check, progress and tasks with checkbox, title, assignee, due date and priority; "N tasks you can't see"; Overdue with an icon and the word; Cancel and Delete confirms; done or cancelled notice with only task checkboxes active; skeleton; 404 copy); Decision 9; Contract notes 6, 16.

**Files:**
- Create: `src/components/plans/usePlan.ts`, `src/components/plans/PlanStates.tsx`, `src/components/plans/PlanHeader.tsx`, `src/components/plans/Timeline.tsx`, `src/pages/plans/PlanPage.tsx`
- Modify: `src/pages/plans/testPages.tsx` (the `/projects/:id` route)
- Test: `src/pages/plans/PlanPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4 (`fetchPlan`, `updatePlan`, `deletePlan`, `updateMilestone`, `updateTask`, `planErrors`, `firstError`, `SAY`, `STATUS_LABEL`, `PRIORITY_LABEL`, `allMilestonesDone`, `dateRange`, `finishedNotice`, `hiddenTasks`, `isOpen`, `progress`, `shortDay`, parts, `useSubmitOnce`); `ConfirmDialog`; `Menu`; `EmptyState`, `ErrorBlock`; `FILTER_SELECT`; `BUTTON`, `FOCUS`, `MONO`, `QUIET`; `formatDate`; `OrganizationsFrame`.
- Produces: `usePlan(id) → [PlanLoad, replace(plan), retry()]`; `PlanLoading`, `PlanMissing`, `PlanFailed`; `PlanHeader({ plan, onReplace })` (Task 9 adds `editing`/`onEdit`, Task 10 adds Save as template); `Timeline({ plan, onReplace })` (Task 9 adds editing); `PlanPage()`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/plans/PlanPage.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { PIZZA_EMEA_SAVE, stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const milestone = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('li') as HTMLElement;
const open = async (id: number) => {
  renderPlans(`/projects/${id}`);
  return screen.findByRole('heading', { level: 1 });
};

describe('a plan (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("heads the page with its record, kind, owner, dates and the editor's status select", async () => {
    stubPlans();
    expect(await open(41)).toHaveTextContent('Onboarding · Globex');
    const meta = document.querySelector('[data-part="meta"]') as HTMLElement;
    expect(within(meta).getByRole('link', { name: 'Globex' })).toHaveAttribute('href', '/organizations/1');
    expect(meta).toHaveTextContent('Onboarding');
    expect(meta).toHaveTextContent('Alice');
    expect(meta.querySelector('.font-mono-brand')).toHaveTextContent('20 Sep 2026 → 19 Nov 2026');
    const status = screen.getByRole('combobox', { name: 'Status' });
    expect(status).toHaveDisplayValue('On track');
    expect(within(status).getByRole('option', { name: 'Done' })).toBeDisabled();
  });

  it('lays the milestones down the page with their dates, progress, tasks and hidden counts', async () => {
    stubPlans();
    await open(41);
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Kick-off', 'Set up', 'First value', 'Hand-off']);
    expect(within(milestone('Kick-off')).getByRole('checkbox', { name: 'Kick-off done' })).toBeChecked();
    const setUp = milestone('Set up');
    expect(setUp).toHaveTextContent('4 Oct 2026');
    expect(setUp).toHaveTextContent('0/2 tasks done');
    const invite = within(setUp).getByRole('checkbox', { name: "Invite the customer's team" }).closest('li') as HTMLElement;
    expect(invite).toHaveTextContent('Carl CSM');
    expect(invite).toHaveTextContent('Medium');
    expect(invite.querySelector('.font-mono-brand')).toHaveTextContent('4 Oct');
    expect(within(milestone('Kick-off')).getByRole('checkbox', { name: 'Hold the kick-off call' })).toBeChecked();
    expect(milestone('Hand-off').querySelector('[data-part="hidden"]')).toHaveTextContent("1 task you can't see");
  });

  it('ticks a task, and the plan goes on track', async () => {
    const { spy } = stubPlans();
    await open(43);
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Not started');
    await userEvent.click(screen.getByRole('checkbox', { name: "Pull the quarter's usage and outcomes" }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('On track'));
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/tasks\/4311\/$/)[0].body).toEqual({ status: 'completed' });
  });

  it('marks a milestone done by hand', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Meet done' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Meet done' })).toBeChecked());
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/milestones\/432\/$/)[0].body).toEqual({ done: true });
  });

  it("shows a reader the status as a pill, the overdue milestones, and lets them tick only their own task", async () => {
    const { spy } = stubPlans();
    await open(42);
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(document.querySelector('[data-status="at_risk"]')).toHaveTextContent('At risk');
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Act done' })).toBeNull();
    expect(milestone('Act').querySelector('[data-part="overdue"]')).toHaveTextContent('Overdue');
    expect(milestone('Act').querySelector('[data-part="hidden"]')).toHaveTextContent("2 tasks you can't see");
    expect(milestone('Diagnose').querySelector('[data-part="overdue"]')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Check health and usage have recovered' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Write down the root cause' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Write down the root cause' })).toBeChecked());
    expect(requestsOf(spy, 'PATCH', /^\/plans\/42\/tasks\/4212\/$/)).toHaveLength(1);
  });

  it("changes the status from the select, and shows the server's refusal", async () => {
    const { spy } = stubPlans();
    await open(41);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'at_risk');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('At risk'));
    expect(requestsOf(spy, 'PATCH', /^\/plans\/41\/$/)[0].body).toEqual({ status: 'at_risk' });
    vi.unstubAllGlobals();
    stubPlans({ patch: () => ({ status: 403, body: { detail: "Only the plan's owner or their managers can change it." } }) });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'on_track');
    expect(await screen.findByRole('alert')).toHaveTextContent("Only the plan's owner or their managers can change it.");
  });

  it('cancels a plan after asking; its tasks can still be ticked', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cancel plan' }));
    expect(screen.getByText("Its open tasks stay on their owners' lists.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel plan' }));
    expect(await screen.findByText("This plan was cancelled. Its open tasks stay on their owners' lists, and only tasks can still be ticked.")).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/$/)[0].body).toEqual({ status: 'cancelled' });
    expect(document.querySelector('[data-status="cancelled"]')).not.toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Draft the deck' })).toBeEnabled();
    expect(screen.queryByRole('checkbox', { name: 'Meet done' })).toBeNull();
  });

  it('deletes a plan with nothing done after asking, and offers no Delete once work is done', async () => {
    const { spy } = stubPlans();
    const first = renderPlans('/projects/41');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
    first.unmount();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/projects'));
    expect(requestsOf(spy, 'DELETE', /^\/plans\/43\/$/)).toHaveLength(1);
  });

  it('says to cancel instead when work was done meanwhile', async () => {
    stubPlans({ remove: () => ({ status: 409, body: { code: 'PLAN_HAS_DONE_WORK', detail: 'Cancel it instead: some of its work is done.' } }) });
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Cancel it instead: some of its work is done.')).toBeInTheDocument();
    expect(where()).toBe('/projects/43');
  });

  it.each(['/projects/46', '/projects/abc'])('reads %s as a plan that does not exist or cannot be opened', async (url) => {
    stubPlans();
    renderPlans(url);
    expect(await screen.findByText('Plan not found')).toBeInTheDocument();
    expect(screen.getByText("This plan doesn't exist or you can't open its record.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All plans' })).toHaveAttribute('href', '/projects');
  });

  it('names the rule that started a plan, linked only when the reader may read it', async () => {
    stubPlans();
    const first = renderPlans('/projects/47');
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: 'Save at-risk renewals' })).toHaveAttribute('href', '/scenarios/rules/10');
    first.unmount();
    vi.unstubAllGlobals();
    stubPlans({ plans: [{ ...PIZZA_EMEA_SAVE, started_by_rule: { id: null, name: 'a rule' } }] });
    await open(47);
    expect(document.querySelector('[data-part="started-by"]')).toHaveTextContent('Started by a rule');
    expect(screen.queryByRole('link', { name: 'a rule' })).toBeNull();
  });

  it('marks a done plan read-only apart from its tasks', async () => {
    const { spy } = stubPlans();
    await open(44);
    expect(screen.getByText('This plan is done. Only its tasks can still be ticked.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Review done' })).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Run the quarterly success review' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Run the quarterly success review' })).not.toBeChecked());
    expect(requestsOf(spy, 'PATCH', /^\/plans\/44\/tasks\/4441\/$/)[0].body).toEqual({ status: 'pending' });
  });

  it('shows a skeleton timeline while the plan loads', async () => {
    stubPlans();
    renderPlans('/projects/41');
    expect(screen.getByRole('status', { name: 'Loading plan' })).toBeInTheDocument();
    await screen.findByRole('heading', { level: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/plans/PlanPage.test.tsx`
Expected: FAIL, no level-1 heading (`/projects/:id` is not routed yet).

- [ ] **Step 3: Write the hook and the states**

Create `src/components/plans/usePlan.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { fetchPlan } from '../../features/plans/planApi';
import type { Plan } from '../../features/plans/planTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

export type PlanLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; plan: Plan };

/** One plan, read for the reader: `missing` for a 404, the same for a plan
 *  that does not exist and one on a record they can't open (spec §1.3).
 *  `replace` swaps in the plan a write answered with; `retry` reads again. */
export function usePlan(id: number): [PlanLoad, (plan: Plan) => void, () => void] {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: PlanLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchPlan(id).then(
      (plan) => {
        if (alive) setAnswer({ key, load: { status: 'ready', plan } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this plan.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((plan: Plan) => setAnswer({ key, load: { status: 'ready', plan } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return [answer?.key === key ? answer.load : { status: 'loading' }, replace, retry];
}
```

Create `src/components/plans/PlanStates.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { SAY } from '../../features/plans/planOptions';
import { EmptyState, ErrorBlock } from '../organizations/portfolio/PortfolioSections';
import { QUIET } from '../organizations/portfolio/styles';

/** A skeleton in the timeline's shape: the header, then three milestones. */
export function PlanLoading() {
  return (
    <div role="status" aria-label="Loading plan" className="flex flex-col gap-6">
      <div aria-hidden="true" className="flex flex-col gap-2">
        <span className="block h-6 w-64 animate-pulse rounded bg-subtle" />
        <span className="block h-3 w-80 animate-pulse rounded bg-subtle" />
      </div>
      <ol aria-hidden="true" className="flex flex-col gap-6 border-l border-line pl-5">
        {[0, 1, 2].map((n) => (
          <li key={n} className="flex flex-col gap-2">
            <span className="block h-4 w-40 animate-pulse rounded bg-subtle" />
            <span className="block h-16 animate-pulse rounded-xl bg-subtle" />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A 404: missing and on a record the reader can't open read the same. */
export function PlanMissing() {
  return (
    <EmptyState
      title="Plan not found"
      detail={SAY.NOT_FOUND}
      action={
        <Link to="/projects" className={`${QUIET} border border-line`}>
          All plans
        </Link>
      }
    />
  );
}

export function PlanFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorBlock message={message} onRetry={onRetry} />;
}
```

- [ ] **Step 4: Write the header**

Create `src/components/plans/PlanHeader.tsx`:

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ellipsis, Info } from 'lucide-react';
import { deletePlan, updatePlan } from '../../features/plans/planApi';
import { firstError, planErrors } from '../../features/plans/planErrors';
import { STATUS_LABEL } from '../../features/plans/planOptions';
import { allMilestonesDone, dateRange, finishedNotice, isOpen } from '../../features/plans/planText';
import type { Plan, SettableStatus } from '../../features/plans/planTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { Menu, type MenuItem } from '../organizations/detail/Menu';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { KindChip, OwnerName, RecordLink, StatusPill } from './parts';
import { useSubmitOnce } from './useSubmitOnce';

const MENU_BUTTON = `inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:bg-subtle active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`;

/** The plan's header (spec §2.3, Decision 9). */
export function PlanHeader({ plan, onReplace }: { plan: Plan; onReplace: (plan: Plan) => void }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce();
  const open = isOpen(plan.status);
  const notice = finishedNotice(plan.status);

  async function setStatus(next: SettableStatus) {
    setStatusError(null);
    const outcome = await run(() => updatePlan(plan.id, { status: next }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setStatusError(firstError(planErrors(outcome.error, ['status'], 'Could not change the status.')));
  }

  const items: MenuItem[] = [
    ...(open ? [{ key: 'cancel', label: 'Cancel plan', onSelect: () => setConfirm('cancel'), danger: true }] : []),
    ...(plan.can_delete ? [{ key: 'delete', label: 'Delete', onSelect: () => setConfirm('delete'), danger: true }] : []),
  ];

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 basis-full break-words text-[22px] font-semibold text-ink sm:basis-auto">{plan.name}</h1>
        <div data-part="actions" className="flex flex-wrap items-center gap-2">
          {plan.can_edit && open ? (
            <select aria-label="Status" value={plan.status} disabled={busy} onChange={(event) => void setStatus(event.target.value as SettableStatus)} className={FILTER_SELECT}>
              {plan.status === 'not_started' ? (
                <option value="not_started" disabled>
                  {STATUS_LABEL.not_started}
                </option>
              ) : null}
              <option value="on_track">{STATUS_LABEL.on_track}</option>
              <option value="at_risk">{STATUS_LABEL.at_risk}</option>
              <option value="done" disabled={!allMilestonesDone(plan)}>
                {STATUS_LABEL.done}
              </option>
            </select>
          ) : (
            <StatusPill status={plan.status} />
          )}
          {plan.can_edit && items.length > 0 ? (
            <Menu label="More actions" trigger={<Ellipsis className="h-4 w-4" aria-hidden="true" />} triggerClassName={MENU_BUTTON} items={items} />
          ) : null}
        </div>
      </div>
      <div data-part="meta" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RecordLink record={plan.record} />
        <KindChip kind={plan.kind} />
        <OwnerName person={plan.owner} />
        <span className={`${MONO} text-[13px] text-ink-muted`}>{dateRange(plan.start_date, plan.target_date)}</span>
      </div>
      {plan.started_by_rule ? (
        <p data-part="started-by" className="text-[11px] text-ink-muted">
          Started by{' '}
          {plan.started_by_rule.id !== null ? (
            <Link to={`/scenarios/rules/${plan.started_by_rule.id}`} className={`inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`}>
              {plan.started_by_rule.name}
            </Link>
          ) : (
            plan.started_by_rule.name
          )}
        </p>
      ) : null}
      {statusError ? (
        <p role="alert" className="text-[13px] text-danger">
          {statusError}
        </p>
      ) : null}
      {notice ? (
        <p role="status" data-part="finished" className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-[13px] text-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      ) : null}
      {confirm === 'cancel' ? (
        <ConfirmDialog
          title={`Cancel ${plan.name}?`}
          message="Its open tasks stay on their owners' lists."
          confirmLabel="Cancel plan"
          danger
          onConfirm={async () => {
            try {
              onReplace(await updatePlan(plan.id, { status: 'cancelled' }));
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw firstError(planErrors(err, [], 'Could not cancel this plan.'));
            }
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'delete' ? (
        <ConfirmDialog
          title={`Delete ${plan.name}?`}
          message="Its milestones and tasks are deleted with it."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deletePlan(plan.id);
            } catch (err) {
              throw firstError(planErrors(err, [], 'Could not delete this plan.'));
            }
            navigate('/projects');
          }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </header>
  );
}
```

- [ ] **Step 5: Write the timeline and the page**

Create `src/components/plans/Timeline.tsx`:

```tsx
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Flag } from 'lucide-react';
import { formatDate } from '../../features/customers/formatters';
import { updateMilestone, updateTask } from '../../features/plans/planApi';
import { firstError, planErrors } from '../../features/plans/planErrors';
import { PRIORITY_LABEL } from '../../features/plans/planOptions';
import { hiddenTasks, isOpen, progress, shortDay } from '../../features/plans/planText';
import type { Milestone, Plan, PlanTask } from '../../features/plans/planTypes';
import { MONO } from '../organizations/portfolio/styles';
import { useSubmitOnce } from './useSubmitOnce';

/** A task (spec §2.3): its checkbox for the assignee, the creator or an
 *  editor (`can_check`), even on a finished plan; title, assignee, due date
 *  in DM Mono, priority as a word and a flag. */
function TaskRow({ plan, task, onReplace }: { plan: Plan; task: PlanTask; onReplace: (plan: Plan) => void }) {
  const { busy, run } = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  const done = task.status === 'completed';
  async function toggle() {
    setError(null);
    const outcome = await run(() => updateTask(plan.id, task.id, { status: done ? 'pending' : 'completed' }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setError(firstError(planErrors(outcome.error, [], 'Could not update this task.')));
  }
  return (
    <li data-task={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <label className="flex min-h-11 min-w-0 flex-1 basis-56 cursor-pointer items-center gap-2 sm:min-h-9">
        <input type="checkbox" checked={done} disabled={!task.can_check || busy} onChange={() => void toggle()} />
        <span className={`min-w-0 text-[13px] ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>{task.title}</span>
      </label>
      <span className="text-[11px] text-ink-muted">{task.assignee?.name ?? 'Unassigned'}</span>
      <span className={`${MONO} text-[11px] text-ink-muted`}>{shortDay(task.due_date)}</span>
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        {PRIORITY_LABEL[task.priority]}
      </span>
      {error ? (
        <p role="alert" className="basis-full text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** A milestone (spec §2.3): name, due date, Overdue as an icon and a word,
 *  its progress, the editors' done check, its tasks and the hidden count. */
function MilestoneItem({ plan, milestone, onReplace }: { plan: Plan; milestone: Milestone; onReplace: (plan: Plan) => void }) {
  const { busy, run } = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  const done = milestone.done_at !== null;
  const editable = plan.can_edit && isOpen(plan.status);
  const hidden = hiddenTasks(milestone.hidden_tasks);
  async function mark(next: boolean) {
    setError(null);
    const outcome = await run(() => updateMilestone(plan.id, milestone.id, { done: next }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setError(firstError(planErrors(outcome.error, [], 'Could not update this milestone.')));
  }
  return (
    <li data-milestone={milestone.id} className="relative flex flex-col gap-2">
      <span aria-hidden="true" className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${done ? 'bg-success' : 'bg-line-strong'}`} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="min-w-0 flex-1 basis-40 text-[15px] font-semibold text-ink">{milestone.name}</h2>
        <span className={`${MONO} text-[13px] text-ink-muted`}>{formatDate(milestone.due_date)}</span>
        {milestone.is_overdue ? (
          <span data-part="overdue" className="inline-flex items-center gap-1 text-[13px] font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Overdue
          </span>
        ) : null}
        <span className="text-[11px] text-ink-muted">
          <span className={MONO}>{progress(milestone.tasks_done, milestone.tasks_total)}</span> tasks done
        </span>
        {editable ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-ink sm:min-h-9">
            <input type="checkbox" aria-label={`${milestone.name} done`} checked={done} disabled={busy} onChange={(event) => void mark(event.target.checked)} />
            Done
          </label>
        ) : done ? (
          <span className="inline-flex items-center gap-1 text-[13px] text-ink">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            Done
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
      {milestone.tasks.length > 0 ? (
        <ul aria-label={`Tasks in ${milestone.name}`} className="flex flex-col divide-y divide-line-subtle rounded-xl bg-surface">
          {milestone.tasks.map((task) => (
            <TaskRow key={task.id} plan={plan} task={task} onReplace={onReplace} />
          ))}
        </ul>
      ) : milestone.hidden_tasks === 0 ? (
        <p className="text-[11px] text-ink-muted">No tasks.</p>
      ) : null}
      {hidden.n > 0 ? (
        <p data-part="hidden" className="text-[11px] text-ink-muted">
          <span className={MONO}>{hidden.n}</span> {hidden.text}
        </p>
      ) : null}
    </li>
  );
}

/** The milestones in order down the page, joined by a vertical line. */
export function Timeline({ plan, onReplace }: { plan: Plan; onReplace: (plan: Plan) => void }) {
  return (
    <ol aria-label="Milestones" className="flex flex-col gap-6 border-l border-line pl-5">
      {plan.milestones.map((milestone) => (
        <MilestoneItem key={milestone.id} plan={plan} milestone={milestone} onReplace={onReplace} />
      ))}
    </ol>
  );
}
```

Create `src/pages/plans/PlanPage.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import type { Plan } from '../../features/plans/planTypes';
import { PlanHeader } from '../../components/plans/PlanHeader';
import { PlanFailed, PlanLoading, PlanMissing } from '../../components/plans/PlanStates';
import { Timeline } from '../../components/plans/Timeline';
import { usePlan } from '../../components/plans/usePlan';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

/** /projects/:id (spec §2.3). */
export function PlanPage() {
  const { id } = useParams();
  if (!id || !/^\d+$/.test(id)) {
    return (
      <OrganizationsFrame>
        <PlanMissing />
      </OrganizationsFrame>
    );
  }
  return <LoadedPlan key={id} id={Number(id)} />;
}

function LoadedPlan({ id }: { id: number }) {
  const [load, replace, retry] = usePlan(id);
  if (load.status === 'ready') return <PlanView plan={load.plan} onReplace={replace} />;
  return (
    <OrganizationsFrame>
      {load.status === 'loading' ? <PlanLoading /> : null}
      {load.status === 'missing' ? <PlanMissing /> : null}
      {load.status === 'failed' ? <PlanFailed message={load.message} onRetry={retry} /> : null}
    </OrganizationsFrame>
  );
}

function PlanView({ plan, onReplace }: { plan: Plan; onReplace: (plan: Plan) => void }) {
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-6 pb-6">
        <PlanHeader plan={plan} onReplace={onReplace} />
        <Timeline plan={plan} onReplace={onReplace} />
      </div>
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 6: Route it in the test render**

In `src/pages/plans/testPages.tsx`, add `import { PlanPage } from './PlanPage';` and, at the `{/* ROUTES … */}` marker, add:

```tsx
            <Route
              path="/projects/:id"
              element={
                <>
                  <PlanPage />
                  <Where />
                </>
              }
            />
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/pages/plans/PlanPage.test.tsx`
Expected: PASS (14 tests). In "changes the status… refusal", the second `stubPlans` replaces `fetch` mid-test; the page keeps the plan it already holds.

- [ ] **Step 8: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/components/plans/usePlan.ts src/components/plans/PlanStates.tsx src/components/plans/PlanHeader.tsx src/components/plans/Timeline.tsx src/pages/plans/PlanPage.tsx src/pages/plans/testPages.tsx src/pages/plans/PlanPage.test.tsx
git add src/components/plans/usePlan.ts src/components/plans/PlanStates.tsx src/components/plans/PlanHeader.tsx src/components/plans/Timeline.tsx src/pages/plans/PlanPage.tsx src/pages/plans/testPages.tsx src/pages/plans/PlanPage.test.tsx
git commit -m "feat(plans): the plan page: header, status, timeline, ticks, cancel and delete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Editing a plan in place: milestones and tasks

Spec §2.3 ("+ Add task" for editors; Edit: milestone and task edits inline: rename, re-date, reorder with up and down buttons (no drag), remove with a confirmation), §1.1 limits; Decision 8.

**Files:**
- Create: `src/components/plans/MilestoneEditor.tsx`, `src/components/plans/TaskEditor.tsx`
- Modify: `src/components/plans/Timeline.tsx` (replaced), `src/components/plans/PlanHeader.tsx` (Edit), `src/pages/plans/PlanPage.tsx` (the editing state)
- Test: `src/pages/plans/PlanEdit.test.tsx`

**Interfaces:**
- Consumes: Task 2's `addMilestone`, `updateMilestone`, `deleteMilestone`, `reorderMilestones`, `addTask`, `updateTask`, `deleteTask`; Task 3's `planErrors`, `NO_ERRORS`, `firstError`; Task 7's `PersonSelect`, `PrioritySelect`; Task 8's header, timeline and page; `Field`; `ConfirmDialog`; `useMembers`; `CHECK`, `MILESTONES_MAX`, `TASKS_MAX`, `NAME_MAX`, `TASK_TITLE_MAX`.
- Produces: `MilestoneEditor({ plan, milestone, index, onReplace })`, `AddMilestone({ plan, onReplace })`, `TaskEditor({ plan, milestoneId, task, onDone, onReplace })`; `Timeline({ plan, editing, onReplace })`; `PlanHeader({ plan, editing, onEdit, onReplace })`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/plans/PlanEdit.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

const milestone = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('li') as HTMLElement;
const editForms = () => screen.queryAllByRole('form').map((form) => form.getAttribute('aria-label')).filter((name) => name?.startsWith('Edit '));
const open = async (id: number, edit = true) => {
  renderPlans(`/projects/${id}`);
  await screen.findByRole('heading', { level: 1 });
  if (edit) await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
};

describe('editing a plan (spec §2.3)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('turns each milestone into a form under Edit, and back under Done editing', async () => {
    stubPlans();
    await open(43);
    expect(screen.getByRole('button', { name: 'Done editing' })).toHaveAttribute('aria-pressed', 'true');
    expect(editForms()).toEqual(['Edit Prepare', 'Edit Meet', 'Edit Follow up']);
    await userEvent.click(screen.getByRole('button', { name: 'Done editing' }));
    expect(editForms()).toEqual([]);
  });

  it('renames and re-dates a milestone', async () => {
    const { spy } = stubPlans();
    await open(43);
    const form = screen.getByRole('form', { name: 'Edit Prepare' });
    await userEvent.clear(within(form).getByRole('textbox', { name: 'Milestone name' }));
    await userEvent.type(within(form).getByRole('textbox', { name: 'Milestone name' }), 'Prepare the review');
    fireEvent.change(within(form).getByLabelText('Milestone due'), { target: { value: '2026-10-07' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Prepare the review' })).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/milestones\/431\/$/)[0].body).toEqual({ name: 'Prepare the review', due_date: '2026-10-07' });
  });

  it('checks a milestone name before asking', async () => {
    const { spy } = stubPlans();
    await open(43);
    const form = screen.getByRole('form', { name: 'Edit Meet' });
    await userEvent.clear(within(form).getByRole('textbox', { name: 'Milestone name' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(within(form).getByText('Give the milestone a name.')).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /milestones/)).toHaveLength(0);
  });

  it('moves a milestone up with its button', async () => {
    const { spy } = stubPlans();
    await open(43);
    expect(screen.getByRole('button', { name: 'Move Prepare up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Follow up down' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Follow up up' }));
    await waitFor(() => expect(editForms()).toEqual(['Edit Prepare', 'Edit Follow up', 'Edit Meet']));
    expect(requestsOf(spy, 'POST', /^\/plans\/43\/milestones\/reorder\/$/)[0].body).toEqual({ order: [431, 433, 432] });
  });

  it('removes a milestone after asking', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Meet' }));
    expect(screen.getByText('Remove Meet?')).toBeInTheDocument();
    expect(screen.getByText('Its tasks are deleted with it.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(editForms()).toEqual(['Edit Prepare', 'Edit Follow up']));
    expect(requestsOf(spy, 'DELETE', /^\/plans\/43\/milestones\/432\/$/)).toHaveLength(1);
  });

  it('adds a milestone at the end, and the target date follows it', async () => {
    const { spy } = stubPlans();
    await open(43);
    const form = screen.getByRole('form', { name: 'New milestone' });
    expect(form).toHaveTextContent('3/12 milestones');
    await userEvent.type(within(form).getByRole('textbox', { name: 'New milestone' }), 'Wrap up');
    fireEvent.change(within(form).getByLabelText('New milestone due'), { target: { value: '2026-10-30' } });
    await userEvent.click(within(form).getByRole('button', { name: 'Add milestone' }));
    await waitFor(() => expect(editForms()).toEqual(['Edit Prepare', 'Edit Meet', 'Edit Follow up', 'Edit Wrap up']));
    expect(requestsOf(spy, 'POST', /^\/plans\/43\/milestones\/$/)[0].body).toEqual({ name: 'Wrap up', due_date: '2026-10-30' });
    expect(document.querySelector('[data-part="meta"]')).toHaveTextContent('6 Oct 2026 → 30 Oct 2026');
  });

  it('adds a task under a milestone without Edit', async () => {
    const { spy } = stubPlans();
    await open(43, false);
    await userEvent.click(within(milestone('Meet')).getByRole('button', { name: 'Add task' }));
    const form = screen.getByRole('form', { name: 'New task in Meet' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Task' }), 'Book the room');
    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Alice'));
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Assignee' }), '4');
    fireEvent.change(within(form).getByLabelText('Due'), { target: { value: '2026-10-15' } });
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Priority' }), 'low');
    await userEvent.click(within(form).getByRole('button', { name: 'Add task' }));
    expect(await within(milestone('Meet')).findByRole('checkbox', { name: 'Book the room' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'New task in Meet' })).toBeNull();
    expect(requestsOf(spy, 'POST', /^\/plans\/43\/tasks\/$/)[0].body).toEqual({ milestone: 432, title: 'Book the room', priority: 'low', due_date: '2026-10-15', assignee: 4 });
  });

  it('edits a task, moving it to another milestone', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Edit Draft the deck' }));
    const form = screen.getByRole('form', { name: 'Edit Draft the deck' });
    await userEvent.clear(within(form).getByRole('textbox', { name: 'Task' }));
    await userEvent.type(within(form).getByRole('textbox', { name: 'Task' }), 'Draft the QBR deck');
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Milestone' }), '432');
    await userEvent.click(within(form).getByRole('button', { name: 'Save task' }));
    expect(await within(milestone('Meet')).findByRole('checkbox', { name: 'Draft the QBR deck' })).toBeInTheDocument();
    expect(requestsOf(spy, 'PATCH', /^\/plans\/43\/tasks\/4312\/$/)[0].body).toEqual({
      milestone: 432, title: 'Draft the QBR deck', priority: 'medium', due_date: '2026-10-11', assignee: 4,
    });
  });

  it('removes a task after asking', async () => {
    const { spy } = stubPlans();
    await open(43);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Send notes and next steps' }));
    expect(screen.getByText("It is deleted from the plan and from its owner's list.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Send notes and next steps' })).toBeNull());
    expect(requestsOf(spy, 'DELETE', /^\/plans\/43\/tasks\/4331\/$/)).toHaveLength(1);
  });

  it("shows the server's refusal at the task's field", async () => {
    stubPlans();
    await open(41, false);
    await userEvent.click(within(milestone('Set up')).getByRole('button', { name: 'Add task' }));
    const form = screen.getByRole('form', { name: 'New task in Set up' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Task' }), 'Ask Dana');
    await waitFor(() => expect(within(form).getByRole('combobox', { name: 'Assignee' })).toHaveDisplayValue('Alice'));
    await userEvent.selectOptions(within(form).getByRole('combobox', { name: 'Assignee' }), '5');
    await userEvent.click(within(form).getByRole('button', { name: 'Add task' }));
    expect(await within(form).findByText("They can't open this record.")).toBeInTheDocument();
    expect(within(form).getByRole('combobox', { name: 'Assignee' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('offers a reader no Edit and no Add task', async () => {
    stubPlans();
    await open(42, false);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/plans/PlanEdit.test.tsx`
Expected: FAIL, no "Edit" button.

- [ ] **Step 3: Write the editors**

Create `src/components/plans/MilestoneEditor.tsx`:

```tsx
import { useId, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { addMilestone, deleteMilestone, reorderMilestones, updateMilestone } from '../../features/plans/planApi';
import { firstError, NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { CHECK, MILESTONES_MAX, NAME_MAX } from '../../features/plans/planOptions';
import type { Milestone, Plan } from '../../features/plans/planTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { BUTTON, FOCUS, MONO } from '../organizations/portfolio/styles';
import { Field } from '../rules/Field';
import { useSubmitOnce } from './useSubmitOnce';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const ICON_BUTTON = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:bg-subtle active:bg-line-subtle disabled:opacity-50 sm:h-9 sm:w-9 ${FOCUS}`;
const border = (error?: string) => (error ? 'border-danger' : 'border-line');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = ['name', 'due_date'] as const;

/** A milestone's inline form (Decision 8): rename, re-date, move up or
 *  down (no drag), remove after asking. A plan keeps at least one
 *  milestone (Contract note 19), so the only one can't be removed. */
export function MilestoneEditor({ plan, milestone, index, onReplace }: { plan: Plan; milestone: Milestone; index: number; onReplace: (plan: Plan) => void }) {
  const nameId = useId();
  const dueId = useId();
  const [name, setName] = useState(milestone.name);
  const [due, setDue] = useState(milestone.due_date);
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const [removing, setRemoving] = useState(false);
  const { busy, run } = useSubmitOnce();
  const last = plan.milestones.length - 1;

  async function save(event: FormEvent) {
    event.preventDefault();
    const field: Record<string, string> = {};
    if (!name.trim()) field.name = CHECK.MILESTONE_NAME;
    if (!DATE.test(due)) field.due_date = CHECK.DATE;
    if (Object.keys(field).length > 0) {
      setErrors({ field, milestones: [] });
      return;
    }
    setErrors(NO_ERRORS);
    const outcome = await run(() => updateMilestone(plan.id, milestone.id, { name: name.trim(), due_date: due }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setErrors(planErrors(outcome.error, FIELDS, 'Could not save this milestone.'));
  }

  async function move(by: -1 | 1) {
    const order = plan.milestones.map((one) => one.id);
    [order[index], order[index + by]] = [order[index + by], order[index]];
    const outcome = await run(() => reorderMilestones(plan.id, order));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setErrors({ form: firstError(planErrors(outcome.error, [], 'Could not move this milestone.')), field: {}, milestones: [] });
  }

  return (
    <form onSubmit={(event) => void save(event)} aria-label={`Edit ${milestone.name}`} noValidate className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1 basis-48">
        <Field id={nameId} label="Milestone name" error={errors.field.name}>
          {(aria) => <input id={nameId} {...aria} value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} className={`${INPUT} ${border(errors.field.name)}`} />}
        </Field>
      </div>
      <div className="w-full sm:w-40">
        <Field id={dueId} label="Milestone due" error={errors.field.due_date}>
          {(aria) => (
            <input id={dueId} {...aria} type="date" value={due} onChange={(event) => setDue(event.target.value)} className={`${INPUT} ${MONO} ${border(errors.field.due_date)}`} />
          )}
        </Field>
      </div>
      <button type="submit" disabled={busy} className={BUTTON}>
        Save
      </button>
      <button type="button" aria-label={`Move ${milestone.name} up`} disabled={busy || index === 0} onClick={() => void move(-1)} className={ICON_BUTTON}>
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" aria-label={`Move ${milestone.name} down`} disabled={busy || index === last} onClick={() => void move(1)} className={ICON_BUTTON}>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" aria-label={`Remove ${milestone.name}`} disabled={busy || plan.milestones.length === 1} onClick={() => setRemoving(true)} className={`${BUTTON} text-danger`}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Remove
      </button>
      {errors.form ? (
        <p role="alert" className="basis-full text-[11px] text-danger">
          {errors.form}
        </p>
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={`Remove ${milestone.name}?`}
          message={milestone.tasks_total + milestone.hidden_tasks > 0 ? 'Its tasks are deleted with it.' : 'It has no tasks.'}
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            try {
              onReplace(await deleteMilestone(plan.id, milestone.id));
            } catch (err) {
              throw firstError(planErrors(err, [], 'Could not remove this milestone.'));
            }
          }}
          onClose={() => setRemoving(false)}
        />
      ) : null}
    </form>
  );
}

/** "Add milestone" at the end of the timeline in Edit, up to 12. */
export function AddMilestone({ plan, onReplace }: { plan: Plan; onReplace: (plan: Plan) => void }) {
  const nameId = useId();
  const dueId = useId();
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const { busy, run } = useSubmitOnce();
  const full = plan.milestones.length >= MILESTONES_MAX;

  async function add(event: FormEvent) {
    event.preventDefault();
    const field: Record<string, string> = {};
    if (!name.trim()) field.name = CHECK.MILESTONE_NAME;
    if (!DATE.test(due)) field.due_date = CHECK.DATE;
    if (Object.keys(field).length > 0) {
      setErrors({ field, milestones: [] });
      return;
    }
    setErrors(NO_ERRORS);
    const outcome = await run(() => addMilestone(plan.id, { name: name.trim(), due_date: due }));
    if (!outcome) return;
    if (outcome.ok) {
      onReplace(outcome.value);
      setName('');
      setDue('');
    } else {
      setErrors(planErrors(outcome.error, FIELDS, 'Could not add this milestone.'));
    }
  }

  return (
    <form onSubmit={(event) => void add(event)} aria-label="New milestone" noValidate className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3">
      <div className="min-w-0 flex-1 basis-48">
        <Field id={nameId} label="New milestone" error={errors.field.name}>
          {(aria) => <input id={nameId} {...aria} value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} className={`${INPUT} ${border(errors.field.name)}`} />}
        </Field>
      </div>
      <div className="w-full sm:w-40">
        <Field id={dueId} label="New milestone due" error={errors.field.due_date}>
          {(aria) => (
            <input id={dueId} {...aria} type="date" value={due} onChange={(event) => setDue(event.target.value)} className={`${INPUT} ${MONO} ${border(errors.field.due_date)}`} />
          )}
        </Field>
      </div>
      <button type="submit" disabled={busy || full} className={BUTTON}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add milestone
      </button>
      <p className="basis-full text-[11px] text-ink-muted">
        <span className={MONO}>
          {plan.milestones.length}/{MILESTONES_MAX}
        </span>{' '}
        milestones
      </p>
      {errors.form ? (
        <p role="alert" className="basis-full text-[11px] text-danger">
          {errors.form}
        </p>
      ) : null}
    </form>
  );
}
```

Create `src/components/plans/TaskEditor.tsx`:

```tsx
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useMembers } from '../../features/knowledge/useMembers';
import { addTask, updateTask } from '../../features/plans/planApi';
import { NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { CHECK, TASK_TITLE_MAX } from '../../features/plans/planOptions';
import type { PersonRef, Plan, PlanTask, Priority } from '../../features/plans/planTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { BUTTON, FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { Field } from '../rules/Field';
import { PersonSelect, PrioritySelect } from './fields';
import { useSubmitOnce } from './useSubmitOnce';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const border = (error?: string) => (error ? 'border-danger' : 'border-line');
const FIELDS = ['title', 'assignee', 'due_date', 'priority', 'milestone'] as const;

/** A plan task's inline form: a new one under a milestone (`task` null; the
 *  plan's owner and the milestone's date to start), or an existing one,
 *  which can also move to another milestone. */
export function TaskEditor({ plan, milestoneId, task, onDone, onReplace }: {
  plan: Plan;
  milestoneId: number;
  task: PlanTask | null;
  onDone: () => void;
  onReplace: (plan: Plan) => void;
}) {
  const members = useMembers();
  const people = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active).map(({ id, name }) => ({ id, name })), [members]);
  const milestone = plan.milestones.find((one) => one.id === milestoneId);
  const [title, setTitle] = useState(task?.title ?? '');
  const [assignee, setAssignee] = useState<number>(task?.assignee?.id ?? plan.owner.id);
  const [due, setDue] = useState(task?.due_date ?? milestone?.due_date ?? '');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [target, setTarget] = useState(milestoneId);
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const { busy, run } = useSubmitOnce();
  const titleId = useId();
  const assigneeId = useId();
  const dueId = useId();
  const priorityId = useId();
  const milestoneSelectId = useId();

  async function save(event: FormEvent) {
    event.preventDefault();
    const field: Record<string, string> = {};
    if (!title.trim()) field.title = CHECK.TASK_TITLE;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) field.due_date = CHECK.DATE;
    if (Object.keys(field).length > 0) {
      setErrors({ field, milestones: [] });
      return;
    }
    setErrors(NO_ERRORS);
    const body = { milestone: target, title: title.trim(), priority, due_date: due, assignee };
    const outcome = await run(() => (task ? updateTask(plan.id, task.id, body) : addTask(plan.id, body)));
    if (!outcome) return;
    if (outcome.ok) {
      onReplace(outcome.value);
      onDone();
    } else {
      setErrors(planErrors(outcome.error, FIELDS, 'Could not save this task.'));
    }
  }

  return (
    <form
      onSubmit={(event) => void save(event)}
      aria-label={task ? `Edit ${task.title}` : `New task in ${milestone?.name ?? 'this milestone'}`}
      noValidate
      className="grid items-start gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem_7rem]"
    >
      {errors.form ? (
        <p role="alert" className="text-[13px] text-danger sm:col-span-4">
          {errors.form}
        </p>
      ) : null}
      <Field id={titleId} label="Task" error={errors.field.title}>
        {(aria) => <input id={titleId} {...aria} value={title} maxLength={TASK_TITLE_MAX} onChange={(event) => setTitle(event.target.value)} className={`${INPUT} ${border(errors.field.title)}`} />}
      </Field>
      <Field id={assigneeId} label="Assignee" error={errors.field.assignee}>
        {(aria) => <PersonSelect id={assigneeId} aria={aria} value={assignee} people={people} onChange={setAssignee} />}
      </Field>
      <Field id={dueId} label="Due" error={errors.field.due_date}>
        {(aria) => <input id={dueId} {...aria} type="date" value={due} onChange={(event) => setDue(event.target.value)} className={`${INPUT} ${MONO} ${border(errors.field.due_date)}`} />}
      </Field>
      <Field id={priorityId} label="Priority" error={errors.field.priority}>
        {(aria) => <PrioritySelect id={priorityId} aria={aria} value={priority} onChange={setPriority} />}
      </Field>
      {task ? (
        <div className="sm:col-span-2">
          <Field id={milestoneSelectId} label="Milestone" error={errors.field.milestone}>
            {(aria) => (
              <select id={milestoneSelectId} {...aria} value={target} onChange={(event) => setTarget(Number(event.target.value))} className={`${FILTER_SELECT} w-full`}>
                {plan.milestones.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? 'Saving…' : task ? 'Save task' : 'Add task'}
        </button>
        <button type="button" onClick={onDone} className={QUIET}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Replace the timeline with its editing version**

Replace `src/components/plans/Timeline.tsx` with:

```tsx
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Flag, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDate } from '../../features/customers/formatters';
import { deleteTask, updateMilestone, updateTask } from '../../features/plans/planApi';
import { firstError, planErrors } from '../../features/plans/planErrors';
import { PRIORITY_LABEL, TASKS_MAX } from '../../features/plans/planOptions';
import { hiddenTasks, isOpen, progress, shortDay } from '../../features/plans/planText';
import type { Milestone, Plan, PlanTask } from '../../features/plans/planTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { AddMilestone, MilestoneEditor } from './MilestoneEditor';
import { TaskEditor } from './TaskEditor';
import { useSubmitOnce } from './useSubmitOnce';

const ICON_BUTTON = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`;

/** A task (spec §2.3): its checkbox for the assignee, the creator or an
 *  editor (`can_check`), even on a finished plan; title, assignee, due date
 *  in DM Mono, priority as a word and a flag. In Edit, Edit and Remove. */
function TaskRow({ plan, milestone, task, editing, onReplace }: { plan: Plan; milestone: Milestone; task: PlanTask; editing: boolean; onReplace: (plan: Plan) => void }) {
  const { busy, run } = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const done = task.status === 'completed';
  async function toggle() {
    setError(null);
    const outcome = await run(() => updateTask(plan.id, task.id, { status: done ? 'pending' : 'completed' }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setError(firstError(planErrors(outcome.error, [], 'Could not update this task.')));
  }
  if (editing && changing) {
    return (
      <li data-task={task.id}>
        <TaskEditor plan={plan} milestoneId={milestone.id} task={task} onDone={() => setChanging(false)} onReplace={onReplace} />
      </li>
    );
  }
  return (
    <li data-task={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <label className="flex min-h-11 min-w-0 flex-1 basis-56 cursor-pointer items-center gap-2 sm:min-h-9">
        <input type="checkbox" checked={done} disabled={!task.can_check || busy} onChange={() => void toggle()} />
        <span className={`min-w-0 text-[13px] ${done ? 'text-ink-muted line-through' : 'text-ink'}`}>{task.title}</span>
      </label>
      <span className="text-[11px] text-ink-muted">{task.assignee?.name ?? 'Unassigned'}</span>
      <span className={`${MONO} text-[11px] text-ink-muted`}>{shortDay(task.due_date)}</span>
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        {PRIORITY_LABEL[task.priority]}
      </span>
      {editing ? (
        <span className="flex items-center gap-1">
          <button type="button" aria-label={`Edit ${task.title}`} onClick={() => setChanging(true)} className={ICON_BUTTON}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Remove ${task.title}`} onClick={() => setRemoving(true)} className={ICON_BUTTON}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full text-[11px] text-danger">
          {error}
        </p>
      ) : null}
      {removing ? (
        <ConfirmDialog
          title={`Remove ${task.title}?`}
          message="It is deleted from the plan and from its owner's list."
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            try {
              onReplace(await deleteTask(plan.id, task.id));
            } catch (err) {
              throw firstError(planErrors(err, [], 'Could not remove this task.'));
            }
          }}
          onClose={() => setRemoving(false)}
        />
      ) : null}
    </li>
  );
}

/** A milestone (spec §2.3): name, due date, Overdue as an icon and a word,
 *  its progress, the editors' done check, its tasks and the hidden count;
 *  Add task for editors; in Edit, its inline form (Decision 8). */
function MilestoneItem({ plan, milestone, index, editing, onReplace }: { plan: Plan; milestone: Milestone; index: number; editing: boolean; onReplace: (plan: Plan) => void }) {
  const { busy, run } = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const done = milestone.done_at !== null;
  const editable = plan.can_edit && isOpen(plan.status);
  const hidden = hiddenTasks(milestone.hidden_tasks);
  const planTasks = plan.milestones.reduce((n, one) => n + one.tasks_total + one.hidden_tasks, 0);
  async function mark(next: boolean) {
    setError(null);
    const outcome = await run(() => updateMilestone(plan.id, milestone.id, { done: next }));
    if (!outcome) return;
    if (outcome.ok) onReplace(outcome.value);
    else setError(firstError(planErrors(outcome.error, [], 'Could not update this milestone.')));
  }
  return (
    <li data-milestone={milestone.id} className="relative flex flex-col gap-2">
      <span aria-hidden="true" className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${done ? 'bg-success' : 'bg-line-strong'}`} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="min-w-0 flex-1 basis-40 text-[15px] font-semibold text-ink">{milestone.name}</h2>
        <span className={`${MONO} text-[13px] text-ink-muted`}>{formatDate(milestone.due_date)}</span>
        {milestone.is_overdue ? (
          <span data-part="overdue" className="inline-flex items-center gap-1 text-[13px] font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Overdue
          </span>
        ) : null}
        <span className="text-[11px] text-ink-muted">
          <span className={MONO}>{progress(milestone.tasks_done, milestone.tasks_total)}</span> tasks done
        </span>
        {editable ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-ink sm:min-h-9">
            <input type="checkbox" aria-label={`${milestone.name} done`} checked={done} disabled={busy} onChange={(event) => void mark(event.target.checked)} />
            Done
          </label>
        ) : done ? (
          <span className="inline-flex items-center gap-1 text-[13px] text-ink">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            Done
          </span>
        ) : null}
      </div>
      {editing ? <MilestoneEditor plan={plan} milestone={milestone} index={index} onReplace={onReplace} /> : null}
      {error ? (
        <p role="alert" className="text-[11px] text-danger">
          {error}
        </p>
      ) : null}
      {milestone.tasks.length > 0 ? (
        <ul aria-label={`Tasks in ${milestone.name}`} className="flex flex-col divide-y divide-line-subtle rounded-xl bg-surface">
          {milestone.tasks.map((task) => (
            <TaskRow key={task.id} plan={plan} milestone={milestone} task={task} editing={editing} onReplace={onReplace} />
          ))}
        </ul>
      ) : milestone.hidden_tasks === 0 ? (
        <p className="text-[11px] text-ink-muted">No tasks.</p>
      ) : null}
      {hidden.n > 0 ? (
        <p data-part="hidden" className="text-[11px] text-ink-muted">
          <span className={MONO}>{hidden.n}</span> {hidden.text}
        </p>
      ) : null}
      {editable && adding ? (
        <div className="rounded-xl bg-surface">
          <TaskEditor plan={plan} milestoneId={milestone.id} task={null} onDone={() => setAdding(false)} onReplace={onReplace} />
        </div>
      ) : null}
      {editable && !adding ? (
        <button type="button" onClick={() => setAdding(true)} disabled={planTasks >= TASKS_MAX} className={`${QUIET} self-start`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add task
        </button>
      ) : null}
    </li>
  );
}

/** The milestones in order down the page, joined by a vertical line; in
 *  Edit, Add milestone after the last. */
export function Timeline({ plan, editing, onReplace }: { plan: Plan; editing: boolean; onReplace: (plan: Plan) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Milestones" className="flex flex-col gap-6 border-l border-line pl-5">
        {plan.milestones.map((milestone, index) => (
          <MilestoneItem key={milestone.id} plan={plan} milestone={milestone} index={index} editing={editing} onReplace={onReplace} />
        ))}
      </ol>
      {editing ? <AddMilestone plan={plan} onReplace={onReplace} /> : null}
    </div>
  );
}
```

- [ ] **Step 5: Add Edit to the header and the state to the page**

In `src/components/plans/PlanHeader.tsx`:

1. Add `Pencil` to the `lucide-react` import and `BUTTON` to the styles import (`import { BUTTON, FOCUS, MONO } from '../organizations/portfolio/styles';`).
2. Change the signature to:

```tsx
export function PlanHeader({ plan, editing, onEdit, onReplace }: { plan: Plan; editing: boolean; onEdit: (on: boolean) => void; onReplace: (plan: Plan) => void }) {
```

3. Directly after the status select / pill expression inside `data-part="actions"`, add:

```tsx
          {plan.can_edit && open ? (
            <button type="button" aria-pressed={editing} onClick={() => onEdit(!editing)} className={BUTTON}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {editing ? 'Done editing' : 'Edit'}
            </button>
          ) : null}
```

In `src/pages/plans/PlanPage.tsx`, add `import { useState } from 'react';` and `import { isOpen } from '../../features/plans/planText';`, and replace `PlanView` with:

```tsx
function PlanView({ plan, onReplace }: { plan: Plan; onReplace: (plan: Plan) => void }) {
  const [editing, setEditing] = useState(false);
  // Edit is for editors of an open plan; cancelling or finishing leaves it.
  const on = editing && plan.can_edit && isOpen(plan.status);
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-6 pb-6">
        <PlanHeader plan={plan} editing={on} onEdit={setEditing} onReplace={onReplace} />
        <Timeline plan={plan} editing={on} onReplace={onReplace} />
      </div>
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/pages/plans/PlanEdit.test.tsx src/pages/plans/PlanPage.test.tsx`
Expected: PASS (11 + 14 tests).

- [ ] **Step 7: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/components/plans/MilestoneEditor.tsx src/components/plans/TaskEditor.tsx src/components/plans/Timeline.tsx src/components/plans/PlanHeader.tsx src/pages/plans/PlanPage.tsx src/pages/plans/PlanEdit.test.tsx
git add src/components/plans/MilestoneEditor.tsx src/components/plans/TaskEditor.tsx src/components/plans/Timeline.tsx src/components/plans/PlanHeader.tsx src/pages/plans/PlanPage.tsx src/pages/plans/PlanEdit.test.tsx
git commit -m "feat(plans): edit a plan in place: milestones and tasks

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Templates: the page, the editor modal, and Save as template

Spec §2.4 (sections Built-in with View, Yours with Edit and Delete, Shared with you with View then Use; the editor modal at `/projects/templates/new` and `/projects/templates/:id/edit` with name, kind, description, milestones with name and offset days, their tasks with title, priority, offset days and assignee role, sharing as Segments and Rules; limits shown as counts; Save as template: a small dialog with name and sharing that posts, then links to the new template); §1.3 (only the owner edits; built-in read-only); Decisions 10, 11; Contract notes 12, 14.

**Files:**
- Create: `src/components/plans/TemplateMilestones.tsx`, `src/components/plans/SaveAsTemplateDialog.tsx`, `src/pages/plans/TemplatesPage.tsx`, `src/pages/plans/TemplateEditor.tsx`
- Modify: `src/components/segments/BuilderDialog.tsx` (`size`), `src/components/plans/PlanHeader.tsx` (Save as template), `src/pages/plans/testPages.tsx` (the templates routes)
- Test: `src/pages/plans/Templates.test.tsx`

**Interfaces:**
- Consumes: Task 2's `fetchTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `saveAsTemplate`; Task 3's template draft and `planErrors`; Task 7's `useTemplates`, `PrioritySelect`; Task 8's `PlanHeader`; `SharingFields`, `BuilderDialog`; `Field`; `Parts`; `ConfirmDialog`; `EmptyState`, `ErrorBlock`, `ItemSkeleton`; `useMembers`.
- Produces: `BuilderDialog({ title, onClose, size?: 'wide' | 'narrow', children })`; `TemplateMilestones({ milestones, errors, onChange })`; `SaveAsTemplateDialog({ plan, onClose })`; `TemplatesPage()` (with an `Outlet`); `NewTemplateRoute()`, `EditTemplateRoute()`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/plans/Templates.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { resetViewport } from '../../test/viewport';
import { renderPlans } from './testPages';

const where = () => screen.getByTestId('where').textContent;
const section = (name: string) => screen.getByRole('region', { name });
const item = (name: string) => screen.getByRole('button', { name }).closest('li') as HTMLElement;

describe('templates (spec §2.4)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('lists Built-in, Yours and Shared with you; only yours can be edited or deleted', async () => {
    stubPlans();
    renderPlans('/projects/templates');
    expect(await screen.findByRole('heading', { level: 1, name: 'Templates' })).toBeInTheDocument();
    await waitFor(() => expect(within(section('Built-in')).getAllByRole('listitem')).toHaveLength(4));
    expect(within(section('Yours')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(section('Shared with you')).getAllByRole('listitem')).toHaveLength(1);
    expect(within(section('Built-in')).queryByRole('link', { name: /^Edit/ })).toBeNull();
    expect(within(section('Yours')).getByRole('link', { name: 'Edit Renewal prep' })).toHaveAttribute('href', '/projects/templates/10/edit');
    expect(item("Carl's expansion play")).toHaveTextContent('From Carl CSM');
    expect(item('Onboarding')).toHaveTextContent('4 milestones · 7 tasks · 60 days');
  });

  it('opens a template in place to view it, and Use starts a plan from it', async () => {
    stubPlans();
    renderPlans('/projects/templates');
    const name = await screen.findByRole('button', { name: 'Onboarding' });
    expect(name).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(name);
    expect(name).toHaveAttribute('aria-expanded', 'true');
    const view = item('Onboarding');
    expect(view).toHaveTextContent('Day 0 · Kick-off');
    expect(view).toHaveTextContent('Hand over to the account owner');
    expect(view).toHaveTextContent("The plan's owner");
    expect(within(view).getByRole('link', { name: 'Use' })).toHaveAttribute('href', '/projects/new?template=1');
  });

  it('makes a new template, counting its milestones and tasks, and lists it', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/templates/new');
    const modal = await screen.findByRole('dialog', { name: 'New template' });
    expect(modal).toHaveTextContent('1/12 milestones · 0/50 tasks');
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Escalation');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Kind' }), 'save');
    const first = modal.querySelector('[data-template-milestone="0"]') as HTMLElement;
    await userEvent.type(within(first).getByRole('textbox', { name: 'Milestone' }), 'Call the sponsor');
    await userEvent.click(within(first).getByRole('button', { name: 'Add task' }));
    await userEvent.type(within(first).getByRole('textbox', { name: 'Task' }), 'Book the call');
    fireEvent.change(within(first).getByRole('spinbutton', { name: 'Task day' }), { target: { value: '2' } });
    await userEvent.selectOptions(within(first).getByRole('combobox', { name: 'Assignee role' }), 'plan_owner');
    expect(modal).toHaveTextContent('1/12 milestones · 1/50 tasks');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(where()).toBe('/projects/templates'));
    expect(requestsOf(spy, 'POST', /^\/plans\/templates\/$/)[0].body).toEqual({
      name: 'Escalation',
      kind: 'save',
      description: '',
      milestones: [{ name: 'Call the sponsor', offset_days: 0, tasks: [{ title: 'Book the call', priority: 'medium', offset_days: 2, assignee_role: 'plan_owner' }] }],
      sharing: 'private',
      shared_with: [],
    });
    await waitFor(() => expect(within(section('Yours')).getAllByRole('listitem')).toHaveLength(2));
  });

  it('checks the name and the days before asking', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/templates/new');
    const modal = await screen.findByRole('dialog', { name: 'New template' });
    const first = modal.querySelector('[data-template-milestone="0"]') as HTMLElement;
    fireEvent.change(within(first).getByRole('spinbutton', { name: 'Day' }), { target: { value: '400' } });
    await userEvent.click(within(modal).getByRole('button', { name: 'Save template' }));
    expect(within(modal).getByText('Give the template a name.')).toBeInTheDocument();
    expect(within(first).getByText('Choose 0 to 365 days.')).toBeInTheDocument();
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(requestsOf(spy, 'POST', /^\/plans\/templates\/$/)).toHaveLength(0);
  });

  it('edits your own template with the whole body', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/templates/10/edit');
    const modal = await screen.findByRole('dialog', { name: 'Edit Renewal prep' });
    await waitFor(() => expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Renewal prep'));
    await userEvent.clear(within(modal).getByRole('textbox', { name: 'Name' }));
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Renewal prep v2');
    await userEvent.click(within(modal).getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(where()).toBe('/projects/templates'));
    expect(requestsOf(spy, 'PATCH', /^\/plans\/templates\/10\/$/)[0].body).toMatchObject({ name: 'Renewal prep v2', kind: 'other', sharing: 'private' });
  });

  it.each([
    ['/projects/templates/1/edit', "Built-in templates can't be changed"],
    ['/projects/templates/11/edit', 'Only Carl CSM can edit this template'],
  ])('reads %s as a template you cannot edit', async (url, title) => {
    stubPlans();
    renderPlans(url);
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save template' })).toBeNull();
  });

  it('deletes your own template after asking', async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/templates');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Renewal prep' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(section('Yours')).queryAllByRole('listitem')).toHaveLength(0));
    expect(requestsOf(spy, 'DELETE', /^\/plans\/templates\/10\/$/)).toHaveLength(1);
    expect(within(section('Yours')).getByText('Save a plan as a template, or make one from scratch.')).toBeInTheDocument();
  });

  it("saves a plan as a template from the plan's page, then links to it", async () => {
    const { spy } = stubPlans();
    renderPlans('/projects/41');
    await userEvent.click(await screen.findByRole('button', { name: 'Save as template' }));
    const dialog = screen.getByRole('dialog', { name: 'Save as template' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Onboarding · Globex');
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Name' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Our onboarding');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save template' }));
    expect(await within(dialog).findByText('Saved as Our onboarding.')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open template' })).toHaveAttribute('href', '/projects/templates/900/edit');
    expect(requestsOf(spy, 'POST', /^\/plans\/41\/save-as-template\/$/)[0].body).toEqual({ name: 'Our onboarding', sharing: 'private' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/pages/plans/Templates.test.tsx`
Expected: FAIL, no "Templates" heading.

- [ ] **Step 3: Give BuilderDialog a narrow size**

In `src/components/segments/BuilderDialog.tsx`, change the signature to:

```tsx
export function BuilderDialog({ title, onClose, size = 'wide', children }: { title: string; onClose: () => void; size?: 'wide' | 'narrow'; children: ReactNode }) {
```

and in the dialog element's `className`, replace `sm:max-w-[1100px]` with `${size === 'narrow' ? 'sm:max-w-lg' : 'sm:max-w-[1100px]'}` (turn the string into a template literal). Nothing else changes; every existing caller keeps `wide`.

- [ ] **Step 4: Write the editor's milestones and the Save as template dialog**

Create `src/components/plans/TemplateMilestones.tsx`:

```tsx
import { useId } from 'react';
import { Plus, X } from 'lucide-react';
import type { NestedErrors } from '../../features/plans/planErrors';
import { MILESTONES_MAX, NAME_MAX, OFFSET_MAX, ROLE_LABEL, TASK_TITLE_MAX, TASKS_MAX } from '../../features/plans/planOptions';
import type { AssigneeRole } from '../../features/plans/planTypes';
import { newTemplateMilestone, newTemplateTask, type TemplateMilestoneDraft, type TemplateTaskDraft } from '../../features/plans/templateDraft';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { Field } from '../rules/Field';
import { PrioritySelect } from './fields';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const ICON_BUTTON = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`;
const border = (error?: string) => (error ? 'border-danger' : 'border-line');
const ROLES: readonly AssigneeRole[] = ['record_owner', 'plan_owner'];
const NONE: NestedErrors = { field: {}, tasks: [] };

function TaskFields({ task, errors, onChange, onRemove }: { task: TemplateTaskDraft; errors: Record<string, string>; onChange: (next: TemplateTaskDraft) => void; onRemove: () => void }) {
  const titleId = useId();
  const priorityId = useId();
  const dayId = useId();
  const roleId = useId();
  return (
    <li className="grid items-start gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_11rem_auto]">
      <Field id={titleId} label="Task" error={errors.title}>
        {(aria) => <input id={titleId} {...aria} value={task.title} maxLength={TASK_TITLE_MAX} onChange={(event) => onChange({ ...task, title: event.target.value })} className={`${INPUT} ${border(errors.title)}`} />}
      </Field>
      <Field id={priorityId} label="Priority" error={errors.priority}>
        {(aria) => <PrioritySelect id={priorityId} aria={aria} value={task.priority} onChange={(priority) => onChange({ ...task, priority })} />}
      </Field>
      <Field id={dayId} label="Task day" error={errors.offset_days}>
        {(aria) => (
          <input
            id={dayId}
            {...aria}
            type="number"
            inputMode="numeric"
            min={0}
            max={OFFSET_MAX}
            step={1}
            value={task.offset}
            onChange={(event) => onChange({ ...task, offset: event.target.value })}
            className={`${INPUT} ${MONO} ${border(errors.offset_days)}`}
          />
        )}
      </Field>
      <Field id={roleId} label="Assignee role" error={errors.assignee_role}>
        {(aria) => (
          <select id={roleId} {...aria} value={task.role} onChange={(event) => onChange({ ...task, role: event.target.value as AssigneeRole })} className={`${FILTER_SELECT} w-full`}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <button type="button" onClick={onRemove} aria-label={`Remove ${task.title.trim() || 'this task'}`} className={`${ICON_BUTTON} self-end`}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function MilestoneFields({ index, milestone, canRemove, canAddTask, errors, onChange, onRemove }: {
  index: number;
  milestone: TemplateMilestoneDraft;
  canRemove: boolean;
  canAddTask: boolean;
  errors: NestedErrors;
  onChange: (next: TemplateMilestoneDraft) => void;
  onRemove: () => void;
}) {
  const nameId = useId();
  const dayId = useId();
  const setTask = (at: number, next: TemplateTaskDraft) => onChange({ ...milestone, tasks: milestone.tasks.map((task, i) => (i === at ? next : task)) });
  return (
    <li data-template-milestone={index} className="flex flex-col gap-2 rounded-lg border border-line p-3">
      <div className="grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
        <Field id={nameId} label="Milestone" error={errors.field.name}>
          {(aria) => <input id={nameId} {...aria} value={milestone.name} maxLength={NAME_MAX} onChange={(event) => onChange({ ...milestone, name: event.target.value })} className={`${INPUT} ${border(errors.field.name)}`} />}
        </Field>
        <Field id={dayId} label="Day" error={errors.field.offset_days}>
          {(aria) => (
            <input
              id={dayId}
              {...aria}
              type="number"
              inputMode="numeric"
              min={0}
              max={OFFSET_MAX}
              step={1}
              value={milestone.offset}
              onChange={(event) => onChange({ ...milestone, offset: event.target.value })}
              className={`${INPUT} ${MONO} ${border(errors.field.offset_days)}`}
            />
          )}
        </Field>
        <button type="button" onClick={onRemove} disabled={!canRemove} aria-label={`Remove ${milestone.name.trim() || 'this milestone'}`} className={`${ICON_BUTTON} self-end`}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {milestone.tasks.length > 0 ? (
        <ul aria-label={`Tasks in ${milestone.name.trim() || 'this milestone'}`} className="flex flex-col divide-y divide-line-subtle">
          {milestone.tasks.map((task, at) => (
            <TaskFields
              key={task.key}
              task={task}
              errors={errors.tasks[at] ?? {}}
              onChange={(next) => setTask(at, next)}
              onRemove={() => onChange({ ...milestone, tasks: milestone.tasks.filter((_, i) => i !== at) })}
            />
          ))}
        </ul>
      ) : null}
      <button type="button" onClick={() => onChange({ ...milestone, tasks: [...milestone.tasks, newTemplateTask(Number(milestone.offset) || 0)] })} disabled={!canAddTask} className={`${QUIET} self-start`}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add task
      </button>
    </li>
  );
}

/** The template editor's milestones (spec §2.4): each a name and a day
 *  from the start, with its tasks; at least one milestone, at most 12, and
 *  at most 50 tasks in all. */
export function TemplateMilestones({ milestones, errors, onChange }: { milestones: TemplateMilestoneDraft[]; errors: NestedErrors[]; onChange: (next: TemplateMilestoneDraft[]) => void }) {
  const tasks = milestones.reduce((n, milestone) => n + milestone.tasks.length, 0);
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Template milestones" className="flex flex-col gap-3">
        {milestones.map((milestone, at) => (
          <MilestoneFields
            key={milestone.key}
            index={at}
            milestone={milestone}
            canRemove={milestones.length > 1}
            canAddTask={tasks < TASKS_MAX}
            errors={errors[at] ?? NONE}
            onChange={(next) => onChange(milestones.map((one, i) => (i === at ? next : one)))}
            onRemove={() => onChange(milestones.filter((_, i) => i !== at))}
          />
        ))}
      </ol>
      <button
        type="button"
        onClick={() => onChange([...milestones, newTemplateMilestone(Number(milestones[milestones.length - 1]?.offset) || 0)])}
        disabled={milestones.length >= MILESTONES_MAX}
        className={`${QUIET} self-start border border-line`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add milestone
      </button>
    </div>
  );
}
```

Create `src/components/plans/SaveAsTemplateDialog.tsx`:

```tsx
import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { useMembers } from '../../features/knowledge/useMembers';
import { saveAsTemplate } from '../../features/plans/planApi';
import { NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { CHECK, NAME_MAX } from '../../features/plans/planOptions';
import type { PersonRef, Plan, PlanTemplate, Sharing } from '../../features/plans/planTypes';
import { FOCUS, PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { Field } from '../rules/Field';
import { BuilderDialog } from '../segments/BuilderDialog';
import { SharingFields } from '../segments/SharingFields';
import { useSubmitOnce } from './useSubmitOnce';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const NOTE = 'Teammates can start plans from it. Only you can change it.';

/** Save as template (spec §2.4, Decision 11): a name and sharing; the plan's
 *  milestones and the tasks you can see become a new template of yours. */
export function SaveAsTemplateDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const teammates = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active && member.id !== me).map(({ id, name }) => ({ id, name })), [members, me]);
  const nameId = useId();
  const [name, setName] = useState(plan.name);
  const [sharing, setSharing] = useState<Sharing>('private');
  const [sharedWith, setSharedWith] = useState<PersonRef[]>([]);
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const [saved, setSaved] = useState<PlanTemplate | null>(null);
  const { busy, run } = useSubmitOnce();

  async function save(event: FormEvent) {
    event.preventDefault();
    const field: Record<string, string> = {};
    if (!name.trim()) field.name = CHECK.TEMPLATE_NAME;
    if (sharing === 'people' && sharedWith.length === 0) field.shared_with = CHECK.NO_PEOPLE;
    if (Object.keys(field).length > 0) {
      setErrors({ field, milestones: [] });
      return;
    }
    setErrors(NO_ERRORS);
    const outcome = await run(() => saveAsTemplate(plan.id, { name: name.trim(), sharing, ...(sharing === 'people' ? { shared_with: sharedWith.map((person) => person.id) } : {}) }));
    if (!outcome) return;
    if (outcome.ok) setSaved(outcome.value);
    else setErrors(planErrors(outcome.error, ['name', 'sharing', 'shared_with'], 'Could not save this template.'));
  }

  return (
    <BuilderDialog title="Save as template" onClose={onClose} size="narrow">
      {saved ? (
        <div className="flex flex-col gap-3 p-4">
          <p role="status" className="text-[13px] text-ink">
            Saved as {saved.name}.
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to={`/projects/templates/${saved.id}/edit`} className={`${QUIET} border border-line`}>
              Open template
            </Link>
            <button type="button" onClick={onClose} className={PRIMARY}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {errors.form ? (
              <p role="alert" className="text-[13px] text-danger">
                {errors.form}
              </p>
            ) : null}
            <Field id={nameId} label="Name" error={errors.field.name}>
              {(aria) => (
                <input id={nameId} {...aria} value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} className={`${INPUT} ${errors.field.name ? 'border-danger' : 'border-line'}`} />
              )}
            </Field>
            <SharingFields
              sharing={sharing}
              sharedWith={sharedWith}
              teammates={teammates}
              error={errors.field.shared_with ?? errors.field.sharing ?? null}
              onChange={(nextSharing, nextPeople) => {
                setSharing(nextSharing);
                setSharedWith(nextPeople);
              }}
              note={NOTE}
            />
            <p className="text-[11px] text-ink-muted">Its milestones and the tasks you can see are copied, with their days counted from the plan's start.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
            <button type="button" onClick={onClose} className={QUIET}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </form>
      )}
    </BuilderDialog>
  );
}
```

In `src/components/plans/PlanHeader.tsx`, add `FileStack` to the `lucide-react` import, `import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';`, a state `const [saving, setSaving] = useState(false);`, and directly after the Edit button inside `data-part="actions"`:

```tsx
          {plan.can_edit ? (
            <button type="button" onClick={() => setSaving(true)} className={BUTTON}>
              <FileStack className="h-4 w-4" aria-hidden="true" />
              Save as template
            </button>
          ) : null}
```

and, before the closing `</header>`:

```tsx
      {saving ? <SaveAsTemplateDialog plan={plan} onClose={() => setSaving(false)} /> : null}
```

- [ ] **Step 5: Write the templates page and the editor routes**

Create `src/pages/plans/TemplatesPage.tsx`:

```tsx
import { useId, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteTemplate } from '../../features/plans/planApi';
import { firstError, planErrors } from '../../features/plans/planErrors';
import { PRIORITY_LABEL, ROLE_LABEL } from '../../features/plans/planOptions';
import { lengthParts } from '../../features/plans/planText';
import type { PlanTemplate, TemplateLists } from '../../features/plans/planTypes';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { ErrorBlock, ItemSkeleton } from '../../components/organizations/portfolio/PortfolioSections';
import { BUTTON, FOCUS, MONO, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { KindChip } from '../../components/plans/parts';
import { useTemplates } from '../../components/plans/useTemplates';
import { Parts } from '../../components/rules/Parts';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';

const SECTIONS: readonly { key: keyof TemplateLists; label: string; empty: string }[] = [
  { key: 'builtin', label: 'Built-in', empty: '' },
  { key: 'mine', label: 'Yours', empty: 'Save a plan as a template, or make one from scratch.' },
  { key: 'shared', label: 'Shared with you', empty: 'Nothing is shared with you yet.' },
];
const ICON_LINK = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink active:bg-line-subtle sm:h-9 sm:w-9 ${FOCUS}`;

/** One template (Decision 10): its name opens it in place; Use starts a
 *  plan from it; yours also have Edit and Delete. */
function TemplateItem({ template, onDeleted }: { template: PlanTemplate; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const viewId = useId();
  return (
    <li data-template={template.id} className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? viewId : undefined}
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex min-h-11 min-w-0 items-center rounded-sm text-left text-[13px] font-semibold text-ink hover:underline sm:min-h-9 ${FOCUS}`}
        >
          {template.name}
        </button>
        <KindChip kind={template.kind} />
        <span className="text-[11px] text-ink-muted">
          <Parts parts={lengthParts(template)} />
        </span>
        {!template.is_builtin && !template.is_owner && template.owner ? <span className="text-[11px] text-ink-muted">From {template.owner.name}</span> : null}
        {template.is_owner ? (
          <span className="ml-auto flex items-center gap-1">
            <Link to={`/projects/templates/${template.id}/edit`} aria-label={`Edit ${template.name}`} className={ICON_LINK}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button type="button" aria-label={`Delete ${template.name}`} onClick={() => setDeleting(true)} className={ICON_LINK}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
      {open ? (
        <div id={viewId} className="flex flex-col gap-2">
          {template.description ? <p className="text-[13px] text-ink-muted">{template.description}</p> : null}
          <ol aria-label={`Milestones in ${template.name}`} className="flex flex-col gap-2">
            {template.milestones.map((milestone, at) => (
              <li key={`${milestone.name}-${at}`} className="flex flex-col gap-1">
                <p className="text-[13px] font-semibold text-ink">
                  <span className={MONO}>Day {milestone.offset_days}</span> · {milestone.name}
                </p>
                {milestone.tasks.length > 0 ? (
                  <ul className="flex flex-col gap-0.5 pl-3">
                    {milestone.tasks.map((task, i) => (
                      <li key={`${task.title}-${i}`} className="text-[11px] text-ink-muted">
                        <span className={MONO}>Day {task.offset_days}</span> · {task.title} · {PRIORITY_LABEL[task.priority]} · {ROLE_LABEL[task.assignee_role]}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
          <Link to={`/projects/new?template=${template.id}`} className={`${BUTTON} self-start`}>
            Use
          </Link>
        </div>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${template.name}?`}
          message="Plans already started from it keep their copy."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteTemplate(template.id);
            } catch (err) {
              throw firstError(planErrors(err, [], 'Could not delete this template.'));
            }
            onDeleted();
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </li>
  );
}

/** /projects/templates (spec §2.4). It reads again when its editor modal
 *  closes back to it, and after a delete. */
export function TemplatesPage() {
  const modalOpen = useLocation().pathname.replace(/\/$/, '') !== '/projects/templates';
  const [wasOpen, setWasOpen] = useState(modalOpen);
  const [version, setVersion] = useState(0);
  if (wasOpen !== modalOpen) {
    setWasOpen(modalOpen);
    if (!modalOpen) setVersion((n) => n + 1);
  }
  const [load, retry] = useTemplates(version);
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-6 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 flex-1 text-[22px] font-semibold text-ink">Templates</h1>
          <Link to="/projects/templates/new" className={PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New template
          </Link>
        </div>
        {load.status === 'loading' ? <ItemSkeleton count={4} label="Loading templates" avatar={false} /> : null}
        {load.status === 'failed' ? <ErrorBlock message={load.message} onRetry={retry} /> : null}
        {load.status === 'ready'
          ? SECTIONS.map((section) => {
              const list = load.lists[section.key];
              return (
                <section key={section.key} aria-label={section.label} className="flex flex-col gap-2">
                  <h2 className="text-[15px] font-semibold text-ink">{section.label}</h2>
                  {list.length > 0 ? (
                    <ul className="flex flex-col divide-y divide-line-subtle rounded-xl bg-surface">
                      {list.map((template) => (
                        <TemplateItem key={template.id} template={template} onDeleted={() => setVersion((n) => n + 1)} />
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-ink-muted">
                      {section.empty}{' '}
                      {section.key === 'mine' ? (
                        <Link to="/projects/templates/new" className={`${QUIET} inline-flex`}>
                          New template
                        </Link>
                      ) : null}
                    </p>
                  )}
                </section>
              );
            })
          : null}
      </div>
      {/* /projects/templates/new and /:id/edit: the editor modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}
```

Create `src/pages/plans/TemplateEditor.tsx`:

```tsx
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../../hooks';
import { ApiError } from '../../lib/apiClient';
import { useMembers } from '../../features/knowledge/useMembers';
import { createTemplate, fetchTemplate, updateTemplate } from '../../features/plans/planApi';
import { hasErrors, NO_ERRORS, planErrors, type PlanErrors } from '../../features/plans/planErrors';
import { DESCRIPTION_MAX, KIND_LABEL, KINDS, MILESTONES_MAX, NAME_MAX, TASKS_MAX } from '../../features/plans/planOptions';
import type { PersonRef, PlanKind, PlanTemplate } from '../../features/plans/planTypes';
import { checkTemplate, emptyTemplateDraft, templateCounts, templateDraftOf, toTemplateWrite, type TemplateDraft } from '../../features/plans/templateDraft';
import { FILTER_SELECT } from '../../components/organizations/portfolio/filterParts';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, PRIMARY, QUIET } from '../../components/organizations/portfolio/styles';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { TemplateMilestones } from '../../components/plans/TemplateMilestones';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { Field } from '../../components/rules/Field';
import { BuilderDialog } from '../../components/segments/BuilderDialog';
import { SharingFields } from '../../components/segments/SharingFields';

const INPUT = `min-h-11 sm:min-h-9 w-full rounded-lg border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted hover:border-line-strong focus:border-line-strong ${FOCUS}`;
const FIELDS = ['name', 'kind', 'description', 'milestones', 'sharing', 'shared_with'] as const;
const NOTE = 'Teammates can start plans from it. Only you can change it.';

/** The template editor (spec §2.4) for a new template or one of yours. */
function TemplateForm({ initial, onClose, onDone }: { initial: PlanTemplate | null; onClose: () => void; onDone: () => void }) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const members = useMembers();
  const teammates = useMemo<PersonRef[]>(() => members.filter((member) => member.is_active && member.id !== me).map(({ id, name }) => ({ id, name })), [members, me]);
  const [draft, setDraft] = useState<TemplateDraft>(() => (initial ? templateDraftOf(initial) : emptyTemplateDraft()));
  const [errors, setErrors] = useState<PlanErrors>(NO_ERRORS);
  const { busy, run } = useSubmitOnce();
  const [focusTick, setFocusTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const nameId = useId();
  const kindId = useId();
  const descriptionId = useId();
  const counts = templateCounts(draft);
  useEffect(() => {
    if (focusTick === 0) return;
    bodyRef.current?.querySelector<HTMLElement>('[data-error], [aria-invalid="true"]')?.focus();
  }, [focusTick]);
  const refuse = (found: PlanErrors) => {
    setErrors(found);
    setFocusTick((n) => n + 1);
  };
  const change = (patch: Partial<TemplateDraft>) => setDraft((current) => ({ ...current, ...patch }));

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = checkTemplate(draft);
    if (hasErrors(found)) {
      refuse(found);
      return;
    }
    setErrors(NO_ERRORS);
    const body = toTemplateWrite(draft);
    const outcome = await run(() => (initial ? updateTemplate(initial.id, body) : createTemplate(body)));
    if (!outcome) return;
    if (outcome.ok) onDone();
    else refuse(planErrors(outcome.error, FIELDS, 'Could not save this template.'));
  }

  return (
    <BuilderDialog title={initial ? `Edit ${initial.name}` : 'New template'} onClose={onClose}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex min-h-0 flex-1 flex-col">
        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4">
          {errors.form ? (
            <p role="alert" data-error tabIndex={-1} className={`text-[13px] text-danger ${FOCUS}`}>
              {errors.form}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Field id={nameId} label="Name" error={errors.field.name}>
              {(aria) => (
                <input id={nameId} {...aria} value={draft.name} maxLength={NAME_MAX} onChange={(event) => change({ name: event.target.value })} className={`${INPUT} ${errors.field.name ? 'border-danger' : 'border-line'}`} />
              )}
            </Field>
            <Field id={kindId} label="Kind" error={errors.field.kind}>
              {(aria) => (
                <select id={kindId} {...aria} value={draft.kind} onChange={(event) => change({ kind: event.target.value as PlanKind })} className={`${FILTER_SELECT} w-full`}>
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABEL[kind]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <Field
            id={descriptionId}
            label="Description (optional)"
            hint={
              <>
                <span className={MONO}>{draft.description.length}</span> of <span className={MONO}>{DESCRIPTION_MAX}</span>
              </>
            }
            error={errors.field.description}
          >
            {(aria) => (
              <textarea
                id={descriptionId}
                {...aria}
                rows={2}
                maxLength={DESCRIPTION_MAX}
                value={draft.description}
                onChange={(event) => change({ description: event.target.value })}
                className={`${INPUT} resize-none py-2 ${errors.field.description ? 'border-danger' : 'border-line'}`}
              />
            )}
          </Field>
          <section aria-label="Milestones" className="flex flex-col gap-2">
            <h3 className="text-[15px] font-semibold text-ink">Milestones</h3>
            <p data-part="counts" className="text-[11px] text-ink-muted">
              <span className={MONO}>
                {counts.milestones}/{MILESTONES_MAX}
              </span>{' '}
              milestones · <span className={MONO}>{counts.tasks}/{TASKS_MAX}</span> tasks · days count from the plan's start
            </p>
            {errors.field.milestones ? (
              <p role="alert" data-error tabIndex={-1} className={`text-[11px] text-danger ${FOCUS}`}>
                {errors.field.milestones}
              </p>
            ) : null}
            <TemplateMilestones milestones={draft.milestones} errors={errors.milestones} onChange={(milestones) => change({ milestones })} />
          </section>
          <SharingFields
            sharing={draft.sharing}
            sharedWith={draft.sharedWith}
            teammates={teammates}
            error={errors.field.shared_with ?? errors.field.sharing ?? null}
            onChange={(sharing, sharedWith) => change({ sharing, sharedWith })}
            note={NOTE}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-4 py-3">
          <button type="button" onClick={onClose} className={QUIET}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={PRIMARY}>
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>
    </BuilderDialog>
  );
}

/** /projects/templates/new over the templates page. */
export function NewTemplateRoute() {
  const navigate = useNavigate();
  const close = () => navigate('/projects/templates');
  return <TemplateForm initial={null} onClose={close} onDone={close} />;
}

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; template: PlanTemplate };

/** /projects/templates/:templateId/edit: yours only; a built-in template or
 *  someone else's reads a notice (spec §1.3). */
export function EditTemplateRoute() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const id = templateId && /^\d+$/.test(templateId) ? Number(templateId) : null;
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<{ key: string; load: Load } | null>(null);
  const key = `${id}#${attempt}`;
  useEffect(() => {
    if (id === null) return;
    let alive = true;
    fetchTemplate(id).then(
      (template) => {
        if (alive) setLoad({ key, load: { status: 'ready', template } });
      },
      (err: unknown) => {
        if (!alive) return;
        setLoad({ key, load: err instanceof ApiError && err.status === 404 ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, 'Could not load this template.') } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const close = () => navigate('/projects/templates');
  const current: Load = id === null ? { status: 'missing' } : load?.key === key ? load.load : { status: 'loading' };
  if (current.status === 'ready' && current.template.is_owner) return <TemplateForm initial={current.template} onClose={close} onDone={close} />;
  const title = current.status === 'ready' ? `Edit ${current.template.name}` : 'Edit template';
  return (
    <BuilderDialog title={title} onClose={close}>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {current.status === 'loading' ? <p className="text-[13px] text-ink-muted">Loading the template…</p> : null}
        {current.status === 'failed' ? <ErrorBlock message={current.message} onRetry={() => setAttempt((n) => n + 1)} /> : null}
        {current.status === 'missing' ? (
          <EmptyState title="Template not found" detail="It may have been deleted, or it isn't shared with you." action={<Link to="/projects/templates" className={`${QUIET} border border-line`}>All templates</Link>} />
        ) : null}
        {current.status === 'ready' ? (
          <EmptyState
            title={current.template.is_builtin ? "Built-in templates can't be changed" : `Only ${current.template.owner?.name ?? 'its owner'} can edit this template`}
            detail="Use it to start a plan, then save that plan as a template of your own."
            action={
              <Link to={`/projects/new?template=${current.template.id}`} className={`${QUIET} border border-line`}>
                Use
              </Link>
            }
          />
        ) : null}
      </div>
    </BuilderDialog>
  );
}
```

- [ ] **Step 6: Route them in the test render**

In `src/pages/plans/testPages.tsx`, add `import { TemplatesPage } from './TemplatesPage';` and `import { EditTemplateRoute, NewTemplateRoute } from './TemplateEditor';`, and at the `{/* ROUTES … */}` marker, **before** the `/projects/:id` route, add:

```tsx
            <Route
              path="/projects/templates"
              element={
                <>
                  <TemplatesPage />
                  <Where />
                </>
              }
            >
              <Route path="new" element={<NewTemplateRoute />} />
              <Route path=":templateId/edit" element={<EditTemplateRoute />} />
            </Route>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/pages/plans/Templates.test.tsx src/pages/plans/PlanPage.test.tsx src/pages/plans/PlanEdit.test.tsx src/pages/segments src/pages/surveys src/pages/rules`
Expected: PASS (Templates 9 tests; the plan page suites unchanged; every `BuilderDialog` caller in Segments, Surveys and Rules still passes, wide by default).

- [ ] **Step 8: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/components/segments/BuilderDialog.tsx src/components/plans/TemplateMilestones.tsx src/components/plans/SaveAsTemplateDialog.tsx src/components/plans/PlanHeader.tsx src/pages/plans/TemplatesPage.tsx src/pages/plans/TemplateEditor.tsx src/pages/plans/testPages.tsx src/pages/plans/Templates.test.tsx
git add src/components/segments/BuilderDialog.tsx src/components/plans/TemplateMilestones.tsx src/components/plans/SaveAsTemplateDialog.tsx src/components/plans/PlanHeader.tsx src/pages/plans/TemplatesPage.tsx src/pages/plans/TemplateEditor.tsx src/pages/plans/testPages.tsx src/pages/plans/Templates.test.tsx
git commit -m "feat(plans): templates: the page, the editor, and save as template

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Plans on organisation and account pages, and Start a plan over them

Spec §2.5 (organisation and account pages: a Plans section with the record's open plans in the list's compact row, Start a plan, Show finished (N), its own empty, loading and error states), §2.2 (`/organizations/:id/plans/new`, `/accounts/:id/plans/new`, the record pre-filled and locked); Decisions 12, 13.

**Files:**
- Create: `src/components/plans/RecordPlans.tsx`
- Modify: `src/pages/plans/NewPlan.tsx` (`RecordPlanRoute`), `src/pages/plans/testPages.tsx` (record routes), `src/pages/organizations/Details.tsx`, `src/pages/accounts/Details.tsx`, `src/pages/organizations/testDetail.tsx`, `src/pages/accounts/testDetail.tsx`, `src/features/organizations/testStory.ts`, `src/features/accounts/testAccountPage.ts`, `src/features/organizations/detailAskContext.ts`, `src/features/organizations/detailAskContext.test.ts`, `src/features/accounts/askContext.ts`, `src/features/accounts/askContext.test.ts`, `src/components/layout/Navbar.tsx`, `src/components/layout/Navbar.test.tsx`, `src/layouts/DashboardLayout.tsx`, `src/layouts/DashboardLayout.test.tsx`
- Test: `src/components/plans/RecordPlans.test.tsx`

**Interfaces:**
- Consumes: Task 2's `fetchRecordPlans`, `stubPlans`; Task 4's `PlanRowItem`; Task 1's `isOpen`, `newPlanPath`; Task 7's `NewPlanForm`; `stubOrganizationPage`, `renderOrganizationPage`, `stubAccountPage`, `renderAccountPage`.
- Produces: `RecordPlans({ record: { kind; id } })` (`<section data-part="plans">`); `RecordPlanRoute({ kind })`; `stubOrganizationPage({ plans? })` and `stubAccountPage({ plans? })` answer the record's plans (default none).

- [ ] **Step 1: Write the failing test**

Create `src/components/plans/RecordPlans.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { stubAccountPage } from '../../features/accounts/testAccountPage';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { stubOrganizationPage } from '../../features/organizations/testStory';
import type { PlanRow } from '../../features/plans/planTypes';
import { stubPlans } from '../../features/plans/testPlans';
import { requestsOf } from '../../features/surveys/testSurveys';
import { renderAccountPage } from '../../pages/accounts/testDetail';
import { renderOrganizationPage } from '../../pages/organizations/testDetail';
import { renderPlans } from '../../pages/plans/testPages';
import { resetViewport } from '../../test/viewport';
import { RecordPlans } from './RecordPlans';

const PIZZA_ROW: PlanRow = {
  id: 43, name: 'QBR · Pizza Hut', kind: 'qbr', status: 'not_started', record: { kind: 'organization', id: 7, name: 'Pizza Hut' },
  owner: { id: 1, name: 'Alice' }, start_date: '2026-10-06', target_date: '2026-10-20', milestones_done: 0, milestones_total: 3,
  tasks_done: 0, tasks_total: 5, next_due: '2026-10-06', is_overdue: false, can_edit: true,
};
const section = () => document.querySelector('[data-part="plans"]') as HTMLElement;
const show = (record: { kind: 'organization' | 'account'; id: number }) =>
  render(
    <MemoryRouter>
      <RecordPlans record={record} />
    </MemoryRouter>,
  );

describe("a record's Plans section (spec §2.5)", () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('lists the open plans without the record, and Start a plan opens over the page', async () => {
    stubPlans();
    show({ kind: 'organization', id: 1 });
    const open = await screen.findByRole('list', { name: 'Open plans' });
    expect(within(open).getByRole('link', { name: 'Onboarding · Globex' })).toHaveAttribute('href', '/projects/41');
    expect(within(open).queryByRole('link', { name: 'Globex' })).toBeNull();
    expect(within(section()).getByRole('link', { name: 'Start a plan' })).toHaveAttribute('href', '/organizations/1/plans/new');
  });

  it('keeps finished plans behind Show finished (N)', async () => {
    stubPlans();
    show({ kind: 'organization', id: 2 });
    expect(await screen.findByText('No open plans.')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Show finished (1)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(within(screen.getByRole('list', { name: 'Finished plans' })).getByRole('link', { name: 'Renewal prep · Initech' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide finished' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows a skeleton while loading and the error with Try again', async () => {
    let fail = true;
    stubPlans({ recordPlans: () => (fail ? { status: 500, body: { detail: 'Try later.' } } : undefined) });
    show({ kind: 'account', id: 13 });
    expect(screen.getByRole('status', { name: 'Loading plans' })).toBeInTheDocument();
    expect(await screen.findByText('Try later.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Show finished (1)' })).toBeInTheDocument();
  });

  it("sits on an organisation's page, under its header", async () => {
    stubOrganizationPage({ plans: [PIZZA_ROW] });
    renderOrganizationPage('/organizations/7');
    await waitFor(() => expect(within(section()).getByRole('link', { name: 'QBR · Pizza Hut' })).toBeInTheDocument());
    expect(within(section()).getByRole('link', { name: 'Start a plan' })).toHaveAttribute('href', '/organizations/7/plans/new');
  });

  it("sits on an account's page, and the page stays under its plans/new route", async () => {
    stubAccountPage();
    renderAccountPage('/accounts/12/plans/new');
    expect(await screen.findByText('Plan modal')).toBeInTheDocument();
    await waitFor(() => expect(within(section()).getByText('No open plans.')).toBeInTheDocument());
  });

  it("keeps an organisation's page under its plans/new route", async () => {
    stubOrganizationPage();
    renderOrganizationPage('/organizations/7/plans/new');
    expect(await screen.findByText('Plan modal')).toBeInTheDocument();
    await waitFor(() => expect(within(section()).getByText('No open plans.')).toBeInTheDocument());
  });
});

describe('Start a plan over a record (spec §2.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('locks the record it opened over, and starts the plan on it', async () => {
    const { spy } = stubPlans();
    renderPlans('/accounts/14/plans/new');
    const modal = await screen.findByRole('dialog', { name: 'New plan' });
    await waitFor(() => expect(modal.querySelector('[data-part="record"]')).toHaveTextContent('Initech APAC'));
    expect(within(modal).queryByRole('button', { name: 'Change' })).toBeNull();
    expect(within(modal).queryByRole('searchbox')).toBeNull();
    await userEvent.click(await within(modal).findByRole('radio', { name: /^QBR/ }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/projects/500'));
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)[0].body).toMatchObject({ template: 4, account: 14, name: 'QBR · Initech APAC' });
  });

  it('goes back to the record on Cancel', async () => {
    stubPlans();
    renderPlans('/organizations/1/plans/new');
    const modal = await screen.findByRole('dialog', { name: 'New plan' });
    await userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/organizations/1'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

Add to `src/features/organizations/detailAskContext.test.ts`, in the test that checks `detailIdOf('/organizations/7')`:

```ts
    expect(detailIdOf('/organizations/7/plans/new')).toBe(7);
```

Add to `src/features/accounts/askContext.test.ts`, inside `describe('accountsViewOf / accountIdOf', …)`:

```ts
  it('reads the New plan modal over an account as its page', () => {
    expect(accountsViewOf('/accounts/12/plans/new')).toBe('detail');
    expect(accountIdOf('/accounts/12/plans/new')).toBe(12);
  });
```

In `src/layouts/DashboardLayout.test.tsx`, add `'/organizations/7/plans/new'` and `'/accounts/12/plans/new'` to the `adds no padding around %s` list (after `'/accounts/abc'`).

In `src/components/layout/Navbar.test.tsx`, after the "Navbar on Scenarios" `describe`, add:

```tsx
describe('Navbar over a record\'s New plan (plans spec §2.2)', () => {
  it.each([
    ['/organizations/7/plans/new', 'Organizations', '/organizations/list'],
    ['/accounts/12/plans/new', 'Accounts', '/accounts/list'],
  ])('keeps the record page\'s bar on %s', (url, label, href) => {
    renderNavbar(url);
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: label })).toHaveAttribute('href', href);
    expect(document.querySelector('header')).toHaveClass('h-16', 'px-4');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/components/plans/RecordPlans.test.tsx src/features/organizations/detailAskContext.test.ts src/features/accounts/askContext.test.ts src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.test.tsx`
Expected: FAIL: "./RecordPlans" does not resolve, and the new path cases fail.

- [ ] **Step 3: Write the section and the route**

Create `src/components/plans/RecordPlans.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchRecordPlans } from '../../features/plans/planApi';
import { isOpen, newPlanPath } from '../../features/plans/planText';
import type { PlanRow, RecordKind } from '../../features/plans/planTypes';
import { BUTTON, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { PlanRowItem } from './PlanRowItem';

type Answer = { key: number; rows: PlanRow[] | null; error: string | null };

/** A record's plans (spec §2.5): the open ones in the list's compact row,
 *  flat inside this one surface (no card in a card); the finished ones
 *  behind Show finished (N); Start a plan opens the modal over the page. */
export function RecordPlans({ record }: { record: { kind: RecordKind; id: number } }) {
  const { kind, id } = record;
  const headingId = useId();
  const finishedId = useId();
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchRecordPlans({ kind, id }).then(
      ({ results }) => {
        if (alive) setAnswer({ key: attempt, rows: results, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: attempt, rows: null, error: errorMessage(err, 'Could not load plans.') });
      },
    );
    return () => {
      alive = false;
    };
  }, [kind, id, attempt]);
  const current = answer?.key === attempt ? answer : null;
  const rows = current?.rows ?? null;
  const open = rows?.filter((row) => isOpen(row.status)) ?? [];
  const finished = rows?.filter((row) => !isOpen(row.status)) ?? [];

  return (
    <section aria-labelledby={headingId} data-part="plans" className="flex flex-col gap-2 rounded-xl bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
          Plans
        </h2>
        <Link to={newPlanPath({ kind, id })} className={BUTTON}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Start a plan
        </Link>
      </div>
      {!current ? (
        <div role="status" aria-label="Loading plans" className="flex flex-col gap-2">
          {[0, 1].map((n) => (
            <span key={n} aria-hidden="true" className="block h-10 animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      ) : null}
      {current?.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
          <span>{current.error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
            Try again
          </button>
        </div>
      ) : null}
      {rows ? (
        <>
          {open.length > 0 ? (
            <ul aria-label="Open plans" className="flex flex-col divide-y divide-line-subtle">
              {open.map((row) => (
                <PlanRowItem key={row.id} row={row} showRecord={false} flat />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-muted">No open plans.</p>
          )}
          {finished.length > 0 ? (
            <>
              <button
                type="button"
                aria-expanded={showFinished}
                aria-controls={showFinished ? finishedId : undefined}
                onClick={() => setShowFinished((value) => !value)}
                className={`${QUIET} self-start`}
              >
                {showFinished ? (
                  'Hide finished'
                ) : (
                  <>
                    Show finished (<span className={MONO}>{finished.length}</span>)
                  </>
                )}
              </button>
              {showFinished ? (
                <ul id={finishedId} aria-label="Finished plans" className="flex flex-col divide-y divide-line-subtle">
                  {finished.map((row) => (
                    <PlanRowItem key={row.id} row={row} showRecord={false} flat />
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
```

In `src/pages/plans/NewPlan.tsx`, add `useParams` to the `react-router-dom` import and append:

```tsx
/** /organizations/:id/plans/new and /accounts/:id/plans/new: the modal over
 *  the record's page, the record chosen and locked (spec §2.2). */
export function RecordPlanRoute({ kind }: { kind: RecordKind }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const recordId = Number(id);
  const back = kind === 'organization' ? `/organizations/${id}` : `/accounts/${id}`;
  return <NewPlanForm fixed={{ kind, id: recordId }} initialTemplate={null} onClose={() => navigate(back)} />;
}
```

In `src/pages/plans/testPages.tsx`, add `Outlet` to the `react-router-dom` import, `RecordPlanRoute` to the `./NewPlan` import, and at the `{/* ROUTES … */}` marker:

```tsx
            {(['organization', 'account'] as const).map((kind) => (
              <Route
                key={kind}
                path={kind === 'organization' ? '/organizations/:id' : '/accounts/:id'}
                element={
                  <>
                    <p>{kind === 'organization' ? 'Organization page' : 'Account page'}</p>
                    <Outlet />
                    <Where />
                  </>
                }
              >
                <Route path="plans/new" element={<RecordPlanRoute kind={kind} />} />
              </Route>
            ))}
```

- [ ] **Step 4: Put the section and the Outlet on the record pages**

In `src/pages/organizations/Details.tsx`:
1. Add `Outlet` to a `react-router-dom` import (`import { Outlet, useParams } from 'react-router-dom';`) and `import { RecordPlans } from '../../components/plans/RecordPlans';`.
2. Directly after the `{row && org.error ? (… <RefreshFailed …/>) : null}` block and before the `{/* On every tab, … */}` comment above `<AccountChips`, add:

```tsx
        {/* Plans (plans spec §2.5): the same on every tab (Decision 12). */}
        <RecordPlans record={{ kind: 'organization', id: orgId }} />
```

3. Directly before the closing `</OrganizationsFrame>`, add:

```tsx
      {/* /organizations/:id/plans/new: the New plan modal over this page. */}
      <Outlet />
```

In `src/pages/accounts/Details.tsx`:
1. Add `Outlet` to the `react-router-dom` import and `import { RecordPlans } from '../../components/plans/RecordPlans';`.
2. Directly after the `{row && account.error ? (… <RefreshFailed …/>) : null}` block and before `<DetailTabs`, add:

```tsx
          {/* Plans (plans spec §2.5): the same on every tab (Decision 12). */}
          <RecordPlans record={{ kind: 'account', id: accountId }} />
```

3. Directly before the closing `</OrganizationsFrame>`, add `<Outlet />` with the comment `{/* /accounts/:id/plans/new: the New plan modal over this page. */}`.

In `src/pages/organizations/testDetail.tsx`, change the page route (`key="page"`) to hold a child marker:

```tsx
    <Route
      key="page"
      path="/organizations/:id"
      element={
        <>
          <Details />
          <Where />
          {history || goTo ? <History goTo={goTo} /> : null}
        </>
      }
    >
      <Route path="plans/new" element={<p>Plan modal</p>} />
    </Route>,
```

In `src/pages/accounts/testDetail.tsx`, give the `/accounts/:id` route the same child:

```tsx
            <Route
              path="/accounts/:id"
              element={
                <>
                  <AccountDetails />
                  <Where />
                </>
              }
            >
              <Route path="plans/new" element={<p>Plan modal</p>} />
            </Route>
```

- [ ] **Step 5: Teach the page stubs the record's plans**

In `src/features/organizations/testStory.ts`:
1. Add `import type { PlanRow } from '../plans/planTypes';` and, to `OrganizationPageStub`, `/** GET customers/:id/plans/ (default none). */ plans?: PlanRow[];`.
2. Directly after `const orgPath = current ? \`/customers/${current.id}/\` : null;` inside the spy, add:

```ts
    if (/^\/customers\/\d+\/plans\/$/.test(path) && method === 'GET') return json(200, { results: stub.plans ?? [] });
```

In `src/features/accounts/testAccountPage.ts`:
1. Add `import type { PlanRow } from '../plans/planTypes';` and, to `AccountPageStub`, `/** GET accounts/:id/plans/ (default none). */ plans?: PlanRow[];`.
2. Directly before `const own = /^\/accounts\/(\d+)\/(.*)$/.exec(path);`, add:

```ts
    if (/^\/accounts\/\d+\/plans\/$/.test(path) && method === 'GET') return json(200, { results: stub.plans ?? [] });
```

- [ ] **Step 6: Read `/plans/new` as the record's page everywhere the path decides**

Each of these regular expressions gains an optional `/plans/new`:

| File | Before | After |
|---|---|---|
| `src/components/layout/Navbar.tsx` (`isAccountDetail`) | `/^\/accounts\/(?!list\/?$\|board\/?$)[^/]+\/?$/` | `/^\/accounts\/(?!list\/?$\|board\/?$)[^/]+(\/plans\/new)?\/?$/` |
| `src/components/layout/Navbar.tsx` (`isOrgDetail`) | `/^\/organizations\/\d+$/` | `/^\/organizations\/\d+(\/plans\/new)?$/` |
| `src/layouts/DashboardLayout.tsx` (in `isOrgView`) | `/^\/organizations\/\d+$/` | `/^\/organizations\/\d+(\/plans\/new)?$/` |
| `src/layouts/DashboardLayout.tsx` (`isAccountsView`) | `/^\/accounts\/[^/]+\/?$/` | `/^\/accounts\/[^/]+(\/plans\/new)?\/?$/` |
| `src/features/organizations/detailAskContext.ts` (`detailIdOf`) | `/^\/organizations\/([^/]+)$/` | `/^\/organizations\/([^/]+)(?:\/plans\/new)?$/` |
| `src/features/accounts/askContext.ts` (`ONE`) | `/^\/accounts\/([^/]+)\/?$/` | `/^\/accounts\/([^/]+)(?:\/plans\/new)?\/?$/` |

(The `\|` in the table is a literal `|` in the code.) Add a one-line comment above each: `// …/plans/new is the New plan modal over this page (plans spec §2.2).`

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/components/plans/RecordPlans.test.tsx src/features/organizations/detailAskContext.test.ts src/features/accounts/askContext.test.ts src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.test.tsx`
Expected: PASS.

Then the record pages' own suites, which now render the section:

Run: `npx vitest run --maxWorkers=2 src/pages/organizations src/pages/accounts src/components/organizations/detail src/components/accounts src/e2e/organizationDetail.test.tsx src/e2e/accountPage.test.tsx src/e2e/organizationsAsk.test.tsx src/e2e/accountsAsk.test.tsx`
Expected: PASS. If a test that counts headings, links or statuses on the page now sees the Plans section, narrow that query to its own part (`within(…)`) rather than removing the section; if a test's own `fetch` stub (not the page stubs) answers `/customers/:id/plans/` with a 404, the section shows its error inside itself and nothing else changes.

- [ ] **Step 8: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/components/plans/RecordPlans.tsx src/components/plans/RecordPlans.test.tsx src/pages/plans/NewPlan.tsx src/pages/plans/testPages.tsx src/pages/organizations/Details.tsx src/pages/accounts/Details.tsx src/pages/organizations/testDetail.tsx src/pages/accounts/testDetail.tsx src/features/organizations/testStory.ts src/features/accounts/testAccountPage.ts src/features/organizations/detailAskContext.ts src/features/organizations/detailAskContext.test.ts src/features/accounts/askContext.ts src/features/accounts/askContext.test.ts src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx
git add src/components/plans/RecordPlans.tsx src/components/plans/RecordPlans.test.tsx src/pages/plans/NewPlan.tsx src/pages/plans/testPages.tsx src/pages/organizations/Details.tsx src/pages/accounts/Details.tsx src/pages/organizations/testDetail.tsx src/pages/accounts/testDetail.tsx src/features/organizations/testStory.ts src/features/accounts/testAccountPage.ts src/features/organizations/detailAskContext.ts src/features/organizations/detailAskContext.test.ts src/features/accounts/askContext.ts src/features/accounts/askContext.test.ts src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx
git commit -m "feat(plans): plans on organisation and account pages, started over them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Rules: the fifth action, Start a plan

Spec §2.5 "Rule builder" (a fifth Then card, Start a plan, with a template picker of built-in, yours and shared with you; each action type once and 1–3 actions still apply; the sentence reads "…then start a Save plan"; the nights show "started" and "already had one" per record; the paused notice handles `template_gone`), §1.8 (validation "Choose a template you can use."; contacts' plans go on the parent; dry run "would start N plans · M already have one"), §4 "Rules additions"; Decision 15; Contract notes 1–4.

**Files:**
- Modify: `src/features/rules/ruleTypes.ts`, `src/features/rules/ruleOptions.ts`, `src/features/rules/ruleDraft.ts`, `src/features/rules/ruleText.ts`, `src/features/rules/testRules.ts`, `src/components/rules/ActionFields.tsx`, `src/components/rules/ActionCards.tsx`, `src/components/rules/TestPanel.tsx`, `src/pages/rules/RuleBuilder.tsx`
- Test: `src/features/rules/ruleText.test.ts`, `src/features/rules/ruleDraft.test.ts`, `src/features/rules/ruleOptions.test.ts`, `src/components/rules/ActionCards.test.tsx`, `src/pages/rules/RuleBuilder.test.tsx`, `src/pages/rules/RulePage.test.tsx` (all modified)

**Interfaces:**
- Consumes: Task 1's `planNoun`; Task 2's `templateRef`, `stubPlans`; Task 7's `useTemplates`.
- Produces:
  - `ruleTypes.ts`: `PlanAction { action: 'plan'; template: { id: number; name: string } | null }` (read, and the draft's), `PlanActionWrite { action: 'plan'; template: number | null }`, `RuleAction` now includes `PlanAction`, new `RuleActionWrite`; `RuleWrite.actions` and `RuleTestRequest.actions` are `RuleActionWrite[]`; `PausedReason` gains `'template_gone'`; `RuleTestResult.plans?: { would_start: number; already_open: number }`.
  - `ruleOptions.ts`: `ACTION_LABEL.plan = 'Start a plan'`, `ACTION_ORDER` ends with `'plan'`, `SAY.CHOOSE_TEMPLATE`.
  - `ruleDraft.ts`: `ActionDraft` includes `PlanAction`; `newAction('plan', …) → { action: 'plan', template: null }`; `toActions(…): RuleActionWrite[]`.
  - `ruleText.ts`: `ActionLike`; `thenText`, `ruleParts`, `turnOnText` take `ActionLike`s; `planTestParts(plans)`.
  - `testRules.ts`: `SAVE_ACTION`, `SAVE_RULE` (id 10, "Save at-risk renewals", paused `template_gone`, not in `RULES`); `runNight` answers a plan action per record; the dry run answers `plans`.
  - `ActionFields.tsx`: `PlanFields({ action, errors, onChange })`.

- [ ] **Step 1: Write the failing tests**

In `src/features/rules/ruleText.test.ts`, add `planTestParts` and `thenText` to the `./ruleText` import, `PlanAction` to the `./ruleTypes` type import, and append:

```ts
describe('the Start a plan action (plans spec §1.8, §2.5)', () => {
  const SAVE: PlanAction = { action: 'plan', template: { id: 3, name: 'Save plan' } };

  it('reads as "start a Save plan" at the end of the sentence', () => {
    expect(sentenceText(ruleParts({ ...BLANK, actions: [NOTIFY_ME, SAVE] }, RISK))).toBe('When an organisation enters Renewal risk → notify me, start a Save plan');
    expect(thenText([{ action: 'plan', template: { id: 1, name: 'Onboarding' } }])).toBe('start an Onboarding plan');
    expect(thenText([{ action: 'plan', template: { id: 4, name: 'QBR' } }])).toBe('start a QBR plan');
    expect(thenText([{ action: 'plan', template: null }])).toBe('start a plan');
  });

  it("reads a night's plan results per record", () => {
    expect(actionResultText({ action: 'plan', status: 'done', detail: 'started' })).toBe('Plan: started');
    expect(actionResultText({ action: 'plan', status: 'unchanged', detail: 'already had one' })).toBe('Plan: already had one');
    expect(actionResultText({ action: 'plan', status: 'failed', detail: 'no owner' })).toBe('Plan: failed (no owner)');
  });

  it('tells the owner what to do when its template was deleted', () => {
    expect(pausedText('template_gone', 'Its plan template was deleted.', true)).toBe(
      'It switched itself off. Its plan template was deleted. Choose another template in Edit, then turn it on.',
    );
    expect(pausedText('template_gone', 'Its plan template was deleted.', false)).toBe('It switched itself off. Its plan template was deleted.');
  });

  it("words the dry run's plans, the figures apart", () => {
    expect(planTestParts({ would_start: 2, already_open: 1 }).map((part) => part.text).join('')).toBe('Would start 2 plans · 1 already has one');
    expect(planTestParts({ would_start: 1, already_open: 3 }).map((part) => part.text).join('')).toBe('Would start 1 plan · 3 already have one');
    expect(planTestParts({ would_start: 2, already_open: 1 }).filter((part) => part.numeric).map((part) => part.text)).toEqual(['2', '1']);
  });
});
```

In `src/features/rules/ruleOptions.test.ts`, change the expectations in "offers no lifecycle action to a contact segment" to:

```ts
    expect(actionsFor('customer')).toEqual(['notify', 'task', 'lifecycle', 'survey', 'plan']);
    expect(actionsFor('contact')).toEqual(['notify', 'task', 'survey', 'plan']);
```

In `src/features/rules/ruleDraft.test.ts`, add `toActions` to the `./ruleDraft` import, change the two `availableActions(...)` expectations in "offers each unused action once…" to `['task', 'lifecycle', 'survey', 'plan']` and `['task', 'survey', 'plan']`, and append inside the top-level `describe`:

```ts
  it('starts a plan action with no template, refuses it so, and sends the id', () => {
    expect(newAction('plan', 'customer', 'Acme Inc')).toEqual({ action: 'plan', template: null });
    expect(checkDraft(draft({ actions: [NOTIFY_ME, { action: 'plan', template: null }] }), 'customer').action).toEqual([{}, { template: 'Choose a template you can use.' }]);
    expect(toActions(draft({ actions: [{ action: 'plan', template: { id: 3, name: 'Save plan' } }] }), 'customer')).toEqual([{ action: 'plan', template: 3 }]);
  });
```

In `src/components/rules/ActionCards.test.tsx`, add `afterEach`, `vi` to the `vitest` import, `waitFor` to the Testing Library import, `import { stubPlans } from '../../features/plans/testPlans';`, and append:

```tsx
describe('ActionCards: Start a plan (plans spec §2.5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds Start a plan with templates grouped as built-in, yours and shared with you', async () => {
    stubPlans();
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Start a plan' }));
    const select = within(card('plan')).getByRole('combobox', { name: 'Template' });
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select.querySelector('optgroup[label="Built-in"]')).toHaveTextContent('OnboardingSuccess planSave planQBR');
    expect(select.querySelector('optgroup[label="Yours"]')).toHaveTextContent('Renewal prep');
    expect(select.querySelector('optgroup[label="Shared with you"]')).toHaveTextContent("Carl's expansion play");
    await userEvent.selectOptions(select, '3');
    expect(actionsNow()[1]).toEqual({ action: 'plan', template: { id: 3, name: 'Save plan' } });
  });

  it('shows the refusal at the template', async () => {
    stubPlans();
    render(<Harness start={[{ ...NOTIFY_ME }, { action: 'plan', template: null }]} errors={[{}, { template: 'Choose a template you can use.' }]} />);
    expect(within(card('plan')).getByRole('combobox', { name: 'Template' })).toHaveAccessibleDescription(/Choose a template you can use\./);
  });
});
```

In `src/pages/rules/RuleBuilder.test.tsx`, add `import { stubPlans } from '../../features/plans/testPlans';` and append inside the `describe`:

```tsx
  it('starts a plan as an action: the sentence names it, the test counts the plans, and it sends the id', async () => {
    const { spy } = stubPlans();
    const modal = await openNew();
    await userEvent.type(within(modal).getByRole('textbox', { name: 'Name' }), 'Save renewals');
    await userEvent.selectOptions(within(modal).getByRole('combobox', { name: 'Segment' }), '7');
    await userEvent.click(within(modal).getByRole('button', { name: 'Start a plan' }));
    const select = within(modal.querySelector('[data-action="plan"]') as HTMLElement).getByRole('combobox', { name: 'Template' });
    await waitFor(() => expect(select).not.toBeDisabled());
    await userEvent.selectOptions(select, '3');
    expect(modal.querySelector('[data-part="rule-sentence"]')).toHaveTextContent('When an organisation enters Renewal risk → notify me, start a Save plan');
    await userEvent.click(within(modal).getByRole('button', { name: 'Test this rule' }));
    await waitFor(() => expect(modal.querySelector('[data-part="plans"]')).toHaveTextContent('Would start 2 plans · 1 already has one'));
    await userEvent.click(within(modal).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(where()).toBe('/scenarios/rules/100'));
    expect((requestsOf(spy, 'POST', /^\/rules\/$/)[0].body as { actions: unknown[] }).actions).toEqual([NOTIFY_ME_ACTION, { action: 'plan', template: 3 }]);
  });
```

In `src/pages/rules/RulePage.test.tsx`, change the `testRules` import to `import { NOTIFY_ME_ACTION, RULES, SAVE_ACTION, SAVE_RULE, stubRules } from '../../features/rules/testRules';` and append inside the `describe`:

```tsx
  it("tells the owner how to mend a rule whose plan template was deleted", async () => {
    stubRules({ rules: [...RULES, SAVE_RULE] });
    renderRules('/scenarios/rules/10');
    expect(await screen.findByText('It switched itself off. Its plan template was deleted. Choose another template in Edit, then turn it on.')).toBeInTheDocument();
    expect(document.querySelector('[data-part="sentence"]')).toHaveTextContent('When an organisation enters Renewal risk → start a plan');
  });

  it("shows what a night's plan did for each record", async () => {
    const { runNight } = stubRules({ rules: [...RULES, { ...SAVE_RULE, is_active: true, paused_reason: '', paused_message: '', actions: [NOTIFY_ME_ACTION, SAVE_ACTION] }] });
    expect(runNight(10)).toMatchObject({ fired: 2 });
    renderRules('/scenarios/rules/10');
    await userEvent.click(within(await nights()).getAllByRole('button')[0]);
    expect(await screen.findByText('Notify: done · Plan: already had one')).toBeInTheDocument();
    expect(screen.getByText('Notify: done · Plan: started')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/features/rules src/components/rules/ActionCards.test.tsx src/pages/rules/RuleBuilder.test.tsx src/pages/rules/RulePage.test.tsx`
Expected: FAIL: `planTestParts` is not exported, `SAVE_RULE` is not exported, no "Start a plan" button, and the action lists lack `'plan'`.

- [ ] **Step 3: The types and the options**

In `src/features/rules/ruleTypes.ts`:

1. Change `PausedReason` to `export type PausedReason = '' | 'segment_gone' | 'segment_not_owned' | 'owner_inactive' | 'template_gone';`.
2. After `SurveyAction`, add:

```ts
/** Start a plan (plans spec §4 "Rules additions"), as read: the template a
 *  ref, null once deleted. The builder's draft holds this shape too. */
export interface PlanAction {
  action: 'plan';
  template: { id: number; name: string } | null;
}

/** Start a plan as written: the template's id (Contract note 1). Null only
 *  before one is chosen; the client check stops it. */
export interface PlanActionWrite {
  action: 'plan';
  template: number | null;
}
```

3. Replace `export type RuleAction = NotifyAction | TaskAction | LifecycleAction | SurveyAction;` with:

```ts
export type RuleAction = NotifyAction | TaskAction | LifecycleAction | SurveyAction | PlanAction;
/** What POST/PATCH rules/ and POST rules/test/ send. */
export type RuleActionWrite = NotifyAction | TaskAction | LifecycleAction | SurveyAction | PlanActionWrite;
```

4. In `RuleWrite` and in `RuleTestRequest`, change `actions: RuleAction[];` to `actions: RuleActionWrite[];`.
5. In `RuleTestResult`, add `/** With a plan action only. */ plans?: { would_start: number; already_open: number };`.

In `src/features/rules/ruleOptions.ts`: add `plan: 'Start a plan',` to `ACTION_LABEL`; change `ACTION_ORDER` to `['notify', 'task', 'lifecycle', 'survey', 'plan']`; add `CHOOSE_TEMPLATE: 'Choose a template you can use.',` to `SAY` (after `NO_ROLES`).

- [ ] **Step 4: The draft**

In `src/features/rules/ruleDraft.ts`:

1. Add `PlanAction` and `RuleActionWrite` to the `./ruleTypes` type import, and drop `RuleAction` from it if nothing else uses it.
2. `export type ActionDraft = NotifyAction | TaskAction | LifecycleDraft | SurveyAction | PlanAction;`
3. Add the overload `export function newAction(type: 'plan', kind: SegmentKind | null, workspace: string): PlanAction;` before the implementation signature, and in its `switch` add:

```ts
    case 'plan':
      return { action: 'plan', template: null };
```

4. Replace `toActions` with:

```ts
/** The actions as sent: trimmed, people only for "Chosen teammates", no
 *  roles for a contact segment, a plan's template as its id. An unchosen
 *  stage or template goes as "" or null and the server answers at the
 *  field (the client check stops it first). */
export function toActions(draft: RuleDraft, kind: SegmentKind | null): RuleActionWrite[] {
  return draft.actions.map((action): RuleActionWrite => {
    if (action.action === 'notify') return { ...action, people: action.to === 'people' ? action.people : [], message: action.message.trim() };
    if (action.action === 'task') return { ...action, title: action.title.trim() };
    if (action.action === 'survey') return { ...action, subject: action.subject.trim(), intro: action.intro.trim(), roles: kind === 'contact' ? [] : action.roles };
    if (action.action === 'plan') return { action: 'plan', template: action.template?.id ?? null };
    return action as LifecycleAction;
  });
}
```

5. In `checkAction`, replace the final `} else {` (the survey branch) with `} else if (action.action === 'survey') {`, and after that branch's closing brace add:

```ts
  } else if (!action.template) {
    out.template = SAY.CHOOSE_TEMPLATE;
  }
```

(so the chain ends `… } else if (action.action === 'survey') { … } else if (!action.template) { out.template = SAY.CHOOSE_TEMPLATE; }`).

- [ ] **Step 5: The words**

In `src/features/rules/ruleText.ts`:

1. Add `import { planNoun } from '../plans/planText';`, and `LifecycleStage`, `PlanAction` to the `./ruleTypes` type import.
2. Above `actionWords`, add:

```ts
/** An action as a sentence reads it: a saved one, or the builder's draft
 *  (a lifecycle stage may still be unchosen). */
export type ActionLike = RuleAction | { action: 'lifecycle'; stage: LifecycleStage | '' };

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** "start a Save plan", "start an Onboarding plan" (Decision 15). */
function planWords(action: PlanAction): string {
  if (!action.template) return 'start a plan';
  const noun = planNoun(action.template.name);
  return `start ${article(noun)} ${noun}`;
}
```

3. Change `function actionWords(action: RuleAction): string` to `function actionWords(action: ActionLike): string`, and add to its `switch`:

```ts
    case 'plan':
      return planWords(action);
```

4. Change the parameter types: `thenText(actions: readonly ActionLike[])`, `ruleParts(rule: TriggerFields & { actions: readonly ActionLike[] }, segment: SegmentLike)`, `turnOnText(actions: readonly ActionLike[], segment: SegmentLike)`.
5. Add `plan: 'Plan',` to `SHORT`, and make `actionResultText` read:

```ts
export function actionResultText(result: ActionResult): string {
  // A plan's detail is the whole story: "started", "already had one" (Contract note 2).
  if (result.action === 'plan' && result.status !== 'failed' && result.detail) return `Plan: ${result.detail}`;
  return `${SHORT[result.action]}: ${STATUS_WORDS[result.status]}${result.detail ? ` (${result.detail})` : ''}`;
}
```

6. Add `template_gone: 'Choose another template in Edit, then turn it on.',` to `PAUSE_FIX`.
7. Append:

```ts
/** The dry run's plans (spec §1.8): "Would start 2 plans · 1 already has one". */
export function planTestParts(plans: { would_start: number; already_open: number }): SentencePart[] {
  return [
    { text: 'Would start ', role: 'join' },
    { text: String(plans.would_start), role: 'value', numeric: true },
    { text: ` ${plural(plans.would_start, 'plan', 'plans')} · `, role: 'join' },
    { text: String(plans.already_open), role: 'value', numeric: true },
    { text: ` already ${plural(plans.already_open, 'has', 'have')} one`, role: 'join' },
  ];
}
```

- [ ] **Step 6: The stub**

In `src/features/rules/testRules.ts`:

1. Add `import { templateRef } from '../plans/testTemplates';` and `PlanAction`, `RuleActionWrite` to the `./ruleTypes` type import.
2. After `ORPHAN`, add:

```ts
/** Start a Save plan (plans spec §1.8). */
export const SAVE_ACTION: PlanAction = { action: 'plan', template: { id: 3, name: 'Save plan' } };
/** Mine: it switched itself off when its plan template was deleted. Not in
 *  RULES, so the Rules list's tests keep their four rows. */
export const SAVE_RULE: StoredRule = {
  ...BASE, id: 10, name: 'Save at-risk renewals', is_active: false, paused_reason: 'template_gone', paused_message: 'Its plan template was deleted.',
  segment: RENEWAL_RISK, trigger: 'entered', actions: [{ action: 'plan', template: null }], sharing: 'private', owner: ME, is_owner: true,
};
/** Records that already have an open plan from any template, for a night. */
const ALREADY_OPEN = new Set(['customer:1']);
```

3. In `check`, replace

```ts
    const actions = merged.actions as RuleAction[];
    if (!Array.isArray(actions) || actions.length < 1 || actions.length > 3) return bad({ actions: [SAY.ACTION_COUNT] });
```

with

```ts
    const sent = merged.actions as (RuleAction | RuleActionWrite)[];
    if (!Array.isArray(sent) || sent.length < 1 || sent.length > 3) return bad({ actions: [SAY.ACTION_COUNT] });
    // A plan's template is written as an id and kept as a ref (Contract note 1).
    const actions: RuleAction[] = sent.map((action) =>
      action.action === 'plan' ? { action: 'plan', template: typeof action.template === 'number' ? templateRef(action.template) : action.template } : action,
    );
```

   and inside the `errors` map, after the `seen.add(action.action);` line, add:

```ts
      if (action.action === 'plan' && !action.template) return { template: [SAY.CHOOSE_TEMPLATE] };
```

4. In the `/rules/test/` branch, replace its final `return json(200, TESTS[segmentId] ?? …);` with:

```ts
      const result = TESTS[segmentId] ?? { count: 0, records: [], hidden_count: 0, skipped: { cooldown: 0, cap: 0, not_visible: 0 } };
      const planned = (checked.actions ?? []).some((action) => action.action === 'plan');
      return json(200, planned ? { ...result, plans: { would_start: Math.max(0, result.count - 1), already_open: Math.min(1, result.count) } } : result);
```

5. In `runNight`, replace the `actions` mapping with:

```ts
      const actions = rule.actions.map((action): ActionResult => {
        if (action.action === 'notify' && unseen) return { action: 'notify', status: 'skipped', detail: NOBODY_DETAIL };
        if (action.action === 'plan') {
          // An open plan already there is `unchanged`, which counts as acted (Contract note 2).
          return ALREADY_OPEN.has(`${hit.kind}:${hit.id}`) ? { action: 'plan', status: 'unchanged', detail: 'already had one' } : { action: 'plan', status: 'done', detail: 'started' };
        }
        return { action: action.action, status: action.action === 'survey' ? 'queued' : 'done', detail: '' };
      });
```

- [ ] **Step 7: The card, the test line and the builder**

In `src/components/rules/ActionFields.tsx`, add `QUIET` to the styles import, `PlanAction` to the `ruleTypes` type import, `import { useTemplates } from '../plans/useTemplates';`, and append:

```tsx
/** Start a plan (plans spec §1.8, §2.5): a template the rule's owner can
 *  use. It runs at once, as the owner; a record that already has an open
 *  plan from it is left as it is. A contact's plan goes on its organisation
 *  or account. */
export function PlanFields({ action, errors, onChange }: { action: PlanAction; errors: ActionErrors; onChange: (next: PlanAction) => void }) {
  const id = useId();
  const [load, retry] = useTemplates();
  const lists = load.status === 'ready' ? load.lists : null;
  const all = lists ? [...lists.builtin, ...lists.mine, ...lists.shared] : [];
  const chosen = action.template && all.some((one) => one.id === action.template!.id) ? String(action.template.id) : '';
  if (load.status === 'failed') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
        <span>{load.message}</span>
        <button type="button" onClick={retry} className={`${QUIET} border border-line`}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <Field
      id={id}
      label="Template"
      hint="Each record gets one open plan from it; one that already has one is left as it is. A contact's plan goes on its organisation or account."
      error={errors.template}
    >
      {(aria) => (
        <select
          id={id}
          {...aria}
          value={chosen}
          disabled={!lists}
          onChange={(event) => {
            const picked = all.find((one) => String(one.id) === event.target.value);
            onChange({ ...action, template: picked ? { id: picked.id, name: picked.name } : null });
          }}
          className={`${FILTER_SELECT} w-full ${errors.template ? 'border-danger' : ''}`}
        >
          <option value="">{lists ? 'Choose a template…' : 'Loading templates…'}</option>
          {lists
            ? (
                [
                  ['Built-in', lists.builtin],
                  ['Yours', lists.mine],
                  ['Shared with you', lists.shared],
                ] as const
              ).map(([label, list]) =>
                list.length > 0 ? (
                  <optgroup key={label} label={label}>
                    {list.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null,
              )
            : null}
        </select>
      )}
    </Field>
  );
}
```

In `src/components/rules/ActionCards.tsx`, import `PlanFields` with the others, add to the `add` switch:

```tsx
      case 'plan':
        onChange([...actions, newAction('plan', kind, workspace)]);
        return;
```

and after the survey card line:

```tsx
              {action.action === 'plan' ? <PlanFields action={action} errors={own} onChange={(next) => replace(index, next)} /> : null}
```

In `src/components/rules/TestPanel.tsx`, add `planTestParts` to the `ruleText` import and `import { Parts } from './Parts';`, and inside `TestResult`, after the `lines` paragraph:

```tsx
      {result.plans ? (
        <p data-part="plans" className="text-[13px] text-ink-muted">
          <Parts parts={planTestParts(result.plans)} />
        </p>
      ) : null}
```

In `src/pages/rules/RuleBuilder.tsx` (Decision 15: the sentence needs the template's name, which only the draft holds):
1. Delete the line `const actions = toActions(draft, kind);` and drop `toActions` from the `ruleDraft` import.
2. Change `ruleParts({ ...toTrigger(draft), actions }, segment)` to `ruleParts({ ...toTrigger(draft), actions: draft.actions }, segment)`.
3. Change `turnOnText(actions, segment)` to `turnOnText(draft.actions, segment)`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/features/rules src/components/rules src/pages/rules src/pages/brain src/e2e/rules.test.tsx`
Expected: PASS: the new cases, and every existing Rules test unchanged (the Rules list still has four rows; the e2e journey's sentences are the same).

- [ ] **Step 9: Type-check, lint and commit**

```bash
npx tsc -b --noEmit
npx eslint src/features/rules src/components/rules/ActionFields.tsx src/components/rules/ActionCards.tsx src/components/rules/TestPanel.tsx src/components/rules/ActionCards.test.tsx src/pages/rules/RuleBuilder.tsx src/pages/rules/RuleBuilder.test.tsx src/pages/rules/RulePage.test.tsx
git add src/features/rules src/components/rules/ActionFields.tsx src/components/rules/ActionCards.tsx src/components/rules/TestPanel.tsx src/components/rules/ActionCards.test.tsx src/pages/rules/RuleBuilder.tsx src/pages/rules/RuleBuilder.test.tsx src/pages/rules/RulePage.test.tsx
git commit -m "feat(rules): the fifth action, Start a plan

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Wire the routes, the frame and bar, the notification kinds, and the plan link on tasks

Spec §2.1 (route `/projects`, signed in, in the app frame; the sidebar link already points there), §2.2–§2.4 (their routes), §2.5 (activity feed's tasks: "<Plan> · <Milestone>" under the title; notifications `plan_started` and `plan_task_assigned` with an icon, linking to the plan), §4 "Task serializer addition" and "Notifications"; Decisions 2, 16; Contract notes 5, 17.

**Files:**
- Create: `src/components/layout/NotificationKindIcon.tsx`
- Modify: `src/App.tsx`, `src/layouts/DashboardLayout.tsx`, `src/layouts/DashboardLayout.test.tsx`, `src/components/layout/Navbar.tsx`, `src/components/layout/Navbar.test.tsx`, `src/features/notifications/types.ts`, `src/features/organizations/storyTypes.ts`, `src/features/customers/customersSlice.ts` (the `Task` type), `src/components/organizations/detail/StoryItemRow.tsx`, `src/components/organizations/detail/StoryItemRow.test.tsx`

**Interfaces:**
- Consumes: every page and route from Tasks 5–11.
- Produces: `NotificationKindIcon({ kind })` (an icon, or nothing, for a kind); `NotificationKind` gains `'plan_started' | 'plan_task_assigned'`; `StoryItem.plan?`, `StoryItem.milestone?`, `Task.plan?`, `Task.milestone?` (`{ id: number; name: string } | null`).

- [ ] **Step 1: Write the failing tests**

In `src/layouts/DashboardLayout.test.tsx`, add to the `adds no padding around %s` list, after the Scenarios entries:

```ts
    // Plans wear the same frame (plans spec 2026-10-04 §2).
    '/projects',
    '/projects/new',
    '/projects/41',
    '/projects/templates',
    '/projects/templates/new',
    '/projects/templates/10/edit',
```

and after the `keeps the Navbar on %s` test for Scenarios, add:

```ts
  it.each(['/projects', '/projects/41', '/projects/templates'])('keeps the Navbar on %s', (url) => {
    renderAt(url);
    expect(screen.getByText('Navbar stub')).toBeInTheDocument();
  });
```

In `src/components/layout/Navbar.test.tsx`, add after the "Navbar on Scenarios" `describe`:

```tsx
describe('Navbar on Project Management (plans spec 2026-10-04 §2.1)', () => {
  it('wears the framed bar on /projects: "Project Management", no avatar', () => {
    renderNavbar('/projects');
    expect(document.querySelector('header')).toHaveClass('h-16', 'shrink-0', 'flex', 'items-center', 'gap-3', 'px-4');
    expect(screen.getByRole('heading', { name: 'Project Management' })).toBeInTheDocument();
    expect(screen.queryByAltText('Alice Admin')).not.toBeInTheDocument();
  });

  it.each(['/projects/new', '/projects/41', '/projects/templates', '/projects/templates/new', '/projects/templates/10/edit'])(
    'leads back to Project Management from %s',
    (url) => {
      renderNavbar(url);
      const back = within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Project Management' });
      expect(back).toHaveAttribute('href', '/projects');
    },
  );
});
```

and, after the `ruleReview` fixture, add:

```tsx
// Plans spec §1.7: a plan started for its owner, and tasks given to someone.
const planStarted: Notification = {
  id: 6,
  kind: 'plan_started',
  message: 'A rule started Save plan · Pizza EMEA for you',
  link: '/projects/47',
  actor: null,
  is_read: false,
  created_at: '2026-10-04T02:00:08Z',
};
const planTasks: Notification = { ...planStarted, id: 7, kind: 'plan_task_assigned', message: 'Alice gave you 3 tasks in QBR · Pizza Hut', link: '/projects/43' };
```

and inside `describe('Navbar notification bell', …)`:

```tsx
  it('marks the two plan kinds with an icon, and no other kind', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [planStarted, planTasks, ruleReview]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector('[data-kind-icon="plan_started"]')).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('[data-kind-icon="plan_task_assigned"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-kind-icon]')).toHaveLength(2);
  });
```

In `src/components/organizations/detail/StoryItemRow.test.tsx`, add `import { MemoryRouter } from 'react-router-dom';` and append:

```tsx
describe('StoryItemRow: a plan task (plans spec §2.5)', () => {
  const task = STORY_ITEMS.find((item) => item.kind === 'task')!;

  it('links "<Plan> · <Milestone>" under the title', () => {
    render(
      <MemoryRouter>
        <ul>
          <StoryItemRow item={{ ...task, plan: { id: 41, name: 'Onboarding · Globex' }, milestone: { id: 412, name: 'Set up' } }} onOpenEmail={() => {}} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Onboarding · Globex · Set up' })).toHaveAttribute('href', '/projects/41');
  });

  it('shows no plan link for a task outside a plan', () => {
    render(
      <MemoryRouter>
        <ul>
          <StoryItemRow item={{ ...task, plan: null, milestone: null }} onOpenEmail={() => {}} />
        </ul>
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-part="plan"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --maxWorkers=2 src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.test.tsx src/components/organizations/detail/StoryItemRow.test.tsx`
Expected: FAIL: `/projects` keeps the padding and the old bar, the icons are missing, and `plan` is not a `StoryItem` field (a type error in the test, and no link).

- [ ] **Step 3: The frame and the bar**

In `src/layouts/DashboardLayout.tsx`, after the `isSegments` line, add:

```ts
  // Plans wear the Organizations frame too (plans spec 2026-10-04 §2): the
  // list and board, a plan, the templates and every modal over them.
  const isProjects = /^\/projects(\/.*)?$/.test(location.pathname);
```

and add `|| isProjects` to the `p-0` condition on `<main>`.

In `src/components/layout/Navbar.tsx`, after the `isRulePage` line, add:

```ts
  // Plans wear the same frame (plans spec 2026-10-04 §2.1, Decision 2):
  // "Project Management" on /projects; every other plans page leads back.
  const isProjects = /^\/projects\/?$/.test(location.pathname);
  const isPlanPage = /^\/projects\/.+/.test(location.pathname);
```

add `|| isProjects || isPlanPage` to `isFramed`, and replace the opening `{isRulePage ? (` of the title chain with:

```tsx
        {isPlanPage ? (
          <nav aria-label="Breadcrumb" className="flex items-center h-full">
            <Link
              to="/projects"
              className="-ml-2 inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Project Management
            </Link>
          </nav>
        ) : isProjects ? (
          <div className="flex items-center gap-4 h-full">
            <h1 className="text-[17px] font-bold text-ink tracking-tight">Project Management</h1>
          </div>
        ) : isRulePage ? (
```

- [ ] **Step 4: The notification kinds and their icon**

In `src/features/notifications/types.ts`, extend `NotificationKind` after `'rule_review'`:

```ts
  | 'rule_review'
  // A plan started for its owner by a rule or by someone else, linking to
  // /projects/<id> (plans spec §1.7).
  | 'plan_started'
  // "N tasks in <plan>" for the person given them, one per action, never to
  // the person acting; links to /projects/<id> (plans spec §1.7).
  | 'plan_task_assigned';
```

(remove the `;` after `'rule_review'`).

Create `src/components/layout/NotificationKindIcon.tsx`:

```tsx
import { ClipboardList, ListChecks, type LucideIcon } from 'lucide-react';
import type { NotificationKind } from '../../features/notifications/types';

/** The kinds that carry an icon in the bell (plans spec §2.5, Decision 16). */
const ICONS: Partial<Record<NotificationKind, LucideIcon>> = {
  plan_started: ClipboardList,
  plan_task_assigned: ListChecks,
};

/** A notification kind's icon, beside its words; nothing for the others. */
export function NotificationKindIcon({ kind }: { kind: NotificationKind }) {
  const Icon = ICONS[kind];
  return Icon ? <Icon data-kind-icon={kind} className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" /> : null;
}
```

In `src/components/layout/Navbar.tsx`, add `import { NotificationKindIcon } from './NotificationKindIcon';` and, inside the notification `<button>`, directly after the unread dot `{!notification.is_read && (…)}`, add:

```tsx
                        <NotificationKindIcon kind={notification.kind} />
```

- [ ] **Step 5: The plan link on a task**

In `src/features/organizations/storyTypes.ts`, add to `StoryItem` after `link`:

```ts
  /** A task in a plan, and its milestone (plans spec §2.5; Contract note 5).
   *  Absent or null for anything else. */
  plan?: { id: number; name: string } | null;
  milestone?: { id: number; name: string } | null;
```

In `src/features/customers/customersSlice.ts`, add the same two optional fields to `interface Task` (after `status`), with the comment `/** The plan and milestone a task belongs to (plans spec §4, task serializer addition). */`.

In `src/components/organizations/detail/StoryItemRow.tsx`, add `import { Link } from 'react-router-dom';`, a constant after `LINK`:

```ts
const PLAN_LINK = `inline-flex min-h-11 max-w-full items-center gap-1 rounded-sm text-[11px] font-semibold text-ink-muted hover:text-ink hover:underline sm:min-h-0 ${FOCUS}`;
```

and directly after the title row's closing `</div>` (before `{expanded ? (`), add:

```tsx
        {item.kind === 'task' && item.plan ? (
          <Link data-part="plan" to={`/projects/${item.plan.id}`} className={PLAN_LINK}>
            <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.milestone ? `${item.plan.name} · ${item.milestone.name}` : item.plan.name}</span>
          </Link>
        ) : null}
```

- [ ] **Step 6: The routes**

In `src/App.tsx`, add the imports:

```tsx
import { NewPlanRoute, RecordPlanRoute } from './pages/plans/NewPlan';
import { PlanPage } from './pages/plans/PlanPage';
import { ProjectsHome } from './pages/plans/ProjectsHome';
import { EditTemplateRoute, NewTemplateRoute } from './pages/plans/TemplateEditor';
import { TemplatesPage } from './pages/plans/TemplatesPage';
```

Give the organisation and account pages their child route:

```tsx
              <Route path=":id" element={<OrganizationDetails />}>
                {/* Start a plan over the organisation (plans spec §2.2). */}
                <Route path="plans/new" element={<RecordPlanRoute kind="organization" />} />
              </Route>
```

```tsx
              <Route path=":id" element={<AccountDetails />}>
                {/* Start a plan over the account (plans spec §2.2). */}
                <Route path="plans/new" element={<RecordPlanRoute kind="account" />} />
              </Route>
```

and, after the `scenarios` block, add:

```tsx
          {/* Plans (spec 2026-10-04-plans-design §2): the list and board with
              the New plan modal over them, the templates with their editor
              modal, and a plan's page. The sidebar's Project Management link
              lands here. */}
          <Route path="projects">
            <Route element={<ProjectsHome />}>
              <Route index element={null} />
              <Route path="new" element={<NewPlanRoute />} />
            </Route>
            <Route path="templates" element={<TemplatesPage />}>
              <Route path="new" element={<NewTemplateRoute />} />
              <Route path=":templateId/edit" element={<EditTemplateRoute />} />
            </Route>
            <Route path=":id" element={<PlanPage />} />
          </Route>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run --maxWorkers=2 src/layouts/DashboardLayout.test.tsx src/components/layout src/components/organizations/detail/StoryItemRow.test.tsx src/pages/organizations src/pages/accounts`
Expected: PASS.

- [ ] **Step 8: Type-check, lint, build and commit**

```bash
npx tsc -b --noEmit
npx eslint src/App.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/components/layout/NotificationKindIcon.tsx src/features/notifications/types.ts src/features/organizations/storyTypes.ts src/features/customers/customersSlice.ts src/components/organizations/detail/StoryItemRow.tsx src/components/organizations/detail/StoryItemRow.test.tsx
npm run build
git add src/App.tsx src/layouts/DashboardLayout.tsx src/layouts/DashboardLayout.test.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/components/layout/NotificationKindIcon.tsx src/features/notifications/types.ts src/features/organizations/storyTypes.ts src/features/customers/customersSlice.ts src/components/organizations/detail/StoryItemRow.tsx src/components/organizations/detail/StoryItemRow.test.tsx
git commit -m "feat(plans): wire the routes, the frame, the plan notifications and task links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: The house rules, the journey, and the product documents

Spec §2.6 ("a Plans house-rules suite (reusing `rowsIconsTargetsSuite`); one end-to-end-style test: start a plan from a template, tick a task, mark a milestone done, and see the board card move to On track"); Global Constraints "Product documents".

**Files:**
- Create: `src/components/plans/houseRules.test.ts`, `src/e2e/plans.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

**Interfaces:**
- Consumes: `houseRuleSuite`, `rowsIconsTargetsSuite` (`src/test/houseRules.ts`); `stubPlans`; `renderPlans`; everything built in Tasks 1–13.
- Produces: nothing in code.

- [ ] **Step 1: Write the house-rules suite**

Create `src/components/plans/houseRules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules over Plans (spec §2.6, Decision 1): both new folders
// whole, and the bell's kind icon.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../../pages/plans/*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(import.meta.glob('../layout/NotificationKindIcon.tsx', { query: '?raw', eager: true, import: 'default' })),
};

houseRuleSuite('plans house rules', files);
rowsIconsTargetsSuite('plans house rules beyond the shared suite', files);

describe('plans: what the suite covers, markup from the server, and storage', () => {
  it('covers the pages, the board, the modal steps and the timeline', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '../../pages/plans/ProjectsHome.tsx',
        '../../pages/plans/NewPlan.tsx',
        '../../pages/plans/PlanPage.tsx',
        '../../pages/plans/TemplatesPage.tsx',
        '../../pages/plans/TemplateEditor.tsx',
        './PlansBoard.tsx',
        './ReviewStep.tsx',
        './Timeline.tsx',
        './RecordPlans.tsx',
      ]),
    );
  });

  it('never renders markup from the server', () => {
    expect(Object.entries(files).filter(([, source]) => source.includes('dangerouslySetInnerHTML')).map(([file]) => file)).toEqual([]);
  });

  it('leaves storage to planParams, which survives it throwing', () => {
    expect(Object.entries(files).filter(([, source]) => /localStorage|sessionStorage/.test(source)).map(([file]) => file)).toEqual([]);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/plans/houseRules.test.ts`
Expected: PASS. If a control is reported without a 44px target, give it `min-h-11 sm:min-h-9` (or `h-11 w-11`) in its own `className`, or a style constant defined in the same file; if a Lucide icon is reported, add `aria-hidden="true"`. Do not weaken the suite.

- [ ] **Step 2: Write the journey**

Create `src/e2e/plans.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { stubPlans } from '../features/plans/testPlans';
import { requestsOf } from '../features/surveys/testSurveys';
import { renderPlans } from '../pages/plans/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the Plans pages, the
// store and the router. Only fetch is stubbed, by a stateful stub in the
// contract's shapes that applies spec §1.2's status rules (spec §2.6: start
// a plan from a template, tick a task, mark a milestone done, and see the
// board card move to On track).
const where = () => screen.getByTestId('where').textContent;

describe('Plans', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 9, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
    localStorage.clear();
  });

  it('starts a plan from a template, ticks a task, marks a milestone done, and sees it On track on the board', { timeout: 30000 }, async () => {
    const { spy } = stubPlans();

    // 1. Project Management, then New plan over the list.
    const first = renderPlans('/projects', { nav: true });
    expect(screen.getByRole('heading', { name: 'Project Management' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'New plan' }));
    const modal = await screen.findByRole('dialog', { name: 'New plan' });

    // 2. A record and a template; the review copies the template.
    await userEvent.type(within(modal).getByRole('searchbox', { name: 'Organisation or account' }), 'Initech');
    await userEvent.click(within(await within(modal).findByRole('list', { name: 'Organisations' })).getByRole('button', { name: 'Initech' }));
    await userEvent.click(await within(modal).findByRole('radio', { name: /^Onboarding/ }));
    expect(within(modal).getByRole('textbox', { name: 'Name' })).toHaveValue('Onboarding · Initech');

    // 3. Start it: the plan's page opens under "‹ Project Management".
    await userEvent.click(within(modal).getByRole('button', { name: 'Start plan' }));
    await waitFor(() => expect(where()).toBe('/projects/500'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Onboarding · Initech' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Project Management' })).toHaveAttribute('href', '/projects');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Not started');

    // 4. Tick a task: the plan goes on track.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hold the kick-off call' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('On track'));

    // 5. Mark Kick-off done by hand; its other task is still open.
    await userEvent.click(screen.getByRole('checkbox', { name: 'Kick-off done' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Kick-off done' })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Confirm goals and success criteria' })).not.toBeChecked();
    first.unmount();

    // 6. The board: the card sits in On track, not Not started.
    renderPlans('/projects', { nav: true });
    await userEvent.click(screen.getByRole('button', { name: 'Board' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: /^On track/ })).getByRole('link', { name: 'Onboarding · Initech' })).toBeInTheDocument());
    expect(within(screen.getByRole('region', { name: /^Not started/ })).queryByRole('link', { name: 'Onboarding · Initech' })).toBeNull();
    expect(requestsOf(spy, 'POST', /^\/plans\/$/)).toHaveLength(1);
    expect(requestsOf(spy, 'PATCH', /^\/plans\/500\/milestones\/\d+\/$/)[0].body).toEqual({ done: true });
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/e2e/plans.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 3: `docs/03-ui-ux-design.md`**

Insert directly after the "Rules (Scenarios)" section (before `### Overlays`):

```markdown
### Plans (Project Management)

Spec `docs/superpowers/specs/2026-10-04-plans-design.md` §2 (plan
`docs/superpowers/plans/2026-10-04-plans-frontend.md`). The pages sit in
`OrganizationsFrame` under the framed bar ("Project Management" on
`/projects`, "‹ Project Management" on every other plans page).

- **`/projects`.** A View group (List, Board; remembered in `localStorage`,
  List by default), **Templates** and **New plan**; then the filter bar: a
  Scope group (Mine, Has my tasks, All I can see: All for someone with
  reports, else Mine), Kind, Owner (outside Mine), Status (List only: Open,
  Done, Cancelled, All) and a search that commits 300 ms after typing. Every
  filter is in the URL.
  - **List:** one rounded row per plan (`PlanRowItem`): the name, the record
    as a link with the organisation or account icon, the kind chip, the
    owner's initials and name, a milestone bar with `3/5` in DM Mono, the next
    due date in DM Mono ("Overdue" with an icon in the danger colour when
    past), and the status pill (a word, an icon and a tint). Show more on the
    cursor. Empty: "No plans yet" or "No plans match these filters" with
    Clear filters.
  - **Board:** Not started · On track · At risk · Done, each with its count
    in DM Mono; Show cancelled adds Cancelled. Editors drag a card between
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
  done); "Started by <rule>" (unlinked for a rule the reader can't read).
  The timeline: milestones down a vertical line, each with its date,
  Overdue, `2/3 tasks done`, the editors' Done check, its tasks (checkbox,
  title, assignee, date, priority) and "N tasks you can't see"; Add task for
  editors. Edit turns each milestone into an inline form (name, date, Save,
  Move up, Move down, Remove) and each task into Edit and Remove; Add
  milestone at the end. A done or cancelled plan shows a notice; only task
  checkboxes stay.
- **Templates (`/projects/templates`).** Built-in, Yours, Shared with you:
  each name opens the template in place (milestones as "Day 0 · Kick-off",
  tasks with priority and role) with Use; yours have Edit and Delete. The
  editor modal: name, kind, description, milestones (name, day) with their
  tasks (title, priority, day, assignee role), counts, and Sharing as
  Segments and Rules. Save as template is the narrow builder dialog (name
  and sharing), then "Saved as …" with Open template.
- **Elsewhere.** Organisation and account pages carry a Plans section under
  the header (open plans flat in one surface, Show finished (N), Start a
  plan). A task in a plan shows "<Plan> · <Milestone>" under its title in
  the story. The bell gives `plan_started` and `plan_task_assigned` an icon.
  The rule builder's fifth Then card is Start a plan (a template picker).
```

- [ ] **Step 4: `docs/04-app-flow.md`**

1. After the route row that starts `| \`/scenarios/create\``, add:

```markdown
| `/projects`, `/projects/new`, `/projects/:id`, `/projects/templates`, `/projects/templates/new`, `/projects/templates/:id/edit`, `/organizations/:id/plans/new`, `/accounts/:id/plans/new` | `ProjectsHome` (List or Board), the New plan modal (`NewPlanRoute`, `RecordPlanRoute` in `pages/plans/NewPlan.tsx`), `PlanPage`, `TemplatesPage` with its editor modal (`NewTemplateRoute`, `EditTemplateRoute`). See 4.5k | auth |
```

2. In "Dead ends a user can reach", change `| Sidebar: Product Feedbacks, Project Management | "Under Construction" |` to `| Sidebar: Product Feedbacks | "Under Construction" |`.
3. Insert before `### 4.6 Copilot and multiplayer sessions`:

```markdown
### 4.5k Plans

Spec `docs/superpowers/specs/2026-10-04-plans-design.md`. A plan is a run of
work on one organisation or account: milestones and the tasks under them,
copied from a template when it starts.

1. **List and board.** `/projects` → `GET /plans/?<filters>&status=…` (List:
   `open` by default; All is `open`, `done` and `cancelled`), cursor pages
   of 50 (`cursor`). The Board reads one `GET /plans/?status=<s>` per column;
   each page's `counts` holds every column's count. Scope: Mine is
   `owner=me`, Has my tasks `mine=tasks`; the default waits for
   `GET /auth/members/` (All when someone reports to the reader). A move is
   `PATCH /plans/<id>/ {status}` (on_track, at_risk, done), then every column
   reads again.
2. **Start.** `/projects/new` (or `?template=<id>` from Templates' Use),
   `/organizations/<id>/plans/new`, `/accounts/<id>/plans/new`.
   - Records: `GET /customers/?search=` and `GET /accounts/?search=`; the
     chosen record's owner: `GET /customers/<id>/` or `GET /accounts/<id>/`.
   - Templates: `GET /plans/templates/`.
   - Start plan: `POST /plans/` with the reviewed copy (`milestones`, each
     task's `assignee` an id). 201 opens `/projects/<id>`; 409 `PLAN_OPEN`
     links to `plan_id`; 400s sit at their fields (`milestones` nested).
3. **A plan.** `/projects/<id>` → `GET /plans/<id>/` (404 reads "This plan
   doesn't exist or you can't open its record."). Every write answers with
   the plan: `PATCH /plans/<id>/` (status, cancel), `DELETE` (409 says
   cancel instead), milestones (`POST`, `PATCH {name, due_date, done}`,
   `DELETE`, `POST …/reorder/ {order}`), tasks (`POST`, `PATCH`, `DELETE`;
   a tick is `PATCH {status}`), `POST /plans/<id>/save-as-template/`.
4. **Templates.** `/projects/templates` → `GET /plans/templates/`; the
   editor `POST` or `PATCH /plans/templates/<id>/` (whole body); Delete.
5. **Records.** Organisation and account pages read
   `GET /customers/<id>/plans/` or `GET /accounts/<id>/plans/`.
6. **Rules.** The Start a plan action is `{action: 'plan', template: <id>}`;
   the dry run adds `plans: {would_start, already_open}`.
7. **Notifications.** `plan_started` and `plan_task_assigned` link to
   `/projects/<id>`.
```

- [ ] **Step 5: `.agents/workflows/repo-architecture.md`**

1. In the tree, after the `rules/` line under `features/`, add:

```
│   │   ├── plans/              ← Plans: types, API, options and sentences, dates and words, URL state and the remembered view, the New plan and template drafts, refusals at fields; testTemplates.ts, testPlans.ts (stubPlans)
```

   after the `rules/` line under `components/`, add:

```
│   │   ├── plans/              ← row parts and row, filters, list, board, the New plan steps, a plan's header, timeline and editors, template milestones, Save as template, a record's Plans section
```

   and after the `rules/` line under `pages/`, add:

```
│       ├── plans/              ← ProjectsHome (List / Board), NewPlan (the modal routes), PlanPage, TemplatesPage, TemplateEditor
```

2. In the Component Dependency Graph, under `organizations/` turn `│   └── :id                    → Organization page (…)` into `│   └── :id …` followed by `│       └── plans/new          → RecordPlanRoute (the New plan modal over the page)`, do the same under `accounts/`, and after the `brain/*` line add:

```
├── projects/
│   ├── (layout: ProjectsHome — List or Board; filters in the URL)
│   │   ├── (index)
│   │   └── new                → NewPlanRoute (?template=<id>)
│   ├── templates              → TemplatesPage
│   │   ├── new                → NewTemplateRoute
│   │   └── :templateId/edit   → EditTemplateRoute (the owner's; a notice for anyone else)
│   └── :id                    → PlanPage
```

3. After "### 13. Rules (…)" and its paragraph, add:

```markdown
### 14. Plans (`pages/plans/`)

Project Management (spec `docs/superpowers/specs/2026-10-04-plans-design.md`),
on backend `services/plans`: a plan is milestones and tasks on one
organisation or account, copied from a template. `/projects` is a List or a
Board (one read per column); New plan is the builder modal (`BuilderDialog`)
over the list or over a record's page; a plan's page is a timeline edited in
place; templates have their page and editor modal (`SharingFields`). Plan
tasks are ordinary tasks with a plan link, shown in the story; rules can
start a plan. See `docs/03-ui-ux-design.md` "Plans (Project Management)".
```

4. In "Known Stubs / Not Yet Implemented", change `| \`/projects\`, \`/campaigns\`, \`/canvas\` | No route defined |` to `| \`/campaigns\`, \`/canvas\` | No route defined |`.

- [ ] **Step 6: Commit**

```bash
git add src/components/plans/houseRules.test.ts src/e2e/plans.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): start a plan, tick, finish a milestone, see it on track; house rules and docs for Plans

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Final verification, the browser check, and finishing the branch

Skills `verification-before-completion`, `finishing-a-development-branch`.

**Files:** none new; fixes only where a check fails.

- [ ] **Step 1: The whole suite, lint and build**

Run, one at a time:

```bash
npx tsc -b --noEmit
npx vitest run --maxWorkers=2
npm run lint
npm run build
```

Expected: every test passes (Segments, Surveys, Rules, Scenarios, Organizations, Accounts and the new Plans suites); `npm run lint` ends with **16 problems (0 errors, 16 warnings)**, the pre-existing ones, and no new warning; the build is clean. Fix what fails in the task that owns it, with its own commit. Never run prettier.

- [ ] **Step 2: The browser check against the local backend**

With `revenact-backend` on its plans branch running locally (`venv/bin/python manage.py runserver`) and this app on `npm run dev`:

1. Sign in as a manager with reports. Open **Project Management** from the sidebar: All I can see is chosen; switch to Board and back (the choice survives a reload).
2. **New plan**: search a record, pick Onboarding, change a task's assignee and a date, Start plan. On the plan, tick a task (On track), mark a milestone done, Edit: rename, move, add and remove a milestone and a task; Save as template; Cancel plan.
3. Open an organisation: the Plans section lists it under Show finished; Start a plan opens over the page with the record locked.
4. In Scenarios, build a rule with **Start a plan**; Test this rule shows "Would start …"; run `venv/bin/python manage.py run_health_maintenance` and read the night ("Plan: started" / "Plan: already had one"); delete the template and run again: the rule reads `template_gone` with what to do.
5. Check `/projects`, a plan and the New plan modal at 375, 768, 1024 and 1440 px, light and dark: no sideways scroll, every control at least 44px tall on the phone, one board column below 768px.

Write what was seen (and any fix) in the PR description.

- [ ] **Step 3: Finish the branch**

Use `superpowers:finishing-a-development-branch`. Do not push from this plan; the backend PR merges and deploys first.

---

## Self-review

**Spec coverage** (frontend scope: §2, §4; §0 and §1 as they show in the UI):

| Spec | Where |
|---|---|
| §0 the sidebar's `/projects` leads nowhere | Task 13 (routes), Task 14 (docs: dead end removed) |
| §2.1 route, title, New plan, Templates, List / Board in `localStorage` (try/catch, List default) | Tasks 5, 6, 13 |
| §2.1 scope (Mine, Has my tasks, All I can see; default by reports), kind, owner, status (List only), 300 ms search, all in the URL | Task 5 (`planParams`, `PlanFilters`, `useHasReports`) |
| §2.1 list rows (name, record link with icon, kind, owner, progress `3/5` mono, next due mono with Overdue, status pill) and Show more | Tasks 4, 5 |
| §2.1 board: four columns with counts, Show cancelled, drag between open columns, Done only when all milestones done, refusal toast, status menu, one column below 768px, no sideways scroll | Task 6 |
| §2.1 states: skeletons, "No plans yet" with New plan, "No plans match these filters" with Clear filters, error with Retry | Tasks 5, 6 |
| §2.2 routes `/projects/new`, `/organizations/:id/plans/new`, `/accounts/:id/plans/new`; `BuilderDialog`; scrim keeps the draft | Tasks 7, 11, 13 |
| §2.2 record search (locked from a record), template cards with counts and length, review fields, computed dates, roles resolved, edits before starting | Tasks 3, 7, 11 |
| §2.2 Start plan once; 409 `PLAN_OPEN` sentence and link; refusals at fields, focus; success to `/projects/:id` | Tasks 3, 7 |
| §2.3 header, status select or pill, Edit, Save as template, ⋯ Cancel and Delete (only when nothing is completed), Started by rule | Tasks 8, 9, 10 |
| §2.3 timeline: milestones, due, done check, progress, tasks (checkbox, title, assignee, due, priority), Add task, hidden count, Overdue | Tasks 8, 9 |
| §2.3 inline edits: rename, re-date, reorder up/down, remove with confirm | Task 9 |
| §2.3 Cancel and Delete confirms (409 copy), done/cancelled notice, skeleton, 404 copy | Task 8 |
| §2.4 templates page sections and actions; editor modal fields, sharing, limits as counts; Save as template dialog | Task 10 |
| §2.5 Plans section on organisation and account pages (open, Show finished (N), Start a plan, states) | Task 11 |
| §2.5 task link "<Plan> · <Milestone>" (task serializer addition) | Task 13 (Contract note 5) |
| §2.5 rule builder: fifth card, template picker, each once / 1–3, sentence, nights per record, `template_gone` | Task 12 |
| §2.5 notifications: icon and link | Task 13 |
| §2.6 house rules, unit and page tests, one e2e | Tasks 1–14 (suite and journey in Task 14) |
| §4 every endpoint and field name | Task 2 (`planApi`, `stubPlans`), used throughout |
| Backend plan's binding notes (night `unchanged`, unreadable rule ref, 201s, finished-plan 400, last milestone, hidden tasks 404 and not copied) | Contract notes 2, 18–20; Tasks 2, 8, 9, 12 |

**Placeholder scan:** no "TBD", "TODO", "similar to", or code steps without code. Each test and implementation is written out. Edits to existing files give the exact lines to add or replace. The doc text is verbatim.

**Type consistency, checked across tasks:**
- `PlanRow`, `Plan`, `Milestone`, `PlanTask`, `PlanTemplate`, `TemplateLists` (Task 1) are what `planApi` returns (Task 2) and every component reads; `Plan.started_by_rule.id` is `number | null` (Contract note 18), and `PlanHeader` links only a number.
- `PlanErrors { form?, field, milestones: NestedErrors[] }` (Task 3) is what `checkStart`, `checkTemplate`, `planErrors` produce and what `ReviewStep` (Task 7), `MilestoneEditor`/`TaskEditor` (Task 9), `TemplateMilestones`/`TemplateEditor` (Task 10) read.
- `StartDraft`/`DraftMilestone`/`DraftTask` (Task 3) are what `ReviewStep` edits and `toStart` sends; `assigneeOf(task, owner, recordOwner)` is the only resolver.
- `PlanParams`, `listQuery`, `columnQuery`, `readView`/`writeView` (Task 5) are what `ProjectsHome` and `PlansBoard` (Task 6) use.
- `useSubmitOnce().run` answers `Outcome<T> | null` (Task 4) and every write checks `outcome.ok`.
- `useTemplates() → [TemplatesLoad, retry]` (Task 7) is used by `TemplateStep`, `TemplatesPage` (with `version`) and the rules' `PlanFields` (Task 12).
- `NewPlanForm({ fixed, initialTemplate, onClose })` (Task 7) is what `RecordPlanRoute` (Task 11) wraps.
- `Timeline({ plan, editing, onReplace })` and `PlanHeader({ plan, editing, onEdit, onReplace })` (Task 9) are what `PlanPage` renders.
- `RuleAction` (read) vs `RuleActionWrite` (sent), `PlanAction` vs `PlanActionWrite` (Task 12) match Contract note 1; `toActions` returns `RuleActionWrite[]`; `ruleParts`/`turnOnText` take the draft's `ActionLike`s.
- `stubPlans()` returns `{ spy, runNight, plansOf }`; new plans are 500+, milestones 5000+, tasks 50000+, templates 900+ (Tasks 2, 7, 10, 14); `renderPlans(url, { width?, nav?, role? })` gains routes in Tasks 7, 8, 10, 11, always before the `*` catch-all.
