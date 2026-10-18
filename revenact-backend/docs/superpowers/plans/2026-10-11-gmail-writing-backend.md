# Two-way Gmail, delivery 3 ("writing"): backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drafts both ways between Revenact and Gmail, and sending from Revenact as Gmail does it: new, reply, reply all and forward with To/Cc/Bcc, formatted HTML, attachments and the Gmail signature, threaded in Gmail; agent drafts that are also Gmail drafts; "Search older mail in Gmail". Outlook and IMAP keep today's paths.

**Architecture:**
- **Storage.** A new owner-only `MailDraft` (`services/mail/models.py`) is a Gmail draft's Revenact side. Its `message` is the Drafts folder's row: a placeholder (`pending-draft:<id>`) until Gmail creates the draft. `MailOutbox` gains three draft ops that carry no body.
- **Writing a draft.** `services/mail/drafts.py` checks and applies content (recipients, sanitised HTML, derived text, forwarded files, the record), bumps `revision`, refreshes the Drafts row and queues one draft row, all in the request's transaction under the contract's lock order. `services/mail/compose.py` builds the prefill (recipients, subject, quote, forward block, signature) and the customer suggestion in two queries.
- **Reaching Gmail.** `services/mail/mime.py` builds every outgoing message. `providers/base.http_upload` sends it to Gmail's upload endpoint. `services/mail/draft_flush.py` is the flush's draft step (after label creations, before label rows). `services/mail/draft_sync.py` maps Gmail's drafts back with `drafts.list` and settles vanished ones. `services/mail/send_as.py` keeps the send-as name and signature.
- **Sending.** `services/mail/draft_send.py` runs the contract's twelve steps inline: parts cached before the claim, the claim committed before Gmail is called, `drafts.send` or `messages.send`, then the draft's own row becomes the sent copy and is filed with `get_or_create`. `services/mail/sending.py` holds the parts, the MIME and the filing shared with the flush and the reconcile.
- **Today's routes.** `sync.send_email` and `reply_to` find the original through `Email.mail_message` and send Google mail through the same builder with `threadId` and headers.
- **Search.** `services/mail/gmail_search.py` runs a live `messages.list` and stores only the result a person opens.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL (CI and prod 16, local 15), urllib through `providers/base.http_json` and the new `http_upload` (no Google SDK), the standard library's `email` package for MIME, `nh3` (D1), `core.audit`, `services.notifications.realtime.notify`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §3 "Drafts, both ways" and "Sending (new and reply)", §4's D3 parts, §5 "Deliveries 3". Read it at `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-fe/docs/superpowers/specs/2026-10-10-gmail-two-way-design.md`.

**The binding contract** is `docs/superpowers/plans/2026-10-11-gmail-writing-api.md` in this worktree (commit `bf6fe86`). Its "Decisions made in this contract" override the spec, and every code, sentence, field, setting, ceiling and audit event in it is implemented exactly as written. Where this plan names a contract section (§3, decision 21), that is the contract's numbering. D1's contract (`2026-10-10-gmail-sync-api.md`) and D2's (`2026-10-11-gmail-actions-api.md`) still hold wherever D3 does not supersede them. D2's backend plan (`2026-10-11-gmail-actions-backend.md`) is the model for the code style used here.

## Contract gaps and how this plan resolves them

The code forced each of these, and the contract does not state them. The plan implements the answer shown; the controller confirms or changes each one.

1. **Sentences the contract leaves out.** An invalid address: `{"to": ["Enter a valid email address."]}` (DRF's `EmailField` sentence); a recipients field that is not a list: DRF's `'Expected a list of items but got type "str".'`; over `MAIL_SEND_MAX_RECIPIENTS`: `{"non_field_errors": ["A message can go to at most 100 people."]}`; a `forwarded` id that is not one of the source's files: `{"forwarded": ["Choose files from the message you are forwarding."]}`; `IS_DRAFT`'s detail: "This message is a draft."; a missing `gmail_id` on search open: `{"gmail_id": ["Choose a search result."]}`; a malformed `record`: `{"record": ["Choose a record you can open."]}`.
2. **A change of `record` alone** is saved without a revision bump and without a Gmail row: the record is Revenact's, not part of the Gmail draft.
3. **The record follows the suggestion only for `new` and `forward`.** A reply keeps its source's filed record (or none) until the person sets one. An agent draft's never moves.
4. **An edit while a `draft_create` is in flight** (`sending`) adds a waiting `draft_update`: the create carries the content it was built from, so without it the edit would never reach Gmail. A *pending* create needs nothing more, as the contract says.
5. **A `draft_update` with no Gmail id and no live create** (the create failed) runs as a create.
6. **A draft row going back to pending while a newer pending row stands on the same draft** would break `mail_outbox_one_pending_per_draft`. An old `draft_create` keeps its place and the newer `draft_update` is deleted (the create builds the current content); otherwise the old row is deleted (the newer one covers it).
7. **`draft_delete` deletes the `MailDraft` only when it is `discarded`.** A late create's Gmail draft for a *sent* draft is deleted in Gmail, and the sent draft's row stays until the 7-day prune.
8. **History never deletes a draft's row while the draft has a live draft row or is `sending`.** A Gmail-side edit racing a Revenact edit would otherwise cascade-delete the uploads on that row before the flush overwrites Gmail. A recreate (decision 9) and `DRAFT_GONE` put the row back on its `pending-draft:` id, so history's delete of the old Gmail id misses it.
9. **A Google disconnect** deletes live outbox rows (D2). Drafts that were `saving` become `local` (no Gmail id) or `failed` (a Gmail id), so the editor does not say "saving" forever.
10. **The signature marker survives sanitising.** `data-revenact-signature` is added to the nh3 allow-list on `div`; without it every write would strip the marker. Inbound mail may now keep that attribute too (harmless: it is inert).
11. **A Communications edit of a linked draft** (decision 31) drops whatever follows the first `"\n-- \n"` in the text (the signature text the mirror wrote) before re-paragraphing, and does not mirror the result back, so the person's text is kept as typed.
12. **The draft reconcile also runs whenever the send-as refresh runs** (the first tick after deploy and after every connect, then every 24 hours). Connections whose import finished before deploy would otherwise never run "the first tick after the import", and a daily `drafts.list` also catches anything history missed.
13. **A Gmail-side edit clears `forwarded`.** Gmail's copy already carries those files as its own parts; keeping both would send them twice.
14. **A draft sent from Gmail itself is filed at settlement** on the draft's record (`get_or_create`), so a linked `ReplyDraft`'s `sent_email` is the filed copy the contract names. History alone would only relabel the held row.
15. **The search reads the stored `paused_reason`** (the minute sweep keeps it current), as D2's `available` does, so it stays within 3 queries. Sending checks the pause live.
16. **Query ceilings.** Every ceiling test asserts the contract's number and that the count does not grow with recipients, ids or attachments. The exception is discard: deleting Drafts rows cascades through four relations (attachments with their file receiver, outbox rows, and two `SET_NULL`s from `MailDraft`). The tests assert that one id and three ids cost the same and stay ≤ 20; the contract's 10 is not reachable without raw SQL.
17. **`mailbox.reply`'s `to`** keeps each route's existing shape (pairs on `mail/messages/<id>/reply/`, addresses elsewhere). The draft send writes addresses.
18. **Gmail's 400 on search open** (a malformed id) is `404 NOT_IN_GMAIL`.
19. **Attachment names.** The `email` package writes `filename="..."` for an ASCII name and RFC 2231 `filename*=utf-8''...` only for a non-ASCII one. Both are valid; the plan does not force the encoded form.
20. **"The send-as address"** in the prefill is the connection's address: only the primary send-as entry is read (aliases are out of D3), and it is the mailbox's own address.
21. **Live Gmail checks** (does `drafts.send` send the supplied message; does Gmail accept a 25 MB-decoded message; does a Gmail-UI send keep the message id) cannot run in CI or this sandbox. Task 2 carries them as an owner-run step with the code change to make for each answer.
22. **revenact-infra:** `deploy/Caddyfile` has no `request_body` directive, and Caddy's default request body size is unlimited, so no infra branch or commit is made. Django's `DATA_UPLOAD_MAX_MEMORY_SIZE` (2.5 MB) does not count uploaded file data. Recorded in the final task.
23. **Reply-To** is honoured by the prefill (and so by every draft reply). Today's `mail/messages/<id>/reply/` keeps its recipients (to whoever wrote it), unchanged.
24. **A thread row's `draft`** is its anchor's.
25. **A Gmail draft the reconcile adopts** is `kind = reply` when its `References` names a held message in its thread (that message is the `source`), else `new`.
26. **A thread PATCH or `thread_of` whose messages are all live drafts** answers `409 IS_DRAFT`: there is nothing left to act on.

**Controller amendments (2026-10-11, recorded in the contract's §2 in this plan's commit):** the compose prefill also carries `total_bytes` (the forwarded files plus the html and its text; the files are 0 for a fresh compose) and `max_bytes` (26,214,400); the forward block is wrapped in `<div class="gmail_quote">`, like the reply quote, so the editor folds from the first `gmail_quote`; a draft's `sync_issue` keeps D2's `{text, at}` shape.

## Global Constraints

**Worktree and git:**
- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail3-be`, branch `feat/gmail-writing`, based on `bf6fe86`.
- `venv` (a symlink to `../gmail-be/venv`) and `.env` are untracked. Never commit them.
- Always `git add <explicit paths>`. Never `git add -A` or `git add .`.
- **Never use `git stash`.**
- Do not push.

**Commands:**
- Tests: `venv/bin/python manage.py test <labels> --parallel auto --noinput`. Never run the whole suite serially.
- Migrations: `venv/bin/python manage.py makemigrations mail --name mail_drafts`. Tests build their own database.
- Lint: `venv/bin/ruff check .` and `venv/bin/ruff format --check .`. Ruff formats Python fences inside Markdown too, so keep every doc code block ruff-clean (line length 100).
- **Before every commit**, run `venv/bin/ruff format <the task's .py files>` and then `venv/bin/ruff check --fix <the same files>`. Some code in this plan is not wrapped at 100 columns and some imports are not sorted; ruff fixes both. If ruff reports an unused import, delete it.

**Commit messages:** conventional (`feat(mail): ...`, `docs: ...`). Each ends with exactly this line, after a blank line:

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

**Settings** (`config/settings.py`, from the environment, defaults verbatim from contract §9):

| Setting | Default |
|---|---|
| `MAIL_SEND_MAX_BYTES` | `26214400` |
| `MAIL_SEND_MAX_RECIPIENTS` | `100` |
| `MAIL_DRAFT_MAX_ATTACHMENTS` | `25` |
| `MAIL_SEND_AS_REFRESH_HOURS` | `24` |
| `MAIL_OUTBOX_DRAFT_CALLS_PER_TICK` | `50` |
| `MAIL_SEND_TIMEOUT_SECONDS` | `120` |
| `MAIL_GMAIL_SEARCH_PAGE_SIZE` | `20` |
| `MAIL_DRAFT_SENT_RETENTION_DAYS` | `7` |
| `THROTTLE_MAIL_GMAIL_SEARCH` | `30/min` (scope `mail_gmail_search`, per user, `None` under test) |
| `THROTTLE_MAIL_DRAFT_UPLOAD` | `60/min` (scope `mail_draft_upload`, per user, `None` under test) |

`ATTACHMENT_MAX_BYTES` (25 MB per file) and `MAIL_HTML_MAX_BYTES` are reused.

**Errors:**
- Mail errors use `{"code": "...", "detail": "..."}` (`actions.error`); validation errors keep DRF's field shape.
- Every sentence is copied from the contract word for word, and gap 1's for the ones it leaves out.

**Privacy:**
- `MailDraft`, its Drafts row, its attachments, the prefill, the outbox and the search are owner-only. Every queryset scopes on `owner=request.user` or the caller's own connection. A manager, view-all holder, Leadership member or admin gets 404 on someone else's draft, prefill source, upload or search open.
- `ReplyDraft` readers are unchanged; only its owner sees `mail_draft_id`.
- Filed sends follow today's twice-filter. Bcc is never filed.

**No mail content in logs, notices or `error`:** a log line names the connection id, an HTTP status and a reason. Never a subject, a body, a file name, a query or an address other than the mailbox's own.

**The engine never does a full save of a connection.** Every write to a `MailboxConnection` from the tick, the flush or a request uses `save(update_fields=[...])`, `gmail_sync._write`/`_save`, or a queryset `update()`.

**A `MailDraft` is never saved in full once it can be `sending`:** `updated_at` is the claim's stamp then. Writes use `save(update_fields=[...])` naming the fields (Django's `auto_now` only writes `updated_at` when it is named) or a queryset `update()`.

**Postgres 16:** never a join de-duplicated with `.distinct()`. Use `id__in` subqueries.

**SOC 2:** annotate each enforcement point:
- `# SOC2:AUTH-02` (owner-only reads and writes, the record's visibility);
- `# SOC2:API-10` (uploads through `validate_upload`);
- `# SOC2:LOG-01` (each `audit.record`);
- `# SOC2:DATA-04` (the sent-draft prune).

**Tests:**
- Django's runner and `rest_framework.test.APITestCase`.
- Mail tests build on `services/mail/tests/gmail_fixtures.GmailFixture` (Dana reports to Carl, Carl to Alice; Pizza Hut is `pizzahut.com`; Dana, Carl and Priya hold the `lead` role with `VIEW_ALL_ACCOUNTS`). Its users have a membership and a seat, so a Google mailbox there is live and unpaused.
- D3's tests use `services/mail/tests/draft_fixtures.DraftFixture` (Task 5).
- Every test that reaches Google uses `GmailFixture.use_gmail()`, which from Task 2 patches both `services.mail.providers.google.http_json` and `services.mail.providers.google.http_upload` with a `FakeGmail`. **No test touches the network.**
- `transaction.on_commit` callbacks do not run inside `TestCase`. A test that asserts the wake or a deleted file wraps the request in `self.captureOnCommitCallbacks(execute=True)`.
- A query-ceiling test makes one warm-up request first (the user's role and capability lookups are then cached), then measures with `CaptureQueriesContext` and `assertLessEqual`. If a ceiling fails, print the captured SQL; remove an N+1 if there is one; if the extra query is structural, raise the bound in the test and report it to the controller as a contract gap.

**Outlook and IMAP are unchanged** apart from the shapes the contract adds (`draft: null` on rows, `GMAIL_ONLY` on the new routes, `mail_draft_id: null`) and the `In-Reply-To` lookup through `Email.mail_message`.

**Docs in the same PR (Task 17):** `docs/API_CONTRACTS.md` (the `api-contracts` skill), `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`, `.soc2/CONTROL_MAP.md`, and the `MailMessage` and `ReplyDraft` docstrings (Tasks 1 and 13).

**Out of scope (contract §12):** schedule send, undo send, snooze, send-as aliases, filters, the vacation responder, inline images in compose, Outlook or IMAP drafts or write-back, confidential mode, read receipts, templates, storing whole threads from a search open, signature editing, a draft list route, automatic settling of an unconfirmed send, and the frontend.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `config/settings.py`, `.env.example` | modify | the 10 settings |
| `core/throttling.py` | modify | `MailGmailSearchThrottle`, `MailDraftUploadThrottle` |
| `services/mail/models.py` | modify | `MailDraft`, `PENDING_DRAFT_PREFIX`, `DRAFT_OPS`, `MailOutbox.draft` and the draft ops, `Reason.TOO_LARGE`, the send-as fields, `MailMessage.reply_to` |
| `services/mail/migrations/0006_mail_drafts.py` | create (generated) | the schema |
| `services/mail/providers/base.py` | modify | `http_upload` (and `_open`, `_checked` shared with `http_json`), `Message.reply_to` |
| `services/mail/providers/google.py` | modify | `GmailSession` draft, send, sendAs, search and metadata calls; `GoogleProvider.send` through the builder and the upload; `Reply-To` parsed |
| `services/mail/mime.py` | create | the MIME builder |
| `services/mail/html.py` | modify | `clean` (no size cut), `to_text`, `paragraphs`, `SIGNATURE_ATTR` |
| `services/mail/sync.py` | modify | `sender_name`, `answering_headers`, `send_kwargs`; `send_email` and `reply_to` threaded |
| `services/mail/send_as.py` | create | the send-as refresh and the signature block |
| `services/mail/compose.py` | create | the prefill, the quote and forward blocks, the suggestion, record visibility |
| `services/mail/drafts.py` | create | content rules, create, edit, enqueue, the Drafts row, discard, payload, linked agent drafts |
| `services/mail/sending.py` | create | a draft's parts, its MIME, the sent copy, the filing |
| `services/mail/draft_flush.py` | create | the flush's draft rows |
| `services/mail/draft_send.py` | create | the send's twelve steps, confirm-sent and reopen |
| `services/mail/draft_sync.py` | create | the drafts.list reconcile and vanished drafts |
| `services/mail/gmail_search.py` | create | search and open |
| `services/mail/draft_views.py` | create | every new route |
| `services/mail/urls.py` | modify | the routes |
| `services/mail/outbox.py` | modify | draft verbs, the size clause, `draft_sentence` |
| `services/mail/outbox_flush.py` | modify | the draft step, draft rows going back, placeholders waiting, draft notices |
| `services/mail/gmail_sync.py` | modify | the send-as refresh and the draft reconcile in the tick; placeholders and drafts kept by the reconcile and history |
| `services/mail/gmail_store.py` | modify | `reply_to` stored |
| `services/mail/actions.py` | modify | `IS_DRAFT`, drafts left out of threads and bulk, `gmail_busy` |
| `services/mail/serializers.py`, `threads.py` | modify | `draft` on message and thread rows |
| `services/mail/views.py` | modify | the threading audit fields, `draft` joined, disconnect and drafts, the reconnect's send-as stamp |
| `services/mail/prune.py`, `services/customers/management/commands/run_health_maintenance.py` | modify | the sent-draft prune |
| `services/customers/drafts.py`, `drafts_views.py`, `communications_views.py`, `models.py` | modify | `mail_draft_id`, linked drafts on both rows, the audit fields, the docstring |
| `services/agents/actions/drafts.py` | modify | `apply` links, `undo` discards |
| `services/mail/tests/gmail_fake.py`, `gmail_fixtures.py`, `test_mail.py` | modify | the fake's new routes, both patches, `FakeProvider.send(**extra)` |
| `services/mail/tests/draft_fixtures.py` | create | `DraftFixture` |
| `services/mail/tests/test_draft_storage.py`, `test_mime.py`, `test_gmail_writes.py`, `test_send_threading.py`, `test_send_as.py`, `test_compose.py`, `test_drafts.py`, `test_draft_edit.py`, `test_draft_discard.py`, `test_draft_attachments.py`, `test_draft_flush.py`, `test_draft_send.py`, `test_draft_reconcile.py`, `test_draft_rows.py`, `test_gmail_search.py`, `test_draft_prune.py` | create | the tests |
| `services/customers/tests/test_linked_drafts.py` | create | agent drafts that are Gmail drafts |
| `e2e/test_gmail_writing_flow.py` | create | the whole journey over HTTP |
| `docs/...`, `.soc2/CONTROL_MAP.md` | modify | Task 17 |

---
### Task 1: Setup, storage, settings and throttles

**Files:**
- Modify: `config/settings.py` (after the `mail_attachment` throttle rate, the last D2 block, about line 570)
- Modify: `.env.example` (after `# THROTTLE_MAIL_ATTACHMENT=120/min`, line 120)
- Modify: `core/throttling.py` (after `MailAttachmentThrottle`)
- Modify: `services/mail/models.py` (constants; `MailboxConnection` fields; `MailMessage.reply_to` and its docstring; `MailOutbox`; new `MailDraft` after `MailOutbox`)
- Create: `services/mail/migrations/0006_mail_drafts.py` (generated)
- Test: `services/mail/tests/test_draft_storage.py`

**Interfaces:**
- Consumes: D1/D2 models, `GmailFixture`, `gmail_fake.fixture`.
- Produces:
  - `services.mail.models.PENDING_DRAFT_PREFIX = "pending-draft:"`;
  - `services.mail.models.DRAFT_OPS = ("draft_create", "draft_update", "draft_delete")`, also `MailOutbox.DRAFT_OPS`;
  - `MailOutbox.Op.DRAFT_CREATE | DRAFT_UPDATE | DRAFT_DELETE`, `MailOutbox.Reason.TOO_LARGE`, `MailOutbox.draft` (FK `MailDraft`, `related_name="outbox"`);
  - `MailDraft` with `Kind` (`NEW REPLY REPLY_ALL FORWARD`), `GmailState` (`LOCAL SAVING SAVED FAILED`), `Status` (`OPEN SENDING SENT DISCARDED`), `MailDraft.LIVE = ("open", "sending")`, and the contract §1 fields;
  - `MailboxConnection.send_as_name`, `signature_html`, `send_as_synced_at`; `MailMessage.reply_to`;
  - `core.throttling.MailGmailSearchThrottle` (scope `mail_gmail_search`), `MailDraftUploadThrottle` (scope `mail_draft_upload`);
  - the 10 settings.

- [ ] **Step 1: Set up the worktree**

The branch already exists with `venv` and `.env` in place. Confirm:

```bash
cd /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail3-be
git log --oneline -1
ls -l venv .env
grep -qx 'venv' "$(git rev-parse --git-common-dir)/info/exclude" || echo 'venv' >> "$(git rev-parse --git-common-dir)/info/exclude"
venv/bin/python -c "import nh3, django; print(django.get_version())"
git status --short
```

Expected: `bf6fe86 docs(plan): gmail two-way D3 writing API contract` (or this plan's commit on top of it), `venv -> ../gmail-be/venv`, `.env` present, `5.2.x`, and `git status` printing nothing.

Run: `venv/bin/python manage.py test services.mail services.customers --parallel auto --noinput`
Expected: OK. This is the baseline every later task keeps green.

- [ ] **Step 2: Write the failing tests**

Create `services/mail/tests/test_draft_storage.py`:

```python
"""Delivery 3's storage: the MailDraft row and its constraints, the outbox's
draft ops and their row shape, the send-as fields, Reply-To, the settings
and the throttles."""

import uuid

from django.conf import settings
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase
from django.utils import timezone

from services.mail import gmail_store
from services.mail.models import (
    DRAFT_OPS,
    PENDING_DRAFT_PREFIX,
    MailDraft,
    MailMessage,
    MailOutbox,
)

from .gmail_fake import fixture
from .gmail_fixtures import GmailFixture


class DraftStorageFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        self.row, _ = gmail_store.store_gmail(
            self.mailbox, fixture("message_full.json"), now=self.now
        )

    def draft(self, **fields):
        values = {
            "connection": self.mailbox,
            "owner": self.dana,
            "organisation": self.org,
            "kind": MailDraft.Kind.NEW,
        }
        values.update(fields)
        return MailDraft.objects.create(**values)

    def outbox(self, **fields):
        values = {
            "connection": self.mailbox,
            "action_id": uuid.uuid4(),
            "op": "draft_create",
            "next_attempt_at": self.now,
        }
        values.update(fields)
        return MailOutbox.objects.create(**values)


class MailDraftTests(DraftStorageFixture):
    def test_a_new_draft_is_open_local_at_revision_one_and_names_no_subject(self):
        draft = self.draft(subject="Renewal terms")
        self.assertEqual(
            (draft.status, draft.gmail_state, draft.revision, draft.record_chosen),
            ("open", "local", 1, False),
        )
        self.assertEqual((draft.to, draft.cc, draft.bcc, draft.forwarded), ([], [], [], []))
        self.assertEqual(str(draft), f"draft {draft.pk}")
        self.assertEqual(MailDraft.LIVE, ("open", "sending"))

    def test_a_gmail_draft_id_is_held_once_per_mailbox_and_blank_is_free(self):
        self.draft(gmail_draft_id="r-1")
        self.draft()
        self.draft()
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.draft(gmail_draft_id="r-1")

    def test_a_draft_files_on_at_most_one_record(self):
        self.draft(customer=self.pizza)
        self.draft(account=self.apac)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.draft(customer=self.pizza, account=self.apac)

    def test_the_drafts_row_and_a_message_deleted_leave_the_draft(self):
        draft = self.draft(message=self.row, source=self.row)
        self.assertEqual(self.row.draft, draft)
        self.row.delete()
        draft.refresh_from_db()
        self.assertEqual((draft.message_id, draft.source_id), (None, None))

    def test_the_placeholder_prefix(self):
        self.assertEqual(PENDING_DRAFT_PREFIX, "pending-draft:")


class DraftOutboxTests(DraftStorageFixture):
    def test_the_draft_ops_and_the_size_reason(self):
        self.assertEqual(DRAFT_OPS, ("draft_create", "draft_update", "draft_delete"))
        self.assertEqual(MailOutbox.DRAFT_OPS, DRAFT_OPS)
        self.assertEqual(MailOutbox.Op.DRAFT_DELETE.label, "Delete the draft")
        self.assertEqual(MailOutbox.Reason.TOO_LARGE, "too_large")

    def test_a_draft_op_has_a_draft_and_no_message_or_label(self):
        draft = self.draft()
        self.outbox(draft=draft)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="draft_update", draft=None)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="draft_update", draft=draft, message=self.row)

    def test_a_label_op_never_carries_a_draft(self):
        draft = self.draft()
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="read", message=self.row, label_key="UNREAD", add=False, draft=draft)

    def test_one_pending_draft_row_per_draft(self):
        draft = self.draft()
        self.outbox(draft=draft)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="draft_update", draft=draft)
        MailOutbox.objects.update(status="sending")
        self.outbox(op="draft_update", draft=draft)
        self.assertEqual(MailOutbox.objects.filter(draft=draft).count(), 2)

    def test_deleting_the_draft_takes_its_rows(self):
        draft = self.draft()
        self.outbox(draft=draft)
        draft.delete()
        self.assertFalse(MailOutbox.objects.exists())


class FieldTests(DraftStorageFixture):
    def test_the_send_as_fields_start_empty(self):
        self.assertEqual(
            (
                self.mailbox.send_as_name,
                self.mailbox.signature_html,
                self.mailbox.send_as_synced_at,
            ),
            ("", "", None),
        )

    def test_reply_to_starts_empty(self):
        self.assertEqual(MailMessage.objects.get(pk=self.row.pk).reply_to, [])


class SettingsTests(SimpleTestCase):
    def test_the_contract_defaults(self):
        self.assertEqual(
            (
                settings.MAIL_SEND_MAX_BYTES,
                settings.MAIL_SEND_MAX_RECIPIENTS,
                settings.MAIL_DRAFT_MAX_ATTACHMENTS,
                settings.MAIL_SEND_AS_REFRESH_HOURS,
                settings.MAIL_OUTBOX_DRAFT_CALLS_PER_TICK,
                settings.MAIL_SEND_TIMEOUT_SECONDS,
                settings.MAIL_GMAIL_SEARCH_PAGE_SIZE,
                settings.MAIL_DRAFT_SENT_RETENTION_DAYS,
            ),
            (26_214_400, 100, 25, 24, 50, 120, 20, 7),
        )

    def test_the_throttles_are_off_under_test(self):
        from core.throttling import MailDraftUploadThrottle, MailGmailSearchThrottle

        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertIsNone(rates["mail_gmail_search"])
        self.assertIsNone(rates["mail_draft_upload"])
        self.assertEqual(MailGmailSearchThrottle.scope, "mail_gmail_search")
        self.assertEqual(MailDraftUploadThrottle.scope, "mail_draft_upload")
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_storage --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'DRAFT_OPS' from 'services.mail.models'`.

- [ ] **Step 4: Settings and throttles**

In `config/settings.py`, after the `mail_attachment` rate block, add:

```python
# Two-way Gmail delivery 3: drafts and sending (services/mail/drafts.py, draft_send.py).
# Decision 20: every attachment's bytes plus the html and text bodies, decoded.
MAIL_SEND_MAX_BYTES = env.int("MAIL_SEND_MAX_BYTES", default=26_214_400)
MAIL_SEND_MAX_RECIPIENTS = env.int("MAIL_SEND_MAX_RECIPIENTS", default=100)
MAIL_DRAFT_MAX_ATTACHMENTS = env.int("MAIL_DRAFT_MAX_ATTACHMENTS", default=25)
MAIL_SEND_AS_REFRESH_HOURS = env.int("MAIL_SEND_AS_REFRESH_HOURS", default=24)
MAIL_OUTBOX_DRAFT_CALLS_PER_TICK = env.int("MAIL_OUTBOX_DRAFT_CALLS_PER_TICK", default=50)
# The upload calls carry up to about 34 MB.
MAIL_SEND_TIMEOUT_SECONDS = env.int("MAIL_SEND_TIMEOUT_SECONDS", default=120)
MAIL_GMAIL_SEARCH_PAGE_SIZE = env.int("MAIL_GMAIL_SEARCH_PAGE_SIZE", default=20)
# Sent MailDraft rows are pruned nightly; the sent message stays. SOC2:DATA-04
MAIL_DRAFT_SENT_RETENTION_DAYS = env.int("MAIL_DRAFT_SENT_RETENTION_DAYS", default=7)
# Per user: a search page costs about 105 of Gmail's 250 quota units a second.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["mail_gmail_search"] = (
    None if TESTING else env("THROTTLE_MAIL_GMAIL_SEARCH", default="30/min")
)
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["mail_draft_upload"] = (
    None if TESTING else env("THROTTLE_MAIL_DRAFT_UPLOAD", default="60/min")
)
```

In `.env.example`, after `# THROTTLE_MAIL_ATTACHMENT=120/min`, add:

```
# MAIL_SEND_MAX_BYTES=26214400
# MAIL_SEND_MAX_RECIPIENTS=100
# MAIL_DRAFT_MAX_ATTACHMENTS=25
# MAIL_SEND_AS_REFRESH_HOURS=24
# MAIL_OUTBOX_DRAFT_CALLS_PER_TICK=50
# MAIL_SEND_TIMEOUT_SECONDS=120
# MAIL_GMAIL_SEARCH_PAGE_SIZE=20
# MAIL_DRAFT_SENT_RETENTION_DAYS=7
# THROTTLE_MAIL_GMAIL_SEARCH=30/min
# THROTTLE_MAIL_DRAFT_UPLOAD=60/min
```

In `core/throttling.py`, after `MailAttachmentThrottle`, add:

```python
class MailGmailSearchThrottle(UserRateThrottle):
    """Search older mail in Gmail and opening a result (services/mail/draft_views.py),
    per user and shared by both: a page costs about 105 of Gmail's 250 quota units
    a second."""

    scope = "mail_gmail_search"
    rate = None  # resolved from DEFAULT_THROTTLE_RATES[scope]; tests patch this


class MailDraftUploadThrottle(UserRateThrottle):
    """Files added to a Gmail draft (services/mail/draft_views.py), per user."""

    scope = "mail_draft_upload"
    rate = None  # resolved from DEFAULT_THROTTLE_RATES[scope]; tests patch this
```

- [ ] **Step 5: The models**

In `services/mail/models.py`, after `PENDING_LABEL_PREFIX`, add:

```python
#: How a draft written in Revenact sits in Drafts until Gmail creates it
#: (D3 decision 2): its MailMessage's provider_message_id.
PENDING_DRAFT_PREFIX = "pending-draft:"
#: The outbox ops that carry a draft, not a message (D3 contract §1).
DRAFT_OPS = ("draft_create", "draft_update", "draft_delete")
```

In `MailboxConnection`, after `disconnected_at`, add:

```python
    # --- Gmail's send-as entry (D3 decision 18), refreshed by the tick ---
    send_as_name = models.CharField(max_length=150, blank=True)
    #: Gmail's signature, sanitised with services.mail.html (nh3).
    signature_html = models.TextField(blank=True)
    send_as_synced_at = models.DateTimeField(null=True, blank=True)
```

In `MailMessage`, after `bcc`, add:

```python
    #: The Reply-To header, [[name, address]]; Gmail rows from D3 on.
    reply_to = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
```

and replace the docstring's sentence "`state` is this product's own triage — done and muted leave the inbox without touching the mailbox." with:

```
    `state` is this product's own triage — done and muted leave the inbox
    without touching the mailbox. A Gmail draft's row (folder drafts) belongs
    to a `MailDraft` (`draft`): a placeholder `pending-draft:<id>` until Gmail
    has made it, and, once sent, the sent copy.
```

In `MailOutbox`:
- add to `Op`, after `LABEL_CREATE`:

```python
        DRAFT_CREATE = "draft_create", "Save the draft"
        DRAFT_UPDATE = "draft_update", "Save the draft"
        DRAFT_DELETE = "draft_delete", "Delete the draft"
```

- add to `Reason`, after `NAME_REFUSED`: `TOO_LARGE = "too_large", "Gmail refused the size"`;
- after `LIVE = ("pending", "sending")`, add `DRAFT_OPS = DRAFT_OPS`;
- after the `label` field, add:

```python
    draft = models.ForeignKey(
        "MailDraft", related_name="outbox", on_delete=models.CASCADE, null=True, blank=True
    )
```

- change the `payload` field's comment to `#: label_create: {"name"}; label_add / label_remove: {"label"}; draft_delete: {"gmail_draft_id"}.`;
- replace the `mail_outbox_row_shape` constraint and add the draft one:

```python
(
    models.CheckConstraint(
        condition=Q(
            op="label_create",
            label__isnull=False,
            message__isnull=True,
            draft__isnull=True,
        )
        | Q(op__in=DRAFT_OPS, draft__isnull=False, message__isnull=True, label__isnull=True)
        | (~Q(op__in=["label_create", *DRAFT_OPS]) & Q(message__isnull=False, draft__isnull=True)),
        name="mail_outbox_row_shape",
    ),
)
# Decision 6: a draft row carries no body, so one pending row per draft.
(
    models.UniqueConstraint(
        fields=["draft"],
        condition=Q(status="pending") & Q(op__in=DRAFT_OPS),
        name="mail_outbox_one_pending_per_draft",
    ),
)
```

- extend the class docstring's first sentence to: "One change on its way to Gmail (contract §1): a single label's target presence on one message, (`label_create`) one label to make, or (D3) one draft to create, update or delete. A draft row carries no body: the flush builds the MIME from the draft's content (D3 decision 6)."

After `MailOutbox` (before the `_delete_cached_file` receiver), add:

```python
class MailDraft(models.Model):
    """A Gmail draft, Revenact's side of it (D3 contract §1, decision 1).

    Owner-only, like the mailbox. `message` is the draft's row in Drafts: a
    placeholder (`pending-draft:<id>`) until Gmail has made the draft, then
    the draft's own message, and after a send the sent copy. Its content is
    sanitised HTML with the text derived from it; the MIME is built from it
    when the outbox or a send needs it (services/mail/sending.py).
    `revision` counts content changes from here or from Gmail, and a write
    from a stale one is refused (decision 8). `sending` and `discarded` are
    internal. A linked agent draft (`reply_draft`) is the same message seen
    twice (decision 3)."""

    class Kind(models.TextChoices):
        NEW = "new", "New message"
        REPLY = "reply", "Reply"
        REPLY_ALL = "reply_all", "Reply all"
        FORWARD = "forward", "Forward"

    class GmailState(models.TextChoices):
        LOCAL = "local", "Not in Gmail"
        SAVING = "saving", "Saving"
        SAVED = "saved", "Saved"
        FAILED = "failed", "Failed"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        #: Claimed by a send, Gmail not yet answered. Reads as sent.
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        #: Gone from Drafts, its draft_delete still on its way to Gmail.
        DISCARDED = "discarded", "Discarded"

    #: A draft the person still has: shown on its message row (§2).
    LIVE = ("open", "sending")

    connection = models.ForeignKey(
        MailboxConnection, related_name="drafts", on_delete=models.CASCADE
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name="mail_drafts", on_delete=models.CASCADE
    )
    organisation = models.ForeignKey(
        Organisation, related_name="mail_drafts", on_delete=models.CASCADE
    )
    message = models.OneToOneField(
        MailMessage, related_name="draft", on_delete=models.SET_NULL, null=True, blank=True
    )
    kind = models.CharField(max_length=9, choices=Kind.choices)
    #: What a reply or forward answers; null for a new message.
    source = models.ForeignKey(
        MailMessage, related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    #: Gmail's threadId, sent with every create, update and send.
    thread_id = models.CharField(max_length=255, blank=True)
    in_reply_to = models.CharField(max_length=998, blank=True)
    references = models.TextField(blank=True)
    to = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    cc = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    bcc = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    subject = models.CharField(max_length=255, blank=True)
    #: Sanitised at every write (services/mail/html.py).
    html = models.TextField(blank=True)
    #: Derived from `html` at every write; never taken from the client.
    text = models.TextField(blank=True)
    #: MailAttachment ids on `source` kept for a forward.
    forwarded = models.JSONField(default=list, blank=True)
    customer = models.ForeignKey(
        "customers.Customer", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    account = models.ForeignKey(
        "customers.Account", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    #: The person set the record: it stops following the suggestion.
    record_chosen = models.BooleanField(default=False)
    reply_draft = models.OneToOneField(
        "customers.ReplyDraft",
        related_name="mail_draft",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    gmail_draft_id = models.CharField(max_length=255, blank=True)
    #: The draft's message in Gmail, as last known (Gmail replaces it on every update).
    gmail_message_id = models.CharField(max_length=255, blank=True)
    gmail_state = models.CharField(
        max_length=8, choices=GmailState.choices, default=GmailState.LOCAL
    )
    revision = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=9, choices=Status.choices, default=Status.OPEN)
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_email = models.ForeignKey(
        "customers.Email", related_name="+", on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    #: The claim's stamp while sending: never saved in full then.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["connection", "gmail_draft_id"],
                condition=~Q(gmail_draft_id=""),
                name="mail_draft_once_per_mailbox",
            ),
            models.CheckConstraint(
                condition=Q(customer__isnull=True) | Q(account__isnull=True),
                name="mail_draft_on_at_most_one_record",
            ),
        ]
        indexes = [models.Index(fields=["owner", "status"], name="mail_draft_owner_idx")]

    def __str__(self):
        return f"draft {self.pk}"
```

- [ ] **Step 6: Generate the migration**

Run: `venv/bin/python manage.py makemigrations mail --name mail_drafts`
Expected: `services/mail/migrations/0006_mail_drafts.py` with `Create model MailDraft`, the three `MailboxConnection` fields, `MailMessage.reply_to`, `MailOutbox.draft`, altered `op` and `reason` choices, the removed and re-added `mail_outbox_row_shape`, and the new constraints and index.

Run: `venv/bin/python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 7: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_storage services.mail.tests.test_outbox_storage --parallel auto --noinput`
Expected: OK.

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff format config/settings.py core/throttling.py services/mail/models.py services/mail/tests/test_draft_storage.py
venv/bin/ruff check --fix config/settings.py core/throttling.py services/mail/models.py services/mail/tests/test_draft_storage.py
git add config/settings.py .env.example core/throttling.py services/mail/models.py services/mail/migrations/0006_mail_drafts.py services/mail/tests/test_draft_storage.py
git commit -m "$(cat <<'EOF'
feat(mail): store gmail drafts, draft outbox rows and send-as details

MailDraft is a Gmail draft's Revenact side, owner-only; the outbox gains
draft ops that carry no body; the connection keeps the send-as name and
signature; messages keep Reply-To. Settings and throttles for delivery 3.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 2: The MIME builder, the upload transport, Gmail's draft calls and the fake Gmail

**Files:**
- Create: `services/mail/mime.py`
- Modify: `services/mail/providers/base.py` (`http_json` split into `_checked` + `_open`; new `http_upload`)
- Modify: `services/mail/providers/google.py` (`UPLOAD_API`; `GmailSession._upload`, `_put`, `create_draft`, `update_draft`, `delete_draft`, `send_draft`, `send_message`, `list_drafts`, `send_as`, `search`, `metadata`)
- Modify: `services/mail/tests/gmail_fake.py` (uploads, drafts, sendAs, search, metadata, Gmail-UI helpers)
- Modify: `services/mail/tests/gmail_fixtures.py` (`use_gmail` patches `http_upload` too)
- Test: `services/mail/tests/test_mime.py`, `services/mail/tests/test_gmail_writes.py`

**Interfaces:**
- Consumes: Task 1's settings (`MAIL_SEND_TIMEOUT_SECONDS`).
- Produces:
  - `mime.Part(filename: str, mime_type: str, data: bytes, content_id: str = "")`;
  - `mime.Outgoing(from_name, from_address, to=[], cc=[], bcc=[], subject="", text="", html="", in_reply_to="", references="", attachments=[], related=[])`;
  - `mime.references_header(references: str, in_reply_to: str) -> str`; `mime.build(out: Outgoing) -> bytes`;
  - `providers.base.http_upload(method, url, *, headers=None, metadata=None, payload=b"", timeout=30) -> dict`;
  - `GmailSession.create_draft(raw, thread_id="") -> {"id", "message": {"id", "threadId", "labelIds"}}`; `update_draft(draft_id, raw, thread_id="")` (same shape); `delete_draft(draft_id)`; `send_draft(draft_id, raw, thread_id="") -> {"id", "threadId", "labelIds"}`; `send_message(raw, thread_id="")` (same); `list_drafts(page_token="") -> {"drafts": [...], "nextPageToken"}`; `send_as() -> list`; `search(q, page_token="", max_results=20) -> {"messages", "nextPageToken", "resultSizeEstimate"}`; `metadata(message_id, headers) -> dict | None`;
  - `send_draft` and `send_message` raise `SendUnconfirmed` (a `TimeoutError`) when no answer came back; every other failure is a `ProviderError`;
  - `FakeGmail.upload` (stands in for `http_upload`), `FakeGmail.uploads` (`(method, route, metadata, parsed email.message.EmailMessage)`), `FakeGmail.drafts` (`{draft id: message id}`), `FakeGmail.send_as`, `FakeGmail.write_draft(full) -> draft id`, `edit_draft(draft_id, full)`, `send_in_gmail(draft_id)`, `discard_in_gmail(draft_id)`, and `gmail_message(..., reply_to="")`.

- [ ] **Step 1: Write the failing MIME tests**

Create `services/mail/tests/test_mime.py`:

```python
"""The MIME builder (D3 contract §4 "The message"): text alone, or
multipart/alternative; files make multipart/mixed; a forward's inline
images ride in multipart/related; From is RFC 2047 encoded; In-Reply-To and
References answer the source; no Message-ID; Bcc kept in the owner's copy."""

import email
from email import policy

from django.test import SimpleTestCase

from services.mail import mime


def parsed(out):
    return email.message_from_bytes(mime.build(out), policy=policy.default)


def outgoing(**fields):
    values = {
        "from_name": "Dana Ruiz",
        "from_address": "dana@acme.io",
        "to": [["Ann Lee", "ann@pizzahut.com"]],
        "subject": "Re: Renewal terms",
        "text": "Works for us.",
    }
    values.update(fields)
    return mime.Outgoing(**values)


class MimeTests(SimpleTestCase):
    def test_text_alone_is_one_text_part_with_the_headers(self):
        message = parsed(outgoing())
        self.assertEqual(message.get_content_type(), "text/plain")
        self.assertEqual(message.get_content().strip(), "Works for us.")
        self.assertEqual(message["From"].addresses[0].display_name, "Dana Ruiz")
        self.assertEqual(message["From"].addresses[0].addr_spec, "dana@acme.io")
        self.assertEqual(message["To"].addresses[0].addr_spec, "ann@pizzahut.com")
        self.assertEqual(str(message["Subject"]), "Re: Renewal terms")
        self.assertIsNotNone(message["Date"])
        self.assertIsNone(message["Message-ID"])
        self.assertIsNone(message["In-Reply-To"])

    def test_html_makes_an_alternative_text_first(self):
        message = parsed(outgoing(html="<p>Works for us.</p>"))
        self.assertEqual(message.get_content_type(), "multipart/alternative")
        plain, html = message.get_payload()
        self.assertEqual(plain.get_content_type(), "text/plain")
        self.assertEqual(html.get_content_type(), "text/html")
        self.assertIn("<html><body><p>Works for us.</p></body></html>", html.get_content())

    def test_files_make_a_mixed_message(self):
        quote = mime.Part("Quote v2.pdf", "application/pdf", b"%PDF-1.4 quote")
        message = parsed(outgoing(html="<p>Attached.</p>", attachments=[quote]))
        self.assertEqual(message.get_content_type(), "multipart/mixed")
        body, attached = message.get_payload()
        self.assertEqual(body.get_content_type(), "multipart/alternative")
        self.assertEqual(attached.get_content_disposition(), "attachment")
        self.assertEqual(attached.get_filename(), "Quote v2.pdf")
        self.assertEqual(attached.get_content_type(), "application/pdf")
        self.assertEqual(attached.get_content(), b"%PDF-1.4 quote")

    def test_a_forwards_inline_images_ride_in_related_around_the_html(self):
        logo = mime.Part("logo.png", "image/png", b"\x89PNG logo", content_id="logo@pizzahut")
        message = parsed(
            outgoing(html='<p>See below.</p><img src="cid:logo@pizzahut">', related=[logo])
        )
        plain, related = message.get_payload()
        self.assertEqual(related.get_content_type(), "multipart/related")
        html, image = related.get_payload()
        self.assertEqual(html.get_content_type(), "text/html")
        self.assertEqual(image["Content-ID"], "<logo@pizzahut>")
        self.assertEqual(image.get_content(), b"\x89PNG logo")

    def test_a_reply_answers_its_source_with_the_newest_twenty_references(self):
        older = " ".join(f"<m{n}@x>" for n in range(25))
        message = parsed(outgoing(in_reply_to="<quote@x>", references=older))
        self.assertEqual(message["In-Reply-To"], "<quote@x>")
        ids = str(message["References"]).split()
        self.assertEqual(len(ids), 20)
        self.assertEqual(ids[-1], "<quote@x>")
        self.assertEqual(ids[0], "<m6@x>")

    def test_references_name_each_id_once(self):
        self.assertEqual(mime.references_header("<a@x> <b@x>", "<b@x>"), "<a@x> <b@x>")
        self.assertEqual(mime.references_header("", "<b@x>"), "<b@x>")

    def test_cc_and_bcc_are_kept_in_the_owners_copy(self):
        message = parsed(outgoing(cc=[["", "ops@pizzahut.com"]], bcc=[["", "carl@acme.io"]]))
        self.assertEqual(message["Cc"].addresses[0].addr_spec, "ops@pizzahut.com")
        self.assertEqual(message["Bcc"].addresses[0].addr_spec, "carl@acme.io")

    def test_a_non_ascii_name_is_encoded(self):
        raw = mime.build(outgoing(from_name="Dána Ruíz"))
        self.assertIn(b"=?utf-8?", raw.split(b"\r\n\r\n", 1)[0])
        self.assertEqual(
            parsed(outgoing(from_name="Dána Ruíz"))["From"].addresses[0].display_name, "Dána Ruíz"
        )

    def test_an_unknown_type_goes_as_octet_stream(self):
        odd = mime.Part("notes", "", b"plain bytes")
        attached = parsed(outgoing(attachments=[odd])).get_payload()[1]
        self.assertEqual(attached.get_content_type(), "application/octet-stream")
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_mime --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'mime' from 'services.mail'`.

- [ ] **Step 3: Write the builder**

Create `services/mail/mime.py`:

```python
"""Outgoing mail as MIME (D3 contract §4 "The message", decision 19).

One builder for every Gmail write that carries a message: drafts.create,
drafts.update, drafts.send and messages.send, and today's send routes on a
Google mailbox. The body is text/plain alone when there is no HTML (today's
routes), else multipart/alternative (text, then html); a forward's quoted
inline images ride in multipart/related around the html; files make the
whole multipart/mixed. No Message-ID: Gmail sets its own (decision 24).
Bcc stays in the owner's copy; Gmail strips it on delivery.
"""

from dataclasses import dataclass, field
from email.headerregistry import Address
from email.message import EmailMessage
from email.policy import SMTP
from email.utils import formatdate

#: References keeps the newest ids only (contract §4).
REFERENCES_KEPT = 20


@dataclass
class Part:
    filename: str
    mime_type: str
    data: bytes
    #: Set for an inline image the html references as cid:<content_id>.
    content_id: str = ""


@dataclass
class Outgoing:
    from_name: str
    from_address: str
    to: list = field(default_factory=list)
    cc: list = field(default_factory=list)
    bcc: list = field(default_factory=list)
    subject: str = ""
    text: str = ""
    html: str = ""
    in_reply_to: str = ""
    #: The source's own References header; `in_reply_to` is added to it.
    references: str = ""
    attachments: list = field(default_factory=list)
    related: list = field(default_factory=list)


def references_header(references, in_reply_to):
    """`references` then `in_reply_to`, each id once, the newest REFERENCES_KEPT."""
    ids = [*(references or "").split(), *([in_reply_to] if in_reply_to else [])]
    return " ".join(list(dict.fromkeys(ids))[-REFERENCES_KEPT:])


def _split(mime_type):
    maintype, _, subtype = (mime_type or "").strip().lower().partition("/")
    if not maintype or not subtype or maintype == "multipart":
        return "application", "octet-stream"
    return maintype, subtype


def _addresses(pairs):
    return [Address(display_name=name or "", addr_spec=address) for name, address in pairs]


def build(out):
    """The message's bytes, CRLF line ends, ready for an upload."""
    message = EmailMessage(policy=SMTP)
    message["From"] = Address(display_name=out.from_name or "", addr_spec=out.from_address)
    for header, pairs in (("To", out.to), ("Cc", out.cc), ("Bcc", out.bcc)):
        if pairs:
            message[header] = _addresses(pairs)
    message["Subject"] = out.subject or ""
    message["Date"] = formatdate(usegmt=True)
    if out.in_reply_to:
        message["In-Reply-To"] = out.in_reply_to
        message["References"] = references_header(out.references, out.in_reply_to)
    message.set_content(out.text or "", subtype="plain", charset="utf-8")
    if out.html:
        message.add_alternative(
            f"<html><body>{out.html}</body></html>", subtype="html", charset="utf-8"
        )
        if out.related:
            html_part = message.get_payload()[1]
            for part in out.related:
                maintype, subtype = _split(part.mime_type)
                html_part.add_related(
                    part.data,
                    maintype=maintype,
                    subtype=subtype,
                    cid=f"<{part.content_id}>",
                    filename=part.filename,
                    disposition="inline",
                )
    for part in out.attachments:
        maintype, subtype = _split(part.mime_type)
        message.add_attachment(
            part.data, maintype=maintype, subtype=subtype, filename=part.filename
        )
    return message.as_bytes()
```

Run: `venv/bin/python manage.py test services.mail.tests.test_mime --parallel auto --noinput`
Expected: OK.

- [ ] **Step 4: Write the failing transport tests**

Create `services/mail/tests/test_gmail_writes.py`:

```python
"""Gmail's write calls for delivery 3 (decision 19): every call that carries
a message goes to the upload endpoint as multipart/related (JSON metadata,
then the message), under the same host allow-list; a send that got no
answer is SendUnconfirmed, never a plain failure; the draft, sendAs, search
and metadata calls, against the fake Gmail."""

import email
import json
from email import policy
from unittest.mock import patch

from django.test import SimpleTestCase

from services.mail import mime
from services.mail.providers.base import Credentials, ProviderError, SendUnconfirmed, http_upload
from services.mail.providers.google import GmailSession

from .gmail_fake import FakeGmail, gmail_message
from .gmail_fixtures import CREDENTIALS, GmailFixture

RAW = mime.build(
    mime.Outgoing(
        from_name="Dana Ruiz",
        from_address="dana@acme.io",
        to=[["Ann Lee", "ann@pizzahut.com"]],
        subject="Renewal",
        text="Works for us.",
    )
)


class Answer:
    def __init__(self, body):
        self.body = body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class HttpUploadTests(SimpleTestCase):
    def test_metadata_then_the_message_as_multipart_related(self):
        seen = {}

        def urlopen(request, timeout):
            seen.update(request=request, timeout=timeout)
            return Answer(b'{"id": "s1"}')

        with patch("services.mail.providers.base.urllib.request.urlopen", urlopen):
            answer = http_upload(
                "POST",
                "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart",
                headers={"Authorization": "Bearer t"},
                metadata={"threadId": "t1"},
                payload=RAW,
                timeout=120,
            )
        self.assertEqual(answer, {"id": "s1"})
        request = seen["request"]
        self.assertEqual((request.get_method(), seen["timeout"]), ("POST", 120))
        content_type = request.get_header("Content-type")
        self.assertTrue(content_type.startswith('multipart/related; boundary="'))
        boundary = content_type.split('boundary="', 1)[1].rstrip('"').encode()
        parts = request.data.split(b"--" + boundary)
        self.assertIn(b"Content-Type: application/json; charset=UTF-8", parts[1])
        self.assertEqual(json.loads(parts[1].split(b"\r\n\r\n", 1)[1]), {"threadId": "t1"})
        self.assertIn(b"Content-Type: message/rfc822", parts[2])
        self.assertIn(RAW, parts[2])
        self.assertEqual(parts[3].strip(), b"--")

    def test_a_host_off_the_list_is_refused_before_any_request(self):
        with patch("services.mail.providers.base.urllib.request.urlopen") as urlopen:
            with self.assertRaises(ProviderError):
                http_upload("POST", "https://example.com/upload", payload=RAW)
        urlopen.assert_not_called()


class SessionTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.session = GmailSession(Credentials(address="dana@acme.io", data=dict(CREDENTIALS)))

    def test_a_draft_is_created_updated_listed_and_deleted(self):
        made = self.session.create_draft(RAW, "t1")
        draft_id, first = made["id"], made["message"]["id"]
        self.assertEqual(made["message"]["threadId"], "t1")
        self.assertEqual(self.fake.messages[first]["labelIds"], ["DRAFT"])
        method, route, metadata, message = self.fake.uploads[-1]
        self.assertEqual(
            (method, route, metadata), ("POST", "/drafts", {"message": {"threadId": "t1"}})
        )
        self.assertEqual(str(message["Subject"]), "Renewal")
        updated = self.session.update_draft(draft_id, RAW, "t1")
        self.assertEqual(updated["id"], draft_id)
        self.assertNotEqual(updated["message"]["id"], first)
        self.assertNotIn(first, self.fake.messages)
        self.assertEqual(
            self.fake.uploads[-1][:3],
            ("PUT", f"/drafts/{draft_id}", {"id": draft_id, "message": {"threadId": "t1"}}),
        )
        listed = self.session.list_drafts()
        self.assertEqual(
            listed["drafts"],
            [{"id": draft_id, "message": {"id": updated["message"]["id"], "threadId": "t1"}}],
        )
        self.session.delete_draft(draft_id)
        self.assertEqual(self.fake.drafts, {})
        with self.assertRaises(ProviderError) as caught:
            self.session.delete_draft(draft_id)
        self.assertEqual(caught.exception.status, 404)

    def test_an_unknown_draft_is_a_404_on_update_and_send(self):
        for call in (self.session.update_draft, self.session.send_draft):
            with self.assertRaises(ProviderError) as caught:
                call("r-nope", RAW)
            self.assertEqual(caught.exception.status, 404)

    def test_sending_a_draft_and_a_message(self):
        draft_id = self.session.create_draft(RAW)["id"]
        sent = self.session.send_draft(draft_id, RAW)
        self.assertEqual(self.fake.messages[sent["id"]]["labelIds"], ["SENT"])
        self.assertEqual(self.fake.drafts, {})
        self.assertEqual(
            self.fake.uploads[-1][:3], ("POST", "/drafts/send", {"id": draft_id, "message": {}})
        )
        direct = self.session.send_message(RAW, "t9")
        self.assertEqual(direct["threadId"], "t9")
        self.assertEqual(self.fake.uploads[-1][:3], ("POST", "/messages/send", {"threadId": "t9"}))
        self.session.send_message(RAW)
        self.assertEqual(self.fake.uploads[-1][2], {})

    def test_no_answer_on_a_send_is_unconfirmed_and_on_a_draft_save_a_failure(self):
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            with self.assertRaises(SendUnconfirmed):
                self.session.send_message(RAW)
            with self.assertRaises(ProviderError):
                self.session.create_draft(RAW)

    def test_a_refusal_on_a_send_is_a_provider_error(self):
        self.fake.fail(r"/messages/send$", 413, "tooLarge")
        with self.assertRaises(ProviderError) as caught:
            self.session.send_message(RAW)
        self.assertEqual(caught.exception.status, 413)

    def test_drafts_list_pages(self):
        for _ in range(3):
            self.session.create_draft(RAW)
        first = self.session.list_drafts()
        self.assertEqual(len(first["drafts"]), 2)
        second = self.session.list_drafts(first["nextPageToken"])
        self.assertEqual(len(second["drafts"]), 1)
        self.assertNotIn("nextPageToken", second)

    def test_send_as_and_metadata(self):
        [entry] = self.session.send_as()
        self.assertEqual((entry["sendAsEmail"], entry["isPrimary"]), ("dana@acme.io", True))
        self.fake.add(
            gmail_message(
                "g1",
                subject="Renewal",
                attachments=[{"filename": "q.pdf", "mime_type": "application/pdf", "size": 3}],
            ),
            quietly=True,
        )
        meta = self.session.metadata("g1", ["From", "Subject"])
        names = {header["name"] for header in meta["payload"]["headers"]}
        self.assertEqual(names, {"From", "Subject"})
        self.assertTrue(any(part.get("filename") for part in meta["payload"]["parts"]))
        self.assertIsNone(self.session.metadata("gone", ["From"]))

    def test_search_leaves_out_spam_and_trash_and_matches_words(self):
        self.fake.add(gmail_message("a", subject="2024 renewal", labels=["INBOX"]), quietly=True)
        self.fake.add(gmail_message("b", subject="renewal spam", labels=["SPAM"]), quietly=True)
        self.fake.add(
            gmail_message("c", subject="Lunch", text="Pizza on Friday", labels=["INBOX"]),
            quietly=True,
        )
        found = self.session.search("renewal -in:chats", max_results=20)
        self.assertEqual([stub["id"] for stub in found["messages"]], ["a"])
        query = self.fake.calls[-1][2]
        self.assertEqual((query["includeSpamTrash"], query["maxResults"]), ("false", "20"))


class FakeGmailUiTests(SimpleTestCase):
    def test_drafts_written_edited_sent_and_discarded_in_gmail(self):
        fake = FakeGmail()
        draft_id = fake.write_draft(gmail_message("d1", labels=["DRAFT"]))
        self.assertEqual(fake.drafts, {draft_id: "d1"})
        fake.edit_draft(draft_id, gmail_message("d2"))
        self.assertEqual((fake.drafts[draft_id], "d1" in fake.messages), ("d2", False))
        self.assertEqual(fake.messages["d2"]["labelIds"], ["DRAFT"])
        fake.send_in_gmail(draft_id)
        self.assertEqual((fake.drafts, fake.messages["d2"]["labelIds"]), ({}, ["SENT"]))
        other = fake.write_draft(gmail_message("d3"))
        fake.discard_in_gmail(other)
        self.assertNotIn("d3", fake.messages)

    def test_an_upload_is_parsed_into_a_stored_message_with_its_files(self):
        fake = FakeGmail()
        raw = mime.build(
            mime.Outgoing(
                from_name="Dana",
                from_address="dana@acme.io",
                to=[["", "ann@pizzahut.com"]],
                subject="Quote",
                text="Attached.",
                attachments=[mime.Part("q.pdf", "application/pdf", b"%PDF-1")],
            )
        )
        answer = fake.upload(
            "POST",
            "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart",
            metadata={},
            payload=raw,
        )
        full = fake.messages[answer["id"]]
        self.assertEqual(full["labelIds"], ["SENT"])
        [part] = [p for p in full["payload"]["parts"] if p.get("filename")]
        self.assertEqual(part["filename"], "q.pdf")
        self.assertEqual(fake.files[part["body"]["attachmentId"]], b"%PDF-1")
        parsed = email.message_from_bytes(raw, policy=policy.default)
        self.assertEqual(fake.uploads[-1][3]["Subject"], parsed["Subject"])
```

- [ ] **Step 5: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_gmail_writes --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'http_upload' from 'services.mail.providers.base'`.

- [ ] **Step 6: `http_upload`**

In `services/mail/providers/base.py`, add `import secrets` to the imports, and replace `http_json` with:

```python
def _checked(url, allowed_hosts=None):
    """Refuses any URL that is not https on an allowed host."""
    permitted = allowed_hosts if allowed_hosts is not None else ALLOWED_HOSTS
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in permitted:
        raise ProviderError(f"refusing to call {parts.hostname or url!r}: host not allowed")


def _open(request, url, timeout):
    """One round-trip; the JSON answer, or ProviderError with the body's message."""
    try:
        # https only, host allow-listed by _checked (semgrep: dynamic-urllib-use)
        with urllib.request.urlopen(request, timeout=timeout) as response:  # nosemgrep
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode(errors="replace")
        reason = error_reason(raw)
        raise ProviderError(
            f"{exc.code} from {urllib.parse.urlsplit(url).netloc}: {raw[:500]}",
            # A rate limit is not a lost grant (Google answers some with 403).
            reauth=exc.code == 401 or (exc.code == 403 and reason not in RATE_LIMIT_REASONS),
            status=exc.code,
            reason=reason,
            retry_after=_retry_after(exc.headers),
        ) from exc
    except urllib.error.URLError as exc:
        raise ProviderError(
            f"could not reach {urllib.parse.urlsplit(url).netloc}: {exc.reason}"
        ) from exc


def http_json(method, url, *, headers=None, data=None, form=None, timeout=30, allowed_hosts=None):
    """One JSON round-trip. `form` posts urlencoded (OAuth token endpoints),
    `data` posts JSON. Raises ProviderError with the body's message.

    `allowed_hosts` lets another caller supply its own allow-list rather than
    widening this module's: `services.identity.domains` resolves DNS over
    HTTPS through here, and a resolver is not a mail provider host. The check
    itself is never optional — omitting the argument keeps the mail list."""
    _checked(url, allowed_hosts)
    body = None
    headers = dict(headers or {})
    if form is not None:
        body = urllib.parse.urlencode(form).encode()
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif data is not None:
        body = json.dumps(data).encode()
        headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    return _open(request, url, timeout)


def http_upload(method, url, *, headers=None, metadata=None, payload=b"", timeout=30):
    """One Gmail upload (`uploadType=multipart`, D3 decision 19): `metadata`
    as the JSON part, `payload` (a whole RFC 822 message) as the media part.
    The same host allow-list and errors as http_json. A timeout or a dropped
    connection once the body went out is raised as it is: for a send, the
    caller treats it as possibly sent."""
    _checked(url)
    boundary = f"revenact{secrets.token_hex(16)}"
    body = b"".join(
        [
            f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode(),
            json.dumps(metadata or {}).encode(),
            f"\r\n--{boundary}\r\nContent-Type: message/rfc822\r\n\r\n".encode(),
            payload,
            f"\r\n--{boundary}--".encode(),
        ]
    )
    headers = {**(headers or {}), "Content-Type": f'multipart/related; boundary="{boundary}"'}
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    return _open(request, url, timeout)
```

- [ ] **Step 7: The session's calls**

In `services/mail/providers/google.py`:
- import `SendUnconfirmed` and `http_upload` from `.base` (alphabetical in the existing import list);
- after `API = ...`, add `UPLOAD_API = "https://gmail.googleapis.com/upload/gmail/v1/users/me"`;
- add these methods to `GmailSession`, after `attachment`:

```python
class GmailSession:  # the methods below are added to the existing class
    def _upload(self, method, path, metadata, raw, *, sending=False):
        """One upload (decision 19), refreshed and retried once on a 401 as
        _call is. `sending`: no answer after the request went out may mean
        Gmail sent it, so it is SendUnconfirmed (D3 §4, settling), never a
        ProviderError that would reopen the draft."""
        url = f"{UPLOAD_API}{path}?uploadType=multipart"
        self.creds = self._provider._fresh(self.creds)
        try:
            return self._put(method, url, metadata, raw, sending)
        except ProviderError as exc:
            if exc.status != 401 or self._retried:
                raise
        self._retried = True
        self.creds = self._provider._fresh(self.creds, force=True)
        return self._put(method, url, metadata, raw, sending)

    def _put(self, method, url, metadata, raw, sending):
        try:
            return http_upload(
                method,
                url,
                headers=GoogleProvider._auth(self.creds),
                metadata=metadata,
                payload=raw,
                timeout=settings.MAIL_SEND_TIMEOUT_SECONDS,
            )
        except (OSError, http.client.HTTPException, ValueError) as exc:
            if sending:
                raise SendUnconfirmed(f"Gmail did not answer: {type(exc).__name__}") from exc
            raise ProviderError(f"Gmail did not answer: {type(exc).__name__}") from exc

    @staticmethod
    def _thread(thread_id):
        return {"threadId": thread_id} if thread_id else {}

    def create_draft(self, raw, thread_id=""):
        return self._upload("POST", "/drafts", {"message": self._thread(thread_id)}, raw)

    def update_draft(self, draft_id, raw, thread_id=""):
        """Gmail replaces the draft's message: the answer names the new one."""
        return self._upload(
            "PUT",
            f"/drafts/{quote(draft_id, safe='')}",
            {"id": draft_id, "message": self._thread(thread_id)},
            raw,
        )

    def delete_draft(self, draft_id):
        return self._call("DELETE", f"/drafts/{quote(draft_id, safe='')}")

    def send_draft(self, draft_id, raw, thread_id=""):
        """Sends the draft with this message (decision 19); never repeated."""
        return self._upload(
            "POST",
            "/drafts/send",
            {"id": draft_id, "message": self._thread(thread_id)},
            raw,
            sending=True,
        )

    def send_message(self, raw, thread_id=""):
        """Sends a message Gmail holds no draft of; never repeated."""
        return self._upload("POST", "/messages/send", self._thread(thread_id), raw, sending=True)

    def list_drafts(self, page_token=""):
        params = {"maxResults": 500}
        if page_token:
            params["pageToken"] = page_token
        return self._call("GET", "/drafts", params=params)

    def send_as(self):
        return self._call("GET", "/settings/sendAs").get("sendAs", [])

    def search(self, q, page_token="", max_results=20):
        """The person's own query (D3 decision 28): spam and trash left out,
        unlike the import's list_messages."""
        params = {"q": q, "maxResults": max_results, "includeSpamTrash": "false"}
        if page_token:
            params["pageToken"] = page_token
        return self._call("GET", "/messages", params=params)

    def metadata(self, message_id, headers):
        """format=metadata with only `headers`, or None when Gmail no longer has it."""
        try:
            return self._call(
                "GET",
                f"/messages/{quote(message_id, safe='')}",
                params={"format": "metadata", "metadataHeaders": list(headers)},
            )
        except ProviderError as exc:
            if exc.status == 404:
                return None
            raise
```

(The `class GmailSession:` line above only shows where the methods go; add the methods inside the existing class.)

- [ ] **Step 8: The fake Gmail**

In `services/mail/tests/gmail_fake.py`:
- add `import email` and `from email import policy` to the imports;
- after `API_PREFIX`, add `UPLOAD_PREFIX = "/upload/gmail/v1/users/me"`;
- give `gmail_message` a `reply_to=""` keyword (after `references`), added to the header loop: `for name, value in (("Cc", cc), ("Bcc", bcc), ("References", references), ("Reply-To", reply_to)):`;
- in `FakeGmail`, add `DRAFTS_PAGE = 2` beside `HISTORY_PAGE`, and at the end of `__init__`:

```python
        #: (method, route, metadata, the parsed message) of every upload.
        self.uploads = []
        #: Gmail draft id -> the draft's message id.
        self.drafts = {}
        self._minted = 0
        #: users.settings.sendAs.list.
        self.send_as = [
            {
                "sendAsEmail": address,
                "displayName": "Dana Ruiz",
                "signature": '<div dir="ltr">Dana Ruiz<br>Acme</div>',
                "isPrimary": True,
                "isDefault": True,
            }
        ]
```

- add these methods after `attach_file`:

```python
class FakeGmail:  # the methods below are added to the existing class
    def _mint(self, prefix):
        self._minted += 1
        return f"{prefix}{self._minted}"

    def _store_raw(self, message_id, thread_id, labels, raw):
        """An uploaded message stored as Gmail would, its files attachable."""
        parsed = email.message_from_bytes(raw, policy=policy.default)
        text = html = ""
        files = []
        for part in parsed.walk():
            if part.is_multipart():
                continue
            if part.get_filename():
                files.append(part)
            elif part.get_content_type() == "text/plain" and not text:
                text = part.get_content()
            elif part.get_content_type() == "text/html" and not html:
                html = part.get_content()
        full = gmail_message(
            message_id,
            labels=labels,
            sender=str(parsed["From"] or ""),
            to=str(parsed["To"] or ""),
            cc=str(parsed["Cc"] or ""),
            bcc=str(parsed["Bcc"] or ""),
            subject=str(parsed["Subject"] or ""),
            text=text,
            html=html,
            thread_id=thread_id,
            references=str(parsed["References"] or ""),
            attachments=[
                {
                    "filename": part.get_filename(),
                    "mime_type": part.get_content_type(),
                    "size": len(part.get_payload(decode=True) or b""),
                    "inline": part.get_content_disposition() == "inline",
                    "content_id": str(part["Content-ID"] or "").strip("<>"),
                }
                for part in files
            ],
        )
        self.add(full)
        for n, part in enumerate(files, start=1):
            self.attach_file(message_id, str(n), part.get_payload(decode=True) or b"")
        return message_id

    def write_draft(self, full):
        """A draft written in Gmail itself; its draft id."""
        full = copy.deepcopy(full)
        full["labelIds"] = ["DRAFT"]
        self.add(full)
        draft_id = self._mint("r-")
        self.drafts[draft_id] = full["id"]
        return draft_id

    def edit_draft(self, draft_id, full):
        """The draft edited in Gmail: its message replaced by `full`."""
        self.remove(self.drafts[draft_id])
        full = copy.deepcopy(full)
        full["labelIds"] = ["DRAFT"]
        self.add(full)
        self.drafts[draft_id] = full["id"]

    def send_in_gmail(self, draft_id):
        """Sent from Gmail itself: the message keeps its id and becomes SENT."""
        self.relabel(self.drafts.pop(draft_id), ["SENT"])

    def discard_in_gmail(self, draft_id):
        self.remove(self.drafts.pop(draft_id))

    def _draft_page(self, query):
        items = [
            {
                "id": draft_id,
                "message": {"id": message_id, "threadId": self.messages[message_id]["threadId"]},
            }
            for draft_id, message_id in self.drafts.items()
        ]
        offset = int(query.get("pageToken") or 0)
        body = {"resultSizeEstimate": len(items)}
        page = items[offset : offset + self.DRAFTS_PAGE]
        if page:
            body["drafts"] = page
        if offset + self.DRAFTS_PAGE < len(items):
            body["nextPageToken"] = str(offset + self.DRAFTS_PAGE)
        return body

    def _failing(self, netloc, path):
        for i, (pattern, status, reason, retry_after) in enumerate(self.failures):
            if pattern.search(path):
                del self.failures[i]
                raise ProviderError(
                    f"{status} from {netloc}: {reason}",
                    reauth=status == 401 or (status == 403 and reason not in RATE_LIMIT_REASONS),
                    status=status,
                    reason=reason,
                    retry_after=retry_after,
                )

    # --- http_upload ------------------------------------------------------
    def upload(self, method, url, *, headers=None, metadata=None, payload=b"", timeout=30):
        parts = urlsplit(url)
        self.calls.append((method, parts.netloc + parts.path, dict(parse_qs(parts.query))))
        self._failing(parts.netloc, parts.path)
        assert parts.path.startswith(UPLOAD_PREFIX), parts.path
        route = parts.path[len(UPLOAD_PREFIX) :]
        metadata = copy.deepcopy(metadata or {})
        self.uploads.append(
            (method, route, metadata, email.message_from_bytes(payload, policy=policy.default))
        )
        thread = (metadata.get("message") or {}).get("threadId", "")
        if route == "/drafts" and method == "POST":
            draft_id, message_id = self._mint("r-"), self._mint("d")
            self._store_raw(message_id, thread or message_id, ["DRAFT"], payload)
            self.drafts[draft_id] = message_id
            return {"id": draft_id, "message": self._stub(message_id)}
        if route == "/drafts/send":
            draft_id = metadata.get("id", "")
            if draft_id not in self.drafts:
                raise _not_found()
            old = self.drafts.pop(draft_id)
            thread = self.messages[old]["threadId"]
            self.remove(old)
            message_id = self._store_raw(self._mint("s"), thread, ["SENT"], payload)
            return self._stub(message_id)
        update = re.fullmatch(r"/drafts/([^/]+)", route)
        if update and method == "PUT":
            draft_id = update.group(1)
            if draft_id not in self.drafts:
                raise _not_found()
            old = self.drafts[draft_id]
            thread = thread or self.messages[old]["threadId"]
            self.remove(old)
            message_id = self._store_raw(self._mint("d"), thread, ["DRAFT"], payload)
            self.drafts[draft_id] = message_id
            return {"id": draft_id, "message": self._stub(message_id)}
        if route == "/messages/send":
            thread = metadata.get("threadId", "")
            message_id = self._mint("s")
            self._store_raw(message_id, thread or message_id, ["SENT"], payload)
            return self._stub(message_id)
        raise AssertionError(f"FakeGmail has no upload route for {method} {parts.path}")
```

(The `class FakeGmail:` line above only shows where the methods go; add them inside the existing class.)

- in `__call__`, replace the failure loop with `self._failing(parts.netloc, parts.path)`; record deletes too: `if method in ("POST", "DELETE"): self.writes.append((route, copy.deepcopy(data)))`; and add these routes before `if route == "/history":`:

```python
        draft = re.fullmatch(r"/drafts/([^/]+)", route)
        if draft and method == "DELETE":
            draft_id = draft.group(1)
            if draft_id not in self.drafts:
                raise _not_found()
            self.remove(self.drafts.pop(draft_id))
            return {}
        if route == "/drafts":
            return self._draft_page(query)
        if route == "/settings/sendAs":
            return {"sendAs": copy.deepcopy(self.send_as)}
```

- change the `route.startswith("/messages/")` line to `return self._get(route.rsplit("/", 1)[-1], query.get("format", "full"), query)`, and give `_get` a `query` parameter and the metadata format:

```python
    def _get(self, message_id, fmt, query=None):
        full = self.messages.get(message_id)
        if full is None:
            raise _not_found()
        if fmt == "minimal":
            keep = ("id", "threadId", "labelIds", "snippet", "historyId", "internalDate")
            return {k: copy.deepcopy(full[k]) for k in keep}
        if fmt == "metadata":
            wanted = (query or {}).get("metadataHeaders", [])
            wanted = {wanted.lower()} if isinstance(wanted, str) else {h.lower() for h in wanted}
            keep = ("id", "threadId", "labelIds", "snippet", "historyId", "internalDate")
            body = {k: copy.deepcopy(full[k]) for k in keep}
            body["payload"] = _metadata_part(full["payload"], wanted)
            return body
        return copy.deepcopy(full)
```

- add, beside `_find_part`:

```python
def _metadata_part(part, wanted):
    """A payload as format=metadata gives it: the asked headers, no bodies."""
    return {
        "partId": part.get("partId", ""),
        "mimeType": part.get("mimeType", ""),
        "filename": part.get("filename", ""),
        "headers": [h for h in part.get("headers", []) if h["name"].lower() in wanted],
        "body": {"size": (part.get("body") or {}).get("size", 0)},
        "parts": [_metadata_part(child, wanted) for child in part.get("parts", [])],
    }


def _subject(full):
    for header in full["payload"]["headers"]:
        if header["name"].lower() == "subject":
            return header["value"]
    return ""
```

- in `_list`'s `wanted`, after the `-in:chats` check, add:

```python
if query.get("includeSpamTrash") == "false" and {"SPAM", "TRASH"} & set(full["labelIds"]):
    return False
words = [word.lower() for word in q.split() if ":" not in word]
haystack = f"{_subject(full)} {full.get('snippet', '')}".lower()
if any(word not in haystack for word in words):
    return False
```

- update the module docstring's last sentence to add: "D3's uploads (drafts.create, drafts.update, drafts.send, messages.send) are parsed and stored as Gmail would, drafts.list pages two at a time, and sendAs, search and format=metadata answer."

In `services/mail/tests/gmail_fixtures.py`, replace `use_gmail` with:

```python
    def use_gmail(self, address="dana@acme.io"):
        """A FakeGmail standing in for Google for the rest of this test: both
        transports (JSON calls and D3's uploads)."""
        from .gmail_fake import FakeGmail

        fake = FakeGmail(address)
        for target, stand_in in (
            ("services.mail.providers.google.http_json", fake),
            ("services.mail.providers.google.http_upload", fake.upload),
        ):
            patcher = patch(target, stand_in)
            patcher.start()
            self.addCleanup(patcher.stop)
        return fake
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK (the new tests, and D1/D2's against the refactored `http_json` and fake).

- [ ] **Step 10: The live Gmail checks (owner-run; skip and say so otherwise)**

Contract decisions 19, 20 and 27 leave three facts to a live check. They need a real two-way Google mailbox connected in the local dev database, and the owner's go-ahead (a real message is sent to the owner's own address). If either is missing, write "live checks not run" in the task report and keep the code as written.

```bash
venv/bin/python manage.py shell -c "
from services.mail import gmail_sync, mime
from services.mail.models import MailboxConnection
c = MailboxConnection.objects.filter(provider='google', status='connected').first()
s = gmail_sync.session_for(c)
first = mime.build(mime.Outgoing(from_name='', from_address=c.address, to=[['', c.address]], subject='D3 check A', text='old'))
second = mime.build(mime.Outgoing(from_name='', from_address=c.address, to=[['', c.address]], subject='D3 check B', text='new'))
made = s.create_draft(first)
sent = s.send_draft(made['id'], second)
full = s.get_message(sent['id'], 'metadata')
print('drafts.send sends the supplied message:', any(h['value'] == 'D3 check B' for h in full['payload']['headers']))
print('message id kept on drafts.send:', sent['id'] == made['message']['id'])
big = mime.build(mime.Outgoing(from_name='', from_address=c.address, to=[['', c.address]], subject='D3 check C', text='25 MB', attachments=[mime.Part('big.bin', 'application/octet-stream', b'0' * 26_000_000)]))
print('25 MB decoded accepted:', bool(s.send_message(big).get('id')))
"
```

What to do with each answer:
- `drafts.send sends the supplied message: False` → in `GmailSession.send_draft`, call `self.update_draft(draft_id, raw, thread_id)` first, then `self._upload("POST", "/drafts/send", {"id": draft_id}, b"", sending=True)`, and report it.
- `25 MB decoded accepted:` an error (413) → lower `MAIL_SEND_MAX_BYTES`' default to the largest size that passed (try 20,000,000) and report it.
- `message id kept on drafts.send` only informs decision 27's first check; the reconcile also falls back to the thread (Task 12). Report the answer.

- [ ] **Step 11: Commit**

```bash
venv/bin/ruff format services/mail/mime.py services/mail/providers/base.py services/mail/providers/google.py services/mail/tests/gmail_fake.py services/mail/tests/gmail_fixtures.py services/mail/tests/test_mime.py services/mail/tests/test_gmail_writes.py
venv/bin/ruff check --fix services/mail/mime.py services/mail/providers/base.py services/mail/providers/google.py services/mail/tests/gmail_fake.py services/mail/tests/gmail_fixtures.py services/mail/tests/test_mime.py services/mail/tests/test_gmail_writes.py
git add services/mail/mime.py services/mail/providers/base.py services/mail/providers/google.py services/mail/tests/gmail_fake.py services/mail/tests/gmail_fixtures.py services/mail/tests/test_mime.py services/mail/tests/test_gmail_writes.py
git commit -m "$(cat <<'EOF'
feat(mail): build outgoing mime and upload it to gmail

One builder for every message Gmail receives from Revenact; every write that
carries a message goes through Gmail's upload endpoint under the same host
allow-list. The session gains the draft, send, sendAs, search and metadata
calls; a send with no answer is unconfirmed, never retried. The fake Gmail
answers all of them.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 3: Threading for every Gmail send, Reply-To, and today's routes on the builder

**Files:**
- Modify: `services/mail/providers/base.py` (`Message.reply_to`)
- Modify: `services/mail/providers/google.py` (`GoogleProvider.send`; `parse_gmail_message` reads `Reply-To`)
- Modify: `services/mail/gmail_store.py` (`store_gmail` stores `reply_to`)
- Modify: `services/mail/sync.py` (`sender_name`, `answering_headers`, `send_kwargs`; `send_email`, `reply_to`)
- Modify: `services/mail/views.py` (`MailReplyView`'s audit metadata)
- Modify: `services/customers/communications_views.py` (`EmailReplyView`'s audit metadata)
- Modify: `services/customers/drafts_views.py` (`DraftSendView`'s `mailbox.reply` metadata)
- Modify: `services/mail/tests/test_mail.py` (`FakeProvider.send` takes `**extra`, records it)
- Test: `services/mail/tests/test_send_threading.py`

**Interfaces:**
- Consumes: Task 2's `mime.Outgoing`, `mime.build`, `GmailSession.send_message`; Task 1's `MailboxConnection.send_as_name`, `MailMessage.reply_to`.
- Produces:
  - `sync.sender_name(connection) -> str` (decision 18's From name);
  - `sync.answering_headers(connection, *, email=None, message=None) -> (in_reply_to, references, thread_id)`;
  - `sync.send_kwargs(connection, in_reply_to, references, thread_id) -> dict` for `provider.send`;
  - `GoogleProvider.send(creds, *, to, subject, body, in_reply_to="", references="", thread_id="", from_name="")`;
  - `Message.reply_to: list[tuple[str, str]]`; Gmail rows store `MailMessage.reply_to`;
  - `FakeProvider.extra` (the keyword arguments beyond `in_reply_to` of each send).

- [ ] **Step 1: Write the failing tests**

In `services/mail/tests/test_mail.py`, make `FakeProvider` record what a send carries beyond `in_reply_to`:

```python
class FakeProvider:
    """A provider that hands back whatever the test queued, and records sends."""

    key = "imap"
    label = "Fake"
    uses_oauth = False
    queued = []
    sent = []
    replied_to = []
    extra = []

    @classmethod
    def configured(cls):
        return True

    def fetch_messages(self, creds, cursor):
        return list(self.queued), "cursor-2", creds

    def send(self, creds, *, to, subject, body, in_reply_to="", **extra):
        self.sent.append((creds.address, to, subject, body))
        self.replied_to.append(in_reply_to)
        self.extra.append(extra)
        return message(
            provider_id="sent-1",
            thread_id="t-sent",
            from_address=creds.address,
            to=[("", a) for a in to],
            subject=subject,
            body=body,
        )
```

and in `Fixture.setUp`, change the first line to `FakeProvider.queued, FakeProvider.sent, FakeProvider.replied_to, FakeProvider.extra = [], [], [], []`.

Create `services/mail/tests/test_send_threading.py`:

```python
"""Threading for every Gmail send (D3 decision 16), the old routes included:
a send answering a message in the sender's own Google mailbox carries its
threadId, In-Reply-To and References; one answering someone else's filed
mail (a manager in the chain) the headers only. Today's routes build their
text through the MIME builder and send through the upload endpoint. The
original is found through Email.mail_message, which also gives IMAP its
In-Reply-To. Reply-To is stored. mailbox.reply gains cc, bcc_count,
attachments and bytes (zero on today's routes)."""

from unittest.mock import patch

from django.utils import timezone

from core.models import AuditEvent
from services.customers.models import Email
from services.mail import gmail_store, sync
from services.mail.models import MailMessage

from .gmail_fake import gmail_message
from .gmail_fixtures import GmailFixture
from .test_mail import NOW, FakeProvider, Fixture


class GmailThreadingTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.mailbox = self.google(self.dana, send_as_name="Dana Ruiz")
        self.now = timezone.now()
        quote = gmail_message(
            "g1",
            sender="Ann Lee <ann@pizzahut.com>",
            subject="Renewal terms",
            references="<first@pizzahut.com>",
            thread_id="t-g1",
            reply_to="Renewals <renewals@pizzahut.com>",
        )
        self.row, self.filed = gmail_store.store_gmail(self.mailbox, quote, now=self.now)
        self.client.force_authenticate(self.dana)

    def last_upload(self):
        method, route, metadata, message = self.fake.uploads[-1]
        return route, metadata, message

    def test_reply_to_is_stored(self):
        self.assertEqual(self.row.reply_to, [["Renewals", "renewals@pizzahut.com"]])
        self.assertIsNotNone(self.filed)

    def test_a_reply_in_the_mailbox_threads_in_gmail(self):
        response = self.client.post(
            f"/api/v1/mail/messages/{self.row.pk}/reply/", {"body": "Yes."}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        route, metadata, message = self.last_upload()
        self.assertEqual((route, metadata), ("/messages/send", {"threadId": "t-g1"}))
        self.assertEqual(message["In-Reply-To"], "<g1@mail.gmail.com>")
        self.assertEqual(str(message["References"]), "<first@pizzahut.com> <g1@mail.gmail.com>")
        self.assertEqual(message.get_content_type(), "text/plain")
        self.assertEqual(message.get_content().strip(), "Yes.")
        self.assertEqual(message["From"].addresses[0].display_name, "Dana Ruiz")
        self.assertEqual(str(message["Subject"]), "Re: Renewal terms")
        event = AuditEvent.objects.get(action="mailbox.reply")
        self.assertEqual(
            {key: event.metadata[key] for key in ("cc", "bcc_count", "attachments", "bytes")},
            {"cc": [], "bcc_count": 0, "attachments": 0, "bytes": 0},
        )

    def test_an_unfiled_reply_threads_too(self):
        stranger, _ = gmail_store.store_gmail(
            self.mailbox,
            gmail_message("g2", sender="Stranger <x@else.io>", thread_id="t-g2"),
            now=self.now,
        )
        response = self.client.post(
            f"/api/v1/mail/messages/{stranger.pk}/reply/", {"body": "Hello."}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        route, metadata, message = self.last_upload()
        self.assertEqual(metadata, {"threadId": "t-g2"})
        self.assertEqual(message["In-Reply-To"], "<g2@mail.gmail.com>")

    def test_a_new_message_on_a_record_carries_no_thread(self):
        response = self.client.post(
            f"/api/v1/customers/{self.pizza.pk}/emails/send/",
            {"to": ["ann@pizzahut.com"], "subject": "Hello", "body": "First note."},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        route, metadata, message = self.last_upload()
        self.assertEqual((route, metadata), ("/messages/send", {}))
        self.assertIsNone(message["In-Reply-To"])

    def test_a_manager_answering_in_the_chain_gets_the_headers_but_not_the_thread(self):
        self.google(self.carl)
        self.client.force_authenticate(self.carl)
        response = self.client.post(
            f"/api/v1/communications/emails/{self.filed.pk}/reply/",
            {"body": "Carl here."},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        route, metadata, message = self.last_upload()
        self.assertEqual(metadata, {})
        self.assertEqual(message["In-Reply-To"], "<g1@mail.gmail.com>")
        self.assertEqual(message["From"].addresses[0].addr_spec, "carl@acme.io")
        event = AuditEvent.objects.get(action="mailbox.reply")
        self.assertEqual((event.metadata["bcc_count"], event.metadata["bytes"]), (0, 0))

    def test_answering_headers(self):
        self.assertEqual(
            sync.answering_headers(self.mailbox, message=self.row),
            ("<g1@mail.gmail.com>", "<first@pizzahut.com>", "t-g1"),
        )
        self.assertEqual(
            sync.answering_headers(self.mailbox, email=self.filed),
            ("<g1@mail.gmail.com>", "<first@pizzahut.com>", "t-g1"),
        )
        carls = self.google(self.carl)
        self.assertEqual(sync.answering_headers(carls, email=self.filed)[2], "")
        self.assertEqual(sync.answering_headers(self.mailbox), ("", "", ""))

    def test_the_from_name(self):
        self.assertEqual(sync.sender_name(self.mailbox), "Dana Ruiz")
        self.mailbox.send_as_name = ""
        self.assertEqual(sync.sender_name(self.mailbox), "Dana")


class ImapThreadingTests(Fixture):
    def setUp(self):
        super().setUp()
        self.connection = self.connect(self.dana)
        self.original = self.email(
            self.dana,
            subject="Renewal terms",
            from_address="sam@pizzahut.com",
            mailbox=self.connection,
            provider_message_id="17",
        )
        MailMessage.objects.create(
            connection=self.connection,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="17",
            direction=MailMessage.Direction.RECEIVED,
            from_address="sam@pizzahut.com",
            subject="Renewal terms",
            sent_at=NOW,
            rfc_message_id="<orig@pizzahut.com>",
            email=self.original,
        )

    def test_imap_finds_the_message_id_through_the_mailbox_copy(self):
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            sync.send_email(
                self.connection,
                to=["sam@pizzahut.com"],
                subject="Re: Renewal terms",
                body="Yes.",
                customer=self.pizza,
                answering=self.original,
            )
        self.assertEqual(FakeProvider.replied_to[-1], "<orig@pizzahut.com>")
        self.assertEqual(FakeProvider.extra[-1], {})
        self.assertEqual(Email.objects.filter(direction="sent").count(), 1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_send_threading --parallel auto --noinput`
Expected: FAIL/ERROR: `reply_to` is not stored, `AttributeError: module 'services.mail.sync' has no attribute 'answering_headers'`, and the Gmail sends post JSON `raw` (no upload recorded).

- [ ] **Step 3: Reply-To**

In `services/mail/providers/base.py`, add to `Message` after `attachments`:

```python
    #: The Reply-To header (Gmail only).
    reply_to: list[tuple[str, str]] = field(default_factory=list)
```

In `services/mail/providers/google.py`'s `parse_gmail_message`, add to the `Message(...)` call after `bcc=...`: `reply_to=parse_address_list(_header(payload, "Reply-To")),`.

In `services/mail/gmail_store.py`'s `store_gmail`, add to `MailMessage.objects.create(...)` after `bcc=...`: `reply_to=[[name, address] for name, address in message.reply_to][:50],`.

- [ ] **Step 4: The headers and the From name**

In `services/mail/sync.py`, after `looks_like_message_id`, add:

```python
def sender_name(connection):
    """The From name (D3 decision 18): Gmail's send-as name, else the
    connection's display name, else the person's."""
    return connection.send_as_name or connection.display_name or connection.user.name


def answering_headers(connection, *, email=None, message=None):
    """(In-Reply-To, the original's References, Gmail threadId) for a send
    answering `message` (a MailMessage) or the filed `email` (D3 decision
    16). The original is found through Email.mail_message, so a Gmail id is
    never taken for a Message-ID; a filed email with no mailbox copy still
    answers by a Message-ID-shaped provider id (IMAP). The threadId only for
    a message in this very Google mailbox: Gmail thread ids are per mailbox."""
    original = message
    if original is None and email is not None:
        original = MailMessage.objects.filter(email=email).first()
    in_reply_to = original.rfc_message_id if original is not None else ""
    if not in_reply_to and email is not None and looks_like_message_id(email.provider_message_id):
        in_reply_to = email.provider_message_id
    references = original.references if original is not None and in_reply_to else ""
    same_mailbox = (
        original is not None and connection.is_google and original.connection_id == connection.pk
    )
    return in_reply_to, references, original.thread_id if same_mailbox else ""


def send_kwargs(connection, in_reply_to, references, thread_id):
    """What provider.send takes beyond the message: In-Reply-To for any
    provider; for Google also References, the threadId and the From name."""
    extra = {"in_reply_to": in_reply_to} if in_reply_to else {}
    if connection.is_google:
        extra["from_name"] = sender_name(connection)
        if references:
            extra["references"] = references
        if thread_id:
            extra["thread_id"] = thread_id
    return extra
```

In `send_email`, replace the lines from `header = ""` through `message = provider.send(creds, to=to, subject=subject, body=body, **extra)` with:

```python
    in_reply_to, references, thread_id = answering_headers(connection, email=answering)
    message = provider.send(
        creds,
        to=to,
        subject=subject,
        body=body,
        **send_kwargs(connection, in_reply_to, references, thread_id),
    )
```

and update its docstring's last sentence to: "a Message-ID original goes out as In-Reply-To (D3 decision 16: found through the mailbox copy, with Gmail's threadId when it is this mailbox's)."

In `reply_to`, replace `message = provider.send(creds, to=to, subject=subject, body=body)` with:

```python
    in_reply_to, references, thread_id = answering_headers(connection, message=original)
    message = provider.send(
        creds,
        to=to,
        subject=subject,
        body=body,
        **send_kwargs(connection, in_reply_to, references, thread_id),
    )
```

- [ ] **Step 5: Today's Gmail send on the builder and the upload**

In `services/mail/providers/google.py`, add `from ..mime import Outgoing, build` to the imports, and replace `GoogleProvider.send` with:

```python
    # --- send ---------------------------------------------------------------
    def send(
        self,
        creds,
        *,
        to,
        subject,
        body,
        in_reply_to="",
        references="",
        thread_id="",
        from_name="",
    ):
        """Send as the mailbox (D3 §4 "Today's send routes on a Google
        mailbox"): the MIME builder, text only, no signature, no cc, through
        the upload endpoint, with the original's threadId and headers when it
        answers one (decision 16). No answer after the request went out
        raises SendUnconfirmed."""
        name = from_name or creds.display_name
        raw = build(
            Outgoing(
                from_name=name,
                from_address=creds.address,
                to=[["", address] for address in to],
                subject=subject,
                text=body,
                in_reply_to=in_reply_to,
                references=references,
            )
        )
        sent = GmailSession(creds).send_message(raw, thread_id)
        return Message(
            provider_id=sent.get("id", ""),
            thread_id=sent.get("threadId", ""),
            subject=subject,
            from_address=creds.address,
            from_name=name,
            to=[("", address.lower()) for address in to],
            date=datetime.now(timezone.utc),
            body=body,
        )
```

Remove the now-unused `base64` and `EmailMessage` imports only if ruff reports them unused (`_decode` still uses `base64`).

- [ ] **Step 6: The audit fields on today's routes**

`mailbox.reply` gains `cc`, `bcc_count`, `attachments` and `bytes` (contract §7), zero on today's routes.

In `services/mail/views.py` `MailReplyView.post`, change the audit metadata to:

```python
metadata = (
    {
        "to": sent.to if sent else [],
        "subject": sent.subject if sent else "",
        "cc": [],
        "bcc_count": 0,
        "attachments": 0,
        "bytes": 0,
    },
)
```

In `services/customers/communications_views.py` `EmailReplyView.post`, change it to `metadata={"to": [email.from_address], "subject": subject, "cc": [], "bcc_count": 0, "attachments": 0, "bytes": 0},`.

In `services/customers/drafts_views.py` `DraftSendView.post`, change the `mailbox.reply` metadata to `metadata={"to": to, "subject": subject, "cc": [], "bcc_count": 0, "attachments": 0, "bytes": 0},`.

- [ ] **Step 7: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail services.customers services.agents --parallel auto --noinput`
Expected: OK. If a D1/D2 test compares `mailbox.reply`'s metadata exactly, add the four new keys to its expectation.

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff format services/mail/providers/base.py services/mail/providers/google.py services/mail/gmail_store.py services/mail/sync.py services/mail/views.py services/customers/communications_views.py services/customers/drafts_views.py services/mail/tests/test_mail.py services/mail/tests/test_send_threading.py
venv/bin/ruff check --fix services/mail/providers/base.py services/mail/providers/google.py services/mail/gmail_store.py services/mail/sync.py services/mail/views.py services/customers/communications_views.py services/customers/drafts_views.py services/mail/tests/test_mail.py services/mail/tests/test_send_threading.py
git add services/mail/providers/base.py services/mail/providers/google.py services/mail/gmail_store.py services/mail/sync.py services/mail/views.py services/customers/communications_views.py services/customers/drafts_views.py services/mail/tests/test_mail.py services/mail/tests/test_send_threading.py
git commit -m "$(cat <<'EOF'
fix(mail): thread every gmail send and store reply-to

A Gmail id was never a Message-ID, so replies never threaded. The original
is now found through its mailbox copy: its threadId when it is the sender's
own mailbox, In-Reply-To and References always. Today's routes build their
text with the MIME builder and send through the upload endpoint.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 4: The send-as name, the signature, and the HTML helpers drafts need

**Files:**
- Modify: `services/mail/html.py` (`SIGNATURE_ATTR` on the allow-list; `clean`; `to_text`; `paragraphs`)
- Create: `services/mail/send_as.py`
- Modify: `services/mail/gmail_sync.py` (`_run` refreshes the send-as entry after the labels)
- Modify: `services/mail/views.py` (`_save_google` clears `send_as_synced_at`)
- Test: `services/mail/tests/test_send_as.py`

**Interfaces:**
- Consumes: Task 2's `GmailSession.send_as`; Task 1's connection fields; `gmail_sync._write`.
- Produces:
  - `html.SIGNATURE_ATTR = "data-revenact-signature"`;
  - `html.clean(raw) -> str` (sanitised, no size cut); `html.sanitise` unchanged in behaviour;
  - `html.to_text(markup) -> str` (paragraphs, `-- ` before the signature, `> ` quotes);
  - `html.paragraphs(text) -> str` (escaped `<p>` blocks with `<br>`);
  - `send_as.due(connection, now) -> bool`; `send_as.refresh(connection, session, now) -> bool` (True when it ran);
  - `send_as.signature_block(connection) -> str` (`<div data-revenact-signature>…</div>` or `""`).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_send_as.py`:

```python
"""The send-as name and signature (D3 decisions 17, 18): read from Gmail's
primary sendAs entry, sanitised, refreshed by the tick when older than
MAIL_SEND_AS_REFRESH_HOURS and after every connect; a failure is a tick
failure. The HTML helpers a draft's text and signature need."""

from datetime import timedelta

from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from services.mail import gmail_sync, html, send_as, views
from services.mail.models import MailboxConnection
from services.mail.providers.base import Credentials

from .gmail_fixtures import CREDENTIALS, GRANTED, GmailFixture


class RefreshTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        self.mailbox = self.google(
            self.dana,
            history_id=self.fake.history_id,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
        )

    def tick(self, now):
        connection = MailboxConnection.objects.get(pk=self.mailbox.pk)
        result = gmail_sync.tick(connection, now=now)
        self.mailbox.refresh_from_db()
        return result

    def reads(self):
        return [where for _, where, _ in self.fake.calls if where.endswith("/settings/sendAs")]

    def test_the_first_tick_stores_the_primary_entry_sanitised(self):
        self.fake.send_as = [
            {"sendAsEmail": "alias@acme.io", "displayName": "Alias", "isPrimary": False},
            {
                "sendAsEmail": "dana@acme.io",
                "displayName": "Dana Ruiz",
                "signature": '<div dir="ltr">Dana Ruiz<script>alert(1)</script><br>Acme</div>',
                "isPrimary": True,
            },
        ]
        self.assertEqual(self.tick(self.now).outcome, "ok")
        self.assertEqual(self.mailbox.send_as_name, "Dana Ruiz")
        self.assertIn("Dana Ruiz", self.mailbox.signature_html)
        self.assertNotIn("script", self.mailbox.signature_html)
        self.assertEqual(self.mailbox.send_as_synced_at, self.now)

    def test_without_a_primary_entry_the_mailboxs_own_address_is_used(self):
        self.fake.send_as = [
            {"sendAsEmail": "alias@acme.io", "displayName": "Alias"},
            {"sendAsEmail": "Dana@Acme.io", "displayName": "Dana R"},
        ]
        self.tick(self.now)
        self.assertEqual(self.mailbox.send_as_name, "Dana R")

    def test_refreshed_once_a_day(self):
        self.tick(self.now)
        self.tick(self.now + timedelta(hours=1))
        self.assertEqual(len(self.reads()), 1)
        self.tick(self.now + timedelta(hours=25))
        self.assertEqual(len(self.reads()), 2)

    def test_a_failure_is_a_tick_failure(self):
        self.fake.fail(r"/settings/sendAs$", 503)
        self.assertEqual(self.tick(self.now).outcome, "backoff")
        self.assertIsNone(self.mailbox.send_as_synced_at)

    def test_a_reconnect_reads_it_again(self):
        self.tick(self.now)
        request = APIRequestFactory().post("/")
        request.user = self.dana
        creds = Credentials(address="dana@acme.io", data=dict(CREDENTIALS), scopes=list(GRANTED))
        views._save_google(request, self.dana, creds, {"historyId": "5", "messagesTotal": 3})
        self.mailbox.refresh_from_db()
        self.assertIsNone(self.mailbox.send_as_synced_at)

    def test_the_signature_block(self):
        self.mailbox.signature_html = "Dana Ruiz<br>Acme"
        self.assertEqual(
            send_as.signature_block(self.mailbox),
            "<div data-revenact-signature>Dana Ruiz<br>Acme</div>",
        )
        self.mailbox.signature_html = ""
        self.assertEqual(send_as.signature_block(self.mailbox), "")


class HtmlHelperTests(SimpleTestCase):
    def test_text_from_a_reply_with_its_signature_and_quote(self):
        markup = html.sanitise(
            "<p>Works for us.</p>"
            "<div data-revenact-signature>Dana Ruiz<br>Dough Co</div>"
            '<div class="gmail_quote">On 11 Oct 2026, Ann Lee &lt;ann@pizzahut.com&gt; wrote:'
            "<blockquote><p>Can we do two years?</p></blockquote></div>"
        )
        self.assertIn("data-revenact-signature", markup)
        self.assertEqual(
            html.to_text(markup),
            "Works for us.\n\n-- \nDana Ruiz\nDough Co\n\n"
            "On 11 Oct 2026, Ann Lee <ann@pizzahut.com> wrote:\n> Can we do two years?",
        )

    def test_text_from_lists_and_an_empty_paragraph(self):
        self.assertEqual(html.to_text("<p></p><ul><li>One</li><li>Two</li></ul>"), "- One\n- Two")
        self.assertEqual(html.to_text(""), "")

    def test_paragraphs_from_text(self):
        self.assertEqual(
            html.paragraphs("Hi Ann,\nthanks.\n\n<b>Two</b> years."),
            "<p>Hi Ann,<br>thanks.</p><p>&lt;b&gt;Two&lt;/b&gt; years.</p>",
        )
        self.assertEqual(html.paragraphs("  "), "")

    def test_clean_never_empties_a_long_message(self):
        long = "<p>" + "x" * 1_100_000 + "</p>"
        self.assertEqual(html.sanitise(long), "")
        self.assertTrue(html.clean(long).startswith("<p>x"))
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_send_as --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'send_as' from 'services.mail'`.

- [ ] **Step 3: The HTML helpers**

In `services/mail/html.py`:
- add `import re`, `from html import escape` and `from html.parser import HTMLParser` to the imports;
- after `URL_SCHEMES`, add:

```python
#: Marks the signature inside a draft's HTML (D3 decision 17). Allowed on
#: div, or every write would strip it.
SIGNATURE_ATTR = "data-revenact-signature"
```

- change `ATTRIBUTES` to also allow it: add the entry `"div": frozenset({SIGNATURE_ATTR}),` (SIGNATURE_ATTR must be defined above `ATTRIBUTES`; move the constant there);
- replace `sanitise` with:

```python
def clean(raw):
    """The safe HTML for `raw`, whatever its size ("" when there is none). A
    draft's write checks the size itself and answers 400 instead of
    silently dropping the person's writing (D3 §3)."""
    if not raw:
        return ""
    return nh3.clean(
        raw,
        tags=set(TAGS),
        # <style> is a tag we keep; only a script's content is dropped with it.
        clean_content_tags={"script"},
        attributes={tag: set(names) for tag, names in ATTRIBUTES.items()},
        url_schemes=set(URL_SCHEMES),
        link_rel="noopener noreferrer",
        strip_comments=True,
    )


def sanitise(raw):
    """The safe HTML for `raw`; "" when there is none, or when the result is
    over MAIL_HTML_MAX_BYTES (the text body is shown instead)."""
    safe = clean(raw)
    if len(safe.encode()) > settings.MAIL_HTML_MAX_BYTES:
        return ""
    return safe
```

- at the end, add:

```python
#: Tags that end a paragraph of the text version.
BLOCKS = frozenset({"p", "div", "ul", "ol", "table", "pre", "h1", "h2", "h3", "h4", "h5", "h6"})


class _Text(HTMLParser):
    """A draft's HTML as the text sent beside it (D3 §1 `text`): paragraphs
    apart by a blank line, `-- ` before the signature, `> ` before a quote."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines = []  # (quote depth, text)
        self.line = ""
        self.depth = 0
        self.skip = 0

    def _end_line(self):
        self.lines.append((self.depth, self.line.strip()))
        self.line = ""

    def _paragraph(self):
        """Ends the line, then one blank line, unless a quote has just opened."""
        if self.line.strip():
            self._end_line()
        if self.lines and self.lines[-1][1] != "" and self.lines[-1][0] == self.depth:
            self.lines.append((self.depth, ""))

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self.skip += 1
        elif tag in ("br", "tr"):
            if tag == "br" or self.line.strip():
                self._end_line()
        elif tag == "blockquote":
            if self.line.strip():
                self._end_line()
            self.depth += 1
        elif tag == "li":
            if self.line.strip():
                self._end_line()
            self.line = "- "
        elif tag == "div" and any(name == SIGNATURE_ATTR for name, _ in attrs):
            self._paragraph()
            self.lines.append((self.depth, "-- "))
        elif tag in BLOCKS:
            self._paragraph()

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self.skip = max(self.skip - 1, 0)
        elif tag == "blockquote":
            if self.line.strip():
                self._end_line()
            self.depth = max(self.depth - 1, 0)
            self._paragraph()
        elif tag == "li":
            if self.line.strip():
                self._end_line()
        elif tag in BLOCKS:
            self._paragraph()

    def handle_data(self, data):
        if self.skip:
            return
        text = re.sub(r"\s+", " ", data)
        if not self.line.strip():
            text = text.lstrip()
        self.line += text

    def text(self):
        if self.line.strip():
            self._end_line()
        out = []
        for depth, text in self.lines:
            line = f"{'> ' * depth}{text}" if text else ""
            if line == "" and (not out or out[-1] == ""):
                continue
            out.append(line)
        while out and out[-1] == "":
            out.pop()
        return "\n".join(out)


def to_text(markup):
    """The plain text for a draft's sanitised HTML (D3 §1: derived, never the client's)."""
    parser = _Text()
    parser.feed(markup or "")
    parser.close()
    return parser.text()


def paragraphs(text):
    """Plain text as HTML paragraphs, line breaks kept and everything escaped."""
    blocks = [block for block in re.split(r"\n\s*\n", (text or "").strip()) if block.strip()]
    return "".join(
        "<p>" + "<br>".join(escape(line) for line in block.split("\n")) + "</p>" for block in blocks
    )
```

- [ ] **Step 4: The send-as module**

Create `services/mail/send_as.py`:

```python
"""The person's Gmail send-as name and signature (D3 decisions 17, 18).

Read from settings.sendAs.list's primary entry (else the one for the
mailbox's own address) when send_as_synced_at is empty or older than
MAIL_SEND_AS_REFRESH_HOURS: on the first tick after a connect or reconnect
(which clears the stamp) and then once a day. The signature is Gmail's HTML,
sanitised like any mail. It is placed into a draft's body when the draft is
made (services/mail/compose.py), never appended at send; today's routes add
none. There is no signature endpoint: the compose prefill carries it.
"""

from datetime import timedelta

from django.conf import settings

from . import gmail_sync, html


def due(connection, now):
    synced = connection.send_as_synced_at
    return synced is None or synced < now - timedelta(hours=settings.MAIL_SEND_AS_REFRESH_HOURS)


def primary(entries, address):
    """The primary entry, else the one for `address`, else {}."""
    entries = [entry for entry in entries or [] if isinstance(entry, dict)]
    found = next((entry for entry in entries if entry.get("isPrimary")), None)
    if found is None:
        wanted = (address or "").lower()
        found = next(
            (entry for entry in entries if str(entry.get("sendAsEmail", "")).lower() == wanted),
            None,
        )
    return found or {}


def refresh(connection, session, now):
    """One sendAs.list when due, stored under the tick's claim. A
    ProviderError is the tick's failure (D1 backoff). Returns whether it ran."""
    if not due(connection, now):
        return False
    entry = primary(session.send_as(), connection.address)
    connection.send_as_name = str(entry.get("displayName") or "").strip()[:150]
    connection.signature_html = html.sanitise(str(entry.get("signature") or ""))
    connection.send_as_synced_at = now
    gmail_sync._write(connection, ["send_as_name", "signature_html", "send_as_synced_at"])
    return True


def signature_block(connection):
    """The signature as a draft carries it, below the person's text and above
    any quote (decision 17); "" without one."""
    if not connection.signature_html:
        return ""
    return f"<div {html.SIGNATURE_ATTR}>{connection.signature_html}</div>"
```

- [ ] **Step 5: The tick and the reconnect**

In `services/mail/gmail_sync.py` `_run`, change the import line to `from . import outbox_flush, send_as` and add after `gmail_store.mirror_labels(connection, session.labels())`:

```python
        send_as.refresh(connection, session, now)
```

and add to the module docstring's list of steps, after "the label list,": "the send-as entry once a day (services/mail/send_as.py),".

In `services/mail/views.py` `_save_google`, after `connection.wake_at = now`, add:

```python
        # The send-as name and signature are read again on the first tick (D3 §5).
        connection.send_as_synced_at = None
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK. A D1/D2 tick test that counts every Gmail call may now see one more (`/settings/sendAs` on its first tick); set `send_as_synced_at` to its fixture's `now` in that test's connection, or count only the calls it names.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff format services/mail/html.py services/mail/send_as.py services/mail/gmail_sync.py services/mail/views.py services/mail/tests/test_send_as.py
venv/bin/ruff check --fix services/mail/html.py services/mail/send_as.py services/mail/gmail_sync.py services/mail/views.py services/mail/tests/test_send_as.py
git add services/mail/html.py services/mail/send_as.py services/mail/gmail_sync.py services/mail/views.py services/mail/tests/test_send_as.py
git commit -m "$(cat <<'EOF'
feat(mail): keep the gmail send-as name and signature

The tick reads the primary sendAs entry once a day and after every connect,
sanitised. HTML helpers derive a draft's text (signature and quotes kept
readable) and turn text into paragraphs; the signature marker survives
sanitising.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 5: The compose prefill, the customer suggestion and the connection checks

**Files:**
- Create: `services/mail/compose.py`
- Create: `services/mail/drafts.py` (the checks; later tasks add to it)
- Create: `services/mail/draft_views.py` (`MailComposeView`; later tasks add to it)
- Modify: `services/mail/actions.py` (`IS_DRAFT` sentence)
- Modify: `services/mail/urls.py`
- Create: `services/mail/tests/draft_fixtures.py`
- Test: `services/mail/tests/test_compose.py`

**Interfaces:**
- Consumes: Task 4's `send_as.signature_block`, `html.paragraphs`; Task 3's `sync.sender_name`; `sync.PUBLIC_DOMAINS`; `customers.drafts.stamp`; `visible_customers`/`visible_accounts`.
- Produces:
  - `compose.Record(kind, id, name)` (namedtuple; `kind` is `"customer"` or `"account"`);
  - `compose.subject_for(kind, subject) -> str`; `compose.recipients_for(kind, source, connection) -> (to, cc)`; `compose.quote_html(source) -> str`; `compose.forward_html(source) -> str`;
  - `compose.attachment_row(part, origin) -> dict` (the §2 `attachments[]` shape);
  - `compose.filed_record(message) -> Record | None`;
  - `compose.match(organisation_id, addresses) -> Record | None` (two queries at most);
  - `compose.suggest(connection, pairs) -> Record | None`;
  - `compose.visible(user, *records) -> list[Record | None]`; `compose.lookup(user, record) -> Record | None`; `compose.as_payload(record) -> dict | None`;
  - `compose.Prefill` (`kind, source, sender, to, cc, bcc, subject, html, signature_html, forwarded` (MailAttachment rows), `record, suggested`) with `.payload()` (contract §2's fields plus `total_bytes` and `max_bytes`, the controller's amendment) and `.total_bytes()`; `compose.prefill(connection, user, kind, source=None) -> Prefill`;
  - `drafts.refusal(connection, *, sending=False) -> Response | None`; `drafts.is_draft(message) -> bool`; `drafts.is_draft_answer() -> Response`; `drafts.own_message(user, pk) -> MailMessage` (Http404); `drafts.own_connection(user) -> MailboxConnection | None`; `drafts.CHOOSE_KIND`, `drafts.CHOOSE_SOURCE`;
  - `actions.IS_DRAFT = "This message is a draft."`;
  - `GET /api/v1/mail/compose/` (`mail-compose`);
  - `draft_fixtures.DraftFixture` with `fake`, `now`, `mailbox`, `quote` (Ann's filed quote; Gmail holds its PDF part `"1"` and inline logo part `"2"`, cid `logo@pizzahut.com`), `filed`, and `compose(kind, message=None)`, `post_draft(body)`, `patch_draft(pk, body)`, `new_draft(**body)`, `tick(now=None)`, `stored(pk)`; `draft_fixtures.URL`, `PDF`, `LOGO`, `SIGNATURE`.

- [ ] **Step 1: The shared fixture**

Create `services/mail/tests/draft_fixtures.py`:

```python
"""Dana's two-way Gmail, for delivery 3's tests (on GmailFixture's world:
Dana reports to Carl, Carl to Alice; Pizza Hut is pizzahut.com). Imported,
labels mirrored, the send-as name and signature already read. Her inbox
holds Ann's "Renewal quote" (to Dana, cc Sam; a PDF and an inline logo),
filed on Pizza Hut. Gmail is a FakeGmail holding the PDF's and the logo's bytes."""

from datetime import timedelta

from django.utils import timezone

from services.mail import gmail_store, gmail_sync
from services.mail.models import MailboxConnection, MailDraft

from .gmail_fake import fixture
from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/"
PDF = b"%PDF-1.4 renewal quote"
LOGO = b"\x89PNG logo"
SIGNATURE = "Dana Ruiz<br>Acme"


class DraftFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        quote = fixture("message_full.json")
        quote["internalDate"] = str(int((self.now - timedelta(hours=2)).timestamp() * 1000))
        self.fake.add(quote, quietly=True)
        self.fake.attach_file(quote["id"], "1", PDF)
        self.fake.attach_file(quote["id"], "2", LOGO)
        self.mailbox = self.google(
            self.dana,
            history_id=self.fake.history_id,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
            send_as_name="Dana Ruiz",
            signature_html=SIGNATURE,
            send_as_synced_at=self.now,
        )
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.quote, self.filed = gmail_store.store_gmail(
            self.mailbox, self.fake.messages[quote["id"]], now=self.now
        )
        self.client.force_authenticate(self.dana)

    def compose(self, kind, message=None):
        query = f"?kind={kind}" + (f"&message={message.pk}" if message is not None else "")
        return self.client.get(f"{URL}compose/{query}")

    def post_draft(self, body):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f"{URL}drafts/", body, format="json")

    def patch_draft(self, pk, body):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.patch(f"{URL}drafts/{pk}/", body, format="json")

    def new_draft(self, **body):
        """A reply to the quote made through the API (Task 6); its payload."""
        response = self.post_draft({"kind": "reply", "source_message_id": self.quote.pk, **body})
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def tick(self, now=None):
        connection = MailboxConnection.objects.get(pk=self.mailbox.pk)
        result = gmail_sync.tick(connection, now=now or timezone.now())
        self.mailbox.refresh_from_db()
        return result

    def stored(self, pk):
        return MailDraft.objects.get(pk=pk)
```

- [ ] **Step 2: Write the failing tests**

Create `services/mail/tests/test_compose.py`:

```python
"""GET mail/compose/ (D3 contract §2): the editor's prefill, nothing stored
and nothing sent. Recipients by the table (Reply-To, the person's own sent
mail, reply all, the owner's address out, each address once, To over Cc);
Re:/Fwd: once; the signature above the quote or the forward block; a
forward's files; the record and the suggestion, only records the owner may
open; the checks (400, 404, IS_DRAFT, GMAIL_ONLY, NO_MAILBOX, TWO_WAY_OFF;
paused does not refuse); owner-only; six queries."""

from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation, User
from services.customers.models import Contact
from services.mail import compose, gmail_store
from services.mail.models import MailAttachment, MailDraft, MailMessage

from .draft_fixtures import SIGNATURE, URL, DraftFixture
from .gmail_fake import gmail_message

SIGNED = f"<p></p><div data-revenact-signature>{SIGNATURE}</div>"


class PrefillTests(DraftFixture):
    def test_a_new_message_carries_the_signature_and_nothing_else(self):
        response = self.compose("new")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data,
            {
                "kind": "new",
                "source_message_id": None,
                "from": {"name": "Dana Ruiz", "address": "dana@acme.io"},
                "to": [],
                "cc": [],
                "bcc": [],
                "subject": "",
                "html": SIGNED,
                "signature_html": SIGNATURE,
                "forwarded": [],
                "record": None,
                "suggested_record": None,
                "total_bytes": len(SIGNED.encode()) + len("-- \nDana Ruiz\nAcme".encode()),
                "max_bytes": 26_214_400,
            },
        )
        self.assertFalse(MailDraft.objects.exists())

    def test_a_reply_goes_to_the_sender_under_re_with_the_quote_below_the_signature(self):
        data = self.compose("reply", self.quote).data
        self.assertEqual(data["source_message_id"], self.quote.pk)
        self.assertEqual((data["to"], data["cc"]), ([["Ann Lee", "ann@pizzahut.com"]], []))
        self.assertEqual(data["subject"], "Re: Renewal quote")
        self.assertTrue(data["html"].startswith(SIGNED + '<div class="gmail_quote">On '))
        self.assertIn("Ann Lee &lt;ann@pizzahut.com&gt; wrote:<blockquote>", data["html"])
        pizza = {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        self.assertEqual((data["record"], data["suggested_record"]), (pizza, pizza))

    def test_reply_to_wins_over_the_sender(self):
        MailMessage.objects.filter(pk=self.quote.pk).update(
            reply_to=[["Renewals", "renewals@pizzahut.com"]]
        )
        self.assertEqual(
            self.compose("reply", self.quote).data["to"], [["Renewals", "renewals@pizzahut.com"]]
        )

    def test_reply_all_adds_everyone_else_once_to_over_cc_and_never_me(self):
        MailMessage.objects.filter(pk=self.quote.pk).update(
            to=[["Dana Ruiz", "dana@acme.io"], ["Ops", "OPS@pizzahut.com"]],
            cc=[["", "ops@pizzahut.com"], ["Sam Pizza", "sam@pizzahut.com"]],
        )
        data = self.compose("reply_all", self.quote).data
        self.assertEqual(data["to"], [["Ann Lee", "ann@pizzahut.com"], ["Ops", "ops@pizzahut.com"]])
        self.assertEqual(data["cc"], [["Sam Pizza", "sam@pizzahut.com"]])

    def test_replying_to_my_own_message_goes_to_its_recipients(self):
        mine, _ = gmail_store.store_gmail(
            self.mailbox,
            gmail_message(
                "me1",
                labels=["SENT"],
                sender="Dana Ruiz <dana@acme.io>",
                to="Ann Lee <ann@pizzahut.com>",
                subject="RE: Renewal quote",
            ),
            now=self.now,
        )
        data = self.compose("reply", mine).data
        self.assertEqual(data["to"], [["Ann Lee", "ann@pizzahut.com"]])
        self.assertEqual(data["subject"], "RE: Renewal quote")

    def test_a_forward_keeps_the_files_and_names_the_original(self):
        data = self.compose("forward", self.quote).data
        self.assertEqual((data["to"], data["cc"], data["subject"]), ([], [], "Fwd: Renewal quote"))
        for line in (
            "---------- Forwarded message ---------",
            "From: Ann Lee &lt;ann@pizzahut.com&gt;",
            "Subject: Renewal quote",
            "To: Dana Ruiz &lt;dana@acme.io&gt;",
            "Cc: Sam Pizza &lt;sam@pizzahut.com&gt;",
        ):
            self.assertIn(line, data["html"])
        pdf = MailAttachment.objects.get(message=self.quote, part_id="1")
        self.assertEqual(
            data["forwarded"],
            [
                {
                    "id": pdf.pk,
                    "filename": "Renewal quote.pdf",
                    "mime_type": "application/pdf",
                    "size": 182311,
                    "origin": "forward",
                    "download_url": f"/api/v1/mail/attachments/{pdf.pk}/download/",
                }
            ],
        )
        self.assertIsNone(data["record"])
        self.assertGreater(data["total_bytes"], 182311)
        self.assertEqual(data["max_bytes"], 26_214_400)
        # The forwarded original is wrapped like a reply's quote, so the editor folds it.
        self.assertIn('<div class="gmail_quote">---------- Forwarded message', data["html"])

    def test_the_subject_prefixes(self):
        for kind, subject, expected in (
            ("reply", "re: Terms", "re: Terms"),
            ("reply_all", "Terms", "Re: Terms"),
            ("forward", "FW: Terms", "FW: Terms"),
            ("forward", "Fwd: Terms", "Fwd: Terms"),
            ("forward", "Re: Terms", "Fwd: Re: Terms"),
            ("new", "Terms", ""),
        ):
            with self.subTest(kind=kind, subject=subject):
                self.assertEqual(compose.subject_for(kind, subject), expected)

    def test_six_queries_for_a_forward(self):
        self.compose("forward", self.quote)
        with CaptureQueriesContext(db) as queries:
            self.assertEqual(self.compose("forward", self.quote).status_code, 200)
        self.assertLessEqual(len(queries), 6)


class RefusalTests(DraftFixture):
    def test_kind_and_message_are_checked_first(self):
        response = self.client.get(f"{URL}compose/?kind=answer")
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"kind": ["Choose new, reply, reply_all or forward."]}),
        )
        response = self.client.get(f"{URL}compose/?kind=reply")
        self.assertEqual(response.data, {"message": ["Choose a message to answer."]})

    def test_someone_elses_message_is_missing_even_for_their_manager(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.compose("reply", self.quote).status_code, 404)

    def test_a_drafts_message_cannot_be_answered(self):
        MailDraft.objects.create(
            connection=self.mailbox,
            owner=self.dana,
            organisation=self.org,
            kind="new",
            message=self.quote,
        )
        response = self.compose("reply", self.quote)
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "IS_DRAFT", "detail": "This message is a draft."}),
        )

    def test_the_connection_checks(self):
        self.mailbox.granted_scopes = ["https://www.googleapis.com/auth/gmail.readonly"]
        self.mailbox.save(update_fields=["granted_scopes"])
        response = self.compose("reply", self.quote)
        self.assertEqual((response.status_code, response.data["code"]), (409, "TWO_WAY_OFF"))
        self.assertTrue(response.data["needs_reconnect"])
        self.mailbox.provider = "imap"
        self.mailbox.save(update_fields=["provider"])
        response = self.compose("new")
        self.assertEqual((response.status_code, response.data["code"]), (400, "GMAIL_ONLY"))
        self.mailbox.delete()
        response = self.compose("new")
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))

    def test_a_paused_mailbox_still_prefills(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(self.compose("reply", self.quote).status_code, 200)


class SuggestionTests(DraftFixture):
    def test_a_contact_then_an_account_domain_then_an_organisation_domain(self):
        org = self.org.pk
        Contact.objects.create(customer=self.pizza, name="Kim", email="kim@else.io")
        self.assertEqual(
            compose.match(org, ["KIM@else.io"]),
            compose.Record("customer", self.pizza.pk, "Pizza Hut"),
        )
        self.assertEqual(
            compose.match(org, ["x@apac.pizzahut.com"]),
            compose.Record("account", self.apac.pk, "APAC"),
        )
        self.assertEqual(compose.match(org, ["x@nowhere.io", "y@pizzahut.com"]).id, self.pizza.pk)
        self.assertIsNone(compose.match(org, ["x@gmail.com"]))
        self.assertIsNone(compose.match(org, []))

    def test_two_queries_whatever_the_number_of_recipients(self):
        org = self.org.pk
        with CaptureQueriesContext(db) as one:
            compose.match(org, ["a@else.io"])
        with CaptureQueriesContext(db) as many:
            compose.match(org, [f"p{n}@else{n}.io" for n in range(30)])
        self.assertEqual(len(one), len(many))
        self.assertLessEqual(len(many), 2)

    def test_a_record_the_owner_may_not_open_is_never_named(self):
        ed = User.objects.create_user(
            email="ed@acme.io", password=None, name="Ed", organisation=self.org
        )
        pizza = compose.Record("customer", self.pizza.pk, "Pizza Hut")
        self.assertEqual(compose.visible(ed, pizza, None), [None, None])
        self.assertEqual(compose.visible(self.dana, pizza), [pizza])
        self.assertIsNone(compose.lookup(ed, pizza))
        self.assertEqual(
            compose.lookup(self.dana, compose.Record("customer", self.pizza.pk, "")), pizza
        )
```

- [ ] **Step 3: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_compose --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'compose' from 'services.mail'`.

- [ ] **Step 4: The prefill and the suggestion**

Create `services/mail/compose.py`:

```python
"""The editor's prefill and the customer suggestion (D3 contract §2
"GET mail/compose/", decision 25). Nothing here is stored, and nothing goes
to Gmail.

Recipients follow §2's table: a reply goes to the original's Reply-To, else
its sender, or to the same people when the person sent it; reply all adds
its To and Cc; the person's own address goes, and each address is kept
once, To before Cc. The body is an empty paragraph, the signature, then the
quote or the forward block, as Gmail lays it out. The suggestion is
match_parent's rule (a contact's address, then an account's domain, then an
organisation's) in two queries whatever the number of recipients, and a
record is named only when the owner may open it.
"""

import re
from collections import namedtuple
from dataclasses import dataclass, field
from html import escape

from django.conf import settings
from django.db.models import CharField, F, Q, Value
from django.db.models.functions import Concat, Lower

from services.customers.models import Account, Contact, Customer
from services.customers.scoping import visible_accounts, visible_customers

from . import html
from .models import MailDraft
from .send_as import signature_block
from .sync import PUBLIC_DOMAINS, sender_name

Kind = MailDraft.Kind
REPLIES = (Kind.REPLY, Kind.REPLY_ALL)
RE = re.compile(r"^\s*re:", re.IGNORECASE)
FWD = re.compile(r"^\s*fwd?:", re.IGNORECASE)
#: A record a draft files on.
Record = namedtuple("Record", ["kind", "id", "name"])


def subject_for(kind, subject):
    subject = subject or ""
    if kind in REPLIES:
        return subject if RE.match(subject) else f"Re: {subject}"[:255]
    if kind == Kind.FORWARD:
        return subject if FWD.match(subject) else f"Fwd: {subject}"[:255]
    return ""


def _people(pairs, own, seen):
    found = []
    for pair in pairs or []:
        name, address = (list(pair) + ["", ""])[:2]
        address = (address or "").strip().lower()
        if not address or address in own or address in seen:
            continue
        seen.add(address)
        found.append([name or "", address])
    return found


def recipients_for(kind, source, connection):
    """(to, cc) for `kind` answering `source` (§2's table)."""
    if kind not in REPLIES:
        return [], []
    own = {connection.address.lower()}
    mine = (source.from_address or "").lower() in own
    if mine:
        to = list(source.to)
    else:
        to = list(source.reply_to) or [[source.from_name, source.from_address]]
    cc = []
    if kind == Kind.REPLY_ALL:
        to += list(source.to)
        cc = list(source.cc)
    seen = set()
    return _people(to, own, seen), _people(cc, own, seen)


def _when(moment):
    return f"{moment.day} {moment:%b %Y}"


def _who(name, address):
    shown = f"&lt;{escape(address or '')}&gt;"
    return f"{escape(name)} {shown}" if name else shown


def _people_line(pairs):
    return ", ".join(_who(name, address) for name, address in pairs)


def _quoted_body(source):
    return source.html_body or html.paragraphs(source.body)


def quote_html(source):
    """Gmail's quote: who wrote, when, and the original in a blockquote."""
    return (
        f'<div class="gmail_quote">On {_when(source.sent_at)}, '
        f"{_who(source.from_name, source.from_address)} wrote:"
        f"<blockquote>{_quoted_body(source)}</blockquote></div>"
    )


def forward_html(source):
    """Gmail's forward block: From, Date, Subject, To and Cc, then the original."""
    lines = [
        "---------- Forwarded message ---------",
        f"From: {_who(source.from_name, source.from_address)}",
        f"Date: {_when(source.sent_at)}",
        f"Subject: {escape(source.subject)}",
        f"To: {_people_line(source.to)}",
    ]
    if source.cc:
        lines.append(f"Cc: {_people_line(source.cc)}")
    return f'<div class="gmail_quote">{"<br>".join(lines)}<br><br>{_quoted_body(source)}</div>'


def attachment_row(part, origin):
    """A draft's attachment as §2 shows it: `upload`, `gmail` or `forward`."""
    return {
        "id": part.pk,
        "filename": part.filename,
        "mime_type": part.mime_type,
        "size": part.size,
        "origin": origin,
        "download_url": f"/api/v1/mail/attachments/{part.pk}/download/",
    }


def filed_record(message):
    """The record `message`'s filed copy is on, or None."""
    email = message.email if message is not None and message.email_id else None
    if email is None:
        return None
    if email.customer_id is not None:
        return Record("customer", email.customer_id, email.customer.name)
    if email.account_id is not None:
        return Record("account", email.account_id, email.account.name)
    return None


def match(organisation_id, addresses):
    """match_parent's answer in at most two queries (§8): a contact's address
    first, in the addresses' order; then, by the first address whose domain
    is known, an account's domain before an organisation's."""
    wanted = list(dict.fromkeys(address.lower() for address in addresses if address))
    if not wanted:
        return None
    contacts = {}
    rows = (
        Contact.objects.annotate(lowered=Lower("email"))
        .filter(lowered__in=wanted)
        .filter(
            Q(customer__organisation_id=organisation_id)
            | Q(account__customers__organisation_id=organisation_id)
        )
        .select_related("customer", "account")
    )
    for contact in rows:
        contacts.setdefault(contact.lowered, contact)
    for address in wanted:
        contact = contacts.get(address)
        if contact is not None and contact.customer_id is not None:
            return Record("customer", contact.customer_id, contact.customer.name)
        if contact is not None and contact.account_id is not None:
            return Record("account", contact.account_id, contact.account.name)
    domains = [
        domain
        for domain in dict.fromkeys(a.rsplit("@", 1)[-1] for a in wanted if "@" in a)
        if domain not in PUBLIC_DOMAINS
    ]
    if not domains:
        return None
    accounts = (
        Account.objects.annotate(lowered=Lower("domain"))
        .filter(lowered__in=domains, customers__organisation_id=organisation_id)
        .annotate(tag=Concat(Value("account:"), F("lowered"), output_field=CharField()))
        .values_list("pk", "name", "tag")
    )
    customers = (
        Customer.objects.annotate(lowered=Lower("domain"))
        .filter(lowered__in=domains, organisation_id=organisation_id)
        .annotate(tag=Concat(Value("customer:"), F("lowered"), output_field=CharField()))
        .values_list("pk", "name", "tag")
    )
    found = {}
    for pk, name, tag in accounts.union(customers, all=True):
        kind, _, domain = tag.partition(":")
        found.setdefault((kind, domain), Record(kind, pk, name))
    for domain in domains:
        for kind in ("account", "customer"):
            if (kind, domain) in found:
                return found[(kind, domain)]
    return None


def suggest(connection, pairs):
    """The record the recipients suggest (decision 25), the owner's own
    address left out; None when nothing matches."""
    own = connection.address.lower()
    addresses = [address for _, address in pairs or [] if address and address.lower() != own]
    return match(connection.organisation_id, addresses)


def visible(user, *records):
    """Each record, or None where `user` may not open it: at most one query per kind."""
    wanted = {"customer": set(), "account": set()}
    for record in records:
        if record is not None:
            wanted[record.kind].add(record.id)
    ok = set()
    # SOC2:AUTH-02 a draft names only records its owner may open
    if wanted["customer"]:
        ok |= {
            ("customer", pk)
            for pk in visible_customers(user)
            .filter(pk__in=wanted["customer"])
            .values_list("pk", flat=True)
        }
    if wanted["account"]:
        ok |= {
            ("account", pk)
            for pk in visible_accounts(user)
            .filter(pk__in=wanted["account"])
            .values_list("pk", flat=True)
        }
    return [
        record if record is not None and (record.kind, record.id) in ok else None
        for record in records
    ]


def lookup(user, record):
    """`record` (its kind and id) with its name, when `user` may open it; else None."""
    # SOC2:AUTH-02 only a record the owner may open
    rows = visible_customers(user) if record.kind == "customer" else visible_accounts(user)
    name = rows.filter(pk=record.id).values_list("name", flat=True).first()
    return None if name is None else Record(record.kind, record.id, name)


def as_payload(record):
    return None if record is None else dict(record._asdict())


@dataclass
class Prefill:
    kind: str
    source: object
    sender: dict
    to: list
    cc: list
    subject: str
    html: str
    signature_html: str
    forwarded: list = field(default_factory=list)
    record: Record | None = None
    suggested: Record | None = None
    bcc: list = field(default_factory=list)

    def payload(self):
        return {
            "kind": self.kind,
            "source_message_id": self.source.pk if self.source is not None else None,
            "from": self.sender,
            "to": self.to,
            "cc": self.cc,
            "bcc": self.bcc,
            "subject": self.subject,
            "html": self.html,
            "signature_html": self.signature_html,
            "forwarded": [attachment_row(part, "forward") for part in self.forwarded],
            "record": as_payload(self.record),
            "suggested_record": as_payload(self.suggested),
            # Controller amendment: the limit and the running total before a draft exists.
            "total_bytes": self.total_bytes(),
            "max_bytes": settings.MAIL_SEND_MAX_BYTES,
        }

    def total_bytes(self):
        """Decision 20's total for this prefill: the forwarded files' declared
        sizes plus the html and the text it derives (0 files for a fresh compose)."""
        files = sum(part.size for part in self.forwarded)
        return files + len(self.html.encode()) + len(html.to_text(self.html).encode())


def prefill(connection, user, kind, source=None):
    """What an editor that has not saved yet starts from (§2)."""
    to, cc = recipients_for(kind, source, connection) if source is not None else ([], [])
    if kind in REPLIES:
        tail = quote_html(source)
    elif kind == Kind.FORWARD:
        tail = forward_html(source)
    else:
        tail = ""
    forwarded = (
        list(source.attachments.filter(is_inline=False).order_by("part_id", "pk"))
        if kind == Kind.FORWARD
        else []
    )
    filed = filed_record(source) if kind in REPLIES else None
    record, suggested = visible(user, filed, suggest(connection, [*to, *cc]))
    return Prefill(
        kind=kind,
        source=source,
        sender={"name": sender_name(connection), "address": connection.address},
        to=to,
        cc=cc,
        subject=subject_for(kind, source.subject if source is not None else ""),
        html="<p></p>" + signature_block(connection) + tail,
        signature_html=connection.signature_html,
        forwarded=forwarded,
        record=record if kind in REPLIES else suggested,
        suggested=suggested,
    )
```

- [ ] **Step 5: The checks**

In `services/mail/actions.py`, after `CHOOSE_LABEL`, add `IS_DRAFT = "This message is a draft."`.

Create `services/mail/drafts.py`:

```python
"""A person's Gmail drafts, Revenact's side (D3 contract §1-§3).

A `MailDraft` is one Gmail draft, owner-only. Its `message` is the Drafts
folder's row: a placeholder (`pending-draft:<id>`) until Gmail has made the
draft, then the draft's own message. Every write here runs in the request's
transaction under §3's locks (the linked ReplyDraft, the draft, its message
and source, the mailbox row, then its outbox rows), changes the draft and
its Drafts row at once, and queues one draft row for the tick
(services/mail/draft_flush.py). A row carries no body: the MIME is built at
flush time from the content then (decision 6). `revision` counts content
changes from here or from Gmail; a write from a stale one is refused (409
DRAFT_CHANGED, decision 8). Drafts may be written while the mailbox is
paused (decision 14); they cannot be sent then.
"""

from django.core.exceptions import ObjectDoesNotExist
from django.http import Http404
from rest_framework import status

from . import gates
from .actions import GMAIL_ONLY, IS_DRAFT, NO_MAILBOX, TWO_WAY_OFF, error
from .models import MailboxConnection, MailDraft, MailMessage

Kind = MailDraft.Kind
Status = MailDraft.Status
DISCONNECTED = MailboxConnection.Status.DISCONNECTED

CHOOSE_KIND = "Choose new, reply, reply_all or forward."
CHOOSE_SOURCE = "Choose a message to answer."


def refusal(connection, *, sending=False):
    """Contract §3's connection checks, the first failing answering: 1 Outlook
    or IMAP, 2 Google disconnected (or no mailbox at all), 3 not two-way, 4
    (sending only) paused."""
    if connection is not None and not connection.is_google:
        return error("GMAIL_ONLY", GMAIL_ONLY, status.HTTP_400_BAD_REQUEST)
    if connection is None or connection.status == DISCONNECTED:
        return error("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
    if not connection.two_way:
        return error("TWO_WAY_OFF", TWO_WAY_OFF, status.HTTP_409_CONFLICT, needs_reconnect=True)
    if sending:
        return gates.paused_response(connection)
    return None


def is_draft(message):
    """A live draft's message (decision 13); a joined `draft` costs nothing."""
    try:
        draft = message.draft
    except ObjectDoesNotExist:
        return False
    return draft.status in MailDraft.LIVE


def is_draft_answer():
    return error("IS_DRAFT", IS_DRAFT, status.HTTP_409_CONFLICT)


def own_message(user, pk):
    """One of the caller's own messages, its connection, filed record and draft
    joined; Http404 for anyone else's, however senior."""
    # SOC2:AUTH-02 the person's whole mailbox is theirs alone
    message = (
        MailMessage.objects.filter(owner=user, pk=pk)
        .select_related("connection__user", "email__customer", "email__account", "draft")
        .first()
    )
    if message is None:
        raise Http404
    return message


def own_connection(user):
    """The caller's own mailbox row, read fresh (a kept, disconnected Google row included)."""
    # SOC2:AUTH-02 the caller's own mailbox only
    return MailboxConnection.objects.select_related("user").filter(user=user).first()
```

- [ ] **Step 6: The route**

Create `services/mail/draft_views.py`:

```python
"""Two-way Gmail's delivery 3 routes (D3 contract §2-§6): the compose
prefill, drafts and their attachments, sending, and searching older mail in
Gmail. Owner-only throughout: a draft, a source, an upload and a search
result are found only among the caller's own (SOC2:AUTH-02)."""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import compose, drafts
from .models import MailDraft


def _pk(raw):
    """A query-string id: ASCII digits, short enough for a bigint; else None."""
    return int(raw) if raw.isascii() and raw.isdigit() and len(raw) <= 18 else None


class MailComposeView(APIView):
    """GET /api/v1/mail/compose/?kind=&message= — the editor's prefill (§2).
    Nothing is stored and nothing goes to Gmail. A paused mailbox still
    prefills (decision 14)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        kind = request.query_params.get("kind", "")
        if kind not in MailDraft.Kind.values:
            return Response({"kind": [drafts.CHOOSE_KIND]}, status=status.HTTP_400_BAD_REQUEST)
        source = None
        if kind == MailDraft.Kind.NEW:
            connection = drafts.own_connection(request.user)
        else:
            pk = _pk(request.query_params.get("message", ""))
            if pk is None:
                return Response(
                    {"message": [drafts.CHOOSE_SOURCE]}, status=status.HTTP_400_BAD_REQUEST
                )
            source = drafts.own_message(request.user, pk)
            if drafts.is_draft(source):
                return drafts.is_draft_answer()
            connection = source.connection
        refused = drafts.refusal(connection)
        if refused is not None:
            return refused
        return Response(compose.prefill(connection, request.user, kind, source).payload())
```

In `services/mail/urls.py`, add `draft_views` to the import (`from . import draft_views, views`) and, after the `mail-labels` route:

```python
(path("mail/compose/", draft_views.MailComposeView.as_view(), name="mail-compose"),)
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail.tests.test_compose --parallel auto --noinput`
Expected: OK. If `test_six_queries_for_a_forward` fails, print `queries.captured_queries`: the six are the source (joined), its attachments, the suggestion's two (contacts, then the domain union) and the record check; a seventh means a lazy relation (add it to `own_message`'s `select_related`).

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff format services/mail/compose.py services/mail/drafts.py services/mail/draft_views.py services/mail/actions.py services/mail/urls.py services/mail/tests/draft_fixtures.py services/mail/tests/test_compose.py
venv/bin/ruff check --fix services/mail/compose.py services/mail/drafts.py services/mail/draft_views.py services/mail/actions.py services/mail/urls.py services/mail/tests/draft_fixtures.py services/mail/tests/test_compose.py
git add services/mail/compose.py services/mail/drafts.py services/mail/draft_views.py services/mail/actions.py services/mail/urls.py services/mail/tests/draft_fixtures.py services/mail/tests/test_compose.py
git commit -m "$(cat <<'EOF'
feat(mail): prefill compose for new, reply, reply all and forward

GET mail/compose/ builds what an editor starts from without storing
anything: recipients by Gmail's rules, Re:/Fwd: once, the signature above
the quote or forward block, a forward's files, and the filed record or the
customer the recipients suggest, only when the owner may open it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 6: Drafts: create and read

**Files:**
- Modify: `services/mail/drafts.py` (imports; content rules; enqueue; create; read; payload)
- Modify: `services/mail/outbox.py` (draft verbs, the size clause, `draft_sentence`)
- Modify: `services/mail/draft_views.py` (`MailDraftListView` POST, `MailDraftView` GET)
- Modify: `services/mail/urls.py`
- Test: `services/mail/tests/test_drafts.py`

**Interfaces:**
- Consumes: Task 5's `compose.prefill`, `compose.Record`, `compose.visible`, `compose.lookup`, `compose.suggest`, `compose.attachment_row`, `compose.as_payload`, `drafts.refusal`, `drafts.own_message`, `drafts.own_connection`; Task 4's `html.clean`, `html.to_text`; Task 1's models; `actions.lock_connection`; `outbox.wake`.
- Produces (in `services/mail/drafts.py`):
  - `ContentSerializer`; `check_shape(data)` (raises DRF `ValidationError`);
  - `clean(data, *, user, kind, source_id, base, linked=False) -> dict` (the fields sent, checked; `to`/`cc`/`bcc` de-duplicated across all three when any is sent; `record` a `compose.Record` or `None`);
  - `dedupe(to, cc, bcc) -> (to, cc, bcc)`;
  - `record_of(draft) -> compose.Record | None`; `record_ids(record) -> (customer_id, account_id)`;
  - `enqueue(draft, *, now)` (decision 6's single pending row; sets `draft.gmail_state = "saving"`, unsaved; wakes on commit);
  - `create(connection, user, *, kind, source, content, now, record_chosen=False, reply_draft=None) -> MailDraft` (`content`: `to, cc, bcc, subject, html, forwarded, record`);
  - `create_from_request(connection, user, kind, source, data, *, now) -> MailDraft`;
  - `lock_rows(message_ids)`;
  - `RELATED`; `readable(user, pk) -> MailDraft` (Http404; not `discarded`);
  - `attachments_of(draft) -> list[MailAttachment]`; `total_of(draft, parts) -> int`; `total_bytes(draft) -> int`;
  - `sending_state(draft, now=None) -> None | "pending" | "unconfirmed"`; `sync_issue(draft, now=None) -> dict | None`;
  - `payload(draft, user) -> dict` (§2);
  - `UPLOAD_PREFIX = "upload:"`, `CONTENT_FIELDS`, the sentences;
  - `outbox.draft_sentence(row, reason) -> str`, `outbox.PART_GONE`;
  - `POST /api/v1/mail/drafts/` (`mail-drafts`), `GET /api/v1/mail/drafts/<id>/` (`mail-draft`).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_drafts.py`:

```python
"""POST and GET mail/drafts/ (D3 contract §2, §3): a draft is made with its
Drafts row (a placeholder) and one draft_create row at once, the content
left out taken from the prefill; recipients cleaned and de-duplicated; HTML
sanitised and the text derived; the record checked; the connection checks
(paused allowed); owner-only reads; six queries for a read."""

from django.db import connection as db
from django.test import override_settings
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation
from services.customers.models import Customer
from services.mail.models import MailAttachment, MailDraft, MailMessage, MailOutbox

from .draft_fixtures import SIGNATURE, URL, DraftFixture

SIGNED = f"<p></p><div data-revenact-signature>{SIGNATURE}</div>"


class CreateTests(DraftFixture):
    def test_a_reply_from_the_prefill_shows_in_drafts_and_its_thread_at_once(self):
        data = self.new_draft()
        draft = self.stored(data["id"])
        self.assertEqual(
            (data["kind"], data["status"], data["sending"], data["revision"]),
            ("reply", "open", None, 1),
        )
        self.assertEqual(data["gmail"], {"state": "saving"})
        self.assertEqual(data["to"], [["Ann Lee", "ann@pizzahut.com"]])
        self.assertEqual(data["subject"], "Re: Renewal quote")
        self.assertTrue(data["html"].startswith(SIGNED.replace("signature>", 'signature="">')))
        self.assertIn("-- \nDana Ruiz\nAcme", data["text"])
        self.assertEqual(data["thread_id"], self.quote.thread_id)
        self.assertEqual(data["source"]["message_id"], self.quote.pk)
        self.assertEqual(data["source"]["from"], {"name": "Ann Lee", "address": "ann@pizzahut.com"})
        self.assertEqual(data["from"], {"name": "Dana Ruiz", "address": "dana@acme.io"})
        pizza = {"kind": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        self.assertEqual((data["record"], data["suggested_record"]), (pizza, pizza))
        self.assertFalse(data["record_chosen"])
        self.assertEqual(data["attachments"], [])
        self.assertEqual(data["total_bytes"], len(draft.html.encode()) + len(draft.text.encode()))
        self.assertEqual(data["max_bytes"], 26_214_400)
        self.assertEqual(
            (data["sync_issue"], data["agent"], data["reply_draft_id"], data["can_resolve"]),
            (None, None, None, False),
        )
        row = MailMessage.objects.get(pk=data["message_id"])
        self.assertEqual(row.provider_message_id, f"pending-draft:{draft.pk}")
        self.assertEqual((row.label_ids, row.folder), (["DRAFT"], "drafts"))
        self.assertEqual((row.thread_id, row.subject), (self.quote.thread_id, "Re: Renewal quote"))
        self.assertEqual(row.to, [["Ann Lee", "ann@pizzahut.com"]])
        listed = self.client.get(f"{URL}messages/?folder=drafts").data
        self.assertEqual([item["id"] for item in listed["results"]], [row.pk])
        thread = self.client.get(f"{URL}messages/{self.quote.pk}/thread/").data
        self.assertIn(row.pk, [item["id"] for item in thread["messages"]])
        self.assertEqual(
            list(MailOutbox.objects.values_list("op", "status", "draft_id")),
            [("draft_create", "pending", draft.pk)],
        )
        self.mailbox.refresh_from_db()
        self.assertIsNotNone(self.mailbox.wake_at)

    def test_html_is_sanitised_and_the_text_derived_from_it(self):
        data = self.new_draft(html="<p>Works for us.</p><script>alert(1)</script>")
        self.assertEqual((data["html"], data["text"]), ("<p>Works for us.</p>", "Works for us."))

    def test_a_new_message_cleans_its_recipients_and_follows_the_suggestion(self):
        response = self.post_draft(
            {
                "kind": "new",
                "to": ["Ann <ANN@pizzahut.com>"],
                "cc": [["Sam", "sam@pizzahut.com"], "ann@pizzahut.com"],
                "bcc": ["carl@acme.io"],
                "subject": "Hello",
            }
        )
        self.assertEqual(response.status_code, 201, response.data)
        data = response.data
        self.assertEqual(data["to"], [["Ann", "ann@pizzahut.com"]])
        self.assertEqual(data["cc"], [["Sam", "sam@pizzahut.com"]])
        self.assertEqual(data["bcc"], [["", "carl@acme.io"]])
        self.assertEqual((data["thread_id"], data["source"]), ("", None))
        self.assertEqual(data["record"]["id"], self.pizza.pk)
        self.assertFalse(data["record_chosen"])

    def test_a_forward_keeps_the_originals_files(self):
        response = self.post_draft({"kind": "forward", "source_message_id": self.quote.pk})
        self.assertEqual(response.status_code, 201, response.data)
        [pdf] = response.data["attachments"]
        self.assertEqual((pdf["filename"], pdf["origin"]), ("Renewal quote.pdf", "forward"))
        self.assertGreater(response.data["total_bytes"], 182311)

    def test_a_cleared_record_is_chosen(self):
        data = self.new_draft(record=None)
        self.assertEqual((data["record"], data["record_chosen"]), (None, True))

    def test_a_paused_mailbox_still_takes_drafts(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(
            self.post_draft({"kind": "reply", "source_message_id": self.quote.pk}).status_code,
            201,
        )


class CreateRefusalTests(DraftFixture):
    def answer(self, body):
        return self.post_draft(body)

    def test_the_kind_and_the_source(self):
        response = self.answer({"kind": "memo"})
        self.assertEqual(response.data, {"kind": ["Choose new, reply, reply_all or forward."]})
        response = self.answer({"kind": "reply"})
        self.assertEqual(response.data, {"source_message_id": ["Choose a message to answer."]})
        self.client.force_authenticate(self.carl)
        self.assertEqual(
            self.answer({"kind": "reply", "source_message_id": self.quote.pk}).status_code, 404
        )

    def test_field_errors(self):
        base = {"kind": "reply", "source_message_id": self.quote.pk}
        response = self.answer({**base, "to": ["not an address"]})
        self.assertEqual(
            (response.status_code, response.data), (400, {"to": ["Enter a valid email address."]})
        )
        response = self.answer({**base, "forwarded": [MailAttachment.objects.first().pk]})
        self.assertEqual(
            response.data, {"forwarded": ["Choose files from the message you are forwarding."]}
        )
        other = Organisation.objects.create(name="Elsewhere")
        hidden = Customer.objects.create(organisation=other, name="Hidden", domain="hidden.io")
        response = self.answer({**base, "record": {"kind": "customer", "id": hidden.pk}})
        self.assertEqual(response.data, {"record": ["Choose a record you can open."]})
        self.assertFalse(MailDraft.objects.exists())

    @override_settings(MAIL_SEND_MAX_RECIPIENTS=2, MAIL_HTML_MAX_BYTES=40)
    def test_the_limits(self):
        base = {"kind": "new"}
        response = self.answer({**base, "to": ["a@x.io", "b@x.io"], "cc": ["c@x.io"]})
        self.assertEqual(
            response.data, {"non_field_errors": ["A message can go to at most 2 people."]}
        )
        response = self.answer({**base, "html": "<p>" + "x" * 60 + "</p>"})
        self.assertEqual(response.data, {"html": ["This message is too long."]})

    def test_a_drafts_message_and_the_connection_checks(self):
        draft = self.new_draft()
        response = self.answer({"kind": "reply", "source_message_id": draft["message_id"]})
        self.assertEqual((response.status_code, response.data["code"]), (409, "IS_DRAFT"))
        self.mailbox.granted_scopes = []
        self.mailbox.save(update_fields=["granted_scopes"])
        response = self.answer({"kind": "new"})
        self.assertEqual((response.status_code, response.data["code"]), (409, "TWO_WAY_OFF"))


class ReadTests(DraftFixture):
    def test_the_owner_reads_it_and_nobody_else_does(self):
        draft = self.new_draft()
        self.assertEqual(self.client.get(f"{URL}drafts/{draft['id']}/").data["id"], draft["id"])
        for someone in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(someone)
            self.assertEqual(self.client.get(f"{URL}drafts/{draft['id']}/").status_code, 404)

    def test_a_discarded_draft_is_missing(self):
        draft = self.new_draft()
        MailDraft.objects.filter(pk=draft["id"]).update(status="discarded")
        self.assertEqual(self.client.get(f"{URL}drafts/{draft['id']}/").status_code, 404)

    def test_six_queries_for_a_read(self):
        draft = self.new_draft(to=[f"p{n}@pizzahut.com" for n in range(20)])
        url = f"{URL}drafts/{draft['id']}/"
        self.client.get(url)
        with CaptureQueriesContext(db) as queries:
            self.assertEqual(self.client.get(url).status_code, 200)
        self.assertLessEqual(len(queries), 6)

    def test_a_create_stays_within_its_ceiling(self):
        self.new_draft()
        with CaptureQueriesContext(db) as queries:
            self.new_draft(to=[f"p{n}@pizzahut.com" for n in range(20)])
        self.assertLessEqual(len(queries), 18)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_drafts --parallel auto --noinput`
Expected: FAIL, 404s (no route for `mail/drafts/`).

- [ ] **Step 3: The outbox's draft sentences**

In `services/mail/outbox.py`, add to `VERBS`:

```python
    Op.DRAFT_CREATE: "save the draft",
    Op.DRAFT_UPDATE: "save the draft",
    Op.DRAFT_DELETE: "delete the draft",
```

add to `CLAUSES`: `Reason.TOO_LARGE: "it is over Gmail's size limit",`, and after `sentence`, add:

```python
#: D3 §5: a part Gmail no longer has.
PART_GONE = "Couldn't save this draft to Gmail: an attachment is no longer in Gmail."


def draft_sentence(row, reason):
    """A draft row's notice and sync_issue: "Couldn't save the draft in
    Gmail: ...", or the part-gone sentence (contract §5)."""
    if (row.payload or {}).get("part") == "gone":
        return PART_GONE
    return sentence(row.op, reason)
```

- [ ] **Step 4: The content rules, create and read**

In `services/mail/drafts.py`, replace the imports with:

```python
import uuid
from datetime import timedelta
from email.utils import parseaddr

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError

from services.customers.drafts import UNCONFIRMED_AFTER, stamp

from . import compose, gates, html, outbox
from .actions import GMAIL_ONLY, IS_DRAFT, NO_MAILBOX, TWO_WAY_OFF, error
from .models import (
    PENDING_DRAFT_PREFIX,
    MailAttachment,
    MailboxConnection,
    MailDraft,
    MailMessage,
    MailOutbox,
)
from .sync import sender_name
```

and after the existing constants (`DISCONNECTED`), add:

```python
Op = MailOutbox.Op
State = MailDraft.GmailState
LIVE_ROWS = MailOutbox.LIVE
#: An uploaded part's part_id prefix (§3 "Attachments").
UPLOAD_PREFIX = "upload:"
#: The fields a create, PATCH or send may carry (§3).
CONTENT_FIELDS = ("to", "cc", "bcc", "subject", "html", "forwarded", "record")
#: Changes Gmail never sees: saved without a revision or a row (plan gap 2).
RECORD_FIELDS = frozenset({"customer", "account", "record_chosen"})
#: apply_content's name for a file added or removed (no model field).
ATTACHMENTS = "attachments"

ALREADY_SENT = "This draft has been sent."
DRAFT_CHANGED = "This draft changed in Gmail. Here is the newest version."
SEND_REVISION = "Send the revision you edited."
AGENT_RECORD = "An agent draft stays on its record."
CHOOSE_RECORD = "Choose a record you can open."
TOO_LONG = "This message is too long."
CHOOSE_FORWARDED = "Choose files from the message you are forwarding."
TOO_MANY_PEOPLE = "A message can go to at most {limit} people."
```

At the end of the module, add:

```python
# --- Content (§3 "Writes: shared rules") ---------------------------------


def _recipient(item):
    """[name, address] from a pair or a bare address; ValueError otherwise."""
    if isinstance(item, str):
        name, address = parseaddr(item)
    elif (
        isinstance(item, (list, tuple))
        and len(item) == 2
        and all(isinstance(part, str) for part in item)
    ):
        name, address = item
    else:
        raise ValueError("not a recipient")
    address = address.strip().lower()
    validate_email(address)
    return [name.strip()[:150], address]


class RecipientsField(serializers.Field):
    default_error_messages = {
        "not_a_list": 'Expected a list of items but got type "{input_type}".',
        "invalid": "Enter a valid email address.",
    }

    def to_internal_value(self, data):
        if not isinstance(data, list):
            self.fail("not_a_list", input_type=type(data).__name__)
        try:
            return [_recipient(item) for item in data]
        except (ValueError, DjangoValidationError):
            self.fail("invalid")

    def to_representation(self, value):
        return value


class RecordField(serializers.Field):
    default_error_messages = {"invalid": CHOOSE_RECORD}

    def to_internal_value(self, data):
        if not isinstance(data, dict) or data.get("kind") not in ("customer", "account"):
            self.fail("invalid")
        pk = data.get("id")
        if not isinstance(pk, int) or isinstance(pk, bool) or pk < 1:
            self.fail("invalid")
        return compose.Record(data["kind"], pk, "")

    def to_representation(self, value):
        return value


class ContentSerializer(serializers.Serializer):
    to = RecipientsField(required=False)
    cc = RecipientsField(required=False)
    bcc = RecipientsField(required=False)
    subject = serializers.CharField(
        max_length=255, allow_blank=True, required=False, trim_whitespace=False
    )
    html = serializers.CharField(allow_blank=True, required=False, trim_whitespace=False)
    forwarded = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=100
    )
    record = RecordField(required=False, allow_null=True)


def check_shape(data):
    """DRF's field errors for the content fields (400), before the connection checks."""
    ContentSerializer(data=data).is_valid(raise_exception=True)


def dedupe(to, cc, bcc):
    """Each address once across the three, To then Cc then Bcc (§3)."""
    seen, kept = set(), []
    for pairs in (to, cc, bcc):
        field = []
        for name, address in pairs:
            if address not in seen:
                seen.add(address)
                field.append([name, address])
        kept.append(field)
    return tuple(kept)


def clean(data, *, user, kind, source_id, base, linked=False):
    """The content fields `data` carries, checked (§3): DRF's field errors,
    then the HTML's size, the forwarded files, the record and the recipient
    limit, every problem at once as a 400. `base` holds the to, cc and bcc
    the sent ones are de-duplicated against. Returns the fields sent."""
    serializer = ContentSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    valid = dict(serializer.validated_data)
    errors = {}
    if "html" in valid:
        safe = html.clean(valid["html"])
        if len(safe.encode()) > settings.MAIL_HTML_MAX_BYTES:
            errors["html"] = [TOO_LONG]
        valid["html"] = safe
    if "forwarded" in valid:
        ids = list(dict.fromkeys(valid["forwarded"]))
        allowed = set()
        if ids and kind == Kind.FORWARD and source_id:
            allowed = set(
                MailAttachment.objects.filter(
                    message_id=source_id, is_inline=False, pk__in=ids
                ).values_list("pk", flat=True)
            )
        if set(ids) - allowed:
            errors["forwarded"] = [CHOOSE_FORWARDED]
        valid["forwarded"] = ids
    if "record" in valid:
        if linked:
            errors["record"] = [AGENT_RECORD]
        elif valid["record"] is not None:
            # SOC2:AUTH-02 a draft files only on a record its owner may open
            found = compose.lookup(user, valid["record"])
            if found is None:
                errors["record"] = [CHOOSE_RECORD]
            valid["record"] = found
    if any(field in valid for field in ("to", "cc", "bcc")):
        to, cc, bcc = dedupe(*(valid.get(field, base[field]) for field in ("to", "cc", "bcc")))
        limit = settings.MAIL_SEND_MAX_RECIPIENTS
        if len(to) + len(cc) + len(bcc) > limit:
            errors["non_field_errors"] = [TOO_MANY_PEOPLE.format(limit=limit)]
        valid.update(to=to, cc=cc, bcc=bcc)
    if errors:
        raise ValidationError(errors)
    return valid


def record_ids(record):
    """(customer_id, account_id) for a compose.Record or None."""
    if record is None:
        return None, None
    return (record.id, None) if record.kind == "customer" else (None, record.id)


def record_of(draft):
    """The record the draft files on, with its name (joined), or None."""
    if draft.customer_id is not None:
        return compose.Record("customer", draft.customer_id, draft.customer.name)
    if draft.account_id is not None:
        return compose.Record("account", draft.account_id, draft.account.name)
    return None


# --- Writing it ----------------------------------------------------------


def lock_rows(message_ids):
    """Lock messages in pk order (§3 lock 3)."""
    ids = sorted({pk for pk in message_ids if pk})
    if ids:
        list(
            MailMessage.objects.select_for_update()
            .filter(pk__in=ids)
            .order_by("pk")
            .values_list("pk", flat=True)
        )


def enqueue(draft, *, now):
    """§3 "Enqueueing", in the caller's transaction once the mailbox row is
    locked. A pending create builds from the content at flush time and needs
    nothing more; a pending update is made due again under a new action id;
    otherwise an update when Gmail has the draft or a create is in flight
    (plan gap 4), else a create. Sets gmail_state (unsaved) and wakes the
    mailbox on commit."""
    rows = list(
        MailOutbox.objects.select_for_update()
        .filter(draft=draft, status__in=LIVE_ROWS)
        .order_by("pk")
    )
    pending = next((row for row in rows if row.status == MailOutbox.Status.PENDING), None)
    if pending is not None and pending.op == Op.DRAFT_UPDATE:
        MailOutbox.objects.filter(pk=pending.pk).update(
            action_id=uuid.uuid4(), next_attempt_at=now, attempts=0, updated_at=now
        )
    elif pending is None:
        creating = any(row.op == Op.DRAFT_CREATE for row in rows)
        MailOutbox.objects.create(
            connection_id=draft.connection_id,
            action_id=uuid.uuid4(),
            op=Op.DRAFT_UPDATE if draft.gmail_draft_id or creating else Op.DRAFT_CREATE,
            draft=draft,
            next_attempt_at=now,
        )
    draft.gmail_state = State.SAVING
    connection_id = draft.connection_id
    transaction.on_commit(lambda: outbox.wake(connection_id))


def create(connection, user, *, kind, source, content, now, record_chosen=False, reply_draft=None):
    """A new open draft, its placeholder in Drafts (decision 2) and its
    draft_create row (§3 POST). `content` is complete: to, cc, bcc, subject,
    html, forwarded and record."""
    markup = html.clean(content["html"])
    customer_id, account_id = record_ids(content.get("record"))
    draft = MailDraft.objects.create(
        connection=connection,
        owner=user,
        organisation_id=connection.organisation_id,
        kind=kind,
        source=source,
        thread_id=source.thread_id if source is not None else "",
        in_reply_to=source.rfc_message_id if source is not None else "",
        references=source.references if source is not None else "",
        to=content["to"],
        cc=content["cc"],
        bcc=content["bcc"],
        subject=content["subject"][:255],
        html=markup,
        text=html.to_text(markup),
        forwarded=content["forwarded"],
        customer_id=customer_id,
        account_id=account_id,
        record_chosen=record_chosen,
        reply_draft=reply_draft,
    )
    draft.message = MailMessage.objects.create(
        connection=connection,
        owner=user,
        organisation_id=connection.organisation_id,
        provider_message_id=f"{PENDING_DRAFT_PREFIX}{draft.pk}",
        thread_id=draft.thread_id,
        direction=MailMessage.Direction.SENT,
        from_name=sender_name(connection)[:150],
        from_address=connection.address,
        to=draft.to,
        cc=draft.cc,
        bcc=draft.bcc,
        subject=draft.subject,
        snippet=" ".join(draft.text.split())[:300],
        body=draft.text,
        html_body=draft.html,
        label_ids=["DRAFT"],
        folder=MailMessage.Folder.DRAFTS,
        state=MailMessage.State.OPEN,
        is_read=True,
        has_attachments=bool(draft.forwarded),
        sent_at=now,
        refreshed_at=now,
    )
    enqueue(draft, now=now)
    draft.save(update_fields=["message", "gmail_state"])
    return draft


def create_from_request(connection, user, kind, source, data, *, now):
    """POST mail/drafts/ (§3), in the caller's transaction with the source and
    the mailbox row locked: the prefill with the person's fields over it."""
    base = compose.prefill(connection, user, kind, source)
    valid = clean(
        data,
        user=user,
        kind=kind,
        source_id=source.pk if source is not None else None,
        base={"to": base.to, "cc": base.cc, "bcc": base.bcc},
    )
    chosen = "record" in valid
    content = {
        "to": valid.get("to", base.to),
        "cc": valid.get("cc", base.cc),
        "bcc": valid.get("bcc", base.bcc),
        "subject": valid.get("subject", base.subject),
        "html": valid.get("html", base.html),
        "forwarded": valid.get("forwarded", [part.pk for part in base.forwarded]),
        "record": valid["record"] if chosen else base.record,
    }
    return create(
        connection, user, kind=kind, source=source, content=content, now=now, record_chosen=chosen
    )


# --- Reading it (§2) ----------------------------------------------------

#: What every read of a draft joins.
RELATED = ("connection__user", "message", "source", "customer", "account", "reply_draft")


def readable(user, pk):
    """The caller's draft, unless discarded; Http404 for anyone else's."""
    # SOC2:AUTH-02 a draft is its owner's alone, however senior the reader
    draft = (
        MailDraft.objects.filter(owner=user, pk=pk)
        .exclude(status=Status.DISCARDED)
        .select_related(*RELATED)
        .first()
    )
    if draft is None:
        raise Http404
    return draft


def attachments_of(draft):
    """The draft's own parts and its forwarded files, in one query."""
    where = []
    if draft.message_id:
        where.append(Q(message_id=draft.message_id))
    if draft.forwarded and draft.source_id:
        where.append(Q(pk__in=draft.forwarded, message_id=draft.source_id))
    if not where:
        return []
    query = where[0]
    for more in where[1:]:
        query |= more
    return list(MailAttachment.objects.filter(query).order_by("pk"))


def _own(draft, part):
    return draft.message_id is not None and part.message_id == draft.message_id


def _forwarded(draft, part):
    return part.pk in set(draft.forwarded) and part.message_id == draft.source_id


def total_of(draft, parts):
    """Decision 20's total: the files' declared sizes plus both bodies."""
    files = sum(part.size for part in parts if _own(draft, part) or _forwarded(draft, part))
    return files + len(draft.html.encode()) + len(draft.text.encode())


def total_bytes(draft):
    return total_of(draft, attachments_of(draft))


def sending_state(draft, now=None):
    """None, "pending", or "unconfirmed" once UNCONFIRMED_AFTER has passed since the claim."""
    if draft.status != Status.SENDING:
        return None
    waited = (now or timezone.now()) - draft.updated_at
    return "unconfirmed" if waited >= UNCONFIRMED_AFTER else "pending"


def sync_issue(draft, now=None):
    """The draft's newest row's failure, when it is the newest row and within
    MAIL_OUTBOX_ISSUE_DAYS (§2); else None. One query."""
    now = now or timezone.now()
    row = MailOutbox.objects.filter(draft=draft).order_by("-created_at", "-pk").first()
    if row is None or row.status != MailOutbox.Status.FAILED:
        return None
    if row.failed_at < now - timedelta(days=settings.MAIL_OUTBOX_ISSUE_DAYS):
        return None
    return {"text": outbox.draft_sentence(row, row.reason), "at": row.failed_at}


def payload(draft, user):
    """GET mail/drafts/<id>/ (§2), for its owner. Needs RELATED joined."""
    parts = attachments_of(draft)
    rows = [
        compose.attachment_row(
            part, "upload" if part.part_id.startswith(UPLOAD_PREFIX) else "gmail"
        )
        for part in parts
        if _own(draft, part)
    ]
    rows += [compose.attachment_row(part, "forward") for part in parts if _forwarded(draft, part)]
    record, suggested = compose.visible(
        user, record_of(draft), compose.suggest(draft.connection, [*draft.to, *draft.cc])
    )
    sending = sending_state(draft)
    source = draft.source
    reply = draft.reply_draft
    return {
        "id": draft.pk,
        "kind": draft.kind,
        # `sending` is internal: a draft being sent reads as sent, sent_at null.
        "status": "open" if draft.status == Status.OPEN else "sent",
        "sending": sending,
        "revision": draft.revision,
        "message_id": draft.message_id,
        "thread_id": draft.thread_id,
        "source": None
        if source is None
        else {
            "message_id": source.pk,
            "subject": source.subject,
            "from": {"name": source.from_name, "address": source.from_address},
            "sent_at": stamp(source.sent_at),
        },
        "from": {"name": sender_name(draft.connection), "address": draft.connection.address},
        "to": draft.to,
        "cc": draft.cc,
        "bcc": draft.bcc,
        "subject": draft.subject,
        "html": draft.html,
        "text": draft.text,
        "attachments": rows,
        "total_bytes": total_of(draft, parts),
        "max_bytes": settings.MAIL_SEND_MAX_BYTES,
        "record": compose.as_payload(record),
        "suggested_record": compose.as_payload(suggested),
        "record_chosen": draft.record_chosen,
        "gmail": {"state": draft.gmail_state},
        "sync_issue": sync_issue(draft),
        "agent": reply.agent if reply is not None else None,
        "reply_draft_id": draft.reply_draft_id,
        "created_at": stamp(draft.created_at),
        "updated_at": stamp(draft.updated_at),
        "sent_at": None if draft.sent_at is None else stamp(draft.sent_at),
        "can_resolve": sending == "unconfirmed",
    }
```

- [ ] **Step 5: The routes**

In `services/mail/draft_views.py`, replace the imports with:

```python
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import compose, drafts
from .actions import lock_connection
from .models import MailDraft
```

and add:

```python
class MailDraftListView(APIView):
    """POST /api/v1/mail/drafts/ — a new draft (§3). The content left out is
    the prefill's; the Drafts row and the draft_create row exist at once.
    There is no list route: Drafts is mail/messages/?folder=drafts."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        kind = data.get("kind")
        if kind not in MailDraft.Kind.values:
            return Response({"kind": [drafts.CHOOSE_KIND]}, status=status.HTTP_400_BAD_REQUEST)
        source = None
        if kind == MailDraft.Kind.NEW:
            connection = drafts.own_connection(request.user)
        else:
            pk = data.get("source_message_id")
            if not isinstance(pk, int) or isinstance(pk, bool):
                return Response(
                    {"source_message_id": [drafts.CHOOSE_SOURCE]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            source = drafts.own_message(request.user, pk)
            if drafts.is_draft(source):
                return drafts.is_draft_answer()
            connection = source.connection
        drafts.check_shape(data)
        refused = drafts.refusal(connection)
        if refused is not None:
            return refused
        with transaction.atomic():
            if source is not None:
                drafts.lock_rows([source.pk])
            # Checked again on the locked row: a disconnect that committed first refuses.
            connection = lock_connection(connection)
            refused = drafts.refusal(connection)
            if refused is not None:
                return refused
            draft = drafts.create_from_request(
                connection, request.user, kind, source, data, now=timezone.now()
            )
        return Response(
            drafts.payload(drafts.readable(request.user, draft.pk), request.user),
            status=status.HTTP_201_CREATED,
        )


class MailDraftView(APIView):
    """GET /api/v1/mail/drafts/<id>/ — the editor's read (§2). PATCH and
    DELETE follow (Tasks 7 and 8). Owner-only: 404 for anyone else."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(drafts.payload(drafts.readable(request.user, pk), request.user))
```

In `services/mail/urls.py`, after the `mail-compose` route:

```python
(path("mail/drafts/", draft_views.MailDraftListView.as_view(), name="mail-drafts"),)
(path("mail/drafts/<int:pk>/", draft_views.MailDraftView.as_view(), name="mail-draft"),)
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff format services/mail/drafts.py services/mail/outbox.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_drafts.py
venv/bin/ruff check --fix services/mail/drafts.py services/mail/outbox.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_drafts.py
git add services/mail/drafts.py services/mail/outbox.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_drafts.py
git commit -m "$(cat <<'EOF'
feat(mail): make and read gmail drafts in revenact

POST mail/drafts/ makes a draft from the prefill and the person's fields:
recipients cleaned and de-duplicated, HTML sanitised, text derived, the
record checked. It shows in Drafts and its thread at once as a placeholder,
and one draft_create row waits for the tick. GET is the owner's alone.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 7: Drafts: PATCH, the revision, the record, and a linked agent draft's mirror

**Files:**
- Modify: `services/mail/drafts.py` (`lock`, `apply_content`, `commit`, `show`, `mirror`, `edit`)
- Modify: `services/mail/draft_views.py` (`MailDraftView.patch`)
- Test: `services/mail/tests/test_draft_edit.py`

**Interfaces:**
- Consumes: Task 6's `clean`, `enqueue`, `record_ids`, `RELATED`, `payload`, `readable`, `lock_rows`, `refusal`, the sentences; `actions.lock_connection`; `customers.models.ReplyDraft`.
- Produces (in `services/mail/drafts.py`):
  - `lock(user, pk) -> MailDraft` (§3's lock order; Http404; not `discarded`);
  - `apply_content(draft, valid, *, user) -> set[str]` (changed names; `RECORD_FIELDS` for a record change; `"attachments"` is added by Task 9's callers);
  - `commit(draft, changed, *, now, mirror_back=True) -> bool`;
  - `show(draft, *, now)` (the Drafts row's content); `mirror(draft, *, now)` (a linked `ReplyDraft`'s `subject`, `body` and `to`);
  - `edit(draft, data, *, user, now) -> Response | None` (PATCH's rules on a locked draft; raises DRF `ValidationError` for 400s);
  - `PATCH /api/v1/mail/drafts/<id>/`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_draft_edit.py`:

```python
"""PATCH mail/drafts/<id>/ (D3 contract §3, decisions 8, 25, 31): partial
content plus the revision it was edited from; a stale revision is 409
DRAFT_CHANGED with the newest draft; one pending draft row (a pending
create needs nothing, a pending update is made due again, a create in
flight gets a waiting update); the Drafts row changes at once; a record
change is saved without a revision; the record follows the suggestion
until chosen; a linked ReplyDraft follows; a PATCH that changes nothing
queues nothing."""

from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation
from services.customers.models import ReplyDraft
from services.mail.models import MailboxConnection, MailDraft, MailMessage, MailOutbox

from .draft_fixtures import URL, DraftFixture


class EditTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.draft = self.new_draft()
        self.pk = self.draft["id"]

    def rows(self):
        return list(
            MailOutbox.objects.filter(draft_id=self.pk).order_by("pk").values_list("op", "status")
        )

    def in_gmail(self):
        MailOutbox.objects.filter(draft_id=self.pk).update(status="sent")
        MailDraft.objects.filter(pk=self.pk).update(gmail_draft_id="r-9", gmail_state="saved")

    def test_an_edit_shows_at_once_and_bumps_the_revision(self):
        response = self.patch_draft(
            self.pk, {"subject": "Re: Terms", "html": "<p>Two years.</p>", "revision": 1}
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["revision"], response.data["gmail"]), (2, {"state": "saving"})
        )
        self.assertEqual(
            (response.data["subject"], response.data["text"]), ("Re: Terms", "Two years.")
        )
        row = MailMessage.objects.get(pk=self.draft["message_id"])
        self.assertEqual(
            (row.subject, row.snippet, row.body, row.html_body),
            ("Re: Terms", "Two years.", "Two years.", "<p>Two years.</p>"),
        )
        # The pending create builds from the content at flush time: nothing more.
        self.assertEqual(self.rows(), [("draft_create", "pending")])

    def test_once_gmail_has_it_an_edit_is_one_update_made_due_again(self):
        self.in_gmail()
        self.patch_draft(self.pk, {"subject": "One", "revision": 1})
        first = MailOutbox.objects.get(draft_id=self.pk, status="pending")
        self.patch_draft(self.pk, {"subject": "Two", "revision": 2})
        second = MailOutbox.objects.get(draft_id=self.pk, status="pending")
        self.assertEqual((first.pk, first.op), (second.pk, "draft_update"))
        self.assertNotEqual(first.action_id, second.action_id)

    def test_an_edit_while_the_create_is_in_flight_waits_as_an_update(self):
        MailOutbox.objects.filter(draft_id=self.pk).update(status="sending")
        self.patch_draft(self.pk, {"subject": "Later", "revision": 1})
        self.assertEqual(self.rows(), [("draft_create", "sending"), ("draft_update", "pending")])

    def test_a_stale_revision_is_refused_with_the_newest_draft(self):
        MailDraft.objects.filter(pk=self.pk).update(revision=5, subject="Changed in Gmail")
        response = self.patch_draft(self.pk, {"subject": "Mine", "revision": 1})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            (response.data["code"], response.data["detail"]),
            ("DRAFT_CHANGED", "This draft changed in Gmail. Here is the newest version."),
        )
        self.assertEqual(
            (response.data["draft"]["revision"], response.data["draft"]["subject"]),
            (5, "Changed in Gmail"),
        )
        self.assertEqual(self.stored(self.pk).subject, "Changed in Gmail")

    def test_the_revision_is_required(self):
        response = self.patch_draft(self.pk, {"subject": "Mine"})
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"revision": ["Send the revision you edited."]}),
        )

    def test_nothing_changed_queues_nothing(self):
        self.in_gmail()
        response = self.patch_draft(self.pk, {"subject": self.draft["subject"], "revision": 1})
        self.assertEqual((response.status_code, response.data["revision"]), (200, 1))
        self.assertEqual(self.rows(), [("draft_create", "sent")])

    def test_a_record_change_alone_is_not_sent_to_gmail(self):
        self.in_gmail()
        response = self.patch_draft(self.pk, {"record": None, "revision": 1})
        self.assertEqual(
            (response.data["record"], response.data["record_chosen"], response.data["revision"]),
            (None, True, 1),
        )
        self.assertEqual(self.rows(), [("draft_create", "sent")])

    def test_sent_and_sending_drafts_are_refused(self):
        for state in ("sending", "sent"):
            MailDraft.objects.filter(pk=self.pk).update(status=state)
            response = self.patch_draft(self.pk, {"subject": "x", "revision": 1})
            self.assertEqual(
                (response.status_code, response.data),
                (409, {"code": "ALREADY_SENT", "detail": "This draft has been sent."}),
            )

    def test_only_the_owner_and_never_a_discarded_draft(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.patch_draft(self.pk, {"revision": 1}).status_code, 404)
        self.client.force_authenticate(self.dana)
        MailDraft.objects.filter(pk=self.pk).update(status="discarded")
        self.assertEqual(self.patch_draft(self.pk, {"revision": 1}).status_code, 404)

    def test_the_connection_checks_and_a_pause(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(
            self.patch_draft(self.pk, {"subject": "a", "revision": 1}).status_code, 200
        )
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(granted_scopes=[])
        response = self.patch_draft(self.pk, {"subject": "b", "revision": 2})
        self.assertEqual((response.status_code, response.data["code"]), (409, "TWO_WAY_OFF"))
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        response = self.patch_draft(self.pk, {"subject": "b", "revision": 2})
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))

    def test_a_patch_stays_within_its_ceiling(self):
        self.in_gmail()
        self.patch_draft(self.pk, {"subject": "warm", "revision": 1})
        with CaptureQueriesContext(db) as queries:
            self.patch_draft(
                self.pk,
                {"to": [f"p{n}@pizzahut.com" for n in range(20)], "subject": "x", "revision": 2},
            )
        self.assertLessEqual(len(queries), 18)


class RecordTests(DraftFixture):
    def test_a_new_message_follows_the_suggestion_until_the_person_chooses(self):
        draft = self.post_draft({"kind": "new"}).data
        self.assertIsNone(draft["record"])
        moved = self.patch_draft(draft["id"], {"to": ["x@pizzahut.com"], "revision": 1}).data
        self.assertEqual(moved["record"]["id"], self.pizza.pk)
        chosen = self.patch_draft(
            draft["id"], {"record": {"kind": "account", "id": self.apac.pk}, "revision": 2}
        ).data
        self.assertEqual((chosen["record"]["kind"], chosen["record_chosen"]), ("account", True))
        kept = self.patch_draft(draft["id"], {"to": ["y@else.io"], "revision": 2}).data
        self.assertEqual(kept["record"]["id"], self.apac.pk)

    def test_a_reply_keeps_its_sources_record(self):
        draft = self.new_draft()
        moved = self.patch_draft(draft["id"], {"to": ["y@else.io"], "revision": 1}).data
        self.assertEqual(moved["record"]["id"], self.pizza.pk)


class LinkedTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.draft = self.new_draft()
        self.reply = ReplyDraft.objects.create(
            organisation=self.org,
            owner=self.dana,
            channel="email",
            customer=self.pizza,
            email=self.filed,
            to=[["Ann Lee", "ann@pizzahut.com"]],
            subject="Re: Renewal quote",
            body="Hi Ann",
            written_body="Hi Ann",
            agent="cs",
        )
        MailDraft.objects.filter(pk=self.draft["id"]).update(reply_draft=self.reply)

    def test_recipients_subject_and_text_follow_to_the_agent_draft(self):
        response = self.patch_draft(
            self.draft["id"],
            {
                "to": [["Ann Lee", "ann@pizzahut.com"], "ops@pizzahut.com"],
                "cc": ["sam@pizzahut.com"],
                "subject": "Re: Terms",
                "html": "<p>Two years it is.</p>",
                "revision": 1,
            },
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            (response.data["agent"], response.data["reply_draft_id"]), ("cs", self.reply.pk)
        )
        self.reply.refresh_from_db()
        self.assertEqual(
            (self.reply.to, self.reply.subject, self.reply.body),
            (
                [["Ann Lee", "ann@pizzahut.com"], ["", "ops@pizzahut.com"]],
                "Re: Terms",
                "Two years it is.",
            ),
        )

    def test_an_agent_draft_stays_on_its_record(self):
        response = self.patch_draft(self.draft["id"], {"record": None, "revision": 1})
        self.assertEqual(response.data, {"record": ["An agent draft stays on its record."]})
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_edit --parallel auto --noinput`
Expected: FAIL, `405 Method Not Allowed` for every PATCH.

- [ ] **Step 3: Write the edit**

In `services/mail/drafts.py`, add to the imports `from django.db.models import Exists, OuterRef, Q, Value` (replacing the single `Q` import), `from services.customers.models import ReplyDraft`, and add `lock_connection` to the `.actions` import. Then add:

```python
def lock(user, pk):
    """The caller's draft (not discarded), locked in §3's order: the linked
    ReplyDraft, the draft, then its message and source. Http404 for anyone
    else's draft, however senior."""
    # SOC2:AUTH-02 a draft is its owner's alone
    mine = MailDraft.objects.filter(owner=user).exclude(status=Status.DISCARDED)
    found = mine.filter(pk=pk).values("reply_draft_id").first()
    if found is None:
        raise Http404
    if found["reply_draft_id"] is not None:
        list(
            ReplyDraft.objects.select_for_update()
            .filter(pk=found["reply_draft_id"])
            .values_list("pk", flat=True)
        )
    draft = mine.select_for_update(of=("self",)).select_related(*RELATED).filter(pk=pk).first()
    if draft is None:
        raise Http404
    lock_rows([draft.message_id, draft.source_id])
    return draft


def apply_content(draft, valid, *, user):
    """Set clean()'s fields on `draft`, unsaved; the names that changed. A
    new message's or forward's record follows the suggestion as recipients
    change, until the person chose one (decision 25, plan gap 3)."""
    changed = set()
    for field in ("to", "cc", "bcc", "subject", "forwarded"):
        if field in valid and getattr(draft, field) != valid[field]:
            setattr(draft, field, valid[field])
            changed.add(field)
    if "html" in valid and valid["html"] != draft.html:
        draft.html = valid["html"]
        draft.text = html.to_text(valid["html"])
        changed |= {"html", "text"}
    if "record" in valid:
        ids = record_ids(valid["record"])
        if ids != (draft.customer_id, draft.account_id) or not draft.record_chosen:
            draft.customer_id, draft.account_id = ids
            draft.record_chosen = True
            changed |= RECORD_FIELDS
    elif (
        changed & {"to", "cc"}
        and not draft.record_chosen
        and draft.reply_draft_id is None
        and draft.kind in (Kind.NEW, Kind.FORWARD)
    ):
        [suggested] = compose.visible(
            user, compose.suggest(draft.connection, [*draft.to, *draft.cc])
        )
        ids = record_ids(suggested)
        if ids != (draft.customer_id, draft.account_id):
            draft.customer_id, draft.account_id = ids
            changed |= {"customer", "account"}
    return changed


def show(draft, *, now):
    """The Drafts row shows the content at once (§3 "Enqueueing")."""
    if draft.message_id is None:
        return
    files = MailAttachment.objects.filter(message_id=OuterRef("pk"), is_inline=False)
    MailMessage.objects.filter(pk=draft.message_id).update(
        to=draft.to,
        cc=draft.cc,
        bcc=draft.bcc,
        subject=draft.subject,
        snippet=" ".join(draft.text.split())[:300],
        body=draft.text,
        html_body=draft.html,
        sent_at=now,
        has_attachments=Value(True) if draft.forwarded else Exists(files),
    )


def mirror(draft, *, now):
    """A linked agent draft is the same message (decisions 3, 31): its
    subject, body (the text, at most 20,000 characters) and to follow."""
    if draft.reply_draft_id is None:
        return
    ReplyDraft.objects.filter(pk=draft.reply_draft_id).update(
        subject=draft.subject[:255], body=draft.text[:20_000], to=draft.to, updated_at=now
    )


def commit(draft, changed, *, now, mirror_back=True):
    """Save apply_content's `changed`. A content change (anything but the
    record) also bumps the revision, queues it for Gmail, shows it in Drafts
    and mirrors a linked ReplyDraft. Returns whether anything changed; a
    write that changes nothing queues nothing (§3 PATCH)."""
    if not changed:
        return False
    fields = set(changed) - {ATTACHMENTS}
    content = set(changed) - RECORD_FIELDS
    if content:
        draft.revision += 1
        enqueue(draft, now=now)
        fields |= {"revision", "gmail_state"}
    draft.save(update_fields=sorted(fields | {"updated_at"}))
    if content:
        show(draft, now=now)
        if mirror_back:
            mirror(draft, now=now)
    return True


def edit(draft, data, *, user, now):
    """PATCH's rules on a locked draft (§3), shared by the send's step 3: 409
    ALREADY_SENT, the content's 400s, the revision, 409 DRAFT_CHANGED, the
    connection checks 1-3 on the locked mailbox row, then the change.
    Returns the refusing answer, or None."""
    if draft.status != Status.OPEN:
        return error("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
    valid = clean(
        data,
        user=user,
        kind=draft.kind,
        source_id=draft.source_id,
        base={"to": draft.to, "cc": draft.cc, "bcc": draft.bcc},
        linked=draft.reply_draft_id is not None,
    )
    revision = data.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool):
        raise ValidationError({"revision": [SEND_REVISION]})
    if revision != draft.revision:
        return error(
            "DRAFT_CHANGED", DRAFT_CHANGED, status.HTTP_409_CONFLICT, draft=payload(draft, user)
        )
    refused = refusal(lock_connection(draft.connection))
    if refused is not None:
        return refused
    commit(draft, apply_content(draft, valid, user=user), now=now)
    return None
```

- [ ] **Step 4: The route**

In `services/mail/draft_views.py` `MailDraftView`, add:

```python
    def patch(self, request, pk):
        """Partial content plus `revision` (§3). 200 with the draft."""
        data = request.data if isinstance(request.data, dict) else {}
        with transaction.atomic():
            draft = drafts.lock(request.user, pk)
            refused = drafts.edit(draft, data, user=request.user, now=timezone.now())
            if refused is not None:
                return refused
        return Response(drafts.payload(drafts.readable(request.user, pk), request.user))
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/drafts.py services/mail/draft_views.py services/mail/tests/test_draft_edit.py
venv/bin/ruff check --fix services/mail/drafts.py services/mail/draft_views.py services/mail/tests/test_draft_edit.py
git add services/mail/drafts.py services/mail/draft_views.py services/mail/tests/test_draft_edit.py
git commit -m "$(cat <<'EOF'
feat(mail): edit gmail drafts with a revision

PATCH mail/drafts/<id>/ applies partial content edited from a revision; a
stale one answers 409 DRAFT_CHANGED with the newest draft, so an open editor
never overwrites a Gmail edit. One pending draft row per draft; the Drafts
row and a linked agent draft follow at once; the record follows the
suggestion until chosen.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 8: Discard, one draft or many

**Files:**
- Modify: `services/mail/drafts.py` (`lock_many`, `discard_refusal`, `discard`)
- Modify: `services/mail/draft_views.py` (`MailDraftView.delete`, `MailDraftDiscardView`)
- Modify: `services/mail/urls.py`
- Test: `services/mail/tests/test_draft_discard.py`

**Interfaces:**
- Consumes: Task 7's `lock`, `RELATED`, `lock_rows`; Task 6's sentences; `outbox.wake`; `actions.lock_connection`; `core.audit`.
- Produces (in `services/mail/drafts.py`):
  - `lock_many(user, ids) -> list[MailDraft]` (the caller's **open** drafts among `ids`, locked in §3's order);
  - `discard_refusal(found) -> Response | None` (409 ALREADY_SENT, 400 GMAIL_ONLY, 409 NO_MAILBOX only for a draft Gmail holds);
  - `discard(found, *, request, now, reply_drafts=True)` (decision 11; a fixed number of queries whatever `len(found)`, plus one audit row per linked draft; with `reply_drafts=False` a linked `ReplyDraft` is only unlinked, for the Communications DELETE (Task 13));
  - `DELETE /api/v1/mail/drafts/<id>/` (204), `POST /api/v1/mail/drafts/discard/` (`mail-drafts-discard`, 200 `{"discarded": n}`).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_draft_discard.py`:

```python
"""Discarding a draft (D3 contract §3, decisions 11, 12): the Drafts row goes
at once and nothing else is touched; a draft Gmail never had goes with its
pending create, and nothing reaches Gmail; one Gmail holds, or whose create
is in flight, leaves one draft_delete (pending updates collapse into it); a
linked ReplyDraft is deleted and audited; bulk is all or nothing; the query
count does not grow with the number of drafts."""

from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.customers.models import ReplyDraft
from services.mail.models import MailboxConnection, MailDraft, MailMessage, MailOutbox

from .draft_fixtures import URL, DraftFixture


class DiscardFixture(DraftFixture):
    def delete(self, pk):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.delete(f"{URL}drafts/{pk}/")

    def bulk(self, ids):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f"{URL}drafts/discard/", {"ids": ids}, format="json")

    def in_gmail(self, pk, gmail_id):
        MailOutbox.objects.filter(draft_id=pk).update(status="sent")
        MailDraft.objects.filter(pk=pk).update(gmail_draft_id=gmail_id, gmail_state="saved")


class DiscardTests(DiscardFixture):
    def test_a_draft_gmail_never_had_goes_with_nothing_sent(self):
        draft = self.new_draft()
        self.assertEqual(self.delete(draft["id"]).status_code, 204)
        self.assertFalse(MailDraft.objects.exists())
        self.assertFalse(MailOutbox.objects.exists())
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        self.assertTrue(MailMessage.objects.filter(pk=self.quote.pk).exists())

    def test_a_draft_gmail_holds_leaves_one_delete_with_its_id(self):
        draft = self.new_draft()
        self.in_gmail(draft["id"], "r-7")
        self.patch_draft(draft["id"], {"subject": "x", "revision": 1})
        self.assertEqual(self.delete(draft["id"]).status_code, 204)
        stored = self.stored(draft["id"])
        self.assertEqual((stored.status, stored.message_id), ("discarded", None))
        self.assertEqual(
            list(MailOutbox.objects.filter(status="pending").values_list("op", "payload")),
            [("draft_delete", {"gmail_draft_id": "r-7"})],
        )
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        self.assertEqual(self.client.get(f"{URL}drafts/{draft['id']}/").status_code, 404)
        self.mailbox.refresh_from_db()
        self.assertIsNotNone(self.mailbox.wake_at)

    def test_a_create_in_flight_leaves_a_delete_that_waits_for_its_id(self):
        draft = self.new_draft()
        MailOutbox.objects.filter(draft_id=draft["id"]).update(status="sending")
        self.delete(draft["id"])
        self.assertEqual(self.stored(draft["id"]).status, "discarded")
        self.assertEqual(
            list(MailOutbox.objects.filter(status="pending").values_list("op", "payload")),
            [("draft_delete", {})],
        )

    def test_a_linked_agent_draft_goes_too_audited(self):
        draft = self.new_draft()
        reply = ReplyDraft.objects.create(
            organisation=self.org,
            owner=self.dana,
            channel="email",
            customer=self.pizza,
            email=self.filed,
            to=[["Ann Lee", "ann@pizzahut.com"]],
            subject="Re: Renewal quote",
            body="Hi Ann",
            written_body="Hi Ann",
            agent="cs",
        )
        MailDraft.objects.filter(pk=draft["id"]).update(reply_draft=reply)
        self.in_gmail(draft["id"], "r-8")
        self.delete(draft["id"])
        self.assertFalse(ReplyDraft.objects.exists())
        self.assertEqual(self.stored(draft["id"]).reply_draft_id, None)
        event = AuditEvent.objects.get(action="reply_draft.discarded")
        self.assertEqual((event.actor, event.target_id), (self.dana, str(reply.pk)))

    def test_the_refusals(self):
        draft = self.new_draft()
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.delete(draft["id"]).status_code, 404)
        self.client.force_authenticate(self.dana)
        MailDraft.objects.filter(pk=draft["id"]).update(status="sending")
        response = self.delete(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))

    def test_disconnected_refuses_only_a_draft_gmail_holds_and_paused_waits(self):
        local, held = self.new_draft(), self.new_draft(kind="new")
        self.in_gmail(held["id"], "r-9")
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        response = self.delete(held["id"])
        self.assertEqual((response.status_code, response.data["code"]), (409, "NO_MAILBOX"))
        self.assertEqual(self.delete(local["id"]).status_code, 204)


class BulkTests(DiscardFixture):
    def test_all_or_nothing(self):
        mine = [self.new_draft()["id"] for _ in range(2)]
        response = self.bulk([*mine, 999_999])
        self.assertEqual(response.status_code, 404)
        self.assertEqual(MailDraft.objects.filter(status="open").count(), 2)
        response = self.bulk(mine)
        self.assertEqual((response.status_code, response.data), (200, {"discarded": 2}))
        self.assertFalse(MailDraft.objects.exists())

    def test_someone_elses_or_a_sent_draft_fails_the_whole_request(self):
        mine = self.new_draft()["id"]
        sent = self.new_draft()["id"]
        MailDraft.objects.filter(pk=sent).update(status="sent")
        self.assertEqual(self.bulk([mine, sent]).status_code, 404)
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.bulk([mine]).status_code, 404)

    def test_the_body(self):
        self.assertEqual(self.bulk([]).status_code, 400)
        self.assertEqual(self.bulk(list(range(1, 102))).status_code, 400)

    def test_the_cost_does_not_grow_with_the_drafts(self):
        one = [self.new_draft()["id"]]
        three = [self.new_draft()["id"] for _ in range(3)]
        for pk in [*one, *three]:
            self.in_gmail(pk, f"r-{pk}")
        with CaptureQueriesContext(db) as single:
            self.bulk(one)
        with CaptureQueriesContext(db) as several:
            self.bulk(three)
        self.assertEqual(len(single), len(several))
        self.assertLessEqual(len(several), 20)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_discard --parallel auto --noinput`
Expected: FAIL, 405 on DELETE and 404 on `drafts/discard/`.

- [ ] **Step 3: Write the discard**

In `services/mail/drafts.py`, add `from core import audit` to the imports, then:

```python
def lock_many(user, ids):
    """The caller's open drafts among `ids`, locked in §3's order (their
    ReplyDrafts, the drafts, their messages and sources)."""
    # SOC2:AUTH-02 only the caller's own open drafts
    mine = MailDraft.objects.filter(owner=user, status=Status.OPEN, pk__in=list(ids))
    linked = [pk for pk in mine.values_list("reply_draft_id", flat=True) if pk is not None]
    if linked:
        list(
            ReplyDraft.objects.select_for_update()
            .filter(pk__in=linked)
            .order_by("pk")
            .values_list("pk", flat=True)
        )
    found = list(mine.select_for_update(of=("self",)).select_related(*RELATED).order_by("pk"))
    lock_rows([pk for draft in found for pk in (draft.message_id, draft.source_id)])
    return found


def _creating(found):
    """The ids among `found` whose draft_create is in flight."""
    return set(
        MailOutbox.objects.filter(
            draft_id__in=[draft.pk for draft in found],
            op=Op.DRAFT_CREATE,
            status=MailOutbox.Status.SENDING,
        ).values_list("draft_id", flat=True)
    )


def discard_refusal(found):
    """§3 DELETE's refusals after the 404: 409 ALREADY_SENT; 400 GMAIL_ONLY;
    409 NO_MAILBOX only when a disconnected mailbox's Gmail holds one of
    them (a local-only draft is discarded anyway). Paused may discard."""
    if any(draft.status != Status.OPEN for draft in found):
        return error("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
    connection = lock_connection(found[0].connection)
    if not connection.is_google:
        return error("GMAIL_ONLY", GMAIL_ONLY, status.HTTP_400_BAD_REQUEST)
    if connection.status == DISCONNECTED and (
        any(draft.gmail_draft_id for draft in found) or _creating(found)
    ):
        return error("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
    return None


def discard(found, *, request, now, reply_drafts=True):
    """Decision 11 for locked open drafts of one mailbox: each is discarded
    and its Drafts row deleted at once; pending rows go (a pending create
    never reached Gmail, pending updates collapse); a draft Gmail never had
    is deleted now, and one Gmail holds (or whose create is in flight) gets
    one draft_delete. A linked ReplyDraft is unlinked first, so deleting it
    never takes a draft still owed a Gmail delete; with `reply_drafts` it is
    deleted here, audited reply_draft.discarded."""
    ids = [draft.pk for draft in found]
    creating = _creating(found)
    in_gmail = [draft for draft in found if draft.gmail_draft_id or draft.pk in creating]
    held = {draft.pk for draft in in_gmail}
    linked = [draft.reply_draft for draft in found if draft.reply_draft_id is not None]
    if reply_drafts:
        for reply in linked:
            audit.record("reply_draft.discarded", request=request, target=reply)  # SOC2:LOG-01
    MailDraft.objects.filter(pk__in=ids).update(
        status=Status.DISCARDED, message=None, reply_draft=None, updated_at=now
    )
    MailMessage.objects.filter(pk__in=[d.message_id for d in found if d.message_id]).delete()
    if reply_drafts and linked:
        ReplyDraft.objects.filter(pk__in=[reply.pk for reply in linked]).delete()
    MailOutbox.objects.filter(draft_id__in=ids, status=MailOutbox.Status.PENDING).delete()
    MailDraft.objects.filter(pk__in=[pk for pk in ids if pk not in held]).delete()
    if in_gmail:
        action_id = uuid.uuid4()
        MailOutbox.objects.bulk_create(
            [
                MailOutbox(
                    connection_id=draft.connection_id,
                    action_id=action_id,
                    op=Op.DRAFT_DELETE,
                    draft_id=draft.pk,
                    payload={"gmail_draft_id": draft.gmail_draft_id}
                    if draft.gmail_draft_id
                    else {},
                    next_attempt_at=now,
                )
                for draft in in_gmail
            ]
        )
        connection_id = in_gmail[0].connection_id
        transaction.on_commit(lambda: outbox.wake(connection_id))
```

- [ ] **Step 4: The routes**

In `services/mail/draft_views.py`, add `from rest_framework import serializers` to the imports (beside `status`), add to `MailDraftView`:

```python
    def delete(self, request, pk):
        """Discard (decision 12): the draft only, never the conversation. 204."""
        with transaction.atomic():
            draft = drafts.lock(request.user, pk)
            refused = drafts.discard_refusal([draft])
            if refused is not None:
                return refused
            drafts.discard([draft], request=request, now=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)
```

and add:

```python
class DiscardSerializer(serializers.Serializer):
    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), min_length=1, max_length=100
    )


class MailDraftDiscardView(APIView):
    """POST /api/v1/mail/drafts/discard/ {ids} — the Drafts folder's bulk
    Delete (§3). All or nothing: an id that is not the caller's open draft
    answers 404 for the whole request, naming none."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DiscardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = set(serializer.validated_data["ids"])
        with transaction.atomic():
            found = drafts.lock_many(request.user, ids)
            # SOC2:AUTH-02 every id must be the caller's own open draft
            if {draft.pk for draft in found} != ids:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            refused = drafts.discard_refusal(found)
            if refused is not None:
                return refused
            drafts.discard(found, request=request, now=timezone.now())
        return Response({"discarded": len(found)})
```

In `services/mail/urls.py`, add **before** the `mail-draft` route (so `discard/` is not read as an id; `<int:pk>` would not match it anyway, but keep the literal first):

```python
(
    path(
        "mail/drafts/discard/",
        draft_views.MailDraftDiscardView.as_view(),
        name="mail-drafts-discard",
    ),
)
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK. If `test_the_cost_does_not_grow_with_the_drafts` exceeds 20, print the captured SQL: the deletion of the Drafts rows cascades to their attachments (fetched for the file receiver), their outbox rows and two `SET_NULL`s from `MailDraft`; anything per draft beyond that is an N+1 to remove.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/drafts.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_draft_discard.py
venv/bin/ruff check --fix services/mail/drafts.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_draft_discard.py
git add services/mail/drafts.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_draft_discard.py
git commit -m "$(cat <<'EOF'
feat(mail): discard gmail drafts, one or many

Delete in Drafts discards only the draft: its row leaves Drafts at once, a
draft Gmail never had sends nothing, and one Gmail holds leaves a single
draft_delete. A linked agent draft is deleted and audited. Bulk is all or
nothing, at a cost that does not grow with the drafts.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 9: A draft's attachments: upload and remove

**Files:**
- Modify: `services/mail/drafts.py` (`add_upload`, `remove_part`)
- Modify: `services/mail/draft_views.py` (`MailDraftAttachmentsView`, `MailDraftAttachmentView`)
- Modify: `services/mail/urls.py`
- Test: `services/mail/tests/test_draft_attachments.py`

**Interfaces:**
- Consumes: `customers.files.validate_upload`, `InvalidUpload`; D2's `mail_attachment_path` (via `MailAttachment.file`) and the file receiver; Task 7's `lock`, `commit`, `ATTACHMENTS`, `refusal`; Task 6's `total_bytes`, `compose.attachment_row`; `core.throttling.MailDraftUploadThrottle`.
- Produces:
  - `drafts.add_upload(draft, uploaded, *, now) -> (MailAttachment | None, Response | None)`;
  - `drafts.remove_part(draft, attachment_id, *, now)` (Http404 for a part not on the draft);
  - `POST /api/v1/mail/drafts/<id>/attachments/` (multipart, field `file`; `mail-draft-attachments`), `DELETE /api/v1/mail/drafts/<id>/attachments/<attachment_id>/` (`mail-draft-attachment`).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_draft_attachments.py`:

```python
"""Files on a draft (D3 contract §3 "Attachments", decisions 20, 21):
checked by the Files tab's validate_upload (type list, magic bytes, the
per-file limit, a safe name); at most 25 a draft; the decoded total within
MAIL_SEND_MAX_BYTES (413 DRAFT_TOO_LARGE); stored cached as an upload part
of the draft's row and queued like any edit; removing an upload deletes it
and its file, removing a forwarded file only leaves it out; owner-only."""

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from services.mail.models import MailAttachment, MailDraft, MailOutbox

from .draft_fixtures import URL, DraftFixture

PDF = b"%PDF-1.4 quote v2"


def upload(name="Quote v2.pdf", data=PDF, content_type="application/pdf"):
    return SimpleUploadedFile(name, data, content_type=content_type)


class UploadTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.draft = self.new_draft()
        self.url = f"{URL}drafts/{self.draft['id']}/attachments/"

    def post(self, file=None):
        body = {} if file is None else {"file": file}
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(self.url, body, format="multipart")

    def test_a_file_is_stored_cached_on_the_drafts_row_and_queued(self):
        MailOutbox.objects.update(status="sent")
        response = self.post(upload())
        self.assertEqual(response.status_code, 201, response.data)
        part = MailAttachment.objects.get(pk=response.data["attachment"]["id"])
        self.assertEqual(
            response.data["attachment"],
            {
                "id": part.pk,
                "filename": "Quote v2.pdf",
                "mime_type": "application/pdf",
                "size": len(PDF),
                "origin": "upload",
                "download_url": f"/api/v1/mail/attachments/{part.pk}/download/",
            },
        )
        self.assertEqual(response.data["revision"], 2)
        self.assertTrue(part.part_id.startswith("upload:"))
        self.assertEqual((part.message_id, part.is_inline), (self.draft["message_id"], False))
        self.assertIsNotNone(part.fetched_at)
        with part.file.open("rb") as handle:
            self.assertEqual(handle.read(), PDF)
        self.assertTrue(part.message.has_attachments)
        read = self.client.get(f"{URL}drafts/{self.draft['id']}/").data
        self.assertEqual(response.data["total_bytes"], read["total_bytes"])
        self.assertEqual(MailOutbox.objects.filter(status="pending").count(), 1)
        downloaded = self.client.get(f"{URL}attachments/{part.pk}/download/")
        self.assertEqual(downloaded.status_code, 200)

    def test_the_file_checks(self):
        response = self.post()
        self.assertEqual((response.status_code, response.data), (400, {"file": ["Choose a file."]}))
        response = self.post(upload("tool.zip", b"PK\x03\x04", "application/zip"))
        self.assertEqual(response.data, {"file": [".zip is not an accepted file type."]})
        response = self.post(upload("fake.pdf", b"<html>", "application/pdf"))
        self.assertEqual(response.data, {"file": ["That does not look like a .pdf file."]})

    @override_settings(MAIL_DRAFT_MAX_ATTACHMENTS=1)
    def test_at_most_so_many_files(self):
        self.assertEqual(self.post(upload()).status_code, 201)
        response = self.post(upload("b.pdf"))
        self.assertEqual(
            (response.status_code, response.data),
            (400, {"code": "TOO_MANY_ATTACHMENTS", "detail": "A message can carry 25 files."}),
        )

    @override_settings(MAIL_SEND_MAX_BYTES=2000)
    def test_the_total_stays_within_the_limit(self):
        response = self.post(upload(data=PDF + b"0" * 2000))
        self.assertEqual(
            (response.status_code, response.data),
            (
                413,
                {"code": "DRAFT_TOO_LARGE", "detail": "Attachments are limited to 25 MB in total."},
            ),
        )
        self.assertFalse(MailAttachment.objects.filter(part_id__startswith="upload:").exists())

    def test_someone_elses_or_a_sent_draft(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.post(upload()).status_code, 404)
        self.client.force_authenticate(self.dana)
        MailDraft.objects.filter(pk=self.draft["id"]).update(status="sent")
        response = self.post(upload())
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))


class RemoveTests(DraftFixture):
    def test_an_upload_goes_with_its_file_and_a_forwarded_file_is_only_left_out(self):
        draft = self.post_draft({"kind": "forward", "source_message_id": self.quote.pk}).data
        url = f"{URL}drafts/{draft['id']}/attachments/"
        with self.captureOnCommitCallbacks(execute=True):
            added = self.client.post(url, {"file": upload()}, format="multipart").data
        part = MailAttachment.objects.get(pk=added["attachment"]["id"])
        storage, name = part.file.storage, part.file.name
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(f"{url}{part.pk}/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(set(response.data), {"revision", "total_bytes"})
        self.assertFalse(MailAttachment.objects.filter(pk=part.pk).exists())
        self.assertFalse(storage.exists(name))
        [forwarded] = draft["attachments"]
        response = self.client.delete(f"{url}{forwarded['id']}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.stored(draft["id"]).forwarded, [])
        self.assertTrue(MailAttachment.objects.filter(pk=forwarded["id"]).exists())
        self.assertEqual(self.client.delete(f"{url}{forwarded['id']}/").status_code, 404)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_attachments --parallel auto --noinput`
Expected: FAIL, 404 (no route).

- [ ] **Step 3: Write the upload and the removal**

In `services/mail/drafts.py`, add `from services.customers.files import InvalidUpload, validate_upload` to the imports, then:

```python
TOO_MANY_FILES = "A message can carry 25 files."
TOO_LARGE_DRAFT = "Attachments are limited to 25 MB in total."
CHOOSE_FILE = "Choose a file."


def add_upload(draft, uploaded, *, now):
    """§3 "POST .../attachments/" on a locked open draft whose connection
    passed the checks: validate_upload's rules (SOC2:API-10), at most
    MAIL_DRAFT_MAX_ATTACHMENTS, the total within MAIL_SEND_MAX_BYTES; then
    the file is stored cached on the draft's row and the change queued.
    Returns (the part, None) or (None, the refusing answer)."""
    if uploaded is None:
        return None, Response({"file": [CHOOSE_FILE]}, status=status.HTTP_400_BAD_REQUEST)
    try:
        # SOC2:API-10 the Files tab's closed list, magic bytes and size cap
        name, _, content_type = validate_upload(uploaded)
    except InvalidUpload as exc:
        return None, Response({"file": [str(exc)]}, status=status.HTTP_400_BAD_REQUEST)
    parts = attachments_of(draft)
    own = [part for part in parts if _own(draft, part)]
    if len(own) + len(draft.forwarded) >= settings.MAIL_DRAFT_MAX_ATTACHMENTS:
        return None, error("TOO_MANY_ATTACHMENTS", TOO_MANY_FILES, status.HTTP_400_BAD_REQUEST)
    if total_of(draft, parts) + uploaded.size > settings.MAIL_SEND_MAX_BYTES:
        return None, error(
            "DRAFT_TOO_LARGE", TOO_LARGE_DRAFT, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        )
    part = MailAttachment(
        message=draft.message,
        part_id=f"{UPLOAD_PREFIX}{uuid.uuid4().hex}",
        filename=name,
        mime_type=content_type,
        size=uploaded.size,
        is_inline=False,
        fetched_at=now,
    )
    part.file.save(name, uploaded, save=False)
    part.save()
    commit(draft, {ATTACHMENTS}, now=now)
    return part, None


def remove_part(draft, attachment_id, *, now):
    """§3 "DELETE .../attachments/<id>/": an upload or Gmail part of the
    draft's row is deleted (its file on commit); a forwarded file is only
    left out of `forwarded`. Http404 for a part not on this draft."""
    if attachment_id in draft.forwarded:
        draft.forwarded = [pk for pk in draft.forwarded if pk != attachment_id]
        commit(draft, {"forwarded"}, now=now)
        return
    part = MailAttachment.objects.filter(pk=attachment_id, message_id=draft.message_id).first()
    if part is None or draft.message_id is None:
        raise Http404
    part.delete()
    commit(draft, {ATTACHMENTS}, now=now)
```

Add `from rest_framework.response import Response` to the imports of `drafts.py`.

- [ ] **Step 4: The routes**

In `services/mail/draft_views.py`, add `from rest_framework.parsers import MultiPartParser` and `from core.throttling import MailDraftUploadThrottle` to the imports, then:

```python
def _locked_open(request, pk):
    """The caller's draft, locked, open, its mailbox passing the checks 1-3:
    (draft, None) or (None, the refusing answer). In a transaction."""
    draft = drafts.lock(request.user, pk)
    if draft.status != MailDraft.Status.OPEN:
        return None, drafts.error("ALREADY_SENT", drafts.ALREADY_SENT, status.HTTP_409_CONFLICT)
    refused = drafts.refusal(lock_connection(draft.connection))
    return (None, refused) if refused is not None else (draft, None)


class MailDraftAttachmentsView(APIView):
    """POST /api/v1/mail/drafts/<id>/attachments/ (multipart `file`) — a file
    on the draft (§3). No revision: adding a file never conflicts."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [MailDraftUploadThrottle]
    parser_classes = [MultiPartParser]

    def post(self, request, pk):
        now = timezone.now()
        with transaction.atomic():
            draft, refused = _locked_open(request, pk)
            if refused is not None:
                return refused
            part, refused = drafts.add_upload(draft, request.FILES.get("file"), now=now)
            if refused is not None:
                return refused
        return Response(
            {
                "attachment": compose.attachment_row(part, "upload"),
                "revision": draft.revision,
                "total_bytes": drafts.total_bytes(draft),
            },
            status=status.HTTP_201_CREATED,
        )


class MailDraftAttachmentView(APIView):
    """DELETE /api/v1/mail/drafts/<id>/attachments/<attachment_id>/ (§3)."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, attachment_id):
        now = timezone.now()
        with transaction.atomic():
            draft, refused = _locked_open(request, pk)
            if refused is not None:
                return refused
            drafts.remove_part(draft, attachment_id, now=now)
        return Response({"revision": draft.revision, "total_bytes": drafts.total_bytes(draft)})
```

In `drafts.py`, the `error` name is imported from `.actions`; `draft_views` reaches it as `drafts.error`.

In `services/mail/urls.py`, after the `mail-draft` route:

```python
(
    path(
        "mail/drafts/<int:pk>/attachments/",
        draft_views.MailDraftAttachmentsView.as_view(),
        name="mail-draft-attachments",
    ),
)
(
    path(
        "mail/drafts/<int:pk>/attachments/<int:attachment_id>/",
        draft_views.MailDraftAttachmentView.as_view(),
        name="mail-draft-attachment",
    ),
)
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/drafts.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_draft_attachments.py
venv/bin/ruff check --fix services/mail/drafts.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_draft_attachments.py
git add services/mail/drafts.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_draft_attachments.py
git commit -m "$(cat <<'EOF'
feat(mail): attach files to gmail drafts

Uploads pass the Files tab's checks, at most 25 a draft and 25 MB decoded
in total (413 DRAFT_TOO_LARGE); each is stored already cached on the
draft's row and queued like any edit. Removing an upload deletes it and its
file; removing a forwarded file only leaves it out.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 10: The flush's draft rows, placeholders, and drafts kept safe from history

**Files:**
- Create: `services/mail/sending.py` (a draft's parts and its MIME; Task 11 adds the sent copy)
- Create: `services/mail/draft_flush.py`
- Modify: `services/mail/outbox_flush.py` (the draft step; `_claim` joins `draft`; label and trash rows skip placeholders and draft rows; `_back` hands draft rows over; `notice` for draft rows)
- Modify: `services/mail/gmail_sync.py` (the reconcile keeps placeholders; history keeps a draft's row while it has a live row or is sending)
- Modify: `services/mail/views.py` (`_disconnect_google` settles `saving` drafts)
- Test: `services/mail/tests/test_draft_flush.py`

**Interfaces:**
- Consumes: Task 2's `GmailSession.create_draft`, `update_draft`, `delete_draft`, `mime`; Task 6's `outbox.draft_sentence`; D2's `Flush` (`_claim`, `_due`, `_sent`, `_settled`, `_fail`, `failed`, `claimed`, `now`, `session`, `connection`), `classify`, `retry_at`, `attachments.fetch`/`cache`/`Gone`/`Busy`/`Unavailable`; `gmail_sync.ensure_claim`, `Lost`.
- Produces:
  - `sending.parts_of(draft) -> (files, related)` (MailAttachment rows, `message` joined);
  - `sending.ensure_cached(parts, connection)` (raises `attachments.Gone | Unavailable | Busy`);
  - `sending.read(part) -> bytes`; `sending.build(draft, files, related) -> bytes`;
  - `draft_flush.run(flush)`; `draft_flush.back(flush, row, **fields)`;
  - `Flush._back` routes draft rows to `draft_flush.back` (plan gap 6).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_draft_flush.py`:

```python
"""Draft rows to Gmail (D3 contract §5 "The flush", decisions 6, 7, 9, 10):
after label creations and before label rows; the MIME built from the
content then; collapsed rows send once; an update waits while a create is in
flight; an update's 404 recreates the draft without a notice; a delete's 404
is done; 413 fails at once (too_large); refusals count, 5xx back off; a
failure keeps the writing (gmail.state failed) and tells the owner once; a
late answer for a draft that moved on deletes the new Gmail draft; at most
MAIL_OUTBOX_DRAFT_CALLS_PER_TICK calls; label rows on a placeholder wait
for its create; D1's reconcile and history keep a draft's row; a disconnect
settles saving drafts."""

from django.db import transaction
from django.test import override_settings
from django.utils import timezone

from services.mail import outbox
from services.mail.models import MailDraft, MailMessage, MailOutbox
from services.notifications.models import Notification

from .draft_fixtures import URL, DraftFixture


class FlushFixture(DraftFixture):
    def rows(self, pk):
        return list(
            MailOutbox.objects.filter(draft_id=pk).order_by("pk").values_list("op", "status")
        )

    def uploads(self, route):
        return [item for item in self.fake.uploads if item[1] == route]


class CreateAndUpdateTests(FlushFixture):
    def test_a_create_reaches_gmail_and_the_drafts_row_takes_its_message_id(self):
        draft = self.new_draft(html="<p>Works for us.</p>")
        self.assertEqual(self.tick().outcome, "ok")
        stored = self.stored(draft["id"])
        self.assertTrue(stored.gmail_draft_id.startswith("r-"))
        self.assertEqual(self.fake.drafts[stored.gmail_draft_id], stored.gmail_message_id)
        self.assertEqual(stored.gmail_state, "saved")
        row = MailMessage.objects.get(pk=draft["message_id"])
        self.assertEqual(row.provider_message_id, stored.gmail_message_id)
        method, route, metadata, message = self.fake.uploads[-1]
        self.assertEqual(
            (route, metadata), ("/drafts", {"message": {"threadId": self.quote.thread_id}})
        )
        self.assertEqual(message["In-Reply-To"], "<CAF=quote@mail.gmail.com>")
        self.assertIn("<CAF=first@mail.gmail.com>", str(message["References"]))
        self.assertEqual(self.rows(draft["id"]), [("draft_create", "sent")])
        # The next tick's history finds the row held: nothing new is stored.
        self.tick()
        self.assertEqual(MailMessage.objects.filter(folder="drafts").count(), 1)

    def test_create_then_edits_send_one_create_with_the_newest_content(self):
        draft = self.new_draft()
        self.patch_draft(draft["id"], {"html": "<p>Newest.</p>", "revision": 1})
        self.tick()
        [create] = self.uploads("/drafts")
        self.assertEqual(create[3].get_body(("plain",)).get_content().strip(), "Newest.")

    def test_an_update_replaces_gmails_message(self):
        draft = self.new_draft()
        self.tick()
        first = self.stored(draft["id"]).gmail_message_id
        self.patch_draft(draft["id"], {"subject": "Re: Terms", "revision": 1})
        self.tick()
        stored = self.stored(draft["id"])
        self.assertNotEqual(stored.gmail_message_id, first)
        self.assertNotIn(first, self.fake.messages)
        row = MailMessage.objects.get(pk=draft["message_id"])
        self.assertEqual(
            (row.provider_message_id, row.subject), (stored.gmail_message_id, "Re: Terms")
        )
        self.assertEqual(self.uploads(f"/drafts/{stored.gmail_draft_id}")[-1][0], "PUT")

    def test_an_update_waits_while_the_create_is_in_flight(self):
        draft = self.new_draft()
        MailOutbox.objects.filter(draft_id=draft["id"]).update(
            status="sending", updated_at=timezone.now()
        )
        self.patch_draft(draft["id"], {"subject": "Later", "revision": 1})
        self.tick()
        self.assertEqual(self.fake.uploads, [])
        self.assertEqual(
            self.rows(draft["id"]), [("draft_create", "sending"), ("draft_update", "pending")]
        )

    def test_an_update_gmail_answers_404_recreates_the_draft_quietly(self):
        draft = self.new_draft()
        self.tick()
        gone = self.stored(draft["id"]).gmail_draft_id
        self.fake.discard_in_gmail(gone)
        self.patch_draft(draft["id"], {"subject": "Still mine", "revision": 1})
        self.tick()
        stored = self.stored(draft["id"])
        self.assertEqual((stored.gmail_draft_id, stored.gmail_state), ("", "saving"))
        self.assertEqual(
            MailMessage.objects.get(pk=draft["message_id"]).provider_message_id,
            f"pending-draft:{stored.pk}",
        )
        self.tick()
        stored = self.stored(draft["id"])
        self.assertTrue(stored.gmail_draft_id)
        self.assertEqual(stored.gmail_state, "saved")
        self.assertFalse(Notification.objects.exists())


class DeleteTests(FlushFixture):
    def test_create_then_delete_sends_nothing(self):
        draft = self.new_draft()
        self.client.delete(f"{URL}drafts/{draft['id']}/")
        self.tick()
        self.assertEqual((self.fake.uploads, self.fake.drafts), ([], {}))

    def test_a_discarded_draft_gmail_holds_is_deleted_there_and_here(self):
        draft = self.new_draft()
        self.tick()
        self.patch_draft(draft["id"], {"subject": "x", "revision": 1})
        with self.captureOnCommitCallbacks(execute=True):
            self.client.delete(f"{URL}drafts/{draft['id']}/")
        self.tick()
        self.assertEqual(self.fake.drafts, {})
        self.assertEqual(len(self.uploads("/drafts")), 1)
        self.assertFalse(MailDraft.objects.exists())

    def test_a_delete_gmail_answers_404_is_done(self):
        draft = self.new_draft()
        self.tick()
        self.fake.discard_in_gmail(self.stored(draft["id"]).gmail_draft_id)
        self.client.delete(f"{URL}drafts/{draft['id']}/")
        self.tick()
        self.assertFalse(MailDraft.objects.exists())
        self.assertFalse(Notification.objects.exists())

    def test_a_late_create_for_a_draft_that_moved_on_is_deleted_in_gmail(self):
        draft = self.new_draft()
        MailDraft.objects.filter(pk=draft["id"]).update(status="sent")
        self.tick()
        self.tick()
        self.assertEqual(self.fake.drafts, {})
        self.assertEqual(self.stored(draft["id"]).status, "sent")


class FailureTests(FlushFixture):
    def test_413_fails_at_once_keeps_the_writing_and_tells_the_owner_once(self):
        draft = self.new_draft(html="<p>Big.</p>")
        self.fake.fail(r"/drafts$", 413, "tooLarge")
        self.tick()
        stored = self.stored(draft["id"])
        self.assertEqual((stored.gmail_state, stored.html), ("failed", "<p>Big.</p>"))
        row = MailOutbox.objects.get(draft_id=draft["id"])
        self.assertEqual((row.status, row.reason), ("failed", "too_large"))
        notice = Notification.objects.get()
        self.assertEqual(
            notice.message, "Couldn't save the draft in Gmail: it is over Gmail's size limit."
        )
        self.assertEqual(
            notice.link, f"/communications?source=mailbox:google&folder=drafts&draft={stored.pk}"
        )
        data = self.client.get(f"{URL}drafts/{stored.pk}/").data
        self.assertEqual(data["sync_issue"]["text"], notice.message)
        self.assertEqual(data["gmail"], {"state": "failed"})
        # The next edit tries again.
        self.patch_draft(stored.pk, {"subject": "Again", "revision": 1})
        self.tick()
        self.assertEqual(self.stored(stored.pk).gmail_state, "saved")

    def test_a_refusal_counts_and_a_5xx_backs_the_mailbox_off(self):
        draft = self.new_draft()
        self.fake.fail(r"/drafts$", 400, "invalidArgument")
        self.tick()
        row = MailOutbox.objects.get(draft_id=draft["id"])
        self.assertEqual((row.status, row.attempts), ("pending", 1))
        MailOutbox.objects.update(next_attempt_at=timezone.now())
        self.fake.fail(r"/drafts$", 503)
        self.assertEqual(self.tick().outcome, "backoff")
        self.assertEqual(MailOutbox.objects.get(draft_id=draft["id"]).attempts, 2)

    def test_a_part_gmail_lost_fails_with_its_own_sentence(self):
        draft = self.post_draft({"kind": "forward", "source_message_id": self.quote.pk}).data
        self.fake.files.clear()
        self.tick()
        self.assertEqual(Notification.objects.get().message, outbox.PART_GONE)
        self.assertEqual(self.stored(draft["id"]).gmail_state, "failed")

    def test_a_failed_create_fails_the_label_rows_waiting_on_its_placeholder(self):
        draft = self.new_draft()
        placeholder = MailMessage.objects.get(pk=draft["message_id"])
        # A label row on the placeholder (Task 14 refuses one from the API; the
        # outbox still keeps the rule).
        with transaction.atomic():
            outbox.apply(self.mailbox, [(placeholder, c) for c in outbox.changes_for("star")])
        self.fake.fail(r"/drafts$", 413, "tooLarge")
        self.tick()
        self.assertEqual(
            set(MailOutbox.objects.values_list("op", "status")),
            {("draft_create", "failed"), ("star", "failed")},
        )


class PlacementTests(FlushFixture):
    @override_settings(MAIL_OUTBOX_DRAFT_CALLS_PER_TICK=1)
    def test_at_most_so_many_draft_calls_a_tick_the_rest_wait_uncounted(self):
        first, second = self.new_draft(), self.new_draft(kind="new")
        self.tick()
        self.assertEqual(len(self.uploads("/drafts")), 1)
        waiting = MailOutbox.objects.get(draft_id=second["id"])
        self.assertEqual((waiting.status, waiting.attempts), ("pending", 0))
        self.tick()
        self.assertEqual(len(self.uploads("/drafts")), 2)
        self.assertTrue(self.stored(first["id"]).gmail_draft_id)

    def test_d1s_reconcile_keeps_a_placeholder(self):
        draft = self.new_draft()
        MailOutbox.objects.update(status="failed")
        MailDraft.objects.filter(pk=draft["id"]).update(gmail_state="failed")
        self.mailbox.reconcile_started_at = timezone.now()
        self.mailbox.save(update_fields=["reconcile_started_at"])
        self.tick()
        self.assertTrue(MailMessage.objects.filter(pk=draft["message_id"]).exists())

    def test_a_disconnect_settles_saving_drafts(self):
        local, held = self.new_draft(), self.new_draft(kind="new")
        MailDraft.objects.filter(pk=held["id"]).update(gmail_draft_id="r-5")
        self.assertEqual(self.client.delete(f"{URL}connection/").status_code, 204)
        self.assertEqual(
            (self.stored(local["id"]).gmail_state, self.stored(held["id"]).gmail_state),
            ("local", "failed"),
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_flush --parallel auto --noinput`
Expected: FAIL: no draft is ever sent (`self.fake.drafts == {}`), and D2's label step claims the draft rows and crashes on `row.message` being `None`.

- [ ] **Step 3: A draft's parts and its MIME**

Create `services/mail/sending.py`:

```python
"""What a draft's message carries, shared by the flush (services/mail/
draft_flush.py), the send (draft_send.py) and the reconcile (D3 contract
§4). Its own parts (uploads and Gmail's) and its forwarded files go as
files; the inline images its HTML references by cid: (its own, and a
forward's source's) go in multipart/related. Every part is in the cache
before the MIME is built (decision 22)."""

import re

from django.utils import timezone

from . import attachments, mime
from .models import MailAttachment, MailDraft
from .sync import sender_name

CID = re.compile(r"""cid:([^"'\s>)]+)""", re.IGNORECASE)


def parts_of(draft):
    """(files, related) MailAttachment rows, each with its message joined."""
    own = []
    if draft.message_id:
        own = list(
            MailAttachment.objects.filter(message_id=draft.message_id)
            .select_related("message")
            .order_by("pk")
        )
    source = []
    if draft.source_id and (draft.forwarded or draft.kind == MailDraft.Kind.FORWARD):
        source = list(
            MailAttachment.objects.filter(message_id=draft.source_id)
            .select_related("message")
            .order_by("pk")
        )
    kept = set(draft.forwarded)
    cids = set(CID.findall(draft.html or ""))
    forwarded = [part for part in source if part.pk in kept and not part.is_inline]
    related = [
        part
        for part in [*own, *source]
        if part.is_inline and part.content_id and part.content_id in cids
    ]
    files = [part for part in own if not part.is_inline] + forwarded
    return files, related


def ensure_cached(parts, connection):
    """Fetch every part not cached yet (D2's attachments.fetch). Raises
    attachments.Gone, Unavailable or Busy."""
    for part in parts:
        if not part.file:
            attachments.cache(part, attachments.fetch(part, connection), timezone.now())


def read(part):
    with part.file.open("rb") as handle:
        return handle.read()


def build(draft, files, related):
    """The draft's message, as its content stands now (decision 6)."""
    connection = draft.connection
    return mime.build(
        mime.Outgoing(
            from_name=sender_name(connection),
            from_address=connection.address,
            to=draft.to,
            cc=draft.cc,
            bcc=draft.bcc,
            subject=draft.subject,
            text=draft.text,
            html=draft.html,
            in_reply_to=draft.in_reply_to,
            references=draft.references,
            attachments=[mime.Part(p.filename, p.mime_type, read(p)) for p in files],
            related=[mime.Part(p.filename, p.mime_type, read(p), p.content_id) for p in related],
        )
    )
```

- [ ] **Step 4: The draft step**

Create `services/mail/draft_flush.py`:

```python
"""Draft rows to Gmail: the flush's second step (D3 contract §5 "The
flush"), after label creations and before label rows (decision 7), oldest
first, at most MAIL_OUTBOX_DRAFT_CALLS_PER_TICK calls; the rest wait,
uncounted.

A create or update builds the MIME from the draft's content now (decision
6), after every part it carries is cached. An update waits while its
draft's create is in flight; one with no Gmail id and no create left runs
as a create (plan gap 5). On 2xx the Drafts row takes Gmail's message id;
a draft no longer open has its new Gmail draft deleted at once. Gmail's
404 on an update recreates the draft with no notice (decision 9); on a
delete it is done. 413 fails at once (too_large). Other answers follow D2:
refusals count, 5xx counts and backs off, rate limits and lost grants count
nothing. A failure never reverts the person's writing (decision 10): the
draft reads gmail_state failed and the owner is told once.
"""

import logging
import uuid

from django.conf import settings
from django.db import transaction
from django.db.models import F

from . import attachments, gmail_sync, outbox, sending
from .models import PENDING_DRAFT_PREFIX, MailDraft, MailMessage, MailOutbox
from .providers.base import ProviderError

logger = logging.getLogger(__name__)
Op = MailOutbox.Op
Reason = MailOutbox.Reason
Status = MailOutbox.Status
State = MailDraft.GmailState
DraftStatus = MailDraft.Status
PART_GONE = {"part": "gone"}


def run(flush):
    rows = flush._claim(flush._due().filter(op__in=MailOutbox.DRAFT_OPS))
    calls = 0
    for row in rows:
        draft = (
            MailDraft.objects.select_related("connection__user", "message", "source")
            .filter(pk=row.draft_id)
            .first()
        )
        if draft is None:  # gone meanwhile (a discard of a draft Gmail never had)
            flush._sent([row])
            continue
        if _waits(row, draft) or calls >= settings.MAIL_OUTBOX_DRAFT_CALLS_PER_TICK:
            back(flush, row)
            continue
        calls += 1
        try:
            _one(flush, row, draft)
        except ProviderError as exc:
            _failed_call(flush, row, draft, exc)


def _creating(row, draft):
    return (
        MailOutbox.objects.filter(draft_id=draft.pk, op=Op.DRAFT_CREATE, status__in=MailOutbox.LIVE)
        .exclude(pk=row.pk)
        .exists()
    )


def _waits(row, draft):
    """An update or delete waits for its draft's create in flight (§5)."""
    if row.op == Op.DRAFT_UPDATE and not draft.gmail_draft_id:
        return _creating(row, draft)
    if row.op == Op.DRAFT_DELETE and not (
        row.payload.get("gmail_draft_id") or draft.gmail_draft_id
    ):
        return _creating(row, draft)
    return False


def back(flush, row, **fields):
    """Pending again (with `fields`). A pending row made meanwhile for the
    same draft covers the content: an old create keeps its place and the
    newer update goes; otherwise the old row goes (plan gap 6). The draft is
    locked first, then its rows (the order a request takes)."""
    with transaction.atomic():
        list(MailDraft.objects.select_for_update().filter(pk=row.draft_id).values_list("pk"))
        newer = (
            MailOutbox.objects.select_for_update()
            .filter(draft_id=row.draft_id, status=Status.PENDING)
            .exclude(pk=row.pk)
            .first()
        )
        if newer is not None and not (row.op == Op.DRAFT_CREATE and newer.op == Op.DRAFT_UPDATE):
            MailOutbox.objects.filter(pk=row.pk).delete()
        else:
            if newer is not None:
                newer.delete()
            MailOutbox.objects.filter(pk=row.pk, status=Status.SENDING).update(
                status=Status.PENDING, updated_at=flush.now, **fields
            )
    flush._settled([row])


def _one(flush, row, draft):
    if row.op == Op.DRAFT_DELETE:
        gmail_id = row.payload.get("gmail_draft_id") or draft.gmail_draft_id
        if gmail_id:
            gmail_sync.ensure_claim(flush.connection)
            try:
                flush.session.delete_draft(gmail_id)
            except ProviderError as exc:
                if exc.status != 404:  # a 404 is done (§5)
                    raise
        flush._sent([row])
        # Only a discarded draft goes: a sent one keeps its row (plan gap 7).
        MailDraft.objects.filter(pk=draft.pk, status=DraftStatus.DISCARDED).delete()
        return
    try:
        raw = _mime(flush, row, draft)
    except attachments.Gone:
        _fail(flush, row, draft, Reason.NOT_FOUND, payload=PART_GONE)
        return
    gmail_sync.ensure_claim(flush.connection)
    if row.op == Op.DRAFT_CREATE or not draft.gmail_draft_id:
        answer = flush.session.create_draft(raw, draft.thread_id)
    else:
        try:
            answer = flush.session.update_draft(draft.gmail_draft_id, raw, draft.thread_id)
        except ProviderError as exc:
            if exc.status != 404:
                raise
            _recreate(flush, row, draft)
            return
    _saved(flush, row, draft, answer)


def _mime(flush, row, draft):
    files, related = sending.parts_of(draft)
    try:
        sending.ensure_cached([*files, *related], flush.connection)
    except attachments.Busy as exc:
        raise exc.__cause__ from exc  # the ProviderError: D2's classes decide
    except attachments.Unavailable as exc:
        # The fetch already paused the mailbox; nothing more is written.
        back(flush, row)
        raise gmail_sync.Lost from exc
    return sending.build(draft, files, related)


def _delete_later(draft, now):
    """The draft moved on while its create or update was out: delete the
    Gmail draft that call made (§5)."""
    payload = {"gmail_draft_id": draft.gmail_draft_id}
    pending = MailOutbox.objects.filter(draft_id=draft.pk, status=Status.PENDING).first()
    if pending is not None:
        MailOutbox.objects.filter(pk=pending.pk).update(
            op=Op.DRAFT_DELETE, payload=payload, next_attempt_at=now, updated_at=now
        )
        return
    MailOutbox.objects.create(
        connection_id=draft.connection_id,
        action_id=uuid.uuid4(),
        op=Op.DRAFT_DELETE,
        draft=draft,
        payload=payload,
        next_attempt_at=now,
    )


def _saved(flush, row, draft, answer):
    """2xx on a create or update: the ids stored, the Drafts row on Gmail's
    message id (history then finds it held), the state saved unless another
    row is live."""
    gmail_id = str(answer.get("id") or "")[:255]
    message = answer.get("message") or {}
    message_id = str(message.get("id") or "")[:255]
    thread_id = str(message.get("threadId") or "")[:255]
    with transaction.atomic():
        fresh = MailDraft.objects.select_for_update().filter(pk=draft.pk).first()
        if fresh is None:
            flush._sent([row])
            return
        if fresh.message_id and message_id:
            MailMessage.objects.filter(
                connection=flush.connection, provider_message_id=message_id
            ).exclude(pk=fresh.message_id).delete()
            MailMessage.objects.filter(pk=fresh.message_id).update(
                provider_message_id=message_id,
                thread_id=thread_id or F("thread_id"),
                refreshed_at=flush.now,
            )
        fresh.gmail_draft_id = gmail_id or fresh.gmail_draft_id
        fresh.gmail_message_id = message_id
        fresh.thread_id = thread_id or fresh.thread_id
        others = (
            MailOutbox.objects.filter(draft_id=fresh.pk, status__in=MailOutbox.LIVE)
            .exclude(pk=row.pk)
            .exists()
        )
        fresh.gmail_state = State.SAVING if others else State.SAVED
        # Named fields only: updated_at is the claim's stamp while sending.
        fresh.save(update_fields=["gmail_draft_id", "gmail_message_id", "thread_id", "gmail_state"])
        flush._sent([row])
        if fresh.status != DraftStatus.OPEN:
            _delete_later(fresh, flush.now)


def _recreate(flush, row, draft):
    """Decision 9: Gmail lost the draft; the newest writing is saved again as
    a new one, with no notice. The Drafts row goes back on its placeholder
    id, so history's delete of the old message misses it (plan gap 8)."""
    with transaction.atomic():
        fresh = MailDraft.objects.select_for_update().filter(pk=draft.pk).first()
        flush._sent([row])
        if fresh is None or fresh.status != DraftStatus.OPEN:
            return
        MailOutbox.objects.filter(draft_id=fresh.pk, status=Status.PENDING).delete()
        if fresh.message_id:
            MailMessage.objects.filter(pk=fresh.message_id).update(
                provider_message_id=f"{PENDING_DRAFT_PREFIX}{fresh.pk}"
            )
        fresh.gmail_draft_id, fresh.gmail_message_id = "", ""
        fresh.gmail_state = State.SAVING
        fresh.save(update_fields=["gmail_draft_id", "gmail_message_id", "gmail_state"])
        MailOutbox.objects.create(
            connection_id=fresh.connection_id,
            action_id=row.action_id,
            op=Op.DRAFT_CREATE,
            draft=fresh,
            next_attempt_at=flush.now,
        )
        connection_id = fresh.connection_id
        transaction.on_commit(lambda: outbox.wake(connection_id))


def _fail(flush, row, draft, reason, *, payload=None):
    """Failed now, with no content revert (decision 10). A failed create also
    fails, uncounted, the label rows waiting on its placeholder (D2 decision
    8); a failed delete lets a discarded draft go anyway, leaving Gmail's
    copy. The notice waits for the end of the flush."""
    waiting = []
    with transaction.atomic():
        fields = {
            "status": Status.FAILED,
            "reason": reason,
            "failed_at": flush.now,
            "updated_at": flush.now,
        }
        if payload:
            row.payload = {**row.payload, **payload}
            fields["payload"] = row.payload
        MailOutbox.objects.filter(pk=row.pk).update(**fields)
        if row.op == Op.DRAFT_DELETE:
            MailDraft.objects.filter(pk=draft.pk, status=DraftStatus.DISCARDED).delete()
        else:
            MailDraft.objects.filter(pk=draft.pk).update(gmail_state=State.FAILED)
            if row.op == Op.DRAFT_CREATE and draft.message_id:
                waiting = list(
                    MailOutbox.objects.filter(message_id=draft.message_id, status=Status.PENDING)
                )
    flush._settled([row])
    flush.failed.append((row, reason))
    if waiting:
        flush._fail(waiting, reason)


def _count(flush, row, draft, reason):
    from .outbox_flush import retry_at

    attempts = row.attempts + 1
    if attempts >= settings.MAIL_OUTBOX_MAX_ATTEMPTS:
        MailOutbox.objects.filter(pk=row.pk).update(attempts=attempts)
        _fail(flush, row, draft, reason)
        return
    back(flush, row, attempts=attempts, next_attempt_at=retry_at(attempts, flush.now))


def _failed_call(flush, row, draft, exc):
    """D2's outcome classes for a draft row, plus 413 (§5 "Outcomes")."""
    from .outbox_flush import classify

    logger.warning(
        "gmail draft call failed for connection %s: %s %s",
        flush.connection.pk,
        exc.status,
        exc.reason,
    )
    if exc.status == 413:
        _fail(flush, row, draft, Reason.TOO_LARGE)
        return
    kind = classify(exc)
    if kind == "not_found":
        _fail(flush, row, draft, Reason.NOT_FOUND)
    elif kind in ("refused", "label_gone"):
        _count(flush, row, draft, Reason.REFUSED)
    elif kind == "unavailable":
        _count(flush, row, draft, Reason.EXHAUSTED)
        raise exc
    else:  # a rate limit or a lost grant: not the row's fault
        back(flush, row)
        raise exc
```

- [ ] **Step 5: Wire it into D2's flush**

In `services/mail/outbox_flush.py`:
- import: `from . import draft_flush, gmail_sync, outbox, threads` and `from .models import PENDING_DRAFT_PREFIX, PENDING_LABEL_PREFIX, MailLabel, MailMessage, MailOutbox`;
- in `flush`, after `run.label_creates()`, add `draft_flush.run(run)  # D3 decision 7: drafts before label rows`;
- in `_claim`, change `.select_related("message", "label")` to `.select_related("message", "label", "draft")`;
- at the start of `_back`, route draft rows (before `if not rows: return`):

```python
        drafts = [row for row in rows if row.op in MailOutbox.DRAFT_OPS]
        for row in drafts:
            draft_flush.back(self, row, **fields)
        rows = [row for row in rows if row.op not in MailOutbox.DRAFT_OPS]
```

- in `label_changes`, add to the claimed queryset `.exclude(op__in=MailOutbox.DRAFT_OPS)` and `.exclude(message__provider_message_id__startswith=PENDING_DRAFT_PREFIX)` (a label row on a placeholder waits for its draft's create, D3 decision 7);
- in `trash_changes`, change the claimed queryset to `self._due().filter(label_key="TRASH").exclude(message__provider_message_id__startswith=PENDING_DRAFT_PREFIX)`;
- at the start of `notice`, add:

```python
    if first.op in MailOutbox.DRAFT_OPS:
        link = f"{COMMUNICATIONS}&folder=drafts&draft={first.draft_id}"
        return outbox.draft_sentence(first, reason), link
```

(`notice` already reads `first = rows[0]`; put this right after that line.) Update the module docstring's first paragraph: "...at most MAIL_OUTBOX_SINGLE_CALLS_PER_TICK single calls a tick. D3's draft rows go after label creations and before label rows (services/mail/draft_flush.py). A row whose label Gmail has not created yet, or on a draft Gmail has not created yet, waits."

- [ ] **Step 6: History, the reconcile and the disconnect**

In `services/mail/gmail_sync.py`:
- import `PENDING_DRAFT_PREFIX, MailDraft, MailOutbox` from `.models` beside `MailboxConnection, MailMessage`;
- in `_apply_history`, replace the deletion with:

```python
    if changes.deleted:
        # The personal copy goes; a filed Email is the company's and stays. A
        # draft's row stays while a Revenact edit is on its way or the draft
        # is being sent (D3 decision 8, plan gap 8).
        MailMessage.objects.filter(
            connection=connection, provider_message_id__in=changes.deleted
        ).exclude(draft__status=MailDraft.Status.SENDING).exclude(
            draft__outbox__status__in=MailOutbox.LIVE
        ).delete()
```

- in `_reconcile_page`'s final deletion, add `.exclude(provider_message_id__startswith=PENDING_DRAFT_PREFIX)` after the `refreshed_at` filter (D3 §5 "D1's reconcile and placeholders").

In `services/mail/views.py` `_disconnect_google`, add `MailDraft` to the `.models` import and, inside the `transaction.atomic()` block after the `MailOutbox ... .delete()` line:

```python
# Their rows went with the outbox: a saving draft is local again, or
# failed when Gmail holds an older copy (plan gap 9).
saving = MailDraft.objects.filter(connection=connection, gmail_state=MailDraft.GmailState.SAVING)
saving.filter(gmail_draft_id="").update(gmail_state=MailDraft.GmailState.LOCAL)
saving.exclude(gmail_draft_id="").update(gmail_state=MailDraft.GmailState.FAILED)
```

(Evaluate the `exclude` before the first `update` changes the rows: the two querysets filter on `gmail_draft_id`, and the first update only touches rows with a blank id, so either order is correct.)

- [ ] **Step 7: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK, D2's flush tests included.

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff format services/mail/sending.py services/mail/draft_flush.py services/mail/outbox_flush.py services/mail/gmail_sync.py services/mail/views.py services/mail/tests/test_draft_flush.py
venv/bin/ruff check --fix services/mail/sending.py services/mail/draft_flush.py services/mail/outbox_flush.py services/mail/gmail_sync.py services/mail/views.py services/mail/tests/test_draft_flush.py
git add services/mail/sending.py services/mail/draft_flush.py services/mail/outbox_flush.py services/mail/gmail_sync.py services/mail/views.py services/mail/tests/test_draft_flush.py
git commit -m "$(cat <<'EOF'
feat(mail): save revenact drafts to gmail from the outbox

The flush sends draft rows after label creations and before label rows,
building the MIME from the content then. An update waits for a create in
flight, a lost Gmail draft is recreated quietly, 413 fails at once, and a
failure keeps the writing and tells the owner once. Placeholders survive
D1's reconcile; history never deletes a draft's row mid-edit or mid-send.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 11: Sending a draft, confirm-sent and reopen

**Files:**
- Modify: `services/mail/sending.py` (`sent_copy`, `copy_forwarded`, `file_sent`)
- Create: `services/mail/draft_send.py`
- Modify: `services/mail/actions.py` (`gmail_busy`); `services/mail/views.py` (`_gmail_busy` delegates)
- Modify: `services/mail/draft_views.py` (`MailDraftSendView`, `MailDraftConfirmSentView`, `MailDraftReopenView`)
- Modify: `services/mail/urls.py`
- Test: `services/mail/tests/test_draft_send.py`

**Interfaces:**
- Consumes: Task 10's `sending.parts_of`, `build`, `read`; Task 7's `drafts.lock`, `edit`, `record_of`, `readable`, `payload`; Task 6's `total_bytes`, `total_of`, `CONTENT_FIELDS`; Task 2's `GmailSession.send_draft`, `send_message`, `metadata`; D2's `attachments.fetch`/`cache`; `gmail_store.derive`; `gmail_sync.session_for`, `keep_credentials`, `pause_revoked`, `classify_failure`; `customers.drafts.UNCONFIRMED_AFTER`, `stamp`; `classify_records`.
- Produces:
  - `sending.sent_copy(draft, connection, answer, *, now, take_draft_row, has_files) -> MailMessage`;
  - `sending.copy_forwarded(row, parts, *, now)`;
  - `sending.file_sent(connection, row, *, customer_id, account_id) -> (Email | None, created: bool)`;
  - `draft_send.Sent(draft_id, row, email, marked, filed_now)`;
  - `draft_send.send(request, pk, data) -> Response | Sent` (steps 1–12); `draft_send.send_open(request, draft) -> Response | Sent` (steps 4–12, for Task 13's linked send);
  - `draft_send.reopen(draft, claimed_at, *, forget_gmail=False)`;
  - `draft_send.answer(request, sent) -> dict` (the 200 body);
  - `draft_send.settle_unconfirmed(request, pk, *, confirm) -> Response | None`; `draft_send.settle_linked(reply_id, *, confirm, now)` (for Task 13);
  - `actions.gmail_busy(seconds) -> Response`;
  - `POST /api/v1/mail/drafts/<id>/send/` (`mail-draft-send`), `.../confirm-sent/` (`mail-draft-confirm-sent`), `.../reopen/` (`mail-draft-reopen`).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_draft_send.py`:

```python
"""POST mail/drafts/<id>/send/ (D3 contract §4): the carried edit first and
kept whatever follows; recipients, record, size, the connection checks
(paused included) and backoff before anything is claimed; every part cached
before the claim; the claim committed before Gmail is called; drafts.send
when Gmail holds the draft, messages.send otherwise; the draft's own row
becomes the sent copy, filed with get_or_create, its forwarded files copied,
its Message-ID read back; mailbox.reply or mailbox.sent; Gmail's refusals
reopen it, no answer leaves it sending for confirm-sent or reopen; a late
success on a draft that moved on is SEND_SUPERSEDED, still filed and
audited; a linked ReplyDraft is settled with it."""

import email
from datetime import timedelta
from email import policy
from unittest.mock import patch

from django.db import connection as db
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.customers.models import Customer, Email, ReplyDraft
from services.mail import draft_send
from services.mail.models import (
    MailAttachment,
    MailboxConnection,
    MailDraft,
    MailMessage,
    MailOutbox,
)

from .draft_fixtures import LOGO, PDF, URL, DraftFixture


class SendFixture(DraftFixture):
    def send(self, pk, body=None):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(f"{URL}drafts/{pk}/send/", body or {}, format="json")

    def last_upload(self):
        method, route, metadata, message = self.fake.uploads[-1]
        return route, metadata, message


class SendTests(SendFixture):
    def test_a_saved_reply_goes_with_drafts_send_threaded_filed_and_audited(self):
        draft = self.new_draft(html="<p>Works for us.</p>")
        self.tick()
        gmail_id = self.stored(draft["id"]).gmail_draft_id
        response = self.send(draft["id"])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["draft"]["status"], "sent")
        self.assertIsNotNone(response.data["draft"]["sent_at"])
        route, metadata, message = self.last_upload()
        self.assertEqual(
            (route, metadata),
            ("/drafts/send", {"id": gmail_id, "message": {"threadId": self.quote.thread_id}}),
        )
        self.assertEqual(message["In-Reply-To"], "<CAF=quote@mail.gmail.com>")
        row = MailMessage.objects.get(pk=response.data["message"]["id"])
        self.assertEqual(row.pk, draft["message_id"])
        self.assertEqual((row.folder, row.label_ids, row.direction), ("sent", ["SENT"], "sent"))
        self.assertEqual(row.rfc_message_id, f"<{row.provider_message_id}@mail.gmail.com>")
        filed = Email.objects.get(pk=response.data["email"]["id"])
        self.assertEqual(
            (filed.customer, filed.direction, filed.to_addresses, filed.thread_id),
            (self.pizza, "sent", ["ann@pizzahut.com"], self.quote.thread_id),
        )
        self.assertEqual(row.email, filed)
        stored = self.stored(draft["id"])
        self.assertEqual(
            (stored.status, stored.sent_email, stored.message_id), ("sent", filed, row.pk)
        )
        event = AuditEvent.objects.get(action="mailbox.reply")
        self.assertEqual((event.actor, event.target_id), (self.dana, str(self.quote.pk)))
        self.assertEqual(
            {key: event.metadata[key] for key in ("to", "cc", "bcc_count", "attachments")},
            {"to": ["ann@pizzahut.com"], "cc": [], "bcc_count": 0, "attachments": 0},
        )
        self.assertGreater(event.metadata["bytes"], 0)
        self.assertEqual(self.fake.drafts, {})
        self.tick()  # history finds the sent copy held: nothing is filed twice
        self.assertEqual(Email.objects.filter(direction="sent").count(), 1)

    def test_a_draft_gmail_never_had_goes_with_messages_send(self):
        draft = self.new_draft()
        response = self.send(draft["id"])
        self.assertEqual(response.status_code, 200, response.data)
        route, metadata, _ = self.last_upload()
        self.assertEqual((route, metadata), ("/messages/send", {"threadId": self.quote.thread_id}))
        self.assertFalse(MailOutbox.objects.filter(status="pending").exists())
        self.assertEqual(self.fake.drafts, {})

    def test_a_new_message_on_no_record_is_sent_unfiled_and_audited_as_sent(self):
        draft = self.post_draft(
            {"kind": "new", "to": ["x@else.io"], "bcc": ["carl@acme.io"], "subject": "Hi"}
        ).data
        response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["email"]), (200, None))
        self.assertEqual(self.last_upload()[1], {})
        event = AuditEvent.objects.get(action="mailbox.sent")
        self.assertEqual(
            (event.metadata["kind"], event.metadata["draft"], event.metadata["email"]),
            ("new", draft["id"], None),
        )
        self.assertEqual(event.metadata["bcc_count"], 1)
        self.assertFalse(Email.objects.filter(direction="sent").exists())

    def test_a_forward_fetches_its_files_first_and_its_sent_copy_keeps_them(self):
        draft = self.post_draft({"kind": "forward", "source_message_id": self.quote.pk}).data
        response = self.send(draft["id"], {"to": ["x@else.io"], "revision": 1})
        self.assertEqual(response.status_code, 200, response.data)
        message = self.last_upload()[2]
        files = {part.get_filename(): part for part in message.walk() if part.get_filename()}
        self.assertEqual(files["Renewal quote.pdf"].get_payload(decode=True), PDF)
        self.assertEqual(files["logo.png"]["Content-ID"], "<logo@pizzahut.com>")
        self.assertEqual(files["logo.png"].get_payload(decode=True), LOGO)
        copy = MailAttachment.objects.get(
            message_id=response.data["message"]["id"], part_id="sent:1"
        )
        with copy.file.open("rb") as handle:
            self.assertEqual(handle.read(), PDF)
        event = AuditEvent.objects.get(action="mailbox.sent")
        self.assertEqual((event.metadata["kind"], event.metadata["attachments"]), ("forward", 1))


class RefusalTests(SendFixture):
    def test_the_checks_before_the_claim(self):
        empty = self.post_draft({"kind": "new"}).data
        response = self.send(empty["id"])
        self.assertEqual(
            (response.status_code, response.data), (400, {"to": ["Add someone to send it to."]})
        )
        draft = self.new_draft()
        hidden = Customer.objects.create(
            organisation=Organisation.objects.create(name="Elsewhere"),
            name="Hidden",
            domain="hidden.io",
        )
        MailDraft.objects.filter(pk=draft["id"]).update(customer=hidden)
        response = self.send(draft["id"])
        self.assertEqual(response.data, {"record": ["Choose a record you can open."]})
        MailDraft.objects.filter(pk=draft["id"]).update(customer=self.pizza)
        with override_settings(MAIL_SEND_MAX_BYTES=10):
            response = self.send(draft["id"])
        self.assertEqual(
            (response.status_code, response.data["code"], response.data["detail"]),
            (
                413,
                "MESSAGE_TOO_LARGE",
                "This message is over Gmail's 25 MB limit. Remove an attachment.",
            ),
        )
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            backoff_until=timezone.now() + timedelta(seconds=90)
        )
        response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (503, "GMAIL_BUSY"))
        self.assertGreaterEqual(int(response["Retry-After"]), 89)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        response = self.send(draft["id"], {"subject": "Edited", "revision": 1})
        self.assertEqual((response.status_code, response.data["code"]), (409, "MAILBOX_PAUSED"))
        stored = self.stored(draft["id"])
        self.assertEqual((stored.status, stored.subject), ("open", "Edited"))
        self.assertEqual(self.fake.uploads, [])

    def test_a_stale_revision_and_a_second_send(self):
        draft = self.new_draft()
        response = self.send(draft["id"], {"subject": "x", "revision": 9})
        self.assertEqual((response.status_code, response.data["code"]), (409, "DRAFT_CHANGED"))
        self.assertEqual(self.send(draft["id"]).status_code, 200)
        response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))

    def test_a_part_gmail_lost_refuses_before_the_claim(self):
        draft = self.post_draft(
            {"kind": "forward", "source_message_id": self.quote.pk, "to": ["x@else.io"]}
        ).data
        self.fake.files.clear()
        response = self.send(draft["id"])
        self.assertEqual((response.status_code, response.data["code"]), (410, "ATTACHMENT_GONE"))
        quote_parts = MailAttachment.objects.filter(message=self.quote).values_list("pk", flat=True)
        self.assertIn(response.data["attachment_id"], set(quote_parts))
        self.assertEqual(self.stored(draft["id"]).status, "open")

    def test_someone_elses_draft(self):
        draft = self.new_draft()
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.send(draft["id"]).status_code, 404)


class GmailAnswerTests(SendFixture):
    def test_gmail_lost_the_draft(self):
        draft = self.new_draft()
        self.tick()
        self.fake.discard_in_gmail(self.stored(draft["id"]).gmail_draft_id)
        response = self.send(draft["id"])
        self.assertEqual(
            (response.status_code, response.data["detail"]),
            (409, "This draft was sent or discarded in Gmail. Check Sent before sending it again."),
        )
        stored = self.stored(draft["id"])
        self.assertEqual(
            (stored.status, stored.gmail_draft_id, stored.gmail_state), ("open", "", "local")
        )
        self.assertEqual(
            MailMessage.objects.get(pk=draft["message_id"]).provider_message_id,
            f"pending-draft:{stored.pk}",
        )

    def test_refusals_reopen_it(self):
        draft = self.new_draft()
        for status, reason, code, answer in (
            (429, "", "GMAIL_BUSY", 503),
            (413, "tooLarge", "MESSAGE_TOO_LARGE", 413),
            (400, "invalidArgument", "MAILBOX_REFUSED", 502),
        ):
            with self.subTest(status=status):
                self.fake.fail(r"/messages/send$", status, reason)
                response = self.send(draft["id"])
                self.assertEqual((response.status_code, response.data["code"]), (answer, code))
                self.assertEqual(self.stored(draft["id"]).status, "open")
        self.assertEqual(MailboxConnection.objects.get(pk=self.mailbox.pk).paused_reason, "")

    def test_a_lost_permission_pauses_the_mailbox(self):
        draft = self.new_draft()
        self.fake.fail(r"/messages/send$", 403, "insufficientPermissions")
        response = self.send(draft["id"])
        self.assertEqual(
            (response.status_code, response.data),
            (
                502,
                {
                    "code": "MAILBOX_REFUSED",
                    "detail": "Your mailbox didn't accept the message. Try again.",
                },
            ),
        )
        self.assertEqual(
            MailboxConnection.objects.get(pk=self.mailbox.pk).paused_reason, "token_revoked"
        )

    def test_no_answer_leaves_it_sending_for_its_owner_to_settle(self):
        first, second = self.new_draft(), self.new_draft(kind="new", to=["x@else.io"])
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            response = self.send(first["id"])
        self.assertEqual((response.status_code, response.data["code"]), (504, "SEND_UNCONFIRMED"))
        self.assertEqual(self.stored(first["id"]).status, "sending")
        data = self.client.get(f"{URL}drafts/{first['id']}/").data
        self.assertEqual(
            (data["status"], data["sending"], data["sent_at"]), ("sent", "pending", None)
        )
        early = self.client.post(f"{URL}drafts/{first['id']}/confirm-sent/")
        self.assertEqual((early.status_code, early.data["code"]), (409, "NOT_UNCONFIRMED"))
        old = timezone.now() - timedelta(minutes=11)
        MailDraft.objects.filter(pk=first["id"]).update(updated_at=old)
        self.assertTrue(self.client.get(f"{URL}drafts/{first['id']}/").data["can_resolve"])
        confirmed = self.client.post(f"{URL}drafts/{first['id']}/confirm-sent/")
        self.assertEqual((confirmed.status_code, confirmed.data["status"]), (200, "sent"))
        self.assertFalse(MailMessage.objects.filter(pk=first["message_id"]).exists())
        with patch("services.mail.providers.google.http_upload", side_effect=TimeoutError()):
            self.send(second["id"])
        MailDraft.objects.filter(pk=second["id"]).update(updated_at=old)
        reopened = self.client.post(f"{URL}drafts/{second['id']}/reopen/")
        self.assertEqual((reopened.status_code, reopened.data["status"]), (200, "open"))

    def test_a_late_success_on_a_draft_that_moved_on_is_superseded_but_filed(self):
        draft = self.new_draft()
        real = self.fake.upload

        def racing(*args, **kwargs):
            MailDraft.objects.filter(pk=draft["id"]).update(
                status="open", updated_at=timezone.now()
            )
            return real(*args, **kwargs)

        with patch("services.mail.providers.google.http_upload", racing):
            response = self.send(draft["id"])
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "SEND_SUPERSEDED", "detail": "This reply already went out."}),
        )
        self.assertEqual(self.stored(draft["id"]).status, "open")
        self.assertEqual(MailMessage.objects.get(pk=draft["message_id"]).label_ids, ["DRAFT"])
        self.assertEqual(Email.objects.filter(direction="sent").count(), 1)
        self.assertTrue(AuditEvent.objects.filter(action="mailbox.reply").exists())

    def test_a_linked_agent_draft_is_sent_with_it(self):
        draft = self.new_draft()
        reply = ReplyDraft.objects.create(
            organisation=self.org,
            owner=self.dana,
            channel="email",
            customer=self.pizza,
            email=self.filed,
            to=[["Ann Lee", "ann@pizzahut.com"]],
            subject="Re: Renewal quote",
            body="Hi Ann",
            written_body="Hi Ann",
            agent="cs",
        )
        MailDraft.objects.filter(pk=draft["id"]).update(reply_draft=reply)
        response = self.send(draft["id"])
        self.assertEqual(response.status_code, 200, response.data)
        reply.refresh_from_db()
        self.assertEqual(
            (reply.status, reply.sent_by, reply.sent_email_id),
            ("sent", self.dana, response.data["email"]["id"]),
        )
        event = AuditEvent.objects.get(action="reply_draft.sent")
        self.assertEqual(event.metadata, {"email": response.data["email"]["id"]})

    def test_the_claim_stays_within_ten_queries(self):
        draft = self.new_draft()
        found = MailDraft.objects.get(pk=draft["id"])
        with CaptureQueriesContext(db) as queries:
            claimed_at, fresh = draft_send._claim(self.dana, found)
        self.assertIsNotNone(claimed_at)
        self.assertLessEqual(len(queries), 10)

    def test_the_mime_matches_the_draft(self):
        draft = self.new_draft(
            to=["Ann Lee <ann@pizzahut.com>"], cc=["sam@pizzahut.com"], bcc=["carl@acme.io"]
        )
        self.send(draft["id"])
        raw_message = self.last_upload()[2]
        parsed = email.message_from_bytes(raw_message.as_bytes(), policy=policy.default)
        self.assertEqual(parsed["Cc"].addresses[0].addr_spec, "sam@pizzahut.com")
        self.assertEqual(parsed["Bcc"].addresses[0].addr_spec, "carl@acme.io")
        self.assertEqual(parsed.get_content_type(), "multipart/alternative")
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_send --parallel auto --noinput`
Expected: FAIL, 404 on `send/` and `ImportError: cannot import name 'draft_send'`.

- [ ] **Step 3: The sent copy and its filing**

In `services/mail/sending.py`, add to the imports `from django.core.files.base import ContentFile`, `from services.customers.models import Email`, `from . import gmail_store` (beside `attachments, mime`), and `MailMessage, mail_attachment_path` to the `.models` import; then add:

```python
def sent_copy(draft, connection, answer, *, now, take_draft_row, has_files):
    """§4 "After a 2xx" step 1 (decision 23), in the caller's transaction:
    the draft's own row becomes the sent copy; when history already stored
    the returned id, the draft's row goes and that row is used; a draft
    that moved on keeps its row and the copy is a new one. Returns the row."""
    gmail_id = str(answer.get("id") or "")[:255]
    held = (
        MailMessage.objects.select_for_update()
        .filter(connection=connection, provider_message_id=gmail_id)
        .first()
    )
    own = None
    if take_draft_row and draft.message_id:
        own = MailMessage.objects.select_for_update().filter(pk=draft.message_id).first()
    if held is not None and own is not None and held.pk != own.pk:
        own.delete()
        own = None
    row = held or own
    if row is None:
        row = MailMessage(
            connection=connection,
            owner_id=draft.owner_id,
            organisation_id=draft.organisation_id,
        )
    labels = [str(label) for label in answer.get("labelIds") or ["SENT"]]
    derived = gmail_store.derive(
        labels, from_address=connection.address, own_address=connection.address
    )
    row.provider_message_id = gmail_id
    row.thread_id = str(answer.get("threadId") or draft.thread_id)[:255]
    row.label_ids = labels
    row.folder = derived["folder"]
    row.is_read = derived["is_read"]
    row.is_starred = derived["is_starred"]
    row.is_important = derived["is_important"]
    row.state = MailMessage.State.DONE if derived["archived"] else MailMessage.State.OPEN
    row.direction = MailMessage.Direction.SENT
    row.from_name = sender_name(connection)[:150]
    row.from_address = connection.address
    row.to, row.cc, row.bcc, row.reply_to = draft.to, draft.cc, draft.bcc, []
    row.subject = draft.subject
    row.snippet = " ".join(draft.text.split())[:300]
    row.body = draft.text
    row.html_body = draft.html
    row.has_attachments = has_files
    row.sent_at = now
    row.refreshed_at = now
    row.save()
    return row


def copy_forwarded(row, parts, *, now):
    """Each forwarded file stored again on the sent copy (part_id sent:<n>),
    so the copy never needs Gmail (decision 22). No Gmail call."""
    storage = MailAttachment._meta.get_field("file").storage
    made = []
    for n, part in enumerate(parts, start=1):
        copy = MailAttachment(
            message=row,
            part_id=f"sent:{n}",
            filename=part.filename,
            mime_type=part.mime_type,
            size=part.size,
            is_inline=False,
            fetched_at=now,
        )
        copy.file.name = storage.save(
            mail_attachment_path(copy, part.filename), ContentFile(read(part))
        )
        made.append(copy)
    if made:
        MailAttachment.objects.bulk_create(made, ignore_conflicts=True)


def file_sent(connection, row, *, customer_id, account_id):
    """§4 step 3: filed on the draft's record, get_or_create on (mailbox,
    provider_message_id), so a send and a history pass never file twice.
    To + Cc, never Bcc. (None, False) without a record. Returns (Email,
    whether it was made now)."""
    if customer_id is None and account_id is None:
        return None, False
    recipients = [*row.to, *row.cc]
    name, address = (list(recipients[0]) + ["", ""])[:2] if recipients else ("", "")
    email, created = Email.objects.get_or_create(
        mailbox=connection,
        provider_message_id=row.provider_message_id,
        defaults={
            "customer_id": customer_id,
            "account_id": account_id,
            "subject": row.subject[:255],
            "sender_name": sender_name(connection)[:150],
            "recipient_name": (name or address)[:150],
            "body": row.body,
            "sent_at": row.sent_at,
            "mailbox_owner_id": connection.user_id,
            "direction": Email.Direction.SENT,
            "from_address": connection.address[:254],
            "to_addresses": [pair[1] for pair in recipients][:50],
            "thread_id": row.thread_id[:255],
            "synced_at": timezone.now(),
        },
    )
    if row.email_id != email.pk:
        MailMessage.objects.filter(pk=row.pk).update(email=email)
        row.email = email
    return email, created
```

- [ ] **Step 4: `gmail_busy`**

In `services/mail/actions.py`, add `import math` and:

```python
def gmail_busy(seconds):
    """503 GMAIL_BUSY with Retry-After (D2 §6, D3 §4 and §6)."""
    answer = error(
        "GMAIL_BUSY", "Gmail is busy. Try again in a minute.", status.HTTP_503_SERVICE_UNAVAILABLE
    )
    answer["Retry-After"] = str(max(math.ceil(seconds), 1))
    return answer
```

In `services/mail/views.py`, replace the body of `_gmail_busy` with `return actions.gmail_busy(seconds)`.

- [ ] **Step 5: The send**

Create `services/mail/draft_send.py`:

```python
"""Sending a draft (D3 contract §4 "POST mail/drafts/<id>/send/").

Sending is never retried by the outbox: drafts.send and messages.send are
not idempotent (decision 5). It runs inline, in this order: the carried
edit (kept whatever follows), the recipients, the record, the size, the
connection checks (paused included), the mailbox's backoff, every part
cached (decision 22), then the claim, committed before Gmail is called so a
draft is never sent twice. Every write after the claim is conditional on
its stamp. Gmail's refusals reopen the draft; no answer leaves it sending
for its owner to settle (confirm-sent, reopen). After a 2xx the draft's
own row becomes the sent copy and is filed (decision 23); its Message-ID
is read back, best effort (decision 24). No log line names a recipient, a
subject or a file.
"""

import http.client
import logging
from dataclasses import dataclass

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from core import audit
from services.customers.drafts import UNCONFIRMED_AFTER, stamp
from services.customers.models import Email, ReplyDraft

from . import attachments, compose, drafts, gmail_sync, outbox, sending
from .actions import error, gmail_busy, lock_connection
from .models import PENDING_DRAFT_PREFIX, MailboxConnection, MailDraft, MailMessage, MailOutbox
from .providers.base import RATE_LIMIT_REASONS, ProviderError
from .serializers import MailMessageDetailSerializer, labels_by_gmail_id

logger = logging.getLogger(__name__)
Status = MailDraft.Status
REPLIES = (MailDraft.Kind.REPLY, MailDraft.Kind.REPLY_ALL)

ADD_SOMEONE = "Add someone to send it to."
MESSAGE_TOO_LARGE = "This message is over Gmail's 25 MB limit. Remove an attachment."
DRAFT_GONE = "This draft was sent or discarded in Gmail. Check Sent before sending it again."
MAILBOX_REFUSED = "Your mailbox didn't accept the message. Try again."
SEND_UNCONFIRMED = "We couldn't confirm this was sent. Check your Sent folder."
SEND_SUPERSEDED = "This reply already went out."
NOT_UNCONFIRMED = "This draft isn't waiting for confirmation."
ATTACHMENT_GONE = "This file is no longer in Gmail."


@dataclass
class Sent:
    draft_id: int
    row: MailMessage
    email: Email | None
    #: False: the draft moved on while Gmail sent it (SEND_SUPERSEDED).
    marked: bool
    filed_now: bool


def send(request, pk, data):
    """Steps 1-12 for the caller's draft. Returns the refusing answer, or Sent."""
    user = request.user
    with transaction.atomic():
        draft = drafts.lock(user, pk)
        if draft.status != Status.OPEN:
            return error("ALREADY_SENT", drafts.ALREADY_SENT, status.HTTP_409_CONFLICT)
        if any(field in data for field in drafts.CONTENT_FIELDS):
            refused = drafts.edit(draft, data, user=user, now=timezone.now())
            if refused is not None:
                return refused
    # The edit is committed: kept whatever happens next (§4 step 3).
    return send_open(request, drafts.readable(user, pk))


def send_open(request, draft):
    """Steps 4-12 on an open draft whose edit is already committed."""
    user = request.user
    if not (draft.to or draft.cc or draft.bcc):
        return Response({"to": [ADD_SOMEONE]}, status=status.HTTP_400_BAD_REQUEST)
    record = drafts.record_of(draft)
    # SOC2:AUTH-02 filed only on a record the owner may still open
    if record is not None and compose.visible(user, record)[0] is None:
        return Response({"record": [drafts.CHOOSE_RECORD]}, status=status.HTTP_400_BAD_REQUEST)
    if drafts.total_bytes(draft) > settings.MAIL_SEND_MAX_BYTES:
        return error(
            "MESSAGE_TOO_LARGE", MESSAGE_TOO_LARGE, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        )
    connection = MailboxConnection.objects.select_related("user").get(pk=draft.connection_id)
    refused = drafts.refusal(connection, sending=True)
    if refused is not None:
        return refused
    now = timezone.now()
    if connection.backoff_until and connection.backoff_until > now:
        return gmail_busy((connection.backoff_until - now).total_seconds())
    files, related = sending.parts_of(draft)
    for part in [*files, *related]:
        if part.file:
            continue
        try:
            attachments.cache(part, attachments.fetch(part, connection), timezone.now())
        except attachments.Gone:
            return error(
                "ATTACHMENT_GONE", ATTACHMENT_GONE, status.HTTP_410_GONE, attachment_id=part.pk
            )
        except (attachments.Unavailable, attachments.Busy):
            return error(
                "ATTACHMENT_UNAVAILABLE",
                f"Couldn't get {part.filename} from Gmail. Remove it or try again.",
                status.HTTP_409_CONFLICT,
                attachment_id=part.pk,
            )
    claimed_at, claimed = _claim(user, draft)
    if claimed_at is None:
        return error("ALREADY_SENT", drafts.ALREADY_SENT, status.HTTP_409_CONFLICT)
    claimed.connection = connection
    raw = sending.build(claimed, files, related)
    session = gmail_sync.session_for(connection)
    try:
        if claimed.gmail_draft_id:
            answer = session.send_draft(claimed.gmail_draft_id, raw, claimed.thread_id)
        else:
            answer = session.send_message(raw, claimed.thread_id)
    except ProviderError as exc:
        return _refused(claimed, connection, exc, claimed_at)
    except (TimeoutError, ConnectionError, http.client.HTTPException):
        # It may have gone: left sending, never reopened here.
        return error("SEND_UNCONFIRMED", SEND_UNCONFIRMED, status.HTTP_504_GATEWAY_TIMEOUT)
    finally:
        gmail_sync.keep_credentials(connection, session)
    sent = _settle(request, claimed, connection, answer, files, claimed_at)
    _read_back(connection, session, sent.row)
    if sent.email is not None and sent.filed_now:
        from services.customers.classification import classify_records

        classify_records([sent.email], organisation=connection.organisation, user=connection.user)
    return sent


def _claim(user, draft):
    """Step 10, in one transaction under §3's locks: open → sending with the
    claim's stamp, a linked ReplyDraft alike (refused alike), and the
    draft's pending rows deleted (the send carries the content). A row in
    flight is left: its late answer meets a draft no longer open. Returns
    (stamp, the draft as locked) or (None, None)."""
    with transaction.atomic():
        fresh = drafts.lock(user, draft.pk)
        lock_connection(fresh.connection)
        claimed_at = timezone.now()
        claimed = MailDraft.objects.filter(pk=fresh.pk, status=Status.OPEN).update(
            status=Status.SENDING, updated_at=claimed_at
        )
        if not claimed:
            return None, None
        if fresh.reply_draft_id is not None and not ReplyDraft.objects.filter(
            pk=fresh.reply_draft_id, status=ReplyDraft.Status.OPEN
        ).update(status=ReplyDraft.Status.SENDING, updated_at=claimed_at):
            transaction.set_rollback(True)
            return None, None
        MailOutbox.objects.filter(draft_id=fresh.pk, status=MailOutbox.Status.PENDING).delete()
    return claimed_at, fresh


def reopen(draft, claimed_at, *, forget_gmail=False):
    """The conditional sending → open on the claim's stamp, for both linked
    rows. `forget_gmail`: Gmail no longer has the draft (DRAFT_GONE), so its
    id is cleared and the Drafts row goes back on its placeholder id."""
    now = timezone.now()
    fields = {"status": Status.OPEN, "updated_at": now}
    if forget_gmail:
        fields.update(
            gmail_draft_id="", gmail_message_id="", gmail_state=MailDraft.GmailState.LOCAL
        )
    with transaction.atomic():
        reopened = MailDraft.objects.filter(
            pk=draft.pk, status=Status.SENDING, updated_at=claimed_at
        ).update(**fields)
        if not reopened:
            return
        if forget_gmail and draft.message_id:
            MailMessage.objects.filter(pk=draft.message_id).update(
                provider_message_id=f"{PENDING_DRAFT_PREFIX}{draft.pk}"
            )
        if draft.reply_draft_id is not None:
            ReplyDraft.objects.filter(
                pk=draft.reply_draft_id, status=ReplyDraft.Status.SENDING, updated_at=claimed_at
            ).update(status=ReplyDraft.Status.OPEN, updated_at=now)


def _refused(draft, connection, exc, claimed_at):
    """§4 "Settling" for an answer that was a refusal: reopened, and the code."""
    logger.warning(
        "gmail send refused for connection %s: %s %s", connection.pk, exc.status, exc.reason
    )
    gone = bool(draft.gmail_draft_id) and exc.status == 404
    reopen(draft, claimed_at, forget_gmail=gone)
    if gone:
        return error("DRAFT_GONE", DRAFT_GONE, status.HTTP_409_CONFLICT)
    if exc.status == 413:
        return error(
            "MESSAGE_TOO_LARGE", MESSAGE_TOO_LARGE, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        )
    if exc.status == 429 or (exc.status == 403 and exc.reason in RATE_LIMIT_REASONS):
        # The mailbox's own backoff is unchanged.
        return gmail_busy(exc.retry_after or 60)
    if gmail_sync.classify_failure(exc) != "backoff":
        gmail_sync.pause_revoked(connection, exc)
    return error("MAILBOX_REFUSED", MAILBOX_REFUSED, status.HTTP_502_BAD_GATEWAY)


def _settle(request, draft, connection, answer, files, claimed_at):
    """§4 "After a 2xx", in one transaction: the sent copy, the forwarded
    copies, the filing, the draft (and a linked ReplyDraft) sent on the
    claim's stamp, and the audit, written even when the draft moved on."""
    now = timezone.now()
    with transaction.atomic():
        marked = bool(
            MailDraft.objects.filter(
                pk=draft.pk, status=Status.SENDING, updated_at=claimed_at
            ).update(status=Status.SENT, sent_at=now, updated_at=now)
        )
        row = sending.sent_copy(
            draft, connection, answer, now=now, take_draft_row=marked, has_files=bool(files)
        )
        sending.copy_forwarded(
            row, [part for part in files if part.message_id == draft.source_id], now=now
        )
        email, filed_now = sending.file_sent(
            connection, row, customer_id=draft.customer_id, account_id=draft.account_id
        )
        if marked:
            MailDraft.objects.filter(pk=draft.pk).update(message=row, sent_email=email)
            if draft.reply_draft_id is not None and ReplyDraft.objects.filter(
                pk=draft.reply_draft_id, status=ReplyDraft.Status.SENDING, updated_at=claimed_at
            ).update(
                status=ReplyDraft.Status.SENT,
                sent_at=now,
                sent_by=request.user,
                sent_email=email,
                updated_at=now,
            ):
                audit.record(  # SOC2:LOG-01
                    "reply_draft.sent",
                    request=request,
                    target=draft.reply_draft,
                    metadata={"email": email.pk if email is not None else None},
                )
        metadata = {
            "to": [address for _, address in draft.to],
            "cc": [address for _, address in draft.cc],
            "bcc_count": len(draft.bcc),
            "subject": draft.subject,
            "attachments": len(files),
            "bytes": drafts.total_of(draft, files),
        }
        # SOC2:LOG-01 mail left the building through a credential we hold
        if draft.kind in REPLIES:
            audit.record(
                "mailbox.reply", request=request, target=draft.source or row, metadata=metadata
            )
        else:
            audit.record(
                "mailbox.sent",
                request=request,
                target=row,
                metadata={
                    "kind": draft.kind,
                    **metadata,
                    "draft": draft.pk,
                    "email": email.pk if email is not None else None,
                },
            )
    return Sent(draft.pk, row, email, marked, filed_now)


def _read_back(connection, session, row):
    """Decision 24, best effort: Gmail's own Message-ID, for a later reply."""
    try:
        meta = session.metadata(row.provider_message_id, ["Message-ID"])
    except ProviderError as exc:
        logger.info("gmail message-id read failed for connection %s: %s", connection.pk, exc.status)
        return
    headers = ((meta or {}).get("payload") or {}).get("headers") or []
    value = next(
        (h.get("value", "") for h in headers if str(h.get("name", "")).lower() == "message-id"),
        "",
    )
    if value and len(value) <= 998:
        MailMessage.objects.filter(pk=row.pk, rfc_message_id="").update(rfc_message_id=value)


def answer(request, sent):
    """The 200 body: {draft, message, email}."""
    row = (
        MailMessage.objects.select_related("connection", "email__customer", "email__account")
        .prefetch_related("attachments")
        .get(pk=sent.row.pk)
    )
    context = {"labels": labels_by_gmail_id(request.user), "issues": outbox.sync_issues([row.pk])}
    email = sent.email
    return {
        "draft": drafts.payload(drafts.readable(request.user, sent.draft_id), request.user),
        "message": MailMessageDetailSerializer(row, context=context).data,
        "email": None
        if email is None
        else {
            "id": email.pk,
            "subject": email.subject,
            "sent_at": stamp(email.sent_at),
            "thread_id": email.thread_id,
        },
    }


def _settled_fields(confirm, now):
    if confirm:
        return {"status": Status.SENT, "sent_at": now}
    return {"status": Status.OPEN}


def settle_linked(reply_id, *, confirm, now):
    """A Communications confirm-sent or reopen settles the linked MailDraft
    (§4): confirm-sent deletes its Drafts row (the real sent message arrives
    by history); reopen keeps its Gmail id."""
    draft = MailDraft.objects.filter(reply_draft_id=reply_id, status=Status.SENDING).first()
    if draft is None:
        return
    MailDraft.objects.filter(pk=draft.pk, status=Status.SENDING).update(
        updated_at=now, **_settled_fields(confirm, now)
    )
    if confirm and draft.message_id:
        MailMessage.objects.filter(pk=draft.message_id).delete()


def settle_unconfirmed(request, pk, *, confirm):
    """POST .../confirm-sent/ and .../reopen/ (§4): today's rule on a
    MailDraft, through one conditional UPDATE: only `sending` claimed at
    least UNCONFIRMED_AFTER ago. A linked ReplyDraft is settled with it and
    audited as today. Returns 409 NOT_UNCONFIRMED, or None."""
    with transaction.atomic():
        draft = drafts.lock(request.user, pk)
        now = timezone.now()
        settled = MailDraft.objects.filter(
            pk=draft.pk, status=Status.SENDING, updated_at__lte=now - UNCONFIRMED_AFTER
        ).update(updated_at=now, **_settled_fields(confirm, now))
        if not settled:
            return error("NOT_UNCONFIRMED", NOT_UNCONFIRMED, status.HTTP_409_CONFLICT)
        if confirm and draft.message_id:
            MailMessage.objects.filter(pk=draft.message_id).delete()
        if draft.reply_draft_id is not None:
            fields = (
                {"status": ReplyDraft.Status.SENT, "sent_at": now, "sent_by": request.user}
                if confirm
                else {"status": ReplyDraft.Status.OPEN}
            )
            if ReplyDraft.objects.filter(
                pk=draft.reply_draft_id, status=ReplyDraft.Status.SENDING
            ).update(updated_at=now, **fields):
                audit.record(  # SOC2:LOG-01
                    "reply_draft.confirmed_sent" if confirm else "reply_draft.reopened",
                    request=request,
                    target=draft.reply_draft,
                )
    return None
```

- [ ] **Step 6: The routes**

In `services/mail/draft_views.py`, add `from . import compose, draft_send, drafts` (replacing the `compose, drafts` import), and:

```python
class MailDraftSendView(APIView):
    """POST /api/v1/mail/drafts/<id>/send/ — optional content plus `revision`,
    saved first under PATCH's rules, then sent (§4). 200 {draft, message, email}."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        data = request.data if isinstance(request.data, dict) else {}
        sent = draft_send.send(request, pk, data)
        if isinstance(sent, Response):
            return sent
        if not sent.marked:
            return drafts.error(
                "SEND_SUPERSEDED", draft_send.SEND_SUPERSEDED, status.HTTP_409_CONFLICT
            )
        return Response(draft_send.answer(request, sent))


class _MailDraftUnconfirmed(APIView):
    permission_classes = [IsAuthenticated]
    confirm = False

    def post(self, request, pk):
        refused = draft_send.settle_unconfirmed(request, pk, confirm=self.confirm)
        if refused is not None:
            return refused
        return Response(drafts.payload(drafts.readable(request.user, pk), request.user))


class MailDraftConfirmSentView(_MailDraftUnconfirmed):
    """POST .../confirm-sent/ — it went: sent, nothing filed (§4)."""

    confirm = True


class MailDraftReopenView(_MailDraftUnconfirmed):
    """POST .../reopen/ — it did not go: open again, its Gmail id kept (§4)."""

    confirm = False
```

In `services/mail/urls.py`, after the attachment routes:

```python
(
    path(
        "mail/drafts/<int:pk>/send/",
        draft_views.MailDraftSendView.as_view(),
        name="mail-draft-send",
    ),
)
(
    path(
        "mail/drafts/<int:pk>/confirm-sent/",
        draft_views.MailDraftConfirmSentView.as_view(),
        name="mail-draft-confirm-sent",
    ),
)
(
    path(
        "mail/drafts/<int:pk>/reopen/",
        draft_views.MailDraftReopenView.as_view(),
        name="mail-draft-reopen",
    ),
)
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff format services/mail/sending.py services/mail/draft_send.py services/mail/actions.py services/mail/views.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_draft_send.py
venv/bin/ruff check --fix services/mail/sending.py services/mail/draft_send.py services/mail/actions.py services/mail/views.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_draft_send.py
git add services/mail/sending.py services/mail/draft_send.py services/mail/actions.py services/mail/views.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_draft_send.py
git commit -m "$(cat <<'EOF'
feat(mail): send gmail drafts from revenact

Every part is cached and every check passed before the draft is claimed,
and the claim commits before Gmail is called. drafts.send when Gmail holds
the draft, messages.send otherwise; the draft's own row becomes the sent
copy, filed once with get_or_create, forwarded files copied, Message-ID
read back. Refusals reopen it; no answer leaves it for confirm-sent or
reopen; mailbox.reply or mailbox.sent is audited.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 12: Gmail's drafts back: the drafts.list reconcile and vanished drafts

**Files:**
- Create: `services/mail/draft_sync.py`
- Modify: `services/mail/gmail_sync.py` (mark a draft change in history, stores and the import's end; the send-as refresh marks too; the reconcile runs after the import page)
- Test: `services/mail/tests/test_draft_reconcile.py`

**Interfaces:**
- Consumes: Task 2's `GmailSession.list_drafts`; Task 7's `drafts.mirror`, `drafts.record_ids`; Task 5's `compose.suggest`, `compose.visible`; Task 11's `sending.file_sent`; Task 4's `send_as.refresh` (returns whether it ran).
- Produces:
  - `draft_sync.listed(session) -> {gmail draft id: message id}` (every page);
  - `draft_sync.reconcile(connection, session, now)` (decisions 26, 27);
  - `gmail_sync._mark_drafts(connection)`; the tick runs the reconcile when marked.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_draft_reconcile.py`:

```python
"""Gmail's drafts back into Revenact (D3 contract §5 "Incoming drafts",
decisions 8, 26, 27): a tick whose history touched a draft runs one
drafts.list (every page) after history. A Gmail draft Revenact does not know
becomes a MailDraft on its stored row (a reply when its References name a
message in its thread); a known one edited in Gmail takes Gmail's version
and a new revision, unless a Revenact edit is on its way (then ours wins);
one that vanished was sent in Gmail when its message is now SENT (or a SENT
message of the owner's is stored in its thread since), else discarded
there, and a linked ReplyDraft follows, audited `in: gmail`. A draft being
sent is never settled here. The daily send-as refresh runs it too."""

from datetime import timedelta

from django.utils import timezone

from core.models import AuditEvent
from services.customers.models import Email, ReplyDraft
from services.mail import gmail_store
from services.mail.models import MailDraft, MailMessage, MailOutbox

from .draft_fixtures import DraftFixture
from .gmail_fake import gmail_message


def mine(message_id, **fields):
    values = {
        "labels": ["DRAFT"],
        "sender": "Dana Ruiz <dana@acme.io>",
        "to": "Ann Lee <ann@pizzahut.com>",
        "subject": "Idea",
        "text": "Written in Gmail",
    }
    values.update(fields)
    return gmail_message(message_id, **values)


class AdoptTests(DraftFixture):
    def test_a_draft_written_in_gmail_appears(self):
        gmail_id = self.fake.write_draft(mine("w1"))
        self.tick()
        draft = MailDraft.objects.get(gmail_draft_id=gmail_id)
        self.assertEqual(
            (draft.kind, draft.status, draft.gmail_state, draft.revision),
            ("new", "open", "saved", 1),
        )
        self.assertEqual(draft.message.provider_message_id, "w1")
        self.assertEqual((draft.subject, draft.text), ("Idea", "Written in Gmail"))
        self.assertEqual(draft.to, [["Ann Lee", "ann@pizzahut.com"]])
        self.assertEqual((draft.customer_id, draft.record_chosen), (self.pizza.pk, False))
        listed = self.client.get("/api/v1/mail/messages/?folder=drafts").data["results"]
        self.assertEqual([item["id"] for item in listed], [draft.message_id])

    def test_a_reply_written_in_gmail_knows_its_source(self):
        gmail_id = self.fake.write_draft(
            mine(
                "w2",
                thread_id=self.quote.thread_id,
                references="<CAF=first@mail.gmail.com> <CAF=quote@mail.gmail.com>",
                subject="Re: Renewal quote",
            )
        )
        self.tick()
        draft = MailDraft.objects.get(gmail_draft_id=gmail_id)
        self.assertEqual((draft.kind, draft.source_id), ("reply", self.quote.pk))
        self.assertEqual(draft.in_reply_to, "<CAF=quote@mail.gmail.com>")

    def test_every_page_of_drafts_is_read(self):
        for n in range(3):
            self.fake.write_draft(mine(f"p{n}"))
        self.tick()
        self.assertEqual(MailDraft.objects.count(), 3)

    def test_the_daily_send_as_refresh_runs_it_for_drafts_imported_before(self):
        old = mine("imp1")
        self.fake.add(old, quietly=True)
        self.fake.drafts["r-old"] = "imp1"
        gmail_store.store_gmail(self.mailbox, old, now=self.now)
        self.mailbox.send_as_synced_at = None
        self.mailbox.save(update_fields=["send_as_synced_at"])
        self.tick()
        self.assertTrue(MailDraft.objects.filter(gmail_draft_id="r-old").exists())


class EditedInGmailTests(DraftFixture):
    def test_an_edit_in_gmail_replaces_the_content_and_bumps_the_revision(self):
        draft = self.new_draft()
        self.tick()
        gmail_id = self.stored(draft["id"]).gmail_draft_id
        self.fake.edit_draft(
            gmail_id,
            mine(
                "e2",
                subject="Re: Renewal quote",
                text="Edited in Gmail",
                thread_id=self.quote.thread_id,
            ),
        )
        self.tick()
        stored = self.stored(draft["id"])
        self.assertEqual(
            (stored.text, stored.revision, stored.gmail_message_id), ("Edited in Gmail", 2, "e2")
        )
        self.assertEqual(stored.message.provider_message_id, "e2")
        self.assertFalse(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        stale = self.patch_draft(draft["id"], {"subject": "Mine", "revision": 1})
        self.assertEqual(stale.data["code"], "DRAFT_CHANGED")

    def test_a_revenact_edit_on_its_way_wins(self):
        draft = self.new_draft()
        self.tick()
        gmail_id = self.stored(draft["id"]).gmail_draft_id
        self.patch_draft(draft["id"], {"subject": "Mine", "revision": 1})
        later = timezone.now() + timedelta(hours=1)
        MailOutbox.objects.filter(status="pending").update(next_attempt_at=later)
        self.fake.edit_draft(gmail_id, mine("e3", text="Theirs"))
        self.tick()
        stored = self.stored(draft["id"])
        self.assertEqual((stored.subject, stored.revision), ("Mine", 2))
        self.assertTrue(MailMessage.objects.filter(pk=draft["message_id"]).exists())
        MailOutbox.objects.filter(status="pending").update(next_attempt_at=timezone.now())
        self.tick()
        self.tick()
        in_gmail = self.fake.messages[self.fake.drafts[gmail_id]]
        subject = next(h["value"] for h in in_gmail["payload"]["headers"] if h["name"] == "Subject")
        self.assertEqual(subject, "Mine")
        self.assertEqual(MailMessage.objects.filter(folder="drafts").count(), 1)


class VanishedTests(DraftFixture):
    def saved(self, link=False):
        draft = self.new_draft()
        self.tick()
        if link:
            reply = ReplyDraft.objects.create(
                organisation=self.org,
                owner=self.dana,
                channel="email",
                customer=self.pizza,
                email=self.filed,
                to=[["Ann Lee", "ann@pizzahut.com"]],
                subject="Re: Renewal quote",
                body="Hi Ann",
                written_body="Hi Ann",
                agent="cs",
            )
            MailDraft.objects.filter(pk=draft["id"]).update(reply_draft=reply)
        return self.stored(draft["id"])

    def test_sent_in_gmail_settles_it_files_it_and_the_agent_draft(self):
        draft = self.saved(link=True)
        self.fake.send_in_gmail(draft.gmail_draft_id)
        self.tick()
        stored = self.stored(draft.pk)
        self.assertEqual(stored.status, "sent")
        self.assertEqual(stored.message.folder, "sent")
        filed = Email.objects.get(direction="sent")
        self.assertEqual((stored.sent_email, filed.customer), (filed, self.pizza))
        reply = ReplyDraft.objects.get()
        self.assertEqual(
            (reply.status, reply.sent_by, reply.sent_email), ("sent", self.dana, filed)
        )
        event = AuditEvent.objects.get(action="reply_draft.sent")
        self.assertEqual((event.actor, event.metadata), (None, {"email": filed.pk, "in": "gmail"}))

    def test_sent_in_gmail_under_a_new_id_is_found_in_its_thread(self):
        draft = self.saved()
        self.fake.discard_in_gmail(draft.gmail_draft_id)
        self.fake.add(
            gmail_message(
                "s9",
                labels=["SENT"],
                sender="Dana Ruiz <dana@acme.io>",
                to="ann@pizzahut.com",
                subject="Re: Renewal quote",
                thread_id=self.quote.thread_id,
            )
        )
        self.tick()
        stored = self.stored(draft.pk)
        self.assertEqual((stored.status, stored.message.provider_message_id), ("sent", "s9"))

    def test_discarded_in_gmail_both_go(self):
        draft = self.saved(link=True)
        self.fake.discard_in_gmail(draft.gmail_draft_id)
        self.tick()
        self.assertFalse(MailDraft.objects.exists())
        self.assertFalse(ReplyDraft.objects.exists())
        event = AuditEvent.objects.get(action="reply_draft.discarded")
        self.assertEqual((event.actor, event.metadata), (None, {"in": "gmail"}))

    def test_a_draft_being_sent_is_left_to_its_owner(self):
        draft = self.saved()
        MailDraft.objects.filter(pk=draft.pk).update(status="sending")
        self.fake.discard_in_gmail(draft.gmail_draft_id)
        self.tick()
        self.assertEqual(self.stored(draft.pk).status, "sending")
        self.assertTrue(MailMessage.objects.filter(pk=draft.message_id).exists())
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_reconcile --parallel auto --noinput`
Expected: FAIL: no `MailDraft` appears for a Gmail draft, and vanished drafts stay open.

- [ ] **Step 3: The reconcile**

Create `services/mail/draft_sync.py`:

```python
"""Gmail's drafts back into Revenact (D3 contract §5 "Incoming drafts",
decisions 8, 26, 27).

History names messages, not drafts, and every Gmail edit replaces a draft's
message, so drafts are mapped by drafts.list: on a tick whose history,
reconcile or import touched a draft (a DRAFT label before or after, or a
deleted id that was a draft's), on the first tick after the import, and
with every send-as refresh (plan gap 12). It runs after history, so the
rows it points at are stored. A draft with a live draft row is skipped:
Revenact's unsent edit wins, and the flush overwrites Gmail's (decision 8).
A `sending` draft is never settled here: its owner confirms or reopens it.
"""

from django.db import transaction

from core import audit
from services.customers.models import ReplyDraft

from . import compose, drafts, sending
from .models import MailDraft, MailMessage, MailOutbox

Status = MailDraft.Status
Kind = MailDraft.Kind


def listed(session):
    """{Gmail draft id: its message id}, every page of drafts.list."""
    found, page = {}, ""
    while True:
        body = session.list_drafts(page)
        for item in body.get("drafts") or []:
            draft_id = str(item.get("id") or "")
            if draft_id:
                found[draft_id] = str((item.get("message") or {}).get("id") or "")
        page = body.get("nextPageToken", "")
        if not page:
            return found


def _has_draft(row):
    try:
        return row.draft is not None
    except MailDraft.DoesNotExist:
        return False


def reconcile(connection, session, now):
    gmail = listed(session)
    known = {
        draft.gmail_draft_id: draft
        for draft in MailDraft.objects.filter(connection=connection)
        .exclude(gmail_draft_id="")
        .select_related("message", "reply_draft")
    }
    live = set(
        MailOutbox.objects.filter(
            connection=connection, op__in=MailOutbox.DRAFT_OPS, status__in=MailOutbox.LIVE
        ).values_list("draft_id", flat=True)
    )
    held = {
        row.provider_message_id: row
        for row in MailMessage.objects.filter(
            connection=connection, provider_message_id__in=[m for m in gmail.values() if m]
        ).select_related("draft")
    }
    for gmail_id, message_id in gmail.items():
        draft, row = known.get(gmail_id), held.get(message_id)
        if draft is None:
            if row is not None and not _has_draft(row):
                _adopt(connection, gmail_id, row)
        elif (
            draft.status == Status.OPEN
            and draft.pk not in live
            and row is not None
            and draft.gmail_message_id != message_id
        ):
            _take(draft, row, now)
    for gmail_id, draft in known.items():
        if gmail_id not in gmail and draft.status == Status.OPEN and draft.pk not in live:
            _vanished(connection, draft, now)


def _adopt(connection, gmail_id, row):
    """A Gmail draft Revenact does not know: an open draft on its stored row,
    a reply when its References name a held message in its thread (plan gap
    25), filed on the suggestion."""
    source = None
    references = (row.references or "").split()
    if references and row.thread_id:
        source = (
            MailMessage.objects.filter(
                connection=connection, thread_id=row.thread_id, rfc_message_id__in=references
            )
            .exclude(pk=row.pk)
            .order_by("-sent_at", "-pk")
            .first()
        )
    [record] = compose.visible(connection.user, compose.suggest(connection, [*row.to, *row.cc]))
    customer_id, account_id = drafts.record_ids(record)
    MailDraft.objects.create(
        connection=connection,
        owner_id=connection.user_id,
        organisation_id=connection.organisation_id,
        message=row,
        kind=Kind.REPLY if source is not None else Kind.NEW,
        source=source,
        thread_id=row.thread_id,
        in_reply_to=source.rfc_message_id if source is not None else "",
        references=source.references if source is not None else "",
        to=row.to,
        cc=row.cc,
        bcc=row.bcc,
        subject=row.subject,
        html=row.html_body,
        text=row.body,
        customer_id=customer_id,
        account_id=account_id,
        gmail_draft_id=gmail_id,
        gmail_message_id=row.provider_message_id,
        gmail_state=MailDraft.GmailState.SAVED,
    )


def _lock(draft):
    """The linked ReplyDraft, then the draft (§3's order); the open draft or None."""
    if draft.reply_draft_id is not None:
        list(ReplyDraft.objects.select_for_update().filter(pk=draft.reply_draft_id).values("pk"))
    return (
        MailDraft.objects.select_for_update(of=("self",))
        .select_related("reply_draft")
        .filter(pk=draft.pk, status=Status.OPEN)
        .first()
    )


def _take(draft, row, now):
    """Edited in Gmail, no Revenact edit on its way: Gmail's version is the
    draft's, at a new revision, mirrored to a linked ReplyDraft. Its
    forwarded files are Gmail's own parts now (plan gap 13)."""
    with transaction.atomic():
        fresh = _lock(draft)
        if fresh is None:
            return
        old = fresh.message_id
        fresh.message = row
        fresh.gmail_message_id = row.provider_message_id
        fresh.to, fresh.cc, fresh.bcc = row.to, row.cc, row.bcc
        fresh.subject = row.subject[:255]
        fresh.html, fresh.text = row.html_body, row.body
        fresh.references = row.references
        fresh.forwarded = []
        fresh.revision += 1
        fresh.gmail_state = MailDraft.GmailState.SAVED
        fresh.save(
            update_fields=[
                "message",
                "gmail_message_id",
                "to",
                "cc",
                "bcc",
                "subject",
                "html",
                "text",
                "references",
                "forwarded",
                "revision",
                "gmail_state",
                "updated_at",
            ]
        )
        if old and old != row.pk:
            MailMessage.objects.filter(pk=old).delete()
        drafts.mirror(fresh, now=now)


def _sent_row(connection, draft):
    """Decision 27: its last known message, now SENT; else a SENT message of
    the owner's stored in its thread since its last change."""
    if draft.gmail_message_id:
        found = MailMessage.objects.filter(
            connection=connection,
            provider_message_id=draft.gmail_message_id,
            label_ids__contains=["SENT"],
        ).first()
        if found is not None:
            return found
    if not draft.thread_id:
        return None
    return (
        MailMessage.objects.filter(
            connection=connection,
            thread_id=draft.thread_id,
            label_ids__contains=["SENT"],
            from_address__iexact=connection.address,
            synced_at__gte=draft.updated_at,
        )
        .exclude(label_ids__contains=["DRAFT"])
        .order_by("-sent_at", "-pk")
        .first()
    )


def _vanished(connection, draft, now):
    sent = _sent_row(connection, draft)
    filed = None
    with transaction.atomic():
        fresh = _lock(draft)
        if fresh is None:
            return
        reply = fresh.reply_draft
        if sent is not None:
            email, created = sending.file_sent(
                connection, sent, customer_id=fresh.customer_id, account_id=fresh.account_id
            )
            filed = email if created else None
            old = fresh.message_id
            MailDraft.objects.filter(pk=fresh.pk).update(
                status=Status.SENT, sent_at=now, message=sent, sent_email=email, updated_at=now
            )
            if old and old != sent.pk:
                MailMessage.objects.filter(pk=old).delete()
            if reply is not None:
                ReplyDraft.objects.filter(pk=reply.pk).update(
                    status=ReplyDraft.Status.SENT,
                    sent_at=now,
                    sent_by_id=connection.user_id,
                    sent_email=email,
                    updated_at=now,
                )
                audit.record(  # SOC2:LOG-01 sent from Gmail itself
                    "reply_draft.sent",
                    organisation=connection.organisation,
                    target=reply,
                    metadata={"email": email.pk if email is not None else None, "in": "gmail"},
                )
        else:
            message_id = fresh.message_id
            if reply is not None:
                audit.record(  # SOC2:LOG-01 discarded in Gmail itself
                    "reply_draft.discarded",
                    organisation=connection.organisation,
                    target=reply,
                    metadata={"in": "gmail"},
                )
                reply.delete()  # its MailDraft goes with it (CASCADE)
            else:
                fresh.delete()
            if message_id:
                MailMessage.objects.filter(pk=message_id).delete()
    if filed is not None:
        from services.customers.classification import classify_records

        classify_records([filed], organisation=connection.organisation, user=connection.user)
```

- [ ] **Step 4: The tick marks and runs it**

In `services/mail/gmail_sync.py`:
- add after `_write`:

```python
def _mark_drafts(connection):
    """This tick touched a Gmail draft: run the draft reconcile (D3 §5)."""
    connection._drafts_changed = True
```

- in `tick`'s `finally`, add `connection.__dict__.pop("_drafts_changed", None)`;
- in `_run`, change the refresh line to `if send_as.refresh(connection, session, now): _mark_drafts(connection)`, change the import to `from . import draft_sync, outbox_flush, send_as`, and after the import page block (before `_renew_watch`) add:

```python
        if getattr(connection, "_drafts_changed", False):
            draft_sync.reconcile(connection, session, now)
```

- in `_apply_history`, before the deletion block, add:

```python
    if changes.deleted and (
        MailMessage.objects.filter(
            connection=connection,
            provider_message_id__in=changes.deleted,
            label_ids__contains=["DRAFT"],
        ).exists()
        or MailDraft.objects.filter(
            connection=connection, gmail_message_id__in=changes.deleted
        ).exists()
    ):
        _mark_drafts(connection)
    if any("DRAFT" in (label_ids or []) for label_ids in changes.labels.values()):
        _mark_drafts(connection)
```

and in the loop over `changes.labels`, after `row = held.get(message_id)` is known to be a held row (right after the `if row is None: ... continue` block), add:

```python
        if "DRAFT" in (row.label_ids or []):
            _mark_drafts(connection)
```

- in `_fetch_and_store`, after `full = session.get_message(message_id)` and its `None` check, add:

```python
        if "DRAFT" in (full.get("labelIds") or []):
            _mark_drafts(connection)
```

- in `_import_page`, inside `if not token:`, add `_mark_drafts(connection)` (the first tick after the import maps Gmail's drafts).

Update the module docstring's step list: "...one page of the import, the draft reconcile when a draft changed (services/mail/draft_sync.py), and the push watch."

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK. A D1 tick test that counts every Gmail call on the import's last page now sees one `drafts.list` more; count only the calls it names.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/draft_sync.py services/mail/gmail_sync.py services/mail/tests/test_draft_reconcile.py
venv/bin/ruff check --fix services/mail/draft_sync.py services/mail/gmail_sync.py services/mail/tests/test_draft_reconcile.py
git add services/mail/draft_sync.py services/mail/gmail_sync.py services/mail/tests/test_draft_reconcile.py
git commit -m "$(cat <<'EOF'
feat(mail): map gmail's drafts back with drafts.list

A tick that touched a draft reads drafts.list after history: drafts written
in Gmail appear, ones edited there take Gmail's version at a new revision
unless a Revenact edit is on its way, and ones that vanished are settled as
sent (filed) or discarded, a linked agent draft with them. The daily
send-as refresh runs it too.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 13: Agent drafts that are Gmail drafts

**Files:**
- Modify: `services/mail/drafts.py` (`link_agent_draft`, `linked_open`, `discard_linked`, `follow_reply_edit`)
- Modify: `services/agents/actions/drafts.py` (`apply` links, `undo` discards)
- Modify: `services/customers/drafts.py` (`RELATED` joins `mail_draft`; `draft_payload` gains `mail_draft_id`)
- Modify: `services/customers/drafts_views.py` (PATCH, DELETE, send, confirm-sent and reopen act on both rows)
- Modify: `services/customers/models.py` (`ReplyDraft` docstring)
- Test: `services/customers/tests/test_linked_drafts.py`

**Interfaces:**
- Consumes: Task 6's `drafts.create`; Task 7's `commit`, `lock_rows`; Task 8's `discard`; Task 11's `draft_send.send_open`, `draft_send.settle_linked`, `Sent`; Task 4's `send_as.signature_block`, `html.paragraphs`, `html.SIGNATURE_ATTR`; `agents.tests.drafts_fixtures.draft_action`.
- Produces (in `services/mail/drafts.py`):
  - `link_agent_draft(reply, *, now) -> MailDraft | None` (decision 3);
  - `linked_open(reply) -> int | None` (the linked open MailDraft's id);
  - `discard_linked(reply, *, request, now)` (unlinks first, never audits);
  - `follow_reply_edit(reply, changed, *, now)` (decision 31);
  - `ReplyDraft` payloads gain `mail_draft_id` (the owner's only).

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_linked_drafts.py`:

```python
"""An agent draft that is also a Gmail draft (D3 contract §3 "ReplyDraft
changes", decisions 3, 4, 31): made with the applied draft when its source
is in the owner's own two-way, live, unpaused Google mailbox; only the owner
sees mail_draft_id; a Communications edit, delete, send, confirm-sent or
reopen acts on both rows; undo discards both."""

from datetime import timedelta

from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents.actions import drafts as kinds
from services.agents.tests.drafts_fixtures import draft_action
from services.customers.models import Customer, Email, ReplyDraft
from services.mail.models import MailboxConnection, MailDraft, MailOutbox
from services.mail.tests.draft_fixtures import DraftFixture

URL = "/api/v1/communications/drafts/"


class LinkedFixture(DraftFixture):
    def setUp(self):
        super().setUp()
        # The record's owner drafts it: make Dana own Pizza Hut.
        Customer.objects.filter(pk=self.pizza.pk).update(owner=self.dana)
        self.source = Email.objects.get(pk=self.filed.pk)

    def applied(self):
        action = draft_action(self.org, self.source, body="Hi Ann, yes: two years works.")
        action.after, action.result = kinds.REPLY.apply(action, self.dana)
        action.save(update_fields=["after", "result"])
        return action, ReplyDraft.objects.get(pk=action.result["draft_id"])


class LinkTests(LinkedFixture):
    def test_an_applied_draft_is_also_a_gmail_draft(self):
        _, reply = self.applied()
        linked = MailDraft.objects.get(reply_draft=reply)
        self.assertEqual(
            (linked.kind, linked.source_id, linked.customer_id, linked.record_chosen),
            ("reply", self.quote.pk, self.pizza.pk, True),
        )
        self.assertTrue(
            linked.html.startswith(
                '<p>Hi Ann, yes: two years works.</p><div data-revenact-signature="">'
            )
        )
        self.assertEqual(
            list(MailOutbox.objects.values_list("op", "status")), [("draft_create", "pending")]
        )
        reply.refresh_from_db()
        self.assertFalse(reply.edited)
        data = self.client.get(f"{URL}{reply.pk}/").data
        self.assertEqual(data["mail_draft_id"], linked.pk)
        self.client.force_authenticate(self.carl)
        self.assertIsNone(self.client.get(f"{URL}{reply.pk}/").data["mail_draft_id"])

    def test_no_gmail_draft_for_a_read_only_or_paused_mailbox(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(granted_scopes=[])
        _, reply = self.applied()
        self.assertFalse(MailDraft.objects.exists())
        self.assertIsNone(self.client.get(f"{URL}{reply.pk}/").data["mail_draft_id"])
        reply.delete()
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            granted_scopes=self.mailbox.granted_scopes
        )
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.applied()
        self.assertFalse(MailDraft.objects.exists())

    def test_undo_discards_both(self):
        action, reply = self.applied()
        kinds.REPLY.undo(action, self.dana)
        self.assertFalse(ReplyDraft.objects.exists())
        self.assertFalse(MailDraft.objects.exists())


class CommunicationsTests(LinkedFixture):
    def test_an_edit_rewrites_the_gmail_draft_keeping_the_signature(self):
        _, reply = self.applied()
        linked = MailDraft.objects.get(reply_draft=reply)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                f"{URL}{reply.pk}/",
                {"body": "Two years.\n\nThanks,\nDana\n-- \nold signature"},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["body"], "Two years.\n\nThanks,\nDana\n-- \nold signature")
        linked.refresh_from_db()
        self.assertEqual(linked.revision, 2)
        self.assertTrue(
            linked.html.startswith(
                '<p>Two years.</p><p>Thanks,<br>Dana</p><div data-revenact-signature="">'
            )
        )
        self.assertNotIn("old signature", linked.html)

    def test_a_delete_discards_the_gmail_draft(self):
        _, reply = self.applied()
        self.tick()
        linked = MailDraft.objects.get(reply_draft=reply)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(f"{URL}{reply.pk}/").status_code, 204)
        linked.refresh_from_db()
        self.assertEqual((linked.status, linked.reply_draft_id), ("discarded", None))
        self.assertEqual(
            list(MailOutbox.objects.filter(status="pending").values_list("op", flat=True)),
            ["draft_delete"],
        )
        self.assertEqual(AuditEvent.objects.filter(action="reply_draft.discarded").count(), 1)

    def test_a_send_goes_through_gmail_and_settles_both(self):
        _, reply = self.applied()
        self.tick()
        response = self.client.post(f"{URL}{reply.pk}/send/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(set(response.data), {"draft", "email"})
        self.assertEqual(response.data["draft"]["status"], "sent")
        self.assertEqual(self.fake.uploads[-1][1], "/drafts/send")
        self.assertEqual(MailDraft.objects.get(reply_draft=reply).status, "sent")
        self.assertEqual(AuditEvent.objects.filter(action="reply_draft.sent").count(), 1)
        self.assertEqual(AuditEvent.objects.filter(action="mailbox.reply").count(), 1)

    def test_confirm_sent_settles_both(self):
        _, reply = self.applied()
        old = timezone.now() - timedelta(minutes=11)
        ReplyDraft.objects.filter(pk=reply.pk).update(status="sending", updated_at=old)
        MailDraft.objects.filter(reply_draft=reply).update(status="sending", updated_at=old)
        response = self.client.post(f"{URL}{reply.pk}/confirm-sent/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(MailDraft.objects.get(reply_draft=reply).status, "sent")

    def test_reopen_settles_both(self):
        _, reply = self.applied()
        old = timezone.now() - timedelta(minutes=11)
        ReplyDraft.objects.filter(pk=reply.pk).update(status="sending", updated_at=old)
        MailDraft.objects.filter(reply_draft=reply).update(status="sending", updated_at=old)
        self.assertEqual(self.client.post(f"{URL}{reply.pk}/reopen/").status_code, 200)
        self.assertEqual(MailDraft.objects.get(reply_draft=reply).status, "open")
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_linked_drafts --parallel auto --noinput`
Expected: FAIL: no `MailDraft` is made, and `mail_draft_id` is missing from the payload.

- [ ] **Step 3: The link, the follow and the discard**

In `services/mail/drafts.py`, add `from .send_as import signature_block` to the imports, then:

```python
def link_agent_draft(reply, *, now):
    """Decision 3: an applied email draft is also a Gmail draft when its
    source is in its owner's own two-way, live, unpaused Google mailbox; its
    HTML is the text in paragraphs plus the signature, its record fixed.
    Otherwise it stays Revenact-only for life. Returns the MailDraft or None."""
    if reply.channel != ReplyDraft.Channel.EMAIL or reply.email_id is None:
        return None
    source = (
        MailMessage.objects.select_related("connection__user")
        .filter(email_id=reply.email_id, owner_id=reply.owner_id)
        .first()
    )
    connection = source.connection if source is not None else None
    if (
        connection is None
        or not connection.two_way
        or connection.status != MailboxConnection.Status.CONNECTED
        or gates.paused_reason(connection)
    ):
        return None
    record = (
        compose.Record("customer", reply.customer_id, "")
        if reply.customer_id is not None
        else compose.Record("account", reply.account_id, "")
    )
    with transaction.atomic():
        lock_rows([source.pk])
        connection = lock_connection(connection)
        return create(
            connection,
            reply.owner,
            kind=Kind.REPLY,
            source=source,
            content={
                "to": reply.to,
                "cc": [],
                "bcc": [],
                "subject": reply.subject,
                "html": html.paragraphs(reply.body) + signature_block(connection),
                "forwarded": [],
                "record": record,
            },
            now=now,
            record_chosen=True,
            reply_draft=reply,
        )


def linked_open(reply):
    """The id of the open MailDraft linked to `reply`, or None."""
    return (
        MailDraft.objects.filter(reply_draft_id=reply.pk, status=Status.OPEN)
        .values_list("pk", flat=True)
        .first()
    )


def _locked_linked(reply):
    found = list(
        MailDraft.objects.select_for_update(of=("self",))
        .select_related(*RELATED)
        .filter(reply_draft_id=reply.pk, status=Status.OPEN)
    )
    for draft in found:
        lock_rows([draft.message_id, draft.source_id])
        lock_connection(draft.connection)
    return found


def discard_linked(reply, *, request, now):
    """A Communications DELETE or an undo of a linked draft: the MailDraft is
    discarded (and unlinked, so the ReplyDraft's deletion never cascades to
    it); the caller deletes and audits the ReplyDraft. The caller holds the
    ReplyDraft's lock (§3 lock 1)."""
    found = _locked_linked(reply)
    if found:
        discard(found, request=request, now=now, reply_drafts=False)


def follow_reply_edit(reply, changed, *, now):
    """Decision 31: a Communications edit (`changed` holds body and/or
    subject) rewrites the linked open MailDraft: the subject, and the HTML
    from the text in paragraphs with the signature block kept. Whatever
    follows the first "-- " line is the signature text the mirror wrote and
    is dropped (plan gap 11). Not mirrored back: the text stays as typed."""
    found = _locked_linked(reply)
    if not found:
        return
    draft = found[0]
    fields = set()
    if "subject" in changed and draft.subject != reply.subject:
        draft.subject = reply.subject
        fields.add("subject")
    if "body" in changed:
        text = reply.body.split("\n-- \n", 1)[0]
        if text.startswith("-- \n"):
            text = ""
        keep = signature_block(draft.connection) if html.SIGNATURE_ATTR in draft.html else ""
        markup = html.clean(html.paragraphs(text) + keep)
        if markup != draft.html:
            draft.html, draft.text = markup, html.to_text(markup)
            fields |= {"html", "text"}
    commit(draft, fields, now=now, mirror_back=False)
```

- [ ] **Step 4: The agent's apply and undo**

In `services/agents/actions/drafts.py`, add `from django.utils import timezone` and `from services.mail import drafts as mail_drafts` to the imports. In `apply`, after `_tell(draft, action, actor, record)`, add:

```python
    if draft.channel == ReplyDraft.Channel.EMAIL:
        # Decision 3: also a Gmail draft when the owner's mailbox is two-way and live.
        mail_drafts.link_agent_draft(draft, now=timezone.now())
```

In `undo`, replace `draft.delete()` with:

```python
    # A linked Gmail draft is discarded too (D3 §3).
    mail_drafts.discard_linked(draft, request=None, now=timezone.now())
    draft.delete()
```

- [ ] **Step 5: `mail_draft_id` on the ReplyDraft payload**

In `services/customers/drafts.py`, change `RELATED` to `("customer", "account", "email", "ticket__connector", "owner", "sent_by", "mail_draft")`, and add:

```python
def _mail_draft_id(draft, reader):
    """The linked Gmail draft (D3 decision 4): its owner's alone."""
    # SOC2:AUTH-02 another reader never learns of the owner's Gmail draft
    if draft.owner_id != reader.pk:
        return None
    try:
        return draft.mail_draft.pk
    except ObjectDoesNotExist:
        return None
```

(import `from django.core.exceptions import ObjectDoesNotExist`), and add `"mail_draft_id": _mail_draft_id(draft, reader),` to `draft_payload`'s dict after `"agent_action_id"`.

In `services/customers/models.py`, replace the `ReplyDraft` docstring's sentence "No provider can hold a draft, so it lives here." with: "It lives here; when its source is in its owner's own two-way Gmail, a linked `mail.MailDraft` is the same message as a Gmail draft (D3 decision 3), the owner's alone, and every write updates both."

- [ ] **Step 6: The Communications routes act on both rows**

In `services/customers/drafts_views.py`, add `from services.mail import draft_send` and `from services.mail import drafts as mail_drafts` to the imports (beside `gates, gmail_sync`).

In `DraftDetailView.patch`, after `_audit(request, "reply_draft.edited", draft, fields=changed)`, add:

```python
                mail_drafts.follow_reply_edit(draft, changed, now=timezone.now())
```

In `DraftDetailView.delete`, before `draft.delete()`, add:

```python
            mail_drafts.discard_linked(draft, request=request, now=timezone.now())
```

Replace `DraftSendView.post` with:

```python
def post(self, request, pk):
    data = request.data if request.data else {}
    with transaction.atomic():
        draft = _readable(request, pk, lock=True)
        refused = self._refused(request, draft)
        if refused is not None:
            return refused
        changed = apply_edits(draft, clean_edits(draft, data))
        if changed:
            _audit(request, "reply_draft.edited", draft, fields=changed)
            mail_drafts.follow_reply_edit(draft, changed, now=timezone.now())
        linked = mail_drafts.linked_open(draft)
        if linked is None:
            connection = MailboxConnection.objects.filter(user_id=request.user.pk).first()
            # A paused Gmail never sends, and the draft is never claimed
            # (decision 24); token_revoked answers this too, not NO_MAILBOX.
            refused = gates.paused_response(connection) if connection is not None else None
            if refused is not None:
                return refused
            if connection is None or connection.status != MailboxConnection.Status.CONNECTED:
                # The edit is kept: it commits with this block.
                return _code("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
            # The claim, committed before the provider is called: a second
            # Send, or a retry after a failure, finds it taken and never
            # sends it again. Every later write is conditional on its stamp.
            claimed_at = timezone.now()
            claimed = ReplyDraft.objects.filter(pk=draft.pk, status=ReplyDraft.Status.OPEN).update(
                status=ReplyDraft.Status.SENDING, updated_at=claimed_at
            )
            if not claimed:
                return _code("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
    if linked is not None:
        return self._send_linked(request, pk, linked)
    return self._send(request, pk, draft, connection, claimed_at)


def _send_linked(self, request, pk, linked):
    """D3 §3: a linked draft goes through the Gmail path (the draft's own
    send, which claims and settles both rows); the answer keeps this
    route's {draft, email} shape."""
    sent = draft_send.send_open(request, mail_drafts.readable(request.user, linked))
    if isinstance(sent, Response):
        return sent
    if not sent.marked:
        return _code("SEND_SUPERSEDED", SEND_SUPERSEDED, status.HTTP_409_CONFLICT)
    email = sent.email
    return Response(
        {
            "draft": draft_payload(_readable(request, pk), request.user),
            "email": None
            if email is None
            else {
                "id": email.pk,
                "subject": email.subject,
                "sent_at": stamp(email.sent_at),
                "thread_id": email.thread_id,
            },
        }
    )
```

and move the rest of today's `post` (from `to = [address for _, address in draft.to]` to the final `return Response(...)`) unchanged into:

```python
    def _send(self, request, pk, draft, connection, claimed_at):
        """Today's path for an unlinked draft, after its claim."""
        to = [address for _, address in draft.to]
        ...
```

keeping every line of it as it is (the `...` here stands for today's code, moved without change; Task 3 already gave its `mailbox.reply` the four new keys).

In `_Unconfirmed`, add a class attribute `confirm = False` (`True` on `DraftConfirmSentView`), and inside `post`'s transaction, after `draft.refresh_from_db()`, add:

```python
            # A linked Gmail draft is settled with it (D3 §4).
            draft_send.settle_linked(draft.pk, confirm=self.confirm, now=now)
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.customers services.agents services.mail --parallel auto --noinput`
Expected: OK. A customers test that compares a ReplyDraft payload's keys exactly now sees `mail_draft_id` (`None` there): add it to the expectation.

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff format services/mail/drafts.py services/agents/actions/drafts.py services/customers/drafts.py services/customers/drafts_views.py services/customers/models.py services/customers/tests/test_linked_drafts.py
venv/bin/ruff check --fix services/mail/drafts.py services/agents/actions/drafts.py services/customers/drafts.py services/customers/drafts_views.py services/customers/models.py services/customers/tests/test_linked_drafts.py
git add services/mail/drafts.py services/agents/actions/drafts.py services/customers/drafts.py services/customers/drafts_views.py services/customers/models.py services/customers/tests/test_linked_drafts.py
git commit -m "$(cat <<'EOF'
feat(mail): make agent email drafts gmail drafts too

An applied draft.reply whose source is in its owner's two-way, live Gmail
is also a Gmail draft, the same message seen twice: Communications edits,
deletes, sends and settles act on both rows, undo discards both, and only
the owner sees mail_draft_id. Approvers still read only the ReplyDraft.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 14: `draft` on message rows, and D2's actions skip drafts

**Files:**
- Modify: `services/mail/serializers.py` (`draft_of`; `draft` on `MailMessageSerializer`)
- Modify: `services/mail/threads.py` (thread rows' `draft`; the thread detail joins it)
- Modify: `services/mail/views.py` (`_own_messages` and the thread list join `draft__reply_draft`; thread PATCH and bulk leave drafts out)
- Modify: `services/mail/actions.py` (`lockable` annotates `is_draft`; `change` refuses a draft's message)
- Test: `services/mail/tests/test_draft_rows.py`

**Interfaces:**
- Consumes: Task 1's `MailDraft.LIVE`, `related_name="draft"`; Task 5's `actions.IS_DRAFT`.
- Produces:
  - `serializers.draft_of(message) -> {"id", "agent", "reply_draft_id"} | None`;
  - every message row (list, detail, thread detail's messages) and every thread row carries `draft`;
  - `actions.lockable(user)` rows carry `is_draft`; `actions.drafts_refused(messages) -> Response | None`;
  - D2 decision 9 amended (D3 decision 13): thread expansion leaves drafts out; a message PATCH or `message_ids` naming a draft's message is `409 IS_DRAFT`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_draft_rows.py`:

```python
"""`draft` on message and thread rows (D3 contract §2), joined at no extra
query; D2's actions skip drafts (decision 13): thread expansion leaves a
live draft's message out, and a message PATCH or a bulk message_ids naming
one is 409 IS_DRAFT. Outlook and IMAP rows carry draft: null."""

from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from services.customers.models import ReplyDraft
from services.mail.models import MailDraft, MailMessage, MailOutbox

from .draft_fixtures import URL, DraftFixture

IS_DRAFT = {"code": "IS_DRAFT", "detail": "This message is a draft."}


class RowTests(DraftFixture):
    def test_a_drafts_row_names_its_draft_everywhere(self):
        draft = self.new_draft()
        expected = {"id": draft["id"], "agent": None, "reply_draft_id": None}
        listed = self.client.get(f"{URL}messages/?folder=drafts").data["results"][0]
        self.assertEqual(listed["draft"], expected)
        detail = self.client.get(f"{URL}messages/{draft['message_id']}/").data
        self.assertEqual(detail["draft"], expected)
        thread = self.client.get(f"{URL}messages/{self.quote.pk}/thread/").data
        by_id = {item["id"]: item["draft"] for item in thread["messages"]}
        self.assertEqual((by_id[draft["message_id"]], by_id[self.quote.pk]), (expected, None))
        rows = self.client.get(f"{URL}threads/?folder=drafts").data["results"]
        self.assertEqual(rows[0]["draft"], expected)

    def test_an_agent_drafts_row_names_the_agent(self):
        draft = self.new_draft()
        reply = ReplyDraft.objects.create(
            organisation=self.org,
            owner=self.dana,
            channel="email",
            customer=self.pizza,
            email=self.filed,
            to=[["Ann Lee", "ann@pizzahut.com"]],
            subject="Re: Renewal quote",
            body="Hi Ann",
            written_body="Hi Ann",
            agent="cs",
        )
        MailDraft.objects.filter(pk=draft["id"]).update(reply_draft=reply)
        listed = self.client.get(f"{URL}messages/?folder=drafts").data["results"][0]
        self.assertEqual(
            listed["draft"], {"id": draft["id"], "agent": "cs", "reply_draft_id": reply.pk}
        )

    def test_a_sent_or_discarded_draft_is_not_named(self):
        draft = self.new_draft()
        MailDraft.objects.filter(pk=draft["id"]).update(status="sent")
        detail = self.client.get(f"{URL}messages/{draft['message_id']}/").data
        self.assertIsNone(detail["draft"])

    def test_the_list_costs_no_more_with_drafts(self):
        self.client.get(f"{URL}messages/?folder=all")
        with CaptureQueriesContext(db) as before:
            self.client.get(f"{URL}messages/?folder=all")
        for _ in range(3):
            self.new_draft()
        with CaptureQueriesContext(db) as after:
            self.client.get(f"{URL}messages/?folder=all")
        self.assertEqual(len(before), len(after))


class ActionTests(DraftFixture):
    def setUp(self):
        super().setUp()
        self.draft = self.new_draft()

    def test_a_patch_on_a_drafts_message_is_refused(self):
        response = self.client.patch(
            f"{URL}messages/{self.draft['message_id']}/", {"is_read": False}, format="json"
        )
        self.assertEqual((response.status_code, response.data), (409, IS_DRAFT))
        self.assertFalse(MailOutbox.objects.exclude(op__startswith="draft_").exists())

    def test_a_thread_patch_leaves_the_draft_alone(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(
                f"{URL}messages/{self.quote.pk}/thread/", {"trashed": True}, format="json"
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(MailMessage.objects.get(pk=self.quote.pk).folder, "trash")
        self.assertEqual(MailMessage.objects.get(pk=self.draft["message_id"]).folder, "drafts")
        self.assertFalse(MailOutbox.objects.filter(message_id=self.draft["message_id"]).exists())

    def test_a_thread_of_only_drafts_is_refused(self):
        alone = self.post_draft({"kind": "new"}).data
        response = self.client.patch(
            f"{URL}messages/{alone['message_id']}/thread/", {"is_read": True}, format="json"
        )
        self.assertEqual((response.status_code, response.data), (409, IS_DRAFT))

    def test_bulk_message_ids_naming_a_draft_is_refused_and_thread_of_skips_it(self):
        response = self.client.post(
            f"{URL}actions/",
            {"op": "star", "message_ids": [self.quote.pk, self.draft["message_id"]]},
            format="json",
        )
        self.assertEqual((response.status_code, response.data), (409, IS_DRAFT))
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"{URL}actions/", {"op": "archive", "thread_of": [self.quote.pk]}, format="json"
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["messages"], 1)
        self.assertEqual(MailMessage.objects.get(pk=self.draft["message_id"]).label_ids, ["DRAFT"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_rows --parallel auto --noinput`
Expected: FAIL: `KeyError: 'draft'`, and the PATCH on a draft's message answers 200.

- [ ] **Step 3: `draft` on rows**

In `services/mail/serializers.py`, add `from django.core.exceptions import ObjectDoesNotExist` and `MailDraft` to the `.models` import, and:

```python
def draft_of(message):
    """§2's `draft` for a live draft's row ({id, agent, reply_draft_id}), else
    None. Read through a joined `draft__reply_draft` (no query)."""
    try:
        draft = message.draft
    except ObjectDoesNotExist:
        return None
    if draft is None or draft.status not in MailDraft.LIVE:
        return None
    reply = draft.reply_draft
    return {
        "id": draft.pk,
        "agent": reply.agent if reply is not None else None,
        "reply_draft_id": draft.reply_draft_id,
    }
```

In `MailMessageSerializer`, add `draft = serializers.SerializerMethodField()`, add `"draft"` to `Meta.fields` after `"sync_issue"`, and:

```python
    def get_draft(self, message):
        return draft_of(message)
```

and add to its docstring: "`draft` names the live draft a Drafts row belongs to (D3 §2)."

In `services/mail/threads.py`, import `draft_of` from `.serializers`; in `_row`, add `"draft": draft_of(anchor),` after `"sync_issue"`; in `thread_payload`'s query, change `.select_related("connection", "email__customer", "email__account")` to `.select_related("connection", "email__customer", "email__account", "draft__reply_draft")`.

In `services/mail/views.py`:
- `_own_messages`: add `"draft__reply_draft"` to its `select_related`;
- `MailThreadListView.get`: change the base queryset to `MailMessage.objects.filter(owner=request.user).select_related("draft__reply_draft")`.

- [ ] **Step 4: Actions skip drafts**

In `services/mail/actions.py`, add `from django.db.models import Exists, OuterRef, Q` (replacing the `Q` import) and `MailDraft` to the `.models` import. Change `lockable` to:

```python
def lockable(user):
    """The caller's own messages, locked for an action (check 1), each with
    `is_draft` (a live draft's row, D3 decision 13). A manager, view-all
    holder or admin finds none of someone else's: 404."""
    live = MailDraft.objects.filter(message=OuterRef("pk"), status__in=MailDraft.LIVE)
    # SOC2:AUTH-02 the person's whole mailbox is theirs alone
    return (
        MailMessage.objects.filter(owner=user)
        .annotate(is_draft=Exists(live))
        .select_related("connection__user")
        .select_for_update(of=("self",))
        .order_by("pk")
    )
```

add:

```python
def drafts_refused(messages):
    """409 IS_DRAFT when any of `messages` is a live draft's row (D3 decision
    13: drafts change through mail/drafts/, never these actions)."""
    if any(getattr(message, "is_draft", False) for message in messages):
        return error("IS_DRAFT", IS_DRAFT, status.HTTP_409_CONFLICT)
    return None


def without_drafts(messages):
    """Thread expansion leaves a live draft's row out (D3 decision 13)."""
    return [message for message in messages if not getattr(message, "is_draft", False)]
```

and in `change`, after `valid = serializer.validated_data`, add:

```python
    refused = drafts_refused(messages)
    if refused is not None:
        return refused
```

In `services/mail/views.py`:
- `MailThreadView.patch`: replace the `messages = ...` line with:

```python
messages = actions.without_drafts(actions.lockable(request.user).filter(threads.thread_q(anchor)))
if not messages:  # every message of it is a live draft's (plan gap 26)
    return actions.error("IS_DRAFT", actions.IS_DRAFT, status.HTTP_409_CONFLICT)
```

- `MailActionsView.post`: after `if valid is None: return Response(serializer.errors, ...)`, add:

```python
if threaded:
    messages = actions.without_drafts(messages)
    if not messages:
        return actions.error("IS_DRAFT", actions.IS_DRAFT, status.HTTP_409_CONFLICT)
else:
    refused = actions.drafts_refused(messages)
    if refused is not None:
        return refused
```

Update `actions.py`'s module docstring: "...Mute and unmute are Revenact's own and always pass. A live draft's row is never acted on here (D3 decision 13): thread expansion leaves it out, and naming it is 409 IS_DRAFT. Owner-only throughout."

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK. A D1/D2 test that compares a message or thread row's keys exactly now sees `draft` (`None`): add it to the expectation.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/serializers.py services/mail/threads.py services/mail/views.py services/mail/actions.py services/mail/tests/test_draft_rows.py
venv/bin/ruff check --fix services/mail/serializers.py services/mail/threads.py services/mail/views.py services/mail/actions.py services/mail/tests/test_draft_rows.py
git add services/mail/serializers.py services/mail/threads.py services/mail/views.py services/mail/actions.py services/mail/tests/test_draft_rows.py
git commit -m "$(cat <<'EOF'
feat(mail): name drafts on message rows and keep actions off them

Every message and thread row carries `draft` (its live draft, the agent
when linked), joined at no extra query. Thread actions leave a draft's row
out, and naming one in a PATCH or bulk message_ids is 409 IS_DRAFT: drafts
change only through mail/drafts/.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 15: Search older mail in Gmail

**Files:**
- Create: `services/mail/gmail_search.py`
- Modify: `services/mail/draft_views.py` (`GmailSearchView`, `GmailSearchOpenView`)
- Modify: `services/mail/urls.py`
- Test: `services/mail/tests/test_gmail_search.py`

**Interfaces:**
- Consumes: Task 2's `GmailSession.search`, `metadata`; D1's `get_message`, `gmail_store.store_gmail`, `gmail_sync._classify`; Task 11's `actions.gmail_busy`; `gates.PAUSED_MESSAGES`; `core.throttling.MailGmailSearchThrottle`.
- Produces:
  - `gmail_search.mailbox(user) -> (MailboxConnection, None) | (None, Response)`;
  - `gmail_search.search(connection, q, page_token) -> Response`;
  - `gmail_search.open_message(connection, gmail_id) -> (MailMessage, None) | (None, Response)`;
  - `GET /api/v1/mail/gmail/search/` (`mail-gmail-search`), `POST /api/v1/mail/gmail/search/open/` (`mail-gmail-search-open`).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_gmail_search.py`:

```python
"""Search older mail in Gmail (D3 contract §6, decision 28): a live
messages.list of the person's own query, spam and trash left out, chats
excluded, 20 a page with one metadata read each, held results naming their
stored copy; nothing stored until a result is opened, and opening stores
only that message (filed as any). The refusals, the pause, a lost grant,
Gmail's 400 and 429; never the query in a log; owner-only; three queries."""

import logging
from datetime import UTC, datetime, timedelta

from django.db import connection as db
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation
from services.mail.models import MailboxConnection, MailMessage

from .draft_fixtures import URL, DraftFixture
from .gmail_fake import gmail_message

SEARCH = f"{URL}gmail/search/"
OPEN = f"{URL}gmail/search/open/"


class SearchFixture(DraftFixture):
    def setUp(self):
        super().setUp()
        long_ago = datetime(2024, 9, 30, 15, 12, tzinfo=UTC)
        self.fake.add(
            gmail_message(
                "old1",
                sender="Ann Lee <ann@pizzahut.com>",
                to="Dana Ruiz <dana@acme.io>",
                subject="2024 renewal",
                text="Attached is last year's quote",
                sent_at=long_ago,
                attachments=[{"filename": "q.pdf", "mime_type": "application/pdf", "size": 9}],
            ),
            quietly=True,
        )
        self.fake.add(gmail_message("junk", subject="renewal offer", labels=["SPAM"]), quietly=True)


class SearchTests(SearchFixture):
    def test_a_page_of_results_with_what_is_already_held(self):
        response = self.client.get(f"{SEARCH}?q=renewal")
        self.assertEqual(response.status_code, 200, response.data)
        results = {item["gmail_id"]: item for item in response.data["results"]}
        self.assertEqual(set(results), {"old1", self.quote.provider_message_id})
        old = results["old1"]
        self.assertEqual(
            old,
            {
                "gmail_id": "old1",
                "thread_id": "old1",
                "subject": "2024 renewal",
                "from": {"name": "Ann Lee", "address": "ann@pizzahut.com"},
                "to": [["Dana Ruiz", "dana@acme.io"]],
                "snippet": "Attached is last year's quote",
                "sent_at": "2024-09-30T15:12:00Z",
                "has_attachments": True,
                "message_id": None,
            },
        )
        self.assertEqual(results[self.quote.provider_message_id]["message_id"], self.quote.pk)
        self.assertIsNone(response.data["next_page_token"])
        self.assertEqual(response.data["result_size_estimate"], 2)
        listed = next(query for _, where, query in self.fake.calls if where.endswith("/messages"))
        self.assertEqual(
            (listed["q"], listed["includeSpamTrash"], listed["maxResults"]),
            ("renewal -in:chats", "false", "20"),
        )
        self.assertFalse(MailMessage.objects.filter(provider_message_id="old1").exists())

    def test_the_query_checks(self):
        self.assertEqual(
            self.client.get(f"{SEARCH}?q=%20").data, {"q": ["Type something to search for."]}
        )
        self.assertEqual(
            self.client.get(f"{SEARCH}?q={'x' * 501}").data,
            {"q": ["Keep the search under 500 characters."]},
        )
        self.fake.fail(r"/messages$", 400, "invalidArgument")
        response = self.client.get(f"{SEARCH}?q=from:(")
        self.assertEqual(
            (response.status_code, response.data), (400, {"q": ["Gmail couldn't run that search."]})
        )

    def test_gmail_busy_leaves_the_backoff_alone(self):
        self.fake.fail(r"/messages$", 429, "", retry_after=30)
        response = self.client.get(f"{SEARCH}?q=renewal")
        self.assertEqual((response.status_code, response["Retry-After"]), (503, "30"))
        self.assertIsNone(MailboxConnection.objects.get(pk=self.mailbox.pk).backoff_until)

    def test_a_lost_grant_pauses_the_mailbox(self):
        self.fake.fail(r"/messages$", 403, "insufficientPermissions")
        response = self.client.get(f"{SEARCH}?q=renewal")
        self.assertEqual(
            (response.status_code, response.data["code"], response.data["paused_reason"]),
            (409, "MAILBOX_PAUSED", "token_revoked"),
        )

    def test_the_mailbox_checks(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(paused_reason="no_seat")
        response = self.client.get(f"{SEARCH}?q=renewal")
        self.assertEqual((response.status_code, response.data["code"]), (409, "MAILBOX_PAUSED"))
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            paused_reason="", backoff_until=datetime.now(UTC) + timedelta(minutes=2)
        )
        self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").status_code, 503)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            backoff_until=None, granted_scopes=["https://www.googleapis.com/auth/gmail.readonly"]
        )
        self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").status_code, 200)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").data["code"], "NO_MAILBOX")
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(provider="imap")
        self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").data["code"], "GMAIL_ONLY")

    def test_three_queries_whatever_the_page(self):
        for n in range(5):
            self.fake.add(gmail_message(f"r{n}", subject="renewal note"), quietly=True)
        self.client.get(f"{SEARCH}?q=renewal")
        with CaptureQueriesContext(db) as queries:
            self.assertEqual(self.client.get(f"{SEARCH}?q=renewal").status_code, 200)
        self.assertLessEqual(len(queries), 3)

    def test_the_query_is_never_logged(self):
        self.fake.fail(r"/messages$", 503)
        with self.assertLogs("services.mail", level="INFO") as logs:
            self.client.get(f"{SEARCH}?q=secret-codename")
            logging.getLogger("services.mail").info("marker")
        self.assertFalse(any("secret-codename" in line for line in logs.output))


class OpenTests(SearchFixture):
    def test_opening_stores_only_that_message_filed_as_any(self):
        response = self.client.post(OPEN, {"gmail_id": "old1"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        row = MailMessage.objects.get(provider_message_id="old1")
        self.assertEqual((response.data["id"], row.email.customer), (row.pk, self.pizza))
        self.assertEqual(MailMessage.objects.count(), 2)
        again = self.client.post(OPEN, {"gmail_id": "old1"}, format="json")
        self.assertEqual((again.status_code, again.data["id"]), (200, row.pk))

    def test_a_held_message_opens_the_stored_copy(self):
        response = self.client.post(
            OPEN, {"gmail_id": self.quote.provider_message_id}, format="json"
        )
        self.assertEqual((response.status_code, response.data["id"]), (200, self.quote.pk))

    def test_gone_from_gmail_and_the_body_check(self):
        response = self.client.post(OPEN, {"gmail_id": "nope"}, format="json")
        self.assertEqual(
            (response.status_code, response.data),
            (404, {"code": "NOT_IN_GMAIL", "detail": "This message is no longer in Gmail."}),
        )
        self.assertEqual(
            self.client.post(OPEN, {}, format="json").data,
            {"gmail_id": ["Choose a search result."]},
        )

    def test_another_persons_held_id_resolves_only_in_the_callers_mailbox(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=True)
        self.google(self.carl)
        self.client.force_authenticate(self.carl)
        response = self.client.post(
            OPEN, {"gmail_id": self.quote.provider_message_id}, format="json"
        )
        # Carl's own Gmail (the same fake) answers: stored in Carl's mailbox, never Dana's row.
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotEqual(response.data["id"], self.quote.pk)
        self.assertEqual(MailMessage.objects.get(pk=response.data["id"]).owner, self.carl)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_gmail_search --parallel auto --noinput`
Expected: FAIL, 404 (no route).

- [ ] **Step 3: The search**

Create `services/mail/gmail_search.py`:

```python
"""Search older mail in Gmail (D3 contract §6, decision 28).

The person's own query runs live in their Gmail (messages.list, spam and
trash left out, chats excluded), MAIL_GMAIL_SEARCH_PAGE_SIZE a page with one
format=metadata read each: about 105 of Gmail's 250 quota units a second.
Nothing is stored: a result Revenact already holds names its stored copy.
Opening a result stores only that message, filed as the sync files it
(older than 30 days: classified by the nightly pass). A read-only Google
mailbox may search. The stored pause is read (the minute sweep keeps it,
plan gap 15). The query is never logged or audited.
"""

import logging
from datetime import UTC, datetime

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from services.customers.drafts import stamp

from . import gates, gmail_store, gmail_sync
from .actions import GMAIL_ONLY, NO_MAILBOX, error, gmail_busy
from .models import MailboxConnection, MailMessage
from .providers.base import ProviderError, parse_address, parse_address_list

logger = logging.getLogger(__name__)
HEADERS = ("From", "To", "Subject", "Date")
GMAIL_REFUSED = "Gmail couldn't run that search."
NOT_IN_GMAIL = "This message is no longer in Gmail."


def mailbox(user):
    """The caller's Google mailbox, or the refusal: 400 GMAIL_ONLY, 409
    NO_MAILBOX, 409 MAILBOX_PAUSED, 503 GMAIL_BUSY (its backoff)."""
    # SOC2:AUTH-02 only the caller's own mailbox is searched
    connection = MailboxConnection.objects.filter(user=user).first()
    if connection is not None and not connection.is_google:
        return None, error("GMAIL_ONLY", GMAIL_ONLY, status.HTTP_400_BAD_REQUEST)
    if connection is None or connection.status == MailboxConnection.Status.DISCONNECTED:
        return None, error("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
    if connection.paused_reason:
        return None, _paused(connection.paused_reason)
    now = timezone.now()
    if connection.backoff_until and connection.backoff_until > now:
        return None, gmail_busy((connection.backoff_until - now).total_seconds())
    return connection, None


def _paused(reason):
    return Response(
        {
            "code": "MAILBOX_PAUSED",
            "detail": gates.PAUSED_MESSAGES[reason],
            "paused_reason": reason,
        },
        status=status.HTTP_409_CONFLICT,
    )


def _refused(connection, exc, *, bad_request):
    """Gmail's answer as §6 says: 400 (`bad_request`), a lost grant pauses
    the mailbox (409 MAILBOX_PAUSED), anything else is 503 GMAIL_BUSY with
    the mailbox's backoff unchanged. Logged without the query."""
    logger.warning(
        "gmail search failed for connection %s: %s %s", connection.pk, exc.status, exc.reason
    )
    if exc.status == 400:
        return bad_request
    if gmail_sync.classify_failure(exc) != "backoff":
        gmail_sync.pause_revoked(connection, exc)
        return _paused(MailboxConnection.PausedReason.TOKEN_REVOKED)
    return gmail_busy(exc.retry_after or 60)


def _header(payload, name):
    for header in payload.get("headers") or []:
        if str(header.get("name", "")).lower() == name.lower():
            return str(header.get("value", ""))
    return ""


def _has_file(part):
    if part.get("filename"):
        return True
    return any(_has_file(child) for child in part.get("parts") or [])


def _result(meta, held):
    payload = meta.get("payload") or {}
    name, address = parse_address(_header(payload, "From"))
    sent_at = datetime.fromtimestamp(int(meta.get("internalDate") or 0) / 1000, tz=UTC)
    return {
        "gmail_id": meta["id"],
        "thread_id": meta.get("threadId", ""),
        "subject": _header(payload, "Subject") or "(no subject)",
        "from": {"name": name, "address": address},
        "to": [[n, a] for n, a in parse_address_list(_header(payload, "To"))],
        "snippet": meta.get("snippet", ""),
        "sent_at": stamp(sent_at),
        "has_attachments": _has_file(payload),
        "message_id": held.get(meta["id"]),
    }


def search(connection, q, page_token):
    """One page of the person's query, live (§6). Nothing is stored."""
    session = gmail_sync.session_for(connection)
    bad = Response({"q": [GMAIL_REFUSED]}, status=status.HTTP_400_BAD_REQUEST)
    try:
        body = session.search(f"{q} -in:chats", page_token, settings.MAIL_GMAIL_SEARCH_PAGE_SIZE)
        metas = [
            session.metadata(stub["id"], HEADERS)
            for stub in body.get("messages") or []
            if stub.get("id")
        ]
    except ProviderError as exc:
        return _refused(connection, exc, bad_request=bad)
    finally:
        gmail_sync.keep_credentials(connection, session)
    metas = [meta for meta in metas if meta]
    # SOC2:AUTH-02 held only within the caller's own mailbox
    held = dict(
        MailMessage.objects.filter(
            connection=connection, provider_message_id__in=[meta["id"] for meta in metas]
        ).values_list("provider_message_id", "pk")
    )
    return Response(
        {
            "results": [_result(meta, held) for meta in metas],
            "next_page_token": body.get("nextPageToken") or None,
            "result_size_estimate": body.get("resultSizeEstimate", 0),
        }
    )


def open_message(connection, gmail_id):
    """§6 "open" for an id the caller's mailbox does not hold: stored (and
    filed) as the sync stores it. (row, None) or (None, the refusal)."""
    gone = error("NOT_IN_GMAIL", NOT_IN_GMAIL, status.HTTP_404_NOT_FOUND)
    session = gmail_sync.session_for(connection)
    try:
        full = session.get_message(gmail_id, "full")
    except ProviderError as exc:
        return None, _refused(connection, exc, bad_request=gone)
    finally:
        gmail_sync.keep_credentials(connection, session)
    if full is None:
        return None, gone
    now = timezone.now()
    row, filed = gmail_store.store_gmail(connection, full, now=now)
    if row is None:  # a chat
        return None, gone
    if filed is not None:
        gmail_sync._classify(connection, [filed], now=now, recent_only=True)
    return row, None
```

- [ ] **Step 4: The routes**

In `services/mail/draft_views.py`, add `from core.throttling import MailDraftUploadThrottle, MailGmailSearchThrottle` (replacing the single-throttle import), `from . import compose, draft_send, drafts, gmail_search, outbox` and `from .models import MailDraft, MailMessage` and `from .serializers import MailMessageDetailSerializer, labels_by_gmail_id`, then:

```python
def _detail(request, row):
    row = (
        MailMessage.objects.select_related(
            "connection", "email__customer", "email__account", "draft__reply_draft"
        )
        .prefetch_related("attachments")
        .get(pk=row.pk)
    )
    context = {"labels": labels_by_gmail_id(request.user), "issues": outbox.sync_issues([row.pk])}
    return MailMessageDetailSerializer(row, context=context).data


class GmailSearchView(APIView):
    """GET /api/v1/mail/gmail/search/?q=&page_token= — live, nothing stored (§6)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [MailGmailSearchThrottle]

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if not q:
            return Response(
                {"q": ["Type something to search for."]}, status=status.HTTP_400_BAD_REQUEST
            )
        if len(q) > 500:
            return Response(
                {"q": ["Keep the search under 500 characters."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        connection, refused = gmail_search.mailbox(request.user)
        if refused is not None:
            return refused
        return gmail_search.search(connection, q, request.query_params.get("page_token", ""))


class GmailSearchOpenView(APIView):
    """POST /api/v1/mail/gmail/search/open/ {gmail_id} — a held id answers
    its stored copy (200); otherwise only that message is stored (201)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [MailGmailSearchThrottle]

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        gmail_id = data.get("gmail_id")
        if not isinstance(gmail_id, str) or not gmail_id.strip() or len(gmail_id) > 255:
            return Response(
                {"gmail_id": ["Choose a search result."]}, status=status.HTTP_400_BAD_REQUEST
            )
        connection, refused = gmail_search.mailbox(request.user)
        if refused is not None:
            return refused
        # SOC2:AUTH-02 an id is resolved only within the caller's own mailbox
        held = MailMessage.objects.filter(
            connection=connection, provider_message_id=gmail_id
        ).first()
        if held is not None:
            return Response(_detail(request, held))
        row, refused = gmail_search.open_message(connection, gmail_id)
        if refused is not None:
            return refused
        return Response(_detail(request, row), status=status.HTTP_201_CREATED)
```

In `services/mail/urls.py`:

```python
(path("mail/gmail/search/", draft_views.GmailSearchView.as_view(), name="mail-gmail-search"),)
(
    path(
        "mail/gmail/search/open/",
        draft_views.GmailSearchOpenView.as_view(),
        name="mail-gmail-search-open",
    ),
)
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/gmail_search.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_gmail_search.py
venv/bin/ruff check --fix services/mail/gmail_search.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_gmail_search.py
git add services/mail/gmail_search.py services/mail/draft_views.py services/mail/urls.py services/mail/tests/test_gmail_search.py
git commit -m "$(cat <<'EOF'
feat(mail): search older mail in gmail

The person's query runs live in their Gmail, spam and trash left out, 20 a
page; results Revenact holds name their stored copy, and nothing is stored
until one is opened, when only that message is stored and filed. The query
is never logged; a lost grant pauses the mailbox; Gmail's limits answer 503
without touching the backoff.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 16: The sent-draft prune, and the whole journey end to end

**Files:**
- Modify: `services/mail/prune.py` (`prune_drafts`)
- Modify: `services/customers/management/commands/run_health_maintenance.py` (after the outbox prune)
- Test: `services/mail/tests/test_draft_prune.py`
- Create: `e2e/test_gmail_writing_flow.py`

**Interfaces:**
- Consumes: everything before; `e2e.http`; `services.mail.loop.Loop`.
- Produces: `prune.prune_drafts(*, now=None, dry_run=False) -> int`; the end-to-end test.

- [ ] **Step 1: Write the failing prune test**

Create `services/mail/tests/test_draft_prune.py`:

```python
"""Sent MailDraft rows are pruned after MAIL_DRAFT_SENT_RETENTION_DAYS (D3
contract §9); the sent message stays. Open, sending and recent drafts stay."""

from datetime import timedelta

from django.core.management import call_command
from django.utils import timezone

from services.mail.models import MailDraft, MailMessage
from services.mail.prune import prune_drafts

from .draft_fixtures import DraftFixture


class PruneTests(DraftFixture):
    def test_old_sent_drafts_go_and_their_messages_stay(self):
        old, recent, open_ = self.new_draft(), self.new_draft(), self.new_draft()
        now = timezone.now()
        MailDraft.objects.filter(pk=old["id"]).update(
            status="sent", sent_at=now - timedelta(days=8)
        )
        MailDraft.objects.filter(pk=recent["id"]).update(
            status="sent", sent_at=now - timedelta(days=6)
        )
        self.assertEqual(prune_drafts(now=now, dry_run=True), 1)
        self.assertEqual(prune_drafts(now=now), 1)
        self.assertEqual(
            set(MailDraft.objects.values_list("pk", flat=True)), {recent["id"], open_["id"]}
        )
        self.assertTrue(MailMessage.objects.filter(pk=old["message_id"]).exists())

    def test_the_nightly_job_runs_it(self):
        draft = self.new_draft()
        MailDraft.objects.filter(pk=draft["id"]).update(
            status="sent", sent_at=timezone.now() - timedelta(days=30)
        )
        call_command("run_health_maintenance", verbosity=0)
        self.assertFalse(MailDraft.objects.exists())
```

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_prune --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'prune_drafts'`.

- [ ] **Step 2: Write the prune**

In `services/mail/prune.py`, import `MailDraft` beside `MailboxConnection, MailOutbox`, add to the module docstring "A sent `MailDraft` is kept MAIL_DRAFT_SENT_RETENTION_DAYS, then `prune_drafts` deletes it; its sent message stays.", and add:

```python
def prune_drafts(*, now=None, dry_run=False):
    """Delete sent MailDraft rows past MAIL_DRAFT_SENT_RETENTION_DAYS (D3
    contract §9): the draft goes, the sent message (its own row) stays.
    Returns how many drafts it deleted, or would."""
    now = now or timezone.now()
    rows = MailDraft.objects.filter(
        status=MailDraft.Status.SENT,
        sent_at__lt=now - timedelta(days=settings.MAIL_DRAFT_SENT_RETENTION_DAYS),
    )
    if dry_run:
        return rows.count()
    # SOC2:DATA-04 a sent draft's working copy is kept a week
    return rows.delete()[1].get("mail.MailDraft", 0)
```

In `run_health_maintenance.py`, after the outbox prune's `self.stdout.write(...)`, add:

```python
        # Sent Gmail drafts once their week is up (services.mail.prune.prune_drafts). SOC2:DATA-04
        from services.mail.prune import prune_drafts

        pruned = prune_drafts(now=timezone.now(), dry_run=options["dry_run"])
        self.stdout.write(
            self.style.SUCCESS(
                f"{'would clear' if options['dry_run'] else 'cleared'} {pruned} sent mail draft(s)."
            )
        )
```

Run: `venv/bin/python manage.py test services.mail.tests.test_draft_prune --parallel auto --noinput`
Expected: OK.

- [ ] **Step 3: Write the end-to-end test**

Create `e2e/test_gmail_writing_flow.py`:

```python
"""End-to-end tier for two-way Gmail delivery 3: a real server, real HTTP
and a real test database; Gmail is the in-memory FakeGmail, patched in this
process (both transports), which the live server shares.

Dana's Gmail is imported with Ann's quote and her signature is read. She
starts a reply all from the prefill, saves it, attaches a PDF over multipart,
and the loop saves the draft in Gmail with the file. She edits it in Gmail;
the loop brings the edit back, so her editor's old revision is refused with
the newest draft. She edits from that and sends: it goes as the Gmail
draft, threaded, filed on Pizza Hut and audited. Carl, her manager, cannot
read her draft. She searches older mail in Gmail and opens a result."""

import secrets
import urllib.error
import urllib.request
from datetime import timedelta
from unittest.mock import patch

from django.test import LiveServerTestCase
from django.utils import timezone

from core.models import AuditEvent
from e2e.http import http_get, http_patch, http_post
from services.accounts.capabilities import Capability
from services.accounts.models import Organisation, Role, User
from services.billing.models import BillingAccount
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Customer, Email
from services.identity.models import OrganizationDomain
from services.mail.loop import Loop
from services.mail.models import MailboxConnection
from services.mail.tests.gmail_fake import FakeGmail, fixture, gmail_message
from services.mail.tests.gmail_fixtures import google_connection

PDF = b"%PDF-1.4 quote v2"
#: Made at import: no credential-looking literal in the code (CI's semgrep).
PASSWORD = secrets.token_urlsafe(18)


def upload(url, token, name, data, content_type):
    """One multipart POST with a `file` field, over the wire."""
    boundary = secrets.token_hex(12)
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
            f'filename="{name}"\r\nContent-Type: {content_type}\r\n\r\n'
        ).encode()
        + data
        + f"\r\n--{boundary}--\r\n".encode()
    )
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


class GmailWritingFlowTests(LiveServerTestCase):
    def tick(self):
        """Gmail changed with no push in this test: wake the mailbox, then run the loop."""
        MailboxConnection.objects.update(wake_at=timezone.now())
        Loop().run_once()

    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": PASSWORD})
        self.assertEqual(status, 200, body)
        return body["access"]

    def world(self):
        org = Organisation.objects.create(name="Acme Inc", gmail_two_way_enabled=True)
        BillingAccount.objects.filter(organisation=org).update(seats_limit=10)
        OrganizationDomain.objects.create(
            organisation=org, domain="acme.io", verification_status="verified"
        )

        def make(email, name, **fields):
            return User.objects.create_user(
                email=email, password=PASSWORD, name=name, organisation=org, **fields
            )

        alice = make("alice@acme.io", "Alice", role=User.Role.ADMIN)
        carl = make("carl@acme.io", "Carl", reports_to=alice)
        dana = make("dana@acme.io", "Dana", reports_to=carl)
        lead = Role.objects.create(
            organisation=org, name="Lead", slug="lead", permissions=[Capability.VIEW_ALL_ACCOUNTS]
        )
        User.objects.filter(pk__in=[carl.pk, dana.pk]).update(role=lead)
        pizza = Customer.objects.create(
            organisation=org, name="Pizza Hut", domain="pizzahut.com", owner=carl
        )
        google_connection(User.objects.get(pk=dana.pk))
        return pizza

    def test_full_flow(self):
        fake = FakeGmail("dana@acme.io")
        quote = fixture("message_full.json")
        quote["internalDate"] = str(int((timezone.now() - timedelta(hours=3)).timestamp() * 1000))
        fake.add(quote, quietly=True)
        fake.add(
            gmail_message(
                "old1",
                subject="2023 renewal",
                sender="Ann Lee <ann@pizzahut.com>",
                sent_at=timezone.now() - timedelta(days=700),
            ),
            quietly=True,
        )
        with (
            patch("services.mail.providers.google.http_json", fake),
            patch("services.mail.providers.google.http_upload", fake.upload),
            patch(
                "services.customers.classification.get_completion",
                side_effect=CopilotNotConfigured("no model in tests"),
            ),
        ):
            self.flow(fake, quote)

    def flow(self, fake, quote):
        pizza = self.world()
        tokens = {who: self.login(f"{who}@acme.io") for who in ("dana", "carl")}
        dana = tokens["dana"]

        # 1. The loop imports her mailbox and reads her signature.
        Loop().run_once()
        status, page = http_get(self.api("/mail/messages/"), token=dana)
        [inbox] = [item for item in page["results"] if item["subject"] == "Renewal quote"]

        # 2. Reply all from the prefill: Ann to, Sam cc, the signature above the quote.
        status, prefill = http_get(
            self.api(f"/mail/compose/?kind=reply_all&message={inbox['id']}"), token=dana
        )
        self.assertEqual(status, 200, prefill)
        self.assertEqual(prefill["to"], [["Ann Lee", "ann@pizzahut.com"]])
        self.assertEqual(prefill["cc"], [["Sam Pizza", "sam@pizzahut.com"]])
        self.assertIn("data-revenact-signature", prefill["html"])
        status, draft = http_post(
            self.api("/mail/drafts/"),
            {"kind": "reply_all", "source_message_id": inbox["id"], "html": "<p>Two years.</p>"},
            token=dana,
        )
        self.assertEqual((status, draft["revision"]), (201, 1), draft)

        # 3. A file over multipart, then the loop saves the draft in Gmail with it.
        url = self.api(f"/mail/drafts/{draft['id']}/attachments/")
        self.assertEqual(upload(url, dana, "Quote v2.pdf", PDF, "application/pdf"), 201)
        Loop().run_once()
        status, saved = http_get(self.api(f"/mail/drafts/{draft['id']}/"), token=dana)
        self.assertEqual((saved["gmail"], saved["revision"]), ({"state": "saved"}, 2))
        [gmail_id] = fake.drafts
        in_gmail = fake.messages[fake.drafts[gmail_id]]
        self.assertTrue(
            any(p.get("filename") == "Quote v2.pdf" for p in in_gmail["payload"]["parts"])
        )

        # 4. Edited in Gmail: the loop brings it back; the old revision is refused.
        fake.edit_draft(
            gmail_id,
            gmail_message(
                "edited1",
                sender="Dana Ruiz <dana@acme.io>",
                to="Ann Lee <ann@pizzahut.com>",
                cc="Sam Pizza <sam@pizzahut.com>",
                subject="Re: Renewal quote",
                text="Two years, from March.",
                thread_id=quote["threadId"],
            ),
        )
        self.tick()
        status, body = http_patch(
            self.api(f"/mail/drafts/{draft['id']}/"), {"subject": "x", "revision": 2}, token=dana
        )
        self.assertEqual((status, body["code"]), (409, "DRAFT_CHANGED"))
        newest = body["draft"]
        self.assertEqual((newest["revision"], newest["text"]), (3, "Two years, from March."))

        # 5. Carl, her manager, cannot read it.
        status, _ = http_get(self.api(f"/mail/drafts/{draft['id']}/"), token=tokens["carl"])
        self.assertEqual(status, 404)

        # 6. She sends from the newest revision: the Gmail draft goes, threaded and filed.
        status, sent = http_post(
            self.api(f"/mail/drafts/{draft['id']}/send/"),
            {"html": "<p>Two years, from March. Thanks!</p>", "revision": 3},
            token=dana,
        )
        self.assertEqual(status, 200, sent)
        self.assertEqual(fake.uploads[-1][1], "/drafts/send")
        self.assertEqual(fake.uploads[-1][2]["message"], {"threadId": quote["threadId"]})
        self.assertEqual(sent["message"]["folder"], "sent")
        filed = Email.objects.get(pk=sent["email"]["id"])
        self.assertEqual((filed.customer, filed.direction), (pizza, "sent"))
        self.assertTrue(AuditEvent.objects.filter(action="mailbox.reply").exists())
        self.tick()
        self.assertEqual(Email.objects.filter(direction="sent").count(), 1)

        # 7. Search older mail in Gmail, then open a result.
        status, found = http_get(self.api("/mail/gmail/search/?q=renewal"), token=dana)
        old = next(item for item in found["results"] if item["gmail_id"] == "old1")
        self.assertIsNone(old["message_id"])
        status, opened = http_post(
            self.api("/mail/gmail/search/open/"), {"gmail_id": "old1"}, token=dana
        )
        self.assertEqual((status, opened["subject"]), (201, "2023 renewal"))
```

- [ ] **Step 4: Run it**

Run: `venv/bin/python manage.py test e2e.test_gmail_writing_flow --noinput`
Expected: OK. If step 4's revision is not 3, print `newest`: the upload (revision 2) and the Gmail edit (revision 3) are the two changes after creation. If `old1` is imported by the loop (the import's window is 12 months; 700 days is outside it), `message_id` would not be `None`; keep the date outside 12 months.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff format services/mail/prune.py services/customers/management/commands/run_health_maintenance.py services/mail/tests/test_draft_prune.py e2e/test_gmail_writing_flow.py
venv/bin/ruff check --fix services/mail/prune.py services/customers/management/commands/run_health_maintenance.py services/mail/tests/test_draft_prune.py e2e/test_gmail_writing_flow.py
git add services/mail/prune.py services/customers/management/commands/run_health_maintenance.py services/mail/tests/test_draft_prune.py e2e/test_gmail_writing_flow.py
git commit -m "$(cat <<'EOF'
feat(mail): prune sent drafts nightly and test the writing journey

Sent MailDraft rows go after a week; their sent messages stay. The
end-to-end test drives a reply all from the prefill through an upload,
a Gmail-side edit and its revision refusal, the send and a search, over
real HTTP against the fake Gmail.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 17: Documents: API contracts, audit events, classification, product docs, SOC 2 map

**Files:**
- Modify: `docs/API_CONTRACTS.md` (the `mail` section from line 8477; the communications drafts section at line 8408)
- Modify: `docs/audit-events.md` (the `mailbox.reply` row; new `mailbox.sent`; the `reply_draft.sent` and `reply_draft.discarded` rows)
- Modify: `docs/data-classification.md` (the `ReplyDraft`, `MailboxConnection` and mail rows; a `mail.MailDraft` row)
- Modify: `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`
- Modify: `.soc2/CONTROL_MAP.md` (rows `AUTH-02`, `API-10`, `DATA-04`, `LOG-01`)

**Interfaces:**
- Consumes: the built behaviour, and contract §9's list.
- Produces: documents that describe D3 exactly. No code.

The outer fences below are `~~~~` because the text holds code blocks; copy what is between them.

- [ ] **Step 1: `docs/API_CONTRACTS.md`, the `mail` section**

In `### GET /api/v1/mail/messages/`, add to the row fields "`draft` (`{id, agent, reply_draft_id}` for a live Gmail draft's row, else null; joined, no extra query)", and the same sentence to `### GET /api/v1/mail/threads/` ("`draft`: the anchor's").

In `### GET | PATCH /api/v1/mail/messages/<id>/`, after check 1 add: "1b. A live draft's row: `409 {"code": "IS_DRAFT", "detail": "This message is a draft."}` (drafts change through `mail/drafts/`)". In `### GET | PATCH /api/v1/mail/messages/<id>/thread/` and `### POST /api/v1/mail/actions/`, add: "Thread expansion leaves a live draft's row out; `message_ids` naming one is `409 IS_DRAFT`; a thread that is only drafts is `409 IS_DRAFT`."

In `### POST /api/v1/mail/messages/<id>/reply/`, add: "On a Google mailbox the reply carries the original's Gmail `threadId` (this mailbox's message), `In-Reply-To` and `References`, and goes through Gmail's upload endpoint; `mailbox.reply` adds `cc: []`, `bcc_count: 0`, `attachments: 0`, `bytes: 0`."

Insert before `### \`POST /api/v1/mail/google/push/\` (public)`:

~~~~markdown
### Two-way Gmail (delivery 3): drafts and sending

A Gmail draft's Revenact side is a `MailDraft`, owner-only; its row in
Drafts is a `MailMessage` with the `DRAFT` label (`pending-draft:<id>`
until Gmail has made it). Drafts may be written while the mailbox is paused;
sending may not. Outlook and IMAP: every route below is
`400 {"code": "GMAIL_ONLY", "detail": "Only Gmail mailboxes have this."}`.

Connection checks, in order: `400 GMAIL_ONLY`; `409 NO_MAILBOX`
("This message's mailbox is no longer connected."); `409 TWO_WAY_OFF` with
`needs_reconnect: true`; and, for a send only, `409 MAILBOX_PAUSED`.

#### `GET /api/v1/mail/compose/?kind=new|reply|reply_all|forward&message=<id>`

The editor's prefill; nothing stored, nothing sent. `{kind, source_message_id,
from: {name, address}, to, cc, bcc, subject, html, signature_html, forwarded:
[attachment], record, suggested_record, total_bytes, max_bytes}`. A reply
goes to the original's Reply-To, else its sender (to its recipients when
the person sent it); reply all adds its To and Cc; the person's own address
goes and each address appears once, To before Cc. `Re: `/`Fwd: ` once. The
html is `<p></p>`, the signature `<div data-revenact-signature>`, then the
quote or the forward block, each wrapped in `<div class="gmail_quote">`.
`forwarded`: the original's non-inline files. `record`: a reply's filed
record, otherwise the suggestion (a contact's address, an account's domain,
an organisation's domain), only records the owner may open. `total_bytes`:
the forwarded files plus the html and its text; `max_bytes`: 26,214,400.
Errors: `400 {"kind": ["Choose new, reply, reply_all or forward."]}`,
`400 {"message": ["Choose a message to answer."]}`, 404 (not the caller's),
`409 IS_DRAFT`, the connection checks (not the pause).

#### `POST /api/v1/mail/drafts/` · `GET | PATCH | DELETE /api/v1/mail/drafts/<id>/`

POST `{kind, source_message_id, to?, cc?, bcc?, subject?, html?, forwarded?,
record?}`: the fields left out are the prefill's. 201 with the draft:

```json
{"id": 55, "kind": "reply_all", "status": "open", "sending": null, "revision": 1,
 "message_id": 9102, "thread_id": "18c2...", "source": {"message_id": 9012, "subject": "...",
 "from": {"name": "Ann Lee", "address": "ann@pizzahut.com"}, "sent_at": "..."},
 "from": {"name": "Dana Ruiz", "address": "dana@doughco.com"}, "to": [["Ann Lee", "ann@pizzahut.com"]],
 "cc": [], "bcc": [], "subject": "Re: ...", "html": "...", "text": "...",
 "attachments": [{"id": 61, "filename": "...", "mime_type": "...", "size": 1, "origin": "upload",
 "download_url": "/api/v1/mail/attachments/61/download/"}], "total_bytes": 274630,
 "max_bytes": 26214400, "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
 "suggested_record": null, "record_chosen": false, "gmail": {"state": "saving"},
 "sync_issue": null, "agent": null, "reply_draft_id": null, "created_at": "...",
 "updated_at": "...", "sent_at": null, "can_resolve": false}
```

- Recipients: `[name, address]` pairs or bare addresses, valid, lower-cased,
  each once across To, Cc, Bcc, at most 100 (`{"non_field_errors": ["A message can go to at most 100 people."]}`;
  `{"to": ["Enter a valid email address."]}`).
- `html` is sanitised (nh3); over 1 MB is `{"html": ["This message is too long."]}`; `text` is derived.
- `forwarded`: the source's files for a forward (`{"forwarded": ["Choose files from the message you are forwarding."]}`).
- `record`: `{kind, id}` or null, a record the owner may open (`{"record": ["Choose a record you can open."]}`);
  setting it sets `record_chosen`; until then a new message or forward follows the suggestion.
  A linked agent draft refuses it: `{"record": ["An agent draft stays on its record."]}`.
- PATCH: partial content plus the `revision` it was edited from
  (`{"revision": ["Send the revision you edited."]}`); a stale one is
  `409 {"code": "DRAFT_CHANGED", "detail": "This draft changed in Gmail. Here is the newest version.", "draft": {...}}`;
  `409 ALREADY_SENT` once sending or sent. A PATCH that changes nothing queues nothing; a record change alone keeps the revision.
- `gmail.state`: `local`, `saving`, `saved`, `failed` (with `sync_issue {text, at}`).
- DELETE discards the draft only (204): it leaves Drafts at once and Gmail's copy is deleted by the next tick.
- GET, PATCH, DELETE: 404 for anyone but the owner, and for a discarded draft.

#### `POST /api/v1/mail/drafts/discard/`

`{"ids": [...]}`, 1 to 100: all or nothing (404 naming none). `200 {"discarded": n}`.

#### `POST /api/v1/mail/drafts/<id>/attachments/` · `DELETE .../attachments/<attachment_id>/`

Multipart `file`, throttled 60/min per user. The Files tab's checks
(`{"file": ["Choose a file."]}`, the type list, the magic bytes, 25 MB a
file); `400 {"code": "TOO_MANY_ATTACHMENTS", "detail": "A message can carry 25 files."}`;
`413 {"code": "DRAFT_TOO_LARGE", "detail": "Attachments are limited to 25 MB in total."}`.
201 `{attachment, revision, total_bytes}`. DELETE: 200 `{revision, total_bytes}`;
an upload is deleted with its file, a forwarded file only left out.

#### `POST /api/v1/mail/drafts/<id>/send/` · `.../confirm-sent/` · `.../reopen/`

Optional content plus `revision`, saved first and kept. Then, in order:
`400 {"to": ["Add someone to send it to."]}`; `400 {"record": ["Choose a record you can open."]}`;
`413 MESSAGE_TOO_LARGE` ("This message is over Gmail's 25 MB limit. Remove an attachment.");
the connection checks with the pause; `503 GMAIL_BUSY` + `Retry-After` (backoff);
`410 ATTACHMENT_GONE` / `409 ATTACHMENT_UNAVAILABLE` + `attachment_id`
(a part not yet fetched); then the claim (`409 ALREADY_SENT`), committed before
Gmail is called: `drafts.send` when Gmail holds the draft, else `messages.send`,
both through the upload endpoint with the thread id. `200 {draft, message, email}`
(`email` null when unfiled). Gmail's answers: 404 on `drafts.send` →
`409 DRAFT_GONE` ("This draft was sent or discarded in Gmail. Check Sent before sending it again.");
429 → `503 GMAIL_BUSY`; 413 → `413 MESSAGE_TOO_LARGE`; a lost grant → paused and
`502 MAILBOX_REFUSED`; others → `502 MAILBOX_REFUSED` (all reopen the draft); no
answer → `504 SEND_UNCONFIRMED` (left sending); a success on a draft that moved on →
`409 SEND_SUPERSEDED` (still filed and audited). The draft's own row becomes the sent
copy, filed on its record (To + Cc, never Bcc), forwarded files copied, Gmail's
Message-ID read back. confirm-sent and reopen: today's rule (claimed 10 minutes ago
or more, else `409 NOT_UNCONFIRMED`).

#### `GET /api/v1/mail/gmail/search/?q=&page_token=` · `POST /api/v1/mail/gmail/search/open/`

Throttled 30/min per user (shared). Live `messages.list` (spam and trash left
out, chats excluded), 20 a page: `{results: [{gmail_id, thread_id, subject, from,
to, snippet, sent_at, has_attachments, message_id}], next_page_token,
result_size_estimate}`; `message_id` is the held copy's id or null. Nothing is
stored. Errors: `{"q": ["Type something to search for."]}`, `{"q": ["Keep the search under 500 characters."]}`,
`{"q": ["Gmail couldn't run that search."]}`, `GMAIL_ONLY`, `NO_MAILBOX`,
`MAILBOX_PAUSED`, `503 GMAIL_BUSY`. Open `{gmail_id}`: 200 the held copy's detail,
or 201 after storing only that message (filed as the sync files);
`404 {"code": "NOT_IN_GMAIL", "detail": "This message is no longer in Gmail."}`.
A read-only Google mailbox may search.

**Sync.** The tick saves draft rows after label creations and before label rows
(an update waits for a create in flight; Gmail's 404 on an update recreates the
draft; 413 fails at once; a failure keeps the writing and tells the owner once,
`mail_action_failed` linking to the draft). A tick that touched a draft runs
`drafts.list`: drafts written in Gmail appear, ones edited there replace the
content at a new revision unless a Revenact edit is on its way, and vanished ones
are settled as sent there (filed) or discarded. The send-as name and signature are
read once a day. Sent drafts are pruned after 7 days.
~~~~

- [ ] **Step 2: `docs/API_CONTRACTS.md`, the communications drafts section**

In `### /api/v1/communications/drafts/ — reply drafts`:
- add `"mail_draft_id": null,` to the JSON after `"agent_action_id": 91,`;
- replace "Recipients are fixed: `to` is the source email's sender. PATCH and send take only `body` and `subject`; anything else is ignored." with:

~~~~markdown
- `mail_draft_id`: the linked Gmail draft (`mail/drafts/<id>/`) when the draft's source is in its owner's own two-way Gmail; set for the owner only, `null` for every other reader. A linked draft is one message seen twice: PATCH, DELETE, send, confirm-sent and reopen act on both rows in one transaction; a PATCH's text rewrites the Gmail draft's HTML in paragraphs, its signature kept.
- Recipients: an unlinked draft's `to` is the source email's sender and is fixed. A linked draft's recipients follow the Gmail draft's editor (`mail/drafts/<id>/` may change To, Cc and Bcc; `to` mirrors To). PATCH and send here take only `body` and `subject`; anything else is ignored.
- A linked draft's send goes through the Gmail path and may also answer `413 MESSAGE_TOO_LARGE`, `409 DRAFT_GONE`, `503 GMAIL_BUSY` and `409 ATTACHMENT_UNAVAILABLE`; the answer stays `{draft, email}`.
~~~~

- [ ] **Step 3: `docs/audit-events.md`**

Replace the `mailbox.reply` row with:

~~~~markdown
| `mailbox.reply` | `services.mail.views.MailReplyView`, `services.customers.communications_views.EmailReplyView`, `services.customers.drafts_views.DraftSendView`, `services.mail.draft_send` (kind reply, reply_all) | user | MailMessage or Email (the one answered) | to, subject, cc, bcc_count, attachments (count), bytes (zero on the older routes); mail left through a credential we hold; written after Gmail accepted, even when the draft moved on |
| `mailbox.sent` | `services.mail.draft_send` (kind new, forward) | user | MailMessage (the sent copy) | kind, to, cc, bcc_count, subject, attachments (count), bytes, draft (id), email (filed id or null) |
~~~~

Append to the `reply_draft.sent` row's metadata: "; also the draft reconcile (`services.mail.draft_sync`) for a linked draft sent from Gmail itself, actor none, with `in: "gmail"`; and `mail/drafts/<id>/send/` for a linked draft". Append to `reply_draft.discarded`: "; also `mail/drafts/` DELETE and bulk discard of a linked draft, and the draft reconcile (actor none, `in: "gmail"`)". Person drafts, uploads, the prefill and the search are not audited.

- [ ] **Step 4: `docs/data-classification.md`**

Add after the `mail.MailMessage, ...` row:

~~~~markdown
| `mail.MailDraft` | confidential | to/cc/bcc names and addresses, subject, html and text, forwarded file ids | a Gmail draft's Revenact side, **owner-only** (a manager, view-all holder, Leadership member or admin gets 404); its Drafts row and attachments are the owner's `MailMessage`/`MailAttachment`; the outbox carries no body (the MIME is built from the draft at flush time); `sent` rows pruned after 7 days (`MAIL_DRAFT_SENT_RETENTION_DAYS`), the sent message stays. Uploads pass the Files tab's checks. Never logged; never sent to a model |
~~~~

Append to the `mail.MailboxConnection` row: "; `send_as_name` and `signature_html` (Gmail's signature, sanitised) refreshed daily". Append to the `customers.ReplyDraft` row: "A linked Gmail draft (`mail.MailDraft.reply_draft`) is the owner's alone: other readers see `mail_draft_id: null`, never its cc, bcc or attachments." Append to the mailbox sync data-flow row: "; drafts saved to and read from Gmail, and sends through Gmail's upload endpoint (TLS)".

- [ ] **Step 5: The product docs**

`docs/product/01-prd.md`: after the "Two-way Gmail, delivery 2" status row, add

~~~~markdown
| Two-way Gmail, delivery 3: writing (backend) | Built | Drafts both ways (written here or in Gmail, edits from either side with a revision guard), new, reply, reply all and forward with To/Cc/Bcc, HTML and attachments, the Gmail signature, every send threaded in Gmail (older routes too), agent email drafts that are also Gmail drafts, and searching older mail in Gmail. Outlook and IMAP unchanged |
~~~~

and at the end of the dated log: `| 2026-10-11 | Two-way Gmail delivery 3 (backend): drafts both ways, compose and send with attachments and signature, threaded sends, linked agent drafts, Gmail search |` (use the day the branch is finished if later).

`docs/product/02-trd.md`: after `## Two-way Gmail (delivery 2): actions`, add

~~~~markdown
## Two-way Gmail (delivery 3): writing

- **Drafts.** `services/mail/drafts.py`: `MailDraft` (owner-only) with a Drafts row that is a `pending-draft:` placeholder until Gmail creates it; content checked, HTML sanitised, text derived; one pending draft row per draft (no body); `revision` refuses stale editors (409 DRAFT_CHANGED).
- **The flush.** `services/mail/draft_flush.py` after label creations and before label rows: MIME built at flush time (`services/mail/mime.py`), sent through Gmail's upload endpoint (`providers/base.http_upload`); updates wait for a create in flight; a lost Gmail draft is recreated; failures keep the writing.
- **The reconcile.** `services/mail/draft_sync.py`: `drafts.list` after any draft change, the import's end and the daily send-as refresh; adopt, take Gmail's edit, settle vanished drafts (sent or discarded); a live Revenact edit wins.
- **Sending.** `services/mail/draft_send.py`: parts cached, then the claim (committed), then `drafts.send` or `messages.send`, never retried; the draft's row becomes the sent copy, filed with `get_or_create`, Message-ID read back. Every Gmail send threads (`sync.answering_headers`).
- **Search.** `services/mail/gmail_search.py`: live `messages.list`, nothing stored until opened.
- **Retention.** Sent drafts pruned after 7 days by `run_health_maintenance`.
~~~~

`docs/product/05-backend-schema.md`: in the mail table, add after the `MailOutbox` row (and add "; `draft` (draft ops), ops `draft_create`/`draft_update`/`draft_delete`, reason `too_large`, one pending row per draft" to it)

~~~~markdown
| `MailDraft` | A Gmail draft: connection, owner, organisation, `message` (the Drafts row), `kind`, `source`, `thread_id`, `in_reply_to`, `references`, `to`/`cc`/`bcc`, `subject`, `html`, `text`, `forwarded`, `customer`/`account` (at most one), `record_chosen`, `reply_draft` (linked agent draft), `gmail_draft_id` (unique per mailbox when set), `gmail_message_id`, `gmail_state`, `revision`, `status`, `sent_at`, `sent_email`, timestamps |
~~~~

add "; `send_as_name`, `signature_html`, `send_as_synced_at`" to the `MailboxConnection` row and "; `reply_to`" to the `MailMessage` row, and after `## Two-way Gmail delivery 2: migrations`, add

~~~~markdown
## Two-way Gmail delivery 3: migrations

| Migration | Change |
|---|---|
| `mail 0006_mail_drafts` | `MailDraft`; `MailOutbox.draft`, the draft ops, `too_large`, the rewritten row shape and one pending row per draft; the send-as fields; `MailMessage.reply_to` |
~~~~

`docs/product/06-implementation-plan.md`: at the end, add

~~~~markdown
## Done: Two-way Gmail delivery 3, writing (2026-10-11, backend)

- Drafts both ways with a revision guard; compose prefill; new, reply, reply all, forward with To/Cc/Bcc, HTML, attachments and the signature; send with an inline claim; threaded sends on every route.
- Agent email drafts linked to Gmail drafts; search older mail in Gmail.
- Migration `mail 0006`. No operator step: Caddy sets no request body limit (checked in revenact-infra `deploy/Caddyfile`).
- The two-way Gmail round is complete on the backend.
~~~~

- [ ] **Step 6: `.soc2/CONTROL_MAP.md`**

Append to the evidence text of each row:
- `AUTH-02`: "; D3: drafts, the prefill, uploads and the Gmail search owner-only (`services/mail/drafts.py:readable`/`lock`, `services/mail/gmail_search.py:mailbox`), a draft's record only one the owner may open (`services/mail/compose.py:visible`), a linked agent draft's `mail_draft_id` for its owner only (`services/customers/drafts.py:_mail_draft_id`)".
- `API-10`: "; files added to Gmail drafts through the same `validate_upload` (`services/mail/drafts.py:add_upload`), per-user throttle `MailDraftUploadThrottle`".
- `DATA-04`: "; sent Gmail drafts after 7 days (`services/mail/prune.py:prune_drafts`)".
- `LOG-01`: "; `mailbox.sent` and the extended `mailbox.reply` for every send through a held credential".

- [ ] **Step 7: Check and commit**

Run: `venv/bin/ruff format --check docs/ && grep -n "No provider holds it" docs/API_CONTRACTS.md`
Expected: ruff reports nothing to reformat, and `grep` prints the communications sentence; change it to "It is a Revenact row; when its source is in its owner's two-way Gmail it is also a Gmail draft (`mail_draft_id`)." and run the check again.

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md .soc2/CONTROL_MAP.md
git commit -m "$(cat <<'EOF'
docs: two-way gmail delivery 3 contracts, audit, classification and product docs

Drafts, compose, sending, the search and linked agent drafts in the API
contracts; mailbox.sent and the extended mailbox.reply; MailDraft's
classification and retention; the product docs and control evidence.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 18: Final verification

**Files:** none changed, unless a check fails. A fix then goes in its own `fix(mail): ...` commit, with the trailer.

**Interfaces:**
- Consumes: the whole branch.
- Produces: evidence that the suite, migrations, lint and CI's semgrep rules are clean, the local dev DB migrated, and the infra question answered.

- [ ] **Step 1: The whole suite, in parallel**

Run: `venv/bin/python manage.py test --parallel auto --noinput`
Expected: every test passes (skips only where they were before). Never run it serially. If a test outside `services/mail` fails, read it before changing it; the likely ones compare a message, thread or ReplyDraft payload's keys exactly (now with `draft` or `mail_draft_id`), count a tick's Gmail calls (now with `/settings/sendAs` on a first tick or `/drafts` after the import), or assert `mailbox.reply`'s metadata exactly. Fix each to the contract, never the contract to the test.

- [ ] **Step 2: The CI shard split still covers every test exactly once**

Run: `venv/bin/python scripts/ci_shard_labels.py --check 4`
Expected: exit 0. If it names the new `services/customers/tests/test_linked_drafts.py` or `e2e/test_gmail_writing_flow.py` as unassigned, add them to the shard list the script reads and commit as `chore(ci): shard the delivery 3 tests` with the trailer.

- [ ] **Step 3: Migrations are complete**

Run: `venv/bin/python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 4: Lint and format, the plan included**

Run: `venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: `All checks passed!` and nothing to reformat (the `docs/` Markdown, this plan's Python fences included). If format reports files, run `venv/bin/ruff format <those files>` and commit them as `style(mail): ruff format` with the trailer.

- [ ] **Step 5: CI's semgrep rules, locally through Docker**

Run (Docker Desktop must be running; skip this step and say so if `docker info` fails):

```bash
docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep semgrep scan --error --metrics=off \
  --config p/security-audit --config p/secrets --config p/owasp-top-ten --config p/django \
  --exclude .claude --exclude venv --exclude '**/tests/**' --exclude '**/migrations/**' --exclude e2e
```

Expected: exit 0. The places most likely to draw a finding are `providers/base.py`'s `urlopen` (it keeps its `# nosemgrep` on the one call in `_open`, host-checked by `_checked`), the `cid:` regex in `sending.py` (harmless), and the plan documents under `docs/` (no literal credentials: the e2e password is generated).

- [ ] **Step 6: The schema still builds**

Run: `venv/bin/python manage.py spectacular --file /private/tmp/claude-501/gmail-d3-schema.yml`
Expected: exit 0, and `/api/v1/mail/drafts/`, `/api/v1/mail/drafts/{pk}/send/`, `/api/v1/mail/compose/` and `/api/v1/mail/gmail/search/` appear in the file.

- [ ] **Step 7: Migrate the local dev database**

The owner approved this for the round. The database is shared with the other worktrees; the migration is additive (a new table, nullable and defaulted columns, choices, constraints).

Run: `venv/bin/python manage.py migrate --noinput`
Expected: `Applying mail.0006_mail_drafts... OK`.

Run: `venv/bin/python manage.py showmigrations mail | tail -2`
Expected: `[X] 0006_mail_drafts`.

- [ ] **Step 8: The reverse proxy's body limit (revenact-infra)**

Contract §9 asks for a body limit of about 30 MB if the proxy has one. Check:

Run: `grep -n "request_body\|max_size" /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra/deploy/Caddyfile`
Expected: no output. Caddy sets no request body limit unless a `request_body { max_size ... }` directive is configured, so a 25 MB upload plus its multipart overhead already passes: **no infra branch and no commit are made.** Report this. If the grep does print a `max_size` below `30MB`, then in `/Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra` create the branch `feat/gmail-writing-body-limit` from `main`, raise it to `30MB` inside the `@backend` handle, and commit (unpushed) as:

```bash
git -C /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra switch -c feat/gmail-writing-body-limit main
git -C /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra add deploy/Caddyfile
git -C /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra commit -m "$(cat <<'EOF'
feat(deploy): allow 30 MB request bodies for gmail draft attachments

Delivery 3 uploads a draft's file of up to 25 MB as multipart.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: The branch is what it should be**

Run: `git status --short && git log --oneline bf6fe86..HEAD`
Expected:
- a clean tree (`venv` is excluded locally, `.env` ignored);
- this plan's commit, then one commit per task 1–17 (plus any fix, style or chore commits), each ending with the `Co-Authored-By` trailer.

Nothing is pushed. Then use superpowers:finishing-a-development-branch to decide how to integrate.

---

## Self-review against the contract

| Contract | Where |
|---|---|
| Decision 1, §1 `MailDraft`, constraints, index, `__str__` | Task 1 |
| Decision 2 placeholder rows (`pending-draft:<id>`), shown in Drafts and the thread at once | Tasks 1, 6 |
| Decision 3 agent draft linked, dual writes, no backfill | Tasks 7 (mirror), 13 |
| Decision 4 approvers see only the ReplyDraft; `mail_draft_id` owner-only | Task 13 |
| Decisions 5, 6 draft ops, no `draft_send`, no body, collapse rules | Tasks 1, 6, 7, 8, 10 |
| Decision 7 flush order; label rows on a placeholder wait | Task 10 |
| Decision 8 Revenact's unsent edit wins, Gmail otherwise, `revision`, `DRAFT_CHANGED` | Tasks 7, 10, 12 |
| Decision 9 update 404 recreates; delete 404 done | Task 10 |
| Decision 10 no revert on failure, `failed`, one notice | Task 10 |
| Decisions 11, 12 discard (single, bulk), Gmail never had it | Task 8 |
| Decision 13 D2 actions skip drafts, `IS_DRAFT` | Task 14 |
| Decision 14 drafts while paused; send refused paused | Tasks 6, 7, 11 |
| Decision 15 read-only `TWO_WAY_OFF`, Outlook/IMAP `GMAIL_ONLY`, old routes unchanged | Tasks 5–11, 3 |
| Decision 16 threading on every Gmail send, chain without `threadId`, via `Email.mail_message` | Task 3 |
| Decisions 17, 18 signature placed at draft time, send-as stored, 24 h refresh, From | Tasks 4, 5, 13 |
| Decision 19 MIME (mixed, alternative, related), upload endpoint, `http_upload` | Tasks 2, 3, 10, 11 |
| Decision 20 25 MB decoded: `DRAFT_TOO_LARGE`, `MESSAGE_TOO_LARGE` | Tasks 9, 10 (413 from Gmail), 11 |
| Decision 21 uploads through `validate_upload`, 25 a draft | Task 9 |
| Decision 22 parts cached before the claim; forwarded copies `sent:<n>` | Tasks 10, 11 |
| Decision 23 sent copy reuse, held id, `get_or_create` filing | Task 11 |
| Decision 24 Message-ID read back | Task 11 |
| Decision 25 filing record, suggestion, `record_chosen`, cleared record unfiled | Tasks 5, 6, 7, 11 |
| Decision 26 `drafts.list` reconcile and its triggers | Task 12 |
| Decision 27 vanished drafts: sent there (filed) or discarded there, linked ReplyDraft, `in: gmail` | Task 12 |
| Decision 28 search: unbounded, held marks, open stores one, `includeSpamTrash=false` | Tasks 2, 15 |
| Decision 29 `mailbox.reply` / `mailbox.sent`, person drafts not audited | Tasks 3, 11 |
| Decision 30 no draft list route; `draft` on rows | Tasks 6, 14 |
| Decision 31 recipients edit follows to `ReplyDraft`; Communications text rewrites HTML | Tasks 7, 13 |
| §2 compose prefill (plus the controller's `total_bytes`/`max_bytes`; the forward block wrapped in `gmail_quote`) | Task 5 |
| §5 D1 reconcile excludes placeholders | Task 10 |
| §7 privacy tests (manager 404 on draft GET/PATCH/send/discard/upload and compose; chain approver `mail_draft_id: null`; search open resolved in the caller's mailbox) | Tasks 5, 6, 7, 8, 9, 11, 13, 15 |
| §8 query ceilings | Tasks 5 (compose 6), 6 (GET 6, POST 18), 7 (PATCH 18), 8 (discard, gap 16), 11 (claim 10), 14 (lists unchanged), 15 (search 3) |
| §9 migration, settings, documents, operator check | Tasks 1, 17, 18 |
| §10 Outlook and IMAP | Tasks 3 (IMAP `In-Reply-To`), 5–15 (`GMAIL_ONLY`, `draft: null`), 13 (`mail_draft_id: null`) |
