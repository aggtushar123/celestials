# Agent bundles, delivery 3 ("Outside actions"): API contract

Backend plan: `docs/superpowers/plans/2026-10-13-agent-bundles-d3-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-13-agent-bundles-d3-frontend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-13-agent-bundles-design.md` (approved 2026-10-13), §6.6 to §6.9,
§7.3, §7.4, §8.3, §9 and the D3 row of §11. The D1 contract (`2026-10-13-agent-bundles-d1-api.md`)
and the D2 contract (`2026-10-13-agent-bundles-d2-api.md`), as merged in backend #114 and #115 and
recorded in `docs/API_CONTRACTS.md`, still hold except where this file changes them. Every path is
under `/api/v1/`, every route is `IsAuthenticated` (401 without a token) unless it says otherwise,
every body is JSON. Timestamps are ISO 8601 UTC as DRF writes them.

Merge order: this delivery's backend PR, then its frontend PR. The old frontend keeps working
against this backend: every change below adds kinds, keys or routes; none removes or renames one.
An old panel shows the four new kinds with their server label, no editor and no result links, and
a tool-blocked step as disabled with its sentence (`disabled_reason` is unchanged in meaning).

## What D1 and D2 left that this delivery builds on (read from the merged code)

- `Kind.outside` and `Kind.irreversible` exist (`services/agents/kinds.py`); `policy.level` reads
  Ask for an outside kind whatever is stored and `PATCH /agents/settings/` refuses auto or never on
  one (D1 D21). No outside kind exists yet; `irreversible_now` already counts `outside` as
  "Can't be undone".
- `Kind.cant_undo` holds what Undo answers for a step that ran irreversibly; `undo_block` answers
  `{"allowed": false, "reason": "irreversible", "until": null}` for any step stored `irreversible`.
- A run runs each selected step in its own transaction with the bundle's and the step's rows
  locked (`bundle_run.run_step`); a kind that raises `StepFailed(detail, result=...)` keeps what it
  wrote in its savepoint and its `result`, so a Retry carries on from there.
- A stuck run (15 minutes `running`) is settled on read and by the nightly sweep
  (`bundles.settle_stuck`): its steps fail with "This step didn't finish. Retry it."
- Placeholders: refused at proposal in a kind's `customer_facing` fields; filled at run in every
  top-level string field; `outputs_for` keeps whole-number ids only and links are app paths.
- Retry of a send step is the runner's only ("Only the person who ran this step can retry it.").
- Message bundles are read only by readers of their source (D2 §5.1); their steps may quote their
  thread (D2-12). Unmatched items are never stored (D2-2), so every thread has a record.
- The failed-step notice was deferred here (D1 D18).
- The connectors' OAuth callback (`ConnectorOAuthCallbackView`) trusts a signed state bound to the
  user only, not to the browser that started it (the "forwarded-link flaw", fixed for mail in Gmail
  D1 with a `__Host-` cookie, left open for connectors). It is not listed in `.soc2/config.yml`
  `public_routes`, nor is the inbound webhook.
- Today's Slack connector holds `channels:history`, `channels:read`, `groups:history`,
  `groups:read`, `users:read`, `users:read.email`, `reactions:read`: no `chat:write`. It is
  connected with a pasted bot token, or by Slack sign-in when `SLACK_OAUTH_CLIENT_ID` is set. Jira is
  connected with an Atlassian account's email and API token (no OAuth, no scopes: the token can do
  what that account can). Gmail holds `gmail.modify`, `gmail.send`, `gmail.compose`; Outlook holds
  `Mail.Read` and `Mail.Send`: both can send today (`services/mail/sync.py:send_email`).

## Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person
will notice. **Owner** marks a decision the owner should confirm before the build; the plans are
written to it, and each is one small change if the answer is different.

| # | Decision | Cost if wrong |
|---|---|---|
| D3-1 | **A reply goes from the runner's own mailbox** (spec §7.3) (**Owner**). Whoever presses Run sends from their own connected Gmail (two-way) or Outlook. When the runner is not the person whose mailbox got the email (their manager, say), the reply is a new message from the runner's address, threaded for the customer by `In-Reply-To`/`References` (Gmail; Outlook can't set them, D3-3). IMAP mailboxes can't send agent replies (no reliable Sent-folder lookup for D3-11): the step is disabled. A Retry of a reply is the runner's only, because the lookup reads their mailbox. | Medium: if the owner wants replies only from the mailbox that got the email, the gate gains one rule. |
| D3-2 | **The model never chooses who a reply goes to.** `to` is the newest customer message's sender, `cc` is empty, `subject` is "Re: <subject>"; the model writes the body only (prompt injection can't add a recipient). A person may edit to, cc, subject and body: at most 10 addresses each, one in `to` at least. | Low. |
| D3-3 | **Threading and signature.** Gmail: `In-Reply-To`/`References` from the source (`sync.answering_headers`), Gmail's `threadId` when the runner's mailbox holds the source, and the Gmail send-as signature placed under the body (HTML and text). Outlook: Graph's `sendMail` can't set `In-Reply-To`, so the customer's client threads by subject only, and Graph exposes no signature: none is added. | Low: an Outlook reply looks like a new message in some clients. |
| D3-4 | **Slack posts go to the source thread, or a channel Revenact already reads.** The model proposes `slack.reply` only on a Slack thread, into that thread. A person may move it to another Slack connector's channel (top level there) from the list of enabled Slack connectors that can act and whose department the runner may read (§5.2). No live channel list from Slack: posts never go somewhere Revenact does not read. It posts with that connector's bot token: "as Revenact" when the connector came through Slack sign-in, else as the workspace's own bot, named in the panel. | Low: a person who wants another channel connects it first. |
| D3-5 | **Jira acts as the connection's account** (spec §7.3 "where the tool supports it"): today's Jira connection is one account's API token, so there is no runner's linked account to act as. The panel names the account ("Created in Jira as Jira Bot"); the issue's description ends with "Created by Carl CSM from Revenact." Per-person Jira accounts (OAuth 3LO) are round 2. | Low. |
| D3-6 | **Jira create fields.** Project (default: the connector's configured project, else none and the person must choose), issue type (default: the project's type named "Task", else its first non-sub-task type, resolved at run), summary (≤ 255), description (plain text ≤ 10,000, sent as Atlassian Document Format paragraphs), priority (the model's high/medium/low matched by name at run; none matched leaves Jira's default), assignee (the model names a Revenact member, matched to a Jira user by email at run; a person picks from Jira's assignable list instead). Required fields beyond these (components, versions, custom fields) are not filled: Jira's refusal is shown as a sentence ("Jira says the project SUP needs a component.") and the person picks another project or type, or sets a default in Jira. | Medium: projects with required custom fields need a Jira default. |
| D3-7 | **Jira assign** acts on the source Jira ticket (a thread from a Jira connector) or on `{{step N.ticket_key}}` of an earlier `jira.create` in the same bundle. Only the assignee is editable. Assigning is idempotent by nature: before assigning, the step reads the issue's assignee and does nothing when it is already the one chosen. | None. |
| D3-8 | **Pick lists are read live from Jira through Revenact** (`GET .../options/<list>/`), never from the browser to Jira, for a reader who may run the step; 15-second timeout, no cache, the first 50 (assignees: 20 a search). Reads are logged, not audited. Slack's channel list is local (D3-4). | Low. |
| D3-9 | **Tool permissions are per connector** (spec §7.4): a stored switch, `agents_can_act`, set by people with `manage_integrations`. "Can act" also needs the tool's grant: Slack `chat:write` (Slack sign-in asks for it when the connector came through sign-in and it is configured on the deployment; a pasted token must already hold it, checked with Slack's `X-OAuth-Scopes`); Jira `CREATE_ISSUES` and `ASSIGN_ISSUES` on the project (checked live with `mypermissions`; API tokens have no consent screen). "Read only" turns the switch off; the grant stays with Slack (Revenact never uninstalls). Zendesk, Freshdesk and webhook connectors are always read only in round 1. Mailboxes have no switch: a reply runs only when its runner presses Run, from their own mailbox. | Low. |
| D3-10 | **A blocked step** (no mailbox, tool read only, tool disconnected or gone) shows unticked and disabled with its sentence and a link to Settings › Connections (`disabled_link: "/settings/connections"`). A stale panel that selects it anyway does not refuse the run: the step fails with the same sentence and can be retried once the tool is allowed. `can_reject` follows the reader's rights only, so a bundle with a blocked step can still be rejected. | Low. |
| D3-11 | **Idempotency and lookup** (spec §6.8). Each outside step's key is `b<bundle id>-s<step id>`: the mail header `X-Revenact-Step`, the Slack message's metadata (`event_type: "revenact_step"`), the Jira label `revenact-b<id>-s<id>` (**Owner**: labels are visible on the issue; Jira's issue properties can't be searched without an Atlassian app). **Every Retry of an outside step looks first** (not only after a timeout): Gmail `in:sent after:<first attempt − 10 min>` (up to 100 candidates, paged, their headers read), Outlook Sent Items since then (the key stamped as an extended property, FR-3), Slack the thread's replies (or channel history) since then, Jira `labels = "<label>"`. Found: the step is applied with what was found and nothing is called again. | Low: one extra read per retry. |
| D3-12 | **One outside call, last** (spec §9). A step does its checks and its reads first (the Jira type and priority lookups are reads), then makes its one write. After a successful write the result is recorded in the same transaction; the bookkeeping that follows (filing the sent copy) is best effort in a savepoint and never fails the step. A failure after the write (a crash, a rollback) leaves the step failed or stuck with no result: the next Retry's lookup finds the write. | None. |
| D3-13 | **No answer is not a failure we can trust.** A write that went out and got no answer (timeout, dropped connection) fails the step with "We couldn't confirm …, Retry checks … first." and is never retried on its own. | None. |
| D3-14 | **Audit.** Each outside write and each lookup made by a run or retry writes `agent_outside.call` (actor: the runner; kind, bundle, tool, op, outcome, where, the returned id, the key; never text, names or recipients). A mail send also writes the existing `mailbox.reply` (to, cc, subject: the standing "mail left through a held credential" event). Switches write `connector.agent_access`; a refused OAuth callback writes `connector.oauth_refused`. The `agent_outside.call` row is written in the step's transaction, so a write followed by a crash loses that row; the next Retry's lookup writes one naming the found id. | Low. |
| D3-15 | **The failed-step notice** (spec §8.3, D1 D18): `agent_step_failed`, one per run, retry or settled stuck run that left at least one step failed, to the runner, linking `/work?queue=history&bundle=<id>`. Sent even while the runner watched the panel. | Trivial. |
| D3-16 | **Result links are the server's** (spec §6.6 "History shows their result links"). Each step gains `links` (per reader): D1's app links (task, campaign, survey, segment, scenario, map) and the outside ones, absolute `https` URLs to the tool (the Jira issue, the Slack message). A sent reply's link opens the runner's own mailbox copy, so only the runner gets it. `outputs` keeps its keys for placeholders. | Low. |
| D3-17 | **New outputs and placeholders:** `jira.create` and `jira.assign` make `ticket_key`, `ticket_url`; `slack.reply` makes `slack_ts`, `slack_url`; `mail.send_reply` makes `email_id`. Chips read "Jira ticket from step 1", "Jira ticket link from step 1". Customer-facing fields (a reply's subject and body, a Slack message's text) never hold a placeholder: refused at proposal (D1), refused at edit ("This goes to a customer, so it can't use another step's result."), and never filled at run. So a reply can't quote the Jira key a step before it made. | Low: a person types the key after the run, or round 2 relaxes it for Slack. |
| D3-18 | **Who proposes what.** The message intake may propose all four where the thread allows: `mail.send_reply` on a mail thread whose newest message is a customer's; `slack.reply` on a Slack thread; `jira.assign` with `"issue": "source"` on a Jira thread; `jira.create` (and `jira.assign` naming it) wherever the workspace has an enabled, connected Jira connector. The nightly pass may propose `jira.create` and `jira.assign` naming it (no reply: it has no thread). A kind is offered only when its tool is connected (read only or not: a proposal for a read-only tool shows disabled with the link, spec §7.4). One reply per conversation: `draft.reply`, `mail.send_reply` and `slack.reply` share a target per source, so a second is dropped. All four are the CS and Sales agents' (record-level); each is always Ask. | Low. |
| D3-19 | **Text that leaves Revenact passes the out-check of a reply** (twice-filter §4.4). A reply's body and subject, a Slack message's text and a Jira issue's summary and description pass `internal_mentions` (no task, note or plan title, no other source of the record) on top of every existing check; a reply cites only its thread's newest customer message. The prompt says text that leaves Revenact is written from the conversation alone, with no figures, tasks, notes or plans from the record's block. | Low. |
| D3-20 | **The model never picks a Jira project, issue type, Slack channel or recipient:** defaults come from the thread and the connector; people change them in the panel. | Low. |
| D3-21 | **Timeouts.** Slack and Jira calls wait 15 seconds (`AGENT_TOOL_TIMEOUT_SECONDS`); a mail send uses the mailbox's own send timeout (`MAIL_SEND_TIMEOUT_SECONDS`). A run stays synchronous (D1): eight outside steps can take a few minutes; a worker lost mid-run is settled by D1's D15 and its Retry looks first. | Medium: a slow tool makes Run slow. |
| D3-22 | **The connectors' forwarded-link flaw is fixed here,** because "Allow agents to act" starts Slack consent through the same callback. Every connector OAuth start (connect and consent) sets a `__Host-` cookie holding a nonce whose hash is in the signed state; the callback refuses another browser before any code exchange (`?connector=error&detail=Open the link in the browser that started it.`). A consent that comes back for another Slack workspace (another `team_id`) is refused. The callback and the inbound webhook join `public_routes`. The frontend's OAuth starts send credentials. | None. |
| D3-23 | **No new right to run an outside step:** today's `may_decide` (owner, chain, view-all; source readers) decides, plus the tool's switch (admin-held) and, for mail, the runner's own mailbox. | Low. |
| D3-24 | **Can't be undone** (spec §6.6): every outside step is `irreversible`; Undo answers 409 `CHANGED_SINCE` with "This email has been sent." / "This Slack message has been posted." / "This Jira issue has been created." / "This Jira issue has been assigned." | None. |
| D3-25 | **Unmatched items stay unmatched** (**Owner**; D2-2 said "revisit with D3"). Outside steps act on threads that have a record; storing unmatched Slack or Jira items (a new copy of outside text with no record to read it through) is round 2. | Medium: Slack messages from unknown senders still wake no agent. |
| D3-26 | **No loops.** A Jira issue Revenact made (it carries a `revenact-` label) is still synced as a ticket but never touches a thread; a Slack message posted by a bot is never a ticket; a sent reply makes its mail thread "answered" (D2-15). | None. |
| D3-27 | **History's step-kind filter** gains the four kinds (registry order); nothing else changes in History's route. | None. |
| D3-28 | **Never on every other kind still switches an agent off.** Outside kinds are locked to Ask (D1 D21), so they can't be set to Never; an agent whose every other kind is Never is skipped (`no_actions` at night, `agent_off` for a thread) and proposes nothing outside either. | Low. |

## 1. Data

### 1.1 `Connector` gains (`services/connectors/models.py`; `connectors.0004_connector_agent_access`)

| Field | Type | Meaning |
|---|---|---|
| `granted_scopes` | JSON list, default `[]` | what the tool says Revenact may do: Slack's bot scopes (Slack sign-in's `scope`, or `X-OAuth-Scopes` from `auth.test` for a pasted token); Jira's project permissions found by the last check (`CREATE_ISSUES`, `ASSIGN_ISSUES`, `BROWSE_PROJECTS`) |
| `agents_can_act` | bool, default false | the switch (D3-9) |
| `agents_allowed_by` | FK User, nullable, set null | who switched it on |
| `agents_allowed_at` | datetime, nullable | when |

`config` (non-secret, already serialised) gains: Slack `team_id`, `bot_name`, `via` (`"oauth"` or
`"token"`); Jira `account_name` (the API account's display name). Existing connectors have none of
these until their next connect or switch: a missing `via` reads as `"token"`, a missing name as
the connector's name.

### 1.2 `AgentAction.Kind` gains (`metrics.0017_agent_action_outside_kinds`)

`mail.send_reply` "Send an email reply", `slack.reply` "Reply in Slack", `jira.create` "Create a
Jira issue", `jira.assign` "Assign a Jira issue" (23 kinds).

### 1.3 `Notification.Kind` gains (`notifications.0015_agent_step_failed`)

`agent_step_failed` "Agent step failed".

## 2. The four kinds (`services/agents/registry.py`)

All four: `agents=(cs, sales)`, record-level, `max_level="ask"`, `outside=True`,
`irreversible=True`. Payloads below are as stored after the model's answer is checked.

### 2.1 `mail.send_reply`

| | |
|---|---|
| Model writes | `{"body": <the reply, plain text, ≤ 4,000>}` |
| Stored | `{"email_id": 88, "mailbox_id": 4, "to": ["ann@pizzahut.com"], "cc": [], "subject": "Re: Login loop", "body": "..."}` (`mailbox_id`: the mailbox that got the email, so the panel can say whether the runner's Gmail threads it in place) |
| Offered | a mail thread whose newest message is received with a sender address (D3-18); cites only that message's line |
| Target | `draft:email:<email_id>` (shared with `draft.reply`, D3-18) |
| `current` | the source thread's head (as `draft.reply`): a newer message expires the step ("the record changed since") |
| Editable | `to`, `cc` (lists of addresses), `subject`, `body` |
| `customer_facing` | `subject`, `body` |
| Outputs | `email_id` |
| Preview (per reader) | `{"mail": {"from": "carl@acme.io" or null, "to": [...], "cc": [...], "subject": "...", "excerpt": "<first 280>", "threaded": true}}`. `from`: while waiting, the reader's own sending mailbox (null when they have none that can send); after a run, the address it went from. `threaded`: the mailbox holds the source thread (Gmail threads it in place) |
| Undo | "This email has been sent." |

Edit refusals (field, sentence): `to` empty "Add someone to send it to."; a bad address in `to` or
`cc` "Enter email addresses like ann@example.com."; more than 10 "Send to at most 10 people.";
`subject` blank "Write a subject.", over 255 "Keep the subject under 255 characters."; `body`
blank "Write the reply.", over 4,000 "Keep the reply under 4000 characters."; a placeholder in
`subject` or `body` "This goes to a customer, so it can't use another step's result."

### 2.2 `slack.reply`

| | |
|---|---|
| Model writes | `{"text": <the reply, plain text, ≤ 3,000>}` |
| Stored | `{"ticket_id": 77, "source_connector_id": 5, "connector_id": 5, "channel": "C0123ABCD", "channel_name": "support", "thread_ts": "1760340000.000100", "text": "..."}` |
| Offered | a Slack thread (its ticket came through a Slack connector) |
| Target | `draft:ticket:<ticket_id>` (shared with `draft.reply`) |
| `current` | the ticket's state, `open` or `resolved` (a ✅ reaction resolves it and expires the step) |
| Editable | `connector_id` (the channel: a Slack connector's id from the `slack_channels` list), `text` |
| `customer_facing` | `text` |
| Outputs | `slack_ts`, `slack_url` |
| Preview | `{"slack": {"channel": "#support", "in_thread": true, "as": "Revenact", "excerpt": "<first 280>"}}`; `as` is the connector's `bot_name`, else "the Slack app" |
| Undo | "This Slack message has been posted." |

`thread_ts` always holds the source thread's; it is used only while `connector_id ==
source_connector_id`, so moving the step to another connector posts a top-level message there and
moving it back posts in the source thread again. Edit refusals: `connector_id` not in the reader's
`slack_channels` list "Choose a Slack channel Revenact reads."; `text` blank "Write the message.",
over 3,000 "Keep the message under 3000 characters.", a placeholder "This goes to a customer, so
it can't use another step's result."

### 2.3 `jira.create`

| | |
|---|---|
| Model writes | `{"summary": <≤ 200>, "description": <plain text ≤ 4,000>, "priority": "high"\|"medium"\|"low", "assignee_id": <member id or null>}` |
| Stored | `{"connector_id": 6, "project": "SUP", "issue_type": {"id": "", "name": "Task"}, "summary": "...", "description": "...", "priority": {"id": "", "name": "High"}, "assignee": null, "assignee_member_id": 12}` |
| Offered | the workspace has an enabled, connected Jira connector: the thread's own when the thread came from Jira, else the oldest one (by id) |
| Target | `jira:create:<summary, casefolded, first 80>` |
| `current` | none (it makes a thing) |
| Editable | `project` (a key), `issue_type`, `priority`, `assignee` (each `{"id", "name"}` from a pick list, or `priority`/`assignee` null), `summary`, `description` |
| Outputs | `ticket_key`, `ticket_url` |
| Preview | `{"jira": {"site": "acme.atlassian.net", "project": "SUP", "issue_type": "Task", "summary": "...", "excerpt": "<first 280 of the description>", "priority": "High" or null, "assignee": {"name": "Priya Shah", "matched_later": true} or null, "as": "Jira Bot"}}`. `matched_later`: the model's member, matched by email when it runs |
| Undo | "This Jira issue has been created." |

An `id` of `""` means "resolve by name when it runs" (D3-6). Choosing an assignee from the list
clears `assignee_member_id`. An explicit `"assignee": null` also clears it (the issue is created unassigned). Changing `project` clears `issue_type`'s id (the name is resolved
again in the new project). Edit refusals: `project` not like `SUP` (`^[A-Z][A-Z0-9_]{0,19}$`)
"Choose a Jira project."; a pick value not `{"id": <≤ 128>, "name": <1..255>}` "Choose from Jira's
list."; `summary` blank "Write a summary.", over 255 "Keep the summary under 255 characters.";
`description` over 10,000 "Keep the description under 10,000 characters."

### 2.4 `jira.assign`

| | |
|---|---|
| Model writes | `{"issue": "source" or "{{step N.ticket_key}}", "assignee_id": <member id>}` |
| Stored | `{"connector_id": 6, "issue": "SUP-12", "assignee": null, "assignee_member_id": 12}` (or `"issue": "{{step 1.ticket_key}}"`, filled at run) |
| Offered | a Jira thread (`"source"`: its ticket's key) or after a `jira.create` of the same answer |
| Target | `jira:assign:<issue as written>` |
| Editable | `assignee` |
| Outputs | `ticket_key`, `ticket_url` |
| Preview | `{"jira_assign": {"site": "...", "issue": "SUP-12", "assignee": {"name", "matched_later"} or null, "as": "Jira Bot"}}`; an issue still a placeholder is in the step's `placeholders` (chip "Jira ticket from step 1") |
| Undo | "This Jira issue has been assigned." |

## 3. Running an outside step

Inside `run_step`'s transaction, with the bundle and the step locked (D1 §5.1.4), in this order:

1. The existing checks: rights (`may_decide`), placeholders filled (never in `customer_facing`
   fields), `stale_reason`.
2. The tool gate (§5.1): blocked → the step fails with the gate's sentence. A Retry of a
   `mail.send_reply` by anyone but its runner fails "Only the person who ran this step can retry it."
3. **A Retry looks first** (D3-11): the tool is asked for a write carrying the step's key since
   the step's first attempt (`result.attempted_at`, else the bundle's `run_started_at`) minus 10
   minutes. Found → step 6 with what was found. Audit `agent_outside.call` `op: "lookup"`,
   `outcome: "found"`, `"not_found"` or `"refused"` (the lookup refused: the step fails with the
   tool's sentence, FR-5).
4. The reads the write needs (Jira's issue type and priority by name, the assignee by email).
5. **The one write.** Refused → the step fails with the tool's sentence (§6) and keeps
   `{"attempted_at", "attempted_by"}` in `result`. No answer → it fails with the "couldn't
   confirm" sentence and keeps the same. Audit `agent_outside.call` `op: "send" | "post" | "create" |
   "assign"`, `outcome: "ok" | "refused" | "unconfirmed"`.
6. Success: the step is applied; `result` holds the ids and links; `outputs` (D3-17) and `links`
   follow. Bookkeeping (filing the sent copy, `mailbox.reply`) in a savepoint; its failure is
   logged and never fails the step.

A generic exception anywhere in an outside step also stores `attempted_at`/`attempted_by` (the
first attempt's time is kept on later ones), so the next Retry looks back far enough.

## 4. Shapes

### 4.1 Step (D1 §4.2) gains

```json
{
  "disabled_reason": "Allow Revenact to post in Slack.",
  "disabled_link": "/settings/connections",
  "links": [
    {"label": "Open SUP-123 in Jira", "url": "https://acme.atlassian.net/browse/SUP-123", "external": true}
  ]
}
```

- `disabled_reason`: D1's sentences first (source, rights), then the tool gate's (§5.1).
  `disabled_link`: `"/settings/connections"` for a tool gate, else null.
- `links`, per reader, in this order: D1 kinds' app links (labels "Open task", "Open campaign",
  "Open survey", "Open segment", "Open scenario", "Open map"; `external: false`); `jira.create` and
  `jira.assign` "Open SUP-123 in Jira" (`external: true`); `slack.reply` "Open the Slack message"
  (`external: true`); `mail.send_reply` "Open the sent email" (`/communications?source=mailbox:<provider>&message=<id>`,
  `external: false`) for the runner only. Empty unless the step is `applied`. An external URL is
  always `https://slack.com/...` or `https://<site>.atlassian.net/...`.
- `preview` for the four kinds: §2.
- `outputs` may now hold strings (`ticket_key`, `ticket_url`, `slack_ts`, `slack_url`).

### 4.2 Bundle (D1 §4.1)

`can_reject` is "waiting, and the reader may decide every waiting step" (rights only, D3-10);
`can_run` is unchanged ("the reader may run at least one waiting step", blocked steps excluded).

### 4.3 Connector (`GET /connectors/`, `GET /connectors/<id>/`) gains

```json
"agents": {
  "kinds": ["slack.reply"],
  "can_act": false,
  "needs": "consent",
  "allowed_by": null,
  "allowed_at": null
}
```

- `kinds`: what agents can do through it in round 1 (`["slack.reply"]`, `["jira.create",
  "jira.assign"]`, else `[]`).
- `can_act`: the switch is on, the grant is held (§1.1), and the connector is enabled, has
  credentials and is not in error.
- `needs` (only when `kinds` is not empty and `can_act` is false): `"consent"` (Slack through
  sign-in, configured on this deployment), `"token"` (Slack with a pasted token), `"permission"`
  (Jira); else null.
- `allowed_by` (`{"id", "name"}`) and `allowed_at`: while the switch is on.

## 5. Routes

### 5.1 The tool gate (used by the step payload, the run and the pick lists)

| Kind | Blocked when | Sentence |
|---|---|---|
| `mail.send_reply` | the reader (or runner) has no mailbox, or it is disconnected | "Connect your mailbox to send this." |
| | it is IMAP | "Replies can't be sent from an IMAP mailbox yet." |
| | Gmail not two-way, paused or in error; Outlook in error | "Reconnect your mailbox to send this." |
| `slack.reply` | its connector is gone or disabled | "The Slack connection this posts through is gone." |
| | no credentials, or in error | "Reconnect Slack to post this." |
| | not `can_act`, reader has `manage_integrations` | "Allow Revenact to post in Slack." |
| | not `can_act`, anyone else | "Ask an admin to allow Revenact to post in Slack." |
| | its connector's department isn't the reader's to read (a moved step) | "You can't post in #general." |
| `jira.*` | its connector is gone or disabled | "The Jira connection this uses is gone." |
| | no credentials, or in error | "Reconnect Jira to do this." |
| | not `can_act`, reader has `manage_integrations` | "Allow agents to act in Jira." |
| | not `can_act`, anyone else | "Ask an admin to allow agents to act in Jira." |

### 5.2 `GET /agents/bundles/<id>/steps/<step_id>/options/<list>/` (new, D3-8)

Query: `project` (a key), `query` (≤ 100 characters). Lists per kind: `jira.create`
`jira_projects`, `jira_issue_types` (needs `project`), `jira_priorities`, `jira_assignees`
(`project`, else the step's project; `query`); `jira.assign` `jira_assignees` (by the step's issue,
or for a placeholder issue the producing step's project); `slack.reply` `slack_channels`.

Order of refusals: 404 `NO_SUCH_BUNDLE` (also a step of another bundle); 403 `CANT_RUN_STEP` ("You
can't run step 2.", `step`) when the reader may not decide the step; `409 {"code": "STEP_NOT_WAITING",
"detail": "Only a waiting step can be changed."}` unless the step is waiting, or failed and its
bundle not running; `400 {"list": ["This step has no such list."]}`; `400 {"project": ["Choose a
project first."]}`; `400 {"query": ["Keep the search under 100 characters."]}`; `409 {"code":
"TOOL_BLOCKED", "detail": <the gate's sentence>}` when the connector is gone, disabled or
disconnected (a read-only connector still lists); `409 {"code": "TOOL_REFUSED", "detail": "Jira
refused the login. Reconnect Jira, then try again."}` on a 401 or 403; `502 {"code":
"TOOL_UNREACHABLE", "detail": "Couldn't reach Jira. Try again."}` otherwise.

`200`:

```json
{"options": [{"id": "SUP", "name": "Support", "detail": "SUP"}], "more": false}
```

| List | `id` | `name` | `detail` |
|---|---|---|---|
| `jira_projects` | key | name | key |
| `jira_issue_types` | id | name | `""` (sub-tasks left out) |
| `jira_priorities` | id | name | `""` |
| `jira_assignees` | accountId | display name | email when Jira shows it, else `""` (inactive users left out) |
| `slack_channels` | connector id (as text) | `#<channel_name>` | `"This thread"` for the source connector, else `"A new message"` |

`more`: Jira said there were more than shown. Not audited (D3-8).

### 5.3 `POST /connectors/<id>/agents/` (new, D3-9)

Body `{"can_act": true}` or `{"can_act": false}`. Needs `manage_integrations` (403 otherwise, the
house sentence); another workspace's connector is 404.

Order of refusals: `400 {"can_act": ["Choose on or off."]}`; `400 {"code": "NO_AGENT_KINDS",
"detail": "Agents can't act in Zendesk yet."}` (the provider's display name); for `true`:
`409 {"code": "NOT_CONNECTED", "detail": "Connect Slack first."}` when it has no credentials, is
disabled or is in error.

`{"can_act": false}` → `200 <Connector>`, switch off.

`{"can_act": true}`, Slack: the token's scopes are read live (`auth.test`'s `X-OAuth-Scopes`) and
stored in `granted_scopes`. Holds `chat:write` → `200 <Connector>`, switch on. Else, `needs ==
"consent"` → `200 {"authorize_url": "https://slack.com/oauth/v2/authorize?..."}` asking for the
connector's scopes plus `chat:write`, with the browser cookie (D3-22); the switch turns on when the
consent comes back with `chat:write`. Else `409 {"code": "SLACK_SCOPE_MISSING", "detail": "This
Slack token can't post. Add chat:write to the Slack app, reinstall it, then reconnect with the new
token."}`. Slack refusing the token: `409 {"code": "RECONNECT", "detail": "Slack refused the
token. Reconnect Slack, then try again."}`; no answer: `502 {"code": "TOOL_UNREACHABLE",
"detail": "Couldn't reach Slack. Try again."}`.

`{"can_act": true}`, Jira: `GET /rest/api/3/mypermissions?permissions=CREATE_ISSUES,ASSIGN_ISSUES,BROWSE_PROJECTS`
(with `projectKey` when the connector has a project); the held ones are stored in
`granted_scopes`. Both `CREATE_ISSUES` and `ASSIGN_ISSUES` → `200 <Connector>`, switch on. Else
`409 {"code": "JIRA_CANT_ACT", "detail": "This Jira account can't create and assign issues in SUP.
Give it those permissions in Jira, then try again."}` ("in your projects" without a project).
401/403: `409 {"code": "RECONNECT", "detail": "Jira refused the login. Reconnect Jira, then try
again."}`; no answer: `502 TOOL_UNREACHABLE` "Couldn't reach Jira. Try again."

Audit `connector.agent_access` (`provider`, `can_act`, `was`, `scopes`) on every change of the
switch, and on every consent that stores a token (`"token_replaced": true` when the switch was
already on; FR-6), with the request.

### 5.4 Connector OAuth (D3-22)

- `POST /connectors/<id>/connect/` with `{"oauth": true}` and the agents consent (§5.3) set
  `Set-Cookie: __Host-revenact_connector_oauth=<nonce>; Secure; HttpOnly; SameSite=Lax; Path=/;
  Max-Age=900` (over plain http in development: `revenact_connector_oauth`, `Path=/api/v1/connectors/oauth/`).
  The signed state gains `browser` (the nonce's SHA-256) and `purpose` (`"connect"` or `"agents"`).
- `GET /connectors/oauth/<provider>/callback/` (public, `AllowAny`): every answer clears the
  cookie. Order: provider error → `?connector=error&detail=<theirs>`; bad or expired state →
  "This connection link is invalid or has expired."; unknown user or connector → "Unknown
  connector."; **another browser → "Open the link in the browser that started it."**, audited
  `connector.oauth_refused`, before any code exchange; then the exchange. `purpose: "agents"`: a
  different Slack `team_id` than the stored one → "That's a different Slack workspace. Sign in to
  the one this connection reads."; no `chat:write` granted → "Slack didn't grant permission to
  post."; else the token, `granted_scopes`, `team_id` and `bot_name` are stored (the sync cursor
  is kept), the switch turns on, audit `connector.agent_access`, and the browser lands on
  `/integrations?connector=agents_on`.

### 5.5 Run, retry, undo

Unchanged routes and shapes. New step `error` sentences: §6. Undo of an outside step: `409
CHANGED_SINCE` with the kind's sentence (D3-24).

## 6. Errors (spec §9)

Plain sentences on the step, never codes. `#support` is the channel's name, `SUP` the project,
`SUP-12` the issue, `priya@acme.io` the member's email.

| Tool | When | `error` |
|---|---|---|
| any | a gate (§5.1) | the gate's sentence |
| mail | Gmail's grant lost or a permission missing (the mailbox is paused, as the send routes do) | "Your Gmail connection expired. Reconnect it, then Retry." |
| | Outlook's token refused | "Your Outlook connection expired. Reconnect it, then Retry." |
| | rate limited | "Your mailbox is busy. Retry in a minute." |
| | any other refusal | "Your mailbox didn't accept the message. Retry it." |
| | no answer | "We couldn't confirm the email went out. Retry checks your Sent mail first." |
| | a Retry by someone else | "Only the person who ran this step can retry it." |
| Slack | `not_in_channel` | "Slack refused the post: the app isn't in #support." |
| | `channel_not_found` | "Slack can't find #support any more." |
| | `is_archived` | "Slack refused the post: #support is archived." |
| | `missing_scope`, `not_allowed_token_type` | "Allow Revenact to post in Slack, then Retry." |
| | `invalid_auth`, `token_revoked`, `account_inactive`, `not_authed` | "Your Slack connection expired. Reconnect it, then Retry." |
| | `ratelimited` or HTTP 429 | "Slack is busy. Retry in a minute." |
| | `msg_too_long` | "Slack refused the post: the message is too long." |
| | any other | "Slack refused the post. Retry it." |
| | unreachable | "Couldn't reach Slack. Retry it." |
| | no answer | "We couldn't confirm the Slack post. Retry checks the channel first." |
| Jira | 401 | "Jira refused the login. Reconnect Jira, then Retry." |
| | 403 | "The Jira account can't do this in SUP. Give it permission in Jira, then Retry." (`SUP-12` for an assign) |
| | 404 | "Jira can't find the project SUP." / "Jira can't find SUP-12." |
| | 429 | "Jira is busy. Retry in a minute." |
| | 400, a required field | "Jira says the project SUP needs a component." (components "a component", duedate "a due date", fixVersions "a fix version", versions "an affected version", labels "a label", environment "an environment", reporter "a reporter", anything else "another field") |
| | 400 on the assignee | "Jira won't assign SUP-12 to Priya Shah." |
| | 400, anything else | "Jira refused this: <Jira's own first message, ≤ 200 characters>." |
| | no project chosen | "Choose a Jira project, then Retry." |
| | no usable issue type | "Jira has no issue types to use in SUP." |
| | the member isn't a Jira user | "Jira has no user with priya@acme.io. Choose the assignee from Jira's list, then Retry." |
| | an assignment with no assignee | "Choose who to assign it to, then Retry." |
| | unreachable | "Couldn't reach Jira. Retry it." |
| | no answer (create) | "We couldn't confirm Jira made the issue. Retry checks Jira first." |
| | no answer (assign) | "We couldn't confirm Jira assigned the issue. Retry checks Jira first." |

## 7. Notifications

`agent_step_failed` (D3-15): to the run's runner (`bundle.run_by`; a stuck run's runner too), once
per run, retry or settled stuck run that left at least one of its steps failed, `push_on_commit`.

- One failed: `Step 2 failed in “Pizza Hut: login loop”: Jira says the project SUP needs a component.`
- Several: `2 steps failed in “Pizza Hut: login loop”.`
- The title is cut to 120 characters, the message to 500. Link `/work?queue=history&bundle=<id>`.
  No actor. No daily limit. Not sent for an Auto bundle (no runner).

## 8. Privacy (twice-filter, spec §4.4)

- **In:** unchanged from D2 (the model reads only what the bundle's recipient may read). The
  nightly pass's context gains only the workspace's Jira connector id and its configured project
  (no Jira data).
- **Out:** D3-19 for every outside step's text, on top of D1/D2's checks. A reply cites only its
  thread's newest customer message; a Slack reply only its thread; a nightly `jira.create` cites
  only its record's own lines and names no email or ticket of the record (as every non-draft
  nightly step).
- **Who reads:** unchanged (the bundle's read rule). A sent reply's link is the runner's own.
  Pick lists answer only a reader who may run the step.
- **Out of Revenact:** a person's Run is what sends text to a customer or a tool; nothing outside
  is ever written by an Auto step, a nightly pass or the intake.

## 9. Permissions, audit and performance

- Every new route `IsAuthenticated` except the OAuth callback (public, signed state + browser
  cookie). Another workspace's bundle or connector is 404. Every visibility filter is an `id IN`
  subquery with `# SOC2:AUTH-02`; every audited write `# SOC2:LOG-01`.
- **Audit events** (new): `agent_outside.call`, `connector.agent_access`, `connector.oauth_refused`.
  Reused: `mailbox.reply` for a sent reply, `agent_action.approved` / `agent_action.failed` per
  step, the run's and retry's own.
- **Query ceilings** (pinned by tests that add rows and compare; measured on the branch and
  written into `docs/API_CONTRACTS.md` and "Changes during the build"):
  `OUTSIDE_DETAIL_QUERIES` (a waiting bundle with 1 to 8 outside steps of all four kinds: constant
  in the steps; at most `BUNDLE_DETAIL_CEILING` + 2: the page's connectors and the reader's
  mailbox, each read once), `OUTSIDE_HISTORY_QUERIES` (a History page of 50 bundles with applied
  outside steps: constant in rows, at most `HISTORY_CEILING` + 1), `OPTIONS_QUERIES` (the options
  route, constant; outside calls counted apart), `THREAD_RUN_QUERIES` re-measured (the Jira
  connector read). No query uses `DISTINCT`.
- **Settings:** `AGENT_TOOL_TIMEOUT_SECONDS` (default 15).

## 10. Not in this delivery

Zendesk and Freshdesk replies, notes, status and assignee; Jira comments; per-person Jira accounts;
a live Slack channel list; storing unmatched items (D3-25); the fast lane; Auto for any outside
step.

## Changes during the build

The build records here every change to this contract (with the measured ceilings), and relays each
to the frontend controller.

- CC-1 (2026-10-13): jira.create `"assignee": null` clears `assignee_member_id` (frontend sends it
  for Unassigned).
- CC-2 (2026-10-13), §7 and D3-15: `agent_step_failed` goes to `bundle.run_by`, the person who
  pressed Run. A Retry does not change `run_by`: when someone else retries and the retry fails, the
  original runner gets the notice (the retrier sees the failure in the panel). An Auto bundle has no
  runner and no notice. No shape changes.
- CC-3 (2026-10-13), §9: `THREAD_RUN_QUERIES` re-pinned from 32 to 33. The extra query reads the
  workspace's Jira connector once per thread run (`evidence._jira`). It stays an exact pin; no query
  uses `DISTINCT`.
- Offer rule (Task 17, 2026-10-13), D3-18: an unusable own Jira or Slack connector (gone, disabled,
  no credentials or in error) is not offered. Jira falls back to the workspace's oldest usable
  Jira connector; `"issue": "source"` on `jira.assign` is then refused (the source ticket's
  connector is not the one used). Mail is offered whenever the thread has a customer's email.
- Send split (2026-10-13), D3-12: `services/mail/sync.send_email` is split into
  `send_via_provider` (the provider call) and `file_sent` (filing the copy); `send_email` still
  calls both. An agent's send files its copy best effort in a savepoint (never fails the step).
  Mail's OAuth now also uses `core/oauth_browser.py` (Task 3). No wire change.
- `connector.agent_access` is audited only when the switch's value changes (§5.3 "on every
  change"): off to off, or on to on, writes no row (except a consent storing a token, FR-6). The refusal order of the options route is §5.2's.
- Measured ceilings (Task 18): `OUTSIDE_DETAIL_QUERIES = 8` (a bundle's detail with 4 or 8 outside
  steps, within `BUNDLE_DETAIL_CEILING` + 2 = 12), `OUTSIDE_HISTORY_QUERIES = 7` (a History page of
  bundles whose outside steps ran, within `HISTORY_CEILING` + 1 = 9), `OPTIONS_QUERIES = 8` (the
  options route), `THREAD_RUN_QUERIES = 33`. No query uses DISTINCT.

### Final review fix wave (2026-10-13)

- FR-1, §3 and D3-1: the runner a reply's Retry is kept to is `result.attempted_by`, else the
  bundle's `run_by` (a run settled as stuck leaves no attempt; a Retry never changes `run_by`).
  Anyone else's Retry fails "Only the person who ran this step can retry it." before any lookup.
- FR-2, D3-12: a person's own Outlook send posts exactly what it did before D3 (`subject`, `body`,
  `toRecipients`); `ccRecipients`, `internetMessageHeaders` and the extended property are added
  only when there is a cc or a header.
- FR-3, D3-11: Outlook stamps the step's key twice: the `x-revenact-step` header and a
  `singleValueExtendedProperties` entry `String {e23288be-0cca-47dd-827b-5634bf469d0f} Name
  x-revenact-step` (Revenact's own MAPI namespace) holding the key. The Retry's lookup reads Sent
  Items with `$filter=sentDateTime ge <since> and singleValueExtendedProperties/Any(ep: ep/id eq
  '<that id>' and ep/value eq '<key>')`, because Sent Items copies usually drop the x-header. The
  owner's live check against a real Outlook mailbox is still open.
- FR-4, D3-11: lookups read more than one page. Gmail follows `nextPageToken` (20 stubs a page) up
  to 100 candidates in all, within the `after:` window; Slack's `find_message` follows
  `response_metadata.next_cursor` for up to 5 pages of 200 and waits `AGENT_TOOL_TIMEOUT_SECONDS`.
- FR-5, §3 and D3-14: a refused lookup writes `agent_outside.call` `op: "lookup"`,
  `outcome: "refused"` (`where` as for its kind: `mailbox <id>`, the Slack channel, the Jira project
  or issue) before the step fails.
- FR-6, §5.3 and §5.4: the consent callback refuses ("Unknown connector.") a state whose user no
  longer has `manage_integrations`. A consent that stores a token is always audited
  `connector.agent_access`, also when the switch was already on (then `"token_replaced": true`);
  the token and the switch are stored in one transaction. Every `connector.agent_access` row
  carries the request (IP, user agent).
- FR-7, §4.3: disconnecting a connector (`DELETE /connectors/<id>/credentials/`) turns the switch
  off: `agents_can_act` false, `agents_allowed_by`/`agents_allowed_at` null, `granted_scopes` `[]`;
  when it was on, `connector.agent_access` is audited with `"disconnect": true`.
- FR-8, §2.2: a Slack post's text is escaped (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`), so model
  text can't ping `<!channel>` or a person, nor make a link.
- FR-9, §2.2 and D3-11: an unconfirmed Slack post keeps where it went (`result.unconfirmed_in`:
  connector, channel, thread). A failed step moved to another channel looks there first, then where
  it would post now, and posts only when neither holds it. No shape changes.

