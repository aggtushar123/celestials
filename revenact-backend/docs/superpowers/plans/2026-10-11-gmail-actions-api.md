# Two-way Gmail, delivery 2 ("actions"): API contract

**Sources:**
- Spec: react-ts-app `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md`, §3 "Actions back to Gmail (the outbox)" without drafts and sending, §4's D2 parts (conversations, labels, attachments, bulk select, keyboard, failure notices), §5 "Deliveries 2".
- Delivery 1 contract: `docs/superpowers/plans/2026-10-10-gmail-sync-api.md`. Everything there still holds unless this file says it supersedes it, by decision number.
- Code read for this contract: `services/mail/` (models, views, serializers, urls, gates, gmail_sync, gmail_store, loop, prune, sync, visibility, `providers/google.py`, `tests/gmail_fake.py`), `services/customers/models.py` (`Attachment`, `ReplyDraft`), `services/customers/files.py`, `services/customers/views.py` (`_FileListView`, `FileDownloadView`, `_visible_attachment`), `services/customers/scoping.py` (`visible_children_q`, `customer_rollup_q`), `services/notifications/` (`Notification.Kind`, `realtime.notify`), `services/agents/actions/drafts.py` (only to keep room for D3), `core/throttling.py`, `docs/API_CONTRACTS.md` (`mail`, Files), `docs/audit-events.md`.
- Backend plan: `docs/superpowers/plans/2026-10-11-gmail-actions-backend.md` (to follow). Frontend plan: react-ts-app `docs/superpowers/plans/2026-10-11-gmail-actions-frontend.md` (to follow).

**Conventions** are delivery 1's:
- Every path is under `/api/v1/`. Bodies are JSON. Timestamps are ISO 8601 UTC.
- Every route here is `IsAuthenticated`.
- Mail errors use the drafts shape, `{"code": "...", "detail": "..."}`. Validation errors keep DRF's field shape.
- "Google connection" means a `MailboxConnection` with `provider="google"`. "Two-way" means D1's `connection.two_way` (Google and all three Gmail scopes granted).

## Decisions made in this contract

The spec leaves these open, or the code forced them. Each one is the owner's to overrule.

1. **An outbox row is one label change on one message.** Every action in the spec's table is a set of Gmail label changes (UNREAD, STARRED, INBOX, SPAM, TRASH, a user label). So a `MailOutbox` row holds a single `(message, label_key, add)` and the label's previous presence. Collapsing, the skip rule, revert and batching all work per `(message, label_key)`. `op` keeps the person's verb ("archive") for the notice. `label_create` is the one row with no message.
2. **Collapsing keeps one pending row per `(message, label_key)`.** A partial unique constraint enforces it. A new action on the same pair updates the pending row's target. When the target equals the row's `previous`, the row is deleted and nothing is sent. Read then unread sends nothing.
3. **D1 decision 11 is superseded for two-way Google mailboxes.** A PATCH or action changes the row at once (its `label_ids` first, then the D1 derivation), and writes outbox rows. Incoming Gmail changes skip every `label_key` that has a `pending` or `sending` row for that message. They do not skip the message's other labels. When Gmail reports a skipped label, that row's `previous` takes Gmail's value, so a later revert lands on what Gmail last said. Once a row is `sent`, Gmail is the truth again. This applies to every path that relabels: history, the reconcile, and `store_gmail` on a held id.
4. **An internal `sending` status.** A flush marks its rows `sending` before the Gmail call, which runs outside any transaction (D1 decision 18). An action on a pair whose row is `sending` creates a new `pending` row. If the `sending` row then fails, the message is not reverted. Instead, the newer row's `previous` becomes the failed row's `previous` (it is deleted if that now equals its target). A row still `sending` after `MAIL_LEASE_SECONDS` (a crashed tick) goes back to `pending` without counting an attempt. Every Gmail call used is idempotent. The API never shows `sending`.
5. **Retries: the fifth failed attempt fails the row.** The waits after failures 1 to 4 are 30 s, 2 m, 10 m and 1 h. A 404 for the message fails the row at once. The spec's sixth wait (6 h) cannot be reached under "after 5 failures" (see mismatches). `MAIL_OUTBOX_RETRY_SECONDS` holds the list, so the owner can add `21600` and set `MAIL_OUTBOX_MAX_ATTEMPTS=6`.
6. **What counts as an attempt.**
   - **Counts:** `5xx`, network errors, and other `4xx` on a call. Each row in the failed call counts one.
   - **Does not count:** `429` and `403 rateLimitExceeded`/`userRateLimitExceeded`. These stop the flush and back the mailbox off (D1 decisions 20–21), because a rate limit is our pacing, not the row's fault. A lost grant or a missing permission pauses the mailbox (D1), and its rows stay `pending`.
   - A `5xx` or network error also backs the mailbox off after counting, exactly as a D1 tick failure does. So the history step does not run on top of a failing Gmail.
7. **Batching.**
   - Due label rows (TRASH aside) are grouped by message into `(add set, remove set)`. Messages with the same pair go in one `messages.batchModify`, at most `MAIL_OUTBOX_BATCH_SIZE` (1,000) ids per call.
   - A batch answered `400` or `404` is retried one message at a time with `messages.modify`, so the one bad id fails alone.
   - TRASH has no batch method. Adding it is `messages.trash` and removing it is `messages.untrash`, one call each, at most `MAIL_OUTBOX_SINGLE_CALLS_PER_TICK` (200) per tick. The rest wait for the next tick, and nothing is counted against them.
8. **The flush order within a tick:** `label_create` rows, then batchModify, then trash/untrash. A label row whose label has not been created in Gmail yet waits. It is not counted, and it fails with its label if the create fails.
9. **A conversation action touches every message Revenact holds in the thread.** The thread is the owner's rows with the same `thread_id`, or the row alone when `thread_id` is blank. Messages Gmail holds that Revenact never imported (older than the 12-month window) are not touched. Gmail's `threads.modify` is not used, because it would break the per-message collapse and revert.
10. **Starring a conversation stars its newest message only**, as Gmail does. Unstarring a conversation unstars every message in it.
11. **Paused mailboxes refuse Gmail actions.** A paused Google mailbox answers `409 MAILBOX_PAUSED` (D1 shape) to every action that would write to Gmail, and nothing is queued. This extends D1 decision 24: pausing stops Revenact acting as the person in Gmail. Rows already pending when the pause began stay pending. They flush on resume, since paused rows are never claimed. Mute and unmute are allowed while paused.
12. **Read-only (legacy) Google connections answer `409 TWO_WAY_OFF`** to every Gmail-writing action, with `needs_reconnect: true`. Mute works. Attachment downloads work, because `gmail.readonly` allows `attachments.get`.
13. **A disconnected Google row's kept copies are read-only.** Actions answer `409 NO_MAILBOX` ("This message's mailbox is no longer connected.", today's reply wording). Mute works. Disconnecting deletes the connection's `pending` and `sending` rows without reverting. The reconnect's 30-day reconcile re-derives everything from Gmail.
14. **Outlook and IMAP are unchanged.** PATCH stays local with the `locally_changed_at` rule, and nothing goes to the provider. The fields and ops that only Gmail has (`trashed`, `spam`, labels) answer `400 GMAIL_ONLY` for them.
15. **Conversations are a new endpoint, `GET mail/threads/`**, not a `group=` mode. A thread row has a different shape (counts, participants, union of labels), and the message list stays as it is for search and for Outlook/IMAP callers.
16. **A thread is addressed by any of its messages' ids.** The routes are `mail/messages/<id>/thread/` (GET and PATCH) and bulk `thread_of: [ids]`. Gmail thread ids are route-safe, but Outlook conversation ids contain `/`, `+` and `=`. A blank `thread_id` makes a one-message thread.
17. **A thread is in a view when any of its messages matches the view's filters.** It is ordered by its newest matching message. Its flags are computed over its messages outside trash and spam, or over all of them in the trash and spam views. This is Gmail's behaviour.
18. **`?label=<MailLabel id>` and a new `folder=all`.** The sidebar's label view sends `folder=all&label=7`. `all` means every message outside trash and spam (Gmail's All Mail). It works on the message list and the thread list. A `GinIndex(label_ids, jsonb_path_ops)` backs `label_ids @> '["Label_12"]'`, and D1 decision 13's deferral ends.
19. **Unread counts are on `GET mail/labels/`, counted in conversations** (Gmail's sidebar number). This is unread messages carrying the label, outside trash and spam, as distinct threads. It is one query that unnests `label_ids`. `summary/` is unchanged.
20. **Labels: create only.** `POST mail/labels/ {name}`. There is no rename, delete or colour in D2: the spec asks for none (YAGNI). The label is created locally at once with `gmail_id=""`, and a `label_create` outbox row sends `labels.create`.
21. **A Revenact-made label lives in `label_ids` as `pending:<MailLabel id>` until Gmail creates it.**
    - When `labels.create` answers, the label takes the real id. In one transaction, every `label_ids` entry and every pending row's `label_key` is rewritten from `pending:<pk>` to that id.
    - Gmail answering `409` (the name exists, perhaps made in Gmail since the last mirror) adopts the existing label: one `labels.list`, matched by name, case-insensitively.
    - Any other failure deletes the local label, removes `pending:<pk>` from the messages, deletes its dependent rows (they never reached Gmail) and notifies once.
    - This keeps D1 decision 12: the API speaks Revenact label ids only.
22. **One notification per action per reason.** A request's rows share an `action_id` (UUID). When rows fail, the tick sends one `mail_action_failed` notification per `(action_id, reason)`, counting conversations, never one per row. A bulk archive of 400 conversations that all fail sends one notice.
23. **`sync_issue` on a message:** the sentence of the newest `failed` row on it within `MAIL_OUTBOX_ISSUE_DAYS` (7), unless a later row was made on that message since. On a thread it is the newest issue among its messages. Failed rows are pruned after 7 days and sent rows after 24 hours, in the nightly `run_health_maintenance`.
24. **Enqueueing wakes the mailbox.** An action sets `wake_at = LEAST(wake_at, now)` on commit, so the flush runs within one tick (≤ 5 s). Retries are not timed: a row due at `next_attempt_at` goes in the next tick that claims the mailbox, the 60-second check at the latest. `wake_at` stays a "now" flag, as push uses it.
25. **Opening a message is a PATCH, as today.** GET never marks a message read. `MailReplyView` already marks the original read: for two-way Google it now does so through the outbox (a `read` row).
26. **Attachments are fetched inline, on the first request,** through the owner's mailbox, whoever asks (the owner, or a reader of the filed record):
    - The message is re-read with `format=full`, because Gmail rotates attachment ids (D1 `MailAttachment`), and the part is matched on `part_id`. Then `messages.attachments.get`. Small parts whose data sits inline in the payload are decoded without a second call.
    - The file is stored through the default storage at `mail_attachments/<organisation id>/<uuid><ext>`, like `customers.attachment_path`.
    - Two first opens at once both fetch. A conditional update keeps the first, and the second deletes its own copy.
27. **Served type and disposition.**
    - The type served is the declared MIME only when the file's extension is in `files.ALLOWED_TYPES`, the declared type is one of that extension's, and, where `files.MAGIC` knows the extension, the leading bytes match. Otherwise it is `application/octet-stream`.
    - `Content-Disposition: inline` only for `image/png`, `image/jpeg`, `image/gif`, `image/webp` and `application/pdf`, and only when `?download=1` is absent. Everything else is `attachment`. SVG is never inline.
    - Every answer carries `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` and `Cache-Control: private, no-store`, as `files.attachment_response` does.
    - Mail attachments are not refused for their type, since the person needs their own zip. They are only downgraded to a download.
28. **The size cap is `MAIL_ATTACHMENT_MAX_BYTES`** (default 50 MB, Gmail's receiving limit). Over it, `413 ATTACHMENT_TOO_LARGE`, checked against the declared size before fetching and the real size after.
29. **Filed mail's attachments use both filters, not record visibility alone.** A non-owner reads a filed message's attachment only when they may open its record (`visible_children_q` on the filed `Email`) **and** read the email (`visible_emails_q`, the mailbox chain). This is the twice-filter, and it is the rule the record's Emails tab already applies. The spec says "under the record's visibility" (see mismatches).
30. **The Files tab lists filed mail's non-inline attachments as extra rows** with `source: "email"`, an `email` block and a `download_url` on the mail route. Their `id` is the `MailAttachment` id, so the frontend tells rows apart by `source`. They cannot be deleted there. They live as long as the owner's personal copy: a message deleted in Gmail, or pruned 30 days after a disconnect, takes them out of the tab, while the filed `Email` stays.
31. **The audit event is `mailbox.attachment_downloaded`**, on every download of a filed message's attachment, by anyone, the owner included. Unfiled mail is the owner's own and is not audited. Mail actions and label creation are personal and not audited (none is in the spec's list).
32. **Cached files are deleted with their row.** A `post_delete` signal on `MailAttachment` deletes the stored file, which covers cascades (history deletions, the prune, a replaced connection). D1 promised this for D2.
33. **Downloads are throttled per user,** at `THROTTLE_MAIL_ATTACHMENT` (default `120/min`, scope `mail_attachment`). A first open costs two Gmail calls.
34. **A request touches at most `MAIL_ACTION_MAX_MESSAGES` (1,000) messages after thread expansion.** More is `400 TOO_MANY`. Bulk requests are all-or-nothing: an id that is not the caller's makes the whole request `404`, and no id is named.

### Spec against the code: mismatches found

- **Retry schedule vs "after 5 failures".** Five failures leave room for four waits, so the listed 6 h wait is never used (decision 5).
- **"Attachments … under the record's visibility"** would let a view-all reader outside the mailbox chain read a file in mail they cannot read. Every filed-mail read in the code is twice-filtered (`views.py` customer and account emails, `communications.py`, `drafts.py`). Decision 29 keeps the twice-filter.
- **The existing download route cannot serve a preview.** `files.attachment_response` is always `as_attachment=True`, and its ids are `customers.Attachment` ids. The spec's "served by the existing authenticated attachment route" becomes a sibling route reusing the same headers, `mail/attachments/<id>/download/` (decisions 27 and 30).
- **The API authenticates with a JWT bearer, not a cookie.** An `<img src>` in the sandboxed iframe, or a plain `<a href>`, cannot reach an authenticated route. The frontend fetches with the bearer into a blob. For `cid:` images it inlines them as `data:` URLs, which D1's iframe CSP (`img-src cid: data:`) already allows.
- **Trash has no batch call** (`messages.trash`/`untrash` are per message). The spec's "bulk actions use batchModify" holds for everything else (decision 7).
- **A conversation action in Gmail also touches messages Revenact never imported.** Ours touches held messages only (decision 9).
- **Prune and history deletions leave cached files on disk.** Cascades skip `FieldFile` deletion, and `MailAttachment` has no delete hook (decision 32).
- **`MailReplyView` marks the original read locally only**, with `message.save(update_fields=["is_read"])`. D2 routes that through the outbox for two-way Google (decision 25).
- **`labels_by_gmail_id` excludes labels with a blank `gmail_id`**, so a Revenact-made label would not render until Gmail created it. D2 keys pending labels as `pending:<pk>` (decision 21).
- **`MailMessage`'s docstring and API_CONTRACTS say "D1 writes nothing back"** and "PATCH … here only". D2 makes both untrue for two-way Google.
- **The spec's outbox statuses are pending, sent and failed.** D2 adds an internal `sending` (decision 4), as `ReplyDraft` has.
- **The spec's outbox row holds "message (or draft, or label)".** D2 has message and label. The draft link is D3's (§1, "Room for D3").
- **There is no `django.contrib.postgres` in `INSTALLED_APPS`** and no `GinIndex` anywhere yet. `django.contrib.postgres.indexes.GinIndex` works without the app. The migration is plain `AddIndex`.
- **Spec §3 says "after 5 failures … send the owner an in-app notification" per row.** Per row would flood the bell on a bulk action (decision 22).

## 1. The outbox

### `MailOutbox` (new, `services/mail/models.py`)

| Field | Type | Notes |
|---|---|---|
| `connection` | FK `MailboxConnection`, CASCADE, `related_name="outbox"` | |
| `action_id` | `UUIDField` | Shared by every row one request made; groups the notification |
| `op` | `CharField(24, choices)` | The person's verb (see below). D3 adds draft ops |
| `message` | FK `MailMessage`, CASCADE, null | Every op but `label_create`. A message Gmail deletes takes its rows with it |
| `label` | FK `MailLabel`, CASCADE, null | `label_create` only |
| `label_key` | `CharField(255, blank=True)` | The Gmail label id changed (`UNREAD`, `INBOX`, `Label_12`), or `pending:<MailLabel id>`. Blank for `label_create` |
| `add` | `BooleanField(null=True)` | The target: the label present (`true`) or absent (`false`). Null for `label_create` |
| `previous` | `JSONField(default=dict)` | What revert restores. A label row has `{"present": false}`; `label_create` has `{}` |
| `payload` | `JSONField(default=dict)` | `label_create`: `{"name": "Renewals"}`. D3 adds draft bodies |
| `status` | `CharField(8, choices)` | `pending`, `sending` (internal), `sent`, `failed` |
| `attempts` | `PositiveSmallIntegerField(default=0)` | |
| `next_attempt_at` | `DateTimeField` | `now` at enqueue |
| `reason` | `CharField(16, blank=True)` | On failure: `not_found`, `label_gone`, `refused`, `exhausted`, `name_refused` |
| `created_at` | `DateTimeField(auto_now_add=True)` | |
| `updated_at` | `DateTimeField(auto_now=True)` | |
| `sent_at` | `DateTimeField(null=True)` | |
| `failed_at` | `DateTimeField(null=True)` | |

**Constraints and indexes:**
- `UniqueConstraint(fields=["message", "label_key"], condition=Q(status="pending"), name="mail_outbox_one_pending_per_label")`, the collapse.
- `UniqueConstraint(fields=["label"], condition=Q(op="label_create") & Q(status__in=["pending", "sending"]), name="mail_outbox_one_label_create")`.
- `CheckConstraint`: `label_create` has a label and no message; every other op has a message.
- `Index(fields=["connection", "status", "next_attempt_at"], name="mail_outbox_due_idx")`, the flush.
- `Index(fields=["message", "status"], name="mail_outbox_message_idx")`, the skip rule and `sync_issue`.

`__str__` is `outbox <pk> <op>`, never a subject.

### The ops and the label changes they make

| `op` | Label changes (one row each) | Gmail call |
|---|---|---|
| `read` | −`UNREAD` | `batchModify` / `modify` |
| `unread` | +`UNREAD` | 〃 |
| `star` | +`STARRED` | 〃 |
| `unstar` | −`STARRED` | 〃 |
| `archive` | −`INBOX` | 〃 |
| `inbox` | +`INBOX` only. Restoring from trash is `untrash`, and from spam `not_spam` | 〃 |
| `trash` | +`TRASH` | `messages.trash` |
| `untrash` | −`TRASH` | `messages.untrash` |
| `spam` | +`SPAM`, −`INBOX` | `batchModify` / `modify` |
| `not_spam` | −`SPAM`, +`INBOX` | 〃 |
| `label_add` | +`<label>` | 〃 |
| `label_remove` | −`<label>` | 〃 |
| `label_create` | (none: a label row) | `labels.create` |
| `mute`, `unmute` | **no row**: Revenact-only | none |

A change that is already true locally makes no row. Archiving a message without `INBOX` changes nothing. After a `trash` or `untrash` is sent, whatever else Gmail does to the labels arrives by history, and Gmail is the truth.

**The op enum is open-ended.** D3 adds `draft_create`, `draft_update`, `draft_delete` and `draft_send`, with a `draft` FK and `payload`, and the flush's dispatch is by op.

### Enqueueing (in the request, one transaction)

For each message the action touches (decision 9, decision 10 for star) and each label change of the op:

1. Read the local presence `p` of `label_key` in `label_ids`, and the target `t`.
2. **No pending row for the pair:**
   - If `p == t`, skip it.
   - Otherwise create a row `{add: t, previous: {"present": p}, status: pending, attempts: 0, next_attempt_at: now}`.
3. **A pending row exists:**
   - If `t == previous.present`, delete it (collapsed: nothing is sent).
   - Otherwise set `add = t`, `op`, `action_id`, `attempts = 0` and `next_attempt_at = now`.
4. Apply `t` to `label_ids`. Then re-derive `folder`, `is_read`, `is_starred`, `is_important` and `state` with `gmail_store.derive` (muted stays muted, except for `archive` and `inbox` below). Save with `bulk_update`.

`state` follows the labels as in D1 §4. The exceptions:
- `archive` on a muted message sets `done`.
- `inbox` on a muted message sets `open`.
- `unmute` re-derives `state` from the labels.

On commit: `wake_at = LEAST(COALESCE(wake_at, now), now)` on the connection (decision 24).

### The flush (tick step 1, under the D1 lease)

D1 §5's step "3.1 (D2: flush the outbox)" becomes:

1. **Recover:** rows `sending` with `updated_at < now − MAIL_LEASE_SECONDS` return to `pending`, uncounted.
2. **Claim:** this connection's rows `pending` with `next_attempt_at ≤ now`, oldest first. Mark them `sending`. Label rows whose `label_key` is still `pending:<pk>` stay pending.
3. **`label_create` rows:**
   - `POST labels {name, labelListVisibility: "labelShow", messageListVisibility: "show"}`.
   - On success, decision 21's rewrite.
   - On `409`, adopt the existing label by name.
   - On another `4xx`, fail with `name_refused`.
4. **Label rows (not TRASH):** grouped and batched (decision 7). Gmail ids are resolved from `label_key`.
5. **TRASH rows:** `messages.trash` / `messages.untrash`, at most `MAIL_OUTBOX_SINGLE_CALLS_PER_TICK`. Rows beyond the cap go back to `pending` uncounted.
6. **Before every Gmail call**, the claim is checked as D1's `_write` does: the connection still carries this tick's `lease_until` and is not disconnected. Otherwise the tick stops (`Lost`), and its `sending` rows recover later by step 1.

**The outcome per row:**

| Gmail says | Row |
|---|---|
| 2xx | `sent`, `sent_at = now` |
| `404` on the message (`modify`, `trash`, `untrash`) | `failed`, `reason=not_found`, at once |
| `400` naming the label (`Invalid label`), or a label row whose label was deleted locally | `failed`, `reason=label_gone`, at once |
| Other `4xx` (not 401, not rate limits, not `insufficientPermissions`) | attempt counted; at `MAIL_OUTBOX_MAX_ATTEMPTS` → `failed`, `reason=refused` |
| `5xx`, network | attempt counted; at the maximum → `failed`, `reason=exhausted`; the flush stops and the mailbox backs off (D1 decision 21) |
| `429`, `403 rateLimitExceeded` / `userRateLimitExceeded` | rows back to `pending` uncounted; the flush stops; mailbox backoff |
| Lost grant / `insufficientPermissions` | rows back to `pending` uncounted; `pause_revoked` (D1) |

A counted row that has not failed is `pending` with `next_attempt_at = now + MAIL_OUTBOX_RETRY_SECONDS[attempts − 1]`.

**On failure, the revert** (one transaction per failed group):
- **A label row:** when no newer `pending` row exists for the pair, set the label's presence back to `previous.present` and re-derive. When one does, hand it the `previous` (decision 4).
- **`label_create`:** decision 21's unwind.
- **Then** one `mail_action_failed` notification per `(action_id, reason)` (§5).

The flush is bounded by the number of due rows: calls of up to 1,000 ids, plus at most 200 single calls. Then D1's steps follow: labels, history, reconcile, import, watch.

### Incoming changes while a row is pending (D1 §5 step 3.4, the reconcile, `store_gmail`)

`gmail_store.relabel(connection, row, label_ids, now, held=…)` gains `held`, the set of `label_key`s with a `pending` or `sending` row on that message. The `held` sets for every message in a history page are loaded in one query.

For each key in `held`:
- the local presence is kept, whatever Gmail sent;
- the pending row's `previous.present` takes Gmail's reported presence (decision 3).

Every other label is taken from Gmail, then the folder and flags are re-derived as in D1.

## 2. Conversations

### `GET /api/v1/mail/threads/`

Paginated like `mail/messages/` (`page`, `page_size` ≤ 100). It takes the message list's parameters, applied per message (decision 17):

| Parameter | Values |
|---|---|
| `folder` | `inbox` (default), `all` (new), `drafts`, `sent`, `done`, `muted`, `spam`, `trash`, `starred`, `important` |
| `label` | a `MailLabel` id of the caller's own mailbox (new) |
| `category`, `unread`, `priority`, `q` | as `mail/messages/` |

```json
{
  "count": 213,
  "next": "https://…/api/v1/mail/threads/?page=2",
  "previous": null,
  "results": [
    {
      "id": 9012,
      "thread_id": "18c2f0a9b1d4e7a3",
      "subject": "Re: Renewal terms",
      "snippet": "Works for us. Can you send the quote?",
      "last_sent_at": "2026-10-11T08:42:10Z",
      "message_count": 4,
      "unread_count": 1,
      "participants": [{"name": "Ann Lee", "address": "ann@pizzahut.com"}, {"name": "", "address": "dana@doughco.com"}],
      "more_participants": 0,
      "is_read": false,
      "is_starred": true,
      "is_important": false,
      "priority": true,
      "state": "open",
      "folder": "inbox",
      "has_attachments": true,
      "labels": [{"id": 7, "name": "Renewals", "color": {"background": "#16a766", "text": "#ffffff"}, "pending": false}],
      "account": {"id": 2, "name": "Dough Co", "type": "customer"},
      "sync_issue": null
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | The newest **matching** message's id. It is the handle for `mail/messages/<id>/thread/` |
| `subject`, `snippet`, `folder`, `state` | The newest matching message's |
| `last_sent_at` | The newest matching message's `sent_at`; the list is ordered by it, then `id` |
| `message_count`, `unread_count` | Over the thread's messages outside trash and spam (all of them in the `trash`/`spam` views) |
| `participants` | Distinct senders, oldest first, up to 3; `more_participants` counts the rest |
| `is_read` | No unread message; `is_starred`, `is_important`, `has_attachments`, `priority`: any message |
| `labels` | The union of user labels, by name; `pending` is true for a label not yet created in Gmail |
| `account` | The newest filed message's record, else `null` |
| `sync_issue` | §5 |

Outlook and IMAP threads group by their `thread_id` (Graph's `conversationId`). IMAP's is blank, so each IMAP message is its own thread.

**Errors:**
- `400` for an unknown `folder` or `category`, as today.
- `400 {"label": ["Choose one of your labels."]}` for a label id that is not a user label of the caller's mailbox.

### `GET /api/v1/mail/messages/<id>/thread/`

The thread holding message `<id>`, owner-only (404 otherwise, managers included).

```json
{
  "thread_id": "18c2f0a9b1d4e7a3",
  "subject": "Renewal terms",
  "labels": [{"id": 7, "name": "Renewals", "color": null, "pending": false}],
  "account": {"id": 2, "name": "Dough Co", "type": "customer"},
  "sync_issue": null,
  "truncated": false,
  "messages": ["<MailMessageDetail>", "…"]
}
```

- `messages` holds every message in the thread, **oldest first**, each in the message detail shape (D1 §6, plus `sync_issue` and §6's attachment fields), trashed and spam messages included with their `folder`. The frontend collapses older ones, and trashed ones behind "1 deleted message".
- At most `MAIL_THREAD_MAX_MESSAGES` (100), the newest ones. When there are more, `truncated` is true.
- `subject` is the oldest message's.

### `GET /api/v1/mail/messages/` gains

- `folder=all` and `label=` (as above).
- On every row, `sync_issue`, and on each label, `pending`.

Everything else is unchanged.

## 3. Actions

Every action route runs these checks in order. The first failure is the answer.

| # | Check | Status | `code` / body |
|---|---|---|---|
| 1 | Every message id is the caller's | 404 | `{"detail": "Not found."}` (no id named) |
| 2 | Body valid | 400 | field errors; `TOO_MANY` (decision 34) |
| 3 | Outlook or IMAP, and the request uses a Gmail-only field (`trashed`, `spam`, `add_labels`, `remove_labels`) or op (`trash untrash spam not_spam label_add label_remove`) | 400 | `GMAIL_ONLY`, "Only Gmail mailboxes have this." |
| 4 | Google, the messages' connection is `disconnected` | 409 | `NO_MAILBOX`, "This message's mailbox is no longer connected." |
| 5 | Google, paused | 409 | `MAILBOX_PAUSED` + `paused_reason` (D1 shape) |
| 6 | Google, not two-way | 409 | `TWO_WAY_OFF`, "Reconnect Google to turn on two-way: changes here can't reach Gmail yet.", `"needs_reconnect": true` |

Checks 4 to 6 apply only when the request writes to Gmail: anything but `mute`, `unmute`, or a `state` change to `muted`. A mute alone always passes. A Google mailbox in `error` from a lost grant is `paused_reason=token_revoked` and answers 5.

### `PATCH /api/v1/mail/messages/<id>/` and `PATCH /api/v1/mail/messages/<id>/thread/`

The body is partial, with at least one field:

```json
{"is_read": true}
{"state": "done"}
{"trashed": true}
{"spam": false}
{"add_labels": [7], "remove_labels": [9]}
```

| Field | Values | Op(s) |
|---|---|---|
| `is_read` | bool | `read` / `unread` |
| `is_starred` | bool | `star` / `unstar` (thread: decision 10) |
| `state` | `open`, `done`, `muted` | `open` → `inbox` (and unmute); `done` → `archive` (and unmute); `muted` → `mute`. Leaving `muted` for `open` or `done` is that op |
| `trashed` | bool | `trash` / `untrash` |
| `spam` | bool | `spam` / `not_spam` |
| `add_labels`, `remove_labels` | lists of `MailLabel` ids, ≤ 20 each | `label_add` / `label_remove` per label |

**Rules:**
- At most one of `state`, `trashed` and `spam` per request: `400 {"non_field_errors": ["Change one of state, trashed or spam at a time."]}`.
- A label id that is not a **user** label of the caller's mailbox is `400 {"add_labels": ["Choose one of your labels."]}`.
- A label may be in neither list twice and not in both.
- For Outlook and IMAP the body may only hold `is_read`, `is_starred` and `state`. Those are local and stamp `locally_changed_at`, exactly as today. The others are `400 GMAIL_ONLY`.

**Answers:**
- The message route: **200** with the message detail (D1 §6 plus D2's fields).
- The thread route: **200** with the thread payload (§2).

Both are already showing the new values: the screen never waits for Gmail.

### `POST /api/v1/mail/actions/` (bulk)

```json
{"op": "archive", "thread_of": [9012, 9013, 9040]}
{"op": "label_add", "label_id": 7, "message_ids": [9012]}
```

| Field | Rule |
|---|---|
| `op` | `read unread star unstar archive inbox trash untrash spam not_spam label_add label_remove mute unmute` |
| `message_ids` **or** `thread_of` | Exactly one, 1–1,000 ids; `thread_of` expands each id to its thread |
| `label_id` | Required for `label_add` / `label_remove`, else refused |

**200:**

```json
{"op": "archive", "messages": 9, "threads": 3, "unchanged": 1}
```

- `messages` counts the messages whose local values changed.
- `unchanged` counts those already in the target state.
- The frontend refetches its lists and the labels.

**Errors** are the check table above, plus:
- `400 {"op": ["Choose a known action."]}`;
- `400 {"label_id": ["Choose one of your labels."]}`;
- `400 {"code": "TOO_MANY", "detail": "Select fewer conversations: at most 1,000 messages at a time."}`.

Outlook and IMAP accept `read`, `unread`, `star`, `unstar`, `archive` (`state=done`), `inbox` (`state=open`), `mute` and `unmute`, all local.

### Muted

`muted` stays Revenact-only for every provider: no outbox row, no Gmail call. It is allowed while paused, read-only or disconnected. Sync never touches it (D1). `unmute` re-derives `state` from the labels for Gmail, and sets `open` for Outlook and IMAP.

## 4. Labels

### `GET /api/v1/mail/labels/` gains `unread` and `pending`

```json
[
  {"id": 7, "gmail_id": "Label_12", "name": "Renewals", "color": {"background": "#16a766", "text": "#ffffff"}, "unread": 3, "pending": false},
  {"id": 31, "gmail_id": null, "name": "Pilot", "color": null, "unread": 0, "pending": true}
]
```

- Pending labels (made here, not yet created in Gmail) are now listed, with `gmail_id: null`. Before D2 the list left them out.
- `unread` is decision 19's count.
- It is still `[]` with no mailbox, a disconnected one, or a non-Google one.

### `POST /api/v1/mail/labels/`

`{"name": "Vendors/Billing"}`. **201** returns the label as above, with `pending: true`. The `label_create` row is enqueued, and the mailbox woken.

| Status | Body | When |
|---|---|---|
| 400 | `{"name": ["Name the label."]}` | Blank after trimming |
| 400 | `{"name": ["Keep the name under 225 characters."]}` | Too long |
| 400 | `{"name": ["Gmail keeps that name for itself."]}` | Case-insensitively one of `INBOX SENT DRAFT DRAFTS SPAM TRASH UNREAD STARRED IMPORTANT CHAT CATEGORY_*` |
| 409 | `{"code": "LABEL_EXISTS", "detail": "You already have a label called Renewals.", "label_id": 7}` | A label of this mailbox with the same name, case-insensitively |
| 400 | `GMAIL_ONLY` | Outlook or IMAP |
| 409 | `NO_MAILBOX`, `MAILBOX_PAUSED`, `TWO_WAY_OFF` | As in §3 |

`label_ids` and the message serializers' `labels` context (`labels_by_gmail_id`) key a pending label as `pending:<id>` (decision 21). So it renders on messages at once.

## 5. Failure notices

### `sync_issue` on messages and threads

```json
"sync_issue": {"text": "Couldn't archive in Gmail: the message no longer exists.", "at": "2026-10-11T08:50:02Z"}
```

It is `null` otherwise (decision 23). It is shown as a quiet line on the message, and on the thread row.

**The sentences**, built from `op` and `reason` without subjects or addresses:

| `op` | Verb |
|---|---|
| `read` / `unread` | "mark as read" / "mark as unread" |
| `star` / `unstar` | "star" / "unstar" |
| `archive` / `inbox` | "archive" / "move to the Inbox" |
| `trash` / `untrash` | "delete" / "restore" |
| `spam` / `not_spam` | "report spam" / "mark as not spam" |
| `label_add` / `label_remove` | 'label "<name>"' / 'remove the label "<name>"' |
| `label_create` | 'create the label "<name>"' |

| `reason` | Clause |
|---|---|
| `not_found` | "the message no longer exists" |
| `label_gone` | "the label no longer exists" |
| `refused` | "Gmail refused the change" |
| `exhausted` | "Gmail didn't answer after several tries" |
| `name_refused` | "Gmail refused the name" |

The sentence is "Couldn't <verb> in Gmail: <clause>."

### The notification

New `Notification.Kind.MAIL_ACTION_FAILED = "mail_action_failed"`, label "Mail action failed". It is sent through `realtime.notify` with:
- `recipient`: the mailbox owner;
- `actor`: `None`;
- `push_on_commit`: true.

It is one notification per `(action_id, reason)` (decision 22):
- **One conversation:** the sentence above.
- **More:** "Couldn't archive 12 conversations in Gmail: Gmail didn't answer after several tries."
- **`link`:** `/communications?source=mailbox:google&message=<id>`, the newest affected message still held, or `/communications?source=mailbox:google` when none is.

## 6. Attachments

### The message detail's `attachments[]` gains

```json
{"id": 31, "filename": "Renewal quote.pdf", "mime_type": "application/pdf", "size": 182311, "is_inline": false, "content_id": "", "available": true, "preview": true, "download_url": "/api/v1/mail/attachments/31/download/"}
```

| Field | Meaning |
|---|---|
| `available` | The file is cached, **or** its message's connection is Google, not disconnected, and not paused. It replaces D1's always-`false` |
| `preview` | The type will be served inline (decision 27; judged on the declared type and extension before fetching) |
| `download_url` | Always set; `null` when `available` is false |

### `GET /api/v1/mail/attachments/<id>/download/`

**Who may read it:**
- the message's owner;
- **or**, when the message is filed (`message.email` set), anyone for whom that `Email` passes `visible_children_q(user)` **and** `visible_emails_q(user)` (decision 29).

Anyone else gets 404, the portal included.

Throttled `mail_attachment` (decision 33). `?download=1` forces `attachment`.

**The order of the work:**
1. Visibility, else 404.
2. If the file is cached, serve it.
3. Declared `size > MAIL_ATTACHMENT_MAX_BYTES`: `413 ATTACHMENT_TOO_LARGE`.
4. The connection must be Google, not disconnected, not paused: else `409 ATTACHMENT_UNAVAILABLE`. The same text is shown to everyone, so a manager never learns the pause reason.
5. The connection is in backoff (`backoff_until > now`): `503 GMAIL_BUSY`, with `Retry-After`.
6. Fetch (decision 26). Store the file, stamp `fetched_at`, and serve it.

**200:** the bytes, with decision 27's type, disposition and headers, and `Content-Length`. The filename is RFC 5987 encoded (Django's `FileResponse`).

| Status | `code` | `detail` |
|---|---|---|
| 404 | | Not visible, or no such attachment |
| 409 | `ATTACHMENT_UNAVAILABLE` | "This file hasn't been fetched from Gmail yet, and its mailbox isn't connected." |
| 410 | `ATTACHMENT_GONE` | "This file is no longer in Gmail." (the message got a `404` on `get`, or `part_id` is no longer in it) |
| 413 | `ATTACHMENT_TOO_LARGE` | "This file is too large to open here. Open it in Gmail." |
| 503 | `GMAIL_BUSY` | "Gmail is busy. Try again in a minute." (backoff, or a `429`/`5xx` on the fetch; it does not change the mailbox's backoff) |
| 429 | | Throttled |

- A lost grant or `insufficientPermissions` on the fetch pauses the mailbox (`pause_revoked`, D1) and answers 409 `ATTACHMENT_UNAVAILABLE`.
- No log line names the file. `logger.warning` carries the connection id and the status only.

**The audit** is `mailbox.attachment_downloaded` when `message.email` is set (decision 31), with:
- target: the `MailAttachment` (`attachment <pk>`);
- metadata: `{email, attachment, content_type, size, fetched, owner}`, where `fetched` means this request fetched it from Gmail and `owner` means the reader owns the mailbox.

### `MailAttachment` gains

| Field | Type | Notes |
|---|---|---|
| `fetched_at` | `DateTimeField(null=True)` | When the file was cached |
| `file` | `upload_to` changes to `mail_attachment_path`: `mail_attachments/<organisation id>/<uuid><ext>` | DB no-op |

A `post_delete` receiver deletes the stored file (decision 32).

### The Files tab: `GET customers/<id>/files/` and `…/accounts/<id>/files/`

The rows gain **filed mail's non-inline attachments**:
- **On an organisation:** those on its own filed emails, and on its accounts' emails that the caller may open (`customer_rollup_q`).
- **On an account:** its own.

Each is twice-filtered (decision 29), and the list is merged newest first. Every row, uploads included, gains `email`:

```json
{"id": 31, "account_id": null, "account_name": null, "name": "Renewal quote.pdf",
 "content_type": "application/pdf", "size": 182311, "description": "", "source": "email",
 "uploaded_by": null, "download_url": "/api/v1/mail/attachments/31/download/",
 "created_at": "2026-10-09T14:03:00Z",
 "email": {"id": 812, "subject": "Renewal terms", "from": "Ann Lee"}}
```

- `created_at` is the email's `sent_at`.
- `content_type` is the declared MIME.
- `email` is `null` on uploaded files.
- `source: "email"` is new beside `upload` and `transcript`.
- `GET/DELETE files/<id>/` never resolves an email row: its id is not a `customers.Attachment`. The frontend hides Delete for `source: "email"`.
- **Query count:** the Files list goes up by one, fixed.

## 7. Privacy

- The thread list, thread detail, actions, labels and the outbox are **owner-only**. Every queryset scopes on `owner=request.user` or on the caller's own connection.
  - A manager, view-all holder, Leadership member or admin gets 404 on another person's message or thread, `[]` for labels, and 404 on bulk ids.
  - None of them ever sees outbox state, `sync_issue`, labels or unfiled attachments.
- **Attachments of unfiled mail:** owner only. **Of filed mail:** the twice-filter (decision 29), and every such download is audited.
- **Notifications** go to the mailbox owner only and carry no subject or address. A label name is the owner's own.
- **Privacy tests** (backend):
  - a manager gets 404 on a report's thread, PATCH, bulk ids and an unfiled attachment;
  - `[]` labels;
  - the Files tab shows a report's filed attachment only through the twice-filter;
  - a view-all reader outside the mailbox chain gets 404 on a filed attachment.

## 8. Query-count ceilings (asserted with `assertNumQueries`, independent of page size or thread length)

| Endpoint | Ceiling |
|---|---|
| `GET mail/messages/` | 4 (D1's 3, plus the page's `sync_issue` lookup) |
| `GET mail/threads/` | 6: the count, the page of thread keys, the messages of those threads (filed `Email` → customer/account joined), labels, outbox issues, plus one spare for the connection |
| `GET mail/messages/<id>/` | 5 (D1's 4, plus `sync_issue`) |
| `GET mail/messages/<id>/thread/` | 7: the anchor, the thread's messages (joined), attachments (prefetch), labels, outbox issues, the connection (for `available`), plus one spare |
| `GET mail/labels/` | 3: the connection, the labels, the unread counts |
| `PATCH` message / thread, `POST mail/actions/` | 12, whatever the number of messages (reads, `bulk_create`, `bulk_update`, deletes of collapsed rows, the wake) plus the response's own reads |
| Files list | today's + 1 |

## 9. Migrations, settings, audit, documents

### Migrations

- `mail/0005_mail_outbox`:
  - the `MailOutbox` model with its constraints and indexes;
  - `MailAttachment.fetched_at` and the `upload_to` change;
  - `AddIndex(GinIndex(fields=["label_ids"], name="mail_msg_label_ids_gin", opclasses=["jsonb_path_ops"]))`.
- `notifications/0012_mail_action_failed`: the new kind (a choices change).

No data migration.

### New settings

| Setting | Default | Meaning |
|---|---|---|
| `MAIL_OUTBOX_MAX_ATTEMPTS` | `5` | Counted failures before `failed` |
| `MAIL_OUTBOX_RETRY_SECONDS` | `30,120,600,3600` | Waits after failures 1, 2, … |
| `MAIL_OUTBOX_BATCH_SIZE` | `1000` | Ids per `batchModify` (Gmail's limit) |
| `MAIL_OUTBOX_SINGLE_CALLS_PER_TICK` | `200` | `trash`/`untrash`/`modify` fallback calls per tick |
| `MAIL_OUTBOX_ISSUE_DAYS` | `7` | `sync_issue` window; failed rows pruned after it |
| `MAIL_OUTBOX_SENT_RETENTION_HOURS` | `24` | Sent rows pruned after it |
| `MAIL_ACTION_MAX_MESSAGES` | `1000` | Per request, after thread expansion |
| `MAIL_THREAD_MAX_MESSAGES` | `100` | Per thread detail |
| `MAIL_ATTACHMENT_MAX_BYTES` | `52428800` | 50 MB |
| `THROTTLE_MAIL_ATTACHMENT` | `120/min` | Per user, scope `mail_attachment` (`None` under test) |

### Audit events (`docs/audit-events.md`)

| Action | Where | Actor | Target | Metadata |
|---|---|---|---|---|
| `mailbox.attachment_downloaded` (new) | `services.mail.views.MailAttachmentDownloadView` | user | MailAttachment | email, attachment, content_type, size, fetched, owner |

### Documents updated in the D2 PRs

- `docs/API_CONTRACTS.md`, the `mail` section:
  - the outbox paragraph, replacing "PATCH … here only" for two-way Google;
  - `threads/`, the thread detail and PATCH, `actions/`;
  - labels `POST`, `unread` and `pending`;
  - `folder=all` and `label=`;
  - `sync_issue`;
  - the attachment route;
  - the Outlook/IMAP table.

  The Files section gains `source: "email"` and the `email` block. The notifications section gains `mail_action_failed`.
- `docs/audit-events.md`: the row above.
- `docs/data-classification.md`: the mailbox row gains cached attachments (owner-only or twice-filtered, deleted with their row).
- `docs/product/`:
  - `01-prd.md`: what D2 built;
  - `02-trd.md`: the outbox, the skip rule, the flush in the tick, the attachment fetch;
  - `05-backend-schema.md`: `MailOutbox` and the new fields and index;
  - `06-implementation-plan.md`: D2 done, D3 next.
- `MailMessage`'s docstring and `gmail_store`'s module docstring (D1 decision 11 superseded).
- The frontend's, in the D2 frontend PR: react-ts-app `docs/03-ui-ux-design.md` and `docs/04-app-flow.md`:
  - conversations;
  - the label sidebar and menu;
  - bulk select;
  - keyboard shortcuts (§10);
  - attachment chips and preview;
  - the `sync_issue` line;
  - the read-only and paused states of the action buttons.

## 10. Frontend-only parts (no API)

- **Keyboard:**
  - `e`: archive (thread PATCH `state: done`);
  - `#`: delete (thread PATCH `trashed: true`);
  - `j`/`k`: next and previous;
  - `r`, `a`, `f` and `c` are wired to today's reply and compose where they exist, and wait for D3 otherwise.

  Shortcuts are off while focus is in an input, a textarea, a contenteditable or the HTML iframe.
- **Opening a conversation** PATCHes `is_read: true` on the thread when `unread_count > 0`.
- **Previews:**
  - Attachments are fetched with the bearer into a blob. Images and PDFs (`preview: true`) open in a viewer; the rest download.
  - `cid:` images are inlined into the sandboxed iframe as `data:` URLs.
- **Action buttons by connection state:**
  - with `two_way: false`, `paused_reason` set, or a disconnected mailbox, every action but Mute is disabled, with D1's banner text;
  - with Outlook or IMAP, the Gmail-only actions are hidden.

## 11. Room for D3

- `MailOutbox.op` is open-ended. D3 adds a nullable `draft` FK (to its Gmail draft model, or `customers.ReplyDraft`'s Gmail link) and ops `draft_create`, `draft_update`, `draft_delete` and `draft_send`. The flush dispatches by op, and the per-label collapse applies only to label rows.
- Sending stays inside today's claimed / unconfirmed / superseded states and never goes through the outbox's retries. `drafts.send` is not idempotent, and D3 decides how it meets the outbox.

## 12. Not in D2

- Drafts both ways, including agent `draft.reply` drafts in Gmail (D3).
- Sending changes (D3):
  - `threadId`, `In-Reply-To` and `References`;
  - Reply all and Forward;
  - CC and BCC on send;
  - attachments on send and the 25 MB limit;
  - the `sendAs` signature;
  - the formatting editor.
- "Search older mail in Gmail" (live `messages.list q=`) (D3).
- Label rename, delete, colour and nesting management. Gmail's own mute. Permanent delete (no scope allows it).
- Any write-back for Outlook or IMAP.
- Schedule send, undo send, snooze, filters, vacation responder (out of the round).
