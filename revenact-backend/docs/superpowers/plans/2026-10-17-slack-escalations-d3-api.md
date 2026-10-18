# Slack escalations, delivery 3 ("Every public channel syncs", Events API): API contract

Backend plan: `docs/superpowers/plans/2026-10-17-slack-escalations-d3-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-17-slack-escalations-d3-frontend.md` (branch
`feat/slack-escalations-d3`). Spec: react-ts-app `docs/superpowers/specs/2026-10-15-slack-escalations-design.md`
**§16.1** and **§16.4** (the Events API revision, 2026-10-17), §3 (D1, which this delivery widens from one
channel to all), §10 (the D3 row), §11 (LC-D3a to LC-D3d). The D1 contract
(`2026-10-15-slack-escalations-d1-api.md`, as built in `docs/API_CONTRACTS.md`) still holds except where this
file changes it. Every path is under `/api/v1/`; every route is `IsAuthenticated` (401 without a token) and
JSON, **except** the Events endpoint (§3.3), which is public and proved by Slack's signature alone.

**Revision 2026-10-17 (owner approved): Slack pushes, we don't poll.** The first D3 contract written today
read up to 10 channels a pass with `conversations.history` / `conversations.replies`. Since 29 May 2025 Slack
limits apps that are commercially distributed but not in the Marketplace to **1 request a minute and 15
objects a call** on exactly those two methods (internal customer-built apps keep 50+ a minute and 1,000
objects; existing installs of older unlisted apps keep theirs; for a new install of our app the low limit
applies). Alfiee is B2B: every customer installs our app, so polling 10 channels a pass cannot work. Slack's
Events API delivers each message to us instead (§3.3); polling stays only as a slow catch-up (SC3-6).
Sources: docs.slack.dev changelog 2025-05-29 "Rate limit changes for non-Marketplace apps", 2025-06-03 "Rate
limits clarity", `apis/web-api/rate-limits`, `apis/events-api`, `reference/events/message.channels`,
`reference/events/url_verification`, `reference/events/channel_created`, `reference/methods/conversations.join`
(Tier 3), `reference/methods/conversations.list` (Tier 2, not in the restricted set),
`authentication/verifying-requests-from-slack`. Checked 2026-10-17.

**Migrations, D4 and the rebase.** D4 (`feat/slack-escalations-d4`, being built now) owns
`customers.0063_escalation_links` (`Ticket.conversation`, `SlackConversation.people`) and
`agents.0009_escalation_participants`. This delivery adds `connectors.0009_slackchannel`,
`connectors.0010_slack_channels_from_config` and **`customers.0064_slackconversation_channel_once`**, whose
dependency is D4's `0063_escalation_links`. D3's build starts from current `origin/main`, where `customers`
ends at `0062`: it generates its migration as `0063_slackconversation_channel_once` there. **Before its PR**,
if D4 has merged, D3 rebases onto `origin/main` and renames it to `0064_...` with
`("customers", "0063_escalation_links")` as its dependency (backend plan Task 10). If D4 has not merged, the
D3 PR body says: "When D4 (`customers.0063_escalation_links`) merges first, this PR's
`customers.0063_slackconversation_channel_once` becomes `0064` and depends on it." D4 also edits
`providers/slack.py` (`_replies`, `fetch_threads`) and `sync.py` (`_apply_thread`, `_READ_FIELDS`,
`file_conversation`); D3 replaces `fetch_threads` with `read_page` / `read_thread` / `thread_of` and adds
`reply_of`, so the rebase moves D4's behaviours into those (Task 10 lists each one). D4's shared-channel rule
reads a conversation's own `external_shared`; after D3 that flag comes from the channel row (SC3-12), and the
connection's `config["external_shared"]` is no longer written.

Merge order: this delivery's backend PR, then its frontend PR. What an old frontend sees between the two
merges: the Slack card's menu still offers "Choose its customer" (it PATCHes the connection's
`customer_ids`, which now only narrows the names the check looks for, SC3-8); the connect form no longer
asks for a channel (the server's `setup.fields` drive it); the new `slack_channels` key is ignored.

## What the merged code does today (backend main ccc5d8a; frontend main f44f679f)

**exists** = reuse as it is; **partial** = reuse and extend; **missing** = build. Line numbers are main's.

| # | Piece D3 needs | State | Evidence |
|---|---|---|---|
| 1 | A Slack connection is one channel | **partial** | `providers/slack.py:90-92` (setup field `channel`), `:129-159` (`connect` reads one channel, refuses one the bot isn't in), `:305`, `:369` (`config["channel"]` in `_replies` and `fetch_threads`); `views.ConnectorAgentsView._slack:333` and `exchange_code:184-186` pass the channel through OAuth |
| 2 | The workspace's public channels, with the bot's membership and Slack Connect | **missing** | `member_channels:249-276` lists only the channels the bot is in (`users.conversations`); nothing calls `conversations.list` |
| 3 | The bot joins a channel | **missing** | no `conversations.join`; `SCOPES:25-35` has no `channels:join` |
| 4 | Reading: 7 days of top messages (5 pages of 200), the replies of up to 50 moved threads (all pages) | **partial, must shrink** | `fetch_threads:363-425`, `_replies_of:345-361`, `_replies:290-343`: at 1 call a minute and 15 objects that is hours of calls a pass. Replaced by one history page and one replies page a pass (SC3-6) |
| 5 | Which customer: the connection's single record, else the name | **partial** | `sync._scoped:34-42`, `file_conversation:281-293` (`naming.find`); `naming.covered_names:39-68` |
| 6 | "Choose its customer" | **partial** | frontend `pages/integrations/ChannelCustomerForm.tsx` PATCHes the connection's `customer_ids` / `account_ids`; `components/integrations/WorkspaceToolRow.tsx:166` menu item |
| 7 | A conversation is unique per connection and thread | **partial** | `SlackConversation` constraint `slack_conversation_once` on (`connector`, `thread_ts`) (`customers/models.py:1870-1874`); two channels could share a ts |
| 8 | The agent thread's key | **partial** | `threads.touch_conversation:139` `external_id = f"{connector.pk}:{conversation.thread_ts}"` |
| 9 | Needs a customer for Slack | **partial** | `UnmatchedItem` unique on (`connector`, `external_id`); for Slack `external_id` is the ts (`sync._as_unmatched:214-230`); a match makes the conversation in `config["channel"]` (`unmatched._conversation_from:382-417`) |
| 10 | The shared flag | **partial** | per connection: `config["external_shared"]` from `conversations.info` each pass (`sync.py:342`) |
| 11 | A reply moved to another channel | **partial** | `agents/outside/slack_channels.py` (`synced_ids:42-52`, `synced_rows:55-66`, one row per connection); `actions/slack_replies._synced:142-151`, `_in_thread:66-70` |
| 12 | The connection's payload | **exists** | `serializers.ConnectorSerializer`, `views.with_ingested:49-67` (counts by annotation; a page costs one query) |
| 13 | Rights and audit for a connection's settings | **exists** | `CanManageIntegrations`; `connector.update` audit (`views.perform_update:137-151`) |
| 14 | Department and visibility | **exists, unchanged** | a conversation takes `connector.department` (`sync.py:306`) |
| 15 | The fast lane's Slack rule | **exists, unchanged** | `fast_lane.py:216-217` (`slack_connectors`: per connection, so every channel of it); 2-minute quiet window on the 5-minute `agents` tick |
| 16 | Frontend: the connect form | **exists** | `ConnectSourceForm.tsx` draws `setup.fields` |
| 17 | Slack's v0 signature over the raw body, 5-minute window, fail closed | **exists** | `slack_interactivity.verified:82-97` (`SLACK_SIGNING_SECRET`, `hmac.compare_digest`) used by `slack_interactivity_views.SlackInteractivityView` (#139) |
| 18 | Slack team id to its connections | **exists** | `slack_interactivity._team_connectors:100-110` (enabled, with credentials, `config__team_id`, by pk) |
| 19 | A public route's per-IP throttle | **exists** | `core/throttling._PerIPThrottle`, `SlackInteractivityThrottle` (scope `slack_interactivity`, 120/min) |
| 20 | Scheduled work | **exists** | no task queue by design; Cloud Scheduler posts `/api/v1/internal/tick/<task>/` (`core/ticks.py`): `tickets` (`sync_tickets`) every 10 minutes, `agents` (`run_agent_signals`, the fast lane) every 5; Cloud Run gives a request CPU only until it answers |
| 21 | A Slack thread wakes the agent | **exists** | `sync.file_conversation` calls `threads.touch_conversation` when a human message is new; `run_agent_signals` reads touched threads |

## Decisions narrowing the spec

| # | Decision | Cost if wrong |
|---|---|---|
| SC3-1 | **Scope.** One Slack connection covers every public channel of its workspace that it includes (SC3-2 to SC3-5). Messages arrive through Slack's Events API (SC3-7, SC3-23 to SC3-27); a slow catch-up reads what events missed (SC3-6). Each thread is filed by the channel's own customer or the name check (SC3-8); today's one-channel connections keep working (SC3-11); admins get the channel list with Sync on or off and each channel's customer, and see whether events arrive (SC3-15, SC3-30). Not here: private channels the bot isn't in, DMs, a department per channel, a fast-lane rule per channel. | Low. |
| SC3-2 | **`SlackChannel`** (§1.1), one row per channel of a connection, made by the listing (SC3-3), a `channel_created` event (SC3-5) or the first message event from a public channel it doesn't know (SC3-24). A connection's existing private channel (from `config["channel"]`, SC3-11) is a row too, `is_private`, and keeps syncing through the catch-up (we do not subscribe to `message.groups`); no other private channel is listed. | Low. |
| SC3-3 | **Listing, each pass** of the `tickets` tick (every 10 minutes): `conversations.list` (`types=public_channel`, `exclude_archived=true`, 200 a page, at most 5 pages: 1,000 channels). It is Tier 2 (20+ a minute) and not one of the two restricted methods. New channels become rows; a row's name, shared flag and membership follow Slack; a row Slack no longer lists is `is_archived` (kept, never read, not shown). A row whose bot membership Slack now reports as gone (`is_member` was true, the listing says false) gets `join_error` `"removed"`: somebody removed the bot, so it is not joined again until an admin changes that channel. A listing that fails for any reason but a revoked token leaves the rows as they are; a revoked token marks the connection as today. | Low: a workspace with over 1,000 public channels lists the first 1,000. |
| SC3-4 | **Included by default.** A new channel is included, except a Slack Connect one (SC3-12). A channel an admin never chose (`chosen_at` null) that **becomes** shared is excluded by the next listing; one an admin chose keeps their choice. | Low. |
| SC3-5 | **Joining.** Only with `channels:join` in the connection's granted scopes (`can_join`). (a) A `channel_created` event makes the row and joins it at once (one `conversations.join`, Tier 3, 2-second timeout). (b) Each pass joins at most 5 included, public, unarchived, not-shared channels the bot isn't in and has no `join_error`, oldest rows first. A refusal other than a rate limit stores Slack's code in `join_error` and is not tried again until an admin changes that channel; `ratelimited` stops joining for the pass and stores nothing. An admin may include a shared channel: it is joined like any other (Slack may refuse it). The bot only receives `message.channels` events for channels it is in, so a channel is filed from the moment it is joined. | Low. |
| SC3-6 | **The catch-up** (polling, slow on purpose). Per connection, per pass, **only when no catch-up call was made in the last 60 seconds** (`SlackChannel.asked_at`, any row of the connection): **one** `conversations.history` call and **at most one** `conversations.replies` call, each `limit=15`. (1) The channel: of the included, joined, unarchived rows, a walk in progress first (`walk_before` set), then never caught up (`read_at` null, by pk), then the longest since `read_at`. History reads `oldest` = the later of 7 days ago and `read_at` minus 2 minutes, `latest` = `walk_before` (blank: now). Every top message on the page is filed (SC3-8); `has_more` sets `walk_before` to the page's lowest ts, so the next catch-up continues below it; a page without `has_more` ends the walk: `read_at` = when the walk began (`walk_from`). (2) The thread: the oldest entry of any row's `missed` list (SC3-26), else the first thread on the page whose `latest_reply` moved past the stored one (stored threads only). `conversations.replies` with `oldest` = the stored `latest_reply` (blank for an unknown thread): the parent and up to 15 new replies, merged (SC3-27). `ratelimited` or 429 on either call ends the catch-up for the pass, storing nothing but `asked_at`; `not_in_channel` marks the row `is_member` false; any other refusal is the row's `read_error` code. With the 10-minute tick this is at most one history and one replies call per workspace every 10 minutes, within Tier 1. | Medium: with events off, a channel is caught up every (included channels × 10) minutes, and a burst of over 15 top messages takes one more pass per 15. Events are the main path; owner question 3. |
| SC3-7 | **The Events endpoint** `POST /connectors/slack/events/` (§3.3). Public (`AllowAny`, no authentication), proved by Slack's v0 signature over the raw body through the #139 verifier (`slack_interactivity.verified`: `SLACK_SIGNING_SECRET`, constant time, 5-minute window, no secret refuses all). Answers `url_verification` with `{"challenge"}`. After a valid signature it **always answers 200**, whatever it filed, so Slack never counts our own failures against the subscription (Slack turns a subscription off when over 95% of deliveries fail in 60 minutes). Slack's retries (`X-Slack-Retry-Num` 1 to 3, sent at once, after 1 minute and after 5 minutes when we were late or failed) are handled exactly like a first delivery: filing is idempotent by channel and ts (SC3-24, SC3-27), and a concurrent duplicate meets a row lock or the unique constraint. The retry number and reason are logged (numbers and Slack's reason word only). | Low. |
| SC3-8 | **Which customer** (spec §16.1 item 5). (1) The channel's own record (`SlackChannel.customer` or `.account`): `matched_by` `channel`; (2) else the name check (`naming.find`) over the records the connection covers; (3) else Needs a customer. The connection's own single record (D1 rule 1, `sync._scoped`) is no longer read for Slack: a connection's `customer_ids` / `account_ids` only narrow which names the check looks for and which records a channel may be set to (`covers`). | Low: the migration moves today's choice onto its channel (SC3-11). |
| SC3-9 | **A channel's record** must be in the workspace and covered by the connection (`connector.covers`); otherwise 400 (§3.2). Changing it never moves conversations already filed. | Low. |
| SC3-10 | **Keys carry the channel.** `SlackConversation` is unique on (`connector`, `channel`, `thread_ts`) (constraint `slack_conversation_once`, replaced); a Slack `SignalThread.external_id` is `"<connector id>:<channel>:<ts>"`; a Slack `UnmatchedItem.external_id` is `"<channel>:<ts>"` and its `number` the channel's `#name`. | None. |
| SC3-11 | **Migration** (`connectors.0010_slack_channels_from_config`, forwards only, noop backwards). For each Slack connection with `config["channel"]`: one `SlackChannel` (the id, `config["channel_name"]`, `is_member` true, `included` true, `is_private` when the id starts with `G`, `external_shared` from config, `read_at` = the migration's time so the catch-up does not re-read 7 days it already read); when the connection is set to exactly one customer or account (D1's "Choose its customer"), that record moves onto the channel and the connection's own list is cleared. Every Slack `SignalThread` of that connection gets the `"<id>:<channel>:<ts>"` key; every Slack `UnmatchedItem` gets the `"<channel>:<ts>"` key. `config["channel"]` stays (unused). In Alfiee: connection 7, `#all-alfiee` C0CA7PPRP7A. | Low: undoing D3 needs a hand-written reverse. |
| SC3-12 | **Slack Connect channels** (spec §16.1 item 8): listed with `shared` true (`is_ext_shared` in the listing; `is_ext_shared_channel` on an event's envelope for a row an event makes), **excluded by default**, never joined unless an admin includes one; a conversation in one has `external_shared` true (its channel's flag, refreshed whenever it is filed), so a reply there never carries a Jira key or link (decision 11; D4's rule). | Low: an escalation in a shared channel is not seen until an admin includes it. |
| SC3-13 | **Connect without a channel.** The Slack setup form is the bot token alone (or Sign in with Slack); `connect` checks the token (`auth.test`) and stores its scopes; the first pass lists the channels. Sign in with Slack asks for `SCOPES` (now with `channels:join`), plus `chat:write` when the connection already holds it (so approving the app again never drops posting). A `channel` sent by an old client is ignored. | Low. |
| SC3-14 | **Before the owner approves the app again** (`channels:join` missing): `can_join` false; the pass lists every public channel; events and the catch-up cover the channels the bot is already in (`#all-alfiee` for connection 7); Settings says "Slack hasn't let Revenact join channels yet. Approve the app again so it can; until then it reads only the channels it is already in." | None. |
| SC3-15 | **The channel list and the channel PATCH** (§3.1, §3.2), `manage_integrations` only, as every connection setting. | Low. |
| SC3-16 | **Audit** `slack_channel.update` (§5): ids and codes only, never a channel name. The listing, joins, events and catch-up reads are not audited (the sync's own work). | None. |
| SC3-17 | **The connection's payload** gains `slack_channels` (§2.1) from three subquery annotations (no join): the page still costs one query. | None. |
| SC3-18 | **Moving a reply to another channel** (agent bundles round 2 D2): every included, joined channel of a connection the reader may post through is a "synced" option, id `"<connection>:<channel>"` ("A new message"); the thread's own channel keeps the id `"<connection>"` ("This thread"); "Not synced" rows are the channels the bot is in that no connection includes. A step is in its thread when its connection **and** channel are the thread's. Payloads made before D3 (no `source_channel`) read as their thread. | Low. |
| SC3-19 | **Department and visibility are the connection's**, for every channel (D1 §3.6). | Low: a channel only Engineering should read needs its own connection; owner question 5. |
| SC3-20 | **The fast lane** keeps its per-connection rule: switching on a Slack connection covers all its channels. | Low. |
| SC3-21 | **Ceilings** (§6): pinned by tests, measured during the build, recorded in "Changes during the build". | Low. |
| SC3-22 | **Privacy.** Channel names and ids are workspace settings (Internal); no message text is stored on a channel or shown in the list. An event from an excluded channel, an unknown team or a channel type we don't file is dropped without storing anything. No log line carries message text, a channel name or a user id. Joining a channel posts Slack's own "joined" notice there (Slack's behaviour). | Low. |
| SC3-23 | **After the ack: file inline, the agent on its tick.** The endpoint files the message before it answers (a few queries; `users.info` for the poster or replier, 2-second timeout, then, after D4, at most 3 people the message mentions, none asked about once 1.5 seconds have passed since the event's handling began and each lookup's timeout ending by 2.5 seconds, the rest left to the catch-up); filing calls `touch_conversation` as today, and the agent runs on the next `agents` tick (5 minutes; the fast lane's 2-minute quiet window applies). Why: (1) there is no task queue by design; (2) on Cloud Run a request has CPU only until it answers, so work started after the response (a thread, `asyncio`) is not reliable; (3) filing is cheap and idempotent, while an agent run is many seconds of model time and must not sit in Slack's 3 seconds; (4) Gmail's push already syncs inline the same way (`MAIL_SYNC_ON_PUSH`). A request that runs past 3 seconds (a cold start) still finishes and files; Slack's retry then finds it filed. | Low: the agent answers within about 5 minutes, as with the fast lane today, instead of 10 to 15 with polling. |
| SC3-24 | **What a message event files** (the same rules as the catch-up, through shared helpers). Only `message` events with `channel_type` `channel` (or `group` for an existing private row), in an included, unarchived row of every enabled Slack connection in the envelope's `team_id` (§3.3). A **top message** (no `thread_ts`, or `thread_ts` = `ts`): no subtype, a user, text, no `bot_id`, and not ours (SC3-28): filed by SC3-8 (new conversation, or Needs a customer). A **reply** (`thread_ts` ≠ `ts`; subtype none, `bot_message` or `thread_broadcast`; text): appended to its stored conversation (SC3-27); our bot's reply is stored with `bot` and `ours` true and never wakes the agent (as D1's poll stored it); another app's reply is stored with `bot` true; a reply posted as a person through our app is stored with `via_app` true (D4's rule: never wakes the agent). A reply to a thread that is waiting in Needs a customer is dropped (the catch-up re-reads its top); a reply to a thread we don't know is remembered (SC3-26). Every other subtype (joins, topic changes, file shares, `message_replied`) is ignored, as the poll ignored them. | Low. |
| SC3-25 | **Edits and deletes are honoured, quietly.** `message_changed`: the stored message with that ts gets the new text (the top's title follows); `message_deleted`: a stored reply is removed; a stored top message's text becomes "This message was deleted."; a top waiting in Needs a customer is forgotten. Neither wakes the agent or creates a conversation. | Low: a meaningful edit ("actually, Jesh takes it") reaches the agent only with the next new message; owner question 2. |
| SC3-26 | **Missed events.** An event that can't be filed (a reply to a thread we don't know, or any error while filing) adds its thread ts to the row's `missed` list (at most 50, oldest dropped); the catch-up's one replies call reads the oldest one first (SC3-6), files it as any thread and drops it from the list; `thread_not_found` or `channel_not_found` drops it too. | Low. |
| SC3-27 | **Replies merge.** A stored thread's replies are merged by ts with what a read brings (a new ts is added, a known ts takes the new text); they are no longer replaced wholesale. `latest_reply` only moves forward. A reply deleted while no event arrived stays until an event says so. | Low. |
| SC3-28 | **Ours.** A message is ours when its `bot_id` or `user` is the connection's bot (`config.bot_id`, `bot_user_id`, from `auth.test`), when its `metadata.event_type` is `revenact_step`, or when its `app_id` is the envelope's `api_app_id` and it has no `bot_id` (a person's post made through our app). | Low: if Slack sends neither metadata nor `app_id` on a person's post through our app, that reply wakes the agent once (D4's intake already reads it as our answer). |
| SC3-29 | **Throttle**: per source IP, scope `slack_events`, `THROTTLE_SLACK_EVENTS` (default `1200/min`; Slack may send up to 30,000 events an hour per workspace, from few addresses). The only new setting; it has a default. | Low. |
| SC3-30 | **Events health.** `SlackChannel.event_at` is set by every event that reaches an included row; the connection's `slack_channels.events_at` is the newest one (a subquery). Settings shows "Events: receiving. The last one arrived 5 minutes ago." or "Events: not set up. Revenact checks one channel at each sync until they are." | Low. |
| SC3-31 | **Not changed here:** a Slack step's Retry looks its post up with `conversations.history` / `.replies` (`SlackProvider.find_message`, D3-11), now 15 objects and 1 a minute for a new install. Rare (a lost answer only); follow-up. | Low. |

## 1. Data

### 1.1 `connectors.SlackChannel` (`connectors.0009_slackchannel`)

| Field | Type | Notes |
|---|---|---|
| `connector` | FK `Connector`, CASCADE, `related_name="slack_channels"` | |
| `channel_id` | char 32 | Slack's id; unique with `connector` (`slack_channel_once`) |
| `name` | char 80, blank | without `#` |
| `is_private` | bool, default false | only a migrated private channel (SC3-2) |
| `external_shared` | bool, default false | Slack Connect (SC3-12) |
| `is_member` | bool, default false | the bot is in it |
| `is_archived` | bool, default false | Slack no longer lists it |
| `included` | bool, default true | synced; an admin's switch |
| `chosen_by` | FK `User`, SET_NULL, null | the admin who last changed `included` or the record |
| `chosen_at` | datetime, null | |
| `customer` | FK `customers.Customer`, SET_NULL, null, `related_name="+"` | the channel's record (SC3-8); at most one of the two (check constraint `slack_channel_one_record`) |
| `account` | FK `customers.Account`, SET_NULL, null, `related_name="+"` | |
| `join_error` | char 64, blank | Slack's code for a refused join, or `removed` (SC3-3, SC3-5) |
| `read_error` | char 64, blank | Slack's code for a refused catch-up read (SC3-6) |
| `last_message_at` | datetime, null | the newest top message the catch-up saw |
| `read_at` | datetime, null | the catch-up's watermark: every top message before it was read (SC3-6) |
| `walk_before` | char 32, blank | a catch-up walk in progress: read below this ts next |
| `walk_from` | datetime, null | when that walk began |
| `asked_at` | datetime, null | the last history call on it (the 60-second guard) |
| `missed` | JSON list of ts, default `[]` | threads to read (SC3-26), at most 50 |
| `event_at` | datetime, null | the last event that reached it (SC3-30) |
| `created_at`, `updated_at` | | |

### 1.2 `SlackConversation` (`customers.0064_slackconversation_channel_once`, after D4's `0063_escalation_links`)

Constraint `slack_conversation_once` becomes unique on (`connector`, `channel`, `thread_ts`) where `connector` is
not null. No column changes.

## 2. Shapes

### 2.1 Connector (connectors contract), one new key

```json
"slack_channels": {"synced": 12, "total": 14, "can_join": true, "events_at": "2026-10-17T09:31:02Z"}
```

`null` for any other provider. `total`: public rows not archived (a kept private channel, `private: true`, is listed in §3.1 but never counted); `synced`: those included; `can_join`:
`channels:join` is in the granted scopes; `events_at`: the newest `event_at` of its rows, `null` when no event
ever arrived. `setup.fields` for Slack is the bot token alone; `setup.help` reads "Revenact reads every public
channel and joins new ones itself once Slack allows it. Leave the token blank to sign in with Slack when it is set up on
this deployment."

### 2.2 Channel row

```json
{"id": "C0CA7PPRP7A", "name": "all-alfiee", "included": true, "member": true, "shared": false,
 "private": false, "record": {"type": "customer", "id": 29, "name": "Globex (QA)"},
 "conversations": 12, "join_error": "", "read_at": "2026-10-17T09:30:00Z", "chosen_by": {"id": 1, "name": "Tushar Aggarwal"}}
```

`record` null when the name check files its messages; `conversations` the count filed through this channel;
`read_at` the catch-up's watermark, null when never caught up; `chosen_by` null when nobody changed it.
`join_error` `"removed"` means somebody removed the bot from it.

## 3. Routes

### 3.1 `GET /connectors/<id>/slack-channels/`

`200 {"channels": [Channel row], "can_join": bool, "synced": n, "total": n, "events_at": iso | null}`, every
channel not archived, by name. `synced` and `total` count public rows only, as in §2.1: a kept private
channel is still a row in `channels` but is not counted. Refusals:

| # | Case | Status | Body |
|---|---|---|---|
| 1 | no token | 401 | DRF's |
| 2 | not `manage_integrations` | 403 | DRF's permission body |
| 3 | not a connection of the reader's workspace | 404 | DRF's `{"detail": "No Connector matches the given query."}` |
| 4 | not Slack | 409 | `{"code": "NOT_SLACK", "detail": "Only a Slack connection has channels."}` |

### 3.2 `PATCH /connectors/<id>/slack-channels/<channel id>/`

Body: `{"included": bool}` and/or `{"record": {"type": "customer" | "account", "id": n} | null}`.
`200` the Channel row. Refusals, in this order (refusals 1 to 4 as §3.1):

| # | Case | Status | Body |
|---|---|---|---|
| 5 | no such channel on this connection (or archived) | 404 | `{"code": "NO_SUCH_CHANNEL", "detail": "No such channel."}` |
| 6 | neither key | 400 | `{"detail": "Change whether it syncs, or its customer."}` |
| 7 | `included` not a boolean | 400 | `{"included": ["Choose on or off."]}` |
| 8 | `record` not null and not `{type, id}` with a known type and a whole id | 400 | `{"record": ["Choose an organisation or an account."]}` |
| 9 | the record isn't in the workspace | 400 | `{"record": ["No such organisation."]}` ("No such account." for an account) |
| 10 | the connection doesn't cover it | 400 | `{"record": ["Globex (QA) isn't covered by this Slack connection."]}` |

A change sets `chosen_by` and `chosen_at`, clears `join_error` (including `removed`) and `read_error`, and
writes `slack_channel.update` (§5) when something changed. Nothing filed moves.

### 3.3 `POST /connectors/slack/events/` (public; Slack's Events API request URL)

No authentication. Headers read: `X-Slack-Signature`, `X-Slack-Request-Timestamp` (both required),
`X-Slack-Retry-Num`, `X-Slack-Retry-Reason` (logged only). The raw body is verified before it is parsed.

| # | Case | Status | Body |
|---|---|---|---|
| 1 | signature missing, wrong, older than 5 minutes, or `SLACK_SIGNING_SECRET` empty | 401 | empty |
| 2 | throttled (per IP) | 429 | DRF's |
| 3 | body not JSON, or not an object | 400 | empty |
| 4 | `{"type": "url_verification", "challenge": "..."}` | 200 | `{"challenge": "<the same string>"}` (`application/json`) |
| 5 | `{"type": "event_callback", ...}` | 200 | empty; filed as SC3-24 to SC3-26 (or nothing, SC3-22) |
| 6 | any other `type` (`app_rate_limited` is logged) | 200 | empty |

The envelope fields read: `team_id`, `api_app_id`, `is_ext_shared_channel`, `event`. The `event` kinds handled:
`message` (with the subtypes of SC3-24, `message_changed` and `message_deleted`), `channel_created`. Any
other kind: 200, nothing.

## 4. Sync (internal, for the record)

Per pass (`sync.sync_conversations`, the `tickets` tick): list (SC3-3, SC3-4), join (SC3-5), and, when due, the
catch-up (SC3-6, SC3-26): one history page, one thread. Each filed thread goes through `file_conversation`
(SC3-8, SC3-10, SC3-12, SC3-27). Per event (`slack_events.handle`): the team's connections, the row, then
SC3-24 / SC3-25 / SC3-26.

## 5. Audit

| Event | Actor | Target | Metadata |
|---|---|---|---|
| `slack_channel.update` | the admin | the connection | `channel` (the row's id), `changes`: `{"included": {"old", "new"}}` and/or `{"record": {"old", "new"}}` with records as `"customer:29"` / `"account:7"` / null |

## 6. Query ceilings (SC3-21)

| Pin | Before | As built | Why |
|---|---|---|---|
| `SLACK_CHANNELS_QUERIES` (`connectors/tests/test_slack_channel_views.py`: the list for 2 channels, then 7) | | **7** | the user, membership, role and organisation reads; the connection; its rows with their records and `chosen_by`; the conversation counts. The same for any number of channels |
| `CONNECTOR_LIST_QUERIES` (`GET /connectors/`, 1 or 4 Slack channels) | 5 | **5** | the channel counts and `events_at` are subqueries inside the page query |
| `SLACK_EVENT_REPLY_QUERIES` (`connectors/tests/test_slack_events.py`: one signed reply event into a stored conversation, author known) | | **15** (14 before D4) | the team's connections, the row and its `event_at`, the conversation, a savepoint with its lock and read, the members who linked Slack (D4's people), the save, the waiting row's delete, the touch (connection, organisation, agent thread lookup and update), the release |
| `SLACK_SYNC_QUERIES` (`customers/tests/test_slack_queries.py`: one channel, three threads) | 38 (D4) | **44** (42 before D4) | Task 4's and Task 10's entries below |
| `SLACK_OPTIONS_QUERIES` (`agents/tests/test_slack_live_channels.py`: the reply's channel options) | 4 | **5** | the one `SlackChannel` read for the included channels |

## 7. Not in this delivery

Private channels the bot isn't in, DMs, `message.groups` events, a department or a fast-lane rule per
channel, reading more than 1,000 public channels, archives older than 7 days. Retry's lookups under the new
limits (SC3-31). A Slack Marketplace listing (owner question 4). The escalation bundle, decided in the thread
(D4).

## 8. Owner set-up and live checks (spec §11)

**Where the live check runs.** Slack must reach the Request URL over the internet; the dev server on this Mac
is not reachable. Use the deployed backend on Cloud Run:
`https://revenact-web-605430842839.asia-south1.run.app/api/v1/connectors/slack/events/` (nginx passes
`/api/` to Django). A tunnel to a local server would work too, but a Slack app has **one** Request URL, so it
would take events away from the deployment while it is set; recommended only if the deployment is down. The
local by-eye check posts signed fake events instead (frontend plan Task 5).

**Set-up, once, in the Slack app's settings (api.slack.com/apps › the app):**
1. **Event Subscriptions** › Enable Events: on. **Request URL**: the URL above. Slack sends `url_verification`
   at once and shows "Verified" (the deployment's `SLACK_SIGNING_SECRET` must be the app's Signing Secret, from
   Basic Information › App Credentials; it is already in Secret Manager as `slack-signing-secret`).
2. **Subscribe to bot events**: `message.channels` (needs `channels:history`, already granted) and
   `channel_created` (needs `channels:read`, already granted). Save Changes.
3. **OAuth & Permissions** › Bot Token Scopes: add `channels:join`.
4. **Reinstall the app** to the workspace (Slack asks after a scope change), then in Revenact: Settings ›
   Connections › Slack › Reconnect › Sign in with Slack (or paste the new bot token) so the connection holds
   the new scope.

- **LC-D3a** After the deploy and the migration, before the set-up: connection 7 still reads `#all-alfiee`
  (catch-up) and its conversations keep working; Choose channels lists every public channel, `#all-alfiee`
  included and synced; Settings says "Events: not set up".
- **LC-D3b** After the set-up: a message in `#all-alfiee` naming Globex is under Globex (QA) within seconds
  (refresh the page), and Settings says "Events: receiving".
- **LC-D3c** Create `#alfiee-escalations` in Slack: it is joined within seconds with no invite (the
  `channel_created` event); a message there naming Globex is filed under Globex (QA).
- **LC-D3d** Exclude `#random`: messages there are not filed. Set `#alfiee-escalations` to Globex (QA): a
  message there naming no customer is filed under Globex.

## Changes during the build

The build records here every change to this contract (with the measured ceilings), and relays each to the
frontend controller.

- **Task 4, `SLACK_SYNC_QUERIES` re-measured: 36 to 42** (`services/customers/tests/test_slack_queries.py`,
  one channel, a pass of three threads: two filed by name, one waiting). The 42: the channel rows; the
  once-a-minute check; the covered names (5, as before); the picked row's `asked_at`; per filed thread a
  savepoint pair, the conversation lookup, the named customer, the poster (the linked members once a pass),
  the insert, the waiting row's delete, the agent thread's lookup and insert in its own savepoint; the
  waiting thread's savepoints, lookup, count and insert; the row's watermark; the stored threads' marks;
  the connection's save. No `conversations.info` any more. No API shape changes; no frontend impact.
- **Task 4, R6:** a catch-up thread read Slack refuses with any code but a rate limit sets the row's
  `read_error`, and a missed thread leaves `missed` (not only `thread_not_found` / `channel_not_found`), so
  it never blocks the queue; `not_in_channel` also sets `join_error` `removed` (SC3-3). A listing that shows
  the bot back in a `removed` channel clears `join_error`. No frontend impact.
- **Task 6, `SLACK_EVENT_REPLY_QUERIES` measured: 14** (`services/connectors/tests/test_slack_events.py`, one
  signed reply event into a stored conversation, author known): the team's connections; the channel row and
  its `event_at`; the stored conversation; a savepoint, its row lock and the read inside `file_conversation`;
  the save; the waiting row's delete; the connection and its organisation (the fast lane) for the touch; the
  agent thread's lookup and update; the savepoint's release. §3.3 unchanged; the unsigned retry headers are
  logged as digits and Slack's reason word only, and a body over Django's 2.5 MB limit is refused 400 before
  the signature check. No frontend impact.
- **Task 7, query pins measured:** `GET /connectors/<id>/slack-channels/` is 7 queries (the user, membership, role and organisation reads; the connection; its channel rows with records and `chosen_by`; the conversation counts), the same for 2 or 7 channels. `GET /connectors/` stays 5 for 1 or 4 Slack channels (the channel counts and `events_at` are subqueries inside the page query). `with_ingested` keeps its joined Counts and adds three subquery annotations. §3.1, §3.2, §2.1 unchanged. No frontend impact.
- **Task 8, options pin measured:** `SLACK_OPTIONS_QUERIES` 4 to 5 (the one `SlackChannel` read for the included channels), warm or cold cache, same for any number of channels. Options route is `/steps/{}/options/slack_channels/`; option ids `<connection>` (this thread) and `<connection>:<channel>`; a `connector_id` edit to a connection other than the source is refused 400 `Choose a Slack channel from the list.`. A `slack.reply` payload gains `source_channel` and `source_channel_name`. No frontend impact.
- **Task 8b, counts and help copy (frontend PR by-eye check):** `slack_channels.total` / `synced` in §2.1 and
  `total` / `synced` in §3.1 count public rows only (`is_private=False`); a kept private channel still appears in
  the §3.1 `channels` list but is in neither count. `setup.help` now reads "Revenact reads every public channel
  and joins new ones itself once Slack allows it. Leave the token blank to sign in with Slack when it is set up
  on this deployment." No query pin moved. Frontend impact: its copy and counts already expect this.
- **Task 9, schema and the journey:** `SlackEventsView` and `SlackInteractivityView` are described for the
  OpenAPI schema (`@extend_schema`, operation ids `slack_events` and `slack_interactivity`, an untyped JSON
  object in and out, `auth: []`), so `manage.py spectacular` no longer drops either view; the channel record's
  `type` enum is named `RecordTypeEnum` (`ENUM_NAME_OVERRIDES`). `.env.example` documents
  `THROTTLE_SLACK_EVENTS=1200/min`. §6 now holds every pin as built. The end-to-end journey
  (`e2e/test_slack_channels_flow.py`) covers LC-D3a to LC-D3d against the fake Slack and signed events. No
  status, shape or code change. Frontend impact: none (a generated client sees the two public routes'
  operation ids).
- **Final review fixes (F1 to F8).** No status, shape, error code or field changes; every query pin unchanged
  (`SLACK_SYNC_QUERIES` 42, `SLACK_EVENT_REPLY_QUERIES` 14, re-measured after the lock below).
  - **F1, refines SC3-6 (owner decision):** a row whose read Slack refused goes after every other row only for
    15 minutes (`READ_RETRY`) after its last try (`asked_at`), then ranks as any other row. A refused read,
    history or replies, now stamps the row's `asked_at`, so a replies refusal on a row the catch-up did not pick
    is timed too. `history_due` (the 60-second guard) is unchanged.
  - **F2, refines SC3-26 (owner decision):** a reply to a thread we don't hold is remembered in `missed` only
    when the catch-up would keep it: a person's reply with text and a reply subtype. A bot's reply (`bot_id` or
    `bot_message`), our own post (SC3-28), an empty message or any other subtype is ignored. Replies to stored
    threads still store bot replies (SC3-24).
  - **F3:** `file_conversation` reads a conversation it already holds with `select_for_update`; all three
    callers (the event's top and reply, the catch-up's `_file`) are inside `transaction.atomic`.
  - **F4:** the channel PATCH saves only the fields it sets, so `event_at`, `missed` and a walk written meanwhile
    survive.
  - **F5, SC3-4 as built:** a pass never writes `included` back; a newly shared channel nobody chose is excluded
    by a conditional update (`chosen_at` null at write time), so an admin's choice made during the listing wins.
  - **F6:** new rows are created with `ignore_conflicts`, so a row an event made meanwhile (SC3-24) never fails
    the pass; the rows are re-read when the pass made or excluded any.
  - **F7:** each connection of the envelope's team files an event on its own; one connection's failure is logged
    (exception type only) and never drops the event for the others.
  - **F8, refines SC3-6:** `channel_not_found` on a catch-up read marks the row not a member (so it is no longer
    ready and uses no history calls under F1), without `join_error` `removed` (only `not_in_channel` sets that).
  - Frontend impact: none. Fewer stuck rows; a channel Slack can no longer find can show `member: false` with an
    empty `join_error` until a listing archives it.
- **Task 10, rebased onto D4 (#156, main 7f412aa).** Migrations: `customers.0064_slackconversation_channel_once`
  now depends on D4's `customers.0063_escalation_links`; `connectors.0010_slack_channels_from_config` depends on
  `0064` and still on `agents.0008` (it touches `SignalThread` only, which `agents.0009_escalation_participants`
  doesn't alter). D4's Slack sync behaviours live in D3's reads:
  - **The thread's people (SE4-24) on both paths.** The catch-up fills `RemoteThread.people` before filing:
    a page's tops (poster and mentions) and the one thread read (posters and mentions), through D4's
    `SlackProvider._people_of` with one lookup cache and one `MAX_PEOPLE` (30) count per catch-up; people a
    stored conversation already knows as members are not asked about again (D4's F11), read from the page's
    one stored-threads query (`thread_ts`, `latest_reply`, `people`), now read before filing (a thread filed on
    the page counts as moved when Slack shows replies, as before). The events path fills them too: a top
    message's poster, a reply's replier with the thread's stored posters, and at most `EVENT_LOOKUPS` (3)
    people the message mentions, each `users.info` within `EVENT_TIMEOUT` (SC3-23); the rest wait for the
    catch-up. An edit (SC3-25) that mentions someone the thread doesn't know adds them (at most 3 lookups,
    made before the row lock), still without waking the agent. `sync.merge_people` (D4's `_people`) folds them
    in on every filing and keeps no email; `_READ_FIELDS` holds `external_shared`, `channel_name` and `people`.
  - **The shared flag is the channel row's.** `file_conversation` keeps D3's `external_shared` from the
    `SlackChannel` row (D4's read of `connector.config["external_shared"]` is dropped); the reply's run-time
    check (`slack_replies._shared_now`, an `Exists` on the conversation's channel row in the same query) and the
    agent's thread facts (`evidence._thread`, one `exists()` only when the conversation's own flag is off) read
    the conversation's flag or its channel row's, never the connection's config.
  - **One rule for "ours".** `is_ours` (SC3-28) is the only implementation: D4's `_ours_by_key` top-message skip
    and `_via_app` mark are removed (both duplicated it: `is_ours` checks the same metadata `event_type`, plus
    our bot and the event's app id). Tests of record: `test_slack_channels_provider` (a page keeps only people's
    top messages; `reply_of` marks `via_app`) and `test_slack_catchup` (a reply made through our app wakes
    nothing, a person's does). D4's tests that called `fetch_threads` read through D3's reads.
  - **Pins:** `SLACK_SYNC_QUERIES` 42 to **44** (+2: each filed thread's people found by Slack email, D4's
    measured +2); `SLACK_EVENT_REPLY_QUERIES` 14 to **15** (+1: the members who linked Slack, read to resolve
    the thread's people); a Slack thread's agent run +1, the channel row's shared flag read once by the
    evidence while the conversation's own flag is off (`ESCALATION_RUN_QUERIES` 63 to **64**,
    `DECISION_RUN_QUERIES` 65 to **66**, `SLACK_THREAD_RUN_QUERIES` **34** against a ticket thread's 33). No
    `DISTINCT`, no per-message query.
  - **D4's tests on D3's routes:** its move tests name the other connection's channel (`"<connection>:<channel>"`,
    SC3-18; `connector_id` alone moves only within the source connection), and its end-to-end journey syncs
    in catch-up passes a minute apart (SC3-6).
  - Frontend impact: none in shape. Event-filed threads now carry `people`, so their mentions read as "@Name",
    their decisions and participants work as on D4, and an edit that names someone adds them.
- **Task 10 review fixes.** (1) SC3-23's bound as built: an event's people lookups share one time budget from
  the start of its handling (`slack_events.handle`, `time.monotonic`): the poster or replier is looked up first
  (2-second timeout); a mentioned person is asked about only while under `EVENT_ASK_UNTIL` (1.5 s) and at most
  `EVENT_LOOKUPS` (3) of them, each with a timeout of `min(2, EVENT_SPEND - spent)` (`EVENT_SPEND` 2.5 s), so
  every lookup has answered by 2.5 seconds (the poster's own lookup at most 2 s); the message is filed either way
  and the rest wait for the catch-up. (2) A reply no longer asks about someone the thread already resolved as a
  member (`known` is the stored conversation's resolved people). `SLACK_EVENT_REPLY_QUERIES` unchanged at 15.
  Frontend impact: none.
