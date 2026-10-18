# Slack escalations, delivery 1 ("Slack as a conversation"): API contract

Backend plan: `docs/superpowers/plans/2026-10-15-slack-escalations-d1-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-15-slack-escalations-d1-frontend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-15-slack-escalations-design.md` §3 (D1), §8 and §9 (D1 rows), §11
(LC-D1a to LC-D1c) and its §15 revisions, on the frontend branch `feat/slack-escalations-d1`. The
agent bundles contracts (D1 to R2-D3, recorded in `docs/API_CONTRACTS.md`) still hold except where
this file changes them. Every path is under `/api/v1/`, every route is `IsAuthenticated` (401
without a token) unless it says otherwise, every body is JSON.

Merge order: this delivery's backend PR, then its frontend PR. What an old frontend sees between the
two merges: the story gains items of kind `slack` (an old page draws them with its fallback icon and
"Record", and cannot open them); a Slack "Needs a customer" row's `number` is its channel; matching a
**Slack** row answers `ticket: null`, which an old page's toast cannot read (it shows an error; the
match itself is done). Nothing else changes for an old page.

## What the merged code does today (main 13da87a)

- **Slack is a ticket source.** `services/connectors/providers/slack.py` `SlackProvider.fetch_tickets`
  reads `conversations.history` from the cursor (`oldest=`), one page loop of `MAX_PAGES` (5) x
  `PAGE` (200); skips messages with a `subtype`, thread replies, bot posts and empty text (D3-26);
  calls `users.info` once per poster; maps each top message to a `RemoteTicket`
  (`number = "SL-" + last 8 digits of ts`, `status = "resolved"` on a `DONE_REACTIONS` reaction,
  `priority = "high"` on an `URGENT_WORDS` word, `requester_email` = the poster's Slack profile
  email). Replies are never read; a reaction added after the first read is never seen (the cursor
  has moved on).
- **The customer is the poster's email's.** `services/connectors/sync.py` `_parent_for` asks
  `mail.sync.match_parent` (a contact's address, then the domain), then a connector scoped to exactly
  one customer or one account, and checks `Connector.covers`. The 2026-10-15 live test only filed
  Faiz's message because his Slack email was added as a fake Globex contact.
- **Unmatched Slack items drop colleagues.** `services/connectors/unmatched.py` `_keepable` refuses
  an item whose requester email is a workspace member's (`_is_member`), for Slack and Jira alike.
- **A Slack ticket's thread** is a `SignalThread` with `source_kind="slack"`, `ticket` set,
  `external_id = "<connector pk>:<ts>"` (`threads.touch_ticket`). `intake.answered` calls it
  resolved when the ticket is. `evidence._thread` puts one `ticket_line` in `ctx.thread_lines` and
  fills `ctx.thread_ticket` (provider, connector, external id, config, usable);
  `outside/offered.py` offers `slack.reply` when that ticket's provider is Slack and usable;
  `actions/slack_replies.py` `validate` builds the payload from `ctx.thread_ticket`
  (`ticket_id`, `thread_ts = external_id`), `target` is `draft:ticket:<id>` (shared with
  `draft.reply`: one reply per conversation), `current` reads the ticket's status.
- **Connect** (`SlackProvider.connect`) calls `auth.test` and `conversations.info`; it never checks
  the bot is in the channel (the live test showed Connected while `conversations.history` answered
  `not_in_channel`).
- **The organisation story** (`services/organizations/story/`) has no Slack kind: `GROUP_KINDS`
  `conversations` is `activity, call, email, calendar_event`; Slack tickets showed under `tickets`.
- **The Integrations page shows a connector's scope** ("Reads all organizations", "Reads 1
  organization") but offers no control to set it; `PATCH /connectors/<id>/` already takes
  `customer_ids` and `account_ids` (`ConnectorSerializer`).
- **Dev data:** ticket 738 (SL-15357099, Globex (QA), connector 7), its thread 3, bundle 23
  (one waiting `jira.create`, no Slack step).

## Decisions narrowing the spec

| # | Decision | Cost if wrong |
|---|---|---|
| SE1-1 | **Scope.** Slack only. Every other ticket source (Zendesk, Freshdesk, Jira, webhook) is unchanged. No escalation bundle, account team or Jira link in D1 (D2, D3). | None. |
| SE1-2 | **`customers.SlackConversation`** (new, §1.1): one row per Slack thread on exactly one customer or account, unique on `(connector, thread_ts)` while the connector exists. **Not `AIClassified`** (spec §15.1). | Low. |
| SE1-3 | **What is kept.** `messages`: at most 50 (the top message and the newest 49 replies), each `{ts, user_id, name, text, bot}`, text cut at 3,000 characters; no per-message email. `started_by_email` is the poster's Slack email, kept once to find the member (SE1-6). No files, reactions or edits. | Low. |
| SE1-4 | **Reading.** Each pass reads top-level messages of the **last 7 days** (`WINDOW`), the same filters as today (no subtype, no bot post, text required), and for each thread whose Slack `latest_reply` differs from the stored `latest_reply` calls `conversations.replies` (at most `MAX_REPLY_THREADS = 50` a pass, oldest first; the rest next pass). Replies keep bot posts (`bot: true`) so the thread reads whole; a reply with a `subtype` other than `bot_message`, or empty text, is skipped. `sync_cursor` is set to the newest top-level ts seen (shown nowhere, bounds nothing). | Low: a thread quiet for more than 7 days then answered is not seen again (D2-22 would skip it as stale anyway). |
| SE1-5 | **Which customer** (spec §3.3), first hit wins: (1) the connection covers exactly one customer and no account, or one account and no customer (`_scoped`): filed there, `matched_by="channel"`; (2) `naming.find` names exactly one record the connection covers in the **top message**: filed there, `matched_by="name"`; (3) otherwise kept as unmatched with up to 5 `candidates` (SE1-9). The poster's email is never used for Slack. | Low. |
| SE1-6 | **`started_by`**: the active workspace member whose `User.email` equals the poster's Slack email (case-insensitive), else null. Stored, not used for routing until D3. | None. |
| SE1-7 | **Name matching** (`services/connectors/naming.py`): the names of the non-archived customers and the accounts the connection covers. A name is folded (lower case, a trailing parenthesised part such as " (QA)" removed, a trailing "Inc", "Inc.", "Ltd", "Ltd.", "LLC" removed, inner spaces collapsed); names under 3 characters are ignored; a match is whole-word in the folded text. When an account and one of its own parent customers both match, the account is dropped (an account usually shares its customer's name). Exactly one record left is a match; two to five are candidates; more than five are candidates cut to the first five by name. | Low: "Globex" in a message about Globex Bank files nothing when both are customers (both are candidates). |
| SE1-8 | **New words wake the agent, nothing else.** A thread is touched (`threads.touch_conversation`) when the sync stores a human message (not `bot`) it had not stored before; its time is that message's (never later than now). First seen with its newest human message older than 7 days: skipped stale (D2-22). The bot's own reply never touches it. | None. |
| SE1-9 | **"Needs a customer" for Slack** (spec §3.4). `_keepable` drops a member's item for **Jira only**. A Slack row stores the top message (excerpt 2,000, as R2-D3), `number = "#<channel_name>"` (32 characters), `requester_*` the poster, `url` the thread, and `candidates` (`[{"type": "customer" or "account", "id": n}]`, at most 5). R2-D3's freshness, caps, purge, dismiss and rights are unchanged. Every pass re-reads 7 days, so a waiting Slack row's `last_seen_at` moves each pass while the message is within 7 days. | Low: a Slack row is purged 30 days after it leaves the 7-day window, not 30 days after it was posted. |
| SE1-10 | **Matching a Slack row** makes a `SlackConversation` (not a `Ticket`): one message from the row, `matched_by="person"`, `latest_reply=""` so the next pass fetches its replies; its thread is touched as new (R2D3-9). `add_contact` is refused for a Slack row with `400 {"add_contact": ["A Slack message is from a colleague. Match it without adding a contact."]}`; `can_add_contact` is always false for Slack. GONE also when a conversation for the row exists. | None. |
| SE1-11 | **The match answer** gains `record` (`{type, id, name}`) and `conversation` (`{id}` or null); `ticket` is null for a Slack row (frontend reads `record`). | Trivial (see merge order). |
| SE1-12 | **`mentioned`** on each list row: the candidates the **reader may open** (`visible_customers` / `visible_accounts`, one query each per page), `[{type, id, name}]` in the stored order; `[]` for Jira rows and when none. A record the reader may not open is never named. | None. |
| SE1-13 | **Agents read conversations.** `SignalThread.conversation` (FK, CASCADE, nullable). A Slack thread's block is its newest 8 messages (`THREAD_MESSAGES`), each `    message <n>: from "<name>", <time>: "<text 600>"` (`n` the 1-based position in the stored thread; the bot's own as `we wrote (<bot name>)`); `ctx.thread_channel = "slack"`; `ctx.thread_slack` replaces `ctx.thread_ticket` for Slack. `answered`: the newest stored message is the bot's (`"answered"`). `slack.reply` payload holds `conversation_id` instead of `ticket_id`; `target` is `draft:conversation:<id>`; `current` is always `"open"` (nothing resolves a conversation). `draft.reply` is never offered on a Slack conversation (it needs `ctx.tickets`, which a conversation never fills). | Low. |
| SE1-14 | **Fast lane.** `fast_lane.for_conversation(conversation)`: source `slack`, the connection's id, no priority, sender the poster's email, text = title + newest human message (2,000). | None. |
| SE1-15 | **Who reads a conversation** (SOC2 AUTH-02, spec §3.6): `personal.visible_conversations(user, qs)`, the ticket rule (Leadership all; otherwise `department=""` or the reader's function), after the record's own scope. Used by the story source, its counts and search, `GET /slack-conversations/<id>/` and `readable_threads` (unchanged: a Slack thread already follows its department). | None. |
| SE1-16 | **The story** gains kind `slack` in group `conversations` (§3). Copilot's story digest names it "Slack thread" and does not count it in its count line (department-wise, like email and tasks are left out). | None. |
| SE1-17 | **Connect checks membership.** `conversations.info`'s `channel.is_member` false: `400 {"detail": "Invite the bot to #<name> first, then connect."}`. `config.external_shared` = `channel.is_ext_shared` (stored for D3), refreshed on each pass. | None. |
| SE1-18 | **The migration** (`agents.0008_slack_tickets_to_conversations`, spec §3.8): every `Ticket` whose connector's provider is `slack` becomes a `SlackConversation` (`matched_by="earlier"`, one message from its description and requester, `thread_ts = external_id`, `url = external_url`, `last_message_at` from the ts, `started_by` matched by email); its `SignalThread` points at the conversation (`ticket = null`); every `slack.reply` step whose payload's `ticket_id` is that ticket gets `conversation_id` instead (and `target` `draft:conversation:<id>`), whatever its status; the Ticket is deleted (its `ReplyDraft`s go with it). Slack `UnmatchedItem` rows stay. Reverse is a no-op (forwards only). | Low: a waiting `draft.reply` on a Slack ticket fails "changed" on Run. |
| SE1-19 | **Ceilings.** New pins `SLACK_CONVERSATION_QUERIES` (the detail route), `SLACK_SYNC_QUERIES` (a pass of 3 threads), unchanged story ceilings plus at most 2 per page (the `slack` source's page and count queries), `UNMATCHED_LIST_QUERIES` at most +2 (the `mentioned` names), `THREAD_RUN_QUERIES` for a Slack thread re-measured (the conversation replaces the ticket; expected unchanged). No `DISTINCT`. | Low. |
| SE1-20 | **Audit.** No new event. `ticket.matched` keeps its name for a Jira row; a Slack match writes `conversation.matched` (target the conversation, metadata as `ticket.matched`'s). Never message text, a title or an email in metadata. | None. |
| SE1-21 | **Twice-filter.** In: an agent reads only a filed conversation's own messages (its record's block, D2-13); an unmatched row is never read by a model (R2D3-2 unchanged). Out: unchanged. Name matching is plain string work at sync, no model. | None. |

## 1. Data

### 1.1 `customers.SlackConversation` (`customers.0062_slackconversation`)

| Field | Type | Notes |
|---|---|---|
| `customer` | FK Customer, CASCADE, null, `related_name="slack_conversations"` | exactly one of customer / account (constraint `slack_conversation_one_parent`) |
| `account` | FK Account, CASCADE, null, `related_name="slack_conversations"` | |
| `connector` | FK `connectors.Connector`, SET_NULL, null, `related_name="slack_conversations"` | removing a connection keeps the history |
| `department` | char 16, blank | the connector's at filing time |
| `channel` | char 32 | Slack channel id |
| `channel_name` | char 80, blank | |
| `thread_ts` | char 32 | the top message's ts |
| `title` | char 255 | the top message's first line (`first_line`) |
| `messages` | JSON list, default `[]` | SE1-3 |
| `latest_reply` | char 32, blank | Slack's, as last stored (SE1-4) |
| `started_by` | FK User, SET_NULL, null, `related_name="+"` | SE1-6 |
| `started_by_name` | char 150, blank | |
| `started_by_email` | char 254, blank | lower case |
| `url` | char 500, blank | `message_url(channel, thread_ts)` |
| `last_message_at` | datetime | newest stored message |
| `matched_by` | char 8: `channel`, `name`, `person`, `earlier` | |
| `external_shared` | bool, default false | the channel is shared outside the tenant at filing (SE1-17) |
| `synced_at` | datetime, null | |
| `created_at`, `updated_at` | datetime | |

Constraint `slack_conversation_once` unique on `(connector, thread_ts)` where `connector` is not null.
Index `slack_conversation_story` on `(customer, last_message_at)` and `slack_conversation_story_acct`
on `(account, last_message_at)`.

### 1.2 `agents.SignalThread.conversation` (`agents.0007_signal_thread_conversation`)

FK `customers.SlackConversation`, CASCADE, null, `related_name="+"`.

### 1.3 `connectors.UnmatchedItem.candidates` (`connectors.0007_unmatched_candidates`)

JSON list, default `[]` (SE1-9).

### 1.4 `agents.0008_slack_tickets_to_conversations` (data, SE1-18)

Depends on 1.1 to 1.3 and the latest `metrics` migration.

## 2. Sync

`sync.sync_connector(connector)` sends a Slack connector to `sync_conversations(connector)`, which:

1. reads `known = {thread_ts: latest_reply}` of the connector's conversations;
2. calls `SlackProvider.fetch_threads(config, creds, known=known, now=now)` → `(threads, newest_ts,
   external_shared)`;
3. builds `names = naming.covered_names(connector)` once;
4. files each thread with `sync.file_conversation(connector, remote, names, now=now)` →
   `"created"`, `"updated"` or `"unmatched"`, inside the pass's transaction (each unmatched keep in
   its own savepoint, as today);
5. stores `sync_cursor`, `config["external_shared"]`, status, `last_synced_at` and
   `last_sync_note` exactly as `sync_connector` does for tickets (same `summary_line`).

A provider error marks the connector `error` as today. No classification runs for conversations.

`RemoteThread` (`providers/base.py`):

```python
@dataclass
class RemoteThread:
    thread_ts: str
    channel: str
    text: str  # the top message
    user_id: str
    user_name: str
    user_email: str  # lower case, "" when Slack gives none
    posted_at: datetime  # aware, UTC
    latest_reply: str  # "" when the thread has no replies
    #: Every message after the top one, oldest first, or None when replies
    #: were not fetched this pass (keep what is stored).
    replies: list[dict] | None
    url: str
```

Each reply dict: `{"ts", "user_id", "name", "text", "bot"}`.

## 3. The story (`GET /organizations/<id>/story/`, the account page's too)

- `group=conversations` and `source=slack` include `slack`; `counts.by_kind.slack` and
  `counts.by_group.conversations` count conversations under SE1-15.
- An item:

```json
{
  "id": 41,
  "kind": "slack",
  "source": "slack",
  "occurred_at": "2026-10-15T05:18:14+00:00",
  "all_day": false,
  "account": null,
  "title": "Hi team, our CSV exports have been failing since this morning, urgent.",
  "summary": "#all-alfiee · 2 replies",
  "actor": {"id": null, "name": "Mohd faiz"},
  "link": {"thread_id": null, "url": "https://slack.com/archives/C0CA7PPRP7A/p1792041415357099"},
  "replies": 2
}
```

`summary`: `#<channel_name>`, then `1 reply` / `<n> replies` when there are any. `actor`: the
member when `started_by` is set, else `started_by_name`. Search (`q`) reads `title`,
`started_by_name` and `channel_name`.

## 4. `GET /slack-conversations/<id>/`

`200`:

```json
{
  "id": 41,
  "record": {"type": "customer", "id": 29, "name": "Globex (QA)"},
  "channel": "#all-alfiee",
  "url": "https://slack.com/archives/C0CA7PPRP7A/p1792041415357099",
  "title": "Hi team, our CSV exports have been failing since this morning, urgent.",
  "started_by": {"id": null, "name": "Mohd faiz"},
  "matched_by": "name",
  "messages": [
    {"ts": "1792041415.357099", "name": "Mohd faiz", "at": "2026-10-15T05:16:55Z", "text": "Hi team, …", "bot": false},
    {"ts": "1792041500.000100", "name": "alfiee", "at": "2026-10-15T05:18:20Z", "text": "Logged as KAN-2.", "bot": true}
  ]
}
```

`404 {"detail": "Not found."}` when there is no such conversation in the reader's workspace, the
reader may not open its record (`scoping.can_open`), or `visible_conversations` refuses it (all
three read the same, SOC2 AUTH-02). `matched_by` words for the page: `channel` "Filed under
<record> because the channel is set to it.", `name` "Filed under <record> because the message names
it.", `person` "Matched to <record> by hand.", `earlier` "" (the frontend shows nothing).

## 5. Connect (`POST /connectors/<id>/connect/`)

Unchanged except SE1-17. The form's help text becomes "Invite the bot to the channel first. Leave
the token blank to sign in with Slack when it is set up on this deployment."

## 6. "Needs a customer" (R2-D3 §3, changed)

- `GET /work/unmatched/` rows gain `mentioned` (SE1-12). A Slack row: `number` `"#all-alfiee"`,
  `can_add_contact: false`, `priority: "medium"`.
- `POST /work/unmatched/<id>/match/`:

```json
{
  "record": {"type": "customer", "id": 29, "name": "Globex (QA)"},
  "ticket": null,
  "conversation": {"id": 41},
  "contact_added": false
}
```

  A Jira row answers as today plus `"record"` (the same as `ticket.record`) and
  `"conversation": null`. New refusal, after R2-D3 row 4 and before row 5: a Slack row with
  `add_contact: true` → `400 {"add_contact": ["A Slack message is from a colleague. Match it
  without adding a contact."]}`. Row 7 (GONE) also when a conversation for the row exists.
- Dismiss: unchanged.

## 7. Agents

- `slack.reply` payload: `conversation_id` replaces `ticket_id` (every other key unchanged). A step
  proposed before the migration and migrated (SE1-18) reads the same.
- `GET /agents/bundles/…` previews are unchanged (`preview.slack` reads the payload's channel).
- The prompt's `slack.reply` rule reads "A slack.reply is posted in the conversation's Slack
  thread when a person runs it: it cites only the conversation."

## 8. Privacy (spec §3.6, SOC2 AUTH-02)

- A conversation is read only through `visible_conversations` after its record's scope: the story,
  the detail route, counts and search. Agents read only filed conversations, routed as today
  (`routing.route`, `may_read_source`).
- `mentioned` names only records the reader may open (SE1-12).
- Kept text is minimised (SE1-3); `started_by_email` is never in a payload.

## 9. Audit

| Event | Actor | Target | Metadata |
|---|---|---|---|
| `conversation.matched` | user | SlackConversation | `item`, `provider` (`slack`), `connector`, `record` `{type, id}`, `contact_added` (`false`) |

## 10. Query ceilings

Pinned by tests (SE1-19) and written into `docs/API_CONTRACTS.md` and "Changes during the build".

## 11. Not in this delivery

The escalation bundle, account team, department heads, `Ticket.conversation`, the Jira remote link,
reply placeholders (D2, D3); several channels per connection; DMs; reading files or reactions;
classifying conversations.

## 12. Owner set-up and live checks (Alfiee, dev DB org 4)

- Settings › Connections › the Slack connection "Slack" (id 7) › **Choose its customer**: leave it
  on "Any customer the message names" for the live checks.
- After the merge and `migrate`: delete the QA contacts `faiz.jamal10@gmail.com` (Globex (QA)) and
  `jeshsanghvi20@gmail.com` (Initech (QA)), added only for the old poster-email rule.
- **LC-D1a** After `migrate`, SL-15357099 shows under Globex (QA) › Story › Conversations as a Slack
  thread, not under Tickets; bundle 23 still opens in Work.
- **LC-D1b** Faiz posts "Initech's login is broken" in `#all-alfiee`; after a sync it is filed under
  Initech (QA) ("Filed under Initech (QA) because the message names it."); a reply in that Slack
  thread shows in the same conversation after the next sync.
- **LC-D1c** A message naming no customer waits in "Needs a customer" (Customer Success queue, or
  Unassigned when the connection has no department) with no "Mentioned"; matching it to Globex (QA)
  makes a conversation and, at the next due agent run, a bundle.

## Changes during the build

The build records here every change to this contract (with the measured ceilings), and relays each
to the frontend controller.

1. **SE1-4, reply fetch order (backend-internal).** Threads whose conversation is already stored are fetched first, then new threads, oldest first within each; the cap of 50 is unchanged. Frontend impact: none.
2. **Section 2, `sync.file_conversation` returns `(outcome, conversation)`.** The outcome is `"created"`, `"updated"` (stored data changed), `"unchanged"` (not counted in the sync note) or `"unmatched"`. Frontend impact: none, except that the connection's `last_sync_note` no longer says "N updated" for threads that did not change.
3. **SE1-16, the Copilot count line** now reads "(emails, notes, tasks and Slack threads are not counted)". The story queries are pinned +2 each (organisation story build 24 to 26, organisation story endpoint 28 to 30, organisation grounding 42 to 44, account grounding 34 to 36). The older quotes of the count line in `docs/API_CONTRACTS.md` (around lines 6071 and 6244) are superseded by this wording. Frontend impact: none.
4. **Section 3, a Slack story item whose conversation has a blank `channel_name`** has summary "Slack" (instead of "#"). Frontend impact: none (the string is shown as is).
5. **SE1-19, measured ceilings.** `SLACK_CONVERSATION_QUERIES` = 6 (the detail route); `SLACK_SYNC_QUERIES` = 35 (a pass of 3 threads, after computing the connection scope once per pass; it was 39 before); `UNMATCHED_LIST_QUERIES` 5 to 7 with Slack candidates (+2, one per record type, constant across rows); `THREAD_RUN_QUERIES` unchanged at 33 for a Slack thread. Frontend impact: none.
6. **Section 6, a Slack match answer's GONE check.** A row whose conversation already exists (or that loses the insert race) answers the existing GONE refusal (row 7). Frontend impact: none (the same refusal as today).
7. **SE1-19, the account story.** `services/account_story` (the account page's story) also gains the `slack` source: its query pin goes from 24 to 26. Frontend impact: none.
8. **`reactions:read` stays in the Slack `SCOPES`** though nothing reads reactions now (no new scope was added, and removing one would force every workspace to sign in again). Frontend impact: none.
9. **Slack tickets drop out of Communications and the health pulse** because they are no longer tickets. The loss of their effect on contact sentiment is accepted by the spec. Frontend impact: Slack no longer appears among a record's tickets; it shows in the Story as a Slack thread.
10. **`SlackConversation.external_shared` is set when the conversation is filed** (from the connection's `config.external_shared`, which is refreshed each pass); it is not updated afterwards.
11. **Copilot sharing covers Slack threads (SOC2 AUTH-02).** A shared Copilot reply that quotes or cites a Slack thread (record kind `slack`, from an organisation or account Ask digest) is checked against the thread's own rule (`visible_conversations`): a reader outside its department who is not Leadership gets the existing redaction. Copilot query pins unchanged. Frontend impact: none (the existing redacted reply).
12. **A Slack bundle's source block reads its conversation.** For a Slack thread, `source.from` is the poster's name (never an email), `messages` the stored message count, `link` the thread's Slack URL, `ticket` null. Same query count (joined in the existing read). Frontend impact: none in shape; the Work panel's source header shows the poster and the Slack link again.
13. **One thread's failed `conversations.replies` read no longer fails the pass.** That thread keeps its stored messages and `latest_reply` (it is read again next pass); a `ratelimited` answer (or HTTP 429) stops reading replies for the rest of the pass; a revoked token still fails the pass, and a failed `conversations.history` page still fails it as before. Logs carry the exception class name only. `users.info` is never called for an empty user id. Frontend impact: none (the connection stays Connected instead of showing an error).
14. **Only our own bot's posts are ours.** Connect (and a later agents consent) records `config.bot_id` and `config.bot_user_id` from `auth.test`. A reply read from Slack is stored with `ours` (true only for our bot) and its user id. Our bot's post reads "we wrote (<bot name>)" in the agent block and makes the thread answered; another app's reply (Jira Cloud, say) is stored under that app's own name, reads like a person's line, never answers the thread and, still not human, never wakes the agents. A message stored before `ours` is ours when its user id is the bot's, or when no identity is recorded (as before). The detail route's `bot` is unchanged (any bot's post). Frontend impact: the detail route's `name` for another app's reply is now that app's name (it was our bot's); the connector's `config` gains two id keys.
15. **"Also send to channel" replies (`thread_broadcast`) are kept** as ordinary replies. Frontend impact: such replies now appear in the detail route's `messages` and the story's reply count.
16. **The detail route filters by workspace itself** (the record's organisation, an account's through an `id IN` subquery), as defence in depth before the department and record checks; any refusal is the same 404. `SLACK_CONVERSATION_QUERIES` unchanged at 6. Frontend impact: none.
17. **A Slack connection's card counts its conversations.** The connector payload (`GET /connectors/`, `GET /connectors/<id>/`, and the sync answer) gains `conversation_count`; `last_record_at` also takes a conversation's last message day. Still one query for the list. Frontend impact: the Integrations card should show "N conversations" from `conversation_count` for Slack (its `ticket_count` is 0 now).
18. **Sync internals.** The connection's channel scope is read lazily (at most once a pass, only when a new thread needs filing), and each covered name's pattern is compiled once. `SLACK_SYNC_QUERIES` unchanged at 35 (the pin now also asserts the pass's outcome: 2 filed, 1 unmatched); no other ceiling moved. Frontend impact: none.
19. **A waiting `draft.reply` on a migrated Slack ticket** is pinned by a test: its ticket is gone, so it reads "changed" (expires) and cannot apply (`Stale`); nothing raises. Frontend impact: none (it was already hidden from every reader).
