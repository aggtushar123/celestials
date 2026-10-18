# Slack escalations, delivery 4 (frontend): the thread decides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Work, a Slack escalation bundle shows its **reply first** ("Runs last, once the Jira issue exists"), says who has the work and **where that came from** (`Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"` with `Faiz Jamal (Customer Success)`, or "No one was named in the thread, so it goes to Jesh Sanghvi (Engineering head)") with **Change** (any active member, or whoever handles a department), lets the reply's Jira key and link be kept or removed as chips but never typed, says when the reply posts **as you**, and shows a skipped step's note. A colleague who took part in the thread but can't open the customer sees the **participant view** (no reason, no record link, "You can run this because you took part in the Slack thread."). On the organisation page, a Slack thread shows its Jira tickets and a ticket shows the thread it came from, each only as the server sends it.

**Architecture:** Two pure modules: `features/agents/escalationText.ts` (words, the handler lines, the panel's order, the reply's markers, the Change refusals) and `features/organizations/linkText.ts` (the link lines' words). Two new components: `components/work/EscalationHandler.tsx` (the handler lines, Change and its form) and `components/work/ReplyText.tsx` (the reply's text with its Jira chips), plus `components/organizations/detail/LinkLines.tsx`. `BundlePanel`, `BundleStep`, `BundleOutsideFields`, `FeedRowParts`, `StoryItemRow` and `SlackThread` gain small, guarded additions; every new key is optional, so an older backend changes nothing. One new API call, `setHandler`. No slice.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), Redux Toolkit (no new slice), Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react (`X`, `ExternalLink`, already used).

**Spec:** `docs/superpowers/specs/2026-10-15-slack-escalations-design.md` §5 (rewritten 2026-10-17), §6, §8, §9 (D4 row), §10, §11 (LC-D4a to d), §16.2, on branch `feat/slack-escalations-d3` (commit cbd3b5e5) until it merges to `main`. **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-backend-slackd4/docs/superpowers/plans/2026-10-17-slack-escalations-d4-api.md` (backend branch `feat/slack-escalations-d4`). Read its survey table and "Decisions narrowing the spec" (SE4-1 to SE4-28) first; §2 (shapes), §3 (the reply template), §4 (the Change route and its refusals) are the stubs' and types' source of truth. Its "Changes during the build" binds too: read it again before Task 7.

This plan replaces the D3 frontend plan written earlier on 2026-10-17 (the platform picked the person). Tasks 2, 4 and 6 are that plan's Tasks 2, 4 and 5; Tasks 1, 3 and 7 are its Tasks 1, 3 and 6, adapted; Task 5 is new.

## What exists (from the contract's survey, frontend rows)

| Piece | State | Here |
|---|---|---|
| The bundle panel lists steps by position, chips placeholders read-only (`PlaceholderText`), edits each kind's fields (`BundleStepFields`, `BundleOutsideFields`), saves on blur, runs, retries | exists | reused; the order, the handler block, the reply's chips and the notes are added |
| The panel's reason (`BundlePanel.tsx:396`) and record link (`:407-411`); a Work row's record link (`FeedRowParts.tsx:49`) | exist | the participant view hides the link when `can_open` is false (Task 5) |
| `stepStateText` reads "Not run" for every skipped step | partial | a step's `note` replaces it (Task 2) |
| "Posts as <bot>" on a Slack step | partial | "Posts as you (Faiz Jamal)" when `as_you` (Task 4) |
| Members (`features/knowledge/useMembers.ts`, `FUNCTION_LABELS`, `TEAM_MEMBERS` in `testHeads.ts`) | exists (D2) | the Change form's person list (Task 3) |
| Send to Revenact's row (`SlackMessageRow.tsx`, #161) | exists | unchanged: it shows the server's new refusal (SE4-19) verbatim already |
| The story's Slack item and its sheet (`StoryItemRow.tsx`, `SlackThread.tsx`, D1) | partial | the link lines (Task 6) |

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/react-ts-app-slackd4`, branch `feat/slack-escalations-d4` (cut from main `f44f679f`: D1 #150, D2 #167, Connections #158/#160, Slack message actions #161 merged; its first commit holds this plan). Link `node_modules` once: `ln -s ../react-ts-app-main/node_modules node_modules` (never commit it). Always `git add <explicit paths>`, never `git add -A` or `git add .`. Never merge, never open a PR, never touch `react-ts-app/` or `react-ts-app-main/`, never touch the servers on ports 8000 or 5173 (the owner uses them; the by-eye run in Task 7 uses 8020 and 5190).
- **D3 is planned in parallel** (`feat/slack-escalations-d3`: Settings › Connections › Slack's channel list). The two touch different files; whichever merges second rebases.
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate. Every task ends with `npx tsc -b` clean as well as its tests.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Stubs answer exactly the contract's shapes and sentences; server refusals are shown verbatim. Every new key is optional in the types (`escalation?`, `participant_view?`, `can_open?`, `note?`, `as_you?`, `tickets?`, `hidden_links?`, `from_slack?`): an older backend leaves the screens as today.
- **Load `revenact-design` first** (the repo skill): Kinso look, tokens only (`src/test/houseRules.ts` `RAW`), monochrome primary, four type sizes through `TYPE.*`, `FIELD_ERROR`, `FORM_ALERT`; weights 400 and 600 only; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`. **The UI ratchet** (`src/test/uiRatchet.test.ts`) ends each task with totals **equal** to `BASELINE`: new code adds zero offences (never raise a baseline).
- **Kinso look and the UI cleanup rules:** no card inside a card (the handler block is a row inside the panel, not a card), ` · ` between meta items, one primary per surface (the panel's Run stays the only primary: Change's Save is `BUTTON`). Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every control: `BUTTON`, `QUIET`, `ICON_BUTTON`, `Select`, the link lines (`LINK` from `StoryItemRow`).
- **No em dash (`—`) anywhere** in the files this plan creates or changes (comments and tests included), and in no new copy.
- **Copy:** sentence case, plain words, word for word as this plan and the contract give them; server sentences shown verbatim. The product's name in copy is unchanged (spec decision 8).
- **States:** the Change form shows a field's refusal under it (`FIELD_ERROR`, `role="alert"`) and a whole refusal above its buttons (`FORM_ALERT`, `role="alert"`); while it saves, its Save reads "Saving…" (`aria-disabled`). The link lines have no loading state of their own (they come with the story).
- **Motion:** none added.
- **Privacy:** the screens show only what the server sends. The participant view is the server's (no reason, no rationale, no evidence arrive); the screen adds only "no link to a record the reader can't open". A linked side the reader may not read arrives as a count ("Linked to 1 item you can't see"), never a title; no email anywhere new.
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data. Never mock the store. Nothing real is sent.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **Reply first.** An escalation bundle (`bundle.escalation` not null) lists its `slack.reply` step first and the rest by position; the reply's heading keeps its run number ("4. Reply in Slack") and a meta line under it reads "Runs last, once the Jira issue exists" (or "Runs last" when the bundle has no Jira issue). Every other bundle is listed as today. Cost: trivial.
2. **Handled by, and where it came from.** Between the meta line and the steps: a label "Handled by", a source line and a person line (`handlerLines`):
   - `thread`: `Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"` (the decider's first name) and `Faiz Jamal (Customer Success)`;
   - `unresolved`: `The thread named Faiz Khan, but no member matches. Choose who handles this.`;
   - `team`: `No one was named in the thread, so it goes to Jesh Sanghvi (on Globex (QA)'s account team)`;
   - `head`: `No one was named in the thread, so it goes to Jesh Sanghvi (Engineering head)`;
   - `nobody`: `Choose who handles this`;
   - `chosen`: `Erin Engineer (Engineering)`, and, when the thread had decided, `The thread said: Jesh, "@Faiz Jamal can you take this?"` above it.
   When `can_change`, a `QUIET` button "Change" ("Choose" when nobody has it) opens an inline form: "Person" (`Select`: "Whoever handles a department" first, then every active member as "Name · Department"); when "Whoever handles a department" is chosen, a "Department" `Select` (the six functions) appears. Save (`BUTTON`) first saves the panel's unsaved step edits (as Run does), then sends `PATCH .../handler/` (`{user_id: n}` or `{user_id: null, function}`); the answer replaces the bundle and the panel says "Now handled by Erin Engineer." (or "Now handled by whoever handles Engineering."). Cancel (`QUIET`) closes it and focus returns to Change. Cost: low.
3. **The reply's chips can be kept or removed, never typed** (spec §5.5). While the reply's text holds placeholders, its field is `ReplyText`: one textarea where each placeholder reads as a bracketed marker (`[Jira key]`, `[Jira link]`), and under it "Fills in when step 1 runs:" with one chip per marker present, each with a remove button ("Remove Jira key from step 1"). On every change the markers the stored text had become placeholders again, in order; a marker typed beyond those stays plain words. A hint reads "Keep the words in brackets as they are: they become the Jira key and link." Cost: low.
4. **A step's note.** A skipped step with a `note` shows the note where "Not run" would be; an applied step with a `note` shows it under its state line, as a meta line. Cost: trivial.
5. **"Posts as you".** The Slack step's line reads `Posts as you (Faiz Jamal)` when `preview.slack.as_you`, else `Posts as alfiee` as today. Cost: trivial.
6. **Link lines on the organisation page.** Under a Slack item's meta line: one link per ticket, "KAN-2 · In progress · Faiz Jamal" ("Unassigned" when nobody), opening the issue in Jira in a new tab; with no `url`, the same words as plain text. Under a ticket item's meta line: a button "From Slack: Tushar Aggarwal in #all-alfiee" that opens the Slack thread sheet. `hidden_links` adds "Linked to 1 item you can't see" / "Linked to 2 items you can't see". The thread sheet lists its tickets under "Jira issues" the same way. Cost: low.
7. **The participant view** (contract SE4-26). When `bundle.participant_view`, the panel shows a meta line "You can run this because you took part in the Slack thread." under the title, and the record's name as plain text (no link) when `record.can_open === false`; a Work row's record is plain text the same way. Nothing else changes: the server already sent no reason, rationale or evidence. Cost: trivial.
8. **No new slice, no new route.** The Change form reads members through `useMembers` (cached per page load, as D2 does). Cost: trivial.

## File Structure

**Create**
- `src/features/agents/escalationText.ts` (+ `escalationText.test.ts`): `ESCALATION` words, `handlerLines`, `displayOrder`, `runsLastText`, `markerOf`, `toMarkers`, `fromMarkers`, `readHandlerRefusal`.
- `src/features/organizations/linkText.ts` (+ `linkText.test.ts`): `LINKS` words, `ticketLineText`, `fromSlackText`, `hiddenText`.
- `src/components/work/EscalationHandler.tsx` (+ `.test.tsx`).
- `src/components/work/ReplyText.tsx` (+ `.test.tsx`).
- `src/components/work/EscalationPanel.test.tsx` (the panel's escalation journeys).
- `src/components/organizations/detail/LinkLines.tsx` (+ `.test.tsx`): `TicketLines`, `FromSlackLine`.
- `src/e2e/slackEscalation.test.tsx`.

**Modify**
- `src/features/agents/bundleTypes.ts` (`Escalation`, `Bundle.escalation?`, `Bundle.participant_view?`, `BundleStep.note?`, `HandlerBody`), `src/features/work/workTypes.ts` (`FeedRecord.can_open?`, `BundleFeedItem.detail.participant_view?`), `src/features/agents/agentTypes.ts` (`SlackPreview.as_you?`), `src/features/agents/bundlesApi.ts` (`setHandler`).
- `src/features/organizations/storyTypes.ts` (`LinkedTicket`, `FromSlack`, `StoryItem.tickets?`, `hidden_links?`, `from_slack?`), `src/features/organizations/slackApi.ts` (`tickets?`, `hidden_links?`).
- `src/features/agents/testBundleFixtures.ts` (`B_ESCALATION`, `B_PARTICIPANT`, `ESCALATION_REPLY`), `src/features/agents/testBundles.ts` (`members`, `heads`, `skipSteps`, the handler route), `src/features/organizations/testSlack.ts` (`KAN_2`, `SLACK_ITEM_LINKED`, `TICKET_ITEM_FROM_SLACK`, `SLACK_THREAD_LINKED`).
- `src/components/work/BundlePanel.tsx`, `BundleStep.tsx`, `BundleOutsideFields.tsx`, `FeedRowParts.tsx`; `src/components/organizations/detail/StoryItemRow.tsx`, `SlackThread.tsx`.
- Docs (Task 7): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

---

### Task 1: Types, words, the API and the fixtures

**Files:**
- Create: `src/features/agents/escalationText.ts`, `src/features/agents/escalationText.test.ts`, `src/features/organizations/linkText.ts`, `src/features/organizations/linkText.test.ts`
- Modify: `src/features/agents/bundleTypes.ts`, `src/features/work/workTypes.ts`, `src/features/agents/agentTypes.ts`, `src/features/agents/bundlesApi.ts`, `src/features/organizations/storyTypes.ts`, `src/features/organizations/slackApi.ts`, `src/features/agents/testBundleFixtures.ts`, `src/features/agents/testBundles.ts`, `src/features/organizations/testSlack.ts`

**Interfaces:**
- Produces (types): `Escalation { function: UserFunction | ''; function_label: string; handler: { id: number; name: string; function_label: string } | null; via: 'thread' | 'unresolved' | 'team' | 'head' | 'nobody' | 'chosen'; decision: { by: string; quote: string; named: string } | null; can_change: boolean }`; `Bundle.escalation?: Escalation | null`; `Bundle.participant_view?: boolean`; `FeedRecord.can_open?: boolean`; `BundleFeedItem.detail.participant_view?: boolean`; `BundleStep.note?: string`; `HandlerBody = { user_id: number } | { user_id: null; function: UserFunction }`; `SlackPreview.as_you?: boolean`; `LinkedTicket`, `FromSlack`; `StoryItem.tickets?`, `hidden_links?`, `from_slack?`; `SlackConversationDetail.tickets?`, `hidden_links?`.
- Produces (API): `setHandler(bundleId: number, body: HandlerBody): Promise<BundleAnswer>`.
- Produces (words and rules): `ESCALATION`, `handlerLines(esc, recordName): { source: string | null; person: string | null }`, `displayOrder(bundle)`, `runsLastText(bundle)`, `markerOf(p)`, `toMarkers(raw, placeholders)`, `fromMarkers(edited, stored, placeholders)`, `readHandlerRefusal(err): HandlerRefusal` (`{ field: 'function' | 'user_id' | null; message: string; lost: boolean }`); `LINKS`, `ticketLineText(t)`, `fromSlackText(f)`, `hiddenText(n)`.
- Produces (fixtures): `B_ESCALATION` (id 601; steps 611 `jira.create`, 612 `jira.assign`, 613 `task.create`, 614 `slack.reply`; Faiz 11 via the thread, decided by Jesh); `B_PARTICIPANT` (id 602, its participant view); `ESCALATION_REPLY`; `stubBundles({ members, heads, skipSteps })`; `KAN_2`, `SLACK_ITEM_LINKED`, `TICKET_ITEM_FROM_SLACK`, `SLACK_THREAD_LINKED`.

- [ ] **Step 1: Write the failing unit tests**

Create `src/features/agents/escalationText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { B_ESCALATION, B_PIZZA, ESCALATION_REPLY } from './testBundleFixtures';
import { ESCALATION, displayOrder, fromMarkers, handlerLines, readHandlerRefusal, runsLastText, toMarkers } from './escalationText';
import type { Escalation } from './bundleTypes';

const SAID = { by: 'Jesh Sanghvi', quote: '@Faiz Jamal can you take this?', named: 'Faiz Jamal' };
const ESC: Escalation = { function: 'engineering', function_label: 'Engineering', handler: { id: 11, name: 'Faiz Jamal', function_label: 'Customer Success' }, via: 'thread', decision: SAID, can_change: true };
const JESH = { id: 12, name: 'Jesh Sanghvi', function_label: 'Engineering' };
const PLACES = B_ESCALATION.steps[3].placeholders;

describe('handlerLines (frontend Decision 2)', () => {
  it('says the thread decided, and who', () => {
    expect(handlerLines(ESC, 'Globex (QA)')).toEqual({ source: 'Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"', person: 'Faiz Jamal (Customer Success)' });
  });
  it('says the thread named someone no member matches', () => {
    expect(handlerLines({ ...ESC, via: 'unresolved', handler: null, decision: { ...SAID, named: 'Faiz Khan' } }, 'Globex (QA)')).toEqual({ source: 'The thread named Faiz Khan, but no member matches. Choose who handles this.', person: null });
  });
  it('says no one was named, and who it goes to instead', () => {
    expect(handlerLines({ ...ESC, via: 'team', handler: JESH, decision: null }, 'Globex (QA)').source).toBe("No one was named in the thread, so it goes to Jesh Sanghvi (on Globex (QA)'s account team)");
    expect(handlerLines({ ...ESC, via: 'head', handler: JESH, decision: null }, 'Globex (QA)').source).toBe('No one was named in the thread, so it goes to Jesh Sanghvi (Engineering head)');
    expect(handlerLines({ ...ESC, via: 'nobody', handler: null, decision: null }, 'Globex (QA)')).toEqual({ source: ESCALATION.CHOOSE, person: null });
  });
  it('a chosen person keeps what the thread said', () => {
    const chosen = { ...ESC, via: 'chosen' as const, handler: { id: 13, name: 'Erin Engineer', function_label: 'Engineering' } };
    expect(handlerLines(chosen, 'Globex (QA)')).toEqual({ source: 'The thread said: Jesh, "@Faiz Jamal can you take this?"', person: 'Erin Engineer (Engineering)' });
    expect(handlerLines({ ...chosen, decision: null }, 'Globex (QA)').source).toBeNull();
  });
  it('a person with no department reads as the name alone', () => {
    expect(handlerLines({ ...ESC, handler: { id: 11, name: 'Faiz Jamal', function_label: '' } }, 'Globex (QA)').person).toBe('Faiz Jamal');
  });
});

describe('displayOrder and runsLastText (Decision 1)', () => {
  it('lists an escalation reply first and the rest by position', () => {
    expect(displayOrder(B_ESCALATION).map((s) => s.id)).toEqual([614, 611, 612, 613]);
    expect(runsLastText(B_ESCALATION)).toBe('Runs last, once the Jira issue exists');
  });
  it('leaves every other bundle in position order', () => {
    expect(displayOrder(B_PIZZA).map((s) => s.position)).toEqual([1, 2, 3]);
  });
  it('says only "Runs last" without a Jira issue', () => {
    expect(runsLastText({ ...B_ESCALATION, steps: B_ESCALATION.steps.filter((s) => s.kind !== 'jira.create') })).toBe('Runs last');
  });
});

describe('the reply markers (Decision 3)', () => {
  it('shows each placeholder as its marker and back', () => {
    const shown = toMarkers(ESCALATION_REPLY, PLACES);
    expect(shown).toBe('Thanks Tushar. Logged as [Jira key] ([Jira link]) with Faiz Jamal (Customer Success).');
    expect(fromMarkers(shown, ESCALATION_REPLY, PLACES)).toBe(ESCALATION_REPLY);
  });
  it('keeps the person words and a removed marker stays removed', () => {
    expect(fromMarkers('Thanks Tushar! It is [Jira key].', ESCALATION_REPLY, PLACES)).toBe('Thanks Tushar! It is {{step 1.ticket_key}}.');
  });
  it('a marker typed beyond the stored ones stays words', () => {
    expect(fromMarkers('[Jira key] and again [Jira key] ([Jira link])', ESCALATION_REPLY, PLACES)).toBe('{{step 1.ticket_key}} and again [Jira key] ({{step 1.ticket_url}})');
  });
  it('text with no placeholders is untouched', () => {
    expect(fromMarkers('[Jira key]', 'No link here.', [])).toBe('[Jira key]');
  });
});

describe('readHandlerRefusal (contract §4)', () => {
  it('reads a field, the detail, and a lost bundle', () => {
    expect(readHandlerRefusal(new ApiError(400, { user_id: ['No such member.'] }, 'x'))).toEqual({ field: 'user_id', message: 'No such member.', lost: false });
    expect(readHandlerRefusal(new ApiError(400, { function: ['Choose a department.'] }, 'x'))).toEqual({ field: 'function', message: 'Choose a department.', lost: false });
    expect(readHandlerRefusal(new ApiError(409, { code: 'NOT_AN_ESCALATION', detail: 'Only an escalation has someone who handles it.' }, 'x'))).toEqual({ field: null, message: 'Only an escalation has someone who handles it.', lost: false });
    expect(readHandlerRefusal(new ApiError(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' }, 'x')).lost).toBe(true);
    expect(readHandlerRefusal(new Error('down'))).toEqual({ field: null, message: ESCALATION.SAVE_FAILED, lost: false });
  });
});
```

Create `src/features/organizations/linkText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fromSlackText, hiddenText, ticketLineText } from './linkText';

describe('the link lines (frontend Decision 6)', () => {
  it('a ticket line', () => {
    expect(ticketLineText({ id: 1, number: 'KAN-2', status: 'in-progress', assignee: 'Faiz Jamal', url: null })).toBe('KAN-2 · In progress · Faiz Jamal');
    expect(ticketLineText({ id: 1, number: 'KAN-3', status: 'open', assignee: null, url: null })).toBe('KAN-3 · Open · Unassigned');
    expect(ticketLineText({ id: 1, number: 'KAN-4', status: 'weird', assignee: null, url: null })).toBe('KAN-4 · weird · Unassigned');
  });
  it('a from-Slack line', () => {
    expect(fromSlackText({ id: 41, channel: '#all-alfiee', started_by: 'Tushar Aggarwal' })).toBe('From Slack: Tushar Aggarwal in #all-alfiee');
    expect(fromSlackText({ id: 41, channel: '', started_by: 'Tushar Aggarwal' })).toBe('From Slack: Tushar Aggarwal');
  });
  it('what the reader may not see', () => {
    expect(hiddenText(1)).toBe("Linked to 1 item you can't see");
    expect(hiddenText(2)).toBe("Linked to 2 items you can't see");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/agents/escalationText.test.ts src/features/organizations/linkText.test.ts --maxWorkers=2`
Expected: FAIL (modules not found).

- [ ] **Step 3: The types and the API**

`src/features/agents/bundleTypes.ts`:

```ts
/** Slack escalations D4 contract §2.2: who has an escalation and where that came from (SE4-12). */
export interface Escalation {
  /** '' when the agent named no department. */
  function: UserFunction | '';
  function_label: string;
  /** The person, with their own department's label ('' for none). */
  handler: { id: number; name: string; function_label: string } | null;
  via: 'thread' | 'unresolved' | 'team' | 'head' | 'nobody' | 'chosen';
  /** The thread's decision; it stays after a Change. */
  decision: { by: string; quote: string; named: string } | null;
  can_change: boolean;
}

/** PATCH /agents/bundles/<id>/handler/ (contract §4): a member, or whoever handles a department. */
export type HandlerBody = { user_id: number } | { user_id: null; function: UserFunction };
```

In `BundleStep` add `/** Contract §2.1 (SE4-11): why it ended as it did; absent from an older backend. */ note?: string;` and in `Bundle` add `/** Contract §2.2: an escalation's person; null or absent for every other bundle. */ escalation?: Escalation | null;` and `/** SE4-26: the reader reads this only as a participant of its Slack thread. */ participant_view?: boolean;`.

`src/features/work/workTypes.ts`: `FeedRecord` gains `/** SE4-26: false when the reader may not open it (a participant); absent means they may. */ can_open?: boolean;` and `BundleFeedItem.detail` gains `participant_view?: boolean;`.

`src/features/agents/agentTypes.ts` `SlackPreview`: `/** SE4-15: the reader posts as themselves; then `as` is their name. */ as_you?: boolean;`.

`src/features/agents/bundlesApi.ts`: `export const setHandler = (bundleId: number, body: HandlerBody) => apiFetch<BundleAnswer>(`/agents/bundles/${bundleId}/handler/`, { method: 'PATCH', body });` (add `HandlerBody` to the type import).

`src/features/organizations/storyTypes.ts`:

```ts
/** Slack escalations D4 contract §2.3: a Jira ticket filed from a Slack thread. */
export interface LinkedTicket {
  id: number;
  number: string;
  status: string;
  /** Null when nobody has it. */
  assignee: string | null;
  /** https only, else null. */
  url: string | null;
}

/** Contract §2.4: the Slack thread a ticket came from. */
export interface FromSlack {
  id: number;
  /** "#all-alfiee", or '' when the channel has no name. */
  channel: string;
  started_by: string;
}
```

and in `StoryItem`: `/** Kind slack (contract §2.3): its tickets the reader may read. */ tickets?: LinkedTicket[]; /** Kind ticket (contract §2.4): its thread, or null. */ from_slack?: FromSlack | null; /** Linked items the reader may not read (SE4-17). */ hidden_links?: number;`.

`src/features/organizations/slackApi.ts` `SlackConversationDetail`: `tickets?: LinkedTicket[]; hidden_links?: number;` (import `LinkedTicket` from `./storyTypes`).

- [ ] **Step 4: The words and the rules**

Create `src/features/agents/escalationText.ts`:

```ts
// Slack escalations D4 (contract SE4-5, SE4-12, SE4-13, SE4-26; frontend
// Decisions 1 to 3 and 7): the escalation bundle's words and pure rules.
// Kept free of React. No em dash.
import { ApiError } from '../../lib/apiClient';
import { PLACEHOLDER_RE } from './bundleText';
import type { Bundle, BundleStep, Escalation, Placeholder } from './bundleTypes';

export const ESCALATION = {
  HANDLED_BY: 'Handled by',
  CHOOSE: 'Choose who handles this',
  CHANGE: 'Change',
  CHOOSE_BUTTON: 'Choose',
  PERSON: 'Person',
  DEPARTMENT: 'Department',
  WHOEVER: 'Whoever handles a department',
  SAVE: 'Save',
  SAVING: 'Saving…',
  CANCEL: 'Cancel',
  SAVE_FAILED: "Couldn't change who handles this. Try again.",
  CHOOSE_DEPARTMENT: 'Choose a department.',
  RUNS_LAST: 'Runs last',
  RUNS_LAST_ISSUE: 'Runs last, once the Jira issue exists',
  KEEP_MARKERS: 'Keep the words in brackets as they are: they become the Jira key and link.',
  PARTICIPANT: 'You can run this because you took part in the Slack thread.',
  fillsIn: (n: number) => `Fills in when step ${n} runs:`,
  remove: (label: string) => `Remove ${label}`,
  nowHandledBy: (name: string) => `Now handled by ${name}.`,
  nowWhoever: (label: string) => `Now handled by whoever handles ${label}.`,
  assignedBy: (by: string, quote: string) => `Assigned by the thread: ${by}, "${quote}"`,
  threadSaid: (by: string, quote: string) => `The thread said: ${by}, "${quote}"`,
  noMatch: (named: string) => `The thread named ${named}, but no member matches. Choose who handles this.`,
  noOneNamed: (rest: string) => `No one was named in the thread, so it goes to ${rest}`,
} as const;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "Faiz Jamal (Customer Success)", or the name alone with no department. */
const personText = (h: NonNullable<Escalation['handler']>) => (h.function_label ? `${h.name} (${h.function_label})` : h.name);

/** The handler block's two lines (Decision 2): where it came from, and who. */
export function handlerLines(esc: Escalation, recordName: string): { source: string | null; person: string | null } {
  const said = esc.decision;
  const h = esc.handler;
  switch (esc.via) {
    case 'thread':
      return { source: said ? ESCALATION.assignedBy(firstName(said.by), said.quote) : null, person: h ? personText(h) : null };
    case 'unresolved':
      return { source: ESCALATION.noMatch(said?.named ?? ''), person: null };
    case 'team':
      return { source: h ? ESCALATION.noOneNamed(`${h.name} (on ${recordName}'s account team)`) : ESCALATION.CHOOSE, person: null };
    case 'head':
      return { source: h ? ESCALATION.noOneNamed(`${h.name} (${esc.function_label} head)`) : ESCALATION.CHOOSE, person: null };
    case 'chosen':
      return { source: said ? ESCALATION.threadSaid(firstName(said.by), said.quote) : null, person: h ? personText(h) : null };
    default:
      return { source: ESCALATION.CHOOSE, person: null };
  }
}

/** The panel's order (Decision 1): an escalation's reply first, the rest by position. */
export function displayOrder(bundle: Bundle): BundleStep[] {
  const steps = [...bundle.steps].sort((a, b) => a.position - b.position);
  if (!bundle.escalation) return steps;
  return [...steps.filter((s) => s.kind === 'slack.reply'), ...steps.filter((s) => s.kind !== 'slack.reply')];
}

export function runsLastText(bundle: Bundle): string {
  return bundle.steps.some((s) => s.kind === 'jira.create') ? ESCALATION.RUNS_LAST_ISSUE : ESCALATION.RUNS_LAST;
}

const MARK: Record<string, string> = { ticket_key: 'Jira key', ticket_url: 'Jira link' };

/** A placeholder as the person reads it in the reply's text (Decision 3). */
export const markerOf = (p: Placeholder): string => `[${MARK[p.key] ?? p.label}]`;

const named = (placeholders: Placeholder[], n: string, key: string) => placeholders.find((p) => p.step === Number(n) && p.key === key);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The stored text as the person edits it: each placeholder as its marker. */
export function toMarkers(raw: string, placeholders: Placeholder[]): string {
  return raw.replace(PLACEHOLDER_RE, (all: string, n: string, key: string) => {
    const p = named(placeholders, n, key);
    return p ? markerOf(p) : all;
  });
}

/** What the person typed, as stored text: each marker the stored text had,
 *  in order, is its placeholder again; a marker typed beyond those stays
 *  words, so a chip can be kept or removed but never typed (Decision 3). */
export function fromMarkers(edited: string, stored: string, placeholders: Placeholder[]): string {
  const budget = new Map<string, string[]>();
  for (const m of stored.matchAll(PLACEHOLDER_RE)) {
    const p = named(placeholders, m[1], m[2]);
    if (!p) continue;
    const mark = markerOf(p);
    budget.set(mark, [...(budget.get(mark) ?? []), m[0]]);
  }
  if (budget.size === 0) return edited;
  const pattern = new RegExp([...budget.keys()].map(escape).join('|'), 'g');
  return edited.replace(pattern, (mark) => budget.get(mark)?.shift() ?? mark);
}

export interface HandlerRefusal {
  field: 'function' | 'user_id' | null;
  message: string;
  /** 404: the reader lost the bundle. */
  lost: boolean;
}

const firstOf = (value: unknown): string | null => (Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null);

/** Contract §4's refusals, read for the Change form. */
export function readHandlerRefusal(err: unknown): HandlerRefusal {
  if (!(err instanceof ApiError) || typeof err.body !== 'object' || err.body === null) return { field: null, message: ESCALATION.SAVE_FAILED, lost: false };
  if (err.status === 404) return { field: null, message: '', lost: true };
  const body = err.body as Record<string, unknown>;
  for (const field of ['function', 'user_id'] as const) {
    const message = firstOf(body[field]);
    if (message) return { field, message, lost: false };
  }
  return { field: null, message: typeof body.detail === 'string' ? body.detail : ESCALATION.SAVE_FAILED, lost: false };
}
```

(`PLACEHOLDER_RE` is a global regex: `String.replace` and `matchAll` reset it, so sharing it is safe.)

Create `src/features/organizations/linkText.ts`:

```ts
// Slack escalations D4 (contract §2.3 to §2.5, SE4-17; frontend Decision 6):
// the words that link a Slack thread and its Jira tickets. No em dash.
import type { FromSlack, LinkedTicket } from './storyTypes';

export const LINKS = {
  ISSUES: 'Jira issues',
  UNASSIGNED: 'Unassigned',
  THREAD: 'Slack thread',
} as const;

const STATUS: Record<string, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  'on-hold': 'On hold',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const ticketLineText = (t: LinkedTicket): string => [t.number, STATUS[t.status] ?? t.status, t.assignee ?? LINKS.UNASSIGNED].join(' · ');

export const fromSlackText = (f: FromSlack): string => `From Slack: ${f.started_by}${f.channel ? ` in ${f.channel}` : ''}`;

export const hiddenText = (n: number): string => `Linked to ${n} ${n === 1 ? 'item' : 'items'} you can't see`;
```

- [ ] **Step 5: The fixtures and the stub**

In `src/features/agents/testBundleFixtures.ts`, after `B_LIVE`:

```ts
const GLOBEX = { type: 'customer' as const, id: 29, name: 'Globex (QA)' };
const ESCALATION_SOURCE: BundleSource = { kind: 'thread', label: 'Slack', channel: 'slack', from: 'Tushar Aggarwal', messages: 2, last_message_at: '2026-10-17T05:16:55Z', ticket: null, link: 'https://slack.com/archives/C0CA7PPRP7A/p1792041415357099' };
export const ESCALATION_REPLY = 'Thanks Tushar. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}}) with Faiz Jamal (Customer Success).';

/** Slack escalations D4: Tushar raised it in Slack, Jesh gave it to Faiz in the thread (contract §2.2). */
export const B_ESCALATION: Bundle = bundle({
  id: 601,
  title: 'Globex (QA): CSV exports fail',
  reason: 'Exports fail for everyone since this morning.',
  source: ESCALATION_SOURCE,
  record: GLOBEX,
  can_reject: true,
  can_refresh: true,
  participant_view: false,
  escalation: {
    function: 'engineering',
    function_label: 'Engineering',
    handler: { id: 11, name: 'Faiz Jamal', function_label: 'Customer Success' },
    via: 'thread',
    decision: { by: 'Jesh Sanghvi', quote: '@Faiz Jamal can you take this?', named: 'Faiz Jamal' },
    can_change: true,
  },
  steps: [
    step({
      id: 611,
      position: 1,
      kind: 'jira.create',
      label: 'Create a Jira issue',
      title: 'Log the export failure',
      outside: true,
      irreversible: true,
      fields: { project: 'KAN', issue_type: { id: '', name: 'Task' }, summary: 'CSV exports fail', description: 'Every CSV export fails since 9am.', priority: { id: '', name: 'High' }, assignee: null },
      editable: ['project', 'issue_type', 'summary', 'description', 'priority', 'assignee'],
      preview: { jira: { site: 'alfiee.atlassian.net', project: 'KAN', issue_type: 'Task', summary: 'CSV exports fail', excerpt: 'Every CSV export fails since 9am.', priority: 'High', assignee: null, as: 'Jira Bot', as_you: false, link: 'none' } },
    }),
    step({
      id: 612,
      position: 2,
      kind: 'jira.assign',
      label: 'Assign a Jira issue',
      title: 'Assign it to Faiz Jamal',
      rationale: 'The thread gave it to Faiz Jamal.',
      outside: true,
      irreversible: true,
      fields: { assignee: null },
      editable: ['assignee'],
      placeholders: [{ field: 'issue', step: 1, key: 'ticket_key', label: 'Jira key from step 1' }],
      preview: { jira_assign: { site: 'alfiee.atlassian.net', issue: '{{step 1.ticket_key}}', assignee: { name: 'Faiz Jamal', matched_later: true }, as: 'Jira Bot' } },
    }),
    step({
      id: 613,
      position: 3,
      kind: 'task.create',
      label: 'Create a task',
      title: 'A to-do for Faiz Jamal',
      fields: { title: 'Globex (QA): CSV exports fail', assignee_id: 11, due_date: '2026-10-20', priority: 'high' },
      editable: ['title', 'assignee_id', 'due_date', 'priority'],
      preview: { task: { title: 'Globex (QA): CSV exports fail', assignee: { id: 11, name: 'Faiz Jamal' }, due_date: '2026-10-20', priority: 'high' } },
    }),
    step({
      id: 614,
      position: 4,
      kind: 'slack.reply',
      label: 'Reply in Slack',
      title: 'Reply to Tushar in Slack',
      outside: true,
      irreversible: true,
      fields: { channel_choice: '7', text: ESCALATION_REPLY },
      editable: ['channel_choice', 'text'],
      placeholders: [
        { field: 'text', step: 1, key: 'ticket_key', label: 'Jira key from step 1' },
        { field: 'text', step: 1, key: 'ticket_url', label: 'Jira link from step 1' },
      ],
      preview: { slack: { channel: '#all-alfiee', in_thread: true, synced: true, as: 'Faiz Jamal', as_you: true, excerpt: ESCALATION_REPLY } },
    }),
  ],
});

/** The same escalation, read by a thread participant who can't open Globex (QA) (contract SE4-26). */
export const B_PARTICIPANT: Bundle = {
  ...B_ESCALATION,
  id: 602,
  reason: '',
  participant_view: true,
  record: { ...GLOBEX, can_open: false },
  steps: B_ESCALATION.steps.map((s) => ({ ...s, id: s.id + 10, rationale: '' })),
};
```

(If `tsc` refuses a preview key the fixture types don't know, read `agentTypes.ts` for that preview's exact shape and match it: the contract's §2 keys are what matters. If `step()` has no `rationale` default, the `rationale` on 612 shows how to set it.)

In `src/features/agents/testBundles.ts`, `BundlesStub` gains:

```ts
  /** GET /auth/members/ (the Change form's people); default none. */
  members?: { id: number; name: string; function: string; is_active: boolean }[];
  /** Department heads by function, for a Change to "whoever handles a department" (contract §4). */
  heads?: Partial<Record<string, { id: number; name: string }>>;
  /** Step id: the note a run ends it skipped with (contract SE4-10), once. */
  skipSteps?: Record<number, string>;
```

In `runStep`, after the placeholder check and before `failing`:

```ts
    if (skipping[s.id]) {
      leaveProposed(s);
      s.status = 'skipped';
      s.note = skipping[s.id];
      s.can_run = false;
      delete skipping[s.id];
      return;
    }
```

(with `const skipping = { ...(stub.skipSteps ?? {}) };` beside `failing`), and the handler route (contract §4):

```ts
  const FUNCTION_WORDS: Record<string, string> = { cs: 'Customer Success', engineering: 'Engineering', sales: 'Sales', analytics: 'Analytics', leadership: 'Leadership', other: 'Other' };

  function handler(b: Bundle, body: Record<string, unknown>) {
    if (!b.escalation) return json(409, { code: 'NOT_AN_ESCALATION', detail: 'Only an escalation has someone who handles it.' });
    if (b.status !== 'waiting') return refusal409(b, rejectedBy.get(b.id));
    if (!('user_id' in body)) return json(400, { user_id: ['This field is required.'] });
    let who: { id: number; name: string; function_label: string } | null = null;
    let via: 'head' | 'nobody' | 'chosen' = 'nobody';
    let fn = b.escalation.function;
    if (body.user_id === null) {
      if (typeof body.function !== 'string' || !DEPARTMENTS.includes(body.function)) return json(400, { function: ['Choose a department.'] });
      fn = body.function as Department;
      const head = stub.heads?.[fn];
      who = head ? { ...head, function_label: FUNCTION_WORDS[fn] } : null;
      via = who ? 'head' : 'nobody';
    } else {
      const m = (stub.members ?? []).find((p) => p.id === body.user_id);
      if (!m) return json(400, { user_id: ['No such member.'] });
      if (!m.is_active) return json(400, { user_id: [`${m.name} is deactivated. Pick an active member.`] });
      who = { id: m.id, name: m.name, function_label: FUNCTION_WORDS[m.function] ?? '' };
      via = 'chosen';
    }
    const was = b.escalation.handler;
    const before = was ? `with ${was.function_label ? `${was.name} (${was.function_label})` : was.name}` : null;
    const after = who ? `with ${who.function_label ? `${who.name} (${who.function_label})` : who.name}` : '';
    b.escalation = { ...b.escalation, function: fn, function_label: fn ? FUNCTION_WORDS[fn] : '', handler: who, via };
    for (const s of b.steps) {
      if (s.status !== 'proposed') continue;
      // Contract SE4-13: a reply still in the template's words names the new person.
      if (s.kind === 'slack.reply' && !s.edited && before && typeof s.fields.text === 'string' && s.fields.text.includes(before)) {
        s.fields = { ...s.fields, text: s.fields.text.replace(before, after).replace(' .', '.') };
        s.edited = true;
      }
      if (s.kind === 'jira.assign' && s.preview.jira_assign) {
        s.preview.jira_assign = { ...s.preview.jira_assign, assignee: who ? { name: who.name, matched_later: true } : null };
        s.edited = true;
      }
      if (s.kind === 'task.create') {
        s.fields = { ...s.fields, assignee_id: who?.id ?? null };
        if (s.preview.task) s.preview.task = { ...s.preview.task, assignee: who ? { id: who.id, name: who.name } : null };
        s.edited = true;
      }
    }
    b.edited_at = NOW;
    b.edited_by = READER;
    b.updated_at = NOW;
    return json(200, { bundle: b });
  }
```

and in the `spy`, before `const stepPath`:

```ts
    const handlerPath = /^\/agents\/bundles\/(\d+)\/handler\/$/.exec(path);
    if (handlerPath && method === 'PATCH') {
      const b = bundles.get(Number(handlerPath[1]));
      return b ? handler(b, body) : json(404, { code: 'NO_SUCH_BUNDLE', detail: 'No such bundle.' });
    }
    if (method === 'GET' && path === '/auth/members/' && stub.members) return json(200, stub.members);
```

(`DEPARTMENTS`, `Department`, `NOW`, `READER`, `json`, `refusal409`, `rejectedBy`, `leaveProposed` are the stub's existing names; if one is named differently there, use that name.)

In `src/features/organizations/testSlack.ts`:

```ts
export const KAN_2: LinkedTicket = { id: 812, number: 'KAN-2', status: 'in-progress', assignee: 'Faiz Jamal', url: 'https://alfiee.atlassian.net/browse/KAN-2' };

/** The D1 thread with its ticket (contract §2.3). */
export const SLACK_ITEM_LINKED: StoryItem = { ...SLACK_ITEM, tickets: [KAN_2], hidden_links: 0 };

/** The ticket filed from it (contract §2.4). */
export const TICKET_ITEM_FROM_SLACK: StoryItem = {
  id: 812,
  kind: 'ticket',
  source: 'jira',
  occurred_at: '2026-10-17T00:00:00Z',
  all_day: true,
  account: null,
  title: 'CSV exports fail',
  summary: 'KAN-2 · High · In Progress',
  actor: { id: null, name: 'Tushar Aggarwal' },
  link: { thread_id: null, url: 'https://alfiee.atlassian.net/browse/KAN-2' },
  from_slack: { id: 41, channel: '#all-alfiee', started_by: 'Mohd faiz' },
  hidden_links: 0,
};

export const SLACK_THREAD_LINKED: SlackConversationDetail = { ...SLACK_THREAD, tickets: [KAN_2], hidden_links: 1 };
```

(import `LinkedTicket` from `./storyTypes`. `started_by` is the D1 fixture thread's poster, "Mohd faiz", so the sheet it opens is that thread.)

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run src/features/agents/escalationText.test.ts src/features/organizations/linkText.test.ts src/features/agents src/features/work --maxWorkers=2 && npx tsc -b`
Expected: PASS, `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/bundleTypes.ts src/features/work/workTypes.ts src/features/agents/agentTypes.ts src/features/agents/bundlesApi.ts src/features/agents/escalationText.ts src/features/agents/escalationText.test.ts src/features/organizations/storyTypes.ts src/features/organizations/slackApi.ts src/features/organizations/linkText.ts src/features/organizations/linkText.test.ts src/features/agents/testBundleFixtures.ts src/features/agents/testBundles.ts src/features/organizations/testSlack.ts
git commit -m "feat(agents): escalation bundle types, words, the handler call and fixtures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The reply first, "Runs last", and a step's note

**Files:**
- Modify: `src/components/work/BundlePanel.tsx:419-456`, `src/components/work/BundleStep.tsx`
- Create: `src/components/work/EscalationPanel.test.tsx`

**Interfaces:**
- Consumes: `displayOrder`, `runsLastText` (Task 1); `B_ESCALATION`, `stubBundles({ skipSteps })` (Task 1).
- Produces: `BundleStep` prop `runsLast?: string`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/work/EscalationPanel.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { TEAM_MEMBERS } from '../../features/knowledge/testHeads';
import { BUNDLES, B_ESCALATION } from '../../features/agents/testBundleFixtures';
import { stubBundles } from '../../features/agents/testBundles';
import { renderWork } from '../../pages/work/testPages';
import { resetViewport } from '../../test/viewport';

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

const NOTE = 'Faiz has no account in Jira, so the issue is unassigned. Their to-do is in Work.';

async function openEscalation(stub: Parameters<typeof stubBundles>[0] = {}) {
  stubBundles({ bundles: [...BUNDLES, B_ESCALATION], members: TEAM_MEMBERS, ...stub });
  renderWork(`/work?queue=mine&bundle=${B_ESCALATION.id}`);
  return screen.findByRole('dialog', { name: B_ESCALATION.title });
}

describe('An escalation bundle (Slack escalations D4, frontend Decisions 1 and 4)', () => {
  it('lists the reply first, says it runs last, and keeps its run number', async () => {
    const panel = await openEscalation();
    const steps = within(within(panel).getByRole('list', { name: 'Steps' })).getAllByRole('listitem');
    expect(steps.map((s) => s.getAttribute('data-step'))).toEqual(['614', '611', '612', '613']);
    expect(within(steps[0]).getByText('4. Reply in Slack')).toBeInTheDocument();
    expect(within(steps[0]).getByText('Runs last, once the Jira issue exists')).toBeInTheDocument();
    expect(within(steps[1]).queryByText(/Runs last/)).toBeNull();
  });

  it('shows a skipped step note where "Not run" would be', async () => {
    const panel = await openEscalation({ skipSteps: { 612: NOTE }, outputs: { 611: { ticket_key: 'KAN-2', ticket_url: 'https://alfiee.atlassian.net/browse/KAN-2' } } });
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    const assign = within(panel).getByTestId('step-612');
    expect(await within(assign).findByText(NOTE)).toBeInTheDocument();
    expect(within(assign).queryByText('Not run')).toBeNull();
  });

  it('lists any other bundle by position, with no "Runs last"', async () => {
    stubBundles({ bundles: BUNDLES });
    renderWork(`/work?queue=mine&bundle=${BUNDLES[0].id}`);
    const panel = await screen.findByRole('dialog', { name: BUNDLES[0].title });
    expect(within(panel).queryByText(/Runs last/)).toBeNull();
  });
});
```

(`ListCard` names its list with its `label`; if it renders a heading instead, find the steps with `within(panel).getAllByTestId(/^step-/)`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/work/EscalationPanel.test.tsx --maxWorkers=2`
Expected: FAIL (the order is `611, 612, 613, 614`; no "Runs last"; "Not run" shows).

- [ ] **Step 3: Implement**

`src/components/work/BundlePanel.tsx`: import `displayOrder, runsLastText` from `../../features/agents/escalationText`; in the `ListCard`:

```tsx
        <ListCard label={BUNDLE.STEPS}>
          {displayOrder(bundle).map((step) => (
            <BundleStep
              key={step.id}
              bundle={bundle}
              step={step}
              runsLast={bundle.escalation && step.kind === 'slack.reply' ? runsLastText(bundle) : undefined}
              ...the existing props, unchanged...
            />
          ))}
        </ListCard>
```

`src/components/work/BundleStep.tsx`: add to `BundleStepProps`:

```ts
  /** Slack escalations D4 Decision 1: an escalation's reply, listed first, says it runs last. */
  runsLast?: string;
```

render it right under the heading (inside the same `div` as the title, before the title paragraph):

```tsx
          {runsLast ? <p className={TYPE.meta}>{runsLast}</p> : null}
```

and the state line reads the note (Decision 4):

```tsx
  const note = step.note ?? '';
  const state = step.status === 'skipped' && note ? note : stepStateText(step);
```

with, after the state paragraph:

```tsx
      {step.status === 'applied' && note ? <p className={TYPE.meta}>{note}</p> : null}
```

- [ ] **Step 4: Run the tests to verify they pass, with the panel's own**

Run: `npx vitest run src/components/work/EscalationPanel.test.tsx src/components/work/BundlePanel.test.tsx src/components/work/BundleStep.test.tsx --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet at `BASELINE`.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/BundlePanel.tsx src/components/work/BundleStep.tsx src/components/work/EscalationPanel.test.tsx
git commit -m "feat(work): an escalation lists its reply first and a skipped step shows why

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Handled by, where it came from, and Change

**Files:**
- Create: `src/components/work/EscalationHandler.tsx`, `src/components/work/EscalationHandler.test.tsx`
- Modify: `src/components/work/BundlePanel.tsx` (the block and `changeHandler`), `src/components/work/EscalationPanel.test.tsx` (the panel journey)

**Interfaces:**
- Produces: `EscalationHandler({ escalation, recordName, onChange }: { escalation: Escalation; recordName: string; onChange: (body: HandlerBody) => Promise<HandlerRefusal | null> })`.
- Consumes: `handlerLines`, `ESCALATION`, `readHandlerRefusal`, `setHandler`, `HandlerBody` (Task 1); `useMembers` (`features/knowledge/useMembers.ts`); `FUNCTION_LABELS`, `UserFunction` (`features/auth/authSlice.ts`); `useSubmitOnce` (`components/plans/useSubmitOnce.ts`); `Select`, `BUTTON`, `QUIET`, `FIELD_ERROR`, `FORM_ALERT`, `TYPE` (`components/ui`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/work/EscalationHandler.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../../features/knowledge/useMembers';
import { TEAM_MEMBERS } from '../../features/knowledge/testHeads';
import type { Escalation } from '../../features/agents/bundleTypes';
import { EscalationHandler } from './EscalationHandler';

const ESC: Escalation = {
  function: 'engineering',
  function_label: 'Engineering',
  handler: { id: 11, name: 'Faiz Jamal', function_label: 'Customer Success' },
  via: 'thread',
  decision: { by: 'Jesh Sanghvi', quote: '@Faiz Jamal can you take this?', named: 'Faiz Jamal' },
  can_change: true,
};

function members() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => TEAM_MEMBERS })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetMembersCache();
});

describe('EscalationHandler (frontend Decision 2)', () => {
  it('says where the work came from and who has it, with Change only when allowed', () => {
    members();
    const { rerender } = render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={vi.fn()} />);
    expect(screen.getByText('Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    expect(screen.getByText('Faiz Jamal (Customer Success)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    rerender(<EscalationHandler escalation={{ ...ESC, can_change: false }} recordName="Globex (QA)" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it('asks to choose when the thread named someone no member matches', () => {
    members();
    render(<EscalationHandler escalation={{ ...ESC, handler: null, via: 'unresolved', decision: { ...ESC.decision!, named: 'Faiz Khan' } }} recordName="Globex (QA)" onChange={vi.fn()} />);
    expect(screen.getByText('The thread named Faiz Khan, but no member matches. Choose who handles this.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose' })).toBeInTheDocument();
  });

  it('changes to any active member, whatever their department', async () => {
    members();
    const onChange = vi.fn(async () => null);
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    const person = await screen.findByRole('combobox', { name: 'Person' });
    expect([...(person as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      'Whoever handles a department',
      'Carl CSM · Customer Success',
      'Faiz Jamal · Customer Success',
      'Jesh Sanghvi · Engineering',
      'Erin Engineer · Engineering',
      'Sam Seller · Sales',
    ]);
    expect(person).toHaveValue('11');
    expect(screen.queryByRole('combobox', { name: 'Department' })).toBeNull();
    await userEvent.selectOptions(person, '13');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith({ user_id: 13 });
    expect(screen.queryByRole('combobox', { name: 'Person' })).toBeNull();
  });

  it('whoever handles a department asks for the department', async () => {
    members();
    const onChange = vi.fn(async () => null);
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Person' }), '');
    const department = screen.getByRole('combobox', { name: 'Department' });
    expect(department).toHaveValue('engineering');
    await userEvent.selectOptions(department, 'sales');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith({ user_id: null, function: 'sales' });
  });

  it('shows a refusal under its field and keeps the form open', async () => {
    members();
    const onChange = vi.fn(async () => ({ field: 'user_id' as const, message: 'Sam Seller is deactivated. Pick an active member.', lost: false }));
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Person' }), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sam Seller is deactivated. Pick an active member.');
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveAttribute('aria-invalid', 'true');
  });

  it('Cancel closes the form and focus goes back to Change', async () => {
    members();
    render(<EscalationHandler escalation={ESC} recordName="Globex (QA)" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Change' })).toHaveFocus();
  });
});
```

Append to `src/components/work/EscalationPanel.test.tsx`:

```tsx
describe('Change who handles an escalation (Decision 2, contract §4)', () => {
  it('rewrites the assignment and the to-do and says so', async () => {
    const panel = await openEscalation();
    expect(within(panel).getByText('Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Person' }), '13');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(await within(panel).findByText('Now handled by Erin Engineer.')).toBeInTheDocument();
    expect(within(panel).getByText('Erin Engineer (Engineering)')).toBeInTheDocument();
    expect(within(panel).getByText('The thread said: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    expect(within(within(panel).getByTestId('step-612')).getByText(/Erin Engineer/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/work/EscalationHandler.test.tsx src/components/work/EscalationPanel.test.tsx --maxWorkers=2`
Expected: FAIL (module not found; no handler block in the panel).

- [ ] **Step 3: The component**

Create `src/components/work/EscalationHandler.tsx`:

```tsx
import { useId, useRef, useState } from 'react';
import { FUNCTION_LABELS, type UserFunction } from '../../features/auth/authSlice';
import { ESCALATION, handlerLines, type HandlerRefusal } from '../../features/agents/escalationText';
import type { Escalation, HandlerBody } from '../../features/agents/bundleTypes';
import { useMembers } from '../../features/knowledge/useMembers';
import { useSubmitOnce } from '../plans/useSubmitOnce';
import { BUTTON, FIELD_ERROR, FORM_ALERT, QUIET, Select, TYPE } from '../ui';

const FUNCTIONS = Object.keys(FUNCTION_LABELS) as UserFunction[];

/** Who has an escalation, where that came from, and Change (Slack
 *  escalations D4 frontend Decision 2; spec §5.5): any active member, or
 *  whoever handles a department. The panel saves its other edits first. */
export function EscalationHandler({ escalation, recordName, onChange }: { escalation: Escalation; recordName: string; onChange: (body: HandlerBody) => Promise<HandlerRefusal | null> }) {
  const id = useId();
  const members = useMembers();
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState('');
  const [fn, setFn] = useState<UserFunction | ''>('');
  const [refusal, setRefusal] = useState<HandlerRefusal | null>(null);
  const { busy, run } = useSubmitOnce();
  const changeRef = useRef<HTMLButtonElement>(null);
  const lines = handlerLines(escalation, recordName);
  const people = members.filter((m) => m.is_active);

  const start = () => {
    setPerson(escalation.handler ? String(escalation.handler.id) : '');
    setFn(escalation.function || '');
    setRefusal(null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setRefusal(null);
    window.requestAnimationFrame(() => changeRef.current?.focus());
  };
  async function save() {
    if (busy) return;
    if (!person && !fn) {
      setRefusal({ field: 'function', message: ESCALATION.CHOOSE_DEPARTMENT, lost: false });
      return;
    }
    const body: HandlerBody = person ? { user_id: Number(person) } : { user_id: null, function: fn as UserFunction };
    const outcome = await run(() => onChange(body));
    if (!outcome || !outcome.ok) return;
    if (outcome.value) setRefusal(outcome.value);
    else close();
  }

  const fieldError = (field: 'function' | 'user_id') => (refusal?.field === field ? refusal.message : null);
  return (
    <section aria-labelledby={`${id}-label`} className="flex flex-col gap-1">
      <p id={`${id}-label`} className={TYPE.label}>
        {ESCALATION.HANDLED_BY}
      </p>
      {lines.source ? <p className={`${TYPE.meta} min-w-0`}>{lines.source}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {lines.person ? <p className={`${TYPE.body} min-w-0 font-semibold`}>{lines.person}</p> : null}
        {escalation.can_change && !open ? (
          <button ref={changeRef} type="button" onClick={start} className={QUIET}>
            {escalation.handler ? ESCALATION.CHANGE : ESCALATION.CHOOSE_BUTTON}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Select
              id={`${id}-person`}
              label={ESCALATION.PERSON}
              value={person}
              onChange={(next) => {
                setPerson(next);
                setRefusal(null);
              }}
              options={[{ value: '', label: ESCALATION.WHOEVER }, ...people.map((m) => ({ value: String(m.id), label: `${m.name} · ${FUNCTION_LABELS[m.function as UserFunction] ?? m.function}` }))]}
              invalid={Boolean(fieldError('user_id'))}
              describedBy={fieldError('user_id') ? `${id}-person-error` : undefined}
            />
            {fieldError('user_id') ? (
              <p id={`${id}-person-error`} role="alert" className={FIELD_ERROR}>
                {fieldError('user_id')}
              </p>
            ) : null}
          </div>
          {person === '' ? (
            <div className="flex flex-col gap-1">
              <Select
                id={`${id}-function`}
                label={ESCALATION.DEPARTMENT}
                value={fn}
                onChange={(next) => setFn(next as UserFunction)}
                options={[...(fn ? [] : [{ value: '', label: ESCALATION.DEPARTMENT }]), ...FUNCTIONS.map((value) => ({ value, label: FUNCTION_LABELS[value] }))]}
                invalid={Boolean(fieldError('function'))}
                describedBy={fieldError('function') ? `${id}-function-error` : undefined}
              />
              {fieldError('function') ? (
                <p id={`${id}-function-error`} role="alert" className={FIELD_ERROR}>
                  {fieldError('function')}
                </p>
              ) : null}
            </div>
          ) : null}
          {refusal && refusal.field === null && refusal.message ? (
            <p role="alert" className={FORM_ALERT}>
              {refusal.message}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void save()} aria-disabled={busy || undefined} className={BUTTON}>
              {busy ? ESCALATION.SAVING : ESCALATION.SAVE}
            </button>
            <button type="button" onClick={close} className={QUIET}>
              {ESCALATION.CANCEL}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
```

(Check `Select`'s option type accepts a `''` value with `T = string`; if `Select<T>` infers `UserFunction | ''`, cast as the other `Select` users in the repo do. `useMembers()` returns the D2 `User` shape with `function` and `is_active`: if its name for the department differs, use it.)

- [ ] **Step 4: The panel**

In `src/components/work/BundlePanel.tsx` (imports: `setHandler` from `bundlesApi`, `ESCALATION, readHandlerRefusal, type HandlerRefusal` from `escalationText`, `EscalationHandler`, `FUNCTION_LABELS` from `authSlice`, `type HandlerBody` from `bundleTypes`):

```tsx
  /** Change who handles an escalation (frontend Decision 2; contract §4): the
   *  edits so far are saved first, as Run does; the answer replaces the bundle. */
  async function changeHandler(body: HandlerBody): Promise<HandlerRefusal | null> {
    if (!bundle || !current) return null;
    if (!(await saveAll(current))) return null;
    try {
      const answer = await setHandler(bundle.id, body);
      replaceAll(answer.bundle);
      feedChanged();
      taskChanged();
      const who = answer.bundle.escalation?.handler;
      say(who ? ESCALATION.nowHandledBy(who.name) : ESCALATION.nowWhoever(body.user_id === null ? FUNCTION_LABELS[body.function] : ''));
      return null;
    } catch (err) {
      const read = readHandlerRefusal(err);
      if (read.lost) load.lose();
      return read;
    }
  }
```

and between the meta line and the `ListCard`:

```tsx
        {bundle.escalation ? <EscalationHandler escalation={bundle.escalation} recordName={bundle.record?.name ?? ''} onChange={changeHandler} /> : null}
```

(While a `say` summary is shown, its paragraph takes focus, as after a Run. `saveAll`, `replaceAll`, `feedChanged`, `taskChanged`, `say`, `load.lose` and `current` are the panel's existing names, the ones Run uses.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/work/EscalationHandler.test.tsx src/components/work/EscalationPanel.test.tsx src/components/work/BundlePanel.test.tsx --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet at `BASELINE`.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/EscalationHandler.tsx src/components/work/EscalationHandler.test.tsx src/components/work/BundlePanel.tsx src/components/work/EscalationPanel.test.tsx
git commit -m "feat(work): an escalation says who has it and where that came from, with change

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The reply's Jira key and link as chips, and "Posts as you"

**Files:**
- Create: `src/components/work/ReplyText.tsx`, `src/components/work/ReplyText.test.tsx`
- Modify: `src/components/work/BundleOutsideFields.tsx` (the `slack.reply` branch), `src/components/work/EscalationPanel.test.tsx`

**Interfaces:**
- Produces: `ReplyText({ id, label, value, stored, placeholders, error, onChange })`.
- Consumes: `markerOf`, `toMarkers`, `fromMarkers`, `ESCALATION` (Task 1); `postsAsText`, `whoText`, `OUTSIDE` (`bundleText.ts`, existing); `ICON_BUTTON`, `INPUT`, `INVALID`, `FIELD_ERROR`, `TYPE` (`components/ui`).

- [ ] **Step 1: Write the failing tests**

Create `src/components/work/ReplyText.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { B_ESCALATION, ESCALATION_REPLY } from '../../features/agents/testBundleFixtures';
import { ReplyText } from './ReplyText';

const PLACES = B_ESCALATION.steps[3].placeholders;

function Harness({ onRaw }: { onRaw: (raw: string) => void }) {
  const [value, setValue] = useState(ESCALATION_REPLY);
  return (
    <ReplyText
      id="r"
      label="Message"
      value={value}
      stored={ESCALATION_REPLY}
      placeholders={PLACES}
      onChange={(raw) => {
        setValue(raw);
        onRaw(raw);
      }}
    />
  );
}

describe('ReplyText (frontend Decision 3)', () => {
  it('shows the Jira key and link as markers, with a chip each', () => {
    render(<Harness onRaw={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Thanks Tushar. Logged as [Jira key] ([Jira link]) with Faiz Jamal (Customer Success).');
    expect(screen.getByText('Fills in when step 1 runs:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Jira key from step 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Jira link from step 1' })).toBeInTheDocument();
  });

  it('typing words keeps the placeholders in what is saved', () => {
    const onRaw = vi.fn();
    render(<Harness onRaw={onRaw} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Hi Faiz, it is [Jira key] ([Jira link]).' } });
    expect(onRaw).toHaveBeenLastCalledWith('Hi Faiz, it is {{step 1.ticket_key}} ({{step 1.ticket_url}}).');
  });

  it('removing a chip takes its placeholder out', async () => {
    const onRaw = vi.fn();
    render(<Harness onRaw={onRaw} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Jira link from step 1' }));
    expect(onRaw).toHaveBeenLastCalledWith('Thanks Tushar. Logged as {{step 1.ticket_key}} () with Faiz Jamal (Customer Success).');
    expect(screen.queryByRole('button', { name: 'Remove Jira link from step 1' })).toBeNull();
  });

  it('a chip cannot be typed', () => {
    const onRaw = vi.fn();
    render(<Harness onRaw={onRaw} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), { target: { value: '[Jira key] [Jira key] [Jira link]' } });
    expect(onRaw).toHaveBeenLastCalledWith('{{step 1.ticket_key}} [Jira key] {{step 1.ticket_url}}');
  });
});
```

Append to `src/components/work/EscalationPanel.test.tsx`:

```tsx
describe('The reply step (Decisions 3 and 5)', () => {
  it('posts as you, edits around its chips and runs with the real key and link', async () => {
    const panel = await openEscalation({ outputs: { 611: { ticket_key: 'KAN-2', ticket_url: 'https://alfiee.atlassian.net/browse/KAN-2' } } });
    const reply = within(panel).getByTestId('step-614');
    expect(within(reply).getByText('Posts as you (Faiz Jamal)')).toBeInTheDocument();
    const text = within(reply).getByRole('textbox', { name: 'Message' });
    expect(text).toHaveValue('Thanks Tushar. Logged as [Jira key] ([Jira link]) with Faiz Jamal (Customer Success).');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 4 selected' }));
    expect(await within(reply).findByText(/Applied/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/work/ReplyText.test.tsx src/components/work/EscalationPanel.test.tsx --maxWorkers=2`
Expected: FAIL (module not found; the panel shows the raw braces in a plain textarea and "Posts as Faiz Jamal").

- [ ] **Step 3: The component**

Create `src/components/work/ReplyText.tsx`:

```tsx
import { X } from 'lucide-react';
import { ESCALATION, fromMarkers, markerOf, toMarkers } from '../../features/agents/escalationText';
import type { Placeholder } from '../../features/agents/bundleTypes';
import { FIELD_ERROR, ICON_BUTTON, INPUT, INVALID, TYPE } from '../ui';

const AREA = `${INPUT} ${INVALID} min-h-24 py-2`;

/** A Slack escalation's reply text (Slack escalations D4 frontend Decision 3;
 *  spec §5.5): each Jira placeholder reads as a bracketed marker and has a
 *  chip under the field that removes it. Markers the stored text had are
 *  kept; one typed beyond those stays words, so a chip is never typed. */
export function ReplyText({ id, label, value, stored, placeholders, error, onChange }: { id: string; label: string; value: string; stored: string; placeholders: Placeholder[]; error?: string; onChange: (raw: string) => void }) {
  const shown = toMarkers(value, placeholders);
  const mine = placeholders.filter((p) => p.field === 'text');
  const present = mine.filter((p) => shown.includes(markerOf(p)));
  const step = mine[0]?.step;
  const describedBy = [error ? `${id}-error` : null, `${id}-hint`].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      <textarea id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={AREA} value={shown} onChange={(event) => onChange(fromMarkers(event.target.value, stored, placeholders))} />
      <p id={`${id}-hint`} className={TYPE.meta}>
        {ESCALATION.KEEP_MARKERS}
      </p>
      {present.length > 0 && step !== undefined ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className={TYPE.meta}>{ESCALATION.fillsIn(step)}</span>
          {present.map((p) => (
            <span key={`${p.step}.${p.key}`} data-part="placeholder" className={`inline-flex items-center gap-1 rounded-full border border-line bg-subtle pl-2 ${TYPE.body} font-semibold`}>
              {p.label}
              <button type="button" aria-label={ESCALATION.remove(p.label)} onClick={() => onChange(fromMarkers(shown.replace(markerOf(p), ''), stored, placeholders))} className={ICON_BUTTON}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: The Slack branch uses it, and says who it posts as**

In `src/components/work/BundleOutsideFields.tsx`, the `slack.reply` branch:

```tsx
        {slack ? <p className={TYPE.meta}>{postsAsText(whoText(slack.as, slack.as_you))}</p> : null}
        ...the channel picker, unchanged...
        {can('text') && step.placeholders.some((p) => p.field === 'text') ? (
          <ReplyText id={id('text')} label={OUTSIDE.MESSAGE} value={String(fields.text ?? '')} stored={String(step.fields.text ?? '')} placeholders={step.placeholders} error={errors.text} onChange={(v) => onField('text', v)} />
        ) : can('text') ? (
          <Text id={id('text')} label={OUTSIDE.MESSAGE} area value={String(fields.text ?? '')} error={errors.text} onChange={(v) => onField('text', v)} />
        ) : null}
```

(import `whoText` from `bundleText` and `ReplyText`).

- [ ] **Step 5: Run the tests to verify they pass, with the outside fields' own**

Run: `npx vitest run src/components/work/ReplyText.test.tsx src/components/work/EscalationPanel.test.tsx src/components/work/BundleOutsideFields.test.tsx src/e2e/bundleOutside.test.tsx --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS ("Posts as Revenact" stays for a step with no `as_you`); ratchet at `BASELINE`.

- [ ] **Step 6: Commit**

```bash
git add src/components/work/ReplyText.tsx src/components/work/ReplyText.test.tsx src/components/work/BundleOutsideFields.tsx src/components/work/EscalationPanel.test.tsx
git commit -m "feat(work): the escalation reply keeps its jira key and link as chips and says when it posts as you

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The participant view

**Files:**
- Modify: `src/components/work/BundlePanel.tsx` (the participant line; the record as text), `src/components/work/FeedRowParts.tsx` (`FeedRowMeta`: the record as text), `src/components/work/EscalationPanel.test.tsx`
- Create: `src/components/work/FeedRowParts.test.tsx` (or add to it, if it exists)

**Interfaces:**
- Consumes: `ESCALATION.PARTICIPANT` (Task 1); `B_PARTICIPANT` (Task 1); `BUNDLE_ITEM` (`features/work/testFeedFixtures.ts`).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/work/EscalationPanel.test.tsx` (import `B_PARTICIPANT` beside `B_ESCALATION`):

```tsx
describe('The participant view (Decision 7, contract SE4-26)', () => {
  it('says why the reader may run it, and names the record without a link', async () => {
    stubBundles({ bundles: [...BUNDLES, B_PARTICIPANT], members: TEAM_MEMBERS });
    renderWork(`/work?queue=mine&bundle=${B_PARTICIPANT.id}`);
    const panel = await screen.findByRole('dialog', { name: B_PARTICIPANT.title });
    expect(within(panel).getByText('You can run this because you took part in the Slack thread.')).toBeInTheDocument();
    expect(within(panel).getByText('Globex (QA)')).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Globex (QA)' })).toBeNull();
    expect(within(panel).getByRole('button', { name: /^Run \d selected$/ })).toBeInTheDocument();
  });

  it('any other reader keeps the record link and sees no participant line', async () => {
    const panel = await openEscalation();
    expect(within(panel).getByRole('link', { name: 'Globex (QA)' })).toBeInTheDocument();
    expect(within(panel).queryByText(/took part in the Slack thread/)).toBeNull();
  });
});
```

Create `src/components/work/FeedRowParts.test.tsx` (if the file exists, add the `describe` to it):

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BUNDLE_ITEM } from '../../features/work/testFeedFixtures';
import { FeedRowMeta } from './FeedRowParts';

describe('FeedRowMeta and the participant view (Decision 7)', () => {
  it('a record the reader may not open is its name, not a link', () => {
    const item = { ...BUNDLE_ITEM, record: { ...BUNDLE_ITEM.record!, can_open: false } };
    render(
      <MemoryRouter>
        <FeedRowMeta item={item} group="decide" />
      </MemoryRouter>,
    );
    expect(screen.getByText(BUNDLE_ITEM.record!.name)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('any other record stays a link', () => {
    render(
      <MemoryRouter>
        <FeedRowMeta item={BUNDLE_ITEM} group="decide" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: BUNDLE_ITEM.record!.name })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/work/EscalationPanel.test.tsx src/components/work/FeedRowParts.test.tsx --maxWorkers=2`
Expected: FAIL (no participant line; the record is a link).

- [ ] **Step 3: Implement**

`src/components/work/BundlePanel.tsx`, right under the title block (before the `said` summary):

```tsx
        {bundle.participant_view ? <p className={TYPE.meta}>{ESCALATION.PARTICIPANT}</p> : null}
```

and the record in the meta line:

```tsx
          {bundle.record ? (
            <>
              {bundle.record.can_open === false ? (
                <span>{bundle.record.name}</span>
              ) : (
                <Link to={recordPath(bundle.record)} className={LINK}>
                  {bundle.record.name}
                </Link>
              )}
              <span aria-hidden="true">·</span>
              <span>{bundleForText(bundle)}</span>
            </>
          ) : (
            <span>{bundleForText(bundle)}</span>
          )}
```

`src/components/work/FeedRowParts.tsx` `FeedRowMeta`:

```tsx
  if (item.record) {
    parts.push(
      // SE4-26: a participant who can't open the record reads its name only
      item.record.can_open === false ? (
        <span key="record">{item.record.name}</span>
      ) : (
        <Link key="record" to={recordPath(item.record)} className={META_LINK}>
          {item.record.name}
        </Link>
      ),
    );
  }
```

(The panel already hides an empty `reason`; the server sends `""` in the participant view. No em dash in the comment.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/work --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet at `BASELINE`.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/BundlePanel.tsx src/components/work/FeedRowParts.tsx src/components/work/FeedRowParts.test.tsx src/components/work/EscalationPanel.test.tsx
git commit -m "feat(work): the participant view of a slack escalation, with no way into the record

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The thread and its tickets, on the organisation page

**Files:**
- Create: `src/components/organizations/detail/LinkLines.tsx`, `src/components/organizations/detail/LinkLines.test.tsx`
- Modify: `src/components/organizations/detail/StoryItemRow.tsx`, `src/components/organizations/detail/SlackThread.tsx`, `src/components/organizations/detail/SlackThread.test.tsx`

**Interfaces:**
- Produces: `TicketLines({ tickets, hidden }: { tickets: LinkedTicket[]; hidden: number })`; `FromSlackLine({ from, hidden, onOpen }: { from: FromSlack | null; hidden: number; onOpen: (from: FromSlack) => void })`.
- Consumes: `ticketLineText`, `fromSlackText`, `hiddenText`, `LINKS` (Task 1); `LINK` (`StoryItemRow.tsx`); `KAN_2`, `SLACK_ITEM_LINKED`, `TICKET_ITEM_FROM_SLACK`, `SLACK_THREAD_LINKED` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `src/components/organizations/detail/LinkLines.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KAN_2 } from '../../../features/organizations/testSlack';
import { FromSlackLine, TicketLines } from './LinkLines';

describe('TicketLines (frontend Decision 6)', () => {
  it('links each ticket to Jira in a new tab', () => {
    render(<TicketLines tickets={[KAN_2]} hidden={0} />);
    const link = screen.getByRole('link', { name: /KAN-2 · In progress · Faiz Jamal/ });
    expect(link).toHaveAttribute('href', 'https://alfiee.atlassian.net/browse/KAN-2');
    expect(link).toHaveAttribute('target', '_blank');
  });
  it('a ticket with no https link is words, and what the reader may not see is counted', () => {
    render(<TicketLines tickets={[{ ...KAN_2, url: null }]} hidden={2} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('KAN-2 · In progress · Faiz Jamal')).toBeInTheDocument();
    expect(screen.getByText("Linked to 2 items you can't see")).toBeInTheDocument();
  });
  it('says nothing with nothing linked', () => {
    const { container } = render(<TicketLines tickets={[]} hidden={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('FromSlackLine (frontend Decision 6)', () => {
  it('opens the thread', async () => {
    const onOpen = vi.fn();
    const from = { id: 41, channel: '#all-alfiee', started_by: 'Faiz Jamal' };
    render(<FromSlackLine from={from} hidden={0} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'From Slack: Faiz Jamal in #all-alfiee' }));
    expect(onOpen).toHaveBeenCalledWith(from);
  });
  it('a thread the reader may not read is counted, never named', () => {
    render(<FromSlackLine from={null} hidden={1} onOpen={vi.fn()} />);
    expect(screen.getByText("Linked to 1 item you can't see")).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

In `src/components/organizations/detail/SlackThread.test.tsx` add:

```tsx
  it('lists its Jira issues and counts the ones the reader may not see', async () => {
    stubSlackConversation({ detail: SLACK_THREAD_LINKED });
    open();
    expect(await screen.findByText('Jira issues')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /KAN-2 · In progress · Faiz Jamal/ })).toHaveAttribute('href', 'https://alfiee.atlassian.net/browse/KAN-2');
    expect(screen.getByText("Linked to 1 item you can't see")).toBeInTheDocument();
  });
```

(import `SLACK_THREAD_LINKED`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/organizations/detail/LinkLines.test.tsx src/components/organizations/detail/SlackThread.test.tsx --maxWorkers=2`
Expected: FAIL (module not found; no "Jira issues").

- [ ] **Step 3: The lines**

Create `src/components/organizations/detail/LinkLines.tsx`:

```tsx
import { ExternalLink } from 'lucide-react';
import { fromSlackText, hiddenText, ticketLineText } from '../../../features/organizations/linkText';
import type { FromSlack, LinkedTicket } from '../../../features/organizations/storyTypes';
import { TYPE } from '../../ui';
import { LINK } from './StoryItemRow';

/** A Slack thread's Jira tickets (Slack escalations D4 frontend Decision 6;
 *  contract §2.3): each opens in Jira; what the reader may not read is a count. */
export function TicketLines({ tickets, hidden }: { tickets: LinkedTicket[]; hidden: number }) {
  if (tickets.length === 0 && hidden === 0) return null;
  return (
    <ul className="flex flex-col">
      {tickets.map((t) => (
        <li key={t.id}>
          {t.url && /^https:\/\//.test(t.url) ? (
            <a href={t.url} target="_blank" rel="noopener noreferrer" className={LINK}>
              {ticketLineText(t)}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span className={TYPE.meta}>{ticketLineText(t)}</span>
          )}
        </li>
      ))}
      {hidden > 0 ? (
        <li>
          <span className={TYPE.meta}>{hiddenText(hidden)}</span>
        </li>
      ) : null}
    </ul>
  );
}

/** A ticket's Slack thread (contract §2.4): it opens the thread sheet. */
export function FromSlackLine({ from, hidden, onOpen }: { from: FromSlack | null; hidden: number; onOpen: (from: FromSlack) => void }) {
  if (from) {
    return (
      <button type="button" aria-haspopup="dialog" onClick={() => onOpen(from)} className={LINK}>
        {fromSlackText(from)}
      </button>
    );
  }
  return hidden > 0 ? <p className={TYPE.meta}>{hiddenText(hidden)}</p> : null;
}
```

- [ ] **Step 4: The story row and the thread sheet**

`src/components/organizations/detail/StoryItemRow.tsx`, after the meta paragraph:

```tsx
        {item.kind === 'slack' ? <TicketLines tickets={item.tickets ?? []} hidden={item.hidden_links ?? 0} /> : null}
        {item.kind === 'ticket' ? (
          <FromSlackLine
            from={item.from_slack ?? null}
            hidden={item.hidden_links ?? 0}
            onOpen={(from) => onOpenSlack({ ...item, kind: 'slack', id: from.id, title: LINKS.THREAD })}
          />
        ) : null}
```

(import `TicketLines`, `FromSlackLine` from `./LinkLines` and `LINKS` from `linkText`. The sheet's title becomes the thread's own title once it loads: `SlackThread` already prefers `detail.title`.)

`src/components/organizations/detail/SlackThread.tsx`, after the "filed" line and before "Open in Slack":

```tsx
          {(detail.tickets?.length ?? 0) > 0 || (detail.hidden_links ?? 0) > 0 ? (
            <section aria-labelledby={`${id}-issues`} className="mt-3 flex flex-col gap-1">
              <h3 id={`${id}-issues`} className={TYPE.label}>
                {LINKS.ISSUES}
              </h3>
              <TicketLines tickets={detail.tickets ?? []} hidden={detail.hidden_links ?? 0} />
            </section>
          ) : null}
```

(`const id = useId();` at the top of the component; import `useId`, `TicketLines`, `LINKS`.)

- [ ] **Step 5: Run the tests to verify they pass, with the story's own**

Run: `npx vitest run src/components/organizations/detail --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; ratchet at `BASELINE`.

- [ ] **Step 6: Commit**

```bash
git add src/components/organizations/detail/LinkLines.tsx src/components/organizations/detail/LinkLines.test.tsx src/components/organizations/detail/StoryItemRow.tsx src/components/organizations/detail/SlackThread.tsx src/components/organizations/detail/SlackThread.test.tsx
git commit -m "feat(organizations): a slack thread shows its jira tickets and a ticket its thread

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The journeys, docs, the full check, by eye, and the owner's live checks

**Files:**
- Create: `src/e2e/slackEscalation.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: The journeys**

Create `src/e2e/slackEscalation.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { TEAM_MEMBERS } from '../features/knowledge/testHeads';
import { BUNDLES, B_ESCALATION, B_PARTICIPANT } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { SLACK_ITEM_LINKED, SLACK_THREAD_LINKED, TICKET_ITEM_FROM_SLACK, stubSlackConversation } from '../features/organizations/testSlack';
import { STORY_ITEMS, stubOrganizationPage } from '../features/organizations/testStory';
import { renderOrganizationPage } from '../pages/organizations/testDetail';
import { renderWork } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom): the real router, pages and store; only fetch is
// stubbed, in the Slack escalations D4 contract's shapes. Fake people,
// channels and issues; nothing reaches Slack or Jira. No em dash.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

const NOTE = 'Faiz has no account in Jira, so the issue is unassigned. Their to-do is in Work.';
const KAN = { 611: { ticket_key: 'KAN-2', ticket_url: 'https://alfiee.atlassian.net/browse/KAN-2' } };

describe('Slack escalations D4, end to end', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('reviews a decided escalation, changes who has it, edits the reply around its chips and runs it (LC-D4a, LC-D4b)', { timeout: 60000 }, async () => {
    const { spy } = stubBundles({ bundles: [...BUNDLES, B_ESCALATION], members: TEAM_MEMBERS, skipSteps: { 612: NOTE }, outputs: KAN });
    renderWork(`/work?queue=mine&bundle=${B_ESCALATION.id}`);
    const panel = await screen.findByRole('dialog', { name: B_ESCALATION.title });

    // 1. The reply first; the thread decided, and who.
    const first = within(panel).getAllByTestId(/^step-/)[0];
    expect(first).toHaveAttribute('data-step', '614');
    expect(within(first).getByText('Runs last, once the Jira issue exists')).toBeInTheDocument();
    expect(within(panel).getByText('Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();
    expect(within(panel).getByText('Faiz Jamal (Customer Success)')).toBeInTheDocument();

    // 2. Change to Erin: the PATCH carries only the person.
    await userEvent.click(within(panel).getByRole('button', { name: 'Change' }));
    await userEvent.selectOptions(await within(panel).findByRole('combobox', { name: 'Person' }), '13');
    await userEvent.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(await within(panel).findByText('Now handled by Erin Engineer.')).toBeInTheDocument();
    const patch = spy.mock.calls.find(([input, init]) => init?.method === 'PATCH' && String(input).endsWith('/handler/'));
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ user_id: 13 });
    expect(within(panel).getByText('The thread said: Jesh, "@Faiz Jamal can you take this?"')).toBeInTheDocument();

    // 3. The reply: markers in place, words added after them, the placeholders saved.
    const reply = within(panel).getByTestId('step-614');
    const text = within(reply).getByRole('textbox', { name: 'Message' });
    expect(text).toHaveValue('Thanks Tushar. Logged as [Jira key] ([Jira link]) with Erin Engineer (Engineering).');
    await userEvent.type(text, ' On it now.');
    await userEvent.tab();
    await waitFor(() => {
      const saved = spy.mock.calls.filter(([input, init]) => init?.method === 'PATCH' && String(input).endsWith('/steps/614/'));
      expect(JSON.parse(String(saved.at(-1)?.[1]?.body)).fields.text).toBe('Thanks Tushar. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}}) with Erin Engineer (Engineering). On it now.');
    });

    // 4. Run: the issue, the skipped assignment with its note.
    await userEvent.click(within(panel).getByRole('button', { name: /^Run \d selected$/ }));
    expect(await within(within(panel).getByTestId('step-612')).findByText(NOTE)).toBeInTheDocument();
    expect(within(within(panel).getByTestId('step-611')).getByRole('link', { name: /Open KAN-2 in Jira/ })).toBeInTheDocument();
  });

  it('a participant who cannot open the customer runs it from the participant view (LC-D4a)', { timeout: 60000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, B_PARTICIPANT], members: TEAM_MEMBERS, outputs: { 621: KAN[611] } });
    renderWork(`/work?queue=mine&bundle=${B_PARTICIPANT.id}`);
    const panel = await screen.findByRole('dialog', { name: B_PARTICIPANT.title });
    expect(within(panel).getByText('You can run this because you took part in the Slack thread.')).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Globex (QA)' })).toBeNull();
    await userEvent.click(within(panel).getByRole('button', { name: /^Run \d selected$/ }));
    expect(await within(within(panel).getByTestId('step-624')).findByText(/Applied/)).toBeInTheDocument();
  });

  it('shows the thread and its ticket on each other, and opens the thread from the ticket (LC-D4b)', { timeout: 60000 }, async () => {
    stubOrganizationPage({ items: [SLACK_ITEM_LINKED, TICKET_ITEM_FROM_SLACK, ...STORY_ITEMS] });
    stubSlackConversation({ detail: SLACK_THREAD_LINKED });
    renderOrganizationPage('/organizations/7');
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });

    await userEvent.click(await screen.findByRole('button', { name: /^Conversations/ }));
    const thread = (await screen.findByRole('button', { name: SLACK_ITEM_LINKED.title })).closest('[data-story-item]') as HTMLElement;
    expect(within(thread).getByRole('link', { name: /KAN-2 · In progress · Faiz Jamal/ })).toHaveAttribute('href', 'https://alfiee.atlassian.net/browse/KAN-2');

    await userEvent.click(screen.getByRole('button', { name: /^Tickets/ }));
    const from = await screen.findByRole('button', { name: 'From Slack: Mohd faiz in #all-alfiee' });
    await userEvent.click(from);
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText('Jira issues')).toBeInTheDocument();
    expect(within(sheet).getByText('Looking now.')).toBeInTheDocument();
  });
});
```

(`B_PARTICIPANT`'s steps are 621 to 624, its Jira step 621. `Looking now.` is a reply in the D1 fixture thread `SLACK_THREAD`; if its text differs, assert that fixture's reply.)

Run: `npx vitest run src/e2e/slackEscalation.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 2: The docs**

- `docs/03-ui-ux-design.md`: the escalation bundle (Decisions 1 to 5 and 7: the reply first with "Runs last", Handled by with where it came from and Change, the reply's chips, the skipped note, "Posts as you", the participant view); the link lines on Conversations, Tickets and the thread sheet (Decision 6).
- `docs/04-app-flow.md`: colleagues decide in a Slack thread; the bundle it makes; who may run it (the thread's people and the customer's owner); changing who has it; who posts the reply (the person who runs it when their Slack is linked, else the app); following a ticket to its thread and back.
- `.agents/workflows/repo-architecture.md`: `features/agents/escalationText.ts`, `features/organizations/linkText.ts`, `components/work/EscalationHandler.tsx`, `components/work/ReplyText.tsx`, `components/organizations/detail/LinkLines.tsx`.

- [ ] **Step 3: The full check**

```bash
npx vitest run --maxWorkers=2
npx tsc -b
npm run lint
npm run build
npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2
grep -rn "—" src/features/agents/escalationText.ts src/features/organizations/linkText.ts src/components/work/EscalationHandler.tsx src/components/work/ReplyText.tsx src/components/organizations/detail/LinkLines.tsx src/e2e/slackEscalation.test.tsx || echo "no em dash"
```

Expected: every test passes (write the count into the hand-off), `tsc` clean, lint clean (no new warning in the new files), build OK, ratchet totals equal to `BASELINE`, "no em dash".

- [ ] **Step 4: By eye, on a database copy, in the Alfiee workspace**

Nothing real is sent and no model is called.

1. **Copy the dev database, read only:** `createdb revenact_slackd4 && pg_dump --no-owner revenact | psql -q revenact_slackd4` (`pg_dump` only reads `revenact`). Migrate the copy only, from the backend worktree `revenact-backend-slackd4` at its head (backend D4 built): `DATABASE_URL=postgres:///revenact_slackd4 venv/bin/python manage.py migrate`.
2. **Make it safe**, in a `manage.py shell` against the copy: blank every `MailboxConnection` credential, replace every `Connector` credential with a fake one, delete every `JiraLink` and `SlackLink`; run the backend with `HTTPS_PROXY=http://127.0.0.1:9` and no usable AI provider. Never run `sync_tickets` or `run_agent_signals` against the copy.
3. **Seed in the copy** (Alfiee workspace, org 4: `tushar@alfee.io` admin, Faiz `faiz@alfee.io`, Jesh `jesh@alfee.io`): a QA password on the three users (copy only); Jesh Engineering, Faiz Customer Success; Engineering head Jesh; Jira connection 6's `config["project"] = "KAN"`, department blank. Take Globex (QA)'s Slack conversation (the D1 migration's SL-15357099, or make one with `services.customers.tests.slack_fixtures.conversation`) and set, in the shell, its `messages` to Tushar's top message and Jesh's reply "<@U0FAIZ> can you take this?", and its `people` to `{U0TUSHAR: Tushar, U0JESH: Jesh, U0FAIZ: Faiz}` with their member ids. Make the bundle without a model: touch its thread 20 minutes ago and call `services.agents.intake.process(...)` with `services.agents.intake.get_completion` patched to answer `{"title": "Globex (QA): CSV exports fail", "reason": "Exports fail.", "function": "engineering", "decision": {"message": 2, "quote": "<@U0FAIZ> can you take this?", "assignee": "<@U0FAIZ>"}, "actions": [<one jira.create citing the thread's first line>]}`. Make a second bundle the same way on a thread whose reply is only "cc <@U0FAIZ>" (the fallback). File one Ticket `KAN-2` on Globex (QA) through connection 6 with `conversation` set, `status` "in-progress", `assignee_name` "Faiz Jamal", and a second linked ticket with `department="sales"`.
4. **Servers:** backend on :8020 (`revenact-backend-slackd4`, `DATABASE_URL` the copy, `HTTPS_PROXY` as above), Vite on :5190 (`VITE_API_URL=http://localhost:8020`).
5. **Check in Chrome** (playwright-cli), 1440x900 and 390x844, light and dark:
   - as **Jesh** (a participant who can't open Globex unless he is on its account team: take him off it in the copy): Work › Mine lists the bundle; the panel shows "You can run this because you took part in the Slack thread.", no reason, "Globex (QA)" as plain text, "Reply in Slack" first with "Runs last, once the Jira issue exists", `Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"` and "Faiz Jamal (Customer Success)"; Change lists every active member as "Name · Department", "Whoever handles a department" shows the Department select, Cancel puts focus back on Change; the reply's field shows `[Jira key]` and `[Jira link]` with two chips; "Posts as alfiee" (no Slack link in the copy). Run: the Jira step fails (no network: "Needs step 1, which didn't run." on the reply), the panel stays usable;
   - as **Tushar** (admin): the same bundle in full (reason, record link), `participant_view` off; the second bundle reads "No one was named in the thread, so it goes to Jesh Sanghvi (Engineering head)";
   - Globex (QA) › Conversations: the thread shows "KAN-2 · In progress · Faiz Jamal" (a link) and, as Faiz, "Linked to 1 item you can't see"; Tickets: KAN-2 shows "From Slack: ... in #all-alfiee", which opens the thread sheet with "Jira issues";
   - phone width: the handler block and its form stack, the chips wrap, the link lines are 44px tall, no horizontal scroll.
6. Write findings to the scratchpad (`slackd4-fe-byeye/findings.md`) with screenshots; fix should-fix items test first; stop the servers; leave `revenact_slackd4` for the owner to drop.

- [ ] **Step 5: Commit and push**

```bash
git add src/e2e/slackEscalation.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): the slack escalation journeys, decided in the thread; docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/slack-escalations-d4
```

Hand-off (to the controller, not a PR): the head, the vitest count, the by-eye findings, and anything the backend's "Changes during the build" changed.

- [ ] **Step 6: The owner's live checks in Alfiee (after both PRs merge; the owner runs them)**

Set-up (dev DB org 4): Jira connection **6** (alfiee.atlassian.net) default project **KAN**, its department blank (whole company); Slack connection **7** (`#all-alfiee`, C0CA7PPRP7A) with the agents allowed to act; Jesh Engineering, Faiz Customer Success; Engineering head **Jesh**; **Globex (QA)** › Details › Account team: Engineering Jesh (the fallback); **Tushar, Jesh and Faiz each link their Slack** (Settings › Connections › Your accounts), so their messages and mentions resolve to them and the reply posts as whoever runs it; Faiz invited to alfiee.atlassian.net with his login email (or expect step 2 skipped with its note); the fast lane on with Slack connection 7 (spec §12) so the bundle comes within minutes.

- **LC-D4a** Tushar posts "Globex's CSV exports are failing since this morning" in `#all-alfiee`; Jesh replies in the thread "@Faiz can you take this?" (a real Slack mention). Tushar's and Jesh's Work › Mine both show one bundle: "Reply in Slack" first ("Runs last, once the Jira issue exists"), then Create a Jira issue (KAN), Assign it to Faiz Jamal, A to-do for Faiz Jamal; `Assigned by the thread: Jesh, "@Faiz Jamal can you take this?"`; "Faiz Jamal (Customer Success)"; the reply reads "Thanks Tushar. Logged as [Jira key] ([Jira link]) with Faiz Jamal (Customer Success)." with two chips; "Posts as you (Tushar ...)" for Tushar.
- **LC-D4b** Tushar presses Run. KAN-n exists with "From Slack: <thread link>" at the end of its description and a "Slack: #all-alfiee thread" link in Jira's Web links, **assigned to Faiz** (or step 2 reads "Faiz has no account in Jira, so the issue is unassigned. Their to-do is in Work."); **Faiz has the to-do** in his Work; Globex (QA) › Tickets shows KAN-n at once with "From Slack: Tushar Aggarwal in #all-alfiee", which opens the thread; Conversations shows "KAN-n · Open · Faiz Jamal" under the thread; the thread has the reply with the real key and link, **posted as Tushar**, once (Retry on the step finds it, never posts twice); the next sync does **not** make a new bundle for that thread.
- **LC-D4c** A new thread where Jesh only writes "cc @Faiz": the bundle says "No one was named in the thread, so it goes to Jesh Sanghvi (on Globex (QA)'s account team)".
- **LC-D4d** "Thanks, all good now" in a thread makes no bundle.
- **Rule 5** (optional, needs a Slack Connect channel): in a shared channel the reply carries no key or link, and Send to Revenact's reply with the issue is refused with "This conversation is shared outside your company, so the reply can't carry the Jira link. Take it out, then send."

---

## Self-review

1. **Contract coverage.** §2.1 `note` (Task 2), `as_you` (Task 4); §2.2 `escalation` with `decision`, `participant_view`, `record.can_open`, the Work row's (Tasks 1, 3, 5); §2.3 to §2.5 link keys (Tasks 1, 6); §3 the template (the fixture reply is the contract's first row, with the person's own department); §4 the Change route and its refusals (Tasks 1, 3: `user_id` or `user_id: null` with `function`, field refusals under their selects, the rest above the buttons, 404 loses the bundle); SE4-6 chips, editable, never typed (Tasks 1, 4); SE4-10/11 skipped note (Task 2); SE4-15 posts as you (Task 4); SE4-17 twice-filter: the screens show only what arrives, counts as counts (Task 6); SE4-19 needs no screen change; SE4-22 to SE4-24 the decision's words, the unresolved and fallback lines (Tasks 1, 3); SE4-25/26 participants and their view (Task 5); §9 live checks: Task 7 Step 6. Spec §5.5 reply first with "Runs last" (Task 2), the quote with its author and Change (Task 3), §5.6 the participant view (Task 5), §5.8 chips that can't be typed (Task 4), §6 both tabs and the twice-filter line (Task 6), §8 "Choose who handles this" and "The thread named ..., but no member matches." (Task 3).
2. **Placeholders.** Each code step holds its code. Notes name an exact alternative only where the codebase may differ (an existing stub name, the `Select` generic, the D1 fixture's reply text).
3. **Type consistency.** `Escalation`, `HandlerBody`, `LinkedTicket`, `FromSlack` (Task 1) are what Tasks 3, 5 and 6 render and `stubBundles` / `testSlack` answer; `HandlerRefusal` (Task 1) is what `EscalationHandler.onChange` returns and `BundlePanel.changeHandler` produces; `B_ESCALATION`'s ids (601; 611 to 614), `B_PARTICIPANT`'s (602; 621 to 624) and `TEAM_MEMBERS`' ids (Faiz 11, Jesh 12, Erin 13, Sam 15) are the same in every test; `ESCALATION_REPLY` is the stored text `ReplyText`'s `stored` reads.
