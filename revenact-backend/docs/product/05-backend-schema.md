---
description: Backend schema reference — every model, field, relation, constraint and visibility rule in the Revenact database.
---

# Revenact — Backend Schema

Forty-six concrete models across fifteen Django apps, 148 migrations, PostgreSQL 16.
Current as of 2026-09-18, read from `models.py` in every app.

This document describes **storage**. The wire format is in
[`docs/API_CONTRACTS.md`](../API_CONTRACTS.md); the handling rules per entity are
in [`docs/data-classification.md`](../data-classification.md).

---

## 1. Conventions

| Convention | Rule |
|---|---|
| Primary key | `BigAutoField` named `id` on every model |
| Timestamps | `created_at` auto on insert, `updated_at` auto on save, ISO 8601 UTC |
| Tenant boundary | Every row reaches `accounts.Organisation`, directly or through `Customer` / `Account` |
| Deletion | `CASCADE` from the tenant down; `SET_NULL` for people references so removing a user never deletes their work; `PROTECT` where a reference must block deletion (`User.role`, `Customer.primary_product`) |
| Money | `DecimalField(12, 2)`, or `(18, 4)` for metric values |
| Scores | Health `Decimal(3,1)` 0 to 10; pulse `PositiveSmallIntegerField` 1 to 5, null means unrated |
| Enumerations | Django `TextChoices` inner classes, never free strings |

### 1.1 The "exactly one parent" pattern

Sixteen models belong to **either** a `Customer` **or** an `Account`, never both
and never neither. Rather than a generic foreign key, each carries two nullable
foreign keys plus a database check constraint:

```python
customer = models.ForeignKey(Customer, null=True, related_name="notes", on_delete=CASCADE)
account = models.ForeignKey(Account, null=True, related_name="notes", on_delete=CASCADE)


class Meta:
    constraints = [CheckConstraint(..., name="note_belongs_to_exactly_one_parent")]
```

The models using it: `HealthSnapshot`, `Activity`, `Email`, `Task`, `Note`,
`Ticket`, `Attachment`, `Call`, `CalendarEvent`, `Contact`, `Opportunity`,
`Risk`, `Survey`, `Canvas`, `Headline`, `CustomObjectRecord`.

This is chosen over a `GenericForeignKey` so the database enforces the invariant
and ordinary joins stay possible.

---

## 2. Entity overview

```
Organisation ──┬── Role ── User ──┬── reports_to (self, org chart)
               │                  ├── MailboxConnection (1:1)
               │                  └── Notification
               ├── Product
               ├── Connector
               ├── Customer ──┬── Account (many-to-many)
               │              ├── Contact, Activity, Email, Task, Note,
               │              │   Ticket, Call, CalendarEvent, Attachment,
               │              │   Opportunity, Risk, Survey, Canvas,
               │              │   Headline, HealthSnapshot, CustomObjectRecord
               │              │   (each hangs off the Customer OR one Account)
               │              ├── Contribution, Question, FunctionOwner
               │              └── CopilotSession (context)
               ├── Conversation ── Message
               │        └── CopilotSession ──┬── SessionInvite
               │                             ├── SessionParticipant
               │                             └── SessionEvent
               ├── MetricSnapshot, Brief, Explanation, Initiative,
               │   AgentAction (was Proposal), Feedback,
               │   AgentProfile, AgentPolicy (agents)
               ├── ScopeSnapshot (brain)
               ├── CustomObjectDefinition ── CustomFieldDefinition
               ├── Scenario ── ScenarioRun
               ├── WebhookSubscription ── WebhookDelivery
               ├── Campaign ── CampaignSend ── CampaignDelivery
               ├── FxRate
               ├── ModelCall, ModelBudget
               └── AuditEvent
```

---

## 3. `core`

### `AuditEvent`
One security-relevant event. Append-only: `save()` refuses updates and
`delete()` refuses outright.

| Field | Type | Notes |
|---|---|---|
| organisation, actor | FK, SET_NULL, null | denormalised `actor_email` kept alongside |
| action | Char(64), indexed | `<area>.<verb>`, catalogue in `docs/audit-events.md` |
| target_type, target_id, target_repr | Char | what was acted on |
| outcome | Char(16) | success, failure, denied |
| ip, user_agent, request_id | | request provenance |
| metadata | JSON | credential-shaped keys are dropped by `audit.record` |
| created_at | DateTime, indexed | |

Index on `(organisation, created_at)`. Retention 365 days by policy; no purge job
exists yet.

---

## 4. `accounts`

### `Organisation` (the tenant)
`name`, unique auto-generated `slug`, `currency` (USD, EUR, GBP, INR, CAD, AUD,
JPY), `default_lifecycle_stage`, `ai_agent_enabled`, `ai_agent_tone`
(professional, friendly, concise), `global_attributes` JSON, `created_at`.

`ensure_system_roles()` creates the protected Admin and CSM roles.
`effective_global_attributes()` merges stored choices over the defaults, which map
ARR, MRR, renewal date and joined date onto concrete customer columns.

### `Role`
`organisation`, `name`, `slug`, `permissions` (a list of capability strings),
`is_system`. Unique on `(organisation, slug)`.

Capabilities, the closed set: `manage_users`, `manage_org_settings`,
`manage_custom_objects`, `manage_integrations`, `manage_fx_rates`,
`view_all_accounts`.

### `User` (`AUTH_USER_MODEL`)
Email is the username. `name`, `function` (cs, engineering, sales, analytics,
leadership, other), `reports_to` (self-FK, the org chart), `organisation`,
`role` (PROTECT), `is_active`, `is_staff`, `date_joined`, plus the inherited
password and permission fields.

`has_capability(cap)`: superuser true, no role false, else the role's list.

---

## 5. `customers` (the largest app, 45 migrations)

### `Product`
`organisation`, `name`, `is_active`. Unique case-insensitively per organisation.

### `Customer`
The company a CSM tracks. Not to be confused with `Organisation`, the tenant.

**Identity:** `name`, `address`, `domain`, `industry`, `email`, `phone`,
`owner` (the one accountable person, from any function), `created_by`,
`modified_by`, `is_archived`.

**Lifecycle and health:** `lifecycle_stage` (onboarding, kickoff, adoption, live,
renewal, churn, expansion, other), `health_score` Decimal(3,1) default 5.0,
`health_score_override`, `pulse` JSON (history dots), `ai_pulse_value` 1 to 5,
`ai_pulse_reason`, `csm_pulse_score` 1 to 5, `csm_pulse_modified_at`,
`pulse_recorded_on`, `nps_score`, `csat_score`.

**Dates:** `joined_date`, `renewal_date`, `contract_start_date`,
`contract_end_date`, `churn_date`.

**Money:** `currency`, `arr_billed_at_account`, `arr_billed_at_hq`,
`implementation_fee`, `total_contract_value`,
`total_forecasted_renewal_revenue`.

**Product and usage:** `primary_product` (PROTECT), `additional_products_count`,
`top_source_channel`, `total_contracted_seats`, `total_active_seats`,
`total_hires`, `scope_web_app`, `ces_percentage`.

**Churn:** `churn_reason` (price, budget, product_gap, adoption, competitor,
champion_left, acquired, shut_down, consolidation, support, other),
`churn_comment`.

Derived, not stored: `health_category` (good at 7, average at 4, else poor),
`ai_pulse_score` (the enum name for the numeric pulse),
`seat_utilization_percentage`, `csat_breakdown`, `health_breakdown`,
`health_score_is_overridden`, `account_pulse()`.

### `Account`
A named sub-account. **Many-to-many with `Customer`**, related name `accounts`.
Carries its own `name`, `domain`, `industry`, `address`, `email`, `phone`,
`owner`, `lifecycle_stage`, `health_score`, both pulses, `nps_score`,
`csat_score`, `renewal_date` and `arr`. Blank contact fields fall back to the
parent at the presentation layer, not in the model. There is deliberately no
`churn_date`, `is_archived` or `ces_percentage`.

### `HealthSnapshot`
One parent's health on one date: `captured_on`, `health_score`,
`csm_pulse_score`, `ai_pulse_value`. Partial unique constraints give one row per
parent per date; indexed on `(parent, captured_on)`. Written monthly at the last
completed month end.

### `AIClassified` (abstract)
Base of `Email`, `Ticket` and `Call`. Adds `sentiment` (positive, neutral,
negative), `ai_area`, `ai_category`, `ai_subcategory`, `ai_classified_at` and
`classification_corrected_at`. `clean()` refuses a subcategory that does not
belong to its category.

The taxonomy: three areas (product_growth, support_operations, customer_success),
ten categories, twenty-five subcategories, with both directions of the mapping
available in `taxonomy.py`.

### Interaction and record models

| Model | Distinctive fields |
|---|---|
| `Activity` | `type` (11 kinds of thing we did), `occurred_at`, `links`, `watchers` |
| `Email` | `subject`, `sender_name`, `recipient_name`, `body`, `sent_at`, `is_starred`, plus the sync set: `mailbox`, `mailbox_owner` (decides visibility), `direction`, `from_address`, `to_addresses`, `thread_id`, `provider_message_id`, `synced_at`. Unique per mailbox and provider message. Indexed on `(mailbox_owner, -sent_at)` |
| `Task` | `title`, `description`, `assignee_name` (kept equal to `assignee.name`), `created_by`, `assignee`, `due_date`, `priority`, `status` (pending, in-progress, blocked, completed), `blocked_reason` (only while blocked; CheckConstraint), `source` (manual, plan, rule, recommendation, agent), `initiative` (links work to a decision), `plan`, `milestone` (a plan's work; services/plans). At most one of `customer`/`account` (`task_at_most_one_parent`); with neither it is a to-do, its creator's alone; `due_date` may be null only on a to-do (`task_dated_unless_todo`). Index `(assignee, status, due_date)` |
| `TaskEvent` | A task's trail: `task` (CASCADE), `actor` (null = Revenact), `kind` (created, assigned, status, due_changed, edited, comment, recommended, nudged, escalated), `data` JSON, `body`, `created_at`; read only with its task |
| `Note` | `title`, `author_name`, `author` (decides visibility), `body`, `logged_at`, `links` |
| `Ticket` | `ticket_number`, `title`, `status`, `priority`, `connector`, `department` (decides visibility), `opened_at`, `resolved_at`, external id and url, `requester_*`, `synced_at`. Unique per connector and external id |
| `SlackConversation` (`customers`) | One Slack thread on exactly one customer or account (never a ticket; not AIClassified). It has no `organisation` column: the workspace is its customer's or account's. `customer` / `account` (cascade, one only), `connector` (SET_NULL), `department` (≤ 16), `channel` (≤ 32), `channel_name` (≤ 80), `thread_ts` (≤ 32), `title` (≤ 255), `messages` (JSON, at most 50, text cut at 3,000), `latest_reply`, `started_by` (FK User, SET_NULL), `started_by_name`, `started_by_email`, `url`, `last_message_at`, `matched_by` (channel, name, person, earlier), `external_shared`, `synced_at`, `created_at`, `updated_at`. Constraints `slack_conversation_one_parent` and `slack_conversation_once` (unique `(connector, thread_ts)` while the connector exists); indexes `slack_conversation_story` on (customer, last_message_at) and `slack_conversation_story_acct` on (account, last_message_at) |
| `ReplyDraft` | A reply an agent drafted: `owner`, `channel` (email, ticket), `status` (open, sending: an internal claim read as sent, sent), one `customer` or `account`, one `email` or `ticket` (CheckConstraints), `to`, `subject`, `body`, `written_subject`/`written_body` (what the agent wrote: `edited`), `agent`, `agent_action` (SET_NULL), `sent_at`, `sent_by`, `sent_email`. One open or sending draft per email and per ticket (partial unique). A discarded draft is deleted |
| `Attachment` | `file` stored at `attachments/<org>/<uuid><ext>`, sanitised `name`, `content_type`, `size`, `source` (upload or transcript), `uploaded_by`. `delete()` removes the bytes |
| `Call` | `title`, `host_name`, `occurred_at`, `duration_minutes`, `summary`, `connector`, `logged_by`, `transcript` (1:1 Attachment), `recording_url`, `participants` (M2M Contact), `not_analysable` (read with nothing to judge; `ai_classified_at` set, `sentiment` not evidence). `analysis` (a property on every `AIClassified`) reads `pending`, `not_analysable` or `analysed`. The classifier reads the title, then the summary, else the transcript (`calls.call_text`) |
| `CalendarEvent` | `title`, `description`, `type`, `event_date`, `start_time`, `end_time`, `attendee_count` |
| `Contact` | `name`, `role` (8 kinds), `email`, `phone`, `status`, `sentiment`, `sentiment_source` (manual or computed), `sentiment_evidence` JSON (counts only, never text), `sentiment_computed_at`, `previous_sentiment` (the value the last change replaced; blank before any), `sentiment_changed_at` (when; null before any) — set by `contact_sentiment.note_change` on a recompute or a hand edit that changes the value, `last_contacted_at`, `campaigns_unsubscribed_at` |
| `Opportunity` | `title`, `mrr` (workspace currency), `stage` (discovery, qualification, solution_validation, proposal_price_review, negotiation, closed_won, closed_lost), `priority`, `department`, `expected_close` (optional), `stage_changed_at` (kept by `StageClockMixin`, backfilled to `created_at`) |
| `Risk` | Same shape; `stage` is open, mitigated, realised, abandoned; `due_by` instead of `expected_close` |
| `Survey` | `survey_type` (nps, csat, ces), `status`, `score`, `sent_at`, `responded_at`, `send` (nullable FK to `surveys.SurveySend`; one row per send and organisation or account, upserted on each answer). CES is customer-only, enforced in views |
| `Canvas` | A live stakeholder map: `name`, `nodes` (positions and contact ids only) and `edges` (labelled relationships) JSON, `created_by`, `updated_by`, `version` (optimistic concurrency); each person's facts are read live, never stored. Carries `agent_action` (SET_NULL: the agent action that made it) |
| `Headline` | `kind` (summary or headline), `title`, `content`, `status`, period bounds, `data_sources`, `generated_at`. A check constraint forbids a status on a summary |

---

## 6. `copilot`

| Model | Purpose |
|---|---|
| `Conversation` | One chat thread, owned by a user within an organisation. `origin`: where it started, which is the first Ask message's context without its focus (Dashboard: area, view, filters; Organizations: view, filters, labels). Set once; null otherwise, and returned as null to a viewer who may not read the first turn and that Ask turn |
| `Message` | One turn: `role`, `content`, `author`, `sources` (citation snapshots), `ask_suggestions`, `context` (user turns asked from an Ask rail: Dashboard area, view, filters and focus; or Organizations view, canonical filters, server-built labels and focus ids. Never record text), `reply_to` (an assistant reply's own user turn; set on every new reply, legacy rows fall back to the immediately preceding user turn), `grounded_customer_ids`/`carries_anomaly_text` (an Ask reply, or a context-less reply fed one as history: the shared-session snapshot fixed when it is written — every customer id its digest could have drawn on, and whether it could carry a stored anomaly title; null on a reply from before they existed), `grounded_records` (an organisation page reply, or a reply fed one: references to the story items, focus and accounts its digest quoted or counted without citing them, checked like `sources`; null on older replies). `grounded_pipeline`, `grounded_tickets` and `grounded_records` store `{"unknown": true}` when a follow-up's fold could not be known; that marker always fails closed for every reader but the asker |
| `CopilotSession` | Multiplayer wrapper, one-to-one with a conversation. Optional customer or account context. `status`: private, live, awaiting_handoff, closed |
| `SessionInvite` | The access gate. One per user per session, pending, accepted or declined |
| `SessionParticipant` | Who joined, and when they left |
| `SessionEvent` | joined, left, redirected, handed_off, made_live, closed. Chat content stays in `Message` and is never duplicated here |
| `ModelCall` | One row per model call: purpose, provider, model, token counts, latency, outcome (ok, failed, unconfigured, over_budget). No text |
| `ModelBudget` | Monthly token allowance per organisation per purpose |

---

## 7. `metrics`

| Model | Purpose |
|---|---|
| `MetricSnapshot` | One metric's value at one month end, optionally cut by dimension and member. Unique per organisation, metric, dimension, member and period |
| `Brief` | The organisation's written brief: headline, body, watch list, evidence. Also carries `scope_key` (which Brain scope it is for: `company`, or `me:<id>` / `team:<id>`) and `figures_digest` (a SHA-256 of the figures it was written from, so a later read can tell whether it has gone stale) |
| `Explanation` | Why one metric sits where it does: text plus cited figures and the inputs used. Also carries `scope_key` and `figures_digest`, the same as `Brief` |
| `Initiative` | A decision to move a number: hypothesis, metric, optional cut, target value and date, owner, status, outcome, and a baseline captured once at creation and never re-read; `baseline_scope` says how it was read (`company`: the organisation-wide registry; `book`: started from the Brain, the creator's own read of the cut person's book) |
| `AgentAction` | What an agent did or proposes (the former `Proposal`, renamed in place: table `metrics_proposal` and ids kept, every old row an `ops` action of kind `task.create` or `initiative.create`). `agent` (cs, sales, ops), `batch`, `kind` (one of 23: delivery 2 added `draft.reply` and `plan.start`, delivery 3 `segment.create`, `scenario.create`, `campaign.create`, `canvas.create` and `plan.template`; Agent bundles D3 `mail.send_reply`, `slack.reply`, `jira.create` and `jira.assign`), `customer` / `account` (null for a workspace-level kind), `target` (what it changes), `title`, `rationale`, `evidence`, `payload` (was `action`), `before` / `after`, `status` (proposed, applied, rejected, expired, undone), `auto`, `decided_by`, `decided_at`, `decision_note`, `applied_at`, `undone_by`, `undone_at`, `expired_reason` (changed, date_passed, waited, never, not_reproposed, replaced), `result`, `session` when captured by the facilitator. Partial unique `agent_action_one_open` on (organisation, kind, customer, account, target) while proposed. Agent bundles D1 (2026-10-13): every action is a step of a bundle: `bundle` (FK `agents.AgentBundle`, non-null, cascade, `related_name="steps"`), `position` (1-based, unique per bundle: `agent_action_bundle_position`), `selected` (the last run's tick, default true), `outputs` JSON (the ids it made and their app links), `error` (≤ 500, the last failure as a plain sentence), `irreversible` (what the step was when it ran); statuses gain `failed` and `skipped`; kinds gain `survey.send` and `campaign.send` (19 in all); `save()` on a row with no bundle first makes it a bundle of one |
| `AgentBundle` (`agents`) | An agent's proposal as a bundle of ready-to-run steps (Agent bundles D1). `organisation` (cascade), `agent` (cs, sales, ops), `title` (≤ 255), `reason`, `source` (`nightly`, `thread`, since Slack bundles `slack_message`, since the sales review report `meeting`), `customer` / `account` (nullable, cascade; both null for workspace-level), `routed_to` (`owner`, `department`, `admins`, or `person` for a Slack or meeting bundle), `routed_user` (the record's owner when it was made, set null), `status` (waiting, running, done, partly_done, rejected, expired, superseded), `edited_at` / `edited_by`, `run_by`, `run_started_at`, `run_finished_at`, `reject_reason` (already_handled, not_relevant, wrong_person, other or blank), `reject_note` (≤ 255), `created_at`, `updated_at`. Indexes `agent_bundle_status` (organisation, status) and `agent_bundle_updated` (organisation, updated_at). `__str__` is `Agent bundle <id>` (an audit row records it; the title names a record) |
| `SignalThread` (`agents`) | One conversation the agents read (Agent bundles D2). `organisation` (cascade), `source_kind` (mail, slack, zendesk, freshdesk, jira, webhook), `external_id` (≤ 320: mail `"<mailbox id>:<thread id>"`, ticket `"<connector id>:<external id>"`, Slack conversation `"<connector pk>:<thread_ts>"`), `customer` / `account` (nullable, cascade), `department` (≤ 16, blank for mail), `mailbox` (FK `mail.MailboxConnection`, nullable, cascade), `mailbox_owner` (FK User, nullable, cascade), `mail_thread` (≤ 255), `ticket` (FK `customers.Ticket`, nullable, cascade), `conversation` (FK `customers.SlackConversation`, nullable, cascade; set instead of `ticket` for a Slack thread), `last_message_at`, `processed_at`, `processed_through`, `status` (new, waiting_quiet, waiting_credits, processed, skipped), `skip_reason` (≤ 24: no_reader, answered, resolved, source_off, ai_off, agent_off, stale, failed; budget or credits while waiting), `agent` (cs, sales, ops or blank), `failures` (small int), `claimed_at`, `created_at`, `updated_at`. Unique `signal_thread_once` on (organisation, source_kind, external_id); index `signal_thread_due` on (organisation, status, last_message_at). No message text is stored |
| `AgentBundle` D2 fields | Agent bundles D2 adds five fields to `AgentBundle`: `thread` (FK `SignalThread`, nullable, set null, `related_name="bundles"`), `department` (≤ 16, the `User.Function` code when `routed_to` is `department`), `has_newer_message` (bool, default false), `refreshed_at` (nullable) and `rejected_by` (FK User, nullable, set null). `AgentAction` gains `edited_at` (nullable, the last saved edit). `Organisation` gains `ai_signal_interval` (`30m`, `1h` default, `4h`, `24h`), `ai_signal_sources` (JSON, `{source: bool}`, a missing source reads as on) and `ai_signals_ran_at` (nullable, the last intake run's start) |
| `AgentProfile` (`agents`) | One per workspace and agent (cs, sales, ops): `enabled`, `monthly_credits`, `last_run_at`, `last_run` JSON |
| `AgentPolicy` (`agents`) | One per workspace: `levels` JSON `{agent: {kind: auto/ask/never}}`; a missing entry reads as ask |
| `Feedback` | A human correction: classification, proposal decision or health override, with before and after |

The 21 metrics themselves live in code (`registry.py`), not in the database:
active_customers, active_arr, average_arr, logo_retention, churned_arr_12m,
top_three_share, forecast_arr, nrr, at_risk_arr, seat_utilisation, shelfware_arr,
at_capacity_arr, coverage, dark_accounts, dark_arr, healthy_share,
poor_health_count, open_tickets, open_questions, stale_questions,
contributions_30d.

---

## 7a. `brain`

| Model | Purpose |
|---|---|
| `ScopeSnapshot` | One row per organisation, scope key (`me:<id>` / `team:<id>`) and day: a month-end or a baseline. Carries the scope's owners, book (every customer id, archived and churned too), values and cuts, so a Me or My team scope's "what changed" has its own history to compare against — Company keeps using `MetricSnapshot`. Unique per organisation, scope key and day |

A Brain scope's brief and explanation writes are serialised without a model
of their own: two writes of the same scope's brief (or the same
scope+metric's explanation) are kept to one at a time by a Postgres
session-level advisory lock (`services/brain/locks.held`), taken outside
any transaction so the model call it holds never also holds a database row
lock. A request that waited reuses a newer brief/explanation only if this
reader can open every customer it names.

---

## 8. `knowledge`

| Model | Purpose |
|---|---|
| `FunctionOwner` | Who answers for one function on one customer. One per customer and function. `clean()` requires the person to actually work in that function |
| `FunctionHead` | The head of one function in a workspace. One per workspace and function. `clean()` requires an active member of the workspace working in that function; read as nobody once they leave or move |
| `Contribution` | What a colleague knows about a customer, attributed, with the author's function snapshotted at write time |
| `Question` | An asked question routed to an assignee, optionally raised from a Copilot turn. Its answer is stored as a `Contribution`, so the knowledge base picks it up |

---

### `knowledge` (gaps and the brief)

| Model | Purpose |
|---|---|
| `KnowledgeGap` | A question the company could not answer about a customer: subject, how often it has been asked, which function owes the answer, and the `Contribution` that eventually filled it. Raised from a Copilot answer with no sources, or a routed question left open |
| `AccountBrief` | One per customer: use cases, stakeholders, open threads and the records it was written from. Generated on request, never on a schedule |

---

## 9. `mail`, `connectors`, `webhooks`, `campaigns`

| Model | Purpose |
|---|---|
| `MailboxConnection` | One per person. Provider (google, microsoft, imap), address, Fernet-encrypted `credentials`, `sync_cursor` (Outlook and IMAP), status (connected, error, disconnected). Gmail: `granted_scopes`, `history_id`, the import (`import_after`, `import_before`, `import_page_token`, `import_total_estimate`, `import_done_at`), the reconcile (`reconcile_started_at`, `reconcile_page_token`), `watch_expires_at`, `wake_at`, `lease_until`, `backoff_until`, `consecutive_failures`, `paused_reason`, `disconnected_at`. One live Google connection per address (partial unique); indexed on `(provider, status, wake_at)`; `send_as_name`, `signature_html` (Gmail's send-as signature, or an Outlook mailbox's own, written through `PATCH /mail/connection/`), `send_as_synced_at` |
| `MailLabel` | A Gmail label of one connection: `gmail_id` (unique per connection when set), name, type (system, user), colours; mirrored every tick |
| `MailAttachment` | A file part of one `MailMessage`: `part_id` (unique per message), Gmail attachment id, filename, MIME type, size, content id, inline flag, `file` (fetched on first open, deleted with the row), `fetched_at` |
| `MailMessage` | The owner's copy of one message: folder, flags, state, category, the filed `Email` when matched; Gmail adds `html_body`, `cc`, `bcc`, `rfc_message_id`, `references`, `label_ids`, `has_attachments`, `refreshed_at`; a GIN index on `label_ids`; `reply_to` |
| `MailOutbox` | One change on its way to Gmail: connection, `action_id` (one per request), `op`, `message` or (`label_create`) `label`, `label_key` (Gmail label id or `pending:<label id>`), `add`, `previous`, `payload`, status (pending, sending, sent, failed), `attempts`, `next_attempt_at`, `reason`, timestamps. One pending row per (message, label); one live `label_create` per label; `draft` (draft ops), ops `draft_create`/`draft_update`/`draft_delete`, reason `too_large`, one pending row per draft |
| `MailDraft` | A Gmail draft: connection, owner, organisation, `message` (the Drafts row), `kind`, `source`, `thread_id`, `in_reply_to`, `references`, `to`/`cc`/`bcc`, `subject`, `html`, `text`, `forwarded`, `customer`/`account` (at most one), `record_chosen`, `reply_draft` (linked agent draft), `gmail_draft_id` (unique per mailbox when set), `gmail_message_id`, `gmail_state`, `revision`, `status`, `sent_at`, `sent_email`, timestamps |
| `Connector` | An external system for the organisation. Thirteen provider choices, five implemented. `department` stamps every ticket it brings in. Encrypted credentials, sync cursor, and optional scoping to particular customers or accounts (empty means org-wide). Agent bundles D3 adds `granted_scopes` (JSON list: Slack's bot scopes, or the Jira permissions last found), `agents_can_act` (bool, default false: the switch), `agents_allowed_by` (FK User, set null) and `agents_allowed_at`; non-secret `config` gains Slack `team_id`, `bot_name`, `via` and Jira `account_name` |
| `WebhookSubscription` | Outbound subscription: url, event (only `customer.created` today), signing `secret` (plaintext, known gap), active flag |
| `WebhookDelivery` | One attempt: success, status code, error |
| `Campaign` | An owner's plain-text email to one of their segments: subject, body, segment, roles, sharing; draft, active or archived; `recipients` is read-only history. Carries `agent_action` (SET_NULL: the agent action that made it) |
| `CampaignSend` | One send: manual or from a rule (and its review), who sent it, frozen subject, body and counts |
| `CampaignDelivery` | One person on one send: queued, sent or skipped with a reason, the Email row it filed, the hash of its unsubscribe token (kept on a row skipped `failed` after a crash, whose email may have gone out; cleared on a known failure) |

---

## 10. `custom_objects`, `scenarios`, `notifications`, `fx_rates`

| Model | Purpose |
|---|---|
| `CustomObjectDefinition` | A tenant-defined object; applies to customers, accounts or both |
| `CustomFieldDefinition` | A field on it: text, number, currency, date, boolean or picklist, with ordering and required flag |
| `CustomObjectRecord` | One instance, `data` JSON keyed by field api_name, attached to exactly one parent |
| `Scenario` | An automation graph: `apply_to`, `nodes` and `edges` JSON, `is_active` gating event runs. A condition reads an allowlist of customer facts, an AI attribute by name, or matches a plain-English phrase against recent interactions by embedding; actions include routing the customer to a person |
| `ScenarioRun` | One execution with a per-node log |
| `Notification` | copilot_invite, copilot_handoff, customer_assigned, account_assigned, question_asked, question_answered, segment_changes, rule_fired, rule_review, plan_started, plan_task_assigned, campaign_sent, task_assigned, recommendations_waiting, task_overdue, task_escalated, agent_proposal_waiting (labelled "Bundles waiting" since Agent bundles D1), agent_step_failed ("Agent step failed", Agent bundles D3) (kind ≤ 32 characters); message (≤ 500), relative link, read flag |
| `FxRate` | Current rate to the organisation's currency. No history; cleared when the organisation changes currency |

---

### `attributes`

| Model | Purpose |
|---|---|
| `AIAttribute` | A plain-English question asked of every company: `prompt`, typed `value_type` (text, number, boolean, picklist), `applies_to_customer` / `applies_to_account`, `refresh` (manual or nightly). Defined under `manage_custom_objects` |
| `AIAttributeValue` | One answer, append-only: `value`, `reasoning`, `sources` (citation snapshots), `status` (filled, insufficient, failed), `origin` (ai or human), `set_by`, `computed_at`. Exactly one of customer or account. The newest row is the current value; a reader's view of `sources` and `reasoning` is filtered by their own visibility of the cited records |

---

### `requests`

| Model | Purpose |
|---|---|
| `FeatureRequest` | One thing customers keep asking for: title, summary, status, owner, and the centroid `embedding` new asks are matched against |
| `RequestEvidence` | One classified interaction filed under a request: `kind` + `record_id` (unique together), the company it came from (exactly one of customer/account), a snippet and its date. `dismissed` keeps a rejected ask out of the next gather |

---

### `anomalies`

| Model | Purpose |
|---|---|
| `Anomaly` | A cluster of reports that mean the same thing across several companies: title, summary, status, and the centroid later reports are matched against |
| `AnomalyEvidence` | One interaction in a cluster, with the company it came from and copies of the source's `mailbox_owner` and `department` so the snippet stays behind the record's own rule |

---

### `translation`

| Model | Purpose |
|---|---|
| `Translation` | One record's words in one language, kept so the next reader pays nothing. `source_hash` makes an edited record miss the cache. Read only under the source record's own rule |

---

### `attention`

| Model | Purpose |
|---|---|
| `AttentionSnooze` | One viewer's snooze on one Dashboard Overview "Needs attention" item: `user` + `key` (unique together), `until` (nullable; null means Done), `fingerprint` (the item's facts at snooze time — never a count of days — so a later read can tell whether it got worse) |

No model backs the items themselves — `services.attention.rules.build_items`
computes them fresh from `Customer`, `Ticket` and `Anomaly`/`AnomalyEvidence`
each request, the same reuse-the-existing-rule shape as the forecast and
health rollups above.

### `organizations`

No model. `services.organizations.book.load_portfolio` reads `Customer` (with `with_health_inputs`),
`HealthSnapshot`, `FxRate` and `Ticket` for the viewer's visible, filtered book on every request, and
`shape.py` orders, groups and totals it in Python — the same reuse-the-existing-rule shape as the
dashboard rollups. Bulk edits write `Customer` through `CustomerSerializer`.

The organisation page's Story (`services.organizations.story`) has no model either. It reads `Activity`, `Call`,
`Email`, `CalendarEvent`, `Ticket`, `Task`, `Note`, `Survey` and `HealthSnapshot` for one organisation and its
visible accounts, each under its own record rule, plus `Question` and `AnomalyEvidence` for the Needs attention
block.

### `accounts_portfolio`

No model. `services.accounts_portfolio.book.load_portfolio` reads `Account` (with the account last-touch
annotation), `HealthSnapshot` (account-level), `Ticket` and the `Account.customers` link table for the viewer's
visible, filtered accounts on every request, and `shape.py` orders, groups and totals it in Python. Bulk edits write
`Account` through `AccountSerializer`.

### `pipelines_portfolio`

No model. `services.pipelines_portfolio.book.load_book` reads `Opportunity` or `Risk` (both parents and their owners
joined) and the `Account.customers` link table for the viewer's readable, filtered items on every request, and
`shape.py` orders, groups and totals them in Python. Bulk edits write through `OpportunitySerializer`/`RiskSerializer`.

### `account_story`

No model. The account page's Story reads the organisation story's sources (`Activity`, `Call`, `Email`,
`CalendarEvent`, `Ticket`, `Task`, `Note`, `Survey`, `HealthSnapshot`) filed on one visible account, each under
its own record rule, and `Account.renewal_date` for Needs attention.

---

### `segments`

| Model | Purpose |
|---|---|
| `Segment` | A saved group of one kind (`customer`, `account` or `contact`): `rules` JSON (`{match, conditions}`, one level of groups, at most 20 conditions), `pinned_ids` and `excluded_ids` (≤ 500 each), `sharing` (`private`, `workspace`, `people` with `shared_with`), `alert_on_changes`, `paused` (set while the owner is inactive), and the nightly baseline: `last_members` (sorted ids as the owner saw them; null before the first run or above 100,000), `member_count`, `last_evaluated_on`. Owned by one person (cascade); at most 50 per owner. Members are never stored for a reader: they are computed per request. Carries `agent_action` (SET_NULL: the agent action that made it) |
| `SegmentChange` | One record entering or leaving one segment on one day (unique per segment, record and day): `record_id`, `change` (`entered`/`left`), `changed_on`, `reason` (field keys that moved it, or `pinned`, `deleted`, `access`, `churned`, `archived`; never values) |

---

### `surveys`

| Model | Purpose |
|---|---|
| `SurveySend` | One survey sent to one audience: `owner`, `name`, `survey_type`, `subject`, `intro`, `segment` (SET_NULL), `roles`, `status` (`draft`, `sending`, `sent`), `sharing` with `shared_with`, `started_at` (the claim; links expire 14 days after), `sent_at`, `counts` (frozen). At most 20 started per owner per day and 500 people per send |
| `SurveyInvite` | One person asked once: `contact` (SET_NULL), exactly one of `customer`/`account` (the record scored), `email`, `token_hash` (SHA-256, unique; the token is never stored), `expires_at`, `status` (`pending`, `failed`, `answered`; expired is derived), `failure` (the error's class name and a fixed message, never the address), `score` (0–10, required once answered), `comment`, `answered_at`. Indexed on (contact, created_at) for the 30-day quiet period and (customer\|account, answered_at) for the 90-day figure |

---

### `rules`

| Model | Purpose |
|---|---|
| `Rule` | A "when → then" rule: `owner`, `name`, `is_active` (default off), `segment` (the owner's own, SET_NULL), `trigger` (`entered`, `left`, `crossed`, `schedule`) with `score`/`direction`/`threshold` or `cadence`/`weekday`, `actions` (1–3 JSON objects: notify, task, lifecycle, survey, plan, campaign), `cooldown_days` (1–365, default 30), `sharing` with `shared_with`, `paused_reason`. At most 50 per owner. Carries `agent_action` (SET_NULL: the agent action that made it) |
| `RuleState` | Per rule and record (`record_kind`, `record_id`, unique): `last_value` (last night's score, for `crossed`) and `last_fired_on` (the cooldown) |
| `RuleRun` | One rule's night (unique per rule and `run_on`): `matched`, `fired`, `skipped` (`cooldown`, `cap`, `not_visible`, `failed`, `nobody`), `started_at`, `finished_at` |
| `RuleRunRecord` | One record a night touched (unique per run and record): `outcome`, `reason`, `actions` (`[{action, status, detail}]`) |
| `RuleReview` | One night's survey or campaign for the owner (`kind`, survey or campaign, one of each per night): `action` (frozen), `records`, `counts`, `status` (`waiting`, `approved`, `skipped`, `expired` after 7 days), `decided_by`, `decided_at`, `result`, `notified_at` (when the owner was told) |

---

### `plans`

| Model | Purpose |
|---|---|
| `PlanTemplate` | `name`, `kind`, `description`, `sharing` with `shared_with`, `milestones` (JSON: 1–12 milestones with offsets and tasks, at most 50 tasks), `is_builtin`. Built-ins have no `organisation` or `owner` (CheckConstraint). At most 50 personal templates per owner. Carries `agent_action` (SET_NULL: the agent action that made it) |
| `Plan` | On one `customer` or `account` (CheckConstraint); `template` (SET_NULL), `name`, `kind`, `owner` (PROTECT), `start_date`, `target_date`, `status`, `status_set_by`, `at_risk_cleared_on`, `started_by`, `started_by_rule`, `done_at`, `start_figures` (JSON, null: `{health_score, arr, currency, taken_on}` when the plan started; null for plans from before 2026-10-05; written once by `plans.starting`), `draft_tasks` (JSON: a Draft's kept tasks), `agent_action` (SET_NULL: the agent action that started it). Status `draft` is not open. Partial unique `(customer, template)` and `(account, template)` while open with a template |
| `Milestone` | `plan` (CASCADE), `name`, `position`, `due_date`, `done_at`, `done_by` |

---

### `metrics` (brief delivery)

| Model | Purpose |
|---|---|
| `BriefSchedule` | One per organisation: where the management brief is posted (a Slack incoming webhook, never returned to a client) and on which day. Posts what exists; never generates, and has no hour because the job that posts it runs once a night |

---

### `mcp`

| Model | Purpose |
|---|---|
| `McpToken` | One person's key for an agent that reads Revenact as them. Stored hashed, shown once, revocable. Every MCP tool runs under that person's own visibility |

---

### `work`

| Model | Purpose |
|---|---|
| `Recommendation` | A task Revenact recommends from a signal (renewal_due, health_drop, urgent_tickets, overdue_tasks, open_questions, anomaly, agent_action): `organisation`, `customer`, `account` (null), `title`, `why` JSON (facts, evidence), `proposal` (the legacy FK, kept), `agent_action` (agent_action kind only; one open per action), `suggested_assignee`, `recipient`, `status` (open, assigned, dismissed, expired), `dismiss_reason`, `dismiss_note`, `decided_by`, `decided_at`, `task` (OneToOne), `signal_value`. Partial uniques: one open per organisation, kind and customer (account null), one open per organisation, kind, customer and account (account set), neither for agent; one open per proposal (an expired one may sit beside it). `dismiss_reason` may be `retired` (set only by `work.0006_retire_recommendation_kinds`, which dismissed every open `overdue_tasks`, `open_questions` and `agent_action` row); those three kinds are no longer made. |
| `WorkSettings` | One per organisation, made lazily: `recommend_to` (manager, owner), `sources` JSON (per kind: on or off and its threshold), `dismiss_cooldown_days`, and (delivery 3) `timezone` (IANA name, default UTC), `working_days` (weekday numbers 0 Monday to 6 Sunday, default 0-4), `escalate_after_days` (1-30, default 2), `digest_enabled` (default true), `digest_hour` (0-23 local, default 8). `email_ready` is computed from `EMAIL_BACKEND`, not stored |
| `DigestSend` | One row per person per workspace-local date (`user`, `local_date`, `status` pending, sent, empty, failed; unique on user and date), inserted as pending before anything is sent so a day's digest goes at most once |

Work also adds to other apps: `Task.last_nudged_at` and `Task.escalated_at` (customers; `escalated_at` is cleared when a task is reassigned, re-dated or re-opened), `User.digest_opt_out` (accounts; a personal switch, default false), and the `Notification` kinds `task_overdue` and `task_escalated`.

---

## 11. Visibility rules

Each rule has exactly one definition. Add a new reading endpoint and you must
call the matching helper.

| Records | Rule | Defined in |
|---|---|---|
| Customers and accounts | Own organisation, then: `view_all_accounts` sees all; otherwise owned, owned by a report, account-owned, unowned, function-owned, a customer you were asked about or answered for, or one you wrote about | `services/customers/scoping.py` |
| Organisation roll-ups (`/customers/<id>/…` contacts, opportunities, risks, surveys, canvases, files, calls; `/surveys/?customer=`) | The organisation's own records, plus those on its accounts in `visible_accounts`: being able to open the organisation is not enough for an account-level record | `scoping.customer_rollup_q` |
| The account page (`/accounts/<id>/story/` and `/accounts/<id>/…`) | The account in `visible_accounts`, else 404 whether or not it exists; then each record's own rule (rows below) | `services/account_story/scope.py`, `scoping.get_url_account` |
| Notes | Author and their management chain; authorless seeded rows are visible to all | `services/customers/personal.py` |
| Tasks | Creator, assignee and both chains, plus every reader with view_all_accounts or the Leadership function; authorless seeded rows visible to all; always only on a record the reader may open | same |
| Recommendations | Decided by the recipient, anyone above the suggested assignee, or `view_all_accounts`; read only by them and only on a record they may open (the rest counted); routes answer 404 otherwise | `services/work/rec_access.py` |
| Tickets | Own department plus undeparted tickets; Leadership and `view_all_accounts` see all | same |
| Synced emails | Mailbox owner and their chain; rows with no mailbox owner are visible to all | `services/mail/visibility.py` |
| A contact's history (`/contacts/<id>/history/`) | The contact must be visible; then each call, email and ticket by its own company (`visible_children_q`) and its own rule (mail, tickets above), inside the contact's own tenant | `services/customers/contact_history.py` |
| Opportunities and risks | The parent organisation or account must be openable (`visible_children_q`), then own department plus undeparted; Leadership and `view_all_accounts` see every department. The Pipelines book applies both once (`pipelines_portfolio.book.scope`); `companies` names only openable organisations | `scoping.pipeline_visible_q` |
| Segments | Read by the owner, the workspace (`workspace`) or chosen teammates (`people`); written by the owner only. Members are the rules over the reader's own visible records, pins added, keep-outs removed, visibility last; ids in rules a reader cannot open read null; a shared viewer gets a count of the rest | `services/segments/access.py`, `evaluate.py` |
| Survey sends | Read by the owner, the workspace or chosen teammates; written and sent by the owner only. The audience is the owner's own segment over the contacts they may open. Answers and pending people are listed only on records the reader may open (`visible_children_q` on the invite's own record), the rest a count; a shared reader's figures cover only those people | `services/surveys/access.py`, `audience.py`, `summary.py`, `answers.py` |
| Rules | Read by the owner, the workspace or chosen teammates; written by the owner only, on their own segment. A rule runs as its owner over records they may open; a night's records are listed only where the reader may open them now, the rest a count; reviews are the owner's alone | `services/rules/access.py`, `records.py`, `payloads.py`, `reviews.py` |
| Plans | Read by whoever may open the plan's record; its tasks by their own rule, the rest a count; written by the plan's owner and anyone above them, a task's status also by its assignee and creator; templates read when built in, owned or shared, written by their owner | `services/plans/access.py`, `payloads.py` |
| Contributions and questions | Self, subtree, same function, ancestors, plus anything addressed to you | `services/knowledge/views.py` with `services/accounts/hierarchy.py` |
| Conversations and sessions | Owner, or an accepted and active participant. The same function gates the WebSocket | `services/copilot/views.conversations_visible_to` |
| Copilot replies | A reply that cites records outside the viewer's scope is withheld entirely, not trimmed | `copilot.views._reply_readable_by` |

Brain scopes. `ScopeActor(principal, owner_ids)` (customers/scoping.py)
narrows `visible_customers`/`visible_accounts` to one owner set's book:
customers they own, accounts they own or under those customers; built only
by `brain.scope.resolve`. Everything else a rule asks about a person
(`has_capability`, `function`, `id`) is the principal's — the reader for a
live read, the scope's own user for a month-end row — so pipeline and
ticket departments and the mail, note and task chains apply as that
person. Named downside in Brain prompts is counted as the reader.

---

## 12. Derived versus stored

| Value | Where it lives | Why |
|---|---|---|
| `health_score` | Stored column, recomputed on write and nightly | The list endpoint sorts and filters on it in SQL |
| `health_score_override` | Separate column | A human opinion must not be silently overwritten by the next recalculation |
| `health_category`, `ai_pulse_score`, `seat_utilization_percentage` | Python properties | Pure functions of stored values |
| `account_pulse` | Computed per request from annotated inputs | Depends on a 30-day window, so it cannot be stale |
| Pulse history dots | Stored JSON list, one per day | Appended by the daily job |
| Metric values | Stored only at month end | Live values are computed from the same rollups the dashboards use |
| Contact `sentiment` | Stored, with `sentiment_source` saying whether a human set it | Lets a hand-set value survive until evidence exists |

---

## 13. Adding a model

1. Put it in the app that owns the concept. If it belongs to a customer or an
   account, use the two-nullable-keys plus check-constraint pattern above.
2. Add the visibility helper call to every endpoint that reads it, or explain in
   the docstring why it is unrestricted.
3. Update [`docs/data-classification.md`](../data-classification.md) in the same
   pull request as the migration. That file is the compliance artefact.
4. Update [`docs/API_CONTRACTS.md`](../API_CONTRACTS.md) with the endpoints.
5. Add this document's row.
6. Unit, integration and end-to-end tests, per the `testing` skill.
7. If it touches a security-relevant action, call `audit.record` and add a row to
   [`docs/audit-events.md`](../audit-events.md).

## Agents delivery 1: migrations

| Migration | Change |
|---|---|
| `metrics 0011_agent_action` | Renames `Proposal` to `AgentAction` and `action` to `payload`; adds agent, target, before, after, auto, applied, undo and expiry columns and `agent_action_one_open`; maps old statuses (approved becomes applied) and kinds in place |
| `agents 0001_initial` | `AgentProfile`, `AgentPolicy` |
| `work 0004_recommendation_proposal_fk`, `work 0005_agent_action` | Recommendation gains `agent_action`, kind `agent` becomes `agent_action`, one open per action |
| `notifications 0010_agent_action_undone` | New kind `agent_action_undone` |

## Agent bundles delivery 1: migrations

| Migration | Change |
|---|---|
| `agents 0002_agent_bundle` | `AgentBundle` with its two indexes |
| `metrics 0014_agent_action_steps` | `AgentAction` gains `bundle` (nullable for now), `position`, `selected`, `outputs`, `error`, `irreversible`; statuses `failed` and `skipped`; kinds `survey.send`, `campaign.send` |
| `agents 0003_bundles_of_one` | Data: every existing action gets its own bundle in batches of 500, the bundle's status and run fields mapped from the action's (contract §1.4); reverse deletes every bundle |
| `metrics 0015_agent_action_bundle_required` | `bundle` non-null; unique `agent_action_bundle_position` on (bundle, position) |
| `notifications 0014_bundles_waiting` | The `agent_proposal_waiting` kind's label becomes "Bundles waiting" (value kept) |

## Agent bundles delivery 2: migrations

| Migration | Change |
|---|---|
| `accounts 0016_organisation_agent_signals` | `Organisation.ai_signal_interval`, `ai_signal_sources`, `ai_signals_ran_at` |
| `agents 0004_signal_thread` | `SignalThread` with `signal_thread_once` and `signal_thread_due`; `AgentBundle` gains `thread`, `department`, `has_newer_message`, `refreshed_at`, `rejected_by` |
| `agents 0005_bundle_rejected_by` | Data: each rejected bundle's `rejected_by` from its first rejected step's `decided_by`; reverse is a no-op |
| `metrics 0016_agent_action_edited_at` | `AgentAction.edited_at` |

## Agent bundles delivery 3: migrations

| Migration | Change |
|---|---|
| `metrics 0017_agent_action_outside_kinds` | `AgentAction.kind` gains `mail.send_reply`, `slack.reply`, `jira.create`, `jira.assign` (23 in all) |
| `connectors 0004_connector_agent_access` | `Connector.granted_scopes`, `agents_can_act`, `agents_allowed_by`, `agents_allowed_at` |
| `notifications 0015_agent_step_failed` | `Notification.kind` gains `agent_step_failed` |
| `metrics 0018_agent_action_jira_comment` | `AgentAction.kind` gains `jira.comment` (24 in all) |
| `connectors 0005_jira_link` | `JiraLink`: one per person (OneToOne user), `organisation`, Atlassian `account_id`, `name`, `email`, Fernet-encrypted `credentials` (access token, rotating refresh token, expiry), `sites` (Jira-scoped accessible resources), `scopes`, `status` (`linked`, `lost`), `linked_at`, `refreshed_at`, `lost_at`; unique `(organisation, account_id)` |

## Agent bundles round 2 delivery 3: migrations

| Migration | Change |
|---|---|
| `connectors 0006_unmatched_item` | `UnmatchedItem` (a Slack or Jira message that matched no customer: connector, provider, department, external id, number, title, 2,000-character excerpt, sender name and email, url, priority, status `waiting` or `dismissed`, seen times, dismissed by and at), constraint `unmatched_item_once` and index `unmatched_item_queue` |
| `agents 0006_signal_thread_urgent` | `SignalThread.urgent_rule` and index `signal_thread_urgent` |
| `accounts 0017_organisation_fast_lane` | `Organisation.ai_fast_lane` (JSON, default `{}`) and `ai_fast_ran_at` |

## Two-way Gmail delivery 1: migrations

| Migration | Change |
|---|---|
| `accounts 0015_organisation_gmail_two_way` | `Organisation.gmail_two_way_enabled` (default off) |
| `mail 0004_gmail_two_way` | The connection's Gmail state and status `disconnected`; the message's HTML, cc/bcc, threading headers, label ids, attachment flag and `refreshed_at`; `MailLabel`, `MailAttachment`; `one_live_google_connection_per_address`, `mail_conn_due_idx` |

## Two-way Gmail delivery 2: migrations

| Migration | Change |
|---|---|
| `mail 0005_mail_outbox` | `MailOutbox` with its constraints and indexes; `MailAttachment.fetched_at` and its organisation path; `mail_msg_label_ids_gin` (`jsonb_path_ops`) |
| `notifications 0012_mail_action_failed` | The `mail_action_failed` kind |

## Two-way Gmail delivery 3: migrations

| Migration | Change |
|---|---|
| `mail 0006_mail_drafts` | `MailDraft`; `MailOutbox.draft`, the draft ops, `too_large`, the rewritten row shape and one pending row per draft; the send-as fields; `MailMessage.reply_to` |

## Slack escalations delivery 1: migrations

| Migration | Change |
|---|---|
| `customers 0062_slackconversation` | `SlackConversation` (customer or account, connector, department, channel, thread_ts, title, up to 50 `messages`, `latest_reply`, who started it, url, `last_message_at`, `matched_by`, `external_shared`), constraints `slack_conversation_one_parent` and `slack_conversation_once`, and the story indexes |
| `connectors 0007_unmatched_candidates` | `UnmatchedItem.candidates` (JSON list of `{type, id}`, at most 5) |
| `agents 0007_signal_thread_conversation` | `SignalThread.conversation` (FK, CASCADE, nullable) |
| `agents 0008_slack_tickets_to_conversations` | Data: every ticket of a Slack connector becomes a conversation (`matched_by="earlier"`), its thread and its `slack.reply` steps point at it, the ticket is deleted. Forwards only |

## Slack escalations delivery 2: migrations

| Migration | Change |
|---|---|
| `knowledge 0006_functionhead` | `FunctionHead` (organisation, function, user, `updated_at`) with the unique constraint `one_head_per_function_per_organisation` |

## Slack escalations delivery 4: migrations

| Migration | Change |
|---|---|
| `customers 0063_escalation_links` | `Ticket.conversation` (FK `SlackConversation`, SET_NULL, nullable, `related_name="tickets"`: the thread an issue was made from); `SlackConversation.people` (JSON, default `{}`: `{slack user id: {"name", "member"}}`, names and member ids only, never an email). A stored message may also carry `via_app: true` (no migration: inside `messages`) |
| `agents 0009_escalation_participants` | `AgentBundle.escalation` (JSON, default `{}`: the escalation's function, person, `via`, issue step, shared flag, starter's first name, the thread's decision and the template reply; `changed` after a Change); `BundleParticipant` (`bundle` CASCADE `related_name="participants"`, `user` CASCADE; unique `(bundle, user)`, index `(user, bundle)`) |

## Slack escalations delivery 3: migrations

| Migration | Change |
|---|---|
| `connectors 0009_slackchannel` | `SlackChannel`: `connector` (CASCADE), `channel_id`, `name`, `is_private`, `external_shared`, `is_member`, `is_archived`, `included`, `chosen_by` / `chosen_at`, `customer` / `account` (SET_NULL, at most one: `slack_channel_one_record`), `join_error`, `read_error`, `last_message_at`, `read_at`, `walk_before`, `walk_from`, `asked_at`, `missed` (JSON list of message timestamps, at most 50), `event_at`, `created_at`, `updated_at`; unique `slack_channel_once` on `(connector, channel_id)` |
| `customers 0064_slackconversation_channel_once` | `slack_conversation_once` becomes unique on `(connector, channel, thread_ts)` where `connector` is not null. After Slack escalations D4's `0063_escalation_links` |
| `connectors 0011_slack_tag_check` | `SlackTagCheck` (channel tag to-dos, 2026-10-18): `connector` (CASCADE), `conversation` (`customers.SlackConversation`, CASCADE), `channel`, `message_ts`, `author` (User, CASCADE), `state` `pending` / `claimed`, `attempts`, `created_at`; unique `slack_tag_check_once` on `(connector, channel, message_ts)`, index `slack_tag_check_age` on `created_at`. No message text; a row is deleted once the tick handles it and dropped after an hour |
| `connectors 0010_slack_channels_from_config` | Data, forwards only: each Slack connection's `config["channel"]` becomes its `SlackChannel` (`read_at` the migration's time); a connection set to one record moves it onto the channel; Slack `SignalThread` keys become `"<connector>:<channel>:<ts>"` and Slack `UnmatchedItem` keys `"<channel>:<ts>"` |

## Connections (2026-10-16): migrations

| Migration | Change |
|---|---|
| `connectors 0008_slack_link` | `SlackLink`: one per person (OneToOne user), `organisation`, `team_id`, `slack_user_id`, `name`, Fernet-encrypted `credentials` (the user token), `scopes`, `status` (`linked`, `lost`), `linked_at`, `lost_at`; unique `(organisation, slack_user_id)` |
| `work 0007_slack_suggestion` | `SlackSuggestion`: `organisation`, `owner`, optional `customer`/`account` (SET_NULL), `summary`, `text` (at most 3,000 characters), `sender_name`, `sender_slack_id`, `team_id`, `channel`, `message_ts`, `permalink`, `suggested_kind`, `created_at`; unique `(owner, channel, message_ts)`; index `(owner, created_at)` |

## Google Calendar delivery 1 (2026-10-17): migrations

| Migration | Change |
|---|---|
| `calendar_sync 0001_meetings` | `Meeting`: `organisation`, `owner`, `connection` (MailboxConnection, cascade), `google_event_id` (unique per connection), `ical_uid`, `etag`, `title`, `description` (owner only), `location`, `starts_at`, `ends_at`, `all_day`, `status` (`confirmed`, `tentative`; cancelled events are deleted), `organizer_email`, `attendees` JSON, `meet_url`, `html_link`, optional `customer`/`account` (SET_NULL; matched by `services.mail.sync.match_parent`), `booked_in_revenact`; index `(owner, starts_at)`. `CalendarSyncState`: one per connection, `sync_token`, `synced_at`, `error` |

## Private mail (2026-10-17): migrations

| Migration | Change |
|---|---|
| `customers 0065_email_shared` | `Email.shared_at` (when its owner added it to Revenact), `Email.shared_by` (SET_NULL). Existing rows start unshared: mail is its owner's until shared |

## Email agent (2026-10-17): migrations

| Migration | Change |
|---|---|
| `mail 0007_mailboxconnection_agent_reads_mail` | `MailboxConnection.agent_reads_mail` (default false): the owner's consent to the email agent reading their internal mail |
| `emailagent 0001_email_agent` | `EmailIntent`: `organisation`, `message_key` (RFC Message-ID; unique per workspace: each message read once), `sender`, `kind` (none, task, meeting), `outcome` (nothing, awaiting, dismissed, task_created, task_refused, task_undone, proposed, failed), `topic` (the agent's own line), `task`, and while it waits on its sender `assignee`, `task_title`, `due_date`, `customer`/`account`, `urgent`, `decided_at`; index `(sender, outcome, created_at)`. Internal mail itself is never stored. `MeetingProposal`: `organisation`, `intent` (1:1), `approver`, `requester`, `attendees` (M2M users), `topic`, optional `customer`/`account`, `urgent`, `proposed_start`, `length_minutes`, `unknown_free` (attendees without Calendar), `status` (awaiting_sender, open, booked, dismissed), `meeting`, `decided_at`; index `(approver, status, created_at)`. Notification kind `meeting_proposed` |


## Slack bundles (2026-10-17): migrations

"Send to Revenact" becomes an agent bundle: after the Work card is made, the per-minute tick proposes a bundle of steps on the one record the message is about, read and run by the person who sent it alone.

| Migration | Change |
|---|---|
| `work 0009_slack_suggestion_bundle_state` | `SlackSuggestion.bundle_state` (`""` for a row from before, `pending`, `made`, `none`, `failed`); index `slack_suggestion_bundle` on `(bundle_state, created_at)` |
| `work 0010_slack_handover` | Slack handover (2026-10-18): `SlackSuggestion.handed_from` (FK user, SET_NULL, nullable: who handed the message to this owner), `task` (FK `customers.Task`, SET_NULL, nullable: the to-do made for them), `handed_to` (JSON `[{id, name}]`, default `[]`: on the clicker's copy, whom it went to) |
| `metrics 0019_agent_action_slack_bundle_kinds` | `AgentAction.kind` gains `survey.record`, `segment.pin` and `scenario.run` (27 kinds) |
| `agents 0010_slack_bundles` | `AgentBundle.source` gains `slack_message`; `routed_to` gains `person`; `AgentBundle.slack_suggestion` (FK `work.SlackSuggestion`, SET_NULL, nullable, `related_name="bundles"`). `IssueWait`: `organisation` (CASCADE), `action` (OneToOne `AgentAction`, CASCADE, `related_name="issue_wait"`), `survey_send` (FK `surveys.SurveySend`, SET_NULL), `connector` (FK `Connector`, CASCADE), `issue_key` (≤ 64), `owner` (CASCADE), `status` (`waiting`, `due`, `sent`, `refused`, `cancelled`, `expired`), `resolved_at`, `checked_at`, `sent_at`, `detail` (≤ 255, a plain sentence or a short code, never the survey's text), `created_at`; indexes `issue_wait_issue` `(connector, issue_key, status)` and `issue_wait_due` `(status, checked_at)` |
| `surveys 0005_one_record_send` | `SurveySend.customer` and `SurveySend.account` (CASCADE, nullable, `related_name="survey_sends"`): a survey of one record's people with no segment (`survey.record`) |
| `scenarios 0002_scenario_run_by_agent` | `ScenarioRun.triggered_by` gains `agent` (a person ran a bundle's `scenario.run` step) |
| `notifications 0016_agent_survey_wait` | `Notification.kind` gains `agent_survey_wait` (a held-back survey was sent, refused, or its issue was gone or never resolved) |


## Guided agent (2026-10-18): migrations

A message bundle can be the guided agent's: `record.diagnose -> mail.compose -> mail.send_draft`, asked one question at a time (spec `docs/superpowers/specs/2026-10-18-guided-agent-design.md`). The diagnosis's summary and findings, and the draft's text, live in the steps' existing `result` and `payload` JSON (no new table); the draft itself is an ordinary `mail.MailDraft` in the runner's mailbox. A successful diagnosis also files an ordinary `customers.Note` authored by the runner (id in the step's `result.filed_note`; undo deletes it while unchanged).

| Migration | Change |
|---|---|
| `metrics 0020_guided_agent` | `AgentAction.kind` gains `record.diagnose` ("Diagnose"), `mail.compose` ("Write an email") and `mail.send_draft` ("Send it") (30 kinds) |
| `agents 0011_guided_agent` | `AgentBundle.priority` (≤ 8, `high` or `normal`, default `normal`): `high` when the message asked urgently (the thread model's `priority`, a fast-lane rule, or a Slack message's `urgent`), or when a guided bundle's record is in poor health (category `poor`, or a fall of at least 1.0 over 30 days in its HealthSnapshots) |
| `notifications 0019_guided_agent` | `Notification.kind` gains `agent_bundle_priority` ("Priority bundle"): a new high-priority bundle, told at once to the people who may read and run it |

## Sales review report (2026-10-18): migrations

The day before a meeting titled "sales review", its organiser gets a guided, high-priority meeting bundle with one `report.sales` step (spec `docs/superpowers/specs/2026-10-18-sales-review-report-design.md`). No new table: the meeting is read from `calendar.Meeting` and named in the step's payload, and the report is a JSON snapshot on the step's `result.report` (discarded by Undo). There is no stage history: the report reads `Opportunity.stage_changed_at`.

| Migration | Change |
|---|---|
| `metrics 0021_sales_review_report` | `AgentAction.kind` gains `report.sales` ("Prepare the sales report") (31 kinds) |
| `agents 0012_sales_review_report` | `AgentBundle.source` gains `meeting` ("Meeting"): read, run and undone by its `routed_user` (the organiser) alone, like `slack_message` (`PERSONAL_SOURCES`) |
