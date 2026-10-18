# Two-way Gmail, delivery 1 ("sync engine"): backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Google mailbox in a workspace the portal has switched on syncs both ways from Gmail's change log: a 12-month import, labels, HTML, CC and BCC, and attachment details. Push is an optional wake-up. Disconnecting keeps the person's copies for 30 days. Outlook and IMAP keep today's behaviour.

**Architecture:**
- **Who may connect, and when a mailbox pauses.** `services/mail/gates.py` holds the four connect gates, the live and the bulk pause rules (`paused_reason`, `sweep`), and the 409 `MAILBOX_PAUSED` answer that every send path returns.
- **The Gmail calls.** `providers/google.py` gains a `GmailSession`, one per mailbox per tick. It refreshes the token once on a 401 and sorts failures by `ProviderError.status`, `.reason` and `.retry_after`.
- **Storing Gmail mail.** `services/mail/gmail_store.py` turns Gmail's labels into the folder and flags, stores a full message (with sanitised HTML from `services/mail/html.py`, `nh3`), and mirrors labels.
- **Syncing one mailbox.** `services/mail/gmail_sync.py` is one mailbox's tick: labels, history, reconcile, import, watch, and the error outcomes.
- **The loop.** `services/mail/loop.py` claims due mailboxes under a lease (`select_for_update(skip_locked=True)`) and runs the gate sweep. `sync_mail --loop` runs it forever.
- **Push.** `services/mail/push.py` verifies Pub/Sub's OIDC token with PyJWT and Google's JWKS, and sets `wake_at`.
- **The nightly prune.** `services/mail/prune.py` runs inside `run_health_maintenance`.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL (CI and prod 16, local 15), urllib through `providers/base.http_json` (no Google SDK), `nh3==0.3.7` (new), PyJWT 2.15.1 (pinned already) with `cryptography`, `core.audit`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-10-gmail-two-way-design.md` §1, §2, §4 (the Settings and portal parts), §5 "Deliveries 1". Read it at `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-fe/docs/superpowers/specs/2026-10-10-gmail-two-way-design.md`.

**The binding contract** is `docs/superpowers/plans/2026-10-10-gmail-sync-api.md` in this worktree (commit `2022a09`). Its "Decisions made in this contract" override the spec. Read it alongside this plan: every code, message, field, setting and audit event in it is implemented exactly as written. Where this plan names a contract section (§3, decision 18), that is the contract's numbering.

## Contract gaps and how this plan resolves them

The code forced each of these choices, and the contract does not state them. The plan implements the answer shown. The controller confirms or changes each one.

1. **Scopes confirmed (contract §1, "the backend plan's first task confirms").** Google's per-method tables, read 2026-10-10, list `https://www.googleapis.com/auth/gmail.modify` among the accepted scopes for all of these:
   - `users.history.list`, `users.labels.list`, `users.watch` and `users.getProfile`;
   - `users.settings.sendAs.list` (D3);
   - `users.messages.list` and `users.messages.get`.

   `getProfile` also accepts `gmail.compose`. Nothing needs another scope, so the plan does not stop.
2. **Outlook and IMAP backoff.** Under the contract's due rule, a legacy mailbox in `error` stays due, because a failed pass never moves `last_synced_at`. It would be retried every 5 s instead of every 600 s. After a failed legacy pass, the loop sets `backoff_until = now + MAIL_LEGACY_SYNC_INTERVAL_SECONDS`. The due rule already honours `backoff_until`.
3. **The reconcile window is anchored on `reconcile_started_at`, not on "now".** Gmail page tokens only work with the identical `q`, so every page lists `after:<reconcile_started_at − MAIL_RECONCILE_DAYS>`.
4. **The reconcile's final delete spares rows made after it began.** A row Revenact stored after the reconcile started (a message sent from Revenact, via `store_message`) has `refreshed_at` null. The delete therefore also requires `synced_at < reconcile_started_at`.
5. **A history event may leave out `labelIds`.** Gmail documents history messages as "typically" `id` and `threadId` only. A held message whose event has no `labelIds` is fetched with `format=minimal`.
6. **`exchange_code` no longer reads the profile.** Today it calls `getProfile` straight after the token exchange. If the person unticked every Gmail scope, that call fails with 403 before the scope check can refuse and revoke. The plan's order is: the exchange (which returns the granted scopes), then the scope check, then `getProfile`.
7. **The pause messages.** The contract gives only the `workspace_off` sentence. The other three are in `gates.PAUSED_MESSAGES` (Task 6).
8. **`GOOGLE_DENIED` is not audited.** Google's error redirect arrives before the signed state is checked, so there is no trusted user to record it against.
9. **Draft Send checks the pause first.** A `token_revoked` mailbox is in `status=error`, and today's Send answers `NO_MAILBOX` for that. The pause check runs before the status check, so the answer is `409 MAILBOX_PAUSED`, as the contract's send table says.
10. **Gate 2 reads the membership directly.** It checks for an `active` `OrganizationMembership` in `user.organisation`, with no `identity.context.active_membership`. That helper memoises on the user instance, and the bulk sweep must apply the same rule in a few queries.
11. **Connecting Outlook or IMAP over a different row replaces it.** Today `_save_connection` updates the user's row in place. It would keep a disconnected Google row's copies (or an old provider's) on the new connection. When the provider or address differs, or the row is disconnected, it is now deleted first, with `mailbox.disconnect`. This is the same rule as the Google callback.
12. **Other 403 reasons back off.** A `403` that is neither a rate limit nor `insufficientPermissions` (a domain policy, for example) backs off; it does not end the connection. The backoff ceiling (15 min) bounds the cost.
13. **The SOC 2 public-route list.** The OAuth callback is `AllowAny` today and is missing from `.soc2/config.yml: public_routes`. Task 15 adds it, and the push route too.
14. **`cryptography` is pinned.** PyJWT's RS256 verification needs it, and it was only a transitive dependency. Task 1 pins the version the venv resolves.
15. **The query ceilings.** No query-count test exists on `mail/messages/` today. Task 12 sets two ceilings: list ≤ 4 queries and detail ≤ 4, each the same for one row and for ten.
16. **"Recorded" fixtures.** No Google client has ever been configured, so nothing could be recorded. The fixtures in `services/mail/tests/fixtures/gmail/` are transcribed from the Gmail API reference shapes. Replace them with real responses at the first live check.
17. **A reconnect of a live connection restarts the import.** The contract's step 7 says so. Held ids are skipped, so it costs one list call per page.
18. **The local dev DB is migrated in the final task, as the owner asked.** That database is shared with the other worktrees. The four migrations are additive: new nullable or defaulted columns, two new tables and one partial unique index.

## Global Constraints

**Worktree and git:**
- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-be`, branch `feat/gmail-two-way`, based on `2022a09`.
- `venv` and `.env` are untracked (`.gitignore`). Never commit them.
- Always `git add <explicit paths>`. Never `git add -A` or `git add .`.
- **Never use `git stash`.**
- Do not push.

**One-time setup** (before Task 1, if `venv/` is missing):

```bash
cd /Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/gmail-be
cp ../agents3-be/.env .env
/opt/anaconda3/bin/python3.13 -m venv venv
venv/bin/pip install -r requirements-dev.txt
```

**Commands:**
- Tests: `venv/bin/python manage.py test <labels> --parallel auto --noinput`. Never run the whole suite serially.
- Migrations: `venv/bin/python manage.py makemigrations <app> --name <name>`. Tests build their own database.
- Lint: `venv/bin/ruff check .` and `venv/bin/ruff format --check .`. Ruff formats Python fences inside Markdown too, so keep every doc code block ruff-clean (line length 100).
- **Before every commit**, run `venv/bin/ruff format <the task's .py files>` and then `venv/bin/ruff check <the same files>`. Some test code in this plan is not wrapped at 100 columns, and some imports are not sorted; ruff fixes both. If ruff reports an unused import, delete it.

**Commit messages:** conventional (`feat(mail): ...`, `feat(platform): ...`, `docs: ...`). Each ends with exactly this line, after a blank line:

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

**Settings** (`config/settings.py`, from the environment, defaults verbatim from contract §8):

| Setting | Default |
|---|---|
| `MAIL_SYNC_TICK_SECONDS` | `5` |
| `MAIL_SYNC_INTERVAL_SECONDS` | `60` |
| `MAIL_LEGACY_SYNC_INTERVAL_SECONDS` | `600` |
| `MAIL_SYNC_BATCH` | `10` |
| `MAIL_LEASE_SECONDS` | `300` |
| `MAIL_BACKOFF_MAX_SECONDS` | `900` |
| `MAIL_IMPORT_MONTHS` | `12` |
| `MAIL_IMPORT_PAGE_SIZE` | `100` |
| `MAIL_RECONCILE_DAYS` | `30` |
| `MAIL_DISCONNECT_RETENTION_DAYS` | `30` |
| `MAIL_HTML_MAX_BYTES` | `1000000` |
| `GMAIL_PUBSUB_TOPIC` | `""` |
| `GMAIL_PUBSUB_AUDIENCE` | `""` |
| `GMAIL_PUBSUB_SERVICE_ACCOUNT` | `""` |
| `GMAIL_TEST_USER_CAP` | `100` |
| `THROTTLE_GMAIL_PUSH` | `600/min` (scope `gmail_push`, `None` under test) |

**Errors:**
- Mail errors use `{"code": "...", "detail": "..."}`.
- Portal errors use `{"success": false, "error": {"code", "message"}}`.
- Every message is copied from the contract word for word.

**Privacy:**
- The whole inbox is owner-only. Every mail read scopes on `owner=request.user` or on the caller's own connection.
- A manager, a view-all holder or an admin gets 404 on someone else's message and `[]` for their labels.
- Labels, cc/bcc, HTML and attachment details are never on `customers.Email` payloads.
- The portal sees counts only.

**No mail content in logs or `error`:**
- A log line names the connection id, an HTTP status and a reason code.
- A log line never carries a subject, a body, or an address other than the mailbox's own.
- A logged exception logs its class name or status only.
- `MailboxConnection.error` holds only the fixed sentences in `gmail_sync`.

**The engine never does a full save.** Every write to a `MailboxConnection` from the loop, the tick or the webhook uses `save(update_fields=[...])` or a queryset `update()`. A concurrent `wake_at` from push, or a `paused_reason` from the sweep, must never be overwritten.

**Postgres 16:** never a join de-duplicated with `.distinct()`. Use `id__in` subqueries.

**SOC 2:**
- Annotate each enforcement point:
  - `# SOC2:AUTH-02` (owner-only reads, gates);
  - `# SOC2:API-11` (webhook verification);
  - `# SOC2:LOG-01` (each `audit.record`);
  - `# SOC2:DATA-04` (the prune);
  - `# SOC2:SEC-07` (token revoke).
- Every `audit.record` follows contract §8's table exactly.

**Tests:**
- Use Django's runner and `rest_framework.test.APITestCase`.
- Mail tests build on `services/mail/tests/test_mail.Fixture` through `services/mail/tests/gmail_fixtures.GmailFixture` (Task 1). That fixture already patches the classifier's model call (`CopilotNotConfigured`).
- Every test that reaches Google patches `services.mail.providers.google.http_json` with `services/mail/tests/gmail_fake.FakeGmail` (Task 3), or with a side effect. **No test touches the network.**
- No literal real credential: tokens are `fake-*` strings.

**Outlook and IMAP are unchanged.** Contract §9 lists every place they appear with the new fields. Their sync, connect (apart from gap 11) and disconnect behave as today.

**Docs in the same PR (Task 15):**
- `docs/API_CONTRACTS.md` (follow the `api-contracts` skill);
- `docs/audit-events.md`, `docs/data-classification.md`;
- `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md` and `06-implementation-plan.md`;
- `.soc2/CONTROL_MAP.md` and `.soc2/config.yml`.

**Out of scope (contract §11):**
- the outbox and every write-back;
- threads, the label sidebar, `?label=` and label counts;
- attachment downloads;
- drafts both ways and sending changes;
- any Outlook or IMAP change;
- calendar;
- the frontend.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `requirements.txt` | modify | pin `nh3==0.3.7` and `cryptography` |
| `config/settings.py`, `.env.example` | modify | the 16 settings above |
| `services/accounts/models.py`, `migrations/0015_organisation_gmail_two_way.py` | modify / create | `Organisation.gmail_two_way_enabled` |
| `services/mail/scopes.py` | create | the scope URLs, `short_names`, `is_two_way` |
| `services/mail/models.py`, `migrations/0004_gmail_two_way.py` | modify / create | new connection and message fields, `MailLabel`, `MailAttachment` |
| `services/platform/views.py`, `urls.py` | modify | `POST organisations/<id>/gmail/`, the `gmail` blocks |
| `services/mail/providers/base.py` | modify | `ProviderError.status/.reason/.retry_after`; `Message` and `Credentials` gain fields |
| `services/mail/providers/google.py` | modify | new scopes, narrowed `_fresh`, `GmailSession`, `revoke`, parser changes; `fetch_messages` removed |
| `services/mail/html.py` | create | `sanitise` (nh3 policy) |
| `services/mail/sync.py` | modify | filing uses To + Cc; `sync_mailbox` hands Google to the tick |
| `services/mail/gmail_store.py` | create | `derive`, `relabel`, `store_gmail`, `mirror_labels` |
| `services/mail/gates.py` | create | connect gates, pause rules, `sweep`, `live_mailbox`, `paused_response` |
| `services/mail/views.py` | modify | gates before OAuth, the Google callback, my mailbox, Sync now, labels, push |
| `services/customers/communications_views.py`, `drafts_views.py` | modify | `MAILBOX_PAUSED` on reply and draft send; `live_mailbox` |
| `services/mail/gmail_sync.py` | create | one mailbox's tick, recovery, error outcomes |
| `services/mail/loop.py` | create | the claim, legacy cadence, `run_all`, `Loop` |
| `services/mail/management/commands/sync_mail.py` | modify | `--loop` |
| `services/mail/serializers.py` | modify | the connection payload, labels, cc/bcc, attachments, HTML |
| `services/mail/push.py` | create | OIDC verification and the wake-up |
| `core/throttling.py` | modify | `GmailPushThrottle` |
| `services/mail/urls.py` | modify | `mail/labels/`, `mail/google/push/` |
| `services/mail/prune.py` | create | the 30-day prune |
| `services/customers/management/commands/run_health_maintenance.py` | modify | runs the prune |
| `services/mail/tests/gmail_fixtures.py`, `gmail_fake.py`, `fixtures/gmail/*.json` | create | the Google world for tests |
| `services/mail/tests/test_*.py`, `services/platform/tests/test_platform.py`, `e2e/test_gmail_flow.py` | create / modify | tests |
| docs (see Global Constraints) | modify | same-PR docs |
| `../../revenact-infra/deploy/docker-compose.prod.yml`, `deploy.sh`, `README.md` | modify (separate repo) | `sync_mail --loop` + `ticketsync` |

Task order:
- storage (1), the portal switch (2);
- the Gmail layer (3–5), the gates (6), the connect flow (7);
- the engine (8–10), the read side (11–12), push (13), the prune and the e2e flow (14);
- docs and infra (15), verification (16).

Each task builds on the ones before it.

---
### Task 1: Storage, settings and the workspace switch's column

**Files:**
- Modify: `requirements.txt` (after `jsonschema-specifications==2025.9.1`)
- Modify: `config/settings.py` (after `MAIL_OAUTH_REDIRECT_BASE`, line 523)
- Modify: `.env.example` (after `# MAIL_OAUTH_REDIRECT_BASE=http://localhost:8000`, line 100)
- Modify: `services/accounts/models.py:104` (after `ai_agent_enabled`)
- Create: `services/accounts/migrations/0015_organisation_gmail_two_way.py` (generated)
- Create: `services/mail/scopes.py`
- Modify: `services/mail/models.py` (whole `MailboxConnection` field block and Meta; `MailMessage` fields; two new models)
- Create: `services/mail/migrations/0004_gmail_two_way.py` (generated)
- Create: `services/mail/tests/gmail_fixtures.py`
- Test: `services/mail/tests/test_storage.py`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `services.mail.scopes`:
    - `GMAIL`, `MODIFY`, `SEND`, `COMPOSE`: full scope URLs;
    - `TWO_WAY: tuple[str, str, str]`;
    - `REQUESTED: tuple[str, ...]`;
    - `short_names(scopes) -> list[str]`;
    - `is_two_way(scopes) -> bool`.
  - `MailboxConnection` changes:
    - `Status.DISCONNECTED`;
    - `PausedReason` (`NO_SEAT`, `SUSPENDED`, `WORKSPACE_OFF`, `TOKEN_REVOKED`);
    - fields `granted_scopes`, `history_id`, `import_after`, `import_before`, `import_page_token`, `import_total_estimate`, `import_done_at`, `reconcile_started_at`, `reconcile_page_token`, `watch_expires_at`, `wake_at`, `lease_until`, `backoff_until`, `consecutive_failures`, `paused_reason` and `disconnected_at`;
    - properties `is_google` and `two_way`.
  - `MailMessage` fields: `html_body`, `cc`, `bcc`, `rfc_message_id`, `references`, `label_ids`, `has_attachments` and `refreshed_at`.
  - New models:
    - `MailLabel(connection, gmail_id, name, type, color_background, color_text, synced_at)`, with `MailLabel.Type.SYSTEM` / `USER`;
    - `MailAttachment(message, part_id, gmail_attachment_id, filename, mime_type, size, content_id, is_inline, file)`.
  - `Organisation.gmail_two_way_enabled: bool` (default `False`).
  - `services.mail.tests.gmail_fixtures`:
    - `GRANTED: list[str]`;
    - `CREDENTIALS: dict`;
    - `google_connection(user, address=None, **fields) -> MailboxConnection`;
    - `GmailFixture` (a `Fixture` with the workspace on and `acme.io` verified), with `google(user, address=None, **fields)`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/gmail_fixtures.py`:

```python
"""Google mailboxes for the Gmail tests, on test_mail.Fixture's world (Dana
reports to Carl, Carl to Alice; Pizza Hut is pizzahut.com). The workspace
is switched on for Gmail and acme.io is verified. Credentials are fake
values; every test that reaches Google patches it (gmail_fake.FakeGmail)."""

from services.identity.models import OrganizationDomain
from services.mail import scopes
from services.mail.models import MailboxConnection

from .test_mail import Fixture

#: What Google grants when every box on the consent screen is left ticked.
GRANTED = [
    *scopes.TWO_WAY,
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]
CREDENTIALS = {"access_token": "fake-access", "refresh_token": "fake-refresh", "expires_at": 9e12}


def google_connection(user, address=None, **fields):
    """`user`'s Google mailbox, two-way and connected; `fields` override."""
    values = {
        "organisation": user.organisation,
        "provider": MailboxConnection.Provider.GOOGLE,
        "address": address or user.email,
        "display_name": user.name,
        "credentials": "",
        "granted_scopes": list(GRANTED),
    }
    values.update(fields)
    connection = MailboxConnection.objects.create(user=user, **values)
    connection.set_credentials(dict(CREDENTIALS))
    connection.save(update_fields=["credentials"])
    return connection


class GmailFixture(Fixture):
    def setUp(self):
        super().setUp()
        self.org.gmail_two_way_enabled = True
        self.org.save(update_fields=["gmail_two_way_enabled"])
        OrganizationDomain.objects.create(
            organisation=self.org,
            domain="acme.io",
            verification_status=OrganizationDomain.VerificationStatus.VERIFIED,
        )

    def google(self, user, address=None, **fields):
        return google_connection(user, address, **fields)
```

Create `services/mail/tests/test_storage.py`:

```python
"""Two-way Gmail storage: the new connection state, one live connection per
Google address, labels and attachment details, and the workspace switch's
default."""

from django.db import IntegrityError, transaction

from services.accounts.models import Organisation
from services.mail import scopes
from services.mail.models import MailAttachment, MailboxConnection, MailLabel, MailMessage

from .gmail_fixtures import GmailFixture
from .test_mail import NOW


class ConnectionStateTests(GmailFixture):
    def test_a_new_connection_starts_with_nothing_to_resume(self):
        imap = self.connect(self.carl)
        self.assertEqual(
            (imap.granted_scopes, imap.paused_reason, imap.consecutive_failures), ([], "", 0)
        )
        self.assertIsNone(imap.history_id)
        self.assertFalse(imap.two_way)
        self.assertFalse(imap.is_google)

    def test_two_way_needs_all_three_gmail_scopes(self):
        full = self.google(self.dana)
        self.assertTrue(full.two_way)
        full.granted_scopes = [scopes.MODIFY, scopes.SEND]
        self.assertFalse(full.two_way)
        self.assertEqual(
            scopes.short_names([scopes.MODIFY, "openid", scopes.SEND]),
            ["gmail.modify", "gmail.send"],
        )

    def test_one_live_google_connection_per_address(self):
        dana = self.google(self.dana, "shared@acme.io")
        with transaction.atomic(), self.assertRaises(IntegrityError):
            self.google(self.carl, "shared@acme.io")
        dana.status = MailboxConnection.Status.DISCONNECTED
        dana.save(update_fields=["status"])
        self.assertEqual(self.google(self.carl, "shared@acme.io").address, "shared@acme.io")

    def test_the_workspace_switch_starts_off(self):
        self.assertFalse(Organisation.objects.create(name="New Co").gmail_two_way_enabled)


class LabelAndAttachmentTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.connection = self.google(self.dana)
        self.message = MailMessage.objects.create(
            connection=self.connection,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="g1",
            direction="received",
            subject="Hi",
            sent_at=NOW,
        )

    def test_a_gmail_label_is_held_once_per_mailbox(self):
        MailLabel.objects.create(
            connection=self.connection, gmail_id="Label_1", name="Renewals", type="user"
        )
        with transaction.atomic(), self.assertRaises(IntegrityError):
            MailLabel.objects.create(
                connection=self.connection, gmail_id="Label_1", name="Again", type="user"
            )
        # A label made here (D2) has no Gmail id yet; several may wait at once.
        MailLabel.objects.create(connection=self.connection, gmail_id="", name="A", type="user")
        MailLabel.objects.create(connection=self.connection, gmail_id="", name="B", type="user")

    def test_an_attachment_part_is_held_once_and_new_message_fields_start_empty(self):
        MailAttachment.objects.create(
            message=self.message,
            part_id="1",
            filename="q.pdf",
            mime_type="application/pdf",
            size=10,
        )
        with transaction.atomic(), self.assertRaises(IntegrityError):
            MailAttachment.objects.create(
                message=self.message, part_id="1", filename="x.pdf", mime_type="x", size=1
            )
        m = self.message
        self.assertEqual(
            (m.cc, m.bcc, m.label_ids, m.html_body, m.has_attachments, m.refreshed_at),
            ([], [], [], "", False, None),
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_storage --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'scopes' from 'services.mail'`.

- [ ] **Step 3: Pin the dependencies**

Install and read the resolved `cryptography` version:

```bash
venv/bin/pip install nh3==0.3.7
venv/bin/pip show cryptography | grep '^Version'
```

In `requirements.txt`, keep the alphabetical order:
- add `cryptography==<the version shown>` between `channels-redis==4.3.0` and `daphne==4.2.3`;
- add `nh3==0.3.7` between `jsonschema-specifications==2025.9.1` and `psycopg==3.3.6`.

- [ ] **Step 4: Add the settings**

In `config/settings.py`, after the `MAIL_OAUTH_REDIRECT_BASE = ...` line, add:

```python
# --- Two-way Gmail (services.mail; contract docs/superpowers/plans/2026-10-10-gmail-sync-api.md)
# `sync_mail --loop` ticks every MAIL_SYNC_TICK_SECONDS. A Google mailbox is due every
# MAIL_SYNC_INTERVAL_SECONDS or on a push; Outlook and IMAP every
# MAIL_LEGACY_SYNC_INTERVAL_SECONDS (today's cadence).
MAIL_SYNC_TICK_SECONDS = env.int("MAIL_SYNC_TICK_SECONDS", default=5)
MAIL_SYNC_INTERVAL_SECONDS = env.int("MAIL_SYNC_INTERVAL_SECONDS", default=60)
MAIL_LEGACY_SYNC_INTERVAL_SECONDS = env.int("MAIL_LEGACY_SYNC_INTERVAL_SECONDS", default=600)
MAIL_SYNC_BATCH = env.int("MAIL_SYNC_BATCH", default=10)
MAIL_LEASE_SECONDS = env.int("MAIL_LEASE_SECONDS", default=300)
MAIL_BACKOFF_MAX_SECONDS = env.int("MAIL_BACKOFF_MAX_SECONDS", default=900)
MAIL_IMPORT_MONTHS = env.int("MAIL_IMPORT_MONTHS", default=12)
MAIL_IMPORT_PAGE_SIZE = env.int("MAIL_IMPORT_PAGE_SIZE", default=100)
MAIL_RECONCILE_DAYS = env.int("MAIL_RECONCILE_DAYS", default=30)
# Personal copies kept after a Google disconnect, then pruned nightly. SOC2:DATA-04
MAIL_DISCONNECT_RETENTION_DAYS = env.int("MAIL_DISCONNECT_RETENTION_DAYS", default=30)
MAIL_HTML_MAX_BYTES = env.int("MAIL_HTML_MAX_BYTES", default=1_000_000)
# Pub/Sub push (optional). Empty topic: push off, the 60-second check alone.
# With a topic, an empty audience or service account fails every push closed (401).
GMAIL_PUBSUB_TOPIC = env("GMAIL_PUBSUB_TOPIC", default="")
GMAIL_PUBSUB_AUDIENCE = env("GMAIL_PUBSUB_AUDIENCE", default="")
GMAIL_PUBSUB_SERVICE_ACCOUNT = env("GMAIL_PUBSUB_SERVICE_ACCOUNT", default="")
# Google's limit on test users while the app is unverified; shown in the portal.
GMAIL_TEST_USER_CAP = env.int("GMAIL_TEST_USER_CAP", default=100)
# Per source IP on the public push webhook.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["gmail_push"] = (
    None if TESTING else env("THROTTLE_GMAIL_PUSH", default="600/min")
)
```

In `.env.example`, after `# MAIL_OAUTH_REDIRECT_BASE=http://localhost:8000`, add:

```
# Two-way Gmail. Only a workspace the platform portal has switched on may
# connect Google. Optional push: a Pub/Sub topic Gmail publishes to, and the
# push subscription's OIDC audience and service account.
# GMAIL_PUBSUB_TOPIC=projects/<project>/topics/<topic>
# GMAIL_PUBSUB_AUDIENCE=https://<public host>/api/v1/mail/google/push/
# GMAIL_PUBSUB_SERVICE_ACCOUNT=<name>@<project>.iam.gserviceaccount.com
# MAIL_SYNC_INTERVAL_SECONDS=60
# MAIL_IMPORT_MONTHS=12
# MAIL_DISCONNECT_RETENTION_DAYS=30
```

- [ ] **Step 5: The workspace switch's column**

In `services/accounts/models.py`, after `ai_agent_enabled = models.BooleanField(default=True)`, add:

```python
    #: Two-way Gmail for this workspace (the pilot approval). Platform staff
    #: set it (POST /api/v1/platform/organisations/<id>/gmail/); it is not on
    #: the tenant's settings serializer, so a tenant can neither read nor
    #: change it. Off pauses every Google mailbox in the workspace.
    gmail_two_way_enabled = models.BooleanField(default=False)
```

Run: `venv/bin/python manage.py makemigrations accounts --name organisation_gmail_two_way`
Expected: `services/accounts/migrations/0015_organisation_gmail_two_way.py` with one `AddField`.

- [ ] **Step 6: The scopes module**

Create `services/mail/scopes.py`:

```python
"""The Google scopes Revenact asks for, and what they allow.

`gmail.modify` reads and changes mail but cannot delete it permanently
(no `https://mail.google.com/`); with `gmail.send` and `gmail.compose` it is
everything two-way Gmail needs. Google's per-method tables (checked
2026-10-10) accept gmail.modify for history.list, labels.list, watch,
getProfile, messages.list/get and settings.sendAs.list.
"""

GMAIL = "https://www.googleapis.com/auth/gmail."
MODIFY = GMAIL + "modify"
SEND = GMAIL + "send"
COMPOSE = GMAIL + "compose"
#: All three, or the connection is refused (contract decision 7).
TWO_WAY = (MODIFY, SEND, COMPOSE)
#: What the consent screen asks for.
REQUESTED = (*TWO_WAY, "openid", "email", "profile")


def short_names(scopes):
    """The Gmail scopes among `scopes`, by short name ('gmail.modify'), in order."""
    return [scope.rsplit("/", 1)[-1] for scope in scopes or [] if scope.startswith(GMAIL)]


def is_two_way(scopes):
    return set(TWO_WAY) <= set(scopes or [])
```

- [ ] **Step 7: The mail models**

In `services/mail/models.py`:

Change the imports to:

```python
from django.conf import settings
from django.db import models
from django.db.models import Q

from services.accounts.models import Organisation

from . import crypto, scopes
```

Replace `class Status` in `MailboxConnection` with:

```python
class Status(models.TextChoices):
    CONNECTED = "connected", "Connected"
    ERROR = "error", "Needs attention"
    #: Google only: disconnected, credentials wiped, the person's copies kept
    #: for MAIL_DISCONNECT_RETENTION_DAYS (contract decision 9).
    DISCONNECTED = "disconnected", "Disconnected"


class PausedReason(models.TextChoices):
    """Why a Google mailbox is not synced or used, in precedence order
    (contract decision 23). Blank: not paused."""

    TOKEN_REVOKED = "token_revoked", "Google access revoked"
    WORKSPACE_OFF = "workspace_off", "Workspace not enabled"
    SUSPENDED = "suspended", "Member suspended"
    NO_SEAT = "no_seat", "No seat"
```

After `last_synced_at`, before `created_at`, add:

```python
    # --- Two-way Gmail (Google only; Outlook and IMAP leave these empty) ---
    #: Full scope URLs Google granted. [] for connections made before D1.
    granted_scopes = models.JSONField(default=list, blank=True)
    #: Gmail's last applied historyId. Null: initialise on the next tick.
    history_id = models.PositiveBigIntegerField(null=True, blank=True)
    #: The import's two bounds; page tokens need the identical query.
    import_after = models.DateTimeField(null=True, blank=True)
    import_before = models.DateTimeField(null=True, blank=True)
    import_page_token = models.CharField(max_length=512, blank=True)
    #: users.getProfile.messagesTotal at connect: the whole mailbox, not the window.
    import_total_estimate = models.PositiveIntegerField(null=True, blank=True)
    import_done_at = models.DateTimeField(null=True, blank=True)
    #: A 30-day re-list is running (history too old, or a reconnect).
    reconcile_started_at = models.DateTimeField(null=True, blank=True)
    reconcile_page_token = models.CharField(max_length=512, blank=True)
    watch_expires_at = models.DateTimeField(null=True, blank=True)
    #: Set by push, Sync now and connect; cleared when the loop claims the row.
    wake_at = models.DateTimeField(null=True, blank=True)
    #: The loop's claim (decision 18).
    lease_until = models.DateTimeField(null=True, blank=True)
    backoff_until = models.DateTimeField(null=True, blank=True)
    consecutive_failures = models.PositiveSmallIntegerField(default=0)
    paused_reason = models.CharField(max_length=16, choices=PausedReason.choices, blank=True)
    disconnected_at = models.DateTimeField(null=True, blank=True)
```

After `updated_at`, add:

```python
    class Meta:
        constraints = [
            # The push webhook finds a mailbox by address (decision 6).
            models.UniqueConstraint(
                fields=["provider", "address"],
                condition=Q(provider="google") & ~Q(status="disconnected"),
                name="one_live_google_connection_per_address",
            )
        ]
        indexes = [models.Index(fields=["provider", "status", "wake_at"], name="mail_conn_due_idx")]
```

After `__str__`, add:

```python
@property
def is_google(self):
    return self.provider == self.Provider.GOOGLE


@property
def two_way(self):
    """Google, and every one of the three Gmail scopes granted."""
    return self.is_google and scopes.is_two_way(self.granted_scopes)
```

In `MailMessage`'s docstring, replace the sentences from "`folder`, `is_read`, `is_starred` and `is_important` come from the provider at sync;" up to the end of "a star here is a star *here*." with:

```
    `folder`, `is_read`, `is_starred` and `is_important` come from the
    provider. For Gmail they are derived from `label_ids` at every store and
    label change (services/mail/gmail_store.py), and Gmail is the truth: a
    change made here lasts until Gmail next reports one (D1 writes nothing
    back). Outlook and IMAP keep `locally_changed_at`: what the person did
    here wins.
```

In the same docstring, replace "It belongs to the connection and dies with it: disconnecting a mailbox takes the personal copy away, while" with "It belongs to the connection and dies with it: disconnecting Outlook or IMAP takes the personal copy away at once, and a Google disconnect keeps it for MAIL_DISCONNECT_RETENTION_DAYS (services/mail/prune.py), while" (rewrap the lines at 79 characters).

In `MailMessage`, after `to = ...`, add:

```python
    #: Gmail rows from D1 on split Cc and Bcc out of `to`; every other row keeps
    #: To + Cc merged in `to` and leaves these empty.
    cc = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
    bcc = models.JSONField(default=list, blank=True, help_text="[[name, address], ...]")
```

after `body = ...`, add:

```python
    #: Sanitised once at store (services/mail/html.py); "" when none, or too large.
    html_body = models.TextField(blank=True)
    #: The Message-ID header verbatim; blank rather than truncated when longer.
    rfc_message_id = models.CharField(max_length=998, blank=True)
    references = models.TextField(blank=True)
    #: Gmail's label ids, all of them. Folder and flags are derived from these.
    label_ids = models.JSONField(default=list, blank=True)
    #: At least one non-inline attachment part.
    has_attachments = models.BooleanField(default=False)
    #: Every store or label refresh from Gmail; the reconcile finds deletions by it.
    refreshed_at = models.DateTimeField(null=True, blank=True)
```

At the end of the file, add:

```python
class MailLabel(models.Model):
    """A Gmail label, mirrored from labels.list on every Google tick. Read by
    its mailbox's owner only. `gmail_id` is blank only for a label made in
    Revenact that the outbox has not created in Gmail yet (D2)."""

    class Type(models.TextChoices):
        SYSTEM = "system", "System"
        USER = "user", "User"

    connection = models.ForeignKey(
        MailboxConnection, related_name="labels", on_delete=models.CASCADE
    )
    gmail_id = models.CharField(max_length=255, blank=True)
    name = models.CharField(max_length=225, help_text="Gmail's full name, '/' nesting included.")
    type = models.CharField(max_length=8, choices=Type.choices)
    color_background = models.CharField(max_length=7, blank=True)
    color_text = models.CharField(max_length=7, blank=True)
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["connection", "gmail_id"],
                condition=~Q(gmail_id=""),
                name="mail_label_once_per_mailbox",
            )
        ]

    def __str__(self):
        return f"label {self.pk}"


class MailAttachment(models.Model):
    """One file part of a Gmail message: details only in D1. `file` stays
    empty until D2 fetches it on first open. Gmail rotates attachment ids
    between fetches, so `part_id` is what D2 matches on. Owner-only."""

    message = models.ForeignKey(MailMessage, related_name="attachments", on_delete=models.CASCADE)
    part_id = models.CharField(max_length=64)
    gmail_attachment_id = models.TextField(blank=True)
    filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=255)
    size = models.PositiveBigIntegerField()
    content_id = models.CharField(max_length=255, blank=True)
    is_inline = models.BooleanField(default=False)
    file = models.FileField(upload_to="mail_attachments/", blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["message", "part_id"], name="mail_attachment_part_once")
        ]

    def __str__(self):
        return f"attachment {self.pk}"
```

Run: `venv/bin/python manage.py makemigrations mail --name gmail_two_way`
Expected: `services/mail/migrations/0004_gmail_two_way.py`, containing:
- `AlterField status`, and `AddField` for the 16 connection fields;
- `AddField` for the 8 message fields;
- `CreateModel MailLabel` and `CreateModel MailAttachment`;
- `AddIndex mail_conn_due_idx`, `AddConstraint one_live_google_connection_per_address`.

Existing rows get the defaults (`granted_scopes=[]`, null sync fields), as contract §4 says.

- [ ] **Step 8: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail.tests.test_storage services.mail.tests.test_mail --parallel auto --noinput`
Expected: all PASS.

Run: `venv/bin/python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 9: Commit**

```bash
git add requirements.txt config/settings.py .env.example services/accounts/models.py \
  services/accounts/migrations/0015_organisation_gmail_two_way.py services/mail/scopes.py \
  services/mail/models.py services/mail/migrations/0004_gmail_two_way.py \
  services/mail/tests/gmail_fixtures.py services/mail/tests/test_storage.py
git commit -m "$(cat <<'EOF'
feat(mail): store two-way gmail state, labels and attachment details

The workspace switch, the connection's sync and pause state, the message's
html, cc/bcc and label ids, MailLabel and MailAttachment, the D1 settings,
and nh3 and cryptography pinned.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 2: The portal switch and the `gmail` blocks

**Files:**
- Modify: `services/platform/views.py` (module docstring; imports; `_summary` at :51; `OverviewView.get` at :83; `OrganisationListView.post` at :162 and `.get` at :167; `OrganisationDetailView.get` at :248; a new view after `OrganisationStatusView`)
- Modify: `services/platform/urls.py`
- Test: `services/platform/tests/test_platform.py` (`DETAIL_KEYS` at :22; a new class at the end)

**Interfaces:**
- Consumes:
  - `Organisation.gmail_two_way_enabled`;
  - `MailboxConnection.paused_reason` and `Status.DISCONNECTED` (Task 1);
  - `services.mail.tests.gmail_fixtures.google_connection` (Task 1).
- Produces:
  - `POST /api/v1/platform/organisations/<id>/gmail/` `{enabled, reason}` → `200 {"gmail": {"enabled", "connected", "paused"}}`.
  - `_summary` gains `gmail`, so both the list and the detail carry it.
  - `GET overview/` gains `gmail: {enabled_workspaces, connected, test_user_cap}`.
  - `services.platform.views._gmail_counts(organisation_ids) -> dict[int, dict]`.

- [ ] **Step 1: Write the failing tests**

In `services/platform/tests/test_platform.py`, add `"gmail",` to `DETAIL_KEYS` after `"plan",`.

Change the imports at the top to:

```python
from django.db import connection as db
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from core.models import AuditEvent
from services.accounts import mfa
from services.accounts.models import Organisation, User
from services.identity import ownership
from services.identity.models import AccessRequest, OrganizationDomain, OrganizationMembership
from services.mail.tests.gmail_fixtures import google_connection
```

At the end of the file, add:

```python
@override_settings(GMAIL_TEST_USER_CAP=100)
class GmailSwitchTests(PlatformTestCase):
    """The pilot approval: staff switch two-way Gmail on per workspace, with
    a reason, on the tenant's own trail; the portal counts the Google test-user
    slots in use, never a mailbox's contents."""

    def setUp(self):
        super().setUp()
        self.url = f"/api/v1/platform/organisations/{self.acme.id}/gmail/"

    def post(self, body, url=None):
        return self.client.post(url or self.url, body, format="json")

    def test_staff_switch_it_on_with_a_reason_on_the_tenants_trail(self):
        self.as_staff()
        response = self.post({"enabled": True, "reason": "Pilot approved"})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data, {"gmail": {"enabled": True, "connected": 0, "paused": 0}})
        self.acme.refresh_from_db()
        self.assertTrue(self.acme.gmail_two_way_enabled)
        event = AuditEvent.objects.get(action="platform.organisation.gmail_two_way")
        self.assertEqual((event.organisation, event.actor), (self.acme, self.staff))
        self.assertEqual(event.metadata, {"from": False, "to": True, "reason": "Pilot approved"})

    def test_the_same_value_again_answers_and_writes_nothing(self):
        self.as_staff()
        response = self.post({"enabled": False, "reason": "Just checking"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(
            AuditEvent.objects.filter(action="platform.organisation.gmail_two_way").exists()
        )

    def test_enabled_must_be_a_boolean_and_a_reason_is_required(self):
        self.as_staff()
        for body, code in (
            ({"enabled": "yes", "reason": "x"}, "INVALID_ENABLED"),
            ({"reason": "x"}, "INVALID_ENABLED"),
            ({"enabled": True, "reason": "  "}, "REASON_REQUIRED"),
        ):
            with self.subTest(body=body):
                response = self.post(body)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.data["error"]["code"], code)
        missing = self.post(
            {"enabled": True, "reason": "x"}, "/api/v1/platform/organisations/999999/gmail/"
        )
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(missing.data["error"]["code"], "ORGANIZATION_NOT_FOUND")

    def test_a_tenant_cannot_read_or_change_it(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {mfa_token_for(self.owner)}")
        self.assertEqual(
            self.post({"enabled": True, "reason": "x"}).status_code, status.HTTP_403_FORBIDDEN
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.owner)}")
        response = self.client.patch(
            "/api/v1/auth/organisation/", {"gmail_two_way_enabled": True}, format="json"
        )
        self.assertNotIn("gmail_two_way_enabled", response.data)
        self.acme.refresh_from_db()
        self.assertFalse(self.acme.gmail_two_way_enabled)

    def test_live_connections_and_pauses_are_counted_in_one_query(self):
        Organisation.objects.filter(pk=self.acme.pk).update(gmail_two_way_enabled=True)
        google_connection(self.owner)
        google_connection(self.csm, paused_reason="no_seat")
        gone = User.objects.create_user(
            email="gone@acme.io", password="x", name="Gone", organisation=self.acme
        )
        # A disconnected mailbox no longer holds a Google test-user slot.
        google_connection(gone, status="disconnected")
        self.as_staff()
        with CaptureQueriesContext(db) as queries:
            rows = self.client.get("/api/v1/platform/organisations/").data
        by_name = {o["name"]: o for o in rows}
        self.assertEqual(
            by_name["Acme Inc"]["gmail"], {"enabled": True, "connected": 2, "paused": 1}
        )
        self.assertEqual(
            by_name["Rival Ltd"]["gmail"], {"enabled": False, "connected": 0, "paused": 0}
        )
        mail = [q for q in queries.captured_queries if "mail_mailboxconnection" in q["sql"]]
        self.assertEqual(len(mail), 1)

        detail = self.client.get(f"/api/v1/platform/organisations/{self.acme.id}/").data
        self.assertEqual(detail["gmail"], {"enabled": True, "connected": 2, "paused": 1})
        self.assertNotIn("mailbox", str(detail).lower())
        overview = self.client.get("/api/v1/platform/overview/").data
        self.assertEqual(
            overview["gmail"], {"enabled_workspaces": 1, "connected": 2, "test_user_cap": 100}
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.platform --parallel auto --noinput`
Expected: FAIL. The new route is 404, `gmail` is missing from the payloads, and `test_detail_is_metadata_only` fails on the key set.

- [ ] **Step 3: Implement**

In `services/platform/views.py`:

Add to the module docstring's route list, after the `status/` line:

```
    POST   /api/v1/platform/organisations/<id>/gmail/     { enabled, reason }
```

Change the imports to:

```python
from django.conf import settings
from django.db.models import Count, Q
from rest_framework import status, views
from rest_framework.response import Response

from core import audit
from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.accounts.permissions import IsPlatformStaff
from services.identity import ownership
from services.identity.models import (
    AccessRequest,
    Invitation,
    OrganizationDomain,
    OrganizationMembership,
)
from services.mail.models import MailboxConnection
```

After `_owner`, add:

```python
#: A workspace with no live Google connection.
NO_GMAIL = {"connected": 0, "paused": 0}


def _gmail_counts(organisation_ids):
    """{organisation id: {connected, paused}} over live Google connections (each
    holds a Google test-user slot, paused and errored ones included), in one
    aggregate query. Counts only: no address, no content."""
    rows = (
        MailboxConnection.objects.filter(
            organisation_id__in=organisation_ids, provider=MailboxConnection.Provider.GOOGLE
        )
        .exclude(status=MailboxConnection.Status.DISCONNECTED)
        .values("organisation_id")
        .annotate(connected=Count("id"), paused=Count("id", filter=~Q(paused_reason="")))
        .values_list("organisation_id", "connected", "paused")
    )
    return {org: {"connected": connected, "paused": paused} for org, connected, paused in rows}
```

In `_summary`, after `"plan": _plan(organisation),` add:

```python
        "gmail": {"enabled": organisation.gmail_two_way_enabled, **counts.get("gmail", NO_GMAIL)},
```

In `OverviewView.get`'s response dict, after `"staff": ...`, add:

```python
                "gmail": {
                    "enabled_workspaces": Organisation.objects.filter(
                        gmail_two_way_enabled=True
                    ).count(),
                    "connected": MailboxConnection.objects.filter(
                        provider=MailboxConnection.Provider.GOOGLE
                    )
                    .exclude(status=MailboxConnection.Status.DISCONNECTED)
                    .count(),
                    # The one Google Cloud project's test-user limit, platform-wide.
                    "test_user_cap": settings.GMAIL_TEST_USER_CAP,
                },
```

In `OrganisationListView.get`, after the `pending = dict(...)` block, add `gmail = _gmail_counts(ids)`. Then pass it in each summary's counts:

```python
(
    {
        "members_active": members.get(o.id, 0),
        "pending_requests": pending.get(o.id, 0),
        "gmail": gmail.get(o.id, NO_GMAIL),
    },
)
```

In `OrganisationDetailView.get`, add to `counts`:

```python
            "gmail": _gmail_counts([organisation.pk]).get(organisation.pk, NO_GMAIL),
```

After `OrganisationStatusView`, add:

```python
class OrganisationGmailView(views.APIView):
    """POST /api/v1/platform/organisations/<id>/gmail/ — { enabled, reason }.

    The pilot approval for two-way Gmail. Off pauses every Google mailbox in
    the workspace at the mail loop's next gate sweep (within a minute); on
    resumes them. Nothing is deleted. Staff also add each pilot user as a
    test user in Google Cloud: Google refuses anyone else. A no-op answers
    200 without an audit row.
    """

    permission_classes = [IsPlatformStaff]

    def post(self, request, pk):
        organisation = Organisation.objects.filter(pk=pk).first()
        if organisation is None:
            return _error(
                "ORGANIZATION_NOT_FOUND", "No such organisation.", status.HTTP_404_NOT_FOUND
            )
        enabled = request.data.get("enabled")
        if not isinstance(enabled, bool):
            return _error("INVALID_ENABLED", "Say whether Gmail is on: true or false.")
        reason = str(request.data.get("reason", "")).strip()
        if not reason:
            return _error("REASON_REQUIRED", "Say why; it goes on the record.")
        previous = organisation.gmail_two_way_enabled
        if previous != enabled:
            Organisation.objects.filter(pk=pk).update(gmail_two_way_enabled=enabled)
            audit.record(  # SOC2:LOG-01
                "platform.organisation.gmail_two_way",
                request=request,
                actor=request.user,
                organisation=organisation,
                target=organisation,
                metadata={"from": previous, "to": enabled, "reason": reason[:500]},
            )
        counts = _gmail_counts([organisation.pk]).get(organisation.pk, NO_GMAIL)
        return Response({"gmail": {"enabled": enabled, **counts}})
```

In `services/platform/urls.py`, after the `status/` route, add:

```python
(
    path(
        "organisations/<int:pk>/gmail/",
        views.OrganisationGmailView.as_view(),
        name="platform-organisation-gmail",
    ),
)
```

- [ ] **Step 4: Run them to see them pass**

Run: `venv/bin/python manage.py test services.platform --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add services/platform/views.py services/platform/urls.py services/platform/tests/test_platform.py
git commit -m "$(cat <<'EOF'
feat(platform): switch two-way gmail on per workspace

POST organisations/<id>/gmail/ with a reason, audited on the tenant's
trail; the list, detail and overview count live Google connections and
pauses against the test-user cap, in one aggregate query.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 3: The Gmail HTTP layer and a fake Gmail

**Files:**
- Modify: `services/mail/providers/base.py` (`ProviderError`; `Credentials`; `http_json`'s `HTTPError` branch)
- Modify: `services/mail/providers/google.py` (module docstring, imports, `SCOPES`, `exchange_code`, `_fresh`; new `GmailSession`, `revoke`)
- Create: `services/mail/tests/gmail_fake.py`
- Create: `services/mail/tests/fixtures/gmail/labels_list.json`, `message_full.json`, `error_rate_limited.json`, `error_insufficient_permissions.json`, `error_invalid_grant.json`
- Modify: `services/mail/tests/gmail_fixtures.py` (`GmailFixture.use_gmail`)
- Test: `services/mail/tests/test_gmail_client.py`

**Interfaces:**
- Consumes: `services.mail.scopes.REQUESTED` (Task 1).
- Produces:
  - `services.mail.providers.base`:
    - `ProviderError(message, *, reauth=False, status=None, reason="", retry_after=None)`, with attributes `.status: int | None`, `.reason: str` and `.retry_after: int | None`;
    - `RATE_LIMIT_REASONS: frozenset`;
    - `error_reason(raw: str) -> str`;
    - `Credentials.scopes: list[str]` (default `[]`).
  - `http_json` sets `reauth` on 401, and on a 403 that is not a rate limit.
  - `services.mail.providers.google`:
    - `SCOPES` (space-joined `scopes.REQUESTED`), `LOST_GRANT`, `REVOKE_URL`, `HISTORY_TYPES`;
    - `GoogleProvider._fresh(creds, *, force=False) -> Credentials`. Its `reauth` is true only for `invalid_grant`, `invalid_client` or 401.
    - `GoogleProvider.exchange_code(code, redirect_uri) -> Credentials`, with `address=""` and `.scopes` set; it makes no Gmail call.
  - `GmailSession(creds)`:
    - `.creds`;
    - `.profile() -> dict` and `.labels() -> list[dict]`;
    - `.history(start_history_id, page_token="") -> dict`;
    - `.list_messages(q, page_token="", max_results=100) -> dict`;
    - `.get_message(message_id, fmt="full") -> dict | None`;
    - `.watch(topic) -> dict` and `.stop() -> dict`.
  - `revoke(token: str) -> bool`.
  - `services.mail.tests.gmail_fake`:
    - `FakeGmail(address="dana@acme.io")`, called like `http_json`;
    - helpers `.add(full, *, quietly=False)`, `.relabel(id, labels)`, `.remove(id)`, `.forget_history()` and `.fail(pattern, status, reason="", *, retry_after=None, times=1)`;
    - state `.calls`, `.revoked`, `.watched`, `.stopped`, `.granted_scope` and `.refresh_reason`;
    - `gmail_message(message_id, **kw) -> dict`, `fixture(name) -> dict`, `GRANTED_SCOPE: str`.
  - `GmailFixture.use_gmail(address="dana@acme.io") -> FakeGmail`.

- [ ] **Step 1: The recorded-shape fixtures**

Create `services/mail/tests/fixtures/gmail/labels_list.json`:

```json
{
  "labels": [
    {"id": "INBOX", "name": "INBOX", "messageListVisibility": "hide", "labelListVisibility": "labelShow", "type": "system"},
    {"id": "SENT", "name": "SENT", "type": "system"},
    {"id": "DRAFT", "name": "DRAFT", "type": "system"},
    {"id": "SPAM", "name": "SPAM", "messageListVisibility": "hide", "labelListVisibility": "labelHide", "type": "system"},
    {"id": "TRASH", "name": "TRASH", "messageListVisibility": "hide", "labelListVisibility": "labelHide", "type": "system"},
    {"id": "UNREAD", "name": "UNREAD", "type": "system"},
    {"id": "STARRED", "name": "STARRED", "type": "system"},
    {"id": "IMPORTANT", "name": "IMPORTANT", "type": "system"},
    {"id": "CHAT", "name": "CHAT", "messageListVisibility": "hide", "labelListVisibility": "labelHide", "type": "system"},
    {"id": "CATEGORY_PROMOTIONS", "name": "CATEGORY_PROMOTIONS", "type": "system"},
    {"id": "Label_12", "name": "Renewals", "messageListVisibility": "show", "labelListVisibility": "labelShow", "type": "user", "color": {"textColor": "#ffffff", "backgroundColor": "#16a766"}},
    {"id": "Label_19", "name": "Vendors/Billing", "messageListVisibility": "show", "labelListVisibility": "labelShow", "type": "user"}
  ]
}
```

Create `services/mail/tests/fixtures/gmail/message_full.json`. It is a `messages.get?format=full` answer, with a text and an HTML part, a PDF and an inline logo:

```json
{
  "id": "18c2f0a9e1b2c3d4",
  "threadId": "18c2f0a9e1b2c3d4",
  "labelIds": ["INBOX", "UNREAD", "IMPORTANT", "Label_12"],
  "snippet": "Hi Dana, The renewal quote is attached. Ann",
  "historyId": "9876001",
  "internalDate": "1791536400000",
  "sizeEstimate": 245011,
  "payload": {
    "partId": "",
    "mimeType": "multipart/mixed",
    "filename": "",
    "headers": [
      {"name": "From", "value": "Ann Lee <ann@pizzahut.com>"},
      {"name": "To", "value": "Dana Ruiz <dana@acme.io>"},
      {"name": "Cc", "value": "Sam Pizza <sam@pizzahut.com>"},
      {"name": "Subject", "value": "Renewal quote"},
      {"name": "Message-ID", "value": "<CAF=quote@mail.gmail.com>"},
      {"name": "References", "value": "<CAF=first@mail.gmail.com>"},
      {"name": "Date", "value": "Fri, 9 Oct 2026 09:00:00 +0000"}
    ],
    "body": {"size": 0},
    "parts": [
      {
        "partId": "0",
        "mimeType": "multipart/alternative",
        "filename": "",
        "headers": [],
        "body": {"size": 0},
        "parts": [
          {"partId": "0.0", "mimeType": "text/plain", "filename": "", "headers": [], "body": {"size": 51, "data": "SGkgRGFuYSwNCg0KVGhlIHJlbmV3YWwgcXVvdGUgaXMgYXR0YWNoZWQuDQoNCkFubg0K"}},
          {"partId": "0.1", "mimeType": "text/html", "filename": "", "headers": [], "body": {"size": 157, "data": "PGRpdiBzdHlsZT0iZm9udC1mYW1pbHk6QXJpYWwiPjxwPkhpIERhbmEsPC9wPjxwPlRoZSByZW5ld2FsIHF1b3RlIGlzIGF0dGFjaGVkLjwvcD48aW1nIHNyYz0iY2lkOmxvZ29AcGl6emFodXQuY29tIj48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ-PHA-QW5uPC9wPjwvZGl2Pg"}}
        ]
      },
      {
        "partId": "1",
        "mimeType": "application/pdf",
        "filename": "Renewal quote.pdf",
        "headers": [{"name": "Content-Disposition", "value": "attachment; filename=\"Renewal quote.pdf\""}],
        "body": {"attachmentId": "ANGjdJ8quote", "size": 182311}
      },
      {
        "partId": "2",
        "mimeType": "image/png",
        "filename": "logo.png",
        "headers": [
          {"name": "Content-Disposition", "value": "inline; filename=\"logo.png\""},
          {"name": "Content-ID", "value": "<logo@pizzahut.com>"}
        ],
        "body": {"attachmentId": "ANGjdJ8logo", "size": 4210}
      }
    ]
  }
}
```

Create `services/mail/tests/fixtures/gmail/error_rate_limited.json`:

```json
{"error": {"code": 403, "message": "User-rate limit exceeded.", "errors": [{"message": "User-rate limit exceeded.", "domain": "usageLimits", "reason": "rateLimitExceeded"}], "status": "PERMISSION_DENIED"}}
```

Create `services/mail/tests/fixtures/gmail/error_insufficient_permissions.json`:

```json
{"error": {"code": 403, "message": "Request had insufficient authentication scopes.", "errors": [{"message": "Insufficient Permission", "domain": "global", "reason": "insufficientPermissions"}], "status": "PERMISSION_DENIED", "details": [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "domain": "googleapis.com"}]}}
```

Create `services/mail/tests/fixtures/gmail/error_invalid_grant.json`:

```json
{"error": "invalid_grant", "error_description": "Token has been expired or revoked."}
```

- [ ] **Step 2: The fake Gmail**

Create `services/mail/tests/gmail_fake.py`:

```python
"""A Gmail mailbox in memory, standing in for `http_json` in tests.

Patch `services.mail.providers.google.http_json` with an instance (or use
GmailFixture.use_gmail) and the provider, the session, the sync and the
views talk to it as they would to Google: the token endpoint, revoke, and
the Gmail REST routes D1 calls. Bodies follow the recorded shapes in
fixtures/gmail/; a failure arrives as the ProviderError http_json raises
for the same answer. History pages hold two records each and list pages
honour maxResults, so paging is always exercised.
"""

import base64
import copy
import json
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from services.mail import scopes
from services.mail.providers.base import RATE_LIMIT_REASONS, ProviderError

FIXTURES = Path(__file__).parent / "fixtures" / "gmail"
GRANTED_SCOPE = " ".join(
    [
        *scopes.TWO_WAY,
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    ]
)
API_PREFIX = "/gmail/v1/users/me"


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def _b64(text):
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def gmail_message(
    message_id,
    *,
    labels=("INBOX", "UNREAD"),
    sender="Sam Pizza <sam@pizzahut.com>",
    to="dana@acme.io",
    cc="",
    bcc="",
    subject="Renewal",
    text="Can we talk about the renewal?",
    html="",
    sent_at=None,
    thread_id=None,
    references="",
    attachments=(),
):
    """A `messages.get?format=full` body in Gmail's shape. `attachments` are
    dicts of filename, mime_type, size and optionally inline / content_id."""
    sent_at = sent_at or datetime.now(UTC)
    headers = [
        {"name": "From", "value": sender},
        {"name": "To", "value": to},
        {"name": "Subject", "value": subject},
        {"name": "Message-ID", "value": f"<{message_id}@mail.gmail.com>"},
    ]
    for name, value in (("Cc", cc), ("Bcc", bcc), ("References", references)):
        if value:
            headers.append({"name": name, "value": value})
    alternative = [
        {
            "partId": "0.0",
            "mimeType": "text/plain",
            "filename": "",
            "headers": [],
            "body": {"size": len(text), "data": _b64(text)},
        }
    ]
    if html:
        alternative.append(
            {
                "partId": "0.1",
                "mimeType": "text/html",
                "filename": "",
                "headers": [],
                "body": {"size": len(html), "data": _b64(html)},
            }
        )
    parts = [
        {
            "partId": "0",
            "mimeType": "multipart/alternative",
            "filename": "",
            "headers": [],
            "body": {"size": 0},
            "parts": alternative,
        }
    ]
    for n, item in enumerate(attachments, start=1):
        disposition = "inline" if item.get("inline") else "attachment"
        part_headers = [
            {
                "name": "Content-Disposition",
                "value": f'{disposition}; filename="{item["filename"]}"',
            }
        ]
        if item.get("content_id"):
            part_headers.append({"name": "Content-ID", "value": f"<{item['content_id']}>"})
        parts.append(
            {
                "partId": str(n),
                "mimeType": item["mime_type"],
                "filename": item["filename"],
                "headers": part_headers,
                "body": {"attachmentId": f"ANGjdJ{message_id}{n}", "size": item["size"]},
            }
        )
    return {
        "id": message_id,
        "threadId": thread_id or message_id,
        "labelIds": list(labels),
        "snippet": text[:100],
        "historyId": "1",
        "internalDate": str(int(sent_at.timestamp() * 1000)),
        "sizeEstimate": 1000,
        "payload": {
            "partId": "",
            "mimeType": "multipart/mixed",
            "filename": "",
            "headers": headers,
            "body": {"size": 0},
            "parts": parts,
        },
    }


def _not_found():
    return ProviderError("404 from gmail.googleapis.com: notFound", status=404, reason="notFound")


class FakeGmail:
    HISTORY_PAGE = 2

    def __init__(self, address="dana@acme.io"):
        self.address = address
        self.messages = {}
        self.labels = fixture("labels_list.json")["labels"]
        self.history_id = 1000
        self.records = []
        self.oldest_history = 0
        self.failures = []
        self.calls = []
        self.revoked = []
        self.watched = []
        self.stopped = 0
        self.granted_scope = GRANTED_SCOPE
        #: "invalid_grant" makes every token refresh fail as Google does.
        self.refresh_reason = ""

    # --- the mailbox, as a test changes it ---------------------------------
    def _record(self, **change):
        self.history_id += 1
        self.records.append({"id": str(self.history_id), **change})

    def _stub(self, message_id):
        full = self.messages[message_id]
        return {"id": message_id, "threadId": full["threadId"], "labelIds": list(full["labelIds"])}

    def add(self, full, *, quietly=False):
        """Gmail receives `full`. `quietly`: it was there before (no history)."""
        self.messages[full["id"]] = copy.deepcopy(full)
        if not quietly:
            self._record(messagesAdded=[{"message": self._stub(full["id"])}])
        return full["id"]

    def relabel(self, message_id, labels):
        self.messages[message_id]["labelIds"] = list(labels)
        self._record(labelsAdded=[{"message": self._stub(message_id), "labelIds": list(labels)}])

    def remove(self, message_id):
        self.messages.pop(message_id)
        self._record(messagesDeleted=[{"message": {"id": message_id, "threadId": message_id}}])

    def forget_history(self):
        """Gmail drops its old history: a start before today's id answers 404."""
        self.oldest_history = self.history_id

    def fail(self, pattern, status, reason="", *, retry_after=None, times=1):
        """The next `times` calls whose path matches `pattern` fail."""
        for _ in range(times):
            self.failures.append((re.compile(pattern), status, reason, retry_after))

    # --- http_json --------------------------------------------------------
    def __call__(
        self, method, url, *, headers=None, data=None, form=None, timeout=30, allowed_hosts=None
    ):
        parts = urlsplit(url)
        query = {k: v if len(v) > 1 else v[0] for k, v in parse_qs(parts.query).items()}
        self.calls.append((method, parts.netloc + parts.path, query))
        for i, (pattern, status, reason, retry_after) in enumerate(self.failures):
            if pattern.search(parts.path):
                del self.failures[i]
                raise ProviderError(
                    f"{status} from {parts.netloc}: {reason}",
                    reauth=status == 401 or (status == 403 and reason not in RATE_LIMIT_REASONS),
                    status=status,
                    reason=reason,
                    retry_after=retry_after,
                )
        if parts.netloc == "oauth2.googleapis.com":
            return self._oauth(parts.path, form or {})
        assert parts.path.startswith(API_PREFIX), parts.path
        route = parts.path[len(API_PREFIX) :]
        if route == "/profile":
            return {
                "emailAddress": self.address,
                "messagesTotal": len(self.messages),
                "threadsTotal": len(self.messages),
                "historyId": str(self.history_id),
            }
        if route == "/labels":
            return {"labels": copy.deepcopy(self.labels)}
        if route == "/history":
            return self._history(query)
        if route == "/messages":
            return self._list(query)
        if route.startswith("/messages/"):
            return self._get(route.rsplit("/", 1)[-1], query.get("format", "full"))
        if route == "/watch":
            self.watched.append(data["topicName"])
            expiration = int((time.time() + 7 * 86400) * 1000)
            return {"historyId": str(self.history_id), "expiration": str(expiration)}
        if route == "/stop":
            self.stopped += 1
            return {}
        raise AssertionError(f"FakeGmail has no route for {method} {parts.path}")

    def _oauth(self, path, form):
        if path == "/revoke":
            self.revoked.append(form.get("token"))
            return {}
        grant = form.get("grant_type")
        if grant == "refresh_token" and self.refresh_reason:
            raise ProviderError(
                f"400 from oauth2.googleapis.com: {self.refresh_reason}",
                status=400,
                reason=self.refresh_reason,
            )
        tokens = {
            "access_token": f"fake-access-{len(self.calls)}",
            "expires_in": 3599,
            "scope": self.granted_scope,
            "token_type": "Bearer",
        }
        if grant == "authorization_code":
            tokens["refresh_token"] = "fake-refresh"
        return tokens

    def _history(self, query):
        start = int(query["startHistoryId"])
        if start < self.oldest_history:
            raise _not_found()
        newer = [r for r in self.records if int(r["id"]) > start]
        offset = int(query.get("pageToken") or 0)
        page = newer[offset : offset + self.HISTORY_PAGE]
        body = {"historyId": str(self.history_id)}
        if page:
            body["history"] = copy.deepcopy(page)
        if offset + self.HISTORY_PAGE < len(newer):
            body["nextPageToken"] = str(offset + self.HISTORY_PAGE)
        return body

    def _list(self, query):
        q = query.get("q", "")
        after = re.search(r"after:(\d+)", q)
        before = re.search(r"before:(\d+)", q)

        def wanted(full):
            seconds = int(full["internalDate"]) // 1000
            if "-in:chats" in q and "CHAT" in full["labelIds"]:
                return False
            if after and seconds <= int(after.group(1)):
                return False
            return not (before and seconds >= int(before.group(1)))

        rows = sorted(
            (m for m in self.messages.values() if wanted(m)),
            key=lambda m: int(m["internalDate"]),
            reverse=True,
        )
        token = query.get("pageToken", "")
        if token and not token.startswith("p"):
            raise ProviderError(
                "400 from gmail.googleapis.com: invalid pageToken", status=400, reason="invalid"
            )
        offset = int(token[1:]) if token else 0
        size = int(query.get("maxResults", 100))
        page = rows[offset : offset + size]
        body = {"resultSizeEstimate": len(rows)}
        if page:
            body["messages"] = [{"id": m["id"], "threadId": m["threadId"]} for m in page]
        if offset + size < len(rows):
            body["nextPageToken"] = f"p{offset + size}"
        return body

    def _get(self, message_id, fmt):
        full = self.messages.get(message_id)
        if full is None:
            raise _not_found()
        if fmt == "minimal":
            keep = ("id", "threadId", "labelIds", "snippet", "historyId", "internalDate")
            return {k: copy.deepcopy(full[k]) for k in keep}
        return copy.deepcopy(full)
```

In `services/mail/tests/gmail_fixtures.py`, add `from unittest.mock import patch` to the imports. Add this method to `GmailFixture`:

```python
    def use_gmail(self, address="dana@acme.io"):
        """A FakeGmail standing in for Google for the rest of this test."""
        from .gmail_fake import FakeGmail

        fake = FakeGmail(address)
        patcher = patch("services.mail.providers.google.http_json", fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake
```

- [ ] **Step 3: Write the failing tests**

Create `services/mail/tests/test_gmail_client.py`:

```python
"""The Gmail HTTP layer: error reasons and Retry-After, the narrowed token
refresh, the session's one retry on 401, revoke, the new consent scopes, and
an exchange that no longer reads the mailbox."""

import io
import json
import urllib.error
from email.message import Message as Headers
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.test import SimpleTestCase, override_settings

from services.mail import scopes
from services.mail.providers.base import Credentials, ProviderError, http_json
from services.mail.providers.google import GmailSession, GoogleProvider, revoke

from .gmail_fake import FakeGmail, fixture
from .test_unanswered import EXPIRED, URLOPEN

FRESH = Credentials(
    address="dana@acme.io",
    data={"access_token": "fake-a", "refresh_token": "fake-r", "expires_at": 9e12},
)


def http_error(status, body, retry_after=None):
    headers = Headers()
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    return urllib.error.HTTPError(
        "https://gmail.googleapis.com/x", status, "error", headers, io.BytesIO(raw)
    )


class ErrorReasonTests(SimpleTestCase):
    def call(self, error):
        with patch(URLOPEN, side_effect=error), self.assertRaises(ProviderError) as caught:
            http_json("GET", "https://gmail.googleapis.com/gmail/v1/users/me/profile")
        return caught.exception

    def test_a_rate_limit_is_not_a_lost_grant_and_keeps_retry_after(self):
        e = self.call(http_error(403, fixture("error_rate_limited.json"), retry_after=120))
        self.assertEqual(
            (e.status, e.reason, e.retry_after, e.reauth), (403, "rateLimitExceeded", 120, False)
        )

    def test_a_missing_permission_is_named(self):
        e = self.call(http_error(403, fixture("error_insufficient_permissions.json")))
        self.assertEqual((e.status, e.reason, e.reauth), (403, "insufficientPermissions", True))

    def test_oauth_errors_name_their_reason(self):
        e = self.call(http_error(400, fixture("error_invalid_grant.json")))
        self.assertEqual((e.status, e.reason, e.retry_after), (400, "invalid_grant", None))

    def test_a_body_that_is_not_json_has_no_reason(self):
        e = self.call(http_error(502, b"<html>bad gateway</html>"))
        self.assertEqual((e.status, e.reason, e.reauth), (502, "", False))


class RefreshTests(SimpleTestCase):
    def refresh(self, fake, creds=EXPIRED, **kw):
        with patch("services.mail.providers.google.http_json", fake):
            return GoogleProvider()._fresh(creds, **kw)

    def test_invalid_grant_is_a_lost_grant(self):
        fake = FakeGmail()
        fake.refresh_reason = "invalid_grant"
        with self.assertRaises(ProviderError) as caught:
            self.refresh(fake)
        self.assertEqual(
            (caught.exception.reauth, caught.exception.reason), (True, "invalid_grant")
        )

    def test_a_token_endpoint_outage_is_not(self):
        fake = FakeGmail()
        fake.fail(r"^/token$", 503)
        with self.assertRaises(ProviderError) as caught:
            self.refresh(fake)
        self.assertEqual((caught.exception.reauth, caught.exception.status), (False, 503))

    def test_force_refreshes_a_token_that_has_not_expired(self):
        creds = self.refresh(FakeGmail(), FRESH, force=True)
        self.assertTrue(creds.data["access_token"].startswith("fake-access-"))
        self.assertEqual(creds.data["refresh_token"], "fake-r")


class SessionTests(SimpleTestCase):
    def setUp(self):
        self.fake = FakeGmail()
        patcher = patch("services.mail.providers.google.http_json", self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_one_401_refreshes_the_token_and_retries(self):
        self.fake.fail(r"/profile$", 401)
        session = GmailSession(FRESH)
        self.assertEqual(session.profile()["emailAddress"], "dana@acme.io")
        self.assertNotEqual(session.creds.data["access_token"], "fake-a")

    def test_a_second_401_is_raised(self):
        self.fake.fail(r"/profile$", 401, times=2)
        with self.assertRaises(ProviderError) as caught:
            GmailSession(FRESH).profile()
        self.assertEqual(caught.exception.status, 401)

    def test_a_network_failure_is_a_provider_error_without_a_status(self):
        with (
            patch(
                "services.mail.providers.google.http_json", side_effect=TimeoutError("timed out")
            ),
            self.assertRaises(ProviderError) as caught,
        ):
            GmailSession(FRESH).labels()
        self.assertIsNone(caught.exception.status)

    def test_a_message_gmail_no_longer_has_is_none(self):
        self.assertIsNone(GmailSession(FRESH).get_message("gone"))

    def test_history_asks_for_the_four_kinds_of_change(self):
        GmailSession(FRESH).history(5, "2")
        _, where, query = self.fake.calls[-1]
        self.assertEqual(where, "gmail.googleapis.com/gmail/v1/users/me/history")
        self.assertEqual(
            query["historyTypes"],
            ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
        )
        self.assertEqual((query["startHistoryId"], query["pageToken"]), ("5", "2"))

    def test_listing_includes_spam_and_trash(self):
        GmailSession(FRESH).list_messages("after:1 -in:chats", max_results=7)
        _, _, query = self.fake.calls[-1]
        self.assertEqual(
            (query["q"], query["maxResults"], query["includeSpamTrash"]),
            ("after:1 -in:chats", "7", "true"),
        )

    def test_revoke_posts_the_token_and_reports_a_failure(self):
        self.assertTrue(revoke("fake-r"))
        self.assertEqual(self.fake.revoked, ["fake-r"])
        self.fake.fail(r"^/revoke$", 400, "invalid_token")
        self.assertFalse(revoke("fake-r"))
        self.assertFalse(revoke(""))


@override_settings(GOOGLE_OAUTH_CLIENT_ID="cid", GOOGLE_OAUTH_CLIENT_SECRET="sec")
class ConsentTests(SimpleTestCase):
    def test_the_consent_screen_asks_for_modify_send_and_compose(self):
        url = GoogleProvider().authorize_url("state", "https://api.test/cb/")
        query = parse_qs(urlsplit(url).query)
        self.assertEqual(query["scope"][0].split(), list(scopes.REQUESTED))
        self.assertNotIn("gmail.readonly", query["scope"][0])
        self.assertEqual((query["access_type"][0], query["prompt"][0]), ("offline", "consent"))

    def test_the_exchange_returns_the_grant_without_reading_the_mailbox(self):
        fake = FakeGmail()
        fake.granted_scope = f"{scopes.MODIFY} openid"
        with patch("services.mail.providers.google.http_json", fake):
            creds = GoogleProvider().exchange_code("code", "https://api.test/cb/")
        self.assertEqual((creds.scopes, creds.address), ([scopes.MODIFY, "openid"], ""))
        self.assertEqual(creds.data["refresh_token"], "fake-refresh")
        self.assertEqual([where for _, where, _ in fake.calls], ["oauth2.googleapis.com/token"])
```

- [ ] **Step 4: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_gmail_client --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'RATE_LIMIT_REASONS'` (from `gmail_fake`).

- [ ] **Step 5: `ProviderError`, `Credentials` and `http_json`**

In `services/mail/providers/base.py`, replace `ProviderError` with:

```python
class ProviderError(Exception):
    """The provider refused or failed. `reauth` says whether the person must
    reconnect (expired or revoked grant) rather than retry. `status` is the
    HTTP status (None: no answer), `reason` the provider's machine reason
    (`invalid_grant`, `rateLimitExceeded`, ...), `retry_after` the seconds a
    Retry-After header asked for."""

    def __init__(self, message, *, reauth=False, status=None, reason="", retry_after=None):
        super().__init__(message)
        self.reauth = reauth
        self.status = status
        self.reason = reason
        self.retry_after = retry_after


#: Google's 403 reasons that mean "slow down", not "you may not".
RATE_LIMIT_REASONS = frozenset({"rateLimitExceeded", "userRateLimitExceeded"})


def error_reason(raw):
    """The machine reason in an error body: OAuth's `error` string, else
    Google's `error.errors[0].reason`, else `error.status`; '' otherwise."""
    try:
        body = json.loads(raw)
    except ValueError:
        return ""
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, str):
        return error
    if isinstance(error, dict):
        for item in error.get("errors") or []:
            if isinstance(item, dict) and item.get("reason"):
                return str(item["reason"])
        return str(error.get("status") or "")
    return ""


def _retry_after(headers):
    try:
        return max(int(headers.get("Retry-After")), 0) if headers is not None else None
    except (TypeError, ValueError):
        return None
```

In `Credentials`, after `data: dict = ...`, add:

```python
    #: The scopes the provider granted, as it named them (Google's token answer).
    scopes: list[str] = field(default_factory=list)
```

In `http_json`, replace the `except urllib.error.HTTPError as exc:` branch with:

```python
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
```

- [ ] **Step 6: `GoogleProvider`, `GmailSession` and `revoke`**

In `services/mail/providers/google.py`:

Replace the module docstring with:

```python
"""Google Workspace / Gmail over OAuth 2.0 and the Gmail REST API.

Scopes: gmail.modify, gmail.send and gmail.compose (services/mail/scopes.py),
all three or the connection is refused. Refresh tokens are long-lived;
access tokens are refreshed on demand and the refreshed set is handed back
to the caller to store. `GmailSession` is one mailbox's calls for one pass
of the sync (services/mail/gmail_sync.py).
"""
```

Change the imports to:

```python
import base64
import http.client
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from urllib.parse import quote, urlencode

from django.conf import settings

from .. import scopes
from .base import (
    Credentials,
    MailProvider,
    Message,
    ProviderError,
    http_json,
    parse_address,
    parse_address_list,
)
```

Replace the `SCOPES = ...` block with:

```python
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
SCOPES = " ".join(scopes.REQUESTED)
#: Token-endpoint reasons that mean the grant itself is gone.
LOST_GRANT = frozenset({"invalid_grant", "invalid_client"})
#: Every change the sync applies (contract §5).
HISTORY_TYPES = ("messageAdded", "messageDeleted", "labelAdded", "labelRemoved")
```

Replace `exchange_code` with:

```python
def exchange_code(self, code, redirect_uri):
    """The tokens and the scopes Google granted. Reads nothing from the
    mailbox: the caller checks the scopes first, then asks for the
    address (an unticked grant cannot even read the profile)."""
    tokens = http_json(
        "POST",
        TOKEN_URL,
        form={
            "code": code,
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    if "refresh_token" not in tokens:
        raise ProviderError("Google did not return a refresh token; reconnect and grant access.")
    return Credentials(
        address="",
        data=self._with_expiry(tokens),
        scopes=str(tokens.get("scope", "")).split(),
    )
```

Replace `_fresh` with:

```python
    def _fresh(self, creds, *, force=False):
        if not force and creds.data.get("expires_at", 0) > time.time():
            return creds
        try:
            tokens = http_json(
                "POST",
                TOKEN_URL,
                form={
                    "refresh_token": creds.data["refresh_token"],
                    "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
                    "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
                    "grant_type": "refresh_token",
                },
            )
        except ProviderError as exc:
            # Only a grant Google says is gone needs the person; a 5xx or a
            # rate limit is retried (contract decision 20).
            lost = exc.reason in LOST_GRANT or exc.status == 401
            raise ProviderError(
                f"Google refused to refresh the token: {exc.status} {exc.reason}".strip(),
                reauth=lost,
                status=exc.status,
                reason=exc.reason,
                retry_after=exc.retry_after,
            ) from exc
        except (OSError, http.client.HTTPException) as exc:
            # Nothing has been sent yet: a plain failure (the draft reopens),
            # never an unconfirmed send. Not a lost grant either.
            raise ProviderError(
                f"Google did not answer the token refresh: {type(exc).__name__}"
            ) from exc
        data = {**creds.data, **self._with_expiry(tokens)}
        return Credentials(
            address=creds.address, display_name=creds.display_name, data=data, scopes=creds.scopes
        )
```

Leave `fetch_messages` alone; Task 8 deletes it when the tick replaces it.

After `class GoogleProvider` (before `_header`), add:

```python
class GmailSession:
    """One mailbox's Gmail calls for one pass. The access token is refreshed
    when it has expired, and once more on a 401; a second 401 is raised (a
    lost grant). A network failure is a ProviderError with no status: every
    call here reads, so it is always safe to retry. `creds` is what to store
    afterwards."""

    def __init__(self, creds):
        self.creds = creds
        self._provider = GoogleProvider()
        self._retried = False

    def _call(self, method, path, *, params=None, data=None):
        url = f"{API}{path}" + (f"?{urlencode(params, doseq=True)}" if params else "")
        self.creds = self._provider._fresh(self.creds)
        try:
            return self._send(method, url, data)
        except ProviderError as exc:
            if exc.status != 401 or self._retried:
                raise
        self._retried = True
        self.creds = self._provider._fresh(self.creds, force=True)
        return self._send(method, url, data)

    def _send(self, method, url, data):
        try:
            return http_json(method, url, headers=GoogleProvider._auth(self.creds), data=data)
        except (OSError, http.client.HTTPException) as exc:
            raise ProviderError(f"Gmail did not answer: {type(exc).__name__}") from exc

    def profile(self):
        return self._call("GET", "/profile")

    def labels(self):
        return self._call("GET", "/labels").get("labels", [])

    def history(self, start_history_id, page_token=""):
        params = {
            "startHistoryId": start_history_id,
            "historyTypes": list(HISTORY_TYPES),
            "maxResults": 500,
        }
        if page_token:
            params["pageToken"] = page_token
        return self._call("GET", "/history", params=params)

    def list_messages(self, q, page_token="", max_results=100):
        params = {"q": q, "maxResults": max_results, "includeSpamTrash": "true"}
        if page_token:
            params["pageToken"] = page_token
        return self._call("GET", "/messages", params=params)

    def get_message(self, message_id, fmt="full"):
        """The message, or None when Gmail no longer has it."""
        try:
            return self._call(
                "GET", f"/messages/{quote(message_id, safe='')}", params={"format": fmt}
            )
        except ProviderError as exc:
            if exc.status == 404:
                return None
            raise

    def watch(self, topic):
        """Point the mailbox at the Pub/Sub topic, for every label."""
        return self._call("POST", "/watch", data={"topicName": topic})

    def stop(self):
        return self._call("POST", "/stop", data={})


def revoke(token):
    """Ask Google to forget this grant. Best effort: False when it could not
    be done, and the caller logs that and carries on."""
    if not token:
        return False
    try:
        # SOC2:SEC-07 a credential we no longer hold is revoked at its issuer
        http_json("POST", REVOKE_URL, form={"token": token})
    except (ProviderError, OSError, http.client.HTTPException):
        return False
    return True
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail services.customers.tests.test_drafts_unconfirmed --parallel auto --noinput`
Expected: all PASS. The existing `test_the_oauth_round_trip_trusts_only_the_signed_state` still passes: it patches `exchange_code`, so the old callback path stores whatever address the patch returns. Task 7 replaces that test.

- [ ] **Step 8: Commit**

```bash
git add services/mail/providers/base.py services/mail/providers/google.py \
  services/mail/tests/gmail_fake.py services/mail/tests/fixtures/gmail \
  services/mail/tests/gmail_fixtures.py services/mail/tests/test_gmail_client.py
git commit -m "$(cat <<'EOF'
feat(mail): add a gmail session with classified errors and revoke

ProviderError carries the HTTP status, the provider's reason and
Retry-After; a rate limit is no longer a lost grant, and a token refresh
needs the person only for invalid_grant. The consent screen asks for
gmail.modify, send and compose. A fake Gmail built from recorded shapes
stands in for Google in tests.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 4: Reading a Gmail message whole: HTML, CC/BCC, threading headers, attachments

**Files:**
- Create: `services/mail/html.py`
- Modify: `services/mail/providers/base.py` (`Message` dataclass)
- Modify: `services/mail/providers/google.py` (`_text_of`, `parse_gmail_message`; new `_decode`, `_html_of`, `_attachments_of`)
- Modify: `services/mail/sync.py` (`counterpart_addresses` :63-70, `file_message` :105-145)
- Test: `services/mail/tests/test_html.py`, `services/mail/tests/test_gmail_parse.py`

**Interfaces:**
- Consumes: `fixture("message_full.json")` (Task 3).
- Produces:
  - `services.mail.html.sanitise(raw: str) -> str`. It returns `""` for no input, or when the sanitised output is over `MAIL_HTML_MAX_BYTES`.
  - `Message` gains these fields:
    - `cc`, `bcc`: `list[tuple[str, str]]`;
    - `html: str` (raw);
    - `rfc_message_id: str` and `references: str`;
    - `label_ids: list[str]`;
    - `attachments: list[dict]`.
  - Each attachment dict has the keys `part_id`, `attachment_id`, `filename`, `mime_type`, `size`, `content_id` and `is_inline`.
  - For Gmail, `parse_gmail_message` sets `to` = To only and `cc` = Cc.
  - Filing (`counterpart_addresses`, `file_message`) uses `to + cc`. Bcc is never filed.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_html.py`:

```python
"""The mail HTML policy (contract §6): layout survives, anything that runs
or submits does not, only http, https, mailto and cid URLs are kept, and an
oversized result is dropped for the text body."""

from django.test import SimpleTestCase, override_settings

from services.mail.html import sanitise


@override_settings(MAIL_HTML_MAX_BYTES=1_000_000)
class SanitiseTests(SimpleTestCase):
    def test_layout_and_style_blocks_survive(self):
        clean = sanitise(
            '<style>p{color:red}</style><table cellpadding="2"><tr>'
            '<td bgcolor="#fff" colspan="2" style="padding:4px">c</td></tr></table>'
            '<center><font color="red">f</font></center>'
        )
        for kept in (
            "<style>p{color:red}</style>",
            'cellpadding="2"',
            'bgcolor="#fff"',
            'colspan="2"',
            'style="padding:4px"',
            "<center>",
            '<font color="red">',
        ):
            self.assertIn(kept, clean)

    def test_anything_that_runs_or_submits_goes(self):
        clean = sanitise(
            '<p onclick="steal()">hi</p><script>alert(1)</script>'
            '<iframe src="https://x.io"></iframe><object>o</object><embed src="x">'
            '<form><input value="1"><button>b</button></form><svg><circle/></svg>'
            '<math><mi>x</mi></math><link rel="stylesheet" href="https://x.io/s.css">'
            '<meta http-equiv="refresh" content="0"><base href="https://x.io/">'
        )
        for gone in (
            "onclick",
            "<script",
            "alert(1)",
            "<iframe",
            "<object",
            "<embed",
            "<form",
            "<input",
            "<button",
            "<svg",
            "<math",
            "<link",
            "<meta",
            "<base",
        ):
            self.assertNotIn(gone, clean)
        self.assertIn("<p>hi</p>", clean)

    def test_only_http_https_mailto_and_cid_urls(self):
        clean = sanitise(
            '<a href="javascript:x()">j</a><a href="vbscript:x">v</a>'
            '<a href="mailto:ann@pizzahut.com">m</a><a href="https://pizzahut.com" title="t">h</a>'
            '<img src="data:image/png;base64,AAAA"><img src="cid:logo@pizzahut.com" alt="logo">'
            '<img src="https://cdn.pizzahut.com/sig.png" width="10">'
        )
        for gone in ("javascript:", "vbscript:", "data:"):
            self.assertNotIn(gone, clean)
        for kept in (
            'href="mailto:ann@pizzahut.com"',
            'href="https://pizzahut.com"',
            'title="t"',
            'src="cid:logo@pizzahut.com"',
            # Remote images stay; the frontend's sandbox blocks them until asked.
            'src="https://cdn.pizzahut.com/sig.png"',
            'rel="noopener noreferrer"',
        ):
            self.assertIn(kept, clean)

    def test_remote_css_is_left_in_place(self):
        self.assertIn(
            "url(https://x.io/a.png)",
            sanitise('<div style="background:url(https://x.io/a.png)">x</div>'),
        )

    @override_settings(MAIL_HTML_MAX_BYTES=40)
    def test_an_oversized_result_is_dropped(self):
        self.assertEqual(sanitise("<p>" + "x" * 100 + "</p>"), "")

    def test_nothing_is_nothing(self):
        self.assertEqual(sanitise(""), "")
```

Create `services/mail/tests/test_gmail_parse.py`:

```python
"""Reading a Gmail message whole: To, Cc and Bcc apart, the threading
headers, every label id, the raw HTML part, and each file part's details;
filing still counts Cc as a counterpart and never Bcc."""

from django.test import SimpleTestCase

from services.customers.models import Email
from services.mail import sync
from services.mail.providers.google import parse_gmail_message

from .gmail_fake import fixture, gmail_message
from .test_mail import Fixture, message


class GmailParseTests(SimpleTestCase):
    def test_the_recorded_message(self):
        m = parse_gmail_message(fixture("message_full.json"))
        self.assertEqual(m.to, [("Dana Ruiz", "dana@acme.io")])
        self.assertEqual(m.cc, [("Sam Pizza", "sam@pizzahut.com")])
        self.assertEqual(m.bcc, [])
        self.assertEqual(
            (m.rfc_message_id, m.references),
            ("<CAF=quote@mail.gmail.com>", "<CAF=first@mail.gmail.com>"),
        )
        self.assertEqual(m.label_ids, ["INBOX", "UNREAD", "IMPORTANT", "Label_12"])
        self.assertEqual(m.labels, ["inbox", "unread", "important"])
        self.assertTrue(m.body.startswith("Hi Dana,"))
        # Raw until it is stored: services.mail.html sanitises at store.
        self.assertIn("<script>", m.html)
        self.assertEqual(
            m.attachments,
            [
                {
                    "part_id": "1",
                    "attachment_id": "ANGjdJ8quote",
                    "filename": "Renewal quote.pdf",
                    "mime_type": "application/pdf",
                    "size": 182311,
                    "content_id": "",
                    "is_inline": False,
                },
                {
                    "part_id": "2",
                    "attachment_id": "ANGjdJ8logo",
                    "filename": "logo.png",
                    "mime_type": "image/png",
                    "size": 4210,
                    "content_id": "logo@pizzahut.com",
                    "is_inline": True,
                },
            ],
        )

    def test_bcc_on_the_owners_own_sent_mail(self):
        m = parse_gmail_message(
            gmail_message("s1", labels=["SENT"], sender="dana@acme.io", bcc="boss@acme.io")
        )
        self.assertEqual(m.bcc, [("", "boss@acme.io")])
        self.assertEqual((m.html, m.attachments), ("", []))


class FilingCountsCcTests(Fixture):
    def test_a_customer_on_cc_files_the_mail_and_bcc_never_does(self):
        connection = self.connect(self.dana)
        cc = message(
            provider_id="c1",
            from_address="dana@acme.io",
            to=[("Carl", "carl@acme.io")],
            cc=[("Sam Pizza", "sam@pizzahut.com")],
        )
        filed = sync.file_message(connection, cc)
        self.assertEqual(filed.customer, self.pizza)
        self.assertEqual(filed.to_addresses, ["carl@acme.io", "sam@pizzahut.com"])
        bcc = message(
            provider_id="b1",
            from_address="dana@acme.io",
            to=[("Carl", "carl@acme.io")],
            bcc=[("Sam Pizza", "sam@pizzahut.com")],
        )
        self.assertIsNone(sync.file_message(connection, bcc))
        self.assertEqual(Email.objects.count(), 1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_html services.mail.tests.test_gmail_parse --parallel auto --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.mail.html'`, and `TypeError: Message.__init__() got an unexpected keyword argument 'cc'`.

- [ ] **Step 3: The sanitiser**

Create `services/mail/html.py`:

```python
"""Mail HTML, made safe once, when it is stored (contract §6).

An allow-list (nh3, the Rust `ammonia` sanitiser): layout tags, tables,
inline styles and <style> blocks survive, because that is what mail is made
of; anything that runs, submits or loads a document (script, iframe,
object, embed, form controls, svg, math, link, meta, base) is stripped,
every on* handler goes, and only http, https, mailto and cid URLs are kept.
Remote images and CSS url() are left in place: the frontend renders the
result in a sandboxed iframe (no scripts, no same-origin) whose CSP blocks
remote images until the person asks. The raw HTML is never kept.
"""

import nh3
from django.conf import settings

TAGS = frozenset(nh3.ALLOWED_TAGS) | {
    "style",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "td",
    "th",
    "caption",
    "colgroup",
    "col",
    "center",
    "font",
    "span",
}
GENERIC_ATTRIBUTES = frozenset(
    {
        "style",
        "class",
        "align",
        "valign",
        "width",
        "height",
        "bgcolor",
        "color",
        "border",
        "cellpadding",
        "cellspacing",
        "colspan",
        "rowspan",
        "dir",
        "lang",
    }
)
ATTRIBUTES = {
    "*": GENERIC_ATTRIBUTES,
    "a": frozenset({"href", "title"}),
    "img": frozenset({"src", "alt", "width", "height"}),
}
URL_SCHEMES = frozenset({"http", "https", "mailto", "cid"})


def sanitise(raw):
    """The safe HTML for `raw`; "" when there is none, or when the result is
    over MAIL_HTML_MAX_BYTES (the text body is shown instead)."""
    if not raw:
        return ""
    clean = nh3.clean(
        raw,
        tags=set(TAGS),
        # <style> is a tag we keep; only a script's content is dropped with it.
        clean_content_tags={"script"},
        attributes={tag: set(names) for tag, names in ATTRIBUTES.items()},
        url_schemes=set(URL_SCHEMES),
        link_rel="noopener noreferrer",
        strip_comments=True,
    )
    if len(clean.encode()) > settings.MAIL_HTML_MAX_BYTES:
        return ""
    return clean
```

- [ ] **Step 4: `Message` gains the fields**

In `services/mail/providers/base.py`, in `Message`, after `labels: list[str] = ...`, add:

```python
    #: Gmail splits these out of `to`; Graph and IMAP merge Cc into `to` and
    #: leave both empty. Filing counts to + cc; bcc is never filed.
    cc: list[tuple[str, str]] = field(default_factory=list)
    bcc: list[tuple[str, str]] = field(default_factory=list)
    #: The raw text/html part. services.mail.html sanitises it before it is stored.
    html: str = ""
    rfc_message_id: str = ""
    references: str = ""
    #: Gmail's own label ids, every one (system and user). Empty elsewhere.
    label_ids: list[str] = field(default_factory=list)
    #: File parts: part_id, attachment_id, filename, mime_type, size,
    #: content_id, is_inline.
    attachments: list[dict] = field(default_factory=list)
```

- [ ] **Step 5: The parser**

In `services/mail/providers/google.py`, replace `_text_of` with:

```python
def _decode(data):
    return base64.urlsafe_b64decode(data + "==").decode(errors="replace")


def _text_of(part):
    """The first text/plain body in a MIME tree, else text/html, else ''.
    A part with a filename is a file, never the body."""
    mime = part.get("mimeType", "")
    data = part.get("body", {}).get("data")
    if mime == "text/plain" and data and not part.get("filename"):
        return _decode(data)
    html = ""
    for child in part.get("parts", []):
        text = _text_of(child)
        if text and child.get("mimeType") == "text/plain":
            return text
        if text and not html:
            html = text
    if mime == "text/html" and data and not part.get("filename"):
        return _strip_html(_decode(data))
    return html


def _html_of(part):
    """The first text/html body in a MIME tree, raw; '' when there is none."""
    data = part.get("body", {}).get("data")
    if part.get("mimeType") == "text/html" and data and not part.get("filename"):
        return _decode(data)
    for child in part.get("parts", []):
        found = _html_of(child)
        if found:
            return found
    return ""


def _attachments_of(part):
    """Every file part (a filename or an attachment id), depth first. Inline
    means Content-Disposition inline with a Content-ID (a cid: image)."""
    found = []
    body = part.get("body", {})
    if part.get("filename") or body.get("attachmentId"):
        content_id = _header(part, "Content-ID").strip().strip("<>")
        found.append(
            {
                "part_id": part.get("partId", ""),
                "attachment_id": body.get("attachmentId", ""),
                "filename": part.get("filename", ""),
                "mime_type": part.get("mimeType") or "application/octet-stream",
                "size": int(body.get("size") or 0),
                "content_id": content_id,
                "is_inline": _header(part, "Content-Disposition").lower().startswith("inline")
                and bool(content_id),
            }
        )
    for child in part.get("parts", []):
        found.extend(_attachments_of(child))
    return found
```

In `parse_gmail_message`, replace the final `return Message(...)` with:

```python
    return Message(
        provider_id=full.get("id", ""),
        thread_id=full.get("threadId", ""),
        subject=_header(payload, "Subject") or "(no subject)",
        from_address=from_address,
        from_name=from_name,
        to=parse_address_list(_header(payload, "To")),
        cc=parse_address_list(_header(payload, "Cc")),
        bcc=parse_address_list(_header(payload, "Bcc")),
        date=date,
        body=_text_of(payload)[:20000],
        html=_html_of(payload),
        headers=headers,
        labels=labels,
        label_ids=list(full.get("labelIds") or []),
        rfc_message_id=_header(payload, "Message-ID"),
        references=_header(payload, "References"),
        attachments=_attachments_of(payload),
    )
```

(`_header` already matches names case-insensitively, so `Message-Id` is found too.)

- [ ] **Step 6: Filing counts Cc**

In `services/mail/sync.py`, replace `counterpart_addresses` with:

```python
def counterpart_addresses(message, own_address):
    """The addresses on the other side of `message`, and the direction. For
    something the person sent that is To and Cc (Gmail splits Cc out; the
    other providers merge it into `to`); Bcc is never a counterpart."""
    own = (own_address or "").lower()
    if message.from_address == own:
        recipients = [*message.to, *getattr(message, "cc", [])]
        return [
            address for _, address in recipients if address and address != own
        ], Email.Direction.SENT
    return [message.from_address] if message.from_address else [], Email.Direction.RECEIVED
```

In `file_message`, before `counterpart_name = (`, add `recipients = [*message.to, *message.cc]`. Then change the `counterpart_name` generator to read `for name, address in recipients`, and `to_addresses=` to `[address for _, address in recipients][:50]`.

- [ ] **Step 7: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: all PASS. The existing `ParserTests.test_gmail_payload` still passes: both its addresses are on To.

- [ ] **Step 8: Commit**

```bash
git add services/mail/html.py services/mail/providers/base.py services/mail/providers/google.py \
  services/mail/sync.py services/mail/tests/test_html.py services/mail/tests/test_gmail_parse.py
git commit -m "$(cat <<'EOF'
feat(mail): read gmail html, cc/bcc, threading headers and attachments

The nh3 policy keeps layout and style blocks and strips anything that runs
or submits; only http, https, mailto and cid URLs survive. Filing still
counts Cc as a counterpart and never Bcc.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 5: Gmail's labels are the truth: derivation, store, relabel, the label mirror

**Files:**
- Create: `services/mail/gmail_store.py`
- Test: `services/mail/tests/test_gmail_store.py`

**Interfaces:**
- Consumes:
  - `parse_gmail_message` (Task 4) and `html.sanitise` (Task 4);
  - `sync.file_message` (To + Cc, Task 4);
  - `categorise`, `FILED_FOLDERS` (`services/mail/categorise.py`);
  - `customers.files.safe_name`;
  - `MailMessage` / `MailLabel` / `MailAttachment` (Task 1);
  - `gmail_message`, `fixture` (Task 3).
- Produces (`services.mail.gmail_store`):
  - `FOLDER_LABELS: frozenset` and `CLASSIFY_WINDOW: timedelta` (30 days);
  - `derive(label_ids, *, from_address, own_address) -> dict`, with the keys `folder`, `is_read`, `is_starred`, `is_important` and `archived`;
  - `relabel(connection, row, label_ids, now) -> None`, which saves the derived fields, `label_ids` and `refreshed_at`, and never touches a `muted` state;
  - `store_gmail(connection, full, *, now) -> tuple[MailMessage | None, Email | None]`, where the second element is the Email **filed by this call** (None if nothing new was filed). A `CHAT` message is never stored; a held id is relabelled;
  - `mirror_labels(connection, labels: list[dict]) -> None`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_gmail_store.py`:

```python
"""Gmail mail into the person's store (contract §4): the folder and flags
come from the labels at every store and every change, archive is done and
the Inbox reopens it, muted is never touched, chats are never stored, only
inbox and sent mail is filed, and the label list is mirrored."""

from datetime import timedelta

from django.utils import timezone

from services.customers.models import Email
from services.mail import gmail_store
from services.mail.models import MailAttachment, MailLabel, MailMessage

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture


class DeriveTests(GmailFixture):
    def derive(self, labels, sender="sam@pizzahut.com"):
        return gmail_store.derive(labels, from_address=sender, own_address="dana@acme.io")

    def test_the_folder_rules_in_order(self):
        for labels, folder in (
            (["DRAFT", "TRASH"], "drafts"),
            (["TRASH", "SPAM"], "trash"),
            (["SPAM", "INBOX"], "spam"),
            (["SENT", "INBOX"], "sent"),
            (["INBOX"], "inbox"),
            ([], "inbox"),
        ):
            with self.subTest(labels=labels):
                self.assertEqual(self.derive(labels)["folder"], folder)
        self.assertEqual(self.derive([], sender="Dana@Acme.io")["folder"], "sent")

    def test_flags_and_archive(self):
        self.assertEqual(
            self.derive(["UNREAD", "STARRED", "IMPORTANT", "Label_12"]),
            {
                "folder": "inbox",
                "is_read": False,
                "is_starred": True,
                "is_important": True,
                "archived": True,
            },
        )
        self.assertFalse(self.derive(["INBOX"])["archived"])


class StoreTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.connection = self.google(self.dana)
        self.now = timezone.now()

    def store(self, full):
        return gmail_store.store_gmail(self.connection, full, now=self.now)

    def test_the_recorded_message_is_stored_whole_and_filed(self):
        row, filed = self.store(fixture("message_full.json"))
        self.assertEqual(filed, Email.objects.get())
        self.assertEqual(row.email, filed)
        self.assertEqual(filed.customer, self.pizza)
        self.assertEqual(row.to, [["Dana Ruiz", "dana@acme.io"]])
        self.assertEqual(row.cc, [["Sam Pizza", "sam@pizzahut.com"]])
        self.assertEqual(row.label_ids, ["INBOX", "UNREAD", "IMPORTANT", "Label_12"])
        self.assertEqual((row.folder, row.is_read, row.is_important), ("inbox", False, True))
        self.assertEqual(row.rfc_message_id, "<CAF=quote@mail.gmail.com>")
        self.assertEqual(row.references, "<CAF=first@mail.gmail.com>")
        self.assertIn('src="cid:logo@pizzahut.com"', row.html_body)
        self.assertNotIn("<script", row.html_body)
        self.assertEqual(row.refreshed_at, self.now)
        # The inline logo is recorded for cid: but does not make it "has attachments".
        self.assertTrue(row.has_attachments)
        parts = list(
            row.attachments.order_by("part_id").values_list("part_id", "filename", "is_inline")
        )
        self.assertEqual(parts, [("1", "Renewal quote.pdf", False), ("2", "logo.png", True)])
        self.assertFalse(MailAttachment.objects.get(part_id="1").file)

    def test_only_inline_parts_is_not_has_attachments(self):
        row, _ = self.store(
            gmail_message(
                "i1",
                attachments=[
                    {
                        "filename": "logo.png",
                        "mime_type": "image/png",
                        "size": 9,
                        "inline": True,
                        "content_id": "logo",
                    }
                ],
            )
        )
        self.assertFalse(row.has_attachments)
        self.assertEqual(row.attachments.count(), 1)

    def test_a_filename_is_cleaned_like_an_upload(self):
        row, _ = self.store(
            gmail_message(
                "f1",
                attachments=[
                    {"filename": "../../etc/pass?wd.pdf", "mime_type": "application/pdf", "size": 1}
                ],
            )
        )
        self.assertEqual(row.attachments.get().filename, "passwd.pdf")

    def test_chats_are_never_stored(self):
        self.assertEqual(self.store(gmail_message("c1", labels=["CHAT"])), (None, None))
        self.assertFalse(MailMessage.objects.exists())

    def test_spam_trash_and_drafts_are_kept_but_never_filed(self):
        for gid, labels in (("s1", ["SPAM"]), ("t1", ["TRASH"]), ("d1", ["DRAFT"])):
            row, filed = self.store(gmail_message(gid, labels=labels))
            self.assertIsNone(filed)
            self.assertIsNone(row.email)
        self.assertFalse(Email.objects.exists())

    def test_archived_mail_is_done(self):
        row, _ = self.store(gmail_message("a1", labels=["UNREAD"]))
        self.assertEqual((row.folder, row.state), ("inbox", "done"))

    def test_a_message_id_too_long_to_hold_is_left_blank(self):
        full = gmail_message("l1")
        for header in full["payload"]["headers"]:
            if header["name"] == "Message-ID":
                header["value"] = "<" + "x" * 1000 + "@mail.gmail.com>"
        row, _ = self.store(full)
        self.assertEqual(row.rfc_message_id, "")

    def test_a_held_id_is_relabelled_not_duplicated(self):
        self.store(gmail_message("h1", labels=["INBOX", "UNREAD"]))
        row, filed = self.store(gmail_message("h1", labels=["INBOX"]))
        self.assertIsNone(filed)
        self.assertEqual(MailMessage.objects.count(), 1)
        self.assertTrue(row.is_read)

    def test_mail_filed_on_an_earlier_connection_pass_is_linked_not_filed_again(self):
        first, filed = self.store(gmail_message("r1"))
        first.delete()
        row, again = self.store(gmail_message("r1"))
        self.assertIsNone(again)
        self.assertEqual(row.email, filed)
        self.assertEqual(Email.objects.count(), 1)


class RelabelTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.connection = self.google(self.dana)
        self.now = timezone.now()
        self.row, _ = gmail_store.store_gmail(
            self.connection, gmail_message("m1", labels=["INBOX", "UNREAD"]), now=self.now
        )

    def relabel(self, labels):
        later = self.now + timedelta(minutes=1)
        gmail_store.relabel(self.connection, self.row, labels, later)
        self.row.refresh_from_db()
        return later

    def test_archive_then_back_to_the_inbox_reopens(self):
        self.relabel([])
        self.assertEqual(self.row.state, "done")
        later = self.relabel(["INBOX", "STARRED"])
        self.assertEqual(
            (self.row.state, self.row.is_read, self.row.is_starred), ("open", True, True)
        )
        self.assertEqual((self.row.label_ids, self.row.refreshed_at), (["INBOX", "STARRED"], later))

    def test_muted_is_never_touched(self):
        MailMessage.objects.filter(pk=self.row.pk).update(state="muted")
        self.row.refresh_from_db()
        self.relabel([])
        self.assertEqual(self.row.state, "muted")

    def test_a_change_made_here_does_not_freeze_a_gmail_row(self):
        MailMessage.objects.filter(pk=self.row.pk).update(
            is_starred=True, locally_changed_at=self.now
        )
        self.row.refresh_from_db()
        self.relabel(["INBOX"])
        self.assertFalse(self.row.is_starred)

    def test_a_filed_email_is_never_moved_by_a_later_label(self):
        row, filed = gmail_store.store_gmail(self.connection, gmail_message("f9"), now=self.now)
        gmail_store.relabel(self.connection, row, ["TRASH"], self.now)
        filed.refresh_from_db()
        self.assertEqual(filed.customer, self.pizza)


class MirrorTests(GmailFixture):
    def test_labels_are_created_updated_and_removed(self):
        connection = self.google(self.dana)
        labels = fixture("labels_list.json")["labels"]
        gmail_store.mirror_labels(connection, labels)
        renewals = MailLabel.objects.get(connection=connection, gmail_id="Label_12")
        self.assertEqual(
            (renewals.name, renewals.type, renewals.color_background, renewals.color_text),
            ("Renewals", "user", "#16a766", "#ffffff"),
        )
        self.assertEqual(MailLabel.objects.get(gmail_id="INBOX").type, "system")
        renamed = [
            {**label, "name": "Renewals 2027"} if label["id"] == "Label_12" else label
            for label in labels
            if label["id"] != "Label_19"
        ]
        gmail_store.mirror_labels(connection, renamed)
        self.assertEqual(MailLabel.objects.get(gmail_id="Label_12").name, "Renewals 2027")
        self.assertFalse(MailLabel.objects.filter(gmail_id="Label_19").exists())
        self.assertEqual(MailLabel.objects.filter(connection=connection).count(), len(renamed))
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_gmail_store --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'gmail_store'`.

- [ ] **Step 3: Implement**

Create `services/mail/gmail_store.py`:

```python
"""Gmail mail into the person's own store (contract §4).

For a Google mailbox, Gmail's labels are the truth: the folder, read,
starred and important are derived from `label_ids` at every store and at
every label change, and an archived message (no INBOX, SENT, DRAFT, SPAM or
TRASH) is `done` until Gmail puts it back in a folder. `muted` is
Revenact's own and never touched; `locally_changed_at` does not freeze a
Google row (decision 11). The category is decided once, at first store.
Only mail whose folder is inbox or sent at first store is filed against a
customer, and a filed `customers.Email` is never moved or deleted by a later
label change. Chats are never stored.
"""

from datetime import timedelta

from services.customers.files import safe_name
from services.customers.models import Email

from . import html
from .categorise import FILED_FOLDERS, categorise
from .models import MailAttachment, MailLabel, MailMessage
from .providers.google import parse_gmail_message
from .sync import file_message

FOLDER_LABELS = frozenset({"INBOX", "SENT", "DRAFT", "SPAM", "TRASH"})
#: Filed mail newer than this is classified at store; older waits for the
#: nightly capped pass (decision 17).
CLASSIFY_WINDOW = timedelta(days=30)
#: The fields `relabel` writes.
LABEL_FIELDS = [
    "label_ids",
    "folder",
    "is_read",
    "is_starred",
    "is_important",
    "state",
    "refreshed_at",
]


def derive(label_ids, *, from_address, own_address):
    """The folder and flags Gmail's labels mean, and whether it is archived."""
    labels = set(label_ids or [])
    own = (own_address or "").lower()
    if "DRAFT" in labels:
        folder = MailMessage.Folder.DRAFTS
    elif "TRASH" in labels:
        folder = MailMessage.Folder.TRASH
    elif "SPAM" in labels:
        folder = MailMessage.Folder.SPAM
    elif "SENT" in labels or (from_address or "").lower() == own:
        folder = MailMessage.Folder.SENT
    else:
        folder = MailMessage.Folder.INBOX
    return {
        "folder": folder,
        "is_read": "UNREAD" not in labels,
        "is_starred": "STARRED" in labels,
        "is_important": "IMPORTANT" in labels,
        "archived": not labels & FOLDER_LABELS,
    }


def _state(current, archived):
    if current == MailMessage.State.MUTED:
        return current
    return MailMessage.State.DONE if archived else MailMessage.State.OPEN


def relabel(connection, row, label_ids, now):
    """Gmail changed this message's labels: take them and everything they mean."""
    derived = derive(label_ids, from_address=row.from_address, own_address=connection.address)
    row.state = _state(row.state, derived.pop("archived"))
    for field, value in derived.items():
        setattr(row, field, value)
    row.label_ids = list(label_ids or [])
    row.refreshed_at = now
    row.save(update_fields=LABEL_FIELDS)


def store_gmail(connection, full, *, now):
    """Store one `messages.get?format=full` body as the owner's row, filing it
    against a customer when it belongs to one. Returns (row, the Email this
    call filed or None). A chat is never stored; a held id is relabelled."""
    label_ids = list(full.get("labelIds") or [])
    if "CHAT" in label_ids:
        return None, None
    held = MailMessage.objects.filter(
        connection=connection, provider_message_id=full.get("id", "")
    ).first()
    if held is not None:
        relabel(connection, held, label_ids, now)
        return held, None
    message = parse_gmail_message(full)
    if not message.provider_id:
        return None, None
    own = connection.address.lower()
    derived = derive(label_ids, from_address=message.from_address, own_address=own)
    sent = "SENT" in label_ids or message.from_address == own
    filed = file_message(connection, message) if derived["folder"] in FILED_FOLDERS else None
    # Filed on an earlier pass (a reconnect re-imports): keep the link.
    email = (
        filed
        or Email.objects.filter(
            mailbox=connection, provider_message_id=message.provider_id[:255]
        ).first()
    )
    body = message.body or ""
    row = MailMessage.objects.create(
        connection=connection,
        owner=connection.user,
        organisation=connection.organisation,
        provider_message_id=message.provider_id[:255],
        thread_id=(message.thread_id or "")[:255],
        direction=MailMessage.Direction.SENT if sent else MailMessage.Direction.RECEIVED,
        from_name=(message.from_name or "")[:150],
        from_address=(message.from_address or "")[:254],
        to=[[name, address] for name, address in message.to][:50],
        cc=[[name, address] for name, address in message.cc][:50],
        bcc=[[name, address] for name, address in message.bcc][:50],
        subject=(message.subject or "(no subject)")[:255],
        snippet=" ".join(body.split())[:300],
        body=body,
        html_body=html.sanitise(message.html),
        sent_at=message.date,
        folder=derived["folder"],
        category=categorise(message),
        state=_state(MailMessage.State.OPEN, derived["archived"]),
        is_read=derived["is_read"],
        is_starred=derived["is_starred"],
        is_important=derived["is_important"],
        rfc_message_id=message.rfc_message_id if len(message.rfc_message_id) <= 998 else "",
        references=message.references,
        label_ids=label_ids,
        has_attachments=any(not part["is_inline"] for part in message.attachments),
        refreshed_at=now,
        email=email,
    )
    MailAttachment.objects.bulk_create(
        [
            MailAttachment(
                message=row,
                part_id=part["part_id"][:64],
                gmail_attachment_id=part["attachment_id"],
                filename=safe_name(part["filename"]),
                mime_type=part["mime_type"][:255],
                size=part["size"],
                content_id=part["content_id"][:255],
                is_inline=part["is_inline"],
            )
            for part in message.attachments
        ],
        ignore_conflicts=True,
    )
    return row, filed


def mirror_labels(connection, labels):
    """Make MailLabel match a full `labels.list` (decision 30): new ones are
    created, changed ones updated, and ones Gmail no longer has deleted.
    Labels made here and not yet in Gmail (blank id) are left alone."""
    held = {
        label.gmail_id: label
        for label in MailLabel.objects.filter(connection=connection).exclude(gmail_id="")
    }
    seen, new = set(), []
    for item in labels:
        gmail_id = str(item.get("id", ""))[:255]
        if not gmail_id:
            continue
        seen.add(gmail_id)
        color = item.get("color") or {}
        values = {
            "name": str(item.get("name", ""))[:225],
            "type": MailLabel.Type.SYSTEM if item.get("type") == "system" else MailLabel.Type.USER,
            "color_background": str(color.get("backgroundColor") or "")[:7],
            "color_text": str(color.get("textColor") or "")[:7],
        }
        label = held.get(gmail_id)
        if label is None:
            new.append(MailLabel(connection=connection, gmail_id=gmail_id, **values))
        elif any(getattr(label, field) != value for field, value in values.items()):
            for field, value in values.items():
                setattr(label, field, value)
            label.save()
    MailLabel.objects.bulk_create(new, ignore_conflicts=True)
    gone = set(held) - seen
    if gone:
        MailLabel.objects.filter(connection=connection, gmail_id__in=gone).delete()
```

- [ ] **Step 4: Run them to see them pass**

Run: `venv/bin/python manage.py test services.mail.tests.test_gmail_store --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add services/mail/gmail_store.py services/mail/tests/test_gmail_store.py
git commit -m "$(cat <<'EOF'
feat(mail): derive gmail folders and flags from labels and store mail whole

Gmail's labels decide folder, read, starred, important and done at every
store and change; the Inbox reopens archived mail, muted is never touched,
chats are never stored, and the label list is mirrored.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 6: The gates, the pauses, and no sending through a paused mailbox

**Files:**
- Create: `services/mail/gates.py`
- Modify: `services/mail/views.py` (`_ComposeView.post` :208, `MailReplyView.post` :424)
- Modify: `services/customers/communications_views.py` (`CommunicationsStatsView.get` :115, `EmailReplyView.post` :142)
- Modify: `services/customers/drafts_views.py` (`DraftSendView.post` :198)
- Test: `services/mail/tests/test_gates.py`

**Interfaces:**
- Consumes:
  - `Organisation.gmail_two_way_enabled` and `MailboxConnection.PausedReason` (Task 1);
  - `OrganizationMembership`, `OrganizationDomain`, `billing.SeatAssignment`;
  - `core.audit`.
- Produces (`services.mail.gates`):
  - the code constants `GMAIL_NOT_ENABLED`, `MEMBER_SUSPENDED`, `NO_SEAT`, `NO_VERIFIED_DOMAIN`, `WRONG_DOMAIN`, `SCOPES_MISSING`, `ADDRESS_IN_USE` and `GOOGLE_DENIED`;
  - `MESSAGES: dict[str, str]` and `PAUSED_MESSAGES: dict[str, str]`;
  - `verified_domains(organisation) -> list[str]`;
  - `early_gate(user) -> str | None` (gates 1–3) and `connect_gate(user) -> str | None` (gates 1–4a);
  - `address_gate(organisation, address) -> tuple[str, str] | None`, which returns `(code, message)`;
  - `reason_for(*, stored, enabled, org_status, user_active, membership_id, seated) -> str`;
  - `paused_reason(connection) -> str` (live; `""` when not paused, and always `""` for Outlook, IMAP and disconnected rows);
  - `sweep(*, now=None) -> tuple[int, int]` (paused, resumed);
  - `live_mailbox(user) -> MailboxConnection | None`;
  - `paused_response(connection) -> Response | None`.
- Every send path answers `409 {"code": "MAILBOX_PAUSED", "detail", "paused_reason"}` before any provider call. The paths are `customers/<id>/emails/send/`, `customers/<id>/accounts/<id>/emails/send/`, `mail/messages/<id>/reply/`, `communications/emails/<id>/reply/` and draft Send.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_gates.py`:

```python
"""Who may connect Google and when a Google mailbox is paused (contract §1,
decisions 22-24): the gates in order, the pause precedence computed live and
in bulk, each change audited, and no sending through a paused mailbox."""

from unittest.mock import patch

from django.db import connection as db
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.agents.tests.drafts_fixtures import draft, inbound
from services.agents.tests.fixtures import AgentsFixture
from services.billing.models import SeatAssignment
from services.customers.models import ReplyDraft
from services.identity.models import OrganizationDomain, OrganizationMembership
from services.mail import gates
from services.mail.models import MailboxConnection

from .gmail_fixtures import GmailFixture, google_connection
from .test_mail import FakeProvider


class ConnectGateTests(GmailFixture):
    def fresh(self, user):
        return User.objects.get(pk=user.pk)

    def test_everyone_in_order(self):
        self.assertIsNone(gates.connect_gate(self.fresh(self.dana)))
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.NO_SEAT)
        OrganizationMembership.objects.filter(user=self.dana).update(status="suspended")
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.MEMBER_SUSPENDED)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.GMAIL_NOT_ENABLED)

    def test_a_suspended_workspace_or_an_inactive_person_is_suspended(self):
        Organisation.objects.filter(pk=self.org.pk).update(status="suspended")
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.MEMBER_SUSPENDED)
        Organisation.objects.filter(pk=self.org.pk).update(status="active")
        User.objects.filter(pk=self.dana.pk).update(is_active=False)
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.MEMBER_SUSPENDED)

    def test_no_verified_domain_comes_last(self):
        OrganizationDomain.objects.update(verification_status="pending")
        self.assertEqual(gates.connect_gate(self.fresh(self.dana)), gates.NO_VERIFIED_DOMAIN)
        self.assertIsNone(gates.early_gate(self.fresh(self.dana)))

    def test_the_address_must_be_on_a_verified_domain_exactly(self):
        OrganizationDomain.objects.create(
            organisation=self.org, domain="acme.co.uk", verification_status="verified"
        )
        OrganizationDomain.objects.create(
            organisation=self.org, domain="acme.dev", verification_status="pending"
        )
        self.assertIsNone(gates.address_gate(self.org, "dana@ACME.io"))
        for address in ("dana@eu.acme.io", "dana@gmail.com", "dana@acme.dev", "nobody"):
            with self.subTest(address=address):
                self.assertEqual(
                    gates.address_gate(self.org, address),
                    (gates.WRONG_DOMAIN, "Connect your acme.co.uk or acme.io account."),
                )
        OrganizationDomain.objects.update(verification_status="revoked")
        self.assertEqual(
            gates.address_gate(self.org, "dana@acme.io"),
            (gates.NO_VERIFIED_DOMAIN, gates.MESSAGES[gates.NO_VERIFIED_DOMAIN]),
        )


class PauseTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)

    def live(self):
        return gates.paused_reason(MailboxConnection.objects.get(pk=self.mailbox.pk))

    def test_the_precedence(self):
        args = dict(
            enabled=True, org_status="active", user_active=True, membership_id=1, seated=True
        )
        self.assertEqual(gates.reason_for(stored="", **args), "")
        self.assertEqual(gates.reason_for(stored="", **{**args, "seated": False}), "no_seat")
        self.assertEqual(
            gates.reason_for(stored="", **{**args, "membership_id": None, "seated": False}),
            "suspended",
        )
        self.assertEqual(
            gates.reason_for(stored="", **{**args, "org_status": "archived"}), "suspended"
        )
        self.assertEqual(gates.reason_for(stored="", **{**args, "user_active": False}), "suspended")
        self.assertEqual(
            gates.reason_for(stored="", **{**args, "enabled": False, "user_active": False}),
            "workspace_off",
        )
        self.assertEqual(
            gates.reason_for(stored="token_revoked", **{**args, "enabled": False}), "token_revoked"
        )

    def test_live_reasons(self):
        self.assertEqual(self.live(), "")
        SeatAssignment.objects.filter(membership__user=self.dana).update(released_at=timezone.now())
        self.assertEqual(self.live(), "no_seat")
        OrganizationMembership.objects.filter(user=self.dana).update(status="revoked")
        self.assertEqual(self.live(), "suspended")
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(self.live(), "workspace_off")

    def test_outlook_imap_and_disconnected_rows_are_never_paused(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.assertEqual(gates.paused_reason(self.connect(self.carl)), "")
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        self.assertEqual(self.live(), "")
        self.assertIsNone(gates.live_mailbox(User.objects.get(pk=self.dana.pk)))

    def test_the_sweep_writes_audits_and_wakes_on_resume(self):
        carl = self.google(self.carl)
        revoked = self.google(self.alice, paused_reason="token_revoked", status="error")
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        with CaptureQueriesContext(db) as queries:
            self.assertEqual(gates.sweep(), (2, 0))
        self.assertLessEqual(
            len([q for q in queries.captured_queries if "audit" not in q["sql"]]), 8
        )
        self.assertEqual(
            set(MailboxConnection.objects.values_list("pk", "paused_reason")),
            {
                (self.mailbox.pk, "workspace_off"),
                (carl.pk, "workspace_off"),
                (revoked.pk, "token_revoked"),
            },
        )
        event = AuditEvent.objects.filter(action="mailbox.paused").first()
        self.assertEqual(
            (event.actor, event.organisation, event.metadata),
            (None, self.org, {"reason": "workspace_off"}),
        )
        self.assertEqual(gates.sweep(), (0, 0))

        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=True)
        self.assertEqual(gates.sweep(), (0, 2))
        self.mailbox.refresh_from_db()
        self.assertEqual(self.mailbox.paused_reason, "")
        self.assertIsNotNone(self.mailbox.wake_at)
        self.assertEqual(
            AuditEvent.objects.filter(action="mailbox.resumed").first().metadata,
            {"from": "workspace_off"},
        )
        revoked.refresh_from_db()
        self.assertEqual(revoked.paused_reason, "token_revoked")


class PausedSendTests(GmailFixture):
    """A paused Google mailbox never acts as the person (decision 24)."""

    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.client.force_authenticate(self.dana)
        FakeProvider.sent = []
        patcher = patch("services.mail.sync.get_provider", return_value=FakeProvider())
        patcher.start()
        self.addCleanup(patcher.stop)

    def assertPaused(self, response):
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(
            response.data,
            {
                "code": "MAILBOX_PAUSED",
                "detail": "Your Gmail connection is paused: your workspace isn't enabled for Gmail.",
                "paused_reason": "workspace_off",
            },
        )
        self.assertEqual(FakeProvider.sent, [])

    def test_compose_and_both_replies(self):
        body = {"to": ["sam@pizzahut.com"], "subject": "Hi", "body": "x"}
        self.assertPaused(
            self.client.post(f"/api/v1/customers/{self.pizza.id}/emails/send/", body, format="json")
        )
        self.assertPaused(
            self.client.post(
                f"/api/v1/customers/{self.pizza.id}/accounts/{self.apac.id}/emails/send/",
                body,
                format="json",
            )
        )
        from services.mail.models import MailMessage

        row = MailMessage.objects.create(
            connection=self.mailbox,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="g1",
            direction="received",
            from_address="sam@pizzahut.com",
            subject="Hi",
            sent_at=timezone.now(),
        )
        self.assertPaused(
            self.client.post(
                f"/api/v1/mail/messages/{row.id}/reply/", {"body": "ok"}, format="json"
            )
        )
        email = self.email(self.dana, from_address="sam@pizzahut.com", mailbox=self.mailbox)
        self.assertPaused(
            self.client.post(
                f"/api/v1/communications/emails/{email.id}/reply/", {"body": "ok"}, format="json"
            )
        )

    def test_the_stats_tile_knows_a_disconnected_mailbox_is_none(self):
        url = "/api/v1/communications/stats/"
        self.assertTrue(self.client.get(url).data["has_mailbox"])
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(status="disconnected")
        # A real request loads the user afresh; the test's user caches `mailbox`.
        self.client.force_authenticate(User.objects.get(pk=self.dana.pk))
        self.assertFalse(self.client.get(url).data["has_mailbox"])


class PausedDraftSendTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.connection = google_connection(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)

    def test_a_draft_is_never_claimed_through_a_paused_mailbox(self):
        # The workspace is not switched on: the mailbox is paused (workspace_off).
        mine = draft(self.mail, self.csm)
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            response = self.client_for(self.csm).post(
                f"/api/v1/communications/drafts/{mine.pk}/send/", {}, format="json"
            )
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "MAILBOX_PAUSED")
        mine.refresh_from_db()
        self.assertEqual(mine.status, ReplyDraft.Status.OPEN)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_gates --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'gates' from 'services.mail'`.

- [ ] **Step 3: The gates module**

Create `services/mail/gates.py`:

```python
"""Who may connect Google, and when a Google mailbox is paused.

Connecting (contract §1) takes four gates, checked in order: the workspace
is switched on (the pilot approval), the person is an active member of an
active workspace, they hold a seat, and the address Google returns is on one
of the workspace's verified domains, exactly. Gates 1-3 and "has a verified
domain" run before OAuth and again in the callback.

A connected Google mailbox is paused, never deleted, when any of these stops
holding: precedence token_revoked, workspace_off, suspended, no_seat
(decision 23). The loop recomputes every pause in bulk once a minute
(`sweep`); the API computes the person's own live (`paused_reason`). A
paused mailbox is not synced and cannot send (decision 24). Outlook and IMAP
have no gates in this round.
"""

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from core import audit
from services.accounts.models import Organisation
from services.billing.models import SeatAssignment
from services.identity.models import OrganizationDomain, OrganizationMembership

from .models import MailboxConnection

GMAIL_NOT_ENABLED = "GMAIL_NOT_ENABLED"
MEMBER_SUSPENDED = "MEMBER_SUSPENDED"
NO_SEAT = "NO_SEAT"
NO_VERIFIED_DOMAIN = "NO_VERIFIED_DOMAIN"
WRONG_DOMAIN = "WRONG_DOMAIN"
SCOPES_MISSING = "SCOPES_MISSING"
ADDRESS_IN_USE = "ADDRESS_IN_USE"
GOOGLE_DENIED = "GOOGLE_DENIED"

MESSAGES = {
    GMAIL_NOT_ENABLED: "Your workspace isn't enabled for Gmail yet: ask Revenact support.",
    MEMBER_SUSPENDED: "Your access to this workspace is suspended, so Gmail can't be connected.",
    NO_SEAT: "You need a seat in this workspace to connect Gmail. Ask an admin.",
    NO_VERIFIED_DOMAIN: (
        "Your workspace has no verified domain yet, so no Google account can connect. "
        "An admin can verify one in Settings."
    ),
    SCOPES_MISSING: (
        "Revenact needs all the Gmail permissions on the consent screen. "
        "Connect again and leave them all ticked."
    ),
    ADDRESS_IN_USE: "This Google account is already connected by someone else in Revenact.",
    GOOGLE_DENIED: (
        "Google didn't grant access. Either you cancelled, or this Google account isn't on "
        "Revenact's test-user list yet: ask Revenact support."
    ),
}

Paused = MailboxConnection.PausedReason
PAUSED_MESSAGES = {
    Paused.WORKSPACE_OFF: "Your Gmail connection is paused: your workspace isn't enabled for Gmail.",
    Paused.SUSPENDED: "Your Gmail connection is paused: your access to this workspace is suspended.",
    Paused.NO_SEAT: "Your Gmail connection is paused: you don't hold a seat in this workspace.",
    Paused.TOKEN_REVOKED: "Your Gmail connection is paused: Google access was revoked. Reconnect Google.",
}
GOOGLE = MailboxConnection.Provider.GOOGLE
DISCONNECTED = MailboxConnection.Status.DISCONNECTED
ACTIVE = OrganizationMembership.Status.ACTIVE


def _membership_id(user_id, organisation_id):
    """The person's active membership in this workspace, or None. Read
    directly, not through identity.context (memoised per user instance), so
    the bulk sweep below and this agree row for row."""
    return (
        OrganizationMembership.objects.filter(
            user_id=user_id, organisation_id=organisation_id, status=ACTIVE
        )
        .values_list("pk", flat=True)
        .first()
    )


def _seated(membership_id):
    return SeatAssignment.objects.filter(
        membership_id=membership_id, released_at__isnull=True
    ).exists()


def verified_domains(organisation):
    return list(
        OrganizationDomain.objects.filter(
            organisation=organisation,
            verification_status=OrganizationDomain.VerificationStatus.VERIFIED,
        )
        .order_by("domain")
        .values_list("domain", flat=True)
    )


def early_gate(user):
    """Gates 1-3: the first failing code, or None."""
    # SOC2:AUTH-02 only an approved workspace's active, seated members connect Google
    organisation = getattr(user, "organisation", None)
    if organisation is None or not organisation.gmail_two_way_enabled:
        return GMAIL_NOT_ENABLED
    membership_id = _membership_id(user.pk, organisation.pk)
    if (
        not user.is_active
        or organisation.status != Organisation.Status.ACTIVE
        or membership_id is None
    ):
        return MEMBER_SUSPENDED
    if not _seated(membership_id):
        return NO_SEAT
    return None


def connect_gate(user):
    """Every pre-OAuth gate (1-3 and 4a): the first failing code, or None."""
    code = early_gate(user)
    if code is None and not verified_domains(user.organisation):
        return NO_VERIFIED_DOMAIN
    return code


def address_gate(organisation, address):
    """Gate 4b: (code, message) when `address` is not on a verified domain of
    the workspace, exactly (a subdomain is not its parent); else None."""
    domains = verified_domains(organisation)
    if not domains:
        return NO_VERIFIED_DOMAIN, MESSAGES[NO_VERIFIED_DOMAIN]
    domain = address.rsplit("@", 1)[-1].lower() if "@" in address else ""
    if domain in {d.lower() for d in domains}:
        return None
    return WRONG_DOMAIN, f"Connect your {' or '.join(domains[:3])} account."


def reason_for(*, stored, enabled, org_status, user_active, membership_id, seated):
    """The pause precedence (decision 23); "" when nothing holds it."""
    if stored == Paused.TOKEN_REVOKED:
        return Paused.TOKEN_REVOKED
    if not enabled:
        return Paused.WORKSPACE_OFF
    if not user_active or membership_id is None or org_status != Organisation.Status.ACTIVE:
        return Paused.SUSPENDED
    if not seated:
        return Paused.NO_SEAT
    return ""


def paused_reason(connection):
    """This Google mailbox's pause, computed live; "" for Outlook, IMAP and
    a disconnected row."""
    if connection.provider != GOOGLE or connection.status == DISCONNECTED:
        return ""
    organisation = Organisation.objects.only("gmail_two_way_enabled", "status").get(
        pk=connection.organisation_id
    )
    membership_id = _membership_id(connection.user_id, connection.organisation_id)
    return reason_for(
        stored=connection.paused_reason,
        enabled=organisation.gmail_two_way_enabled,
        org_status=organisation.status,
        user_active=connection.user.is_active,
        membership_id=membership_id,
        seated=membership_id is not None and _seated(membership_id),
    )


def sweep(*, now=None):
    """Recompute the pause of every live Google mailbox not revoked, in a few
    queries; write and audit each change, and wake a resumed one so it syncs
    straight away. token_revoked is cleared only by reconnecting. Returns
    (paused, resumed)."""
    now = now or timezone.now()
    rows = list(
        MailboxConnection.objects.filter(provider=GOOGLE)
        .exclude(status=DISCONNECTED)
        .exclude(paused_reason=Paused.TOKEN_REVOKED)
        .select_related("organisation", "user")
    )
    if not rows:
        return 0, 0
    members = {
        (user_id, organisation_id): pk
        for pk, user_id, organisation_id in OrganizationMembership.objects.filter(
            status=ACTIVE, user_id__in={row.user_id for row in rows}
        ).values_list("pk", "user_id", "organisation_id")
    }
    seated = set(
        SeatAssignment.objects.filter(
            released_at__isnull=True, membership_id__in=list(members.values())
        ).values_list("membership_id", flat=True)
    )
    paused = resumed = 0
    for row in rows:
        membership_id = members.get((row.user_id, row.organisation_id))
        reason = reason_for(
            stored=row.paused_reason,
            enabled=row.organisation.gmail_two_way_enabled,
            org_status=row.organisation.status,
            user_active=row.user.is_active,
            membership_id=membership_id,
            seated=membership_id in seated,
        )
        if reason == row.paused_reason:
            continue
        if reason:
            MailboxConnection.objects.filter(pk=row.pk).update(paused_reason=reason)
            paused += 1
            audit.record(  # SOC2:LOG-01 sync and sending stop for this mailbox
                "mailbox.paused",
                organisation=row.organisation,
                target=row,
                metadata={"reason": reason},
            )
        else:
            MailboxConnection.objects.filter(pk=row.pk).update(paused_reason="", wake_at=now)
            resumed += 1
            audit.record(  # SOC2:LOG-01
                "mailbox.resumed",
                organisation=row.organisation,
                target=row,
                metadata={"from": row.paused_reason},
            )
    return paused, resumed


def live_mailbox(user):
    """The person's connection, or None: no row, or a disconnected Google row
    kept only so its copies outlive the disconnect for 30 days."""
    connection = getattr(user, "mailbox", None)
    if connection is None or connection.status == DISCONNECTED:
        return None
    return connection


def paused_response(connection):
    """409 MAILBOX_PAUSED when this Google mailbox may not act for its owner;
    None otherwise. Checked before any provider call."""
    reason = paused_reason(connection)
    if not reason:
        return None
    return Response(
        {"code": "MAILBOX_PAUSED", "detail": PAUSED_MESSAGES[reason], "paused_reason": reason},
        status=status.HTTP_409_CONFLICT,
    )
```

- [ ] **Step 4: The send paths**

In `services/mail/views.py`, add `from . import gates, providers` in place of `from . import providers`.

In `_ComposeView.post`, replace the first three lines (`connection = getattr(...)` through the `return Response(... "Connect your mailbox ...")` block) with:

```python
        connection = gates.live_mailbox(request.user)
        if connection is None:
            return Response(
                {"detail": "Connect your mailbox in Settings › Integrations to send email."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        refused = gates.paused_response(connection)
        if refused is not None:
            return refused
```

In `MailReplyView.post`, replace `connection = getattr(request.user, "mailbox", None)` with `connection = gates.live_mailbox(request.user)`. After the existing `if connection is None or connection.id != message.connection_id:` block, add:

```python
        refused = gates.paused_response(connection)
        if refused is not None:
            return refused
```

In `services/customers/communications_views.py`, add `from services.mail import gates`. In `CommunicationsStatsView.get`, replace the `has_mailbox` line with:

```python
        payload["has_mailbox"] = gates.live_mailbox(request.user) is not None
```

In `EmailReplyView.post`, replace `connection = getattr(request.user, "mailbox", None)` with `connection = gates.live_mailbox(request.user)`. After its `if connection is None:` block, add:

```python
        refused = gates.paused_response(connection)
        if refused is not None:
            return refused
```

In `services/customers/drafts_views.py`, add `from services.mail import gates`. In `DraftSendView.post`, replace:

```python
            connection = MailboxConnection.objects.filter(user_id=request.user.pk).first()
            if connection is None or connection.status != MailboxConnection.Status.CONNECTED:
```

with:

```python
            connection = MailboxConnection.objects.filter(user_id=request.user.pk).first()
            # A paused Gmail never sends, and the draft is never claimed
            # (decision 24); token_revoked answers this too, not NO_MAILBOX.
            refused = gates.paused_response(connection) if connection is not None else None
            if refused is not None:
                return refused
            if connection is None or connection.status != MailboxConnection.Status.CONNECTED:
```

(The edit made before it commits with the atomic block, as `NO_MAILBOX` does.)

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail services.customers.tests.test_drafts_send services.customers.tests.test_drafts_sending services.customers.tests.test_drafts_unconfirmed services.customers.tests.test_communications services.customers.tests.test_communications_reply services.customers.tests.test_communications_drafts --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/mail/gates.py services/mail/views.py services/customers/communications_views.py \
  services/customers/drafts_views.py services/mail/tests/test_gates.py
git commit -m "$(cat <<'EOF'
feat(mail): gate google connections and pause mailboxes that lose them

Workspace switch, active membership, seat and an exact verified domain;
the pause precedence is computed live and swept in bulk with each change
audited, and a paused Gmail answers 409 MAILBOX_PAUSED on every send path
before any provider call.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 7: Connecting Google: gates before OAuth, the callback, reconnect and replace

**Files:**
- Create: `services/mail/gmail_sync.py` (its first piece: `IMPORT_FIELDS`, `start_import`)
- Modify: `services/mail/views.py` (imports; `_back_to_settings` :47; `ConnectView.post` :87; `_save_connection` :127; `OAuthCallbackView.get` :151; new `_replace`, `_refuse`, `_google_callback`, `_save_google`)
- Modify: `services/mail/tests/test_mail.py` (delete `ConnectionTests.test_the_oauth_round_trip_trusts_only_the_signed_state`, :320-358. Its cases move to `test_connect.py`)
- Test: `services/mail/tests/test_connect.py`

**Interfaces:**
- Consumes:
  - `gates.connect_gate`, `early_gate`, `address_gate`, `MESSAGES` and the codes (Task 6);
  - `GoogleProvider.exchange_code` → `Credentials.scopes`, `GmailSession.profile`, `revoke` (Task 3);
  - `scopes.is_two_way`, `short_names` (Task 1);
  - `FakeGmail`, `GmailFixture.use_gmail` (Task 3).
- Produces:
  - `services.mail.gmail_sync.IMPORT_FIELDS: list[str]`;
  - `services.mail.gmail_sync.start_import(connection, profile: dict, now) -> None`. It sets the import bounds, the estimate, the token and `done_at`, and does not save.
  - `POST mail/connect/google/` answers `403 {"code", "detail"}` for a failing pre-OAuth gate.
  - The callback redirects to `${FRONTEND_URL}/integrations?mailbox=connected|refused|error[&code=][&detail=]`.
  - `services.mail.views._replace(request, user, existing) -> None` (used by Task 11 too).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_connect.py`:

```python
"""Connecting Google (contract §1): the gates refuse before OAuth and again
in the callback; a partial grant, a wrong domain or an address someone else
holds is refused and the grant revoked; a reconnect resumes the kept row and
its copies; a different address or provider replaces it."""

from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.core import signing
from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.customers.models import Email
from services.identity.models import OrganizationDomain
from services.mail import gates, scopes
from services.mail.models import MailboxConnection, MailMessage
from services.mail.views import STATE_SALT

from .gmail_fake import gmail_message
from .gmail_fixtures import GmailFixture

CALLBACK = "/api/v1/mail/oauth/google/callback/"


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID="cid", GOOGLE_OAUTH_CLIENT_SECRET="sec", FRONTEND_URL="https://app.test"
)
class ConnectGoogleTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()

    def as_dana(self):
        self.client.force_authenticate(User.objects.get(pk=self.dana.pk))

    def back(self, query="code=xyz", user=None):
        """Google sends the browser back; where Revenact then sends it."""
        state = signing.dumps(
            {"user": (user or self.dana).id, "provider": "google"}, salt=STATE_SALT
        )
        self.client.force_authenticate(None)
        response = self.client.get(f"{CALLBACK}?{query}&state={state}")
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response["Location"].startswith("https://app.test/integrations?"))
        return {k: v[0] for k, v in parse_qs(urlsplit(response["Location"]).query).items()}

    # -- before OAuth -----------------------------------------------------
    def test_a_failing_gate_answers_before_oauth_and_is_not_audited(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.as_dana()
        response = self.client.post("/api/v1/mail/connect/google/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.data,
            {"code": "GMAIL_NOT_ENABLED", "detail": gates.MESSAGES["GMAIL_NOT_ENABLED"]},
        )
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=True)
        OrganizationDomain.objects.update(verification_status="pending")
        self.as_dana()
        self.assertEqual(
            self.client.post("/api/v1/mail/connect/google/").data["code"], "NO_VERIFIED_DOMAIN"
        )
        self.assertFalse(AuditEvent.objects.filter(action__startswith="mailbox.").exists())

    def test_the_authorize_url_asks_for_the_three_gmail_scopes(self):
        self.as_dana()
        url = self.client.post("/api/v1/mail/connect/google/").data["authorize_url"]
        asked = parse_qs(urlsplit(url).query)["scope"][0].split()
        self.assertEqual(asked, list(scopes.REQUESTED))

    # -- the callback -----------------------------------------------------
    def test_a_full_grant_on_a_verified_address_connects_and_starts_the_import(self):
        self.fake.add(gmail_message("old1"), quietly=True)
        self.assertEqual(self.back(), {"mailbox": "connected"})
        c = MailboxConnection.objects.get(user=self.dana)
        self.assertEqual((c.provider, c.address, c.status), ("google", "dana@acme.io", "connected"))
        self.assertTrue(c.two_way)
        self.assertEqual((c.history_id, c.import_total_estimate), (self.fake.history_id, 1))
        self.assertEqual((c.import_before - c.import_after).days, 365)
        self.assertEqual(
            (c.import_page_token, c.import_done_at, c.reconcile_started_at), ("", None, None)
        )
        self.assertIsNotNone(c.wake_at)
        self.assertEqual(c.get_credentials()["refresh_token"], "fake-refresh")
        event = AuditEvent.objects.get(action="mailbox.connect")
        self.assertEqual(event.actor, self.dana)
        self.assertEqual(
            event.metadata,
            {
                "provider": "google",
                "address": "dana@acme.io",
                "scopes": ["gmail.modify", "gmail.send", "gmail.compose"],
                "two_way": True,
            },
        )

    def test_a_partial_grant_is_refused_revoked_and_never_reads_the_mailbox(self):
        self.fake.granted_scope = f"{scopes.MODIFY} openid"
        self.assertEqual(
            self.back(),
            {
                "mailbox": "refused",
                "code": "SCOPES_MISSING",
                "detail": gates.MESSAGES["SCOPES_MISSING"],
            },
        )
        self.assertEqual(self.fake.revoked, ["fake-refresh"])
        self.assertFalse(MailboxConnection.objects.exists())
        self.assertFalse(any(where.endswith("/profile") for _, where, _ in self.fake.calls))
        event = AuditEvent.objects.get(action="mailbox.connect_refused")
        self.assertEqual(
            (event.outcome, event.actor, event.metadata),
            ("failure", self.dana, {"provider": "google", "code": "SCOPES_MISSING"}),
        )

    def test_an_address_off_the_verified_domains_is_refused_naming_them(self):
        for address in ("dana@gmail.com", "dana@eu.acme.io"):
            with self.subTest(address=address):
                self.fake.address = address
                self.fake.revoked = []
                self.assertEqual(
                    self.back(),
                    {
                        "mailbox": "refused",
                        "code": "WRONG_DOMAIN",
                        "detail": "Connect your acme.io account.",
                    },
                )
                self.assertEqual(self.fake.revoked, ["fake-refresh"])
        events = AuditEvent.objects.filter(action="mailbox.connect_refused")
        self.assertEqual({e.metadata["domain"] for e in events}, {"gmail.com", "eu.acme.io"})
        self.assertNotIn("dana@", str([e.metadata for e in events]))
        self.assertFalse(MailboxConnection.objects.exists())

    def test_an_address_someone_else_holds_is_refused(self):
        self.google(self.carl, "dana@acme.io")
        landed = self.back()
        self.assertEqual((landed["mailbox"], landed["code"]), ("refused", "ADDRESS_IN_USE"))
        self.assertEqual(self.fake.revoked, ["fake-refresh"])
        self.assertFalse(MailboxConnection.objects.filter(user=self.dana).exists())

    def test_the_gates_run_again_before_the_code_is_exchanged(self):
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        landed = self.back()
        self.assertEqual((landed["mailbox"], landed["code"]), ("refused", "GMAIL_NOT_ENABLED"))
        self.assertEqual(self.fake.calls, [])

    def test_google_saying_no_is_explained(self):
        response = self.client.get(f"{CALLBACK}?error=access_denied&state=x")
        landed = {k: v[0] for k, v in parse_qs(urlsplit(response["Location"]).query).items()}
        self.assertEqual(
            landed,
            {
                "mailbox": "refused",
                "code": "GOOGLE_DENIED",
                "detail": gates.MESSAGES["GOOGLE_DENIED"],
            },
        )

    def test_a_forged_state_is_an_error(self):
        response = self.client.get(f"{CALLBACK}?code=xyz&state=forged")
        self.assertIn("mailbox=error", response["Location"])
        self.assertFalse(MailboxConnection.objects.exists())

    # -- reconnect and replace ----------------------------------------------
    def kept(self, address="dana@acme.io", **fields):
        row = self.google(
            self.dana,
            address,
            status="disconnected",
            disconnected_at=timezone.now(),
            granted_scopes=[scopes.SEND],
            **fields,
        )
        MailboxConnection.objects.filter(pk=row.pk).update(credentials="")
        MailMessage.objects.create(
            connection=row,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="k1",
            direction="received",
            subject="Kept",
            sent_at=timezone.now(),
        )
        return row

    def test_reconnecting_the_same_address_resumes_the_kept_row(self):
        row = self.kept()
        self.assertEqual(self.back(), {"mailbox": "connected"})
        again = MailboxConnection.objects.get(user=self.dana)
        self.assertEqual(
            (again.pk, again.status, again.disconnected_at), (row.pk, "connected", None)
        )
        self.assertIsNotNone(again.reconcile_started_at)
        self.assertEqual(again.messages.count(), 1)
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.connect").exists())
        self.assertTrue(AuditEvent.objects.filter(action="mailbox.reconnect").exists())
        changed = AuditEvent.objects.get(action="mailbox.scopes_changed")
        self.assertEqual(
            changed.metadata,
            {"from": ["gmail.send"], "to": ["gmail.modify", "gmail.send", "gmail.compose"]},
        )

    def test_a_different_address_replaces_the_kept_row_and_its_copies(self):
        old = self.kept("old@acme.io")
        filed = self.email(self.dana, mailbox=old)
        self.assertEqual(self.back(), {"mailbox": "connected"})
        self.assertFalse(MailboxConnection.objects.filter(pk=old.pk).exists())
        self.assertFalse(MailMessage.objects.exists())
        filed.refresh_from_db()
        self.assertIsNone(filed.mailbox)
        gone = AuditEvent.objects.get(action="mailbox.disconnect")
        self.assertEqual(
            gone.metadata,
            {
                "provider": "google",
                "address": "old@acme.io",
                "revoked": False,
                "delete_after": None,
            },
        )
        self.assertTrue(AuditEvent.objects.filter(action="mailbox.connect").exists())

    def test_imap_over_a_kept_google_row_replaces_it(self):
        self.kept()
        self.as_dana()
        with patch("services.mail.providers.imap.ImapProvider._imap") as login:
            login.return_value.__enter__ = lambda s: s
            login.return_value.__exit__ = lambda s, *a: None
            response = self.client.post(
                "/api/v1/mail/connect/imap/",
                {
                    "address": "dana@acme.io",
                    "password": "x",
                    "imap_host": "i.acme.io",
                    "smtp_host": "s.acme.io",
                },
                format="json",
            )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(MailboxConnection.objects.get(user=self.dana).provider, "imap")
        self.assertFalse(MailMessage.objects.exists())
        self.assertEqual(Email.objects.count(), 0)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_connect --parallel auto --noinput`
Expected: FAIL. `connect/google/` answers 200 with the workspace off, the callback answers `connected` for every refusal case, and `test_imap_over_a_kept_google_row_replaces_it` keeps the copy.

- [ ] **Step 3: The import's start**

Create `services/mail/gmail_sync.py`:

```python
"""One Gmail mailbox, brought up to date (contract §5).

The loop (services/mail/loop.py) claims a due mailbox and calls `tick`: the
label list, history since `history_id` (or a 30-day re-list when Gmail no
longer has history that old), one page of the reconcile, one page of the
12-month import, and the push watch. Every write to the connection names
its fields: push and the gate sweep write to the same row concurrently.
"""

from datetime import timedelta

from django.conf import settings

#: The fields `start_import` sets.
IMPORT_FIELDS = [
    "import_after",
    "import_before",
    "import_total_estimate",
    "import_page_token",
    "import_done_at",
]


def start_import(connection, profile, now):
    """Begin the 12-month backfill: from MAIL_IMPORT_MONTHS ago up to now
    (anything newer arrives through history). The estimate is the whole
    mailbox's messagesTotal (decision 16). Does not save."""
    connection.import_before = now
    connection.import_after = now - timedelta(days=round(settings.MAIL_IMPORT_MONTHS * 365.25 / 12))
    connection.import_total_estimate = profile.get("messagesTotal")
    connection.import_page_token = ""
    connection.import_done_at = None
```

- [ ] **Step 4: The views**

In `services/mail/views.py`, change the imports to:

```python
from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import get_object_or_404
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core import audit
from core.models import AuditEvent
from services.customers.scoping import get_visible_account, get_visible_customer
from services.customers.serializers import EmailSerializer

from . import gates, gmail_sync, providers, scopes
from .models import MailboxConnection, MailMessage
from .providers.base import ProviderError
from .providers.google import GmailSession, revoke
from .serializers import (
    ComposeSerializer,
    MailboxConnectionSerializer,
    MailMessageDetailSerializer,
    MailMessageSerializer,
    MailMessageUpdateSerializer,
    ReplySerializer,
)
from .sync import NothingToReplyTo, reply_to, send_email, sync_mailbox

STATE_SALT = "mail.oauth"
STATE_MAX_AGE = 15 * 60
GOOGLE = MailboxConnection.Provider.GOOGLE
CONNECTED = MailboxConnection.Status.CONNECTED
DISCONNECTED = MailboxConnection.Status.DISCONNECTED
```

Replace `_back_to_settings` with:

```python
def _back_to_settings(outcome, detail="", code=""):
    """The browser's way back to Integrations: `?mailbox=connected|refused|
    error`, a refusal's `code`, and at most 200 characters of `detail`."""
    from urllib.parse import urlencode

    query = {"mailbox": outcome}
    if code:
        query["code"] = code
    if detail:
        query["detail"] = detail[:200]
    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/integrations?{urlencode(query)}")
```

In `ConnectView.post`, after the `if not provider.configured(): ...` block, add:

```python
        if provider_key == GOOGLE:
            code = gates.connect_gate(request.user)
            if code is not None:
                # Not audited: no credential was touched.
                return Response(
                    {"code": code, "detail": gates.MESSAGES[code]}, status=status.HTTP_403_FORBIDDEN
                )
```

In the same method, change `connection = _save_connection(request.user, provider_key, creds)` to `connection = _save_connection(request, request.user, provider_key, creds)`.

Replace `_save_connection` with:

```python
def _replace(request, user, existing):
    """Delete the person's current row before a different one takes its
    place: its personal copies go with it, the filed Email rows stay with
    their mailbox nulled. A Google grant still held is revoked."""
    revoked = False
    if existing.is_google and existing.credentials:
        try:
            token = existing.get_credentials().get("refresh_token", "")
        except ValueError:
            token = ""
        revoked = revoke(token)
    audit.record(  # SOC2:LOG-01 a credential is being removed
        "mailbox.disconnect",
        request=request,
        actor=user,
        target=existing,
        metadata={
            "provider": existing.provider,
            "address": existing.address,
            "revoked": revoked,
            "delete_after": None,
        },
    )
    existing.delete()


def _save_connection(request, user, provider_key, creds):
    """Outlook and IMAP: the person's row updated in place, as today, unless
    it is a different provider's or address's, or a disconnected Google row:
    that one is replaced (contract decision 9)."""
    existing = MailboxConnection.objects.filter(user=user).first()
    if existing is not None and (
        existing.status == DISCONNECTED
        or existing.provider != provider_key
        or existing.address != creds.address
    ):
        _replace(request, user, existing)
    connection, _ = MailboxConnection.objects.update_or_create(
        user=user,
        defaults={
            "organisation": user.organisation,
            "provider": provider_key,
            "address": creds.address,
            "display_name": creds.display_name or user.name,
            "status": CONNECTED,
            "error": "",
            "sync_cursor": "",
        },
    )
    connection.set_credentials(creds.data)
    connection.save(update_fields=["credentials"])
    return connection
```

In `OAuthCallbackView.get`, replace the opening `if request.query_params.get("error"): ...` block with:

```python
        error = request.query_params.get("error")
        if error:
            if provider_key == GOOGLE and error == "access_denied":
                return _back_to_settings(
                    "refused", gates.MESSAGES[gates.GOOGLE_DENIED], code=gates.GOOGLE_DENIED
                )
            return _back_to_settings("error", request.query_params.get("error_description", "denied"))
```

After `if user is None: return _back_to_settings("error", "Unknown user.")`, add:

```python
        if provider_key == GOOGLE:
            return _google_callback(request, user)
```

Then change the remaining Microsoft path's `_save_connection(user, provider_key, creds)` to `_save_connection(request, user, provider_key, creds)`.

After `OAuthCallbackView`, add:

```python
def _refuse(request, user, code, *, detail="", domain="", token=""):
    """A gate said no once the person was back from Google: revoke what
    Google just issued, store nothing, and say why."""
    if token:
        revoke(token)
    metadata = {"provider": GOOGLE, "code": code}
    if domain:
        metadata["domain"] = domain
    audit.record(  # SOC2:LOG-01 the domain only, never the full address
        "mailbox.connect_refused",
        request=request,
        actor=user,
        outcome=AuditEvent.Outcome.FAILURE,
        metadata=metadata,
    )
    return _back_to_settings("refused", detail or gates.MESSAGES[code], code=code)


def _google_callback(request, user):
    """Contract §1 "The order of the work", steps 2-7."""
    code = gates.early_gate(user)
    if code is not None:
        return _refuse(request, user, code)
    try:
        creds = providers.get_provider(GOOGLE).exchange_code(
            request.query_params.get("code", ""), _redirect_uri(request, GOOGLE)
        )
    except ProviderError as exc:
        return _back_to_settings("error", str(exc))
    token = creds.data.get("refresh_token", "")
    if not scopes.is_two_way(creds.scopes):
        return _refuse(request, user, gates.SCOPES_MISSING, token=token)
    session = GmailSession(creds)
    try:
        profile = session.profile()
    except ProviderError:
        revoke(token)
        return _back_to_settings("error", "Google didn't share the mailbox's address. Try again.")
    address = str(profile.get("emailAddress", "")).strip().lower()
    domain = address.rsplit("@", 1)[-1] if "@" in address else ""
    refusal = gates.address_gate(user.organisation, address)
    if refusal is not None:
        code, message = refusal
        return _refuse(request, user, code, detail=message, domain=domain, token=token)
    taken = (
        MailboxConnection.objects.filter(provider=GOOGLE, address=address)
        .exclude(status=DISCONNECTED)
        .exclude(user=user)
        .exists()
    )
    if taken:
        return _refuse(request, user, gates.ADDRESS_IN_USE, domain=domain, token=token)
    session.creds.address = address
    try:
        _save_google(request, user, session.creds, profile)
    except IntegrityError:
        # Someone else connected the same address in the same instant.
        return _refuse(request, user, gates.ADDRESS_IN_USE, domain=domain, token=token)
    return _back_to_settings("connected")


def _save_google(request, user, creds, profile):
    """Save the connection and start its sync (contract §1 steps 6-7). The
    same address resumes the person's row and keeps its copies; a different
    address or provider replaces it."""
    now = timezone.now()
    granted = list(creds.scopes)
    with transaction.atomic():
        existing = MailboxConnection.objects.select_for_update().filter(user=user).first()
        if existing is not None and (not existing.is_google or existing.address != creds.address):
            _replace(request, user, existing)
            existing = None
        # Changes made while it was away are unknown: re-list 30 days.
        away = existing is not None and existing.status != CONNECTED
        before = list(existing.granted_scopes) if existing is not None else []
        connection = existing or MailboxConnection(
            user=user, provider=GOOGLE, address=creds.address
        )
        connection.organisation = user.organisation
        connection.display_name = connection.display_name or user.name
        connection.status = CONNECTED
        connection.error = ""
        connection.paused_reason = ""
        connection.disconnected_at = None
        connection.consecutive_failures = 0
        connection.backoff_until = None
        connection.lease_until = None
        connection.granted_scopes = granted
        connection.set_credentials(creds.data)
        connection.history_id = int(profile["historyId"])
        gmail_sync.start_import(connection, profile, now)
        connection.reconcile_started_at = now if away else None
        connection.reconcile_page_token = ""
        connection.wake_at = now
        connection.save()
        short = scopes.short_names(granted)
        if existing is None:
            audit.record(  # SOC2:LOG-01 a credential was added
                "mailbox.connect",
                request=request,
                actor=user,
                target=connection,
                metadata={
                    "provider": GOOGLE,
                    "address": connection.address,
                    "scopes": short,
                    "two_way": connection.two_way,
                },
            )
        else:
            audit.record(  # SOC2:LOG-01
                "mailbox.reconnect",
                request=request,
                actor=user,
                target=connection,
                metadata={"provider": GOOGLE, "address": connection.address},
            )
            if set(before) != set(granted):
                audit.record(  # SOC2:LOG-01
                    "mailbox.scopes_changed",
                    request=request,
                    actor=user,
                    target=connection,
                    metadata={"from": scopes.short_names(before), "to": short},
                )
    return connection
```

In `services/mail/tests/test_mail.py`, delete `ConnectionTests.test_the_oauth_round_trip_trusts_only_the_signed_state` (the `@override_settings(...)` decorator through its last assertion). `test_connect.py` covers the round trip, the forged state and the redirect.

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/mail/gmail_sync.py services/mail/views.py services/mail/tests/test_mail.py \
  services/mail/tests/test_connect.py
git commit -m "$(cat <<'EOF'
feat(mail): gate google connections before oauth and in the callback

All three Gmail scopes, an address on a verified domain exactly and held
by nobody else, or the grant is revoked and nothing stored; a refusal
lands on Integrations as mailbox=refused with its code, and is audited.
Reconnecting the same address resumes the kept row and its copies.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 8: The tick: labels, history, the 12-month import, the watch

**Files:**
- Modify: `services/mail/gmail_sync.py` (everything after `start_import`)
- Modify: `services/mail/providers/google.py` (delete `GoogleProvider.fetch_messages` and its `# --- read ---` comment)
- Modify: `services/mail/sync.py` (`sync_mailbox` :258 hands Google to the tick)
- Test: `services/mail/tests/test_gmail_sync.py`

**Interfaces:**
- Consumes:
  - `GmailSession` (Task 3);
  - `gmail_store.store_gmail`, `relabel`, `mirror_labels` and `CLASSIFY_WINDOW` (Task 5);
  - `start_import` and `IMPORT_FIELDS` (Task 7);
  - `customers.classification.classify_records(records, *, organisation, user)`.
- Produces (`services.mail.gmail_sync`):
  - `TickResult(outcome: str = "ok", filed: int = 0)`;
  - `Changes(labels: dict, deleted: set)`;
  - `session_for(connection) -> GmailSession`;
  - `import_query(after, before) -> str`;
  - `tick(connection, *, now=None) -> TickResult`. This task raises `ProviderError`; Task 9 catches it.
  - `WATCH_RENEW_BEFORE`;
  - the private steps `_initialise`, `_read_history`, `_apply_history`, `_import_page`, `_fetch_and_store`, `_classify`, `_renew_watch` and `_succeeded`, which Task 9 extends.
- `sync.sync_mailbox(connection)` on a Google row returns `tick(connection).filed`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_gmail_sync.py`:

```python
"""One Gmail mailbox's tick (contract §5): initialise from getProfile, the
12-month import a page at a time skipping what is held, history applied with
the last event per message winning, only recent imported mail classified at
once, labels mirrored, the watch renewed within a day of lapsing, and the
refreshed token stored."""

from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from services.customers.models import Email
from services.mail import gmail_store, gmail_sync, sync
from services.mail.models import MailboxConnection, MailLabel, MailMessage

from .gmail_fake import gmail_message
from .gmail_fixtures import CREDENTIALS, GmailFixture

DAY = timedelta(days=1)
TOPIC = "projects/revenact/topics/gmail"


class TickFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()

    def mailbox(self, **fields):
        return self.google(self.dana, **fields)

    def synced(self, **fields):
        """Past its import, at Gmail's current history."""
        return self.mailbox(
            history_id=self.fake.history_id,
            import_after=self.now - 365 * DAY,
            import_before=self.now,
            import_done_at=self.now,
            **fields,
        )

    def tick(self, connection):
        result = gmail_sync.tick(MailboxConnection.objects.get(pk=connection.pk), now=self.now)
        connection.refresh_from_db()
        return result

    def ago(self, days, gid, **kw):
        return gmail_message(gid, sent_at=self.now - days * DAY, **kw)

    def held(self, connection, gid):
        """Stored already, as an earlier tick would have."""
        gmail_store.store_gmail(connection, self.fake.messages[gid], now=self.now)

    def fetched(self, fmt="full"):
        return sorted(
            where.rsplit("/", 1)[-1]
            for _, where, query in self.fake.calls
            if "/messages/" in where and query.get("format") == fmt
        )


class InitialiseAndImportTests(TickFixture):
    def test_a_connection_without_history_starts_and_imports_its_window(self):
        for days, gid in ((1, "d1"), (40, "d40"), (200, "d200"), (400, "d400")):
            self.fake.add(self.ago(days, gid), quietly=True)
        self.fake.add(self.ago(3, "chat", labels=["CHAT"]), quietly=True)
        connection = self.mailbox()
        result = self.tick(connection)
        self.assertEqual(result.outcome, "ok")
        self.assertEqual(connection.history_id, self.fake.history_id)
        self.assertEqual(connection.import_total_estimate, 5)
        self.assertIsNotNone(connection.import_done_at)
        self.assertEqual(
            set(MailMessage.objects.values_list("provider_message_id", flat=True)),
            {"d1", "d40", "d200"},
        )
        self.assertEqual(MailLabel.objects.filter(connection=connection).count(), 12)
        self.assertIsNotNone(connection.last_synced_at)
        self.assertEqual((connection.consecutive_failures, connection.error), (0, ""))

    @override_settings(MAIL_IMPORT_PAGE_SIZE=2)
    def test_one_page_a_tick_and_what_is_held_is_not_fetched_again(self):
        for days, gid in ((1, "n1"), (2, "n2"), (3, "n3")):
            self.fake.add(self.ago(days, gid, sender="news@elsewhere.io"), quietly=True)
        connection = self.mailbox()
        self.held(connection, "n1")
        self.tick(connection)
        self.assertEqual((connection.import_page_token, connection.import_done_at), ("p2", None))
        self.tick(connection)
        self.assertEqual(connection.import_page_token, "")
        self.assertIsNotNone(connection.import_done_at)
        self.assertEqual(MailMessage.objects.count(), 3)
        self.assertEqual(self.fetched(), ["n2", "n3"])

    def test_only_recent_imported_mail_is_classified_at_once(self):
        self.fake.add(self.ago(5, "recent"), quietly=True)
        self.fake.add(self.ago(90, "old"), quietly=True)
        with patch("services.customers.classification.classify_records") as classify:
            result = self.tick(self.mailbox())
        self.assertEqual(result.filed, 2)
        self.assertEqual(Email.objects.count(), 2)
        classify.assert_called_once()
        self.assertEqual([e.provider_message_id for e in classify.call_args.args[0]], ["recent"])

    def test_an_expired_page_token_restarts_the_import(self):
        self.fake.add(self.ago(1, "i1", sender="x@elsewhere.io"), quietly=True)
        connection = self.mailbox(
            history_id=self.fake.history_id,
            import_after=self.now - 365 * DAY,
            import_before=self.now,
            import_page_token="stale",
        )
        self.tick(connection)
        self.assertEqual((connection.import_page_token, MailMessage.objects.count()), ("", 0))
        self.tick(connection)
        self.assertEqual(MailMessage.objects.count(), 1)
        self.assertIsNotNone(connection.import_done_at)


class HistoryTests(TickFixture):
    def test_adds_relabels_and_deletes_with_every_page_read(self):
        self.fake.add(self.ago(2, "keep"), quietly=True)
        self.fake.add(self.ago(2, "drop"), quietly=True)
        connection = self.synced()
        self.held(connection, "keep")
        self.held(connection, "drop")
        filed_drop = Email.objects.get(provider_message_id="drop")
        self.fake.add(self.ago(0, "new1"))
        self.fake.relabel("keep", [])
        self.fake.remove("drop")
        with patch("services.customers.classification.classify_records") as classify:
            result = self.tick(connection)
        self.assertEqual(result.filed, 1)
        self.assertEqual([e.provider_message_id for e in classify.call_args.args[0]], ["new1"])
        self.assertEqual(MailMessage.objects.get(provider_message_id="keep").state, "done")
        self.assertFalse(MailMessage.objects.filter(provider_message_id="drop").exists())
        # The filed copy is the company's record: a Gmail deletion never removes it.
        self.assertTrue(Email.objects.filter(pk=filed_drop.pk).exists())
        self.assertEqual(connection.history_id, self.fake.history_id)
        pages = [where for _, where, _ in self.fake.calls if where.endswith("/history")]
        self.assertEqual(len(pages), 2)

    def test_a_label_change_on_a_message_not_held_stores_it_whole(self):
        self.fake.add(self.ago(1, "u1"), quietly=True)
        connection = self.synced()
        self.fake.relabel("u1", ["INBOX", "STARRED"])
        self.tick(connection)
        self.assertTrue(MailMessage.objects.get(provider_message_id="u1").is_starred)

    def test_an_event_without_label_ids_reads_them_minimally(self):
        self.fake.add(self.ago(1, "k1"), quietly=True)
        connection = self.synced()
        self.held(connection, "k1")
        self.fake.messages["k1"]["labelIds"] = ["INBOX"]
        self.fake._record(
            labelsRemoved=[{"message": {"id": "k1", "threadId": "k1"}, "labelIds": ["UNREAD"]}]
        )
        self.tick(connection)
        self.assertTrue(MailMessage.objects.get(provider_message_id="k1").is_read)
        self.assertEqual(self.fetched("minimal"), ["k1"])

    def test_sync_mailbox_hands_a_google_mailbox_to_the_tick(self):
        connection = self.mailbox()
        self.assertEqual(sync.sync_mailbox(connection), 0)
        connection.refresh_from_db()
        self.assertEqual(connection.history_id, self.fake.history_id)


class WatchAndTokenTests(TickFixture):
    @override_settings(GMAIL_PUBSUB_TOPIC=TOPIC)
    def test_the_watch_is_renewed_only_when_it_lapses_within_a_day(self):
        connection = self.synced()
        self.tick(connection)
        self.assertEqual(self.fake.watched, [TOPIC])
        self.assertGreater(connection.watch_expires_at, self.now + 6 * DAY)
        self.tick(connection)
        self.assertEqual(len(self.fake.watched), 1)
        MailboxConnection.objects.filter(pk=connection.pk).update(
            watch_expires_at=self.now + timedelta(hours=2)
        )
        self.tick(connection)
        self.assertEqual(len(self.fake.watched), 2)

    @override_settings(GMAIL_PUBSUB_TOPIC=TOPIC)
    def test_a_failed_watch_is_never_a_mailbox_error(self):
        connection = self.synced()
        self.fake.fail(r"/watch$", 403, "forbidden")
        result = self.tick(connection)
        self.assertEqual(
            (result.outcome, connection.watch_expires_at, connection.error), ("ok", None, "")
        )
        self.assertIsNotNone(connection.last_synced_at)

    @override_settings(GMAIL_PUBSUB_TOPIC="")
    def test_no_topic_no_watch(self):
        self.tick(self.synced())
        self.assertEqual(self.fake.watched, [])

    def test_a_refreshed_token_is_stored(self):
        connection = self.synced()
        connection.set_credentials({**CREDENTIALS, "expires_at": 0})
        connection.save(update_fields=["credentials"])
        self.tick(connection)
        self.assertTrue(connection.get_credentials()["access_token"].startswith("fake-access-"))
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_gmail_sync --parallel auto --noinput`
Expected: ERROR, `AttributeError: module 'services.mail.gmail_sync' has no attribute 'tick'`.

- [ ] **Step 3: The tick**

In `services/mail/gmail_sync.py`, replace the imports with:

```python
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.utils import timezone

from . import gmail_store
from .models import MailMessage
from .providers.base import Credentials, ProviderError
from .providers.google import GmailSession

logger = logging.getLogger(__name__)
```

After `start_import`, add:

```python
#: The watch is renewed once it lapses within this.
WATCH_RENEW_BEFORE = timedelta(hours=24)


@dataclass
class TickResult:
    #: ok, backoff or revoked (services/mail/loop.py logs it).
    outcome: str = "ok"
    filed: int = 0


@dataclass
class Changes:
    """History folded so that the last event per message wins."""

    #: message id -> its labelIds, or None when the event left them out.
    labels: dict = field(default_factory=dict)
    deleted: set = field(default_factory=set)


def session_for(connection):
    return GmailSession(
        Credentials(
            address=connection.address,
            display_name=connection.display_name,
            data=connection.get_credentials(),
        )
    )


def import_query(after, before):
    return f"after:{int(after.timestamp())} before:{int(before.timestamp())} -in:chats"


def tick(connection, *, now=None):
    """One pass for one claimed Google mailbox. Bounded: history until done,
    at most one import page."""
    now = now or timezone.now()
    result = TickResult()
    session = session_for(connection)
    gmail_store.mirror_labels(connection, session.labels())
    if connection.history_id is None:
        _initialise(connection, session, now)
    else:
        result.filed += _apply_history(connection, session, now)
    if connection.import_done_at is None and connection.import_after is not None:
        result.filed += _import_page(connection, session, now)
    _renew_watch(connection, session, now)
    _succeeded(connection, session)
    return result


def _initialise(connection, session, now):
    """No history_id yet (a row from before D1): take Gmail's, and start the
    import unless it has started or finished."""
    profile = session.profile()
    connection.history_id = int(profile["historyId"])
    fields = ["history_id"]
    if connection.import_after is None and connection.import_done_at is None:
        start_import(connection, profile, now)
        fields += IMPORT_FIELDS
    connection.save(update_fields=fields)


def _read_history(connection, session):
    """Every page since history_id, folded. Returns (changes, newest historyId)."""
    changes, page, newest = Changes(), "", connection.history_id
    while True:
        body = session.history(connection.history_id, page)
        for record in body.get("history", []):
            for key in ("messagesAdded", "labelsAdded", "labelsRemoved"):
                for item in record.get(key, []):
                    message = item.get("message") or {}
                    if message.get("id"):
                        changes.deleted.discard(message["id"])
                        changes.labels[message["id"]] = message.get("labelIds")
            for item in record.get("messagesDeleted", []):
                message_id = (item.get("message") or {}).get("id")
                if message_id:
                    changes.labels.pop(message_id, None)
                    changes.deleted.add(message_id)
        newest = int(body.get("historyId") or newest)
        page = body.get("nextPageToken", "")
        if not page:
            return changes, newest


def _apply_history(connection, session, now):
    changes, newest = _read_history(connection, session)
    if changes.deleted:
        # The personal copy goes; a filed Email is the company's and stays.
        MailMessage.objects.filter(
            connection=connection, provider_message_id__in=changes.deleted
        ).delete()
    held = {
        row.provider_message_id: row
        for row in MailMessage.objects.filter(
            connection=connection, provider_message_id__in=list(changes.labels)
        )
    }
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
        gmail_store.relabel(connection, row, label_ids, now)
    filed = _fetch_and_store(connection, session, unknown, now)
    connection.history_id = newest
    connection.save(update_fields=["history_id"])
    # New mail is classified at once, as before D1.
    _classify(connection, filed, now=now, recent_only=False)
    return len(filed)


def _fetch_and_store(connection, session, ids, now):
    """Fetch each id in full and store it; one Gmail no longer has is
    skipped. Returns the Emails this filed."""
    filed = []
    for message_id in ids:
        full = session.get_message(message_id)
        if full is None:
            continue
        _, email = gmail_store.store_gmail(connection, full, now=now)
        if email is not None:
            filed.append(email)
    return filed


def _import_page(connection, session, now):
    """One page of the 12-month backfill. Ids already held cost nothing
    (decision 29); an expired page token restarts from the first page."""
    query = import_query(connection.import_after, connection.import_before)
    try:
        body = session.list_messages(
            query, connection.import_page_token, settings.MAIL_IMPORT_PAGE_SIZE
        )
    except ProviderError as exc:
        if exc.status == 400 and connection.import_page_token:
            connection.import_page_token = ""
            connection.save(update_fields=["import_page_token"])
            return 0
        raise
    filed = _fetch_and_store(connection, session, _not_held(connection, body), now)
    token = body.get("nextPageToken", "")
    connection.import_page_token = token[:512]
    fields = ["import_page_token"]
    if not token:
        connection.import_done_at = now
        fields.append("import_done_at")
    connection.save(update_fields=fields)
    _classify(connection, filed, now=now, recent_only=True)
    return len(filed)


def _not_held(connection, body):
    ids = [stub["id"] for stub in body.get("messages", []) if stub.get("id")]
    held = set(
        MailMessage.objects.filter(connection=connection, provider_message_id__in=ids).values_list(
            "provider_message_id", flat=True
        )
    )
    return [message_id for message_id in ids if message_id not in held]


def _classify(connection, emails, *, now, recent_only):
    """Sentiment now for filed mail the pulse will count. Imported mail older
    than CLASSIFY_WINDOW waits for the nightly, capped, oldest-first
    classify_interactions pass (decision 17)."""
    if recent_only:
        emails = [e for e in emails if e.sent_at >= now - gmail_store.CLASSIFY_WINDOW]
    if emails:
        from services.customers.classification import classify_records

        classify_records(emails, organisation=connection.organisation, user=connection.user)


def _renew_watch(connection, session, now):
    """Point Gmail's push at the topic when it lapses within a day. A failure
    is logged without content and retried next tick; never a mailbox error."""
    topic = settings.GMAIL_PUBSUB_TOPIC
    if not topic:
        return
    if connection.watch_expires_at and connection.watch_expires_at > now + WATCH_RENEW_BEFORE:
        return
    try:
        body = session.watch(topic)
    except ProviderError as exc:
        logger.warning("gmail watch failed for connection %s: %s", connection.pk, exc.status)
        return
    expiration = body.get("expiration")
    connection.watch_expires_at = (
        datetime.fromtimestamp(int(expiration) / 1000, tz=UTC) if expiration else None
    )
    connection.save(update_fields=["watch_expires_at"])


def _succeeded(connection, session):
    connection.set_credentials(session.creds.data)
    connection.last_synced_at = timezone.now()
    connection.consecutive_failures = 0
    connection.error = ""
    connection.backoff_until = None
    connection.lease_until = None
    connection.save(
        update_fields=[
            "credentials",
            "last_synced_at",
            "consecutive_failures",
            "error",
            "backoff_until",
            "lease_until",
            "updated_at",
        ]
    )
```

- [ ] **Step 4: Retire the old Gmail fetch**

In `services/mail/providers/google.py`, delete `GoogleProvider.fetch_messages` and the `# --- read ---` comment above it.

In `services/mail/sync.py`, at the top of `sync_mailbox` (after its docstring), add:

```python
    if connection.provider == MailboxConnection.Provider.GOOGLE:
        # Every Google mailbox runs the history engine (decision 8).
        from .gmail_sync import tick

        return tick(connection).filed
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/mail/gmail_sync.py services/mail/providers/google.py services/mail/sync.py \
  services/mail/tests/test_gmail_sync.py
git commit -m "$(cat <<'EOF'
feat(mail): sync gmail from its change log with a 12-month import

Each tick mirrors labels, applies history since history_id (adds, deletes
and label changes, the last event per message winning), imports one page
of the 12-month window skipping what is held, classifies only recent
imported mail at once, and renews the push watch within a day of lapsing.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 9: Recovery when history is gone, and the four error outcomes

**Files:**
- Modify: `services/mail/gmail_sync.py` (imports; `tick`; `_apply_history`; new `_start_recovery`, `_reconcile_page`, `classify_failure`, `backoff_seconds`, `_failed` and the messages)
- Modify: `services/mail/tests/test_gmail_sync.py` (`TickFixture.tick` and `held` take a time)
- Test: `services/mail/tests/test_gmail_recovery.py`

**Interfaces:**
- Consumes:
  - `ProviderError.status`, `.reason` and `.retry_after`, and `google.LOST_GRANT` (Task 3);
  - `TickFixture` (Task 8);
  - `core.audit`.
- Produces (`services.mail.gmail_sync`):
  - `REVOKED_MESSAGE`, `PERMISSION_MESSAGE`, `RATE_LIMITED`, `UNAVAILABLE`;
  - `classify_failure(exc) -> str`, which returns `"revoked"`, `"permission"` or `"backoff"`;
  - `backoff_seconds(failures: int, retry_after: int | None = None) -> int`.
  - `tick` now returns `TickResult(outcome="backoff" | "revoked")` instead of raising.
  - A history 404 starts a reconcile. The reconcile re-lists `after:<reconcile_started_at − MAIL_RECONCILE_DAYS> -in:chats`, one page a tick. Its last page deletes what it did not see.

- [ ] **Step 1: Write the failing tests**

In `services/mail/tests/test_gmail_sync.py`, replace `TickFixture.tick` and `TickFixture.held` with:

```python
def tick(self, connection, now=None):
    result = gmail_sync.tick(MailboxConnection.objects.get(pk=connection.pk), now=now or self.now)
    connection.refresh_from_db()
    return result


def held(self, connection, gid, at=None):
    """Stored already, as an earlier tick would have (at `at`)."""
    gmail_store.store_gmail(connection, self.fake.messages[gid], now=at or self.now)
```

Create `services/mail/tests/test_gmail_recovery.py`:

```python
"""When Gmail no longer has the history (contract decision 19) the fresh
history_id is taken first, then the last 30 days are re-listed a page a
tick, and what the re-list did not see is deleted. Errors (decisions 20,
21): rate limits, 5xx and network back off this mailbox only; a lost grant
or a missing permission pauses it until the person reconnects."""

from datetime import timedelta

from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.customers.models import Email
from services.mail import gmail_sync
from services.mail.models import MailboxConnection, MailMessage

from .gmail_fixtures import CREDENTIALS
from .test_gmail_sync import TickFixture


class RecoveryTests(TickFixture):
    @override_settings(MAIL_IMPORT_PAGE_SIZE=2)
    def test_a_404_takes_a_fresh_history_id_first_then_relists_30_days(self):
        for days, gid in ((2, "k2"), (3, "k_old"), (4, "gone"), (40, "o40")):
            self.fake.add(self.ago(days, gid), quietly=True)
        connection = self.synced()
        for gid in ("k2", "k_old", "gone", "o40"):
            self.held(connection, gid)
        filed_gone = Email.objects.get(provider_message_id="gone")
        # A week with the VM off: new mail, a star, a deletion, and Gmail forgets.
        self.fake.add(self.ago(1, "new1"))
        self.fake.relabel("k_old", ["INBOX", "STARRED"])
        del self.fake.messages["gone"]
        self.fake.forget_history()

        first = timezone.now()
        self.assertEqual(self.tick(connection, now=first).outcome, "ok")
        self.assertEqual(connection.history_id, self.fake.history_id)
        self.assertEqual(
            (connection.reconcile_started_at, connection.reconcile_page_token), (first, "p2")
        )
        order = [where.rsplit("/", 1)[-1] for _, where, _ in self.fake.calls]
        self.assertLess(order.index("profile"), order.index("messages"))
        self.assertTrue(MailMessage.objects.filter(provider_message_id="new1").exists())
        # Sent from Revenact after the reconcile began: never mistaken for a deletion.
        MailMessage.objects.create(
            connection=connection,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="sent:abc",
            direction="sent",
            folder="sent",
            subject="Re: Renewal",
            sent_at=timezone.now(),
        )

        self.tick(connection, now=timezone.now())
        self.assertIsNone(connection.reconcile_started_at)
        self.assertEqual(connection.reconcile_page_token, "")
        self.assertTrue(MailMessage.objects.get(provider_message_id="k_old").is_starred)
        held = set(MailMessage.objects.values_list("provider_message_id", flat=True))
        self.assertEqual(held, {"new1", "k2", "k_old", "o40", "sent:abc"})
        self.assertTrue(Email.objects.filter(pk=filed_gone.pk).exists())


class ErrorTests(TickFixture):
    def test_the_delay_doubles_to_its_ceiling_or_follows_retry_after(self):
        self.assertEqual(
            [gmail_sync.backoff_seconds(n) for n in (1, 2, 3, 6, 7, 40)],
            [30, 60, 120, 900, 900, 900],
        )
        self.assertEqual(gmail_sync.backoff_seconds(1, retry_after=300), 300)
        self.assertEqual(gmail_sync.backoff_seconds(5, retry_after=10), 480)

    def test_a_rate_limit_backs_off_this_mailbox_and_keeps_it_connected(self):
        connection = self.synced()
        self.fake.fail(r"/labels$", 429, retry_after=120)
        result = self.tick(connection)
        self.assertEqual(result.outcome, "backoff")
        self.assertEqual(
            (connection.status, connection.consecutive_failures, connection.paused_reason),
            ("connected", 1, ""),
        )
        self.assertEqual(connection.backoff_until, self.now + timedelta(seconds=120))
        self.assertTrue(
            connection.error.startswith("Gmail is rate-limiting this mailbox; retrying at ")
        )
        self.assertIsNone(connection.lease_until)
        self.assertFalse(AuditEvent.objects.filter(action="mailbox.paused").exists())

    def test_5xx_network_and_quota_403s_back_off(self):
        connection = self.synced()
        for status, reason in (
            (503, ""),
            (None, ""),
            (403, "userRateLimitExceeded"),
            (403, "rateLimitExceeded"),
            (403, "domainPolicy"),
        ):
            with self.subTest(status=status, reason=reason):
                MailboxConnection.objects.filter(pk=connection.pk).update(consecutive_failures=0)
                self.fake.fail(r"/labels$", status, reason)
                self.assertEqual(self.tick(connection).outcome, "backoff")
                self.assertEqual(
                    (connection.status, connection.consecutive_failures), ("connected", 1)
                )
        # The next success clears the transient state.
        self.tick(connection)
        self.assertEqual(
            (connection.consecutive_failures, connection.error, connection.backoff_until),
            (0, "", None),
        )

    def test_a_lost_grant_pauses_the_mailbox_until_a_reconnect(self):
        connection = self.synced()
        connection.set_credentials({**CREDENTIALS, "expires_at": 0})
        connection.save(update_fields=["credentials"])
        self.fake.refresh_reason = "invalid_grant"
        self.assertEqual(self.tick(connection).outcome, "revoked")
        self.assertEqual(
            (connection.status, connection.paused_reason, connection.error),
            ("error", "token_revoked", "Google access was revoked. Reconnect Google."),
        )
        event = AuditEvent.objects.get(action="mailbox.paused")
        self.assertEqual((event.actor, event.metadata), (None, {"reason": "token_revoked"}))

    def test_one_401_is_retried_and_a_second_is_a_lost_grant(self):
        connection = self.synced()
        self.fake.fail(r"/labels$", 401)
        self.assertEqual(self.tick(connection).outcome, "ok")
        self.fake.fail(r"/labels$", 401, times=2)
        self.assertEqual(self.tick(connection).outcome, "revoked")

    def test_a_missing_permission_asks_for_a_reconnect(self):
        connection = self.synced()
        self.fake.fail(r"/history$", 403, "insufficientPermissions")
        self.assertEqual(self.tick(connection).outcome, "revoked")
        self.assertEqual(
            (connection.status, connection.paused_reason, connection.error),
            ("error", "token_revoked", "Revenact is missing a Gmail permission. Reconnect Google."),
        )

    def test_a_message_gone_between_list_and_get_is_skipped(self):
        self.fake.add(self.ago(1, "g1"), quietly=True)
        self.fake.add(self.ago(2, "g2"), quietly=True)
        connection = self.mailbox()
        self.fake.fail(r"/messages/g1$", 404, "notFound")
        self.assertEqual(self.tick(connection).outcome, "ok")
        self.assertEqual(
            list(MailMessage.objects.values_list("provider_message_id", flat=True)), ["g2"]
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_gmail_recovery --parallel auto --noinput`
Expected: ERROR or FAIL. `backoff_seconds` does not exist, and the 404 and the 429 propagate as `ProviderError`.

- [ ] **Step 3: Implement**

In `services/mail/gmail_sync.py`, replace the imports with:

```python
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from core import audit

from . import gmail_store
from .models import MailboxConnection, MailMessage
from .providers.base import Credentials, ProviderError
from .providers.google import LOST_GRANT, GmailSession

logger = logging.getLogger(__name__)
```

After `WATCH_RENEW_BEFORE`, add:

```python
REVOKED_MESSAGE = "Google access was revoked. Reconnect Google."
PERMISSION_MESSAGE = "Revenact is missing a Gmail permission. Reconnect Google."
RATE_LIMITED = "Gmail is rate-limiting this mailbox; retrying at {at} UTC"
UNAVAILABLE = "Gmail isn't answering; retrying at {at} UTC"
```

Replace `tick` with:

```python
def tick(connection, *, now=None):
    """One pass for one claimed Google mailbox. Bounded: history until done,
    at most one reconcile page and one import page. A failure never raises:
    it backs this mailbox off or pauses it, and the loop moves on."""
    now = now or timezone.now()
    result = TickResult()
    session = session_for(connection)
    try:
        gmail_store.mirror_labels(connection, session.labels())
        if connection.history_id is None:
            _initialise(connection, session, now)
        else:
            result.filed += _apply_history(connection, session, now)
        if connection.reconcile_started_at is not None:
            result.filed += _reconcile_page(connection, session, now)
        if connection.import_done_at is None and connection.import_after is not None:
            result.filed += _import_page(connection, session, now)
        _renew_watch(connection, session, now)
    except ProviderError as exc:
        result.outcome = _failed(connection, session, exc, now)
        return result
    _succeeded(connection, session)
    return result
```

In `_apply_history`, replace its first line with:

```python
    try:
        changes, newest = _read_history(connection, session)
    except ProviderError as exc:
        if exc.status != 404:
            raise
        _start_recovery(connection, session, now)
        return 0
```

After `_apply_history`, add:

```python
def _start_recovery(connection, session, now):
    """Gmail no longer has history that old (about a week). The fresh
    history_id comes first, so nothing changed during the re-list is lost;
    then the last MAIL_RECONCILE_DAYS are re-listed, a page per tick."""
    profile = session.profile()
    connection.history_id = int(profile["historyId"])
    connection.reconcile_started_at = now
    connection.reconcile_page_token = ""
    connection.save(update_fields=["history_id", "reconcile_started_at", "reconcile_page_token"])


def _reconcile_page(connection, session, now):
    """One page of the 30-day re-list: unknown ids stored whole, known ones'
    labels refreshed. The window is anchored on reconcile_started_at, so
    every page asks the identical query. On the last page, rows in the
    window that were neither seen nor made since the reconcile began are
    gone from Gmail, and deleted here (a filed Email stays)."""
    started = connection.reconcile_started_at
    since = started - timedelta(days=settings.MAIL_RECONCILE_DAYS)
    try:
        body = session.list_messages(
            f"after:{int(since.timestamp())} -in:chats",
            connection.reconcile_page_token,
            settings.MAIL_IMPORT_PAGE_SIZE,
        )
    except ProviderError as exc:
        if exc.status == 400 and connection.reconcile_page_token:
            connection.reconcile_page_token = ""
            connection.save(update_fields=["reconcile_page_token"])
            return 0
        raise
    ids = [stub["id"] for stub in body.get("messages", []) if stub.get("id")]
    held = {
        row.provider_message_id: row
        for row in MailMessage.objects.filter(connection=connection, provider_message_id__in=ids)
    }
    for message_id, row in held.items():
        minimal = session.get_message(message_id, "minimal")
        if minimal is not None:
            gmail_store.relabel(connection, row, minimal.get("labelIds", []), now)
    filed = _fetch_and_store(connection, session, [i for i in ids if i not in held], now)
    token = body.get("nextPageToken", "")
    if token:
        connection.reconcile_page_token = token[:512]
    else:
        MailMessage.objects.filter(
            connection=connection, sent_at__gte=since, synced_at__lt=started
        ).filter(Q(refreshed_at__isnull=True) | Q(refreshed_at__lt=started)).delete()
        connection.reconcile_started_at = None
        connection.reconcile_page_token = ""
    connection.save(update_fields=["reconcile_started_at", "reconcile_page_token"])
    _classify(connection, filed, now=now, recent_only=True)
    return len(filed)


def classify_failure(exc):
    """Decision 20: a lost grant, a missing permission, or something to wait out."""
    if exc.reason in LOST_GRANT or exc.status == 401:
        return "revoked"
    if exc.status == 403 and exc.reason == "insufficientPermissions":
        return "permission"
    # 429, 5xx, no answer, a 403 rate limit, and any other refusal.
    return "backoff"


def backoff_seconds(failures, retry_after=None):
    """min(30 s × 2^(n−1), MAIL_BACKOFF_MAX_SECONDS), or Retry-After if longer."""
    delay = min(30 * 2 ** (min(failures, 20) - 1), settings.MAIL_BACKOFF_MAX_SECONDS)
    return max(delay, retry_after or 0)


def _failed(connection, session, exc, now):
    """Record what went wrong without a word of mail content. Returns the
    outcome: revoked (status error, paused until a reconnect) or backoff
    (still connected, due again after the delay)."""
    kind = classify_failure(exc)
    if kind != "backoff":
        connection.status = MailboxConnection.Status.ERROR
        connection.error = REVOKED_MESSAGE if kind == "revoked" else PERMISSION_MESSAGE
        connection.paused_reason = MailboxConnection.PausedReason.TOKEN_REVOKED
        connection.lease_until = None
        connection.save(
            update_fields=["status", "error", "paused_reason", "lease_until", "updated_at"]
        )
        audit.record(  # SOC2:LOG-01 sync and sending stop until the person reconnects
            "mailbox.paused",
            organisation=connection.organisation,
            target=connection,
            metadata={"reason": MailboxConnection.PausedReason.TOKEN_REVOKED},
        )
        logger.warning("gmail connection %s paused: %s %s", connection.pk, exc.status, exc.reason)
        return "revoked"
    connection.consecutive_failures += 1
    delay = backoff_seconds(connection.consecutive_failures, exc.retry_after)
    connection.backoff_until = now + timedelta(seconds=delay)
    limited = exc.status in (403, 429)
    connection.error = (RATE_LIMITED if limited else UNAVAILABLE).format(
        at=connection.backoff_until.strftime("%H:%M")
    )
    connection.lease_until = None
    # A token refreshed before the failure is still worth keeping.
    connection.set_credentials(session.creds.data)
    connection.save(
        update_fields=[
            "consecutive_failures",
            "backoff_until",
            "error",
            "lease_until",
            "credentials",
            "updated_at",
        ]
    )
    logger.warning(
        "gmail connection %s backing off %ss: %s %s", connection.pk, delay, exc.status, exc.reason
    )
    return "backoff"
```

(`TickResult.outcome`'s comment already lists `backoff` and `revoked`.)

- [ ] **Step 4: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add services/mail/gmail_sync.py services/mail/tests/test_gmail_sync.py \
  services/mail/tests/test_gmail_recovery.py
git commit -m "$(cat <<'EOF'
feat(mail): recover lost gmail history and sort sync failures

A history 404 takes a fresh history_id first, then re-lists 30 days a page
per tick and deletes what Gmail no longer has; rate limits, 5xx and no
answer back off this mailbox only, and a lost grant or missing permission
pauses it until the person reconnects, audited.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 10: The loop: leases, due rules, the gate sweep and `sync_mail --loop`

**Files:**
- Create: `services/mail/loop.py`
- Modify: `services/mail/management/commands/sync_mail.py` (whole file)
- Test: `services/mail/tests/test_loop.py`

**Interfaces:**
- Consumes:
  - `gates.sweep` (Task 6) and `gmail_sync.tick` → `TickResult` (Tasks 8–9);
  - `sync.sync_mailbox` (unchanged for Outlook and IMAP);
  - the settings `MAIL_SYNC_TICK_SECONDS`, `MAIL_SYNC_INTERVAL_SECONDS`, `MAIL_LEGACY_SYNC_INTERVAL_SECONDS`, `MAIL_SYNC_BATCH`, `MAIL_LEASE_SECONDS` and `MAIL_BACKOFF_MAX_SECONDS`.
- Produces (`services.mail.loop`):
  - `due_q(now) -> Q`;
  - `claim_due(*, now=None, limit=None) -> list[MailboxConnection]`, leased, in claim order, with `user` and `organisation` selected;
  - `sync_one(connection, *, now=None) -> int` (filed);
  - `run_all(*, user_email=None, now=None) -> tuple[int, int]` (synced, filed);
  - `class Loop` with `run_once(now=None) -> int`, `stop(*_)` and `forever()`.
- `python manage.py sync_mail [--user <email>] [--loop]`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_loop.py`:

```python
"""The mail loop (contract §5, decision 18): which mailboxes are due, a
claim that leases rather than holds a lock (a row locked elsewhere is
skipped, not waited on), Outlook and IMAP at their ten minutes with a
failed pass waiting the same, the gate sweep once a minute, one broken
mailbox never stopping the rest, and a clean stop."""

import io
import signal
import threading
import time
from datetime import timedelta
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connections, transaction
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from services.accounts.models import Organisation, User
from services.mail import loop
from services.mail.models import MailboxConnection
from services.mail.providers.base import ProviderError

from .gmail_fixtures import GmailFixture, google_connection
from .test_mail import FakeProvider

CADENCE = dict(
    MAIL_SYNC_INTERVAL_SECONDS=60,
    MAIL_LEGACY_SYNC_INTERVAL_SECONDS=600,
    MAIL_LEASE_SECONDS=300,
    MAIL_SYNC_BATCH=10,
    MAIL_BACKOFF_MAX_SECONDS=900,
)
SECOND = timedelta(seconds=1)


@override_settings(**CADENCE)
class DueTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.now = timezone.now()

    def person(self, name):
        return User.objects.create_user(
            email=f"{name}@acme.io", password="x", name=name, organisation=self.org
        )

    def claimed(self, **kw):
        return {c.pk for c in loop.claim_due(now=self.now, **kw)}

    def test_a_google_mailbox_is_due_when_new_woken_or_a_minute_old(self):
        fresh = self.google(self.dana)
        self.google(self.carl, last_synced_at=self.now)
        woken = self.google(self.alice, last_synced_at=self.now, wake_at=self.now)
        stale = self.google(self.priya, last_synced_at=self.now - 61 * SECOND)
        self.assertEqual(self.claimed(), {fresh.pk, woken.pk, stale.pk})
        woken.refresh_from_db()
        self.assertIsNone(woken.wake_at)
        self.assertEqual(woken.lease_until, self.now + 300 * SECOND)
        # Leased: not claimed again until the lease runs out.
        self.assertEqual(self.claimed(), set())

    def test_paused_backing_off_leased_errored_or_disconnected_is_not_due(self):
        for name, fields in (
            ("paused", {"paused_reason": "no_seat"}),
            ("waiting", {"backoff_until": self.now + 60 * SECOND}),
            ("leased", {"lease_until": self.now + 60 * SECOND}),
            ("revoked", {"status": "error", "paused_reason": "token_revoked"}),
            ("gone", {"status": "disconnected"}),
        ):
            self.google(self.person(name), **fields)
        self.assertEqual(self.claimed(), set())

    def test_an_expired_lease_or_backoff_is_due_again(self):
        row = self.google(self.dana, lease_until=self.now - SECOND, backoff_until=self.now - SECOND)
        self.assertEqual(self.claimed(), {row.pk})

    def test_outlook_and_imap_keep_their_ten_minutes_errors_included(self):
        recent = self.connect(self.dana)
        MailboxConnection.objects.filter(pk=recent.pk).update(
            last_synced_at=self.now - 120 * SECOND
        )
        old = self.connect(self.carl)
        MailboxConnection.objects.filter(pk=old.pk).update(
            last_synced_at=self.now - 601 * SECOND, status="error"
        )
        never = self.connect(self.alice)
        self.assertEqual(self.claimed(), {old.pk, never.pk})

    def test_never_synced_first_then_oldest_and_at_most_a_batch(self):
        a = self.google(self.dana, last_synced_at=self.now - 300 * SECOND)
        b = self.google(self.carl)
        self.google(self.alice, last_synced_at=self.now - 100 * SECOND)
        self.assertEqual([c.pk for c in loop.claim_due(now=self.now, limit=2)], [b.pk, a.pk])


@override_settings(**CADENCE)
class SkipLockedTests(TransactionTestCase):
    def test_a_row_locked_elsewhere_is_skipped_not_waited_on(self):
        organisation = Organisation.objects.create(name="Lock Co")
        user = User.objects.create_user(
            email="l@lock.co", password="x", name="L", organisation=organisation
        )
        row = google_connection(user)
        locked, release = threading.Event(), threading.Event()

        def hold():
            try:
                with transaction.atomic():
                    MailboxConnection.objects.select_for_update().get(pk=row.pk)
                    locked.set()
                    release.wait(10)
            finally:
                connections.close_all()

        holder = threading.Thread(target=hold)
        holder.start()
        self.assertTrue(locked.wait(10))
        try:
            started = time.monotonic()
            self.assertEqual(loop.claim_due(), [])
            self.assertLess(time.monotonic() - started, 5)
        finally:
            release.set()
            holder.join()
        self.assertEqual([c.pk for c in loop.claim_due()], [row.pk])


@override_settings(**CADENCE)
class RunTests(GmailFixture):
    def test_a_failed_imap_pass_waits_the_legacy_interval(self):
        connection = self.connect(self.dana)

        class Broken(FakeProvider):
            def fetch_messages(self, creds, cursor):
                raise ProviderError("imap.acme.io did not answer")

        now = timezone.now()
        with patch("services.mail.sync.get_provider", return_value=Broken()):
            loop.sync_one(connection, now=now)
        connection.refresh_from_db()
        self.assertEqual((connection.status, connection.lease_until), ("error", None))
        self.assertEqual(connection.backoff_until, now + 600 * SECOND)
        self.assertEqual(loop.claim_due(now=now + 599 * SECOND), [])
        self.assertEqual(len(loop.claim_due(now=now + 601 * SECOND)), 1)

    def test_the_sweep_runs_once_a_minute_and_a_paused_mailbox_is_never_claimed(self):
        fake = self.use_gmail()
        connection = self.google(self.dana)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        runner = loop.Loop()
        self.assertEqual(runner.run_once(), 0)
        connection.refresh_from_db()
        self.assertEqual(connection.paused_reason, "workspace_off")
        self.assertEqual(fake.calls, [])
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=True)
        self.assertEqual(runner.run_once(), 0)
        self.assertEqual(runner.run_once(now=timezone.now() + 61 * SECOND), 1)
        connection.refresh_from_db()
        self.assertEqual(connection.paused_reason, "")
        self.assertIsNotNone(connection.last_synced_at)

    def test_one_broken_mailbox_never_stops_the_rest(self):
        self.use_gmail()
        broken = self.google(self.dana)
        MailboxConnection.objects.filter(pk=broken.pk).update(credentials="not-a-fernet-token")
        fine = self.connect(self.carl)
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            self.assertEqual(loop.Loop().run_once(), 2)
        broken.refresh_from_db()
        self.assertIsNone(broken.lease_until)
        self.assertIsNotNone(broken.backoff_until)
        fine.refresh_from_db()
        self.assertIsNotNone(fine.last_synced_at)

    def test_a_stop_between_mailboxes_releases_the_rest(self):
        self.connect(self.dana)
        self.connect(self.carl)
        runner = loop.Loop()

        def stop_after_this(connection, **kw):
            runner.stop(signal.SIGTERM, None)
            return 0

        with patch("services.mail.loop.sync_one", side_effect=stop_after_this):
            self.assertEqual(runner.run_once(), 1)
        self.assertEqual(MailboxConnection.objects.filter(lease_until__isnull=False).count(), 1)

    def test_forever_stops_on_sigterm(self):
        runner = loop.Loop()
        with (
            patch.object(
                loop.Loop, "run_once", side_effect=lambda: runner.stop(signal.SIGTERM, None)
            ) as tick,
            patch("services.mail.loop.signal.signal"),
        ):
            runner.forever()
        tick.assert_called_once()


@override_settings(**CADENCE)
class CommandTests(GmailFixture):
    def test_one_pass_syncs_every_live_mailbox_and_skips_paused_ones(self):
        self.use_gmail()
        dana = self.google(self.dana)
        carl = self.google(self.carl, status="error", paused_reason="token_revoked")
        self.connect(self.priya)
        out, err = io.StringIO(), io.StringIO()
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            call_command("sync_mail", stdout=out, stderr=err)
        self.assertIn("synced 2 mailbox(es)", out.getvalue())
        self.assertIn("1 need attention", out.getvalue())
        dana.refresh_from_db()
        carl.refresh_from_db()
        self.assertIsNotNone(dana.history_id)
        self.assertIsNone(carl.history_id)

    def test_loop_and_user_do_not_mix(self):
        with self.assertRaises(CommandError):
            call_command("sync_mail", "--loop", "--user", "dana@acme.io")

    def test_loop_runs_the_loop(self):
        with patch("services.mail.management.commands.sync_mail.Loop") as runner:
            call_command("sync_mail", "--loop", stdout=io.StringIO())
        runner.return_value.forever.assert_called_once()
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_loop --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'loop' from 'services.mail'`.

- [ ] **Step 3: The loop**

Create `services/mail/loop.py`:

```python
"""The mail loop (contract §5): every MAIL_SYNC_TICK_SECONDS, claim the
mailboxes that are due and sync them; once a minute, sweep the Gmail gates.

A claim is a lease, not a held lock (decision 18). One short transaction
takes due rows with SELECT ... FOR UPDATE SKIP LOCKED, stamps lease_until,
clears wake_at and commits. The provider work then runs outside any
transaction, so a push's UPDATE of wake_at never waits on a tick, and a
second process would only ever take other rows. Google is due every
MAIL_SYNC_INTERVAL_SECONDS or when woken; Outlook and IMAP every
MAIL_LEGACY_SYNC_INTERVAL_SECONDS, through today's sync_mailbox. Run as
`python manage.py sync_mail --loop` (revenact-infra's `mailsync`).
"""

import logging
import signal
import time
from datetime import timedelta

from django.conf import settings
from django.db import close_old_connections, transaction
from django.db.models import F, Q
from django.utils import timezone

from . import gates, gmail_sync
from .models import MailboxConnection
from .sync import sync_mailbox

logger = logging.getLogger(__name__)
GOOGLE = MailboxConnection.Provider.GOOGLE
Status = MailboxConnection.Status


def _seconds(name):
    return timedelta(seconds=getattr(settings, name))


def _unleased(now):
    return Q(lease_until__isnull=True) | Q(lease_until__lte=now)


def due_q(now):
    """Due: not leased, not backing off, and by provider (contract §5 step 2)."""
    google = Q(provider=GOOGLE, status=Status.CONNECTED, paused_reason="") & (
        Q(wake_at__lte=now)
        | Q(last_synced_at__isnull=True)
        | Q(last_synced_at__lt=now - _seconds("MAIL_SYNC_INTERVAL_SECONDS"))
    )
    legacy = (
        ~Q(provider=GOOGLE)
        & Q(status__in=[Status.CONNECTED, Status.ERROR])
        & (
            Q(last_synced_at__isnull=True)
            | Q(last_synced_at__lt=now - _seconds("MAIL_LEGACY_SYNC_INTERVAL_SECONDS"))
        )
    )
    not_waiting = Q(backoff_until__isnull=True) | Q(backoff_until__lte=now)
    return _unleased(now) & not_waiting & (google | legacy)


def claim_due(*, now=None, limit=None):
    """Lease up to MAIL_SYNC_BATCH due mailboxes, never synced first, then the
    oldest. A row another process has locked is skipped, never waited on."""
    now = now or timezone.now()
    with transaction.atomic():
        ids = list(
            MailboxConnection.objects.select_for_update(skip_locked=True)
            .filter(due_q(now))
            .order_by(F("last_synced_at").asc(nulls_first=True), "pk")
            .values_list("pk", flat=True)[: limit or settings.MAIL_SYNC_BATCH]
        )
        if ids:
            MailboxConnection.objects.filter(pk__in=ids).update(
                lease_until=now + _seconds("MAIL_LEASE_SECONDS"), wake_at=None
            )
    rows = MailboxConnection.objects.filter(pk__in=ids).select_related("user", "organisation")
    by_pk = {row.pk: row for row in rows}
    return [by_pk[pk] for pk in ids if pk in by_pk]


def sync_one(connection, *, now=None):
    """One claimed mailbox. Google: a tick (it clears its own lease). Outlook
    and IMAP: today's pass, and a failed pass waits the legacy interval."""
    now = now or timezone.now()
    if connection.provider == GOOGLE:
        result = gmail_sync.tick(connection, now=now)
        if result.outcome != "ok":
            logger.info("gmail connection %s: %s", connection.pk, result.outcome)
        return result.filed
    filed = sync_mailbox(connection)
    failed = connection.status == Status.ERROR
    MailboxConnection.objects.filter(pk=connection.pk).update(
        lease_until=None,
        backoff_until=now + _seconds("MAIL_LEGACY_SYNC_INTERVAL_SECONDS") if failed else None,
    )
    return filed


def _safely(connection):
    """sync_one, never raising: a mailbox that breaks unexpectedly (unreadable
    credentials, a bug) is released and backed off, and the loop moves on."""
    try:
        return sync_one(connection)
    except Exception as exc:  # noqa: BLE001 - one mailbox never stops the rest
        # the class name only: an exception's text can quote mail
        logger.error("mail sync failed for connection %s: %s", connection.pk, type(exc).__name__)
        MailboxConnection.objects.filter(pk=connection.pk).update(
            lease_until=None, backoff_until=timezone.now() + _seconds("MAIL_BACKOFF_MAX_SECONDS")
        )
        return 0


def run_all(*, user_email=None, now=None):
    """`sync_mail` without --loop: one pass over every live mailbox, ignoring
    the due rules. Paused, disconnected and leased ones are skipped. Returns
    (mailboxes synced, emails filed)."""
    now = now or timezone.now()
    gates.sweep(now=now)
    rows = MailboxConnection.objects.exclude(status=Status.DISCONNECTED).filter(paused_reason="")
    if user_email:
        rows = rows.filter(user__email=user_email)
    synced = filed = 0
    for pk in list(rows.values_list("pk", flat=True)):
        leased = MailboxConnection.objects.filter(_unleased(now), pk=pk).update(
            lease_until=now + _seconds("MAIL_LEASE_SECONDS")
        )
        if not leased:
            continue
        connection = MailboxConnection.objects.select_related("user", "organisation").get(pk=pk)
        filed += _safely(connection)
        synced += 1
    return synced, filed


class Loop:
    """`sync_mail --loop`. SIGTERM or SIGINT stop it between mailboxes; the
    ones it had claimed and not reached are released."""

    def __init__(self):
        self.stopping = False
        self._swept_at = None

    def stop(self, *_):
        self.stopping = True

    def run_once(self, now=None):
        now = now or timezone.now()
        if self._swept_at is None or now - self._swept_at >= _seconds("MAIL_SYNC_INTERVAL_SECONDS"):
            gates.sweep(now=now)
            self._swept_at = now
        claimed = claim_due(now=now)
        done = 0
        for connection in claimed:
            if self.stopping:
                break
            _safely(connection)
            done += 1
        left = [connection.pk for connection in claimed[done:]]
        if left:
            MailboxConnection.objects.filter(pk__in=left).update(lease_until=None)
        return done

    def forever(self):
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)
        while not self.stopping:
            started = time.monotonic()
            close_old_connections()
            try:
                self.run_once()
            except Exception as exc:  # noqa: BLE001 - the loop outlives a bad tick
                logger.error("mail loop tick failed: %s", type(exc).__name__)
            wait = settings.MAIL_SYNC_TICK_SECONDS - (time.monotonic() - started)
            while wait > 0 and not self.stopping:
                time.sleep(min(wait, 1))
                wait -= 1
```

- [ ] **Step 4: The command**

Replace `services/mail/management/commands/sync_mail.py` with:

```python
"""Sync connected mailboxes. `--loop` runs the mail loop until SIGTERM (the
`mailsync` service in revenact-infra): Gmail every minute or on a push,
Outlook and IMAP every ten. Without it, one pass over every live mailbox;
`--user <email>` for one person."""

from django.core.management.base import BaseCommand, CommandError

from services.mail.loop import Loop, run_all
from services.mail.models import MailboxConnection


class Command(BaseCommand):
    help = "Sync connected mailboxes into the customer records (--loop: until stopped)."

    def add_arguments(self, parser):
        parser.add_argument("--user", help="Only this person's mailbox (their login email).")
        parser.add_argument("--loop", action="store_true", help="Run the mail loop until SIGTERM.")

    def handle(self, *args, **options):
        if options["loop"]:
            if options["user"]:
                raise CommandError("--loop syncs every mailbox; drop --user.")
            self.stdout.write("mail loop: started")
            Loop().forever()
            self.stdout.write("mail loop: stopped")
            return
        synced, filed = run_all(user_email=options["user"])
        errors = MailboxConnection.objects.filter(status=MailboxConnection.Status.ERROR)
        if options["user"]:
            errors = errors.filter(user__email=options["user"])
        for connection in errors:
            # The mailbox's own address and a fixed reason; never mail content.
            self.stderr.write(f"  {connection.address}: {connection.error}")
        self.stdout.write(
            self.style.SUCCESS(
                f"synced {synced} mailbox(es): filed {filed} email(s), "
                f"{errors.count()} need attention"
            )
        )
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: all PASS, the existing `SyncTests.test_the_command_syncs_every_connection` included.

- [ ] **Step 6: Commit**

```bash
git add services/mail/loop.py services/mail/management/commands/sync_mail.py \
  services/mail/tests/test_loop.py
git commit -m "$(cat <<'EOF'
feat(mail): run mail sync as a loop that leases due mailboxes

sync_mail --loop ticks every five seconds: the gate sweep once a minute,
then up to ten due mailboxes claimed with FOR UPDATE SKIP LOCKED and a
lease, Gmail every minute or on a push, Outlook and IMAP every ten with a
failed pass waiting the same; one broken mailbox never stops the rest.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 11: My mailbox: the connection payload, disconnect with 30-day retention, Sync now, the summary

**Files:**
- Modify: `services/mail/serializers.py` (imports; new `import_block`, `connection_payload`, `disconnected_block`)
- Modify: `services/mail/views.py` (imports, a module `logger`; `MyMailboxView` :55; `ConnectView` IMAP return; `SyncNowView` :188; `MailSummaryView.get` :307; new `_disconnect_google`)
- Modify: `services/mail/tests/test_mail.py` (`ConnectionTests.test_credentials_are_encrypted_at_rest_and_never_serialised`: the IMAP provider entry gains `"gate": None`)
- Test: `services/mail/tests/test_my_mailbox.py`

**Interfaces:**
- Consumes:
  - `gates.paused_reason`, `connect_gate`, `live_mailbox`, `paused_response` (Task 6);
  - `scopes.short_names` (Task 1);
  - `GmailSession.stop` and `revoke` (Task 3);
  - `MailboxConnection.is_google` and `two_way` (Task 1).
- Produces (`services.mail.serializers`):
  - `import_block(connection) -> dict` (`state`, `imported`, `total_estimate`, `done_at`);
  - `connection_payload(connection) -> dict`, which is contract §3's `connection`;
  - `disconnected_block(connection) -> dict` (`provider`, `address`, `disconnected_at`, `delete_after`).
- The endpoints:
  - `GET mail/connection/` gains `disconnected`, and `providers[].gate`.
  - `DELETE mail/connection/` on Google keeps the row as a tombstone.
  - `POST mail/sync/` on Google answers 202 (queued), or 409 when paused.
  - `GET mail/messages/summary/` gains `import` and `paused_reason`.

- [ ] **Step 1: Write the failing tests**

In `services/mail/tests/test_mail.py`, in `test_credentials_are_encrypted_at_rest_and_never_serialised`, change the provider assertion to:

```python
        self.assertIn(
            {"key": "imap", "label": "IMAP / SMTP", "uses_oauth": False, "gate": None},
            data["providers"],
        )
```

Create `services/mail/tests/test_my_mailbox.py`:

```python
"""My mailbox (contract §3): the connection payload with scopes, import,
push and a live pause; the provider gates; a Google disconnect that revokes,
wipes and keeps the copies for 30 days; Sync now queued for Google and
refused while paused; the summary's import and pause."""

from datetime import timedelta
from unittest.mock import patch

from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation, User
from services.mail import scopes
from services.mail.models import MailboxConnection, MailMessage

from .gmail_fixtures import GmailFixture
from .test_mail import FakeProvider

URL = "/api/v1/mail/connection/"
CONNECTION_KEYS = {
    "id",
    "provider",
    "provider_display",
    "address",
    "display_name",
    "status",
    "error",
    "last_synced_at",
    "created_at",
    "two_way",
    "needs_reconnect",
    "granted_scopes",
    "import",
    "push",
    "paused_reason",
}


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID="cid",
    GOOGLE_OAUTH_CLIENT_SECRET="sec",
    GMAIL_PUBSUB_TOPIC="projects/revenact/topics/gmail",
    MAIL_DISCONNECT_RETENTION_DAYS=30,
)
class MyMailboxTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.fake = self.use_gmail()
        self.now = timezone.now()
        self.as_dana()

    def as_dana(self):
        self.client.force_authenticate(User.objects.get(pk=self.dana.pk))

    def get(self):
        return self.client.get(URL).data

    def kept_message(self, connection):
        return MailMessage.objects.create(
            connection=connection,
            owner=self.dana,
            organisation=self.org,
            provider_message_id="g1",
            direction="received",
            subject="Hi",
            sent_at=self.now,
        )

    def google_provider(self, data):
        return next(p for p in data["providers"] if p["key"] == "google")

    # -- GET --------------------------------------------------------------
    def test_a_google_connection_reports_scopes_import_push_and_pause(self):
        c = self.google(
            self.dana,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_total_estimate=18000,
            watch_expires_at=self.now + timedelta(days=2),
            last_synced_at=self.now,
        )
        self.kept_message(c)
        data = self.get()
        connection = data["connection"]
        self.assertEqual(set(connection), CONNECTION_KEYS)
        self.assertEqual(
            (
                connection["two_way"],
                connection["needs_reconnect"],
                connection["push"],
                connection["paused_reason"],
            ),
            (True, False, True, None),
        )
        self.assertEqual(
            connection["granted_scopes"], ["gmail.modify", "gmail.send", "gmail.compose"]
        )
        self.assertEqual(
            connection["import"],
            {"state": "importing", "imported": 1, "total_estimate": 18000, "done_at": None},
        )
        self.assertIsNone(data["disconnected"])
        self.assertEqual(
            self.google_provider(data),
            {
                "key": "google",
                "label": "Google Workspace / Gmail",
                "uses_oauth": True,
                "gate": None,
            },
        )

    def test_the_pause_is_live_and_a_read_only_grant_needs_a_reconnect(self):
        self.google(
            self.dana,
            granted_scopes=["https://www.googleapis.com/auth/gmail.readonly", scopes.SEND],
        )
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        self.as_dana()
        data = self.get()
        c = data["connection"]
        self.assertEqual(
            (c["paused_reason"], c["two_way"], c["needs_reconnect"]), ("workspace_off", False, True)
        )
        self.assertEqual(c["granted_scopes"], ["gmail.readonly", "gmail.send"])
        self.assertEqual(self.google_provider(data)["gate"], "GMAIL_NOT_ENABLED")
        # GET writes nothing; the loop's sweep stores the pause.
        self.assertEqual(MailboxConnection.objects.get(user=self.dana).paused_reason, "")

    def test_a_revoked_grant_needs_a_reconnect(self):
        self.google(
            self.dana,
            status="error",
            paused_reason="token_revoked",
            error="Google access was revoked. Reconnect Google.",
        )
        c = self.get()["connection"]
        self.assertEqual(
            (c["status"], c["paused_reason"], c["needs_reconnect"]),
            ("error", "token_revoked", True),
        )

    def test_outlook_and_imap_answer_with_the_new_fields_empty(self):
        self.connect(self.dana)
        c = self.get()["connection"]
        self.assertEqual(
            {
                k: c[k]
                for k in (
                    "two_way",
                    "needs_reconnect",
                    "granted_scopes",
                    "import",
                    "push",
                    "paused_reason",
                )
            },
            {
                "two_way": False,
                "needs_reconnect": False,
                "granted_scopes": [],
                "import": None,
                "push": False,
                "paused_reason": None,
            },
        )

    # -- DELETE -----------------------------------------------------------
    def test_a_google_disconnect_revokes_wipes_and_keeps_the_copies_for_30_days(self):
        c = self.google(
            self.dana,
            history_id=5,
            watch_expires_at=self.now + timedelta(days=2),
            wake_at=self.now,
            import_page_token="p2",
        )
        self.kept_message(c)
        self.assertEqual(self.client.delete(URL).status_code, 204)
        # A real request loads the user afresh; the test's user caches `mailbox`.
        self.as_dana()
        c.refresh_from_db()
        self.assertEqual(
            (
                c.status,
                c.credentials,
                c.history_id,
                c.wake_at,
                c.watch_expires_at,
                c.import_page_token,
            ),
            ("disconnected", "", None, None, None, ""),
        )
        self.assertEqual((self.fake.revoked, self.fake.stopped), (["fake-refresh"], 1))
        self.assertEqual(c.messages.count(), 1)
        delete_after = c.disconnected_at + timedelta(days=30)
        event = AuditEvent.objects.get(action="mailbox.disconnect")
        self.assertEqual(
            event.metadata,
            {
                "provider": "google",
                "address": "dana@acme.io",
                "revoked": True,
                "delete_after": delete_after.isoformat(),
            },
        )
        data = self.get()
        self.assertIsNone(data["connection"])
        self.assertEqual(
            data["disconnected"],
            {
                "provider": "google",
                "address": "dana@acme.io",
                "disconnected_at": c.disconnected_at,
                "delete_after": delete_after,
            },
        )
        # The owner still reads the kept copies; everywhere else it is no mailbox.
        self.assertEqual(self.client.get("/api/v1/mail/messages/").data["count"], 1)
        self.assertEqual(self.client.post("/api/v1/mail/sync/").status_code, 400)
        self.assertFalse(self.client.get("/api/v1/mail/messages/summary/").data["has_mailbox"])
        compose = self.client.post(
            f"/api/v1/customers/{self.pizza.id}/emails/send/",
            {"to": ["sam@pizzahut.com"], "subject": "Hi", "body": "x"},
            format="json",
        )
        self.assertEqual(compose.status_code, 400)
        self.assertEqual(self.client.delete(URL).status_code, 204)
        self.assertEqual(AuditEvent.objects.filter(action="mailbox.disconnect").count(), 1)

    def test_a_failed_revoke_still_disconnects(self):
        c = self.google(self.dana)
        self.fake.fail(r"^/revoke$", 400, "invalid_token")
        self.assertEqual(self.client.delete(URL).status_code, 204)
        c.refresh_from_db()
        self.assertEqual((c.status, c.credentials, self.fake.stopped), ("disconnected", "", 0))
        self.assertFalse(AuditEvent.objects.get(action="mailbox.disconnect").metadata["revoked"])

    # -- Sync now -----------------------------------------------------------
    def test_sync_now_queues_a_google_mailbox(self):
        c = self.google(self.dana)
        response = self.client.post("/api/v1/mail/sync/")
        self.assertEqual(response.status_code, 202)
        self.assertEqual(
            (response.data["provider"], response.data["filed"], response.data["queued"]),
            ("google", None, True),
        )
        c.refresh_from_db()
        self.assertIsNotNone(c.wake_at)
        self.assertEqual(self.fake.calls, [])

    def test_sync_now_on_a_paused_mailbox_is_refused(self):
        self.google(self.dana)
        Organisation.objects.filter(pk=self.org.pk).update(gmail_two_way_enabled=False)
        response = self.client.post("/api/v1/mail/sync/")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            (response.data["code"], response.data["paused_reason"]),
            ("MAILBOX_PAUSED", "workspace_off"),
        )

    def test_sync_now_on_imap_still_runs_inline(self):
        self.connect(self.dana)
        with patch("services.mail.sync.get_provider", return_value=FakeProvider()):
            response = self.client.post("/api/v1/mail/sync/")
        self.assertEqual((response.status_code, response.data["filed"]), (200, 0))
        self.assertNotIn("queued", response.data)

    # -- the summary --------------------------------------------------------
    def test_the_summary_carries_the_import_and_the_pause(self):
        self.google(
            self.dana,
            import_after=self.now - timedelta(days=365),
            import_before=self.now,
            import_done_at=self.now,
        )
        data = self.client.get("/api/v1/mail/messages/summary/").data
        self.assertEqual(data["import"]["state"], "done")
        self.assertIsNone(data["paused_reason"])
        self.connect(self.carl)
        self.client.force_authenticate(self.carl)
        data = self.client.get("/api/v1/mail/messages/summary/").data
        self.assertEqual(
            (data["has_mailbox"], data["import"], data["paused_reason"]), (True, None, None)
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_my_mailbox services.mail.tests.test_mail --parallel auto --noinput`
Expected: FAIL. The payload lacks the new keys, `disconnected` and `gate`; DELETE deletes the row; Sync now answers 200 inline.

- [ ] **Step 3: The payloads**

In `services/mail/serializers.py`, change the imports to:

```python
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from . import gates, scopes
from .models import MailboxConnection, MailMessage
```

After `MailboxConnectionSerializer`, add:

```python
def import_block(connection):
    """The 12-month import's progress. `total_estimate` is the whole
    mailbox's messagesTotal (decision 16): `done` is final, the count is 'about'."""
    return {
        "state": "done" if connection.import_done_at else "importing",
        "imported": connection.messages.count(),
        "total_estimate": connection.import_total_estimate,
        "done_at": connection.import_done_at,
    }


def connection_payload(connection):
    """GET mail/connection/'s `connection` (contract §3). The pause is
    computed live, with the loop's own rule; Outlook and IMAP answer the new
    fields empty (§9). Never the credentials."""
    data = MailboxConnectionSerializer(connection).data
    google = connection.is_google
    paused = gates.paused_reason(connection)
    watching = (
        connection.watch_expires_at is not None and connection.watch_expires_at > timezone.now()
    )
    data.update(
        {
            "two_way": connection.two_way,
            "needs_reconnect": google
            and (not connection.two_way or paused == MailboxConnection.PausedReason.TOKEN_REVOKED),
            "granted_scopes": scopes.short_names(connection.granted_scopes) if google else [],
            "import": import_block(connection) if google else None,
            "push": bool(google and settings.GMAIL_PUBSUB_TOPIC and watching),
            "paused_reason": paused or None,
        }
    )
    return data


def disconnected_block(connection):
    """A Google row kept after a disconnect, and when the prune takes it."""
    return {
        "provider": connection.provider,
        "address": connection.address,
        "disconnected_at": connection.disconnected_at,
        "delete_after": connection.disconnected_at
        + timedelta(days=settings.MAIL_DISCONNECT_RETENTION_DAYS),
    }
```

- [ ] **Step 4: The views**

In `services/mail/views.py`:
- add `import logging` and `from datetime import timedelta` at the top;
- add `logger = logging.getLogger(__name__)` after the imports;
- add `connection_payload`, `disconnected_block` and `import_block` to the `.serializers` import;
- add `from .providers.base import Credentials` (beside `ProviderError`).

Replace `MyMailboxView` with:

```python
class MyMailboxView(APIView):
    """GET /api/v1/mail/connection/ — my connection (or null), a kept Google
    row's `disconnected` block, and the providers this deployment can
    connect, Google's with the first failing gate. DELETE disconnects:
    Outlook and IMAP are deleted at once (their copies with them); Google is
    revoked and wiped, and its copies kept for MAIL_DISCONNECT_RETENTION_DAYS.
    Filed emails stay on the record either way."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        row = getattr(request.user, "mailbox", None)
        live = gates.live_mailbox(request.user)
        offered = providers.available()
        gate = (
            gates.connect_gate(request.user) if any(p["key"] == GOOGLE for p in offered) else None
        )
        return Response(
            {
                "connection": connection_payload(live) if live else None,
                "disconnected": disconnected_block(row)
                if row is not None and live is None
                else None,
                "providers": [{**p, "gate": gate if p["key"] == GOOGLE else None} for p in offered],
            }
        )

    def delete(self, request):
        connection = gates.live_mailbox(request.user)
        if connection is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        if connection.is_google:
            _disconnect_google(request, connection)
            return Response(status=status.HTTP_204_NO_CONTENT)
        # SOC2:LOG-01 a credential is being removed
        audit.record(
            "mailbox.disconnect",
            request=request,
            target=connection,
            metadata={"provider": connection.provider, "address": connection.address},
        )
        connection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _disconnect_google(request, connection):
    """Contract §3 DELETE: stop the watch and revoke the grant (both best
    effort), wipe the credentials and the sync state, keep the row and the
    person's copies until the nightly prune (decision 9)."""
    now = timezone.now()
    try:
        data = connection.get_credentials()
    except ValueError:
        data = {}
    revoked = False
    if data:
        if connection.watch_expires_at and connection.watch_expires_at > now:
            try:
                GmailSession(Credentials(address=connection.address, data=data)).stop()
            except ProviderError as exc:
                logger.info("gmail stop failed for connection %s: %s", connection.pk, exc.status)
        revoked = revoke(data.get("refresh_token", ""))
        if not revoked:
            logger.warning("gmail token revoke failed for connection %s", connection.pk)
    MailboxConnection.objects.filter(pk=connection.pk).update(
        credentials="",
        status=DISCONNECTED,
        disconnected_at=now,
        history_id=None,
        wake_at=None,
        lease_until=None,
        backoff_until=None,
        watch_expires_at=None,
        paused_reason="",
        import_page_token="",
        reconcile_started_at=None,
        reconcile_page_token="",
        updated_at=now,
    )
    delete_after = now + timedelta(days=settings.MAIL_DISCONNECT_RETENTION_DAYS)
    audit.record(  # SOC2:LOG-01 a credential was revoked and destroyed
        "mailbox.disconnect",
        request=request,
        target=connection,
        metadata={
            "provider": GOOGLE,
            "address": connection.address,
            "revoked": revoked,
            "delete_after": delete_after.isoformat(),
        },
    )
```

In `ConnectView.post`, change the IMAP success return to:

```python
        return Response(connection_payload(connection), status=status.HTTP_201_CREATED)
```

Replace `SyncNowView` with:

```python
class SyncNowView(APIView):
    """POST /api/v1/mail/sync/ — pull my mailbox now. Google is queued for the
    loop (202): an import page can take tens of seconds, and an inline tick
    would race the loop's lease (decision 25). Outlook and IMAP sync inline."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        connection = gates.live_mailbox(request.user)
        if connection is None:
            return Response({"detail": "No mailbox connected."}, status=status.HTTP_400_BAD_REQUEST)
        if connection.is_google:
            refused = gates.paused_response(connection)
            if refused is not None:
                return refused
            MailboxConnection.objects.filter(pk=connection.pk).update(wake_at=timezone.now())
            return Response(
                {**connection_payload(connection), "filed": None, "queued": True},
                status=status.HTTP_202_ACCEPTED,
            )
        filed = sync_mailbox(connection)
        connection.refresh_from_db()
        return Response({**connection_payload(connection), "filed": filed})
```

In `MailSummaryView.get`:
- replace `connection = getattr(request.user, "mailbox", None)` with `connection = gates.live_mailbox(request.user)`;
- add `google = connection is not None and connection.is_google` below it;
- in the response dict, after `"last_synced_at": ...`, add:

```python
                "import": import_block(connection) if google else None,
                "paused_reason": (gates.paused_reason(connection) or None) if google else None,
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/mail/serializers.py services/mail/views.py services/mail/tests/test_mail.py \
  services/mail/tests/test_my_mailbox.py
git commit -m "$(cat <<'EOF'
feat(mail): report gmail scopes, import, push and pause; keep copies on disconnect

The connection payload gains two_way, needs_reconnect, granted_scopes,
import, push and a live paused_reason, and Google's provider entry its
first failing gate. A Google disconnect stops the watch, revokes the grant,
wipes the credentials and keeps the person's copies for 30 days; Sync now
is queued for Google and refused while paused.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 12: The read side: labels, CC/BCC, HTML and attachments, owner-only, in a fixed number of queries

**Files:**
- Modify: `services/mail/serializers.py` (`MailMessageSerializer`, `MailMessageDetailSerializer`; new `label_payload`, `labels_by_gmail_id`)
- Modify: `services/mail/views.py` (`MailMessageListView.get`, `MailMessageDetailView`, `MailReplyView.post` pass the labels context; new `MailLabelListView`)
- Modify: `services/mail/urls.py`
- Test: `services/mail/tests/test_reading.py`

**Interfaces:**
- Consumes:
  - `MailLabel`, `MailAttachment` and the `MailMessage` fields (Task 1);
  - `gmail_store.store_gmail`, `mirror_labels` (Task 5);
  - `gates.live_mailbox` (Task 6).
- Produces:
  - `serializers.label_payload(label) -> {"id", "name", "color": {"background", "text"} | None}`;
  - `serializers.labels_by_gmail_id(user) -> dict[str, dict]` (one query);
  - list rows gain `cc`, `bcc`, `labels` and `has_attachments`;
  - the detail gains `html_body` and `attachments[] {id, filename, mime_type, size, is_inline, content_id, available: false}`;
  - `GET /api/v1/mail/labels/` → `[{id, gmail_id, name, color}]`.

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_reading.py`:

```python
"""Reading the person's own Gmail (contract §6): user labels resolved by
name, CC and BCC, the sanitised HTML and the attachment details, all
owner-only (a manager or an admin sees only the filed copy, without any of
it), and the list and detail in a fixed number of queries."""

from django.db import connection as db
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.mail import gmail_store
from services.mail.models import MailLabel, MailMessage

from .gmail_fake import fixture, gmail_message
from .gmail_fixtures import GmailFixture

RENEWALS_COLOR = {"background": "#16a766", "text": "#ffffff"}
PDF = {"filename": "q.pdf", "mime_type": "application/pdf", "size": 10}


class ReadingFixture(GmailFixture):
    def setUp(self):
        super().setUp()
        self.mailbox = self.google(self.dana)
        gmail_store.mirror_labels(self.mailbox, fixture("labels_list.json")["labels"])
        self.row, self.filed = gmail_store.store_gmail(
            self.mailbox, fixture("message_full.json"), now=timezone.now()
        )
        self.renewals = MailLabel.objects.get(gmail_id="Label_12")
        self.vendors = MailLabel.objects.get(gmail_id="Label_19")


class OwnerReadsTests(ReadingFixture):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.dana)

    def test_a_row_carries_user_labels_cc_bcc_and_attachments(self):
        [row] = self.client.get("/api/v1/mail/messages/").data["results"]
        self.assertEqual(
            row["labels"], [{"id": self.renewals.pk, "name": "Renewals", "color": RENEWALS_COLOR}]
        )
        self.assertEqual(
            (row["cc"], row["bcc"], row["has_attachments"]),
            ([["Sam Pizza", "sam@pizzahut.com"]], [], True),
        )
        for hidden in ("html_body", "attachments", "label_ids", "rfc_message_id", "references"):
            self.assertNotIn(hidden, row)

    def test_labels_sort_by_name_and_unknown_ids_are_ignored(self):
        MailMessage.objects.filter(pk=self.row.pk).update(
            label_ids=["INBOX", "Label_19", "Label_gone", "Label_12"]
        )
        [row] = self.client.get("/api/v1/mail/messages/").data["results"]
        self.assertEqual(
            [label["name"] for label in row["labels"]], ["Renewals", "Vendors/Billing"]
        )
        self.assertIsNone(row["labels"][1]["color"])

    def test_the_detail_has_the_safe_html_and_every_part(self):
        detail = self.client.get(f"/api/v1/mail/messages/{self.row.id}/").data
        self.assertIn('src="cid:logo@pizzahut.com"', detail["html_body"])
        self.assertNotIn("<script", detail["html_body"])
        self.assertTrue(detail["body"].startswith("Hi Dana,"))
        parts = list(self.row.attachments.order_by("part_id"))
        self.assertEqual(
            detail["attachments"],
            [
                {
                    "id": parts[0].pk,
                    "filename": "Renewal quote.pdf",
                    "mime_type": "application/pdf",
                    "size": 182311,
                    "is_inline": False,
                    "content_id": "",
                    "available": False,
                },
                {
                    "id": parts[1].pk,
                    "filename": "logo.png",
                    "mime_type": "image/png",
                    "size": 4210,
                    "is_inline": True,
                    "content_id": "logo@pizzahut.com",
                    "available": False,
                },
            ],
        )
        for hidden in ("rfc_message_id", "references", "label_ids"):
            self.assertNotIn(hidden, detail)

    def test_the_label_list_is_my_user_labels_by_name(self):
        self.assertEqual(
            self.client.get("/api/v1/mail/labels/").data,
            [
                {
                    "id": self.renewals.pk,
                    "gmail_id": "Label_12",
                    "name": "Renewals",
                    "color": RENEWALS_COLOR,
                },
                {
                    "id": self.vendors.pk,
                    "gmail_id": "Label_19",
                    "name": "Vendors/Billing",
                    "color": None,
                },
            ],
        )

    def test_no_labels_without_a_live_google_mailbox(self):
        self.mailbox.status = "disconnected"
        self.mailbox.save(update_fields=["status"])
        self.client.force_authenticate(type(self.dana).objects.get(pk=self.dana.pk))
        self.assertEqual(self.client.get("/api/v1/mail/labels/").data, [])
        self.connect(self.priya)
        self.client.force_authenticate(self.priya)
        self.assertEqual(self.client.get("/api/v1/mail/labels/").data, [])

    def test_outlook_and_imap_rows_answer_the_new_fields_empty(self):
        imap = self.connect(self.carl)
        MailMessage.objects.create(
            connection=imap,
            owner=self.carl,
            organisation=self.org,
            provider_message_id="<m1@x.io>",
            direction="received",
            subject="Hi",
            sent_at=timezone.now(),
        )
        self.client.force_authenticate(self.carl)
        [row] = self.client.get("/api/v1/mail/messages/").data["results"]
        self.assertEqual(
            (row["cc"], row["bcc"], row["labels"], row["has_attachments"]), ([], [], [], False)
        )
        detail = self.client.get(f"/api/v1/mail/messages/{row['id']}/").data
        self.assertEqual((detail["html_body"], detail["attachments"]), ("", []))


class PrivacyTests(ReadingFixture):
    def test_nobody_else_reads_it_not_the_manager_nor_an_admin(self):
        # Carl is Dana's manager; Alice is an admin holding every capability.
        for viewer in (self.carl, self.alice):
            with self.subTest(viewer=viewer.name):
                self.client.force_authenticate(viewer)
                self.assertEqual(self.client.get("/api/v1/mail/messages/").data["count"], 0)
                self.assertEqual(
                    self.client.get(f"/api/v1/mail/messages/{self.row.id}/").status_code, 404
                )
                self.assertEqual(self.client.get("/api/v1/mail/labels/").data, [])
                # They read the filed copy, under the chain rule, and nothing more.
                filed = self.client.get(f"/api/v1/customers/{self.pizza.id}/emails/").data
                self.assertEqual([e["id"] for e in filed], [self.filed.id])
                for key in (
                    "labels",
                    "cc",
                    "bcc",
                    "html_body",
                    "attachments",
                    "has_attachments",
                    "label_ids",
                ):
                    self.assertNotIn(key, filed[0])

    def test_a_peer_does_not_see_the_filed_copy_either(self):
        self.client.force_authenticate(self.priya)
        self.assertEqual(self.client.get(f"/api/v1/customers/{self.pizza.id}/emails/").data, [])


class QueryCeilingTests(ReadingFixture):
    def test_the_list_and_the_detail_read_a_fixed_number_of_queries(self):
        self.client.force_authenticate(self.dana)
        with CaptureQueriesContext(db) as one:
            self.client.get("/api/v1/mail/messages/")
        now = timezone.now()
        for n in range(9):
            gmail_store.store_gmail(
                self.mailbox,
                gmail_message(f"q{n}", labels=["INBOX", "Label_12", "Label_19"], attachments=[PDF]),
                now=now,
            )
        with CaptureQueriesContext(db) as ten:
            data = self.client.get("/api/v1/mail/messages/").data
        self.assertEqual(data["count"], 10)
        self.assertEqual(len(one), len(ten))
        self.assertLessEqual(len(ten), 4)
        row = MailMessage.objects.get(provider_message_id="q5")
        with CaptureQueriesContext(db) as detail:
            self.client.get(f"/api/v1/mail/messages/{row.id}/")
        self.assertLessEqual(len(detail), 4)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_reading --parallel auto --noinput`
Expected: FAIL. The rows have no `labels`, `cc`, `bcc` or `has_attachments`; the detail has no `html_body` or `attachments`; `mail/labels/` is 404.

- [ ] **Step 3: The serializers**

In `services/mail/serializers.py`, change `from .models import MailboxConnection, MailMessage` to `from .models import MailboxConnection, MailLabel, MailMessage`.

Before `MailMessageSerializer`, add:

```python
def label_payload(label):
    """A user label as the API shows it: Revenact's id, never Gmail's
    (a label made here in D2 has no Gmail id until the outbox sends it)."""
    has_color = label.color_background or label.color_text
    color = {"background": label.color_background, "text": label.color_text} if has_color else None
    return {"id": label.pk, "name": label.name, "color": color}


def labels_by_gmail_id(user):
    """The person's own user labels, by Gmail id, in one query: the message
    serializers' `labels` context."""
    # SOC2:AUTH-02 a mailbox's labels are its owner's alone
    rows = MailLabel.objects.filter(connection__user=user, type=MailLabel.Type.USER).exclude(
        gmail_id=""
    )
    return {label.gmail_id: label_payload(label) for label in rows}
```

Replace `MailMessageSerializer` and `MailMessageDetailSerializer` with:

```python
class MailMessageSerializer(serializers.ModelSerializer):
    """One row of the person's inbox. `account` is the filed copy's parent,
    when the message matched someone in the book; `priority` is that or the
    provider's own importance flag. `labels` are the message's user labels,
    resolved through the `labels` context (labels_by_gmail_id), sorted by
    name; system and category labels are already the folder, flags and
    category, and ids Gmail no longer has are ignored."""

    priority = serializers.BooleanField(read_only=True)
    account = serializers.SerializerMethodField()
    labels = serializers.SerializerMethodField()

    class Meta:
        model = MailMessage
        fields = [
            "id",
            "thread_id",
            "direction",
            "from_name",
            "from_address",
            "to",
            "cc",
            "bcc",
            "subject",
            "snippet",
            "sent_at",
            "folder",
            "category",
            "state",
            "is_read",
            "is_starred",
            "is_important",
            "priority",
            "account",
            "labels",
            "has_attachments",
        ]

    def get_account(self, message):
        email = message.email
        if email is None:
            return None
        if email.customer_id is not None:
            return {"id": email.customer_id, "name": email.customer.name, "type": "customer"}
        if email.account_id is not None:
            return {"id": email.account_id, "name": email.account.name, "type": "account"}
        return None

    def get_labels(self, message):
        by_id = self.context.get("labels") or {}
        found = [by_id[gmail_id] for gmail_id in message.label_ids or [] if gmail_id in by_id]
        return sorted(found, key=lambda label: label["name"].lower())


class MailMessageDetailSerializer(MailMessageSerializer):
    """The whole message: the text body, the sanitised HTML ("" when there is
    none, or it was too large), and every file part, inline ones included
    so D2 can resolve cid: images. `available` is false until D2's download
    route; rfc_message_id, references and raw label ids are never exposed."""

    attachments = serializers.SerializerMethodField()

    class Meta(MailMessageSerializer.Meta):
        fields = MailMessageSerializer.Meta.fields + ["body", "html_body", "attachments"]

    def get_attachments(self, message):
        return [
            {
                "id": part.pk,
                "filename": part.filename,
                "mime_type": part.mime_type,
                "size": part.size,
                "is_inline": part.is_inline,
                "content_id": part.content_id,
                "available": False,
            }
            for part in sorted(message.attachments.all(), key=lambda part: part.part_id)
        ]
```

- [ ] **Step 4: The views and the route**

In `services/mail/views.py`:
- add `label_payload` and `labels_by_gmail_id` to the `.serializers` import;
- change `from .models import MailboxConnection, MailMessage` to `from .models import MailboxConnection, MailLabel, MailMessage`;
- add `from django.db.models.functions import Lower`.

In `MailMessageListView.get`, replace the last line with:

```python
        context = {"labels": labels_by_gmail_id(request.user)}
        return paginator.get_paginated_response(
            MailMessageSerializer(page, many=True, context=context).data
        )
```

Replace `MailMessageDetailView` with:

```python
class MailMessageDetailView(APIView):
    """GET /api/v1/mail/messages/<id>/ — the whole message. PATCH changes
    `is_read`, `is_starred` or `state` here only: nothing goes back to the
    provider in D1. For Gmail the change lasts until Gmail next reports a
    change to the message (decision 11); Outlook and IMAP keep it."""

    permission_classes = [IsAuthenticated]

    def _detail(self, request, message):
        context = {"labels": labels_by_gmail_id(request.user)}
        return Response(MailMessageDetailSerializer(message, context=context).data)

    def get(self, request, pk):
        return self._detail(request, get_object_or_404(_own_messages(request), pk=pk))

    def patch(self, request, pk):
        message = get_object_or_404(_own_messages(request), pk=pk)
        serializer = MailMessageUpdateSerializer(message, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(locally_changed_at=timezone.now())
        return self._detail(request, message)
```

In `MailReplyView.post`, replace the final `return Response(MailMessageDetailSerializer(sent).data if sent else {}, ...)` with:

```python
        context = {"labels": labels_by_gmail_id(request.user)}
        return Response(
            MailMessageDetailSerializer(sent, context=context).data if sent else {},
            status=status.HTTP_201_CREATED,
        )
```

After `MailMessageDetailView`, add:

```python
class MailLabelListView(APIView):
    """GET /api/v1/mail/labels/ — my own live Google mailbox's user labels,
    by name, not paginated. [] without one. No counts in D1."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # SOC2:AUTH-02 the caller's own connection only
        connection = gates.live_mailbox(request.user)
        if connection is None or not connection.is_google:
            return Response([])
        rows = (
            MailLabel.objects.filter(connection=connection, type=MailLabel.Type.USER)
            .exclude(gmail_id="")
            .order_by(Lower("name"), "pk")
        )
        # Contract key order: id, gmail_id, name, color.
        return Response(
            [
                {
                    "id": label.pk,
                    "gmail_id": label.gmail_id,
                    "name": label.name,
                    "color": label_payload(label)["color"],
                }
                for label in rows
            ]
        )
```

In `services/mail/urls.py`, after the `mail/messages/<int:pk>/reply/` route, add:

```python
(path("mail/labels/", views.MailLabelListView.as_view(), name="mail-labels"),)
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/mail/serializers.py services/mail/views.py services/mail/urls.py \
  services/mail/tests/test_reading.py
git commit -m "$(cat <<'EOF'
feat(mail): show gmail labels, cc/bcc, html and attachment details to the owner

List rows gain user labels (one query per page), cc, bcc and
has_attachments; the detail gains the sanitised html and every file part;
GET mail/labels/ lists the owner's user labels. A manager or an admin still
reads only the filed copy.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 13: The push webhook: OIDC verified, fail-closed, a wake-up only

**Files:**
- Create: `services/mail/push.py`
- Modify: `core/throttling.py` (new `GmailPushThrottle`)
- Modify: `services/mail/views.py` (new `GmailPushView`)
- Modify: `services/mail/urls.py`
- Test: `services/mail/tests/test_push.py`

**Interfaces:**
- Consumes:
  - the settings `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_AUDIENCE` and `GMAIL_PUBSUB_SERVICE_ACCOUNT`, and the throttle scope `gmail_push` (Task 1);
  - PyJWT 2.15.1 (`jwt.decode`, `jwt.PyJWKClient`);
  - `core.audit.record(..., anonymous=True)`.
- Produces (`services.mail.push`):
  - `GOOGLE_CERTS`, `ISSUERS`, `MAX_BODY` (65536);
  - `Rejected(reason, status)`;
  - `_signing_key(token)`, which tests patch;
  - `verify(authorization: str) -> dict`, the verified claims;
  - `wake(data_b64: str, *, now=None) -> int`, the rows woken.
- `POST /api/v1/mail/google/push/` answers 204, 401, 403, 404, 413 or 429 (contract §7).
- `core.throttling.GmailPushThrottle` (per source IP, scope `gmail_push`).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_push.py`:

```python
"""Gmail's Pub/Sub push (contract §7): only a Google-signed OIDC token for
the configured audience and service account gets in, and fails closed when
either is unset; a verified push only sets wake_at, and only on a live,
unpaused mailbox that holds older history; every push is acknowledged so
Pub/Sub never retries a useless one; rejections are audited."""

import base64
import json
import time
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from core.throttling import GmailPushThrottle
from services.mail.models import MailboxConnection

from .gmail_fixtures import GmailFixture

URL = "/api/v1/mail/google/push/"
AUDIENCE = "https://revenact.test/api/v1/mail/google/push/"
ACCOUNT = "gmail-push@revenact-test.iam.gserviceaccount.com"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def token(key=KEY, **claims):
    now = int(time.time())
    body = {
        "aud": AUDIENCE,
        "iss": "https://accounts.google.com",
        "iat": now,
        "exp": now + 300,
        "email": ACCOUNT,
        "email_verified": True,
        **claims,
    }
    return jwt.encode({k: v for k, v in body.items() if v is not None}, key, algorithm="RS256")


def envelope(address="dana@acme.io", history_id=5000):
    data = base64.b64encode(
        json.dumps({"emailAddress": address, "historyId": history_id}).encode()
    ).decode()
    return {
        "message": {
            "data": data,
            "messageId": "2070443601311540",
            "publishTime": "2026-10-10T09:14:01Z",
        },
        "subscription": "projects/revenact/subscriptions/gmail-push",
    }


@override_settings(
    GMAIL_PUBSUB_TOPIC="projects/revenact/topics/gmail",
    GMAIL_PUBSUB_AUDIENCE=AUDIENCE,
    GMAIL_PUBSUB_SERVICE_ACCOUNT=ACCOUNT,
)
class PushTests(GmailFixture):
    def setUp(self):
        super().setUp()
        cache.clear()
        patcher = patch("services.mail.push._signing_key", return_value=KEY.public_key())
        patcher.start()
        self.addCleanup(patcher.stop)
        self.mailbox = self.google(self.dana, history_id=4000)

    def push(self, body=None, bearer=None, raw=None):
        headers = {} if bearer is False else {"HTTP_AUTHORIZATION": f"Bearer {bearer or token()}"}
        payload = raw if raw is not None else json.dumps(body or envelope())
        return self.client.generic("POST", URL, payload, content_type="application/json", **headers)

    def woken(self):
        self.mailbox.refresh_from_db()
        return self.mailbox.wake_at

    def test_a_verified_push_wakes_the_mailbox_and_nothing_else(self):
        with patch("services.mail.providers.google.http_json") as google:
            response = self.push()
        self.assertEqual((response.status_code, response.content), (204, b""))
        self.assertIsNotNone(self.woken())
        google.assert_not_called()

    def test_an_earlier_wake_is_kept(self):
        earlier = timezone.now().replace(microsecond=0) - timezone.timedelta(minutes=5)
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(wake_at=earlier)
        self.push()
        self.assertEqual(self.woken(), earlier)

    def test_useless_pushes_are_acknowledged_and_ignored(self):
        MailboxConnection.objects.filter(pk=self.mailbox.pk).update(history_id=6000)
        for body, raw in (
            (envelope(history_id=5000), None),
            (envelope(address="stranger@acme.io"), None),
            ({"message": {"data": "not base64 json"}}, None),
            (None, "not json"),
        ):
            with self.subTest(body=body, raw=raw):
                self.assertEqual(self.push(body, raw=raw).status_code, 204)
        self.assertIsNone(self.woken())

    def test_a_paused_or_disconnected_mailbox_is_not_woken(self):
        for fields in ({"paused_reason": "workspace_off"}, {"status": "disconnected"}):
            with self.subTest(fields=fields):
                MailboxConnection.objects.filter(pk=self.mailbox.pk).update(
                    paused_reason="", status="connected", wake_at=None, **fields
                )
                self.assertEqual(self.push().status_code, 204)
                self.assertIsNone(self.woken())

    def test_bad_tokens_are_refused_and_audited(self):
        expired = token(exp=int(time.time()) - 10)
        for bearer, status_code, reason in (
            (False, 401, "missing"),
            ("not-a-jwt", 401, "invalid"),
            (token(OTHER_KEY), 401, "invalid"),
            (expired, 401, "invalid"),
            (token(aud="https://elsewhere.test/"), 401, "audience"),
            (token(iss="https://evil.example.com"), 401, "issuer"),
            (token(email="someone@evil.iam.gserviceaccount.com"), 403, "service_account"),
            (token(email_verified=False), 403, "service_account"),
        ):
            with self.subTest(reason=reason, status=status_code):
                AuditEvent.objects.all().delete()
                self.assertEqual(self.push(bearer=bearer).status_code, status_code)
                event = AuditEvent.objects.get(action="mailbox.push_rejected")
                self.assertEqual(
                    (event.outcome, event.actor, event.metadata),
                    ("failure", None, {"reason": reason}),
                )
        self.assertIsNone(self.woken())

    @override_settings(GMAIL_PUBSUB_AUDIENCE="")
    def test_without_an_audience_every_push_fails_closed(self):
        self.assertEqual(self.push().status_code, 401)
        self.assertEqual(
            AuditEvent.objects.get(action="mailbox.push_rejected").metadata,
            {"reason": "not_configured_audience"},
        )

    @override_settings(GMAIL_PUBSUB_SERVICE_ACCOUNT="")
    def test_without_a_service_account_every_push_fails_closed(self):
        self.assertEqual(self.push().status_code, 401)

    @override_settings(GMAIL_PUBSUB_TOPIC="")
    def test_push_off_is_404(self):
        self.assertEqual(self.push().status_code, 404)

    def test_a_body_over_64_kb_is_413(self):
        self.assertEqual(self.push(raw="x" * (64 * 1024 + 1)).status_code, 413)

    def test_it_is_throttled_per_source_ip(self):
        with patch.object(GmailPushThrottle, "rate", "2/min"):
            codes = [self.push().status_code for _ in range(3)]
        self.assertEqual(codes, [204, 204, 429])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_push --parallel auto --noinput`
Expected: ERROR, `ImportError: cannot import name 'GmailPushThrottle'`.

- [ ] **Step 3: The throttle**

In `core/throttling.py`, after `CampaignUnsubscribeThrottle`, add:

```python
class GmailPushThrottle(_PerIPThrottle):
    """Gmail's Pub/Sub push (services/mail/views.py GmailPushView), per
    source IP. Google pushes from its own addresses, so this caps noise and
    forged traffic, not Google; Pub/Sub retries a 429 later."""

    scope = "gmail_push"
```

- [ ] **Step 4: Verification and the wake-up**

Create `services/mail/push.py`:

```python
"""Gmail's Pub/Sub push, verified and turned into a wake-up (contract §7).

The subscription pushes with an OIDC token Google signs for the configured
service account. It is verified here with PyJWT against Google's JWKS (no
Google SDK, as providers/base.py asks), failing closed when the audience or
the service account is not configured. A verified push only sets `wake_at`
on the live, unpaused mailbox whose address it names, when it reports newer
history than that mailbox holds; the loop's next tick does the work. Nothing
is logged from the push's data.
"""

import base64
import binascii
import json

import jwt
from django.conf import settings
from django.db.models import DateTimeField, F, Q, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import MailboxConnection

GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")
MAX_BODY = 64 * 1024

_jwks = None


class Rejected(Exception):
    def __init__(self, reason, status):
        super().__init__(reason)
        self.reason = reason
        self.status = status


def _signing_key(token):
    """Google's public key for this token. The JWKS is fetched over HTTPS
    from a fixed Google URL and its keys are cached for an hour."""
    global _jwks
    if _jwks is None:
        _jwks = jwt.PyJWKClient(GOOGLE_CERTS, cache_keys=True, lifespan=3600, timeout=10)
    return _jwks.get_signing_key_from_jwt(token).key


def verify(authorization):
    """The verified claims, or Rejected(reason, 401 | 403)."""
    if not settings.GMAIL_PUBSUB_AUDIENCE:
        raise Rejected("not_configured_audience", 401)
    if not settings.GMAIL_PUBSUB_SERVICE_ACCOUNT:
        raise Rejected("not_configured_service_account", 401)
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise Rejected("missing", 401)
    token = token.strip()
    try:
        claims = jwt.decode(
            token,
            _signing_key(token),
            algorithms=["RS256"],
            audience=settings.GMAIL_PUBSUB_AUDIENCE,
            issuer=ISSUERS,
            options={"require": ["exp", "iss", "aud"]},
        )
    except jwt.InvalidAudienceError as exc:
        raise Rejected("audience", 401) from exc
    except jwt.InvalidIssuerError as exc:
        raise Rejected("issuer", 401) from exc
    except jwt.PyJWTError as exc:
        # Malformed, badly signed, expired, or the JWKS unreachable: fail closed.
        raise Rejected("invalid", 401) from exc
    if (
        claims.get("email") != settings.GMAIL_PUBSUB_SERVICE_ACCOUNT
        or claims.get("email_verified") is not True
    ):
        raise Rejected("service_account", 403)
    return claims


def wake(data_b64, *, now=None):
    """One UPDATE: wake_at = COALESCE(wake_at, now) on the live, unpaused
    Google mailbox the push names, when its historyId is newer than ours.
    Returns the rows woken; a malformed push wakes nothing."""
    try:
        decoded = json.loads(base64.b64decode(data_b64 or ""))
        address = str(decoded["emailAddress"]).strip().lower()
        history_id = int(decoded["historyId"])
    except (ValueError, KeyError, TypeError, binascii.Error):
        return 0
    now = now or timezone.now()
    return (
        MailboxConnection.objects.filter(
            provider=MailboxConnection.Provider.GOOGLE, address=address, paused_reason=""
        )
        .exclude(status=MailboxConnection.Status.DISCONNECTED)
        .filter(Q(history_id__isnull=True) | Q(history_id__lt=history_id))
        .update(wake_at=Coalesce(F("wake_at"), Value(now, output_field=DateTimeField())))
    )
```

- [ ] **Step 5: The view and the route**

In `services/mail/views.py`, add `import json` at the top, `from core.throttling import GmailPushThrottle` after `from core.models import AuditEvent`, and `from . import gates, gmail_sync, providers, push, scopes` in place of the current `from . import ...` line. After `OAuthCallbackView`'s helpers, add:

```python
class GmailPushView(APIView):
    """POST /api/v1/mail/google/push/ — Gmail's Pub/Sub push. Public by
    necessity (Pub/Sub sends no session); its OIDC token is the only thing
    trusted. A DRF view is already CSRF-exempt and builds no URL from input.
    A verified push is always 204, whatever it says (decision 27)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [GmailPushThrottle]

    def post(self, request):
        raw = request.body or b""
        if len(raw) > push.MAX_BODY:
            return Response(status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        if not settings.GMAIL_PUBSUB_TOPIC:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            # SOC2:API-11 a Google-signed token for our audience and service account
            push.verify(request.headers.get("Authorization", ""))
        except push.Rejected as exc:
            audit.record(  # SOC2:LOG-01
                "mailbox.push_rejected",
                request=request,
                anonymous=True,
                outcome=AuditEvent.Outcome.FAILURE,
                metadata={"reason": exc.reason},
            )
            return Response(status=exc.status)
        try:
            data = json.loads(raw.decode() or "{}").get("message", {}).get("data", "")
        except (ValueError, UnicodeDecodeError, AttributeError):
            data = ""
        push.wake(data)
        return Response(status=status.HTTP_204_NO_CONTENT)
```

In `services/mail/urls.py`, after `mail/labels/`, add:

```python
(path("mail/google/push/", views.GmailPushView.as_view(), name="mail-google-push"),)
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail core --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add services/mail/push.py core/throttling.py services/mail/views.py services/mail/urls.py \
  services/mail/tests/test_push.py
git commit -m "$(cat <<'EOF'
feat(mail): accept gmail push as a verified wake-up

The Pub/Sub OIDC token is verified with PyJWT against Google's JWKS for
the configured audience and service account, failing closed when either is
unset; a verified push sets wake_at on the live mailbox it names and is
always acknowledged, and a rejected one is audited. Rate-limited per IP.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 14: The nightly prune, and the whole journey end to end

**Files:**
- Create: `services/mail/prune.py`
- Modify: `services/customers/management/commands/run_health_maintenance.py`. The new block goes after the rules block, which ends near :395, and before `# The metric layer's month-end`. There the variable `organisation` is still the `--org-email` scope; the loops below reassign it.
- Test: `services/mail/tests/test_prune.py`
- Test: `e2e/test_gmail_flow.py`

**Interfaces:**
- Consumes:
  - `MAIL_DISCONNECT_RETENTION_DAYS` (Task 1);
  - the disconnect tombstone (Task 11);
  - everything before it, for the e2e flow.
- Produces: `services.mail.prune.prune(organisation=None, *, now=None, dry_run=False) -> int` (how many connections it deleted, or would delete).

- [ ] **Step 1: Write the failing tests**

Create `services/mail/tests/test_prune.py`:

```python
"""The nightly prune (contract decision 9): a Google mailbox disconnected
more than 30 days ago goes, its copies, labels and attachment details with
it; the filed Email stays with its mailbox nulled; each deletion is
audited; a dry run only counts."""

import io
from datetime import timedelta

from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.customers.models import Email
from services.mail import gmail_store, prune
from services.mail.models import MailAttachment, MailboxConnection, MailLabel, MailMessage

from .gmail_fake import fixture
from .gmail_fixtures import GmailFixture


@override_settings(MAIL_DISCONNECT_RETENTION_DAYS=30)
class PruneTests(GmailFixture):
    def setUp(self):
        super().setUp()
        self.now = timezone.now()
        self.old = self.google(self.dana)
        gmail_store.mirror_labels(self.old, fixture("labels_list.json")["labels"])
        _, self.filed = gmail_store.store_gmail(
            self.old, fixture("message_full.json"), now=self.now
        )
        MailboxConnection.objects.filter(pk=self.old.pk).update(
            status="disconnected", credentials="", disconnected_at=self.now - timedelta(days=31)
        )
        self.recent = self.google(
            self.carl, status="disconnected", disconnected_at=self.now - timedelta(days=29)
        )
        self.live = self.google(self.alice)

    def test_only_rows_past_their_30_days_go_with_everything_personal(self):
        self.assertEqual(prune.prune(now=self.now), 1)
        self.assertEqual(
            set(MailboxConnection.objects.values_list("pk", flat=True)),
            {self.recent.pk, self.live.pk},
        )
        for model in (MailMessage, MailLabel, MailAttachment):
            self.assertFalse(model.objects.exists(), model.__name__)
        self.filed.refresh_from_db()
        self.assertIsNone(self.filed.mailbox)
        event = AuditEvent.objects.get(action="mailbox.pruned")
        self.assertEqual(
            (event.actor, event.organisation, event.metadata),
            (None, self.org, {"provider": "google", "address": "dana@acme.io", "messages": 1}),
        )

    def test_a_dry_run_only_counts_and_another_workspace_is_left_alone(self):
        self.assertEqual(prune.prune(now=self.now, dry_run=True), 1)
        self.assertTrue(MailboxConnection.objects.filter(pk=self.old.pk).exists())
        other = Organisation.objects.create(name="Other Co")
        self.assertEqual(prune.prune(other, now=self.now), 0)
        self.assertTrue(MailboxConnection.objects.filter(pk=self.old.pk).exists())
        self.assertEqual(Email.objects.count(), 1)

    def test_the_nightly_job_runs_it(self):
        out = io.StringIO()
        call_command("run_health_maintenance", "--dry-run", stdout=out)
        self.assertIn("would delete 1 disconnected mailbox(es)", out.getvalue())
        self.assertTrue(MailboxConnection.objects.filter(pk=self.old.pk).exists())
```

Create `e2e/test_gmail_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB; Gmail itself is
the in-memory FakeGmail (patched in this process, which the live server
shares), and Google's JWKS key is a local one.

Staff switch Acme on for Gmail. Dana sees no gate, starts the connect,
comes back from Google and is connected. The loop imports her mailbox, and
her inbox shows the labels, the CC, the safe HTML and the attachment
details. A push wakes the mailbox. Carl, her manager, reads none of it.
She disconnects, and her copies are kept for 30 days."""

import base64
import json
import time
import urllib.error
import urllib.request
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from django.core import signing
from django.test import LiveServerTestCase, override_settings
from django.utils import timezone
from rest_framework_simplejwt.tokens import AccessToken

from e2e.http import http_delete, http_get, http_post
from services.accounts.models import User
from services.billing.models import BillingAccount
from services.copilot.anthropic_client import CopilotNotConfigured
from services.customers.models import Customer
from services.identity.models import OrganizationDomain
from services.mail.loop import Loop
from services.mail.models import MailboxConnection
from services.mail.tests.gmail_fake import FakeGmail, fixture, gmail_message
from services.mail.views import STATE_SALT

AUDIENCE = "https://revenact.test/api/v1/mail/google/push/"
ACCOUNT = "gmail-push@revenact-test.iam.gserviceaccount.com"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


@override_settings(
    GOOGLE_OAUTH_CLIENT_ID="cid",
    GOOGLE_OAUTH_CLIENT_SECRET="sec",
    FRONTEND_URL="https://app.test",
    GMAIL_PUBSUB_TOPIC="projects/revenact/topics/gmail",
    GMAIL_PUBSUB_AUDIENCE=AUDIENCE,
    GMAIL_PUBSUB_SERVICE_ACCOUNT=ACCOUNT,
)
class GmailFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def member(self, admin, name, email):
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": name, "email": email, "password": "memberpass12"},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        return User.objects.get(pk=body["id"])

    def landing(self, url):
        """Where the callback sends the browser, without following it."""
        opener = urllib.request.build_opener(_NoRedirect)
        try:
            opener.open(url)
        except urllib.error.HTTPError as redirect:
            self.assertEqual(redirect.code, 302)
            location = redirect.headers["Location"]
            self.assertTrue(location.startswith("https://app.test/integrations?"))
            return {k: v[0] for k, v in parse_qs(urlsplit(location).query).items()}
        self.fail("the callback did not redirect")

    def push(self):
        now = int(time.time())
        claims = {
            "aud": AUDIENCE,
            "iss": "https://accounts.google.com",
            "iat": now,
            "exp": now + 300,
            "email": ACCOUNT,
            "email_verified": True,
        }
        data = base64.b64encode(
            json.dumps({"emailAddress": "dana@acme.io", "historyId": 99999}).encode()
        ).decode()
        request = urllib.request.Request(
            self.api("/mail/google/push/"),
            data=json.dumps({"message": {"data": data, "messageId": "1"}}).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {jwt.encode(claims, KEY, algorithm='RS256')}",
            },
            method="POST",
        )
        with urllib.request.urlopen(request) as response:
            return response.status

    def test_full_flow(self):
        fake = FakeGmail("dana@acme.io")
        quote = fixture("message_full.json")
        # Inside the 12-month window whenever this runs.
        yesterday = timezone.now() - timedelta(days=1)
        quote["internalDate"] = str(int(yesterday.timestamp() * 1000))
        fake.add(quote, quietly=True)
        fake.add(gmail_message("older", sent_at=timezone.now() - timedelta(days=200)), quietly=True)
        with (
            patch("services.mail.providers.google.http_json", fake),
            patch("services.mail.push._signing_key", return_value=KEY.public_key()),
            patch(
                "services.customers.classification.get_completion",
                side_effect=CopilotNotConfigured("no model in tests"),
            ),
        ):
            self.flow(fake)

    def flow(self, fake):
        # 1. The workspace, its people and its book.
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Acme Inc",
                "name": "Alice Admin",
                "email": "alice@acme.io",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        alice = body["access"]
        BillingAccount.objects.filter(organisation__name="Acme Inc").update(seats_limit=10)
        carl = self.member(alice, "Carl CSM", "carl@acme.io")
        dana = self.member(alice, "Dana CSM", "dana@acme.io")
        User.objects.filter(pk=dana.pk).update(reports_to=carl)
        acme = dana.organisation
        OrganizationDomain.objects.create(
            organisation=acme, domain="acme.io", verification_status="verified"
        )
        Customer.objects.create(
            organisation=acme, name="Pizza Hut", domain="pizzahut.com", owner=carl
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("carl", "dana")}

        # 2. Not switched on: the Connect button is a gate.
        status, body = http_get(self.api("/mail/connection/"), token=tokens["dana"])
        google = next(p for p in body["providers"] if p["key"] == "google")
        self.assertEqual(google["gate"], "GMAIL_NOT_ENABLED")

        # 3. Staff switch Acme on, with a reason.
        staff = User.objects.create_superuser(
            email="staff@revenact.io", password="supersecret-pw-1", name="Staff"
        )
        staff_token = AccessToken.for_user(staff)
        staff_token["mfa"] = True
        status, body = http_post(
            self.api(f"/platform/organisations/{acme.id}/gmail/"),
            {"enabled": True, "reason": "Pilot approved"},
            token=str(staff_token),
        )
        self.assertEqual((status, body["gmail"]["enabled"]), (200, True))

        # 4. Dana connects.
        status, body = http_post(self.api("/mail/connect/google/"), {}, token=tokens["dana"])
        self.assertEqual(status, 200, body)
        self.assertIn("gmail.modify", body["authorize_url"])
        state = signing.dumps({"user": dana.id, "provider": "google"}, salt=STATE_SALT)
        landed = self.landing(self.api(f"/mail/oauth/google/callback/?code=xyz&state={state}"))
        self.assertEqual(landed, {"mailbox": "connected"})

        # 5. The loop imports her mailbox.
        Loop().run_once()
        status, body = http_get(self.api("/mail/connection/"), token=tokens["dana"])
        self.assertEqual(body["connection"]["import"]["state"], "done")
        self.assertEqual(body["connection"]["import"]["imported"], 2)
        self.assertTrue(body["connection"]["two_way"])

        # 6. Her inbox shows the labels, the CC, the safe HTML and the parts.
        status, page = http_get(self.api("/mail/messages/"), token=tokens["dana"])
        quote = next(r for r in page["results"] if r["subject"] == "Renewal quote")
        self.assertEqual([label["name"] for label in quote["labels"]], ["Renewals"])
        self.assertEqual(quote["cc"], [["Sam Pizza", "sam@pizzahut.com"]])
        status, detail = http_get(self.api(f"/mail/messages/{quote['id']}/"), token=tokens["dana"])
        self.assertNotIn("<script", detail["html_body"])
        self.assertEqual(len(detail["attachments"]), 2)

        # 7. A push wakes the mailbox; Gmail is not called inline.
        calls = len(fake.calls)
        self.assertEqual(self.push(), 204)
        self.assertIsNotNone(MailboxConnection.objects.get(user=dana).wake_at)
        self.assertEqual(len(fake.calls), calls)

        # 8. Carl, her manager, reads none of it.
        status, body = http_get(self.api("/mail/messages/"), token=tokens["carl"])
        self.assertEqual(body["count"], 0)
        status, _ = http_get(self.api(f"/mail/messages/{quote['id']}/"), token=tokens["carl"])
        self.assertEqual(status, 404)

        # 9. She disconnects; the copies stay for 30 days.
        status, _ = http_delete(self.api("/mail/connection/"), token=tokens["dana"])
        self.assertEqual(status, 204)
        self.assertEqual(fake.revoked, ["fake-refresh"])
        status, body = http_get(self.api("/mail/connection/"), token=tokens["dana"])
        self.assertIsNone(body["connection"])
        self.assertEqual(body["disconnected"]["address"], "dana@acme.io")
        status, body = http_get(self.api("/mail/messages/?folder=done"), token=tokens["dana"])
        status, inbox = http_get(self.api("/mail/messages/"), token=tokens["dana"])
        self.assertEqual(inbox["count"] + body["count"], 2)
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.mail.tests.test_prune e2e.test_gmail_flow --parallel auto --noinput`
Expected: `test_prune` errors with `ImportError: cannot import name 'prune'`. The e2e flow already passes: it exercises Tasks 1–13 together, and none of it depends on the prune. If it fails, the failing step names the task to fix first.

- [ ] **Step 3: The prune**

Create `services/mail/prune.py`:

```python
"""The 30-day retention after a Google disconnect (contract decision 9).

A disconnected Google row is kept, credentials wiped, so its owner can still
read their copies or reconnect the same address and keep them. After
MAIL_DISCONNECT_RETENTION_DAYS the nightly job deletes it: its MailMessage,
MailLabel and MailAttachment rows cascade, and a filed customers.Email keeps
its record with `mailbox` set null, as an Outlook or IMAP disconnect does at
once. Each deletion is audited as evidence.
"""

from datetime import timedelta

from django.conf import settings
from django.db.models import Count
from django.utils import timezone

from core import audit

from .models import MailboxConnection


def prune(organisation=None, *, now=None, dry_run=False):
    """Delete the disconnected mailboxes past their retention (one
    organisation, or all). Returns how many it deleted, or would delete."""
    now = now or timezone.now()
    rows = MailboxConnection.objects.filter(
        status=MailboxConnection.Status.DISCONNECTED,
        disconnected_at__lt=now - timedelta(days=settings.MAIL_DISCONNECT_RETENTION_DAYS),
    )
    if organisation is not None:
        rows = rows.filter(organisation=organisation)
    pruned = 0
    for row in rows.select_related("organisation").annotate(held=Count("messages")):
        pruned += 1
        if dry_run:
            continue
        audit.record(  # SOC2:LOG-01 SOC2:DATA-04 personal mail deleted at the end of its retention
            "mailbox.pruned",
            organisation=row.organisation,
            target=row,
            metadata={"provider": row.provider, "address": row.address, "messages": row.held},
        )
        row.delete()
    return pruned
```

- [ ] **Step 4: The nightly job runs it**

In `services/customers/management/commands/run_health_maintenance.py`, right after the rules block (its `except` ends with `self.stdout.write(self.style.WARNING(f"rules skipped: {type(exc).__name__}"))`) and before `# The metric layer's month-end`, add:

```python
        # Personal mail kept after a Google disconnect, once its 30 days are
        # up (services.mail.prune). Here, before the loops below reuse the
        # name `organisation`. Never fatal.
        from services.mail.prune import prune as prune_mailboxes

        try:
            gone = prune_mailboxes(organisation, now=timezone.now(), dry_run=options["dry_run"])
            self.stdout.write(
                self.style.SUCCESS(
                    f"{'would delete' if options['dry_run'] else 'deleted'} "
                    f"{gone} disconnected mailbox(es)."
                )
            )
        except Exception as exc:  # noqa: BLE001 - reported, never fatal
            # the class name only: an exception's text can quote a row's values
            self.stdout.write(self.style.WARNING(f"mailbox prune skipped: {type(exc).__name__}"))
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `venv/bin/python manage.py test services.mail e2e.test_gmail_flow services.customers.tests --parallel auto --noinput`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/mail/prune.py services/customers/management/commands/run_health_maintenance.py \
  services/mail/tests/test_prune.py e2e/test_gmail_flow.py
git commit -m "$(cat <<'EOF'
feat(mail): prune disconnected gmail copies after 30 days

The nightly job deletes Google mailboxes disconnected over
MAIL_DISCONNECT_RETENTION_DAYS ago, their copies, labels and attachment
details with them, audited; filed emails stay. An end-to-end flow covers
the switch, connect, import, reading, push, privacy and disconnect.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---
### Task 15: Documents, the SOC 2 map, and the infra change (separate repo, not pushed)

**Files (backend):**
- Modify: `docs/API_CONTRACTS.md`. Touch the portal table (around :421-436) and the `mail` section (:8462-8590). Find each anchor by searching for its quoted text: line numbers shift as you edit.
- Modify: `docs/audit-events.md:53`
- Modify: `docs/data-classification.md` (:30, :82, and a new entity row)
- Modify: `docs/product/01-prd.md` (§5.6 table :262-263, §9 release history)
- Modify: `docs/product/02-trd.md` (the jobs table `sync_mail` row :242, and a new section at the end)
- Modify: `docs/product/05-backend-schema.md` (`MailboxConnection` row :298, and a new migrations section at the end)
- Modify: `docs/product/06-implementation-plan.md` (a new "Done" section at the end)
- Modify: `.soc2/config.yml` (`public_routes`), `.soc2/CONTROL_MAP.md` (rows API-11, AUTH-02, DATA-04)

**Files (revenact-infra, its own commit on its own branch, never pushed):**
- Modify: `/Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra/deploy/docker-compose.prod.yml` (`mailsync` :85-102, plus a new `ticketsync`)
- Modify: `/Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra/deploy/deploy.sh:30`
- Modify: `/Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra/README.md` (the container table :16, the recreate command :169)

**Interfaces:**
- Consumes: everything built in Tasks 1–14. The docs describe it and change no behaviour.
- Produces: the same-PR documents the `api-contracts` skill and the product-docs rule require, and an infra commit the operator merges with the backend.

- [ ] **Step 1: `docs/API_CONTRACTS.md`, the portal**

In the portal table, after the `POST organisations/<id>/status/` row, add:

```
| `POST organisations/<id>/gmail/` `{enabled, reason}` | The two-way Gmail pilot switch (`Organisation.gmail_two_way_enabled`, default off, not on the tenant's settings serializer). `200 {"gmail": {enabled, connected, paused}}`; `400 INVALID_ENABLED` (not a boolean), `400 REASON_REQUIRED`, `404 ORGANIZATION_NOT_FOUND`. Audited `platform.organisation.gmail_two_way {from, to, reason}`; the same value again is 200 with no audit row. Off pauses every Google mailbox in the workspace at the loop's next sweep (≤ 60 s); nothing is deleted |
```

Then:
- In the `GET overview/` row's purpose, append: `; "gmail": {enabled_workspaces, connected, test_user_cap} (live Google connections platform-wide against GMAIL_TEST_USER_CAP, Google's test-user limit for the one Cloud project)`.
- In the `GET organisations/?q=&status=` row, append: `; "gmail": {enabled, connected, paused} per workspace (live Google connections, which hold test-user slots, and how many are paused), one aggregate query for the page`.
- In the `GET organisations/<id>/` row, append `, the same "gmail" block`.

- [ ] **Step 2: `docs/API_CONTRACTS.md`, the `mail` section**

In `### Ownership`, replace the sentence "Disconnecting the mailbox deletes the personal copy (`connection` cascades) and leaves the filed `Email` rows on the customer, as before." with:

```
Disconnecting Outlook or IMAP deletes the personal copy at once (`connection`
cascades). Disconnecting Google keeps the row as a tombstone (credentials
wiped, token revoked) and the copies for `MAIL_DISCONNECT_RETENTION_DAYS` (30);
the nightly prune then deletes them. Filed `Email` rows stay on the customer
either way, with `mailbox` set null once the connection row goes. A manager,
a view-all holder or an admin gets 404 on someone else's message and `[]` for
their labels; labels, cc/bcc, HTML and attachment details never reach them.
```

Replace the two paragraphs starting "Nothing is written back to the provider (Gmail is connected read-only)." and "**What refreshes after the first sync.**" with:

```
**Two-way Gmail (delivery 1).** For a Google mailbox, Gmail's labels are the
truth: `folder`, `is_read`, `is_starred`, `is_important` and `state` are
derived from `label_ids` at every store and every label change (DRAFT, then
TRASH, then SPAM, then SENT or the mailbox's own address as sender, else
inbox; UNREAD, STARRED, IMPORTANT; none of INBOX SENT DRAFT SPAM TRASH is
archived, `done`, and the Inbox reopens it). `muted` is never touched, the
category is decided once at first store, chats are never stored, and a filed
`Email` is never moved or deleted by a later label change or a Gmail deletion.
A PATCH still changes `is_read`, `is_starred` and `state` here only (nothing
is written back until delivery 2's outbox), so for Gmail it lasts until Gmail
next reports a change to that message. Outlook and IMAP keep the old rule: a
PATCH stamps `locally_changed_at`, and from then on what the person did here
wins over the provider's flags.

**How Gmail is synced.** `sync_mail --loop` (below) reads Gmail's change log
(`history.list` since `history_id`: adds, deletes, label changes), imports
the last `MAIL_IMPORT_MONTHS` (12) a page per tick (skipping what it holds),
mirrors the label list every tick, and when Gmail no longer has the history
(404) takes a fresh `history_id` first, then re-lists the last 30 days a page
per tick and deletes what Gmail no longer has. Imported mail is filed as
before; only mail from the last 30 days is classified at once, the rest by the
nightly capped `classify_interactions`. From D1, Gmail rows store `to` (To
only), `cc` and `bcc` apart; Outlook, IMAP and older Gmail rows keep To + Cc in
`to` and answer `cc: []`, `bcc: []`. Filing still counts To + Cc; Bcc never.
HTML is sanitised once, at store, with `nh3` (tables, inline styles and
`<style>` kept; scripts, frames, forms, svg/math, link/meta/base and every
`on*` handler stripped; only `http`, `https`, `mailto` and `cid` URLs; remote
images left for the frontend's sandboxed iframe); over `MAIL_HTML_MAX_BYTES`
(1 MB) it is dropped and the text body shown.
```

In `### GET /api/v1/mail/messages/`, replace the `Row:` paragraph with:

```
Row: `id, thread_id, direction (sent|received), from_name, from_address,
to ([[name, address]…]), cc, bcc (same shape; [] outside Gmail), subject,
snippet (≤300 chars), sent_at, folder, category, state, is_read, is_starred,
is_important, priority, account ({id, name, type: customer|account} from the
filed copy, else null), labels ([{id, name, color: {background, text} | null}],
the message's Gmail user labels by name, `id` Revenact's MailLabel id; unknown
ids ignored), has_attachments (a non-inline file part)`. No body: that is the
detail's. The page reads the owner's labels in one query (≤ 4 queries a page,
whatever its size).
```

In the summary JSON example, after `"last_synced_at": ...`, add these two lines. Then add the sentence after the block:

```json
  "import": {"state": "importing", "imported": 4210, "total_estimate": 18000, "done_at": null},
  "paused_reason": null,
```

```
`import` and `paused_reason` are null without a live Google mailbox, and
`has_mailbox` is false for a disconnected one.
```

Replace the `### GET | PATCH /api/v1/mail/messages/<id>/` body with:

```
GET adds `body`, `html_body` (sanitised; "" when none or too large, and the
text body is shown) and `attachments` ([{id, filename, mime_type, size,
is_inline, content_id, available}], every file part, inline ones included
for `cid:`; `available` is false until delivery 2's download route). Never
`rfc_message_id`, `references` or raw label ids. PATCH accepts `is_read`,
`is_starred`, `state` (partial) and returns the detail. 404 for anyone but
the owner, including their manager.
```

In `### POST /api/v1/mail/messages/<id>/reply/`, after "409 when the mailbox is no longer connected;", insert `409 {"code": "MAILBOX_PAUSED", "detail", "paused_reason"} when it is a paused Google mailbox (also on customers/<id>/emails/send/, accounts' send, communications/emails/<id>/reply/ and draft Send, always before any provider call, so a draft is never claimed);`.

Before `### Where it sits in the frontend`, add:

````
### Connecting a mailbox

Undocumented until delivery 1. Every route is `IsAuthenticated` except the
OAuth callback and the push webhook (`AllowAny`, no authentication).

**`GET /api/v1/mail/connection/`**: `{connection, disconnected, providers}`.
- `connection`: null without a live mailbox, else `id, provider,
  provider_display, address, display_name, status (connected|error), error,
  last_synced_at, created_at, two_way, needs_reconnect, granted_scopes,
  import, push, paused_reason`.
  - `two_way`: Google with gmail.modify, gmail.send and gmail.compose all granted.
  - `needs_reconnect`: Google, and not two-way or `token_revoked`.
  - `granted_scopes`: Gmail scopes by short name.
  - `import`: `{state: importing|done, imported, total_estimate, done_at}`, where `total_estimate` is the whole mailbox's `messagesTotal` (so "about").
  - `push`: a live watch with `GMAIL_PUBSUB_TOPIC` set.
  - `paused_reason`: null, `no_seat`, `suspended`, `workspace_off` or `token_revoked`, computed live.
  - `error`: the reconnect reason, or the latest transient one while backing off. Never mail content.
  - Outlook and IMAP: `two_way` false, `needs_reconnect` false, `granted_scopes` [], `import` null, `push` false, `paused_reason` null.
- `disconnected`: after a Google disconnect, `{provider, address, disconnected_at, delete_after}`; else null.
- `providers`: `[{key, label, uses_oauth, gate}]`. Google's `gate` is the first failing pre-OAuth gate (`GMAIL_NOT_ENABLED`, `MEMBER_SUSPENDED`, `NO_SEAT`, `NO_VERIFIED_DOMAIN`) or null; the others are always null.

**`DELETE /api/v1/mail/connection/`**: 204.
- Google: stop the watch and revoke the token (both best effort), wipe the credentials, clear the sync state, `status=disconnected`, keep the copies for 30 days. Audited `mailbox.disconnect {provider, address, revoked, delete_after}`. A disconnected row then answers like no mailbox everywhere except `mail/messages/*`, which keeps listing the kept copies.
- Outlook and IMAP: deleted at once, as before.

**`POST /api/v1/mail/connect/<provider>/`**: for OAuth `200 {authorize_url}`; for IMAP the form `{address, password, imap_host, imap_port?, smtp_host, smtp_port?, username?, display_name?}` is verified by logging in, `201` with the connection.
- Google asks for `gmail.modify gmail.send gmail.compose openid email profile`, offline, with consent.
- Before OAuth, `403 {"code", "detail"}` for `GMAIL_NOT_ENABLED`, `MEMBER_SUSPENDED`, `NO_SEAT` or `NO_VERIFIED_DOMAIN` (not audited).
- `400 {"detail"}` for an unknown or unconfigured provider.
- Connecting over a row of another provider or address, or over a disconnected Google row, deletes that row first (`mailbox.disconnect`).

**`GET /api/v1/mail/oauth/<provider>/callback/?code=&state=`** (public): `302` to `${FRONTEND_URL}/integrations?mailbox=connected|refused|error[&code=][&detail=≤200]`. For Google, in order:
1. The signed state (15 minutes) and an active user.
2. The workspace, membership and seat gates again.
3. The code exchange.
4. All three Gmail scopes, else `refused`/`SCOPES_MISSING`.
5. `getProfile`'s address on a verified domain exactly, else `WRONG_DOMAIN` ("Connect your acme.io account.") or `NO_VERIFIED_DOMAIN`; and nobody else's live Google connection on it, else `ADDRESS_IN_USE`.
6. Save: the same address resumes the person's row and copies (`mailbox.reconnect`, plus `mailbox.scopes_changed {from, to}`); a new one is `mailbox.connect {provider, address, scopes, two_way}`.
7. Start the import, a 30-day reconcile for a row that was away, and a wake.

Every refusal after the state check revokes what Google issued, stores nothing, and is audited `mailbox.connect_refused {provider, code, domain?}` (the domain, never the address). Google's `error=access_denied` is `refused`/`GOOGLE_DENIED`.

**`POST /api/v1/mail/sync/`**:
- No mailbox, or a disconnected one: `400 {"detail": "No mailbox connected."}`.
- Google, paused: `409 MAILBOX_PAUSED`.
- Google: `wake_at = now` and `202` (the connection plus `"filed": null, "queued": true`).
- Outlook and IMAP: sync inline, `200` (the connection plus `"filed": n`).

### `GET /api/v1/mail/labels/`

The caller's own live Google mailbox's user labels, by name, not paginated:
`[{"id", "gmail_id", "name", "color": {"background", "text"} | null}]`. `[]`
without one, for a disconnected one, and for Outlook and IMAP. No counts (D2).

### `POST /api/v1/mail/google/push/` (public)

Gmail's Pub/Sub push. `AllowAny`, no authentication, throttle `gmail_push`
(`THROTTLE_GMAIL_PUSH`, 600/min per source IP).
- **Body and switch:** a body over 64 KB is `413`; without `GMAIL_PUBSUB_TOPIC` the route is `404`.
- **The token:** the bearer token must be an RS256 OIDC token verified against Google's JWKS (PyJWT, keys cached an hour), with `aud == GMAIL_PUBSUB_AUDIENCE`, `iss` accounts.google.com, `exp` in the future, `email == GMAIL_PUBSUB_SERVICE_ACCOUNT` and `email_verified`.
- **Refusals:** a missing, malformed, badly signed or expired token, a wrong audience or issuer, or an unset audience or service account is `401`; another service account is `403`. Both are audited `mailbox.push_rejected {reason}`, anonymous.
- **A verified push** is always `204`. It sets `wake_at = COALESCE(wake_at, now)` on the live, unpaused Google mailbox at `message.data`'s `emailAddress` when its `historyId` is newer than ours, and does nothing else. Nothing from `data` is logged.

### The sync loop and the nightly prune

`python manage.py sync_mail --loop` runs forever and stops cleanly on SIGTERM:
- every `MAIL_SYNC_TICK_SECONDS` (5) it claims up to `MAIL_SYNC_BATCH` (10) due mailboxes with `FOR UPDATE SKIP LOCKED` and a `MAIL_LEASE_SECONDS` lease;
- once a minute it recomputes every Google mailbox's pause, audited `mailbox.paused` / `mailbox.resumed`.

When a mailbox is due:
- **Google:** connected, not paused, not leased, not backing off, and woken (push, Sync now, connect) or not synced for `MAIL_SYNC_INTERVAL_SECONDS` (60).
- **Outlook and IMAP:** every `MAIL_LEGACY_SYNC_INTERVAL_SECONDS` (600), through today's pass, and a failed pass waits the same.

How a Google failure is handled:
- 429, 5xx, no answer and rate-limit 403s back off this mailbox, `min(30 s × 2^(n−1), 15 min)` or Retry-After.
- A lost grant (`invalid_grant`, a 401 after one refresh) or `insufficientPermissions` sets `status=error` and `paused_reason=token_revoked` until a reconnect.

`sync_mail` without `--loop` makes one pass over every live mailbox (`--user` for one). `run_health_maintenance` prunes Google mailboxes disconnected more than 30 days ago, their copies with them (`mailbox.pruned`).
````

- [ ] **Step 3: `docs/audit-events.md`**

Replace the row `| \`mailbox.connect\` / \`mailbox.disconnect\` | ...` (line 53) with:

```
| `mailbox.connect` | `services.mail.views` (IMAP connect, OAuth callback) | user | MailboxConnection | provider, address; Google adds `scopes` (short names) and `two_way` |
| `mailbox.reconnect` | OAuth callback (Google, same address) | user | MailboxConnection | provider, address |
| `mailbox.scopes_changed` | OAuth callback (Google reconnect with a different grant) | user | MailboxConnection | from, to (short scope names) |
| `mailbox.connect_refused` | OAuth callback (Google) | user | (none) | provider, code (a gate code, `SCOPES_MISSING`, `ADDRESS_IN_USE`), domain when known (never the address); outcome `failure` |
| `mailbox.disconnect` | `MyMailboxView.delete`; the callback or connect when a row is replaced | user | MailboxConnection | provider, address, revoked, delete_after (Google keeps the copies 30 days; null when replaced or deleted at once) |
| `mailbox.paused` / `mailbox.resumed` | `services.mail.gates.sweep` (once a minute), `services.mail.gmail_sync` (lost grant, missing permission) | system (none) | MailboxConnection | reason / from (`no_seat`, `suspended`, `workspace_off`, `token_revoked`) |
| `mailbox.pruned` | `services.mail.prune` (nightly) | system (none) | MailboxConnection | provider, address, messages (how many personal copies were deleted) |
| `mailbox.push_rejected` | `services.mail.views.GmailPushView` | anonymous | (none) | reason (`missing`, `invalid`, `audience`, `issuer`, `service_account`, `not_configured_audience`, `not_configured_service_account`); outcome `failure` |
| `platform.organisation.gmail_two_way` | `services.platform.views.OrganisationGmailView` | platform staff | Organisation | from, to, reason |
```

- [ ] **Step 4: `docs/data-classification.md`**

Replace the `mail.MailboxConnection` entity row with:

```
| `mail.MailboxConnection` | confidential | address, display_name | `credentials`: **restricted**, OAuth refresh/access tokens or an IMAP/SMTP password, Fernet-encrypted at rest with `MAIL_TOKEN_KEY` (derived from `SECRET_KEY` when unset); never serialised. `granted_scopes`, sync state and `paused_reason` are internal. A Google disconnect revokes the token at Google, wipes `credentials` and keeps the row 30 days (`MAIL_DISCONNECT_RETENTION_DAYS`) before the nightly prune (`mailbox.pruned`); connect, reconnect, refusals, disconnect and pauses audited |
| `mail.MailMessage`, `mail.MailLabel`, `mail.MailAttachment` | confidential | from/to/cc/bcc names and addresses, subject, body, `html_body` | the person's whole mailbox (12 months imported for Gmail), **owner-only** in every view (a manager, view-all holder or admin gets 404 and `[]`); the team reads only the filed `customers.Email`. HTML is sanitised at store (`nh3`) and the raw HTML never kept. `MailAttachment` holds file details only in D1 (`file` empty). Kept 30 days after a Google disconnect, then pruned; deleted at once with an Outlook or IMAP disconnect. Never logged; never sent to a model except as filed `Email` text (classification) |
```

Replace the flow row `| Mailbox sync (\`services/mail/sync.py\`) ← Google / Microsoft / IMAP | ...` with:

```
| Mailbox sync (`services/mail/sync.py`, `gmail_sync.py`) ← Google / Microsoft / IMAP | the person's own mail, stored whole as their `MailMessage` (Gmail: 12 months, with labels, cc/bcc, sanitised HTML and attachment details), filed as `Email` only when the counterpart is a customer/account contact or domain | confidential | TLS; per-person OAuth (Google: gmail.modify, send, compose, never full mail access) or app password; owner-only; no content in logs or `error` |
| Gmail push (`POST /mail/google/push/`) ← Google Pub/Sub | an address and a historyId | confidential | OIDC token verified against Google's JWKS for the configured audience and service account, fail-closed; the data only wakes the mailbox and is never logged |
```

- [ ] **Step 5: the product documents**

`docs/product/01-prd.md`, §5.6: replace the `Personal mailboxes: Google, Microsoft, IMAP` row with:

```
| Personal mailboxes: Google, Microsoft, IMAP | Built | Per person; the whole inbox is the owner's, filed against a customer only when the counterpart is a known contact or domain |
| Two-way Gmail, delivery 1: the sync engine (backend) | Built | Per-workspace pilot switch in the portal; connect only on a verified domain, with a seat, all three Gmail scopes; 12-month import; Gmail's labels drive folders and flags; HTML, CC/BCC and attachment details; push as an optional wake-up; paused (never deleted) when the member, seat or workspace stops qualifying; copies kept 30 days after a disconnect. Write-back (delivery 2) and drafts and threaded sending (delivery 3) next |
```

In §9 Release history, add a row at the end:

```
| 2026-10-10 | Two-way Gmail delivery 1 (backend): gates and the portal switch, the history loop with push and recovery, the 12-month import, labels, HTML, CC/BCC and attachment details, 30-day retention after a disconnect |
```

`docs/product/02-trd.md`: replace the `sync_mail` jobs-table row with:

```
| `sync_mail --loop` | Every 5 s (the `mailsync` service) | Claims due mailboxes under a lease: Gmail every 60 s or on a push (history, one import page, labels, the watch), Outlook and IMAP every 10 minutes; sweeps the Gmail gates once a minute |
```

and append at the end of the file:

```
## Two-way Gmail (delivery 1): the sync engine

- **Engine.** `services/mail/loop.py` claims due mailboxes in a short transaction (`select_for_update(skip_locked=True)`, `lease_until`), then works outside it, so push's `UPDATE wake_at` never waits (contract decision 18). `gmail_sync.tick` mirrors labels, applies `history.list` since `history_id`, runs one reconcile page and one import page, and renews the watch. The engine writes the connection only with named fields.
- **Recovery.** A history 404 takes `getProfile.historyId` first, then re-lists the last `MAIL_RECONCILE_DAYS` a page per tick (anchored on `reconcile_started_at`) and deletes rows in the window it did not see that existed before it began.
- **Errors.** `ProviderError` carries `status`, `reason` and `retry_after`. 429, 5xx, no answer and rate-limit 403s back off (`min(30 s × 2^(n−1), 15 min)` or Retry-After); `invalid_grant`, a second 401 and `insufficientPermissions` pause with `token_revoked`. A token refresh needs the person only for a lost grant.
- **Gates and pauses.** `services/mail/gates.py`: workspace switch, active membership in an active workspace, an open seat, a verified domain matched exactly; the pause precedence `token_revoked`, `workspace_off`, `suspended`, `no_seat`, computed live for the API and in bulk once a minute; a paused Gmail never sends (409 `MAILBOX_PAUSED`).
- **Push.** Pub/Sub OIDC verified with PyJWT against Google's JWKS (no Google SDK), fail-closed, rate-limited, a wake-up only.
- **Dependencies.** `nh3` (Rust `ammonia`) sanitises mail HTML at store; `cryptography` pinned (Fernet and RS256).
- **Retention.** Google disconnects keep the person's copies 30 days; `run_health_maintenance` prunes them.
```

`docs/product/05-backend-schema.md`: replace the `MailboxConnection` row with:

```
| `MailboxConnection` | One per person. Provider (google, microsoft, imap), address, Fernet-encrypted `credentials`, `sync_cursor` (Outlook and IMAP), status (connected, error, disconnected). Gmail: `granted_scopes`, `history_id`, the import (`import_after`, `import_before`, `import_page_token`, `import_total_estimate`, `import_done_at`), the reconcile (`reconcile_started_at`, `reconcile_page_token`), `watch_expires_at`, `wake_at`, `lease_until`, `backoff_until`, `consecutive_failures`, `paused_reason`, `disconnected_at`. One live Google connection per address (partial unique); indexed on `(provider, status, wake_at)` |
| `MailLabel` | A Gmail label of one connection: `gmail_id` (unique per connection when set), name, type (system, user), colours; mirrored every tick |
| `MailAttachment` | A file part of one `MailMessage`: `part_id` (unique per message), Gmail attachment id, filename, MIME type, size, content id, inline flag, `file` (empty until delivery 2) |
```

If `MailMessage` has a row in that table, append to it: `; Gmail adds html_body, cc, bcc, rfc_message_id, references, label_ids, has_attachments, refreshed_at`. If it has none, add this row after `MailAttachment`:

```
| `MailMessage` | The owner's copy of one message: folder, flags, state, category, the filed `Email` when matched; Gmail adds `html_body`, `cc`, `bcc`, `rfc_message_id`, `references`, `label_ids`, `has_attachments`, `refreshed_at` |
```

Append at the end of the file:

```
## Two-way Gmail delivery 1: migrations

| Migration | Change |
|---|---|
| `accounts 0015_organisation_gmail_two_way` | `Organisation.gmail_two_way_enabled` (default off) |
| `mail 0004_gmail_two_way` | The connection's Gmail state and status `disconnected`; the message's HTML, cc/bcc, threading headers, label ids, attachment flag and `refreshed_at`; `MailLabel`, `MailAttachment`; `one_live_google_connection_per_address`, `mail_conn_due_idx` |
```

`docs/product/06-implementation-plan.md`, append:

```
## Done: Two-way Gmail delivery 1, the sync engine (2026-10-10, backend)

- The portal's per-workspace switch; connect gates (workspace, membership, seat, verified domain exactly) before OAuth and in the callback; all three Gmail scopes or nothing; one live Google connection per address.
- `sync_mail --loop`: leased claims, the gate sweep, history with 404 recovery, the 12-month import, labels, the push watch, error backoff and pauses; the push webhook.
- Read side: labels, cc/bcc, sanitised HTML and attachment details, owner-only; `GET mail/labels/`; Sync now queued; `MAILBOX_PAUSED` on every send path.
- Google disconnects keep copies 30 days, then the nightly prune.
- Migrations `accounts 0015`, `mail 0004`. Operator steps: revenact-infra's `mailsync` split (its own PR), Google Cloud setup (the D1 backend plan's appendix).
- Next: delivery 2 (the outbox and every write-back, threads, label sidebar, attachment downloads), delivery 3 (drafts both ways, threaded reply, reply all, forward, signature).
```

- [ ] **Step 6: SOC 2**

In `.soc2/config.yml`, append to `public_routes`:

```yaml
  - "GET /api/v1/mail/oauth/<provider>/callback/"
  - "POST /api/v1/mail/google/push/"
```

In `.soc2/CONTROL_MAP.md`:
- **API-11:** before ` | \`services/connectors/tests/test_tickets.py:InboundWebhookTests\``, append `; Gmail push \`services/mail/push.py:verify\` (Pub/Sub OIDC token, RS256 against Google's JWKS, audience and service account from settings, fail-closed, 64 KB cap, \`mailbox.push_rejected\` audited)`. Add `, \`services/mail/tests/test_push.py\`` to its Evidence cell.
- **AUTH-02:** append to the Implementation cell `; the person's whole mailbox (\`MailMessage\`, \`MailLabel\`, \`MailAttachment\`) owner-only in \`services/mail/views.py\`, and the Gmail connect gates and pauses \`services/mail/gates.py\``.
- **DATA-04:** append to the Implementation cell `; personal mail after a Google disconnect is pruned after 30 days (\`services/mail/prune.py\`, \`mailbox.pruned\`)`.

Run: `python3 /Users/tusharaggarwal/Desktop/Projects/Revenact/.claude/skills/soc2-dev/scripts/control_map.py .`
Expected: no new unmapped `SOC2:` annotation reported for `services/mail` (the tags used are AUTH-02, API-11, LOG-01, DATA-04 and SEC-07, all rows in the map).

- [ ] **Step 7: Check the docs format and commit (backend)**

Run: `venv/bin/ruff format --check . && venv/bin/ruff check .`
Expected: clean. Ruff also formats the Python fences in Markdown, and these edits add none.

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md \
  docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md \
  docs/product/06-implementation-plan.md .soc2/config.yml .soc2/CONTROL_MAP.md
git commit -m "$(cat <<'EOF'
docs: document two-way gmail delivery 1

The mail connection routes (undocumented until now), the Gmail fields,
labels and push webhook, the loop and the prune; the portal switch; the new
audit events; the mailbox data-classification rows corrected; the product
documents and the SOC 2 map.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: The infra change (revenact-infra, its own branch, not pushed)**

Check that it is a git repo with a clean tree:

```bash
git -C /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra status --short
git -C /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra branch --show-current
```

Expected: no output from `status`, and the branch `main`. If the tree is dirty, stop and report: never commit someone else's changes. Then:

```bash
git -C /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra switch -c feat/gmail-mail-loop
```

In `deploy/docker-compose.prod.yml`, replace the `mailsync` service and its comment (from `# Personal mailboxes (services.mail): every ten minutes` through the `done"` of its command) with:

```yaml
  # Personal mailboxes (services.mail): the mail loop. Every 5 s it claims the
  # mailboxes that are due under a lease (Gmail every minute or on a push,
  # Outlook and IMAP every ten minutes) and syncs them; once a minute it
  # re-checks the Gmail pilot gates. Stops cleanly on SIGTERM between mailboxes.
  mailsync:
    build: ./backend
    restart: unless-stopped
    env_file: ./backend.env
    stop_grace_period: 60s
    healthcheck:
      disable: true
    depends_on:
      db:
        condition: service_healthy
    command: python manage.py sync_mail --loop

  # Ticket sources (services.connectors): every ten minutes, pull each
  # connected source into the customer records. Same sleep-loop shape as the
  # scheduler — idempotent, no queue. (It shared mailsync's loop until the
  # mail loop became continuous.)
  ticketsync:
    build: ./backend
    restart: unless-stopped
    env_file: ./backend.env
    healthcheck:
      disable: true
    depends_on:
      db:
        condition: service_healthy
    command: >
      sh -c "while true; do
               python manage.py sync_tickets || echo 'ticket sync failed; retrying in ten minutes';
               sleep 600;
             done"
```

In `deploy/deploy.sh`, change `docker compose up -d backend scheduler mailsync sender` to `docker compose up -d backend scheduler mailsync ticketsync sender`.

In `README.md`:
- replace the `mailsync` row of the container table with:

```
| `mailsync` | `sync_mail --loop`: every 5 s, the personal mailboxes that are due (Gmail every minute or on a push, Outlook and IMAP every ten minutes), under a lease; the Gmail pilot gates once a minute |
| `ticketsync` | every 10 min `sync_tickets` (the organisation's ticket sources: Zendesk, Jira, Slack, Freshdesk) into the customer records |
```

- change `docker compose up -d --force-recreate backend scheduler mailsync sender` to `docker compose up -d --force-recreate backend scheduler mailsync ticketsync sender`;
- after the redirect-URI paragraph, add:

```
Two-way Gmail (optional push): `GMAIL_PUBSUB_TOPIC=projects/<project>/topics/<topic>`,
`GMAIL_PUBSUB_AUDIENCE=https://<public host>/api/v1/mail/google/push/` and
`GMAIL_PUBSUB_SERVICE_ACCOUNT=<push subscription's service account email>` in
`backend.env`; without them the minute check alone keeps mail current. A
workspace connects Google only once platform staff switch it on
(`POST /api/v1/platform/organisations/<id>/gmail/`).
```

Validate and commit there (not pushed):

```bash
cd /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra/deploy
docker compose -f docker-compose.prod.yml config --quiet 2>&1 | grep -v "backend.env" || true
cd /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra
git add deploy/docker-compose.prod.yml deploy/deploy.sh README.md
git commit -m "$(cat <<'EOF'
feat(deploy): run the mail loop continuously and tickets on their own

mailsync becomes `sync_mail --loop` (a 5-second tick under leases, Gmail
every minute or on a push); sync_tickets moves to a new ticketsync service
on today's ten-minute loop. Merge with the backend's two-way Gmail D1.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)"
git -C /Users/tusharaggarwal/Desktop/Projects/Revenact/revenact-infra log --oneline -1
```

Expected: one new commit on `feat/gmail-mail-loop`. The compose check prints nothing except, possibly, a missing `backend.env` complaint: that file exists only on the VM. **Do not push.**

- [ ] **Step 9: The operator checklist (for whenever prod is back; nothing to run now)**

Record these in the PR description. The VM is off (the Azure subscription is disabled), so none of them can run yet.
1. Merge the backend PR, then the revenact-infra `feat/gmail-mail-loop` PR.
2. Google Cloud: follow Appendix A.
3. On the VM, add these to `/opt/revenact/backend.env`:
   - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`;
   - `MAIL_OAUTH_REDIRECT_BASE=https://<public host>`;
   - optionally the three `GMAIL_PUBSUB_*` values.

   Then run `docker compose up -d --force-recreate backend scheduler mailsync ticketsync sender`.
4. In the portal, switch the pilot workspace on: `POST /api/v1/platform/organisations/<id>/gmail/ {"enabled": true, "reason": "..."}`. Add each pilot user as a Google test user.
5. Do one live check on a real test Gmail account before merging:
   - connect, and watch the import progress;
   - read a message with HTML and an attachment;
   - archive in Gmail and see it leave the inbox within a minute;
   - disconnect.

---
### Task 16: Final verification

**Files:** none changed, unless a check fails. A fix then goes in its own `fix(mail): ...` commit, with the trailer.

**Interfaces:**
- Consumes: the whole branch.
- Produces: evidence that the suite, the migrations and lint are clean, and the local dev DB migrated.

- [ ] **Step 1: The whole suite, in parallel**

Run: `venv/bin/python manage.py test --parallel auto --noinput`
Expected: every test passes (OK, with skips only where they were before). Never run it serially. If a test outside `services/mail` fails, read it before changing it. The likely ones assert:
- the mail connection payload's exact keys;
- `providers` without `gate`;
- a Google disconnect deleting the row.

Fix each to the contract, never the contract to the test.

- [ ] **Step 2: The CI shard split still covers every test exactly once**

Run: `venv/bin/python scripts/ci_shard_labels.py --check 4`
Expected: exit 0. The new test classes are picked up automatically.

- [ ] **Step 3: Migrations are complete**

Run: `venv/bin/python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 4: Lint and format**

Run: `venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: `All checks passed!` and nothing to reformat. If format reports files, run `venv/bin/ruff format <those files>` and commit them as `style(mail): ruff format` with the trailer.

- [ ] **Step 5: The schema still builds**

Run: `venv/bin/python manage.py spectacular --file /private/tmp/claude-501/gmail-d1-schema.yml`
Expected: exit 0. Warnings about `APIView`s without a serializer are pre-existing in kind. Check that `/api/v1/mail/labels/` and `/api/v1/mail/google/push/` appear in the file.

- [ ] **Step 6: Migrate the local dev database**

The owner asked for this. The database is shared with the other worktrees; these migrations are additive (new columns with defaults or null, two tables, one partial unique index).

Run: `venv/bin/python manage.py migrate --noinput`
Expected: `Applying accounts.0015_organisation_gmail_two_way... OK` and `Applying mail.0004_gmail_two_way... OK`.

Run: `venv/bin/python manage.py showmigrations accounts mail | tail -6`
Expected: `[X]` beside both.

- [ ] **Step 7: The branch is what it should be**

Run: `git status --short && git log --oneline 2022a09..HEAD`
Expected:
- a clean tree (`venv/` and `.env` are ignored);
- one commit per task 1–15 (plus any fix or style commits), each ending with the `Co-Authored-By` trailer.

The revenact-infra commit is on its own branch there. Nothing is pushed.

Then use superpowers:finishing-a-development-branch to decide how to integrate.

---

## Appendix A: Owner setup in Google Cloud

Do this once, for the one Google Cloud project that serves every workspace. It takes about 20 minutes. Nothing here can be tested against prod until the VM is back. Locally, everything except push works.

1. **Project.** Open https://console.cloud.google.com/, then the project picker, then **New project** (for example `revenact`). Select it.
2. **Gmail API.** Go to **APIs & Services → Library**, search "Gmail API", and click **Enable**.
3. **OAuth consent screen.** Go to **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding / Audience**).
   - **User type: External.** Leave **Publishing status: Testing**. Google's verification (CASA) waits for paying customers.
   - App name `Revenact`. Add a support email and a developer contact.
   - **Data access / Scopes → Add or remove scopes.** Add:
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.compose`
     - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   - **Audience → Test users → Add users.** Add every pilot person's Google address: the team first, then each pilot workspace's users. Google refuses anyone not on this list (Revenact shows `GOOGLE_DENIED`), and caps it at 100 (`GMAIL_TEST_USER_CAP`, which the portal counts against).
4. **OAuth client.** Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**, application type **Web application**, name `Revenact web`.
   - **Authorised redirect URIs** must match exactly, trailing slash included. These are the paths the code builds (`services/mail/views._redirect_uri`, and `services/identity/login.py` for sign-in):
     - local: `http://localhost:8000/api/v1/mail/oauth/google/callback/`
     - prod: `https://revenact.20-219-7-222.sslip.io/api/v1/mail/oauth/google/callback/`
     - (sign-in with Google, if used) `http://localhost:8000/api/v1/auth/oauth/google/callback/` and `https://revenact.20-219-7-222.sslip.io/api/v1/auth/oauth/google/callback/`
   - Copy the client ID and secret.
5. **Environment.**
   - Local `.env` of the backend worktree:

     ```
     GOOGLE_OAUTH_CLIENT_ID=<client id>
     GOOGLE_OAUTH_CLIENT_SECRET=<client secret>
     MAIL_OAUTH_REDIRECT_BASE=http://localhost:8000
     FRONTEND_URL=http://localhost:5173
     ```

   - Prod `/opt/revenact/backend.env` (and `terraform.tfvars` `google_oauth_client_id` / `google_oauth_client_secret`, which feed a fresh box): the same two client values, and `MAIL_OAUTH_REDIRECT_BASE=https://revenact.20-219-7-222.sslip.io`. Never commit any of them.
6. **Switch a workspace on.** Use the platform portal (`POST /api/v1/platform/organisations/<id>/gmail/` with a reason). Locally that means a superuser with a confirmed TOTP device. The workspace also needs a verified domain that matches the pilot addresses exactly.
7. **Optional: push (prod or a public tunnel only).** Without it, mail still arrives within about a minute.
   1. Enable the **Cloud Pub/Sub API**.
   2. **Pub/Sub → Topics → Create topic**, for example `gmail`. Its full name is `projects/<project-id>/topics/gmail`.
   3. On the topic, **Permissions → Add principal** `gmail-api-push@system.gserviceaccount.com`, with the role **Pub/Sub Publisher**.
   4. **IAM → Service accounts → Create**, for example `gmail-push`. It needs no roles: it only signs the push tokens. Note its email, `gmail-push@<project-id>.iam.gserviceaccount.com`.
   5. **Pub/Sub → Subscriptions → Create subscription** on the topic:
      - delivery type **Push**;
      - endpoint `https://revenact.20-219-7-222.sslip.io/api/v1/mail/google/push/`;
      - tick **Enable authentication**, with the service account from step 4;
      - audience: the endpoint URL itself.
   6. In `backend.env`, set:

      ```
      GMAIL_PUBSUB_TOPIC=projects/<project-id>/topics/gmail
      GMAIL_PUBSUB_AUDIENCE=https://revenact.20-219-7-222.sslip.io/api/v1/mail/google/push/
      GMAIL_PUBSUB_SERVICE_ACCOUNT=gmail-push@<project-id>.iam.gserviceaccount.com
      ```

   Then recreate `backend` and `mailsync`. Each mailbox's watch is set on its next tick (`push: true` in `GET mail/connection/`). With the topic set but the audience or the service account empty, every push is refused (401), by design.

## Self-review against the contract

| Contract item | Task |
|---|---|
| Decision 1, `Organisation.gmail_two_way_enabled`, migration | 1 |
| Decisions 2, 3: portal route, audit, no-op, the `gmail` blocks, the test-user cap | 2 |
| Decision 4, §1 gates before OAuth (403) and in the callback | 6, 7 |
| Decision 5: exact domain | 6 (`address_gate`), 7 |
| Decision 6: one live Google connection per address, `ADDRESS_IN_USE` | 1 (constraint), 7 |
| Decision 7: all three scopes or refusal plus revoke | 3 (scopes), 7 |
| Decision 8: every Google connection on the engine | 8 (`sync_mailbox` → `tick`), 10 |
| Decisions 9, 10: disconnect tombstone, `disconnected` block, reconnect and replace, prune | 7, 11, 14 |
| Decision 11: labels are the truth for Google; `muted` untouched; Outlook and IMAP keep `locally_changed_at` | 5, 12 |
| Decisions 12, 13: user labels only, `GET mail/labels/`, no counts | 12 |
| Decision 14: cc split for Gmail; filing To + Cc; Bcc never | 4 |
| Decisions 15, 16: `import_after` / `import_before`, `messagesTotal` | 7 (`start_import`), 8, 11 |
| Decision 17: classify inline only within 30 days | 8 |
| Decision 18: lease claim with `skip_locked` | 10 |
| Decision 19: 404 recovery order, resumable reconcile, `refreshed_at` | 9 |
| Decisions 20, 21: four outcomes, backoff, `consecutive_failures`, narrowed `_fresh` | 3, 9 |
| Decisions 22, 23: bulk sweep, precedence, audits | 6, 10 |
| Decision 24: `MAILBOX_PAUSED` on five send paths | 6 |
| Decision 25: Sync now 202 | 11 |
| Decisions 26, 27: push off without a topic, fail-closed, PyJWT and JWKS, 204 acks, `push_rejected`, rate limit | 13 |
| Decision 28: nh3 policy, 1 MB ceiling | 4 |
| Decision 29: import skips held ids | 8 |
| Decision 30: labels listed every tick, the gone ones deleted | 5, 8 |
| Decision 31: callback to `/integrations`, `refused` with `code` | 7 |
| Decision 32: extra audit events | 6, 7, 9, 11, 13, 14; catalogue 15 |
| §4 storage: every field, `MailLabel`, `MailAttachment`, constraint, index | 1 |
| §4 label rules | 5 |
| §5 loop: `--loop`, SIGTERM, due rules, order, batch, watch, success fields, one-shot `sync_mail` | 8, 9, 10 |
| §6 read endpoints, query ceilings, privacy | 12 |
| §7 webhook | 13 |
| §8 settings, audit catalogue, documents | 1, 15 |
| §9 Outlook and IMAP with the new fields | 11, 12 (tests), 10 (cadence) |
| §10 operator steps; Google Cloud setup | 15, Appendix A |
