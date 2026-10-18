# Two-way Gmail, delivery 3 ("writing"): frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mailbox on Communications write Gmail, as delivery 3 of the contract defines it:
- **compose** a new message from the mailbox (`c`), and **Reply** (`r`), **Reply all** (`a`) and **Forward** (`f`) from a message, in one composer: To, Cc and Bcc as address chips, Subject, a basic formatting editor (bold, italic, lists, links), the Gmail signature already in the body, the quoted original folded, attachments (upload with progress, the 25 MB total checked first), forwarded originals listed and removable, and the record it will be filed on (the suggestion, changeable or cleared; fixed for an agent's draft);
- **drafts both ways**: autosave with `revision`, `409 DRAFT_CHANGED` shown and chosen, `gmail.state` and `sync_issue` on the draft, the Drafts folder's rows opening the editor, and Delete in Drafts discarding only the draft (one or many); an agent draft linked to a Gmail draft listed once, as the mailbox row, and editable there;
- **send** with today's claimed, unconfirmed and superseded states and the new refusals (`MAILBOX_PAUSED`, `TWO_WAY_OFF`, `GMAIL_ONLY`, `MESSAGE_TOO_LARGE`, `DRAFT_GONE`, `ATTACHMENT_UNAVAILABLE`); Outlook, IMAP and read-only Google keep today's reply box;
- **search**: a search box over the synced mail and, as its last row, "Search older mail in Gmail": live results 20 a page, the ones Revenact holds marked, opening one stores it and opens it.

**Architecture:**
- **`features/mail`**: `mailDrafts.ts` (new) holds the D3 wire types, every D3 call, `draftFailure`, the quote split, recipient parsing, the upload check and `mailDraftParam`. `draftSession.ts` (new) is a plain class that owns one draft's life: the prefill or the draft, local edits, the 2 s autosave, one promise chain for every write, the conflict, uploads, send and discard; `useDraftSession.ts` wraps it with `useSyncExternalStore`. `mailEditor.ts` (new) is the editor's plumbing (`runCommand`, `cleanEditable`, `safeHref`). `mailboxSlice.ts` gains `draft` on rows, `q`, the open composer, a notice line and `discardDrafts`. `mailText.ts` gains every new sentence. `testMail.ts` becomes a stateful stub of the D3 contract (and fakes `XMLHttpRequest` for uploads).
- **`pages/communications`**: new `MailComposer` (the pane), `MailEditor`, `RecipientField`, `ComposeAttachments`, `DraftRecordLine`, `GmailSearchResults`; `MailboxView`, `MailDetail`, `ThreadMessage`, `MailList`, `MailBulkBar`, `useMailKeys` and `mailWho` change; `CommunicationsPage` stops reading a mailbox draft link as an agent draft.
- **Elsewhere:** `lib/apiClient.ts` gains `apiUpload` (XHR, for upload progress); `components/pipelines/portfolio/ParentPicker.tsx` takes a label; `components/agents/AgentDraftsList.tsx` hides linked drafts and `DraftPanel.tsx` links a linked draft to the mailbox editor; `features/agents/draftTypes.ts` gains `mail_draft_id`.
- **No new dependency** (Decision 1).

**Tech Stack:**
- React 19, TypeScript (strict, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`), Vite 8;
- Redux Toolkit (`createAsyncThunk`, `createSlice`, `current`), react-router 7, Tailwind v4 tokens (`src/index.css`), lucide-react 1.49;
- Vitest with Testing Library (jsdom) and `@testing-library/user-event` 14.

**Spec:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-fe/docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §3 ("Drafts, both ways", "Sending (new and reply)"), §4 "Communications › Mail" (search, compose, keyboard, phone width), §5 (frontend tests, delivery 3).

**API contract (binding; its "Decisions made in this contract" override the spec):** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail3-be/docs/superpowers/plans/2026-10-11-gmail-writing-api.md`. It wins on shapes, field names, codes and sentences. Sections used: decisions 8, 12, 13, 14, 17, 20, 21, 25, 28, 30, 31; §2 (`draft` on rows, `GET mail/drafts/<id>/`, `GET mail/compose/`), §3 (writes, PATCH, DELETE, bulk discard, `ReplyDraft` changes, attachments), §4 (send, confirm-sent, reopen), §6 (search, open), §10 (Outlook and IMAP), §11 (frontend-only parts), §12 (not in D3).

**The code this plan extends:** `docs/superpowers/plans/2026-10-11-gmail-actions-frontend.md` (delivery 2: `mailText.ts`, `testMail.ts`, the `mailbox` slice, `MailboxView`, `MailDetail`, `ThreadMessage`, `LabelMenu`, `MailBulkBar`, `useMailKeys`, `AttachmentViewer`, `mailOptimistic`). Read the spec sections, the contract and that plan before starting.

## Global Constraints

- **Worktree and branch:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail3-fe`, branch `feat/gmail-writing` (based on `main` at `9e8203e4`, which holds the D1 and D2 frontend). All paths below are relative to it. The D3 backend PR merges first; this PR follows it.
- **`node_modules`:** already linked to the main checkout's (`node_modules -> ../../react-ts-app/node_modules`, gitignored). If it is missing: `ln -s ../../react-ts-app/node_modules node_modules`. Never commit it.
- **Never run prettier. Never use `git stash`** (the stash stack is shared across worktrees; make a WIP commit to set work aside). `git add` explicit paths only, never `-A` or `.`. Never push.
- **Commands (from `package.json`):** one task: `npx vitest run <paths> --maxWorkers=2`; lint: `npm run lint` (`eslint .`); types and bundle: `npm run build` (`tsc -b && vite build`); everything: `npx vitest run --maxWorkers=4` (`npm test` is `vitest run`). Run them in the foreground.
- **Commits:** conventional (`feat(mail): ...`, `feat(comms): ...`, `feat(api): ...`, `feat(agents): ...`, `test(e2e): ...`, `docs: ...`), imperative, lowercase subject, a short why-body when not trivial, and every message ends with exactly this line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- **Field names exactly as the contract:** draft `id`, `kind` (`new` `reply` `reply_all` `forward`), `status` (`open` `sent`), `sending` (`null` `pending` `unconfirmed`), `revision`, `message_id`, `thread_id`, `source` (`message_id`, `subject`, `from`, `sent_at`), `from`, `to`, `cc`, `bcc`, `subject`, `html`, `text`, `attachments[]` (`id`, `filename`, `mime_type`, `size`, `origin` `upload|gmail|forward`, `download_url`), `total_bytes`, `max_bytes`, `record`, `suggested_record` (`kind` `customer|account`, `id`, `name`), `record_chosen`, `gmail.state` (`local` `saving` `saved` `failed`), `sync_issue`, `agent`, `reply_draft_id`, `created_at`, `updated_at`, `sent_at`, `can_resolve`; prefill `source_message_id`, `signature_html`, `forwarded`; row `draft` (`id`, `agent`, `reply_draft_id`); writes `to`, `cc`, `bcc`, `subject`, `html`, `forwarded`, `record` (`{kind, id}` or `null`), `revision`, `kind`, `source_message_id`; bulk discard `ids` and `{discarded}`; upload form field `file` and the answer `attachment`, `revision`, `total_bytes`; send answer `draft`, `message`, `email`; search `q`, `page_token`, `results[]` (`gmail_id`, `thread_id`, `subject`, `from`, `to`, `snippet`, `sent_at`, `has_attachments`, `message_id`), `next_page_token`, `result_size_estimate`; open `gmail_id`; `ReplyDraft.mail_draft_id`.
- **Codes exactly as the contract:** `DRAFT_CHANGED` (with `draft`), `ALREADY_SENT`, `IS_DRAFT`, `GMAIL_ONLY`, `NO_MAILBOX`, `TWO_WAY_OFF`, `MAILBOX_PAUSED`, `TOO_MANY_ATTACHMENTS`, `DRAFT_TOO_LARGE`, `MESSAGE_TOO_LARGE`, `GMAIL_BUSY`, `ATTACHMENT_UNAVAILABLE` and `ATTACHMENT_GONE` (with `attachment_id`), `DRAFT_GONE`, `MAILBOX_REFUSED`, `SEND_UNCONFIRMED`, `SEND_SUPERSEDED`, `NOT_UNCONFIRMED`, `NOT_IN_GMAIL`.
- **Server sentences are shown as the server sends them** (`detail`, field errors, `sync_issue.text`). The ones the screen says before anyone asks are the contract's, verbatim: "Attachments are limited to 25 MB in total." (the upload pre-check), "Add someone to send it to." (the send pre-check), "An agent draft stays on its record." and "This draft changed in Gmail." (§11). The file-type and per-file sentences mirror `customers.files.validate_upload`: "<.ext> is not an accepted file type.", "The file is empty.", "Files are limited to 25 MB.". Every other sentence this plan writes lives in `src/features/mail/mailText.ts`, except the one line added to the agent draft panel, which lives beside its siblings in `src/features/agents/draftsText.ts`.
- **Owner-only stays owner-only:** drafts, the prefill, uploads and the search are the owner's (contract §7). Nothing here shows another person's draft; `mail_draft_id` is only ever the reader's own.
- **Tokens only** (`src/test/houseRules.ts` `RAW`): no hex, no `rgb()`, no named Tailwind palette colour in any `.tsx`.
- **Type and weight:** sizes 11/13/15/22 px only, through `TYPE` (`src/components/ui/type.ts`) where a role fits; `font-normal` and `font-semibold` only. Never append a colour after a `TYPE` string; write the size classes out instead (`text-[11px] leading-4 text-danger-ink`).
- **Figures:** `NUM` around the figure only; a sentence with figures goes through `Figured` (`src/components/brain/Figured.tsx`).
- **Kinso look:** warm canvas, monochrome primary (`PRIMARY` only on Send), no card inside a card (no class string with `bg-surface` + `rounded-lg|xl` + `border` unless it carries a control height or a `focus-within:`/`focus-visible:` mark), `divide-y divide-line-subtle` lists, Lucide icons with `aria-hidden="true"`, no emoji, failures in `text-danger-ink` with an icon. Inside the Communications glass shell everything stays flat; only `CommunicationsPage`, `MailboxView` and `NextEventCard` may carry glass.
- **Targets and states:** every button, link and input reaches 44px below `sm` (`BUTTON`, `QUIET`, `ICON_BUTTON`, `PRIMARY`, `INPUT`, `min-h-11`); every icon-only button has an `aria-label`; loading, empty and error states for the composer and the Gmail results; one `role="status"` line per surface stays mounted.
- **Motion:** none beyond `motion-safe:animate-spin` on an upload's loader. Keyboard-initiated changes never animate.
- **No em dash (U+2014)** in any line this plan adds (code, comments, tests, docs copy). Existing lines that hold one stay byte-identical.
- **Phone width (375px):** no horizontal scroll; the composer fills the mailbox card with Back (the mailbox header and search hide below `sm` while it is open); chips and toolbars wrap; the Gmail results are a list like the mailbox's.
- **The UI ratchet** (`src/test/uiRatchet.test.ts`) holds every count **exactly** at its baseline (`sizes 886, cards 156, shadows 150, opacityDisabled 83, mono 38, bold 508`). New files add zero offences; no task raises a count.
- **House-rule suites stay green:** `src/components/ops.houseRules.test.ts` globs `src/pages/communications/*.{ts,tsx}` (tokens, sizes, no glass outside the three shell files, no hand-written card, weights, uppercase, named icon buttons). `src/test/inlineTargets.test.ts` keeps reading `src/pages/communications/MailDetail.tsx`, which must keep its `INLINE_TARGET` link.
- **Tests:** the repo's three tiers (`.claude/skills/testing/SKILL.md`): unit and integration with Vitest and Testing Library; **end-to-end is jsdom journeys in `src/e2e/`**, not Playwright, no msw. Fetch is stubbed only at the network boundary (`vi.stubGlobal('fetch', spy)` through `stubMail`, which also stubs `XMLHttpRequest` for uploads), with contract-shaped bodies; the store is real. `document.execCommand` (absent in jsdom) is stubbed per test with `Object.defineProperty(document, 'execCommand', { value: vi.fn(() => true), configurable: true })` and removed in `afterEach`.
- **Out of scope (contract §12):** schedule or undo send, snooze, send-as aliases, filters, the vacation responder, inline images in compose, Outlook or IMAP drafts or write-back, templates, storing whole threads from a search open, signature editing, a draft list route, automatic settling of an unconfirmed send; contact autocomplete in the address fields.

## Decisions (where the brief, the spec or the contract leaves a choice)

1. **The editor is a `contenteditable` region and `document.execCommand`; no dependency.** The five commands it needs (`bold`, `italic`, `insertUnorderedList`, `insertOrderedList`, `createLink`, plus `insertText`/`insertHTML` for paste and a bare link) work in every evergreen browser. `execCommand` is deprecated but unremoved and is called from one function (`runCommand`), so swapping it later touches one file. A library would cost 40 to 100 KB gzipped (Lexical, Tiptap with ProseMirror) for nothing these five commands do not already do. Every change is reduced to contract §11's tags (`p`, `br`, `strong`/`b`, `em`/`i`, `ul`, `ol`, `li`, `a[href]`, `blockquote`) plus the server's `div[data-revenact-signature]` before it is saved (`cleanEditable`); a paste keeps the text only, so no pasted image or style gets in (the server drops `data:` anyway).
2. **The composer takes the reading pane**, in place of the list or the open conversation, with Back; Back returns to what was there (the conversation stays selected). Below `sm` the mailbox header and search hide while it is open, so it fills the card: the spec's "full screen with Back" inside the app shell, as the conversation already does. It is not portalled: the glass card's `backdrop-filter` would make a `fixed` child relative to the card anyway.
3. **Who gets the new composer:** a Google connection with `two_way: true`, paused included (contract decision 14: drafts may be written while paused; Send then answers D1's paused words). Outlook, IMAP and read-only Google keep today's `ReplyBox` on today's route, with no Compose, Reply all or Forward (contract §10, decision 15).
4. **One draft is one `DraftSession`** (a plain class with `subscribe`/`getState`, wrapped by `useDraftSession` through `useSyncExternalStore`), so its rules are unit-tested without React. **Every write goes through one promise chain** (create, PATCH, upload, attachment delete, send, discard): a `revision` is never sent twice, and an upload's revision bump (uploads carry no `revision`, contract §3) can never make a PATCH in flight stale.
5. **Autosave (contract §11):** the first change waits 2 s and `POST mail/drafts/`; later changes wait 2 s and `PATCH` the whole content with `revision` (a PATCH that changes nothing enqueues nothing on the server). A compose closed untouched stores nothing. Back saves first; if nothing was ever stored and that save failed, the composer stays open with "This message isn't saved yet." and Close anyway.
6. **`409 DRAFT_CHANGED`:** autosave stops and a banner says "This draft changed in Gmail.", shows the newest version's subject and text, and offers **Use the Gmail version** (the returned draft replaces the screen) or **Keep mine** (its `revision` is adopted and the screen's content is saved over it, which the flush then writes to Gmail, contract decision 8).
7. **The quote:** the editor edits what is above the first `gmail_quote` block; the block is kept byte-for-byte, folded under "Show the quoted message" (shown in the sandboxed `MailHtmlBody`), and re-joined on every save. A body without one is all editable.
8. **The record line:** "Filed on <name>", "Suggested from the recipients" while the person has not chosen, Change (the existing `ParentPicker`, labelled "File on", not required) and Don't file; an agent draft says "An agent draft stays on its record." with no controls. `record` is sent only once the person changed it in this session, so until then the server keeps following the suggestion (decision 25).
9. **Uploads use `apiUpload` (XHR)**, because fetch cannot report upload progress, with the same token, refresh-once and session rules as `apiFetch`. Each file is checked first (type by extension against `FILE_ACCEPT`, empty, 25 MB per file, then the draft's `total_bytes` + the file against `max_bytes`, with the contract's 413 sentence) and uploaded one at a time through the chain. The first upload makes the draft if there is none yet.
10. **Send outcomes:** 200 closes the composer with "Message sent." and reads the list, the counts and the open conversation again; `504 SEND_UNCONFIRMED`, `409 SEND_SUPERSEDED`, `409 ALREADY_SENT` and `409 DRAFT_GONE` show the server's words and read the draft again (an unconfirmed or pending send turns the composer read-only with DRAFTS' "We couldn't confirm this was sent. Check your Sent folder." or "Sending…", and It was sent / Reopen draft once `can_resolve`; pending is read again each minute, as `DraftPanel` does); field errors (`to`, `record`, `subject`, `html`) show under their field; anything else is one alert by Send, with Open Connections for `TWO_WAY_OFF`, `NO_MAILBOX` and a revoked token. Send is off while an upload runs or a conflict waits.
11. **The Drafts folder:** a row whose `draft` is set opens the composer on `mail/drafts/<draft.id>/` (no read PATCH); Delete (bulk) and `#` discard only the draft: one is `DELETE mail/drafts/<id>/`, more are `POST mail/drafts/discard/`; the rows leave at once and come back if refused. The bulk bar shows only Delete and Clear there. A row drafted by an agent carries the agent's badge. `AgentDraftsList` hides a `ReplyDraft` whose `mail_draft_id` is set; its `DraftPanel` links to the mailbox editor.
12. **Search:** a `SearchInput` under the mailbox header sets `q` on the current view 300 ms after typing stops (`useSearchText`). While `q` is set on a Google mailbox, the last row under the results is **Search older mail in Gmail** (disabled with the paused reason while paused). It opens `GmailSearchResults` in the pane: 20 a page, More from Gmail, "In Revenact" on results with `message_id`; opening one with `message_id` opens that conversation, otherwise `POST mail/gmail/search/open/` then opens the stored message. Back from that conversation returns to the results.
13. **Keyboard:** `a`, `f`, `c` are bound. `r`, `a`, `f` open the composer on the open conversation (Gmail two-way; `r` keeps focusing the reply box elsewhere); `c` opens a new message from the list or a conversation. Every key is off inside the composer (`[data-mail-composer]`), as in fields, menus and dialogs. Reply, Reply all, Forward and Compose carry `aria-keyshortcuts`.
14. **`?folder=drafts&draft=<id>` on a mailbox source names a mailbox draft** (the `mail_action_failed` link of contract §5); `CommunicationsPage` leaves it to `MailboxView`, which opens the composer on it and drops both parameters. Every other `?draft=<id>` is still an agent's `ReplyDraft`.

## Contract gaps found (and how this plan resolves them)

- **`?draft=<id>` already means a `ReplyDraft`** on Communications (`draftParam`, `DraftRoute`), and the contract's failure link `/communications?source=mailbox:google&folder=drafts&draft=<MailDraft id>` reuses it for a `MailDraft`. Resolved by Decision 14 (`mailDraftParam`): a mailbox source with `folder=drafts` makes it a mailbox draft. No backend change needed.
- **The compose prefill carries no `max_bytes` or `total_bytes`.** Until a draft exists the screen uses `MAIL_SEND_MAX_BYTES` (26,214,400, contract decision 20) and the forwarded files' sizes; the first upload makes the draft and from then on the draft's own numbers count.
- **Only the reply's quote is named (`<div class="gmail_quote">`)**; the forward block's wrapper is not specified. `splitQuote` folds whatever starts at the first `gmail_quote` block and leaves everything editable when there is none. Ask the backend to wrap the forwarded block in `gmail_quote` as Gmail does, so a forward folds too.
- **The draft's `sync_issue` shape is not spelled out.** Read as D2's `{text, at}` (`SyncIssue`).
- **The mailbox has no search box**, though D1's `mail/messages/` and `mail/threads/` take `q` and the spec's search row sits under "the local search". D3 adds `q` to the mailbox query and the box (Decision 12).
- **An upload takes no `revision` yet bumps it**, so a PATCH racing an upload would be refused `DRAFT_CHANGED` with nothing changed in Gmail. Resolved by the single write chain (Decision 4).
- **Fetch cannot report upload progress** (the brief asks for it). Resolved by `apiUpload` over `XMLHttpRequest` (Decision 9).
- **A conversation whose message is a live draft** (rows and thread messages now carry `draft`) had no way to continue it. `ThreadMessage` shows such a message as a "Draft" line with Edit draft, which opens the composer on it.
- **Contract §11 says opening a draft row "opens the editor on `mail/drafts/<draft.id>/`"** but rows of Gmail drafts the reconcile has not mapped yet have `draft: null`. Such a row still opens its conversation, as in D2.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/features/mail/mailDrafts.ts` | Create | D3 wire types; every D3 call; `draftFailure`; `splitQuote`; recipients; `uploadRefusal`; `mailDraftParam` |
| `src/features/mail/mailText.ts` | Modify | Every D3 sentence; `composeTitle`, `saveLine`, `attachedTotal`, `gmailEstimate` |
| `src/features/mail/mailboxSlice.ts` | Modify | `draft` on rows; `q`; `compose`, `notice`; `discardDrafts` |
| `src/features/mail/mailEditor.ts` | Create | `runCommand`, `cleanEditable`, `safeHref`, `escapeHtml` |
| `src/features/mail/draftSession.ts` | Create | One draft's life: load, edits, autosave, conflict, uploads, send, discard |
| `src/features/mail/useDraftSession.ts` | Create | The React hook over `DraftSession`; the pending-send poll |
| `src/features/mail/testMail.ts` | Modify | D3 fixtures; compose, drafts, send, upload (fake XHR), discard, search routes; `q` |
| `src/lib/apiClient.ts` | Modify | `apiUpload` (XHR with progress); `urlOf` shared with `rawFetch` |
| `src/pages/communications/MailEditor.tsx` | Create | The formatting editor |
| `src/pages/communications/RecipientField.tsx` | Create | To, Cc, Bcc as chips |
| `src/pages/communications/ComposeAttachments.tsx` | Create | Files on the draft, uploads with progress, Attach files |
| `src/pages/communications/DraftRecordLine.tsx` | Create | Filed on, the suggestion, Change, Don't file |
| `src/pages/communications/MailComposer.tsx` | Create | The composer pane |
| `src/pages/communications/GmailSearchResults.tsx` | Create | Search older mail in Gmail |
| `src/pages/communications/MailboxView.tsx` | Modify | Compose, composer, search box and row, Gmail results, drafts, deep link, keys |
| `src/pages/communications/MailDetail.tsx` | Modify | Reply, Reply all, Forward for Gmail two-way; Edit draft |
| `src/pages/communications/ThreadMessage.tsx` | Modify | A live draft as a Draft line |
| `src/pages/communications/MailList.tsx` | Modify | The agent badge on an agent's draft row |
| `src/pages/communications/MailBulkBar.tsx` | Modify | Drafts: Delete (discard) and Clear only |
| `src/pages/communications/useMailKeys.ts` | Modify | `a`, `f`, `c`; off in the composer |
| `src/pages/communications/mailWho.ts` | Modify | `forwardTarget` |
| `src/pages/communications/CommunicationsPage.tsx` | Modify | A mailbox draft link is not an agent draft |
| `src/components/pipelines/portfolio/ParentPicker.tsx` | Modify | `label` and `required` props |
| `src/components/agents/AgentDraftsList.tsx` | Modify | Hide linked drafts |
| `src/components/agents/DraftPanel.tsx` | Modify | "Edit it in your mailbox" on a linked draft |
| `src/features/agents/draftTypes.ts`, `draftsText.ts` | Modify | `mail_draft_id`; `IN_MAILBOX`, `mailboxDraftHref` |
| `src/e2e/gmailWriting.test.tsx` | Create | The D3 journeys |
| `docs/03-ui-ux-design.md`, `docs/04-app-flow.md`, `.agents/workflows/repo-architecture.md` | Modify | Delivery 3 |

Tests created: `src/features/mail/mailDrafts.test.ts`, `src/features/mail/testMailWriting.test.ts`, `src/features/mail/mailEditor.test.ts`, `src/features/mail/draftSession.test.ts`, `src/pages/communications/MailEditor.test.tsx`, `src/pages/communications/RecipientField.test.tsx`, `src/pages/communications/ComposeAttachments.test.tsx`, `src/pages/communications/MailComposer.test.tsx`, `src/pages/communications/MailboxWriting.test.tsx`, `src/pages/communications/MailboxDrafts.test.tsx`, `src/pages/communications/GmailSearch.test.tsx`, `src/e2e/gmailWriting.test.tsx`. Tests changed: `src/lib/apiClient.test.ts`, `src/pages/communications/MailboxView.test.tsx`, `src/pages/communications/MailboxActions.test.tsx`, `src/pages/communications/MailDetail.test.tsx`, `src/pages/communications/useMailKeys.test.ts`, `src/e2e/gmail.test.tsx`, `src/components/agents/DraftPanel.test.tsx`.

---

### Task 1: Types, words and the draft API

**Files:**
- Create: `src/features/mail/mailDrafts.ts`
- Modify: `src/features/mail/mailText.ts` (append the D3 block)
- Modify: `src/features/mail/mailboxSlice.ts` (types: `draft` on `MailMessage` and `MailThread`; `rowOfMessage` carries it)
- Modify: `src/features/agents/draftTypes.ts` (`mail_draft_id`)
- Modify: `src/features/mail/testMail.ts` (fixtures only: `SIGNATURE`, `QUOTE_ANN`, `MAIL_DRAFT`, `MAIL_DRAFT_MESSAGE`; `threadRowOf` carries `draft`)
- Test: `src/features/mail/mailDrafts.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError` (`lib/apiClient.ts`); `actionFailure`, `ActionFailure` (`mailText.ts`); `FILE_ACCEPT`, `formatSize` (`features/files/fileFormat.ts`); `draftParam` (`features/agents/draftsText.ts`); `AgentKind` (`features/agents/agentTypes.ts`); `MailMessageDetail`, `MailParticipant`, `SyncIssue` (`mailboxSlice.ts`).
- Produces (`mailDrafts.ts`, types): `DraftKind`, `Recipient`, `RecordKind`, `DraftRecord`, `DraftAttachment`, `MailDraftRef`, `GmailDraftState`, `MailDraft`, `ComposePrefill`, `DraftContent`, `NewDraft`, `DraftSent`, `DraftBytes`, `DraftUpload`, `GmailSearchResult`, `GmailSearchPage`, `DraftField`, `DraftFailure`.
- Produces (`mailDrafts.ts`, values): `MAIL_SEND_MAX_BYTES`; `fetchComposePrefill(kind: DraftKind, messageId: number | null): Promise<ComposePrefill>`; `createMailDraft(body: NewDraft): Promise<MailDraft>`; `fetchMailDraft(id: number): Promise<MailDraft>`; `patchMailDraft(id: number, body: DraftContent & { revision: number }): Promise<MailDraft>`; `discardMailDraft(id: number): Promise<null>`; `discardMailDrafts(ids: number[]): Promise<{ discarded: number }>`; `sendMailDraft(id: number, body: DraftContent & { revision: number }): Promise<DraftSent>`; `confirmMailDraftSent(id: number): Promise<MailDraft>`; `reopenMailDraft(id: number): Promise<MailDraft>`; `removeDraftAttachment(id: number, attachmentId: number): Promise<DraftBytes>`; `searchGmail(q: string, pageToken: string | null): Promise<GmailSearchPage>`; `openGmailResult(gmailId: string): Promise<MailMessageDetail>`; `draftFailure(err: unknown, fallback: string): DraftFailure`; `plainFailure(text: string): DraftFailure`; `splitQuote(html: string): { body: string; quote: string }`; `joinQuote(body: string, quote: string): string`; `parseRecipients(text: string): { valid: Recipient[]; invalid: string[] }`; `addRecipients(list: Recipient[], more: Recipient[]): Recipient[]`; `recipientName(r: Recipient): string`; `recipientText(r: Recipient): string`; `extensionOf(name: string): string`; `uploadRefusal(file: { name: string; size: number }, totalBytes: number, maxBytes: number): string | null`; `mailDraftParam(params: URLSearchParams): number | null`. (`uploadDraftAttachment` comes in Task 2, with `apiUpload`.)
- Produces (`mailText.ts`): the constants and functions listed in Step 3, verbatim names.
- Produces (`mailboxSlice.ts`): `MailMessage.draft?: MailDraftRef | null`, `MailThread.draft?: MailDraftRef | null` ("absent reads as null").
- Produces (`testMail.ts`): `SIGNATURE`, `QUOTE_ANN`, `MAIL_DRAFT: MailDraft`, `MAIL_DRAFT_MESSAGE: MailMessageDetail`.

- [ ] **Step 1: Write the failing test**

Create `src/features/mail/mailDrafts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { addRecipients, draftFailure, joinQuote, mailDraftParam, parseRecipients, recipientText, splitQuote, uploadRefusal, MAIL_SEND_MAX_BYTES } from './mailDrafts';
import { attachedTotal, composeTitle, DRAFT_TOO_LARGE_TEXT, FILE_EMPTY, FILE_TOO_LARGE, gmailEstimate, NOT_IN_GMAIL_YET, SAVED_GMAIL, SAVED_HERE, SAVING, saveLine } from './mailText';
import { MAIL_DRAFT, QUOTE_ANN, SIGNATURE } from './testMail';

// Unit tier: the D3 wire helpers and words (contract
// revenact-backend docs/superpowers/plans/2026-10-11-gmail-writing-api.md).

describe('draftFailure', () => {
  it('keeps the newest draft from a 409 DRAFT_CHANGED', () => {
    const newer = { ...MAIL_DRAFT, revision: 5 };
    const failure = draftFailure(new ApiError(409, { code: 'DRAFT_CHANGED', detail: 'This draft changed in Gmail. Here is the newest version.', draft: newer }, 'This draft changed in Gmail. Here is the newest version.'), 'x');
    expect(failure.code).toBe('DRAFT_CHANGED');
    expect(failure.draft?.revision).toBe(5);
    expect(failure.fields).toEqual({});
  });

  it('reads 400 field errors in the server words', () => {
    const failure = draftFailure(new ApiError(400, { to: ['Add someone to send it to.'], record: ['Choose a record you can open.'] }, 'Add someone to send it to.'), 'x');
    expect(failure.fields).toEqual({ to: 'Add someone to send it to.', record: 'Choose a record you can open.' });
    expect(failure.status).toBe(400);
  });

  it('names the attachment Gmail could not give, and says how to reconnect', () => {
    const missing = draftFailure(new ApiError(409, { code: 'ATTACHMENT_UNAVAILABLE', detail: "Couldn't get Renewal quote.pdf from Gmail. Remove it or try again.", attachment_id: 31 }, "Couldn't get Renewal quote.pdf from Gmail. Remove it or try again."), 'x');
    expect(missing.attachmentId).toBe(31);
    const off = draftFailure(new ApiError(409, { code: 'TWO_WAY_OFF', detail: 'Reconnect.', needs_reconnect: true }, 'Reconnect.'), 'x');
    expect(off.reconnect).toBe(true);
  });

  it('falls back when the network failed', () => {
    expect(draftFailure(new TypeError('Failed to fetch'), 'Could not save the draft.').text).toBe('Could not save the draft.');
  });
});

describe('splitQuote and joinQuote', () => {
  it('folds everything from the first gmail_quote block, and joins it back unchanged', () => {
    const html = `<p>Works for us.</p>${SIGNATURE}${QUOTE_ANN}`;
    const { body, quote } = splitQuote(html);
    expect(body).toBe(`<p>Works for us.</p>${SIGNATURE}`);
    expect(quote).toBe(QUOTE_ANN);
    expect(joinQuote(body, quote)).toBe(html);
  });

  it('leaves a body without a quote all editable', () => {
    expect(splitQuote('<p>Hi</p>')).toEqual({ body: '<p>Hi</p>', quote: '' });
  });
});

describe('recipients', () => {
  it('reads names, bare addresses and separators, and keeps what is not an address', () => {
    expect(parseRecipients('Ann Lee <Ann@PizzaHut.com>; sam@pizzahut.com,\nnot-an-address')).toEqual({
      valid: [
        ['Ann Lee', 'ann@pizzahut.com'],
        ['', 'sam@pizzahut.com'],
      ],
      invalid: ['not-an-address'],
    });
  });

  it('never adds an address twice', () => {
    expect(addRecipients([['Ann Lee', 'ann@pizzahut.com']], [['', 'ANN@pizzahut.com'], ['', 'ops@pizzahut.com']])).toEqual([
      ['Ann Lee', 'ann@pizzahut.com'],
      ['', 'ops@pizzahut.com'],
    ]);
    expect(recipientText(['Ann Lee', 'ann@pizzahut.com'])).toBe('Ann Lee <ann@pizzahut.com>');
    expect(recipientText(['', 'ann@pizzahut.com'])).toBe('ann@pizzahut.com');
  });
});

describe('uploadRefusal (contract decisions 20 and 21)', () => {
  it('refuses a type the allow-list does not hold, an empty file, a file over 25 MB, and a total over the limit', () => {
    expect(uploadRefusal({ name: 'pricing.zip', size: 10 }, 0, MAIL_SEND_MAX_BYTES)).toBe('.zip is not an accepted file type.');
    expect(uploadRefusal({ name: 'README', size: 10 }, 0, MAIL_SEND_MAX_BYTES)).toBe('that type is not an accepted file type.');
    expect(uploadRefusal({ name: 'quote.pdf', size: 0 }, 0, MAIL_SEND_MAX_BYTES)).toBe(FILE_EMPTY);
    expect(uploadRefusal({ name: 'quote.pdf', size: MAIL_SEND_MAX_BYTES + 1 }, 0, MAIL_SEND_MAX_BYTES)).toBe(FILE_TOO_LARGE);
    expect(uploadRefusal({ name: 'quote.pdf', size: 2_000_000 }, 25_000_000, MAIL_SEND_MAX_BYTES)).toBe(DRAFT_TOO_LARGE_TEXT);
    expect(uploadRefusal({ name: 'Quote.PDF', size: 2_000_000 }, 0, MAIL_SEND_MAX_BYTES)).toBeNull();
  });
});

describe('mailDraftParam (Decision 14)', () => {
  it('reads a mailbox draft only on a mailbox source in Drafts', () => {
    expect(mailDraftParam(new URLSearchParams('source=mailbox:google&folder=drafts&draft=55'))).toBe(55);
    expect(mailDraftParam(new URLSearchParams('draft=7'))).toBeNull();
    expect(mailDraftParam(new URLSearchParams('source=mailbox:google&draft=7'))).toBeNull();
    expect(mailDraftParam(new URLSearchParams('source=mailbox:google&folder=drafts&draft=x'))).toBeNull();
  });
});

describe('the D3 words', () => {
  it('titles the composer by kind', () => {
    expect(composeTitle('new')).toBe('New message');
    expect(composeTitle('reply_all')).toBe('Reply all');
  });

  it('says where the draft is saved', () => {
    expect(saveLine(null)).toBe('');
    expect(saveLine({ ...MAIL_DRAFT, gmail: { state: 'saving' } })).toBe(SAVING);
    expect(saveLine(MAIL_DRAFT)).toBe(SAVED_GMAIL);
    expect(saveLine({ ...MAIL_DRAFT, gmail: { state: 'local' } })).toBe(SAVED_HERE);
    expect(saveLine({ ...MAIL_DRAFT, gmail: { state: 'failed' } })).toBe(NOT_IN_GMAIL_YET);
    expect(saveLine({ ...MAIL_DRAFT, gmail: { state: 'failed' }, sync_issue: { text: "Couldn't save this draft to Gmail: an attachment is no longer in Gmail.", at: '2026-10-11T09:04:00Z' } })).toBe(
      "Couldn't save this draft to Gmail: an attachment is no longer in Gmail.",
    );
  });

  it('counts the attachments against 25 MB and the Gmail estimate', () => {
    expect(attachedTotal(274630)).toBe('268 KB of 25 MB attached');
    expect(gmailEstimate(41)).toBe('About 41 in Gmail');
    expect(gmailEstimate(1200)).toBe('About 1,200 in Gmail');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/mail/mailDrafts.test.ts --maxWorkers=2`
Expected: FAIL with "Failed to resolve import "./mailDrafts"".

- [ ] **Step 3: Write the implementation**

Append to `src/features/mail/mailText.ts` (after `BULK_SELECTED`), and add `import { formatSize } from '../files/fileFormat';` and `import type { DraftKind, MailDraft } from './mailDrafts';` to its imports:

```ts
// Two-way Gmail, delivery 3 (contract revenact-backend
// docs/superpowers/plans/2026-10-11-gmail-writing-api.md). Where the
// contract gives a sentence it is copied verbatim.

export const COMPOSE = 'Compose';
export const REPLY = 'Reply';
export const REPLY_ALL = 'Reply all';
export const FORWARD = 'Forward';
export const DRAFT_BADGE = 'Draft';
export const EDIT_DRAFT = 'Edit draft';
export const BACK = 'Back';

const COMPOSE_TITLE: Record<DraftKind, string> = { new: 'New message', reply: 'Reply', reply_all: 'Reply all', forward: 'Forward' };
export const composeTitle = (kind: DraftKind): string => COMPOSE_TITLE[kind];
export const COMPOSE_OPENING = 'Opening the message';

export const FIELD_FROM = 'From';
export const FIELD_TO = 'To';
export const FIELD_CC = 'Cc';
export const FIELD_BCC = 'Bcc';
export const FIELD_SUBJECT = 'Subject';
export const FIELD_MESSAGE = 'Message';
export const ADD_CC = 'Add Cc';
export const ADD_BCC = 'Add Bcc';
export const removeRecipient = (address: string): string => `Remove ${address}`;
export const badAddress = (text: string): string => `Check this address: ${text}`;
/** The chips' list name; the field itself keeps the bare label. */
export const chipsLabel = (field: string): string => `${field} addresses`;

// The editor (Decision 1).
export const FORMATTING = 'Formatting';
export const BOLD = 'Bold';
export const ITALIC = 'Italic';
export const BULLETS = 'Bulleted list';
export const NUMBERS = 'Numbered list';
export const LINK = 'Link';
export const LINK_ADDRESS = 'Link address';
export const ADD_LINK = 'Add link';
export const BAD_LINK = 'Use a web or email address.';
export const QUOTE_SHOW = 'Show the quoted message';
export const QUOTE_HIDE = 'Hide the quoted message';
export const QUOTE_TITLE = 'The quoted message';

// Saving (contract §2 gmail.state, §11 DRAFT_CHANGED; Decisions 5 and 6).
export const SAVING = 'Saving…';
export const SAVED_GMAIL = 'Saved to Gmail';
export const SAVED_HERE = 'Saved';
export const NOT_IN_GMAIL_YET = "Not saved to Gmail yet. It's kept here and tries again with your next edit.";
/** Contract §11, verbatim. */
export const CHANGED_IN_GMAIL = 'This draft changed in Gmail.';
export const CHANGED_CHOICE = 'Use the version from Gmail, or keep what you wrote here and save it over that one.';
export const USE_GMAIL = 'Use the Gmail version';
export const KEEP_MINE = 'Keep mine';
export const CLOSE_UNSAVED = "This message isn't saved yet.";
export const CLOSE_ANYWAY = 'Close anyway';

/** The line by the composer's title: where the draft is (Decision 5). */
export function saveLine(draft: Pick<MailDraft, 'gmail' | 'sync_issue'> | null): string {
  if (!draft) return '';
  if (draft.gmail.state === 'failed') return draft.sync_issue?.text ?? NOT_IN_GMAIL_YET;
  if (draft.gmail.state === 'saving') return SAVING;
  return draft.gmail.state === 'saved' ? SAVED_GMAIL : SAVED_HERE;
}

// Attachments (contract §3, decisions 20 and 21; Decision 9).
export const ATTACH = 'Attach files';
export const CHOOSE_FILES = 'Choose files to attach';
export const ATTACHMENTS_LABEL = 'Attachments';
export const FROM_ORIGINAL = 'From the original';
export const removeFile = (name: string): string => `Remove ${name}`;
export const uploadingLabel = (name: string): string => `Uploading ${name}`;
/** Contract §3 DRAFT_TOO_LARGE, verbatim: said before the upload starts. */
export const DRAFT_TOO_LARGE_TEXT = 'Attachments are limited to 25 MB in total.';
// customers.files.validate_upload's sentences, so the pre-check and the server agree.
export const FILE_EMPTY = 'The file is empty.';
export const FILE_TOO_LARGE = 'Files are limited to 25 MB.';
export const typeRefused = (ext: string): string => `${ext || 'that type'} is not an accepted file type.`;
export const attachedTotal = (bytes: number): string => `${formatSize(bytes)} of 25 MB attached`;

// Where it is filed (contract decision 25; Decision 8).
export const filedOn = (name: string): string => `Filed on ${name}`;
export const NOT_FILED = 'Not filed on a record';
export const RECORD_SUGGESTED = 'Suggested from the recipients';
export const RECORD_PICKER_LABEL = 'File on';
export const CHANGE_RECORD = 'Change';
export const DONT_FILE = "Don't file";
export const CANCEL = 'Cancel';
/** Contract §3, verbatim. */
export const AGENT_RECORD_FIXED = 'An agent draft stays on its record.';

// Sending (contract §4; Decision 10).
export const SEND = 'Send';
export const SENDING = 'Sending…';
export const MESSAGE_SENT = 'Message sent.';
export const DISCARD_DRAFT = 'Discard draft';
export const DRAFT_DISCARDED = 'Draft discarded.';
/** Contract §4 step 4, verbatim: said before anything is saved. */
export const NO_RECIPIENT = 'Add someone to send it to.';

// Fallbacks for the D3 calls, used only when the server gave no sentence.
export const PREFILL_FAILED = 'Could not start this message.';
export const DRAFT_OPEN_FAILED = 'Could not open the draft.';
export const DRAFT_SAVE_FAILED = 'Could not save the draft.';
export const SEND_FAILED = 'Could not send the message.';
export const UPLOAD_FAILED = 'Could not attach the file.';
export const DISCARD_FAILED = 'Could not discard the draft.';

// Search (contract §6, decision 28; Decision 12).
export const SEARCH_MAIL_LABEL = 'Search your mail';
export const SEARCH_MAIL_PLACEHOLDER = 'Search mail';
export const SEARCH_GMAIL = 'Search older mail in Gmail';
export const GMAIL_RESULTS = 'Results from Gmail';
export const GMAIL_SEARCHING = 'Searching Gmail';
export const GMAIL_NONE = 'Gmail found nothing for this search.';
export const GMAIL_MORE = 'More from Gmail';
export const HELD = 'In Revenact';
export const BACK_TO_MAIL = 'Back to your mail';
export const GMAIL_SEARCH_FAILED = 'Could not search Gmail.';
export const GMAIL_OPEN_FAILED = 'Could not open this message.';
export const gmailEstimate = (n: number): string => `About ${count(n)} in Gmail`;
```

Create `src/features/mail/mailDrafts.ts`:

```ts
// Two-way Gmail, delivery 3: the draft, compose and search wire shapes and
// their calls (contract revenact-backend
// docs/superpowers/plans/2026-10-11-gmail-writing-api.md §2, §3, §4, §6),
// and the small rules around them. No React here.

import { apiFetch, ApiError } from '../../lib/apiClient';
import { FILE_ACCEPT } from '../files/fileFormat';
import { draftParam } from '../agents/draftsText';
import type { AgentKind } from '../agents/agentTypes';
import type { MailMessageDetail, MailParticipant, SyncIssue } from './mailboxSlice';
import { actionFailure, DRAFT_TOO_LARGE_TEXT, FILE_EMPTY, FILE_TOO_LARGE, typeRefused, type ActionFailure } from './mailText';

export type DraftKind = 'new' | 'reply' | 'reply_all' | 'forward';
/** `[name, address]`, the shape of `MailMessage.to`. */
export type Recipient = [string, string];
export type RecordKind = 'customer' | 'account';

/** A record the owner may open (contract §2). */
export interface DraftRecord {
  kind: RecordKind;
  id: number;
  name: string;
}

export interface DraftAttachment {
  id: number;
  filename: string;
  mime_type: string;
  size: number;
  /** `upload` (added here), `gmail` (on the Gmail draft), `forward` (kept from the source). */
  origin: 'upload' | 'gmail' | 'forward';
  download_url: string;
}

/** `draft` on a message row (contract §2): null unless the message is a live draft. */
export interface MailDraftRef {
  id: number;
  agent: AgentKind | null;
  reply_draft_id: number | null;
}

export type GmailDraftState = 'local' | 'saving' | 'saved' | 'failed';

/** `GET mail/drafts/<id>/` (contract §2). */
export interface MailDraft {
  id: number;
  kind: DraftKind;
  /** `sending` reads `sent` with `sent_at: null`. */
  status: 'open' | 'sent';
  sending: 'pending' | 'unconfirmed' | null;
  revision: number;
  /** The draft's row in Drafts. */
  message_id: number | null;
  thread_id: string;
  source: { message_id: number; subject: string; from: MailParticipant; sent_at: string } | null;
  from: MailParticipant;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  html: string;
  text: string;
  attachments: DraftAttachment[];
  total_bytes: number;
  max_bytes: number;
  record: DraftRecord | null;
  suggested_record: DraftRecord | null;
  record_chosen: boolean;
  gmail: { state: GmailDraftState };
  /** Read as D2's `{text, at}` (contract gap). */
  sync_issue: SyncIssue | null;
  agent: AgentKind | null;
  reply_draft_id: number | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  can_resolve: boolean;
}

/** `GET mail/compose/?kind=&message=` (contract §2): nothing stored yet. */
export interface ComposePrefill {
  kind: DraftKind;
  source_message_id: number | null;
  from: MailParticipant;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  /** The signature and any quote are already in it (contract decision 17). */
  html: string;
  signature_html: string;
  forwarded: DraftAttachment[];
  record: DraftRecord | null;
  suggested_record: DraftRecord | null;
}

/** The content fields every write takes (contract §3). */
export interface DraftContent {
  to?: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  subject?: string;
  html?: string;
  /** Forward only: the source's attachment ids to keep. */
  forwarded?: number[];
  /** Sent only once the person chose (Decision 8); `null` files it nowhere. */
  record?: { kind: RecordKind; id: number } | null;
}

export interface NewDraft extends DraftContent {
  kind: DraftKind;
  source_message_id?: number;
}

/** `POST mail/drafts/<id>/send/` 200 (contract §4). */
export interface DraftSent {
  draft: MailDraft;
  message: MailMessageDetail;
  email: { id: number; subject: string; sent_at: string; thread_id: string } | null;
}

/** An attachment delete's answer (contract §3). */
export interface DraftBytes {
  revision: number;
  total_bytes: number;
}

/** An upload's answer (contract §3). */
export interface DraftUpload extends DraftBytes {
  attachment: DraftAttachment;
}

/** One live Gmail result (contract §6); `message_id` is set when Revenact holds it. */
export interface GmailSearchResult {
  gmail_id: string;
  thread_id: string;
  subject: string;
  from: MailParticipant;
  to: Recipient[];
  snippet: string;
  sent_at: string;
  has_attachments: boolean;
  message_id: number | null;
}

export interface GmailSearchPage {
  results: GmailSearchResult[];
  next_page_token: string | null;
  result_size_estimate: number;
}

/** Contract decision 20 (`MAIL_SEND_MAX_BYTES`): the limit before a draft says its own `max_bytes`. */
export const MAIL_SEND_MAX_BYTES = 26_214_400;

const DRAFTS_PATH = '/mail/drafts/';
const one = (id: number) => `${DRAFTS_PATH}${id}/`;

export function fetchComposePrefill(kind: DraftKind, messageId: number | null): Promise<ComposePrefill> {
  const params = new URLSearchParams({ kind });
  if (messageId !== null) params.set('message', String(messageId));
  return apiFetch<ComposePrefill>(`/mail/compose/?${params.toString()}`);
}

export const createMailDraft = (body: NewDraft) => apiFetch<MailDraft>(DRAFTS_PATH, { method: 'POST', body });
export const fetchMailDraft = (id: number) => apiFetch<MailDraft>(one(id));
export const patchMailDraft = (id: number, body: DraftContent & { revision: number }) => apiFetch<MailDraft>(one(id), { method: 'PATCH', body });
/** 204: only the draft goes; the conversation stays (contract decision 12). */
export const discardMailDraft = (id: number) => apiFetch<null>(one(id), { method: 'DELETE' });
/** All or nothing, 1 to 100 ids. */
export const discardMailDrafts = (ids: number[]) => apiFetch<{ discarded: number }>(`${DRAFTS_PATH}discard/`, { method: 'POST', body: { ids } });
export const sendMailDraft = (id: number, body: DraftContent & { revision: number }) => apiFetch<DraftSent>(`${one(id)}send/`, { method: 'POST', body });
export const confirmMailDraftSent = (id: number) => apiFetch<MailDraft>(`${one(id)}confirm-sent/`, { method: 'POST' });
export const reopenMailDraft = (id: number) => apiFetch<MailDraft>(`${one(id)}reopen/`, { method: 'POST' });
export const removeDraftAttachment = (id: number, attachmentId: number) => apiFetch<DraftBytes>(`${one(id)}attachments/${attachmentId}/`, { method: 'DELETE' });

/** A live Gmail search (contract §6): nothing is stored. */
export function searchGmail(q: string, pageToken: string | null): Promise<GmailSearchPage> {
  const params = new URLSearchParams({ q });
  if (pageToken) params.set('page_token', pageToken);
  return apiFetch<GmailSearchPage>(`/mail/gmail/search/?${params.toString()}`);
}

/** 200 when held, 201 once stored: the message detail either way. */
export const openGmailResult = (gmailId: string) => apiFetch<MailMessageDetail>('/mail/gmail/search/open/', { method: 'POST', body: { gmail_id: gmailId } });

export type DraftField = 'to' | 'cc' | 'bcc' | 'subject' | 'html' | 'record' | 'revision' | 'file' | 'source_message_id';
const FIELDS: DraftField[] = ['to', 'cc', 'bcc', 'subject', 'html', 'record', 'revision', 'file', 'source_message_id'];

/** Why a draft write did not take: D2's failure, plus the field errors,
 *  the newest draft on DRAFT_CHANGED and the attachment a send could not get. */
export interface DraftFailure extends ActionFailure {
  fields: Partial<Record<DraftField, string>>;
  draft: MailDraft | null;
  attachmentId: number | null;
  status: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function draftFailure(err: unknown, fallback: string): DraftFailure {
  const base = actionFailure(err, fallback);
  if (!(err instanceof ApiError)) return { ...base, fields: {}, draft: null, attachmentId: null, status: null };
  const body = isRecord(err.body) ? err.body : {};
  const fields: Partial<Record<DraftField, string>> = {};
  if (err.status === 400 && base.code === null) {
    for (const field of FIELDS) {
      const value = body[field];
      if (Array.isArray(value) && typeof value[0] === 'string') fields[field] = value[0];
    }
  }
  return {
    ...base,
    fields,
    draft: base.code === 'DRAFT_CHANGED' && isRecord(body.draft) ? (body.draft as unknown as MailDraft) : null,
    attachmentId: typeof body.attachment_id === 'number' ? body.attachment_id : null,
    status: err.status,
  };
}

/** A refusal the screen makes itself, before asking the server. */
export const plainFailure = (text: string): DraftFailure => ({ text, reconnect: false, code: null, fields: {}, draft: null, attachmentId: null, status: null });

const QUOTE_START = /<div\b[^>]*\bclass="[^"]*\bgmail_quote\b[^"]*"/i;

/** What the editor edits, and the quote kept as it is (Decision 7). */
export function splitQuote(html: string): { body: string; quote: string } {
  const at = html.search(QUOTE_START);
  return at < 0 ? { body: html, quote: '' } : { body: html.slice(0, at), quote: html.slice(at) };
}

export const joinQuote = (body: string, quote: string): string => body + quote;

const ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Addresses typed or pasted: "Name <a@b.c>" or "a@b.c", split on commas,
 *  semicolons and new lines, lower-cased as the server stores them. */
export function parseRecipients(text: string): { valid: Recipient[]; invalid: string[] } {
  const valid: Recipient[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const part = raw.trim();
    if (!part) continue;
    const named = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(part);
    const name = named ? named[1].trim() : '';
    const address = (named ? named[2] : part).trim().toLowerCase();
    if (ADDRESS.test(address)) valid.push([name, address]);
    else invalid.push(part);
  }
  return { valid, invalid };
}

/** `list` plus `more`, without an address twice (case-insensitive). */
export function addRecipients(list: Recipient[], more: Recipient[]): Recipient[] {
  const seen = new Set(list.map(([, address]) => address.toLowerCase()));
  const out = [...list];
  for (const r of more) {
    const key = r[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([r[0], key]);
  }
  return out;
}

export const recipientName = ([name, address]: Recipient): string => name || address;
export const recipientText = ([name, address]: Recipient): string => (name ? `${name} <${address}>` : address);

const ACCEPTED = new Set(FILE_ACCEPT.split(','));

/** ".pdf" from "Quote.PDF"; "" when there is none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

/** Why a file cannot be attached, checked before any upload (Decision 9); null when it can. */
export function uploadRefusal(file: { name: string; size: number }, totalBytes: number, maxBytes: number): string | null {
  const ext = extensionOf(file.name);
  if (!ACCEPTED.has(ext)) return typeRefused(ext);
  if (file.size === 0) return FILE_EMPTY;
  if (file.size > MAIL_SEND_MAX_BYTES) return FILE_TOO_LARGE;
  if (totalBytes + file.size > maxBytes) return DRAFT_TOO_LARGE_TEXT;
  return null;
}

/** `?folder=drafts&draft=<id>` on a mailbox source: a mailbox draft, not an agent's (Decision 14). */
export function mailDraftParam(params: URLSearchParams): number | null {
  if (!(params.get('source') ?? '').startsWith('mailbox:') || params.get('folder') !== 'drafts') return null;
  return draftParam(params);
}
```

In `src/features/mail/mailboxSlice.ts`, add `import type { MailDraftRef } from './mailDrafts';` and these fields:

```ts
// in interface MailMessage, after sync_issue:
  /** A live draft's handle (D3 contract §2); absent reads as null. */
  draft?: MailDraftRef | null;

// in interface MailThread, after sync_issue:
  /** D3 contract §2; absent reads as null. */
  draft?: MailDraftRef | null;
```

and in `rowOfMessage`, after `sync_issue: m.sync_issue,`:

```ts
    draft: m.draft ?? null,
```

In `src/features/agents/draftTypes.ts`, inside `interface ReplyDraft`, after `can_resolve: boolean;`:

```ts
  /** The linked Gmail draft (two-way Gmail D3 contract §3): set only for its
   *  owner, and only when the source mail is in their own two-way Gmail. */
  mail_draft_id?: number | null;
```

In `src/features/mail/testMail.ts`, add `import type { MailDraft } from './mailDrafts';`, add `draft: m.draft ?? null,` to `threadRowOf`'s object (after `sync_issue: m.sync_issue,`), and add after `MAIL_INVOICE`:

```ts
/** The signature block the server puts in every new draft (D3 contract decision 17). */
export const SIGNATURE = '<div data-revenact-signature>Dana Ruiz<br>Dough Co</div>';

/** The quote under a reply to Ann (D3 contract §2). */
export const QUOTE_ANN = '<div class="gmail_quote">On 2026-10-09, Ann Lee &lt;ann@pizzahut.com&gt; wrote:<blockquote>Hi Dana,\nQuote attached.\nAnn</blockquote></div>';

/** A person's reply to Ann, saved in Gmail (D3 contract §2). */
export const MAIL_DRAFT: MailDraft = {
  id: 55,
  kind: 'reply',
  status: 'open',
  sending: null,
  revision: 1,
  message_id: 70,
  thread_id: 't1',
  source: { message_id: 1, subject: 'Renewal quote', from: { name: 'Ann Lee', address: 'ann@pizzahut.com' }, sent_at: '2026-10-09T09:00:00Z' },
  from: { name: 'Dana Ruiz', address: 'dana@doughco.com' },
  to: [['Ann Lee', 'ann@pizzahut.com']],
  cc: [],
  bcc: [],
  subject: 'Re: Renewal quote',
  html: `<p>Works for us.</p>${SIGNATURE}${QUOTE_ANN}`,
  text: 'Works for us.\n\n-- \nDana Ruiz\nDough Co',
  attachments: [],
  total_bytes: 0,
  max_bytes: 26214400,
  record: { kind: 'customer', id: 3, name: 'Pizza Hut' },
  suggested_record: { kind: 'customer', id: 3, name: 'Pizza Hut' },
  record_chosen: false,
  gmail: { state: 'saved' },
  sync_issue: null,
  agent: null,
  reply_draft_id: null,
  created_at: '2026-10-11T09:01:00Z',
  updated_at: '2026-10-11T09:03:12Z',
  sent_at: null,
  can_resolve: false,
};

/** MAIL_DRAFT's row in Drafts and in Ann's conversation. */
export const MAIL_DRAFT_MESSAGE: MailMessageDetail = {
  ...MAIL_EARLIER,
  id: 70,
  thread_id: 't1',
  to: [['Ann Lee', 'ann@pizzahut.com']],
  subject: 'Re: Renewal quote',
  snippet: 'Works for us.',
  sent_at: '2026-10-11T09:03:12Z',
  folder: 'drafts',
  account: null,
  body: 'Works for us.',
  html_body: MAIL_DRAFT.html,
  draft: { id: 55, agent: null, reply_draft_id: null },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/mail/mailDrafts.test.ts src/features/mail src/features/agents --maxWorkers=2`
Expected: PASS (the D1 and D2 mail suites and the agents suites unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/mailDrafts.ts src/features/mail/mailDrafts.test.ts src/features/mail/mailText.ts src/features/mail/mailboxSlice.ts src/features/mail/testMail.ts src/features/agents/draftTypes.ts
git commit -m "$(cat <<'EOF'
feat(mail): add the delivery 3 draft, compose and search api and words

The wire shapes, calls and small rules for writing Gmail (contract
2026-10-11-gmail-writing-api), and every sentence the screens add.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The stub speaks delivery 3

**Files:**
- Modify: `src/features/mail/testMail.ts`
- Modify: `src/lib/apiClient.ts` (`urlOf`, `apiUpload`; its unit tests are Task 5's)
- Modify: `src/features/mail/mailDrafts.ts` (`uploadDraftAttachment`)
- Test: `src/features/mail/testMailWriting.test.ts`

**Interfaces:**
- Consumes: Task 1's types and fixtures; `calls`, `sent` (`features/agents/testAgents.ts`).
- Produces (`apiClient.ts`): `apiUpload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T>`. (`mailDrafts.ts`): `uploadDraftAttachment(id: number, file: File, onProgress: (fraction: number) => void): Promise<DraftUpload>`.
- Produces (`testMail.ts`): `MailStubState` gains `drafts: MailDraft[]`, `gmailOnly: MailMessageDetail[]`, `sendAnswer: { status: number; body: unknown } | null`, `draftSaveFails: boolean`; `stubMail()` also stubs `XMLHttpRequest` (a `FakeXhr` routed through the same spy, reporting progress at half and at the end); routes `GET mail/compose/`, `POST mail/drafts/`, `GET|PATCH|DELETE mail/drafts/<id>/`, `POST mail/drafts/discard/`, `POST mail/drafts/<id>/send/`, `POST .../confirm-sent/`, `POST .../reopen/`, `POST|DELETE mail/drafts/<id>/attachments/[<aid>/]`, `GET mail/gmail/search/`, `POST mail/gmail/search/open/`, `GET /customers/` and `GET /accounts/` (for the record picker); `q` on `mail/threads/` and `mail/messages/`; `GMAIL_OLD: MailMessageDetail` (a message only Gmail has).

- [ ] **Step 1: Write the failing test**

Create `src/features/mail/testMailWriting.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/apiClient';
import { calls } from '../agents/testAgents';
import { D2_MESSAGES, GMAIL_OLD, MAIL_DETAIL, stubMail } from './testMail';
import type { ComposePrefill, GmailSearchPage, MailDraft } from './mailDrafts';
import type { MailPage } from './mailboxSlice';

// The stub's own check: the D3 routes answer in the contract's shapes, so
// the screens' tests prove the screens, not a friendlier server.

afterEach(() => vi.unstubAllGlobals());

describe('stubMail, delivery 3', () => {
  it('prefills a reply to Ann with the signature and the quote, and stores nothing', async () => {
    const { state } = stubMail({ messages: D2_MESSAGES });
    const prefill = await apiFetch<ComposePrefill>('/mail/compose/?kind=reply&message=1');
    expect(prefill.to).toEqual([['Ann Lee', 'ann@pizzahut.com']]);
    expect(prefill.subject).toBe('Re: Renewal quote');
    expect(prefill.html).toContain('data-revenact-signature');
    expect(prefill.html).toContain('class="gmail_quote"');
    expect(prefill.record).toEqual({ kind: 'customer', id: 3, name: 'Pizza Hut' });
    expect(state.drafts).toEqual([]);
  });

  it('creates a draft that shows in Drafts, and refuses a stale revision with the newest draft', async () => {
    stubMail({ messages: D2_MESSAGES });
    const draft = await apiFetch<MailDraft>('/mail/drafts/', { method: 'POST', body: { kind: 'reply', source_message_id: 1, html: '<p>Works.</p>' } });
    expect(draft.revision).toBe(1);
    const drafts = await apiFetch<MailPage>('/mail/messages/?folder=drafts');
    expect(drafts.results.map((m) => m.draft?.id)).toEqual([draft.id]);
    const saved = await apiFetch<MailDraft>(`/mail/drafts/${draft.id}/`, { method: 'PATCH', body: { subject: 'Re: Quote', revision: 1 } });
    expect(saved.revision).toBe(2);
    await expect(apiFetch(`/mail/drafts/${draft.id}/`, { method: 'PATCH', body: { subject: 'x', revision: 1 } })).rejects.toMatchObject({ status: 409, body: { code: 'DRAFT_CHANGED', draft: { revision: 2 } } });
  });

  it('uploads through XMLHttpRequest with progress, and sends the draft into Sent', async () => {
    const { state, spy } = stubMail({ messages: D2_MESSAGES });
    const draft = await apiFetch<MailDraft>('/mail/drafts/', { method: 'POST', body: { kind: 'reply', source_message_id: 1 } });
    const progress: number[] = [];
    const { uploadDraftAttachment } = await import('./mailDrafts');
    const answer = await uploadDraftAttachment(draft.id, new File(['quote'], 'Quote v2.pdf', { type: 'application/pdf' }), (f) => progress.push(f));
    expect(answer).toMatchObject({ attachment: { filename: 'Quote v2.pdf', origin: 'upload' }, revision: 2, total_bytes: 5 });
    expect(progress).toEqual([0.4, 1]);
    expect(calls(spy, 'POST', '/attachments/')).toEqual([`/mail/drafts/${draft.id}/attachments/`]);
    const result = await apiFetch<{ draft: MailDraft; message: { folder: string } }>(`/mail/drafts/${draft.id}/send/`, { method: 'POST', body: { revision: 2 } });
    expect(result.draft.status).toBe('sent');
    expect(result.message.folder).toBe('sent');
    expect(state.messages.find((m) => m.id === draft.message_id)?.draft ?? null).toBeNull();
  });

  it('searches Gmail 20 a page with held marks, and opening stores the message', async () => {
    const { state } = stubMail({ messages: [MAIL_DETAIL], gmailOnly: [GMAIL_OLD] });
    const page = await apiFetch<GmailSearchPage>('/mail/gmail/search/?q=renewal');
    expect(page.results.map((r) => [r.subject, r.message_id])).toEqual([
      ['Renewal quote', 1],
      ['2024 renewal', null],
    ]);
    const opened = await apiFetch<{ id: number }>('/mail/gmail/search/open/', { method: 'POST', body: { gmail_id: page.results[1].gmail_id } });
    expect(state.messages.some((m) => m.id === opened.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/mail/testMailWriting.test.ts --maxWorkers=2`
Expected: FAIL with "does not provide an export named 'GMAIL_OLD'" (and, once that is added, `uploadDraftAttachment is not a function`). Both land in Step 3: the stub's upload route is only provable through the real upload call, so `apiUpload` and `uploadDraftAttachment` come in this task and their own unit tests in Task 5.

- [ ] **Step 3: Write the implementation**

Add to `src/features/mail/mailDrafts.ts` (the upload call; `apiUpload` lands in `apiClient.ts` in this task too, its tests in Task 5):

```ts
// at the top, change the apiClient import to:
import { apiFetch, apiUpload, ApiError } from '../../lib/apiClient';

// after removeDraftAttachment:
/** Multipart, form field `file` (contract §3); progress from 0 to 1. */
export function uploadDraftAttachment(id: number, file: File, onProgress: (fraction: number) => void): Promise<DraftUpload> {
  const form = new FormData();
  form.append('file', file);
  return apiUpload<DraftUpload>(`${one(id)}attachments/`, form, onProgress);
}
```

In `src/lib/apiClient.ts`, move the URL building out of `rawFetch` and add `apiUpload`:

```ts
/** The full URL for an API path: DRF's absolute `next` links go through as
 *  they are; a server-given `/api/v1/...` path is prefixed once (D2 Decision 11). */
function urlOf(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const relative = path.startsWith('/api/v1/') ? path.slice('/api/v1'.length) : path;
  return `${BASE_URL}${relative}`;
}

function rawFetch(path: string, options: RequestOptions, token: string | null) {
  const headers: Record<string, string> = options.formData ? {} : { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(urlOf(path), {
    method: options.method ?? 'GET',
    headers,
    body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    ...(options.credentials ? { credentials: options.credentials } : {}),
  });
}

/** One multipart POST over XMLHttpRequest, which (unlike fetch) reports upload progress. */
function xhrPost(path: string, form: FormData, token: string | null, onProgress?: (fraction: number) => void): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', urlOf(path));
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new TypeError('Failed to fetch'));
    xhr.send(form);
  });
}

/** A file upload with progress (two-way Gmail D3, Decision 9): the same
 *  token, refresh-once and session rules as apiFetch. */
export async function apiUpload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  const token = authHooks?.getAccessToken() ?? null;
  let started = sessionGeneration;
  let answer = await xhrPost(path, form, token, onProgress);
  stillSame(started);
  if (answer.status === 401 && authHooks) {
    const newToken = await authHooks.refreshAccessToken();
    if (newToken) stillSame(started);
    if (newToken) {
      answer = await xhrPost(path, form, newToken, onProgress);
      stillSame(started);
    }
    if (answer.status === 401) {
      authHooks.onAuthFailure();
      started = sessionGeneration;
    }
  }
  if (answer.status < 200 || answer.status >= 300) throw new ApiError(answer.status, answer.body, extractErrorMessage(answer.body) ?? `Request failed (${answer.status})`);
  return answer.body as T;
}
```

(The two comment lines inside the old `rawFetch` about DRF links and `/api/v1/` move onto `urlOf` as its doc comment, as written above.)

In `src/features/mail/testMail.ts`:

1. Imports: add `ComposePrefill, DraftAttachment, DraftContent, DraftKind, DraftRecord, GmailSearchResult, Recipient` to the `import type ... from './mailDrafts'` line (it already holds `MailDraft`).

2. After `MAIL_DRAFT_MESSAGE`, add:

```ts
/** A message only Gmail holds: older than the import (D3 contract §6). */
export const GMAIL_OLD: MailMessageDetail = {
  ...MAIL_DETAIL,
  id: 501,
  thread_id: 'g-old',
  subject: '2024 renewal',
  snippet: "Attached is last year's quote.",
  sent_at: '2024-09-30T15:12:00Z',
  is_read: true,
  labels: [],
  body: "Attached is last year's quote.",
  html_body: '',
  attachments: [],
};

/** Names the record picker's stub offers, by `kind:id`. */
const RECORD_NAMES: Record<string, string> = { 'customer:2': 'Dough Co', 'customer:3': 'Pizza Hut' };
const STUB_NOW = '2026-10-11T09:05:00Z';
const SIGNATURE_HTML = 'Dana Ruiz<br>Dough Co';
```

3. In `MailStubState`, add:

```ts
  /** Mailbox drafts (D3 contract §1); each has a row in `messages`. */
  drafts: MailDraft[];
  /** What only Gmail has: search finds it, open stores it. */
  gmailOnly: MailMessageDetail[];
  /** The next send answers this instead (504 SEND_UNCONFIRMED, 409 DRAFT_GONE, ...). */
  sendAnswer: { status: number; body: unknown } | null;
  /** Every draft save reaches Revenact but fails in Gmail (gmail.state failed). */
  draftSaveFails: boolean;
```

and in `stubMail`'s initial `state`: `drafts: [], gmailOnly: [], sendAnswer: null, draftSaveFails: false,` (before `...copy(initial)`).

4. Inside `stubMail`, after `writesGmail`, add the D3 helpers:

```ts
  let nextId = 900;
  const me = () => ({ name: state.connection?.display_name ?? '', address: state.connection?.address ?? '' });
  // Contract §3 checks 1 to 4, in order; 4 (paused) for a send only.
  const draftRefusal = (send: boolean) => {
    const c = state.connection;
    if (c && c.provider !== 'google') return json(400, { code: 'GMAIL_ONLY', detail: 'Only Gmail mailboxes have this.' });
    if (!c) return json(409, { code: 'NO_MAILBOX', detail: NO_MAILBOX_TEXT });
    if (!c.two_way) return json(409, { code: 'TWO_WAY_OFF', detail: TWO_WAY_OFF_TEXT, needs_reconnect: true });
    return send ? paused() : null;
  };
  const recordOf = (m: MailMessageDetail | null | undefined): DraftRecord | null => (m?.account ? { kind: m.account.type, id: m.account.id, name: m.account.name } : null);
  const fileOf = (a: MailMessageDetail['attachments'][number]): DraftAttachment => ({ id: a.id, filename: a.filename, mime_type: a.mime_type, size: a.size, origin: 'forward', download_url: a.download_url ?? '' });
  const textOf = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').trim();

  const prefillOf = (kind: DraftKind, source: MailMessageDetail | null): ComposePrefill => {
    const mine = me().address;
    const others = (list: Recipient[]) => list.filter(([, address]) => address !== mine);
    const back: Recipient[] = !source ? [] : source.direction === 'sent' ? source.to : [[source.from_name, source.from_address]];
    const to = kind === 'reply' ? back : kind === 'reply_all' && source ? others([...back, ...source.to]) : [];
    const cc = kind === 'reply_all' && source ? others(source.cc) : [];
    const subject = !source ? '' : kind === 'forward' ? `Fwd: ${source.subject}` : /^re:/i.test(source.subject) ? source.subject : `Re: ${source.subject}`;
    const below = !source
      ? ''
      : kind === 'forward'
        ? `<div class="gmail_quote">---------- Forwarded message ---------<br>From: ${source.from_name} &lt;${source.from_address}&gt;<br>${source.html_body || source.body}</div>`
        : `<div class="gmail_quote">On ${source.sent_at.slice(0, 10)}, ${source.from_name} &lt;${source.from_address}&gt; wrote:<blockquote>${source.body}</blockquote></div>`;
    return {
      kind,
      source_message_id: source?.id ?? null,
      from: me(),
      to,
      cc,
      bcc: [],
      subject,
      html: `<p></p>${SIGNATURE}${below}`,
      signature_html: SIGNATURE_HTML,
      forwarded: kind === 'forward' && source ? source.attachments.filter((a) => !a.is_inline).map(fileOf) : [],
      record: recordOf(source),
      suggested_record: recordOf(source),
    };
  };

  // The draft's row in Drafts (contract decision 2), rewritten on every change.
  const rowOfDraft = (d: MailDraft): MailMessageDetail => ({
    ...copy(MAIL_EARLIER),
    id: d.message_id as number,
    thread_id: d.thread_id,
    from_name: d.from.name,
    from_address: d.from.address,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    subject: d.subject,
    snippet: d.text.slice(0, 100),
    sent_at: d.updated_at,
    folder: 'drafts',
    account: null,
    has_attachments: d.attachments.length > 0,
    body: d.text,
    html_body: d.html,
    draft: { id: d.id, agent: d.agent, reply_draft_id: d.reply_draft_id },
  });
  const syncRow = (d: MailDraft) => {
    const at = state.messages.findIndex((m) => m.id === d.message_id);
    if (at >= 0) state.messages[at] = rowOfDraft(d);
    else state.messages.push(rowOfDraft(d));
  };
  const totalOf = (d: MailDraft) => d.attachments.reduce((sum, a) => sum + a.size, 0);
  // Applies content; true when anything changed (the revision moves only then).
  const applyContent = (d: MailDraft, body: DraftContent): boolean => {
    const before = JSON.stringify([d.to, d.cc, d.bcc, d.subject, d.html, d.attachments, d.record]);
    if (body.to) d.to = body.to;
    if (body.cc) d.cc = body.cc;
    if (body.bcc) d.bcc = body.bcc;
    if (body.subject !== undefined) d.subject = body.subject;
    if (body.html !== undefined) {
      d.html = body.html;
      d.text = textOf(body.html);
    }
    if (body.forwarded) d.attachments = d.attachments.filter((a) => a.origin !== 'forward' || body.forwarded!.includes(a.id));
    if (body.record !== undefined) {
      d.record = body.record ? { ...body.record, name: RECORD_NAMES[`${body.record.kind}:${body.record.id}`] ?? `Record ${body.record.id}` } : null;
      d.record_chosen = true;
    }
    d.total_bytes = totalOf(d);
    return JSON.stringify([d.to, d.cc, d.bcc, d.subject, d.html, d.attachments, d.record]) !== before;
  };
  const changedAnswer = (d: MailDraft) => json(409, { code: 'DRAFT_CHANGED', detail: 'This draft changed in Gmail. Here is the newest version.', draft: d });
  const touched = (d: MailDraft) => {
    d.revision += 1;
    d.updated_at = STUB_NOW;
    d.gmail = { state: state.draftSaveFails ? 'failed' : 'saved' };
    d.sync_issue = state.draftSaveFails ? { text: "Couldn't save this draft to Gmail.", at: STUB_NOW } : null;
    syncRow(d);
  };
  const openDraft = (id: number) => state.drafts.find((d) => d.id === id);
  const formFile = (init?: RequestInit) => (init?.body instanceof FormData ? init.body.get('file') : null);
```

5. Make `inView` honour `q` (D1 contract: subject, sender name, sender address, snippet): at its top add

```ts
    const q = (params.get('q') ?? '').toLowerCase();
    if (q && ![m.subject, m.from_name, m.from_address, m.snippet].some((field) => field.toLowerCase().includes(q))) return false;
```

and in the `/mail/messages/` route, filter by `q` too:

```ts
    if (path === '/mail/messages/') {
      const folder = url.searchParams.get('folder');
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const results = (folder ? state.messages.filter((m) => m.folder === folder) : state.messages)
        .filter((m) => !q || [m.subject, m.from_name, m.from_address, m.snippet].some((field) => field.toLowerCase().includes(q)))
        .map(rowOf);
      return json(200, { count: results.length, next: null, previous: null, results });
    }
```

6. In the `spy`, before the `const download = ...` route, add the D3 routes:

```ts
    if (path === '/mail/compose/' && method === 'GET') {
      const kind = (url.searchParams.get('kind') ?? '') as DraftKind;
      if (!['new', 'reply', 'reply_all', 'forward'].includes(kind)) return json(400, { kind: ['Choose new, reply, reply_all or forward.'] });
      const sourceId = url.searchParams.get('message');
      const source = sourceId ? state.messages.find((m) => m.id === Number(sourceId)) : null;
      if (kind !== 'new' && !sourceId) return json(400, { message: ['Choose a message to answer.'] });
      if (kind !== 'new' && !source) return json(404, { detail: 'Not found.' });
      if (source?.draft) return json(409, { code: 'IS_DRAFT', detail: 'This message is a draft.' });
      return draftRefusal(false) ?? json(200, prefillOf(kind, source ?? null));
    }
    if (path === '/mail/drafts/' && method === 'POST') {
      const refused = draftRefusal(false);
      if (refused) return refused;
      const body = JSON.parse(String(init?.body ?? '{}')) as DraftContent & { kind: DraftKind; source_message_id?: number };
      const source = body.source_message_id ? state.messages.find((m) => m.id === body.source_message_id) : null;
      if (body.kind !== 'new' && !source) return json(400, { source_message_id: ['Choose a message to answer.'] });
      const prefill = prefillOf(body.kind, source ?? null);
      const id = nextId++;
      const d: MailDraft = {
        ...copy(MAIL_DRAFT),
        id,
        kind: body.kind,
        revision: 1,
        message_id: nextId++,
        thread_id: source?.thread_id ?? `t-new-${id}`,
        source: source ? { message_id: source.id, subject: source.subject, from: { name: source.from_name, address: source.from_address }, sent_at: source.sent_at } : null,
        from: prefill.from,
        to: prefill.to,
        cc: prefill.cc,
        bcc: [],
        subject: prefill.subject,
        html: prefill.html,
        text: textOf(prefill.html),
        attachments: copy(prefill.forwarded),
        record: prefill.record,
        suggested_record: prefill.suggested_record,
        record_chosen: false,
        gmail: { state: state.draftSaveFails ? 'failed' : 'saved' },
        sync_issue: state.draftSaveFails ? { text: "Couldn't save this draft to Gmail.", at: STUB_NOW } : null,
        created_at: STUB_NOW,
        updated_at: STUB_NOW,
      };
      applyContent(d, body);
      state.drafts.push(d);
      syncRow(d);
      return json(201, d);
    }
    if (path === '/mail/drafts/discard/' && method === 'POST') {
      const { ids } = JSON.parse(String(init?.body ?? '{}')) as { ids: number[] };
      if (ids.some((id) => !openDraft(id) || openDraft(id)!.status !== 'open')) return json(404, { detail: 'Not found.' });
      const gone = state.drafts.filter((d) => ids.includes(d.id));
      state.drafts = state.drafts.filter((d) => !ids.includes(d.id));
      state.messages = state.messages.filter((m) => !gone.some((d) => d.message_id === m.id));
      return json(200, { discarded: gone.length });
    }
    const draftPath = /^\/mail\/drafts\/(\d+)\/(?:(send|confirm-sent|reopen)\/|attachments\/(?:(\d+)\/)?)?$/.exec(path);
    if (draftPath) {
      const d = openDraft(Number(draftPath[1]));
      if (!d) return json(404, { detail: 'Not found.' });
      const [, , verb, attachmentId] = draftPath;
      const isAttachments = path.includes('/attachments/');
      if (!verb && !isAttachments && method === 'GET') return json(200, d);
      if (!verb && !isAttachments && method === 'DELETE') {
        if (d.status !== 'open') return json(409, { code: 'ALREADY_SENT', detail: 'This draft has been sent.' });
        state.drafts = state.drafts.filter((x) => x !== d);
        state.messages = state.messages.filter((m) => m.id !== d.message_id);
        return Promise.resolve({ ok: true, status: 204, json: async () => null });
      }
      if (!verb && !isAttachments && method === 'PATCH') {
        if (d.status !== 'open') return json(409, { code: 'ALREADY_SENT', detail: 'This draft has been sent.' });
        const failed = refuse(false);
        if (failed) return failed;
        const refused = draftRefusal(false);
        if (refused) return refused;
        const body = JSON.parse(String(init?.body ?? '{}')) as DraftContent & { revision?: number };
        if (body.revision === undefined) return json(400, { revision: ['Send the revision you edited.'] });
        if (body.revision !== d.revision) return changedAnswer(d);
        if (applyContent(d, body)) touched(d);
        return json(200, d);
      }
      if (isAttachments && method === 'POST') {
        const file = formFile(init);
        if (!(file instanceof File)) return json(400, { file: ['Choose a file.'] });
        const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
        if (['.zip', '.exe', ''].includes(ext)) return json(400, { file: [`${ext || 'that type'} is not an accepted file type.`] });
        if (d.total_bytes + file.size > d.max_bytes) return json(413, { code: 'DRAFT_TOO_LARGE', detail: 'Attachments are limited to 25 MB in total.' });
        const attachment: DraftAttachment = { id: nextId++, filename: file.name, mime_type: file.type || 'application/octet-stream', size: file.size, origin: 'upload', download_url: '' };
        attachment.download_url = `/api/v1/mail/attachments/${attachment.id}/download/`;
        d.attachments = [...d.attachments, attachment];
        d.total_bytes = totalOf(d);
        touched(d);
        return json(201, { attachment, revision: d.revision, total_bytes: d.total_bytes });
      }
      if (isAttachments && method === 'DELETE' && attachmentId) {
        if (!d.attachments.some((a) => a.id === Number(attachmentId))) return json(404, { detail: 'Not found.' });
        d.attachments = d.attachments.filter((a) => a.id !== Number(attachmentId));
        d.total_bytes = totalOf(d);
        touched(d);
        return json(200, { revision: d.revision, total_bytes: d.total_bytes });
      }
      if (verb === 'send' && method === 'POST') {
        if (d.status !== 'open') return json(409, { code: 'ALREADY_SENT', detail: 'This draft has been sent.' });
        const body = JSON.parse(String(init?.body ?? '{}')) as DraftContent & { revision?: number };
        if (body.revision !== undefined && body.revision !== d.revision) return changedAnswer(d);
        if (applyContent(d, body)) touched(d);
        if (d.to.length + d.cc.length + d.bcc.length === 0) return json(400, { to: ['Add someone to send it to.'] });
        const refused = draftRefusal(true);
        if (refused) return refused;
        if (d.total_bytes > d.max_bytes) return json(413, { code: 'MESSAGE_TOO_LARGE', detail: "This message is over Gmail's 25 MB limit. Remove an attachment." });
        if (state.sendAnswer) {
          const answer = state.sendAnswer;
          state.sendAnswer = null;
          if (answer.status === 504) Object.assign(d, { status: 'sent', sending: 'unconfirmed', can_resolve: true });
          if ((answer.body as { code?: string } | null)?.code === 'DRAFT_GONE') d.gmail = { state: 'local' };
          return json(answer.status, answer.body);
        }
        Object.assign(d, { status: 'sent', sending: null, sent_at: STUB_NOW });
        const row = state.messages.find((m) => m.id === d.message_id);
        const message: MailMessageDetail = { ...(row ?? rowOfDraft(d)), folder: 'sent', direction: 'sent', sent_at: STUB_NOW, draft: null };
        state.messages = [...state.messages.filter((m) => m.id !== d.message_id), message];
        const email = d.record ? { id: nextId++, subject: d.subject, sent_at: STUB_NOW, thread_id: d.thread_id } : null;
        return json(200, { draft: d, message, email });
      }
      if (verb === 'confirm-sent' && method === 'POST') {
        if (d.sending !== 'unconfirmed') return json(409, { code: 'NOT_UNCONFIRMED', detail: "This draft isn't waiting for confirmation." });
        Object.assign(d, { status: 'sent', sending: null, sent_at: STUB_NOW, can_resolve: false });
        state.messages = state.messages.filter((m) => m.id !== d.message_id);
        return json(200, d);
      }
      if (verb === 'reopen' && method === 'POST') {
        if (d.sending !== 'unconfirmed') return json(409, { code: 'NOT_UNCONFIRMED', detail: "This draft isn't waiting for confirmation." });
        Object.assign(d, { status: 'open', sending: null, can_resolve: false });
        return json(200, d);
      }
    }
    if (path === '/mail/gmail/search/' && method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
      if (!q) return json(400, { q: ['Type something to search for.'] });
      if (state.connection && state.connection.provider !== 'google') return json(400, { code: 'GMAIL_ONLY', detail: 'Only Gmail mailboxes have this.' });
      const refused = paused();
      if (refused) return refused;
      const hits = (m: MailMessageDetail) => [m.subject, m.from_name, m.from_address, m.snippet].some((f) => f.toLowerCase().includes(q));
      const all: GmailSearchResult[] = [
        ...state.messages.filter((m) => !m.draft && hits(m)).map((m) => ({ m, held: true })),
        ...state.gmailOnly.filter(hits).map((m) => ({ m, held: false })),
      ]
        .sort((a, b) => b.m.sent_at.localeCompare(a.m.sent_at))
        .map(({ m, held }) => ({ gmail_id: `g${m.id}`, thread_id: m.thread_id, subject: m.subject, from: { name: m.from_name, address: m.from_address }, to: m.to, snippet: m.snippet, sent_at: m.sent_at, has_attachments: m.has_attachments, message_id: held ? m.id : null }));
      const start = Number(url.searchParams.get('page_token') ?? '0');
      const results = all.slice(start, start + 20);
      return json(200, { results, next_page_token: start + 20 < all.length ? String(start + 20) : null, result_size_estimate: all.length });
    }
    if (path === '/mail/gmail/search/open/' && method === 'POST') {
      const { gmail_id } = JSON.parse(String(init?.body ?? '{}')) as { gmail_id: string };
      const id = Number(gmail_id.slice(1));
      const held = state.messages.find((m) => m.id === id);
      if (held) return json(200, held);
      const only = state.gmailOnly.find((m) => m.id === id);
      if (!only) return json(404, { code: 'NOT_IN_GMAIL', detail: 'This message is no longer in Gmail.' });
      state.gmailOnly = state.gmailOnly.filter((m) => m !== only);
      state.messages.push(only);
      return json(201, only);
    }
    if (path === '/customers/' && method === 'GET') {
      return json(200, { count: 2, next: null, previous: null, results: [{ id: 2, name: 'Dough Co' }, { id: 3, name: 'Pizza Hut' }] });
    }
    if (path === '/accounts/' && method === 'GET') return json(200, { count: 0, next: null, previous: null, results: [] });
```

7. Just before `vi.stubGlobal('fetch', spy);` add the fake XHR, routed through the same spy:

```ts
  // Uploads go over XMLHttpRequest (apiUpload, Decision 9): the same routes,
  // with progress reported at 40% and at the end.
  class FakeXhr {
    status = 0;
    responseText = '';
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private method = 'GET';
    private url = '';
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader() {}
    send(body: FormData) {
      const file = body.get('file');
      const total = file instanceof Blob ? file.size : 0;
      void Promise.resolve().then(async () => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: Math.round(total * 0.4), total } as ProgressEvent);
        const answer = (await spy(this.url, { method: this.method, body })) as { status: number; json: () => Promise<unknown> };
        this.upload.onprogress?.({ lengthComputable: true, loaded: total, total } as ProgressEvent);
        this.status = answer.status;
        this.responseText = JSON.stringify(await answer.json());
        this.onload?.();
      });
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
```

(The spy's `init` type is `RequestInit`; a `FormData` body is a valid `BodyInit`, so `formFile` reads it without a cast.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/mail src/pages/communications src/e2e/gmail.test.tsx src/e2e/gmailActions.test.tsx src/lib/apiClient.test.ts --maxWorkers=2`
Expected: PASS (the stub's new self-test, and every D1/D2 suite that uses the stub unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/testMail.ts src/features/mail/testMailWriting.test.ts src/features/mail/mailDrafts.ts src/lib/apiClient.ts
git commit -m "$(cat <<'EOF'
test(mail): stub the delivery 3 routes and uploads over xhr

The compose prefill, drafts, send, discard, attachments and the Gmail
search, in the contract's shapes; uploads go through a fake
XMLHttpRequest on the same routes, with progress. apiUpload lands with
it since the stub's upload check needs the real call.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The formatting editor and the address chips

**Files:**
- Create: `src/features/mail/mailEditor.ts`
- Create: `src/pages/communications/MailEditor.tsx`
- Create: `src/pages/communications/RecipientField.tsx`
- Test: `src/features/mail/mailEditor.test.ts`, `src/pages/communications/MailEditor.test.tsx`, `src/pages/communications/RecipientField.test.tsx`

**Interfaces:**
- Consumes: `parseRecipients`, `addRecipients`, `recipientName`, `Recipient` (Task 1); the editor and recipient words (Task 1).
- Produces (`mailEditor.ts`): `type EditCommand = 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'createLink' | 'insertText' | 'insertHTML'`; `runCommand(command: EditCommand, value?: string): boolean`; `cleanEditable(html: string): string`; `safeHref(raw: string): string | null`; `escapeHtml(text: string): string`.
- Produces: `MailEditor({ label, html, onChange, editorRef? }: { label: string; html: string; onChange: (html: string) => void; editorRef?: RefObject<HTMLDivElement | null> })` (uncontrolled: `html` seeds it on mount; re-key to replace); `RecipientField({ label, value, onChange, error?, inputRef? }: { label: string; value: Recipient[]; onChange: (next: Recipient[]) => void; error?: string | null; inputRef?: RefObject<HTMLInputElement | null> })`.

- [ ] **Step 1: Write the failing tests**

Create `src/features/mail/mailEditor.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanEditable, escapeHtml, runCommand, safeHref } from './mailEditor';

// Unit tier: what the editor may hand the server (contract §11) and the one
// call into the browser's editing commands (Decision 1).

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
});

describe('cleanEditable', () => {
  it('keeps the editor tags, the signature marker and safe links only', () => {
    const html =
      '<p style="color:red">Hi <span class="x"><strong>Ann</strong></span></p><ul><li>One</li></ul><a href="https://doughco.com" onclick="x()">site</a><a href="javascript:alert(1)">bad</a><div data-revenact-signature class="sig">Dana</div><img src="data:image/png;base64,AA"><script>alert(1)</script>';
    expect(cleanEditable(html)).toBe('<p>Hi <strong>Ann</strong></p><ul><li>One</li></ul><a href="https://doughco.com">site</a><a>bad</a><div data-revenact-signature="">Dana</div>');
  });

  it('turns unknown elements into their text and drops comments', () => {
    expect(cleanEditable('<h1>Title</h1><!-- note --><font>plain</font>')).toBe('Titleplain');
  });
});

describe('safeHref', () => {
  it('allows web and email addresses, adding https:// when there is no scheme', () => {
    expect(safeHref('doughco.com/pricing')).toBe('https://doughco.com/pricing');
    expect(safeHref(' https://doughco.com ')).toBe('https://doughco.com/');
    expect(safeHref('mailto:ann@pizzahut.com')).toBe('mailto:ann@pizzahut.com');
  });

  it('refuses anything else', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('localhost')).toBeNull();
    expect(safeHref('')).toBeNull();
  });
});

describe('runCommand and escapeHtml', () => {
  it('calls the browser command, and reports false where there is none', () => {
    expect(runCommand('bold')).toBe(false);
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    expect(runCommand('createLink', 'https://doughco.com/')).toBe(true);
    expect(exec).toHaveBeenCalledWith('createLink', false, 'https://doughco.com/');
  });

  it('escapes text for a link written into the editor', () => {
    expect(escapeHtml('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });
});
```

Create `src/pages/communications/MailEditor.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MailEditor } from './MailEditor';
import { SIGNATURE } from '../../features/mail/testMail';

// Unit tier: the formatting editor (Decision 1). jsdom has no
// execCommand, so each test gives the document a spy.

let exec: ReturnType<typeof vi.fn>;
beforeEach(() => {
  exec = vi.fn(() => true);
  Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
});

function renderEditor(html = `<p></p>${SIGNATURE}`) {
  const onChange = vi.fn();
  render(<MailEditor label="Message" html={html} onChange={onChange} />);
  return { editor: screen.getByRole('textbox', { name: 'Message' }), onChange };
}

describe('MailEditor', () => {
  it('starts with the server html, signature included, and hands back cleaned html on input', () => {
    const { editor, onChange } = renderEditor();
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(editor.innerHTML).toContain('data-revenact-signature');
    editor.innerHTML = '<p>Works <span style="color:red">for us</span>.</p>';
    fireEvent.input(editor);
    expect(onChange).toHaveBeenLastCalledWith('<p>Works for us.</p>');
  });

  it('offers bold, italic, both lists and a link, each named', async () => {
    renderEditor();
    const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
    for (const name of ['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Link']) expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Bold' }));
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Numbered list' }));
    expect(exec.mock.calls.map((call) => call[0])).toEqual(['bold', 'insertOrderedList']);
  });

  it('pastes text only', () => {
    const { editor, onChange } = renderEditor();
    fireEvent.paste(editor, { clipboardData: { getData: (type: string) => (type === 'text/plain' ? 'Plain words' : '<img src="x">') } });
    expect(exec).toHaveBeenCalledWith('insertText', false, 'Plain words');
    expect(onChange).toHaveBeenCalled();
  });

  it('refuses a link that is not a web or email address, and writes one that is', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    const field = screen.getByLabelText('Link address');
    await userEvent.type(field, 'javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Use a web or email address.');
    await userEvent.clear(field);
    await userEvent.type(field, 'doughco.com{Enter}');
    // Nothing was selected, so the address itself is written as the link.
    expect(exec).toHaveBeenCalledWith('insertHTML', false, '<a href="https://doughco.com/">https://doughco.com/</a>');
    expect(screen.queryByLabelText('Link address')).not.toBeInTheDocument();
  });
});
```

Create `src/pages/communications/RecipientField.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { RecipientField } from './RecipientField';
import type { Recipient } from '../../features/mail/mailDrafts';

// Unit tier: To, Cc and Bcc as chips.

function Harness({ initial = [] as Recipient[], spy = vi.fn() }) {
  const [value, setValue] = useState<Recipient[]>(initial);
  return (
    <RecipientField
      label="To"
      value={value}
      onChange={(next) => {
        spy(next);
        setValue(next);
      }}
    />
  );
}

describe('RecipientField', () => {
  it('makes a chip from an address typed before a comma or Enter, never twice', async () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    const field = screen.getByLabelText('To');
    await userEvent.type(field, 'ann@pizzahut.com,');
    await userEvent.type(field, 'Sam <SAM@pizzahut.com>{Enter}');
    await userEvent.type(field, 'ann@pizzahut.com{Enter}');
    expect(spy).toHaveBeenLastCalledWith([
      ['', 'ann@pizzahut.com'],
      ['Sam', 'sam@pizzahut.com'],
    ]);
    expect(screen.getByRole('list', { name: 'To addresses' })).toHaveTextContent('ann@pizzahut.comSam');
    expect(field).toHaveValue('');
  });

  it('keeps what is not an address in the field and says which', async () => {
    render(<Harness />);
    const field = screen.getByLabelText('To');
    await userEvent.type(field, 'ann at pizzahut{Enter}');
    expect(field).toHaveValue('ann at pizzahut');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Check this address: ann at pizzahut')).toBeInTheDocument();
  });

  it('takes a pasted list, and commits what is left on blur', async () => {
    render(<Harness />);
    const field = screen.getByLabelText('To');
    fireEvent.paste(field, { clipboardData: { getData: () => 'a@x.com; b@x.com' } });
    await userEvent.type(field, 'c@x.com');
    fireEvent.blur(field);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('removes a chip by its button, and Backspace in an empty field takes the last one back', async () => {
    render(<Harness initial={[['Ann Lee', 'ann@pizzahut.com'], ['', 'sam@pizzahut.com']]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove ann@pizzahut.com' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    const field = screen.getByLabelText('To');
    await userEvent.click(field);
    await userEvent.keyboard('{Backspace}');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(field).toHaveValue('sam@pizzahut.com');
  });

  it('shows the server field error under the field', () => {
    render(<RecipientField label="To" value={[]} onChange={vi.fn()} error="Add someone to send it to." />);
    expect(screen.getByLabelText('To')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Add someone to send it to.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/mail/mailEditor.test.ts src/pages/communications/MailEditor.test.tsx src/pages/communications/RecipientField.test.tsx --maxWorkers=2`
Expected: FAIL with "Failed to resolve import" for each new module.

- [ ] **Step 3: Write the implementation**

Create `src/features/mail/mailEditor.ts`:

```ts
// The compose editor's plumbing (two-way Gmail D3, Decision 1): the
// browser's editing commands, called from one place, and what the editor
// may hand the server (contract §11: p, br, strong/b, em/i, ul, ol, li,
// a[href], blockquote; plus the signature block the server placed). The
// server sanitises again (nh3); this keeps the editor honest. No React here.

export type EditCommand = 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'createLink' | 'insertText' | 'insertHTML';

/** One editing command on the current selection. `document.execCommand` is
 *  deprecated but unremoved, and the only way to edit rich text without a
 *  library; this is the one caller, so replacing it touches one function. */
export function runCommand(command: EditCommand, value?: string): boolean {
  const exec = (document as Partial<Pick<Document, 'execCommand'>>).execCommand;
  return typeof exec === 'function' ? exec.call(document, command, false, value) : false;
}

const KEEP = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'DIV']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IMG', 'PICTURE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'VIDEO', 'AUDIO', 'TEMPLATE', 'TITLE', 'META', 'LINK']);

/** A web (http, https) or email (mailto) address, with https:// added when
 *  no scheme was typed; null for anything else. */
export function safeHref(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text)) return text;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clean(parent: ParentNode) {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as Element;
    if (DROP.has(element.tagName)) {
      element.remove();
      continue;
    }
    clean(element);
    if (!KEEP.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attr of [...element.attributes]) {
      const keep = (element.tagName === 'A' && attr.name === 'href' && safeHref(attr.value) !== null) || (element.tagName === 'DIV' && attr.name === 'data-revenact-signature');
      if (!keep) element.removeAttribute(attr.name);
    }
  }
}

/** The editor's HTML reduced to the tags it makes: unknown elements give up
 *  their children, media and scripts go, and only a safe `href` and the
 *  signature marker survive as attributes. */
export function cleanEditable(html: string): string {
  const box = document.createElement('template');
  box.innerHTML = html;
  clean(box.content);
  const out = document.createElement('div');
  out.append(box.content.cloneNode(true));
  return out.innerHTML;
}
```

Create `src/pages/communications/MailEditor.tsx`:

```tsx
// The compose editor (two-way Gmail D3, Decision 1): one editable region
// with a toolbar for bold, italic, the two lists and a link. It is
// uncontrolled: `html` seeds it once, and the composer re-keys it when the
// draft is replaced (Use the Gmail version). Every input hands back the
// cleaned HTML. A paste keeps the text only, and dropped files are refused,
// so no pasted image or style gets in. Ctrl or Cmd with B or I is the
// browser's own.

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Bold, Italic, Link2, List, ListOrdered, type LucideIcon } from 'lucide-react';
import { cleanEditable, escapeHtml, runCommand, safeHref, type EditCommand } from '../../features/mail/mailEditor';
import { ADD_LINK, BAD_LINK, BOLD, BULLETS, FORMATTING, ITALIC, LINK, LINK_ADDRESS, NUMBERS } from '../../features/mail/mailText';
import { BUTTON, FOCUS, ICON_BUTTON, INPUT, INVALID, TYPE } from '../../components/ui';

const TOOLS: { command: EditCommand; label: string; icon: LucideIcon; keys?: string }[] = [
  { command: 'bold', label: BOLD, icon: Bold, keys: 'Control+B' },
  { command: 'italic', label: ITALIC, icon: Italic, keys: 'Control+I' },
  { command: 'insertUnorderedList', label: BULLETS, icon: List },
  { command: 'insertOrderedList', label: NUMBERS, icon: ListOrdered },
];

const EDITABLE = `min-h-48 px-3 py-2 outline-none ${TYPE.body} [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_[data-revenact-signature]]:text-ink-muted ${FOCUS}`;

export function MailEditor({ label, html, onChange, editorRef }: { label: string; html: string; onChange: (html: string) => void; editorRef?: RefObject<HTMLDivElement | null> }) {
  const labelId = useId();
  const own = useRef<HTMLDivElement>(null);
  const ref = editorRef ?? own;
  const saved = useRef<Range | null>(null);
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);

  // Seeded once per mount; the composer re-keys the editor to replace it.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeds on mount only
  }, []);

  function changed() {
    if (ref.current) onChange(cleanEditable(ref.current.innerHTML));
  }

  function apply(command: EditCommand, value?: string) {
    ref.current?.focus();
    runCommand(command, value);
    changed();
  }

  function startLink() {
    const selection = window.getSelection();
    const inside = selection && selection.rangeCount > 0 && ref.current?.contains(selection.anchorNode);
    saved.current = inside ? selection.getRangeAt(0).cloneRange() : null;
    setHref('');
    setLinkError(null);
    setLinking(true);
  }

  function addLink() {
    const target = safeHref(href);
    if (!target) {
      setLinkError(BAD_LINK);
      return;
    }
    ref.current?.focus();
    const selection = window.getSelection();
    if (saved.current && selection) {
      selection.removeAllRanges();
      selection.addRange(saved.current);
    }
    // With nothing selected, the address itself is written as the link.
    if (saved.current && !saved.current.collapsed) runCommand('createLink', target);
    else runCommand('insertHTML', `<a href="${escapeHtml(target)}">${escapeHtml(target)}</a>`);
    setLinking(false);
    changed();
  }

  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface focus-within:border-line-strong">
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <div role="toolbar" aria-label={FORMATTING} className="flex flex-wrap items-center gap-1 border-b border-line-subtle p-1">
        {TOOLS.map(({ command, label: name, icon: Icon, keys }) => (
          <button key={command} type="button" aria-label={name} title={name} aria-keyshortcuts={keys} onMouseDown={(event) => event.preventDefault()} onClick={() => apply(command)} className={ICON_BUTTON}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
        <button type="button" aria-label={LINK} title={LINK} aria-expanded={linking} onMouseDown={(event) => event.preventDefault()} onClick={startLink} className={ICON_BUTTON}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {linking ? (
        <div className="flex flex-wrap items-end gap-2 border-b border-line-subtle px-3 py-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={TYPE.label}>{LINK_ADDRESS}</span>
            <input
              type="url"
              value={href}
              autoFocus
              onChange={(event) => {
                setHref(event.target.value);
                setLinkError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addLink();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setLinking(false);
                  ref.current?.focus();
                }
              }}
              aria-invalid={linkError ? true : undefined}
              className={`${INPUT} ${INVALID}`}
            />
          </label>
          <button type="button" onClick={addLink} className={BUTTON}>
            {ADD_LINK}
          </button>
          {linkError ? (
            <p role="alert" className="w-full text-[11px] leading-4 text-danger-ink">
              {linkError}
            </p>
          ) : null}
        </div>
      ) : null}
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        contentEditable
        suppressContentEditableWarning
        onInput={changed}
        onPaste={(event) => {
          event.preventDefault();
          runCommand('insertText', event.clipboardData.getData('text/plain'));
          changed();
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length > 0) event.preventDefault();
        }}
        className={EDITABLE}
      />
    </div>
  );
}
```

(In jsdom `contentEditable` renders as the attribute `contenteditable="true"`, which the test reads.)

Create `src/pages/communications/RecipientField.tsx`:

```tsx
// To, Cc or Bcc as address chips (two-way Gmail D3): type or paste
// addresses, split by commas, semicolons or Enter; each valid one becomes a
// chip with its own Remove button, anything that is not an address stays in
// the field with a line saying which, and leaving the field commits what is
// in it. Backspace in an empty field takes the last chip back to edit.

import { useId, useState, type RefObject } from 'react';
import { X } from 'lucide-react';
import { addRecipients, parseRecipients, recipientName, type Recipient } from '../../features/mail/mailDrafts';
import { badAddress, chipsLabel, removeRecipient } from '../../features/mail/mailText';
import { FOCUS, TYPE } from '../../components/ui';

export function RecipientField({
  label,
  value,
  onChange,
  error = null,
  inputRef,
}: {
  label: string;
  value: Recipient[];
  onChange: (next: Recipient[]) => void;
  /** The server's field error (contract §3), shown under the field. */
  error?: string | null;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [bad, setBad] = useState<string | null>(null);
  const shown = bad ?? error;

  function commit(raw: string) {
    const { valid, invalid } = parseRecipients(raw);
    if (valid.length > 0) onChange(addRecipients(value, valid));
    setText(invalid.join(', '));
    setBad(invalid.length > 0 ? badAddress(invalid[0]) : null);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={TYPE.label}>
        {label}
      </label>
      <div className={`flex min-h-11 flex-wrap items-center gap-1 rounded-lg border px-2 py-1 focus-within:border-line-strong sm:min-h-9 ${shown ? 'border-danger' : 'border-line'}`}>
        {value.length > 0 ? (
          <ul aria-label={chipsLabel(label)} className="contents">
            {value.map((recipient) => (
              <li key={recipient[1]} title={recipient[1]} className="inline-flex min-h-8 max-w-full min-w-0 items-center gap-1 rounded-full bg-subtle pl-3 pr-1 text-[13px] leading-5 text-ink">
                <span className="truncate">{recipientName(recipient)}</span>
                <button
                  type="button"
                  aria-label={removeRecipient(recipient[1])}
                  onClick={() => onChange(value.filter((other) => other[1] !== recipient[1]))}
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-muted hover:bg-line-subtle hover:text-ink sm:min-h-6 sm:min-w-6 ${FOCUS}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="email"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setBad(null);
            const next = event.target.value;
            if (/[,;]\s*$/.test(next)) commit(next);
            else setText(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && text.trim()) {
              event.preventDefault();
              commit(text);
            } else if (event.key === 'Backspace' && text === '' && value.length > 0) {
              event.preventDefault();
              const last = value[value.length - 1];
              onChange(value.slice(0, -1));
              setText(last[1]);
            }
          }}
          onBlur={() => {
            if (text.trim()) commit(text);
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text/plain');
            if (!/[,;\n]/.test(pasted)) return;
            event.preventDefault();
            commit(`${text}${pasted}`);
          }}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? `${id}-error` : undefined}
          className="min-h-9 min-w-32 flex-1 bg-transparent px-1 text-[13px] leading-5 text-ink outline-none"
        />
      </div>
      {shown ? (
        <p id={`${id}-error`} className="text-[11px] leading-4 text-danger-ink">
          {shown}
        </p>
      ) : null}
    </div>
  );
}
```

Note for the test "never twice": the chip list is named "To addresses" (`chipsLabel`), so `getByLabelText('To')` finds only the input; `addRecipients` lower-cases `SAM@pizzahut.com`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/mail/mailEditor.test.ts src/pages/communications/MailEditor.test.tsx src/pages/communications/RecipientField.test.tsx src/components/ops.houseRules.test.ts src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS (the house rules and the ratchet included: no card string, no off-scale size, every icon button named).

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/mailEditor.ts src/features/mail/mailEditor.test.ts src/pages/communications/MailEditor.tsx src/pages/communications/MailEditor.test.tsx src/pages/communications/RecipientField.tsx src/pages/communications/RecipientField.test.tsx
git commit -m "$(cat <<'EOF'
feat(comms): add the compose editor and address chips

A contenteditable editor with bold, italic, lists and links over the
browser's own commands (no dependency), cleaned to the contract's tags;
To, Cc and Bcc as chips with inline address checks.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The draft session: autosave, revision, conflict and send

**Files:**
- Create: `src/features/mail/draftSession.ts`
- Create: `src/features/mail/useDraftSession.ts`
- Test: `src/features/mail/draftSession.test.ts`

**Interfaces:**
- Consumes: Task 1's calls, types, `draftFailure`, `plainFailure`, `splitQuote`, `joinQuote`, and words; `cleanEditable` (Task 3); `DRAFTS` (`features/agents/draftsText.ts`) for the confirm and reopen fallbacks.
- Produces (`draftSession.ts`):
  - `type ComposeTarget = { kind: 'new' } | { kind: 'reply' | 'reply_all' | 'forward'; messageId: number } | { kind: 'draft'; draftId: number }`;
  - `interface DraftFields { to: Recipient[]; cc: Recipient[]; bcc: Recipient[]; subject: string; body: string }` (`body` is the editable part, above the quote);
  - `interface Upload { key: number; name: string; fraction: number }`;
  - `interface SessionState { phase: 'loading' | 'ready' | 'failed' | 'sent' | 'discarded'; loadError: string | null; kind: DraftKind; from: MailParticipant | null; fields: DraftFields; quote: string; seed: number; draft: MailDraft | null; forwarded: DraftAttachment[]; record: DraftRecord | null; suggested: DraftRecord | null; recordChosen: boolean; dirty: boolean; saving: boolean; sending: boolean; conflict: MailDraft | null; failure: DraftFailure | null; uploads: Upload[]; sent: DraftSent | null }`;
  - `const AUTOSAVE_MS = 2000`;
  - `class DraftSession` with `constructor(target: ComposeTarget, autosaveMs?: number)`, `getState(): SessionState`, `subscribe(listener: () => void): () => void`, `start(): Promise<void>`, `restart(): Promise<void>`, `edit(patch: Partial<DraftFields>): void`, `setRecord(record: DraftRecord | null): void`, `flush(): Promise<void>`, `close(): Promise<boolean>`, `send(): Promise<boolean>`, `discard(): Promise<boolean>`, `takeGmail(): void`, `keepMine(): void`, `reread(): Promise<void>`, `resolve(verb: 'confirm' | 'reopen'): Promise<void>`, `dispose(): void`. (Task 5 adds `upload(file: File): Promise<void>` and `removeAttachment(id: number): Promise<void>`.)
- Produces (`useDraftSession.ts`): `useDraftSession(target: ComposeTarget, autosaveMs?: number): [SessionState, DraftSession]`; `SENDING_POLL_MS = 60_000`.

- [ ] **Step 1: Write the failing test**

Create `src/features/mail/draftSession.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, sent } from '../agents/testAgents';
import { DraftSession } from './draftSession';
import { D2_MESSAGES, GOOGLE, MAIL_DRAFT, MAIL_DRAFT_MESSAGE, QUOTE_ANN, SIGNATURE, stubMail } from './testMail';

// Unit tier: one draft's life (Decisions 4 to 6, 10), with no React. The
// stub answers in the contract's shapes; timers are faked so the 2 s
// autosave runs on demand.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function ready(target: ConstructorParameters<typeof DraftSession>[0]) {
  const session = new DraftSession(target);
  await session.start();
  return session;
}

describe('DraftSession', () => {
  it('starts a reply from the prefill: Ann in To, the quote folded, and nothing stored while untouched', async () => {
    vi.useFakeTimers();
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'reply', messageId: 1 });
    const state = session.getState();
    expect(state.phase).toBe('ready');
    expect(state.fields.to).toEqual([['Ann Lee', 'ann@pizzahut.com']]);
    expect(state.fields.subject).toBe('Re: Renewal quote');
    expect(state.fields.body).toBe(`<p></p>${SIGNATURE}`);
    expect(state.quote).toMatch(/^<div class="gmail_quote">/);
    expect(state.record?.name).toBe('Pizza Hut');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
    expect(await session.close()).toBe(true);
  });

  it('creates the draft 2 s after the first change, then PATCHes the whole content with the revision', async () => {
    vi.useFakeTimers();
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'reply', messageId: 1 });
    session.edit({ body: `<p>Works for us.</p>${SIGNATURE}` });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    const [created] = sent(spy, 'POST', '/mail/drafts/') as Record<string, unknown>[];
    expect(created).toMatchObject({ kind: 'reply', source_message_id: 1, to: [['Ann Lee', 'ann@pizzahut.com']], subject: 'Re: Renewal quote' });
    // Cleaned on the way out (Decision 1): the marker serialises with ="".
    expect(created.html).toBe(`<p>Works for us.</p><div data-revenact-signature="">Dana Ruiz<br>Dough Co</div>${session.getState().quote}`);
    expect(created).not.toHaveProperty('record');
    expect(session.getState().draft?.revision).toBe(1);

    session.edit({ subject: 'Re: Renewal quote, signed' });
    session.edit({ subject: 'Re: Renewal quote (signed)' });
    await vi.advanceTimersByTimeAsync(2_000);
    const patches = sent(spy, 'PATCH', '/mail/drafts/') as Record<string, unknown>[];
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ subject: 'Re: Renewal quote (signed)', revision: 1 });
    expect(session.getState().draft?.revision).toBe(2);
    expect(session.getState().dirty).toBe(false);
  });

  it('sends a chosen record, and stops following the suggestion', async () => {
    vi.useFakeTimers();
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'new' });
    session.setRecord({ kind: 'customer', id: 2, name: 'Dough Co' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((sent(spy, 'POST', '/mail/drafts/')[0] as Record<string, unknown>).record).toEqual({ kind: 'customer', id: 2 });
    expect(session.getState().recordChosen).toBe(true);
    session.setRecord(null);
    await session.flush();
    expect((sent(spy, 'PATCH', '/mail/drafts/')[0] as Record<string, unknown>).record).toBeNull();
    expect(session.getState().record).toBeNull();
  });

  it('on DRAFT_CHANGED stops saving and lets the person take the Gmail version or keep theirs', async () => {
    vi.useFakeTimers();
    const { spy, state } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const session = await ready({ kind: 'draft', draftId: 55 });
    expect(session.getState().fields.body).toBe(`<p>Works for us.</p>${SIGNATURE}`);
    expect(session.getState().quote).toBe(QUOTE_ANN);
    // Edited in Gmail meanwhile.
    Object.assign(state.drafts[0], { revision: 3, subject: 'Re: Renewal quote (from Gmail)', html: `<p>Thursday works.</p>${SIGNATURE}`, text: 'Thursday works.' });
    session.edit({ subject: 'Mine' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(session.getState().conflict?.revision).toBe(3);
    session.edit({ subject: 'Mine, again' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sent(spy, 'PATCH', '/mail/drafts/55/')).toHaveLength(1);

    const seed = session.getState().seed;
    session.takeGmail();
    expect(session.getState().conflict).toBeNull();
    expect(session.getState().fields.subject).toBe('Re: Renewal quote (from Gmail)');
    expect(session.getState().fields.body).toBe(`<p>Thursday works.</p>${SIGNATURE}`);
    expect(session.getState().seed).toBe(seed + 1);

    state.drafts[0].revision = 4;
    session.edit({ subject: 'Mine at last' });
    await vi.advanceTimersByTimeAsync(2_000);
    session.keepMine();
    await vi.advanceTimersByTimeAsync(0);
    const last = sent(spy, 'PATCH', '/mail/drafts/55/').at(-1) as Record<string, unknown>;
    expect(last).toMatchObject({ subject: 'Mine at last', revision: 4 });
    expect(session.getState().conflict).toBeNull();
  });

  it('sends with the unsaved edit riding along, and becomes sent', async () => {
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const session = await ready({ kind: 'draft', draftId: 55 });
    session.edit({ subject: 'Re: Renewal quote, final' });
    expect(await session.send()).toBe(true);
    expect(session.getState().phase).toBe('sent');
    expect(session.getState().sent?.message.folder).toBe('sent');
    const body = sent(spy, 'POST', '/mail/drafts/55/send/')[0] as Record<string, unknown>;
    expect(body).toMatchObject({ revision: 2, subject: 'Re: Renewal quote, final' });
  });

  it('refuses to send to nobody before saving anything', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'new' });
    expect(await session.send()).toBe(false);
    expect(session.getState().failure?.fields.to).toBe('Add someone to send it to.');
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
  });

  it('reads the draft again after an unconfirmed send, and settles it', async () => {
    const { spy } = stubMail({
      messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE],
      drafts: [MAIL_DRAFT],
      sendAnswer: { status: 504, body: { code: 'SEND_UNCONFIRMED', detail: "We couldn't confirm this was sent. Check your Sent folder." } },
    });
    const session = await ready({ kind: 'draft', draftId: 55 });
    expect(await session.send()).toBe(false);
    expect(session.getState().failure?.text).toBe("We couldn't confirm this was sent. Check your Sent folder.");
    expect(session.getState().draft).toMatchObject({ status: 'sent', sending: 'unconfirmed', can_resolve: true });
    await session.resolve('reopen');
    expect(session.getState().draft?.status).toBe('open');
    expect(calls(spy, 'POST', '/reopen/')).toEqual(['/mail/drafts/55/reopen/']);
  });

  it('says the paused words on send, and keeps the draft', async () => {
    stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT], connection: { ...GOOGLE, paused_reason: 'workspace_off' } });
    const session = await ready({ kind: 'draft', draftId: 55 });
    expect(await session.send()).toBe(false);
    expect(session.getState().failure?.text).toBe("Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.");
    expect(session.getState().phase).toBe('ready');
  });

  it('cannot start on a read-only mailbox, and says why in the server words', async () => {
    stubMail({ messages: D2_MESSAGES, connection: { ...GOOGLE, two_way: false } });
    const session = new DraftSession({ kind: 'new' });
    await session.start();
    expect(session.getState().phase).toBe('failed');
    expect(session.getState().loadError).toBe("Reconnect Google to turn on two-way: changes here can't reach Gmail yet.");
  });

  it('discards: nothing to call before a draft exists, DELETE after', async () => {
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const fresh = await ready({ kind: 'new' });
    expect(await fresh.discard()).toBe(true);
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual([]);
    const saved = await ready({ kind: 'draft', draftId: 55 });
    expect(await saved.discard()).toBe(true);
    expect(saved.getState().phase).toBe('discarded');
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual(['/mail/drafts/55/']);
  });

  it('close saves first, and says when an unsaved message would be lost', async () => {
    const { state } = stubMail({ messages: D2_MESSAGES });
    const session = await ready({ kind: 'new' });
    session.edit({ subject: 'Hello' });
    // Two-way goes off after the prefill, so the first save is refused.
    state.connection = { ...GOOGLE, two_way: false };
    expect(await session.close()).toBe(false);
    expect(session.getState().failure?.code).toBe('TWO_WAY_OFF');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/mail/draftSession.test.ts --maxWorkers=2`
Expected: FAIL with "Failed to resolve import "./draftSession"".

- [ ] **Step 3: Write the implementation**

Create `src/features/mail/draftSession.ts`:

```ts
// One draft's life in the composer (two-way Gmail D3, Decisions 4 to 6, 10):
// the prefill or the stored draft, the person's edits, the 2 s autosave
// (create, then PATCH with `revision`), a Gmail edit that got there first
// (409 DRAFT_CHANGED), the send and its states, and discard. Every write
// goes through one promise chain, so a revision is never sent twice and an
// upload's revision bump never makes a PATCH stale. A plain class with
// subscribe/getState, so its rules are tested without React; the composer
// reads it through useDraftSession. No React here.

import { ApiError } from '../../lib/apiClient';
import { DRAFTS } from '../agents/draftsText';
import { cleanEditable } from './mailEditor';
import type { MailParticipant } from './mailboxSlice';
import {
  confirmMailDraftSent,
  createMailDraft,
  discardMailDraft,
  draftFailure,
  fetchComposePrefill,
  fetchMailDraft,
  joinQuote,
  patchMailDraft,
  plainFailure,
  reopenMailDraft,
  sendMailDraft,
  splitQuote,
  type DraftAttachment,
  type DraftContent,
  type DraftFailure,
  type DraftKind,
  type DraftRecord,
  type DraftSent,
  type MailDraft,
  type Recipient,
} from './mailDrafts';
import { DISCARD_FAILED, DRAFT_OPEN_FAILED, DRAFT_SAVE_FAILED, NO_RECIPIENT, PREFILL_FAILED, SEND_FAILED } from './mailText';

export type ComposeTarget = { kind: 'new' } | { kind: 'reply' | 'reply_all' | 'forward'; messageId: number } | { kind: 'draft'; draftId: number };

export interface DraftFields {
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  /** The editable part, above the quote (Decision 7). */
  body: string;
}

export interface Upload {
  key: number;
  name: string;
  /** 0 to 1. */
  fraction: number;
}

export interface SessionState {
  phase: 'loading' | 'ready' | 'failed' | 'sent' | 'discarded';
  loadError: string | null;
  kind: DraftKind;
  from: MailParticipant | null;
  fields: DraftFields;
  /** Kept as it is and joined back on every save. */
  quote: string;
  /** Moves when the fields are replaced from the server: the editor re-seeds. */
  seed: number;
  /** The server's last word on the draft; null until it is first saved. */
  draft: MailDraft | null;
  /** The prefill's forwarded files, before a draft exists. */
  forwarded: DraftAttachment[];
  record: DraftRecord | null;
  suggested: DraftRecord | null;
  recordChosen: boolean;
  dirty: boolean;
  saving: boolean;
  sending: boolean;
  /** Gmail's newer version, waiting for the person's choice (Decision 6). */
  conflict: MailDraft | null;
  /** The last refusal of a save, upload, send or discard. */
  failure: DraftFailure | null;
  uploads: Upload[];
  sent: DraftSent | null;
}

export const AUTOSAVE_MS = 2000;

/** A send refusal after which the draft on the server moved: read it again. */
const REREAD = new Set(['SEND_UNCONFIRMED', 'SEND_SUPERSEDED', 'ALREADY_SENT', 'DRAFT_GONE']);

export class DraftSession {
  private state: SessionState;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  /** Local changes made, and the count the last save carried. */
  private edits = 0;
  private saved = 0;
  private recordTouched = false;
  /** Record picks made; a save's answer keeps a pick made while it was in flight. */
  private recordEdits = 0;
  private sourceId: number | null;
  private started = false;
  private readonly target: ComposeTarget;
  private readonly autosaveMs: number;

  constructor(target: ComposeTarget, autosaveMs = AUTOSAVE_MS) {
    this.target = target;
    this.autosaveMs = autosaveMs;
    this.sourceId = target.kind === 'new' || target.kind === 'draft' ? null : target.messageId;
    this.state = {
      phase: 'loading',
      loadError: null,
      kind: target.kind === 'draft' ? 'new' : target.kind,
      from: null,
      fields: { to: [], cc: [], bcc: [], subject: '', body: '' },
      quote: '',
      seed: 0,
      draft: null,
      forwarded: [],
      record: null,
      suggested: null,
      recordChosen: false,
      dirty: false,
      saving: false,
      sending: false,
      conflict: null,
      failure: null,
      uploads: [],
      sent: null,
    };
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  protected set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  /** Reads the prefill or the draft. A second call is a no-op (StrictMode). */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      if (this.target.kind === 'draft') {
        this.adopt(await fetchMailDraft(this.target.draftId));
        return;
      }
      const prefill = await fetchComposePrefill(this.target.kind, this.sourceId);
      const { body, quote } = splitQuote(prefill.html);
      this.set({
        phase: 'ready',
        kind: prefill.kind,
        from: prefill.from,
        fields: { to: prefill.to, cc: prefill.cc, bcc: prefill.bcc, subject: prefill.subject, body },
        quote,
        seed: this.state.seed + 1,
        forwarded: prefill.forwarded,
        record: prefill.record,
        suggested: prefill.suggested_record,
      });
    } catch (err) {
      this.set({ phase: 'failed', loadError: draftFailure(err, this.target.kind === 'draft' ? DRAFT_OPEN_FAILED : PREFILL_FAILED).text });
    }
  }

  /** Try again after a failed start. */
  restart(): Promise<void> {
    this.started = false;
    this.set({ phase: 'loading', loadError: null });
    return this.start();
  }

  /** The server's draft becomes the screen: fields, quote, record. */
  protected adopt(draft: MailDraft) {
    const { body, quote } = splitQuote(draft.html);
    this.sourceId = draft.source?.message_id ?? null;
    this.recordTouched = false;
    this.saved = this.edits;
    this.set({
      phase: 'ready',
      kind: draft.kind,
      from: draft.from,
      fields: { to: draft.to, cc: draft.cc, bcc: draft.bcc, subject: draft.subject, body },
      quote,
      seed: this.state.seed + 1,
      draft,
      forwarded: [],
      record: draft.record,
      suggested: draft.suggested_record,
      recordChosen: draft.record_chosen,
      dirty: false,
      conflict: null,
    });
  }

  /** A save's answer: the server's numbers and record, the screen's words
   *  untouched. A record picked while the save was in flight stays on screen
   *  until the next save carries it. */
  protected took(draft: MailDraft, recordAt: number) {
    const keep = this.recordEdits !== recordAt;
    this.set({ draft, record: keep ? this.state.record : draft.record, suggested: draft.suggested_record, recordChosen: keep || draft.record_chosen });
  }

  /** A change on screen; saved 2 s after the last one. */
  edit(patch: Partial<DraftFields>) {
    if (this.state.phase !== 'ready') return;
    this.edits += 1;
    this.set({ fields: { ...this.state.fields, ...patch }, dirty: true, failure: null });
    this.schedule();
  }

  /** The person picks the record, or clears it (Decision 8). An agent's draft keeps its own. */
  setRecord(record: DraftRecord | null) {
    if (this.state.phase !== 'ready' || this.state.draft?.agent) return;
    this.recordTouched = true;
    this.recordEdits += 1;
    this.edits += 1;
    this.set({ record, recordChosen: true, dirty: true, failure: null });
    this.schedule();
  }

  protected schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, this.autosaveMs);
  }

  protected cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Runs `work` after every write already queued, whatever they answered. */
  protected enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.chain.then(work, work);
    this.chain = run.catch(() => undefined);
    return run;
  }

  protected content(): DraftContent {
    const { to, cc, bcc, subject, body } = this.state.fields;
    const out: DraftContent = { to, cc, bcc, subject, html: joinQuote(cleanEditable(body), this.state.quote) };
    if (!this.state.draft && this.state.kind === 'forward') out.forwarded = this.state.forwarded.map((file) => file.id);
    if (this.recordTouched) out.record = this.state.record ? { kind: this.state.record.kind, id: this.state.record.id } : null;
    return out;
  }

  /** Saves when anything changed since the last save; resolves either way. */
  protected save(): Promise<void> {
    return this.enqueue(async () => {
      if (this.state.phase !== 'ready' || this.state.conflict || this.edits === this.saved) return;
      const at = this.edits;
      const recordAt = this.recordEdits;
      this.set({ saving: true });
      try {
        const current = this.state.draft;
        const draft = current
          ? await patchMailDraft(current.id, { ...this.content(), revision: current.revision })
          : await createMailDraft({ kind: this.state.kind, ...(this.sourceId !== null ? { source_message_id: this.sourceId } : {}), ...this.content() });
        this.saved = at;
        this.took(draft, recordAt);
        this.set({ saving: false, dirty: this.edits !== this.saved, failure: null });
      } catch (err) {
        const failure = draftFailure(err, DRAFT_SAVE_FAILED);
        if (failure.code === 'DRAFT_CHANGED' && failure.draft) this.set({ saving: false, conflict: failure.draft });
        else this.set({ saving: false, failure });
      }
    });
  }

  /** Saves now (Back, unmount, before a send or an upload). */
  flush(): Promise<void> {
    this.cancelTimer();
    return this.save();
  }

  /** Saves what is unsaved; true when closing loses nothing (Decision 5). */
  async close(): Promise<boolean> {
    await this.flush();
    return this.state.phase !== 'ready' || this.state.draft !== null || this.edits === 0;
  }

  /** Gmail's version replaces the screen (Decision 6). */
  takeGmail() {
    const theirs = this.state.conflict;
    if (theirs) this.adopt(theirs);
  }

  /** The screen's content is saved over Gmail's version (Decision 6). */
  keepMine() {
    const theirs = this.state.conflict;
    if (!theirs) return;
    this.set({ conflict: null, draft: theirs });
    // A save even when nothing changed since the refused one.
    this.edits += 1;
    void this.save();
  }

  /** The draft as the server has it now: after a refused or unconfirmed send, and each minute while one is pending. */
  async reread(): Promise<void> {
    const id = this.state.draft?.id;
    if (!id) return;
    try {
      const draft = await fetchMailDraft(id);
      this.set({ draft });
    } catch {
      // The line on screen stays; the next read tries again.
    }
  }

  /** Sends what is on screen (Decision 10); true when it went. */
  async send(): Promise<boolean> {
    if (this.state.phase !== 'ready' || this.state.sending || this.state.conflict) return false;
    const { to, cc, bcc } = this.state.fields;
    if (to.length + cc.length + bcc.length === 0) {
      this.set({ failure: { ...plainFailure(NO_RECIPIENT), fields: { to: NO_RECIPIENT } } });
      return false;
    }
    this.cancelTimer();
    this.set({ sending: true, failure: null });
    // The draft must exist, even when nothing was typed (a forward sent as
    // it came); an edit made after this save rides with the send.
    if (!this.state.draft) this.edits += 1;
    await this.save();
    return this.enqueue(async () => {
      const draft = this.state.draft;
      if (!draft || this.state.conflict) {
        this.set({ sending: false });
        return false;
      }
      try {
        const answer = await sendMailDraft(draft.id, { ...this.content(), revision: draft.revision });
        this.saved = this.edits;
        this.set({ sending: false, phase: 'sent', sent: answer, draft: answer.draft });
        return true;
      } catch (err) {
        const failure = draftFailure(err, SEND_FAILED);
        if (failure.code === 'DRAFT_CHANGED' && failure.draft) {
          this.set({ sending: false, conflict: failure.draft });
          return false;
        }
        this.set({ sending: false, failure });
        if (failure.code !== null && REREAD.has(failure.code)) await this.reread();
        return false;
      }
    });
  }

  /** It was sent / Reopen draft, for an unconfirmed send (contract §4). */
  async resolve(verb: 'confirm' | 'reopen'): Promise<void> {
    const id = this.state.draft?.id;
    if (!id) return;
    try {
      const draft = verb === 'confirm' ? await confirmMailDraftSent(id) : await reopenMailDraft(id);
      if (verb === 'confirm') this.set({ draft, failure: null });
      else this.adopt(draft);
      this.set({ failure: null });
    } catch (err) {
      this.set({ failure: draftFailure(err, verb === 'confirm' ? DRAFTS.CONFIRM_FAILED : DRAFTS.REOPEN_FAILED) });
    }
  }

  /** Discards the draft only (contract decision 12); nothing to call before it exists. */
  discard(): Promise<boolean> {
    this.cancelTimer();
    return this.enqueue(async () => {
      const draft = this.state.draft;
      if (draft) {
        try {
          await discardMailDraft(draft.id);
        } catch (err) {
          // Gone already counts as discarded.
          if (!(err instanceof ApiError && err.status === 404)) {
            this.set({ failure: draftFailure(err, DISCARD_FAILED) });
            return false;
          }
        }
      }
      this.saved = this.edits;
      this.set({ phase: 'discarded' });
      return true;
    });
  }

  /** Unmounted without Back (a folder change): what is unsaved is saved. */
  dispose() {
    void this.flush();
  }
}
```

Create `src/features/mail/useDraftSession.ts`:

```ts
// The composer's hold on its DraftSession (Decision 4): one session per
// mount (the composer is keyed by its target), started on mount and saved
// on unmount; a send still pending is read again each minute, as the agent
// draft panel does.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { DraftSession, type ComposeTarget, type SessionState } from './draftSession';

export const SENDING_POLL_MS = 60_000;

export function useDraftSession(target: ComposeTarget, autosaveMs?: number): [SessionState, DraftSession] {
  const [session] = useState(() => new DraftSession(target, autosaveMs));
  const state = useSyncExternalStore(session.subscribe, session.getState);
  useEffect(() => {
    void session.start();
    return () => session.dispose();
  }, [session]);
  const pending = state.draft?.sending === 'pending';
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void session.reread(), SENDING_POLL_MS);
    return () => clearInterval(timer);
  }, [pending, session]);
  return [state, session];
}
```

Notes: on a read-only mailbox the prefill itself answers `409 TWO_WAY_OFF`, so `start` fails with the server's sentence; `close` returns false after a failed first save (Decision 5). `cleanEditable` serialises the signature marker as `data-revenact-signature=""`, so the first save after opening a stored draft rewrites its `html` once; the server treats that as a change, which is harmless.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/mail/draftSession.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/draftSession.ts src/features/mail/useDraftSession.ts src/features/mail/draftSession.test.ts
git commit -m "$(cat <<'EOF'
feat(mail): add the draft session with autosave, revision and conflict

One class owns a draft's life: the prefill or the stored draft, the 2 s
autosave (create, then PATCH with revision), DRAFT_CHANGED with a choice,
and send with today's unconfirmed and superseded states. Every write goes
through one chain so a revision is never sent twice.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Attachments: upload with progress, the 25 MB check, forwarded originals

**Files:**
- Modify: `src/features/mail/draftSession.ts` (`upload`, `removeAttachment`)
- Create: `src/pages/communications/ComposeAttachments.tsx`
- Test: `src/lib/apiClient.test.ts` (append `apiUpload`), `src/features/mail/draftSession.test.ts` (append), `src/pages/communications/ComposeAttachments.test.tsx`

**Interfaces:**
- Consumes: `apiUpload` and `uploadDraftAttachment` (Task 2); `uploadRefusal`, `MAIL_SEND_MAX_BYTES`, `removeDraftAttachment`, `DraftAttachment` (Task 1); `DraftSession`, `Upload` (Task 4); `FILE_ACCEPT`, `formatSize` (`features/files/fileFormat.ts`).
- Produces: `DraftSession.upload(file: File): Promise<void>`; `DraftSession.removeAttachment(id: number): Promise<void>`; `ComposeAttachments({ files, uploads, total, failedId, onAttach, onRemove }: { files: DraftAttachment[]; uploads: Upload[]; total: number; failedId: number | null; onAttach: (files: File[]) => void; onRemove: (id: number) => void })`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/apiClient.test.ts` (and add `apiUpload` to its import from `./apiClient`):

```ts
describe('apiUpload (two-way Gmail D3, Decision 9)', () => {
  class Xhr {
    static last: Xhr | null = null;
    static answers: { status: number; body: unknown }[] = [];
    status = 0;
    responseText = '';
    headers: Record<string, string> = {};
    url = '';
    upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    open(_method: string, url: string) {
      this.url = url;
      Xhr.last = this;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send() {
      const answer = Xhr.answers.shift() ?? { status: 201, body: { ok: true } };
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
        this.status = answer.status;
        this.responseText = JSON.stringify(answer.body);
        this.onload?.();
      });
    }
  }

  beforeEach(() => {
    vi.unstubAllGlobals();
    Xhr.answers = [];
    vi.stubGlobal('XMLHttpRequest', Xhr);
  });

  it('posts the form with the token, reports progress and returns the body', async () => {
    setAuthHooks({ getAccessToken: () => 'a.jwt', refreshAccessToken: vi.fn(), onAuthFailure: vi.fn() });
    const progress: number[] = [];
    const body = await apiUpload<{ ok: boolean }>('/mail/drafts/55/attachments/', new FormData(), (f) => progress.push(f));
    expect(body).toEqual({ ok: true });
    expect(Xhr.last?.url).toBe(`${API_ORIGIN}/api/v1/mail/drafts/55/attachments/`);
    expect(Xhr.last?.headers.Authorization).toBe('Bearer a.jwt');
    expect(progress).toEqual([0.5]);
  });

  it('throws the server words as an ApiError', async () => {
    setAuthHooks({ getAccessToken: () => 'a.jwt', refreshAccessToken: vi.fn(), onAuthFailure: vi.fn() });
    Xhr.answers = [{ status: 413, body: { code: 'DRAFT_TOO_LARGE', detail: 'Attachments are limited to 25 MB in total.' } }];
    await expect(apiUpload('/mail/drafts/55/attachments/', new FormData())).rejects.toMatchObject({ status: 413, message: 'Attachments are limited to 25 MB in total.' });
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const refreshAccessToken = vi.fn(async () => 'fresh.jwt');
    setAuthHooks({ getAccessToken: () => 'stale.jwt', refreshAccessToken, onAuthFailure: vi.fn() });
    Xhr.answers = [{ status: 401, body: { detail: 'expired' } }, { status: 201, body: { ok: true } }];
    await expect(apiUpload('/mail/drafts/55/attachments/', new FormData())).resolves.toEqual({ ok: true });
    expect(Xhr.last?.headers.Authorization).toBe('Bearer fresh.jwt');
  });
});
```

Append to `src/features/mail/draftSession.test.ts`:

```ts
describe('DraftSession attachments (Decision 9)', () => {
  const pdf = (name = 'Quote v2.pdf', size?: number) => {
    const file = new File(['quote'], name, { type: 'application/pdf' });
    if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
    return file;
  };

  it('makes the draft for the first file, uploads it with progress, and adopts the new revision', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = new DraftSession({ kind: 'reply', messageId: 1 });
    await session.start();
    const seen: number[] = [];
    session.subscribe(() => {
      const upload = session.getState().uploads[0];
      if (upload) seen.push(upload.fraction);
    });
    await session.upload(pdf());
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual(['/mail/drafts/', `/mail/drafts/${session.getState().draft?.id}/attachments/`]);
    expect(seen).toContain(0.4);
    expect(session.getState().uploads).toEqual([]);
    expect(session.getState().draft).toMatchObject({ revision: 2, total_bytes: 5, attachments: [{ filename: 'Quote v2.pdf', origin: 'upload' }] });
    // The next PATCH carries the revision the upload moved to.
    session.edit({ subject: 'Quote attached' });
    await session.flush();
    expect(sent(spy, 'PATCH', '/mail/drafts/').at(-1)).toMatchObject({ revision: 2 });
  });

  it('refuses before uploading: a type not on the list, and a total over 25 MB with the contract sentence', async () => {
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [{ ...MAIL_DRAFT, total_bytes: 25_000_000 }] });
    const session = new DraftSession({ kind: 'draft', draftId: 55 });
    await session.start();
    await session.upload(pdf('pricing.zip'));
    expect(session.getState().failure?.text).toBe('.zip is not an accepted file type.');
    await session.upload(pdf('big.pdf', 2_000_000));
    expect(session.getState().failure?.text).toBe('Attachments are limited to 25 MB in total.');
    expect(calls(spy, 'POST', '/attachments/')).toEqual([]);
  });

  it('removes a forwarded original before the draft exists, and sends only the kept ones', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const session = new DraftSession({ kind: 'forward', messageId: 1 });
    await session.start();
    expect(session.getState().forwarded.map((f) => f.filename)).toEqual(['Renewal quote.pdf', 'Pricing.zip']);
    await session.removeAttachment(33);
    await session.flush();
    expect((sent(spy, 'POST', '/mail/drafts/')[0] as Record<string, unknown>).forwarded).toEqual([31]);
    // Once the draft exists, a part is removed on the server.
    await session.removeAttachment(31);
    expect(calls(spy, 'DELETE', '/attachments/')).toEqual([`/mail/drafts/${session.getState().draft?.id}/attachments/31/`]);
    expect(session.getState().draft?.attachments).toEqual([]);
  });
});
```

Create `src/pages/communications/ComposeAttachments.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposeAttachments } from './ComposeAttachments';
import type { DraftAttachment } from '../../features/mail/mailDrafts';

// Unit tier: the files on a message being written.

const QUOTE: DraftAttachment = { id: 61, filename: 'Quote v2.pdf', mime_type: 'application/pdf', size: 182311, origin: 'upload', download_url: '/api/v1/mail/attachments/61/download/' };
const ORIGINAL: DraftAttachment = { id: 31, filename: 'Renewal quote.pdf', mime_type: 'application/pdf', size: 90112, origin: 'forward', download_url: '/api/v1/mail/attachments/31/download/' };

describe('ComposeAttachments', () => {
  it('lists uploads and forwarded originals with their size, the total, and a remove button each', async () => {
    const onRemove = vi.fn();
    render(<ComposeAttachments files={[QUOTE, ORIGINAL]} uploads={[]} total={272423} failedId={null} onAttach={vi.fn()} onRemove={onRemove} />);
    const list = screen.getByRole('list', { name: 'Attachments' });
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('Renewal quote.pdfFrom the original · 88 KB');
    // Figured wraps each figure in its own span, so read the text whole.
    expect(document.body).toHaveTextContent('266 KB of 25 MB attached');
    await userEvent.click(screen.getByRole('button', { name: 'Remove Renewal quote.pdf' }));
    expect(onRemove).toHaveBeenCalledWith(31);
  });

  it('shows an upload in progress', () => {
    render(<ComposeAttachments files={[]} uploads={[{ key: 1, name: 'Deck.pptx', fraction: 0.4 }]} total={0} failedId={null} onAttach={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByRole('progressbar', { name: 'Uploading Deck.pptx' })).toHaveAttribute('value', '40');
  });

  it('hands chosen files to the composer, and marks the part a send could not get', async () => {
    const onAttach = vi.fn();
    render(<ComposeAttachments files={[ORIGINAL]} uploads={[]} total={90112} failedId={31} onAttach={onAttach} onRemove={vi.fn()} />);
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    await userEvent.upload(screen.getByLabelText('Choose files to attach'), file);
    expect(onAttach).toHaveBeenCalledWith([file]);
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('border-danger');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/apiClient.test.ts src/features/mail/draftSession.test.ts src/pages/communications/ComposeAttachments.test.tsx --maxWorkers=2`
Expected: FAIL: `session.upload is not a function`, and "Failed to resolve import "./ComposeAttachments"". (The `apiUpload` cases pass already: it landed in Task 2.)

- [ ] **Step 3: Write the implementation**

In `src/features/mail/draftSession.ts`, add to the `./mailDrafts` import: `MAIL_SEND_MAX_BYTES`, `removeDraftAttachment`, `uploadDraftAttachment`, `uploadRefusal`; add `UPLOAD_FAILED` to the `./mailText` import; add a field `private uploadKey = 0;` after `private started = false;`; and add these methods after `setRecord`:

```ts
  /** Attaches one file (Decision 9): checked first, then the draft is made
   *  if there is none yet, then uploaded through the chain with progress. */
  async upload(file: File): Promise<void> {
    if (this.state.phase !== 'ready') return;
    const draft = this.state.draft;
    const total = draft ? draft.total_bytes : this.state.forwarded.reduce((sum, f) => sum + f.size, 0);
    const refusal = uploadRefusal(file, total, draft?.max_bytes ?? MAIL_SEND_MAX_BYTES);
    if (refusal) {
      this.set({ failure: plainFailure(refusal) });
      return;
    }
    const key = ++this.uploadKey;
    this.set({ uploads: [...this.state.uploads, { key, name: file.name, fraction: 0 }], failure: null });
    // A file is a change: the first one makes the draft.
    if (!draft) this.edits += 1;
    this.cancelTimer();
    await this.save();
    await this.enqueue(async () => {
      const current = this.state.draft;
      if (!current) return; // the save failed and said why
      try {
        const answer = await uploadDraftAttachment(current.id, file, (fraction) => this.set({ uploads: this.state.uploads.map((u) => (u.key === key ? { ...u, fraction } : u)) }));
        const latest = this.state.draft ?? current;
        this.set({ draft: { ...latest, attachments: [...latest.attachments, answer.attachment], revision: answer.revision, total_bytes: answer.total_bytes } });
      } catch (err) {
        this.set({ failure: draftFailure(err, UPLOAD_FAILED) });
      }
    });
    this.set({ uploads: this.state.uploads.filter((u) => u.key !== key) });
  }

  /** Removes a part: from the prefill's forwarded list before a draft exists, on the server after. */
  async removeAttachment(id: number): Promise<void> {
    if (this.state.phase !== 'ready') return;
    if (!this.state.draft) {
      this.edits += 1;
      this.set({ forwarded: this.state.forwarded.filter((file) => file.id !== id), dirty: true });
      this.schedule();
      return;
    }
    await this.enqueue(async () => {
      const current = this.state.draft;
      if (!current) return;
      try {
        const answer = await removeDraftAttachment(current.id, id);
        this.set({ draft: { ...current, attachments: current.attachments.filter((a) => a.id !== id), revision: answer.revision, total_bytes: answer.total_bytes }, failure: null });
      } catch (err) {
        this.set({ failure: draftFailure(err, UPLOAD_FAILED) });
      }
    });
  }
```

(Remove `protected` from nothing: `set`, `save`, `schedule`, `cancelTimer` and `enqueue` are already reachable from inside the class.)

Create `src/pages/communications/ComposeAttachments.tsx`:

```tsx
// The files on a message being written (two-way Gmail D3, Decision 9):
// uploads (with their progress while they go up), the Gmail draft's own
// parts and the forwarded originals, each with Remove; the total against
// Gmail's 25 MB; and Attach files. A part a send could not get from Gmail
// (409 ATTACHMENT_UNAVAILABLE, 410 ATTACHMENT_GONE) has a danger edge; the
// sentence is the composer's alert.

import { useRef } from 'react';
import { LoaderCircle, Paperclip, X } from 'lucide-react';
import type { DraftAttachment } from '../../features/mail/mailDrafts';
import type { Upload } from '../../features/mail/draftSession';
import { ATTACH, ATTACHMENTS_LABEL, attachedTotal, CHOOSE_FILES, FROM_ORIGINAL, removeFile, uploadingLabel } from '../../features/mail/mailText';
import { FILE_ACCEPT, formatSize } from '../../features/files/fileFormat';
import { Figured } from '../../components/brain/Figured';
import { BUTTON, ICON_BUTTON, NUM, TYPE } from '../../components/ui';

const CHIP = 'inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 rounded-lg border pl-2.5 pr-1 py-1 sm:min-h-9';

export function ComposeAttachments({
  files,
  uploads,
  total,
  failedId,
  onAttach,
  onRemove,
}: {
  files: DraftAttachment[];
  uploads: Upload[];
  /** Decoded bytes so far (contract decision 20). */
  total: number;
  failedId: number | null;
  onAttach: (files: File[]) => void;
  onRemove: (id: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 || uploads.length > 0 ? (
        <ul aria-label={ATTACHMENTS_LABEL} className="flex flex-wrap gap-2">
          {files.map((file) => (
            <li key={file.id} className={`${CHIP} ${failedId === file.id ? 'border-danger' : 'border-line'}`}>
              <Paperclip className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
              <span className={`min-w-0 truncate ${TYPE.body}`}>{file.filename}</span>
              <span className={`shrink-0 ${TYPE.meta}`}>
                {file.origin === 'forward' ? `${FROM_ORIGINAL} · ` : ''}
                <span className={NUM}>{formatSize(file.size)}</span>
              </span>
              <button type="button" aria-label={removeFile(file.filename)} onClick={() => onRemove(file.id)} className={ICON_BUTTON}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
          {uploads.map((upload) => (
            <li key={`upload-${upload.key}`} className={`${CHIP} border-line pr-2.5`}>
              <LoaderCircle className="h-4 w-4 shrink-0 text-ink-muted motion-safe:animate-spin" aria-hidden="true" />
              <span className={`min-w-0 truncate ${TYPE.body}`}>{upload.name}</span>
              <progress max={100} value={Math.round(upload.fraction * 100)} aria-label={uploadingLabel(upload.name)} className="h-1 w-16 shrink-0 accent-accent" />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => input.current?.click()} className={BUTTON}>
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {ATTACH}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          tabIndex={-1}
          aria-label={CHOOSE_FILES}
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files ? [...event.target.files] : [];
            event.target.value = '';
            if (chosen.length > 0) onAttach(chosen);
          }}
        />
        {total > 0 ? (
          <span className={TYPE.meta}>
            <Figured text={attachedTotal(total)} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
```

(Sizes: 182311 B is 178 KB and 90112 B is 88 KB; 272423 B is 266 KB, the figure the test reads.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/apiClient.test.ts src/features/mail/draftSession.test.ts src/pages/communications/ComposeAttachments.test.tsx src/components/ops.houseRules.test.ts src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apiClient.test.ts src/features/mail/draftSession.ts src/features/mail/draftSession.test.ts src/pages/communications/ComposeAttachments.tsx src/pages/communications/ComposeAttachments.test.tsx
git commit -m "$(cat <<'EOF'
feat(mail): attach files to a draft with progress and the 25 mb check

Files are checked against the upload allow-list and the 25 MB total
before they go up, uploaded over XHR with progress through the draft's
write chain, and forwarded originals can be dropped.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The composer pane

**Files:**
- Create: `src/pages/communications/MailComposer.tsx`
- Create: `src/pages/communications/DraftRecordLine.tsx`
- Modify: `src/components/pipelines/portfolio/ParentPicker.tsx` (`label`, `required`)
- Test: `src/pages/communications/MailComposer.test.tsx`

**Interfaces:**
- Consumes: `useDraftSession`, `ComposeTarget` (Task 4); `upload`, `removeAttachment` (Task 5); `MailEditor`, `RecipientField` (Task 3); `ComposeAttachments` (Task 5); `MailHtmlBody` (D1); `ParentPicker` (Pipelines); `useSubmitOnce` (`components/plans/useSubmitOnce.ts`); `DRAFTS` (`features/agents/draftsText.ts`); Task 1's words.
- Produces: `MailComposer({ target, onClose, onSent, onDiscarded, autosaveMs? }: { target: ComposeTarget; onClose: () => void; onSent: (sent: DraftSent) => void; onDiscarded: () => void; autosaveMs?: number })`, a `<section aria-label={composeTitle(kind)} data-mail-composer>`; `DraftRecordLine({ record, suggested, chosen, fixed, onChange })`; `ParentPicker({ value, onChange, label = 'Belongs to', required = true })`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/communications/MailComposer.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MailComposer } from './MailComposer';
import type { ComposeTarget } from '../../features/mail/draftSession';
import { D2_MESSAGES, GOOGLE, MAIL_DRAFT, MAIL_DRAFT_MESSAGE, stubMail } from '../../features/mail/testMail';
import { calls } from '../../features/agents/testAgents';

// Integration tier: the composer over a real DraftSession; only fetch and
// XMLHttpRequest are stubbed (stubMail), in the D3 contract's shapes.
// Autosave runs after 5 ms here instead of 2 s.

beforeEach(() => {
  Object.defineProperty(document, 'execCommand', { value: vi.fn(() => true), configurable: true });
});
afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
  vi.unstubAllGlobals();
});

function compose(target: ComposeTarget) {
  const handlers = { onClose: vi.fn(), onSent: vi.fn(), onDiscarded: vi.fn() };
  render(
    <MemoryRouter>
      <MailComposer target={target} autosaveMs={5} {...handlers} />
    </MemoryRouter>,
  );
  return handlers;
}

function write(editor: HTMLElement, html: string) {
  editor.innerHTML = html;
  fireEvent.input(editor);
}

const withDraft = { messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] };

describe('MailComposer (two-way Gmail D3)', () => {
  it('opens a reply to Ann with the signature in the text, the quote folded and the suggested record', async () => {
    stubMail({ messages: D2_MESSAGES });
    compose({ kind: 'reply', messageId: 1 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    const editor = await within(pane).findByRole('textbox', { name: 'Message' });
    expect(within(pane).getByRole('list', { name: 'To addresses' })).toHaveTextContent('Ann Lee');
    expect(within(pane).getByLabelText('Subject')).toHaveValue('Re: Renewal quote');
    expect(editor.innerHTML).toContain('data-revenact-signature');
    expect(pane).toHaveTextContent('From Dana Ruiz <dana@doughco.com>');
    expect(within(pane).getByText('Filed on Pizza Hut')).toBeInTheDocument();
    expect(within(pane).getByText('Suggested from the recipients')).toBeInTheDocument();
    expect(within(pane).queryByTitle('The quoted message')).not.toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Show the quoted message' }));
    expect(within(pane).getByTitle('The quoted message')).toBeInTheDocument();
    expect(within(pane).queryByLabelText('Cc')).not.toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Add Cc' }));
    expect(within(pane).getByLabelText('Cc')).toBeInTheDocument();
  });

  it('saves itself after a change and says it is in Gmail', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    compose({ kind: 'reply', messageId: 1 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    write(await within(pane).findByRole('textbox', { name: 'Message' }), '<p>Works for us.</p>');
    await waitFor(() => expect(calls(spy, 'POST', '/mail/drafts/')).toEqual(['/mail/drafts/']));
    expect(await within(pane).findByText('Saved to Gmail')).toBeInTheDocument();
  });

  it('starts a new message in To, and Send with nobody says so before saving anything', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    compose({ kind: 'new' });
    const pane = await screen.findByRole('region', { name: 'New message' });
    await waitFor(() => expect(within(pane).getByLabelText('To')).toHaveFocus());
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    expect(within(pane).getByText('Add someone to send it to.')).toBeInTheDocument();
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
  });

  it('sends a draft and hands the answer to the mailbox', async () => {
    const { spy } = stubMail(withDraft);
    const { onSent } = compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ message: expect.objectContaining({ folder: 'sent' }) })));
    expect(calls(spy, 'POST', '/send/')).toEqual(['/mail/drafts/55/send/']);
  });

  it('keeps the draft on a paused mailbox and says why, with the way out', async () => {
    stubMail({ ...withDraft, connection: { ...GOOGLE, paused_reason: 'token_revoked' } });
    compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    const alert = await within(pane).findByRole('alert');
    expect(alert).toHaveTextContent('Your Gmail connection is paused: Google access was revoked. Reconnect Google in Settings › Connections.');
    expect(within(alert).getByRole('link', { name: 'Open Connections' })).toHaveAttribute('href', '/settings/connections');
  });

  it('shows the Gmail version on DRAFT_CHANGED, holds Send, and Use the Gmail version replaces the screen', async () => {
    const { state } = stubMail(withDraft);
    compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    Object.assign(state.drafts[0], { revision: 2, subject: 'Re: Renewal quote (Gmail)', html: '<p>Thursday works.</p>', text: 'Thursday works.' });
    await userEvent.type(within(pane).getByLabelText('Subject'), '!');
    const alert = await within(pane).findByRole('alert');
    expect(alert).toHaveTextContent('This draft changed in Gmail.');
    expect(alert).toHaveTextContent('Thursday works.');
    expect(within(pane).getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.click(within(alert).getByRole('button', { name: 'Use the Gmail version' }));
    expect(within(pane).getByLabelText('Subject')).toHaveValue('Re: Renewal quote (Gmail)');
    expect(within(pane).getByRole('textbox', { name: 'Message' }).innerHTML).toBe('<p>Thursday works.</p>');
    expect(within(pane).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('turns read-only on an unconfirmed send, and It was sent settles it', async () => {
    stubMail({ ...withDraft, sendAnswer: { status: 504, body: { code: 'SEND_UNCONFIRMED', detail: "We couldn't confirm this was sent. Check your Sent folder." } } });
    compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await within(pane).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    expect(await within(pane).findByText("We couldn't confirm this was sent. Check your Sent folder.")).toBeInTheDocument();
    expect(within(pane).queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'It was sent' }));
    expect(await within(pane).findByText('Message sent.')).toBeInTheDocument();
  });

  it('changes the record or files it nowhere; an agent draft keeps its own', async () => {
    stubMail({ messages: D2_MESSAGES });
    compose({ kind: 'reply', messageId: 1 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await userEvent.click(await within(pane).findByRole('button', { name: 'Change' }));
    await userEvent.click(await within(pane).findByRole('button', { name: 'Dough Co' }));
    expect(within(pane).getByText('Filed on Dough Co')).toBeInTheDocument();
    expect(within(pane).queryByText('Suggested from the recipients')).not.toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: "Don't file" }));
    expect(within(pane).getByText('Not filed on a record')).toBeInTheDocument();
  });

  it('keeps an agent draft on its record', async () => {
    stubMail({ ...withDraft, drafts: [{ ...MAIL_DRAFT, agent: 'cs', reply_draft_id: 7 }] });
    compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    expect(await within(pane).findByText('An agent draft stays on its record.')).toBeInTheDocument();
    expect(within(pane).queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });

  it('a forward lists the original files; Back with nothing typed stores nothing', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const { onClose } = compose({ kind: 'forward', messageId: 1 });
    const pane = await screen.findByRole('region', { name: 'Forward' });
    expect(await within(pane).findByRole('list', { name: 'Attachments' })).toHaveTextContent('Renewal quote.pdf');
    await userEvent.click(within(pane).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
  });

  it('attaches a file with its progress, and Discard draft deletes the draft', async () => {
    const { spy } = stubMail(withDraft);
    const { onDiscarded } = compose({ kind: 'draft', draftId: 55 });
    const pane = await screen.findByRole('region', { name: 'Reply' });
    await userEvent.upload(await within(pane).findByLabelText('Choose files to attach'), new File(['quote'], 'Quote v2.pdf', { type: 'application/pdf' }));
    expect(await within(pane).findByRole('button', { name: 'Remove Quote v2.pdf' })).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Discard draft' }));
    await waitFor(() => expect(onDiscarded).toHaveBeenCalled());
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual(['/mail/drafts/55/']);
  });

  it('says it could not start, and tries again', async () => {
    const { state } = stubMail({ messages: D2_MESSAGES, connection: { ...GOOGLE, two_way: false } });
    compose({ kind: 'new' });
    const pane = await screen.findByRole('region', { name: 'New message' });
    expect(await within(pane).findByRole('alert')).toHaveTextContent("Reconnect Google to turn on two-way: changes here can't reach Gmail yet.");
    state.connection = { ...GOOGLE };
    await userEvent.click(within(pane).getByRole('button', { name: /try again/i }));
    expect(await within(pane).findByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  });
});
```

(`ErrorState`'s retry button is labelled by the shared state primitive; the test matches it case-insensitively.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/communications/MailComposer.test.tsx --maxWorkers=2`
Expected: FAIL with "Failed to resolve import "./MailComposer"".

- [ ] **Step 3: Write the implementation**

In `src/components/pipelines/portfolio/ParentPicker.tsx`:

```tsx
// the signature becomes:
export function ParentPicker({
  value,
  onChange,
  label = 'Belongs to',
  required = true,
}: {
  value: PipelineParentChoice | null;
  onChange: (choice: PipelineParentChoice | null) => void;
  /** The field's label; mail filing (two-way Gmail D3) says "File on". */
  label?: string;
  /** Mail filing is optional: no asterisk, no aria-required. */
  required?: boolean;
}) {
```

and in its two places that print `Belongs to`: the chosen view's `<p className={`mb-1 ${TYPE.label}`}>Belongs to</p>` becomes `<p className={`mb-1 ${TYPE.label}`}>{label}</p>`; the search view's label becomes

```tsx
      <label htmlFor={id} className={`mb-1 block ${TYPE.label}`}>
        {label}
        {required ? (
          <span className="text-danger-ink" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
```

and its input's `aria-required="true"` becomes `aria-required={required ? 'true' : undefined}`. Pipelines' callers pass nothing and are unchanged.

Create `src/pages/communications/DraftRecordLine.tsx`:

```tsx
// Where the message will be filed (contract decision 25; Decision 8): one
// line. Until the person picks, the server follows the suggestion from the
// recipients, and the line says so. Change opens the record search (the
// Pipelines picker, labelled "File on"); Don't file clears it, and the
// message then sends unfiled. An agent's draft stays on its record.

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import type { DraftRecord } from '../../features/mail/mailDrafts';
import { AGENT_RECORD_FIXED, CANCEL, CHANGE_RECORD, DONT_FILE, filedOn, NOT_FILED, RECORD_PICKER_LABEL, RECORD_SUGGESTED } from '../../features/mail/mailText';
import { ParentPicker } from '../../components/pipelines/portfolio/ParentPicker';
import { QUIET, TYPE } from '../../components/ui';

const same = (a: DraftRecord | null, b: DraftRecord | null) => a !== null && b !== null && a.kind === b.kind && a.id === b.id;

function Dot() {
  return <span aria-hidden="true">·</span>;
}

export function DraftRecordLine({
  record,
  suggested,
  chosen,
  fixed,
  onChange,
}: {
  record: DraftRecord | null;
  suggested: DraftRecord | null;
  chosen: boolean;
  /** An agent's draft: no Change, no Don't file. */
  fixed: boolean;
  onChange: (record: DraftRecord | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  if (picking) {
    return (
      <div className="flex flex-col gap-1">
        <ParentPicker
          label={RECORD_PICKER_LABEL}
          required={false}
          value={null}
          onChange={(choice) => {
            if (!choice) return;
            onChange({ kind: choice.type === 'organisation' ? 'customer' : 'account', id: choice.id, name: choice.name });
            setPicking(false);
          }}
        />
        <button type="button" onClick={() => setPicking(false)} className={`-ml-3 self-start ${QUIET}`}>
          {CANCEL}
        </button>
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
      <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="text-ink">{record ? filedOn(record.name) : NOT_FILED}</span>
      {!chosen && same(record, suggested) ? (
        <>
          <Dot />
          <span>{RECORD_SUGGESTED}</span>
        </>
      ) : null}
      {fixed ? (
        <>
          <Dot />
          <span>{AGENT_RECORD_FIXED}</span>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setPicking(true)} className={QUIET}>
            {CHANGE_RECORD}
          </button>
          {record ? (
            <button type="button" onClick={() => onChange(null)} className={QUIET}>
              {DONT_FILE}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
```

Create `src/pages/communications/MailComposer.tsx`:

```tsx
// Writing mail in the mailbox (two-way Gmail D3, spec §4 "Compose";
// Decisions 2 to 10): a new message, a reply, reply all or forward, or a
// draft opened from Drafts. It takes the reading pane with Back (the whole
// card on a phone). The draft saves itself 2 s after a change
// (DraftSession); the line by the title says where it is. A draft changed
// in Gmail meanwhile is shown and the person chooses. Sending keeps
// today's unconfirmed and superseded states, in the agent drafts' words.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Send, Trash2 } from 'lucide-react';
import { useDraftSession } from '../../features/mail/useDraftSession';
import type { ComposeTarget } from '../../features/mail/draftSession';
import { recipientText, type DraftFailure, type DraftField, type DraftSent } from '../../features/mail/mailDrafts';
import {
  ADD_BCC,
  ADD_CC,
  BACK,
  CHANGED_CHOICE,
  CHANGED_IN_GMAIL,
  CLOSE_ANYWAY,
  CLOSE_UNSAVED,
  COMPOSE_OPENING,
  composeTitle,
  DISCARD_DRAFT,
  FIELD_BCC,
  FIELD_CC,
  FIELD_FROM,
  FIELD_MESSAGE,
  FIELD_SUBJECT,
  FIELD_TO,
  KEEP_MINE,
  MESSAGE_SENT,
  PREFILL_FAILED,
  QUOTE_HIDE,
  QUOTE_SHOW,
  QUOTE_TITLE,
  SAVING,
  saveLine,
  SEND,
  SENDING,
  USE_GMAIL,
} from '../../features/mail/mailText';
import { DRAFTS } from '../../features/agents/draftsText';
import { useSubmitOnce } from '../../components/plans/useSubmitOnce';
import { BUTTON, ErrorState as UiErrorState, ICON_BUTTON, INPUT, INVALID, LoadingState, PRIMARY, QUIET, TYPE } from '../../components/ui';
import { ComposeAttachments } from './ComposeAttachments';
import { DraftRecordLine } from './DraftRecordLine';
import { MailEditor } from './MailEditor';
import { MailHtmlBody } from './MailHtmlBody';
import { RecipientField } from './RecipientField';

/** Field errors shown under their own field; any other refusal is the alert by Send. */
const SHOWN_FIELDS: DraftField[] = ['to', 'cc', 'bcc', 'subject', 'html', 'record'];
const FIELD_ERROR = 'text-[11px] leading-4 text-danger-ink';
const ALERT = 'flex min-w-0 flex-wrap items-center gap-x-2 text-[13px] leading-5 text-danger-ink';

function alertOf(failure: DraftFailure | null): DraftFailure | null {
  if (!failure) return null;
  return SHOWN_FIELDS.some((field) => failure.fields[field]) ? null : failure;
}

export function MailComposer({
  target,
  onClose,
  onSent,
  onDiscarded,
  autosaveMs,
}: {
  target: ComposeTarget;
  onClose: () => void;
  onSent: (sent: DraftSent) => void;
  onDiscarded: () => void;
  /** Tests shorten the 2 s autosave. */
  autosaveMs?: number;
}) {
  const [state, session] = useDraftSession(target, autosaveMs);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const { busy: resolving, run } = useSubmitOnce();
  const toRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const { phase, draft, failure, fields } = state;
  const ready = phase === 'ready';
  const nobody = fields.to.length === 0;

  // To when nobody is in it yet, the text otherwise.
  useEffect(() => {
    if (!ready) return;
    if (nobody) toRef.current?.focus();
    else editorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when it becomes ready, not on every recipient change
  }, [ready]);

  useEffect(() => {
    if (phase === 'sent' && state.sent) onSent(state.sent);
  }, [phase, state.sent, onSent]);

  useEffect(() => {
    if (phase === 'discarded') onDiscarded();
  }, [phase, onDiscarded]);

  async function back() {
    if (await session.close()) onClose();
    else setUnsaved(true);
  }

  async function attach(chosen: File[]) {
    for (const file of chosen) await session.upload(file);
  }

  const title = composeTitle(state.kind);
  const readOnly = draft !== null && (draft.status === 'sent' || draft.sending !== null);
  const files = draft ? draft.attachments : state.forwarded;
  const total = draft ? draft.total_bytes : state.forwarded.reduce((sum, file) => sum + file.size, 0);
  const alert = alertOf(failure);
  const ccOpen = showCc || fields.cc.length > 0;
  const bccOpen = showBcc || fields.bcc.length > 0;
  const status = readOnly ? '' : state.saving ? SAVING : saveLine(draft);
  const readOnlyText = draft?.sending === 'pending' ? DRAFTS.IN_FLIGHT : draft?.sending === 'unconfirmed' ? DRAFTS.UNCONFIRMED : MESSAGE_SENT;

  return (
    <section aria-label={title} data-mail-composer className="flex grow min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 border-b border-line-subtle pb-2">
        <button type="button" onClick={() => void back()} className={`-ml-3 ${QUIET}`}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {BACK}
        </button>
        <h2 className={TYPE.title}>{title}</h2>
        <span role="status" className={`ml-auto ${TYPE.meta}`}>
          {status}
        </span>
      </div>

      {unsaved ? (
        <div role="alert" className={`py-2 ${ALERT}`}>
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{CLOSE_UNSAVED}</span>
          <button type="button" onClick={onClose} className={QUIET}>
            {CLOSE_ANYWAY}
          </button>
        </div>
      ) : null}

      {phase === 'loading' ? <LoadingState label={COMPOSE_OPENING} variant="block" /> : null}
      {phase === 'failed' ? <UiErrorState message={state.loadError ?? PREFILL_FAILED} onRetry={() => void session.restart()} /> : null}

      {readOnly && draft ? (
        <div className="flex flex-col gap-3 py-3">
          <p className={TYPE.body}>{readOnlyText}</p>
          {draft.sending === 'unconfirmed' && draft.can_resolve ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={resolving} onClick={() => void run(() => session.resolve('confirm'))} className={PRIMARY}>
                {DRAFTS.CONFIRM_SENT}
              </button>
              <button type="button" disabled={resolving} onClick={() => void run(() => session.resolve('reopen'))} className={BUTTON}>
                {DRAFTS.REOPEN}
              </button>
            </div>
          ) : null}
          {failure && failure.text !== readOnlyText ? (
            <p role="alert" className={ALERT}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {failure.text}
            </p>
          ) : null}
          <p className={TYPE.meta}>{`${FIELD_TO} ${draft.to.map(recipientText).join(', ')}`}</p>
          <p className={TYPE.meta}>{`${FIELD_SUBJECT}: ${draft.subject}`}</p>
        </div>
      ) : null}

      {ready && !readOnly ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-3 custom-scrollbar">
            {state.conflict ? (
              <div role="alert" className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2">
                <p className={`flex items-center gap-2 ${TYPE.label}`}>
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {CHANGED_IN_GMAIL}
                </p>
                <p className={TYPE.bodyMuted}>{CHANGED_CHOICE}</p>
                <div className="flex flex-col gap-1 border-l-2 border-line pl-3">
                  <p className={TYPE.meta}>{`${FIELD_SUBJECT}: ${state.conflict.subject}`}</p>
                  <p className={`max-w-[68ch] whitespace-pre-line ${TYPE.body}`}>{state.conflict.text}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => session.takeGmail()} className={BUTTON}>
                    {USE_GMAIL}
                  </button>
                  <button type="button" onClick={() => session.keepMine()} className={BUTTON}>
                    {KEEP_MINE}
                  </button>
                </div>
              </div>
            ) : null}
            {state.from ? <p className={TYPE.meta}>{`${FIELD_FROM} ${recipientText([state.from.name, state.from.address])}`}</p> : null}
            <RecipientField label={FIELD_TO} value={fields.to} onChange={(to) => session.edit({ to })} error={failure?.fields.to ?? null} inputRef={toRef} />
            {ccOpen ? <RecipientField label={FIELD_CC} value={fields.cc} onChange={(cc) => session.edit({ cc })} error={failure?.fields.cc ?? null} /> : null}
            {bccOpen ? <RecipientField label={FIELD_BCC} value={fields.bcc} onChange={(bcc) => session.edit({ bcc })} error={failure?.fields.bcc ?? null} /> : null}
            {!ccOpen || !bccOpen ? (
              <div className="-mt-2 flex flex-wrap">
                {!ccOpen ? (
                  <button type="button" onClick={() => setShowCc(true)} className={`-ml-3 ${QUIET}`}>
                    {ADD_CC}
                  </button>
                ) : null}
                {!bccOpen ? (
                  <button type="button" onClick={() => setShowBcc(true)} className={QUIET}>
                    {ADD_BCC}
                  </button>
                ) : null}
              </div>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className={TYPE.label}>{FIELD_SUBJECT}</span>
              <input type="text" value={fields.subject} maxLength={255} onChange={(event) => session.edit({ subject: event.target.value })} aria-invalid={failure?.fields.subject ? true : undefined} className={`${INPUT} ${INVALID}`} />
              {failure?.fields.subject ? <span className={FIELD_ERROR}>{failure.fields.subject}</span> : null}
            </label>
            <MailEditor key={state.seed} label={FIELD_MESSAGE} html={fields.body} onChange={(body) => session.edit({ body })} editorRef={editorRef} />
            {failure?.fields.html ? <p className={FIELD_ERROR}>{failure.fields.html}</p> : null}
            {state.quote ? (
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => setShowQuote((open) => !open)} aria-expanded={showQuote} className={`-ml-3 self-start ${QUIET}`}>
                  {showQuote ? QUOTE_HIDE : QUOTE_SHOW}
                </button>
                {showQuote ? (
                  <div className="h-80">
                    <MailHtmlBody html={state.quote} title={QUOTE_TITLE} />
                  </div>
                ) : null}
              </div>
            ) : null}
            <ComposeAttachments files={files} uploads={state.uploads} total={total} failedId={failure?.attachmentId ?? null} onAttach={(chosen) => void attach(chosen)} onRemove={(id) => void session.removeAttachment(id)} />
            <DraftRecordLine record={state.record} suggested={state.suggested} chosen={state.recordChosen} fixed={Boolean(draft?.agent)} onChange={(record) => session.setRecord(record)} />
            {failure?.fields.record ? <p className={FIELD_ERROR}>{failure.fields.record}</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line-subtle pt-2">
            <button type="button" onClick={() => void session.send()} disabled={state.sending || state.conflict !== null || state.uploads.length > 0} className={PRIMARY}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {state.sending ? SENDING : SEND}
            </button>
            {alert ? (
              <p role="alert" className={`flex-1 ${ALERT}`}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{alert.text}</span>
                {alert.reconnect ? (
                  <Link to="/settings/connections" className={QUIET}>
                    {DRAFTS.CONNECT}
                  </Link>
                ) : null}
              </p>
            ) : (
              <span className="flex-1" />
            )}
            <button type="button" onClick={() => void session.discard()} aria-label={DISCARD_DRAFT} title={DISCARD_DRAFT} className={ICON_BUTTON}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/communications/MailComposer.test.tsx src/components/pipelines src/components/ops.houseRules.test.ts src/test/uiRatchet.test.ts --maxWorkers=2`
Expected: PASS (Pipelines' picker tests unchanged: its defaults are the old label and `required`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/communications/MailComposer.tsx src/pages/communications/MailComposer.test.tsx src/pages/communications/DraftRecordLine.tsx src/components/pipelines/portfolio/ParentPicker.tsx
git commit -m "$(cat <<'EOF'
feat(comms): add the mail composer pane

To, Cc and Bcc, subject, the editor with the signature, the folded
quote, attachments and the record line in one pane with Back; it shows
where the draft is saved, a Gmail edit that got there first, and the
unconfirmed and superseded send states.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Writing from the mailbox: Compose, Reply, Reply all, Forward, the keys and the draft link

**Files:**
- Modify: `src/features/mail/mailboxSlice.ts` (`compose`, `notice`; `openCompose`, `closeCompose`, `setMailNotice`)
- Modify: `src/features/mail/mailText.ts` (`WRITING_REGION`, `ANSWER_GROUP`)
- Modify: `src/pages/communications/useMailKeys.ts`, `src/pages/communications/mailWho.ts`, `src/pages/communications/ThreadMessage.tsx`, `src/pages/communications/MailDetail.tsx`, `src/pages/communications/MailboxView.tsx`, `src/pages/communications/CommunicationsPage.tsx`
- Test: `src/pages/communications/MailboxWriting.test.tsx` (new); `src/pages/communications/useMailKeys.test.ts`, `src/pages/communications/MailDetail.test.tsx`, `src/pages/communications/MailboxActions.test.tsx`, `src/pages/communications/MailboxView.test.tsx`, `src/e2e/gmail.test.tsx` (changed)

**Interfaces:**
- Consumes: `MailComposer` (Task 6); `ComposeTarget` (Task 4); `mailDraftParam`, `DraftKind`, `DraftSent` (Task 1).
- Produces (`mailboxSlice.ts`): state `compose: ComposeTarget | null`, `notice: string | null`; actions `openCompose(target: ComposeTarget)`, `closeCompose()`, `setMailNotice(text: string | null)`; any view change (`closeConversation`) also closes the composer.
- Produces (`useMailKeys.ts`): `MailKey` gains `'replyAll' | 'forward' | 'compose'`; `typingIn` is true inside `[data-mail-composer]`.
- Produces (`mailWho.ts`): `forwardTarget(messages: MailMessageDetail[]): MailMessageDetail | null`.
- Produces (`MailDetail`): optional props `writer?: boolean`, `onCompose?: (kind: 'reply' | 'reply_all' | 'forward', messageId: number) => void`, `onEditDraft?: (draftId: number) => void`. (`ThreadMessage`): optional `onEditDraft?: (draftId: number) => void`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/communications/MailboxWriting.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../store';
import CommunicationsPage from './CommunicationsPage';
import { D2_MESSAGES, MAIL_DRAFT, MAIL_DRAFT_MESSAGE, OUTLOOK, stubMail } from '../../features/mail/testMail';
import { forgetInlineImages } from '../../features/mail/mailAttachments';
import { calls, sent } from '../../features/agents/testAgents';

// Integration tier: writing from the mailbox (two-way Gmail D3, Decisions
// 2, 3, 13, 14) through the real store, page and routes; fetch and
// XMLHttpRequest are stubbed with the D3 contract's shapes.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
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

async function ready(store: ReturnType<typeof renderMailbox>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  return mailbox;
}

const blur = () => (document.activeElement as HTMLElement | null)?.blur();

async function openAnn(mailbox: HTMLElement) {
  await userEvent.click(await within(mailbox).findByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
  const conversation = await within(mailbox).findByRole('region', { name: 'Conversation' });
  await within(conversation).findByRole('article', { name: /^Ann Lee, / });
  return conversation;
}

describe('Writing from the mailbox (two-way Gmail D3)', () => {
  it('Compose and c open a new message in the pane; Back with nothing typed returns to the list and stores nothing', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await ready(renderMailbox());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    expect(within(mailbox).getByRole('button', { name: 'Compose' })).toHaveAttribute('aria-keyshortcuts', 'c');
    blur();
    await userEvent.keyboard('c');
    const pane = await within(mailbox).findByRole('region', { name: 'New message' });
    expect(pane).toHaveAttribute('data-mail-composer');
    await waitFor(() => expect(within(pane).getByLabelText('To')).toHaveFocus());
    expect(within(pane).getByLabelText('To')).toHaveValue('');
    await userEvent.click(within(pane).getByRole('button', { name: 'Back' }));
    expect(await within(mailbox).findByRole('button', { name: 'Circleback' })).toBeInTheDocument();
    expect(calls(spy, 'POST', '/mail/drafts/')).toEqual([]);
  });

  it('Reply saves a draft; Back shows it in the conversation, and Edit draft opens it again', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await ready(renderMailbox());
    const conversation = await openAnn(mailbox);
    expect(within(conversation).queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
    const reply = within(conversation).getByRole('button', { name: 'Reply' });
    expect(reply).toHaveAttribute('aria-keyshortcuts', 'r');
    await userEvent.click(reply);
    const pane = await within(mailbox).findByRole('region', { name: 'Reply' });
    await userEvent.type(await within(pane).findByLabelText('Subject'), ' (signed)');
    await userEvent.click(within(pane).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(calls(spy, 'POST', '/mail/drafts/')).toEqual(['/mail/drafts/']));
    const again = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(again).findByRole('button', { name: 'Edit draft' }));
    const reopened = await within(mailbox).findByRole('region', { name: 'Reply' });
    expect(await within(reopened).findByLabelText('Subject')).toHaveValue('Re: Renewal quote (signed)');
  });

  it('a opens Reply all with Cc, f opens Forward with the files, and no key acts inside the composer', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await ready(renderMailbox());
    await openAnn(mailbox);
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ is_read: true }]));
    blur();
    await userEvent.keyboard('a');
    const all = await within(mailbox).findByRole('region', { name: 'Reply all' });
    expect(await within(all).findByRole('list', { name: 'Cc addresses' })).toHaveTextContent('Sam Pizza');
    within(all).getByRole('button', { name: 'Add Bcc' }).focus();
    await userEvent.keyboard('e#jc');
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ is_read: true }]);
    expect(within(mailbox).queryByRole('region', { name: 'New message' })).not.toBeInTheDocument();
    await userEvent.click(within(all).getByRole('button', { name: 'Back' }));
    await within(mailbox).findByRole('region', { name: 'Conversation' });
    blur();
    await userEvent.keyboard('f');
    const forward = await within(mailbox).findByRole('region', { name: 'Forward' });
    expect(await within(forward).findByRole('list', { name: 'Attachments' })).toHaveTextContent('Renewal quote.pdf');
    expect(within(forward).getByLabelText('Subject')).toHaveValue('Fwd: Renewal quote');
  });

  it('Outlook keeps the reply box, with no Compose, Reply all or Forward', async () => {
    stubMail({ connection: OUTLOOK, messages: D2_MESSAGES });
    const mailbox = await ready(renderMailbox('/communications?source=mailbox:microsoft'));
    const conversation = await openAnn(mailbox);
    expect(within(conversation).getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();
    expect(within(conversation).queryByRole('button', { name: 'Reply all' })).not.toBeInTheDocument();
    expect(within(mailbox).queryByRole('button', { name: 'Compose' })).not.toBeInTheDocument();
    blur();
    await userEvent.keyboard('c');
    expect(within(mailbox).queryByRole('region', { name: 'New message' })).not.toBeInTheDocument();
  });

  it('the failure notice link opens that draft in Drafts, not the agent draft panel', async () => {
    stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE], drafts: [MAIL_DRAFT] });
    const store = renderMailbox('/communications?source=mailbox:google&folder=drafts&draft=55');
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    const pane = await within(mailbox).findByRole('region', { name: 'Reply' });
    expect(await within(pane).findByLabelText('Subject')).toHaveValue('Re: Renewal quote');
    expect(store.getState().mailbox.folder).toBe('drafts');
    expect(screen.queryByRole('region', { name: 'Draft reply' })).not.toBeInTheDocument();
  });
});
```

In `src/pages/communications/useMailKeys.test.ts`, change the mapping test and add the composer to `typingIn`:

```ts
  it('maps e, j, #, r, k, a, c and f inside the mailbox, and nothing else', async () => {
    document.body.innerHTML = '<section id="mailbox"><button id="row">Row</button><input id="field"></section><button id="outside">x</button>';
    const scope = { current: document.getElementById('mailbox') };
    const onKey = vi.fn();
    renderHook(() => useMailKeys(scope, onKey));
    document.getElementById('row')!.focus();
    await userEvent.keyboard('ej#rkxacf');
    expect(onKey.mock.calls.map(([key]) => key)).toEqual(['archive', 'next', 'delete', 'reply', 'previous', 'replyAll', 'compose', 'forward']);
  });
```

and in the first `typingIn` test, append `<div data-mail-composer><button id="w">x</button></div>` to the `innerHTML` and `'w'` to the ids expected `true`; rename it "is true in fields, editable text, dialogs, menus, the mail frame and the composer".

In `src/pages/communications/MailDetail.test.tsx`, add `MAIL_DRAFT_MESSAGE` to the `testMail` import and append inside the `describe`:

```tsx
  it('offers Reply, Reply all and Forward to a Gmail two-way mailbox instead of the reply box', async () => {
    const onCompose = vi.fn();
    render(
      <MemoryRouter>
        <MailDetail thread={threadOf([MAIL_EARLIER, MAIL_DETAIL])} loading={false} error={null} folder="inbox" gate={LIVE} labels={MAIL_LABELS} replying={false} replyError={null} repliedId={null} onRetry={vi.fn()} onAction={vi.fn()} onUnmute={vi.fn()} onReply={vi.fn()} onCreateLabel={vi.fn(async () => null)} writer onCompose={onCompose} onEditDraft={vi.fn()} />
      </MemoryRouter>,
    );
    const pane = screen.getByRole('region', { name: 'Conversation' });
    expect(within(pane).queryByRole('textbox', { name: 'Reply' })).not.toBeInTheDocument();
    expect(within(pane).getByRole('button', { name: 'Reply' })).toHaveAttribute('aria-keyshortcuts', 'r');
    expect(within(pane).getByRole('button', { name: 'Reply all' })).toHaveAttribute('aria-keyshortcuts', 'a');
    await userEvent.click(within(pane).getByRole('button', { name: 'Reply all' }));
    await userEvent.click(within(pane).getByRole('button', { name: 'Forward' }));
    expect(onCompose.mock.calls).toEqual([
      ['reply_all', 1],
      ['forward', 1],
    ]);
  });

  it('shows a live draft as a Draft line with Edit draft, and never answers it', async () => {
    const onCompose = vi.fn();
    const onEditDraft = vi.fn();
    render(
      <MemoryRouter>
        <MailDetail thread={threadOf([MAIL_DETAIL, MAIL_DRAFT_MESSAGE])} loading={false} error={null} folder="inbox" gate={LIVE} labels={MAIL_LABELS} replying={false} replyError={null} repliedId={null} onRetry={vi.fn()} onAction={vi.fn()} onUnmute={vi.fn()} onReply={vi.fn()} onCreateLabel={vi.fn(async () => null)} writer onCompose={onCompose} onEditDraft={onEditDraft} />
      </MemoryRouter>,
    );
    const pane = screen.getByRole('region', { name: 'Conversation' });
    expect(within(pane).getByText('Draft')).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Edit draft' }));
    expect(onEditDraft).toHaveBeenCalledWith(55);
    await userEvent.click(within(pane).getByRole('button', { name: 'Reply' }));
    expect(onCompose).toHaveBeenCalledWith('reply', 1);
  });
```

(`LIVE`, `MAIL_EARLIER`, `MAIL_LABELS`, `threadOf` and `MemoryRouter` are already imported by that file.)

In `src/pages/communications/MailboxActions.test.tsx`, replace the whole test `'opens with Enter, r goes to the reply, typing never acts, and # deletes the open conversation'` with:

```tsx
  it('opens with Enter, r opens the reply, keys never act in the composer, and # deletes the open conversation', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const store = renderMailbox();
    const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
    await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
    await within(mailbox).findByRole('button', { name: 'Circleback' });
    await userEvent.keyboard('jj{Enter}');
    const pane = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(pane).findByRole('heading', { level: 2, name: 'Invoice 1042' });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('r');
    const composer = await within(mailbox).findByRole('region', { name: 'Reply' });
    (await within(composer).findByRole('button', { name: 'Add Bcc' })).focus();
    await userEvent.keyboard('e#');
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([]);
    await userEvent.click(within(composer).getByRole('button', { name: 'Back' }));
    await within(mailbox).findByRole('region', { name: 'Conversation' });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('#');
    await waitFor(() => expect(sent(spy, 'PATCH', '/thread/')).toEqual([{ trashed: true }]));
    expect(await within(mailbox).findByRole('region', { name: 'Mail' })).toBeInTheDocument();
  });
```

In `src/pages/communications/MailboxView.test.tsx`, give `renderMailbox` a provider (Outlook keeps today's reply box, D3 Decision 3):

```tsx
function renderMailbox(provider: 'google' | 'microsoft' = 'google') {
  const store = configureStore({
    reducer: { communications: communicationsReducer, mail: mailReducer, mailbox: mailboxReducer, connectors: connectorsReducer },
    preloadedState: {
      mail: { connection: { id: 1, provider, provider_display: 'Google', address: 'dana@acme.io', status: 'connected', two_way: true, paused_reason: null }, providers: [], loaded: true, saving: false, error: null, sending: false, sendError: null } as unknown as ReturnType<typeof mailReducer>,
      connectors: { items: [], isLoading: false, error: null, saving: false, saveError: null } as unknown as ReturnType<typeof connectorsReducer>,
    },
  });
```

(the rest of the function unchanged), and call `renderMailbox('microsoft')` in the three tests that type into the reply box: "opens a message in place, marks it read, and replies from the mailbox", "a reply refreshes the counts and marks the row read" and "Draft with Copilot drafts from the open message".

In `src/e2e/gmail.test.tsx`, in "a workspace switched off pauses the mailbox: Connections, the inbox and a reply all say why", replace the last five lines (from `const message = await within(mailbox).findByRole('region', { name: 'Conversation' });` to the end of the `expect(...)`) with:

```tsx
    const message = await within(mailbox).findByRole('region', { name: 'Conversation' });
    // Two-way Gmail writes through the composer (D3); a draft may be saved while paused, the send says why.
    await userEvent.click(within(message).getByRole('button', { name: 'Reply' }));
    const composer = await within(mailbox).findByRole('region', { name: 'Reply' });
    await within(composer).findByRole('textbox', { name: 'Message' });
    await userEvent.click(within(composer).getByRole('button', { name: 'Send' }));
    expect(await within(composer).findByRole('alert')).toHaveTextContent(
      "Your Gmail connection is paused: your workspace isn't enabled for Gmail. Ask Revenact support to turn Gmail back on.",
    );
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/communications/MailboxWriting.test.tsx src/pages/communications/useMailKeys.test.ts src/pages/communications/MailDetail.test.tsx src/pages/communications/MailboxActions.test.tsx src/e2e/gmail.test.tsx --maxWorkers=2`
Expected: FAIL (no Compose button, no Reply buttons, `a`/`f`/`c` unmapped).

- [ ] **Step 3: Write the implementation**

Append to `src/features/mail/mailText.ts`:

```ts
/** The mailbox region's name while the composer is open. */
export const WRITING_REGION = 'Writing';
/** The group of Reply, Reply all and Forward under a conversation. */
export const ANSWER_GROUP = 'Reply or forward';
```

In `src/features/mail/mailboxSlice.ts`: add `import type { ComposeTarget } from './draftSession';`; add to `MailboxState`

```ts
  /** The open composer (D3, Decision 2): it takes the reading pane. */
  compose: ComposeTarget | null;
  /** A quiet line after a send or a discard. */
  notice: string | null;
```

with `compose: null, notice: null,` in `initialState`; in `closeConversation` add `state.compose = null;` (a view change closes the composer; its unmount saves); in `selectThread` add `state.notice = null;`; and these reducers after `clearMailActionError`:

```ts
    openCompose(state, action: PayloadAction<ComposeTarget>) {
      state.compose = action.payload;
      state.notice = null;
    },
    closeCompose(state) {
      state.compose = null;
    },
    setMailNotice(state, action: PayloadAction<string | null>) {
      state.notice = action.payload;
    },
```

exported with the others: `export const { ..., clearMailActionError, openCompose, closeCompose, setMailNotice } = mailboxSlice.actions;`.

In `src/pages/communications/useMailKeys.ts`, replace the header comment's second sentence and the key table:

```ts
// The mailbox's keyboard (spec §4, D2 Decision 8, D3 Decision 13): e done,
// # delete, j and k next and previous, r reply, a reply all, f forward, c
// compose. Off while the person types or reads elsewhere: inputs, text
// areas, selects, editable text, dialogs and menus (the label menu, the
// viewer), the mail frame, the composer, and anything outside the mailbox.

import { useEffect, type RefObject } from 'react';

export type MailKey = 'archive' | 'delete' | 'reply' | 'replyAll' | 'forward' | 'compose' | 'next' | 'previous';

const KEYS: Record<string, MailKey> = { e: 'archive', '#': 'delete', r: 'reply', a: 'replyAll', f: 'forward', c: 'compose', j: 'next', k: 'previous' };
```

and in `typingIn`'s last line add the composer to the selector:

```ts
  return element.closest('[contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="menu"], [data-mail-composer]') !== null;
```

In `src/pages/communications/mailWho.ts`, append:

```ts
/** The message Forward sends on (D3): the newest that is neither a draft
 *  nor deleted. */
export function forwardTarget(messages: MailMessageDetail[]): MailMessageDetail | null {
  return messages.filter((m) => !m.draft && m.folder !== 'drafts' && m.folder !== 'trash').at(-1) ?? null;
}
```

In `src/pages/communications/ThreadMessage.tsx`: import `Pencil` from lucide-react, `Badge, BUTTON` from `../../components/ui` (beside the existing names), `DRAFT_BADGE, EDIT_DRAFT` from `mailText`; change the signature to `export function ThreadMessage({ message, open, onToggle, onEditDraft }: { message: MailMessageDetail; open: boolean; onToggle?: () => void; onEditDraft?: (draftId: number) => void })`; and put this first in its body:

```tsx
  // A live draft (D3): one line, continued in the composer.
  if (message.draft) {
    const draftId = message.draft.id;
    return (
      <li>
        <div className="flex min-h-11 items-center gap-3 px-4 py-2">
          <Badge>{DRAFT_BADGE}</Badge>
          <span className={`min-w-0 flex-1 truncate ${TYPE.bodyMuted}`}>{message.snippet}</span>
          {onEditDraft ? (
            <button type="button" onClick={() => onEditDraft(draftId)} className={BUTTON}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {EDIT_DRAFT}
            </button>
          ) : null}
        </div>
      </li>
    );
  }
```

In `src/pages/communications/MailDetail.tsx`:
- imports: add `Forward, Reply, ReplyAll` to the lucide import; `ANSWER_GROUP, FORWARD, REPLY, REPLY_ALL` to the `mailText` import; `forwardTarget` beside `replyTarget` from `./mailWho`.
- props: add to the destructured list and the type

```tsx
  /** Gmail two-way: Reply, Reply all and Forward open the composer (D3 Decision 3); otherwise today's reply box. */
  writer?: boolean;
  onCompose?: (kind: 'reply' | 'reply_all' | 'forward', messageId: number) => void;
  onEditDraft?: (draftId: number) => void;
```

  with `writer = false` as the default.
- after `const canReply = ...`: `const forwardable = !inTrash && folder !== 'spam' ? forwardTarget(shown) : null;`
- both `<ThreadMessage ... />` calls gain `onEditDraft={writer ? onEditDraft : undefined}`.
- replace the closing `{canReply && target ? (<ReplyBox ... />) : null}` with:

```tsx
      {writer && onCompose ? (
        (canReply && target) || forwardable ? (
          <div role="group" aria-label={ANSWER_GROUP} className="flex shrink-0 flex-wrap gap-2 border-t border-line-subtle px-4 py-3">
            {canReply && target ? (
              <>
                <button type="button" onClick={() => onCompose('reply', target.id)} aria-keyshortcuts="r" className={BUTTON}>
                  <Reply className="h-4 w-4" aria-hidden="true" />
                  {REPLY}
                </button>
                <button type="button" onClick={() => onCompose('reply_all', target.id)} aria-keyshortcuts="a" className={BUTTON}>
                  <ReplyAll className="h-4 w-4" aria-hidden="true" />
                  {REPLY_ALL}
                </button>
              </>
            ) : null}
            {forwardable ? (
              <button type="button" onClick={() => onCompose('forward', forwardable.id)} aria-keyshortcuts="f" className={BUTTON}>
                <Forward className="h-4 w-4" aria-hidden="true" />
                {FORWARD}
              </button>
            ) : null}
          </div>
        ) : null
      ) : canReply && target ? (
        <ReplyBox
          key={target.id}
          label="Reply"
          placeholder={REPLY_PLACEHOLDER}
          hint={replyHint(thread.account?.name ?? null)}
          sendLabel="Send reply"
          draftSource={{ kind: 'mail_message', id: target.id }}
          onSend={(body) => onReply(target.id, body)}
          sending={replying}
          sent={repliedId === target.id}
          error={replyError}
        />
      ) : null}
```

In `src/pages/communications/CommunicationsPage.tsx`: import `mailDraftParam` from `../../features/mail/mailDrafts` and replace the `draftOpen` line with

```tsx
  // A draft takes the card whatever the source, so its link works from
  // anywhere; a mailbox draft link (Drafts on a mailbox source, D3 Decision
  // 14) is the mailbox's to open.
  const draftOpen = draftParam(params) !== null && mailDraftParam(params) === null;
```

In `src/pages/communications/MailboxView.tsx`:
- imports: `SquarePen` to the lucide import; `closeCompose, openCompose, setMailNotice` to the `mailboxSlice` import; `COMPOSE, DRAFT_DISCARDED, MESSAGE_SENT, WRITING_REGION` beside `mailActionGate` from `mailText`; `mailDraftParam` from `../../features/mail/mailDrafts`; `forwardTarget, replyTarget` from `./mailWho`; `MailComposer` from `./MailComposer`.
- the selector gains `compose, notice` in the destructured `state.mailbox` names.
- after `const gate = ...`:

```tsx
  // Who gets the composer (Decision 3): Gmail two-way, paused included.
  const writer = connection?.provider === 'google' && connection.two_way;
```

- after the `?message=` effect, the draft link (Decision 14):

```tsx
  // The failure notice's link: ?folder=drafts&draft=<id> opens that draft in Drafts, once.
  const linkedDraft = mailDraftParam(params);
  useEffect(() => {
    if (linkedDraft === null) return;
    dispatch(setMailFolder('drafts'));
    dispatch(openCompose({ kind: 'draft', draftId: linkedDraft }));
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('draft');
        next.delete('folder');
        return next;
      },
      { replace: true },
    );
  }, [linkedDraft, dispatch, setParams]);
```

- after `refused`, the composer's three ends:

```tsx
  /** The composer closed: a draft may have been saved, so Drafts, the counts and the conversation move. */
  const composeClosed = useCallback(() => {
    dispatch(closeCompose());
    dispatch(fetchMailSummary());
    dispatch(fetchMailList(query));
    if (selectedId !== null) dispatch(fetchThread(selectedId));
  }, [dispatch, query, selectedId]);

  const composeSent = useCallback(() => {
    composeClosed();
    dispatch(setMailNotice(MESSAGE_SENT));
    dispatch(fetchMailLabels());
  }, [composeClosed, dispatch]);

  const composeDiscarded = useCallback(() => {
    composeClosed();
    dispatch(setMailNotice(DRAFT_DISCARDED));
  }, [composeClosed, dispatch]);
```

- in the `useMailKeys` callback: first line `if (compose) return;` (the composer owns the keyboard, Decision 13), then right after `const ids = ...`:

```tsx
    if (key === 'compose') {
      if (writer) dispatch(openCompose({ kind: 'new' }));
      return;
    }
```

  and replace the old `if (key === 'reply') { ... }` block with:

```tsx
    if (key === 'reply' || key === 'replyAll' || key === 'forward') {
      if (selectedId === null) return;
      if (!writer) {
        if (key === 'reply') regionRef.current?.querySelector('textarea')?.focus();
        return;
      }
      if (!thread || folder === 'trash' || folder === 'spam') return;
      const live = thread.messages.filter((m) => m.folder !== 'trash');
      const answered = key === 'forward' ? forwardTarget(live) : replyTarget(live);
      if (answered) dispatch(openCompose({ kind: key === 'reply' ? 'reply' : key === 'replyAll' ? 'reply_all' : 'forward', messageId: answered.id }));
      return;
    }
```

- the header row: its class becomes ``className={`h-14 shrink-0 flex items-center gap-2 px-3 ${compose ? 'max-sm:hidden' : ''}`}`` (the composer fills the card on a phone, Decision 2), and before the Sync now button:

```tsx
        {writer ? (
          <button type="button" onClick={() => dispatch(openCompose({ kind: 'new' }))} aria-label={COMPOSE} title={COMPOSE} aria-keyshortcuts="c" className={ICON_BUTTON}>
            <SquarePen className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
```

- right after the `actionError` block, the notice line (always mounted):

```tsx
      <p role="status" className={`mx-4 shrink-0 ${notice ? 'mb-2' : ''} ${TYPE.meta}`}>
        {notice ?? ''}
      </p>
```

- the region's `aria-label` becomes `{compose ? WRITING_REGION : selectedId !== null ? 'Reading' : 'Mail'}`, and its first branch becomes the composer:

```tsx
          {compose ? (
            <div className="h-full flex">
              <MailComposer key={JSON.stringify(compose)} target={compose} onClose={composeClosed} onSent={composeSent} onDiscarded={composeDiscarded} />
            </div>
          ) : error ? (
```

- `<MailDetail ... />` gains:

```tsx
                  writer={writer}
                  onCompose={(kind, messageId) => dispatch(openCompose({ kind, messageId }))}
                  onEditDraft={(draftId) => dispatch(openCompose({ kind: 'draft', draftId }))}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/communications src/e2e/gmail.test.tsx src/e2e/gmailActions.test.tsx src/features/mail --maxWorkers=2`
Expected: PASS (every D1 and D2 suite included).

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/mailboxSlice.ts src/features/mail/mailText.ts src/pages/communications/useMailKeys.ts src/pages/communications/useMailKeys.test.ts src/pages/communications/mailWho.ts src/pages/communications/ThreadMessage.tsx src/pages/communications/MailDetail.tsx src/pages/communications/MailDetail.test.tsx src/pages/communications/MailboxView.tsx src/pages/communications/MailboxView.test.tsx src/pages/communications/MailboxActions.test.tsx src/pages/communications/MailboxWriting.test.tsx src/pages/communications/CommunicationsPage.tsx src/e2e/gmail.test.tsx
git commit -m "$(cat <<'EOF'
feat(comms): write from the mailbox with compose, reply, reply all and forward

Gmail two-way opens the composer from Compose (c) and from a message
(r, a, f); a live draft in a conversation has Edit draft; the failure
notice's draft link opens the draft in Drafts. Outlook, IMAP and
read-only Google keep today's reply box.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The Drafts folder: open in the editor, Delete discards the draft, agent drafts once

**Files:**
- Modify: `src/features/mail/mailboxSlice.ts` (`discardDrafts`, `removeRows`)
- Modify: `src/pages/communications/MailboxView.tsx`, `src/pages/communications/MailBulkBar.tsx`, `src/pages/communications/MailList.tsx`
- Modify: `src/components/agents/AgentDraftsList.tsx`, `src/components/agents/DraftPanel.tsx`, `src/features/agents/draftsText.ts`
- Test: `src/pages/communications/MailboxDrafts.test.tsx` (new); `src/pages/communications/MailboxView.test.tsx`, `src/components/agents/DraftPanel.test.tsx` (append)

**Interfaces:**
- Consumes: `discardMailDraft`, `discardMailDrafts` (Task 1); `openCompose`, `setMailNotice` (Task 7); `AGENT_LABEL` (`features/agents/agentsText.ts`).
- Produces (`mailboxSlice.ts`): `discardDrafts` thunk, arg `{ rowIds: number[]; draftIds: number[] }`, reject value `ActionFailure`; rows leave on pending and come back on rejection (same `Undo` record as D2's actions).
- Produces (`MailBulkBar`): new prop `onDiscard: () => void`; in Drafts only Delete (when any ticked row has `draft`) and Clear.
- Produces (`draftsText.ts`): `DRAFTS.IN_MAILBOX`; `mailboxDraftHref(mailDraftId: number): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/pages/communications/MailboxDrafts.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../store';
import CommunicationsPage from './CommunicationsPage';
import { D2_MESSAGES, MAIL_DRAFT, MAIL_DRAFT_MESSAGE, stubMail } from '../../features/mail/testMail';
import type { MailDraft } from '../../features/mail/mailDrafts';
import type { MailMessageDetail } from '../../features/mail/mailboxSlice';
import { forgetInlineImages } from '../../features/mail/mailAttachments';
import { calls, sent } from '../../features/agents/testAgents';

// Integration tier: the Drafts folder in D3 (Decision 11, contract
// decision 12): a draft row opens the editor, Delete discards only the
// draft, an agent's draft row says which agent.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
});

const AGENT_DRAFT: MailDraft = { ...MAIL_DRAFT, id: 56, message_id: 71, thread_id: 't2', to: [['Circleback', 'billing@circleback.ai']], subject: 'Re: Invoice 1042', agent: 'cs', reply_draft_id: 7 };
const AGENT_ROW: MailMessageDetail = { ...MAIL_DRAFT_MESSAGE, id: 71, thread_id: 't2', to: [['Circleback', 'billing@circleback.ai']], subject: 'Re: Invoice 1042', draft: { id: 56, agent: 'cs', reply_draft_id: 7 } };

function renderMailbox() {
  const store = configureStore({ reducer: rootReducer });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/communications?source=mailbox:google']}>
        <Routes>
          <Route path="/communications" element={<CommunicationsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

async function openDrafts(store: ReturnType<typeof renderMailbox>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  await userEvent.click(within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /^Drafts/ }));
  await within(mailbox).findByRole('button', { name: 'To Ann Lee' });
  return mailbox;
}

describe('The Drafts folder (two-way Gmail D3)', () => {
  it('opens a draft row in the composer without marking anything, and names the agent on an agent draft', async () => {
    const { spy } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE, AGENT_ROW], drafts: [MAIL_DRAFT, AGENT_DRAFT] });
    const mailbox = await openDrafts(renderMailbox());
    expect(within(mailbox).getByRole('button', { name: 'To Circleback' }).closest('li')).toHaveTextContent('CS agent');
    await userEvent.click(within(mailbox).getByRole('button', { name: 'To Ann Lee' }));
    const pane = await within(mailbox).findByRole('region', { name: 'Reply' });
    expect(await within(pane).findByLabelText('Subject')).toHaveValue('Re: Renewal quote');
    expect(calls(spy, 'GET', '/mail/drafts/55/')).toEqual(['/mail/drafts/55/']);
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([]);
  });

  it('bulk Delete discards only the drafts in one request, and the other bulk actions are not offered', async () => {
    const { spy, state } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE, AGENT_ROW], drafts: [MAIL_DRAFT, AGENT_DRAFT] });
    const mailbox = await openDrafts(renderMailbox());
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select To Ann Lee' }));
    await userEvent.click(within(mailbox).getByRole('checkbox', { name: 'Select To Circleback' }));
    const bar = within(mailbox).getByRole('toolbar', { name: 'Selected conversations' });
    expect(within(bar).queryByRole('button', { name: 'Mark done' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: /Mark (read|unread)/ })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Labels' })).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'To Ann Lee' })).not.toBeInTheDocument());
    expect((sent(spy, 'POST', '/mail/drafts/discard/')[0] as { ids: number[] }).ids.sort()).toEqual([55, 56]);
    expect(sent(spy, 'PATCH', '/thread/')).toEqual([]);
    expect(calls(spy, 'POST', '/mail/actions/')).toEqual([]);
    expect(state.messages.some((m) => m.id === 1)).toBe(true);
    expect(await within(mailbox).findByText('Draft discarded.')).toBeInTheDocument();
  });

  it('# discards the focused draft alone; a refusal puts the row back and says why', async () => {
    const { spy, state } = stubMail({ messages: [...D2_MESSAGES, MAIL_DRAFT_MESSAGE, AGENT_ROW], drafts: [MAIL_DRAFT, AGENT_DRAFT] });
    const mailbox = await openDrafts(renderMailbox());
    within(mailbox).getByRole('button', { name: 'To Ann Lee' }).focus();
    await userEvent.keyboard('e');
    expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual([]);
    await userEvent.keyboard('#');
    await waitFor(() => expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual(['/mail/drafts/55/']));
    await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'To Ann Lee' })).not.toBeInTheDocument());
    // Discarded elsewhere meanwhile: the server answers 404 and the row comes back.
    state.drafts = [];
    within(mailbox).getByRole('button', { name: 'To Circleback' }).focus();
    await userEvent.keyboard('#');
    expect(await within(mailbox).findByRole('alert')).toHaveTextContent('Not found.');
    expect(within(mailbox).getByRole('button', { name: 'To Circleback' })).toBeInTheDocument();
  });
});
```

Append to the `'MailboxView: drafts from your agents ...'` describe in `src/pages/communications/MailboxView.test.tsx` (add `DRAFT_EMAIL` to the `testDrafts` import):

```tsx
  it('hides an agent draft that is also a Gmail draft: its mailbox row stands for it (D3 Decision 11)', { timeout: 15000 }, async () => {
    drafts({ drafts: [{ ...DRAFT_EMAIL, mail_draft_id: 55 }] });
    renderMailbox();
    const mailbox = await openDrafts();
    expect(await within(mailbox).findByText('No drafts from your agents.')).toBeInTheDocument();
  });
```

Append to `src/components/agents/DraftPanel.test.tsx`'s describe (add `DRAFT_EMAIL` to its `testDrafts` import if missing):

```tsx
  it('links a draft that is also a Gmail draft to the mailbox editor (two-way Gmail D3)', async () => {
    stubDrafts({ drafts: [{ ...DRAFT_EMAIL, mail_draft_id: 55 }] });
    open('/communications?draft=7');
    const region = screen.getByRole('region', { name: 'Draft reply' });
    expect(await within(region).findByRole('link', { name: 'Edit it in your mailbox' })).toHaveAttribute('href', '/communications?source=mailbox:google&folder=drafts&draft=55');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/communications/MailboxDrafts.test.tsx src/pages/communications/MailboxView.test.tsx src/components/agents/DraftPanel.test.tsx --maxWorkers=2`
Expected: FAIL (a draft row opens its conversation; bulk Delete trashes threads through `POST mail/actions/`; the linked agent draft is listed; no mailbox link).

- [ ] **Step 3: Write the implementation**

In `src/features/mail/mailboxSlice.ts`: import `discardMailDraft, discardMailDrafts` from `./mailDrafts` and `DISCARD_FAILED` from `./mailText`; add after `replyToMailMessage`:

```ts
/** Delete in Drafts discards only the drafts (contract decision 12): one is
 *  `DELETE mail/drafts/<id>/`, more are `POST mail/drafts/discard/`. The
 *  rows leave at once and come back if refused (Decision 11). */
export const discardDrafts = createAsyncThunk<void, { rowIds: number[]; draftIds: number[] }, { rejectValue: ActionFailure }>(
  'mailbox/discardDrafts',
  async ({ draftIds }, { rejectWithValue }) => {
    try {
      if (draftIds.length === 1) await discardMailDraft(draftIds[0]);
      else await discardMailDrafts(draftIds);
    } catch (err) {
      return rejectWithValue(actionFailure(err, DISCARD_FAILED));
    }
  },
);
```

after `restore`:

```ts
/** Takes rows off the list at once, keeping them to put back (Decision 11). */
function removeRows(state: MailboxState, requestId: string, ids: number[]) {
  const undo: Undo = { path: buildListPath(state), rows: [], thread: null };
  if (state.list) {
    const kept: MailThread[] = [];
    state.list.results.forEach((row, index) => {
      if (ids.includes(row.id)) undo.rows.push({ index, row: current(row) });
      else kept.push(row);
    });
    state.list.results = kept;
    state.list.count -= undo.rows.length;
  }
  state.undo[requestId] = undo;
}
```

and in `extraReducers`, before `fetchMailLabels.fulfilled`:

```ts
      .addCase(discardDrafts.pending, (state, action) => {
        state.actionError = null;
        state.bulkBusy = true;
        removeRows(state, action.meta.requestId, action.meta.arg.rowIds);
      })
      .addCase(discardDrafts.fulfilled, (state, action) => {
        delete state.undo[action.meta.requestId];
        state.bulkBusy = false;
        state.checked = state.checked.filter((id) => !action.meta.arg.rowIds.includes(id));
      })
      .addCase(discardDrafts.rejected, (state, action) => {
        restore(state, action.meta.requestId);
        state.bulkBusy = false;
        state.actionError = action.payload ?? failed(DISCARD_FAILED);
      })
```

In `src/pages/communications/MailboxView.tsx`: add `discardDrafts` to the `mailboxSlice` import;
- `open(row)` gets a first line:

```tsx
    // A live draft opens the editor (Decision 11); nothing is marked read.
    if (row.draft) {
      dispatch(openCompose({ kind: 'draft', draftId: row.draft.id }));
      return;
    }
```

- after `bulk`, the discard:

```tsx
  /** Delete in Drafts discards only the drafts (Decision 11), also while paused. */
  async function discard(rowIds: number[]) {
    const chosen = rows.filter((row) => rowIds.includes(row.id) && row.draft);
    if (chosen.length === 0) return;
    const draftIds = chosen.flatMap((row) => (row.draft ? [row.draft.id] : []));
    const result = await dispatch(discardDrafts({ rowIds: chosen.map((row) => row.id), draftIds }));
    if (discardDrafts.fulfilled.match(result)) {
      dispatch(setMailNotice(DRAFT_DISCARDED));
      dispatch(fetchMailSummary());
    } else if (discardDrafts.rejected.match(result)) {
      refused(result.payload?.code ?? null);
    }
  }
```

- in the keys callback, replace `const target = selectedId ?? focusedRow();` and the line after it (`if (target === null || gate.blocked) return;`) with:

```tsx
    const target = selectedId ?? focusedRow();
    if (target === null) return;
    if (folder === 'drafts') {
      // # discards only the draft, also while paused; e does nothing here (Decision 11).
      if (key !== 'delete') return;
      const at = ids.indexOf(target);
      const neighbour = ids[at + 1] ?? ids[at - 1];
      void discard([target]);
      if (neighbour !== undefined) window.setTimeout(() => rowButton(neighbour)?.focus(), 0);
      return;
    }
    if (gate.blocked) return;
```

- `<MailBulkBar ... />` gains `onDiscard={() => void discard([...checked])}`.

In `src/pages/communications/MailBulkBar.tsx`: add `onDiscard` to the props (`/** Drafts: Delete discards only the drafts (D3 Decision 11). */ onDiscard: () => void;`), and wrap the actions so Drafts has its own:

```tsx
      {checked.length > 0 ? (
        folder === 'drafts' ? (
          <>
            {gate.gmail ? (
              <button type="button" onClick={onDiscard} disabled={busy || !selected.some((row) => row.draft)} className={BUTTON}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            ) : null}
            <button type="button" onClick={() => onCheck([])} className={QUIET}>
              Clear
            </button>
          </>
        ) : (
          <>
            {/* the D2 actions, unchanged: Mark done / Move to Inbox, Mark read or unread, Labels, Delete or Restore, Clear */}
          </>
        )
      ) : null}
```

(The second fragment holds the existing children exactly as they are today; only the `folder === 'drafts'` branch is new. Update the header comment's first sentence to end "...each in one request (contract §3, POST mail/actions/); in Drafts, Delete discards only the drafts (D3)".)

In `src/pages/communications/MailList.tsx`: import `AGENT_LABEL` from `../../features/agents/agentsText`, and in the row's `trailing`, before the date span:

```tsx
                      {row.draft?.agent ? <Badge>{AGENT_LABEL[row.draft.agent]}</Badge> : null}
```

In `src/features/agents/draftsText.ts`: add `IN_MAILBOX: 'Edit it in your mailbox',` to `DRAFTS` (after `MAILBOX_TITLE`), and append:

```ts
/** A linked Gmail draft in its owner's mailbox editor (two-way Gmail D3, Decision 14). */
export const mailboxDraftHref = (mailDraftId: number): string => `/communications?source=mailbox:google&folder=drafts&draft=${mailDraftId}`;
```

In `src/components/agents/AgentDraftsList.tsx`, replace `const rows = current?.rows ?? null;` with

```tsx
  // A draft also in the owner's Gmail is listed once, as its mailbox row (two-way Gmail D3, Decision 11).
  const rows = current?.rows ? current.rows.filter((draft) => !draft.mail_draft_id) : null;
```

In `src/components/agents/DraftPanel.tsx`: import `mailboxDraftHref` with the other `draftsText` names; inside the `<header>`, after the `data-part="meta"` paragraph:

```tsx
          {draft.mail_draft_id ? (
            <Link to={mailboxDraftHref(draft.mail_draft_id)} className={`self-start ${META_LINK}`}>
              {DRAFTS.IN_MAILBOX}
            </Link>
          ) : null}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/communications src/components/agents src/features/mail src/e2e/gmailActions.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/mailboxSlice.ts src/pages/communications/MailboxView.tsx src/pages/communications/MailBulkBar.tsx src/pages/communications/MailList.tsx src/pages/communications/MailboxDrafts.test.tsx src/pages/communications/MailboxView.test.tsx src/components/agents/AgentDraftsList.tsx src/components/agents/DraftPanel.tsx src/components/agents/DraftPanel.test.tsx src/features/agents/draftsText.ts
git commit -m "$(cat <<'EOF'
feat(comms): drafts open in the editor and delete discards only the draft

In Drafts a row opens the composer, Delete and # discard the draft
(DELETE for one, POST discard for many) instead of trashing the
conversation, and an agent draft linked to Gmail is listed once.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Search, and "Search older mail in Gmail"

**Files:**
- Modify: `src/features/mail/mailboxSlice.ts` (`q` in the query; `setMailSearch`)
- Create: `src/pages/communications/GmailSearchResults.tsx`
- Modify: `src/pages/communications/MailboxView.tsx`
- Test: `src/pages/communications/GmailSearch.test.tsx`

**Interfaces:**
- Consumes: `searchGmail`, `openGmailResult`, `draftFailure`, `GmailSearchResult` (Task 1); `SearchInput`, `ListRow`, `Badge` (`components/ui`); `useSearchText` (`components/organizations/portfolio/useSearchText.ts`); `dayOf` (`mailWho.ts`).
- Produces (`mailboxSlice.ts`): `MailQuery.q?: string` (state starts `''`; `buildListPath` adds `q=` when set); `setMailSearch(q: string)` (closes the conversation and the composer like any view change).
- Produces: `GmailSearchResults({ q, onOpen, onBack }: { q: string; onOpen: (messageId: number) => void; onBack: () => void })`, a `<section aria-label="Results from Gmail">`.

- [ ] **Step 1: Write the failing test**

Create `src/pages/communications/GmailSearch.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../../store';
import CommunicationsPage from './CommunicationsPage';
import { D2_MESSAGES, GMAIL_OLD, GOOGLE, OUTLOOK, stubMail } from '../../features/mail/testMail';
import { forgetInlineImages } from '../../features/mail/mailAttachments';
import { calls } from '../../features/agents/testAgents';

// Integration tier: the mailbox search and "Search older mail in Gmail"
// (contract §6, decision 28; Decision 12).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
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

async function searchFor(text: string, url?: string) {
  const store = renderMailbox(url);
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  await within(mailbox).findByRole('button', { name: 'Circleback' });
  await userEvent.type(within(mailbox).getByRole('searchbox', { name: 'Search your mail' }), text);
  await waitFor(() => expect(within(mailbox).queryByRole('button', { name: 'Circleback' })).not.toBeInTheDocument());
  return mailbox;
}

const older = Array.from({ length: 25 }, (_, i) => ({ ...GMAIL_OLD, id: 600 + i, thread_id: `g-${i}`, subject: `Old renewal ${i}` }));

describe('Search, and Search older mail in Gmail (two-way Gmail D3)', () => {
  it('narrows the synced mail by q, then runs it in Gmail: held results marked, an older one stored when opened', async () => {
    const { spy, state } = stubMail({ messages: D2_MESSAGES, gmailOnly: [GMAIL_OLD] });
    const mailbox = await searchFor('renewal');
    expect(calls(spy, 'GET', '/mail/threads/').some((call) => call.includes('q=renewal'))).toBe(true);
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Search older mail in Gmail' }));
    const results = await within(mailbox).findByRole('region', { name: 'Results from Gmail' });
    const rows = await within(results).findAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(results).toHaveTextContent('About 3 in Gmail');
    expect(rows[0]).toHaveTextContent('In Revenact');
    expect(rows[2]).toHaveTextContent('2024 renewal');
    expect(rows[2]).not.toHaveTextContent('In Revenact');
    expect(calls(spy, 'GET', '/mail/gmail/search/')).toEqual(['/mail/gmail/search/?q=renewal']);
    await userEvent.click(within(rows[2]).getByRole('button'));
    const conversation = await within(mailbox).findByRole('region', { name: 'Conversation' });
    expect(await within(conversation).findByRole('heading', { level: 2, name: '2024 renewal' })).toBeInTheDocument();
    expect(calls(spy, 'POST', '/mail/gmail/search/open/')).toHaveLength(1);
    expect(state.messages.some((m) => m.id === GMAIL_OLD.id)).toBe(true);
    // Back (named after the folder) returns to the Gmail results.
    await userEvent.click(within(within(mailbox).getByRole('region', { name: 'Reading' })).getByRole('button', { name: 'Inbox' }));
    expect(await within(mailbox).findByRole('region', { name: 'Results from Gmail' })).toBeInTheDocument();
  });

  it('opens a held result without storing it, and More from Gmail reads 20 more', async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES, gmailOnly: older });
    const mailbox = await searchFor('renewal');
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Search older mail in Gmail' }));
    const results = await within(mailbox).findByRole('region', { name: 'Results from Gmail' });
    expect(await within(results).findAllByRole('listitem')).toHaveLength(20);
    await userEvent.click(within(results).getByRole('button', { name: 'More from Gmail' }));
    await waitFor(() => expect(within(results).getAllByRole('listitem')).toHaveLength(27));
    expect(calls(spy, 'GET', '/mail/gmail/search/').at(-1)).toBe('/mail/gmail/search/?q=renewal&page_token=20');
    expect(within(results).queryByRole('button', { name: 'More from Gmail' })).not.toBeInTheDocument();
    await userEvent.click(within(within(results).getAllByRole('listitem')[0]).getByRole('button'));
    expect(await within(mailbox).findByRole('region', { name: 'Conversation' })).toBeInTheDocument();
    expect(calls(spy, 'POST', '/mail/gmail/search/open/')).toEqual([]);
  });

  it('a paused mailbox shows the row off with the reason; Outlook has no row', async () => {
    stubMail({ messages: D2_MESSAGES, connection: { ...GOOGLE, paused_reason: 'workspace_off' } });
    const paused = await searchFor('renewal');
    const row = within(paused).getByRole('button', { name: 'Search older mail in Gmail' });
    expect(row).toBeDisabled();
    expect(row).toHaveAttribute('title', "Sync is paused: your workspace isn't enabled for Gmail. Ask Revenact support.");
  });

  it('Outlook has no Gmail row', async () => {
    stubMail({ messages: D2_MESSAGES, connection: OUTLOOK });
    const mailbox = await searchFor('renewal', '/communications?source=mailbox:microsoft');
    expect(within(mailbox).queryByRole('button', { name: 'Search older mail in Gmail' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/communications/GmailSearch.test.tsx --maxWorkers=2`
Expected: FAIL with "Unable to find role="searchbox"".

- [ ] **Step 3: Write the implementation**

In `src/features/mail/mailboxSlice.ts`:
- `MailQuery` gains

```ts
  /** The search box (D1's `q`: subject, sender, snippet); "" or absent for none. */
  q?: string;
```

- `initialState` gains `q: '',`;
- `buildListPath` destructures `q` and adds `if (q) params.set('q', q);` after `priority`;
- a reducer after `setMailPriority`:

```ts
    setMailSearch(state, action: PayloadAction<string>) {
      state.q = action.payload;
      closeConversation(state);
    },
```

  exported with the others.

Create `src/pages/communications/GmailSearchResults.tsx`:

```tsx
// "Search older mail in Gmail" (contract §6, decision 28; Decision 12): the
// person's search run live in Gmail, 20 at a time, newest first, with More
// from Gmail. Nothing is stored until a result is opened: one Revenact
// already holds says "In Revenact" and opens its stored copy; any other is
// stored first (POST open), then opened.

import { useEffect, useState } from 'react';
import { ChevronLeft, Paperclip } from 'lucide-react';
import { draftFailure, openGmailResult, searchGmail, type GmailSearchResult } from '../../features/mail/mailDrafts';
import { BACK_TO_MAIL, GMAIL_MORE, GMAIL_NONE, GMAIL_OPEN_FAILED, GMAIL_RESULTS, GMAIL_SEARCH_FAILED, GMAIL_SEARCHING, gmailEstimate, HELD } from '../../features/mail/mailText';
import { Figured } from '../../components/brain/Figured';
import { Badge, BUTTON, EmptyState as UiEmptyState, ErrorState as UiErrorState, ListRow, LoadingState, NUM, QUIET, TYPE } from '../../components/ui';
import { dayOf } from './mailWho';

type Page = { key: string; results: GmailSearchResult[]; next: string | null; estimate: number };
type Read = Page | { key: string; error: string };

const ALERT = 'mx-4 mt-2 text-[13px] leading-5 text-danger-ink';

export function GmailSearchResults({ q, onOpen, onBack }: { q: string; onOpen: (messageId: number) => void; onBack: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const key = `${q}#${attempt}`;
  const [read, setRead] = useState<Read | null>(null);
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    searchGmail(q, null).then(
      (page) => {
        if (live) setRead({ key, results: page.results, next: page.next_page_token, estimate: page.result_size_estimate });
      },
      (err: unknown) => {
        if (live) setRead({ key, error: draftFailure(err, GMAIL_SEARCH_FAILED).text });
      },
    );
    return () => {
      live = false;
    };
  }, [q, key]);

  // Only the answer for this search and attempt; an older one never shows.
  const current = read?.key === key ? read : null;
  const page = current && !('error' in current) ? current : null;

  async function loadMore() {
    if (!page?.next || more) return;
    setMore(true);
    setMoreError(null);
    try {
      const next = await searchGmail(q, page.next);
      setRead({ ...page, results: [...page.results, ...next.results], next: next.next_page_token });
    } catch (err) {
      setMoreError(draftFailure(err, GMAIL_SEARCH_FAILED).text);
    } finally {
      setMore(false);
    }
  }

  async function open(result: GmailSearchResult) {
    if (result.message_id !== null) {
      onOpen(result.message_id);
      return;
    }
    if (opening) return;
    setOpening(result.gmail_id);
    setOpenError(null);
    try {
      const message = await openGmailResult(result.gmail_id);
      onOpen(message.id);
    } catch (err) {
      setOpenError(draftFailure(err, GMAIL_OPEN_FAILED).text);
    } finally {
      setOpening(null);
    }
  }

  return (
    <section aria-label={GMAIL_RESULTS} aria-busy={opening !== null || undefined} className="flex flex-col">
      <button type="button" onClick={onBack} className={`-ml-3 self-start ${QUIET}`}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {BACK_TO_MAIL}
      </button>
      <div className="flex flex-wrap items-baseline gap-x-2 px-4 pb-1">
        <h3 className={TYPE.title}>{GMAIL_RESULTS}</h3>
        {page && page.estimate > 0 ? (
          <span className={TYPE.meta}>
            <Figured text={gmailEstimate(page.estimate)} />
          </span>
        ) : null}
      </div>
      {!current ? (
        <LoadingState label={GMAIL_SEARCHING} count={4} />
      ) : 'error' in current ? (
        <UiErrorState message={current.error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : current.results.length === 0 ? (
        <UiEmptyState size="inline" title={GMAIL_NONE} />
      ) : (
        <ul aria-label={GMAIL_RESULTS} className="divide-y divide-line-subtle">
          {current.results.map((result) => (
            <ListRow
              key={result.gmail_id}
              title={result.from.name || result.from.address}
              meta={result.snippet ? `${result.subject}: ${result.snippet}` : result.subject}
              trailing={
                <>
                  {result.has_attachments ? (
                    <>
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                      <span className="sr-only">Has attachments</span>
                    </>
                  ) : null}
                  {result.message_id !== null ? <Badge>{HELD}</Badge> : null}
                  <span className={`ml-auto ${TYPE.meta} ${NUM}`}>{dayOf(result.sent_at)}</span>
                </>
              }
              onSelect={() => void open(result)}
            />
          ))}
        </ul>
      )}
      {openError ? (
        <p role="alert" className={ALERT}>
          {openError}
        </p>
      ) : null}
      {page?.next ? (
        <button type="button" onClick={() => void loadMore()} disabled={more} className={`mt-4 ml-4 self-start ${BUTTON}`}>
          {more ? GMAIL_SEARCHING : GMAIL_MORE}
        </button>
      ) : null}
      {moreError ? (
        <p role="alert" className={ALERT}>
          {moreError}
        </p>
      ) : null}
    </section>
  );
}
```

In `src/pages/communications/MailboxView.tsx`:
- imports: `useState` beside the other React hooks; `Search` to the lucide import; `setMailSearch` to the `mailboxSlice` import; `SEARCH_GMAIL, SEARCH_MAIL_LABEL, SEARCH_MAIL_PLACEHOLDER` from `mailText`; `SearchInput` beside the other `components/ui` names; `useSearchText` from `../../components/organizations/portfolio/useSearchText`; `GmailSearchResults` from `./GmailSearchResults`.
- the selector also reads `q`; `query` becomes `useMemo(() => ({ folder, label, category, unread, priority, q }), [folder, label, category, unread, priority, q])`.
- after `const writer = ...`:

```tsx
  // Search older mail in Gmail (Decision 12): Google only; off, with the reason, while paused.
  const gmailSearch: 'on' | 'paused' | 'off' = connection?.provider === 'google' ? (connection.paused_reason ? 'paused' : 'on') : 'off';
  const [gmailQuery, setGmailQuery] = useState<string | null>(null);
  const commitSearch = useCallback(
    (text: string) => {
      setGmailQuery(null);
      dispatch(setMailSearch(text));
    },
    [dispatch],
  );
  const [searchText, setSearchText] = useSearchText(q ?? '', commitSearch);
```

- `narrowed` also counts a search: `const narrowed = folder !== 'inbox' || label !== null || category !== null || unread || priority || Boolean(q);`
- under the `MailboxNotice`, hidden while writing:

```tsx
      {compose ? null : (
        <div className="shrink-0 px-3 pb-2">
          <SearchInput label={SEARCH_MAIL_LABEL} value={searchText} onChange={setSearchText} placeholder={SEARCH_MAIL_PLACEHOLDER} width="full" />
        </div>
      )}
```

- `MailboxPanel`'s `onFolder` and `onLabel` close the Gmail results too: `onFolder={(f) => { setGmailQuery(null); dispatch(setMailFolder(f)); }}` and `onLabel={(id) => { setGmailQuery(null); dispatch(setMailLabel(id)); }}`.
- in the region, after the `selectedId !== null ? (...)` branch and before the list fragment:

```tsx
          ) : gmailQuery !== null ? (
            <GmailSearchResults q={gmailQuery} onOpen={(id) => dispatch(selectThread(id))} onBack={() => setGmailQuery(null)} />
```

- inside the list fragment, right after `<MailList ... />`, the last row:

```tsx
              {q && gmailSearch !== 'off' ? (
                <button
                  type="button"
                  onClick={() => setGmailQuery(q)}
                  disabled={gmailSearch === 'paused'}
                  title={gmailSearch === 'paused' ? (gate.blocked ?? undefined) : undefined}
                  className={`mt-2 ml-1 self-start ${QUIET}`}
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  {SEARCH_GMAIL}
                </button>
              ) : null}
```

(The conversation's Back button still says the folder's title; with Gmail results open behind it, Back lands on them because `gmailQuery` is kept.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/communications src/features/mail --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/mailboxSlice.ts src/pages/communications/GmailSearchResults.tsx src/pages/communications/MailboxView.tsx src/pages/communications/GmailSearch.test.tsx
git commit -m "$(cat <<'EOF'
feat(comms): search the mailbox and search older mail in gmail

A search box narrows the synced mail by q; its last row runs the search
live in Gmail, 20 a page, marking what Revenact holds, and opening an
older result stores it and opens it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The journeys

**Files:**
- Create: `src/e2e/gmailWriting.test.tsx`

**Interfaces:**
- Consumes: everything above; `stubMail`, `D2_MESSAGES`, `GMAIL_OLD` (`testMail.ts`); `calls`, `sent` (`testAgents.ts`); `rootReducer` (`store`).
- Produces: the end-to-end tier for D3 (spec §5: "reply, draft round trip").

- [ ] **Step 1: Write the journeys**

Create `src/e2e/gmailWriting.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { rootReducer } from '../store';
import CommunicationsPage from '../pages/communications/CommunicationsPage';
import { D2_MESSAGES, GMAIL_OLD, stubMail } from '../features/mail/testMail';
import { forgetInlineImages } from '../features/mail/mailAttachments';
import { calls, sent } from '../features/agents/testAgents';

// End-to-end tier (jsdom, no browser; .claude/skills/testing): two-way
// Gmail delivery 3 through the real routes, store and pages. Only fetch and
// XMLHttpRequest are stubbed, with the D3 contract's shapes (stubMail);
// jsdom has no execCommand, so the document gets a spy.

beforeEach(() => {
  Object.defineProperty(document, 'execCommand', { value: vi.fn(() => true), configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
});

function app(url = '/communications?source=mailbox:google') {
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

async function mailboxReady(store: ReturnType<typeof app>) {
  const mailbox = await screen.findByRole('region', { name: 'Mailbox' });
  await waitFor(() => expect(store.getState().mail.connection).not.toBeNull());
  await within(mailbox).findByRole('button', { name: 'Circleback' });
  return mailbox;
}

const folder = (mailbox: HTMLElement, name: RegExp) => within(within(mailbox).getByRole('navigation', { name: 'Folders' })).getByRole('button', { name });

describe('Two-way Gmail D3 journeys', () => {
  it('composes a new message with formatting, a file and a chosen record, sends it and finds it in Sent', { timeout: 30000 }, async () => {
    const { spy } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await mailboxReady(app());
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Compose' }));
    const pane = await within(mailbox).findByRole('region', { name: 'New message' });
    await userEvent.type(await within(pane).findByLabelText('To'), 'Ann Lee <ann@pizzahut.com>{Enter}');
    await userEvent.type(within(pane).getByLabelText('Subject'), 'Signed renewal');
    const editor = within(pane).getByRole('textbox', { name: 'Message' });
    editor.innerHTML = '<p>Signed copy <strong>attached</strong>.</p>';
    fireEvent.input(editor);
    await userEvent.click(within(within(pane).getByRole('toolbar', { name: 'Formatting' })).getByRole('button', { name: 'Italic' }));
    expect(document.execCommand).toHaveBeenCalledWith('italic', false, undefined);
    await userEvent.upload(within(pane).getByLabelText('Choose files to attach'), new File(['signed'], 'Signed.pdf', { type: 'application/pdf' }));
    expect(await within(pane).findByRole('button', { name: 'Remove Signed.pdf' })).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Change' }));
    await userEvent.click(await within(pane).findByRole('button', { name: 'Dough Co' }));
    expect(within(pane).getByText('Filed on Dough Co')).toBeInTheDocument();
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    expect(await within(mailbox).findByText('Message sent.')).toBeInTheDocument();
    const body = sent(spy, 'POST', '/send/')[0] as Record<string, unknown>;
    expect(body).toMatchObject({ to: [['Ann Lee', 'ann@pizzahut.com']], subject: 'Signed renewal', record: { kind: 'customer', id: 2 } });
    expect(String(body.html)).toContain('<strong>attached</strong>');
    expect(calls(spy, 'POST', '/attachments/')).toHaveLength(1);
    await userEvent.click(folder(mailbox, /^Sent/));
    expect((await within(mailbox).findAllByText(/Signed renewal/)).length).toBeGreaterThan(0);
  });

  it('replies all, takes the Gmail version of a draft edited there, and Delete in Drafts discards only the draft', { timeout: 30000 }, async () => {
    const { spy, state } = stubMail({ messages: D2_MESSAGES });
    const mailbox = await mailboxReady(app());
    await userEvent.click(within(mailbox).getByRole('button', { name: 'Dana Ruiz, Ann Lee' }));
    const conversation = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await userEvent.click(await within(conversation).findByRole('button', { name: 'Reply all' }));
    const first = await within(mailbox).findByRole('region', { name: 'Reply all' });
    expect(await within(first).findByRole('list', { name: 'Cc addresses' })).toHaveTextContent('Sam Pizza');
    await userEvent.type(within(first).getByLabelText('Subject'), ' (v2)');
    await userEvent.click(within(first).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(state.drafts).toHaveLength(1));
    const draftId = state.drafts[0].id;

    // Back to the list, then Drafts: the row opens the editor on the draft.
    await userEvent.click(within(within(mailbox).getByRole('region', { name: 'Reading' })).getByRole('button', { name: 'Inbox' }));
    await userEvent.click(folder(mailbox, /^Drafts/));
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'To Ann Lee' }));
    const reopened = await within(mailbox).findByRole('region', { name: 'Reply all' });
    expect(await within(reopened).findByLabelText('Subject')).toHaveValue('Re: Renewal quote (v2)');

    // Edited in Gmail meanwhile; the next save is refused and the person takes Gmail's.
    Object.assign(state.drafts[0], { revision: state.drafts[0].revision + 1, html: '<p>Edited in Gmail.</p>', text: 'Edited in Gmail.' });
    await userEvent.type(within(reopened).getByLabelText('Subject'), '!');
    const alert = await within(reopened).findByRole('alert', {}, { timeout: 4000 });
    expect(alert).toHaveTextContent('This draft changed in Gmail.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Use the Gmail version' }));
    expect(within(reopened).getByRole('textbox', { name: 'Message' }).innerHTML).toBe('<p>Edited in Gmail.</p>');
    await userEvent.click(within(reopened).getByRole('button', { name: 'Back' }));

    await userEvent.click(await within(mailbox).findByRole('checkbox', { name: 'Select To Ann Lee' }));
    await userEvent.click(within(within(mailbox).getByRole('toolbar', { name: 'Selected conversations' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls(spy, 'DELETE', '/mail/drafts/')).toEqual([`/mail/drafts/${draftId}/`]));
    expect(sent(spy, 'PATCH', '/thread/').filter((patch) => 'trashed' in (patch as object))).toEqual([]);
    expect(state.messages.find((m) => m.id === 1)?.folder).toBe('inbox');
  });

  it('searches older mail in Gmail, opens a result, and forwards it with its file', { timeout: 30000 }, async () => {
    const withFile = {
      ...GMAIL_OLD,
      has_attachments: true,
      attachments: [{ id: 801, filename: '2024 quote.pdf', mime_type: 'application/pdf', size: 1000, is_inline: false, content_id: '', available: true, preview: true, download_url: '/api/v1/mail/attachments/801/download/' }],
    };
    const { spy } = stubMail({ messages: D2_MESSAGES, gmailOnly: [withFile] });
    const mailbox = await mailboxReady(app());
    await userEvent.type(within(mailbox).getByRole('searchbox', { name: 'Search your mail' }), '2024');
    await userEvent.click(await within(mailbox).findByRole('button', { name: 'Search older mail in Gmail' }));
    const results = await within(mailbox).findByRole('region', { name: 'Results from Gmail' });
    const [row] = await within(results).findAllByRole('listitem');
    await userEvent.click(within(row).getByRole('button'));
    const conversation = await within(mailbox).findByRole('region', { name: 'Conversation' });
    await within(conversation).findByRole('heading', { level: 2, name: '2024 renewal' });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('f');
    const pane = await within(mailbox).findByRole('region', { name: 'Forward' });
    expect(await within(pane).findByRole('list', { name: 'Attachments' })).toHaveTextContent('2024 quote.pdf');
    await userEvent.type(within(pane).getByLabelText('To'), 'ops@doughco.com{Enter}');
    await userEvent.click(within(pane).getByRole('button', { name: 'Send' }));
    expect(await within(mailbox).findByText('Message sent.')).toBeInTheDocument();
    expect((sent(spy, 'POST', '/mail/drafts/')[0] as Record<string, unknown>).forwarded).toEqual([801]);
  });
});
```

- [ ] **Step 2: Run the journeys**

Run: `npx vitest run src/e2e/gmailWriting.test.tsx --maxWorkers=2`
Expected: PASS. A failure here is a wiring bug in Tasks 1 to 9: fix it in the file that owns it (with its unit test), never by loosening a journey.

- [ ] **Step 3: Commit**

```bash
git add src/e2e/gmailWriting.test.tsx
git commit -m "$(cat <<'EOF'
test(e2e): journeys for writing gmail from the mailbox

Compose with formatting, a file and a chosen record; reply all with a
draft edited in Gmail and discarded from Drafts; search older mail in
Gmail and forward a result with its file.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: The UI/UX, App Flow and architecture documents

**Files:**
- Modify: `docs/03-ui-ux-design.md` (a new section after "Two-way Gmail, delivery 2: actions, conversations, labels and files"; one line in that D2 section)
- Modify: `docs/04-app-flow.md` (a new "4.5n" after "4.5m Your mail, two-way")
- Modify: `.agents/workflows/repo-architecture.md` (a paragraph after the D2 paragraph in "9. Integrations")

**Interfaces:**
- Consumes: Tasks 1 to 10 as built. Product documents are updated in the same PR as the change (repo rule); the PRD, TRD, Schema and Plan are the backend's (contract §9).

- [ ] **Step 1: Update `docs/03-ui-ux-design.md`**

In the D2 section's **Keyboard** bullet, the sentence "Reply all, Forward and compose come with delivery 3." (wrapped over two lines, "Reply all, Forward and" / "compose come with delivery 3.") becomes "Reply all, Forward and" / "compose came with delivery 3 (below)."

Insert after the D2 section's last bullet (**Files tab**), before "### Settings: the frame":

```markdown
### Two-way Gmail, delivery 3: writing

Spec `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §3 and §4;
contract `revenact-backend docs/superpowers/plans/2026-10-11-gmail-writing-api.md`;
plan `docs/superpowers/plans/2026-10-11-gmail-writing-frontend.md`.

- **The composer** (`MailComposer`) takes the reading pane in place of the
  list or the conversation, with Back; below `sm` the mailbox header and
  search hide so it fills the card. Its title is the kind (New message,
  Reply, Reply all, Forward), beside one quiet status line: "Saving…",
  "Saved to Gmail", "Saved", or why Gmail does not have it yet. Gmail
  two-way only (paused included); Outlook, IMAP and read-only Google keep
  the reply box.
- **Addresses** (`RecipientField`): From as a meta line; To, then Cc and
  Bcc behind Add Cc and Add Bcc; each address a `bg-subtle` pill with its
  own Remove (44px below `sm`); commas, semicolons, Enter or leaving the
  field make chips; anything that is not an address stays in the field
  with "Check this address: …" in danger ink under it.
- **The editor** (`MailEditor`): a bordered box with a toolbar (Bold,
  Italic, Bulleted list, Numbered list, Link; `ICON_BUTTON`s with names)
  over an editable region at least 192px tall. Link opens an inline
  "Link address" field with Add link; only web and email addresses are
  taken. A paste keeps the text only. The Gmail signature is already in
  the text, in the muted ink; the quoted message is folded under "Show the
  quoted message" and shown in the sandboxed frame.
- **Attachments** (`ComposeAttachments`): bordered chips (name, "From the
  original" for a forwarded file, size, Remove), an upload's chip with a
  spinner and a thin progress bar, Attach files (`BUTTON`), and "N of 25 MB
  attached". A file over the limit or of a type Files does not take is
  refused before it uploads, in the server's words.
- **Filed on** (`DraftRecordLine`): one meta line, "Filed on <record>" (or
  "Not filed on a record"), "Suggested from the recipients" until the
  person picks, Change (the organisation and account search, labelled
  "File on") and Don't file; an agent's draft says "An agent draft stays
  on its record." instead.
- **Changed in Gmail:** a bordered alert above the fields says "This draft
  changed in Gmail.", shows that version's subject and text under a left
  rule, and offers Use the Gmail version or Keep mine; Send waits.
- **Send** is the one `PRIMARY` (off while a file uploads or a choice
  waits); a refusal is one danger line beside it (with Open Connections
  when reconnecting is the way out), a field's refusal under its field.
  An unconfirmed send turns the composer into text with It was sent and
  Reopen draft; "Message sent." shows under the mailbox header after a
  send, "Draft discarded." after a discard. Discard draft is the trash
  `ICON_BUTTON` at the end of the row.
- **In a conversation**, Gmail two-way shows Reply, Reply all and Forward
  (`BUTTON`s with `aria-keyshortcuts` r, a, f) where the reply box was; a
  live draft is one line with a Draft badge, its snippet and Edit draft.
- **Drafts:** a row opens the composer; an agent's draft row carries the
  agent's badge; the bulk bar offers only Delete (which discards the
  drafts, never the conversation) and Clear. Agent drafts that are also
  Gmail drafts are listed once, as the mailbox row; their draft panel
  links "Edit it in your mailbox".
- **Search:** a full-width search field under the mailbox header narrows
  the list; while it holds text on a Google mailbox the last row is
  "Search older mail in Gmail" (`QUIET`, off with the paused reason as its
  title). Its results replace the list: Back to your mail, "Results from
  Gmail" with "About N in Gmail", rows like the mailbox's with an "In
  Revenact" badge on what is already held, and More from Gmail.
- **Keyboard:** a reply all, f forward, c compose join e, #, j, k and r;
  every key is off inside the composer. In Drafts, # discards the focused
  draft and e does nothing.
```

- [ ] **Step 2: Update `docs/04-app-flow.md`**

Insert after the "4.5m" section's last paragraph (before "### 4.6 Copilot and multiplayer sessions"):

```markdown
### 4.5n Writing mail (Communications › your mailbox)

Two-way Gmail delivery 3 (contract `revenact-backend
docs/superpowers/plans/2026-10-11-gmail-writing-api.md`). On a Google
two-way mailbox (paused included), Compose (`c`) and Reply, Reply all and
Forward (`r`, `a`, `f`) open the composer, which reads
`GET /mail/compose/?kind=&message=` (nothing is stored). The first change
waits two seconds and `POST /mail/drafts/` (with `kind` and
`source_message_id`); later changes `PATCH /mail/drafts/<id>/` with the
whole content and the `revision` it was edited from. `409 DRAFT_CHANGED`
carries the newest draft: the screen shows it and the person takes it or
keeps theirs (a PATCH with the new revision). Files go up one at a time as
multipart to `POST /mail/drafts/<id>/attachments/` (over XHR, for
progress), after a check against the upload allow-list and the 25 MB
total; `DELETE .../attachments/<id>/` removes one. Every write runs in
order, so a revision is never sent twice. Send is
`POST /mail/drafts/<id>/send/` with the content and `revision`; 200 closes
the composer and reads the list, counts and conversation again;
`504 SEND_UNCONFIRMED`, `409 SEND_SUPERSEDED`, `ALREADY_SENT` and
`DRAFT_GONE` read the draft again (`GET /mail/drafts/<id>/`), and an
unconfirmed send is settled with `POST .../confirm-sent/` or
`.../reopen/`; `MAILBOX_PAUSED`, `TWO_WAY_OFF`, `NO_MAILBOX`,
`MESSAGE_TOO_LARGE` and `ATTACHMENT_UNAVAILABLE` are shown in the server's
words. In Drafts, a row with `draft` opens `GET /mail/drafts/<draft.id>/`;
Delete and `#` call `DELETE /mail/drafts/<id>/` for one and
`POST /mail/drafts/discard/ {ids}` for more, never the thread PATCH. The
`mail_action_failed` link `?source=mailbox:google&folder=drafts&draft=<id>`
opens that draft; any other `?draft=<id>` is still an agent's reply draft
(`/communications/drafts/`), whose list hides drafts with `mail_draft_id`.
Search sets `q` on `GET /mail/threads/` (or `/mail/messages/`); "Search
older mail in Gmail" reads `GET /mail/gmail/search/?q=&page_token=` 20 at a
time, and opening a result without `message_id` posts
`POST /mail/gmail/search/open/ {gmail_id}` and opens the stored message.
Outlook, IMAP and read-only Google keep `POST /mail/messages/<id>/reply/`.
```

- [ ] **Step 3: Update `.agents/workflows/repo-architecture.md`**

Insert after the paragraph that begins "Two-way Gmail delivery 2 adds":

```markdown
Two-way Gmail delivery 3 adds writing: `features/mail/mailDrafts.ts` (the
draft, compose and search shapes and calls, `draftFailure`, the quote
split, recipients, the upload check, `mailDraftParam`),
`features/mail/draftSession.ts` (one draft's life as a plain class: the
prefill or the draft, the 2 s autosave with `revision`, `DRAFT_CHANGED`,
uploads, send and discard, every write through one promise chain) with
`useDraftSession.ts`, `features/mail/mailEditor.ts` (the editor's one call
into `document.execCommand`, and `cleanEditable`), and `apiUpload` in
`lib/apiClient.ts` (XHR, for upload progress). In `pages/communications/`:
`MailComposer` with `MailEditor`, `RecipientField`, `ComposeAttachments`
and `DraftRecordLine`, and `GmailSearchResults`; `MailboxView` holds the
composer (`compose` in the mailbox slice) and the search. `testMail.ts`
stubs the D3 routes and `XMLHttpRequest`; `MailboxWriting`, `MailboxDrafts`
and `GmailSearch` tests and `src/e2e/gmailWriting.test.tsx` cover it.
```

- [ ] **Step 4: Check the documents for em dashes**

Run: `git diff -U0 -- docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md | grep '^+' | grep -c "$(printf '\342\200\224')"`
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add docs/03-ui-ux-design.md docs/04-app-flow.md .agents/workflows/repo-architecture.md
git commit -m "$(cat <<'EOF'
docs: two-way gmail delivery 3 in ui/ux, app flow and architecture

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: The full check

**Files:** none (fixes go to the task that owns the failing file, in their own commit).

- [ ] **Step 1: Every test**

Run: `npx vitest run --maxWorkers=4`
Expected: PASS, including `src/test/uiRatchet.test.ts` with every count exactly at its baseline (`sizes 886, cards 156, shadows 150, opacityDisabled 83, mono 38, bold 508`), `src/components/ops.houseRules.test.ts` and `src/test/inlineTargets.test.ts`.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors and no new warnings.

- [ ] **Step 3: Types and bundle**

Run: `npm run build`
Expected: `tsc -b` clean and the Vite build succeeds. No new dependency in `package.json` (`git diff main -- package.json package-lock.json` is empty).

- [ ] **Step 4: No em dash in any added line**

Run: `git diff main -U0 | grep '^+' | grep -v '^+++' | grep -c "$(printf '\342\200\224')"`
Expected: `0`.

- [ ] **Step 5: No raw colour in a component**

Run: `git diff main --name-only --diff-filter=AM -- 'src/**/*.tsx' | grep -v '\.test\.tsx$' | xargs grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|\b(bg|text|border|fill|stroke|ring|outline|divide|accent)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]+\b|\b(bg|text|border)-(white|black)\b'`
Expected: no output (exit status 1).

- [ ] **Step 6: Phone width by eye** (optional, needs the backend running): `npm run dev`, open `/communications?source=mailbox:google` at 375px, open Compose, and check the composer fills the card with Back, chips and the toolbar wrap, and nothing scrolls sideways. Record what was seen in the PR description; do not add a browser test (testing skill).

- [ ] **Step 7: Commit any fixes**

Each fix is committed with the task it belongs to (`fix(mail): ...`, `fix(comms): ...`), with the same trailer line. Nothing to commit when every step passed.

---

## Self-review

**Spec and contract coverage:**

| Requirement | Task |
|---|---|
| Compose from the mailbox (`c`), Reply (`r`), Reply all (`a`), Forward (`f`) | 7 (wiring, keys), 6 (pane) |
| To/Cc/Bcc chips, subject | 3 (`RecipientField`), 6 |
| Basic formatting editor (bold, italic, lists, links), no dependency | 3 (Decision 1) |
| Signature from the prefill; quoted original | 4 (`splitQuote`), 6 (fold) |
| Attachments: upload with progress, 25 MB pre-check with the contract's sentence, types per the allow-list | 2 (`apiUpload`), 5 |
| Forwarded originals listed and removable | 5, 6 |
| Customer suggestion, changeable or cleared; fixed for agent drafts | 4 (`setRecord`), 6 (`DraftRecordLine`) |
| Autosave with `revision`; `409 DRAFT_CHANGED` shown with a choice | 4, 6 |
| `gmail.state` failed and `sync_issue` on drafts | 1 (`saveLine`), 6 |
| Drafts folder rows with `draft`; Delete discards only the draft (one and bulk) | 1, 8 |
| Agent drafts linked to a `MailDraft`: hidden from `AgentDraftsList`, editable in the mailbox | 8 |
| Send: claimed, unconfirmed, superseded; `MAILBOX_PAUSED`, `TWO_WAY_OFF`, `GMAIL_ONLY`, `MESSAGE_TOO_LARGE` | 4, 6 |
| Outlook and IMAP keep today's compose and reply | 7 (Decision 3) |
| Search older mail in Gmail: last row, 20 a page, held marks, open stores and opens | 2 (stub), 9 |
| Keyboard `a`, `f`, `c`; off while typing and in the editor | 7 |
| Phone width: compose fills the card with Back | 6, 7 (Decision 2) |
| Tests in three tiers; e2e journeys in `src/e2e` | every task; 10 |
| UI ratchet tight; documents updated | 12; 11 |
| `mail_action_failed` draft link | 7 (Decision 14) |

**Placeholders:** none; every code step has its code. The one elision is deliberate and named: in Task 8 the D2 bulk bar's existing children stay as they are inside the new `else` branch.

**Type consistency:** `ComposeTarget`, `SessionState`, `DraftSession` (Task 4) are what Tasks 5 to 7 use; `MailDraft`, `DraftAttachment`, `DraftRecord`, `DraftFailure`, `GmailSearchResult` (Task 1) are used under those names throughout; `openCompose`, `closeCompose`, `setMailNotice` (Task 7), `discardDrafts` (Task 8) and `setMailSearch` (Task 9) are the slice's names; `uploadDraftAttachment` and `apiUpload` come in Task 2 and are used in Task 5; `takeGmail` / `keepMine` (not `use*`, so the hooks lint rule never mistakes them for hooks).
