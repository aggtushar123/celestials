# Connections page: Gmail, Slack, Jira (2026-10-16)

Status: draft for owner approval. Replaces the tool list on **Settings › Connections**
(`/settings/connections`). Owner's answers of 2026-10-16 are quoted as decisions (D).

## 1. Why

The current page lists 13 tools. A connected tool shows a header row with only
"Add another" and a second row with "Set up", a ⋯ menu and "Not connected yet"
twice; nothing says Connect or Disconnect. Admin-level and personal connections
are mixed together.

## 2. Layout (D: two sections on one page)

```
Connections
Your accounts and the tools Revenact reads from.

YOUR ACCOUNTS                                   (every member)
┌───────────────────────────────────────────────────────────────┐
│ [Gmail] Gmail         you@gmail.com · synced 2 min ago        │
│         Your email with customers, filed on their records.   [Disconnect] │
├───────────────────────────────────────────────────────────────┤
│ [Slack] Slack         Not linked                    [Link Slack] │
│         Post as you, bring in your customer DMs.              │
├───────────────────────────────────────────────────────────────┤
│ [Jira]  Jira          Linked as Tushar · alfiee.atlassian.net [Unlink] │
│         Jira steps you run act as you.                        │
└───────────────────────────────────────────────────────────────┘

WORKSPACE                                       (manage_integrations only)
┌───────────────────────────────────────────────────────────────┐
│ [Slack] Slack         Connected · #customer-escalations · synced 10:42 │
│         Reads channels; each thread files on its customer. [Sync now] [⋯] │
├───────────────────────────────────────────────────────────────┤
│ [Jira]  Jira          Not connected                    [Connect] │
│         Issues from a project, as tickets for engineering.    │
└───────────────────────────────────────────────────────────────┘

COMING SOON                                     (D: all 10 others, greyed)
Salesforce · HubSpot · Zendesk · Freshdesk · Intercom · Any other system ·
GitHub · Figma · Microsoft Teams · Zoom
```

- One row per connection, one primary button per row, the row's state in words
  beside it. ⋯ holds the secondary actions (Reconnect, Change who sees it,
  Choose its customer, Disconnect for the workspace rows).
- States and their one button:

  | State | Text | Button |
  |---|---|---|
  | never connected | Not connected / Not linked | Connect / Link |
  | connected, healthy | who/what · last sync | Sync now (Gmail, workspace) or Unlink (Slack/Jira links); Disconnect in ⋯ |
  | credentials lost | Stopped working · reason | Reconnect |
  | syncing | Syncing… | disabled |
  | first sync pending | Connected · first sync within 10 minutes | Sync now |

- Workspace section hidden for members without `manage_integrations` (D).
- One connection per tool on this page; no "Add another" (the API still allows
  more, the page shows the first; a second Slack workspace is out of scope).
- Coming soon rows: logo, name, category; no buttons; their seeded tickets and
  calls stay on customer records (D).

## 3. Each tool

### Gmail (personal)
- D: IMAP is the main path. "Connect Gmail" opens a short form: Gmail address,
  app password (with a link to myaccount.google.com/apppasswords and one line
  on 2-Step Verification). Uses the existing `POST /mail/connect/imap/` with
  Gmail's IMAP/SMTP hosts filled in.
- When the workspace is enabled for two-way Gmail (portal switch + verified
  domain), the button becomes "Connect with Google" and IMAP moves under ⋯.
- Disconnect: existing `DELETE /mail/connection/`.
- Privacy unchanged: the person and their management chain read their mail.

### Jira
- Personal: existing Link Jira (`/connectors/jira-link/`), Atlassian 3LO.
- Workspace: the existing seeded Jira connector (90 demo tickets) gets real
  credentials when the admin connects (D: connect that existing one); its demo
  tickets stay beside real ones.

### Slack
- Workspace: the existing seeded Slack connector (158 demo tickets) gets the
  real bot through Slack sign-in (D: connect that existing one).
- **Personal Slack link (new backend, D: build it now, keep both uses).** Mirrors
  JiraLink: `SlackLink(user 1:1, team_id, slack_user_id, name, credentials Fernet,
  scopes, status linked|lost)`, Slack OAuth v2 `user_scope=chat:write,users:read`.
  1. **Post as me**: replies and agent steps from bundles the person runs post
     with their user token; the bot posts if they have no link.
  2. **Show who I am**: messages the person wrote in synced channels are
     attributed to them (Slack user id).
  - **No DM permissions are ever requested** (no `im:history`/`mpim:history`).
  - Unlink revokes the token (`auth.revoke`) and deletes it. Audited
    `slack_link.link` / `slack_link.unlink`; credentials restricted, never logged
    (SOC2:DATA-02, LOG-03).
- **Send to Revenact (D: option A, owner 2026-10-16: privacy stays intact).** A
  Slack **message shortcut** on every message (DMs, group DMs, channels): ⋯ →
  Send to Revenact. Slack posts only that message, only when the person clicks.
  - `POST /api/v1/connectors/slack/interactivity/`: public, verifies Slack's
    signing secret and timestamp (SOC2:API-11), throttled; maps the Slack user to
    a Revenact member of the workspace that installed the app (their SlackLink,
    else their Slack email = Revenact email); anyone else gets an ephemeral
    "Link Slack in Revenact first".
  - The agent reads that one message, finds the customer it is about (sender's
    email on a contact, else names in the text), and creates a **Work suggestion
    visible only to that person**: summary, sender, customer, link back to Slack,
    and a suggested bundle with **Run**. Slack gets an ephemeral "Sent to your
    Work" reply.
  - Stored: the one message's text on that private suggestion; deleted with it.
    Nothing reaches the account team unless the person runs a bundle that files
    or posts something.
  - Slack app setup (owner): Interactivity on with the request URL above, the
    message shortcut `send_to_revenact`, user scopes above; signing secret saved
    to Secret Manager `slack-signing-secret`.

## 4. Delivery

| PR | Contents |
|---|---|
| Frontend 1 | the page: Your accounts (Gmail IMAP, Jira link), Workspace (Slack, Jira), Coming soon; remove Account settings › Integrations and point its link here |
| Backend 1 | SlackLink (link/unlink, post as me, attribution) + Send to Revenact endpoint → private Work suggestion |
| Frontend 2 | Link Slack row + the Slack-sourced suggestion in Work |

Automatic DM triage (option B) is not built; if wanted later, it is opt-in per
person with its own consent screen.

## 5. Decisions recorded

- Section names: Your accounts / Workspace / Coming soon (owner, 2026-10-16).
- Account settings › Integrations is removed; its sidebar entry opens
  Settings › Connections (owner, 2026-10-16).
- Slack DMs: Send to Revenact only; no DM scopes (owner, 2026-10-16).
