# Two-way Gmail, delivery 2 ("actions"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mailbox on Communications a working Gmail client for what delivery 2 adds:
- **conversations** (`GET mail/threads/`) instead of single messages, the open conversation with older messages folded, `folder=all` and the label view;
- **Gmail labels** in the sidebar (colour dot, unread conversations) and a label menu (apply, remove, create; pending labels shown);
- **actions** that show at once and put themselves back when the server refuses: read on open, unread, star, done (archive) and back to Inbox, delete and restore, spam and not spam, mute and unmute;
- **bulk select** with Mark done, Mark read or unread, Label and Delete;
- **keyboard** `e`, `#`, `j`, `k`, `r`;
- **failure notices**: the `sync_issue` line and the `mail_action_failed` bell notification;
- **attachments** that open (images and PDFs in a viewer, the rest downloaded), `cid:` images inside HTML mail, and filed mail's attachments on a record's Files tab.

**Architecture:**
- **`features/mail`**: `mailboxSlice.ts` gains the contract's thread, label, action and attachment types, the list, thread, labels, selection and optimistic-undo state, and the thunks (`fetchMailList`, `fetchThread`, `updateThread`, `bulkMailAction`, `fetchMailLabels`, `createMailLabel`). `mailOptimistic.ts` is pure: what a change does to a row and to the open conversation, and whether the row leaves the view. `mailText.ts` gains every new sentence and the action gate. `mailAttachments.ts` fetches files with the session and resolves `cid:` images. `testMail.ts` becomes a stateful stub of the whole D2 contract.
- **`pages/communications`**: `MailList` lists conversations (Sent and Drafts keep messages, adapted to the same row); `MailDetail` becomes the open conversation, one `ThreadMessage` per message; new `LabelMenu`, `MailBulkBar`, `AttachmentViewer`, `MailSyncIssue`, `useMailKeys`; `MailboxPanel` gains All mail and Labels; `MailboxNotice` says when actions cannot reach Gmail.
- **Elsewhere:** `lib/apiClient.ts` stops prefixing a server-given `/api/v1/...` path twice; the Files tab (`filesSlice`, `fileFormat`, `FileItem`, `FilesTab`) shows `source: "email"` rows without Delete; the bell knows `mail_action_failed`.
- No new dependency.

**Tech Stack:**
- React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), Vite 8;
- Redux Toolkit (`createAsyncThunk`, `createSlice`, `current`), react-router 7, Tailwind v4 tokens (`src/index.css`), lucide-react 1.49;
- Vitest with Testing Library (jsdom) and `@testing-library/user-event` 14.

**Spec:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-fe/docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §3 (the action table), §4 "Communications › Mail" (conversations, labels, attachments, bulk select, keyboard, failed outbox notices, phone width), §5 (frontend tests).

**API contract (binding; its "Decisions made in this contract" override the spec):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail2-be/docs/superpowers/plans/2026-10-11-gmail-actions-api.md`. It wins on shapes, field names, codes and sentences. Sections used: §2 (threads, thread detail, `folder=all`, `label=`), §3 (the check table, PATCH, bulk, muted), §4 (labels), §5 (`sync_issue`, the notification), §6 (attachments, the Files tab), §10 (frontend-only parts), §12 (not in D2).

**The code this plan extends:** `docs/superpowers/plans/2026-10-10-gmail-sync-frontend.md` (delivery 1: `mailText.ts`, `testMail.ts`, `MailboxView`, `MailDetail`, `MailLabels`, `MailAttachments`, `MailHtmlBody` and its CSP `srcdoc`, `MailboxNotice`). Read the spec sections, the contract and this plan before starting.

## Global Constraints

- **Worktree and branch:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail2-fe`, branch `feat/gmail-actions` (based on the D1 frontend head `8b4c8131`). All paths below are relative to it. The D2 backend PR merges first; this PR follows it.
- **`node_modules`:** if the worktree has none, link the main checkout's: `ln -s ../../react-ts-app/node_modules node_modules` (it is gitignored). Never commit it.
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees; make a WIP commit to set work aside). `git add` explicit paths only, never `-A` or `.`. Never push.
- **Commands:** one task: `npx vitest run <paths> --maxWorkers=2`; lint: `npm run lint`; types and bundle: `npm run build`; everything: `npx vitest run --maxWorkers=4`. Run them in the foreground.
- **Commits:** conventional (`feat(mail): ...`, `feat(comms): ...`, `feat(files): ...`, `fix(api): ...`, `test(e2e): ...`, `docs: ...`), imperative, lowercase subject, and every message ends with exactly this line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Field names exactly as the contract:** thread rows `id`, `thread_id`, `subject`, `snippet`, `last_sent_at`, `message_count`, `unread_count`, `participants` (`name`, `address`), `more_participants`, `is_read`, `is_starred`, `is_important`, `priority`, `state`, `folder`, `has_attachments`, `labels`, `account`, `sync_issue`; thread detail `thread_id`, `subject`, `labels`, `account`, `sync_issue`, `truncated`, `messages`; labels `id`, `gmail_id`, `name`, `color`, `unread`, `pending`; `sync_issue` `{text, at}`; attachments `available`, `preview`, `download_url`; PATCH fields `is_read`, `is_starred`, `state`, `trashed`, `spam`, `add_labels`, `remove_labels`; bulk `op`, `thread_of`, `label_id` and the answer `op`, `messages`, `threads`, `unchanged`; Files rows `source: "email"` and `email` (`id`, `subject`, `from`).
- **Codes exactly as the contract:** `MAILBOX_PAUSED`, `TWO_WAY_OFF` (with `needs_reconnect`), `NO_MAILBOX`, `GMAIL_ONLY`, `TOO_MANY`, `LABEL_EXISTS` (with `label_id`), `ATTACHMENT_TOO_LARGE`, `ATTACHMENT_UNAVAILABLE`, `ATTACHMENT_GONE`, `GMAIL_BUSY`; ops `read unread star unstar archive inbox trash untrash spam not_spam label_add label_remove mute unmute`; notification kind `mail_action_failed`.
- **Server sentences are shown as the server sends them** (`detail`, field errors, `sync_issue.text`, the notification's `message`). The two the screen shows before anyone tries are the contract's, verbatim: "Reconnect Google to turn on two-way: changes here can't reach Gmail yet." and "This message's mailbox is no longer connected." Every sentence this plan writes itself lives in `src/features/mail/mailText.ts` and nowhere else.
- **Owner-only stays owner-only:** nothing here shows another person's mailbox, labels, outbox state or unfiled attachments. The Files tab shows only what `GET .../files/` returns.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, no `rgb()`, no named Tailwind palette colour in any `.tsx`. Gmail's label colour stays data applied through `style` (`LabelDot`), as in D1.
- **Type and weight:** sizes 11/13/15/22 px only, through `TYPE` (`src/components/ui/type.ts`) where a role fits; `font-normal` and `font-semibold` only. Never append a colour after a `TYPE` string; write the size classes out instead (`text-[13px] leading-5 text-danger-ink`).
- **Figures:** `NUM` around the figure only; a sentence with figures goes through `Figured` (`src/components/brain/Figured.tsx`). `font-mono-brand` never.
- **Kinso look:** warm canvas, monochrome primary (no `PRIMARY` is added here: every action is `BUTTON`, `QUIET` or `ICON_BUTTON`), no card inside a card, `divide-y divide-line-subtle` lists, overlays through `OVERLAY` and `bg-scrim`, Lucide icons with `aria-hidden="true"`, no emoji, a failed action in `text-danger-ink` with an icon, the `sync_issue` line quiet (`TYPE.meta`). Inside the Communications glass shell everything stays flat; only `CommunicationsPage`, `MailboxView` and `NextEventCard` may carry glass.
- **Targets and states:** every button, link, select and input reaches 44px below `sm` (`BUTTON`, `QUIET`, `ICON_BUTTON`, `INPUT`, `min-h-11` on a checkbox's label); every icon-only button has an `aria-label`; every list keeps its loading, empty and error states; a `role="status"` region stays mounted between updates.
- **Density (revenact-design §4 rule 12):** at most one always-visible control per row. A row's checkbox shows on hover or focus from `sm`, always on touch, and always once anything is ticked.
- **Motion:** none added beyond a spinner on a fetching chip (`motion-safe:animate-spin`). Keyboard-initiated changes never animate.
- **No em dash (U+2014)** in any line this plan adds (code, comments, tests, docs copy). Existing lines that hold one stay byte-identical.
- **Phone width (375px):** no horizontal scroll; the list and the open conversation each fill the pane with Back between them (as today); toolbars and the bulk bar wrap (`flex-wrap`); the label menu is at most `calc(100vw-2rem)` wide; the viewer is full width with `p-4` round it.
- **The UI ratchet** (`src/test/uiRatchet.test.ts`) holds every count **exactly** at its baseline. No task may raise a count; a task that lowers one writes the new, lower baseline in the same commit. New files add zero offences.
- **House-rule suites stay green:** `src/components/ops.houseRules.test.ts` globs `src/pages/communications/*.{ts,tsx}` (tokens, sizes, no glass outside the three shell files, no hand-written card, weights, uppercase, named icon buttons). `src/test/inlineTargets.test.ts` keeps reading `src/pages/communications/MailDetail.tsx`, which must keep an `INLINE_TARGET` link.
- **Tests:** the repo's three tiers (`.claude/skills/testing/SKILL.md`): unit and integration with Vitest and Testing Library; **end-to-end is jsdom journeys in `src/e2e/`**, not Playwright. Fetch is stubbed only at the network boundary (`vi.stubGlobal('fetch', spy)` through `stubMail`), with contract-shaped bodies; the store is real. Blob URLs are stubbed with `vi.spyOn(URL, 'createObjectURL')`, never by replacing the `URL` global (the stub builds `new URL(...)`).
- **Out of scope (contract §12):** drafts both ways, Reply all, Forward, CC/BCC and attachments on send, the signature, the formatting editor, compose from the mailbox, "Search older mail in Gmail", label rename/delete/colour, Gmail's own mute, permanent delete, any Outlook or IMAP write-back.

## Decisions (where the brief, the spec or the contract leaves a choice)

1. **Conversations for every provider; Sent and Drafts keep the message list.** `GET mail/threads/` serves Outlook (by `conversationId`) and IMAP (one message per thread) too, so one list and one reading pane serve every mailbox. A thread row names its **senders** only and has no `category`, so Sent and Drafts, which read by recipient, keep `GET mail/messages/` and adapt each message to the same row type (`rowOfMessage`, `sent: true`, title "To <names>"). Opening any row opens its whole conversation through `mail/messages/<id>/thread/`.
2. **The list's third column shows Labels, not Category.** A thread row has no category. The open conversation keeps the newest message's category badge, and the Categories block still narrows the list by `category=`. `MAIL_COLUMNS` keeps its four tracks.
3. **Optimistic, with a per-row undo.** Every action changes the row and the open conversation in the pending reducer and keeps their before-values by request id. A failure puts each row back at its old index, only when the list on screen is still the same query, and the thread only when it is still open. After a success the screen reads the summary and the labels again; it reads the list again when the change took rows out of the view (`leavesView`) and after every bulk action (contract §3). A change that takes the open conversation out of the view closes it first, as Gmail does.
4. **Unmute goes through `POST mail/actions/` with `op: "unmute"`.** A thread PATCH can only leave `muted` for `open` or `done`, which is the `inbox` or `archive` op and writes to Gmail, so it would be refused on a read-only or paused mailbox, where the contract allows unmute (§3 "Muted").
5. **The action gate (contract §10).** `mailActionGate(connection, disconnected)`: for a Google mailbox that is paused, read-only (`two_way: false`) or disconnected, every action but Mute and Unmute is **disabled** with the reason as its `title`, opening a conversation sends no read PATCH, and `MailboxNotice` adds a line ("Reconnect Google to turn on two-way: changes here can't reach Gmail yet." or "This message's mailbox is no longer connected.") with **Open Connections**; a paused mailbox already has D1's paused line. Outlook and IMAP **hide** Gmail's own actions (Delete, Restore, spam, labels). A `409` that arrives anyway (the state changed under the screen) is shown in the server's words, with Open Connections for `TWO_WAY_OFF`, `NO_MAILBOX` and `token_revoked`, and the connection and summary are read again.
6. **Only the newest message opens unfolded.** Older ones are one line (who, snippet, date) that unfolds on press. Unfolding unread ones too would depend on whether the read PATCH or the thread GET answers first. Outside Trash, trashed messages sit behind "N deleted messages"; `truncated` adds "Older messages in this conversation are only in Gmail."
7. **Reply goes to the newest message from someone else**, else to the newest one (your own sent mail, replied to its recipients); none from Drafts, Spam or Trash. Sending stays D1's `POST mail/messages/<id>/reply/`.
8. **Keyboard: `e`, `#`, `j`, `k`, `r` only.** `a` (Reply all), `f` (Forward) and `c` (compose) have nothing to call in D2: the mailbox has no compose and D3 brings Reply all and Forward (contract §10, §12). The keys act only when focus is on the page body or inside the mailbox, and never in an input, textarea, select, contenteditable, dialog (the label menu, the viewer) or the mail frame. In the list `j`/`k` move focus between rows and `e`/`#` act on the focused row; with a conversation open `j`/`k` open the next or previous one, `e`/`#` act on it and `r` focuses the reply. After `e` or `#` in the list, focus moves to the row that took its place. Buttons carry `aria-keyshortcuts`.
9. **Attachments are fetched with the session into a blob** (`apiFetchBlob`). The viewer shows a file only when the attachment says `preview: true` **and** the blob's own type is PNG, JPEG, GIF, WebP or PDF; the blob is re-typed to that type before `URL.createObjectURL`. Images use `<img>`, PDFs `<object type="application/pdf">` with a Download fallback; anything else is saved with `?download=1`. Errors are the server's `detail` (413 "This file is too large to open here. Open it in Gmail.", 409, 410, 503), else "Couldn't open <name>.". An attachment with `available: false` is a plain chip with the reason in its title.
10. **`cid:` images** in HTML mail are fetched for inline parts the HTML references, PNG/JPEG/GIF/WebP only, at most 5 MB each, turned into `data:` URLs and written into the sanitised HTML before it goes into the sandboxed `srcdoc`; D1's CSP already allows `img-src cid: data:`. Each part is fetched once per tab (a module cache by attachment id), because every download of a filed message's attachment is audited (contract decision 31).
11. **`apiFetchBlob` takes server paths.** `download_url` values are `/api/v1/...` (Files since 2026-09-16, mail attachments now), and `rawFetch` prefixed `BASE_URL` (`…/api/v1`) again, so Files downloads asked for `/api/v1/api/v1/files/<id>/download/`. `rawFetch` now drops a leading `/api/v1` before prefixing.
12. **The bell's link opens the conversation.** `MailboxView` reads `?message=<id>` once, opens that conversation and drops the parameter (replace, so Back does not reopen it). When a new `mail_action_failed` notification arrives while the mailbox is open, the list and the open conversation are read again, so the server's revert shows without a sync.
13. **Labels.** The sidebar lists labels under the folders (dot, name, unread conversations in `NUM`); a pending one is faint with "Not in Gmail yet" for screen readers and as its title. Chips of a pending label have a dashed edge. The label menu ticks a label when every message (or every selected conversation) carries it, shows mixed when some do, and creates a label from its own field; `409 LABEL_EXISTS` applies the existing label instead. Field refusals stay inside the menu. Rename, delete and colour are not in D2.
14. **Selection is per page** and clears on any change of view (folder, label, category, filters) and after a bulk action succeeds. "Select every conversation on this page" ticks all or none; it shows mixed when some are ticked.

## Contract gaps found (and how this plan resolves them)

- **A thread row has no recipients and no `category`.** Sent and Drafts keep `GET mail/messages/` (Decision 1); the list's third column becomes Labels (Decision 2).
- **A thread PATCH cannot unmute without writing to Gmail** (`state: open`/`done` are the `inbox`/`archive` ops, refused when read-only or paused, where unmute is allowed). Unmute uses `POST mail/actions/ {op: "unmute"}` (Decision 4).
- **`download_url` is `/api/v1/...` and `apiFetchBlob` prefixed `/api/v1` again**, so Files downloads (since 2026-09-16) and mail attachments asked for `/api/v1/api/v1/...`. Fixed in `rawFetch` (Decision 11, Task 7).
- **Inline `cid:` images of filed mail are audited on every download** (decision 31), and the frame needs them on every open. The frontend fetches each part once per tab (Decision 10); whether inline parts should be audited at all is the owner's call on the backend.
- **The notification's `?message=<id>` link had no reader** in the D1 frontend. `MailboxView` opens it (Decision 12). Opening from the bell sends no read PATCH: the screen has no `unread_count` for a message it did not list.
- **Keyboard `a`, `f`, `c` have nothing to call** until D3 (contract §10, §12): not bound (Decision 8).

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/features/mail/mailboxSlice.ts` | Modify | D2 types; list, thread, labels, selection, undo state; the thunks |
| `src/features/mail/mailOptimistic.ts` | Create | Pure: op to patch, `leavesView`, `patchRow`, `patchThread`, `labelState` |
| `src/features/mail/mailText.ts` | Modify | The action gate, `actionFailure`, label, thread and attachment sentences |
| `src/features/mail/mailAttachments.ts` | Create | Open or save an attachment; resolve `cid:` images |
| `src/features/mail/testMail.ts` | Modify | D2 fixtures; the stub's threads, thread PATCH, bulk, labels and download routes |
| `src/lib/apiClient.ts` | Modify | Drop a leading `/api/v1` from server-given paths |
| `src/pages/communications/MailList.tsx` | Modify | Conversation rows, Labels column, checkboxes, the sync issue mark |
| `src/pages/communications/MailDetail.tsx` | Rewrite | The open conversation: header, actions, messages, reply |
| `src/pages/communications/ThreadMessage.tsx` | Create | One message, folded or unfolded |
| `src/pages/communications/LabelMenu.tsx` | Create | Apply, remove, create labels |
| `src/pages/communications/MailBulkBar.tsx` | Create | The selection's actions |
| `src/pages/communications/AttachmentViewer.tsx` | Create | The image and PDF viewer dialog |
| `src/pages/communications/MailSyncIssue.tsx` | Create | The quiet `sync_issue` line |
| `src/pages/communications/useMailKeys.ts` | Create | The keyboard shortcuts and when they are off |
| `src/pages/communications/MailAttachments.tsx` | Rewrite | Chips that open, download or say why not |
| `src/pages/communications/MailHtmlBody.tsx` | Modify | Inline `cid:` images |
| `src/pages/communications/MailLabels.tsx` | Modify | `LabelDot`; pending chips |
| `src/pages/communications/MailboxPanel.tsx` | Modify | All mail; the Labels group |
| `src/pages/communications/MailboxNotice.tsx` | Modify | The read-only and disconnected line |
| `src/pages/communications/MailboxView.tsx` | Rewrite | Wiring: list, conversation, gate, actions, bulk, keys, `?message=` |
| `src/pages/communications/mailWho.ts` | Modify | `threadWho`, `replyTarget` |
| `src/pages/communications/queueColumns.ts` | Modify | Comment only (Labels column) |
| `src/features/notifications/types.ts` | Modify | `mail_action_failed` |
| `src/components/layout/NotificationKindIcon.tsx` | Modify | `MailWarning` for it |
| `src/features/files/filesSlice.ts` | Modify | `source: "email"`, `email` |
| `src/features/files/fileFormat.ts` | Modify | Email rows are never deletable |
| `src/components/organizations/detail/FileItem.tsx` | Modify | "Email from <who>" and the subject |
| `src/components/organizations/activity/FilesTab.tsx` | Modify | Same delete rule, "email from <who>" |
| `src/e2e/gmailActions.test.tsx` | Create | The D2 journeys |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | Modify | Delivery 2 |

Tests created: `src/features/mail/mailOptimistic.test.ts`, `src/features/mail/mailActionsText.test.ts`, `src/features/mail/mailboxSlice.test.ts`, `src/features/mail/mailAttachments.test.ts`, `src/pages/communications/MailboxActions.test.tsx`, `src/pages/communications/LabelMenu.test.tsx`, `src/pages/communications/useMailKeys.test.ts`, `src/pages/communications/MailAttachments.test.tsx`. Tests changed: `MailDetail.test.tsx` (rewritten), `MailList.test.tsx`, `MailboxView.test.tsx`, `MailboxNotice.test.tsx`, `MailLabels.test.tsx`, `MailHtmlBody.test.tsx`, `src/e2e/gmail.test.tsx`, `src/lib/apiClient.test.ts`, `src/features/files/fileFormat.test.ts`, `src/components/organizations/detail/FileItem.test.tsx`, `src/components/layout/NotificationKindIcon.test.tsx`, `src/components/layout/Navbar.test.tsx`.

---

### Task 1: Types, words and the optimistic rules

**Files:**
- Modify: `src/features/mail/mailboxSlice.ts` (types only)
- Create: `src/features/mail/mailOptimistic.ts`
- Modify: `src/features/mail/mailText.ts`
- Modify: `src/features/mail/testMail.ts` (fixture fields the new types require)
- Modify: `src/pages/communications/MailboxView.tsx` (`FOLDER_TITLE` gains `all`)
- Modify: `src/pages/communications/MailboxView.test.tsx` (`invoice` gains `sync_issue`)
- Modify: `src/pages/communications/MailLabels.test.tsx` (the `Odd` label gains `pending`)
- Test: `src/features/mail/mailOptimistic.test.ts`, `src/features/mail/mailActionsText.test.ts`

**Interfaces:**
- Consumes: D1's `MailboxConnection`, `DisconnectedMailbox`, `PausedReason` (`mailSlice.ts`), `pausedNotice`, `pausedSendMessage` (`mailText.ts`), `ApiError` (`lib/apiClient.ts`).
- Produces (types, `mailboxSlice.ts`): `MailFolder` (+ `'all'`), `MailLabel` (+ `pending: boolean`), `MailLabelEntry`, `SyncIssue`, `MailAttachmentMeta` (+ `preview`, `download_url`), `MailMessage` (+ `sync_issue`), `MailParticipant`, `MailThread`, `MailThreadPage`, `MailThreadDetail`, `ThreadPatch`, `MailOp`, `BulkResult`.
- Produces (`mailOptimistic.ts`): `patchOfOp(op: MailOp, labelId: number | null): ThreadPatch`; `leavesView(view: { folder: MailFolder; label: number | null }, patch: ThreadPatch): boolean`; `patchRow(row: MailThread, patch: ThreadPatch, known: readonly MailLabel[]): MailThread`; `patchThread(thread: MailThreadDetail, patch: ThreadPatch, known: readonly MailLabel[]): MailThreadDetail`; `type LabelState = 'all' | 'some' | 'none'`; `labelState(holders: readonly { labels: readonly MailLabel[] }[], id: number): LabelState`.
- Produces (`mailText.ts`): `TWO_WAY_OFF_TEXT`, `NO_MAILBOX_TEXT`, `interface MailActionGate { gmail: boolean; blocked: string | null; reconnect: boolean }`, `mailActionGate(connection, disconnected): MailActionGate`, `interface ActionFailure { text: string; reconnect: boolean; code: string | null }`, `actionFailure(err: unknown, fallback: string): ActionFailure`, `LABEL_PENDING`, `OLDER_IN_GMAIL`, `deletedMessages(n: number): string`, `ATTACHMENT_UNAVAILABLE`, `PDF_UNSHOWN`, `attachmentFailure(err: unknown, name: string): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/mail/mailOptimistic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { labelState, leavesView, patchOfOp, patchRow, patchThread } from './mailOptimistic';
import type { MailLabel, MailMessageDetail, MailThread, MailThreadDetail } from './mailboxSlice';

// Unit tier: what an action does to the screen before the server answers
// (contract §3), with no store and no network.

const Q4: MailLabel = { id: 11, name: 'Q4', color: null, pending: false };
const RENEWALS: MailLabel = { id: 7, name: 'Renewals', color: { background: '#16a766', text: '#ffffff' }, pending: false };
const PILOT: MailLabel = { id: 12, name: 'Pilot', color: null, pending: true };
const KNOWN = [PILOT, Q4, RENEWALS];

const row: MailThread = {
  id: 1,
  thread_id: 't1',
  subject: 'Renewal quote',
  snippet: 'Quote attached.',
  last_sent_at: '2026-10-09T09:00:00Z',
  message_count: 3,
  unread_count: 1,
  participants: [{ name: 'Ann Lee', address: 'ann@pizzahut.com' }],
  more_participants: 0,
  is_read: false,
  is_starred: false,
  is_important: false,
  priority: false,
  state: 'open',
  folder: 'inbox',
  has_attachments: true,
  labels: [RENEWALS],
  account: null,
  sync_issue: null,
};

const message = (id: number, more: Partial<MailMessageDetail> = {}): MailMessageDetail => ({
  id,
  thread_id: 't1',
  direction: 'received',
  from_name: 'Ann Lee',
  from_address: 'ann@pizzahut.com',
  to: [],
  cc: [],
  bcc: [],
  labels: [RENEWALS],
  has_attachments: false,
  subject: 'Renewal quote',
  snippet: '',
  sent_at: `2026-10-0${id}T09:00:00Z`,
  folder: 'inbox',
  category: 'general',
  state: 'open',
  is_read: true,
  is_starred: false,
  is_important: false,
  priority: false,
  account: null,
  sync_issue: null,
  body: '',
  html_body: '',
  attachments: [],
  ...more,
});

const thread: MailThreadDetail = {
  thread_id: 't1',
  subject: 'Renewal quote',
  labels: [RENEWALS],
  account: null,
  sync_issue: null,
  truncated: false,
  messages: [message(1, { is_starred: true }), message(2), message(3, { is_read: false })],
};

describe('patchOfOp (contract §3)', () => {
  it.each([
    ['read', { is_read: true }],
    ['unread', { is_read: false }],
    ['star', { is_starred: true }],
    ['unstar', { is_starred: false }],
    ['archive', { state: 'done' }],
    ['inbox', { state: 'open' }],
    ['mute', { state: 'muted' }],
    ['unmute', { state: 'open' }],
    ['trash', { trashed: true }],
    ['untrash', { trashed: false }],
    ['spam', { spam: true }],
    ['not_spam', { spam: false }],
  ] as const)('%s is the PATCH %j', (op, patch) => {
    expect(patchOfOp(op, null)).toEqual(patch);
  });

  it('carries the label for label_add and label_remove', () => {
    expect(patchOfOp('label_add', 7)).toEqual({ add_labels: [7] });
    expect(patchOfOp('label_remove', 7)).toEqual({ remove_labels: [7] });
  });
});

describe('leavesView', () => {
  const inbox = { folder: 'inbox' as const, label: null };
  it('takes done, muted, deleted and spam out of the Inbox, and keeps read or starred', () => {
    expect(leavesView(inbox, { state: 'done' })).toBe(true);
    expect(leavesView(inbox, { state: 'muted' })).toBe(true);
    expect(leavesView(inbox, { trashed: true })).toBe(true);
    expect(leavesView(inbox, { spam: true })).toBe(true);
    expect(leavesView(inbox, { is_read: true })).toBe(false);
    expect(leavesView(inbox, { is_starred: true })).toBe(false);
  });

  it('takes restored mail out of Trash, not-spam out of Spam, and Inbox out of Done', () => {
    expect(leavesView({ folder: 'trash', label: null }, { trashed: false })).toBe(true);
    expect(leavesView({ folder: 'trash', label: null }, { trashed: true })).toBe(false);
    expect(leavesView({ folder: 'spam', label: null }, { spam: false })).toBe(true);
    expect(leavesView({ folder: 'done', label: null }, { state: 'open' })).toBe(true);
    expect(leavesView({ folder: 'muted', label: null }, { state: 'open' })).toBe(true);
  });

  it('takes an unstarred conversation out of Starred, and a removed label out of its view', () => {
    expect(leavesView({ folder: 'starred', label: null }, { is_starred: false })).toBe(true);
    expect(leavesView({ folder: 'all', label: 7 }, { remove_labels: [7] })).toBe(true);
    expect(leavesView({ folder: 'all', label: 7 }, { remove_labels: [9] })).toBe(false);
    expect(leavesView({ folder: 'all', label: 7 }, { state: 'done' })).toBe(false);
  });
});

describe('patchRow', () => {
  it('reads and unreads the whole conversation', () => {
    expect(patchRow(row, { is_read: true }, KNOWN)).toMatchObject({ is_read: true, unread_count: 0 });
    expect(patchRow({ ...row, is_read: true, unread_count: 0 }, { is_read: false }, KNOWN)).toMatchObject({ is_read: false, unread_count: 3 });
  });

  it('adds known labels by name order, removes others, and never touches the original', () => {
    const next = patchRow(row, { add_labels: [11, 12], remove_labels: [7] }, KNOWN);
    expect(next.labels.map((l) => l.name)).toEqual(['Pilot', 'Q4']);
    expect(next.labels[0].pending).toBe(true);
    expect(row.labels).toEqual([RENEWALS]);
  });

  it('ignores a label it does not know', () => {
    expect(patchRow(row, { add_labels: [99] }, KNOWN).labels).toEqual([RENEWALS]);
  });
});

describe('patchThread', () => {
  it('stars the newest message only, and unstars every one (contract decision 10)', () => {
    expect(patchThread(thread, { is_starred: true }, KNOWN).messages.map((m) => m.is_starred)).toEqual([true, false, true]);
    expect(patchThread(thread, { is_starred: false }, KNOWN).messages.map((m) => m.is_starred)).toEqual([false, false, false]);
  });

  it('reads every message, and labels the thread and each message', () => {
    const read = patchThread(thread, { is_read: true }, KNOWN);
    expect(read.messages.every((m) => m.is_read)).toBe(true);
    const labelled = patchThread(thread, { add_labels: [11] }, KNOWN);
    expect(labelled.labels.map((l) => l.name)).toEqual(['Q4', 'Renewals']);
    expect(labelled.messages.every((m) => m.labels.some((l) => l.id === 11))).toBe(true);
  });
});

describe('labelState', () => {
  it('is all, some or none over what holds the labels', () => {
    const holders = [{ labels: [RENEWALS] }, { labels: [RENEWALS, Q4] }];
    expect(labelState(holders, 7)).toBe('all');
    expect(labelState(holders, 11)).toBe('some');
    expect(labelState(holders, 12)).toBe('none');
    expect(labelState([], 7)).toBe('none');
  });
});
```

Create `src/features/mail/mailActionsText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { actionFailure, attachmentFailure, deletedMessages, mailActionGate, NO_MAILBOX_TEXT, TWO_WAY_OFF_TEXT } from './mailText';
import { GOOGLE, OUTLOOK } from './testMail';

// Unit tier: two-way Gmail D2's words and the action gate (contract §3, §10).

describe('mailActionGate (contract §10)', () => {
  it('lets a live two-way Gmail do everything', () => {
    expect(mailActionGate(GOOGLE, null)).toEqual({ gmail: true, blocked: null, reconnect: false });
  });

  it('turns actions off on a read-only Gmail, with the reconnect sentence', () => {
    expect(mailActionGate({ ...GOOGLE, two_way: false }, null)).toEqual({ gmail: true, blocked: TWO_WAY_OFF_TEXT, reconnect: true });
  });

  it('turns actions off on a paused Gmail, with the paused sentence; a revoked one reconnects', () => {
    expect(mailActionGate({ ...GOOGLE, paused_reason: 'no_seat' }, null)).toMatchObject({ gmail: true, reconnect: false, blocked: expect.stringContaining('seat') });
    expect(mailActionGate({ ...GOOGLE, paused_reason: 'token_revoked' }, null)).toMatchObject({ reconnect: true });
  });

  it('keeps a disconnected Gmail read-only, and hides Gmail actions for Outlook', () => {
    const gone = { provider: 'google' as const, address: 'dana@doughco.com', disconnected_at: '2026-10-10T10:00:00Z', delete_after: '2026-11-09T10:00:00Z' };
    expect(mailActionGate(null, gone)).toEqual({ gmail: true, blocked: NO_MAILBOX_TEXT, reconnect: true });
    expect(mailActionGate(OUTLOOK, null)).toEqual({ gmail: false, blocked: null, reconnect: false });
    expect(mailActionGate(null, null)).toEqual({ gmail: false, blocked: null, reconnect: false });
  });
});

describe('actionFailure', () => {
  it('gives a paused refusal its next step, and a revoked one the reconnect link', () => {
    const paused = new ApiError(409, { code: 'MAILBOX_PAUSED', detail: 'Your Gmail connection is paused: you no longer hold a seat.', paused_reason: 'no_seat' }, 'x');
    expect(actionFailure(paused, 'fallback')).toEqual({ text: 'Your Gmail connection is paused: you no longer hold a seat. Ask an admin for a seat.', reconnect: false, code: 'MAILBOX_PAUSED' });
    const revoked = new ApiError(409, { code: 'MAILBOX_PAUSED', detail: 'Paused.', paused_reason: 'token_revoked' }, 'x');
    expect(actionFailure(revoked, 'fallback').reconnect).toBe(true);
  });

  it('keeps the server words for TWO_WAY_OFF, NO_MAILBOX, GMAIL_ONLY and TOO_MANY', () => {
    expect(actionFailure(new ApiError(409, { code: 'TWO_WAY_OFF' }, TWO_WAY_OFF_TEXT), 'f')).toEqual({ text: TWO_WAY_OFF_TEXT, reconnect: true, code: 'TWO_WAY_OFF' });
    expect(actionFailure(new ApiError(409, { code: 'NO_MAILBOX' }, NO_MAILBOX_TEXT), 'f')).toEqual({ text: NO_MAILBOX_TEXT, reconnect: true, code: 'NO_MAILBOX' });
    expect(actionFailure(new ApiError(400, { code: 'GMAIL_ONLY' }, 'Only Gmail mailboxes have this.'), 'f')).toEqual({ text: 'Only Gmail mailboxes have this.', reconnect: false, code: 'GMAIL_ONLY' });
    expect(actionFailure(new ApiError(400, { code: 'TOO_MANY' }, 'Select fewer conversations: at most 1,000 messages at a time.'), 'f').text).toBe('Select fewer conversations: at most 1,000 messages at a time.');
  });

  it('falls back when nothing came from the server', () => {
    expect(actionFailure(new TypeError('offline'), 'Could not update the conversation.')).toEqual({ text: 'Could not update the conversation.', reconnect: false, code: null });
  });
});

describe('the other D2 sentences', () => {
  it('counts deleted messages', () => {
    expect(deletedMessages(1)).toBe('1 deleted message');
    expect(deletedMessages(3)).toBe('3 deleted messages');
  });

  it("shows an attachment refusal in the server's words, else names the file", () => {
    expect(attachmentFailure(new ApiError(413, { code: 'ATTACHMENT_TOO_LARGE' }, 'This file is too large to open here. Open it in Gmail.'), 'Pricing.zip')).toBe('This file is too large to open here. Open it in Gmail.');
    expect(attachmentFailure(new TypeError('offline'), 'Pricing.zip')).toBe("Couldn't open Pricing.zip.");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/features/mail/mailOptimistic.test.ts src/features/mail/mailActionsText.test.ts --maxWorkers=2`
Expected: FAIL: `Failed to resolve import "./mailOptimistic"` and `mailActionGate is not a function` (or "does not provide an export named").

- [ ] **Step 3: Add the types**

In `src/features/mail/mailboxSlice.ts`:

Replace

```ts
export type MailFolder = 'inbox' | 'drafts' | 'sent' | 'done' | 'muted' | 'spam' | 'trash' | 'starred' | 'important';
```

with

```ts
/** `all` is everything outside Spam and Trash (contract D2 decision 18). */
export type MailFolder = 'inbox' | 'all' | 'drafts' | 'sent' | 'done' | 'muted' | 'spam' | 'trash' | 'starred' | 'important';
```

Replace the whole `MailLabel` and `MailAttachmentMeta` declarations (from `/** A Gmail user label, resolved by the server` to the closing `}` of `MailAttachmentMeta`) with:

```ts
/** A Gmail user label, resolved by the server (contract §6). `id` is
 *  Revenact's MailLabel id; `color` is Gmail's pair, or null. */
export interface MailLabel {
  id: number;
  name: string;
  color: { background: string; text: string } | null;
  /** Made here and not yet created in Gmail (D2 contract decision 21). */
  pending: boolean;
}

/** One row of `GET mail/labels/` (D2 contract §4): the sidebar's label with
 *  its unread conversations. `gmail_id` is null while pending. */
export interface MailLabelEntry extends MailLabel {
  gmail_id: string | null;
  unread: number;
}

/** A change that did not reach Gmail (D2 contract §5), already a sentence. */
export interface SyncIssue {
  text: string;
  at: string;
}

/** One MIME part's details (D1 §6) and, from D2, how to open it (D2 §6). */
export interface MailAttachmentMeta {
  id: number;
  filename: string;
  mime_type: string;
  size: number;
  is_inline: boolean;
  content_id: string;
  /** Cached, or its Google mailbox is connected and not paused. */
  available: boolean;
  /** Served inline (PNG, JPEG, GIF, WebP, PDF): it opens in the viewer. */
  preview: boolean;
  /** `/api/v1/mail/attachments/<id>/download/`; null when not available. */
  download_url: string | null;
}
```

In `interface MailMessage`, after `  account: MailAccount | null;` add:

```ts
  /** The newest change that did not reach Gmail, or null (D2 contract §5). */
  sync_issue: SyncIssue | null;
```

After the `MailPage` interface add:

```ts
export interface MailParticipant {
  name: string;
  address: string;
}

/** One conversation in the list (D2 contract §2). `id` is the newest
 *  matching message's id: the handle for `mail/messages/<id>/thread/`. */
export interface MailThread {
  id: number;
  thread_id: string;
  subject: string;
  snippet: string;
  last_sent_at: string;
  message_count: number;
  unread_count: number;
  /** Distinct senders, oldest first, up to 3; recipients for a Sent or Drafts row. */
  participants: MailParticipant[];
  more_participants: number;
  is_read: boolean;
  is_starred: boolean;
  is_important: boolean;
  priority: boolean;
  state: MailState;
  folder: MailMessage['folder'];
  has_attachments: boolean;
  labels: MailLabel[];
  account: MailAccount | null;
  sync_issue: SyncIssue | null;
  /** Client only: a Sent or Drafts message as a row (Decision 1); the title reads "To <who>". */
  sent?: boolean;
}

export interface MailThreadPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: MailThread[];
}

/** `GET mail/messages/<id>/thread/` (D2 contract §2): messages oldest first. */
export interface MailThreadDetail {
  thread_id: string;
  subject: string;
  labels: MailLabel[];
  account: MailAccount | null;
  sync_issue: SyncIssue | null;
  /** More than 100 messages: the oldest are only in Gmail. */
  truncated: boolean;
  messages: MailMessageDetail[];
}

/** A conversation PATCH (D2 contract §3); at most one of state, trashed and spam. */
export interface ThreadPatch {
  is_read?: boolean;
  is_starred?: boolean;
  state?: MailState;
  trashed?: boolean;
  spam?: boolean;
  add_labels?: number[];
  remove_labels?: number[];
}

/** `POST mail/actions/` ops (D2 contract §3). */
export type MailOp = 'read' | 'unread' | 'star' | 'unstar' | 'archive' | 'inbox' | 'trash' | 'untrash' | 'spam' | 'not_spam' | 'label_add' | 'label_remove' | 'mute' | 'unmute';

export interface BulkResult {
  op: MailOp;
  messages: number;
  threads: number;
  unchanged: number;
}
```

- [ ] **Step 4: Write the optimistic rules**

Create `src/features/mail/mailOptimistic.ts`:

```ts
// What an action does to the screen before the server answers (two-way
// Gmail D2, contract §3): the same changes Gmail will see, applied to a list
// row and to the open conversation, and whether the row leaves the view it
// is listed in. Pure: the slice applies these and keeps the before-values
// so a refusal can put them back (Decision 3).

import type { MailFolder, MailLabel, MailOp, MailThread, MailThreadDetail, ThreadPatch } from './mailboxSlice';

/** The bulk op as the conversation PATCH that means the same (contract §3). */
export function patchOfOp(op: MailOp, labelId: number | null): ThreadPatch {
  switch (op) {
    case 'read':
      return { is_read: true };
    case 'unread':
      return { is_read: false };
    case 'star':
      return { is_starred: true };
    case 'unstar':
      return { is_starred: false };
    case 'archive':
      return { state: 'done' };
    case 'inbox':
    case 'unmute':
      return { state: 'open' };
    case 'mute':
      return { state: 'muted' };
    case 'trash':
      return { trashed: true };
    case 'untrash':
      return { trashed: false };
    case 'spam':
      return { spam: true };
    case 'not_spam':
      return { spam: false };
    case 'label_add':
      return { add_labels: labelId === null ? [] : [labelId] };
    case 'label_remove':
      return { remove_labels: labelId === null ? [] : [labelId] };
  }
}

/** Whether a change takes a conversation out of the view it is listed in. */
export function leavesView({ folder, label }: { folder: MailFolder; label: number | null }, patch: ThreadPatch): boolean {
  if (label !== null && patch.remove_labels?.includes(label)) return true;
  if (patch.trashed !== undefined) return folder === 'trash' ? !patch.trashed : patch.trashed;
  if (patch.spam !== undefined) return folder === 'spam' ? !patch.spam : patch.spam;
  if (patch.state !== undefined) {
    if (folder === 'inbox') return patch.state !== 'open';
    if (folder === 'done' || folder === 'muted') return patch.state !== folder;
    return false;
  }
  return folder === 'starred' && patch.is_starred === false;
}

/** Labels after a change, by name; a label is added only when it is known. */
function labelsAfter(labels: readonly MailLabel[], patch: ThreadPatch, known: readonly MailLabel[]): MailLabel[] {
  const removed = new Set(patch.remove_labels ?? []);
  const kept = labels.filter((label) => !removed.has(label.id));
  for (const id of patch.add_labels ?? []) {
    if (kept.some((label) => label.id === id)) continue;
    const label = known.find((candidate) => candidate.id === id);
    if (label) kept.push({ id: label.id, name: label.name, color: label.color ? { ...label.color } : null, pending: label.pending });
  }
  return kept.sort((a, b) => a.name.localeCompare(b.name));
}

/** A list row after a change. Read and unread apply to every message. */
export function patchRow(row: MailThread, patch: ThreadPatch, known: readonly MailLabel[]): MailThread {
  const next: MailThread = { ...row };
  if (patch.is_read !== undefined) {
    next.is_read = patch.is_read;
    next.unread_count = patch.is_read ? 0 : row.message_count;
  }
  if (patch.is_starred !== undefined) next.is_starred = patch.is_starred;
  if (patch.state !== undefined) next.state = patch.state;
  if (patch.add_labels || patch.remove_labels) next.labels = labelsAfter(row.labels, patch, known);
  return next;
}

/** The open conversation after a change. Starring stars the newest message
 *  only; unstarring unstars them all (contract decision 10). */
export function patchThread(thread: MailThreadDetail, patch: ThreadPatch, known: readonly MailLabel[]): MailThreadDetail {
  const newest = thread.messages.length - 1;
  const labelled = Boolean(patch.add_labels || patch.remove_labels);
  return {
    ...thread,
    labels: labelled ? labelsAfter(thread.labels, patch, known) : thread.labels,
    messages: thread.messages.map((message, index) => {
      const next = { ...message };
      if (patch.is_read !== undefined) next.is_read = patch.is_read;
      if (patch.is_starred !== undefined) next.is_starred = patch.is_starred ? index === newest || message.is_starred : false;
      if (patch.state !== undefined) next.state = patch.state;
      if (labelled) next.labels = labelsAfter(message.labels, patch, known);
      return next;
    }),
  };
}

export type LabelState = 'all' | 'some' | 'none';

/** A label on every one of these, some of them, or none: the label menu's box. */
export function labelState(holders: readonly { labels: readonly MailLabel[] }[], id: number): LabelState {
  const having = holders.filter((holder) => holder.labels.some((label) => label.id === id)).length;
  if (having === 0) return 'none';
  return having === holders.length ? 'all' : 'some';
}
```

- [ ] **Step 5: Add the words and the gate**

Append to `src/features/mail/mailText.ts`:

```ts
// Two-way Gmail, delivery 2 (contract revenact-backend
// docs/superpowers/plans/2026-10-11-gmail-actions-api.md).

/** Contract §3 check 6, verbatim: shown before anyone tries, as the server would answer. */
export const TWO_WAY_OFF_TEXT = "Reconnect Google to turn on two-way: changes here can't reach Gmail yet.";

/** Contract §3 check 4, verbatim. */
export const NO_MAILBOX_TEXT = "This message's mailbox is no longer connected.";

/** Which mail actions this mailbox offers (contract §10, Decision 5). */
export interface MailActionGate {
  /** Gmail's own actions (delete, restore, spam, labels) are shown. */
  gmail: boolean;
  /** Why every action but Mute and Unmute is off; null when they work. */
  blocked: string | null;
  /** The reason comes with Open Connections. */
  reconnect: boolean;
}

export function mailActionGate(
  connection: Pick<MailboxConnection, 'provider' | 'two_way' | 'paused_reason'> | null,
  disconnected: Pick<DisconnectedMailbox, 'provider'> | null,
): MailActionGate {
  if (!connection) {
    if (!disconnected) return { gmail: false, blocked: null, reconnect: false };
    return { gmail: disconnected.provider === 'google', blocked: NO_MAILBOX_TEXT, reconnect: true };
  }
  if (connection.provider !== 'google') return { gmail: false, blocked: null, reconnect: false };
  if (connection.paused_reason) return { gmail: true, blocked: pausedNotice(connection.paused_reason), reconnect: connection.paused_reason === 'token_revoked' };
  if (!connection.two_way) return { gmail: true, blocked: TWO_WAY_OFF_TEXT, reconnect: true };
  return { gmail: true, blocked: null, reconnect: false };
}

/** Why an action did not take, in the server's words, and whether the way
 *  out is Settings › Connections. `code` lets the screen read the mailbox again. */
export interface ActionFailure {
  text: string;
  reconnect: boolean;
  code: string | null;
}

const RECONNECT_CODES = new Set(['TWO_WAY_OFF', 'NO_MAILBOX']);

export function actionFailure(err: unknown, fallback: string): ActionFailure {
  if (!(err instanceof ApiError)) return { text: fallback, reconnect: false, code: null };
  const body: Record<string, unknown> = isRecord(err.body) ? err.body : {};
  const code = typeof body.code === 'string' ? body.code : null;
  const paused = pausedSendMessage(err);
  if (paused) return { text: paused, reconnect: body.paused_reason === 'token_revoked', code };
  return { text: err.message, reconnect: code !== null && RECONNECT_CODES.has(code), code };
}

/** A label made here, before Gmail has it (contract decision 21). */
export const LABEL_PENDING = 'Not in Gmail yet';

/** Over `MAIL_THREAD_MAX_MESSAGES`: the thread payload says `truncated`. */
export const OLDER_IN_GMAIL = 'Older messages in this conversation are only in Gmail.';

export function deletedMessages(n: number): string {
  return n === 1 ? '1 deleted message' : `${count(n)} deleted messages`;
}

/** An attachment chip that cannot be opened (`available: false`). */
export const ATTACHMENT_UNAVAILABLE = "Not available here: this file hasn't been fetched from Gmail and its mailbox isn't connected.";

/** The PDF viewer's fallback where the browser shows no PDFs inline. */
export const PDF_UNSHOWN = "This browser can't show the PDF here: use Download.";

/** A failed open or download: the server's words (413, 409, 410, 503), else the file's name. */
export function attachmentFailure(err: unknown, name: string): string {
  return err instanceof ApiError ? err.message : `Couldn't open ${name}.`;
}
```

`count` and `isRecord` already exist in this file (D1); `isRecord` is declared below the D1 paused helpers, before these lines, so it is in scope.

- [ ] **Step 6: Keep the fixtures typed**

In `src/features/mail/testMail.ts`, in `MAIL_DETAIL`:
- replace the `labels` array with:

```ts
  labels: [
    { id: 7, name: 'Renewals', color: { background: '#16a766', text: '#ffffff' }, pending: false },
    { id: 9, name: 'Vendors/Billing', color: null, pending: false },
    { id: 11, name: 'Q4', color: null, pending: false },
  ],
```

- after `account: { id: 3, name: 'Pizza Hut', type: 'customer' },` add `  sync_issue: null,`
- replace the `attachments` array with:

```ts
  attachments: [
    { id: 31, filename: 'Renewal quote.pdf', mime_type: 'application/pdf', size: 182311, is_inline: false, content_id: '', available: true, preview: true, download_url: '/api/v1/mail/attachments/31/download/' },
    { id: 32, filename: 'logo.png', mime_type: 'image/png', size: 2048, is_inline: true, content_id: 'logo@pizzahut', available: true, preview: true, download_url: '/api/v1/mail/attachments/32/download/' },
  ],
```

In `src/pages/communications/MailboxView.test.tsx`, replace

```ts
  priority: false,
  account: null,
};
```

with

```ts
  priority: false,
  account: null,
  sync_issue: null,
};
```

In `src/pages/communications/MailLabels.test.tsx`, replace `[{ id: 1, name: 'Odd', color: { background: 'red;position:fixed', text: '' } }]` with `[{ id: 1, name: 'Odd', color: { background: 'red;position:fixed', text: '' }, pending: false }]`.

In `src/pages/communications/MailboxView.tsx`, replace `  inbox: 'Inbox',` inside `FOLDER_TITLE` with:

```ts
  inbox: 'Inbox',
  all: 'All mail',
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run src/features/mail src/pages/communications --maxWorkers=2`
Expected: PASS (every file, D1's included).

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/features/mail/mailboxSlice.ts src/features/mail/mailOptimistic.ts src/features/mail/mailOptimistic.test.ts src/features/mail/mailText.ts src/features/mail/mailActionsText.test.ts src/features/mail/testMail.ts src/pages/communications/MailboxView.tsx src/pages/communications/MailboxView.test.tsx src/pages/communications/MailLabels.test.tsx
git commit -m "feat(mail): d2 types, action gate and optimistic rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The mailbox slice: conversations, actions, bulk and labels

**Files:**
- Modify: `src/features/mail/mailboxSlice.ts`
- Modify: `src/features/mail/testMail.ts` (D2 fixtures and stub routes)
- Test: `src/features/mail/mailboxSlice.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `patchOfOp`, `leavesView`, `patchRow`, `patchThread`, `actionFailure`, `ActionFailure`, `TWO_WAY_OFF_TEXT`, `NO_MAILBOX_TEXT`.
- Produces (`mailboxSlice.ts`): `MailQuery` gains `label: number | null`; `MESSAGE_FOLDERS`; `buildListPath(query: MailQuery): string`; `rowOfMessage(m: MailMessage): MailThread`; thunks `fetchMailList(query: MailQuery)`, `loadMoreList(next: string)`, `fetchThread(id: number)`, `updateThread({ id: number; patch: ThreadPatch })` (rejects with `ActionFailure`), `bulkMailAction({ op: MailOp; ids: number[]; labelId?: number })` (rejects with `ActionFailure`), `fetchMailLabels()`, `createMailLabel(name: string)` (fulfils `{ id: number; label: MailLabelEntry | null }`, rejects with `ActionFailure`); actions `setMailLabel(id: number)`, `selectThread(id: number | null)`, `toggleChecked(id: number)`, `setChecked(ids: number[])`, `clearMailActionError()`; state `list`, `thread`, `threadLoading`, `threadError`, `labels`, `checked`, `actionError`, `bulkBusy`, `undo`. D1's list and detail pieces stay, fenced by `// D1 (Task 3 removes)` and `// end D1`, until Task 3 switches the view.
- Produces (`testMail.ts`): `MAIL_EARLIER`, `MAIL_INVOICE`, `D2_MESSAGES`, `MAIL_LABELS`, `threadRowOf(m: MailMessage, more?: Partial<MailThread>): MailThread`, `threadOf(messages: MailMessageDetail[]): MailThreadDetail`; `MailStubState` gains `labels`, `failNext`, `attachmentRefusals`; the stub serves `GET mail/threads/`, `GET|PATCH mail/messages/<id>/thread/`, `POST mail/actions/`, `GET|POST mail/labels/`, `GET mail/attachments/<id>/download/`, and `GET mail/messages/?folder=` filtered.

- [ ] **Step 1: Write the failing test**

Create `src/features/mail/mailboxSlice.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import mailboxReducer, {
  buildListPath,
  bulkMailAction,
  createMailLabel,
  fetchMailLabels,
  fetchMailList,
  fetchThread,
  rowOfMessage,
  selectThread,
  setMailLabel,
  toggleChecked,
  updateThread,
} from './mailboxSlice';
import type { MailQuery } from './mailboxSlice';
import { D2_MESSAGES, MAIL_EARLIER, stubMail } from './testMail';
import { TWO_WAY_OFF_TEXT } from './mailText';
import { calls, sent } from '../agents/testAgents';

// Integration tier: the slice's thunks against the contract-shaped stub
// (D2 contract §2 to §4), the store real, only fetch stubbed.

afterEach(() => {
  vi.unstubAllGlobals();
});

const INBOX: MailQuery = { folder: 'inbox', label: null, category: null, unread: false, priority: false };
const makeStore = () => configureStore({ reducer: { mailbox: mailboxReducer } });

describe('buildListPath and rowOfMessage (Decision 1)', () => {
  it('lists conversations, and Sent and Drafts as messages', () => {
    expect(buildListPath(INBOX)).toBe('/mail/threads/');
    expect(buildListPath({ ...INBOX, folder: 'all', label: 7 })).toBe('/mail/threads/?folder=all&label=7');
    expect(buildListPath({ ...INBOX, category: 'financial', unread: true })).toBe('/mail/threads/?category=financial&unread=true');
    expect(buildListPath({ ...INBOX, folder: 'sent' })).toBe('/mail/messages/?folder=sent');
    expect(buildListPath({ ...INBOX, folder: 'drafts' })).toBe('/mail/messages/?folder=drafts');
  });

  it('reads a sent message as a row addressed to its recipients', () => {
    expect(rowOfMessage(MAIL_EARLIER)).toMatchObject({
      id: 3,
      sent: true,
      message_count: 1,
      unread_count: 0,
      last_sent_at: MAIL_EARLIER.sent_at,
      participants: [{ name: 'Ann Lee', address: 'ann@pizzahut.com' }],
    });
  });
});

describe('mailbox slice against the stub', () => {
  it('reads conversations, then one conversation oldest first', async () => {
    stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    await store.dispatch(fetchMailList(INBOX));
    const rows = store.getState().mailbox.list!.results;
    expect(rows.map((r) => r.id)).toEqual([1, 4]);
    expect(rows[0]).toMatchObject({ message_count: 2, unread_count: 1, participants: [{ name: 'Dana Ruiz' }, { name: 'Ann Lee' }] });
    store.dispatch(selectThread(1));
    await store.dispatch(fetchThread(1));
    expect(store.getState().mailbox.thread!.messages.map((m) => m.id)).toEqual([3, 1]);
  });

  it('marks a conversation read before the server answers, and forgets the undo after', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    await store.dispatch(fetchMailList(INBOX));
    const pending = store.dispatch(updateThread({ id: 1, patch: { is_read: true } }));
    expect(store.getState().mailbox.list!.results[0]).toMatchObject({ is_read: true, unread_count: 0 });
    await pending;
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ is_read: true }]);
    expect(store.getState().mailbox.undo).toEqual({});
  });

  it('takes an archived conversation out of the Inbox at once, and puts it back where it was when refused', async () => {
    const { state } = stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    await store.dispatch(fetchMailList(INBOX));
    state.failNext = { status: 409, body: { code: 'TWO_WAY_OFF', detail: TWO_WAY_OFF_TEXT, needs_reconnect: true } };
    const pending = store.dispatch(updateThread({ id: 1, patch: { state: 'done' } }));
    expect(store.getState().mailbox.list!.results.map((r) => r.id)).toEqual([4]);
    expect(store.getState().mailbox.list!.count).toBe(1);
    await pending;
    expect(store.getState().mailbox.list!.results.map((r) => r.id)).toEqual([1, 4]);
    expect(store.getState().mailbox.list!.count).toBe(2);
    expect(store.getState().mailbox.actionError).toEqual({ text: TWO_WAY_OFF_TEXT, reconnect: true, code: 'TWO_WAY_OFF' });
  });

  it('stars only the newest message of the open conversation (contract decision 10)', async () => {
    stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    store.dispatch(selectThread(1));
    await store.dispatch(fetchThread(1));
    const pending = store.dispatch(updateThread({ id: 1, patch: { is_starred: true } }));
    expect(store.getState().mailbox.thread!.messages.map((m) => m.is_starred)).toEqual([false, true]);
    await pending;
    expect(store.getState().mailbox.thread!.messages.map((m) => m.is_starred)).toEqual([false, true]);
  });

  it('sends a bulk action as thread_of, applies it at once and clears the ticks', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    await store.dispatch(fetchMailList(INBOX));
    store.dispatch(toggleChecked(1));
    store.dispatch(toggleChecked(4));
    const pending = store.dispatch(bulkMailAction({ op: 'trash', ids: [1, 4] }));
    expect(store.getState().mailbox.list!.results).toEqual([]);
    expect(store.getState().mailbox.bulkBusy).toBe(true);
    await pending;
    expect(sent(spy, 'POST', '/mail/actions/')).toEqual([{ op: 'trash', thread_of: [1, 4] }]);
    expect(store.getState().mailbox.checked).toEqual([]);
    expect(store.getState().mailbox.bulkBusy).toBe(false);
  });

  it('opens a label view on folder=all&label=, and reads the labels with their unread counts', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = makeStore();
    store.dispatch(setMailLabel(7));
    const { folder, label, category, unread, priority } = store.getState().mailbox;
    expect([folder, label]).toEqual(['all', 7]);
    await store.dispatch(fetchMailList({ folder, label, category, unread, priority }));
    expect(calls(spy, 'GET', '/mail/threads/')).toEqual(['/mail/threads/?folder=all&label=7']);
    expect(store.getState().mailbox.list!.results.map((r) => r.id)).toEqual([1]);
    await store.dispatch(fetchMailLabels());
    expect(store.getState().mailbox.labels.find((l) => l.id === 7)).toMatchObject({ name: 'Renewals', unread: 1, pending: false });
  });

  it('creates a pending label; a name that exists answers with that label (LABEL_EXISTS)', async () => {
    stubMail();
    const store = makeStore();
    await store.dispatch(fetchMailLabels());
    const made = await store.dispatch(createMailLabel('Pilot'));
    expect(made.payload).toMatchObject({ id: 12, label: { name: 'Pilot', pending: true, gmail_id: null } });
    expect(store.getState().mailbox.labels.map((l) => l.name)).toEqual(['Pilot', 'Q4', 'Renewals', 'Vendors/Billing']);
    const again = await store.dispatch(createMailLabel('renewals'));
    expect(again.payload).toEqual({ id: 7, label: null });
  });

  it("refuses a blank label name in the server's words", async () => {
    stubMail();
    const store = makeStore();
    const refused = await store.dispatch(createMailLabel('   '));
    expect(refused.payload).toEqual({ text: 'Name the label.', reconnect: false, code: null });
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run src/features/mail/mailboxSlice.test.ts --maxWorkers=2`
Expected: FAIL: `buildListPath` (and the other new names) "is not a function" or "does not provide an export named".

- [ ] **Step 3: Grow the stub**

In `src/features/mail/testMail.ts`:

Replace the three import lines after `import { vi } from 'vitest';`

```ts
import { GATE_COPY } from './mailText';
import type { DisconnectedMailbox, GmailGate, MailboxConnection, MailProviderOption, PausedReason } from './mailSlice';
import type { MailMessage, MailMessageDetail, MailSummary } from './mailboxSlice';
```

with

```ts
import { GATE_COPY, NO_MAILBOX_TEXT, TWO_WAY_OFF_TEXT } from './mailText';
import { patchOfOp } from './mailOptimistic';
import type { DisconnectedMailbox, GmailGate, MailboxConnection, MailProviderOption, PausedReason } from './mailSlice';
import type { MailLabel, MailLabelEntry, MailMessage, MailMessageDetail, MailOp, MailSummary, MailThread, MailThreadDetail, ThreadPatch } from './mailboxSlice';
```

and in the file comment above them replace `docs/superpowers/plans/2026-10-10-gmail-sync-api.md). Tests change `state`` with `docs/superpowers/plans/2026-10-10-gmail-sync-api.md, and D2's 2026-10-11-gmail-actions-api.md). Tests change `state``.

After `export const MAIL_ROW: MailMessage = rowOf(MAIL_DETAIL);` add:

```ts
/** Your own earlier message in Ann's thread: D2's two-message conversation. */
export const MAIL_EARLIER: MailMessageDetail = {
  ...MAIL_DETAIL,
  id: 3,
  direction: 'sent',
  from_name: 'Dana Ruiz',
  from_address: 'dana@doughco.com',
  to: [['Ann Lee', 'ann@pizzahut.com']],
  cc: [],
  snippet: 'Could you send the renewal quote?',
  sent_at: '2026-10-08T15:00:00Z',
  folder: 'sent',
  is_read: true,
  labels: [],
  has_attachments: false,
  body: 'Hi Ann,\nCould you send the renewal quote?\nDana',
  html_body: '',
  attachments: [],
};

/** A second conversation, already read and on no record. */
export const MAIL_INVOICE: MailMessageDetail = {
  ...MAIL_DETAIL,
  id: 4,
  thread_id: 't2',
  from_name: 'Circleback',
  from_address: 'billing@circleback.ai',
  cc: [],
  subject: 'Invoice 1042',
  snippet: 'Your invoice is ready.',
  sent_at: '2026-10-07T08:00:00Z',
  category: 'financial',
  is_read: true,
  account: null,
  labels: [],
  has_attachments: false,
  body: 'Your invoice is ready.',
  html_body: '',
  attachments: [],
};

/** D2's mailbox: Ann's two-message thread (t1) and the invoice (t2). */
export const D2_MESSAGES: MailMessageDetail[] = [MAIL_EARLIER, MAIL_DETAIL, MAIL_INVOICE];

/** `GET mail/labels/` (D2 contract §4), by name. */
export const MAIL_LABELS: MailLabelEntry[] = [
  { id: 11, gmail_id: 'Label_14', name: 'Q4', color: null, unread: 0, pending: false },
  { id: 7, gmail_id: 'Label_12', name: 'Renewals', color: { background: '#16a766', text: '#ffffff' }, unread: 1, pending: false },
  { id: 9, gmail_id: 'Label_13', name: 'Vendors/Billing', color: null, unread: 1, pending: false },
];

const byName = (a: MailLabel, b: MailLabel) => a.name.localeCompare(b.name);
const bySent = (a: MailMessage, b: MailMessage) => a.sent_at.localeCompare(b.sent_at);

/** A conversation row for one message, as the server would list it alone (D2 §2). */
export function threadRowOf(m: MailMessage, more: Partial<MailThread> = {}): MailThread {
  return {
    id: m.id,
    thread_id: m.thread_id,
    subject: m.subject,
    snippet: m.snippet,
    last_sent_at: m.sent_at,
    message_count: 1,
    unread_count: m.is_read ? 0 : 1,
    participants: [{ name: m.from_name, address: m.from_address }],
    more_participants: 0,
    is_read: m.is_read,
    is_starred: m.is_starred,
    is_important: m.is_important,
    priority: m.priority,
    state: m.state,
    folder: m.folder,
    has_attachments: m.has_attachments,
    labels: m.labels,
    account: m.account,
    sync_issue: m.sync_issue,
    ...more,
  };
}

function unionLabels(messages: MailMessage[]): MailLabel[] {
  const seen = new Map<number, MailLabel>();
  for (const m of messages) for (const label of m.labels) seen.set(label.id, label);
  return [...seen.values()].sort(byName);
}

/** The thread payload for the messages of one thread, oldest first (D2 §2). */
export function threadOf(messages: MailMessageDetail[]): MailThreadDetail {
  const ordered = [...messages].sort(bySent);
  const issues = ordered.map((m) => m.sync_issue).filter((issue) => issue !== null);
  return {
    thread_id: ordered[0].thread_id,
    subject: ordered[0].subject,
    labels: unionLabels(ordered),
    account: [...ordered].reverse().find((m) => m.account)?.account ?? null,
    sync_issue: issues.at(-1) ?? null,
    truncated: false,
    messages: ordered,
  };
}
```

Replace the `MailStubState` interface with:

```ts
export interface MailStubState {
  connection: MailboxConnection | null;
  disconnected: DisconnectedMailbox | null;
  providers: MailProviderOption[];
  /** A pre-OAuth refusal from POST mail/connect/google/ (403). */
  connectRefusal: GmailGate | null;
  messages: MailMessageDetail[];
  summary: MailSummary;
  labels: MailLabelEntry[];
  /** The next action (thread PATCH, bulk, label create) answers this instead. */
  failNext: { status: number; body: unknown } | null;
  /** Attachment downloads that answer this instead, by attachment id. */
  attachmentRefusals: Record<number, { status: number; body: unknown }>;
}
```

In `stubMail`, replace the `state` initialiser with (`copy(initial)` so a test's fixtures are never mutated):

```ts
  const state: MailStubState = {
    connection: copy(GOOGLE),
    disconnected: null,
    providers: copy(PROVIDERS),
    connectRefusal: null,
    messages: [copy(MAIL_DETAIL)],
    summary: copy(MAIL_SUMMARY),
    labels: copy(MAIL_LABELS),
    failNext: null,
    attachmentRefusals: {},
    ...copy(initial),
  };
```

After the `paused` helper inside `stubMail`, add:

```ts
  const mates = (anchor: MailMessageDetail) =>
    state.messages.filter((m) => (anchor.thread_id ? m.thread_id === anchor.thread_id : m.id === anchor.id)).sort(bySent);

  // GET mail/threads/ filters per message (D2 contract decision 17).
  const inView = (m: MailMessageDetail, params: URLSearchParams) => {
    const folder = params.get('folder') ?? 'inbox';
    const label = params.get('label');
    if (label && !m.labels.some((l) => l.id === Number(label))) return false;
    if (folder === 'inbox') return m.folder === 'inbox' && m.state === 'open';
    if (folder === 'all') return m.folder !== 'trash' && m.folder !== 'spam';
    if (folder === 'done' || folder === 'muted') return m.state === folder && m.folder !== 'trash' && m.folder !== 'spam';
    if (folder === 'starred') return m.is_starred;
    if (folder === 'important') return m.is_important;
    return m.folder === folder;
  };

  const threadRows = (params: URLSearchParams): MailThread[] => {
    const groups = new Map<string, MailMessageDetail[]>();
    for (const m of state.messages) {
      const key = m.thread_id || `m${m.id}`;
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    const binned = ['trash', 'spam'].includes(params.get('folder') ?? '');
    const rows: MailThread[] = [];
    for (const group of groups.values()) {
      const ordered = [...group].sort(bySent);
      const matching = ordered.filter((m) => inView(m, params));
      if (matching.length === 0) continue;
      const counted = binned ? ordered : ordered.filter((m) => m.folder !== 'trash' && m.folder !== 'spam');
      const senders = new Map<string, { name: string; address: string }>();
      for (const m of ordered) senders.set(m.from_address, { name: m.from_name, address: m.from_address });
      rows.push(
        threadRowOf(matching[matching.length - 1], {
          message_count: counted.length,
          unread_count: counted.filter((m) => !m.is_read).length,
          participants: [...senders.values()],
          is_read: counted.every((m) => m.is_read),
          is_starred: counted.some((m) => m.is_starred),
          has_attachments: ordered.some((m) => m.has_attachments),
          labels: unionLabels(ordered),
          sync_issue: threadOf(ordered).sync_issue,
        }),
      );
    }
    return rows.sort((a, b) => b.last_sent_at.localeCompare(a.last_sent_at));
  };

  // Contract §3 checks 4 to 6 for a request that writes to Gmail, after the injected failure.
  const refuse = (writes: boolean) => {
    if (state.failNext) {
      const { status, body } = state.failNext;
      state.failNext = null;
      return json(status, body);
    }
    if (!writes) return null;
    const c = state.connection;
    if (!c) return json(409, { code: 'NO_MAILBOX', detail: NO_MAILBOX_TEXT });
    if (c.provider !== 'google') return null;
    return paused() ?? (c.two_way ? null : json(409, { code: 'TWO_WAY_OFF', detail: TWO_WAY_OFF_TEXT, needs_reconnect: true }));
  };

  const labelOf = (id: number): MailLabel | null => {
    const l = state.labels.find((x) => x.id === id);
    return l ? { id: l.id, name: l.name, color: l.color, pending: l.pending } : null;
  };

  const applyPatch = (group: MailMessageDetail[], patch: ThreadPatch) => {
    const removed = patch.remove_labels;
    group.forEach((m, index) => {
      if (patch.is_read !== undefined) m.is_read = patch.is_read;
      if (patch.is_starred !== undefined) m.is_starred = patch.is_starred ? index === group.length - 1 || m.is_starred : false;
      if (patch.state !== undefined) m.state = patch.state;
      if (patch.trashed !== undefined) m.folder = patch.trashed ? 'trash' : m.direction === 'sent' ? 'sent' : 'inbox';
      if (patch.spam !== undefined) m.folder = patch.spam ? 'spam' : 'inbox';
      for (const id of patch.add_labels ?? []) {
        const label = labelOf(id);
        if (label && !m.labels.some((l) => l.id === id)) m.labels = [...m.labels, label].sort(byName);
      }
      if (removed) m.labels = m.labels.filter((l) => !removed.includes(l.id));
    });
  };

  // A mute alone never writes to Gmail (contract §3).
  const writesGmail = (patch: ThreadPatch) => !(Object.keys(patch).length === 1 && patch.state === 'muted');
```

Inside the `spy` handler, directly before `if (path === '/mail/messages/summary/') return json(200, state.summary);`, add:

```ts
    if (path === '/mail/labels/' && method === 'GET') return json(200, state.labels);
    if (path === '/mail/labels/' && method === 'POST') {
      const failed = refuse(true);
      if (failed) return failed;
      const name = String((JSON.parse(String(init?.body ?? '{}')) as { name?: string }).name ?? '').trim();
      if (!name) return json(400, { name: ['Name the label.'] });
      const existing = state.labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (existing) return json(409, { code: 'LABEL_EXISTS', detail: `You already have a label called ${existing.name}.`, label_id: existing.id });
      const label: MailLabelEntry = { id: Math.max(0, ...state.labels.map((l) => l.id)) + 1, gmail_id: null, name, color: null, unread: 0, pending: true };
      state.labels = [...state.labels, label].sort(byName);
      return json(201, label);
    }
    if (path === '/mail/threads/' && method === 'GET') {
      const results = threadRows(url.searchParams);
      return json(200, { count: results.length, next: null, previous: null, results });
    }
    const thread = /^\/mail\/messages\/(\d+)\/thread\/$/.exec(path);
    if (thread) {
      const anchor = state.messages.find((m) => m.id === Number(thread[1]));
      if (!anchor) return json(404, { detail: 'Not found.' });
      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body ?? '{}')) as ThreadPatch;
        const failed = refuse(writesGmail(patch));
        if (failed) return failed;
        applyPatch(mates(anchor), patch);
      }
      return json(200, threadOf(mates(anchor)));
    }
    if (path === '/mail/actions/' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { op: MailOp; thread_of: number[]; label_id?: number };
      const failed = refuse(body.op !== 'mute' && body.op !== 'unmute');
      if (failed) return failed;
      const anchors = body.thread_of.map((id) => state.messages.find((m) => m.id === id));
      if (anchors.some((a) => a === undefined)) return json(404, { detail: 'Not found.' });
      const patch = patchOfOp(body.op, body.label_id ?? null);
      let messages = 0;
      for (const anchor of anchors as MailMessageDetail[]) {
        const group = mates(anchor);
        applyPatch(group, patch);
        messages += group.length;
      }
      return json(200, { op: body.op, messages, threads: anchors.length, unchanged: 0 });
    }
    const download = /^\/mail\/attachments\/(\d+)\/download\/$/.exec(path);
    if (download) {
      const id = Number(download[1]);
      const refusal = state.attachmentRefusals[id];
      if (refusal) return json(refusal.status, refusal.body);
      const file = state.messages.flatMap((m) => m.attachments).find((a) => a.id === id);
      if (!file) return json(404, { detail: 'Not found.' });
      const type = file.preview ? file.mime_type : 'application/octet-stream';
      return Promise.resolve({ ok: true, status: 200, json: async () => null, blob: async () => new Blob([`bytes of ${file.filename}`], { type }) });
    }
```

Replace the existing list branch

```ts
    if (path === '/mail/messages/') {
      const results = state.messages.map(rowOf);
      return json(200, { count: results.length, next: null, previous: null, results });
    }
```

with

```ts
    if (path === '/mail/messages/') {
      const folder = url.searchParams.get('folder');
      const results = (folder ? state.messages.filter((m) => m.folder === folder) : state.messages).map(rowOf);
      return json(200, { count: results.length, next: null, previous: null, results });
    }
```

- [ ] **Step 4: Write the slice**

In `src/features/mail/mailboxSlice.ts`, replace the first five lines (the imports) with:

```ts
import { createAsyncThunk, createSlice, current } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { MailImport, PausedReason } from './mailSlice';
import { actionFailure, sendFailure, type ActionFailure } from './mailText';
import { leavesView, patchOfOp, patchRow, patchThread } from './mailOptimistic';
```

and in the file comment under them replace `the list, which refetches on every control,` with `the list (conversations from D2), which refetches on every control,`.

Then replace everything from `export interface MailQuery {` to the end of the file with:

```ts
export interface MailQuery {
  folder: MailFolder;
  /** A user label's id: the label view, where `folder` is `all` (D2 contract decision 18). */
  label: number | null;
  category: MailCategory | null;
  unread: boolean;
  priority: boolean;
}

/** One optimistic change's before-values (Decision 3). */
interface Undo {
  /** The list it was taken from: a restore never lands in another view. */
  path: string;
  rows: { index: number; row: MailThread }[];
  thread: MailThreadDetail | null;
}

interface MailboxState extends MailQuery {
  /** The conversations on screen (messages in Sent and Drafts, Decision 1). */
  list: MailThreadPage | null;
  loading: boolean;
  error: string | null;
  summary: MailSummary | null;
  /** The open conversation's handle: the row's id, or the bell's message id. */
  selectedId: number | null;
  thread: MailThreadDetail | null;
  threadLoading: boolean;
  /** Why the open conversation could not be read; lives in the reading pane. */
  threadError: string | null;
  /** Gmail user labels with their unread conversations; [] for Outlook and IMAP. */
  labels: MailLabelEntry[];
  /** Ticked conversations on this page, by handle (Decision 14). */
  checked: number[];
  /** Why the last action did not take, in the server's words. */
  actionError: ActionFailure | null;
  bulkBusy: boolean;
  /** Before-values by request id, put back if that request fails. */
  undo: Record<string, Undo>;
  loadingMore: boolean;
  replying: boolean;
  replyError: string | null;
  /** The id of the message whose reply just went out; the pane says so. */
  repliedId: number | null;
  // D1 (Task 3 removes)
  page: MailPage | null;
  detail: MailMessageDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  updateError: string | null;
  // end D1
}

const initialState: MailboxState = {
  folder: 'inbox',
  label: null,
  category: null,
  unread: false,
  priority: false,
  list: null,
  loading: false,
  error: null,
  summary: null,
  selectedId: null,
  thread: null,
  threadLoading: false,
  threadError: null,
  labels: [],
  checked: [],
  actionError: null,
  bulkBusy: false,
  undo: {},
  loadingMore: false,
  replying: false,
  replyError: null,
  repliedId: null,
  // D1 (Task 3 removes)
  page: null,
  detail: null,
  detailLoading: false,
  detailError: null,
  updateError: null,
  // end D1
};

/** Sent and Drafts read by recipient, which a conversation row does not
 *  carry, so they list messages (Decision 1). Every other view lists conversations. */
export const MESSAGE_FOLDERS: ReadonlySet<MailFolder> = new Set<MailFolder>(['sent', 'drafts']);

export function buildListPath({ folder, label, category, unread, priority }: MailQuery): string {
  const params = new URLSearchParams();
  if (folder !== 'inbox') params.set('folder', folder);
  if (label !== null) params.set('label', String(label));
  if (category) params.set('category', category);
  if (unread) params.set('unread', 'true');
  if (priority) params.set('priority', 'true');
  const base = MESSAGE_FOLDERS.has(folder) ? '/mail/messages/' : '/mail/threads/';
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** A Sent or Drafts message as a list row (Decision 1): its own conversation
 *  handle, addressed to its recipients. */
export function rowOfMessage(m: MailMessage): MailThread {
  const sent = m.direction === 'sent';
  return {
    id: m.id,
    thread_id: m.thread_id,
    subject: m.subject,
    snippet: m.snippet,
    last_sent_at: m.sent_at,
    message_count: 1,
    unread_count: m.is_read ? 0 : 1,
    participants: sent ? m.to.map(([name, address]) => ({ name, address })) : [{ name: m.from_name, address: m.from_address }],
    more_participants: 0,
    is_read: m.is_read,
    is_starred: m.is_starred,
    is_important: m.is_important,
    priority: m.priority,
    state: m.state,
    folder: m.folder,
    has_attachments: m.has_attachments,
    labels: m.labels,
    account: m.account,
    sync_issue: m.sync_issue,
    sent,
  };
}

/** A page from either list route, as rows. DRF's absolute `next` links go through untouched. */
async function readList(path: string): Promise<MailThreadPage> {
  if (path.includes('/mail/messages/')) {
    const page = await apiFetch<MailPage>(path);
    return { ...page, results: page.results.map(rowOfMessage) };
  }
  return apiFetch<MailThreadPage>(path);
}

function reason(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

const UPDATE_FAILED = 'Could not update the conversation.';
const BULK_FAILED = 'Could not change the selected conversations.';
const failed = (text: string): ActionFailure => ({ text, reconnect: false, code: null });

export const fetchMailList = createAsyncThunk<MailThreadPage, MailQuery, { rejectValue: string }>('mailbox/list', async (query, { rejectWithValue }) => {
  try {
    return await readList(buildListPath(query));
  } catch (err) {
    return rejectWithValue(reason(err, 'Could not load your mail.'));
  }
});

/** The next page, appended: month groups stay contiguous because the
 *  server orders by date and each page continues where the last stopped. */
export const loadMoreList = createAsyncThunk<MailThreadPage, string, { rejectValue: string }>('mailbox/listMore', async (next, { rejectWithValue }) => {
  try {
    return await readList(next);
  } catch (err) {
    return rejectWithValue(reason(err, 'Could not load more mail.'));
  }
});

export const fetchMailSummary = createAsyncThunk<MailSummary, void, { rejectValue: string }>('mailbox/summary', async (_, { rejectWithValue }) => {
  try {
    return await apiFetch<MailSummary>('/mail/messages/summary/');
  } catch (err) {
    return rejectWithValue(reason(err, 'Could not load your counts.'));
  }
});

/** The conversation holding message `id` (D2 contract §2). GET never marks it read. */
export const fetchThread = createAsyncThunk<MailThreadDetail, number, { rejectValue: string }>('mailbox/thread', async (id, { rejectWithValue }) => {
  try {
    return await apiFetch<MailThreadDetail>(`/mail/messages/${id}/thread/`);
  } catch (err) {
    return rejectWithValue(reason(err, 'Could not open the conversation.'));
  }
});

/** One conversation's change (D2 contract §3). The screen changes in the
 *  pending reducer; a refusal puts it back (Decision 3). */
export const updateThread = createAsyncThunk<MailThreadDetail, { id: number; patch: ThreadPatch }, { rejectValue: ActionFailure }>(
  'mailbox/updateThread',
  async ({ id, patch }, { rejectWithValue }) => {
    try {
      return await apiFetch<MailThreadDetail>(`/mail/messages/${id}/thread/`, { method: 'PATCH', body: patch });
    } catch (err) {
      return rejectWithValue(actionFailure(err, UPDATE_FAILED));
    }
  },
);

/** Many conversations at once (D2 contract §3, `POST mail/actions/`). */
export const bulkMailAction = createAsyncThunk<BulkResult, { op: MailOp; ids: number[]; labelId?: number }, { rejectValue: ActionFailure }>(
  'mailbox/bulk',
  async ({ op, ids, labelId }, { rejectWithValue }) => {
    try {
      const body = labelId === undefined ? { op, thread_of: ids } : { op, thread_of: ids, label_id: labelId };
      return await apiFetch<BulkResult>('/mail/actions/', { method: 'POST', body });
    } catch (err) {
      return rejectWithValue(actionFailure(err, BULK_FAILED));
    }
  },
);

export const fetchMailLabels = createAsyncThunk<MailLabelEntry[], void, { rejectValue: string }>('mailbox/labels', async (_, { rejectWithValue }) => {
  try {
    return await apiFetch<MailLabelEntry[]>('/mail/labels/');
  } catch (err) {
    return rejectWithValue(reason(err, 'Could not load your labels.'));
  }
});

/** A new label, pending until Gmail creates it (D2 contract §4). A name the
 *  mailbox already has answers 409 LABEL_EXISTS with its id: that label is
 *  the answer, so applying it still works (Decision 13). */
export const createMailLabel = createAsyncThunk<{ id: number; label: MailLabelEntry | null }, string, { rejectValue: ActionFailure }>(
  'mailbox/createLabel',
  async (name, { rejectWithValue }) => {
    try {
      const label = await apiFetch<MailLabelEntry>('/mail/labels/', { method: 'POST', body: { name } });
      return { id: label.id, label };
    } catch (err) {
      const body = err instanceof ApiError && err.status === 409 ? (err.body as { code?: unknown; label_id?: unknown } | null) : null;
      if (body?.code === 'LABEL_EXISTS' && typeof body.label_id === 'number') return { id: body.label_id, label: null };
      return rejectWithValue(actionFailure(err, 'Could not create the label.'));
    }
  },
);

export const replyToMailMessage = createAsyncThunk<MailMessageDetail, { id: number; body: string }, { rejectValue: string }>(
  'mailbox/reply',
  async ({ id, body }, { rejectWithValue }) => {
    try {
      return await apiFetch<MailMessageDetail>(`/mail/messages/${id}/reply/`, { method: 'POST', body: { body } });
    } catch (err) {
      return rejectWithValue(sendFailure(err, 'Could not send the reply.'));
    }
  },
);

// D1 (Task 3 removes)
export function buildMailQuery({ folder, category, unread, priority }: Omit<MailQuery, 'label'>): string {
  const params = new URLSearchParams();
  if (folder !== 'inbox') params.set('folder', folder);
  if (category) params.set('category', category);
  if (unread) params.set('unread', 'true');
  if (priority) params.set('priority', 'true');
  const query = params.toString();
  return query ? `/mail/messages/?${query}` : '/mail/messages/';
}

export const fetchMailMessages = createAsyncThunk<MailPage, Omit<MailQuery, 'label'>, { rejectValue: string }>('mailbox/fetch', async (query, { rejectWithValue }) => {
  try {
    return await apiFetch<MailPage>(buildMailQuery(query));
  } catch (err) {
    return rejectWithValue(reason(err, 'Could not load your mail.'));
  }
});

export const loadMoreMail = createAsyncThunk<MailPage, string, { rejectValue: string }>('mailbox/loadMore', async (next, { rejectWithValue }) => {
  try {
    return await apiFetch<MailPage>(next);
  } catch (err) {
    return rejectWithValue(reason(err, 'Could not load more mail.'));
  }
});

export const fetchMailMessage = createAsyncThunk<MailMessageDetail, number, { rejectValue: string }>('mailbox/detail', async (id, { rejectWithValue }) => {
  try {
    return await apiFetch<MailMessageDetail>(`/mail/messages/${id}/`);
  } catch (err) {
    return rejectWithValue(reason(err, 'Could not open the message.'));
  }
});

export const updateMailMessage = createAsyncThunk<
  MailMessageDetail,
  { id: number; patch: Partial<Pick<MailMessage, 'is_read' | 'is_starred' | 'state'>> },
  { rejectValue: string }
>('mailbox/update', async ({ id, patch }, { rejectWithValue }) => {
  try {
    return await apiFetch<MailMessageDetail>(`/mail/messages/${id}/`, { method: 'PATCH', body: patch });
  } catch (err) {
    return rejectWithValue(reason(err, 'Could not update the message.'));
  }
});
// end D1

/** Applies a change to the rows and the open conversation it names, and
 *  keeps their before-values under the request id (Decision 3). */
function optimistic(state: MailboxState, requestId: string, ids: number[], patch: ThreadPatch) {
  const undo: Undo = { path: buildListPath(state), rows: [], thread: null };
  const leaves = leavesView(state, patch);
  if (state.list) {
    const kept: MailThread[] = [];
    state.list.results.forEach((row, index) => {
      if (!ids.includes(row.id)) {
        kept.push(row);
        return;
      }
      const before = current(row);
      undo.rows.push({ index, row: before });
      if (!leaves) kept.push(patchRow(before, patch, state.labels));
    });
    if (leaves) state.list.count -= undo.rows.length;
    state.list.results = kept;
  }
  if (state.thread && state.selectedId !== null && ids.includes(state.selectedId)) {
    const before = current(state.thread);
    undo.thread = before;
    state.thread = patchThread(before, patch, state.labels);
  }
  state.undo[requestId] = undo;
}

/** Puts a refused change back: each row at its old place, only into the
 *  same list; the conversation only while it is still open. */
function restore(state: MailboxState, requestId: string) {
  const undo = state.undo[requestId];
  if (!undo) return;
  delete state.undo[requestId];
  if (state.list && buildListPath(state) === undo.path) {
    for (const { index, row } of undo.rows) {
      const at = state.list.results.findIndex((r) => r.id === row.id);
      if (at >= 0) {
        state.list.results[at] = row;
      } else {
        state.list.results.splice(Math.min(index, state.list.results.length), 0, row);
        state.list.count += 1;
      }
    }
  }
  if (undo.thread && state.thread?.thread_id === undo.thread.thread_id) state.thread = undo.thread;
}

/** Any change to what the list shows closes the open conversation and the selection. */
function closeConversation(state: MailboxState) {
  state.selectedId = null;
  state.thread = null;
  state.checked = [];
  // D1 (Task 3 removes)
  state.detail = null;
  // end D1
}

const mailboxSlice = createSlice({
  name: 'mailbox',
  initialState,
  reducers: {
    setMailFolder(state, action: PayloadAction<MailFolder>) {
      state.folder = action.payload;
      state.label = null;
      closeConversation(state);
    },
    /** A label in the sidebar: everything outside Spam and Trash that carries it. */
    setMailLabel(state, action: PayloadAction<number>) {
      state.folder = 'all';
      state.label = action.payload;
      state.category = null;
      closeConversation(state);
    },
    /** Picking the category already picked clears it, so the block both
     *  narrows and widens. */
    toggleMailCategory(state, action: PayloadAction<MailCategory>) {
      state.category = state.category === action.payload ? null : action.payload;
      closeConversation(state);
    },
    setMailUnread(state, action: PayloadAction<boolean>) {
      state.unread = action.payload;
      closeConversation(state);
    },
    setMailPriority(state, action: PayloadAction<boolean>) {
      state.priority = action.payload;
      closeConversation(state);
    },
    selectThread(state, action: PayloadAction<number | null>) {
      // Never show the last conversation under a new one while it loads.
      if (state.selectedId !== action.payload) state.thread = null;
      state.selectedId = action.payload;
      state.threadError = null;
      state.actionError = null;
      state.replyError = null;
      state.repliedId = null;
    },
    toggleChecked(state, action: PayloadAction<number>) {
      const id = action.payload;
      state.checked = state.checked.includes(id) ? state.checked.filter((x) => x !== id) : [...state.checked, id];
    },
    setChecked(state, action: PayloadAction<number[]>) {
      state.checked = action.payload;
    },
    clearMailActionError(state) {
      state.actionError = null;
    },
    // D1 (Task 3 removes)
    selectMailMessage(state, action: PayloadAction<number | null>) {
      state.selectedId = action.payload;
      if (state.detail?.id !== action.payload) state.detail = null;
      state.detailError = null;
      state.updateError = null;
      state.replyError = null;
      state.repliedId = null;
    },
    clearMailUpdateError(state) {
      state.updateError = null;
    },
    // end D1
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMailList.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMailList.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
        const shown = new Set(action.payload.results.map((row) => row.id));
        state.checked = state.checked.filter((id) => shown.has(id));
      })
      .addCase(fetchMailList.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Could not load your mail.';
      })
      .addCase(loadMoreList.pending, (state) => {
        state.loadingMore = true;
      })
      .addCase(loadMoreList.fulfilled, (state, action) => {
        state.loadingMore = false;
        const seen = new Set(state.list?.results.map((row) => row.id) ?? []);
        state.list = { ...action.payload, results: [...(state.list?.results ?? []), ...action.payload.results.filter((row) => !seen.has(row.id))] };
      })
      .addCase(loadMoreList.rejected, (state, action) => {
        state.loadingMore = false;
        state.error = action.payload ?? 'Could not load more mail.';
      })
      .addCase(fetchMailSummary.fulfilled, (state, action) => {
        state.summary = action.payload;
      })
      .addCase(fetchThread.pending, (state) => {
        state.threadLoading = true;
        state.threadError = null;
      })
      .addCase(fetchThread.fulfilled, (state, action) => {
        state.threadLoading = false;
        if (state.selectedId === action.meta.arg) state.thread = action.payload;
      })
      .addCase(fetchThread.rejected, (state, action) => {
        state.threadLoading = false;
        if (state.selectedId === action.meta.arg) state.threadError = action.payload ?? 'Could not open the conversation.';
      })
      .addCase(updateThread.pending, (state, action) => {
        state.actionError = null;
        optimistic(state, action.meta.requestId, [action.meta.arg.id], action.meta.arg.patch);
      })
      .addCase(updateThread.fulfilled, (state, action) => {
        delete state.undo[action.meta.requestId];
        // Only over a conversation already on screen: the read PATCH sent on
        // open must not stand in for a GET that failed (its error stays shown).
        if (state.selectedId === action.meta.arg.id && state.thread) state.thread = action.payload;
      })
      .addCase(updateThread.rejected, (state, action) => {
        restore(state, action.meta.requestId);
        state.actionError = action.payload ?? failed(UPDATE_FAILED);
      })
      .addCase(bulkMailAction.pending, (state, action) => {
        const { op, ids, labelId } = action.meta.arg;
        state.actionError = null;
        state.bulkBusy = true;
        optimistic(state, action.meta.requestId, ids, patchOfOp(op, labelId ?? null));
      })
      .addCase(bulkMailAction.fulfilled, (state, action) => {
        delete state.undo[action.meta.requestId];
        state.bulkBusy = false;
        state.checked = state.checked.filter((id) => !action.meta.arg.ids.includes(id));
      })
      .addCase(bulkMailAction.rejected, (state, action) => {
        restore(state, action.meta.requestId);
        state.bulkBusy = false;
        state.actionError = action.payload ?? failed(BULK_FAILED);
      })
      .addCase(fetchMailLabels.fulfilled, (state, action) => {
        state.labels = action.payload;
      })
      .addCase(createMailLabel.fulfilled, (state, action) => {
        const { label } = action.payload;
        if (label && !state.labels.some((l) => l.id === label.id)) state.labels = [...state.labels, label].sort((a, b) => a.name.localeCompare(b.name));
      })
      .addCase(replyToMailMessage.pending, (state) => {
        state.replying = true;
        state.replyError = null;
      })
      .addCase(replyToMailMessage.fulfilled, (state, action) => {
        state.replying = false;
        state.repliedId = action.meta.arg.id;
        // The backend marks the original read; the conversation should say so too.
        const original = state.thread?.messages.find((m) => m.id === action.meta.arg.id);
        if (original) original.is_read = true;
        // D1 (Task 3 removes)
        if (state.detail?.id === action.meta.arg.id) state.detail.is_read = true;
        if (state.page) {
          state.page.results = state.page.results.map((row) => (row.id === action.meta.arg.id ? { ...row, is_read: true } : row));
        }
        // end D1
      })
      .addCase(replyToMailMessage.rejected, (state, action) => {
        state.replying = false;
        state.replyError = action.payload ?? 'Could not send the reply.';
      })
      // D1 (Task 3 removes)
      .addCase(fetchMailMessages.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMailMessages.fulfilled, (state, action) => {
        state.loading = false;
        state.page = action.payload;
      })
      .addCase(fetchMailMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Could not load your mail.';
      })
      .addCase(loadMoreMail.pending, (state) => {
        state.loadingMore = true;
      })
      .addCase(loadMoreMail.fulfilled, (state, action) => {
        state.loadingMore = false;
        state.page = { ...action.payload, results: [...(state.page?.results ?? []), ...action.payload.results] };
      })
      .addCase(loadMoreMail.rejected, (state, action) => {
        state.loadingMore = false;
        state.error = action.payload ?? 'Could not load more mail.';
      })
      .addCase(fetchMailMessage.pending, (state) => {
        state.detailLoading = true;
        state.detailError = null;
      })
      .addCase(fetchMailMessage.fulfilled, (state, action) => {
        state.detailLoading = false;
        if (state.selectedId === action.payload.id) state.detail = action.payload;
      })
      .addCase(fetchMailMessage.rejected, (state, action) => {
        state.detailLoading = false;
        state.detailError = action.payload ?? 'Could not open the message.';
      })
      .addCase(updateMailMessage.pending, (state) => {
        state.updateError = null;
      })
      .addCase(updateMailMessage.fulfilled, (state, action) => {
        const updated = action.payload;
        if (state.detail?.id === updated.id) state.detail = updated;
        if (state.page) {
          state.page.results = state.page.results.map((row) => (row.id === updated.id ? { ...row, ...updated } : row));
        }
      })
      .addCase(updateMailMessage.rejected, (state, action) => {
        state.updateError = action.payload ?? 'Could not update the message.';
      });
    // end D1
  },
});

export const { setMailFolder, setMailLabel, toggleMailCategory, setMailUnread, setMailPriority, selectThread, toggleChecked, setChecked, clearMailActionError } = mailboxSlice.actions;
// D1 (Task 3 removes)
export const { selectMailMessage, clearMailUpdateError } = mailboxSlice.actions;
// end D1
export default mailboxSlice.reducer;
```

Note the builder chain: the last D1 `.addCase(...)` ends with `;`. When Task 3 removes the fenced block, the `.addCase(replyToMailMessage.rejected, ...)` before it must end the chain with `;` instead.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/features/mail src/pages/communications src/e2e/gmail.test.tsx src/components/integrations --maxWorkers=2`
Expected: PASS. The D1 view still runs on the fenced D1 pieces.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/mail/mailboxSlice.ts src/features/mail/mailboxSlice.test.ts src/features/mail/testMail.ts
git commit -m "feat(mail): conversations, optimistic actions, bulk and labels in the mailbox slice

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Conversations on screen: the list and the open conversation

**Files:**
- Modify: `src/features/mail/mailboxSlice.ts` (remove the D1 fences)
- Modify: `src/pages/communications/mailWho.ts`
- Create: `src/pages/communications/ThreadMessage.tsx`
- Rewrite: `src/pages/communications/MailDetail.tsx`
- Modify: `src/pages/communications/MailList.tsx`
- Modify: `src/pages/communications/queueColumns.ts` (comment)
- Modify: `src/pages/communications/MailboxNotice.tsx`
- Modify: `src/pages/communications/MailboxPanel.tsx` (All mail)
- Rewrite: `src/pages/communications/MailboxView.tsx`
- Test: `src/pages/communications/MailDetail.test.tsx` (rewrite), `src/pages/communications/MailList.test.tsx`, `src/pages/communications/MailboxNotice.test.tsx`, `src/pages/communications/MailboxView.test.tsx`, `src/e2e/gmail.test.tsx`

**Interfaces:**
- Consumes: Task 2's thunks, actions and state; Task 1's `leavesView`, `mailActionGate`, `MailActionGate`, `OLDER_IN_GMAIL`, `deletedMessages`; D1's `fetchMailbox`, `syncMailbox`, `useMailboxPolling`, `LabelChips`, `MailAttachments`, `MailHtmlBody`, `ReplyBox`.
- Produces: `threadWho(row: Pick<MailThread, 'participants' | 'more_participants'>): string`; `replyTarget(messages: MailMessageDetail[]): MailMessageDetail | null`; `ThreadMessage({ message, open, onToggle? })`; `MailDetail` props `{ thread, loading, error, folder, gate, replying, replyError, repliedId, onRetry, onAction(patch: ThreadPatch), onUnmute(), onReply(messageId: number, body: string) }`; `MailList` rows are `MailThread[]`, each `li` carries `data-thread-id`; `MailboxNotice({ summary, gate? })`; the open conversation is `section[aria-label="Conversation"]`, its messages `ol[aria-label="Messages"]`, its actions `div[role="toolbar"][aria-label="Conversation actions"]`. `MailboxView` functions later tasks extend: `act(patch, id?)`, `bulk(op, ids, labelId?)`, `open(row)`, `settled(listChanged)`, `refused(code)`.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/pages/communications/MailDetail.test.tsx` with:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MailDetail } from './MailDetail';
import { GOOGLE, MAIL_DETAIL, MAIL_EARLIER, threadOf } from '../../features/mail/testMail';
import type { MailFolder, MailMessageDetail } from '../../features/mail/mailboxSlice';
import { mailActionGate, OLDER_IN_GMAIL, TWO_WAY_OFF_TEXT, type MailActionGate } from '../../features/mail/mailText';

// Unit tier: the open conversation alone (D2 contract §2), handlers mocked.

const LIVE = mailActionGate(GOOGLE, null);

function renderThread(messages: MailMessageDetail[], { folder = 'inbox' as MailFolder, gate = LIVE as MailActionGate, truncated = false } = {}) {
  const handlers = { onAction: vi.fn(), onUnmute: vi.fn(), onReply: vi.fn(), onRetry: vi.fn() };
  render(
    <MemoryRouter>
      <MailDetail thread={{ ...threadOf(messages), truncated }} loading={false} error={null} folder={folder} gate={gate} replying={false} replyError={null} repliedId={null} {...handlers} />
    </MemoryRouter>,
  );
  return { pane: screen.getByRole('region', { name: 'Conversation' }), ...handlers };
}

describe('MailDetail: the open conversation (two-way Gmail D2)', () => {
  it('folds the older message and opens the newest, with its Cc, the labels and its files', async () => {
    const { pane } = renderThread([MAIL_EARLIER, MAIL_DETAIL]);
    expect(within(pane).getByRole('heading', { level: 2, name: 'Renewal quote' })).toBeInTheDocument();
    const folded = within(pane).getByRole('button', { name: /You.*Could you send the renewal quote\?/ });
    expect(folded).toHaveAttribute('aria-expanded', 'false');
    const newest = within(pane).getByRole('article', { name: /^Ann Lee, / });
    expect(within(newest).getByText('Cc Sam Pizza')).toHaveAttribute('title', 'sam@pizzahut.com');
    expect(within(pane).getAllByRole('group', { name: 'Labels: Q4, Renewals, Vendors/Billing' }).length).toBeGreaterThan(0);
    expect(within(newest).getByRole('list', { name: 'Attachments' })).toHaveTextContent('Renewal quote.pdf');
    expect(within(newest).queryByText('logo.png')).toBeNull();
    await userEvent.click(folded);
    expect(within(pane).getByRole('article', { name: /^You, / })).toHaveTextContent('Could you send the renewal quote?');
  });

  it('keeps a deleted message behind a line outside Trash, and shows it in Trash', async () => {
    const trashed = { ...MAIL_EARLIER, folder: 'trash' as const };
    const { pane } = renderThread([trashed, MAIL_DETAIL]);
    expect(within(pane).queryByRole('button', { name: /Could you send/ })).toBeNull();
    await userEvent.click(within(pane).getByRole('button', { name: '1 deleted message' }));
    expect(within(pane).getByRole('button', { name: /Could you send/ })).toBeInTheDocument();
  });

  it('says when the oldest messages are only in Gmail', () => {
    const { pane } = renderThread([MAIL_DETAIL], { truncated: true });
    expect(within(pane).getByText(OLDER_IN_GMAIL)).toBeInTheDocument();
  });

  it('stars, marks unread and marks done the conversation, and unmutes through its own route', async () => {
    const { pane, onAction, onUnmute } = renderThread([{ ...MAIL_DETAIL, state: 'muted' }]);
    await userEvent.click(within(pane).getByRole('button', { name: 'Star' }));
    expect(onAction).toHaveBeenLastCalledWith({ is_starred: true });
    await userEvent.click(within(pane).getByRole('button', { name: 'Mark unread' }));
    expect(onAction).toHaveBeenLastCalledWith({ is_read: false });
    await userEvent.click(within(pane).getByRole('button', { name: 'Mark done' }));
    expect(onAction).toHaveBeenLastCalledWith({ state: 'done' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Unmute' }));
    expect(onUnmute).toHaveBeenCalledOnce();
  });

  it('turns every action but Mute off while two-way is off, and says why', () => {
    const { pane } = renderThread([MAIL_DETAIL], { gate: mailActionGate({ ...GOOGLE, two_way: false }, null) });
    for (const name of ['Star', 'Mark unread', 'Mark done']) {
      const button = within(pane).getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', TWO_WAY_OFF_TEXT);
    }
    expect(within(pane).getByRole('button', { name: 'Mute' })).toBeEnabled();
  });

  it('replies to the newest message from the other side, and never from Trash', async () => {
    const later = { ...MAIL_EARLIER, sent_at: '2026-10-09T10:00:00Z' };
    const { pane, onReply } = renderThread([MAIL_DETAIL, later]);
    expect(within(pane).getByText(/filed on Pizza Hut/)).toBeInTheDocument();
    await userEvent.type(within(pane).getByLabelText('Reply'), 'Thanks, Ann.');
    await userEvent.click(within(pane).getByRole('button', { name: 'Send reply' }));
    expect(onReply).toHaveBeenCalledWith(1, 'Thanks, Ann.');
  });

  it('offers no reply in Trash', () => {
    const { pane } = renderThread([MAIL_DETAIL], { folder: 'trash' });
    expect(within(pane).queryByLabelText('Reply')).toBeNull();
  });

  it('shows the text body when there is no HTML', () => {
    const { pane } = renderThread([{ ...MAIL_DETAIL, html_body: '' }]);
    expect(within(pane).queryByTitle('Message: Renewal quote')).toBeNull();
    expect(within(pane).getByText(/Quote attached\.\s+Ann/)).toBeInTheDocument();
  });
});
```

Replace the whole of `src/pages/communications/MailList.test.tsx` with:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MailList } from './MailList';
import { MAIL_DETAIL, MAIL_EARLIER, threadRowOf } from '../../features/mail/testMail';
import { rowOfMessage } from '../../features/mail/mailboxSlice';

const ROW = threadRowOf(MAIL_DETAIL);

describe('MailList: conversation rows', () => {
  it('shows two label chips and +1, and says the row has attachments', () => {
    render(<MailList rows={[ROW]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    // The Labels cell and the narrow meta line each carry the chips; CSS shows one.
    const groups = screen.getAllByRole('group', { name: 'Labels: Renewals, Vendors/Billing, Q4' });
    expect(groups).toHaveLength(2);
    expect(screen.getAllByText('+1').length).toBeGreaterThan(0);
    expect(screen.getByText('Has attachments')).toHaveClass('sr-only');
  });

  it('shows neither for a row without labels or attachments', () => {
    render(<MailList rows={[{ ...ROW, labels: [], has_attachments: false }]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    expect(screen.getByRole('button', { name: /Ann Lee/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /^Labels/ })).toBeNull();
    expect(screen.queryByText('Has attachments')).toBeNull();
  });

  it('names a conversation by its senders with its count, and a sent message To its recipients', () => {
    const conversation = { ...ROW, message_count: 2, participants: [{ name: 'Dana Ruiz', address: 'dana@doughco.com' }, { name: 'Ann Lee', address: 'ann@pizzahut.com' }] };
    render(<MailList rows={[conversation, rowOfMessage(MAIL_EARLIER)]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    expect(screen.getByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeInTheDocument();
    expect(screen.getByText(/messages/).parentElement).toHaveTextContent('2 messages');
    expect(screen.getByRole('button', { name: 'To Ann Lee' })).toBeInTheDocument();
    expect(document.querySelector('[data-thread-id="1"]')).not.toBeNull();
  });
});
```

In `src/pages/communications/MailboxNotice.test.tsx`, replace the import block with:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MailboxNotice } from './MailboxNotice';
import { GOOGLE, MAIL_SUMMARY } from '../../features/mail/testMail';
import { mailActionGate, TWO_WAY_OFF_TEXT } from '../../features/mail/mailText';
```

and add inside the `describe`:

```tsx
  it('says changes cannot reach Gmail while two-way is off, with the way to Connections', () => {
    render(
      <MemoryRouter>
        <MailboxNotice summary={{ ...MAIL_SUMMARY, import: null }} gate={mailActionGate({ ...GOOGLE, two_way: false }, null)} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(TWO_WAY_OFF_TEXT);
    expect(screen.getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
  });

  it('says it once when the mailbox is paused', () => {
    render(<MailboxNotice summary={{ ...MAIL_SUMMARY, import: null, paused_reason: 'no_seat' }} gate={mailActionGate({ ...GOOGLE, paused_reason: 'no_seat' }, null)} />);
    expect(screen.getAllByText(/no longer hold a seat/)).toHaveLength(1);
  });
```

In `src/pages/communications/MailboxView.test.tsx`:

1. Replace `import { MAIL_SUMMARY, stubMail } from '../../features/mail/testMail';` with `import { MAIL_SUMMARY, stubMail, threadOf, threadRowOf } from '../../features/mail/testMail';` and `import type { MailMessage } from '../../features/mail/mailboxSlice';` with `import type { MailMessage, MailMessageDetail } from '../../features/mail/mailboxSlice';`.
2. Replace the whole `function mockApi(overrides: Overrides = {}) { ... }` (up to the line before `function renderMailbox() {`) with:

```tsx
const INVOICE_BODY = 'Your plan renews on 1 October. Nothing to do.';
const detailOf = (row: MailMessage, body: string): MailMessageDetail => ({ ...row, body, html_body: '', attachments: [] });

function mockApi(overrides: Overrides = {}) {
  const calls: string[] = [];
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>((url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const ok = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });
    const patching = init?.method === 'PATCH';
    if (url.includes('/mail/sync/')) return ok(overrides.syncStatus ? { detail: 'Google refused the token.' } : { filed: 0 }, overrides.syncStatus ?? 200);
    if (url.includes('/mail/messages/1/thread/') && patching && overrides.patchStatus) return ok({ detail: 'nope' }, overrides.patchStatus);
    if (url.includes('/mail/messages/1/thread/') && !patching && overrides.detailStatus) return ok({ detail: 'Not found.' }, overrides.detailStatus);
    if (url.includes('/mail/messages/1/thread/') && overrides.draft) return ok(threadOf([detailOf(draftRow, INVOICE_BODY)]));
    if (url.includes('/mail/messages/summary/')) return ok(summary);
    if (url.includes('/mail/messages/2/reply/')) return ok({ ...pizza, id: 9, direction: 'sent', folder: 'sent' }, 201);
    if (url.includes('/copilot/draft-reply/')) return ok({ draft: 'Hi Sam, Thursday works for us.', sources: [{ type: 'note', id: 7, label: 'Billing preference', date: '2026-09-01', company: 'Pizza Hut', company_type: 'customer', company_id: 3 }] });
    if (url.includes('/mail/messages/1/thread/') && patching) return ok(threadOf([{ ...detailOf(invoice, INVOICE_BODY), ...JSON.parse(String(init?.body)) }]));
    if (url.includes('/mail/messages/1/thread/')) return ok(threadOf([detailOf(invoice, INVOICE_BODY)]));
    if (url.includes('/mail/messages/2/thread/')) return ok(threadOf([detailOf(pizza, 'Can we talk Thursday? Sam')]));
    if (url.includes('/mail/labels/')) return ok([]);
    if (url.includes('/mail/threads/')) {
      const params = new URL(url, 'http://localhost').searchParams;
      let rows: MailMessage[] = [invoice, pizza];
      if (overrides.draft) rows = [draftRow];
      if (params.get('category') === 'financial') rows = [invoice];
      if (overrides.paged) {
        if (params.get('page') === '2') return ok({ count: 2, next: null, previous: 'x', results: [threadRowOf(pizza)] });
        return ok({ count: 2, next: 'http://localhost:8000/api/v1/mail/threads/?page=2', previous: null, results: [threadRowOf(invoice)] });
      }
      return ok({ count: rows.length, next: null, previous: null, results: rows.map((row) => threadRowOf(row)) });
    }
    if (url.includes('/mail/messages/')) {
      // Sent and Drafts list messages (Decision 1).
      const params = new URL(url, 'http://localhost').searchParams;
      const rows: MailMessage[] = params.get('folder') === 'sent' ? [] : [invoice, pizza];
      return ok({ count: rows.length, next: null, previous: null, results: rows });
    }
    if (url.includes('/communications/stats/')) return ok({ counts: { email: 0, question: 0, ticket: 0, call: 0 }, total: 0, oldest_waiting_days: null, stale_questions: 0, has_mailbox: true, scope: 'mine', ticket_scope_note: '' });
    if (url.includes('/communications/')) return ok({ count: 0, next: null, previous: null, results: [], truncated: false, mode: 'needs', scope: 'mine' });
    if (url.includes('/copilot/conversations/')) return ok([]);
    return ok({});
  });
  vi.stubGlobal('fetch', spy);
  return calls;
}
```

3. In `renderMailbox`, replace `connection: { id: 1, provider: 'google', provider_display: 'Google', address: 'dana@acme.io', status: 'connected' }` with `connection: { id: 1, provider: 'google', provider_display: 'Google', address: 'dana@acme.io', status: 'connected', two_way: true, paused_reason: null }`.
4. Replace `calls.some((c) => c.startsWith('PATCH') && c.includes('/mail/messages/1/'))` with `calls.some((c) => c.startsWith('PATCH') && c.includes('/mail/messages/1/thread/'))`.
5. Replace `calls.some((c) => c.includes('/mail/messages/?category=financial'))` with `calls.some((c) => c.includes('/mail/threads/?category=financial'))`.
6. Replace `calls.some((c) => c.includes('/mail/messages/?page=2'))` with `calls.some((c) => c.includes('/mail/threads/?page=2'))`.
7. In "a failed star or done says so instead of pretending", replace `expect(await within(pane).findByRole('alert')).toHaveTextContent('nope');` with `expect(await within(mailbox).findByRole('alert')).toHaveTextContent('nope');` (the action alert sits under the mailbox header now).
8. In "a draft has no reply box", replace `getByRole('button', { name: 'To Sam' })` with `getByRole('button', { name: 'Circleback' })` (a conversation row names its senders).
9. In the "two-way Gmail D1" describe, replace the two lines

```tsx
  // The list reads only: /mail/messages/ with or without a query, never the summary or one message.
  const lists = (spy: ReturnType<typeof stubMail>['spy']) => calls(spy, 'GET', '/mail/messages/').filter((c) => /^\/mail\/messages\/(\?|$)/.test(c)).length;
```

with

```tsx
  // The list reads only: /mail/threads/ with or without a query.
  const lists = (spy: ReturnType<typeof stubMail>['spy']) => calls(spy, 'GET', '/mail/threads/').filter((c) => /^\/mail\/threads\/(\?|$)/.test(c)).length;
```

10. Rename the reading region in both test files:

```bash
sed -i '' "s/{ name: 'Message' }/{ name: 'Conversation' }/g" src/pages/communications/MailboxView.test.tsx src/e2e/gmail.test.tsx
```

In `src/e2e/gmail.test.tsx`, replace `{ name: 'Labels: Renewals, Vendors/Billing, Q4' }` with `{ name: 'Labels: Q4, Renewals, Vendors/Billing' }` (a conversation's labels are the union, by name).

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/pages/communications src/e2e/gmail.test.tsx --maxWorkers=2`
Expected: FAIL: `MailDetail` has no `thread` prop and no "Conversation" region, `threadRowOf` rows have no `last_sent_at` month groups yet, `/mail/threads/` is never called.

- [ ] **Step 3: Remove the D1 list and detail from the slice**

```bash
perl -0pi -e 's/^[ \t]*\/\/ D1 \(Task 3 removes\)\n.*?^[ \t]*\/\/ end D1\n//gms' src/features/mail/mailboxSlice.ts
grep -n "D1 (Task 3 removes)\|end D1\|fetchMailMessages\|selectMailMessage\|updateMailMessage" src/features/mail/mailboxSlice.ts || echo "D1 pieces removed"
```

Expected: `D1 pieces removed`. Then end the builder chain: the line `      .addCase(replyToMailMessage.rejected, (state, action) => {` block now ends with `      })`; change that closing `})` (the last one before `  },`) to `});`.

- [ ] **Step 4: Who a conversation is with, and who a reply goes to**

Replace the whole of `src/pages/communications/mailWho.ts` with:

```ts
// Who a mail row is with: the sender, or for sent mail the people it went to
// (names only; the caller adds "To" where it reads as a heading). D2 adds a
// conversation's people and the message a reply answers.

import type { MailMessage, MailMessageDetail, MailThread } from '../../features/mail/mailboxSlice';

export function who(row: MailMessage): string {
  if (row.direction === 'sent') {
    const names = row.to.map(([name, address]) => name || address).filter(Boolean);
    return names.length ? names.join(', ') : 'nobody';
  }
  return row.from_name || row.from_address;
}

/** Cc or Bcc as names (the address when there is no name). */
export function people(list: [string, string][]): string {
  return list.map(([name, address]) => name || address).join(', ');
}

/** A conversation row's people: its senders (a Sent or Drafts row: its
 *  recipients), with "+N" past the three the server names. */
export function threadWho(row: Pick<MailThread, 'participants' | 'more_participants'>): string {
  const names = row.participants.map((p) => p.name || p.address).filter(Boolean);
  const shown = names.length ? names.join(', ') : 'nobody';
  return row.more_participants > 0 ? `${shown} +${row.more_participants}` : shown;
}

const NO_REPLY_FOLDERS = new Set(['drafts', 'spam', 'trash']);

/** The message a reply answers (Decision 7): the newest one from someone
 *  else, else the newest, replied to its recipients. None from Drafts, Spam
 *  or Trash: a draft has not been sent, spam is not a correspondent. */
export function replyTarget(messages: MailMessageDetail[]): MailMessageDetail | null {
  const open = messages.filter((m) => !NO_REPLY_FOLDERS.has(m.folder));
  const target = open.filter((m) => m.direction === 'received' && m.from_address).at(-1) ?? open.at(-1) ?? null;
  if (!target) return null;
  if (target.direction === 'received') return target.from_address ? target : null;
  return target.to.length > 0 ? target : null;
}
```

- [ ] **Step 5: One message of the conversation**

Create `src/pages/communications/ThreadMessage.tsx`:

```tsx
// One message of the open conversation (two-way Gmail D2, Decision 6).
// Folded: one line of who, what and when, which unfolds on press.
// Unfolded: who and when, To, Cc and Bcc, the files, then the body (HTML in
// the sandboxed frame, else the text).

import { ChevronUp } from 'lucide-react';
import type { MailMessageDetail } from '../../features/mail/mailboxSlice';
import { FOCUS, ICON_BUTTON, NUM, TYPE } from '../../components/ui';
import { people, who } from './mailWho';
import { MailAttachments } from './MailAttachments';
import { MailHtmlBody } from './MailHtmlBody';

function whenOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function shortWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const addresses = (list: [string, string][]) => list.map(([, address]) => address).join(', ');

export function ThreadMessage({ message, open, onToggle }: { message: MailMessageDetail; open: boolean; onToggle?: () => void }) {
  const from = message.direction === 'sent' ? 'You' : who(message);

  if (!open) {
    return (
      <li>
        <button type="button" onClick={onToggle} aria-expanded={false} className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left hover:bg-subtle active:bg-line-subtle ${FOCUS}`}>
          <span className={`w-28 shrink-0 truncate sm:w-40 ${TYPE.body} ${message.is_read ? '' : 'font-semibold'}`}>{from}</span>
          <span className={`min-w-0 flex-1 truncate ${TYPE.bodyMuted}`}>{message.snippet}</span>
          <span className={`shrink-0 ${TYPE.meta} ${NUM}`}>{shortWhen(message.sent_at)}</span>
        </button>
      </li>
    );
  }

  return (
    <li>
      <article aria-label={`${from}, ${whenOf(message.sent_at)}`} className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-start gap-2">
          <div className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
            <span className="font-semibold text-ink">{from}</span>
            {message.direction === 'received' && message.from_name ? <span>{message.from_address}</span> : null}
            <span className="whitespace-nowrap">
              <span aria-hidden="true">·</span> {whenOf(message.sent_at)}
            </span>
          </div>
          {onToggle ? (
            <button type="button" onClick={onToggle} aria-expanded={true} aria-label={`Fold the message from ${from}`} className={ICON_BUTTON}>
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {message.to.length > 0 ? (
          <p className={`truncate ${TYPE.meta}`} title={addresses(message.to)}>
            To {people(message.to)}
          </p>
        ) : null}
        {message.cc.length > 0 ? (
          <p className={`truncate ${TYPE.meta}`} title={addresses(message.cc)}>
            Cc {people(message.cc)}
          </p>
        ) : null}
        {message.bcc.length > 0 ? (
          <p className={`truncate ${TYPE.meta}`} title={addresses(message.bcc)}>
            Bcc {people(message.bcc)}
          </p>
        ) : null}
        {message.attachments.length > 0 ? <MailAttachments attachments={message.attachments} /> : null}
        {message.html_body ? (
          <div className="h-[70dvh] min-h-80">
            <MailHtmlBody html={message.html_body} title={message.subject} />
          </div>
        ) : (
          <p className={`max-w-[68ch] whitespace-pre-line ${TYPE.body}`}>{message.body || message.snippet}</p>
        )}
      </article>
    </li>
  );
}
```

- [ ] **Step 6: The open conversation**

Replace the whole of `src/pages/communications/MailDetail.tsx` with:

```tsx
// The open conversation (two-way Gmail D2, spec §4): its subject, record
// and labels; what can be done to it; every message oldest first with the
// older ones folded; and a reply to the newest message from the other side.
// An action changes the screen at once (the slice puts it back if refused);
// what this mailbox cannot do is off, with the reason as the button's title
// (Decision 5).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, MailOpen, Star, VolumeX } from 'lucide-react';
import type { MailFolder, MailThreadDetail, ThreadPatch } from '../../features/mail/mailboxSlice';
import { deletedMessages, OLDER_IN_GMAIL, type MailActionGate } from '../../features/mail/mailText';
import { Figured } from '../../components/brain/Figured';
import { Badge, BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, FOCUS, ICON_BUTTON, INLINE_TARGET, LoadingState, NUM, QUIET, TYPE } from '../../components/ui';
import { CATEGORY_LABEL } from './mailCategories';
import { ReplyBox } from './ReplyBox';
import { replyTarget } from './mailWho';
import { LabelChips } from './MailLabels';
import { ThreadMessage } from './ThreadMessage';

export function MailDetail({
  thread,
  loading,
  error,
  folder,
  gate,
  replying,
  replyError,
  repliedId,
  onRetry,
  onAction,
  onUnmute,
  onReply,
}: {
  thread: MailThreadDetail | null;
  loading: boolean;
  /** Why the conversation could not be opened. */
  error: string | null;
  /** The view it was opened from: Trash shows deleted messages and offers no reply. */
  folder: MailFolder;
  gate: MailActionGate;
  replying: boolean;
  replyError: string | null;
  repliedId: number | null;
  onRetry: () => void;
  onAction: (patch: ThreadPatch) => void;
  /** Unmuting goes through the bulk route (Decision 4). */
  onUnmute: () => void;
  onReply: (messageId: number, body: string) => void;
}) {
  const [showDeleted, setShowDeleted] = useState(false);
  const [unfolded, setUnfolded] = useState<ReadonlySet<number>>(() => new Set());

  if (!thread) {
    return (
      <section aria-label="Conversation" aria-busy={loading} className="flex grow min-w-0 flex-col">
        {error ? (
          <UiErrorState message={error} detail="The conversation could not be opened." onRetry={onRetry} />
        ) : loading ? (
          <LoadingState label="Opening the conversation" variant="block" />
        ) : (
          <UiEmptyState size="inline" title="Choose a conversation to read it." />
        )}
      </section>
    );
  }

  const inTrash = folder === 'trash';
  const live = thread.messages.filter((m) => m.folder !== 'trash');
  const shown = inTrash || showDeleted || live.length === 0 ? thread.messages : live;
  const deleted = thread.messages.length - shown.length;
  const newest = shown[shown.length - 1];
  const state = newest.state;
  const starred = thread.messages.some((m) => m.is_starred);
  const target = replyTarget(shown);
  const canReply = !inTrash && folder !== 'spam' && target !== null;
  const off = Boolean(gate.blocked);
  const offTitle = gate.blocked ?? undefined;
  const href = thread.account ? (thread.account.type === 'customer' ? `/organizations/${thread.account.id}` : `/accounts/${thread.account.id}`) : null;

  function toggle(id: number) {
    setUnfolded((before) => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section aria-label="Conversation" className="flex grow min-w-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-line-subtle px-4 pb-3 pt-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
          <div className="grow min-w-0">
            <h2 className={`mb-1 ${TYPE.title}`}>{thread.subject}</h2>
            <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${TYPE.meta}`}>
              {shown.length > 1 ? (
                <span>
                  <span className={NUM}>{shown.length}</span> messages
                </span>
              ) : null}
              <Badge>{CATEGORY_LABEL[newest.category]}</Badge>
              <LabelChips labels={thread.labels} />
              {thread.account && href ? (
                <Link to={href} className={`inline-flex items-center gap-1 font-semibold text-ink hover:underline ${INLINE_TARGET} ${FOCUS}`}>
                  {thread.account.name}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          </div>
          <div role="toolbar" aria-label="Conversation actions" className="shrink-0 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => onAction({ is_starred: !starred })}
              disabled={off}
              aria-pressed={starred}
              aria-label={starred ? 'Unstar' : 'Star'}
              title={offTitle ?? (starred ? 'Unstar' : 'Star')}
              className={ICON_BUTTON}
            >
              <Star className={`h-4 w-4 ${starred ? 'text-warning' : ''}`} fill={starred ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onAction({ is_read: false })} disabled={off} aria-label="Mark unread" title={offTitle ?? 'Mark unread'} className={ICON_BUTTON}>
              <MailOpen className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => (state === 'muted' ? onUnmute() : onAction({ state: 'muted' }))}
              aria-pressed={state === 'muted'}
              aria-label={state === 'muted' ? 'Unmute' : 'Mute'}
              title={state === 'muted' ? 'Unmute' : 'Mute'}
              className={`${ICON_BUTTON} ${state === 'muted' ? 'bg-subtle text-ink' : ''}`}
            >
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onAction({ state: state === 'done' ? 'open' : 'done' })} disabled={off} title={offTitle} aria-pressed={state === 'done'} className={BUTTON}>
              <Check className="h-4 w-4" aria-hidden="true" />
              {state === 'done' ? 'Done' : 'Mark done'}
            </button>
          </div>
        </div>
      </div>

      <div className="grow overflow-y-auto custom-scrollbar">
        {thread.truncated ? <p className={`px-4 pt-3 ${TYPE.meta}`}>{OLDER_IN_GMAIL}</p> : null}
        {deleted > 0 ? (
          <button type="button" onClick={() => setShowDeleted(true)} className={`ml-1 mt-1 ${QUIET}`}>
            <Figured text={deletedMessages(deleted)} />
          </button>
        ) : null}
        <ol aria-label="Messages" className="divide-y divide-line-subtle">
          {shown.map((message) =>
            message.id === newest.id ? (
              <ThreadMessage key={message.id} message={message} open />
            ) : (
              <ThreadMessage key={message.id} message={message} open={unfolded.has(message.id)} onToggle={() => toggle(message.id)} />
            ),
          )}
        </ol>
      </div>

      {canReply && target ? (
        <ReplyBox
          key={target.id}
          label="Reply"
          placeholder="Write your reply."
          hint={`Sends from your connected mailbox${thread.account ? `, filed on ${thread.account.name}` : ''}`}
          sendLabel="Send reply"
          draftSource={{ kind: 'mail_message', id: target.id }}
          onSend={(body) => onReply(target.id, body)}
          sending={replying}
          sent={repliedId === target.id}
          error={replyError}
        />
      ) : null}
    </section>
  );
}
```

`Figured` (`src/components/brain/Figured.tsx`) takes `{ text }` and wraps each figure in a `NUM` span inside one outer span, adding no text, so the button's name stays "1 deleted message".

- [ ] **Step 7: Conversation rows**

In `src/pages/communications/MailList.tsx`:

Replace the file's opening comment and imports (everything above `function monthOf`) with:

```tsx
// The mailbox list: the Categories block on top (what is waiting, by kind),
// then every conversation grouped by month, newest first, as flat grid rows
// (UI foundations spec §4.2) from a 44rem region. Sent and Drafts list
// messages, addressed "To" their recipients (two-way Gmail D2, Decision 1).

import { Paperclip } from 'lucide-react';
import { Badge, Initials, ListHeaderRow, ListRow, LoadingState, NUM, TYPE } from '../../components/ui';
import type { MailCategory, MailCategoryBlock, MailThread } from '../../features/mail/mailboxSlice';
import { CATEGORY_DOT } from './mailCategories';
import { LabelChips } from './MailLabels';
import { threadWho } from './mailWho';
import { MAIL_COLUMNS, QUEUE_GRID_AT, QUEUE_HEADER_SHOW, QUEUE_NARROW_ONLY } from './queueColumns';
```

Replace the whole `export function MailList(...)` with:

```tsx
export function MailList({
  rows,
  isLoading,
  onSelect,
  emptyState,
  footer = null,
  monthLevel = 'h3',
}: {
  rows: MailThread[];
  isLoading: boolean;
  onSelect: (id: number) => void;
  emptyState: React.ReactNode;
  /** Below the last group: the way to the next page, when there is one. */
  footer?: React.ReactNode;
  /** The months sit under the folder title (h2), or under "In your
   *  mailbox" (h3) in Drafts. */
  monthLevel?: 'h3' | 'h4';
}) {
  if (isLoading && rows.length === 0) return <LoadingState label="Loading your mail" count={6} />;
  if (rows.length === 0) return <>{emptyState}</>;

  const MonthHeading = monthLevel;
  const groups = new Map<string, MailThread[]>();
  for (const row of rows) {
    const key = monthOf(row.last_sent_at);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <div className="flex flex-col">
      <ListHeaderRow columns={MAIL_COLUMNS} labels={['From', 'Subject', 'Labels', 'Date']} align={['left', 'left', 'left', 'right']} show={QUEUE_HEADER_SHOW} />
      {[...groups.entries()].map(([month, items]) => (
        <section key={month} aria-label={month}>
          <MonthHeading className={`px-4 pt-4 pb-1 ${TYPE.meta} font-semibold`}>{month}</MonthHeading>
          <ul role="list" aria-label={month} className="divide-y divide-line-subtle">
            {items.map((row) => {
              const name = threadWho(row);
              const first = row.participants[0];
              return (
                <ListRow
                  key={row.id}
                  dataAttrs={{ 'data-thread-id': row.id }}
                  title={row.sent ? `To ${name}` : name}
                  strong={!row.is_read}
                  leading={
                    <span className="relative block">
                      <Initials text={initialsOf(first ? first.name || first.address : '')} />
                      {!row.is_read ? <span role="img" aria-label="Unread message" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-info" /> : null}
                    </span>
                  }
                  meta={
                    <>
                      {row.account ? row.account.name : null}
                      <span className={QUEUE_NARROW_ONLY}>
                        {row.account ? ' · ' : null}
                        {row.labels.length > 0 ? (
                          <>
                            <LabelChips labels={row.labels} max={1} />{' '}
                          </>
                        ) : null}
                        {row.subject}
                      </span>
                    </>
                  }
                  columns={MAIL_COLUMNS}
                  gridAt={QUEUE_GRID_AT}
                  cells={[
                    <div key="subject" className="flex min-w-0 items-center gap-1.5">
                      {row.has_attachments ? (
                        <>
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                          <span className="sr-only">Has attachments</span>
                        </>
                      ) : null}
                      {row.message_count > 1 ? (
                        <span className={`shrink-0 ${TYPE.meta} ${NUM}`}>
                          {row.message_count}
                          <span className="sr-only"> messages</span>
                        </span>
                      ) : null}
                      <p className={`min-w-0 truncate ${TYPE.body}`}>
                        {row.subject}
                        {row.snippet ? <span className="text-ink-muted">: {row.snippet}</span> : null}
                      </p>
                    </div>,
                    <LabelChips key="labels" labels={row.labels} max={2} />,
                  ]}
                  trailing={<span className={`ml-auto ${TYPE.meta} ${NUM}`}>{dayOf(row.last_sent_at)}</span>}
                  onSelect={() => onSelect(row.id)}
                />
              );
            })}
          </ul>
        </section>
      ))}
      {footer}
    </div>
  );
}
```

`CategoriesBlock` stays as it is (it still uses `Badge` and `CATEGORY_DOT`).

In `src/pages/communications/queueColumns.ts`, replace `// initials), subject, category and date. Below 44rem a row is one flex line` with `// initials), subject, labels and date. Below 44rem a row is one flex line`.

- [ ] **Step 8: The notice says when actions cannot reach Gmail**

Replace the whole of `src/pages/communications/MailboxNotice.tsx` with:

```tsx
// Under the mailbox header: the 12-month import while it runs, why a Google
// mailbox is paused (contract §6 summary), and, from D2, why changes cannot
// reach Gmail (read-only or disconnected, Decision 5). Always mounted, so a
// screen reader hears it change.

import { Link } from 'react-router-dom';
import { CirclePause, Unplug } from 'lucide-react';
import type { MailSummary } from '../../features/mail/mailboxSlice';
import { importLine, pausedNotice, type MailActionGate } from '../../features/mail/mailText';
import { Figured } from '../../components/brain/Figured';
import { FOCUS, INLINE_TARGET, TYPE } from '../../components/ui';

const OPEN_GATE: MailActionGate = { gmail: false, blocked: null, reconnect: false };

export function MailboxNotice({ summary, gate = OPEN_GATE }: { summary: MailSummary | null; gate?: MailActionGate }) {
  const paused = summary?.paused_reason ? pausedNotice(summary.paused_reason) : null;
  const importing = summary?.import?.state === 'importing' ? importLine(summary.import) : null;
  // A paused mailbox already says so in the line above.
  const blocked = !paused && gate.blocked ? gate.blocked : null;
  return (
    <div role="status" className={`flex flex-col gap-1 px-4 ${paused || importing || blocked ? 'pb-2' : ''}`.trim()}>
      {paused ? (
        <p className="flex items-center gap-2 text-[13px] leading-5 text-ink">
          <CirclePause className="h-4 w-4 shrink-0" aria-hidden="true" />
          {paused}
        </p>
      ) : null}
      {blocked ? (
        <p className="flex flex-wrap items-center gap-x-2 text-[13px] leading-5 text-ink">
          <Unplug className="h-4 w-4 shrink-0" aria-hidden="true" />
          {blocked}
          {gate.reconnect ? (
            <Link to="/settings/connections" className={`font-semibold underline-offset-2 hover:underline ${INLINE_TARGET} ${FOCUS}`}>
              Open Connections
            </Link>
          ) : null}
        </p>
      ) : null}
      {importing ? (
        <p className={TYPE.meta}>
          <Figured text={importing} />
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 9: All mail in the panel**

In `src/pages/communications/MailboxPanel.tsx`, replace

```tsx
  { folder: 'muted', label: 'Muted' },
];
```

with

```tsx
  { folder: 'muted', label: 'Muted' },
  { folder: 'all', label: 'All mail' },
];
```

and in the panel's file comment replace `// The mailbox's own left panel: the five folders, two filters, and the` with `// The mailbox's own left panel: the folders and All mail, two filters, and the`.

- [ ] **Step 10: Wire the mailbox**

Replace the whole of `src/pages/communications/MailboxView.tsx` with:

```tsx
// The person's own mailbox, whole: what the Communications page shows when
// the sidebar source is their mailbox. Folders, filters and categories on
// the left; the Categories block and the conversations, or the open
// conversation, on the right.
//
// Two-way Gmail D2: an action shows at once and reaches Gmail through the
// server's outbox; a refusal puts it back and says why (Decision 3).
// Outlook and IMAP keep their changes in Revenact, as before.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, ChevronUp, RefreshCw, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import {
  bulkMailAction,
  clearMailActionError,
  fetchMailLabels,
  fetchMailList,
  fetchMailSummary,
  fetchThread,
  loadMoreList,
  replyToMailMessage,
  selectThread,
  setMailFolder,
  setMailPriority,
  setMailUnread,
  toggleMailCategory,
  updateThread,
} from '../../features/mail/mailboxSlice';
import type { MailFolder, MailOp, MailThread, ThreadPatch } from '../../features/mail/mailboxSlice';
import { fetchMailbox, syncMailbox } from '../../features/mail/mailSlice';
import { leavesView } from '../../features/mail/mailOptimistic';
import { mailActionGate } from '../../features/mail/mailText';
import { AgentDraftsList } from '../../components/agents/AgentDraftsList';
import { DRAFTS } from '../../features/agents/draftsText';
import { BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, ICON_BUTTON, NUM, QUIET, RemovableChip, TYPE } from '../../components/ui';
import { CategoriesBlock, MailList } from './MailList';
import { MailDetail } from './MailDetail';
import { MailboxPanel } from './MailboxPanel';
import { MailboxNotice } from './MailboxNotice';
import { useMailboxPolling } from '../../features/mail/useMailboxPolling';
import { CATEGORY_LABEL } from './mailCategories';

const FOLDER_TITLE: Record<MailFolder, string> = {
  inbox: 'Inbox',
  all: 'All mail',
  drafts: 'Drafts',
  sent: 'Sent',
  done: 'Done',
  muted: 'Muted',
  spam: 'Spam',
  trash: 'Trash',
  starred: 'Starred',
  important: 'Important',
};

/** A refusal that means the mailbox changed under the screen: read it again. */
const MAILBOX_CODES = new Set(['MAILBOX_PAUSED', 'TWO_WAY_OFF', 'NO_MAILBOX']);

export function MailboxView({ panelOpen, onTogglePanel }: { panelOpen: boolean; onTogglePanel: () => void }) {
  const dispatch = useAppDispatch();
  const { folder, label, category, unread, priority, list, loading, loadingMore, error, summary, selectedId, thread, threadLoading, threadError, labels, actionError, replying, replyError, repliedId } =
    useAppSelector((state) => state.mailbox);
  const connection = useAppSelector((state) => state.mail?.connection ?? null);
  const disconnected = useAppSelector((state) => state.mail?.disconnected ?? null);
  const mailboxLoaded = useAppSelector((state) => state.mail?.loaded ?? false);
  const syncing = useAppSelector((state) => state.mail?.saving ?? false);
  const syncError = useAppSelector((state) => state.mail?.error ?? null);
  const syncQueued = useAppSelector((state) => state.mail?.syncQueued ?? false);
  const busySync = syncing || syncQueued;
  useMailboxPolling({ whileImporting: false });

  const gate = mailActionGate(connection, disconnected);
  const query = useMemo(() => ({ folder, label, category, unread, priority }), [folder, label, category, unread, priority]);
  const [params, setParams] = useSearchParams();
  const linked = params.get('message');

  const refresh = useCallback(() => {
    dispatch(fetchMailSummary());
    dispatch(fetchMailList(query));
  }, [dispatch, query]);

  useEffect(() => {
    dispatch(fetchMailList(query));
  }, [dispatch, query]);

  // A queued Google sync (202) lands later: when the wait ends, read again.
  const wasQueued = useRef(false);
  useEffect(() => {
    if (wasQueued.current && !syncQueued) refresh();
    wasQueued.current = syncQueued;
  }, [syncQueued, refresh]);

  useEffect(() => {
    dispatch(fetchMailSummary());
    dispatch(fetchMailLabels());
  }, [dispatch]);

  // Which actions work comes from the connection (Decision 5); the sidebar
  // has usually read it, a deep link may not have.
  useEffect(() => {
    if (!mailboxLoaded) dispatch(fetchMailbox());
  }, [dispatch, mailboxLoaded]);

  useEffect(() => {
    if (selectedId !== null) dispatch(fetchThread(selectedId));
  }, [dispatch, selectedId]);

  // The bell's link (Decision 12): ?message=<id> opens that conversation, once.
  useEffect(() => {
    if (linked === null) return;
    const id = Number(linked);
    if (Number.isInteger(id) && id > 0) dispatch(selectThread(id));
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('message');
        return next;
      },
      { replace: true },
    );
  }, [linked, dispatch, setParams]);

  /** After an action took: the counts, the labels' unread numbers, and the list when rows moved. */
  function settled(listChanged: boolean) {
    dispatch(fetchMailSummary());
    dispatch(fetchMailLabels());
    if (listChanged) dispatch(fetchMailList(query));
  }

  function refused(code: string | null) {
    if (code === null || !MAILBOX_CODES.has(code)) return;
    dispatch(fetchMailbox());
    dispatch(fetchMailSummary());
  }

  async function act(patch: ThreadPatch, id: number | null = selectedId) {
    if (id === null) return;
    const leaving = leavesView(query, patch);
    // Gmail goes back to the list when the conversation leaves the view.
    if (leaving && id === selectedId) dispatch(selectThread(null));
    const result = await dispatch(updateThread({ id, patch }));
    if (updateThread.fulfilled.match(result)) settled(leaving);
    else if (updateThread.rejected.match(result)) refused(result.payload?.code ?? null);
  }

  async function bulk(op: MailOp, ids: number[], labelId?: number) {
    if (ids.length === 0) return;
    const result = await dispatch(bulkMailAction({ op, ids, labelId }));
    if (bulkMailAction.fulfilled.match(result)) {
      settled(true);
      if (selectedId !== null && ids.includes(selectedId)) dispatch(fetchThread(selectedId));
    } else if (bulkMailAction.rejected.match(result)) {
      refused(result.payload?.code ?? null);
    }
  }

  function open(row: MailThread) {
    dispatch(selectThread(row.id));
    // Opening reads it (contract §10); GET never does. Not while it can't reach Gmail.
    if (row.unread_count > 0 && !gate.blocked) void act({ is_read: true }, row.id);
  }

  async function reply(messageId: number, body: string) {
    const result = await dispatch(replyToMailMessage({ id: messageId, body }));
    // A reply marks the original read and adds to Sent: the counts move.
    if (result.meta.requestStatus !== 'fulfilled') return;
    dispatch(fetchMailSummary());
    if (selectedId !== null) dispatch(fetchThread(selectedId));
  }

  async function sync() {
    const result = await dispatch(syncMailbox());
    // Google answers 202 and the tick lands later (the effect above reads
    // again then); Outlook and IMAP synced inline.
    if (!syncMailbox.fulfilled.match(result) || result.payload.queued) return;
    refresh();
  }

  const rows = list?.results ?? [];
  const title = label === null ? FOLDER_TITLE[folder] : (labels.find((l) => l.id === label)?.name ?? FOLDER_TITLE.all);
  const narrowed = folder !== 'inbox' || label !== null || category !== null || unread || priority;
  const shownOf = list ? (rows.length < list.count ? `${rows.length} of ${list.count}` : `${list.count}`) : '';

  return (
    <section aria-label="Mailbox" className="flex-1 min-w-0 rv-card-glass flex flex-col overflow-hidden">
      <div className="h-14 shrink-0 flex items-center gap-2 px-3">
        <button type="button" onClick={onTogglePanel} aria-label={panelOpen ? 'Hide folders' : 'Show folders'} aria-expanded={panelOpen} className={`${ICON_BUTTON} border border-line`}>
          <ChevronUp className={`h-4 w-4 transition-transform duration-[var(--dur-fast)] ${panelOpen ? '' : 'rotate-180'}`} aria-hidden="true" />
        </button>
        <h2 className={TYPE.title}>{title}</h2>
        {summary?.address ? <span className={`truncate ${TYPE.meta}`}>{summary.address}</span> : null}
        {category ? <RemovableChip label={CATEGORY_LABEL[category]} onRemove={() => dispatch(toggleMailCategory(category))} /> : null}
        {syncError ? (
          <span role="alert" className="ml-auto truncate text-[11px] leading-4 text-danger-ink">
            {syncError}
          </span>
        ) : null}
        <span className={`${syncError ? '' : 'ml-auto'} ${TYPE.meta} ${NUM}`}>{summary && !narrowed ? `${summary.unread} unread` : shownOf}</span>
        <button type="button" onClick={sync} disabled={busySync || Boolean(summary?.paused_reason)} aria-label="Sync now" title={summary?.last_synced_at ? `Last synced ${new Date(summary.last_synced_at).toLocaleString()}` : 'Sync now'} className={ICON_BUTTON}>
          <RefreshCw className={`h-4 w-4 ${busySync ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <MailboxNotice summary={summary} gate={gate} />
      {actionError ? (
        <div role="alert" className="mx-4 mb-2 flex shrink-0 flex-wrap items-center gap-2 text-[13px] leading-5 text-danger-ink">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{actionError.text}</span>
          {actionError.reconnect ? (
            <Link to="/settings/connections" className={QUIET}>
              Open Connections
            </Link>
          ) : null}
          <button type="button" onClick={() => dispatch(clearMailActionError())} aria-label="Dismiss" className={ICON_BUTTON}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 flex px-3 pb-3">
        {panelOpen ? (
          <MailboxPanel
            folder={folder}
            category={category}
            unread={unread}
            priority={priority}
            summary={summary}
            onFolder={(f) => dispatch(setMailFolder(f))}
            onCategory={(c) => dispatch(toggleMailCategory(c))}
            onUnread={(next) => dispatch(setMailUnread(next))}
            onPriority={(next) => dispatch(setMailPriority(next))}
          />
        ) : null}

        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto custom-scrollbar pl-0 @container" role="region" aria-label={selectedId !== null ? 'Reading' : 'Mail'}>
          {error ? (
            <UiErrorState message="Could not load your mail" detail={error} onRetry={() => dispatch(fetchMailList(query))} />
          ) : selectedId !== null ? (
            <div className="h-full flex flex-col">
              <button type="button" onClick={() => dispatch(selectThread(null))} className={`-ml-3 self-start ${QUIET}`}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                {title}
              </button>
              <div className="flex-1 min-h-0 flex">
                <MailDetail
                  key={selectedId}
                  thread={thread}
                  loading={threadLoading}
                  error={threadError}
                  folder={folder}
                  gate={gate}
                  replying={replying}
                  replyError={replyError}
                  repliedId={repliedId}
                  onRetry={() => dispatch(fetchThread(selectedId))}
                  onAction={(patch) => void act(patch)}
                  onUnmute={() => void bulk('unmute', [selectedId])}
                  onReply={(id, body) => void reply(id, body)}
                />
              </div>
            </div>
          ) : (
            <>
              {folder === 'inbox' && !unread && !priority ? <CategoriesBlock blocks={summary?.categories ?? []} active={category} onPick={(c) => dispatch(toggleMailCategory(c))} /> : null}
              {folder === 'drafts' ? (
                <>
                  {/* Agents delivery 2: Revenact's own drafts first, then the provider's. */}
                  <AgentDraftsList />
                  <h3 className={`px-4 pt-4 pb-2 ${TYPE.label}`}>{DRAFTS.MAILBOX_TITLE}</h3>
                </>
              ) : null}
              <MailList
                monthLevel={folder === 'drafts' ? 'h4' : 'h3'}
                rows={rows}
                isLoading={loading}
                footer={
                  list?.next ? (
                    <button type="button" onClick={() => dispatch(loadMoreList(list.next as string))} disabled={loadingMore} className={`mt-4 ml-4 ${BUTTON}`}>
                      {loadingMore ? (
                        'Loading…'
                      ) : (
                        <>
                          Load more (<span className={NUM}>{rows.length}</span> of <span className={NUM}>{list.count}</span>)
                        </>
                      )}
                    </button>
                  ) : null
                }
                onSelect={(id) => {
                  const row = rows.find((r) => r.id === id);
                  if (row) open(row);
                }}
                emptyState={
                  folder === 'inbox' && label === null && !category && !unread && !priority ? (
                    summary && !summary.has_mailbox ? (
                      <UiEmptyState title="No mailbox" detail="Connect one from Settings › Connections and your mail appears here." />
                    ) : (
                      <UiEmptyState title="Inbox zero" detail="Nothing between you and the rest of the day." />
                    )
                  ) : (
                    <UiEmptyState title="Nothing here" detail="Nothing in this view." />
                  )
                }
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 11: Run the tests to see them pass**

Run: `npx vitest run src/pages/communications src/features/mail src/e2e/gmail.test.tsx src/test/inlineTargets.test.ts src/components/ops.houseRules.test.ts src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS. If the ratchet's "keeps every baseline tight" fails because a count dropped, lower that baseline in `src/test/uiRatchet.test.ts` to the reported total and run again; if any count rose, find the offending class in this task's files and remove it.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 12: Commit**

```bash
git add src/features/mail/mailboxSlice.ts src/pages/communications/mailWho.ts src/pages/communications/ThreadMessage.tsx src/pages/communications/MailDetail.tsx src/pages/communications/MailDetail.test.tsx src/pages/communications/MailList.tsx src/pages/communications/MailList.test.tsx src/pages/communications/queueColumns.ts src/pages/communications/MailboxNotice.tsx src/pages/communications/MailboxNotice.test.tsx src/pages/communications/MailboxPanel.tsx src/pages/communications/MailboxView.tsx src/pages/communications/MailboxView.test.tsx src/e2e/gmail.test.tsx
git commit -m "feat(comms): conversations and the open conversation in the mailbox

Lists GET mail/threads/ (Sent and Drafts keep messages), opens a whole
thread with older messages folded, marks it read on open, and applies
star, unread, mute and done at once with a revert on refusal.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

If `src/test/uiRatchet.test.ts` changed in Step 11, add it to the `git add` line.

---

### Task 4: Gmail's own actions: delete, spam and labels

**Files:**
- Modify: `src/pages/communications/MailLabels.tsx`
- Create: `src/pages/communications/LabelMenu.tsx`
- Modify: `src/pages/communications/MailDetail.tsx`
- Modify: `src/pages/communications/MailboxPanel.tsx`
- Modify: `src/pages/communications/MailboxView.tsx`
- Test: `src/pages/communications/LabelMenu.test.tsx`, `src/pages/communications/MailLabels.test.tsx`, `src/pages/communications/MailDetail.test.tsx`, `src/pages/communications/MailboxActions.test.tsx` (new)

**Interfaces:**
- Consumes: `labelState`, `LabelState` (Task 1); `createMailLabel`, `setMailLabel`, `labels` (Task 2); `MailDetail`, `MailboxView`'s `act`, `refused` (Task 3); `useDismiss` (`src/lib/useDismiss.ts`), `OverflowMenu` (`src/components/ui`).
- Produces: `LabelDot({ label: Pick<MailLabel, 'color'> })` (`MailLabels.tsx`); `LabelMenu({ variant: 'icon' | 'button', labels: MailLabelEntry[], stateOf: (id: number) => LabelState, disabled?: boolean, disabledReason?: string | null, onToggle: (id: number, add: boolean) => void, onCreate: (name: string) => Promise<string | null> })`; `MailDetail` gains props `labels: MailLabelEntry[]` and `onCreateLabel: (name: string) => Promise<string | null>`; `MailboxPanel` gains `label: number | null`, `labels: MailLabelEntry[]`, `onLabel: (id: number) => void`; `MailboxView` gains `createLabel(name: string, apply: (id: number) => void): Promise<string | null>`. The sidebar's group is `section[aria-label="Labels"]`; the menu is `div[role="dialog"][aria-label="Labels"]`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/communications/LabelMenu.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LabelMenu } from './LabelMenu';
import { MAIL_LABELS } from '../../features/mail/testMail';
import type { LabelState } from '../../features/mail/mailOptimistic';

// Unit tier: the label menu alone (D2 contract §4, Decision 13).

const PILOT = { id: 12, gmail_id: null, name: 'Pilot', color: null, unread: 0, pending: true };

function renderMenu(states: Record<number, LabelState>, onCreate = vi.fn(async (_name: string): Promise<string | null> => null), disabled = false) {
  const onToggle = vi.fn();
  render(
    <LabelMenu
      variant="icon"
      labels={[PILOT, ...MAIL_LABELS]}
      stateOf={(id) => states[id] ?? 'none'}
      disabled={disabled}
      disabledReason={disabled ? 'Changes here cannot reach Gmail.' : null}
      onToggle={onToggle}
      onCreate={onCreate}
    />,
  );
  return { onToggle, onCreate };
}

describe('LabelMenu', () => {
  it('ticks what every message carries, shows mixed ones, and says which are not in Gmail yet', async () => {
    renderMenu({ 7: 'all', 11: 'some' });
    await userEvent.click(screen.getByRole('button', { name: 'Labels' }));
    const menu = screen.getByRole('dialog', { name: 'Labels' });
    expect(within(menu).getByRole('checkbox', { name: /Renewals/ })).toBeChecked();
    const q4 = within(menu).getByRole('checkbox', { name: /Q4/ }) as HTMLInputElement;
    expect(q4.checked).toBe(false);
    expect(q4.indeterminate).toBe(true);
    expect(within(menu).getByText('Not in Gmail yet')).toBeInTheDocument();
  });

  it('removes a label every message has, and adds one that some or none have', async () => {
    const { onToggle } = renderMenu({ 7: 'all', 11: 'some' });
    await userEvent.click(screen.getByRole('button', { name: 'Labels' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Renewals/ }));
    expect(onToggle).toHaveBeenLastCalledWith(7, false);
    await userEvent.click(screen.getByRole('checkbox', { name: /Q4/ }));
    expect(onToggle).toHaveBeenLastCalledWith(11, true);
  });

  it('creates a label from its own field, trimmed, and keeps a refusal inside the menu', async () => {
    const onCreate = vi.fn(async (name: string): Promise<string | null> => (name === 'INBOX' ? 'Gmail keeps that name for itself.' : null));
    renderMenu({}, onCreate);
    await userEvent.click(screen.getByRole('button', { name: 'Labels' }));
    const field = screen.getByLabelText('New label');
    await userEvent.type(field, 'INBOX');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gmail keeps that name for itself.');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(field);
    await userEvent.type(field, '  Pilot ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenLastCalledWith('Pilot');
    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('closes on Escape and hands focus back to its button', async () => {
    renderMenu({});
    const trigger = screen.getByRole('button', { name: 'Labels' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Labels' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('stays shut while the mailbox cannot reach Gmail, and says why', () => {
    renderMenu({}, undefined, true);
    const trigger = screen.getByRole('button', { name: 'Labels' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('title', 'Changes here cannot reach Gmail.');
  });
});
```

In `src/pages/communications/MailLabels.test.tsx`, add inside the `describe`:

```tsx
  it('draws a label that is not in Gmail yet with a dashed edge and says so', () => {
    render(<LabelChips labels={[{ id: 12, name: 'Pilot', color: null, pending: true }]} />);
    const chip = screen.getByText('Pilot').parentElement as HTMLElement;
    expect(chip).toHaveClass('border-dashed');
    expect(chip).toHaveAttribute('title', 'Not in Gmail yet');
  });
```

In `src/pages/communications/MailDetail.test.tsx`:
- add `MAIL_LABELS` and `OUTLOOK` to the `testMail` import;
- in `renderThread`, replace `const handlers = { onAction: vi.fn(), onUnmute: vi.fn(), onReply: vi.fn(), onRetry: vi.fn() };` with `const handlers = { onAction: vi.fn(), onUnmute: vi.fn(), onReply: vi.fn(), onRetry: vi.fn(), onCreateLabel: vi.fn(async (): Promise<string | null> => null) };` and add `labels={MAIL_LABELS}` to the `<MailDetail ... />` props;
- add inside the `describe`:

```tsx
  it("offers Gmail's own actions: Delete, Labels and Report spam; Restore in Trash, Not spam in Spam", async () => {
    const { pane, onAction } = renderThread([MAIL_DETAIL]);
    await userEvent.click(within(pane).getByRole('button', { name: 'Delete' }));
    expect(onAction).toHaveBeenLastCalledWith({ trashed: true });
    expect(within(pane).getByRole('button', { name: 'Labels' })).toBeEnabled();
    await userEvent.click(within(pane).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Report spam' }));
    expect(onAction).toHaveBeenLastCalledWith({ spam: true });
  });

  it('restores from Trash and unmarks spam from Spam', async () => {
    const trash = renderThread([{ ...MAIL_DETAIL, folder: 'trash' }], { folder: 'trash' });
    await userEvent.click(within(trash.pane).getByRole('button', { name: 'Restore' }));
    expect(trash.onAction).toHaveBeenLastCalledWith({ trashed: false });
  });

  it('marks not spam from Spam', async () => {
    const spam = renderThread([{ ...MAIL_DETAIL, folder: 'spam' }], { folder: 'spam' });
    await userEvent.click(within(spam.pane).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not spam' }));
    expect(spam.onAction).toHaveBeenLastCalledWith({ spam: false });
  });

  it("shows none of Gmail's own actions for Outlook", () => {
    const { pane } = renderThread([MAIL_DETAIL], { gate: mailActionGate(OUTLOOK, null) });
    expect(within(pane).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'Labels' })).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(within(pane).getByRole('button', { name: 'Mark done' })).toBeEnabled();
  });
```

Create `src/pages/communications/MailboxActions.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../store';
import CommunicationsPage from './CommunicationsPage';
import { D2_MESSAGES, OUTLOOK, stubMail } from '../../features/mail/testMail';
import { calls, sent } from '../../features/agents/testAgents';

// Integration tier: two-way Gmail D2 in the real page and store; only
// fetch is stubbed, with the D2 contract's shapes (stubMail).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderMailbox(url = '/communications?source=mailbox:google') {
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/communications" element={<CommunicationsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

/** Opens Ann's conversation once the connection (the action gate) is read. */
async function openAnn(store: ReturnType<typeof renderMailbox>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  await userEvent.click(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
  const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
  await within(pane).findByRole('article', { name: /^Ann Lee, / });
  return { mailbox, pane };
}

describe('Gmail labels (D2 contract §4)', () => {
  it('lists labels in the sidebar with their unread conversations, and opens a label view', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    const group = await within(mailbox).findByRole('region', { name: 'Labels' });
    const renewals = await within(group).findByRole('button', { name: /^Renewals/ });
    expect(renewals).toHaveTextContent('1');
    await userEvent.click(renewals);
    await waitFor(() => expect(calls(spy, 'GET', '/mail/threads/')).toContain('/mail/threads/?folder=all&label=7'));
    expect(within(mailbox).getByRole('heading', { level: 2, name: 'Renewals' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /^Renewals/ })).toHaveAttribute('aria-current', 'page');
  });

  it('applies and removes a label on the conversation, and creates one that is not in Gmail yet', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const { mailbox, pane } = await openAnn(store);
    await userEvent.click(await within(pane).findByRole('button', { name: 'Labels' }));
    const menu = within(pane).getByRole('dialog', { name: 'Labels' });
    const q4 = within(menu).getByRole('checkbox', { name: /Q4/ }) as HTMLInputElement;
    expect(q4.indeterminate).toBe(true);
    await userEvent.click(q4);
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ add_labels: [11] }));
    await waitFor(() => expect(within(menu).getByRole('checkbox', { name: /Q4/ })).toBeChecked());
    await userEvent.click(within(menu).getByRole('checkbox', { name: /Q4/ }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ remove_labels: [11] }));
    await userEvent.type(within(menu).getByLabelText('New label'), 'Pilot');
    await userEvent.click(within(menu).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(sent(spy, 'POST', '/mail/labels/')).toEqual([{ name: 'Pilot' }]));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ add_labels: [12] }));
    const sidebar = within(mailbox).getByRole('region', { name: 'Labels' });
    expect(within(sidebar).getByRole('button', { name: /^Pilot/ })).toHaveAttribute('title', 'Not in Gmail yet');
  });
});

describe("Gmail's own actions (D2 contract §3)", () => {
  it('deletes, restores from Trash, and reports spam', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const { mailbox, pane } = await openAnn(store);
    await userEvent.click(await within(pane).findByRole('button', { name: 'Delete' }));
    expect(await within(mailbox).findByRole('region', { name: 'Mail' })).toBeInTheDocument();
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ trashed: true }));
    await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeNull());

    await userEvent.click(within(mailbox).getByRole('button', { name: 'Trash' }));
    await userEvent.click(await within(mailbox).findByRole('button', { name: /Ann Lee/ }));
    const trashed = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(trashed).findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ trashed: false }));

    await userEvent.click(within(mailbox).getByRole('button', { name: /^Inbox/ }));
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
    const again = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(again).findByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Report spam' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ spam: true }));
  });

  it("hides Gmail's own actions and the labels for Outlook", async () => {
    stubMail({ connection: OUTLOOK, labels: [], messages: D2_MESSAGES });
    const store = renderMailbox('/communications?source=mailbox:microsoft');
    const { mailbox, pane } = await openAnn(store);
    expect(store.getState().mail.connection?.provider).toBe('microsoft');
    expect(within(pane).getByRole('button', { name: 'Mark done' })).toBeEnabled();
    expect(within(pane).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'Labels' })).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'More actions' })).toBeNull();
    expect(within(mailbox).queryByRole('region', { name: 'Labels' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/pages/communications/LabelMenu.test.tsx src/pages/communications/MailLabels.test.tsx src/pages/communications/MailDetail.test.tsx src/pages/communications/MailboxActions.test.tsx --maxWorkers=2`
Expected: FAIL: `./LabelMenu` cannot be resolved; no Delete, Labels or More actions buttons; no Labels group.

- [ ] **Step 3: The dot, and pending chips**

Replace the whole of `src/pages/communications/MailLabels.tsx` with:

```tsx
// Gmail's user labels on a mail row, the open conversation and the sidebar
// (contract §6; D2 §4). Each chip is a neutral pill in tokens, so it reads
// in both themes, with the label's own Gmail colour as its dot: the
// person's own key, kept from Gmail (D1 Decision 4). A label made here and
// not yet created in Gmail has a dashed edge (D2 Decision 13).

import type { MailLabel } from '../../features/mail/mailboxSlice';
import { LABEL_PENDING } from '../../features/mail/mailText';
import { NUM, TYPE } from '../../components/ui';

const HEX6 = /^#[0-9a-f]{6}$/i;

/** The label's Gmail colour as a 6px dot, or the faint ink without one. */
export function LabelDot({ label }: { label: Pick<MailLabel, 'color'> }) {
  const colour = label.color && HEX6.test(label.color.background) ? label.color.background : null;
  return <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${colour ? '' : 'bg-ink-faint'}`} style={colour ? { backgroundColor: colour } : undefined} />;
}

export function LabelChips({ labels, max }: { labels: MailLabel[]; max?: number }) {
  if (labels.length === 0) return null;
  const shown = max === undefined ? labels : labels.slice(0, max);
  const more = labels.length - shown.length;
  return (
    <span role="group" aria-label={`Labels: ${labels.map((l) => l.name).join(', ')}`} className="inline-flex min-w-0 flex-wrap items-center gap-1 align-middle">
      {shown.map((label) => (
        <span
          key={label.id}
          title={label.pending ? LABEL_PENDING : undefined}
          className={`inline-flex max-w-[10rem] items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-[11px] leading-4 text-ink-muted ${label.pending ? 'border border-dashed border-line' : ''}`}
        >
          <LabelDot label={label} />
          <span className="truncate">{label.name}</span>
        </span>
      ))}
      {more > 0 ? <span className={`${TYPE.meta} ${NUM}`}>+{more}</span> : null}
    </span>
  );
}
```

- [ ] **Step 4: The label menu**

Create `src/pages/communications/LabelMenu.tsx`:

```tsx
// Apply, remove and create Gmail labels on the open conversation or the
// selection (spec §4, Decision 13). A box per label: ticked when every
// message (or every selected conversation) carries it, mixed when some do.
// A new label is made at once and created in Gmail on the next tick
// (contract decision 20); the caller applies it straight away.

import { useId, useRef, useState, type FormEvent } from 'react';
import { Tag } from 'lucide-react';
import type { MailLabelEntry } from '../../features/mail/mailboxSlice';
import type { LabelState } from '../../features/mail/mailOptimistic';
import { LABEL_PENDING } from '../../features/mail/mailText';
import { useDismiss } from '../../lib/useDismiss';
import { BUTTON, FOCUS, ICON_BUTTON, INPUT, INVALID, OVERLAY, TYPE } from '../../components/ui';
import { LabelDot } from './MailLabels';

export function LabelMenu({
  variant,
  labels,
  stateOf,
  disabled = false,
  disabledReason = null,
  onToggle,
  onCreate,
}: {
  /** An icon in the conversation's toolbar; a worded button in the bulk bar. */
  variant: 'icon' | 'button';
  labels: MailLabelEntry[];
  stateOf: (id: number) => LabelState;
  disabled?: boolean;
  disabledReason?: string | null;
  onToggle: (id: number, add: boolean) => void;
  /** Resolves to the refusal's sentence, or null once it is made and applied. */
  onCreate: (name: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();

  useDismiss(
    [triggerRef, panelRef],
    (reason) => {
      setOpen(false);
      if (reason === 'escape') triggerRef.current?.focus();
    },
    open,
  );

  async function create(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setError(null);
    const refusal = await onCreate(trimmed);
    setCreating(false);
    if (refusal) setError(refusal);
    else setName('');
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        disabled={disabled}
        title={disabledReason ?? 'Labels'}
        aria-label={variant === 'icon' ? 'Labels' : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={variant === 'icon' ? ICON_BUTTON : BUTTON}
      >
        <Tag className="h-4 w-4" aria-hidden="true" />
        {variant === 'button' ? 'Label' : null}
      </button>
      {open ? (
        <div ref={panelRef} role="dialog" aria-label="Labels" className={`absolute right-0 top-full z-30 mt-1 flex max-h-[60dvh] w-64 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto p-3 ${OVERLAY}`}>
          <fieldset>
            <legend className={`mb-1 ${TYPE.label}`}>Apply labels</legend>
            {labels.length === 0 ? <p className={TYPE.bodyMuted}>No labels yet.</p> : null}
            {labels.map((label) => {
              const state = stateOf(label.id);
              return (
                <label key={label.id} className="flex min-h-11 items-center gap-2 text-[13px] leading-5 text-ink sm:min-h-8">
                  <input
                    type="checkbox"
                    checked={state === 'all'}
                    ref={(box) => {
                      if (box) box.indeterminate = state === 'some';
                    }}
                    onChange={() => onToggle(label.id, state !== 'all')}
                    className={`h-4 w-4 accent-accent ${FOCUS}`}
                  />
                  <LabelDot label={label} />
                  <span className="min-w-0 flex-1 truncate">{label.name}</span>
                  {label.pending ? <span className={TYPE.meta}>{LABEL_PENDING}</span> : null}
                </label>
              );
            })}
          </fieldset>
          <form onSubmit={create} className="flex flex-col gap-1 border-t border-line-subtle pt-3">
            <label htmlFor={fieldId} className={TYPE.label}>
              New label
            </label>
            <div className="flex gap-2">
              <input
                id={fieldId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={225}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${fieldId}-error` : undefined}
                className={`${INPUT} ${INVALID}`}
              />
              <button type="submit" disabled={creating || name.trim() === ''} className={BUTTON}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
            {error ? (
              <p id={`${fieldId}-error`} role="alert" className="text-[11px] leading-4 text-danger-ink">
                {error}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Delete, restore, spam and labels on the conversation**

In `src/pages/communications/MailDetail.tsx`:

Replace the lucide import with `import { ArchiveRestore, ArrowUpRight, Check, MailOpen, Star, Trash2, VolumeX } from 'lucide-react';`, the slice type import with `import type { MailFolder, MailLabelEntry, MailThreadDetail, ThreadPatch } from '../../features/mail/mailboxSlice';`, the ui import with `import { Badge, BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, FOCUS, ICON_BUTTON, INLINE_TARGET, LoadingState, NUM, OverflowMenu, QUIET, TYPE } from '../../components/ui';`, and add:

```tsx
import { labelState } from '../../features/mail/mailOptimistic';
import { LabelMenu } from './LabelMenu';
```

Add to the destructured props, after `gate,`: `  labels,` and after `onReply,`: `  onCreateLabel,`; add to the props type, after `gate: MailActionGate;`:

```tsx
  /** The mailbox's labels, for the label menu. */
  labels: MailLabelEntry[];
```

and after `onReply: (messageId: number, body: string) => void;`:

```tsx
  /** Creates a label and applies it here; resolves to a refusal or null. */
  onCreateLabel: (name: string) => Promise<string | null>;
```

Replace the whole `<div role="toolbar" aria-label="Conversation actions" ...>...</div>` block with:

```tsx
          <div role="toolbar" aria-label="Conversation actions" className="shrink-0 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => onAction({ is_starred: !starred })}
              disabled={off}
              aria-pressed={starred}
              aria-label={starred ? 'Unstar' : 'Star'}
              title={offTitle ?? (starred ? 'Unstar' : 'Star')}
              className={ICON_BUTTON}
            >
              <Star className={`h-4 w-4 ${starred ? 'text-warning' : ''}`} fill={starred ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onAction({ is_read: false })} disabled={off} aria-label="Mark unread" title={offTitle ?? 'Mark unread'} className={ICON_BUTTON}>
              <MailOpen className="h-4 w-4" aria-hidden="true" />
            </button>
            {gate.gmail ? (
              <LabelMenu
                variant="icon"
                labels={labels}
                stateOf={(id) => labelState(thread.messages, id)}
                disabled={off}
                disabledReason={gate.blocked}
                onToggle={(id, add) => onAction(add ? { add_labels: [id] } : { remove_labels: [id] })}
                onCreate={onCreateLabel}
              />
            ) : null}
            {gate.gmail ? (
              inTrash ? (
                <button type="button" onClick={() => onAction({ trashed: false })} disabled={off} aria-label="Restore" title={offTitle ?? 'Restore'} className={ICON_BUTTON}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button type="button" onClick={() => onAction({ trashed: true })} disabled={off} aria-label="Delete" title={offTitle ?? 'Delete'} className={ICON_BUTTON}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )
            ) : null}
            {gate.gmail && !off ? (
              <OverflowMenu
                items={[
                  folder === 'spam'
                    ? { key: 'not-spam', label: 'Not spam', onSelect: () => onAction({ spam: false }) }
                    : { key: 'spam', label: 'Report spam', onSelect: () => onAction({ spam: true }) },
                ]}
              />
            ) : null}
            <button
              type="button"
              onClick={() => (state === 'muted' ? onUnmute() : onAction({ state: 'muted' }))}
              aria-pressed={state === 'muted'}
              aria-label={state === 'muted' ? 'Unmute' : 'Mute'}
              title={state === 'muted' ? 'Unmute' : 'Mute'}
              className={`${ICON_BUTTON} ${state === 'muted' ? 'bg-subtle text-ink' : ''}`}
            >
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onAction({ state: state === 'done' ? 'open' : 'done' })} disabled={off} title={offTitle} aria-pressed={state === 'done'} className={BUTTON}>
              <Check className="h-4 w-4" aria-hidden="true" />
              {state === 'done' ? 'Done' : 'Mark done'}
            </button>
          </div>
```

- [ ] **Step 6: Labels in the sidebar**

In `src/pages/communications/MailboxPanel.tsx`:
- replace the lucide import with `import { AlertCircle, Ban, ChevronDown, ChevronRight, LayoutList, SlidersHorizontal, Star, Tag, Trash2 } from 'lucide-react';`;
- replace `import type { MailCategory, MailFolder, MailSummary } from '../../features/mail/mailboxSlice';` with `import type { MailCategory, MailFolder, MailLabelEntry, MailSummary } from '../../features/mail/mailboxSlice';` and add `import { LABEL_PENDING } from '../../features/mail/mailText';` and `import { LabelDot } from './MailLabels';`;
- in the file comment replace `// categories. Folders and flags pick a list; a category narrows it.` with `// categories, and Gmail's labels. Folders, flags and labels pick a list; a\n// category narrows it.`;
- in `MailboxPanel`'s destructured props add `label,` after `priority,` and `labels,` after `summary,` and `onLabel,` after `onPriority,`; in its props type add `label: number | null;` after `priority: boolean;`, `labels: MailLabelEntry[];` after `summary: MailSummary | null;`, and `onLabel: (id: number) => void;` after `onPriority: (next: boolean) => void;`;
- after `const [categoriesOpen, setCategoriesOpen] = useState(true);` add `const [labelsOpen, setLabelsOpen] = useState(true);`;
- in the Folders `nav`, replace `const active = f === folder;` with `const active = f === folder && label === null;` (the first occurrence, inside `FOLDERS.map`);
- directly after the closing `</nav>` add:

```tsx
      {labels.length > 0 ? (
        <Group title="Labels" icon={Tag} open={labelsOpen} onToggle={() => setLabelsOpen((o) => !o)}>
          {labels.map((l) => {
            const active = l.id === label;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onLabel(l.id)}
                aria-current={active ? 'page' : undefined}
                title={l.pending ? LABEL_PENDING : undefined}
                className={`${FOLDER} ${active ? FOLDER_ON : FOLDER_OFF}`}
              >
                <LabelDot label={l} />
                <span className={`flex-1 truncate ${l.pending ? 'text-ink-faint' : ''}`}>{l.name}</span>
                {l.pending ? <span className="sr-only">{LABEL_PENDING}</span> : null}
                {l.unread > 0 ? (
                  <span className={`${TYPE.meta} ${NUM}`}>
                    {l.unread}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </Group>
      ) : null}
```

- [ ] **Step 7: Wire labels into the mailbox**

In `src/pages/communications/MailboxView.tsx`:
- add `createMailLabel,` and `setMailLabel,` to the `mailboxSlice` import (alphabetical places);
- after `function refused(...) { ... }` add:

```tsx
  /** Creates a label and applies it (Decision 13); a refusal comes back as the menu's sentence. */
  async function createLabel(name: string, apply: (id: number) => void): Promise<string | null> {
    const result = await dispatch(createMailLabel(name));
    if (createMailLabel.fulfilled.match(result)) {
      apply(result.payload.id);
      return null;
    }
    const failure = createMailLabel.rejected.match(result) ? result.payload : undefined;
    refused(failure?.code ?? null);
    return failure ? failure.text : null;
  }
```

- in `<MailboxPanel ... />`, add after `priority={priority}`: `label={label}`, after `summary={summary}`: `labels={labels}`, and after `onPriority={...}`: `onLabel={(id) => dispatch(setMailLabel(id))}`;
- in `<MailDetail ... />`, add after `gate={gate}`: `labels={labels}`, and after `onReply={...}`: `onCreateLabel={(name) => createLabel(name, (id) => void act({ add_labels: [id] }))}`.

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx vitest run src/pages/communications src/components/ops.houseRules.test.ts src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/pages/communications/MailLabels.tsx src/pages/communications/MailLabels.test.tsx src/pages/communications/LabelMenu.tsx src/pages/communications/LabelMenu.test.tsx src/pages/communications/MailDetail.tsx src/pages/communications/MailDetail.test.tsx src/pages/communications/MailboxPanel.tsx src/pages/communications/MailboxView.tsx src/pages/communications/MailboxActions.test.tsx
git commit -m "feat(comms): gmail labels, delete, restore and spam in the mailbox

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Bulk select

**Files:**
- Create: `src/pages/communications/MailBulkBar.tsx`
- Modify: `src/pages/communications/MailList.tsx`
- Modify: `src/pages/communications/MailboxView.tsx`
- Test: `src/pages/communications/MailList.test.tsx`, `src/pages/communications/MailboxActions.test.tsx`

**Interfaces:**
- Consumes: `bulkMailAction`, `toggleChecked`, `setChecked`, `checked`, `bulkBusy` (Task 2); `labelState` (Task 1); `LabelMenu` (Task 4); `MailboxView`'s `bulk`, `createLabel` (Tasks 3, 4).
- Produces: `MailBulkBar({ rows: MailThread[], checked: readonly number[], folder: MailFolder, gate: MailActionGate, labels: MailLabelEntry[], busy: boolean, onCheck: (ids: number[]) => void, onBulk: (op: MailOp, labelId?: number) => void, onCreateLabel: (name: string) => Promise<string | null> })`, `div[role="toolbar"][aria-label="Selected conversations"]`; `MailList` gains `checked?: readonly number[]` and `onToggleCheck?: (id: number) => void`, each row's box named "Select <title>".

- [ ] **Step 1: Write the failing tests**

In `src/pages/communications/MailList.test.tsx`, add `import userEvent from '@testing-library/user-event';` and inside the `describe`:

```tsx
  it('ticks a row from its own box, hidden until hover from sm unless something is ticked', async () => {
    const onToggleCheck = vi.fn();
    const { rerender } = render(<MailList rows={[ROW]} isLoading={false} onSelect={vi.fn()} emptyState={null} checked={[]} onToggleCheck={onToggleCheck} />);
    const box = screen.getByRole('checkbox', { name: 'Select Ann Lee' });
    expect(box.parentElement).toHaveClass('sm:opacity-0', 'min-h-11', 'min-w-11');
    await userEvent.click(box);
    expect(onToggleCheck).toHaveBeenCalledWith(1);
    rerender(<MailList rows={[ROW]} isLoading={false} onSelect={vi.fn()} emptyState={null} checked={[1]} onToggleCheck={onToggleCheck} />);
    expect(screen.getByRole('checkbox', { name: 'Select Ann Lee' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Ann Lee' }).parentElement).not.toHaveClass('sm:opacity-0');
  });
```

In `src/pages/communications/MailboxActions.test.tsx`, add `GOOGLE` to the `testMail` import and `import { TWO_WAY_OFF_TEXT } from '../../features/mail/mailText';`, then append:

```tsx
describe('Bulk select (spec §4)', () => {
  it('ticks conversations, marks them read in one request, then deletes every one on the page', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await userEvent.click(await within(mailbox).findByRole('checkbox', { name: 'Select Dana Ruiz, Ann Lee' }));
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select Circleback' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    expect(bar).toHaveTextContent('2 selected');
    await userEvent.click(within(bar).getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(sent(spy, 'POST', '/mail/actions/')).toEqual([{ op: 'read', thread_of: [1, 4] }]));
    await waitFor(() => expect(bar).not.toHaveTextContent('selected'));
    await userEvent.click(within(bar).getByRole('checkbox', { name: 'Select every conversation on this page' }));
    await userEvent.click(await within(bar).findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent(spy, 'POST', '/mail/actions/')).toContainEqual({ op: 'trash', thread_of: [1, 4] }));
    expect(await within(mailbox).findByText('Inbox zero')).toBeInTheDocument();
  });

  it('labels the selection, mixed where only some carry the label', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select every conversation on this page' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    await userEvent.click(await within(bar).findByRole('button', { name: 'Label' }));
    const renewals = within(bar).getByRole('checkbox', { name: /Renewals/ }) as HTMLInputElement;
    expect(renewals.indeterminate).toBe(true);
    await userEvent.click(renewals);
    await waitFor(() => expect(sent(spy, 'POST', '/mail/actions/')).toEqual([{ op: 'label_add', thread_of: [1, 4], label_id: 7 }]));
  });

  it('keeps the selection actions off while two-way is off, with the reason', async () => {
    stubMail({ messages: D2_MESSAGES, connection: { ...GOOGLE, two_way: false } });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection?.two_way).toBe(false));
    await userEvent.click(await within(mailbox).findByRole('checkbox', { name: 'Select Circleback' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    expect(within(bar).getByRole('button', { name: 'Mark done' })).toBeDisabled();
    expect(within(bar).getByRole('button', { name: 'Mark done' })).toHaveAttribute('title', TWO_WAY_OFF_TEXT);
    expect(within(bar).getByRole('button', { name: 'Clear' })).toBeEnabled();
  });

  it('offers no Delete or Label to an Outlook selection', async () => {
    stubMail({ connection: OUTLOOK, labels: [], messages: D2_MESSAGES });
    const store = renderMailbox('/communications?source=mailbox:microsoft');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection?.provider).toBe('microsoft'));
    await userEvent.click(await within(mailbox).findByRole('checkbox', { name: 'Select Circleback' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    expect(within(bar).getByRole('button', { name: 'Mark done' })).toBeEnabled();
    expect(within(bar).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(bar).queryByRole('button', { name: 'Label' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/pages/communications/MailList.test.tsx src/pages/communications/MailboxActions.test.tsx --maxWorkers=2`
Expected: FAIL: no checkbox named "Select Ann Lee"; no "Selected conversations" toolbar.

- [ ] **Step 3: The bulk bar**

Create `src/pages/communications/MailBulkBar.tsx`:

```tsx
// The selection's actions (spec §4 "Bulk select", Decision 14): tick
// conversations, or every one on the page, then Mark done, Mark read or
// unread, Label or Delete, each in one request (contract §3,
// POST mail/actions/). Gmail's own actions show for Gmail only; every
// action but Clear waits while a bulk request runs or the mailbox cannot
// reach Gmail.

import { ArchiveRestore, Check, Inbox, Mail, MailOpen, Trash2 } from 'lucide-react';
import type { MailFolder, MailLabelEntry, MailOp, MailThread } from '../../features/mail/mailboxSlice';
import { labelState } from '../../features/mail/mailOptimistic';
import type { MailActionGate } from '../../features/mail/mailText';
import { BUTTON, FOCUS, NUM, QUIET, TYPE } from '../../components/ui';
import { LabelMenu } from './LabelMenu';

export function MailBulkBar({
  rows,
  checked,
  folder,
  gate,
  labels,
  busy,
  onCheck,
  onBulk,
  onCreateLabel,
}: {
  rows: MailThread[];
  checked: readonly number[];
  folder: MailFolder;
  gate: MailActionGate;
  labels: MailLabelEntry[];
  busy: boolean;
  /** The new ticked set: every row on the page, or none. */
  onCheck: (ids: number[]) => void;
  onBulk: (op: MailOp, labelId?: number) => void;
  /** Creates a label and applies it to the selection. */
  onCreateLabel: (name: string) => Promise<string | null>;
}) {
  const ids = rows.map((row) => row.id);
  const all = ids.length > 0 && ids.every((id) => checked.includes(id));
  const some = checked.length > 0 && !all;
  const selected = rows.filter((row) => checked.includes(row.id));
  const anyUnread = selected.some((row) => !row.is_read);
  const off = busy || Boolean(gate.blocked);
  const title = gate.blocked ?? undefined;

  return (
    <div role="toolbar" aria-label="Selected conversations" className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-1">
      <label className="inline-flex min-h-11 items-center gap-2 sm:min-h-9">
        <input
          type="checkbox"
          checked={all}
          ref={(box) => {
            if (box) box.indeterminate = some;
          }}
          onChange={() => onCheck(all ? [] : ids)}
          aria-label="Select every conversation on this page"
          className={`h-4 w-4 accent-accent ${FOCUS}`}
        />
        {checked.length > 0 ? (
          <span className={TYPE.meta}>
            <span className={NUM}>{checked.length}</span> selected
          </span>
        ) : null}
      </label>
      {checked.length > 0 ? (
        <>
          {folder === 'done' ? (
            <button type="button" onClick={() => onBulk('inbox')} disabled={off} title={title} className={BUTTON}>
              <Inbox className="h-4 w-4" aria-hidden="true" />
              Move to Inbox
            </button>
          ) : (
            <button type="button" onClick={() => onBulk('archive')} disabled={off} title={title} className={BUTTON}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Mark done
            </button>
          )}
          <button type="button" onClick={() => onBulk(anyUnread ? 'read' : 'unread')} disabled={off} title={title} className={BUTTON}>
            {anyUnread ? <MailOpen className="h-4 w-4" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
            {anyUnread ? 'Mark read' : 'Mark unread'}
          </button>
          {gate.gmail ? (
            <LabelMenu
              variant="button"
              labels={labels}
              stateOf={(id) => labelState(selected, id)}
              disabled={off}
              disabledReason={gate.blocked}
              onToggle={(id, add) => onBulk(add ? 'label_add' : 'label_remove', id)}
              onCreate={onCreateLabel}
            />
          ) : null}
          {gate.gmail ? (
            folder === 'trash' ? (
              <button type="button" onClick={() => onBulk('untrash')} disabled={off} title={title} className={BUTTON}>
                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                Restore
              </button>
            ) : (
              <button type="button" onClick={() => onBulk('trash')} disabled={off} title={title} className={BUTTON}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            )
          ) : null}
          <button type="button" onClick={() => onCheck([])} className={QUIET}>
            Clear
          </button>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: A box on every row**

In `src/pages/communications/MailList.tsx`:
- change the ui import to `import { Badge, FOCUS, Initials, ListHeaderRow, ListRow, LoadingState, NUM, TYPE } from '../../components/ui';`;
- after `function initialsOf(...) { ... }` add:

```tsx
/** Density rule 12: a row's box shows on hover or focus from sm, always on
 *  touch, and always once anything is ticked. */
const BOX_UNTIL_HOVER = 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100';
```

- add `checked = [],` and `onToggleCheck,` to `MailList`'s destructured props (after `monthLevel = 'h3',`), and to its props type:

```tsx
  /** Ticked rows (bulk select); with `onToggleCheck`, every row has a box. */
  checked?: readonly number[];
  onToggleCheck?: (id: number) => void;
```

- inside `items.map((row) => {`, after `const first = row.participants[0];` add

```tsx
              const title = row.sent ? `To ${name}` : name;
```

  then change the `ListRow`'s `title={row.sent ? ...}` prop to `title={title}`, and replace its `leading={...}` prop with:

```tsx
                  leading={
                    <span className="flex items-center gap-1">
                      {onToggleCheck ? (
                        <label className={`relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center ${checked.length > 0 ? '' : BOX_UNTIL_HOVER}`}>
                          <input type="checkbox" checked={checked.includes(row.id)} onChange={() => onToggleCheck(row.id)} aria-label={`Select ${title}`} className={`h-4 w-4 accent-accent ${FOCUS}`} />
                        </label>
                      ) : null}
                      <span className="relative block">
                        <Initials text={initialsOf(first ? first.name || first.address : '')} />
                        {!row.is_read ? <span role="img" aria-label="Unread message" className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-info" /> : null}
                      </span>
                    </span>
                  }
```

`relative z-10` lifts the box over the row's stretched title, as `ROW_ACTIONS` does for row controls.

- [ ] **Step 5: Wire the selection**

In `src/pages/communications/MailboxView.tsx`:
- add `setChecked,` and `toggleChecked,` to the `mailboxSlice` import, and `import { MailBulkBar } from './MailBulkBar';`;
- add `checked, bulkBusy,` to the `useAppSelector((state) => state.mailbox)` destructuring (after `labels,`);
- directly before `<MailList` add:

```tsx
              {rows.length > 0 ? (
                <MailBulkBar
                  rows={rows}
                  checked={checked}
                  folder={folder}
                  gate={gate}
                  labels={labels}
                  busy={bulkBusy}
                  onCheck={(ids) => dispatch(setChecked(ids))}
                  onBulk={(op, labelId) => void bulk(op, [...checked], labelId)}
                  onCreateLabel={(name) => createLabel(name, (id) => void bulk('label_add', [...checked], id))}
                />
              ) : null}
```

- add to `<MailList ... />`: `checked={checked}` and `onToggleCheck={(id) => dispatch(toggleChecked(id))}`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/pages/communications src/components/ops.houseRules.test.ts src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/pages/communications/MailBulkBar.tsx src/pages/communications/MailList.tsx src/pages/communications/MailList.test.tsx src/pages/communications/MailboxView.tsx src/pages/communications/MailboxActions.test.tsx
git commit -m "feat(comms): bulk select with done, read, label and delete

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Keyboard

**Files:**
- Create: `src/pages/communications/useMailKeys.ts`
- Modify: `src/pages/communications/MailboxView.tsx`
- Modify: `src/pages/communications/MailDetail.tsx` (`aria-keyshortcuts`)
- Test: `src/pages/communications/useMailKeys.test.ts`, `src/pages/communications/MailDetail.test.tsx`, `src/pages/communications/MailboxActions.test.tsx`

**Interfaces:**
- Consumes: `MailboxView`'s `act`, `open`, `rows`, `gate`, `folder`, `selectedId` (Task 3); rows' `data-thread-id` (Task 3).
- Produces: `type MailKey = 'archive' | 'delete' | 'reply' | 'next' | 'previous'`; `typingIn(element: Element | null): boolean`; `useMailKeys(scope: RefObject<HTMLElement | null>, onKey: (key: MailKey) => void): void`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/communications/useMailKeys.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { typingIn, useMailKeys } from './useMailKeys';

// Unit tier: the keys and when they stay out of the way (Decision 8).

describe('typingIn', () => {
  it('is true in fields, editable text, dialogs, menus and the mail frame', () => {
    document.body.innerHTML =
      '<input id="i"><textarea id="t"></textarea><select id="s"></select><div contenteditable="true"><span id="c">x</span></div><div role="dialog"><button id="d">x</button></div><ul role="menu"><li id="m">x</li></ul><iframe id="f"></iframe><button id="b">x</button>';
    for (const id of ['i', 't', 's', 'c', 'd', 'm', 'f']) expect(typingIn(document.getElementById(id)), id).toBe(true);
    expect(typingIn(document.getElementById('b'))).toBe(false);
    expect(typingIn(null)).toBe(false);
  });
});

describe('useMailKeys', () => {
  it('maps e, j, #, r and k inside the mailbox, and nothing else', async () => {
    document.body.innerHTML = '<section id="mailbox"><button id="row">Row</button><input id="field"></section><button id="outside">x</button>';
    const scope = { current: document.getElementById('mailbox') };
    const onKey = vi.fn();
    renderHook(() => useMailKeys(scope, onKey));
    document.getElementById('row')!.focus();
    await userEvent.keyboard('ej#rkxacf');
    expect(onKey.mock.calls.map(([key]) => key)).toEqual(['archive', 'next', 'delete', 'reply', 'previous']);
  });

  it('stays out of the way with a modifier, in a field, and outside the mailbox', async () => {
    document.body.innerHTML = '<section id="mailbox"><button id="row">Row</button><input id="field"></section><button id="outside">x</button>';
    const scope = { current: document.getElementById('mailbox') };
    const onKey = vi.fn();
    renderHook(() => useMailKeys(scope, onKey));
    document.getElementById('row')!.focus();
    await userEvent.keyboard('{Control>}e{/Control}');
    document.getElementById('field')!.focus();
    await userEvent.keyboard('e');
    document.getElementById('outside')!.focus();
    await userEvent.keyboard('e');
    expect(onKey).not.toHaveBeenCalled();
  });

  it('acts from the page body', async () => {
    document.body.innerHTML = '<section id="mailbox"></section>';
    const scope = { current: document.getElementById('mailbox') };
    const onKey = vi.fn();
    renderHook(() => useMailKeys(scope, onKey));
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('j');
    expect(onKey).toHaveBeenCalledWith('next');
  });
});
```

In `src/pages/communications/MailDetail.test.tsx`, add inside the `describe`:

```tsx
  it('names its keyboard shortcuts', () => {
    const { pane } = renderThread([MAIL_DETAIL]);
    expect(within(pane).getByRole('button', { name: 'Mark done' })).toHaveAttribute('aria-keyshortcuts', 'e');
    expect(within(pane).getByRole('button', { name: 'Delete' })).toHaveAttribute('aria-keyshortcuts', '#');
  });
```

In `src/pages/communications/MailboxActions.test.tsx`, append:

```tsx
describe('Keyboard (Decision 8)', () => {
  it('j and k move through the list; e marks the focused one done and the next takes its place', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.keyboard('j');
    expect(within(mailbox).getByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toHaveFocus();
    await userEvent.keyboard('j');
    expect(within(mailbox).getByRole('button', { name: 'Circleback' })).toHaveFocus();
    await userEvent.keyboard('k');
    expect(within(mailbox).getByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toHaveFocus();
    await userEvent.keyboard('e');
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ state: 'done' }]));
    await waitFor(() => expect(within(mailbox).getByRole('button', { name: 'Circleback' })).toHaveFocus());
  });

  it('opens with Enter, r goes to the reply, typing never acts, and # deletes the open conversation', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.keyboard('jj{Enter}');
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByRole('heading', { level: 2, name: 'Invoice 1042' });
    await userEvent.keyboard('r');
    const reply = within(pane).getByLabelText('Reply');
    expect(reply).toHaveFocus();
    await userEvent.keyboard('e#');
    expect(reply).toHaveValue('e#');
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([]);
    reply.blur();
    await userEvent.keyboard('#');
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ trashed: true }]));
    expect(await within(mailbox).findByRole('region', { name: 'Mail' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/pages/communications/useMailKeys.test.ts src/pages/communications/MailDetail.test.tsx src/pages/communications/MailboxActions.test.tsx --maxWorkers=2`
Expected: FAIL: `./useMailKeys` cannot be resolved; no `aria-keyshortcuts`; no row takes focus on `j`.

- [ ] **Step 3: The keys**

Create `src/pages/communications/useMailKeys.ts`:

```ts
// The mailbox's keyboard (spec §4, Decision 8): e done, # delete, j and k
// next and previous, r reply. Reply all (a), Forward (f) and compose (c)
// wait for delivery 3. Off while the person types or reads elsewhere:
// inputs, text areas, selects, editable text, dialogs and menus (the label
// menu, the viewer), the mail frame, and anything outside the mailbox.

import { useEffect, type RefObject } from 'react';

export type MailKey = 'archive' | 'delete' | 'reply' | 'next' | 'previous';

const KEYS: Record<string, MailKey> = { e: 'archive', '#': 'delete', r: 'reply', j: 'next', k: 'previous' };

const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME', 'OBJECT']);

/** Whether a key press belongs to what has focus rather than to the mailbox. */
export function typingIn(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (FIELDS.has(element.tagName)) return true;
  return element.closest('[contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"]') !== null;
}

export function useMailKeys(scope: RefObject<HTMLElement | null>, onKey: (key: MailKey) => void): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const key = Object.hasOwn(KEYS, event.key) ? KEYS[event.key] : undefined;
      if (!key) return;
      const focused = document.activeElement;
      if (typingIn(focused) || (event.target instanceof Element && typingIn(event.target))) return;
      if (focused && focused !== document.body && !scope.current?.contains(focused)) return;
      event.preventDefault();
      onKey(key);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [scope, onKey]);
}
```

- [ ] **Step 4: Name the shortcuts on the buttons**

In `src/pages/communications/MailDetail.tsx`, on the Delete button add `aria-keyshortcuts="#"` (after `aria-label="Delete"`), and on the Mark done button add `aria-keyshortcuts="e"` (after `aria-pressed={state === 'done'}`).

- [ ] **Step 5: Wire the keys into the mailbox**

In `src/pages/communications/MailboxView.tsx`:
- add `import { useMailKeys } from './useMailKeys';`;
- after `const linked = params.get('message');` add:

```tsx
  const sectionRef = useRef<HTMLElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
```

- add `ref={sectionRef}` to the outer `<section aria-label="Mailbox" ...>` and `ref={regionRef}` to the `<div ... role="region" ...>`;
- after `async function sync() { ... }` and the `const rows = ...` line (so `rows` is in scope), add:

```tsx
  const rowButton = (id: number) => regionRef.current?.querySelector<HTMLButtonElement>(`[data-thread-id="${id}"] button[title]`) ?? null;
  const focusedRow = () => {
    const li = document.activeElement instanceof HTMLElement ? document.activeElement.closest('[data-thread-id]') : null;
    return li ? Number(li.getAttribute('data-thread-id')) : null;
  };

  useMailKeys(sectionRef, (key) => {
    const ids = rows.map((row) => row.id);
    if (key === 'next' || key === 'previous') {
      const at = ids.indexOf(selectedId ?? focusedRow() ?? -1);
      const to = key === 'next' ? at + 1 : Math.max(at - 1, 0);
      if (to >= ids.length) return;
      if (selectedId !== null) open(rows[to]);
      else rowButton(ids[to])?.focus();
      return;
    }
    if (key === 'reply') {
      if (selectedId !== null) regionRef.current?.querySelector('textarea')?.focus();
      return;
    }
    const target = selectedId ?? focusedRow();
    if (target === null || gate.blocked) return;
    if (key === 'delete' && (!gate.gmail || folder === 'trash')) return;
    const at = ids.indexOf(target);
    const neighbour = ids[at + 1] ?? ids[at - 1];
    void act(key === 'archive' ? { state: 'done' } : { trashed: true }, target);
    // The keyboard keeps its place: the row that moved up takes focus.
    if (neighbour !== undefined) window.setTimeout(() => rowButton(neighbour)?.focus(), 0);
  });
```

`ListRow`'s title control is the only `button[title]` inside a row: the checkbox is an `input`, the chips are spans.

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run src/pages/communications --maxWorkers=2`
Expected: PASS.

Run: `npx tsc -b && npm run lint`
Expected: exit 0 for both.

- [ ] **Step 7: Commit**

```bash
git add src/pages/communications/useMailKeys.ts src/pages/communications/useMailKeys.test.ts src/pages/communications/MailboxView.tsx src/pages/communications/MailDetail.tsx src/pages/communications/MailDetail.test.tsx src/pages/communications/MailboxActions.test.tsx
git commit -m "feat(comms): mailbox keyboard shortcuts e, #, j, k and r

Reply all, Forward and compose have nothing to call until delivery 3.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Attachments: open, preview, inline images, and filed mail's files on records

**Files:**
- Modify: `src/lib/apiClient.ts`
- Create: `src/features/mail/mailAttachments.ts`
- Create: `src/pages/communications/AttachmentViewer.tsx`
- Rewrite: `src/pages/communications/MailAttachments.tsx`
- Modify: `src/pages/communications/MailHtmlBody.tsx`
- Modify: `src/pages/communications/ThreadMessage.tsx`
- Modify: `src/features/mail/testMail.ts` (a zip and a `cid:` image on `MAIL_DETAIL`)
- Modify: `src/features/files/filesSlice.ts`, `src/features/files/fileFormat.ts`
- Modify: `src/components/organizations/detail/FileItem.tsx`, `src/components/organizations/activity/FilesTab.tsx`
- Test: `src/lib/apiClient.test.ts`, `src/features/mail/mailAttachments.test.ts`, `src/pages/communications/MailAttachments.test.tsx`, `src/pages/communications/MailHtmlBody.test.tsx`, `src/pages/communications/MailDetail.test.tsx` (stub the network), `src/features/files/fileFormat.test.ts`, `src/components/organizations/detail/FileItem.test.tsx`, `src/components/organizations/activity/FilesTab.test.tsx`

**Interfaces:**
- Consumes: `apiFetchBlob` (`lib/apiClient.ts`); `MailAttachmentMeta` (Task 1); `ATTACHMENT_UNAVAILABLE`, `PDF_UNSHOWN`, `attachmentFailure` (Task 1); `trapTab` (`lib/focusTrap.ts`).
- Produces (`mailAttachments.ts`): `PREVIEW_TYPES`, `INLINE_IMAGE_MAX_BYTES`, `saveUrl(url: string, name: string): void`, `openAttachment(file: Pick<MailAttachmentMeta, 'filename' | 'preview' | 'download_url'>): Promise<{ url: string; type: string } | null>`, `resolveInlineImages(html: string, attachments: readonly MailAttachmentMeta[]): Promise<string>`, `forgetInlineImages(): void` (tests). `AttachmentViewer({ name, url, type, onDownload, onClose })`. `MailHtmlBody` gains `attachments?: MailAttachmentMeta[]`. `Attachment` (files) gains `source: 'email'` and `email?: { id: number; subject: string; from: string } | null`; `canDeleteFile` takes `Pick<Attachment, 'uploaded_by'> & Partial<Pick<Attachment, 'source'>>`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/apiClient.test.ts`, change the import to `import { API_ORIGIN, apiFetch, apiFetchBlob, ApiError, endSession, SessionChangedError, setAuthHooks } from './apiClient';` and append:

```ts
describe('server-given paths (D2 Decision 11)', () => {
  it('prefixes a /api/v1/ download_url once, not twice', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['x']) });
    vi.stubGlobal('fetch', fetchMock);
    await apiFetchBlob('/api/v1/files/7/download/');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_ORIGIN}/api/v1/files/7/download/`);
    await apiFetchBlob('/files/7/download/');
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_ORIGIN}/api/v1/files/7/download/`);
    vi.unstubAllGlobals();
  });
});
```

Create `src/features/mail/mailAttachments.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetInlineImages, openAttachment, resolveInlineImages } from './mailAttachments';
import { MAIL_DETAIL, stubMail } from './testMail';
import { calls } from '../agents/testAgents';

// Unit tier with the network stubbed: opening a mail attachment and
// inlining cid: images (D2 contract §6, Decisions 9 and 10).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
});

const [PDF, LOGO] = MAIL_DETAIL.attachments;

describe('openAttachment', () => {
  it('previews a PDF from a blob fetched with the session, typed as a PDF', async () => {
    const { spy } = stubMail();
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    expect(await openAttachment(PDF)).toEqual({ url: 'blob:preview', type: 'application/pdf' });
    expect(calls(spy, 'GET', '/mail/attachments/')).toEqual(['/mail/attachments/31/download/']);
    expect((created.mock.calls[0][0] as Blob).type).toBe('application/pdf');
  });

  it('saves anything else, asking for the download disposition', async () => {
    const { spy } = stubMail();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await openAttachment({ ...PDF, preview: false, filename: 'Renewal quote.pdf' })).toBeNull();
    expect(calls(spy, 'GET', '/mail/attachments/')).toEqual(['/mail/attachments/31/download/?download=1']);
    expect(click).toHaveBeenCalledOnce();
  });

  it('never previews a type outside the list, whatever the attachment says', async () => {
    const { state } = stubMail();
    state.messages[0].attachments[0] = { ...PDF, mime_type: 'image/svg+xml' };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await openAttachment(PDF)).toBeNull();
  });

  it("refuses in the server's words", async () => {
    const { state } = stubMail();
    state.attachmentRefusals[31] = { status: 413, body: { code: 'ATTACHMENT_TOO_LARGE', detail: 'This file is too large to open here. Open it in Gmail.' } };
    await expect(openAttachment(PDF)).rejects.toThrow('This file is too large to open here. Open it in Gmail.');
  });
});

describe('resolveInlineImages', () => {
  it('writes a cid: image as a data: URL, fetching each part once', async () => {
    const { spy } = stubMail();
    const html = '<p>Hi</p><img src="cid:logo@pizzahut" alt="Logo">';
    expect(await resolveInlineImages(html, [LOGO])).toMatch(/<img src="data:image\/png;base64,[^"]+" alt="Logo">/);
    await resolveInlineImages(html, [LOGO]);
    expect(calls(spy, 'GET', '/mail/attachments/32/')).toHaveLength(1);
  });

  it('leaves the HTML alone for parts it does not use, for non-images and for large parts', async () => {
    const { spy } = stubMail();
    const html = '<img src="cid:logo@pizzahut">';
    expect(await resolveInlineImages('<p>No images</p>', [LOGO])).toBe('<p>No images</p>');
    expect(await resolveInlineImages(html, [{ ...LOGO, mime_type: 'image/svg+xml' }])).toBe(html);
    expect(await resolveInlineImages(html, [{ ...LOGO, size: 6 * 1024 * 1024 }])).toBe(html);
    expect(calls(spy, 'GET', '/mail/attachments/')).toEqual([]);
  });
});
```

Create `src/pages/communications/MailAttachments.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MailAttachments } from './MailAttachments';
import { MAIL_DETAIL, stubMail } from '../../features/mail/testMail';
import { ATTACHMENT_UNAVAILABLE } from '../../features/mail/mailText';

// The chips with the network stubbed (D2 contract §6, Decision 9).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const [PDF, , ZIP] = MAIL_DETAIL.attachments;

describe('MailAttachments', () => {
  it('lists the files but not the inline parts, each a button with its type and size', () => {
    render(<MailAttachments attachments={MAIL_DETAIL.attachments} />);
    const list = screen.getByRole('list', { name: 'Attachments' });
    expect(within(list).getByRole('button', { name: /Renewal quote\.pdf/ })).toHaveTextContent('PDF · 178 KB');
    expect(within(list).getByRole('button', { name: /Pricing\.zip/ })).toBeInTheDocument();
    expect(within(list).queryByText('logo.png')).toBeNull();
  });

  it('opens a PDF in the viewer, downloads from it, and closes back to its chip', async () => {
    stubMail();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<MailAttachments attachments={[PDF]} />);
    const chip = screen.getByRole('button', { name: /Renewal quote\.pdf/ });
    await userEvent.click(chip);
    const viewer = await screen.findByRole('dialog', { name: 'Renewal quote.pdf' });
    expect(viewer.querySelector('object')).toHaveAttribute('data', 'blob:preview');
    expect(within(viewer).getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.click(within(viewer).getByRole('button', { name: 'Download' }));
    expect(click).toHaveBeenCalledOnce();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:preview');
    expect(chip).toHaveFocus();
  });

  it("says why a file won't open, in the server's words", async () => {
    const { state } = stubMail();
    state.attachmentRefusals[33] = { status: 413, body: { code: 'ATTACHMENT_TOO_LARGE', detail: 'This file is too large to open here. Open it in Gmail.' } };
    render(<MailAttachments attachments={[ZIP]} />);
    await userEvent.click(screen.getByRole('button', { name: /Pricing\.zip/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This file is too large to open here. Open it in Gmail.');
  });

  it('shows a file it cannot fetch as a plain chip with the reason', () => {
    render(<MailAttachments attachments={[{ ...PDF, available: false, download_url: null }]} />);
    expect(screen.queryByRole('button', { name: /Renewal quote\.pdf/ })).toBeNull();
    expect(screen.getByTitle(ATTACHMENT_UNAVAILABLE)).toHaveTextContent('Renewal quote.pdf');
  });
});
```

In `src/pages/communications/MailHtmlBody.test.tsx`, change the vitest and testing-library imports to `import { afterEach, describe, expect, it, vi } from 'vitest';` and `import { render, screen, waitFor } from '@testing-library/react';`, change the testMail import to `import { MAIL_DETAIL, stubMail } from '../../features/mail/testMail';`, add `import { forgetInlineImages } from '../../features/mail/mailAttachments';`, and add inside the `describe`:

```tsx
  afterEach(() => {
    vi.unstubAllGlobals();
    forgetInlineImages();
  });

  it('writes cid: images as data: URLs inside the frame (Decision 10)', async () => {
    stubMail();
    render(<MailHtmlBody html={'<p>Hi</p><img src="cid:logo@pizzahut" alt="Logo">'} title="Logo mail" attachments={MAIL_DETAIL.attachments} />);
    await waitFor(() => expect(screen.getByTitle('Message: Logo mail').getAttribute('srcdoc')).toContain('data:image/png;base64,'));
    expect(screen.getByTitle('Message: Logo mail').getAttribute('srcdoc')).not.toContain('cid:logo@pizzahut');
  });
```

In `src/pages/communications/MailDetail.test.tsx`, the newest message's frame now fetches its inline logo, so stub the network for the whole file: change the vitest import to `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';`, add `stubMail` to the `testMail` import, add `import { forgetInlineImages } from '../../features/mail/mailAttachments';`, and add at the top of the `describe`:

```tsx
  beforeEach(() => {
    stubMail();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    forgetInlineImages();
  });
```

In `src/features/files/fileFormat.test.ts`, add inside the `describe`:

```ts
  it('never offers delete on a filed email attachment, not even to an admin (D2 contract §6)', () => {
    expect(canDeleteFile({ uploaded_by: null, source: 'email' }, 1, true)).toBe(false);
  });
```

In `src/components/organizations/detail/FileItem.test.tsx`, add inside the `describe`:

```tsx
  it("names a filed email's attachment by its subject and sender (D2 contract §6)", () => {
    renderItem({ ...FILES[0], source: 'email', description: '', uploaded_by: null, email: { id: 812, subject: 'Renewal terms', from: 'Ann Lee' } }, false);
    expect(screen.getByText(/Renewal terms · Email from Ann Lee ·/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
  });
```

In `src/components/organizations/activity/FilesTab.test.tsx`, add inside the top-level `describe`:

```tsx
  it("lists a filed email's attachment with its sender and offers no delete, even to an admin (D2 contract §6)", async () => {
    const email = { ...contract, id: 31, name: 'Renewal quote.pdf', source: 'email' as const, uploaded_by: null, description: '', download_url: '/api/v1/mail/attachments/31/download/', email: { id: 812, subject: 'Renewal terms', from: 'Ann Lee' } };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [email] })));
    renderTab('admin');
    expect(await screen.findByText(/email from Ann Lee/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Renewal quote.pdf' })).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/apiClient.test.ts src/features/mail/mailAttachments.test.ts src/pages/communications/MailAttachments.test.tsx src/pages/communications/MailHtmlBody.test.tsx src/features/files/fileFormat.test.ts src/components/organizations/detail/FileItem.test.tsx src/components/organizations/activity/FilesTab.test.tsx --maxWorkers=2`
Expected: FAIL: the double `/api/v1/api/v1/` path, `./mailAttachments` cannot be resolved, chips are not buttons, no `Pricing.zip`, email rows deletable.

- [ ] **Step 3: Prefix server paths once**

In `src/lib/apiClient.ts`, in `rawFetch`, replace

```ts
  const url = /^https?:\/\//.test(path) ? path : `${BASE_URL}${path}`;
```

with

```ts
  // A path the server gave (`download_url`) already starts with /api/v1/:
  // prefix it once, not twice (two-way Gmail D2, Decision 11).
  const relative = path.startsWith('/api/v1/') ? path.slice('/api/v1'.length) : path;
  const url = /^https?:\/\//.test(path) ? path : `${BASE_URL}${relative}`;
```

- [ ] **Step 4: The fixtures gain a zip and an inline image**

In `src/features/mail/testMail.ts`, in `MAIL_DETAIL`:
- replace `html_body: '<div style="font-family:Arial"><p>Hi Dana,</p><p>Quote attached.</p><img src="https://cdn.pizzahut.com/sig.png" alt="Pizza Hut"></div>',` with `html_body: '<div style="font-family:Arial"><p>Hi Dana,</p><p>Quote attached.</p><img src="cid:logo@pizzahut" alt="Logo"><img src="https://cdn.pizzahut.com/sig.png" alt="Pizza Hut"></div>',`
- add to the end of the `attachments` array:

```ts
    { id: 33, filename: 'Pricing.zip', mime_type: 'application/zip', size: 24576, is_inline: false, content_id: '', available: true, preview: false, download_url: '/api/v1/mail/attachments/33/download/' },
```

- [ ] **Step 5: Opening files**

Create `src/features/mail/mailAttachments.ts`:

```ts
// Opening a mail attachment (two-way Gmail D2, contract §6, Decisions 9
// and 10). The API authenticates with a bearer token, so no plain link or
// <img src> can reach a file: it is fetched with the session into a blob.
// Only images and PDFs the server marked for preview are shown, re-typed to
// their own type; anything else is saved.

import { apiFetchBlob } from '../../lib/apiClient';
import type { MailAttachmentMeta } from './mailboxSlice';

/** What the viewer may show (contract decision 27). Never SVG, never HTML. */
export const PREVIEW_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

const INLINE_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** A larger inline image stays unresolved rather than becoming a huge data: URL. */
export const INLINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Saves a URL the page already holds (a blob: URL) under a file name. */
export function saveUrl(url: string, name: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  saveUrl(url, name);
  URL.revokeObjectURL(url);
}

/** Fetches the file. A preview comes back as a blob: URL and its type for
 *  the viewer (the caller revokes it); anything else is saved, and null
 *  comes back. A refusal throws the server's ApiError. */
export async function openAttachment(file: Pick<MailAttachmentMeta, 'filename' | 'preview' | 'download_url'>): Promise<{ url: string; type: string } | null> {
  if (!file.download_url) throw new Error('This file is not available.');
  const blob = await apiFetchBlob(file.preview ? file.download_url : `${file.download_url}?download=1`);
  const type = blob.type.split(';')[0].trim().toLowerCase();
  if (file.preview && PREVIEW_TYPES.has(type)) return { url: URL.createObjectURL(new Blob([blob], { type })), type };
  saveBlob(blob, file.filename);
  return null;
}

// Each inline part once per tab: every download of a filed message's
// attachment is audited (contract decision 31).
const inlined = new Map<number, string>();

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const cidOf = (contentId: string) => contentId.trim().replace(/^<|>$/g, '');
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The HTML with every `cid:` image one of its inline parts answers written
 *  as a data: URL, which the frame's CSP allows (Decision 10). Parts that
 *  fail, are too large or are not images are left as they are. */
export async function resolveInlineImages(html: string, attachments: readonly MailAttachmentMeta[]): Promise<string> {
  let out = html;
  for (const part of attachments) {
    const cid = cidOf(part.content_id);
    if (!part.is_inline || !cid || !part.download_url || !INLINE_IMAGE_TYPES.has(part.mime_type) || part.size > INLINE_IMAGE_MAX_BYTES) continue;
    const pattern = new RegExp(`cid:${escapeRegExp(cid)}(?=["'\\s>])`, 'gi');
    if (!pattern.test(out)) continue;
    let url = inlined.get(part.id);
    if (!url) {
      try {
        const blob = await apiFetchBlob(part.download_url);
        url = await dataUrlOf(new Blob([blob], { type: part.mime_type }));
        inlined.set(part.id, url);
      } catch {
        continue;
      }
    }
    out = out.replace(pattern, url);
  }
  return out;
}

/** Test-only: forget the inline cache between tests. */
export function forgetInlineImages(): void {
  inlined.clear();
}
```

- [ ] **Step 6: The viewer**

Create `src/pages/communications/AttachmentViewer.tsx`:

```tsx
// An attachment shown in place (contract decision 27, Decision 9): an image
// or a PDF the server marked for preview, from a blob the session fetched.
// A modal dialog: focus starts on Close, Tab stays inside, Escape or the
// backdrop closes it, and focus goes back to the chip that opened it.

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Download, X } from 'lucide-react';
import { trapTab } from '../../lib/focusTrap';
import { PDF_UNSHOWN } from '../../features/mail/mailText';
import { BUTTON, ICON_BUTTON, OVERLAY, TYPE } from '../../components/ui';

export function AttachmentViewer({ name, url, type, onDownload, onClose }: { name: string; url: string; type: string; onDownload: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    if (event.key === 'Tab' && ref.current) trapTab(event.nativeEvent, ref.current);
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-scrim p-4" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={name} onKeyDown={onKeyDown} onClick={(event) => event.stopPropagation()} className={`flex max-h-[90dvh] w-full max-w-3xl flex-col ${OVERLAY}`}>
        <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-2">
          <h2 className={`min-w-0 flex-1 truncate ${TYPE.title}`}>{name}</h2>
          <button type="button" onClick={onDownload} className={BUTTON}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download
          </button>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {type === 'application/pdf' ? (
            <object data={url} type="application/pdf" aria-label={name} className="h-[75dvh] w-full">
              <p className={TYPE.bodyMuted}>{PDF_UNSHOWN}</p>
            </object>
          ) : (
            <img src={url} alt={name} className="mx-auto max-h-[75dvh] w-auto max-w-full object-contain" />
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Chips that open**

Replace the whole of `src/pages/communications/MailAttachments.tsx` with:

```tsx
// The open message's attachments as chips (contract §6): name, type and
// size; inline parts (images inside the HTML) are left out. From D2 a chip
// opens its file: images and PDFs in the viewer, anything else saved
// (Decision 9). A file that cannot be fetched is a plain chip saying why.

import { useState } from 'react';
import { LoaderCircle, Paperclip } from 'lucide-react';
import type { MailAttachmentMeta } from '../../features/mail/mailboxSlice';
import { openAttachment, saveUrl } from '../../features/mail/mailAttachments';
import { ATTACHMENT_UNAVAILABLE, attachmentFailure } from '../../features/mail/mailText';
import { formatSize } from '../../features/files/fileFormat';
import { FOCUS, NUM, TYPE } from '../../components/ui';
import { AttachmentViewer } from './AttachmentViewer';

const CHIP = 'inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left sm:min-h-9';

function kindOf(file: MailAttachmentMeta): string {
  const dot = file.filename.lastIndexOf('.');
  return dot > 0 && dot < file.filename.length - 1 ? file.filename.slice(dot + 1).toUpperCase() : 'File';
}

export function MailAttachments({ attachments }: { attachments: MailAttachmentMeta[] }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ file: MailAttachmentMeta; url: string; type: string } | null>(null);
  const files = attachments.filter((a) => !a.is_inline);
  if (files.length === 0) return null;

  async function open(file: MailAttachmentMeta) {
    if (busyId !== null) return;
    setBusyId(file.id);
    setError(null);
    try {
      const opened = await openAttachment(file);
      if (opened) setViewing({ file, ...opened });
    } catch (err) {
      setError(attachmentFailure(err, file.filename));
    } finally {
      setBusyId(null);
    }
  }

  function close() {
    if (viewing) URL.revokeObjectURL(viewing.url);
    setViewing(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <ul role="list" aria-label="Attachments" className="flex flex-wrap gap-2">
        {files.map((file) => {
          const content = (
            <>
              {busyId === file.id ? (
                <LoaderCircle className="h-4 w-4 shrink-0 text-ink-muted motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              )}
              <span className={`min-w-0 truncate ${TYPE.body}`}>{file.filename}</span>
              <span className={`shrink-0 ${TYPE.meta}`}>
                {kindOf(file)} · <span className={NUM}>{formatSize(file.size)}</span>
              </span>
            </>
          );
          return (
            <li key={file.id} className="min-w-0 max-w-full">
              {file.available && file.download_url ? (
                <button type="button" onClick={() => void open(file)} aria-busy={busyId === file.id || undefined} className={`${CHIP} hover:bg-subtle active:bg-line-subtle ${FOCUS}`}>
                  {content}
                </button>
              ) : (
                <span title={ATTACHMENT_UNAVAILABLE} className={CHIP}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-[13px] leading-5 text-danger-ink">
          {error}
        </p>
      ) : null}
      {viewing ? <AttachmentViewer name={viewing.file.filename} url={viewing.url} type={viewing.type} onDownload={() => saveUrl(viewing.url, viewing.file.filename)} onClose={close} /> : null}
    </div>
  );
}
```

- [ ] **Step 8: Inline images in the frame**

In `src/pages/communications/MailHtmlBody.tsx`:
- replace `import { useState } from 'react';` with `import { useEffect, useState } from 'react';`, and add `import type { MailAttachmentMeta } from '../../features/mail/mailboxSlice';` and `import { resolveInlineImages } from '../../features/mail/mailAttachments';`;
- in the file comment, after `// reading pane and scrolls inside.` add a line `// D2: cid: images come from the message's inline parts as data: URLs.`;
- replace the component's first three lines

```tsx
export function MailHtmlBody({ html, title }: { html: string; title: string }) {
  const [showImages, setShowImages] = useState(false);
  const blocked = hasRemoteContent(html) && !showImages;
```

with

```tsx
const NO_PARTS: MailAttachmentMeta[] = [];

export function MailHtmlBody({ html, title, attachments = NO_PARTS }: { html: string; title: string; attachments?: MailAttachmentMeta[] }) {
  const [showImages, setShowImages] = useState(false);
  const [inlined, setInlined] = useState<{ from: string; html: string } | null>(null);

  useEffect(() => {
    if (!attachments.some((part) => part.is_inline)) return;
    let live = true;
    void resolveInlineImages(html, attachments).then((out) => {
      if (live && out !== html) setInlined({ from: html, html: out });
    });
    return () => {
      live = false;
    };
  }, [html, attachments]);

  const body = inlined?.from === html ? inlined.html : html;
  const blocked = hasRemoteContent(body) && !showImages;
```

- and replace `srcDoc={mailSrcDoc(html, showImages)}` with `srcDoc={mailSrcDoc(body, showImages)}`.

In `src/pages/communications/ThreadMessage.tsx`, replace `<MailHtmlBody html={message.html_body} title={message.subject} />` with `<MailHtmlBody html={message.html_body} title={message.subject} attachments={message.attachments} />`.

- [ ] **Step 9: Filed mail's files on records**

In `src/features/files/filesSlice.ts`, in `interface Attachment`, replace `  source: 'upload' | 'transcript';` with:

```ts
  /** `email`: an attachment of mail filed on this record (two-way Gmail D2 §6), never deleted here. */
  source: 'upload' | 'transcript' | 'email';
```

and after `  account_name?: string | null;` add:

```ts
  /** The filed email an `email` row came with; null on uploads. */
  email?: { id: number; subject: string; from: string } | null;
```

In `src/features/files/fileFormat.ts`, replace the `canDeleteFile` function with:

```ts
/** The uploader or an admin may delete a file (the server applies the same
 *  rule). A filed email's attachment is never deleted here: it lives as
 *  long as the mailbox's copy (two-way Gmail D2, contract §6). */
export function canDeleteFile(file: Pick<Attachment, 'uploaded_by'> & Partial<Pick<Attachment, 'source'>>, meId: number | null, isAdmin: boolean): boolean {
  if (file.source === 'email') return false;
  return isAdmin || (meId !== null && file.uploaded_by?.id === meId);
}
```

In `src/components/organizations/detail/FileItem.tsx`:
- replace `import { FileText, Mic, Trash2 } from 'lucide-react';` with `import { FileText, Mail, Mic, Trash2 } from 'lucide-react';`;
- replace

```tsx
  const source = file.source === 'transcript' ? 'Call transcript' : 'Upload';
  const Icon = file.source === 'transcript' ? Mic : FileText;
```

with

```tsx
  const source = file.source === 'transcript' ? 'Call transcript' : file.source === 'email' ? `Email from ${file.email?.from || 'someone'}` : 'Upload';
  const Icon = file.source === 'transcript' ? Mic : file.source === 'email' ? Mail : FileText;
  // A filed email's attachment has no description: its email's subject says what it is.
  const about = file.description || file.email?.subject || '';
```

- replace `{file.description ? \` · ${file.description}\` : null}` (the template literal in the meta line) with `{about ? \` · ${about}\` : null}` (same template-literal form, `about` in place of `file.description`).

In `src/components/organizations/activity/FilesTab.tsx`:
- replace `import { FILE_ACCEPT, formatSize } from '../../../features/files/fileFormat';` with `import { canDeleteFile, FILE_ACCEPT, formatSize } from '../../../features/files/fileFormat';`;
- replace `  const canDelete = (file: Attachment) => isAdmin || (me !== null && file.uploaded_by?.id === me.id);` with `  const canDelete = (file: Attachment) => canDeleteFile(file, me?.id ?? null, isAdmin);`;
- after the line `{file.source === 'transcript' && <> · call transcript</>}` add the line `{file.source === 'email' && file.email && <> · email from {file.email.from}</>}`.

`FilesSection` already asks `canDeleteFile`, so its Delete disappears for email rows with no change there.

- [ ] **Step 10: Run the tests to see them pass**

Run: `npx vitest run src/lib src/features/mail src/features/files src/pages/communications src/components/organizations src/e2e/gmail.test.tsx src/test/uiRatchet.test.ts src/components/ops.houseRules.test.ts --maxWorkers=2`
Expected: PASS. The ratchet must not rise: `FilesTab.tsx` gains no class, only text.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/lib/apiClient.ts src/lib/apiClient.test.ts
git commit -m "fix(api): prefix server-given /api/v1 paths once

Files downloads asked for /api/v1/api/v1/files/<id>/download/.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git add src/features/mail/mailAttachments.ts src/features/mail/mailAttachments.test.ts src/features/mail/testMail.ts src/pages/communications/MailDetail.test.tsx src/pages/communications/AttachmentViewer.tsx src/pages/communications/MailAttachments.tsx src/pages/communications/MailAttachments.test.tsx src/pages/communications/MailHtmlBody.tsx src/pages/communications/MailHtmlBody.test.tsx src/pages/communications/ThreadMessage.tsx
git commit -m "feat(comms): open mail attachments and inline cid images

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git add src/features/files/filesSlice.ts src/features/files/fileFormat.ts src/features/files/fileFormat.test.ts src/components/organizations/detail/FileItem.tsx src/components/organizations/detail/FileItem.test.tsx src/components/organizations/activity/FilesTab.tsx src/components/organizations/activity/FilesTab.test.tsx
git commit -m "feat(files): filed mail attachments on a record's files, never deletable

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Failure notices: the sync issue line and the bell

**Files:**
- Create: `src/pages/communications/MailSyncIssue.tsx`
- Modify: `src/pages/communications/ThreadMessage.tsx`, `src/pages/communications/MailList.tsx`, `src/pages/communications/MailboxView.tsx`
- Modify: `src/features/notifications/types.ts`, `src/components/layout/NotificationKindIcon.tsx`
- Test: `src/pages/communications/MailDetail.test.tsx`, `src/pages/communications/MailList.test.tsx`, `src/pages/communications/MailboxActions.test.tsx`, `src/components/layout/NotificationKindIcon.test.tsx`, `src/components/layout/Navbar.test.tsx`

**Interfaces:**
- Consumes: `SyncIssue` (Task 1); `notificationAdded` (`features/notifications/notificationsSlice.ts`); `MailboxView`'s `refresh` (Task 3).
- Produces: `SyncIssueLine({ issue: SyncIssue | null })`; `NotificationKind` gains `'mail_action_failed'`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/communications/MailDetail.test.tsx`, add inside the `describe`:

```tsx
  it('shows a change that did not reach Gmail, quietly, on its message', () => {
    const issue = { text: "Couldn't archive in Gmail: the message no longer exists.", at: '2026-10-11T08:50:02Z' };
    const { pane } = renderThread([{ ...MAIL_DETAIL, sync_issue: issue }]);
    const line = within(pane).getByText(issue.text);
    expect(line).toHaveClass('text-ink-muted');
    expect(line.closest('article')).not.toBeNull();
  });
```

In `src/pages/communications/MailList.test.tsx`, add inside the `describe`:

```tsx
  it('marks a row whose change did not reach Gmail, with the sentence for screen readers', () => {
    const issue = { text: "Couldn't label \"Q4\" in Gmail: the label no longer exists.", at: '2026-10-11T08:50:02Z' };
    render(<MailList rows={[{ ...ROW, sync_issue: issue }]} isLoading={false} onSelect={vi.fn()} emptyState={null} />);
    expect(screen.getByTitle(issue.text)).toHaveTextContent(issue.text);
  });
```

In `src/components/layout/NotificationKindIcon.test.tsx`, add inside the `describe`:

```tsx
  it('draws MailWarning for mail_action_failed (two-way Gmail D2 §5)', () => {
    const { container } = render(<NotificationKindIcon kind="mail_action_failed" />);
    expect(container.querySelector('[data-kind-icon="mail_action_failed"]')).toHaveAttribute('aria-hidden', 'true');
  });
```

In `src/components/layout/Navbar.test.tsx`:
- after the line `          <Route path="/work/recommended" element={<SegmentMarker />} />` add `          <Route path="/communications" element={<SegmentMarker />} />`;
- after the `taskEscalated` fixture add:

```tsx
// Two-way Gmail D2 §5: a change that did not reach Gmail, opening its conversation.
const mailFailed: Notification = {
  ...planStarted,
  id: 12,
  kind: 'mail_action_failed',
  message: "Couldn't archive in Gmail: the message no longer exists.",
  link: '/communications?source=mailbox:google&message=9012',
  actor: null,
};
```

- inside `describe('Navbar notification bell', ...)`, after the `it.each([...])` for `task_overdue` and `task_escalated`, add:

```tsx
  it('opens the conversation from a mail_action_failed notification, with its icon', async () => {
    const user = userEvent.setup();
    renderNavbar('/dashboard', null, null, [mailFailed]);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(document.querySelector('[data-kind-icon="mail_action_failed"]')).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByText(mailFailed.message));
    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(12);
    expect(await screen.findByTestId('segment-marker')).toHaveTextContent('/communications?source=mailbox:google&message=9012');
  });
```

In `src/pages/communications/MailboxActions.test.tsx`, change the testing-library import to `import { act, render, screen, waitFor, within } from '@testing-library/react';`, add `import { notificationAdded } from '../../features/notifications/notificationsSlice';`, and append:

```tsx
describe('Failure notices (D2 contract §5)', () => {
  const ISSUE = { text: "Couldn't archive in Gmail: the message no longer exists.", at: '2026-10-11T08:50:02Z' };

  it('opens the conversation the bell links to, with the change that did not reach Gmail', async () => {
    stubMail({ messages: D2_MESSAGES.map((m) => (m.id === 1 ? { ...m, sync_issue: ISSUE } : m)) });
    renderMailbox('/communications?source=mailbox:google&message=1');
    const pane = await screen.findByRole('region', { name: 'Conversation' });
    expect(await within(pane).findByText(ISSUE.text)).toBeInTheDocument();
  });

  it('reads the list and the open conversation again when a mail_action_failed notice arrives', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    await openAnn(store);
    const lists = calls(spy, 'GET', '/mail/threads/').length;
    const threads = calls(spy, 'GET', '/thread/').length;
    act(() => {
      store.dispatch(
        notificationAdded({ id: 40, kind: 'mail_action_failed', message: ISSUE.text, link: '/communications?source=mailbox:google&message=1', actor: null, is_read: false, created_at: ISSUE.at }),
      );
    });
    await waitFor(() => expect(calls(spy, 'GET', '/mail/threads/').length).toBe(lists + 1));
    await waitFor(() => expect(calls(spy, 'GET', '/thread/').length).toBe(threads + 1));
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/pages/communications src/components/layout/NotificationKindIcon.test.tsx src/components/layout/Navbar.test.tsx --maxWorkers=2`
Expected: FAIL: no sync issue line or mark; `mail_action_failed` has no icon (and is not a `NotificationKind`); no `/communications` route in the Navbar test; no refetch on the notice.

- [ ] **Step 3: The line**

Create `src/pages/communications/MailSyncIssue.tsx`:

```tsx
// A change that did not reach Gmail (D2 contract §5): the server's
// sentence, quiet, on the message it happened to. The bell carries the
// notification; this stays until a later change to the message.

import { CircleAlert } from 'lucide-react';
import type { SyncIssue } from '../../features/mail/mailboxSlice';
import { TYPE } from '../../components/ui';

export function SyncIssueLine({ issue }: { issue: SyncIssue | null }) {
  if (!issue) return null;
  return (
    <p className={`flex items-center gap-1.5 ${TYPE.meta}`}>
      <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {issue.text}
    </p>
  );
}
```

In `src/pages/communications/ThreadMessage.tsx`, add `import { SyncIssueLine } from './MailSyncIssue';` and, in the unfolded branch, directly after the closing `</div>` of the who-and-when row (before `{message.to.length > 0 ? (`), add `        <SyncIssueLine issue={message.sync_issue} />`.

The test finds the sentence's element: `SyncIssueLine` puts the text directly in the `p` whose classes include `TYPE.meta`'s `text-ink-muted`.

- [ ] **Step 4: The mark on a row**

In `src/pages/communications/MailList.tsx`:
- replace `import { Paperclip } from 'lucide-react';` with `import { CircleAlert, Paperclip } from 'lucide-react';`;
- replace the row's `trailing={<span className={\`ml-auto ${TYPE.meta} ${NUM}\`}>{dayOf(row.last_sent_at)}</span>}` (the whole `trailing` prop) with:

```tsx
                  trailing={
                    <>
                      {row.sync_issue ? (
                        <span title={row.sync_issue.text} className="text-ink-muted">
                          <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">{row.sync_issue.text}</span>
                        </span>
                      ) : null}
                      <span className={`ml-auto ${TYPE.meta} ${NUM}`}>{dayOf(row.last_sent_at)}</span>
                    </>
                  }
```

The mark sits in `trailing`, which shows at every width.

- [ ] **Step 5: The notification kind and its icon**

In `src/features/notifications/types.ts`, replace

```ts
  | 'agent_draft_ready';
```

with

```ts
  | 'agent_draft_ready'
  // "Couldn't archive in Gmail: the message no longer exists." (or "Couldn't
  // archive 12 conversations in Gmail: ...") for a mailbox owner when an
  // action failed in Gmail and was put back, linking to
  // /communications?source=mailbox:google&message=<id> (two-way Gmail D2 §5).
  | 'mail_action_failed';
```

In `src/components/layout/NotificationKindIcon.tsx`:
- replace the lucide import with `import { AlarmClock, ClipboardList, FilePen, Lightbulb, ListChecks, MailWarning, Megaphone, SquareCheck, TriangleAlert, Undo2, type LucideIcon } from 'lucide-react';`;
- replace ` *  §2.5, Work spec §1.3, §2.2, §3.2, Agents deliveries 1 and 2). */` with ` *  §2.5, Work spec §1.3, §2.2, §3.2, Agents deliveries 1 and 2, two-way Gmail D2). */`;
- after `  agent_draft_ready: FilePen,` add `  mail_action_failed: MailWarning,`.

- [ ] **Step 6: Read again when Gmail refused**

In `src/pages/communications/MailboxView.tsx`, after the `?message=` effect, add:

```tsx
  // A change Gmail refused is put back on the server; when its notice
  // arrives, read the list and the open conversation again (Decision 12).
  const newestFailure = useAppSelector((state) => state.notifications?.items.find((n) => n.kind === 'mail_action_failed')?.id ?? null);
  const seenFailure = useRef(newestFailure);
  useEffect(() => {
    if (newestFailure === seenFailure.current) return;
    seenFailure.current = newestFailure;
    if (newestFailure === null) return;
    refresh();
    dispatch(fetchMailLabels());
    if (selectedId !== null) dispatch(fetchThread(selectedId));
  }, [newestFailure, refresh, dispatch, selectedId]);
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run src/pages/communications src/components/layout src/components/ops.houseRules.test.ts src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS.

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/pages/communications/MailSyncIssue.tsx src/pages/communications/ThreadMessage.tsx src/pages/communications/MailList.tsx src/pages/communications/MailList.test.tsx src/pages/communications/MailDetail.test.tsx src/pages/communications/MailboxView.tsx src/pages/communications/MailboxActions.test.tsx src/features/notifications/types.ts src/components/layout/NotificationKindIcon.tsx src/components/layout/NotificationKindIcon.test.tsx src/components/layout/Navbar.test.tsx
git commit -m "feat(comms): show gmail sync issues and the mail_action_failed notice

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The journeys

**Files:**
- Create: `src/e2e/gmailActions.test.tsx`

**Interfaces:**
- Consumes: everything above, through the real routes (`CommunicationsPage`, `MailboxSection`) and the real store (`rootReducer`); `stubMail`, `D2_MESSAGES`, `forgetInlineImages`, `calls`, `sent`.

- [ ] **Step 1: Write the journeys**

Create `src/e2e/gmailActions.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../store';
import CommunicationsPage from '../pages/communications/CommunicationsPage';
import { MailboxSection } from '../components/integrations/MailboxSection';
import { D2_MESSAGES, stubMail } from '../features/mail/testMail';
import { RECONNECT_TWO_WAY, TWO_WAY_OFF_TEXT } from '../features/mail/mailText';
import { forgetInlineImages } from '../features/mail/mailAttachments';
import { calls, sent } from '../features/agents/testAgents';

// End-to-end tier (jsdom, no browser; .claude/skills/testing): two-way
// Gmail delivery 2 through the real routes, store and pages. Only fetch is
// stubbed, with the D2 contract's shapes (stubMail).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
});

function app(url: string) {
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/communications" element={<CommunicationsPage />} />
          <Route path="/settings/connections" element={<MailboxSection />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

async function mailboxReady(store: ReturnType<typeof app>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  return mailbox;
}

describe('Two-way Gmail D2 journeys', () => {
  it('reads a conversation, unfolds the older message, marks it done and finds it in Done', { timeout: 30000 }, async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = app('/communications?source=mailbox:google');
    const mailbox = await mailboxReady(store);
    const row = await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' });
    expect(row.closest('li')).toHaveTextContent('2 messages');
    await userEvent.click(row);
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await waitFor(() => expect(sent(spy, 'PATCH', '/mail/messages/1/thread/')).toEqual([{ is_read: true }]));
    await userEvent.click(await within(pane).findByRole('button', { name: /You.*Could you send the renewal quote\?/ }));
    expect(within(pane).getByRole('article', { name: /^You, / })).toHaveTextContent('Could you send the renewal quote?');
    await userEvent.click(within(pane).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/mail/messages/1/thread/')).toEqual([{ is_read: true }, { state: 'done' }]));
    await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeNull());
    await userEvent.click(within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /^Done/ }));
    expect(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeInTheDocument();
  });

  it('labels a conversation with a new label and finds it in that label', { timeout: 30000 }, async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = app('/communications?source=mailbox:google');
    const mailbox = await mailboxReady(store);
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(pane).findByRole('button', { name: 'Labels' }));
    const menu = within(pane).getByRole('dialog', { name: 'Labels' });
    await userEvent.type(within(menu).getByLabelText('New label'), 'Pilot');
    await userEvent.click(within(menu).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toContainEqual({ add_labels: [12] }));
    await waitFor(() => expect(within(pane).getAllByRole('group', { name: /Pilot/ }).length).toBeGreaterThan(0));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(mailbox).getByRole('button', { name: /^Inbox$/ }));
    const sidebar = within(mailbox).getByRole('region', { name: 'Labels' });
    await userEvent.click(within(sidebar).getByRole('button', { name: /^Pilot/ }));
    await waitFor(() => expect(calls(spy, 'GET', '/mail/threads/')).toContain('/mail/threads/?folder=all&label=12'));
    expect(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeInTheDocument();
    expect(within(mailbox).queryByRole('button', { name: 'Circleback' })).toBeNull();
  });

  it('a bulk delete Gmail can no longer take comes back, says why, and leads to Connections', { timeout: 30000 }, async () => {
    const { state, spy } = stubMail({ messages: D2_MESSAGES });
    const store = app('/communications?source=mailbox:google');
    const mailbox = await mailboxReady(store);
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select every conversation on this page' }));
    // The workspace's grant changed under the screen.
    state.connection = { ...state.connection!, two_way: false, needs_reconnect: true };
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Delete' }));
    const alert = await within(mailbox).findByRole('alert');
    expect(alert).toHaveTextContent(TWO_WAY_OFF_TEXT);
    expect(sent(spy, 'POST', '/mail/actions/')).toEqual([{ op: 'trash', thread_of: [1, 4] }]);
    expect(within(mailbox).getByRole('button', { name: 'Dana Ruiz, Ann Lee' })).toBeInTheDocument();
    expect(within(mailbox).getByRole('button', { name: 'Circleback' })).toBeInTheDocument();
    await waitFor(() => expect(within(mailbox).getByRole('button', { name: 'Mark done' })).toBeDisabled());
    await userEvent.click(within(alert).getByRole('link', { name: 'Open Connections' }));
    expect(await screen.findByText(RECONNECT_TWO_WAY)).toBeInTheDocument();
  });

  it('opens what the bell links to, shows what did not reach Gmail, previews the PDF, and e marks it done', { timeout: 30000 }, async () => {
    const issue = { text: "Couldn't archive in Gmail: the message no longer exists.", at: '2026-10-11T08:50:02Z' };
    const { state, spy } = stubMail({ messages: D2_MESSAGES.map((m) => (m.id === 1 ? { ...m, sync_issue: issue } : m)) });
    state.attachmentRefusals[33] = { status: 413, body: { code: 'ATTACHMENT_TOO_LARGE', detail: 'This file is too large to open here. Open it in Gmail.' } };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const store = app('/communications?source=mailbox:google&message=1');
    const mailbox = await mailboxReady(store);
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    const newest = await within(pane).findByRole('article', { name: /^Ann Lee, / });
    expect(within(newest).getByText(issue.text)).toBeInTheDocument();
    await waitFor(() => expect(within(newest).getByTitle('Message: Renewal quote').getAttribute('srcdoc')).toContain('data:image/png;base64,'));
    await userEvent.click(within(newest).getByRole('button', { name: /Pricing\.zip/ }));
    expect(await within(newest).findByRole('alert')).toHaveTextContent('This file is too large to open here. Open it in Gmail.');
    const pdf = within(newest).getByRole('button', { name: /Renewal quote\.pdf/ });
    await userEvent.click(pdf);
    const viewer = await screen.findByRole('dialog', { name: 'Renewal quote.pdf' });
    expect(viewer.querySelector('object')).toHaveAttribute('data', 'blob:preview');
    await userEvent.keyboard('e');
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([]);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Renewal quote.pdf' })).toBeNull();
    expect(pdf).toHaveFocus();
    await userEvent.keyboard('e');
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ state: 'done' }]));
    expect(await within(mailbox).findByRole('region', { name: 'Mail' })).toBeInTheDocument();
  });
});
```

`state.connection!` is the D1 tests' own idiom for the stub's state.

- [ ] **Step 2: Run the journeys**

Run: `npx vitest run src/e2e/gmailActions.test.tsx src/e2e/gmail.test.tsx --maxWorkers=2`
Expected: PASS, 4 D2 journeys and the D1 ones.

If one fails, read the failure before changing anything: a wrong assumption in a journey (a name, an order of calls) is fixed in the journey; a behaviour that differs from the Decisions is fixed in the code of the task that built it, with that task's tests run again.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/gmailActions.test.tsx
git commit -m "test(e2e): two-way gmail delivery 2 journeys

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The UI/UX, App Flow and architecture documents

**Files:**
- Modify: `docs/03-ui-ux-design.md`
- Modify: `docs/04-app-flow.md`
- Modify: `.agents/workflows/repo-architecture.md`

- [ ] **Step 1: UI/UX: add a section**

In `docs/03-ui-ux-design.md`, directly before the line `### Settings: the frame`, insert:

```markdown
### Two-way Gmail, delivery 2: actions, conversations, labels and files

Spec `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §3 and §4;
contract `revenact-backend docs/superpowers/plans/2026-10-11-gmail-actions-api.md`.

- **Conversations.** The mailbox lists conversations (`MailList`): the
  senders as the title ("Dana Ruiz, Ann Lee", "+N" past three), the message
  count in tabular figures before the subject, a Labels column (up to two
  chips and "+N") where Category was, the date. Sent and Drafts still list
  messages, titled "To <recipients>".
- **The open conversation** (`MailDetail`, `ThreadMessage`): the subject
  (15px), then "N messages", the category badge, the label chips and the
  record link. Messages run oldest first in a `divide-y` list; only the
  newest is open, older ones are one line (who, snippet, date) that opens
  on press; outside Trash, deleted messages sit behind "N deleted
  messages" (`QUIET`); a long thread says "Older messages in this
  conversation are only in Gmail." The reply answers the newest message
  from the other side.
- **Actions** in a wrapping toolbar: Star, Mark unread, Labels, Delete (or
  Restore in Trash), the ⋯ menu with Report spam (or Not spam in Spam),
  Mute or Unmute, and Mark done (`BUTTON`). Each shows at once; a refusal
  puts it back and says why under the header in danger ink, with Open
  Connections when reconnecting is the way out. Outlook and IMAP show no
  Delete, Restore, spam or labels.
- **Read-only, paused or disconnected Gmail:** every action but Mute and
  Unmute is disabled with the reason as its title; the header's status line
  adds "Reconnect Google to turn on two-way: changes here can't reach Gmail
  yet." or "This message's mailbox is no longer connected." with Open
  Connections (a paused mailbox keeps its paused line).
- **Labels.** The sidebar lists them under the folders (and All mail): the
  Gmail colour as a 6px dot, the name, unread conversations in tabular
  figures; the open label is the current folder. A label made here and not
  yet in Gmail is faint, with a dashed chip edge and "Not in Gmail yet".
  The label menu (`LabelMenu`, an `OVERLAY` popover) has a box per label,
  ticked when every message carries it and mixed when some do, and a "New
  label" field (label above) with Create; a refusal stays in the menu.
- **Bulk select.** Each row has a box (44px label), shown on hover or focus
  from `sm`, always on touch and once anything is ticked. A toolbar over the
  list: "Select every conversation on this page" (mixed when some are
  ticked), "N selected", Mark done (Move to Inbox in Done), Mark read or
  unread, Label, Delete (Restore in Trash), Clear (`QUIET`).
- **Keyboard:** e done, # delete, j and k next and previous, r reply; off in
  fields, menus, dialogs and the mail frame. Mark done and Delete carry
  `aria-keyshortcuts`. Reply all, Forward and compose come with delivery 3.
- **Attachments.** Chips are buttons (44px, bordered): images and PDFs open
  in a modal viewer (`OVERLAY` on `bg-scrim`, Download and Close, focus
  returned to the chip); anything else downloads. A refusal is the server's
  sentence under the chips ("This file is too large to open here. Open it in
  Gmail."); a file that cannot be fetched is a plain chip with the reason as
  its title. `cid:` images inside HTML mail show in the sandboxed frame.
- **What did not reach Gmail:** a quiet 11px line with `CircleAlert` on the
  message, a `CircleAlert` mark beside the row's date, and the
  `mail_action_failed` notification in the bell (`MailWarning`) linking to
  the conversation.
- **Files tab:** filed mail's attachments are rows like uploads, with a
  `Mail` icon, the email's subject and "Email from <sender>", and no Delete.
```

- [ ] **Step 2: App Flow**

In `docs/04-app-flow.md`:
- in the `/communications` route row, replace `the open message with star/done/mute, Cc and Bcc, Gmail's user labels as chips, attachment chips (not opened until two-way Gmail delivery 2), HTML in a sandboxed frame with remote images blocked until Show images, and a reply that sends from the mailbox; the header says when the 12-month import is running or the mailbox is paused)` with `conversations (Sent and Drafts as messages) with bulk select, Gmail labels in the sidebar and a label view, the open conversation with older messages folded and its actions (star, unread, mute, done, and for Gmail delete or restore, spam and labels) applied at once and put back if refused, attachments that open or download, HTML in a sandboxed frame with remote images blocked until Show images and cid: images shown, keys e, #, j, k and r, and a reply that sends from the mailbox; the header says when the 12-month import is running, the mailbox is paused, or changes cannot reach Gmail; ?message=<id> opens a conversation)`;
- directly before `### 4.6 Copilot and multiplayer sessions`, insert:

```markdown
### 4.5m Your mail, two-way (Communications › your mailbox)

Two-way Gmail delivery 2 (contract `revenact-backend
docs/superpowers/plans/2026-10-11-gmail-actions-api.md`). The list reads
`GET /mail/threads/` (Sent and Drafts keep `GET /mail/messages/`), with
`folder=all&label=<id>` for a label; the sidebar's labels and their unread
conversations come from `GET /mail/labels/`. Opening a row reads
`GET /mail/messages/<id>/thread/` and, when it has unread messages, sends
`PATCH .../thread/ {is_read: true}`. Every action is a `PATCH .../thread/`
(`is_read`, `is_starred`, `state`, `trashed`, `spam`, `add_labels`,
`remove_labels`); bulk actions and Unmute are `POST /mail/actions/` with
`op` and `thread_of`. The screen changes first and puts the change back
when the server refuses (`409 MAILBOX_PAUSED`, `TWO_WAY_OFF`,
`NO_MAILBOX`, `400 GMAIL_ONLY`, `TOO_MANY`), saying why; after a refusal it
reads the connection again. A new label is `POST /mail/labels/ {name}`
(pending until Gmail creates it; `409 LABEL_EXISTS` applies the existing
one). Gmail's outbox may still fail later: the message then carries
`sync_issue` and the owner gets `mail_action_failed`, whose link
(`?source=mailbox:google&message=<id>`) opens the conversation; while the
mailbox is open, that notice reads the list again. Attachments are fetched
with the session from `download_url`
(`GET /mail/attachments/<id>/download/`): images and PDFs open in a
viewer, the rest download; `cid:` images are fetched the same way and
inlined. On a record's Files tab, filed mail's attachments (`source:
"email"`) list beside uploads and cannot be deleted.
```

- [ ] **Step 3: Architecture**

In `.agents/workflows/repo-architecture.md`, directly after the line `` `MailboxNotice`). `` (the end of the two-way Gmail delivery 1 paragraph in §9), add:

```markdown
Two-way Gmail delivery 2 adds `features/mail/mailOptimistic.ts` (what an
action does to the screen before the server answers),
`features/mail/mailAttachments.ts` (attachments fetched with the session,
`cid:` images), and in `pages/communications/` the conversation
(`MailDetail`, `ThreadMessage`), `LabelMenu`, `MailBulkBar`,
`AttachmentViewer`, `MailSyncIssue` and `useMailKeys`; the
`MailboxActions.test.tsx` suite and `src/e2e/gmailActions.test.tsx` cover it.
```

- [ ] **Step 4: Check the docs**

Run: `git diff --unified=0 -- docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md | grep '^+' | LC_ALL=C grep -n $'\xe2\x80\x94' || echo "no em dash in the new lines"`
Expected: `no em dash in the new lines`.

- [ ] **Step 5: Commit**

```bash
git add docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "docs: two-way gmail delivery 2 in ui/ux, app flow and architecture

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The full check

**Files:** none new.

- [ ] **Step 1: Every test**

Run: `npx vitest run --maxWorkers=4`
Expected: every file passes, including `src/test/uiRatchet.test.ts` (counts exactly at baseline), `src/components/ops.houseRules.test.ts`, `src/test/inlineTargets.test.ts`, `src/e2e/gmail.test.tsx` and `src/e2e/gmailActions.test.tsx`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exit 0 (warnings allowed only where the file already had them).

- [ ] **Step 3: Types and bundle**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: No em dash, no raw colour in the added lines**

Run: `git diff 8b4c8131 --unified=0 -- src docs .agents | grep '^+' | LC_ALL=C grep -n $'\xe2\x80\x94' || echo "no em dash added"`
Expected: `no em dash added`.

Run: `git diff 8b4c8131 --unified=0 -- 'src/*.tsx' ':(exclude)src/*.test.tsx' | grep '^+' | grep -n -E '#[0-9a-fA-F]{3,8}\b|rgba?\(' || echo "no raw colour added"`
Expected: `no raw colour added`.

- [ ] **Step 5: Phone width by eye (optional when no API is running)**

With the D2 backend running on `http://localhost:8000` and a connected two-way Gmail, run `npm run dev`, sign in, and check at 375px and 1440px: the conversation list with a ticked row and the bulk bar, an open two-message conversation (folded, unfolded), the label menu, the viewer with a PDF, the read-only notice (turn the workspace off in the portal), and an organisation's Files tab with a filed attachment. No horizontal scroll; toolbars wrap; the label menu stays on screen.

- [ ] **Step 6: Hand back**

Report the commits, the test counts and what is left for the owner. Owner steps that are not code (spec §5): the **one live check on a real test Gmail account before merge**: archive, star, label (and create a label), delete and restore in Revenact and see each in Gmail within a minute; open a PDF and an image attachment; send yourself mail with an inline logo and see it; revoke two-way (reconnect read-only) and see the actions turn off with Open Connections.

---

## Self-review

**Spec and contract coverage:**
- Conversations, thread detail with older messages folded, `folder=all`, `?label=`: Tasks 2, 3 (Decisions 1, 2, 6), label view Task 4.
- Label sidebar (colour dot, unread), label menu (apply, remove, create, pending): Task 4 (Decision 13).
- Read on open (PATCH; GET never marks read), unread, star (newest only, unstar all), done and back to Inbox, delete and restore, spam and not spam, mute and unmute: Tasks 2, 3, 4 (Decisions 3, 4); optimistic with revert: Task 2.
- `409 MAILBOX_PAUSED`, `TWO_WAY_OFF` (reconnect), `NO_MAILBOX`, `400 GMAIL_ONLY` (hidden for Outlook and IMAP), `TOO_MANY`: Task 1 (`actionFailure`, `mailActionGate`), Tasks 3 to 5 (Decision 5).
- Bulk select (box per row, select all on the page) with done, read or unread, label, delete via `POST mail/actions/`: Task 5 (Decision 14).
- Keyboard e, #, j, k, r; a, f, c deferred to D3 with the reason: Task 6 (Decision 8).
- `sync_issue` line, `mail_action_failed` in the bell with its link: Task 8 (Decision 12).
- Attachments fetched with the bearer into a blob, viewer for PNG/JPEG/GIF/WebP/PDF, download otherwise, 413 copy, `cid:` images as `data:` inside the CSP'd `srcdoc`, Files tab `source: "email"` rows without Delete: Task 7 (Decisions 9 to 11).
- Phone width: Global Constraints; the existing list/conversation switch with Back (Task 3 keeps it); wrapping toolbars (Tasks 3 to 5); Task 11 Step 5 by eye.
- Tests: unit (optimistic rules, words, gate, slice, label menu, keys, attachments, chips, frame, files), integration (`MailboxView.test.tsx`, `MailboxActions.test.tsx`, Navbar), e2e (Task 9). Docs: Task 10.

**Placeholder scan:** none of "TBD", "TODO", "similar to", "add error handling". Every code step carries its code; every edit names the exact text it replaces.

**Type consistency:** `MailThread`, `MailThreadDetail`, `MailLabelEntry`, `ThreadPatch`, `MailOp`, `SyncIssue` (Task 1) are the names used after; `patchOfOp`, `leavesView`, `patchRow`, `patchThread`, `labelState`, `LabelState` keep one signature (Tasks 1, 2, 4, 5); `mailActionGate`/`MailActionGate` and `actionFailure`/`ActionFailure` (Task 1) are what Tasks 2 to 5 read; `fetchMailList`, `loadMoreList`, `fetchThread`, `updateThread`, `bulkMailAction`, `fetchMailLabels`, `createMailLabel`, `setMailLabel`, `selectThread`, `toggleChecked`, `setChecked`, `clearMailActionError` (Task 2) are what Tasks 3 to 8 dispatch; `threadRowOf`, `threadOf`, `D2_MESSAGES`, `MAIL_EARLIER`, `MAIL_INVOICE`, `MAIL_LABELS`, `failNext`, `attachmentRefusals` (Task 2) are what the tests use; `MailDetail`'s props grow in Task 4 (`labels`, `onCreateLabel`) and every render of it (MailboxView, `MailDetail.test.tsx`) is updated in that task.
