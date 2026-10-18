# Slack escalations: a colleague's Slack message becomes a Jira issue, an owner and a reply

Date: 2026-10-15. Status: approved by the owner ("Write the plans", 2026-10-15). Revised for the D1 plans the same day (§15). Revised 2026-10-17 ("Go"): the thread decides, every public channel syncs (§16).
Repos: revenact-backend and react-ts-app. Four deliveries since §16 (three before), each a backend PR merged before its frontend PR. Builds on agent bundles rounds 1 and 2 (`2026-10-13-agent-bundles-design.md`, R2-D3 merged as backend #120 and frontend #147).

Code facts below were read from backend `origin/main` 13da87a and frontend `origin/main` 6b28a86b.

## 1. Why

The platform is B2B. A tenant (in the test, **Alfiee**) connects **its own** Slack and **its own** Jira. Its customers (Globex (QA), Initech (QA)) are not in that Slack. What happens in the tenant's Slack is colleagues talking **about** customers:

> Faiz (Alfiee's Customer Success head), in `#all-alfiee`: "Globex's CSV exports have been failing since this morning, urgent. Can someone look?"

What the owner wants from that one message, as one bundle and one Run:

1. A **reply to Faiz** in the Slack thread, always drafted, carrying the new Jira issue's key and link.
2. A **Jira issue** in Alfiee's Jira, shown under Globex › Tickets.
3. The issue **assigned to the person who handles Engineering for Globex** (Jesh), falling back to the Engineering head.
4. The Slack thread and the Jira issue **linked both ways**; the Slack thread shown under Globex › **Conversations**, never under Tickets.

What the code does today (live test, 2026-10-15, bundle 23 in Alfiee):

- Every top-level Slack message is a **ticket** (`SL-…`, `services/connectors/providers/slack.py`, "every top-level message in one channel is a ticket"), resolved by a ✅ reaction (`DONE_REACTIONS`). Faiz's message became ticket SL-15357099 under Tickets.
- The customer is found by the **poster's email** (`sync._parent_for` → `mail.sync.match_parent`): it only worked because Faiz's Slack email was added as a fake Globex contact.
- R2-D3's "Needs a customer" **drops** messages from workspace members (`unmatched._is_member`): exactly the messages this round is about.
- The agent proposed one `jira.create` with no project, no assignee, no reply (the reply is optional: `prompt.OUTSIDE_COMMON` "at most one of draft.reply, mail.send_reply and slack.reply").
- A reply may not use another step's result (`slack_replies` refuses it on edit with `TO_CUSTOMER`, "This goes to a customer, so it can't use another step's result").
- An issue a step creates is never filed on the customer: Jira sync matches by reporter email (the connection's account), finds no customer, and `unmatched._keepable` refuses `made_here` items, so KAN-1 and SUP-1 never appeared under any organisation.

## 2. Owner decisions (2026-10-15)

1. **Whose Slack and Jira:** the tenant's own. A Slack message is a colleague's message about a customer (an internal escalation), not a customer's message.
2. **Which customer (A, "both"):** a Slack connection set to one customer files everything there; in a shared channel the customer named in the message is used; when unsure the thread waits in "Needs a customer". The poster's email is no longer used to find the customer.
3. **Who it goes to (A):** each customer has an **account team** (one person per department); when a customer has nobody in the department, the **department head** takes it.
4. **Slack is always a conversation (A):** never a ticket. No `SL-` numbers, no ✅-resolve. Tickets come only from ticket systems (Jira, Zendesk, Freshdesk, webhooks). Existing Slack tickets move to conversations.
5. **The bundle:** a Slack reply to the escalating colleague (always present, shown first, runs last with the Jira key and link filled in), a Jira issue in the connection's default project, and the assignment: in Jira when the person has a Jira account, and always a to-do in Work.
6. **Linked both ways:** the conversation shows its Jira issue; the ticket shows the Slack thread it came from; the Jira issue links back to the Slack thread.
7. **Order:** R2-D3 merged first (done 2026-10-15). Three deliveries: D1 Slack as conversation, D2 account team and heads, D3 the escalation bundle and the links.
8. **Naming:** in conversation and test notes the tenant is "Alfiee". Product copy and code keep their names; this round renames nothing.
9. **Departments are the six functions** (§14 Q1): accepted by default 2026-10-15 with "Write the plans".
10. **Jira assignee by email only** (§14 Q2): a member is assigned in Jira only when a Jira user has their login email; otherwise the step is skipped and the Work to-do still assigns them. Accepted by default 2026-10-15 with "Write the plans".
11. **Shared (Slack Connect) channels never carry the Jira key or link** (§14 Q3): accepted by default 2026-10-15 with "Write the plans".

## 3. Slack as a conversation (D1)

### 3.1 `SlackConversation` (new, `services/customers/models.py`)

The smallest sound choice. No existing model fits: `Email` is mailbox-scoped and carries mail fields; `Activity` and `Call` have no thread or connector identity; `SignalThread` stores no text by design ("No message text is stored here"). One row per Slack thread:

| Field | Meaning |
|---|---|
| `customer` / `account` | the record it is about (exactly one, like `Ticket`) |
| `connector` | the Slack connection it came through |
| `department` | stamped from `connector.department`, as tickets are (§3.6) |
| `channel`, `channel_name` | Slack channel id and name |
| `thread_ts` | the top message's `ts`; unique with `connector` |
| `title` | first line of the top message (`first_line`, 255) |
| `messages` | JSON list, oldest first: `{ts, user_id, name, text, bot}`; at most 50 kept (the top message plus the newest 49 replies); text 3000 characters each. No per-message email (only the poster's, below): minimised (§15) |
| `latest_reply` | Slack's `latest_reply` for the thread as last stored, so a sync fetches replies only when it moved |
| `started_by_name`, `started_by_email`, `started_by` | the top message's poster; `started_by` is the workspace member whose `User.email` equals the poster's Slack email (case-insensitive), else null |
| `url` | `slack.message_url(channel, thread_ts)` |
| `last_message_at` | newest message time |
| `matched_by` | `channel`, `name` or `person` (matched by hand), §3.3 |
| `external_shared` | the channel is shared outside the tenant (Slack Connect), read from `conversations.info` `is_ext_shared` at connect and on each sync |
| `synced_at`, `created_at`, `updated_at` | |

It is **not** `AIClassified` (revised §15): a colleague's words about a customer are not the customer's voice, so they never feed sentiment, pulse or the AI topic charts. Slack tickets counted there before D1 stop counting after the migration.

### 3.2 Sync (`providers/slack.py`, `connectors/sync.py`)

- `SlackProvider.fetch_tickets` becomes `fetch_threads`: the same `conversations.history` paging and cursor, the same filters (no subtype, no bot post, D3-26), plus, for a top message whose `latest_reply` is newer than what is stored, `conversations.replies` (at most `MAX_PAGES` pages). Replies are messages of the conversation, never new rows. The bot's own posts are kept in `messages` with `bot: true` so the thread reads whole, but never wake an agent.
- `reactions:read` and `DONE_REACTIONS` go; nothing resolves a conversation.
- `URGENT_WORDS` goes (revised §15): it only ever set a ticket's priority, and a conversation has none. The fast lane's own rules (R2-D3 `slack_channel`, `words`, `sender`) read the conversation instead.
- **Replies are seen** (revised §15): each pass reads the channel's top-level messages of the **last 7 days** (D2-22's window) instead of only those after the cursor, and fetches `conversations.replies` for a thread whose `latest_reply` moved since the stored one, at most 50 threads a pass (the rest next pass).
- `sync.file_ticket` stays for ticket sources; a new `sync.file_conversation(connector, remote)` creates or updates the `SlackConversation`, touches its `SignalThread` (`threads.touch_conversation`, §3.5) when new human text arrived, and goes to `unmatched.keep` when no customer is found (§3.4).
- The connection check (`connect`) also checks the bot is in the channel, with `conversations.info`'s `is_member` (revised §15: the call `connect` already makes, so no second call): a channel the bot is not in is refused with "Invite the bot to #channel first, then connect." (The 2026-10-15 live test showed Connected while the bot could not read the channel.)

### 3.3 Which customer

In this order, first hit wins. No model is used at sync (D2's rule: no agent work at sync time; R2-D3: no model reads an unmatched item).

1. **The channel is set to one customer.** The Slack connection's existing scope (`Connector.customers` / `accounts`, `_parent_for`'s "connector scoped to exactly one company") files everything there. One Slack connection reads one channel (`config["channel"]`), so "set this channel to Globex" is "this connection reads only Globex", set from the Slack connection's menu in Settings › Connections, "Choose its customer" (revised §15: the page shows the scope but had no way to set it; the `PATCH /connectors/<id>/` `customer_ids` / `account_ids` it uses already exists).
2. **The message names exactly one customer.** `services/connectors/naming.py` (new) looks for the names of the customers and accounts the connection covers in the top message's text (whole words, case-insensitive, ignoring a trailing " (QA)" style suffix and "Inc", "Ltd", "LLC"; at least 3 characters). Exactly one distinct record found: filed there. The match is stored on the conversation (`matched_by`), so the panel can say "Filed under Globex (QA) because the message names it."
3. **Unsure (none, or two or more):** the thread waits in "Needs a customer" (§3.4).

Removed: matching by the poster's email for Slack. A customer's Slack Connect guest in a shared channel is covered by rule 1 (set that channel to the customer).

### 3.4 "Needs a customer" for Slack (R2-D3, changed)

- `unmatched._keepable` no longer drops a Slack message because its poster is a workspace member (`_is_member` applies to Jira only). For Slack, a member's message is the main case.
- The row keeps what R2-D3 keeps (excerpt 2000, 7-day freshness, 500 per connection, 30-day purge) plus `candidates`: the ids of the records the name check found (0 to 5), shown first in the match dialog as "Mentioned: Globex (QA), Initech (QA)".
- **Match** on a Slack row creates the `SlackConversation` (not a `Ticket`) and touches its thread, then deletes the row, as today. The "add the sender as a contact" box is hidden for Slack rows (the sender is a colleague, not a customer contact).
- Dismiss, the queue lists, rights, audit and purge are unchanged.

### 3.5 Agents read conversations

- `SignalThread` gains `conversation` (FK to `SlackConversation`, CASCADE, nullable); `source_kind="slack"` threads use it instead of `ticket`. `threads.touch_conversation(conversation, first_seen=…)` mirrors `touch_ticket`.
- The intake block for a Slack thread is its `messages` (each line "Name: text", bot lines marked "(our reply)"), never more than the thread.
- The fast lane's Slack rule reads the conversation's channel connection and text (`fast_lane.for_conversation`, mirroring `for_ticket`).

### 3.6 Who sees a conversation (twice-filter rule)

Unchanged from what Slack tickets have today: the department rule. `visible_conversations(user, qs)` is `visible_tickets`'s rule (Leadership all; otherwise `department=""` or the reader's function), applied on top of the organisation scope. The story's new source uses it, as do counts, attention and search (`organizations/story/sources.py`, one `Source` per kind). Agents read only filed conversations; routing still checks `may_read_source`.

### 3.7 Story and the organisation page

- Backend: story kind `slack` in the `conversations` group (`story/params.GROUP_KINDS`), `at = last_message_at`, text fields `title`, `started_by_name`; the item shows channel, poster, reply count and the first line, and its linked tickets (§6).
- Frontend: `STORY_KINDS` gains `{ kind: 'slack', label: 'Slack', group: 'conversations' }`; `KIND_NAME.slack = 'Slack thread'`. Opening the item shows the thread (messages oldest first, the bot's own replies marked "Alfiee app" by the bot's name) and "Open in Slack". The mock `components/organizations/activity/SlackTab.tsx` stays (revised §15: the legacy `shared/ActivityFeed.tsx` still references it; removing that feed is outside this round).

### 3.8 Migration (D1)

One data migration, reversible on paper only (forwards is the supported path):

- Every `Ticket` whose connector is Slack becomes a `SlackConversation` with the same record, connector, department, `thread_ts = external_id`, `title`, one message from `description` and `requester_*`, `url = external_url`; its `SignalThread.ticket` moves to `conversation`; every waiting `slack.reply` / `draft.reply` step whose payload holds that `ticket_id` gets `conversation_id` instead (and its `target` `draft:ticket:N` becomes `draft:conversation:M`); the Ticket row is deleted. Dev today: ticket 738 (SL-15357099, Globex (QA)), thread 3, bundle 23.
- Slack `UnmatchedItem` rows stay; matching them now makes conversations (§3.4).
- Done and rejected bundles keep their history text; their payloads are migrated the same way so History links still open.
- A waiting `draft.reply` step on a Slack ticket is left as it is (revised §15): its ticket is gone, so Run reports it changed, as for any deleted source. A Revenact reply draft (`ReplyDraft`) on a Slack ticket is deleted with the ticket (a Slack thread is answered with `slack.reply`).

## 4. Account team and department heads (D2)

### 4.1 What exists

The account team already exists as `knowledge.FunctionOwner` ("who answers for this customer in one function"; one per customer per function; the person must work in that function), served by `GET/PATCH /api/v1/customers/<id>/responsible/` (Customer Success is the customer's `owner`) and edited today only inside the organisation's **Knowledge** tab (`CompanyViewTab`, "<function> owner" pickers). "Department" across tickets, connectors, queues and visibility is `User.function` (Customer Success, Engineering, Sales, Analytics, Leadership, Other). `identity.Department` is free-form and "deliberately not a source of permissions"; nothing routes by it.

So this round uses **functions** as departments (owner question Q1) and adds only the head.

### 4.2 `FunctionHead` (new, `services/knowledge/models.py`)

| Field | Meaning |
|---|---|
| `organisation` | workspace |
| `function` | one of `User.Function`, unique per organisation |
| `user` | the head; must be an active member working in that function (same `clean()` rule as `FunctionOwner`) |
| `updated_at` | |

API: `GET /api/v1/function-heads/` (any member), `PATCH /api/v1/function-heads/` `{"function": "engineering", "user_id": 7 | null}` (needs `MANAGE_ORG_SETTINGS`); audit row `function_head.changed` (who, function, from, to; ids only).

### 4.3 Who handles a customer in a function

`knowledge.ownership.handler_for(customer, function)` returns `(user, via)`:

1. the customer's `FunctionOwner` for that function (for Customer Success, the customer's `owner`), if active: `via="team"`;
2. else the function's `FunctionHead`, if active: `via="head"`;
3. else `(None, "nobody")`.

For an account: its parent customer's answer when it has exactly one parent customer; otherwise the account owner for Customer Success and the function head for the rest. Used by the escalation bundle (§5) and nothing else this round.

### 4.4 Screens

- **Organisation page:** an **Account team** card on the Details tab: one row per function (Customer Success shows the owner), each a person picker filtered to that function (the existing `/responsible/` PATCH, view-all-accounts rule unchanged), and an empty row reading "Nobody yet · Jesh Sanghvi (Engineering head) takes it". The Knowledge tab keeps its pickers.
- **Settings › People & teams:** a **Department heads** section: one row per function with a member picker (only that function's members), admins only.

## 5. The escalation bundle (D4; revised 2026-10-17, §16)

The thread decides who takes the work; the platform prepares one bundle for it. This section replaced the 2026-10-15 text, where the platform picked the person from the account team (that is now the fallback, §5.4). D4 works on today's single-channel Slack connection and does not need D3.

### 5.1 When

A `SlackConversation` thread whose newest human message is unanswered goes through intake as today (interval or fast lane, 15-minute quiet). The agent reads the **whole thread** (at most its 50 stored messages) and decides whether it is an **escalation** (a problem someone must act on) or not (small talk, thanks, "done"): not an escalation returns `"actions": []` and the thread is processed with no bundle, as today.

### 5.2 The decision in the thread

The agent looks for an **explicit assignment decision**: a message that asks a named person to take the work or says they will. Examples that count: "Faiz, can you take this?", "@Faiz will handle it", "let's give this to Faiz", "Faiz is on it". What does **not** count (owner default):

- a bare @-mention with no request: "@Faiz", "cc @Faiz", "@Faiz fyi", "+1 @Faiz";
- someone asking about a person without giving them the work: "has Faiz seen this?";
- a person offering themselves is a decision for that person ("I'll take it" by Faiz names Faiz).

When the thread holds several decisions, the newest one wins (a later "actually, Jesh, can you take it?" replaces Faiz). The answer names the message (its number in the thread), quotes the words that decide, and names the person exactly as written (a Slack mention or a name). The platform checks the quote is in that message, that the message is a person's (not a bot's or our own reply), and that the quote is more than a bare mention (§16.2 rule 3). A decision that fails a check is ignored, and §5.4's fallback applies.

### 5.3 Who the named person is

The named person is resolved to a workspace member, in this order:

1. **The Slack mention's user id through their Slack link** (`SlackLink`, #139): the member who linked that Slack user in the connection's Slack team.
2. **Their Slack email**: the member whose login email is that Slack user's email (the sync reads it with `users.info`, as it does for posters; the email is used and never stored).
3. **A plain name** ("let's give this to Faiz"): the one thread participant or mentioned person with that name or first name, else the one active member with that full name or first name.
4. **Nobody found**: the bundle says so ("The thread named Faiz, but no member matches. Choose who handles this.") and offers **Change**.

### 5.4 No decision in the thread

The fallback is D2's `handler_for(record, function, organisation_id=...)`: the model names the department in `"function"`, and the account team's person for it takes the work, else the department head, else nobody (then "Choose who handles this"). The panel labels it: "No one was named in the thread, so it goes to Jesh Sanghvi (Globex (QA)'s engineer)" or "(Engineering head)".

### 5.5 The steps

For an escalation the bundle has these steps, in run order (positions 1 to 4):

| # | Kind | What | Notes |
|---|---|---|---|
| 1 | `jira.create` | the issue in the Jira connection's default project (`config["project"]`; the oldest enabled Jira connection when there are several) | description ends with "From Slack: <thread link>"; filed at once as a `Ticket` on the organisation, with `Ticket.conversation` set (§6) |
| 2 | `jira.assign` | `source = {{step 1.ticket_key}}`, to the decided person | skipped at run, not failed, when they have no Jira account (§5.7) |
| 3 | `task.create` | a Work to-do for the decided person: "Globex (QA): <issue summary>", linked to the customer | when they can't open the customer, the to-do goes to its owner while the Jira assignee stays theirs (owner answer) |
| 4 | `slack.reply` | in the thread, carrying the Jira key and link | always present; runs last; posts as the person who accepts when they linked Slack, else as the bot (`SlackTool.post(actor)`, unchanged) |

The bundle panel shows the **reply first** (a "Reply in Slack" block at the top, labelled "Runs last, once the Jira issue exists"), then the other steps in run order. Run order is position order; only the display changes. The reply's text is editable; the key and link show as `[Jira key]` and `[Jira link]` markers with chips that can be removed, never typed.

Above the steps the panel shows where the person came from, with **Change**:

- from the thread: `Assigned by the thread: Tushar, "Faiz, can you take this?"` and `Faiz Jamal`;
- the fallback: `No one was named in the thread, so it goes to Jesh Sanghvi (Engineering head)`.

**Change** picks any active member (or "whoever handles <department>", which asks `handler_for` again) and rewrites steps 2 and 3, and the reply while it is still the platform's own words. Changing it is an edit (`edited_at`). The model never names a person for an escalation outside the decision; a `jira.assign` or `task.create` it proposes is dropped.

A Slack escalation bundle missing step 4 is completed with a reply from a fixed template ("Thanks {first name}. Logged as {{step 1.ticket_key}} ({{step 1.ticket_url}}) with {person} ({their department})."), so the reply is **always** there; a bundle without `jira.create` keeps whatever the model proposed (the model may judge Jira unnecessary) and its reply names no issue.

### 5.6 Who may accept (a rights change, approved)

Besides today's deciders (the customer's owner, anyone above them, view-all-accounts, and a queue's own people), **any workspace member who took part in that Slack thread** may accept (run) or reject this bundle, edit it and Change its person. A participant is someone whose own Slack message (not a bot's, not our reply) is in the thread and who resolves to a member (§5.3 rules 1 and 2). The right holds for that bundle only, is stored with it when it is made, and shows the bundle in the participant's Work › Mine.

**Privacy rule.** A participant who may not open the customer sees the bundle in a **participant view**: the customer's name with no link to it; the thread (they wrote in it); the decision and its quote; and each step's fields and preview, which are exactly what will be written to Jira, Slack and the to-do. They never see the bundle's reason, any step's rationale, evidence lines, the customer's page or any other record data. Text that leaves Revenact already never carries internal titles (D3-19, `internal_mentions`), and that rule holds here. A participant who may open the customer sees the bundle as anyone else does.

### 5.7 Assigning in Jira

`jira.assign` resolves the member to a Jira account by email (`_assignee_id` → `tool.account_for`, today a hard failure "no_user"). For an escalation step (`payload["if_found"] = true`, set only by §5.5) a member with no Jira account makes the step **skipped** with the note "Faiz has no account in Jira, so the issue is unassigned. Their to-do is in Work." Steps without `if_found` keep today's failure. The approver can still pick the Jira user from Jira's own list (existing assignee picker), which always wins.

### 5.8 The reply may carry the Jira key and link

Today every reply refuses `{{step N.key}}` (`TO_CUSTOMER`). New rule, `slack.reply` only:

- Allowed placeholders: `{{step N.ticket_key}}` and `{{step N.ticket_url}}`, N an earlier `jira.create` or `jira.assign` step of the same bundle; nothing else.
- Only when the conversation's channel is not shared outside the tenant (`external_shared` false, refreshed each sync). In a Slack Connect channel the rule stays as today, the template reply names no link, and a channel that became shared after the proposal fails the reply with "This channel is now shared outside your company, so the reply can't carry the Jira link. Take it out, then Retry."
- The run fills them from step outputs (`placeholders.outputs_for`); a missing output stops the reply with the existing `NEEDS` ("Needs step 1, which didn't run.").
- `prompt.OUTSIDE_COMMON`'s "never {{step N.key}} in a reply" changes to allow exactly this case for Slack escalations.
- Our own reply, posted as a person, is marked `via_app` by the sync, so it never wakes the agent again.
- Send to Revenact's own reply (#139, #140) follows the same rule: in a shared channel, or when Slack can't say whether it is shared, a reply carrying the key or link is refused (fail closed, owner accepted).

### 5.9 Routing

Routing is unchanged (`routing.route`: the customer's owner, then the connection's department, then admins). Participants reach the bundle through §5.6, so routing to the escalating colleague (the 2026-10-15 §5.6) is no longer needed.

## 6. Conversation and ticket linked

- `Ticket` gains `conversation` (FK to `SlackConversation`, SET_NULL, nullable): the Slack thread it came from.
- When `jira.create` succeeds in a bundle made from a conversation, the run **files the ticket at once** on the bundle's record (`connector` = the Jira connection, `external_id` = the issue key, `department` = the Jira connection's department, `conversation` set). Later Jira syncs update it by `(connector, external_id)` as today (`file_ticket` "existing" branch). This fixes the gap that KAN-1 and SUP-1 never appeared under an organisation.
- Jira gets a **remote link** to the Slack thread (`POST /rest/api/3/issue/{key}/remotelink`, title "Slack: #channel thread", url the thread URL), added after create; a refused remote link is a warning on the step, never a failure (the description already carries the link). Needs `write:jira-work`, already held.
- **Organisation › Conversations:** the Slack item shows "KAN-2 · In progress · Jesh Sanghvi" for each linked ticket (status and assignee from the synced ticket), opening the ticket.
- **Organisation › Tickets:** a ticket with a conversation shows "From Slack: Faiz Jamal in #all-alfiee", opening the thread.
- Twice-filter: each side is shown only when the reader may see it on its own (`visible_tickets` and `visible_conversations`); otherwise the line reads "Linked to 1 item you can't see" with no title.

## 7. Prompt changes (`services/agents/prompt.py`)

- `THREAD_SYSTEM` gains a Slack escalation variant: "A colleague raised this in your company's Slack. Decide whether it is something the team must act on. If it is, propose a jira.create for the problem and say which department must handle it in "function"; the platform adds the assignment, the to-do and the reply." Payload for a Slack escalation answer adds `"function": <one of cs, engineering, sales, analytics, leadership, other, or null>`.
- `OUTSIDE_RULES["slack.reply"]`: "A slack.reply answers the colleague in their thread: say what was done and who has it." (was "the customer's Slack thread").
- The one-reply rule and the D3-20 rule (where it posts comes from the thread) stay.

## 8. Errors (plain words, no em dashes in UI copy)

| Case | Shown |
|---|---|
| Bot not in the channel at connect | "Invite the bot to #channel first, then connect." |
| Customer unclear | the thread waits in Needs a customer: "Mentioned: …" or "No customer named" |
| No Jira default project | step 1 asks "Choose a Jira project." (existing `CHOOSE_PROJECT`) |
| Handler has no Jira account | step 2 skipped: "Jesh has no account in Jira, so the issue is unassigned. Their to-do is in Work." |
| Nobody handles the function | "Choose who handles this" on the bundle |
| Jira create failed | the reply does not run: "Needs step 1, which didn't run." |
| Remote link refused | warning on step 1: "Couldn't add the Slack link in Jira. The description has it." |
| Shared (Slack Connect) channel | reply without key or link; the chips are not offered |

## 9. Testing

Every delivery ships unit, integration and end-to-end tests (the repos' testing skills); the backend runs `--parallel`; frontend vitest, tsc, lint, build and the ratchet at baseline. Key cases:

- D1: thread with replies stored whole and capped at 50; bot posts never wake an agent; ✅ changes nothing; channel-scoped connection files without reading text; one name found / none / two; member posts kept in Needs a customer; match creates a conversation; migration of a Slack ticket with a waiting `slack.reply` step and a done one; visibility by department; story counts and search include `slack`; connect refused when the bot is not in the channel.
- D2: head must work in the function; `handler_for` order (team, head, nobody, inactive people skipped, account rule); rights on PATCH; audit row.
- D3 (§16.1): every public channel listed and kept current; new ones included, Slack Connect ones excluded; joined up to 5 a pass with `channels:join`, none without it; at most 10 channels read a pass, active ones first, one shared reply budget, `ratelimited` ends the pass; per-channel customer, else the name check; exclude stops reading; the migration keeps connection 7's channel, conversations, threads and Needs-a-customer rows.
- D4 (§16.2): a decision found, checked (quote in the message, a person's message, not a bare mention) and resolved by Slack link, Slack email or name; nobody found shows Change; no decision falls back to `handler_for`; participants may accept and see only the participant view; escalation bundle always has the reply; template reply when the model omits it; function → handler → steps 2 and 3; Change rewrites both; `if_found` skip; reply placeholders allowed only for Jira keys of earlier steps and only in non-shared channels, refused otherwise with today's `TO_CUSTOMER`; ticket filed on create and updated by the next sync; remote link warning path; link lines under both tabs with the twice-filter; small talk makes no bundle.

## 10. Deliveries

Revised 2026-10-17 (§16): four deliveries. D3 and D4 are independent; either may merge first.

| | Backend | Frontend |
|---|---|---|
| **D1 Slack as conversation** (merged) | `SlackConversation`, sync with replies, name check, channel scope rule, connect membership check, Needs a customer changes, `SignalThread.conversation`, slack.reply on conversations, story kind, migration | Story `slack` kind and thread view, Needs a customer "Mentioned" chips and Slack match (no contact box), connect error copy |
| **D2 Account team and heads** (merged) | `FunctionHead` + API + audit, `handler_for` | Account team card on Details, Department heads in Settings › People & teams |
| **D3 Every public channel syncs** | `SlackChannel` (one row per public channel: included, joined, shared, its customer), `channels:join` and `conversations.join`, `conversations.list` each pass, channels read per pass capped and rotated with one shared reply budget, per-channel customer then name check, the channel in conversation, thread and Needs-a-customer keys, migration of today's single-channel connections, channel list and channel PATCH routes | Settings › Connections › Slack: "Choose channels" (the channel list with Sync on or off and each channel's customer), "Approve the app again" when it can't join, the state line "syncs 12 of 14 public channels" |
| **D4 The thread decides** | prompt (escalation, department, the decision), the decision checked and resolved (Slack link, Slack email, name), the four steps with the reply last and its template, fallback to `handler_for`, `if_found`, reply placeholders rule, ticket filed on create, `Ticket.conversation`, Jira remote link, `via_app`, `kinds.Skipped`, participants who may accept and the participant view, Change, Send to Revenact's shared-channel rule | reply-first panel with "Runs last", "Assigned by the thread" with its quote and Change, placeholder markers and chips, "Posts as you", the skipped note, the participant view, link lines under Conversations and Tickets |

Each backend PR merges before its frontend PR; docs (API contracts, the six product documents) change in the same PR as the code.

## 11. Owner set-up and live checks in Alfiee

Set-up (dev DB org 4, owner or Claude where safe):

1. Jira connection 6 (alfiee.atlassian.net): set the default project (KAN) in Settings › Connections; leave its department blank (whole company) so everyone who should see a filed KAN ticket can.
2. People: Jesh's function Engineering, Faiz's Customer Success (People & teams). D2: Engineering head Jesh, Customer Success head Faiz; Globex's account team: Customer Success Faiz (owner), Engineering Jesh.
3. After D1: delete the QA contacts added for the old poster-email rule (faiz.jamal10@gmail.com on Globex (QA), jeshsanghvi20@gmail.com on Initech (QA)).
4. For the Jira assignee: invite Faiz to alfiee.atlassian.net with the email his platform login uses, or pick Faiz from Jira's list on the step.
5. For D4: Tushar, Jesh and Faiz link their Slack (Settings › Connections › Your accounts), so their messages resolve to them and the reply posts as the person who accepts.
6. For D3: approve the Slack app again once with the new `channels:join` scope (Settings › Connections › Slack › Reconnect › Sign in with Slack; with a pasted token, add the scope in the Slack app's settings, reinstall it and paste the new token).

Live checks (Slack workspace T0C9D77NPNE, `#all-alfiee` C0CA7PPRP7A, Slack connection 7):

- **LC-D1a** After the D1 migration, SL-15357099 shows under Globex › Conversations, not Tickets; bundle 23 still opens.
- **LC-D1b** Faiz posts "Initech's login is broken" in `#all-alfiee`: filed under Initech (QA) by name; a reply in that thread appears in the same conversation.
- **LC-D1c** A message naming no customer waits in Needs a customer with "No customer named"; matching it creates a conversation and a bundle.
- **LC-D3a** After the D3 migration, connection 7 still reads `#all-alfiee` (its existing conversations keep working) and Settings › Connections › Slack › Choose channels lists every public channel, `#all-alfiee` included.
- **LC-D3b** After approving the app again, a new public channel (say `#alfiee-escalations`) is joined by the bot on the next sync, with no invite, and a message there naming Globex is filed under Globex (QA).
- **LC-D3c** Exclude `#random`: messages there are no longer read. Set `#alfiee-escalations` to Globex (QA): a message there naming no customer is filed under Globex.
- **LC-D4a** In `#all-alfiee`, Tushar posts "Globex's CSV exports are failing", Jesh replies "Faiz, can you take this?". One bundle: the reply on top ("Runs last, once the Jira issue exists"), then Create a Jira issue (KAN), Assign it to Faiz, a to-do for Faiz, and `Assigned by the thread: Jesh, "Faiz, can you take this?"`. It is in Tushar's and Jesh's Work › Mine (they took part) and in Globex's owner's.
- **LC-D4b** Tushar presses Run. KAN-n exists with the Slack link in its description and a remote link, assigned to Faiz in Jira (or skipped with "Faiz has no account in Jira, ..." if he has none); it shows under Globex › Tickets at once with "From Slack"; Faiz has the to-do in Work; the thread gets the reply with the real key and link, posted as Tushar, once; the next sync does not wake the agent.
- **LC-D4c** A thread where someone only writes "cc @Faiz" names nobody: the bundle says "No one was named in the thread, so it goes to ..." (Globex's engineer, Jesh).
- **LC-D4d** "Thanks, all good now" in a thread makes no bundle.

## 12. Housekeeping (separate small changes)

- **Model:** dev `.env` `BEDROCK_MODEL_ID` points at Claude 3.5 Sonnet (2024). Move to a current Claude model available in the Bedrock region, as its own one-line config change, and re-run LC-D3a with it. Not part of D1 to D3.
- **Agent interval:** Alfiee's interval is 1 hour (`Organisation.ai_signal_interval`, `intake.due`), so a non-urgent escalation can wait up to about 75 minutes. Turn on the fast lane (R2-D3) with the `#all-alfiee` connection under Slack channels for the live checks.
- **Production:** intake has never run in production (no `agentsignals` service in the infra compose); unchanged by this round.

## 13. Out of scope

- Renaming the product to Alfiee.
- DMs and private channels the bot is not invited to (public channels sync from D3, §16.1).
- Mapping a member's Jira identity when its email differs from their login (§5.7, §11.4 work around it). A Slack identity comes from the person's Slack link (#139).
- Free-form `identity.Department` as the routing unit (see Q1).
- Escalations from email, Zendesk or Freshdesk (the same bundle shape could follow later).
- Posting Jira status changes back into the Slack thread.

## 14. Owner questions

1. **Departments are the six functions** (Customer Success, Engineering, Sales, Analytics, Leadership, Other), because tickets, queues, visibility and the existing account team already use them. Free-form departments from Settings › People & teams would need routing rebuilt. Recommendation: functions.
2. **Jira assignee by email:** a member is assigned in Jira only when a Jira user has their login email; otherwise the step is skipped and the to-do still assigns them. Recommendation: keep; add a per-person "Jira account" setting later only if it bites.
3. **Slack Connect (shared) channels:** a reply there never carries the Jira key or link, since customers may read it. Recommendation: keep.

Q1 to Q3 were accepted by default on 2026-10-15 when the owner said "Write the plans" (§2 decisions 9 to 11).

## 15. Revisions made while planning D1 (2026-10-15)

Read from backend main 13da87a and frontend main 6b28a86b. Each is binding on the D1 plans (backend contract `revenact-backend docs/superpowers/plans/2026-10-15-slack-escalations-d1-api.md`, items SE1-1 onwards).

1. `SlackConversation` is not `AIClassified` (§3.1): colleague text is not customer sentiment.
2. `messages` keep no per-message email; the poster's email is kept once (`started_by_email`) to find the member (§3.1).
3. Replies: a 7-day re-read of top-level messages plus `conversations.replies` for threads whose `latest_reply` moved (§3.2); the sync cursor no longer bounds Slack.
4. The bot-in-channel check uses `conversations.info`'s `is_member` (§3.2).
5. `URGENT_WORDS` is removed (§3.2).
6. "Set this channel to one customer" gets a control: "Choose its customer" on a Slack connection's menu (§3.3).
7. `matched_by` gains `earlier` for conversations the migration made from Slack tickets.
8. Waiting `draft.reply` steps on Slack tickets are not migrated; reply drafts on Slack tickets are deleted with them (§3.8).
9. A Slack "Needs a customer" row reads its channel (`#all-alfiee`) where a Jira row reads its key, and offers no "add as contact" (`can_add_contact` is false for Slack). Matching it answers `record` and `conversation` (`ticket` is null).
10. Opening a Slack item on the organisation page reads a new `GET /api/v1/slack-conversations/<id>/`, under the same two rules as the story.
11. The `SlackTab` mock is not deleted in D1 (§3.7): the legacy `shared/ActivityFeed.tsx` still renders it.

## 16. Revisions 2026-10-17: thread decides; all channels

Approved by the owner ("Go", 2026-10-17). Read from backend main ccc5d8a and frontend main f44f679f. Binding on the D3 plans (backend contract `revenact-backend docs/superpowers/plans/2026-10-17-slack-escalations-d3-api.md`, items SC3-1 onwards) and the D4 plans (`2026-10-17-slack-escalations-d4-api.md`, items SE4-1 onwards). The D3 plans written earlier on 2026-10-17 from the old §5 (the platform picks the person) are replaced; their survey, fixes and building blocks carry into D4.

The owner's model, in their words: "All the channels in Slack can be connected to the platform as they are public channels for the org. So the channel data would simply be synced with the platform. Let's say Tushar and Jesh decide that this work has to be assigned to Faiz, so Faiz would be assigned that work by the platform."

### 16.1 D3: every public channel syncs

1. One Slack connection syncs **every public channel** of its Slack workspace. Today a connection is one channel (`config["channel"]`, `providers/slack.py`); D3 adds one `SlackChannel` row per public channel of the connection.
2. The bot joins public channels itself (`conversations.join`). The app asks for one more scope, `channels:join`; the owner approves the app once more. Until then the sync reads the channels the bot is already in, and Settings says so.
3. New channels are picked up automatically: each pass lists the workspace's public channels (`conversations.list`).
4. An admin can exclude channels (say `#random`) in Settings › Connections. The default is included.
5. Each channel can be set to one customer: D1's "Choose its customer" becomes per channel. Otherwise D1's name check applies, over the records the connection covers.
6. Rate limits: the per-pass reply budget and the `ratelimited` back-off stay; the budget is shared by every channel of a pass; at most 10 channels are read a pass (channels with a message in the last 2 days first, then the longest unread), at most 5 joined a pass; a `ratelimited` answer ends the pass's reading.
7. A data migration keeps every single-channel connection working (connection 7 keeps `#all-alfiee` and its conversations); a connection set to one customer moves that choice onto its channel.
8. **Slack Connect** (`external_shared`) channels are listed but **excluded by default**: people outside the tenant read them and the customer may be one of them. An admin may include one; a reply there never carries a Jira key or link (decision 11).
9. Private channels stay out of scope (§13), except a connection's existing private channel, which keeps syncing.

### 16.2 D4: the thread decides; the platform prepares the bundle

1. The agent reads the whole thread and looks for an explicit assignment decision (§5.2). A bare @-mention is not one (owner default).
2. The named person is resolved: Slack link of the mentioned user id (#139), else their Slack email, else a plain name among the thread's people and then the workspace; nobody found is shown with Change (§5.3).
3. The platform re-checks the model's decision: the quote is in the named message, the message is a person's, and the quote is more than a bare mention (mentions removed, at least one word left that is not "cc", "fyi", "ping", "fwiw", "+1", "see", "also" or "heads up").
4. The steps, in run order: `jira.create` (filed as a Ticket on the organisation, `Ticket.conversation` set), `jira.assign` to the decided person (skipped when they have no Jira account), a Work to-do for them, and the Slack reply with the Jira key and link, last, posted as the accepter when they linked Slack, else the bot (§5.5).
5. The bundle shows the decision's source quote with its author and a Change option (§5.5).
6. No decision: D2's `handler_for` (account team, then department head), labelled so (§5.4).
7. Who may accept: the existing deciders plus any member who took part in the thread, for that bundle only, with the participant view as the privacy rule (§5.6).
8. Kept from the replaced D3 plan: links both ways, `via_app`, `kinds.Skipped`, editable reply text with `[Jira key]` and `[Jira link]` markers, the `external_shared` refresh, Send to Revenact's shared-channel rule (fail closed), "Posts as you".
9. Accepted owner answers from the replaced plan: the Jira connection's department stays blank; its wording; the oldest enabled Jira connection is used; a person who can't open the customer gets the Jira assignee while the to-do goes to the owner.
10. D4 works on today's single-channel connection: it does not need D3.

### 16.3 What this changes elsewhere in this spec

- §2 decision 3 ("who it goes to"): the thread's decision first; the account team and heads are the fallback.
- §2 decision 7: four deliveries (§10).
- §4.3: `handler_for` is used by the fallback and by Change's "whoever handles <department>".
- §5 is rewritten for D4; the old §5.6 (route to the escalating colleague) is replaced by §5.6 (participants may accept).
- §7: the prompt also asks for the decision (`"decision": {"message", "quote", "assignee"}` or null), beside `"function"`.
- §8: new cases "The thread named Faiz, but no member matches. Choose who handles this." and "Slack hasn't let Revenact join channels yet."
- §13: "several channels per connection" is no longer out of scope (D3); DMs and private channels still are.

### 16.4 D3 revised: Slack's Events API pushes messages; polling is only a catch-up (2026-10-17)

Approved by the owner on 2026-10-17. It is binding on the D3 plans (backend contract `revenact-backend docs/superpowers/plans/2026-10-17-slack-escalations-d3-api.md`, items SC3-1 to SC3-31). It replaces §16.1 items 3 and 6, and the polling D3 plans written earlier the same day.

**Why.** Since 29 May 2025, Slack limits apps that are commercially distributed but not listed in the Marketplace to about 1 call a minute, and 15 objects a call, on `conversations.history` and `conversations.replies`. Internal customer-built apps, and existing installs of older unlisted apps, keep the normal limits. Alfiee is B2B: each customer installs our app, so reading 10 channels a pass cannot work. Sources: docs.slack.dev changelog 2025-05-29 and 2025-06-03, and `apis/web-api/rate-limits`.

1. **Messages arrive by push.** Slack's Events API sends each message to a new public endpoint, `POST /api/v1/connectors/slack/events/`. It checks Slack's v0 signature with the verifier from #139, answers `url_verification`, and files the message before it answers. Every verified delivery gets a 200. Retries are idempotent.
2. **The agent runs on its tick.** Filing touches the conversation's thread; the agent itself runs on the `agents` tick (5 minutes, fast lane). There is no task queue by design, and Cloud Run gives a request CPU only until it answers.
3. **New channels.** Slack's `channel_created` event makes the channel's row and joins it at once (with `channels:join`). Each pass also lists the channels with `conversations.list`, which is not rate-limited the same way.
4. **What is filed.** Our own bot's posts, and posts made as a person through our app, are kept in the thread but never wake the agent. Edits update the stored text quietly. Deletes remove a reply, or mark a top message "This message was deleted.". Joins, topic changes and file shares are ignored, as the poll ignored them.
5. **The catch-up.** Per connection and pass, never within a minute of the last call: one history page (15 messages) of one channel, and one thread (15 messages). The thread is one an event could not file, or one whose replies moved. A busy channel's backlog is walked over several passes.
6. **Settings.** Settings › Connections › Choose channels shows "Events: receiving. The last one arrived 5 minutes ago." or "Events: not set up. Revenact checks one channel at each sync until they are."
7. **Owner set-up, once, in the Slack app:**
   - Event Subscriptions on.
   - Request URL: the deployed backend + `/api/v1/connectors/slack/events/`.
   - Bot events `message.channels` and `channel_created`.
   - Scope `channels:join`.
   - Reinstall, then Reconnect in Settings.

   The live checks (LC-D3a to LC-D3d, contract §8) run on the deployed backend: Slack can't reach a dev server. Locally, the by-eye check posts signed fake events.
8. **Migrations.** D4 owns `customers.0063`. D3's build starts from main; if D4 merged first, D3 rebases onto it before its PR, and its `customers` migration becomes `0064`.
