---
description: Product Requirements Document for Revenact — who it is for, what it does, what is built, and what is next.
---

# Revenact — Product Requirements Document

**Status of this document:** current as of 2026-09-18. Written from the code in
`revenact-backend`, `react-ts-app` and `revenact-infra`, not from a wishlist.
Anything marked *Planned* has no implementation.

Companion documents: [TRD](02-trd.md) (how it is built),
[UI/UX Design](../../../react-ts-app/docs/03-ui-ux-design.md),
[App Flow](../../../react-ts-app/docs/04-app-flow.md),
[Backend Schema](05-backend-schema.md), [Implementation Plan](06-implementation-plan.md).

---

## 1. What Revenact is

Revenact is a multi-tenant B2B SaaS platform for customer success. It gives a
software company one place to see how every customer relationship is actually
going, to understand why a number moved, and to decide what to do about it with
an AI agent that the whole team can watch and steer together.

It began as a churn-prevention tool for Customer Success Managers. It is now
positioned as a **company brain**: engineering, sales, analytics and leadership
all contribute what they know about a customer, and the same AI front door
answers questions for all of them.

One sentence: *Revenact turns the scattered evidence of a customer relationship
into a health score you can defend, a question you can ask in plain English, and
a decision your team makes together.*

---

## 2. The problem

| Problem | How it shows up | What Revenact does about it |
|---|---|---|
| Health scores are opinions | A CSM types "7 out of 10" into a CRM field and nobody can reconstruct why | `Customer.health_score` is computed from five weighted components and the breakdown is shown on hover. A human can override it, and the override is recorded as feedback. |
| Evidence is scattered | Calls in one tool, tickets in another, email in a personal inbox, context in someone's head | Mailboxes, ticket sources and calls are ingested into the customer record. Colleagues write contributions against a customer. Retrieval reads all of it. |
| Knowledge lives with one person | The only person who knows why an account is unhappy is on holiday | @mention a colleague or a whole function in a question; their answer is stored as company knowledge. |
| Management questions cut across dashboards | "What is NRR by product this quarter versus last?" has no home | A metric registry defines 21 numbers once, reads them from the same rollups the dashboards draw, and records them at each month end. |
| AI answers arrive without their working | One person gets an answer in a private chat and the team has to take it on faith | A Copilot conversation can be made a live session: colleagues join mid-run, see the same transcript, redirect the agent, and capture what was decided. |

---

## 3. Users

### 3.1 Tenancy

Every row belongs to an `Organisation` (the tenant). A tenant has members
(`User`), and each member has a **function** and a **role**.

### 3.2 Functions (who someone is)

`cs`, `engineering`, `sales`, `analytics`, `leadership`, `other`. Function drives
knowledge routing (`@engineering` reaches the engineering owner) and ticket
visibility (a ticket source is stamped with a department).

### 3.3 Roles and capabilities (what someone may do)

Roles are per tenant and hold a list of capabilities. Two system roles are created
with every organisation: **Admin** (all capabilities) and **CSM** (none).

| Capability | Unlocks |
|---|---|
| `manage_users` | User Management page, add/edit members, create roles |
| `manage_org_settings` | Organisation settings, currency, products, model budgets |
| `manage_custom_objects` | Define custom objects and fields |
| `manage_integrations` | Connectors and webhooks |
| `manage_fx_rates` | Exchange rates |
| `view_all_accounts` | The whole book rather than a personal one; Company scope in the Brain (with Leadership) |

### 3.4 The org chart

`User.reports_to` forms a tree. It is not decoration: it decides who can read a
personal note, a task, a synced email and a sliced Copilot transcript. The rule
the product owner chose is **"me and my juniors, not my seniors"**.

### 3.5 Primary personas

| Persona | Typical capabilities | Main surfaces |
|---|---|---|
| CSM | none beyond the defaults | Organisations, Accounts, Contacts, Pipelines, Copilot, Health dashboard, their own Brain (Me), What's being done (their own initiatives) |
| CS lead / manager | `view_all_accounts` | Everything a CSM sees plus their reports' books, the Knowledge Brain and My team in the Brain |
| Function specialist (engineering, sales, analytics) | none | Company View on a customer, the question inbox, Copilot |
| Leadership | `view_all_accounts`, usually all | Brain overview (brief, signals, metrics, drivers), Initiatives |
| Admin / ops | all | Settings, Users, Integrations, Agents (model budgets) |

---

## 4. Product principles

These are decisions already made and encoded in the product. Change them
deliberately, not by accident.

1. **Never fabricate a number.** A component with no data is excluded from the
   health rubric and the rest are rescaled, rather than scored zero. A missing
   pulse rating is null, not a 1. Charts leave unrated accounts out and say how
   many.
2. **Computed with override.** Derived values stay derived. A human correction is
   stored separately (`health_score_override`) and recorded in the feedback log,
   so the rubric and the human opinion never overwrite each other silently.
3. **Visibility is a product feature, not a setting.** Personal notes, tasks and
   mail follow the management chain. Tickets and pipeline items follow the
   department. Customer records follow ownership and responsibility. There is one
   definition of each rule in code and every surface calls it.
4. **Explicit opt-in for multiplayer.** A Copilot session never becomes visible to
   colleagues because a risk signal fired. Someone clicks to make it live, or
   hands it off.
5. **Evidence with every answer.** Copilot replies carry sources. A metric
   explanation cites figures. A proposal carries the rows that justify it. A reply
   that cites something the viewer may not read is withheld rather than trimmed.
6. **No task queue.** Background work is idempotent management commands on a
   timer. This is a deliberate trade against Celery's operational weight, revisit
   only when work needs retries or fan-out.
7. **Mock data is a bug, not a stage.** Every screen either reads the backend or
   is honestly labelled as not built.

---

## 5. Feature areas and status

Legend: **Built** end to end; **Partial** works but a named piece is missing;
**Backend only**; **Planned** no implementation.

### 5.1 Foundation

| Capability | Status | Notes |
|---|---|---|
| Organisation signup, JWT login, refresh, logout | Built | Refresh tokens rotate and blacklist; logout revokes |
| Forgot / reset password by email | Built | Always answers 200, never reveals whether an address exists |
| Own profile, change password | Built | |
| Members, roles, capabilities | Built | Roles are editable per tenant; system roles are protected |
| Org chart (`reports_to`) | Built | Manager column in User Management |
| Organisation settings | Built | Name, currency, default lifecycle stage, AI agent enable and tone, global attribute mapping |
| Multi-currency with FX | Built | Current rates only, no history |
| Audit log | Built | Append-only `AuditEvent`, catalogue in `docs/audit-events.md` |
| MFA | Planned | Formally excepted until 2027-03-31 (`.soc2/EXCEPTIONS.md` EX-001) |

### 5.2 Records

| Capability | Status | Notes |
|---|---|---|
| Organisations (customers): list, board, detail, create, edit, churn, archive | Built | 34 selectable table columns, health and CSAT popovers show real breakdowns |
| Organizations portfolio (list redesign) | Built (backend) | One endpoint for the page: rows with health trend, renewal runway, pulse, last touch and one signal computed by the dashboard's own code; the six detail panels; group, sort, filters and cursor pages; summary tiles over the filtered set; CSV export of all 34 fields; bulk owner, stage and archive under the single-edit rules |
| Organisation page Story (detail redesign) | Built (backend) | One endpoint for the Story tab: every record on the organisation and its accounts (activities, CallSense calls, emails, meetings, tickets, tasks, notes, surveys, health and pulse changes), newest first under one cursor; group, source, account, search and thread filters; counts per group, kind and account; Needs attention (renewal, urgent tickets, overdue tasks, open questions, latest anomaly). Every record read under its own rule |
| Organisation page lists (detail redesign, delivery 2) | Built (backend) | Files and calls on an organisation roll up its accounts' records the viewer may open, each tagged with its account; contacts, opportunities and risks carry `account_id` for the account chips; the survey list filters by organisation (`?customer=`), an id the viewer cannot open reading as empty |
| Account page Story and tabs (accounts redesign, delivery 2) | Built (backend) | `GET /accounts/<id>/story/` is the organisation story over one account: only records filed on it, the same filters, counts and cursor, each record read under its own rule. Needs attention is the account's renewal, urgent tickets and overdue tasks. The page's tabs and creates use `/accounts/<id>/…`, keyed by the account alone, so an account opens even when none of its organisations does |
| Accounts: list, board, detail, create, edit | Built | Many-to-many with customers. No churn or archive by design |
| Accounts portfolio (list redesign) | Built (backend) | One endpoint for the page: rows with health trend, renewal runway, pulse, last touch and one signal computed by the dashboard's own code; the four detail panels; group, sort, filters and cursor pages; summary tiles over the filtered set; CSV export of the same filtered set, audited; bulk owner and lifecycle changes, gated to whoever may reassign and audited. No archive or churn on Accounts, so no `include_churned` filter and no archive/churn bulk action |
| Contacts: list, detail, CRUD, computed sentiment | Built | Sentiment read from that contact's own calls, tickets and emails, in their own tenant. The list filters by organisation, account, sentiment and role, names each person's organisation and account, and summarises the whole filtered set. `GET /contacts/<id>/history/` gives their calls, emails and tickets, each under its own record rule (backend) |
| Activity feed: activities, emails, tasks, notes, tickets, calendar events, surveys, sessions, headlines, files, CallSense | Built | Tasks and notes can be created in place; emails can be composed |
| Activity feed: Slack | Partial | The only remaining inline mock in the app |
| Activity feed: Pulse, Conversations, Revenact Support | Planned | Render "coming soon" |
| Success Plans tab | Planned | Placeholder on both detail pages |
| Files | Built | Closed type list, magic-byte check, 25 MB cap, authenticated download only. An organisation's list includes its visible accounts' files, tagged |
| CallSense | Built | Log a call, attach a transcript, model writes the summary, call is classified immediately from its summary (a digest of the whole transcript), else its transcript, else its title. A call with nothing to read is "not analysable", never guessed. An organisation's list includes its visible accounts' calls, tagged |
| Custom objects and fields | Built | Definitions, fields, records; records scoped to a customer or account |
| Pipelines (opportunities and risks) | Built | Kanban with drag to stage; department and role scoped. One book of opportunities or risks across organisations and accounts (backend, 2026-09-30): tiles (open, closing or due in 30/90 days, overdue, won or mitigated this quarter, a stage strip), group (stage, close month, organisation or account, owner, department, priority), five sorts, filters and cursor pages with Board columns; CSV export and bulk stage, priority, department and date, all twice filtered (openable parent, readable department). Expected close / due by dates, a Closed Lost stage, audited writes; `companies` names only organisations the viewer may open |
| Segments | Backend only | Saved, rule-based groups of organisations, accounts or contacts: match all or any of up to 20 conditions (one level of groups) over a fixed field registry, including AI attributes and, for contacts, their organisation's or account's fields; pins and keep-outs. Shared privately, with the workspace or chosen teammates; a viewer sees only the members they may open plus a count of the rest; only the owner edits. Members read as each list's own rows with tiles (members, ARR covered, average health and CSAT, entered and left in 7 days), CSV export, a live preview, and a nightly entry/exit history with an optional daily alert to the owner |
| Surveys (NPS, CSAT, CES) | Built (backend) | Logged and scored by hand, or sent: one standard question by type, emailed to a segment's people (roles ticked, at most 3 per organisation or account, nobody surveyed in 30 days, at most 500 a send, 20 sends a day counted from midnight UTC, the server's time zone) as a one-time link to a public form (14 days, one answer). Answers set the organisation's and account's rolling 90-day NPS, CSAT and CES and write one log row per send and record. Sends are private or shared; readers see answers only from people they may open, plus a count. No reminders, approval queue or custom questions yet |
| Rules (when → then) | Built (backend) | One trigger (entered or left one of my segments; CSAT, NPS, CES or health crossed a line; weekly or monthly) and one to three actions (notify, create a task, change the lifecycle stage, send a survey, start a plan, send a campaign) on the owner's own segment, run nightly as the owner over records they may open. Once per record per cooldown (default 30 days), at most 200 a night; surveys and campaigns wait in the owner's review unless sent without review, and go through every Surveys rule; a rule switches itself off when its segment or owner goes away. Shared like segments; readers see only records they may open, plus a count |
| Plans (Project Management) | Built (backend) | Milestones and tasks on one organisation or account, from four built-in templates (Onboarding, Success, Save, QBR) or personal ones shared like segments; started by a person or by a rule's "Start a plan". Read by whoever may open the record, each task under its own rule ("N tasks you can't see"); edited by the plan's owner and their managers. On track with the first work done, at risk nightly when a milestone is overdue, done when every milestone is; one open plan per record per template |
| Work: tasks you can work | Built (backend) | My work (my open tasks: overdue, today, this week, later, blocked; Today was folded into it in Work in one place) and Team (Me / My team / Company: open, overdue and blocked per person, with a drill-down), only tasks and records the reader may open, the rest counted. A task panel edits title, description, status (Blocked needs a reason), due date, priority and assignee (only people who can open the record), takes comments and keeps an activity trail. Every task, however made (a person, a plan, a rule, the AI agent), except the Scenarios engine's Create Task, which is deferred with the Scenarios round, has a real assignee who is told in-app |
| Work: Recommended | Built (backend) | Every day (and on Settings › Work › Run now) Revenact recommends tasks from signals across the company: renewals due, health drops, urgent tickets and live anomalies (overdue tasks, unanswered questions and the AI agent's proposals show on Work as themselves). Each lands in the suggested person's manager's queue (or theirs, by setting) with its reasons in plain sentences, and the recipient is told once a day. Assigning makes the task (its why in the description, a sensible due date, the assignee told); dismissing needs a reason and holds the signal back for a cooldown unless it gets worse. Only records the reader may open (the rest counted). Settings › Work turns each source on or off and sets its threshold |
| Work: tracking that pushes | Built (backend) | Work's "today" and working days follow the workspace's own timezone and working days (Settings › Work; Brain and other sections keep the server date). A task overdue and not Blocked nudges its assignee at most once per workspace-local day on working days; after `escalate_after_days` working days (straight away for a deactivated, suspended or revoked assignee; a suspended or revoked member gets no work, escalation, digest or fallback) its assignee's active manager, else the workspace owner, is told once. Reassigning, re-dating or re-opening a task re-arms the escalation. Everyone reads their own plain-text daily digest (overdue, due today, recommendations waiting, blocked) after the workspace's digest hour on working days, once per person per local day, only when there is something to report and only counting and naming what they may open; a personal opt-out and a workspace switch. Email sending itself is the owner's: production has no SMTP yet, so digests are skipped there until it is set (`email_ready` says so) |
| Work: in one place | Built (backend) | A person can write a to-do for themselves with or without an organisation or account; without one it is private to them. My work lists everything waiting on them in one feed: decisions, overdue and dated tasks, to-dos and suggestions, with one badge. Work › Team shows what waits on your team (My team, or Company for view-all and Leadership): decisions, overdue tasks and suggestions for the people below you, with the actions today's rules allow, and Ask the agent (Company, view-all). Brain › Waiting on you, Work › Today and the overdue-task, open-question and agent-action recommendations are gone: each of those things shows on Work as itself. An AI agent's proposals get one "AI proposal waiting" bell notice a day for the people who could decide them on their own My work. |
| CSV import of organisations | Built | Column mapping UI under Settings, Entity Uploads |
| Canvas (stakeholder map) | Built | A live map on an organisation or account: positions and labelled relationships are stored, and each person's role, sentiment, last contact, latest survey answer and unsubscribed flag are read live under the reader's rules (people they may not open stay on the map, nameless). Made from the record's people in rows by role, or blank; anyone who may open the record edits, a save from an older copy is refused; the creator and their managers delete; the record's open plans beside it |
| Campaigns | Built (backend) | An owner's plain-text email to one of their segments (Surveys' audience: roles ticked, three per organisation or account, only people the owner may open), with `{first_name}`, `{organisation}`, `{sender_name}`, a fixed footer and a one-click unsubscribe; a person gets a campaign once and at most one campaign email every 3 days; every send kept with who was emailed or skipped and why; shared like segments, owner-only to change or send; a rule's "Send a campaign" waits in the Review Queue unless sent without review. No HTML, tracking, scheduling or A/B tests |

### 5.3 Intelligence

| Capability | Status | Notes |
|---|---|---|
| Health rubric | Built | Five weighted components out of 10; largest-remainder apportionment so the parts sum to the headline |
| Account and organisation pulse | Built | 1 to 5 from five signals, daily dot recorded |
| Health history | Built | Monthly `HealthSnapshot`, month already recorded is skipped not overwritten |
| Interaction classification | Built | Claude assigns sentiment plus a three-level taxonomy to emails, calls and tickets. On create, and nightly on the server (`classify_interactions --limit 300`), one tenant at a time and metered to it |
| Contact sentiment | Built | Weighted by interaction kind and recency |
| Headlines (AI summaries per account) | Built | Explicit generate, evidence recorded |
| Copilot chat with retrieval and citations | Built | Local embeddings for semantic company matching, snippets as sources |
| Copilot streaming | Planned | Answers arrive in one shot |
| Copilot tool-calling agent (M3) | Planned | Today every send is one model call |
| Metric layer (21 metrics, month-end snapshots) | Built | Read from the same rollups the dashboards draw. `shelfware_arr` and `at_capacity_arr` read null ("Not measured"), Company included, when no customer in the book has seats recorded |
| Brain scopes and What changed (Me / My team / Company) | Built | Every member; figures recomputed over the scope's own book; briefs and explanations kept per scope |
| Brain: Waiting on you (Me / My team / Company) | Removed | Replaced by Work (My work for the reader's own, Work › Team for team and company) in Work in one place, delivery 2 |
| Brain: What's being done (Me / My team / Company) | Built (backend) | Initiatives, plans (health and ARR then → now) and rules at work on the scope's books; anyone may start an initiative on their own book; only records the reader may open (the rest counted) |
| Brain: What customers are saying (Me / My team / Company) | Built (backend) | The scope's top asks and anomalies (See all opens the full lists with the same scope), NPS / CSAT / CES over 90 days against the 90 before with the latest comments, and who turned negative in 30 days; revenue and scores only over records the reader may open, the rest counted. The knowledge graph takes the scope and is open to every member |
| Metric slices by owner, product, segment, lifecycle | Built | Only where the rollup already computes the cut |
| Signals (material moves with drivers) | Built | Material means 5 points or 10 percent |
| Management brief | Built | Written from the metric layer only, never from records |
| Metric explanations ("why is this number here") | Built | Behind a "Why?" control on every tile and signal |
| Ops agent proposals and review queue | Built (superseded by Agents, below) | Proposes tasks and initiatives only; answers validated against what the prompt offered; a task proposal is decided by its customer's owner, anyone above them, or view_all_accounts. The old review queue routes were removed in Agents delivery 2. |
| Agents: CS, Sales and Ops (delivery 1, backend) | Built | Three agents act on the book overnight. Each sees only the records its function's own people own (Ops: the whole workspace), makes one model call a night, and proposes at most 8 actions from 10 kinds: change lifecycle stage, change owner, set an AI attribute, create / reassign / redate / snooze / complete a task, file a note, start an initiative. Nothing is ever sent to a customer |
| Agents: Auto / Ask / Never | Built | An admin sets each kind per agent in a grid. Ask waits for a person (the record's owner, anyone above them, or view_all_accounts; initiative: view_all only), Auto applies at once, Never is never offered and expires what is waiting. Some kinds cannot be Auto (change owner, mark a task done, start an initiative) |
| Agents: undo and Activity | Built | Anything an agent applied can be undone for 7 days, unless the thing has changed since. Whoever approved it (the owner, on Auto) is told. Activity lists every action, counting but never naming those on records the reader cannot open; evidence lines go only to view_all_accounts readers |
| Agents: budgets | Built | Each agent has a monthly credit budget (default a fifth of the plan's credits split three ways), shown as spent this month and when it resets. A used budget skips the agent until the 1st |
| Agents: draft replies (delivery 2, backend) | Built | The CS and Sales agents draft a reply to a record's newest unanswered customer email, or its open ticket, for the record's owner. Drafts live in Revenact: the owner edits, sends (from their own mailbox, threaded on the email) or discards an email draft in Communications, and copies a ticket draft into its source and marks it sent. Only people who may read the email or ticket see the draft or its action; everyone else sees a count |
| Agents: start a plan (delivery 2, backend) | Built | The CS and Sales agents propose starting a plan from a template the whole workspace shares; a person approves it. Undoing it returns the plan to Draft with its tasks kept, and Start plan starts it again from today |
| Agents: the builder (delivery 3, backend) | Built | The Ops agent proposes a whole segment, scenario, campaign draft or plan template, and every agent a map of a record's people. A person approves each (never Auto) and owns what it makes; a scenario starts switched off and a campaign as a draft, so only its owner switches it on or sends it. Each object says which agent made it and who approved it, and undo removes it for 7 days while nobody has touched it. The Brain graph shows every waiting action the reader may read |
| Agent bundles (delivery 1, backend) | Built | Every agent proposal is a bundle of ready-to-run steps (a single action is a bundle of one). A person edits a step, unticks any, and presses Run selected; steps run in order, a failed step shows its error and Retry while the others still run; Reject takes a reason the agent reads for 30 days. The Ops agent can also propose sending a survey or a campaign, previewed with its audience, or saving it as a draft only; a sent one can't be undone. Work is an inbox: Mine, My team, Rest of company and History |
| Agent bundles (delivery 2, backend) | Built | Agents read what arrives: email filed to a customer and every ticket connector (Slack, until 2026-10-15 when Slack threads became conversations; Zendesk, Freshdesk, Jira, webhooks). On the workspace's interval (every 30 minutes, hour, 4 hours or day; hourly by default), each conversation quiet for 15 minutes is read once, and the agent proposes a bundle for the record's owner, or, when the owner can't read the source or there is none, for the connector's department queue or the admins' Unassigned queue. A newer message updates a bundle nobody edited; one a person edited says "New message since you edited" and offers Refresh suggestions, which keeps their edits. Edits are saved as they are made. Settings › Agents sets the interval and switches each source; out of credits, conversations wait and the page says how many |
| Agent bundles, delivery 3: outside actions (backend) | Built | A bundle's steps may send an email reply from the runner's own mailbox, reply in Slack (the thread, or a channel Revenact reads), open a Jira issue and assign one; each tool is Read only or Can act per connection (Slack consent or token, Jira permission check), outside steps are always Ask and can't be undone, every Retry looks for an earlier write first, every call is audited, a failed step tells its runner; the agents propose them under the twice-filter |
| Agent bundles, round 2 delivery 1 (backend) | Built | An agent may comment on a Jira issue (an internal comment, always Ask, found again by its ref on a Retry); Outlook replies thread through Graph's reply when the mailbox holds the original; an Outlook mailbox's owner writes a signature that agents add to replies, and a Gmail signature is still read from Gmail. Round 2 is scoped to Gmail, Outlook, Jira and Slack: Zendesk, Freshdesk, the webhook and other connectors wait. |
| Agent bundles, round 2 delivery 2 (backend) | Built | A person may link their own Atlassian account (Settings > Connections, "Link your Jira account"; optional, only theirs, removable). An agent's Jira step then acts as whoever runs it, and the panel says so ("Created in Jira as you (Carl Lee)", or "as Jira Bot" with a hint to link); a link that stopped working blocks that person's Jira steps with a plain sentence until they link again or remove it. A Slack step can move to a channel Revenact does not sync, picked from a live, searchable list of the channels the Slack app is in; a private channel Revenact does not read is for admins only. A mailbox with no credentials can no longer send an agent's reply. Next: round 2 delivery 3 (unmatched items, the fast lane), now built. |
| Agent bundles, round 2 delivery 3 (backend) | Built | Needs a customer: a Slack or Jira message from someone outside the workspace that matches no customer waits in the connector's department queue (or Unassigned) for its people, with the first 2,000 characters of its text. A person matches it to a customer or account they can open that the connection covers (optionally adding the sender as a contact) and its thread joins the next run, or dismisses it (its text goes at once). Unmatched items are never read by a model and are deleted 30 days after they were last seen. The fast lane (Settings > Agents, admins, off by default): urgent threads (a critical Jira priority, a chosen Slack connection, a listed sender or word, or a customer in Poor health) are read after 2 quiet minutes on a 5-minute tick, at most 10 a tick, 10 an hour and 50 a day, charged as agent calls. Connection changes are audited. Jira Service Management: an issue an agent creates has no request type; set one in Jira so it shows in the portal and in request-type queues. |
| Slack escalations, delivery 1 (backend): Slack as a conversation | Built | A Slack thread is a conversation, never a ticket. Each pass reads the last 7 days of the connected channel with the replies, and keeps at most 50 messages of a thread (3,000 characters each; no files, reactions or edits). The customer is found from the channel (a connection set to one customer or account), else from a customer or account name in the first message (exactly one the connection covers), else the thread waits in Needs a customer with the records it mentions (up to five); two similar names file nothing. A colleague's message is no longer dropped. A person matches it to a record they can open and it becomes a conversation (no contact is added). Connecting checked the bot was in the channel (replaced by delivery 3: a connection covers every public channel). The agents read the conversation's newest 8 messages and reply in its thread. Conversations show in the organisation and account Story (Slack thread, in Conversations) and `GET /slack-conversations/<id>/`, read department-wise like tickets. Slack tickets already stored become conversations. Slack no longer feeds Communications or contact sentiment, because a thread is no longer a ticket. |
| Slack escalations, delivery 2 (backend): account team and department heads | Partial | The backend is built; the screens (naming heads and the account team in Settings › People & teams) follow in the frontend delivery. Each function has at most one department head per workspace (any member reads, `manage_org_settings` names; the head must be an active member working in that function). A customer's account team is one person per function (Customer Success is the owner), and a change to it is audited. Who handles a customer's escalation in a function is the account team's person, else the function's head, else nobody; a person who left or moved is skipped. An account's Customer Success goes to the account's own owner first, else its single parent customer's answer, else the head. Nothing calls it yet: the escalation bundle (D3) will. |
| Slack escalations, delivery 3 (backend): every public channel syncs, pushed by Slack | Built | One Slack connection covers every public channel of its Slack workspace; connecting asks for the token alone, never a channel. Slack sends each message to Revenact as it is posted (Slack's Events API), and it is filed at once: by the channel's own customer or account when an admin set one, else by a name in the message, else it waits in Needs a customer. Replies, edits and deletions follow. Revenact joins public channels itself (new ones the moment Slack announces them) once the app is approved with `channels:join`; until then it reads the channels it is already in. Admins see the channel list in Settings (`manage_integrations`), switch a channel's sync off or on and set its customer, and see whether events arrive; every change is audited. Slack Connect channels are listed but excluded by default. Because Slack now allows an app outside its Marketplace one history read a minute, polling is only a slow catch-up for what events missed (one page of 15 and one thread a pass). Today's one-channel connections keep their channel and customer through a migration. A reply step may move to any included channel of its connection. |
| Slack escalations, delivery 4 (backend): the thread decides | Partial | The backend is built; the panel (who handles it, where that came from, Change, the participant view, the story's links) follows in the frontend delivery. A colleague's Slack thread that needs work becomes one bundle: a Jira issue (its description links back to the thread), its assignment, a to-do and the reply in the thread, last. The person is the one the thread named: a request, a statement or a proposal ("Faiz, can you take this?", "Faiz is on it"), the newest one winning, made by a workspace member; a bare mention ("cc @Faiz") decides nothing. A Slack mention is resolved through the person's Slack link or their Slack email (read and dropped, never kept); a plain name through the thread's people, then the workspace. When the thread names nobody, the account team has it (the account team's person, else the department head, else nobody), and the panel says so. The issue is filed under the organisation at once, linked both ways with the thread (each side named only to people who may read it), with a Jira remote link back. A person with no Jira account is not assigned in Jira (the step says so) and still gets the to-do; someone who can't open the customer gets the Jira assignment and the to-do goes to the owner. The reply carries the real Jira key and link, never in a channel shared outside the company, and posts as whoever runs the bundle when they linked Slack. **The people who wrote in the thread may accept that bundle**: it is in their Work, and someone who can't open the customer sees only what will be sent. Change picks another person or asks the account team again. Small talk makes no bundle. Send to Revenact never posts the Jira link into a shared channel either. |
| Connections: personal Slack link and Send to Revenact (backend) | Built | A person may link their own Slack account (Settings › Connections; user scopes `chat:write`, `users:read` only, never a DM scope; optional, only theirs, removable and revoked on unlink). Slack replies their agent steps post go out as them (the bot when they have no link or their token stops working), and threads they start in synced channels name them. The Slack message shortcut "Send to Revenact" sends one chosen message (any channel or DM) to that person's own Work as a private suggestion: a one-sentence summary, the sender, the customer when the sender is a contact the person may see, a link back to Slack and a suggested step; nobody else sees it, and it is deleted when dismissed or after 30 days. |
| Initiatives with follow-through | Built | Baseline captured once, progress read live, tasks link back |
| Feedback log | Built | Classification corrections, proposal decisions, health overrides |
| Model audit and budgets | Built | One `ModelCall` row per call, per-purpose monthly token budgets, 429 when exceeded |
| Knowledge graph | Built | Owners, customers, products, initiatives, proposals; edges only where a foreign key exists |
| AI-filled attributes | Built | An admin's plain-English question answered per company with reasoning and cited sources; append-only history with human overrides; nightly refresh reads as the owner |
| Feature requests with revenue | Built | Classified asks clustered into named requests by embedding; ARR, company and interaction counts computed over the reader's own book; `?scope=` narrows the list to a Brain scope's book first |
| Knowledge gaps and the account brief | Built | What the company cannot answer, raised from unanswered Copilot questions and stale routed ones; the standing brief on use cases, stakeholders and open threads |
| Anomaly clusters | Built | The same fault across several companies, found by embedding the fortnight's classified reports and kept only when it is a real spike; `?scope=` narrows the list to a Brain scope's book first |
| Translation | Built | Read an inbound message in your own language and write the reply in theirs; cached per record, and contacts learn the language they write in |
| Management brief to Slack | Built | Weekly or monthly delivery of the brief to a channel, posting what exists rather than generating on a schedule |
| MCP server | Built | An agent outside Revenact reads as the person whose token it holds, read-only, under their own visibility |
| Dashboard Overview — "Needs attention" | Built | Renewal, risk, going-quiet, support and anomaly items scored by ARR at stake × urgency, twice-filtered like every other dashboard; per-user snooze (a number of days, or Done) that reappears early if the item gets worse |
| Ask Revenact on the Dashboard | Built (backend) | Questions asked on the Dashboard carry where they were asked; the server recomputes that area's figures for the asker's own filtered book with the same code as the screen, adds the records behind the companies asked about under their own rules, and answers only from those. Metered as its own purpose; one history across Communications, Copilot and Dashboard, tagged with where each conversation started |
| Ask Revenact on Organizations | Built (backend) | The Ask rail on Organizations sends the list's view and filters. The server recomputes the asker's own filtered list with the portfolio's code (tiles, sections, the ten riskiest accounts, renewals inside 90 days), adds the records behind the account opened, and answers only from those. It is metered as its own purpose. History is tagged "Organizations · <filters>", and reopening a conversation restores the list |
| Ask Revenact on the organisation page | Built (backend) | Asked on one organisation's page, optionally narrowed to an account or about one story item. The server re-checks both ids and the item for the asker, and answers from the organisation's row, what needs attention and the last 30 days of its story, plus the records behind the question. History is tagged "Pizza Hut" or "Pizza Hut · EMEA". A shared reply is checked against every story record it quoted |
| Ask Revenact on Contacts | Built (backend) | Asked on the Contacts list (the asker's filtered list: summary and at most 50 people) or on one person (their profile and the newest 20 calls, emails and tickets the asker can read). "Why this sentiment?" weighs only readable records and says when the stored reading also rests on others. History is tagged "Sam Pizza · Pizza Hut" or "Contacts · Negative". A shared reply is checked against every organisation, account and record it drew on |
| Ask Revenact on Accounts | Built (backend) | Asked on the Accounts list or Board (the asker's filtered accounts: tiles, sections, ten riskiest, renewals within 90 days, equal to the portfolio's) or on one account's page (its row, what needs attention, the last 30 days of its story and the item asked about, each under its own rule). History is tagged "Accounts · Owner: Carl CSM" or the account's name. An account or story item the asker cannot open is refused the same whether it exists or not. A shared reply is checked against every organisation, account, record and ticket department it drew on |
| Ask Revenact on Pipelines | Built (backend) | Asked on the Pipelines List or Board, for opportunities or risks, in one conversation across both. The server recomputes the asker's filtered book with the page's code: the stages each view lists (open on the List, every stage on the Board), tiles over every stage, sections, the ten largest open items (and, when closed stages are listed too, the ten largest closed), what is overdue and what closes or is due within 90 days. "Ask about this" focuses the question on one item. History is tagged "Pipelines · Opportunities · Owner: Carl CSM". An organisation, account or item the asker cannot open is refused the same whether it exists or not. A shared reply is checked against every organisation, account and department it counted and every item it quoted |
| Ask on the Brain | Built (backend) | Asked on one of the four Brain tabs (What changed, Waiting on you, What's being done, Customers) for the asker's scope (Me, My team, Company). The server rebuilds the tab with the page's own code, adds one line for each other tab and the scope's latest brief the asker may read. Hidden records are counted, never named. A scope the asker may not use is refused. A shared answer is read by its asker and by readers in the same organisation who see everything and read every ticket department, whoever they are in the conversation (its owner and session participants included); anyone else sees the question with the answer withheld, and it reaches their next question and the session facilitator only as that notice |

### 5.4 Multiplayer Copilot (the centerpiece)

The product owner describes this as "the crux of making this software".

| Phase | Scope | Status |
|---|---|---|
| M0 | Prototype: real Claude content, simulated multiplayer transport | Built, since replaced |
| M1 | Full account coverage | Built |
| M2 / Phase 2a | Real persistent invite-only cross-user sessions | Built |
| M2 / Phase 2b | Real WebSocket push, Redis channel layer, slow poll as fallback only | Built |
| Facilitator | Reads the session transcript and stores what the people decided as proposals | Built |
| M3 | Multi-step tool-calling agent replacing the single-shot call | Planned |
| Ephemeral presence ("who is looking right now") | Beyond `SessionParticipant` | Planned |

Access model: **invite only**. A session exists when the owner makes it live or
hands it off. An invited member must accept. The same visibility function gates
the REST endpoints and the WebSocket handshake. Sharing a session shares the
conversation, not anyone's data rights: a reply someone else asked that draws on
what a reader may not open is withheld from them, the owner and participants
included; everyone always reads their own replies.

### 5.5 Knowledge layer

| Capability | Status |
|---|---|
| Contributions per customer, attributed and function-stamped | Built |
| Per-function owners on a customer, plus one accountable account owner from any function | Built |
| Owner handover with a note, recorded as a contribution | Built |
| Questions with @mentions, routed and notified | Built |
| Function mentions (`@engineering`, `@team`) | Built |
| Question inbox in the Copilot sidebar, one-click ask suggestions | Built |
| Question aging, stale after 3 days, daily nudge | Built |
| Knowledge activity per function | Built |
| Org-chart scoping of everything above | Built |

### 5.6 Integrations

| Capability | Status | Notes |
|---|---|---|
| Personal mailboxes: Google, Microsoft, IMAP | Built | Per person; the whole inbox is the owner's, filed against a customer only when the counterpart is a known contact or domain |
| Two-way Gmail, delivery 1: the sync engine (backend) | Built | Per-workspace pilot switch in the portal; connect only on a verified domain, with a seat, all three Gmail scopes; 12-month import; Gmail's labels drive folders and flags; HTML, CC/BCC and attachment details; push as an optional wake-up; paused (never deleted) when the member, seat or workspace stops qualifying; copies kept 30 days after a disconnect. Write-back (delivery 2) and drafts and threaded sending (delivery 3) next |
| Two-way Gmail, delivery 2: actions (backend) | Built | Read, star, done, delete, spam and labels go back to Gmail through an outbox that collapses, retries, undoes what Gmail refuses and tells the owner once; conversations; the label sidebar with unread counts and labels made here; bulk actions; attachments opened from Gmail and listed on the record's Files tab under the twice-filter. Outlook and IMAP stay local. Drafts and threaded sending (delivery 3) next |
| Two-way Gmail, delivery 3: writing (backend) | Built | Drafts both ways (written here or in Gmail, edits from either side with a revision guard), new, reply, reply all and forward with To/Cc/Bcc, HTML and attachments, the Gmail signature, every send threaded in Gmail (older routes too), agent email drafts that are also Gmail drafts, and searching older mail in Gmail. Outlook and IMAP unchanged |
| Compose and send from your own mailbox | Built | Copy filed as a sent email |
| Ticket sources: Zendesk, Jira, Slack, Freshdesk, generic webhook | Built (from 2026-10-15 Slack is no longer a ticket source: its threads are conversations, see Slack escalations delivery 1) | Department stamped on the connector and inherited by the ticket |
| Inbound ticket webhook | Built | Shared token or HMAC signature, size and count capped |
| Other connector providers (Intercom, Salesforce, HubSpot, Gmail, Teams, Zoom, GitHub, Figma) | Planned | Present as choices only |
| Outbound webhooks | Partial | One event (`customer.created`); SSRF guard and HMAC signature in place |
| Scenarios (visual automation) | Partial | Send Email, Create Task, Set Attribute, Churn Entity, Condition, Filter execute. Assign Playbook, Slack, Teams, Create Pipeline, Send Survey and Schedule are canvas-only. The simpler rules (Rules, above) sit beside it; the canvas is unchanged. |

### 5.7 Dashboards

Eight built dashboards, all reading the backend: Health Overview (five tabs),
Usage Overview, Revenue Forecast, AI Trending Topics, Activity Tracking, Ticket
Overview, Customer Overview, Product Usage. Plus standalone Lifecycle and Health
rollup pages. Custom Dashboard is a placeholder.

Five of them — Customer Overview, Activity Tracking, Revenue Forecast, AI
Trending Topics, Ticket Overview — support drill-down: a chart figure's
`?drill=` opens the real companies behind it, scoped to the same filtered
set the figure itself counts and the viewer's own book.

---

## 6. Non-goals

- **Not a CRM of record.** Revenact reads from the systems that own tickets and
  mail; it does not try to replace them.
- **Not a marketing automation suite.** Campaigns exist to reach known contacts,
  not to run drip programmes.
- **Not real-time analytics.** Metrics are recorded at month end. Health is
  recalculated daily. Nothing needs sub-minute freshness.
- **Not multi-region or high availability.** The deployment is deliberately one
  small virtual machine for a team to share.
- **No per-tenant pipeline customisation.** Opportunity and risk stages are fixed
  enums that match the board columns.

---

## 7. Open product questions

1. **Global attribute mapping is stored but not honoured.** An organisation can
   choose which field means ARR, but the dashboards still read the fixed default.
   Either wire the rollups to the mapping or drop the setting.
2. **"My book" on dashboards.** Visibility was widened so managers see their
   reports' customers, but the dashboards have no explicit personal-book filter.
3. **Ops agent assignee logic is prompt-only.** The rule "match the function,
   else the owner" is described to the model rather than enforced in code.
4. **Survey reminders.** Sends start by hand or from a rule (approved in the
   Review Queue, or sent without review); reminder emails are a later delivery.
5. **Default visibility of a live session.** The PRD flags making sessions visible
   by default as an unresolved risk. Today it is invite only.
6. **Retention.** Classification policy sets retention windows; no purge job
   exists (`.soc2` DATA-04).

---

## 8. Success criteria

| Question a user asks | The product answers it when |
|---|---|
| "Why is this account at 5.2?" | The health popover shows five real components with weights that sum to the headline |
| "Who knows about this customer?" | Company View lists the accountable owner and a responsible person per function |
| "Why did NRR move?" | The metric explanation cites the cuts and the accounts carrying the move |
| "What should we do this week?" | The review queue holds proposals with evidence, and approving one creates the task |
| "What did we decide?" | The session's captured decisions appear in the review queue tagged with that session |

---

## 9. Release history

| Date | Milestone |
|---|---|
| 2026-09-05 | Multiplayer Copilot phases 2a and 2b: real cross-user sessions, real WebSocket push |
| 2026-09-11 | Health rubric, health snapshots, Health Overview redesign on real data |
| 2026-09-12 | Metric layer, signals, brief, initiatives, Ops agent, review queue, feedback log, model budgets |
| 2026-09-13 | Company knowledge: functions, contributions, questions with mentions, org-chart scoping, knowledge graph; Azure deployment live |
| 2026-09-15 | SOC 2 controls: audit log, throttling, secure defaults, CI gates |
| 2026-09-16 | Personal mailboxes, ticket connectors, files and CallSense, contact sentiment, pipeline departments, account pulse, continuous deployment |
| 2026-09-18 | Agent skill sets vendored in both repos; Playwright agent CLI in the frontend |
| 2026-09-24 | Dashboard attention list; Ask Revenact on the Dashboard (backend) |
| 2026-09-25 | Organizations portfolio (backend): portfolio endpoint, export, bulk edit |
| 2026-09-26 | Ask Revenact on Organizations (backend) |
| 2026-09-26 | Organisation page Story (backend): `GET /organizations/<id>/story/` |
| 2026-09-27 | Organisation page lists (backend): files and calls roll up visible accounts, `account_id` on contacts, opportunities and risks, survey organisation filter |
| 2026-09-28 | Ask Revenact on the organisation page (backend) |
| 2026-09-28 | Contacts, delivery 1 (backend): every call analysed or marked not analysable, nightly classification, contact history, contacts list filters and summary |
| 2026-09-28 | Ask Revenact on Contacts (backend) |
| 2026-09-29 | Accounts portfolio (backend): portfolio endpoint, export, bulk edit |
| 2026-09-30 | Account page (backend): `GET /accounts/<id>/story/` and the account-keyed tab routes |
| 2026-09-30 | Ask Revenact on Accounts (backend) |
| 2026-09-30 | Pipelines, delivery 1 (backend): dates, Closed Lost, stage clock, the pipelines book, export, bulk edit, audited writes, `companies` trimmed |
| 2026-10-01 | Ask Revenact on Pipelines (backend) |
| 2026-10-03 | Segments (backend): model, rule registry and compiler, endpoints, nightly entries and exits, alert |
| 2026-10-03 | Surveys (backend): sends to a segment, one-time links and the public form, 90-day NPS/CSAT/CES from answers, nightly refresh |
| 2026-10-04 | Rules (backend): rules on the owner's segments, nightly as the owner, tasks, lifecycle, digests, survey reviews through Surveys |
| 2026-10-04 | Plans (backend): templates, plans on organisations and accounts, milestones moving with their tasks, nightly at-risk, the rules' "Start a plan" |
| 2026-10-04 | Campaigns, rebuilt (backend): owned and shared campaigns on a segment, sends with deliveries, merge fields, the unsubscribe link, existing campaigns migrated, the rules' "Send a campaign" through the Review Queue |
| 2026-10-04 | Canvas (backend): live stakeholder maps with person facts read for the reader, maps from people, versioned saves, creator-only delete, audited |
| 2026-10-05 | Brain delivery 1: scopes and What changed (backend) |
| 2026-10-05 | Brain delivery 2: Waiting on you (backend); proposal decisions open to the customer's owner and their chain |
| 2026-10-05 | Brain delivery 3: What's being done (backend); initiatives for everyone; plans keep their starting figures |
| 2026-10-05 | Brain delivery 4: What customers are saying (backend); ?scope= on feature requests and anomalies; the knowledge graph scoped and open to every member; contacts keep their previous sentiment |
| 2026-10-06 | Ask on the Brain (backend) |
| 2026-10-07 | Work delivery 1: tasks you can work (backend) |
| 2026-10-07 | Work delivery 2: Recommended (backend) |
| 2026-10-08 | Work delivery 3: tracking that pushes (backend) |
| 2026-10-08 | Agents delivery 1: the action layer (backend) |
| 2026-10-08 | Agents delivery 2: drafts and plans (backend) |
| 2026-10-10 | Two-way Gmail delivery 1 (backend): gates and the portal switch, the history loop with push and recovery, the 12-month import, labels, HTML, CC/BCC and attachment details, 30-day retention after a disconnect |
| 2026-10-11 | Two-way Gmail delivery 2 (backend): the outbox and every Gmail write-back, conversations, labels with unread counts, bulk actions, attachment downloads and the Files tab's mail attachments |
| 2026-10-12 | Two-way Gmail delivery 3 (backend): drafts both ways, compose and send with attachments and signature, threaded sends, linked agent drafts, Gmail search |
| 2026-10-13 | Agent bundles delivery 3 (backend): outside actions |
| 2026-10-14 | Agent bundles round 2 delivery 3 (backend): unmatched Slack and Jira messages for a person to match, the fast lane, audited connector changes |
| 2026-10-15 | Slack escalations delivery 1 (backend): Slack threads as conversations, the customer found from the channel or a name, Needs a customer for colleagues' messages |
| 2026-10-16 | Slack escalations delivery 2 (backend): department heads, the audited account team and who handles a record in a function |
| 2026-10-16 | Connections (backend): personal Slack link (post as me, show who I am) and Send to Revenact into a private Work suggestion |
| 2026-10-17 | Slack escalations delivery 4 (backend): the thread decides who handles it, the account team as the fallback, participants may accept, the issue filed and linked both ways |
| 2026-10-17 | Slack escalations delivery 3 (backend): every public channel syncs, pushed by Slack's Events API with a slow catch-up; admins exclude channels and set their customer; Slack Connect excluded by default |
