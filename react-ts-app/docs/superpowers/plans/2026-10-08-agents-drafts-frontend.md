# Agents, delivery 2 ("drafts and plans"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People see, decide, open, send and undo the two delivery 2 agent kinds. This covers:
- `draft.reply` and `plan.start` in the agents' types, words, Activity, Recommended and Waiting;
- a reply-draft panel on Communications (`/communications?draft=<id>`) with Save, Send, Copy and open, Mark as sent and Discard;
- the mailbox Drafts folder's "From your agents" list, and the queue's "Open draft" line;
- the bell's `agent_draft_ready`;
- Plans' new Draft status: list, board, a record's plans, and a Draft plan page with Start plan;
- delivery 1's follow-up: a task preview links its task only when its id is a number.

**Architecture:**
- **`features/agents`** gains the two kinds in `agentTypes.ts` and `agentsText.ts`, and a reply-drafts data layer: `draftTypes.ts` (the contract's `ReplyDraft`), `draftsApi.ts` (`/communications/drafts/*`), `draftsText.ts` (words and links, no React) and a stateful stub `testDrafts.ts`.
- **`components/agents`** gains:
  - `DraftForm`: the owner's editor (email: Subject, Reply, Send, Save, Discard; ticket: Reply, Copy and open, Mark as sent, Save, Discard);
  - `DraftPanel` and `DraftRoute`: the draft read by id, with loading, missing, error, read-only and discarded states;
  - `DraftLine`: the queue's "Open draft" line;
  - `AgentDraftsList`: Mailbox › Drafts "From your agents".
  All four sit under the agents house-rules suite.
- **Communications:** `CommunicationsPage` swaps its inbox (or mailbox) card for `DraftRoute` while `?draft=<id>` is set (Decision 1). `DetailPane` shows `DraftLine` when `row.draft` is set. `MailboxView` mounts `AgentDraftsList` in the Drafts folder.
- **Plans:** `PlanStatus` gains `draft`; chips, filters, the list, the board (behind Show drafts), a record's plans and the plan page learn it. A new `DraftPlanBanner` holds Start plan (`POST /plans/<id>/start/`). `PlanHeader` says "Started by the CS agent".
- No Redux slice: every read goes through a hook or a component's own effect, as delivery 1 does.

**Tech Stack:**
- React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`);
- react-router 7 and Tailwind v4 tokens;
- Vitest and Testing Library (jsdom), `@testing-library/user-event` 14;
- lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-08-agents-round-design.md` §2 (as amended by the contract's "Owner decisions"), §1 for the shared behaviour, §6 for testing.

**API contract (binding):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/agents2-be/docs/superpowers/plans/2026-10-08-agents-drafts-api.md`. It wins on shapes, messages and codes. Delivery 1's contract (`docs/superpowers/plans/2026-10-08-agents-actions-api.md` in revenact-backend) still holds where this one is silent.

**House style and the code this plan extends:** `docs/superpowers/plans/2026-10-08-agents-actions-frontend.md` (delivery 1).

Read the spec section, the contract and this plan before starting.

## Contract questions

These are open with the backend. The plan takes the reading in brackets and never invents a field beyond it.
1. Is `pending_tasks` on every plan payload (`GET /plans/`, a record's plans) or only `GET /plans/<id>/`? [The plan types it on `PlanRow`, like `started_by_agent`, and shows it on list rows and board cards.]
2. Does `GET /plans/` `counts` carry a `draft` key? [Typed optional: the Draft column shows a count only when the server sends one.]
3. What is `ReplyDraft.sent_by` when set? [Typed `PersonRef | null` (`{id, name}`), like `owner`.]
4. `to` is not writable (PATCH and send take `body` and `subject` only). [The UI shows To as text and offers no recipient edit.]

## Global Constraints

- **Worktree and branch.**
  - Work in the delivery 2 frontend worktree and branch the controller names, based on `main` after delivery 1 merged (identical to `feat/agents-actions` at `4be4af4`).
  - `node_modules` is a symlink: never commit it.
  - Always `git add <explicit paths>`, never `git add -A` or `git add .`.
- **Never run prettier. Never use `git stash`.** The stash stack is shared across worktrees; use a WIP commit if you must set work aside.
- **Commands:** `npx vitest run <path> --maxWorkers=2` for a task; the final check is `npx vitest run --maxWorkers=4`, `npm run lint`, `npm run build`. Run them in the foreground.
- **Every commit message** is a conventional commit and ends with exactly this line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Tests:** Vitest with Testing Library. Fetch is stubbed only through the stub pattern: `vi.stubGlobal('fetch', spy)`, state kept in Maps, every answer a JSON copy, and a `passThrough` to chain stubs (drafts in front of agents in front of work).
- **Server words verbatim.** A refusal is shown as `refusalDetail(err)` first (`features/agents/agentsApi.ts`), then the field errors, then the client fallback. The contract's sentences are used word for word where it gives them.
- **Rights come from the server only:** `can_edit` (a draft, a plan), `undo.allowed` and `undo.reason`, `can_decide`, membership of Recommended. The UI never guesses.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, no `rgb()`, no named Tailwind palette colours in any `.tsx`.
- **Type sizes:** only 11, 13 and 15 (`text-[11px]`, `text-[13px]`, `text-[15px]`) in every Agents, Work, Brain and Plans component, at most four per surface, no named sizes. `CONTROL` (`components/organizations/activity/formStyles.ts`) carries its own 15/13 pair and is allowed.
- **Figures in DM Mono:** counts and dates use `MONO` (`font-mono-brand tabular-nums`); a sentence with figures goes through `Figured` (`src/components/brain/Figured.tsx`).
- **44px targets:** every `<button>`, `<Link>`, `<select>`, `<input>` and `<textarea>` reaches `min-h-11` on phones, directly or through a compliant constant (`BUTTON`, `PRIMARY`, `QUIET`, `FILTER_SELECT`, `INPUT`, `LINK`, or a local `const` holding `min-h-11` or one of those). `className={CONTROL}` alone does not count to the checker, so this plan writes `const FIELD = \`min-h-11 ${CONTROL}\``.
- **One primary per form:** Send (email draft) or Copy and open (ticket draft) in `DraftForm`; Start plan in `DraftPlanBanner`. Save, Mark as sent, Apply, Reject and Undo are `BUTTON` or `QUIET`.
- **Icons:** Lucide only, each with `aria-hidden="true"`. No emoji.
- **States:** every page and list has loading (a skeleton, not a spinner), empty and error (Try again) states.
- **Focus:** a page landing focuses its heading; a finished write moves focus to the status line that says what happened; a refusal moves focus to its alert; a field error focuses its field.
- **No em dash (`—`)** in anything this plan writes under `components/agents`, `features/agents`, `components/work`, `pages/work`, `features/work`, `components/brain`, `features/brain`, `components/plans`, `pages/plans`, `features/plans`, `pages/communications`, `features/communications` or `src/e2e/agents.test.tsx`, comments and tests included; use a colon or a full stop. Older lines that already have one (for example in `features/brain/*` or `communicationsSlice.ts`) are left alone. The agents suite checks every new agents file, tests included.
- **Copy:** sentence case; warnings are `text-ink` with a Lucide icon, never amber text.
- **Out of scope:** the backend; syncing drafts into a provider's Drafts folder; sending ticket replies from Revenact; delivery 3 builder kinds; Copilot session decisions (their `proposals` shape is unchanged); the spec §2 amendment (the controller does it).

## Decisions (where the spec or the contract leaves a choice)

1. **Where the draft opens.** `CommunicationsPage` reads `?draft=<id>`. While it is set, the inbox card (or, on `?source=mailbox:<provider>`, the mailbox card) is replaced by `DraftRoute`: a solid `rounded-xl bg-surface` section labelled "Draft reply". The Copilot rail stays. Why:
   - The link arrives from four places (Activity, the bell, the queue's line, the mailbox list), so the draft cannot depend on a selected queue row or on the mailbox's folder state.
   - Editing and sending needs the card's width, and `DetailPane` is `hidden lg:flex`, so a phone would never see it there.
   - "Back to the inbox" drops only `draft` from the URL, so the reader lands on the same source (the mailbox keeps `?source=`; its folder lives in Redux and is still Drafts).
2. **To is text, not a field** (contract question 4). Subject (email) and Reply are the editable fields.
3. **Primaries.** Email: Send (`PRIMARY`, the form's submit). Ticket: "Copy and open in <source_name>" (`PRIMARY`), because copying into the source system is the step the person takes; Mark as sent is a `BUTTON`. Save is a `BUTTON` (disabled until something changed); Discard is `QUIET` and asks first (`ConfirmDialog`, danger).
4. **Send and Mark as sent carry edits.** Send posts only the changed fields (`{body}` and or `{subject}`), which the server saves first. Mark as sent saves an edited reply (`PATCH`) before `mark-sent/`, so the record holds what was posted.
5. **Copy and open.** The clipboard write starts inside the click, then the source's `external_url` opens in a new tab (`noopener,noreferrer`). With no `external_url` or `source_name` (a ticket raised in Revenact) the button reads "Copy the reply" and opens nothing. A failed copy says "Could not copy the reply. Select it and copy it yourself."
6. **Focus after a write.** `DraftPanel` keeps one always-mounted `role="status"` line under Back:
   - Send and Mark as sent: the draft re-renders read-only ("Sent on 8 Oct 2026 by Alice.") and the status line says "Sent to Ann Lee <ann@x.com>." or "Marked as sent.", and takes focus.
   - Discard: the panel body goes, the status line says "Discarded the draft." and takes focus; Back to the inbox stays below it.
   - Save: "Saved." without moving focus. Copy: "Copied the reply." without moving focus.
   - `ALREADY_SENT` or `NOT_YOURS`: the server's sentence goes to the status line (focused) and the draft is read again quietly, so it shows as sent or read-only.
   - Any other refusal stays in the form's alert (focused); field errors sit under their field, and the first one takes focus.
7. **Read-only.** When `can_edit` is false or `status` is `sent`, the panel shows To, Subject and Reply as text with "Only Carl CSM can change or send this draft." or the sent line. The UI never guesses ownership.
8. **"Open draft" in Activity** shows only while the action is `applied` (undo deletes the draft). "Open plan" shows whenever `result.plan_id` is set (an undone plan returns to Draft and still exists).
9. **The draft preview** reads "Draft a reply to Ann Lee <ann@x.com>: Re: Renewal terms" (email) or "Draft a reply on TKT-1042: Export fails" (ticket), with the excerpt below it in a quiet `blockquote`. A plan reads "Start a plan: Onboarding, 3 milestones, 9 tasks".
10. **Mailbox › Drafts** shows "From your agents" (`GET /communications/drafts/?channel=email`) above the provider's drafts, which get an "In your mailbox" heading. Each row links to the same URL with `draft=<id>` added.
11. **Plans: Draft is never open.** It is its own status with a pill ("Draft", Lucide `PencilLine`, `bg-info-dim text-info`).
    - **List:** the Status filter gains Draft (`status=draft`), and All asks for `open`, `draft`, `done` and `cancelled`.
    - **Board:** a "Show drafts" toggle (`?drafts=1`, like Show cancelled) adds a Draft column first. Draft cards are not draggable and have no status menu; dropping on Draft is refused with "Start a draft plan with Start plan."
    - **Rows and cards** of a Draft show "9 tasks to start" in place of the next due date.
    - **A record's plans** list drafts as their own "Draft plans" list between Open and Finished.
12. **A Draft plan's page:** a banner "This plan is a draft: Start plan creates its 9 tasks, due from today." with Start plan for editors (`can_edit`), else "Only the plan's owner or their managers can start it."
    - Edit (milestones, name) and Delete keep working; Cancel plan, the Status select, Add task and the milestone Done checks stay for open plans.
    - Success replaces the plan and says "Started the plan." in a focused status line.
    - `NOT_DRAFT` shows the server's sentence; `PLAN_OPEN` shows it with "Open that plan" linking `/projects/<plan_id>`.
13. **"Started by the CS agent"** replaces the rule line on a plan whose `started_by_agent` is set.
14. **The bell's `agent_draft_ready`** gets Lucide `FilePen`; its link `/communications?draft=<id>` is a normal route link.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/features/agents/agentTypes.ts` | modify | Two kinds, `ActionPreview.draft` and `.plan`, nullable `task.id`, `result.draft_id` and `.plan_id` |
| `src/features/agents/agentsText.ts` | modify | `KIND_LABEL`, `previewText` branches, `draftHref`, link words; sentinels removed |
| `src/features/agents/testAgentsFixtures.ts` | modify | `KINDS`, result keys, `ACT_DRAFT_REPLY`, `ACT_DRAFT_TICKET`, `ACT_PLAN_START`, ids |
| `src/features/agents/testAgents.ts` | modify | `draft_id` and `plan_id` on apply; `draftSent` undo refusal |
| `src/features/agents/draftTypes.ts` | create | `ReplyDraft` and friends |
| `src/features/agents/draftsApi.ts` | create | `/communications/drafts/*` wrappers, `draftFieldErrors` |
| `src/features/agents/draftsText.ts` | create | Draft words, the `?draft=` param, links |
| `src/features/agents/testDrafts.ts` | create | Stateful drafts stub and fixtures |
| `src/components/agents/AgentActionBody.tsx` | modify | Task link by id; the draft excerpt |
| `src/components/agents/ActivityRow.tsx` | modify | Open draft, Open plan |
| `src/components/agents/DraftForm.tsx` | create | The owner's editor and its actions |
| `src/components/agents/DraftPanel.tsx` | create | `DraftPanel`, `DraftRoute` |
| `src/components/agents/DraftLine.tsx` | create | The queue's Open draft line |
| `src/components/agents/AgentDraftsList.tsx` | create | Mailbox › Drafts "From your agents" |
| `src/components/agents/houseRules.test.ts` | modify | Coverage, primaries, copy globs |
| `src/features/communications/communicationsSlice.ts` | modify | `CommunicationRow.draft` |
| `src/pages/communications/CommunicationsPage.tsx` | modify | Mounts `DraftRoute` |
| `src/pages/communications/DetailPane.tsx` | modify | Mounts `DraftLine` |
| `src/pages/communications/MailboxView.tsx` | modify | Mounts `AgentDraftsList` |
| `src/features/notifications/types.ts`, `src/components/layout/NotificationKindIcon.tsx` | modify | `agent_draft_ready` |
| `src/features/plans/planTypes.ts`, `planOptions.ts`, `planParams.ts`, `planText.ts`, `planApi.ts`, `testPlans.ts` | modify | Draft status, Start plan, the stub |
| `src/components/plans/parts.tsx`, `PlanRowItem.tsx`, `PlanFilters.tsx`, `PlansBoard.tsx`, `RecordPlans.tsx`, `PlanHeader.tsx` | modify | Draft in every view; Started by the agent |
| `src/components/plans/DraftPlanBanner.tsx` | create | The banner and Start plan |
| `src/pages/plans/PlanPage.tsx` | modify | Banner, edit on a Draft, status line |
| `src/features/work/testWorkFixtures.ts`, `src/features/brain/testWaitingFixtures.ts` | modify | New-kind rows |
| `src/pages/work/testPages.tsx` | modify | `renderWork(..., { drafts })` |
| `src/e2e/agents.test.tsx` | modify | Two journeys |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md` | modify | Delivery 2 described |

Tests sit beside their files.

---

### Task 1: The two kinds: types, words, previews and fixtures

**Files:**
- Modify: `src/features/agents/agentTypes.ts:9-32` (kinds), `:96-104` (preview), `:135` (result)
- Modify: `src/features/agents/agentsText.ts:21-75` (`AGENTS`), `:97-108` (`KIND_LABEL`), `:125-139` (`previewText`)
- Modify: `src/features/agents/testAgentsFixtures.ts`
- Test: `src/features/agents/agentsText.test.ts`, `src/pages/settings/AgentActionsPage.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `ActionKind` gains `'draft.reply' | 'plan.start'`; `ACTION_KINDS` is `[..., 'note.create', 'draft.reply', 'plan.start', 'initiative.create']`.
  - `DraftPreview = { channel: 'email'; to: string; subject: string; excerpt: string } | { channel: 'ticket'; ticket: string; subject: string; excerpt: string }`.
  - `ActionPreview.draft?: DraftPreview`, `ActionPreview.plan?: { template: string; milestones: number; tasks: number }`, `ActionPreview.task.id?: number | null`.
  - `AgentAction.result: { task_id; note_id; initiative_id; draft_id: number | null; plan_id: number | null }`.
  - `draftHref(id: number): string` (`/communications?draft=<id>`); `AGENTS.OPEN_DRAFT` ("Open draft"), `AGENTS.OPEN_PLAN` ("Open plan").
  - Fixtures: `DRAFT_EMAIL_ID = 7`, `DRAFT_TICKET_ID = 8`, `STARTED_PLAN_ID = 31`, `ACT_DRAFT_REPLY` (90, applied by Auto, email, `draft_id` 7), `ACT_DRAFT_TICKET` (91, proposed, ticket), `ACT_PLAN_START` (92, proposed). None is added to `ACTIONS`, so delivery 1's list tests keep their rows.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/agentsText.test.ts` (add `draftHref` and `KIND_LABEL` to the existing `./agentsText` import, `ACT_DRAFT_REPLY`, `ACT_DRAFT_TICKET`, `ACT_PLAN_START` to the fixtures import, and add `import { ACTION_KINDS } from './agentTypes';`):

```ts
describe('delivery 2 kinds (contract "New action kinds")', () => {
  it('puts both kinds after File a note and before Start an initiative, with the contract labels', () => {
    expect(ACTION_KINDS.slice(8)).toEqual(['note.create', 'draft.reply', 'plan.start', 'initiative.create']);
    expect(KIND_LABEL['draft.reply']).toBe('Draft a reply');
    expect(KIND_LABEL['plan.start']).toBe('Start a plan');
  });

  it('words an email draft, a ticket draft and a plan', () => {
    expect(previewText(ACT_DRAFT_REPLY)).toBe('Draft a reply to Ann Lee <ann@x.com>: Re: Renewal terms');
    expect(previewText(ACT_DRAFT_TICKET)).toBe('Draft a reply on TKT-1042: Export fails');
    expect(previewText(ACT_PLAN_START)).toBe('Start a plan: Onboarding, 3 milestones, 9 tasks');
    expect(previewText({ ...ACT_PLAN_START, preview: { plan: { template: 'QBR', milestones: 1, tasks: 1 } } })).toBe('Start a plan: QBR, 1 milestone, 1 task');
  });

  it('names the kind in Waiting and reads it from the URL', () => {
    expect(waitingKindLabel(ACT_PLAN_START)).toBe('CS agent · Start a plan');
    expect(filtersOf(new URLSearchParams('kind=draft.reply')).kind).toBe('draft.reply');
  });

  it('links a draft, and starts every result key at null', () => {
    expect(draftHref(7)).toBe('/communications?draft=7');
    expect(ACT_PLAN_START.result).toEqual({ task_id: null, note_id: null, initiative_id: null, draft_id: null, plan_id: null });
  });
});
```

Append to `src/pages/settings/AgentActionsPage.test.tsx`, inside its `describe`:

```tsx
  it('caps Start a plan at Ask, lets Draft a reply reach Auto, and leaves both unused by the Ops agent', async () => {
    stubAgents();
    renderPage(<AgentActionsPage />, '/settings/agent-actions');
    const plan = await screen.findByLabelText('Start a plan for the CS agent');
    expect(within(plan).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ask', 'Never']);
    const draft = screen.getByLabelText('Draft a reply for the Sales agent');
    expect(within(draft).getAllByRole('option').map((o) => o.textContent)).toEqual(['Auto', 'Ask', 'Never']);
    const table = screen.getByRole('table', { name: 'Actions & approvals' });
    expect(within(within(table).getByText('Draft a reply').closest('tr')!).getAllByText('Not used')).toHaveLength(1);
    expect(within(within(table).getByText('Start a plan').closest('tr')!).getAllByText('Not used')).toHaveLength(1);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/agents/agentsText.test.ts src/pages/settings/AgentActionsPage.test.tsx --maxWorkers=2`
Expected: FAIL (`ACT_DRAFT_REPLY` is not exported; no "Start a plan for the CS agent" select).

- [ ] **Step 3: Add the kinds to the types**

In `src/features/agents/agentTypes.ts`, change the first line comment to `// Agents, deliveries 1 and 2 (contracts revenact-backend` and replace `ActionKind` and `ACTION_KINDS` with:

```ts
export type ActionKind =
  | 'record.lifecycle'
  | 'record.owner'
  | 'record.attribute'
  | 'task.create'
  | 'task.reassign'
  | 'task.redate'
  | 'task.complete'
  | 'task.snooze'
  | 'note.create'
  | 'draft.reply'
  | 'plan.start'
  | 'initiative.create';
/** The contract's order (delivery 2 puts its two kinds before initiative.create). */
export const ACTION_KINDS: readonly ActionKind[] = [
  'record.lifecycle',
  'record.owner',
  'record.attribute',
  'task.create',
  'task.reassign',
  'task.redate',
  'task.complete',
  'task.snooze',
  'note.create',
  'draft.reply',
  'plan.start',
  'initiative.create',
];
```

Replace `ActionPreview` with:

```ts
/** draft.reply's preview (delivery 2): `excerpt` is the reply's first 280 characters. */
export type DraftPreview =
  | { channel: 'email'; to: string; subject: string; excerpt: string }
  | { channel: 'ticket'; ticket: string; subject: string; excerpt: string };

/** Shaped by the kind (contract "preview"); `from` and `to` are display strings. */
export interface ActionPreview {
  field?: string;
  from?: string;
  to?: string;
  /** `id` is null for a task the reader can't open or one removed since (delivery 2 follow-up). */
  task?: { id?: number | null; title: string; assignee?: PersonRef | null; due_date?: string; priority?: TaskPriority };
  note?: { title: string };
  initiative?: { metric: string; target: string };
  draft?: DraftPreview;
  plan?: { template: string; milestones: number; tasks: number };
}
```

Replace the `result` line in `AgentAction` with:

```ts
  /** Each key is null unless that kind made it. */
  result: { task_id: number | null; note_id: number | null; initiative_id: number | null; draft_id: number | null; plan_id: number | null };
```

- [ ] **Step 4: Add the words**

In `src/features/agents/agentsText.ts`:
- change the first comment line to `// Agents' words and rules (deliveries 1 and 2), kept free of React so they are`;
- add to `AGENTS`, after `UNDO_FAILED`:

```ts
  OPEN_TASK: 'Open task',
  OPEN_DRAFT: 'Open draft',
  OPEN_PLAN: 'Open plan',
```

- in `KIND_LABEL`, after `'note.create': 'File a note',` add:

```ts
  'draft.reply': 'Draft a reply',
  'plan.start': 'Start a plan',
```

- replace `previewText` with:

```ts
const counted = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

/** One line for what the action does or did. */
export function previewText(action: AgentAction): string {
  const p = action.preview;
  if (action.kind === 'task.create' && p.task) {
    const parts = [p.task.title];
    if (p.task.assignee) parts.push(`for ${p.task.assignee.name}`);
    if (p.task.due_date) parts.push(`due ${formatDate(p.task.due_date)}`);
    if (p.task.priority) parts.push(`${p.task.priority} priority`);
    return `Create a task: ${parts.join(', ')}`;
  }
  if (action.kind === 'note.create' && p.note) return `File a note: ${p.note.title}`;
  if (action.kind === 'initiative.create' && p.initiative) return `Start an initiative: ${p.initiative.metric}, target ${p.initiative.target}`;
  if (action.kind === 'draft.reply' && p.draft) {
    return p.draft.channel === 'email' ? `Draft a reply to ${p.draft.to}: ${p.draft.subject}` : `Draft a reply on ${p.draft.ticket}: ${p.draft.subject}`;
  }
  if (action.kind === 'plan.start' && p.plan) return `Start a plan: ${p.plan.template}, ${counted(p.plan.milestones, 'milestone')}, ${counted(p.plan.tasks, 'task')}`;
  if (p.task && p.field) return `${p.task.title}: ${taskChangeText(action)}`;
  return `${p.field ?? KIND_LABEL[action.kind]}: ${shown(p.from)} → ${shown(p.to)}`;
}

/** A reply draft's place on Communications (Decision 1). */
export const draftHref = (id: number): string => `/communications?draft=${id}`;
```

- [ ] **Step 5: Add the fixtures**

In `src/features/agents/testAgentsFixtures.ts`:
- change the header comment's first line to `// Test-only: the delivery 1 and 2 contracts' shapes, around the Work fixtures'`;
- in `KINDS`, after the `note.create` entry, add:

```ts
  { kind: 'draft.reply', label: 'Draft a reply', example: "Draft a reply to Ann Lee's email about the renewal", max_level: 'auto', agents: RECORDS },
  { kind: 'plan.start', label: 'Start a plan', example: 'Start the Onboarding plan on Dough Co', max_level: 'ask', agents: RECORDS },
```

- in `base`, replace the `result` line with `result: { task_id: null, note_id: null, initiative_id: null, draft_id: null, plan_id: null },`;
- after `ACT_TASK_REMOVED`, before `ACTIONS`, add:

```ts
/** The ids the drafts and plans stubs use for what these actions make. */
export const DRAFT_EMAIL_ID = 7;
export const DRAFT_TICKET_ID = 8;
export const STARTED_PLAN_ID = 31;

/** Applied by Auto: the CS agent drafted Alice's reply to Ann Lee (delivery 2). */
export const ACT_DRAFT_REPLY: AgentAction = {
  ...base,
  id: 90,
  agent: 'cs',
  kind: 'draft.reply',
  title: 'Draft a reply to Ann Lee about the renewal',
  status: 'applied',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  rationale: 'Ann asked about the renewal terms 2 days ago and has no answer.',
  evidence: [{ label: 'Email from Ann Lee, 6 Oct', link: '/organizations/7' }],
  preview: {
    draft: {
      channel: 'email',
      to: 'Ann Lee <ann@x.com>',
      subject: 'Re: Renewal terms',
      excerpt: 'Hi Ann,\n\nThanks for the note on the renewal terms. I will send the revised order form by Friday.',
    },
  },
  auto: true,
  applied_at: '2026-10-08T00:46:00Z',
  undo: { allowed: true, until: '2026-10-15T00:46:00Z', reason: null },
  result: { ...base.result, draft_id: DRAFT_EMAIL_ID },
};

/** Waiting for a decision: a reply on a Zendesk ticket. */
export const ACT_DRAFT_TICKET: AgentAction = {
  ...base,
  id: 91,
  agent: 'cs',
  kind: 'draft.reply',
  title: 'Draft a reply on TKT-1042',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  rationale: 'The export ticket has waited 7 days for an answer.',
  evidence: [{ label: 'TKT-1042, open since 1 Oct', link: '/organizations/7' }],
  preview: { draft: { channel: 'ticket', ticket: 'TKT-1042', subject: 'Export fails', excerpt: 'Hi Ann, the export fix ships on Thursday.' } },
};

/** Waiting for a decision (Ask is its cap): the Onboarding plan on Pizza Hut. */
export const ACT_PLAN_START: AgentAction = {
  ...base,
  id: 92,
  agent: 'cs',
  kind: 'plan.start',
  title: 'Start the Onboarding plan on Pizza Hut',
  status: 'proposed',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  rationale: 'Pizza Hut went live 3 days ago and has no onboarding plan.',
  evidence: [{ label: 'Live since 5 Oct', link: '/organizations/7' }],
  preview: { plan: { template: 'Onboarding', milestones: 3, tasks: 9 } },
};
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/features/agents src/pages/settings/AgentActionsPage.test.tsx src/pages/work/Activity.test.tsx --maxWorkers=2`
Expected: PASS (Activity's delivery 1 tests still see their seven rows: the new fixtures are not in `ACTIONS`).

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/agentTypes.ts src/features/agents/agentsText.ts src/features/agents/testAgentsFixtures.ts src/features/agents/agentsText.test.ts src/pages/settings/AgentActionsPage.test.tsx
git commit -m "feat(agents): add the draft.reply and plan.start kinds, their labels and previews

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Delivery 1 follow-up: link a task by its id alone

**Files:**
- Modify: `src/features/agents/agentsText.ts:77-85` (delete the sentinels)
- Modify: `src/features/agents/testAgentsFixtures.ts:5` (import), `:152-176` (two fixtures)
- Modify: `src/components/agents/AgentActionBody.tsx:2`, `:16-20`
- Test: `src/features/agents/agentsText.test.ts:13-41`, `src/components/agents/AgentActionDecision.test.tsx:5-11`, `:54-82`

**Interfaces:**
- Consumes: Task 1's `ActionPreview.task.id?: number | null`.
- Produces: `HIDDEN_TASK`, `REMOVED_TASK` and `isOpenableTaskTitle` no longer exist. `AgentActionBody` links a task when `typeof preview.task.id === 'number'` and the kind has a `field`.

- [ ] **Step 1: Write the failing test**

In `src/components/agents/AgentActionDecision.test.tsx`:
- replace the import line `import { HIDDEN_TASK, REMOVED_TASK, previewText } from '../../features/agents/agentsText';` with `import { previewText } from '../../features/agents/agentsText';`;
- in `describe('AgentActionBody task titles', ...)`, replace the two sentinel tests (lines 71-81) with:

```tsx
  it("shows a task the reader can't see as plain text: the server sends no id", () => {
    const { container } = body(ACT_TASK_HIDDEN);
    expect(within(preview(container)).queryByRole('link')).toBeNull();
    expect(preview(container)).toHaveTextContent("A task you can't see: Assignee Dana CSM → Carl CSM");
  });

  it('shows a removed task as plain text: the server sends no id', () => {
    const { container } = body(ACT_TASK_REMOVED);
    expect(within(preview(container)).queryByRole('link')).toBeNull();
    expect(preview(container)).toHaveTextContent('A removed task: Due date');
  });

  it('links a task by its id alone, whatever its title says', () => {
    const { container } = body({ ...ACT_UNDONE, preview: { ...ACT_UNDONE.preview, task: { id: 42, title: 'A removed task' } } });
    expect(within(preview(container)).getByRole('link', { name: 'A removed task' })).toHaveAttribute('href', expect.stringContaining('task=42'));
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/agents/AgentActionDecision.test.tsx --maxWorkers=2`
Expected: FAIL: "links a task by its id alone" finds no link (the sentinel check hides it), and the hidden fixture still carries id 43.

- [ ] **Step 3: Remove the sentinels and link by id**

In `src/features/agents/agentsText.ts`, delete lines 77-85 (the comment, `HIDDEN_TASK`, `REMOVED_TASK` and `isOpenableTaskTitle`).

In `src/features/agents/testAgentsFixtures.ts`:
- delete line 5 (`import { HIDDEN_TASK, REMOVED_TASK } from './agentsText';`);
- replace `ACT_TASK_HIDDEN`'s comment and `preview` with:

```ts
/** A task the reader can't open: the server swaps its title and sends no id. */
```
```ts
  preview: { task: { id: null, title: "A task you can't see" }, field: 'Assignee', from: 'Dana CSM', to: 'Carl CSM' },
```

- replace `ACT_TASK_REMOVED`'s comment and `preview` with:

```ts
/** A task deleted since: the server names it "A removed task" and sends no id. */
```
```ts
  preview: { task: { id: null, title: 'A removed task' }, field: 'Due date', from: '2026-10-25', to: '2026-11-01' },
```

In `src/components/agents/AgentActionBody.tsx`:
- line 2 becomes `import { AGENTS, previewText, taskChangeText } from '../../features/agents/agentsText';`;
- replace lines 16-20 with:

```tsx
  // task.create previews stay plain (their sentence does not start with the
  // title); Activity links the made task from its meta line instead. The
  // server sends no id for a task the reader can't open or one removed
  // since, so only a numeric id is a link.
  const task = action.kind === 'task.create' ? null : (action.preview.task ?? null);
  const taskId = task && typeof task.id === 'number' && action.preview.field ? task.id : null;
```

In `src/features/agents/agentsText.test.ts`:
- remove `HIDDEN_TASK`, `isOpenableTaskTitle` and `REMOVED_TASK` from the import;
- in `describe('task titles the server stands in', ...)`, delete the two tests "copies the backend sentinels word for word" and "opens only a real task title", and rename the describe to `'task kinds'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/agents src/components/agents --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/agentsText.ts src/features/agents/testAgentsFixtures.ts src/components/agents/AgentActionBody.tsx src/features/agents/agentsText.test.ts src/components/agents/AgentActionDecision.test.tsx
git commit -m "fix(agents): link a task preview only when its id is a number

The backend now sends a null id for a task the reader can't open or one
removed since, so the title sentinels and their matching go.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The agents stub learns drafts and plans

**Files:**
- Modify: `src/features/agents/testAgents.ts:1-28` (options), `:80-105` (undo, apply)
- Test: `src/features/agents/testAgents.test.ts`, `src/components/agents/UndoAction.test.tsx`

**Interfaces:**
- Consumes: Task 1's fixtures and ids.
- Produces: `AgentsStub.draftSent?: (draftId: number) => boolean`. Applying a `draft.reply` sets `result.draft_id` (`DRAFT_TICKET_ID` for a ticket preview, else `DRAFT_EMAIL_ID`); applying a `plan.start` sets `result.plan_id = STARTED_PLAN_ID`. Undoing a `draft.reply` whose draft `draftSent` reports answers `409 {code: 'CHANGED_SINCE', detail: 'This draft has been sent.'}` (no `current` or `applied`: the contract gives none for drafts).

- [ ] **Step 1: Write the failing tests**

Append to `src/features/agents/testAgents.test.ts` (extend the fixtures import with `ACT_DRAFT_REPLY`, `ACT_DRAFT_TICKET`, `ACT_PLAN_START`, `DRAFT_EMAIL_ID`, `DRAFT_TICKET_ID`, `STARTED_PLAN_ID`):

```ts
describe('stubAgents: delivery 2', () => {
  it('applies a draft and a plan with their result ids', async () => {
    stubAgents({ actions: [ACT_DRAFT_TICKET, ACT_PLAN_START] });
    const draft = await post(`/agents/actions/${ACT_DRAFT_TICKET.id}/approve/`);
    expect(draft.body.action.result).toMatchObject({ draft_id: DRAFT_TICKET_ID, plan_id: null });
    const plan = await post(`/agents/actions/${ACT_PLAN_START.id}/approve/`);
    expect(plan.body.action.result).toMatchObject({ plan_id: STARTED_PLAN_ID, draft_id: null });
  });

  it('refuses to undo a draft that was sent, in the contract words, with nothing to compare', async () => {
    const sentIds = new Set<number>([DRAFT_EMAIL_ID]);
    stubAgents({ actions: [ACT_DRAFT_REPLY], draftSent: (id) => sentIds.has(id) });
    const refused = await post(`/agents/actions/${ACT_DRAFT_REPLY.id}/undo/`);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ code: 'CHANGED_SINCE', detail: 'This draft has been sent.' });
    sentIds.clear();
    const undone = await post(`/agents/actions/${ACT_DRAFT_REPLY.id}/undo/`);
    expect(undone.body.action.status).toBe('undone');
  });
});
```

Append to `src/components/agents/UndoAction.test.tsx`, inside its `describe` (add `ACT_DRAFT_REPLY` to the fixtures import):

```tsx
  it('shows a sent draft refusal as the server sentence alone', async () => {
    stubAgents({ actions: [ACT_DRAFT_REPLY], draftSent: () => true });
    render(<UndoAction action={ACT_DRAFT_REPLY} onUndone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^This draft has been sent\.$/);
    await waitFor(() => expect(alert).toHaveFocus());
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/agents/testAgents.test.ts src/components/agents/UndoAction.test.tsx --maxWorkers=2`
Expected: FAIL (`draft_id` stays null; undo answers 200).

- [ ] **Step 3: Teach the stub**

In `src/features/agents/testAgents.ts`:
- change the header's first line to `// Test-only: one stateful fetch stub for /api/v1/agents/, in the delivery 1`, and the second to `// and 2 contracts' shapes and refusal orders. Writes are kept, so a later read`;
- replace the fixtures import with `import { ACTIONS, AGENT_SETTINGS, DRAFT_EMAIL_ID, DRAFT_TICKET_ID, STARTED_PLAN_ID } from './testAgentsFixtures';`;
- in `AgentsStub`, after `changedSince?: number[];`, add:

```ts
  /** Whether a draft (by id) was sent or marked sent: undoing its draft.reply
   *  answers CHANGED_SINCE (stubDrafts' `isSent`). */
  draftSent?: (draftId: number) => boolean;
```

- in `decide`, inside `if (verb === 'undo') {`, insert before `if (state.changed) {`:

```ts
      if (a.kind === 'draft.reply' && a.result.draft_id !== null && stub.draftSent?.(a.result.draft_id)) {
        return json(409, { code: 'CHANGED_SINCE', detail: 'This draft has been sent.' });
      }
```

- replace `if (a.kind === 'task.create') a.result = { ...a.result, task_id: 90 };` with:

```ts
      if (a.kind === 'task.create') a.result = { ...a.result, task_id: 90 };
      if (a.kind === 'draft.reply') a.result = { ...a.result, draft_id: a.preview.draft?.channel === 'ticket' ? DRAFT_TICKET_ID : DRAFT_EMAIL_ID };
      if (a.kind === 'plan.start') a.result = { ...a.result, plan_id: STARTED_PLAN_ID };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/features/agents/testAgents.test.ts src/components/agents/UndoAction.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/testAgents.ts src/features/agents/testAgents.test.ts src/components/agents/UndoAction.test.tsx
git commit -m "test(agents): stub draft and plan results and the sent-draft undo refusal

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Activity links the draft and the plan; the body shows the excerpt

**Files:**
- Modify: `src/components/agents/ActivityRow.tsx`
- Modify: `src/components/agents/AgentActionBody.tsx`
- Test: `src/pages/work/Activity.test.tsx`

**Interfaces:**
- Consumes: `draftHref`, `AGENTS.OPEN_TASK`, `AGENTS.OPEN_DRAFT`, `AGENTS.OPEN_PLAN` (Task 1); `planHref` (`src/features/brain/doingText.ts`, `(plan: {id}) => '/projects/<id>'`).
- Produces: an Activity row's meta line ends with "Open draft" (only while `status === 'applied'` and `result.draft_id` is set) and "Open plan" (whenever `result.plan_id` is set). `AgentActionBody` renders a `blockquote[data-part="excerpt"]` under a `draft.reply` preview.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/work/Activity.test.tsx` (extend the fixtures import with `ACT_DRAFT_REPLY`, `ACT_LIFECYCLE`, `ACT_PLAN_START`, `DRAFT_EMAIL_ID`, `STARTED_PLAN_ID`):

```tsx
describe('Work › Activity: drafts and plans (Agents delivery 2; Decision 8)', () => {
  const PLAN_APPLIED: AgentAction = {
    ...ACT_PLAN_START,
    status: 'applied',
    decided_by: { id: 1, name: 'Alice' },
    decided_at: '2026-10-08T09:10:00Z',
    applied_at: '2026-10-08T09:10:00Z',
    undo: { allowed: true, until: '2026-10-15T09:10:00Z', reason: null },
    result: { ...ACT_PLAN_START.result, plan_id: STARTED_PLAN_ID },
  };
  const DRAFT_UNDONE: AgentAction = { ...ACT_DRAFT_REPLY, id: 93, status: 'undone', undo: null, undone_by: { id: 1, name: 'Alice' }, undone_at: '2026-10-08T09:30:00Z' };

  it('links an applied draft to Communications and a started plan to its page; an undone draft has no link', async () => {
    stubBoth({ actions: [ACT_DRAFT_REPLY, PLAN_APPLIED, DRAFT_UNDONE] });
    renderWork('/work/activity');
    const [undone, plan, draft] = actionRows(await screen.findByRole('list', { name: 'Agent actions' }));
    expect(within(plan).getByRole('link', { name: 'Open plan' })).toHaveAttribute('href', `/projects/${STARTED_PLAN_ID}`);
    expect(within(undone).queryByRole('link', { name: 'Open draft' })).toBeNull();
    const open = within(draft).getByRole('link', { name: 'Open draft' });
    expect(open).toHaveAttribute('href', `/communications?draft=${DRAFT_EMAIL_ID}`);
    expect(open.className).toMatch(/\bmin-h-11\b/);
    await userEvent.click(open);
    await waitFor(() => expect(where()).toBe(`/communications?draft=${DRAFT_EMAIL_ID}`));
  });

  it("shows a draft's recipient and subject, then its opening lines", async () => {
    stubBoth({ actions: [ACT_DRAFT_REPLY] });
    renderWork('/work/activity');
    const [row] = actionRows(await screen.findByRole('list', { name: 'Agent actions' }));
    expect(row.querySelector('[data-part="preview"]')).toHaveTextContent('Draft a reply to Ann Lee <ann@x.com>: Re: Renewal terms');
    expect(row.querySelector('[data-part="excerpt"]')).toHaveTextContent(/^Hi Ann, Thanks for the note/);
  });

  it('filters by a delivery 2 kind', async () => {
    const { spy } = stubBoth({ actions: [ACT_DRAFT_REPLY, ACT_PLAN_START, ACT_LIFECYCLE] });
    renderWork('/work/activity');
    await screen.findByRole('list', { name: 'Agent actions' });
    await userEvent.selectOptions(screen.getByLabelText('Action'), 'plan.start');
    await waitFor(() => expect(where()).toBe('/work/activity?kind=plan.start'));
    expect(calls(spy, 'GET', '/agents/actions/')).toContain('/agents/actions/?kind=plan.start');
    await waitFor(() => expect(actionRows(screen.getByRole('list', { name: 'Agent actions' })).map((row) => row.getAttribute('data-action'))).toEqual(['92']));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/work/Activity.test.tsx --maxWorkers=2`
Expected: FAIL (no "Open plan" or "Open draft" link, no excerpt).

- [ ] **Step 3: Add the links and the excerpt**

In `src/components/agents/ActivityRow.tsx`:
- replace line 3 with `import { AGENTS, AGENT_LABEL, draftHref, statusText } from '../../features/agents/agentsText';`;
- add `import { planHref } from '../../features/brain/doingText';` after the `formatDate` import;
- replace the comment above `export function ActivityRow` with:

```tsx
/** One agent action in Activity (spec §1.8): the title, a meta line (agent,
 *  record, status, when, and what the action made: Open task, Open draft
 *  while it can still exist, Open plan), the body, and Undo while it may.
 *  `focus` marks the row the bell linked to (Decision 2). */
```

- replace `const createdTask = action.kind === 'task.create' ? action.result.task_id : null;` with:

```tsx
  const createdTask = action.kind === 'task.create' ? action.result.task_id : null;
  // Undo deletes a draft, so only an applied action links it (Decision 8).
  const draftId = action.status === 'applied' ? action.result.draft_id : null;
  const planId = action.result.plan_id;
```

- replace the `Open task` block (lines 56-63) with:

```tsx
          {createdTask !== null ? (
            <>
              <Dot />
              <Link {...taskLink(createdTask)} className={META_LINK}>
                {AGENTS.OPEN_TASK}
              </Link>
            </>
          ) : null}
          {draftId !== null ? (
            <>
              <Dot />
              <Link to={draftHref(draftId)} className={META_LINK}>
                {AGENTS.OPEN_DRAFT}
              </Link>
            </>
          ) : null}
          {planId !== null ? (
            <>
              <Dot />
              <Link to={planHref({ id: planId })} className={META_LINK}>
                {AGENTS.OPEN_PLAN}
              </Link>
            </>
          ) : null}
```

In `src/components/agents/AgentActionBody.tsx`, after the closing `</p>` of the `data-part="preview"` paragraph, add:

```tsx
      {action.kind === 'draft.reply' && action.preview.draft ? (
        <blockquote data-part="excerpt" className="max-w-[70ch] whitespace-pre-line border-l-2 border-line pl-3 text-[13px] text-ink-muted">
          {action.preview.draft.excerpt}
        </blockquote>
      ) : null}
```

and change the component comment's first line to `/** What an agent action does and why (spec §1.8; Decision 5; delivery 2 Decision 9): the preview`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/work/Activity.test.tsx src/components/agents --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/ActivityRow.tsx src/components/agents/AgentActionBody.tsx src/pages/work/Activity.test.tsx
git commit -m "feat(agents): Activity links a draft and a started plan, and shows a draft's opening lines

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Reply drafts: types, API and a stub

**Files:**
- Create: `src/features/agents/draftTypes.ts`
- Create: `src/features/agents/draftsApi.ts`
- Create: `src/features/agents/testDrafts.ts`
- Test: `src/features/agents/draftsApi.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError` (`src/lib/apiClient.ts`); `AgentKind`, `ActionRecord` (`agentTypes.ts`); `PersonRef` (`src/features/work/workTypes.ts`); `DRAFT_EMAIL_ID`, `DRAFT_TICKET_ID` (Task 1).
- Produces:
  - Types: `DraftChannel = 'email' | 'ticket'`, `DraftStatus = 'open' | 'sent'`, `EmailDraftSource`, `TicketDraftSource`, `ReplyDraft`, `DraftsList = { results: ReplyDraft[] }`, `DraftFilters = { channel?: DraftChannel; status?: DraftStatus }`, `DraftPatch = { body?: string; subject?: string }`, `DraftSent = { draft: ReplyDraft; email: { id: number; subject: string; sent_at: string; thread_id: string } }`, `QueueDraft = { id: number; agent: AgentKind; created_at: string }`.
  - API: `DRAFTS_PATH`, `draftsQuery(filters)`, `listDrafts(filters?)`, `fetchDraft(id)`, `saveDraft(id, patch)`, `sendDraft(id, patch?)`, `markDraftSent(id)`, `discardDraft(id)`, `DraftField = 'body' | 'subject'`, `draftFieldErrors(err): Partial<Record<DraftField, string>>`.
  - Stub: `stubDrafts(stub?: DraftsStub)` returning `{ spy, drafts: Map<number, ReplyDraft>, isSent(id): boolean }`; fixtures `DRAFT_EMAIL` (7, Alice's, open), `DRAFT_TICKET` (8, Alice's, Zendesk), `DRAFT_CARLS` (9, Carl's, `can_edit` false), `DRAFTS`.

- [ ] **Step 1: Write the types**

Create `src/features/agents/draftTypes.ts`:

```ts
// Reply drafts (Agents delivery 2 contract, "Reply drafts:
// /communications/drafts/"). A draft is a Revenact row: no provider holds
// it. No em dash.
import type { PersonRef } from '../work/workTypes';
import type { ActionRecord, AgentKind } from './agentTypes';

export type DraftChannel = 'email' | 'ticket';
/** A discarded draft no longer exists. */
export type DraftStatus = 'open' | 'sent';

export interface EmailDraftSource {
  kind: 'email';
  id: number;
  subject: string;
  from: { name: string; address: string };
  sent_at: string;
}

export interface TicketDraftSource {
  kind: 'ticket';
  id: number;
  number: string;
  title: string;
  /** Null, with `source_name`, for a ticket raised in Revenact. */
  external_url: string | null;
  source_name: string | null;
}

export interface ReplyDraft {
  id: number;
  channel: DraftChannel;
  status: DraftStatus;
  record: ActionRecord;
  source: EmailDraftSource | TicketDraftSource;
  /** `[name, address]` pairs; null on a ticket draft. */
  to: [string, string][] | null;
  /** Null on a ticket draft. */
  subject: string | null;
  body: string;
  agent: AgentKind;
  agent_action_id: number;
  owner: PersonRef;
  /** The body or subject differs from what the agent wrote. */
  edited: boolean;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  /** Contract question 3: read as `{id, name}`, like `owner`. */
  sent_by: PersonRef | null;
  /** The owner's, while it is open. Every write is owner-only. */
  can_edit: boolean;
}

/** GET /communications/drafts/: the reader's own, newest first, at most 100. */
export interface DraftsList {
  results: ReplyDraft[];
}

export interface DraftFilters {
  channel?: DraftChannel;
  /** `open` when left out. */
  status?: DraftStatus;
}

/** PATCH, and send's optional body: `subject` is for email drafts only. */
export interface DraftPatch {
  body?: string;
  subject?: string;
}

/** POST send/. */
export interface DraftSent {
  draft: ReplyDraft;
  email: { id: number; subject: string; sent_at: string; thread_id: string };
}

/** The queue row's `draft`: the reader's own open draft for that email or ticket. */
export interface QueueDraft {
  id: number;
  agent: AgentKind;
  created_at: string;
}
```

- [ ] **Step 2: Write the stub and its fixtures**

Create `src/features/agents/testDrafts.ts`:

```ts
// Test-only: one stateful fetch stub for /api/v1/communications/drafts/, in
// the Agents delivery 2 contract's shapes and refusal orders. The reader is
// Alice (id 1); Carl CSM (id 3) owns one draft she may read. Writes are
// kept; every answer is a copy; anything else goes to `passThrough`. No em dash.
import { vi } from 'vitest';
import { DRAFT_EMAIL_ID, DRAFT_TICKET_ID } from './testAgentsFixtures';
import type { ReplyDraft } from './draftTypes';

const ALICE = { id: 1, name: 'Alice' };
const CARL = { id: 3, name: 'Carl CSM' };
const SENT_AT = '2026-10-08T10:00:00Z';

export const DRAFT_EMAIL: ReplyDraft = {
  id: DRAFT_EMAIL_ID,
  channel: 'email',
  status: 'open',
  record: { kind: 'customer', id: 7, name: 'Pizza Hut' },
  source: { kind: 'email', id: 812, subject: 'Renewal terms', from: { name: 'Ann Lee', address: 'ann@x.com' }, sent_at: '2026-10-06T09:00:00Z' },
  to: [['Ann Lee', 'ann@x.com']],
  subject: 'Re: Renewal terms',
  body: 'Hi Ann,\n\nThanks for the note on the renewal terms. I will send the revised order form by Friday.\n\nBest,\nAlice',
  agent: 'cs',
  agent_action_id: 90,
  owner: ALICE,
  edited: false,
  created_at: '2026-10-08T00:46:00Z',
  updated_at: '2026-10-08T00:46:00Z',
  sent_at: null,
  sent_by: null,
  can_edit: true,
};

export const DRAFT_TICKET: ReplyDraft = {
  ...DRAFT_EMAIL,
  id: DRAFT_TICKET_ID,
  channel: 'ticket',
  source: { kind: 'ticket', id: 55, number: 'TKT-1042', title: 'Export fails', external_url: 'https://acme.zendesk.com/agent/tickets/1042', source_name: 'Zendesk' },
  to: null,
  subject: null,
  body: 'Hi Ann, the export fix ships on Thursday. I will confirm here once it is live.',
  agent_action_id: 91,
};

/** Carl's: Alice may read it (she manages him) but not change it. */
export const DRAFT_CARLS: ReplyDraft = { ...DRAFT_EMAIL, id: 9, agent_action_id: 94, owner: CARL, can_edit: false };

export const DRAFTS: ReplyDraft[] = [DRAFT_EMAIL, DRAFT_TICKET, DRAFT_CARLS];

export interface DraftsStub {
  drafts?: ReplyDraft[];
  /** Whether Alice has a connected mailbox. Default true. */
  mailbox?: boolean;
  /** The next send answers 502 (the provider refused), once. */
  failNextSend?: boolean;
  /** How many reads of the list, and of one draft, fail (500) first. */
  failList?: number;
  failRead?: number;
  passThrough?: (input: RequestInfo | URL, init?: RequestInit) => Promise<unknown>;
}

const json = (status: number, body: unknown) => {
  const copy = body === undefined ? null : JSON.parse(JSON.stringify(body));
  return { ok: status >= 200 && status < 300, status, json: async () => copy };
};
const DOWN = { detail: 'Down.' };

export function stubDrafts(stub: DraftsStub = {}) {
  const drafts = new Map<number, ReplyDraft>((stub.drafts ?? DRAFTS).map((d) => [d.id, JSON.parse(JSON.stringify(d)) as ReplyDraft]));
  // What the agent wrote, for `edited`.
  const written = new Map<number, { body: string; subject: string | null }>([...drafts.values()].map((d) => [d.id, { body: d.body, subject: d.subject }]));
  const mailbox = stub.mailbox ?? true;
  let failNextSend = stub.failNextSend ?? false;
  let failList = stub.failList ?? 0;
  let failRead = stub.failRead ?? 0;

  const own = (d: ReplyDraft) => d.owner.id === ALICE.id;
  const notYours = (d: ReplyDraft, verb: 'change' | 'send') => json(403, { code: 'NOT_YOURS', detail: `Only ${d.owner.name} can ${verb} this draft.` });
  const alreadySent = () => json(409, { code: 'ALREADY_SENT', detail: 'This draft has been sent.' });

  function fieldErrors(d: ReplyDraft, body: Record<string, unknown>): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    if ('body' in body) {
      const text = typeof body.body === 'string' ? body.body : '';
      if (!text.trim()) errors.body = ['Write the reply.'];
      else if (text.length > 20000) errors.body = ['Keep the reply under 20,000 characters.'];
    }
    if ('subject' in body) {
      if (d.channel === 'ticket') errors.subject = ['A ticket reply has no subject.'];
      else if (typeof body.subject === 'string' && body.subject.length > 255) errors.subject = ['Keep the subject under 255 characters.'];
    }
    return errors;
  }

  function write(d: ReplyDraft, body: Record<string, unknown>) {
    if (typeof body.body === 'string') d.body = body.body;
    if (typeof body.subject === 'string' && d.channel === 'email') d.subject = body.subject;
    const first = written.get(d.id);
    d.edited = first ? d.body !== first.body || d.subject !== first.subject : true;
    d.updated_at = '2026-10-08T09:50:00Z';
  }

  function settle(d: ReplyDraft) {
    d.status = 'sent';
    d.sent_at = SENT_AT;
    d.sent_by = ALICE;
    d.can_edit = false;
  }

  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (path === '/communications/drafts/' && method === 'GET') {
      if (failList > 0) {
        failList -= 1;
        return json(500, DOWN);
      }
      const channel = url.searchParams.get('channel');
      const status = url.searchParams.get('status') ?? 'open';
      if (channel !== null && channel !== 'email' && channel !== 'ticket') return json(400, { channel: ['Choose email or ticket.'] });
      if (status !== 'open' && status !== 'sent') return json(400, { status: ['Choose open or sent.'] });
      const results = [...drafts.values()].filter((d) => own(d) && d.status === status && (!channel || d.channel === channel)).sort((a, b) => b.id - a.id);
      return json(200, { results });
    }
    const match = /^\/communications\/drafts\/(\d+)\/(send\/|mark-sent\/)?$/.exec(path);
    if (match) {
      const d = drafts.get(Number(match[1]));
      const verb = match[2] ?? '';
      if (!d) return json(404, { detail: 'Not found.' });
      if (verb === '' && method === 'GET') {
        if (failRead > 0) {
          failRead -= 1;
          return json(500, DOWN);
        }
        return json(200, d);
      }
      if (verb === '' && method === 'PATCH') {
        if (!own(d)) return notYours(d, 'change');
        if (d.status === 'sent') return alreadySent();
        const errors = fieldErrors(d, body);
        if (Object.keys(errors).length > 0) return json(400, errors);
        write(d, body);
        return json(200, d);
      }
      if (verb === '' && method === 'DELETE') {
        if (!own(d)) return notYours(d, 'change');
        if (d.status === 'sent') return alreadySent();
        drafts.delete(d.id);
        return json(204, undefined);
      }
      if (verb === 'send/' && method === 'POST') {
        if (!own(d)) return notYours(d, 'send');
        if (d.channel === 'ticket') return json(400, { code: 'WRONG_CHANNEL', detail: 'Copy a ticket reply into its source and mark it sent.' });
        if (d.status === 'sent') return alreadySent();
        const errors = fieldErrors(d, body);
        if (Object.keys(errors).length > 0) return json(400, errors);
        write(d, body);
        if (!mailbox) return json(409, { code: 'NO_MAILBOX', detail: 'Connect your mailbox to send this.' });
        if (failNextSend) {
          failNextSend = false;
          return json(502, { detail: "Your mailbox didn't accept the message. Try again." });
        }
        settle(d);
        return json(200, { draft: d, email: { id: 900, subject: d.subject, sent_at: SENT_AT, thread_id: 't-812' } });
      }
      if (verb === 'mark-sent/' && method === 'POST') {
        if (!own(d)) return notYours(d, 'change');
        if (d.channel === 'email') return json(400, { code: 'WRONG_CHANNEL', detail: 'Send an email draft instead.' });
        if (d.status === 'sent') return alreadySent();
        settle(d);
        return json(200, d);
      }
    }
    if (stub.passThrough) return stub.passThrough(input, init);
    return json(404, { detail: 'Not found.' });
  });
  vi.stubGlobal('fetch', spy);
  return { spy, drafts, isSent: (id: number) => drafts.get(id)?.status === 'sent' };
}
```

- [ ] **Step 3: Write the failing API test**

Create `src/features/agents/draftsApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { discardDraft, draftFieldErrors, draftsQuery, fetchDraft, listDrafts, markDraftSent, saveDraft, sendDraft } from './draftsApi';
import { refusalCode, refusalDetail } from './agentsApi';
import { calls, sent } from './testAgents';
import { DRAFT_CARLS, DRAFT_EMAIL, DRAFT_TICKET, stubDrafts } from './testDrafts';

afterEach(() => vi.unstubAllGlobals());

const refusal = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (err) {
    return err;
  }
  throw new Error('expected a refusal');
};

describe('reply drafts API (delivery 2 contract)', () => {
  it('lists the reader own open drafts, by channel', async () => {
    const { spy } = stubDrafts();
    expect(draftsQuery({ channel: 'email' })).toBe('?channel=email');
    expect(draftsQuery({})).toBe('');
    expect((await listDrafts({ channel: 'email' })).results.map((d) => d.id)).toEqual([DRAFT_EMAIL.id]);
    expect((await listDrafts()).results.map((d) => d.id)).toEqual([DRAFT_TICKET.id, DRAFT_EMAIL.id]);
    expect(calls(spy, 'GET', '/communications/drafts/')).toEqual(['/communications/drafts/?channel=email', '/communications/drafts/']);
  });

  it('reads one, and refuses a stranger write as NOT_YOURS in the server words', async () => {
    stubDrafts();
    expect((await fetchDraft(DRAFT_CARLS.id)).can_edit).toBe(false);
    const err = await refusal(saveDraft(DRAFT_CARLS.id, { body: 'Hi' }));
    expect(refusalCode(err)).toBe('NOT_YOURS');
    expect(refusalDetail(err)).toBe('Only Carl CSM can change this draft.');
  });

  it('saves only what it is sent, marks it edited, and reads field errors', async () => {
    const { spy } = stubDrafts();
    const saved = await saveDraft(DRAFT_EMAIL.id, { body: 'Hi Ann, Friday works.' });
    expect(saved).toMatchObject({ body: 'Hi Ann, Friday works.', edited: true });
    expect(sent(spy, 'PATCH', '/communications/drafts/')).toEqual([{ body: 'Hi Ann, Friday works.' }]);
    const err = await refusal(saveDraft(DRAFT_TICKET.id, { body: ' ', subject: 'Hello' }));
    expect(err).toBeInstanceOf(ApiError);
    expect(draftFieldErrors(err)).toEqual({ body: 'Write the reply.', subject: 'A ticket reply has no subject.' });
  });

  it('sends an email draft, and refuses NO_MAILBOX and WRONG_CHANNEL in order', async () => {
    stubDrafts({ mailbox: false });
    expect(refusalDetail(await refusal(sendDraft(DRAFT_TICKET.id)))).toBe('Copy a ticket reply into its source and mark it sent.');
    expect(refusalDetail(await refusal(sendDraft(DRAFT_EMAIL.id)))).toBe('Connect your mailbox to send this.');
    vi.unstubAllGlobals();
    stubDrafts();
    const answer = await sendDraft(DRAFT_EMAIL.id, { subject: 'Re: Renewal terms, revised' });
    expect(answer.draft).toMatchObject({ status: 'sent', subject: 'Re: Renewal terms, revised', can_edit: false, sent_by: { id: 1, name: 'Alice' } });
    expect(refusalCode(await refusal(sendDraft(DRAFT_EMAIL.id)))).toBe('ALREADY_SENT');
  });

  it('marks a ticket draft sent, and discards a draft once', async () => {
    stubDrafts();
    expect(refusalDetail(await refusal(markDraftSent(DRAFT_EMAIL.id)))).toBe('Send an email draft instead.');
    expect((await markDraftSent(DRAFT_TICKET.id)).status).toBe('sent');
    expect(await discardDraft(DRAFT_EMAIL.id)).toBeNull();
    expect((await refusal(fetchDraft(DRAFT_EMAIL.id)) as ApiError).status).toBe(404);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/features/agents/draftsApi.test.ts --maxWorkers=2`
Expected: FAIL with "Failed to resolve import './draftsApi'".

- [ ] **Step 5: Write the API**

Create `src/features/agents/draftsApi.ts`:

```ts
// Thin apiFetch wrappers over /api/v1/communications/drafts/ (Agents
// delivery 2 contract, "Reply drafts"). Refusals are read with agentsApi's
// refusalCode and refusalDetail; field errors with draftFieldErrors. No em dash.
import { ApiError, apiFetch } from '../../lib/apiClient';
import type { DraftFilters, DraftPatch, DraftSent, DraftsList, ReplyDraft } from './draftTypes';

export const DRAFTS_PATH = '/communications/drafts/';
const one = (id: number) => `${DRAFTS_PATH}${id}/`;

export function draftsQuery(filters: DraftFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.channel) params.set('channel', filters.channel);
  if (filters.status) params.set('status', filters.status);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const listDrafts = (filters: DraftFilters = {}) => apiFetch<DraftsList>(`${DRAFTS_PATH}${draftsQuery(filters)}`);
/** 404 unless the reader owns it, or may open its record and read its source. */
export const fetchDraft = (id: number) => apiFetch<ReplyDraft>(one(id));
export const saveDraft = (id: number, patch: DraftPatch) => apiFetch<ReplyDraft>(one(id), { method: 'PATCH', body: patch });
/** Email only; `patch` is saved first with the PATCH rules. */
export const sendDraft = (id: number, patch: DraftPatch = {}) => apiFetch<DraftSent>(`${one(id)}send/`, { method: 'POST', body: patch });
/** Ticket only. */
export const markDraftSent = (id: number) => apiFetch<ReplyDraft>(`${one(id)}mark-sent/`, { method: 'POST' });
/** 204. */
export const discardDraft = (id: number) => apiFetch<null>(one(id), { method: 'DELETE' });

export type DraftField = 'body' | 'subject';

/** A 400's field errors, in the server's words. */
export function draftFieldErrors(err: unknown): Partial<Record<DraftField, string>> {
  if (!(err instanceof ApiError) || err.status !== 400 || typeof err.body !== 'object' || err.body === null) return {};
  const body = err.body as Record<string, unknown>;
  const out: Partial<Record<DraftField, string>> = {};
  for (const field of ['body', 'subject'] as const) {
    const value = body[field];
    if (Array.isArray(value) && typeof value[0] === 'string') out[field] = value[0];
  }
  return out;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/features/agents/draftsApi.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/draftTypes.ts src/features/agents/draftsApi.ts src/features/agents/testDrafts.ts src/features/agents/draftsApi.test.ts
git commit -m "feat(agents): add the reply drafts API client, its types and a stub

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Reply drafts' words and links

**Files:**
- Create: `src/features/agents/draftsText.ts`
- Test: `src/features/agents/draftsText.test.ts`

**Interfaces:**
- Consumes: `AGENT_LABEL` (`agentsText.ts`); `formatDate` (`src/features/customers/formatters.ts`); Task 5's types and fixtures.
- Produces: `DRAFTS` (copy), `draftParam(params): number | null`, `withDraft(search, id): string` (a `?…` query), `withoutDraft(search): string` (`/communications…`), `recipientsText(to)`, `draftByText(agent)`, `draftHeading(draft)`, `sourceText(draft)`, `notOwnerText(draft)`, `sentText(draft)`, `sentNotice(draft)`, `copyLabel(source)`.

- [ ] **Step 1: Write the failing test**

Create `src/features/agents/draftsText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  copyLabel,
  draftByText,
  draftHeading,
  draftParam,
  notOwnerText,
  recipientsText,
  sentNotice,
  sentText,
  sourceText,
  withDraft,
  withoutDraft,
} from './draftsText';
import type { TicketDraftSource } from './draftTypes';
import { DRAFT_CARLS, DRAFT_EMAIL, DRAFT_TICKET } from './testDrafts';

const TICKET = DRAFT_TICKET.source as TicketDraftSource;
const SENT = { status: 'sent' as const, sent_at: '2026-10-08T10:00:00Z', sent_by: { id: 1, name: 'Alice' } };

describe('the ?draft= link (Decision 1)', () => {
  it('reads only a positive whole id', () => {
    expect(draftParam(new URLSearchParams('draft=7'))).toBe(7);
    expect(draftParam(new URLSearchParams('draft=0'))).toBeNull();
    expect(draftParam(new URLSearchParams('draft=abc'))).toBeNull();
    expect(draftParam(new URLSearchParams(''))).toBeNull();
  });

  it('adds the draft to the page query, and Back drops only the draft', () => {
    expect(withDraft('?source=mailbox:google', 7)).toBe('?source=mailbox%3Agoogle&draft=7');
    expect(withoutDraft('?source=mailbox%3Agoogle&draft=7')).toBe('/communications?source=mailbox%3Agoogle');
    expect(withoutDraft('?draft=7')).toBe('/communications');
  });
});

describe('a draft in words', () => {
  it('names recipients, the agent and the heading', () => {
    expect(recipientsText([['Ann Lee', 'ann@x.com'], ['', 'ops@x.com']])).toBe('Ann Lee <ann@x.com>, ops@x.com');
    expect(draftByText('cs')).toBe('The CS agent drafted a reply.');
    expect(draftHeading(DRAFT_EMAIL)).toBe('Reply to Ann Lee');
    expect(draftHeading(DRAFT_TICKET)).toBe('Reply on TKT-1042');
  });

  it('says what the draft answers', () => {
    expect(sourceText(DRAFT_EMAIL)).toBe('Ann Lee <ann@x.com> wrote "Renewal terms" on 6 Oct 2026.');
    expect(sourceText(DRAFT_TICKET)).toBe('TKT-1042 "Export fails" in Zendesk.');
    expect(sourceText({ ...DRAFT_TICKET, source: { ...TICKET, external_url: null, source_name: null } })).toBe('TKT-1042 "Export fails".');
  });

  it('says who may change it and when it went', () => {
    expect(notOwnerText(DRAFT_CARLS)).toBe('Only Carl CSM can change or send this draft.');
    expect(sentText({ ...DRAFT_EMAIL, ...SENT })).toBe('Sent on 8 Oct 2026 by Alice.');
    expect(sentText({ ...DRAFT_TICKET, ...SENT })).toBe('Marked as sent on 8 Oct 2026 by Alice.');
    expect(sentNotice(DRAFT_EMAIL)).toBe('Sent to Ann Lee <ann@x.com>.');
    expect(sentNotice(DRAFT_TICKET)).toBe('Marked as sent.');
  });

  it('names the copy button after the source only when it can open it (Decision 5)', () => {
    expect(copyLabel(TICKET)).toBe('Copy and open in Zendesk');
    expect(copyLabel({ ...TICKET, external_url: null, source_name: null })).toBe('Copy the reply');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/agents/draftsText.test.ts --maxWorkers=2`
Expected: FAIL with "Failed to resolve import './draftsText'".

- [ ] **Step 3: Write the words**

Create `src/features/agents/draftsText.ts`:

```ts
// Reply drafts' words and links (Agents delivery 2), kept free of React.
// Sentence case, no em dash.
import { formatDate } from '../customers/formatters';
import { AGENT_LABEL } from './agentsText';
import type { AgentKind } from './agentTypes';
import type { ReplyDraft, TicketDraftSource } from './draftTypes';

export const DRAFTS = {
  REGION: 'Draft reply',
  LOADING: 'Loading the draft',
  LOAD: 'Could not load this draft.',
  MISSING_TITLE: 'Draft not found',
  MISSING: "That draft isn't there any more, or you can't open it.",
  BACK: 'Back to the inbox',
  SOURCE: 'What it answers',
  TO: 'To',
  SUBJECT: 'Subject',
  BODY: 'Reply',
  SAVE: 'Save',
  SAVING: 'Saving…',
  SAVED: 'Saved.',
  SEND: 'Send',
  SENDING: 'Sending…',
  MARK_SENT: 'Mark as sent',
  MARKING: 'Marking…',
  COPY: 'Copy the reply',
  COPIED: 'Copied the reply.',
  COPY_FAILED: 'Could not copy the reply. Select it and copy it yourself.',
  DISCARD: 'Discard',
  DISCARD_TITLE: 'Discard this draft?',
  DISCARD_MESSAGE: 'The reply is deleted for good.',
  DISCARDED: 'Discarded the draft.',
  SAVE_FAILED: 'Could not save this draft. Try again.',
  SEND_FAILED: 'Could not send this draft. Try again.',
  MARK_FAILED: 'Could not mark this draft as sent. Try again.',
  DISCARD_FAILED: 'Could not discard this draft. Try again.',
  TICKET_HINT: 'Ticket replies are not sent from Revenact: copy it into the ticket, then mark it as sent.',
  CONNECT: 'Open Connections',
  EDITED: 'Edited',
  LIST_TITLE: 'From your agents',
  LIST_LABEL: 'Drafts from your agents',
  LIST_LOADING: 'Loading drafts from your agents',
  LIST_EMPTY: 'No drafts from your agents.',
  LIST_LOAD: 'Could not load drafts from your agents.',
  MAILBOX_TITLE: 'In your mailbox',
  TRY_AGAIN: 'Try again',
} as const;

/** `?draft=<id>` (Activity's, the bell's, the queue's and the mailbox's link), or null. */
export function draftParam(params: URLSearchParams): number | null {
  const value = params.get('draft') ?? '';
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

/** The page's own query with `draft` set: the mailbox keeps its `source`. */
export function withDraft(search: string, id: number): string {
  const next = new URLSearchParams(search);
  next.set('draft', String(id));
  return `?${next.toString()}`;
}

/** Back to the inbox: the same Communications query without `draft`. */
export function withoutDraft(search: string): string {
  const next = new URLSearchParams(search);
  next.delete('draft');
  const text = next.toString();
  return `/communications${text ? `?${text}` : ''}`;
}

export const recipientsText = (to: [string, string][]): string => to.map(([name, address]) => (name ? `${name} <${address}>` : address)).join(', ');

export const draftByText = (agent: AgentKind): string => `The ${AGENT_LABEL[agent]} drafted a reply.`;

export function draftHeading(draft: ReplyDraft): string {
  if (draft.source.kind === 'email') return `Reply to ${draft.source.from.name || draft.source.from.address}`;
  return `Reply on ${draft.source.number}`;
}

/** What the draft answers, as one sentence. */
export function sourceText(draft: ReplyDraft): string {
  const source = draft.source;
  if (source.kind === 'email') {
    const who = source.from.name ? `${source.from.name} <${source.from.address}>` : source.from.address;
    return `${who} wrote "${source.subject}" on ${formatDate(source.sent_at.slice(0, 10))}.`;
  }
  return `${source.number} "${source.title}"${source.source_name ? ` in ${source.source_name}` : ''}.`;
}

export const notOwnerText = (draft: ReplyDraft): string => `Only ${draft.owner.name} can change or send this draft.`;

/** The read-only line on a sent draft. */
export function sentText(draft: ReplyDraft): string {
  const verb = draft.channel === 'email' ? 'Sent' : 'Marked as sent';
  const day = draft.sent_at ? ` on ${formatDate(draft.sent_at.slice(0, 10))}` : '';
  const by = draft.sent_by ? ` by ${draft.sent_by.name}` : '';
  return `${verb}${day}${by}.`;
}

/** The status line after Send or Mark as sent (Decision 6). */
export const sentNotice = (draft: ReplyDraft): string => (draft.channel === 'email' && draft.to ? `Sent to ${recipientsText(draft.to)}.` : 'Marked as sent.');

/** Decision 5: the source's name only when there is a place to open. */
export const copyLabel = (source: TicketDraftSource): string => (source.external_url && source.source_name ? `Copy and open in ${source.source_name}` : DRAFTS.COPY);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/agents/draftsText.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/draftsText.ts src/features/agents/draftsText.test.ts
git commit -m "feat(agents): add the reply drafts' words and the ?draft= link helpers

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `DraftForm`: the owner's editor

**Files:**
- Create: `src/components/agents/DraftForm.tsx`
- Test: `src/components/agents/DraftForm.test.tsx`

**Interfaces:**
- Consumes: Task 5's API and types; Task 6's words; `refusalCode`, `refusalDetail` (`agentsApi.ts`); `useSubmitOnce` (`src/components/plans/useSubmitOnce.ts`); `ConfirmDialog` (`src/components/organizations/ConfirmDialog.tsx`, throws a string to show it); `CONTROL` (`src/components/organizations/activity/formStyles.ts`); `BUTTON`, `PRIMARY`, `QUIET`, `FOCUS` (`src/components/organizations/portfolio/styles.ts`); `errorMessage` (`src/components/organizations/portfolio/usePagedRead.ts`).
- Produces:

```ts
export function DraftForm(props: {
  draft: ReplyDraft; // open, and `can_edit`
  /** The server's draft after a write; `text` goes to the panel's status line, which takes focus when `focus`. */
  onAnswer: (draft: ReplyDraft, text: string, focus: boolean) => void;
  /** ALREADY_SENT or NOT_YOURS: the panel shows `text` and reads the draft again. */
  onStale: (text: string) => void;
  onDiscarded: () => void;
}): JSX.Element
```

- [ ] **Step 1: Write the failing test**

Create `src/components/agents/DraftForm.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { calls, sent } from '../../features/agents/testAgents';
import { DRAFT_EMAIL, DRAFT_TICKET, stubDrafts } from '../../features/agents/testDrafts';
import type { ReplyDraft, TicketDraftSource } from '../../features/agents/draftTypes';
import { DraftForm } from './DraftForm';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const mount = (draft: ReplyDraft) => {
  const onAnswer = vi.fn();
  const onStale = vi.fn();
  const onDiscarded = vi.fn();
  render(
    <MemoryRouter>
      <DraftForm draft={draft} onAnswer={onAnswer} onStale={onStale} onDiscarded={onDiscarded} />
    </MemoryRouter>,
  );
  return { onAnswer, onStale, onDiscarded };
};

describe('DraftForm: an email draft (Decisions 2 to 6)', () => {
  it('shows To as text, Subject and Reply as fields, Send as the one primary', () => {
    stubDrafts();
    mount(DRAFT_EMAIL);
    expect(screen.getByText('Ann Lee <ann@x.com>')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'To' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveValue('Re: Renewal terms');
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue(DRAFT_EMAIL.body);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves only the changed field and says Saved. without moving focus', async () => {
    const { spy } = stubDrafts();
    const { onAnswer } = mount(DRAFT_EMAIL);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Subject' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Subject' }), 'Re: Renewal terms, revised');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalled());
    expect(sent(spy, 'PATCH', '/communications/drafts/7/')).toEqual([{ subject: 'Re: Renewal terms, revised' }]);
    expect(onAnswer.mock.calls[0][0]).toMatchObject({ subject: 'Re: Renewal terms, revised', edited: true });
    expect(onAnswer.mock.calls[0].slice(1)).toEqual(['Saved.', false]);
  });

  it('sends once, with the edits, and hands up the sent draft with focus', async () => {
    const { spy } = stubDrafts();
    const { onAnswer } = mount(DRAFT_EMAIL);
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), ' See you Friday.');
    await userEvent.dblClick(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(1));
    expect(calls(spy, 'POST', '/send/')).toEqual(['/communications/drafts/7/send/']);
    expect(sent(spy, 'POST', '/send/')).toEqual([{ body: `${DRAFT_EMAIL.body} See you Friday.` }]);
    expect(onAnswer.mock.calls[0][0].status).toBe('sent');
    expect(onAnswer.mock.calls[0].slice(1)).toEqual(['Sent to Ann Lee <ann@x.com>.', true]);
  });

  it('shows a field error under its field, in the server words, and focuses the field', async () => {
    stubDrafts();
    mount(DRAFT_EMAIL);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Reply' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), ' ');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    const reply = screen.getByRole('textbox', { name: 'Reply' });
    expect(await screen.findByText('Write the reply.')).toBeInTheDocument();
    expect(reply).toHaveAttribute('aria-invalid', 'true');
    expect(reply).toHaveAccessibleDescription('Write the reply.');
    await waitFor(() => expect(reply).toHaveFocus());
  });

  it('says NO_MAILBOX in the server words with a way to Connections, and focuses the alert', async () => {
    stubDrafts({ mailbox: false });
    mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Connect your mailbox to send this.');
    expect(within(alert).getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("shows the provider's refusal in the server words", async () => {
    stubDrafts({ failNextSend: true });
    mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Your mailbox didn't accept the message. Try again.");
  });

  it('hands ALREADY_SENT to the panel in the server words, with no alert of its own', async () => {
    stubDrafts({ drafts: [{ ...DRAFT_EMAIL, status: 'sent' }] });
    const { onStale } = mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onStale).toHaveBeenCalledWith('This draft has been sent.'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hands NOT_YOURS to the panel in the server words', async () => {
    stubDrafts({ drafts: [{ ...DRAFT_EMAIL, owner: { id: 3, name: 'Carl CSM' } }] });
    const { onStale } = mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onStale).toHaveBeenCalledWith('Only Carl CSM can send this draft.'));
  });

  it('saves twice in a row: a save frees the guard', async () => {
    const { spy } = stubDrafts();
    mount(DRAFT_EMAIL);
    const reply = screen.getByRole('textbox', { name: 'Reply' });
    await userEvent.type(reply, ' One.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls(spy, 'PATCH', '/communications/drafts/7/')).toHaveLength(1));
    await userEvent.type(reply, ' Two.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls(spy, 'PATCH', '/communications/drafts/7/')).toHaveLength(2));
  });

  it('discards after a confirmation, and Cancel keeps it', async () => {
    const { spy } = stubDrafts();
    const { onDiscarded } = mount(DRAFT_EMAIL);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    const dialog = screen.getByRole('dialog', { name: 'Discard this draft?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveFocus();
    expect(calls(spy, 'DELETE', '/communications/drafts/')).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(onDiscarded).toHaveBeenCalledTimes(1));
    expect(calls(spy, 'DELETE', '/communications/drafts/')).toEqual(['/communications/drafts/7/']);
  });
});

describe('DraftForm: a ticket draft (Decisions 3 to 5)', () => {
  it('has no Subject, says why there is no Send, and copies the reply and opens the source', async () => {
    const user = userEvent.setup();
    stubDrafts();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { onAnswer } = mount(DRAFT_TICKET);
    expect(screen.queryByRole('textbox', { name: 'Subject' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.getByText('Ticket replies are not sent from Revenact: copy it into the ticket, then mark it as sent.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy and open in Zendesk' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith(DRAFT_TICKET, 'Copied the reply.', false));
    await expect(navigator.clipboard.readText()).resolves.toBe(DRAFT_TICKET.body);
    expect(open).toHaveBeenCalledWith('https://acme.zendesk.com/agent/tickets/1042', '_blank', 'noopener,noreferrer');
  });

  it('copies without opening anything for a ticket raised in Revenact', async () => {
    const user = userEvent.setup();
    stubDrafts();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    mount({ ...DRAFT_TICKET, source: { ...(DRAFT_TICKET.source as TicketDraftSource), external_url: null, source_name: null } });
    await user.click(screen.getByRole('button', { name: 'Copy the reply' }));
    await expect(navigator.clipboard.readText()).resolves.toBe(DRAFT_TICKET.body);
    expect(open).not.toHaveBeenCalled();
  });

  it('saves an edited reply, then marks it sent', async () => {
    const { spy } = stubDrafts();
    const { onAnswer } = mount(DRAFT_TICKET);
    await userEvent.type(screen.getByRole('textbox', { name: 'Reply' }), ' Thanks.');
    await userEvent.click(screen.getByRole('button', { name: 'Mark as sent' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalled());
    expect(sent(spy, 'PATCH', '/communications/drafts/8/')).toEqual([{ body: `${DRAFT_TICKET.body} Thanks.` }]);
    expect(calls(spy, 'POST', '/mark-sent/')).toEqual(['/communications/drafts/8/mark-sent/']);
    expect(onAnswer.mock.calls[0][0].status).toBe('sent');
    expect(onAnswer.mock.calls[0].slice(1)).toEqual(['Marked as sent.', true]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/agents/DraftForm.test.tsx --maxWorkers=2`
Expected: FAIL with "Failed to resolve import './DraftForm'".

- [ ] **Step 3: Write the form**

Create `src/components/agents/DraftForm.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, MailCheck, Send, Trash2 } from 'lucide-react';
import { refusalCode, refusalDetail } from '../../features/agents/agentsApi';
import { discardDraft, draftFieldErrors, markDraftSent, saveDraft, sendDraft, type DraftField } from '../../features/agents/draftsApi';
import { DRAFTS, copyLabel, recipientsText, sentNotice } from '../../features/agents/draftsText';
import type { DraftPatch, ReplyDraft } from '../../features/agents/draftTypes';
import { ConfirmDialog } from '../organizations/ConfirmDialog';
import { CONTROL } from '../organizations/activity/formStyles';
import { BUTTON, FOCUS, PRIMARY, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from '../plans/useSubmitOnce';

const FIELD = `min-h-11 ${CONTROL}`;
const LABEL = 'text-[11px] font-semibold text-ink-muted';
const FIELD_ERROR = 'text-[11px] text-danger';
const ALERT_LINK = `inline-flex min-h-11 items-center self-start font-semibold text-ink underline sm:min-h-0 ${FOCUS}`;

type Alert = { text: string; connect: boolean };

/** The owner's editor for an open draft (Agents delivery 2; Decisions 2 to 6).
 *  Email: To as text, Subject and Reply; Send (the primary) and Save carry
 *  only the changed fields. Ticket: Reply; Copy and open (the primary), then
 *  Mark as sent, which saves an edited reply first. Discard asks first. Every
 *  refusal is the server's: a field error under its field, ALREADY_SENT and
 *  NOT_YOURS to the panel, anything else in this form's alert. */
export function DraftForm({
  draft,
  onAnswer,
  onStale,
  onDiscarded,
}: {
  draft: ReplyDraft;
  onAnswer: (draft: ReplyDraft, text: string, focus: boolean) => void;
  onStale: (text: string) => void;
  onDiscarded: () => void;
}) {
  const ids = useId();
  const email = draft.channel === 'email';
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject ?? '');
  const [fields, setFields] = useState<Partial<Record<DraftField, string>>>({});
  const [alert, setAlert] = useState<Alert | null>(null);
  const [pending, setPending] = useState<'save' | 'send' | 'mark' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [tick, setTick] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  // Held after a success, so a second click before the panel re-renders the
  // draft as sent sends nothing; Save frees it again (it may save twice).
  const { busy, run, release } = useSubmitOnce({ holdOnSuccess: true });
  useEffect(() => {
    if (tick > 0) alertRef.current?.focus();
  }, [tick]);

  const changes: DraftPatch = {};
  if (body !== draft.body) changes.body = body;
  if (email && subject !== (draft.subject ?? '')) changes.subject = subject;
  const dirty = Object.keys(changes).length > 0;

  function begin(verb: 'save' | 'send' | 'mark') {
    setFields({});
    setAlert(null);
    setPending(verb);
  }

  function refuse(err: unknown, fallback: string) {
    const named = draftFieldErrors(err);
    if (Object.keys(named).length > 0) {
      setFields(named);
      // The first refused field in the page's order.
      (named.subject ? subjectRef : bodyRef).current?.focus();
      return;
    }
    const code = refusalCode(err);
    const text = refusalDetail(err) ?? errorMessage(err, fallback);
    if (code === 'ALREADY_SENT' || code === 'NOT_YOURS') {
      onStale(text);
      return;
    }
    setAlert({ text, connect: code === 'NO_MAILBOX' });
    setTick((n) => n + 1);
  }

  async function save() {
    if (!dirty) return;
    const outcome = await run(() => {
      begin('save');
      return saveDraft(draft.id, changes);
    });
    if (!outcome) return;
    setPending(null);
    if (outcome.ok) {
      release();
      onAnswer(outcome.value, DRAFTS.SAVED, false);
    } else refuse(outcome.error, DRAFTS.SAVE_FAILED);
  }

  async function send() {
    const outcome = await run(() => {
      begin('send');
      return sendDraft(draft.id, changes);
    });
    if (!outcome) return;
    setPending(null);
    if (outcome.ok) onAnswer(outcome.value.draft, sentNotice(outcome.value.draft), true);
    else refuse(outcome.error, DRAFTS.SEND_FAILED);
  }

  async function markSent() {
    const outcome = await run(async () => {
      begin('mark');
      // Decision 4: the record holds what was posted.
      if (dirty) await saveDraft(draft.id, changes);
      return markDraftSent(draft.id);
    });
    if (!outcome) return;
    setPending(null);
    if (outcome.ok) onAnswer(outcome.value, sentNotice(outcome.value), true);
    else refuse(outcome.error, DRAFTS.MARK_FAILED);
  }

  async function copy() {
    if (draft.source.kind !== 'ticket') return;
    const source = draft.source;
    setAlert(null);
    // Decision 5: the write starts inside the click, before a new tab takes focus.
    const copying = navigator.clipboard?.writeText(body) ?? Promise.reject(new Error('No clipboard'));
    if (source.external_url && source.source_name) window.open(source.external_url, '_blank', 'noopener,noreferrer');
    try {
      await copying;
      onAnswer(draft, DRAFTS.COPIED, false);
    } catch {
      setAlert({ text: DRAFTS.COPY_FAILED, connect: false });
      setTick((n) => n + 1);
    }
  }

  const subjectId = `${ids}-subject`;
  const bodyId = `${ids}-body`;
  return (
    <>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void (email ? send() : save());
        }}
      >
        {email && draft.to ? (
          <div className="flex flex-col gap-0.5">
            <span className={LABEL}>{DRAFTS.TO}</span>
            <span data-part="to" className="text-[13px] text-ink">
              {recipientsText(draft.to)}
            </span>
          </div>
        ) : null}
        {email ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={subjectId} className={LABEL}>
              {DRAFTS.SUBJECT}
            </label>
            <input
              id={subjectId}
              ref={subjectRef}
              value={subject}
              aria-invalid={Boolean(fields.subject)}
              aria-describedby={fields.subject ? `${subjectId}-error` : undefined}
              onChange={(event) => {
                setSubject(event.target.value);
                setFields((now) => ({ ...now, subject: undefined }));
              }}
              className={FIELD}
            />
            {fields.subject ? (
              <p id={`${subjectId}-error`} className={FIELD_ERROR}>
                {fields.subject}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-ink-muted">{DRAFTS.TICKET_HINT}</p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={bodyId} className={LABEL}>
            {DRAFTS.BODY}
          </label>
          <textarea
            id={bodyId}
            ref={bodyRef}
            rows={12}
            value={body}
            aria-invalid={Boolean(fields.body)}
            aria-describedby={fields.body ? `${bodyId}-error` : undefined}
            onChange={(event) => {
              setBody(event.target.value);
              setFields((now) => ({ ...now, body: undefined }));
            }}
            className={`${FIELD} max-w-[70ch] leading-relaxed`}
          />
          {fields.body ? (
            <p id={`${bodyId}-error`} className={FIELD_ERROR}>
              {fields.body}
            </p>
          ) : null}
        </div>
        {alert ? (
          <div ref={alertRef} role="alert" tabIndex={-1} className={`flex flex-col gap-1 text-[13px] text-danger ${FOCUS}`}>
            <p>{alert.text}</p>
            {alert.connect ? (
              <Link to="/settings/connections" className={ALERT_LINK}>
                {DRAFTS.CONNECT}
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {email ? (
            <button type="submit" disabled={busy} className={PRIMARY}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {pending === 'send' ? DRAFTS.SENDING : DRAFTS.SEND}
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => void copy()} className={PRIMARY}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                {draft.source.kind === 'ticket' ? copyLabel(draft.source) : DRAFTS.COPY}
              </button>
              <button type="button" disabled={busy} onClick={() => void markSent()} className={BUTTON}>
                <MailCheck className="h-4 w-4" aria-hidden="true" />
                {pending === 'mark' ? DRAFTS.MARKING : DRAFTS.MARK_SENT}
              </button>
            </>
          )}
          <button type={email ? 'button' : 'submit'} disabled={busy || !dirty} onClick={email ? () => void save() : undefined} className={BUTTON}>
            {pending === 'save' ? DRAFTS.SAVING : DRAFTS.SAVE}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={QUIET}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {DRAFTS.DISCARD}
          </button>
        </div>
      </form>
      {confirming ? (
        <ConfirmDialog
          title={DRAFTS.DISCARD_TITLE}
          message={DRAFTS.DISCARD_MESSAGE}
          confirmLabel={DRAFTS.DISCARD}
          danger
          onConfirm={async () => {
            try {
              await discardDraft(draft.id);
            } catch (err) {
              // ConfirmDialog shows a thrown string as its error.
              throw refusalDetail(err) ?? DRAFTS.DISCARD_FAILED;
            }
            onDiscarded();
          }}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/agents/DraftForm.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/DraftForm.tsx src/components/agents/DraftForm.test.tsx
git commit -m "feat(agents): add the reply draft editor with Send, Copy and open, Mark as sent and Discard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `DraftPanel` and `DraftRoute`: the draft read by id

**Files:**
- Create: `src/components/agents/DraftPanel.tsx`
- Test: `src/components/agents/DraftPanel.test.tsx`

**Interfaces:**
- Consumes: `DraftForm` (Task 7); `fetchDraft` (Task 5); Task 6's words; `recordHref` (`src/features/segments/segmentFields.ts`, `(kind, id)`); `Figured`; `EmptyState`, `ErrorBlock` (`src/components/organizations/portfolio/PortfolioSections.tsx`).
- Produces:

```ts
export function DraftPanel(props: { id: number; backTo: string; onChanged?: () => void }): JSX.Element
/** Reads `?draft=` itself; renders nothing without one. `onChanged` runs after a send, a mark-sent or a discard. */
export function DraftRoute(props: { onChanged?: () => void }): JSX.Element | null
```

- [ ] **Step 1: Write the failing test**

Create `src/components/agents/DraftPanel.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DRAFT_CARLS, DRAFT_EMAIL, stubDrafts } from '../../features/agents/testDrafts';
import { Where } from '../../pages/organizations/testList';
import { DraftRoute } from './DraftPanel';

afterEach(() => vi.unstubAllGlobals());

const where = () => screen.getByTestId('where').textContent;
const open = (url: string, onChanged = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <DraftRoute onChanged={onChanged} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return onChanged;
};

describe('DraftPanel (Decisions 1, 6, 7)', () => {
  it('shows a skeleton, then the draft with its heading focused, its agent, record and source', async () => {
    stubDrafts();
    open('/communications?draft=7');
    expect(screen.getByRole('status', { name: 'Loading the draft' })).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Draft reply' });
    const heading = await within(region).findByRole('heading', { level: 1, name: 'Reply to Ann Lee' });
    await waitFor(() => expect(heading).toHaveFocus());
    const meta = region.querySelector('[data-part="meta"]') as HTMLElement;
    expect(meta).toHaveTextContent('The CS agent drafted a reply.');
    expect(within(meta).getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    expect(region.querySelector('[data-part="source"]')).toHaveTextContent('What it answers: Ann Lee <ann@x.com> wrote "Renewal terms" on 6 Oct 2026.');
    expect(within(region).getByRole('textbox', { name: 'Reply' })).toHaveValue(DRAFT_EMAIL.body);
  });

  it('says so when the draft is gone or not the reader to see', async () => {
    stubDrafts();
    open('/communications?draft=404');
    expect(await screen.findByText('Draft not found')).toBeInTheDocument();
    expect(screen.getByText("That draft isn't there any more, or you can't open it.")).toBeInTheDocument();
  });

  it('shows Try again after a failed read, then the draft', async () => {
    stubDrafts({ failRead: 1 });
    open('/communications?draft=7');
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Reply to Ann Lee' })).toBeInTheDocument();
  });

  it('reads someone else draft as text, saying who may change it', async () => {
    stubDrafts();
    open(`/communications?draft=${DRAFT_CARLS.id}`);
    expect(await screen.findByText('Only Carl CSM can change or send this draft.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(document.querySelector('[data-part="body"]')).toHaveTextContent('Thanks for the note on the renewal terms.');
  });

  it('after Send, reads as sent, says so in a focused status line, and tells the page', async () => {
    stubDrafts();
    const onChanged = open('/communications?draft=7');
    await userEvent.click(await screen.findByRole('button', { name: 'Send' }));
    const status = await screen.findByText('Sent to Ann Lee <ann@x.com>.');
    expect(status).toHaveAttribute('role', 'status');
    await waitFor(() => expect(status).toHaveFocus());
    // Figured sets the date's figures in their own spans, so read the line whole.
    expect(document.querySelector('[data-part="read-only"]')).toHaveTextContent('Sent on 8 Oct 2026 by Alice.');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('after ALREADY_SENT, shows the server sentence focused and reads the draft again', async () => {
    const { drafts } = stubDrafts();
    open('/communications?draft=7');
    await screen.findByRole('heading', { level: 1, name: 'Reply to Ann Lee' });
    Object.assign(drafts.get(7)!, { status: 'sent', sent_at: '2026-10-08T09:55:00Z', sent_by: { id: 3, name: 'Carl CSM' }, can_edit: false });
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    const status = await screen.findByText('This draft has been sent.');
    await waitFor(() => expect(status).toHaveFocus());
    await waitFor(() => expect(document.querySelector('[data-part="read-only"]')).toHaveTextContent('Sent on 8 Oct 2026 by Carl CSM.'));
  });

  it('after Discard, says Discarded the draft. focused, and Back keeps the source', async () => {
    stubDrafts();
    const onChanged = open('/communications?source=mailbox%3Agoogle&draft=7');
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard' }));
    const status = await screen.findByText('Discarded the draft.');
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('link', { name: 'Back to the inbox' }));
    await waitFor(() => expect(where()).toBe('/communications?source=mailbox%3Agoogle'));
  });

  it('renders nothing without a draft id', () => {
    stubDrafts();
    open('/communications');
    expect(screen.queryByRole('region', { name: 'Draft reply' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/agents/DraftPanel.test.tsx --maxWorkers=2`
Expected: FAIL with "Failed to resolve import './DraftPanel'".

- [ ] **Step 3: Write the panel**

Create `src/components/agents/DraftPanel.tsx`:

```tsx
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FilePen } from 'lucide-react';
import { ApiError } from '../../lib/apiClient';
import { formatDate } from '../../features/customers/formatters';
import { fetchDraft } from '../../features/agents/draftsApi';
import { DRAFTS, draftByText, draftHeading, draftParam, notOwnerText, recipientsText, sentText, sourceText, withoutDraft } from '../../features/agents/draftsText';
import type { ReplyDraft } from '../../features/agents/draftTypes';
import { recordHref } from '../../features/segments/segmentFields';
import { Figured } from '../brain/Figured';
import { EmptyState, ErrorBlock } from '../organizations/portfolio/PortfolioSections';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { DraftForm } from './DraftForm';

const BACK = `${QUIET} self-start`;
const META_LINK = `inline-flex min-h-11 items-center font-semibold text-ink-muted hover:text-ink hover:underline sm:min-h-0 ${FOCUS}`;
const LABEL = 'text-[11px] font-semibold text-ink-muted';

type DraftLoad = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; draft: ReplyDraft };

/** One draft, read for the reader: `missing` for a 404 (gone, or not
 *  theirs to read); `replace` swaps in a write's answer; `reread` reads
 *  again without the skeleton. */
function useDraft(id: number) {
  const [attempt, setAttempt] = useState(0);
  const key = `${id}#${attempt}`;
  const [answer, setAnswer] = useState<{ key: string; load: DraftLoad } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchDraft(id).then(
      (draft) => {
        if (alive) setAnswer({ key, load: { status: 'ready', draft } });
      },
      (err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setAnswer({ key, load: missing ? { status: 'missing' } : { status: 'failed', message: errorMessage(err, DRAFTS.LOAD) } });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key]);
  const replace = useCallback((draft: ReplyDraft) => setAnswer({ key, load: { status: 'ready', draft } }), [key]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const reread = useCallback(() => {
    fetchDraft(id).then(replace, () => undefined);
  }, [id, replace]);
  const load: DraftLoad = answer?.key === key ? answer.load : { status: 'loading' };
  return { load, replace, retry, reread };
}

function DraftSkeleton() {
  return (
    <div role="status" aria-label={DRAFTS.LOADING} className="flex flex-col gap-3">
      <span aria-hidden="true" className="block h-5 w-56 animate-pulse rounded bg-subtle" />
      <span aria-hidden="true" className="block h-3 w-72 animate-pulse rounded bg-subtle" />
      <span aria-hidden="true" className="block h-10 animate-pulse rounded-lg bg-subtle" />
      <span aria-hidden="true" className="block h-48 animate-pulse rounded-lg bg-subtle" />
    </div>
  );
}

/** Decision 7: a sent draft, or someone else's, as text. */
function DraftReadOnly({ draft }: { draft: ReplyDraft }) {
  return (
    <div className="flex flex-col gap-3">
      <p data-part="read-only" className="text-[13px] text-ink-muted">
        {draft.status === 'sent' ? <Figured text={sentText(draft)} /> : notOwnerText(draft)}
      </p>
      {draft.to ? (
        <div className="flex flex-col gap-0.5">
          <span className={LABEL}>{DRAFTS.TO}</span>
          <span className="text-[13px] text-ink">{recipientsText(draft.to)}</span>
        </div>
      ) : null}
      {draft.subject !== null ? (
        <div className="flex flex-col gap-0.5">
          <span className={LABEL}>{DRAFTS.SUBJECT}</span>
          <span className="text-[13px] text-ink">{draft.subject}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5">
        <span className={LABEL}>{DRAFTS.BODY}</span>
        <p data-part="body" className="max-w-[70ch] whitespace-pre-line text-[13px] text-ink">
          {draft.body}
        </p>
      </div>
    </div>
  );
}

/** A reply draft (Agents delivery 2; Decisions 1, 6, 7): Back, an
 *  always-mounted status line, then the draft: its heading (focused on
 *  arrival), who drafted it on which record, what it answers, and the
 *  owner's form or the read-only view. */
export function DraftPanel({ id, backTo, onChanged }: { id: number; backTo: string; onChanged?: () => void }) {
  const headingId = useId();
  const { load, replace, retry, reread } = useDraft(id);
  const [notice, setNotice] = useState('');
  const [noticeTick, setNoticeTick] = useState(0);
  const [discarded, setDiscarded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const ready = load.status === 'ready';
  useEffect(() => {
    if (ready) headingRef.current?.focus();
  }, [ready]);
  useEffect(() => {
    if (noticeTick > 0) noticeRef.current?.focus();
  }, [noticeTick]);

  function say(text: string, focus: boolean) {
    setNotice(text);
    if (focus) setNoticeTick((n) => n + 1);
  }

  let body: ReactNode = null;
  if (discarded) body = null;
  else if (load.status === 'loading') body = <DraftSkeleton />;
  else if (load.status === 'missing') body = <EmptyState title={DRAFTS.MISSING_TITLE} detail={DRAFTS.MISSING} action={null} />;
  else if (load.status === 'failed') body = <ErrorBlock message={load.message} onRetry={retry} />;
  else {
    const { draft } = load;
    body = (
      <article aria-labelledby={headingId} className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 id={headingId} ref={headingRef} tabIndex={-1} className={`text-[15px] font-semibold text-ink ${FOCUS}`}>
            {draftHeading(draft)}
          </h1>
          <p data-part="meta" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
            <FilePen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{draftByText(draft.agent)}</span>
            <span aria-hidden="true">·</span>
            <Link to={recordHref(draft.record.kind, draft.record.id)} className={META_LINK}>
              {draft.record.name}
            </Link>
            <span aria-hidden="true">·</span>
            <span className={MONO}>{formatDate(draft.created_at.slice(0, 10))}</span>
            {draft.edited ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{DRAFTS.EDITED}</span>
              </>
            ) : null}
          </p>
        </header>
        <p data-part="source" className="max-w-[70ch] rounded-lg bg-subtle px-3 py-2 text-[13px] text-ink">
          <span className="sr-only">{`${DRAFTS.SOURCE}: `}</span>
          <Figured text={sourceText(draft)} />
        </p>
        {draft.status === 'open' && draft.can_edit ? (
          <DraftForm
            draft={draft}
            onAnswer={(next, text, focus) => {
              replace(next);
              say(text, focus);
              if (next.status === 'sent') onChanged?.();
            }}
            onStale={(text) => {
              say(text, true);
              reread();
            }}
            onDiscarded={() => {
              setDiscarded(true);
              say(DRAFTS.DISCARDED, true);
              onChanged?.();
            }}
          />
        ) : (
          <DraftReadOnly draft={draft} />
        )}
      </article>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to={backTo} className={BACK}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {DRAFTS.BACK}
      </Link>
      {/* Always mounted, so what a write says lands in a live region that already exists. */}
      <p ref={noticeRef} role="status" tabIndex={-1} className={`text-[13px] text-ink empty:hidden ${FOCUS}`}>
        {notice}
      </p>
      {body}
    </div>
  );
}

/** `/communications?draft=<id>` (Decision 1): the draft in place of the
 *  inbox or mailbox card. Back drops only `draft`. */
export function DraftRoute({ onChanged }: { onChanged?: () => void }) {
  const [params] = useSearchParams();
  const { search } = useLocation();
  const id = draftParam(params);
  if (id === null) return null;
  return (
    <section aria-label={DRAFTS.REGION} className="flex min-w-0 flex-1 flex-col overflow-y-auto rounded-xl bg-surface p-4 shadow-sm">
      <DraftPanel key={id} id={id} backTo={withoutDraft(search)} onChanged={onChanged} />
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/agents/DraftPanel.test.tsx src/components/agents/DraftForm.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/DraftPanel.tsx src/components/agents/DraftPanel.test.tsx
git commit -m "feat(agents): add the reply draft panel and its ?draft= route

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Communications opens a draft, and the queue points at one

**Files:**
- Create: `src/components/agents/DraftLine.tsx`
- Modify: `src/features/communications/communicationsSlice.ts:1-3` (import), `:50-75` (`CommunicationRow`)
- Modify: `src/pages/communications/CommunicationsPage.tsx:23-46` (imports), `:58-67`, `:172-176`
- Modify: `src/pages/communications/DetailPane.tsx:1-7`, `:193-210`
- Test: `src/pages/communications/CommunicationsPage.test.tsx`

**Interfaces:**
- Consumes: `DraftRoute` (Task 8); `draftParam`, `draftByText` (Task 6); `draftHref`, `AGENTS.OPEN_DRAFT` (Task 1); `QueueDraft` (Task 5).
- Produces: `CommunicationRow.draft?: QueueDraft | null`; `DraftLine({ draft }: { draft: QueueDraft })`.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/communications/CommunicationsPage.test.tsx` (add imports `import { stubDrafts } from '../../features/agents/testDrafts';` and `import { DRAFT_EMAIL_ID } from '../../features/agents/testAgentsFixtures';`):

```tsx
describe('CommunicationsPage: agent drafts (Agents delivery 2, Decision 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const chain = (overrides: Parameters<typeof mockApi>[0] = {}) => {
    const spy = mockApi(overrides);
    return stubDrafts({ passThrough: (input, init) => spy(String(input), init) });
  };
  const queueReads = (spy: ReturnType<typeof stubDrafts>['spy']) =>
    spy.mock.calls.filter(([input, init]) => new URL(String(input)).pathname === '/api/v1/communications/' && (init?.method ?? 'GET') === 'GET').length;

  it('opens ?draft= in place of the inbox card, with Back to the inbox', async () => {
    chain();
    renderPage(`/communications?draft=${DRAFT_EMAIL_ID}`);
    const region = await screen.findByRole('region', { name: 'Draft reply' });
    expect(await within(region).findByRole('heading', { level: 1, name: 'Reply to Ann Lee' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Inbox' })).toBeNull();
    expect(within(region).getByRole('link', { name: 'Back to the inbox' })).toHaveAttribute('href', '/communications');
  });

  it('shows the queue line for a row with a draft, and opens the draft from it', async () => {
    chain({ rows: [{ ...emailRow, draft: { id: DRAFT_EMAIL_ID, agent: 'cs', created_at: '2026-10-08T00:46:00Z' } }, ticketRow] });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Dana Whitfield/ }));
    const line = await screen.findByText('The CS agent drafted a reply.');
    const link = within(line.closest('[data-part="draft"]') as HTMLElement).getByRole('link', { name: 'Open draft' });
    expect(link).toHaveAttribute('href', `/communications?draft=${DRAFT_EMAIL_ID}`);
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { level: 1, name: 'Reply to Ann Lee' })).toBeInTheDocument();
  });

  it('shows no draft line on a row without one', async () => {
    chain();
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Dana Whitfield/ }));
    await screen.findByRole('region', { name: 'Conversation' });
    expect(document.querySelector('[data-part="draft"]')).toBeNull();
  });

  it('reads the queue again after a draft is sent', async () => {
    const { spy } = chain();
    renderPage(`/communications?draft=${DRAFT_EMAIL_ID}`);
    const send = await screen.findByRole('button', { name: 'Send' });
    const before = queueReads(spy);
    await userEvent.click(send);
    await screen.findByText('Sent to Ann Lee <ann@x.com>.');
    await waitFor(() => expect(queueReads(spy)).toBeGreaterThan(before));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/communications/CommunicationsPage.test.tsx --maxWorkers=2`
Expected: FAIL (no "Draft reply" region; no draft line).

- [ ] **Step 3: Type the row's draft and add the line**

In `src/features/communications/communicationsSlice.ts`, after line 3 add `import type { QueueDraft } from '../agents/draftTypes';`, and in `CommunicationRow` after `external_url: string;` add:

```ts
  /** The reader's own open agent draft for this email or ticket (Agents
   *  delivery 2); null when there is none. Question and call rows leave it out. */
  draft?: QueueDraft | null;
```

Create `src/components/agents/DraftLine.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { FilePen } from 'lucide-react';
import { AGENTS, draftHref } from '../../features/agents/agentsText';
import { draftByText } from '../../features/agents/draftsText';
import type { QueueDraft } from '../../features/agents/draftTypes';
import { FOCUS } from '../organizations/portfolio/styles';

const OPEN = `inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-0 ${FOCUS}`;

/** The queue's line under an email or ticket the reader has an open agent
 *  draft for (Agents delivery 2): who drafted it, and Open draft. */
export function DraftLine({ draft }: { draft: QueueDraft }) {
  return (
    <p data-part="draft" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-subtle px-3 py-2 text-[13px] text-ink">
      <FilePen className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <span>{draftByText(draft.agent)}</span>
      <Link to={draftHref(draft.id)} className={OPEN}>
        {AGENTS.OPEN_DRAFT}
      </Link>
    </p>
  );
}
```

In `src/pages/communications/DetailPane.tsx`, add `import { DraftLine } from '../../components/agents/DraftLine';` after the `TranslateBlock` import, and between the body `</div>` (line 208) and `{composer ? (` insert:

```tsx
      {row.draft ? (
        <div className="shrink-0 px-4.5 pb-3">
          <DraftLine draft={row.draft} />
        </div>
      ) : null}
```

- [ ] **Step 4: Mount the draft on the page**

In `src/pages/communications/CommunicationsPage.tsx`:
- add after the `NextEventCard` import:

```tsx
import { DraftRoute } from '../../components/agents/DraftPanel';
import { draftParam } from '../../features/agents/draftsText';
```

- add to the header comment, after "with this product's triage on top.":

```tsx
// With ?draft=<id> (an agent's reply draft: from Activity, the bell, a queue
// row or the mailbox's Drafts) the card is the draft instead; the rail stays
// (Agents delivery 2, Decision 1).
```

- after `const mailboxSource = source.startsWith('mailbox:');` add:

```tsx
  // A draft takes the card whatever the source, so its link works from anywhere.
  const draftOpen = draftParam(params) !== null;
```

- replace `{mailboxSource ? (` (line 174) with:

```tsx
        {draftOpen ? (
          <DraftRoute
            onChanged={() => {
              // A sent reply is no longer owed: the queue and its counts read again.
              if (mailboxSource) return;
              dispatch(fetchCommunications({ scope, mode, kind, search }));
              dispatch(fetchCommunicationsStats(scope));
            }}
          />
        ) : mailboxSource ? (
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/pages/communications src/features/communications --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/agents/DraftLine.tsx src/features/communications/communicationsSlice.ts src/pages/communications/CommunicationsPage.tsx src/pages/communications/DetailPane.tsx src/pages/communications/CommunicationsPage.test.tsx
git commit -m "feat(communications): open an agent draft in place of the inbox, and point the queue at it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Mailbox › Drafts: "From your agents"

**Files:**
- Create: `src/components/agents/AgentDraftsList.tsx`
- Modify: `src/pages/communications/MailboxView.tsx:28-32` (imports), `:176-178`
- Test: `src/pages/communications/MailboxView.test.tsx`

**Interfaces:**
- Consumes: `listDrafts` (Task 5); `DRAFTS`, `recipientsText`, `withDraft` (Task 6); `AGENT_LABEL`.
- Produces: `AgentDraftsList()`: a `section[data-part="agent-drafts"]` headed "From your agents", with a skeleton, an error with Try again, "No drafts from your agents.", or a list labelled "Drafts from your agents" whose rows link to the page's query plus `draft=<id>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/communications/MailboxView.test.tsx` (add `import { stubDrafts } from '../../features/agents/testDrafts';`):

```tsx
describe('MailboxView: drafts from your agents (Agents delivery 2, Decision 10)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const drafts = (options: Parameters<typeof stubDrafts>[0] = {}) => {
    mockApi();
    const mailbox = vi.mocked(fetch);
    return stubDrafts({ ...options, passThrough: (input, init) => mailbox(String(input), init) as Promise<unknown> });
  };
  const openDrafts = async () => {
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await userEvent.click(within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /^Drafts/ }));
    return mailbox;
  };

  it('lists the reader own email drafts above the mailbox drafts, and opens one keeping the source', { timeout: 15000 }, async () => {
    const { spy } = drafts();
    renderMailbox();
    const mailbox = await openDrafts();
    const list = await within(mailbox).findByRole('list', { name: 'Drafts from your agents' });
    expect(spy.mock.calls.some(([input]) => String(input).endsWith('/communications/drafts/?channel=email'))).toBe(true);
    const row = within(list).getByRole('link', { name: /Re: Renewal terms/ });
    expect(row).toHaveTextContent('Ann Lee <ann@x.com>');
    expect(row).toHaveTextContent('Pizza Hut');
    expect(row).toHaveTextContent('CS agent');
    expect(within(mailbox).getByRole('heading', { level: 2, name: 'In your mailbox' })).toBeInTheDocument();
    await userEvent.click(row);
    expect(await screen.findByRole('heading', { level: 1, name: 'Reply to Ann Lee' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the inbox' })).toHaveAttribute('href', '/communications?source=mailbox%3Agoogle');
  });

  it('says when there are none', { timeout: 15000 }, async () => {
    drafts({ drafts: [] });
    renderMailbox();
    const mailbox = await openDrafts();
    expect(await within(mailbox).findByText('No drafts from your agents.')).toBeInTheDocument();
  });

  it('shows a skeleton, then Try again after a failed read', { timeout: 15000 }, async () => {
    drafts({ failList: 1 });
    renderMailbox();
    const mailbox = await openDrafts();
    expect(within(mailbox).getByRole('status', { name: 'Loading drafts from your agents' })).toBeInTheDocument();
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Try again' }));
    expect(await within(mailbox).findByRole('list', { name: 'Drafts from your agents' })).toBeInTheDocument();
  });

  it('shows nothing of the agents outside the Drafts folder', { timeout: 15000 }, async () => {
    drafts();
    renderMailbox();
    await screen.findByRole('region', { name: 'Mailbox' });
    expect(document.querySelector('[data-part="agent-drafts"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/communications/MailboxView.test.tsx --maxWorkers=2`
Expected: FAIL (no "Drafts from your agents" list).

- [ ] **Step 3: Write the list**

Create `src/components/agents/AgentDraftsList.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FilePen } from 'lucide-react';
import { AGENT_LABEL } from '../../features/agents/agentsText';
import { listDrafts } from '../../features/agents/draftsApi';
import { DRAFTS, recipientsText, withDraft } from '../../features/agents/draftsText';
import type { ReplyDraft } from '../../features/agents/draftTypes';
import { formatDate } from '../../features/customers/formatters';
import { FOCUS, MONO, QUIET } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';

const ROW_LINK = `flex min-h-11 min-w-0 flex-col justify-center gap-0.5 px-3 py-2 hover:bg-subtle active:bg-line-subtle ${FOCUS}`;

type Answer = { key: number; rows: ReplyDraft[] | null; error: string | null };

function Dot() {
  return <span aria-hidden="true">·</span>;
}

/** Mailbox › Drafts, above the provider's drafts (Agents delivery 2,
 *  Decision 10): the reader's own open email drafts from their agents. Each
 *  opens the draft in place of the mailbox card, keeping `source`. */
export function AgentDraftsList() {
  const { search } = useLocation();
  const headingId = useId();
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  useEffect(() => {
    let alive = true;
    listDrafts({ channel: 'email' }).then(
      ({ results }) => {
        if (alive) setAnswer({ key: attempt, rows: results, error: null });
      },
      (err: unknown) => {
        if (alive) setAnswer({ key: attempt, rows: null, error: errorMessage(err, DRAFTS.LIST_LOAD) });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);
  const current = answer?.key === attempt ? answer : null;
  const rows = current?.rows ?? null;
  return (
    <section aria-labelledby={headingId} data-part="agent-drafts" className="mb-4 flex flex-col gap-2">
      <h2 id={headingId} className="text-[13px] font-semibold text-ink">
        {DRAFTS.LIST_TITLE}
      </h2>
      {!current ? (
        <div role="status" aria-label={DRAFTS.LIST_LOADING} className="flex flex-col gap-1.5">
          {[0, 1].map((n) => (
            <span key={n} aria-hidden="true" className="block h-12 animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      ) : null}
      {current?.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
          <span>{current.error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${QUIET} border border-line`}>
            {DRAFTS.TRY_AGAIN}
          </button>
        </div>
      ) : null}
      {rows && rows.length === 0 ? <p className="text-[13px] text-ink-muted">{DRAFTS.LIST_EMPTY}</p> : null}
      {rows && rows.length > 0 ? (
        <ul aria-label={DRAFTS.LIST_LABEL} className="flex flex-col divide-y divide-line-subtle overflow-hidden rounded-xl bg-surface">
          {rows.map((draft) => (
            <li key={draft.id} data-draft={draft.id}>
              <Link to={withDraft(search, draft.id)} className={ROW_LINK}>
                <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink">
                  <FilePen className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span className="truncate">{draft.subject ?? ''}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
                  <span>{draft.to ? recipientsText(draft.to) : ''}</span>
                  <Dot />
                  <span>{draft.record.name}</span>
                  <Dot />
                  <span>{AGENT_LABEL[draft.agent]}</span>
                  {draft.edited ? (
                    <>
                      <Dot />
                      <span>{DRAFTS.EDITED}</span>
                    </>
                  ) : null}
                  <Dot />
                  <span className={MONO}>{formatDate(draft.created_at.slice(0, 10))}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Mount it in the Drafts folder**

In `src/pages/communications/MailboxView.tsx`:
- add `import { AgentDraftsList } from '../../components/agents/AgentDraftsList';` and `import { DRAFTS } from '../../features/agents/draftsText';` after the `syncMailbox` import;
- replace line 178 (`{folder === 'inbox' && !unread && !priority ? <CategoriesBlock ... /> : null}`) with:

```tsx
              {folder === 'inbox' && !unread && !priority ? <CategoriesBlock blocks={summary?.categories ?? []} active={category} onPick={(c) => dispatch(toggleMailCategory(c))} /> : null}
              {folder === 'drafts' ? (
                <>
                  {/* Agents delivery 2: Revenact's own drafts first, then the provider's. */}
                  <AgentDraftsList />
                  <h2 className="mb-2 text-[13px] font-semibold text-ink">{DRAFTS.MAILBOX_TITLE}</h2>
                </>
              ) : null}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/pages/communications --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/agents/AgentDraftsList.tsx src/pages/communications/MailboxView.tsx src/pages/communications/MailboxView.test.tsx
git commit -m "feat(communications): list drafts from your agents in the mailbox's Drafts folder

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The bell's `agent_draft_ready`

**Files:**
- Modify: `src/features/notifications/types.ts:50-53`
- Modify: `src/components/layout/NotificationKindIcon.tsx`
- Test: `src/components/layout/NotificationKindIcon.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NotificationKind` gains `'agent_draft_ready'`, drawn with Lucide `FilePen`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe` of `src/components/layout/NotificationKindIcon.test.tsx`:

```tsx
  it('draws FilePen for agent_draft_ready (Agents delivery 2, Decision 14)', () => {
    const { container } = render(<NotificationKindIcon kind="agent_draft_ready" />);
    expect(container.querySelector('[data-kind-icon="agent_draft_ready"]')).toHaveAttribute('aria-hidden', 'true');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/layout/NotificationKindIcon.test.tsx --maxWorkers=2`
Expected: FAIL (no icon is drawn for the kind).

- [ ] **Step 3: Add the kind and its icon**

In `src/features/notifications/types.ts`, replace `  | 'agent_action_undone';` with:

```ts
  | 'agent_action_undone'
  // "The CS agent drafted a reply to Ann Lee on Dough Co." for a draft's
  // owner when a draft.reply applies (not when they approved it themselves),
  // linking to /communications?draft=<id> (Agents delivery 2 contract).
  | 'agent_draft_ready';
```

In `src/components/layout/NotificationKindIcon.tsx`:
- add `FilePen` to the lucide import (alphabetical: after `ClipboardList`);
- change the comment's last line to ` *  §2.5, Work spec §1.3, §2.2, §3.2, Agents deliveries 1 and 2). */`;
- add `  agent_draft_ready: FilePen,` after `agent_action_undone: Undo2,`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/layout src/components/plans/houseRules.test.ts --maxWorkers=2`
Expected: PASS (the plans suite scans this icon file too).

- [ ] **Step 5: Commit**

```bash
git add src/features/notifications/types.ts src/components/layout/NotificationKindIcon.tsx src/components/layout/NotificationKindIcon.test.tsx
git commit -m "feat(notifications): draw agent_draft_ready in the bell

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Plans data: the Draft status, Start plan and the stub

**Files:**
- Modify: `src/features/plans/planTypes.ts:1-9`, `:61-81`, `:121-126`, `:196-201`
- Modify: `src/features/plans/planOptions.ts:12-24`, `:44-63`
- Modify: `src/features/plans/planParams.ts`
- Modify: `src/features/plans/planText.ts:15`, `:117-125`
- Modify: `src/features/plans/planApi.ts`
- Modify: `src/features/plans/testPlans.ts`
- Modify (fixture literals gain the two new row fields): `src/components/plans/parts.test.tsx:12`, `src/components/plans/RecordPlans.test.tsx:20`, `src/features/canvas/testCanvasFixtures.ts:93`, `src/features/plans/planText.test.ts:29`
- Test: `src/features/plans/planParams.test.ts`, `src/features/plans/planText.test.ts`, `src/features/plans/planApi.test.ts`

**Interfaces:**
- Consumes: `AgentKind` (`features/agents/agentTypes.ts`).
- Produces:
  - `PlanStatus` gains `'draft'`; `PlanRow.pending_tasks: number`; `PlanRow.started_by_agent: AgentKind | null`; `PlanCounts = Record<Exclude<PlanStatus, 'draft'>, number> & { draft?: number }` (`PlansPage.counts`); `NotDraftBody = { code: 'NOT_DRAFT'; detail: string }`.
  - `STATUSES` starts with `'draft'`; `STATUS_LABEL.draft = 'Draft'`; `CHECK.START_DRAFT = 'Start a draft plan with Start plan.'`.
  - `StatusFilter` gains `'draft'`; `PlanParams.drafts: boolean` (`?drafts=1`); `listQuery` All asks for `open`, `draft`, `done`, `cancelled`.
  - `isDraft(status)`, `isEditable(status)` (open or draft), `draftNotice(n)`, `pendingText(n)`; `moveRefusal` refuses a move from or to Draft with `CHECK.START_DRAFT`.
  - `startDraftPlan(id): Promise<Plan>` (`POST /plans/<id>/start/`).
  - Stub: `StoredPlan.agent?`, `StoredPlan.pending?: { milestone: number; task: StoredTask }[]`; fixture `PIZZA_ONBOARDING_DRAFT` (48, Draft, 3 tasks pending, started by the CS agent; not in `PLANS`); `SERVER.NOT_DRAFT`, `SERVER.START_DRAFT`; route `POST /plans/<id>/start/`.

- [ ] **Step 1: Write the failing tests**

In `src/features/plans/planParams.test.ts`:
- line 28 becomes `      scope: 'tasks', kind: 'save', owner: 4, status: 'all', q: 'pizza', cancelled: true, drafts: false,`;
- line 47 becomes `      'owner=4&mine=tasks&kind=save&q=pizza&status=open&status=draft&status=done&status=cancelled',`;
- line 56 becomes `    expect(cleared({ scope: 'tasks', kind: 'save', owner: 4, status: 'all', q: 'x', cancelled: true, drafts: true })).toEqual({ ...DEFAULT_PARAMS, scope: 'tasks', cancelled: true, drafts: true });`;
- append inside the `describe`:

```ts
  it('reads and writes the Draft filter and the board Show drafts (Decision 11)', () => {
    expect(parse('status=draft&drafts=1')).toEqual({ ...DEFAULT_PARAMS, status: 'draft', drafts: true });
    expect(toPlanSearch({ ...DEFAULT_PARAMS, status: 'draft', drafts: true })).toEqual({ status: 'draft', drafts: '1' });
    expect(listQuery({ ...DEFAULT_PARAMS, status: 'draft' }, 'all')).toBe('status=draft');
    expect(columnQuery(DEFAULT_PARAMS, 'all', 'draft')).toBe('status=draft');
  });
```

In `src/features/plans/planText.test.ts`, add `pending_tasks: 0, started_by_agent: null,` after `can_edit: true,` on line 29, add `draftNotice`, `isDraft`, `isEditable`, `pendingText` to the `./planText` import, and append:

```ts
describe('Draft plans (Agents delivery 2, Decisions 11 and 12)', () => {
  it('keeps Draft out of open, but editable', () => {
    expect(isOpen('draft')).toBe(false);
    expect(isDraft('draft')).toBe(true);
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('done')).toBe(false);
    expect(STATUS_LABEL.draft).toBe('Draft');
  });

  it('words the banner and the row figure', () => {
    expect(draftNotice(9)).toBe('This plan is a draft: Start plan creates its 9 tasks, due from today.');
    expect(draftNotice(1)).toBe('This plan is a draft: Start plan creates its 1 task, due from today.');
    expect(pendingText(9)).toEqual({ n: 9, text: 'tasks to start' });
    expect(pendingText(1)).toEqual({ n: 1, text: 'task to start' });
  });

  it('refuses a board move from or to Draft in the server words', () => {
    expect(moveRefusal({ ...ROW, status: 'draft' }, 'on_track')).toBe('Start a draft plan with Start plan.');
    expect(moveRefusal(ROW, 'draft')).toBe('Start a draft plan with Start plan.');
  });
});
```

(`isOpen`, `moveRefusal`, `STATUS_LABEL` and `ROW` are already in that file; add any that its imports lack.)

In `src/features/plans/planApi.test.ts`:
- line 45 becomes `    expect(page.counts).toEqual({ draft: 0, not_started: 2, on_track: 1, at_risk: 1, done: 1, cancelled: 1 });`;
- add `startDraftPlan` to the `./planApi` import and `GLOBEX_ONBOARDING`, `PIZZA_ONBOARDING_DRAFT`, `PLANS`, `SERVER`, `TODAY` to the `./testPlans` import (keep what is there), then append:

```ts
describe('Start plan on a Draft (Agents delivery 2 contract, "Plans")', () => {
  it('lists a Draft only when asked, never as open, with its pending tasks and agent', async () => {
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    expect(ids((await fetchPlans('status=open')).results)).not.toContain(48);
    const drafts = await fetchPlans('status=draft');
    expect(drafts.results).toEqual([expect.objectContaining({ id: 48, status: 'draft', pending_tasks: 3, started_by_agent: 'cs', tasks_total: 0 })]);
    expect(drafts.counts.draft).toBe(1);
  });

  it('starts a Draft: its tasks come back due from today and it is Not started', async () => {
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    const plan = await startDraftPlan(48);
    expect(plan).toMatchObject({ status: 'not_started', start_date: TODAY, pending_tasks: 0, tasks_total: 3 });
    expect(plan.milestones[0].tasks.map((task) => task.due_date)).toEqual([TODAY, '2026-10-07']);
  });

  it('refuses NOT_DRAFT and PLAN_OPEN in the server words', async () => {
    const clash = { ...GLOBEX_ONBOARDING, id: 49, record: { kind: 'organization' as const, id: 7, name: 'Pizza Hut' } };
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT, clash] });
    await expect(startDraftPlan(41)).rejects.toMatchObject({ status: 409, body: { code: 'NOT_DRAFT', detail: SERVER.NOT_DRAFT } });
    await expect(startDraftPlan(48)).rejects.toMatchObject({ status: 409, body: { code: 'PLAN_OPEN', plan_id: 49, detail: SERVER.PLAN_OPEN } });
  });
});
```

(`ids` and `fetchPlans` are already used in that file.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/plans --maxWorkers=2`
Expected: FAIL (`PIZZA_ONBOARDING_DRAFT` is not exported; `drafts` is not a param; `isDraft` is not defined).

- [ ] **Step 3: Types, options, params and text**

In `src/features/plans/planTypes.ts`:
- after line 4 add `import type { AgentKind } from '../agents/agentTypes';`;
- line 9 becomes:

```ts
/** `draft` (Agents delivery 2) is never open: it is edited, started or deleted. */
export type PlanStatus = 'draft' | 'not_started' | 'on_track' | 'at_risk' | 'done' | 'cancelled';
```

- in `PlanRow`, after `can_edit: boolean;` add:

```ts
  /** The tasks Start plan will create: 0 unless the plan is a Draft (contract question 1). */
  pending_tasks: number;
  /** The agent whose action started the plan (Agents delivery 2). */
  started_by_agent: AgentKind | null;
```

- replace `PlansPage` with:

```ts
/** Every status's count; `draft` only when the server sends it (contract question 2). */
export type PlanCounts = Record<Exclude<PlanStatus, 'draft'>, number> & { draft?: number };

/** GET plans/: `counts` covers the same filters ignoring `status`. */
export interface PlansPage {
  results: PlanRow[];
  next: string | null;
  counts: PlanCounts;
}
```

- after `PlanOpenBody` add:

```ts
/** 409 on POST plans/<id>/start/ when the plan is not a Draft. */
export interface NotDraftBody {
  code: 'NOT_DRAFT';
  detail: string;
}
```

In `src/features/plans/planOptions.ts`:
- `STATUSES` becomes `['draft', 'not_started', 'on_track', 'at_risk', 'done', 'cancelled']`;
- `STATUS_LABEL` gains `draft: 'Draft',` as its first entry;
- `CHECK` gains, after `FINISHED`:

```ts
  START_DRAFT: 'Start a draft plan with Start plan.',
```

In `src/features/plans/planParams.ts`:
- `StatusFilter` becomes `'open' | 'draft' | 'done' | 'cancelled' | 'all'`;
- in `PlanParams`, after `cancelled: boolean;` add:

```ts
  /** The board's Show drafts (Agents delivery 2, Decision 11). */
  drafts: boolean;
```

- `FILTERS` becomes `['open', 'draft', 'done', 'cancelled', 'all']`;
- `DEFAULT_PARAMS` becomes `{ scope: null, kind: '', owner: null, status: 'open', q: '', cancelled: false, drafts: false }`;
- in `parsePlanParams`, after `cancelled: search.get('cancelled') === '1',` add `drafts: search.get('drafts') === '1',`;
- in `toPlanSearch`, after the `cancelled` line add `if (params.drafts) out.drafts = '1';`;
- in `listQuery`, the comment becomes `/** GET plans/ for the List; All is open, draft, done and cancelled. */` and the loop becomes `for (const status of params.status === 'all' ? ['open', 'draft', 'done', 'cancelled'] : [params.status]) query.append('status', status);`;
- `cleared` becomes `return { ...DEFAULT_PARAMS, scope: params.scope, cancelled: params.cancelled, drafts: params.drafts };`.

In `src/features/plans/planText.ts`, after `export const isOpen = …` add:

```ts
/** A Draft (Agents delivery 2) is not open: it is edited, started or deleted. */
export const isDraft = (status: PlanStatus) => status === 'draft';

/** Whether Edit is offered: an open plan, or a Draft. */
export const isEditable = (status: PlanStatus) => isOpen(status) || isDraft(status);

/** A Draft's banner (Decision 12). */
export function draftNotice(n: number): string {
  return `This plan is a draft: Start plan creates its ${n} ${n === 1 ? 'task' : 'tasks'}, due from today.`;
}

/** "9 tasks to start" on a Draft's row and card, the figure apart. */
export function pendingText(n: number): { n: number; text: string } {
  return { n, text: `${n === 1 ? 'task' : 'tasks'} to start` };
}
```

and replace `moveRefusal` with:

```ts
/** Why a board move can't be asked for (Decisions 6, 7; Contract note 6;
 *  Agents delivery 2: a Draft only starts with Start plan), or null. */
export function moveRefusal(row: PlanRow, to: PlanStatus): string | null {
  if (!row.can_edit) return CHECK.NOT_EDITOR;
  if (isDraft(row.status) || to === 'draft') return CHECK.START_DRAFT;
  if (!isOpen(row.status)) return CHECK.FINISHED;
  if (to === 'not_started') return CHECK.NOT_BACK;
  if (to === 'cancelled') return CHECK.CANCEL_ON_PAGE;
  if (to === 'done' && !allMilestonesDone(row)) return CHECK.ALL_MILESTONES_DONE;
  return null;
}
```

In `src/features/plans/planApi.ts`, after `startPlan` add:

```ts
/** A Draft's tasks made again, due from today (Agents delivery 2); 409
 *  `{code: 'NOT_DRAFT', detail}` or `{code: 'PLAN_OPEN', plan_id, detail}`. */
export function startDraftPlan(id: number): Promise<Plan> {
  return apiFetch<Plan>(`${one(id)}start/`, { method: 'POST' });
}
```

Add `pending_tasks: 0, started_by_agent: null,` right after `can_edit: <value>,` in the four row literals: `src/components/plans/parts.test.tsx:12`, `src/components/plans/RecordPlans.test.tsx:20`, `src/features/canvas/testCanvasFixtures.ts:93` and `src/features/plans/planText.test.ts:29` (done above).

- [ ] **Step 4: Teach the stub**

In `src/features/plans/testPlans.ts`:
- add `import type { AgentKind } from '../agents/agentTypes';` after the `vitest` import;
- add to `SERVER`, after `PLAN_OPEN`:

```ts
  NOT_DRAFT: 'Only a draft plan can be started.',
  START_DRAFT: 'Start a draft plan with Start plan.',
```

- in `StoredPlan`, after `milestones: StoredMilestone[];` add:

```ts
  /** The agent whose action started it (Agents delivery 2). */
  agent?: AgentKind | null;
  /** A Draft's snapshotted tasks, made again by Start plan. */
  pending?: { milestone: number; task: StoredTask }[];
```

- after `PIZZA_EMEA_SAVE`, before `PLANS`, add:

```ts
/** Mine, a Draft: the CS agent started it and an undo sent it back, its
 *  three tasks waiting for Start plan. Not in PLANS: a test adds it. */
export const PIZZA_ONBOARDING_DRAFT: StoredPlan = {
  ...BASE, id: 48, name: 'Onboarding · Pizza Hut', kind: 'onboarding', status: 'draft', record: { kind: 'organization', id: 7, name: 'Pizza Hut' },
  owner: ME, start_date: '2026-10-01', template: { id: 1, name: 'Onboarding' }, created_at: '2026-10-01T09:00:00Z', agent: 'cs',
  milestones: [M(481, 'Kick-off', '2026-10-01', []), M(482, 'Set up', '2026-10-15', [])],
  pending: [
    { milestone: 481, task: T(4811, 'Hold the kick-off call', 'high', '2026-10-01', ME) },
    { milestone: 481, task: T(4812, 'Confirm goals and success criteria', 'high', '2026-10-04', ME) },
    { milestone: 482, task: T(4821, 'Connect data sources', 'high', '2026-10-12', CARL) },
  ],
};
```

- in `toPlan`, after `can_edit: plan.can_edit,` add:

```ts
    pending_tasks: plan.status === 'draft' ? (plan.pending?.length ?? 0) : 0,
    started_by_agent: plan.agent ?? null,
```

- in `toRow`, change `tasks_total: full.tasks_total, next_due: full.next_due, is_overdue: full.is_overdue, can_edit: full.can_edit,` to `tasks_total: full.tasks_total, next_due: full.next_due, is_overdue: full.is_overdue, can_edit: full.can_edit, pending_tasks: full.pending_tasks, started_by_agent: full.started_by_agent,`;
- in `planRoute`, after `if (rest === '' && method === 'GET') return { status: 200, body: toPlan(plan) };` add:

```ts
    if (rest === 'start/' && method === 'POST') {
      if (!plan.can_edit) return forbidden;
      if (plan.status !== 'draft') return { status: 409, body: { code: 'NOT_DRAFT', detail: SERVER.NOT_DRAFT } };
      const clash = plans.find(
        (other) => other !== plan && plan.template !== null && other.template?.id === plan.template.id && other.record.kind === plan.record.kind && other.record.id === plan.record.id && isOpen(other.status),
      );
      if (clash) return { status: 409, body: { code: 'PLAN_OPEN', plan_id: clash.id, detail: SERVER.PLAN_OPEN } };
      // Each task's due date moves by (today - start_date); start_date becomes today.
      const shift = daysBetween(plan.start_date, TODAY);
      for (const { milestone, task } of plan.pending ?? []) {
        plan.milestones.find((m) => m.id === milestone)?.tasks.push({ ...task, due_date: addDays(task.due_date, shift) });
      }
      Object.assign(plan, { pending: [], status: 'not_started', status_set_by: 'person', start_date: TODAY });
      return { status: 200, body: toPlan(plan) };
    }
```

- in the PATCH branch, replace `if (!isOpen(plan.status)) return finished;` with:

```ts
      if ('status' in data && (plan.status === 'draft' || data.status === 'draft')) return bad({ status: [SERVER.START_DRAFT] });
      if (!isOpen(plan.status) && plan.status !== 'draft') return finished;
```

- replace `if (structure && plan.can_edit && !isOpen(plan.status)) return finished;` with `if (structure && plan.can_edit && !isOpen(plan.status) && plan.status !== 'draft') return finished;`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/features/plans src/components/plans src/features/canvas --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/plans/planTypes.ts src/features/plans/planOptions.ts src/features/plans/planParams.ts src/features/plans/planText.ts src/features/plans/planApi.ts src/features/plans/testPlans.ts src/features/plans/planParams.test.ts src/features/plans/planText.test.ts src/features/plans/planApi.test.ts src/components/plans/parts.test.tsx src/components/plans/RecordPlans.test.tsx src/features/canvas/testCanvasFixtures.ts
git commit -m "feat(plans): add the Draft status, Start plan and the agent that started a plan

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Plans views show a Draft, never as open

**Files:**
- Modify: `src/components/plans/parts.tsx`
- Modify: `src/components/plans/PlanRowItem.tsx`
- Modify: `src/components/plans/PlanFilters.tsx:15-20`
- Modify: `src/components/plans/PlansBoard.tsx`
- Modify: `src/components/plans/RecordPlans.tsx:39-108`
- Test: `src/components/plans/parts.test.tsx`, `src/components/plans/PlansBoard.test.tsx`, `src/components/plans/RecordPlans.test.tsx`, `src/pages/plans/ProjectsHome.test.tsx`

**Interfaces:**
- Consumes: Task 12's `isDraft`, `pendingText`, `PlanCounts`, `PlanParams.drafts`, `PIZZA_ONBOARDING_DRAFT`.
- Produces: `StatusPill` draws `draft`; `PendingTasks({ n })` in `parts.tsx`; the List's Status filter has Draft; the board's Show drafts adds a Draft column first; a record's plans has a "Draft plans" list.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/plans/parts.test.tsx`, inside its first `describe` (add `PendingTasks` to the `./parts` import, and `screen` to the `@testing-library/react` import):

```tsx
  it('draws Draft as its own pill, and a Draft shows what Start plan will make', () => {
    render(<StatusPill status="draft" />);
    const pill = document.querySelector('[data-status="draft"]') as HTMLElement;
    expect(pill).toHaveTextContent('Draft');
    expect(pill.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    render(<PendingTasks n={9} />);
    expect(screen.getByText('tasks to start')).toHaveTextContent('9 tasks to start');
    expect(screen.getByText('9')).toHaveClass('font-mono-brand');
  });
```

Append to `src/pages/plans/ProjectsHome.test.tsx`, inside its `describe` (add `PIZZA_ONBOARDING_DRAFT` and `PLANS` to the `testPlans` import):

```tsx
  it('keeps a Draft out of Open and shows it under the Draft filter, with its pill and pending tasks', async () => {
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    renderPlans('/projects');
    await waitFor(() => expect(ids()).toHaveLength(4));
    expect(ids()).not.toContain('48');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'draft');
    await waitFor(() => expect(ids()).toEqual(['48']));
    const row = document.querySelector('[data-plan="48"]') as HTMLElement;
    expect(row.querySelector('[data-status="draft"]')).toHaveTextContent('Draft');
    expect(row).toHaveTextContent('3 tasks to start');
    expect(row).not.toHaveTextContent('Nothing left to do');
  });
```

Append to `src/components/plans/PlansBoard.test.tsx`, inside its `describe` (add `PIZZA_ONBOARDING_DRAFT`, `PLANS` to the `testPlans` import):

```tsx
  it('shows drafts only on Show drafts, first, undraggable, with no status menu', async () => {
    const { spy } = stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    await openBoard();
    expect(screen.queryByRole('region', { name: /^Draft/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show drafts' }));
    await waitFor(() => expect(cardIds('Draft')).toEqual(['48']));
    expect(screen.getByTestId('where')).toHaveTextContent('/projects?drafts=1');
    expect(document.querySelector('[data-column]')?.getAttribute('data-column')).toBe('draft');
    const card = within(column('Draft')).getByRole('listitem');
    expect(card).toHaveAttribute('draggable', 'false');
    expect(within(card).queryByRole('combobox')).toBeNull();
    expect(card).toHaveTextContent('3 tasks to start');
    expect(requestsOf(spy, 'GET', /^\/plans\/$/).some((read) => read.query.get('status') === 'draft')).toBe(true);
    expect(screen.getByRole('button', { name: 'Hide drafts' })).toHaveAttribute('aria-pressed', 'true');
  });
```

Append to `src/components/plans/RecordPlans.test.tsx`, inside its first `describe` (add `PIZZA_ONBOARDING_DRAFT`, `PLANS` to the `testPlans` import):

```tsx
  it('lists a Draft in its own list, not under open or finished', async () => {
    stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT] });
    show({ kind: 'organization', id: 7 });
    const drafts = await screen.findByRole('list', { name: 'Draft plans' });
    expect(within(drafts).getByRole('link', { name: 'Onboarding · Pizza Hut' })).toHaveAttribute('href', '/projects/48');
    expect(within(screen.getByRole('list', { name: 'Open plans' })).queryByRole('link', { name: 'Onboarding · Pizza Hut' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Show finished/ })).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/plans src/pages/plans/ProjectsHome.test.tsx --maxWorkers=2`
Expected: FAIL (no Draft pill icon, no Draft option, no Show drafts, the record's draft is filed as finished).

- [ ] **Step 3: The pill and the pending figure**

In `src/components/plans/parts.tsx`:
- add `PencilLine` to the lucide import (after `Network`);
- add `pendingText` to the `planText` import;
- `STATUS_ICON` gains `draft: PencilLine,` first; `STATUS_TONE` gains `draft: 'bg-info-dim text-info',` first, and its comment becomes `/** Semantic tints for status only (house rule §4.2); a Draft is info, never an open status's tint. */`;
- after `NextDue` add:

```tsx
/** A Draft's figure in place of the next due date (Agents delivery 2). */
export function PendingTasks({ n }: { n: number }) {
  const { text } = pendingText(n);
  return (
    <span className="shrink-0 text-[11px] text-ink-muted">
      <span className={MONO}>{n}</span> {text}
    </span>
  );
}
```

In `src/components/plans/PlanRowItem.tsx`:
- the parts import gains `PendingTasks`;
- replace `<NextDue date={row.next_due} overdue={row.is_overdue} />` with `{row.status === 'draft' ? <PendingTasks n={row.pending_tasks} /> : <NextDue date={row.next_due} overdue={row.is_overdue} />}`.

In `src/components/plans/PlanFilters.tsx`, `STATUS_OPTIONS` becomes:

```tsx
const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'draft', label: 'Draft' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];
```

- [ ] **Step 4: The board's drafts**

In `src/components/plans/PlansBoard.tsx`:
- the parts import gains `PendingTasks`;
- the types import becomes `import type { PlanCounts, PlanRow, PlanStatus, PlansPage, SettableStatus } from '../../features/plans/planTypes';`;
- in `PlanCard`, replace `<NextDue date={row.next_due} overdue={row.is_overdue} />` with `{row.status === 'draft' ? <PendingTasks n={row.pending_tasks} /> : <NextDue date={row.next_due} overdue={row.is_overdue} />}`;
- in `PlanColumn`, the `onCount` prop type becomes `(counts: PlanCounts) => void`, and the heading's count becomes `{counts ? (counts[status] ?? '') : ''}`;
- in `PlansBoard`, replace the `columns` line with:

```tsx
  // A Draft is never open (Decision 11): its column comes first, on Show drafts.
  const columns: PlanStatus[] = [...(params.drafts ? (['draft'] as PlanStatus[]) : []), ...BOARD_COLUMNS, ...(params.cancelled ? (['cancelled'] as PlanStatus[]) : [])];
```

- the `counts` state and `onCount` become:

```tsx
  const [counts, setCounts] = useState<{ base: string; counts: PlanCounts } | null>(null);
  const onCount = useCallback((next: PlanCounts) => setCounts({ base, counts: next }), [base]);
```

- the Column picker's count becomes `{known ? (known[status] ?? '') : ''}`;
- before the Show cancelled button add:

```tsx
        <button
          type="button"
          aria-pressed={params.drafts}
          onClick={() => onChange({ ...params, drafts: !params.drafts })}
          className={`${QUIET} border border-line sm:ml-auto`}
        >
          {params.drafts ? 'Hide drafts' : 'Show drafts'}
        </button>
```

  and change the Show cancelled button's `className` to `{`${QUIET} border border-line`}` (the drafts button now carries `sm:ml-auto`);
- the grid's class becomes `` `grid gap-3 md:grid-cols-2 lg:grid-cols-4 ${columns.length === 5 ? 'xl:grid-cols-5' : ''} ${columns.length === 6 ? 'xl:grid-cols-6' : ''}` ``;
- the component comment's first line becomes `/** The board (spec §2.1): Not started · On track · At risk · Done, with Draft first on Show drafts and`.

- [ ] **Step 5: A record's drafts**

In `src/components/plans/RecordPlans.tsx`:
- replace the `open` and `finished` lines with:

```tsx
  const open = rows?.filter((row) => isOpen(row.status)) ?? [];
  // A Draft is neither open nor finished (Agents delivery 2, Decision 11).
  const drafts = rows?.filter((row) => row.status === 'draft') ?? [];
  const finished = rows?.filter((row) => !isOpen(row.status) && row.status !== 'draft') ?? [];
```

- after the Open plans block (the `open.length > 0 ? … : <p>No open plans.</p>` expression), add:

```tsx
          {drafts.length > 0 ? (
            <ul aria-label="Draft plans" className="flex flex-col divide-y divide-line-subtle">
              {drafts.map((row) => (
                <PlanRowItem key={row.id} row={row} showRecord={false} flat />
              ))}
            </ul>
          ) : null}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/plans src/pages/plans src/features/plans --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/plans/parts.tsx src/components/plans/PlanRowItem.tsx src/components/plans/PlanFilters.tsx src/components/plans/PlansBoard.tsx src/components/plans/RecordPlans.tsx src/components/plans/parts.test.tsx src/components/plans/PlansBoard.test.tsx src/components/plans/RecordPlans.test.tsx src/pages/plans/ProjectsHome.test.tsx
git commit -m "feat(plans): show Draft plans in the list, the board and a record's plans, never as open

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: A Draft plan's page: the banner, Start plan, and who started it

**Files:**
- Create: `src/components/plans/DraftPlanBanner.tsx`
- Modify: `src/components/plans/PlanHeader.tsx`
- Modify: `src/pages/plans/PlanPage.tsx`
- Test: `src/pages/plans/PlanPage.test.tsx`

**Interfaces:**
- Consumes: `startDraftPlan`, `draftNotice`, `isDraft`, `isEditable` (Task 12); `refusalCode`, `refusalDetail` (`features/agents/agentsApi.ts`); `AGENT_LABEL` (`features/agents/agentsText.ts`); `Figured`.
- Produces: `DraftPlanBanner({ plan, onStarted }: { plan: Plan; onStarted: (plan: Plan) => void })`; `PlanHeader` offers Edit on a Draft and says "Started by the CS agent"; `PlanView` shows the banner on a Draft and a focused "Started the plan." after a start.

- [ ] **Step 1: Write the failing tests**

Append to `src/pages/plans/PlanPage.test.tsx` (extend the `testPlans` import with `GLOBEX_ONBOARDING`, `PIZZA_ONBOARDING_DRAFT`, `PLANS`, `SERVER`):

```tsx
describe('a Draft plan (Agents delivery 2, Decisions 12 and 13)', () => {
  afterEach(() => {
    resetMembersCache();
    vi.unstubAllGlobals();
    resetViewport();
  });

  const withDraft = (extra: typeof PLANS = []) => stubPlans({ plans: [...PLANS, PIZZA_ONBOARDING_DRAFT, ...extra] });

  it('says it is a draft and who started it; Edit and Delete stay, the status select and Cancel go', async () => {
    withDraft();
    expect(await open(48)).toHaveTextContent('Onboarding · Pizza Hut');
    expect(document.querySelector('[data-part="draft"]')).toHaveTextContent('This plan is a draft: Start plan creates its 3 tasks, due from today.');
    expect(document.querySelector('[data-part="started-by"]')).toHaveTextContent('Started by the CS agent');
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    expect(document.querySelector('[data-status="draft"]')).toHaveTextContent('Draft');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Cancel plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
  });

  it('edits a Draft milestones', async () => {
    withDraft();
    await open(48);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Add milestone' })).toBeInTheDocument();
  });

  it('starts it: the tasks come back, the banner goes, and a focused status says so', async () => {
    const { spy } = withDraft();
    await open(48);
    await userEvent.dblClick(screen.getByRole('button', { name: 'Start plan' }));
    const status = await screen.findByText('Started the plan.');
    await waitFor(() => expect(status).toHaveFocus());
    expect(requestsOf(spy, 'POST', /^\/plans\/48\/start\/$/)).toHaveLength(1);
    expect(document.querySelector('[data-part="draft"]')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveDisplayValue('Not started');
    expect(screen.getByRole('checkbox', { name: 'Hold the kick-off call' })).toBeInTheDocument();
  });

  it('shows PLAN_OPEN in the server words with a link to the open plan', async () => {
    withDraft([{ ...GLOBEX_ONBOARDING, id: 49, record: { kind: 'organization', id: 7, name: 'Pizza Hut' } }]);
    await open(48);
    await userEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(SERVER.PLAN_OPEN);
    expect(within(alert).getByRole('link', { name: 'Open that plan' })).toHaveAttribute('href', '/projects/49');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('shows NOT_DRAFT in the server words when someone started it first', async () => {
    const { plansOf } = withDraft();
    await open(48);
    plansOf().find((plan) => plan.id === 48)!.status = 'on_track';
    await userEvent.click(screen.getByRole('button', { name: 'Start plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(SERVER.NOT_DRAFT);
  });

  it("tells a reader who can't edit who may start it", async () => {
    stubPlans({ plans: [...PLANS, { ...PIZZA_ONBOARDING_DRAFT, can_edit: false }] });
    await open(48);
    expect(screen.queryByRole('button', { name: 'Start plan' })).toBeNull();
    expect(screen.getByText("Only the plan's owner or their managers can start it.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/pages/plans/PlanPage.test.tsx --maxWorkers=2`
Expected: FAIL (no banner, no Start plan, no agent line, no Edit on a Draft).

- [ ] **Step 3: Write the banner**

Create `src/components/plans/DraftPlanBanner.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Play } from 'lucide-react';
import { refusalBody, refusalCode, refusalDetail } from '../../features/agents/agentsApi';
import { startDraftPlan } from '../../features/plans/planApi';
import { draftNotice } from '../../features/plans/planText';
import type { Plan } from '../../features/plans/planTypes';
import { Figured } from '../brain/Figured';
import { FOCUS, PRIMARY } from '../organizations/portfolio/styles';
import { errorMessage } from '../organizations/portfolio/usePagedRead';
import { useSubmitOnce } from './useSubmitOnce';

const ALERT_LINK = `inline-flex min-h-11 items-center self-start font-semibold text-ink underline sm:min-h-0 ${FOCUS}`;

type Refused = { text: string; planId: number | null };

/** A Draft plan's banner (Agents delivery 2, Decision 12): what Start plan
 *  will do, and Start plan for an editor (the page's one primary). NOT_DRAFT
 *  and PLAN_OPEN are the server's words; PLAN_OPEN links the open plan. */
export function DraftPlanBanner({ plan, onStarted }: { plan: Plan; onStarted: (plan: Plan) => void }) {
  const textId = useId();
  const [refused, setRefused] = useState<Refused | null>(null);
  const [tick, setTick] = useState(0);
  const alertRef = useRef<HTMLDivElement>(null);
  const { busy, run } = useSubmitOnce();
  useEffect(() => {
    if (tick > 0) alertRef.current?.focus();
  }, [tick]);

  async function start() {
    setRefused(null);
    const outcome = await run(() => startDraftPlan(plan.id));
    if (!outcome) return;
    if (outcome.ok) {
      onStarted(outcome.value);
      return;
    }
    const body = refusalBody(outcome.error);
    const planId = refusalCode(outcome.error) === 'PLAN_OPEN' && body && typeof body.plan_id === 'number' ? body.plan_id : null;
    setRefused({ text: refusalDetail(outcome.error) ?? errorMessage(outcome.error, 'Could not start this plan.'), planId });
    setTick((n) => n + 1);
  }

  return (
    <section aria-labelledby={textId} data-part="draft" className="flex flex-col gap-2 rounded-lg bg-subtle px-3 py-2">
      <p id={textId} className="flex items-start gap-2 text-[13px] text-ink">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <Figured text={draftNotice(plan.pending_tasks)} />
        </span>
      </p>
      {plan.can_edit ? (
        <button type="button" disabled={busy} onClick={() => void start()} className={`${PRIMARY} self-start`}>
          <Play className="h-4 w-4" aria-hidden="true" />
          {busy ? 'Starting…' : 'Start plan'}
        </button>
      ) : (
        <p className="text-[11px] text-ink-muted">Only the plan's owner or their managers can start it.</p>
      )}
      {refused ? (
        <div ref={alertRef} role="alert" tabIndex={-1} className={`flex flex-col gap-1 text-[13px] text-danger ${FOCUS}`}>
          <p>{refused.text}</p>
          {refused.planId !== null ? (
            <Link to={`/projects/${refused.planId}`} className={ALERT_LINK}>
              Open that plan
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: The header and the page**

In `src/components/plans/PlanHeader.tsx`:
- add `import { AGENT_LABEL } from '../../features/agents/agentsText';` after the `planApi` import;
- the `planText` import becomes `import { allMilestonesDone, dateRange, finishedNotice, isEditable, isOpen } from '../../features/plans/planText';`;
- after `const open = isOpen(plan.status);` add `const editable = isEditable(plan.status);`;
- the Edit button's condition `{plan.can_edit && open ? (` (the one wrapping the `Pencil` button) becomes `{plan.can_edit && editable ? (`;
- replace the `{plan.started_by_rule ? (` block with:

```tsx
      {plan.started_by_agent ? (
        <p data-part="started-by" className="text-[11px] text-ink-muted">
          {`Started by the ${AGENT_LABEL[plan.started_by_agent]}`}
        </p>
      ) : plan.started_by_rule ? (
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
```

- the component comment becomes `/** The plan's header (spec §2.3, Decision 9; Agents delivery 2: Edit on a Draft, Started by the agent). */`.

Replace `src/pages/plans/PlanPage.tsx`'s `PlanView` and its imports with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { isDraft, isEditable } from '../../features/plans/planText';
import type { Plan } from '../../features/plans/planTypes';
import { DraftPlanBanner } from '../../components/plans/DraftPlanBanner';
import { PlanHeader } from '../../components/plans/PlanHeader';
import { PlanFailed, PlanLoading, PlanMissing } from '../../components/plans/PlanStates';
import { Timeline } from '../../components/plans/Timeline';
import { usePlan } from '../../components/plans/usePlan';
import { FOCUS } from '../../components/organizations/portfolio/styles';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
```

```tsx
function PlanView({ plan, onReplace }: { plan: Plan; onReplace: (plan: Plan) => void }) {
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(0);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (tick > 0) noticeRef.current?.focus();
  }, [tick]);
  // Edit is for editors of an open plan or a Draft; cancelling or finishing leaves it.
  const on = editing && plan.can_edit && isEditable(plan.status);
  return (
    <OrganizationsFrame>
      <div className="flex flex-col gap-6 pb-6">
        <PlanHeader plan={plan} editing={on} onEdit={setEditing} onReplace={onReplace} />
        {/* Always mounted: Start plan's answer lands here and takes focus (Decision 12). */}
        <p ref={noticeRef} role="status" tabIndex={-1} className={`text-[13px] text-ink-muted empty:hidden ${FOCUS}`}>
          {notice}
        </p>
        {isDraft(plan.status) ? (
          <DraftPlanBanner
            plan={plan}
            onStarted={(next) => {
              onReplace(next);
              setNotice('Started the plan.');
              setTick((n) => n + 1);
            }}
          />
        ) : null}
        <Timeline plan={plan} editing={on} onReplace={onReplace} />
      </div>
    </OrganizationsFrame>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/pages/plans src/components/plans --maxWorkers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/plans/DraftPlanBanner.tsx src/components/plans/PlanHeader.tsx src/pages/plans/PlanPage.tsx src/pages/plans/PlanPage.test.tsx
git commit -m "feat(plans): start a Draft plan from its page, and say which agent started a plan

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Recommended and Waiting render the new kinds

**Files:**
- Modify: `src/features/work/testWorkFixtures.ts:4`, `:173-185`
- Modify: `src/features/brain/testWaitingFixtures.ts:21`, `:118`
- Test: `src/pages/work/Recommended.test.tsx`, `src/components/brain/WaitingRow.test.tsx`

**Interfaces:**
- Consumes: `ACT_DRAFT_TICKET`, `ACT_PLAN_START` (Task 1); the shared `AgentActionBody` (Task 4) and `AgentActionDecision`.
- Produces: `REC_AGENT_PLAN`, `REC_AGENT_DRAFT` (work fixtures); `PLAN_START_ITEM`, `DRAFT_TICKET_ITEM` (waiting fixtures). No product code changes: `RecommendationCard` and `WaitingRow` already decide any kind but `task.create` with Apply and Reject.

- [ ] **Step 1: Add the fixtures**

In `src/features/work/testWorkFixtures.ts`:
- line 4 becomes `import { ACT_DRAFT_TICKET, ACT_LIFECYCLE, ACT_PLAN_START, ACT_TASK_CREATE } from '../agents/testAgentsFixtures';`;
- after `REC_AGENT_LIFECYCLE`, add:

```ts
/** The CS agent's plan start on Pizza Hut (Ask is its cap): Apply or Reject. */
export const REC_AGENT_PLAN: RecommendationRow = recRow({
  id: 8,
  kind: 'agent_action',
  title: 'Start the Onboarding plan on Pizza Hut',
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_PLAN_START,
});

/** The CS agent's reply on a Zendesk ticket, waiting on Ask. */
export const REC_AGENT_DRAFT: RecommendationRow = recRow({
  id: 9,
  kind: 'agent_action',
  title: 'Draft a reply on TKT-1042',
  why: { facts: [], evidence: [] },
  defaults: null,
  suggested_assignee: null,
  agent_action: ACT_DRAFT_TICKET,
});
```

In `src/features/brain/testWaitingFixtures.ts`:
- line 21 becomes `import { ACT_DRAFT_TICKET, ACT_INITIATIVE, ACT_LIFECYCLE, ACT_PLAN_START, ACT_TASK_CREATE } from '../agents/testAgentsFixtures';`;
- after `OPS_INITIATIVE_ITEM`, add:

```ts
/** Agents delivery 2: a plan start and a ticket reply, both Carl's to decide. */
export const PLAN_START_ITEM: AgentActionItem = {
  kind: 'agent_action', id: 92, title: 'Start the Onboarding plan on Pizza Hut', since: '2026-10-01T09:00:00Z',
  waiting_on: { id: 3, name: 'Carl CSM' }, can_decide: true, record: { type: 'customer', id: 7, name: 'Pizza Hut' },
  detail: { ...ACT_PLAN_START, evidence: [], session: null },
};

export const DRAFT_TICKET_ITEM: AgentActionItem = {
  kind: 'agent_action', id: 91, title: 'Draft a reply on TKT-1042', since: '2026-10-01T09:00:00Z',
  waiting_on: { id: 3, name: 'Carl CSM' }, can_decide: true, record: { type: 'customer', id: 7, name: 'Pizza Hut' },
  detail: { ...ACT_DRAFT_TICKET, evidence: [], session: null },
};
```

- [ ] **Step 2: Write the tests**

Append to `src/pages/work/Recommended.test.tsx`, inside `describe('Recommended: agent actions …')` (extend the work fixtures import with `REC_AGENT_DRAFT`, `REC_AGENT_PLAN`, and the agents fixtures import with `ACT_DRAFT_TICKET`, `ACT_PLAN_START`):

```tsx
  it('shows a plan start with Apply and Reject; Apply settles it (Agents delivery 2)', async () => {
    const agents = stubAgents({ actions: [ACT_PLAN_START] });
    const work = stubWork({ recommendations: [REC_AGENT_PLAN], passThrough: agents.spy });
    agents.onSettle(() => work.recommendations.clear());
    renderWork('/work/recommended');
    const card = await screen.findByRole('article', { name: 'Start the Onboarding plan on Pizza Hut' });
    expect(card.querySelector('[data-part="preview"]')).toHaveTextContent('Start a plan: Onboarding, 3 milestones, 9 tasks');
    expect(within(card).queryByRole('button', { name: 'Assign' })).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Applied: Start the Onboarding plan on Pizza Hut.');
  });

  it('shows a ticket draft with its opening lines, and Reject sends the agent reject', async () => {
    const agents = stubAgents({ actions: [ACT_DRAFT_TICKET] });
    const work = stubWork({ recommendations: [REC_AGENT_DRAFT], passThrough: agents.spy });
    agents.onSettle(() => work.recommendations.clear());
    renderWork('/work/recommended');
    const card = await screen.findByRole('article', { name: 'Draft a reply on TKT-1042' });
    expect(card.querySelector('[data-part="preview"]')).toHaveTextContent('Draft a reply on TKT-1042: Export fails');
    expect(card.querySelector('[data-part="excerpt"]')).toHaveTextContent('Hi Ann, the export fix ships on Thursday.');
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Reject it' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Rejected: Draft a reply on TKT-1042.');
    expect(agentCalls(agents.spy, 'POST', '/agents/actions/')).toEqual([`/agents/actions/${ACT_DRAFT_TICKET.id}/reject/`]);
  });
```

Append to `src/components/brain/WaitingRow.test.tsx`, inside `describe('WaitingRow (spec §2.1)', …)` (extend the waiting fixtures import with `DRAFT_TICKET_ITEM`, `PLAN_START_ITEM`, and add `cleanup` to the `@testing-library/react` import):

```tsx
  it('renders a plan start and a ticket draft through the shared body, each with Apply (Agents delivery 2)', async () => {
    stubAgents({ actions: [PLAN_START_ITEM.detail, DRAFT_TICKET_ITEM.detail] });
    const plan = renderRow(PLAN_START_ITEM);
    expect(plan.meta).toHaveTextContent('CS agent · Start a plan');
    expect(plan.row.querySelector('[data-part="preview"]')).toHaveTextContent('Start a plan: Onboarding, 3 milestones, 9 tasks');
    await userEvent.click(within(plan.row).getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(plan.onGone).toHaveBeenCalledWith(PLAN_START_ITEM, 'Applied: Start the Onboarding plan on Pizza Hut.'));
    cleanup();
    const draft = renderRow(DRAFT_TICKET_ITEM);
    expect(draft.meta).toHaveTextContent('CS agent · Draft a reply');
    expect(draft.row.querySelector('[data-part="excerpt"]')).toHaveTextContent('Hi Ann, the export fix ships on Thursday.');
    expect(within(draft.row).getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/pages/work/Recommended.test.tsx src/components/brain/WaitingRow.test.tsx src/pages/brain/Waiting.test.tsx --maxWorkers=2`
Expected: PASS (the shared components already render any kind; this task proves it). If a test fails, the fault is in Task 1 or 4's wording; fix it there, not here.

- [ ] **Step 4: Commit**

```bash
git add src/features/work/testWorkFixtures.ts src/features/brain/testWaitingFixtures.ts src/pages/work/Recommended.test.tsx src/components/brain/WaitingRow.test.tsx
git commit -m "test(agents): Recommended and Waiting render a plan start and a ticket draft

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: House rules cover the new files

**Files:**
- Modify: `src/components/agents/houseRules.test.ts:19-34`, `:41-59`, `:87-92`
- Modify: `src/components/plans/houseRules.test.ts:17-30`

**Interfaces:**
- Consumes: every component from Tasks 7 to 10 and 14.
- Produces: no product code.

- [ ] **Step 1: Extend the suites**

In `src/components/agents/houseRules.test.ts`:
- the `copy` glob list becomes:

```ts
      ['./*.ts', '../../features/agents/agentTypes.ts', '../../features/agents/agentsApi.ts', '../../features/agents/agentsText.ts', '../../features/agents/testAgents*.ts', '../../features/agents/agents*.test.ts', '../../features/agents/draft*.ts', '../../features/agents/testDrafts.ts'],
```

  and its comment's first line becomes `// The new Agents files in features/ (delivery 1 and the delivery 2 drafts) and the components folder's .ts files,`;
- `PRIMARY_OWNERS` becomes `['./AgentsForm.tsx', './ActionsGridForm.tsx', './DraftForm.tsx']` with the comment `// One primary per surface: each settings form's Save changes, and a draft's Send or Copy and open.`;
- in "covers every component…", add to the `arrayContaining` list:

```ts
        './DraftForm.tsx',
        './DraftPanel.tsx',
        './DraftLine.tsx',
        './AgentDraftsList.tsx',
```

- in "gives every list a skeleton and an error state", append:

```ts
    expect(files['./DraftPanel.tsx']).toContain('animate-pulse');
    expect(files['./DraftPanel.tsx']).toContain('<ErrorBlock');
    expect(files['./AgentDraftsList.tsx']).toContain('animate-pulse');
    // Try again, through the drafts' copy.
    expect(files['./AgentDraftsList.tsx']).toContain('DRAFTS.TRY_AGAIN');
```

In `src/components/plans/houseRules.test.ts`, add `'./DraftPlanBanner.tsx',` to the coverage list.

- [ ] **Step 2: Run the suites**

Run: `npx vitest run src/components/agents/houseRules.test.ts src/components/plans/houseRules.test.ts src/components/work/houseRules.test.ts src/components/brain/houseRules.test.ts --maxWorkers=2`
Expected: PASS. A failure names a file and the rule it broke (a raw colour, a type size, a target without `min-h-11`, an icon without `aria-hidden`, an em dash, a second primary): fix that file, not the suite.

- [ ] **Step 3: Commit**

```bash
git add src/components/agents/houseRules.test.ts src/components/plans/houseRules.test.ts
git commit -m "test(agents): put the draft components and the Draft plan banner under the house rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: The journeys: an Auto draft sent from Activity; a plan applied and opened

**Files:**
- Modify: `src/pages/work/testPages.tsx`
- Modify: `src/e2e/agents.test.tsx`

**Interfaces:**
- Consumes: everything above; `stubDrafts` (`isSent`), `stubAgents` (`draftSent`), `stubWork`, `REC_AGENT_PLAN`, `DraftRoute`.
- Produces: `renderWork(url, { drafts: true })` also routes `/communications` to `DraftRoute` with a "Test back" button.

- [ ] **Step 1: Route the draft in the Work test harness**

In `src/pages/work/testPages.tsx`:
- after line 1 add `/* eslint-disable react-refresh/only-export-components */`;
- the router import becomes `import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';`;
- add `import { DraftRoute } from '../../components/agents/DraftPanel';` after the `TaskPanelHost` import;
- before `renderPage`, add:

```tsx
/** The browser's Back, for a journey that leaves Work and comes back. */
function TestBack() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)} className="min-h-11">
      Test back
    </button>
  );
}
```

- in `renderWork`'s options, add `drafts = false,` after `brainItem = false,` and `drafts?: boolean;` to its type, and change its comment's last line to ` *  Brain item (the waiting count's badge) with \`brainItem\`, and Communications' draft (\`DraftRoute\`) with \`drafts\`. */`;
- before `<Route path="*" element={<Where />} />` add:

```tsx
            {drafts ? (
              <Route
                path="/communications"
                element={
                  <>
                    <TestBack />
                    <DraftRoute />
                    <Where />
                  </>
                }
              />
            ) : null}
```

- [ ] **Step 2: Write the journeys**

In `src/e2e/agents.test.tsx`:
- the fixtures import becomes `import { ACT_DRAFT_REPLY, ACT_LIFECYCLE, ACT_PLAN_START, DRAFT_EMAIL_ID, STARTED_PLAN_ID } from '../features/agents/testAgentsFixtures';`;
- the work fixtures import becomes `import { REC_AGENT_LIFECYCLE, REC_AGENT_PLAN } from '../features/work/testWorkFixtures';`;
- add `import { stubDrafts } from '../features/agents/testDrafts';`;
- append:

```tsx
// Agents delivery 2: an Auto draft.reply is opened from Activity, sent from
// Communications, and Undo then answers that it was sent; a plan.start is
// applied in Recommended and its plan opened from Activity. Stubs: drafts in
// front of agents in front of work.

describe('Agents: drafts and plans', () => {
  it('opens an Auto draft from Activity, sends it, and the row says it was sent', { timeout: 30000 }, async () => {
    const agents = stubAgents({ actions: [ACT_DRAFT_REPLY], draftSent: (id) => drafts.isSent(id) });
    const drafts = stubDrafts({ passThrough: agents.spy });
    stubWork({ passThrough: drafts.spy });
    renderWork('/work/activity', { nav: true, drafts: true });

    const list = await screen.findByRole('list', { name: 'Agent actions' });
    const row = within(list.querySelector(`[data-action="${ACT_DRAFT_REPLY.id}"]`) as HTMLElement);
    expect(row.getByText('Applied automatically')).toBeInTheDocument();
    await userEvent.click(row.getByRole('link', { name: 'Open draft' }));
    await waitFor(() => expect(where()).toBe(`/communications?draft=${DRAFT_EMAIL_ID}`));

    const panel = await screen.findByRole('region', { name: 'Draft reply' });
    const heading = await within(panel).findByRole('heading', { level: 1, name: 'Reply to Ann Lee' });
    await waitFor(() => expect(heading).toHaveFocus());
    await userEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    const status = await within(panel).findByText('Sent to Ann Lee <ann@x.com>.');
    await waitFor(() => expect(status).toHaveFocus());
    expect(panel.querySelector('[data-part="read-only"]')).toHaveTextContent('Sent on 8 Oct 2026 by Alice.');
    expect(within(panel).queryByRole('textbox')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Test back' }));
    await waitFor(() => expect(where()).toBe('/work/activity'));
    const again = await screen.findByRole('list', { name: 'Agent actions' });
    const sentRow = within(again.querySelector(`[data-action="${ACT_DRAFT_REPLY.id}"]`) as HTMLElement);
    await userEvent.click(sentRow.getByRole('button', { name: 'Undo' }));
    expect(await sentRow.findByRole('alert')).toHaveTextContent('This draft has been sent.');
  });

  it('applies a plan start in Recommended, then opens the plan from Activity', { timeout: 30000 }, async () => {
    const agents = stubAgents({ actions: [ACT_PLAN_START] });
    const work = stubWork({ recommendations: [REC_AGENT_PLAN], passThrough: agents.spy });
    agents.onSettle(() => work.recommendations.clear());
    renderWork('/work/recommended', { nav: true });

    const card = await screen.findByRole('article', { name: ACT_PLAN_START.title });
    expect(card.querySelector('[data-part="preview"]')).toHaveTextContent('Start a plan: Onboarding, 3 milestones, 9 tasks');
    await userEvent.click(within(card).getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText(`Applied: ${ACT_PLAN_START.title}.`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Activity' }));
    const list = await screen.findByRole('list', { name: 'Agent actions' });
    const row = within(list.querySelector(`[data-action="${ACT_PLAN_START.id}"]`) as HTMLElement);
    expect(row.getByText('Applied by you')).toBeInTheDocument();
    await userEvent.click(row.getByRole('link', { name: 'Open plan' }));
    await waitFor(() => expect(where()).toBe(`/projects/${STARTED_PLAN_ID}`));
  });
});
```

- [ ] **Step 3: Run the journeys**

Run: `npx vitest run src/e2e/agents.test.tsx src/pages/work --maxWorkers=2`
Expected: PASS (both delivery 1's journey and the two new ones).

- [ ] **Step 4: Commit**

```bash
git add src/pages/work/testPages.tsx src/e2e/agents.test.tsx
git commit -m "test(agents): journeys for an Auto draft sent from Activity and a plan applied and opened

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: The UI/UX reference

**Files:**
- Modify: `docs/03-ui-ux-design.md` (Plans (Project Management); Work: Activity; Settings: Agents, and Actions & approvals; a new "Communications: drafts" after Settings: Agents)

**Interfaces:**
- Consumes: Decisions 1 to 14.
- Produces: documentation only.

- [ ] **Step 1: Plans**

In `### Plans (Project Management)`:
- in the `/projects` bullet, replace "Status (List only: Open, Done, Cancelled, All)" with "Status (List only: Open, Draft, Done, Cancelled, All)";
- at the end of the **List** sub-bullet's first sentence list, after "and the status pill (a word, an icon and a tint).", add: "A Draft (Agents delivery 2) has its own pill (Lucide `PencilLine`, `bg-info-dim text-info`) and shows "9 tasks to start" in DM Mono in place of the next due date; it is never counted or shown as open.";
- in the **Board** sub-bullet, after "Show cancelled adds Cancelled.", add: "Show drafts (`?drafts=1`) adds a Draft column first; its cards are not draggable and have no status menu, and dropping a card on it is refused with "Start a draft plan with Start plan."";
- in the **A plan** bullet, after `"Started by <rule>" (unlinked for a rule the reader can't read).`, add: ""Started by the CS agent" when an agent action started it. A Draft shows a banner ("This plan is a draft: Start plan creates its 9 tasks, due from today.") with **Start plan**, the page's one primary, for editors (else "Only the plan's owner or their managers can start it."); Edit and Delete work on it, while the Status select, Cancel plan, Add task and the milestone Done checks wait for it to start. After a start a status line says "Started the plan." and takes focus; `NOT_DRAFT` and `PLAN_OPEN` show the server's sentence, `PLAN_OPEN` with "Open that plan".";
- in the **Elsewhere** bullet, after "(open plans flat in one surface, ", add "Draft plans in their own list, ".

- [ ] **Step 2: Work: Activity**

In `### Work: Activity`:
- in **A row**, replace "and for `task.create` an Open task link)" with "and what the action made: Open task for `task.create`, Open draft (`/communications?draft=<id>`) while a `draft.reply` is applied, Open plan (`/projects/<id>`) whenever a `plan.start` made one)", and replace the sentence ending "…except when the server sent "A task you can't see" or "A removed task" in its place: those stay plain text." with "…when the server sends its id: a task the reader can't open ("A task you can't see") or one removed since ("A removed task") comes with a null id and stays plain text.";
- after the **A row** bullet, add:

```markdown
- **Delivery 2 kinds.** A `draft.reply` preview reads "Draft a reply to Ann
  Lee <ann@x.com>: Re: Renewal terms" (or "Draft a reply on TKT-1042: Export
  fails"), with the reply's first lines below it in a quiet `blockquote`. A
  `plan.start` reads "Start a plan: Onboarding, 3 milestones, 9 tasks". The
  Action filter lists both, between File a note and Start an initiative.
  Undo on a sent draft is refused in the server's words ("This draft has
  been sent."), with no Now and Agent set line.
```

- in **The bell**, append: "`agent_draft_ready` gets Lucide `FilePen` and opens `/communications?draft=<id>`."

- [ ] **Step 3: Settings: Agents, and Communications: drafts**

In `### Settings: Agents, and Actions & approvals`, in the **Settings › Actions & approvals** bullet, after "a cell an agent doesn't use reads "Not used".", add: "Delivery 2 adds Draft a reply (up to Auto) and Start a plan (capped at Ask), for the CS and Sales agents only."

After that section (before `### Settings: the frame`), add:

```markdown
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
- **Ticket form.** Reply only, with "Ticket replies are not sent from
  Revenact: copy it into the ticket, then mark it as sent." "Copy and open
  in Zendesk" (the primary) copies the reply and opens the ticket; with no
  source it is "Copy the reply". Mark as sent saves an edited reply first.
- **Status.** One always-mounted status line under Back: "Sent to …" or
  "Marked as sent." (focused), "Saved." and "Copied the reply." (not
  focused), "Discarded the draft." (focused, the draft gone), and the
  server's `ALREADY_SENT` or `NOT_YOURS` sentence (focused, the draft read
  again). Other refusals stay in the form's alert, focused.
- **Read-only.** A sent draft ("Sent on 8 Oct 2026 by Alice.") or someone
  else's ("Only Carl CSM can change or send this draft.") shows To, Subject
  and Reply as text. `can_edit` alone decides.
- **The queue.** An email or ticket row with `draft` shows a quiet line in
  its detail pane: "The CS agent drafted a reply." and Open draft.
- **Mailbox › Drafts.** "From your agents" (the reader's own open email
  drafts: subject, To, record, agent, Edited, date) sits above "In your
  mailbox"; skeleton, "No drafts from your agents.", and Try again.
```

- [ ] **Step 4: Check the copy rule and commit**

Run: `git diff --unified=0 -- docs/03-ui-ux-design.md | grep "^+" | grep "—" || true`
Expected: no output (older text may keep its own dashes; the lines you added have none).

```bash
git add docs/03-ui-ux-design.md
git commit -m "docs: Agents delivery 2 in the UI/UX reference (drafts, Draft plans, Activity)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: The app-flow reference

**Files:**
- Modify: `docs/04-app-flow.md` (the `/communications` route row, 4.5k Plans, 4.9 Connections, 4.11c Agents)

**Interfaces:**
- Consumes: the contract and Decisions 1 to 14.
- Produces: documentation only.

- [ ] **Step 1: The route row and Connections**

In the `/communications` row of the route table (line 73), append before its closing `|`: "; with `?draft=<id>` the card is the agent's reply draft instead (`DraftRoute`: `GET /communications/drafts/<id>/`; the owner's Save `PATCH`, Send `POST …/send/`, Mark as sent `POST …/mark-sent/`, Discard `DELETE`); a queue row with `draft` links it, and the mailbox's Drafts lists "From your agents" (`GET /communications/drafts/?channel=email`) above the provider's drafts".

In `### 4.9 Connections`, append a paragraph:

```markdown
An agent drafts an email reply only for a record owner with a connected
mailbox, and a draft's Send needs the sender's own: without one it answers
409 `NO_MAILBOX` ("Connect your mailbox to send this."), shown with an Open
Connections link to this page.
```

- [ ] **Step 2: Plans**

In `### 4.5k Plans`:
- in step 1, replace "(List: `open` by default; All is `open`, `done` and `cancelled`)" with "(List: `open` by default; Draft is `draft`; All is `open`, `draft`, `done` and `cancelled`)", and after "(on_track, at_risk, done), then every column reads again." add " Show drafts (`?drafts=1`) adds a `status=draft` column; a Draft is never moved by the board.";
- in step 3, after "`POST /plans/<id>/save-as-template/`." add: " A Draft (an agent-started plan whose undo sent it back) shows `pending_tasks` and Start plan: `POST /plans/<id>/start/` makes its tasks again, due from today, and answers the plan (`not_started`); 409 `NOT_DRAFT` or `PLAN_OPEN` (with `plan_id`) show the server's sentence. `PATCH` and `DELETE` work on a Draft; its status is never set by hand. `started_by_agent` reads "Started by the CS agent".";
- in step 5, append: " Draft plans are listed on their own, between open and finished."

- [ ] **Step 3: Agents**

In `### 4.11c Agents (Settings › Agents, Actions & approvals, Work › Activity)`:
- under the contract line, append: "Delivery 2: `revenact-backend docs/superpowers/plans/2026-10-08-agents-drafts-api.md`.";
- in step 2, append: " `draft.reply` may be Auto; `plan.start` is capped at Ask; both are for the CS and Sales agents.";
- in step 3, append: " A `draft.reply` writes a reply to the record's newest unanswered email (only when its owner has a connected mailbox) or newest open ticket; applied means a `ReplyDraft` exists, owned by the record owner, and nothing is sent. A `plan.start` starts a template on the record through the plans service. Only readers who may read the source email or ticket see, decide or count a draft action by name; everyone else counts it in `hidden`.";
- in step 5, append: " A row links what the action made: Open task, Open draft (`/communications?draft=<id>`, only while applied) and Open plan (`/projects/<id>`). A draft row shows its first lines.";
- in step 6, append: " Undoing a draft deletes it unless it was sent, edited or discarded (`CHANGED_SINCE`, e.g. "This draft has been sent."); undoing a plan start returns the plan to Draft unless it was finished, cancelled, deleted or has done work.";
- in step 7, append: " The draft's owner also gets `agent_draft_ready` (Lucide `FilePen`) when a `draft.reply` applies and they did not approve it themselves; it links to `/communications?draft=<id>`.";
- add a step 8:

```markdown
8. **Send.** The draft's owner opens it on Communications. Email: Save
   (`PATCH {body, subject}`), Send (`POST …/send/` with the changed fields,
   from their own mailbox, threaded on the original); the queue and its
   counts read again. Ticket: copy it into the source system (Copy and open),
   then Mark as sent (`POST …/mark-sent/`, after saving an edited reply).
   Discard (`DELETE`) asks first. Anyone else who may read it sees it as
   text.
```

- [ ] **Step 4: Commit**

```bash
git add docs/04-app-flow.md
git commit -m "docs: Agents delivery 2 in the app-flow reference (drafts, Start plan, the bell)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: The full check

**Files:**
- None new. Fix in place whatever the checks name.

**Interfaces:**
- Consumes: the whole branch.
- Produces: a green suite, lint and build.

- [ ] **Step 1: The whole suite**

Run: `npx vitest run --maxWorkers=4`
Expected: every file passes. A failure outside the files this plan touched points at a fixture shape (`PlanRow`, `AgentAction.result`) or a pinned list: add the two plan row fields or the two result keys to that literal; never loosen a type to make it pass.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `tsc -b` and `vite build` finish with no errors.

- [ ] **Step 4: The copy rule, one last time**

Run: `git diff main --unified=0 -- src | grep "^+" | grep "—" || true`
Expected: no output (no added line carries an em dash).

- [ ] **Step 5: Commit any fixes**

If Steps 1 to 4 needed changes:

```bash
git add <each file you changed, by path>
git commit -m "fix(agents): delivery 2 full-check fixes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec and contract coverage:**
- New kinds, labels, order, caps → Task 1 (the grid test pins Ask for `plan.start`, Auto for `draft.reply`, Not used for Ops).
- `preview.draft` and `preview.plan`, `result.draft_id` and `result.plan_id` → Task 1; their rendering → Tasks 4 and 15.
- `preview.task.id` null, sentinels removed → Task 2.
- Undo refusals for drafts and plans shown verbatim (`CHANGED_SINCE` without values) → Task 3 (stub and `UndoAction`), Task 17 (journey).
- `/communications/drafts/` list, read, PATCH, send, mark-sent, DELETE with every error code → Task 5 (client and stub), Tasks 7 and 8 (UI: field errors, `NOT_YOURS`, `ALREADY_SENT`, `WRONG_CHANNEL` cannot be reached from the UI because each channel shows only its own action, `NO_MAILBOX`, 502).
- Queue rows' `draft` → Task 9. Mailbox Drafts → Task 10. `agent_draft_ready` → Task 11.
- Plans `draft` status, `pending_tasks`, `started_by_agent`, `status` filter, `PATCH` and `DELETE` on a Draft, `POST /plans/<id>/start/` with `NOT_DRAFT` and `PLAN_OPEN` → Tasks 12 to 14.
- Recommended and Waiting → Task 15. House rules → Task 16. Journeys → Task 17. Docs → Tasks 18 and 19. Full check → Task 20.
- Privacy: the UI shows only what the server sends; `hidden` counting is the server's and Activity already renders it.
- Out of scope, as the contract says: provider-side drafts, ticket write-back, Copilot session decisions (their `proposals` shape is unchanged, so `features/proposals` stays).

**Type consistency:** `QueueDraft` (Task 5) is what `CommunicationRow.draft` (Task 9) and `DraftLine` use. `DraftForm`'s `onAnswer(draft, text, focus)`, `onStale(text)`, `onDiscarded()` match `DraftPanel`'s call site (Task 8). `PlanCounts` (Task 12) is what `PlansBoard` reads (Task 13). `draftHref` lives in `agentsText.ts` (Task 1) and is used by `ActivityRow` (Task 4) and `DraftLine` (Task 9); `withDraft` and `withoutDraft` live in `draftsText.ts` (Task 6).
