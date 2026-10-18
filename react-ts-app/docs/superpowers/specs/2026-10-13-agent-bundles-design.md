# Agent bundles: ready-to-run work from every connector

Date: 2026-10-13. Status: draft for owner review.
Repos: revenact-backend and react-ts-app. Three deliveries in round 1, each a backend PR merged before its frontend PR. Round 2 is §13.

## 1. Why

Agents today run nightly (or on Run now / Ask the agent) and propose **single actions** (`AgentAction`), one approval each. Two problems:

1. **The screens confuse.** The same waiting action shows in My work › Approvals and in Activity. Team's My team / Company switch shows mostly the same items twice (a team is a subset of the company). Team has no kind filters, so finding suggestions means scrolling.
2. **The agents don't do the work.** A customer email, a Slack message or a ticket comes in and nothing happens until a person reads it. What the owner wants: the agent reads it, works out what needs doing (say: reply, and log a Jira ticket assigned to Priya), and prepares every piece ready to go. The person reviews, edits if needed, presses Run once, and the reply is sent and the ticket is created. The same for surveys, campaigns, scenarios and anything else an agent may make.

**Goal:** every agent proposal is a **bundle** of ready-to-run steps, made from what arrives in any connector (on a steady interval) and from the nightly review, decided in one place, with History as the only record of what happened.

## 2. Owner decisions (2026-10-13)

1. **Sources:** every connector feeds agents, not only email: Gmail/Outlook/IMAP mail, Slack, Zendesk, Freshdesk, Jira, webhooks.
2. **Pacing:** not per message. A workspace interval (30 min, **1 hour default**, 4 hours, daily), and a thread is picked up only after it has been quiet for **15 minutes**. A thread with a waiting bundle updates that bundle instead of making a new one. A fast lane for urgent items can come later without redesign.
3. **Deciding a bundle:** edit each step, untick any, then **Run selected**. Steps run in order; a failed step shows its error and Retry while the others still run.
4. **Round 1 outside actions:** send an email reply, Slack reply, Jira create and assign, plus every Revenact action. Round 2: see §13 (the owner narrowed it to Gmail, Outlook, Jira and Slack on 2026-10-13).
5. **Surveys, campaigns, scenarios, segments, plans** are bundle steps. Surveys and campaigns are **created and sent on Run**, after a preview of audience and content; a step switch "Save as draft only" creates without sending.
6. **Routing:** the owner of the customer the thread is about; no customer match → the connector's department queue; no department → admins. Privacy rules are unchanged.
7. **Layout:** Work becomes an inbox: a queue list on the left (Mine, My team, Rest of company, department queues, History), kind filters above every list.
8. **Opening a bundle:** a side panel; the list stays visible. Full screen on phones.
9. **One kind of proposal:** every proposal is a bundle (a single action is a bundle of one). The nightly review stays and also makes bundles.
10. **Approach:** extend today's agent system (approach 1). `AgentAction` rows become a bundle's steps; Approve, Undo, History, rights, budgets and privacy filters carry over.

## 3. The bundle (data)

### 3.1 `AgentBundle` (new, `services/agents/models.py`)

| Field | Meaning |
|---|---|
| `organisation` | workspace |
| `agent` | cs / sales / ops (same choices as `AgentAction.Agent`) |
| `title` | one line, e.g. "Acme: login loop after password reset" |
| `reason` | one or two sentences on why, shown under the title |
| `source` | `nightly` or `thread` |
| `thread` | FK to `SignalThread` (§4) when `source=thread`, else null |
| `customer` / `account` | the record it is about, nullable (workspace-level bundles have neither) |
| `routed_to` | `owner` / `department` / `admins` |
| `routed_user` | the owner when `routed_to=owner` |
| `department` | when `routed_to=department` |
| `status` | `waiting`, `running`, `done`, `partly_done`, `rejected`, `expired`, `superseded` |
| `edited_at`, `edited_by` | last human edit of any step; null while untouched |
| `run_by`, `run_started_at`, `run_finished_at` | the run |
| `reject_reason`, `reject_note` | on Reject (reasons as today's dismiss reasons) |
| `created_at`, `updated_at` | |

Expiry: a waiting bundle expires 14 days after `created_at` (today's `WAIT`). Expired bundles never show or count (the read-time rule from backend #113 applies to bundles).

### 3.2 Steps are `AgentAction` rows

`AgentAction` gains `bundle` (FK, non-null after the migration), `position` (order in the bundle), `selected` (default true), `outputs` (JSON, what the step produced: a ticket key and URL, a message id, a campaign id), `error` (the last failure, plain text), and `irreversible` (derived from the kind's registry entry, stored for History).

The registry entry (`services/agents/registry.py` `Kind`) gains `irreversible: bool` and `outside: bool` (acts outside Revenact). Every outside kind is irreversible and is **always Ask**: the Settings grid shows it locked to Ask; a stored Auto or Never on such a kind reads as Ask.

Migration: every existing `AgentAction` gets a bundle of one (title from the action's summary, `source=nightly`, status mapped from the action: proposed → waiting, applied → done, rejected → rejected, expired → expired, undone → done with the step undone). Session proposals keep their session link.

### 3.3 Steps that use earlier results

A step's text fields may contain `{{step N.key}}` placeholders that refer to an earlier step's `outputs` (for example `{{step 1.ticket_key}}`, `{{step 1.ticket_url}}`). The agent orders steps so producers come first. On Run, placeholders are filled from the earlier steps' outputs just before the step runs. If the producing step was unticked or failed, the dependent step fails with "Needs step 1, which didn't run." and Retry works once step 1 succeeds. The panel shows placeholders as a chip ("Jira ticket from step 1"), never raw braces.

## 4. Message intake (signals)

### 4.1 Sources

| Source | Read today by | What feeds agents |
|---|---|---|
| Gmail / Outlook / IMAP | `services/mail` | **Only mail filed to a customer or account.** A person's unfiled inbox is never read by an agent. Filed mail is already visible to the owner's chain, so a bundle built on it may go to the record's owner. |
| Slack, Zendesk, Freshdesk, Jira, webhook | ticket connectors | Every synced item, under today's department-wise access. |

### 4.2 `SignalThread` (new, `services/agents/models.py`)

One row per conversation: `organisation`, `source_kind` (mail, slack, zendesk, freshdesk, jira, webhook), `external_id` (thread id, channel+thread ts, ticket id), `customer`/`account` (matched), `department`, `last_message_at`, `processed_at`, `processed_through` (the last message the agent saw), `status` (`new`, `waiting_quiet`, `processed`, `skipped`), `skip_reason`. Unique on (organisation, source_kind, external_id).

Sync code updates `last_message_at` when a message is stored. No agent work happens at sync time.

**Customer match**, first hit wins: a contact with the sender's email → that contact's customer; the sender's domain matches exactly one customer's domain; a Slack channel linked to a customer; a ticket's requester as a contact. No match leaves the thread without a record (it routes to a department, §5).

### 4.3 The interval run

- Command `run_agent_signals` (scheduled every 15 minutes by the same cron as `run_health_maintenance`; this project has no task queue by design).
- For each workspace whose interval is due (`Organisation.ai_signal_interval`: 30m / 1h / 4h / 24h, default 1h), pick threads with `last_message_at > processed_through` and `last_message_at <= now - 15 min`. A busy thread waits for the next run.
- **Which agent:** ticket and Slack sources and customers past onboarding go to **CS**; prospects, or a thread on a record with an open opportunity, go to **Sales**; workspace-level matters go to **Ops**. One agent per thread per run.
- **One model call per thread:** the thread's recent messages (capped, newest kept) plus the record's context (health, open tasks, owner, recent notes, last rejected bundles' reasons for this record in 30 days). Output: zero or more steps, or "nothing to do".
- "Nothing to do" marks the thread processed and creates nothing.
- **Existing waiting bundle for the thread:** untouched (`edited_at` null) → its steps are replaced and the bundle is re-dated; edited → kept as is, `has_newer_message` set, and the panel shows "New message since you edited · Refresh suggestions" (Refresh replaces unedited steps and keeps edited ones).
- Budgets: each agent's monthly credits apply. Out of credits → threads wait; Settings › Agents says so.
- One thread or workspace failing never stops the others (as `run_all` today).

### 4.4 Privacy (twice-filter rule)

- **In:** the model only sees what the bundle's recipient may read (mail visibility, department access, record visibility).
- **Out:** generated text is checked against the recipient's rights before it is stored (no record names, figures or quotes the recipient can't see).
- A bundle is shown only to people who can read its source (the existing `may_read_source` rule extends from drafts to every source).
- Settings › Agents has an on/off switch per source.

## 5. Routing

1. The thread's record has an owner → `routed_to=owner`. It shows in the owner's Mine; their manager chain sees it in My team; view-all and Leadership see it in Rest of company only if it isn't already in their My team.
2. No record, or no owner → the connector's department (the department the connector is assigned to today) → `routed_to=department`. It shows in that department's queue to everyone with that department's access.
3. No department → `routed_to=admins`, shown in a queue named "Unassigned" to admins.

Who may run a step is today's `may_decide` per step (owner, chain, view-all; source readers only). A step you may not decide is shown unticked and disabled with the reason.

## 6. Running a bundle

1. The panel opens; you edit fields, untick steps, press **Run selected**.
2. `POST /api/v1/agents/bundles/{id}/run/` with the edited fields per selected step. The server takes a row lock on the bundle; if it is already running or finished, it answers 409 with who ran it ("Carl is running this.", "Carl ran this at 10:42.").
3. Each selected step is re-checked against the runner's rights, then run **in order, each in its own transaction**. Success stores `outputs` and sets the step applied; failure stores `error` and leaves the step failed (retryable). A failure does not stop later steps (except those depending on it, §3.3). Unticked steps become `skipped`.
4. The bundle ends `done` (all selected applied) or `partly_done` (any failed). It leaves the waiting queues and appears in History.
5. `POST .../steps/{id}/retry/` retries one failed step under the same lock and checks.
6. **Undo:** Revenact steps keep the 7-day Undo. Outside steps can't be undone; the panel marks them before Run ("Can't be undone") and History shows their result links.
7. **Reject bundle:** reason + optional note; every step rejected. The reason is fed back to the agent for that record (§4.3).
8. **Idempotency:** each outside step carries a key (bundle id + step id). Retry after a timeout first checks the tool for an existing result with that key (a sent message id, a Jira issue with the key in a hidden property or label) before acting again.
9. Every run, step result and outside call is written to the audit log (who, when, what, where, returned id).

## 7. Step types

### 7.1 Revenact steps (exist today, now inside bundles)

Lifecycle, owner, AI attribute; task create/reassign/redate/complete/snooze; note; draft reply (kept: saves a draft without sending); plan start; segment, scenario, canvas, plan template, initiative; campaign. Rules unchanged, plus the new ones below.

### 7.2 New Revenact steps

- **`survey.send`:** a survey on a segment (new or existing). Preview shows audience size ("42 contacts across 3 organisations"), questions and the invite text, all editable. "Save as draft only" creates without sending. Sending uses today's survey sending, limits and unsubscribe handling; the runner needs the rights to send a survey by hand.
- **`campaign.send`:** as today's `campaign.create`, plus sending on Run with the same preview and "Save as draft only". Today's `campaign.create` remains for draft-only proposals.

Both are `irreversible` once sent (a draft-only run is undoable as today).

### 7.3 Outside steps (round 1)

| Kind | What it does | Editable | Needs |
|---|---|---|---|
| `mail.send_reply` | Sends a reply in the source thread from the **runner's** connected mailbox (Gmail/Outlook writing from Gmail D3), with their signature as a normal reply | to, cc, subject, body | runner has a connected mailbox that can send; else the step is disabled: "Connect your mailbox to send this." |
| `slack.reply` | Posts in the source thread, or a chosen channel, as the workspace's Revenact app | channel, text | the Slack connection has `chat:write`; else disabled with "Allow Revenact to post in Slack" |
| `jira.create` | Creates an issue | project, issue type, summary, description, priority, assignee (pick lists read live from Jira) | Jira connection with create permission |
| `jira.assign` | Assigns an existing issue (the source ticket or one from an earlier step) | assignee | same |

Where the tool supports it, the action is done as the runner (Jira with the runner's linked account; otherwise the connection's account, named in the panel). Slack posts come from the Revenact app.

### 7.4 Tool permissions

Settings › Integrations shows each tool as **Read only** or **Can act**, with "Allow agents to act" starting the provider's consent for the extra scope. Until then, the tool's steps appear in bundles but are disabled with a link to that setting.

## 8. Work screens

### 8.1 Layout (inbox)

- **Left: queues with counts.** Mine; My team (managers); Rest of company (view-all, Leadership; only what isn't in My team); one queue per department you belong to that has bundles; Unassigned (admins); History. On phones the queue list is a select at the top.
- **Top: kind filters** on every queue: All · Bundles · Approvals · Tasks · To-dos · Questions · Suggestions. In the URL (`?queue=mine&kind=bundle`).
- **List:** the urgency groups from Work in one place (decide, overdue, today, week, later, no date, blocked, suggested). A bundle row: title, reason, step count, source icon, "for X" outside Mine.
- **Activity becomes History:** finished bundles only (done, partly done, rejected, expired, superseded), with filters by agent, step kind and status, and per-step results and Undo. Nothing waiting appears in History. `/work/activity` redirects to History; `/work/team?scope=…` redirects to the matching queue.

### 8.2 The bundle panel

Wide panel on the right (full screen below `sm`):
- Title, reason, source ("Email from jane@acme.com · 3 messages · 10:42", linking the thread), the record.
- Steps in order: tick box, kind label, "Can't be undone" where true, the editable fields (§7), a placeholder chip for `{{step N}}`, a disabled state with its reason, and after a run the result (link) or error with Retry.
- Footer: **Run N selected** (the page's one primary), Reject bundle.
- Banner when `has_newer_message`.
- Focus: opening moves focus to the panel heading; closing returns it to the row; after a run focus goes to the result summary.

### 8.3 Badge, notifications, Copilot

- The Work badge counts what is yours to decide or overdue: Mine plus your department queues.
- `agent_proposal_waiting` becomes "Bundles waiting" (same once-a-day rules, recipients from routing).
- A failed step notifies the runner, linking the bundle.
- Copilot "Next up" lists bundles first with a Review button that opens the panel.

## 9. Errors

Plain sentences on the step, never codes: "Jira says the project SUP needs a component." / "Your Gmail connection expired. Reconnect it, then Retry." / "Slack refused the post: the app isn't in #support." / "This campaign's audience is empty now." A run never half-writes a step: each step is its own transaction, outside calls happen last within it, and a failure after an outside call succeeded records the output so Retry doesn't repeat it.

## 10. Testing

- Backend: unit tests per step kind, routing, intake (match, quiet window, interval, update-vs-new), run (order, lock, partial failure, placeholders, retry idempotency), privacy (in, out, source readers, unfiled mail excluded), query ceilings for queues, counts and History.
- Fake Gmail, Slack and Jira clients in tests; nothing real is sent. Live checks once real accounts are connected.
- Frontend: unit and integration tests for queues, filters, the panel (edit, untick, run, partial failure, retry, disabled steps, placeholders, newer-message banner), History, redirects, phone layout, focus.
- Each delivery ends with a full Chrome test, as for Work in one place.

## 11. Deliveries

| Delivery | Contents |
|---|---|
| **D1: Bundles and the new Work** | `AgentBundle`, steps on `AgentAction`, migration to bundles of one, nightly run makes bundles, the run endpoint (lock, order, partial failure, retry, placeholders), `survey.send`, `campaign.send`, the inbox layout, queues, filters, History, the panel, badge, Next up, redirects |
| **D2: Message intake** | `SignalThread`, sync hooks for mail (filed only) and ticket connectors, customer match, `run_agent_signals`, interval and per-source settings, routing incl. department and Unassigned queues, update-vs-new, newer-message banner |
| **D3: Outside actions** | `mail.send_reply`, `slack.reply`, `jira.create`, `jira.assign`, permissions per tool (Read only / Can act, consent), idempotency keys, audit entries, failure notices |
| **Round 2** | See §13 (owner scope ruling 2026-10-13: Gmail, Outlook, Jira and Slack only) |

Each delivery is a backend PR then a frontend PR, merged backend first.

## 12. Out of scope

- Acting on a person's unfiled personal mail.
- Auto-run of outside steps (always Ask).
- Per-message (instant) agent runs; the fast lane is round 2 at the earliest.
- Building new connectors; round 1 uses today's connectors.

## 13. Round 2 (design addendum, 2026-10-13)

Status: draft for owner review. Round 1 (D1 to D3) is merged: backend #114, #115, #116; frontend #141, #142, #143. This section replaces the "Round 2" row of §11. §12 still holds (outside steps are always Ask).

### 13.1 The owner's scope ruling

Round 2 covers **Gmail, Outlook, Jira and Slack only**. Zendesk, Freshdesk, the inbound webhook and any other connector stay read only and get no tools in round 2 (§13.6). Where §11's old row said "Zendesk and Freshdesk replies, internal notes, status and assignee", that is moved to a later round.

### 13.2 What round 1 left, read from the merged code

- **Tools.** `mail.send_reply`, `slack.reply`, `jira.create`, `jira.assign`. Jira acts as the connection's account (one Atlassian email and API token, D3-5). Slack posts only to a channel a Slack connector already reads (D3-4). Gmail holds `gmail.modify`, `gmail.send`, `gmail.compose`; Outlook holds `Mail.Read` and `Mail.Send`; Slack's bot holds the read scopes plus `chat:write` once "Allow agents to act" succeeds.
- **Outlook replies** go through Graph's `sendMail`, which can't set `In-Reply-To`: the customer's client threads them by subject only, and Graph exposes no Outlook signature, so they go unsigned (D3-3).
- **Gmail signature.** Read from Gmail's send-as settings and placed when a draft is made (Gmail D3 decision 17) and under an agent reply (D3-3). Two gaps: the editor reduces every edited draft to its own few tags, so the signature's images and styling are lost once a draft is edited in Revenact (the owner decision still open from Gmail D3), and a send that skips a draft (a quick reply on Communications, an agent draft reply sent from its card, the record's compose) goes out unsigned.
- **Unmatched items are not stored anywhere.** The ticket sync counts and skips a Slack or Jira item whose requester matches no customer (D2-2); mail is filed only when it matches one, and an agent never reads unfiled mail (§12). So "storing unmatched items" is new storage, not a new view.
- **Pacing.** `run_agent_signals` every 15 minutes, a workspace interval (1 hour default) and a 15-minute quiet rule (D2-21, D2-22). There is no fast lane.
- **D3 leftovers** (from the D3 build's review ledgers and the by-eye run): the Jira pick lists read a 404 as "Couldn't reach Jira" while a Run says "Jira can't find the project" (N1); a Jira refusal whose body times out while being read escapes as a raw error; a `jira.assign` lookup is audited `not_found` when the issue is assigned to someone else; a disabled or failing Slack connector's `needs` says `consent` or `token`; a reply found again by a Retry is recorded `threaded: false`; one Jira step can show four "Try again" buttons when Jira is down (C1); a refused OAuth callback for a person who lost `manage_integrations` writes no audit row; `docs/API_CONTRACTS.md` has an unclosed `<!--` from about line 7,728, which hides the metrics through agents sections (about 4,400 lines) from any Markdown renderer.

### 13.3 The items

Each item: the problem, the approach, the alternatives, the recommendation.

#### A. Jira comments (`jira.comment`)

- **Problem.** An agent can open or assign a Jira issue but can't add what the customer just said to an issue that already exists, which is the commonest follow-up on a Jira thread.
- **Approach.** A new outside kind, `jira.comment`, on the thread's own Jira issue (`"source"`) or on `{{step N.ticket_key}}` of an earlier `jira.create`. The model writes the comment's body only; the panel edits the body. It posts as the connection's account (as D3-5), ends with "Posted by Carl CSM from Revenact · ref b12-s41.", and is always an **internal** comment: it carries Jira Service Management's `sd.public.comment` property `{"internal": true}`, so a JSM customer never sees it (no effect on a Jira Software project). A Retry looks first: it reads the issue's newest 100 comments and finds its own `ref`.
- **Alternatives.** (1) An invisible entity property as the idempotency key: cleaner, but whether Jira's "get comments" can return comment properties isn't confirmed; it needs a live check first. (2) A public JSM reply as a separate kind: that is a customer-facing reply and belongs with the Zendesk/Freshdesk round. (3) No idempotency, retry blind: a lost answer would double-post.
- **Recommendation.** The kind as above, the visible `ref` (the same trade as D3-11's visible Jira label), always internal. Jira's `ADD_COMMENTS` is read by the "Allow agents to act" check and stored, but not required for the switch: a connector that is already on keeps working, and a Jira that refuses a comment says so on the step ("The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry.").

#### B. Per-person Jira (OAuth 2.0 three-legged, "3LO")

- **Problem.** Every Jira write shows as the connection's account ("Jira Bot"), so Jira's own history and notifications can't tell Carl from Priya, and a person's own Jira permissions are never applied.
- **Approach.** An Atlassian OAuth 2.0 (3LO) app for the deployment. Each person may link their own Atlassian account from Settings › Connections ("Link your Jira account"); the link stores their tokens (encrypted, as connector credentials) and the site's `cloudId` from `accessible-resources`. Calls go through `https://api.atlassian.com/ex/jira/<cloudId>/rest/api/3/...` (`api.atlassian.com` is already on the connectors' host allow-list). When the runner has a link to the connector's site, Jira steps act as them; otherwise as the connection's account, and the panel says which before Run ("Created in Jira as you" / "Created in Jira as Jira Bot"). The admin's switch still gates every Jira step. Scopes: `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access` (refresh tokens rotate).
- **Alternatives.** (1) Keep the bot and write "Created by Carl CSM" in the description (today). (2) Make linking mandatory: blocks anyone who has no Jira seat. (3) Impersonate with an admin API token: not possible on Jira Cloud.
- **Recommendation.** Optional per-person link with the fallback above. Owner set-up: register the 3LO app at developer.atlassian.com and enable sharing (distribution) so other sites can consent; this is an owner live-check item.

- **Revised in R2-D2 planning (2026-10-14, read from the merged code).** The plans keep the approach above and fix what it left open: a link covers a connector when one of its `accessible-resources` rows has the connector's host; linking is refused when it covers none of the workspace's Jira sites (no token is kept for nothing); one Atlassian account may be linked by one person per workspace; tokens are refreshed **before** any step's transaction opens (Atlassian rotates refresh tokens, and a rolled-back step must never lose the new one; Atlassian's 10-minute reuse interval covers the rare inline refresh); a link Atlassian stops accepting becomes "lost" and **blocks** that person's Jira steps with "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot." rather than silently acting as the bot; a person's steps run by someone else act as the runner; only the person sees their own link (admins see link and unlink in the audit log); unlinking deletes the tokens and tells the person to remove Revenact in their Atlassian account too (Atlassian publishes no revoke endpoint for 3LO). Contract: backend `docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-api.md`, R2D2-2 to R2D2-14.

#### C. A live Slack channel list

- **Problem.** A Slack step can move only to a channel some Slack connector already reads (D3-4). Teams often want the post in a channel Revenact doesn't sync (#escalations).
- **Approach (revised in R2-D2 planning, 2026-10-14).** `slack_channels` with `live=1` reads Slack's `users.conversations`, which returns only the channels the bot is a member of (so no `is_member` filter, and a post can't fail with `not_in_channel`), public and, when the token holds `groups:read`, private, unarchived, 200 a page, at most 1,000 per Slack workspace, cached 5 minutes per connector (channel names only). `conversations.list` was dropped: it returns every public channel (members or not), so it reads far more for the same answer and sits in a lower rate tier. Channels a connector reads keep "This thread" / "A new message"; the others read "Not synced" (or "Not synced, private"). The list is searchable (100 rows a page); when Slack can't list, the synced rows still answer with a note. A step stores its choice in a new editable `channel_choice` (`"6"` or `"6:C0ESC"`); a post to an unsynced channel is always a new message. Without `live=1` the route answers as before, so the old panel is unchanged. No new scope (`chat:write.public` is not asked for); a pasted bot token without `channels:read` gets a note saying so.
- **Alternatives.** (1) Keep D3-4 (only synced channels): safest for privacy, least useful. (2) All public channels with `chat:write.public`: posts where nobody chose to add the app.
- **Recommendation.** Member channels, live. Privacy: an unsynced channel has no department, so its readers are unknown to Revenact; text still passes the out-check (D3-19). A private unsynced channel may be chosen only by people with `manage_integrations` (owner decision 13.7-10).

#### D. Storing unmatched items

- **Problem.** A Slack message or Jira issue from someone Revenact can't match to a customer wakes no agent and is not kept (D2-2). Department queues stay quiet where most traffic is unmatched.
- **Approach.** Slack and Jira only. The sync keeps an unmatched item as a `Ticket` with no customer, under its connector's department, and makes a `SignalThread` with status `unmatched`. **Where:** a "Needs a customer" list at the top of that department's queue (Unassigned for admins when the connector has no department). **Who:** exactly today's ticket readers (`visible_tickets`: the department's people, view-all, Leadership; SOC2 AUTH-02, department-wise). **Matching:** "Match to a customer" picks a record the person may open; the ticket and thread take it, and an optional "Always match <sender or channel> to <customer>" adds the contact or the channel link so the next item matches by itself. **Agents:** no model call on an unmatched thread (no record to read it through, and no cost); once matched it is due like any other thread. **Retention:** an unmatched item no one matches is deleted after 30 days.
- **Mail stays out.** Unfiled mail is the person's own (§12); filing it from their inbox makes it a thread today. Nothing in round 2 reads unfiled mail.
- **Alternatives.** (1) Keep D2-2. (2) Let agents propose on unmatched threads (Slack reply only): spends credits on spam and bot noise, and the out-check has no record to check against.
- **Recommendation.** As above.

- **Revised in R2-D3 planning (2026-10-14, read from the merged code).** A `Ticket` can't hold an item with no record: its constraint `ticket_belongs_to_exactly_one_parent` and every ticket reader (record pages, health, pulse, classification, Copilot grounding) assume one. So an unmatched item lives in its own table, `connectors.UnmatchedItem`, with **no `SignalThread`** until someone matches it (no model call is possible before then), and matching makes the Ticket exactly as a matched sync would. What is kept is minimised: title, the first 2,000 characters of the text, the sender's name and email, the link, number, priority and dates; plain text like every other message text in Revenact (only credentials are encrypted). An item is kept only when the workspace reads that source, its last activity is within 7 days, it is not resolved, not an agent's own issue, and its sender is not a member of the workspace; at most 500 waiting per connector. **Who:** the connector's department's people and Leadership (`visible_tickets` is Leadership only, not view-all: corrected); Unassigned for admins. **Matching:** a record the person may open and the connector covers; optional "Also add <email> as a contact"; "always match this channel" is dropped, because linking a company to a connector narrows what it covers. **Dismiss** blanks the text at once and keeps a tombstone so Jira can't list it again. **Retention:** 30 days after the item was last seen, purged by `sync_tickets`. Rail counts: a separate `needs_customer` number. Contract: backend `docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-api.md`, R2D3-1 to R2D3-12.

#### E. The fast lane

- **Problem.** An urgent thread waits up to the workspace interval plus the 15-minute quiet rule.
- **Approach.** Urgent is decided by rules, never by a model: a Jira issue at Jira's top priority (Highest, Blocker or Critical); a Slack message with a reaction the admins name (default `:rotating_light:`); a message containing one of the workspace's urgent words (admins' list, empty by default); a thread on a record whose health band is At risk (optional switch). Admins set it in Settings › Agents (people with the agents settings right). An urgent thread is picked after 2 quiet minutes instead of 15, by a 5-minute tick of `run_agent_signals` that takes only urgent threads between interval runs.
- **Cost limits.** At most 10 fast-lane model calls a workspace an hour and 50 a day (settings, admins may lower them), all inside the agent's monthly budget and the workspace's AI credits; past a cap the thread waits for the normal interval. Settings › Agents shows today's fast-lane count.
- **Alternatives.** (1) A model judges urgency: a model call per message, the cost the interval exists to avoid. (2) Per-message runs: out of scope (§12).
- **Recommendation.** As above, off by default.
- **Revised in R2-D3 planning (2026-10-14).** Rules: Jira's top priority (on by default once the lane is on), named Slack channels (by connector), up to 50 senders (email or `@domain`), up to 20 words, and customers in poor health (health score below 4, off by default). **No tier rule:** Revenact has no customer tier field. **No Slack reaction rule:** Slack messages are read once, so a reaction added later is never seen. Urgency is decided at sync and stored on the thread (`urgent_rule`); filed Gmail and Outlook threads can be urgent too. `run_agent_signals` runs every 5 minutes: the interval run as before (each workspace when its interval is due) and the fast tick (2 quiet minutes, at most 10 threads a tick). A fast-lane call is an ordinary agent call (credits, the agent's monthly budget, the waiting-bundle rule) marked `scope_key="fast_lane"`, which is what the caps (10 an hour, 50 in 24 hours, admins may lower) count. **Production runs no intake today:** `revenact-infra`'s production compose has no `agentsignals` service, so the owner adds it (§13.10). Contract R2D3-13 to R2D3-20.

#### F. Today's mail sending

- **Outlook threading.** Graph's `POST /me/messages/{id}/reply` (needs only `Mail.Send`, which every Outlook mailbox already holds; no reconnect) sets `In-Reply-To`, `References` and the conversation. Revenact finds the runner's own copy of the source by its Message-ID (`GET /me/messages?$filter=internetMessageId eq '<id>'`, `Mail.Read`). It is used when that copy exists and the reply goes to the source's sender unchanged (Graph adds recipients to a reply rather than replacing them, so an edited To keeps today's `sendMail`). A manager replying from their own mailbox, which holds no copy, keeps `sendMail` (subject threading). `createReply` was rejected: it needs `Mail.ReadWrite`, so every Outlook user would reconnect.
- **Outlook signature.** Graph has no API for Outlook signatures. A person with an Outlook mailbox may write a plain-text signature in Revenact (on their mailbox card, at most 1,000 characters and 10 lines); every send from that mailbox through Revenact ends with it. Empty by default, so nothing changes until someone writes one.
- **Gmail signature.** When a draft is saved, the block the server placed is put back as the mailbox's current Gmail signature, so its images and styling survive an edit in Revenact; deleting the block still removes it. The editor shows it read only, with "Your Gmail signature goes out as it is in Gmail." A draft written in Gmail is still simplified once edited here (the known limit stays). A send that skips a draft carries the Gmail signature too (unless its text already ends with a "-- " signature).

#### Live-test follow-ups F1 and F2 (R2-D3)

- **F1. A JSM issue an agent creates has no request type**, so it is not in the customer portal and falls out of request-type queues. Recommended: an optional "Request type" on `jira.create`, listed through the **connection's** API token from JSM's API and set through the same `POST /issue` (the project's Request Type field), so **no new 3LO scope and nobody re-links**. Adding `read:servicedesk-request` / `write:servicedesk-request` to the link instead would make every linked person link again. Built only if the owner's live checks pass; else documented. Contract R2D3-21.
- **F2. Switching a connector on or off wrote no audit row**; neither did changing its department or companies, adding or removing it. Now `connector.update` (what changed), `connector.create`, `connector.delete`. Contract R2D3-22.

#### G. D3 leftovers

All seven items in §13.2 are fixed in R2-D1, plus the `API_CONTRACTS.md` comment.

### 13.4 Privacy and permissions

- **Visibility (SOC2 AUTH-02).** Unchanged rules, extended: a `jira.comment` bundle is read by its source's readers (D2 §5.1); an unmatched item by today's ticket readers of its connector's department; a sent reply's link by its runner only (D3-16). Every new filter is an `id IN` subquery with `# SOC2:AUTH-02`; no `DISTINCT` (Postgres 16).
- **Department-wise access.** A department queue's "Needs a customer" list, its counts and its matching are the department's people, view-all and Leadership. Matching needs the record to be one the person may open.
- **Twice-filter.** In: the model sees only what the bundle's recipient may read; an unmatched thread is never sent to a model. Out: a Jira comment's text passes `internal_mentions` like every outside step (D3-19); the fast lane changes when a thread is read, not what is read.
- **Consent per tool.** The connector switch stays the admin's gate (D3-9). Jira's check now also reads `ADD_COMMENTS`. A person's own Jira link (R2-D2) is that person's consent to act as them; the switch still applies. Outlook threading needs no new consent. Gmail and Outlook sends stay the runner's own mailbox (D3-1).
- **Audit.** New: `agent_outside.call` `op: "comment"`; `connector.oauth_refused` with `reason: "not_allowed"`; R2-D2 adds `jira.link` / `jira.unlink`; R2-D3 adds `ticket.matched`, `unmatched.dismissed`, `unmatched.purged`, `connector.update`, `connector.create`, `connector.delete`, and `agent_signals.run` gains `lane`. A signature is the person's own text, not a security event: not audited.

### 13.5 Deliveries

Each is a backend PR then a frontend PR, merged backend first.

| Delivery | Contents | Why here |
|---|---|---|
| **R2-D1 "Finish the four tools"** | `jira.comment`; Outlook replies threaded through Graph's reply; the Outlook signature; the Gmail signature kept whole and on sends that skip a draft; every D3 leftover (§13.2) incl. the `API_CONTRACTS.md` comment and the frontend's one "Try again" per step | No new consent, no new app registration, no new intake rule: everything works with today's grants. |
| **R2-D2 "Act as the person"** | Per-person Jira (3LO) with the connection fallback; the live Slack channel list | Both change who or where a step acts; 3LO needs the owner's Atlassian app first. |
| **R2-D3 "Wider intake"** | Unmatched Slack and Jira items stored, listed and matched; the fast lane; the live-test follow-ups F1 (JSM request type, conditional) and F2 (connector audit) | Both change what the intake keeps and when it spends credits: the biggest privacy and cost decisions. |

R2-D2 and R2-D3 are planned (contract and plans, in D3's shape) after R2-D1 merges, so they build on the code as merged.

### 13.6 Not in round 2

Zendesk and Freshdesk replies, internal notes, status and assignee; any webhook or other connector's tools; IMAP sending for agents; Auto for any outside step (§12); per-message agent runs; reading unfiled mail; a Gmail draft's rich formatting kept on edit; Outlook drafts.

### 13.7 Owner decisions needed

Each with the recommendation and its cost if wrong. R2-D1's plans are written to the recommendations; each is one small change if the answer differs.

| # | Decision | Recommendation | Cost if wrong |
|---|---|---|---|
| 1 | How a Jira comment is found again on Retry | A visible "ref b12-s41" at the end of the comment (like D3-11's label) | Low: switch to an invisible property after a live check |
| 2 | Comments' visibility in Jira Service Management | Always internal (`sd.public.comment` internal) | Medium if a team wants customer-visible JSM replies: that is a separate kind later |
| 3 | `ADD_COMMENTS` for the switch | Read and stored, not required; Jira's 403 speaks on the step | Low: an admin may see the failure on a step instead of at the switch |
| 4 | Outlook threading | Graph's `reply` when the runner holds the source and To is the sender unchanged; else today's `sendMail` | Low: an edited To threads by subject only |
| 5 | Outlook signature | Plain text typed in Revenact, on every Outlook send through Revenact | Low |
| 6 | Gmail signature on edited drafts | The server restores the block; the editor shows it read only | Low: a person can't tweak the signature per email in Revenact (they can delete it) |
| 7 | Gmail sends that skip a draft | Signed too, unless the text already holds a "-- " signature | Medium-low: someone who types their sign-off by hand gets it twice |
| 8 | A disabled or failing connector's `needs` | `"reconnect"`, and no Allow button until reconnected | Low |
| 9 | (R2-D2) Per-person Jira | Optional link per person; fall back to the connection's account, named in the panel; the switch still gates | Medium: if links are made mandatory, people without Jira seats can't run Jira steps ; a lost link blocks rather than falling back (R2D2-9) |
| 10 | (R2-D2) Live Slack channels | Channels the bot is a member of (`users.conversations`); a private unsynced channel listed, chosen and posted to only by people with `manage_integrations` | Medium: customer details in a wider channel |
| 11 | (R2-D3) Unmatched items | Slack and Jira only, in their own table (not a Ticket); department's "Needs a customer"; no model call until matched; 2,000-character excerpt, not encrypted (as all message text); deleted 30 days after last seen; optional add-as-contact on match | Medium: new stored copies of outside text |
| 12 | (R2-D3) Fast lane | Rules only, off by default, 2-minute quiet, 5-minute tick, 10 an hour and 50 a day | Low to medium: credits |
| 13 | (R2-D3) No tier rule | Health "poor" and named senders instead; a tier needs a tier field first | Low |
| 14 | (R2-D3) F1 request types | Pick list read as the connection, set through `POST /issue`; no new scope; only if live checks pass | Medium: names listed that a linked person may not use |

### 13.8 Live checks for the owner

Only checkable against real accounts (sandbox mailboxes and sites, never a customer):

- Jira: a comment posted with the `sd.public.comment` property is accepted and shows as internal in a JSM project; `GET .../comment?orderBy=-created` returns newest first; the `?focusedCommentId=<id>` link opens the comment.
- Graph: `reply` keeps the message's `singleValueExtendedProperties` on the Sent Items copy (a Retry's lookup depends on it); a reply with no `toRecipients` goes to the sender (or Reply-To); `ccRecipients` and `subject` in the reply's message are honoured; `$filter=internetMessageId eq '<id>'` finds the copy. D3's FR-3 check (the stamp on `sendMail`) is still open.
- Gmail: a restored signature with an image renders for the recipient.
- Still open from D3: Slack `chat:write` and the app's reinstall; `AGENT_TOOL_TIMEOUT_SECONDS` in the production env.
- R2-D2: the Atlassian 3LO app's distribution (another site can consent); the authorize URL with `prompt=consent` and `offline_access` returns a refresh token; refresh tokens rotate and the old one keeps working for 10 minutes; a refused refresh answers `403 invalid_grant`; `accessible-resources` lists the site with Jira scopes; each call in contract §3.3 accepts the classic scopes; Atlassian accepts an `http://localhost:8000` callback and more than one callback URL per app (else a separate dev app); removing the app under Connected apps in an Atlassian account ends the link (the next refresh is refused).
- R2-D2: Slack `users.conversations` with `types=public_channel,private_channel` succeeds for a bot token holding `channels:read` and `groups:read` only (no `im:read`, `mpim:read`); a token without `groups:read` asking `public_channel` only succeeds; `is_private` is set on private rows.

### 13.9 Owner set-up for R2-D2

**Atlassian app (per-person Jira).** Make two apps, one for local development and one for production, so a dev secret never sits in production.

1. Sign in at developer.atlassian.com, open **Developer console** (developer.atlassian.com/console/myapps), **Create › OAuth 2.0 integration**, name it "Revenact" (and "Revenact (dev)"), accept the terms.
2. **Permissions › Jira API › Add › Configure**: add the classic scopes `read:jira-work`, `write:jira-work`, `read:jira-user`. (`offline_access` is asked for in the authorize URL; it is not a console switch.) Nothing else: no Confluence, no `manage:*`.
3. **Authorization › OAuth 2.0 (3LO) › Configure**, callback URL:
   - production: `https://<public host>/api/v1/connectors/jira-link/callback/` (the same origin as `MAIL_OAUTH_REDIRECT_BASE`; today `https://revenact.20-219-7-222.sslip.io/api/v1/connectors/jira-link/callback/`, which changes if the VM's address changes);
   - development: `http://localhost:8000/api/v1/connectors/jira-link/callback/`.
4. **Distribution › Edit**: sharing **Enabled**; vendor name, privacy policy URL; "Does your app store personal data?" **Yes** (the Atlassian account id, display name, email and OAuth tokens, encrypted). Without sharing, only the app owner's own site can consent.
5. **Settings**: copy the Client ID and Secret into the backend env as `ATLASSIAN_OAUTH_CLIENT_ID` and `ATLASSIAN_OAUTH_CLIENT_SECRET` (local `.env`; production through revenact-infra: add both to `terraform/cloud-init.yaml.tftpl` beside the Google and Microsoft OAuth lines, as variables, then `make sync`). Both empty: linking is off and nothing else changes.
6. Each user then links from Settings › Connections › Your Jira account; consent shows Atlassian's "not reviewed" warning for an unlisted app (expected).

**Slack.** No new scope. Sign-in-with-Slack connectors already hold `channels:read` and `groups:read`. A connector made with a pasted bot token needs those two scopes on its Slack app (OAuth & Permissions › Bot Token Scopes) for the live list; without `groups:read` only public channels are listed, without `channels:read` the list shows a note. No reinstall is needed for sign-in connectors.

### 13.10 Owner set-up and live checks for R2-D3

- **Production intake (infra).** Add an `agentsignals` service to `revenact-infra/deploy/docker-compose.prod.yml`, the same shape as `ticketsync`, running `python manage.py run_agent_signals` every 300 seconds, then `make sync`. Without it, production runs neither the interval run (D2), the fast lane nor the runs after a match. The purge needs no service: it runs at the end of each `sync_tickets` pass (`ticketsync`, every 10 minutes). No new env var, no new OAuth scope, no new app.
- **Live checks** on alfiee.atlassian.net (projects KAN and SUP), in the Alfee workspace: an SUP issue from an unknown reporter shows under "Needs a customer" and matches; the same for a Slack message from someone outside; JSM's `servicedesk` and `requesttype` lists with the connection's token (F1a); `POST /issue` accepting the Request Type field with a request type's id, and the issue showing in the portal (F1b), also with a linked person's token (F1c); `connector.update` rows when the Jira connector is switched off and on (F2); a Highest SUP issue read by the fast lane within about 7 minutes (one call's credits). The list is in the backend contract §12.

