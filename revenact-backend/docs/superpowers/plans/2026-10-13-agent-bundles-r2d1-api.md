# Agent bundles, round 2 delivery 1 ("Finish the four tools"): API contract

Backend plan: `docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-backend.md`. Frontend plan:
react-ts-app `docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-frontend.md`. Spec: react-ts-app
`docs/superpowers/specs/2026-10-13-agent-bundles-design.md` §13 (the round 2 addendum: §13.1 the
owner's scope ruling, §13.3 items A, F and G, §13.4, the R2-D1 row of §13.5). The D1, D2 and D3
contracts (`2026-10-13-agent-bundles-d1-api.md`, `-d2-api.md`, `-d3-api.md`), as merged in backend
#114, #115 and #116 and recorded in `docs/API_CONTRACTS.md`, still hold except where this file
changes them. Every path is under `/api/v1/`, every route is `IsAuthenticated` (401 without a
token) unless it says otherwise, every body is JSON.

Merge order: this delivery's backend PR, then its frontend PR. The old frontend keeps working
against this backend: every change adds a kind, a key, a value or a route; none removes or renames
one. An old panel shows `jira.comment` with its server label and no editor; an old Settings page
shows no hint for `needs: "reconnect"` and its Allow button answers the existing `409 NOT_CONNECTED`;
an old mailbox card ignores `signature`.

## What round 1 left that this delivery builds on (read from the merged code, main 558c287)

- The outside facade `services/agents/outside/` (`tools.py` `MailTool`/`SlackTool`/`JiraTool`,
  `gates.py`, `keys.py`, `trail.py`, `sentences.py`, `options.py`, `offered.py`) and the four kinds in
  `services/agents/actions/mail_replies.py`, `slack_replies.py`, `jira_issues.py`. Every outside
  write is last in its step's transaction; every Retry looks first (D3-11, D3-12).
- `JiraProvider` (`services/connectors/providers/jira.py`) speaks REST v3 with Basic auth (an
  Atlassian email and API token): `create_issue`, `find_issue` (by label), `issue_assignee`,
  `assign_issue`, the pick lists, `my_permissions`. `adf(text, footer)` writes Atlassian Document
  Format; `adf_text` reads it.
- `services/connectors/providers/base.py` `http_call`: on an `HTTPError` it reads the body with
  `exc.read()` **inside** the `except` block, so a timeout while reading a refusal's body escapes as
  a raw `TimeoutError` (neither `ProviderError` nor `NoAnswer`). `services/mail/providers/base.py`
  `_open` has the same shape.
- `JiraTool.options` maps a 401/403 to `409 TOOL_REFUSED` and **every other** failure, a 404 and a
  429 included, to `502 TOOL_UNREACHABLE` "Couldn't reach Jira. Try again." (N1). A Run reads a 404
  as "Jira can't find the project SUP." (`sentences.jira`).
- `jira_issues.apply_assign` audits its read of the assignee as `outcome: "not_found"` whenever the
  issue isn't already the chosen person's, including when someone else holds it.
- `agent_access.needs` returns `"consent"` or `"token"` for a Slack connector that is disabled, has
  no credentials or is in error.
- `agent_send._reply` (a reply found again by a Retry) always records `threaded: False`.
- `ConnectorOAuthCallbackView._finish` refuses a state whose user lost `manage_integrations` with
  "Unknown connector." and writes no audit row.
- Outlook: `MicrosoftProvider.send` posts `sendMail` (text body, cc, the `x-revenact-step` header and
  its extended-property stamp when asked); `find_sent` reads Sent Items by that stamp. No threading
  headers, no signature. Scopes: `offline_access User.Read Mail.Read Mail.Send`.
- Gmail: `send_as.signature_block(connection)` wraps the sanitised send-as signature in
  `div[data-revenact-signature]`; it is placed when a draft is made (`compose.prefill`,
  `drafts.agent_draft`) and under an agent reply (`agent_send._bodies`). `drafts.clean` re-sanitises a
  saved draft's HTML with nh3 (images kept), but the frontend editor's `cleanEditable` has already
  reduced the block to text. `sync.send_email` (Communications quick reply, an unlinked agent draft
  reply, the record compose) and `sync.reply_to` send text only, unsigned.
- `docs/API_CONTRACTS.md`: a `<!--` at line 7,728 ("Template for each new feature section below:")
  is closed only at the file's end (line 12,096), so the metrics, communications, mail, attention,
  work and agents sections render as a comment.

## Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person will
notice. **Owner** marks a decision the owner should confirm before the build (spec §13.7); the plans
are written to it, and each is one small change if the answer differs.

| # | Decision | Cost if wrong |
|---|---|---|
| R2D1-1 | **Scope** (owner ruling, spec §13.1): Gmail, Outlook, Jira and Slack only. No tool for Zendesk, Freshdesk, the webhook or any other connector; their `agents.kinds` stay `[]`. | None. |
| R2D1-2 | **`jira.comment`** comments on the thread's own Jira issue (`"source"`) or on `{{step N.ticket_key}}` of an earlier `jira.create` in the same bundle, as the connection's account (D3-5). The model writes the body only (≤ 2,000); a person edits the body (≤ 4,000). The intake may propose it on a Jira thread whose own connector is usable, and after a `jira.create` of the same answer; the nightly pass never proposes it. Target `jira:comment:<issue as written>`: one comment per issue per bundle. | Low. |
| R2D1-3 | **Always internal** (**Owner**). Every comment carries the property `sd.public.comment` = `{"internal": true}`, so in a Jira Service Management project it is internal (a customer on the portal never sees it); a Jira Software project ignores it. The body is not `customer_facing`, so it may hold another step's placeholder (filled at run). Live check: JSM accepts the property. | Medium: a team wanting customer-visible JSM replies needs a later kind. |
| R2D1-4 | **Idempotency by a visible ref** (**Owner**). The comment ends with a paragraph "Posted by Carl CSM from Revenact · ref b12-s41." Every Retry reads the issue's newest 100 comments (`orderBy=-created`) and takes the one whose text holds `ref b12-s41`; found → applied, nothing posted. | Low: an invisible entity property can replace it after a live check. |
| R2D1-5 | **`ADD_COMMENTS` is read, not required** (**Owner**). "Allow agents to act" on Jira asks `mypermissions` for `CREATE_ISSUES,ASSIGN_ISSUES,BROWSE_PROJECTS,ADD_COMMENTS` and stores what is held; the switch still needs only create and assign. A connector switched on before this delivery keeps working. A Jira that refuses a comment says so on the step (403 sentence, §5). | Low. |
| R2D1-6 | **Comment outputs and link.** `ticket_key`, `ticket_url` (the issue) and `comment_url` (`https://<site>/browse/SUP-12?focusedCommentId=<id>`). The step's link is "Open the comment on SUP-12 in Jira" (external), in place of "Open SUP-12 in Jira". Chip for `comment_url`: "Jira comment link from step 1". | Trivial. |
| R2D1-7 | **The pick lists read Jira like a Run** (N1). 401/403 → `409 TOOL_REFUSED` (unchanged); **404 → `409 TOOL_NOT_FOUND`** "Jira can't find SUP-12." (assignees by issue), "Jira can't find the project SUP." (a list asked for a project), else "Jira can't find this site. Check the Jira connection."; **429 → `409 TOOL_BUSY`** "Jira is busy. Try again in a minute."; anything else, and no answer, `502 TOOL_UNREACHABLE` (unchanged). | Low. |
| R2D1-8 | **A refusal whose body can't be read is still a refusal.** A failure reading an HTTP error's body (timeout, dropped connection) is caught: the `ProviderError` keeps the status and has no body. A Jira 400 then reads "Jira refused this. Retry it." The same fix is made in the mail providers' `_open`. Never `NoAnswer`: a status came back, so nothing was done. | None. |
| R2D1-9 | **`jira.assign`'s lookup outcome says what it found:** `found` (already the chosen person), `not_found` (nobody), `elsewhere` (someone else; `returned` empty, ids only). | None. |
| R2D1-10 | **`needs: "reconnect"`** (**Owner**) for a connector with kinds that is disabled, has no credentials or is in error, ahead of consent, token or permission. The frontend shows "Reconnect Slack before agents can act." / "Reconnect Jira before agents can act." and no Allow button. | Low. |
| R2D1-11 | **A demoted admin's OAuth callback is audited:** `connector.oauth_refused`, `reason: "not_allowed"`, actor the state's user, target the connector, before the unchanged "Unknown connector." answer. An unknown user or connector is still not audited (nothing to name). | None. |
| R2D1-12 | **A reply found again says truly whether it threaded.** The lookup returns the found message's thread (Gmail `threadId`, Graph `conversationId`); `threaded` is true when it equals the thread of the runner's mailbox copy of the source. | None. |
| R2D1-13 | **Outlook replies thread through Graph's reply** (**Owner**). When the Outlook mailbox holds a copy of the source (found by its Message-ID: `GET /me/messages?$filter=internetMessageId eq '<id>'&$select=id,conversationId&$top=1`, `Mail.Read`) **and** the reply goes to the source's sender unchanged (`to == [source.from_address]`), the send is `POST /me/messages/{id}/reply` with `message: {subject, body (Text), ccRecipients?, singleValueExtendedProperties?}` and no `toRecipients` (Graph adds given recipients to a reply's; it already answers the sender or Reply-To). `Mail.Send` covers it: no new scope, no reconnect. Not held, a lookup refused (other than a lost grant), an edited To, or the reply answering 404 → today's `sendMail`. Agent replies and a person's own Outlook replies (Communications, the personal inbox) both use it. Preview `threaded` becomes true for Outlook as for Gmail (the runner's mailbox is the one that got the email). | Low: an edited To threads by subject only. |
| R2D1-14 | **The stamp travels in the reply.** The reply's message carries the `x-revenact-step` extended property (FR-3), so a Retry's Sent Items lookup is unchanged; it does not carry `internetMessageHeaders`. Live check: Graph keeps the property on the Sent Items copy of a `reply`. | Medium until checked: an Outlook Retry could miss a sent reply. |
| R2D1-15 | **Outlook signature** (**Owner**). `MailboxConnection.signature_html` (already a column) holds an Outlook mailbox's signature, written by its owner as plain text through `PATCH /mail/connection/` (§4.3), ≤ 1,000 characters and ≤ 10 lines, stored as paragraphs. Every Outlook send through Revenact ends with `\n\n-- \n<signature>` (text body). Empty by default. A Gmail mailbox's signature stays Gmail's (409 on PATCH). IMAP: 409 (no agent sends; IMAP signatures are not in round 2). No migration. | Low. |
| R2D1-16 | **Gmail signature kept whole** (**Owner**). When a draft is created or edited, a `div[data-revenact-signature]` in its HTML is replaced by the mailbox's current `signature_block` (Gmail's sanitised HTML, images kept). No block (the person deleted it) stays none. A draft written in Gmail keeps today's known limit. | Low. |
| R2D1-17 | **Sends that skip a draft are signed** (**Owner**). `sync.send_email` and `sync.reply_to` sign the text through one helper, `services/mail/signing.py`: Gmail with a signature sends HTML (paragraphs + the block) and text (`-- ` + the signature's text); Outlook text only; nothing when the text already holds a `-- ` line (a mirrored draft) or the mailbox has no signature. The agent reply uses the same helper (no change for Gmail). | Medium-low: a person who types their sign-off by hand gets it twice. |
| R2D1-18 | **`docs/API_CONTRACTS.md`'s comment is closed:** the template comment moves to the end of the file, where its own `-->` is, so the sections it hid render again. | None. |
| R2D1-19 | **Twice-filter unchanged.** `jira.comment`'s body passes the outside out-check (`internal_mentions`, D3-19); the model sees nothing new. | None. |
| R2D1-20 | **Ceilings.** `jira.comment` joins the page's one read of connectors (`bulk.outside_ids`); `OUTSIDE_DETAIL_QUERIES` and `OUTSIDE_HISTORY_QUERIES` stay constant in rows and are re-measured with a comment step in the mix; `OPTIONS_QUERIES` and `THREAD_RUN_QUERIES` are re-pinned only if they move (recorded in "Changes during the build"). No `DISTINCT`. | Low. |

## 1. Data

### 1.1 `AgentAction.Kind` gains (`metrics.0018_agent_action_jira_comment`)

`jira.comment` "Comment on a Jira issue" (24 kinds), after `jira.assign`.

### 1.2 No other migration

`MailboxConnection.signature_html` already exists (Gmail D3). `Connector.granted_scopes` may now
hold `ADD_COMMENTS`.

## 2. `jira.comment` (`services/agents/actions/jira_comments.py`)

`agents=(cs, sales)`, record-level, `max_level="ask"`, `outside=True`, `irreversible=True`.

| | |
|---|---|
| Model writes | `{"issue": "source" or "{{step N.ticket_key}}", "body": <plain text, ≤ 2,000>}` |
| Stored | `{"connector_id": 6, "issue": "SUP-12", "body": "..."}` (or `"issue": "{{step 1.ticket_key}}"`, filled at run) |
| Offered | R2D1-2 |
| Target | `jira:comment:<issue as written>` (≤ 160) |
| `current` | none |
| Editable | `body` |
| `customer_facing` | none (R2D1-3) |
| Outputs | `ticket_key`, `ticket_url`, `comment_url` |
| Preview | `{"jira_comment": {"site": "acme.atlassian.net", "issue": "SUP-12", "excerpt": "<first 280>", "as": "Jira Bot", "internal": true}}`; a placeholder issue is in the step's `placeholders` (chip "Jira ticket from step 1") |
| Undo | "This Jira comment has been posted." |

Edit refusals (field, sentence): `body` blank "Write the comment.", over 4,000 "Keep the comment
under 4000 characters."

What Jira receives: `POST /rest/api/3/issue/SUP-12/comment` with

```json
{
  "body": {"type": "doc", "version": 1, "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "Customer confirms the loop on Chrome too."}]},
    {"type": "paragraph", "content": [{"type": "text", "text": "Posted by Carl CSM from Revenact · ref b12-s41."}]}
  ]},
  "properties": [{"key": "sd.public.comment", "value": {"internal": true}}]
}
```

Jira answers `201 {"id": "10031", ...}`. The lookup: `GET /rest/api/3/issue/SUP-12/comment?orderBy=-created&maxResults=100`.

## 3. Running a `jira.comment` step

As every outside step (D3 contract §3): the gate (§5.1 of D3, now with `jira.comment` in the Jira
row), placeholders filled, **a Retry looks first** (R2D1-4; audited `op: "lookup"`, `outcome`
`found`/`not_found`/`refused`, `where` the issue key, `returned` the comment id), then the one write
(audited `op: "comment"`, `outcome` `ok`/`refused`/`unconfirmed`, `returned` the comment id). The
result holds `attempted_at`, `attempted_by`, `comment_id`, `ticket_key`, `ticket_url`,
`comment_url`.

## 4. Shapes and routes

### 4.1 Step (D3 §4.1)

`preview.jira_comment` (§2). `links` for an applied `jira.comment`:
`[{"label": "Open the comment on SUP-12 in Jira", "url": "https://acme.atlassian.net/browse/SUP-12?focusedCommentId=10031", "external": true}]`.

### 4.2 Connector (`GET /connectors/`, D3 §4.3)

`agents.kinds` for Jira: `["jira.create", "jira.assign", "jira.comment"]`. `agents.needs` gains
`"reconnect"` (R2D1-10); the order is: `null` when there are no kinds or it can act; `"reconnect"`
when not usable; then D3's `"permission"` (Jira), `"consent"`, `"token"`.

### 4.3 Mailbox (`GET /mail/connection/`) gains, and `PATCH /mail/connection/` (new)

`connection.signature`:

```json
{"text": "Carl CSM\nAcme", "editable": true, "source": "revenact"}
```

- Outlook: `editable: true`, `source: "revenact"`, `text` the stored signature as text (`""` when none).
- Gmail: `editable: false`, `source: "gmail"`, `text` the send-as signature as text (`""` when none).
- IMAP: `null`.

`PATCH /mail/connection/` body `{"signature": "<text>"}` (the caller's own live mailbox only):

| Order | When | Answer |
|---|---|---|
| 1 | no live mailbox | `404 {"detail": "Connect your mailbox first."}` |
| 2 | `signature` missing or not a string | `400 {"signature": ["Write a signature, or leave it empty."]}` |
| 3 | over 1,000 characters | `400 {"signature": ["Keep the signature under 1000 characters."]}` |
| 4 | over 10 lines | `400 {"signature": ["Keep the signature to 10 lines."]}` |
| 5 | Gmail | `409 {"code": "SIGNATURE_IN_GMAIL", "detail": "Change your signature in Gmail. Revenact uses it from there."}` |
| 6 | IMAP | `409 {"code": "NO_SIGNATURE", "detail": "Signatures are for Outlook mailboxes here."}` |
| 7 | Outlook | `200 {"connection": <as GET>}`; `""` clears it |

Trailing spaces per line and blank lines at the ends are dropped. Not audited (R2D1-15).

### 4.4 Options route (D3 §5.2)

New refusals (R2D1-7), after `TOOL_BLOCKED` in the order: `409 {"code": "TOOL_REFUSED", ...}`
(unchanged), `409 {"code": "TOOL_NOT_FOUND", "detail": <sentence>}`, `409 {"code": "TOOL_BUSY",
"detail": "Jira is busy. Try again in a minute."}`, `502 TOOL_UNREACHABLE` (unchanged).
`jira.comment` has no lists: `400 {"list": ["This step has no such list."]}`.

### 4.5 Connector OAuth callback (D3 §5.4)

Unchanged answers. A refusal for lost `manage_integrations` writes `connector.oauth_refused`
(`metadata: {"provider", "reason": "not_allowed"}`, outcome failure, the request) (R2D1-11).

## 5. Errors (D3 §6, Jira rows added)

| When | `error` |
|---|---|
| 403 on a comment | "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry." |
| 404 on a comment | "Jira can't find SUP-12." |
| 400 with an unreadable body | "Jira refused this. Retry it." |
| no answer (comment) | "We couldn't confirm Jira added the comment. Retry checks Jira first." |
| a placeholder issue whose step didn't run | "Needs step 1, which didn't run." |

## 6. Audit

New: `agent_outside.call` `op: "comment"`; `outcome: "elsewhere"` on a `jira.assign` lookup;
`connector.oauth_refused` `reason: "not_allowed"`. Reused: `agent_action.approved` /
`agent_action.failed` per step. `mailbox.reply` unchanged.

## 7. Privacy (spec §13.4)

- A `jira.comment` bundle is read by its source's readers (D2 §5.1); its text passes the outside
  out-check (D3-19).
- A signature is the mailbox owner's own: only they read or change it (`PATCH` acts on
  `request.user`'s mailbox only).
- Outlook's message lookup reads only the runner's own mailbox.

## 8. Query ceilings

Pinned by tests, measured on the branch and written into `docs/API_CONTRACTS.md` and "Changes
during the build": `OUTSIDE_DETAIL_QUERIES` (a waiting bundle holding all five outside kinds, 5 and
10 steps), `OUTSIDE_HISTORY_QUERIES`, `OPTIONS_QUERIES`, `THREAD_RUN_QUERIES`, and
`MAILBOX_QUERIES` (`GET /mail/connection/` unchanged by `signature`). No `DISTINCT`.

## 9. Settings

None new. `AGENT_TOOL_TIMEOUT_SECONDS` bounds the comment calls and Outlook's message lookup.

## 10. Not in this delivery

Per-person Jira (3LO) and a live Slack channel list (R2-D2); storing unmatched items and the fast
lane (R2-D3); Zendesk, Freshdesk, webhook or any other connector's tools (R2D1-1); public JSM
replies; IMAP signatures and IMAP agent sends; a Gmail-written draft's rich formatting; Auto for any
outside step.

## Changes during the build

The build records here every change to this contract (with the measured ceilings), and relays each
to the frontend controller.

- Measured ceilings (Task 13): `OUTSIDE_DETAIL_QUERIES = 8` (a waiting bundle with all five outside kinds, equal at 5 and 10 steps) and `OUTSIDE_HISTORY_QUERIES = 7` (equal at 1 and 4 bundles) were measured with all five outside kinds; `OPTIONS_QUERIES = 8` and `THREAD_RUN_QUERIES = 33` were re-measured and did not move. New pin `MAILBOX_QUERIES = 5` for `GET /mail/connection/` on Outlook (Gmail 9, `GMAIL_QUERIES`), unchanged by `signature`. No query uses DISTINCT.
- A step's `placeholders` list follows the stored payload's jsonb key order (Postgres orders keys shortest-first), not field order: a `jira.comment` with placeholders in both `issue` and `body` lists `body` first. The frontend looks placeholders up by field, never by index (Task 6; a note, not a shape change).
- `find_comment` match (Task 4): the comment is found by the ref followed by the footer's closing period ("ref b12-s41."), so a longer ref ("b12-s410") never matches a shorter one.
- `services/mail/signing.py` imports `send_as` lazily, inside the function, to avoid an import cycle at startup (Task 10 fix, `8db71ea`).
