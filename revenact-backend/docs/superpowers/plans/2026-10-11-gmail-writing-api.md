# Two-way Gmail, delivery 3 ("writing"): API contract

**Sources:**
- Spec: react-ts-app `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md`, §3 "Drafts, both ways" and "Sending (new and reply)", §4's D3 parts (the formatting editor, To/CC/BCC, attachments, the signature, the customer suggestion, Reply / Reply all / Forward, "Search older mail in Gmail", keyboard `a`/`f`/`c`), §5 "Deliveries 3".
- Delivery 1 contract: `docs/superpowers/plans/2026-10-10-gmail-sync-api.md`. Delivery 2 contract: `docs/superpowers/plans/2026-10-11-gmail-actions-api.md`. Both still hold unless this file says it supersedes them, by decision number.
- Code read for this contract: `services/mail/` (models, views, serializers, urls, actions, gates, gmail_sync, gmail_store, html, attachments, outbox, outbox_flush, loop, prune, sync `send_email`/`reply_to`/`store_message`/`file_message`/`match_parent`, `providers/base.py` `http_json`/`SendUnconfirmed`, `providers/google.py` `send`/`GmailSession`, `tests/gmail_fake.py`), `services/customers/models.py` (`ReplyDraft`, `Attachment`), `services/customers/drafts.py`, `services/customers/drafts_views.py` (the claimed / unconfirmed / superseded send), `services/customers/communications_views.py` (`EmailReplyView`), `services/customers/communications.py` (`_attach_drafts`), `services/customers/files.py` (`validate_upload`, `ALLOWED_TYPES`, `MAGIC`), `services/agents/actions/drafts.py` (`draft.reply` apply/undo), `services/campaigns/management/commands/deliver_pending.py` (the `sender` minute runner), `core/throttling.py`, `config/settings.py`, `docs/API_CONTRACTS.md` (`mail`, communications drafts), `docs/audit-events.md`, `docs/data-classification.md`; react-ts-app (`gmail2-fe`) `MailboxView.tsx` and `ComposeEmailModal.tsx` for today's Drafts folder and compose.
- Backend plan: `docs/superpowers/plans/2026-10-11-gmail-writing-backend.md` (to follow). Frontend plan: react-ts-app `docs/superpowers/plans/2026-10-11-gmail-writing-frontend.md` (to follow).

**Conventions** are delivery 1's and 2's:
- Every path is under `/api/v1/`. Bodies are JSON, except the attachment upload (multipart). Timestamps are ISO 8601 UTC.
- Every route here is `IsAuthenticated`.
- Mail errors use the drafts shape, `{"code": "...", "detail": "..."}`. Validation errors keep DRF's field shape.
- "Google connection" and "two-way" are D1's. "A draft" in this file is a `MailDraft` (§1) unless it says `ReplyDraft`.
- Recipients are `[[name, address], ...]`, the shape of `MailMessage.to` and `ReplyDraft.to`.

## Decisions made in this contract

The spec leaves these open, or the code forced them. Each one is the owner's to overrule.

1. **A new `MailDraft` model is the Gmail draft's Revenact side**, one row per draft, owner-only, in `services/mail`. `ReplyDraft` cannot hold person drafts: it requires a record and a source email (`reply_draft_on_exactly_one_record`, `reply_draft_source_matches_channel`), and its readers include the mailbox chain.
2. **The Drafts folder stays `MailMessage` rows.** Every draft has one `MailMessage` row with the `DRAFT` label (`MailDraft.message`). Until Gmail has created it, that row is a **placeholder** whose `provider_message_id` is `pending-draft:<MailDraft id>`, as D2 decision 21 keys a pending label. So a draft written here shows in Drafts, in its thread and in the summary count at once.
3. **An agent draft is one draft seen twice.** When a `draft.reply` email draft is applied and its source mail is in the owner's own two-way, live, unpaused Google mailbox, a linked `MailDraft` is made with it (`MailDraft.reply_draft`, one-to-one). Both rows describe the same message. Every write through either API updates both in one transaction. Otherwise the `ReplyDraft` stays Revenact-only for life, as today (no backfill when the mailbox later becomes two-way).
4. **Approvers still see only the `ReplyDraft`.** Its readers (the owner, plus the mailbox chain on a record they open) are unchanged. The `MailDraft`, its placeholder message and the Gmail draft are the owner's alone. `ReplyDraft`'s payload gains `mail_draft_id`, shown only to the owner.
5. **New draft ops: `draft_create`, `draft_update`, `draft_delete`. There is no `draft_send` op.** Sending is never retried by the outbox, because `drafts.send` and `messages.send` are not idempotent. It runs inline in the request under the existing claim, as today. This supersedes D2 §1's "D3 adds … `draft_send`".
6. **A draft row carries no body.** The MIME is built **at flush time** from the draft's current content, so collapsing keeps one live row per draft: create + update → create; update + update → update; create + delete → nothing is sent and both rows go; update + delete → delete.
7. **The flush order:** `label_create`, then draft rows, then `batchModify`, then trash/untrash. Draft rows come before label rows because a label row on a placeholder message waits for the draft to be created (its id is not real yet), as a row on a `pending:` label waits today (D2 decision 8).
8. **The conflict rule is: Revenact's unsent edit wins, otherwise Gmail is the truth, and editors are protected by a revision.**
   - While a draft has a `pending` or `sending` draft row, Gmail's version of that draft is skipped. The flush then overwrites Gmail's draft with Revenact's.
   - With no live row, an edit made in Gmail replaces the draft's content here and bumps `revision`.
   - Every PATCH and send carries the `revision` it was edited from. If it is stale, the answer is `409 DRAFT_CHANGED` with the current draft, so an open editor never silently overwrites a Gmail edit.
9. **A Gmail-side 404 on `drafts.update` recreates the draft** (`draft_create`), with no notice. The person's newest writing is never lost. A 404 on `drafts.delete` counts as done.
10. **A Revenact draft that fails to reach Gmail is not reverted.** It is the person's writing. It stays editable and sendable, with `gmail.state: "failed"` and a `sync_issue`. The owner gets one `mail_action_failed` notice. The next edit tries again.
11. **Discard marks the draft `discarded` and deletes the placeholder at once.** The `MailDraft` row lives until its `draft_delete` is sent, or at once when Gmail never had it. So a delete whose create is still in flight still knows which Gmail draft to delete.
12. **Delete in Drafts discards only the draft** (owner decision, 2026-10-11). The frontend calls `DELETE mail/drafts/<draft_id>/` (one) or `POST mail/drafts/discard/` (bulk), never the thread `trashed: true` PATCH. Message and thread actions do not touch drafts (decision 13).
13. **D2 actions skip drafts.**
    - Thread expansion (thread PATCH, bulk `thread_of`) leaves out messages that are a live draft's.
    - A message PATCH or a bulk `message_ids` naming a draft's message is `409 IS_DRAFT`.
    - This amends D2 decision 9.
14. **Drafts may be written while the mailbox is paused.** Their rows wait, as rows pending at a pause do (D2 decision 11), and flush on resume. Sending through a paused mailbox stays `409 MAILBOX_PAUSED` (D1 decision 24). This is a deliberate exception to D2 decision 11's "nothing is queued": refusing a draft save would lose writing.
15. **Read-only (legacy) Google, Outlook and IMAP have no `MailDraft`.**
    - The new routes answer `409 TWO_WAY_OFF` for read-only Google, and `400 GMAIL_ONLY` for Outlook and IMAP.
    - Today's routes keep their shapes and paths for every provider: `customers/<id>/emails/send/`, the account variant, `mail/messages/<id>/reply/`, `communications/emails/<id>/reply/` and `communications/drafts/<id>/send/` for unlinked drafts. They ignore unknown fields, as DRF does today.
16. **Threading is fixed for every Gmail send, the old routes included.**
    - A send answering a message in the sender's own Google mailbox sets `threadId`, plus `In-Reply-To` = the original's `rfc_message_id` and `References` = the original's `references` + that id.
    - A filed `Email` from someone else's mailbox (a manager answering in the chain) gets the headers but no `threadId`: Gmail thread ids are per mailbox.
    - `send_email(answering=…)` resolves the headers through `Email.mail_message`, no longer through `provider_message_id`, which is a Gmail id rather than a Message-ID.
17. **The signature is placed into the body when the draft is made**, not appended at send.
    - The compose prefill and every new draft put the signature below the person's text and above any quote, as Gmail does: `<div data-revenact-signature>…</div>` in HTML, and `-- \n…` in the text.
    - It is then ordinary, editable content, and a Gmail draft that already carries a signature never gets a second one.
    - An agent draft's linked `MailDraft` gets it on creation.
    - The old routes add no signature (unchanged).
18. **The send-as name and signature are stored on `MailboxConnection`**: `send_as_name`, `signature_html` (nh3-sanitised) and `send_as_synced_at`.
    - They are refreshed by the tick when older than `MAIL_SEND_AS_REFRESH_HOURS` (24), from `settings.sendAs.list`'s primary entry.
    - `From` is `"<send_as_name or display_name or user.name>" <address>`.
    - There is no signature endpoint: the compose prefill carries it.
19. **MIME and transport.**
    - The MIME is `multipart/mixed` holding a `multipart/alternative` (text/plain, text/html) plus the attachments. A forward wraps the html in `multipart/related` with the original's inline parts that its quote references by `cid:`.
    - Every Gmail write that carries MIME (`drafts.create`, `drafts.update`, `drafts.send`, `messages.send`) uses Google's **upload** endpoint (`/upload/gmail/v1/users/me/…?uploadType=multipart`, same host), whatever the size. JSON `raw` is limited to a few MB, and one code path is simpler than two.
    - `providers/base.py` gains `http_upload`, under the same host allow-list.
20. **The 25 MB limit is the decoded total:** every attachment's bytes plus the html and text bodies, at most `MAIL_SEND_MAX_BYTES` (26,214,400).
    - An upload that would pass it is `413 DRAFT_TOO_LARGE`. A send over it (for example, a draft that grew in Gmail) is `413 MESSAGE_TOO_LARGE`, before the claim.
    - Base64 makes the wire size about 34 MB, under Gmail's 35 MB API limit. The backend plan's live check confirms Gmail accepts a 25 MB-decoded message; if not, the setting comes down.
21. **Uploads follow the existing allow-list.** The checks are `customers.files.validate_upload`: the type list, the magic bytes, `ATTACHMENT_MAX_BYTES` per file. A zip is refused, as it is in the Files tab. Forwarded originals are not type-checked: they are forwarded as received. There is no virus scanning anywhere in the codebase, and D3 adds none.
22. **Every part a send needs is cached before the claim.** A Gmail-held or forwarded part not yet fetched is fetched first, through D2's `attachments.fetch`. A failure refuses the send before anything is claimed. After a send, the sent row's attachment rows are the draft's (already cached), plus copies of the forwarded files (`part_id = "sent:<n>"`). The sent copy's attachments therefore never need Gmail again, and no extra Gmail call is made.
23. **The sent copy is the draft's own message row.** After `drafts.send` or `messages.send` answers, the placeholder or draft row takes the returned id, labels and content. If history already stored that id, the draft's row is deleted and the stored row is used. Filing is `get_or_create` on `(mailbox, provider_message_id)`, so a send and a history pass racing never file twice. History then finds a held id and only relabels it (D1).
24. **The sent message's `rfc_message_id` is read back**, best effort, with one `messages.get?format=metadata&metadataHeaders=Message-ID`. Gmail may replace a client's Message-ID, so Revenact sets none. Without it a later reply still threads by `threadId`.
25. **Filing is the draft's `record`.**
    - A reply defaults to the source's filed record. A new message or forward defaults to the suggestion: `match_parent` on the recipients, kept only when the owner may open it. The person may change it or clear it.
    - Until the person sets it, `record` follows the suggestion as recipients change.
    - An agent draft's record is fixed.
    - A cleared record sends unfiled, and history never files it later (the id is held).
26. **Gmail drafts are mapped by `drafts.list`, not by history.** History names messages, not drafts, and every Gmail edit replaces the draft's message id.
    - A tick that saw any message gain or lose `DRAFT`, or a deleted id that was a draft's, runs one `drafts.list` (all pages) and reconciles. So does the first tick after the import finishes.
    - The reconcile creates a `MailDraft` for each unknown Gmail draft, moves known ones to their new message, and settles vanished ones (decision 27).
    - Drafts with a live draft row are skipped (decision 8).
27. **A draft that vanished from Gmail was sent there if its message is now `SENT`**, else it was discarded.
    - The draft's last known message id is checked first. If it is not held, the fallback is any `SENT` message from the owner stored in the draft's thread since its last change.
    - Sent in Gmail: the `MailDraft` becomes `sent`. A linked `ReplyDraft` is marked sent, `sent_by` the owner, `sent_email` the filed copy, audited `reply_draft.sent {in: "gmail"}`.
    - Discarded in Gmail: both go, audited `reply_draft.discarded {in: "gmail"}`.
    - The live check confirms whether Gmail keeps the message id on send.
28. **"Search older mail in Gmail" is unbounded and marks what is held.**
    - It runs the person's `q` live (`messages.list`, `includeSpamTrash=false`, `-in:chats` appended), 20 a page, each with one `format=metadata` read.
    - A result Revenact already holds carries its `message_id`, so the frontend opens the stored copy.
    - Nothing is stored until a result is opened. Opening stores only that message, not its thread, and files it as `store_gmail` does. Filed mail older than 30 days is classified by the nightly pass (D1 decision 17).
29. **Sends write `mailbox.reply` (reply, reply all) or the new `mailbox.sent` (new, forward)**, with `cc`, `bcc_count`, `attachments` and `bytes` added to today's `to` and `subject`. Drafts written by a person are personal and not audited. A linked agent draft keeps every `reply_draft.*` event.
30. **No draft list route.** The Drafts folder is `mail/messages/?folder=drafts` (D1), and every message row gains `draft` (§2). `GET mail/drafts/<id>/` is the editor's read.
31. **A linked agent draft's recipients follow the mailbox editor.** `mail/drafts/<id>/` PATCH may change to, cc and bcc, and `ReplyDraft.to` mirrors `to`. The Communications PATCH stays `{body, subject}`. Its text rewrites the html: paragraphs from the text, with the signature block kept. The last editor's form wins. This supersedes "Recipients are fixed" for linked drafts only.

### Spec against the code: mismatches found

- **"A Revenact draft (written by a person …)" has no model.** `ReplyDraft` is agent-only and requires a record and a source. Persons never had drafts (decision 1).
- **"Gmail drafts arrive by history (DRAFT label)"** gives message ids only. The draft id, which `drafts.update`, `drafts.send` and `drafts.delete` need, comes from `drafts.list` (decision 26).
- **The "minute runner"** (`sender`, `deliver_pending`) finishes campaign and survey sends and Work digests. It never touches reply drafts. A draft send has always run inline in the request, and stays so. An unconfirmed send is settled only by its owner (confirm-sent, reopen), as today.
- **"The Gmail signature … added to the body"** is placed at draft time, not appended at send (decision 17).
- **"The customer suggested from the recipients (as today)"**: there is no suggestion today. Compose exists only on a record page (`ComposeEmailModal`, record fixed), and filing matches only incoming and synced mail (`file_message`). D3 adds `suggested_record` from `match_parent` (decision 25).
- **Today's Gmail replies never thread.** `send_email` sets `In-Reply-To` only when `provider_message_id` looks like a Message-ID, which a Gmail id never does, and it passes no `threadId` (decision 16).
- **`GoogleProvider.send` posts JSON `raw`**, which cannot carry 25 MB (decision 19).
- **`MailMessage` stores no `Reply-To`.** Reply and Reply all must honour it, so D3 adds `reply_to`. Rows stored before D3 fall back to `From`.
- **D1's reconcile deletes rows not refreshed since it began.** It must exclude placeholders (`pending-draft:` ids), or it would delete drafts that Gmail has not created yet.
- **The D2 Drafts folder trashes the conversation on Delete** (`MailboxView` `act({trashed: true})`). The owner's decision makes it a draft discard (decision 12).
- **D2's Drafts folder lists agent drafts (`AgentDraftsList`) above the mailbox's.** A linked agent draft would show twice. The frontend hides a `ReplyDraft` whose `mail_draft_id` is set, and shows it once as the mailbox row, with `draft.agent` for the badge.
- **The spec's 25 MB is Gmail's UI limit on attachments.** The API counts the encoded message (35 MB). D3 counts the decoded total (decision 20).
- **Upload types:** the spec asks for no type rule. The codebase's single upload rule is a closed allow-list, so D3 uses it (decision 21).
- **`GmailSession.list_messages` always sets `includeSpamTrash=true`** (the import needs it). The search passes `false`.
- **`mail/messages/<id>/reply/`'s two-way read-mark** already goes through the outbox (D2 decision 25). Unchanged.

## 1. Storage

### `MailDraft` (new, `services/mail/models.py`)

| Field | Type | Notes |
|---|---|---|
| `connection` | FK `MailboxConnection`, CASCADE, `related_name="drafts"` | Always a Google two-way connection when made |
| `owner` | FK user, CASCADE | The connection's user; every query scopes on it |
| `organisation` | FK `Organisation`, CASCADE | |
| `message` | OneToOne `MailMessage`, SET_NULL, null, `related_name="draft"` | The `DRAFT` row (placeholder until created); after a send, the sent row |
| `kind` | `CharField(9)`: `new`, `reply`, `reply_all`, `forward` | |
| `source` | FK `MailMessage`, SET_NULL, null, `related_name="+"` | What a reply or forward answers; null for `new` |
| `thread_id` | `CharField(255, blank=True)` | Gmail `threadId` sent with every create/update/send; the source's for replies and forwards |
| `in_reply_to` | `CharField(998, blank=True)` | |
| `references` | `TextField(blank=True)` | |
| `to`, `cc`, `bcc` | `JSONField(default=list)` | `[[name, address]]` |
| `subject` | `CharField(255, blank=True)` | |
| `html` | `TextField(blank=True)` | Sanitised at every write (§3) |
| `text` | `TextField(blank=True)` | Derived from `html` at every write; never taken from the client |
| `forwarded` | `JSONField(default=list)` | `MailAttachment` ids on `source` kept for the forward |
| `customer`, `account` | FK, SET_NULL, null | The record it files on (at most one) |
| `record_chosen` | `BooleanField(default=False)` | The person set the record, so it stops following the suggestion |
| `reply_draft` | OneToOne `customers.ReplyDraft`, CASCADE, null, `related_name="mail_draft"` | The linked agent draft |
| `gmail_draft_id` | `CharField(255, blank=True)` | `""` until `drafts.create` answers |
| `gmail_message_id` | `CharField(255, blank=True)` | The draft's message in Gmail, as last known |
| `gmail_state` | `CharField(8)`: `local`, `saving`, `saved`, `failed` | Derived on write: `saving` while a draft row is live |
| `revision` | `PositiveIntegerField(default=1)` | +1 on every content change, from here or Gmail |
| `status` | `CharField(9)`: `open`, `sending` (internal), `sent`, `discarded` (internal) | |
| `sent_at` | `DateTimeField(null=True)` | |
| `sent_email` | FK `customers.Email`, SET_NULL, null | The filed copy |
| `created_at`, `updated_at` | auto | `updated_at` is the claim's stamp while `sending`, as on `ReplyDraft` |

**Constraints and indexes:**
- `UniqueConstraint(fields=["connection", "gmail_draft_id"], condition=~Q(gmail_draft_id=""), name="mail_draft_once_per_mailbox")`.
- `CheckConstraint`: at most one of `customer`, `account`.
- `Index(fields=["owner", "status"])`.

`__str__` is `draft <pk>`, never a subject.

### `MailOutbox` changes

| Change | Notes |
|---|---|
| `Op` gains `draft_create`, `draft_update`, `draft_delete` | Verbs "save the draft", "save the draft", "delete the draft" |
| `draft` FK `MailDraft`, CASCADE, null, `related_name="outbox"` | Draft ops only |
| `payload` for `draft_delete` | `{"gmail_draft_id": "r-123…"}`, written when the id is known |
| `Reason` gains `too_large` | Gmail answered 413 |
| The `mail_outbox_row_shape` check | `label_create`: label only. Draft ops: draft only. Every other op: message only |
| `UniqueConstraint(fields=["draft"], condition=Q(status="pending") & Q(op__in=[draft ops]), name="mail_outbox_one_pending_per_draft")` | Decision 6 |

### `MailboxConnection` gains

| Field | Type | Notes |
|---|---|---|
| `send_as_name` | `CharField(150, blank=True)` | `sendAs.displayName` |
| `signature_html` | `TextField(blank=True)` | `sendAs.signature`, through `html.sanitise` |
| `send_as_synced_at` | `DateTimeField(null=True)` | |

### `MailMessage` gains

| Field | Type | Notes |
|---|---|---|
| `reply_to` | `JSONField(default=list)` | The `Reply-To` header, `[[name, address]]`; Gmail rows from D3 on |

## 2. Reads

### Message rows gain `draft`

On `mail/messages/`, the thread list's rows, the message detail and the thread detail's messages:

```json
"draft": {"id": 55, "agent": "cs", "reply_draft_id": 7}
```

It is `null` for a message that is not a live draft (`open` or `sending`). `agent` and `reply_draft_id` are `null` for a person's draft. It is loaded with a `select_related("draft")` join, so no query is added (§8).

### `GET /api/v1/mail/drafts/<id>/`

Owner-only. Anyone else gets 404, and so does a `discarded` draft.

```json
{
  "id": 55,
  "kind": "reply_all",
  "status": "open",
  "sending": null,
  "revision": 4,
  "message_id": 9102,
  "thread_id": "18c2f0a9b1d4e7a3",
  "source": {"message_id": 9012, "subject": "Renewal terms", "from": {"name": "Ann Lee", "address": "ann@pizzahut.com"}, "sent_at": "2026-10-11T08:42:10Z"},
  "from": {"name": "Dana Ruiz", "address": "dana@doughco.com"},
  "to": [["Ann Lee", "ann@pizzahut.com"]],
  "cc": [["", "ops@pizzahut.com"]],
  "bcc": [],
  "subject": "Re: Renewal terms",
  "html": "<p>Works for us.</p><div data-revenact-signature>Dana Ruiz<br>Dough Co</div><div class=\"gmail_quote\">…</div>",
  "text": "Works for us.\n\n-- \nDana Ruiz\nDough Co\n\nOn 11 Oct 2026, Ann Lee <ann@pizzahut.com> wrote:\n> …",
  "attachments": [
    {"id": 61, "filename": "Quote v2.pdf", "mime_type": "application/pdf", "size": 182311, "origin": "upload", "download_url": "/api/v1/mail/attachments/61/download/"},
    {"id": 31, "filename": "Renewal quote.pdf", "mime_type": "application/pdf", "size": 90112, "origin": "forward", "download_url": "/api/v1/mail/attachments/31/download/"}
  ],
  "total_bytes": 274630,
  "max_bytes": 26214400,
  "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
  "suggested_record": {"kind": "customer", "id": 2, "name": "Dough Co"},
  "record_chosen": false,
  "gmail": {"state": "saved"},
  "sync_issue": null,
  "agent": null,
  "reply_draft_id": null,
  "created_at": "2026-10-11T09:01:00Z",
  "updated_at": "2026-10-11T09:03:12Z",
  "sent_at": null,
  "can_resolve": false
}
```

| Field | Meaning |
|---|---|
| `status` | `open` or `sent`. `sending` reads `sent` with `sent_at: null`, as `ReplyDraft` does |
| `sending` | `null`, `"pending"` (claimed less than `UNCONFIRMED_AFTER`, 10 minutes, ago) or `"unconfirmed"` |
| `message_id` | The draft's `MailMessage` (the Drafts folder row) |
| `attachments[].origin` | `upload` (added here), `gmail` (on the Gmail draft), `forward` (kept from `source`) |
| `total_bytes` | Decision 20's total, from declared sizes |
| `record`, `suggested_record` | `{kind: customer \| account, id, name}` or `null`; only records the owner may open |
| `gmail.state` | `local` (not in Gmail and nothing queued), `saving`, `saved`, `failed` |
| `sync_issue` | The newest failed draft row's sentence (§6), or `null` |
| `agent`, `reply_draft_id` | Set on a linked agent draft |
| `can_resolve` | `sending == "unconfirmed"` |

### `GET /api/v1/mail/compose/?kind=&message=`

The prefill for an editor that has not saved yet. **Nothing is stored and nothing goes to Gmail.** `kind` is one of `new reply reply_all forward`. `message` is required for the last three, and must be one of the caller's own messages that is not a draft.

```json
{
  "kind": "reply_all",
  "source_message_id": 9012,
  "from": {"name": "Dana Ruiz", "address": "dana@doughco.com"},
  "to": [["Ann Lee", "ann@pizzahut.com"]],
  "cc": [["", "ops@pizzahut.com"]],
  "bcc": [],
  "subject": "Re: Renewal terms",
  "html": "<p></p><div data-revenact-signature>…</div><div class=\"gmail_quote\">…</div>",
  "signature_html": "Dana Ruiz<br>Dough Co",
  "forwarded": [],
  "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
  "suggested_record": {"kind": "customer", "id": 2, "name": "Dough Co"}
}
```

**How the fields are filled:**

| `kind` | `to` | `cc` | `subject` | Body below the signature |
|---|---|---|---|---|
| `new` | `[]` | `[]` | `""` | none |
| `reply` | the original's `reply_to`, else its `from`. If the person sent the original: its `to` | `[]` | `Re: ` + the subject, unless it already starts with `re:` (case-insensitive) | `<div class="gmail_quote">On <date>, <name> <address> wrote:<blockquote>…</blockquote></div>` |
| `reply_all` | as `reply`, plus the original's `to` | the original's `cc` | as `reply` | as `reply` |
| `forward` | `[]` | `[]` | `Fwd: ` + the subject, unless it starts with `fwd:` or `fw:` | `---------- Forwarded message ---------` with From, Date, Subject, To and Cc, then the original's html (or its escaped text) |

- The caller's own address, and its send-as address, are taken out of `to` and `cc`. Duplicates are removed case-insensitively, with `to` winning over `cc`.
- `forwarded` lists the original's non-inline attachments, in the `attachments[]` shape with `origin: "forward"`, all kept by default.
- `record` is the source's filed record for a reply, otherwise the suggestion.
- **Amendment (2026-10-11, controller):** the prefill also carries `total_bytes` (the forwarded files plus the html and its text; no files for a fresh compose) and `max_bytes` (`MAIL_SEND_MAX_BYTES`, 26,214,400), and the forward block is wrapped in `<div class="gmail_quote">…</div>` like the reply quote, so the editor folds from the first `gmail_quote`.

**Answers:**
- `200` as above.
- `400 {"kind": ["Choose new, reply, reply_all or forward."]}`, `400 {"message": ["Choose a message to answer."]}`.
- `404` for a message that is not the caller's.
- `409 IS_DRAFT` for a draft's message.
- The connection checks of §3 (`GMAIL_ONLY`, `NO_MAILBOX`, `TWO_WAY_OFF`). `MAILBOX_PAUSED` does **not** refuse a prefill (decision 14).

## 3. Drafts

### Writes: shared rules

**Content fields**, accepted by create, PATCH and send:

| Field | Rule |
|---|---|
| `to`, `cc`, `bcc` | Lists of `[name, address]` pairs or bare address strings. Each address must be valid. At most `MAIL_SEND_MAX_RECIPIENTS` (100) across all three. Lower-cased, and de-duplicated across the fields (to, then cc, then bcc) |
| `subject` | ≤ 255 characters |
| `html` | Sanitised with D1's nh3 policy (`services/mail/html.sanitise`), so `data:` images and scripts go. A sanitised result over `MAIL_HTML_MAX_BYTES` is `400 {"html": ["This message is too long."]}`, never silently emptied. `text` is derived from it |
| `forwarded` | `forward` only: a subset of the source's non-inline attachment ids |
| `record` | `{"kind": "customer" \| "account", "id": n}` or `null`. It must be a record the owner may open (`get_visible_customer` / `get_visible_account`). Setting it, `null` included, sets `record_chosen` |
| `revision` | **Required** on PATCH and on a send that carries content. It is the revision the editor loaded |

- A linked agent draft refuses a `record` change: `400 {"record": ["An agent draft stays on its record."]}`.
- Nothing else is accepted: an unknown field is ignored.

**The connection checks** run in this order, after the draft or message is found (404 first). The first failure is the answer.

| # | Check | Status | `code` |
|---|---|---|---|
| 1 | Outlook or IMAP | 400 | `GMAIL_ONLY`, "Only Gmail mailboxes have this." |
| 2 | Google, disconnected | 409 | `NO_MAILBOX`, "This message's mailbox is no longer connected." |
| 3 | Google, not two-way | 409 | `TWO_WAY_OFF` with `needs_reconnect: true` (D2) |
| 4 | Google, paused | 409 | `MAILBOX_PAUSED` + `paused_reason`. **Send only**. Drafts may be written while paused (decision 14) |

**Locks**, in this order (they extend D2's "messages, then connection, then outbox"):
1. the `ReplyDraft` (when linked);
2. the `MailDraft`;
3. its `MailMessage` row (and `source`);
4. the connection (`lock_connection`);
5. the draft's outbox rows.

**Enqueueing** a content change, in the request's transaction:
- No Gmail draft yet:
  - a live `draft_create` row exists: nothing more is needed (it builds from current content);
  - otherwise a `draft_create` row is added.
- A Gmail draft exists:
  - a pending `draft_update` row exists: its `action_id` is refreshed and its `next_attempt_at` set to now;
  - otherwise a `draft_update` row is added.
- On commit, the mailbox is woken (D2 decision 24).
- `revision` +1, `gmail_state = "saving"`, and the placeholder or draft row's `to`, `cc`, `bcc`, `subject`, `snippet`, `body`, `html_body` and `sent_at` (now) are rewritten, so the Drafts folder shows it at once.
- A linked `ReplyDraft` gets `subject`, `body` (`text`, at most 20,000 characters) and `to`.

### `POST /api/v1/mail/drafts/`

```json
{"kind": "reply", "source_message_id": 9012, "html": "<p>Works for us.</p>", "revision": null}
```

- `kind` and, for anything but `new`, `source_message_id` are required.
- Content fields left out are taken from the prefill (§2). So `{"kind": "forward", "source_message_id": 9012}` makes a ready forward.
- **201** returns the draft (§2), with `revision: 1` and `gmail.state: "saving"`.
- It creates the placeholder `MailMessage` (`label_ids: ["DRAFT"]`, folder `drafts`, the source's `thread_id`) and a `draft_create` row.

**Errors:**
- the source's 404 / `IS_DRAFT`;
- `400` field errors, including `{"source_message_id": ["Choose a message to answer."]}`;
- the connection checks 1 to 3.

### `PATCH /api/v1/mail/drafts/<id>/`

Partial content plus `revision`. **200** returns the draft with the new `revision`.

| Status | Body | When |
|---|---|---|
| 404 | | Not the caller's, or discarded |
| 409 | `{"code": "ALREADY_SENT", "detail": "This draft has been sent."}` | `sending` or `sent` |
| 409 | `{"code": "DRAFT_CHANGED", "detail": "This draft changed in Gmail. Here is the newest version.", "draft": {…}}` | `revision` is not the current one (decision 8) |
| 400 | field errors; `{"revision": ["Send the revision you edited."]}` | |
| 409 | `NO_MAILBOX`, `TWO_WAY_OFF`; 400 `GMAIL_ONLY` | Connection checks 1 to 3 |

A PATCH that changes nothing answers 200 and enqueues nothing.

### `DELETE /api/v1/mail/drafts/<id>/`: discard (owner decision)

**204**. The draft is discarded, its Gmail draft deleted, and nothing else is touched: the conversation, the source and the other messages stay where they are.

1. `status = "discarded"`, and the placeholder or draft `MailMessage` row is deleted, so it leaves Drafts and the thread at once.
2. Live draft rows:
   - a pending `draft_create` (not sent): deleted, nothing goes to Gmail, and the `MailDraft` row is deleted now;
   - otherwise, one `draft_delete` row (pending `draft_update` rows collapse into it).
3. A linked `ReplyDraft` is deleted, audited `reply_draft.discarded` (as today).

**Errors:** 404; `409 ALREADY_SENT`; `400 GMAIL_ONLY`; `409 NO_MAILBOX`.
- `409 NO_MAILBOX`, for a disconnected mailbox, applies only to a draft Gmail holds. A local-only draft is discarded anyway.
- A read-only mailbox cannot have drafts.
- Discarding while paused is allowed; its row waits.

### `POST /api/v1/mail/drafts/discard/`: bulk discard (the Drafts folder's bulk Delete)

`{"ids": [55, 56]}`, 1 to 100 draft ids. All or nothing, as D2's bulk: an id that is not the caller's open draft answers `404` for the whole request, naming no id. **200** `{"discarded": 2}`.

### `ReplyDraft` changes (`/communications/drafts/`)

- Every payload gains `mail_draft_id`, which is the linked `MailDraft` id for its owner and `null` for everyone else.
- `PATCH`, `DELETE`, `send/`, `confirm-sent/` and `reopen/` on a linked draft act on both rows in one transaction (decision 3).
- Shapes, codes and audit events are unchanged, except:
  - `send/` on a linked draft goes through §4's Gmail path. It may also answer §4's new codes: `MESSAGE_TOO_LARGE`, `DRAFT_GONE`, `GMAIL_BUSY`, `ATTACHMENT_UNAVAILABLE`.
  - The answer stays `{"draft", "email"}`.
- `apply` (the agent action) makes the linked `MailDraft` when decision 3 allows it.
  - The `html` is the text in paragraphs, plus the signature.
  - `kind` is `reply`, `source` is `Email.mail_message`, and `thread_id` and the headers come from that message.
- `undo` discards the `MailDraft` too.

### Attachments

#### `POST /api/v1/mail/drafts/<id>/attachments/` (multipart)

The form field is `file`. It is throttled `mail_draft_upload` (`60/min` per user).

1. `customers.files.validate_upload`: the type allow-list, the magic bytes, `ATTACHMENT_MAX_BYTES` (25 MB) per file, the safe name.
2. At most `MAIL_DRAFT_MAX_ATTACHMENTS` (25) on the draft.
3. The draft's `total_bytes` plus this file must stay ≤ `MAIL_SEND_MAX_BYTES`.
4. The file is stored through the default storage at `mail_attachment_path` (D2) as a `MailAttachment` on the draft's message:
   - `part_id = "upload:<uuid>"`;
   - `fetched_at = now`;
   - `is_inline = false`.
5. The change is enqueued (shared rules).

**201** returns the attachment row (§2 shape), plus the draft's new `revision` and `total_bytes`:

```json
{"attachment": {"id": 61, "filename": "Quote v2.pdf", "mime_type": "application/pdf", "size": 182311, "origin": "upload", "download_url": "/api/v1/mail/attachments/61/download/"}, "revision": 5, "total_bytes": 274630}
```

| Status | Body |
|---|---|
| 400 | `{"file": ["Choose a file."]}`; `{"file": ["<validate_upload's sentence>"]}` (type, empty, magic, per-file size) |
| 400 | `{"code": "TOO_MANY_ATTACHMENTS", "detail": "A message can carry 25 files."}` |
| 413 | `{"code": "DRAFT_TOO_LARGE", "detail": "Attachments are limited to 25 MB in total."}` |
| 404, 409 `ALREADY_SENT`, the connection checks 1 to 3 | as PATCH |

The upload takes no `revision`: adding a file never conflicts. A Gmail edit made meanwhile is overwritten by the flush (decision 8).

#### `DELETE /api/v1/mail/drafts/<id>/attachments/<attachment_id>/`

- **200** `{"revision", "total_bytes"}`.
- An `upload` or `gmail` part is deleted. Its cached file goes with it (D2 decision 32).
- A `forward` part is removed from `forwarded`. The source's attachment is not touched.
- 404 for a part that is not on this draft.

#### Downloads

A draft's attachments are served by D2's `mail/attachments/<id>/download/`, owner-only (a draft's message is never filed).

## 4. Sending

### `POST /api/v1/mail/drafts/<id>/send/`

The body is optional content plus `revision`, saved first under the PATCH rules. The order of work:

| # | Step | Refusal |
|---|---|---|
| 1 | Find the draft; owner-only | 404 |
| 2 | `status == open` | 409 `ALREADY_SENT` |
| 3 | Apply the carried content; `revision` must match | 400 / 409 `DRAFT_CHANGED` |
| 4 | At least one recipient across to, cc and bcc | `400 {"to": ["Add someone to send it to."]}` |
| 5 | `record` still visible to the owner | `400 {"record": ["Choose a record you can open."]}` |
| 6 | `total_bytes ≤ MAIL_SEND_MAX_BYTES` | 413 `MESSAGE_TOO_LARGE`, "This message is over Gmail's 25 MB limit. Remove an attachment." |
| 7 | Connection checks 1 to 4 (paused included) | 400 / 409 |
| 8 | The mailbox is in backoff | 503 `GMAIL_BUSY` + `Retry-After` |
| 9 | Fetch every part not cached (decision 22) | 409 `ATTACHMENT_UNAVAILABLE` + `attachment_id`, "Couldn't get Renewal quote.pdf from Gmail. Remove it or try again."; 410 `ATTACHMENT_GONE` + `attachment_id` |
| 10 | **The claim** (below) | 409 `ALREADY_SENT` |
| 11 | Build the MIME (§4 "The message") and call Gmail, outside any transaction | below |
| 12 | Settle (conditional on the claim's stamp) | below |

The edit made in step 3 is kept whatever happens after it, as on `ReplyDraft` today.

**The claim (step 10)**, in one transaction under the §3 locks:
- `MailDraft` `open → sending`, `updated_at = claimed_at`, conditional on `status='open'`. A linked `ReplyDraft` is claimed in the same transaction with the same stamp, and is refused alike.
- The draft's **pending** draft rows are deleted: the send carries the content.
- A draft row still `sending` (a create or update in flight) is left alone. Its late answer meets a draft no longer `open`, and the flush deletes the Gmail draft it made (§5).
- It commits before Gmail is called, so a draft is never sent twice.

**The Gmail call (step 11):**
- **Gmail holds the draft** (`gmail_draft_id` set): `POST /upload/gmail/v1/users/me/drafts/send?uploadType=multipart` with `{"id": "<gmail_draft_id>", "message": {"threadId": "<thread_id>"}}` and the MIME. The MIME is built now, so pending edits go out too.
  - The backend plan's first task confirms that `drafts.send` sends the supplied message.
  - If it does not, the call is `drafts.update` and then `drafts.send {id}`, back to back in this request.
- **It does not** (local, failed, or a create still in flight): `POST /upload/gmail/v1/users/me/messages/send?uploadType=multipart` with `{"threadId": …}` (omitted for `new`) and the MIME.

**Settling:**

| Gmail says | Draft | Answer |
|---|---|---|
| 2xx `{id, threadId, labelIds}` | `sent`, `sent_at`; linked `ReplyDraft` `sent`, `sent_by`, `sent_email` | 200 (below) |
| `drafts.send` 404 (the Gmail draft is gone: sent or discarded in Gmail since) | reopened (`open`), `gmail_draft_id` cleared (`gmail.state: "local"`) | 409 `DRAFT_GONE`, "This draft was sent or discarded in Gmail. Check Sent before sending it again." |
| 429, `403 rateLimitExceeded` | reopened | 503 `GMAIL_BUSY` + `Retry-After` (the mailbox's backoff is unchanged) |
| A lost grant, `insufficientPermissions` | reopened; `pause_revoked` (D1) | 502 `{"code": "MAILBOX_REFUSED", "detail": "Your mailbox didn't accept the message. Try again."}` |
| 413 | reopened | 413 `MESSAGE_TOO_LARGE` |
| Other 4xx or 5xx, no connection made, the token refresh failing | reopened | 502 `MAILBOX_REFUSED` |
| Sent, and no answer came back (read timeout, dropped connection, broken answer: `TimeoutError`, `ConnectionError`, `http.client.HTTPException`) | left `sending` | 504 `SEND_UNCONFIRMED` (today's) |
| 2xx, but the draft moved on meanwhile (reopened, discarded) | untouched | 409 `SEND_SUPERSEDED` (today's); the sent copy is still stored, filed and audited |

- "Reopened" is the conditional `sending → open` on the claim's stamp, for both linked rows.
- The 502 keeps today's `detail` and adds a `code`.

**After a 2xx**, in one transaction (decision 23):
1. The draft's `MailMessage` row becomes the sent copy:
   - `provider_message_id` = the returned id (when another row already holds that id, this row is deleted and that one used);
   - `label_ids` = `labelIds`, then re-derived (folder `sent`);
   - `direction: sent`, `from`, `to`, `cc`, `bcc`, `subject`, `body`, `html_body`, `reply_to: []`, `has_attachments`, `sent_at` = now, `thread_id` = the returned `threadId`, `refreshed_at` = now.
2. Attachment rows: the draft's own parts stay (all cached by step 9). Each forwarded file is copied into storage as a new part (`part_id = "sent:<n>"`).
3. Filing: with a `record`, the `Email` is `get_or_create`d on `(mailbox, provider_message_id)`:
   - `to_addresses` is To + Cc, never Bcc (D1 decision 14);
   - `body` is the text;
   - `thread_id` is the Gmail thread;
   - it is classified as `send_email` does today.

   Without one, nothing is filed.
4. `MailDraft.message` stays on that row, and `sent_email` is the filed copy.
5. Audit (§7).

Then, best effort and outside the transaction, one `messages.get?format=metadata&metadataHeaders=Message-ID` to store `rfc_message_id` (decision 24). A failure is logged without content and ignored.

**200:**

```json
{
  "draft": {"…": "the draft, status sent"},
  "message": {"…": "the sent MailMessageDetail"},
  "email": {"id": 1203, "subject": "Re: Renewal terms", "sent_at": "2026-10-11T09:05:00Z", "thread_id": "18c2f0a9b1d4e7a3"}
}
```

`email` is `null` when nothing was filed.

### `POST /api/v1/mail/drafts/<id>/confirm-sent/` and `…/reopen/`

These are today's `_Unconfirmed` rules on a `MailDraft`: only for `sending` claimed at least `UNCONFIRMED_AFTER` ago, through one conditional UPDATE. A linked `ReplyDraft` is settled with it. The errors are today's: 404, `409 NOT_UNCONFIRMED`.
- **confirm-sent:** `sent`, `sent_at` = now, nothing filed. The placeholder or draft row is deleted, and the real sent message arrives by history.
- **reopen:** `open`, `gmail_draft_id` kept. If Gmail still has the draft, the next edit updates it.

A linked draft's `communications/drafts/<id>/confirm-sent|reopen/` does the same, with today's audit events.

### The message (MIME)

| Part | Content |
|---|---|
| Headers | `From: "<name>" <address>` (decision 18, RFC 2047 encoded); `To`, `Cc`, `Bcc` (Gmail strips `Bcc` on delivery; it is kept in the owner's copy); `Subject`; `Date`; for `reply`, `reply_all` and `forward` with a source: `In-Reply-To: <source.rfc_message_id>` and `References: <source.references> <source.rfc_message_id>` (folded, at most the last 20 ids). No `Message-ID` (decision 24) |
| Body | `multipart/alternative`: `text/plain; charset=utf-8` (`text`), then `text/html; charset=utf-8` (`html` in a minimal `<html><body>`) |
| Forward inline images | `multipart/related` around the html, holding the source's inline parts that the quoted html references by `cid:` |
| Attachments | `multipart/mixed` parts: uploads, the draft's Gmail parts, forwarded files. `Content-Disposition: attachment; filename*=UTF-8''…` and the stored MIME type |

A draft with no attachments and no related parts is just the `multipart/alternative`. `threadId` is honoured by Gmail only while the subject still matches the thread's. A reply whose subject the person rewrote starts a new Gmail thread, as it would in Gmail.

### Today's send routes on a Google mailbox

`customers/<id>/emails/send/`, the account route, `mail/messages/<id>/reply/`, `communications/emails/<id>/reply/` and an **unlinked** `ReplyDraft` send keep their bodies, answers and audit.

On a Google connection they now:
- build the MIME through the same builder: text only, no signature, no cc;
- send through the upload endpoint;
- carry decision 16's `threadId` and headers.

Outlook and IMAP are untouched, except that `send_email(answering=…)` finds the original's `rfc_message_id` through `Email.mail_message` before falling back to today's Message-ID-shaped `provider_message_id`, which helps IMAP too.

## 5. The outbox and sync, for drafts (non-HTTP)

### The flush (D2 §1, decision 7's order)

After `label_create` rows and before label rows, the due draft rows are claimed oldest first. There are at most `MAIL_OUTBOX_DRAFT_CALLS_PER_TICK` (50) calls. The rest go back to `pending`, uncounted.

| Op | Waits while | Gmail call | On 2xx |
|---|---|---|---|
| `draft_create` | | `POST /upload/…/drafts?uploadType=multipart` `{"message": {"threadId"}}` + the MIME built now | `gmail_draft_id`, `gmail_message_id` stored; the placeholder's `provider_message_id` becomes the message id; `gmail_state = saved` unless another row is live. **If the draft is no longer `open`** (sent or discarded meanwhile), a `draft_delete` for the new id is enqueued at once |
| `draft_update` | `gmail_draft_id` is blank (a create is in flight) | `PUT /upload/…/drafts/<id>?uploadType=multipart` `{"id", "message": {"threadId"}}` + the MIME built now | `gmail_message_id` and the row's `provider_message_id` become the new message id (Gmail replaces it on every update) |
| `draft_delete` | `payload.gmail_draft_id` is unknown and a create is in flight | `DELETE /drafts/<id>` | the `MailDraft` row is deleted |

- Before each call, every part the MIME needs is fetched into the cache (D2 `attachments.fetch`).
- A part Gmail no longer has fails the row with `not_found` and the sentence "Couldn't save this draft to Gmail: an attachment is no longer in Gmail."
- History is applied after the flush in the same tick. So the next tick's `messagesAdded` for the new id finds the row held, and `messagesDeleted` for the old id finds nothing.

**Outcomes** add these to D2's table:

| Gmail says | Row |
|---|---|
| `drafts.update` 404 | `sent` (moot); a `draft_create` is enqueued for the same draft (decision 9); no notice |
| `drafts.delete` 404 | `sent`; the `MailDraft` row is deleted |
| 413 | `failed`, `reason=too_large`, at once |
| Other 4xx, 5xx, rate limits, lost grant | D2's rules (counted, backoff, pause) |

**On failure** there is no content revert (decision 10):
- `gmail_state = "failed"`;
- one `mail_action_failed` notice per `(action_id, reason)`, linking `/communications?source=mailbox:google&folder=drafts&draft=<id>`;
- a failed `draft_create` also fails, uncounted, the label rows waiting on its placeholder (D2 decision 8);
- a failed `draft_delete` deletes the `MailDraft` row anyway. The Gmail draft is left, and the notice says "Couldn't delete the draft in Gmail".

### Incoming drafts (tick step 2, after history; decision 26)

The draft reconcile runs when this tick's history (or recovery or import page):
- stored or relabelled a message with `DRAFT` in its old or new labels;
- deleted an id that was a draft's `gmail_message_id`;
- or was the first tick after `import_done_at` was set.

It works like this:
1. `drafts.list` (`maxResults=500`, every page): `{id, message: {id, threadId}}` pairs.
2. For each Gmail draft:
   - **Known** (`gmail_draft_id`), with no live draft row, and the message id changed: point `MailDraft.message` at the held row for the new id (stored by history this tick). Take its content (`to`, `cc`, `bcc`, `subject`, `html_body` → `html`, `body` → `text`, its attachment parts as `gmail` parts, `references`). Bump `revision`. Mirror it into a linked `ReplyDraft`.
   - **Known, with a live row:** skipped (decision 8).
   - **Unknown:** create an `open` `MailDraft` on the held row:
     - `kind = reply` when the row's `references` names a held message in its thread, which becomes the `source`;
     - otherwise `kind = new`;
     - `record` is the suggestion.
3. Each `open` `MailDraft` with a `gmail_draft_id` that is not in the list and has no live row: decision 27, sent there or discarded there.
4. `sending` drafts are never settled by the reconcile. The owner confirms or reopens (spec: "behaves exactly as it does today").

### The send-as refresh (tick step, after labels)

When `send_as_synced_at` is null or older than `MAIL_SEND_AS_REFRESH_HOURS`:
- one `GET users/me/settings/sendAs`;
- take the entry with `isPrimary`, or else the one whose `sendAsEmail` is the address;
- store `send_as_name` and `signature_html` (sanitised), and stamp the time.

A failure is a D1 tick failure (backoff), as for any other call. It also runs on connect and reconnect.

### D1's reconcile and placeholders

The reconcile's final deletion leaves out every `provider_message_id` starting `pending-draft:`.

## 6. Search older mail in Gmail

### `GET /api/v1/mail/gmail/search/?q=&page_token=`

Throttled `mail_gmail_search` (`30/min` per user, shared with open). This is a live Gmail query: **nothing is stored**.

```json
{
  "results": [
    {
      "gmail_id": "17a0c3e1f2b4d5c6",
      "thread_id": "17a0c3e1f2b4d5c6",
      "subject": "2024 renewal",
      "from": {"name": "Ann Lee", "address": "ann@pizzahut.com"},
      "to": [["Dana Ruiz", "dana@doughco.com"]],
      "snippet": "Attached is last year's quote…",
      "sent_at": "2024-09-30T15:12:00Z",
      "has_attachments": true,
      "message_id": null
    }
  ],
  "next_page_token": "09812763519",
  "result_size_estimate": 41
}
```

- **The Gmail calls:**
  - `messages.list(q = "<q> -in:chats", maxResults = MAIL_GMAIL_SEARCH_PAGE_SIZE (20), pageToken, includeSpamTrash = false)`;
  - then, for each id, `messages.get(format=metadata, metadataHeaders=From,To,Subject,Date)`.

  A page costs about 105 quota units of Gmail's 250 per second per user.
- `message_id` is the held `MailMessage` id when Revenact already has it (one query for the page), else `null`.
- `has_attachments` is true when the metadata payload has a part with a filename.
- `snippet` is Gmail's.
- Results are in Gmail's order (newest first).

| Status | Body | When |
|---|---|---|
| 400 | `{"q": ["Type something to search for."]}` / `{"q": ["Keep the search under 500 characters."]}` | Blank / too long |
| 400 | `{"q": ["Gmail couldn't run that search."]}` | Gmail answered 400 (a bad operator, or an expired `page_token`) |
| 400 | `GMAIL_ONLY` | Outlook or IMAP |
| 409 | `NO_MAILBOX`, `MAILBOX_PAUSED` | Disconnected; paused (reading Gmail as the person stops while paused) |
| 503 | `GMAIL_BUSY` + `Retry-After` | The mailbox is in backoff, or Gmail answered 429/5xx (the mailbox's backoff is not changed) |
| 429 | | Throttled |

- A read-only (legacy) Google mailbox may search: `gmail.readonly` allows list and get.
- A lost grant pauses the mailbox (`pause_revoked`) and answers `409 MAILBOX_PAUSED`.
- `q` is never logged or audited.

### `POST /api/v1/mail/gmail/search/open/`

`{"gmail_id": "17a0c3e1f2b4d5c6"}`

- **Held:** 200, the message detail (D1 §6, with D2's and D3's fields).
- **Not held:** `messages.get(format=full)`, then `gmail_store.store_gmail`. It is filed when its folder is inbox or sent and it matches a record. The filing is classified only when within 30 days (D1 decision 17). Answers **201** with the message detail.
- **Gmail answers 404:** 404 `{"code": "NOT_IN_GMAIL", "detail": "This message is no longer in Gmail."}`.
- Otherwise the same refusals as search.

## 7. Privacy and audit

- **`MailDraft`, its placeholder, its attachments, the prefill, the search and the outbox are owner-only.** Every queryset scopes on `owner=request.user`. A manager, view-all holder, Leadership member or admin gets 404 on another person's draft, prefill source, upload or search open, and never sees `draft` on a message row they cannot read anyway.
- **Agent drafts:** `ReplyDraft` readers are unchanged (`readable_drafts`). Only its owner sees `mail_draft_id`. Another approver reads and approves in Revenact only, and never sees the Gmail draft, its cc/bcc or its attachments. Every write stays the owner's (`NOT_YOURS`).
- **Filed sends** follow today's rule: the filed `Email` is read by the owner and their chain on a record they may open (twice-filter). Bcc is never filed.
- **Privacy tests** (backend):
  - a manager gets 404 on a report's draft (GET, PATCH, send, discard, upload) and on `compose/?message=` of a report's message;
  - a chain approver reading a linked `ReplyDraft` gets `mail_draft_id: null`;
  - search open of a held id belonging to someone else is impossible: the id is resolved only within the caller's mailbox.

**Audit events** (`docs/audit-events.md`):

| Action | Where | Actor | Target | Metadata |
|---|---|---|---|---|
| `mailbox.sent` (new) | `MailDraftSendView` (kind `new`, `forward`) | user | MailMessage (the sent copy) | `kind`, `to`, `cc`, `bcc_count`, `subject`, `attachments` (count), `bytes`, `draft`, `email` (filed id or null) |
| `mailbox.reply` (extended) | as today, plus `MailDraftSendView` (kind `reply`, `reply_all`) | user | MailMessage or Email answered | today's `to`, `subject`, plus `cc`, `bcc_count`, `attachments`, `bytes` (zero on today's routes) |
| `reply_draft.sent` (extended) | as today; also the draft reconcile | user; system (none) when sent in Gmail | ReplyDraft | `email`; `in: "gmail"` when settled by the reconcile |
| `reply_draft.discarded` (extended) | as today; also `mail/drafts/` DELETE and bulk discard of a linked draft, and the draft reconcile | user; system (none) when discarded in Gmail | ReplyDraft | `in: "gmail"` from the reconcile |

`mailbox.sent` and `mailbox.reply` are written after Gmail accepted, even on `SEND_SUPERSEDED`, as today. Person drafts, uploads, the search and the prefill are not audited (personal, like D2's actions). No log line carries a subject, address, body, filename or query: only the connection id, a status and a reason.

## 8. Query-count ceilings (asserted with `assertNumQueries`, independent of recipients, attachments and page size)

| Endpoint | Ceiling |
|---|---|
| `GET mail/messages/`, `mail/threads/`, message and thread detail | D2's, unchanged (`draft` is joined) |
| `GET mail/drafts/<id>/` | 6: the draft (message, source, record, reply draft joined), its attachments, forwarded parts, the connection, the suggestion's match, `sync_issue` |
| `GET mail/compose/` | 6: the source (joined), its attachments, the connection, the suggestion's match (2), one spare |
| `POST mail/drafts/` | 14, plus §4's suggestion queries |
| `PATCH mail/drafts/<id>/` | 12 (locks, the write, the placeholder, the outbox collapse, the wake, a linked `ReplyDraft`) plus the response's reads |
| `DELETE mail/drafts/<id>/`, `POST mail/drafts/discard/` | 10 whatever the number of ids |
| Attachment upload / delete | 10 |
| `GET mail/gmail/search/` | 3: the connection, the page's held ids, one spare |
| `POST mail/drafts/<id>/send/` | Not asserted end to end (it classifies). The claim transaction is asserted at ≤ 10 |

## 9. Migrations, settings, documents

### Migrations

- `mail/0006_mail_drafts`:
  - `MailDraft`;
  - `MailOutbox.draft`, the new ops, the `too_large` reason, the rewritten `mail_outbox_row_shape` check and `mail_outbox_one_pending_per_draft`;
  - `MailboxConnection.send_as_name`, `signature_html` and `send_as_synced_at`;
  - `MailMessage.reply_to`.
- No `customers` migration: the link is on `MailDraft`. No `notifications` migration: `mail_action_failed` is reused.
- **Data migration:** none. Existing Gmail drafts are picked up by the first draft reconcile, which runs on the first tick after deploy (`import_done_at` set, or a `DRAFT` change). Existing open `ReplyDraft`s stay Revenact-only (decision 3).

### New settings

| Setting | Default | Meaning |
|---|---|---|
| `MAIL_SEND_MAX_BYTES` | `26214400` | Decision 20 |
| `MAIL_SEND_MAX_RECIPIENTS` | `100` | To + Cc + Bcc |
| `MAIL_DRAFT_MAX_ATTACHMENTS` | `25` | Per draft |
| `MAIL_SEND_AS_REFRESH_HOURS` | `24` | sendAs refresh |
| `MAIL_OUTBOX_DRAFT_CALLS_PER_TICK` | `50` | Draft calls per flush |
| `MAIL_SEND_TIMEOUT_SECONDS` | `120` | The upload calls' timeout (a 34 MB body) |
| `MAIL_GMAIL_SEARCH_PAGE_SIZE` | `20` | Results per page |
| `MAIL_DRAFT_SENT_RETENTION_DAYS` | `7` | `sent` `MailDraft` rows pruned nightly (`prune_outbox`'s pass); the sent message stays |
| `THROTTLE_MAIL_GMAIL_SEARCH` | `30/min` | Scope `mail_gmail_search` (`None` under test) |
| `THROTTLE_MAIL_DRAFT_UPLOAD` | `60/min` | Scope `mail_draft_upload` (`None` under test) |

`ATTACHMENT_MAX_BYTES` (25 MB per file) and `MAIL_HTML_MAX_BYTES` are reused.

**Operator check (revenact-infra):** the reverse proxy's request body limit must allow a 25 MB upload plus its multipart overhead (`client_max_body_size 30m` or equivalent).

### Documents updated in the D3 PRs

- `docs/API_CONTRACTS.md`:
  - the `mail` section: drafts (§3), sending (§4), the prefill, search, `draft` on rows, `IS_DRAFT` on actions, the Drafts folder's Delete, the threading fix on today's routes, and the Outlook/IMAP table (§10);
  - the communications drafts section: `mail_draft_id`, linked drafts, the new send codes, and recipients no longer fixed for linked drafts.
- `docs/audit-events.md`: §7's rows.
- `docs/data-classification.md`:
  - a `mail.MailDraft` row (owner-only, confidential: recipients, subject, body, attachments; `sent` rows pruned after 7 days);
  - the mailbox row gains `signature_html` and `send_as_name`;
  - the `ReplyDraft` row gains "a linked Gmail draft is the owner's alone".
- `docs/product/`:
  - `01-prd.md`: what D3 built;
  - `02-trd.md`: draft sync both ways, the draft reconcile, the MIME builder and upload transport, the send path, the search;
  - `05-backend-schema.md`: §1;
  - `06-implementation-plan.md`: the two-way Gmail round complete.
- `MailMessage`'s and `ReplyDraft`'s docstrings ("No provider can hold a draft" is no longer true for linked drafts).
- The frontend's, in the D3 frontend PR: react-ts-app `docs/03-ui-ux-design.md` and `docs/04-app-flow.md`:
  - the compose editor (bold, italic, lists, links), To/Cc/Bcc, attachments, signature, record suggestion;
  - Reply / Reply all / Forward;
  - autosave and `DRAFT_CHANGED`;
  - the Drafts folder's Delete;
  - search older mail;
  - keyboard `a`, `f`, `c`.

## 10. Outlook and IMAP

| Where | Outlook / IMAP |
|---|---|
| `mail/drafts/*`, `mail/compose/`, `mail/gmail/search/*` | `400 GMAIL_ONLY` |
| `draft` on message rows | always `null` |
| Today's send and reply routes | Unchanged: text body, `to` only, no cc/bcc/attachments/html/signature; unknown fields ignored. IMAP gains the `In-Reply-To` fix through `Email.mail_message` when the original's Message-ID is stored |
| `ReplyDraft` | Never linked: `mail_draft_id: null`; today's send path |

## 11. Frontend-only parts (no API)

- **The editor:** a basic rich-text editor producing `p`, `br`, `strong`/`b`, `em`/`i`, `ul`, `ol`, `li`, `a[href]` and `blockquote`, all inside the nh3 policy. No pasted images: `data:` is dropped by the server.
- **Autosave:** `POST mail/drafts/` on the first change, then `PATCH` with `revision`, debounced about 2 s.
  - On `DRAFT_CHANGED`, show "This draft changed in Gmail" and load the returned draft.
  - Closing an untouched compose stores nothing.
- **Keyboard:**
  - `r`: reply;
  - `a`: reply all;
  - `f`: forward (all from the open message, through `GET mail/compose/`);
  - `c`: new compose.

  Off while typing (D2's rule).
- **Drafts folder:**
  - opening a row with `draft` opens the editor on `mail/drafts/<draft.id>/`;
  - Delete and `#` call `DELETE mail/drafts/<id>/`, and bulk Delete calls `POST mail/drafts/discard/`;
  - the other bulk actions are hidden there;
  - a `ReplyDraft` with `mail_draft_id` is not listed again in `AgentDraftsList`.
- **Search older mail in Gmail:** the last row of the local search. Opening a result with `message_id` opens the held copy; otherwise it calls `open`.
- **Send states:** `SEND_UNCONFIRMED` and `can_resolve` show today's "It was sent / Reopen draft".

## 12. Not in D3

- Schedule send, undo send, snooze, send-as aliases (only the primary address sends), Gmail filters, the vacation responder: out of the round.
- Inline images in compose (pasted or uploaded into the body).
- Draft lists or drafts for Outlook and IMAP; any Outlook or IMAP write-back.
- Confidential mode, read receipts, templates (canned responses).
- Storing whole threads from a search open (only the opened message).
- Signature editing in Revenact (it is Gmail's, read-only here).
- A draft list route (the Drafts folder is the message list, decision 30).
- Automatic settling of an unconfirmed send (the owner settles it, as today).
