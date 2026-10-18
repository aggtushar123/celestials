# Integrations A: two-way Gmail

**Owner's request (2026-10-10).** Each person in a company links their Gmail
and stops needing Gmail itself: mail, and later calendar events and meeting
links, live in Revenact, and Revenact builds the person's "persona" from them.

The request covers three sub-projects, built in this order, each with its own
spec, plans and PRs:

- **A. Two-way Gmail** (this spec): Revenact becomes a real Gmail client.
- **B. Google Calendar + Meet**: agenda, meetings linked to customers, invites,
  Meet links. It adds the calendar permission to the same Google connection.
- **C. Persona**: built from A and B. It has three parts: a hub (mail +
  calendar in one place), a profile (relationships, accounts, meeting load,
  working hours) and a writing voice (signature, tone) for drafts. Today, the
  agents and Copilot all use it.

**Decisions taken in brainstorming (2026-10-10):**

| Question | Decision |
|---|---|
| Persona | **All three** (hub, profile, voice), built in stages after A and B. |
| First piece | **Two-way Gmail.** |
| Who connects | **Our team and pilots.** A pilot company is approved per workspace. Only addresses on its verified domains connect, and only people holding a seat. Google verification (CASA) waits for paying customers. |
| Sync back to Gmail | **All of these:** read/unread, star, archive/trash/spam, labels and drafts (including agent-written reply drafts). |
| History | **The last 12 months**, imported newest first. Older mail is found by a live Gmail search and saved when opened. |
| Engine | **Approach 1:** a change-log (`historyId`) loop every ~60 s, Pub/Sub push as an optional instant wake-up, and an outbox for actions going back to Gmail. |

## What exists today

This is the personal-mailbox work of 2026-09-16 and 2026-09-21, backend
`services/mail`:

- `MailboxConnection`: one per user (Google, Microsoft or IMAP), with
  Fernet-encrypted credentials and an epoch `sync_cursor`.
- Google scopes are `gmail.readonly` and `gmail.send`. The Google OAuth client
  is **not configured** in any environment yet.
- `sync_mail` runs every 10 minutes from the prod `mailsync` sleep loop. It
  covers the last 30 days on first sync, and at most 500 messages per run. It
  only sees *new* messages: reads, archives and label changes made in Gmail
  are never seen.
- `MailMessage` is the owner's whole inbox, text body only: no HTML, no CC or
  BCC split, no labels, no attachments. Its folder, flags, `state`
  (done/muted) and rule-based category are all decided in Revenact. Nothing is
  written back.
- Matched mail is filed as `customers.Email` and is visible to the owner and
  their chain.
- Agent `draft.reply` drafts live only in Revenact (Agents D2). Sending goes
  through the claimed / unconfirmed / superseded send states (cleanup batch
  #107).
- Replies set no `In-Reply-To`, so they do not thread for the recipient.

Outlook and IMAP keep today's behaviour in this round.

## 1. Who can connect, and how

**Three gates, all required:**

1. **The workspace is approved.** A Revenact staff member turns on a new
   per-workspace switch, "Google two-way mail", in the platform portal. This
   is the pilot approval. While the Google app is unverified, staff also add
   each pilot user as a test user in Google Cloud. Settings says so plainly
   ("Your workspace isn't enabled for Gmail yet: ask Revenact support").
2. **The address is on a verified domain.** The Google account's address must
   end in one of the workspace's *verified* `identity.OrganizationDomain`
   domains. Anything else is refused: "Connect your pizzahut.com account".
3. **The person holds a seat** (`billing.SeatAssignment`) and is an active
   member. When a member is suspended, revoked or loses their seat, their
   connection is paused: sync stops, and nothing is deleted.

**Connecting.** In Settings › My mailbox, **Connect Google** runs OAuth with
`gmail.modify`, `gmail.send` and `gmail.compose`. `gmail.modify` includes read
access and the send-as signature listing; confirm this against Google's
per-method scope table in D1. We do not ask for full mail access
(`https://mail.google.com/`), so Revenact can never permanently delete mail.
Calendar scopes are added in round B by incremental consent, and existing
connections keep working until the person re-consents.

**Existing read-only connections** keep working as today. They show a
"Reconnect to turn on two-way" banner. The granted scopes are stored on the
connection, and two-way features are switched on only when the scopes allow
them.

**After connecting:** the 12-month import starts, newest first, with a
progress line ("Importing mail: 4,210 of about 18,000"). The total comes from
Gmail's `messagesTotal` estimate.

**Disconnecting** stops sync and revokes the token at Google. Mail already
filed on customers stays (company records). The person's own inbox copies,
labels and cached attachments are deleted **30 days** later unless they
reconnect. A daily prune in `run_health_maintenance` does the deleting.

**Privacy is unchanged.** The whole inbox is owner-only. Managers see only
mail filed on records they can open, under today's twice-filter and chain
rules.

## 2. Storage and the sync engine

**`MailMessage` gains:**
- `html_body`: sanitised on the server.
- `cc` and `bcc`: same shape as `to`.
- `rfc_message_id` and `references`: for threading.
- `label_ids`: Gmail label ids.
- `has_attachments`.

Folder, read, starred and important are now *derived from labels* for Gmail
mailboxes: INBOX, SENT, DRAFT, SPAM, TRASH, UNREAD, STARRED, IMPORTANT. A
message with none of INBOX, SENT, DRAFT, SPAM or TRASH is archived. Revenact's
`state=done` maps to "archived" for Gmail. `muted` stays Revenact-only.

**New models (in `services/mail`):**
- `MailLabel`: belongs to a connection; holds the Gmail id, name, colour and
  type (system or user). It is mirrored from Gmail on every full label list,
  and created from Revenact through the outbox.
- `MailAttachment`: belongs to a message; holds the Gmail attachment id, file
  name, MIME type, size and a cached file (empty until first opened). Only the
  details are synced. The file is fetched from Gmail on first open, stored
  through the existing attachment storage, and served by the authenticated
  download route. When the message is filed on a customer, its attachments
  also appear in that record's Files tab, under the record's visibility.
- `MailOutbox`: see §3.

**`MailboxConnection` gains:**
- `history_id`.
- Import state: `import_page_token`, `import_before` (the 12-month line),
  `import_total_estimate`, `import_done_at`.
- `granted_scopes`.
- `watch_expires_at`.
- `wake_at`.
- `backoff_until`.
- `paused_reason`: no seat, suspended, workspace off, or token revoked.

**The loop.** `mailsync` changes from a 10-minute sleep to a ~5-second tick
(`sync_mail --loop`, still no task queue). Each tick claims due mailboxes with
`select_for_update(skip_locked=True)`. A mailbox is due when `wake_at` is
set, or when it has not synced for 60 seconds and is not in backoff. For each
mailbox, in this order:

1. **Flush the outbox** (§3).
2. **Apply changes.** Call `history.list` since `history_id` for
   messagesAdded, messagesDeleted, labelsAdded and labelsRemoved.
   - New messages: fetch them in full, store them and file them against
     customers (today's `file_message`).
   - Deleted messages: remove the inbox copy. A filed `customers.Email` is
     kept.
   - Label changes: update `label_ids` and the derived flags. Changes to any
     field that still has an unsent outbox row for that message are skipped.
   - Then advance `history_id`.
3. **Import one page** of the 12-month backfill (`messages.list` with
   `before:` and `after:`, 100 per page) until it is done.
4. **Renew the push watch** when it expires within 24 hours (only if Pub/Sub
   is configured).

**Recovery.** If `history.list` answers 404 (the history is too old, about a
week, for example after the VM was off), re-list the last 30 days, reconcile
labels and presence by Gmail message id, then take a fresh `history_id` from
`users.getProfile`. Upserts are keyed on `(connection, provider_message_id)`,
so nothing is ever duplicated.

**Push (optional).** When `GMAIL_PUBSUB_TOPIC` is set, `users.watch` points the
mailbox at the topic. A new endpoint `POST /api/v1/mail/google/push/`:
- verifies the Pub/Sub push OIDC token (issuer, audience and service-account
  email from settings);
- reads `emailAddress` and `historyId`;
- sets `wake_at` on the matching connection;
- always answers 204 quickly;
- is rate-limited and is not CSRF-exempt beyond this one route.

Without Pub/Sub, the 60-second check alone stays correct.

**Rate limits and errors.**
- 429 and 5xx responses put *that* mailbox into exponential backoff (up to 15
  minutes), and other mailboxes carry on.
- `invalid_grant` marks the connection `error` with "Reconnect Google", and
  sync stops.
- Each tick's work for a mailbox is bounded: the outbox in full, history pages
  until done, one import page.

## 3. Actions back to Gmail (the outbox)

An action in Revenact updates the row at once (the screen never waits) and
writes a `MailOutbox` row. Each row holds: connection, message (or draft, or
label), op, payload, attempts, next attempt, status (pending, sent or failed),
the previous local values (for revert) and created_at.

| Revenact action | Gmail call |
|---|---|
| Open / mark unread | `messages.modify` −/+ `UNREAD` |
| Star / unstar | ± `STARRED` |
| Done (archive) / back to inbox | − / + `INBOX` |
| Delete / restore | `messages.trash` / `untrash` |
| Spam / not spam | + `SPAM` −`INBOX` / reverse |
| Apply / remove label | ± label id |
| Create label | `labels.create`; the local `MailLabel` takes the real id |
| Mute | none: Revenact-only |

- Actions on a conversation apply to every message in the thread, as Gmail
  does. Bulk actions use `messages.batchModify` (up to 1,000 ids).
- Consecutive rows for the same message are collapsed: reading and then
  unreading sends nothing.
- **Conflicts:** while a row is pending, incoming history for that message's
  affected fields is skipped (§2). Once the row is sent, Gmail is the truth.
  Otherwise the latest change wins.
- **Failure:** retry with backoff (about 30 s, 2 m, 10 m, 1 h, 6 h). After 5
  failures, or at once on 404 (the message is gone), mark the row `failed`,
  restore the previous local values and send the owner an in-app
  notification: "Couldn't archive in Gmail: the message no longer exists".

**Drafts, both ways.**
- A Revenact draft (written by a person, or an agent `draft.reply` whose
  source mail is in the owner's own mailbox) is created as a real Gmail draft
  (`drafts.create`, with `threadId` for replies). Edits call `drafts.update`
  and discards call `drafts.delete`, all through the outbox.
- Gmail drafts arrive by history (DRAFT label). They appear in Drafts and can
  be edited and sent here.
- Another approver of an agent draft (someone up the chain or view-all) still
  sees it only in Revenact. It is in the owner's Gmail because the source mail
  is the owner's.
- **Sending** a Gmail draft uses `drafts.send`, inside the existing claimed /
  unconfirmed / superseded send states. A late or failed answer behaves
  exactly as it does today.

**Sending (new and reply).**
- MIME is built on the server and sent with `messages.send` or `drafts.send`.
- Replies and forwards set `threadId`, `In-Reply-To` and `References`, which
  fixes today's threading bug for Gmail.
- Reply, Reply all and Forward take CC and BCC.
- Attachments: uploaded files plus attachments forwarded from the original
  message, with a 25 MB total; larger sends are refused before sending.
- The Gmail signature and display name come from `settings.sendAs`, refreshed
  daily, and are added to the body.

**Out of scope:** schedule send, undo send, snooze, send-as aliases, Gmail
filters, vacation responder.

## 4. What people see

**Communications › Mail (`MailboxView`)**
- **Conversations:** the list groups messages by `thread_id`. The open view
  shows the whole thread in order, with older messages collapsed.
- **HTML:** shown inside a sandboxed iframe (no scripts, no same-origin).
  Remote images are blocked until "Show images" is clicked.
- **Labels:** Gmail user labels are listed in the sidebar under the existing
  folders, in their colours. A label menu applies or removes labels, and
  creates new ones.
- **Attachments:** chips (icon, name, size). Opening one previews or
  downloads it; the first open fetches the file from Gmail.
- **Bulk select:** archive, read/unread, label, delete.
- **Search:** searches the synced mail at once. A final row, "Search older
  mail in Gmail", runs the query live (`messages.list q=`). Results are shown
  without being stored; opening one stores it (and files it if it matches).
- **Compose:** a basic formatting editor (bold, italic, lists, links), To, CC,
  BCC, attachments, the signature added, and the customer suggested from the
  recipients (as today). Reply, Reply all and Forward come from the message.
- **Keyboard:** `e` archive, `r` reply, `a` reply all, `f` forward, `#`
  delete, `j`/`k` next and previous, `c` compose. Shortcuts are switched off
  while typing.
- The filed customer and the Copilot panel stay beside the conversation.
- **Failed outbox notices:** a quiet line on the message, plus the in-app
  notification.

**Settings › My mailbox**
- Shows: the address, Two-way (on/off), import progress, last synced, Push
  (on/off) and the paused reason.
- Buttons: Sync now, Reconnect, Disconnect. Disconnect explains the 30-day
  deletion of personal copies.
- The reconnect banner appears for read-only connections.
- Refusals are clear: wrong domain, no seat, workspace not enabled, and the
  Google "not a test user" error.

**Platform portal**
- A per-workspace "Google two-way mail" switch, audited.
- Connected Google mailboxes shown against Google's 100-test-user cap.

**Phone width:** the list and the conversation each fill the screen, with
Back to move between them.

## 5. Security, testing and delivery

**Security (SOC 2)**
- Tokens are encrypted at rest and decrypted only inside `MailboxConnection`.
  Disconnect revokes the token at Google.
- Narrow scopes (§1).
- HTML is sanitised on the server with an allow-list (`nh3`), then shown in
  the sandboxed iframe.
- Push webhook: OIDC verified, rate-limited, no data in the response.
- Audit events: connect, disconnect, reconnect, scope change, pause/resume,
  the portal switch, and attachment downloads of filed mail.
- Attachments: owner-only, or the filed record's visibility. Content type and
  size are checked. Downloads go through the authenticated route with
  `Content-Disposition: attachment` for anything that is not an image or a
  PDF.
- No mail content in logs.

**Testing**
- A fake Gmail client built from recorded API fixtures. It covers history
  pages and 404 recovery, 429 backoff, `invalid_grant`, batchModify, the
  drafts lifecycle, sendAs and attachments.
- Unit and integration tests for:
  - the gates (domain, seat, workspace switch, paused members);
  - the label→flag mapping;
  - outbox collapse, retry and revert;
  - skipping incoming changes while an outbox row is pending;
  - the import's slicing and its completion;
  - the threading headers;
  - the 25 MB limit;
  - the push token check;
  - the disconnect prune.
- Privacy tests: a manager never sees a report's unfiled mail, labels or
  attachments.
- Query-count ceilings on the list and thread endpoints.
- Frontend unit and integration tests for MailboxView (threads, labels, bulk,
  keyboard, attachments, compose).
- E2E journeys against the fake provider: connect, read, archive, label,
  reply, draft round trip.
- **One live check on a real test Gmail account before each merge.**

**Deliveries (each with backend + frontend PRs; backend merges first):**

1. **Sync engine.**
   - The gates and the portal switch; the new scopes and granted-scope
     tracking.
   - The `historyId` loop, push and the webhook; recovery.
   - The 12-month import; labels; HTML, CC/BCC and the attachment details.
   - The `sync_mail --loop` compose change; Settings › My mailbox upgraded.
2. **Actions.** The outbox and the action table above; conversation view;
   label sidebar and menu; bulk actions; attachment preview and download;
   keyboard shortcuts; failure notices.
3. **Writing.**
   - Drafts both ways, including agent drafts.
   - Threaded Reply, Reply all and Forward; attachments on send.
   - The signature; the formatting editor; "Search older mail in Gmail".

The product documents (PRD, TRD, UI/UX, App Flow, Schema, Plan) and
`docs/API_CONTRACTS.md` are updated in each delivery's PRs.

**Owner prerequisites before the first live check** (step-by-step
instructions come with the D1 plan):
- A Google Cloud project.
- The OAuth consent screen set to External / Testing, with the team added as
  test users.
- The Gmail API enabled.
- An OAuth client (web) with the local and prod redirect URIs.
- Optionally, a Pub/Sub topic with `gmail-api-push@system.gserviceaccount.com`
  as publisher, and a push subscription to `/api/v1/mail/google/push/`. This
  needs a public URL, so it can only be tested on prod or through a tunnel.
