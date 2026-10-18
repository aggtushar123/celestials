# Agent bundles, delivery 2 ("Message intake"): API contract

Backend plan: `docs/superpowers/plans/2026-10-13-agent-bundles-d2-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-13-agent-bundles-d2-frontend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-13-agent-bundles-design.md` (approved 2026-10-13), §4, §5, §8.1,
§8.2, §8.3 and the D2 row of §11. Delivery 1's contract
(`2026-10-13-agent-bundles-d1-api.md`, as merged in backend #114 and recorded in
`docs/API_CONTRACTS.md`) still holds except where this file changes it. Every path is under
`/api/v1/`, every route is `IsAuthenticated` (401 without a token), every body is JSON.
Timestamps are ISO 8601 UTC as DRF writes them.

Merge order: this delivery's backend PR, then its frontend PR. The old frontend keeps working
against this backend: every change below adds keys or queues; none removes or renames one
(the D1 frontend reads `department:<id>` queue keys it never receives, and ignores the new keys).
Outside actions (sending mail, Slack replies, Jira) are delivery 3 and are not here.

## What D1 left that this delivery builds on (read from the merged code, not the D1 plan)

- `AgentBundle.Source.THREAD` and `RoutedTo.DEPARTMENT` exist; nothing makes them yet.
- `bundle_payload` writes `"has_newer_message": false` and `source: {kind, label}`.
- A customer-facing field never holds a placeholder (D1 final fix wave).
- A queue whose count failed has `count: null` and its key in `failed` (D1 §10.3 as built).
- Retry is by the runner only for send steps (`campaign.send`, `survey.send`).
- `campaign.create`/`campaign.send` body limit is 1,200 (this delivery raises it, D2-31).
- The nightly pass expires every proposed step of its agent that it did not propose again
  (`run._expire_unproposed`); this delivery keeps it off message bundles (D2-27).

## Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person
will notice. **Owner** marks a decision the owner should confirm before the build; the plan is
written to it, and each is one small change if the answer is different.

| # | Decision | Cost if wrong |
|---|---|---|
| D2-1 | **What a thread is.** Mail: the filed `Email` rows of one mailbox with one provider thread id (`mailbox`, `thread_id`); mail with no thread id never feeds agents. Zendesk, Freshdesk, Jira and webhook: one `Ticket` (its connector and external id). Slack: one top-level message, because the Slack connector syncs no replies today. No ticket source syncs comments, so a ticket thread's only "message" is its title and description: it is touched when the ticket is filed, when its title or description changes, and when it is reopened; a status, priority or assignee change alone touches nothing. | Low: a comment sync later just touches the same thread. |
| D2-2 | **Unmatched items stay unmatched** (**Owner**). Today the sync counts and skips a ticket whose requester matches no customer (`connectors/sync.py`), and files only mail that matches one (`mail/sync.py file_message`); neither is stored. This delivery keeps that: every thread has a record. Storing unmatched items would be a new copy of outside text, and no D2 step kind can act on a thread with no record (a task, note or draft needs one); the outside steps of D3 (Slack reply, Jira create) can. So the department and Unassigned queues are fed by threads on records with no owner, or whose owner can't read the source (D2-5). | Medium: department queues stay quiet where most traffic is unmatched. Revisit with D3. |
| D2-3 | **Customer match is the sync's own match, unchanged:** a contact with the sender's email, then the sender's domain (an account's, then an organisation's, never a public domain), then a connector linked to exactly one company (this is how a Slack channel links to a customer). The thread takes the filed row's record. No second matcher. | None. |
| D2-4 | **Mail reaches an agent only when its owner may read it** (**Owner**). Mail is personal: the mailbox owner and their managers read it (`mail.visibility`). A mail thread is processed only when the record's owner is the mailbox owner or above them; any other mail thread is skipped (`no_reader`): no department and no admin may read someone else's mail, so it has no one to go to. | Low: mail from a teammate below the owner is still read. |
| D2-5 | **Routing** (spec §5, made exact). 1: the record has an owner who may read the source → `owner`. 2: else the source has a department (a ticket from a connector with a department) → `department`. 3: else a ticket → `admins` (the Unassigned queue). A mail thread never reaches 2 or 3 (D2-4). "Admins" are people with `manage_org_settings`. Department keys are `User.Function` codes (`cs`, `engineering`, `sales`, `analytics`, `leadership`, `other`). | Low. |
| D2-6 | **Who may run a step in a department or Unassigned bundle** (**Owner**). Today's `may_decide` (owner, chain, view-all; source readers only), plus: on a record with **no owner**, anyone with that department's ticket access (its people and Leadership) may run a department bundle's steps, and an admin an Unassigned bundle's. Without this, most of a department queue's readers could read but never run it. An owner change step still needs the owner-change right. | Medium: if refused, department queues are read-only for everyone without view-all. |
| D2-7 | **Which queues are listed.** A department queue (`department:<code>`, labelled with the department's name) is listed for its people and for Leadership whenever the workspace has an enabled ticket connector in that department, even with nothing waiting (a queue never vanishes under its reader). Unassigned (`unassigned`) is listed for admins whenever an enabled ticket connector has no department. Order: Mine, My team, Rest of company, department queues in `User.Function` order, Unassigned, History. These queues hold only bundles, so they have no kind chips (`?kind=` is accepted and ignored). | Low. |
| D2-8 | **Mine, My team and Rest of company never show a department or Unassigned bundle**, even when its record's owner later becomes the reader: a routed bundle stays where it was routed. The nightly pass's workspace-level bundles stay in Rest of company for view-all readers (D1's D6, settled: they do not move to Unassigned). | Low. |
| D2-9 | **The badge** counts Mine plus the reader's own department's queue (their `function`), as the spec says. Unassigned is not counted; admins hear of it through "Bundles waiting" (D2-24). | Trivial. |
| D2-10 | **Which agent.** A ticket source goes to the **CS agent**. A mail thread goes to the **Sales agent** when its record has an open opportunity (a stage before Closed won/lost) or its owner works in Sales, else to the CS agent. No D2 thread goes to the Ops agent (every thread has a record, D2-2). | Low. |
| D2-11 | **A message never applies anything on its own.** A thread run's steps always wait for a person, whatever the grid says (a kind on Never is still dropped): customer-written text drives the model, so nothing it proposes runs unseen. | Low: Auto for message steps can come later. |
| D2-12 | **A message bundle's steps may quote their thread** (**Owner**). D1 lets only a draft reply cite an email or ticket, because other steps were read more widely. A message bundle is read only by people who may read its source (§5.1), so each of its steps may cite the thread and name its subject. The other twice-filter checks stay (no other record, no task or note some of the record's readers can't read). Once run, a task made from an email is read by everyone who opens the record: the person who runs it chose that text. | Medium: if refused, message bundles can only draft replies and make text-free changes. |
| D2-13 | **What the model reads** (spec §4.3, made exact): the thread's newest 8 messages, oldest first, each quoted up to 600 characters (the sender, the time, sent or received); the record's block as the nightly pass writes it, filtered for the bundle's recipient (the owner's chain rule for tasks and notes; only ownerless tasks and notes for a department or Unassigned bundle); members; plan templates; the agent's rejected bundles on the record for 30 days (reason, never the note). One call per thread, at most 8 steps, purpose `agent_<agent>` (the agent's budget counts it). | Low. |
| D2-14 | **The answer** is one object: `{"title": <the bundle's title, at most 120 characters, naming the record and the matter>, "reason": <one or two sentences>, "actions": [<steps, the nightly shape>]}`. An empty `actions` is "nothing to do". A title or reason that fails the twice-filter checks falls back to the first step's title and rationale. A draft reply is offered only on an owner-routed thread: for mail, only when the owner's own connected mailbox holds it. | Low. |
| D2-15 | **A thread already answered needs no call.** A mail thread whose newest message was sent by us, and a ticket resolved or closed, is skipped without a model call (`answered`, `resolved`); a later customer message makes it due again. | None. |
| D2-16 | **Nothing to do** marks the thread processed. If the thread has a waiting bundle nobody edited, that bundle is superseded (its steps expire `replaced`): the agent re-read the whole thread and no longer proposes it. | Low. |
| D2-17 | **Update versus new.** The thread's waiting bundle (inside its 14 days): untouched (`edited_at` null) → its waiting steps are deleted (never decided, so nothing is lost but the proposal) and the new steps take positions 1..n; title and reason are replaced; it is **re-dated** (`created_at` = now, its 14 days start again; `refreshed_at` = now). Edited → **no model call**: `has_newer_message` is set and the thread is marked processed; Refresh (D2-19) makes the call when a person asks. No waiting bundle → a new bundle. | Low. |
| D2-18 | **Edits are saved as they are made** (D1's D10 deferred this here). `PATCH /agents/bundles/<id>/steps/<step id>/` saves a waiting step's fields and tick; it stamps the step's `edited_at` and the bundle's `edited_at`/`edited_by`. Run still carries the fields it runs with. The panel saves on blur and on a tick, so closing it no longer asks to discard. | Low. |
| D2-19 | **Refresh suggestions** is one synchronous model call (as Run now is), by anyone who may run a waiting step. It replaces the steps nobody edited, keeps every edited step **and every step an edited step names** (`{{step N}}`), renumbers them 1..k in their old order (placeholders follow), appends the new steps after them, and clears `has_newer_message`. A new step that would replace an edited one is dropped. If the bundle changed while the call ran, nothing is written: `409 BUNDLE_CHANGED`. | Low. |
| D2-20 | **A run against replaced steps** (the steps were replaced after the panel loaded) answers `409 BUNDLE_REFRESHED` with the fresh bundle, never the generic "List every waiting step once." | None. |
| D2-21 | **The interval.** `Organisation.ai_signal_interval`: `30m`, `1h` (default), `4h`, `24h`. `run_agent_signals` runs every 15 minutes; a workspace is due when its last run started at least the interval minus 2 minutes ago (so a 30-minute workspace is not pushed to 45 by the cron's own drift), and the run claims it with a compare-and-set so two overlapping runs never both take it. Scheduling: a new `agentsignals` service in `docker-compose.yml`, a sleep loop of 900 s like `ticketsync` (this project has no task queue by design); the production compose in `revenact-infra` gets the same service in a follow-up infra PR. | Low. |
| D2-22 | **The quiet rule and the cap.** A thread is picked when `last_message_at > processed_through` (or never processed) and `last_message_at <= now - 15 min`. At most 25 threads per workspace per run, oldest last message first; the rest wait for the next run. A thread whose last message is over 7 days old when picked is skipped (`stale`). A thread first touched by a message over 7 days old (mail by its `sent_at`, a ticket by its `opened_at`) is made already skipped (`stale`), so a mailbox's or connector's first import never floods the agents. | Low. |
| D2-23 | **Off means not read.** A source switched off in Settings › Agents, AI switched off, or the chosen agent switched off: the thread is marked skipped (`source_off`, `ai_off`, `agent_off`) and its messages so far are never read later; turning it back on reads only new messages. Out of credits is different (spec §4.3): the agent's monthly budget used or the workspace out of AI credits leaves the thread **waiting** (`waiting_credits`, reason `budget` or `credits`), and Settings › Agents says how many wait. | Low. |
| D2-24 | **"Bundles waiting" recipients follow routing.** Owner-routed bundles: today's notice (their Mine). Department and Unassigned bundles: each person who may read and run one of a new such bundle's steps (department: its people and Leadership; Unassigned: admins), once a workspace day for the kind, linking `/work?queue=department:<code>&kind=bundle` or `/work?queue=unassigned&kind=bundle`. | Low. |
| D2-25 | **Failure isolation.** Each workspace runs in its own `try`; each thread in its own transaction after the model call. A model call that fails leaves the thread due for the next run; after 3 failures it is skipped (`failed`). One failing never stops the others. | None. |
| D2-26 | **Every source on by default**, every interval at 1 hour: the owner's "every connector feeds agents". Budgets cap the spend (the agents' default budget is a fifth of the plan's credits). | Medium: an existing workspace starts spending credits on deploy; it can switch sources off. |
| D2-27 | **The nightly pass leaves message bundles and edited steps alone:** it never expires a message bundle's step or a step a person edited as "no longer proposed" (only the 14-day wait does), and no pass or refresh ever replaces a step a person edited or a step of a message bundle with a different proposal (the new item is dropped instead). | None. |
| D2-28 | **"Rejected by"** (D1 follow-up). The bundle gains `rejected_by` (who rejected it), backfilled from its steps' `decided_by`; History shows "Rejected by Carl CSM". | Trivial. |
| D2-29 | **"Save as draft only" starts on** for new `survey.send` and `campaign.send` steps (**Owner**; D1 follow-up). A person turns it off to send on Run. Steps already waiting keep what they have. | Low. |
| D2-30 | **Retry stays available from History on a partly done bundle** (D1 by-eye ruling, recorded; no change). | None. |
| D2-31 | **A campaign step's body may be 5,000 characters**, the campaign page's own limit (`campaigns.models.MAX_BODY`), in the proposal, the edit and the prompt (D1 follow-up). | None. |
| D2-32 | **The schema renders for a signed-out caller.** `GET /api/schema/` and `manage.py spectacular` no longer crash on `AnonymousUser` (`customers/serializers.py`, from 36f6541): an unauthenticated serializer context reads no customers. | None. |
| D2-33 | **The source line** links the ticket in its own tool (`external_url`, a new tab) for ticket sources; for mail it links nothing beyond the record (filed mail shows on the record's page to its readers). | Trivial. |

## 1. Data

### 1.1 `SignalThread` (new, `services/agents/models.py`)

| Field | Type | Meaning |
|---|---|---|
| `organisation` | FK Organisation, cascade | workspace |
| `source_kind` | `mail`, `slack`, `zendesk`, `freshdesk`, `jira`, `webhook` | the source (`Connector.Provider` values for tickets) |
| `external_id` | char 320 | mail `"<mailbox id>:<thread id>"`; ticket `"<connector id>:<external id>"` |
| `customer`, `account` | FK, nullable, cascade | the record (always one in D2, D2-2) |
| `department` | char 16, blank | the ticket's `department` when touched; `""` for mail |
| `mailbox` | FK `mail.MailboxConnection`, nullable, cascade | mail only |
| `mailbox_owner` | FK User, nullable, cascade | mail only: whose mail it is (the read rule, §5.1) |
| `mail_thread` | char 255, blank | mail only: the provider thread id |
| `ticket` | FK `customers.Ticket`, nullable, cascade | ticket sources only |
| `last_message_at` | datetime | the newest message stored (sync time for a ticket) |
| `processed_at`, `processed_through` | datetime, nullable | when the run last finished with it, and the `last_message_at` it saw |
| `status` | `new`, `waiting_quiet`, `waiting_credits`, `processed`, `skipped` | |
| `skip_reason` | char 24, blank | `skipped`: `no_reader`, `answered`, `resolved`, `source_off`, `ai_off`, `agent_off`, `stale`, `failed`; `waiting_credits`: `budget` or `credits` |
| `agent` | `cs`/`sales`/`ops` or blank | the agent last chosen for it |
| `failures` | small int, default 0 | model calls that failed in a row (D2-25) |
| `claimed_at` | datetime, nullable | a run working on it (a claim older than 15 minutes is free again) |
| `created_at`, `updated_at` | auto | |

Unique `(organisation, source_kind, external_id)` (`signal_thread_once`); index
`(organisation, status, last_message_at)` (`signal_thread_due`). `__str__`: `Signal thread <id>`.
No message text is stored on the thread: the run reads the filed `Email` and `Ticket` rows.

### 1.2 `AgentBundle` gains

| Field | Type | Meaning |
|---|---|---|
| `thread` | FK `SignalThread`, nullable, set null, `related_name="bundles"` | `source="thread"` bundles |
| `department` | char 16, blank | `routed_to="department"`: the `User.Function` code |
| `has_newer_message` | bool, default false | an edited bundle's thread has a newer message (D2-17) |
| `refreshed_at` | datetime, nullable | the last time its steps were replaced (D2-17, D2-19) |
| `rejected_by` | FK User, nullable, set null | who rejected it (D2-28) |

### 1.3 `AgentAction` gains

`edited_at` (datetime, nullable): the last saved edit to this step (D2-18), or a run that carried
an edit to it.

### 1.4 `Organisation` gains

| Field | Type | Meaning |
|---|---|---|
| `ai_signal_interval` | `30m`/`1h`/`4h`/`24h`, default `1h` | D2-21 |
| `ai_signal_sources` | JSON, default `{}` | `{source: bool}`; a missing source reads as on (D2-26) |
| `ai_signals_ran_at` | datetime, nullable | the last intake run's start (D2-21) |

### 1.5 Migrations

`accounts.0016_organisation_agent_signals` → `agents.0004_signal_thread` (the model, the bundle's
five fields) → `agents.0005_bundle_rejected_by` (data: each `rejected` bundle's `rejected_by` from
its first rejected step's `decided_by`; reverse is a no-op) → `metrics.0016_agent_action_edited_at`.

## 2. Intake

### 2.1 Sync hooks (no agent work at sync time)

- `services/mail/sync.py file_message`, after it creates the `Email`: `threads.touch_mail(email)`.
  Both Gmail (`gmail_store.store_gmail`) and the other providers (`sync_mailbox`) file through
  it. An email with no `mailbox` or no `thread_id` touches nothing.
- `services/connectors/sync.py file_ticket`: a new ticket → `threads.touch_ticket(ticket)`; an
  existing one → touched only when its title or description changed or it went from resolved or
  closed back to open (D2-1). The inbound webhook files through the same function.
- Touching makes the thread when missing (`status="new"`, or `skipped`/`stale` for an old
  message, D2-22) or moves `last_message_at` forward (never back), refreshes the record and the
  department, and sets `status="new"` when it was `processed` or `skipped`. A mail thread's
  `last_message_at` is the email's `sent_at` (never later than now); a ticket's is the sync time. It is one `update_or_create`
  inside the sync's own transaction; it never calls a model and never reads settings.

### 2.2 `run_agent_signals` (management command)

`python manage.py run_agent_signals [--organisation <id>]`, every 15 minutes (D2-21). For each
active workspace with any thread, in its own `try` (D2-25):

1. **Due?** `ai_signals_ran_at` is null or at most `now - interval + 2 min`. Claim:
   `UPDATE ... SET ai_signals_ran_at = now WHERE pk = id AND ai_signals_ran_at IS NOT DISTINCT FROM
   <read value>`; 0 rows → another run has it, skip.
2. **Quiet:** threads with `last_message_at > now - 15 min` and new messages become
   `waiting_quiet` (one UPDATE). They wait.
3. **Pick** (D2-22): new messages, quiet for 15 minutes, not claimed (or claimed over 15 minutes
   ago), oldest `last_message_at` first, at most 25. Each is claimed with a conditional UPDATE.
4. **Per thread**, in order: stale (D2-22) → skipped; source off, AI off → skipped (D2-23);
   answered or resolved → skipped (`answered`, `resolved`; D2-15); route (D2-5; mail with no reader → skipped
   `no_reader`); choose the agent (D2-10); agent off → skipped `agent_off`; the agent's budget
   used → `waiting_credits`/`budget`; the thread's waiting bundle edited → set
   `has_newer_message`, processed (D2-17, no call); else build the context (D2-13), one model call
   (`BudgetExceeded` → `waiting_credits`/`credits`; a failed call → `failures + 1`, released), and
   place the answer (D2-14, D2-16, D2-17). Every finished thread: `processed_through =
   last_message_at` as read when it was picked, `processed_at = now`, `claimed_at = null`,
   `failures = 0`. A message that arrived during the call leaves the thread due again.
5. **Notify** (D2-24) the bundles this run made or re-dated.
6. One audit entry per workspace run: `agent_signals.run` (no actor; counts per outcome).

### 2.3 Placing an answer

Each answer item is checked exactly as the nightly pass checks it (`run._consider`: kind
allowed and not Never, evidence quoted from this record's own lines, payload valid, placeholders,
the mention checks), with D2-11 (never Auto) and D2-12 (the thread may be cited). The steps go
into the thread's bundle: `source="thread"`, `thread`, `agent`, the record, `routed_to`,
`routed_user` (the owner when `owner`), `department` (when `department`), `title`/`reason` from
D2-14. Audit `agent_bundle.made` (new) or `agent_bundle.refreshed` (`by_run: true`, steps removed
and added); never message text.

## 3. Shapes

### 3.1 Bundle (D1 §4.1) gains and changes

```json
{
  "source": {
    "kind": "thread",
    "label": "Zendesk",
    "channel": "zendesk",
    "from": "ann@pizzahut.com",
    "messages": 1,
    "last_message_at": "2026-10-13T09:58:12Z",
    "ticket": "ZD-1042",
    "link": "https://acme.zendesk.com/agent/tickets/1042"
  },
  "department": null,
  "has_newer_message": false,
  "refreshed_at": null,
  "rejected_by": null,
  "can_refresh": true
}
```

- `source`, nightly: `{"kind": "nightly", "label": "Nightly review", "channel": null, "from": "",
  "messages": 0, "last_message_at": null, "ticket": null, "link": null}`.
- `source`, thread: `label` is `Email`, `Slack`, `Zendesk`, `Freshdesk`, `Jira` or `Webhook`;
  `channel` the `source_kind`; `from` the newest received message's sender address for mail, the
  ticket's requester email (else requester name, else `""`) for a ticket; `messages` the thread's
  filed emails for mail, 1 for a ticket; `last_message_at` the thread's; `ticket` the ticket
  number or null; `link` the ticket's `external_url` or null (D2-33). A thread that is gone
  (its record was deleted) reads as `{"kind": "thread", "label": "Message", "channel": null,
  "from": "", "messages": 0, "last_message_at": null, "ticket": null, "link": null}`.
- `department`: `{"key": "cs", "label": "Customer Success"}` when `routed_to="department"`, else
  null.
- `for`: unchanged (the record's current owner, or `routed_user` in History); null for a
  department or Unassigned bundle on an ownerless record.
- `has_newer_message`: the stored flag (D2-17).
- `rejected_by`: `{"id", "name"}` or null (D2-28).
- `can_refresh`: `status == "waiting"`, `source.kind == "thread"` and `can_run`.

### 3.2 Step (D1 §4.2) gains

`"edited": true|false` (`edited_at` is set). `can_run`/`disabled_reason` follow D2-6.

### 3.3 Feed item for a bundle (D1 §4.3)

`detail.source` gains `channel` (null for nightly). `detail` also gains `routed_to` (`owner`,
`department` or `admins`) and `department` (`{"key", "label"}` or null, as §3.1), so a row in a
department or Unassigned queue can say where it waits. Rows in those queues carry `for` as §3.1.

## 4. Routes

### 4.1 `PATCH /agents/bundles/<id>/steps/<step_id>/` (new, D2-18)

Body: `{"fields": {...}}`, `{"selected": false}`, or both.

Order of refusals: 404 (`NO_SUCH_BUNDLE`, also for a step of another bundle); 403
`CANT_RUN_STEP` (`"You can't run step 2."`, `step`) when the reader may not decide the step; the
409s of D1 §9.2 when the bundle is not waiting; `409 {"code": "STEP_NOT_WAITING", "detail": "Only
a waiting step can be changed.", "bundle": <Bundle>}`; 400 `{"steps": {"<id>": {"<key>":
["<sentence>"]}}}` for a key not in `editable` (`"This can't be changed here."`), the kind's
`edit` refusals, or `selected` not a boolean (`{"steps": {"<id>": {"selected": ["Choose on or
off."]}}}`); `400 {"steps": ["Send fields or selected."]}` for a body with neither a `selected` key nor a
`fields` object with at least one key (`{}` and `{"fields": {}}` alike).

Under the bundle's row lock, then the step's: the kind's `edit` result replaces the payload (only
when it differs), `selected` is stored, the step's `edited_at = now`, the bundle's `edited_at =
now`, `edited_by = reader`. Audit `agent_bundle.step_edited` (`step`, `fields`: the keys,
`selected`). `200 {"bundle": <Bundle>}`.

### 4.2 `POST /agents/bundles/<id>/refresh/` (new, D2-19)

No body. Order of refusals: 404; `409 {"code": "NOT_A_THREAD", "detail": "Only a bundle made from
a message can be refreshed."}`; 403 `CANT_RUN` (`"You can't run this bundle."`) unless the reader
may run a waiting step; the 409s of D1 §9.2; then the run's own gates as Run now words them:
`409 AI_OFF` "AI is switched off for this workspace.", `409 AGENT_OFF` "This agent is switched
off.", `409 SOURCE_OFF` "Agents don't read Zendesk messages in this workspace." (the source's
label), `409 BUDGET_USED` "This agent's budget is used up: it resumes on 1 Nov." (with
`resets_on`); `409 NO_READER` "Nobody this bundle is for may read its message any more." (the
record's routing no longer finds a reader, D2-4, D2-5); `429 {"detail": "The workspace has no credits left."}`; `503 {"code":
"REFRESH_FAILED", "detail": "Couldn't refresh the suggestions. Try again."}`; `409 {"code":
"BUNDLE_CHANGED", "detail": "This bundle changed while it refreshed. Review it again.", "bundle":
<Bundle>}`.

The model call is made with no lock held; the result is placed under the bundle's row lock only
if the bundle's `updated_at` is what it was before the call. Then: D2-19's keep set, renumber,
new steps, `has_newer_message = false`, `refreshed_at = now`, the thread's `processed_through =
last_message_at`. Audit `agent_bundle.refreshed` (`by_run: false`, removed, kept, added). `200
{"bundle": <Bundle>}`. A refresh whose answer is "nothing to do" removes the unedited steps and
keeps the edited ones; when nothing is left the bundle is superseded and the answer is that
bundle.

### 4.3 `POST /agents/bundles/<id>/run/` (D1 §5.1) gains

`409 {"code": "BUNDLE_REFRESHED", "detail": "This bundle was updated with a newer message. Review
it again.", "bundle": <Bundle>}`: the bundle is waiting, has `refreshed_at`, and the body names a
step id that is not one of its steps (D2-20). Checked before the body's 400s.

### 4.4 `POST /agents/bundles/<id>/reject/` (D1 §5.3) gains

Stores `rejected_by = reader` (D2-28).

### 4.5 `GET /work/queues/` (D1 §10.3)

```json
{
  "queues": [
    {"key": "mine", "label": "Mine", "count": 4},
    {"key": "team", "label": "My team", "count": 7},
    {"key": "company", "label": "Rest of company", "count": 12},
    {"key": "department:cs", "label": "Customer Success", "count": 3},
    {"key": "unassigned", "label": "Unassigned", "count": 1},
    {"key": "history", "label": "History", "count": null}
  ],
  "failed": []
}
```

Listed by D2-7; a department or Unassigned queue's `count` is its readable waiting bundles (no
overdue in these queues); a failed one is `count: null` with its key in `failed`.

### 4.6 `GET /work/feed/team/?scope=department:<code>|unassigned` (D1 §10.2)

Same shape as a team scope (`scope`, `groups` decide/overdue/suggested, `hidden`, `failed`);
`overdue` and `suggested` are always empty; `decide` holds the queue's waiting bundles (inside
their 14 days, by the bundle read rule; the rest counted in `hidden`), oldest first, with the
same keyset paging (`group=decide&cursor=`). A `department:<code>` with a code that is not a
`User.Function` value: `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose team, company, a
department or unassigned."}`; a queue the reader may not use (D2-7's people rule, not the
connector rule): `403 SCOPE_NOT_ALLOWED`. `?kind=` is parsed as for team scopes and ignored.

### 4.7 `GET /work/feed/count/` (D1 §10.4)

Shape unchanged; `decide` adds the reader's own department queue's count (D2-9). A failure there
adds `bundle` to `failed`.

### 4.8 `GET /agents/settings/`, `PATCH /agents/settings/`

`GET` gains:

```json
"signals": {
  "interval": "1h",
  "intervals": [
    {"value": "30m", "label": "Every 30 minutes"},
    {"value": "1h", "label": "Every hour"},
    {"value": "4h", "label": "Every 4 hours"},
    {"value": "24h", "label": "Once a day"}
  ],
  "sources": [
    {"key": "mail", "label": "Email filed to a customer", "enabled": true, "connected": true},
    {"key": "slack", "label": "Slack", "enabled": true, "connected": false},
    {"key": "zendesk", "label": "Zendesk", "enabled": true, "connected": true},
    {"key": "freshdesk", "label": "Freshdesk", "enabled": true, "connected": false},
    {"key": "jira", "label": "Jira", "enabled": true, "connected": false},
    {"key": "webhook", "label": "Webhooks", "enabled": false, "connected": false}
  ],
  "last_run_at": "2026-10-13T09:00:02Z"
}
```

`connected`: mail when any mailbox in the workspace is connected; a ticket source when an
enabled connector of that provider has credentials. Each `agents[]` card gains
`"waiting_threads": 3` and `"waiting_reason": "budget"|"credits"|null` (the threads this agent
was chosen for that wait on credits, D2-23; the reason of the most recently stopped one).

`PATCH` accepts `"signal_interval": "4h"` and `"signal_sources": {"slack": false}` (any subset)
with the existing keys; refusals, all at once with the rest:
`{"signal_interval": ["Choose every 30 minutes, every hour, every 4 hours or once a day."]}`,
`{"signal_sources": {"<key>": ["Choose on or off."]}}`, `{"signal_sources": {"<key>": ["Unknown
source."]}}`, `{"signal_sources": ["Send the sources as one object."]}`. Admins only, as today
(`manage_org_settings`). The audit entry `agents.settings_update` lists the two new fields with
their old and new values.

### 4.9 `GET /agents/bundles/history/` and `GET /agents/bundles/<id>/`

Unchanged routes; message bundles appear under the read rule (§5.1); every bundle carries §3.1.

## 5. Privacy (twice-filter, spec §4.4)

### 5.1 Who reads a bundle (D1 §8, extended)

D1's rule (record openable, or view-all for workspace-level; no draft reply whose source the
reader can't read) **and**, for a bundle with a `thread`, the reader may read the thread's
source: mail → `chain_visible_q(reader, "mailbox_owner")` over the thread; a ticket source →
`visible_tickets`' department rule over the thread's `department` (Leadership reads every
department). As one `id IN` subquery over `SignalThread`, never a join with DISTINCT; anything
else is 404 and, in a queue, `hidden`.

### 5.2 In

The model reads only what the bundle's recipient may read (D2-13): the thread (its source is the
recipient's to read by D2-4 and D2-5), the record (the recipient may open it), tasks and notes by
the recipient's rule (the owner's chain; ownerless rows only for a queue bundle), and nothing
from any other record.

### 5.3 Out

Every step, and the bundle's title and reason, pass the nightly pass's checks before anything is
stored (`foreign_mentions`, `withheld_mentions`, `internal_mentions` for a draft reply,
placeholders refused in customer-facing fields), with D2-12's one change.

## 6. Notifications

`AGENT_PROPOSAL_WAITING` ("Bundles waiting") as D1 §10.6 for owner-routed bundles; D2-24 for
the queues. Message unchanged: "Bundles are waiting for your decision." The intake run calls
both after it commits; a failure is logged and never undoes the run.

## 7. Permissions, audit and performance

- Every new route `IsAuthenticated`; another workspace's bundle is 404. Every visibility filter
  is an `id IN` subquery with `# SOC2:AUTH-02`; every audited write `# SOC2:LOG-01`.
- New audit events: `agent_signals.run` (no actor: `threads`, `made`, `refreshed`,
  `superseded`, `flagged`, `processed`, `skipped`, `waiting`, `failed`), `agent_bundle.made`, `agent_bundle.refreshed`,
  `agent_bundle.step_edited`. `agent_bundle.rejected` gains nothing (the rejecter is the actor).
- **Query ceilings** (pinned by tests that add rows and compare; measured on the branch and
  written into `docs/API_CONTRACTS.md`): `QUEUES_CEILING` re-measured with department and
  Unassigned rows; `DEPARTMENT_QUEUE_CEILING` (`/work/feed/team/?scope=department:cs`, constant
  in rows); `COUNT_CEILING` re-measured; `BUNDLE_DETAIL_CEILING` and `HISTORY_CEILING`
  re-measured with message bundles (the source block is read once per page); `THREAD_RUN_QUERIES`
  (one thread's processing, constant in the number of other threads, records and bundles). No
  query uses `DISTINCT`.

  Measured on the branch (Task 20; `services/agents/tests/test_intake_queries.py`, plus the D1
  tests re-pinned earlier; each constant in rows, none using `DISTINCT`):

  - `QUEUES_CEILING` 42 (was 41): `QUEUE_QUERIES` carl 26, mona 42, alice 41, lee 41 (the rail's
    enabled-connector read).
  - `COUNT_CEILING` 26 (was 23): the badge counts the reader's department queue.
  - `DEPARTMENT_QUEUE_CEILING` 11 (`/work/feed/team/?scope=department:cs`, 1 or 7 bundles).
  - `THREAD_RUN_QUERIES` 32 (one thread's processing, after the workspace's one-time settings row).
  - Message bundle detail 9 (plan name `MESSAGE_DETAIL_QUERIES`; within `BUNDLE_DETAIL_CEILING` 10).
  - Message bundle History page 9 (plan name `MESSAGE_HISTORY_QUERIES`; nightly `HISTORY_CEILING`
    stays 8 for nightly bundles; a page of message bundles costs one more).

## Changes during the build

1. A bundle whose thread is gone (its record was deleted) is 404 and hidden for everyone; the §3.1 gone-thread block is never served.
2. Every signal source defaults to `enabled: true`, webhook included (§4.8's example showing webhook `false` was wrong).
3. `/work/queues/` Mine `count` excludes department and Unassigned bundles; only `/work/feed/count/` adds the reader's own department queue.
4. A department or Unassigned queue is listed when an enabled ticket connector exists (no credentials requirement); if the connector read fails the rail keeps its D1 rows.
5. A run body naming a non-integer (or boolean) step id is a `400` "List every waiting step once." (it was a 500); a bad or stale cursor on a queue route is the `400` cursor error.
6. The "Bundles waiting" once-a-day limit is shared between the Mine notice and the queue notices (the same notification kind).
7. Measured ceilings: `THREAD_RUN_QUERIES` 32; `DEPARTMENT_QUEUE_CEILING` 11; message bundle detail 9 (`BUNDLE_DETAIL_CEILING` 10); a History page with message bundles 9 (nightly `HISTORY_CEILING` 8); `QUEUE_QUERIES` carl 26, mona 42, alice 41, lee 41; `QUEUES_CEILING` 42 (was 41); `COUNT_CEILING` 26 (was 23).
8. Mail evidence for a thread is limited to emails filed on the thread's own record.
