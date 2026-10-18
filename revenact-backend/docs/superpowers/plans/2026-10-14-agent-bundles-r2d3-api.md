# Agent bundles, round 2 delivery 3 ("Wider intake"): API contract

Backend plan: `docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-frontend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-13-agent-bundles-design.md` §13 (§13.3 items D and E as revised on
the frontend branch `feat/agent-bundles-r2d3`, §13.4, the R2-D3 row of §13.5, owner decisions 11
and 12 of §13.7). The D1, D2, D3, R2-D1 and R2-D2 contracts (`2026-10-13-agent-bundles-d1-api.md`,
`-d2-api.md`, `-d3-api.md`, `2026-10-14-agent-bundles-r2d1-api.md`, `-r2d2-api.md`), as merged
(backend #114 to #119) and recorded in `docs/API_CONTRACTS.md`, still hold except where this file
changes them. Every path is under `/api/v1/`, every route is `IsAuthenticated` (401 without a
token) unless it says otherwise, every body is JSON.

Merge order: this delivery's backend PR, then its frontend PR. The old frontend keeps working
against this backend: every change adds a route, a key or a value; none removes or renames one.
An old Work page shows no "Needs a customer" list (it never asks for one) and its rail counts are
unchanged (`count` keeps its meaning; the new number is a separate key). An old Settings › Agents
page ignores `signals.fast_lane`. An old panel ignores `request_type` on a Jira step (it is not in
`editable` until the frontend asks for the list, and a step that never had one runs as today).

## What R2-D2 left that this delivery builds on (read from the merged code, main 29fe190)

- **Unmatched items are not stored.** `services/connectors/sync.py` `file_ticket` asks
  `_parent_for` (contact email, then the requester's domain, then a connector scoped to exactly
  one company) and answers `"unmatched"` with nothing written when it finds no customer or account;
  `file_tickets` counts it and `summary_line` writes "N without a matching account" into
  `Connector.last_sync_note`. Same for every provider.
- **`customers.Ticket` can't hold an item with no record.** Its constraint
  `ticket_belongs_to_exactly_one_parent` requires exactly one of `customer` / `account`, and every
  ticket reader (record pages, the Ticket Overview, health, pulse, classification, Copilot
  grounding) assumes a parent. The spec's "keep it as a Ticket with no customer" would break that
  constraint and every one of those readers. This contract keeps unmatched items in their own
  table instead (R2D3-2) and makes the Ticket only when someone matches it.
- **A new ticket is classified at once.** `sync_connector` calls `classify_new(connector, created)`,
  which sends new tickets to the sentiment model (`services.customers.classification`). A row in a
  separate table is never classified; a matched item's Ticket is classified by the nightly
  `classify_interactions` pass like any ticket that missed it (R2D3-9).
- **Slack** (`providers/slack.py` `fetch_tickets`) reads `conversations.history` from the cursor
  (`oldest=`) on: a top-level message is read once and never again, so a reaction added later is
  never seen. It already skips bot posts and thread replies, takes the poster's profile email as
  `requester_email`, and marks priority `high` on its own `URGENT_WORDS`.
- **Jira** (`providers/jira.py`) searches `updated >= <cursor>` (90 days back on the first sync),
  so an issue comes back each time it changes. Its priority maps Highest, Blocker and Critical to
  `Ticket.Priority.CRITICAL`. `RemoteTicket` carries no "last updated" time.
- **Threads.** `threads.touch_ticket(ticket, first_seen=)` makes or moves the `SignalThread`
  (`external_id = "<connector pk>:<ticket external id>"`); `first_seen` with an opening date older
  than 7 days makes it skipped as stale (D2-22). `SignalThread` stores no message text.
- **Pacing.** `intake.run_all` runs a workspace when its interval is due (`due`, compare-and-set on
  `Organisation.ai_signals_ran_at`), picks at most 25 threads quiet for 15 minutes (`QUIET`), oldest
  first, claims each (`claimed_at`) and processes it (`process`: gates, waiting-bundle rule, one
  model call through `read_thread` with `purpose=f"agent_{agent}"`). Locally `docker-compose.yml`
  runs `run_agent_signals` every 15 minutes (`agentsignals`).
- **Production runs no intake at all.** `revenact-infra/deploy/docker-compose.prod.yml` (main
  f6b5ca8 and the local branch `feat/gmail-mail-loop`) has `scheduler`, `mailsync`, `ticketsync`
  and `sender`, and **no `agentsignals` service**: D2's message intake has never run in
  production. Adding it is an infra item for this delivery (§13), not a code change.
- **Credits.** `anthropic_client.get_completion` charges `BILLING_CREDITS_PER_MODEL_CALL` per call
  (refunded on failure) and writes a `copilot.ModelCall` row with `purpose` and a free
  `scope_key` (32 characters, blank for agents today); `ModelCall` is indexed on
  `(organisation, purpose, created_at)`. `policy.spent_this_month` counts an agent's `OK` calls.
- **Queues.** `work/queue_bundles.py`: a department queue is used by that department's people and
  Leadership (`may_use`); Unassigned by `manage_org_settings`; a department queue is listed while
  an enabled ticket connector belongs to it, Unassigned while one belongs to none. Tickets are read
  by `personal.visible_tickets`: the department's people and **Leadership only** (view-all does
  not widen it; the spec's §13.3 D line "view-all" is corrected on the frontend branch).
- **Connectors.** `ConnectorDetailView` (`PATCH`, `DELETE`) and `ConnectorListCreateView` (`POST`)
  write **no audit row**: switching `is_enabled`, changing the department or the covered companies,
  creating and deleting a connector all go unrecorded (F2, F3). `connector.connect` /
  `connector.disconnect` cover only credentials.
- **No customer tier.** `Customer` and `Account` have no tier, plan or segment-of-record field
  (segments are personal, `services/segments`). Health has a category: `health_category_for(score)`
  (Good, Average, Poor).
- **Jira Service Management.** `jira.create` creates through `POST /rest/api/3/issue` and never sets
  a request type, so in a JSM project (alfiee's SUP) the issue reads "Request Type: None": it is
  not shown in the customer portal and falls out of JSM queues that filter on request type (F1).
  The platform v3 spec has no `servicedeskapi` paths; JSM's API is a separate product API with its
  own 3LO scopes (`read:servicedesk-request`, `write:servicedesk-request`).

## Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person will
notice. **Owner** marks a decision the owner should confirm before the build (spec §13.7); the plans
are written to it, and each is one small change if the answer differs.

| # | Decision | Cost if wrong |
|---|---|---|
| R2D3-1 | **Scope** (owner ruling, spec §13.1): unmatched items from **Slack and Jira only**; the fast lane reads Slack, Jira and **filed** Gmail/Outlook threads; Zendesk, Freshdesk and the webhook keep D2-2 (counted and skipped). Unfiled mail is never stored, listed or read (spec §12). Outside steps stay Ask. | None. |
| R2D3-2 | **Unmatched items get their own table, `connectors.UnmatchedItem`** (**Owner**, decision 11, approach changed). Not a `Ticket` with no customer (its constraint and every ticket reader forbid it), and **no `SignalThread`** until matched, so the intake can't even see one: no model call is possible before a match (R2D3-9). Matching makes the `Ticket` exactly as a matched sync would and touches its thread. | Medium: a second place outside text lives. Undoing it later is a table drop. |
| R2D3-3 | **What is kept is minimised.** Title (255), the text's first **2,000 characters** (`excerpt`), the requester's name and email, the item's link, number, priority, opened date, first and last seen. No attachments, no other replies, no Slack user ids, no Jira labels or fields. The 2,000 cap is above anything an agent reads (`evidence.MESSAGE_CHARS = 600`). A matched item's Ticket starts with this excerpt as its description; Jira replaces it with the full text on the issue's next change. | Low: a long Slack message or Jira description is cut at 2,000 characters on its Ticket until the source changes. |
| R2D3-4 | **No column encryption** (**Owner**). The codebase encrypts credentials only (Fernet: mailbox tokens, connector tokens, Jira links); message text (`Ticket.description`, `Email.body`, a person's whole inbox in `MailMessage`) is plain text on the encrypted disk (DATA-02 "partial"). The excerpt follows the text, not the credentials. It is never logged, never in an audit row, never sent to a model before a match. | Medium if the owner wants text encrypted: a Fernet field on `excerpt` and `title` is one change, but then the list can't search them (it doesn't today). |
| R2D3-5 | **What is stored.** An item is kept only when all hold: its connector is Slack or Jira, enabled, with credentials; the workspace reads that source (`threads.source_on`, Settings › Agents › Reading messages; off means D2-2 as today); it matched nothing; it is not resolved or closed; it was not made by an agent step (`made_here`, D3-26); its requester email is not a member of the workspace (a colleague in a support channel is not a customer); its last activity is within **7 days** (D2-22's window: Jira's first sync reads 90 days back and would otherwise fill the list). At most **500 waiting items per connector**: past that, new items are counted and skipped as today. | Low. |
| R2D3-6 | **Later syncs.** A Jira issue seen again updates its waiting row (title, excerpt, priority, `last_seen_at`). If it now matches (a contact was added meanwhile), the Ticket is made as usual and the row is deleted. If it is resolved or closed, the row is deleted. A **dismissed** row is never listed again, whatever Jira says, unless the issue matches a record by itself. Slack never re-reads a message (above), so a Slack row only changes by a person. | Low. |
| R2D3-7 | **Who sees an item** (SOC2 AUTH-02, department-wise). An item carries its connector's department at the time it was stored (as a ticket does). A department's items are listed, counted, matched and dismissed by that department's people and Leadership (`queue_bundles.may_use`, the same people as the department's queue and its tickets); an item from a connector with no department is in **Unassigned**, for `manage_org_settings` only (stricter than an everyone's ticket: it has no record yet). View-all alone sees nothing new. Every filter is a plain column filter; no join, no `DISTINCT`. | Low. |
| R2D3-8 | **Matching** (**Owner**). "Match to a customer" picks one customer or account the person may open (`scoping.can_open`) that the item's connector covers (`Connector.covers`). The server then, in one transaction, under a row lock on the item: makes the Ticket (department = the item's), deletes the item, writes `ticket.matched`, and touches the thread. Optional **"Also add <email> as a contact"** makes a `Contact` on that record (name from the item, role Other) when no contact in the workspace has that email; the next item from that sender then matches by itself. Anyone who may open a record can already add its contacts (`CustomerContactListView`), so no new right. **No "always match this channel"**: a connector's companies narrow what it covers (`Connector.covers`), so linking one would stop it filing every other customer's items. | Low. |
| R2D3-9 | **On match, the agent may run.** The new thread is touched as new (`first_seen=False`), so it is due at the next interval run after its 15 quiet minutes (or 2 in the fast lane, if a rule matches), **whatever the item's age** (the person asked for it). The thread then routes as any other (owner, department, Unassigned). The Ticket is not classified at once: the nightly `classify_interactions` pass picks it up (no AI call in the request). | Low: one model call per matched item, at the next run. |
| R2D3-10 | **Dismiss** keeps a tombstone: status `dismissed`, `title`, `excerpt`, `requester_name` and `requester_email` blanked at once, `dismissed_by` / `dismissed_at` set, so a later Jira sync can't list it again (R2D3-6). No undo (the text is gone). Same people as matching. | Low: a wrong dismiss is fixed in Jira or Slack, not here. |
| R2D3-11 | **Retention.** A waiting or dismissed row whose `last_seen_at` is more than **30 days** ago is deleted by `sync_tickets` at the end of each full pass (`unmatched.purge`), audited per workspace as a count. A deleted connector deletes its rows (CASCADE). The list shows each row's "Deleted on <date> if no one matches it." | Low: a Jira issue still changing after 30 days keeps its row; a Slack message goes 30 days after it was posted. |
| R2D3-12 | **Counts in the rail.** `GET /work/queues/` rows for department and Unassigned queues gain `needs_customer` (waiting items, or `null` when it could not be counted). `count` keeps its meaning (bundles to decide) so an old frontend is unchanged; the new frontend shows `count + needs_customer`. Mine, My team and Rest of company get `needs_customer: null`. | Trivial. |
| R2D3-13 | **The fast lane is rules only, off by default** (**Owner**, decision 12). A thread is urgent when its newest item matches one of: (a) **Jira's top priority** (Highest, Blocker or Critical: `Ticket.priority == "critical"` from a Jira connector; on by default once the lane is on); (b) **a Slack channel** the admins name (by Slack connector); (c) **a sender** (up to 50 email addresses or `@domain`s, matched on the requester or `From`); (d) **a word** (up to 20, whole word, any case, in the title or subject and the first 2,000 characters of the text); (e) **a customer in poor health** (the record's `health_category_for` is Poor; off by default). No model decides urgency. | Low to medium: credits. |
| R2D3-14 | **No "customer tier" rule** (**Owner**). Revenact has no tier field; segments are personal. The nearest workspace-wide facts are a record's health (rule e) and named senders (rule c). A tier rule needs a tier attribute first (later round). The Slack reaction rule in spec §13.3 E is dropped: Slack messages are read once, so a reaction added after the first read is never seen. | Low. |
| R2D3-15 | **Urgency is decided when the item is synced, not when it is read.** `touch_ticket` / `touch_mail` store the first matching rule's name in `SignalThread.urgent_rule` (`""` when none, or when the lane is off). A rule change applies to items synced after it. The thread's rule is recomputed on each touch, so a quieter later message clears it. | Low: an admin who adds a word doesn't speed up threads already waiting. |
| R2D3-16 | **The fast tick.** `run_agent_signals` runs every **5 minutes** (was 15) and does two things: the interval run exactly as D2 (each workspace still runs only when its interval is due; `due` and its 2-minute grace are unchanged, so a 5-minute loop changes nothing but punctuality), then, for each active workspace with the lane on and AI on, the **fast tick**: a compare-and-set on the new `Organisation.ai_fast_ran_at` (due when 4.5 minutes have passed), then at most `min(left, 10)` urgent threads with new messages, quiet for **2 minutes**, unclaimed, oldest first, each through the same `process` as the interval run. The fast tick never moves `ai_signals_ran_at`. | Low. |
| R2D3-17 | **Same rules as any thread.** A fast-lane thread passes every D2 gate (stale, source off, AI off, answered, no reader, agent off, budget) and the **waiting-bundle rule** (D2-17): an untouched waiting bundle has its steps replaced and is re-dated; an edited one is flagged `has_newer_message` with no model call; a thread with nothing new is never picked. Once the fast tick processes a thread, the interval run sees nothing new on it. | None. |
| R2D3-18 | **Caps** (**Owner**). At most **10 fast-lane model calls an hour and 50 a day** per workspace (settings `per_hour` 0 to 10, `per_day` 0 to 50; admins may lower, never raise; `per_hour <= per_day`). Counted as `ModelCall` rows with `scope_key="fast_lane"`, an agent purpose and outcome `ok` in the last 60 minutes and the last 24 hours (rolling). A capped thread waits for the interval run as before; nothing is lost. Every call is also an ordinary agent call: it is charged one call's AI credits (`BILLING_CREDITS_PER_MODEL_CALL`), counts towards that agent's monthly budget (`spent_this_month` counts by `purpose`, unchanged) and the purpose's token budget. Out of credits or budget: the thread waits (`waiting_credits`), as today. | Low: a burst of 11 urgent threads in an hour reads the eleventh at the interval. |
| R2D3-19 | **Who sets it.** Settings › Agents, `PATCH /agents/settings/` with `fast_lane`: `manage_org_settings` only (today's rule for the whole page). Everyone reads the settings (members see a summary). Audited by the existing `agents.settings_update` with the old and new values. | None. |
| R2D3-20 | **Audit** (SOC2 LOG-01). New: `ticket.matched`, `unmatched.dismissed`, `unmatched.purged` (system), `connector.update`, `connector.create`, `connector.delete`. Changed: `agent_signals.run` gains `lane` (`"interval"` or `"fast"`) and, on a fast tick, `capped`; a fast tick writes its row only when it read a thread or was capped with urgent threads waiting (no row every 5 minutes for nothing). A fast-lane call's `ModelCall` row carries `scope_key="fast_lane"`. Never message text, a title or a requester's email in any metadata. | None. |
| R2D3-21 | **F1, Jira request types** (**Owner**; built only if live checks LC-F1a and LC-F1b pass, else F1 is "documented"). A `jira.create` step gains an optional `request_type` (`{id, name}` or `null`), editable from a new pick list `jira_request_types` that lists the project's JSM request types **through the connection's API token** (`GET /rest/servicedeskapi/servicedesk`, then `.../servicedesk/{id}/requesttype`), whoever acts. On Run, the server sets the issue's type to the request type's issue type and fills the project's Request Type field (the create screen's field whose `schema.custom` is `com.atlassian.servicedesk:vp-origin`) with the request type's id, through the same `POST /issue` as today. **No new 3LO scope, so nobody re-links.** The model never picks one; `null` creates exactly as today. | Medium: listing as the connection shows request type names a linked person may not use (Jira refuses at Run, with a sentence); if Jira won't take the field through `POST /issue`, F1 falls back to the note in the panel and docs. |
| R2D3-22 | **F2/F3, connector audit.** `PATCH /connectors/<id>/` writes `connector.update` with `changes` `{field: {old, new}}` for `name`, `is_enabled`, `department`, `customer_ids`, `account_ids` (ids only), only when one changed; `POST /connectors/` writes `connector.create` (`provider`, `department`); `DELETE` writes `connector.delete` (`provider`, `tickets_kept`). Request IP and agent kept. | None. |
| R2D3-23 | **Ceilings.** New pins: `UNMATCHED_LIST_QUERIES` (the list, constant in rows and pages), `UNMATCHED_MATCH_QUERIES`, `SETTINGS_QUERIES` (agents settings GET, with the lane's two counts and its Slack choices), `FAST_TICK_QUERIES` (per workspace with nothing urgent). `THREAD_RUN_QUERIES` may grow by at most 1 (the touch's rule read happens at sync, not at run); `QUEUE_QUERIES` per routed queue by at most 1 (its `needs_customer` count). No `DISTINCT`. | Low. |
| R2D3-24 | **Twice-filter unchanged.** In: an unmatched item is never sent to a model (no thread exists); a matched one is read through its record as any thread. Out: unchanged. The fast lane changes when a thread is read, not what is read or who reads the result. | None. |

## 1. Data

### 1.1 `connectors.UnmatchedItem` (`connectors.0006_unmatched_item`)

| Field | Type | Notes |
|---|---|---|
| `organisation` | FK Organisation, CASCADE | |
| `connector` | FK Connector, CASCADE, `related_name="unmatched_items"` | a deleted connector deletes its rows |
| `provider` | char 16 | `slack` or `jira` (the connector's, copied for the list) |
| `department` | char 16, blank | the connector's at storage time (R2D3-7) |
| `external_id` | char 128 | Slack `ts`, Jira key |
| `number` | char 32 | `SL-…` / `SUP-12` |
| `title` | char 255 | blanked on dismiss |
| `excerpt` | text | at most 2,000 characters; blanked on dismiss (R2D3-3) |
| `requester_name` | char 150, blank | blanked on dismiss |
| `requester_email` | char 254, blank | lower-case; blanked on dismiss |
| `url` | char 500, blank | the item in Slack or Jira |
| `priority` | char 8 | `Ticket.Priority` value |
| `opened_on` | date | |
| `status` | char 10: `waiting`, `dismissed` | |
| `first_seen_at`, `last_seen_at` | datetime | `last_seen_at` drives the purge (R2D3-11) |
| `dismissed_by` | FK User, null, SET_NULL | |
| `dismissed_at` | datetime, null | |

Constraint `unmatched_item_once` unique on `(connector, external_id)`. Index
`unmatched_item_queue` on `(organisation, department, status, last_seen_at)`.

### 1.2 `agents.SignalThread.urgent_rule` (`agents.0006_signal_thread_urgent`)

char 16, blank: `""`, `jira_priority`, `slack_channel`, `sender`, `word`, `poor_health`
(R2D3-15). Index `signal_thread_urgent` on `(organisation, urgent_rule, last_message_at)`.

### 1.3 `accounts.Organisation` (`accounts.0017_organisation_fast_lane`)

- `ai_fast_lane` JSON, default `{}`: the stored settings (§5.1); a missing key reads as its
  default.
- `ai_fast_ran_at` datetime, null: the fast tick's compare-and-set (R2D3-16).

## 2. Storing (sync)

`services/connectors/unmatched.py` `keep(connector, remote, *, now)` is called by `file_ticket` when
`_parent_for` finds nothing, for Slack and Jira only, and answers `"unmatched"` either way (the
connector's sync note and counts are unchanged). In order:

1. a dismissed row for `(connector, external_id)` exists → nothing (R2D3-6);
2. the remote is resolved or closed → delete any waiting row, nothing kept;
3. any R2D3-5 rule fails → nothing kept;
4. a waiting row exists → update `title`, `excerpt`, `requester_*`, `priority`, `url`,
   `last_seen_at`;
5. the connector holds 500 waiting rows → nothing kept;
6. else create the row (`first_seen_at = last_seen_at = now`).

When `_parent_for` **does** match a remote whose waiting row exists, `file_ticket` makes the Ticket
as today and deletes the row. Jira's `RemoteTicket.extra` gains `updated_at` (from `fields.updated`)
for the 7-day rule; Slack's is the message time.

## 3. Routes: the "Needs a customer" list

### 3.1 `GET /work/unmatched/?queue=department:cs&cursor=`

```json
{
  "queue": "department:cs",
  "count": 3,
  "items": [
    {
      "id": 41,
      "source": "jira",
      "connector": {"id": 6, "name": "Jira SUP"},
      "number": "SUP-31",
      "title": "Export fails for the whole team",
      "text": "Since this morning nobody on our side can export …",
      "from": {"name": "Ann Lee", "email": "ann@newco.io"},
      "url": "https://alfiee.atlassian.net/browse/SUP-31",
      "priority": "critical",
      "opened_on": "2026-10-14",
      "last_seen_at": "2026-10-14T09:12:00Z",
      "deletes_on": "2026-11-13",
      "can_add_contact": true
    }
  ],
  "next": null
}
```

- `queue`: `department:<code>` or `unassigned`, required. Waiting rows only, newest `last_seen_at`
  first, then id descending; **25 a page**; `next` is an opaque keyset cursor or `null`.
- `text`: the stored excerpt (at most 2,000 characters). `from.email` may be `""`;
  `can_add_contact` is true when there is an email and no contact in the workspace has it.
- `deletes_on`: `last_seen_at` + 30 days, the workspace's date.

| When | Answer |
|---|---|
| `queue` missing, not a department or `unassigned`, or an unknown department | `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose a department or unassigned."}` |
| a queue the reader may not use | `403 {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}` (today's queue refusal through `ScopeRefusals`, word for word; the frontend's `isQueueRefusal` already reads it) |
| a cursor that doesn't parse or belongs to another queue | `400 {"cursor": ["That list has changed. Reload Work."]}` |

### 3.2 `POST /work/unmatched/<id>/match/`

Body: `{"customer_id": 4}` or `{"account_id": 9}`, and optional `"add_contact": true`.

`200`:

```json
{
  "ticket": {"id": 812, "number": "SUP-31", "record": {"type": "customer", "id": 4, "name": "Newco"}},
  "contact_added": true
}
```

| Order | When | Answer |
|---|---|---|
| 1 | no waiting or dismissed row with that id in the workspace, or the reader may not use its queue | `404 {"detail": "Not found."}` |
| 2 | not exactly one of `customer_id` / `account_id`, or not a whole number | `400 {"record": ["Choose one customer or account."]}` |
| 3 | `add_contact` present and not a boolean | `400 {"add_contact": ["Choose on or off."]}` |
| 4 | the record is not one the reader may open (another workspace's, archived from them, unknown) | `400 {"record": ["Choose a customer or account you can open."]}` |
| 5 | the connector doesn't cover it | `409 {"code": "NOT_COVERED", "detail": "Jira SUP doesn't cover Newco. Choose another, or change the connection in Settings."}` |
| 6 | `add_contact` true and the item has no email | `400 {"add_contact": ["This message has no sender email to add."]}` |
| 7 | the row was matched, dismissed or deleted meanwhile (checked again under the lock), or a Ticket for it exists | `409 {"code": "GONE", "detail": "Someone else dealt with this message. Reload the list."}` |
| 8 | done | `200` as above; `ticket.matched` audited |

`contact_added` is false when `add_contact` was false or a contact with that email already exists
(no error).

### 3.3 `POST /work/unmatched/<id>/dismiss/`

Body: `{}`. `200 {"dismissed": true}`; `404` as §3.2 row 1; `409 GONE` as row 7. Audited
`unmatched.dismissed`.

## 4. The queue rail (`GET /work/queues/`)

Each row gains `needs_customer` (R2D3-12):

```json
{"queues": [
  {"key": "mine", "label": "Mine", "count": 4, "needs_customer": null},
  {"key": "department:cs", "label": "Customer Success", "count": 2, "needs_customer": 3},
  {"key": "unassigned", "label": "Unassigned", "count": 0, "needs_customer": 1},
  {"key": "history", "label": "History", "count": null, "needs_customer": null}
], "failed": []}
```

A routed queue whose item count fails keeps its `count` and answers `needs_customer: null` (logged,
the rail never fails for it).

## 5. The fast lane

### 5.1 `GET /agents/settings/` gains `signals.fast_lane`

```json
{
  "on": false,
  "rules": {
    "jira_priority": true,
    "slack_connectors": [6],
    "senders": ["ceo@bigco.com", "@bigco.com"],
    "words": ["outage", "data loss"],
    "poor_health": false
  },
  "per_hour": 10,
  "per_day": 50,
  "used_hour": 1,
  "used_day": 3,
  "limits": {"per_hour": 10, "per_day": 50, "senders": 50, "words": 20},
  "slack_choices": [{"id": 6, "name": "Slack #support"}]
}
```

`slack_choices`: the workspace's enabled Slack connectors (id and name; members already read these
on `GET /connectors/`). `used_*`: R2D3-18's counts.

### 5.2 `PATCH /agents/settings/` with `fast_lane`

`{"fast_lane": {"on": true}}`, `{"fast_lane": {"rules": {"words": ["outage"]}}}`, `{"fast_lane":
{"per_hour": 5}}`: keys present are merged over the stored ones (a list replaces the stored list).
Errors come back with the rest of the page's at once, under `fast_lane`:

| Key | When | Sentence |
|---|---|---|
| `fast_lane` | not an object | "Send the fast lane as one object." |
| any | unknown key | "Unknown setting." |
| `on`, `rules.jira_priority`, `rules.poor_health` | not a boolean | "Choose on or off." |
| `rules.words` | not a list, or more than 20 | "Add at most 20 words." |
| `rules.words` | an entry not 2 to 40 characters after trimming | "Use 2 to 40 characters for each word." |
| `rules.senders` | not a list, or more than 50 | "Add at most 50 senders." |
| `rules.senders` | an entry not an email address or `@domain` | "Use an email address or @domain for each sender." |
| `rules.slack_connectors` | not a list of the workspace's Slack connector ids | "Choose Slack connections from the list." |
| `per_hour` | not a whole number 0 to 10 | "Choose a whole number from 0 to 10." |
| `per_day` | not a whole number 0 to 50 | "Choose a whole number from 0 to 50." |
| `per_hour` | more than `per_day` (after merging) | "The hourly limit can't be more than the daily limit." |

Words are trimmed and folded to lower case, duplicates dropped; senders lower-cased. 403 for a
reader without `manage_org_settings`, as today ("Only admins can change the agents."). The page
answers the whole settings payload, as today.

### 5.3 Rules (R2D3-13, R2D3-15)

`services/agents/fast_lane.py` `rule_for(settings, *, source, connector_id, priority, sender,
text, record)`: the first match in the order `slack_channel`, `jira_priority`, `sender`, `word`,
`poor_health`, else `""`. Evaluated only when the lane is on. Ticket: `text = title + "\n" +
description[:2000]`, `sender = requester_email`. Mail: `text = subject + "\n" + body[:2000]`,
`sender = from_address`.

### 5.4 The run

`python manage.py run_agent_signals [--organisation N] [--lane interval|fast|both]` (default both).
The command prints one line per lane:
`read 3 thread(s): … (interval)` and `fast lane: read 1 thread(s) in 1 workspace(s), 0 capped`.

## 6. F1: Jira request types (conditional, R2D3-21)

- `jira.create` `editable` gains `request_type`; `fields.request_type` is `{id, name}` or `null`;
  `preview.jira` gains `request_type` (the name or `null`).
- `GET /agents/bundles/<id>/steps/<step>/options/jira_request_types/?project=SUP`: rows `{"id":
  "12", "name": "Report a bug", "detail": "Bug"}` (detail: the request type's issue type name), at
  most 100; `note` when there are none to show:

  | When | `note` |
  |---|---|
  | the project is not a service project | "SUP isn't a Jira Service Management project." |
  | the connection's account can't read them (401/403) | "The Jira connection's account can't read SUP's request types." |
  | Jira can't be reached | `502 TOOL_UNREACHABLE` "Couldn't reach Jira. Try again." (today's) |

- Editing: `{"request_type": {"id": "12", "name": "Report a bug"}}` or `null`; field error
  "Choose from Jira's list." (today's `FROM_LIST`). Changing the project clears it.
- Run, when set: one read of the project's request types (as the connection) to find its issue
  type; the create screen's field (`/issue/createmeta/{p}/issuetypes/{type}`, the read priorities
  already make) to find the Request Type field. Step errors:

  | When | `error` |
  |---|---|
  | the request type no longer exists | "SUP no longer has the request type Report a bug. Choose another, then Retry." |
  | the create screen has no Request Type field | "SUP's create screen has no request type. Remove it, then Retry." |
  | Jira refuses the field (400 naming it) | "Jira didn't accept the request type. Remove it, then Retry." |

## 7. Audit

| Event | Actor | Target | Metadata |
|---|---|---|---|
| `ticket.matched` | user | Ticket | `item` (the item's id), `provider`, `connector`, `record` `{type, id}`, `contact_added` |
| `unmatched.dismissed` | user | UnmatchedItem | `provider`, `connector` |
| `unmatched.purged` | none (system) | none | `deleted`, `dismissed` (how many of them were tombstones); one row per workspace that lost any |
| `connector.update` | user | Connector | `changes` `{field: {old, new}}` (R2D3-22) |
| `connector.create` | user | Connector | `provider`, `department` |
| `connector.delete` | user | Connector | `provider`, `tickets_kept` |
| `agent_signals.run` | none | none | today's counts, plus `lane`, and `capped` on a fast tick |

## 8. Privacy (spec §13.4)

- An unmatched item is read only by its queue's people (R2D3-7), never by a model (R2D3-2), and
  matched only to a record the matcher may open. Every new filter carries `# SOC2:AUTH-02`; no
  `DISTINCT`.
- Minimised and purged (R2D3-3, R2D3-11); dismissed rows lose their text at once (R2D3-10).
- The fast lane's words and senders are an admin's configuration, shown to every member (a member
  may see "@bigco.com"); they hold no message text.

## 9. Query ceilings

Pinned by tests (R2D3-23) and written into `docs/API_CONTRACTS.md` and "Changes during the build":
`UNMATCHED_LIST_QUERIES`, `UNMATCHED_MATCH_QUERIES`, `SETTINGS_QUERIES`, `FAST_TICK_QUERIES`,
`THREAD_RUN_QUERIES` (at most +1), `QUEUE_QUERIES` (at most +1 per routed queue).

## 10. Settings and constants

No new env var. Constants: `unmatched.EXCERPT_CHARS = 2000`, `KEEP_DAYS = 30`,
`MAX_WAITING_PER_CONNECTOR = 500`, `PAGE = 25`; `fast_lane.QUIET = 2 minutes`,
`TICK = 5 minutes` (due after 4.5), `MAX_PER_TICK = 10`, `PER_HOUR_MAX = 10`, `PER_DAY_MAX = 50`,
`WORDS_MAX = 20`, `SENDERS_MAX = 50`, `SCOPE_KEY = "fast_lane"`.

## 11. Not in this delivery

Unmatched items from Zendesk, Freshdesk or the webhook; anything from unfiled mail; a model reading
an unmatched item; "always match this channel"; an undo for dismiss; a tier rule; a Slack reaction
rule; per-message runs; JSM customer-visible requests (`POST /servicedeskapi/request`) and any JSM
scope; Auto for any outside step.

## 12. Owner live checks (alfiee.atlassian.net, projects KAN and SUP; Alfee workspace)

- **LC-U1** An issue raised in SUP by a reporter whose email is no contact of the Alfee workspace
  shows under "Needs a customer" in the Jira connector's department queue after the next sync;
  matching it makes a ticket on the record and a bundle at the next due run.
- **LC-U2** A Slack message in a synced channel from someone outside the workspace does the same.
- **LC-F1a** With the Jira connection's API token: `GET /rest/servicedeskapi/servicedesk` lists SUP
  (`projectKey`), and `GET /rest/servicedeskapi/servicedesk/{id}/requesttype` lists its request
  types with `issueTypeId`. KAN is not listed.
- **LC-F1b** `GET /rest/api/3/issue/createmeta/SUP/issuetypes/{type}` lists a field whose
  `schema.custom` is `com.atlassian.servicedesk:vp-origin`; `POST /rest/api/3/issue` with that field
  set to a request type's **id** (string) creates an issue whose Request Type shows in Jira and
  which the reporter sees in the portal. If the id is refused, try `"<portal key>/<request type
  key>"` and record which form works in "Changes during the build".
- **LC-F1c** The same `POST /issue` with a linked person's 3LO token (classic scopes only) is
  accepted.
- **LC-F2** Switching the Jira connector off and on in Settings writes two `connector.update` rows.
- **LC-L1** With the fast lane on and Jira's top priority rule, a SUP issue at Highest is read
  within about 7 minutes (2 quiet minutes, then the next 5-minute tick); its `ModelCall` row has
  `scope_key = "fast_lane"`. Uses one call's credits.
- **Prod**: the `agentsignals` service exists and runs every 5 minutes (infra item).

## 13. Owner set-up and infra

- **revenact-infra** `deploy/docker-compose.prod.yml`: add an `agentsignals` service (same shape as
  `ticketsync`): `python manage.py run_agent_signals || echo 'agent signals failed; retrying in five
  minutes'; sleep 300`. Today production runs no intake at all (above); without this service
  neither the interval run, the fast lane nor matched items' agent runs happen in production. Then
  `make sync` (and the VM must be on).
- The purge needs no service: it runs at the end of every `sync_tickets` pass (prod `ticketsync`,
  every 10 minutes). Locally nothing runs `sync_tickets` on a loop, so rows purge when someone
  runs it (a connector's "Sync now" button syncs one connector and does not purge).
- No new env var, no new OAuth scope, no new app registration.

## Changes during the build

The build records here every change to this contract (with the measured ceilings), and relays each
to the frontend controller.

- Measured ceilings (Task 13): `UNMATCHED_LIST_QUERIES = 5`, `UNMATCHED_MATCH_QUERIES = 22`,
  `SETTINGS_QUERIES = 25`, `FAST_TICK_QUERIES = 8`, `THREAD_RUN_QUERIES = 33` (unchanged),
  `QUEUE_QUERIES = {"carl": 26, "mona": 42, "alice": 41, "lee": 41}` (unchanged: no connector
  there) and, with a CS connector, `ROUTED_QUEUE_QUERIES = {"carl": 32}` (26 plus the routed
  queue's bundle count and its `needs_customer` count, 3 each: the `needs_customer` COUNT is one
  query, the other two are the savepoint pair of the R2D3-12 atomic guard, which a test
  transaction counts and production autocommit does not). No query uses DISTINCT.
- Lowering `per_day` below the stored `per_hour` (default 10) is refused with `per_hour: ["The hourly limit can't be more than the daily limit."]`; send `per_hour` and `per_day` together when lowering the daily cap below 10 (§5.2).
- An urgent thread that is waiting for credits, or whose last read failed, is not read by the fast tick; the interval run handles it as before (§5.4).
- `agent_signals.run` on a fast tick: `capped` is also true when `per_hour`/`per_day` let some threads be read but stopped further urgent quiet threads (not when only the per-tick limit of 10 stopped them) (§5.4, §7).
- `run_agent_signals --lane both` runs each lane in its own guard: a crash in one prints `<lane> failed: <ClassName>` to stderr, the other lane still runs, and the command exits non-zero. The interval line ends with ` (interval)` (§5.4).
- F1 not built: documented. The owner's live checks LC-F1a and LC-F1b were not reported as passed, so there is no `request_type` field, no `jira_request_types` list and no new step errors (§6 does not apply). Frontend: hide or skip any F1 UI. Docs note: "Jira Service Management: an issue an agent creates has no request type; set one in Jira so it shows in the portal and in request-type queues."
- Ops, not wire: `sync_tickets` no longer stops at one connector's unexpected error; it logs the class name, counts the connector as needing attention, carries on, and purges at the end of a full pass.
- Production: the `agentsignals` service (every 5 minutes) is needed in `revenact-infra` (§13); `docker-compose.yml` here now sleeps 300 seconds. Run one `agentsignals` process per deployment: overlapping fast ticks could pass the hourly cap (the per-workspace claim stops a double read, not two ticks each counting the same hour's calls).
- Dismissed tombstones (R2D3-6, R2D3-10, R2D3-11): a sync that still reports a dismissed item moves only its `last_seen_at` (no text comes back), so the tombstone is purged 30 days after the item goes quiet, not 30 days after the dismiss. A keep never writes text to a row that was dismissed or matched meanwhile.
- Keep-failure isolation (§2): `file_ticket` keeps each unmatched item inside its own savepoint; a keep that fails is logged by class name only and the rest of the sync batch is still filed (the item still counts as unmatched).
