# Work, delivery 1 ("tasks you can work"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new top-level Work section (Today and Team, with an overdue badge in the sidebar) and one task panel, opened at `?task=<id>` on any route, where a task is edited (title, description, status with Blocked and its reason, assignee, due date, priority), commented on and read as an activity trail; Brain › Waiting on you, an organisation's or account's story and the bell all open that same panel.

**Architecture:** A `features/work` layer holds the contract's types, the API calls, pure copy and row helpers, and a stateful fetch stub for tests. `components/work` holds the panel (`TaskPanelHost` mounted once in `DashboardLayout`, reading `?task=`; it reuses the organisation page's `Sheet`), the Today and Team parts, the parent-aware assignee picker, and a tiny change bus (`taskChanged()` / `useTaskChanges`) that tells Today, Team, the badge, Brain's desk and the record story to read again. `pages/work` holds `WorkRoutes`, Today and Team. The framed Navbar gains a Work branch (`WorkTabs`, the same pattern as `BrainTabs`), Team reuses Brain's `useBrainScope`, `ScopeSwitch` and `BrainControls`, and there is no Redux slice: every read goes through hooks, as the Brain does.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Tailwind v4 tokens, Redux Toolkit (store only), Vitest + Testing Library (jsdom), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-07-work-round-design.md` (§1.5, plus §4, §5 and §6 as they apply to delivery 1). **API contract (binding):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-be/docs/superpowers/plans/2026-10-07-work-tasks-api.md`, and the "Decisions" section of `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-be/docs/superpowers/plans/2026-10-07-work-tasks-backend.md`. Read all three with this plan.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/work-spec`, branch `feat/work-tasks` (it already holds the spec commit). `node_modules` is a symlink: never commit it; always `git add <explicit paths>`, never `git add -A` or `git add .`.
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees; use a WIP commit if you must set work aside).
- **Commands.** `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npm run lint`, `npm run build`. Run them in the foreground.
- **Every commit message ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, or named Tailwind palette colours in any `.tsx`.
- **Type sizes 11/13/15/22 only** (`text-[11px]`, `text-[13px]`, `text-[15px]`, `text-[22px]`), at most four per surface; no named sizes.
- **Figures in DM Mono:** every count and date uses `MONO` (`font-mono-brand tabular-nums`).
- **44px targets:** every `<button>`, `<Link>`, `<select>`, `<input>` and `<textarea>` reaches `min-h-11` (or `h-11 w-11`) on phones, directly or through a compliant constant (`BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `FILTER_SELECT`, `LINK`, or a local `const` holding `min-h-11`). A `className` built from a lower-case variable does not count.
- **Lucide icons only**, each with `aria-hidden="true"`. No emoji. **No em dash (`—`) anywhere in a file under `src/components/work/`, `src/pages/work/` or `src/features/work/`, comments included.**
- **No glass** on any Work surface, no card inside a card (rows are flat inside one bordered `LIST`), one primary button per surface (Today's New task).
- **Every list has loading (a skeleton, not a spinner), empty and error states.**
- **Privacy.** Anything the reader cannot open is counted, never named (`hidden`). The UI never guesses visibility: it shows what the API returns.
- **Out of scope:** Recommended (delivery 2) and tracking (delivery 3). Do not draw a Recommended tab, card or count; the tab list and the badge are only shaped so it slots in. The mock `features/tasks/tasksSlice` (CallSense's "Create tasks from actions") is left alone.

## Decisions (where the spec or the contract leaves a choice)

1. **One panel host.** `TaskPanelHost` is mounted once in `DashboardLayout` and reads `?task=<id>`, so the panel opens on every route, and the bell's `/work/today?task=41` link needs no special case. Opening pushes a history entry (a `Link`); closing replaces it without `task`, keeping every other parameter.
2. **The panel is the organisation page's `Sheet`** (`components/organizations/detail/Sheet.tsx`): a right-hand panel from `sm`, a bottom sheet below it, focus trapped, Escape and the scrim close it.
3. **Saving.** Each field saves on its own: title on Enter or blur, status, assignee, due date and priority on change, description and the Blocked reason from their own Save button. One write runs at a time (`useSubmitOnce`), and the controls are disabled while it runs. The answer (the full panel shape, events included) replaces the panel's task, so the activity trail updates from the server.
4. **Blocked.** Choosing Blocked does not send anything: it shows the reason input with Mark blocked and Cancel. A blank reason is refused in the browser with the server's own words ("Say what it's blocked on."). For a Blocked task the reason is edited in place (Save reason sends `blocked_reason` alone).
5. **Read-only fields.** A field not in `editable` is shown as text, not as a disabled control (a plan task for a non-editor shows only Status as a control).
6. **Assignee picker.** One component for the panel and for New task, fed by `GET /work/assignees/`. People who cannot open the record are listed but disabled, labelled `<name> · Can't open this organization` (or `account`). A current assignee missing from the list (deactivated) is shown, disabled, as `<name> (no longer active)`. `ASSIGNEE_CANNOT_OPEN` is shown under the Assignee field with the server's sentence. The organisation page's "+ Add › New task" form gets the same picker, since the backend now refuses an assignee who cannot open the record.
7. **Team access.** The Team tab shows for anyone with reports (read from `GET /auth/members/`, `useHasReports`), `view_all_accounts`, or the Leadership function (owner's decision of 2026-10-07: those readers see and edit every task on records they can open, so Company shows real counts for them). The page itself uses Brain's scopes (`GET /brain/scopes/`) and `useBrainScope`, so the remembered Me / My team / Company choice is shared with the Brain.
8. **Team rows expand into the `open` drill-down only** (`GET /work/tasks/?assignee=<id>`); the row itself highlights the overdue count in `text-danger`, always beside the word "overdue".
9. **The badge.** The sidebar's Work item shows `counts.overdue` from `GET /work/today/` (contract: "The sidebar badge is `counts.overdue`"), with the accessible name "Work, 2 overdue". It reads on mount, on each route change and after every `taskChanged()`. Delivery 2 adds the recommendations waiting to the same number; nothing else is drawn for it now. The Work tab bar has no badge of its own (the sidebar carries it).
10. **Quick Done is not optimistic.** The row's button is disabled while the PATCH runs; on success the row leaves and a status line says "Done: <title>."; on refusal the row stays with the server's sentence under it.
11. **"The organisation page's Tasks tab"** is today's story filtered to tasks (`?group=tasks&source=task`; `TasksTab.tsx` is only used by the unused `ActivityFeed`). A task's title in any story row (organisation and account pages share `StoryItemRow`) opens the panel; after any panel change the page's story reads again (`useDetailVersions` listens to `taskChanged`).
12. **Brain › Waiting on you.** "Open task" opens the panel on the Brain page (`?task=<id>` added to the current URL) instead of the record's story; the desk reads again after a panel change. `taskPath` in `waitingText.ts` is deleted.
13. **Copy.** "Organization" (as the sidebar spells it) in the UI's own words; the server's refusals are shown verbatim. Status words: Pending, In progress, Blocked, Done.
14. **Event sentences** are written for the reader: the actor is "You" when it is the reader and "Revenact" when `actor` is null; the rule is never named (the contract keeps only its id). Kinds delivery 3 writes (`nudged`, `escalated`) already have a sentence.
15. **`GET /tasks/` callers keep working.** `Task['status']` in `customersSlice` gains `blocked`; `TasksTab` gets a Blocked style; Cockpit's tick-off PATCH now answers the panel shape, which it never read, so its return type becomes `unknown`.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/features/work/workTypes.ts` | create | The contract's shapes, `STATUSES`, `PRIORITIES` |
| `src/features/work/workApi.ts` | create | Every Work call, `readRefusal`, `NO_REFUSAL`, `isMissing` |
| `src/features/work/workText.ts` | create | `WORK` copy, labels, `personName`, `parentPath`, `sourceText`, hidden-count lines, `eventSentence` |
| `src/features/work/rows.ts` | create | `isOverdue`, `withoutRow`, `todayTotal` |
| `src/features/work/taskParam.ts` | create | `?task=` read/write helpers |
| `src/features/work/assignees.ts` | create | `assigneeOptions` (disabled people, the missing current assignee) |
| `src/features/work/workTabs.ts` | create | Tab list, `isWorkPath`, `workTabOf`, `workTabsFor` |
| `src/features/work/testWorkFixtures.ts` | create | Test-only people, records, tasks, members |
| `src/features/work/testWork.ts` | create | Test-only stateful fetch stub in the contract's shapes |
| `src/components/work/taskChanges.ts` | create | `taskChanged()`, `useTaskChanges(cb)` |
| `src/components/work/useTaskLink.ts` | create | The `To` that opens a task on the current page |
| `src/components/work/useAssignees.ts` | create | `GET /work/assignees/` for a record |
| `src/components/work/AssigneeSelect.tsx` | create | The picker's `<select>` |
| `src/components/work/useTask.ts` | create | `GET /tasks/<id>/` with replace/append |
| `src/components/work/TaskPanelHost.tsx` | create | Reads `?task=`, renders `TaskSheet` |
| `src/components/work/TaskSheet.tsx` | create | The `Sheet`, loading/missing/error states |
| `src/components/work/TaskPanel.tsx` | create | Fields, facts, activity, comments |
| `src/components/work/TaskValue.tsx` | create | A read-only labelled value |
| `src/components/work/TaskFields.tsx` | create | The editors (read-only in Task 4, editors from Task 5) |
| `src/components/work/TaskFacts.tsx` | create | Record link, plan or source, created line |
| `src/components/work/ActivityTrail.tsx` | create | The trail in sentences |
| `src/components/work/CommentBox.tsx` | create | Add a comment |
| `src/components/work/TaskPanelSkeleton.tsx` | create | The panel's loading state |
| `src/components/work/WorkFrame.tsx` | create | Full-width scroll column, 16px gutter |
| `src/components/work/TaskRowItem.tsx` | create | One task row (Today and the Team drill-down) |
| `src/components/work/TodayGroups.tsx` | create | Today's five groups |
| `src/components/work/TodaySkeleton.tsx` | create | Today's loading state |
| `src/components/work/useToday.ts` | create | `GET /work/today/` |
| `src/components/work/NewTaskSheet.tsx` | create | Pick a record, then `TaskForm` |
| `src/components/work/TeamRow.tsx` | create | One person, expanding into their tasks |
| `src/components/work/TeamSkeleton.tsx` | create | Team's loading state |
| `src/components/work/useDrill.ts` | create | `GET /work/tasks/?assignee=` |
| `src/components/work/useTeamAccess.ts` | create | Whether the Team tab shows |
| `src/components/work/useWorkCount.ts` | create | The sidebar badge's number |
| `src/components/work/houseRules.test.ts` | create | The house rules over every Work file |
| `src/components/layout/WorkTabs.tsx` | create | "Work" h1 and the tabs |
| `src/pages/work/WorkRoutes.tsx` | create | `/work/*` |
| `src/pages/work/Today.tsx` | create | `/work/today` |
| `src/pages/work/Team.tsx` | create | `/work/team` |
| `src/pages/work/testPages.tsx` | create | Test-only renders (`renderPage`, `renderWork`) |
| `src/e2e/work.test.tsx` | create | The journeys |
| `src/App.tsx` | modify | The `work/*` route |
| `src/layouts/DashboardLayout.tsx` | modify | `TaskPanelHost`, no padding on Work routes |
| `src/components/layout/Navbar.tsx` | modify | The Work branch, `isFramed` |
| `src/components/layout/Sidebar.tsx` | modify | `WorkNavItem`, `NavItem`'s `badgeNoun` |
| `src/components/layout/NotificationKindIcon.tsx` | modify | `task_assigned` |
| `src/features/notifications/types.ts` | modify | `task_assigned` |
| `src/features/customers/customersSlice.ts` | modify | `Task['status']` gains `blocked` |
| `src/components/organizations/activity/TasksTab.tsx` | modify | Blocked style; `TaskForm` takes `parent` |
| `src/components/organizations/detail/AddFlow.tsx` | modify | Passes `parent` to `TaskForm` |
| `src/components/organizations/detail/StoryItemRow.tsx` | modify | A task's title opens the panel |
| `src/components/organizations/detail/useDetailPage.ts` | modify | The story reads again after a panel change |
| `src/components/plans/RecordStep.tsx` | modify | `heading` prop |
| `src/components/brain/WaitingRow.tsx` | modify | Open task opens the panel |
| `src/features/brain/waitingText.ts` | modify | Delete `taskPath` |
| `src/pages/brain/Waiting.tsx` | modify | Reads again after a panel change |
| `src/pages/copilot/cockpitApi.ts` | modify | `updateTaskStatus` answers `unknown` |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` | modify | The product docs |

---

### Task 1: The Work data layer

**Files:**
- Create: `src/features/work/workTypes.ts`, `src/features/work/workApi.ts`, `src/features/work/workText.ts`, `src/features/work/rows.ts`, `src/features/work/taskParam.ts`, `src/components/work/taskChanges.ts`, `src/components/work/useTaskLink.ts`
- Modify: `src/features/customers/customersSlice.ts:289`, `src/components/organizations/activity/TasksTab.tsx:2,17-21`, `src/pages/copilot/cockpitApi.ts:20-24`
- Test: `src/features/work/workText.test.ts`, `src/features/work/rows.test.ts`, `src/features/work/taskParam.test.ts`, `src/features/work/workApi.test.ts`, `src/components/work/taskChanges.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError` (`src/lib/apiClient.ts`); `ScopeKey` (`src/features/brain/brainTypes.ts`); `formatDate` (`src/features/customers/formatters.ts`); `refreshWaitingCount` (`src/components/brain/useWaitingCount.ts`).
- Produces:
  - types `TaskStatus`, `TaskPriority`, `TaskSource`, `ParentKind`, `TaskParentRef {kind,id}`, `TaskParent {kind,id,name}`, `TaskPerson {id,name,active}`, `PersonRef {id,name}`, `TaskRow`, `TodayGroup`, `TodayPayload`, `TeamPerson`, `TeamPayload`, `DrillState`, `DrillPayload`, `AssigneeOption`, `AssigneesPayload`, `EventKind`, `TaskEvent`, `EditableField`, `TaskDetail`, `TaskPatch`, `NewTaskBody`; consts `STATUSES`, `PRIORITIES`.
  - `fetchToday(): Promise<TodayPayload>`, `fetchTeam(scope: ScopeKey): Promise<TeamPayload>`, `fetchDrill(assignee: number, state?: DrillState): Promise<DrillPayload>`, `fetchAssignees(parent: TaskParentRef): Promise<AssigneesPayload>`, `fetchTask(id: number): Promise<TaskDetail>`, `patchTask(id: number, patch: TaskPatch): Promise<TaskDetail>`, `postComment(id: number, body: string): Promise<TaskEvent>`, `createWorkTask(parent: TaskParentRef, body: NewTaskBody): Promise<TaskRow>`; `type Refusal = {field: Partial<Record<RefusalField,string>>; form: string | null}`, `NO_REFUSAL`, `readRefusal(err: unknown, fallback: string): Refusal`, `isMissing(err: unknown): boolean`.
  - `WORK` (copy), `GROUP_KEYS`, `GROUP_LABEL`, `STATUS_LABEL`, `PRIORITY_LABEL`, `personName(p: TaskPerson | null): string`, `parentPath(p: TaskParentRef): string`, `sourceText(row: Pick<TaskRow,'source'|'plan'>): string | null`, `hiddenTodayText(n: number): string | null`, `hiddenTeamText(n: number): string | null`, `moreRowsText(shown: number, total: number): string | null`, `teamTitle(scope: ScopeKey): string`, `teamRowLabel(row: TeamPerson): string`, `cantOpenText(kind: ParentKind): string`, `doneLabel(title: string): string`, `doneStatus(title: string): string`, `actorName(actor: PersonRef | null, me: number | null): string`, `eventSentence(event: TaskEvent, me: number | null): string`.
  - `isOverdue(row: Pick<TaskRow,'status'|'due_date'>, today: string): boolean`, `withoutRow(payload: TodayPayload, id: number): TodayPayload`, `todayTotal(payload: TodayPayload): number`.
  - `TASK_PARAM = 'task'`, `taskParam(search: string | URLSearchParams): number | null`, `withTask(search: string, id: number): string`, `withoutTask(search: string | URLSearchParams): URLSearchParams`.
  - `taskChanged(): void`, `useTaskChanges(onChange: () => void): void`, `useTaskLink(): (id: number) => To`.

- [ ] **Step 1: Write the failing tests**

`src/features/work/workText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TaskEvent } from './workTypes';
import {
  actorName,
  cantOpenText,
  doneLabel,
  doneStatus,
  eventSentence,
  hiddenTeamText,
  hiddenTodayText,
  moreRowsText,
  parentPath,
  personName,
  sourceText,
  teamRowLabel,
  teamTitle,
} from './workText';

const ME = 1;
const mona = { id: 2, name: 'Mona Manager' };
const you = { id: ME, name: 'Alice' };
const event = (kind: TaskEvent['kind'], data: Record<string, unknown>, actor: TaskEvent['actor'] = mona, body = ''): TaskEvent => ({
  id: 1,
  kind,
  actor,
  data,
  body,
  created_at: '2026-10-07T09:30:00.123456Z',
});

describe('workText: people, records and sources', () => {
  it('names a person, a deactivated one, and nobody', () => {
    expect(personName({ id: 3, name: 'Carl CSM', active: true })).toBe('Carl CSM');
    expect(personName({ id: 5, name: 'Erin Former', active: false })).toBe('Unassigned (was Erin Former)');
    expect(personName(null)).toBe('Unassigned');
  });

  it('links an organization and an account where they live', () => {
    expect(parentPath({ kind: 'customer', id: 7 })).toBe('/organizations/7');
    expect(parentPath({ kind: 'account', id: 9 })).toBe('/accounts/9');
  });

  it('says where a task came from, and nothing for a manual one', () => {
    expect(sourceText({ source: 'manual', plan: null })).toBeNull();
    expect(sourceText({ source: 'plan', plan: { id: 12, name: 'Onboarding · Pizza Hut' } })).toBe('From Onboarding · Pizza Hut');
    expect(sourceText({ source: 'plan', plan: null })).toBe('From a plan');
    expect(sourceText({ source: 'rule', plan: null })).toBe('From a rule');
    expect(sourceText({ source: 'agent', plan: null })).toBe('From the AI agent');
    expect(sourceText({ source: 'recommendation', plan: null })).toBe('Recommended by Revenact');
  });

  it("counts what can't be opened, never naming it", () => {
    expect(hiddenTodayText(0)).toBeNull();
    expect(hiddenTodayText(1)).toBe("1 task on a record you can't open");
    expect(hiddenTodayText(3)).toBe("3 tasks on records you can't open");
    expect(hiddenTeamText(0)).toBeNull();
    expect(hiddenTeamText(1)).toBe("1 task you can't open");
    expect(hiddenTeamText(2)).toBe("2 tasks you can't open");
  });

  it('says when a group was cut short, and the small lines', () => {
    expect(moreRowsText(100, 100)).toBeNull();
    expect(moreRowsText(100, 140)).toBe('Showing 100 of 140');
    expect(teamTitle('me')).toBe('Your tasks');
    expect(teamTitle('team')).toBe("Your team's tasks");
    expect(teamTitle('company')).toBe("Everyone's tasks");
    expect(teamRowLabel({ person: { id: 3, name: 'Carl CSM', active: true }, open: 5, overdue: 1, blocked: 1, oldest_overdue: '2026-10-05' })).toBe(
      'Carl CSM: 5 open, 1 overdue, 1 blocked, oldest due 5 Oct 2026',
    );
    expect(teamRowLabel({ person: { id: 5, name: 'Erin Former', active: false }, open: 0, overdue: 0, blocked: 0, oldest_overdue: null })).toBe(
      'Unassigned (was Erin Former): 0 open, 0 overdue, 0 blocked',
    );
    expect(cantOpenText('customer')).toBe("Can't open this organization");
    expect(cantOpenText('account')).toBe("Can't open this account");
    expect(doneLabel('Call Pizza Hut')).toBe('Mark “Call Pizza Hut” done');
    expect(doneStatus('Call Pizza Hut')).toBe('Done: Call Pizza Hut.');
  });
});

describe('workText: the activity trail in sentences (spec §1.5)', () => {
  it('names the actor as You, Revenact or the person', () => {
    expect(actorName(you, ME)).toBe('You');
    expect(actorName(null, ME)).toBe('Revenact');
    expect(actorName(mona, ME)).toBe('Mona Manager');
  });

  it('created: for whom, from where, and the agent’s unused suggestion', () => {
    expect(eventSentence(event('created', { source: 'manual', assignee: { id: ME, name: 'Alice' } }), ME)).toBe('Mona Manager created this task for you.');
    expect(eventSentence(event('created', { source: 'rule', rule: 4, assignee: { id: 3, name: 'Carl CSM' } }, null), ME)).toBe(
      'Revenact created this task for Carl CSM from a rule.',
    );
    expect(eventSentence(event('created', { source: 'plan', plan: 12, assignee: null }, you), ME)).toBe('You created this task from a plan.');
    expect(
      eventSentence(event('created', { source: 'agent', proposal: 22, assignee: { id: 2, name: 'Mona Manager' }, suggested: 'Zed', fallback: 'no_member' }, you), ME),
    ).toBe("You created this task for Mona Manager from the AI agent's proposal. The agent suggested Zed, who isn't a member here.");
    expect(
      eventSentence(event('created', { source: 'agent', assignee: { id: 2, name: 'Mona Manager' }, suggested: 'Dana CSM', fallback: 'cannot_open' }, you), ME),
    ).toBe("You created this task for Mona Manager from the AI agent's proposal. The agent suggested Dana CSM, who can't open this record.");
  });

  it('assigned, status, due date and edits', () => {
    expect(eventSentence(event('assigned', { from: { id: ME, name: 'Alice' }, to: { id: 3, name: 'Carl CSM' } }, you), ME)).toBe(
      'You assigned it to Carl CSM (was Alice).',
    );
    expect(eventSentence(event('assigned', { from: null, to: { id: ME, name: 'Alice' } }), ME)).toBe('Mona Manager assigned it to you.');
    expect(eventSentence(event('status', { from: 'pending', to: 'in-progress' }, you), ME)).toBe('You moved it from pending to in progress.');
    expect(eventSentence(event('status', { from: 'pending', to: 'blocked', reason: 'Waiting on legal' }, you), ME)).toBe(
      'You marked it blocked: Waiting on legal',
    );
    expect(eventSentence(event('status', { from: 'blocked', to: 'completed' }, you), ME)).toBe('You marked it done.');
    expect(eventSentence(event('due_changed', { from: '2026-10-05', to: '2026-10-10' }, you), ME)).toBe(
      'You moved the due date from 5 Oct 2026 to 10 Oct 2026.',
    );
    expect(eventSentence(event('edited', { field: 'title', from: 'Call', to: 'Call again' }, you), ME)).toBe('You renamed it from “Call” to “Call again”.');
    expect(eventSentence(event('edited', { field: 'priority', from: 'high', to: 'low' }, you), ME)).toBe('You changed the priority from high to low.');
    expect(eventSentence(event('edited', { field: 'description' }, you), ME)).toBe('You edited the description.');
  });

  it('comments, recommendations and the delivery 3 kinds', () => {
    expect(eventSentence(event('comment', {}, you, 'Left a voicemail.'), ME)).toBe('You commented');
    expect(eventSentence(event('recommended', { facts: ['Renews in 9 days', 'Health fell 5.6 to 4.9'] }, null), ME)).toBe(
      'Revenact recommended it: Renews in 9 days; Health fell 5.6 to 4.9.',
    );
    expect(eventSentence(event('nudged', {}, null), ME)).toBe('Revenact sent a reminder.');
    expect(eventSentence(event('escalated', {}, null), ME)).toBe('Revenact told a manager it is overdue.');
  });
});
```

`src/features/work/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isOverdue, todayTotal, withoutRow } from './rows';
import type { TaskRow, TodayPayload } from './workTypes';

const row = (id: number, over: Partial<TaskRow> = {}): TaskRow => ({
  id,
  title: `Task ${id}`,
  due_date: '2026-10-05',
  priority: 'medium',
  status: 'pending',
  blocked_reason: '',
  source: 'manual',
  parent: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  assignee: { id: 1, name: 'Alice', active: true },
  plan: null,
  ...over,
});

const payload: TodayPayload = {
  today: '2026-10-07',
  groups: { overdue: [row(1), row(2)], today: [row(3, { due_date: '2026-10-07' })], week: [], later: [], blocked: [row(4, { status: 'blocked' })] },
  counts: { overdue: 2, today: 1, week: 0, later: 0, blocked: 1 },
  hidden: 1,
};

describe('rows', () => {
  it('is overdue when past due and not Blocked (backend Decision 8)', () => {
    expect(isOverdue(row(1), '2026-10-07')).toBe(true);
    expect(isOverdue(row(1, { due_date: '2026-10-07' }), '2026-10-07')).toBe(false);
    expect(isOverdue(row(1, { status: 'blocked' }), '2026-10-07')).toBe(false);
  });

  it('drops one row and its count, leaving the rest and the hidden count', () => {
    const next = withoutRow(payload, 2);
    expect(next.groups.overdue.map((r) => r.id)).toEqual([1]);
    expect(next.counts).toEqual({ overdue: 1, today: 1, week: 0, later: 0, blocked: 1 });
    expect(next.hidden).toBe(1);
    expect(withoutRow(payload, 99)).toEqual(payload);
  });

  it('totals every group', () => {
    expect(todayTotal(payload)).toBe(4);
  });
});
```

`src/features/work/taskParam.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { taskParam, withTask, withoutTask } from './taskParam';

describe('taskParam', () => {
  it('reads a task id, and nothing else', () => {
    expect(taskParam('?task=41')).toBe(41);
    expect(taskParam(new URLSearchParams('scope=team&task=7'))).toBe(7);
    expect(taskParam('?task=abc')).toBeNull();
    expect(taskParam('?task=')).toBeNull();
    expect(taskParam('')).toBeNull();
  });

  it('adds and removes it, keeping every other parameter', () => {
    expect(withTask('?scope=me', 41)).toBe('?scope=me&task=41');
    expect(withTask('?task=3', 41)).toBe('?task=41');
    expect(withTask('', 5)).toBe('?task=5');
    expect(withoutTask('?group=tasks&task=41&source=task').toString()).toBe('group=tasks&source=task');
  });
});
```

`src/features/work/workApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import {
  createWorkTask,
  fetchAssignees,
  fetchDrill,
  fetchTask,
  fetchTeam,
  fetchToday,
  isMissing,
  patchTask,
  postComment,
  readRefusal,
} from './workApi';

const respond = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function spyFetch() {
  const spy = vi.fn(async () => respond(200, {}));
  vi.stubGlobal('fetch', spy);
  return () =>
    spy.mock.calls.map((call) => {
      const [input, init] = call as unknown as [string, RequestInit | undefined];
      const url = new URL(input);
      return {
        path: `${url.pathname.replace(/^\/api\/v1/, '')}${url.search}`,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
    });
}

describe('workApi: the delivery 1 routes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads Today, Team, the drill-down, the picker and a task', async () => {
    const calls = spyFetch();
    await fetchToday();
    await fetchTeam('team');
    await fetchDrill(3);
    await fetchDrill(3, 'blocked');
    await fetchAssignees({ kind: 'customer', id: 7 });
    await fetchAssignees({ kind: 'account', id: 9 });
    await fetchTask(41);
    expect(calls().map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /work/today/',
      'GET /work/team/?scope=team',
      'GET /work/tasks/?assignee=3&state=open',
      'GET /work/tasks/?assignee=3&state=blocked',
      'GET /work/assignees/?customer=7',
      'GET /work/assignees/?account=9',
      'GET /tasks/41/',
    ]);
  });

  it('writes a change, a comment and a new task on either kind of record', async () => {
    const calls = spyFetch();
    await patchTask(41, { status: 'blocked', blocked_reason: 'Waiting on legal' });
    await postComment(41, 'Called.');
    await createWorkTask({ kind: 'customer', id: 7 }, { title: 'Prep the QBR', due_date: '2026-10-14', priority: 'medium', assignee_id: 3 });
    await createWorkTask({ kind: 'account', id: 9 }, { title: 'Call', due_date: '2026-10-14', priority: 'low' });
    expect(calls()).toEqual([
      { path: '/tasks/41/', method: 'PATCH', body: { status: 'blocked', blocked_reason: 'Waiting on legal' } },
      { path: '/tasks/41/comments/', method: 'POST', body: { body: 'Called.' } },
      { path: '/customers/7/tasks/', method: 'POST', body: { title: 'Prep the QBR', due_date: '2026-10-14', priority: 'medium', assignee_id: 3 } },
      { path: '/accounts/9/tasks/', method: 'POST', body: { title: 'Call', due_date: '2026-10-14', priority: 'low' } },
    ]);
  });
});

describe('workApi: reading a refusal', () => {
  const refusal = (status: number, body: unknown) => new ApiError(status, body, 'message');

  it('puts ASSIGNEE_CANNOT_OPEN under the assignee, with the server’s sentence', () => {
    expect(readRefusal(refusal(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: "That person can't open this organisation." }), 'x')).toEqual({
      field: { assignee_id: "That person can't open this organisation." },
      form: null,
    });
  });

  it('puts field errors under their fields, and the rest on the form', () => {
    expect(readRefusal(refusal(400, { blocked_reason: ["Say what it's blocked on."] }), 'x')).toEqual({
      field: { blocked_reason: "Say what it's blocked on." },
      form: null,
    });
    expect(readRefusal(refusal(400, { body: ['Write a comment.'] }), 'x').field.body).toBe('Write a comment.');
    expect(readRefusal(refusal(400, { non_field_errors: ['This plan is finished; only its tasks can change.'] }), 'x')).toEqual({
      field: {},
      form: 'This plan is finished; only its tasks can change.',
    });
    expect(readRefusal(refusal(403, { detail: "Only the plan's owner or their managers can change it." }), 'x').form).toBe(
      "Only the plan's owner or their managers can change it.",
    );
    expect(readRefusal(new Error('offline'), 'Could not save that change.')).toEqual({ field: {}, form: 'Could not save that change.' });
  });

  it('knows a missing task', () => {
    expect(isMissing(refusal(404, { detail: 'No such task.' }))).toBe(true);
    expect(isMissing(refusal(500, {}))).toBe(false);
    expect(isMissing(new Error('x'))).toBe(false);
  });
});
```

`src/components/work/taskChanges.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { taskChanged, useTaskChanges } from './taskChanges';
import { useTaskLink } from './useTaskLink';

describe('taskChanged / useTaskChanges', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls every listener, the latest callback, until unmounted', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ count: 0 }) })));
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ cb }) => useTaskChanges(cb), { initialProps: { cb: first } });
    act(() => taskChanged());
    expect(first).toHaveBeenCalledTimes(1);
    rerender({ cb: second });
    act(() => taskChanged());
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
    unmount();
    act(() => taskChanged());
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('useTaskLink', () => {
  it('opens a task on the page the reader is on, keeping its query', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/brain/waiting?scope=me']}>{children}</MemoryRouter>;
    const { result } = renderHook(() => useTaskLink(), { wrapper });
    expect(result.current(51)).toEqual({ pathname: '/brain/waiting', search: '?scope=me&task=51' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/work src/components/work --maxWorkers=2`
Expected: FAIL, every file with "Failed to resolve import" (the modules do not exist yet).

- [ ] **Step 3: Write `src/features/work/workTypes.ts`**

```ts
// The Work API's shapes, field for field (delivery 1 contract:
// revenact-backend docs/superpowers/plans/2026-10-07-work-tasks-api.md).
import type { ScopeKey } from '../brain/brainTypes';

export type TaskStatus = 'pending' | 'in-progress' | 'blocked' | 'completed';
export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskSource = 'manual' | 'plan' | 'rule' | 'recommendation' | 'agent';
export type ParentKind = 'customer' | 'account';

export const STATUSES: readonly TaskStatus[] = ['pending', 'in-progress', 'blocked', 'completed'];
export const PRIORITIES: readonly TaskPriority[] = ['high', 'medium', 'low'];

/** The record a task is on: an organisation (`customer`) or an account. */
export interface TaskParentRef {
  kind: ParentKind;
  id: number;
}

export interface TaskParent extends TaskParentRef {
  name: string;
}

/** `active: false` is a deactivated person ("Unassigned (was X)"). */
export interface TaskPerson {
  id: number;
  name: string;
  active: boolean;
}

export interface PersonRef {
  id: number;
  name: string;
}

/** One row of every Work list. `blocked_reason` is non-empty exactly when Blocked. */
export interface TaskRow {
  id: number;
  title: string;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
  blocked_reason: string;
  source: TaskSource;
  parent: TaskParent;
  /** Null only for an old seeded task. */
  assignee: TaskPerson | null;
  plan: { id: number; name: string } | null;
}

export type TodayGroup = 'overdue' | 'today' | 'week' | 'later' | 'blocked';

/** GET /work/today/: each group lists at most 100 rows; `counts` are the full totals. */
export interface TodayPayload {
  today: string;
  groups: Record<TodayGroup, TaskRow[]>;
  counts: Record<TodayGroup, number>;
  /** Tasks assigned to the reader on records they can no longer open. */
  hidden: number;
}

export interface TeamPerson {
  person: TaskPerson;
  open: number;
  overdue: number;
  blocked: number;
  oldest_overdue: string | null;
}

/** GET /work/team/?scope= */
export interface TeamPayload {
  scope: ScopeKey;
  today: string;
  people: TeamPerson[];
  hidden: number;
}

export type DrillState = 'open' | 'overdue' | 'blocked';

/** GET /work/tasks/?assignee=&state= (at most 200 rows, no hidden count). */
export interface DrillPayload {
  tasks: TaskRow[];
}

export interface AssigneeOption {
  id: number;
  name: string;
  function: string;
  can_open: boolean;
}

/** GET /work/assignees/?customer= or ?account= : every active member, by name. */
export interface AssigneesPayload {
  people: AssigneeOption[];
}

export type EventKind = 'created' | 'recommended' | 'assigned' | 'status' | 'due_changed' | 'edited' | 'comment' | 'nudged' | 'escalated';

/** One line of the activity trail, oldest first. `actor` null: Revenact did it. */
export interface TaskEvent {
  id: number;
  kind: EventKind;
  actor: PersonRef | null;
  data: Record<string, unknown>;
  body: string;
  created_at: string;
}

export type EditableField = 'title' | 'description' | 'status' | 'due_date' | 'priority' | 'assignee';

/** GET /tasks/<id>/ and every PATCH's answer. */
export interface TaskDetail extends TaskRow {
  description: string;
  priority_display: string;
  status_display: string;
  parent_name: string;
  parent_type: ParentKind;
  assignee_name: string;
  created_by: PersonRef | null;
  created_at: string;
  milestone: { id: number; name: string } | null;
  initiative: { id: number; title: string } | null;
  /** The fields this reader may change. */
  editable: EditableField[];
  events: TaskEvent[];
}

export interface TaskPatch {
  title?: string;
  description?: string;
  status?: TaskStatus;
  blocked_reason?: string;
  due_date?: string;
  priority?: TaskPriority;
  assignee_id?: number;
}

/** POST /customers/<id>/tasks/ or /accounts/<id>/tasks/. No assignee: the caller. */
export interface NewTaskBody {
  title: string;
  due_date: string;
  priority: TaskPriority;
  assignee_id?: number | null;
  description?: string;
}
```

- [ ] **Step 4: Write `src/features/work/workApi.ts`**

```ts
// Thin wrappers over apiFetch for the Work routes (delivery 1 contract).
import { ApiError, apiFetch } from '../../lib/apiClient';
import type { ScopeKey } from '../brain/brainTypes';
import type {
  AssigneesPayload,
  DrillPayload,
  DrillState,
  NewTaskBody,
  TaskDetail,
  TaskEvent,
  TaskParentRef,
  TaskPatch,
  TaskRow,
  TeamPayload,
  TodayPayload,
} from './workTypes';

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const fetchToday = () => apiFetch<TodayPayload>('/work/today/');
export const fetchTeam = (scope: ScopeKey) => apiFetch<TeamPayload>(`/work/team/?${query({ scope })}`);
export const fetchDrill = (assignee: number, state: DrillState = 'open') =>
  apiFetch<DrillPayload>(`/work/tasks/?${query({ assignee: String(assignee), state })}`);
export const fetchAssignees = (parent: TaskParentRef) => apiFetch<AssigneesPayload>(`/work/assignees/?${query({ [parent.kind]: String(parent.id) })}`);
export const fetchTask = (id: number) => apiFetch<TaskDetail>(`/tasks/${id}/`);
export const patchTask = (id: number, patch: TaskPatch) => apiFetch<TaskDetail>(`/tasks/${id}/`, { method: 'PATCH', body: patch });
export const postComment = (id: number, body: string) => apiFetch<TaskEvent>(`/tasks/${id}/comments/`, { method: 'POST', body: { body } });
export const createWorkTask = (parent: TaskParentRef, body: NewTaskBody) =>
  apiFetch<TaskRow>(parent.kind === 'customer' ? `/customers/${parent.id}/tasks/` : `/accounts/${parent.id}/tasks/`, { method: 'POST', body });

export type RefusalField = 'title' | 'description' | 'status' | 'blocked_reason' | 'due_date' | 'priority' | 'assignee_id' | 'body';
const FIELDS: readonly RefusalField[] = ['title', 'description', 'status', 'blocked_reason', 'due_date', 'priority', 'assignee_id', 'body'];

/** A refusal, read for the form that sent it: the field it names, or a line for the form. */
export interface Refusal {
  field: Partial<Record<RefusalField, string>>;
  form: string | null;
}

export const NO_REFUSAL: Refusal = { field: {}, form: null };

/** ASSIGNEE_CANNOT_OPEN goes under the assignee; a field's first message under
 *  that field; non_field_errors or detail (403, 404) on the form; anything
 *  else (offline, a 500 without a body) is `fallback`. */
export function readRefusal(err: unknown, fallback: string): Refusal {
  if (!(err instanceof ApiError) || typeof err.body !== 'object' || err.body === null || Array.isArray(err.body)) {
    return { field: {}, form: fallback };
  }
  const body = err.body as Record<string, unknown>;
  if (body.code === 'ASSIGNEE_CANNOT_OPEN' && typeof body.detail === 'string') return { field: { assignee_id: body.detail }, form: null };
  const field: Refusal['field'] = {};
  for (const key of FIELDS) {
    const messages = body[key];
    if (Array.isArray(messages) && typeof messages[0] === 'string') field[key] = messages[0];
  }
  if (Object.keys(field).length > 0) return { field, form: null };
  const general = body.non_field_errors;
  if (Array.isArray(general) && typeof general[0] === 'string') return { field: {}, form: general[0] };
  if (typeof body.detail === 'string') return { field: {}, form: body.detail };
  return { field: {}, form: fallback };
}

/** The task is gone, or the reader may not read it (both are 404). */
export function isMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}
```

- [ ] **Step 5: Write `src/features/work/workText.ts`**

```ts
// The Work section's words, kept free of React so they are unit-tested on
// their own. Sentence case, no em dash.
import type { ScopeKey } from '../brain/brainTypes';
import { formatDate } from '../customers/formatters';
import type {
  ParentKind,
  PersonRef,
  TaskEvent,
  TaskParentRef,
  TaskPerson,
  TaskPriority,
  TaskRow,
  TaskSource,
  TaskStatus,
  TeamPerson,
  TodayGroup,
} from './workTypes';

export const WORK = {
  TITLE: 'Work',
  NEW_TASK: 'New task',
  LOAD_TODAY: 'Could not load your tasks.',
  LOAD_TEAM: 'Could not load the team.',
  LOAD_DRILL: 'Could not load these tasks.',
  LOAD_TASK: 'Could not load this task.',
  LOAD_PEOPLE: 'Could not load teammates.',
  LOADING_PEOPLE: 'Loading teammates…',
  NO_TASK: "This task isn't there, or you can't open it.",
  TASK: 'Task',
  TASK_NOT_FOUND: 'Task not found',
  EMPTY_TITLE: 'Nothing on your list',
  EMPTY_DETAIL: 'Tasks assigned to you show here, soonest first.',
  NOBODY: 'Nobody in this view yet',
  NOBODY_DETAIL: 'People and their open tasks show here.',
  NO_DRILL: 'No open tasks you can see.',
  DONE_FAILED: 'Could not mark that done. Try again.',
  SAVE_FAILED: 'Could not save that change.',
  COMMENT_FAILED: 'Could not add that comment.',
  SAVED: 'Task saved.',
  TITLE_REQUIRED: 'Give the task a title.',
  REASON_REQUIRED: "Say what it's blocked on.",
  DATE_REQUIRED: 'Choose a date.',
  COMMENT_REQUIRED: 'Write a comment.',
  ACTIVITY: 'Activity',
  NO_ACTIVITY: 'No activity recorded yet.',
  ADD_COMMENT: 'Add a comment',
  COMMENT: 'Comment',
  SENDING: 'Sending…',
  BLOCKED_ON: 'Blocked on',
  MARK_BLOCKED: 'Mark blocked',
  SAVE_REASON: 'Save reason',
  SAVE_DESCRIPTION: 'Save description',
  CANCEL: 'Cancel',
  NO_DESCRIPTION: 'No description.',
  TRY_AGAIN: 'Try again',
  PICK_RECORD: 'Pick an organization or account first.',
  RECORD: 'Record',
} as const;

export const GROUP_KEYS: readonly TodayGroup[] = ['overdue', 'today', 'week', 'later', 'blocked'];

export const GROUP_LABEL: Record<TodayGroup, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'This week',
  later: 'Later',
  blocked: 'Blocked',
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  completed: 'Done',
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** Spec §5: a deactivated assignee reads "Unassigned (was X)". */
export function personName(person: TaskPerson | null): string {
  if (!person) return 'Unassigned';
  return person.active ? person.name : `Unassigned (was ${person.name})`;
}

export function parentPath(parent: TaskParentRef): string {
  return parent.kind === 'customer' ? `/organizations/${parent.id}` : `/accounts/${parent.id}`;
}

const SOURCE_TEXT: Record<TaskSource, string | null> = {
  manual: null,
  plan: 'From a plan',
  rule: 'From a rule',
  recommendation: 'Recommended by Revenact',
  agent: 'From the AI agent',
};

export function sourceText(row: Pick<TaskRow, 'source' | 'plan'>): string | null {
  if (row.source === 'plan' && row.plan) return `From ${row.plan.name}`;
  return SOURCE_TEXT[row.source];
}

export function hiddenTodayText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 task on a record you can't open" : `${n} tasks on records you can't open`;
}

export function hiddenTeamText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 task you can't open" : `${n} tasks you can't open`;
}

export function moreRowsText(shown: number, total: number): string | null {
  return total > shown ? `Showing ${shown} of ${total}` : null;
}

const TEAM_TITLE: Record<ScopeKey, string> = { me: 'Your tasks', team: "Your team's tasks", company: "Everyone's tasks" };
export const teamTitle = (scope: ScopeKey): string => TEAM_TITLE[scope];

/** A Team row's accessible name: the person and every count, in words. */
export function teamRowLabel(row: TeamPerson): string {
  const oldest = row.oldest_overdue ? `, oldest due ${formatDate(row.oldest_overdue)}` : '';
  return `${personName(row.person)}: ${row.open} open, ${row.overdue} overdue, ${row.blocked} blocked${oldest}`;
}

export function cantOpenText(kind: ParentKind): string {
  return kind === 'customer' ? "Can't open this organization" : "Can't open this account";
}

export const doneLabel = (title: string): string => `Mark “${title}” done`;
export const doneStatus = (title: string): string => `Done: ${title}.`;

export function actorName(actor: PersonRef | null, me: number | null): string {
  if (!actor) return 'Revenact';
  return actor.id === me ? 'You' : actor.name;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function ref(value: unknown): PersonRef | null {
  if (!value || typeof value !== 'object') return null;
  const person = value as { id?: unknown; name?: unknown };
  return typeof person.id === 'number' && typeof person.name === 'string' ? { id: person.id, name: person.name } : null;
}

const whom = (person: PersonRef, me: number | null): string => (person.id === me ? 'you' : person.name);

const STATUS_WORD: Record<TaskStatus, string> = { pending: 'pending', 'in-progress': 'in progress', blocked: 'blocked', completed: 'done' };
const statusWord = (value: unknown): string => STATUS_WORD[text(value) as TaskStatus] ?? text(value);

const FROM_SOURCE: Record<TaskSource, string> = {
  manual: '',
  plan: ' from a plan',
  rule: ' from a rule',
  recommendation: ' from a recommendation',
  agent: " from the AI agent's proposal",
};

/** One line of the trail, for the reader `me` (backend contract, Event table). */
export function eventSentence(event: TaskEvent, me: number | null): string {
  const who = actorName(event.actor, me);
  const data = event.data;
  switch (event.kind) {
    case 'created': {
      const assignee = ref(data.assignee);
      const forWhom = assignee ? ` for ${whom(assignee, me)}` : '';
      const from = FROM_SOURCE[text(data.source) as TaskSource] ?? '';
      const suggested = text(data.suggested);
      const note = !suggested
        ? ''
        : data.fallback === 'cannot_open'
          ? ` The agent suggested ${suggested}, who can't open this record.`
          : ` The agent suggested ${suggested}, who isn't a member here.`;
      return `${who} created this task${forWhom}${from}.${note}`;
    }
    case 'recommended': {
      const facts = Array.isArray(data.facts) ? data.facts.filter((fact): fact is string => typeof fact === 'string') : [];
      return facts.length > 0 ? `Revenact recommended it: ${facts.join('; ')}.` : 'Revenact recommended it.';
    }
    case 'assigned': {
      const to = ref(data.to);
      const from = ref(data.from);
      if (!to) return `${who} changed who does it.`;
      return `${who} assigned it to ${whom(to, me)}${from ? ` (was ${from.name})` : ''}.`;
    }
    case 'status': {
      const to = text(data.to);
      if (to === 'blocked') {
        const reason = text(data.reason);
        return reason ? `${who} marked it blocked: ${reason}` : `${who} marked it blocked.`;
      }
      if (to === 'completed') return `${who} marked it done.`;
      return `${who} moved it from ${statusWord(data.from)} to ${statusWord(data.to)}.`;
    }
    case 'due_changed':
      return `${who} moved the due date from ${formatDate(text(data.from) || null)} to ${formatDate(text(data.to) || null)}.`;
    case 'edited': {
      const field = text(data.field);
      if (field === 'title') return `${who} renamed it from “${text(data.from)}” to “${text(data.to)}”.`;
      if (field === 'priority') return `${who} changed the priority from ${text(data.from)} to ${text(data.to)}.`;
      return `${who} edited the description.`;
    }
    case 'comment':
      return `${who} commented`;
    case 'nudged':
      return 'Revenact sent a reminder.';
    case 'escalated':
      return 'Revenact told a manager it is overdue.';
    default:
      return `${who} updated it.`;
  }
}
```

- [ ] **Step 6: Write `src/features/work/rows.ts` and `src/features/work/taskParam.ts`**

`src/features/work/rows.ts`:

```ts
import type { TaskRow, TodayGroup, TodayPayload } from './workTypes';

/** Past due and not Blocked, as everywhere in Work (backend Decision 8). */
export function isOverdue(row: Pick<TaskRow, 'status' | 'due_date'>, today: string): boolean {
  return row.status !== 'blocked' && row.due_date < today;
}

/** Today without one row (it was marked done), its group's count one lower. */
export function withoutRow(payload: TodayPayload, id: number): TodayPayload {
  let changed = false;
  const groups = { ...payload.groups };
  const counts = { ...payload.counts };
  for (const key of Object.keys(groups) as TodayGroup[]) {
    const rows = groups[key].filter((row) => row.id !== id);
    if (rows.length !== groups[key].length) {
      groups[key] = rows;
      counts[key] = Math.max(0, counts[key] - 1);
      changed = true;
    }
  }
  return changed ? { ...payload, groups, counts } : payload;
}

export function todayTotal(payload: TodayPayload): number {
  return Object.values(payload.counts).reduce((sum, n) => sum + n, 0);
}
```

`src/features/work/taskParam.ts`:

```ts
// The task panel's place in the URL (spec §1.5: "a side sheet at ?task=<id>
// that works on any route").
export const TASK_PARAM = 'task';

export function taskParam(search: string | URLSearchParams): number | null {
  const raw = new URLSearchParams(search).get(TASK_PARAM);
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

export function withTask(search: string, id: number): string {
  const next = new URLSearchParams(search);
  next.set(TASK_PARAM, String(id));
  return `?${next.toString()}`;
}

export function withoutTask(search: string | URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete(TASK_PARAM);
  return next;
}
```

- [ ] **Step 7: Write `src/components/work/taskChanges.ts` and `src/components/work/useTaskLink.ts`**

`src/components/work/taskChanges.ts`:

```ts
import { useEffect, useRef } from 'react';
import { refreshWaitingCount } from '../brain/useWaitingCount';

const changes = new EventTarget();

/** A task changed (the panel saved, a row was marked done, a task was made):
 *  every list that shows tasks reads again, and so does Brain's badge. */
export function taskChanged(): void {
  changes.dispatchEvent(new Event('change'));
  refreshWaitingCount();
}

/** Runs the latest `onChange` after every `taskChanged()` while mounted. */
export function useTaskChanges(onChange: () => void): void {
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const run = () => latest.current();
    changes.addEventListener('change', run);
    return () => changes.removeEventListener('change', run);
  }, []);
}
```

`src/components/work/useTaskLink.ts`:

```ts
import { useLocation, type To } from 'react-router-dom';
import { withTask } from '../../features/work/taskParam';

/** Where a link opens task `id`: this page, its query kept, plus ?task=. */
export function useTaskLink(): (id: number) => To {
  const { pathname, search } = useLocation();
  return (id) => ({ pathname, search: withTask(search, id) });
}
```

- [ ] **Step 8: Widen the existing task status and keep its callers compiling**

In `src/features/customers/customersSlice.ts`, line 289, replace:

```ts
  status: 'pending' | 'in-progress' | 'completed';
```

(the one inside `export interface Task`) with:

```ts
  /** `blocked` since Work delivery 1; the reason is read from the task panel. */
  status: 'pending' | 'in-progress' | 'blocked' | 'completed';
```

In `src/components/organizations/activity/TasksTab.tsx`, change the lucide import on line 2 to:

```ts
import { CheckCircle, Clock, AlertCircle, MoreHorizontal, Flag, Ban } from 'lucide-react';
```

and add a Blocked row to `statusConfig` (after `'in-progress'`):

```ts
  'blocked': { icon: Ban, color: 'text-warning', label: 'Blocked' },
```

In `src/pages/copilot/cockpitApi.ts`, replace the tick-off function and its comment with:

```ts
// Cockpit's tick-off: the one write on a Task outside its parent's own tab.
// PATCH /api/v1/tasks/<id>/ answers the task panel's shape since Work
// delivery 1; the Cockpit never reads the answer.
export function updateTaskStatus(id: number, status: CockpitTask['status']): Promise<unknown> {
  return apiFetch<unknown>(`/tasks/${id}/`, { method: 'PATCH', body: { status } });
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/features/work src/components/work src/pages/copilot src/components/organizations/activity --maxWorkers=2`
Expected: PASS.

Run: `npm run build`
Expected: exit 0 (the widened status type compiles everywhere).

- [ ] **Step 10: Commit**

```bash
git add src/features/work/workTypes.ts src/features/work/workApi.ts src/features/work/workText.ts src/features/work/rows.ts src/features/work/taskParam.ts \
  src/features/work/workText.test.ts src/features/work/rows.test.ts src/features/work/taskParam.test.ts src/features/work/workApi.test.ts \
  src/components/work/taskChanges.ts src/components/work/useTaskLink.ts src/components/work/taskChanges.test.tsx \
  src/features/customers/customersSlice.ts src/components/organizations/activity/TasksTab.tsx src/pages/copilot/cockpitApi.ts
git commit -m "$(cat <<'EOF'
feat(work): the Work data layer, copy and task-change bus

Types, API calls and refusal reading for the delivery 1 contract, the
activity trail in sentences, ?task= helpers, and a bus that tells every
task list to read again. Task status gains blocked.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: A stateful stub of the Work API for tests

**Files:**
- Create: `src/features/work/testWorkFixtures.ts`, `src/features/work/testWork.ts`
- Test: `src/features/work/testWork.test.ts`

**Interfaces:**
- Consumes: the Task 1 types; `ScopeKey`.
- Produces (test-only):
  - fixtures `TODAY = '2026-10-07'`, people `ALICE` (id 1, the store's default user), `MONA` (2), `CARL` (3), `DANA` (4), `ERIN_GONE` (5, inactive); records `PIZZA` (customer 7), `UBER` (account 9); `taskDetail(over)`; tasks `CALL_PIZZA` (41, overdue), `QBR_DECK` (42, today, in progress), `RENEWAL_PRICING` (43, week, Uber), `ROADMAP` (44, later), `SECURITY` (45, blocked "Waiting on legal"), `CARL_CHASE` (46, Carl, overdue), `KICKOFF` (47, plan task, `editable: ['status']`, week), `ERIN_OLD` (48, Erin, overdue); `WORK_TASKS`; `ASSIGNEES` (Dana `can_open: false`); `TEAM_PEOPLE`; `MEMBERS` (Carl and Dana report to Alice).
  - `stubWork(stub?: WorkStub): { spy; tasks: Map<number, TaskDetail> }` and the `WorkStub` options: `tasks`, `reader`, `todayHidden`, `teamHidden`, `offered`, `assignees`, `members`, `failToday`, `failTeam`, `failDrill`, `failTask`, `failAssignees`, `refuseNextPatch`, `refuseNextComment`, `passThrough`.
  - `calls(spy, method, part): string[]` and `sent(spy, method, part): unknown[]` (the requests' paths and JSON bodies).

- [ ] **Step 1: Write the failing test** `src/features/work/testWork.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, sent, stubWork } from './testWork';
import { CALL_PIZZA } from './testWorkFixtures';
import type { TaskDetail, TeamPayload, TodayPayload } from './workTypes';

const get = async (path: string, init?: RequestInit) => {
  const response = await fetch(`http://localhost/api/v1${path}`, init);
  return { status: response.status, body: await response.json() };
};
const patch = (path: string, body: unknown) => get(path, { method: 'PATCH', body: JSON.stringify(body) });

describe('stubWork (contract 2026-10-07-work-tasks-api.md)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('groups my open tasks the backend’s way: Blocked first, then by date', async () => {
    stubWork({ todayHidden: 2 });
    const { body } = (await get('/work/today/')) as { body: TodayPayload };
    expect(body.today).toBe('2026-10-07');
    expect(Object.fromEntries(Object.entries(body.groups).map(([key, rows]) => [key, rows.map((r) => r.id)]))).toEqual({
      overdue: [41],
      today: [42],
      week: [47, 43],
      later: [44],
      blocked: [45],
    });
    expect(body.counts).toEqual({ overdue: 1, today: 1, week: 2, later: 1, blocked: 1 });
    expect(body.hidden).toBe(2);
  });

  it('refuses Blocked without a reason and an assignee who can’t open the record, and writes one event per change', async () => {
    const { spy } = stubWork();
    expect((await patch('/tasks/41/', { status: 'blocked' })).body).toEqual({ blocked_reason: ["Say what it's blocked on."] });
    expect((await patch('/tasks/41/', { assignee_id: 4 })).body).toEqual({
      code: 'ASSIGNEE_CANNOT_OPEN',
      detail: "That person can't open this organisation.",
    });
    const { status, body } = (await patch('/tasks/41/', { status: 'blocked', blocked_reason: 'Waiting on legal', priority: 'low' })) as {
      status: number;
      body: TaskDetail;
    };
    expect(status).toBe(200);
    expect(body.status).toBe('blocked');
    expect(body.events.slice(1).map((e) => [e.kind, e.data])).toEqual([
      ['edited', { field: 'priority', from: 'high', to: 'low' }],
      ['status', { from: 'pending', to: 'blocked', reason: 'Waiting on legal' }],
    ]);
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual(['/tasks/41/', '/tasks/41/', '/tasks/41/']);
    expect(sent(spy, 'PATCH', '/tasks/')[2]).toEqual({ status: 'blocked', blocked_reason: 'Waiting on legal', priority: 'low' });
  });

  it('keeps a plan task’s other fields for its editors (403)', async () => {
    stubWork();
    expect((await patch('/tasks/47/', { title: 'Renamed' })).status).toBe(403);
    expect((await patch('/tasks/47/', { status: 'in-progress' })).status).toBe(200);
  });

  it('counts Team from the same tasks, refuses a scope not offered, and drills by state', async () => {
    stubWork({ offered: ['me', 'team'], teamHidden: { team: 2 } });
    const team = (await get('/work/team/?scope=team')) as { body: TeamPayload };
    expect(team.body.people.map((p) => [p.person.name, p.open, p.overdue, p.blocked, p.oldest_overdue])).toEqual([
      ['Alice', 6, 1, 1, '2026-10-05'],
      ['Carl CSM', 1, 1, 0, '2026-10-03'],
      ['Erin Former', 1, 1, 0, '2026-10-02'],
      ['Dana CSM', 0, 0, 0, null],
    ]);
    expect(team.body.hidden).toBe(2);
    expect((await get('/work/team/?scope=company')).status).toBe(403);
    expect((await get('/work/team/?scope=nope')).status).toBe(400);
    expect(((await get('/work/tasks/?assignee=1&state=blocked')).body as { tasks: { id: number }[] }).tasks.map((t) => t.id)).toEqual([45]);
    expect((await get('/work/tasks/?state=open')).status).toBe(400);
  });

  it('serves a task, comments on it, and makes a new one on either kind of record', async () => {
    stubWork();
    expect((await get('/tasks/41/')).body).toEqual(CALL_PIZZA);
    expect((await get('/tasks/999/')).status).toBe(404);
    const comment = await get('/tasks/41/comments/', { method: 'POST', body: JSON.stringify({ body: 'Called.' }) });
    expect(comment.status).toBe(201);
    expect((comment.body as { kind: string }).kind).toBe('comment');
    expect((await get('/tasks/41/comments/', { method: 'POST', body: JSON.stringify({ body: ' ' }) })).body).toEqual({ body: ['Write a comment.'] });
    const made = await get('/accounts/9/tasks/', { method: 'POST', body: JSON.stringify({ title: 'Prep', due_date: '2026-10-14', priority: 'low' }) });
    expect(made.status).toBe(201);
    expect((made.body as { parent: unknown; assignee: { name: string } }).parent).toEqual({ kind: 'account', id: 9, name: 'Uber EMEA' });
    expect(((await get('/work/assignees/?customer=7')).body as { people: unknown[] }).people).toHaveLength(4);
    expect((await get('/work/assignees/')).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/work/testWork.test.ts --maxWorkers=2`
Expected: FAIL with "Failed to resolve import './testWork'".

- [ ] **Step 3: Write `src/features/work/testWorkFixtures.ts`**

```ts
// Test-only: the people, records and tasks the Work tests share. Alice
// (id 1) is makeRulesStore's default user; Carl and Dana report to her.
import type { ScopeKey } from '../brain/brainTypes';
import type { AssigneeOption, PersonRef, TaskDetail, TaskEvent, TaskParent, TaskPerson } from './workTypes';

export const TODAY = '2026-10-07';
export const NOW = '2026-10-07T10:00:00.000000Z';

export const ALICE: TaskPerson = { id: 1, name: 'Alice', active: true };
export const MONA: TaskPerson = { id: 2, name: 'Mona Manager', active: true };
export const CARL: TaskPerson = { id: 3, name: 'Carl CSM', active: true };
export const DANA: TaskPerson = { id: 4, name: 'Dana CSM', active: true };
export const ERIN_GONE: TaskPerson = { id: 5, name: 'Erin Former', active: false };

export const refOf = (person: TaskPerson): PersonRef => ({ id: person.id, name: person.name });

export const PIZZA: TaskParent = { kind: 'customer', id: 7, name: 'Pizza Hut' };
export const UBER: TaskParent = { kind: 'account', id: 9, name: 'Uber EMEA' };

const PRIORITY_DISPLAY = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const STATUS_DISPLAY = { pending: 'Pending', 'in-progress': 'In Progress', blocked: 'Blocked', completed: 'Completed' } as const;

export function taskEvent(id: number, kind: TaskEvent['kind'], actor: PersonRef | null, data: Record<string, unknown>, body = '', created_at = NOW): TaskEvent {
  return { id, kind, actor, data, body, created_at };
}

/** A task as GET /tasks/<id>/ answers it, on Pizza Hut and Alice's unless `over` says otherwise. */
export function taskDetail(over: Partial<TaskDetail> & Pick<TaskDetail, 'id' | 'title' | 'due_date'>): TaskDetail {
  const parent = over.parent ?? PIZZA;
  const assignee = over.assignee === undefined ? ALICE : over.assignee;
  const priority = over.priority ?? 'medium';
  const status = over.status ?? 'pending';
  return {
    description: '',
    priority,
    priority_display: PRIORITY_DISPLAY[priority],
    status,
    status_display: STATUS_DISPLAY[status],
    blocked_reason: '',
    source: 'manual',
    parent,
    parent_name: parent.name,
    parent_type: parent.kind,
    assignee,
    assignee_name: assignee?.name ?? '',
    created_by: refOf(MONA),
    created_at: '2026-10-01T08:00:00.000000Z',
    plan: null,
    milestone: null,
    initiative: null,
    editable: ['title', 'description', 'status', 'due_date', 'priority', 'assignee'],
    events: [],
    ...over,
  };
}

export const CALL_PIZZA = taskDetail({
  id: 41,
  title: 'Call Pizza Hut',
  due_date: '2026-10-05',
  priority: 'high',
  events: [taskEvent(1, 'created', refOf(MONA), { source: 'manual', assignee: refOf(ALICE) }, '', '2026-10-01T08:00:00.000000Z')],
});
export const QBR_DECK = taskDetail({ id: 42, title: 'Send the QBR deck', due_date: TODAY, status: 'in-progress' });
export const RENEWAL_PRICING = taskDetail({ id: 43, title: 'Prep renewal pricing', due_date: '2026-10-10', priority: 'low', parent: UBER });
export const ROADMAP = taskDetail({ id: 44, title: 'Plan the 2027 roadmap review', due_date: '2026-11-20' });
export const SECURITY = taskDetail({ id: 45, title: 'Get the security review signed', due_date: '2026-10-01', status: 'blocked', blocked_reason: 'Waiting on legal' });
export const CARL_CHASE = taskDetail({ id: 46, title: 'Chase the exec sponsor', due_date: '2026-10-03', priority: 'high', assignee: CARL });
export const KICKOFF = taskDetail({
  id: 47,
  title: 'Kick-off call',
  due_date: '2026-10-08',
  source: 'plan',
  plan: { id: 12, name: 'Onboarding · Pizza Hut' },
  milestone: { id: 120, name: 'Start' },
  editable: ['status'],
});
export const ERIN_OLD = taskDetail({ id: 48, title: 'Close the onboarding ticket', due_date: '2026-10-02', assignee: ERIN_GONE });

export const WORK_TASKS: TaskDetail[] = [CALL_PIZZA, QBR_DECK, RENEWAL_PRICING, ROADMAP, SECURITY, CARL_CHASE, KICKOFF, ERIN_OLD];

/** GET /work/assignees/: every active member by name; Dana can't open the records. */
export const ASSIGNEES: AssigneeOption[] = [
  { id: 1, name: 'Alice', function: 'cs', can_open: true },
  { id: 3, name: 'Carl CSM', function: 'cs', can_open: true },
  { id: 4, name: 'Dana CSM', function: 'cs', can_open: false },
  { id: 2, name: 'Mona Manager', function: 'leadership', can_open: true },
];

/** The people of each scope (Me, Alice's team, the workspace). */
export const TEAM_PEOPLE: Record<ScopeKey, TaskPerson[]> = {
  me: [ALICE],
  team: [ALICE, CARL, DANA, ERIN_GONE],
  company: [ALICE, MONA, CARL, DANA, ERIN_GONE],
};

function member(person: TaskPerson, reportsTo: TaskPerson | null) {
  return {
    id: person.id,
    name: person.name,
    email: `${person.name.split(' ')[0].toLowerCase()}@acme.io`,
    avatar: '',
    role: 'csm',
    role_id: 1,
    role_name: 'CSM',
    permissions: [],
    function: 'cs',
    function_display: 'Customer Success',
    reports_to: reportsTo ? refOf(reportsTo) : null,
    is_active: person.active,
  };
}

/** GET /auth/members/: Alice has reports (Carl and Dana). */
export const MEMBERS = [member(ALICE, MONA), member(MONA, null), member(CARL, ALICE), member(DANA, ALICE)];

/** GET /customers/?search= and /accounts/?search= (New task's record search). */
export const RECORDS = {
  customers: [{ id: 7, name: 'Pizza Hut' }],
  accounts: [{ id: 9, name: 'Uber EMEA' }],
};
```

- [ ] **Step 4: Write `src/features/work/testWork.ts`**

```ts
// Test-only: one stateful fetch stub for the Work routes, in the delivery 1
// contract's shapes and refusal order. Writes are kept, so a later read
// returns them; every answer is a copy, so nothing on screen shares state
// with the stub. Brain's scopes/ and waiting/count/, /auth/members/, the
// record search and /notifications/ answer too, so a page renders whole.
import { vi } from 'vitest';
import type { ScopeKey } from '../brain/brainTypes';
import { ASSIGNEES, MEMBERS, NOW, RECORDS, TEAM_PEOPLE, TODAY, ALICE, refOf, taskDetail, taskEvent, WORK_TASKS } from './testWorkFixtures';
import type { AssigneeOption, TaskDetail, TaskPerson, TaskRow, TaskStatus, TeamPerson, TodayGroup } from './workTypes';

export interface WorkStub {
  /** Default WORK_TASKS (copied). */
  tasks?: TaskDetail[];
  /** Who is reading. Default ALICE (the store's user). */
  reader?: TaskPerson;
  /** GET /work/today/'s `hidden`. Default 0. */
  todayHidden?: number;
  /** GET /work/team/'s `hidden` by scope. Default 0. */
  teamHidden?: Partial<Record<ScopeKey, number>>;
  /** Brain's scopes. Default all three. */
  offered?: ScopeKey[];
  /** GET /work/assignees/. Default ASSIGNEES. */
  assignees?: AssigneeOption[];
  /** GET /auth/members/. Default MEMBERS. */
  members?: unknown[];
  /** How many reads of each fail (500) first. */
  failToday?: number;
  failTeam?: number;
  failDrill?: number;
  failTask?: number;
  failAssignees?: number;
  /** The next PATCH /tasks/<id>/ answers this instead, once. */
  refuseNextPatch?: { status: number; body: unknown };
  /** The next comment answers this instead, once. */
  refuseNextComment?: { status: number; body: unknown };
  /** Every request this stub does not know goes here instead. */
  passThrough?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
}

const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const DOWN = { detail: 'Down.' };
const NO_TASK = { detail: 'No such task.' };
const SCOPE_LABEL: Record<ScopeKey, string> = { me: 'Me', team: 'My team', company: 'Company' };
const SCOPES: readonly ScopeKey[] = ['me', 'team', 'company'];
const STATUSES: readonly TaskStatus[] = ['pending', 'in-progress', 'blocked', 'completed'];
const PRIORITIES = ['high', 'medium', 'low'];
const FIELDS = new Set(['title', 'description', 'status', 'due_date', 'priority', 'assignee']);
const PRIORITY_DISPLAY: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const STATUS_DISPLAY: Record<TaskStatus, string> = { pending: 'Pending', 'in-progress': 'In Progress', blocked: 'Blocked', completed: 'Completed' };

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function groupOf(task: TaskDetail): TodayGroup {
  if (task.status === 'blocked') return 'blocked';
  if (task.due_date < TODAY) return 'overdue';
  if (task.due_date === TODAY) return 'today';
  return task.due_date <= addDays(TODAY, 7) ? 'week' : 'later';
}

const byDue = (a: TaskDetail, b: TaskDetail) => a.due_date.localeCompare(b.due_date) || a.id - b.id;
const isOpen = (task: TaskDetail) => task.status !== 'completed';
const lateOf = (task: TaskDetail) => task.status !== 'blocked' && task.due_date < TODAY;

function rowOf(task: TaskDetail): TaskRow {
  const { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan } = task;
  return { id, title, due_date, priority, status, blocked_reason, source, parent, assignee, plan };
}

export function stubWork(stub: WorkStub = {}) {
  const reader = stub.reader ?? ALICE;
  const me = refOf(reader);
  const tasks = new Map<number, TaskDetail>((stub.tasks ?? WORK_TASKS).map((task) => [task.id, JSON.parse(JSON.stringify(task)) as TaskDetail]));
  const offered = stub.offered ?? [...SCOPES];
  const assignees = stub.assignees ?? ASSIGNEES;
  let failToday = stub.failToday ?? 0;
  let failTeam = stub.failTeam ?? 0;
  let failDrill = stub.failDrill ?? 0;
  let failTask = stub.failTask ?? 0;
  let failAssignees = stub.failAssignees ?? 0;
  let refusePatch = stub.refuseNextPatch ?? null;
  let refuseComment = stub.refuseNextComment ?? null;
  let nextTask = 900;
  let nextEvent = 9000;

  function today() {
    const groups: Record<TodayGroup, TaskRow[]> = { overdue: [], today: [], week: [], later: [], blocked: [] };
    for (const task of [...tasks.values()].filter((t) => t.assignee?.id === reader.id && isOpen(t)).sort(byDue)) groups[groupOf(task)].push(rowOf(task));
    const counts = Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])) as Record<TodayGroup, number>;
    return { today: TODAY, groups, counts, hidden: stub.todayHidden ?? 0 };
  }

  function team(scope: ScopeKey) {
    const people: TeamPerson[] = [];
    for (const person of TEAM_PEOPLE[scope]) {
      const open = [...tasks.values()].filter((t) => t.assignee?.id === person.id && isOpen(t));
      if (!person.active && open.length === 0) continue;
      const late = open.filter(lateOf).sort(byDue);
      people.push({
        person,
        open: open.length,
        overdue: late.length,
        blocked: open.filter((t) => t.status === 'blocked').length,
        oldest_overdue: late[0]?.due_date ?? null,
      });
    }
    people.sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.person.name.localeCompare(b.person.name));
    return { scope, today: TODAY, people, hidden: stub.teamHidden?.[scope] ?? 0 };
  }

  function write(task: TaskDetail, kind: 'edited' | 'due_changed' | 'status' | 'assigned', data: Record<string, unknown>) {
    task.events.push(taskEvent(nextEvent++, kind, me, data));
  }

  function patch(task: TaskDetail, body: unknown) {
    if (refusePatch) {
      const answer = refusePatch;
      refusePatch = null;
      return json(answer.status, answer.body);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { non_field_errors: ['Send the fields as one object.'] });
    const asked = body as Record<string, unknown>;
    const fields = Object.keys(asked)
      .filter((key) => key !== 'blocked_reason')
      .map((key) => (key === 'assignee_id' ? 'assignee' : key))
      .filter((key) => FIELDS.has(key));
    if (fields.some((field) => !task.editable.includes(field as TaskDetail['editable'][number]))) {
      return json(403, { detail: "Only the plan's owner or their managers can change it." });
    }
    if ('title' in asked && !String(asked.title ?? '').trim()) return json(400, { title: ['Give the task a title.'] });
    if ('status' in asked && !STATUSES.includes(asked.status as TaskStatus)) return json(400, { status: ['Choose pending, in progress, blocked or completed.'] });
    if ('priority' in asked && !PRIORITIES.includes(String(asked.priority))) return json(400, { priority: ['Choose high, medium or low.'] });
    if ('due_date' in asked && !/^\d{4}-\d{2}-\d{2}$/.test(String(asked.due_date))) return json(400, { due_date: ['Choose a date.'] });
    let assignee: AssigneeOption | undefined;
    if ('assignee_id' in asked) {
      if (typeof asked.assignee_id !== 'number') return json(400, { assignee_id: ['Choose who does it.'] });
      assignee = assignees.find((person) => person.id === asked.assignee_id);
      if (!assignee || !assignee.can_open) {
        return json(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: `That person can't open this ${task.parent.kind === 'customer' ? 'organisation' : 'account'}.` });
      }
    }
    const status = (asked.status as TaskStatus | undefined) ?? task.status;
    const reason = status === 'blocked' ? String(asked.blocked_reason ?? task.blocked_reason).trim() : '';
    if (status === 'blocked' && !reason) return json(400, { blocked_reason: ["Say what it's blocked on."] });

    if (typeof asked.title === 'string' && asked.title !== task.title) {
      write(task, 'edited', { field: 'title', from: task.title, to: asked.title });
      task.title = asked.title;
    }
    if (typeof asked.description === 'string' && asked.description !== task.description) {
      write(task, 'edited', { field: 'description' });
      task.description = asked.description;
    }
    if (typeof asked.priority === 'string' && asked.priority !== task.priority) {
      write(task, 'edited', { field: 'priority', from: task.priority, to: asked.priority });
      task.priority = asked.priority as TaskDetail['priority'];
      task.priority_display = PRIORITY_DISPLAY[asked.priority];
    }
    if (typeof asked.due_date === 'string' && asked.due_date !== task.due_date) {
      write(task, 'due_changed', { from: task.due_date, to: asked.due_date });
      task.due_date = asked.due_date;
    }
    if (status !== task.status) {
      write(task, 'status', status === 'blocked' ? { from: task.status, to: status, reason } : { from: task.status, to: status });
      task.status = status;
      task.status_display = STATUS_DISPLAY[status];
    }
    task.blocked_reason = reason;
    if (assignee && assignee.id !== task.assignee?.id) {
      write(task, 'assigned', { from: task.assignee ? refOf(task.assignee) : null, to: { id: assignee.id, name: assignee.name } });
      task.assignee = { id: assignee.id, name: assignee.name, active: true };
      task.assignee_name = assignee.name;
    }
    return json(200, task);
  }

  function create(kind: 'customers' | 'accounts', id: number, body: Record<string, unknown>) {
    const record = (kind === 'customers' ? RECORDS.customers : RECORDS.accounts).find((r) => r.id === id);
    if (!record) return json(404, { detail: 'Not found.' });
    const title = String(body.title ?? '').trim();
    if (!title) return json(400, { title: ['Give the task a title.'] });
    let person: TaskPerson = reader;
    if (body.assignee_id !== undefined && body.assignee_id !== null) {
      const chosen = assignees.find((p) => p.id === body.assignee_id);
      if (!chosen || !chosen.can_open) return json(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: "That person can't open this organisation." });
      person = { id: chosen.id, name: chosen.name, active: true };
    }
    const parent = { kind: kind === 'customers' ? ('customer' as const) : ('account' as const), id: record.id, name: record.name };
    const task = taskDetail({
      id: nextTask++,
      title,
      due_date: String(body.due_date),
      priority: (body.priority as TaskDetail['priority']) ?? 'medium',
      parent,
      assignee: person,
      created_by: me,
      created_at: NOW,
      events: [taskEvent(nextEvent++, 'created', me, { source: 'manual', assignee: refOf(person) })],
    });
    tasks.set(task.id, task);
    return json(201, { ...rowOf(task), description: '', created_at: NOW });
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (method === 'GET' && path === '/brain/scopes/') {
      return json(200, { scopes: offered.map((key) => ({ key, label: SCOPE_LABEL[key] })), default: offered[offered.length - 1] });
    }
    if (method === 'GET' && path === '/brain/waiting/count/') return json(200, { count: 0 });
    if (method === 'GET' && path === '/auth/members/') return json(200, stub.members ?? MEMBERS);
    if (method === 'GET' && path === '/notifications/') return json(200, []);
    if (method === 'GET' && (path === '/customers/' || path === '/accounts/')) {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const rows = (path === '/customers/' ? RECORDS.customers : RECORDS.accounts).filter((r) => r.name.toLowerCase().includes(search));
      return json(200, { count: rows.length, next: null, previous: null, results: rows });
    }
    if (method === 'GET' && path === '/work/today/') {
      if (failToday > 0) {
        failToday -= 1;
        return json(500, DOWN);
      }
      return json(200, today());
    }
    if (method === 'GET' && path === '/work/team/') {
      const scope = url.searchParams.get('scope') as ScopeKey | null;
      if (!scope || !SCOPES.includes(scope)) return json(400, { code: 'SCOPE_UNKNOWN', detail: 'Choose me, team or company.' });
      if (!offered.includes(scope)) return json(403, { code: 'SCOPE_NOT_ALLOWED', detail: "You can't see that view." });
      if (failTeam > 0) {
        failTeam -= 1;
        return json(500, DOWN);
      }
      return json(200, team(scope));
    }
    if (method === 'GET' && path === '/work/tasks/') {
      const assignee = url.searchParams.get('assignee');
      const state = url.searchParams.get('state') ?? 'open';
      if (!assignee || !/^\d+$/.test(assignee)) return json(400, { assignee: ['Choose a person.'] });
      if (!['open', 'overdue', 'blocked'].includes(state)) return json(400, { state: ['Choose open, overdue or blocked.'] });
      if (failDrill > 0) {
        failDrill -= 1;
        return json(500, DOWN);
      }
      const rows = [...tasks.values()]
        .filter((t) => t.assignee?.id === Number(assignee) && isOpen(t))
        .filter((t) => (state === 'overdue' ? lateOf(t) : state === 'blocked' ? t.status === 'blocked' : true))
        .sort(byDue)
        .map(rowOf);
      return json(200, { tasks: rows });
    }
    if (method === 'GET' && path === '/work/assignees/') {
      const named = ['customer', 'account'].filter((key) => url.searchParams.has(key));
      if (named.length !== 1 || !/^\d+$/.test(url.searchParams.get(named[0]) ?? '')) return json(400, { detail: 'Name one organisation or account.' });
      if (failAssignees > 0) {
        failAssignees -= 1;
        return json(500, DOWN);
      }
      return json(200, { people: assignees });
    }
    const detail = /^\/tasks\/(\d+)\/$/.exec(path);
    if (detail) {
      const task = tasks.get(Number(detail[1]));
      if (!task) return json(404, NO_TASK);
      if (method === 'GET') {
        if (failTask > 0) {
          failTask -= 1;
          return json(500, DOWN);
        }
        return json(200, task);
      }
      if (method === 'PATCH') return patch(task, body);
    }
    const comments = /^\/tasks\/(\d+)\/comments\/$/.exec(path);
    if (comments && method === 'POST') {
      const task = tasks.get(Number(comments[1]));
      if (!task) return json(404, NO_TASK);
      if (refuseComment) {
        const answer = refuseComment;
        refuseComment = null;
        return json(answer.status, answer.body);
      }
      const text = String((body as { body?: unknown } | undefined)?.body ?? '').trim();
      if (!text) return json(400, { body: ['Write a comment.'] });
      const event = taskEvent(nextEvent++, 'comment', me, {}, text);
      task.events.push(event);
      return json(201, event);
    }
    const made = /^\/(customers|accounts)\/(\d+)\/tasks\/$/.exec(path);
    if (made && method === 'POST') return create(made[1] as 'customers' | 'accounts', Number(made[2]), (body ?? {}) as Record<string, unknown>);
    if (stub.passThrough) return stub.passThrough(input, init);
    return json(404, { detail: 'Not found.' });
  });
  vi.stubGlobal('fetch', spy);
  return { spy, tasks };
}

/** Every `method` request whose path contains `part`, as `/path?query` without /api/v1. */
export function calls(spy: ReturnType<typeof vi.fn>, method: string, part: string): string[] {
  return spy.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), method: (init as RequestInit | undefined)?.method ?? 'GET' }))
    .filter((call) => call.method === method && call.url.pathname.includes(part))
    .map((call) => `${call.url.pathname.replace(/^\/api\/v1/, '')}${call.url.search}`);
}

/** The JSON bodies of every `method` request whose path contains `part`. */
export function sent(spy: ReturnType<typeof vi.fn>, method: string, part: string): unknown[] {
  return spy.mock.calls
    .filter(([input, init]) => ((init as RequestInit | undefined)?.method ?? 'GET') === method && new URL(String(input)).pathname.includes(part))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/features/work/testWork.test.ts --maxWorkers=2`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/work/testWorkFixtures.ts src/features/work/testWork.ts src/features/work/testWork.test.ts
git commit -m "$(cat <<'EOF'
test(work): a stateful stub of the Work API

Today, Team, the drill-down, the assignee picker, a task, its edits and
comments, and New task, in the delivery 1 contract's shapes and refusals.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 3: The assignee picker, on New task forms too

**Files:**
- Create: `src/features/work/assignees.ts`, `src/components/work/useAssignees.ts`, `src/components/work/AssigneeSelect.tsx`
- Modify: `src/components/organizations/activity/TasksTab.tsx` (`TaskForm`), `src/components/organizations/detail/AddFlow.tsx:89-93`
- Test: `src/features/work/assignees.test.ts`, `src/components/work/AssigneeSelect.test.tsx`, `src/components/organizations/activity/TasksTab.test.tsx` (add one case)

**Interfaces:**
- Consumes: `fetchAssignees`, `cantOpenText`, `WORK`, `AssigneeOption`, `TaskParentRef`, `TaskPerson`, `ParentKind` (Task 1); `stubWork`, `calls` (Task 2); `errorMessage` (`components/organizations/portfolio/usePagedRead.ts`); `FILTER_SELECT` (`components/organizations/portfolio/filterParts.tsx`); `CONTROL` (`components/organizations/activity/formStyles.ts`).
- Produces:
  - `interface PickerOption { id: number; label: string; disabled: boolean }`, `assigneeOptions(people: AssigneeOption[], kind: ParentKind, current?: TaskPerson | null): PickerOption[]`.
  - `useAssignees(parent: TaskParentRef | null): { people: AssigneeOption[] | null; error: string | null }`.
  - `<AssigneeSelect id value options onChange disabled? meOption? size? aria? />` where `value: number | null`, `onChange: (id: number | null) => void`, `size: 'form' | 'panel'` (default `'panel'`), `aria?: { 'aria-describedby'?: string; 'aria-invalid': boolean }`.
  - `TaskForm` gains an optional `parent?: TaskParentRef`; with it, its Assignee select lists `/work/assignees/` and disables people who can't open the record.

- [ ] **Step 1: Write the failing tests**

`src/features/work/assignees.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assigneeOptions } from './assignees';
import { ASSIGNEES, CARL, ERIN_GONE } from './testWorkFixtures';

describe('assigneeOptions (spec §1.5: others are disabled with "Can\'t open this account")', () => {
  it('lists everyone, disabling who can’t open the record, in the record’s own word', () => {
    expect(assigneeOptions(ASSIGNEES, 'customer')).toEqual([
      { id: 1, label: 'Alice', disabled: false },
      { id: 3, label: 'Carl CSM', disabled: false },
      { id: 4, label: "Dana CSM · Can't open this organization", disabled: true },
      { id: 2, label: 'Mona Manager', disabled: false },
    ]);
    expect(assigneeOptions(ASSIGNEES, 'account')[2].label).toBe("Dana CSM · Can't open this account");
  });

  it('keeps a current assignee the list no longer holds, disabled', () => {
    expect(assigneeOptions(ASSIGNEES, 'customer', ERIN_GONE)[0]).toEqual({ id: 5, label: 'Erin Former (no longer active)', disabled: true });
    expect(assigneeOptions([], 'customer', CARL)).toEqual([{ id: 3, label: 'Carl CSM', disabled: true }]);
    expect(assigneeOptions(ASSIGNEES, 'customer', CARL)).toHaveLength(4);
  });
});
```

`src/components/work/AssigneeSelect.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { assigneeOptions } from '../../features/work/assignees';
import { calls, stubWork } from '../../features/work/testWork';
import { ASSIGNEES } from '../../features/work/testWorkFixtures';
import { AssigneeSelect } from './AssigneeSelect';
import { useAssignees } from './useAssignees';

describe('useAssignees', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the picker for the record, and again for another one', async () => {
    const { spy } = stubWork();
    const { result, rerender } = renderHook(({ parent }) => useAssignees(parent), {
      initialProps: { parent: { kind: 'customer' as const, id: 7 } as { kind: 'customer' | 'account'; id: number } | null },
    });
    expect(result.current).toEqual({ people: null, error: null });
    await waitFor(() => expect(result.current.people).toEqual(ASSIGNEES));
    rerender({ parent: { kind: 'account', id: 9 } });
    expect(result.current.people).toBeNull();
    await waitFor(() => expect(result.current.people).toEqual(ASSIGNEES));
    expect(calls(spy, 'GET', '/work/assignees/')).toEqual(['/work/assignees/?customer=7', '/work/assignees/?account=9']);
  });

  it('reads nothing without a record, and says so when the read fails', async () => {
    const { spy } = stubWork({ failAssignees: 1 });
    const none = renderHook(() => useAssignees(null));
    expect(none.result.current).toEqual({ people: null, error: null });
    const { result } = renderHook(() => useAssignees({ kind: 'customer', id: 7 }));
    await waitFor(() => expect(result.current.error).toBe('Down.'));
    expect(calls(spy, 'GET', '/work/assignees/')).toHaveLength(1);
  });
});

describe('AssigneeSelect', () => {
  it('disables who can’t open the record, and answers a number', async () => {
    const onChange = vi.fn();
    render(
      <>
        <label htmlFor="who">Assignee</label>
        <AssigneeSelect id="who" value={1} options={assigneeOptions(ASSIGNEES, 'customer')} onChange={onChange} />
      </>,
    );
    const select = screen.getByLabelText('Assignee');
    expect(screen.getByRole('option', { name: "Dana CSM · Can't open this organization" })).toBeDisabled();
    await userEvent.selectOptions(select, '3');
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('offers "Assign to me" on a New task form, answering null for it', async () => {
    const onChange = vi.fn();
    render(
      <>
        <label htmlFor="who">Assignee</label>
        <AssigneeSelect id="who" value={3} options={assigneeOptions(ASSIGNEES, 'customer')} onChange={onChange} meOption size="form" />
      </>,
    );
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '');
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

Add to `src/components/organizations/activity/TasksTab.test.tsx`, inside `describe('TasksTab', …)` (the file's `beforeEach` stubs fetch; this case stubs its own). Also add `import { TaskForm } from './TasksTab';` to the existing import line (it becomes `import { TaskForm, TasksTab } from './TasksTab';`) and `import { stubWork } from '../../../features/work/testWork';` with the other imports:

```tsx
  it('with a record, lists who can open it and disables the rest (Work spec §1.5)', async () => {
    stubWork();
    const onCreate = vi.fn().mockResolvedValue(true);
    render(<TaskForm onCreate={onCreate} parent={{ kind: 'customer', id: 7 }} />);
    const dana = await screen.findByRole('option', { name: "Dana CSM · Can't open this organization" });
    expect(dana).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Task title'), 'Prep the QBR');
    await userEvent.type(screen.getByLabelText('Due date'), '2026-10-14');
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    expect(onCreate).toHaveBeenCalledWith({ title: 'Prep the QBR', due_date: '2026-10-14', priority: 'medium', assignee_id: 3 });
  });

  it('shows the server’s sentence when the assignee can’t open the record', async () => {
    stubWork();
    const { ApiError } = await import('../../../lib/apiClient');
    const sentence = "That person can't open this organisation.";
    const onCreate = vi.fn().mockRejectedValue(new ApiError(400, { code: 'ASSIGNEE_CANNOT_OPEN', detail: sentence }, sentence));
    render(<TaskForm onCreate={onCreate} parent={{ kind: 'customer', id: 7 }} />);
    await userEvent.type(screen.getByLabelText('Task title'), 'Prep the QBR');
    await userEvent.type(screen.getByLabelText('Due date'), '2026-10-14');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(sentence);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/work/assignees.test.ts src/components/work/AssigneeSelect.test.tsx src/components/organizations/activity/TasksTab.test.tsx --maxWorkers=2`
Expected: FAIL: the two new modules do not resolve, and `TaskForm` has no `parent` (no option named "Dana CSM · Can't open this organization").

- [ ] **Step 3: Write `src/features/work/assignees.ts`**

```ts
import { cantOpenText } from './workText';
import type { AssigneeOption, ParentKind, TaskPerson } from './workTypes';

export interface PickerOption {
  id: number;
  label: string;
  disabled: boolean;
}

/** The picker's options for a record of `kind` (spec §1.5): everyone, those
 *  who can't open it disabled and saying so. A `current` assignee the list
 *  does not hold (deactivated, or still loading) leads, disabled. */
export function assigneeOptions(people: AssigneeOption[], kind: ParentKind, current: TaskPerson | null = null): PickerOption[] {
  const options = people.map((person) => ({
    id: person.id,
    label: person.can_open ? person.name : `${person.name} · ${cantOpenText(kind)}`,
    disabled: !person.can_open,
  }));
  if (current && !people.some((person) => person.id === current.id)) {
    options.unshift({ id: current.id, label: current.active ? current.name : `${current.name} (no longer active)`, disabled: true });
  }
  return options;
}
```

- [ ] **Step 4: Write `src/components/work/useAssignees.ts` and `src/components/work/AssigneeSelect.tsx`**

`src/components/work/useAssignees.ts`:

```ts
import { useEffect, useState } from 'react';
import { fetchAssignees } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { AssigneeOption, ParentKind } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type Answer = { key: string; people: AssigneeOption[] | null; error: string | null };

/** GET /work/assignees/ for one record; nothing without one. An answer is
 *  kept for the record it was read for, so another record starts empty. */
export function useAssignees(parent: { kind: ParentKind; id: number } | null): { people: AssigneeOption[] | null; error: string | null } {
  const kind = parent?.kind ?? null;
  const id = parent?.id ?? null;
  const key = kind && id !== null ? `${kind}:${id}` : '';
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!kind || id === null) return;
    let alive = true;
    const asked = `${kind}:${id}`;
    fetchAssignees({ kind, id }).then(
      (data) => {
        if (alive) setAnswer({ key: asked, people: Array.isArray(data?.people) ? data.people : [], error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: asked, people: null, error: errorMessage(err, WORK.LOAD_PEOPLE) });
      },
    );
    return () => {
      alive = false;
    };
  }, [kind, id]);
  return answer && answer.key === key ? { people: answer.people, error: answer.error } : { people: null, error: null };
}
```

`src/components/work/AssigneeSelect.tsx`:

```tsx
import type { PickerOption } from '../../features/work/assignees';
import { CONTROL } from '../organizations/activity/formStyles';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';

const PANEL_SELECT = `${FILTER_SELECT} w-full`;

/** Who does it (spec §1.5). `size="form"` matches the create forms' controls
 *  (15px on phones); the panel uses the 13px select. `meOption` leads with
 *  "Assign to me", which answers null (the server's default: the caller). */
export function AssigneeSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  meOption = false,
  size = 'panel',
  aria,
}: {
  id: string;
  value: number | null;
  options: PickerOption[];
  onChange: (id: number | null) => void;
  disabled?: boolean;
  meOption?: boolean;
  size?: 'form' | 'panel';
  aria?: { 'aria-describedby'?: string; 'aria-invalid': boolean };
}) {
  const invalid = aria?.['aria-invalid'] ?? false;
  return (
    <select
      id={id}
      {...aria}
      value={value === null ? '' : String(value)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      className={`${size === 'form' ? CONTROL : PANEL_SELECT} ${invalid ? 'border-danger' : ''}`}
    >
      {meOption ? <option value="">Assign to me</option> : null}
      {!meOption && value === null ? (
        <option value="" disabled>
          Nobody yet
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option.id} value={option.id} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 5: Give `TaskForm` the record and the picker**

In `src/components/organizations/activity/TasksTab.tsx`, add these imports below the existing ones:

```ts
import { assigneeOptions, type PickerOption } from '../../../features/work/assignees';
import type { TaskParentRef } from '../../../features/work/workTypes';
import { AssigneeSelect } from '../../work/AssigneeSelect';
import { useAssignees } from '../../work/useAssignees';
```

Replace the `TaskForm` signature and its first line:

```tsx
export function TaskForm({ onCreate, onDone }: { onCreate: (task: NewTask) => Promise<boolean>; onDone?: () => void }) {
  const members = useMembers();
```

with:

```tsx
/** The new-task form on its own, so the organization page's "+ Add" and
 *  Work's New task can show it in a sheet. With `parent`, the Assignee list
 *  is GET /work/assignees/ for that record, and people who can't open it
 *  are disabled (Work spec §1.5); without one, or while it loads or fails,
 *  it is every member. It clears itself and calls `onDone` once saved. */
export function TaskForm({ onCreate, onDone, parent }: { onCreate: (task: NewTask) => Promise<boolean>; onDone?: () => void; parent?: TaskParentRef }) {
  const members = useMembers();
  const assignees = useAssignees(parent ?? null);
  const options: PickerOption[] =
    parent && assignees.people ? assigneeOptions(assignees.people, parent.kind) : members.map((member) => ({ id: member.id, label: member.name, disabled: false }));
```

and replace the Assignee field's `<select …>…</select>` with:

```tsx
          <AssigneeSelect
            id={`${ids}-assignee`}
            value={assignee ? Number(assignee) : null}
            options={options}
            onChange={(next) => setAssignee(next === null ? '' : String(next))}
            meOption
            size="form"
          />
```

Delete the doc comment above `TaskForm` that it replaces ("The new-task form on its own, so the organization page's "+ Add" can show it in a sheet. …").

In `src/components/organizations/detail/AddFlow.tsx`, pass the record to the task form:

```tsx
        <TaskForm
          parent={accountId != null ? { kind: 'account', id: accountId } : customerId != null ? { kind: 'customer', id: customerId } : undefined}
          onCreate={async (task) => createTask.fulfilled.match(await dispatch(createTask({ ...taskNoteParent(), ...task })))}
          onDone={onAdded}
        />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/features/work/assignees.test.ts src/components/work/AssigneeSelect.test.tsx src/components/organizations/activity src/components/organizations/detail/AddFlow.test.tsx --maxWorkers=2`
Expected: PASS (AddFlow's own stub does not answer `/work/assignees/`, so its form falls back to the members list, as before).

- [ ] **Step 7: Commit**

```bash
git add src/features/work/assignees.ts src/features/work/assignees.test.ts src/components/work/useAssignees.ts src/components/work/AssigneeSelect.tsx \
  src/components/work/AssigneeSelect.test.tsx src/components/organizations/activity/TasksTab.tsx src/components/organizations/activity/TasksTab.test.tsx \
  src/components/organizations/detail/AddFlow.tsx
git commit -m "$(cat <<'EOF'
feat(work): an assignee picker that knows who can open the record

GET /work/assignees/ feeds a select that disables people who can't open
the record; the organisation page's New task form uses it too.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The task panel opens at `?task=` on any route, and reads

**Files:**
- Create: `src/components/work/useTask.ts`, `src/components/work/TaskPanelHost.tsx`, `src/components/work/TaskSheet.tsx`, `src/components/work/TaskPanel.tsx`, `src/components/work/TaskValue.tsx`, `src/components/work/TaskFields.tsx`, `src/components/work/TaskFacts.tsx`, `src/components/work/ActivityTrail.tsx`, `src/components/work/TaskPanelSkeleton.tsx`, `src/pages/work/testPages.tsx`
- Modify: `src/layouts/DashboardLayout.tsx` (mount the host)
- Test: `src/components/work/TaskSheet.test.tsx`, `src/components/work/ActivityTrail.test.tsx`

**Interfaces:**
- Consumes: `fetchTask`, `isMissing`, `taskParam`, `withoutTask`, `WORK`, `STATUS_LABEL`, `PRIORITY_LABEL`, `personName`, `parentPath`, `sourceText`, `eventSentence` (Task 1); `stubWork`, fixtures (Task 2); `Sheet` (`components/organizations/detail/Sheet.tsx`); `ErrorBlock` (`components/organizations/portfolio/PortfolioSections.tsx`); `SECTION_TITLE`, `LINK` (`components/brain/styles.ts`); `MONO` (`components/organizations/portfolio/styles.ts`); `SM`, `useMediaQuery`; `formatDate`, `formatRelativeTime` (`features/customers/formatters.ts`); `makeRulesStore`, `Role` (`pages/rules/testPages.tsx`); `SlotHost`; `Where` (`pages/organizations/testList.tsx`); `setViewport`.
- Produces:
  - `useTask(id: number): { task: TaskDetail | null; error: string | null; missing: boolean; retry: () => void; replace: (task: TaskDetail) => void; append: (event: TaskEvent) => void }`.
  - `<TaskPanelHost />` (no props), `<TaskSheet id isSm onClose />`, `<TaskPanel task />` (Task 5 adds `onReplace`, Task 6 `onAppend`), `<TaskValue label value mono? wide? />`, `<TaskFields task />` (rewritten in Task 5), `<TaskFacts task />`, `<ActivityTrail events />`, `<TaskPanelSkeleton />`.
  - test-only `renderPage(ui: ReactNode, url: string, opts?: { width?: number; role?: Role; user?: { id: number; name: string } }): { store }` and `where(): string | null`.

- [ ] **Step 1: Write the failing tests**

`src/pages/work/testPages.tsx` (test-only helper, written first so the tests can use it):

```tsx
// Test-only helpers, never hot-reloaded.
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TaskPanelHost } from '../../components/work/TaskPanelHost';
import { SlotHost } from '../../test/SlotHost';
import { setViewport } from '../../test/viewport';
import { Where } from '../organizations/testList';
import { makeRulesStore, type Role } from '../rules/testPages';

/** `ui` on any route, with the task panel host as DashboardLayout mounts it.
 *  The signed-in user is Alice (id 1) unless `user` names another. Only
 *  fetch is stubbed (stubWork). */
export function renderPage(
  ui: ReactNode,
  url: string,
  { width = 1440, role = 'admin', user }: { width?: number; role?: Role; user?: { id: number; name: string } } = {},
) {
  setViewport(width);
  const store = makeRulesStore(role, user);
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  {ui}
                  <Where />
                </>
              }
            />
          </Routes>
          <TaskPanelHost />
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

export const where = () => screen.getByTestId('where').textContent;
```

`src/components/work/TaskSheet.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls, stubWork } from '../../features/work/testWork';
import { renderPage, where } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';

describe('the task panel (spec §1.5: a side sheet at ?task=<id> on any route)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('opens over any page, reads the task, and closes back to the same URL', async () => {
    const { spy } = stubWork();
    renderPage(<p>Waiting on you</p>, '/brain/waiting?scope=me&task=41');
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    expect(panel.closest('[data-shape]')).toHaveAttribute('data-shape', 'panel');
    expect(within(panel).getByText('High')).toBeInTheDocument();
    expect(within(panel).getByText('5 Oct 2026')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(within(panel).getByText(/by Mona Manager/)).toBeInTheDocument();
    expect(within(within(panel).getByRole('list', { name: 'Activity' })).getByText('Mona Manager created this task for you.')).toBeInTheDocument();
    expect(calls(spy, 'GET', '/tasks/')).toEqual(['/tasks/41/']);

    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(where()).toBe('/brain/waiting?scope=me');
  });

  it('is a bottom sheet on a phone', async () => {
    stubWork();
    renderPage(<p>Today</p>, '/work/today?task=41', { width: 375 });
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    expect(panel.closest('[data-shape]')).toHaveAttribute('data-shape', 'sheet');
  });

  it('shows a plan task’s plan, and a skeleton until the task lands', async () => {
    stubWork();
    renderPage(<p>Today</p>, '/work/today?task=47');
    expect(await screen.findByLabelText('Loading the task')).toBeInTheDocument();
    const panel = await screen.findByRole('dialog', { name: 'Kick-off call' });
    expect(within(panel).getByRole('link', { name: 'Onboarding · Pizza Hut · Start' })).toHaveAttribute('href', '/projects/12');
    expect(within(panel).getByText('No activity recorded yet.')).toBeInTheDocument();
  });

  it('says so for a task that is gone or not the reader’s to open', async () => {
    stubWork();
    renderPage(<p>Today</p>, '/work/today?task=999');
    const panel = await screen.findByRole('dialog', { name: 'Task not found' });
    expect(within(panel).getByText("This task isn't there, or you can't open it.")).toBeInTheDocument();
  });

  it('offers Try again when the read fails', async () => {
    const { spy } = stubWork({ failTask: 1 });
    renderPage(<p>Today</p>, '/work/today?task=41');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('dialog', { name: 'Call Pizza Hut' })).toBeInTheDocument();
    expect(calls(spy, 'GET', '/tasks/')).toHaveLength(2);
  });

  it('opens nothing without a task id, or with one that is not a number', () => {
    const { spy } = stubWork();
    renderPage(<p>Today</p>, '/work/today?task=abc');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls(spy, 'GET', '/tasks/')).toEqual([]);
  });
});
```

`src/components/work/ActivityTrail.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { taskEvent } from '../../features/work/testWorkFixtures';
import { makeRulesStore } from '../../pages/rules/testPages';
import { ActivityTrail } from './ActivityTrail';

const renderTrail = (events: Parameters<typeof ActivityTrail>[0]['events']) =>
  render(
    <Provider store={makeRulesStore('csm')}>
      <ActivityTrail events={events} />
    </Provider>,
  );

describe('ActivityTrail (spec §1.5: written in plain sentences)', () => {
  it('writes each event for the reader, oldest first, with a comment’s words under it', () => {
    renderTrail([
      taskEvent(1, 'created', { id: 2, name: 'Mona Manager' }, { source: 'manual', assignee: { id: 1, name: 'Alice' } }),
      taskEvent(2, 'status', { id: 1, name: 'Alice' }, { from: 'pending', to: 'blocked', reason: 'Waiting on legal' }),
      taskEvent(3, 'comment', { id: 1, name: 'Alice' }, {}, 'Chased legal again.'),
    ]);
    const items = within(screen.getByRole('list', { name: 'Activity' })).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Mona Manager created this task for you.',
      'You marked it blocked: Waiting on legal',
      'You commented',
    ]);
    expect(items[2]).toHaveTextContent('Chased legal again.');
    expect(items[0].querySelector('time')).toHaveAttribute('dateTime', '2026-10-07T10:00:00.000000Z');
  });

  it('says when nothing is recorded (tasks from before the trail existed)', () => {
    renderTrail([]);
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/work/TaskSheet.test.tsx src/components/work/ActivityTrail.test.tsx --maxWorkers=2`
Expected: FAIL with "Failed to resolve import" for `TaskPanelHost` and `ActivityTrail`.

- [ ] **Step 3: Write `src/components/work/useTask.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import { fetchTask, isMissing } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { TaskDetail, TaskEvent } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

type State = { id: number; task: TaskDetail | null; error: string | null; missing: boolean };

/** GET /tasks/<id>/ for the panel. A retry keeps what is on screen until the
 *  answer lands; `replace` takes a PATCH's answer, `append` a new comment. */
export function useTask(id: number) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTask(id).then(
      (task) => {
        if (alive) setState({ id, task, error: null, missing: false });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = isMissing(err);
        setState((prev) => ({ id, task: prev?.id === id ? prev.task : null, error: missing ? null : errorMessage(err, WORK.LOAD_TASK), missing }));
      },
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);
  const current = state?.id === id ? state : null;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const replace = useCallback((task: TaskDetail) => setState((prev) => (prev ? { ...prev, task, error: null, missing: false } : prev)), []);
  const append = useCallback(
    (event: TaskEvent) => setState((prev) => (prev?.task ? { ...prev, task: { ...prev.task, events: [...prev.task.events, event] } } : prev)),
    [],
  );
  return { task: current?.task ?? null, error: current?.error ?? null, missing: current?.missing ?? false, retry, replace, append };
}
```

- [ ] **Step 4: Write the read-only panel parts**

`src/components/work/TaskValue.tsx`:

```tsx
import { MONO } from '../organizations/portfolio/styles';

/** A field the reader may not change: its label above, its value as text. */
export function TaskValue({ label, value, mono = false, wide = false }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`max-w-[70ch] whitespace-pre-line break-words text-[13px] text-ink ${mono ? MONO : ''}`}>{value}</p>
    </div>
  );
}
```

`src/components/work/TaskFields.tsx` (read-only for now; Task 5 replaces this file with the editors):

```tsx
import { formatDate } from '../../features/customers/formatters';
import { PRIORITY_LABEL, STATUS_LABEL, WORK, personName } from '../../features/work/workText';
import type { TaskDetail } from '../../features/work/workTypes';
import { TaskValue } from './TaskValue';

/** The task's fields, as text. */
export function TaskFields({ task }: { task: TaskDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TaskValue label="Status" value={STATUS_LABEL[task.status]} />
        <TaskValue label="Assignee" value={personName(task.assignee)} />
        <TaskValue label="Due" value={formatDate(task.due_date)} mono />
        <TaskValue label="Priority" value={PRIORITY_LABEL[task.priority]} />
        {task.status === 'blocked' ? <TaskValue label={WORK.BLOCKED_ON} value={task.blocked_reason} wide /> : null}
      </div>
      <TaskValue label="Description" value={task.description || WORK.NO_DESCRIPTION} />
    </div>
  );
}
```

`src/components/work/TaskFacts.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { formatDate } from '../../features/customers/formatters';
import { parentPath, sourceText } from '../../features/work/workText';
import type { TaskDetail } from '../../features/work/workTypes';
import { LINK } from '../brain/styles';
import { MONO } from '../organizations/portfolio/styles';

const TERM = 'text-[13px] text-ink-muted';

/** Where the task lives and where it came from: the record, the plan (or the
 *  source), and who made it when. */
export function TaskFacts({ task }: { task: TaskDetail }) {
  const source = task.plan ? null : sourceText(task);
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-[13px] text-ink">
      <dt className={TERM}>On</dt>
      <dd className="min-w-0">
        <Link to={parentPath(task.parent)} className={LINK}>
          {task.parent.name}
        </Link>
      </dd>
      {task.plan ? (
        <>
          <dt className={TERM}>Plan</dt>
          <dd className="min-w-0">
            <Link to={`/projects/${task.plan.id}`} className={LINK}>
              {task.milestone ? `${task.plan.name} · ${task.milestone.name}` : task.plan.name}
            </Link>
          </dd>
        </>
      ) : null}
      {source ? (
        <>
          <dt className={TERM}>Source</dt>
          <dd>{source}</dd>
        </>
      ) : null}
      <dt className={TERM}>Created</dt>
      <dd>
        <span className={MONO}>{formatDate(task.created_at.slice(0, 10))}</span>
        {task.created_by ? ` by ${task.created_by.name}` : ''}
      </dd>
    </dl>
  );
}
```

`src/components/work/ActivityTrail.tsx`:

```tsx
import { formatRelativeTime } from '../../features/customers/formatters';
import { eventSentence, WORK } from '../../features/work/workText';
import type { TaskEvent } from '../../features/work/workTypes';
import { useAppSelector } from '../../hooks';
import { MONO } from '../organizations/portfolio/styles';

/** The task's history in plain sentences (spec §1.5), oldest first; a
 *  comment's words sit under its line. */
export function ActivityTrail({ events }: { events: TaskEvent[] }) {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  if (events.length === 0) return <p className="text-[13px] text-ink-muted">{WORK.NO_ACTIVITY}</p>;
  return (
    <ol aria-label={WORK.ACTIVITY} className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} data-event={event.kind} className="flex flex-col gap-1">
          <p className="text-[13px] text-ink">{eventSentence(event, me)}</p>
          {event.kind === 'comment' && event.body ? (
            <p className="max-w-[70ch] whitespace-pre-line break-words border-l-2 border-line pl-3 text-[13px] text-ink">{event.body}</p>
          ) : null}
          <time dateTime={event.created_at} className={`text-[11px] text-ink-muted ${MONO}`}>
            {formatRelativeTime(event.created_at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
```

`src/components/work/TaskPanelSkeleton.tsx`:

```tsx
/** The panel while the task loads: its fields and two lines of activity. */
export function TaskPanelSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the task" className="flex flex-col gap-4">
      <div className="h-9 w-full animate-pulse rounded-lg bg-subtle" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((n) => (
          <div key={n} className="h-12 animate-pulse rounded-lg bg-subtle" />
        ))}
      </div>
      <div className="h-3 w-2/3 animate-pulse rounded-md bg-subtle" />
      <div className="h-3 w-1/2 animate-pulse rounded-md bg-subtle" />
    </div>
  );
}
```

`src/components/work/TaskPanel.tsx`:

```tsx
import { useId } from 'react';
import { WORK } from '../../features/work/workText';
import type { TaskDetail } from '../../features/work/workTypes';
import { SECTION_TITLE } from '../brain/styles';
import { ActivityTrail } from './ActivityTrail';
import { TaskFacts } from './TaskFacts';
import { TaskFields } from './TaskFields';

/** The panel's body (spec §1.5): the fields, the facts, then the activity. */
export function TaskPanel({ task }: { task: TaskDetail }) {
  const activityId = useId();
  return (
    <div className="flex flex-col gap-5">
      <TaskFields task={task} />
      <TaskFacts task={task} />
      <section aria-labelledby={activityId} className="flex flex-col gap-3 border-t border-line-subtle pt-4">
        <h3 id={activityId} className={SECTION_TITLE}>
          {WORK.ACTIVITY}
        </h3>
        <ActivityTrail events={task.events} />
      </section>
    </div>
  );
}
```

`src/components/work/TaskSheet.tsx`:

```tsx
import type { ReactNode } from 'react';
import { WORK } from '../../features/work/workText';
import { Sheet } from '../organizations/detail/Sheet';
import { ErrorBlock } from '../organizations/portfolio/PortfolioSections';
import { TaskPanel } from './TaskPanel';
import { TaskPanelSkeleton } from './TaskPanelSkeleton';
import { useTask } from './useTask';

/** One task in the organisation page's Sheet: a panel from sm, a bottom
 *  sheet below it. Titled by the task once it lands. */
export function TaskSheet({ id, isSm, onClose }: { id: number; isSm: boolean; onClose: () => void }) {
  const load = useTask(id);
  const task = load.task;
  const title = task ? task.title : load.missing ? WORK.TASK_NOT_FOUND : WORK.TASK;
  let body: ReactNode;
  if (load.missing) body = <p className="text-[13px] text-ink-muted">{WORK.NO_TASK}</p>;
  else if (!task && load.error) body = <ErrorBlock message={load.error} onRetry={load.retry} />;
  else if (!task) body = <TaskPanelSkeleton />;
  else body = <TaskPanel task={task} />;
  return (
    <Sheet title={title} description={task?.parent.name} isSm={isSm} onClose={onClose}>
      {body}
    </Sheet>
  );
}
```

`src/components/work/TaskPanelHost.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom';
import { taskParam, withoutTask } from '../../features/work/taskParam';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
import { TaskSheet } from './TaskSheet';

/** The one task panel (spec §1.5), mounted once by DashboardLayout: whatever
 *  route the reader is on, ?task=<id> opens it, and closing it drops only
 *  that parameter. Keyed by id, so another task starts fresh. */
export function TaskPanelHost() {
  const [params, setParams] = useSearchParams();
  const isSm = useMediaQuery(SM);
  const id = taskParam(params);
  if (id === null) return null;
  return <TaskSheet key={id} id={id} isSm={isSm} onClose={() => setParams((prev) => withoutTask(prev), { replace: true })} />;
}
```

- [ ] **Step 5: Mount the host in `src/layouts/DashboardLayout.tsx`**

Add the import beside the other component imports:

```ts
import { TaskPanelHost } from '../components/work/TaskPanelHost';
```

and render it right after the `<Outlet />` inside `<main>`:

```tsx
            <Outlet />
            {/* The task panel (Work spec §1.5): ?task=<id> opens it on any route. */}
            <TaskPanelHost />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/work src/layouts --maxWorkers=2`
Expected: PASS (the DashboardLayout tests still pass: without `?task=` the host renders nothing and reads nothing).

- [ ] **Step 7: Commit**

```bash
git add src/components/work/useTask.ts src/components/work/TaskPanelHost.tsx src/components/work/TaskSheet.tsx src/components/work/TaskPanel.tsx \
  src/components/work/TaskValue.tsx src/components/work/TaskFields.tsx src/components/work/TaskFacts.tsx src/components/work/ActivityTrail.tsx \
  src/components/work/TaskPanelSkeleton.tsx src/components/work/TaskSheet.test.tsx src/components/work/ActivityTrail.test.tsx \
  src/pages/work/testPages.tsx src/layouts/DashboardLayout.tsx
git commit -m "$(cat <<'EOF'
feat(work): the task panel opens at ?task= on any route

One host in DashboardLayout reads ?task=, and the organisation page's
Sheet shows the task's fields, its record and source, and the activity
trail in sentences, with loading, missing and error states.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 5: Editing in the panel: title, description, status with Blocked, assignee, due date, priority

**Files:**
- Modify (rewrite): `src/components/work/TaskFields.tsx`
- Modify: `src/components/work/TaskPanel.tsx`, `src/components/work/TaskSheet.tsx`
- Test: `src/components/work/TaskFields.test.tsx`

**Interfaces:**
- Consumes: `patchTask`, `readRefusal`, `NO_REFUSAL`, `Refusal`, `WORK`, `STATUS_LABEL`, `PRIORITY_LABEL`, `personName`, `STATUSES`, `PRIORITIES`, `TaskDetail`, `TaskPatch`, `EditableField`, `TaskStatus`, `TaskPriority` (Task 1); `taskChanged`, `useTaskChanges` (Task 1); `assigneeOptions` (Task 3); `useAssignees`, `AssigneeSelect` (Task 3); `TaskValue`, `useTask().replace` (Task 4); `useSubmitOnce` (`components/plans/useSubmitOnce.ts`); `Field` (`components/rules/Field.tsx`); `INPUT` (`components/plans/styles.ts`); `FILTER_SELECT`; `BUTTON`, `QUIET`, `MONO`.
- Produces: `<TaskFields task onReplace />` where `onReplace: (task: TaskDetail) => void`; `<TaskPanel task onReplace />`. Every successful save calls `onReplace(answer)` and then `taskChanged()`.

- [ ] **Step 1: Write the failing test** `src/components/work/TaskFields.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls, sent, stubWork } from '../../features/work/testWork';
import { renderPage } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';
import { useTaskChanges } from './taskChanges';

function Probe({ onChange }: { onChange: () => void }) {
  useTaskChanges(onChange);
  return null;
}

async function openTask(id: number, stub: Parameters<typeof stubWork>[0] = {}) {
  const fetch = stubWork(stub);
  const changed = vi.fn();
  renderPage(<Probe onChange={changed} />, `/work/today?task=${id}`);
  const panel = await screen.findByRole('dialog');
  // Every loaded panel has the Activity heading, with or without events.
  await within(panel).findByRole('heading', { name: 'Activity' });
  return { ...fetch, changed };
}

const trail = () => within(screen.getByRole('list', { name: 'Activity' }));

describe('editing a task in the panel (spec §1.5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('renames on Enter, writes the event, retitles the panel and tells the lists', async () => {
    const { spy, changed } = await openTask(41);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Call Pizza Hut again{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Call Pizza Hut again' })).toBeInTheDocument();
    expect(trail().getByText('You renamed it from “Call Pizza Hut” to “Call Pizza Hut again”.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ title: 'Call Pizza Hut again' }]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('refuses a blank title in place, sending nothing', async () => {
    const { spy } = await openTask(41);
    const title = await screen.findByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.tab();
    expect(await screen.findByText('Give the task a title.')).toBeInTheDocument();
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual([]);
  });

  it('moves the status, and Blocked asks for its reason before it sends', async () => {
    const { spy } = await openTask(41);
    await userEvent.selectOptions(await screen.findByLabelText('Status'), 'in-progress');
    expect(await trail().findByText('You moved it from pending to in progress.')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'blocked');
    expect(sent(spy, 'PATCH', '/tasks/41/')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Mark blocked' }));
    expect(await screen.findByText("Say what it's blocked on.")).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toHaveLength(1);

    await userEvent.type(screen.getByLabelText('Blocked on'), 'Waiting on legal');
    await userEvent.click(screen.getByRole('button', { name: 'Mark blocked' }));
    expect(await trail().findByText('You marked it blocked: Waiting on legal')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')[1]).toEqual({ status: 'blocked', blocked_reason: 'Waiting on legal' });
    expect(screen.getByLabelText('Status')).toHaveValue('blocked');
    expect(screen.queryByRole('button', { name: 'Mark blocked' })).toBeNull();
  });

  it('Cancel on Blocked goes back without sending', async () => {
    const { spy } = await openTask(41);
    await userEvent.selectOptions(await screen.findByLabelText('Status'), 'blocked');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Status')).toHaveValue('pending');
    expect(screen.queryByLabelText('Blocked on')).toBeNull();
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual([]);
  });

  it('changes a Blocked task’s reason on its own', async () => {
    const { spy } = await openTask(45);
    const reason = await screen.findByLabelText('Blocked on');
    expect(reason).toHaveValue('Waiting on legal');
    await userEvent.clear(reason);
    await userEvent.type(reason, 'Legal signs Friday');
    await userEvent.click(screen.getByRole('button', { name: 'Save reason' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/tasks/45/')).toEqual([{ blocked_reason: 'Legal signs Friday' }]));
  });

  it('reassigns among people who can open the record; the others are disabled', async () => {
    const { spy } = await openTask(41);
    expect(await screen.findByRole('option', { name: "Dana CSM · Can't open this organization" })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '3');
    expect(await trail().findByText('You assigned it to Carl CSM (was Alice).')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ assignee_id: 3 }]);
  });

  it('shows ASSIGNEE_CANNOT_OPEN under the Assignee field', async () => {
    const sentence = "That person can't open this organisation.";
    await openTask(41, { refuseNextPatch: { status: 400, body: { code: 'ASSIGNEE_CANNOT_OPEN', detail: sentence } } });
    await screen.findByRole('option', { name: 'Carl CSM' });
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '3');
    expect(await screen.findByText(sentence)).toHaveAttribute('id', expect.stringContaining('-error'));
  });

  it('moves the due date and the priority, and saves the description', async () => {
    const { spy } = await openTask(41);
    fireEvent.change(await screen.findByLabelText('Due'), { target: { value: '2026-10-10' } });
    expect(await trail().findByText('You moved the due date from 5 Oct 2026 to 10 Oct 2026.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'low');
    expect(await trail().findByText('You changed the priority from high to low.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Description'), 'Ask about the renewal.');
    await userEvent.click(screen.getByRole('button', { name: 'Save description' }));
    expect(await trail().findByText('You edited the description.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ due_date: '2026-10-10' }, { priority: 'low' }, { description: 'Ask about the renewal.' }]);
  });

  it('refuses a cleared due date in place', async () => {
    const { spy } = await openTask(41);
    fireEvent.change(await screen.findByLabelText('Due'), { target: { value: '' } });
    expect(await screen.findByText('Choose a date.')).toBeInTheDocument();
    expect(calls(spy, 'PATCH', '/tasks/')).toEqual([]);
  });

  it('shows only Status as a control on a plan task the reader does not edit', async () => {
    await openTask(47);
    expect(await screen.findByLabelText('Status')).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.queryByLabelText('Assignee')).toBeNull();
    expect(screen.queryByLabelText('Priority')).toBeNull();
    expect(within(screen.getByRole('dialog')).getByText('Alice')).toBeInTheDocument();
  });

  it('puts a refusal with no field on the form', async () => {
    const detail = "Only the plan's owner or their managers can change it.";
    await openTask(41, { refuseNextPatch: { status: 403, body: { detail } } });
    await userEvent.selectOptions(await screen.findByLabelText('Priority'), 'low');
    expect(await screen.findByRole('alert')).toHaveTextContent(detail);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/work/TaskFields.test.tsx --maxWorkers=2`
Expected: FAIL: "Unable to find a label with the text of: Title" (the fields are still text).

- [ ] **Step 3: Rewrite `src/components/work/TaskFields.tsx` with the editors**

```tsx
import { useId, useState } from 'react';
import { formatDate } from '../../features/customers/formatters';
import { assigneeOptions } from '../../features/work/assignees';
import { NO_REFUSAL, patchTask, readRefusal, type Refusal } from '../../features/work/workApi';
import { PRIORITY_LABEL, STATUS_LABEL, WORK, personName } from '../../features/work/workText';
import {
  PRIORITIES,
  STATUSES,
  type EditableField,
  type TaskDetail,
  type TaskPatch,
  type TaskPriority,
  type TaskStatus,
} from '../../features/work/workTypes';
import { FILTER_SELECT } from '../organizations/portfolio/filterParts';
import { BUTTON, MONO, QUIET } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Field } from '../rules/Field';
import { AssigneeSelect } from './AssigneeSelect';
import { taskChanged } from './taskChanges';
import { TaskValue } from './TaskValue';
import { useAssignees } from './useAssignees';

type Save = (patch: TaskPatch) => Promise<boolean>;
type EditorProps = { task: TaskDetail; busy: boolean; refusal: Refusal; save: Save };

const SELECT = `${FILTER_SELECT} w-full`;
const edge = (error?: string | null) => (error ? 'border-danger' : 'border-line');

/** The task's fields (spec §1.5). Each saves on its own, one write at a
 *  time; the answer replaces the task, so the trail updates from the
 *  server. A field the reader may not change is text, not a control. */
export function TaskFields({ task, onReplace }: { task: TaskDetail; onReplace: (task: TaskDetail) => void }) {
  const { busy, run } = useSubmitOnce();
  const [refusal, setRefusal] = useState<Refusal>(NO_REFUSAL);
  const can = (field: EditableField) => task.editable.includes(field);
  const save: Save = async (patch) => {
    setRefusal(NO_REFUSAL);
    const outcome = await run(() => patchTask(task.id, patch));
    if (!outcome) return false;
    if (outcome.ok) {
      onReplace(outcome.value);
      taskChanged();
      return true;
    }
    setRefusal(readRefusal(outcome.error, WORK.SAVE_FAILED));
    return false;
  };
  const props: EditorProps = { task, busy, refusal, save };
  return (
    <div className="flex flex-col gap-4">
      {refusal.form ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {refusal.form}
        </p>
      ) : null}
      {can('title') ? <TitleEditor {...props} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {can('status') ? <StatusEditor {...props} /> : <TaskValue label="Status" value={STATUS_LABEL[task.status]} />}
        {can('assignee') ? <AssigneeEditor {...props} /> : <TaskValue label="Assignee" value={personName(task.assignee)} />}
        {can('due_date') ? <DueEditor {...props} /> : <TaskValue label="Due" value={formatDate(task.due_date)} mono />}
        {can('priority') ? <PriorityEditor {...props} /> : <TaskValue label="Priority" value={PRIORITY_LABEL[task.priority]} />}
        {!can('status') && task.status === 'blocked' ? <TaskValue label={WORK.BLOCKED_ON} value={task.blocked_reason} wide /> : null}
      </div>
      {can('description') ? <DescriptionEditor {...props} /> : <TaskValue label="Description" value={task.description || WORK.NO_DESCRIPTION} />}
    </div>
  );
}

/** Saved on Enter or when the field loses focus; a blank title is refused here. */
function TitleEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(task.title);
  const [seen, setSeen] = useState(task.title);
  const [local, setLocal] = useState<string | null>(null);
  if (seen !== task.title) {
    setSeen(task.title);
    setDraft(task.title);
  }
  async function commit() {
    const next = draft.trim();
    if (next === task.title) return;
    if (!next) {
      setLocal(WORK.TITLE_REQUIRED);
      return;
    }
    setLocal(null);
    await save({ title: next });
  }
  const error = local ?? refusal.field.title;
  return (
    <Field id={id} label="Title" error={error}>
      {(aria) => (
        <input
          id={id}
          {...aria}
          value={draft}
          maxLength={255}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void commit();
            }
          }}
          className={`${INPUT} ${edge(error)}`}
        />
      )}
    </Field>
  );
}

/** Pending, In progress and Done save at once. Blocked first asks what it
 *  is blocked on (spec §1.5); a Blocked task's reason is edited in place. */
function StatusEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  const reasonId = useId();
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState(task.blocked_reason);
  const [local, setLocal] = useState<string | null>(null);
  const key = `${task.status}|${task.blocked_reason}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setReason(task.blocked_reason);
    setBlocking(false);
    setLocal(null);
  }
  const shown: TaskStatus = blocking ? 'blocked' : task.status;
  const changed = blocking || reason.trim() !== task.blocked_reason;

  async function choose(next: TaskStatus) {
    setLocal(null);
    if (next === 'blocked') {
      setBlocking(true);
      return;
    }
    setBlocking(false);
    setReason(task.blocked_reason);
    if (next !== task.status) await save({ status: next });
  }

  async function saveReason() {
    const text = reason.trim();
    if (!text) {
      setLocal(WORK.REASON_REQUIRED);
      return;
    }
    setLocal(null);
    await save(task.status === 'blocked' ? { blocked_reason: text } : { status: 'blocked', blocked_reason: text });
  }

  const reasonError = local ?? refusal.field.blocked_reason;
  return (
    <>
      <Field id={id} label="Status" error={refusal.field.status}>
        {(aria) => (
          <select id={id} {...aria} value={shown} disabled={busy} onChange={(event) => void choose(event.target.value as TaskStatus)} className={SELECT}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {shown === 'blocked' ? (
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Field id={reasonId} label={WORK.BLOCKED_ON} error={reasonError}>
            {(aria) => (
              <input
                id={reasonId}
                {...aria}
                value={reason}
                maxLength={255}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
                className={`${INPUT} ${edge(reasonError)}`}
              />
            )}
          </Field>
          {changed ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void saveReason()} disabled={busy} className={BUTTON}>
                {task.status === 'blocked' ? WORK.SAVE_REASON : WORK.MARK_BLOCKED}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBlocking(false);
                  setReason(task.blocked_reason);
                  setLocal(null);
                }}
                className={QUIET}
              >
                {WORK.CANCEL}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** Members who can open the record; the rest disabled, saying why. */
function AssigneeEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  const { people, error } = useAssignees(task.parent);
  const options = assigneeOptions(people ?? [], task.parent.kind, task.assignee);
  const hint = error ?? (people === null ? WORK.LOADING_PEOPLE : undefined);
  return (
    <Field id={id} label="Assignee" hint={hint} error={refusal.field.assignee_id}>
      {(aria) => (
        <AssigneeSelect
          id={id}
          aria={aria}
          value={task.assignee?.id ?? null}
          options={options}
          disabled={busy || people === null}
          onChange={(next) => {
            if (next !== null && next !== task.assignee?.id) void save({ assignee_id: next });
          }}
        />
      )}
    </Field>
  );
}

function DueEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(task.due_date);
  const [seen, setSeen] = useState(task.due_date);
  const [local, setLocal] = useState<string | null>(null);
  if (seen !== task.due_date) {
    setSeen(task.due_date);
    setDraft(task.due_date);
  }
  function change(next: string) {
    setDraft(next);
    if (!next) {
      setLocal(WORK.DATE_REQUIRED);
      return;
    }
    setLocal(null);
    if (next !== task.due_date) void save({ due_date: next });
  }
  const error = local ?? refusal.field.due_date;
  return (
    <Field id={id} label="Due" error={error}>
      {(aria) => (
        <input id={id} {...aria} type="date" value={draft} disabled={busy} onChange={(event) => change(event.target.value)} className={`${INPUT} ${MONO} ${edge(error)}`} />
      )}
    </Field>
  );
}

function PriorityEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  return (
    <Field id={id} label="Priority" error={refusal.field.priority}>
      {(aria) => (
        <select
          id={id}
          {...aria}
          value={task.priority}
          disabled={busy}
          onChange={(event) => {
            const next = event.target.value as TaskPriority;
            if (next !== task.priority) void save({ priority: next });
          }}
          className={SELECT}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABEL[priority]}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Saved from its own button, once it differs from what is kept. */
function DescriptionEditor({ task, busy, refusal, save }: EditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(task.description);
  const [seen, setSeen] = useState(task.description);
  if (seen !== task.description) {
    setSeen(task.description);
    setDraft(task.description);
  }
  const error = refusal.field.description;
  return (
    <div className="flex flex-col gap-2">
      <Field id={id} label="Description" error={error}>
        {(aria) => (
          <textarea
            id={id}
            {...aria}
            rows={4}
            maxLength={10000}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            className={`${INPUT} py-2 ${edge(error)}`}
          />
        )}
      </Field>
      {draft !== task.description ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void save({ description: draft })} disabled={busy} className={BUTTON}>
            {WORK.SAVE_DESCRIPTION}
          </button>
          <button type="button" onClick={() => setDraft(task.description)} className={QUIET}>
            {WORK.CANCEL}
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Pass the answer up from the panel**

In `src/components/work/TaskPanel.tsx`, change the signature and the fields line:

```tsx
export function TaskPanel({ task, onReplace }: { task: TaskDetail; onReplace: (task: TaskDetail) => void }) {
```

```tsx
      <TaskFields task={task} onReplace={onReplace} />
```

In `src/components/work/TaskSheet.tsx`, change the last branch to:

```tsx
  else body = <TaskPanel task={task} onReplace={load.replace} />;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/work --maxWorkers=2`
Expected: PASS (TaskSheet's earlier tests still pass: "High" and "5 Oct 2026" now sit in a select and a date input, so update those two lines in `TaskSheet.test.tsx` to `expect(within(panel).getByLabelText('Priority')).toHaveValue('high');` and `expect(within(panel).getByLabelText('Due')).toHaveValue('2026-10-05');`, then re-run).

- [ ] **Step 6: Commit**

```bash
git add src/components/work/TaskFields.tsx src/components/work/TaskPanel.tsx src/components/work/TaskSheet.tsx src/components/work/TaskFields.test.tsx src/components/work/TaskSheet.test.tsx
git commit -m "$(cat <<'EOF'
feat(work): edit a task in the panel

Title, description, status with Blocked and its reason, the assignee
among people who can open the record, due date and priority; each
saves on its own and the trail updates from the server's answer.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Comments in the panel

**Files:**
- Create: `src/components/work/CommentBox.tsx`
- Modify: `src/components/work/TaskPanel.tsx`, `src/components/work/TaskSheet.tsx`
- Test: `src/components/work/CommentBox.test.tsx`

**Interfaces:**
- Consumes: `postComment`, `readRefusal`, `WORK`, `TaskEvent` (Task 1); `useTask().append` (Task 4); `useSubmitOnce`, `Field`, `INPUT`, `BUTTON`.
- Produces: `<CommentBox taskId onAdded />` where `onAdded: (event: TaskEvent) => void`; `<TaskPanel task onReplace onAppend />`.

- [ ] **Step 1: Write the failing test** `src/components/work/CommentBox.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls, sent, stubWork } from '../../features/work/testWork';
import { renderPage } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';

describe('comments in the panel (spec §1.5; contract POST /tasks/<id>/comments/)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    document.body.style.overflow = '';
  });

  it('adds a comment once, however fast it is sent, and shows it in the trail', async () => {
    const { spy } = stubWork();
    renderPage(<p>Today</p>, '/work/today?task=41');
    const box = await screen.findByLabelText('Add a comment');
    await userEvent.type(box, 'Called, left a voicemail.');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Comment' }));
    const trail = within(screen.getByRole('list', { name: 'Activity' }));
    expect(await trail.findByText('Called, left a voicemail.')).toBeInTheDocument();
    expect(trail.getByText('You commented')).toBeInTheDocument();
    expect(sent(spy, 'POST', '/comments/')).toEqual([{ body: 'Called, left a voicemail.' }]);
    expect(box).toHaveValue('');
  });

  it('refuses an empty comment in place, and shows the server’s refusal', async () => {
    const { spy } = stubWork({ refuseNextComment: { status: 400, body: { body: ['Keep a comment under 5,000 characters.'] } } });
    renderPage(<p>Today</p>, '/work/today?task=41');
    await userEvent.click(await screen.findByRole('button', { name: 'Comment' }));
    expect(await screen.findByText('Write a comment.')).toBeInTheDocument();
    expect(calls(spy, 'POST', '/comments/')).toEqual([]);
    await userEvent.type(screen.getByLabelText('Add a comment'), 'Too long, says the server.');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(await screen.findByText('Keep a comment under 5,000 characters.')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a comment')).toHaveValue('Too long, says the server.');
  });

  it('lets a reader comment on a plan task they cannot otherwise change', async () => {
    const { spy } = stubWork();
    renderPage(<p>Today</p>, '/work/today?task=47');
    await userEvent.type(await screen.findByLabelText('Add a comment'), 'Booked for Thursday.');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    expect(await screen.findByText('Booked for Thursday.')).toBeInTheDocument();
    expect(calls(spy, 'POST', '/comments/')).toEqual(['/tasks/47/comments/']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/work/CommentBox.test.tsx --maxWorkers=2`
Expected: FAIL: "Unable to find a label with the text of: Add a comment".

- [ ] **Step 3: Write `src/components/work/CommentBox.tsx`**

```tsx
import { useId, useState, type FormEvent } from 'react';
import { postComment, readRefusal } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { TaskEvent } from '../../features/work/workTypes';
import { BUTTON } from '../organizations/portfolio/styles';
import { INPUT } from '../plans/styles';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { Field } from '../rules/Field';

/** Add a comment (spec §1.5): anyone who can see the task may. Sent once;
 *  the new event joins the trail and the box clears. */
export function CommentBox({ taskId, onAdded }: { taskId: number; onAdded: (event: TaskEvent) => void }) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { busy, run } = useSubmitOnce();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) {
      setError(WORK.COMMENT_REQUIRED);
      return;
    }
    setError(null);
    const outcome = await run(() => postComment(taskId, body));
    if (!outcome) return;
    if (outcome.ok) {
      onAdded(outcome.value);
      setText('');
      return;
    }
    const refusal = readRefusal(outcome.error, WORK.COMMENT_FAILED);
    setError(refusal.field.body ?? refusal.form ?? WORK.COMMENT_FAILED);
  }

  return (
    <form onSubmit={submit} aria-label={WORK.ADD_COMMENT} className="flex flex-col gap-2">
      <Field id={id} label={WORK.ADD_COMMENT} error={error ?? undefined}>
        {(aria) => (
          <textarea
            id={id}
            {...aria}
            rows={3}
            maxLength={5000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className={`${INPUT} py-2 ${error ? 'border-danger' : 'border-line'}`}
          />
        )}
      </Field>
      <div>
        <button type="submit" disabled={busy} className={BUTTON}>
          {busy ? WORK.SENDING : WORK.COMMENT}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Put it under the trail**

In `src/components/work/TaskPanel.tsx`, add `import { CommentBox } from './CommentBox';` and `import type { TaskEvent } from '../../features/work/workTypes';` (merge with the existing type import: `import type { TaskDetail, TaskEvent } from '../../features/work/workTypes';`), change the signature to:

```tsx
export function TaskPanel({ task, onReplace, onAppend }: { task: TaskDetail; onReplace: (task: TaskDetail) => void; onAppend: (event: TaskEvent) => void }) {
```

and add the box as the activity section's last child, after `<ActivityTrail events={task.events} />`:

```tsx
        <CommentBox taskId={task.id} onAdded={onAppend} />
```

In `src/components/work/TaskSheet.tsx`:

```tsx
  else body = <TaskPanel task={task} onReplace={load.replace} onAppend={load.append} />;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/work --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/CommentBox.tsx src/components/work/CommentBox.test.tsx src/components/work/TaskPanel.tsx src/components/work/TaskSheet.tsx
git commit -m "$(cat <<'EOF'
feat(work): comment on a task from its panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 7: Today: my tasks, grouped, with a quick Done

**Files:**
- Create: `src/components/work/WorkFrame.tsx`, `src/components/work/TaskRowItem.tsx`, `src/components/work/TodayGroups.tsx`, `src/components/work/TodaySkeleton.tsx`, `src/components/work/useToday.ts`, `src/pages/work/Today.tsx`
- Test: `src/pages/work/Today.test.tsx`, `src/components/work/TaskRowItem.test.tsx`

**Interfaces:**
- Consumes: `fetchToday`, `patchTask`, `WORK`, `GROUP_KEYS`, `GROUP_LABEL`, `PRIORITY_LABEL`, `doneLabel`, `doneStatus`, `hiddenTodayText`, `moreRowsText`, `parentPath`, `personName`, `sourceText`, `isOverdue`, `withoutRow`, `todayTotal`, `taskChanged`, `useTaskChanges`, `useTaskLink` (Task 1); `renderPage` (Task 4); `useSubmitOnce`; `ErrorBlock`, `EmptyState` (`PortfolioSections`); `LIST`, `SECTION_TITLE` (`components/brain/styles.ts`); `FOCUS`, `MONO`; `errorMessage`.
- Produces:
  - `<WorkFrame>{children}</WorkFrame>`: the full-width scroll column every Work page uses.
  - `<TaskRowItem row today onDone? busy? error? showAssignee? />`: one flat `<li data-task={id}>`; the title links to `?task=<id>` on the current page.
  - `<TodayGroups data onDone pending errors />` where `onDone: (row: TaskRow) => void`, `pending: number | null`, `errors: Record<number, string>`.
  - `<TodaySkeleton />` (`aria-label="Loading your tasks"`).
  - `useToday(): { data: TodayPayload | null; error: string | null; reload: () => void; setData: Dispatch<SetStateAction<TodayPayload | null>> }`.
  - `TodayPage` (`/work/today`), with a toolbar row `<div data-part="toolbar">` holding the status line (Task 8 adds New task to it).

- [ ] **Step 1: Write the failing tests**

`src/components/work/TaskRowItem.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CARL_CHASE, ERIN_OLD, KICKOFF, QBR_DECK, SECURITY, TODAY } from '../../features/work/testWorkFixtures';
import type { TaskRow } from '../../features/work/workTypes';
import { TaskRowItem } from './TaskRowItem';

function renderRow(row: TaskRow, props: Partial<Parameters<typeof TaskRowItem>[0]> = {}) {
  render(
    <MemoryRouter initialEntries={['/work/team?scope=team']}>
      <ul>
        <TaskRowItem row={row} today={TODAY} {...props} />
      </ul>
    </MemoryRouter>,
  );
  return screen.getByRole('listitem');
}

describe('TaskRowItem', () => {
  it('opens its task on the page it is on, and links its record', () => {
    const row = renderRow(CARL_CHASE, { showAssignee: true });
    expect(within(row).getByRole('link', { name: 'Chase the exec sponsor' })).toHaveAttribute('href', '/work/team?scope=team&task=46');
    expect(within(row).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(row.querySelector('[data-part="meta"]')).toHaveTextContent('Pizza Hut · Due 3 Oct 2026 · Overdue · High priority · Carl CSM');
    expect(within(row).getByText('3 Oct 2026')).toHaveClass('font-mono-brand', 'tabular-nums');
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('shows Blocked with its reason, never as Overdue', () => {
    const row = renderRow(SECURITY);
    expect(row.querySelector('[data-part="blocked"]')).toHaveTextContent('Blocked: Waiting on legal');
    expect(row.querySelector('[data-part="meta"]')).not.toHaveTextContent('Overdue');
  });

  it('says In progress', () => {
    expect(renderRow(QBR_DECK).querySelector('[data-part="meta"]')).toHaveTextContent('In progress');
  });

  it('names a plan task’s plan and a deactivated assignee', () => {
    render(
      <MemoryRouter>
        <ul>
          <TaskRowItem row={KICKOFF} today={TODAY} />
          <TaskRowItem row={ERIN_OLD} today={TODAY} showAssignee />
        </ul>
      </MemoryRouter>,
    );
    const [kickoff, erin] = screen.getAllByRole('listitem');
    expect(kickoff).toHaveTextContent('From Onboarding · Pizza Hut');
    expect(erin).toHaveTextContent('Unassigned (was Erin Former)');
  });

  it('offers a 44px quick Done, disabled while it saves, with its error under the row', async () => {
    const onDone = vi.fn();
    const row = renderRow(CARL_CHASE, { onDone, error: 'Could not mark that done. Try again.' });
    const done = within(row).getByRole('button', { name: 'Mark “Chase the exec sponsor” done' });
    expect(done).toHaveClass('h-11', 'w-11', 'sm:h-9', 'sm:w-9');
    await userEvent.click(done);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(within(row).getByRole('alert')).toHaveTextContent('Could not mark that done. Try again.');
  });
});
```

`src/pages/work/Today.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { calls, sent, stubWork } from '../../features/work/testWork';
import { resetViewport } from '../../test/viewport';
import { renderPage } from './testPages';
import { TodayPage } from './Today';

const row = (id: number) => document.querySelector(`[data-task="${id}"]`) as HTMLElement | null;

describe('Work › Today (spec §1.5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('groups my open tasks soonest first, Blocked last with its reason', async () => {
    stubWork();
    renderPage(<TodayPage />, '/work/today');
    await screen.findByRole('heading', { name: 'Overdue 1' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Overdue 1', 'Due today 1', 'This week 2', 'Later 1', 'Blocked 1']);
    const week = screen.getByRole('region', { name: 'This week 2' });
    expect(within(week).getAllByRole('listitem').map((li) => li.getAttribute('data-task'))).toEqual(['47', '43']);
    expect(within(row(41)!).getByRole('link', { name: 'Call Pizza Hut' })).toHaveAttribute('href', '/work/today?task=41');
    expect(row(45)!.querySelector('[data-part="blocked"]')).toHaveTextContent('Blocked: Waiting on legal');
    expect(row(43)).toHaveTextContent('Uber EMEA');
    expect(screen.queryByText(/you can't open/)).toBeNull();
  });

  it('marks a task done once, however fast, says so, and reads the list again', async () => {
    const { spy } = stubWork();
    renderPage(<TodayPage />, '/work/today');
    await userEvent.dblClick(await screen.findByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    await waitFor(() => expect(row(41)).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Done: Call Pizza Hut.');
    expect(screen.queryByRole('heading', { name: /^Overdue/ })).toBeNull();
    expect(sent(spy, 'PATCH', '/tasks/')).toEqual([{ status: 'completed' }]);
    await waitFor(() => expect(calls(spy, 'GET', '/work/today/')).toHaveLength(2));
  });

  it('keeps the row and says why when the server refuses', async () => {
    stubWork({ refuseNextPatch: { status: 400, body: { status: ['Choose pending, in progress, blocked or completed.'] } } });
    renderPage(<TodayPage />, '/work/today');
    await userEvent.click(await screen.findByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    expect(await within(row(41)!).findByRole('alert')).toHaveTextContent('Choose pending, in progress, blocked or completed.');
  });

  it('shows a skeleton while loading, then Try again after a failed read', async () => {
    const { spy } = stubWork({ failToday: 1 });
    renderPage(<TodayPage />, '/work/today');
    expect(screen.getByLabelText('Loading your tasks')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Overdue 1' })).toBeInTheDocument();
    expect(calls(spy, 'GET', '/work/today/')).toHaveLength(2);
  });

  it('says when nothing is on the list, and counts tasks on records I can no longer open', async () => {
    stubWork({ tasks: [], todayHidden: 2 });
    renderPage(<TodayPage />, '/work/today');
    expect(await screen.findByText('Nothing on your list')).toBeInTheDocument();
    expect(screen.getByText("2 tasks on records you can't open")).toBeInTheDocument();
  });

  it('reads again when a task changes in the panel', async () => {
    const { spy } = stubWork();
    renderPage(<TodayPage />, '/work/today?task=41');
    await userEvent.selectOptions(await screen.findByLabelText('Status'), 'in-progress');
    await waitFor(() => expect(calls(spy, 'GET', '/work/today/')).toHaveLength(2));
    await waitFor(() => expect(row(41)!.querySelector('[data-part="meta"]')).toHaveTextContent('In progress'));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/work/Today.test.tsx src/components/work/TaskRowItem.test.tsx --maxWorkers=2`
Expected: FAIL with "Failed to resolve import './Today'" and "'./TaskRowItem'".

- [ ] **Step 3: Write `src/components/work/WorkFrame.tsx` and `src/components/work/TaskRowItem.tsx`**

`src/components/work/WorkFrame.tsx`:

```tsx
import type { ReactNode } from 'react';

/** Every Work page's body: one full-width column under the transparent Work
 *  bar that owns its scroll, with a 16px gutter and no centred column, as
 *  the Brain frame lays its pages out. */
export function WorkFrame({ children }: { children: ReactNode }) {
  return (
    <div data-work-frame="" className="h-full min-h-0 w-full flex-1 overflow-y-auto">
      <div className="@container flex flex-col gap-4 px-4 pb-6">{children}</div>
    </div>
  );
}
```

`src/components/work/TaskRowItem.tsx`:

```tsx
import { Circle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../features/customers/formatters';
import { isOverdue } from '../../features/work/rows';
import { PRIORITY_LABEL, doneLabel, parentPath, personName, sourceText } from '../../features/work/workText';
import type { TaskRow } from '../../features/work/workTypes';
import { FOCUS, MONO } from '../organizations/portfolio/styles';
import { useTaskLink } from './useTaskLink';

const ROW_TITLE = `inline-flex min-h-11 max-w-full items-center self-start break-words text-left text-[13px] font-semibold text-ink hover:underline active:opacity-70 sm:min-h-0 ${FOCUS}`;
const META_LINK = `inline-flex min-h-11 items-center font-semibold text-ink-muted hover:text-ink hover:underline sm:min-h-0 ${FOCUS}`;
const DONE = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-subtle hover:text-success active:bg-line-subtle disabled:opacity-50 sm:h-9 sm:w-9 ${FOCUS}`;

function Dot() {
  return <span aria-hidden="true"> · </span>;
}

/** One task (spec §1.5): flat inside its list. The title opens the task
 *  panel on this page; Today adds a quick Done; Team names the assignee. */
export function TaskRowItem({
  row,
  today,
  onDone,
  busy = false,
  error = null,
  showAssignee = false,
}: {
  row: TaskRow;
  today: string;
  onDone?: () => void;
  busy?: boolean;
  error?: string | null;
  showAssignee?: boolean;
}) {
  const taskLink = useTaskLink();
  const source = sourceText(row);
  return (
    <li data-task={row.id} className="flex items-start gap-2 px-4 py-2">
      {onDone ? (
        <button type="button" onClick={onDone} disabled={busy} aria-label={doneLabel(row.title)} className={DONE}>
          <Circle className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <Link to={taskLink(row.id)} className={ROW_TITLE}>
          {row.title}
        </Link>
        <p data-part="meta" className="flex flex-wrap items-center text-[11px] text-ink-muted">
          <Link to={parentPath(row.parent)} className={META_LINK}>
            {row.parent.name}
          </Link>
          <Dot />
          <span>
            Due <span className={MONO}>{formatDate(row.due_date)}</span>
          </span>
          {isOverdue(row, today) ? (
            <>
              <Dot />
              <span className="font-semibold text-danger">Overdue</span>
            </>
          ) : null}
          <Dot />
          <span>{PRIORITY_LABEL[row.priority]} priority</span>
          {row.status === 'in-progress' ? (
            <>
              <Dot />
              <span>In progress</span>
            </>
          ) : null}
          {showAssignee ? (
            <>
              <Dot />
              <span>{personName(row.assignee)}</span>
            </>
          ) : null}
          {source ? (
            <>
              <Dot />
              <span>{source}</span>
            </>
          ) : null}
        </p>
        {row.status === 'blocked' ? (
          <p data-part="blocked" className="max-w-[70ch] break-words text-[13px] text-ink">
            <span className="font-semibold text-warning">Blocked:</span> {row.blocked_reason}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[11px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Write `src/components/work/useToday.ts`, `src/components/work/TodaySkeleton.tsx` and `src/components/work/TodayGroups.tsx`**

`src/components/work/useToday.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { fetchToday } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { TodayPayload } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

/** GET /work/today/. A reload keeps the list on screen until the answer
 *  lands; an error is shown only while there is no list to show. */
export function useToday() {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<TodayPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchToday().then(
      (payload) => {
        if (!alive) return;
        setData(payload);
        setError(null);
      },
      (err: unknown) => {
        if (alive) setError(errorMessage(err, WORK.LOAD_TODAY));
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, reload, setData };
}
```

`src/components/work/TodaySkeleton.tsx`:

```tsx
import { LIST } from '../brain/styles';

/** Today while it loads: two groups of rows in the loaded layout. */
export function TodaySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your tasks" className="flex flex-col gap-4">
      {[3, 2].map((rows, group) => (
        <div key={group} className="flex flex-col gap-2">
          <div className="h-3 w-24 animate-pulse rounded-md bg-subtle" />
          <div className={LIST}>
            {Array.from({ length: rows }, (_, n) => (
              <div key={n} className="flex items-center gap-3 px-4 py-3">
                <div className="h-5 w-5 animate-pulse rounded-full bg-subtle" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-3 w-1/2 animate-pulse rounded-md bg-subtle" />
                  <div className="h-2.5 w-1/3 animate-pulse rounded-md bg-subtle" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

`src/components/work/TodayGroups.tsx`:

```tsx
import { GROUP_KEYS, GROUP_LABEL, moreRowsText } from '../../features/work/workText';
import type { TaskRow, TodayPayload } from '../../features/work/workTypes';
import { LIST, SECTION_TITLE } from '../brain/styles';
import { MONO } from '../organizations/portfolio/styles';
import { TaskRowItem } from './TaskRowItem';

/** Today's groups (spec §1.5), in the contract's order; an empty group is
 *  not drawn. A group the server cut at 100 rows says so. */
export function TodayGroups({
  data,
  onDone,
  pending,
  errors,
}: {
  data: TodayPayload;
  onDone: (row: TaskRow) => void;
  pending: number | null;
  errors: Record<number, string>;
}) {
  return (
    <>
      {GROUP_KEYS.map((key) => {
        const rows = data.groups[key];
        if (rows.length === 0) return null;
        const headingId = `work-group-${key}`;
        const more = moreRowsText(rows.length, data.counts[key]);
        return (
          <section key={key} data-group={key} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h2 id={headingId} className={SECTION_TITLE}>
              {GROUP_LABEL[key]} <span className={MONO}>{data.counts[key]}</span>
            </h2>
            <ul className={LIST}>
              {rows.map((row) => (
                <TaskRowItem key={row.id} row={row} today={data.today} onDone={() => onDone(row)} busy={pending === row.id} error={errors[row.id] ?? null} />
              ))}
            </ul>
            {more ? <p className="text-[11px] text-ink-muted">{more}</p> : null}
          </section>
        );
      })}
    </>
  );
}
```

- [ ] **Step 5: Write `src/pages/work/Today.tsx`**

```tsx
import { useState, type ReactNode } from 'react';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { errorMessage } from '../../components/organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { taskChanged, useTaskChanges } from '../../components/work/taskChanges';
import { TodayGroups } from '../../components/work/TodayGroups';
import { TodaySkeleton } from '../../components/work/TodaySkeleton';
import { useToday } from '../../components/work/useToday';
import { WorkFrame } from '../../components/work/WorkFrame';
import { todayTotal, withoutRow } from '../../features/work/rows';
import { patchTask } from '../../features/work/workApi';
import { WORK, doneStatus, hiddenTodayText } from '../../features/work/workText';
import type { TaskRow } from '../../features/work/workTypes';

/** /work/today (spec §1.5): my open tasks, grouped Overdue, Due today, This
 *  week, Later and Blocked, each row with a quick Done. */
export function TodayPage() {
  const today = useToday();
  useTaskChanges(today.reload);
  const { run } = useSubmitOnce();
  const [pending, setPending] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [status, setStatus] = useState('');
  const data = today.data;

  async function markDone(row: TaskRow) {
    setStatus('');
    setErrors((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    setPending(row.id);
    const outcome = await run(() => patchTask(row.id, { status: 'completed' }));
    if (!outcome) return;
    setPending(null);
    if (outcome.ok) {
      today.setData((current) => (current ? withoutRow(current, row.id) : current));
      setStatus(doneStatus(row.title));
      taskChanged();
    } else {
      setErrors((current) => ({ ...current, [row.id]: errorMessage(outcome.error, WORK.DONE_FAILED) }));
    }
  }

  let body: ReactNode;
  if (!data && today.error) body = <ErrorBlock message={today.error} onRetry={today.reload} />;
  else if (!data) body = <TodaySkeleton />;
  else if (todayTotal(data) === 0) body = <EmptyState title={WORK.EMPTY_TITLE} detail={WORK.EMPTY_DETAIL} action={null} />;
  else body = <TodayGroups data={data} onDone={(row) => void markDone(row)} pending={pending} errors={errors} />;
  const hidden = data ? hiddenTodayText(data.hidden) : null;

  return (
    <WorkFrame>
      <div data-part="toolbar" className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-[13px] text-ink-muted">
          {status}
        </p>
      </div>
      {body}
      {hidden ? <p className="text-[13px] text-ink-muted">{hidden}</p> : null}
    </WorkFrame>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/pages/work/Today.test.tsx src/components/work/TaskRowItem.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/work/WorkFrame.tsx src/components/work/TaskRowItem.tsx src/components/work/TaskRowItem.test.tsx src/components/work/useToday.ts \
  src/components/work/TodaySkeleton.tsx src/components/work/TodayGroups.tsx src/pages/work/Today.tsx src/pages/work/Today.test.tsx
git commit -m "$(cat <<'EOF'
feat(work): Today, my open tasks grouped, with a quick Done

Overdue, Due today, This week, Later and Blocked (with its reason), a
row's title opening the task panel, and the hidden count, with loading,
empty and error states.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: New task from Today

**Files:**
- Create: `src/components/work/NewTaskSheet.tsx`
- Modify: `src/components/plans/RecordStep.tsx` (a `heading` prop), `src/pages/work/Today.tsx`
- Test: `src/pages/work/Today.test.tsx` (add cases), `src/components/plans/RecordPlans.test.tsx` is unchanged (the default heading stays "1. Record")

**Interfaces:**
- Consumes: `createWorkTask`, `WORK`, `TaskParentRef` (Task 1); `TaskForm` with `parent` (Task 3); `Sheet`; `RecordStep`, `RecordRef` (`features/plans/planTypes.ts`); `PRIMARY`; `SM`, `useMediaQuery`; `taskChanged`.
- Produces: `<NewTaskSheet isSm onClose onSaved />`; `RecordStep` takes `heading?: string` (default `'1. Record'`). Today's toolbar gains the page's one primary button, New task.

- [ ] **Step 1: Write the failing tests** (add to `src/pages/work/Today.test.tsx`, inside the `describe`)

```tsx
  it('New task: pick a record, see who can open it, save, and the task joins my list', async () => {
    const { spy } = stubWork();
    renderPage(<TodayPage />, '/work/today');
    await userEvent.click(await screen.findByRole('button', { name: 'New task' }));
    const sheet = screen.getByRole('dialog', { name: 'New task' });
    expect(within(sheet).getByText('Pick an organization or account first.')).toBeInTheDocument();
    await userEvent.type(within(sheet).getByRole('searchbox'), 'pizza');
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Pizza Hut' }));
    expect(await within(sheet).findByRole('option', { name: "Dana CSM · Can't open this organization" })).toBeDisabled();
    await userEvent.type(within(sheet).getByLabelText('Task title'), 'Prep the QBR');
    await userEvent.type(within(sheet).getByLabelText('Due date'), '2026-10-09');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('Task saved.');
    expect(calls(spy, 'POST', '/tasks/')).toEqual(['/customers/7/tasks/']);
    expect(sent(spy, 'POST', '/tasks/')).toEqual([{ title: 'Prep the QBR', due_date: '2026-10-09', priority: 'medium', assignee_id: null }]);
    expect(await within(screen.getByRole('region', { name: /^This week/ })).findByRole('link', { name: 'Prep the QBR' })).toBeInTheDocument();
  });

  it('New task: Close leaves without saving', async () => {
    const { spy } = stubWork();
    renderPage(<TodayPage />, '/work/today');
    await userEvent.click(await screen.findByRole('button', { name: 'New task' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'New task' })).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls(spy, 'POST', '/tasks/')).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/work/Today.test.tsx --maxWorkers=2`
Expected: FAIL: "Unable to find role="button" and name "New task"".

- [ ] **Step 3: Give `RecordStep` a heading**

In `src/components/plans/RecordStep.tsx`, add `heading = '1. Record'` to the destructured props and `heading?: string;` to their type (with the comment `/** The section's heading; New plan numbers its steps, Work's New task does not. */`), and render it in place of the literal:

```tsx
      <h3 id={headingId} className="text-[15px] font-semibold text-ink">
        {heading}
      </h3>
```

- [ ] **Step 4: Write `src/components/work/NewTaskSheet.tsx`**

```tsx
import { useState } from 'react';
import type { RecordRef } from '../../features/plans/planTypes';
import { createWorkTask } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { TaskParentRef } from '../../features/work/workTypes';
import { TaskForm } from '../organizations/activity/TasksTab';
import { Sheet } from '../organizations/detail/Sheet';
import { RecordStep } from '../plans/RecordStep';

const parentOf = (record: RecordRef): TaskParentRef => ({ kind: record.kind === 'organization' ? 'customer' : 'account', id: record.id });

/** New task (spec §1.5): pick an organization or account the reader can
 *  open, then the title, due date, priority and assignee (who can open
 *  that record). A refusal stays in the sheet with the server's words. */
export function NewTaskSheet({ isSm, onClose, onSaved }: { isSm: boolean; onClose: () => void; onSaved: () => void }) {
  const [record, setRecord] = useState<RecordRef | null>(null);
  const parent = record ? parentOf(record) : null;
  return (
    <Sheet title={WORK.NEW_TASK} description={record ? `On ${record.name}` : WORK.PICK_RECORD} isSm={isSm} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <RecordStep heading={WORK.RECORD} record={record} locked={false} loading={false} onPick={setRecord} onClear={() => setRecord(null)} />
        {parent ? (
          <TaskForm
            key={`${parent.kind}:${parent.id}`}
            parent={parent}
            onCreate={async (task) => {
              await createWorkTask(parent, task);
              return true;
            }}
            onDone={onSaved}
          />
        ) : null}
      </div>
    </Sheet>
  );
}
```

- [ ] **Step 5: Put New task on Today**

In `src/pages/work/Today.tsx`, add the imports:

```tsx
import { Plus } from 'lucide-react';
import { PRIMARY } from '../../components/organizations/portfolio/styles';
import { NewTaskSheet } from '../../components/work/NewTaskSheet';
import { SM, useMediaQuery } from '../../lib/useMediaQuery';
```

add state beside the others:

```tsx
  const isSm = useMediaQuery(SM);
  const [adding, setAdding] = useState(false);
```

put the button in the toolbar row, after the status line:

```tsx
        <button type="button" onClick={() => setAdding(true)} className={PRIMARY}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {WORK.NEW_TASK}
        </button>
```

and render the sheet as the frame's last child:

```tsx
      {adding ? (
        <NewTaskSheet
          isSm={isSm}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setStatus(WORK.SAVED);
            taskChanged();
          }}
        />
      ) : null}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/pages/work/Today.test.tsx src/components/plans --maxWorkers=2`
Expected: PASS (New plan's "1. Record" heading is unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/components/work/NewTaskSheet.tsx src/components/plans/RecordStep.tsx src/pages/work/Today.tsx src/pages/work/Today.test.tsx
git commit -m "$(cat <<'EOF'
feat(work): New task from Today

Pick an organisation or account, then the existing task form with the
can-open assignee picker; the saved task joins the list.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Team: one row per person, expanding into their tasks

**Files:**
- Create: `src/components/work/useDrill.ts`, `src/components/work/TeamRow.tsx`, `src/components/work/TeamSkeleton.tsx`, `src/pages/work/Team.tsx`
- Test: `src/pages/work/Team.test.tsx`

**Interfaces:**
- Consumes: `fetchTeam`, `fetchDrill`, `WORK`, `teamTitle`, `teamRowLabel`, `hiddenTeamText`, `personName`, `TeamPerson`, `TaskRow`, `useTaskChanges` (Task 1); `TaskRowItem`, `WorkFrame` (Task 7); `useBrainScope`, `BrainControls`, `LostAccessNotice`, `useScopedRead` (`components/brain/`); `ErrorBlock`, `EmptyState`; `LIST`, `SECTION_TITLE`; `FOCUS`, `MONO`, `QUIET`; `formatDate`; `errorMessage`.
- Produces: `useDrill(assignee: number, enabled: boolean): { tasks: TaskRow[] | null; error: string | null; reload: () => void }`; `<TeamRow row today />`; `<TeamSkeleton />` (`aria-label="Loading the team"`); `TeamPage` (`/work/team`).

- [ ] **Step 1: Write the failing test** `src/pages/work/Team.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { calls, stubWork } from '../../features/work/testWork';
import { resetViewport } from '../../test/viewport';
import { renderPage, where } from './testPages';
import { TeamPage } from './Team';

describe('Work › Team (spec §1.5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
    resetMembersCache();
  });

  it('lists every person with counts, overdue highlighted, the hidden count, and opens a row into their tasks', async () => {
    const { spy } = stubWork({ offered: ['me', 'team'], teamHidden: { team: 2 } });
    renderPage(<TeamPage />, '/work/team?scope=team', { role: 'csm' });
    const list = await screen.findByRole('list', { name: "Your team's tasks" });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Alice: 6 open, 1 overdue, 1 blocked, oldest due 5 Oct 2026',
      'Carl CSM: 1 open, 1 overdue, 0 blocked, oldest due 3 Oct 2026',
      'Unassigned (was Erin Former): 1 open, 1 overdue, 0 blocked, oldest due 2 Oct 2026',
      'Dana CSM: 0 open, 0 overdue, 0 blocked',
    ]);
    expect(rows[1].querySelector('.text-danger')).toHaveTextContent('1 overdue');
    expect(rows[3].querySelector('.text-danger')).toBeNull();
    expect(screen.getByText("2 tasks you can't open")).toBeInTheDocument();

    await userEvent.click(rows[1]);
    expect(rows[1]).toHaveAttribute('aria-expanded', 'true');
    const carl = await screen.findByRole('list', { name: 'Carl CSM: open tasks' });
    expect(within(carl).getByRole('link', { name: 'Chase the exec sponsor' })).toHaveAttribute('href', '/work/team?scope=team&task=46');
    expect(carl).toHaveTextContent('Overdue');
    expect(calls(spy, 'GET', '/work/tasks/')).toEqual(['/work/tasks/?assignee=3&state=open']);

    await userEvent.click(rows[3]);
    expect(await screen.findByText('No open tasks you can see.')).toBeInTheDocument();
  });

  it('switches Me · My team · Company as in Brain; Company shows real counts, nothing hidden', async () => {
    stubWork({ teamHidden: { team: 2, company: 0 } });
    renderPage(<TeamPage />, '/work/team?scope=team');
    await screen.findByRole('list', { name: "Your team's tasks" });
    await userEvent.click(screen.getByRole('button', { name: 'Company' }));
    await waitFor(() => expect(where()).toBe('/work/team?scope=company'));
    const list = await screen.findByRole('list', { name: "Everyone's tasks" });
    expect(within(list).getByRole('button', { name: /^Mona Manager: 0 open/ })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /^Alice: 6 open/ })).toBeInTheDocument();
    expect(screen.queryByText(/you can't open/)).toBeNull();
  });

  it('drops back to an offered view when the URL names one the reader can’t use', async () => {
    stubWork({ offered: ['me', 'team'] });
    renderPage(<TeamPage />, '/work/team?scope=company', { role: 'csm' });
    expect(await screen.findByText('You no longer have access to that view.')).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/work/team?scope=team'));
  });

  it('shows a skeleton, then Try again after a failed read', async () => {
    const { spy } = stubWork({ failTeam: 1 });
    renderPage(<TeamPage />, '/work/team?scope=team');
    expect(screen.getByLabelText('Loading the team')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: "Your team's tasks" })).toBeInTheDocument();
    expect(calls(spy, 'GET', '/work/team/')).toHaveLength(2);
  });

  it('a row whose tasks fail to load offers Try again', async () => {
    stubWork({ failDrill: 1 });
    renderPage(<TeamPage />, '/work/team?scope=team');
    await userEvent.click(await screen.findByRole('button', { name: /^Carl CSM:/ }));
    expect(await screen.findByText('Down.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Chase the exec sponsor' })).toBeInTheDocument();
  });

  it('reads again after a task changes in the panel', async () => {
    const { spy } = stubWork();
    renderPage(<TeamPage />, '/work/team?scope=team&task=46');
    // The picker is disabled until its people land.
    await screen.findByRole('option', { name: 'Mona Manager' });
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '2');
    await waitFor(() => expect(calls(spy, 'GET', '/work/team/')).toHaveLength(2));
    expect(await screen.findByRole('button', { name: /^Carl CSM: 0 open/ })).toBeInTheDocument();
  });

  it('at phone width the view switch is a select above the list', async () => {
    stubWork();
    renderPage(<TeamPage />, '/work/team?scope=team', { width: 375 });
    expect(await screen.findByLabelText('View')).toHaveValue('team');
    expect(await screen.findByRole('list', { name: "Your team's tasks" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/work/Team.test.tsx --maxWorkers=2`
Expected: FAIL with "Failed to resolve import './Team'".

- [ ] **Step 3: Write `src/components/work/useDrill.ts` and `src/components/work/TeamSkeleton.tsx`**

`src/components/work/useDrill.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { fetchDrill } from '../../features/work/workApi';
import { WORK } from '../../features/work/workText';
import type { TaskRow } from '../../features/work/workTypes';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useTaskChanges } from './taskChanges';

type Answer = { tasks: TaskRow[] | null; error: string | null };

/** One person's open tasks the reader may read (GET /work/tasks/), read
 *  once the row opens, again on Try again and after any task changes. */
export function useDrill(assignee: number, enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchDrill(assignee).then(
      (data) => {
        if (alive) setAnswer({ tasks: data.tasks, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer((prev) => ({ tasks: prev?.tasks ?? null, error: errorMessage(err, WORK.LOAD_DRILL) }));
      },
    );
    return () => {
      alive = false;
    };
  }, [assignee, enabled, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useTaskChanges(reload);
  return { tasks: answer?.tasks ?? null, error: answer?.error ?? null, reload };
}
```

`src/components/work/TeamSkeleton.tsx`:

```tsx
import { LIST } from '../brain/styles';

/** Team while it loads: three person rows. */
export function TeamSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the team" className={LIST}>
      {[0, 1, 2].map((n) => (
        <div key={n} className="flex items-center gap-3 px-4 py-3">
          <div className="h-4 w-4 animate-pulse rounded-md bg-subtle" />
          <div className="h-3 w-1/3 animate-pulse rounded-md bg-subtle" />
          <div className="ml-auto h-3 w-1/4 animate-pulse rounded-md bg-subtle" />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/work/TeamRow.tsx`**

```tsx
import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatDate } from '../../features/customers/formatters';
import { WORK, personName, teamRowLabel } from '../../features/work/workText';
import type { TeamPerson } from '../../features/work/workTypes';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { TaskRowItem } from './TaskRowItem';
import { useDrill } from './useDrill';

const ROW = `flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-subtle active:bg-line-subtle ${FOCUS}`;

/** One person (spec §1.5): their open, overdue and blocked counts, overdue
 *  in the danger colour beside its word; the row opens into their tasks. */
export function TeamRow({ row, today }: { row: TeamPerson; today: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const drill = useDrill(row.person.id, open);
  const name = personName(row.person);

  let tasks: ReactNode = null;
  if (open) {
    if (!drill.tasks && drill.error) {
      tasks = (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p role="alert" className="text-[13px] text-danger">
            {drill.error}
          </p>
          <button type="button" onClick={drill.reload} className={QUIET}>
            {WORK.TRY_AGAIN}
          </button>
        </div>
      );
    } else if (!drill.tasks) {
      tasks = (
        <div aria-busy="true" aria-label="Loading tasks" className="flex flex-col gap-2 px-4 py-3">
          <div className="h-3 w-1/2 animate-pulse rounded-md bg-subtle" />
          <div className="h-3 w-1/3 animate-pulse rounded-md bg-subtle" />
        </div>
      );
    } else if (drill.tasks.length === 0) {
      tasks = <p className="px-4 py-3 text-[13px] text-ink-muted">{WORK.NO_DRILL}</p>;
    } else {
      tasks = (
        <ul aria-label={`${name}: open tasks`} className="divide-y divide-line">
          {drill.tasks.map((task) => (
            <TaskRowItem key={task.id} row={task} today={today} />
          ))}
        </ul>
      );
    }
  }

  return (
    <li data-person={row.person.id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={teamRowLabel(row)}
        onClick={() => setOpen((value) => !value)}
        className={ROW}
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-ink-muted ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{name}</span>
        <span data-part="counts" className="flex flex-wrap items-center gap-x-3 text-[13px] text-ink-muted">
          <span>
            <span className={MONO}>{row.open}</span> open
          </span>
          <span className={row.overdue > 0 ? 'font-semibold text-danger' : undefined}>
            <span className={MONO}>{row.overdue}</span> overdue
          </span>
          <span>
            <span className={MONO}>{row.blocked}</span> blocked
          </span>
        </span>
        {row.oldest_overdue ? (
          <span data-part="oldest" className="w-full pl-7 text-[11px] text-ink-muted">
            Oldest due <span className={MONO}>{formatDate(row.oldest_overdue)}</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div id={panelId} className="border-t border-line">
          {tasks}
        </div>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 5: Write `src/pages/work/Team.tsx`**

```tsx
import type { ReactNode } from 'react';
import { BrainControls } from '../../components/brain/BrainControls';
import { LostAccessNotice } from '../../components/brain/LostAccessNotice';
import { LIST, SECTION_TITLE } from '../../components/brain/styles';
import { useBrainScope } from '../../components/brain/useBrainScope';
import { useScopedRead } from '../../components/brain/useScopedRead';
import { EmptyState, ErrorBlock } from '../../components/organizations/portfolio/PortfolioSections';
import { useTaskChanges } from '../../components/work/taskChanges';
import { TeamRow } from '../../components/work/TeamRow';
import { TeamSkeleton } from '../../components/work/TeamSkeleton';
import { WorkFrame } from '../../components/work/WorkFrame';
import { fetchTeam } from '../../features/work/workApi';
import { WORK, hiddenTeamText, teamTitle } from '../../features/work/workText';

const TITLE_ID = 'work-team-title';

/** /work/team (spec §1.5): Me · My team · Company, as in Brain (the same
 *  scopes and the same remembered choice). One row per person; tasks the
 *  reader can't open are counted, never named. */
export function TeamPage() {
  const brain = useBrainScope();
  const team = useScopedRead(brain.scope, fetchTeam, brain.refused, WORK.LOAD_TEAM);
  useTaskChanges(team.retry);
  const data = team.data;

  let body: ReactNode;
  if (brain.error) body = <ErrorBlock message={brain.error} onRetry={brain.retry} />;
  else if (team.error) body = <ErrorBlock message={team.error} onRetry={team.retry} />;
  else if (!data) body = <TeamSkeleton />;
  else if (data.people.length === 0) body = <EmptyState title={WORK.NOBODY} detail={WORK.NOBODY_DETAIL} action={null} />;
  else
    body = (
      <section aria-labelledby={TITLE_ID} className="flex flex-col gap-2">
        <h2 id={TITLE_ID} className={SECTION_TITLE}>
          {teamTitle(data.scope)}
        </h2>
        <ul aria-labelledby={TITLE_ID} className={LIST}>
          {data.people.map((row) => (
            <TeamRow key={`${data.scope}:${row.person.id}`} row={row} today={data.today} />
          ))}
        </ul>
      </section>
    );
  const hidden = data ? hiddenTeamText(data.hidden) : null;

  return (
    <WorkFrame>
      <BrainControls brain={brain} />
      {brain.notice ? <LostAccessNotice message={brain.notice} /> : null}
      {body}
      {hidden ? <p className="text-[13px] text-ink-muted">{hidden}</p> : null}
    </WorkFrame>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/pages/work/Team.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/work/useDrill.ts src/components/work/TeamSkeleton.tsx src/components/work/TeamRow.tsx src/pages/work/Team.tsx src/pages/work/Team.test.tsx
git commit -m "$(cat <<'EOF'
feat(work): Team, one row per person expanding into their tasks

Brain's Me / My team / Company switch, counts with overdue highlighted,
the "N tasks you can't open" line, and the drill-down per person.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 10: The Work section: routes, the Work bar and the sidebar badge

**Files:**
- Create: `src/features/work/workTabs.ts`, `src/components/layout/WorkTabs.tsx`, `src/components/work/useTeamAccess.ts`, `src/components/work/useWorkCount.ts`, `src/pages/work/WorkRoutes.tsx`
- Modify: `src/App.tsx`, `src/components/layout/Navbar.tsx`, `src/layouts/DashboardLayout.tsx`, `src/components/layout/Sidebar.tsx`, `src/pages/work/testPages.tsx` (add `renderWork`)
- Test: `src/features/work/workTabs.test.ts`, `src/components/work/useWorkCount.test.tsx`, `src/pages/work/WorkRoutes.test.tsx`, `src/components/layout/Navbar.test.tsx` (add a `describe`), `src/components/layout/Sidebar.test.tsx` (add a `describe`)

**Interfaces:**
- Consumes: `fetchToday`, `useTaskChanges` (Task 1); `TodayPage` (Task 7–8), `TeamPage` (Task 9), `TaskPanelHost` (Task 4); `useHasReports` (`components/plans/useHasReports.ts`); `useCapability`, `useAppSelector` (`src/hooks.ts`); `stubWork`, `calls` (Task 2).
- Produces:
  - `WORK_TABS: readonly WorkTab[]` (`{path, label, team?}`; Today, Team), `isWorkPath(pathname: string): boolean`, `workTabOf(pathname: string): string | null`, `workTabsFor(canSeeTeam: boolean): WorkTab[]`.
  - `useTeamAccess(): boolean`; `useWorkCount(userId: number | null): number | null`.
  - `<WorkTabs />`; `WorkRoutes` (`/work` and anything unknown under it go to `/work/today`); `WorkNavItem({ expanded? })` exported from `Sidebar.tsx`; `NavItem` gains `badgeNoun` (default `'waiting'`).
  - test-only `renderWork(url, { width?, role?, nav?, sidebarItem?, user? }): { store }`.

- [ ] **Step 1: Write the failing tests**

`src/features/work/workTabs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isWorkPath, workTabOf, workTabsFor } from './workTabs';

describe('workTabs', () => {
  it('knows a Work route, and nothing that only starts with the same letters', () => {
    expect(isWorkPath('/work')).toBe(true);
    expect(isWorkPath('/work/today')).toBe(true);
    expect(isWorkPath('/workspace')).toBe(false);
    expect(isWorkPath('/settings/work')).toBe(false);
  });

  it('lights the tab of the page, a trailing slash included', () => {
    expect(workTabOf('/work/today')).toBe('/work/today');
    expect(workTabOf('/work/team/')).toBe('/work/team');
    expect(workTabOf('/work')).toBeNull();
  });

  it('shows Team only to readers who may use it (Decision 7); no Recommended yet', () => {
    expect(workTabsFor(false).map((tab) => tab.label)).toEqual(['Today']);
    expect(workTabsFor(true).map((tab) => tab.label)).toEqual(['Today', 'Team']);
  });
});
```

`src/components/work/useWorkCount.test.tsx`:

```tsx
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { calls, stubWork } from '../../features/work/testWork';
import { taskChanged } from './taskChanges';
import { useWorkCount } from './useWorkCount';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/work/today']}>{children}</MemoryRouter>;

describe('useWorkCount (the sidebar badge, Decision 9)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads my overdue count, and again after a task changes', async () => {
    const { spy, tasks } = stubWork();
    const { result } = renderHook(() => useWorkCount(1), { wrapper });
    await waitFor(() => expect(result.current).toBe(1));
    tasks.get(41)!.status = 'completed';
    act(() => taskChanged());
    await waitFor(() => expect(result.current).toBe(0));
    expect(calls(spy, 'GET', '/work/today/')).toHaveLength(2);
  });

  it('reads nothing signed out, and keeps the last count when a read fails', async () => {
    const { spy } = stubWork({ failToday: 0 });
    const none = renderHook(() => useWorkCount(null), { wrapper });
    expect(none.result.current).toBeNull();
    expect(calls(spy, 'GET', '/work/today/')).toEqual([]);
    const { result } = renderHook(() => useWorkCount(1), { wrapper });
    await waitFor(() => expect(result.current).toBe(1));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'Down.' }) })));
    act(() => taskChanged());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(result.current).toBe(1);
  });
});
```

`src/pages/work/WorkRoutes.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { stubWork } from '../../features/work/testWork';
import { resetViewport } from '../../test/viewport';
import { renderWork, where } from './testPages';

describe('WorkRoutes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it.each(['/work', '/work/', '/work/recommended', '/work/anything'])('sends %s to Today', async (url) => {
    stubWork();
    renderWork(url);
    await waitFor(() => expect(where()).toBe('/work/today'));
    expect(await screen.findByRole('heading', { name: 'Overdue 1' })).toBeInTheDocument();
  });

  it('serves Team at /work/team', async () => {
    stubWork();
    renderWork('/work/team?scope=team');
    expect(await screen.findByRole('list', { name: "Your team's tasks" })).toBeInTheDocument();
  });
});
```

Add to `src/components/layout/Navbar.test.tsx` (with `import { calls, stubWork } from '../../features/work/testWork';` and `import { resetMembersCache } from '../../features/knowledge/useMembers';` among the imports, and `act` added to the `@testing-library/react` import if it is not already there):

```tsx
describe('Navbar on Work (Work spec §1.5)', () => {
  const tabs = () => within(screen.getByRole('navigation', { name: 'Work' }));

  beforeEach(() => {
    vi.unstubAllGlobals();
    resetMembersCache();
  });

  it.each([
    ['/work/today', 'Today'],
    ['/work/team', 'Team'],
  ])('on %s: the framed bar, "Work" as its h1, Today and Team, "%s" current', (url, current) => {
    stubWork();
    const setSlot = vi.fn();
    renderNavbar(url, null, null, [], setSlot);
    expect(screen.getByRole('heading', { level: 1, name: 'Work' })).toBeInTheDocument();
    expect(document.querySelector('header')).toHaveClass('h-16', 'px-4');
    expect(setSlot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(tabs().getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Today', '/work/today'],
      ['Team', '/work/team'],
    ]);
    expect(tabs().getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page');
  });

  it('shows Team to someone with reports', async () => {
    stubWork();
    renderNavbar('/work/today', null, null, [], () => {}, { ...mockUser, permissions: [] });
    expect(await tabs().findByRole('link', { name: 'Team' })).toBeInTheDocument();
  });

  it('shows Team to the Leadership function', () => {
    stubWork({ members: [] });
    renderNavbar('/work/today', null, null, [], () => {}, { ...mockUser, permissions: [], function: 'leadership' } as unknown as typeof mockUser);
    expect(tabs().getByRole('link', { name: 'Team' })).toBeInTheDocument();
  });

  it('hides Team from a member with no reports, no view-all and another function', async () => {
    const { spy } = stubWork({ members: [] });
    renderNavbar('/work/today', null, null, [], () => {}, { ...mockUser, permissions: [] });
    await waitFor(() => expect(calls(spy, 'GET', '/auth/members/')).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(tabs().getAllByRole('link').map((link) => link.textContent)).toEqual(['Today']);
  });
});
```

Add to `src/components/layout/Sidebar.test.tsx` (with `import { calls, stubWork } from '../../features/work/testWork';`, and `act` is already imported):

```tsx
describe('Sidebar Work item (Work spec §1.5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('goes to Today, is lit on every Work route, and carries my overdue count in its name', async () => {
    stubWork();
    renderSidebar('csm', '/work/team');
    const link = await screen.findByRole('link', { name: 'Work, 1 overdue' });
    expect(link).toHaveAttribute('href', '/work/today');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(within(link).getByText('1')).toHaveClass('font-mono-brand');
  });

  it('shows no badge and no count at 0', async () => {
    const { spy } = stubWork({ tasks: [] });
    renderSidebar('csm', '/dashboard');
    await waitFor(() => expect(calls(spy, 'GET', '/work/today/')).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    const link = screen.getByRole('link', { name: 'Work' });
    expect(link.querySelector('.bg-warning')).toBeNull();
    expect(link).not.toHaveAttribute('aria-current');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/work/workTabs.test.ts src/components/work/useWorkCount.test.tsx src/pages/work/WorkRoutes.test.tsx src/components/layout --maxWorkers=2`
Expected: FAIL: the new modules do not resolve; the Navbar shows no "Work" heading; the Sidebar has no Work link.

- [ ] **Step 3: Write `src/features/work/workTabs.ts`**

```ts
// The Work bar's tabs (spec §1.5), kept free of React so the rules are
// unit-tested on their own.

export interface WorkTab {
  path: string;
  label: string;
  /** Shown only to readers who may use Team (Decision 7). */
  team?: boolean;
}

export const WORK_TABS: readonly WorkTab[] = [
  { path: '/work/today', label: 'Today' },
  // Delivery 2 puts Recommended here, between Today and Team.
  { path: '/work/team', label: 'Team', team: true },
];

/** Every Work route wears the Work bar; `/workspace` would not. */
export function isWorkPath(pathname: string): boolean {
  return /^\/work(\/|$)/.test(pathname);
}

export function workTabOf(pathname: string): string | null {
  return WORK_TABS.find((tab) => pathname === tab.path || pathname === `${tab.path}/`)?.path ?? null;
}

export function workTabsFor(canSeeTeam: boolean): WorkTab[] {
  return WORK_TABS.filter((tab) => !tab.team || canSeeTeam);
}
```

- [ ] **Step 4: Write `src/components/work/useTeamAccess.ts` and `src/components/work/useWorkCount.ts`**

`src/components/work/useTeamAccess.ts`:

```ts
import { useAppSelector, useCapability } from '../../hooks';
import { useHasReports } from '../plans/useHasReports';

/** Whether the Team tab shows (Decision 7): anyone with reports, with
 *  view_all_accounts, or in the Leadership function. */
export function useTeamAccess(): boolean {
  const hasReports = useHasReports();
  const canSeeAll = useCapability('view_all_accounts');
  const leads = useAppSelector((state) => state.auth.user?.function === 'leadership');
  return canSeeAll || leads || hasReports === true;
}
```

`src/components/work/useWorkCount.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchToday } from '../../features/work/workApi';
import { useTaskChanges } from './taskChanges';

type Answer = { userId: number; count: number };

/** The sidebar's Work badge (Decision 9): my overdue count, GET
 *  /work/today/'s counts.overdue. Read on mount, for another user, after
 *  every taskChanged() and on every route change (a task assigned by
 *  someone else arrives as a notification, then a navigation). A failed
 *  read keeps the last count. Delivery 2 adds recommendations waiting. */
export function useWorkCount(userId: number | null): number | null {
  const [tick, setTick] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const { pathname } = useLocation();
  const seenPath = useRef<string | null>(null);
  useTaskChanges(useCallback(() => setTick((n) => n + 1), []));
  useEffect(() => {
    if (seenPath.current === null) seenPath.current = pathname;
    else if (seenPath.current !== pathname) {
      seenPath.current = pathname;
      setTick((n) => n + 1);
    }
  }, [pathname]);
  useEffect(() => {
    if (userId === null) return;
    let alive = true;
    fetchToday().then(
      (data) => {
        const overdue = data?.counts?.overdue;
        if (alive && typeof overdue === 'number') setAnswer({ userId, count: overdue });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [userId, tick]);
  return answer !== null && answer.userId === userId ? answer.count : null;
}
```

- [ ] **Step 5: Write `src/components/layout/WorkTabs.tsx` and `src/pages/work/WorkRoutes.tsx`**

`src/components/layout/WorkTabs.tsx`:

```tsx
import { Link, useLocation } from 'react-router-dom';
import { workTabOf, workTabsFor } from '../../features/work/workTabs';
import { useTeamAccess } from '../work/useTeamAccess';

// Class for class the Brain bar's tabs (BrainTabs.tsx): a negative offset
// keeps the ring inside the tab, since the row's own overflow-x-auto clips
// an outline drawn outside it.
const TAB =
  'inline-flex h-full min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-[13px] font-semibold transition-colors duration-[var(--dur-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px]';

/** The Work bar (spec §1.5): "Work", then Today and, for readers who may
 *  use it, Team, as underline tabs. Below sm the row scrolls sideways. */
export function WorkTabs() {
  const location = useLocation();
  const canSeeTeam = useTeamAccess();
  const current = workTabOf(location.pathname);
  return (
    <div className="flex h-full min-w-0 items-center gap-4">
      <h1 className="shrink-0 text-[15px] font-bold tracking-tight text-ink">Work</h1>
      <nav aria-label="Work" className="flex h-full min-w-0 items-center gap-4 overflow-x-auto [scrollbar-width:none]">
        {workTabsFor(canSeeTeam).map((tab) => {
          const active = tab.path === current;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              aria-current={active ? 'page' : undefined}
              className={`${TAB} ${active ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

`src/pages/work/WorkRoutes.tsx`:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { TeamPage } from './Team';
import { TodayPage } from './Today';

/** /work/* (spec §1.5): Today and Team. /work, and anything not yet built
 *  here (Recommended is delivery 2), lands on Today. */
export function WorkRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="/work/today" replace />} />
      <Route path="today" element={<TodayPage />} />
      <Route path="team" element={<TeamPage />} />
      <Route path="*" element={<Navigate to="/work/today" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 6: Wire the route, the bar, the layout and the sidebar**

In `src/App.tsx`, add `import { WorkRoutes } from './pages/work/WorkRoutes';` beside the Brain import, and add the route right after `<Route path="brain/*" element={<BrainRoutes />} />`:

```tsx
          {/* Work (spec 2026-10-07 §1.5): Today and Team. The task panel
              opens over any route at ?task=<id> (DashboardLayout). */}
          <Route path="work/*" element={<WorkRoutes />} />
```

In `src/components/layout/Navbar.tsx`:
- add `import { isWorkPath } from '../../features/work/workTabs';` and `import { WorkTabs } from './WorkTabs';`;
- under `const isBrain = isBrainPath(location.pathname);` add:

```tsx
  // Every Work route wears the framed bar (Work spec §1.5): "Work" and its
  // tabs, the actions slot (where Team portals the scope switch), no avatar.
  const isWork = isWorkPath(location.pathname);
```

- append `|| isWork` to the end of the `isFramed` expression (after `isBrain`);
- in the title chain, after the Brain branch:

```tsx
        ) : isBrain ? (
          <BrainTabs />
        ) : isWork ? (
          <WorkTabs />
        ) : (
```

In `src/layouts/DashboardLayout.tsx`, add `import { isWorkPath } from '../features/work/workTabs';`, define under `const isBrain = …`:

```tsx
  // Work wears WorkFrame, whose own px-4 pb-6 gutters it (Work spec §1.5).
  const isWork = isWorkPath(location.pathname);
```

and append `|| isWork` after `isBrain` inside the `<main>` padding condition.

In `src/components/layout/Sidebar.tsx`:
- add `ListTodo` to the `lucide-react` import list, and `import { isWorkPath } from '../../features/work/workTabs';` and `import { useWorkCount } from '../work/useWorkCount';`;
- right after the Dashboard `NavItem`, add `<WorkNavItem expanded={isOpen} />`;
- add the `badgeNoun` prop to `NavItem`: in its destructuring `badgeNoun = 'waiting',`, in its prop types

```tsx
  /** The word after the badge's count in the link's name ("Brain, 3 waiting", "Work, 2 overdue"). */
  badgeNoun?: string;
```

  and change the name line to:

```tsx
  const name = badge !== undefined && badge > 0 ? `${label}, ${badge} ${badgeNoun}` : label;
```

- add, after `BrainNavItem`:

```tsx
/** Work (spec §1.5): one item to Today, lit on every Work route, with my
 *  overdue count as its badge (Decision 9; delivery 2 adds recommendations
 *  waiting to the same number). Exported for the Work journeys. */
export function WorkNavItem({ expanded = false }: { expanded?: boolean }) {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const count = useWorkCount(userId);
  const location = useLocation();
  return (
    <NavItem
      to="/work/today"
      icon={<ListTodo className="w-5 h-5" aria-hidden="true" />}
      label="Work"
      badge={count ?? undefined}
      badgeNoun="overdue"
      forceActive={isWorkPath(location.pathname)}
      expanded={expanded}
    />
  );
}
```

In `src/pages/work/testPages.tsx`, add the imports `import { Navbar } from '../../components/layout/Navbar';`, `import { WorkNavItem } from '../../components/layout/Sidebar';` and `import { WorkRoutes } from './WorkRoutes';`, and add:

```tsx
/** The Work routes as App.tsx routes them, with the task panel host; the
 *  real Navbar with `nav`, the sidebar's Work item with `sidebarItem`. */
export function renderWork(
  url: string,
  {
    width = 1440,
    role = 'admin',
    nav = false,
    sidebarItem = false,
    user,
  }: { width?: number; role?: Role; nav?: boolean; sidebarItem?: boolean; user?: { id: number; name: string } } = {},
) {
  setViewport(width);
  const store = makeRulesStore(role, user);
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={!nav}>
          {nav ? <Navbar /> : null}
          {sidebarItem ? <WorkNavItem /> : null}
          <Routes>
            <Route
              path="/work/*"
              element={
                <>
                  <WorkRoutes />
                  <Where />
                </>
              }
            />
            <Route path="*" element={<Where />} />
          </Routes>
          <TaskPanelHost />
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features/work src/components/work src/components/layout src/layouts src/pages/work --maxWorkers=2`
Expected: PASS. If an existing Sidebar or Navbar test now counts every fetch the component makes, filter its count by path (`calls(spy, 'GET', '/brain/waiting/count/')`): the Work item adds one `GET /work/today/` per read.

- [ ] **Step 8: Commit**

```bash
git add src/features/work/workTabs.ts src/features/work/workTabs.test.ts src/components/layout/WorkTabs.tsx src/components/work/useTeamAccess.ts \
  src/components/work/useWorkCount.ts src/components/work/useWorkCount.test.tsx src/pages/work/WorkRoutes.tsx src/pages/work/WorkRoutes.test.tsx \
  src/pages/work/testPages.tsx src/App.tsx src/components/layout/Navbar.tsx src/components/layout/Navbar.test.tsx src/layouts/DashboardLayout.tsx \
  src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx
git commit -m "$(cat <<'EOF'
feat(work): the Work section, its bar and the sidebar badge

/work/today and /work/team under a framed "Work" bar (Team for readers
with reports, view-all or Leadership), and a sidebar item whose badge
counts my overdue tasks.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Opening the panel from Brain, a record's story and the bell

**Files:**
- Modify: `src/components/brain/WaitingRow.tsx` (`TaskBody`), `src/features/brain/waitingText.ts` (delete `taskPath`), `src/pages/brain/Waiting.tsx`, `src/components/organizations/detail/StoryItemRow.tsx`, `src/components/organizations/detail/useDetailPage.ts`, `src/features/notifications/types.ts`, `src/components/layout/NotificationKindIcon.tsx`
- Test: `src/components/brain/WaitingRow.test.tsx:231-238`, `src/features/brain/waitingText.test.ts:14,128`, `src/components/organizations/detail/StoryItemRow.test.tsx` (add a case), `src/components/organizations/detail/useDetailVersions.test.tsx` (create), `src/components/layout/NotificationKindIcon.test.tsx` (add a case), `src/components/layout/Navbar.test.tsx` (add a bell case and a route)

**Interfaces:**
- Consumes: `useTaskLink`, `taskChanged`, `useTaskChanges` (Task 1); `stubWork` (Task 2).
- Produces: Waiting on you's Open task, a story task's title and a `task_assigned` notification all lead to `?task=<id>`; `NotificationKind` includes `'task_assigned'`; `useDetailVersions` bumps `storyVersion` on `taskChanged()`.

- [ ] **Step 1: Write the failing tests**

In `src/components/brain/WaitingRow.test.tsx`, replace the overdue-task case with:

```tsx
  it('an overdue task: its record, due date and priority, and Open task opens the task panel here', () => {
    stubBrain();
    const { row, meta } = renderRow(CARL_OVERDUE);
    expect(meta).toHaveTextContent('Overdue task · 3 days · Waiting on Carl CSM');
    expect(within(row).getByRole('link', { name: 'Uber EMEA' })).toHaveAttribute('href', '/accounts/9');
    expect(row).toHaveTextContent('Due 2 Oct 2026 · high priority');
    expect(within(row).getByRole('link', { name: 'Open task' })).toHaveAttribute('href', '/brain/waiting?task=51');
  });
```

In `src/features/brain/waitingText.test.ts`, delete `taskPath,` from the import list and the line `expect(taskPath(TASK.record)).toBe('/accounts/9?group=tasks&source=task');`.

In `src/components/organizations/detail/StoryItemRow.test.tsx`, add:

```tsx
describe('StoryItemRow: a task opens the task panel (Work spec §1.5)', () => {
  const task = STORY_ITEMS.find((item) => item.kind === 'task')!;

  it('links its title to ?task=<id> on the page it is on, keeping the filters', () => {
    render(
      <MemoryRouter initialEntries={['/organizations/7?group=tasks&source=task']}>
        <ul>
          <StoryItemRow item={{ ...task, plan: null, milestone: null }} onOpenEmail={() => {}} />
        </ul>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: task.title })).toHaveAttribute('href', `/organizations/7?group=tasks&source=task&task=${task.id}`);
  });
});
```

Create `src/components/organizations/detail/useDetailVersions.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { taskChanged } from '../../work/taskChanges';
import { useDetailVersions } from './useDetailPage';

describe('useDetailVersions', () => {
  it('reads the story again after a task changes in the panel (Work spec §1.5)', () => {
    const { result } = renderHook(() => useDetailVersions());
    expect(result.current.storyVersion).toBe(0);
    act(() => taskChanged());
    expect(result.current.storyVersion).toBe(1);
  });
});
```

In `src/components/layout/NotificationKindIcon.test.tsx`, add:

```tsx
  it('gives task_assigned the task icon (Work spec §1.3)', () => {
    const { container } = render(<NotificationKindIcon kind="task_assigned" />);
    expect(container.querySelector('[data-kind-icon="task_assigned"]')).toHaveAttribute('aria-hidden', 'true');
  });
```

In `src/components/layout/Navbar.test.tsx`, add `<Route path="/work/today" element={<SegmentMarker />} />` to `renderNavbar`'s `<Routes>`, a fixture next to `planTasks`:

```tsx
// Work spec §1.3: a task given to someone, opening the task panel.
const taskAssigned: Notification = {
  ...planStarted,
  id: 8,
  kind: 'task_assigned',
  message: 'Mona Manager assigned you “Prep the QBR” on Pizza Hut.',
  link: '/work/today?task=41',
  actor: { id: 2, name: 'Mona Manager' },
};
```

and, inside `describe('Navbar notification bell', …)`:

```tsx
  it('opens the task panel from a task_assigned notification, with its icon', async () => {
    stubWork();
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [taskAssigned]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector('[data-kind-icon="task_assigned"]')).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByText('Mona Manager assigned you “Prep the QBR” on Pizza Hut.'));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(8);
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/work/today?task=41');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/brain/WaitingRow.test.tsx src/features/brain/waitingText.test.ts src/components/organizations/detail/StoryItemRow.test.tsx src/components/organizations/detail/useDetailVersions.test.tsx src/components/layout --maxWorkers=2`
Expected: FAIL: Open task still links to the story; the story title is not a link; `storyVersion` stays 0; `task_assigned` is not a `NotificationKind` (a type error the test run reports as no icon).

- [ ] **Step 3: Brain › Waiting on you opens the panel**

In `src/components/brain/WaitingRow.tsx`, remove `taskPath,` from the `waitingText` import, add `import { useTaskLink } from '../work/useTaskLink';`, and replace `TaskBody` with:

```tsx
function TaskBody({ item }: { item: OverdueTaskItem }) {
  // Work spec §1.5: Open task opens the task panel over this page.
  const taskLink = useTaskLink();
  return (
    <>
      <p className={NOTE}>
        Due <span className={MONO}>{formatDate(item.detail.due_date)}</span> · {item.detail.priority} priority
      </p>
      {item.can_decide ? (
        <Link to={taskLink(item.id)} className={`${BUTTON} self-start`}>
          {WAIT.OPEN_TASK}
        </Link>
      ) : (
        <p className={NOTE}>{notYoursText(item)}</p>
      )}
    </>
  );
}
```

In `src/features/brain/waitingText.ts`, delete `taskPath` and its doc comment (`/** The record's story, filtered to its tasks (Contract note 5). */`).

In `src/pages/brain/Waiting.tsx`, add `import { useTaskChanges } from '../../components/work/taskChanges';` and, right after `const waiting = useWaiting(scope, brain.refused);`:

```tsx
  // A task changed in the panel (Work spec §1.5): the desk reads again.
  useTaskChanges(waiting.retry);
```

- [ ] **Step 4: A story task's title opens the panel; the story reads again**

In `src/components/organizations/detail/StoryItemRow.tsx`, add `import { useTaskLink } from '../../work/useTaskLink';`, add this component above `StoryItemRow`:

```tsx
/** A task's title opens the task panel over this page (Work spec §1.5).
 *  Its own component, so rows of other kinds need no router. */
function TaskTitle({ id, title, className }: { id: number; title: string; className: string }) {
  const taskLink = useTaskLink();
  return (
    <Link to={taskLink(id)} className={className}>
      {title}
    </Link>
  );
}
```

and make the title's first branch the task:

```tsx
          <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
            {item.kind === 'task' ? (
              <TaskTitle id={item.id} title={item.title} className={titleButton} />
            ) : threaded ? (
```

(the rest of the chain is unchanged).

In `src/components/organizations/detail/useDetailPage.ts`, add `import { useTaskChanges } from '../../work/taskChanges';` and, inside `useDetailVersions`, after `reloadStory` is defined:

```ts
  // A task changed in the panel (Work spec §1.5): the story reads again.
  useTaskChanges(reloadStory);
```

- [ ] **Step 5: The bell knows `task_assigned`**

In `src/features/notifications/types.ts`, add to `NotificationKind` after `'campaign_sent'`:

```ts
  // "<who> assigned you “<title>” on <record>." for the person given a task
  // by someone else, a rule or the AI agent, or by a reassignment; links to
  // /work/today?task=<id> (Work spec §1.3).
  | 'task_assigned';
```

(move the closing `;` from `'campaign_sent'` to the new line).

In `src/components/layout/NotificationKindIcon.tsx`, import `SquareCheck` from `lucide-react` and add `task_assigned: SquareCheck,` to `ICONS`; update its comment to "(plans spec §2.5, campaigns spec §2.5, Work spec §1.3)".

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/brain src/features/brain src/pages/brain src/components/organizations/detail src/components/layout src/e2e/brain.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/brain/WaitingRow.tsx src/components/brain/WaitingRow.test.tsx src/features/brain/waitingText.ts src/features/brain/waitingText.test.ts \
  src/pages/brain/Waiting.tsx src/components/organizations/detail/StoryItemRow.tsx src/components/organizations/detail/StoryItemRow.test.tsx \
  src/components/organizations/detail/useDetailPage.ts src/components/organizations/detail/useDetailVersions.test.tsx \
  src/features/notifications/types.ts src/components/layout/NotificationKindIcon.tsx src/components/layout/NotificationKindIcon.test.tsx \
  src/components/layout/Navbar.test.tsx
git commit -m "$(cat <<'EOF'
feat(work): open the task panel from Brain, a record's story and the bell

Waiting on you's Open task, a task's title in any story and a
task_assigned notification open the same panel; the desk and the story
read again after a change.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: House rules, the journeys, the product docs, and the full check

**Files:**
- Create: `src/components/work/houseRules.test.ts`, `src/e2e/work.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`

**Interfaces:**
- Consumes: everything above; `houseRuleSuite`, `rowsIconsTargetsSuite` (`src/test/houseRules.ts`); `renderWork`, `where` (Task 10).
- Produces: nothing new for code; the docs describe delivery 1.

- [ ] **Step 1: Write the house-rules suite** `src/components/work/houseRules.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { houseRuleSuite, rowsIconsTargetsSuite } from '../../test/houseRules';

// The house rules (revenact-design §4) over every Work component, the three
// Work pages and the Work bar.
const raw = (files: Record<string, unknown>) => files as Record<string, string>;
const files = {
  ...raw(import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' })),
  ...raw(
    import.meta.glob(['../../pages/work/Today.tsx', '../../pages/work/Team.tsx', '../../pages/work/WorkRoutes.tsx'], {
      query: '?raw',
      eager: true,
      import: 'default',
    }),
  ),
  ...raw(import.meta.glob('../layout/WorkTabs.tsx', { query: '?raw', eager: true, import: 'default' })),
};
// Every file in the three Work folders, tests included, for the copy rule.
const everything = {
  ...files,
  ...raw(import.meta.glob(['./*.ts', '../../features/work/*.ts', '../../pages/work/*.tsx'], { query: '?raw', eager: true, import: 'default' })),
};
const sources = Object.entries(files).filter(([file]) => !file.includes('.test.'));
const PAGES = ['../../pages/work/Today.tsx', '../../pages/work/Team.tsx'];

houseRuleSuite('work house rules', files);
rowsIconsTargetsSuite('work rows, icons and targets', files);

describe('work: coverage, figures, states, cards, copy', () => {
  it('covers the pages, the bar and every component', () => {
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        ...PAGES,
        '../../pages/work/WorkRoutes.tsx',
        '../layout/WorkTabs.tsx',
        './TaskPanelHost.tsx',
        './TaskSheet.tsx',
        './TaskPanel.tsx',
        './TaskFields.tsx',
        './TaskFacts.tsx',
        './TaskValue.tsx',
        './ActivityTrail.tsx',
        './CommentBox.tsx',
        './AssigneeSelect.tsx',
        './TaskRowItem.tsx',
        './TodayGroups.tsx',
        './TodaySkeleton.tsx',
        './NewTaskSheet.tsx',
        './TeamRow.tsx',
        './TeamSkeleton.tsx',
        './TaskPanelSkeleton.tsx',
        './WorkFrame.tsx',
      ]),
    );
  });

  it('uses at most four type sizes across the section', () => {
    const sizes = new Set(sources.flatMap(([, s]) => [...s.matchAll(/text-\[(\d+)px\]/g)].map((m) => m[1])));
    expect(sizes.size).toBeLessThanOrEqual(4);
  });

  it('sets every figure in DM Mono with tabular-nums', () => {
    for (const file of ['./TaskRowItem.tsx', './TeamRow.tsx', './TaskFacts.tsx', './ActivityTrail.tsx', './TodayGroups.tsx', './TaskValue.tsx']) {
      expect(files[file], file).toMatch(/\bMONO\b/);
    }
  });

  it('designs loading, empty and error states', () => {
    expect(files['../../pages/work/Today.tsx']).toMatch(/<TodaySkeleton \/>/);
    expect(files['../../pages/work/Today.tsx']).toMatch(/<ErrorBlock /);
    expect(files['../../pages/work/Today.tsx']).toMatch(/<EmptyState /);
    expect(files['../../pages/work/Team.tsx']).toMatch(/<TeamSkeleton \/>/);
    expect(files['../../pages/work/Team.tsx']).toMatch(/<ErrorBlock /);
    expect(files['../../pages/work/Team.tsx']).toMatch(/<EmptyState /);
    expect(files['./TeamRow.tsx']).toMatch(/NO_DRILL/);
    expect(files['./TeamRow.tsx']).toMatch(/TRY_AGAIN/);
    expect(files['./TaskSheet.tsx']).toMatch(/<TaskPanelSkeleton \/>/);
    expect(files['./TaskSheet.tsx']).toMatch(/<ErrorBlock /);
    expect(files['./TaskSheet.tsx']).toMatch(/NO_TASK/);
    for (const file of ['./TodaySkeleton.tsx', './TeamSkeleton.tsx', './TaskPanelSkeleton.tsx', './TeamRow.tsx']) expect(files[file], file).toMatch(/animate-pulse/);
  });

  it('nests no card in a card: rows are flat inside one bordered list', () => {
    for (const file of ['./TaskRowItem.tsx', './TeamRow.tsx']) expect(files[file], file).not.toMatch(/rounded-(lg|xl)|border border-line|shadow/);
    expect(files['./TodayGroups.tsx']).toMatch(/className=\{LIST\}/);
    expect(files['../../pages/work/Team.tsx']).toMatch(/className=\{LIST\}/);
  });

  it('keeps one primary: Today’s New task', () => {
    expect(files['../../pages/work/Today.tsx']).toMatch(/className=\{PRIMARY\}/);
    for (const [file, source] of sources) if (file !== '../../pages/work/Today.tsx') expect(source, file).not.toMatch(/\bPRIMARY\b/);
  });

  it('draws no h1 on a Work page: "Work" in the bar is the title', () => {
    for (const page of PAGES) expect(files[page], page).not.toMatch(/font-display|<h1\b/);
  });

  it('touches no browser storage', () => {
    expect(sources.filter(([, s]) => /localStorage|sessionStorage/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it('writes no em dash anywhere in the Work folders, comments and tests included', () => {
    expect(Object.entries(everything).filter(([, s]) => s.includes('\u2014')).map(([f]) => f)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/components/work/houseRules.test.ts --maxWorkers=2`
Expected: PASS. If a rule fails, fix the named file (never weaken the suite): a control whose `className` comes from a lower-case variable or an imported constant other than `BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `FILTER_SELECT`, `LINK`, `COLUMN_ICON_BUTTON` needs a local `const` holding `min-h-11` (or `h-11 w-11`).

- [ ] **Step 3: Write the journeys** `src/e2e/work.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { sent, stubWork } from '../features/work/testWork';
import { renderWork, where } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real Navbar, the sidebar's Work
// item, WorkRoutes, the task panel host and the router. Only fetch is
// stubbed, by the stateful Work stub (contract 2026-10-07-work-tasks-api.md).
// Spec §1.5 and §6: open Today, open a task, change its status, comment,
// see the activity; Done leaves the badge; a manager reassigns from Team.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Work: a member works their day', () => {
  it('opens Today, opens a task, blocks it with a reason, comments, reads the activity, and the badge drops', { timeout: 30000 }, async () => {
    const { spy } = stubWork();
    renderWork('/work/today', { nav: true, sidebarItem: true, role: 'csm' });

    // 1. Today under the Work bar; the badge counts my one overdue task.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Work']);
    expect(await screen.findByRole('link', { name: 'Work, 1 overdue' })).toHaveAttribute('href', '/work/today');
    const overdue = await screen.findByRole('region', { name: 'Overdue 1' });

    // 2. The task opens in the panel, over Today.
    await userEvent.click(within(overdue).getByRole('link', { name: 'Call Pizza Hut' }));
    await waitFor(() => expect(where()).toBe('/work/today?task=41'));
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });

    // 3. Blocked, with what it is blocked on.
    await userEvent.selectOptions(await within(panel).findByLabelText('Status'), 'blocked');
    await userEvent.type(within(panel).getByLabelText('Blocked on'), 'Waiting on the contract');
    await userEvent.click(within(panel).getByRole('button', { name: 'Mark blocked' }));
    await within(panel).findByText('You marked it blocked: Waiting on the contract');

    // 4. A comment.
    await userEvent.type(within(panel).getByLabelText('Add a comment'), 'Legal promised Friday.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Comment' }));

    // 5. The activity, in sentences, oldest first.
    const trail = within(panel).getByRole('list', { name: 'Activity' });
    await waitFor(() =>
      expect(within(trail).getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)).toEqual([
        'Mona Manager created this task for you.',
        'You marked it blocked: Waiting on the contract',
        'You commented',
      ]),
    );
    expect(trail).toHaveTextContent('Legal promised Friday.');

    // 6. Close: Today has read again. Blocked is never overdue, so the badge goes.
    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(where()).toBe('/work/today'));
    expect(await screen.findByRole('region', { name: 'Blocked 2' })).toHaveTextContent('Blocked: Waiting on the contract');
    expect(screen.queryByRole('region', { name: /^Overdue/ })).toBeNull();
    expect(await screen.findByRole('link', { name: 'Work' })).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/41/')).toEqual([{ status: 'blocked', blocked_reason: 'Waiting on the contract' }]);
  });

  it('marks the overdue task done from Today, and it leaves the badge', { timeout: 30000 }, async () => {
    const { spy } = stubWork();
    renderWork('/work/today', { nav: true, sidebarItem: true, role: 'csm' });
    await screen.findByRole('link', { name: 'Work, 1 overdue' });
    await userEvent.click(await screen.findByRole('button', { name: 'Mark “Call Pizza Hut” done' }));
    expect(await screen.findByText('Done: Call Pizza Hut.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Work' })).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/')).toEqual([{ status: 'completed' }]);
  });
});

describe('Work: a manager reads the team', () => {
  it('opens Team, opens a report’s row, reassigns their overdue task, and the counts follow', { timeout: 30000 }, async () => {
    const { spy } = stubWork({ offered: ['me', 'team'], teamHidden: { team: 2 } });
    renderWork('/work/today', { nav: true, role: 'csm' });

    await userEvent.click(await within(screen.getByRole('navigation', { name: 'Work' })).findByRole('link', { name: 'Team' }));
    await waitFor(() => expect(where()).toBe('/work/team?scope=team'));
    expect(await screen.findByText("2 tasks you can't open")).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: /^Carl CSM: 1 open, 1 overdue/ }));
    await userEvent.click(await screen.findByRole('link', { name: 'Chase the exec sponsor' }));
    const panel = await screen.findByRole('dialog', { name: 'Chase the exec sponsor' });
    expect(await within(panel).findByRole('option', { name: "Dana CSM · Can't open this organization" })).toBeDisabled();
    await userEvent.selectOptions(within(panel).getByLabelText('Assignee'), '2');
    expect(await within(panel).findByText('You assigned it to Mona Manager (was Carl CSM).')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('button', { name: /^Carl CSM: 0 open/ })).toBeInTheDocument();
    expect(await screen.findByText('No open tasks you can see.')).toBeInTheDocument();
    expect(sent(spy, 'PATCH', '/tasks/46/')).toEqual([{ assignee_id: 2 }]);
  });
});

describe('Work at phone width', () => {
  it('opens the panel as a bottom sheet, with 44px controls', async () => {
    stubWork();
    renderWork('/work/today?task=41', { width: 375, nav: true });
    const panel = await screen.findByRole('dialog', { name: 'Call Pizza Hut' });
    expect(panel.closest('[data-shape]')).toHaveAttribute('data-shape', 'sheet');
    expect(within(panel).getByLabelText('Title')).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'New task', hidden: true })).toHaveClass('min-h-11');
  });
});
```

- [ ] **Step 4: Run the journeys**

Run: `npx vitest run src/e2e/work.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Update `docs/03-ui-ux-design.md`**

Insert this section immediately before `### Settings: the frame`:

```markdown
### Work: Today, Team and the task panel

Spec `docs/superpowers/specs/2026-10-07-work-round-design.md` §1.5. Folders
`src/components/work/`, `src/pages/work/`, `src/features/work/`, with their
own house-rules suite (`components/work/houseRules.test.ts`, no em dash in
any of the three folders).

- **The bar.** Every `/work*` route wears the framed bar: "Work" as its
  only h1, then Today and, for readers with reports, `view_all_accounts` or
  the Leadership function, Team, as underline tabs class for class the
  Brain's. Team's Me / My team / Company switch portals into the bar's
  actions slot from `sm` (inline below it), exactly as on Brain.
- **The sidebar.** One Work item (Lucide `ListTodo`) after Dashboard, lit on
  every Work route, with my overdue count as its badge and in its name
  ("Work, 2 overdue").
- **Today.** `WorkFrame` (full width, `px-4 pb-6`). A toolbar row with the
  status line and the page's one primary, New task. Then the groups
  Overdue, Due today, This week, Later and Blocked, each an 11px uppercase
  heading with its count in DM Mono over one bordered `LIST`; empty groups
  are not drawn. A row is flat: a 44px circle (36px from `sm`) for quick
  Done, the title (a link that opens the panel), then a meta line in 11px:
  the record (a link), "Due 5 Oct 2026" (DM Mono), "Overdue" in
  `text-danger` beside its word, the priority, "In progress", the source
  ("From Onboarding · Pizza Hut", "From a rule"). A Blocked row shows
  "Blocked:" in `text-warning` and its reason. "N tasks on records you
  can't open" sits under the list. States: a skeleton of two groups, Try
  again, "Nothing on your list".
- **New task.** The Sheet: the record search (`RecordStep`, headed
  "Record"), then the existing task form, whose Assignee lists the record's
  people and disables those who can't open it ("Dana CSM · Can't open this
  organization"). The same picker is on the organisation page's + Add.
- **Team.** One row per person in one `LIST`: a chevron, the name
  ("Unassigned (was X)" for a deactivated person), then "5 open · 1
  overdue · 1 blocked" with the figures in DM Mono and the overdue count in
  `text-danger` when above zero, and "Oldest due 3 Oct 2026" under it. The
  row is a button (`aria-expanded`, its name the counts in words) that
  opens that person's open tasks below it, flat, with the same rows minus
  Done. "N tasks you can't open" under the list. States: a skeleton, Try
  again (page and row), "No open tasks you can see."
- **The task panel.** The organisation page's `Sheet` at `?task=<id>` on any
  route: a panel from `sm`, a bottom sheet below. Title (saved on Enter or
  blur), then Status, Assignee, Due and Priority in two columns, Blocked's
  "Blocked on" input with Mark blocked / Save reason and Cancel, then the
  Description with Save description. Labels above (11px uppercase), errors
  below. A field the reader may not change is plain text. Then the record,
  plan or source and "Created 1 Oct 2026 by Mona Manager", and Activity:
  the trail in sentences ("You marked it blocked: Waiting on legal"), a
  comment's words under a left rule, relative times in DM Mono, and the
  comment box with its quiet bordered Comment button. States: a skeleton,
  Try again, "This task isn't there, or you can't open it."
- **The bell.** `task_assigned` gets Lucide `SquareCheck`.
```

Replace, in "### Brain: Waiting on you", `an overdue task's due date and Open task.` with `an overdue task's due date and Open task (it opens the task panel over the page).`

- [ ] **Step 6: Update `docs/04-app-flow.md`**

In the route table, insert before the `/brain` row:

```markdown
| `/work`, `/work/*` | `WorkRoutes` (`pages/work/`): `/work` and anything unknown under it redirect to `/work/today` | auth |
| `/work/today` | `TodayPage`: my open tasks from `GET /work/today/`, grouped overdue / today / week / later / blocked, quick Done (`PATCH /tasks/<id>/ {status:"completed"}`), New task (`POST /customers/<id>/tasks/` or `/accounts/<id>/tasks/`), the hidden count | auth |
| `/work/team` | `TeamPage`: `GET /work/team/?scope=` on Brain's scopes and remembered choice; a row opens `GET /work/tasks/?assignee=<id>&state=open`. The tab shows for readers with reports, `view_all_accounts` or the Leadership function | auth |
| `?task=<id>` on any route | `TaskPanelHost` (mounted once in `DashboardLayout`): the task panel, `GET /tasks/<id>/`, `PATCH /tasks/<id>/`, `POST /tasks/<id>/comments/`, `GET /work/assignees/?customer=` or `?account=`; closing drops only `task` | auth |
```

In "### Navigation surfaces", replace `Sections: top (Copilot, Dashboard, then the Communications group` with `Sections: top (Copilot, Dashboard, Work (to `/work/today`, lit on every `/work*` route, with my overdue count as its badge, "Work, 2 overdue"), then the Communications group`.

In "### 4.11 Brain", replace `Open task opens the record's story filtered to tasks.` with `Open task opens the task panel over the page (`?task=<id>`), and the desk reads again after any change there.`

Insert this section immediately before `### 4.12 Builders`:

```markdown
### 4.11b Work (Today, Team and the task panel)

Spec 2026-10-07 Work round §1.5; contract
`revenact-backend docs/superpowers/plans/2026-10-07-work-tasks-api.md`.

- **Today** (`/work/today`) reads `GET /work/today/`: my open tasks on
  records I can open, grouped overdue (past due and not Blocked), today,
  week (the next seven days), later and blocked, at most 100 rows a group
  with full `counts`; `hidden` says how many are on records I can no longer
  open. The circle on a row sends `PATCH /tasks/<id>/ {status:"completed"}`
  once; on success the row leaves and "Done: <title>." is announced; a
  refusal stays under the row. New task opens a sheet: pick an
  organisation or account (`GET /customers/?search=`, `/accounts/?search=`),
  then title, due date, priority and assignee from `GET
  /work/assignees/?customer=|account=` (people who can't open the record
  are disabled); it posts to the record's nested `tasks/` route
  (`assignee_id` null means me) and a `400 ASSIGNEE_CANNOT_OPEN` stays in
  the sheet with the server's sentence.
- **Team** (`/work/team`) uses Brain's `GET /brain/scopes/`, `?scope=` and
  the remembered choice (`useBrainScope`; a refused scope drops back with
  "You no longer have access to that view."). `GET /work/team/?scope=`
  gives one row per person (every active person in the scope, a
  deactivated one only while they hold readable open tasks, as
  "Unassigned (was X)"), ordered by overdue, then open, then name, and
  `hidden` ("N tasks you can't open"). Readers with `view_all_accounts` or
  the Leadership function read every task on records they can open, so
  Company shows real counts for them. A row opens `GET
  /work/tasks/?assignee=<id>&state=open`.
- **The task panel** opens wherever the URL carries `?task=<id>` (a row's
  title, Brain › Waiting on you's Open task, a task's title in an
  organisation's or account's story, the bell's `task_assigned` link
  `/work/today?task=<id>`). `GET /tasks/<id>/` gives the task, its
  `editable` fields and its `events`; a 404 reads "This task isn't there,
  or you can't open it." Each field saves on its own through `PATCH
  /tasks/<id>/` and the answer replaces the panel, trail included: title on
  Enter or blur, status, assignee, due date and priority on change,
  description and the Blocked reason from their buttons. Choosing Blocked
  asks "Blocked on" first; a blank reason is refused in place. A field
  outside `editable` (a plan task for someone who doesn't edit the plan) is
  text. Refusals sit under their field (`ASSIGNEE_CANNOT_OPEN` under
  Assignee) or on the form (403, `non_field_errors`). `POST
  /tasks/<id>/comments/ {body}` adds a comment to the trail.
- **After any change** in the panel or a quick Done, `taskChanged()` tells
  every mounted reader to read again: Today, Team and its open rows, the
  sidebar badge (`GET /work/today/` `counts.overdue`, also read on every
  route change), Brain's desk and badge, and the open record's story.
```

Replace, in "## 6. Redux map", `` `useKept`, `useWaiting`, `useWaitingCount`, `useDoing`), no slice.`` with `` `useKept`, `useWaiting`, `useWaitingCount`, `useDoing`), no slice. Work (`/work/*`) and the task panel do the same (`useToday`, `useScopedRead`, `useDrill`, `useTask`, `useAssignees`, `useWorkCount`). ``

- [ ] **Step 7: Run everything**

Run: `npx vitest run --maxWorkers=2`
Expected: PASS, every file.

Run: `npm run lint`
Expected: exit 0 (warnings the repo already had are fine; no new errors).

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/work/houseRules.test.ts src/e2e/work.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md
git commit -m "$(cat <<'EOF'
test(work): house rules and journeys; docs for Work delivery 1

The house rules over every Work file, the journeys (Today to a blocked,
commented task; Done leaving the badge; a manager reassigning from
Team; the phone sheet), and the UI/UX and app-flow docs.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage (§1.5, with §4, §5, §6 for delivery 1):**

| Requirement | Task |
|---|---|
| Sidebar Work item with a badge counting my overdue tasks, shaped for recommendations | 10 (`WorkNavItem`, `useWorkCount`, Decision 9) |
| `/work/today`: grouped lists, Blocked rows show their reason | 7 |
| A quick Done on each row | 7 |
| New task (record, title, due date, assignee) | 8 (with Task 3's picker) |
| `/work/team`: shown to people with reports or `view_all_accounts` (and Leadership, owner's decision) | 10 (`useTeamAccess`) |
| Me / My team / Company switch, as in Brain | 9 |
| One row per person with counts, overdue highlighted; a row expands into their tasks | 9 |
| "N tasks you can't open" | 9 (Team), 7 (Today's hidden) |
| Task panel at `?task=<id>` on any route | 4 |
| Editable title and description; status incl. Blocked with reason; assignee picker with disabled "Can't open" people; due date and priority | 5 (picker: 3) |
| Comments | 6 |
| Activity trail in plain sentences | 1 (`eventSentence`), 4 |
| The organisation page's Tasks tab and Brain › Waiting on you open the same panel | 11 |
| The old mock `features/tasks/tasksSlice` is left alone | Global Constraints |
| Bell: `task_assigned` icon, opening the panel | 11 |
| §4 counted, never named; twice-filter shown as the API returns | 7, 9 (hidden lines); Global Constraints |
| §5 deactivated assignee "Unassigned (was X)" | 1 (`personName`), 9 |
| §5 reassign: the trail shows the change | 5 |
| §6 Today and Team: loading, empty, error, hidden states; the panel's every edit, Blocked, the disabled people, comments, trail; the badge; the bell; phone width; an end-to-end journey | 4–12 |
| Docs | 12 |

**Placeholder scan:** no TBD/TODO; every code step carries its code; every test step its test.

**Type consistency:** `TaskRow`, `TaskDetail`, `TaskEvent`, `TodayPayload`, `TeamPayload`, `TeamPerson`, `AssigneeOption`, `PickerOption`, `Refusal` are defined in Tasks 1 and 3 and used with the same field names after; `TaskPanel` grows `onReplace` (Task 5) and `onAppend` (Task 6) and `TaskSheet` passes both by then; `renderPage` (Task 4) and `renderWork` (Task 10) share `testPages.tsx`; `useTaskChanges`/`taskChanged` are the one bus everywhere.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-07-work-tasks-frontend.md`. Two execution options:

1. **Subagent-Driven (recommended)**: a fresh subagent per task, a review between tasks.
2. **Inline Execution**: execute the tasks in one session with executing-plans, in batches with checkpoints.

Merge order: the backend PR for delivery 1 merges first (the frontend reads its routes).
