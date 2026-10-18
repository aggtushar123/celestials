---
description: How an agent bundle's outside step (email reply, Slack reply, Jira create, assign and comment, with the Jira step acting as the person who runs it) runs, once, and how a tool is allowed to act.
---

# Agent outside actions flow

## Overview

A bundle's outside step writes to a tool outside Revenact only when a person presses Run (always Ask). Each tool is Read only or Can act per connection; each step carries an idempotency key, makes its one write last in its own transaction, and every Retry looks for an earlier write first.

## The flow

1. An admin allows a tool: `POST /api/v1/connectors/<id>/agents/` (`services/connectors/views.py:ConnectorAgentsView`, `set_agents`). Slack: the token's scopes are read (`SlackProvider.granted_scopes`); with `chat:write` the switch turns on; else Slack sign-in asks for it (`start_oauth(..., purpose="agents")`, the callback's `agents_consented`), or the admin pastes a token that holds it. Jira: `JiraProvider.my_permissions` must hold `CREATE_ISSUES` and `ASSIGN_ISSUES`. Audited `connector.agent_access`, only when the switch changes. Every connector OAuth start and its callback are bound to the starting browser (`core/oauth_browser.py`); another browser is refused and audited `connector.oauth_refused`.
2. The agents propose outside steps (`services/agents/outside/offered.py` decides which: an own Jira or Slack connector that is unusable is not offered, and Jira falls back to the workspace's oldest usable one, in which case `"issue": "source"` is refused; `evidence._thread` and `evidence._jira` fill the context; `prompt.outside_rules`), checked on the way out (`run._consider`: `internal_mentions` for text that leaves Revenact).
3. The panel shows each step's tool gate (`services/agents/outside/gates.py:blocked`): a disabled reason and a link to Settings > Connections; Jira pick lists come from `GET .../steps/<id>/options/<list>/` (`outside_views.py`, `outside/options.py`).
4. Run (`bundle_run.run_step`, per step, own transaction): rights, placeholders (never into customer text), staleness; the kind's `apply` checks the gate, on a Retry looks first (`tools.current().<tool>.find` with `keys.key_for` since `keys.since`), does its reads, then its one write (`tools.current().<tool>.send|post|create|assign`), audits `agent_outside.call` (`outside/trail.py`), and returns its result (`outputs`: `ticket_key`, `ticket_url`, `slack_ts`, `slack_url`, `email_id`). A mail send goes through `agent_send.send`, which calls `sync.send_via_provider` and then files its copy (`sync.file_sent`) best effort in a savepoint, so a filing failure never fails the step.
5. A refusal fails the step with a plain sentence (`outside/sentences.py`, `services/mail/agent_send.py`); no answer fails it "couldn't confirm"; both keep `attempted_at`/`attempted_by`, so the Retry looks back far enough.
6. The run's end tells the runner when any step failed (`failure_notice.tell`, `agent_step_failed`); a stuck run's settle does too. The notice goes to `bundle.run_by`, who pressed Run; a Retry by someone else does not change it, and an Auto bundle has no runner and no notice.
7. A `jira.comment` step (`services/agents/actions/jira_comments.py`) goes through the same tool gate (`jira.*`). The comment is internal (`sd.public.comment`) and ends with a footer carrying the step's ref. On a Retry it looks first, by that ref (`JiraTool.find_comment`, matching the ref and the footer's closing period), and the one write (`add_comment`) comes last. It is never proposed by the nightly pass.
8. An Outlook reply: `agent_send` asks `MicrosoftProvider.held` for the original by Message-ID and, when the mailbox holds it, replies through Graph's reply so the customer's client threads it; when it does not hold it (or the reply is gone), it falls back to `sendMail` with subject threading only.
9. A signature is added in one place, `services/mail/signing.py:signed`, for an agent reply and for a send without a draft. A draft carries its own signature (`html.restore_signature` keeps it whole when the draft is edited), so signing is never applied twice.
10. Who a Jira step acts as (`services/agents/outside/seats.py`, `services/connectors/jira_links.py`): the **runner's** own Jira link when it is `linked` and covers the connector's site (the link's site url host equals the connector's `config.host`); otherwise the connection's account, which the panel names (`preview.*.as`, `as_you`, `link`). A step run by someone else acts as the runner, never as its routed person. A `lost` link blocks the runner's Jira steps with "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot." (`gates.blocked`) and never falls back to the connection silently; while linking is off (no Atlassian env vars) every Jira step acts as the connection. The seat is resolved once per step after the gate and passed to every call of the step (lookups and the write); the result keeps `acted_as` and `jira_account`, and each `agent_outside.call` row carries `as`.
11. When a token is refreshed: Atlassian rotates refresh tokens, so every refresh stores the new pair at once. `run_bundle` and `retry_step` call `seats.warm(runner)` before any step transaction opens; a link expiring within 15 minutes is refreshed in its own committed transaction under `select_for_update`, so two runs never spend one refresh token and a step's rollback cannot lose it. Inline (inside a step) a refresh happens only when the token has expired anyway, past that 15-minute warm window; Atlassian's 10-minute reuse interval covers a rollback. Only `invalid_grant` (or `unauthorized_client` naming the refresh token) loses a link (`jira.link_lost`); any other refusal fails the step "Couldn't reach Atlassian to use your Jira link. Retry it." and keeps the link.
12. The Slack channel list (`services/agents/outside/slack_channels.py`): by default only the Slack connectors the reader may post through. With `live=1` it adds the channels the connector's bot is a member of (`users.conversations`, read through one connector per Slack workspace, cached 5 minutes, names only) that no Slack connector syncs (matched by channel id alone, legacy connectors without a stored team id included), filtered by `query`, at most 100 rows; a failed live read leaves the synced rows and sets `note`. A private unsynced channel is listed, chosen and posted to only by people with `manage_integrations` (the gate also blocks a step moved there by someone else). `channel_choice` (`"<pk>"` or `"<pk>:<channel id>"`) moves a step; an unsynced choice posts as a new top-level message, passes the out-check like every post, and is refused at run if a connector has since synced the channel.
13. A Slack reply (`services/agents/actions/slack_replies.py`) is proposed only on a filed Slack conversation: its payload holds `conversation_id` (no longer a ticket id), its target is `draft:conversation:<id>` (one reply per conversation, shared with nothing else), and it posts in that conversation's Slack thread (`thread_ts` is the conversation's). `current` is always `open`: nothing resolves a conversation. The offer reads `ctx.thread_slack` (`outside/offered.py`).

## Key Files

| File | Purpose |
|---|---|
| `services/agents/outside/tools.py` | The facade: `MailTool`, `SlackTool`, `JiraTool`, `Tools`, `current()`, `using()` |
| `services/agents/outside/keys.py` | The key `b<bundle>-s<step>`, the Jira label, the look-back window |
| `services/agents/outside/gates.py` | Whether a tool may be used now, for one person |
| `services/agents/outside/options.py` | Live pick lists |
| `services/agents/outside/seats.py` | Who a Jira step acts as: the runner's link or the connection; the warm before a run |
| `services/agents/outside/slack_channels.py` | The live Slack list: member channels, cache, the private rule, `channel_choice` |
| `services/agents/outside/offered.py` | Which outside kinds a thread or the nightly pass may propose |
| `services/agents/outside/trail.py` | `agent_outside.call` |
| `services/agents/actions/mail_replies.py` | `mail.send_reply` |
| `services/agents/actions/slack_replies.py` | `slack.reply` |
| `services/agents/actions/jira_issues.py` | `jira.create`, `jira.assign` |
| `services/agents/actions/jira_comments.py` | `jira.comment` |
| `services/mail/signing.py` | The one place a mailbox's signature is added |
| `services/mail/agent_send.py` | A reply from the runner's own Gmail or Outlook, found again by its header |
| `services/connectors/jira_links.py` | A person's Jira link: tokens, sites, the seat, refresh under lock |
| `services/connectors/link_views.py` | `GET/POST/DELETE /connectors/jira-link/` and its OAuth callback |
| `services/connectors/agent_access.py` | Can act: the switch, the grant, a working connection |
| `services/connectors/providers/slack.py`, `jira.py` | The vendor calls |
| `core/oauth_browser.py` | OAuth bound to the starting browser (connectors and mail) |
| `services/agents/failure_notice.py` | `agent_step_failed` |
