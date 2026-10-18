---
description: Prioritised implementation plan for Revenact — the work ahead as bite-sized tasks with files, tests and done-when criteria.
---

# Revenact — Implementation Plan

Written with the `writing-plans` skill. Every task assumes an engineer who is
skilled but has no context for this codebase: it names the files to touch, the
tests to write and what "done" means.

Derived from the gaps recorded in [PRD §7](01-prd.md#7-open-product-questions),
[TRD §10](02-trd.md#10-known-technical-limitations),
[UI/UX §12](../../../react-ts-app/docs/03-ui-ux-design.md#12-current-design-debt)
and the SOC 2 control map. Current as of 2026-09-18.

---

## 0. Working agreements

- **Read the skills first.** `brainstorming` before any creative work,
  `test-driven-development` while writing, `commit-messages` for the message,
  `api-contracts` if an endpoint changes, `flow-docs` if the wiring changes,
  `revenact-design` before any visual change, `soc2-dev` for anything touching
  auth, data, logging or infrastructure.
- **Three tiers of tests, always.** Unit, integration, end to end. A feature
  without all three is not done.
- **One concern per pull request.** Stack branches when a migration ordering
  forces it, and say so in the description.
- **Never chain a commit onto a grep of test output.** `grep` exits zero when it
  *finds* the word FAILED. Gate on a match for `^OK`.
- **Never run two Django test suites at once.** The second hangs on the "test
  database exists" prompt. Pass `--noinput`.
- **After any `seed_demo_*` run, run `recalculate_health`.** The seed writes
  fixture health scores back over computed ones.
- **Verify in the running app, not only in tests.** `npm run dev`, then
  `npm run pw -- open http://localhost:5173`.

### Prerequisite, blocking everything

**P0. Restore GitHub Actions billing.** Since some time after 2026-09-16 every CI
job on both repositories fails in under three seconds with "recent account
payments have failed or your spending limit needs to be increased". No job
starts, so nothing merges through the gates and nothing deploys. This is an
account action in GitHub billing settings, not a code change. Until it is fixed,
verify locally and say so in each pull request.

---

## 1. Correctness and trust

### A1. Account detail page must not fall back to mock data

**Why.** `/accounts/:id` renders from `location.state.account`. On a direct visit
or a refresh there is no state, and the page silently shows
`ACCOUNTS_DATA.find(...) ?? ACCOUNTS_DATA[0]`: a fabricated account, with the
Navbar header agreeing. A user can screenshot a customer meeting with invented
numbers. This is the last real mock dependency in the application.

**Files.** `src/pages/accounts/Details.tsx`, `src/components/layout/Navbar.tsx`,
`src/features/customers/customersSlice.ts`,
`src/components/organizations/accountsData.ts`.

**Steps.**
1. Add a `fetchAccountById(accountId)` thunk. The backend has no flat account
   detail route, so either add `GET /api/v1/accounts/<pk>/` in
   `services/customers/views.py` beside `AccountListView`, or resolve through the
   nested route when the customer id is known. Prefer the flat endpoint; it
   matches `ContactDetailView`'s precedent and the contract note about flat views.
2. On mount, use `location.state.account` when present, otherwise dispatch the
   fetch and render a loading state.
3. Render a real not-found state for an id outside the caller's scope. The
   backend already answers 404 rather than an empty body.
4. Do the same in the Navbar's account branch.
5. Delete `accountsData.ts` entirely once nothing imports it, including
   `accountActivityData.ts` and `activityData.ts` if they become orphans.

**Tests.** Backend: an `APITestCase` for the new endpoint including a
cross-tenant 404. Frontend: a Details test that renders with no navigation state
and asserts a fetch and a loading state, and one that asserts the not-found state.

**Done when.** A hard refresh on an account detail URL shows that account's real
data or an honest error, and `grep -r ACCOUNTS_DATA src` returns nothing.

### A2. Bring the stale documents back in line with the code

**Why.** Four documents actively mislead. An agent or a new engineer following
them will look for endpoints that no longer exist.

**Files.**
- `revenact-backend/.agents/workflows/repo-architecture.md`: lists only `core`,
  `accounts` and `customers`; says Contacts, Pipelines, Dashboards, Copilot,
  Scenarios and Company Brain are not started; references
  `CSMListCreateView`, `/csms/` and `IsOrgAdmin`, all removed.
- `revenact-backend/.agents/workflows/auth-flow.md`: same removed names.
- `revenact-backend/README.md`: project layout lists two apps under `services/`.
- `react-ts-app/.agents/workflows/repo-architecture.md`: claims only auth is
  wired, describes a four-reducer store, mentions `AdminRoute`.
- `react-ts-app/README.md`: claims the app "runs against in-memory fixture data
  (no backend required)" and lists demo credentials that are not the real ones.
- `revenact-backend/docs/API_CONTRACTS.md`: the Calendar Events row says the
  frontend is on a mock; it is wired. The Company Brain row says not started; two
  phases shipped.
- `services/accounts/models.py`: the `Organisation` docstring says Copilot has no
  backend.

**Steps.** Rewrite each in place. Never fork into a v2 copy; these are living
documents. Use this document set as the source for the current picture.

**Tests.** None, but the `soc2-scan` control-map drift check must still pass.

**Done when.** No document names a symbol that `grep` cannot find in the code.

### A3. Give the frontend README the real getting-started

**Why.** It tells a new engineer no backend is needed, which is false for every
screen, and offers demo logins that do not exist.

**Files.** `react-ts-app/README.md`.

**Steps.** State that the API is required, point at `revenact-backend`'s README
for bringing it up, give the real seeded logins, document `VITE_API_URL`, and
document `npm run pw` for driving the app.

---

## 2. Compliance, the named SOC 2 gaps

Each of these closes a control that is currently Partial or Missing in
`.soc2/CONTROL_MAP.md`. Load the `soc2-dev` skill before starting, and update the
control map and the gap report in the same pull request.

### B1. Retention purge job (DATA-04, Missing)

**Why.** `.soc2/config.yml` declares retention windows (audit 365 days,
application logs 90, personal data 30 days after account close, backups 35,
tickets 730). Nothing enforces the application-record windows.

**Files.** New `services/customers/management/commands/purge_expired_records.py`,
new `services/customers/retention.py`, `docs/data-classification.md`,
`.soc2/CONTROL_MAP.md`.

**Steps.**
1. Put the policy in one module: a table of model, date field and window, read
   from `.soc2/config.yml` so the policy and the code cannot drift.
2. Write the command with `--dry-run` reporting counts per model, and
   `--organisation` to limit the blast radius. Delete in batches.
3. Audit each run with `audit.record("retention.purge", ...)`.
4. Add it to `run_health_maintenance` only after it has run clean by hand for a
   week. Until then keep it manual.

**Tests.** Unit tests per window boundary, one day either side. An integration
test proving a row inside the window survives. Assert `--dry-run` deletes nothing.

**Done when.** DATA-04 reads Met with the command named as evidence.

### B2. Encrypt the webhook signing secret (DATA-02, Partial)

**Why.** `WebhookSubscription.secret` is plaintext in the column while mail and
connector credentials are Fernet-encrypted. The crypto helper already exists.

**Files.** `services/webhooks/models.py`, `services/webhooks/engine.py`,
`services/webhooks/views.py`, a migration, `services/mail/crypto.py` (reuse, do
not copy).

**Steps.**
1. Move `services/mail/crypto.py` to a shared location, or import it as is and
   note the dependency. Do not write a second Fernet implementation.
2. Add an encrypted column, write a data migration that encrypts existing values,
   drop the plaintext column in a follow-up migration.
3. Keep the behaviour that the secret is returned only once, on create.

**Tests.** A model test asserting the raw column is unreadable, a signing test
asserting delivery still verifies, and a migration test over an existing row.

### B3. Ship logs off the machine and alert on them (LOG-04, LOG-05)

**Why.** Logs live only in the container's stdout on one virtual machine. A
security event after a restart is unrecoverable, and nothing tells anyone.

**Files.** `revenact-infra/deploy/docker-compose.prod.yml`,
`revenact-infra/terraform/`, `.soc2/CONTROL_MAP.md`.

**Steps.** Pick the smallest thing that works on one machine: the Azure Monitor
agent to a Log Analytics workspace, or a log driver to a hosted collector. Then
one alert rule on repeated `auth.login` failures and one on any 5xx rate. Keep it
to one VM; do not introduce managed services beyond the log sink.

**Done when.** A failed login on the live site is visible off the box within five
minutes, and produces an alert when repeated.

### B4. Name the exception approvers

**Why.** All three entries in `.soc2/EXCEPTIONS.md` still say `[TODO: name]`. An
unapproved exception is not an exception, it is a gap.

**Files.** `.soc2/EXCEPTIONS.md` in both repositories.

**Steps.** Fill the approver and the approval date for EX-001 (no MFA), EX-002
(closed) and EX-003 (internal-hop TLS). This is a five minute task blocked only
on a decision.

### B5. Replace the static Bedrock key (INFRA-03, Partial)

**Why.** A long-lived AWS access key sits in the environment file on the VM and
is rotated by hand. One such key already reached git history and needs rotating.

**Files.** `revenact-infra/terraform/`, `revenact-infra/deploy/`,
`config/settings.py`.

**Steps.** Prefer short-lived credentials. If AWS and Azure cannot be federated
cheaply, at minimum document a rotation schedule, set a calendar reminder, and
rotate the compromised key now.

---

## 3. Design system

Load `.claude/skills/revenact-design/SKILL.md` first. One surface per pull
request. Run the eleven-point checklist in the UI/UX document before review.

### F1. Wire the three brand fonts

**Why.** The highest-leverage typography fix in the repo. DM Serif Display, DM
Mono and Lato are downloaded on every page load and never applied, so the app
renders in Tailwind's default stack and `.font-display` resolves to `inherit`.
Every "the app looks generic" complaint starts here.

**Files.** `src/index.css`, `src/pages/auth/Login.css`.

**Steps.**
1. Add `--font-display`, `--font-mono` and `--font-sans` to the `@theme` block.
2. Set `body { font-family: var(--font-sans) }`.
3. Make `.font-display` and `.font-mono-brand` real.
4. Remove the Inter request from `Login.css`; Inter is not loaded anywhere.
5. Sweep for text that should now be mono: table numbers, identifiers, badges,
   token counts. Add `tabular-nums` wherever numbers stack in a column.

**Tests.** A render test asserting a computed font family on a heading and on a
numeric cell. Take before and after screenshots with `npm run pw`.

**Done when.** No surface renders in the default system stack, and numeric
columns align.

### F2. Keyboard and focus

**Why.** Zero `focus-visible` styles exist. Inputs use `focus:outline-none`
without replacing the indicator, so keyboard users lose their place. Fifteen
modals have no focus trap, no focus return and, in twelve cases, no
`role="dialog"`.

**Files.** `src/index.css` for the shared ring, a new
`src/components/shared/Modal.tsx`, then every modal listed in the UI/UX document.

**Steps.**
1. Define one `focus-visible` ring token and apply it to the shared control
   classes.
2. Write one `Modal` shell that owns the scrim, `role="dialog"`,
   `aria-modal="true"`, a labelled heading, focus trap, focus return to the
   trigger, and Escape to close. Do not add a dependency for this.
3. Migrate modals one pull request at a time, starting with the destructive ones:
   `ConfirmDialog`, `ChurnOrganizationModal`.
4. Give the Navbar's four icon buttons labels, or remove them if they will stay
   unwired (see C2).

**Tests.** Per modal: Tab cycles inside, Escape closes, focus returns to the
trigger. Use `@testing-library/user-event`.

### F3. Remove the 108 raw hex values

**Files.** `src/pages/integrations/Integrations.tsx` (11, vendor logo SVGs),
`SurveysTab.tsx` (4), and every `text-[#0D0F0E]` on an accent background.

**Steps.** Map each to an existing token. Vendor brand colours inside an SVG are
a legitimate exception: move them into a `VENDOR_BRAND` constant with a comment
explaining why they are not tokens, so the lint sweep stays clean. Add the
on-accent foreground as a real token rather than repeating a literal.

**Done when.** A grep for six-digit hex in `src/**/*.tsx` returns only the
documented vendor constant.

### F4. Real loading skeletons

**Why.** The bar says a skeleton matching the layout. The code shows text lines.
On a slow connection, tables jump.

**Files.** New `src/components/shared/Skeleton.tsx`, then `OrganizationsTable`,
`AccountsTable`, `ContactsTable`, the Health tabs, the Brain panels.

**Steps.** One primitive, then per-surface compositions that match the real row
heights and column widths. Respect reduced motion.

### F5. Close the small rule violations

`h-screen w-screen` in `DashboardLayout` becomes `min-h-[100dvh]`.
`rounded-2xl` and `rounded-3xl` in the contact detail and account placeholder come
back to the scale. `backdrop-blur-sm` leaves the placeholder routes. Delete
`src/App.css`, the `counter` slice and the seeded `tasks` slice, all unimported
template leftovers.

---

## 4. Product gaps

### C1. Slack tab: real or gone

**Why.** The one inline mock left in the app. A Slack connector already exists and
brings in tickets, so the data path is half built.

**Options.** Either render real Slack-sourced records through the connector, or
remove the filter chip. Do not leave a mock on a customer-facing surface. This
needs a product decision first; take it to `brainstorming`.

### C2. Decide on the unwired controls

Navbar Search, Plus, Help and Message; the activity feed's search box, "Add
Action" and filter icon; the list-page title chevrons. Each is either built or
removed. A control that does nothing teaches users not to trust the interface.

### C3. Honour the global attribute mapping

**Why.** An organisation can already choose which column means ARR, MRR, renewal
date and joined date. The setting is stored and exposed, and then every rollup
reads the fixed default. The setting currently lies.

**Files.** `services/customers/portfolio.py`, `forecast.py`, `usage.py`,
`segments.py`, `activity_tracking.py`, `product_usage.py`,
`services/metrics/registry.py`.

**Steps.** Resolve the mapping once per request into a field name, and have the
rollups read through it. Add one helper rather than six branches. If this is not
worth doing, remove the setting instead; either is better than the present state.

**Tests.** A rollup test per metric under a non-default mapping.

### C4. Move the Ops agent's assignee rule into code

**Why.** "Match the function, else the owner" is described to the model in a
prompt. The model can ignore it, and there is no test that catches it.

**Files.** `services/metrics/proposals.py`.

**Steps.** Compute the assignee on approval from the account's team and the
proposal's function, rather than trusting the answer. Keep the prompt hint, but
validate like every other field already is.

Partly done 2026-10-07: on approval the proposed name is matched to an active member who can
open the organisation (exact, then ignoring case), else the organisation's owner, else the
approver (`metrics.proposals._assignee`). Choosing by function is still the prompt's.

On Work's Recommended (delivery 2, 2026-10-07) an AI-agent proposal is routed like any
recommendation and the decider picks the person; the agent's name only prefills it.

### C5. Survey delivery

Built 2026-10-03 (backend, `services/surveys`): sends to a segment, one-time links,
the public form, 90-day scores and the nightly refresh. Spec: react-ts-app
`docs/superpowers/specs/2026-10-03-surveys-design.md`. The frontend (the Sends tab,
the builder modal, the send page and `/s/:token`) is the next PR; automatic sends and the approval queue arrived with rules on 2026-10-04 (backend, `services/rules`; spec: react-ts-app `docs/superpowers/specs/2026-10-04-rules-design.md`); reminders follow later. Production needs SMTP credentials (`EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD`): without
them the send answers 400 rather than printing links to the console.

### C6. Notifications for the rest of the assignees

Tasks done 2026-10-07 (Work delivery 1): every task, however made (except the Scenarios engine's Create Task, which is deferred with the Scenarios round),
has a real assignee, told in-app (`task_assigned`) by whichever path made it. Ticket, risk and opportunity assignees are
still plain text and notify nobody. Work delivery 2 (2026-10-07) added Recommended and its once-a-day
`recommendations_waiting`; delivery 3 (2026-10-08, backend: workspace timezone and working days, nightly nudges and escalations, the daily digest; the frontend half and production SMTP follow) is done: react-ts-app
`docs/superpowers/specs/2026-10-07-work-round-design.md`.

Work in one place, delivery 1 (2026-10-12, backend): personal to-dos, `POST /work/todos/`, `GET /work/feed/` and `/work/feed/count/`.

Work in one place, delivery 2 (2026-10-12, backend): the Team queue (`GET /work/feed/team/`), the three retired recommendation kinds, links into My work, the AI proposal notice (`agent_proposal_waiting`), and the removal of `/work/today/` and `/brain/waiting/*`.

### C7 to C9. The long tail

Remaining scenario actions (Assign Playbook, Slack, Teams, Create Pipeline, Send
Survey, Schedule), webhook events beyond `customer.created`, and connector
providers beyond the five implemented. Each follows the same pattern as an
existing sibling, so each is a well-scoped day of work rather than a design
problem. Take them in the order customers ask for them.

### C10. Plans (Project Management)

Built 2026-10-04 (backend, `services/plans`; spec: react-ts-app
`docs/superpowers/specs/2026-10-04-plans-design.md`): templates, plans on
organisations and accounts with milestones and ordinary tasks, the nightly
at-risk step and the rules' "Start a plan". The `/projects` pages, the
record sections and the rule builder's card are the frontend PR.

### C11. Campaigns

Rebuilt 2026-10-04 (backend, `services/campaigns`; spec: react-ts-app
`docs/superpowers/specs/2026-10-04-campaigns-design.md`): owned and shared
campaigns on a segment, sends with deliveries, the unsubscribe link,
existing campaigns migrated, and the rules' "Send a campaign" through the
Review Queue. Every pre-segment campaign got an owner by migration
(`0004_migrate_campaigns`): the workspace's owner membership, else its
first active admin, first active member, or first member at all; the
campaigns of a workspace with no user are deleted, not archived (nobody
could ever read them), logged as a count only; the workspace itself is
left alone. A sent or stuck-`sending` campaign becomes
`active` with one `CampaignSend` (`migrated=True`) rebuilt from its old
`send_log` (and, where that log missed an entry, from the `Email` rows the
old send actually filed); a draft stays a draft with no segment.
Production still has no SMTP credentials, so sends there are refused until
`EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD` are set. The `/campaigns` pages,
`/u/:token` and the rule builder's card are the frontend PR.

---

## 5. The centerpiece: Copilot M3

The product owner calls Multiplayer Copilot the crux of the product. Phases M0
through 2b are built. What remains is the agent itself.

### D1. Streaming responses

**Why.** Every send is one blocking call. In a live session, several people watch
a spinner together, which is the worst possible shared experience.

**Files.** `services/copilot/anthropic_client.py`, `services/copilot/views.py`,
`services/copilot/consumers.py`, `src/pages/copilot/ChatView.tsx`.

**Steps.** Stream from the provider and push deltas over the existing session
socket rather than inventing a second transport. Keep the REST endpoint working
unchanged for clients that do not stream. Record the `ModelCall` on completion as
now.

**Tests.** A consumer test asserting deltas arrive in order and a final message is
persisted once. Assert a dropped socket does not duplicate the stored message.

### D2. Multi-step tool-calling agent

**Why.** Today the model gets one shot with whatever retrieval found. It cannot
look something up, then decide, then look again. This is the difference between a
chat box and an agent.

This is architectural. Follow the full process: `brainstorming`, then a written
spec, then `writing-plans` for its own plan. Do not start from this paragraph.

Constraints already fixed by the existing system, and not up for renegotiation in
the design:
- Every tool call must respect the same visibility helpers as the REST layer. An
  agent that reads more than its user can is a data breach, not a feature.
- Every call goes through `anthropic_client.get_completion` so budgets and the
  `ModelCall` audit keep working. A multi-step agent will consume budget far
  faster; model the cost before building.
- Answers must stay citable. Sources are a product principle.
- Redirects mid-run must still work, because that is what makes a session
  multiplayer.

### D3. Ephemeral presence

"Who is looking right now", beyond the `SessionParticipant` rows. Small, and it
makes a live session feel live. Deliberately deferred so far.

---

## 6. Suggested order

| Wave | Tasks | Rationale |
|---|---|---|
| 0 | P0 | Nothing merges or deploys until CI can run |
| 1 | A1, A2, A3, B4 | Stop showing wrong data and stop documents lying. Cheap, high trust |
| 2 | F1, F2 | The two changes that most alter how the product feels |
| 3 | B1, B2, B5 | The compliance gaps with real risk behind them |
| 4 | F3, F4, F5, C1, C2 | Finish the design system sweep and the honesty pass |
| 5 | C3, C4, C6 | Make existing settings and rules true |
| 6 | D1 | Streaming, the largest felt improvement to the centerpiece |
| 7 | B3, C5, C7 to C9 | Operational and long tail |
| 8 | D2, D3 | The agent, once its own spec exists |

Each wave is a set of independently shippable pull requests, not a milestone to
batch.

---

## Done: Agents delivery 1, the action layer (2026-10-08, backend)

Built on `feat/agents-actions`. Spec: react-ts-app `docs/superpowers/specs/2026-10-08-agents-round-design.md`; plan: `docs/superpowers/plans/2026-10-08-agents-actions-backend.md`.

- Three agents (CS, Sales, Ops), a nightly pass inside `run_health_maintenance` before Recommended, 10 action kinds in one registry, the Auto/Ask/Never grid, undo for 7 days, per-agent budgets as `agent_<kind>` purposes.
- `Proposal` renamed `AgentAction` in place (table `metrics_proposal`); `AgentProfile`, `AgentPolicy`; migrations `metrics 0011`, `agents 0001`, `work 0004`/`0005`, `notifications 0010`.
- Work Recommended and Brain Waiting carry every kind.
- Still to do: the frontend; delivery 3 (the builder kinds); write-back to connected tools.

## Done: Agents delivery 2, drafts and plans (2026-10-08, backend)

Built on `feat/agents-drafts`. Contract: `docs/superpowers/plans/2026-10-08-agents-drafts-api.md`; plan: `docs/superpowers/plans/2026-10-08-agents-drafts-backend.md`.

- `draft.reply` and `plan.start` for the CS and Sales agents; `customers.ReplyDraft` and `/communications/drafts/` (list, read, edit, send, mark sent, discard); the queue's `draft`; the source gate on every action list; Draft plans and `POST /plans/<id>/start/`; `agent_draft_ready`.
- Delivery 1 follow-ups: hidden task ids null, the `/metrics/proposals/` routes removed, the Ops figures without DISTINCT, replies threaded on their original.
- Migrations `metrics 0012`, `notifications 0011`, `customers 0058`, `plans 0004`.
- Still to do: the frontend; syncing drafts into providers and sending ticket replies (two-way connectors).

## Done: Agents delivery 3, the builder (2026-10-08, backend)

- `segment.create`, `scenario.create`, `campaign.create`, `plan.template` (Ops) and `canvas.create` (every agent), Ask only, applied as and owned by the approver, undone while untouched; `agent_action` and `made_by` on segments, scenarios, campaigns, maps and templates; `409 OWNER_LIMIT`; the builder catalogue and people lines in the evidence; one builder action per pass; workspace-level actions never hidden in Waiting.
- The Brain graph's `agent_action` nodes; a draft reply's Send claims the draft first.
- Migrations: `metrics 0013`, `segments 0002`, `rules 0006`, `campaigns 0007`, `customers 0059`, `0060`, `plans 0005`.

## Done: Two-way Gmail delivery 1, the sync engine (2026-10-10, backend)

- The portal's per-workspace switch; connect gates (workspace, membership, seat, verified domain exactly) before OAuth and in the callback; all three Gmail scopes or nothing; one live Google connection per address.
- `sync_mail --loop`: leased claims, the gate sweep, history with 404 recovery, the 12-month import, labels, the push watch, error backoff and pauses; the push webhook.
- Read side: labels, cc/bcc, sanitised HTML and attachment details, owner-only; `GET mail/labels/`; Sync now queued; `MAILBOX_PAUSED` on every send path.
- Google disconnects keep copies 30 days, then the nightly prune.
- Migrations `accounts 0015`, `mail 0004`. Operator steps: revenact-infra's `mailsync` split (its own PR), Google Cloud setup (the D1 backend plan's appendix).
- Next: delivery 2 (the outbox and every write-back, threads, label sidebar, attachment downloads), delivery 3 (drafts both ways, threaded reply, reply all, forward, signature).

## Done: Two-way Gmail delivery 2, actions (2026-10-11, backend)

- The outbox: every Gmail action written back with collapse, the skip rule, batching, retries, revert and one notice per action; `sync_issue` on messages and threads.
- Conversations (`mail/threads/`, the thread route and its PATCH), bulk actions (`mail/actions/`), `folder=all` and `label=`, labels made here with unread counts.
- Attachments fetched on first open, sniffed and served safely, audited for filed mail, and listed on the record's Files tab under the twice-filter.
- Migrations `mail 0005`, `notifications 0012`. No operator step: the outbox runs inside `sync_mail --loop`.
- Delivery 3 (drafts both ways, threaded reply, reply all, forward, CC/BCC on send, attachments on send, the signature) is below.

## Done: Two-way Gmail delivery 3, writing (2026-10-11, backend)

- Drafts both ways with a revision guard; compose prefill; new, reply, reply all, forward with To/Cc/Bcc, HTML, attachments and the signature; send with an inline claim; threaded sends on every route.
- Agent email drafts linked to Gmail drafts; search older mail in Gmail.
- Migration `mail 0006`. No operator step: Caddy sets no request body limit (checked in revenact-infra `deploy/Caddyfile`).
- The two-way Gmail round is complete on the backend.

## Done: Agent bundles, delivery 1 (2026-10-13, backend)

- Bundles and steps, the run/retry/reject routes, placeholders, `survey.send` and `campaign.send`, Work over bundles (Mine, My team, Rest of company, History, the queue rail).
- Migrations `agents 0002`, `agents 0003`, `metrics 0014`, `metrics 0015`, `notifications 0014`. Contract: `docs/superpowers/plans/2026-10-13-agent-bundles-d1-api.md`.
- Next: delivery 2 (message intake), delivery 3 (outside actions).

## Done: Agent bundles, delivery 2 (2026-10-13, backend)

- Message intake (threads, the interval run, routing, update or new, Refresh), department and Unassigned queues, saved edits, Settings › Agents' sources; D1 follow-ups (send steps start as drafts, campaign body 5,000, Rejected by, the schema for signed-out callers).
- Migrations `accounts 0016`, `agents 0004`, `agents 0005`, `metrics 0016`. Contract: `docs/superpowers/plans/2026-10-13-agent-bundles-d2-api.md`.
- Next: delivery 3 (outside actions); then storing unmatched items (D2-2), the infra compose service (D2-21).

## Done: Agent bundles, delivery 3 (2026-10-13, backend)

- Agent bundles, delivery 3 (2026-10-13, backend): outside actions (mail reply, Slack reply, Jira create and assign), tool permissions, idempotency and lookup, audit, the failed-step notice; the connectors' OAuth flaw fixed. Next: the frontend D3 PR; then round 2 (Zendesk/Freshdesk replies and status, Jira comments, per-person Jira, the fast lane) and storing unmatched items (D3-25).
- Migrations `metrics 0017`, `connectors 0004`, `notifications 0015`. Contract: `docs/superpowers/plans/2026-10-13-agent-bundles-d3-api.md`.

## Done: Agent bundles, round 2 delivery 1 (2026-10-13, backend)

- Agent bundles, round 2 delivery 1 (2026-10-13, backend): `jira.comment`, Outlook replies that thread, Outlook signatures (`PATCH /mail/connection/`), truthful assign lookups, `needs: "reconnect"`, the pick lists' not-found and busy refusals, an audited demoted consent. Scope: Gmail, Outlook, Jira and Slack only. Next: the frontend R2 D1 PR; then round 2 delivery 2 (per-person Jira, a live Slack channel list) and delivery 3 (storing unmatched items, the fast lane).
- Migration `metrics 0018`. Contract: `docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-api.md`.

## Done: Agent bundles, round 2 delivery 2 (2026-10-14, backend)

- Agent bundles, round 2 delivery 2 (2026-10-14, backend): a person's own Jira link (Atlassian 3LO, tokens encrypted and refreshed before a run), Jira steps that act as the runner and say so before Run, a lost link that blocks instead of falling back, a live searchable Slack channel list with `channel_choice` and an admin-only private rule, and the N1 mail gate. Scope: Gmail, Outlook, Jira and Slack only. Next: the frontend R2 D2 PR (merge the backend first); then round 2 delivery 3 (R2-D3: storing unmatched items, the fast lane).
- Migration `connectors 0005_jira_link`. Contract: `docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-api.md`. Owner set-up: the Atlassian apps and the two env vars (spec section 13.9), then the live checks (section 13.8).

## Done: Agent bundles, round 2 delivery 3 (2026-10-14, backend)

- Agent bundles, round 2 delivery 3 (2026-10-14, backend): Needs a customer (Slack and Jira messages that match no customer wait for a person to match or dismiss them, purged after 30 days), the fast lane (urgent threads read after 2 quiet minutes within caps, off by default), and audited connector create, update and delete. F1 (Jira request types) was not built: the owner's live checks LC-F1a and LC-F1b were not reported as passed. Scope: Gmail, Outlook, Jira and Slack only.
- Migrations `connectors 0006_unmatched_item`, `agents 0006_signal_thread_urgent`, `accounts 0017_organisation_fast_lane`. Contract: `docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-api.md`. Owner set-up: production needs the `agentsignals` service (every 5 minutes) in `revenact-infra`, then `make sync`; no new env var, no new OAuth scope. Live checks: the contract's section 12.

## Done: Slack escalations, delivery 1 (2026-10-15, backend)

- Slack escalations delivery 1 (2026-10-15, backend): Slack threads are conversations (never tickets), read with their replies over the last 7 days; the customer is found from the channel, else a name in the message, else the thread waits in Needs a customer with the records it mentions; the story shows Slack threads; agents read and reply in the conversation. Deliveries 2 and 3 (the escalation bundle, account team, Jira link) are not built.
- Migrations `customers 0062_slackconversation`, `connectors 0007_unmatched_candidates`, `agents 0007_signal_thread_conversation`, `agents 0008_slack_tickets_to_conversations`. Contract: `docs/superpowers/plans/2026-10-15-slack-escalations-d1-api.md`. Owner set-up and live checks: the contract's section 12; no new env var, no new Slack scope.

## Done: Slack escalations, delivery 2 (2026-10-16, backend)

- Slack escalations delivery 2 (backend PR open, this branch; frontend to follow): `knowledge.FunctionHead`, `GET/PATCH /function-heads/` (`manage_org_settings`), `ownership.handler_for` (team, else head, else nobody; the account's own owner first for Customer Success) and the audited account team (`function_head.changed`, `function_owner.changed`). Migration `knowledge 0006_functionhead`. Contract: `docs/superpowers/plans/2026-10-15-slack-escalations-d2-api.md`. Owner set-up: Settings › People & teams › Department heads, then the Account team card (contract section 8).

## Done: Slack escalations, delivery 4 (2026-10-17, backend)

- Slack escalations delivery 4, "the thread decides" (backend; frontend to follow): a colleague's Slack thread that needs work becomes one bundle (the Jira issue, its assignment that skips when the person has no Jira account, a to-do, the reply in the thread last with the real key and link, never in a shared channel); the person is the one the thread's decision names, else the account team (`handler_for`); the thread's participants may accept it (the participant view); Change (`PATCH /agents/bundles/<id>/handler/`); the issue filed at once and linked both ways with the thread, with a Jira remote link; our replies posted as a person never wake an agent; Send to Revenact keeps the Jira link out of shared channels. Migrations `customers 0063_escalation_links`, `agents 0009_escalation_participants`. Contract: `docs/superpowers/plans/2026-10-17-slack-escalations-d4-api.md`. Owner set-up and live checks: the contract's section 9 (Jira connection's department blank; Tushar, Jesh and Faiz link their Slack; Faiz invited to Jira with his login email). No new env var, no new scope.
- Next: delivery 3 (every public channel) is built separately on `feat/slack-escalations-d3`; whichever merges second renumbers its `customers` and `agents` migrations and rebases `providers/slack.py` `_replies` and `sync.file_conversation`.

## Done: Slack escalations, delivery 3 (2026-10-17, backend)

- Slack escalations delivery 3 (backend, branch `feat/slack-escalations-d3`; frontend `feat/slack-escalations-d3` in react-ts-app): every public channel of a Slack workspace syncs through one connection; Slack's Events API (`POST /connectors/slack/events/`) files each message as it is posted; a slow catch-up (one history page and one thread a pass, Slack's 2025 limits) reads what events missed; the bot joins public channels itself with `channels:join`; admins list channels, switch them off and set their customer (`/connectors/<id>/slack-channels/`, audited `slack_channel.update`); Slack Connect channels excluded by default; a reply may move to any included channel. New setting `THROTTLE_SLACK_EVENTS` (default `1200/min`).
- Migrations `connectors 0009_slackchannel`, `customers 0064_slackconversation_channel_once` (after D4's `customers 0063_escalation_links`), `connectors 0010_slack_channels_from_config`. Contract: `docs/superpowers/plans/2026-10-17-slack-escalations-d3-api.md`. Owner set-up and live checks LC-D3a to LC-D3d: the contract's section 8 (Event Subscriptions with the Request URL, bot events `message.channels` and `channel_created`, bot scope `channels:join`, reinstall, reconnect). Next: delivery 4 (the escalation bundle).

## Done: Connections, backend 1 (2026-10-16)

- Personal Slack link (link, unlink with revoke, post as me with bot fallback, synced threads attributed to the linked member) and Send to Revenact (the `send_to_revenact` message shortcut makes a private Work suggestion). Spec: `react-ts-app` `docs/superpowers/specs/2026-10-16-connections-page-design.md` §3.
- Migrations `connectors 0008_slack_link`, `work 0007_slack_suggestion`. Owner set-up: in the Slack app, add user scopes `chat:write`, `users:read` and the redirect URL `<MAIL_OAUTH_REDIRECT_BASE>/api/v1/connectors/slack-link/callback/`; turn Interactivity on with the request URL `<api origin>/api/v1/connectors/slack/interactivity/`; add the message shortcut with callback id `send_to_revenact`; save the signing secret to Secret Manager `slack-signing-secret` as `SLACK_SIGNING_SECRET`. Next: Frontend 2 (the Link Slack row and the Slack-sourced suggestion in Work).
