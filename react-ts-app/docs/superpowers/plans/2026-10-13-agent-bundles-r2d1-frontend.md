# Agent bundles, round 2 delivery 1 ("Finish the four tools"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bundle panel edits and runs a `jira.comment` step (the comment, "Comments in Jira as Jira Bot", "Only your team sees this comment in Jira."), shows one Jira error with one **Try again** per step when Jira is down (C1), and History links to the comment; Settings › Connections tells an admin to reconnect a broken tool instead of offering "Allow agents to act"; a person with an Outlook mailbox writes their signature on the mailbox card; a Gmail signature shows read only in the mail editor ("Your Gmail signature goes out as it is in Gmail.").

**Architecture:** No new route. `jira.comment` joins `OUTSIDE_KINDS`, so `BundleStepFields` already hands it to `BundleOutsideFields`, which gains a comment editor. The Jira step's four pick lists move to one place: `BundleOutsideFields` calls `usePickList` for all four (the assignee search keeps its debounce in `PickSearch`, which becomes controlled) and draws one error line for the step; `PickSelect` gains `quiet`. The mailbox card gains `MailboxSignature` (a textarea and Save for Outlook, a read-only line for Gmail) backed by one new thunk, `saveSignature`. `MailEditor` marks the signature block non-editable. Words and pure rules stay in `features/agents/bundleText.ts`, `agentsText.ts`, `features/connectors/agentAccess.ts` and a new `features/mail/signature.ts`, unit-tested.

**Tech Stack:** React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), react-router 7, Redux Toolkit (connectors and mail slices), Tailwind v4 tokens, Vitest + Testing Library (jsdom) + user-event, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` §13 (round 2 addendum: §13.3 items A, F, G; §13.4; the R2-D1 row of §13.5). **API contract (binding, read-only):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/round2-be/docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-api.md` (backend branch `feat/agent-bundles-r2d1`). Read its "Decisions narrowing the spec" first (R2D1-1 to R2D1-20); §2 (the kind), §4 (shapes and routes) and §5 (sentences) are the stubs' and types' source of truth. The D3 frontend plan and its merged code (#143) hold the house style this plan extends.

## Global Constraints

- **Worktree and branch.** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/round2-fe`, branch `feat/agent-bundles-r2d1` (on main `2332bfd5`: D1 #141, D2 #142, D3 #143 merged). Link `node_modules` once: `ln -s ../main-fe/node_modules node_modules` (never commit it). Always `git add <explicit paths>` (and `git rm` for deletions), never `git add -A` or `git add .`. Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner uses them; the by-eye run in Task 9 uses 8014 and 5184).
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees).
- **Commands** (foreground): `npx vitest run <path> --maxWorkers=2`, `npx vitest run --maxWorkers=2`, `npx tsc -b`, `npm run lint`, `npm run build`. CI is blocked by GitHub billing: these local checks are the gate. Every task ends with `npx tsc -b` clean as well as its tests.
- **Every commit message is a conventional commit and ends with exactly this line:** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Contract shapes are binding.** Stubs answer exactly the contract's shapes and sentences; refusals are shown verbatim.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, `rgb()`, named palette colours.
- **Type sizes 11/13/15 only**, through `TYPE.*`, `FIELD_ERROR`, `FORM_ALERT`; no `font-bold`, no `shadow-sm`/`shadow-md`, no `disabled:opacity-*`. **The UI ratchet** (`src/test/uiRatchet.test.ts`) ends each task with totals **equal** to `BASELINE`: new code adds zero offences (never raise a baseline).
- **Kinso look and the UI cleanup rules:** bordered quiet cards, flat `divide-y` rows, monochrome primary (`PRIMARY`), **one primary per surface** (the panel's **Run N selected** stays its only primary; the signature's **Save** is bordered, `BUTTON`; "Try again" is bordered). Lucide icons only, each `aria-hidden="true"`; no emoji.
- **44px targets** on phones for every `<button>`, `<a>`, `<select>`, `<input>`, `<textarea>`: `BUTTON`, `PRIMARY`, `QUIET`, `INPUT`, `SELECT`, `META_LINK`, or a local `const` built from one.
- **No em dash (`—`) anywhere** in `src/components/work/`, `src/pages/work/`, `src/features/work/`, `src/features/agents/bundle*`, `src/features/agents/testBundle*`, `src/components/integrations/AgentAccess*`, `src/components/integrations/MailboxSignature*`, `src/features/connectors/agentAccess*`, `src/features/mail/signature*`; comments and tests included. No em dash in any new copy anywhere.
- **Copy:** sentence case, plain words; the contract's and this plan's sentences word for word; server refusals and step errors shown verbatim.
- **States:** the comment editor has the D3 field error states; the signature has a saving word ("Saving…"), a saved line ("Signature saved.") and an inline error (`role="alert"`).
- **Motion:** none added.
- **Privacy:** the page shows only what the server sends: `preview.jira_comment`, `connection.signature`. A Gmail signature is never editable here.
- **Testing:** unit + integration + e2e (jsdom, `src/e2e/`), only `fetch` stubbed with contract-shaped stubs and fake data. Never mock the store. Nothing real is sent; no test reaches Slack, Jira, Google or Microsoft.

## Decisions (frontend, where the spec and the contract leave a choice)

1. **The comment editor** has one field, "Comment" (a textarea), drawn only when `body` is in `step.editable` (a body holding a placeholder is read only, D1 D12). Above it: "Comments in Jira as Jira Bot" (`preview.jira_comment.as`) and "Only your team sees this comment in Jira." (`internal`). The issue shows as text ("On SUP-12") or, for a placeholder issue, as the chip D1 already draws ("Jira ticket from step 1"). Cost: trivial.
2. **One Jira error per step (C1).** A `jira.create` step's four lists are read in one component; when any of them fails, the step shows the first failure's sentence once, above its fields, with one **Try again** that retries every failed list. Each list's own error and button stay hidden (`PickSelect quiet`), while its loading and empty lines stay. The Slack channel list is a single list and keeps its own error. Cost: low.
3. **`needs: "reconnect"`** in Settings › Connections: the hint "Reconnect Slack before agents can act." / "Reconnect Jira before agents can act." and no Allow button. An older backend never sends it. Cost: trivial.
4. **The Outlook signature** is a row on the mailbox card under the facts: label "Signature", a textarea (4 rows), the hint "Added under every email you send from Revenact. Up to 10 lines.", **Save** (bordered) enabled only when the text changed. On success "Signature saved." (`role="status"`); a refusal shows the server's sentence (`role="alert"`). Clearing the text and saving removes it. Cost: low.
5. **A Gmail signature** shows read only on the mailbox card ("Signature" fact: its text, or "None in Gmail") with "Change it in Gmail." An IMAP mailbox (`signature: null`) shows no row. Cost: trivial.
6. **The mail editor** marks the signature block `contenteditable="false"` when it seeds the editor, so typing never lands inside it (the server puts Gmail's signature back whole on save, R2D1-16), and shows "Your Gmail signature goes out as it is in Gmail." under the editor while the block is there. Deleting the whole block still works (the browser removes a non-editable block as one piece). Cost: low.
7. **History** needs no new code: its outside links are the server's `links` (the comment's "Open the comment on SUP-12 in Jira"); the kind filter reads `ACTION_KINDS`, which gains `jira.comment`. Cost: none.

## File Structure

**Create**
- `src/features/mail/signature.ts` (+ `signature.test.ts`): the signature words and the refusal reader.
- `src/components/integrations/MailboxSignature.tsx` (+ `MailboxSignature.test.tsx`): Decisions 4, 5.
- `src/e2e/bundleRound2.test.tsx`: the R2-D1 journeys.

**Modify**
- `src/features/agents/agentTypes.ts`, `agentsText.ts` (+ test), `bundleText.ts` (+ test), `testBundleFixtures.ts`, `testBundles.ts`.
- `src/features/connectors/connectorsSlice.ts`, `agentAccess.ts` (+ test); `src/components/integrations/AgentAccess.tsx` (+ test).
- `src/features/mail/mailSlice.ts` (+ test), `testMail.ts`; `src/components/integrations/MailboxSection.tsx` (+ test).
- `src/components/work/BundleOutsideFields.tsx` (+ test), `PickSelect.tsx` (+ test), `PickSearch.tsx`.
- `src/pages/communications/MailEditor.tsx` (+ test).
- Docs (Task 9): `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`.

---

### Task 1: Contract types and the mail thunk

**Files:**
- Modify: `src/features/agents/agentTypes.ts`, `src/features/agents/agentsText.ts` (`KIND_LABEL` only), `src/features/connectors/connectorsSlice.ts`, `src/features/mail/mailSlice.ts`, `src/features/mail/mailSlice.test.ts`

**Interfaces:**
- Produces (`agentTypes.ts`): `ActionKind` gains `'jira.comment'`, inserted after `'jira.assign'` in the union, `ACTION_KINDS` and `OUTSIDE_KINDS`; `JiraCommentPreview { site: string; issue: string; excerpt: string; as: string; internal: boolean }`; `ActionPreview.jira_comment?: JiraCommentPreview`. `KIND_LABEL['jira.comment'] = 'Comment on a Jira issue'`.
- Produces (`connectorsSlice.ts`): `ConnectorAgents.needs: 'reconnect' | 'consent' | 'token' | 'permission' | null`.
- Produces (`mailSlice.ts`): `MailSignature { text: string; editable: boolean; source: 'gmail' | 'revenact' }`; `MailboxConnection.signature?: MailSignature | null` (absent from an older backend); thunk `saveSignature(text: string) -> MailboxConnection` (`PATCH /mail/connection/ {signature}`, answer `{connection}`), `rejectValue` the server's sentence; the reducer stores the answered connection.

- [ ] **Step 1: Write the failing test**

Append to `src/features/mail/mailSlice.test.ts` (it builds a store with the real reducer and stubs `fetch`; follow its existing `answer(...)` / store helpers, adding them if the file has none):

```ts
describe('saveSignature (round 2 D1 contract §4.3)', () => {
  it('patches the signature and keeps the answered connection', async () => {
    const connection = { ...OUTLOOK, signature: { text: 'Carl CSM\nAcme', editable: true, source: 'revenact' as const } };
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ connection }) }));
    vi.stubGlobal('fetch', spy);
    const store = configureStore({ reducer: { mail: mailReducer } });
    const result = await store.dispatch(saveSignature('Carl CSM\nAcme'));
    expect(saveSignature.fulfilled.match(result)).toBe(true);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/v1/mail/connection/');
    expect(JSON.parse(String(init.body))).toEqual({ signature: 'Carl CSM\nAcme' });
    expect(init.method).toBe('PATCH');
    expect(store.getState().mail.connection?.signature?.text).toBe('Carl CSM\nAcme');
  });

  it('hands back the server sentence on a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ signature: ['Keep the signature to 10 lines.'] }) })));
    const store = configureStore({ reducer: { mail: mailReducer } });
    const result = await store.dispatch(saveSignature('x'));
    expect(result.payload).toBe('Keep the signature to 10 lines.');
  });
});
```

(Import `saveSignature` with the other thunks and `OUTLOOK` from `./testMail`.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/features/mail/mailSlice.test.ts --maxWorkers=2`
Expected: FAIL: `saveSignature` is not exported.

- [ ] **Step 3: The types**

`src/features/agents/agentTypes.ts`: add `| 'jira.comment'` after `| 'jira.assign'`; `'jira.comment',` after `'jira.assign',` in `ACTION_KINDS`; `OUTSIDE_KINDS` becomes `['mail.send_reply', 'slack.reply', 'jira.create', 'jira.assign', 'jira.comment']`; after `JiraAssignPreview`:

```ts
/** Round 2 D1 contract §2: an internal comment on a Jira issue. */
export interface JiraCommentPreview {
  site: string;
  /** A key ("SUP-12"), or a placeholder the step's `placeholders` names. */
  issue: string;
  excerpt: string;
  as: string;
  internal: boolean;
}
```

and `jira_comment?: JiraCommentPreview;` in `ActionPreview` after `jira_assign?`. `agentsText.ts` `KIND_LABEL`: `'jira.comment': 'Comment on a Jira issue',` after `'jira.assign'`. `connectorsSlice.ts`: `needs: 'reconnect' | 'consent' | 'token' | 'permission' | null;`.

`src/features/mail/mailSlice.ts`, after `MailboxConnection`'s `paused_reason`:

```ts
  /** Round 2 D1 contract §4.3: Gmail's (read only), an Outlook one its owner
   *  writes, null for IMAP; absent from an older backend. */
  signature?: MailSignature | null;
```

with, above the interface:

```ts
export interface MailSignature {
  text: string;
  editable: boolean;
  source: 'gmail' | 'revenact';
}
```

After `syncMailbox`:

```ts
/** The server's own sentence: a 409's `detail`, a 400's first `signature` message. */
function refusal(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.body === 'object' && err.body !== null) {
    const body = err.body as { detail?: unknown; signature?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.signature) && typeof body.signature[0] === 'string') return body.signature[0];
  }
  return fallback;
}

/** An Outlook mailbox's signature, written by its owner (round 2 D1 contract §4.3). */
export const saveSignature = createAsyncThunk<MailboxConnection, string, { rejectValue: string }>(
  'mail/saveSignature',
  async (text, { rejectWithValue }) => {
    try {
      const answer = (await apiFetch('/mail/connection/', { method: 'PATCH', body: { signature: text } })) as { connection: MailboxConnection };
      return answer.connection;
    } catch (err) {
      return rejectWithValue(refusal(err, 'Could not save the signature.'));
    }
  },
);
```

and in the reducer's `extraReducers`: `.addCase(saveSignature.fulfilled, (state, action) => { state.connection = action.payload; })`.

- [ ] **Step 4: Run it to see it pass; type-check**

Run: `npx vitest run src/features/mail/mailSlice.test.ts --maxWorkers=2 && npx tsc -b`
Expected: PASS; `tsc` may list every `Record<ActionKind, ...>` that now lacks `'jira.comment'`: add the entry in each (the label above, or the map's neutral value) and re-run until clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/agentTypes.ts src/features/agents/agentsText.ts src/features/connectors/connectorsSlice.ts src/features/mail/mailSlice.ts src/features/mail/mailSlice.test.ts
git commit -m "feat(agents): contract types for jira.comment, needs reconnect and the mailbox signature

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Stubs and fixtures: a comment bundle, comment links, the signature route

**Files:**
- Modify: `src/features/agents/testBundleFixtures.ts`, `src/features/agents/testBundles.ts`, `src/features/mail/testMail.ts`
- Test: `src/features/agents/testBundles.test.ts` (append)

**Interfaces:**
- Produces: `B_COMMENT: Bundle` (id 405, a Jira thread on Pizza Hut, steps 451 `jira.comment` on `SUP-12`, editable `['body']`); the bundle stub's run of a `jira.comment` gives `outputs` `{ ticket_key, ticket_url, comment_url }` and the link "Open the comment on SUP-12 in Jira"; `stubMail` answers `PATCH /mail/connection/` with the contract's refusals (400 over 1000 characters or 10 lines; 409 `SIGNATURE_IN_GMAIL` on Google; 409 `NO_SIGNATURE` on IMAP) and `{connection}`; `GOOGLE.signature = { text: 'Dana Ruiz\nDough Co', editable: false, source: 'gmail' }`, `OUTLOOK.signature = { text: '', editable: true, source: 'revenact' }`.

- [ ] **Step 1: Write the failing test**

Append to `src/features/agents/testBundles.test.ts`:

```ts
  it('runs a Jira comment and links to it (round 2 D1 contract §2, R2D1-6)', async () => {
    stubBundles({ bundles: [B_COMMENT] });
    const res = await fetch('http://x/api/v1/agents/bundles/405/run/', { method: 'POST', body: JSON.stringify({ steps: [{ id: 451, selected: true }] }) });
    const body = (await res.json()) as { bundle: Bundle };
    const [s] = body.bundle.steps;
    expect(s.outputs).toEqual({ ticket_key: 'SUP-12', ticket_url: 'https://acme.atlassian.net/browse/SUP-12', comment_url: 'https://acme.atlassian.net/browse/SUP-12?focusedCommentId=10031' });
    expect(s.links).toEqual([{ label: 'Open the comment on SUP-12 in Jira', url: 'https://acme.atlassian.net/browse/SUP-12?focusedCommentId=10031', external: true }]);
  });
```

(Import `B_COMMENT` with the other fixtures and `Bundle` with the types; follow how the file's other run tests call the stub.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/features/agents/testBundles.test.ts --maxWorkers=2`
Expected: FAIL: `B_COMMENT` is not exported.

- [ ] **Step 3: The fixture**

`src/features/agents/testBundleFixtures.ts`, after `OUTSIDE_BUNDLES`:

```ts
/** Round 2 D1: a Jira thread on Pizza Hut and an internal comment on its issue. */
const JIRA_SOURCE: BundleSource = { kind: 'thread', label: 'Jira', channel: 'jira', from: 'ann@pizzahut.com', messages: 1, last_message_at: '2026-10-07T09:58:00Z', ticket: 'SUP-12', link: 'https://acme.atlassian.net/browse/SUP-12' };

export const B_COMMENT: Bundle = bundle({
  id: 405,
  title: 'Pizza Hut: export fails on large files',
  reason: 'Ann says it fails on Chrome too.',
  source: JIRA_SOURCE,
  can_reject: true,
  steps: [
    step({
      id: 451,
      position: 1,
      kind: 'jira.comment',
      label: 'Comment on a Jira issue',
      title: 'Tell engineering it fails on Chrome too',
      outside: true,
      irreversible: true,
      fields: { body: 'Customer confirms it fails on Chrome too.' },
      editable: ['body'],
      preview: { jira_comment: { site: 'acme.atlassian.net', issue: 'SUP-12', excerpt: 'Customer confirms it fails on Chrome too.', as: 'Jira Bot', internal: true } },
    }),
  ],
});
```

(If `BundleSource.channel` has no `'jira'` member, use the value the D2 Jira thread fixtures use: `grep -n "channel:" src/features/agents/bundleTypes.ts`.)

- [ ] **Step 4: The bundle stub**

`src/features/agents/testBundles.ts`: in `OUTPUTS` add `'jira.comment': () => ({ ticket_key: 'SUP-12', ticket_url: 'https://acme.atlassian.net/browse/SUP-12', comment_url: 'https://acme.atlassian.net/browse/SUP-12?focusedCommentId=10031' }),`; in `linksFor`, before the ticket link:

```ts
  if (typeof s.outputs.comment_url === 'string') {
    out.push({ label: `Open the comment on ${String(s.outputs.ticket_key)} in Jira`, url: s.outputs.comment_url, external: true });
    return out;
  }
```

- [ ] **Step 5: The mail stub**

`src/features/mail/testMail.ts`: `GOOGLE` gains `signature: { text: 'Dana Ruiz\nDough Co', editable: false, source: 'gmail' },`, `OUTLOOK` gains `signature: { text: '', editable: true, source: 'revenact' },`. In `stubMail`'s handler, after the `DELETE` branch:

```ts
    if (path === '/mail/connection/' && method === 'PATCH') {
      if (!state.connection) return json(404, { detail: 'Connect your mailbox first.' });
      const value = (JSON.parse(String(init?.body ?? '{}')) as { signature?: unknown }).signature;
      if (typeof value !== 'string') return json(400, { signature: ['Write a signature, or leave it empty.'] });
      const lines = value.replace(/\r\n/g, '\n').trim().split('\n').map((line) => line.trimEnd());
      const text = lines.join('\n');
      if (text.length > 1000) return json(400, { signature: ['Keep the signature under 1000 characters.'] });
      if (lines.length > 10) return json(400, { signature: ['Keep the signature to 10 lines.'] });
      if (state.connection.provider === 'google') return json(409, { code: 'SIGNATURE_IN_GMAIL', detail: 'Change your signature in Gmail. Revenact uses it from there.' });
      if (state.connection.provider !== 'microsoft') return json(409, { code: 'NO_SIGNATURE', detail: 'Signatures are for Outlook mailboxes here.' });
      state.connection = { ...state.connection, signature: { text, editable: true, source: 'revenact' } };
      return json(200, { connection: state.connection });
    }
```

- [ ] **Step 6: Run them to see them pass**

Run: `npx vitest run src/features/agents src/features/mail --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/agents/testBundleFixtures.ts src/features/agents/testBundles.ts src/features/agents/testBundles.test.ts src/features/mail/testMail.ts
git commit -m "test(agents): stubs for a Jira comment bundle and the mailbox signature

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The words

**Files:**
- Modify: `src/features/agents/agentsText.ts` (`previewText`) (+ `agentsText.test.ts`), `src/features/agents/bundleText.ts` (+ `bundleText.test.ts`), `src/features/connectors/agentAccess.ts` (+ `agentAccess.test.ts`)
- Create: `src/features/mail/signature.ts` (+ `signature.test.ts`)

**Interfaces:**
- Produces: `previewText` for `jira.comment` ("Comment on SUP-12 in Jira", or "Comment in Jira on the issue from step 1" for a placeholder); `OUTSIDE.COMMENT = 'Comment'`, `OUTSIDE.INTERNAL = 'Only your team sees this comment in Jira.'`, `OUTSIDE.JIRA_DOWN_RETRY` is not new (the button keeps `OUTSIDE.TRY_AGAIN`); `commentsAsText(who)`, `onIssueText(issue)`; `accessHint` for `'reconnect'`; `SIGNATURE` words (`LABEL`, `HINT`, `SAVE`, `SAVING`, `SAVED`, `GMAIL_HINT`, `GMAIL_NONE`, `EDITOR_HINT`).

- [ ] **Step 1: Write the failing tests**

`src/features/agents/agentsText.test.ts`, in its `previewText` describe:

```ts
  it('reads a Jira comment', () => {
    const comment = { ...anAction('jira.comment'), preview: { jira_comment: { site: 'acme.atlassian.net', issue: 'SUP-12', excerpt: 'Seen again.', as: 'Jira Bot', internal: true } } };
    expect(previewText(comment)).toBe('Comment on SUP-12 in Jira');
    const later = { ...comment, preview: { jira_comment: { ...comment.preview.jira_comment, issue: '{{step 1.ticket_key}}' } } };
    expect(previewText(later)).toBe('Comment in Jira on the issue from step 1');
  });
```

(`anAction(kind)` stands for the file's existing action builder; use its real name: `grep -n "function\|const .* = (" src/features/agents/agentsText.test.ts | head`.)

`src/features/agents/bundleText.test.ts`:

```ts
  it('names who comments in Jira and on what', () => {
    expect(commentsAsText('Jira Bot')).toBe('Comments in Jira as Jira Bot');
    expect(onIssueText('SUP-12')).toBe('On SUP-12');
    expect(OUTSIDE.INTERNAL).toBe('Only your team sees this comment in Jira.');
  });
```

`src/features/connectors/agentAccess.test.ts`:

```ts
  it('asks for a reconnect first (round 2 D1 contract R2D1-10)', () => {
    expect(accessHint(agents({ needs: 'reconnect' }))).toBe('Reconnect Slack before agents can act.');
    expect(accessHint({ ...agents({}), provider: 'jira', provider_display: 'Jira Software', agents: { kinds: ['jira.create', 'jira.assign', 'jira.comment'], can_act: false, needs: 'reconnect', allowed_by: null, allowed_at: null } })).toBe('Reconnect Jira before agents can act.');
  });
```

Create `src/features/mail/signature.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SIGNATURE, gmailSignatureText } from './signature';

describe('signature words (round 2 D1 Decisions 4 to 6)', () => {
  it('says what the signature does and where Gmail\'s comes from', () => {
    expect(SIGNATURE.HINT).toBe('Added under every email you send from Revenact. Up to 10 lines.');
    expect(SIGNATURE.GMAIL_HINT).toBe('Change it in Gmail.');
    expect(SIGNATURE.EDITOR_HINT).toBe('Your Gmail signature goes out as it is in Gmail.');
    expect(gmailSignatureText('')).toBe('None in Gmail');
    expect(gmailSignatureText('Dana Ruiz\nDough Co')).toBe('Dana Ruiz\nDough Co');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/features/agents/agentsText.test.ts src/features/agents/bundleText.test.ts src/features/connectors/agentAccess.test.ts src/features/mail/signature.test.ts --maxWorkers=2`
Expected: FAIL on every new expectation.

- [ ] **Step 3: The words**

`agentsText.ts`, `previewText`, after the `jira.assign` line:

```ts
  if (action.kind === 'jira.comment' && p.jira_comment) {
    const later = /^\{\{\s*step\s+(\d+)\./.exec(p.jira_comment.issue);
    return later ? `Comment in Jira on the issue from step ${later[1]}` : `Comment on ${p.jira_comment.issue} in Jira`;
  }
```

`bundleText.ts`: in `OUTSIDE` add `COMMENT: 'Comment',` and `INTERNAL: 'Only your team sees this comment in Jira.',`; after `assignedAsText`:

```ts
export const commentsAsText = (who: string): string => `Comments in Jira as ${who}`;
export const onIssueText = (issue: string): string => `On ${issue}`;
```

`agentAccess.ts`, `accessHint`, first line after the `kinds.length === 0` check:

```ts
  if (c.agents.needs === 'reconnect') return `Reconnect ${toolName(c)} before agents can act.`;
```

Create `src/features/mail/signature.ts`:

```ts
// The mailbox signature's words (agent bundles round 2 D1, Decisions 4 to 6;
// contract §4.3). No em dash.

export const SIGNATURE = {
  LABEL: 'Signature',
  HINT: 'Added under every email you send from Revenact. Up to 10 lines.',
  SAVE: 'Save',
  SAVING: 'Saving…',
  SAVED: 'Signature saved.',
  FAILED: 'Could not save the signature.',
  GMAIL_HINT: 'Change it in Gmail.',
  EDITOR_HINT: 'Your Gmail signature goes out as it is in Gmail.',
} as const;

export const gmailSignatureText = (text: string): string => text || 'None in Gmail';
```

- [ ] **Step 4: Run them to see them pass**

Run: the Step 2 command, then `npx tsc -b`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/agents/agentsText.ts src/features/agents/agentsText.test.ts src/features/agents/bundleText.ts src/features/agents/bundleText.test.ts src/features/connectors/agentAccess.ts src/features/connectors/agentAccess.test.ts src/features/mail/signature.ts src/features/mail/signature.test.ts
git commit -m "feat(agents): words for Jira comments, reconnect and signatures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The comment editor

**Files:**
- Modify: `src/components/work/BundleOutsideFields.tsx`
- Test: `src/components/work/BundleOutsideFields.test.tsx` (append)

**Interfaces:**
- Consumes: `B_COMMENT` (Task 2), `OUTSIDE.COMMENT`, `OUTSIDE.INTERNAL`, `commentsAsText`, `onIssueText` (Task 3).

- [ ] **Step 1: Write the failing test**

Append to `src/components/work/BundleOutsideFields.test.tsx` (it renders `BundleOutsideFields` with a bundle, a step, fields and an `onField` spy: follow its existing `renderFields(...)` helper):

```tsx
  it('edits a Jira comment and says where it goes (round 2 D1 Decision 1)', async () => {
    const onField = vi.fn();
    const [s] = B_COMMENT.steps;
    renderFields({ bundle: B_COMMENT, step: s, fields: { ...s.fields }, onField });
    expect(screen.getByText('Comments in Jira as Jira Bot')).toBeInTheDocument();
    expect(screen.getByText('On SUP-12')).toBeInTheDocument();
    expect(screen.getByText('Only your team sees this comment in Jira.')).toBeInTheDocument();
    const box = screen.getByRole('textbox', { name: 'Comment' });
    await userEvent.type(box, '!');
    expect(onField).toHaveBeenLastCalledWith('body', 'Customer confirms it fails on Chrome too.!');
  });

  it('shows the field error the server sent', () => {
    const [s] = B_COMMENT.steps;
    renderFields({ bundle: B_COMMENT, step: s, fields: { body: '' }, errors: { body: 'Write the comment.' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Write the comment.');
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/work/BundleOutsideFields.test.tsx --maxWorkers=2`
Expected: FAIL: the comment step falls into the Jira create editor (no "Comment" field).

- [ ] **Step 3: The editor**

In `BundleOutsideFields.tsx`, import `commentsAsText` and `onIssueText`; before `const jira = step.preview.jira;`:

```tsx
  if (step.kind === 'jira.comment') {
    const comment = step.preview.jira_comment;
    // A placeholder issue shows as the step's chip (D1); a key as text.
    const keyed = comment && !comment.issue.startsWith('{{');
    return (
      <div className="flex flex-col gap-3">
        {comment ? <p className={TYPE.meta}>{commentsAsText(comment.as)}</p> : null}
        {keyed ? <p className={TYPE.meta}>{onIssueText(comment.issue)}</p> : null}
        {comment?.internal ? <p className={TYPE.meta}>{OUTSIDE.INTERNAL}</p> : null}
        {can('body') ? <Text id={id('body')} label={OUTSIDE.COMMENT} area value={String(fields.body ?? '')} error={errors.body} onChange={(v) => onField('body', v)} /> : null}
      </div>
    );
  }
```

The hooks above it (`projects`, `types`, `priorities`, `channels`) are already disabled for any kind but theirs, so no list loads for a comment.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/components/work --maxWorkers=2 && npx tsc -b && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS, ratchet equal.

- [ ] **Step 5: Commit**

```bash
git add src/components/work/BundleOutsideFields.tsx src/components/work/BundleOutsideFields.test.tsx
git commit -m "feat(work): edit a Jira comment step in the bundle panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: One Jira error per step (C1)

**Files:**
- Modify: `src/components/work/PickSelect.tsx` (`quiet`), `src/components/work/PickSearch.tsx` (controlled), `src/components/work/BundleOutsideFields.tsx`
- Test: `src/components/work/PickSelect.test.tsx` (append), `src/components/work/BundleOutsideFields.test.tsx` (append)

**Interfaces:**
- Produces: `PickSelect` prop `quiet?: boolean` (a failed state draws nothing of its own); `PickSearch` props become `{ id, label, list, state, retry, onQuery, value, onChange, none?, error?, hint?, quiet? }` (it keeps the 300 ms debounce and calls `onQuery(trimmed)`; it no longer calls `usePickList`).

- [ ] **Step 1: Write the failing tests**

`src/components/work/PickSelect.test.tsx`:

```tsx
  it('draws no error of its own when quiet', () => {
    render(<PickSelect id="p" label="Project" list="jira_projects" state={{ status: 'failed', message: "Couldn't reach Jira. Try again." }} retry={vi.fn()} value={{ id: 'SUP', name: 'SUP' }} onChange={vi.fn()} quiet />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Project' })).toBeInTheDocument();
  });
```

`src/components/work/BundleOutsideFields.test.tsx`:

```tsx
  it('shows one Jira error and one Try again for the whole step when Jira is down (C1)', async () => {
    const down = { status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } };
    const { spy } = stubBundles({ bundles: [B_OUTSIDE], failOptions: { jira_projects: down, jira_priorities: down, jira_assignees: down } });
    const create = B_OUTSIDE.steps.find((s) => s.kind === 'jira.create')!;
    renderFields({ bundle: B_OUTSIDE, step: create, fields: startFields(create) });
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Jira. Try again.");
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1));
    const before = spy.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    const asked = spy.mock.calls.slice(before).map(([input]) => new URL(String(input)).pathname.split('/').at(-2));
    expect(new Set(asked)).toEqual(new Set(['jira_projects', 'jira_priorities', 'jira_assignees']));
  });
```

(`failOptions` fails each list once, so the retries succeed; `startFields` comes from `bundleText`. If `stubBundles` is not used by this test file yet, import it from `../../features/agents/testBundles`.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/work/PickSelect.test.tsx src/components/work/BundleOutsideFields.test.tsx --maxWorkers=2`
Expected: FAIL: `quiet` is ignored (an alert and a button render); three alerts and three buttons for the step.

- [ ] **Step 3: `PickSelect` learns `quiet`**

In `PickSelect.tsx`, add `quiet = false` to the props (type `quiet?: boolean`) and change the failed block's guard to `{state.status === 'failed' && !quiet ? (`.

- [ ] **Step 4: `PickSearch` becomes controlled**

Replace `PickSearch.tsx`'s body:

```tsx
import { useEffect, useState } from 'react';
import { OUTSIDE } from '../../features/agents/bundleText';
import type { PickListName, PickValue } from '../../features/agents/bundleTypes';
import { INPUT, TYPE } from '../ui';
import { PickSelect } from './PickSelect';
import type { PickState } from './usePickList';

const PAUSE_MS = 300;
const MOST = 100;

/** People in Jira, searched (D3 frontend Decision 3): a search box, then the
 *  list as a select. The list is read by the caller (round 2 C1: one error
 *  per step); this keeps the typing and its pause. */
export function PickSearch({ id, label, list, state, retry, onQuery, value, onChange, none, error, hint, quiet = false }: { id: string; label: string; list: PickListName; state: PickState; retry: () => void; onQuery: (query: string) => void; value: PickValue | null; onChange: (value: PickValue | null) => void; none?: string; error?: string; hint?: string; quiet?: boolean }) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => onQuery(typed.trim()), PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [typed, onQuery]);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      <input type="search" aria-label={OUTSIDE.SEARCH_PEOPLE} placeholder={OUTSIDE.SEARCH_PEOPLE} maxLength={MOST} className={INPUT} value={typed} onChange={(event) => setTyped(event.target.value)} />
      <PickSelect id={id} label={label} list={list} state={state} retry={retry} value={value} onChange={onChange} none={none} error={error} hint={hint} emptyText={OUTSIDE.NOBODY} labelled={false} quiet={quiet} />
    </div>
  );
}
```

- [ ] **Step 5: `BundleOutsideFields` reads the four lists and draws one error**

In `BundleOutsideFields.tsx`: import `BUTTON`, `FORM_ALERT` from `../ui` and `useCallback` from react. After the `channels` hook:

```tsx
  const [peopleQuery, setPeopleQuery] = useState('');
  const onQuery = useCallback((query: string) => setPeopleQuery(query), []);
  const people = usePickList({ bundleId: bundle.id, stepId: step.id, list: 'jira_assignees', project: isCreate ? project : '', query: peopleQuery, enabled: (isCreate || step.kind === 'jira.assign') && can('assignee') });
  // Round 2 C1: Jira is one tool; when it is down the step says so once.
  const jiraLists = [projects, types, priorities, people];
  const failed = jiraLists.filter((l) => l.state.status === 'failed');
  const down = failed.length > 0 && failed[0].state.status === 'failed' ? failed[0].state.message : null;
  const retryJira = () => failed.forEach((l) => l.retry());
```

In the Jira return (after the "Created/Assigned in Jira as" line):

```tsx
      {down ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className={FORM_ALERT}>
            {down}
          </p>
          <button type="button" onClick={retryJira} className={BUTTON}>
            {OUTSIDE.TRY_AGAIN}
          </button>
        </div>
      ) : null}
```

Pass `quiet` to the three `PickSelect`s of the Jira editor and to `PickSearch`, and give `PickSearch` the lifted list: `<PickSearch id={id('assignee')} label={OUTSIDE.ASSIGNEE} list="jira_assignees" state={people.state} retry={people.retry} onQuery={onQuery} value={assignee} onChange={...unchanged...} none={...unchanged...} error={errors.assignee} hint={...unchanged...} quiet />` (the `bundleId`, `stepId`, `project` and `enabled` props go: the hook above has them). The Slack channel `PickSelect` is not quiet.

- [ ] **Step 6: Run them to see them pass**

Run: `npx vitest run src/components/work src/e2e/bundleOutside.test.tsx --maxWorkers=2 && npx tsc -b && npm run lint && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS; the D3 journeys (assignee search, Unassigned) still pass with the lifted list; ratchet equal.

- [ ] **Step 7: Commit**

```bash
git add src/components/work/PickSelect.tsx src/components/work/PickSelect.test.tsx src/components/work/PickSearch.tsx src/components/work/BundleOutsideFields.tsx src/components/work/BundleOutsideFields.test.tsx
git commit -m "fix(work): one Jira error and one Try again per step when Jira is down

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Settings › Connections asks for a reconnect first

**Files:**
- Modify: `src/components/integrations/AgentAccess.tsx`
- Test: `src/components/integrations/AgentAccess.test.tsx` (append)

**Interfaces:**
- Consumes: `accessHint` for `'reconnect'` (Task 3).

- [ ] **Step 1: Write the failing test**

Append to `AgentAccess.test.tsx` (follow its existing render helper with a store and `canManage`):

```tsx
  it('shows the reconnect hint and no Allow button while the tool is broken (R2D1-10)', () => {
    renderAccess({ ...SLACK, agents: { kinds: ['slack.reply'], can_act: false, needs: 'reconnect', allowed_by: null, allowed_at: null } }, { canManage: true });
    expect(screen.getByText('Reconnect Slack before agents can act.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow agents to act' })).toBeNull();
  });
```

(`renderAccess` and `SLACK` stand for the file's existing helper and Slack connector fixture; use their real names.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/integrations/AgentAccess.test.tsx --maxWorkers=2`
Expected: FAIL: the Allow button renders.

- [ ] **Step 3: Hide the switch until reconnected**

In `AgentAccess.tsx`:

```tsx
  const broken = connector.agents.needs === 'reconnect';
  const switchable = canManage && connector.agents.kinds.length > 0 && !broken;
```

and the hint line shows for `broken` too: `{hint && !canAct && (switchable || broken || connector.agents.kinds.length === 0) ? ...}`. A connector that can act but is now broken (`can_act` false, `needs: 'reconnect'`) also shows only the hint: "Make read only" is not offered while broken (the switch stays on; the server turns it off on disconnect).

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/components/integrations src/features/connectors --maxWorkers=2 && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/AgentAccess.tsx src/components/integrations/AgentAccess.test.tsx
git commit -m "fix(integrations): a broken tool asks for a reconnect before agents can act

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The mailbox card's signature

**Files:**
- Create: `src/components/integrations/MailboxSignature.tsx`, `src/components/integrations/MailboxSignature.test.tsx`
- Modify: `src/components/integrations/MailboxSection.tsx` (render it under the facts), `src/components/integrations/MailboxSection.test.tsx` (one integration test)

**Interfaces:**
- Consumes: `saveSignature`, `MailSignature` (Task 1); `SIGNATURE`, `gmailSignatureText` (Task 3); `stubMail` PATCH (Task 2).
- Produces: `MailboxSignature({ connection }: { connection: MailboxConnection })`: null when `connection.signature` is null or absent.

- [ ] **Step 1: Write the failing tests**

Create `src/components/integrations/MailboxSignature.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import mailReducer from '../../features/mail/mailSlice';
import { GOOGLE, OUTLOOK, stubMail } from '../../features/mail/testMail';
import { MailboxSignature } from './MailboxSignature';

// Integration tier: the real mail slice; only fetch is stubbed (stubMail),
// shaped like the round 2 D1 contract §4.3.

afterEach(() => vi.unstubAllGlobals());

function renderSignature(connection = OUTLOOK) {
  stubMail({ connection });
  const store = configureStore({ reducer: { mail: mailReducer } });
  render(
    <Provider store={store}>
      <MailboxSignature connection={connection} />
    </Provider>,
  );
  return store;
}

describe('MailboxSignature (round 2 D1 Decisions 4, 5)', () => {
  it('lets an Outlook owner write and save their signature', async () => {
    const store = renderSignature();
    const box = screen.getByRole('textbox', { name: 'Signature' });
    expect(screen.getByText('Added under every email you send from Revenact. Up to 10 lines.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.type(box, 'Carl CSM{Enter}Acme');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Signature saved.');
    expect(store.getState().mail.connection?.signature?.text).toBe('Carl CSM\nAcme');
  });

  it('shows the server sentence on a refusal', async () => {
    renderSignature();
    await userEvent.type(screen.getByRole('textbox', { name: 'Signature' }), Array.from({ length: 11 }, () => 'x').join('{Enter}'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Keep the signature to 10 lines.');
  });

  it("shows Gmail's signature read only", () => {
    renderSignature(GOOGLE);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/Dana Ruiz/)).toBeInTheDocument();
    expect(screen.getByText('Change it in Gmail.')).toBeInTheDocument();
  });

  it('shows nothing for IMAP', () => {
    const { container } = render(
      <Provider store={configureStore({ reducer: { mail: mailReducer } })}>
        <MailboxSignature connection={{ ...OUTLOOK, provider: 'imap', signature: null }} />
      </Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

(`stubMail(initial)` takes `{ connection }`; check its signature in `testMail.ts` and match it.)

Append to `MailboxSection.test.tsx`:

```tsx
  it('puts the Outlook signature on the mailbox card', async () => {
    stubMail({ connection: OUTLOOK });
    renderSection();
    expect(await screen.findByRole('textbox', { name: 'Signature' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/integrations --maxWorkers=2`
Expected: FAIL: no `MailboxSignature` module.

- [ ] **Step 3: The component**

Create `src/components/integrations/MailboxSignature.tsx` (the row is the house `SettingsRow`, stacked, so no hand-written settings markup is added and the UI ratchet stays equal):

```tsx
import { useId, useState } from 'react';
import { useAppDispatch } from '../../hooks';
import { saveSignature, type MailboxConnection } from '../../features/mail/mailSlice';
import { SIGNATURE, gmailSignatureText } from '../../features/mail/signature';
import { BUTTON, INPUT, SettingsRow, TYPE } from '../ui';

const AREA = `${INPUT} min-h-24 py-2`;

/** The mailbox's signature (round 2 D1 contract §4.3; Decisions 4, 5): an
 *  Outlook owner writes it; Gmail's is shown as Gmail has it; IMAP has none. */
export function MailboxSignature({ connection }: { connection: MailboxConnection }) {
  const dispatch = useAppDispatch();
  const id = useId();
  const signature = connection.signature;
  const [text, setText] = useState(signature?.text ?? '');
  const [saved, setSaved] = useState(signature?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  if (!signature) return null;

  if (!signature.editable) {
    return (
      <SettingsRow label={SIGNATURE.LABEL} hint={SIGNATURE.GMAIL_HINT} stacked>
        <p className={`whitespace-pre-line ${TYPE.body}`}>{gmailSignatureText(signature.text)}</p>
      </SettingsRow>
    );
  }

  const changed = text !== saved;
  async function save() {
    if (busy || !changed) return;
    setBusy(true);
    setDone(false);
    setRefused(null);
    const result = await dispatch(saveSignature(text));
    setBusy(false);
    if (saveSignature.rejected.match(result)) return setRefused(result.payload ?? SIGNATURE.FAILED);
    const kept = result.payload.signature?.text ?? '';
    setText(kept);
    setSaved(kept);
    setDone(true);
  }

  return (
    <SettingsRow label={SIGNATURE.LABEL} htmlFor={id} hint={SIGNATURE.HINT} hintId={`${id}-hint`} error={refused} errorId={`${id}-error`} stacked>
      <textarea
        id={id}
        rows={4}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setDone(false);
        }}
        aria-invalid={Boolean(refused)}
        aria-describedby={refused ? `${id}-error` : `${id}-hint`}
        className={AREA}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} aria-disabled={busy || !changed || undefined} className={BUTTON}>
          {busy ? SIGNATURE.SAVING : SIGNATURE.SAVE}
        </button>
        <p role="status" className={done ? TYPE.meta : 'sr-only'}>
          {done ? SIGNATURE.SAVED : ''}
        </p>
      </div>
    </SettingsRow>
  );
}
```

(`SettingsRow` renders the label as a `<label htmlFor>` when `htmlFor` is given, the hint with `hintId`, and the error with `errorId` and `role="alert"`. `useAppDispatch` lives in `../../hooks`, as `AgentAccess.tsx` imports it.)

In `MailboxSection.tsx`, import it and render `<MailboxSignature connection={connection} />` right after the closing `</dl>` of the facts (inside the `connection && status` branch).

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/integrations --maxWorkers=2 && npx tsc -b && npm run lint && npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS, ratchet equal.

- [ ] **Step 5: Commit**

```bash
git add src/components/integrations/MailboxSignature.tsx src/components/integrations/MailboxSignature.test.tsx src/components/integrations/MailboxSection.tsx src/components/integrations/MailboxSection.test.tsx
git commit -m "feat(integrations): write an Outlook signature on the mailbox card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The mail editor keeps the Gmail signature as one block

**Files:**
- Modify: `src/pages/communications/MailEditor.tsx`
- Test: `src/pages/communications/MailEditor.test.tsx` (append)

**Interfaces:**
- Consumes: `SIGNATURE.EDITOR_HINT` (Task 3).
- Produces: after seeding, the editor's `[data-revenact-signature]` element has `contenteditable="false"`; the hint shows while the editor's HTML holds the block.

- [ ] **Step 1: Write the failing test**

Append to `MailEditor.test.tsx` (it renders `MailEditor` with `label`, `html`, `onChange`):

```tsx
  it('keeps the Gmail signature as one read-only block (round 2 D1 Decision 6)', () => {
    render(<MailEditor label="Message" html={`<p>Hi</p>${SIGNATURE}`} onChange={vi.fn()} />);
    const editor = screen.getByRole('textbox', { name: 'Message' });
    const block = editor.querySelector('[data-revenact-signature]');
    expect(block).not.toBeNull();
    expect(block).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByText('Your Gmail signature goes out as it is in Gmail.')).toBeInTheDocument();
  });

  it('says nothing about a signature when there is none', () => {
    render(<MailEditor label="Message" html="<p>Hi</p>" onChange={vi.fn()} />);
    expect(screen.queryByText('Your Gmail signature goes out as it is in Gmail.')).toBeNull();
  });
```

(`SIGNATURE` from `../../features/mail/testMail`; the editor's `role="textbox"` is labelled by its `label`.)

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/pages/communications/MailEditor.test.tsx --maxWorkers=2`
Expected: FAIL: no `contenteditable` on the block; no hint.

- [ ] **Step 3: Seed the block read only; show the hint**

In `MailEditor.tsx`, import `SIGNATURE` as `SIGNATURE_WORDS` from `../../features/mail/signature`; add state `const [signed, setSigned] = useState(() => html.includes('data-revenact-signature'));`; in the seeding effect, after setting `innerHTML`:

```tsx
    // Round 2 D1 R2D1-16: the server puts Gmail's signature back whole on
    // save, so nothing is typed into it here; deleting it still works.
    ref.current?.querySelector('[data-revenact-signature]')?.setAttribute('contenteditable', 'false');
```

In `changed()`, after `onChange(...)`: `setSigned(Boolean(ref.current?.querySelector('[data-revenact-signature]')));`. Under the editable `div`, inside the component's outer wrapper:

```tsx
      {signed ? <p className={TYPE.meta}>{SIGNATURE_WORDS.EDITOR_HINT}</p> : null}
```

`cleanEditable` already drops the `contenteditable` attribute from what is sent (only the marker survives), so the server never sees it.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/pages/communications src/features/mail --maxWorkers=2 && npx tsc -b && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/communications/MailEditor.tsx src/pages/communications/MailEditor.test.tsx
git commit -m "fix(mail): keep the Gmail signature as one read-only block in the editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The journeys, the docs, the full check and by eye

**Files:**
- Create: `src/e2e/bundleRound2.test.tsx`
- Modify: `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: The journeys**

Create `src/e2e/bundleRound2.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetMembersCache } from '../features/knowledge/useMembers';
import { BUNDLES, B_COMMENT, B_OUTSIDE, OUTSIDE_BUNDLES } from '../features/agents/testBundleFixtures';
import { stubBundles } from '../features/agents/testBundles';
import { renderWork } from '../pages/work/testPages';
import { resetViewport } from '../test/viewport';

// End-to-end tier (jsdom, no browser): the real panel, router and History;
// only fetch is stubbed, in the round 2 D1 contract's shapes. Nothing is
// sent to Jira. Carl edits and runs an internal Jira comment and History
// links to it; with Jira down, a Jira step shows one error and one Try again.

afterEach(() => {
  vi.unstubAllGlobals();
  resetViewport();
  resetMembersCache();
  document.body.style.overflow = '';
});

describe('Agent bundles round 2 D1', () => {
  it('edits and runs a Jira comment; History links to the comment', { timeout: 30000 }, async () => {
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES, B_COMMENT] });
    renderWork(`/work?queue=mine&bundle=${B_COMMENT.id}`);
    const panel = await screen.findByRole('dialog', { name: B_COMMENT.title });
    const step = within(panel).getByTestId('step-451');
    expect(within(step).getByText("Can't be undone")).toBeInTheDocument();
    expect(within(step).getByText('Only your team sees this comment in Jira.')).toBeInTheDocument();
    const box = within(step).getByRole('textbox', { name: 'Comment' });
    await userEvent.clear(box);
    await userEvent.type(box, 'Fails on Safari as well.');
    await userEvent.click(within(panel).getByRole('button', { name: 'Run 1 selected' }));
    expect(await within(step).findByRole('link', { name: 'Open the comment on SUP-12 in Jira (opens in a new tab)' })).toHaveAttribute('target', '_blank');
  });

  it('shows one Jira error with one Try again when Jira is down', { timeout: 30000 }, async () => {
    const down = { status: 502, body: { code: 'TOOL_UNREACHABLE', detail: "Couldn't reach Jira. Try again." } };
    stubBundles({ bundles: [...BUNDLES, ...OUTSIDE_BUNDLES], failOptions: { jira_projects: down, jira_priorities: down, jira_assignees: down } });
    renderWork(`/work?queue=mine&bundle=${B_OUTSIDE.id}`);
    const panel = await screen.findByRole('dialog', { name: B_OUTSIDE.title });
    const create = within(panel).getByTestId('step-413');
    expect(await within(create).findByRole('alert')).toHaveTextContent("Couldn't reach Jira. Try again.");
    await waitFor(() => expect(within(create).getAllByRole('button', { name: 'Try again' })).toHaveLength(1));
  });
});
```

Run: `npx vitest run src/e2e --maxWorkers=2`
Expected: PASS (and the D3 journeys in `bundleOutside.test.tsx` still pass).

- [ ] **Step 2: The docs**

- `docs/03-ui-ux-design.md`, the bundle panel section: the comment editor (Decision 1), one Jira error per step (Decision 2); Settings › Connections: the reconnect hint (Decision 3); the mailbox card's signature (Decisions 4, 5); the mail editor: replace the "Known limit" paragraph's "(owner decision pending)" with what holds now: the Gmail signature block is kept whole and shown read only (Decision 6); a draft written in Gmail is still simplified once edited here.
- `docs/04-app-flow.md`: running a Jira comment and its Retry; writing an Outlook signature.
- `.agents/workflows/repo-architecture.md`: `MailboxSignature.tsx`, `features/mail/signature.ts`; `PickSearch` is controlled by its caller.

- [ ] **Step 3: The full check**

```bash
npx vitest run --maxWorkers=2
npx tsc -b
npm run lint
npm run build
npx vitest run src/test/uiRatchet.test.ts --maxWorkers=2
grep -rn "—" src/components/work src/pages/work src/features/work src/features/agents/bundle* src/features/agents/testBundle* src/components/integrations/AgentAccess* src/components/integrations/MailboxSignature* src/features/connectors/agentAccess* src/features/mail/signature* || echo "no em dash"
```

Expected: every test passes (write the count into the hand-off), `tsc` clean, lint clean, build OK, ratchet totals equal to `BASELINE`, "no em dash".

- [ ] **Step 4: By eye, on a database copy, with fake credentials**

Nothing real is sent and no model is called.

1. Copy the dev database (read only on `revenact`): `createdb -T revenact revenact_r2d1` (stop if `revenact` has open connections; ask the controller to pause the owner's servers rather than force it). Migrate the copy only: `DATABASE_URL=postgres:///revenact_r2d1 venv/bin/python manage.py migrate` from the backend worktree `round2-be` at its head.
2. Make it safe in the copy: every `MailboxConnection` blanked (`credentials=''`) except one Outlook row for a QA user with fake tokens; every `Connector` credential set to fakes (`xoxb-fake`, Jira `api_token: fake`, Jira host `revenact-qa-nonexistent.atlassian.net`); AWS/model keys overridden with fakes in the server's env (no AI call possible).
3. Seed: a waiting bundle with a `jira.comment` step (source Jira thread, `SUP-12`) and a `jira.create` step on the same Jira connector; a done bundle whose `jira.comment` step is applied with `comment_url` set.
4. Backend on :8014 (`round2-be`, `DATABASE_URL` the copy), Vite on :5184 (`VITE_API_URL` pointing at :8014).
5. Check in Chrome (playwright-cli), 1440x900 and 390x844, light and dark: the comment editor (where it goes, internal line, the Comment field, "Can't be undone"); the Jira create step with the fake site (one error, one Try again; the sentence reads "Jira can't find this site. Check the Jira connection." because the fake site answers 404); History's "Open the comment on SUP-12 in Jira"; Settings › Connections with a connector set to error (the reconnect hint, no Allow); the mailbox card as the Outlook QA user (write a signature, Save, "Signature saved."; 11 lines refused); a Gmail-shaped QA row's read-only signature; the mail editor with a draft holding a signature block (no caret inside it; the hint). Never press Run on a step whose tool could reach anything real: with the fake host and fake tokens, a Jira Run fails "can't find", which is fine to see.
6. Write findings to the scratchpad (`round2-fe-byeye/findings.md`) with screenshots; fix should-fix items test first; stop the servers; leave `revenact_r2d1` for the owner to drop.

- [ ] **Step 5: Commit and push**

```bash
git add src/e2e/bundleRound2.test.tsx docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "test(e2e): round 2 D1 journeys; docs for Jira comments and signatures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push origin feat/agent-bundles-r2d1
```

Hand-off (to the controller, not a PR): the head, the vitest count, the by-eye findings, and anything the backend's "Changes during the build" changed.

---

## Self-review

1. **Contract coverage.** `jira.comment` types (§2) Task 1; its stub (outputs, link, R2D1-6) Task 2; its words and preview line Task 3; its editor (editable `body`, internal, as) Task 4; History link and kind filter (Decision 7) Tasks 1, 2, 9; options `TOOL_NOT_FOUND`/`TOOL_BUSY` need no code (the server's `detail` is shown verbatim, D3 Decision 3) and the journey's fake site shows it by eye; one error per step (C1) Task 5; `needs: "reconnect"` (§4.2) Tasks 1, 3, 6; `connection.signature` and `PATCH /mail/connection/` (§4.3) Tasks 1, 2, 3, 7; the Gmail block (R2D1-16) Task 8.
2. **Placeholders.** Code steps hold their code. Five notes ask the implementer to match an existing helper's real name (`renderFields`, `renderAccess`, `anAction`, `stubMail`'s argument, the `channel` value): they are lookups in files this plan does not reproduce, each named with a `grep`.
3. **Type consistency.** `JiraCommentPreview` (Task 1) is what `B_COMMENT` (Task 2), `previewText` (Task 3) and the editor (Task 4) read. `MailSignature` and `saveSignature` (Task 1) are what `stubMail` (Task 2) answers and `MailboxSignature` (Task 7) uses. `PickSelect.quiet` and the controlled `PickSearch` (Task 5) are used only by `BundleOutsideFields`.
