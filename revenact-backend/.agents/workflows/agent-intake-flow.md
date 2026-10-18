---
description: How messages become agent bundles: sync touch, the interval run, routing, update or new, Refresh.
---

# Agent Intake Flow

Filed customer mail, every ticket connector (Zendesk, Freshdesk, Jira, webhooks) and Slack
conversations (since Slack escalations D1 a Slack thread is a conversation, never a ticket)
feed the CS and Sales agents. A conversation is read once it has been quiet for 15 minutes,
on the workspace's own interval, and the agent answers with a bundle of ready-to-run steps for
the record's owner, a department queue or the admins' Unassigned queue. Contract:
`docs/superpowers/plans/2026-10-13-agent-bundles-d2-api.md` (decisions D2-1 to D2-33).

## The Flow

1. **Sync touch.** `services/mail/sync.py file_message` and `services/connectors/sync.py
   file_ticket` call `services/agents/threads.py` (`touch_mail`, `touch_ticket`) inside the sync's
   own transaction. It makes or moves a `SignalThread` (`status="new"`, `last_message_at`
   forward only; an old first message is made `skipped`/`stale`). No model call, no settings read.
2. **Quiet.** `run_agent_signals` (`services/agents/intake.py`) marks threads whose newest
   message is under 15 minutes old `waiting_quiet`; they wait.
3. **Due and claim.** A workspace is due when `ai_signals_ran_at` is older than its
   `ai_signal_interval` (30m, 1h, 4h, 24h) minus 2 minutes; the run claims it with a
   compare-and-set so overlapping runs never both take it.
4. **Pick 25.** New messages, quiet for 15 minutes, unclaimed (or claimed over 15 minutes
   ago), oldest first, at most 25 per workspace; each is claimed with a conditional UPDATE.
5. **Gates.** Stale, source off, AI off, answered (mail we sent last) or resolved (ticket) are
   skipped with a reason and no call.
6. **Route.** `routing.py`: the record's owner when they may read the source (`owner`); else the
   connector's department (`department`); else a ticket goes to the admins (`admins`, Unassigned).
   Mail with no reader is skipped `no_reader`. Then the agent: tickets to CS; mail to Sales when
   the record has an open opportunity or an owner in Sales, else CS. Agent off is skipped
   `agent_off`; a used budget leaves the thread `waiting_credits`.
7. **Edited?** `intake_bundles.py`: the thread's waiting bundle was edited by a person, so no
   call; set `has_newer_message` and mark the thread processed (Refresh makes the call later).
8. **One call.** `evidence.build_for_thread` reads the newest 8 messages (600 characters each),
   the record filtered for the recipient, members, templates and rejected reasons;
   `prompt.thread_system` builds the prompt. One model call per thread, purpose `agent_<agent>`.
   Out of credits leaves the thread waiting; a failed call counts a failure (3 skip it).
   The context also says which outside kinds the thread offers (`outside/offered.py`, D3).
9. **Place.** Each step passes the nightly pass's checks (never Auto, the thread may be
   cited). No bundle: a new one. An untouched bundle: its waiting steps are replaced and it is
   re-dated. "Nothing to do": an untouched waiting bundle is superseded.
10. **Notify.** "Bundles waiting" to the owner, or to the department's or admins' readers. The
    Mine notice and the queue notice each run in their own transaction: one failing is logged and
    never undoes the other.
11. **Audit.** `agent_bundle.made` / `agent_bundle.refreshed` per bundle, one `agent_signals.run`
    per workspace run (counts only). A superseded bundle's audit counts nothing removed (the
    renumbering was rolled back).

Refresh suggestions (`POST /agents/bundles/<id>/refresh/`) runs steps 8 and 9 for one bundle on
a person's request: it keeps every edited step and the steps they name, appends the new ones, and
writes nothing (`409 BUNDLE_CHANGED`) if the bundle changed during the call.

## Round 2 delivery 3: unmatched items and the fast lane

- **Where an unmatched item is kept.** When `file_ticket` finds no customer or account for a Jira item, or `sync.file_conversation` finds none for a Slack thread, `services/connectors/unmatched.py:keep` stores it as a `connectors.UnmatchedItem` (a plain 2,000-character excerpt, the sender, a link) if the connector is on with credentials and its source is on, the item was not made by Revenact, was active in the last 7 days, is not resolved, is not from a workspace member (Jira only: a colleague's Slack message is kept, with the records it mentions as candidates), and the connector holds under 500 waiting. No `SignalThread` is made, so no model ever reads it.
- **Matched.** A person in the queue (the connector's department, or Unassigned for admins) matches it to a customer or account they can open that the connector covers (`POST /work/unmatched/<id>/match/`). That makes a Ticket with the connector's department, deletes the row and audits `ticket.matched`; the Ticket is touched like any synced ticket, so its thread joins the next run (or the fast lane). A later sync that matches the item does the same without a person.
- **Dismissed and purged.** Dismiss blanks the title, excerpt, sender name and sender email at once and leaves a tombstone (number, link, priority, department, external id and dates) so the item is never kept again. While the source still reports the item, a sync moves the tombstone's last-seen time and nothing else. `sync_tickets` deletes rows 30 days after they were last seen at the end of a full pass (`unmatched.purge`, audited `unmatched.purged`), so a tombstone goes 30 days after the item goes quiet.
- **How a thread becomes urgent.** At sync touch `fast_lane.for_ticket` / `for_email` store the first matching rule (`slack_channel`, `jira_priority`, `sender`, `word`, `poor_health`) as `SignalThread.urgent_rule`, only when the workspace's fast lane is on.
- **When the fast tick reads it.** `run_agent_signals` (every 5 minutes, `--lane fast` or `both`) calls `intake.run_fast`: per workspace with the lane on, claimed on `ai_fast_ran_at`, it reads urgent threads that have been quiet for 2 minutes, at most 10 a tick and within the hourly and daily caps (counted from `ModelCall.scope_key = "fast_lane"`, charged as agent calls). A thread waiting for credits or with a failed last read is left to the interval run. It is the same one call, evidence and routing as the interval run.

## Slack escalations delivery 1: the Slack pass and the Slack thread

- **The Slack pass.** Replaced by delivery 3 (below): a connection is every public channel, messages arrive by Slack's Events API, and the pass lists, joins and runs a slow catch-up. Slack threads are never tickets and are not classified.
- **Which customer.** Since delivery 3, the channel's own customer or account (`matched_by="channel"`), else exactly one covered record named in the top message (`naming.find`, `matched_by="name"`), else the thread is kept in Needs a customer with up to five candidates (colleagues' messages included; two similar names file nothing).
- **The touch.** `threads.touch_conversation` runs when a human message not stored before arrives (the bot's own reply never wakes it); a first sight whose newest human message is over 7 days old is skipped stale.
- **The thread block.** `evidence._thread` puts the conversation's newest 8 messages in `ctx.thread_lines` (`message <n>: from "<name>", <time>: "<text>"`, our own bot's as `we wrote (<name>)`, another app's under its own name like a person's) and fills `ctx.thread_slack`; `intake.answered` calls the thread answered when the newest stored message is our own bot's (`providers.slack.ours`: the message's `ours` mark, else its user id against the `config.bot_id` / `config.bot_user_id` recorded at connect, else any bot when none is recorded). A `slack.reply` step carries `conversation_id` and is posted in the Slack thread (`actions/slack_replies.py`, target `draft:conversation:<id>`); `draft.reply` is never offered on a conversation.
- **The fast lane.** `fast_lane.for_conversation` stores the rule from the connection, the poster and the newest human message.
- **Matching by hand.** A person's match of a Slack row in Needs a customer makes a conversation (`conversation.matched`), touched as new; no contact is added.

## Slack escalations delivery 3: how a Slack message reaches the agent

1. **Slack pushes the message.** Slack's Events API posts a signed `event_callback` to `POST /api/v1/connectors/slack/events/` (`services/connectors/slack_events_views.py:SlackEventsView`, public, `SlackEventsThrottle` per IP). The view checks Slack's v0 signature over the raw body (`slack_interactivity.verified`) before parsing, answers `url_verification` with its challenge, and answers 200 to every verified delivery (a retry is filed like a first delivery: idempotent by channel and ts).
2. **The connections and the row.** `services/connectors/slack_events.py:handle` takes every enabled Slack connection with credentials whose `config.team_id` is the envelope's. `_row` finds the `SlackChannel` (making one for an unknown public channel, excluded when shared), drops the event when the channel is excluded or archived, and stamps `event_at` (Settings' "Events: receiving").
3. **Filing.** A top message (no subtype, a user, text, not a bot, not ours) goes through `sync.file_conversation(connector, remote, names, channel=row)`: the channel's own record (`sync._pinned`, while the connection covers it), else `naming.find` over the covered names, else `unmatched.keep` (Needs a customer, key `"<channel>:<ts>"`). A reply merges into its stored conversation by ts (our bot's reply stored `ours`, another app's `bot`, a person's post through our app `via_app`); `message_changed` / `message_deleted` edit or remove a stored message (`sync.edit_message`, `delete_message`) and never wake the agent. A person's reply to an unknown thread, or any error while filing, adds the thread to the row's `missed` list (a bot's reply, our own post or another subtype to an unknown thread is ignored). Each connection of the team files on its own, and a stored conversation is filed under its row lock. `channel_created` makes the row and joins it at once (`slack_channels.join_missing`).
4. **The touch.** When filing stores a human message not seen before, `threads.touch_conversation` marks the agent thread (key `"<connector>:<channel>:<ts>"`) as due; the fast lane's rule is stored as before (`fast_lane.for_conversation`). Nothing else runs inside the request: there is no task queue, and Cloud Run gives a request CPU only until it answers.
5. **The agent runs on its tick.** `run_agent_signals` (the `agents` tick, every 5 minutes; the fast lane after 2 quiet minutes) reads the touched thread exactly as in delivery 1.
6. **The catch-up is the fallback.** Each `tickets` tick (`sync_tickets`), `sync.sync_conversations` lists the workspace's public channels (`slack_channels`: new rows, names, membership, Slack Connect excluded, archived rows), joins at most 5 when the connection holds `channels:join`, and, at most once a minute per connection (`asked_at`), runs `services/connectors/slack_catchup.py`: one `conversations.history` page of 15 on one channel (a walk below `walk_before`, `read_at` the watermark) and at most one `conversations.replies` read (the oldest `missed` thread, else a stored thread whose `latest_reply` moved). A channel whose read Slack refused waits behind the others for 15 minutes after that try (`slack_channels.READ_RETRY`); `channel_not_found` takes the bot out of the row. Each thread it reads is filed and touched through the same `file_conversation`.
7. **The thread's people (delivery 4, on both paths).** Filing folds the thread's people into `SlackConversation.people` (`sync.merge_people`: `{slack id: {name, member}}`, the member by Slack link, else by Slack email, which is never kept). The catch-up reads them with `SlackProvider._people_of` (posters and mentioned people, at most 30 new lookups a catch-up, members already known not asked again); an event brings the poster or replier and at most 3 mentioned people (`slack_events.EVENT_LOOKUPS`; none asked about after `EVENT_ASK_UNTIL`, 1.5 s from the event's start, and every lookup answered by `EVENT_SPEND`, 2.5 s; people the thread already resolved are not asked again); an edit that mentions someone new adds them. The decision and participant checks read these people. Our own posts are recognised by one rule, `providers.slack.is_ours`: a top message it matches never starts a thread, and a person's reply it matches is stored `via_app` and wakes nothing.

## Key Files

| File | Purpose |
|---|---|
| `services/agents/threads.py` | `touch_mail` / `touch_ticket`, `readable_threads`, `TICKET_SOURCES`, source labels and switches |
| `services/agents/intake.py` | `run_agent_signals`: due, claim, quiet, pick, gates, per-thread isolation, the workspace audit; `refresh` (Refresh suggestions) |
| `services/agents/routing.py` | Owner, department or Unassigned; which agent |
| `services/agents/intake_bundles.py` | `place`: new, replaced, superseded, flagged; `keep_set` for Refresh |
| `services/agents/evidence.py` (`build_for_thread`) | What the model reads, filtered for the bundle's recipient |
| `services/agents/prompt.py` (`thread_system`) | The thread prompt |
| `services/agents/bundle_run.py` | `save_step` (saved edits, worked out again under the lock), run, reject |
| `services/work/queue_bundles.py` | Department and Unassigned queues, `may_use`, the badge |
| `services/agents/management/commands/run_agent_signals.py` | The command; `--organisation <id>` for one workspace, `--lane interval|fast|both` |
| `services/connectors/unmatched.py` | Unmatched items: keep, list, match, dismiss, purge |
| `services/connectors/naming.py` | Names of the covered customers and accounts; finds the ones a Slack message names |
| `services/connectors/sync.py` (`sync_conversations`, `file_conversation`, `_pinned`, `edit_message`, `delete_message`) | The Slack pass and filing a Slack thread (both paths) |
| `services/connectors/slack_events_views.py`, `slack_events.py` | Slack's Events API: the signed public endpoint and what each event files |
| `services/connectors/slack_channels.py` | A Slack connection's channels: listing, defaults, joining, the catch-up's picks |
| `services/connectors/slack_catchup.py` | The slow catch-up: one history page and one thread a pass |
| `services/agents/fast_lane.py` | The fast lane's settings, rules and caps |
| `docker-compose.yml` (`agentsignals`) | A 300-second sleep loop running the command every 5 minutes (the production compose in `revenact-infra` needs the same service; it has none today) |

## Privacy Rules

- A message bundle and its steps are read only by readers of its source (mail: the mailbox
  owner and their chain; a ticket: its department's people and Leadership):
  `services/agents/bundles.py:unreadable_thread_bundle_ids`.
- The model reads only what the bundle's recipient may read; nothing from another record.
- Every step, title and reason passes the nightly pass's checks before it is stored; audit
  carries counts and keys, never message text.
- A message never applies anything on its own: its steps always wait for a person.
- Mail is personal: a mail thread is read only when the record's owner is the mailbox owner or
  above; otherwise it has no reader and is skipped.

## Failure Rules

- Each workspace runs in its own `try`; each thread places its answer in its own transaction.
- A failed model call leaves the thread due for the next run; after 3 failures it is `skipped`
  (`failed`). One failure never stops the others.
- Out of credits (agent budget or workspace) leaves threads `waiting_credits`; Settings › Agents
  says how many wait. Off means not read: a switched-off source or agent skips the thread.
- A message arriving during a call leaves the thread due again.

## Adding a Source

1. Add the connector provider to `Connector.Provider` and make its sync call
   `threads.touch_ticket` (a provider joins `TICKET_SOURCES` in `services/agents/threads.py`).
2. Add a `SourceKind` value in `services/agents/models.py` (a migration for the choices).
3. Add its label (the source line, Settings › Agents) in `threads.py` and the settings
   `signals.sources` list; sources default to on.
