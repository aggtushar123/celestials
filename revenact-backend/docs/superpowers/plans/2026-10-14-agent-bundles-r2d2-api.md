# Agent bundles, round 2 delivery 2 ("Act as the person"): API contract

Backend plan: `docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-frontend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-13-agent-bundles-design.md` §13 (§13.3 items B and C as revised on
this branch, §13.4, the R2-D2 row of §13.5, owner decisions 9 and 10 of §13.7). The D1, D2, D3 and
R2-D1 contracts (`2026-10-13-agent-bundles-d1-api.md`, `-d2-api.md`, `-d3-api.md`, `-r2d1-api.md`),
as merged (backend #114 to #117) and recorded in `docs/API_CONTRACTS.md`, still hold except where
this file changes them. Every path is under `/api/v1/`, every route is `IsAuthenticated` (401
without a token) unless it says otherwise, every body is JSON.

Merge order: this delivery's backend PR, then its frontend PR. The old frontend keeps working
against this backend: every change adds a kind of row, a key, a value, a query parameter or a
route; none removes or renames one. An old panel shows the Jira "as" line from `preview.*.as` (now
the person's own Atlassian name when they act as themselves), never asks for the live Slack list
(it is behind `live=1`), and edits a Slack step through `connector_id` as today. An old Settings
page shows no Jira link card.

## What R2-D1 left that this delivery builds on (read from the merged code, main 57f09de)

- `JiraProvider` (`services/connectors/providers/jira.py`) builds every URL as
  `https://<config.host>/rest/api/3/...` (`_url`) and authenticates with Basic auth from the
  connection's email and API token (`_headers`). `issue_url` / `comment_url` use `config.host`.
- `services/agents/outside/tools.py` `JiraTool`: every method takes a `connector` and calls the
  provider with `connector.config, connector.get_credentials()`. Pick lists go through
  `JiraTool.options`. There is no notion of who the call acts as.
- The three Jira kinds (`jira_issues.py` `CREATE`, `ASSIGN`; `jira_comments.py` `COMMENT`) preview
  `as` from `_as(connector)`: the connection's `account_name` (the API token's Atlassian name, e.g.
  "Jira Bot"). Their previews are not per reader (`Kind.per_reader` is False).
- `gates.blocked(step, reader)` checks, for Jira: the connector exists and is enabled, is usable,
  can act (the admin's switch and the grant). Nothing about the reader.
- `bundle_run.run_bundle` runs each step with `run_step` (one transaction per step);
  `bundle_run.retry_step` runs `run_step` **inside** an outer `transaction.atomic()`. A kind's
  `StepFailed` keeps its savepoint; any other exception rolls the step's transaction back.
- `services/agents/outside/options.py` `slack_channels` lists the **Slack connectors** the reader
  may post through (`slack_replies.channels`: enabled, can act, readable by the reader), each as
  `{"id": "<connector pk>", "name": "#support", "detail": "This thread" | "A new message"}`, and
  ignores `query`. `slack_replies.edit` accepts `connector_id` (an int, one of those connectors).
  `_in_thread(payload)` is `connector_id == source_connector_id`.
- `SlackProvider.SCOPES` (sign in with Slack) already holds `channels:read` and `groups:read`;
  `ACT_SCOPES` adds `chat:write`. A pasted bot token holds whatever its Slack app was given;
  `Connector.granted_scopes` stores what `auth.test` reported.
- `core/oauth_browser.py` binds an OAuth round trip to the starting browser (cookie + digest in
  the signed state). Used by the mailbox and connector callbacks.
- `services/connectors/providers/base.py` `ALLOWED_HOSTS = {"slack.com", "api.atlassian.com"}`:
  `auth.atlassian.com` (Atlassian's token endpoint) is not on it.
- `services/mail/agent_send.py` `blocked(connection)`: an Outlook row with `status=connected` and
  blank `credentials` is not blocked; its send then fails inside `_credentials` with a raw error
  (N1). A Gmail row in the same state is blocked (`two_way` false once its scopes are wiped).
- Frontend: a tool-blocked waiting step (`can_run: false`, `disabled_link` set) shows only the
  preview's 280-character excerpt; its full text (Slack message, Jira description, comment) is in
  `fields` but never drawn, so nobody can read what would be posted.
- Django's cache is LocMem in tests and DEBUG, Redis in production (`config/settings.py` `CACHES`).

## Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person will
notice. **Owner** marks a decision the owner should confirm before the build (spec §13.7); the plans
are written to it, and each is one small change if the answer differs.

| # | Decision | Cost if wrong |
|---|---|---|
| R2D2-1 | **Scope** (owner ruling, spec §13.1): Jira and Slack only in this delivery; Gmail and Outlook gain only the N1 gate fix. No tool for any other connector. Outside steps stay Ask. | None. |
| R2D2-2 | **The Jira link is optional** (**Owner**, decision 9). Anyone may link their own Atlassian account; nobody must. A person's Jira steps (create, assign, comment) act as them when their link covers the step's connector site; otherwise they act as the connection's account, and the panel names who. The admin's "Allow agents to act" switch still gates every Jira step either way. | Medium: if links should be mandatory, people with no Jira seat can't run Jira steps (one check in `gates.blocked`). |
| R2D2-3 | **One link per person, one person per Atlassian account.** `JiraLink` is one-to-one with the user; an Atlassian `accountId` may be linked by at most one person in a workspace (unique `(organisation, account_id)`): a second person linking it is refused. A person's Atlassian email need not equal their Revenact email. | Low: a shared service account can't be linked twice (that is the connection's job). |
| R2D2-4 | **Site matching by URL.** The link stores Atlassian's `accessible-resources` rows that carry a Jira scope: `{cloud_id, url, name}`. A link covers a connector when one row's `url` host equals the connector's `config.host` (`acme.atlassian.net`), compared lower-case. No extra call: `/_edge/tenant_info` is not used. Linking is refused when the account covers **none** of the workspace's Jira connectors' sites (nothing would ever act as them, so no token is kept). | Low: a custom Jira domain is matched by its `atlassian.net` host only (Jira Cloud keeps one). |
| R2D2-5 | **Calls as the person** go to `https://api.atlassian.com/ex/jira/<cloud_id>/rest/api/3/...` with `Authorization: Bearer <access token>`, through the same `JiraProvider` methods (a `Seat` carries the base URL and the auth). Issue and comment links stay `https://<host>/browse/...`. Lookups (a Retry's search by label or ref, the assignee read, the email match) and the pick lists use the same seat as the write, so lists show what the person may pick. | Low. |
| R2D2-6 | **Scopes** (classic): `read:jira-work write:jira-work read:jira-user offline_access`. Nothing administrative, no Confluence, no granular scopes. Live check: every call in §3.3 accepts them. | Low: a missing scope shows as a 401/403 on a step and is a one-line change. |
| R2D2-7 | **Tokens at rest**: `JiraLink.credentials` is Fernet-encrypted JSON `{access_token, refresh_token, expires_at}` (`services.mail.crypto`, as connector and mailbox credentials). Never serialised, never logged, never in an audit row. Atlassian rotates refresh tokens: every refresh stores the new pair at once. | None. |
| R2D2-8 | **Refresh before the run, never lost by a rollback.** Before any step transaction, `run_bundle` and `retry_step` call `jira_links.warm(runner)`: a link whose access token expires within 15 minutes is refreshed in its own committed transaction, under `select_for_update` (two runs never spend one refresh token). A step finding its token expired anyway (a run longer than 15 minutes) refreshes inline under the same lock; if that step's transaction then rolls back, Atlassian's 10-minute reuse interval lets the old refresh token be exchanged again. The pick lists refresh in their own transaction (no outer one). | Low: a rollback more than 10 minutes after an inline refresh loses the link (it reads as lost, R2D2-9). |
| R2D2-9 | **A lost link blocks; it never silently falls back** (**Owner**). When Atlassian refuses the refresh token (`invalid_grant`: revoked consent, a changed password, 90 days unused) the link becomes `lost`; every Jira step that person could run says "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot." with the Settings link, and Run is off for it. A link that merely can't reach Atlassian is not lost: the step fails "Couldn't reach Atlassian to use your Jira link. Retry it." | Medium: a person who ignores the message can't run Jira steps until they relink or unlink (two clicks). The alternative (fall back to the bot) would post under another name than the panel showed. |
| R2D2-10 | **The panel names who acts, per reader.** The three Jira previews become per reader: `as` is the reader's Atlassian name when their link covers the site, else the connection's; new `as_you` (bool) and `link` (`null`, `"none"`, `"other_site"`, `"off"`) say why. The frontend writes "Created in Jira as you (Carl Lee)" or "Created in Jira as Jira Bot", and under the bot line "Link your Jira account to act as yourself." when `link` is `"none"`. History keeps who acted in `result.acted_as` (`"person"` or `"connection"`) and `result.jira_account` (the name). | Low. |
| R2D2-11 | **Who sees whose link** (**Owner**). A link is its owner's alone: `GET /connectors/jira-link/` answers the caller's own link only; no route lists other people's links, admins included. An admin learns who linked from the audit log (`jira.link`, `jira.unlink`). A person's Jira steps run by someone else act as the **runner** (their link or the connection), never as the step's routed person. | Low: an admin who wants a "who has linked" list gets it later from the audit events. |
| R2D2-12 | **Unlink deletes the tokens** and tells the person to remove Revenact in their Atlassian account too ("To remove Revenact's access fully, also remove it under Connected apps in your Atlassian account."): Atlassian publishes no token revocation endpoint for 3LO apps (owner live check). A person deactivated or deleted: their link is deleted with the user (CASCADE) or unused (an inactive person runs nothing). Disconnecting the Jira connection leaves links alone (they are people's, not the connector's); they simply cover nothing until a connector for that site exists. | Low. |
| R2D2-13 | **The link's OAuth round trip** reuses `core/oauth_browser.py` (cookie `revenact_jira_link`, path `/api/v1/connectors/jira-link/`, 15 minutes) and the connectors' redirect base (`MAIL_OAUTH_REDIRECT_BASE`). The callback is public; its signed state (salt `connectors.jira_link`) names the user; it finishes only in the starting browser, for an active user, before the code exchange. It lands on `/integrations?jira_link=linked|error&detail=...` (the frontend keeps the query on its way to `/settings/connections`). | None. |
| R2D2-14 | **Audit** (SOC2 LOG-01): `jira.link` (a link made or replaced: `metadata {account_id, sites, scopes, replaced}`), `jira.unlink` (`reason: "person"`), `jira.link_lost` (`reason: "invalid_grant"`, actor the link's owner, no request), `jira.link_refused` (`reason`: `other_browser`, `no_site`, `taken`, `no_refresh`, `exchange`). `agent_outside.call` gains `as: "person"` or `"connection"` on every Jira call row. Never a token, a name or an email in metadata beyond the Atlassian account id. | None. |
| R2D2-15 | **The live Slack list** (**Owner**, decision 10). With `live=1` the options route adds the channels the bot of a Slack connector the reader may post through **is a member of** (Slack's `users.conversations`, which returns only member channels: no `is_member` filter, no `chat:write.public`), that no Slack connector in the workspace syncs. Rows read "Not synced" (public) or "Not synced, private". A private unsynced channel is listed, chosen and posted to only by people with `manage_integrations`. A channel some connector syncs appears only as that connector's row, and only to its readers, as today. | Medium: customer details could reach a wider channel; the admin rule and the out-check (D3-19) are the guards. |
| R2D2-16 | **Paging, cache, ceilings for Slack.** `users.conversations` `types=public_channel` (+`private_channel` when the token holds `groups:read`), `exclude_archived=true`, `limit=200`, cursor-paged, at most 5 pages (1,000 channels) per Slack workspace (`team_id`), read through one connector per workspace (the step's source first, else the lowest id). Cached per connector for 5 minutes (`agents:slack-channels:<id>`: `[{id, name, private}]`, no message text). The route filters by `query` (case-insensitive substring of the name, ≤ 100 characters) and answers at most 100 rows, synced first then by name, `more: true` when more matched. | Low: a workspace past 1,000 member channels lists the first 1,000 Slack returns; search covers only those. |
| R2D2-17 | **A live list that fails never empties the list.** The synced rows always answer; the live part, when Slack refuses or can't be reached, is replaced by `note`: "Slack didn't list its other channels. Try again in a minute." (busy, unreachable, other), or "Add channels:read to the Slack app to choose other channels." (`missing_scope`). Status stays 200. | Low. |
| R2D2-18 | **Choosing a channel** adds the editable key `channel_choice` to `slack.reply` (the option `id`: `"6"` for connector 6's synced channel, `"6:C0ESC"` for an unsynced channel through connector 6). `connector_id` stays editable for the old panel (ints only). An unsynced choice is checked against the cached list (read again when the cache is cold), stores `connector_id`, `channel`, `channel_name`, `channel_private`, `unsynced: true`, and posts as a new top-level message (never in the thread). | Low. |
| R2D2-19 | **N1: a mailbox with no credentials can't send.** `agent_send.blocked` answers `RECONNECT` ("Reconnect your mailbox to send this.") for any non-IMAP row whose `credentials` is blank, Outlook included, before the status checks. | None. |
| R2D2-20 | **A blocked step's text is readable** (frontend only, no API change): a waiting step blocked by its tool (`disabled_link` set) shows its full text fields read only, so a person sees what would be posted while the tool is fixed. A step blocked by rights (no `disabled_link`) keeps today's excerpt. | Trivial. |
| R2D2-21 | **Ceilings.** The page's Jira previews read the reader's link with one query per reader (`bulk.Bulk.jira_link(user)`); the gate and the run read it through the same helper. `OUTSIDE_DETAIL_QUERIES` and `OUTSIDE_HISTORY_QUERIES` may grow by at most 1 and stay constant in rows; `OPTIONS_QUERIES` (Jira) by at most 1; new pins `SLACK_OPTIONS_QUERIES` (live list, warm and cold cache equal) and `JIRA_LINK_QUERIES` (`GET /connectors/jira-link/`). No `DISTINCT`. | Low. |
| R2D2-22 | **Twice-filter unchanged.** Nothing new is sent to a model; a post to an unsynced channel passes the outside out-check (`internal_mentions`, D3-19) like every Slack post. | None. |

## 1. Data

### 1.1 `connectors.JiraLink` (`connectors.0005_jira_link`)

| Field | Type | Notes |
|---|---|---|
| `organisation` | FK Organisation, CASCADE | |
| `user` | OneToOne User, CASCADE, `related_name="jira_link"` | R2D2-3 |
| `account_id` | char 128 | Atlassian `accountId` |
| `name` | char 150 | Atlassian display name |
| `email` | char 254, blank | as Atlassian reports it; may be empty (privacy settings) |
| `credentials` | text | Fernet JSON `{access_token, refresh_token, expires_at}` (R2D2-7). Restricted. |
| `sites` | JSON list | `[{"cloud_id": "1122...", "url": "https://acme.atlassian.net", "name": "acme"}]`, Jira-scoped rows only |
| `scopes` | JSON list | what the token answer's `scope` held |
| `status` | char 8: `linked`, `lost` | |
| `linked_at` | datetime | |
| `refreshed_at` | datetime, null | last successful refresh |
| `lost_at` | datetime, null | |

Constraint `unique_jira_account_per_organisation` on `(organisation, account_id)`.

### 1.2 No other migration

`slack.reply` payloads gain optional keys (`channel_choice`, `channel_private`, `unsynced`); old
payloads read as synced. `AgentAction.result` gains `acted_as`, `jira_account` on Jira steps.

## 2. The Jira link routes

### 2.1 `GET /connectors/jira-link/` (any member)

```json
{
  "configured": true,
  "connectors": [{"id": 6, "name": "Jira", "host": "acme.atlassian.net"}],
  "link": {
    "name": "Carl Lee",
    "email": "carl@acme.io",
    "status": "linked",
    "sites": [{"url": "https://acme.atlassian.net", "name": "acme"}],
    "covers": [6],
    "linked_at": "2026-10-14T09:12:00Z"
  }
}
```

- `configured`: `ATLASSIAN_OAUTH_CLIENT_ID` and `ATLASSIAN_OAUTH_CLIENT_SECRET` are set.
- `connectors`: the workspace's Jira connectors that are enabled and hold credentials, by id
  (any member already reads these names on `GET /connectors/`).
- `link`: the caller's own link or `null` (R2D2-11). `covers`: ids of `connectors` the link covers
  (R2D2-4). `status: "lost"` keeps the row so the person sees why.

### 2.2 `POST /connectors/jira-link/` (start)

| Order | When | Answer |
|---|---|---|
| 1 | not configured | `409 {"code": "JIRA_LINK_OFF", "detail": "Linking a Jira account isn't set up on this deployment."}` |
| 2 | no enabled Jira connector with credentials | `409 {"code": "NO_JIRA", "detail": "This workspace has no Jira connection yet."}` |
| 3 | otherwise | `200 {"authorize_url": "https://auth.atlassian.com/authorize?..."}` and the browser cookie (R2D2-13) |

The authorize URL: `audience=api.atlassian.com`, `client_id`, `scope` (R2D2-6, space separated),
`redirect_uri=<MAIL_OAUTH_REDIRECT_BASE or the request origin>/api/v1/connectors/jira-link/callback/`,
`state`, `response_type=code`, `prompt=consent`. Not audited (nothing stored).

### 2.3 `GET /connectors/jira-link/callback/?code=&state=` (public)

Every answer clears the cookie and redirects to `<FRONTEND_URL>/integrations?jira_link=<outcome>&detail=<sentence>`:

| Order | When | Outcome, sentence | Audit |
|---|---|---|---|
| 1 | `error` in the query | `error`, "You didn't allow Revenact to use your Jira account." | none |
| 2 | state unsigned or older than 15 min | `error`, "This link is invalid or has expired. Try again." | none |
| 3 | state's user unknown or inactive | `error`, "This link is invalid or has expired. Try again." | none |
| 4 | another browser | `error`, "Open the link in the browser that started it." | `jira.link_refused` `other_browser` |
| 5 | Atlassian refused the code | `error`, "Atlassian didn't accept the sign-in. Try again." | `jira.link_refused` `exchange` |
| 6 | no `refresh_token` in the answer | `error`, "Atlassian didn't allow Revenact to stay linked. Try again." | `jira.link_refused` `no_refresh` |
| 7 | no Jira site covers a workspace Jira connector | `error`, "Your Atlassian account can't open acme.atlassian.net, the site Revenact's Jira connection uses." (the first connector's host) | `jira.link_refused` `no_site` |
| 8 | the account is another person's link here | `error`, "Someone else here has linked that Atlassian account." | `jira.link_refused` `taken` |
| 9 | stored (created, or the caller's link replaced) | `linked` (no detail) | `jira.link` |

Steps 5 to 9 call: `POST https://auth.atlassian.com/oauth/token` (JSON `{grant_type:
"authorization_code", client_id, client_secret, code, redirect_uri}`), `GET
https://api.atlassian.com/oauth/token/accessible-resources`, then `GET
https://api.atlassian.com/ex/jira/<first covering cloud_id>/rest/api/3/myself` for `accountId`,
`displayName`, `emailAddress`.

### 2.4 `DELETE /connectors/jira-link/`

`204`, the row deleted, `jira.unlink` (`reason: "person"`) audited; `204` with no audit when there
was no link.

## 3. Acting as the person

### 3.1 The seat

`jira_links.seat_for(connector, user)` answers a `Seat(config, creds, person, name, link_id)`:

- the user's link is `linked` and covers `connector` → `config = {**connector.config,
  "api_base": "https://api.atlassian.com/ex/jira/<cloud_id>"}`, `creds = {"access_token": ...}`,
  `person=True`, `name` the link's name;
- no link, or a link that covers another site → the connection's seat (`connector.config`,
  `connector.get_credentials()`, `person=False`, `name` the connection's `account_name`);
- a `lost` link → raises `LinkLost` (R2D2-9).

`JiraProvider._url` uses `config["api_base"]` when present; `_headers` sends `Bearer` when `creds`
holds `access_token`. Every `JiraTool` method takes `seat=` (default: the connection's seat).

### 3.2 Gate (`gates.blocked`, D3 §5.1, one row added)

For `jira.create`, `jira.assign`, `jira.comment`, after the connector checks (gone, reconnect,
allow): the reader's link is `lost` → `Blocked("Your Jira link stopped working. Link Jira again, or
remove the link to act as Jira Bot.", "/settings/connections")` ("Jira Bot" is the connection's
account name; "the Jira connection" when it has none).

### 3.3 What each call needs (scopes, R2D2-6)

| Call | Path | Scope |
|---|---|---|
| create | `POST /issue` | `write:jira-work` |
| find by label | `POST /search/jql` | `read:jira-work` |
| read assignee | `GET /issue/{key}?fields=assignee` | `read:jira-work` |
| assign | `PUT /issue/{key}/assignee` | `write:jira-work` |
| comment, find comment | `POST`, `GET /issue/{key}/comment` | `write:jira-work`, `read:jira-work` |
| projects, issue types, priorities | `GET /project/search`, `/issue/createmeta/{p}/issuetypes`, `/issue/createmeta/{p}/issuetypes/{type}` (priorities, see "Fixes after the live test"), `/priority` (a person's list without a type) | `read:jira-work` |
| assignable, user by email, myself | `GET /user/assignable/search`, `/user/search`, `/myself` | `read:jira-user` |

### 3.4 Preview (per reader, R2D2-10)

`preview.jira`, `preview.jira_assign`, `preview.jira_comment` each gain `as_you` and `link`:

```json
{"jira": {"site": "acme.atlassian.net", "project": "SUP", "...": "...", "as": "Carl Lee", "as_you": true, "link": null}}
```

| Reader | `as` | `as_you` | `link` |
|---|---|---|---|
| link covers the site | link's name | true | `null` |
| no link, linking configured | connection's name | false | `"none"` |
| link for other sites only | connection's name | false | `"other_site"` |
| linking not configured | connection's name | false | `"off"` |
| link lost | connection's name | false | `null` (the step is blocked, §3.2) |

### 3.5 Run

As today (D3 §3, R2-D1 §3), with the seat resolved once per step after the gate and passed to every
call of that step. The result gains `acted_as` (`"person"` / `"connection"`) and `jira_account`
(the seat's name). Every `agent_outside.call` row for Jira gains `as`.

### 3.6 Errors (D3 §6, rows added)

| When | `error` |
|---|---|
| a lost link found at run (refresh refused) | "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot." |
| Atlassian unreachable while refreshing | "Couldn't reach Atlassian to use your Jira link. Retry it." |
| 401 acting as the person | "Jira refused your Jira link. Link Jira again, then Retry." |
| 403 acting as the person | "Your Jira account can't do this in SUP-12. Ask a Jira admin for permission, then Retry." |

A 401/403 acting as the connection keeps today's sentences. The pick lists, acting as the person:
401 → `409 TOOL_REFUSED` "Jira refused your Jira link. Link Jira again, then try again."; a lost
link → `409 TOOL_BLOCKED` with the §3.2 sentence; Atlassian unreachable → `502 TOOL_UNREACHABLE`
"Couldn't reach Atlassian. Try again."

## 4. The live Slack channel list

### 4.1 Options route (D3 §5.2), `slack_channels`

`GET /agents/bundles/<id>/steps/<step>/options/slack_channels/?live=1&query=esc`

```json
{
  "options": [
    {"id": "6", "name": "#support", "detail": "This thread"},
    {"id": "6:C0ESCALATE", "name": "#escalations", "detail": "Not synced"},
    {"id": "6:G0LEADS", "name": "#leads-private", "detail": "Not synced, private"}
  ],
  "more": false,
  "note": null
}
```

- Without `live=1`: today's answer exactly (synced rows only, no `note` key), `query` ignored.
- With `live=1`: synced rows (filtered by `query`), then unsynced member channels (R2D2-15,
  R2D2-16), at most 100 rows; `note` per R2D2-17 or `null`. Private unsynced rows only for
  `manage_integrations`.
- Refusals unchanged; `query` over 100 characters → `400 {"query": ["Keep the search under 100 characters."]}`.

### 4.2 Editing (`PATCH` step, `run` and `retry` `fields`)

`{"channel_choice": "6:C0ESCALATE"}` (or `"6"`). Field errors (`channel_choice`):

| When | Sentence |
|---|---|
| not a string, or not `<int>` / `<int>:<channel id>` | "Choose a Slack channel from the list." |
| a synced id the reader can't post through | "Choose a Slack channel Revenact reads." (today's) |
| an unsynced channel not in the bot's member list | "Choose a channel the Revenact app is in." |
| a private unsynced channel, reader without `manage_integrations` | "Only an admin can choose a private channel Revenact doesn't read." |
| the list can't be read now | "Couldn't check Slack's channels. Try again." |

`fields.channel_choice` is the current option id (`str(connector_id)` for a step never moved).
`preview.slack` gains `synced` (bool).

### 4.3 Gate (one row added)

`slack.reply` with `unsynced` and `channel_private`, reader without `manage_integrations` →
`Blocked("Only an admin can post in #leads-private, a private channel Revenact doesn't read.")`
(no link: nothing to fix in Settings).

## 5. Mail (N1)

`agent_send.blocked`: order `CONNECT` (none or disconnected), `IMAP`, **`RECONNECT` when
`credentials` is blank**, then today's Gmail and status checks.

## 6. Audit

New: `jira.link`, `jira.unlink`, `jira.link_lost`, `jira.link_refused` (R2D2-14);
`agent_outside.call` `metadata.as`. Reused: `agent_action.approved` / `failed`.

## 7. Privacy (spec §13.4)

- A Jira link is its owner's: only they read, make or remove it; another person's run never acts
  as them (R2D2-11). Tokens encrypted (R2D2-7), never serialised or logged.
- The live Slack list shows channel names only, cached 5 minutes, no message text; private
  unsynced channels only to `manage_integrations` (R2D2-15). Every new filter carries
  `# SOC2:AUTH-02`; no `DISTINCT`.

## 8. Query ceilings

Pinned by tests (R2D2-21) and written into `docs/API_CONTRACTS.md` and "Changes during the
build": `OUTSIDE_DETAIL_QUERIES`, `OUTSIDE_HISTORY_QUERIES` (a reader with a link), `OPTIONS_QUERIES`,
`SLACK_OPTIONS_QUERIES`, `JIRA_LINK_QUERIES`.

## 9. Settings

`ATLASSIAN_OAUTH_CLIENT_ID`, `ATLASSIAN_OAUTH_CLIENT_SECRET` (both empty by default: linking is
off). `AGENT_TOOL_TIMEOUT_SECONDS` bounds every Atlassian and Slack call made by a step or a list.
`JIRA_LINK_WARM_SECONDS = 900` (a constant, not an env var).

## 10. Not in this delivery

Unmatched items and the fast lane (R2-D3); per-person Slack (posts stay the bot's); Slack
`chat:write.public`; Gmail and Outlook changes beyond N1; Zendesk, Freshdesk, the webhook or any
other connector's tools; Jira granular scopes; an admin list of links; Auto for any outside step.

## Owner set-up and live checks

The Atlassian app (two: dev and prod), its callback URLs, scopes, distribution setting and the env
vars `ATLASSIAN_OAUTH_CLIENT_ID` / `ATLASSIAN_OAUTH_CLIENT_SECRET` are listed step by step in the
spec §13.9; the live checks in §13.8. Slack needs no new scope. Until the owner sets the two env
vars, linking is off (`configured: false`), every Jira step acts as the connection as today, and the
panel shows no link hint (`link: "off"`).

## Changes during the build

The build records here every change to this contract (with the measured ceilings), and relays each
to the frontend controller.

- Measured ceilings (Task 11): `OUTSIDE_DETAIL_QUERIES = 9`, `OUTSIDE_HISTORY_QUERIES = 8` (a linked reader), `OPTIONS_QUERIES = 9`, `SLACK_OPTIONS_QUERIES = 4`, `JIRA_LINK_QUERIES = 2`. No query uses DISTINCT.
- §3.1: `jira_links.seat_for(connector, link)` takes the reader's link row (or None), not the user; the outside layer (`services/agents/outside/seats.py`) resolves the user's link once per reader. Backend-internal, no wire change.
- §9: the warm window constant is `jira_links.JIRA_LINK_WARM_SECONDS = 900` (as the contract names it). No wire change.
- §3.2/§3.4: while linking is off (Atlassian env vars unset) a lost link neither blocks nor acts: every Jira step acts as the connection and the preview says `link: "off"` (matches the contract's owner set-up note; previously implicit).
- §3.2: the lost sentence names the connection's `account_name`, or "the Jira connection" when it has none (the preview's `as` may still fall back to the connector's name).
- §2.3: if Atlassian's `/myself` fails or returns no accountId after a good exchange, the callback refuses as `exchange` ("Atlassian didn't accept the sign-in. Try again.").
- §3.6 pick lists: only a 401 acting as the person gets "Jira refused your Jira link. Link Jira again, then try again."; a 403 as the person keeps today's pick-list refusal sentence.
- Token refresh: only `invalid_grant` (or `unauthorized_client` whose description names the refresh token) loses a link; any other refusal reads as "Couldn't reach Atlassian to use your Jira link. Retry it." and the link is kept.
- slack.reply `editable` is now `["connector_id", "channel_choice", "text"]`; `fields.channel_choice` is ALWAYS present (`"<pk>"` for a never-moved step, old payloads included; `"<pk>:<channel id>"` after a move). If an edit sends both `connector_id` and `channel_choice`, `connector_id` wins.
- `preview.slack` for an unsynced channel: `synced: false`, `in_thread: false`, `channel: "#<unsynced name>"`.
- Private unsynced step for a reader without manage_integrations: `disabled_reason` "Only an admin can post in #<name>, a private channel Revenact doesn't read.", `disabled_link: null`, Reject stays open (`can_reject` true) — the frontend shows the excerpt (not the R2D2-20 read-only text) since there is no link.
- A run of an unsynced Slack step whose channel has since become synced by some connector fails the step with "Choose a Slack channel from the list." (run-time only; the panel does not warn before Run).
- Task 13 (docs): recorded in `docs/API_CONTRACTS.md` (connectors: the `jira-link` routes; agents: "Agent bundles, round 2 delivery 2"), `docs/audit-events.md`, `.soc2/CONTROL_MAP.md`, the product documents and `.agents/workflows/agent-outside-flow.md`. `auth.atlassian.com` was added to `providers/base.py` `ALLOWED_HOSTS` (the contract's "What R2-D1 left" noted it was missing). The audit rows: `jira.link` `metadata.sites` is a count, and `jira.link_refused` has no target.
- A channel counts as synced by its channel id alone (legacy Slack connectors without a stored team id included); such a channel never appears as an unsynced row and can't be chosen or posted to as one.

## Fixes after the live test (2026-10-14)

A live run against a real Jira Cloud site, as a linked person (OAuth 3LO, classic scopes
`read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`), found that every
`jira.create` failed: the step read `GET /priority/search` even with no priority set, and that path's
OAuth scope is the admin `manage:jira-configuration`, so Jira answered `401 {"code":401,"message":
"Unauthorized; scope does not match"}`, which the step then worded as a lost link. Fixed as follows.

- **Rulings.**
  - F1: a create step reads priorities only when its priority has a name and no id. No priority
    means Jira's default: no read, no `priority` field sent.
  - F2: a named priority is resolved against the project's create screen for the step's issue type,
    `GET /issue/createmeta/{project}/issuetypes/{issueTypeId}` (`read:jira-work`), field `priority`
    → `allowedValues`, read 200 fields a page, at most 3 pages. It respects each project's priority
    scheme, and it's the same read for the person and the connection. A name the screen doesn't offer
    (or a screen with no priority field) leaves Jira's default, as an unmatched name did before.
  - F3: the `jira_priorities` pick list uses the same create-screen read when it knows the project
    and the issue type. Otherwise the person's seat reads `GET /priority` (deprecated, but the one
    site-wide list `read:jira-work` covers), and the connection's seat keeps `GET /priority/search`
    (its API token has no OAuth scopes).
  - F4: a 401 whose body says "scope does not match" means the link works but its scopes don't
    cover the call. It never marks the link lost and never asks to link again. Only Atlassian
    refusing the refresh token (`invalid_grant`, or `unauthorized_client` naming the refresh token)
    loses a link, as before. Any other 401 acting as the person keeps "Jira refused your Jira link.
    Link Jira again, then Retry." (nothing is marked).
  - F5: the Jira site field keeps only the host of a pasted URL (`alfiee`, `alfiee.atlassian.net` and
    `https://alfiee.atlassian.net/anything` all give `alfiee.atlassian.net`). Only `http(s)`, no user
    info, and one tenant label under `.atlassian.net`: other hosts are refused as before. Zendesk's and
    Freshdesk's fields share the same parser.
  - F6: the other calls a person's seat makes were checked against Atlassian's v3 spec: create
    (`write:jira-work`), find by label `POST /search/jql`, read issue, `GET /mypermissions`, read
    comments (`read:jira-work`), assign, comment (`write:jira-work`), `GET /user/search`,
    `/user/assignable/search`, `/myself` (`read:jira-user`), projects and issue types
    (`read:jira-work`). None needs an admin scope; `/priority/search` was the only one.
- **Wire change (additive).** `GET /agents/bundles/<id>/steps/<step_id>/options/jira_priorities/`
  takes a new optional query parameter `issue_type`: the picked issue type's **id** (digits, as
  `jira_issue_types` returns it), sent with `project` (the picked project key). With both, the rows
  are that project's create-screen priorities for that type (possibly `[]` when the screen has no
  priority field). Without `project`, the step's own project is used; without `issue_type`, the step's
  own issue type id is used when the project is the step's and that id is set. Otherwise the
  site-wide list (above). A non-digit `issue_type` (or over 18 digits) → `400 {"issue_type":
  ["Choose from Jira's list."]}`, checked after `list`, only for `jira_priorities` (other lists ignore
  it). The row shape is unchanged.
- **Sentences.**

  | When | Sentence |
  |---|---|
  | a step, acting as the person, gets Jira's 401 "scope does not match" | "Your Jira link can't do this in Jira. Ask your Revenact admin, then Retry." |
  | a pick list, acting as the person, gets the scope 401 **or a 403** | `409 TOOL_REFUSED` "Your Jira link can't do this in Jira." |

  This replaces the earlier note that a 403 as the person keeps the pick lists' "Jira refused the
  login. Reconnect Jira, then try again." (the reader can't reconnect the connection, and the
  connection isn't what was refused). A 403 on a step acting as the person is unchanged ("Your Jira
  account can't do this in SUP-12. Ask a Jira admin for permission, then Retry."); the connection's
  401 and 403 sentences are unchanged.

