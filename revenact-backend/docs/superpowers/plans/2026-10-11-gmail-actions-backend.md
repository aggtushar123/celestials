# Two-way Gmail, delivery 2 ("actions"): backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** What the person does to their Gmail in Revenact reaches Gmail: read, star, archive, delete, spam and labels go through an outbox that collapses, retries, reverts and tells the owner once. Conversations, the label sidebar with unread counts, bulk actions and attachment downloads arrive with it. Outlook and IMAP keep today's local behaviour.

**Architecture:**
- **Writing the outbox.** `services/mail/outbox.py` turns an action into one `MailOutbox` row per (message, label) change, inside the request's transaction. It collapses a change that undoes a pending one, changes the row at once (labels first, then `gmail_store.derive`), and wakes the mailbox on commit.
- **Sending it.** `services/mail/outbox_flush.py` is step 1 of every Google tick, under D1's lease: label creations, then `messages.batchModify` per (add, remove) set, then trash and untrash one by one. Rows are `sending` during a call; the outcome classes, retries, revert, the hand-off to a newer row and one notice per action and reason live here.
- **Incoming changes.** `gmail_store.relabel` keeps the local presence of every label with a live row (`held`), and that row's `previous` takes Gmail's value.
- **Reading.** `services/mail/threads.py` groups mail into conversations with a window function. `services/mail/actions.py` validates and runs PATCH and bulk actions in the contract's check order. `services/mail/attachments.py` fetches a part on first open, caches it, sniffs it and serves it with the Files tab's headers.
- **Files tab.** `customers._FileListView` merges filed mail's attachments in, twice-filtered.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL (CI and prod 16, local 15; `django.contrib.postgres.indexes.GinIndex` without the app), urllib through `providers/base.http_json` (no Google SDK), `core.audit`, `services.notifications.realtime.notify`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §3 (without drafts and sending), §4's D2 parts, §5 "Deliveries 2". Read it at `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-fe/docs/superpowers/specs/2026-10-10-gmail-two-way-design.md`.

**The binding contract** is `docs/superpowers/plans/2026-10-11-gmail-actions-api.md` in this worktree (commit `6265009`). Its "Decisions made in this contract" override the spec, and every code, sentence, field, setting, ceiling and audit event in it is implemented exactly as written. Where this plan names a contract section (§3, decision 21), that is the contract's numbering. D1's contract (`docs/superpowers/plans/2026-10-10-gmail-sync-api.md`) still holds wherever D2's does not supersede it.

## Contract gaps and how this plan resolves them

The code forced each of these, and the contract does not state them. The plan implements the answer shown; the controller confirms or changes each one.

1. **The venv.** `revenact-backend/venv` has no `nh3` (D1 added it on this branch), so the suite cannot import `services.mail.html` with it. Task 1 symlinks the D1 worktree's venv (`.worktrees/gmail-be/venv`, same `requirements*.txt`) and copies `revenact-backend/.env`.
2. **An empty PATCH.** "At least one field" has no sentence. It is `400 {"non_field_errors": ["Change at least one thing."]}`. D1's test that PATCHed only unknown fields (`folder`, `is_important`) and expected 200 now expects this 400.
3. **Label list wording.** A label twice in one list is `400 {"add_labels": ["Name each label once."]}` (or `remove_labels`); in both lists, `400 {"non_field_errors": ["A label can't be added and removed at once."]}`.
4. **Bulk wording.** Both or neither of `message_ids` and `thread_of`: `400 {"non_field_errors": ["Send message_ids or thread_of, not both."]}`. A `label_id` on an op that is not a label op: `400 {"label_id": ["Only label actions take a label."]}`.
5. **GMAIL_ONLY before label validity.** Outlook and IMAP have no labels, so "Choose one of your labels." would always win over check 3. Label ids are resolved only for a Google mailbox; for the others a label field goes straight to `GMAIL_ONLY`.
6. **Label rows keep the label's name.** `label_add` and `label_remove` rows store `payload {"label": "<name>"}`, so a notice or `sync_issue` can name a label deleted since (`label_gone`).
7. **A row going back to pending while a newer pending row exists on its pair** (a recovered lease, a rate limit, the single-call cap, a counted retry) would break the partial unique constraint. The old row hands its `previous` to the newer row and is deleted. Only the contract's failure path (decision 4) also deletes the newer row when its target equals that `previous`, because only there is the old change known not to be in Gmail.
8. **Locks.** A request reads its messages and their pending rows `select_for_update`, and the revert locks the same rows. So a flush's claim (`UPDATE … WHERE status='pending'`) waits for a request's commit and never sends a row the request is collapsing.
9. **"Told once" across ticks.** One action's rows can fail in different ticks (the single-call cap). A notice is skipped when an earlier flush already failed a row with the same `action_id` and `reason`.
10. **The sent-row prune keeps what `sync_issue` needs.** A `sent` row older than 24 hours is kept while its message has a `failed` row inside the 7-day window. Otherwise a fixed issue would come back when the later row was pruned.
11. **`available` in the message detail** reads the stored `paused_reason` (the sweep keeps it within a minute). That keeps the thread detail in 7 queries. The download route itself checks the pause live (`gates.paused_reason`).
12. **Adopting a label the mirror already holds.** If, after a `409`, the adopted Gmail id is already a mirrored `MailLabel` (made in Gmail since), the Revenact-made label merges into it: keys are rewritten to that id and the made-here label is deleted.
13. **Disconnecting unwinds labels made here and never created in Gmail.** Their `pending:<id>` keys would otherwise stay on messages forever once their `label_create` rows were deleted.
14. **`POST mail/labels/` order and no mailbox.** The name checks (400) come first, then `GMAIL_ONLY` and the three 409s, then `LABEL_EXISTS`. A caller with no mailbox at all answers `409 NO_MAILBOX`, the same body as a disconnected one.
15. **"Keep the name under 225 characters."** A name longer than 225 characters (the column) is refused; 225 is accepted.
16. **The unread count** is one raw SQL statement (a constant string with one parameter, `jsonb_array_elements_text` in a lateral join), the way `services/brain/locks.py` already runs constant SQL. The ORM cannot group by a set-returning function.
17. **The thread anchor** (newest matching message per thread) is a `RowNumber()` window filtered to 1. Django 5.2 filters on windows; there is no `DISTINCT` over a join (the PG16 rule).
18. **The audit's `content_type`** is the declared MIME, which is what the Files tab shows.
19. **`MailLabel.key`** is a new property: the Gmail id, or `pending:<pk>`. Every place that looks a label up in `label_ids` uses it.
20. **Starring a conversation stars its newest message for every provider**, so Outlook and IMAP conversations behave the same in the thread route.
21. **Cached files are deleted on commit.** The `post_delete` receiver defers `storage.delete` to `transaction.on_commit`, so a rolled-back delete never loses a file.
22. **No literal password in the plan.** CI's semgrep reads `docs/`. The e2e test makes its password with `secrets.token_urlsafe`.

## Global Constraints

**Worktree and git:**
- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail2-be`, branch `feat/gmail-actions`, based on `6265009`.
- `venv` and `.env` are untracked. Never commit them.
- Always `git add <explicit paths>`. Never `git add -A` or `git add .`.
- **Never use `git stash`.**
- Do not push.

**Commands:**
- Tests: `venv/bin/python manage.py test <labels> --parallel auto --noinput`. Never run the whole suite serially.
- Migrations: `venv/bin/python manage.py makemigrations <app> --name <name>`. Tests build their own database.
- Lint: `venv/bin/ruff check .` and `venv/bin/ruff format --check .`. Ruff formats Python fences inside Markdown too, so keep every doc code block ruff-clean (line length 100).
- **Before every commit**, run `venv/bin/ruff format <the task's .py files>` and then `venv/bin/ruff check --fix <the same files>`. Some test code in this plan is not wrapped at 100 columns and some imports are not sorted; ruff fixes both. If ruff reports an unused import, delete it.

**Commit messages:** conventional (`feat(mail): ...`, `docs: ...`). Each ends with exactly this line, after a blank line:

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

**Settings** (`config/settings.py`, from the environment, defaults verbatim from contract §9):

| Setting | Default |
|---|---|
| `MAIL_OUTBOX_MAX_ATTEMPTS` | `5` |
| `MAIL_OUTBOX_RETRY_SECONDS` | `30,120,600,3600` |
| `MAIL_OUTBOX_BATCH_SIZE` | `1000` |
| `MAIL_OUTBOX_SINGLE_CALLS_PER_TICK` | `200` |
| `MAIL_OUTBOX_ISSUE_DAYS` | `7` |
| `MAIL_OUTBOX_SENT_RETENTION_HOURS` | `24` |
| `MAIL_ACTION_MAX_MESSAGES` | `1000` |
| `MAIL_THREAD_MAX_MESSAGES` | `100` |
| `MAIL_ATTACHMENT_MAX_BYTES` | `52428800` |
| `THROTTLE_MAIL_ATTACHMENT` | `120/min` (scope `mail_attachment`, per user, `None` under test) |

**Errors:**
- Mail errors use `{"code": "...", "detail": "..."}`; validation errors keep DRF's field shape.
- Every sentence is copied from the contract word for word (and gaps 2–4 for the ones it leaves out).

**Privacy:**
- Threads, thread detail, actions, labels and the outbox are owner-only: every queryset scopes on `owner=request.user` or on the caller's own connection. A manager, view-all holder, Leadership member or admin gets 404 on someone else's message or thread, `[]` for labels, 404 on bulk ids.
- Nobody but the owner sees outbox state, `sync_issue`, labels or unfiled attachments.
- Filed mail's attachments use the twice-filter: `visible_children_q` on the filed `Email` **and** `visible_emails_q`.

**No mail content in logs, notices or `error`:**
- A log line names the connection id, an HTTP status and a reason code. Never a subject, a body, a file name or an address other than the mailbox's own.
- A notice is built from the op, the reason and (for label ops) the owner's own label name.

**The engine never does a full save of a connection.** Every write to a `MailboxConnection` from the tick, the flush or a request uses `save(update_fields=[...])` or a queryset `update()`.

**Postgres 16:** never a join de-duplicated with `.distinct()`. Use `id__in` subqueries.

**The outbox's `updated_at` is `auto_now`, which a queryset `update()` does not touch.** Every `update()` that changes a row's status sets `updated_at` explicitly: the lease recovery reads it.

**SOC 2:** annotate each enforcement point:
- `# SOC2:AUTH-02` (owner-only and twice-filtered reads);
- `# SOC2:API-10` (attachment type, disposition and headers);
- `# SOC2:LOG-01` (each `audit.record`);
- `# SOC2:DATA-04` (the outbox prune).

**Tests:**
- Django's runner and `rest_framework.test.APITestCase`.
- Mail tests build on `services/mail/tests/gmail_fixtures.GmailFixture` (D1). It already patches the classifier's model call. Its users get a membership and a seat from the identity and billing signals, so a Google mailbox there is live and unpaused.
- Every test that reaches Google uses `GmailFixture.use_gmail()` (a `FakeGmail`), or patches `services.mail.providers.google.http_json`. **No test touches the network.**
- `transaction.on_commit` callbacks do not run inside `TestCase`. A test that asserts the wake or a deleted file wraps the request in `self.captureOnCommitCallbacks(execute=True)`.

**Outlook and IMAP are unchanged** apart from the shapes the contract adds (`sync_issue: null`, `GMAIL_ONLY`, the thread routes). Their PATCH stays local and stamps `locally_changed_at`.

**Docs in the same PR (Task 15):** `docs/API_CONTRACTS.md` (the `api-contracts` skill), `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`, `.soc2/CONTROL_MAP.md`, and the `MailMessage` and `gmail_store` docstrings (Tasks 4 and 9).

**Out of scope (contract §12):** drafts both ways, sending changes (threading headers, reply all, forward, CC/BCC on send, attachments on send, signatures), live Gmail search, label rename/delete/colour, Gmail's own mute, permanent delete, any Outlook or IMAP write-back, and the frontend.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `config/settings.py`, `.env.example` | modify | the 10 settings |
| `services/mail/models.py` | modify | `MailOutbox`, `MailLabel.key`, `mail_attachment_path`, `MailAttachment.fetched_at`, the GIN index, the file clean-up receiver |
| `services/mail/migrations/0005_mail_outbox.py` | create (generated) | the model, the fields, the index |
| `services/notifications/models.py`, `migrations/0012_mail_action_failed.py` | modify / create | `MAIL_ACTION_FAILED` |
| `services/mail/providers/google.py` | modify | `GmailSession.batch_modify`, `modify`, `trash`, `untrash`, `create_label`, `attachment` |
| `services/mail/tests/gmail_fake.py` | modify | the same routes in the fake, `writes`, `attach_file` |
| `services/mail/outbox.py` | create | enqueueing, collapse, re-derive, wake, label create/rewrite/unwind, sentences, `sync_issues` |
| `services/mail/gmail_store.py` | modify | `held_keys`, `relabel(..., held=)`, `store_gmail` passes it |
| `services/mail/gmail_sync.py` | modify | `ensure_claim`, `keep_credentials`, flush first in `_run`, `held` passed by history and reconcile |
| `services/mail/outbox_flush.py` | create | the flush, outcome classes, revert, hand-off, notices |
| `services/mail/serializers.py` | modify | `label_payload.pending`, `labels_by_gmail_id` pending keys, `account_of`, `sync_issue`, attachment fields |
| `services/mail/threads.py` | create | thread key, anchors, thread rows, thread payload |
| `services/mail/actions.py` | create | PATCH and bulk validation, the check order, `perform` |
| `services/mail/attachments.py` | create | preview/available, fetch, cache, sniffed response, Files tab rows, readable check |
| `services/mail/views.py` | modify | shared filters (`all`, `label`), threads, thread PATCH, bulk, labels GET/POST, PATCH rework, reply mark-read, download, disconnect clean-up |
| `services/mail/urls.py` | modify | four routes |
| `core/throttling.py` | modify | `MailAttachmentThrottle` |
| `services/mail/prune.py`, `services/customers/management/commands/run_health_maintenance.py` | modify | `prune_outbox` nightly |
| `services/customers/views.py`, `services/customers/serializers.py` | modify | Files tab rows from mail, `email` on every row |
| `services/mail/tests/test_*.py`, `services/customers/tests/test_files_and_calls.py`, `e2e/test_gmail_actions_flow.py` | create / modify | tests |
| docs (see Global Constraints) | modify | same-PR docs |

Task order:
- storage (1), the Gmail write calls and the fake (2);
- the outbox writer (3), the skip rule (4), the flush (5), failures and notices (6), labels (7);
- the read side: `sync_issue` and filters (8), actions (9), conversations (10), bulk (11);
- attachments (12), the Files tab (13), the prune and the journey (14);
- docs (15), verification (16).

Each task builds on the ones before it.

---
### Task 1: Setup, storage, settings and the notification kind

**Files:**
- Modify: `config/settings.py` (after the `gmail_push` throttle rate, the last `MAIL`/`GMAIL` block, about line 550)
- Modify: `.env.example` (after `# MAIL_DISCONNECT_RETENTION_DAYS=30`, line 109)
- Modify: `services/mail/models.py` (imports; `MailMessage.Meta.indexes`; `MailLabel.key`; `MailAttachment`; new `mail_attachment_path`, `MailOutbox` and the receiver at the end)
- Create: `services/mail/migrations/0005_mail_outbox.py` (generated)
- Modify: `services/notifications/models.py:44` (after `AGENT_DRAFT_READY`)
- Create: `services/notifications/migrations/0012_mail_action_failed.py` (generated)
- Test: `services/mail/tests/test_outbox_storage.py`

**Interfaces:**
- Consumes: D1's models, `GmailFixture`, `gmail_fake.fixture`.
- Produces:
  - `services.mail.models.PENDING_LABEL_PREFIX = "pending:"`;
  - `MailLabel.key -> str` (the Gmail id, or `pending:<pk>`);
  - `mail_attachment_path(instance, filename) -> str`;
  - `MailAttachment.fetched_at`, and `file` on `mail_attachment_path`;
  - `MailOutbox` with `Op` (`READ UNREAD STAR UNSTAR ARCHIVE INBOX TRASH UNTRASH SPAM NOT_SPAM LABEL_ADD LABEL_REMOVE LABEL_CREATE`), `Status` (`PENDING SENDING SENT FAILED`), `Reason` (`NOT_FOUND LABEL_GONE REFUSED EXHAUSTED NAME_REFUSED`), and `MailOutbox.LIVE = ("pending", "sending")`;
  - `Notification.Kind.MAIL_ACTION_FAILED`;
  - the 10 settings.

- [ ] **Step 1: Set up the worktree**

```bash
cd /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail2-be
ln -s /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-be/venv venv
cp /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-backend/.env .env
grep -qx 'venv' "$(git rev-parse --git-common-dir)/info/exclude" || echo 'venv' >> "$(git rev-parse --git-common-dir)/info/exclude"
venv/bin/python -c "import nh3, jwt, django; print(django.get_version())"
git status --short
```

Expected: `5.2.17`, and `git status` prints nothing. The `.gitignore` rule `venv/` matches a directory, not a symlink, which is why `venv` goes in the local exclude file. If `../gmail-be/venv` no longer exists, make one instead: `/opt/anaconda3/bin/python3.13 -m venv venv && venv/bin/pip install -r requirements-dev.txt`.

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK. This is the baseline every later task keeps green.

- [ ] **Step 2: Write the failing tests**

Create `services/mail/tests/test_outbox_storage.py`:

```python
"""Delivery 2's storage: the outbox row and its constraints, the cached
attachment's path and its clean-up, the label index, the label key, the new
notification kind and the settings."""

import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction
from django.test import SimpleTestCase
from django.utils import timezone

from services.mail import gmail_store
from services.mail.models import MailLabel, MailMessage, MailOutbox, mail_attachment_path
from services.notifications.models import Notification

from .gmail_fake import fixture
from .gmail_fixtures import GmailFixture


class OutboxFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        self.row, _ = gmail_store.store_gmail(
            self.mailbox, fixture("message_full.json"), now=self.now
        )

    def outbox(self, **fields):
        values = {
            "connection": self.mailbox,
            "action_id": uuid.uuid4(),
            "op": "read",
            "message": self.row,
            "label_key": "UNREAD",
            "add": False,
            "previous": {"present": True},
            "next_attempt_at": self.now,
        }
        values.update(fields)
        return MailOutbox.objects.create(**values)


class OutboxRowTests(OutboxFixture):
    def test_a_new_row_is_pending_uncounted_and_names_no_subject(self):
        row = self.outbox()
        self.assertEqual((row.status, row.attempts, row.reason), ("pending", 0, ""))
        self.assertEqual(str(row), f"outbox {row.pk} read")

    def test_one_pending_row_per_message_and_label(self):
        self.outbox()
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox()
        # A row on its way to Gmail does not count: a new action queues beside it.
        MailOutbox.objects.update(status="sending")
        self.outbox()
        self.assertEqual(MailOutbox.objects.count(), 2)

    def test_one_live_label_create_per_label(self):
        label = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        create = {
            "op": "label_create",
            "message": None,
            "label": label,
            "label_key": "",
            "add": None,
            "previous": {},
            "payload": {"name": "Pilot"},
        }
        self.outbox(**create)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(**create)

    def test_label_create_has_a_label_and_no_message_and_the_rest_a_message(self):
        label = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(op="label_create", label=label, label_key="")
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.outbox(message=None)

    def test_a_message_gmail_deletes_takes_its_rows(self):
        self.outbox()
        self.row.delete()
        self.assertFalse(MailOutbox.objects.exists())


class LabelKeyTests(OutboxFixture):
    def test_a_label_is_keyed_by_its_gmail_id_or_pending(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        self.assertEqual(made.key, f"pending:{made.pk}")
        made.gmail_id = "Label_40"
        self.assertEqual(made.key, "Label_40")

    def test_a_label_filter_is_a_containment_on_the_gin_index(self):
        rows = MailMessage.objects.filter(label_ids__contains=["Label_12"])
        self.assertIn("@>", str(rows.query))
        self.assertEqual(list(rows), [self.row])
        self.assertIn("mail_msg_label_ids_gin", {index.name for index in MailMessage._meta.indexes})


class CachedFileTests(OutboxFixture):
    def test_the_path_is_the_organisation_and_a_random_name(self):
        part = self.row.attachments.get(part_id="1")
        self.assertRegex(
            mail_attachment_path(part, "Renewal quote.pdf"),
            rf"^mail_attachments/{self.org.pk}/[0-9a-f]{{32}}\.pdf$",
        )

    def test_deleting_the_row_deletes_the_file_on_commit(self):
        part = self.row.attachments.get(part_id="1")
        part.file.save("q.pdf", ContentFile(b"%PDF-1.4"), save=True)
        storage, name = part.file.storage, part.file.name
        self.assertTrue(storage.exists(name))
        with self.captureOnCommitCallbacks(execute=True):
            self.row.delete()  # the cascade, as a history deletion or the prune does
        self.assertFalse(storage.exists(name))


class SettingsTests(SimpleTestCase):
    def test_the_contract_defaults(self):
        self.assertEqual(
            (
                settings.MAIL_OUTBOX_MAX_ATTEMPTS,
                settings.MAIL_OUTBOX_RETRY_SECONDS,
                settings.MAIL_OUTBOX_BATCH_SIZE,
                settings.MAIL_OUTBOX_SINGLE_CALLS_PER_TICK,
                settings.MAIL_OUTBOX_ISSUE_DAYS,
                settings.MAIL_OUTBOX_SENT_RETENTION_HOURS,
                settings.MAIL_ACTION_MAX_MESSAGES,
                settings.MAIL_THREAD_MAX_MESSAGES,
                settings.MAIL_ATTACHMENT_MAX_BYTES,
            ),
            (5, [30, 120, 600, 3600], 1000, 200, 7, 24, 1000, 100, 52428800),
        )
        self.assertIsNone(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["mail_attachment"])

    def test_the_notification_kind(self):
        self.assertEqual(Notification.Kind.MAIL_ACTION_FAILED, "mail_action_failed")
        self.assertEqual(Notification.Kind.MAIL_ACTION_FAILED.label, "Mail action failed")
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_outbox_storage --parallel auto --noinput`
Expected: FAIL with `ImportError: cannot import name 'MailOutbox' from 'services.mail.models'`.

- [ ] **Step 4: The settings**

In `config/settings.py`, after the `REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["gmail_push"] = (...)` block, add:

```python
# Two-way Gmail delivery 2: the outbox (services/mail/outbox.py, outbox_flush.py).
# The fifth counted failure fails a row; the waits after failures 1 to 4 follow.
MAIL_OUTBOX_MAX_ATTEMPTS = env.int("MAIL_OUTBOX_MAX_ATTEMPTS", default=5)
MAIL_OUTBOX_RETRY_SECONDS = [
    int(seconds)
    for seconds in env.list("MAIL_OUTBOX_RETRY_SECONDS", default=["30", "120", "600", "3600"])
]
MAIL_OUTBOX_BATCH_SIZE = env.int("MAIL_OUTBOX_BATCH_SIZE", default=1000)
MAIL_OUTBOX_SINGLE_CALLS_PER_TICK = env.int("MAIL_OUTBOX_SINGLE_CALLS_PER_TICK", default=200)
# sync_issue's window; failed rows are pruned after it. SOC2:DATA-04
MAIL_OUTBOX_ISSUE_DAYS = env.int("MAIL_OUTBOX_ISSUE_DAYS", default=7)
MAIL_OUTBOX_SENT_RETENTION_HOURS = env.int("MAIL_OUTBOX_SENT_RETENTION_HOURS", default=24)
MAIL_ACTION_MAX_MESSAGES = env.int("MAIL_ACTION_MAX_MESSAGES", default=1000)
MAIL_THREAD_MAX_MESSAGES = env.int("MAIL_THREAD_MAX_MESSAGES", default=100)
# Gmail's receiving limit; larger attachments open in Gmail only.
MAIL_ATTACHMENT_MAX_BYTES = env.int("MAIL_ATTACHMENT_MAX_BYTES", default=50 * 1024 * 1024)
# Per user on attachment downloads (a first open costs two Gmail calls).
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["mail_attachment"] = (
    None if TESTING else env("THROTTLE_MAIL_ATTACHMENT", default="120/min")
)
```

In `.env.example`, after `# MAIL_DISCONNECT_RETENTION_DAYS=30`, add:

```
# Two-way Gmail delivery 2 (the outbox and attachments); the defaults are the contract's.
# MAIL_OUTBOX_MAX_ATTEMPTS=5
# MAIL_OUTBOX_RETRY_SECONDS=30,120,600,3600
# MAIL_OUTBOX_BATCH_SIZE=1000
# MAIL_OUTBOX_SINGLE_CALLS_PER_TICK=200
# MAIL_OUTBOX_ISSUE_DAYS=7
# MAIL_OUTBOX_SENT_RETENTION_HOURS=24
# MAIL_ACTION_MAX_MESSAGES=1000
# MAIL_THREAD_MAX_MESSAGES=100
# MAIL_ATTACHMENT_MAX_BYTES=52428800
# THROTTLE_MAIL_ATTACHMENT=120/min
```

- [ ] **Step 5: The models**

In `services/mail/models.py`, replace the imports at the top with:

```python
from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models, transaction
from django.db.models import Q
from django.db.models.signals import post_delete
from django.dispatch import receiver

from services.accounts.models import Organisation

from . import crypto, scopes

#: How a label made in Revenact sits in `label_ids` until Gmail creates it
#: (contract decision 21).
PENDING_LABEL_PREFIX = "pending:"
```

In `MailMessage.Meta.indexes`, add the GIN index as the last item:

```python
        indexes = [
            models.Index(fields=["owner", "folder", "state", "-sent_at"]),
            models.Index(fields=["owner", "category"]),
            # `label_ids @> '["Label_12"]'`: the label views (contract decision 18).
            GinIndex(fields=["label_ids"], name="mail_msg_label_ids_gin", opclasses=["jsonb_path_ops"]),
        ]
```

Replace the `MailLabel` docstring's last sentence and add the property after `__str__`:

```python
class MailLabel(models.Model):
    """A Gmail label, mirrored from labels.list on every Google tick. Read by
    its mailbox's owner only. `gmail_id` is blank only for a label made in
    Revenact that the outbox has not created in Gmail yet; until then it sits
    in `label_ids` as `pending:<pk>` (`key`)."""
```

```python
    def __str__(self):
        return f"label {self.pk}"


    @property
    def key(self):
        """How this label appears in a message's `label_ids`."""
        return self.gmail_id or f"{PENDING_LABEL_PREFIX}{self.pk}"
```

Replace `MailAttachment` (docstring, the `file` field, the new `fetched_at`) and add the path function just above it:

```python
def mail_attachment_path(instance, filename):
    """Where a fetched part lands: under its organisation, named by a random
    id, as customers.attachment_path. The name stays on the row, never in
    the path."""
    import uuid

    from services.customers.files import extension_of

    organisation_id = instance.message.organisation_id
    return f"mail_attachments/{organisation_id}/{uuid.uuid4().hex}{extension_of(filename)}"


class MailAttachment(models.Model):
    """One file part of a Gmail message. `file` is fetched from Gmail on the
    first open (services/mail/attachments.py) and kept; it is deleted with the
    row (`_delete_cached_file`). Gmail rotates attachment ids between fetches,
    so `part_id` is what a fetch matches on. Owner-only, or the twice-filter
    when its message is filed."""

    message = models.ForeignKey(MailMessage, related_name="attachments", on_delete=models.CASCADE)
    part_id = models.CharField(max_length=64)
    gmail_attachment_id = models.TextField(blank=True)
    filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField()
    content_id = models.CharField(max_length=255, blank=True)
    is_inline = models.BooleanField(default=False)
    file = models.FileField(upload_to=mail_attachment_path, blank=True)
    #: When `file` was fetched from Gmail.
    fetched_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["message", "part_id"], name="mail_attachment_part_once")
        ]

    def __str__(self):
        return f"attachment {self.pk}"
```

At the end of the file, add:

```python
class MailOutbox(models.Model):
    """One change on its way to Gmail (contract §1): a single label's target
    presence on one message, or (`label_create`) one label to make. Written
    in the request by services/mail/outbox.py, which also changes the
    message at once; sent by the tick (services/mail/outbox_flush.py).

    `previous` is what a failure restores (`{"present": bool}`), and while a
    row is pending or sending, incoming Gmail changes leave that label alone
    and update `previous` instead (decision 3). `sending` is internal: the
    API never shows it. Owner-only, like the mailbox."""

    class Op(models.TextChoices):
        READ = "read", "Mark as read"
        UNREAD = "unread", "Mark as unread"
        STAR = "star", "Star"
        UNSTAR = "unstar", "Unstar"
        ARCHIVE = "archive", "Archive"
        INBOX = "inbox", "Move to the Inbox"
        TRASH = "trash", "Delete"
        UNTRASH = "untrash", "Restore"
        SPAM = "spam", "Report spam"
        NOT_SPAM = "not_spam", "Not spam"
        LABEL_ADD = "label_add", "Add a label"
        LABEL_REMOVE = "label_remove", "Remove a label"
        LABEL_CREATE = "label_create", "Create a label"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        #: Claimed by a flush, its Gmail call under way (decision 4).
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    class Reason(models.TextChoices):
        NOT_FOUND = "not_found", "The message no longer exists"
        LABEL_GONE = "label_gone", "The label no longer exists"
        REFUSED = "refused", "Gmail refused the change"
        EXHAUSTED = "exhausted", "Gmail didn't answer"
        NAME_REFUSED = "name_refused", "Gmail refused the name"

    #: A row Gmail has not settled yet: incoming changes skip its label.
    LIVE = ("pending", "sending")

    connection = models.ForeignKey(
        MailboxConnection, related_name="outbox", on_delete=models.CASCADE
    )
    #: Shared by every row one request made; one notice per action and reason.
    action_id = models.UUIDField()
    op = models.CharField(max_length=24, choices=Op.choices)
    message = models.ForeignKey(
        MailMessage, related_name="outbox", on_delete=models.CASCADE, null=True, blank=True
    )
    label = models.ForeignKey(
        MailLabel, related_name="outbox", on_delete=models.CASCADE, null=True, blank=True
    )
    #: The Gmail label id changed (UNREAD, INBOX, Label_12) or pending:<MailLabel id>.
    label_key = models.CharField(max_length=255, blank=True)
    #: The target: the label present (True) or absent (False). Null for label_create.
    add = models.BooleanField(null=True, blank=True)
    previous = models.JSONField(default=dict, blank=True)
    #: label_create: {"name"}; label_add / label_remove: {"label"} (the notice's name).
    payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField()
    reason = models.CharField(max_length=16, choices=Reason.choices, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    #: auto_now, which queryset update() skips: every status update sets it.
    updated_at = models.DateTimeField(auto_now=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            # The collapse (decision 2).
            models.UniqueConstraint(
                fields=["message", "label_key"],
                condition=Q(status="pending"),
                name="mail_outbox_one_pending_per_label",
            ),
            models.UniqueConstraint(
                fields=["label"],
                condition=Q(op="label_create") & Q(status__in=["pending", "sending"]),
                name="mail_outbox_one_label_create",
            ),
            models.CheckConstraint(
                condition=Q(op="label_create", label__isnull=False, message__isnull=True)
                | (~Q(op="label_create") & Q(message__isnull=False)),
                name="mail_outbox_row_shape",
            ),
        ]
        indexes = [
            models.Index(
                fields=["connection", "status", "next_attempt_at"], name="mail_outbox_due_idx"
            ),
            models.Index(fields=["message", "status"], name="mail_outbox_message_idx"),
        ]

    def __str__(self):
        return f"outbox {self.pk} {self.op}"


@receiver(post_delete, sender=MailAttachment, dispatch_uid="mail.attachment_file_cleanup")
def _delete_cached_file(sender, instance, **kwargs):
    """A fetched file goes with its row, cascades included (history
    deletions, the prune, a replaced connection): contract decision 32.
    Deferred to the commit, so a rolled-back delete keeps its file."""
    name = instance.file.name
    if name:
        storage = instance.file.storage
        transaction.on_commit(lambda: storage.delete(name))
```

Also replace the sentence "(D1 writes nothing back)" in the `MailMessage` docstring:

```python
    `folder`, `is_read`, `is_starred` and `is_important` come from the
    provider. For Gmail they are derived from `label_ids` at every store and
    label change (services/mail/gmail_store.py), and Gmail is the truth,
    except for a label with a pending or sending outbox row: a change made
    here goes back to Gmail through the outbox (services/mail/outbox.py) and
    the person's value holds until Gmail has it. Outlook and IMAP keep
    `locally_changed_at`: what the person did here wins, and nothing is
    written back. `state` is this product's
```

- [ ] **Step 6: The notification kind**

In `services/notifications/models.py`, after `AGENT_DRAFT_READY = "agent_draft_ready", "Agent draft ready"`, add:

```python
        MAIL_ACTION_FAILED = "mail_action_failed", "Mail action failed"
```

- [ ] **Step 7: Generate the migrations**

Run: `venv/bin/python manage.py makemigrations mail --name mail_outbox && venv/bin/python manage.py makemigrations notifications --name mail_action_failed`
Expected: `services/mail/migrations/0005_mail_outbox.py` with `CreateModel MailOutbox`, `AddField mailattachment.fetched_at`, `AlterField mailattachment.file`, `AddIndex mail_msg_label_ids_gin` and the outbox's constraints and indexes; `services/notifications/migrations/0012_mail_action_failed.py` with one `AlterField` on `notification.kind`. Read both: no `RunPython`, nothing dropped.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail services.notifications --parallel auto --noinput`
Expected: OK.

- [ ] **Step 9: Commit**

```bash
venv/bin/ruff format config/settings.py services/mail/models.py services/notifications/models.py services/mail/tests/test_outbox_storage.py
venv/bin/ruff check --fix config/settings.py services/mail/models.py services/notifications/models.py services/mail/tests/test_outbox_storage.py
git add config/settings.py .env.example services/mail/models.py services/mail/migrations/0005_mail_outbox.py services/notifications/models.py services/notifications/migrations/0012_mail_action_failed.py services/mail/tests/test_outbox_storage.py
git commit -m "$(cat <<'EOF'
feat(mail): outbox storage, cached attachment files and the label index

MailOutbox holds one label change per row with the collapse constraint;
MailAttachment gains fetched_at and an organisation path, deleted with its
row; a GIN index backs label views; mail_action_failed notifications.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The Gmail write calls, and the fake Gmail that answers them

**Files:**
- Modify: `services/mail/providers/google.py` (`GmailSession`: docstring and six methods after `get_message`)
- Modify: `services/mail/tests/gmail_fake.py` (`__init__`, `__call__`, new helpers)
- Test: `services/mail/tests/test_gmail_client.py` (new class at the end)

**Interfaces:**
- Consumes: `GmailSession._call`, `FakeGmail`.
- Produces:
  - `GmailSession.batch_modify(ids: list[str], add: list[str], remove: list[str]) -> dict`;
  - `GmailSession.modify(message_id, add, remove) -> dict`;
  - `GmailSession.trash(message_id) -> dict`, `GmailSession.untrash(message_id) -> dict`;
  - `GmailSession.create_label(name) -> dict` (Gmail's label: `id`, `name`, ...);
  - `GmailSession.attachment(message_id, attachment_id) -> dict | None` (`{"size", "data"}`, None on 404);
  - `FakeGmail.writes: list[tuple[str, dict]]` (route after `/gmail/v1/users/me`, body) for every POST;
  - `FakeGmail.files: dict[str, bytes]`;
  - `FakeGmail.attach_file(message_id, part_id, data: bytes, *, in_payload=False)`;
  - a `batchModify` naming a message Gmail does not hold answers 404; an unknown label answers 400 `Invalid label: <id>`; `labels.create` with a name Gmail holds (any case) answers 409.

- [ ] **Step 1: Write the failing tests**

Append to `services/mail/tests/test_gmail_client.py` (add `import base64` to the imports, and `gmail_message` to the `.gmail_fake` import):

```python
class WriteCallTests(SimpleTestCase):
    """The calls D2's outbox and attachment route make, against the fake."""

    def setUp(self):
        self.fake = FakeGmail()
        self.fake.add(gmail_message("m1"), quietly=True)
        self.fake.add(gmail_message("m2"), quietly=True)
        patcher = patch("services.mail.providers.google.http_json", self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.session = GmailSession(FRESH)

    def labels(self, message_id):
        return self.fake.messages[message_id]["labelIds"]

    def test_batch_modify_changes_every_id_and_gmail_records_it(self):
        self.assertEqual(self.session.batch_modify(["m1", "m2"], ["STARRED"], ["UNREAD"]), {})
        self.assertEqual((self.labels("m1"), self.labels("m2")), (["INBOX", "STARRED"],) * 2)
        self.assertEqual(
            self.fake.writes[-1],
            (
                "/messages/batchModify",
                {"ids": ["m1", "m2"], "addLabelIds": ["STARRED"], "removeLabelIds": ["UNREAD"]},
            ),
        )
        # A labelsAdded and a labelsRemoved record per message, as Gmail's history has.
        self.assertEqual(len(self.fake.records), 4)

    def test_a_batch_with_an_unknown_id_or_label_changes_nothing(self):
        with self.assertRaises(ProviderError) as caught:
            self.session.batch_modify(["m1", "gone"], ["STARRED"], [])
        self.assertEqual(caught.exception.status, 404)
        with self.assertRaises(ProviderError) as caught:
            self.session.batch_modify(["m1"], ["Label_99"], [])
        self.assertEqual(caught.exception.status, 400)
        self.assertIn("Invalid label", str(caught.exception))
        self.assertEqual(self.labels("m1"), ["INBOX", "UNREAD"])

    def test_modify_trash_and_untrash_one_message(self):
        self.session.modify("m1", [], ["INBOX"])
        self.assertEqual(self.labels("m1"), ["UNREAD"])
        self.session.trash("m2")
        self.assertIn("TRASH", self.labels("m2"))
        self.session.untrash("m2")
        self.assertNotIn("TRASH", self.labels("m2"))
        with self.assertRaises(ProviderError) as caught:
            self.session.trash("gone")
        self.assertEqual(caught.exception.status, 404)

    def test_create_label_and_a_name_gmail_already_has(self):
        made = self.session.create_label("Pilot")
        self.assertEqual((made["name"], made["type"]), ("Pilot", "user"))
        self.assertTrue(made["id"].startswith("Label_"))
        self.assertEqual(
            self.fake.writes[-1],
            (
                "/labels",
                {
                    "name": "Pilot",
                    "labelListVisibility": "labelShow",
                    "messageListVisibility": "show",
                },
            ),
        )
        with self.assertRaises(ProviderError) as caught:
            self.session.create_label("renewals")  # Gmail's "Renewals"
        self.assertEqual(caught.exception.status, 409)

    def test_an_attachment_is_read_by_its_current_id(self):
        pdf = {"filename": "q.pdf", "mime_type": "application/pdf", "size": 10}
        self.fake.add(gmail_message("m3", attachments=[pdf]), quietly=True)
        self.fake.attach_file("m3", "1", b"%PDF-1.4 quote")
        current = self.session.get_message("m3")["payload"]["parts"][1]["body"]["attachmentId"]
        body = self.session.attachment("m3", current)
        self.assertEqual(base64.urlsafe_b64decode(body["data"] + "=="), b"%PDF-1.4 quote")
        self.assertIsNone(self.session.attachment("m3", "ANGjdJm31"))  # the rotated-away id
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_gmail_client --parallel auto --noinput`
Expected: FAIL with `AttributeError: 'FakeGmail' object has no attribute 'writes'` (or `'GmailSession' object has no attribute 'batch_modify'`).

- [ ] **Step 3: The session's write calls**

In `services/mail/providers/google.py`, replace the `GmailSession` docstring:

```python
class GmailSession:
    """One mailbox's Gmail calls for one pass. The access token is refreshed
    when it has expired, and once more on a 401; a second 401 is raised (a
    lost grant). A network failure is a ProviderError with no status. Every
    call here is safe to repeat: the reads, and D2's writes (labels set to a
    target, trash, untrash), which are idempotent. `creds` is what to store
    afterwards."""
```

After `get_message`, add:

```python
    def batch_modify(self, ids, add, remove):
        """Up to 1,000 messages at once (MAIL_OUTBOX_BATCH_SIZE). Gmail answers 204."""
        return self._call(
            "POST",
            "/messages/batchModify",
            data={"ids": list(ids), "addLabelIds": list(add), "removeLabelIds": list(remove)},
        )


    def modify(self, message_id, add, remove):
        return self._call(
            "POST",
            f"/messages/{quote(message_id, safe='')}/modify",
            data={"addLabelIds": list(add), "removeLabelIds": list(remove)},
        )


    def trash(self, message_id):
        return self._call("POST", f"/messages/{quote(message_id, safe='')}/trash", data={})


    def untrash(self, message_id):
        return self._call("POST", f"/messages/{quote(message_id, safe='')}/untrash", data={})


    def create_label(self, name):
        return self._call(
            "POST",
            "/labels",
            data={"name": name, "labelListVisibility": "labelShow", "messageListVisibility": "show"},
        )


    def attachment(self, message_id, attachment_id):
        """`{size, data}` (data base64url), or None when Gmail no longer has it."""
        path = f"/messages/{quote(message_id, safe='')}/attachments/{quote(attachment_id, safe='')}"
        try:
            return self._call("GET", path)
        except ProviderError as exc:
            if exc.status == 404:
                return None
            raise
```

- [ ] **Step 4: The fake's routes**

In `services/mail/tests/gmail_fake.py`, add to the module docstring's last sentence: "D2's writes (batchModify, modify, trash, untrash, labels.create) change the mailbox and record history as Gmail does, and attachments.get serves `attach_file`'s bytes."

Add a module helper after `_not_found`:

```python
def _find_part(part, part_id):
    if part.get("partId") == part_id:
        return part
    for child in part.get("parts", []):
        found = _find_part(child, part_id)
        if found is not None:
            return found
    return None
```

In `FakeGmail.__init__`, after `self.refresh_reason = ""`, add:

```python
        #: (route, body) of every POST, oldest first.
        self.writes = []
        #: attachment id -> bytes (attach_file).
        self.files = {}
        self._next_file = 0
```

Add these methods after `fail`:

```python
    def attach_file(self, message_id, part_id, data, *, in_payload=False):
        """Gmail holds `data` as that part's bytes. Under a fresh attachment id
        (Gmail rotates them), or, `in_payload`, inline in the part's body as
        Gmail sends small parts."""
        part = _find_part(self.messages[message_id]["payload"], part_id)
        if in_payload:
            part["body"] = {"size": len(data), "data": base64.urlsafe_b64encode(data).decode()}
            return
        self._next_file += 1
        attachment_id = f"ANGjdJrotated{self._next_file}"
        part["body"] = {"attachmentId": attachment_id, "size": len(data)}
        self.files[attachment_id] = data


    def _known_labels(self):
        return {label["id"] for label in self.labels}


    def _change(self, message_id, add, remove):
        full = self.messages[message_id]
        labels = [label for label in full["labelIds"] if label not in remove]
        labels += [label for label in add if label not in labels]
        full["labelIds"] = labels
        if add:
            self._record(labelsAdded=[{"message": self._stub(message_id), "labelIds": list(add)}])
        if remove:
            self._record(labelsRemoved=[{"message": self._stub(message_id), "labelIds": list(remove)}])


    def _modify(self, ids, data):
        add, remove = data.get("addLabelIds", []), data.get("removeLabelIds", [])
        for label in [*add, *remove]:
            if label not in self._known_labels():
                raise ProviderError(
                    f"400 from gmail.googleapis.com: Invalid label: {label}",
                    status=400,
                    reason="invalidArgument",
                )
        if any(message_id not in self.messages for message_id in ids):
            raise _not_found()
        for message_id in ids:
            self._change(message_id, add, remove)
        return {}


    def _create_label(self, data):
        name = data["name"]
        if any(label["name"].lower() == name.lower() for label in self.labels):
            raise ProviderError(
                "409 from gmail.googleapis.com: Label name exists or conflicts",
                status=409,
                reason="alreadyExists",
            )
        label = {
            "id": f"Label_{100 + len(self.labels)}",
            "name": name,
            "type": "user",
            "messageListVisibility": data.get("messageListVisibility", "show"),
            "labelListVisibility": data.get("labelListVisibility", "labelShow"),
        }
        self.labels.append(label)
        return copy.deepcopy(label)


    def _attachment(self, message_id, attachment_id):
        if message_id not in self.messages or attachment_id not in self.files:
            raise _not_found()
        data = self.files[attachment_id]
        return {"size": len(data), "data": base64.urlsafe_b64encode(data).decode().rstrip("=")}
```

In `__call__`, record POST bodies and route the writes. Replace the block from `assert parts.path.startswith(API_PREFIX), parts.path` down to (not including) `if route == "/history":` with:

```python
        assert parts.path.startswith(API_PREFIX), parts.path
        route = parts.path[len(API_PREFIX) :]
        if method == "POST":
            self.writes.append((route, copy.deepcopy(data)))
        if route == "/profile":
            return {
                "emailAddress": self.address,
                "messagesTotal": len(self.messages),
                "threadsTotal": len(self.messages),
                "historyId": str(self.history_id),
            }
        if route == "/labels":
            if method == "POST":
                return self._create_label(data)
            return {"labels": copy.deepcopy(self.labels)}
        if route == "/messages/batchModify":
            return self._modify(data["ids"], data)
        write = re.fullmatch(r"/messages/([^/]+)/(modify|trash|untrash)", route)
        if write:
            message_id, verb = write.groups()
            if message_id not in self.messages:
                raise _not_found()
            if verb == "modify":
                self._modify([message_id], data)
            elif verb == "trash":
                self._change(message_id, ["TRASH"], [])
            else:
                self._change(message_id, [], ["TRASH"])
            return self._stub(message_id)
        attachment = re.fullmatch(r"/messages/([^/]+)/attachments/([^/]+)", route)
        if attachment:
            return self._attachment(*attachment.groups())
```

(`/history`, `/messages`, `/messages/<id>`, `/watch` and `/stop` stay as they are below it. The `/watch` and `/stop` routes now also land in `writes`; nothing asserts on that.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK (the D1 tests use the fake too and still pass).

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/providers/google.py services/mail/tests/gmail_fake.py services/mail/tests/test_gmail_client.py
venv/bin/ruff check --fix services/mail/providers/google.py services/mail/tests/gmail_fake.py services/mail/tests/test_gmail_client.py
git add services/mail/providers/google.py services/mail/tests/gmail_fake.py services/mail/tests/test_gmail_client.py
git commit -m "$(cat <<'EOF'
feat(mail): gmail write calls and attachment reads in the session and the fake

batchModify, modify, trash, untrash, labels.create and attachments.get;
the fake applies them, records history and rotates attachment ids.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 3: The outbox writer: one row per label change, collapsed, applied at once

**Files:**
- Create: `services/mail/outbox.py`
- Test: `services/mail/tests/test_outbox.py`

**Interfaces:**
- Consumes: `MailOutbox`, `MailLabel.key`, `gmail_store.derive`.
- Produces (`services.mail.outbox`):
  - `Op = MailOutbox.Op`, `Status = MailOutbox.Status`;
  - `LABEL_CHANGES: dict[str, tuple[tuple[str, bool], ...]]`;
  - `LOCAL_FIELDS = ["label_ids", "folder", "is_read", "is_starred", "is_important", "state"]`;
  - `Change(op, label_key, add, label_name="")` (frozen dataclass);
  - `changes_for(op, label=None) -> list[Change]`;
  - `set_presence(message, key, present) -> None`;
  - `rederive(connection, message, ops=frozenset()) -> None`;
  - `apply(connection, pairs, *, action_id=None, now=None) -> set[int]` (the pks whose local values changed; must run inside a transaction);
  - `wake(connection_id, now=None) -> None`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_outbox.py`:

```python
"""Writing the outbox (contract §1, "Enqueueing"): an action changes the row
at once and queues one row per label change; a change that undoes a pending
one collapses it; a change already true locally queues nothing; muted
messages follow the archive and inbox rules; a label made here is keyed
pending; the mailbox is woken on commit, never later than it already was."""

import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from services.mail import gmail_store, outbox
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture


class WriterFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.row = self.store("g1")
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")

    def store(self, gmail_id, labels=("INBOX", "UNREAD")):
        row, _ = gmail_store.store_gmail(
            self.mailbox, gmail_message(gmail_id, labels=labels), now=self.now
        )
        return row

    def act(self, op, *messages, label=None, action_id=None):
        targets = messages or (self.row,)
        pairs = [(m, change) for m in targets for change in outbox.changes_for(op, label)]
        with self.captureOnCommitCallbacks(execute=True), transaction.atomic():
            changed = outbox.apply(self.mailbox, pairs, action_id=action_id, now=self.now)
        for message in targets:
            message.refresh_from_db()
        return changed

    def pending(self):
        return list(
            MailOutbox.objects.filter(status="pending")
            .order_by("pk")
            .values_list("op", "label_key", "add", "previous")
        )


class EnqueueTests(WriterFixture):
    def test_read_changes_the_row_at_once_and_queues_one_label(self):
        self.assertEqual(self.act("read"), {self.row.pk})
        self.assertEqual((self.row.is_read, self.row.label_ids), (True, ["INBOX"]))
        self.assertEqual(self.pending(), [("read", "UNREAD", False, {"present": True})])
        row = MailOutbox.objects.get()
        self.assertEqual((row.connection, row.message, row.attempts), (self.mailbox, self.row, 0))
        self.assertEqual(row.next_attempt_at, self.now)

    def test_a_change_already_true_queues_nothing(self):
        self.assertEqual(self.act("unstar"), set())
        self.assertEqual(self.pending(), [])

    def test_read_then_unread_sends_nothing(self):
        self.act("read")
        self.assertEqual(self.act("unread"), {self.row.pk})
        self.assertEqual(self.pending(), [])
        self.assertFalse(self.row.is_read)

    def test_the_same_change_again_takes_the_new_action_and_starts_over(self):
        first, second = uuid.uuid4(), uuid.uuid4()
        self.act("read", action_id=first)
        MailOutbox.objects.update(attempts=3)
        self.assertEqual(self.act("read", action_id=second), set())
        row = MailOutbox.objects.get()
        self.assertEqual((row.action_id, row.attempts, row.add), (second, 0, False))

    def test_a_sending_row_is_not_collapsed_into(self):
        self.act("read")
        MailOutbox.objects.update(status="sending")
        self.act("unread")
        self.assertEqual(self.pending(), [("unread", "UNREAD", True, {"present": False})])

    def test_spam_is_two_rows_and_the_folder_follows(self):
        self.act("spam")
        self.assertEqual(self.row.folder, "spam")
        self.assertEqual(
            self.pending(),
            [
                ("spam", "SPAM", True, {"present": False}),
                ("spam", "INBOX", False, {"present": True}),
            ],
        )

    def test_archive_is_done_and_inbox_reopens(self):
        self.act("archive")
        self.assertEqual((self.row.state, self.row.folder), ("done", "inbox"))
        self.act("inbox")
        self.assertEqual(self.row.state, "open")
        self.assertEqual(self.pending(), [])

    def test_trash_moves_it_to_trash(self):
        self.act("trash")
        self.assertEqual(self.row.folder, "trash")
        self.assertEqual(self.pending(), [("trash", "TRASH", True, {"present": False})])

    def test_one_action_over_many_messages_shares_its_id(self):
        other = self.store("g2")
        self.act("archive", self.row, other)
        self.assertEqual(MailOutbox.objects.values("action_id").distinct().count(), 1)
        self.assertEqual(MailOutbox.objects.count(), 2)


class MutedTests(WriterFixture):
    def setUp(self):
        super().setUp()
        MailMessage.objects.filter(pk=self.row.pk).update(state="muted")
        self.row.refresh_from_db()

    def test_read_leaves_muted_alone(self):
        self.act("read")
        self.assertEqual(self.row.state, "muted")

    def test_archive_on_a_muted_message_is_done_and_inbox_is_open(self):
        self.act("archive")
        self.assertEqual(self.row.state, "done")
        MailMessage.objects.filter(pk=self.row.pk).update(state="muted")
        self.row.refresh_from_db()
        self.act("inbox")
        self.assertEqual(self.row.state, "open")


class LabelTests(WriterFixture):
    def test_a_user_label_is_its_gmail_id_and_the_row_keeps_its_name(self):
        self.act("label_add", label=self.renewals)
        self.assertIn("Label_12", self.row.label_ids)
        row = MailOutbox.objects.get()
        self.assertEqual(
            (row.label_key, row.add, row.payload), ("Label_12", True, {"label": "Renewals"})
        )

    def test_a_label_made_here_is_keyed_pending(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        self.act("label_add", label=made)
        self.assertIn(f"pending:{made.pk}", self.row.label_ids)
        self.assertEqual(MailOutbox.objects.get().label_key, f"pending:{made.pk}")


class WakeTests(WriterFixture):
    def test_a_queued_change_wakes_the_mailbox_on_commit(self):
        self.act("read")
        self.mailbox.refresh_from_db()
        self.assertLessEqual(self.mailbox.wake_at, timezone.now())

    def test_an_earlier_wake_is_kept(self):
        earlier = self.now - timedelta(hours=1)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(wake_at=earlier)
        self.act("read")
        self.mailbox.refresh_from_db()
        self.assertEqual(self.mailbox.wake_at, earlier)

    def test_a_collapse_alone_wakes_nothing(self):
        self.act("read")
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(wake_at=None)
        self.act("unread")
        self.mailbox.refresh_from_db()
        self.assertIsNone(self.mailbox.wake_at)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_outbox --parallel auto --noinput`
Expected: FAIL with `ImportError: cannot import name 'outbox' from 'services.mail'`.

- [ ] **Step 3: Write the outbox writer**

Create `services/mail/outbox.py`:

```python
"""Actions back to Gmail, the writing half (contract §1, "Enqueueing").

An action changes the person's own row at once, so the screen never waits
for Gmail, and leaves one MailOutbox row per (message, label) change for
the tick to send (services/mail/outbox_flush.py). Every op in the spec's
table is a set of Gmail label changes (decision 1). Writing happens in the
request's transaction, with the messages and their pending rows locked, so
a flush never claims a row this request is collapsing.

- No pending row for the pair: a change already true locally queues nothing;
  otherwise a row records the target and the local presence before it.
- A pending row: a change back to its `previous` deletes it (read then
  unread sends nothing); any other takes the row over, uncounted again.
- A `sending` row is never touched: a new action queues beside it, and the
  flush hands over (decision 4).

Muted is Revenact's own (services/mail/actions.py): no row, ever.
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from . import gmail_store
from .models import MailboxConnection, MailMessage, MailOutbox

Op = MailOutbox.Op
Status = MailOutbox.Status
State = MailMessage.State

#: Each op's label changes: (Gmail label id, present afterwards). Label ops
#: take theirs from the label (`changes_for`); label_create has none.
LABEL_CHANGES = {
    Op.READ: (("UNREAD", False),),
    Op.UNREAD: (("UNREAD", True),),
    Op.STAR: (("STARRED", True),),
    Op.UNSTAR: (("STARRED", False),),
    Op.ARCHIVE: (("INBOX", False),),
    Op.INBOX: (("INBOX", True),),
    Op.TRASH: (("TRASH", True),),
    Op.UNTRASH: (("TRASH", False),),
    Op.SPAM: (("SPAM", True), ("INBOX", False)),
    Op.NOT_SPAM: (("SPAM", False), ("INBOX", True)),
}
#: What an action changes on a Gmail row: the labels, and what they mean.
LOCAL_FIELDS = ["label_ids", "folder", "is_read", "is_starred", "is_important", "state"]


@dataclass(frozen=True)
class Change:
    op: str
    label_key: str
    add: bool
    #: A user label's name, kept on the row for the notice (label ops only).
    label_name: str = ""


def changes_for(op, label=None):
    """The label changes one op makes on one message."""
    if op in (Op.LABEL_ADD, Op.LABEL_REMOVE):
        return [Change(op, label.key, op == Op.LABEL_ADD, label.name)]
    return [Change(op, key, add) for key, add in LABEL_CHANGES[op]]


def set_presence(message, key, present):
    labels = [label for label in message.label_ids or [] if label != key]
    if present:
        labels.append(key)
    message.label_ids = labels


def _state(current, archived, ops):
    if current == State.MUTED:
        if Op.ARCHIVE in ops:
            return State.DONE
        if Op.INBOX in ops:
            return State.OPEN
        return State.MUTED
    return State.DONE if archived else State.OPEN


def rederive(connection, message, ops=frozenset()):
    """The folder, flags and state the labels now mean (contract §1 step 4).
    Muted stays muted, except that archive makes it done and inbox open."""
    derived = gmail_store.derive(
        message.label_ids, from_address=message.from_address, own_address=connection.address
    )
    archived = derived.pop("archived")
    for field, value in derived.items():
        setattr(message, field, value)
    message.state = _state(message.state, archived, ops)


def _snapshot(message):
    return (tuple(message.label_ids or []),) + tuple(
        getattr(message, field) for field in LOCAL_FIELDS[1:]
    )


def apply(connection, pairs, *, action_id=None, now=None):
    """Make each (message, Change) true on the person's row now, and queue it
    for Gmail. One read of the pending rows, then at most one delete, one
    update, one insert and one message update, whatever the number of
    messages (contract §8). Returns the pks whose local values changed."""
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("outbox.apply runs inside the request's transaction")
    now = now or timezone.now()
    action_id = action_id or uuid.uuid4()
    pairs = list(pairs)
    messages = {message.pk: message for message, _ in pairs}
    before = {pk: _snapshot(message) for pk, message in messages.items()}
    pending = {
        (row.message_id, row.label_key): row
        for row in MailOutbox.objects.select_for_update().filter(
            message_id__in=list(messages), status=Status.PENDING
        )
    }
    created, updated, collapsed = {}, {}, []
    ops = defaultdict(set)
    for message, change in pairs:
        ops[message.pk].add(change.op)
        key = (message.pk, change.label_key)
        present = change.label_key in (message.label_ids or [])
        row = pending.get(key)
        if row is None:
            if present == change.add:
                continue
            row = MailOutbox(
                connection=connection,
                action_id=action_id,
                op=change.op,
                message=message,
                label_key=change.label_key,
                add=change.add,
                previous={"present": present},
                payload={"label": change.label_name} if change.label_name else {},
                next_attempt_at=now,
            )
            pending[key] = created[key] = row
        elif change.add == row.previous.get("present"):
            # Back to what Gmail had: nothing to send (decision 2).
            del pending[key]
            if created.pop(key, None) is None:
                collapsed.append(row.pk)
                updated.pop(row.pk, None)
        else:
            row.add, row.op, row.action_id = change.add, change.op, action_id
            row.attempts, row.next_attempt_at, row.updated_at = 0, now, now
            if change.label_name:
                row.payload = {"label": change.label_name}
            if row.pk is not None:
                updated[row.pk] = row
        set_presence(message, change.label_key, change.add)
    dirty = []
    for pk, message in messages.items():
        rederive(connection, message, ops[pk])
        if _snapshot(message) != before[pk]:
            dirty.append(message)
    if collapsed:
        MailOutbox.objects.filter(pk__in=collapsed, status=Status.PENDING).delete()
    if updated:
        MailOutbox.objects.bulk_update(
            list(updated.values()),
            ["add", "op", "action_id", "attempts", "next_attempt_at", "payload", "updated_at"],
        )
    if created:
        MailOutbox.objects.bulk_create(list(created.values()))
    if dirty:
        MailMessage.objects.bulk_update(dirty, LOCAL_FIELDS)
    if created or updated:
        connection_id = connection.pk
        transaction.on_commit(lambda: wake(connection_id))
    return {message.pk for message in dirty}


def wake(connection_id, now=None):
    """Due within one tick (decision 24): wake_at = LEAST(COALESCE(wake_at,
    now), now). An earlier wake is kept."""
    now = now or timezone.now()
    MailboxConnection.objects.filter(pk=connection_id).filter(
        Q(wake_at__isnull=True) | Q(wake_at__gt=now)
    ).update(wake_at=now)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail.tests.test_outbox --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff format services/mail/outbox.py services/mail/tests/test_outbox.py
venv/bin/ruff check --fix services/mail/outbox.py services/mail/tests/test_outbox.py
git add services/mail/outbox.py services/mail/tests/test_outbox.py
git commit -m "$(cat <<'EOF'
feat(mail): write gmail actions to the outbox and change the row at once

One row per label change, collapsed when an action undoes a pending one,
the folder and flags re-derived, muted kept, and the mailbox woken on
commit.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Incoming changes leave a pending label alone

**Files:**
- Modify: `services/mail/gmail_store.py` (module docstring; imports; new `held_keys`; `relabel`; `store_gmail`'s held branch)
- Modify: `services/mail/gmail_sync.py` (`_apply_history`, `_reconcile_page`)
- Test: `services/mail/tests/test_outbox_skip.py`

**Interfaces:**
- Consumes: `MailOutbox.LIVE`, `outbox.apply` (tests).
- Produces:
  - `gmail_store.held_keys(message_ids) -> defaultdict[int, set[str]]` (one query);
  - `gmail_store.relabel(connection, row, label_ids, now, held=frozenset())`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_outbox_skip.py`:

```python
"""Decision 3: while a change is pending or sending, Gmail's reports for that
label on that message are skipped and land in the row's `previous`; every
other label is taken from Gmail; once the row is sent, Gmail is the truth.
Through history, the reconcile and a store of a held id. A label made here
keeps its pending key."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from services.mail import gmail_store, gmail_sync, outbox
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox

from .gmail_fake import gmail_message
from .gmail_fixtures import GmailFixture

LATER = timedelta(hours=1)


class SkipFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        self.fake.add(gmail_message("g1"), quietly=True)
        self.mailbox = self.google(
            self.dana,
            history_id=self.fake.history_id,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
        )
        self.row, _ = gmail_store.store_gmail(self.mailbox, self.fake.messages["g1"], now=self.now)

    def act(self, op, label=None):
        pairs = [(self.row, change) for change in outbox.changes_for(op, label)]
        with transaction.atomic():
            outbox.apply(self.mailbox, pairs, now=self.now)
        # Not due yet: the flush must leave it for this test.
        MailOutbox.objects.update(next_attempt_at=self.now + LATER)

    def tick(self):
        gmail_sync.tick(MailboxConnection.objects.get(pk=self.mailbox.pk), now=self.now)
        self.row.refresh_from_db()


class HeldTests(SkipFixture):
    def test_held_keys_are_the_pending_and_sending_rows(self):
        self.act("archive")
        self.act("star")
        MailOutbox.objects.filter(label_key="STARRED").update(status="sending")
        self.assertEqual(gmail_store.held_keys([self.row.pk])[self.row.pk], {"INBOX", "STARRED"})
        MailOutbox.objects.update(status="sent")
        self.assertEqual(gmail_store.held_keys([self.row.pk]), {})

    def test_history_keeps_a_pending_label_and_takes_the_rest(self):
        self.act("archive")
        self.fake.relabel("g1", ["INBOX", "UNREAD", "STARRED"])
        self.tick()
        self.assertNotIn("INBOX", self.row.label_ids)
        self.assertEqual(
            (self.row.state, self.row.is_starred, self.row.is_read), ("done", True, False)
        )
        self.assertEqual(MailOutbox.objects.get().previous, {"present": True})

    def test_gmails_value_becomes_the_rows_previous(self):
        self.act("read")
        self.fake.relabel("g1", ["INBOX"])  # read in Gmail too
        self.tick()
        self.assertTrue(self.row.is_read)
        self.assertEqual(MailOutbox.objects.get().previous, {"present": False})

    def test_once_sent_gmail_is_the_truth_again(self):
        self.act("archive")
        MailOutbox.objects.update(status="sent")
        self.fake.relabel("g1", ["INBOX", "UNREAD"])
        self.tick()
        self.assertEqual((self.row.state, "INBOX" in self.row.label_ids), ("open", True))

    def test_the_reconcile_skips_it_too(self):
        self.act("archive")
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(reconcile_started_at=self.now)
        self.tick()
        self.assertNotIn("INBOX", self.row.label_ids)

    def test_a_store_of_a_held_id_skips_it_too(self):
        self.act("archive")
        gmail_store.store_gmail(self.mailbox, self.fake.messages["g1"], now=self.now)
        self.row.refresh_from_db()
        self.assertNotIn("INBOX", self.row.label_ids)

    def test_a_label_made_here_keeps_its_pending_key(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        self.act("label_add", label=made)
        self.fake.relabel("g1", ["INBOX"])
        self.tick()
        self.assertEqual(sorted(self.row.label_ids), ["INBOX", f"pending:{made.pk}"])
        self.assertEqual(MailMessage.objects.get().is_read, True)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_outbox_skip --parallel auto --noinput`
Expected: FAIL with `AttributeError: module 'services.mail.gmail_store' has no attribute 'held_keys'`, and the history tests fail on `INBOX` being restored.

- [ ] **Step 3: The skip rule in the store**

In `services/mail/gmail_store.py`, replace the module docstring's second paragraph sentence "`muted` is Revenact's own and never touched; `locally_changed_at` does not freeze a Google row (decision 11)." with:

```python
"""... `muted` is Revenact's own and never touched; `locally_changed_at` does
not freeze a Google row. D1's decision 11 (Gmail always wins) is superseded
for a label with a pending or sending outbox row (D2 decision 3): its local
presence is kept, and the row's `previous` takes what Gmail reported, so a
revert lands on Gmail's last word. Once the row is sent, Gmail wins again. ..."""
```

(Keep the rest of the docstring; only that sentence changes.)

Add to the imports:

```python
from collections import defaultdict
```

and change the models import to:

```python
from .models import MailAttachment, MailLabel, MailMessage, MailOutbox
```

After `_state`, add `held_keys` and replace `relabel`:

```python
def held_keys(message_ids):
    """For each message, the label keys with a pending or sending outbox row:
    what incoming Gmail changes leave alone (decision 3). One query."""
    held = defaultdict(set)
    rows = (
        MailOutbox.objects.filter(message_id__in=list(message_ids), status__in=MailOutbox.LIVE)
        .exclude(label_key="")
        .values_list("message_id", "label_key")
    )
    for message_id, key in rows:
        held[message_id].add(key)
    return held


def relabel(connection, row, label_ids, now, held=frozenset()):
    """Gmail changed this message's labels: take them and everything they
    mean, except the labels in `held`, which keep their local presence while
    their rows learn Gmail's (decision 3)."""
    label_ids = list(label_ids or [])
    if held:
        reported = set(label_ids)
        label_ids = [key for key in label_ids if key not in held]
        label_ids += [key for key in row.label_ids or [] if key in held]
        for key in held:
            MailOutbox.objects.filter(
                message=row, label_key=key, status__in=MailOutbox.LIVE
            ).update(previous={"present": key in reported})
    derived = derive(label_ids, from_address=row.from_address, own_address=connection.address)
    row.state = _state(row.state, derived.pop("archived"))
    for field, value in derived.items():
        setattr(row, field, value)
    row.label_ids = label_ids
    row.refreshed_at = now
    row.save(update_fields=LABEL_FIELDS)
```

In `store_gmail`, replace the held branch:

```python
    if held is not None:
        relabel(connection, held, label_ids, now, held=held_keys([held.pk]).get(held.pk, set()))
        return held, None
```

- [ ] **Step 4: Pass `held` from history and the reconcile**

In `services/mail/gmail_sync.py` `_apply_history`, after the `held = {...}` dict, add one query for every message on the page and pass it:

```python
    holds = gmail_store.held_keys([row.pk for row in held.values()])
    unknown = []
    for message_id, label_ids in changes.labels.items():
        row = held.get(message_id)
        if row is None:
            unknown.append(message_id)
            continue
        if label_ids is None:
            minimal = session.get_message(message_id, "minimal")
            if minimal is None:
                continue
            label_ids = minimal.get("labelIds", [])
        gmail_store.relabel(connection, row, label_ids, now, held=holds.get(row.pk, set()))
```

In `_reconcile_page`, the same:

```python
    holds = gmail_store.held_keys([row.pk for row in held.values()])
    for message_id, row in held.items():
        minimal = session.get_message(message_id, "minimal")
        if minimal is not None:
            gmail_store.relabel(
                connection, row, minimal.get("labelIds", []), now, held=holds.get(row.pk, set())
            )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/gmail_store.py services/mail/gmail_sync.py services/mail/tests/test_outbox_skip.py
venv/bin/ruff check --fix services/mail/gmail_store.py services/mail/gmail_sync.py services/mail/tests/test_outbox_skip.py
git add services/mail/gmail_store.py services/mail/gmail_sync.py services/mail/tests/test_outbox_skip.py
git commit -m "$(cat <<'EOF'
feat(mail): keep a pending label's local value when gmail reports a change

History, the reconcile and a store of a held id skip every label with a
pending or sending outbox row and record Gmail's value as its previous.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 5: The flush: claims, batches, single calls and the outcome classes

**Files:**
- Create: `services/mail/outbox_flush.py`
- Modify: `services/mail/gmail_sync.py` (new `_claimed_rows` and `ensure_claim`; `_save` uses `_claimed_rows`; `_run` flushes first)
- Test: `services/mail/tests/test_outbox_flush.py`

**Interfaces:**
- Consumes: `GmailSession.batch_modify/modify/trash/untrash` (Task 2), `outbox.apply` (Task 3, in tests), `gmail_sync.classify_failure`, `gmail_sync.Lost`.
- Produces:
  - `gmail_sync.ensure_claim(connection) -> None` (raises `Lost`);
  - `outbox_flush.SYSTEM_KEYS`, `outbox_flush.classify(exc) -> str` (`revoked`, `rate_limited`, `unavailable`, `not_found`, `label_gone`, `refused`);
  - `outbox_flush.retry_at(attempts, now) -> datetime`;
  - `outbox_flush.flush(connection, session, now) -> None`;
  - `outbox_flush.Flush` with `recover()`, `label_changes()`, `trash_changes()`, `_claim(rows, limit=None)`, `_back(rows, **fields)`, `_sent(rows)`, `_count(rows, reason)`, `_fail(rows, reason)`, `_call_failed(rows, exc)`, `failed: list[tuple[MailOutbox, str]]`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_outbox_flush.py`:

```python
"""The flush (contract §1, "The flush"): step 1 of every Google tick. Label
changes go grouped by (add, remove) in batchModify calls of at most
MAIL_OUTBOX_BATCH_SIZE ids; a batch Gmail refuses with 400 or 404 is retried
one message at a time; trash and untrash are single calls, capped per tick;
a crashed tick's rows recover uncounted; a lost claim stops before Gmail.
The outcome classes: 404 fails at once, 5xx counts and backs off, another
refusal counts, a rate limit or a lost grant counts nothing."""

from datetime import timedelta

from django.db import transaction
from django.test import override_settings
from django.utils import timezone

from services.mail import gmail_store, gmail_sync, outbox
from services.mail.models import MailboxConnection, MailLabel, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture


class FlushFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        for gmail_id in ("g1", "g2", "g3"):
            self.fake.add(gmail_message(gmail_id), quietly=True)
        self.mailbox = self.google(
            self.dana,
            history_id=self.fake.history_id,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
        )
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.rows = {
            gmail_id: gmail_store.store_gmail(
                self.mailbox, self.fake.messages[gmail_id], now=self.now
            )[0]
            for gmail_id in ("g1", "g2", "g3")
        }

    def act(self, op, *gmail_ids, label=None):
        messages = [self.rows[gmail_id] for gmail_id in gmail_ids]
        pairs = [(m, change) for m in messages for change in outbox.changes_for(op, label)]
        with transaction.atomic():
            outbox.apply(self.mailbox, pairs, now=self.now)

    def tick(self, now=None, **fields):
        connection = MailboxConnection.objects.get(pk=self.mailbox.pk)
        for name, value in fields.items():
            setattr(connection, name, value)
        result = gmail_sync.tick(connection, now=now or self.now)
        self.mailbox.refresh_from_db()
        return result

    def writes(self, route):
        return [body for where, body in self.fake.writes if where.endswith(route)]

    def statuses(self):
        return sorted(MailOutbox.objects.values_list("label_key", "status", "attempts"))


class BatchTests(FlushFixture):
    def test_one_batch_modify_per_change_set(self):
        self.act("archive", "g1", "g2")
        self.act("star", "g3")
        self.tick()
        self.assertEqual(
            self.writes("/batchModify"),
            [
                {"ids": ["g1", "g2"], "addLabelIds": [], "removeLabelIds": ["INBOX"]},
                {"ids": ["g3"], "addLabelIds": ["STARRED"], "removeLabelIds": []},
            ],
        )
        self.assertEqual(set(MailOutbox.objects.values_list("status", flat=True)), {"sent"})
        self.assertEqual(MailOutbox.objects.filter(sent_at=self.now).count(), 3)
        self.assertNotIn("INBOX", self.fake.messages["g1"]["labelIds"])

    def test_a_message_with_two_changes_goes_as_one_set(self):
        self.act("spam", "g1")
        self.tick()
        self.assertEqual(
            self.writes("/batchModify"),
            [{"ids": ["g1"], "addLabelIds": ["SPAM"], "removeLabelIds": ["INBOX"]}],
        )

    @override_settings(MAIL_OUTBOX_BATCH_SIZE=2)
    def test_a_batch_holds_at_most_the_batch_size(self):
        self.act("read", "g1", "g2", "g3")
        self.tick()
        self.assertEqual([len(body["ids"]) for body in self.writes("/batchModify")], [2, 1])

    def test_the_flush_runs_before_the_label_mirror_and_history(self):
        self.act("read", "g1")
        self.tick()
        paths = [where for _, where, _ in self.fake.calls]
        first_batch = next(i for i, p in enumerate(paths) if p.endswith("/batchModify"))
        first_labels = next(i for i, p in enumerate(paths) if p.endswith("/labels"))
        self.assertLess(first_batch, first_labels)

    def test_nothing_due_calls_nothing(self):
        self.act("read", "g1")
        MailOutbox.objects.update(next_attempt_at=self.now + timedelta(minutes=1))
        self.tick()
        self.assertEqual(self.writes("/batchModify"), [])
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 0)])

    def test_a_label_row_waits_for_its_label(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        self.act("label_add", "g1", label=made)
        self.tick()
        self.assertEqual(self.writes("/batchModify"), [])
        self.assertEqual(self.statuses(), [(f"pending:{made.pk}", "pending", 0)])


class SingleCallTests(FlushFixture):
    def test_a_batch_gmail_refuses_is_retried_one_message_at_a_time(self):
        self.act("archive", "g1", "g2")
        del self.fake.messages["g2"]  # gone from Gmail; history has not said so yet
        self.tick()
        self.assertEqual(len(self.writes("/batchModify")), 1)
        self.assertEqual(len(self.writes("/modify")), 2)
        g1, g2 = (MailOutbox.objects.get(message=self.rows[g]) for g in ("g1", "g2"))
        self.assertEqual((g1.status, g2.status, g2.reason), ("sent", "failed", "not_found"))
        self.assertEqual(g2.failed_at, self.now)

    @override_settings(MAIL_OUTBOX_SINGLE_CALLS_PER_TICK=1)
    def test_trash_is_one_call_a_message_and_capped(self):
        self.act("trash", "g1", "g2")
        self.tick()
        self.assertEqual(len(self.writes("/trash")), 1)
        self.assertEqual(
            sorted(MailOutbox.objects.values_list("status", "attempts")),
            [("pending", 0), ("sent", 0)],
        )
        self.tick()
        self.assertEqual(len(self.writes("/trash")), 2)

    def test_untrash(self):
        self.act("trash", "g1")
        self.tick()
        self.act("untrash", "g1")
        self.tick()
        self.assertEqual(len(self.writes("/untrash")), 1)
        self.assertNotIn("TRASH", self.fake.messages["g1"]["labelIds"])


class LeaseTests(FlushFixture):
    def test_a_crashed_ticks_rows_return_uncounted_and_go(self):
        self.act("read", "g1")
        MailOutbox.objects.update(status="sending", updated_at=self.now - timedelta(minutes=10))
        self.tick()
        self.assertEqual(self.statuses(), [("UNREAD", "sent", 0)])

    def test_a_recent_sending_row_is_left_to_its_tick(self):
        self.act("read", "g1")
        MailOutbox.objects.update(status="sending", updated_at=self.now)
        self.tick()
        self.assertEqual(self.statuses(), [("UNREAD", "sending", 0)])

    def test_a_lost_claim_stops_before_gmail_and_lets_the_rows_go(self):
        self.act("read", "g1")
        result = self.tick(lease_until=self.now + timedelta(minutes=5))  # not the row's stamp
        self.assertEqual(result.outcome, "lost")
        self.assertEqual(self.writes("/batchModify"), [])
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 0)])


class OutcomeTests(FlushFixture):
    def test_a_5xx_counts_waits_30_seconds_and_backs_the_mailbox_off(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 503)
        result = self.tick()
        row = MailOutbox.objects.get()
        self.assertEqual((row.status, row.attempts), ("pending", 1))
        self.assertEqual(row.next_attempt_at, self.now + timedelta(seconds=30))
        self.assertEqual(result.outcome, "backoff")
        self.assertIsNotNone(self.mailbox.backoff_until)

    def test_the_waits_and_the_fifth_failure(self):
        self.act("read", "g1")
        at = self.now
        for wait in (30, 120, 600, 3600):
            self.fake.fail("batchModify", 503)
            self.tick(now=at)
            row = MailOutbox.objects.get()
            self.assertEqual(row.next_attempt_at, at + timedelta(seconds=wait))
            at = row.next_attempt_at
        self.fake.fail("batchModify", 503)
        self.tick(now=at)
        row = MailOutbox.objects.get()
        self.assertEqual((row.status, row.reason, row.attempts), ("failed", "exhausted", 5))

    def test_a_rate_limit_counts_nothing(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 429, retry_after=120)
        result = self.tick()
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 0)])
        self.assertEqual(result.outcome, "backoff")
        self.assertGreaterEqual(self.mailbox.backoff_until, self.now + timedelta(seconds=120))

    def test_a_lost_permission_pauses_and_keeps_the_rows(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 403, "insufficientPermissions")
        self.assertEqual(self.tick().outcome, "revoked")
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 0)])
        self.assertEqual(self.mailbox.paused_reason, "token_revoked")

    def test_another_refusal_counts_without_a_backoff(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 403, "domainPolicy")
        self.assertEqual(self.tick().outcome, "ok")
        self.assertEqual(self.statuses(), [("UNREAD", "pending", 1)])
        self.assertIsNone(self.mailbox.backoff_until)

    def test_an_unknown_label_fails_as_gone(self):
        self.act("label_add", "g1", label=MailLabel.objects.get(gmail_id="Label_12"))
        self.fake.labels = [label for label in self.fake.labels if label["id"] != "Label_12"]
        self.tick()
        row = MailOutbox.objects.get()
        self.assertEqual((row.status, row.reason), ("failed", "label_gone"))

    def test_a_label_deleted_here_fails_without_a_call(self):
        renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.act("label_add", "g1", label=renewals)
        renewals.delete()
        self.fake.labels = [label for label in self.fake.labels if label["id"] != "Label_12"]
        self.tick()
        self.assertEqual(self.writes("/batchModify"), [])
        self.assertEqual(MailOutbox.objects.get().reason, "label_gone")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_outbox_flush --parallel auto --noinput`
Expected: FAIL: no `/batchModify` writes, because nothing flushes yet.

- [ ] **Step 3: The claim check in the tick**

In `services/mail/gmail_sync.py`, replace `_save` and add two helpers above it:

```python
def _claimed_rows(connection):
    """The connection's row while it is not disconnected and, inside a tick,
    still carries the tick's lease stamp."""
    rows = MailboxConnection.objects.filter(pk=connection.pk).exclude(
        status=MailboxConnection.Status.DISCONNECTED
    )
    claim = getattr(connection, "_claim", _UNCLAIMED)
    if claim is not _UNCLAIMED:
        rows = rows.filter(lease_until=claim)
    return rows


def ensure_claim(connection):
    """Before a Gmail write (the outbox flush): raises Lost when the claim is gone."""
    if not _claimed_rows(connection).exists():
        raise Lost


def _save(connection, fields):
    """UPDATE `fields` from `connection` (never a full save), only on a row
    that is not disconnected and, inside a tick, still holds the tick's
    claim. Returns whether the row was written."""
    if "updated_at" in fields:
        connection.updated_at = timezone.now()
    rows = _claimed_rows(connection)
    return bool(rows.update(**{name: getattr(connection, name) for name in fields}))
```

In `_run`, flush first:

```python
def _run(connection, session, result, now):
    from . import outbox_flush

    try:
        # D2: the person's changes go to Gmail before Gmail's come back.
        outbox_flush.flush(connection, session, now)
        gmail_store.mirror_labels(connection, session.labels())
```

(The rest of `_run` is unchanged. Update the module docstring's first paragraph to begin "The loop (services/mail/loop.py) claims a due mailbox and calls `tick`: the outbox flush (services/mail/outbox_flush.py), the label list, history …".)

- [ ] **Step 4: Write the flush**

Create `services/mail/outbox_flush.py`:

```python
"""Sending the outbox to Gmail: step 1 of every Google tick (contract §1,
"The flush").

Under the tick's lease, after recovering the rows a crashed tick left
`sending`: every label change grouped by message into (add, remove) sets and
sent with messages.batchModify, at most MAIL_OUTBOX_BATCH_SIZE ids a call (a
batch Gmail refuses with 400 or 404 is retried one message at a time with
modify, so one bad id fails alone); then trash and untrash, one call each,
at most MAIL_OUTBOX_SINGLE_CALLS_PER_TICK single calls a tick. A row whose
label Gmail has not created yet waits. Rows are `sending` during their call,
which runs outside any transaction; the claim is checked before every call.

What Gmail answers decides each row (decision 6): 2xx sent; a 404 on the
message fails it at once, as an unknown label does; a 5xx, no answer or
another refusal counts an attempt and waits MAIL_OUTBOX_RETRY_SECONDS
(a 5xx also stops the flush and backs the mailbox off); a rate limit or a
lost grant counts nothing, puts the rows back and stops, and the tick backs
the mailbox off or pauses it (gmail_sync._failed). No log line names a
message: the connection id, a status and a reason only.
"""

import logging
from collections import defaultdict
from datetime import timedelta

from django.conf import settings

from . import gmail_sync
from .models import PENDING_LABEL_PREFIX, MailLabel, MailOutbox
from .providers.base import RATE_LIMIT_REASONS, ProviderError

logger = logging.getLogger(__name__)
Op = MailOutbox.Op
Reason = MailOutbox.Reason
Status = MailOutbox.Status
#: Gmail's own label ids: never "gone".
SYSTEM_KEYS = frozenset(
    {"INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "UNREAD", "STARRED", "IMPORTANT"}
)


def classify(exc):
    """What a failed call means for its rows (decision 6)."""
    if gmail_sync.classify_failure(exc) != "backoff":
        return "revoked"  # a lost grant or insufficientPermissions: pause
    if exc.status == 429 or (exc.status == 403 and exc.reason in RATE_LIMIT_REASONS):
        return "rate_limited"
    if exc.status is None or exc.status >= 500:
        return "unavailable"
    if exc.status == 404:
        return "not_found"
    if exc.status == 400 and "Invalid label" in str(exc):
        return "label_gone"
    return "refused"


def retry_at(attempts, now):
    """When a row counted `attempts` times is due again."""
    waits = settings.MAIL_OUTBOX_RETRY_SECONDS
    return now + timedelta(seconds=waits[min(attempts, len(waits)) - 1])


def flush(connection, session, now):
    """Send this mailbox's due rows. Raises the ProviderError the tick must
    handle (a 5xx, a rate limit, a lost grant) or gmail_sync.Lost, after
    putting back every row it claimed and did not settle."""
    run = Flush(connection, session, now)
    try:
        run.recover()
        run.label_changes()
        run.trash_changes()
    finally:
        run.release()


class Flush:
    """One flush of one mailbox's outbox."""

    def __init__(self, connection, session, now):
        self.connection, self.session, self.now = connection, session, now
        self.claimed = set()
        self.single_calls = 0
        #: (row, reason) failed by this flush, for the notices.
        self.failed = []

    # --- claiming and settling -----------------------------------------
    def _due(self):
        return MailOutbox.objects.filter(
            connection=self.connection, status=Status.PENDING, next_attempt_at__lte=self.now
        )

    def _claim(self, rows, limit=None):
        """Mark `rows` sending (oldest first) and return them, message and label
        joined. A row a request changed meanwhile is re-read; one it deleted
        or another flush took is skipped."""
        ids = list(rows.order_by("created_at", "pk").values_list("pk", flat=True)[:limit])
        if not ids:
            return []
        MailOutbox.objects.filter(pk__in=ids, status=Status.PENDING).update(
            status=Status.SENDING, updated_at=self.now
        )
        claimed = list(
            MailOutbox.objects.filter(pk__in=ids, status=Status.SENDING)
            .select_related("message", "label")
            .order_by("created_at", "pk")
        )
        self.claimed.update(row.pk for row in claimed)
        return claimed

    def _settled(self, rows):
        self.claimed.difference_update(row.pk for row in rows)

    def _newer(self, rows):
        """The pending row now on each (message, label) of `rows`, if any: an
        action made while they were sending (decision 4)."""
        keys = {(row.message_id, row.label_key) for row in rows if row.message_id is not None}
        if not keys:
            return {}
        found = MailOutbox.objects.filter(
            status=Status.PENDING, message_id__in={message_id for message_id, _ in keys}
        ).exclude(pk__in=[row.pk for row in rows])
        return {
            (row.message_id, row.label_key): row
            for row in found
            if (row.message_id, row.label_key) in keys
        }

    def _back(self, rows, **fields):
        """Pending again (with `fields`). A row whose pair has a newer pending
        row gives it its `previous` and goes (plan gap 7)."""
        if not rows:
            return
        newer = self._newer(rows)
        back = []
        for row in rows:
            other = newer.get((row.message_id, row.label_key))
            if other is None:
                back.append(row.pk)
                continue
            MailOutbox.objects.filter(pk=other.pk).update(previous=row.previous)
            row.delete()
        MailOutbox.objects.filter(pk__in=back).update(
            status=Status.PENDING, updated_at=self.now, **fields
        )
        self._settled(rows)

    def release(self):
        """Everything this flush claimed and did not settle: pending, uncounted."""
        self._back(list(MailOutbox.objects.filter(pk__in=self.claimed, status=Status.SENDING)))

    def recover(self):
        """Rows a crashed tick left sending past the lease: pending, uncounted."""
        stale = self.now - timedelta(seconds=settings.MAIL_LEASE_SECONDS)
        self._back(
            list(
                MailOutbox.objects.filter(
                    connection=self.connection, status=Status.SENDING, updated_at__lt=stale
                )
            )
        )

    def _sent(self, rows):
        MailOutbox.objects.filter(pk__in=[row.pk for row in rows]).update(
            status=Status.SENT, sent_at=self.now, updated_at=self.now
        )
        self._settled(rows)

    def _fail(self, rows, reason):
        if not rows:
            return
        MailOutbox.objects.filter(pk__in=[row.pk for row in rows]).update(
            status=Status.FAILED, reason=reason, failed_at=self.now, updated_at=self.now
        )
        self._settled(rows)
        self.failed.extend((row, reason) for row in rows)

    def _count(self, rows, reason):
        """One counted attempt each: failed at MAIL_OUTBOX_MAX_ATTEMPTS with
        `reason`, else pending after the wait for that attempt."""
        spent, waiting = [], defaultdict(list)
        for row in rows:
            attempts = row.attempts + 1
            if attempts >= settings.MAIL_OUTBOX_MAX_ATTEMPTS:
                row.attempts = attempts
                spent.append(row)
            else:
                waiting[attempts].append(row)
        MailOutbox.objects.filter(pk__in=[row.pk for row in spent]).update(
            attempts=settings.MAIL_OUTBOX_MAX_ATTEMPTS
        )
        self._fail(spent, reason)
        for attempts, group in waiting.items():
            self._back(group, attempts=attempts, next_attempt_at=retry_at(attempts, self.now))

    def _call_failed(self, rows, exc):
        """A Gmail call for `rows` failed: settle them by its class, and
        re-raise what the tick handles."""
        kind = classify(exc)
        logger.warning(
            "gmail outbox call failed for connection %s: %s %s",
            self.connection.pk,
            exc.status,
            exc.reason,
        )
        if kind == "not_found":
            self._fail(rows, Reason.NOT_FOUND)
        elif kind == "label_gone":
            self._fail(rows, Reason.LABEL_GONE)
        elif kind == "refused":
            self._count(rows, Reason.REFUSED)
        elif kind == "unavailable":
            self._count(rows, Reason.EXHAUSTED)
            raise exc
        else:  # a rate limit or a lost grant: not the rows' fault
            self._back(rows)
            raise exc

    # --- label changes --------------------------------------------------
    def label_changes(self):
        rows = self._claim(
            self._due()
            .exclude(op=Op.LABEL_CREATE)
            .exclude(label_key="TRASH")
            .exclude(label_key__startswith=PENDING_LABEL_PREFIX)
        )
        if not rows:
            return
        wanted = {row.label_key for row in rows} - SYSTEM_KEYS
        known = set(
            MailLabel.objects.filter(connection=self.connection, gmail_id__in=wanted).values_list(
                "gmail_id", flat=True
            )
        )
        gone = [row for row in rows if row.label_key in wanted and row.label_key not in known]
        self._fail(gone, Reason.LABEL_GONE)
        gone_ids = {row.pk for row in gone}
        by_message = defaultdict(list)
        for row in rows:
            if row.pk not in gone_ids:
                by_message[row.message_id].append(row)
        groups = defaultdict(list)
        for members in by_message.values():
            add = tuple(sorted(row.label_key for row in members if row.add))
            remove = tuple(sorted(row.label_key for row in members if not row.add))
            groups[(add, remove)].append(members)
        size = settings.MAIL_OUTBOX_BATCH_SIZE
        for (add, remove), messages in groups.items():
            for start in range(0, len(messages), size):
                self._batch(list(add), list(remove), messages[start : start + size])

    def _batch(self, add, remove, messages):
        rows = [row for members in messages for row in members]
        gmail_sync.ensure_claim(self.connection)
        try:
            self.session.batch_modify(
                [members[0].message.provider_message_id for members in messages], add, remove
            )
        except ProviderError as exc:
            if exc.status not in (400, 404):
                self._call_failed(rows, exc)
                return
            for members in messages:
                self._single(add, remove, members)
            return
        self._sent(rows)

    def _single(self, add, remove, members):
        if self.single_calls >= settings.MAIL_OUTBOX_SINGLE_CALLS_PER_TICK:
            self._back(members)
            return
        self.single_calls += 1
        gmail_sync.ensure_claim(self.connection)
        try:
            self.session.modify(members[0].message.provider_message_id, add, remove)
        except ProviderError as exc:
            self._call_failed(members, exc)
            return
        self._sent(members)

    # --- trash and untrash ------------------------------------------------
    def trash_changes(self):
        room = settings.MAIL_OUTBOX_SINGLE_CALLS_PER_TICK - self.single_calls
        if room <= 0:
            return
        for row in self._claim(self._due().filter(label_key="TRASH"), limit=room):
            self.single_calls += 1
            gmail_sync.ensure_claim(self.connection)
            call = self.session.trash if row.add else self.session.untrash
            try:
                call(row.message.provider_message_id)
            except ProviderError as exc:
                self._call_failed([row], exc)
                continue
            self._sent([row])
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/outbox_flush.py services/mail/gmail_sync.py services/mail/tests/test_outbox_flush.py
venv/bin/ruff check --fix services/mail/outbox_flush.py services/mail/gmail_sync.py services/mail/tests/test_outbox_flush.py
git add services/mail/outbox_flush.py services/mail/gmail_sync.py services/mail/tests/test_outbox_flush.py
git commit -m "$(cat <<'EOF'
feat(mail): flush the outbox to gmail at the start of every tick

batchModify per change set, single modify when a batch is refused, trash
and untrash capped per tick, crashed rows recovered, the claim checked
before each call, and retries or backoff by the answer's class.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 6: Failures: revert, the hand-off to a newer row, and one notice per action

**Files:**
- Modify: `services/mail/outbox.py` (append the sentences)
- Modify: `services/mail/outbox_flush.py` (imports; `flush`; new `revert`, `notice`; `Flush._fail`; new `Flush.notify`)
- Test: `services/mail/tests/test_outbox_failures.py`

**Interfaces:**
- Consumes: Task 5's `Flush`, `FlushFixture` (tests), `outbox.set_presence`, `outbox.rederive`, `outbox.LOCAL_FIELDS`, `realtime.notify`.
- Produces:
  - `outbox.VERBS`, `outbox.CLAUSES`, `outbox.verb(op, name="") -> str`, `outbox.label_name(row) -> str`, `outbox.sentence(op, reason, name="") -> str`;
  - `outbox_flush.revert(connection, rows) -> None` (in the caller's transaction);
  - `outbox_flush.notice(rows, reason) -> tuple[str, str]` (message, link);
  - `outbox_flush.COMMUNICATIONS = "/communications?source=mailbox:google"`;
  - `Flush._fail` now reverts in one transaction; `Flush.notify()` runs at the end of every flush.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_outbox_failures.py`:

```python
"""When Gmail will not take a change (contract §1 "On failure", §5): the
change is undone here unless a newer action on the same label stands (it
takes the failed row's previous, or goes when that is its own target);
then one notice per action and reason, counted in conversations, linked to
the newest affected message, and never twice for one action and reason."""

from datetime import timedelta

from django.test import SimpleTestCase, override_settings

from services.mail import gmail_store, outbox, outbox_flush
from services.mail.models import MailLabel, MailMessage, MailOutbox
from services.notifications.models import Notification

from .gmail_fake import gmail_message
from .test_outbox_flush import FlushFixture

LINK = "/communications?source=mailbox:google"


class SentenceTests(SimpleTestCase):
    def test_every_verb_and_clause(self):
        cases = [
            (
                ("read", "not_found"),
                "Couldn't mark as read in Gmail: the message no longer exists.",
            ),
            (
                ("unread", "exhausted"),
                "Couldn't mark as unread in Gmail: Gmail didn't answer after several tries.",
            ),
            (("star", "refused"), "Couldn't star in Gmail: Gmail refused the change."),
            (("unstar", "refused"), "Couldn't unstar in Gmail: Gmail refused the change."),
            (("archive", "not_found"), "Couldn't archive in Gmail: the message no longer exists."),
            (
                ("inbox", "refused"),
                "Couldn't move to the Inbox in Gmail: Gmail refused the change.",
            ),
            (("trash", "refused"), "Couldn't delete in Gmail: Gmail refused the change."),
            (("untrash", "refused"), "Couldn't restore in Gmail: Gmail refused the change."),
            (("spam", "refused"), "Couldn't report spam in Gmail: Gmail refused the change."),
            (
                ("not_spam", "refused"),
                "Couldn't mark as not spam in Gmail: Gmail refused the change.",
            ),
            (
                ("label_add", "label_gone", "Renewals"),
                'Couldn\'t label "Renewals" in Gmail: the label no longer exists.',
            ),
            (
                ("label_remove", "refused", "Renewals"),
                'Couldn\'t remove the label "Renewals" in Gmail: Gmail refused the change.',
            ),
            (
                ("label_create", "name_refused", "Pilot"),
                'Couldn\'t create the label "Pilot" in Gmail: Gmail refused the name.',
            ),
        ]
        for args, expected in cases:
            self.assertEqual(outbox.sentence(*args), expected)


class RevertTests(FlushFixture):
    def message(self, gmail_id):
        return MailMessage.objects.get(pk=self.rows[gmail_id].pk)

    def test_a_message_gone_from_gmail_fails_at_once_and_is_put_back(self):
        self.act("archive", "g1")
        del self.fake.messages["g1"]
        self.tick()
        row = MailOutbox.objects.get()
        self.assertEqual((row.status, row.reason, row.attempts), ("failed", "not_found", 0))
        g1 = self.message("g1")
        self.assertEqual(("INBOX" in g1.label_ids, g1.state), (True, "open"))

    def test_a_gone_label_comes_off_the_message(self):
        renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.act("label_add", "g1", label=renewals)
        renewals.delete()
        self.tick()
        self.assertNotIn("Label_12", self.message("g1").label_ids)

    def test_a_newer_action_on_a_sending_row_stands_when_it_fails(self):
        self.act("archive", "g1")
        MailOutbox.objects.update(status="sending")
        self.act("inbox", "g1")  # back to the Inbox while the archive is on its way
        sending = MailOutbox.objects.select_related("message").get(status="sending")
        outbox_flush.Flush(self.mailbox, None, self.now)._fail([sending], "not_found")
        # The newer row's target is what Gmail still has: nothing left to send.
        self.assertEqual(list(MailOutbox.objects.values_list("status", flat=True)), ["failed"])
        g1 = self.message("g1")
        self.assertEqual(("INBOX" in g1.label_ids, g1.state), (True, "open"))


class NoticeTests(FlushFixture):
    def store_thread(self, *gmail_ids):
        for gmail_id in gmail_ids:
            self.fake.add(gmail_message(gmail_id, thread_id="t-1"), quietly=True)
            self.rows[gmail_id] = gmail_store.store_gmail(
                self.mailbox, self.fake.messages[gmail_id], now=self.now
            )[0]

    def test_one_notice_with_the_sentence_and_a_link(self):
        self.act("archive", "g1")
        del self.fake.messages["g1"]
        self.tick()
        note = Notification.objects.get()
        self.assertEqual(
            (note.recipient, note.actor, note.kind, note.message, note.link),
            (
                self.dana,
                None,
                "mail_action_failed",
                "Couldn't archive in Gmail: the message no longer exists.",
                f"{LINK}&message={self.rows['g1'].pk}",
            ),
        )

    def test_a_bulk_failure_is_one_notice_counting_conversations(self):
        self.act("archive", "g1", "g2", "g3")
        for gmail_id in ("g1", "g2", "g3"):
            del self.fake.messages[gmail_id]
        self.tick()
        note = Notification.objects.get()
        self.assertEqual(
            note.message,
            "Couldn't archive 3 conversations in Gmail: the message no longer exists.",
        )
        self.assertEqual(note.link, f"{LINK}&message={self.rows['g3'].pk}")

    def test_messages_of_one_thread_are_one_conversation(self):
        self.store_thread("t1", "t2")
        self.act("archive", "t1", "t2")
        for gmail_id in ("t1", "t2"):
            del self.fake.messages[gmail_id]
        self.tick()
        self.assertEqual(
            Notification.objects.get().message,
            "Couldn't archive in Gmail: the message no longer exists.",
        )

    @override_settings(MAIL_OUTBOX_SINGLE_CALLS_PER_TICK=1)
    def test_told_once_per_action_and_reason_across_ticks(self):
        self.act("trash", "g1", "g2")
        for gmail_id in ("g1", "g2"):
            del self.fake.messages[gmail_id]
        self.tick()
        self.tick(now=self.now + timedelta(seconds=5))
        self.assertEqual(MailOutbox.objects.filter(status="failed").count(), 2)
        self.assertEqual(Notification.objects.count(), 1)

    @override_settings(MAIL_OUTBOX_MAX_ATTEMPTS=1)
    def test_each_reason_is_its_own_notice(self):
        self.act("read", "g1")
        self.fake.fail("batchModify", 503)
        self.tick()
        self.act("star", "g2")
        self.fake.fail("batchModify", 403, "domainPolicy")
        self.tick(now=self.now + timedelta(seconds=5))
        self.assertEqual(
            list(Notification.objects.order_by("pk").values_list("message", flat=True)),
            [
                "Couldn't mark as read in Gmail: Gmail didn't answer after several tries.",
                "Couldn't star in Gmail: Gmail refused the change.",
            ],
        )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_outbox_failures --parallel auto --noinput`
Expected: FAIL with `AttributeError: module 'services.mail.outbox' has no attribute 'sentence'`.

- [ ] **Step 3: The sentences**

Append to `services/mail/outbox.py`:

```python
Reason = MailOutbox.Reason

#: The notice's verb for each op (contract §5). Label ops name their label.
VERBS = {
    Op.READ: "mark as read",
    Op.UNREAD: "mark as unread",
    Op.STAR: "star",
    Op.UNSTAR: "unstar",
    Op.ARCHIVE: "archive",
    Op.INBOX: "move to the Inbox",
    Op.TRASH: "delete",
    Op.UNTRASH: "restore",
    Op.SPAM: "report spam",
    Op.NOT_SPAM: "mark as not spam",
}
#: The notice's clause for each failure reason.
CLAUSES = {
    Reason.NOT_FOUND: "the message no longer exists",
    Reason.LABEL_GONE: "the label no longer exists",
    Reason.REFUSED: "Gmail refused the change",
    Reason.EXHAUSTED: "Gmail didn't answer after several tries",
    Reason.NAME_REFUSED: "Gmail refused the name",
}


def verb(op, name=""):
    if op == Op.LABEL_ADD:
        return f'label "{name}"'
    if op == Op.LABEL_REMOVE:
        return f'remove the label "{name}"'
    if op == Op.LABEL_CREATE:
        return f'create the label "{name}"'
    return VERBS[op]


def label_name(row):
    """The owner's own label name a row carries (plan gap 6); "" otherwise."""
    return row.payload.get("label") or row.payload.get("name") or ""


def sentence(op, reason, name=""):
    """ "Couldn't <verb> in Gmail: <clause>.": no subject, no address."""
    return f"Couldn't {verb(op, name)} in Gmail: {CLAUSES[reason]}."
```

- [ ] **Step 4: Revert, hand-off and notices in the flush**

In `services/mail/outbox_flush.py`, extend the imports:

```python
from django.conf import settings
from django.db import transaction

from services.notifications.models import Notification
from services.notifications.realtime import notify

from . import gmail_sync, outbox
from .models import PENDING_LABEL_PREFIX, MailLabel, MailMessage, MailOutbox
from .providers.base import RATE_LIMIT_REASONS, ProviderError
```

Add after `SYSTEM_KEYS`:

```python
#: Where a notice sends the owner (contract §5).
COMMUNICATIONS = "/communications?source=mailbox:google"
```

Replace `flush` so the notices go out whatever happened:

```python
def flush(connection, session, now):
    """Send this mailbox's due rows. Raises the ProviderError the tick must
    handle (a 5xx, a rate limit, a lost grant) or gmail_sync.Lost, after
    putting back every row it claimed and did not settle, and telling the
    owner about the ones that failed."""
    run = Flush(connection, session, now)
    try:
        run.recover()
        run.label_changes()
        run.trash_changes()
    finally:
        run.release()
        run.notify()
```

Add these module functions after `retry_at`:

```python
def revert(connection, rows):
    """Undo failed label changes here, in the caller's transaction (contract
    §1 "On failure"). Each label goes back to `previous`, then the folder and
    flags are re-derived. When a newer pending row stands on the same label,
    it takes over instead: it inherits `previous`, and goes when that is
    already its target (decision 4)."""
    rows = [row for row in rows if row.message_id is not None]
    if not rows:
        return
    keys = {(row.message_id, row.label_key) for row in rows}
    message_ids = {message_id for message_id, _ in keys}
    messages = {
        message.pk: message
        for message in MailMessage.objects.select_for_update().filter(pk__in=message_ids)
    }
    newer = {
        (other.message_id, other.label_key): other
        for other in MailOutbox.objects.select_for_update().filter(
            status=Status.PENDING, message_id__in=message_ids
        )
        if (other.message_id, other.label_key) in keys
    }
    dirty = {}
    for row in rows:
        present = bool(row.previous.get("present"))
        other = newer.get((row.message_id, row.label_key))
        if other is not None:
            if other.add == present:
                other.delete()
            else:
                MailOutbox.objects.filter(pk=other.pk).update(previous=row.previous)
            continue
        message = messages.get(row.message_id)
        if message is None:
            continue
        outbox.set_presence(message, row.label_key, present)
        dirty[message.pk] = message
    for message in dirty.values():
        outbox.rederive(connection, message)
    if dirty:
        MailMessage.objects.bulk_update(list(dirty.values()), outbox.LOCAL_FIELDS)


def notice(rows, reason):
    """The one notice for an action's rows that failed for `reason` (decision
    22): the sentence for one conversation, a count for more, and a link to
    the newest affected message still held. Never a subject or an address."""
    first = rows[0]
    name = outbox.label_name(first)
    with_message = [row for row in rows if row.message_id is not None]
    conversations = len({row.message.thread_id or f"m{row.message_id}" for row in with_message})
    if conversations <= 1:
        text = outbox.sentence(first.op, reason, name)
    else:
        text = (
            f"Couldn't {outbox.verb(first.op, name)} {conversations} conversations in Gmail: "
            f"{outbox.CLAUSES[reason]}."
        )
    newest = (
        MailMessage.objects.filter(pk__in=[row.message_id for row in with_message])
        .order_by("-sent_at", "-id")
        .values_list("pk", flat=True)
        .first()
    )
    return text, f"{COMMUNICATIONS}&message={newest}" if newest else COMMUNICATIONS
```

Replace `Flush._fail` and add `Flush.notify` after it:

```python
    def _fail(self, rows, reason):
        """Failed now: marked and undone here in one transaction; the notice
        waits for the end of the flush."""
        if not rows:
            return
        with transaction.atomic():
            MailOutbox.objects.filter(pk__in=[row.pk for row in rows]).update(
                status=Status.FAILED, reason=reason, failed_at=self.now, updated_at=self.now
            )
            revert(self.connection, rows)
        self._settled(rows)
        self.failed.extend((row, reason) for row in rows)


    def notify(self):
        """One mail_action_failed per (action, reason) failed in this flush,
        unless an earlier flush already failed that action for that reason
        (plan gap 9). To the mailbox owner, from nobody."""
        groups = defaultdict(list)
        for row, reason in self.failed:
            groups[(row.action_id, reason)].append(row)
        for (action_id, reason), rows in groups.items():
            told = MailOutbox.objects.filter(
                action_id=action_id, reason=reason, status=Status.FAILED, failed_at__lt=self.now
            ).exists()
            if told:
                continue
            text, link = notice(rows, reason)
            notify(
                recipient=self.connection.user,
                actor=None,
                kind=Notification.Kind.MAIL_ACTION_FAILED,
                message=text,
                link=link,
                push_on_commit=True,
            )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/outbox.py services/mail/outbox_flush.py services/mail/tests/test_outbox_failures.py
venv/bin/ruff check --fix services/mail/outbox.py services/mail/outbox_flush.py services/mail/tests/test_outbox_failures.py
git add services/mail/outbox.py services/mail/outbox_flush.py services/mail/tests/test_outbox_failures.py
git commit -m "$(cat <<'EOF'
feat(mail): undo a change gmail refused and tell the owner once

A failed row puts its label back unless a newer action on it stands; one
mail_action_failed notice per action and reason, counted in
conversations and linked to the newest message.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 7: Labels: create here, create in Gmail, unread counts

**Files:**
- Create: `services/mail/actions.py` (the shared answers and the check-3-to-6 refusal; Task 9 adds the rest)
- Modify: `services/mail/outbox.py` (append `create_label`, `label_created`, `unwind_label`)
- Modify: `services/mail/outbox_flush.py` (`flush`; new `Flush.label_creates` and `Flush._named`; `Flush._fail`)
- Modify: `services/mail/serializers.py` (`label_payload`, `labels_by_gmail_id`)
- Modify: `services/mail/views.py` (imports; `MailLabelListView`; new `unread_by_label`)
- Modify: `services/mail/tests/test_reading.py` (the label shapes)
- Test: `services/mail/tests/test_labels.py`

**Interfaces:**
- Consumes: `outbox.wake`, `MailLabel.key`, `gates.paused_response`, `FlushFixture` (tests).
- Produces:
  - `actions.NO_MAILBOX`, `actions.TWO_WAY_OFF`, `actions.GMAIL_ONLY`, `actions.CHOOSE_LABEL` (sentences);
  - `actions.MUTE = "mute"`, `actions.UNMUTE = "unmute"`, `actions.LOCAL_OPS`, `actions.GMAIL_ONLY_OPS`;
  - `actions.error(code, detail, http_status, **extra) -> Response`;
  - `actions.refusal(connection, steps: list[tuple[str, MailLabel | None]]) -> Response | None` (checks 3–6);
  - `outbox.create_label(connection, name, *, now=None) -> MailLabel`;
  - `outbox.label_created(connection, label, gmail_id) -> MailLabel` (the label that stays);
  - `outbox.unwind_label(connection, label) -> None`;
  - `serializers.label_payload(label) -> {"id", "name", "color", "pending"}`;
  - `serializers.labels_by_gmail_id(user) -> dict[str, dict]`, keyed by `MailLabel.key` (pending labels included);
  - `views.unread_by_label(connection) -> dict[str, int]`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_labels.py`:

```python
"""Labels (contract §4): the sidebar list with unread conversations and
labels made here (pending), POST to make one (refusals in order), and the
flush creating it in Gmail: the pending key becomes Gmail's id everywhere,
a name Gmail already has is adopted, a refused name unwinds the label and
tells the owner once. Nobody else's labels, ever."""

from datetime import timedelta

from django.db import connection as db
from django.db import transaction
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.billing.models import SeatAssignment
from services.mail import gmail_store, outbox
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox
from services.notifications.models import Notification

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture
from .test_outbox_flush import FlushFixture

URL = "/api/v1/mail/labels/"
RENEWALS_COLOR = {"background": "#16a766", "text": "#ffffff"}
READ_ONLY = ["https://www.googleapis.com/auth/gmail.readonly"]


class LabelFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        full = fixture("message_full.json")  # INBOX UNREAD IMPORTANT Label_12
        self.row, _ = gmail_store.store_gmail(self.mailbox, full, now=self.now)
        for message in (
            # The same conversation: still one unread conversation for Renewals.
            gmail_message("u2", labels=["INBOX", "UNREAD", "Label_12"], thread_id=full["threadId"]),
            gmail_message("u3", labels=["TRASH", "UNREAD", "Label_12"]),  # trash: not counted
            gmail_message("u4", labels=["INBOX", "Label_19"]),  # read: not counted
        ):
            gmail_store.store_gmail(self.mailbox, message, now=self.now)
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.vendors = MailLabel.objects.get(gmail_id="Label_19")
        self.client.force_authenticate(self.dana)

    def create(self, name="Pilot"):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(URL, {"name": name}, format="json")


class LabelListTests(LabelFixture):
    def test_my_labels_by_name_with_unread_conversations(self):
        self.assertEqual(
            self.client.get(URL).data,
            [
                {
                    "id": self.renewals.pk,
                    "gmail_id": "Label_12",
                    "name": "Renewals",
                    "color": RENEWALS_COLOR,
                    "unread": 1,
                    "pending": False,
                },
                {
                    "id": self.vendors.pk,
                    "gmail_id": "Label_19",
                    "name": "Vendors/Billing",
                    "color": None,
                    "unread": 0,
                    "pending": False,
                },
            ],
        )

    def test_a_label_made_here_is_listed_and_shown_on_messages_as_pending(self):
        made = self.create().data
        label = MailLabel.objects.get(pk=made["id"])
        with transaction.atomic():
            outbox.apply(
                self.mailbox, [(self.row, c) for c in outbox.changes_for("label_add", label)]
            )
        listed = next(row for row in self.client.get(URL).data if row["id"] == label.pk)
        self.assertEqual(
            listed,
            {
                "id": label.pk,
                "gmail_id": None,
                "name": "Pilot",
                "color": None,
                "unread": 1,
                "pending": True,
            },
        )
        message = self.client.get(f"/api/v1/mail/messages/{self.row.pk}/").data
        self.assertIn(
            {"id": label.pk, "name": "Pilot", "color": None, "pending": True}, message["labels"]
        )

    def test_three_queries_whatever_the_number_of_labels(self):
        self.client.get(URL)
        with CaptureQueriesContext(db) as queries:
            self.client.get(URL)
        self.assertLessEqual(len(queries), 3)

    def test_nobody_elses_labels(self):
        for person in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(person)
            self.assertEqual(self.client.get(URL).data, [])


class LabelCreateTests(LabelFixture):
    def test_a_label_is_made_here_at_once_and_queued_for_gmail(self):
        response = self.create("  Pilot  ")
        self.assertEqual(response.status_code, 201, response.data)
        label = MailLabel.objects.get(pk=response.data["id"])
        self.assertEqual(
            response.data,
            {
                "id": label.pk,
                "gmail_id": None,
                "name": "Pilot",
                "color": None,
                "unread": 0,
                "pending": True,
            },
        )
        self.assertEqual((label.gmail_id, label.type, label.connection), ("", "user", self.mailbox))
        row = MailOutbox.objects.get()
        self.assertEqual(
            (row.op, row.label, row.message, row.payload),
            ("label_create", label, None, {"name": "Pilot"}),
        )
        self.mailbox.refresh_from_db()
        self.assertIsNotNone(self.mailbox.wake_at)

    def test_names_gmail_would_refuse(self):
        for name, sentence in (
            ("   ", "Name the label."),
            ("x" * 226, "Keep the name under 225 characters."),
            ("inbox", "Gmail keeps that name for itself."),
            ("Category_Social", "Gmail keeps that name for itself."),
        ):
            response = self.create(name)
            self.assertEqual(
                (response.status_code, response.data), (400, {"name": [sentence]}), name
            )
        self.assertEqual(self.create("x" * 225).status_code, 201)

    def test_a_name_i_already_have(self):
        response = self.create("renewals")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data,
            {
                "code": "LABEL_EXISTS",
                "detail": "You already have a label called Renewals.",
                "label_id": self.renewals.pk,
            },
        )

    def test_outlook_and_imap_have_no_labels(self):
        self.connect(self.priya)
        self.client.force_authenticate(self.priya)
        response = self.create()
        self.assertEqual((response.status_code, response.data["code"]), (400, "GMAIL_ONLY"))

    def test_no_mailbox_a_paused_one_and_a_read_only_one(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.create().data["code"], "NO_MAILBOX")
        self.client.force_authenticate(self.dana)
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        paused = self.create()
        self.assertEqual(
            (paused.status_code, paused.data["code"], paused.data["paused_reason"]),
            (409, "MAILBOX_PAUSED", "no_seat"),
        )
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=None)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(granted_scopes=READ_ONLY)
        self.dana.refresh_from_db()
        self.client.force_authenticate(self.dana)
        off = self.create()
        self.assertEqual(
            (off.status_code, off.data),
            (
                409,
                {
                    "code": "TWO_WAY_OFF",
                    "detail": "Reconnect Google to turn on two-way: changes here can't reach Gmail yet.",
                    "needs_reconnect": True,
                },
            ),
        )
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        self.dana.refresh_from_db()
        self.client.force_authenticate(self.dana)
        self.assertEqual(
            self.create().data,
            {"code": "NO_MAILBOX", "detail": "This message's mailbox is no longer connected."},
        )
        self.assertFalse(MailOutbox.objects.exists())


class LabelFlushTests(FlushFixture):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.dana)

    def made(self, name="Pilot"):
        response = self.client.post(URL, {"name": name}, format="json")
        label = MailLabel.objects.get(pk=response.data["id"])
        # Queued a moment after the fixture's `now`: due at it, for tick().
        MailOutbox.objects.filter(op="label_create").update(next_attempt_at=self.now)
        with transaction.atomic():
            outbox.apply(
                self.mailbox,
                [(self.rows["g1"], c) for c in outbox.changes_for("label_add", label)],
                now=self.now,
            )
        return label

    def test_gmail_makes_it_and_the_pending_key_becomes_its_id(self):
        label = self.made()
        self.tick()
        label.refresh_from_db()
        self.assertTrue(label.gmail_id.startswith("Label_"))
        g1 = MailMessage.objects.get(pk=self.rows["g1"].pk)
        self.assertIn(label.gmail_id, g1.label_ids)
        self.assertNotIn(f"pending:{label.pk}", g1.label_ids)
        self.assertEqual(
            sorted(MailOutbox.objects.values_list("op", "label_key", "status")),
            [("label_add", label.gmail_id, "sent"), ("label_create", "", "sent")],
        )
        # Created first, then applied in the same tick.
        self.assertIn(label.gmail_id, self.fake.messages["g1"]["labelIds"])

    def test_a_name_gmail_already_has_is_adopted(self):
        self.fake.labels.append({"id": "Label_77", "name": "pilot", "type": "user"})
        label = self.made()
        self.tick()
        label.refresh_from_db()
        self.assertEqual(label.gmail_id, "Label_77")
        self.assertIn("Label_77", self.fake.messages["g1"]["labelIds"])

    def test_a_label_the_mirror_already_holds_is_merged(self):
        label = self.made()
        MailOutbox.objects.filter(op="label_create").update(
            next_attempt_at=self.now + timedelta(hours=1)
        )
        self.fake.labels.append({"id": "Label_77", "name": "Pilot", "type": "user"})
        self.tick()  # the mirror brings Gmail's Pilot in beside ours
        MailOutbox.objects.filter(op="label_create").update(next_attempt_at=self.now)
        self.tick()
        self.assertEqual(
            list(MailLabel.objects.filter(name="Pilot").values_list("gmail_id", flat=True)),
            ["Label_77"],
        )
        self.assertFalse(MailLabel.objects.filter(pk=label.pk).exists())
        self.assertIn("Label_77", MailMessage.objects.get(pk=self.rows["g1"].pk).label_ids)

    def test_a_name_gmail_refuses_unwinds_everything_and_tells_the_owner(self):
        self.fake.fail(r"/labels$", 400, "invalidArgument")
        label = self.made()
        self.tick()
        self.assertFalse(MailLabel.objects.filter(pk=label.pk).exists())
        self.assertNotIn(
            f"pending:{label.pk}", MailMessage.objects.get(pk=self.rows["g1"].pk).label_ids
        )
        self.assertFalse(MailOutbox.objects.exists())
        note = Notification.objects.get()
        self.assertEqual(
            (note.message, note.link),
            (
                'Couldn\'t create the label "Pilot" in Gmail: Gmail refused the name.',
                "/communications?source=mailbox:google",
            ),
        )
```

In `services/mail/tests/test_reading.py`, D2 adds `pending` to every label: change the expectation in `test_a_row_carries_user_labels_cc_bcc_and_attachments` to

```python
        self.assertEqual(
            row["labels"],
            [{"id": self.renewals.pk, "name": "Renewals", "color": RENEWALS_COLOR, "pending": False}],
        )
```

and replace the expected list in `test_the_label_list_is_my_user_labels_by_name` with:

```python
            (
                [
                    {
                        "id": self.renewals.pk,
                        "gmail_id": "Label_12",
                        "name": "Renewals",
                        "color": RENEWALS_COLOR,
                        "unread": 1,
                        "pending": False,
                    },
                    {
                        "id": self.vendors.pk,
                        "gmail_id": "Label_19",
                        "name": "Vendors/Billing",
                        "color": None,
                        "unread": 0,
                        "pending": False,
                    },
                ],
            )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_labels services.mail.tests.test_reading --parallel auto --noinput`
Expected: FAIL: `POST` answers 405, and the label dicts have no `pending` or `unread`.

- [ ] **Step 3: The shared answers**

Create `services/mail/actions.py`:

```python
"""What the person does to their own mail (contract §3, §4).

Every route that changes mail runs the same checks, in order, and answers
the first that fails: the messages are the caller's (404), the body is
valid (400), a Gmail-only field or op on Outlook or IMAP (400 GMAIL_ONLY),
then for Google, when the request writes to Gmail: disconnected (409
NO_MAILBOX), paused (409 MAILBOX_PAUSED), read-only (409 TWO_WAY_OFF).
Mute and unmute are Revenact's own and always pass. Owner-only throughout.
"""

from rest_framework import status
from rest_framework.response import Response

from . import gates
from .models import MailboxConnection, MailOutbox

Op = MailOutbox.Op
MUTE, UNMUTE = "mute", "unmute"
#: Never reach Gmail; allowed paused, read-only or disconnected.
LOCAL_OPS = frozenset({MUTE, UNMUTE})
#: Only a Gmail mailbox has these.
GMAIL_ONLY_OPS = frozenset(
    {
        Op.TRASH,
        Op.UNTRASH,
        Op.SPAM,
        Op.NOT_SPAM,
        Op.LABEL_ADD,
        Op.LABEL_REMOVE,
        Op.LABEL_CREATE,
    }
)

NO_MAILBOX = "This message's mailbox is no longer connected."
TWO_WAY_OFF = "Reconnect Google to turn on two-way: changes here can't reach Gmail yet."
GMAIL_ONLY = "Only Gmail mailboxes have this."
CHOOSE_LABEL = "Choose one of your labels."


def error(code, detail, http_status, **extra):
    return Response({"code": code, "detail": detail, **extra}, status=http_status)


def refusal(connection, steps):
    """Checks 3 to 6 of contract §3 for `steps` ([(op, label)]) on this
    mailbox, or None when the action may go ahead."""
    ops = {op for op, _ in steps}
    if not connection.is_google:
        if ops & GMAIL_ONLY_OPS:
            return error("GMAIL_ONLY", GMAIL_ONLY, status.HTTP_400_BAD_REQUEST)
        return None
    if ops <= LOCAL_OPS:
        return None
    if connection.status == MailboxConnection.Status.DISCONNECTED:
        return error("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
    paused = gates.paused_response(connection)
    if paused is not None:
        return paused
    if not connection.two_way:
        return error("TWO_WAY_OFF", TWO_WAY_OFF, status.HTTP_409_CONFLICT, needs_reconnect=True)
    return None
```

- [ ] **Step 4: Labels in the outbox**

Append to `services/mail/outbox.py` (add `MailLabel` to the `.models` import and `from .models import PENDING_LABEL_PREFIX`):

```python
def create_label(connection, name, *, now=None):
    """A label made here (decision 20): local at once, with no Gmail id, and a
    label_create row for the tick. In the caller's transaction."""
    now = now or timezone.now()
    label = MailLabel.objects.create(
        connection=connection, gmail_id="", name=name, type=MailLabel.Type.USER
    )
    MailOutbox.objects.create(
        connection=connection,
        action_id=uuid.uuid4(),
        op=Op.LABEL_CREATE,
        label=label,
        payload={"name": name},
        next_attempt_at=now,
    )
    connection_id = connection.pk
    transaction.on_commit(lambda: wake(connection_id))
    return label


def label_created(connection, label, gmail_id):
    """Gmail made (or already had) the label: `pending:<pk>` becomes its id on
    every message and every queued row, in one transaction (decision 21).
    When the mirror already holds a label with that id, ours merges into it
    (plan gap 12). Returns the label that stays."""
    key = f"{PENDING_LABEL_PREFIX}{label.pk}"
    with transaction.atomic():
        messages = list(
            MailMessage.objects.select_for_update().filter(
                connection=connection, label_ids__contains=[key]
            )
        )
        for message in messages:
            message.label_ids = list(
                dict.fromkeys(gmail_id if item == key else item for item in message.label_ids)
            )
        MailMessage.objects.bulk_update(messages, ["label_ids"])
        # A message already queued for the real id keeps that row.
        taken = MailOutbox.objects.filter(
            connection=connection, label_key=gmail_id, status=Status.PENDING
        ).values("message_id")
        MailOutbox.objects.filter(
            connection=connection, label_key=key, status=Status.PENDING, message_id__in=taken
        ).delete()
        MailOutbox.objects.filter(connection=connection, label_key=key).update(label_key=gmail_id)
        mirrored = (
            MailLabel.objects.filter(connection=connection, gmail_id=gmail_id)
            .exclude(pk=label.pk)
            .first()
        )
        if mirrored is not None:
            label.delete()
            return mirrored
        label.gmail_id = gmail_id
        label.save(update_fields=["gmail_id"])
        return label


def unwind_label(connection, label):
    """A label Gmail will never make (decision 21): off every message, its
    queued rows deleted (they never reached Gmail), and the label gone (its
    label_create row with it). In the caller's transaction."""
    key = f"{PENDING_LABEL_PREFIX}{label.pk}"
    MailOutbox.objects.filter(connection=connection, label_key=key).delete()
    messages = list(
        MailMessage.objects.select_for_update().filter(
            connection=connection, label_ids__contains=[key]
        )
    )
    for message in messages:
        set_presence(message, key, False)
    MailMessage.objects.bulk_update(messages, ["label_ids"])
    label.delete()
```

- [ ] **Step 5: Label creation in the flush**

In `services/mail/outbox_flush.py`, replace `flush`'s `try` body so creations come first (decision 8):

```python
    try:
        run.recover()
        run.label_creates()
        run.label_changes()
        run.trash_changes()
    finally:
        run.release()
        run.notify()
```

Add to `Flush`, before `label_changes`:

```python
    # --- label creations ------------------------------------------------
    def label_creates(self):
        """labels.create for each label made here. A 409 adopts Gmail's label
        of that name; another refusal fails the row with name_refused, which
        unwinds the label (`_fail`)."""
        for row in self._claim(self._due().filter(op=Op.LABEL_CREATE)):
            name = outbox.label_name(row) or row.label.name
            gmail_sync.ensure_claim(self.connection)
            try:
                made = self.session.create_label(name)
            except ProviderError as exc:
                kind = classify(exc)
                if exc.status == 409:
                    made = self._named(name)
                elif kind in ("not_found", "label_gone", "refused"):
                    made = None
                else:
                    self._call_failed([row], exc)
                    continue
                if made is None:
                    self._fail([row], Reason.NAME_REFUSED)
                    continue
            outbox.label_created(self.connection, row.label, str(made.get("id", "")))
            self._sent([row])


    def _named(self, name):
        """Gmail's own label called `name`, any case (one labels.list)."""
        gmail_sync.ensure_claim(self.connection)
        wanted = name.lower()
        return next(
            (item for item in self.session.labels() if str(item.get("name", "")).lower() == wanted),
            None,
        )
```

Replace `Flush._fail` so a failed creation unwinds its label:

```python
    def _fail(self, rows, reason):
        """Failed now: marked and undone here in one transaction (a label
        creation unwinds its label); the notice waits for the end of the
        flush."""
        if not rows:
            return
        changes = [row for row in rows if row.op != Op.LABEL_CREATE]
        with transaction.atomic():
            MailOutbox.objects.filter(pk__in=[row.pk for row in changes]).update(
                status=Status.FAILED, reason=reason, failed_at=self.now, updated_at=self.now
            )
            revert(self.connection, changes)
            for row in rows:
                if row.op == Op.LABEL_CREATE:
                    outbox.unwind_label(self.connection, row.label)
        self._settled(rows)
        self.failed.extend((row, reason) for row in rows)
```

- [ ] **Step 6: Pending labels in the serializers**

In `services/mail/serializers.py`, replace `label_payload` and `labels_by_gmail_id`:

```python
def label_payload(label):
    """A user label as the API shows it: Revenact's id, never Gmail's. A label
    made here that Gmail has not created yet is `pending` (decision 21)."""
    has_color = label.color_background or label.color_text
    color = {"background": label.color_background, "text": label.color_text} if has_color else None
    return {"id": label.pk, "name": label.name, "color": color, "pending": not label.gmail_id}


def labels_by_gmail_id(user):
    """The person's own user labels by `MailLabel.key` (the Gmail id, or
    `pending:<pk>`), in one query: the message serializers' `labels` context."""
    # SOC2:AUTH-02 a mailbox's labels are its owner's alone
    rows = MailLabel.objects.filter(connection__user=user, type=MailLabel.Type.USER)
    return {label.key: label_payload(label) for label in rows}
```

- [ ] **Step 7: The label routes**

In `services/mail/views.py`, change `from django.db import IntegrityError, transaction` to:

```python
from django.db import IntegrityError, transaction
from django.db import connection as db
```

add `actions` and `outbox` to `from . import gates, gmail_sync, providers, push, scopes`, and replace `MailLabelListView` with:

```python
#: Gmail keeps these names for itself (any case), and every CATEGORY_* one.
RESERVED_LABELS = frozenset(
    {"INBOX", "SENT", "DRAFT", "DRAFTS", "SPAM", "TRASH", "UNREAD", "STARRED", "IMPORTANT", "CHAT"}
)

#: Unread conversations per label key, outside trash and spam (decision 19).
#: A constant statement with one parameter: the ORM cannot group by a
#: set-returning function.
UNREAD_BY_LABEL = """
SELECT label.key,
       COUNT(DISTINCT CASE WHEN m.thread_id = '' THEN 'm' || m.id::text ELSE m.thread_id END)
FROM mail_mailmessage AS m
CROSS JOIN LATERAL jsonb_array_elements_text(m.label_ids) AS label(key)
WHERE m.connection_id = %s AND NOT m.is_read AND m.folder NOT IN ('trash', 'spam')
GROUP BY label.key
"""


def unread_by_label(connection):
    """{label key: unread conversations} for one mailbox, in one query."""
    with db.cursor() as cursor:
        cursor.execute(UNREAD_BY_LABEL, [connection.pk])
        return dict(cursor.fetchall())


def _label_row(label, unread):
    return {
        "id": label.pk,
        "gmail_id": label.gmail_id or None,
        "name": label.name,
        "color": label_payload(label)["color"],
        "unread": unread.get(label.key, 0),
        "pending": not label.gmail_id,
    }


def _label_name_error(name):
    if not name:
        return "Name the label."
    if len(name) > 225:
        return "Keep the name under 225 characters."
    upper = name.upper()
    if upper in RESERVED_LABELS or upper.startswith("CATEGORY_"):
        return "Gmail keeps that name for itself."
    return None


class MailLabelListView(APIView):
    """GET /api/v1/mail/labels/ — my own live Google mailbox's user labels, by
    name, with unread conversations, labels made here included (`pending`).
    [] without one. POST {name} makes one here and queues it for Gmail."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # SOC2:AUTH-02 the caller's own connection only
        connection = gates.live_mailbox(request.user)
        if connection is None or not connection.is_google:
            return Response([])
        rows = MailLabel.objects.filter(connection=connection, type=MailLabel.Type.USER).order_by(
            Lower("name"), "pk"
        )
        unread = unread_by_label(connection)
        return Response([_label_row(label, unread) for label in rows])

    def post(self, request):
        raw = request.data.get("name", "") if isinstance(request.data, dict) else ""
        name = str(raw).strip()
        problem = _label_name_error(name)
        if problem:
            return Response({"name": [problem]}, status=status.HTTP_400_BAD_REQUEST)
        # SOC2:AUTH-02 the caller's own mailbox, kept copies included
        connection = getattr(request.user, "mailbox", None)
        if connection is None:
            return actions.error("NO_MAILBOX", actions.NO_MAILBOX, status.HTTP_409_CONFLICT)
        refused = actions.refusal(connection, [(MailOutbox.Op.LABEL_CREATE, None)])
        if refused is not None:
            return refused
        existing = MailLabel.objects.filter(connection=connection, name__iexact=name).first()
        if existing is not None:
            return actions.error(
                "LABEL_EXISTS",
                f"You already have a label called {existing.name}.",
                status.HTTP_409_CONFLICT,
                label_id=existing.pk,
            )
        with transaction.atomic():
            label = outbox.create_label(connection, name)
        return Response(_label_row(label, {}), status=status.HTTP_201_CREATED)
```

Add `MailOutbox` to `from .models import MailboxConnection, MailLabel, MailMessage`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 9: Commit**

```bash
venv/bin/ruff format services/mail/actions.py services/mail/outbox.py services/mail/outbox_flush.py services/mail/serializers.py services/mail/views.py services/mail/tests/test_labels.py services/mail/tests/test_reading.py
venv/bin/ruff check --fix services/mail/actions.py services/mail/outbox.py services/mail/outbox_flush.py services/mail/serializers.py services/mail/views.py services/mail/tests/test_labels.py services/mail/tests/test_reading.py
git add services/mail/actions.py services/mail/outbox.py services/mail/outbox_flush.py services/mail/serializers.py services/mail/views.py services/mail/tests/test_labels.py services/mail/tests/test_reading.py
git commit -m "$(cat <<'EOF'
feat(mail): create labels here and in gmail, with unread conversation counts

POST mail/labels/ makes a pending label at once; the flush creates it in
Gmail first, adopts a name Gmail has, or unwinds a refused one; the list
counts unread conversations per label in one query.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 8: `sync_issue`, All Mail and the label view on the message list

**Files:**
- Modify: `services/mail/outbox.py` (append `sync_issues`)
- Modify: `services/mail/serializers.py` (`account_of`; `MailMessageSerializer.sync_issue`)
- Modify: `services/mail/views.py` (`FOLDERS["all"]`; new `filter_messages`; `_own_messages`; `MailMessageListView.get`; `MailMessageDetailView._detail`)
- Modify: `services/mail/tests/test_reading.py` (`QueryCeilingTests`)
- Test: `services/mail/tests/test_listing.py`

**Interfaces:**
- Consumes: `outbox.sentence`, `outbox.label_name`, `MailLabel.key`, `actions.CHOOSE_LABEL`.
- Produces:
  - `outbox.sync_issues(message_ids, *, now=None) -> dict[int, {"text": str, "at": datetime}]` (one query; `{}` without ids);
  - `serializers.account_of(message) -> dict | None`;
  - `MailMessageSerializer` reads `context["issues"]` for `sync_issue`;
  - `views.FOLDERS["all"]`;
  - `views.filter_messages(request, rows) -> tuple[QuerySet | None, Response | None]`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_listing.py`:

```python
"""The message list's D2 parts (contract §2, §5): folder=all is every message
outside trash and spam; label=<id> narrows to one of my own user labels (a
label made here included); sync_issue names the newest failed change on a
message for 7 days, until another action is made on it."""

import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from services.mail import gmail_store, outbox
from services.mail.models import MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/messages/"


class ListingFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.rows = {}
        for gmail_id, labels in (
            ("a", ["INBOX", "Label_12"]),
            ("b", ["Label_12"]),  # archived
            ("c", ["TRASH", "Label_12"]),
            ("d", ["SPAM"]),
        ):
            self.rows[gmail_id], _ = gmail_store.store_gmail(
                self.mailbox, gmail_message(gmail_id, labels=labels), now=self.now
            )
        self.client.force_authenticate(self.dana)

    def listed(self, query):
        response = self.client.get(f"{URL}?{query}")
        self.assertEqual(response.status_code, 200, response.data)
        ids = {row["id"] for row in response.data["results"]}
        return {gmail_id for gmail_id, row in self.rows.items() if row.pk in ids}

    def failed(self, message, **fields):
        values = {
            "connection": self.mailbox,
            "action_id": uuid.uuid4(),
            "op": "archive",
            "message": message,
            "label_key": "INBOX",
            "add": False,
            "previous": {"present": True},
            "status": "failed",
            "reason": "not_found",
            "failed_at": self.now,
            "next_attempt_at": self.now,
        }
        values.update(fields)
        return MailOutbox.objects.create(**values)


class AllMailAndLabelTests(ListingFixture):
    def test_all_is_everything_outside_trash_and_spam(self):
        self.assertEqual(self.listed("folder=all"), {"a", "b"})

    def test_a_label_view(self):
        self.assertEqual(self.listed(f"folder=all&label={self.renewals.pk}"), {"a", "b"})
        self.assertEqual(self.listed(f"folder=trash&label={self.renewals.pk}"), {"c"})

    def test_a_label_made_here(self):
        made = MailLabel.objects.create(connection=self.mailbox, name="Pilot", type="user")
        with transaction.atomic():
            outbox.apply(
                self.mailbox, [(self.rows["a"], c) for c in outbox.changes_for("label_add", made)]
            )
        self.assertEqual(self.listed(f"folder=all&label={made.pk}"), {"a"})

    def test_a_label_that_is_not_one_of_mine(self):
        carls = self.google(self.carl)
        theirs = MailLabel.objects.create(
            connection=carls, gmail_id="Label_5", name="X", type="user"
        )
        system = MailLabel.objects.get(connection=self.mailbox, gmail_id="INBOX")
        for raw in (str(theirs.pk), str(system.pk), "999999", "abc"):
            response = self.client.get(f"{URL}?folder=all&label={raw}")
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"label": ["Choose one of your labels."]}),
            )


class SyncIssueTests(ListingFixture):
    def issue_of(self, gmail_id):
        rows = self.client.get(f"{URL}?folder=all").data["results"]
        return next(row for row in rows if row["id"] == self.rows[gmail_id].pk)["sync_issue"]

    def test_a_failed_change_shows_on_the_message_and_its_detail(self):
        self.failed(self.rows["a"])
        expected = {
            "text": "Couldn't archive in Gmail: the message no longer exists.",
            "at": self.now,
        }
        self.assertEqual(self.issue_of("a"), expected)
        self.assertIsNone(self.issue_of("b"))
        detail = self.client.get(f"{URL}{self.rows['a'].pk}/").data
        self.assertEqual(detail["sync_issue"], expected)

    def test_a_label_change_names_its_label(self):
        self.failed(
            self.rows["a"],
            op="label_remove",
            label_key="Label_12",
            payload={"label": "Renewals"},
            reason="label_gone",
        )
        self.assertEqual(
            self.issue_of("a")["text"],
            'Couldn\'t remove the label "Renewals" in Gmail: the label no longer exists.',
        )

    def test_a_later_action_clears_it(self):
        self.failed(self.rows["a"])
        MailOutbox.objects.create(
            connection=self.mailbox,
            action_id=uuid.uuid4(),
            op="read",
            message=self.rows["a"],
            label_key="UNREAD",
            add=False,
            previous={"present": True},
            status="sent",
            next_attempt_at=self.now,
        )
        self.assertIsNone(self.issue_of("a"))

    def test_after_seven_days_it_is_gone(self):
        self.failed(self.rows["a"], failed_at=self.now - timedelta(days=8))
        self.assertIsNone(self.issue_of("a"))

    def test_outlook_and_imap_rows_have_none(self):
        imap = self.connect(self.carl)
        MailMessage.objects.create(
            connection=imap,
            owner=self.carl,
            organisation=self.org,
            provider_message_id="<m1@x.io>",
            direction="received",
            subject="Hi",
            sent_at=self.now,
        )
        self.client.force_authenticate(self.carl)
        [row] = self.client.get(URL).data["results"]
        self.assertIsNone(row["sync_issue"])
```

In `services/mail/tests/test_reading.py`, `QueryCeilingTests.test_the_list_and_the_detail_read_a_fixed_number_of_queries`, change the two ceilings and their comment:

```python
        # count, page, labels, the page's sync_issue (contract §8: 4).
        self.assertLessEqual(len(ten), 4)
        row = MailMessage.objects.get(provider_message_id="q5")
        with CaptureQueriesContext(db) as detail:
            self.client.get(f"/api/v1/mail/messages/{row.id}/")
        # the message, labels, attachments, sync_issue (contract §8: 5).
        self.assertLessEqual(len(detail), 5)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_listing --parallel auto --noinput`
Expected: FAIL: `folder=all` answers 400, and rows have no `sync_issue`.

- [ ] **Step 3: `sync_issues`**

Append to `services/mail/outbox.py` (add `from datetime import timedelta` and `from django.conf import settings` to the imports):

```python
def sync_issues(message_ids, *, now=None):
    """Each message's `sync_issue` (decision 23): the newest failed row on it
    within MAIL_OUTBOX_ISSUE_DAYS, unless a row of another action was made on
    it since. One query; {} without ids."""
    ids = list(message_ids)
    if not ids:
        return {}
    now = now or timezone.now()
    cutoff = now - timedelta(days=settings.MAIL_OUTBOX_ISSUE_DAYS)
    rows = (
        MailOutbox.objects.filter(message_id__in=ids)
        .exclude(status=Status.FAILED, failed_at__lt=cutoff)
        .only(
            "message_id",
            "action_id",
            "op",
            "status",
            "reason",
            "payload",
            "created_at",
            "failed_at",
        )
    )
    by_message = defaultdict(list)
    for row in rows:
        by_message[row.message_id].append(row)
    issues = {}
    for message_id, group in by_message.items():
        failed = [row for row in group if row.status == Status.FAILED]
        if not failed:
            continue
        newest = max(failed, key=lambda row: (row.failed_at, row.pk))
        later = any(
            row.created_at > newest.created_at and row.action_id != newest.action_id
            for row in group
        )
        if not later:
            issues[message_id] = {
                "text": sentence(newest.op, newest.reason, label_name(newest)),
                "at": newest.failed_at,
            }
    return issues
```

- [ ] **Step 4: The serializer**

In `services/mail/serializers.py`, add above `MailMessageSerializer`:

```python
def account_of(message):
    """The filed copy's record ({id, name, type}), or None."""
    email = message.email
    if email is None:
        return None
    if email.customer_id is not None:
        return {"id": email.customer_id, "name": email.customer.name, "type": "customer"}
    if email.account_id is not None:
        return {"id": email.account_id, "name": email.account.name, "type": "account"}
    return None
```

In `MailMessageSerializer`, add the field and its method, extend the docstring with "`sync_issue` is the newest failed Gmail change on it (the `issues` context, `outbox.sync_issues`), or null.", and replace `get_account`:

```python
    priority = serializers.BooleanField(read_only=True)
    account = serializers.SerializerMethodField()
    labels = serializers.SerializerMethodField()
    sync_issue = serializers.SerializerMethodField()
```

```python
            "labels",
            "has_attachments",
            "sync_issue",
        ]

    def get_account(self, message):
        return account_of(message)

    def get_sync_issue(self, message):
        return (self.context.get("issues") or {}).get(message.pk)
```

- [ ] **Step 5: The shared filters**

In `services/mail/views.py`, add `all` to `FOLDERS` after `inbox`:

```python
    "inbox": Q(folder=MailMessage.Folder.INBOX, state=MailMessage.State.OPEN),
    # Gmail's All Mail: everything outside trash and spam (decision 18).
    "all": ~Q(folder__in=[MailMessage.Folder.TRASH, MailMessage.Folder.SPAM]),
```

Replace `_own_messages` and `MailMessageListView`, and add `filter_messages` between them:

```python
def _own_messages(request):
    # SOC2:AUTH-02 the person's whole mailbox is theirs alone
    return MailMessage.objects.filter(owner=request.user).select_related(
        "connection", "email__customer", "email__account"
    )


def filter_messages(request, rows):
    """The filters mail/messages/ and mail/threads/ share (contract §2):
    `folder`, `label`, `category`, `unread`, `priority`, `q`. Returns
    (rows, None), or (None, the 400 answer)."""
    params = request.query_params
    folder = params.get("folder", "inbox")
    if folder not in FOLDERS:
        return None, Response(
            {"detail": f"folder must be one of {', '.join(FOLDERS)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    rows = rows.filter(FOLDERS[folder])
    raw_label = params.get("label")
    if raw_label:
        # SOC2:AUTH-02 one of the caller's own user labels, nobody else's
        label = MailLabel.objects.filter(
            pk=int(raw_label) if raw_label.isdigit() else 0,
            connection__user=request.user,
            type=MailLabel.Type.USER,
        ).first()
        if label is None:
            return None, Response(
                {"label": [actions.CHOOSE_LABEL]}, status=status.HTTP_400_BAD_REQUEST
            )
        rows = rows.filter(label_ids__contains=[label.key])
    category = params.get("category")
    if category:
        if category not in MailMessage.Category.values:
            return None, Response(
                {"detail": f"category must be one of {', '.join(MailMessage.Category.values)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        rows = rows.filter(category=category)
    if _truthy(params.get("unread")):
        rows = rows.filter(is_read=False)
    if _truthy(params.get("priority")):
        rows = rows.filter(Q(is_important=True) | Q(email__isnull=False))
    q = params.get("q", "").strip()
    if q:
        rows = rows.filter(
            Q(subject__icontains=q)
            | Q(from_name__icontains=q)
            | Q(from_address__icontains=q)
            | Q(snippet__icontains=q)
        )
    return rows, None


class MailMessageListView(APIView):
    """GET /api/v1/mail/messages/ — the person's own mail, one folder at a
    time, newest first (filter_messages). Each row carries its sync_issue."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows, refused = filter_messages(request, _own_messages(request))
        if refused is not None:
            return refused
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        context = {
            "labels": labels_by_gmail_id(request.user),
            "issues": outbox.sync_issues([message.pk for message in page]),
        }
        return paginator.get_paginated_response(
            MailMessageSerializer(page, many=True, context=context).data
        )
```

In `MailMessageDetailView`, replace `_detail`:

```python
    def _detail(self, request, message):
        context = {
            "labels": labels_by_gmail_id(request.user),
            "issues": outbox.sync_issues([message.pk]),
        }
        return Response(MailMessageDetailSerializer(message, context=context).data)
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff format services/mail/outbox.py services/mail/serializers.py services/mail/views.py services/mail/tests/test_listing.py services/mail/tests/test_reading.py
venv/bin/ruff check --fix services/mail/outbox.py services/mail/serializers.py services/mail/views.py services/mail/tests/test_listing.py services/mail/tests/test_reading.py
git add services/mail/outbox.py services/mail/serializers.py services/mail/views.py services/mail/tests/test_listing.py services/mail/tests/test_reading.py
git commit -m "$(cat <<'EOF'
feat(mail): sync issues on messages, all mail and the label view

A failed Gmail change shows on its message for 7 days until another
action; folder=all and label= filter the list on the GIN index.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 9: Actions on a message: PATCH through the outbox, the reply's mark-read, disconnect

**Files:**
- Modify: `services/mail/actions.py` (append the PATCH half)
- Modify: `services/mail/views.py` (`MailMessageDetailView`; `MailReplyView.post`'s mark-read; `_disconnect_google`; imports)
- Modify: `services/mail/serializers.py` (delete `MailMessageUpdateSerializer`)
- Modify: `services/mail/tests/test_messages.py` (`test_patch_cannot_move_a_message_between_provider_folders`)
- Test: `services/mail/tests/test_actions.py`

**Interfaces:**
- Consumes: `actions.refusal/error/...` (Task 7), `outbox.apply/changes_for/unwind_label`, `gmail_store.derive`.
- Produces (`services.mail.actions`):
  - `ChangeSerializer` (the PATCH body);
  - `steps_from_change(data, labels) -> list[tuple[str, MailLabel | None]]`;
  - `resolve_labels(connection, ids) -> dict[int, MailLabel] | None`;
  - `lockable(user) -> QuerySet` (the caller's messages, `select_for_update(of=("self",))`, connection and user joined);
  - `newest_per_thread(messages) -> list[MailMessage]`;
  - `perform(connection, messages, steps, *, star_newest=False, now=None) -> set[int]`;
  - `too_many() -> Response`;
  - `change(messages, data, *, star_newest=False) -> Response | None` (checks 2–6 and the change, in the caller's transaction).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_actions.py`:

```python
"""Actions on one message (contract §3): PATCH changes the row at once and
queues it for Gmail, in the contract's check order (404, body, GMAIL_ONLY,
NO_MAILBOX, MAILBOX_PAUSED, TWO_WAY_OFF); mute is Revenact's own and always
allowed; Outlook and IMAP stay local; the reply marks the original read
through the outbox; disconnecting drops what was on its way."""

from unittest.mock import patch

from django.db import connection as db
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.billing.models import SeatAssignment
from services.mail import gmail_store
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/messages/"
READ_ONLY = ["https://www.googleapis.com/auth/gmail.readonly"]


class ActionFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.row, _ = gmail_store.store_gmail(self.mailbox, gmail_message("g1"), now=self.now)
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.client.force_authenticate(self.dana)

    def patch(self, body, row=None):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.patch(f"{URL}{(row or self.row).pk}/", body, format="json")

    def queued(self):
        return list(
            MailOutbox.objects.filter(status="pending")
            .order_by("pk")
            .values_list("op", "label_key", "add")
        )

    def fresh(self):
        return MailMessage.objects.get(pk=self.row.pk)


class PatchTests(ActionFixture):
    def test_read_answers_the_detail_already_changed_and_queues_it(self):
        response = self.patch({"is_read": True})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["is_read"])
        self.assertIn("body", response.data)
        self.assertIsNone(response.data["sync_issue"])
        self.assertEqual(self.queued(), [("read", "UNREAD", False)])
        self.mailbox.refresh_from_db()
        self.assertIsNotNone(self.mailbox.wake_at)

    def test_done_archives_and_open_takes_it_back_with_nothing_sent(self):
        self.assertEqual(self.patch({"state": "done"}).data["state"], "done")
        self.assertEqual(self.queued(), [("archive", "INBOX", False)])
        self.assertEqual(self.patch({"state": "open"}).data["state"], "open")
        self.assertEqual(self.queued(), [])

    def test_trash_spam_and_labels(self):
        self.assertEqual(self.patch({"trashed": True}).data["folder"], "trash")
        self.assertEqual(self.patch({"trashed": False}).data["folder"], "inbox")
        self.assertEqual(self.patch({"spam": True}).data["folder"], "spam")
        self.assertEqual(self.patch({"spam": False}).data["folder"], "inbox")
        self.assertEqual(self.queued(), [])
        labels = self.patch({"add_labels": [self.renewals.pk]}).data["labels"]
        self.assertEqual([label["name"] for label in labels], ["Renewals"])
        self.assertEqual(self.queued(), [("label_add", "Label_12", True)])

    def test_several_fields_are_one_action(self):
        self.patch({"is_read": True, "is_starred": True})
        self.assertEqual(MailOutbox.objects.values("action_id").distinct().count(), 1)
        self.assertEqual(MailOutbox.objects.count(), 2)

    def test_mute_is_revenacts_own_and_open_unmutes(self):
        self.assertEqual(self.patch({"state": "muted"}).data["state"], "muted")
        self.assertFalse(MailOutbox.objects.exists())
        self.assertEqual(self.patch({"state": "open"}).data["state"], "open")
        self.assertFalse(MailOutbox.objects.exists())


class RefusalTests(ActionFixture):
    def test_bodies_that_are_refused_queue_nothing(self):
        system = MailLabel.objects.get(connection=self.mailbox, gmail_id="INBOX")
        for body, errors in (
            ({}, {"non_field_errors": ["Change at least one thing."]}),
            ({"folder": "trash"}, {"non_field_errors": ["Change at least one thing."]}),
            (
                {"state": "done", "trashed": True},
                {"non_field_errors": ["Change one of state, trashed or spam at a time."]},
            ),
            (
                {"add_labels": [self.renewals.pk, self.renewals.pk]},
                {"add_labels": ["Name each label once."]},
            ),
            (
                {"add_labels": [self.renewals.pk], "remove_labels": [self.renewals.pk]},
                {"non_field_errors": ["A label can't be added and removed at once."]},
            ),
            ({"add_labels": [system.pk]}, {"add_labels": ["Choose one of your labels."]}),
            ({"remove_labels": [999999]}, {"remove_labels": ["Choose one of your labels."]}),
        ):
            response = self.patch(body)
            self.assertEqual((response.status_code, response.data), (400, errors), body)
        self.assertEqual(self.patch({"state": "gone"}).status_code, 400)
        self.assertFalse(MailOutbox.objects.exists())

    def test_nobody_else_may_change_it(self):
        for person in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(person)
            self.assertEqual(self.patch({"is_read": True}).status_code, 404)
        self.assertFalse(MailOutbox.objects.exists())

    def test_outlook_and_imap_are_local_and_refuse_gmail_fields(self):
        imap = self.connect(self.priya)
        row = MailMessage.objects.create(
            connection=imap,
            owner=self.priya,
            organisation=self.org,
            provider_message_id="<m1@x.io>",
            direction="received",
            subject="Hi",
            sent_at=self.now,
            is_read=False,
        )
        self.client.force_authenticate(self.priya)
        for body in ({"trashed": True}, {"spam": False}, {"add_labels": [self.renewals.pk]}):
            response = self.patch(body, row=row)
            self.assertEqual(
                (response.status_code, response.data),
                (400, {"code": "GMAIL_ONLY", "detail": "Only Gmail mailboxes have this."}),
            )
        response = self.patch({"is_read": True, "state": "done"}, row=row)
        self.assertEqual((response.data["is_read"], response.data["state"]), (True, "done"))
        row.refresh_from_db()
        self.assertIsNotNone(row.locally_changed_at)
        self.assertFalse(MailOutbox.objects.exists())

    def assertRefused(self, code, **extra):
        response = self.patch({"is_read": True})
        self.assertEqual((response.status_code, response.data["code"]), (409, code))
        for key, value in extra.items():
            self.assertEqual(response.data[key], value)
        self.assertEqual(self.patch({"state": "muted"}).status_code, 200)  # mute always works
        MailMessage.objects.filter(pk=self.row.pk).update(state="open")
        self.assertFalse(MailOutbox.objects.exists())

    def test_a_disconnected_mailbox(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        self.assertRefused("NO_MAILBOX", detail="This message's mailbox is no longer connected.")

    def test_a_paused_mailbox(self):
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertRefused("MAILBOX_PAUSED", paused_reason="no_seat")

    def test_a_lost_grant_is_paused(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            status="error", paused_reason="token_revoked"
        )
        self.assertRefused("MAILBOX_PAUSED", paused_reason="token_revoked")

    def test_a_read_only_mailbox(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(granted_scopes=READ_ONLY)
        self.assertRefused(
            "TWO_WAY_OFF",
            detail="Reconnect Google to turn on two-way: changes here can't reach Gmail yet.",
            needs_reconnect=True,
        )


class ReplyAndDisconnectTests(ActionFixture):
    def test_a_reply_marks_the_original_read_through_the_outbox(self):
        with patch("services.mail.views.reply_to", return_value=None):
            response = self.client.post(
                f"{URL}{self.row.pk}/reply/", {"body": "Yes."}, format="json"
            )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(self.fresh().is_read)
        self.assertEqual(self.queued(), [("read", "UNREAD", False)])

    def test_disconnecting_drops_what_was_on_its_way_without_reverting(self):
        self.use_gmail()
        made = self.client.post("/api/v1/mail/labels/", {"name": "Pilot"}, format="json").data
        self.patch({"state": "done", "add_labels": [made["id"]]})
        self.assertEqual(self.client.delete("/api/v1/mail/connection/").status_code, 204)
        self.assertFalse(MailOutbox.objects.exists())
        self.assertFalse(MailLabel.objects.filter(pk=made["id"]).exists())
        row = self.fresh()
        self.assertEqual(row.state, "done")
        self.assertNotIn(f"pending:{made['id']}", row.label_ids)


class PatchCeilingTests(ActionFixture):
    def test_a_patch_reads_a_fixed_number_of_queries(self):
        self.patch({"is_read": True})
        with CaptureQueriesContext(db) as queries:
            self.client.patch(f"{URL}{self.row.pk}/", {"state": "done"}, format="json")
        # contract §8: 12, plus the detail's own reads (5).
        self.assertLessEqual(len(queries), 17)
```

In `services/mail/tests/test_messages.py`, replace `test_patch_cannot_move_a_message_between_provider_folders` (a body with no field PATCH knows is now refused, plan gap 2):

```python
    def test_patch_cannot_move_a_message_between_provider_folders(self):
        self._sync(message(provider_id="a", labels=["inbox"]))
        row = MailMessage.objects.get()
        response = self.client.patch(
            f"/api/v1/mail/messages/{row.id}/",
            {"folder": "trash", "is_important": True},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"non_field_errors": ["Change at least one thing."]})
        row.refresh_from_db()
        self.assertEqual((row.folder, row.is_important), ("inbox", False))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_actions services.mail.tests.test_messages --parallel auto --noinput`
Expected: FAIL: PATCH still only takes `is_read`, `is_starred` and `state` and never queues anything.

- [ ] **Step 3: The PATCH half of the actions module**

In `services/mail/actions.py`, replace the imports with:

```python
from django.conf import settings
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.response import Response

from . import gates, gmail_store, outbox
from .models import MailboxConnection, MailLabel, MailMessage, MailOutbox
```

and add `State = MailMessage.State` after `Op = MailOutbox.Op`. Append:

```python
def too_many():
    limit = settings.MAIL_ACTION_MAX_MESSAGES
    return error(
        "TOO_MANY",
        f"Select fewer conversations: at most {limit:,} messages at a time.",
        status.HTTP_400_BAD_REQUEST,
    )


def _once(value):
    if len(set(value)) != len(value):
        raise serializers.ValidationError("Name each label once.")
    return value


class ChangeSerializer(serializers.Serializer):
    """A PATCH on a message or a thread (contract §3): partial, at least one
    field, at most one of state, trashed and spam."""

    is_read = serializers.BooleanField(required=False)
    is_starred = serializers.BooleanField(required=False)
    state = serializers.ChoiceField(choices=MailMessage.State.choices, required=False)
    trashed = serializers.BooleanField(required=False)
    spam = serializers.BooleanField(required=False)
    add_labels = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=20
    )
    remove_labels = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, max_length=20
    )

    def validate_add_labels(self, value):
        return _once(value)

    def validate_remove_labels(self, value):
        return _once(value)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Change at least one thing.")
        if sum(field in attrs for field in ("state", "trashed", "spam")) > 1:
            raise serializers.ValidationError("Change one of state, trashed or spam at a time.")
        if set(attrs.get("add_labels", [])) & set(attrs.get("remove_labels", [])):
            raise serializers.ValidationError("A label can't be added and removed at once.")
        return attrs


STATE_OPS = {State.OPEN: Op.INBOX, State.DONE: Op.ARCHIVE, State.MUTED: MUTE}


def steps_from_change(data, labels):
    """The ops a PATCH body means. A label id missing from `labels` (Outlook
    and IMAP resolve none) stays (op, None): check 3 refuses it."""
    steps = []
    if "is_read" in data:
        steps.append((Op.READ if data["is_read"] else Op.UNREAD, None))
    if "is_starred" in data:
        steps.append((Op.STAR if data["is_starred"] else Op.UNSTAR, None))
    if "state" in data:
        steps.append((STATE_OPS[data["state"]], None))
    if "trashed" in data:
        steps.append((Op.TRASH if data["trashed"] else Op.UNTRASH, None))
    if "spam" in data:
        steps.append((Op.SPAM if data["spam"] else Op.NOT_SPAM, None))
    steps += [(Op.LABEL_ADD, labels.get(pk)) for pk in data.get("add_labels", [])]
    steps += [(Op.LABEL_REMOVE, labels.get(pk)) for pk in data.get("remove_labels", [])]
    return steps


def resolve_labels(connection, ids):
    """{id: MailLabel} when every id is a user label of this mailbox; None
    otherwise."""
    wanted = set(ids)
    if not wanted:
        return {}
    # SOC2:AUTH-02 the caller's own user labels only
    found = {
        label.pk: label
        for label in MailLabel.objects.filter(
            connection=connection, type=MailLabel.Type.USER, pk__in=wanted
        )
    }
    return found if set(found) == wanted else None


def lockable(user):
    """The caller's own messages, locked for an action (check 1). A manager,
    view-all holder or admin finds none of someone else's: 404."""
    # SOC2:AUTH-02 the person's whole mailbox is theirs alone
    return (
        MailMessage.objects.filter(owner=user)
        .select_related("connection__user")
        .select_for_update(of=("self",))
    )


def newest_per_thread(messages):
    """Starring a conversation stars its newest message, as Gmail does
    (decision 10)."""
    newest = {}
    for message in messages:
        key = message.thread_id or f"m{message.pk}"
        if key not in newest or (message.sent_at, message.pk) > (
            newest[key].sent_at,
            newest[key].pk,
        ):
            newest[key] = message
    return list(newest.values())


#: Outlook and IMAP: what each op sets here (D1's local rule).
LOCAL_VALUES = {
    Op.READ: ("is_read", True),
    Op.UNREAD: ("is_read", False),
    Op.STAR: ("is_starred", True),
    Op.UNSTAR: ("is_starred", False),
    Op.ARCHIVE: ("state", State.DONE),
    Op.INBOX: ("state", State.OPEN),
    MUTE: ("state", State.MUTED),
    UNMUTE: ("state", State.OPEN),
}


def _local(messages, steps, *, star_newest, now):
    """Outlook and IMAP (decision 14): here only, stamped locally_changed_at."""
    changed = {}
    for op, _ in steps:
        field, value = LOCAL_VALUES[op]
        targets = newest_per_thread(messages) if op == Op.STAR and star_newest else messages
        for message in targets:
            if op == UNMUTE and message.state != State.MUTED:
                continue
            if getattr(message, field) != value:
                setattr(message, field, value)
                changed[message.pk] = message
    for message in changed.values():
        message.locally_changed_at = now
    if changed:
        MailMessage.objects.bulk_update(
            list(changed.values()), ["is_read", "is_starred", "state", "locally_changed_at"]
        )
    return set(changed)


def _mute(connection, messages, *, muted):
    """Mute and unmute on Gmail rows: Revenact's own, never an outbox row.
    Unmute re-derives the state from the labels."""
    changed = []
    for message in messages:
        if muted:
            state = State.MUTED
        elif message.state != State.MUTED:
            continue
        else:
            archived = gmail_store.derive(
                message.label_ids,
                from_address=message.from_address,
                own_address=connection.address,
            )["archived"]
            state = State.DONE if archived else State.OPEN
        if message.state != state:
            message.state = state
            changed.append(message)
    if changed:
        MailMessage.objects.bulk_update(changed, ["state"])
    return {message.pk for message in changed}


def perform(connection, messages, steps, *, star_newest=False, now=None):
    """Make `steps` true on `messages`: through the outbox for Google, here
    only for Outlook and IMAP. Returns the pks whose local values changed.
    In the caller's transaction, after the checks."""
    now = now or timezone.now()
    if not connection.is_google:
        return _local(messages, steps, star_newest=star_newest, now=now)
    pairs = []
    for op, label in steps:
        if op in LOCAL_OPS:
            continue
        targets = newest_per_thread(messages) if op == Op.STAR and star_newest else messages
        pairs += [
            (message, change) for message in targets for change in outbox.changes_for(op, label)
        ]
    changed = outbox.apply(connection, pairs, now=now) if pairs else set()
    ops = {op for op, _ in steps}
    if ops & LOCAL_OPS:
        changed |= _mute(connection, messages, muted=MUTE in ops)
    return changed


def change(messages, data, *, star_newest=False):
    """A PATCH on one message or a thread, after check 1, inside the
    request's transaction: checks 2 to 6, then the change. Returns the
    answer that refused it, or None once it is done."""
    serializer = ChangeSerializer(data=data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    if len(messages) > settings.MAIL_ACTION_MAX_MESSAGES:
        return too_many()
    valid = serializer.validated_data
    connection = messages[0].connection
    labels = {}
    if connection.is_google:
        for field in ("add_labels", "remove_labels"):
            found = resolve_labels(connection, valid.get(field, []))
            if found is None:
                return Response({field: [CHOOSE_LABEL]}, status=status.HTTP_400_BAD_REQUEST)
            labels.update(found)
    steps = steps_from_change(valid, labels)
    refused = refusal(connection, steps)
    if refused is not None:
        return refused
    perform(connection, messages, steps, star_newest=star_newest)
    return None
```

- [ ] **Step 4: The views**

In `services/mail/views.py`, replace `MailMessageDetailView`'s docstring and `patch`:

```python
class MailMessageDetailView(APIView):
    """GET /api/v1/mail/messages/<id>/ — the whole message. PATCH (contract
    §3) takes is_read, is_starred, state, trashed, spam, add_labels and
    remove_labels: the row changes at once and, for a two-way Google
    mailbox, the change is queued for Gmail (services/mail/outbox.py).
    Outlook and IMAP stay local. Owner only."""

    permission_classes = [IsAuthenticated]
```

```python
    def patch(self, request, pk):
        with transaction.atomic():
            message = get_object_or_404(actions.lockable(request.user), pk=pk)
            refused = actions.change([message], request.data)
            if refused is not None:
                return refused
        return self._detail(request, get_object_or_404(_own_messages(request), pk=pk))
```

In `MailReplyView.post`, replace the mark-read block:

```python
        if not message.is_read:
            if connection.two_way:
                # Through the outbox, so Gmail hears of it (decision 25).
                with transaction.atomic():
                    outbox.apply(
                        connection,
                        [(message, change) for change in outbox.changes_for(MailOutbox.Op.READ)],
                    )
            else:
                message.is_read = True
                message.save(update_fields=["is_read"])
```

In `_disconnect_google`, after the `MailboxConnection.objects.filter(pk=connection.pk).update(...)` call and before `delete_after = ...`, add:

```python
    # What was on its way never reaches Gmail now; the copies keep their local
    # values, and a reconnect's reconcile re-derives them (decision 13). Labels
    # made here and never created in Gmail go with it (plan gap 13).
    with transaction.atomic():
        MailOutbox.objects.filter(connection=connection, status__in=MailOutbox.LIVE).delete()
        for label in MailLabel.objects.filter(connection=connection, gmail_id=""):
            outbox.unwind_label(connection, label)
```

Remove `MailMessageUpdateSerializer` from the `.serializers` import in `views.py`, and delete the class from `services/mail/serializers.py`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/actions.py services/mail/views.py services/mail/serializers.py services/mail/tests/test_actions.py services/mail/tests/test_messages.py
venv/bin/ruff check --fix services/mail/actions.py services/mail/views.py services/mail/serializers.py services/mail/tests/test_actions.py services/mail/tests/test_messages.py
git add services/mail/actions.py services/mail/views.py services/mail/serializers.py services/mail/tests/test_actions.py services/mail/tests/test_messages.py
git commit -m "$(cat <<'EOF'
feat(mail): send a message's changes back to gmail through the outbox

PATCH takes trashed, spam and labels beside read, star and state, runs the
contract's checks in order and answers the row already changed; mute stays
Revenact's own; the reply marks the original read through the outbox; a
disconnect drops what was on its way.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 10: Conversations: the thread list, the thread, and PATCH on a thread

**Files:**
- Create: `services/mail/threads.py`
- Modify: `services/mail/views.py` (new `MailThreadListView`, `MailThreadView`; import `threads`)
- Modify: `services/mail/urls.py`
- Test: `services/mail/tests/test_threads.py`

**Interfaces:**
- Consumes: `filter_messages` (Task 8), `actions.lockable/change` (Task 9), `serializers.account_of`, `labels_by_gmail_id`, `MailMessageDetailSerializer`, `outbox.sync_issues`.
- Produces (`services.mail.threads`):
  - `HIDDEN = ("trash", "spam")`, `THREAD_KEY` (the SQL expression), `key_of(message) -> str`, `thread_q(message) -> Q`;
  - `anchors(matching) -> QuerySet` (the newest matching message of each thread, newest thread first);
  - `thread_rows(user, page, *, view) -> list[dict]`;
  - `union_labels(messages, by_key) -> list[dict]`, `newest_account(messages)`, `newest_issue(messages, issues)`;
  - `thread_payload(user, anchor) -> dict`;
  - routes `GET mail/threads/`, `GET|PATCH mail/messages/<id>/thread/`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_threads.py`:

```python
"""Conversations (contract §2, §3): the thread list groups the person's mail
by thread and orders it by the newest message matching the view; counts and
flags leave trash and spam out except in their own views; the thread shows
every message oldest first, at most MAIL_THREAD_MAX_MESSAGES; PATCH on a
thread changes every message held (starring stars the newest only); all
owner-only, in a fixed number of queries."""

from datetime import timedelta

from django.db import connection as db
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.mail import gmail_store
from services.mail.models import MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

LIST = "/api/v1/mail/threads/"
RENEWALS = {
    "name": "Renewals",
    "color": {"background": "#16a766", "text": "#ffffff"},
    "pending": False,
}


class ThreadFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.m = {}
        for gmail_id, hours, labels, sender, thread in (
            (
                "m1",
                3,
                ["INBOX", "UNREAD", "STARRED", "Label_12"],
                "Sam Pizza <sam@pizzahut.com>",
                "t-1",
            ),
            ("m2", 2, ["SENT"], "Dana <dana@acme.io>", "t-1"),
            ("m3", 1, ["INBOX", "UNREAD"], "Ann Lee <ann@pizzahut.com>", "t-1"),
            ("n1", 0.5, ["INBOX"], "X <x@else.io>", "t-2"),
            ("n2", 0.2, ["TRASH"], "X <x@else.io>", "t-2"),
            ("s1", 5, ["INBOX"], "Y <y@else.io>", "s1"),
        ):
            self.m[gmail_id] = self.store(gmail_id, hours, labels, sender, thread)
        self.client.force_authenticate(self.dana)

    def store(self, gmail_id, hours, labels, sender, thread):
        full = gmail_message(
            gmail_id,
            labels=labels,
            sender=sender,
            to="sam@pizzahut.com" if "dana@" in sender else "dana@acme.io",
            subject=f"Subject {gmail_id}",
            sent_at=self.now - timedelta(hours=hours),
            thread_id=thread,
        )
        return gmail_store.store_gmail(self.mailbox, full, now=self.now)[0]

    def results(self, query=""):
        response = self.client.get(f"{LIST}?{query}")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["results"]


class ThreadListTests(ThreadFixture):
    def test_newest_matching_message_first(self):
        self.assertEqual(
            [row["id"] for row in self.results()],
            [self.m["n1"].pk, self.m["m3"].pk, self.m["s1"].pk],
        )

    def test_a_thread_row(self):
        row = next(r for r in self.results() if r["thread_id"] == "t-1")
        self.assertEqual(
            {key: row[key] for key in row if key not in ("last_sent_at", "labels")},
            {
                "id": self.m["m3"].pk,
                "thread_id": "t-1",
                "subject": "Subject m3",
                "snippet": "Can we talk about the renewal?",
                "message_count": 3,
                "unread_count": 2,
                "participants": [
                    {"name": "Sam Pizza", "address": "sam@pizzahut.com"},
                    {"name": "Dana", "address": "dana@acme.io"},
                    {"name": "Ann Lee", "address": "ann@pizzahut.com"},
                ],
                "more_participants": 0,
                "is_read": False,
                "is_starred": True,
                "is_important": False,
                "priority": True,
                "state": "open",
                "folder": "inbox",
                "has_attachments": False,
                "account": {"id": self.pizza.pk, "name": "Pizza Hut", "type": "customer"},
                "sync_issue": None,
            },
        )
        self.assertEqual(row["last_sent_at"], self.m["m3"].sent_at)
        self.assertEqual(row["labels"], [{"id": self.renewals.pk, **RENEWALS}])

    def test_trash_counts_only_in_the_trash_view(self):
        inbox = next(r for r in self.results() if r["thread_id"] == "t-2")
        self.assertEqual((inbox["id"], inbox["message_count"]), (self.m["n1"].pk, 1))
        [trash] = self.results("folder=trash")
        self.assertEqual(
            (trash["id"], trash["message_count"], trash["folder"]), (self.m["n2"].pk, 2, "trash")
        )

    def test_up_to_three_participants(self):
        for n in range(4):
            self.store(f"p{n}", 6 + n, ["INBOX"], f"P{n} <p{n}@else.io>", "t-3")
        row = next(r for r in self.results() if r["thread_id"] == "t-3")
        self.assertEqual(
            ([p["address"] for p in row["participants"]], row["more_participants"]),
            (["p3@else.io", "p2@else.io", "p1@else.io"], 1),
        )

    def test_a_label_view_anchors_on_the_matching_message(self):
        [row] = self.results(f"folder=all&label={self.renewals.pk}")
        self.assertEqual((row["id"], row["message_count"]), (self.m["m1"].pk, 3))

    def test_unknown_folder_or_label(self):
        self.assertEqual(self.client.get(f"{LIST}?folder=nope").status_code, 400)
        self.assertEqual(
            self.client.get(f"{LIST}?label=999999").data, {"label": ["Choose one of your labels."]}
        )

    def test_outlook_and_imap_without_a_thread_id_are_one_message_each(self):
        imap = self.connect(self.carl)
        for n in range(2):
            MailMessage.objects.create(
                connection=imap,
                owner=self.carl,
                organisation=self.org,
                provider_message_id=f"<i{n}@x.io>",
                direction="received",
                subject="Hi",
                sent_at=self.now,
            )
        self.client.force_authenticate(self.carl)
        self.assertEqual(len(self.results()), 2)

    def test_nobody_elses_threads(self):
        for person in (self.carl, self.alice):
            self.client.force_authenticate(person)
            self.assertEqual(self.results(), [])

    def test_a_fixed_number_of_queries(self):
        self.results()
        with CaptureQueriesContext(db) as few:
            self.results()
        for n in range(5):
            self.store(f"q{n}", 7 + n, ["INBOX", "Label_12"], "Q <q@else.io>", f"tq-{n}")
            self.store(f"r{n}", 7 + n, ["INBOX"], "R <r@else.io>", f"tq-{n}")
        with CaptureQueriesContext(db) as many:
            self.results()
        self.assertEqual(len(few), len(many))
        self.assertLessEqual(len(many), 6)


class ThreadDetailTests(ThreadFixture):
    def test_every_message_oldest_first_trashed_included(self):
        data = self.client.get(f"/api/v1/mail/messages/{self.m['n1'].pk}/thread/").data
        self.assertEqual(
            {k: data[k] for k in ("thread_id", "subject", "truncated", "sync_issue", "account")},
            {
                "thread_id": "t-2",
                "subject": "Subject n1",
                "truncated": False,
                "sync_issue": None,
                "account": None,
            },
        )
        self.assertEqual(
            [(m["id"], m["folder"]) for m in data["messages"]],
            [(self.m["n1"].pk, "inbox"), (self.m["n2"].pk, "trash")],
        )
        self.assertIn("body", data["messages"][0])

    @override_settings(MAIL_THREAD_MAX_MESSAGES=2)
    def test_the_newest_ones_when_there_are_more(self):
        data = self.client.get(f"/api/v1/mail/messages/{self.m['m1'].pk}/thread/").data
        self.assertEqual(
            ([m["id"] for m in data["messages"]], data["truncated"], data["subject"]),
            ([self.m["m2"].pk, self.m["m3"].pk], True, "Subject m2"),
        )
        self.assertEqual(data["labels"], [])  # Renewals is on m1 only, which is not shown

    def test_nobody_else_opens_it(self):
        for person in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(person)
            self.assertEqual(
                self.client.get(f"/api/v1/mail/messages/{self.m['m1'].pk}/thread/").status_code, 404
            )

    def test_seven_queries(self):
        url = f"/api/v1/mail/messages/{self.m['m1'].pk}/thread/"
        self.client.get(url)
        with CaptureQueriesContext(db) as queries:
            self.client.get(url)
        self.assertLessEqual(len(queries), 7)


class ThreadPatchTests(ThreadFixture):
    def patch(self, gmail_id, body):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.patch(
                f"/api/v1/mail/messages/{self.m[gmail_id].pk}/thread/", body, format="json"
            )

    def test_done_archives_every_message_held(self):
        response = self.patch("m1", {"state": "done"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual({m["state"] for m in response.data["messages"]}, {"done", "open"})
        self.assertEqual(
            sorted(MailOutbox.objects.values_list("message__provider_message_id", "label_key")),
            [("m1", "INBOX"), ("m3", "INBOX")],
        )

    def test_star_stars_the_newest_and_unstar_unstars_all(self):
        self.patch("m1", {"is_starred": True})
        self.assertEqual(
            list(MailOutbox.objects.values_list("message__provider_message_id", "add")),
            [("m3", True)],
        )
        self.patch("m1", {"is_starred": False})
        self.assertEqual(
            list(MailOutbox.objects.values_list("message__provider_message_id", "add")),
            [("m1", False)],
        )
        self.assertFalse(MailMessage.objects.filter(is_starred=True).exists())

    @override_settings(MAIL_ACTION_MAX_MESSAGES=2)
    def test_too_many_messages(self):
        response = self.patch("m1", {"is_read": True})
        self.assertEqual(
            (response.status_code, response.data),
            (
                400,
                {
                    "code": "TOO_MANY",
                    "detail": "Select fewer conversations: at most 2 messages at a time.",
                },
            ),
        )

    def test_nobody_else_changes_it(self):
        self.client.force_authenticate(self.carl)
        self.assertEqual(self.patch("m1", {"is_read": True}).status_code, 404)
        self.assertFalse(MailOutbox.objects.exists())

    def test_a_fixed_number_of_queries_whatever_the_thread_length(self):
        self.patch("s1", {"is_read": False})
        with CaptureQueriesContext(db) as one:
            self.client.patch(
                f"/api/v1/mail/messages/{self.m['s1'].pk}/thread/", {"is_read": True}, format="json"
            )
        with CaptureQueriesContext(db) as three:
            self.client.patch(
                f"/api/v1/mail/messages/{self.m['m1'].pk}/thread/", {"is_read": True}, format="json"
            )
        self.assertEqual(len(one), len(three))
        # contract §8: 12, plus the thread payload's own reads (7).
        self.assertLessEqual(len(three), 19)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_threads --parallel auto --noinput`
Expected: FAIL: `/api/v1/mail/threads/` answers 404.

- [ ] **Step 3: The threads module**

Create `services/mail/threads.py`:

```python
"""Conversations (contract §2).

A thread is the owner's messages with the same `thread_id`, or one message
when it has none (IMAP, and anything without a provider thread). A thread is
in a view when any of its messages matches the view's filters, and it is
ordered and shown by its newest matching message (the anchor), found with a
window function: no DISTINCT over a join (the Postgres 16 rule). Counts and
flags leave trash and spam out, except in the trash and spam views, as Gmail
does. A thread is addressed by any of its messages' ids (decision 16).
Owner-only: every query here scopes on the owner.
"""

from collections import defaultdict

from django.conf import settings
from django.db.models import Case, CharField, F, Q, Value, When, Window
from django.db.models.functions import Cast, Concat, RowNumber

from . import outbox
from .models import MailMessage
from .serializers import MailMessageDetailSerializer, account_of, labels_by_gmail_id

HIDDEN = (MailMessage.Folder.TRASH, MailMessage.Folder.SPAM)
#: The thread a row belongs to, in SQL: its thread_id, or "m<id>" alone.
THREAD_KEY = Case(
    When(thread_id="", then=Concat(Value("m"), Cast("id", output_field=CharField()))),
    default=F("thread_id"),
    output_field=CharField(),
)


def key_of(message):
    return message.thread_id or f"m{message.pk}"


def thread_q(message):
    """The messages of `message`'s thread (apply to an owner-scoped queryset)."""
    return Q(thread_id=message.thread_id) if message.thread_id else Q(pk=message.pk)


def anchors(matching):
    """The newest matching message of each thread, newest thread first
    (decision 17)."""
    return (
        matching.annotate(
            newest_first=Window(
                RowNumber(),
                partition_by=[THREAD_KEY],
                order_by=[F("sent_at").desc(), F("id").desc()],
            )
        )
        .filter(newest_first=1)
        .order_by("-sent_at", "-id")
    )


def union_labels(messages, by_key):
    """The user labels on any of `messages`, by name."""
    found = {}
    for message in messages:
        for key in message.label_ids or []:
            if key in by_key:
                found[by_key[key]["id"]] = by_key[key]
    return sorted(found.values(), key=lambda label: label["name"].lower())


def newest_account(messages):
    """The newest filed message's record, else None (`messages` oldest first)."""
    for message in reversed(messages):
        account = account_of(message)
        if account is not None:
            return account
    return None


def newest_issue(messages, issues):
    found = [issues[message.pk] for message in messages if message.pk in issues]
    return max(found, key=lambda issue: issue["at"]) if found else None


def _participants(messages):
    seen, people = set(), []
    for message in messages:
        address = (message.from_address or "").lower()
        if address in seen:
            continue
        seen.add(address)
        people.append({"name": message.from_name, "address": message.from_address})
    return people


def _row(anchor, members, *, view, labels, issues):
    shown = members if view in HIDDEN else [m for m in members if m.folder not in HIDDEN]
    shown = shown or [anchor]
    people = _participants(shown)
    return {
        "id": anchor.pk,
        "thread_id": anchor.thread_id,
        "subject": anchor.subject,
        "snippet": anchor.snippet,
        "last_sent_at": anchor.sent_at,
        "message_count": len(shown),
        "unread_count": sum(not message.is_read for message in shown),
        "participants": people[:3],
        "more_participants": max(len(people) - 3, 0),
        "is_read": all(message.is_read for message in shown),
        "is_starred": any(message.is_starred for message in shown),
        "is_important": any(message.is_important for message in shown),
        "priority": any(message.priority for message in shown),
        "state": anchor.state,
        "folder": anchor.folder,
        "has_attachments": any(message.has_attachments for message in shown),
        "labels": union_labels(shown, labels),
        "account": newest_account(members),
        "sync_issue": newest_issue(members, issues),
    }


def thread_rows(user, page, *, view):
    """One page of anchors as thread rows: their threads' messages in one
    query (filed record joined), then the labels and the sync issues."""
    if not page:
        return []
    threaded = [anchor.thread_id for anchor in page if anchor.thread_id]
    alone = [anchor.pk for anchor in page if not anchor.thread_id]
    members = defaultdict(list)
    # SOC2:AUTH-02 the owner's own messages only
    rows = (
        MailMessage.objects.filter(owner=user)
        .filter(Q(thread_id__in=threaded) | Q(pk__in=alone))
        .select_related("email__customer", "email__account")
        .order_by("sent_at", "id")
    )
    for message in rows:
        members[key_of(message)].append(message)
    labels = labels_by_gmail_id(user)
    issues = outbox.sync_issues([m.pk for group in members.values() for m in group])
    return [
        _row(anchor, members[key_of(anchor)], view=view, labels=labels, issues=issues)
        for anchor in page
    ]


def thread_payload(user, anchor):
    """GET mail/messages/<id>/thread/: every message oldest first, at most
    MAIL_THREAD_MAX_MESSAGES (the newest), trash and spam included."""
    limit = settings.MAIL_THREAD_MAX_MESSAGES
    # SOC2:AUTH-02 the owner's own messages only
    newest = list(
        MailMessage.objects.filter(owner=user)
        .filter(thread_q(anchor))
        .select_related("connection", "email__customer", "email__account")
        .prefetch_related("attachments")
        .order_by("-sent_at", "-id")[: limit + 1]
    )
    truncated = len(newest) > limit
    messages = newest[:limit][::-1]
    labels = labels_by_gmail_id(user)
    issues = outbox.sync_issues([message.pk for message in messages])
    shown = [message for message in messages if message.folder not in HIDDEN] or messages
    return {
        "thread_id": anchor.thread_id,
        "subject": messages[0].subject,
        "labels": union_labels(shown, labels),
        "account": newest_account(messages),
        "sync_issue": newest_issue(messages, issues),
        "truncated": truncated,
        "messages": MailMessageDetailSerializer(
            messages, many=True, context={"labels": labels, "issues": issues}
        ).data,
    }
```

- [ ] **Step 4: The routes**

In `services/mail/views.py`, add `threads` to `from . import ...` and add after `MailMessageDetailView`:

```python
class MailThreadListView(APIView):
    """GET /api/v1/mail/threads/ — the person's own mail as conversations,
    with the message list's filters (filter_messages), newest first."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # SOC2:AUTH-02 the caller's own mail only
        rows, refused = filter_messages(request, MailMessage.objects.filter(owner=request.user))
        if refused is not None:
            return refused
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(threads.anchors(rows), request, view=self)
        view = request.query_params.get("folder", "inbox")
        return paginator.get_paginated_response(threads.thread_rows(request.user, page, view=view))


class MailThreadView(APIView):
    """GET /api/v1/mail/messages/<id>/thread/ — the conversation holding
    message <id>. PATCH changes every message Revenact holds in it (contract
    §3; starring stars the newest only). Owner only: 404 for anyone else."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        anchor = get_object_or_404(MailMessage.objects.filter(owner=request.user), pk=pk)
        return Response(threads.thread_payload(request.user, anchor))

    def patch(self, request, pk):
        with transaction.atomic():
            anchor = get_object_or_404(MailMessage.objects.filter(owner=request.user), pk=pk)
            messages = list(actions.lockable(request.user).filter(threads.thread_q(anchor)))
            refused = actions.change(messages, request.data, star_newest=True)
            if refused is not None:
                return refused
        return Response(threads.thread_payload(request.user, anchor))
```

In `services/mail/urls.py`, after the `mail/messages/<int:pk>/reply/` route, add:

```python
    (path("mail/messages/<int:pk>/thread/", views.MailThreadView.as_view(), name="mail-thread"),)
    (path("mail/threads/", views.MailThreadListView.as_view(), name="mail-threads"),)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/threads.py services/mail/views.py services/mail/urls.py services/mail/tests/test_threads.py
venv/bin/ruff check --fix services/mail/threads.py services/mail/views.py services/mail/urls.py services/mail/tests/test_threads.py
git add services/mail/threads.py services/mail/views.py services/mail/urls.py services/mail/tests/test_threads.py
git commit -m "$(cat <<'EOF'
feat(mail): conversations: the thread list, the thread, and actions on it

Threads anchor on their newest matching message, count outside trash and
spam, and show every message oldest first; PATCH on a thread changes every
message held, starring the newest only.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 11: Bulk actions

**Files:**
- Modify: `services/mail/actions.py` (append the bulk half)
- Modify: `services/mail/views.py` (new `MailActionsView`)
- Modify: `services/mail/urls.py`
- Test: `services/mail/tests/test_bulk.py`

**Interfaces:**
- Consumes: `actions.lockable/resolve_labels/refusal/perform/too_many`, `threads.key_of`.
- Produces:
  - `actions.BULK_OPS: tuple[str, ...]` (including `mute` and `unmute`: Revenact-only, never an outbox row, allowed paused, read-only, disconnected and on Outlook/IMAP, for `message_ids` and `thread_of`, under the same 404 and `TOO_MANY` rules), `actions.LABEL_OPS`;
  - `actions.BulkActionSerializer`;
  - `actions.requested_ids(data) -> set[int] | None`;
  - `actions.expand(user, ids, *, threads) -> list[MailMessage]` (locked, one query);
  - route `POST mail/actions/` answering `{"op", "messages", "threads", "unchanged"}`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_bulk.py`:

```python
"""Bulk actions (contract §3, POST mail/actions/): one op on many messages or
whole conversations; all or nothing, so an id that is not the caller's
makes the whole request 404 and names none; at most MAIL_ACTION_MAX_MESSAGES
after expansion; the counts; Outlook and IMAP local; a fixed number of
queries."""

from datetime import timedelta

from django.db import connection as db
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.billing.models import SeatAssignment
from services.mail import gmail_store
from services.mail.models import MailboxConnection, MailLabel, MailMessage, MailOutbox

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/actions/"


class BulkFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        self.now = timezone.now()
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.m = {}
        for n, (gmail_id, thread) in enumerate(
            (("a1", "t-1"), ("a2", "t-1"), ("b1", "t-2"), ("c1", "c1"))
        ):
            full = gmail_message(
                gmail_id, thread_id=thread, sent_at=self.now - timedelta(minutes=10 - n)
            )
            self.m[gmail_id] = gmail_store.store_gmail(self.mailbox, full, now=self.now)[0]
        self.client.force_authenticate(self.dana)

    def post(self, body):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(URL, body, format="json")

    def ids(self, *gmail_ids):
        return [self.m[gmail_id].pk for gmail_id in gmail_ids]


class BulkTests(BulkFixture):
    def test_archive_whole_conversations(self):
        response = self.post({"op": "archive", "thread_of": self.ids("a1", "b1")})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data, {"op": "archive", "messages": 3, "threads": 2, "unchanged": 0}
        )
        self.assertEqual(MailOutbox.objects.values("action_id").distinct().count(), 1)
        self.assertEqual(MailMessage.objects.filter(state="done").count(), 3)

    def test_label_only_the_messages_named(self):
        response = self.post(
            {"op": "label_add", "label_id": self.renewals.pk, "message_ids": self.ids("a1")}
        )
        self.assertEqual(
            response.data, {"op": "label_add", "messages": 1, "threads": 1, "unchanged": 0}
        )
        self.assertEqual(
            list(
                MailMessage.objects.filter(label_ids__contains=["Label_12"]).values_list(
                    "pk", flat=True
                )
            ),
            self.ids("a1"),
        )

    def test_what_is_already_true_is_unchanged(self):
        self.post({"op": "archive", "message_ids": self.ids("c1")})
        response = self.post({"op": "archive", "message_ids": self.ids("c1")})
        self.assertEqual(
            response.data, {"op": "archive", "messages": 0, "threads": 1, "unchanged": 1}
        )

    def test_starring_a_conversation_stars_its_newest(self):
        response = self.post({"op": "star", "thread_of": self.ids("a1")})
        self.assertEqual(response.data, {"op": "star", "messages": 1, "threads": 1, "unchanged": 1})
        self.assertEqual(
            list(MailMessage.objects.filter(is_starred=True).values_list("pk", flat=True)),
            self.ids("a2"),
        )

    def test_mute_and_unmute(self):
        self.post({"op": "mute", "message_ids": self.ids("c1")})
        self.assertEqual(MailMessage.objects.get(pk=self.m["c1"].pk).state, "muted")
        self.post({"op": "unmute", "message_ids": self.ids("c1")})
        self.assertEqual(MailMessage.objects.get(pk=self.m["c1"].pk).state, "open")
        self.assertFalse(MailOutbox.objects.exists())


class BulkRefusalTests(BulkFixture):
    def test_bodies_that_are_refused(self):
        a1 = self.ids("a1")
        for body, errors in (
            ({"op": "explode", "message_ids": a1}, {"op": ["Choose a known action."]}),
            ({"op": "archive"}, {"non_field_errors": ["Send message_ids or thread_of, not both."]}),
            (
                {"op": "archive", "message_ids": a1, "thread_of": a1},
                {"non_field_errors": ["Send message_ids or thread_of, not both."]},
            ),
            ({"op": "label_add", "message_ids": a1}, {"label_id": ["Choose one of your labels."]}),
            (
                {"op": "archive", "label_id": self.renewals.pk, "message_ids": a1},
                {"label_id": ["Only label actions take a label."]},
            ),
            (
                {"op": "label_add", "label_id": 999999, "message_ids": a1},
                {"label_id": ["Choose one of your labels."]},
            ),
        ):
            response = self.post(body)
            self.assertEqual((response.status_code, response.data), (400, errors), body)
        self.assertEqual(self.post({"op": "archive", "message_ids": []}).status_code, 400)
        self.assertFalse(MailOutbox.objects.exists())

    def test_one_id_that_is_not_mine_404s_the_whole_request(self):
        carls = self.google(self.carl)
        theirs = gmail_store.store_gmail(carls, gmail_message("z1"), now=self.now)[0]
        for ids in (self.ids("a1") + [theirs.pk], self.ids("a1") + [999999]):
            response = self.post({"op": "archive", "message_ids": ids})
            self.assertEqual((response.status_code, response.data), (404, {"detail": "Not found."}))
        self.client.force_authenticate(self.carl)  # her manager
        self.assertEqual(self.post({"op": "archive", "thread_of": self.ids("a1")}).status_code, 404)
        self.assertFalse(MailOutbox.objects.exists())

    @override_settings(MAIL_ACTION_MAX_MESSAGES=2)
    def test_too_many_after_expansion(self):
        response = self.post({"op": "read", "thread_of": self.ids("a1", "b1")})
        self.assertEqual((response.status_code, response.data["code"]), (400, "TOO_MANY"))

    def test_paused_refuses_gmail_ops_and_lets_mute_through(self):
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertEqual(
            self.post({"op": "archive", "message_ids": self.ids("c1")}).data["code"],
            "MAILBOX_PAUSED",
        )
        self.assertEqual(self.post({"op": "mute", "message_ids": self.ids("c1")}).status_code, 200)

    def test_mute_and_unmute_pass_a_read_only_mailbox_for_whole_conversations(self):
        # A thread PATCH can only unmute by setting open or done, which writes to
        # Gmail; bulk mute and unmute are Revenact's own and always pass.
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            granted_scopes=["https://www.googleapis.com/auth/gmail.readonly"]
        )
        archive = self.post({"op": "archive", "thread_of": self.ids("a1")})
        self.assertEqual(archive.data["code"], "TWO_WAY_OFF")
        for op in ("mute", "unmute"):
            response = self.post({"op": op, "thread_of": self.ids("a1")})
            self.assertEqual(response.data, {"op": op, "messages": 2, "threads": 1, "unchanged": 0})
        states = MailMessage.objects.filter(pk__in=self.ids("a1", "a2")).values_list(
            "state", flat=True
        )
        self.assertEqual(set(states), {"open"})
        self.assertFalse(MailOutbox.objects.exists())

    @override_settings(MAIL_ACTION_MAX_MESSAGES=1)
    def test_mute_keeps_the_all_or_nothing_and_size_rules(self):
        self.assertEqual(
            self.post({"op": "mute", "thread_of": self.ids("a1")}).data["code"], "TOO_MANY"
        )
        self.assertEqual(self.post({"op": "mute", "message_ids": [999999]}).status_code, 404)

    def test_outlook_and_imap_are_local_and_refuse_gmail_ops(self):
        imap = self.connect(self.priya)
        rows = [
            MailMessage.objects.create(
                connection=imap,
                owner=self.priya,
                organisation=self.org,
                provider_message_id=f"<i{n}@x.io>",
                direction="received",
                subject="Hi",
                sent_at=self.now,
            )
            for n in range(2)
        ]
        ids = [row.pk for row in rows]
        self.client.force_authenticate(self.priya)
        response = self.post({"op": "archive", "message_ids": ids})
        self.assertEqual(
            response.data, {"op": "archive", "messages": 2, "threads": 2, "unchanged": 0}
        )
        self.assertEqual(
            set(MailMessage.objects.filter(pk__in=ids).values_list("state", flat=True)), {"done"}
        )
        for op, state in (("mute", "muted"), ("unmute", "open")):
            self.assertEqual(self.post({"op": op, "message_ids": ids}).data["messages"], 2)
            states = MailMessage.objects.filter(pk__in=ids).values_list("state", flat=True)
            self.assertEqual(set(states), {state})
        for body in (
            {"op": "trash", "message_ids": ids},
            {"op": "label_add", "label_id": self.renewals.pk, "message_ids": ids},
        ):
            self.assertEqual(self.post(body).data["code"], "GMAIL_ONLY")
        self.assertFalse(MailOutbox.objects.exists())


class BulkCeilingTests(BulkFixture):
    def test_a_fixed_number_of_queries_whatever_the_number_of_conversations(self):
        self.post({"op": "read", "thread_of": self.ids("c1")})
        with CaptureQueriesContext(db) as one:
            self.client.post(URL, {"op": "unread", "thread_of": self.ids("c1")}, format="json")
        with CaptureQueriesContext(db) as many:
            self.client.post(
                URL, {"op": "read", "thread_of": self.ids("a1", "b1", "c1")}, format="json"
            )
        self.assertEqual(len(one), len(many))
        self.assertLessEqual(len(many), 12)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_bulk --parallel auto --noinput`
Expected: FAIL: `/api/v1/mail/actions/` answers 404.

- [ ] **Step 3: The bulk half of the actions module**

In `services/mail/actions.py`, add `from django.db.models import Q` to the imports, then append:

```python
#: What POST mail/actions/ takes (contract §3).
BULK_OPS = (
    Op.READ,
    Op.UNREAD,
    Op.STAR,
    Op.UNSTAR,
    Op.ARCHIVE,
    Op.INBOX,
    Op.TRASH,
    Op.UNTRASH,
    Op.SPAM,
    Op.NOT_SPAM,
    Op.LABEL_ADD,
    Op.LABEL_REMOVE,
    MUTE,
    UNMUTE,
)
LABEL_OPS = frozenset({Op.LABEL_ADD, Op.LABEL_REMOVE})
#: Ids per request (decision 34): the body's own cap.
MAX_IDS = 1000


class BulkActionSerializer(serializers.Serializer):
    op = serializers.CharField()
    message_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        min_length=1,
        max_length=MAX_IDS,
    )
    thread_of = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        min_length=1,
        max_length=MAX_IDS,
    )
    label_id = serializers.IntegerField(required=False)

    def validate_op(self, value):
        if value not in BULK_OPS:
            raise serializers.ValidationError("Choose a known action.")
        return value

    def validate(self, attrs):
        if ("message_ids" in attrs) == ("thread_of" in attrs):
            raise serializers.ValidationError("Send message_ids or thread_of, not both.")
        label_op = attrs["op"] in LABEL_OPS
        if label_op and "label_id" not in attrs:
            raise serializers.ValidationError({"label_id": [CHOOSE_LABEL]})
        if not label_op and "label_id" in attrs:
            raise serializers.ValidationError({"label_id": ["Only label actions take a label."]})
        return attrs


def requested_ids(data):
    """The ids a bulk body names, for check 1, which comes before the body's
    own checks; None when they cannot be read (the serializer answers)."""
    if not isinstance(data, dict):
        return None
    raw = data.get("message_ids", data.get("thread_of"))
    if not isinstance(raw, list) or not 0 < len(raw) <= MAX_IDS:
        return None
    if not all(isinstance(item, int) and not isinstance(item, bool) for item in raw):
        return None
    return set(raw)


def expand(user, ids, *, threads):
    """The caller's messages with these ids, locked; with `threads`, every
    message of their threads too (decision 9). One query."""
    rows = lockable(user)
    if not threads:
        return list(rows.filter(pk__in=ids))
    named = (
        MailMessage.objects.filter(owner=user, pk__in=ids).exclude(thread_id="").values("thread_id")
    )
    return list(rows.filter(Q(pk__in=ids) | Q(thread_id__in=named)))
```

- [ ] **Step 4: The route**

In `services/mail/views.py`, add after `MailThreadView`:

```python
class MailActionsView(APIView):
    """POST /api/v1/mail/actions/ — one op on many messages (`message_ids`)
    or whole conversations (`thread_of`), contract §3. All or nothing: an id
    that is not the caller's makes the whole request 404, naming none."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        ids = actions.requested_ids(data)
        threaded = isinstance(data, dict) and "thread_of" in data
        with transaction.atomic():
            messages = actions.expand(request.user, ids, threads=threaded) if ids else []
            # SOC2:AUTH-02 every id must be the caller's own
            if ids and not ids <= {message.pk for message in messages}:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            serializer = actions.BulkActionSerializer(data=data)
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            valid = serializer.validated_data
            if len(messages) > settings.MAIL_ACTION_MAX_MESSAGES:
                return actions.too_many()
            connection = messages[0].connection
            op, label = valid["op"], None
            if op in actions.LABEL_OPS and connection.is_google:
                found = actions.resolve_labels(connection, [valid["label_id"]])
                if found is None:
                    return Response(
                        {"label_id": [actions.CHOOSE_LABEL]}, status=status.HTTP_400_BAD_REQUEST
                    )
                label = found[valid["label_id"]]
            steps = [(op, label)]
            refused = actions.refusal(connection, steps)
            if refused is not None:
                return refused
            changed = actions.perform(connection, messages, steps, star_newest=threaded)
        return Response(
            {
                "op": op,
                "messages": len(changed),
                "threads": len({threads.key_of(message) for message in messages}),
                "unchanged": len(messages) - len(changed),
            }
        )
```

In `services/mail/urls.py`, after the `mail/threads/` route, add:

```python
    (path("mail/actions/", views.MailActionsView.as_view(), name="mail-actions"),)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/actions.py services/mail/views.py services/mail/urls.py services/mail/tests/test_bulk.py
venv/bin/ruff check --fix services/mail/actions.py services/mail/views.py services/mail/urls.py services/mail/tests/test_bulk.py
git add services/mail/actions.py services/mail/views.py services/mail/urls.py services/mail/tests/test_bulk.py
git commit -m "$(cat <<'EOF'
feat(mail): bulk actions on messages and whole conversations

POST mail/actions/ runs one op on up to 1,000 messages after expanding
conversations, all or nothing, in a fixed number of queries.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 12: Attachments: fetched on first open, sniffed, served, audited

**Files:**
- Create: `services/mail/attachments.py`
- Modify: `services/mail/gmail_sync.py` (new `keep_credentials`)
- Modify: `core/throttling.py` (new `MailAttachmentThrottle`)
- Modify: `services/mail/serializers.py` (`MailMessageDetailSerializer.get_attachments` and its docstring)
- Modify: `services/mail/views.py` (new `MailAttachmentDownloadView`; imports)
- Modify: `services/mail/urls.py`
- Modify: `services/mail/tests/test_reading.py` (`test_the_detail_has_the_safe_html_and_every_part`)
- Test: `services/mail/tests/test_attachments.py`

**Interfaces:**
- Consumes: `GmailSession.get_message/attachment`, `gmail_sync.session_for/classify_failure/pause_revoked/_save`, `gates.paused_reason`, `files.ALLOWED_TYPES/MAGIC/extension_of`, `mail_attachment_path`, `visible_children_q`, `visible_emails_q`, `core.audit`.
- Produces:
  - `gmail_sync.keep_credentials(connection, session) -> None`;
  - `core.throttling.MailAttachmentThrottle` (scope `mail_attachment`, per user);
  - `services.mail.attachments`: `OCTET`, `INLINE_TYPES`, `Gone`, `Unavailable`, `Busy(retry_after)`, `preview(part) -> bool`, `available(part, connection) -> bool`, `served_type(part, head: bytes) -> str`, `fetch(part, connection) -> bytes`, `cache(part, data, now) -> bool`, `response(part, *, download) -> FileResponse`, `readable(user, pk) -> MailAttachment` (raises `Http404`);
  - the detail's `attachments[]` gain `available`, `preview`, `download_url`;
  - route `GET mail/attachments/<id>/download/`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_attachments.py`:

```python
"""Attachments (contract §6): fetched from Gmail through the owner's mailbox
on the first open (the message re-read for the current attachment id, or
the bytes inline in the payload), cached under the organisation, served
with the declared type only when the extension, the declared type and the
leading bytes agree, inline only for images and PDFs. 413 over the cap,
409 when the mailbox cannot fetch, 410 when Gmail no longer has it, 503
when Gmail is busy. The owner reads their own; a filed message's files are
read under the twice-filter, and every such read is audited."""

import re
from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from core.throttling import MailAttachmentThrottle
from services.billing.models import SeatAssignment
from services.mail import attachments, gmail_store
from services.mail.models import MailAttachment, MailboxConnection

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

PDF = b"%PDF-1.4 renewal quote"
PNG = b"\x89PNG\r\n\x1a\n fake logo"


class AttachmentFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        self.mailbox = self.google(self.dana)
        full = fixture("message_full.json")  # from Pizza Hut: filed
        self.fake.add(full, quietly=True)
        self.row, self.filed = gmail_store.store_gmail(self.mailbox, full, now=self.now)
        self.pdf = self.row.attachments.get(part_id="1")
        self.logo = self.row.attachments.get(part_id="2")
        self.fake.attach_file(full["id"], "1", PDF)
        self.fake.attach_file(full["id"], "2", PNG, in_payload=True)
        self.client.force_authenticate(self.dana)

    def get(self, part, query=""):
        return self.client.get(f"/api/v1/mail/attachments/{part.pk}/download/{query}")

    def body(self, response):
        return b"".join(response.streaming_content)

    def gmail_reads(self):
        return [where for _, where, _ in self.fake.calls if "/messages/" in where]

    def unfiled(self, gmail_id, filename, mime_type, data):
        full = gmail_message(
            gmail_id,
            sender="Stranger <x@else.io>",
            attachments=[{"filename": filename, "mime_type": mime_type, "size": len(data)}],
        )
        self.fake.add(full, quietly=True)
        row, _ = gmail_store.store_gmail(self.mailbox, full, now=self.now)
        self.fake.attach_file(gmail_id, "1", data)
        return row.attachments.get()


class FirstOpenTests(AttachmentFixture):
    def test_the_first_open_fetches_it_once_and_serves_it_inline(self):
        response = self.get(self.pdf)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.body(response), PDF)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response["Content-Disposition"].startswith("inline"))
        self.assertEqual(response["Content-Length"], str(len(PDF)))
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["Content-Security-Policy"], "default-src 'none'; sandbox")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        # Re-read for the current attachment id (Gmail rotates them), then the bytes.
        self.assertEqual(len(self.gmail_reads()), 2)
        self.pdf.refresh_from_db()
        self.assertRegex(
            self.pdf.file.name, rf"^mail_attachments/{self.org.pk}/[0-9a-f]{{32}}\.pdf$"
        )
        self.assertIsNotNone(self.pdf.fetched_at)
        self.assertEqual(self.body(self.get(self.pdf)), PDF)
        self.assertEqual(len(self.gmail_reads()), 2)  # cached: Gmail is not asked again

    def test_a_small_part_inline_in_the_payload_takes_one_call(self):
        response = self.get(self.logo)
        self.assertEqual((self.body(response), response["Content-Type"]), (PNG, "image/png"))
        self.assertEqual(len(self.gmail_reads()), 1)

    def test_download_forces_an_attachment(self):
        response = self.get(self.pdf, "?download=1")
        self.assertTrue(response["Content-Disposition"].startswith("attachment"))

    def test_bytes_that_are_not_their_type_and_unsafe_types_are_plain_downloads(self):
        for gmail_id, filename, mime_type, data in (
            ("u1", "quote.pdf", "application/pdf", b"<html><script>"),
            ("u2", "logo.svg", "image/svg+xml", b"<svg onload=x>"),
            ("u3", "files.zip", "application/zip", b"PK\x03\x04zip"),
        ):
            part = self.unfiled(gmail_id, filename, mime_type, data)
            response = self.get(part)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Content-Type"], "application/octet-stream", filename)
            self.assertTrue(response["Content-Disposition"].startswith("attachment"), filename)

    def test_two_first_opens_at_once_keep_one_file(self):
        first = MailAttachment.objects.get(pk=self.pdf.pk)
        second = MailAttachment.objects.get(pk=self.pdf.pk)
        storage = MailAttachment._meta.get_field("file").storage
        self.assertTrue(attachments.cache(first, PDF, self.now))
        with patch.object(storage, "delete", wraps=storage.delete) as delete:
            self.assertFalse(attachments.cache(second, PDF, self.now))
        discarded = delete.call_args.args[0]
        self.assertEqual(second.file.name, first.file.name)
        self.assertNotEqual(discarded, first.file.name)
        self.assertTrue(storage.exists(first.file.name))
        self.assertFalse(storage.exists(discarded))


class RefusalTests(AttachmentFixture):
    def assertCode(self, response, status_code, code):
        self.assertEqual((response.status_code, response.data["code"]), (status_code, code))

    @override_settings(MAIL_ATTACHMENT_MAX_BYTES=10)
    def test_over_the_cap_declared_or_real(self):
        self.assertCode(self.get(self.pdf), 413, "ATTACHMENT_TOO_LARGE")
        self.assertEqual(self.gmail_reads(), [])
        MailAttachment.objects.filter(pk=self.pdf.pk).update(
            size=5
        )  # declared small, really 22 bytes
        self.assertCode(self.get(self.pdf), 413, "ATTACHMENT_TOO_LARGE")
        self.pdf.refresh_from_db()
        self.assertEqual(self.pdf.file.name, "")

    def test_a_mailbox_that_cannot_fetch(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        response = self.get(self.pdf)
        self.assertEqual(
            (response.status_code, response.data),
            (
                409,
                {
                    "code": "ATTACHMENT_UNAVAILABLE",
                    "detail": "This file hasn't been fetched from Gmail yet, and its mailbox isn't connected.",
                },
            ),
        )

    def test_a_paused_mailbox_cannot_fetch_but_a_cached_file_is_still_served(self):
        self.get(self.pdf)
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertCode(self.get(self.logo), 409, "ATTACHMENT_UNAVAILABLE")
        self.assertEqual(self.get(self.pdf).status_code, 200)

    def test_gone_from_gmail(self):
        del self.fake.messages[self.row.provider_message_id]["payload"]["parts"][1]
        self.assertCode(self.get(self.pdf), 410, "ATTACHMENT_GONE")
        del self.fake.messages[self.row.provider_message_id]
        self.assertCode(self.get(self.logo), 410, "ATTACHMENT_GONE")

    def test_gmail_busy(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
            backoff_until=self.now + timedelta(seconds=90)
        )
        response = self.get(self.pdf)
        self.assertCode(response, 503, "GMAIL_BUSY")
        self.assertEqual(response.data["detail"], "Gmail is busy. Try again in a minute.")
        self.assertLessEqual(int(response["Retry-After"]), 90)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(backoff_until=None)
        self.fake.fail(r"/attachments/", 503)
        self.assertCode(self.get(self.pdf), 503, "GMAIL_BUSY")
        self.mailbox.refresh_from_db()
        self.assertIsNone(self.mailbox.backoff_until)  # a fetch never backs the mailbox off

    def test_a_lost_grant_pauses_the_mailbox(self):
        self.fake.fail(r"/messages/", 403, "insufficientPermissions")
        self.assertCode(self.get(self.pdf), 409, "ATTACHMENT_UNAVAILABLE")
        self.mailbox.refresh_from_db()
        self.assertEqual(self.mailbox.paused_reason, "token_revoked")

    def test_it_is_throttled_per_user(self):
        with patch.object(MailAttachmentThrottle, "rate", "2/min"):
            codes = [self.get(self.pdf).status_code for _ in range(3)]
        self.assertEqual(codes, [200, 200, 429])


class WhoReadsTests(AttachmentFixture):
    def test_the_owners_read_of_filed_mail_is_audited(self):
        self.get(self.pdf)
        event = AuditEvent.objects.get(action="mailbox.attachment_downloaded")
        self.assertEqual(
            (event.actor, event.target_type, event.target_id, event.target_repr),
            (self.dana, "mail.mailattachment", str(self.pdf.pk), f"attachment {self.pdf.pk}"),
        )
        self.assertEqual(
            event.metadata,
            {
                "email": self.filed.pk,
                "attachment": self.pdf.pk,
                "content_type": "application/pdf",
                "size": 182311,
                "fetched": True,
                "owner": True,
            },
        )

    def test_unfiled_mail_is_the_owners_alone_and_not_audited(self):
        part = self.unfiled("u1", "notes.txt", "text/plain", b"hello")
        self.assertEqual(self.get(part).status_code, 200)
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.attachment_downloaded").exists())
        for person in (self.carl, self.alice, self.priya):
            self.client.force_authenticate(person)
            self.assertEqual(self.get(part).status_code, 404)

    def test_filed_mail_is_read_under_the_twice_filter(self):
        self.client.force_authenticate(self.carl)  # her manager, who may open Pizza Hut
        self.assertEqual(self.body(self.get(self.pdf)), PDF)
        event = AuditEvent.objects.get(action="mailbox.attachment_downloaded")
        self.assertEqual((event.actor, event.metadata["owner"]), (self.carl, False))
        # Priya may open Pizza Hut (view-all) but is outside Dana's chain.
        self.client.force_authenticate(self.priya)
        self.assertEqual(self.get(self.pdf).status_code, 404)


class DetailFieldTests(AttachmentFixture):
    def parts(self):
        return self.client.get(f"/api/v1/mail/messages/{self.row.pk}/").data["attachments"]

    def test_available_preview_and_the_url(self):
        pdf, logo = self.parts()
        self.assertEqual(
            {k: pdf[k] for k in ("available", "preview", "download_url")},
            {
                "available": True,
                "preview": True,
                "download_url": f"/api/v1/mail/attachments/{self.pdf.pk}/download/",
            },
        )
        self.assertTrue(logo["preview"])

    def test_not_available_from_a_mailbox_that_cannot_fetch_unless_cached(self):
        self.get(self.pdf)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        pdf, logo = self.parts()
        self.assertEqual(
            (pdf["available"], logo["available"], logo["download_url"]), (True, False, None)
        )
        self.assertTrue(re.match(r"^/api/v1/mail/attachments/\d+/download/$", pdf["download_url"]))
```

In `services/mail/tests/test_reading.py`, `test_the_detail_has_the_safe_html_and_every_part`: the mailbox there is a live two-way Google one, so both parts are now available. Replace `"available": False,` in the first part with

```python
                    "available": True,
                    "preview": True,
                    "download_url": f"/api/v1/mail/attachments/{parts[0].pk}/download/",
```

and in the second part with

```python
                    "available": True,
                    "preview": True,
                    "download_url": f"/api/v1/mail/attachments/{parts[1].pk}/download/",
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_attachments --parallel auto --noinput`
Expected: FAIL with `ImportError: cannot import name 'MailAttachmentThrottle' from 'core.throttling'`.

- [ ] **Step 3: The throttle and the stored token**

In `core/throttling.py`, change `from rest_framework.throttling import SimpleRateThrottle` to `from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle` and add after `GmailPushThrottle`:

```python
class MailAttachmentThrottle(UserRateThrottle):
    """Mail attachment downloads (services/mail/views.py), per user: a first
    open costs two Gmail calls through the owner's mailbox."""

    scope = "mail_attachment"
    rate = None  # resolved from DEFAULT_THROTTLE_RATES[scope]; tests patch this
```

In `services/mail/gmail_sync.py`, after `ensure_claim`, add:

```python
def keep_credentials(connection, session):
    """A token `session` refreshed outside a tick (an attachment fetch) is
    stored; nothing else on the row is written."""
    if session.creds.data != connection.get_credentials():
        connection.set_credentials(session.creds.data)
        _save(connection, ["credentials"])
```

- [ ] **Step 4: The attachments module**

Create `services/mail/attachments.py`:

```python
"""Opening a Gmail attachment (contract §6).

A part is fetched on its first open, through its owner's mailbox, whoever
asks: the message is re-read with format=full because Gmail rotates
attachment ids, the part matched on `part_id`, and its bytes taken from the
payload when Gmail put them there, else from attachments.get. The file is
cached under its organisation and served from there afterwards. Two first
opens at once both fetch; the first to store keeps its file.

What is served (SOC2:API-10): the declared type only when the extension is
on files.ALLOWED_TYPES, the declared type is one of that extension's and the
leading bytes match where files.MAGIC knows them; otherwise
application/octet-stream. Inline only for images and PDFs. Mail files are
never refused for their type (the person needs their own zip): they are
only made a download. No log line names a file.
"""

import base64
import logging

from django.core.files.base import ContentFile
from django.http import FileResponse, Http404

from services.customers.files import ALLOWED_TYPES, MAGIC, extension_of

from .models import MailAttachment, MailboxConnection, mail_attachment_path
from .providers.base import ProviderError

logger = logging.getLogger(__name__)
OCTET = "application/octet-stream"
#: Served inline (unless ?download=1); SVG never is.
INLINE_TYPES = frozenset({"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"})


class Gone(Exception):
    """Gmail no longer has the message, or the part (410)."""


class Unavailable(Exception):
    """The mailbox cannot fetch: a lost grant or a missing permission (409)."""


class Busy(Exception):
    """Gmail is rate-limiting or failing (503)."""

    def __init__(self, retry_after=None):
        super().__init__("gmail busy")
        self.retry_after = retry_after or 60


def _declared(part):
    extension = extension_of(part.filename)
    declared = (part.mime_type or "").split(";")[0].strip().lower()
    return extension, declared, extension in ALLOWED_TYPES and declared in ALLOWED_TYPES[extension]


def preview(part):
    """Served inline: judged on the declared type and extension, before any fetch."""
    _, declared, agreed = _declared(part)
    return agreed and declared in INLINE_TYPES


def available(part, connection):
    """Cached, or its mailbox can fetch it: Google, not disconnected, not
    paused (the pause the sweep stored, plan gap 11)."""
    return bool(part.file) or (
        connection.is_google
        and connection.status != MailboxConnection.Status.DISCONNECTED
        and not connection.paused_reason
    )


def served_type(part, head):
    """The type the bytes go out as (decision 27)."""
    extension, declared, agreed = _declared(part)
    if not agreed:
        return OCTET
    if extension in MAGIC and not any(head.startswith(magic) for magic in MAGIC[extension]):
        return OCTET
    return declared


def _find(part, part_id):
    if part.get("partId") == part_id:
        return part
    for child in part.get("parts") or []:
        found = _find(child, part_id)
        if found is not None:
            return found
    return None


def _decode(data):
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def fetch(part, connection):
    """The part's bytes from Gmail (decision 26). Raises Gone, Unavailable (the
    mailbox is paused first) or Busy (the mailbox's backoff is not touched)."""
    from . import gmail_sync

    session = gmail_sync.session_for(connection)
    gmail_id = part.message.provider_message_id
    try:
        full = session.get_message(gmail_id, "full")
        found = _find((full or {}).get("payload") or {}, part.part_id) if full else None
        if found is None:
            raise Gone
        body = found.get("body") or {}
        if body.get("data"):
            return _decode(body["data"])
        if not body.get("attachmentId"):
            raise Gone
        answer = session.attachment(gmail_id, body["attachmentId"])
        if answer is None:
            raise Gone
        return _decode(answer.get("data", ""))
    except ProviderError as exc:
        logger.warning(
            "gmail attachment fetch failed for connection %s: %s %s",
            connection.pk,
            exc.status,
            exc.reason,
        )
        if gmail_sync.classify_failure(exc) != "backoff":
            gmail_sync.pause_revoked(connection, exc)
            raise Unavailable from exc
        raise Busy(exc.retry_after) from exc
    finally:
        gmail_sync.keep_credentials(connection, session)


def cache(part, data, now):
    """Store the fetched bytes once. The first fetch to finish keeps its file,
    a second deletes its own copy and takes the first's. Returns whether this
    call's file was kept."""
    storage = MailAttachment._meta.get_field("file").storage
    name = storage.save(mail_attachment_path(part, part.filename), ContentFile(data))
    if MailAttachment.objects.filter(pk=part.pk, file="").update(file=name, fetched_at=now):
        part.file, part.fetched_at = name, now
        return True
    storage.delete(name)
    part.refresh_from_db(fields=["file", "fetched_at"])
    return False


def response(part, *, download):
    """The cached file, typed and disposed by decision 27, with the Files
    tab's headers."""
    handle = part.file.open("rb")
    head = handle.read(8)
    handle.seek(0)
    content_type = served_type(part, head)
    inline = not download and content_type in INLINE_TYPES
    answer = FileResponse(
        handle, as_attachment=not inline, filename=part.filename, content_type=content_type
    )
    # SOC2:API-10 someone's mail is a file, never a page of this site
    answer["X-Content-Type-Options"] = "nosniff"
    answer["Content-Security-Policy"] = "default-src 'none'; sandbox"
    answer["Cache-Control"] = "private, no-store"
    return answer


def readable(user, pk):
    """The attachment, when `user` may read it (decision 29): its mailbox's
    owner; or, for a filed message, whoever may open that record and read
    that email. Http404 for anyone else."""
    from services.customers.models import Email
    from services.customers.scoping import visible_children_q

    from .visibility import visible_emails_q

    part = MailAttachment.objects.select_related("message__connection__user").filter(pk=pk).first()
    if part is None:
        raise Http404
    message = part.message
    if message.owner_id == user.pk:
        return part
    # SOC2:AUTH-02 filed mail: the record's rule and the mailbox chain, both
    if (
        message.email_id is not None
        and Email.objects.filter(pk=message.email_id)
        .filter(visible_children_q(user))
        .filter(visible_emails_q(user))
        .exists()
    ):
        return part
    raise Http404
```

- [ ] **Step 5: The detail's fields and the route**

In `services/mail/serializers.py`, replace `MailMessageDetailSerializer`'s docstring and `get_attachments`:

```python
class MailMessageDetailSerializer(MailMessageSerializer):
    """The whole message: the text body, the sanitised HTML ("" when there is
    none, or it was too large), and every file part, inline ones included so
    the frontend can resolve cid: images. `available` (cached, or the
    mailbox can fetch it), `preview` (served inline) and `download_url` come
    from services/mail/attachments.py. rfc_message_id, references and raw
    label ids are never exposed."""

    attachments = serializers.SerializerMethodField()

    class Meta(MailMessageSerializer.Meta):
        fields = MailMessageSerializer.Meta.fields + ["body", "html_body", "attachments"]

    def get_attachments(self, message):
        from .attachments import available, preview

        rows = []
        for part in sorted(message.attachments.all(), key=lambda part: part.part_id):
            ok = available(part, message.connection)
            rows.append(
                {
                    "id": part.pk,
                    "filename": part.filename,
                    "mime_type": part.mime_type,
                    "size": part.size,
                    "is_inline": part.is_inline,
                    "content_id": part.content_id,
                    "available": ok,
                    "preview": preview(part),
                    "download_url": f"/api/v1/mail/attachments/{part.pk}/download/" if ok else None,
                }
            )
        return rows
```

In `services/mail/views.py`, add `import math` to the imports, `MailAttachmentThrottle` to `from core.throttling import GmailPushThrottle`, `attachments` to `from . import ...`, and add at the end of the file:

```python
#: The download route's refusals (contract §6), the same text for everyone.
ATTACHMENT_ERRORS = {
    "ATTACHMENT_UNAVAILABLE": (
        status.HTTP_409_CONFLICT,
        "This file hasn't been fetched from Gmail yet, and its mailbox isn't connected.",
    ),
    "ATTACHMENT_GONE": (status.HTTP_410_GONE, "This file is no longer in Gmail."),
    "ATTACHMENT_TOO_LARGE": (
        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        "This file is too large to open here. Open it in Gmail.",
    ),
}


def _attachment_error(code):
    http_status, detail = ATTACHMENT_ERRORS[code]
    return actions.error(code, detail, http_status)


def _gmail_busy(seconds):
    answer = actions.error(
        "GMAIL_BUSY", "Gmail is busy. Try again in a minute.", status.HTTP_503_SERVICE_UNAVAILABLE
    )
    answer["Retry-After"] = str(max(math.ceil(seconds), 1))
    return answer


class MailAttachmentDownloadView(APIView):
    """GET /api/v1/mail/attachments/<id>/download/ — one file part (contract
    §6): the owner's, or a filed message's under the twice-filter. Fetched
    from Gmail on the first open and cached; ?download=1 forces a download.
    Every read of a filed message's file is audited."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [MailAttachmentThrottle]

    def get(self, request, pk):
        part = attachments.readable(request.user, pk)
        message = part.message
        connection = message.connection
        fetched = False
        if not part.file:
            limit = settings.MAIL_ATTACHMENT_MAX_BYTES
            if part.size > limit:
                return _attachment_error("ATTACHMENT_TOO_LARGE")
            if (
                not connection.is_google
                or connection.status == DISCONNECTED
                or gates.paused_reason(connection)
            ):
                return _attachment_error("ATTACHMENT_UNAVAILABLE")
            now = timezone.now()
            if connection.backoff_until and connection.backoff_until > now:
                return _gmail_busy((connection.backoff_until - now).total_seconds())
            try:
                data = attachments.fetch(part, connection)
            except attachments.Gone:
                return _attachment_error("ATTACHMENT_GONE")
            except attachments.Unavailable:
                return _attachment_error("ATTACHMENT_UNAVAILABLE")
            except attachments.Busy as busy:
                return _gmail_busy(busy.retry_after)
            if len(data) > limit:
                return _attachment_error("ATTACHMENT_TOO_LARGE")
            attachments.cache(part, data, now)
            fetched = True
        if message.email_id is not None:
            audit.record(  # SOC2:LOG-01 a file from someone's mailbox was read through a record
                "mailbox.attachment_downloaded",
                request=request,
                target=part,
                metadata={
                    "email": message.email_id,
                    "attachment": part.pk,
                    "content_type": part.mime_type,
                    "size": part.size,
                    "fetched": fetched,
                    "owner": message.owner_id == request.user.pk,
                },
            )
        return attachments.response(part, download=_truthy(request.query_params.get("download")))
```

(`DISCONNECTED` is `views.py`'s module-level `MailboxConnection.Status.DISCONNECTED`.)

In `services/mail/urls.py`, after the `mail/labels/` route, add:

```python
    (
        path(
            "mail/attachments/<int:pk>/download/",
            views.MailAttachmentDownloadView.as_view(),
            name="mail-attachment-download",
        ),
    )
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail core --parallel auto --noinput`
Expected: OK.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff format core/throttling.py services/mail/attachments.py services/mail/gmail_sync.py services/mail/serializers.py services/mail/views.py services/mail/urls.py services/mail/tests/test_attachments.py services/mail/tests/test_reading.py
venv/bin/ruff check --fix core/throttling.py services/mail/attachments.py services/mail/gmail_sync.py services/mail/serializers.py services/mail/views.py services/mail/urls.py services/mail/tests/test_attachments.py services/mail/tests/test_reading.py
git add core/throttling.py services/mail/attachments.py services/mail/gmail_sync.py services/mail/serializers.py services/mail/views.py services/mail/urls.py services/mail/tests/test_attachments.py services/mail/tests/test_reading.py
git commit -m "$(cat <<'EOF'
feat(mail): open gmail attachments, fetched once and served safely

The first open re-reads the message and fetches the part through the
owner's mailbox; the file is cached, typed only when name, declared type
and bytes agree, inline only for images and PDFs; filed mail's files are
twice-filtered and every read audited; throttled per user.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 13: The Files tab lists filed mail's attachments

**Files:**
- Modify: `services/mail/attachments.py` (append `file_row`, `filed_rows`)
- Modify: `services/customers/views.py` (`_FileListView`: `_parents`, `get_queryset`, `create`, new `list`)
- Modify: `services/customers/serializers.py` (`AttachmentSerializer.email`)
- Modify: `services/customers/tests/test_files_and_calls.py` (`test_the_query_count_does_not_grow_with_the_list`)
- Test: `services/mail/tests/test_files_tab.py`

**Interfaces:**
- Consumes: `customer_rollup_q`, `visible_emails_q`, `MailAttachment`.
- Produces:
  - `attachments.file_row(part) -> dict` (the Files tab shape, `source: "email"`);
  - `attachments.filed_rows(user, *, customer=None, account=None) -> list[tuple[datetime, int, dict]]` (one query);
  - every Files row (uploads too) has `email` (`null` on uploads).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_files_tab.py`:

```python
"""The Files tab (contract §6, decisions 29 and 30): an organisation's or an
account's Files list gains the non-inline attachments of mail filed there,
each twice-filtered (the record and the mailbox chain), merged newest first
with the uploads, linked to the mail download route; they go when the
person's copy goes, while the filed Email stays."""

from datetime import timedelta

from django.core.files.base import ContentFile
from django.db import connection as db
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.customers.models import Attachment, Email
from services.mail import gmail_store

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

APAC_PDF = {"filename": "apac.pdf", "mime_type": "application/pdf", "size": 900}


class FilesTabFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.now = timezone.now()
        self.mailbox = self.google(self.dana)
        # 2026-10-09, from Pizza Hut: filed on the organisation, a PDF and an inline logo.
        self.row, self.filed = gmail_store.store_gmail(
            self.mailbox, fixture("message_full.json"), now=self.now
        )
        self.pdf = self.row.attachments.get(part_id="1")
        account_row, account_email = gmail_store.store_gmail(
            self.mailbox,
            gmail_message("acc1", attachments=[APAC_PDF], sent_at=self.now - timedelta(hours=1)),
            now=self.now,
        )
        Email.objects.filter(pk=account_email.pk).update(customer=None, account=self.apac)
        self.account_email = Email.objects.get(pk=account_email.pk)
        self.apac_pdf = account_row.attachments.get()
        self.upload = Attachment.objects.create(
            organisation=self.org,
            customer=self.pizza,
            file=ContentFile(b"%PDF-1.4", name="msa.pdf"),
            name="msa.pdf",
            content_type="application/pdf",
            size=8,
            uploaded_by=self.carl,
        )

    def files(self, person, url=None):
        self.client.force_authenticate(person)
        response = self.client.get(url or f"/api/v1/customers/{self.pizza.pk}/files/")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data


class OrganisationFilesTests(FilesTabFixture):
    def test_filed_attachments_sit_beside_uploads_newest_first(self):
        rows = self.files(self.carl)  # her manager, who owns Pizza Hut
        self.assertEqual(
            [(row["source"], row["id"]) for row in rows],
            [("upload", self.upload.pk), ("email", self.apac_pdf.pk), ("email", self.pdf.pk)],
        )
        self.assertIsNone(rows[0]["email"])
        pdf = rows[2]
        self.assertEqual(
            {key: pdf[key] for key in pdf if key != "created_at"},
            {
                "id": self.pdf.pk,
                "account_id": None,
                "account_name": None,
                "name": "Renewal quote.pdf",
                "content_type": "application/pdf",
                "size": 182311,
                "description": "",
                "source": "email",
                "uploaded_by": None,
                "download_url": f"/api/v1/mail/attachments/{self.pdf.pk}/download/",
                "email": {
                    "id": self.filed.pk,
                    "subject": self.filed.subject,
                    "from": self.filed.sender_name,
                },
            },
        )
        self.assertTrue(pdf["created_at"].startswith("2026-10-09T09:00:00"))
        self.assertEqual((rows[1]["account_id"], rows[1]["account_name"]), (self.apac.pk, "APAC"))

    def test_the_account_lists_its_own(self):
        rows = self.files(
            self.carl, f"/api/v1/customers/{self.pizza.pk}/accounts/{self.apac.pk}/files/"
        )
        self.assertEqual(
            [(row["source"], row["id"]) for row in rows], [("email", self.apac_pdf.pk)]
        )

    def test_only_through_the_twice_filter(self):
        self.assertEqual(len([r for r in self.files(self.dana) if r["source"] == "email"]), 2)
        # Priya may open Pizza Hut (view-all) but is outside Dana's chain.
        self.assertEqual([r["source"] for r in self.files(self.priya)], ["upload"])

    def test_they_go_with_the_persons_copy_and_the_email_stays(self):
        self.row.delete()
        self.assertEqual(
            [r["id"] for r in self.files(self.carl) if r["source"] == "email"], [self.apac_pdf.pk]
        )
        self.assertTrue(Email.objects.filter(pk=self.filed.pk).exists())

    def test_one_more_query_however_many(self):
        self.files(self.carl)
        with CaptureQueriesContext(db) as few:
            self.client.get(f"/api/v1/customers/{self.pizza.pk}/files/")
        for n in range(3):
            gmail_store.store_gmail(
                self.mailbox, gmail_message(f"more{n}", attachments=[APAC_PDF]), now=self.now
            )
        with CaptureQueriesContext(db) as many:
            rows = self.client.get(f"/api/v1/customers/{self.pizza.pk}/files/").data
        self.assertEqual(len(rows), 6)
        self.assertEqual(len(few), len(many))
```

In `services/customers/tests/test_files_and_calls.py`, `test_the_query_count_does_not_grow_with_the_list`, change the comment and the count:

```python
            # Three however long the list: the organisation, the files with
            # their uploader and account joined, and filed mail's attachments.
            with self.assertNumQueries(3):
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_files_tab services.customers.tests.test_files_and_calls --parallel auto --noinput`
Expected: FAIL: no `email` rows, and the upload rows have no `email` key.

- [ ] **Step 3: The rows**

Append to `services/mail/attachments.py` (add `from rest_framework import serializers` and `from django.db.models import Q` to the imports):

```python
def file_row(part):
    """A filed message's attachment as a Files tab row (decision 30): its id
    is the MailAttachment's, so the frontend tells rows apart by `source`."""
    email = part.message.email
    return {
        "id": part.pk,
        "account_id": email.account_id,
        "account_name": email.account.name if email.account_id else None,
        "name": part.filename,
        "content_type": part.mime_type,
        "size": part.size,
        "description": "",
        "source": "email",
        "uploaded_by": None,
        "download_url": f"/api/v1/mail/attachments/{part.pk}/download/",
        "created_at": serializers.DateTimeField().to_representation(email.sent_at),
        "email": {"id": email.pk, "subject": email.subject, "from": email.sender_name},
    }


def filed_rows(user, *, customer=None, account=None):
    """The non-inline attachments of mail filed on this organisation (and on
    its accounts the caller may open) or on this account, each one only where
    the caller may also read the email (the twice-filter, decision 29). One
    query. Returns (sent_at, id, row) for merging with the uploads."""
    from services.customers.models import Email
    from services.customers.scoping import customer_rollup_q

    from .visibility import visible_emails_q

    where = customer_rollup_q(user, customer) if customer is not None else Q(account=account)
    # SOC2:AUTH-02 the record's rule and the mailbox chain, both
    emails = Email.objects.filter(where).filter(visible_emails_q(user))
    parts = MailAttachment.objects.filter(
        is_inline=False, message__email__in=emails
    ).select_related("message__email__account")
    return [(part.message.email.sent_at, part.pk, file_row(part)) for part in parts]
```

- [ ] **Step 4: The Files list**

In `services/customers/serializers.py`, `AttachmentSerializer`: add `email = serializers.SerializerMethodField()`, add `"email"` after `"created_at"` in `fields`, add to the docstring "`email` is null: only the mail rows the Files list merges in (services.mail.attachments.file_row) carry one.", and add:

```python
    def get_email(self, obj):
        return None
```

In `services/customers/views.py`, `_FileListView`: add `_parents` after `_parent`, use it in `get_queryset` and `create`, and add `list`:

```python
    def _parents(self):
        """`_parent()` once per request: the list resolves it for the uploads
        and for filed mail's attachments."""
        if not hasattr(self, "_resolved"):
            self._resolved = self._parent()
        return self._resolved


    def get_queryset(self):
        customer, account = self._parents()
        if customer is not None:
            # SOC2:AUTH-02 an account's file follows its own account's visibility
            rows = Attachment.objects.filter(customer_rollup_q(self.request.user, customer))
        else:
            rows = account.attachments.all()
        return rows.select_related("uploaded_by", "account")


    def list(self, request, *args, **kwargs):
        """Uploads and filed mail's attachments (source "email"), newest first."""
        from services.mail.attachments import filed_rows

        customer, account = self._parents()
        rows = [(row.created_at, row.pk, self.get_serializer(row).data) for row in self.get_queryset()]
        rows += filed_rows(request.user, customer=customer, account=account)
        rows.sort(key=lambda item: (item[0], item[1]), reverse=True)
        return Response([data for _, _, data in rows])
```

and in `create`, change `customer, account = self._parent()` to `customer, account = self._parents()`. Extend the class docstring with: "The list also carries the non-inline attachments of mail filed on the company (services.mail.attachments.filed_rows), twice-filtered, with `source: "email"`; they are read and downloaded through the mail route and never deleted here."

- [ ] **Step 5: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail services.customers --parallel auto --noinput`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff format services/mail/attachments.py services/customers/views.py services/customers/serializers.py services/mail/tests/test_files_tab.py services/customers/tests/test_files_and_calls.py
venv/bin/ruff check --fix services/mail/attachments.py services/customers/views.py services/customers/serializers.py services/mail/tests/test_files_tab.py services/customers/tests/test_files_and_calls.py
git add services/mail/attachments.py services/customers/views.py services/customers/serializers.py services/mail/tests/test_files_tab.py services/customers/tests/test_files_and_calls.py
git commit -m "$(cat <<'EOF'
feat(customers): list filed mail's attachments on the files tab

An organisation's and an account's Files gain the non-inline attachments
of mail filed there, twice-filtered and merged newest first, in one more
query.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 14: The outbox's nightly prune, and the whole journey end to end

**Files:**
- Modify: `services/mail/prune.py` (new `prune_outbox`; imports)
- Modify: `services/customers/management/commands/run_health_maintenance.py` (after the digest prune, about line 420)
- Modify: `services/mail/tests/test_prune.py` (new class)
- Create: `e2e/test_gmail_actions_flow.py`

**Interfaces:**
- Consumes: everything before.
- Produces: `prune.prune_outbox(*, now=None, dry_run=False) -> int`, run nightly.

- [ ] **Step 1: Write the failing tests**

Append to `services/mail/tests/test_prune.py` (add `import uuid` at the top, `MailOutbox` to the `services.mail.models` import, and `gmail_message` to the `.gmail_fake` import):

```python
class OutboxPruneTests(GmailFixture):
    """Decision 23: failed rows go after MAIL_OUTBOX_ISSUE_DAYS, sent rows after
    MAIL_OUTBOX_SENT_RETENTION_HOURS, unless the message still shows a failed
    row's issue (plan gap 10). Pending rows are never pruned."""

    def setUp(self):
        super().setUp()
        self.now = timezone.now()
        mailbox = self.google(self.dana)
        self.mailbox = mailbox
        self.fresh_issue, _ = gmail_store.store_gmail(
            mailbox, fixture("message_full.json"), now=self.now
        )
        self.other, _ = gmail_store.store_gmail(mailbox, gmail_message("p2"), now=self.now)

    def row(self, message, label_key, status, **fields):
        return MailOutbox.objects.create(
            connection=self.mailbox,
            action_id=uuid.uuid4(),
            op="read",
            message=message,
            label_key=label_key,
            add=False,
            previous={"present": True},
            status=status,
            next_attempt_at=self.now,
            **fields,
        )

    def make(self):
        day, hour = timedelta(days=1), timedelta(hours=1)
        return {
            "old_failed": self.row(self.other, "UNREAD", "failed", failed_at=self.now - 8 * day),
            "fresh_failed": self.row(
                self.fresh_issue, "UNREAD", "failed", failed_at=self.now - 6 * day
            ),
            "sent_beside_an_issue": self.row(
                self.fresh_issue, "STARRED", "sent", sent_at=self.now - 25 * hour
            ),
            "old_sent": self.row(self.other, "STARRED", "sent", sent_at=self.now - 25 * hour),
            "new_sent": self.row(self.other, "INBOX", "sent", sent_at=self.now - hour),
            "pending": self.row(self.other, "TRASH", "pending"),
        }

    def test_what_nothing_reads_any_more_goes(self):
        rows = self.make()
        self.assertEqual(prune.prune_outbox(now=self.now, dry_run=True), 2)
        self.assertEqual(MailOutbox.objects.count(), 6)
        self.assertEqual(prune.prune_outbox(now=self.now), 2)
        kept = set(MailOutbox.objects.values_list("pk", flat=True))
        self.assertEqual(
            kept,
            {
                rows[name].pk
                for name in ("fresh_failed", "sent_beside_an_issue", "new_sent", "pending")
            },
        )

    def test_the_nightly_job_runs_it(self):
        self.make()
        out = io.StringIO()
        call_command("run_health_maintenance", "--dry-run", stdout=out)
        self.assertIn("would clear 2 old mail outbox row(s).", out.getvalue())
        self.assertEqual(MailOutbox.objects.count(), 6)
```

Create `e2e/test_gmail_actions_flow.py`:

```python
"""End-to-end tier for two-way Gmail delivery 2: a real server, real HTTP and
a real test database; Gmail is the in-memory FakeGmail, patched in this
process, which the live server shares.

Dana's Gmail is imported. In her conversations she makes a label, puts the
renewal conversation under it and archives it; it leaves her inbox at once,
and the loop sends both to Gmail, creating the label first. She opens the
quote's PDF, fetched from Gmail once. Carl, her manager, cannot open her
conversation, but reads the filed PDF from Pizza Hut's Files tab, audited.
Priya, who may open Pizza Hut but is outside Dana's chain, cannot."""

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
from services.customers.models import Customer
from services.identity.models import OrganizationDomain
from services.mail.loop import Loop
from services.mail.tests.gmail_fake import FakeGmail, fixture, gmail_message
from services.mail.tests.gmail_fixtures import google_connection

PDF = b"%PDF-1.4 renewal quote"
#: Made at import: no credential-looking literal in the code (CI's semgrep).
PASSWORD = secrets.token_urlsafe(18)


def download(url, token):
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, response.headers.get("Content-Type"), response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("Content-Type"), error.read()


class GmailActionsFlowTests(LiveServerTestCase):
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
        priya = make("priya@acme.io", "Priya", reports_to=alice)
        lead = Role.objects.create(
            organisation=org, name="Lead", slug="lead", permissions=[Capability.VIEW_ALL_ACCOUNTS]
        )
        User.objects.filter(pk__in=[carl.pk, dana.pk, priya.pk]).update(role=lead)
        pizza = Customer.objects.create(
            organisation=org, name="Pizza Hut", domain="pizzahut.com", owner=carl
        )
        google_connection(User.objects.get(pk=dana.pk))
        return pizza

    def test_full_flow(self):
        fake = FakeGmail("dana@acme.io")
        quote = fixture("message_full.json")  # from Ann at Pizza Hut, a PDF and an inline logo
        yesterday = timezone.now() - timedelta(days=1)
        quote["internalDate"] = str(int(yesterday.timestamp() * 1000))
        fake.add(quote, quietly=True)
        fake.add(
            gmail_message(
                "reply1",
                thread_id=quote["threadId"],
                labels=["SENT"],
                sender="Dana Ruiz <dana@acme.io>",
                to="ann@pizzahut.com",
                subject="Re: Renewal quote",
                sent_at=yesterday + timedelta(hours=1),
            ),
            quietly=True,
        )
        fake.attach_file(quote["id"], "1", PDF)
        with (
            patch("services.mail.providers.google.http_json", fake),
            patch(
                "services.customers.classification.get_completion",
                side_effect=CopilotNotConfigured("no model in tests"),
            ),
        ):
            self.flow(fake, quote)

    def flow(self, fake, quote):
        pizza = self.world()
        tokens = {who: self.login(f"{who}@acme.io") for who in ("dana", "carl", "priya")}

        # 1. The loop imports her mailbox: one conversation, two messages.
        Loop().run_once()
        status, page = http_get(self.api("/mail/threads/"), token=tokens["dana"])
        self.assertEqual(status, 200, page)
        [thread] = page["results"]
        self.assertEqual(
            (thread["thread_id"], thread["message_count"], thread["unread_count"]),
            (quote["threadId"], 2, 1),
        )
        anchor = thread["id"]

        # 2. A new label on the whole conversation, then Done: off her inbox at once.
        status, label = http_post(
            self.api("/mail/labels/"), {"name": "Pilot"}, token=tokens["dana"]
        )
        self.assertEqual((status, label["pending"]), (201, True))
        status, body = http_post(
            self.api("/mail/actions/"),
            {"op": "label_add", "label_id": label["id"], "thread_of": [anchor]},
            token=tokens["dana"],
        )
        self.assertEqual(body, {"op": "label_add", "messages": 2, "threads": 1, "unchanged": 0})
        status, body = http_patch(
            self.api(f"/mail/messages/{anchor}/thread/"), {"state": "done"}, token=tokens["dana"]
        )
        self.assertEqual(status, 200, body)
        status, page = http_get(self.api("/mail/threads/"), token=tokens["dana"])
        self.assertEqual(page["count"], 0)

        # 3. The loop sends both: the label is made in Gmail first, then applied.
        Loop().run_once()
        made = next(item for item in fake.labels if item["name"] == "Pilot")
        self.assertIn(made["id"], fake.messages[quote["id"]]["labelIds"])
        self.assertIn(made["id"], fake.messages["reply1"]["labelIds"])
        self.assertNotIn("INBOX", fake.messages[quote["id"]]["labelIds"])
        status, labels = http_get(self.api("/mail/labels/"), token=tokens["dana"])
        pilot = next(item for item in labels if item["name"] == "Pilot")
        self.assertEqual((pilot["gmail_id"], pilot["pending"]), (made["id"], False))

        # 4. She opens the quote's PDF: fetched from Gmail once, then cached.
        status, detail = http_get(self.api(f"/mail/messages/{anchor}/"), token=tokens["dana"])
        pdf = next(
            part for part in detail["attachments"] if part["filename"] == "Renewal quote.pdf"
        )
        self.assertEqual((pdf["available"], pdf["preview"]), (True, True))
        url = f"{self.live_server_url}{pdf['download_url']}"
        self.assertEqual(download(url, tokens["dana"]), (200, "application/pdf", PDF))
        self.assertEqual(download(url, tokens["dana"])[0], 200)
        fetches = [where for _, where, _ in fake.calls if "/attachments/" in where]
        self.assertEqual(len(fetches), 1)

        # 5. Carl, her manager: not her conversation, but the filed PDF, audited.
        status, _ = http_get(self.api(f"/mail/messages/{anchor}/thread/"), token=tokens["carl"])
        self.assertEqual(status, 404)
        status, files = http_get(self.api(f"/customers/{pizza.pk}/files/"), token=tokens["carl"])
        [row] = [item for item in files if item["source"] == "email"]
        self.assertEqual((row["id"], row["name"]), (pdf["id"], "Renewal quote.pdf"))
        self.assertEqual(download(url, tokens["carl"])[2], PDF)
        event = AuditEvent.objects.filter(
            action="mailbox.attachment_downloaded", actor__email="carl@acme.io"
        ).get()
        self.assertFalse(event.metadata["owner"])

        # 6. Priya may open Pizza Hut but is outside Dana's chain.
        self.assertEqual(download(url, tokens["priya"])[0], 404)
        status, files = http_get(self.api(f"/customers/{pizza.pk}/files/"), token=tokens["priya"])
        self.assertEqual([item for item in files if item["source"] == "email"], [])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_prune e2e.test_gmail_actions_flow --parallel auto --noinput`
Expected: the prune tests FAIL with `AttributeError: module 'services.mail.prune' has no attribute 'prune_outbox'`. The e2e flow should already pass (Tasks 1–13 built it); if it fails, the failure points at a real gap: fix it in the task's module, not the test.

- [ ] **Step 3: `prune_outbox`**

In `services/mail/prune.py`, extend the module docstring with a second paragraph: "The outbox keeps a failed row for MAIL_OUTBOX_ISSUE_DAYS (it is the message's sync_issue) and a sent row for MAIL_OUTBOX_SENT_RETENTION_HOURS, longer while its message still shows a failed row's issue; `prune_outbox` deletes the rest nightly. Not audited: these rows are the person's own working state, not a record anyone reads." Change the imports to:

```python
from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Exists, OuterRef
from django.utils import timezone

from core import audit

from .models import MailboxConnection, MailOutbox
```

and append:

```python
def prune_outbox(*, now=None, dry_run=False):
    """Delete outbox rows nothing reads any more (decision 23): failed ones
    past MAIL_OUTBOX_ISSUE_DAYS, sent ones past
    MAIL_OUTBOX_SENT_RETENTION_HOURS unless their message still shows a
    failed row's issue (plan gap 10). Returns how many it deleted, or would."""
    now = now or timezone.now()
    issue_since = now - timedelta(days=settings.MAIL_OUTBOX_ISSUE_DAYS)
    failed = MailOutbox.objects.filter(status=MailOutbox.Status.FAILED, failed_at__lt=issue_since)
    still_shown = MailOutbox.objects.filter(
        message=OuterRef("message"), status=MailOutbox.Status.FAILED, failed_at__gte=issue_since
    )
    sent = MailOutbox.objects.filter(
        status=MailOutbox.Status.SENT,
        sent_at__lt=now - timedelta(hours=settings.MAIL_OUTBOX_SENT_RETENTION_HOURS),
    ).exclude(Exists(still_shown))
    if dry_run:
        return failed.count() + sent.count()
    # SOC2:DATA-04 the outbox keeps nothing past its use
    return failed.delete()[0] + sent.delete()[0]
```

In `run_health_maintenance.py`, after the `prune_sent` block (the "old digest send(s)" message), add:

```python
        # The mail outbox's sent and failed rows once nothing reads them
        # (services.mail.prune.prune_outbox). SOC2:DATA-04
        from services.mail.prune import prune_outbox

        pruned = prune_outbox(now=timezone.now(), dry_run=options["dry_run"])
        self.stdout.write(
            self.style.SUCCESS(
                f"{'would clear' if options['dry_run'] else 'cleared'} {pruned} old mail outbox row(s)."
            )
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `venv/bin/python manage.py test services.mail e2e.test_gmail_actions_flow e2e.test_gmail_flow --parallel auto --noinput`
Expected: OK.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff format services/mail/prune.py services/customers/management/commands/run_health_maintenance.py services/mail/tests/test_prune.py e2e/test_gmail_actions_flow.py
venv/bin/ruff check --fix services/mail/prune.py services/customers/management/commands/run_health_maintenance.py services/mail/tests/test_prune.py e2e/test_gmail_actions_flow.py
git add services/mail/prune.py services/customers/management/commands/run_health_maintenance.py services/mail/tests/test_prune.py e2e/test_gmail_actions_flow.py
git commit -m "$(cat <<'EOF'
feat(mail): prune the outbox nightly, and the actions journey end to end

Failed rows go after 7 days and sent rows after a day unless their message
still shows an issue; the e2e flow labels, archives, sends, opens a PDF
and checks who else may read it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 15: Documents: API contracts, audit events, classification, product docs, SOC 2 map

**Files:**
- Modify: `docs/API_CONTRACTS.md` (the `mail` section from line 8462; the Files section from line 3228; the notification kinds sentence at line 4933)
- Modify: `docs/audit-events.md` (after the `mailbox.push_rejected` row)
- Modify: `docs/data-classification.md` (the `mail.MailMessage, mail.MailLabel, mail.MailAttachment` row)
- Modify: `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`
- Modify: `.soc2/CONTROL_MAP.md` (rows `AUTH-02`, `API-10`, `DATA-04`, `LOG-01`)

**Interfaces:**
- Consumes: the built behaviour, and contract §9's list.
- Produces: documents that describe D2 exactly. No code.

The outer fences below are `~~~~` because the text holds code blocks; copy what is between them.

- [ ] **Step 1: `docs/API_CONTRACTS.md`, the `mail` section**

Replace the paragraph that begins "A PATCH still changes `is_read`, `is_starred` and `state` here only (nothing is written back until delivery 2's outbox)" through "wins over the provider's flags." with:

~~~~markdown
**Two-way Gmail (delivery 2): the outbox.** For a two-way Google mailbox an
action changes the row at once (its `label_ids`, then everything they mean)
and writes one `mail.MailOutbox` row per label change; the sync loop sends
them to Gmail at the start of the mailbox's next tick (within 5 seconds: an
action wakes the mailbox). Read then unread sends nothing (a change back to
a pending row's previous value deletes it). While a row is pending or
sending, Gmail's own reports for that label on that message are skipped and
recorded as the row's previous value; once it is sent, Gmail is the truth
again. Calls: `messages.batchModify` per change set (≤ 1,000 ids; a batch
Gmail refuses with 400 or 404 is retried one message at a time),
`messages.trash`/`untrash` one by one (≤ 200 single calls a tick),
`labels.create` first. A 404 fails a row at once; a 5xx, no answer or
another refusal is retried after 30 s, 2 m, 10 m and 1 h and fails on the
fifth; rate limits and lost grants count nothing. A failed row is undone
here and the owner gets one `mail_action_failed` notification per action
and reason. Outlook and IMAP keep the old rule: a PATCH stamps
`locally_changed_at`, what the person did here wins over the provider's
flags, and nothing is written back.
~~~~

In `### GET /api/v1/mail/messages/`, replace the `folder` row and add a `label` row under it:

~~~~markdown
| `folder` | `inbox` (default), `all`, `drafts`, `sent`, `done`, `muted`, `spam`, `trash`, `starred`, `important` | Which list. `inbox` is `folder=inbox` **and** `state=open`; `all` is everything outside trash and spam (Gmail's All Mail); `done`/`muted` are the two triage states; `starred`/`important` are the flags across folders |
| `label` | a `MailLabel` id | Only messages carrying that user label of the caller's own mailbox (a label made here included); `400 {"label": ["Choose one of your labels."]}` otherwise |
~~~~

In the same section, change "labels ([{id, name, color: {background, text} | null}]," to "labels ([{id, name, color: {background, text} | null, pending}], `pending` true for a label made here that Gmail has not created yet,", add after "has_attachments (a non-inline file part)" the words ", sync_issue (below)", and change "(≤ 3 queries a list page, whatever its size; the detail ≤ 4)" to "(≤ 4 queries a list page, whatever its size; the detail ≤ 5)".

Replace the whole `### GET | PATCH /api/v1/mail/messages/<id>/` section with:

~~~~markdown
### `GET | PATCH /api/v1/mail/messages/<id>/`

GET adds `body`, `html_body` (sanitised; "" when none or too large, and the
text body is shown) and `attachments` ([{id, filename, mime_type, size,
is_inline, content_id, available, preview, download_url}], every file part,
inline ones included for `cid:`). `available`: the file is cached, or its
mailbox is Google, not disconnected and not paused. `preview`: it will be
served inline (an image or a PDF whose name and declared type agree).
`download_url`: `/api/v1/mail/attachments/<id>/download/`, null when not
available. Never `rfc_message_id`, `references` or raw label ids. 404 for
anyone but the owner, including their manager.

PATCH is partial, with at least one of:

| Field | Values | Gmail |
|---|---|---|
| `is_read` | bool | −/+ `UNREAD` |
| `is_starred` | bool | +/− `STARRED` |
| `state` | `open`, `done`, `muted` | `open` +`INBOX`; `done` −`INBOX`; `muted` none (Revenact's own) |
| `trashed` | bool | `messages.trash` / `untrash` |
| `spam` | bool | +`SPAM` −`INBOX` / the reverse |
| `add_labels`, `remove_labels` | ≤ 20 `MailLabel` ids each | ± that label |

Checks, in order, the first failing one answering:
1. Not the caller's message: 404.
2. The body: `400 {"non_field_errors": ["Change at least one thing."]}`;
   `["Change one of state, trashed or spam at a time."]`; `["A label can't be
   added and removed at once."]`; `{"add_labels": ["Name each label once."]}`;
   `{"add_labels": ["Choose one of your labels."]}` (a label that is not a
   user label of the caller's Gmail).
3. Outlook or IMAP with `trashed`, `spam` or a label field:
   `400 {"code": "GMAIL_ONLY", "detail": "Only Gmail mailboxes have this."}`.
4. Google, disconnected: `409 NO_MAILBOX` ("This message's mailbox is no longer connected.").
5. Google, paused: `409 MAILBOX_PAUSED` with `paused_reason`.
6. Google, read-only: `409 {"code": "TWO_WAY_OFF", "detail": "Reconnect Google to turn on two-way: changes here can't reach Gmail yet.", "needs_reconnect": true}`.

Checks 4 to 6 skip a mute alone. **200** with the detail, already showing the
new values. Outlook and IMAP: `is_read`, `is_starred` and `state` only, here
only, stamped `locally_changed_at`. ≤ 12 queries plus the detail's own.
~~~~

In `### POST /api/v1/mail/messages/<id>/reply/`, change "Marks the original read." to "Marks the original read (through the outbox for a two-way Google mailbox)."

Replace the whole `### GET /api/v1/mail/labels/` section with:

~~~~markdown
### `GET | POST /api/v1/mail/labels/`

GET: the caller's own live Google mailbox's user labels, by name, not
paginated: `[{"id", "gmail_id" (null while pending), "name", "color":
{"background", "text"} | null, "unread", "pending"}]`. `unread` counts unread
conversations carrying the label outside trash and spam (one query). `[]`
without one, for a disconnected one, and for Outlook and IMAP. ≤ 3 queries.

POST `{"name": "Vendors/Billing"}`: **201** with the label, `pending: true`.
It exists here at once, sits on messages as `pending:<id>` until Gmail makes
it, and is created in Gmail first thing in the next tick (a name Gmail
already has is adopted). Refusals: `400 {"name": ["Name the label."]}`,
`["Keep the name under 225 characters."]`, `["Gmail keeps that name for
itself."]` (INBOX SENT DRAFT DRAFTS SPAM TRASH UNREAD STARRED IMPORTANT
CHAT CATEGORY_*, any case); `400 GMAIL_ONLY`; `409 NO_MAILBOX` (none, or
disconnected), `409 MAILBOX_PAUSED`, `409 TWO_WAY_OFF`; `409 {"code":
"LABEL_EXISTS", "detail": "You already have a label called Renewals.",
"label_id": 7}`. If Gmail refuses the name, the label is removed again and
the owner is told: 'Couldn't create the label "X" in Gmail: Gmail refused
the name.' No rename, delete or colour (D2).
~~~~

Before `### Connecting a mailbox`, insert:

~~~~markdown
### `GET /api/v1/mail/threads/`

The person's mail as conversations, paginated like `mail/messages/`, with
the same parameters applied per message. A thread is in a view when any of
its messages matches; it is ordered and shown by its newest matching
message. Outlook threads group by `conversationId`; IMAP messages are each
their own thread.

```json
{"id": 9012, "thread_id": "18c2f0a9b1d4e7a3", "subject": "Re: Renewal terms",
 "snippet": "Works for us.", "last_sent_at": "2026-10-11T08:42:10Z",
 "message_count": 4, "unread_count": 1,
 "participants": [{"name": "Ann Lee", "address": "ann@pizzahut.com"}], "more_participants": 0,
 "is_read": false, "is_starred": true, "is_important": false, "priority": true,
 "state": "open", "folder": "inbox", "has_attachments": true,
 "labels": [{"id": 7, "name": "Renewals", "color": null, "pending": false}],
 "account": {"id": 2, "name": "Dough Co", "type": "customer"}, "sync_issue": null}
```

`id` is the newest matching message's (the handle for the routes below).
Counts and flags leave trash and spam out, except in the trash and spam
views. `participants`: distinct senders, oldest first, up to 3. `account`:
the newest filed message's record. ≤ 6 queries.

### `GET | PATCH /api/v1/mail/messages/<id>/thread/`

The conversation holding message `<id>`, owner-only (404 otherwise):
`{thread_id, subject (the oldest shown), labels, account, sync_issue,
truncated, messages}`, `messages` oldest first in the detail shape, trash and
spam included, at most `MAIL_THREAD_MAX_MESSAGES` (100, the newest;
`truncated` says so). ≤ 7 queries.

PATCH takes the message PATCH's body and checks and applies them to every
message Revenact holds in the thread (not ones older than the import).
Starring stars the newest message only; unstarring unstars them all. More
than `MAIL_ACTION_MAX_MESSAGES` (1,000) is `400 {"code": "TOO_MANY",
"detail": "Select fewer conversations: at most 1,000 messages at a time."}`.
**200** with the thread.

### `POST /api/v1/mail/actions/`

`{"op", "message_ids" | "thread_of", "label_id"?}`: one op on 1–1,000
messages, or on whole conversations (`thread_of` expands each id to its
thread; starring stars each thread's newest). Ops: `read unread star unstar
archive inbox trash untrash spam not_spam label_add label_remove mute
unmute`. **200** `{"op", "messages" (changed here), "threads", "unchanged"
(already so)}`. All or nothing: an id that is not the caller's is
`404 {"detail": "Not found."}`, naming none. Refusals: `{"op": ["Choose a
known action."]}`; `{"non_field_errors": ["Send message_ids or thread_of, not
both."]}`; `{"label_id": ["Choose one of your labels."]}`; `{"label_id":
["Only label actions take a label."]}`; `TOO_MANY` after expansion; then
checks 3 to 6 above. Outlook and IMAP take `read unread star unstar archive
inbox mute unmute`, here only. ≤ 12 queries, whatever the count.

### Failure notices

`sync_issue` on a message, a thread row and a thread: `{"text": "Couldn't
archive in Gmail: the message no longer exists.", "at"}` for the newest failed
change on it in the last 7 days, until another action is made on it; else
null. The verbs: mark as read, mark as unread, star, unstar, archive, move to
the Inbox, delete, restore, report spam, mark as not spam, label "X", remove
the label "X", create the label "X". The clauses: the message no longer
exists, the label no longer exists, Gmail refused the change, Gmail didn't
answer after several tries, Gmail refused the name.

Notification kind `mail_action_failed` ("Mail action failed"), to the mailbox
owner, `actor` null, one per action and reason: the sentence for one
conversation, "Couldn't archive 12 conversations in Gmail: …" for more;
`link` `/communications?source=mailbox:google&message=<id>` (the newest
affected message still held) or `/communications?source=mailbox:google`.

### `GET /api/v1/mail/attachments/<id>/download/`

The bytes of one file part, for its mailbox's owner, or, when its message is
filed, for whoever may open that record **and** read that email (the
twice-filter); 404 for anyone else. Throttled per user (`mail_attachment`,
`THROTTLE_MAIL_ATTACHMENT`, 120/min). On the first open it is fetched from
Gmail through the owner's mailbox (the message re-read for the current
attachment id) and cached under `MEDIA_ROOT`; afterwards it is served from
there. Served as the declared type only when the extension is an accepted
one, the declared type is one of its types and the leading bytes match;
otherwise `application/octet-stream`. `Content-Disposition: inline` only for
PNG, JPEG, GIF, WebP and PDF, and not with `?download=1`. Always
`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src
'none'; sandbox`, `Cache-Control: private, no-store`.

| Status | `code` | `detail` |
|---|---|---|
| 409 | `ATTACHMENT_UNAVAILABLE` | This file hasn't been fetched from Gmail yet, and its mailbox isn't connected. |
| 410 | `ATTACHMENT_GONE` | This file is no longer in Gmail. |
| 413 | `ATTACHMENT_TOO_LARGE` | This file is too large to open here. Open it in Gmail. (over `MAIL_ATTACHMENT_MAX_BYTES`, 50 MB) |
| 503 | `GMAIL_BUSY` | Gmail is busy. Try again in a minute. (with `Retry-After`) |

A lost grant on the fetch pauses the mailbox. Every download of a filed
message's file is audited `mailbox.attachment_downloaded`; unfiled mail is the
owner's own and is not.

### Outlook and IMAP in delivery 2

| | Google, two-way | Outlook / IMAP |
|---|---|---|
| read, star, done, open | here and in Gmail | here only (`locally_changed_at`) |
| trash, spam, labels | here and in Gmail | `400 GMAIL_ONLY` |
| mute | here only | here only |
| conversations | Gmail's threads | Graph's `conversationId`; IMAP one message each |
| `sync_issue` | the newest failed change | always null |
| attachments | fetched on first open | none listed |
~~~~

- [ ] **Step 2: `docs/API_CONTRACTS.md`, Files and notifications**

At the end of `### GET/POST /api/v1/customers/<id>/files/, .../accounts/<id>/files/` (after its JSON block), add:

~~~~markdown
**Filed mail's attachments (two-way Gmail delivery 2).** The list also
carries the non-inline attachments of mail filed on the organisation (and on
its accounts the caller may open), or on the account, each only when the
caller may also read that email (the mailbox chain): `source: "email"`, `id`
the mail attachment's id, `content_type` the declared type, `created_at` the
email's `sent_at`, `uploaded_by` null, `description` "", `download_url`
`/api/v1/mail/attachments/<id>/download/`, and `email: {"id", "subject",
"from"}`. Every row has `email` (null on uploads). Merged newest first. They
cannot be opened or deleted through `files/<id>/`, and they leave the list
when the person's copy of the message goes (deleted in Gmail, or pruned 30
days after a disconnect); the filed email stays. One more query, fixed.
~~~~

In the sentence at line 4933 that lists `Notification`'s kinds ("…and `task_overdue` and `task_escalated`, from Work's tracking;"), add "and `mail_action_failed`, from the mail outbox (see `mail`);" before "`message` holds up to 500 characters".

- [ ] **Step 3: `docs/audit-events.md`**

After the `mailbox.push_rejected` row, add:

~~~~markdown
| `mailbox.attachment_downloaded` | `services.mail.views.MailAttachmentDownloadView` | user | MailAttachment | email, attachment, content_type (declared), size, fetched (this request fetched it from Gmail), owner (the reader owns the mailbox); every download of a filed message's attachment, the owner's included; unfiled mail is not audited |
~~~~

- [ ] **Step 4: `docs/data-classification.md`**

In the `mail.MailMessage`, `mail.MailLabel`, `mail.MailAttachment` row, replace "`MailAttachment` holds file details only in D1 (`file` empty)." with:

~~~~markdown
`MailAttachment.file` is fetched from Gmail on first open and cached under `MEDIA_ROOT` (`mail_attachments/<org>/<random>`), read by the owner, or for filed mail under the twice-filter (record and mailbox chain, every read audited), and deleted with its row. `mail.MailOutbox` (pending changes back to Gmail, label names in `payload`) is owner-only and never served beyond `sync_issue`; sent rows are pruned after 24 hours and failed rows after 7 days.
~~~~

- [ ] **Step 5: The product docs**

`docs/product/01-prd.md`: after the "Two-way Gmail, delivery 1" status row, add

~~~~markdown
| Two-way Gmail, delivery 2: actions (backend) | Built | Read, star, done, delete, spam and labels go back to Gmail through an outbox that collapses, retries, undoes what Gmail refuses and tells the owner once; conversations; the label sidebar with unread counts and labels made here; bulk actions; attachments opened from Gmail and listed on the record's Files tab under the twice-filter. Outlook and IMAP stay local. Drafts and threaded sending (delivery 3) next |
~~~~

and at the end of the dated log: `| 2026-10-11 | Two-way Gmail delivery 2 (backend): the outbox and every Gmail write-back, conversations, labels with unread counts, bulk actions, attachment downloads and the Files tab's mail attachments |` (use the day the branch is finished if later).

`docs/product/02-trd.md`: after the `## Two-way Gmail (delivery 1): the sync engine` section, add

~~~~markdown
## Two-way Gmail (delivery 2): actions

- **The outbox.** `services/mail/outbox.py` turns an action into one `MailOutbox` row per (message, label) change in the request's transaction, with the messages and their pending rows locked. A change back to a pending row's `previous` deletes it; the row is changed at once (`label_ids`, then `gmail_store.derive`); the mailbox is woken on commit.
- **The skip rule.** `gmail_store.relabel(..., held=)`: a label with a pending or sending row keeps its local presence through history, the reconcile and a store, and the row's `previous` takes Gmail's value. Once sent, Gmail wins again.
- **The flush.** `services/mail/outbox_flush.py` is step 1 of every tick under the lease: label creations (the `pending:<id>` key rewritten to Gmail's id everywhere, a 409 adopting Gmail's label), `batchModify` per (add, remove) set with single `modify` when a batch is refused, then `trash`/`untrash` capped per tick. Rows are `sending` during a call, recovered after `MAIL_LEASE_SECONDS`; the claim is checked before every call.
- **Failures.** 404 fails at once; 5xx, no answer and other refusals count and wait 30 s, 2 m, 10 m, 1 h, failing on the fifth (a 5xx also backs the mailbox off); rate limits and lost grants count nothing. A failed row is reverted unless a newer action on the label stands; one `mail_action_failed` notice per action and reason.
- **Conversations.** `services/mail/threads.py`: the newest matching message per thread by a `RowNumber()` window (no DISTINCT over a join); fixed query counts.
- **Attachments.** `services/mail/attachments.py`: fetched on first open through the owner's mailbox, cached, typed only when name, declared type and bytes agree, inline only for images and PDFs, twice-filtered for filed mail and audited; deleted with the row.
- **Retention.** The nightly `run_health_maintenance` prunes sent outbox rows after 24 hours and failed ones after 7 days.
~~~~

`docs/product/05-backend-schema.md`: in the mail table, change the `MailAttachment` row's "`file` (empty until delivery 2)" to "`file` (fetched on first open, deleted with the row), `fetched_at`", add after the `MailMessage` row (and add "; a GIN index on `label_ids`" to that row)

~~~~markdown
| `MailOutbox` | One change on its way to Gmail: connection, `action_id` (one per request), `op`, `message` or (`label_create`) `label`, `label_key` (Gmail label id or `pending:<label id>`), `add`, `previous`, `payload`, status (pending, sending, sent, failed), `attempts`, `next_attempt_at`, `reason`, timestamps. One pending row per (message, label); one live `label_create` per label |
~~~~

and after the `## Two-way Gmail delivery 1: migrations` section, add

~~~~markdown
## Two-way Gmail delivery 2: migrations

| Migration | Change |
|---|---|
| `mail 0005_mail_outbox` | `MailOutbox` with its constraints and indexes; `MailAttachment.fetched_at` and its organisation path; `mail_msg_label_ids_gin` (`jsonb_path_ops`) |
| `notifications 0012_mail_action_failed` | The `mail_action_failed` kind |
~~~~

`docs/product/06-implementation-plan.md`: at the end, add

~~~~markdown
## Done: Two-way Gmail delivery 2, actions (2026-10-11, backend)

- The outbox: every Gmail action written back with collapse, the skip rule, batching, retries, revert and one notice per action; `sync_issue` on messages and threads.
- Conversations (`mail/threads/`, the thread route and its PATCH), bulk actions (`mail/actions/`), `folder=all` and `label=`, labels made here with unread counts.
- Attachments fetched on first open, sniffed and served safely, audited for filed mail, and listed on the record's Files tab under the twice-filter.
- Migrations `mail 0005`, `notifications 0012`. No operator step: the outbox runs inside `sync_mail --loop`.
- Next: delivery 3 (drafts both ways, threaded reply, reply all, forward, CC/BCC on send, attachments on send, the signature).
~~~~

- [ ] **Step 6: `.soc2/CONTROL_MAP.md`**

Append to the evidence text of each row (before its closing `|` cell for evidence):
- `AUTH-02`: "; D2: conversations, actions, the outbox and labels owner-only (`services/mail/actions.py:lockable`, `services/mail/threads.py`), filed mail's attachments under the twice-filter (`services/mail/attachments.py:readable`, `filed_rows`)".
- `API-10`: "; mail attachments `services/mail/attachments.py:served_type`/`response`: declared type only when extension, type and magic bytes agree, else octet-stream; inline only for images and PDFs; nosniff, sandboxed CSP, no-store; `MAIL_ATTACHMENT_MAX_BYTES` cap; per-user throttle `MailAttachmentThrottle`".
- `DATA-04`: "; the mail outbox's sent rows after 24 hours and failed rows after 7 days (`services/mail/prune.py:prune_outbox`); cached mail attachments deleted with their row".
- `LOG-01`: "; `mailbox.attachment_downloaded` for every read of a filed message's attachment".

- [ ] **Step 7: Check and commit**

Run: `venv/bin/ruff format --check docs/ && grep -n "written back until delivery 2\|No counts (D2)\|available\` is false until" docs/API_CONTRACTS.md`
Expected: ruff reports nothing to reformat (the docs' Python-free blocks are left alone), and `grep` prints nothing.

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md .soc2/CONTROL_MAP.md
git commit -m "$(cat <<'EOF'
docs: two-way gmail delivery 2 contracts, audit, classification and product docs

The outbox replaces "nothing is written back" for two-way Google; threads,
actions, labels, sync issues, attachments and the Files tab's mail rows;
the new audit event, retention and control evidence.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Final verification

**Files:** none changed, unless a check fails. A fix then goes in its own `fix(mail): ...` commit, with the trailer.

**Interfaces:**
- Consumes: the whole branch.
- Produces: evidence that the suite, migrations, lint and the CI semgrep rules are clean, and the local dev DB migrated.

- [ ] **Step 1: The whole suite, in parallel**

Run: `venv/bin/python manage.py test --parallel auto --noinput`
Expected: every test passes (OK, skips only where they were before). Never run it serially. If a test outside `services/mail` fails, read it before changing it; the likely ones assert a mail label's exact keys (now with `pending`), an attachment's `available: false`, or the Files list's query count. Fix each to the contract, never the contract to the test.

- [ ] **Step 2: The CI shard split still covers every test exactly once**

Run: `venv/bin/python scripts/ci_shard_labels.py --check 4`
Expected: exit 0.

- [ ] **Step 3: Migrations are complete**

Run: `venv/bin/python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 4: Lint and format**

Run: `venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: `All checks passed!` and nothing to reformat. If format reports files, run `venv/bin/ruff format <those files>` and commit them as `style(mail): ruff format` with the trailer.

- [ ] **Step 5: CI's semgrep rules, locally through Docker**

Run (Docker Desktop must be running; skip this step and say so if `docker info` fails):

```bash
docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep semgrep scan --error --metrics=off \
  --config p/security-audit --config p/secrets --config p/owasp-top-ten --config p/django \
  --exclude .claude --exclude venv --exclude '**/tests/**' --exclude '**/migrations/**' --exclude e2e
```

Expected: exit 0. The places most likely to draw a finding are the constant `UNREAD_BY_LABEL` SQL in `views.py` (one bound parameter; if flagged, add `# nosemgrep: <rule id>` on the `cursor.execute` line with the reason "constant SQL, one bound parameter", as `services/brain/locks.py` does) and the plan documents under `docs/` (no literal credentials: the e2e password is generated).

- [ ] **Step 6: The schema still builds**

Run: `venv/bin/python manage.py spectacular --file /private/tmp/claude-501/gmail-d2-schema.yml`
Expected: exit 0. Check that `/api/v1/mail/threads/`, `/api/v1/mail/actions/`, `/api/v1/mail/messages/{id}/thread/` and `/api/v1/mail/attachments/{id}/download/` appear in the file.

- [ ] **Step 7: Migrate the local dev database**

The owner approved this for the round. The database is shared with the other worktrees; these migrations are additive (one new table with its constraints and indexes, one nullable column, a GIN index, a choices change).

Run: `venv/bin/python manage.py migrate --noinput`
Expected: `Applying mail.0005_mail_outbox... OK` and `Applying notifications.0012_mail_action_failed... OK`.

Run: `venv/bin/python manage.py showmigrations mail notifications | tail -4`
Expected: `[X]` beside both.

- [ ] **Step 8: The branch is what it should be**

Run: `git status --short && git log --oneline 6265009..HEAD`
Expected:
- a clean tree (`venv` is excluded locally, `.env` ignored);
- one commit per task 1–15 (plus any fix or style commits), each ending with the `Co-Authored-By` trailer.

Nothing is pushed. Then use superpowers:finishing-a-development-branch to decide how to integrate.

---

## Self-review against the contract

| Contract | Where |
|---|---|
| Decision 1, §1 the model, constraints, indexes, `__str__` | Task 1 |
| Decision 2 collapse; §1 enqueueing steps 1–4, muted rules, wake (24) | Task 3 |
| Decision 3 skip rule in history, reconcile, `store_gmail`; pending keys kept | Task 4 |
| Decision 4 `sending`, lease recovery, the newer row; plan gap 7 | Tasks 5, 6 |
| Decisions 5, 6 retries, attempt classes, backoff, pause | Task 5 |
| Decision 7 batching, single fallback, trash cap | Task 5 |
| Decision 8 flush order; label rows wait for their label | Tasks 5, 7 |
| Decisions 9, 10 threads touched, star newest / unstar all | Tasks 9, 10, 11 |
| Decisions 11–13 paused, read-only, disconnected (and disconnect deletes live rows) | Tasks 7, 9 |
| Decision 14 Outlook/IMAP local and `GMAIL_ONLY` | Tasks 9, 11 |
| Decisions 15–17 thread list, thread route, anchors and counts | Task 10 |
| Decision 18 `folder=all`, `label=`, GIN index | Tasks 1, 8 |
| Decision 19 unread counts | Task 7 |
| Decisions 20, 21 label create, `pending:<id>`, 409 adoption, unwind | Task 7 |
| Decision 22 one notice per action and reason | Task 6 |
| Decision 23 `sync_issue`, pruning | Tasks 8, 14 |
| Decision 25 GET never marks read; the reply marks read through the outbox | Tasks 8, 9 |
| Decisions 26–28, 33 fetch, race, type and disposition, 50 MB, throttle | Task 12 |
| Decisions 29–31 twice-filter, Files tab rows, audit | Tasks 12, 13 |
| Decision 32 cached files deleted with their row | Task 1 |
| Decision 34 `TOO_MANY`, all-or-nothing 404 | Tasks 10, 11 |
| §7 privacy tests | Tasks 7–13 (each has its manager / view-all / admin case) |
| §8 query ceilings | Tasks 7, 8, 9, 10, 11, 13 |
| §9 migrations, settings, audit, documents | Tasks 1, 15 |
| §11 room for D3 | `MailOutbox.op` is open-ended and the flush dispatches by kind of row (Task 5) |
