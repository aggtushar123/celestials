# API Contracts

Running log of every endpoint this backend exposes, why it's shaped the way
it is, and how it maps to the `react-ts-app` frontend. Updated every time a
new feature is ported from frontend → backend.

The **machine-readable, always-current** version of this contract is the
OpenAPI schema, generated straight from the code:

- Swagger UI (interactive): `http://localhost:8000/api/docs/`
- Redoc (reference view): `http://localhost:8000/api/redoc/`
- Raw schema (JSON): `http://localhost:8000/api/schema/`

This document is the **narrative companion** — it explains decisions the
schema alone can't (why a field is shaped this way, what changed and when,
what's intentionally not built yet).

---

## Conventions

- **Base path**: all feature endpoints live under `/api/v1/`.
- **Format**: JSON in, JSON out. No form-encoded bodies.
- **Pagination**: DRF's `PageNumberPagination`, 25 items/page by default.
  List responses look like:
  ```json
  { "count": 142, "next": "...", "previous": null, "results": [...] }
  ```
- **Auth**: JWT via `djangorestframework-simplejwt`. `DEFAULT_PERMISSION_CLASSES`
  is `IsAuthenticated` — every endpoint requires a valid `Authorization:
  Bearer <access token>` header unless it explicitly sets `AllowAny` (signup,
  login, token refresh, and `core`'s health check). Send the access token on
  every authenticated request; refresh it via `/api/v1/auth/token/refresh/`
  when it expires (60 min lifetime; refresh tokens last 7 days).
- **Errors**: standard DRF error shape, e.g.
  `{"detail": "..."}` or field-level `{"field_name": ["error message"]}`.
- **IDs**: Postgres auto-incrementing integers (`BigAutoField`) unless a
  feature has a specific reason to use something else (documented inline
  when it happens).
- **Timestamps**: ISO 8601, UTC, via Django's `USE_TZ = True`.

## Naming mapping (frontend → backend)

The frontend's `src/pages/<domain>/` and `src/features/<domain>/` folders
map to one Django app per domain, mounted at `/api/v1/<domain>/`. Frontend
mock data files (e.g. `tableData.ts`, `activityData.ts`) become the seed/shape
reference for that app's models — not copied verbatim, but used to derive
field names and types so the API contract matches what the UI already
expects.

---

## Status

| Frontend feature | Backend app | Status |
|---|---|---|
| — (infra) | `core` | ✅ Built — health check only |
| Auth (`authSlice.ts`, `Login.tsx`) | `accounts` | ✅ Built — signup, login, logout, token refresh |
| User Profile / User Management | `accounts` | ✅ Built — own profile (`/me/`), change password, admin list/add/edit/deactivate CSMs (`/csms/`) |
| Connections: personal Slack link, Send to Revenact (`/settings/connections`) | `connectors`, `work` | ✅ Built (backend) — `GET/POST/DELETE /connectors/slack-link/`, `GET /connectors/slack-link/callback/`, `POST /connectors/slack/interactivity/`, `DELETE /work/slack-messages/<id>/`; Work feed kind `slack_message` |
| Organizations (list/board/detail) | `customers` | 🟢 Full `tableData.ts` schema built, API-complete — see below. List view, MetricsPanel, Add/Edit/Churn/Archive, and the Details page's General tab all fetch real data. Board, nested Contacts not started. |
| Organizations portfolio (`/organizations` list redesign) | `organizations` | ✅ Built — `GET /organizations/portfolio/` (rows, details, groups, summary, filters, cursor pages), `GET /organizations/portfolio/export.csv`, `POST /organizations/bulk/`; Ask Revenact on the page is `POST /copilot/messages/` with `context.surface = "organizations"` (see `copilot`); the organisation page's Story is `GET /organizations/<id>/story/`, and Ask on that page is the same send with `view: "detail"` |
| Accounts portfolio (`/accounts` list and Board redesign) | `accounts_portfolio` | ✅ Built — `GET /accounts/portfolio/` (rows, details, groups, summary, filters, cursor pages, `group_value` for a Board column), `GET /accounts/portfolio/export.csv`, `POST /accounts/bulk/` (owner, lifecycle). `/accounts/` and `/accounts/stats/` are unchanged — see below. |
| Accounts (standalone `/accounts/list` page, Details page's Accounts tab) | `customers` (`Account` model) | 🟢 Model + full CRUD built, many-to-many under `Customer` — see below. A global paginated+searchable list (`AccountListView`, GET-only — Add/Edit reuse the nested endpoints below, see that view's own docstring), an aggregate `AccountStatsView` (Health/NPS/Lifecycle rollups, same shape as `CustomerStatsView`) backing the standalone page's own MetricsPanel, plus the nested per-Customer list-create/detail endpoints. Both the standalone list page and the Details page's own Accounts tab fetch/display real accounts and have Add/Edit wired (`createAccount`/`updateAccount`/`fetchAllAccounts`/`fetchAccountStats` in `features/customers/customersSlice.ts`, `AccountFormModal.tsx`). Churn/Archive for Account don't exist yet — not asked for, and Account has no `churn_date`/`is_archived` fields to back them. No Delete either — not asked for, matching the nested `AccountDetailView`'s own PATCH-only scope. The `/accounts/list` and `/accounts/board` UI above is what the Accounts portfolio row replaces once its frontend ships; `AccountListView`/`AccountStatsView` are unaffected either way and keep backing the Details page's Accounts tab and any other caller. |
| Account page (`/accounts/:id` redesign) | `account_story` | ✅ Built — the account's Story is `GET /accounts/<id>/story/`; its tabs and creates are `GET/POST /accounts/<id>/{contacts,opportunities,risks,files,calls,surveys,tasks,notes,canvases}/` (canvases: GET only) and `GET/PATCH /accounts/<id>/` (the nested account endpoints, keyed by the account alone) |
| Activities (`ActivityFeed`'s "Activities" filter) | `customers` (`Activity` model) | 🟢 Read-only, API-complete — see below. Model + two scoped list endpoints (per-Customer, per-Account) exist, are seeded, and `ActivitiesTab.tsx` fetches real data through `fetchActivitiesForCustomer`/`fetchActivitiesForAccount`. No create/update endpoint yet. |
| Emails (`ActivityFeed`'s "Emails" filter) | `customers` (`Email` model) | 🟢 Read-only, API-complete — see below. `EmailsTab.tsx` fetches real data through `fetchEmailsForCustomer`/`fetchEmailsForAccount`. No create/update endpoint yet. |
| Tasks (`ActivityFeed`'s "Tasks" filter) | `customers` (`Task` model) | 🟢 Read-only, API-complete — see below. `TasksTab.tsx` fetches real data through `fetchTasksForCustomer`/`fetchTasksForAccount`; the Overdue/This Week/Next Week/Later bucket is computed client-side from `due_date`. Created on the record's Tasks tab and worked in Work (see the `work` section): `GET/PATCH /api/v1/tasks/<id>/`, comments, Today, Team. |
| Notes (`ActivityFeed`'s "Notes" filter) | `customers` (`Note` model) | 🟢 Read-only, API-complete — see below. `NotesTab.tsx` fetches real data through `fetchNotesForCustomer`/`fetchNotesForAccount`; the link line now reflects a real per-note count. No create/update endpoint yet. |
| Tickets (`ActivityFeed`'s "Tickets" filter) | `customers` (`Ticket` model) | 🟢 Read-only, API-complete — see below. `TicketsTab.tsx` fetches real data through `fetchTicketsForCustomer`/`fetchTicketsForAccount`; the flag icon now reflects real priority and the link line a real per-ticket count. No create/update endpoint yet. |
| Calendar Events (`ActivityFeed`'s "Calendar Events" filter) | `customers` (`CalendarEvent` model) | 🟡 Backend built, read-only — see below. Model + two scoped list endpoints (per-Customer, per-Account) exist and are seeded; frontend still reads the `CALENDAR_EVENTS_DATA`/`ACCOUNT_ID_MAP` mock in `activityData.ts`/`accountActivityData.ts`, not yet wired to these endpoints. |
| Contacts (standalone `/contacts/list` page, Organization/Account Details' Contacts tabs) | `customers` (`Contact` model) | 🟢 Full CRUD, API-complete — see below. Global paginated+searchable list (`ContactListView`/`ContactStatsView`), two scoped list-create endpoints (per-Customer, per-Account), and a flat `ContactDetailView` (GET/PATCH/DELETE by id, regardless of parent) exist and are seeded; the standalone list page's Add/Edit/Delete are wired to them. |
| Pipelines (`/pipelines` list and Board — opportunities and risks) | `customers` (`Opportunity`, `Risk` models), `pipelines_portfolio` | ✅ Built — the page's book is `GET /pipelines/opportunities/` and `GET /pipelines/risks/` (rows, groups, tiles, filters, cursor pages, `group_value` for a Board column), `…/export.csv` and `POST /pipelines/{opportunities,risks}/bulk/` (stage, priority, department, date). The per-item endpoints stay for the Deals & risks tabs and the forms — global unpaginated lists (`OpportunityListView`/`RiskListView`), per-Customer and per-Account list-create endpoints, flat detail views (GET/PATCH/DELETE) — and now read and write `expected_close`/`due_by`, return `stage_changed_at`, name only openable organisations in `companies`, and are audited |
| Surveys (`ActivityFeed`'s "Surveys" filter, standalone `/surveys` page) | `customers` (`Survey` model) | 🟢 Full CRUD, API-complete — see below. Same shape as Pipelines: a global unpaginated list (`SurveyListView`), two scoped list-create endpoints (per-Customer, per-Account), and a flat detail view (GET/PATCH/DELETE by id). Responding syncs the score onto the parent's own `nps_score`/`csat_score`/`ces_percentage`. CES is Customer-only (Account has no `ces_percentage`). No email delivery — logging only. |
| Canvas (sidebar gallery `/canvas`, "Canvas List" tab on Details pages) | `customers` (`Canvas` model) | 🟢 Live maps — see below. Gallery (`GET/POST /canvases/`, cursor pages), the record lists (`GET` only, `{results}`), and the map (`GET/PATCH/DELETE /canvases/<id>/`) with each person's facts worked out for the reader. Saves carry a `version`; deleting is the creator's and their managers'. |
| Headlines (`ActivityFeed`'s "Headlines" sub-tab on both Details pages) | `customers` (`Headline` model) | 🟢 API-complete — see below. Model + two scoped list-create endpoints (per-Customer, per-Account), a flat detail view (GET/PATCH/DELETE by id), and a real generation endpoint that summarises the parent's own Notes/Emails/Tickets/Activities through `services.copilot`'s Anthropic client. Seeded. `HeadlinesTab.tsx` fetches real data through `fetchHeadlinesForCustomer`/`fetchHeadlinesForAccount`; the group pill and the "Data sources" footer now reflect real values rather than stored/decorative text. |
| Dashboards — Health Overview | `customers` | 🟢 All five tabs (Triage/Divergence/Movement/Renewal Date/Controls) run on one `GET /api/v1/customers/health/` — see that endpoint and `HealthSnapshot` below. |
| Dashboards — Customer Overview | `customers` | 🟢 Runs on `GET /api/v1/customers/overview/` — composition, concentration, cohorts and churn reasons. The one dashboard that counts churned customers. See below. |
| Dashboards — Activity Tracking | `customers` | 🟢 Runs on `GET /api/v1/customers/activity/` — coverage, cadence and follow-through. See below. |
| Dashboards — Revenue Forecast | `customers` | 🟢 Runs on `GET /api/v1/customers/forecast/` — the ARR bridge, with churn weighted by the shared rule in `churn.py`. See below. |
| Dashboards — Usage Overview | `customers` | 🟢 Controls tab runs on `GET /api/v1/customers/usage/` — seat utilisation, shelfware and expansion capacity. See below. |
| Products (catalogue behind `primary_product`) | `customers` (`Product` model) | 🟢 Full CRUD, API-complete — see below. `GET/POST /api/v1/products/` and `GET/PATCH/DELETE /api/v1/products/<id>/`, mounted at their own top-level prefix (a product is org configuration, and `/customers/products/` already means the Product Usage rollup). Case-insensitively unique per organisation, deliberately **not** scoped by ownership, retirable via `is_active`, and un-deletable while customers are on it. Reads for any member, writes gated on `manage_org_settings`. Managed from Settings > Products (`ProductsPage.tsx`). |
| Metric layer (`/api/v1/metrics/`) | `metrics` | 🟢 Every headline number defined once (`services/metrics/registry.py`), read through the same rollups the dashboards draw, whole-organisation via `SystemActor`, with month-end history in `MetricSnapshot` recorded by `run_health_maintenance`. Gated on `view_all_accounts`. Phases 1–2 of the company-brain work: the Brain dashboard's Business metrics panel (`MetricLayerPanel.tsx`) reads it, and `<key>/by/<dimension>/` + `signals/` are the "why" layer — cuts by owner/product/segment/lifecycle and the material moves with their drivers. See below. |
| Brain scopes and "What changed" (`/api/v1/brain/`) | `brain` | ✅ Built (2026-10-05) — backend only, delivery 1 of the Brain rethink. Every member gets a Brain scoped to **Me**, **My team** (managers) or **Company** (Leadership / `view_all_accounts`): figures recomputed over the scope's own book (`ScopeActor`), a per-scope history (`ScopeSnapshot`, month-end rows plus a baseline on first view), the `changed/` payload (material moves, drivers, handovers), and briefs and explanations kept per scope. `GET scopes/`, `GET changed/`, `GET/POST brief/`, `GET/POST explanations/<metric>/`. `/api/v1/metrics/` is unchanged and stays Company-only. See below. |
| Dashboards — Product Usage | `customers` | 🟢 Runs on `GET /api/v1/customers/products/` — one row per product: ARR led, health mix, utilisation, satisfaction, support burden and churn. Attribution is by `primary_product` only, and the response says so. See below. |
| Dashboards — Ticket Overview | `customers` | 🟢 Controls tab runs on `GET /api/v1/tickets/stats/` (`TicketStatsView`), with `Connector` behind its origin chart, plus `open_count`/`oldest_open_days` for the Overview's own KPIs. See below. |
| Dashboards — AI Trending Topics | `customers` | 🟢 Controls tab runs on `GET /api/v1/interactions/stats/` — see below. Its other six sub-tabs are the filter bar, not separate screens. |
| Dashboard Overview — "Needs attention" | `attention` | 🟢 `GET /api/v1/dashboard/attention/` — five kinds of item (renewal, risk, going_quiet, support, anomaly), scored `at_stake × urgency`, twice-filtered like every other dashboard. Per-user snoozing (`POST`/`DELETE …/snooze/`) — see below. |
| Copilot (`/copilot`) | `copilot`, `customers` | 🟡 Real Anthropic Claude chat, grounded in real data — see the `copilot` app's own section below. `POST .../messages/` makes a real, synchronous call to Claude (no task queue, no streaming), with each request's system prompt grounded in a real-data digest of the *caller's own owned* book of business — owned or function-owned, intersected with `live_customers` (visible, not archived, not churned; `services/customers/scoping.py`), so a churned-but-unarchived customer no longer inflates the figures — (health/NPS/lifecycle, top at-risk customers, open opportunity/risk/ticket counts), **plus real retrieved content** — a company identified from the question (an exact name match first, then a real local-embeddings semantic fallback for a company described but not named — embedding its name plus a real hand-entered `industry` when one's been set, e.g. "that video conferencing account" finding Zoom, see `services/copilot/embeddings.py`; no pgvector, plain Python cosine similarity, a documented real limitation once `industry` is blank and the name is also a common word) gets its own recent real Emails/Notes/open Tickets/Activities, relevance-ranked against the question (`services/copilot/retrieval.py`); otherwise falls back to "one of your own top at-risk companies" — not the whole tenant's, same "My" framing as Cockpit's own. Conversations are private per-user. Requires the selected provider's own real credentials (`COPILOT_LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`, or `=bedrock` + real AWS credentials/`BEDROCK_MODEL_ID` — see the `copilot` app's own section below); returns a clear `503` without them rather than a fake answer. First real consumer of `Organisation.ai_agent_enabled`/`ai_agent_tone`. No per-skill tool-calling/function execution — the "Built-in Skills" cards just prefill the compose input. The page's own Cockpit tab is real too now — `GET /api/v1/cockpit/summary/` and `GET /api/v1/tasks/?mine=true` (see the `customers` app's own section) back "My Portfolio Summary"/"Renewals"/"My Tasks", scoped to the caller's own owned book of business; replaces what used to be fixed literal numbers and an entirely separate local mock Redux task list. |
| Scenarios (builder, `/scenarios`) | `scenarios` | 🟡 Full CRUD + a real (deliberately limited) execution engine — see below. `nodes`/`edges` round-trip verbatim; "Run Now" and the On Event → "Creation of new entity" trigger actually execute Send Email/Create Task/Set Attribute/Churn Entity/Condition/Filter against a real Customer. Every other node type (Assign Playbook, Slack Message, Create Pipeline, MS Teams, Send Survey, Schedule) stays a frontend-only mockup; hitting one during a run just logs "skipped". Only `apply_to === "organizations"` scenarios are runnable in v1. |
| Campaigns (`/campaigns`) | `campaigns` | 🟢 Owned and shared like segments; sent to one of the owner's segments through Surveys' audience rules, plain text with three merge fields and a one-click unsubscribe link; once per campaign per person and one campaign email per person every 3 days; every send kept with its deliveries; and a rule's "Send a campaign", through the Review Queue unless without review. Synchronous (no task queue); no HTML, tracking or scheduling. See below. |
| Communications (`/communications`) | `customers` | 🟢 Built — the queue of what is waiting on the caller, merged across Email, Question, Ticket and Call. Two endpoints, no new model. See below. |
| Company Brain | — | ⏳ Not started |
| Settings > Currency / Global Presets / AI Agent | `accounts` (`Organisation` model), `customers` (`Customer.currency`), `fx_rates` | 🟢 `Organisation.currency` actually controls money formatting everywhere now (every `$` in the frontend is currency-aware) and, since Tier 1, each `Customer` can carry its *own* contract currency independent of the org's, with an admin-maintained `fx_rates` table converting cross-currency rollups (see `GET /api/v1/customers/stats/`'s `unconverted_count`) — see the `fx_rates` app's own section below. `ai_agent_enabled`/`ai_agent_tone` are now genuinely read by the `copilot` app's own `SendMessageView` (see that app's own section below) — disabling AI Agent really blocks Copilot sends, and tone really changes the system prompt; `default_lifecycle_stage` is real end to end — it's what the standalone Add Organization flow actually pre-fills. |
| Settings > Entity Uploads | — (no new endpoint) | 🟢 CSV bulk-create for Organizations, one real `POST /customers/` per mapped row via the existing `CustomerListCreateView` — see react-ts-app's EntityUploadsPage.tsx. Accounts/Contacts import not built yet. |
| Settings > Webhooks | `webhooks` | 🟡 Full CRUD + real delivery for one event (`customer.created`) — see below. Admin-only both ways (unlike every other settings tab above, which any authenticated user can view). |
| Settings > Activities / Connect Widget | — | ⏳ Not started — Activities has no create/update endpoint to configure types *for* (Activity is fully read-only, seed-data only); Connect Widget would be a new public, unauthenticated surface this app doesn't have anywhere else, and needs a product decision on what a submission actually does before it's buildable as more than a generated snippet. |

---

## `core` — infrastructure

### `GET /api/v1/health/`

Liveness check. No auth, no params.

**Response `200`**
```json
{
  "status": "ok",
  "service": "revenact-backend",
  "time": "2026-08-31T12:30:16.307241+00:00"
}
```

### `POST /api/v1/internal/tick/<task>/` (public, Cloud Scheduler only)

One scheduled run of a background task (`core/ticks.py`), replacing the sleep-loop containers on Cloud Run. `AllowAny`, no authentication, throttle `tick` (`THROTTLE_TICK`, 60/min per source IP). No body.
- **The token** is checked first, exactly as for the Gmail push (below): an RS256 Google OIDC token with `aud == TICK_AUDIENCE` and `email == TICK_SERVICE_ACCOUNT` (verified). A missing or bad token, a wrong audience or issuer, or an unset setting is `401`; another service account is `403`. Both are audited `tick.rejected {reason}`, anonymous.
- **Tasks:** `mail` (one pass of the mail loop: claim the due mailboxes and sync them, sweep the gates), `deliver` (`deliver_pending`), `tickets` (`sync_tickets`), `agents` (`run_agent_signals`). Any other name is `404`.
- **Overlap:** each task holds a Postgres advisory lock while it runs; a tick that finds it held answers `200` with `ran: false`.
- **Response `200`:** `{"task": "deliver", "ran": true, "ok": true, "summary": "<the command's last output line, counts only>", "seconds": 0.412}`. A task that raises is `500` `{"task", "ran": true, "ok": false}`; only the exception's class name is logged.

---

## `accounts` — Auth (`authSlice.ts`, `Login.tsx`)

Mirrors: `src/pages/auth/Login.tsx`, `src/features/auth/authSlice.ts`,
`src/features/auth/loginSchema.ts`.

The Django app is named `accounts`, not `auth` — `auth` is already taken by
`django.contrib.auth`'s app label and can't be reused. It's mounted at
`/api/v1/auth/` (not `/api/v1/accounts/`) so the URL still matches the
frontend's `features/auth/` domain. See the `flow-docs` skill's
`auth-flow.md` for the full walkthrough of who can do what.

### Models

- `Organisation` — `name`, `slug` (auto-generated from `name`, unique),
  `currency` (`USD`/`EUR`/`GBP`/`INR`/`CAD`/`AUD`/`JPY`, default `USD` —
  display-only for now, see this model's own docstring on why nothing
  renders a symbol off it yet), `default_lifecycle_stage` (blank, or one
  of `customers.Customer.LifecycleStage`'s own values — the standalone
  Add Organization flow's own tenant-wide default, see
  `OrganisationSettingsView`), `created_at`. The tenant. Created only via
  signup; `currency`/`default_lifecycle_stage` are the only two fields
  ever changed after that (via `OrganisationSettingsView` below).
- `User` (custom `AUTH_USER_MODEL`, replaces Django's default) — `email`
  (unique, `USERNAME_FIELD`), `name`, `organisation` (FK, **null only for
  platform-staff superusers** — every org admin/CSM has one), `role`
  (`admin` | `csm`), `is_active`, `is_staff`, `date_joined`. No `avatar`
  field — it's derived at serialization time (see below), not stored.

### Auth model

- **One organisation, two roles.** `admin` = the user created at signup
  (owns the org). `csm` = added by an admin afterward. No "multiple admins"
  or finer-grained permissions yet — just enough to gate the one
  admin-only action that exists so far (adding a CSM).
- **CSM provisioning is admin-direct, not invite-based.** The admin sets
  the CSM's email + initial password themselves in the request body; the
  CSM logs in with exactly what the admin gave them. No email sending
  involved (deliberately, for now).
- **`avatar` is computed, not stored** — `https://i.pravatar.cc/150?u=<email>`,
  matching the placeholder scheme the frontend's dummy users already used
  in `authSlice.ts`. Swap for a real upload field if that's ever needed.

### `POST /api/v1/auth/signup/`

Auth: `AllowAny`. Creates an `Organisation` + its first `User` (`role=admin`)
in one call, and logs them in immediately (same shape as login) so the
frontend doesn't need a separate "now log in" step after signup.

**Request**
```json
{ "organisation_name": "Acme Inc", "name": "Alice Admin", "email": "alice@acme.io", "password": "supersecret1" }
```

**Response `201`**
```json
{
  "user": {
    "id": 1, "email": "alice@acme.io", "name": "Alice Admin",
    "avatar": "https://i.pravatar.cc/150?u=alice@acme.io",
    "role": "admin",
    "organisation": { "id": 1, "name": "Acme Inc", "slug": "acme-inc" }
  },
  "access": "<jwt>", "refresh": "<jwt>"
}
```

`400` if the email is already registered (field error: `{"email": ["A user with this email already exists."]}`).

### `POST /api/v1/auth/login/`

Auth: `AllowAny`. Works for any user — org admin or CSM — same credentials
they were created with.

**Request** `{ "email": "...", "password": "..." }`
**Response `200`** — same shape as signup's response (`user`, `access`,
`refresh`). `401` on bad credentials:
`{"detail": "No active account found with the given credentials"}`.

### `POST /api/v1/auth/login/mfa/`

The second half of a password login for someone with a second factor. When
the person has an authenticator enrolled, `POST /auth/login/` answers
`200 { "mfa_required": true, "mfa_token": "<5-minute challenge>" }` and no
tokens. Send `{ mfa_token, code }` here (a six-digit app code or a recovery
code) to receive the usual `{ access, refresh, user }`. Tokens minted this way
carry `mfa: true`, which survives refresh and is what `/api/v1/platform/`
requires. `401` with `MFA_CODE_INVALID`, `MFA_CODE_REUSED` (a code works
once), `MFA_CHALLENGE_EXPIRED` or `MFA_CHALLENGE_INVALID`.

### `POST /api/v1/auth/me/mfa/{setup,confirm,disable}/`

Auth: `IsAuthenticated`. `setup/` → `{ secret, otpauth_uri }` (nothing is on
yet; calling it again replaces an unconfirmed secret). `confirm/ { code }` →
`{ recovery_codes: [8] }`, shown once and stored hashed. `disable/ { code }`
needs a current code. `/auth/me/` reports `mfa_enrolled`.

### `POST /api/v1/auth/organisation/owner/`

`{ user_id }`. Only the current owner may hand the organisation to another
active member, who is given the built-in Admin role. `403 NOT_OWNER`,
`400 NOT_A_MEMBER | ALREADY_OWNER`. `/auth/organisation/` carries `owner`
`{id, name, email}` and `/auth/me/` carries `is_owner`. Another administrator
cannot deactivate or re-role the owner (`400` from `PATCH /auth/users/<id>/`).

### `POST /api/v1/auth/token/refresh/`

Auth: `AllowAny`. `{"refresh": "<jwt>"}` → `{"access": "<jwt>"}`. Standard
simplejwt `TokenRefreshView`, unmodified.

### `POST /api/v1/auth/logout/`

Auth: **`IsAuthenticated`** — you need a valid access token to log out, but
the call always succeeds regardless of the refresh token's own state.

**Request** `{ "refresh": "<jwt>" }` → blacklists that refresh token (via
`rest_framework_simplejwt.token_blacklist`) so it can no longer be used at
`/token/refresh/`. `401` if unauthenticated; an invalid, expired, or
already-blacklisted refresh token in the body is **not** an error — still
`205` (idempotent: safe to call twice with the same token).

**Response `205 Reset Content`** — empty body.

Only the refresh token is revoked. The current access token (60 min
lifetime) keeps working until it naturally expires — simplejwt doesn't
track individual access tokens for revocation, only refresh tokens via
this blacklist.

### `GET /api/v1/auth/me/`, `PATCH /api/v1/auth/me/`

Auth: `IsAuthenticated` — any user, admin or CSM, editing themselves.

GET returns the same shape as the `user` object in login/signup, plus
`sign_in_providers` (e.g. `["google"]`), which only your own profile carries.
Every user object also has `has_password` (false for someone who only ever
signed in with a provider, so Account settings hides the password form) and
`tour_completed_at` (null until the first-run tour is finished or skipped).

PATCH accepts `{ "name": "..." }` and `{ "tour_completed": true | false }` —
the server stamps `tour_completed_at` itself, and `false` clears it ("show me
the tour again"). Your own profile also carries `digest_opt_out` (boolean, default
`false`), readable and writable here only: `true` means no Work daily digest for you, whatever
the workspace says. `email` and `role` are read-only here; sending them is
silently ignored (not an error), not written.

**Response `200`** (both) — the (possibly updated) profile.

### `GET /api/v1/auth/organisation/`, `PATCH /api/v1/auth/organisation/`

**Global configuration (Settings › Data).** `name` is editable (PATCH,
`manage_org_settings`; `slug` stays read-only). `global_attributes`
maps each headline concept to the customer field that stands for it —
`arr`, `mrr`, `renewal_date`, `joined_date` — read as the stored
mapping over the defaults (`arr_billed_at_account`, `arr_billed_at_account`,
`renewal_date`, `joined_date`); `global_attribute_choices` lists what
each may be. PATCH accepts a partial mapping and refuses unknown keys or
a field that cannot stand for the concept (`400`).

Backs Settings > Currency, Global Presets, and AI Agent (react-ts-app's
`src/pages/settings/CurrencyPage.tsx`/`GlobalPresetsPage.tsx`/
`AIAgentPage.tsx`).

Auth: GET — `IsAuthenticated` (any user, admin or CSM — all three
settings pages show a read-only view to a CSM). PATCH — `IsOrgAdmin` on
top (`403` for a CSM), same gate as `/auth/csms/`'s own.

PATCH accepts any of `{ "currency": "EUR", "default_lifecycle_stage":
"adoption", "ai_agent_enabled": false, "ai_agent_tone": "friendly" }`
(any subset — each settings page only ever sends its own field(s)) —
`name`/`slug` are read-only here; sending them is silently ignored, not
written (same "can't smuggle an edit to a read-only field through"
convention as `/auth/me/`'s own). `ai_agent_enabled`/`ai_agent_tone` are
genuinely stored and shown back, same as `currency`, and are now
genuinely read by the `copilot` app's own `SendMessageView` — see that
app's own section below.

**Response `200`** (both)
```json
{
  "id": 3,
  "name": "Acme Inc",
  "slug": "acme-inc",
  "currency": "EUR",
  "currency_display": "Euro (€)",
  "default_lifecycle_stage": "adoption",
  "ai_agent_enabled": true,
  "ai_agent_tone": "friendly",
  "ai_agent_tone_display": "Friendly"
}
```

### `POST /api/v1/auth/me/change-password/`

Auth: `IsAuthenticated`. Self-service password change — requires proving
you know the current one.

**Request** `{ "current_password": "...", "new_password": "..." }`
(`new_password` min 8 chars, same as everywhere else). `400` with
`{"current_password": ["Current password is incorrect."]}` if it doesn't
match.

**Response `200`** — empty body.

Does **not** invalidate existing sessions/tokens — unlike an admin
deactivating you (below), which does. Changing your own password from an
active session doesn't force that same session to re-authenticate.

### `POST /api/v1/auth/password-reset/`

Auth: `AllowAny`. Step 1 of the forgot-password flow (`ForgotPassword.tsx`).

**Request** `{ "email": "..." }`
**Response `200`** — always, regardless of whether the email matches a
user: `{"detail": "If an account exists for that email, we've sent a
password reset link."}`. This is deliberate — a `404`/different message
for an unknown email would let the endpoint be used to enumerate
registered addresses.

When the email does match, sends a plaintext email (`django.core.mail`) to
that address with a link to `{FRONTEND_URL}/reset-password?uid=...&token=...`.
Uses Django's built-in `django.contrib.auth.tokens.default_token_generator`
— the token is tied to the user's pk, current password hash, and
last_login, and expires after `PASSWORD_RESET_TIMEOUT` (1 hour); nothing is
stored server-side for this step.

`EMAIL_BACKEND` falls back to Django's console backend (prints to the
`runserver` terminal) when `EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD` aren't
set in `.env` — see `.env.example`. `400` if `email` is missing/malformed.

### `POST /api/v1/auth/password-reset/confirm/`

Auth: `AllowAny`. Step 2 — consumes the `uid`/`token` pair from the emailed
link (`ResetPassword.tsx`, reading them off its own URL's query string).

**Request** `{ "uid": "...", "token": "...", "new_password": "..." }`
(`new_password` min 8 chars, same as everywhere else).
**Response `200`** — `{"detail": "Your password has been reset."}`. Does
**not** log the caller in — they sign in at `/login/` with the new
password same as any other time.

`400` for any invalid case — bad/unknown uid, wrong token, or an expired
one — all collapsed to the same generic
`{"non_field_errors": ["This reset link is invalid or has expired."]}`,
again to avoid leaking which case it was. A token stops working the moment
it's used once, since the generator's hash includes the password field
that the reset itself just changed.

### Sign in with Google / Microsoft — `/api/v1/auth/oauth/`

Mirrors: `src/features/auth/oauth.ts`, `src/pages/auth/AuthCallback.tsx`.
All gated on `AUTH_V2_ENABLED`; with it off, `providers/` returns an empty
list and everything else answers `PROVIDER_NOT_AVAILABLE`. Errors use
`{ "success": false, "error": { "code", "message" } }`.

| Call | Auth | Purpose |
|---|---|---|
| `GET providers/` | AllowAny | `{ providers: [{key, label}] }` — which buttons to show |
| `POST <provider>/start/` | AllowAny | `{ authorize_url }` — send the browser there |
| `GET <provider>/callback/` | AllowAny | the provider returns here; always a `302` to the frontend |
| `POST exchange/` | AllowAny | `{ handoff }` → `{ access, refresh, user }` (single use, 60 s) |
| `POST workspace/preview/` | AllowAny | `{ setup }` → `{ email, name, domain, suggested_organisation_name }` (does not spend the code) |
| `POST workspace/` | AllowAny, signup-throttled | `{ setup, organisation_name, name? }` → `201 { access, refresh, user }` |

The callback redirects to `FRONTEND_URL/auth/callback` with exactly one of:

- `?handoff=<code>` — signed in; exchange it at once.
- `?setup=<code>` — verified, and nobody has claimed their domain: show the
  workspace form, then `POST workspace/`. Fifteen minutes; single use.
- `?error=<CODE>` — `ACCESS_REQUEST_PENDING`, `DOMAIN_NOT_VERIFIED`,
  `PERSONAL_EMAIL_NOT_SUPPORTED`, `ORGANIZATION_SUSPENDED`,
  `EMAIL_NOT_VERIFIED`, `ACCOUNT_DISABLED`, `PROVIDER_REJECTED`,
  `PROVIDER_NOT_AVAILABLE`, `INVALID_STATE`, `STATE_EXPIRED`.

`POST workspace/` answers `401 INVALID_SETUP` for a spent or expired code,
`409 WORKSPACE_CLAIMED` when someone from that domain got there first (send
them back to sign in; they will be routed to that workspace), and `400` for
`INVALID_ORGANISATION_NAME` / `PERSONAL_EMAIL_NOT_SUPPORTED`.

Nothing here ever puts a token or an address in a URL: the codes are opaque
and short-lived, and the frontend removes them from the address bar on
arrival.

### Tenant administration — `/api/v1/identity/`

Mirrors: (frontend pending). Every call is scoped to the caller's own
organisation through their membership; **there is no organisation id in any
path**, so there is nothing to tamper with. A row in another tenant answers
`404`, never `403`. Errors use `{ "success": false, "error": { "code", "message" } }`.

| Call | Capability | Purpose |
|---|---|---|
| `GET/POST domains/` | `manage_org_settings` | Claim a domain; the response carries the exact TXT record to publish |
| `POST domains/<id>/verify/` | `manage_org_settings` | Check DNS. `400 DOMAIN_NOT_VERIFIED` = not published; `503 DNS_LOOKUP_FAILED` = could not check. Verifying revokes every other tenant's claim on that domain |
| `GET access-requests/?status=pending|all` | `manage_users` | People who signed in with a corporate address and are waiting |
| `POST access-requests/<id>/approve/` `{role_id, department_id?}` | `manage_users` | Grants the membership and the columns in one transaction. `403 INSUFFICIENT_PERMISSION` if the role holds a capability the approver does not |
| `POST access-requests/<id>/reject/` `{reason?}` | `manage_users` | |
| `GET invitations/?status=pending|all` | `manage_users` | Who this tenant has asked in |
| `POST invitations/` `{email, role_id, department_id?}` | `manage_users` | `201` new, `200` re-sent. Same grant rule as approval. `ALREADY_A_MEMBER` refused |
| `POST invitations/<id>/cancel/` | `manage_users` | |

Invitations carry no token. The invited person signs in with Google or
Microsoft using the invited address and is accepted on the spot, whatever the
domain rules would otherwise say; a different verified address simply finds no
invitation. Open for seven days.

### The internal portal — `/api/v1/platform/`

Mirrors: (frontend pending). Requires `IsPlatformStaff`: a superuser whose
token carries `mfa: true` (only `POST /auth/login/mfa/` mints one). A tenant
administrator is `403` whatever they hold; an unenrolled superuser is `403`
with `detail: "MFA_REQUIRED"`. **Metadata only**: nothing here returns a
tenant's customers, emails, notes, tickets or calls, and the test suite pins
the detail payload's keys.

| Call | Purpose |
|---|---|
| `GET overview/` | Organisations by status, active members, pending requests, open invitations, verified domains, staff count; "gmail": {enabled_workspaces, connected, test_user_cap} (live Google connections platform-wide against GMAIL_TEST_USER_CAP, Google's test-user limit for the one Cloud project) |
| `GET organisations/?q=&status=` | Summaries: owner, active members, pending requests, domains with verification state, `plan` (null until billing). Archived ones only with `status=archived`; "gmail": {enabled, connected, paused} per workspace (live Google connections, which hold test-user slots, and how many are paused), one aggregate query for the page |
| `POST organisations/` `{name, owner_email, owner_name?}` | Creates the tenant **and its root user** in one transaction: the owner, Admin, no password (they sign in with a provider on that address, or from the reset email where mail is configured). `400 EMAIL_TAKEN` if the address has an account anywhere |
| `GET organisations/<id>/` | Summary plus memberships (name, email, role, department, status, owner, last login), domains, open invitations, last 20 audit events, the same "gmail" block |
| `PATCH organisations/<id>/` `{name}` | Rename |
| `DELETE organisations/<id>/` `{reason}` | **Archives**: closed to sign-in, out of the default list, nothing purged |
| `POST organisations/<id>/status/` `{status: active\|suspended, reason}` | Reason required. Suspension refuses password and provider sign-in and voids every member's capabilities; nothing is deleted. `platform.organisation.status` on the tenant's audit trail |
| `POST organisations/<id>/gmail/` `{enabled, reason}` | The two-way Gmail pilot switch (`Organisation.gmail_two_way_enabled`, default off, not on the tenant's settings serializer). `200 {"gmail": {enabled, connected, paused}}`; `400 INVALID_ENABLED` (not a boolean), `400 REASON_REQUIRED`, `404 ORGANIZATION_NOT_FOUND`. Audited `platform.organisation.gmail_two_way {from, to, reason}`; the same value again is 200 with no audit row. Off pauses every Google mailbox in the workspace at the loop's next sweep (≤ 60 s); nothing is deleted |
| `POST organisations/<id>/domains/<domain_id>/verify/` `{reason}` | Staff vouch for a domain that cannot carry a TXT record (a Google-owned `*.onworkspace.com` Workspace domain). `200 {id, domain, verification_status, verified_at}`; `400 REASON_REQUIRED`, `400 PERSONAL_DOMAIN`, `400 DOMAIN_VERIFIED_ELSEWHERE` (another workspace proved it in DNS: staff never override DNS), `404 DOMAIN_NOT_FOUND` (not this workspace's). Unproven claims elsewhere are revoked (`domain.superseded`). Audited `platform.domain.verified {domain, reason}`; already verified is 200 with no audit row |
| `POST organisations/<id>/owner/` `{user_id}` | Move ownership when the owner cannot (audited `by_platform`) |
| `GET staff/` | Who holds platform access and whether their second factor is on |

### Private mail and Add to Revenact (2026-10-17)

Mail is its owner's alone (`services/mail/visibility.py`): an `Email` is read by its `mailbox_owner`, or by anyone who can open its customer or account once it is **shared** (`shared_at`). Logged, seeded and campaign mail (no owner, never synced) stays visible to all. Synced mail whose owner was deleted is read by nobody. The management chain no longer reads a report's mail. Reply drafts on mail are their mailbox owner's alone, shared or not, and agent bundles from mail go to the mailbox owner only. Outputs others read (headlines, feature requests, contact sentiment, anomalies, attributes, briefs, scenarios) draw only on shared or logged mail. `EmailSerializer` gains `shared_at`; the mailbox message detail gains `shared`.

| Call | Auth | Purpose |
|---|---|---|
| `POST communications/emails/<id>/share/` · `DELETE` | the email's mailbox owner | Add the whole thread (every filed message of it in the owner's mailbox) to Revenact, or take it back. `200 {shared, count}`; `404` for mail the caller may not read; `403 NOT_YOURS` for shared mail that isn't theirs, or logged mail with no owner. Audited `email.shared` / `email.unshared {count}` |
| `POST mail/messages/<id>/share/` · `DELETE` | owner (their mailbox) | From the mailbox: files the message on the customer its people belong to if it isn't filed yet, then shares its thread; `DELETE` unshares. `200 {shared, email_id}`; `400 CUSTOMER_NOT_FOUND` (internal mail, or nobody matches); `404` someone else's message |

### Email agent — `/api/v1/email-agent/` (2026-10-17)

Owner decisions A, B and D (2026-10-17):
- **D: internal mail is never stored.** A message whose sender and every recipient are workspace members is not kept, not even in its owner's inbox (`services/mail/internal.py`, both sync paths). It is handed in memory to `services/emailagent/inbox.py` and dropped. `manage.py purge_internal_mail [--delete]` removes copies stored before (audited `mail.internal_purged`).
- **A: the agent only reads mail for people who opt in.** It reads only the mail of a person who switched it on (`MailboxConnection.agent_reads_mail`, default off: `PATCH mail/connection/ {agent_reads_mail}`, audited `mailbox.agent_reads_mail`), only mail they **sent**, less than 24 hours old, once per RFC Message-ID. The reading is one Gemini Flash-Lite call (purpose `email_agent`, an enforced JSON shape), after the sync pass commits.
- **B: everything waits on the sender.** What it finds appears in the sender's own Work as kind `email_suggestion` (suggested group, private): "Give <name> a task: …" or "Ask <name> for a meeting: …", with `detail.kind` `task` (assignee, task_title, due_date, urgent) or `meeting` (approver, attendees, without_calendar, proposed_start, length_minutes, urgent). Nobody else hears of it until the sender confirms.
  - **Confirm a task:** it creates the `Task` (source `agent`) for the assignee, due the next working day in the workspace time zone for "first thing tomorrow". It needs the assignee and sender to be able to open the record, and the assignee is told (`task_assigned`).
  - **Confirm a meeting:** it sends the `MeetingProposal` to the person asked for, who is told (`meeting_proposed`). It then appears in their Work as `meeting_proposal` with **Book**/**Dismiss**. A meeting asking nobody else is the sender's own, open at once.
  - **What others see:** never the email, only the agent's one-line topic and who asked.

| Call | Auth | Purpose |
|---|---|---|
| `POST suggestions/<intent_id>/confirm/` · `dismiss/` | the sender | Their yes or no. `200 {confirmed, task_id}` / `{dismissed}`; `400 ASSIGNEE_CANNOT_OPEN`; `409 ALREADY_DECIDED`; `404` anyone else |
| `GET proposals/<id>/` | the approver, once sent | The feed item; `404` while it waits on its sender |
| `POST proposals/<id>/book/` `{starts_at?, length_minutes? 15..240}` | the approver | Books on the approver's calendar with Meet; Google invites the other attendees. `200 {status: "booked", meeting_id}`; `400 PICK_A_TIME`, `400 CALENDAR_NOT_GRANTED`, `400 INVALID_WINDOW`, `409 MAILBOX_PAUSED`, `409 ALREADY_DECIDED`, `502 GOOGLE_REFUSED` |
| `POST proposals/<id>/dismiss/` | the approver | `200`; `409 ALREADY_DECIDED` |
| (feed) | — | An agent-made task shows `from: {type: "email", label: "From an email by <sender>"}` and `detail.from_email {by, undo_until}` |
| `POST tasks/<task_id>/undo/` | the asker or the assignee | Deletes a task the agent made, within 24 hours. `200 {undone}`; `404`; `409 TOO_LATE` |

### Calendar — `/api/v1/calendar/`

Google Calendar meetings (`services/calendar`, design `docs/superpowers/specs/2026-10-17-google-calendar-design.md`). Synced from each person's primary calendar when their Google connection holds `calendar.events`, on the `mail` tick, at most every `CALENDAR_SYNC_INTERVAL_SECONDS` (300). The owner sees every field; colleagues see a meeting only through a customer they can open, never its `description`, `location` or attendee addresses.

| Call | Auth | Purpose |
|---|---|---|
| `GET meetings/?from=&to=` | any member | The caller's own meetings overlapping the window (ISO datetimes, at most 100 days): `{meetings: [{id, title, starts_at, ends_at, all_day, status, owner{id,name}, organizer_email, attendee_count, meet_url, customer{id,name}\|null, account{id,name}\|null, description, location, attendees[{email,name,response,organizer,self}], html_link, booked_in_revenact}]}`; `400 INVALID_WINDOW` |
| `POST meetings/` `{customer_id, contact_ids[1..50], title, starts_at, ends_at, description?, request_id}` | any member with a live Google connection holding `calendar.events` | Books on the caller's own calendar with a Meet link; Google emails the invites (`sendUpdates=all`). Invitees are contacts of the customer or its accounts. Once per `request_id` (the Google event id is derived from caller + request_id; a retry returns the stored meeting, a lost answer is recovered from Google's 409). `201 {meeting}` (the owner's fields), filed on that customer, `booked_in_revenact: true`. `400 INVALID`, `400 CALENDAR_NOT_GRANTED`, `400 CONTACT_NOT_ON_CUSTOMER`, `400 INVALID_WINDOW` (end not after start, or over 8 h), `404` customer outside visibility, `409 MAILBOX_PAUSED`, `502 GOOGLE_REFUSED`. Audited `calendar.meeting_booked {customer, attendees}` (no title or addresses) |
| `GET customers/<id>/meetings/` | can open the customer (else 404) | Every owner's meetings on the customer or its accounts, newest first, at most 200: the shared fields above; the caller's own meetings with every field |
| `GET status/` | any member | `{calendar: connected\|needs_consent\|not_connected, last_synced_at}`; `needs_consent` is a Google connection without `calendar.events` ("Add Calendar" reruns consent with `include_granted_scopes`) |

### Billing — `/api/v1/billing/`

Mirrors: `src/features/billing/billingSlice.ts`, Account settings › Plan & billing.
Scoped through the caller's organisation; no account id in any path.

| Call | Auth | Purpose |
|---|---|---|
| `GET account/` | any member | `{plan{code,name,seats_included,monthly_credits,price_cents,currency,is_trial}, status, seats{used,limit}, credits{balance}, trial_ends_at, current_period_end, enforced}` |
| `GET ledger/?limit=` | `manage_org_settings` | Credit movements, newest first: `kind` (grant/consume/refund/adjust/expire), signed `amount`, `balance_after`, `reason`, `actor`, `at` |
| `GET plans/` | any member | Public plans |

**What the meters mean.** Seats are people: an active member holds one, taken
where membership is granted (approval, invitation, founding, adding, reactivation)
under a row lock on the billing account, so the last seat can be taken exactly
once. Refusals are `INSUFFICIENT_SEATS` (`402` on the Users endpoints, `400`
with the code on approvals). Credits are AI: every model call charges
`BILLING_CREDITS_PER_MODEL_CALL` before it is made and refunds it if the call
fails; with none left the call is refused like a spent budget (`429`). A new
workspace starts on the trial plan (`BILLING_TRIAL_*`). `BILLING_ENFORCED=False`
records everything and refuses nothing.

The platform portal manages the other side: `GET /platform/organisations/<id>/billing/`
(summary, Stripe ids, last 50 ledger rows, all plans) and
`POST …/billing/{credits|seats|plan}/` with a mandatory `reason`, each audited.

### `GET /api/v1/auth/members/`

Auth: `IsAuthenticated` (any role) — **not** admin-gated, unlike everything
below it. Every member (admin + CSMs) of the caller's own organisation.
Exists so any authenticated user can populate an owner-picker (e.g. the
`customers` app's "assign owner" field) without needing User Management
access.

**Response `200`** — a **plain array** (no pagination envelope; this list
is expected to stay small), each entry the same shape as elsewhere.

### `GET /api/v1/auth/capabilities/`

Auth: `IsAuthenticated`. The closed set of capabilities a Role can hold,
as `[{key, label}]` — served rather than hardcoded in the frontend so the
role editor's checkboxes can't drift from what's actually enforced. A
static vocabulary, not org data.

**Response `200`**
```json
[
  { "key": "manage_users", "label": "Manage users & roles" },
  { "key": "manage_org_settings", "label": "Manage organisation settings" },
  { "key": "manage_custom_objects", "label": "Manage custom objects" },
  { "key": "manage_integrations", "label": "Manage integrations & webhooks" },
  { "key": "manage_fx_rates", "label": "Manage exchange rates" },
  { "key": "view_all_accounts", "label": "View all customers & accounts" }
]
```

`view_all_accounts` is the odd one out: the other five open an endpoint,
this one widens what an endpoint returns. Every customer/account view
stays reachable by everyone; what changes is how many rows come back.
See the `customers` app's own visibility section below for the rule it
switches off.

### `GET /api/v1/auth/roles/`, `POST /api/v1/auth/roles/`

Auth: `IsAuthenticated` (GET) / `CanManageUsers` (POST). Scoped to the
caller's own organisation. **Pagination off** — a handful of rows.

GET lists the org's roles. POST takes `{ "name": "...", "permissions":
[...] }`; `slug` is derived server-side (unique per org, suffixed on
collision) and `is_system` is always `false` for anything a client
creates. `400` for an unknown capability key, or for granting a
capability the caller doesn't hold themselves (no privilege escalation —
otherwise `manage_users` would silently be full admin).

**Response `200`/`201`**
```json
[
  {
    "id": 1,
    "name": "Admin",
    "slug": "admin",
    "permissions": ["manage_users", "manage_org_settings", "manage_custom_objects", "manage_integrations", "manage_fx_rates", "view_all_accounts"],
    "is_system": true,
    "users_count": 1,
    "created_at": "2026-09-07T10:00:00Z"
  }
]
```

### `GET/PATCH/DELETE /api/v1/auth/roles/<id>/`

Auth: `IsAuthenticated` (GET) / `CanManageUsers` (PATCH/DELETE). `404`,
not `403`, for a role in another organisation.

`400` when the target `is_system` (the built-in Admin/CSM roles can't be
renamed, re-permissioned, or deleted — Admin is the only thing standing
between an org and locking itself out, and CSM is the default every new
member falls back to), and on DELETE when the role is still assigned to
somebody.

### `GET /api/v1/auth/users/`, `POST /api/v1/auth/users/`

Auth: **`CanManageUsers`** for both. Scoped to the caller's own
`organisation` — there's no way to see or add a member in a different
org. `403` without the capability, `401` if unauthenticated.

GET lists **every** member of the org, admins included (paginated, per
the usual envelope), ordered by name. This replaced a CSM-only list at
`/auth/csms/`, which meant an admin couldn't see or manage themselves or
any fellow admin on the Users page at all.

POST: **Request** `{ "name": "Carl CSM", "email": "carl@acme.io", "password": "csmpassword1", "role_id": 4 }`
— `role_id` is optional and defaults to the org's CSM role; it's
validated against the caller's own org and against the same
no-privilege-escalation rule as role creation.
**Response `201`** — the created user, same shape as the `user` object
above (no tokens — they log in themselves via `/login/`).

### `GET /api/v1/auth/users/<id>/`, `PATCH /api/v1/auth/users/<id>/`

Auth: same as above. **`404`, not `403`, for an id outside that scope** —
the response can't be used to tell "doesn't exist" apart from "exists but
isn't yours".

PATCH accepts any of `{ "name": "...", "is_active": true|false, "role_id": 4, "password": "..." }`,
all optional (partial update). `password` here is an **admin override** —
no current-password check, unlike the self-service change-password flow.

`400` **when the change would leave the organisation with no active
member holding `manage_users`** — applies to both a role change and a
deactivation, since either can strip the last one. Without it an org
could lock itself out entirely: nobody could add a member, mint a role,
or restore anyone again.

Setting `is_active: false` also blacklists every outstanding refresh
token for that user. Their access token is rejected on its very next
request regardless (simplejwt's `JWTAuthentication` checks `is_active` on
every request) — the blacklist call is defense-in-depth for the refresh
token specifically, not what makes deactivation effective.

**Response `200`** (both) — the (possibly updated) member, same shape as
elsewhere.

Not built yet, and deliberately out of scope for this pass: removing a
member outright (only deactivate), reordering or renaming the built-in
roles, per-object (row-level) permissions, and email verification.

---

## `customers` — Organizations

Mirrors: `src/pages/organizations/List.tsx`, `src/components/organizations/tableData.ts`.
The model's field set matches that mock schema column for column (as of
this pass) — **the frontend itself is not wired to this app at all**; it
still renders entirely from `tableData.ts`. This is schema/API only,
ahead of the frontend, by design (see Status above).

**Naming**: this is a separate model from `accounts.Organisation`. `Organisation`
is the tenant (the company paying for Revenact — one admin, its CSMs).
`Customer` is one of *that tenant's own* customers — the company a CSM is
tracking. Same real-world shape ("a company"), two different roles in the
system, hence two different names — never call a `Customer` an
"organisation" in code or docs, and vice versa.

### Models

`Customer` — grouped by what the frontend table groups them as:

- **Identity/provenance**: `organisation` (FK, the tenant — always
  server-set, never client-supplied), `name`, `address` (the mock table's
  "Name / Address" column), `domain`, `industry` (free-text, hand-entered
  via Add/Edit Organization — not part of the original mock schema; folded
  into what Copilot's semantic company matching embeds when set, see the
  `copilot` app's own section below), `email`/`phone` (contact info —
  not part of the original mock schema; back ActivityFeed's Overview
  tab, replacing what used to be a fabricated `contact@<domain>` and a
  phone number hardcoded identically for every organization), `owner`
  (FK to `accounts.User`, nullable, same-tenant only),
  `created_by`/`modified_by` (FK to `accounts.User`, **always
  server-set** from the caller on create/update — not client-settable
  even if present in the request body), `created_at`/`updated_at` (the
  "Created Date"/"Modified Date" halves of those two mock columns).
  "Revenact ID" is just this row's own `id` — no separate field.
- **Lifecycle/health**: `lifecycle_stage` (choices, unchanged from the
  first pass), `health_score` (decimal **0.0–10.0** — matches this
  table's actual scale, which is *not* the 0–100 scale used elsewhere in
  the mock app, e.g. the dashboard's health donut; `health_category` is
  *derived* from it — good ≥7.0, average 4.0–6.9, poor <4.0 — never
  stored, so the two can't disagree),

  `health_score` is **calculated**, not typed in. Five weighted components
  (`services/customers/health.py`), totalling 10:

  | Component | Weight | Measured from |
  |---|---|---|
  | Customer Touch | 4.0 | days since the newest contact of **any** kind — call, email, note, meeting or logged activity, on the company or any of its accounts (`services/customers/contact.py` owns the list) — decaying linearly to zero at 90 days; measured from `joined_date`/`created_at` when there is no contact yet, so a new logo isn't punished. Was `Activity` rows only until this changed, which let a customer emailed every week decay to "no touch" |
  | AI Pulse | 2.0 | `ai_pulse_value`, 1-5 normalised onto 0-1 |
  | Licence Utilization | 2.0 | `total_active_seats / total_contracted_seats`, capped at 1.0 |
  | Aggregate Adoption Score | 1.5 | `primary_product` + `additional_products_count` against a target breadth of 4 |
  | Support Tickets Volume | 0.5 | open (non-`RESOLVED_STATUSES`) tickets, decaying to zero at 20 |

  A component with nothing to measure is **excluded and the rest
  rescaled**, not scored zero - a customer with no seat figures recorded
  is not one with no seats in use, and scoring the blank would make
  health a measure of how completely the CRM was filled in.
  `health_breakdown` (read-only) returns every component as `{key, label,
  weight, points, ratio, available}`; the `points` of the available ones
  sum exactly to `health_score`.

  It stays a stored column so the list endpoint can still order and
  filter on it in SQL. It is refreshed whenever a customer is written
  through the API, and by `manage.py run_health_maintenance` for the
  components that move without the row being saved (an activity logged, a
  ticket opened, a week passing).

  **`run_health_maintenance` is the job to schedule** — it recalculates every
  score and then records that month's `HealthSnapshot`. There is no task queue
  in this project, so it is a plain management command for cron to call; it is
  idempotent and writes at most one snapshot per customer per month. It skips
  a month already recorded rather than upserting it, since that row is a
  record of how the month *ended* and re-running later would drift it forwards.
  `manage.py recalculate_health` still exists for scores alone.

  `csat_breakdown` (read-only) is the distribution behind `csat_score`:
  `{responses, bands}` where each band is `{key, label, count, share}`, best
  to worst, always all five. Counts answered CSAT `Survey` rows bucketed into
  equal fifths of the 0-100 scale (0-20 very dissatisfied ... 81-100 very
  satisfied). `responses` is 0 when nobody has answered one — the bands come
  back all-zero rather than absent, so the popover keeps a stable shape.

  **Writing `health_score` pins an override.** A PATCH sets
  `health_score_override` rather than the score itself - the caller is
  saying they disagree with the calculation - and
  `health_score_is_overridden` (read-only bool) reports which of the two
  is in force. Send `null` to clear the override and hand the customer
  back to the rubric. `pulse` (JSON list of small ints,
  e.g. `[1,1,0,2,1]`, the recent-pulse-history dots), `ai_pulse_value`
  (integer **1–5**, nullable — the AI's own reading, and the stored one),
  `ai_pulse_score` (choices: very_satisfied/satisfied/moderate/high_risk
  — *derived* from `ai_pulse_value`: 5, 4, 3, and 1–2 respectively, blank
  when unscored), `ai_pulse_reason` (text), `csm_pulse_score` (integer
  **1–5**, nullable — the CSM's own hand-set reading, deliberately the
  same scale as `ai_pulse_value` so the two can be compared directly),
  `csm_pulse_modified_at` (read-only datetime, stamped server-side only
  when `csm_pulse_score` actually changes, so a stale read stays visibly
  stale), `nps_score` (integer, −100 to 100), `csat_score` (decimal,
  0–100).

  `ai_pulse_score` was its own column until the AI pulse gained a numeric
  scale; it is derived now so it can't disagree with the number, the same
  arrangement as `health_score`/`health_category`. **Both names still
  read and write**: POST/PATCH either `ai_pulse_score` (the category, as
  before) or `ai_pulse_value` (the number). Sending *both* in one request
  is a 400 — they write the same column, and silently resolving it would
  mean quietly discarding one of them.
- **Dates**: `joined_date`, `renewal_date`, `contract_start_date`,
  `contract_end_date` — all plain nullable dates, no derivation.
- **Financials**: `currency` (choices, same `Organisation.Currency` set —
  the currency this customer's own financial fields below are
  denominated in, independent of `Organisation.currency` (the tenant's
  own reporting currency); defaults to the org's currency at creation
  unless the client explicitly picks another one, e.g. a US-HQ org
  billing one particular customer in EUR — see `fx_rates` below for how
  rollups that sum across customers with different currencies convert),
  plus five independently stored decimals, deliberately *not* derived
  from each other — see note below: `arr_billed_at_account`,
  `arr_billed_at_hq`, `implementation_fee`, `total_contract_value`,
  `total_forecasted_renewal_revenue`.
- **Product/usage**: `primary_product` + `additional_products_count` (the
  mock's combined `productsUtilized: {primary, additional}` object,
  split into two real columns). `primary_product` is a **FK to
  `Product`** since migration 0030 — an id on write, with a read-only
  `primary_product_name` beside it so a screen that only prints what
  they bought needn't fetch the catalogue. It was free text before that,
  which is why the Product Usage dashboard used to report how many
  spellings it had folded. `PROTECT`ed: a product customers are on
  cannot be deleted, only retired. `additional_products_count` stays a
  bare integer — nobody records *which* other products a customer has,
  which is the limit Product Usage states on screen. `top_source_channel`,
  `total_contracted_seats`, `total_active_seats`,
  `seat_utilization_percentage` (**derived** from those two — active ÷
  contracted × 100, `None` if contracted is 0/unset — this one *is* a
  pure function of its inputs with no independent real-world meaning, so
  deriving it is safe, unlike the financial fields), `total_hires`,
  `scope_web_app`, `ces_percentage`.
- **Churn**: `churn_date`, `churn_reason`, `churn_comment` — all
  nullable/blank. `churn_reason` is a **closed list**
  (`Customer.ChurnReason`): `price`, `budget`, `product_gap`, `adoption`,
  `competitor`, `champion_left`, `acquired`, `shut_down`,
  `consolidation`, `support`, `other`, served alongside a read-only
  `churn_reason_display` label so no screen keeps its own copy of the
  taxonomy. It was free text until migration `0028`, which is why the
  Customer Overview used to report how many spellings it had folded
  together; the nuance a CSM wants to write down belongs in
  `churn_comment`, and `other` exists so nobody has to lie — a rising
  `other` count is the signal the list needs another entry. Blank is
  distinct from `other`: nobody recorded a reason, which is a gap in the
  CRM rather than a CSM's judgement.

**Why the financials aren't derived**: in the mock data, `total_contract_value`
happens to equal `arr_billed_at_account + arr_billed_at_hq` in every
sample row, and `total_forecasted_renewal_revenue` happens to be exactly
`total_contract_value × 1.05` every time. Those look like formulas the
mock generator used, not a business rule this schema should hard-code —
real contract terms (discounts, multi-year escalators, custom renewal
negotiations) can diverge from simple arithmetic. All five financial
fields are independently stored and settable.

### Conventions specific to this app

- **No admin gate** — unlike User Management, any authenticated user in the
  tenant (admin or CSM) can list, create, and edit customers.
- **Record visibility is ownership-based** — see the section immediately
  below. Not an admin gate: it narrows *which rows* you get, not which
  endpoints you may call.
- **Owner must be same-tenant** — assigning `owner_id` to a user from a
  different organisation is a `400`, not silently ignored or allowed.
- **`organisation`, `created_by`, `modified_by` are never client-supplied** —
  `organisation` and `created_by` are set from `request.user` on create;
  `modified_by` is reset to `request.user` on *every* update. Sending any
  of the three in a request body has no effect.

### Record visibility (`view_all_accounts`)

Implemented in `services/customers/scoping.py`, which is the single
definition and the one place to change it. For a caller **without** the
`view_all_accounts` capability:

- A **Customer** is visible if they own it, if they own one of its
  Accounts, or if it has no owner.
- An **Account** is visible if they own it, if they own one of its
  parent Customers, or if it has no owner.

Everything hanging off a Customer/Account — Activities, Emails, Tasks,
Notes, Tickets, Calendar Events, Contacts, Opportunities, Risks,
Surveys, Canvases, Headlines, custom-object records — follows its
parent. There is no per-type rule; gating one tab while leaving the
others open would be theatre, since a Note is as sensitive as an Email.

Holding `view_all_accounts` replaces the ownership predicate with the
organisation one. It never widens past the tenant.

**Out-of-scope records are `404`, not `403`.** A 403 would confirm to
someone that a record exists. This extends the "404, not an empty list"
convention these endpoints already used for another organisation's ids.

**Creating a Customer or Account makes you its owner** unless you send
an explicit `owner_id`.

**Reaching in both directions is deliberate.** Owning "Apple Inc" gives
you its divisions; owning "Apple EMEA" gives you the company it belongs
to, but *not* its sibling divisions. The upward leg isn't generosity —
the account page header names its parent org and its Organizations tab
lists it, so a strictly-own rule would 404 inside a page you are
allowed to open.

**The org chart reaches both directions too.** A manager sees what anyone
below them owns, all the way down (`subtree_ids`): their reports'
customers and accounts, the accounts under a report's customer, and the
organisation above an account a report owns — the same two legs as
above, for the whole subtree. Function-owner and question reach open an
organisation only, never its accounts.

**Unowned records stay visible to everyone.** An unowned record is
nobody's secret, and hiding it would make the unassigned queue
invisible to the people meant to work it.

#### Not the same thing as "my book"

`GET /api/v1/cockpit/summary/` and Copilot's context builder filter
`owner=user` *strictly*, and deliberately still do. Those answer "what
am I responsible for", not "what am I allowed to open", and the answers
differ: a customer you can see through an account you own should not
count toward your own ARR. Copilot's own owned/function-owned customer
set is further intersected with `live_customers` (visible, not archived,
**not churned**) — a churned account is still "yours" in the ownership
sense but is no longer "my book" for a live digest's figures. Copilot's
company *matching* (which company a question is about) stays genuinely
organisation-wide, deliberately **not** narrowed to
`visible_customers`/`visible_accounts` — see the `copilot` app's own
section below and `services/copilot/context.py`'s own docstring for why:
an engineer, a sales rep or the CEO, none of whom own a book and none of
whom may necessarily open the customer's own record, can still ask their
Copilot about any customer in the org and be told who answers for it.
Matching never reads records: `retrieve_with_sources` reads nothing on a
company the asker may not open (`visible_accounts` for an account,
`visible_customers` for an organisation), and then only records passing
their own rule.

#### Known consequences (accepted, not oversights)

1. **A shared Account is visible to both owners.** `Account.customers`
   is a many-to-many; an Account linked to two Customers with different
   owners is reachable by both, and its children appear in both
   Customers' rollups. That is the data model saying they share it.
2. **Parent names surface through rows you are allowed to see — and only
   those, on Account.** An Account's own `customers` field lists only
   the linked organisations the requesting viewer may open
   (`AccountSerializer.get_customers`, filtered through
   `visible_customers(user)`). This is the twice-filter (see "Privacy"
   above), applied one level down: being allowed to open the Account —
   the view's own check, true on the nested route as much as the flat
   one, neither ever required every linked organisation to be visible
   too — is the first filter, not the only one; each linked organisation
   named here is its own record with its own visibility, so a sibling
   organisation the viewer owns nothing in and has no other reach into
   doesn't surface even a name and an id here, same as any other record
   this Account's page shows. Opportunity and Risk rows name only organisations the viewer may open, on every endpoint
   (`PipelineItemSerializer.get_companies` over `VisibleCustomersMixin`, which fails closed without a request).
   Contact's list is narrowed the same way when the view passes `visible_customer_ids` (`ContactCompanyVisibilityMixin`,
   e.g. the Contacts page). Survey rows still carry theirs unfiltered — the known follow-up is giving them the same
   treatment. Canvas rows name only the map's own record (`record`), which the reader may open. The write side matches: a
   `customer_ids` PATCH's own field is scoped to `visible_customers(user)`
   (not just same-tenant), so an id outside it is `400`, byte-identical
   whether it belongs to another tenant, is a same-tenant organisation
   this viewer can't open, or doesn't exist at all — and never removes a
   link the caller can't see, even when it isn't in the submitted list —
   otherwise a filtered read plus a full-replace write would let a
   viewer blind to one shared organisation silently unlink it.
3. **Still organisation-wide:** Copilot session invites disclose an
   account name before acceptance — deliberate, since being invited to
   collaborate on an account is itself a decision to share it, and an
   invite you can't read the subject of is useless. Separately,
   `Notification.message` and Copilot `Message.content` are
   denormalised free text written once at creation — no queryset gate
   can retroactively scrub what they already say.
4. **A Scenario is tenant-wide**, visible to every member: it has no
   owner field, so what is scoped is which customers it may act on. A
   Campaign has an owner and is shared like a segment (see `campaigns`
   below).

### Dashboard drill (`?drill=`)

Five dashboard-stats endpoints share one drill-down convention rather
than inventing their own, all built on `services/customers/drill.py`:
`GET /api/v1/customers/overview/`, `GET /api/v1/customers/activity/`,
`GET /api/v1/customers/forecast/`, `GET /api/v1/interactions/stats/` and
`GET /api/v1/tickets/stats/`. Each accepts `?drill=<segment>` (some
segments take a value, written `kind:value`) that turns one chart figure
into the real list of companies behind it.

**Same set as the totals.** The drill list is computed from the exact
filtered queryset or customer list the endpoint's own totals use for
that figure, then intersected with `visible_customers(request.user)` — a
company the totals didn't count never appears, and a company the viewer
may not see never appears either (an account-level record belongs to all
of the account's customers, and some of those can sit outside the
viewer's own book).

**A filter that names companies narrows the list too.** On the ticket
and interaction drills, `?customer=` lists only that customer,
`?account=` only that account's customers and, for tickets, `?owner=`
only that owner's customers — an account-level record kept by the
filter would otherwise list every sibling customer of its account.

**Per-company values can add up to more than the chart.** On the
interaction and ticket drills, a record filed on an account counts once
for each of that account's customers, so the companies' `value`s can sum
to more than the chart figure the drill opened. The blank-assignee bar
on the ticket dashboard is not drillable: `assignee:` needs a name.

**A bad `drill` is ignored, never `400`.** An unrecognised segment name,
a value that isn't on the field's real choice list, or a `:value` on a
segment that doesn't take one all fall back silently to the endpoint's
normal stats response — the same "ignore, don't reject" convention every
dashboard filter in this app already follows.

When a drill applies, the response is *only*:

```json
{
  "drill": {
    "segment": "type:email",
    "value_label": "interactions",
    "count": 12,
    "truncated": false,
    "companies": [
      {"id": 41, "name": "Hyatt Regency", "owner": "Dana", "arr": 240000.0, "value": 7}
    ]
  },
  "currency": "USD"
}
```

`count` is the true total; `companies` is capped at `LIMIT = 500`
(`truncated` says whether the list was cut). `arr` is
`arr_billed_at_account` converted with `convert_to_org_currency` (the
org's own FX rates), `null` when no rate exists. `value` is whatever
that segment counts for the company — meaning differs per endpoint, see
the table below. Read-only: no audit event, no data-classification
change.

| Endpoint | Segments | `value_label` |
|---|---|---|
| `GET /api/v1/customers/overview/` | `churned_12m` | `ARR` |
| `GET /api/v1/customers/activity/` | `gone_quiet` | `days since contact` |
| `GET /api/v1/customers/forecast/` | `at_risk`, `churn`, `contraction` | `downside` |
| `GET /api/v1/customers/forecast/` | `expansion` | `expected expansion` |
| `GET /api/v1/interactions/stats/` | `all`; `type:<email\|call\|ticket>`; `sentiment:<value>`; `area:<value>`; `category:<value>`; `subcategory:<value>` | `interactions` |
| `GET /api/v1/tickets/stats/` | `all`; `on_hold`; `sentiment:<value>`; `priority:<value>`; `status:<value>`; `origin:<connector id>` or `origin:none`; `assignee:<name>` (exact match) | `tickets` |

`GET /api/v1/tickets/stats/` has its own section below for its non-drill
response; its drill segments are documented here, the one place a caller
would look for them.

**Open as a list.** `GET /api/v1/customers/?ids=1,2,3` (below) is how a
dashboard opens a drill's companies as a real, paginated list view with
full customer rows rather than a drill's `{id, name, owner, arr, value}`
shape. It does not get past the cap: a drill returns at most 500
companies (`truncated` says when there are more) and `?ids=` reads at
most 500 ids, so a truncated drill cannot be opened in full. The
frontend hides "Open as a list" when `truncated` is true.

### `GET /api/v1/customers/`, `POST /api/v1/customers/`

Auth: `IsAuthenticated` (any role). Scoped to the caller's own organisation.

GET: standard paginated envelope, ordered by name. `?search=<text>` filters
to customers whose `name` (case-insensitive substring) or Revenact ID
(the row's own `id`, also substring — e.g. `?search=8` matches id `8`
and `18`) matches; blank/omitted returns everything. Powers the
frontend's search box — there's no separate "External ID" field in the
schema, so that part of its placeholder text isn't wired to anything.
`?renewal_within=<days>` filters to non-churned customers with a
`renewal_date` on or before today+<days> — **no lower bound**, so an
already-overdue renewal (more urgent, not less) is included, not
filtered out; ordered soonest/most-overdue-first instead of by name.
Powers the Organizations page's Renewal card/popover (1-month/3-month
toggle). A non-integer value is ignored, not an error.
`?ids=1,2,3` narrows to exactly those customers (the dashboard's 'Open as
a list'), archived ones included — an explicit id list asks for those
records; non-integers are ignored, at most 500 are read, and scoping still
applies. `ids` present but empty or all-bad returns nothing, not the whole
book.
The response is still the standard paginated envelope (`PAGE_SIZE = 25`,
`?page=`), not the whole filtered set at once — a caller opening more
than a page of ids pages through with `?ids=...&page=2`, same as any
other list here.
Archived customers (`is_archived=true`) never appear in this list unless
named by `?ids=`, nor in `?renewal_within=`, or in the stats endpoint below — soft-hidden,
not deleted; see the detail endpoint below for how to archive/unarchive.
POST: only `name` is required — every other field above is optional.
**Response `201`** — the created customer, `owner`/`created_by`/`modified_by`
nested (same user shape as elsewhere), `health_category` and
`seat_utilization_percentage` computed.

### `GET /api/v1/customers/stats/`

Auth: `IsAuthenticated`. Scoped to the caller's own organisation, every
customer included (churned ones too — "churn" is itself a lifecycle
bucket below, unlike `?renewal_within=` above which excludes them).
Powers the Organizations page's MetricsPanel (Health / NPS / Lifecycle
Stages sections).

```json
{
  "health": {
    "good":    { "count": 1, "mrr": 4266.67, "arr": 51200.0 },
    "average": { "count": 0, "mrr": 0.0,     "arr": 0.0 },
    "poor":    { "count": 2, "mrr": 7800.0,  "arr": 93600.0 }
  },
  "nps": { "promoters": 1, "passives": 0, "detractors": 2, "score": -33 },
  "lifecycle": {
    "onboarding": { "count": 0, "mrr": 0.0, "arr": 0.0 },
    "kickoff":    { "count": 0, "mrr": 0.0, "arr": 0.0 },
    "adoption":   { "count": 0, "mrr": 0.0, "arr": 0.0 },
    "live":       { "count": 2, "mrr": 10066.67, "arr": 120800.0 },
    "renewal":    { "count": 0, "mrr": 0.0, "arr": 0.0 },
    "churn":      { "count": 1, "mrr": 2000.0, "arr": 24000.0 },
    "expansion":  { "count": 0, "mrr": 0.0, "arr": 0.0 },
    "other":      { "count": 0, "mrr": 0.0, "arr": 0.0 }
  },
  "unconverted_count": 0
}
```

`mrr` is derived (`arr_billed_at_account / 12`) — there's no stored MRR
field. `nps.score = round((promoters - detractors) / scored * 100)`; a
customer with no `nps_score` set is excluded from the breakdown and
from `scored`, not counted as a passive. An empty organisation returns
all-zero buckets, not an error.

**`unconverted_count`**: each customer's `arr_billed_at_account` is in
*its own* `currency`, converted into the org's own currency (via
`fx_rates`, below) before being added to any bucket's `mrr`/`arr` —
these buckets are one tenant-wide total and can't meaningfully mix
currencies. A customer whose currency has no configured `FxRate` is
still counted in `count`, but excluded from every `mrr`/`arr` sum
rather than having its unconverted amount silently treated as if it
were already in the org's currency. `unconverted_count` is how many
customers that happened to, across the whole response — the frontend
shows a caveat rather than a silently-too-low total when it's nonzero.
`GET /api/v1/accounts/stats/` has no equivalent field — `Account` has
no `currency` of its own (see `fx_rates` below), so its `arr` is always
treated as already being in the org's own currency.

### `GET /api/v1/customers/<id>/`, `PATCH /api/v1/customers/<id>/`

Auth: same as above. **`404`, not `403`,** for a customer outside the
caller's organisation.

PATCH accepts any subset of the POST fields (partial update), including
`owner_id` (`400` with a field error if the target user isn't in the
caller's organisation). Every PATCH sets `modified_by` to the caller,
regardless of which fields changed.

**Archive/unarchive**: `PATCH {"is_archived": true}` / `{"is_archived":
false}` — no dedicated endpoint, just a normal field. Distinct from
`lifecycle_stage=churn`: archiving is "stop showing me this" (a soft
delete — the record isn't touched otherwise), churning is a business
outcome (with its own `churn_date`/`churn_reason`/`churn_comment`
fields, still visible in lists unless separately archived). The detail
endpoint itself always works regardless of `is_archived` — only the
list/renewal-window/stats endpoints filter it out.

Changing `is_archived`, in either direction, is gated like a reassign
(`services.knowledge.ownership.may_change_owner`, the check `owner_id`
uses): the current owner, their management chain or an
organisation-settings manager — or anyone, when the customer has no
owner. Otherwise `400 {"is_archived": ["You can't archive this
organization."]}` (`"…restore…"` when unarchiving). Re-sending the
unchanged value is not judged. `POST /organizations/bulk/` `archive`
runs through the same check.

Not built yet, and deliberately out of scope: Board view, nested
Contacts, deleting a customer (only field edits exist so far). Accounts
(one Customer has many) are now built — see below. The rest of this app
*is* wired into the frontend (List page, MetricsPanel, Add/Edit/Churn/
Archive, and the Details page's General tab) — the note that used to be
here saying it wasn't is stale.

### Models — `Account`

Mirrors: `src/pages/organizations/Details.tsx` (`AccountsTab`,
`AccountsMetricsBanner`), `src/components/organizations/accountsData.ts`.
One-to-many under `Customer` (`customer` FK, `related_name="accounts"`)
— a named sub-account (regional/business-unit deployment) of one of the
tenant's own customers, with its own health/pulse/NPS/CSAT tracking
independent of the parent Customer's aggregate numbers.

Field set mirrors `AccountRow` (the mock schema) column for column, same
approach as `Customer` mirrors `tableData.ts`. Two mock fields
deliberately have no column: `orgName` is just `customer.name` (no need
to duplicate it) and `revenactId` is this row's own `id`. Reuses
`Customer.LifecycleStage`/`Customer.AIPulseScore` as its own field
choices and `Customer.HEALTH_THRESHOLDS` for its `health_category`
derivation, rather than redefining them — an account's lifecycle stage
and health mean the same thing as a customer's, just at a finer grain.

Fields: `customer` (FK, server-scoped — **read-only**, never client-
supplied, see the endpoints below), `name`, `domain`/`industry`/`address`/
`email`/`phone` (each blank falls back to the parent customer's own domain/
industry/address/email/phone — for the logo and for ActivityFeed's Overview
tab on the standalone Account page — frontend responsibility, in
`mapAccountToAccountRow.ts`, not enforced server-side; `industry` also gets
a second, real fallback resolution server-side, in
`services/copilot/retrieval.py`'s own `_effective_industry`, since Copilot's
semantic matching runs in Python, not the browser; `address`/`email`/
`phone`/`industry` aren't part of the original `AccountRow` mock schema,
added alongside Customer's own for the same Overview-tab reason),
`owner` (FK to `accounts.User`, nullable, same-tenant only, validated
the same way as `Customer.owner_id`), `created_at`/`updated_at`,
`lifecycle_stage`, `health_score` (0.0–10.0, `health_category` derived,
same thresholds as Customer), `pulse` (JSON list), `ai_pulse_value`
(1–5, nullable), `ai_pulse_score` (derived from it, same mapping and
same both-names-write rule as Customer), `ai_pulse_reason`,
`csm_pulse_score` (1–5, nullable), `csm_pulse_modified_at` (read-only),
`nps_score` (−100 to 100), `csat_score` (0–100),
`renewal_date`, `arr` (MRR is derived, `arr / 12`, not stored — same
convention as Customer).

`Account.customers` is actually a many-to-many (an account can belong to
more than one Customer — see "Known consequences" #1 above), surfaced on
`AccountSerializer` as read-only `customers` (`[{id, name}]`) and
write-only `customer_ids` (a full-replace id list, optional on write).
Both are visibility-aware: `customers` lists only the linked
organisations the requesting viewer may open (`visible_customers`), and
a `customer_ids` write accepts only organisations the viewer may open —
its field itself is scoped to `visible_customers(user)` (not just "same
tenant"), so an id outside it is `400 "Invalid pk … - object does not
exist."`, byte-identical whether that id belongs to another tenant, is a
same-tenant organisation this viewer can't open, or never existed at
all; `validate_customer_ids` still rejects the same set as
defence-in-depth, should a future caller ever reach it some other way —
and never removes a link to an organisation the viewer can't see, even
when the submitted list omits it — a full-replace write against a
now-filtered read would otherwise silently unlink it. See the PATCH
endpoint below.

**Add/Edit Account** covers identity, ownership, lifecycle stage, and
renewal date — same product decision as Customer's own Add/Edit form.
`health_score`/`pulse`/`ai_pulse_value`/`ai_pulse_score`/
`ai_pulse_reason`/`csm_pulse_score`/`nps_score`/
`csat_score`/`arr`/`address`/`email`/`phone` are technically writable
via `AccountSerializer` too (not restricted at the API layer, same as
`CustomerSerializer`) but the Add/Edit Account UI never sends them —
meant to sync from other systems later (`address`/`email`/`phone`
specifically could be added to that form as a follow-up, same category
as the identity fields it already covers, but that's a separate ask
from wiring the Overview tab's read path). See `seed_demo_accounts`
management command for demo data (run after `seed_demo_customers`) —
a handful of accounts are given their own address/email/phone there on
purpose, distinct from their parent's, to demonstrate both the
override and the fallback.

### `GET /api/v1/customers/<customer_id>/accounts/`, `POST /api/v1/customers/<customer_id>/accounts/`

Auth: `IsAuthenticated`. GET: every `Account` under one `Customer` that
the caller may open (`visible_accounts`, SOC2:AUTH-02) — not every
`Account` linked to it. Being able to open the organisation doesn't
imply being able to open all of its accounts: an account the viewer
can't see is left out of this list entirely (no chip, no row), same
object-level rule `AccountDetailView` already applies. **`404`, not
`403` or an empty list,** for a `customer_id` outside the caller's
organisation or that doesn't exist — checked once via
`get_object_or_404` on the parent `Customer` before touching its
accounts, so a real customer in another org 404s the same way a
nonexistent id does (a caller can't otherwise tell "no accounts" apart
from "not your customer").

**Response `200`** (GET) — a **plain array** (no pagination envelope; an
individual customer's account list is expected to stay small), each
entry with `owner` nested and `health_category` computed, same
conventions as `CustomerSerializer`.

POST: only `name` is required. `customer` is always taken from the URL's
`customer_id` — sending a different value in the body is silently
ignored, same convention as `organisation`/`created_by` on the Customer
create endpoint. `owner_id` (optional) is `400` if the target user isn't
in the caller's organisation.

**Response `201`** — the created account, same shape as a GET list entry.

### `GET /api/v1/customers/<customer_id>/accounts/<id>/`, `PATCH /api/v1/customers/<customer_id>/accounts/<id>/`

Auth: `IsAuthenticated`. **`404`, not `403`,** for either id outside the
caller's organisation/customer. PATCH accepts any subset of the POST
fields (partial update); `customer` in the body is ignored (read-only —
there's no way to move an account to a different customer via this
endpoint). `owner_id` follows the same same-organisation validation as
create, plus: a newly assigned owner must be active; an unchanged owner is
accepted as is (`400`, `"Owner must be an active member of your
organisation."` for a newly assigned inactive owner — same rule as
`CustomerSerializer`), and reassigning an already-owned account is gated to
the current owner, their management chain or an organisation-settings
manager. An owner change is handed over (a contribution) and the new owner
notified through `after_account_update` — the same after-save rule the
Accounts bulk edit (`POST /accounts/bulk/`) uses, so a reassign means the
same thing from either. `customer_ids` (plural — see Models above) can add or drop
*other* linked organisations: every submitted id must be one the caller
may open, else `400 "Invalid pk … - object does not exist."` — byte-
identical whether it's another tenant's, a same-tenant organisation the
caller can't open, or doesn't exist at all (see "Known consequences"
#2) — and any currently-linked organisation the caller can't open is
kept regardless of whether the submitted list mentions it.

**Response `200`** (both) — the (possibly updated) account, `customers`
filtered the same visibility-aware way as every other read of this
serializer.

### `GET /api/v1/accounts/`

Auth: `IsAuthenticated`. Every `Account` across every `Customer` the
caller's own organisation owns — the one Account view not nested under
`/customers/<id>/...`, mounted at its own top-level prefix, same
reasoning as `ContactListView`. Powers the standalone Accounts page
(`react-ts-app`'s `/accounts/list`).

GET-only — no matching POST here (see this view's own docstring):
Account has only one possible parent (a Customer), so "Add Account"
already knows exactly which nested endpoint to POST to once a company
is picked, same as the standalone Contacts page's own "Add Contact".

Paginated with the shared `DEFAULT_PAGINATION_CLASS`/`PAGE_SIZE`, same
reasoning as `ContactListView` — unlike the nested per-Customer list
above, this can span every account the tenant has. `?search=` matches
name (substring, case-insensitive). `?company=<customer_id>` filters
to one company's own Accounts.

**Response `200`**
```json
{
  "count": 12,
  "next": "http://.../api/v1/accounts/?limit=20&offset=20",
  "previous": null,
  "results": [
    {
      "id": 4,
      "customer": 6,
      "customer_name": "Apple Inc",
      "name": "Apple EMEA",
      "...": "... same shape as the nested list's own entries, plus customer_name"
    }
  ]
}
```

### `GET /api/v1/accounts/stats/`

Auth: `IsAuthenticated`. Aggregate rollups for the standalone Accounts
page's own MetricsPanel (Health / NPS / Lifecycle Stages sections) —
same shape and same reasoning as `CustomerStatsView`, every Account
across every Customer the caller's org owns (no `is_archived` field on
Account to exclude anything by). MRR is `arr / 12`, same derivation as
`CustomerStatsView`'s own.

**Response `200`**
```json
{
  "health": {
    "good": { "count": 7, "mrr": 4200.5, "arr": 50406.0 },
    "average": { "count": 5, "mrr": 1800.0, "arr": 21600.0 },
    "poor": { "count": 2, "mrr": 300.0, "arr": 3600.0 }
  },
  "nps": { "promoters": 9, "passives": 2, "detractors": 3, "score": 43 },
  "lifecycle": {
    "onboarding": { "count": 4, "mrr": 1200.0, "arr": 14400.0 },
    "...": "... every LifecycleStage value, zero-filled if unused"
  }
}
```

### `GET /api/v1/cockpit/summary/`

Auth: `IsAuthenticated`. Real numbers for Cockpit's own "My Portfolio
Summary"/"Renewals" tiles (react-ts-app's
`src/pages/copilot/CockpitView.tsx`), which used to show fixed literal
counts/values unrelated to any real Customer/Account. Scoped to the
caller's own *owned* book of business — `owner=request.user` on
Customer/Account, not the whole tenant's, same "My" framing as
`/tasks/?mine=true`.

`customers`/`accounts` mirror `CustomerStatsView`/`AccountStatsView`'s
own health-bucketing and FX-conversion rules exactly (`Customer`'s own
`arr_billed_at_hq` converted via `convert_to_org_currency`, excluded
rather than mis-summed when unconvertible — see `unconverted_count`;
`Account`'s own `arr` used as-is, no FX step). `renewals` reuses
`CustomerListCreateView`'s own `?renewal_within=` window/exclusion
rules (today through +`?days=` days inclusive, already-churned
excluded, no `renewal_date` excluded) — `?days=` defaults to `30`, any
positive int (an invalid value silently falls back to 30, same
"ignore, don't 400" convention as `?renewal_within=`'s own). `items`
is every renewing Customer/Account merged into one list and sorted
soonest-first — a real drill-down, not just a count/value pair, same
"give the real list" reasoning as `TaskListView`.

**Response `200`**
```json
{
  "customers": {
    "count": 4, "value": 63500.0, "unconverted_count": 0,
    "health": { "good": 3, "average": 1, "poor": 0 }
  },
  "accounts": {
    "count": 2, "value": 30000.0,
    "health": { "good": 2, "average": 0, "poor": 0 }
  },
  "renewals": {
    "window_days": 30,
    "customers": { "count": 1, "value": 12000.0 },
    "accounts": { "count": 0, "value": 0.0 },
    "items": [
      { "id": 12, "name": "Acme Co", "type": "customer", "value": 12000.0, "renewal_date": "2026-09-12" }
    ]
  }
}
```

### `GET /api/v1/customers/health/`

Auth: `IsAuthenticated`. The whole book with its health history, for every
tab of the Health Overview dashboard — Triage, Divergence, Movement,
Renewal Date and Controls.

**One request for five tabs.** They read the same rows differently —
ranked by risk, plotted CSM-pulse against AI-pulse, counted as
transitions between months, summed as renewal ARR — so an endpoint each
would fetch the same book five times and let the tabs disagree with each
other mid-render.

**Unpaginated on purpose.** Every tab aggregates over the entire book: a
triage queue that ranked only page one would rank nothing. Capped at 500
rows, with `truncated` in the payload rather than a silent cut. Archived
customers are excluded, matching the list endpoint — they are hidden from
the working views, and health is a working view.

Query params: `history_months` (default 12, the most any tab offers)
trims how much history comes back. It is for keeping the payload down,
not for the UI — Movement's own window selector re-slices client-side.

**Response `200`**

```json
{
  "results": [
    {
      "id": 9,
      "name": "Hyatt Hotels Corporation",
      "owner_id": 5,
      "owner_name": "Gerry Hill",
      "lifecycle_stage": "customer_active",
      "lifecycle_stage_display": "Customer - Active",
      "renewal_date": "2027-02-02",
      "arr": 59500.0,
      "days_since_touch": 56,
      "health_score": "5.4",
      "health_category": "average",
      "csm_pulse_score": 4,
      "csm_pulse_modified_at": "2026-02-04T09:12:00Z",
      "ai_pulse_value": 2,
      "ai_pulse_reason": "Seat utilisation at 41% of contract",
      "total_active_seats": 822,
      "history": [
        {"captured_on": "2026-08-31", "health_score": "6.1",
         "health_category": "average", "csm_pulse_score": 4, "ai_pulse_value": 3}
      ]
    }
  ],
  "count": 12,
  "history_months": 12,
  "truncated": false,
  "currency": "USD",
  "unconverted_count": 0
}
```

Notes on the shape:

* `risk_of_loss` / `risk_factors` are the shared churn rule
  (`services/customers/churn.py`) applied to that row — the probability
  the renewal is lost, and every contribution that produced it. Served
  rather than computed in the browser so the Renewal Date tab and the
  Revenue Forecast can't drift apart about the same account.
* `triage_score` (int, 0–155, not a percentage and never clamped: the
  sum of its factors, at most Poor 66 + a 4-point pulse gap 44 + renewal
  inside 90 days 18 + a Good → Poor fall 27; ≥ 40 means needs action now) /
  `triage_factors` (`[{"label": str, "points": int}]`, highest points first) / `triage_direction`
  (`declining` | `improving` | `flat` | `unknown`) are the Triage tab's own
  rule (`services/customers/triage.py`) applied to that row, from exactly
  the fields already on it plus its prefetched history — health category,
  the CSM/AI pulse gap, days to renewal, and whether the last three months
  of history end worse than they started. Served rather than computed in
  the browser so the Triage tab and the dashboard's attention-list endpoint
  (`GET /api/v1/dashboard/attention/`) can't drift apart about the same
  account. `triage_direction` is `unknown` rather than `flat` when fewer
  than two months of history are on record.
* `owner_id` accompanies `owner_name` because the dashboard's Primary
  Owner filter keys on it. Two CSMs sharing a name is ordinary in a real
  org, and a filter keyed on the label would merge their books. Both are
  null for an unowned customer.
* `csm_pulse_score` and `ai_pulse_value` stay **nullable all the way to
  the browser**. "Not rated yet" is a real state, and the Divergence tab
  must not read an unrated account as one both parties agree is terrible.
* **`arr` is converted**, into the organisation's own reporting currency
  (`currency`), through the same `convert_to_org_currency` hook
  `CustomerStatsView` uses — and is **null** where that customer's
  contract currency has no `FxRate` configured. `unconverted_count` says
  how many. The Renewal tab adds money up across the whole book; treating
  an unconverted figure as though it were already in the reporting
  currency produces a confident wrong number, which is worse than an
  incomplete one. The rate table is fetched once per request
  (`fx_rates.conversion.rates_for`), not per row.
* `days_since_touch` is the same number the health rubric's own Customer
  Touch component is built from — not a second definition of "touched".
  An account nobody has ever touched is measured from when it arrived, so
  a logo onboarded last week doesn't read as neglected.
* The last touch, and the pulse inputs (open tickets, recent classified
  conversations — `contact.last_contact_by_customer`/
  `last_contact_annotation`, `models.with_customer_pulse_inputs`), count
  the organisation's own records and **every** one of its accounts',
  whoever is reading: they are organisation facts, the same values the
  health job stores, not a per-record read, so they are deliberately not
  narrowed to the viewer's `visible_accounts`. No record, name or text
  from a hidden account reaches the viewer through them.
* This is a **Customer-level** endpoint. Accounts carry their own health
  and renewal dates, and no tab reads them yet; adding them would change
  what "the book" means on every tab at once.

### `GET /api/v1/customers/overview/`

Auth: `IsAuthenticated`. What the book is made of, for the Customer
Overview dashboard: how many customers, how big, how concentrated, how
long they stayed, and why the ones who left left.

Every other dashboard asks how the customers you have are *doing* —
health, usage, revenue, voice, coverage. This asks what they **are**.

**The one endpoint that counts customers you no longer have.** Every
other rollup goes through `scoping.live_customers` (visible, not
archived, not churned), which is right for a working view — nobody
triages an account that left. Logo retention, cohort survival and churn
reasons are questions about exactly those rows, and computing retention
over survivors returns 100% every time. So this reads the whole visible
book, and every figure says which population it speaks for.

Params: `owner`, `lifecycle`, `customer`, plus `drill` — and its filter
options include churned customers, unlike every other dashboard's,
because being unable to filter to one here would be strange.

**Drill.** `?drill=churned_12m` opens every customer who churned in the
last year — the exact set `portfolio.churned_last_year` builds for
`kpis.churned_12m`, so a drill's count always matches the KPI. Response
shape and the two drill rules: see **Dashboard drill (`?drill=`)** above.
`value` is the customer's converted ARR, same figure as `arr`; nothing is
lost to the visible-book intersection here since this endpoint's own
book already includes churned and archived customers.

**Response `200`** (no `drill`, or an unrecognised one) — `kpis`,
`concentration`, `cohorts`, `churn_reasons`, `segments`, `lifecycle`,
`currency`, `filters`.

```json
{
  "kpis": {"active": 9, "active_arr": 688600.0, "average_arr": 76511.11,
           "churned": 4, "churned_arr": 236100.0,
           "churned_12m": 3, "churned_arr_12m": 212100.0,
           "logo_retention": 69.2, "unpriced": 0},
  "concentration": {
    "rows": [{"rank": 1, "id": 9, "name": "Shopify", "arr": 175000.0,
              "share": 25.4, "cumulative_share": 25.4,
              "owner": "Carl CSM", "health_category": "good"}],
    "total_arr": 688600.0, "counted": 9,
    "rest_count": 0, "rest_arr": 0.0, "top_three_share": 55.5
  },
  "cohorts": {"rows": [{"year": 2023, "joined": 5, "retained": 4,
                        "churned": 1, "retention": 80.0}], "undated": 1},
  "churn_reasons": [{"value": "budget", "reason": "Budget cut",
                     "customers": 2, "arr": 24000.0}],
  "segments": {"rows": [{"key": "over_100k", "name": "$100K and above",
                         "customers": 2, "arr": 287000.0}], "unplaced": 0},
  "lifecycle": [{"key": "live", "name": "Live", "customers": 1, "arr": 67200.0}]
}
```

The decisions behind those numbers:

* **Churn means a `churn_date`, not an archive flag.** Archiving is a
  filing decision — a duplicate row gets archived — and counting it as
  churn would pad every retention denominator with housekeeping. The two
  are separate actions by design.
* **Concentration is the number no other screen states.** If the largest
  three customers are 55% of ARR, that is the most important fact about
  the business. The rows carry a running share so the Pareto is readable
  rather than asserted, and the tail beyond the top ten is *folded* into
  `rest_count`/`rest_arr` rather than dropped — a reader needs to see how
  little of the book it is. An account with no convertible ARR is not
  ranked at all: unknown size can't be placed in a ranking by size.
* **Churn reasons group themselves**, because `churn_reason` is a closed
  list now (see the field above). Each row carries the stored `value` and
  its `reason` label, and **every reason on the list is returned even at
  zero** — which free text could not do, since an absent string and a
  reason nobody thought to type are indistinguishable. "Nothing lost to a
  missing capability this year" is a fact about the product, and it is
  only sayable now. A churned customer with no reason recorded gets a
  `"No reason recorded"` row of its own, separate from `other`, and a
  value left behind by an older release is counted there too rather than
  dropped — the reason counts have to add up to `kpis.churned`.
* **A customer with no `joined_date` is counted apart**, not dropped into
  the earliest cohort — which would make the oldest cohort look larger
  and its retention worse.
* `segments` reports **counts and ARR together**, because the two tell
  opposite stories on most books: the smallest band is usually the most
  accounts and the least money. Every band is present even when empty;
  empty *lifecycle* stages are dropped, because there are eight of those
  and most books use four.
* `logo_retention` and `average_arr` are null rather than flattering on
  an empty book, and the twelve-month churn figures are separate from
  all-time — all-time churn is a fact about history, not about how this
  year is going.

### `GET /api/v1/customers/activity/`

Auth: `IsAuthenticated`. The operations review behind the Activity
Tracking dashboard: **is the team working the book, and where isn't it?**

Not the same question as AI Trending Topics, which counts what
*customers* are talking about. This counts what we did — touches logged,
accounts covered, cadence kept, follow-through on tasks.

`?days=` sets the window (default 90, **clamped** 7–730), plus the usual
`owner` / `lifecycle` / `customer`, plus `drill`.

**Drill.** `?drill=gone_quiet` opens every account past the going-dark
threshold — the exact list `activity_tracking.dark_accounts` builds for
`kpis.dark_accounts` and the page's own capped `going_dark`, so a drill's
count always matches the KPI. Response shape and the two drill rules:
see **Dashboard drill (`?drill=`)** above. `value` is
`days_since_contact`; `null` means never contacted, and those rows sort
first, longest silence next.

**Response `200`** (no `drill`, or an unrecognised one) — `kpis`,
`timeline`, `sources`, `cadence`, `by_owner`, `going_dark`,
`going_dark_threshold`, `window_days`, `currency`, `filters`.

**Counts follow the viewer.** The touch counts (`timeline`, `sources`,
`kpis.touches`), `kpis.inbound` and the task counts count only records the
caller could read: on a customer or on an account they may open
(`visible_children_q` — an account by its own rule), and under each
record's own rule — mail by its mailbox chain, notes by their author's
chain, tickets by department, tasks by creator and assignee
(`activity_tracking.readable`). The last-contact date behind cadence and
going-dark is an organisation fact and is not narrowed (see the Health
Overview notes). A whole-organisation job (`SystemActor`) counts
everything.

Three definitions decide what these numbers mean, and all three are
places a screen like this can mislead:

* **A touch is work we logged**: activities, calls, emails, notes and
  meetings. **Tickets are not touches** — a customer raising one is not
  evidence anyone called them back, and counting it would let a screen
  full of complaints read as a screen full of coverage. They come back
  as `kpis.inbound` beside the touches, because the ratio between the
  two is itself worth seeing. (Email has no direction flag, so an
  inbound reply does count as a touch: a named overstatement, taken
  because dropping email would remove the largest source of real contact
  from a coverage metric.)
* **"Last contact" here is the same number the health rubric uses.**
  Both read `services/customers/contact.py`, which defines once what
  counts as contact (calls, emails, notes, meetings, activities — on the
  company or any of its accounts; tickets are inbound and excluded). The
  rubric used to count `Activity` rows only, so this module returned a
  second figure, `days_since_activity`, beside `days_since_contact` and
  the cadence chart admitted the two could differ. They can't now, and
  the second field is gone. Broadening the rubric moved every health
  score that had non-activity contact; snapshots already recorded are
  history and were not rewritten — the Movement view shows the step.
* **Per-CSM figures are by account owner, never by the name on a
  record.** `sender_name`, `host_name`, `assignee_name` and
  `author_name` are all free text; grouping a team-performance view on
  those would split "J. Smith" from "John Smith" and invent a person.
  `by_owner` therefore answers "is this book being worked", not "who did
  the work".

Smaller decisions worth knowing: a touch on an *account* counts for its
parent company (otherwise a worked account reads as neglected because
the work was logged a level down); an account with no contact at all is
its own `never` bucket rather than "90+ days", which would imply a date
nobody has, and it sorts **above** merely-stale accounts in
`going_dark`; `going_dark_threshold` is imported from `churn.py` so this
screen and the renewal risk agree on what stale means; and `coverage` is
null rather than 0 on an empty book.

### `GET /api/v1/customers/forecast/`

Auth: `IsAuthenticated`. The ARR bridge behind the Revenue Forecast
dashboard: **what is this book worth a year from now, and what moves
it?**

    opening ARR − expected churn − expected contraction + expected
    expansion = forecast ARR

Deliberately a different question from the Health Overview's Renewal
Date tab. That one is operational (which renewals do I work this week,
inside ninety days); this is financial, over a year, and it is the only
place that reads renewals, open Risks and open Opportunities together.

Query params: `horizon_days` (default 365, **clamped** to 30–1095 rather
than rejected), plus the usual `owner` / `lifecycle` / `customer`, plus
`drill`.

**Only pipeline the caller could list counts.** Opportunities and Risks
feed contraction, expansion, the scenarios and `pipeline` only when the
Pipelines board would show them to the caller: their department's or an
undeparted one (`pipeline_visible_q`), and an account-level one only on an
account they may open (`visible_accounts` — seeing its organisation is not
enough). `forecast.readable_pipeline_q`. Whole-organisation jobs (metric
snapshots, the Ops agent, the Brain graph) pass a `SystemActor` and count
everything.

**Drill.** `?drill=` opens a bridge step into the companies behind it:
`at_risk` (every account carrying downside — churn and contraction
together), `churn`, `contraction` or `expansion`. These are the exact
predicates `forecast.build_bridge` sums (churn = rows whose
`churn_exposure >= risk_exposure`, contraction = the rest; both value
`downside`; expansion values `expansion`), so a drill's values always add
up to the step it opened. Response shape and the two drill rules: see
**Dashboard drill (`?drill=`)** above.

**Response `200`** (no `drill`, or an unrecognised one) — `bridge`,
`scenarios`, `pipeline`, `swing`, `horizon_days`, `accounts`,
`renewing_count`, `unpriced_count`, `currency`, `filters`.

```json
{
  "bridge": {"opening_arr": 924700.0, "churn": 175430.0, "contraction": 33120.0,
             "expansion": 131880.0, "forecast_arr": 848030.0,
             "net_change": -76670.0, "nrr": 91.7},
  "scenarios": {"worst": 150200.0, "likely": 848030.0, "best": 1189900.0},
  "pipeline": [{"key": "negotiation", "name": "Negotiation", "open": 68400.0,
                "weighted": 54720.0, "count": 3}],
  "swing": [{"id": 14, "name": "Uber", "arr": 95000.0, "risk": 0.6,
             "factors": [{"label": "Poor health", "points": 0.5}],
             "churn_exposure": 57000.0, "risk_exposure": 0.0, "downside": 57000.0,
             "expansion": 13440.0, "net": -43560.0, "renews_in_horizon": true}]
}
```

The rules behind those numbers, each of which is a decision someone can
disagree with in one place:

* **Churn is weighted by `churn.py`** — the same rule the Renewal Date
  tab prints on its own rows (served on the health payload as
  `risk_of_loss` / `risk_factors`). A forecast that disagrees with the
  work list is a forecast nobody trusts twice. It is a stated business
  rule, not a fitted model: this product has no churn history to fit to.
* **Only renewals inside the horizon can churn.** However bad an account
  looks, it cannot be lost at a renewal that doesn't happen this year.
  An overdue renewal *is* inside the window — the date passed and the
  question is still open.
* **Expansion is weighted by sales stage** (discovery 10% → negotiation
  80% → closed won 100%) and **contraction by risk priority** (high 60%,
  medium 30%, low 10%). Ordinary ladders, stated as assumptions.
* **A Closed Lost opportunity is not counted anywhere** — not expansion, not `pipeline`, not the scenarios, not a
  Copilot pipeline snapshot. `pipeline` keeps its six stages.
* **The same ARR is never lost twice.** An account both renewing badly
  and carrying an open Risk contributes the *larger* of the two, never
  the sum.
* **The downside is capped at what the account pays.** A risk can be
  logged with any MRR on it; without the cap the worst case came out
  negative, which is a forecast saying the book will owe money.
* **`worst` only loses what can be lost this year** — not every account,
  because a floor nobody believes is a floor nobody uses. `best` closes
  the whole open pipeline and loses nothing.
* `nrr` is null rather than a fake 100% on an empty book.
* **Not a time series.** `Opportunity` and `Risk` carry no close date, so
  expansion can't be placed in a quarter; spreading pipeline evenly
  across the year would be inventing the one thing a forecast is asked
  for. The scenario range is how uncertainty is shown instead.

### `GET /api/v1/customers/usage/`

Auth: `IsAuthenticated`. Every rollup the Usage Overview dashboard's
Controls tab draws.

The screen answers one question — **are customers using what they pay
for?** — and the answer has two commercial halves: shelfware below the
line (seats billed and not used, which is a renewal argument being built
for you), and capacity above it (an account with no room left is an
expansion conversation nobody has started). Both are measured off
`Customer.seat_utilization_percentage`, which the model has always
computed and nothing had ever charted.

Rollups are computed server-side, like `/tickets/stats/` and
`/interactions/stats/`. The Health endpoint ships rows instead, and the
difference is deliberate: five Health tabs slice one book five ways,
while this screen has one view and asks the server one thing. `scatter`
is the exception — per-account by nature, capped at 500 points.

**Customer-level only.** Seats live on `Customer`; `Account` has no seat
fields at all, so an account-grain usage view would have nothing to
count.

Query params, each ignored when unparseable (the house convention):
`owner` (a user id, or the literal `unassigned`), `lifecycle` (a
`LifecycleStage` value), `customer` (an id).

**Response `200`** — `kpis`, `bands`, `adoption`, `scatter`,
`shelfware`, `at_capacity`, `currency`, `filters`.

```json
{
  "kpis": {
    "accounts": 12, "contracted_seats": 8055, "active_seats": 5228,
    "utilisation": 64.9, "idle_seats": 2827,
    "shelfware_arr": 275014.42, "at_capacity_arr": 175000.0,
    "at_capacity_count": 1,
    "unmeasured_count": 1, "measured_count": 11, "unpriced_count": 0
  },
  "bands": [{"key": "dormant", "name": "Dormant (<25%)", "accounts": 3,
             "arr": 135600.0, "idle_seats": 1141}],
  "adoption": [{"key": "4+", "name": "4+ products", "accounts": 2, "arr": 287000.0}],
  "scatter": [{"id": 9, "name": "Shopify", "utilisation": 92.0, "arr": 175000.0,
               "active_seats": 1380, "contracted_seats": 1500, "idle_seats": 120,
               "shelfware_arr": 0.0, "products": 6, "band": "at_capacity",
               "owner": "Carl CSM", "lifecycle_stage": "Live",
               "health_category": "good", "renewal_date": "2027-05-15"}],
  "shelfware": [], "at_capacity": [],
  "currency": "USD",
  "filters": {"owners": [], "lifecycles": [], "customers": []}
}
```

The rules worth knowing before reading any of those numbers:

* **Unmeasured is not zero.** A customer with no contracted seats
  recorded has *no* utilisation. Those rows are excluded from every
  average, left out of `bands` and out of `scatter` — a point on the
  axis is a claim, and "we don't know" isn't one — and counted in
  `unmeasured_count`. Scoring a data gap as the worst possible number
  invents the most alarming reading available and then charts it. Same
  rule the health rubric follows for a component it can't measure.
* **`utilisation` is seats over seats**, not the mean of each account's
  percentage: otherwise a ten-seat pilot weighs as much as a
  fifteen-hundred-seat rollout.
* **`shelfware_arr` is a proxy, deliberately.** `arr × (1 −
  utilisation)`, counted only below 75% — a customer using four fifths
  of what they bought is using what they bought. Contracts are rarely
  priced purely per seat, so this estimates exposure rather than
  calculating a refund. It is worth having because it is the only number
  on the screen that starts a QBR.
* **Over 100% is its own band**, not an error to clamp. More actives
  than the contract allows is real, common, and an expansion (sometimes
  compliance) trigger. Such an account has no idle seats and no
  shelfware.
* The two lists rank by **money, not by percentage**: a dormant ten-seat
  pilot is a worse ratio and a smaller problem than a half-used
  enterprise rollout, and only one of them is worth a call this week.
* `arr` is converted into `currency` through the same
  `convert_to_org_currency` hook everything else uses, and is null when
  no rate is configured — those rows still count in every *seat* figure
  and are counted in `unpriced_count`.


### Models — `Product`

What this tenant sells. One row per product per organisation, **unique
case-insensitively** — which is the entire point: "Product A" and
"product a" cannot both exist, so they cannot both appear on a
dashboard.

`Customer.primary_product` was free text until migration 0030, for the
same reason `churn_reason` was: nobody had decided where the list of
products lived. So Product Usage grouped by folding case, reported how
many spellings it had folded, and could never have merged "Integrations
Module" with "Integrations module (EU)".

**Why a table and not a `TextChoices` enum**, unlike `churn_reason`:
every tenant sells something different. A list compiled into the code
would be one organisation's product line imposed on all of them. Churn
reasons are universal; products are not.

Fields: `organisation`, `name`, `is_active`, `created_at`,
`updated_at`. Migration `0030` creates the model, `0031` adds the FK
beside the text column, `0032` fills it (one product per distinct name
per organisation, folded on case, the **most common** spelling winning
the row and ties broken alphabetically so the same database always
migrates the same way), and `0033` drops the text column and renames the
FK into its place. Four steps rather than one because a single
`makemigrations` swap would drop the column and add an empty FK,
silently losing every customer's product.

**Retiring vs deleting**: `is_active=False` takes a product out of the
pickers and leaves every figure ever reported against it intact.
Deleting is for a product added by mistake, and is refused while any
customer is recorded against it — `Customer.primary_product` is
`PROTECT`ed, so the database refuses too; the view catches it so the
caller gets the count and the alternative instead of a 500.

### `GET /api/v1/products/`, `POST /api/v1/products/`

Auth: `IsAuthenticated` to read, `CanManageOrgSettings` to write — the
pickers need the list, so any member may GET it; adding, renaming and
retiring are organisation configuration, because a CSM able to add
"Prodcut A" from a form would be the free-text problem this table
replaced, back through a different door. The tenant's own product
catalogue, ordered by name, unpaginated (a catalogue is tens of rows and
every consumer is a dropdown that wants all of them).

Mounted at its own top-level prefix rather than under `/customers/`, for
two reasons: a product is organisation configuration rather than one
customer's sub-resource, and `/api/v1/customers/products/` already means
the Product Usage dashboard's rollup. Same treatment as `Contact`.

**Deliberately not scoped by ownership**, unlike every other list in
this app. A product list is the shape of the business: a CSM who cannot
see "Product C" cannot record a customer on it, and the pickers on the
Add/Edit form would differ per user. Retired products are returned too —
the caller needs to see one to bring it back, and the pickers filter on
`is_active` rather than on the endpoint.

**Response `200`** — a bare list. `customers` counts the customers led
by that product, annotated in one query for the whole page:

```json
[{"id": 1, "name": "Product A", "is_active": true, "customers": 5,
  "created_at": "2026-09-12T13:51:02Z", "updated_at": "2026-09-12T13:51:02Z"}]
```

**POST** takes `{"name": "..."}` (and optionally `is_active`). Names are
trimmed, and a duplicate is refused with a `400` naming the product it
clashes with — the message that tells somebody the product they're
adding is already on the list under a different capitalisation. A blank
name is refused.

### `GET/PATCH/DELETE /api/v1/products/<id>/`

Auth: same split as the list — any member may GET, `CanManageOrgSettings`
to PATCH or DELETE — scoped to the caller's own organisation (another
tenant's product is a `404`, not a `403`).

**Renaming is cheap and deliberately so**: the customers point at the
row, so fixing a typo fixes it everywhere at once. That is the whole
difference from the free-text field this replaced, where a rename meant
editing every customer and hoping. A rename that collides with another
product is refused, case-insensitively; a product may of course keep its
own name while something else about it changes.

**DELETE is refused with a `400` while customers are recorded against
it**, giving the count and pointing at `is_active=false` instead.
Churned customers count — the Product Usage dashboard's churn figures
are the reason that row exists.

### `GET /api/v1/customers/products/`

Auth: `IsAuthenticated`. One row per product, behind the Product Usage
dashboard: **which products carry the book, and how are the customers on
each one doing?**

Not a second Usage Overview. That one reads seats across the whole book —
one utilisation rate, one shelfware list, a CS operations screen. This
compares *products against each other*: ARR led, health mix, utilisation,
satisfaction, support burden and churn, side by side. It is the screen a
product manager opens, and it answers the question nothing else here asks
— is one of these products quietly responsible for most of the churn?

**The limitation that has to be on the screen, not just in this doc.**
A customer records **one** product.
`additional_products_count` is a bare integer — nobody recorded *which*
other products a customer has, so there is nothing to attribute them to.
Every figure below therefore counts customers this product **leads**, and
a customer on three products is counted once, under their primary one.
The response carries `attribution` so the UI states this above the
numbers rather than leaving a reader to assume revenue has been split
across products. The `Product` model arrived in migration 0030; closing
this gap needs the other half — a per-customer join naming the rest —
and the data to fill it, which nobody has ever collected. A count is all
that was recorded.

Params: `owner`, `lifecycle`, `product` (a `Product` id, or `none` for
customers with no product recorded). Like the Customer Overview and
unlike the working dashboards, this reads the whole visible book
including churned customers: churn by product is half of what the screen
is for, and a product whose customers all left would otherwise read as a
product with no problems.

**Response `200`** — `rows`, `kpis`, `attribution`, `currency`,
`filters`.

```json
{
  "rows": [{
    "id": 1, "product": "Product A",
    "customers": 4, "arr": 443600.0, "share": 64.4, "unpriced": 0,
    "utilisation": 75.1, "contracted_seats": 1040, "active_seats": 781,
    "health": {"good": 4, "average": 0, "poor": 0},
    "healthy_share": 100.0, "unhealthy_arr": 0.0,
    "ces": 84.5, "nps": 57.5,
    "open_tickets": 33, "tickets_per_customer": 8.2,
    "churned": 0, "churned_arr": 0.0, "churn_rate": 0.0
  }],
  "kpis": {
    "products": 5, "customers": 9, "arr": 688600.0,
    "largest": {"product": "Product A", "share": 64.4, "arr": 443600.0},
    "weakest": {"product": "Product B", "unhealthy_arr": 203000.0,
                "healthy_share": 0.0, "customers": 3, "healthy": 0},
    "worst_churn": {"product": "Integrations Module",
                    "churned": 1, "churned_arr": 152600.0},
    "without_customers": []
  },
  "attribution": {"basis": "primary_product", "note": "Every figure counts customers whose *primary* product this is. ..."}
}
```

The decisions behind those numbers:

* **"Weakest" is ranked on the ARR sitting in accounts that are not in
  good health (`unhealthy_arr`), not on the share that are.** The first
  version ranked on `healthy_share` and answered with a product that had
  one unhappy customer worth $42K over one with three unhappy customers
  worth $203K. "Which product do we fix first" is answered in money.
  `largest` is by ARR led, `worst_churn` by the ARR that left — all three
  headlines rank on money, none on a percentage.
* **Utilisation is seats over seats, never the mean of per-account
  percentages** — the same rule the Usage Overview uses, so the two
  screens cannot report different utilisation for the same accounts. A
  product with no seats recorded has `null` utilisation, not 0%:
  unmeasured is not unused.
* **CES and NPS average only the customers who answered.** A product
  nobody surveyed has no score; a zero would make it the worst-rated
  product on the screen.
* **Customers with no product recorded get their own row**
  (`"No product recorded"`). "Nobody wrote down what they bought" is a
  finding about the CRM, and dropping those rows would make the shares
  add up to less than 100% with nothing on screen to explain it.
* **Products are rows, not spellings.** Until migration 0030
  `primary_product` was free text, this endpoint grouped by folding case
  and whitespace, and each row carried a `spellings` count so a reader
  could see the folding doing the work — "Product A" and "product a"
  would not group themselves, and "Integrations Module" and
  "Integrations module (EU)" never could. It groups by id now, and
  `spellings` is gone. Each row carries the product `id` (null for the
  unrecorded bucket).
* **Every product in the tenant's catalogue gets a row, even at zero.**
  A free-text field has no entry for a product nobody bought, so "we
  sell this and nobody is on it" was unsayable; `kpis.without_customers`
  names them. It is *not* called "unsold": the rows are the whole
  catalogue while the customers are scoped to the caller's own book and
  whatever filters are set, so under owner scoping a zero means "nobody
  in this selection". A product with no active customers but some
  churned ones is not in that list — it had customers, and the churn
  figures are the point of its row.
* **`churn_rate` is over everyone the product ever led** (active +
  churned), and a product with no active customers left still gets a row
  — that is the most important row on the screen when it happens, and
  both an ARR sort and a customer-count filter would have hidden it.
  Archiving is neither churn nor active, for the same reason as in the
  Customer Overview.
* **The product dropdown comes from the tenant's own catalogue**, so the
  dashboard and the Add/Edit form offer the same products and cannot
  disagree about what exists. The filter takes a product **id**, or the
  literal `none` for "no product recorded". A retired product stays in
  the dropdown while anyone is still recorded against it, because its
  history is still on this screen; a retired product nobody is on drops
  out.
* Tickets hang off a Customer or one of its Accounts and both count
  toward the product: support load on a division is support load on that
  product. Counted once for the whole page in a single annotated query.

### Models — `HealthSnapshot`

One row per Customer (or Account) per date, recording what that row's
health looked like then. `Customer.health_score` / `csm_pulse_score` /
`ai_pulse_value` only ever hold *today's* reading — updating them
overwrites yesterday's — so this is what remembers.

Exists for the Health Overview's **Movement** tab, which counts how many
accounts moved between Good/Average/Poor from one month to the next
rather than how many sit in each today. Those are different questions: a
month where nine accounts fell and nine recovered is indistinguishable
from a quiet one if you only ever count the current state.

Fields: `customer` / `account` (both nullable FKs, **exactly one set** —
enforced by a `CheckConstraint`, same shape and reasoning as `Activity`),
`captured_on` (date; month-end when backfilled, so a series lines up as
monthly columns), `health_score` (decimal 0.0–10.0 as it stood then),
`csm_pulse_score` and `ai_pulse_value` (1–5, nullable — as they stood
then, null if unrated/unscored at the time), `created_at`.

`health_category` and `ai_pulse_score` are derived here too, from *this
row's* stored numbers — so a snapshot reports its categories exactly the
way a live row does, and a snapshot of a Poor month keeps reading Poor
even after the parent recovers.

One snapshot per parent per date, enforced by two partial unique
constraints (partial, not `unique_together`: a null parent must not
collide with every other null parent on the same date). A Customer and
one of its Accounts may both have a snapshot for the same date.

Served to the dashboard by `GET /api/v1/customers/health/` (above), and
written by `manage.py run_health_maintenance`. `capture_health_snapshot(parent, captured_on)`
is the entry point for recording a reading (upserts, so a scheduled job
firing twice in a day is harmless), and `seed_demo_health_snapshots`
backfills a year of history for demo data. Nothing writes these on a
schedule yet.

### Models — `Activity`

Mirrors: `src/components/shared/ActivityFeed.tsx`'s "Activities" filter,
`src/components/organizations/activity/ActivitiesTab.tsx` (the card:
title, date, watchers/links counts), rendered on both the Organization
Details page's General tab and the standalone Account page.

A timeline entry belonging to **exactly one** of `Customer`
(organization-level) or `Account` (account-level), never both — modeled
as two nullable FKs rather than a `GenericForeignKey` (simpler for
exactly two possible parent types), enforced by a DB `CheckConstraint`
(`activity_belongs_to_exactly_one_parent`) rather than serializer
validation, since there's no create/update endpoint yet to run that
validation through — this round is **read-only**.

Fields: `type` (`TextChoices` — `value_reinforcement`,
`enablement_retraining`, `health_check_review`,
`product_usage_analysis`, `escalation_triggered`,
`onboarding_milestone`, `success_plan_created`, `success_plan_updated`,
`executive_alignment_session`, `renewal_proposal_submitted`, `other`),
`occurred_at` (date), `links`/`watchers` (counts shown on the card's
link/eye icons). No `pulse` field — the card's "Pulse" badge is
decorative in the mock (always shown, tied to nothing), so it stays
decorative here too. No `group` field either — the mock's date-grouping
key is just a different string format of `occurred_at` and is derived
on the frontend instead of duplicated in storage.

See `seed_demo_activities` management command for demo data (run after
`seed_demo_accounts`).

### `GET /api/v1/customers/<customer_id>/activities/`

Auth: `IsAuthenticated`. Every organization-level `Activity` for one
`Customer`, scoped to the caller's own organisation. **`404`, not an
empty list,** for a `customer_id` outside that scope — same convention
as the Account list endpoint above. Powers ActivityFeed's "Activities"
filter on the Organization Details page.

**Response `200`** — a plain array, each entry: `id`, `type`,
`type_display` (the human label, e.g. `"Health Check Review"` — the
card's title text), `occurred_at`, `links`, `watchers`.

### `GET /api/v1/customers/<customer_id>/accounts/<account_id>/activities/`

Auth: `IsAuthenticated`. Every account-level `Activity` for one
`Account`, scoped to both its `customer_id` and the caller's own
organisation — **`404`** for either mismatch, same reasoning as the
Account detail endpoint. Powers ActivityFeed's "Activities" filter on
the standalone Account page — same component as the Customer-scoped
endpoint above, reading a different scope.

**Response `200`** — same shape as the Customer-scoped list above.

### Models — `Email`

Mirrors: `src/components/shared/ActivityFeed.tsx`'s "Emails" filter,
`src/components/organizations/activity/EmailsTab.tsx` (the card:
subject, sender/recipient, a summarized body, watchers/links, a
starred flag) plus the thread panel it opens into.

Same "belongs to exactly one of `Customer` or `Account`" shape as
`Activity` (two nullable FKs + a DB `CheckConstraint`, read-only for
this round — see that model's own docstring for the full reasoning).

Fields: `subject`, `sender_name`/`recipient_name` (plain text, not a
FK — there's no Contact model yet, and the mock data often names a
team rather than a person, e.g. "Support Team"), `body` (the
summarized preview shown on the card), `sent_at` (a single
`DateTimeField` — the frontend formats it into the card's separate
date and time displays rather than storing two different strings),
`links`/`watchers` (the card's two counters), `is_starred` (the star
icon — a real per-item flag, unlike Activity's decorative "Pulse"
badge, so it's a real field here). `sender_avatar` isn't stored — the
frontend derives a placeholder avatar from `sender_name`, same as
before this model existed.

See `seed_demo_emails` management command for demo data (run after
`seed_demo_accounts`).

### `GET /api/v1/customers/<customer_id>/emails/`

Auth: `IsAuthenticated`. Every organization-level `Email` for one
`Customer`, scoped to the caller's own organisation — same
404-not-empty-list convention as the Activity list endpoint. Powers
ActivityFeed's "Emails" filter on the Organization Details page.

**Response `200`** — a plain array, each entry: `id`, `subject`,
`sender_name`, `recipient_name`, `body`, `sent_at`, `links`,
`watchers`, `is_starred`.

### `GET /api/v1/customers/<customer_id>/accounts/<account_id>/emails/`

Auth: `IsAuthenticated`. Every account-level `Email` for one `Account`,
scoped to both its `customer_id` and the caller's own organisation —
same reasoning as the Activity account-level endpoint. Powers
ActivityFeed's "Emails" filter on the standalone Account page.

**Response `200`** — same shape as the Customer-scoped list above.

### Models — `Task`, `TaskEvent`

Mirrors: `src/components/shared/ActivityFeed.tsx`'s "Tasks" filter, the Work section and its task panel.

Same "belongs to exactly one of `Customer` or `Account`" shape as `Activity`/`Email`.

Fields: `title`, `description` (blank), `assignee` (a real `User`, SET_NULL) with `assignee_name` kept equal to its name on every save that touches it (the only name an old seeded task has), `created_by`, `due_date`, `priority` (`high`/`medium`/`low`), `status` (`pending`/`in-progress`/`blocked`/`completed`, default `pending`), `blocked_reason` (≤ 255; set exactly while Blocked — `Task.save` and the CheckConstraint `task_blocked_reason_only_when_blocked`), `source` (`manual`/`plan`/`rule`/`recommendation`/`agent`, default `manual`; customers migration 0056 backfilled `plan` from `plan_id`, then `agent` from `initiative_id`, else `manual`), `initiative`, `plan`, `milestone`, `created_at`. Index `(assignee, status, due_date)`. No `group` field: the date bucket is computed when read.

`TaskEvent` is a task's trail: `task` (CASCADE, `task.events`), `actor` (null = Revenact), `kind` (`created`, `assigned`, `status`, `due_changed`, `edited`, `comment`, `recommended`, `nudged`, `escalated`), `data` (JSON, the values a sentence is written from), `body` (a comment), `created_at`; oldest first. Read only with its task (`services/customers/task_access.openable_tasks`).

Every way a task is made (the record's Tasks tab, a plan, a rule, an approved AI-agent proposal; except the Scenarios engine's Create Task, which is deferred with the Scenarios round) goes through `services/customers/task_changes.add_task` (a plan's start through `created_events`): it stores the real assignee, writes `created` and tells the assignee (`task_assigned`) unless they are the one acting; plans tell theirs with `plan_task_assigned` instead.

See `seed_demo_tasks` for demo data (run after `seed_demo_accounts`); its due dates are offsets from the day it runs.

`plan` and `milestone` (both nullable) link a task to a plan and one of its milestones (`services/plans`); a milestone is set only with its own plan. The nested task lists (`TaskSerializer`) carry `plan: {id, name} | null` and `milestone: {id, name} | null`; the cross-company `GET /api/v1/tasks/` (`TaskListSerializer`) does not.

### `GET /api/v1/customers/<customer_id>/tasks/`

Auth: `IsAuthenticated`. Every organization-level `Task` for one
`Customer`, scoped to the caller's own organisation — same
404-not-empty-list convention as the Activity list endpoint. Powers
ActivityFeed's "Tasks" filter on the Organization Details page.

**Response `200`** — a plain array, each entry: `id`, `title`, `description`, `assignee_name`, `assignee` (`{id, name}` or null), `created_by`, `due_date`, `priority`, `status`, `blocked_reason`, `source`, `created_at`, `initiative`, `plan`, `milestone`. **`POST`** takes the New task body in the `work` section's "Changed existing routes".

Never returns a to-do (Work in one place). `due_date` stays required on create.

### `GET /api/v1/customers/<customer_id>/accounts/<account_id>/tasks/`

Auth: `IsAuthenticated`. Every account-level `Task` for one `Account`,
scoped to both its `customer_id` and the caller's own organisation —
same reasoning as the Activity account-level endpoint. Powers
ActivityFeed's "Tasks" filter on the standalone Account page.

**Response `200`** — same shape as the Customer-scoped list above.

Never returns a to-do (Work in one place). `due_date` stays required on create.

### `GET /api/v1/tasks/`

Auth: `IsAuthenticated`. Every `Task` across every Customer/Account the
caller's own organisation owns, organisation-level and account-level
alike — the one Task view spanning every company at once, same
top-level reasoning as `/opportunities/`/`/risks/`. **Pagination is
off** — a small, whole-collection list.

Powers Cockpit's own "My Tasks" panel (react-ts-app's
`src/pages/copilot/CockpitView.tsx`), which used to read from an
entirely separate, purely local mock Redux list
(`features/tasks/tasksSlice.ts`) with no relation to this real model —
that mock list is untouched (`CallSenseTab.tsx`'s own, unrelated
"Create Tasks from Actions" mockup still uses it).

`?mine=true` additionally filters to Task rows whose parent
Customer/Account's own `owner` is the caller — one CSM's own assigned
book. Without it, this lists every Task the caller can *see*, which is
wider than "mine": it also covers unowned parents and ones reached
through the other side of the Customer/Account relationship. It is no
longer a plain tenant-wide list.

**Response `200`** — a plain array, each entry adds `priority_display`,
`status_display`, `parent_name`, and `parent_type`
(`"customer"`/`"account"`) to the nested shape above — a flat list
spanning every company needs to say which one each row belongs to,
same reasoning as `OpportunitySerializer`'s own `account_name`.

Never returns a to-do (Work in one place). `due_date` stays required on create.

### `GET` / `PATCH /api/v1/tasks/<id>/`, `POST /api/v1/tasks/<id>/comments/`

The task panel: see the `work` section below. The Cockpit tick-off is a PATCH of `status` alone; its
response is the panel's shape, which keeps `parent_name`, `parent_type`, `status_display` and
`priority_display`.

### Models — `Note`

Mirrors: `src/components/shared/ActivityFeed.tsx`'s "Notes" filter,
`src/components/organizations/activity/NotesTab.tsx` (the card:
title, author ("Logged by"), body, date, a link count shown only
when positive).

Same "belongs to exactly one of `Customer` or `Account`" shape as
`Activity`/`Email`/`Task` (read-only for this round).

Fields: `title`, `author_name` (plain text, not a FK — same reasoning
as Task's `assignee_name`), `body`, `logged_at`, `links` (a real
field — the frontend mock's card always showed a hardcoded "1 Links"
regardless of the note, which was a bug, not a deliberate decoration
the way Activity's "Pulse" badge is; this makes it a real per-note
count, shown on the card only when greater than zero). No `tags`
field — the mock carries one, but the component that renders it never
displays it, so there's no card field to back. No `group` field
either — the card's date-group header is derived from `logged_at` at
render time.

See `seed_demo_notes` management command for demo data (run after
`seed_demo_accounts`) — `links` varies across 0 and a few positive
counts on purpose, to exercise both the shown and hidden states.

### `GET /api/v1/customers/<customer_id>/notes/`

Auth: `IsAuthenticated`. Every organization-level `Note` for one
`Customer`, scoped to the caller's own organisation — same
404-not-empty-list convention as the Activity list endpoint. Powers
ActivityFeed's "Notes" filter on the Organization Details page.

**Response `200`** — a plain array, each entry: `id`, `title`,
`author_name`, `body`, `logged_at`, `links`.

### `GET /api/v1/customers/<customer_id>/accounts/<account_id>/notes/`

Auth: `IsAuthenticated`. Every account-level `Note` for one `Account`,
scoped to both its `customer_id` and the caller's own organisation —
same reasoning as the Activity account-level endpoint. Powers
ActivityFeed's "Notes" filter on the standalone Account page.

**Response `200`** — same shape as the Customer-scoped list above.

### Models — `Ticket`

Mirrors: `src/components/shared/ActivityFeed.tsx`'s "Tickets" filter,
`src/components/organizations/activity/TicketsTab.tsx` (the card:
assignee, date, title + ticket number, a status icon, a priority
flag icon, a link count shown only when positive).

Field set was reverse-engineered from the card rather than dictated
up front. Same "belongs to exactly one of `Customer` or `Account`"
shape as `Activity`/`Email`/`Task`/`Note` (read-only for this round).

Fields: `ticket_number` (e.g. `"TKT-1042"`), `title`, `assignee_name`
(plain text, not a FK — same reasoning as Task's `assignee_name`: the
mock's names are often a team, e.g. "Support Team"), `status`
(`TextChoices` — `open`/`in-progress`/`resolved`/`closed`, defaults to
`open` — already colored the card's status icon in the mock),
`priority` (`TextChoices` — `critical`/`high`/`medium`/`low` — the
mock carried real priority values but never actually used them to
style the flag icon, which rendered identically regardless; this pass
wires it up, same bug shape as the old hardcoded "1 Links" text),
`links` (a real field — same fix as `Note.links`, shown on the card
only when greater than zero). No `description` field — the mock's
own `TicketItem` type carries one, but no component renders it
anywhere (no ticket detail view exists), so there's no card field to
back it, same reasoning as `Note`'s excluded `tags`. No `group`
field — the card's date-group header is derived from `opened_at` at
render time.

See `seed_demo_tickets` management command for demo data (run after
`seed_demo_accounts`) — `links` and `priority` both vary across their
full range on purpose, to exercise every card state.

`Ticket` also carries `sentiment` and the AI taxonomy, which it shares
with `Email` and `Call` — see **Models — the AI taxonomy** below.
`sentiment` used to be declared on `Ticket` itself; `Ticket.Sentiment`
still resolves, through the shared abstract model. It additionally has
`connector` (where the ticket came from), `resolved_at`, and an
`on-hold` status, none of which are documented above yet — see the
model's own docstring.

### `GET /api/v1/customers/<customer_id>/tickets/`

Auth: `IsAuthenticated`. Every organization-level `Ticket` for one
`Customer`, scoped to the caller's own organisation — same
404-not-empty-list convention as the Activity list endpoint. Powers
ActivityFeed's "Tickets" filter on the Organization Details page.

**Response `200`** — a plain array, each entry: `id`, `ticket_number`,
`title`, `assignee_name`, `status`, `priority`, `opened_at`, `links`.

### `GET /api/v1/customers/<customer_id>/accounts/<account_id>/tickets/`

Auth: `IsAuthenticated`. Every account-level `Ticket` for one
`Account`, scoped to both its `customer_id` and the caller's own
organisation — same reasoning as the Activity account-level endpoint.
Powers ActivityFeed's "Tickets" filter on the standalone Account page.

**Response `200`** — same shape as the Customer-scoped list above.

### `GET /api/v1/tickets/stats/`

Auth: `IsAuthenticated`. Every rollup the Ticket Overview
dashboard's Controls tab needs, in one response. Unfiltered by default
to avoid the trap of a rolling window on seeded demo data with fixed
dates: calling today after the seeds' 2026 dates renders everything
empty, which looks like a broken integration. Callers that want a window
ask for one.

Query params all ignore a value they don't understand rather than
returning `400`, same convention as `?renewal_within=` and the
interactions stats endpoint:

| Param | Meaning |
|---|---|
| `from`, `to` | `YYYY-MM-DD`, inclusive, against `opened_at`. |
| `priority` | `critical`/`high`/`medium`/`low`. |
| `owner` | User id. |
| `customer` | Customer id. Includes that customer's accounts' tickets. |
| `account` | Account id. |
| `connector` | Connector id. |
| `drill` | Opens one chart segment into the companies behind it — see **Dashboard drill (`?drill=`)** above. |

**Response `200`** (no `drill`, or an unrecognised one) — `kpis`,
`priority`, `status`, `origin`, `assignees`, `sentiment_timeline`,
`filters`:

- `kpis`: `total` (all tickets), `on_hold` (on-hold status),
  `avg_lifetime_days` (average days from open to resolved/closed, or `null`
  if none resolved yet), `resolution_rate` (percent resolved/closed),
  `positive_sentiment` (positive-sentiment tickets), `negative_sentiment`
  (negative-sentiment tickets), `open_count` (tickets not in
  resolved/closed statuses), `oldest_open_days` (days since the oldest
  open ticket was opened, or `null` if no open tickets). Like every other
  KPI, these two follow the request's filters, including `from`/`to` on
  `opened_at`: a windowed call counts only the open tickets *opened* in that
  window, so a caller that wants every open ticket (the Overview card)
  calls without `from`/`to`.
- `priority`: `[{name, value}, ...]` — all four priority levels, even
  empty ones, ordered as they appear on the form.
- `status`: `[{name, value}, ...]` — all five statuses, even empty ones.
- `origin`: `[{name, value, provider, connector_id}, ...]` —
  connector name or "Revenact" if unattached, ordered by count descending.
- `assignees`: `[{name, total, [Status.label]: count, ...}, ...]` —
  per-assignee breakdown by status, ordered by total ascending (quietest
  first) for a horizontal chart.
- `sentiment_timeline`: `[{date, positive, negative}, ...]` — bucketed
  by month of `opened_at`.
- `filters`: read-only; ships with the response so the filter bar needs
  no second round trip.

### Models — the AI taxonomy (`Email`, `Call`, `Ticket`)

Mirrors: `src/pages/dashboard/tabs/ai-trending/ControlsView.tsx` — the
AI Trending Topics dashboard's seven charts.

Three fields plus a timestamp, declared once on an abstract model
(`AIClassified` in `services/customers/models.py`) and shared by the
three record types that dashboard counts — what the backend calls an
**interaction**. One definition rather than three, because the whole
point is to chart all three together: a donut slicing emails, calls and
tickets by sentiment is only meaningful if "negative" means the same
thing in all three.

* `sentiment` — `positive`/`neutral`/`negative`, defaults to `neutral`.
  The same three values as `Contact.sentiment`, deliberately.
* `ai_area` — `product_growth`/`support_operations`/`customer_success`.
  Which side of the business owns the conversation. Blank until
  something classifies it.
* `ai_category` — ten values (`onboarding`, `bug_report`,
  `workflow_automation`, `integration_support`, `system_notification`,
  `account_management`, `feature_request`, `customer_feedback`,
  `reporting_analytics`, `security_compliance`).
* `ai_subcategory` — twenty-five values, each belonging to **exactly
  one** category. Enforced in `clean()`: "API Issue" under "Onboarding"
  is a contradiction, not a judgement call, and the dashboard's Category
  and Subcategory bars are read together. A category with no
  subcategory is fine; a subcategory with no category is not.
* `ai_classified_at` — read-only in practice. Null means nothing has
  ever classified this row, which is what `classify_interactions` looks
  for and what separates "no opinion yet" from a deliberate blank.

The vocabulary lives in `services/customers/taxonomy.py`, including the
category → subcategory map, and it is closed on purpose: free text
would let a model invent a new bucket per call and the Category bar
would grow a tail of synonyms nobody can chart. Area is **not** derived
from category — who owns a conversation and what it is about are two
different questions, and the mock this replaced showed the same
category under two different areas.

`Activity`, `Note` and `Task` deliberately don't carry any of this. An
Activity is something *we* did, with no customer voice in it to read a
sentiment from.

**Who writes it.** `manage.py classify_interactions` — a real, paid
Claude call per batch of 20, through the same
`services/copilot/anthropic_client.py` the Copilot and Headlines use.
It only touches rows with no `ai_classified_at` unless `--reclassify` is
given, so it is safe on a schedule; and even `--reclassify` skips rows a
person corrected (`classification_corrected_at`, see the correction
endpoint under `metrics`) unless `--include-corrected` is passed; `--dry-run` counts the work without calling anything and
`--limit` caps the spend. On a `--reclassify` pass a row the model
declines to place has its previous tags **cleared** (and is stamped, so
a scheduled pass doesn't pay to retry it): the first real run over the
demo book declined two calls that had a title and no summary, and
without this they would have kept the seeder's invented category under
a fresh stamp. It is deliberately **not** bundled into
`run_health_maintenance`, which is free and idempotent.
`manage.py seed_demo_classifications` fills the same fields from a
keyword table instead, so a demo database has full charts with no API
key configured.

### Models — `Call`

Mirrors: `src/components/organizations/activity/CallSenseTab.tsx` (that
tab still reads its own `CALLSENSE_DATA` mock — this model exists for
the dashboard, and wiring CallSense to it is a separate piece of work).

A call that happened. Same "belongs to exactly one of `Customer` or
`Account`" shape as `Activity`/`Email`/`Ticket`, and read-only — there
is no create/update endpoint.

Distinct from `CalendarEvent`, which is a *scheduled* meeting: that one
is a plan and can be in the future, this one took place and has a
duration and a sentiment to read.

Fields: `title`, `host_name` (plain text, not a FK — same reasoning as
`Ticket.assignee_name`, and the host is as often external as ours),
`occurred_at` (a **datetime**, unlike `Activity`/`Ticket`'s plain
dates — the CallSense card renders a time, and two calls in a day are
ordinary), `duration_minutes` (nullable — "the recorder didn't say" is
not a zero-minute call), `summary` (the recap the card shows; blank for
an unsummarised call), `connector` (the recorder — `Connector.Provider`
gained `zoom` for this; null means logged by hand in Revenact, a real
case), `links`, plus the shared taxonomy above. No transcript field —
it would be megabytes per row, nothing renders one, and a copy we
can't keep in sync is a liability.

`Call.clean()` enforces that the recorder actually covers the call's
own company, the same invariant `Ticket.clean()` enforces for the same
reason and in the same place.

See `seed_demo_calls` (run after `seed_demo_connectors`) for demo data.

### `GET/POST /api/v1/customers/<id>/calls/`, `.../accounts/<id>/calls/` — CallSense

Auth: `IsAuthenticated`, same 404-not-empty-list scoping as the other
nested lists. `GET` is the company's calls, newest first, each with
`account_id`/`account_name` (both `null` for an organisation-level call),
`sentiment`/`ai_area`/`ai_category`, `connector_name` (the recorder, or
null), `logged_by {id, name}` (null for synced or seeded calls),
`recording_url`, `participants`, and `transcript` (an Attachment row with
the same `account_id`/`account_name`, or null). On an organisation, `GET`
rolls up its own calls and those on its accounts the caller may open
(`customer_rollup_q`, as for Files below). A call logged on the
organisation path is always organisation-level; an `account_id` in the
body is ignored. Log on the account path to put a call on an account.

`POST` logs a call: `title`, `occurred_at` (datetime), optional
`host_name` (defaults to the caller), `duration_minutes`, `summary`,
`recording_url`. Instead of writing the summary the caller may send
`transcript_text` (JSON) or a `transcript` file (multipart; .txt/.vtt/
.srt/.md, same rules as Files below): the transcript is kept as an
Attachment (`source: "transcript"`) on the same company, and when
`summary` is blank the model writes one from it (`purpose:
"call_summary"`; no model configured means an empty summary, not an
error). The new call is classified straight away by the one helper every
path that creates a call runs (`calls.classify_call`): the classifier reads
the title, then the summary (the model-written digest of the whole
transcript), else the transcript's opening, else the title alone. A call with no
transcript, no summary and a generic title ("Weekly sync") is marked not
analysable without a model call, and so is one the model declines. A
classifier failure never blocks the call: it stays `pending` for the
nightly `classify_interactions`. Every row carries `analysis`: `pending`,
`not_analysable` or `analysed`; `sentiment` is a reading only when it is
`analysed`. Audit event `call.log`.

### Opportunities and risks are read department-wise

`Opportunity.department` / `Risk.department` (`User.Function` or blank)
say whose pipeline an item is on; both serializers carry `department` and
`department_display`, and a new item lands on its creator's department
unless the form says otherwise. `services/customers/scoping.py:
pipeline_visible_q(user)`: a person sees their own department's items
plus the undeparted ones; a role holding `view_all_accounts`, and anyone
in Leadership, see every department. Applied to every opportunity and
risk list (standalone and nested) and to the detail endpoints (another
department's item is a 404). The Pipelines page's book (`/pipelines/{opportunities,risks}/`, see `pipelines_portfolio`) applies the same rule once,
together with the parent rule, and filters by department, priority and stage on the server. Creates, edits (a Board
drag included) and deletes on every endpoint here are audited (`opportunity.created|updated|deleted`, `risk.…`: ids
and changed field names only; a PATCH that changes nothing is not recorded).

### Contact sentiment is computed (`services/customers/contact_sentiment.py`)

A contact's `sentiment` pill is no longer only hand-set. Once a person has
any **classified** interaction — a call they were a participant on, an
email from their address, a ticket they raised — it is recomputed from
those: each is +1 / 0 / −1 by its sentiment, weighted by kind (call 1.0,
ticket 0.8, email 0.6) and by recency (≤30 d 1.0, ≤90 d 0.6, ≤365 d 0.3,
older 0.1); the weighted average above 0.25 is positive, below −0.25
negative, else neutral. `Contact.sentiment_evidence` (`{score, calls,
emails, tickets, positive, neutral, negative, latest_at}`) holds the
whole computation's own evidence, readable or not — a viewer never sees
it: `ContactSerializer` carries only `sentiment_source` (`manual` |
`computed`) and `sentiment_computed_at`, plus a `calls` count (see
"Contacts list/detail" below) and, on `/history/`,
`sentiment_readable` — the same evidence counted only over what the
viewer may open. A contact with no evidence keeps the hand-set value; a
`PATCH` of `sentiment` marks it `manual` again until evidence returns.
`last_contacted_at` moves forward with their newest interaction (a call
counts as contact even before it is classified).

Only the contact's own tenant counts: an email or ticket from their
address under another organisation is never evidence. A call marked not
analysable is not evidence either, though being on it still moves
`last_contacted_at`.

Recomputed whenever records are classified (`classify_records`, and each
batch of the nightly `classify_interactions`), when a call is logged, and
for every contact in `run_health_maintenance`.

`Call.participants` (write `participant_ids`, read `participants
[{id, name, role_display, sentiment}]`) says who from the customer's side
was on a call; only contacts of that company that the logger may see
are accepted (organisation-level ones, and those on accounts in
`visible_accounts` — a colleague's account's contacts are dropped), and a
transcript that names such a contact (full name or email address) links
them automatically.

### `GET /api/v1/contacts/<id>/history/`

Auth: `IsAuthenticated`. The person's calls, emails and tickets, newest
first, for the Contacts page's profile panel
(`services/customers/contact_history.py`). A contact the caller cannot
open is a `404`, the same scope as `GET /contacts/<id>/`.

Every row is twice filtered: by its own company (a record on an account
the caller cannot open is left out, `visible_children_q`), then by its
own rule — mail by its mailbox owner and their chain (`visible_emails`),
tickets by department (`visible_tickets`). Calls are the ones the person
was on (`Call.participants`); emails are from their address and tickets
raised by it, inside the contact's own tenant only. Each list holds the
newest 100; `counts` is the whole visible total per kind.

`sentiment_readable` is the same evidence the stored `sentiment` rests on
(counts only, never text), but counted only over the rows the caller may
read: `{calls, emails, tickets, positive, neutral, negative, latest_at,
others}` for a `computed` sentiment, `null` for a `manual` one.
`others` is `true` when the stored sentiment also rests on evidence the
caller cannot open — the strict rule (owner, 2026-09-27) is that a viewer
never sees a count, date or content of a record they cannot read, so the
full, unfiltered evidence (the model's own `sentiment_evidence`) is never
served. `latest_at` is the newest *readable* row's own timestamp, which
can differ from `counts`/the rows below (those follow each record's own
rule too, but independently — a row can be in `counts` without being
evidence, e.g. a call nobody has read yet).

`analysis` is `pending` (not read yet), `not_analysable` (a call with
nothing to judge: the UI says "Not enough to analyse") or `analysed`.
`sentiment` is `null` unless `analysed`. `classification` holds the
taxonomy labels, blank when unset. `organisation` and `account` are
`{id, name}` or `null`; an account's organisation is the first linked
one the caller may open. `link.url` is an `http(s)` recording or ticket
URL, else `null`; `link.thread_id` is the email's thread. A ticket row
carries its `department` (`User.Function` or blank) and
`department_display` (its label, blank with no department), for the
"Department · Status" line.

**Response `200`**
```json
{
  "contact_id": 2,
  "sentiment": "neutral",
  "sentiment_source": "computed",
  "sentiment_readable": {
    "calls": 5,
    "emails": 2,
    "tickets": 0,
    "positive": 3,
    "neutral": 3,
    "negative": 1,
    "latest_at": "2026-09-12T10:00:00+00:00",
    "others": true
  },
  "counts": { "calls": 7, "emails": 2, "tickets": 1 },
  "calls": [
    {
      "id": 41,
      "title": "Renewal readiness",
      "occurred_at": "2026-09-12T10:00:00+00:00",
      "duration_minutes": 45,
      "host_name": "Carl CSM",
      "summary": "They want the enterprise tier.",
      "analysis": "analysed",
      "sentiment": "positive",
      "classification": {
        "area": "Customer Success",
        "category": "Account Management",
        "subcategory": ""
      },
      "organisation": { "id": 6, "name": "Apple Inc" },
      "account": { "id": 31, "name": "Apple EMEA" },
      "link": { "url": "https://zoom.us/rec/1" }
    }
  ],
  "emails": [
    {
      "id": 88,
      "subject": "Thanks for the call",
      "sent_at": "2026-09-11T08:00:00+00:00",
      "sender_name": "James Wilson",
      "snippet": "Thanks for walking us through the plan…",
      "analysis": "analysed",
      "sentiment": "positive",
      "classification": { "area": "", "category": "", "subcategory": "" },
      "organisation": { "id": 6, "name": "Apple Inc" },
      "account": null,
      "link": { "thread_id": "t-19" }
    }
  ],
  "tickets": [
    {
      "id": 7,
      "ticket_number": "ZD-1042",
      "title": "Export fails",
      "status": "open",
      "status_display": "Open",
      "department": "cs",
      "department_display": "Customer Success",
      "opened_at": "2026-09-10",
      "analysis": "pending",
      "sentiment": null,
      "classification": { "area": "", "category": "", "subcategory": "" },
      "organisation": { "id": 6, "name": "Apple Inc" },
      "account": null,
      "link": { "url": "https://apple.zendesk.com/t/1042" }
    }
  ]
}
```

### `GET /api/v1/contacts/<id>/interactions/` — removed

Served an unfiltered `evidence` (the model's whole `sentiment_evidence`)
and an unfiltered `score`, both across every interaction whether or not
the caller could open it — the strict "never see a count you can't open"
rule this endpoint predated. Removed once the Contacts page moved to
`/history/`, which reads under the caller's own visibility throughout.
The route and view no longer exist; `GET`/any method now `404`s like any
unknown path.

## `organizations` — Organizations portfolio (`/organizations`)

Built for the redesigned list (spec: react-ts-app `docs/superpowers/specs/2026-09-25-organizations-portfolio-design.md`).
`/api/v1/customers/` is unchanged and still serves its other consumers. No model: `services/organizations/book.py`
loads the viewer's book and computes every row signal with the code the dashboard uses, so the two agree.

### `GET /api/v1/organizations/portfolio/`

Auth: `IsAuthenticated`. Scope: `visible_customers(user)`, archived excluded; **churned** (a `churn_date` or the
Churn stage) excluded unless `lifecycle` includes `churn` or `include_churned=1`. This differs from
`/customers/`, which lists churned rows. `ids` names records explicitly: archived and churned ones named there
are included; ids outside visibility are silently absent. Unknown parameter values are ignored, never a 400.

| Param | Meaning |
|---|---|
| `search` | name or Revenact ID (the row id as text), case-insensitive contains. There is no external-ID field on Customer, so none is searched |
| `owner` | user id or `unassigned` |
| `lifecycle` | comma list of `Customer.LifecycleStage` values |
| `health` | comma list of `good,average,poor` (score bands ≥ 7, 4–6.9, < 4) |
| `product` | comma list of `Product` ids (the customer's `primary_product`) |
| `renews_within` | `30`, `90` or `180`: renewal on or before today + N, overdue included, churned excluded (a `churn_date` or the Churn stage, even with `include_churned=1`) — the Renewing tile's own rule |
| `nps` | `promoter` (> 0), `passive` (= 0) or `detractor` (< 0) — `/customers/stats/`'s rule |
| `ids` | comma list, first 500 read; present with no usable id → no rows |
| `include_churned` | `1` |
| `sort` | `arr`, `health`, `renewal`, `touch`, `risk`, `name`, or a numeric field (`arr_billed_at_hq`, `implementation_fee`, `total_contract_value`, `total_forecasted_renewal_revenue`, `total_contracted_seats`, `total_active_seats`, `seat_utilization_percentage`, `total_hires`, `nps_score`, `csat_score`, `ces_percentage`, `ai_pulse_value`, `csm_pulse_score`); `-` prefix descending; default `-arr`. Missing values sort last either way; ties by name. `touch` treats never-contacted as the longest silence. Money sorts converted |
| `group` | `health` (Poor, Average, Good), `owner` (by name, Unassigned last), `lifecycle` (stage order), `product` (by name, No product last), `renewal` (`overdue`, `30`, `90`, `180`, `later`, `none`), or empty |
| `group_value` | with `group` only: restrict `results` and `count` to that group key (a board column). `groups` and `summary` stay whole |
| `cursor` | opaque, from `next_cursor`; valid only for the same filters, search, `ids`, sort, `group` and `group_value` |
| `limit` | default 50, max 100 |

```json
{
  "results": [{
    "id": 7, "name": "Pizza Hut", "initials": "PH",
    "owner": {"id": 2, "name": "Carl CSM"},
    "lifecycle": {"value": "live", "label": "Live"},
    "health": {"score": 4.9, "category": "average", "trend": [6.2, 5.8, 5.5, 5.1, 5.0, 4.9]},
    "renewal": {"date": "2026-08-09", "days": -47},
    "arr": 69600.0,
    "risk": {"score": 73, "direction": "flat"},
    "pulse": {"csm": 3, "ai": 1, "ai_category": "high_risk", "ai_label": "High Risk",
              "reason": "Quiet since the outage.", "history": [1, 2, 2], "disagree": true},
    "last_touch_days": 33,
    "urgent_tickets": 0,
    "signal": {"kind": "renewal_overdue", "label": "Renewal overdue"},
    "is_archived": false, "churned": false,
    "details": {
      "commercial": {"currency": "USD", "arr_billed_at_account": 69600.0, "arr_billed_at_hq": 10000.0,
                     "total_contract_value": 208800.0, "total_forecasted_renewal_revenue": 70000.0,
                     "implementation_fee": 5000.0},
      "contract": {"joined_date": "2024-01-15", "contract_start_date": "2024-02-01",
                   "renewal_date": "2026-08-09", "contract_end_date": "2027-01-31"},
      "adoption": {"total_contracted_seats": 100, "total_active_seats": 16, "seat_utilization_percentage": 16.0,
                   "total_hires": 40, "products": {"primary": {"id": 3, "name": "Core"}, "additional_count": 2},
                   "scope_web_app": "Full"},
      "voice": {"nps_score": -80, "csat_score": 72.5, "ces_percentage": 61.0,
                "ai_pulse_reason": "Quiet since the outage."},
      "profile": {"revenact_id": 7, "domain": "pizzahut.example", "address": "1 Main St, Dallas",
                  "top_source_channel": "Referral"},
      "history": {"created_by": {"id": 1, "name": "Alice Admin"}, "created_at": "2026-01-02T10:00:00+00:00",
                  "modified_by": {"id": 2, "name": "Carl CSM"}, "updated_at": "2026-09-20T08:00:00+00:00",
                  "churn_date": null, "churn_reason": "", "churn_reason_label": "", "churn_comment": ""}
    }
  }],
  "next_cursor": "<opaque string; pass back as ?cursor=>",
  "count": 12,
  "groups": [{"key": "average", "label": "Average", "count": 4, "arr": 244000.0}],
  "summary": {
    "health": {"good": 5, "average": 4, "poor": 3,
               "arr": {"good": 444000.0, "average": 244000.0, "poor": 0.0},
               "mrr": {"good": 37000.0, "average": 20333.33, "poor": 0.0}},
    "nps": {"score": 44, "promoters": 6, "passives": 1, "detractors": 2},
    "lifecycle": [{"value": "onboarding", "label": "Onboarding", "count": 0, "arr": 0.0}],
    "accounts": 12, "arr": 688000.0, "unconverted_count": 0,
    "renewing": {"30": 1, "90": 3}
  },
  "filters": {"owners": [{"value": "2", "name": "Carl CSM"}, {"value": "unassigned", "name": "Unassigned"}],
              "lifecycles": [{"value": "live", "name": "Live"}],
              "products": [{"value": "3", "name": "Core"}]},
  "currency": "USD"
}
```

- **Money.** `arr`, `groups[].arr`, the summary's money and money sorts are in the organisation's `currency`,
  converted like `/customers/health/`; `null` / left out of sums when the contract currency has no FX rate
  (`summary.unconverted_count` says how many). `details.commercial` stays in the customer's own currency.
- **Signals** come from the dashboard's code: `health.trend` is the last five month-end snapshots within six
  months plus today's score; `risk` is the Triage score over the Health view's 12-month history (equal to
  `/customers/health/` `triage_score`); `last_touch_days` is Activity Tracking's last-contact rule (`null` =
  never); `urgent_tickets` counts open High/Critical tickets the viewer's department may read, an account's
  ticket counting for each of its companies (the attention list's support rule). `signal` is at most one of
  `renewal_overdue`, `risk` (score ≥ 40, "Risk NN"), `tickets` ("N open tickets"), in that priority; always
  `null` for a churned row. `pulse.disagree` is `|csm − ai| ≥ 2`.
- **Totals.** `groups` and `summary` cover every filtered row, not the page. The summary reproduces
  `/customers/stats/` (health counts and ARR/MRR, NPS by sign, lifecycle). `summary.renewing` uses the
  `renews_within` filter's rule (churned excluded, whether or not `include_churned=1`), so clicking the tile
  lists exactly its N; with churned rows hidden it also equals `/customers/?renewal_within=`.
- **Pages.** `next_cursor` is `null` on the last page. Following it serves the rows in list order — sections
  first when grouped, the sort within each — every row once. It names the last row served (its section too); if
  that row leaves the set before the next request, the next page starts where it was. The cursor carries a short
  hash of the list it was cut from (search, `owner`, `lifecycle`, `health`, `product`, `renews_within`, `nps`,
  `ids`, `include_churned`, `sort`, `group`, `group_value`); a cursor from a list with any of those changed, or a
  malformed one, returns the first page, so a client may keep it across a filter change without skipping rows.
- **Filters** are the viewer's visible, non-archived customers' owners, stages and products (churned included).
  Owners are only people in the viewer's organisation.
- 12 constant queries per request, whatever the book size (pinned by `PortfolioQueryCountTests`).

### `GET /api/v1/organizations/portfolio/export.csv`

Auth: `IsAuthenticated`. Same parameters (`cursor`/`limit` ignored); every row in list order. `text/csv`,
`Content-Disposition: attachment; filename="organizations-<date>.csv"`. Columns: the 34 Organizations table
fields in the old table's order (labels without "($)") plus `Currency`. Text cells beginning with `= + - @`,
tab or CR are prefixed with `'`. An error response (401/403) renders as a two-row, one-column CSV (`detail`
header, then the message) rather than switching format mid-download. Audited as `organizations.exported`, with
`count` (rows exported) and `params` (the query-parameter names used, never their values).

### `POST /api/v1/organizations/bulk/`

Auth: `IsAuthenticated`. Body `{"ids": [1, 2], "action": "set_owner" | "set_lifecycle" | "archive", "value": …}`:
`set_owner` takes a user id, or `null` to unassign — the `value` key must be present; omitting it entirely is a
400, so a forgotten key can never strip every selected organization's owner. `set_lifecycle` takes a stage other
than `churn` (400 — churn keeps its own modal, which records date and reason); `archive` ignores `value`. 1–500
ids, duplicates applied once.

Each id is locked and re-read (`select_for_update`) before it changes, then runs the ordinary customer update
(`CustomerSerializer`, partial) in its own transaction: the record must be visible to the caller, an owner must
be an active member of the caller's organisation (an inactive owner is rejected, exactly as on
`PATCH /customers/<id>/`), and only the current owner, their management chain or an organisation-settings
manager may reassign — or archive: the same check gates `archive`, and a refused id is in `failed` with
`"You can't archive this organization."` while the rest still succeed; an owner change is handed over (a contribution) and the new owner notified — the "assigned
you" push fires on commit, since a bulk edit saves each organization in its own transaction. `200`:

```json
{"updated": [1], "failed": [{"id": 2, "reason": "Not found."}]}
```

An id the caller cannot see reads `"Not found."`, like one that does not exist. A database error on one id puts
it in `failed` with the reason `"Could not be updated."` and the batch continues with the rest. Audited as
`organizations.bulk_updated`, written in a `finally` so a batch that raised still records what was saved;
outcome `failure` when nothing was updated or the batch did not finish.

### `GET /api/v1/organizations/<id>/story/`

The organisation page's Story tab (spec: react-ts-app `docs/superpowers/specs/2026-09-26-organization-detail-design.md`
§2): every record on the organisation and on its accounts, newest first under one cursor across all sources, with
counts and the Needs attention block. No model: `services/organizations/story/` reads the existing records. The
per-type `/customers/<id>/…` endpoints are unchanged and still handle create and edit.

Auth: `IsAuthenticated` — `401` unauthenticated. GET only. The organisation must be in `visible_customers(user)`,
otherwise `404` (archived and churned organisations open). Unknown parameter values are ignored, never a 400.

| Param | Meaning |
|---|---|
| `group` | `conversations` (activity, call, email, calendar_event), `tickets` (ticket), `tasks` (task, note), `feedback` (survey), `health` (health) |
| `source` | comma list of exact kinds: `activity`, `calendar_event`, `call`, `email`, `health`, `note`, `survey`, `task`, `ticket`; intersected with `group` |
| `account` | an account id: that account's records only (an account not linked to this organisation, or one the viewer can't open, reads nothing); or `none`: the organisation's own records |
| `q` | case-insensitive contains, first 200 characters, over: activity type; call title, summary, host; email subject, body, sender, recipient; meeting title, description; ticket title, number, description, requester; task title, assignee; note title, body, author; survey type. `health` items are never matched |
| `thread` | an email `thread_id`: the emails of that thread only (opening an email shows its thread). Narrows `items` only — `counts` ignore it, so under `?thread=` the counts stay the organisation's totals |
| `cursor` | opaque, from `next_cursor` |
| `limit` | default 30, max 100 |

```json
{
  "items": [{
    "id": 41, "kind": "call", "source": "zoom",
    "occurred_at": "2026-09-25T14:05:00+00:00", "all_day": false,
    "account": {"id": 9, "name": "EMEA"},
    "title": "Quarterly review", "summary": "They want SSO before the renewal.",
    "actor": {"id": null, "name": "Carl CSM"},
    "link": {"thread_id": null, "url": "https://zoom.us/rec/1"}
  }, {
    "id": 17, "kind": "note", "source": "revenact",
    "occurred_at": "2026-09-24T00:00:00+00:00", "all_day": true,
    "account": null,
    "title": "Champion left", "summary": "Sam moved on to Globex.",
    "actor": {"id": 2, "name": "Carl CSM"},
    "link": {"thread_id": null, "url": null}
  }],
  "next_cursor": "eyJhdCI6IjIwMjYtMDktMjRUMDA6MDA6MDArMDA6MDAiLCJrIjoibm90ZSIsImlkIjoxNywiZiI6IjEyMzQ1Njc4OWFiY2RlZjAifQ",
  "counts": {
    "by_group": {"all": 12, "conversations": 6, "tickets": 2, "tasks": 3, "feedback": 1, "health": 0},
    "by_kind": {"activity": 1, "calendar_event": 1, "call": 2, "email": 2, "health": 0, "note": 2,
                "survey": 1, "task": 1, "ticket": 2},
    "by_account": {"all": 12, "none": 5, "9": 7}
  },
  "attention": {
    "renewal": {"date": "2026-10-08", "days": 12, "overdue": false},
    "tickets": {"count": 2, "oldest_days": 9},
    "overdue_tasks": {"count": 1, "oldest_days": 3},
    "questions": {"count": 1},
    "anomaly": {"id": 5, "title": "Similar reports across 1 of your companies",
                "first_seen_at": "2026-09-20T08:00:00+00:00", "last_seen_at": "2026-09-25T10:00:00+00:00"}
  }
}
```

- **Kinds.** Only kinds with real data exist: `activity` (logged activities), `call` (CallSense: `summary` is the
  call's own summary), `email`, `calendar_event` (meetings up to today; upcoming ones stay on
  `/customers/<id>/calendar-events/`), `ticket`, `task` (from when it was created), `note`, `survey`, and `health`:
  a month-end `HealthSnapshot` whose health category, AI pulse or CSM pulse differs from the same parent's previous
  one. Its `title` is "Health fell to Poor" / "Health rose to Good" when the category moved; otherwise it names the
  pulse that moved ("AI pulse rose to 4", "CSM pulse fell to 2", "… set to N" from no reading, "… cleared" to
  none), or "Pulse changed" when both did. Its `summary` lists only what moved, e.g. "Health 7.6 → 3.5 · AI pulse
  3 → 1" (the score part only when the score itself changed). An organisation reading and an account reading on
  the same date are two items. Not sources: Slack, in-app conversations and Revenact Support (added when real), lifecycle changes (not
  stored), and `Customer.pulse`'s undated dots.
- **Horizon.** A record dated after today is not story yet: every source excludes rows at or past tomorrow
  midnight UTC (an upcoming meeting, a future-dated ticket), and the health snapshots read under the same horizon.
  A date is compared as that day's midnight UTC in SQL (`::timestamp AT TIME ZONE 'UTC'`), whatever the database
  session's time zone.
- **Scope.** A record is in the story when it is filed on this organisation (`account: null`) or on one of its
  accounts the viewer may open (`visible_accounts`, the per-account endpoints' rule; a shared account's records
  appear on each of its organisations). Records on any other organisation or account never appear.
- **Privacy (twice filtered).** After the organisation, each record is read under its own rule: mail by its
  mailbox owner and their chain (`visible_emails`), notes by author and chain (`visible_notes`), tasks by creator,
  assignee and the chains above them (`visible_tasks`), tickets by department (`visible_tickets`); activities,
  calls, meetings, surveys and health readings by the organisation's rule alone, as on their endpoints. Items,
  counts, attention and search all read the same filtered rows.
- **Items.** `occurred_at` is ISO 8601 UTC. `all_day: true` marks a record that stores only a date (activity,
  meeting, ticket, note, survey, health): read the date part, it is not a moment. `source` is where the record came
  from: the connector's provider (`zendesk`, `jira`, `zoom`, …), the mailbox's provider (`google`, `microsoft`,
  `imap`), or `revenact`. `summary` is one line, at most 240 characters. `actor.id` is a user id when the record
  links a user, else `null` with the name the record stores; `actor` is `null` for activities, meetings, surveys and
  health. `link.thread_id` is an email's thread (pass it as `thread`); `link.url` is a ticket's source-system URL
  or a call's recording, only when it is `http(s)`. A `task` item also carries `plan: {id, name} | null` and
  `milestone: {id, name} | null` (`services/plans`), the same two keys the task payload itself carries; every
  other kind omits them.
- **Order and pages.** Newest first by `(occurred_at, kind, id)`, all descending. `next_cursor` is `null` on the
  last page. It names the last item served, so rows added or removed elsewhere never cause a skip or a repeat. A
  cursor from another organisation, from other `group`/`source`/`account`/`q`/`thread` values, or a malformed one,
  reads the first page.
- **Counts** cover the whole filtered set, not the page. `by_kind` and `by_group` follow `account` and `q` but not
  `group`/`source`; `by_account` follows `group`, `source` and `q` but not `account`, and lists `all`, `none` (the
  organisation's own records) and exactly the accounts in scope. None of the three follow `thread`.
- **Attention** follows `account` (tickets, tasks, anomaly) and nothing else. `renewal`: renewal date overdue or
  within 30 days, `null` for a churned organisation. `tickets`: open High/Critical. `overdue_tasks`: not completed,
  due before today. `questions`: open Knowledge questions on this organisation the viewer may read
  (`visible_questions`). `anomaly`: the latest live anomaly with evidence the viewer may read on this organisation
  or its accounts; its title is the stored one only for a viewer who sees every account, otherwise "Similar reports
  across 1 of your companies". Its summary is never returned. Each entry is `null` when nothing needs attention.
- 33 constant queries per request, whatever the organisation's size — 31 in `build_story` plus 2 the view itself
  adds loading the fresh request's user (organisation, role) (pinned by `StoryQueryCountTests`).

### Ask Revenact on Organizations

Not an endpoint of this app: the page's Ask rail sends `POST /api/v1/copilot/messages/` with
`context.surface = "organizations"` (see the `copilot` section). The answer is grounded in
`load_portfolio`, `select` and `build_summary` for the asker and the same filters, so every figure it
quotes is the figure `GET /organizations/portfolio/` returns.

## `accounts_portfolio` — Accounts portfolio (`/accounts` list and Board redesign)

Built for the redesigned Accounts list (spec: react-ts-app
`docs/superpowers/specs/2026-09-29-accounts-redesign-design.md`). `/api/v1/accounts/` and
`/api/v1/accounts/stats/` (`services.customers`) are unchanged and still serve their other consumers — this app
mounts at the same `api/v1/accounts/` prefix but adds only `portfolio/` and `bulk/`, so neither existing exact
path is shadowed. No model: `services/accounts_portfolio/book.py` reuses Organizations' generic helpers (`health_q`,
`NPS_Q`, `signal_for`, `snapshot_history`, `health_trend`) and the dashboard's own `triage`, so a row's numbers
always agree with Health Overview and the Board.

### `GET /api/v1/accounts/portfolio/`

Auth: `IsAuthenticated`. Scope: `visible_accounts(user)`. **No archive, no churn**: unlike
`/organizations/portfolio/`, nothing is hidden by default and there is no `include_churned` — Account has
neither field, so Churn is an ordinary lifecycle stage. `ids` narrows visibility, never widens it; ids outside
it are silently absent. Unknown parameter values are ignored, never a 400.

| Param | Meaning |
|---|---|
| `search` | name or Revenact ID (the row id as text), case-insensitive contains |
| `organisation` | comma list of linked `Customer` ids the viewer may open; an account on any of them matches |
| `owner` | user id or `unassigned` |
| `lifecycle` | comma list of `Customer.LifecycleStage` values (Churn included — accounts have no churn field, so it behaves like any other stage) |
| `health` | comma list of `good,average,poor` — the same bands as Organizations |
| `renews_within` | `30`, `90` or `180`: renewal on or before today + N, overdue included — the Renewing tile's own rule |
| `nps` | `promoter` (> 0), `passive` (= 0) or `detractor` (< 0) |
| `ids` | comma list, first 500 read; present with no usable id → no rows |
| `sort` | `risk`, `arr`, `renewal`, `health`, `name`; `-` prefix descending; default `-arr`. Missing values sort last either way; ties by name |
| `group` | `health` (List default), `lifecycle` (Board), `owner`, `renewal` (`overdue`, `30`, `90`, `180`, `later`, `none`), or empty |
| `group_value` | with `group` only: restrict `results` and `count` to that group key (a Board column). `groups` and `summary` stay whole |
| `cursor` | opaque, from `next_cursor`; valid only for the same filters, search, `ids`, sort, `group` and `group_value` |
| `limit` | default 50, max 100 |

```json
{
  "results": [{
    "id": 12, "name": "Pizza EMEA", "initials": "PE",
    "owner": {"id": 2, "name": "Carl CSM"},
    "lifecycle": {"value": "live", "label": "Live"},
    "health": {"score": 8.0, "category": "good", "trend": [8.1, 8.0, 8.0]},
    "renewal": {"date": "2026-11-02", "days": 34},
    "arr": 12000.0,
    "risk": {"score": 12, "direction": "flat"},
    "pulse": {"csm": null, "ai": null, "ai_category": null, "ai_label": "",
              "reason": "", "history": [], "disagree": false},
    "last_touch_days": null,
    "urgent_tickets": 0,
    "signal": null,
    "organisation": {"id": 7, "name": "Pizza Hut"},
    "extra_organisations": 0,
    "details": {
      "commercial": {"arr": 12000.0, "renewal_date": "2026-11-02"},
      "voice": {"nps_score": null, "csat_score": null, "ai_pulse_reason": ""},
      "profile": {"revenact_id": 12, "domain": "", "industry": "", "email": "", "phone": "",
                  "address": "", "organisations": [{"id": 7, "name": "Pizza Hut"}]},
      "history": {"created_at": "2026-09-29T10:00:00+00:00", "updated_at": "2026-09-29T10:00:00+00:00",
                  "pulse_recorded_on": null, "csm_pulse_modified_at": null}
    }
  }],
  "next_cursor": "<opaque string; pass back as ?cursor=>",
  "count": 1,
  "groups": [{"key": "good", "label": "Good", "count": 1, "arr": 12000.0}],
  "summary": {
    "health": {"good": 1, "average": 0, "poor": 0,
               "arr": {"good": 12000.0, "average": 0.0, "poor": 0.0},
               "mrr": {"good": 1000.0, "average": 0.0, "poor": 0.0}},
    "nps": {"score": 0, "promoters": 0, "passives": 0, "detractors": 0},
    "lifecycle": [{"value": "onboarding", "label": "Onboarding", "count": 0, "arr": 0.0}],
    "accounts": 1, "arr": 12000.0, "unconverted_count": 0,
    "renewing": {"30": 0, "90": 0}
  },
  "filters": {"organisations": [{"value": "7", "name": "Pizza Hut"}],
              "owners": [{"value": "2", "name": "Carl CSM"}],
              "lifecycles": [{"value": "live", "name": "Live"}]},
  "currency": "USD"
}
```

- **Money.** `arr`, `groups[].arr`, `details.commercial.arr` and the summary's money are `Account.arr` as
  stored — already in the workspace's currency (`Organisation.currency`), unlike a Customer's own contract
  currency, so `unconverted_count` is always `0`, kept only so both lists' tiles share one shape.
- **Row name line.** `organisation` is the first linked `Customer` the viewer may open, lowest id first;
  `extra_organisations` counts the rest. One linked to two or more organisations, only some openable, shows
  only the ones the viewer may open — never discloses a hidden one by name or count.
- **Signals** come from the dashboard's code, over the account's own history: `health.trend` is a 6-month
  sparkline from `HealthSnapshot`; `risk` is the Triage score/direction; `last_touch_days` is Activity
  Tracking's last-contact rule on the account (`null` = never); `urgent_tickets` counts the account's own open
  High/Critical tickets under `visible_tickets` (not a company's fan-out — an account's ticket counts once,
  for itself). `signal` (`services.organizations.book.signal_for`) is `null`, or an object
  `{"kind": "renewal_overdue" | "risk" | "tickets", "label": "…"}` — at most one, in that priority
  (`renewal_overdue` when the renewal date is past, `risk` when the Triage score is ≥ the action threshold
  with label `"Risk NN"`, `tickets` for open High/Critical tickets with label `"N open ticket(s)"`); an account
  has no churn, so nothing mutes it. The example row above is healthy (`"signal": null`); a row with an
  overdue renewal reads `"signal": {"kind": "renewal_overdue", "label": "Renewal overdue"}`.
  `pulse.disagree` is `|csm − ai| ≥ 2`.
- **Totals.** `groups` and `summary` cover every filtered row, not the page. The summary is
  `AccountStatsView`'s arithmetic (health counts and ARR/MRR, NPS by sign, lifecycle); `summary.renewing`
  uses the `renews_within` filter's own rule (overdue included), so clicking the Renewing tile lists exactly
  its N.
- **Pages.** `next_cursor` is `null` on the last page. Following it serves rows in list order — sections first
  when grouped, the sort within each — every row once. The cursor carries a short hash of the list it was cut
  from (search, `organisation`, `owner`, `lifecycle`, `health`, `renews_within`, `nps`, `ids`, `sort`, `group`,
  `group_value`); a cursor from a list with any of those changed, or a malformed one, returns the first page.
- **Filters** are the viewer's visible accounts' linked (openable) organisations, owners (only people in the
  viewer's own organisation) and lifecycle stages present.
- 10 for an admin; flat (constant as the book grows) for everyone, whatever the book's size (pinned by
  `PortfolioQueryCountTests`).

### `GET /api/v1/accounts/portfolio/export.csv`

Auth: `IsAuthenticated`. Same parameters (`cursor`/`limit` ignored); every row in list order, the same filtered,
visible set the list endpoint returns. `text/csv`, `Content-Disposition: attachment;
filename="accounts-<date>.csv"`. Columns: the 24 Account fields (`fields.FIELDS`) plus `Currency`
(`Organisation.currency`, the currency `arr` is already in). Text cells beginning with `= + - @`, tab or CR are
prefixed with `'`. An error response (401/403) renders as a two-row, one-column CSV (`detail` header, then the
message) rather than switching format mid-download. Audited as `accounts.exported`, with `count` (rows
exported) and `params` (the query-parameter names used, never their values).

### `POST /api/v1/accounts/bulk/`

Auth: `IsAuthenticated`. Body `{"ids": [1, 2], "action": "set_owner" | "set_lifecycle", "value": …}`: `set_owner`
takes a user id, or `null` to unassign — the `value` key must be present; omitting it entirely is a 400, so a
forgotten key can never strip every selected account's owner. `set_lifecycle` takes any `Customer.LifecycleStage`
value, Churn included — an account has no churn flow of its own, so Churn there is only a stage. No `archive`
action: Accounts have neither archive nor churn as their own field. 1–500 ids, duplicates applied once.

Each id is locked and re-read (`select_for_update`) before it changes, then runs the ordinary account update
(`AccountSerializer`, partial) in its own transaction: the record must be visible to the caller
(`visible_accounts`), an owner must be an active member of the caller's organisation (an inactive owner is
rejected, exactly as on `PATCH /customers/<cid>/accounts/<id>/`), and only the current owner, their management
chain or an organisation-settings manager may reassign; an owner change is handed over (a contribution on every
organisation the account is linked to) and the new owner notified via `after_account_update` — the same
after-save rule the single-account PATCH now uses, so a reassign means the same thing from either. The
"assigned you" push fires on commit, since a bulk edit saves each account in its own transaction. `200`:

```json
{"updated": [1], "failed": [{"id": 2, "reason": "Not found."}]}
```

An id the caller cannot see reads `"Not found."`, like one that does not exist. A database error on one id puts
it in `failed` with the reason `"Could not be updated."` and the batch continues with the rest. Audited as
`accounts.bulk_updated`, written in a `finally` so a batch that raised still records what was saved; outcome
`failure` when nothing was updated or the batch did not finish.

## `pipelines_portfolio` — Pipelines (`/pipelines`)

Built for the redesigned list and Board (spec: react-ts-app `docs/superpowers/specs/2026-09-30-pipelines-redesign-design.md`
§1–§2). One book of opportunities or risks across organisations **and** accounts. No model:
`services/pipelines_portfolio/book.py` loads the viewer's items and `shape.py` orders, groups and totals them in
Python, with `services/portfolio_core`'s keyset cursor, section order and bulk reasons (shared with Organizations and
Accounts; CSV cell escaping and `build_table` stay in `services/organizations/export.py`). `/opportunities/`, `/risks/`
and their nested routes are unchanged apart from the new fields.

### `GET /api/v1/pipelines/opportunities/` and `GET /api/v1/pipelines/risks/`

Auth: `IsAuthenticated`. Scope (`book.scope`, the twice-filter, applied once): an item exists only if the viewer may
open its organisation or account (`visible_children_q`) **and** may read it by department (`pipeline_visible_q`) —
the detail endpoints' own rule. Every filter narrows that scope. Unknown parameter values are ignored, never a 400.
Items on an archived organisation still appear in the book, as they always have on the older `/opportunities/` list —
unlike the Organizations list, which hides archived organisations.

| Param | Meaning |
|---|---|
| `search` | title, or the item's organisation or account name, case-insensitive contains |
| `organisation` | comma list of organisation ids: items on it, plus items on its accounts the viewer may open. An id the viewer cannot open matches nothing |
| `account` | comma list of account ids: items on it. An id the viewer cannot open matches nothing |
| `owner` | a user id (only people in the viewer's organisation — any other id narrows to nothing), `unassigned`, or `outside` (the parent's owner is outside the viewer's organisation, named "Not in your book") |
| `stage` | comma list of the kind's stages. **Default: the open stages** (opportunities: not `closed_won`/`closed_lost`; risks: `open`). Closed stages are opt-in; the Board sends every stage. With `ids` and no `stage`, every stage |
| `priority` | comma list of `high,medium,low` |
| `department` | comma list of `User.Function` values; `none` = undeparted |
| `date` | `30`, `90`, `180` (dated today to today+N, inclusive), `overdue` (open and dated before today) or `none` (no date). Opportunities read `expected_close`, risks `due_by` |
| `changed` | `quarter`: the stage last changed this calendar quarter (`stage_changed_at`, UTC) |
| `ids` | comma list, first 500 read; present with no usable id → no rows |
| `sort` | `mrr`, `date`, `priority` (`-priority` = High first), `stage` (board order), `title`; `-` prefix descending; default `-mrr`. Missing values sort last either way; ties by title, then id |
| `group` | `stage` (board order), `month` (`overdue`, then `YYYY-MM` ascending, then `none`; a closed item past its date sits in its month), `parent` (`organisation:<id>`/`account:<id>`, by name), `owner` (by name, `outside` after named people, `unassigned` last), `department` (by name, `none` last), `priority` (High, Medium, Low), or empty |
| `group_value` | with `group` only: restrict `results` and `count` to that group key (a Board column). `groups` and `summary` stay whole |
| `cursor` | opaque, from `next_cursor`; valid only for the same kind and the same filters, search, `ids`, sort, `group` and `group_value` |
| `limit` | default 50, max 100 |

```json
{
  "kind": "opportunities",
  "results": [{
    "id": 41, "kind": "opportunity", "title": "EMEA seats",
    "parent": {"type": "account", "id": 12, "name": "Pizza Hut EMEA"},
    "companies": [{"id": 7, "name": "Pizza Hut"}],
    "owner": {"id": 2, "name": "Carl CSM"},
    "mrr": 2000.0,
    "stage": {"value": "negotiation", "label": "Negotiation"},
    "priority": {"value": "high", "label": "High"},
    "department": {"value": "cs", "label": "Customer Success"},
    "date": {"value": "2026-10-07", "days": 7},
    "open": true, "overdue": false,
    "signal": {"kind": "high_priority", "label": "High priority"},
    "stage_changed_at": "2026-09-30T10:00:00+00:00",
    "created_at": "2026-09-01T09:00:00+00:00"
  }],
  "next_cursor": "<opaque string; pass back as ?cursor=>",
  "count": 12,
  "groups": [{"key": "negotiation", "label": "Negotiation", "count": 3, "mrr": 6400.0}],
  "summary": {
    "items": 20, "mrr": 41000.0,
    "open": {"count": 12, "mrr": 26000.0},
    "within": {"30": {"count": 2, "mrr": 4000.0}, "90": {"count": 5, "mrr": 9000.0}},
    "overdue": {"count": 1, "mrr": 3000.0},
    "done_this_quarter": {"stage": "closed_won", "count": 3, "mrr": 7000.0},
    "stages": [{"value": "discovery", "label": "Discovery", "count": 4, "mrr": 5000.0}]
  },
  "filters": {
    "organisations": [{"value": "7", "name": "Pizza Hut"}],
    "accounts": [{"value": "12", "name": "Pizza Hut EMEA"}],
    "owners": [{"value": "2", "name": "Carl CSM"}, {"value": "outside", "name": "Not in your book"}, {"value": "unassigned", "name": "Unassigned"}],
    "stages": [{"value": "discovery", "name": "Discovery"}],
    "priorities": [{"value": "high", "name": "High"}],
    "departments": [{"value": "cs", "name": "Customer Success"}, {"value": "none", "name": "No department"}]
  },
  "currency": "USD"
}
```

- **Rows.** `parent` is the "Part of" link: the organisation or account the item hangs off, always one the viewer may
  open (otherwise the row does not exist). `companies` lists the parent organisations the viewer may open (for an
  account-level item, its account's openable organisations, lowest id first; possibly none). `owner` names the
  parent's owner only when that person is in the viewer's own organisation; otherwise it reads `{"id": null, "name":
  "Not in your book"}` — stricter than the Accounts portfolio, on purpose. `date.days` is days from today (negative
  once passed). `open` follows the kind's open stages; `overdue` is open with a past date (due today is
  not overdue). `signal` is at most one of `overdue`, then `high_priority` on an open item.
- **Money.** `mrr` is in the workspace's currency (top-level `currency`), as the Pipelines page and the Deals & risks
  tabs have always shown it; no FX. Always a float.
- **Totals.** `count` is the rows this query pages through (after `stage` and `group_value`). `groups` cover the chosen
  stages before `group_value`. `summary` covers **every stage** of the filtered set — every filter but `stage` applies,
  so the won/mitigated tile and the stage strip survive the default open-only view. Each tile is
  its filter's rule, so clicking it with the default stages lists exactly its N: `open` (default `stage`), `within.30`/
  `within.90` (open; `date=30|90`), `overdue` (`date=overdue`), `done_this_quarter` (Closed Won for opportunities,
  Mitigated for risks, whose stage last changed this calendar quarter; `stage=<done_this_quarter.stage>&changed=quarter`),
  `stages` (every stage — the Board's column headers; the frontend's strip shows the open ones — empty ones included;
  `stage=<value>`).
- **Quarter.** The calendar quarter of `stage_changed_at` in UTC, whatever the server's time zone — the same "today"
  every portfolio uses.
- **Filters** are the viewer's own: organisations they may open that hold one of their readable items (directly or
  through an account), the accounts they may open that hold one, the owners of those items' parents named only when
  in the viewer's own organisation (plus an `{"value": "outside", "name": "Not in your book"}` option, no count, when
  such rows exist, and `unassigned` when a parent has no owner), the departments present, and the kind's fixed
  stages and priorities.
- 8 constant queries per request for an admin, whatever the book size (pinned by `PipelineQueryCountTests`).

### `GET /api/v1/pipelines/{opportunities,risks}/export.csv`

Auth: `IsAuthenticated`. Same parameters (`cursor`/`limit` ignored); every row the list would page through, in list
order. `text/csv`, `Content-Disposition: attachment; filename="<kind>-<date>.csv"`. 12 columns: Title, Revenact ID,
Organizations (the openable ones, `; `-joined), Account (blank for an organisation-level item), Owner, Stage, Priority,
Department, MRR, Expected Close (risks: Due By), Stage Changed At, Created Date, then a 13th, `Currency` — every
field. Text cells beginning with `= + - @`, tab or CR are prefixed with `'`. An error response renders as a two-row
CSV. Audited as `pipelines.exported` with `kind`, `count` and `params` (the query-parameter names, never their
values).

### `POST /api/v1/pipelines/{opportunities,risks}/bulk/`

Auth: `IsAuthenticated`. Body `{"ids": [1, 2], "action": "set_stage" | "set_priority" | "set_department" | "set_date",
"value": …}`: `set_stage` takes one of the route kind's stages; `set_priority` `high|medium|low`; `set_department` a
`User.Function` value or `""` (everyone's); `set_date` `YYYY-MM-DD`, or `null` to clear — the `value` key must be present
(omitting it is a 400). 1–500 ids, duplicates applied once.

Each id is locked and re-read (`select_for_update`) through the editor's own twice-filter, then saved through the kind's
single-edit serializer (partial) in its own transaction — the single PATCH's rules, so a stage change moves
`stage_changed_at` as a Board drag does. `200`:

```json
{"updated": [1], "failed": [{"id": 2, "reason": "Not found."}]}
```

An id the caller cannot read (another department, an account they cannot open, another tenant, the other kind) reads
`"Not found."`, like one that does not exist. A database error on one id puts it in `failed` with
`"Could not be updated."` and the batch continues. Audited once as `pipelines.bulk_updated` (`kind`, `action`, `field`,
`ids`, `failed_ids`; never the value), written in a `finally`; outcome `failure` when nothing was updated or the batch
did not finish. The items are not also audited one by one.

## `account_story` — the account page (`/accounts/:id`)

The account page's own endpoints, in `services/account_story/`. No model.

### `GET/PATCH /api/v1/accounts/<id>/`, `GET/POST /api/v1/accounts/<id>/{contacts,opportunities,risks,files,calls,surveys,tasks,notes}/`, `GET /api/v1/accounts/<id>/canvases/`

The account page's tabs and create flows, keyed by the account alone. Each is the nested
`/customers/<cid>/accounts/<id>/…` endpoint of the same name (same view class, same request and response
shapes, same record rules, same audit records), documented in its own section; only the path differs. They exist
because an account can be open to a viewer while none of its organisations is, so the page may have no
organisation id to put in the nested path.

Auth: `IsAuthenticated` — `401` unauthenticated. The account must be in `visible_accounts(user)`, otherwise `404`
(another tenant's account, one the viewer cannot open and an id that does not exist read the same). Then each list
applies its record's own rule: contacts and files by the account; opportunities and risks by department
(`pipeline_visible_q`); tasks by creator, assignee and their chains; notes by author and chain; canvases are the
account's own maps (`GET` only — a create is always on this account for the other tabs, but a canvas is always
made through `POST /canvases/`, see `Canvas` below). A create on the other tabs is always on this account
(`account_id` set, `customer_id` null); the parent never comes from the body. A CES survey is a
`400`, as on the nested route. `PATCH /accounts/<id>/` is the nested `AccountDetailView` PATCH (the owner-change
rule and handover included). The nested routes are unchanged. Activities, emails, tickets and calendar events
have no flat route: the page reads them through `GET /accounts/<id>/story/`.

### `GET /api/v1/accounts/<id>/story/`

The account page's Story tab (spec: react-ts-app `docs/superpowers/specs/2026-09-29-accounts-redesign-design.md`
§2.5): every record filed on this account, newest first under one cursor across all sources, with counts and the
Needs attention block. The organisation story's engine (`GET /organizations/<id>/story/`, `services/organizations/story/`)
over one account (`services/account_story/scope.py`); items, counts, params, order, horizon, cursor rules and the
record rules are exactly that endpoint's, except as listed here.

Auth: `IsAuthenticated` — `401` unauthenticated. GET only. The account must be in `visible_accounts(user)`,
otherwise `404`, whether or not it exists (another tenant's, one the viewer cannot open, an unknown id). Unknown
parameter values are ignored, never a 400.

Params: `group`, `source`, `q`, `thread`, `cursor`, `limit`, as on the organisation story. `account` is ignored
(one account has no account chips); any value reads the whole account.

```json
{
  "items": [{
    "id": 41, "kind": "call", "source": "zoom",
    "occurred_at": "2026-09-29T14:05:00+00:00", "all_day": false,
    "account": {"id": 9, "name": "EMEA"},
    "title": "Quarterly review", "summary": "They want SSO before the renewal.",
    "actor": {"id": null, "name": "Carl CSM"},
    "link": {"thread_id": null, "url": "https://zoom.us/rec/1"}
  }],
  "next_cursor": null,
  "counts": {
    "by_group": {"all": 7, "conversations": 3, "tickets": 2, "tasks": 1, "feedback": 1, "health": 0},
    "by_kind": {"activity": 0, "calendar_event": 1, "call": 1, "email": 1, "health": 0, "note": 1,
                "survey": 1, "task": 0, "ticket": 2},
    "by_account": {"all": 7, "none": 0, "9": 7}
  },
  "attention": {
    "renewal": {"date": "2026-10-12", "days": 12, "overdue": false},
    "tickets": {"count": 2, "oldest_days": 9},
    "overdue_tasks": null,
    "questions": null,
    "anomaly": null
  }
}
```

- **Scope.** Only records with `account_id` = this account: never its organisations' own records nor another
  account's. A shared account's records are the same on each of its organisations' stories and here. Every item's
  `account` is this account. Health items are this account's own month-end `HealthSnapshot` changes.
- **Privacy (twice filtered).** After the account, each record is read under its own rule: mail by its mailbox
  owner and their chain (`visible_emails`), notes by author and chain (`visible_notes`), tasks by creator, assignee
  and the chains above them (`visible_tasks`), tickets by department (`visible_tickets`); activities, calls,
  meetings, surveys and health readings by the account's rule alone. Items, counts, attention and search all read
  the same filtered rows.
- **Counts.** As on the organisation story; `by_account` is always `all`, `none` (`0`) and this account's id.
- **Cursor.** Keyed by the account (`account:<id>`) and the filters: a cursor from an organisation's story, from
  another account, or cut under other filters reads the first page.
- **Attention** follows no filter. `renewal`: the account's `renewal_date` overdue or within 30 days (accounts have
  no churn). `tickets`: open High/Critical on this account the viewer may read, count and oldest age in days.
  `overdue_tasks`: not completed, due before today, readable. `questions` and `anomaly` are always `null`: company
  knowledge is per organisation. Each entry is `null` when nothing needs attention.
- 24 constant queries per request, whatever the account's size (pinned by `AccountStoryQueryCountTests`).

## Files — the Files tab on organisations and accounts

### `GET/POST /api/v1/customers/<id>/files/`, `.../accounts/<id>/files/`

Auth: `IsAuthenticated`; anyone who may open the company may list and
add. On an organisation, `GET` rolls up its own files and those on its
accounts the caller may open (`customer_rollup_q`, the rule the contact,
opportunity, risk, survey and canvas roll-ups use: an account a colleague
owns keeps its files out even when the caller can open the organisation).
Each row carries `account_id` and `account_name`, both `null` for an
organisation-level file. A `POST` on the organisation path always creates
an organisation-level file; an `account_id` in the body is ignored. Upload
on the account path to attach a file to an account. `POST` is multipart:
`file`, optional `description`. What is
accepted (SOC2:API-10, `services/customers/files.py`): a closed list of
document, image, transcript and audio types by extension *and* declared
content type (never HTML, SVG, scripts or archives), magic bytes checked
for the binary formats, `ATTACHMENT_MAX_BYTES` (25 MB) cap, the name
sanitised. The bytes live under `MEDIA_ROOT` (a private volume on the
VM, in the nightly backup) under a random name; the storage path is
never exposed.

```json
[{"id": 7, "account_id": null, "account_name": null, "name": "Signed MSA.pdf",
  "content_type": "application/pdf", "size": 183220, "description": "Countersigned 12 Sep",
  "source": "upload", "uploaded_by": {"id": 3, "name": "Carl"},
  "download_url": "/api/v1/files/7/download/", "created_at": "2026-09-16T09:00:00Z"},
 {"id": 9, "account_id": 4, "account_name": "EMEA", "name": "qbr.vtt",
  "content_type": "text/vtt", "size": 5120, "description": "", "source": "transcript",
  "uploaded_by": {"id": 3, "name": "Carl"}, "download_url": "/api/v1/files/9/download/",
  "created_at": "2026-09-15T14:00:00Z"}]
```

**Filed mail's attachments (two-way Gmail delivery 2).** The list also
carries the non-inline attachments of mail filed on the organisation (and on
its accounts the caller may open), or on the account, each only when the
caller may also read that email (the mailbox chain): `source: "email"`, `id`
the mail attachment's id, `content_type` the declared type, `created_at` the
email's `sent_at`, `uploaded_by` null, `description` "", `download_url`
`/api/v1/mail/attachments/<id>/download/`, and `email: {"id", "subject",
"from"}`. Every row has `email` (null on uploads). Merged newest first. They
cannot be opened or deleted through `files/<id>/`, and they leave the list
when the person's copy of the message goes (deleted in Gmail, or pruned 30
days after a disconnect); the filed email stays. One more query, fixed. The
Files tab's own `download_url` is unchanged; both downloads share their
security headers (`services/customers/files.py:file_headers`).

### `GET /api/v1/files/<id>/`, `DELETE`, `GET /api/v1/files/<id>/download/`

Reached by id from any company's tab, so mounted at their own prefix;
each checks the caller may open the company the file hangs off (404
otherwise). `DELETE` is for the uploader or a `manage_org_settings`
holder (403 otherwise) and removes the bytes too. The download is always
`Content-Disposition: attachment` with `X-Content-Type-Options: nosniff`,
a sandboxed CSP and `Cache-Control: private, no-store`, so user content
is never rendered as part of the site. Audit events `file.upload`,
`file.delete`. The row has the same shape as the list's, `account_id`/
`account_name` included.

### `GET /api/v1/interactions/stats/`

Auth: `IsAuthenticated`. Every rollup the AI Trending Topics
dashboard's Controls tab draws, in one response — counted across
`Email`, `Call` and `Ticket` together.

Its own top-level prefix rather than a nest under `/customers/` or
`/tickets/`: an interaction spans three models and every
Customer/Account at once, so it belongs under neither. Stats-only, with
no matching list — each record type already has its own scoped list
endpoint for the Activity Feed.

One endpoint rather than seven for the same reason `/tickets/stats/` is
one: the seven charts are seven projections of the same filtered set,
and splitting them would apply the same filters seven times and let the
charts disagree with each other mid-render. Internally it is **one
grouped query per model**, not one per chart.

**Unfiltered by default**, same deliberate choice and same trap as
`/tickets/stats/`: a rolling "last 30 days" default renders every chart
empty once real time moves past the seeded demo dates, which looks like
a broken integration rather than an empty window.

Query params — every one ignores a value it doesn't understand rather
than returning `400`, the house convention for dashboard filters:

| Param | Meaning |
|---|---|
| `type` | `email`/`call`/`ticket`. **Repeatable**; drops whole record types. |
| `sentiment` | `positive`/`neutral`/`negative`. |
| `area`, `category`, `subcategory` | Taxonomy values (not labels). |
| `customer` | Customer id. Includes that customer's accounts' interactions. |
| `account` | Account id. |
| `revenue_bracket` | `under_25k`/`25k_50k`/`50k_100k`/`over_100k`, read off the parent's ARR (`Customer.arr_billed_at_account` or `Account.arr`). |
| `from`, `to` | `YYYY-MM-DD`, inclusive, against each model's own "when it happened" field. |
| `drill` | Opens one chart segment into the companies behind it — see **Dashboard drill (`?drill=`)** above. |

**Drill.** `?drill=` narrows the same filtered querysets the rollups
above use: `all`; `type:<email\|call\|ticket>`; `sentiment:<value>`;
`area:<value>`; `category:<value>`; `subcategory:<value>`; `value_label`
`interactions`. Response shape and the two drill rules (same filtered
set as the totals, intersected with the viewer's own book; a bad value
falls back to the normal response, never `400`) are in **Dashboard drill
(`?drill=`)** above. `value` is the number of interactions in that
segment belonging to the company; a company the totals above wouldn't
have counted — one the viewer can't see, or personal mail belonging to
someone else's mailbox chain — never appears, same
`visible_customers`/`visible_emails` rules the rest of this endpoint
already applies.

**Response `200`** (no `drill`, or an unrecognised one)

```json
{
  "total": 2090,
  "classified": 1832,
  "by_type":     [{"key": "email", "name": "Email", "value": 876}],
  "sentiment":   [{"key": "positive", "name": "Positive", "value": 1200}],
  "areas":       [{"key": "product_growth", "name": "Product & Growth", "value": 57}],
  "categories":  [{"key": "onboarding", "name": "Onboarding", "value": 20}],
  "subcategories": [{"key": "setup_assistance", "name": "Setup Assistance", "value": 9}],
  "sentiment_timeline": [
    {"date": "Jun 15, 2025", "positive": 5, "neutral": 2, "negative": 1}
  ],
  "recent": [
    {
      "id": "ticket:41",
      "source": "Ticket",
      "account": "Hyatt Regency Brand Portfolio",
      "title": "Export to CSV not including all columns",
      "sentiment": "Neutral",
      "area": "Product & Growth",
      "category": "Reporting & Analytics",
      "subcategory": "Export Problem",
      "occurred_on": "2026-03-03"
    }
  ],
  "filters": { "customers": [], "accounts": [], "types": [], "sentiments": [],
               "areas": [], "categories": [], "subcategories": [],
               "revenue_brackets": [] }
}
```

Notes on the shape:

* `{key, name, value}` everywhere — `name` is the label a chart renders,
  `key` the value its filter sends back. No colours: every real-data
  chart in this frontend maps a name to a CSS variable itself.
* `by_type`, `sentiment` and `areas` keep **every** bucket, at zero if
  empty, in the vocabulary's own order — a donut whose segment vanishes
  is harder to read than one with an empty segment, and a legend that
  reorders itself between refreshes is harder still. `categories` and
  `subcategories` are ranked biggest-first with empties dropped,
  because they are horizontal bars where the ranking *is* the reading.
* **`total` counts everything; the three taxonomy breakdowns count only
  classified rows.** An unclassified interaction is left out of them
  rather than bucketed as "Unknown" — `classified` is there so the
  screen can say how much of the book it is describing.
* `sentiment_timeline` is bucketed by **week**, on each model's own
  "when it happened" field (`sent_at`/`occurred_at`/`opened_at`), never
  `created_at` — that is `auto_now_add`, so every seeded row shares one
  timestamp and a trend over it is a single spike. Weeks with nothing
  in them are left out rather than zero-filled.
* `recent` is capped at 50 rows, newest first across all three models.
  It is a "recent examples" table, not a record browser. An
  unclassified row still appears, with its taxonomy columns blank —
  unlike the charts, the table is a list of what happened.
* `filters` ships alongside the numbers so the filter bar needs no
  second round trip and its options are scoped exactly as the numbers
  are. Each `subcategories` entry carries its parent `category`, so the
  bar can narrow that dropdown to the category already chosen.

### Models — `CalendarEvent`

Mirrors: `src/components/shared/ActivityFeed.tsx`'s "Calendar Events"
filter, `src/components/organizations/activity/CalendarEventsTab.tsx`
(the card: a type icon/badge, title, description, start–end time, an
attendee count, grouped by date).

Same "belongs to exactly one of `Customer` or `Account`" shape as
`Activity`/`Email`/`Task`/`Note`/`Ticket` (read-only for this round).
Unlike `Ticket`'s card, nothing here was found unwired in the mock —
`type` already colored the icon/badge for real, and every other field
maps to a real value.

Fields: `title`, `description`, `type` (`TextChoices` —
`meeting`/`call`/`review`/`demo`), `event_date`, `start_time`,
`end_time`, `attendee_count`. The mock's own `attendees` field carries
a full array of names, but the card only ever renders
`attendees.length` ("N attendees"), never the names — so this stores
`attendee_count` directly rather than a list no UI surface displays.
No `group` field — the card's date-group header is derived from
`event_date` at render time.

See `seed_demo_calendar_events` management command for demo data (run
after `seed_demo_accounts`).

### `GET /api/v1/customers/<customer_id>/calendar-events/`

Auth: `IsAuthenticated`. Every organization-level `CalendarEvent` for
one `Customer`, scoped to the caller's own organisation — same
404-not-empty-list convention as the Activity list endpoint. Powers
ActivityFeed's "Calendar Events" filter on the Organization Details
page.

**Response `200`** — a plain array, each entry: `id`, `title`,
`description`, `type`, `event_date`, `start_time`, `end_time`,
`attendee_count`.

### `GET /api/v1/customers/<customer_id>/accounts/<account_id>/calendar-events/`

Auth: `IsAuthenticated`. Every account-level `CalendarEvent` for one
`Account`, scoped to both its `customer_id` and the caller's own
organisation — same reasoning as the Activity account-level endpoint.
Powers ActivityFeed's "Calendar Events" filter on the standalone
Account page.

**Response `200`** — same shape as the Customer-scoped list above.

### Models — `Contact`

Mirrors: `src/components/organizations/contactsData.ts`'s mock
`Contact` shape (name, role, email, phone, status, sentiment, last
contacted). Unlike `Activity`/`Email`/`Task`/`Note`/`Ticket`/
`CalendarEvent` above — which each back one filter *within*
ActivityFeed — Contact backs its own sibling tab: the Contacts tab on
the Organization Details page, the Contacts tab on the standalone
Account page, and the global `/contacts/list` page.

Same "belongs to exactly one of `Customer` or `Account`" shape as
every model above (two nullable FKs + a `CheckConstraint`). `role` is
a closed set matching the mock's own 7 MEDDIC-style stakeholder roles
plus an `OTHER` catch-all; `status` (`active`/`inactive`) and
`sentiment` (`positive`/`neutral`/`negative`) are the card's pill/dot.
`last_contacted_at` is a real datetime, not the mock's frozen "2 hours
ago" string — the frontend formats it relative-to-now itself
(date-fns), so it stays accurate as time passes. `avatar` isn't
stored, same as every other entity's avatar in this codebase — derived
from `name` on the frontend.

`Contact.company` (a Python property, not a DB column) resolves to the
ultimate parent `Customer`: itself for an org-level contact, or its
account's own customer for an account-level one. `ContactSerializer`
exposes this as `company_id`/`company_name` (plus `account_name`,
`None` for an org-level contact) — needed by the standalone
`/contacts/list` page, which spans every Customer/Account at once and
can't assume which FK is set the way the two nested views below can.

See `seed_demo_contacts` management command for demo data (run after
`seed_demo_accounts`).

### `GET/POST /api/v1/customers/<customer_id>/contacts/`

Auth: `IsAuthenticated`. GET: every `Contact` under this `Customer`,
rolled up from both levels a Contact can exist at — organisation-level
(directly on this Customer) *and* account-level (on any of its
Accounts the caller may open, `visible_accounts`: an account a
colleague owns keeps its records out even when the caller can open
the organisation) — scoped to the caller's own organisation, same
404-not-empty-list convention as the Activity list endpoint. The
Opportunity, Risk, Survey and Canvas roll-ups below apply the same
account rule (`customer_rollup_q`). Which
level a row is at is `account_name`: `null` for organisation-level,
that Account's name otherwise. Powers the Organization Details page's
own Contacts tab, which renders both together.

POST always adds an organisation-level Contact here; `customer` is
taken from the URL, never client-supplied, same as
`AccountListCreateView`'s own `customer`. An account-level Contact is
added via the account-scoped endpoint below instead — including from
the Organization Details page's own Add Contact form, once the caller
picks one of this customer's accounts in its own optional Account
field — and, via a customer_id the frontend picks from a dropdown
rather than a URL param, the standalone `/contacts/list` page's own
"Add Contact".

**Response `200`** (GET) — a plain array, each entry: `id`, `name`, `role`,
`role_display`, `email`, `phone`, `language`, `status`, `sentiment`,
`sentiment_source`, `sentiment_computed_at`, `last_contacted_at`, `calls`
(how many of this person's calls the caller may open — every visible one,
read or not; see "Contacts list/detail" below), `companies` (every
ultimate parent Customer), `account_id`/`account_name` (both `null` for
an organisation-level row; the organisation page's account chips filter
on `account_id`). This queryset carries the same `readable_calls_count`
annotation as the standalone list below — no pagination here, so a
per-row query would otherwise run once per contact on the whole page.
**Response `201`** (POST) — one such entry, `calls` always `0` (a call
can't reference a contact that doesn't exist yet, so the serializer's
un-annotated fallback is used, same as any instance outside a
`get_queryset` this app doesn't control).

### `GET/POST /api/v1/customers/<customer_id>/accounts/<account_id>/contacts/`

Auth: `IsAuthenticated`. GET: every account-level `Contact` for one
`Account`, scoped to both its `customer_id` and the caller's own
organisation — same reasoning as the Activity account-level endpoint.
POST: adds a new account-level Contact to it; `account` taken from the
URL. Powers the standalone Account page's own Contacts tab.

**Response `200`**/**`201`** — same shape as the Customer-scoped
endpoint above, `account_name` set to that account's own name.

### `GET /api/v1/contacts/`

Auth: `IsAuthenticated`. Every `Contact` across every `Customer`/
`Account` the caller's own organisation owns — org-level and
account-level alike. The one Contact view not nested under
`/customers/<id>/...` (mounted directly in the project's root
`config/urls.py` instead), since it spans every Customer/Account at
once. Powers the standalone Contacts page (`/contacts/list`).

Paginated with the shared `DEFAULT_PAGINATION_CLASS`/`PAGE_SIZE`
(unlike every other Contact/Activity/Email/... list endpoint above,
which turns pagination off for what's normally a single entity's
already-small nested list) — same reasoning as `GET /api/v1/customers/`.

Filters (an unusable value is ignored, never a `400`):
- `?search=` — matches `name`/`email`/`role` (substring, case-
  insensitive), same convention as the Customer list's own search.
- `?customer=<customer_id>` — one organisation: a contact directly on
  it or on any of its accounts. `?company=` is the older name and still
  works.
- `?account=<account_id>` — one account's contacts.
- `?sentiment=positive|neutral|negative`.
- `?role=` — one `Contact.Role` value.

Every row adds `organisation` and `account`, each `{id, name}` or
`null`: the organisation is the first linked one the caller may open,
and `companies` lists only those. `calls` is how many of this person's
calls the caller may open — every visible one, whether read or not
(calls have no record rule of their own, only the company one); the
queryset is annotated (`readable_calls_count`, via `scoping.
visible_children_q(user, prefix="calls__")`) so this costs no extra
query per row. `sentiment_evidence` (the model's own field, the whole
computation behind a computed sentiment, readable or not) is never
served — only `/history/`'s `sentiment_readable` is (see "Contact
sentiment is computed").

`summary` covers the whole filtered set, not the page: `total`, the
count per sentiment, and `decision_makers` (roles `executive_sponsor`,
`decision_maker` and `economic_buyer`, the set the organisation page's
People summary uses). It also keeps the old stat cards' figures, with
`/contacts/stats/`'s own definitions but over the filtered set: `active`
(status `active`) and `growth_30d_pct` (today's filtered total against
the filtered contacts created 30 or more days ago, to one decimal; `null`
with no baseline). An organisation or account filter the caller cannot
open gives an all-zero summary. Five queries whatever the page size.

**Response `200`**
```json
{
  "count": 16,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 2,
      "name": "James Wilson",
      "role": "champion",
      "role_display": "Champion",
      "email": "j.wilson@apple.com",
      "phone": "+1 (408) 555-0456",
      "language": "",
      "status": "active",
      "sentiment": "negative",
      "sentiment_source": "computed",
      "sentiment_computed_at": "2026-09-12T10:05:00Z",
      "last_contacted_at": "2026-09-12T10:00:00Z",
      "calls": 2,
      "companies": [{ "id": 6, "name": "Apple Inc" }],
      "organisation": { "id": 6, "name": "Apple Inc" },
      "account_id": 31,
      "account_name": "Apple EMEA",
      "account": { "id": 31, "name": "Apple EMEA" }
    }
  ],
  "summary": {
    "total": 16,
    "positive": 7,
    "neutral": 6,
    "negative": 3,
    "decision_makers": 5,
    "active": 14,
    "growth_30d_pct": 6.7
  }
}
```

### `GET /api/v1/contacts/stats/`

Auth: `IsAuthenticated`. Aggregate rollups for the standalone Contacts
page's MetricsPanel (Total/Active/Sentiment/Growth cards), across every
`Contact` the caller's organisation owns — same "spans everything, not
just the current page" reasoning as `GET /api/v1/customers/stats/`.

`growth_30d_pct` compares today's total against the total as of 30 days
ago (contacts whose `created_at` already predates the cutoff) — the
only "growth" there's real data for; there's no historical daily-
snapshot table to compare a true count-30-days-ago against anything
richer. `null` (not `0`) when there were no contacts yet 30 days ago,
since a percentage change off a zero base is undefined, not zero.

### `GET/PATCH/DELETE /api/v1/contacts/<id>/`

Auth: `IsAuthenticated`. A single Contact, scoped to the caller's own
organisation via either its `customer` or its `account`'s own
`customer` — 404 (not 403) outside that scope, regardless of whether
it's an organization- or account-level Contact.

Deliberately flat, not nested under `/customers/<id>/...` like the two
list-create endpoints above — Edit/Delete only ever needs the
Contact's own id, and the standalone `/contacts/list` page's own rows
don't carry an `account_id` to nest under even if it wanted to (only
`company_id`/`account_name`, for display). Powers the "Edit"/"Delete"
row actions on all three Contacts UIs.

PATCH can't move a Contact between parents — `customer`/`account`
aren't in `ContactSerializer`'s own field list at all, so naming
either in the request body is silently ignored, not an error, same
effect as `AccountSerializer`'s `read_only_fields = ["customer"]`.

Every contact payload carries `campaigns_unsubscribed_at` (set by a
campaign email's unsubscribe link). PATCH
`{"campaigns_unsubscribed": false}` re-subscribes the contact, audited
`contact.campaigns_resubscribed`; `true` is
`400 {"campaigns_unsubscribed": ["Only the person can unsubscribe, with
the link in a campaign email."]}`.

**Response `200`** (GET/PATCH) — same shape as the list endpoints
above. **Response `204`** (DELETE) — empty body.

**Response `200`**
```json
{
  "total": 16,
  "active": 14,
  "sentiment": { "positive": 9, "neutral": 3, "negative": 4 },
  "sentiment_pct": { "positive": 56, "neutral": 19, "negative": 25 },
  "growth_30d_pct": 433.3
}
```

### Models — `Opportunity`

Mirrors: `src/pages/pipelines/PipelinesPage.tsx`'s mock `PipelineCard`/
`Column` shape — a sales opportunity moving through the standalone
Pipelines board's "Opportunities" tab.

Same "belongs to exactly one of `Customer` or `Account`" shape as
`Contact` above — there can be an organisation-level opportunity and,
separately, one tied to a specific Account (the mock's own card list
already mixed both, e.g. "Apple Inc" alongside "Apple EMEA", before
this model existed). `stage` is the closed set of 7 Kanban columns the
board already has (`discovery`/`qualification`/`solution_validation`/
`proposal_price_review`/`negotiation`/`closed_won`/`closed_lost`) — a
fixed enum, not a separate configurable-pipeline model, since no
per-tenant customisation was asked for. `priority` (`high`/`medium`/`low`)
is a real field, same as Task/Ticket's own. `mrr` is a
`DecimalField(max_digits=12, decimal_places=2)`, same shape as
Account's own ARR-family fields.

**Since 2026-09-30 (Pipelines redesign):** `stage` also has `closed_lost` (Closed Lost), after `closed_won`; *open*
means neither. `expected_close` is an optional date (null reads "No date"). `stage_changed_at` (read-only) is when
the stage last changed, creation included (`StageClockMixin`; rows from before it start at `created_at`). Every
opportunity endpoint below reads and writes `expected_close` and returns `stage_changed_at`. `companies` names only
the organisations the caller may open, on every endpoint.

The mock's own `orgColor`/`orgInitials` aren't stored — decorative,
derived from the company name on the frontend (`EntityAvatar`, same as
every other entity). The mock's own per-column `count` isn't stored
either — it never actually matched `cards.length` in the mock (e.g.
"Discovery" claimed 12 while only listing 3 cards), a stale hardcoded
number; the frontend derives a real count from how many Opportunities
it actually fetched per stage.

See `seed_demo_opportunities` management command for demo data (run
after `seed_demo_accounts`).

### `GET/POST /api/v1/customers/<customer_id>/opportunities/`

Auth: `IsAuthenticated`. GET: every Opportunity under this Customer,
rolled up from both levels (organisation-level and account-level),
same reasoning as the Contact customer-scoped endpoint. POST always
adds an organisation-level Opportunity; `customer` taken from the URL.

**Response `200`** (GET) — a plain array, each entry: `id`, `title`,
`mrr`, `stage`, `stage_display`, `priority`, `priority_display`,
`department`, `department_display`, `companies`, `account_id`/
`account_name` (both `null` for an organisation-level row; the
organisation page's account chips filter on `account_id`).
**Response `201`** (POST) — one such entry.

### `GET/POST /api/v1/customers/<customer_id>/accounts/<account_id>/opportunities/`

Auth: `IsAuthenticated`. GET: every account-level Opportunity for one
Account. POST: adds a new one to it; `account` taken from the URL.

**Response `200`**/**`201`** — same shape as the Customer-scoped
endpoint above, `account_name` set to that account's own name.

### `GET/POST /api/v1/opportunities/`

Auth: `IsAuthenticated`. GET: every Opportunity across every Customer/
Account the caller's own organisation owns. The one Opportunity view
not nested under `/customers/<id>/...`, mounted at its own top-level
prefix, same reasoning as `ContactListView`. Powers the standalone
Pipelines board's own "Opportunities" tab.

Unlike `GET /api/v1/contacts/`, **pagination is off** here — a Kanban
board needs every card in every column to render/drag-and-drop
correctly, not one page of them.

POST takes a `customer_id` or an `account_id` in the request body
(neither is a real serializer field) and creates the Opportunity under
that parent — exactly one of the two must be given (`400` otherwise).

**Response `200`**
```json
[
  {
    "id": 4,
    "title": "Renewal Expansion Opportunity",
    "mrr": "30000.00",
    "stage": "qualification",
    "stage_display": "Qualification",
    "priority": "high",
    "priority_display": "High",
    "department": "",
    "department_display": "",
    "companies": [{ "id": 6, "name": "Apple Inc" }],
    "account_id": 12,
    "account_name": "Apple EMEA",
    "stage_changed_at": "2026-09-30T10:00:00+00:00",
    "expected_close": "2026-11-15"
  }
]
```

### `GET/PATCH/DELETE /api/v1/opportunities/<id>/`

Auth: `IsAuthenticated`. A single Opportunity, scoped to the caller's
own organisation, regardless of whether it's organisation-level or
account-level. Flat, not nested — same reasoning as
`ContactDetailView`. Powers both the board's drag-and-drop (PATCH
`stage`) and its Edit/Delete card actions. PATCH can't move an
Opportunity between parents, same as Contact.

**Response `200`** (GET/PATCH) — same shape as the list endpoints
above. **Response `204`** (DELETE) — empty body.

### Models — `Risk`

Mirrors: `src/pages/pipelines/PipelinesPage.tsx`'s mock `PipelineCard`/
`Column` shape used for the standalone Pipelines board's "Risks" tab —
field-for-field identical to `Opportunity` above, same reasoning.

Same "belongs to exactly one of `Customer` or `Account`" shape as
`Opportunity`. `stage` is the closed set of 4 Kanban columns the
board's Risks tab already has (`open`/`mitigated`/`realised`/
`abandoned`) — a fixed enum, same reasoning as Opportunity's own
`stage`. `priority`/`mrr` are the same shape as Opportunity's.

**Since 2026-09-30:** `due_by` is an optional date (null reads "No date"); *open* is stage `open`. `stage_changed_at`
as on Opportunity. Every risk endpoint below reads and writes `due_by` and returns `stage_changed_at`; `companies` names
only the organisations the caller may open.

Unlike Opportunity's mock, none of the Risk mock's own card data named
real seeded companies — its org names ("Digital Operations", "Culinary
Innovation Lab (HCIL)", ...) don't exist anywhere in this codebase's
seed data — so `seed_demo_risks`'s demo rows are new content against
real seeded Customers/Accounts rather than a carryover of the mock's
own cards.

See `seed_demo_risks` management command for demo data (run after
`seed_demo_accounts`).

### `GET/POST /api/v1/customers/<customer_id>/risks/`

Auth: `IsAuthenticated`. GET: every Risk under this Customer, rolled up
from both levels (organisation-level and account-level), same
reasoning as the Opportunity customer-scoped endpoint. POST always
adds an organisation-level Risk; `customer` taken from the URL.

**Response `200`** (GET) — a plain array, each entry: `id`, `title`,
`mrr`, `stage`, `stage_display`, `priority`, `priority_display`,
`department`, `department_display`, `companies`, `account_id`/
`account_name` (both `null` for an organisation-level row; the
organisation page's account chips filter on `account_id`).
**Response `201`** (POST) — one such entry.

### `GET/POST /api/v1/customers/<customer_id>/accounts/<account_id>/risks/`

Auth: `IsAuthenticated`. GET: every account-level Risk for one Account.
POST: adds a new one to it; `account` taken from the URL.

**Response `200`**/**`201`** — same shape as the Customer-scoped
endpoint above, `account_name` set to that account's own name.

### `GET/POST /api/v1/risks/`

Auth: `IsAuthenticated`. GET: every Risk across every Customer/Account
the caller's own organisation owns. The one Risk view not nested under
`/customers/<id>/...`, mounted at its own top-level prefix, same
reasoning as `OpportunityListView`. Powers the standalone Pipelines
board's own "Risks" tab.

Unlike `GET /api/v1/contacts/`, **pagination is off** here, same
reasoning as `OpportunityListView` — a Kanban board needs every card in
every column to render/drag-and-drop correctly, not one page of them.

POST takes a `customer_id` or an `account_id` in the request body
(neither is a real serializer field) and creates the Risk under that
parent — exactly one of the two must be given (`400` otherwise).

**Response `200`**
```json
[
  {
    "id": 4,
    "title": "Renewal Risk — Contract Expiry",
    "mrr": "8500.00",
    "stage": "open",
    "stage_display": "Open",
    "priority": "high",
    "priority_display": "High",
    "department": "",
    "department_display": "",
    "companies": [{ "id": 8, "name": "WeWork" }],
    "account_id": null,
    "account_name": null,
    "stage_changed_at": "2026-09-30T10:00:00+00:00",
    "due_by": null
  }
]
```

### `GET/PATCH/DELETE /api/v1/risks/<id>/`

Auth: `IsAuthenticated`. A single Risk, scoped to the caller's own
organisation, regardless of whether it's organisation-level or
account-level. Flat, not nested — same reasoning as
`OpportunityDetailView`. Powers both the board's drag-and-drop (PATCH
`stage`) and its Edit/Delete card actions. PATCH can't move a Risk
between parents, same as Opportunity.

**Response `200`** (GET/PATCH) — same shape as the list endpoints
above. **Response `204`** (DELETE) — empty body.

### Models — `Survey`

Mirrors: the Activity Feed's own "Surveys" filter (react-ts-app's
`ActivityFeed.tsx` — previously an unimplemented chip with no data
behind it) and the standalone Surveys page (`src/pages/surveys/
SurveysPage.tsx`). Same "belongs to exactly one of `Customer` or
`Account`" shape as `Opportunity`/`Risk` above.

One sent instance of asking a Customer or Account for an NPS/CSAT/CES
score — `survey_type` (`nps`/`csat`/`ces`), `status`
(`sent`/`responded`/`expired`, default `sent`), `score` (one
`IntegerField` for all three types — -100..100 for NPS, 0..100 for
CSAT/CES, the same ranges `Customer.nps_score`/`csat_score`/
`ces_percentage` already use; required and range-checked, in the
serializer, only once `status` becomes `responded`), `sent_at`
(required), `responded_at` (set automatically to today on responding
if not given explicitly).

**Responding syncs the score onto the parent** — marking a Survey
`responded` with a `score` writes that value onto the parent Customer's
or Account's own `nps_score`/`csat_score`/`ces_percentage` field (see
`SurveyDetailView.perform_update`). Those fields go from "a number with
no provenance" to "the latest completed survey's result."

**CES is Customer-only** — `Account` has no `ces_percentage` field (a
real, pre-existing asymmetry with Customer), so a CES survey has
nowhere to sync a response on an Account. Creating one against an
Account (nested `AccountSurveyListView`, or the flat endpoint with
`account_id`) is a `400`.

**Rows written by a send.** `send_id` (read-only, `null` for a row
logged by hand) names the survey send (`surveys` below) whose answers a
row aggregates. A send keeps one row per record it scores, upserted on
each answer: `status` `responded`, `score` that send's figure for the
record so far, `sent_at` the send's date and `responded_at` the latest
answer's. Logging by hand is unchanged. A row with `send_id` set is
read-only: PATCH or PUT on `/api/v1/surveys/<id>/` returns `400
{"detail": "This score comes from a sent survey and updates itself."}`
and DELETE returns `409` with the same detail.

Deliberately not a multi-question survey engine — no response-level
granularity beyond one score per Survey, no question builder, no
actual email delivery (there's no outbound customer-facing email
infrastructure in this codebase to send a real survey link with yet;
"send" means "log that it was sent," same honest framing as this app's
own Webhooks delivery being real but bounded).

See `seed_demo_surveys` management command for demo data (run after
`seed_demo_accounts`) — backfills one RESPONDED Survey per existing
non-null `nps_score`/`csat_score`/`ces_percentage` on every seeded
Customer/Account (same score, spread across the last several months so
the trend chart has real shape), plus a small hand-picked set of still-
`sent`/`expired` rows so every status shows up somewhere real too.

### `GET/POST /api/v1/customers/<customer_id>/surveys/`

Auth: `IsAuthenticated`. GET: every Survey under this Customer, rolled
up from both levels (organisation-level and account-level), same
reasoning as the Opportunity customer-scoped endpoint. POST always adds
an organisation-level Survey; `customer` taken from the URL. Powers the
Activity Feed's own Surveys filter.

**Response `200`** (GET) — a plain array, each entry: `id`,
`survey_type`, `survey_type_display`, `status`, `status_display`,
`score`, `sent_at`, `responded_at`, `companies` (every ultimate parent
Customer, plural since an account-level Survey's own Account can belong
to more than one), `account_id`/`account_name` (both `null` for an
organisation-level row; the standalone Surveys page's row-click uses
`account_id` to open that Account's Details page), `created_at`.
**Response `201`** (POST) — one such entry.

### `GET/POST /api/v1/customers/<customer_id>/accounts/<account_id>/surveys/`

Auth: `IsAuthenticated`. GET: every account-level Survey for one
Account. POST: adds a new one to it; `account` taken from the URL.
`400` if `survey_type` is `ces` — see the model's own note above.

**Response `200`**/**`201`** — same shape as the Customer-scoped
endpoint above, `account_name` set to that account's own name.

### `GET/POST /api/v1/surveys/`

Auth: `IsAuthenticated`. GET: every Survey across every Customer/
Account the caller's own organisation owns. The one Survey view not
nested under `/customers/<id>/...`, mounted at its own top-level
prefix, same reasoning as `OpportunityListView`. Powers the standalone
Surveys page — its own response-rate/average-score rollup cards are
computed client-side from this same list, not a separate stats
endpoint.

**Pagination is off** here, same reasoning as `OpportunityListView` — a
rollup page needs every record to total correctly, not one page of them.

Query params:
- `?customer=<id>` — one organisation's surveys: its own and those on its
  accounts the caller may open (`customer_rollup_q`, the organisation
  page's roll-up rule). An id the caller cannot open (another tenant's,
  one they may not see, or not an id at all) returns `[]` with `200`,
  never a `404` or `400` that would confirm it exists. A blank value is
  no filter. Powers the Surveys page's organisation filter
  (`/surveys?customer=<id>`).

POST takes a `customer_id` or an `account_id` in the request body
(neither is a real serializer field) and creates the Survey under that
parent — exactly one of the two must be given (`400` otherwise). `400`
if `survey_type` is `ces` and `account_id` was given.

**Response `200`**
```json
[
  {
    "id": 4,
    "survey_type": "nps",
    "survey_type_display": "NPS",
    "status": "responded",
    "status_display": "Responded",
    "score": 80,
    "sent_at": "2026-09-01",
    "responded_at": "2026-09-04",
    "companies": [{ "id": 6, "name": "Apple Inc" }],
    "account_id": null,
    "account_name": null,
    "created_at": "2026-09-01T10:00:00Z"
  }
]
```

### `GET/PATCH/DELETE /api/v1/surveys/<id>/`

Auth: `IsAuthenticated`. A single Survey, scoped to the caller's own
organisation, regardless of whether it's organisation-level or
account-level. Flat, not nested — same reasoning as
`OpportunityDetailView`. PATCH is "Log Response" (`status`/`score`) as
well as any other edit — this is the one place a responded Survey's
score gets synced onto its parent, see the model's own note above.

**Response `200`** (GET/PATCH) — same shape as the list endpoints
above. **Response `204`** (DELETE) — empty body.

---

### Models — `Canvas`

A live stakeholder map on exactly one organisation (`customer`) or one account (`account`)
(`canvas_belongs_to_exactly_one_parent`). Stored: `name` (≤120 on write), `nodes` (`{id, position: {x, y},
data: {contact_id}}`, at most 60), `edges` (`{id, source, target, label}`, at most 150; label `Reports to`,
`Introduced by`, `Blocks`, `Influences` or `""`), `created_by`, `updated_by` (SET_NULL; null on maps made before
live maps), `version` (optimistic concurrency), `created_at`, `updated_at`. Nothing about a person is stored: their
facts are worked out for the reader on every read (`services/customers/canvas_payloads.py`). A map saved before
live maps holds React Flow's own keys (`type`, `width`, `sourceHandle`, …); reads leave them out and the next save
drops them. The frontend adds `type: "contact"`/`"relationship"` itself.

`made_by`: `{"agent": "ops", "approved_by": {"id", "name"} | null}` on the detail and on every list row when an agent action made the object (`agent_action`, SET_NULL), else `null`. `approved_by` is the action's decider, and `null` once that person no longer exists. Lists load it with the row: no extra query.

Who: anyone who may open the map's record reads and saves it (`visible_customers`/`visible_accounts` as `id IN`
subqueries; any other map is `404`). Deleting is the creator's and anyone above them in the org chart
(`subtree_ids`); a map with no creator is anyone's who may open its record; others get `403`.

Shared shapes:

```ts
type RelationshipLabel = 'Reports to' | 'Introduced by' | 'Blocks' | 'Influences' | '';
type PersonRef = { id: number; name: string };
type RecordRef = { kind: 'organization' | 'account'; id: number; name: string };
type CanvasNode = { id: string; position: { x: number; y: number }; data: { contact_id: number } };
type CanvasEdge = { id: string; source: string; target: string; label: RelationshipLabel };
type MapPerson = {
  name: string;
  role: string; // Contact.role slug, e.g. "decision_maker"
  role_display: string; // its label, e.g. "Decision Maker"
  sentiment: string | null; // "positive" | "neutral" | "negative"
  sentiment_label: string | null; // "Positive" | "Neutral" | "Negative"
  last_contacted_at: string | null;
  latest_survey: { type: 'nps' | 'csat' | 'ces'; score: number; answered_at: string } | null;
  campaigns_unsubscribed: boolean;
};
type CanvasRow = {
  id: number; name: string; record: RecordRef;
  people: number; // every node, hidden and removed ones included
  updated_at: string; updated_by: PersonRef | null;
};
type Canvas = CanvasRow & {
  version: number;
  nodes: CanvasNode[]; edges: CanvasEdge[];
  people_by_contact: Record<string, MapPerson>; // people the reader may open, by contact id
  hidden: string[]; // node ids whose contact the reader may not open
  removed: string[]; // node ids whose contact was deleted
  not_on_map: { id: number; name: string; role: string; role_display: string }[]; // ≤200
  open_plans: PlanRow[]; // the record's own open plans, as GET /plans/
  can_delete: boolean;
  created_by: PersonRef | null;
};
```

Live facts, each under the reader's own rules: `last_contacted_at` is the latest call the person was on
(`Call.participants`) or email from or to their address (record rule and the mailbox rule), up to now; meetings
are not linked to people and do not count. `latest_survey` is their latest answered survey invite on a record
the reader may open, from a send the reader may also read (owner, workspace-shared or shared with them —
`services.surveys.access.readable_sends`, the same check the send's own views run) (type, score and time;
never the comment). One read costs the same number of queries whatever the number of people.

### `GET /api/v1/canvases/?q=&cursor=`

Auth: `IsAuthenticated`. Maps on records the caller may open, newest edit first, 50 a page. `q` searches the
map's, the organisation's and the account's names. **Response `200`** `{results: CanvasRow[], next: string |
null}`; `next` is an opaque cursor (a malformed one reads as the first page).

### `POST /api/v1/canvases/`

Body `{name, customer?: id, account?: id, start?: 'people' | 'blank'}` (exactly one of `customer`/`account`;
`start` defaults to `people`). `people` places the record's contacts the caller may open, in rows by role
(decision makers and economic buyers, champions, influencers, everyone else), six to a row on a 240 × 160 grid, at
most 60, node ids `c<contact id>`, no edges. **Response `201`** `Canvas`. `400` `{"name": ["Give the map a
name."]}` / `{"name": ["Keep the name to 120 characters."]}` / `{"start": ["Choose people or blank."]}` /
`{"non_field_errors": ["Choose an organisation or an account."]}`; `404` for a record the caller may not open.
Audited `canvas.created`.

### `GET/PATCH/DELETE /api/v1/canvases/<id>/`

GET: **`200`** `Canvas`. PATCH: body `{name?, nodes?, edges?, version}`, under the map's `FOR NO KEY UPDATE`
row lock. `version` missing or not a whole number ≥1: `400 {"version": ["Send the version you loaded."]}`. Not the
stored one: `409 {"code": "CANVAS_CHANGED", "detail": "Someone else changed this map. Reload to see their
changes."}`, before any field is checked. People already on the map stay allowed though hidden or removed; anyone
else must be one of the record's people the caller may open. `nodes` without `edges` drops the lines of people
taken off. Field refusals are `400 {field: [message]}` (the messages are `services/customers/canvas.py`'s).
A good save bumps `version`, sets `updated_by` and answers **`200`** `Canvas`; audited `canvas.updated`. DELETE:
**`204`**; `403 {"detail": "Only the map's creator or their managers can delete it."}`; audited `canvas.deleted`.
`404` throughout for a map on a record the caller may not open.

### `GET /api/v1/customers/<customer_id>/canvases/`, `GET /api/v1/customers/<customer_id>/accounts/<account_id>/canvases/`, `GET /api/v1/accounts/<account_id>/canvases/`

The record's maps, newest edit first, at most 100: **`200`** `{results: CanvasRow[]}`. The organisation's list
also holds the maps on its accounts that the caller may open. `404` for a record the caller may not open. POST is
`405`: maps are made through `POST /canvases/`.

See `seed_demo_canvases` for demo data (run after `seed_demo_accounts`).

### Models — `Headline`

Mirrors: the "Headlines" sub-tab of `ActivityFeed` on both the
Organization Details page and the standalone Account page
(`src/components/organizations/activity/HeadlinesTab.tsx`). Same
"belongs to exactly one of `Customer` or `Account`" shape as
Note/Survey/Canvas above (`customer`/`account` nullable FKs +
`headline_belongs_to_exactly_one_parent` CheckConstraint).

Two card shapes, distinguished by `kind` rather than the mock's
`isSummary` boolean — the two genuinely differ in which fields apply:

* `summary` — the pinned TL;DR at the top of the tab. Carries
  `time_period_label` ("Last 3 months") and `data_sources`, which the
  card renders in its footer. Never carries a `status`; there is
  nothing open or closed about a rolling summary, enforced by a second
  CheckConstraint (`headline_summary_has_no_status`), not just in the
  serializer.
* `headline` — one themed storyline in the feed, with a `status`
  (`open`/`in_progress`/`closed`) and a `period_start`/`period_end`
  span shown on the card.

Fields: `kind`, `title`, `content`, `status`, `period_start`,
`period_end`, `time_period_label`, `data_sources`, `generated_at`.

`data_sources` is a list of closed-set keys (`notes`, `emails`,
`call_transcripts`, `tickets`, `activities`), not the mock's free-text
"Notes, Emails, Call Transcripts and Tickets" string. That string was
decorative — nothing computed it — whereas the generator knows which
records it actually read, so this records that honestly and
`data_sources_display` renders the prose list from it. Validated in
the serializer: a JSONField would otherwise accept any string at all
and the card would claim a source nobody read.

No `group` field, though the mock carried one (`'January'`): the
card's group pill is the read-only, derived `group` field, computed
from `period_end` — same as Note/Activity/Email/Task's own date-group
headers. Empty for a `summary` and for a `headline` with no
`period_end`. The mock's `orgId` is likewise gone; the parent is the
FK, and its absence is what made every account render the same two
hardcoded Apple cards.

`generated_at` is set only on cards written by the model, so
regeneration can replace its own previous output without touching
anything a CSM wrote or corrected by hand.

Read-only extras on every response: `kind_display`, `status_display`,
`data_sources_display`, `group`.

See the `seed_demo_headlines` management command for demo data (run
after `seed_demo_accounts`) — deliberately hand-written rather than
generated, so seeding works offline with no `ANTHROPIC_API_KEY` set,
and seeded rows carry `generated_at=None` so a later regenerate treats
them as hand-written.

### `GET/POST /api/v1/customers/<customer_id>/headlines/`

Auth: `IsAuthenticated`. GET is every organization-level `Headline`
for one `Customer`, scoped to the caller's own organisation — same
404-not-empty-list convention as the other nested lists. POST writes
one by hand; `customer` comes from the URL.

Writable, unlike the Note/Activity/Email lists: a headline is normally
generated, but a CSM writing or correcting one is a real case — and a
hand-written card is exactly what regeneration must not clobber.

**Response `200`** — a plain array (unpaginated), each entry: `id`,
`kind`, `kind_display`, `title`, `content`, `status`, `status_display`,
`period_start`, `period_end`, `time_period_label`, `data_sources`,
`data_sources_display`, `group`, `generated_at`, `created_at`.
**Response `201`** (POST) — the created entry, same shape.
**`400`** — an unknown `data_sources` key, a `summary` sent with a
`status`, or a period that ends before it starts.

### `GET/POST /api/v1/customers/<customer_id>/accounts/<account_id>/headlines/`

Auth: `IsAuthenticated`. Same as above but account-level, scoped to
both the URL's `customer_id` and the caller's own organisation.

**Responses** — same shapes as the Customer-scoped endpoint.

### `GET/PATCH/DELETE /api/v1/headlines/<id>/`

Auth: `IsAuthenticated`. One card, whether organization-level or
account-level. Flat, not nested — same reasoning as
`SurveyDetailView`/`CanvasDetailView`: the card's own edit/delete
controls have the Headline in hand and shouldn't need to know which of
the two parent shapes it came from.

**Response `200`** (GET/PATCH) — same shape as the list endpoints.
**Response `204`** (DELETE) — empty body.

### `POST /api/v1/customers/<customer_id>/headlines/generate/` and `.../accounts/<account_id>/headlines/generate/`

Auth: `IsAuthenticated`. Reads the parent's real `Note`/`Email`/
`Ticket`/`Activity` records from a recent window and writes its
Headline cards from them, through the same
`services.copilot.anthropic_client.get_completion` the Copilot uses —
one synchronous call, no task queue (same limit stated for Copilot
replies and Scenario runs). This is what makes the card footer's
"Data sources" line true rather than decorative: `data_sources` names
only the record types that were actually non-empty in the window.

Replaces only previously *generated* cards (`generated_at` not null),
never anything hand-written, and does the delete+insert in one
transaction so a failure can't leave the tab empty.

Optional body: `window_days` (default 90) and `time_period_label`
(default `"Last <n> days"`, used as the summary card's own label).

**Response `201`** — every card now on the parent, same shape as the
list endpoints. **`400`** — a non-numeric or sub-1 `window_days`.
**`422`** — the parent has no records at all in the window; no model
call is made. **`502`** — the call failed, or its answer couldn't be
read as JSON. **`503`** — the provider isn't configured (no
`ANTHROPIC_API_KEY`/Bedrock credentials). The 502/503 mapping matches
`SendMessageView`'s exactly, since it is the same one external call
underneath.

---

## `metrics` — The management brief on a schedule (Settings > Brief delivery)

### Model

- `BriefSchedule` — one per organisation: `destination` (a Slack incoming
  webhook), `cadence` (`weekly` | `monthly`), `weekday` (Monday is 0),
  `day` (of the month), `is_active`, `last_sent_at`, `created_by`.

### Conventions specific to this app

The Slack URL is a **credential** — anyone holding it can post to that
channel — so it goes in and never comes back out. Responses carry
`destination_hint`, the last few characters, enough to recognise which
hook is set. Only `https://hooks.slack.com/services/...` is accepted, and
it is checked against the same SSRF rules outbound webhooks use.

Configuring is gated on `manage_org_settings`, like webhooks: it is
configuration, not content. **Nothing is generated on a schedule.** The
pass posts the brief that exists; if nobody has written one, it says so
rather than spending a model call nobody asked for. A month too short for
the chosen day sends on its last day rather than skipping the month.

**There is no hour to choose.** `run_health_maintenance` runs once a
night, so a brief goes out on its day when that job runs. An hour the job
could never honour would be a promise the product cannot keep; a specific
time of day needs a more frequent job first.

### `GET/POST/PATCH/DELETE /api/v1/metrics/brief/schedule/`

```json
{"cadence": "weekly", "destination_hint": "…xxxx", "weekday": 1,
 "day": 1, "is_active": true, "last_sent_at": null}
```

POST takes `destination` plus any of the scheduling fields and returns
201. GET on an organisation with no schedule returns the same shape with
`cadence: null` rather than a 404. 400 for a destination that is not a
Slack hook, or a number out of range. Audited as `brief.schedule`.

### `POST /api/v1/metrics/brief/schedule/send/`

Posts the latest brief now, so a new schedule can be proved without
waiting a week → `{"sent": true, "detail": "Sent."}`. 404 with nothing
scheduled, 502 when Slack refuses it, and `{"sent": false}` with a reason
when no brief has been written yet. Audited as `brief.sent`.

---

## `brain` — Scopes, What changed, What's being done and What customers are saying (`/brain`)

Delivery 1 of the Brain rethink (spec: react-ts-app
`docs/superpowers/specs/2026-10-05-brain-what-changed-design.md` §1, §4).
Every member gets a Brain scoped to **Me**, **My team** or **Company**:
figures recomputed over the scope's own book, a per-scope history, a
"What changed" payload, and briefs and explanations kept per scope. The
existing `/api/v1/metrics/` routes are unchanged and keep reading the
Company rows only.

### Model

- `ScopeSnapshot` — one row per organisation, scope key and day: `kind`
  `month_end` or `baseline`, `reason` (`first_view` or `team_changed`,
  blank on a month-end). Fields: `organisation`, `scope_key` (`"me:<id>"`
  or `"team:<id>"`), `user` (whose scope it is), `taken_on`, `kind`,
  `reason`, `owner_ids`, `customer_ids` (the book then, archived and
  churned included), `values`, `slices`. Unique per organisation, scope
  key and day. Company keeps using `MetricSnapshot`; nothing already
  recorded changes.
- `Brief.scope_key` / `figures_digest`, `Explanation.scope_key` /
  `figures_digest` (`services/metrics/models.py`) — whose figures
  (`"company"`, or a Brain scope's stored key) and a SHA-256 digest of the
  figures the prompt carried, so a later read can tell whether the row has
  gone stale.
- `ModelCall.scope_key` (`services/copilot/models.py`) — the Brain scope a
  brief or explanation call was made for; blank for every other purpose.

There is no lock *model*. Two writes of the same scope's brief (or the
same scope and metric's explanation) are serialised by a Postgres
session-level advisory lock (`services/brain/locks.held`), taken outside
any transaction so the model call never also holds a database row lock. A
request that waited reuses a newer brief/explanation only under the
stored-prose rule below.

### Conventions

- Every route is `IsAuthenticated`. The reader's scope decides what comes
  back, not a capability — `resolve` refuses a scope the reader may not
  use before anything is computed.
- `?scope=me|team|company`. Missing or empty reads the reader's default
  scope (not a 400).
- **Me**: customers the reader owns, and accounts they own or that sit
  under one of those customers. **My team**: the same rule with owners =
  the reader plus everyone below them in the org chart (`subtree_ids`);
  offered only when that set is not empty. **Company**: the whole
  organisation, unassigned customers included; offered only to
  `view_all_accounts` or Leadership. **Default**: the widest scope the
  reader has (Company, then My team, then Me).
- A scope the reader may not use is refused:
  `403 {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}`.
  An unknown key is
  `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose me, team or company."}`.
- **What is counted is the reader's to read.** The scope sets the book;
  inside it, Me and My team figures count only what the reader may read
  — opportunities and risks by department (and an account-level one only
  on an account the reader may open), tickets by department, mail, notes
  and tasks by their chain rules — so a Me figure never counts a record
  the reader's Pipelines, Forecast or Activity page would not. Company
  figures are the organisation's own (the month-end metric snapshots'
  rule). The per-customer downside a brief or explanation prompt names is
  always counted as the reader, on every scope, Company included.
- Month-end rows for Me and My team are written by the nightly job as the
  scope's own user, and only within 3 days after the month ends; a later
  run writes none (it logs the skip), so a scope first seen mid-month reads
  from its first-view baseline, never from a back-dated month-end.
- A Me or My team scope's first `changed/` call (or `POST brief/` /
  `POST explanations/<metric>/` before any `changed/` call) writes a
  baseline for today; a team change (the owners differ from the last row's)
  starts a new one and sets `team_changed_on`.
- **Stored prose is shown only to a reader who may open every customer it
  names.** Me and My team rows are read only by their own owner. A Company
  explanation's named customers and their downside differ per writer, so
  one naming customers is shown only to its own writer, or to a reader who
  sees every customer (`view_all_accounts`) — two readers who can open the
  same customer may read different risks on it. A row written before this
  delivery (no recorded customer ids) is shown only to a reader who sees
  every customer.
- `/api/v1/metrics/` (`GET brief/`, `GET <key>/explanation/`, the Slack
  delivery) reads `scope_key="company"` only — a Me or My team row, which
  may name customers, never reaches it.

### `GET /api/v1/brain/scopes/`

```json
{
  "scopes": [{"key": "me", "label": "Me"}, {"key": "team", "label": "My team"}],
  "default": "team"
}
```

Only the scopes the reader may use, narrowest first.

### `GET /api/v1/brain/changed/?scope=me|team|company`

```json
{
  "scope": "team",
  "as_of": "2026-10-05",
  "since": "2026-09-30",
  "since_kind": "baseline",
  "team_changed_on": null,
  "currency": "USD",
  "empty": false,
  "metrics": [
    {"key": "active_arr", "label": "Active ARR", "unit": "money", "better": "up",
     "now": 450000.0, "then": 500000.0, "change": -50000.0, "material": true}
  ],
  "signals": [
    {"key": "at_risk_arr", "label": "ARR at risk", "unit": "money", "better": "down",
     "now": 114540.0, "then": 64090.0, "change": 50450.0, "improved": false,
     "drivers": [{"dimension": "product", "member": "4",
                  "label": "Analytics Suite", "change": 50450.0}],
     "handover": {"in": 0, "out": 2, "people": ["Dana CSM"]}}
  ]
}
```

- `metrics[]` has one row per metric in `services/metrics/registry.py`'s
  own order — 21 keys (`active_customers`, `active_arr`, `average_arr`,
  `logo_retention`, `churned_arr_12m`, `top_three_share`, `forecast_arr`,
  `nrr`, `at_risk_arr`, `seat_utilisation`, `shelfware_arr`,
  `at_capacity_arr`, `coverage`, `dark_accounts`, `dark_arr`,
  `healthy_share`, `poor_health_count`, `open_tickets`, `open_questions`,
  `stale_questions`, `contributions_30d`), never 15 — and carries exactly
  the fields above, no `note`.
- `since_kind`: `month_end` or `baseline`. For Me and My team `since` is
  never `null` — the first view writes a baseline, so `since_kind` is
  `baseline` and `since` is that day. For Company it is `null` only when
  no month-end has been recorded yet; then every `then` is `null` and
  `signals` is empty.
- `team_changed_on`: the date the team last changed, while that reset
  baseline is still the comparison point; else `null`.
- `empty`: true when a Me or My team scope's book has no customers.
- `handover` rides on every money-unit metric — `active_arr`,
  `average_arr`, `churned_arr_12m`, `forecast_arr`, `at_risk_arr`,
  `shelfware_arr`, `at_capacity_arr`, `dark_arr` — and is present only on
  Me and My team, and only when a customer moved in or out of the book
  since the comparison point. `people` names the current owners of the
  customers that left (or `"Unassigned"`), never the customers themselves.
  `shelfware_arr` and `at_capacity_arr` read `null` ("Not measured") when
  no customer in the scope's book has seats recorded — Company included.
- 400 `SCOPE_UNKNOWN`, 403 `SCOPE_NOT_ALLOWED` (scope refusals carry
  `code` and `detail`).

### `GET /api/v1/brain/brief/?scope=`

```json
{
  "brief": {
    "id": 9, "scope": "team", "as_of": "2026-10-05",
    "baseline": "2026-09-30", "headline": "…", "body": "…",
    "watch": ["…"], "generated_at": "2026-10-05T09:12:00Z",
    "generated_by": "Mona Manager", "stale": false
  }
}
```

`brief` is `null` when none has been written for this scope, or the newest
one isn't readable by this reader (§ "Stored prose" above).

### `POST /api/v1/brain/brief/?scope=`

Writes the scope's brief now (a paid model call), anyone who may use the
scope. 201 with the brief it wrote; 200 with the brief another request
just wrote while this one waited for the lock. Me and My team prompts may
name up to six of the scope's own customers carrying downside, each by
name, owner, ARR, downside (counted as the reader), renewal and health; the Company prompt is
unchanged — figures, cuts and member names only. Refusals (AI refusals
carry `detail` only, no `code`):

| Status | Body |
|---|---|
| 422 | `{"detail": "..."}` — `NothingToBrief` (no customers to write a brief about) |
| 429 | `{"detail": "..."}` — `BudgetExceeded` |
| 503 | `{"detail": "..."}` — `CopilotNotConfigured` |
| 502 | `{"detail": "..."}` — `CopilotRequestFailed`, or an unusable model answer |

On failure the previous brief, if any, stays.

### `GET /api/v1/brain/explanations/<metric>/?scope=`

```json
{
  "explanation": {
    "id": 4, "metric": "at_risk_arr", "scope": "team",
    "as_of": "2026-10-05", "text": "…",
    "evidence": ["…"], "hidden": 2,
    "generated_at": "2026-10-05T09:20:00Z", "generated_by": "Mona Manager",
    "stale": false
  }
}
```

`hidden` counts organisations (customers) carrying the scope's downside
that this reader may not open — ranked by the same rule the forecast tile
uses, never named. `explanation` is `null` when none exists for this scope
and metric, or isn't readable by this reader. The scope is checked before
the metric: an unknown metric is `404 {"detail": "No such metric."}`.

### `POST /api/v1/brain/explanations/<metric>/?scope=`

201 / 200 as for briefs (anyone who may use the scope writes their own copy
when the row another, wider reader's write just produced names a customer
this reader may not open). Same refusal table as `POST brief/?scope=`,
plus `422 NothingToExplain` (no live customers in the scope's book) in
place of `NothingToBrief`.

### `GET /api/v1/brain/waiting/` and `/count/`

Removed in Work in one place, delivery 2: see `GET /work/feed/` (the reader's own) and `GET /work/feed/team/` (team and company).

### `GET /api/v1/brain/doing/?scope=me|team|company`

Delivery 3 (spec: react-ts-app
`docs/superpowers/specs/2026-10-05-brain-doing-design.md` §1, §3). What is
being done about the scope's numbers. Scope refusals and the default
scope are as above.

- **Initiatives**: Me, initiatives the reader owns or that track their
  owner cut (`dimension=owner`, `member=<id>`); My team, the same for
  anyone on the desk; Company, all. Open (`planned`, `active`) plus those
  closed in the last 30 days; active, planned, then closed, soonest
  `target_by` first; at most 100. `progress` is `/metrics/initiatives/`'
  own (registry figures, organisation-wide). `for` is `null` for a
  whole-company initiative. **`progress` and `for` may be `null` in Me and
  My team**: an initiative that doesn't track the owner cut of the reader
  or someone below them (a whole-company initiative, a product, segment or
  lifecycle cut, or another person's owner cut) keeps its row (id, title,
  metric, status, owner, `target_by`, work, `can_edit`, hypothesis,
  outcome) but carries no figures and no cut label, unless the reader can
  use the Company scope. The same holds for the row POST and PATCH return.
  **Inside a desk person's own book, a reader who can't use Company reads
  the figures as themselves**: `progress.current` is the metric over that
  person's book counted by the reader's own record rules (their Me / My
  team figure, never the registry's organisation-wide slice), so two
  readers may see different `current` for the same initiative.
  **`progress.baseline` may be `null` for them**: it is returned only when
  the reader started the initiative from the Brain themselves
  (`baseline_scope` `book` and `created_by` the reader — the baseline is the
  creator's own read of the book). Anyone else's (another person's Brain
  start, or one written from `/metrics/initiatives/`, `company`) shows
  `baseline: null`, `progress_pct: null`, and `direction` is then the
  metric's `better` (`up` or `down`), never derived from the withheld
  baseline. `target`, `days_left`, `unit` and `better` are as ever. A Company reader sees the registry figures and
  every stored baseline, unchanged.
  `work.open`/`done` count every task;
  `work.tasks` lists only the tasks the reader may read, on records they
  may open (the `/metrics/initiatives/` row shape). `can_edit`: the owner,
  anyone above them, or `view_all_accounts`.
- **Plans**: on the desk's customers and on accounts the desk owns or
  that sit under a desk customer (Company: every plan); open ones by
  status (at risk first) and soonest target, then those done or cancelled
  in the last 30 days, most recently closed first (done: `done_at`;
  cancelled: the cancel, read from `updated_at` as the plan keeps no cancel
  timestamp, so a plan that went done → cancelled ages from the cancel). `then` is the record's figures when the plan
  started (`Plan.start_figures`), `null` for plans started before they
  were kept; `then.arr` is also `null` if the workspace's currency has
  changed since. `now` is the record's figures today. `health_score` is
  the 0.0–10.0 score; ARR is in `currency` (a customer's: the column the
  global-attribute mapping names, FX-converted, `null` with no rate; an
  account's: `Account.arr`).
- **Rules**: every rule owned by someone on the desk, active first, then
  by name. `last_run` is the latest night or `null`; `matched` and
  `skipped` (the sum of the skip reasons) only when `mine`; for anyone
  else's rule `fired` counts only the records the reader may open now.
  `readable`: the reader may open the rule (`readable_rules`).
  `paused_message` is the pause's sentence, `null` when not paused, and
  `"It is paused."` for a stored code that is no longer a known one.
- **Twice-filter**: `hidden` is how many of the scope's plans are on
  records the reader can't open. Nothing about them is named.
- `trackable`: the metrics with an owner cut (`forecast_arr`, `nrr`,
  `at_risk_arr`, `healthy_share`, `poor_health_count`), the only ones a
  Me or My team initiative can track.

```json
{
  "scope": "me",
  "currency": "USD",
  "hidden": 0,
  "trackable": [{"key": "at_risk_arr", "label": "ARR at risk", "unit": "money", "better": "down"}],
  "initiatives": [
    {"id": 3, "title": "Halve ARR at risk", "hypothesis": "If …", "outcome": "",
     "metric": "at_risk_arr", "metric_label": "ARR at risk",
     "for": {"dimension": "owner", "member": "5", "label": "Carl CSM"},
     "status": "active", "owner": {"id": 5, "name": "Carl CSM"},
     "target_by": "2026-11-30",
     "progress": {"baseline": 64100.0, "current": 52000.0, "target": 32000.0,
                  "progress_pct": 37.7, "days_left": 56,
                  "direction": "down", "unit": "money", "better": "down"},
     "work": {"open": 2, "done": 1, "tasks": [
       {"id": 41, "title": "Call the sponsor", "parent_name": "Dough Co",
        "parent_type": "customer", "parent_id": 6, "assignee_name": "Carl CSM",
        "due_date": "2026-10-12", "priority": "high", "status": "pending"}]},
     "can_edit": true}
  ],
  "plans": [
    {"id": 8, "name": "Renewal save play", "status": "at_risk",
     "record": {"type": "customer", "id": 6, "name": "Dough Co"},
     "owner": {"id": 5, "name": "Carl CSM"}, "target_date": "2026-11-01",
     "milestones": {"done": 1, "total": 4},
     "then": {"health_score": 4.8, "arr": 69600.0, "taken_on": "2026-10-06"},
     "now": {"health_score": 5.5, "arr": 69600.0}}
  ],
  "rules": [
    {"id": 3, "name": "Detractor follow-up", "segment": "Detractors",
     "is_active": true, "paused_reason": null, "paused_message": null,
     "mine": true, "readable": true,
     "last_run": {"run_on": "2026-10-05", "fired": 4, "matched": 12, "skipped": 2}}
  ]
}
```

### `POST /api/v1/brain/initiatives/?scope=me|team`

Body: `title`, `hypothesis`, `metric`, `target_value`, `target_by`,
`status` (default `active`), and in My team `for_user` (the reader by
default, or someone below them). In Me, `for_user` may only be the reader;
anyone else is 400 `{"detail": "Choose yourself or someone below you."}`.
The initiative tracks that
person's owner cut (`dimension=owner`), is owned by them and created by the
reader. Its baseline is read as the creator over that person's book (the
creator's own record rules, not the organisation-wide registry slice) and
stored with `baseline_scope` `book`; `/metrics/initiatives/` creates keep
`company`. 201 with the
initiative as a `doing/` row. 400: field errors, `{"for_user": ["Choose
yourself or someone below you."]}`, `{"detail": "That number can't be
tracked for one person's book."}` for a metric with no owner cut. 403
`{"code": "SCOPE_NOT_ALLOWED", "detail": "Company initiatives are started
from the Company initiatives page."}` in Company (use
`/api/v1/metrics/initiatives/`); a scope the reader may not use is the
usual 403. Audited `initiative.created`.

### `PATCH /api/v1/brain/initiatives/<id>/`

`title`, `hypothesis`, `target_value`, `target_by`, `status`, `outcome`.
Closing (`done`/`abandoned`) stamps `closed_at`; reopening clears it.
`metric`, `dimension`, `member`, `owner_id`, `for_user` are 400 `["This
can't be changed here."]`. The initiative's owner, anyone above them, or
`view_all_accounts`; anyone else 403 `{"detail": "You can't change this
initiative."}`; another organisation's 404. 200 with the `doing/` row.
Audited `initiative.updated` when something changed.

### `GET /api/v1/brain/customers/?scope=me|team|company`

Delivery 4 (spec: react-ts-app
`docs/superpowers/specs/2026-10-05-brain-customers-design.md` §1.3, §3).
Any member; the usual scope refusals. What the scope's customers are
asking for, what is going wrong across them, how they score us and who
turned negative. Everything is counted and named by the reader's own
rights:

- **`asks`, `anomalies`.** These are the top 5 rows of `/requests/?scope=` and `/anomalies/?scope=` (same order, all statuses), and `total` is the scoped list's length.
  - `arr` is a number here: the ARR column sum, not FX-converted, over the book's customers the reader may open. An account's ask counts only its parent organisations that are in the book.
  - Anomaly titles are gated as on `/anomalies/`.
- **`scores`.** Answered survey invites on the scope's book, from sends the reader may read (`readable_send_ids`), on records the reader may open.
  - `now` is answers since the start of `today − 90` days; `then` is the 90 days before.
  - `now`/`then` are `null` under 5 responses in their window. NPS is an integer, CSAT and CES are percentages.
  - CES counts organisation-level answers only.
- **`scores.comments`.** The 5 newest non-empty comments of the `now` window, on records the reader may open. `hidden` counts the window's other comments, on records they can't open.
- **`sentiment`.** Contacts on the book's records that the reader may open.
  - `negative` is how many of them are negative now.
  - `turned_negative` lists up to 10 whose sentiment is now negative and changed in the last 30 days, newest first, with the value it replaced.
  - `tracking_since` is the first recorded change among contacts the reader may open, or `null` before any.

```json
{"scope": "me", "currency": "USD",
 "asks": {"total": 7, "top": [{"id": 2, "title": "SSO with Okta", "status": "planned",
   "arr": 182000.0, "companies": 3, "last_90_days": 12, "previous_90_days": 7}]},
 "anomalies": {"total": 1, "top": [{"id": 4,
   "title": "Similar reports across 2 of your companies", "status": "live",
   "arr": 90000.0, "companies": 2, "last_seen_at": "2026-10-04T10:00:00Z"}]},
 "scores": {
   "nps": {"now": 18, "then": 25, "responses": 22, "previous_responses": 19},
   "csat": {"now": 82.5, "then": 80.0, "responses": 40, "previous_responses": 31},
   "ces": {"now": null, "then": null, "responses": 3, "previous_responses": 0},
   "comments": [{"survey_type": "nps", "score": 4, "comment": "Support is slow lately.",
     "record": {"type": "customer", "id": 3, "name": "Uber"},
     "answered_at": "2026-10-03T08:00:00Z"}],
   "hidden": 0},
 "sentiment": {"negative": 4, "tracking_since": "2026-10-20",
   "turned_negative": [{"contact": {"id": 41, "name": "Olivia Park"},
     "record": {"type": "customer", "id": 6, "name": "Apple Inc"},
     "previous": "neutral", "changed_at": "2026-10-22T07:00:00Z"}]}}
```

### `GET /api/v1/brain/graph/?scope=me|team|company`

Any member; the usual scope refusals. The `/metrics/graph/` shape (`as_of`,
`currency`, `nodes`, `edges`) for the scope, plus `hidden`:

- **Customers.** The scope's live customers the reader may open, capped at 200 by ARR, with figures counted as the reader. `open_tasks` counts only tasks the reader may read. `hidden` counts the scope's customers the reader can't open — it does not count customers beyond the 200 cap — and is non-zero only in Company for a reader without `view_all_accounts`.
- **Initiatives.** The scope's open initiatives (owned by the desk or tracking a desk person's cut; Company: all). A cut's `member_label` and its `targets` edge appear only where `doing/` shows the cut.
- **Agent actions.** Every waiting action the reader may read (Activity's `readable`: drafts by their source too), of any kind and agent, the newest 200 (a cap like the customers'), as `{"id": "agent_action:91", "kind": "agent_action", "label": <title>, "agent", "action_kind", "action_id"}`. There is no `from_session`. `acts_on` runs to `customer:<id>` for an action on a drawn organisation, and for an account action to each of the account's organisations that is drawn (drawn: the reader may open it); `serves` runs to the initiative of `AgentAction.initiative` when drawn; a workspace-level action has no edge, and an action on an organisation and on one of its accounts has one `acts_on` edge to it. The `proposal` node and `proposal_kind` are gone here.

`/api/v1/metrics/graph/` is unchanged and stays `view_all_accounts`.

---

## `segments` — Segments (`/segments`)

Built for the tools section's first delivery (spec: react-ts-app
`docs/superpowers/specs/2026-10-03-segments-design.md` §1–§2). A segment
stores rules, never members. Every read is computed for the caller over the
records they may open (`services/segments/evaluate.py`), so a segment only
ever holds records its viewer may open. It is unrelated to
`services/customers/segments.py`, the "Size band" revenue brackets.

`made_by`: `{"agent": "ops", "approved_by": {"id", "name"} | null}` on the detail and on every list row when an agent action made the object (`agent_action`, SET_NULL), else `null`. `approved_by` is the action's decider, and `null` once that person no longer exists. Lists load it with the row: no extra query.

**Rules.** `{"match": "all" | "any", "conditions": [...]}`.
- A condition is `{"field", "op", "value"?}`, or one group `{"group": {"match", "conditions": [...]}}`.
- Groups do not nest.
- At most 20 conditions, counting each one inside a group.
- An empty list matches nothing: the segment is then its pins.

Fields (`services/segments/registry.py`) take operators by type:

| Type | Operators | Value |
|---|---|---|
| number, percent | `gt lt between is_empty is_not_empty` | a number; `between` is `[low, high]`, inclusive |
| days (days since) | `gt lt between is_empty` | whole days. Never counts as more than any number; `is_empty` means never |
| date | `within_next within_last gt lt between is_empty is_not_empty` | `within_*` take 1–3650 days; dates are `YYYY-MM-DD` |
| choice | `is is_not in` | one of the field's values; `in` takes 1–100 |
| text | `is is_not in is_empty is_not_empty` | up to 100 characters |
| boolean | `is` | `true` or `false` |
| owner | `is is_not in` | a person's id in the workspace, or `"unassigned"` |
| record | `is is_not in` | an organisation, account or product id |

The fields per kind:
- `customer` (organisations): `lifecycle_stage`, `health_score`, `health_category`, `csat_score`, `nps_score`, `nps_band`, `ces_percentage`, `arr`, `renewal_date`, `owner`, `product`, `seat_use`, `open_tickets`, `last_touch`, `ai_pulse`, `csm_pulse`, `churned`, `archived`, `created`.
- `account`: the same without `ces_percentage`, `product`, `seat_use`, `churned` and `archived`, plus `organisation` (a linked organisation).
- `contact`: `role`, `sentiment`, `status`, `language`, `last_contacted`, `organisation` (direct or through the account), `account`, and `parent.<field>`.
  - `parent.<field>` is any organisation or account field except `organisation`.
  - It is read on the contact's own organisation or account.
  - A field the account lacks never matches an account-level contact.
- Any kind: `attr:<api_name>`, an AI attribute that applies to the kind. It is read as its newest value, with its value type's operators plus `is_empty`/`is_not_empty` (not answered yet).

What each field means:
- `arr`:
  - for an organisation, the column the workspace's ARR mapping names (`global_attributes`), converted to the workspace currency with its FX rates; a currency with no rate never matches;
  - for an account, its own `arr`.
- `renewal_date within_next`: an overdue renewal counts as within.
- `open_tickets`: unresolved tickets on the record itself that the caller may read under the department rule.
- `last_touch`: the health rubric's newest contact.
- `is_not`: also matches "no value".
- Defaults: churned and archived organisations are left out unless a rule names `churned` or `archived`. Naming `churned` means a top-level `churned` condition, or a `lifecycle_stage` condition asking `is`/`in` for `churn` — the same move that lifts the Organizations list's own default; `is_not churn` does not count, and keeps the default. Pins are added after the rules and exclusions removed, then visibility is applied last.

**Save as segment** (the Organizations/Accounts/Contacts lists' own action, built in the frontend PR, not this one) turns a list's current URL filters into a new segment's rules. Two things do not carry over literally:
- the list's free-text `search` has no rule: it narrows rows in place, and a segment has no "search" condition. (`GET /segments/` has its own unrelated `search`, which matches a *segment's* name, not its members.)
- the list's `include_churned=1` has no direct field of the same name: it maps to a `churned` condition (`{"field": "churned", "op": "is", ...}`, or a `lifecycle_stage` `is`/`in` `churn` condition) so the saved segment lifts the churned default the way the list's own toggle does.

**Refusals (400)** read `{"rules": ["<text>"]}`. They cover:
- an unknown field (`Unknown field "x" for organisations.`);
- an operator the type does not take (`"is" cannot be used with Health score.`);
- a bad value, a nested group, or more than 20 conditions.

An id the writer cannot open reads `Not an organisation you can open.`, `Not an account you can open.`, `Not a product in your workspace.` or `Not a person in your workspace.`. Each reads the same for a missing id.

**Rules as read.** Every response's `rules` replaces each id the caller cannot open with `null`. `labels` (`{"organisations", "accounts", "products", "people"}`, each `{"<id>": name}`) names only what the caller may open; people are named only from their own workspace. When rules are evaluated for a caller, ids are narrowed to what they may open, so `null` matches nothing.

**Access.**
- Readers:
  - the owner;
  - everyone in the workspace when `sharing` is `workspace`;
  - the chosen teammates when `sharing` is `people`.
- A segment the caller may not read is a 404 identical to a missing one.
- Writes (PATCH, DELETE, pin and keep out) are owner only: another reader gets `403 {"detail": "Only the segment's owner can change it."}`.
- Limits: 50 segments per owner, and 500 pinned and 500 kept out per segment.

### `GET /api/v1/segments/`

Auth: `IsAuthenticated`. Query: `scope=mine|shared|all` (default all), `search=` (name contains). Unpaginated, by name:

```json
[
  {
    "id": 7, "name": "Renewal risk", "kind": "customer",
    "owner": {"id": 4, "name": "Carl CSM"}, "is_owner": true,
    "sharing": "workspace", "paused": false, "member_count": 41,
    "today": {"entered": 3, "left": 1},
    "sparkline": [38, 38, 39, "… 30 sizes, oldest first …", 41],
    "updated_at": "2026-10-03T09:12:00Z"
  }
]
```

`member_count`, `today` and `sparkline` are the owner's nightly figures: counts only, naming nobody. They are `null` on a row the caller does not own — a shared viewer's own members can differ from the owner's, so the owner's counts are not substituted (Ruling S8). `sparkline` is rebuilt from the count and the change history, and is `[]` before the first evaluation.

### `POST /api/v1/segments/`

Body: `{name, kind: "customer" | "account" | "contact", description?, rules?, sharing?: "private" | "workspace" | "people", shared_with?: [user ids], alert_on_changes?}`.
- `shared_with` must be 1–50 active teammates in the caller's workspace (never the caller) when `sharing` is `people`, and it is cleared otherwise.
- The caller becomes the owner.
- The membership baseline is taken now, so no history is written for the save.

`201` returns the segment, as `GET` below. `400 {"detail": "You can own at most 50 segments."}` at the limit. Audited as `segment.created`, plus `segment.shared` when it is not private.

### `GET/PATCH/DELETE /api/v1/segments/<id>/`

`GET` returns:

```json
{
  "id": 7, "name": "Renewal risk", "description": "", "kind": "account",
  "rules": {"match": "all", "conditions": [{"field": "organisation", "op": "in", "value": [12, null]}]},
  "labels": {"organisations": {"12": "Pizza Hut"}, "accounts": {}, "products": {}, "people": {}},
  "pinned_ids": [31], "excluded_ids": [],
  "sharing": "people", "shared_with": [{"id": 5, "name": "Dana CSM"}],
  "owner": {"id": 4, "name": "Carl CSM"}, "is_owner": true,
  "alert_on_changes": true, "paused": false, "member_count": 41,
  "last_evaluated_on": "2026-10-03", "created_at": "…", "updated_at": "…"
}
```

- `pinned_ids` and `excluded_ids` list only records the caller may open.
- `member_count` is the owner's nightly figure, so it reads `null` for a non-owner reader too — the same rule as the list rows (Ruling S8 extends to the detail view): a shared viewer reads their own members through `/members/`, never the owner's cached count.
- `PATCH` takes the POST fields except `kind`, which cannot change (`400 {"kind": ["A segment's kind cannot change."]}`).
  - Changing `rules` re-takes the baseline.
  - Audited as `segment.updated` with the changed field names, and as `segment.shared` when `sharing` or `shared_with` changed.
  - A concurrent edit and the nightly step take the same row lock, so a PATCH waits for an in-flight evaluation (and sees its result) rather than overwriting it; the write only ever changes the fields the request named.
- `DELETE` → `204`, audited as `segment.deleted`. It takes the segment's row lock first, the one the nightly step holds, so a delete during an evaluation waits for it.

### `POST /api/v1/segments/<id>/duplicate/`

Any reader. It creates a private copy owned by the caller, named "<name> (copy)", with alerts off.
- Its rules are as the caller reads them: ids they cannot open are `null`.
- It keeps only the pins and keep-outs the caller may open.
- `201` returns the copy. The limit applies. Audited as `segment.duplicated` (`source`).

### `GET /api/v1/segments/<id>/members/`

The members the caller may open, as the kind's own list reads them:
- organisations: `/organizations/portfolio/`'s rows and its `sort`, `group`, `group_value`, `search`, `cursor` and `limit`;
- accounts: `/accounts/portfolio/`'s;
- contacts: `/contacts/`'s rows and `search`, by name, with `cursor` and `limit`.

Only these six parameter names ever reach the kind's own list code (`sort`, `group`, `group_value`, `search`, `cursor`, `limit`); every other filter the lists take (owner, health, lifecycle, ids, …) is dropped, since the members tab does not filter. Unknown values are ignored. Body:

```json
{
  "kind": "customer", "results": ["…the list's own rows…"], "next_cursor": "opaque",
  "count": 41, "groups": [], "currency": "USD", "hidden_count": 12,
  "summary": {
    "members": 41, "arr": 512000.0, "unconverted_count": 0, "avg_health": 5.4,
    "avg_csat": 71.2, "entered_7d": 6, "left_7d": 2, "currency": "USD"
  }
}
```

- `summary` covers every member the caller may open. Search narrows the rows, not the tiles.
- `arr` follows the rule's ARR: organisations through the workspace mapping, unconvertible ones counted in `unconverted_count`.
- A contacts segment's `summary` has `arr`, `avg_health` and `avg_csat` as `null`, and adds `contacts` (the Contacts list's own summary).
- `entered_7d` and `left_7d` count only records the caller may open.
- `hidden_count` is how many of the owner's members the caller cannot open: a count only, `0` for the owner.
- Contacts are paged in the database, in `(name, pk)` order, by a keyset cursor over that order — not fetched in full and sliced in Python, so the query count stays flat as the book grows.

Query counts are pinned and stay flat as members grow: 12 for an organisations segment, 10 for accounts and contacts.

### `GET /api/v1/segments/<id>/members/export.csv`

Every member the caller may open, in list order (`search` and `sort` honoured), with the kind's export columns:
- organisations: the Organizations export;
- accounts: the Accounts export;
- contacts: Name, Email, Phone, Role, Status, Sentiment, Language, Last Contacted, Organisation, Account, built with the Organizations export's own `build_table` (so formula cells go through the same neutralising `cell`), minus the Currency column `build_table` adds — a contact has no money.

Formula cells are neutralised. Audited as `segment.exported` with `count` and the parameter names only.

### `PATCH /api/v1/segments/<id>/members/<record_id>/`

Body `{"state": "pinned" | "excluded" | "none"}`. Owner only.
- The record must be one the owner may open; a missing one and a hidden one read the same 404.
- Pinning removes a keep-out and the other way round. The baseline is re-taken.
- Returns `{pinned_ids, excluded_ids}`.
- `400 {"detail": "A segment can pin at most 500 records, and keep out as many."}` at the limit.
- Audited as `segment.member_pinned` (`record_id`, `pinned`) or `segment.member_excluded` (`record_id`, `excluded`); clearing records `false`.
- Takes the segment's row lock, the same one the nightly step takes, so two pins at once (or a pin during an evaluation) queue up instead of racing past the 500 limit together.

### `GET /api/v1/segments/<id>/changes/`

`?days=` 1–90 (default 30). Entries and exits, newest day first:

```json
{
  "kind": "customer",
  "days": [{"date": "2026-10-03",
            "entered": [{"id": 12, "name": "Pizza Hut", "reason": ["csat_score"]}],
            "left": [],
            "totals": {"entered": 1, "left": 0},
            "more": {"entered": 0, "left": 0}}],
  "hidden_count": 3
}
```

- Only records the caller may open are named. The rest, deleted ones included, are counted in `hidden_count`.
- A day names at most 100 records each way (`entered`, `left`), lowest id first. `totals` counts every record the caller may open that moved that day, and `more` how many of those the cap left unnamed (`totals` minus the names; `0` when the day is not capped).
- Two queries whatever the size (visibility is a correlated `EXISTS`, the cap a window per day and direction; no id list is built). The query count is pinned at 6 and stays flat above the cap.
- `reason` is field keys, never values:
  - for an entry, the conditions that now hold;
  - for an exit, those that no longer hold;
  - or one of `pinned`, `deleted`, `access` (the owner can no longer open it), `churned` or `archived`.

### `POST /api/v1/segments/preview/`

Body `{kind, rules, pinned_ids?, excluded_ids?}`, checked exactly as a save is. It returns `{kind, count, results, summary}`:
- `results` are the first ten members by name: `{id, name, owner, health: {score, category}}`, or `{id, name, role, parent: {kind, id, name}}` for contacts.
- `summary` is the tiles, with `entered_7d`/`left_7d` `null`.

Nothing is saved.

**Nightly.** `run_health_maintenance` evaluates each segment once per date, as its owner (`services/segments/nightly.py`). It writes the entries and exits and updates `member_count`.
- If `alert_on_changes` is set and something moved, the owner gets one in-app notification. Its kind is `segment_changes`, its message is `"<name>: 3 entered, 1 left"` and its link is `/segments/<id>?tab=changes`. (`Notification`'s kinds also include `rule_fired` and `rule_review`, from `rules` below, and `plan_started` and `plan_task_assigned`, from `plans`, and `task_assigned`, from tasks, and `recommendations_waiting`, from Work's recommender (see `work`), and `task_overdue` and `task_escalated`, from Work's tracking, and `agent_proposal_waiting`, from Work's AI proposal notice (see `work`, Work in one place delivery 2 §4.1); and `mail_action_failed`, from the mail outbox (see `mail`); `message` holds up to 500 characters.)
- An inactive owner's segments are paused. They resume from a fresh baseline when the owner is active again.
- Above 100,000 members the count is kept and no history is recorded.

---

## `surveys` — Survey sends (`/surveys`, the hosted form `/s/:token`)

Built for the Impact section's second delivery (spec: react-ts-app
`docs/superpowers/specs/2026-10-03-surveys-design.md` §1, §3). A send asks one scored question by email of the people at a segment's records. Each person gets a one-time link to a hosted form, and the answer feeds the record's NPS, CSAT or CES.

**Models.**
- `SurveySend`: `owner`, `name` (≤ 120), `survey_type` (`nps`/`csat`/`ces`), `subject` (≤ 120), `intro` (≤ 500, plain text), `segment` (null once the segment is deleted), `roles` (contact roles, in the order ticked), `status` (`draft`/`sending`/`sent`), `sharing` (`private`/`workspace`/`people`) with `shared_with` (≤ 50), `started_at`, `sent_at`, `counts`.
- `SurveyInvite`: one person asked once.
  - `contact` (null once deleted), and the `customer` or `account` the answer scores, copied from the contact at send time.
  - `email`, and `token_hash` (SHA-256; the token itself is never stored).
  - `expires_at` (`started_at` + 14 days) and `status` (`pending`/`failed`/`answered`; expired is derived).
  - `failure` (≤ 200), `score`, `comment` (≤ 2000, plain text), `answered_at`.

**The question.** There is one per type, with the workspace's name.

| Type | Scale | Question | Bands |
|---|---|---|---|
| `nps` | 0–10 | How likely are you to recommend {workspace} to a friend or colleague? | detractors 0–6, passives 7–8, promoters 9–10 |
| `csat` | 1–5 | How satisfied are you with {workspace}? | low 1–2, mid 3, high 4–5 |
| `ces` | 1–7 | How easy is it to get what you need from {workspace}? | low 1–3, mid 4, high 5–7 |

**Audience.** It is resolved on the server from the sender's own view, for the count and again at the send.
- Who is reached:
  - for a contact segment, its active contacts;
  - for an organisation segment, the active contacts of the organisation and of its accounts whose role was ticked;
  - for an account segment, the account's own contacts whose role was ticked.
- Only contacts the sender may open are included. Those they cannot open are `hidden_count`.
- People are ordered by role in the order ticked, then by name.
- These are skipped and counted, never named:
  - no email (`skipped_no_email`);
  - anyone with an invite in the last 30 days that did not fail (`skipped_recent`);
  - more than 3 per organisation or account, counted after the other skips (`skipped_cap`).

**Scores.** On each answer, in the same transaction:
- The organisation's figure becomes the rolling 90-day figure over its own and its accounts' answers. The account's figure is the same over its own answers (NPS and CSAT only; `Account` has no CES).
  - NPS is round(% promoters − % detractors), rounded half up once, straight from the counts (1 net promoter in 201 answers is 0).
  - CSAT is the % answering 4–5, and CES the % answering 5–7, both with two decimals.
  - A record with no answer in 90 days keeps its score.
- One `Survey` log row per send and record is upserted (see `Survey` above).
- `run_health_maintenance` re-reads records whose answers have just aged past 90 days.
- Locking: before any record is recomputed, the accounts then the customers it scores are locked (`select_for_update`, by id, always that order), so two answers landing for the same organisation at once recompute in turn and the fixed order never deadlocks. The nightly refresh runs each aged record in its own transaction; one record's failure is logged and never stops the rest.

**Access.**
- A send is read by its owner, by the workspace (`workspace`), or by the chosen teammates (`people`).
- Anyone else gets a 404 identical to a missing send.
- Writes and the send are owner only: another reader gets `403 {"detail": "Only the survey's owner can change it."}`.
- The segment must be the caller's own: `403 {"detail": "You can only survey your own segments."}`, or 404 if they cannot read it.

### `GET/POST /api/v1/surveys/sends/`

Auth: `IsAuthenticated`. GET takes `scope=mine|shared|all` (default all) and returns an unpaginated list, newest first:

```json
[
  {
    "id": 3, "name": "Q3 NPS", "survey_type": "nps", "status": "sent",
    "segment": {"id": 7, "name": "Renewal risk", "kind": "customer"},
    "owner": {"id": 4, "name": "Carl CSM"}, "is_owner": true, "sharing": "private",
    "sent_at": "2026-10-03T09:12:00+00:00", "sent": 42, "answered": 31, "rate": 74,
    "updated_at": "2026-10-03T09:12:00+00:00"
  }
]
```

- `segment.id` is `null` for a reader who may not read the segment. `segment` itself is `null` once it is deleted.
- `sent`, `answered` and `rate` cover every invite for the owner, and only people the reader may open for anyone else.

POST `{name, survey_type, subject, intro?, segment?, roles?, sharing?, shared_with?}` creates a draft and returns 201 with the detail body.
- `roles` needs at least one value for an organisation or account segment (`{"roles": ["Choose at least one role."]}`). It is cleared for a contact segment.
- `sharing: "people"` needs 1–50 active teammates (`{"shared_with": ["Choose at least one teammate."]}`).

### `GET/PATCH/DELETE /api/v1/surveys/sends/<id>/`

GET returns:

```json
{
  "id": 3, "name": "Q3 NPS", "survey_type": "nps", "subject": "A quick question",
  "intro": "", "segment": {"id": 7, "name": "Renewal risk", "kind": "customer"},
  "roles": ["champion", "decision_maker"], "status": "sent", "sharing": "private",
  "shared_with": [], "owner": {"id": 4, "name": "Carl CSM"}, "is_owner": true,
  "started_at": "…", "sent_at": "…",
  "counts": {"audience": 42, "sent": 41, "failed": 1, "skipped_recent": 6,
             "skipped_no_email": 2, "skipped_cap": 0},
  "summary": {"sent": 41, "answered": 31, "rate": 76, "figure": 32,
              "bands": {"detractors": 5, "passives": 11, "promoters": 15}},
  "created_at": "…", "updated_at": "…"
}
```

- `counts` (frozen at send time) goes to the owner only, and is `null` for anyone else.
- `summary` covers every invite for the owner, and only people the reader may open for anyone else.
- `figure` is the type's figure over this send's answers, as an integer, and `rate` the answered share; both round half up once, straight from the counts. `bands` uses `low`/`mid`/`high` for CSAT and CES.

PATCH: owner only. On a draft, every field is editable. After the send starts, only `name`, `sharing` and `shared_with`; any other field is `400 {"<field>": ["A sent survey can only be renamed or re-shared."]}`.

DELETE: owner only, and drafts only. Otherwise `409 {"detail": "Only a draft can be deleted; a sent survey's answers feed the scores."}`.

### `POST /api/v1/surveys/sends/audience/`

Body `{segment, roles}`, checked as a save is. It returns the counts for the builder's modal and creates nothing:

```json
{"audience": 42, "organisations": 18, "skipped_recent": 6, "skipped_no_email": 2,
 "skipped_cap": 0, "hidden_count": 3, "limit": 500}
```

`organisations` counts the distinct records reached: each organisation and each account once.

### `POST /api/v1/surveys/sends/<id>/send/`

Owner only, no body. It claims the draft under row locks (the workspace first, so claims in one workspace queue), resolves the audience again and writes one `queued` invite per person inside the claim, so a send claimed while another is still delivering skips that one's people (30-day quiet period). It returns the detail body at once with `status: "sending"` and nobody emailed yet (`counts` carries the audience and skips, `sent: 0`). The `deliver_pending` runner (every minute) then emails each person their link over one mail connection (`{FRONTEND_URL}/s/<token>`, plain text), freezes the counts and audits `survey.sent` (actor: the owner; the click itself is audited `survey.send_started` with the request): expect `sent` within about a minute; poll the detail. While sending, `pending_rows` can show a person as `"queued"` (not emailed yet).

| Case | Answer |
|---|---|
| Email not set up (the console email backend with `DEBUG` off, i.e. no SMTP credentials), checked before the claim | 400 `{"detail": "Email isn't set up for this workspace yet, so surveys can't be sent."}` |
| Already sent, or being sent | 409 `{"detail": "This survey has already been sent."}` / `{"detail": "This survey is being sent."}` |
| 21st send today (per owner, since midnight UTC, the server's time zone) | 429 `{"detail": "You can send at most 20 surveys a day. Try again tomorrow."}` |
| No segment | 400 `{"segment": ["Choose a segment."]}` |
| Segment not the owner's | 403 `{"detail": "You can only survey your own segments."}` |
| Organisation/account segment, no roles | 400 `{"roles": ["Choose at least one role."]}` |
| Nobody to send to | 400 `{"segment": ["Nobody to send to."]}` |
| More than 500 people | 400 `{"segment": ["This survey would reach 612 people; the most is 500."]}` |
| One email fails | that invite is `failed` with `"<ErrorClass>: the email could not be sent."`; the batch continues; `counts.failed` |
| Delivery cut off (the worker died) | the send stays `sending`; the next run emails whoever was never tried, and anyone taken 10 minutes ago or more but never confirmed counts as emailed (`pending`, link working), never emailed twice |
| Mail server will not connect | everyone stays `queued`; the next run tries again |

A refusal leaves the draft untouched.

### `GET /api/v1/surveys/sends/<id>/answers/`

Query: `filter=all|detractors|comments` (an unknown value reads as `all`; `detractors` means the low band) and `cursor=`.

```json
{
  "filter": "all",
  "results": [
    {"id": 91, "contact": {"id": 12, "name": "Sam Pizza"},
     "record": {"kind": "customer", "id": 5, "name": "Pizza Hut"},
     "score": 10, "band": "promoters", "comment": "Great", "answered_at": "…"}
  ],
  "next_cursor": "WyIyMDI2LTEwLTAzVDA5OjEyOjAwKzAwOjAwIiwgOTFd",
  "hidden_count": 4
}
```

- Rows are newest first, 50 a page.
- Only people on records the reader may open are listed. `contact` is `null` once the contact is deleted.
- `hidden_count` counts every answer from people the reader may not open, regardless of the filter, so comparing filters reveals nothing about them.

### `GET /api/v1/surveys/sends/<id>/pending/`

Everyone the reader may open who has not answered, by name, unpaginated, plus `hidden_count`:

```json
{"results": [{"id": 92, "contact": {"id": 13, "name": "Tom"},
              "record": {"kind": "account", "id": 8, "name": "Taco West"},
              "status": "expired", "expires_at": "…", "failure": null}],
 "hidden_count": 0}
```

`status` is `pending`, `expired` or `failed` (with `failure`: the error's class name and a fixed message, e.g. `"SMTPRecipientsRefused: the email could not be sent."`, never the mail server's text). The email address is never returned.

### `GET/POST /api/v1/public/surveys/<token>/`

Public: `AllowAny`, no authentication, throttled to 30 requests a minute per IP (`survey_link`).
- GET returns `{"survey_type", "question", "intro", "organisation_name"}`, where `organisation_name` is the asking workspace's name.
- POST `{"score", "comment"?}` returns 204.
  - `score` must be a whole number in the type's scale, else `400 {"score": ["Choose a score from 0 to 10."]}` (or `1 to 5`, `1 to 7`).
  - `comment` is at most 2000 characters, trimmed.
- An unknown, expired, answered or failed link reads the same for both methods: `404 {"detail": "This link has expired."}`. A second answer, including two at once, gets that same 404.
- Nothing about the person or other answers is returned.

---

## `rules` — Rules (`/scenarios?tab=rules`, the Review Queue's "From your rules")

Built for the Impact section's third delivery (spec: react-ts-app `docs/superpowers/specs/2026-10-04-rules-design.md` §1, §3). A rule is "when → then" on one of the owner's own segments: one trigger, one to three actions, run nightly as the owner. The canvas (`scenarios` below) is unrelated and unchanged.

**Models.**
- `Rule`:
  - `owner`, `name` (≤ 120), `is_active` (default false);
  - `segment` (the owner's own; null once deleted);
  - `trigger` (`entered`/`left`/`crossed`/`schedule`), with `score` (`csat`/`nps`/`ces`/`health`), `direction` (`below`/`above`) and `threshold` for `crossed`, or `cadence` (`weekly`/`monthly`) and `weekday` (0–6, Monday = 0) for `schedule`;
  - `actions` (1–3), `cooldown_days` (1–365, default 30), `sharing` with `shared_with` (≤ 50), `paused_reason`.

  An owner has at most 50 rules.
- `RuleState`: per rule and record, `last_value` (last night's score, `crossed`) and `last_fired_on`.
- `RuleRun`: one per rule per night. `matched`, `fired`, `skipped` (`{cooldown, cap, not_visible, failed, nobody}`), `started_at` (when the rule's night began), `finished_at`.
- `RuleRunRecord`: one record a night touched. `outcome` (`fired`/`skipped`), `reason` (`cooldown`/`failed`/`nobody`), `actions` (`[{action, status, detail}]`; `status` is `done`, `unchanged`, `queued`, `skipped` or `failed`, and `detail` never holds personal data). A record fires when at least one action is `done`, `unchanged` or `queued`. Otherwise it is skipped: `failed` if any action failed, else `nobody` (every action was skipped, e.g. nobody to notify may open it). A skipped record starts no cooldown.
- `RuleReview`: one night's survey or campaign waiting for the owner, `kind` `survey`/`campaign`, at most one of each per night. `action` (frozen), `records` (`[{kind, id}]`), `counts` (`{people, records}` for a survey, `{reach, skipped}` for a campaign), `status` (`waiting`/`approved`/`skipped`/`expired`), `decided_by`, `decided_at`, `result` (`{survey_send_id}`, `{campaign_send_id}` or `{error}`), `notified_at` (internal: when the owner got the `rule_review` notice). It expires after 7 days, or at once when the rule's segment or trigger changes.

**Actions.** Each type appears at most once in a rule.

| Action | Body | Runs |
|---|---|---|
| `notify` | `{"action": "notify", "to": "me"\|"record_owner"\|"people", "people": [ids], "message": ""}`; `people` is 1–50 active teammates, used only with `to: "people"`; `message` ≤ 280 | At once. One `rule_fired` notification per recipient per night, naming up to three organisations or accounts that recipient may open (contacts are counted), linked to the night when they may read the rule |
| `task` | `{"action": "task", "title", "assignee": "record_owner"\|"me", "due_in_days"}`; `title` ≤ 200; `assignee` defaults to `record_owner`; `due_in_days` 0–90, default 7 | At once. One task per organisation or account per night (a contact's on its own organisation or account), priority medium. A record with no active owner goes to the rule's owner |
| `lifecycle` | `{"action": "lifecycle", "stage"}`; a lifecycle stage; not on contact segments | At once, under the record's row lock; audited `rule.field_changed` with old and new |
| `survey` | `{"action": "survey", "survey_type", "subject", "intro", "roles", "without_review"}`; Surveys' limits; `roles` empty for a contact segment; `without_review` default false | The night's fired records become one review, or with `without_review` a survey sent at once. Either way it goes through Surveys (30-day quiet period, 3 per record, 500 people, 20 sends a day, email set up) to the fired records only. The audience is resolved once for the whole night's records (as the owner); if it reaches nobody — every contact outside the ticked roles, in the quiet period, or with no email — every record's survey is `skipped` (`nobody it could reach`) instead of `queued`, and no review is made (a record whose only action was the survey is then itself skipped, `nobody`) |
| `plan` | `{"action": "plan", "template": <id>}`; a template the owner may read ("Choose a template you can use."); the rule reads it back as `{"action": "plan", "template": {"id", "name"} | null}` and accepts either form | At once. One plan per organisation or account per night (a contact's on its own), through the same service as `POST /api/v1/plans/`, owned by the record's owner when active and able to open it, else the rule's owner. Results: `done` "started", `unchanged` "already had one" (the record fires), `failed` "its template can't be used" |
| `campaign` | `{"action": "campaign", "campaign": <id>, "without_review": false}`; one of the owner's own campaigns, not archived, whose segment is of the rule's kind ("Choose one of your active campaigns for these records."); read back as `{"campaign": {"id", "name"} \| null}` and accepted either way | Once for the night's records, as the owner. With review: one campaign review (`queued` "waiting for your review"); approving claims it then, through every campaign rule, and the every-minute `deliver_pending` runner emails it. Without review: claimed in the night (`done` "emailed") and emailed once every rule has committed; the owner gets `campaign_sent`. Reaching nobody: `skipped` "nobody it could reach", no review, no send. A refusal: `failed` with its words, or "its campaign can't be used" |

**Triggers.**
- `entered`/`left`: that day's entries or exits from the segments' nightly step.
- `crossed`: a member whose score is past the line tonight (strictly) and whose stored score last night was not. The first night after a rule is created, turned on or given a new line only stores the scores. Contact segments and accounts' CES are refused.
- `schedule`: every member on the weekday (`weekly`) or on the 1st (`monthly`), in the server's time zone (UTC).

Then:
- records the owner may not open are counted (`not_visible`);
- records fired within `cooldown_days` are skipped (`cooldown`);
- at most 200 a night, lowest id first, and the rest are counted (`cap`).

A crossing (or an entry or exit) skipped for the cap or the cooldown is used up, not retried: tonight's score is stored for every member, and `entered`/`left` read only that day's changes, so it does not fire on a later night.

**The night.** `run_health_maintenance` runs the rules after the segments' step:
- each active rule once a night, in its own transaction;
- each record and action in its own savepoint;
- a rule whose segment is gone or no longer the owner's, whose owner is inactive, or whose plan template was deleted, switches itself off (`paused_reason`) and tells its owner once;
- after every rule has committed, tonight's surveys without review that were never tried are sent, and each owner with surveys waiting that they have not been told about gets one `rule_review` notification linking to `/work/mine?kind=approval`. Both read what is stored, so a re-run the same night after a crash finishes them, once (a refused send without review is left waiting for its owner, not retried). Then every campaign send still `sending` that nobody is delivering is finished: tonight's sends without review at once, any other 10 minutes after it started. The owner's one `rule_review` notice per night covers both kinds ("2 emails from your rules are waiting for your review.").

**Access.**
- A rule is read by its owner, by the workspace (`workspace`), or by the chosen teammates (`people`). Anyone else gets a 404 identical to a missing rule.
- Writes are owner only: another reader gets `403 {"detail": "Only the rule's owner can change it."}`.
- The segment must be the caller's own: `403 {"detail": "A rule can only use your own segments."}`, or 404 if they cannot read it.
- Reviews are the owner's alone: anyone else gets 404.

### `GET/POST /api/v1/rules/`

Auth: `IsAuthenticated`. GET takes `scope=mine|shared|all` (default all) and returns an unpaginated list by name:

```json
[
  {
    "id": 5, "name": "Renewal watch", "is_active": true, "paused_reason": "",
    "paused_message": "", "segment": {"id": 7, "name": "At risk", "kind": "customer"},
    "trigger": "crossed", "score": "csat", "direction": "below", "threshold": 60.0,
    "cadence": "", "weekday": null,
    "actions": [{"action": "notify", "to": "me", "people": [], "message": ""}],
    "cooldown_days": 30, "sharing": "private", "owner": {"id": 4, "name": "Carl CSM"},
    "is_owner": true, "last_run": {"run_on": "2026-10-04", "fired": 3, "waiting": false},
    "updated_at": "2026-10-04T09:12:00+00:00"
  }
]
```

- `segment.id` is `null` for a reader who may not read the segment, and `segment` is `null` once it is deleted.
- `last_run` is `null` before the first night. Its `fired` is `null`, and `waiting` false, for anyone but the owner.
- `paused_reason` is `""`, `segment_gone`, `segment_not_owned`, `owner_inactive` (the owner is deactivated, or their membership here is suspended or revoked), `template_gone` ("Its plan template was deleted.") or `campaign_gone` ("Its campaign was archived or deleted."). `paused_message` is its sentence.

POST `{name, segment, trigger, score?, direction?, threshold?, cadence?, weekday?, actions, cooldown_days?, is_active?, sharing?, shared_with?}` creates a rule owned by the caller and returns 201 with the detail body.
- Fields not used by the trigger are cleared.
- Errors are 400 at the field named. Action errors are a list aligned with `actions`, for example `{"actions": [{}, {"title": ["Give the task a title."]}]}`.
- The 51st rule is `429 {"detail": "You can own at most 50 rules."}`.

`made_by`: `{"agent": "ops", "approved_by": {"id", "name"} | null}` on the detail and on every list row when an agent action made the object (`agent_action`, SET_NULL), else `null`. `approved_by` is the action's decider, and `null` once that person no longer exists. Lists load it with the row: no extra query.

### `GET/PATCH/DELETE /api/v1/rules/<id>/`

GET returns the row plus `shared_with` (`[{id, name}]`, teammates in the reader's workspace) and `created_at`.

PATCH (owner) takes any POST field.
- The merged rule is checked again.
- A rule with no segment cannot be turned on: `400 {"segment": ["Choose a segment."]}`.
- Turning a rule on clears `paused_reason`.
- A rule whose segment was deleted may still be renamed, re-shared or switched off. A segment is needed only to change the segment or the trigger's fields, or to turn it on.
- A new segment or trigger forgets the rule's stored scores and cooldowns, and expires its waiting reviews (audited `rule.review_expired` with `reason: "rule_changed"`). A new score, direction or threshold, or turning it on, forgets the stored scores only.
- Turning a rule on checks its actions again: a plan template since deleted or unshared is refused at `actions`.

DELETE (owner) returns 204.

### `POST /api/v1/rules/test/`

The builder's "Test this rule". It takes a rule body (`name` optional), plus an optional `rule` (the id of a rule the caller owns), which lends its stored scores and cooldowns. The body is checked as a save would check it. Nothing is written.

```json
{"count": 4, "records": [{"kind": "customer", "id": 12, "name": "Pizza Hut"}],
 "hidden_count": 1, "skipped": {"cooldown": 0, "cap": 0, "not_visible": 1}}
```

- `count` is how many would be acted on tonight. `records` names the first 10 by id.
- For `entered`/`left` before tonight's segments step, the answer compares the owner's members now with the segment's last baseline.
- For `crossed`, a member past the line with no stored score counts here, though the night itself never fires on a first sight.
- A rule with a `plan` action adds `"plans": {"would_start": 1, "already_open": 1}`: of tonight's organisations and accounts (a contact's own), how many would get a plan and how many already have one open from the template, and `campaigns: {would_email, skipped}` when the rule has a `campaign` action.

### `GET /api/v1/rules/<id>/runs/?cursor=`

The rule's nights, newest first, 20 a page:

```json
{"results": [{"id": 9, "run_on": "2026-10-04", "matched": 5, "fired": 3,
  "skipped": {"cooldown": 1, "cap": 0, "not_visible": 1, "failed": 0, "nobody": 0},
  "review": {"id": 2, "status": "waiting"},
  "reviews": [{"id": 2, "kind": "survey", "status": "waiting"}], "hidden_count": 0,
  "started_at": "…", "finished_at": "…"}],
 "next": "<opaque cursor or null>"}
```

For anyone but the owner, `matched`, `skipped` and `review` are `null`, and `fired` counts only the records they may open now. For everyone, `hidden_count` counts the night's records they cannot open now (or that were deleted). A malformed cursor reads as the first page. `review` is the night's survey review, else its campaign review; `reviews` lists both (`[]` for anyone but the owner).

### `GET /api/v1/rules/<id>/runs/<run_id>/`

```json
{"id": 9, "run_on": "2026-10-04", "hidden_count": 1,
 "records": [{"kind": "customer", "id": 12, "name": "Pizza Hut", "outcome": "fired",
   "reason": "", "actions": [{"action": "task", "status": "done", "detail": ""}]}]}
```

The response lists only the records the caller may open now, fired first, unpaginated (at most 400). A night of another rule is a 404.

### `GET /api/v1/rules/reviews/?status=waiting`

The caller's own reviews (`waiting` by default, or `approved`, `skipped` or `expired`), newest first, at most 100:

```json
[{"id": 2, "kind": "survey",
  "rule": {"id": 5, "name": "Renewal watch", "trigger": "entered", "score": "",
           "direction": "", "threshold": null, "cadence": "", "weekday": null,
           "segment": {"id": 7, "name": "At risk", "kind": "customer"}},
  "run_on": "2026-10-04",
  "action": {"action": "survey", "survey_type": "nps", "subject": "A quick question",
             "intro": "", "roles": ["champion"], "without_review": false},
  "counts": {"people": 6, "records": 4}, "organisation_name": "Acme Inc",
  "status": "waiting", "result": {}, "created_at": "…", "expires_at": "…",
  "decided_at": null}]
```

`result` holds `{"error": <Surveys' refusal>}` after a refused approval. The review then stays waiting. A campaign review carries `kind: "campaign"`, `campaign: {id, name} | null`, and `counts: {reach, skipped}`. Approving it answers `{"campaign_send_id"}`.

### `POST /api/v1/rules/reviews/<id>/approve/` and `/skip/`

Owner only (404 otherwise).
- **Approve** claims the survey as the rule's owner and returns `200 {"survey_send_id": 31}` at once. Nothing is emailed during the approval: the send is committed `sending` with every invite `queued`, and the every-minute `deliver_pending` runner emails them and finishes it (`sent`). The answer carries only the id; read the send (`GET /api/v1/surveys/sends/<id>/`) for its `status`.
  - The survey is named "{rule name} · 4 Oct 2026" and limited to the night's fired records that the owner may still open.
  - If Surveys refuses (nobody to ask, over 500 people, the daily limit, email not set up), the answer is 400 with Surveys' own body, which is also stored on `result`. No draft is left behind.
  - If the rule now points at a segment of another kind than the review's records, or at none, the answer is `400 {"detail": "This rule's segment or trigger has changed since this review was made, so it has expired."}`, nothing is sent, and the review becomes `expired`.
- **Approve** a campaign review sends the campaign as the rule's owner to the night's fired records and returns `200 {"campaign_send_id": 9}`. The campaign must still be the rule owner's, on a segment of the records' kind (checked again under the claim's lock), else `400 {"detail": "Choose one of your active campaigns for these records."}`, stored on `result`. Nothing is emailed during the approval: the answer is `200` at once with the send committed `sending` and every delivery `queued`, and the every-minute `deliver_pending` runner emails them (a mail server that is down leaves them queued for its next minute). The answer carries only the id; read the send (`GET /api/v1/campaigns/<review's campaign.id>/sends/<id>/`) for its `status`.
- **Skip** returns the review with `status: "skipped"`.
- A review no longer waiting is `409 {"detail": "This review has already been decided."}`.
- A review deleted (with its rule) while it is being approved or skipped is `404`, as a missing one.

---

## `plans` — Project Management (`/projects`, the Plans section on organisation and account pages)

Built for the Impact section's fourth delivery (spec: react-ts-app `docs/superpowers/specs/2026-10-04-plans-design.md` §1, §4). A plan is a run of work on one organisation or one account: ordered milestones, each with ordinary `customers.Task` rows (`Task.plan`, `Task.milestone`), started from a template by a person or by a rule's "Start a plan". Unrelated to `billing.Plan`.

**Models.**
- `PlanTemplate`: `name` (≤ 120), `kind` (`onboarding`/`success`/`save`/`qbr`/`other`), `description` (≤ 500), `sharing` with `shared_with` (≤ 50), `milestones` (1–12 `{name, offset_days 0–365, tasks: [{title ≤ 255, priority, offset_days 0–365, assignee_role: plan_owner|record_owner}]}`, at most 50 tasks in all), `is_builtin`. Four built-ins (Onboarding, Success plan, Save plan, QBR) have no workspace and no owner and are read by everyone. At most 50 personal templates per owner.
- `Plan`: one `customer` or one `account`; `template` (a copy was made; SET_NULL); `name`, `kind`, `owner` (an active teammate who can open the record), `start_date`, `target_date` (the latest milestone due date), `status` (`not_started`/`on_track`/`at_risk`/`done`/`cancelled`/`draft`; the first three are open), `status_set_by` (`person`/`system`), `at_risk_cleared_on`, `started_by` (null when a rule started it), `started_by_rule`, `done_at`, `draft_tasks` (a Draft's kept tasks), `agent_action` (the agent action that started it, if one did). One open plan per record per template.
- `Milestone`: `plan`, `name`, `position`, `due_date`, `done_at`, `done_by` (null when its tasks completed it).

**How a plan moves.**
- The first completed task, or a milestone marked done, moves `not_started` to `on_track` (`system`).
- A milestone is done when all its tasks are completed, and re-opens when one re-opens, unless a person marked it done.
- The last milestone done makes the plan `done`, in the same transaction.
- Nightly (`run_health_maintenance`, after the segments and before the rules): an open plan with a milestone past its due date and not done becomes `at_risk` (`system`). After a person moves it from at risk to on track, only a milestone due on or after that day counts. A plan whose milestones are all done becomes `done`. A plan deleted during the run is counted as skipped, not failed.
- `cancelled` is by hand only and final. On a `done` or `cancelled` plan only a task's status may change, and nothing else follows.
- `draft` is not open: it is counted nowhere as open and never blocks another plan from the same template. An agent-started plan whose `plan.start` is undone returns to Draft (its tasks kept as data and deleted). A Draft starts again only through `POST /plans/<id>/start/`.

**Access.**
- A plan is read by whoever may open its record. Anyone else gets a 404 identical to a missing plan, and plans they cannot open are never listed or counted.
- A plan's tasks keep their own rule (creator, assignee, and anyone above either). Counts of tasks are over the tasks the reader can see; the rest are `hidden_tasks`. A task the caller cannot see is 404 on the plan's task routes.
- A plan is changed by its owner and anyone above them in the chart: another reader gets `403 {"detail": "Only the plan's owner or their managers can change it."}`. A task's status may also be changed by its assignee or its creator.
- A template is read when built in, owned, shared with the workspace or with the reader by name. Only its owner changes it: `403 {"detail": "Only the template's owner can change it."}`; built-ins answer `403 {"detail": "Built-in templates can't be changed."}`.

**Refusals.** 400 `{field: [message]}` in the UI's own words (`services/plans/validation.py`); `non_field_errors` for no field. Milestone and task errors are lists aligned with what was sent, e.g. `{"milestones": [{}, {"tasks": [{"priority": ["Choose high, medium or low."]}]}]}`. A finished plan's structure: `400 {"non_field_errors": ["This plan is finished; only its tasks can change."]}`. A body that is not one JSON object (an array, say) on any write: `400 {"non_field_errors": ["Send the fields as one object."]}`. A task deleted by someone else mid-request is the route's 404 (`PATCH /api/v1/tasks/<id>/`: `{"detail": "No such task."}`).

### `GET /api/v1/plans/`

Query: `status` (repeatable; `open` = the first three; default `open`), `kind`, `owner` (`me` or an id), `mine=tasks` (plans with a task assigned to me), `customer`, `account`, `q` (the plan's or its record's name), `cursor`. Unknown values are ignored. Newest first, 50 a page:

```json
{"results": [{"id": 3, "name": "Onboarding · Pizza Hut", "kind": "onboarding",
  "status": "on_track", "record": {"kind": "organization", "id": 12, "name": "Pizza Hut"},
  "owner": {"id": 4, "name": "Carl CSM"}, "start_date": "2026-10-04",
  "target_date": "2026-12-03", "milestones_done": 1, "milestones_total": 4,
  "tasks_done": 2, "tasks_total": 7, "next_due": "2026-10-18", "is_overdue": false,
  "can_edit": true}],
 "next": "<opaque cursor or null>",
 "counts": {"not_started": 0, "on_track": 1, "at_risk": 0, "done": 0, "cancelled": 0}}
```

`counts` covers the same filters ignoring `status`. `status` accepts `draft`; `counts` gains a `draft` key. `next_due` is the earliest due date of a milestone not done; `is_overdue` is `next_due` before today, on an open plan only.

### `POST /api/v1/plans/`

`{template, customer | account, name?, owner?, start_date?, milestones?}`.
- Exactly one of `customer`/`account`: `400 {"non_field_errors": ["Choose an organisation or an account."]}`. A record the caller cannot open reads like a missing one: `400 {"customer": ["Choose an organisation you can open."]}` (or `account`).
- `template` must be one the caller may read: `400 {"template": ["Choose a template you can use."]}`.
- `owner` defaults to the caller; it must be an active teammate who can open the record: `400 {"owner": ["They can't open this record."]}`. `start_date` defaults to today, `name` to "<Template> · <Record>".
- Without `milestones` the template is copied: dates from the start date, `record_owner` tasks to the record's owner (or the plan's owner when they cannot take them), `plan_owner` tasks to the plan's owner. With them, the modal's edited copy: `[{name, due_date, tasks: [{title, priority, due_date, assignee}]}]`, 1–12 milestones, at most 50 tasks, dates from the start to a year after it, assignees who can open the record.
- 201 with the plan (below). `409 {"code": "PLAN_OPEN", "plan_id": 3, "detail": "This record already has an open plan from this template."}` when the record has one open.
- The owner gets `plan_started` when someone else or a rule started it (a rule is named only to an owner who may read it, else "A rule started the plan …"); each assignee gets one `plan_task_assigned` naming how many tasks, never the person acting. Both link to `/projects/<id>`.

### `GET/PATCH/DELETE /api/v1/plans/<id>/`

GET returns the row plus:

```json
{"template": {"id": 1, "name": "Onboarding"}, "started_by": {"id": 9, "name": "Alice Admin"},
 "started_by_rule": null, "status_set_by": "system", "done_at": null,
 "created_at": "…", "hidden_tasks": 1, "can_delete": false,
 "milestones": [{"id": 21, "name": "Kick-off", "position": 0, "due_date": "2026-10-04",
   "done_at": "…", "is_overdue": false, "hidden_tasks": 0, "tasks_done": 2, "tasks_total": 2,
   "tasks": [{"id": 88, "title": "Hold the kick-off call", "priority": "high",
     "status": "completed", "due_date": "2026-10-04",
     "assignee": {"id": 4, "name": "Carl CSM"}, "can_check": true}]}]}
```

- `started_by_rule` is `{id, name}` for a reader who may read the rule, else `{"id": null, "name": "a rule"}`.
- `can_check` is true for the task's assignee, its creator and the plan's editors. `can_delete` is `can_edit` and no completed task.

PATCH (editors) takes any of `{name, owner, status}`; `status` is `on_track`, `at_risk`, `cancelled` or `done` (`400 {"status": ["Mark every milestone done first."]}` until every milestone is). Moving from at risk to on track records the day. Returns the plan.

DELETE (editors) returns 204 while no task is completed, else `409 {"code": "PLAN_HAS_DONE_WORK", "detail": "Cancel it instead: some of its work is done."}`. Its milestones and tasks go with it.

Every plan payload (the list's rows, the page and a record's plans) carries `pending_tasks` (a Draft's kept tasks, else 0) and `started_by_agent` (`"cs"`, `"sales"` or `null`). PATCH works on a Draft for `name` and `owner`; a `status` sent to a Draft, or `status: "draft"` sent to any plan, is `400 {"status": ["Start a draft plan with Start plan."]}`. DELETE works on a Draft.

### `POST /api/v1/plans/<id>/start/`

A plan editor starts a Draft again: its kept tasks are made anew, every due date (each milestone's and each kept task's) moves by (today - start date), so `target_date` becomes the latest moved milestone due date, `start_date` becomes today and the status `not_started`. A kept task keeps its assignee while they are active and may open the record, else it goes to the record owner, then the plan owner. Assignees are told, as for a fresh start. Returns the plan. Errors: 404; 403 (not an editor); `409 {"code": "NOT_DRAFT", "detail": "Only a draft plan can be started."}`; `409 {"code": "PLAN_OPEN", "plan_id": 12, "detail": "This record already has an open plan from this template."}`. Audited `plan.started_from_draft {tasks}`.

### Milestones and tasks

All answer the plan; the two POSTs answer 201. Editors only, while the plan is open (except a task's `status`).

| Route | Body |
|---|---|
| `POST plans/<id>/milestones/` | `{name, due_date}`: added at the end; at most 12 |
| `PATCH plans/<id>/milestones/<mid>/` | any of `{name, due_date, done}` |
| `DELETE plans/<id>/milestones/<mid>/` | removes it with its tasks; never the last one, and never one holding a completed task, hidden ones included: `400 {"non_field_errors": ["Some of its work is done; mark it done instead."]}` |
| `POST plans/<id>/milestones/reorder/` | `{order: [every milestone id, once]}` |
| `POST plans/<id>/tasks/` | `{milestone, title, priority, due_date, assignee}`: created by the caller; at most 50 |
| `PATCH plans/<id>/tasks/<tid>/` | any of `{title, priority, due_date, assignee, milestone, status}`; `status` also by the assignee or creator |
| `DELETE plans/<id>/tasks/<tid>/` | removes it |

Due dates lie from the start date to a year after it. On a Draft, the milestone routes work (removing a milestone drops its kept tasks), but `done` is `400 {"done": ["Start a draft plan with Start plan."]}`, and the task routes answer `400 {"non_field_errors": ["Start a draft plan with Start plan."]}`. A reassigned task's new assignee gets one `plan_task_assigned`. A task's status may also change through `PATCH /api/v1/tasks/<id>/`, which moves its milestone and plan the same way. That route also takes the task's other fields from the plan's editors while the plan is open; the plan route itself does not offer Blocked.

### `GET/POST /api/v1/plans/templates/`, `GET/PATCH/DELETE /api/v1/plans/templates/<id>/`

GET (list) returns `{builtin: [...], mine: [...], shared: [...]}`; each template:

```json
{"id": 1, "name": "Onboarding", "kind": "onboarding", "description": "", "is_builtin": true,
 "is_owner": false, "owner": null, "sharing": "workspace", "shared_with": [],
 "milestones": [{"name": "Kick-off", "offset_days": 0, "tasks": [{"title": "Hold the kick-off call",
   "priority": "high", "offset_days": 0, "assignee_role": "record_owner"}]}],
 "milestone_count": 4, "task_count": 7, "length_days": 60, "updated_at": "…"}
```

`made_by`: `{"agent": "ops", "approved_by": {"id", "name"} | null}` on the detail and on every list row when an agent action made the object (`agent_action`, SET_NULL), else `null`. `approved_by` is the action's decider, and `null` once that person no longer exists. Lists load it with the row: no extra query.

POST `{name, kind, description, milestones, sharing, shared_with}` returns 201; the 51st personal template is `400 {"non_field_errors": ["You can own at most 50 templates."]}`. PATCH takes the same fields; DELETE returns 204 and keeps the plans started from it.

### `POST /api/v1/plans/<id>/save-as-template/`

`{name, sharing?, shared_with?}` (editors): the plan's milestones and the tasks the caller can see, as a new personal template of the plan's kind. Offsets are days from the start date (0–365); a task assigned to the record's owner becomes `record_owner`, any other `plan_owner`. 201 with the template.

### `GET /api/v1/customers/<id>/plans/`, `GET /api/v1/accounts/<id>/plans/`

`{results: [row, ...]}`, open plans first, then newest; unpaginated. 404 for a record the caller cannot open.

## `scenarios` — Automation builder (`/scenarios`, `CreateScenario.tsx`)

Mirrors: `src/pages/scenarios/CreateScenario.tsx`, `types.ts`,
`scenarioApi.ts`. Its own top-level app (not nested under `customers`)
— a Scenario isn't owned by one Customer/Account, it's a tenant-wide
automation. See `services/scenarios/engine.py`'s own docstring for the
full "what's real vs. what's still a frontend mockup" line and why
(no task queue, no Slack/Teams/Survey/Playbook models in this
codebase).

### Models

- `Scenario` — `name`, `apply_to` (`organizations`/`accounts`/
  `contacts`, only `organizations` is runnable in v1), `nodes`/`edges`
  (JSON, stored exactly as React Flow gives them — see the model's own
  docstring), `is_active` (gates On Event auto-execution only; default
  `False`), `created_at`/`updated_at`.
- `ScenarioRun` — one execution: `scenario`, `customer` (the target),
  `triggered_by` (`manual`/`event`), `status` (`success`/`failed`),
  `log` (list of `{node_id, action, status, detail}`, one per node
  visited, in order), `started_at`/`finished_at`.

### Conventions specific to this app

`apply_to`'s values are lowercase to match every other choice field in
this codebase (`Customer.lifecycle_stage`, etc.) — the frontend's
`ApplyToTarget` type uses the same lowercase strings, not the
Title Case the radio labels display.

A Condition/Filter node's saved clause is one of two kinds, stored on
the node's own `data`. Condition branches by which outgoing edge has
`label: "Yes"`/`"No"` — the same manually-set label `CustomEdge.tsx`'s
own "Set Label" pill already produces, not a new concept.

**A field clause** (the default) is `conditionAttribute` +
`conditionOperator` + `conditionValue`. The attribute is a fixed
allowlist, never an arbitrary model field: `lifecycle_stage`, `name`,
`owner` (their email), `health_score`, `nps_score`, `arr` (read through
the organisation's own `arr` global attribute mapping), `renewal_days`
(days until renewal, negative once past), `open_tickets`, or
`attr:<api_name>` for any AI attribute, whose current value is its
newest row and therefore a person's correction when there has been one.
Operators: `equals`, `not_equals`, `greater_than`, `less_than`,
`contains`, `is_one_of` (a comma-separated list), `is_empty`,
`is_not_empty`.

**A semantic clause** is `conditionKind: "semantic"` with
`conditionPhrase` and an optional `conditionThreshold` (default 0.6).
The phrase and the company's most recent emails, tickets and calls go
through the same local embedding model the Copilot uses, and the clause
passes when the closest record clears the threshold. It spends no
credits and answers the same way every run.

The records it reads are the ones the **customer's owner** may read (the
same principal the nightly AI-attribute pass uses), so a scenario never
matches on mail from a mailbox nobody on the account may open or on
another department's tickets; a customer with no owner sees only the
records nobody owns personally. The run log says what matched by kind
and date ("an email from 12 Sep") and how closely, never a subject or
any of the record's words: run history is filtered by customer, not by
record.

Anything missing or unrecognised — an attribute, an operator, an
uncoercible value, a company with nothing on record — is `false`, never
an exception: a half-configured node skips its Yes branch rather than
stopping the run.

### What a node can actually do

| Action | What it does |
|---|---|
| `Send Email` | Sends to the customer's address through `send_scenario_email` |
| `Create Task` | A Task on the customer, due today |
| `Set Attribute` | Sets `lifecycle_stage` to one of its own valid values |
| `Churn Entity` | Marks churned and dates it |
| `Assign Owner` | Routes the customer to a person: `assignTo` (a user id in this organisation, checked rather than trusted) or `assignRule: "least_loaded"` with an optional `assignFunction`, which picks whoever in that function carries the fewest live customers, ties by lowest id. Notifies the new owner |
| `Notify` | Notifies `notifyWho`: `owner`, `manager` (the owner's manager) or `user` with `notifyUser`, carrying `notifyMessage` |
| `Wait` / `Conditional Wait` | A no-op that logs why: there is no task queue to wait on |

A node that names nobody reachable fails that node and marks the run
failed; the walk continues, because the side effects earlier nodes
committed are real either way.

### Triggers

`entry.data.eventTrigger` says what starts a scenario besides Run Now:

- `new_entity` — a Customer is created.
- `interaction_classified` — an email, ticket or call has just been
  tagged by the classifier. This is the trigger a semantic condition is
  for: the ticket arrives, the classifier says what it is about, the
  scenario decides where it goes. Only the record's own customer is run;
  an account-level interaction has no engine path yet.

Both run after the transaction commits, synchronously, in-request.

### `GET/POST /api/v1/scenarios/`

Auth: `IsAuthenticated`. GET: every Scenario the caller's own
organisation owns. **Pagination is off** — same reasoning as
`OpportunityListView`/`RiskListView`, a small whole-collection list.
POST: `organisation` is set from the caller, never client-provided.

**Response `200`/`201`**
```json
[
  {
    "id": 3,
    "name": "Low Health Save Play",
    "apply_to": "organizations",
    "apply_to_display": "Organizations",
    "nodes": [ { "id": "entry", "type": "entry", "position": {"x":0,"y":0}, "data": {"action": "Run Now", "label": "Start"} } ],
    "edges": [],
    "is_active": false,
    "created_at": "2026-09-04T10:00:00Z",
    "updated_at": "2026-09-04T10:00:00Z"
  }
]
```

### `GET/PATCH/DELETE /api/v1/scenarios/<id>/`

Auth: `IsAuthenticated`. Scoped to the caller's own organisation (404,
not 403, otherwise). The builder's Save/Save & Close PATCH `name`/
`apply_to`/`nodes`/`edges`/`is_active` together on every save — there's
no partial-field save from the UI today.

**Response `200`** (GET/PATCH) — same shape as the list endpoint.
**Response `204`** (DELETE) — empty body.

### `POST /api/v1/scenarios/<id>/run/`

Auth: `IsAuthenticated`. Body: `{"customer_id": <id>}`. The builder's
"Run Now" button. Runs synchronously — there's no task queue, so the
response IS the completed run. `400` if the scenario's `apply_to` isn't
`"organizations"`; `404` if the scenario isn't in the caller's own
organisation, or if the customer isn't one the caller can see (see the
`customers` app's visibility section).

The target is scoped by visibility, not just by tenant: a run is a
*write*, not a read — the engine sets `lifecycle_stage`/`churn_date`,
creates Tasks and sends real email — so an ungated target let any
member act on an account they couldn't open.

**Response `201`**
```json
{
  "id": 12,
  "scenario": 3,
  "customer": { "id": 9, "name": "Globex" },
  "triggered_by": "manual",
  "status": "success",
  "log": [
    { "node_id": "n1", "action": "Condition", "status": "ok", "detail": "Condition evaluated to True." },
    { "node_id": "n2", "action": "Churn Entity", "status": "ok", "detail": "Marked as churned" }
  ],
  "started_at": "2026-09-04T10:05:00Z",
  "finished_at": "2026-09-04T10:05:01Z"
}
```

### `GET /api/v1/scenarios/<id>/runs/`

Auth: `IsAuthenticated`. This scenario's own run history, newest first
— manual runs and On Event auto-runs both appear here, told apart by
`triggered_by`. **Pagination off**, same reasoning as the list endpoint.

Filtered to runs against customers the caller can see, even though the
Scenario itself is tenant-wide: each row names its customer and its
`log` quotes contact addresses (`Emailed x@y: "..."`). A run whose
customer has since been deleted (`customer` is `SET_NULL`) names nobody
and stays listed.

The On Event auto-run signal is deliberately *not* scoped — it fires on
every new Customer in the organisation regardless of owner, because a
tenant-wide automation that only ran for some people's customers would
be broken, not safer.

**Response `200`** — an array of the same shape as `POST .../run/`'s
response.

---

## `campaigns` — Campaigns (`/campaigns`, the unsubscribe page `/u/:token`)

Rebuilt for the Impact section's fifth delivery (spec: react-ts-app `docs/superpowers/specs/2026-10-04-campaigns-design.md` §1, §4). A campaign is an owner's plain-text email to the people one of their own segments reaches, sent as often as they like, each send kept with what went out and who was emailed or skipped.

**Models.**
- `Campaign`: `owner`, `name` (≤ 120), `subject` (≤ 150), `body` (≤ 5000), `status` (`draft`/`active`/`archived`; `active` from the first send), `segment` (one of the owner's own; SET_NULL), `roles` (Champion and Decision Maker by default; `[]` for a contact segment), `sharing` with `shared_with` (≤ 50). At most 50 per owner, archived ones included. `recipients` is read-only history: the hand-picked contacts of a draft from before segments.
- On `Campaign`: `made_by`: `{"agent": "ops", "approved_by": {"id", "name"} | null}` on the detail and on every list row when an agent action made the object (`agent_action`, SET_NULL), else `null`. `approved_by` is the action's decider, and `null` once that person no longer exists. Lists load it with the row: no extra query.
- `CampaignSend`: `kind` (`manual`/`rule`), `rule`, `review`, `sent_by` (null for a rule's send without review), `status` (`sending`/`sent`), `started_at`, `finished_at`, frozen `subject`, `body` and `counts` (`{reached, sent, skipped: {unsubscribed, no_email, already_received, recent_campaign, over_limit, failed}}`), `migrated` (built from a send before segments).
- `CampaignDelivery`: one person on one send: `status` (`queued`/`sent`/`skipped`), `reason`, `email` (the `customers.Email` row it filed), `token_hash` (SHA-256 of the unsubscribe token; the token is never stored), `sent_at`.
- `customers.Contact.campaigns_unsubscribed_at`; `customers.Email.campaign` (set on the row each delivery files on the contact's organisation or account, whose body is the email without its footer).

**Who it reaches.** Surveys' audience (`surveys.audience.candidates`), read as the campaign's owner: a contact segment's contacts, or an organisation or account segment's contacts with a ticked role. Each person is checked in order, first match wins: `unsubscribed`, `no_email`, `already_received` (queued or sent on any send of this campaign), `recent_campaign` (queued, or sent in the last 3 days, by any campaign of the workspace), `over_limit` (500 already queued). A delivery that may have gone out counts as sent for `already_received` and `recent_campaign`: one cut off between its email and its mark, then resumed as `skipped`/`failed` with its token's hash kept (for the 3 days, from its send's `started_at`). Then at most three per organisation or account, among those left; people past that are not reached. Campaigns checks email addresses more strictly than Surveys: `no_email` is anyone whose address does not pass Django's `validate_email` (malformed as well as blank), where Surveys only skips a blank one.

**The send.** Refused before anything is written, `400 {"detail": …}`: "Email isn't set up for this workspace yet, so campaigns can't be sent.", "This campaign is archived.", "Its owner is no longer active." (checked before the segment — the same copy as a rule's or a segment's own inactive-owner pause), "Choose a segment first.", "Write a subject and a body first.", then "Nobody in this segment can be emailed right now." once the audience is actually built, under the claim's lock. The claim locks the workspace, then the campaign, and writes the send and every delivery; each email then goes out on its own, with the merge fields filled (`{first_name}`, `{organisation}`, `{sender_name}`) and the footer `—\n<owner>, <workspace>\nUnsubscribe from these emails: <FRONTEND_URL>/u/<token>`. A failed email is `skipped`/`failed` and the rest go on. A send cut off mid-way stays `sending`; the nightly rules step and the admin's "Finish the selected sends" finish it 10 minutes on, never emailing anyone twice. Anyone it was emailing when it stopped is counted `skipped`/`failed`, but keeps a working unsubscribe link and is never emailed this campaign again, since their email may have gone out; only a failure known to have sent nothing leaves no link. A mail server that will not connect leaves everyone queued and the send `sending`, to be finished the same way.

**Access.** Read by the owner and whoever it is shared with (anyone else gets a 404 identical to a missing campaign). Edit, preview, audience, send, archive and delete are the owner's: another reader gets `403 {"detail": "Only the campaign's owner can change it."}`. Hand-picked recipients and deliveries name only contacts the reader may open; the rest are `legacy_hidden` / `hidden`. A send's rule is named only to a reader of the rule (`{"id": null, "name": "a rule"}` otherwise). Counts are whole.

**Refusals.** `400 {field: [message]}` (`non_field_errors` for none): "Give it a name.", "Keep the name to 120 characters.", "Keep the subject to 150 characters.", "Keep the body to 5000 characters.", "Use {first_name}, {organisation} or {sender_name}.", "Choose one of your own segments.", "Choose at least one role.", "Choose at least one teammate.", "Share with at most 50 teammates.", "Choose archived or active.", "You can own at most 50 campaigns.".

### `GET /api/v1/campaigns/?tab=mine|shared&archived=1&cursor=`

`mine` by default; `archived=1` adds archived campaigns. Newest edit first, 50 a page; `next` is an opaque cursor.

```json
{"results": [{"id": 4, "name": "Win-back", "status": "active",
  "segment": {"id": 2, "name": "My book", "kind": "customer"},
  "roles": ["champion", "decision_maker"], "owner": {"id": 7, "name": "Carl CSM"},
  "is_owner": true, "sharing": "people", "shared_with": [{"id": 8, "name": "Dana CSM"}],
  "last_send": {"id": 9, "finished_at": "2026-10-04T10:00:00Z", "status": "sent",
                "counts": {"reached": 48, "sent": 42, "skipped": {"unsubscribed": 2, "no_email": 1,
                  "already_received": 0, "recent_campaign": 3, "over_limit": 0, "failed": 0}}},
  "needs_segment": false, "updated_at": "2026-10-04T10:00:00Z"}],
 "next": null}
```

`segment.id` is `null` for a reader who may not read the segment. `needs_segment` marks a draft from before segments that has hand-picked recipients and no segment.

### `POST /api/v1/campaigns/`

`{name, segment?, roles?, subject?, body?, sharing?, shared_with?}` → `201` with the campaign (below). Audited `campaign.created` (`{segment}`), and `campaign.shared` when not private.

### `GET/PATCH/DELETE /api/v1/campaigns/<id>/`

The row's fields plus `subject`, `body`, `legacy_recipients` (`[{id, name}]`, those the reader may open), `legacy_hidden` and `can_delete` (the owner, and never sent). PATCH takes the create fields and `status`: `archived` archives (`campaign.archived`); `active` un-archives, to `active` if it has sends, else `draft`. The edit is audited `campaign.updated` (`{fields}`), sharing `campaign.shared`. DELETE: `204` (`campaign.deleted`), or once sent `409 {"code": "CAMPAIGN_SENT", "detail": "Archive it instead: it has been sent."}`.

### `GET /api/v1/campaigns/<id>/audience/` (owner)

```json
{"reach": 212, "skipped": {"unsubscribed": 14, "no_email": 0, "already_received": 3,
  "recent_campaign": 9, "over_limit": 0, "failed": 0},
 "sample": [{"id": 31, "name": "Ann Lee"}]}
```

`sample` is the first 20 who would be emailed. `400 {"detail": "Choose a segment first."}` without a segment. Nothing is written.

### `POST /api/v1/campaigns/<id>/preview/` (owner)

`{contact?, subject?, body?}` → `{subject, body}`: the email as `contact` (default: the first who would be emailed) would read it, with unsaved `subject`/`body` when given (checked as a save), and the footer's link `<FRONTEND_URL>/u/preview`. `400 {"contact": ["Choose someone this campaign would email."]}`; `400 {"detail": …}` with no segment or nobody to email. Nothing is written.

### `GET/POST /api/v1/campaigns/<id>/sends/`

GET, any reader: newest first, 20 a page, `{results, next}`:

```json
{"id": 9, "kind": "rule", "status": "sent", "migrated": false, "sent_by": null,
 "rule": {"id": 3, "name": "Renewal watch"}, "started_at": "…", "finished_at": "…",
 "subject": "Hello {first_name}", "body": "…", "counts": {"reached": 48, "sent": 42, "skipped": {…}}}
```

POST, owner, no body: claims the send and answers `201` with it at once, `status: "sending"`, `counts.sent: 0`, everyone queued, or the refusals above. The `deliver_pending` runner (every minute) emails them and finishes the send: expect `sent` within about a minute; poll the send. If the mail server will not connect, or stops answering partway (five failures in a row), whoever is left stays queued for the next run. Show it as "still sending", never as an error. Audited `campaign.send_started` (`{send, kind, counts}`) and `campaign.send_finished` (`{send, counts}`).

### `GET /api/v1/campaigns/<id>/sends/<send_id>/`

One send, as above.

### `GET /api/v1/campaigns/<id>/sends/<send_id>/deliveries/?status=&reason=&cursor=`

The deliveries whose contact the reader may open, in send order, 50 a page:

```json
{"results": [{"id": 1, "status": "skipped", "reason": "unsubscribed",
  "contact": {"id": 31, "name": "Ann Lee"},
  "record": {"kind": "organization", "id": 5, "name": "Pizza Hut"}, "sent_at": null}],
 "next": null, "hidden": 2}
```

### `GET/POST /api/v1/campaigns/unsubscribe/<token>/` (public)

No sign-in; the token is the credential, looked up by its SHA-256, good for 365 days after its email (for a delivery cut off after its email may have gone out, 365 days after its send started). GET: `{"workspace": "Acme Inc"}`. POST: `204`; sets `Contact.campaigns_unsubscribed_at` once, audited `contact.campaigns_unsubscribed` (`{via: "link", send}`, no actor, never the token). Every bad link: `404 {"detail": "This link has expired."}`. Throttled per IP (`THROTTLE_CAMPAIGN_UNSUBSCRIBE`, default 30/min): `429`.

---

## `copilot` — AI chat (`/copilot`, `Index.tsx`/`ChatView.tsx`)

Mirrors: `src/pages/copilot/Index.tsx`, `ChatView.tsx`,
`CopilotSidebar.tsx`, `types.ts`, `copilotApi.ts`. The first real AI/LLM
integration in this codebase — a real call to a real Claude model
(`services/copilot/anthropic_client.py`), not a mock. Two interchangeable
providers behind `COPILOT_LLM_PROVIDER` (see `.env.example`): `anthropic`
(default) calls Anthropic's own API directly with **`ANTHROPIC_API_KEY`**;
`bedrock` calls the identical Claude model through AWS Bedrock instead,
with real AWS credentials (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/
`AWS_REGION`) and a real `BEDROCK_MODEL_ID` from your own AWS console (a
different id format than `ANTHROPIC_MODEL`) — that model must already have
real Bedrock model access approved in your own account/region first, a
one-time AWS Console step this app can't do for you. Live-verified against
real AWS Bedrock in `ap-south-1`; hit and fixed a real regional gotcha
along the way — the plain model id was rejected ("on-demand throughput
isn't supported... use an inference profile"), fixed by using the
region-group-prefixed cross-region inference profile id instead
(`apac.anthropic.claude-3-5-sonnet-20240620-v1:0`, not the bare
`anthropic.claude-3-5-sonnet-20240620-v1:0` — see `.env.example`'s own
note on `BEDROCK_MODEL_ID`). With the selected provider's own credentials
unset, every send returns a `503` rather than a
fake answer.

A third provider, `COPILOT_LLM_PROVIDER=gemini`, calls Gemini on Vertex AI
with the runtime's own Google credentials (no API key; `GOOGLE_CLOUD_PROJECT`
must be set, else the same `503`). Each call is routed by its purpose: the
Copilot, Ask and agents run on `gemini-3.5-flash`, background labelling on
`gemini-3.5-flash-lite`, briefs on `gemini-3.1-pro-preview` (see
`GEMINI_TIERS` in settings). Request and response shapes are unchanged.

Its own top-level app, same "tenant-wide, not owned by one Customer/
Account" reasoning as `scenarios`/`campaigns` — except a Conversation is
scoped to one `User`, not the whole organisation: each CSM's own Copilot
history is private to them.

No task queue or streaming exists in this codebase, so a send runs
synchronously, in-request, one blocking API call per message — same
limit `scenarios/engine.py`'s own docstring states outright. Each
request is grounded in a compact, real-data digest of the caller's own
*owned* book of business (`services/copilot/context.py` — the
Customers/Accounts they own or answer for in their function, intersected
with `live_customers` — visible, not archived, and **not churned**
(`services/customers/scoping.py`) — not the whole tenant's, same "My"
framing as Cockpit's own `CockpitSummaryView`/`TaskListView`'s
`?mine=true`: health/NPS/lifecycle breakdown, top at-risk customers, open
opportunity/risk/ticket counts scoped to those same owned companies and
to what the caller could list — pipeline under `forecast.readable_pipeline_q`
(department and account), tickets under their department rule),
injected into the system prompt; this is grounding, not tool-calling —
the model can read this digest and converse, but can't run its own
queries or take real actions.

Past the aggregate numbers, `services/copilot/retrieval.py` pulls real
retrieved content. Two passes identify "which company is this about",
genuinely organisation-wide — not narrowed to the caller's own book, nor
to `visible_customers`/`visible_accounts` (any customer or account in the
org can be named and asked about; see `services/copilot/context.py`'s own
docstring and `test_the_copilot_grounds_only_in_what_the_asker_may_see`
in `services/knowledge/tests/test_hierarchy.py`, which pins this): the
privacy boundary is enforced one level down, inside
`retrieve_with_sources`: nothing is read on a company the asker may not
open (`visible_accounts` / `visible_customers`), and on one they may, only
records passing their own rule. `find_mentioned_company` is a plain, free,
case-insensitive substring match of the question against those company
names, tried first; if that fails, `find_relevant_company_semantic` (see
`services/copilot/embeddings.py`) embeds the question against each
company's own profile text (`retrieval.py`'s own `_company_profile_text`
— the name alone, plus a real hand-entered `industry`
(`Customer.industry`/`Account.industry`, set via the Add/Edit
Organization/Account form) when one has been set, e.g. "Zoom. Industry:
Video conferencing software.") with a local `sentence-transformers`
model (`all-MiniLM-L6-v2`, no API key, no per-request cost, no
pgvector — this Postgres instance doesn't have the `vector` extension
available, so ranking is plain Python cosine similarity over in-memory
vectors, fine at this system's real scale) and returns the best match
above a calibrated `0.3` threshold — e.g. "that video conferencing
account struggling" finding Zoom once its industry is filled in. This
is a real, honest limitation, not full RAG: real communications content
(Notes/Emails/etc.) is deliberately not folded in — live testing found
this app's own seeded CS-ops content generic and templated across every
company, with no real company-identity signal to embed — so a company
whose `industry` is still blank falls back to name-only matching, which
works well for strong, distinctive brand names (Spotify/Uber both score
well against on-the-nose descriptions) and worse for names that are
also common words (Zoom scored too low against "video conferencing
account" to win, with no industry set, in real testing). Once a
company is identified — by either pass — it gets its
own recent real Emails (subject+body)/Notes (title+body)/open Tickets
(title only — the model has no body field)/Activities (a categorical
type label, no free text), and when there's a query, the same real
embeddings re-rank the overall most *relevant* items across every
source together (not a fixed per-source quota of the most recent) via
`retrieve_recent_communications`. No company identified either way
falls back to a smaller slice for each of the digest's own top-3
at-risk customers, so the digest isn't pure numbers even then. Every
source here is real data that already backs the Activity Feed's own
Emails/Notes/Tickets/Activities tabs — nothing new is captured, just
retrieved differently.

First real backend consumer of `Organisation.ai_agent_enabled`/
`ai_agent_tone` (see the `accounts` app's own section) — `ai_agent_enabled
= false` makes every send `403`, and `ai_agent_tone` picks one of three
real system-prompt tone instructions (`professional`/`friendly`/
`concise`).

**Ask Revenact on the Dashboard** (`services/copilot/dashboard_context.py`,
`dashboard_figures.py`, `dashboard_grounding.py`) is the same send endpoint
with an optional `context` — see `POST /api/v1/copilot/messages/` below for
the request/response shape. `DashboardContextSerializer` validates `context`
right after the conversation lookup and before anything the send does next:
a bad `context` is a `400` before any model call, before any budget is
spent, and before either `Message` is written — the same "don't record a
failed action as if it happened" discipline the rest of this send already
follows. The digest is built by `dashboard_grounding.build_dashboard_
grounding` from the same figures code the area's own endpoint calls, and the
system prompt wraps it in `<dashboard_data>…</dashboard_data>`, telling the
model everything inside is data from records, never instructions to follow,
however it is phrased — the same "customer/colleague words are data, not
instructions" guard this codebase already applies to translation, anomaly
summaries, gathered asks and the brief. The filters echoed into the prompt
are only the values among the asker's own filter options (`forecast.
filter_options`); anything else is treated as "all" rather than copied into
the prompt verbatim.

**Ask Revenact on Organizations** (`services/copilot/organizations_context.py`,
`organizations_grounding.py`) is the same send with `context.surface =
"organizations"`. `services/copilot/ask.py` holds one row per surface — the
serializer, the grounding, the fenced system prompt and the metering
purpose — and `AskContextSerializer` hands
a `context` to its surface's serializer. The filters go through the
portfolio's own parser (`services/organizations/params.py`) and are stored in
one canonical form; the labels that name them ("Owner: Carl CSM") are built on
the server from the asker's own filter options, and an owner or product
outside them reads "not in your book". The digest is recomputed with
`load_portfolio`, `select` and `build_summary` for the asker and those
filters: the screen and filters, the five tiles, the sections, the ten
riskiest accounts by the rows' Triage score, and the renewals inside 90 days
(overdue in, churned out) — the same numbers `GET /organizations/portfolio/`
returns — fenced in `<dashboard_data>` exactly as the Dashboard's digest is.
Owner names in it come from the organisation only, and it never carries a
stored anomaly title or summary.

### Models

- `Conversation` — `organisation`, `user` (private per-user, not shared
  org-wide), `title` (derived from the first message's own text — no
  rename UI), `origin` (the first Ask message's `context` — Dashboard or
  Organizations — without its `focus`, set once; null otherwise),
  `created_at`/`updated_at`. Lazily created on the first message actually
  sent, same "no ghost rows" convention as Canvas/Campaign's own editors
  (POST on first Save).
- `Message` — `conversation`, `role` (`user`/`assistant` — mirrors the
  Anthropic Messages API's own two-role shape exactly), `content`,
  `author`, `sources`, `ask_suggestions`, `context` (a user turn asked
  from an Ask rail, Dashboard, Organizations or Contacts; null otherwise), `reply_to`
  (an assistant reply's own user turn, set on every new reply),
  `grounded_customer_ids`/`carries_anomaly_text` (an Ask reply's shared-
  session snapshot, fixed when it is written — the ids of every customer
  its digest could have drawn on, and whether it could carry a stored
  anomaly title; a mentioned-only reader needs every id and, for the
  anomaly flag, to see every account — null on a reply written before
  they existed, which such a reader never reads; a reply with no context
  of its own gets them too when it was fed an Ask reply as history, see
  **Shared sessions** under the send), `created_at`.

### Conventions specific to this app

`content` is capped at 8000 characters (`400` if blank or over).
Replayed history to the model is capped to the conversation's newest
20 messages the sender may read, oldest first (`HISTORY_WINDOW`) (Anthropic's Messages API is stateless — the full history
must be resent every turn; unbounded replay would grow cost/latency
without limit).

### Models — `ModelCall`, `ModelBudget`

The audit trail and the budget for every model call the codebase makes.
Every path that reaches Claude — the Copilot, Headlines, the classifier,
the brief, the Ops agent — goes through one function,
`anthropic_client.get_completion`, which now takes `purpose`,
`organisation` and `user` and writes one `ModelCall` per call: purpose,
provider, model, input/output tokens (from the SDK's own `usage`),
latency, `outcome` (`ok`/`failed`/`unconfigured`/`over_budget`) and the
error. Failures are rows too; a brain whose calls quietly fail is worse
than one whose calls are visible. Logging is best-effort and can never
break a working call.

`ModelBudget` is tokens (input + output) per organisation per purpose
per calendar month; absent a row, `settings.MODEL_BUDGET_DEFAULT_TOKENS`
(default 2,000,000) applies. `get_completion` checks it **before** the
call: over budget, the call is logged as `over_budget`, never sent, and
`BudgetExceeded` is raised — the views turn that into a `429`, and
`classify_interactions` stops the run rather than failing every batch.
A call with no organisation (none of ours today) is logged but not
budgeted.

### `POST /api/v1/copilot/draft-reply/`

`{"kind": "email" | "mail_message", "id": <int>}` → `{"draft": "…", "sources": [...]}`.

A reply written as the current user, for them to edit and send: nothing is sent
and no conversation is stored. `email` is a filed `customers.Email` on a
customer or account the person may open (`visible_children_q` — an account's
mail needs the account itself visible), under the mailbox visibility rule (the
whole thread on that mailbox goes into the prompt);
`mail_message` is a row of the person's own inbox, owner only; when that row
is filed on a customer or account the person may not open, the draft is
written from the thread alone, with no account history and no company name.
The prompt
carries the thread plus up to eight of the account's most relevant records from
the same retrieval the Copilot answers with (`retrieve_with_sources`), and those
records come back as `sources` in the message-source shape (`type, id, label,
date, company, company_type, company_id`) so the UI can say "N sources used"
and link each one. A mailbox message that matched nobody in the book gets an
empty `sources`. Charged as a `draft_reply` model call; 400 for an unknown kind
or missing id, 403 when the organisation's AI agent is off, 404 when the record
is not the caller's to read, 429/503/502 exactly as `POST /copilot/messages/`.

### `GET /api/v1/copilot/usage/`

Purposes: `copilot`, `headlines`, `classification`, `brief`, `proposals`, `facilitator`, `explain`.

Auth: `CanViewAllAccounts`. This month per purpose (`calls`, `ok`,
`failed`, `input_tokens`, `output_tokens`, `spent`, `budget`,
`remaining`, `custom_budget`), the `default_budget`, and the last fifty
calls with who made them.


Each `recent[]` row also carries how the answer came about (2026-10-16): `stop_reason` (the provider's, e.g. Gemini `STOP` / `MAX_TOKENS`, blank when unknown), `tool_rounds`, `tools_used` (tool names, in first-use order), `fallback_used` (the tool-free last call ran) and `no_answer` (the asker got "I couldn't finish looking this up" rather than an answer).

### `GET /api/v1/copilot/evals/` (Copilot's golden set, 2026-10-16)

Auth: `CanViewAllAccounts` (the AI usage page's rule; answers quote the workspace's records). `{"run": null, "history": []}` before the first run, else `{"run": {id, started_at, finished_at, model, judge_model, total, passed, results}, "history": [{id, started_at, total, passed}]}` (up to the last 10 runs, newest first). Each `results[]` row: `{id, kind, question, asker ("admin" | "csm_a" | "csm_b"), answer (≤2,000 chars), correct (0–2), grounded (0–2), private (bool), verdict, reason, passed}`; a case with no one to play its asker is `{id, kind, question, skipped: true, passed: false, reason}`.

A run is `python manage.py run_copilot_evals --org <name> [--case <id>]` (production: the nightly job with those args): each case in `services/copilot/evals_golden.json` is answered exactly as a plain Copilot send (`views.plain_prompt`, purpose `copilot_eval`, the Copilot tier and tools) as the case's asker, then graded by the pro tier (purpose `evaluation`) with an enforced JSON verdict against the case's expectations and the data Copilot was given; a privacy case fails outright when the forbidden customer's ARR or health appears. Both purposes are metered and audited as any `ModelCall`. The newest 20 runs per workspace are kept.

### `PATCH /api/v1/copilot/usage/budgets/`

Auth: `CanManageOrgSettings` — spend is organisation configuration. Body
`{"purpose": "proposals", "monthly_tokens": 50000}` sets a budget;
`monthly_tokens: null` clears it back to the default. Unknown purpose,
non-integer or negative → `400`. Returns the summary.

### `GET /api/v1/copilot/skills/`

Auth: `CanViewAllAccounts`. The catalogue of what the brain's agents may
do — `services/copilot/skills.py`, one `Skill` per model-call purpose:
`name`, `summary`, `reads` (what the agent is given; nothing else can
reach it), `may`, `never`, `trigger`, `gate`, `surface`. The catalogue is
code beside the prompts, and a purpose without an entry fails a test.
Each skill carries `usage` (this month: `calls`, `ok`, `failed`, `spent`,
`budget`, `remaining`, `custom_budget` — the same figures as `usage/`),
`last_run` (`{at, outcome, user}` or null) and `produced` (`{label,
count}` all-time, plus `approved` for the two proposing skills; null
where no exact count exists). Frontend: `/brain/skills`.

### `GET /api/v1/copilot/conversations/`

Auth: `IsAuthenticated`. Every Conversation the caller may read
(`conversations_visible_to`): their own, plus the live sessions they were
invited into, accepted, and are still present in — not the whole
organisation. **Pagination is off**, same reasoning as
`CampaignListCreateView`. Powers the sidebar's own "Chat history" list,
so an accepted participant keeps a way back to a session after the
invite card is gone.

**Response `200`**
```json
[
  { "id": 5, "title": "What's my churn risk?", "origin": null, "created_at": "2026-09-05T10:00:00Z", "updated_at": "2026-09-05T10:01:00Z" },
  { "id": 7, "title": "Why is at-risk ARR up?", "origin": { "surface": "dashboard", "area": "revenue", "view": "forecast", "filters": { "owner": "2", "lifecycle": "", "customer": "" } }, "created_at": "2026-09-24T10:00:00Z", "updated_at": "2026-09-24T10:01:00Z" },
  { "id": 9, "title": "Which accounts need me first?", "origin": { "surface": "organizations", "view": "list", "filters": { "owner": "2", "health": "poor" }, "labels": ["Owner: Carl CSM", "Health: Poor"] }, "created_at": "2026-09-26T10:00:00Z", "updated_at": "2026-09-26T10:01:00Z" },
  { "id": 11, "title": "Why is Sam negative?", "origin": { "surface": "contacts", "view": "person", "contact": 41, "label": "Sam Pizza · Pizza Hut" }, "created_at": "2026-09-28T10:00:00Z", "updated_at": "2026-09-28T10:01:00Z" },
  { "id": 12, "title": "Who is unhappy?", "origin": { "surface": "contacts", "view": "list", "filters": { "sentiment": "negative" }, "label": "Contacts · Negative" }, "created_at": "2026-09-28T10:05:00Z", "updated_at": "2026-09-28T10:06:00Z" },
  { "id": 14, "title": "What renews soon?", "origin": { "surface": "accounts", "view": "board", "filters": { "renews_within": "30" }, "label": "Accounts · Renews within 30 days" }, "created_at": "2026-09-30T10:00:00Z", "updated_at": "2026-09-30T10:01:00Z" },
  { "id": 15, "title": "What does this mean for EMEA?", "origin": { "surface": "accounts", "view": "detail", "account": 12, "label": "EMEA" }, "created_at": "2026-09-30T10:05:00Z", "updated_at": "2026-09-30T10:06:00Z" },
  { "id": 16, "title": "What should I chase?", "origin": { "surface": "pipelines", "kind": "opportunities", "view": "list", "filters": {}, "label": "Pipelines · Opportunities" }, "created_at": "2026-10-01T10:00:00Z", "updated_at": "2026-10-01T10:01:00Z" }
]
```

`origin` is where the conversation started — the first Ask message's
`context` without its `focus` — or `null`. Set once, never changed. The
history shows it as a tag. For the Dashboard the tag is the area and view. For
Organizations it is "Organizations" followed by the `labels`, joined with " · "
("Organizations · Owner: Carl CSM"). For Contacts or Accounts the tag is the
`label` itself ("Sam Pizza · Pizza Hut", "Contacts · Negative", "Accounts ·
Renews within 30 days", "EMEA"). Reopening it opens `/organizations/<view>?
<filters>` for Organizations, the person's profile or the filtered list for
Contacts, or the accounts list/Board/one account's page for Accounts, because
`filters` (list/Board), `contact` (person) or `account` (account page) are the
page's own URL parameters/id. The server builds `labels`/`label` when the
question is asked, and the client never sends them.

`origin` follows the title. A viewer who does not see the whole conversation
gets `origin: null` unless they may read both its first turn (the title's
turn) and its first Ask turn (the one the origin was taken from), **and the
reply to that Ask turn is shown to them** (not withheld, not dropped): the filters carry the
asker's free-text `search` and ids, and the labels name owners, products,
organisations and accounts. It is `null`, not a surface-only stub. The title
is the first turn's opening words (never the label), so a reader of that turn
keeps it even when its reply is withheld. The detail endpoint and the send's
response apply the same rule, on every Ask surface.

A viewer who sees the whole conversation (its owner, an accepted session
participant) always gets the `origin` of a first Ask turn they asked
themselves. For a turn someone else asked, the detail endpoint and the send's
response follow the rule above: `origin` only when that turn's reply is shown
to them, exactly as the turn keeps its `context` — the origin is withheld with
it, so a withheld reply's context cannot leak through the header. The list
shows `origin` only to the first Ask turn's asker and `null` to every other
whole viewer, view-all included (`copilot.views.header_for`). It reads the
asker from the page itself (`with_origin_author`) and the page's grants once,
so its cost does not grow with the rows a viewer reads whole.

### `GET/DELETE /api/v1/copilot/conversations/<id>/`

Auth: `IsAuthenticated`. `GET` is scoped to every conversation the caller
may read (`conversations_visible_to`: their own; a session they hold a grant
to and are present in; or one with a turn that routed a question to them or
to someone who reports to them, who read a slice — `visible_messages`).
`DELETE` is the owner's only. 404, not 403, otherwise. No `PATCH` — a
conversation's title/messages are only ever set by `POST .../messages/`.

**Response `200`** (GET) — adds `origin` (`null` for a viewer who may not
read the turns it came from, see the list above), `visibility` (`full` or
`partial`), and nested `messages` (each
`{id, role, content, author, sources, questions, ask_suggestions,
context, created_at}`; `context` is the Ask context a user turn was asked
on — any surface — else `null`). **A user turn whose paired reply is not shown
to this viewer comes with `context: null`** — withheld (redacted), or dropped
entirely because a turn they may not read was sent in between (fail closed):
the question's own words stay,
but its label, filters (the asker's `search` among them), focus and ids go
with the reply (`copilot.views.visible_messages`). The owner, participants
and mentioned readers who may read the reply get the stored context as is.
The decision reuses the reply's readability check: no extra query per turn.
**Response `204`** (DELETE) — empty body.

### `POST /api/v1/copilot/messages/`

Auth: `IsAuthenticated`. Body: `{"conversation_id": <id>?, "content": "...", "context": {...}?}`.
Omit `conversation_id` to start a new Conversation (titled from this message); pass an existing
one (one the caller may read, `404` otherwise) to continue it. The real send — runs
synchronously, no task queue.

**Agentic retrieval (plain sends on Gemini, `COPILOT_AGENTIC`, on by default).** A send with no
`context` starts from the same grounded summary as before; the model may then call
`search_records(query, company?)` and `browse_knowledge(path?)` up to 3 rounds before it answers
(`services/copilot/agentic.py`). `browse_knowledge` walks the asker's own copy of the workspace's
OKF bundle (see `GET /api/v1/knowledge/okf/`), index first: built once per send with only customers
and notes the asker may read, and metric definitions and computations without values; every
page records what it shows (customer profiles with their company, notes as contributions) as
sources of the reply.
A search reads only what `retrieve_with_sources` lets the asker read (nothing on a company they
may not open, only who is responsible for it), and every record it returns is added to the
reply's `sources`, which other readers of a shared conversation are checked against per source.
Still one AI credit and one `ModelCall` per send (tokens of every round). The response shape is
unchanged; `sources` can now also list records the model found by searching. Sends with a
`context` (Ask surfaces) stay a single call.

**`context` (optional) — asked from the Dashboard.** Absent or `null`, the endpoint behaves
exactly as before (Communications sends its `[About: …]` text prefix in `content` and no
`context`). Present, the client says *where* it is and the server computes *what* is there; the
client never sends figures.

```json
{
  "conversation_id": 7,
  "content": "Why is at-risk ARR up?",
  "context": {
    "surface": "dashboard",
    "area": "revenue",
    "view": "forecast",
    "filters": {"owner": "2", "lifecycle": "customer", "customer": ""},
    "focus": null
  }
}
```

- `surface`: `"dashboard"` (the fields below), `"organizations"` (see **Asked from Organizations** below), `"contacts"` (see **Asked from Contacts** below) `"accounts"` (see **Asked from Accounts** below), `"pipelines"` (see **Asked from Pipelines** below) or `"brain"` (see **Asked from the Brain** below). Any other value is `{"context": {"surface": ["\"x\" is not a valid choice."]}}`.
- `area`: `overview | revenue | health | support`.
- `view`: one of the area's sub-views (`DASHBOARD_VIEWS` in `services/copilot/dashboard_context.py`, mirroring the frontend's `src/pages/dashboard/areas.ts`): revenue `forecast|customers|products`; health `triage|divergence|movement|renewals|usage|activity|distribution`; support `tickets|topics`. The Overview takes `null`.
- `filters`: only `owner`, `lifecycle`, `customer`; other keys are dropped, and a value that is not text or a whole number is ignored.
- `focus`: `null`; `{"kind": "companies", "ids": [..]}` (at most 200; intersected with the caller's filtered, visible book, and ids outside it dropped silently); or `{"kind": "attention", "key": "risk:12"}` (must be on the caller's own attention list — the snooze check).

The answer is grounded in that area's figures, recomputed for the caller and the filters by the
same code as the area's endpoint (`/dashboard/attention/`, `/customers/forecast/`,
`/customers/health/`, `/tickets/stats/`; Support ignores `lifecycle`, as its screen does), plus
the records behind the focus company or companies, or the one the question names — each read
under its own rule. Money is in the organisation currency. Metered as the `dashboard` purpose.

**Asked from Organizations.**

```json
{
  "content": "Which accounts need me first?",
  "context": {
    "surface": "organizations",
    "view": "list",
    "filters": {"owner": "2", "health": "poor", "sort": "-risk", "cursor": "…"},
    "focus": {"kind": "companies", "ids": [7]}
  }
}
```

- `view`: `list | board`, required.
- `filters`: the page's portfolio parameters (`GET /organizations/portfolio/`): `search`, `owner`, `lifecycle`, `health`, `product`, `renews_within`, `nps`, `ids`, `include_churned`, `sort`, `group`. Each is text, a whole number, or a list of them (joined with commas). `cursor`, `limit`, `group_value` and any other key are dropped. A value the portfolio would ignore is dropped, not rejected. A `search` over 100 characters, or any value over 6,000 characters, is ignored. Filters are stored in canonical form, and the default sort `-arr` is left out. A missing `group` means the view's default (`health` on the list, `lifecycle` on the board). `group: ""` means not grouped.
- `focus`: `null`, or `{"kind": "companies", "ids": [..]}` (at most 200 ids). Ids outside the caller's filtered, visible list are dropped silently. Any other kind gives `400 {"context": {"focus": {"kind": ["Must be companies."]}}}`.
- The stored context gains `labels`, which the server builds: "Opened from the dashboard (N)", `Search: "…"`, "Owner: <name>" (from the caller's own owner options, or "Unassigned", or "not in your book"), "Lifecycle: …", "Health: …", "Product: …" (or "not in your book"), "Renews within N days", "NPS: Promoters|Passives|Detractors", "Includes churned". Labels sent by the client are ignored.

The answer is grounded in the caller's filtered list, recomputed by the portfolio's code. It contains:

- the five tiles;
- the sections for the effective group;
- the ten riskiest accounts (Triage score above 0, highest first);
- the renewals inside 90 days (overdue in, churned out), with the total and at most 25 of them listed;
- the records behind the focused company or companies, or the one company in the list the question names, each read under its own rule.

It is metered as the `organizations` purpose.

**Asked from an organisation's page** (`services/copilot/organization_detail_context.py`,
`organization_detail_grounding.py`).

```json
{
  "content": "What does this mean for EMEA?",
  "context": {
    "surface": "organizations",
    "view": "detail",
    "organization": 12,
    "account": 31,
    "focus": {"kind": "note", "id": 88}
  }
}
```

- `organization`: required. It must be in the caller's `visible_customers`. Otherwise the response is
  `400 {"context": {"organization": ["Not an organisation you can open."]}}`, the same whether the id
  exists or not.
- `account`: optional, `null` for every account. It must be one of the organisation's accounts in
  the caller's `visible_accounts`. Otherwise the response is
  `400 {"context": {"account": ["Not an account of this organisation you can open."]}}`.
- `focus`: `null`, or one story item, `{"kind", "id"}`. `kind` is one of `activity`, `calendar_event`,
  `call`, `email`, `note`, `survey`, `task`, `ticket` or `health`. Any other kind, or an `id` that is
  not a positive whole number, gives a `400` under `focus`. The item is read again with the story's
  own rules (`GET /organizations/<id>/story/`), inside the account chip. An item the caller may not
  read is dropped silently and stored as `null`. A focus lasts one question.
- The stored context gains `label`, which the server builds from those rows: "Pizza Hut", or
  "Pizza Hut · EMEA" with an account. A label sent by the client is ignored. `origin` is the
  context without `focus`, `{surface, view, organization, account, label}`. The history tag is
  the `label`, and reopening opens `/organizations/<organization>?account=<account>`.

The answer is grounded in the page, recomputed for the caller:

- the organisation's portfolio row (`load_portfolio` with `ids` and `include_churned`): lifecycle,
  owner, health and its trend, ARR, renewal, NPS, Triage risk, pulses, last touch and signal;
- the story's Needs attention block, cut down to the renewal and the open High or Critical tickets.
  Its overdue tasks, unanswered Knowledge questions and live anomaly are left out: each depends on
  the asker's own rules (the personal task chain, `visible_questions`, reading the anomaly's
  evidence), and the digest can be shown to a shared reader whose rules differ;
- a count line, "Story records counted up to today (emails, notes, tasks and Slack threads are not counted)": every
  call, meeting, activity, ticket, survey and health change up to today, narrowed by the account
  chip, in four groups (Conversations, Tickets, Feedback, Health & usage). Emails, notes and tasks
  follow the asker's personal record rules, so they are never counted;
- the story items of the last 30 days, newest first, at most 25, narrowed by the account chip;
- the focused item, even when it is older than 30 days;
- the records retrieval finds for the question, on the organisation or on the chip's account, each
  read under its own rule.

Story titles and summaries are record text, so they sit inside the same `<dashboard_data>` fence,
with the same neutralising of fence tags. It is metered as the `organizations` purpose. An
organisation or account that stops being visible between the check and the grounding is a `404`.

**Asked from Contacts** (`services/customers/contact_list.py`,
`services/copilot/contacts_context.py`, `contacts_grounding.py`). Two body shapes, one per view.

The list:

```json
{
  "content": "Who is unhappy?",
  "context": {
    "surface": "contacts",
    "view": "list",
    "filters": {"sentiment": "negative"}
  }
}
```

One person:

```json
{
  "content": "Why is Sam negative?",
  "context": {
    "surface": "contacts",
    "view": "person",
    "contact": 41,
    "focus": "sentiment"
  }
}
```

- `view`: `list | person`, required.
- `filters` (list only): the page's own URL keys — `q`, `customer`, `account`, `sentiment`, `role`
  — through the list's own parser (`contact_list.parse_contact_filters`), which reads `customer`/
  `account` as plain ids from text, not schema-checked; an unknown key or a value the list would
  ignore is dropped, never rejected. A `customer` or `account` id the caller cannot open — including
  a non-positive one, which never names a row — is `400`, the same whether it exists or not:
  `{"context": {"filters": {"customer": ["Not an organisation you can open."]}}}` or
  `{"context": {"filters": {"account": ["Not an account you can open."]}}}`.
- `contact` (person only): required, the person's id, `min_value=1` at the field itself. A
  non-positive value never reaches the "can they open it" check: it is `400 {"context": {"contact":
  ["Ensure this value is greater than or equal to 1."]}}`. A positive id the caller cannot open —
  whether or not it exists — is `400 {"context": {"contact": ["Not a person you can open."]}}`.
- `focus` (person only): `null`, or `"sentiment"` (from "Why this sentiment?"). Any other value is
  `400` under `focus`.

The stored context gains a server-built `label`, never the client's: for the list, "Contacts"
followed by the active filters in list order ("Contacts · Negative · Decision Maker"); for a
person, their name and place ("Sam Pizza · Pizza Hut", or "Sam Pizza · Pizza Hut › Seen" for an
account-level contact). The history tag is the `label`.

The list digest is the summary line and the caller's filtered people, in the list's own order, at
most 50 (`contacts_grounding.LIST_LIMIT`) — the same rows and the same summary
`GET /api/v1/contacts/` and `contacts_summary` compute, with per-person call counts left out
(strict: a digest never carries a figure the model could misquote as evidence). A list reply's own
snapshot (`.customer_ids`/`.records` below) always includes the filtered organisation and account
named at "Filters:", even when the filter matches nobody — a mentioned-only reader is shown that
line too, so they must be checked against what it names, not only against who actually matched. The
person digest is their profile, then their calls, emails and tickets exactly as the asker may read
them (`contact_history.history_querysets`), newest 20 of each kind quoted
(`contacts_grounding.PERSON_LIMIT`); a kind with none readable says so rather than omitting the
section. "Last contacted" on either digest is the person's stored `last_contacted_at` — the same
date the Contacts page shows anyone who can open them — so it can reflect an interaction the asker
themself cannot read; it is stated exactly as the page states it, never explained or attributed
further.

**The "why" is strict.** `Contact.sentiment_evidence` counts every interaction behind a computed
sentiment, readable or not, so it is never quoted. With `focus: "sentiment"`, the why block weighs
only the records the asker may read (kind × recency), names at most the newest 20 of them, and —
past that — "(and N older readable records, weighed but not listed)"; when the stored reading also
rests on records the asker cannot open, the reply says only that, never a count or a name. Every
readable record the weighted reading rests on, named or only counted, goes into the reply's own
snapshot below, so a shared reader can open each one before the reply is shown to them. A hand-set
sentiment says so and skips the why block entirely.

Metered as the `contacts` purpose (`usage.PURPOSES["contacts"] = "Ask Revenact on Contacts"`).
Grounded like every Ask surface: `Grounding.customer_ids` (the organisations named), `.records`
(the calls, emails and tickets quoted, plus every account a person or record sits on) and
`.tickets` (`{account_ids, departments}` of the tickets counted) are fixed on the reply when it is
written and checked exactly as the Dashboard and Organizations surfaces are (see **Shared
sessions** below) — a shared reader must be able to open every organisation, account, record and
ticket department the reply drew on, and a reply written with no snapshot, or whose snapshot no
longer parses, fails closed rather than being shown. A person who becomes unreadable between the
check and the grounding is a `404`.

**Asked from Accounts** (`services/copilot/accounts_context.py`, `accounts_grounding.py`,
`account_detail_grounding.py`). Two body shapes, one per kind of view.

The list or Board:

```json
{
  "content": "Who needs me first?",
  "context": {
    "surface": "accounts",
    "view": "list",
    "filters": {"owner": "2", "health": "poor"}
  }
}
```

One account:

```json
{
  "content": "What does this mean for EMEA?",
  "context": {
    "surface": "accounts",
    "view": "detail",
    "account": 12,
    "focus": {"kind": "note", "id": 88}
  }
}
```

- `view`: `list | board | detail`, required.
- `filters` (list and Board only): the portfolio's own query keys (`GET /accounts/portfolio/`) —
  `search`, `organisation`, `owner`, `lifecycle`, `health`, `renews_within`, `nps`, `ids`, `sort`,
  `group` — through `services/accounts_portfolio/params.py:parse_params`. An unknown key, or a
  value the portfolio would ignore, is dropped, never rejected. Filters are stored in canonical
  form and the default sort is left out. An explicit `group: ""` is stored as not grouped, not as
  the view's default. An `organisation` id the caller cannot open is `400
  {"context": {"filters": {"organisation": ["Not an organisation you can open."]}}}`, the same
  whether it exists or not. `focus` is ignored on these views: the client may send it, but it is
  dropped unvalidated and never stored.
- `account` (detail only): required. An account the caller cannot open — including a missing,
  non-positive or nonexistent one — is `400 {"context": {"account": ["Not an account you can
  open."]}}`, the same message and the same status every time; there is no separate
  `min_value`-style message, because the field has none (an id that cannot exist is folded into
  the same "can they open it" check, not rejected first on shape).
- `focus` (detail only): `null`, or one story item, `{"kind", "id"}`. `kind` is one of `activity`,
  `calendar_event`, `call`, `email`, `note`, `survey`, `task`, `ticket` or `health`. The item is
  read again with the story's own rules — filed on this account, dated up to today, and admitted
  by its own record rule (mail by mailbox owner and chain, tickets by department, notes and tasks
  by their personal chains). An item the caller may not read this way is `400 {"context": {"focus":
  ["Not a story item you can open."]}}`. **Unlike the organisation page**, which drops such an item
  silently and stores `null`, the account page refuses the send outright.
- The stored context gains `label`, which the server builds, never the client's: on the list and
  the Board, "Accounts" followed by the active filters in toolbar order ("Accounts · Owner: Carl
  CSM · Health: Poor" — the `view` itself is stored separately, not folded into the label); on the
  account page, the account's own name ("EMEA"). The history tag is the `label`. `origin` is the
  stored context without `focus`.

The list and Board digest is grounded in the caller's filtered accounts, recomputed by the
portfolio's own code (`load_portfolio`, `select`, `build_summary`, `order_entries`) so every figure
matches what `GET /accounts/portfolio/` returns for the same filters and the same person. It
contains:

- the five tiles and the sections for the effective group;
- the ten riskiest accounts (Triage score above 0, highest first);
- the renewals due within 90 days (overdue included), soonest first, at most 25 lines then "…and N
  more", where N counts only accounts the asker can open.

The account page digest is grounded in the page, recomputed for the caller with the same code that
serves it:

- the account's own portfolio row — lifecycle, owner, health, ARR, renewal, NPS/CSAT, Triage risk
  and signal — but never the AI pulse reason, which is model-written from records under nobody's
  rule;
- the story's Needs attention block, cut down to the renewal and the open High or Critical tickets
  only; its overdue tasks and other sources are left out, each depending on the asker's own rules;
- a count line over the story's readable records up to today, in which emails, notes, tasks and Slack
  threads are not counted (each follows the asker's personal record rules, and the digest can be shown to a
  shared reader whose rules differ);
- the story items of the last 30 days, newest first, at most 25;
- the focused item, even when older than 30 days;
- up to 6 records the retrieval finds for the question on the account (`retrieval.py`), cited in the
  reply's `sources`.

Story and record text is record text, fenced inside `<dashboard_data>` like every Ask digest, with
the same neutralising of fence tags.

Metered as the `accounts` purpose (`usage.PURPOSES["accounts"] = "Ask Revenact on Accounts"`).
Grounded like every Ask surface: `Grounding.customer_ids` (the organisations the digest names —
every quoted row's organisation, plus the organisation filter, on the list and Board; the "Part of"
organisations on the account page), `.records` (every account the digest counted, every story item
it quoted, and the focus) and `.tickets` (the urgent tickets counted, plus, on the account page, the
story's own readable tickets) are fixed on the reply when it is written and checked exactly as the
other surfaces are (see **Shared sessions** below) — a shared reader must be able to open every
organisation, account, record and ticket department the reply drew on. This fails closed: a legacy
`accounts` reply with no records or tickets snapshot stored is withheld from mentioned-only readers,
since every real Accounts reply stores one. An account that becomes unreadable between the check and
the grounding is a `404`.

**Asked from Pipelines** (`services/copilot/pipelines_context.py`, `pipelines_grounding.py`). The
List or the Board, for opportunities or risks:

```json
{
  "content": "Should we worry about this?",
  "context": {
    "surface": "pipelines",
    "kind": "risks",
    "view": "board",
    "filters": {"owner": "2", "priority": "high"},
    "focus": {"kind": "risk", "id": 31}
  }
}
```

- `kind`: `opportunities | risks`, optional, opportunities by default (as the page's URL leaves it
  out); always stored. `view`: `list | board`, required. One conversation can span both kinds and
  both views: each user turn stores its own context, and `origin` stays the first.
- `filters`: the Pipelines book's own query keys (`GET /pipelines/<kind>/`) — `search`,
  `organisation`, `account`, `owner`, `stage`, `priority`, `department`, `date`, `changed`, `ids`,
  `sort`, `group` — through `services/pipelines_portfolio/params.py:parse_params`. An unknown key,
  or a value the page would ignore, is dropped, never rejected. Filters are stored in the page's URL
  spelling, with the default stages, sort (`-mrr`) and group (`stage`) left out, and "not grouped"
  stored as `"group": "none"` (`""` is accepted for it; the Board reads it as stage, as the page
  does). The default stages are each view's own: with no `stage` filter, the List lists the open
  stages and the Board every stage; a `stage` filter (closed stages included) or `ids` (every
  stage) changes them. An `organisation` id the caller cannot open is `400 {"context": {"filters":
  {"organisation": ["Not an organisation you can open."]}}}`, and an `account` id `400 {"context":
  {"filters": {"account": ["Not an account you can open."]}}}`, each the same whether it exists or
  not.
- `focus`: `null`, or the item "Ask about this" was pressed on, `{"kind": "opportunity" | "risk",
  "id"}`, matching `kind`. It must be an item the caller may read (its organisation or account
  openable and its department theirs, `pipelines_portfolio.book.scope`). It need not match the
  filters: a closed item on the Board can be asked about. Anything else — missing, hidden, another
  department, another tenant, the other kind, a malformed shape — is `400 {"context": {"focus":
  ["Not an opportunity or risk you can open."]}}`.
- The stored context gains `label`, built by the server, never the client's: "Pipelines" and the
  kind, then the active filters in toolbar order ("Pipelines · Opportunities · Owner: Carl CSM ·
  Priority: High"; the `view` is stored separately). An owner the caller may not be told about (not
  in their organisation, or owning nothing they may read), and the page's own `outside` bucket,
  both read "Owner: Not in your book"; `unassigned` reads "Owner: Unassigned". The History tag is
  the `label`, and `origin` is the stored context without `focus`.

The digest is computed by the book's own code (`load_book`, `select`, `build_summary`,
`order_entries`), so every figure matches `GET /pipelines/<kind>/` for the same filters and the same
person. It contains:

- the screen, the filters, the stages listed and the currency;
- the tiles, over every stage of the filtered set whatever stages are listed;
- the sections for the effective group;
- "Largest open … listed, by MRR": the ten largest open items listed (all listed items when the
  stage filter names no open stage); when the listed stages mix open and closed ones (the Board
  with no stage filter), also "Largest closed … listed, by MRR", the ten largest closed items
  listed;
- the listed items that are overdue (most overdue first) and the open ones that close (risks: are
  due) within 90 days (soonest first), at most 25 lines each, then "…and N more";
- the focused item, re-read at grounding through the same two rules (every stage); if it stopped
  being readable, the digest says so.

An item names only its own organisation or account and an owner from the caller's organisation.
Titles, names and the search text are record text, fenced inside `<dashboard_data>`. Nothing is
retrieved for the question; `sources` is empty.

Metered as the `pipelines` purpose (`usage.PURPOSES["pipelines"] = "Ask Revenact on Pipelines"`).
The snapshot fixed on the reply:

- `grounded_customer_ids`: the organisation of every organisation-level item counted (every stage
  of the filtered set, and the focus), plus the organisation filter;
- `grounded_pipeline`: the account of every account-level item counted, and every department
  counted (checked by `forecast.pipeline_readable_by`);
- `grounded_records`: every item quoted (largest, largest closed, overdue, closing or due, the
  focus) as an `opportunity` or `risk` reference, plus each account filter as an `account`
  reference;
- `grounded_tickets`: empty (no ticket is counted).

A mentioned-only reader must be able to open every organisation and account, read every
department, and read each quoted item as it stands when they read: `opportunity` and `risk` have
their own record rules, which re-read the item through `pipelines_portfolio.book.scope` (parent and
department), so an item moved to another department or account after the reply withholds it. A
quoted item since deleted reads as one the reader cannot open (`MISSING_IS_UNREADABLE`). This fails
closed for any reader the rule binds: `grounded_pipeline` and `grounded_tickets` are only checked —
and so only withhold the reply when missing, malformed or unknown — for a reader who does not see
every account; a reader who sees every account and reads every department is not bound by either
snapshot (`_reply_readable_by`'s `reader.sees_everything` branch).

**Asked from the Brain** (`services/copilot/brain_context.py`, `brain_grounding.py`; spec:
react-ts-app `docs/superpowers/specs/2026-10-06-brain-ask-design.md`). One of the four Brain tabs,
for one scope:

```json
{
  "content": "Why did these numbers move?",
  "context": {"surface": "brain", "scope": "team", "tab": "changed"}
}
```

- `scope`: `me | team | company`, resolved by `services.brain.scope.resolve`, as every Brain route
  is. An unknown scope, or one the caller may not use, is `400 {"context": {"scope": ["You can't ask
  about that view."]}}`, the same either way. A scope the caller loses between validation and
  grounding is the same 400, before the model is called and before anything is written.
- `tab`: `changed | waiting | doing | customers`. Anything else is `400 {"context": {"tab":
  ["\"x\" is not a valid choice."]}}`. There is no `focus` in this delivery, and any other key is
  ignored. The context is stored as exactly `{surface, scope, tab}`, and `origin` is the first one.
  Building the digest writes nothing: What changed is read without writing the scope's first-view
  baseline (`changed.compare(record=False)`); only the page writes it. No explanation, audit row
  or model call is made for the "why" lines either. A scope with no baseline yet
  reads "Nothing to compare with yet."

The digest is built by the Brain pages' own code for the caller and scope, so every figure matches
the tab's `GET /api/v1/brain/<tab>/?scope=`. It contains:

- the screen, the scope, the date and the currency;
- the tab in full: What changed (every metric now, then and change, plus the material moves with
  their drivers and handovers); Waiting on you (counts per kind, and the oldest items with whom
  they wait on and the record they are about); What's being done (initiatives with progress,
  plans with health and ARR then and now, and rules with their last night); or Customers (asks,
  anomalies, NPS/CSAT/CES now and before, the latest comments, contacts turned negative);
- on What changed only, why the numbers moved, from what the Brain already holds:
  - under each **material move** whose metric is counted over a set of customers, those
    customers by the metric's own rule (`services/brain/movers.py`: accounts/ARR going dark
    from `activity_tracking.dark_accounts`; customers in poor health and, for Book in good
    health, those not reading Good; shelfware and at-capacity from `usage.shelfware_rows` /
    `capacity_rows`; ARR at risk from `exposure.exposure_split`, counted as the caller), as
    "; accounts: Name (owner, ARR, detail), …; and N more you may open; N more on records you
    can't open" (at most `EXPOSURE_LIMIT` named per move). Every rule runs once per ask, whatever
    moved; a metric with no account rule, or one that counts no account now, gets no list. Under
    a move that improved the list reads "; still counted: …" instead: the persona names
    "accounts:" as the reason for a move that got worse, and says "still counted:" accounts are
    what remains, not the cause;
  - **WHY IT MOVED** (counted over the scope's book, the whole company's for Company): for each
    headline metric whose change is non-zero and each material move, every cut the metric has
    (owner, product, size band, lifecycle stage) then → now (change), the 3 largest moves per
    cut and "and N more moved less". Money and count metrics treat a member present on one side
    only as 0 (a gone owner or product is labelled by name, looked up within the organisation);
    ratio metrics leave such members out and say "N members new or gone since, not compared";
  - **ACCOUNTS CARRYING THE DOWNSIDE** (downside counted as the caller may read it):
    `exposure.exposure_split(scope, caller, limit=EXPOSURE_LIMIT)` (6), the "Why?" panel's
    evidence: each account the caller may open with owner, ARR, downside, renewal, health and
    its factors; "…and N more you may open."; the rest as "Accounts: N more on records you
    can't open.";
  - **SAVED EXPLANATIONS**: for each headline metric, the latest stored "Why?" explanation the
    caller may read (`explanations.latest`, `first_readable`), its text cut at 800 characters and
    marked "(numbers have moved since)" when stale; "none saved for these metrics" otherwise;
- one line for each other tab: the four headline metrics; the counts per kind; initiatives on track
  out of active, open plans and how many are at risk, and rules fired; asks, anomalies, NPS and
  CSAT now (or "not enough answers"), and negative contacts;
- the scope's latest brief the caller may read (`briefs.latest`): its headline and paragraphs.

Lists carry at most 25 lines and then "…and N more listed". A record the caller may not open is
never named and no record id is written: each payload's hidden count reads "N more on records you
can't open" (Waiting counts items, not records: "N more waiting items you can't open"). A rule in
the scope the caller may not open is listed with "(the asker can't open it)". Nothing is retrieved for the question, and `sources` is empty. The call is metered as
the `brain` purpose (`usage.PURPOSES["brain"] = "Ask on the Brain"`) and charges AI credits like
every call; it answers 429, 503 or 502 as the other surfaces do.

The snapshot fixed on the reply:

- `grounded_customer_ids`: every customer the digest names. That is the record of each listed
  waiting item, plan, comment and contact turned negative (each list cut at the same 25 lines as
  the prompt), on What changed each account named under a move or as carrying the downside and
  each saved explanation's `inputs.customer_ids`, and the brief's `customer_ids`;
- `grounded_pipeline` and `grounded_tickets`: empty;
- `grounded_records`: `[]`;
- `carries_anomaly_text`: whether the caller sees every account.

Sharing (spec decision 2). A Brain answer is read whole by its asker, and by a reader of the
conversation's organisation who sees every account and reads every ticket department
(`views._brain_reply_readable_by`). That reader is still held to every other rule above. This holds
for every reader other than the asker, **whoever they are in the conversation**: the conversation's
owner, an accepted session participant and a mentioned-only reader alike (`views.per_reader` for
the first two, `visible_messages` for the third). Anyone else, including someone who can open every
customer named, is shown the question with `context` null and the answer as `REDACTED_REPLY`, and
`origin` is null when it is that question's. A stored Brain context that is not exactly the three
keys `{surface, scope, tab}` the serializer writes fails closed. A later reply fed a Brain answer as
history — a plain follow-up, or an Ask reply on another surface — is stored with
`grounded_customer_ids` null and `carries_anomaly_text` true, so every mentioned-only reader is
refused it, and the owner and participants are refused it too when it follows a Brain answer
withheld from them and someone else asked it. A Brain send fed one folds it in as usual. The same
filter applies to what reaches the model: a send's history is the sender's `visible_messages`, so a
Brain answer withheld from the sender reaches the model only as `REDACTED_REPLY`, and the
facilitator's transcript (`session/decisions/`, `session/close/` with `capture_decisions`) is the
requester's `visible_messages`.

**Shared sessions.** Every Ask reply (Dashboard, Organizations, Contacts, Accounts, Pipelines or the Brain) stores a snapshot when it is
written: `grounded_customer_ids` — the ids of every customer its digest could have drawn on — and
`carries_anomaly_text` — whether it could carry a stored, org-wide anomaly title or summary
(`services/copilot/views.ask_snapshot`, migration `0013_message_grounded_customer_ids`). A
mentioned-only reader in a shared session reads the reply only when every id in its stored
snapshot is one they can see (`visible_customers`), and, if `carries_anomaly_text` is not `False`,
only when they see every account (`sees_everything`) — the stored anomaly title is org-wide and
can name a company outside their own book even when the asker's filtered book is a subset of what
they see. Folding history in: an earlier Ask reply's own snapshot ids and anomaly flag are unioned
into the new reply's. A legacy reply (written before the snapshot existed), a Communications or
plain Copilot reply with no Ask context, or a snapshot that is missing or malformed leaves the new
reply's snapshot empty (`None`), so it fails closed — such a reply is withheld from mentioned-only
readers, including a legacy Dashboard reply from before this snapshot existed. The owner and grant
holders (`grant_holders`) are checked the same way: a reply someone else asked is read against its
snapshot and sources for them exactly as for a mentioned-only reader (`copilot.views.per_reader`),
a Brain answer under the Brain rule above, and a reply fed one fails closed. Only their own
replies — to questions they asked — are always shown to them whole. Sharing a conversation shares
the conversation, not anyone's data rights.

The history is folded for every send, not only an Ask one. A reply with no `context` (a plain
follow-up such as "summarise the above") that was fed an earlier Ask reply — or a follow-up that
was itself fed one — gets the union of those snapshots (`None` if any had none) and
`carries_anomaly_text` set, and a mentioned-only reader is checked against them exactly as for an
Ask reply, as well as against its own sources; its asker is not exempt from the source checks. A
reply with no `context` fed no Ask reply keeps `null` in both and only the per-source checks. What
is folded is exactly what the model was fed: the newest 20 turns the sender may read, oldest first
(`HISTORY_WINDOW`), with a withheld turn adding nothing. A reader who sees every account skips the
id check; for anyone else the ids of every reply in the conversation are checked in one query per
read.

`400` if `content` is blank or over 8000 characters, or `{"context": {<field>: [..]}}` for a
wrong `surface`, `area`, `kind`, `view` (Dashboard, Organizations, Contacts, Accounts or Pipelines), `focus.kind`, a
`contact`, `organization` or `account` (or a `filters.customer`/`filters.account`/
`filters.organisation`) the caller cannot open, a focus item the caller cannot open, more than 200
`ids`, or an attention key not on the caller's list (`{"context": {"focus": {"key": ["Not an item
on your list."]}}}` — the same for a malformed key and someone else's). `403` if
`Organisation.ai_agent_enabled` is `false`. `429` if the organisation's monthly budget for the
purpose (`copilot`; or `dashboard` / `organizations` / `contacts` / `accounts` / `pipelines` for a `context` from
that surface) is spent. `503` if the selected provider's credentials aren't configured. `502` if the
API call itself fails.

**Response `200`** — the (possibly newly created) Conversation, same nested shape as the detail
endpoint's GET, including this turn's user message (with `context` echoed, after the focus
intersection) and the model's reply. `origin` is set from the first Ask message of any surface
(Dashboard, Organizations, Contacts, Accounts or Pipelines) and never overwritten.

---

## `connectors` — Integrations (`/integrations`, `Integrations.tsx`)

### Models — `Connector`

One external system the organisation has connected — `provider` (a
closed list: Zendesk, Jira, Freshdesk, "any other system (webhook)",
Intercom, Salesforce, HubSpot, Slack, Gmail, Microsoft Teams, Zoom,
GitHub, Figma), `name` (distinguishes two of the same provider),
`is_enabled`, and a scope of `customers`/`accounts` where **empty means
the whole organisation**.

**Ticket sources are live.** Zendesk, Jira, Slack (one channel), Freshdesk
and the inbound webhook can be *connected*: an integration manager hands
the connector the organisation's credentials (Fernet-encrypted at rest,
never serialised), the scheduler container runs `sync_tickets` every ten
minutes, and each ticket is filed on the customer or account its
requester's email belongs to (a known contact first, then the domain —
the same lookup mail uses; a connector scoped to exactly one company
files everything there). Second passes update status, priority,
assignee and resolution in place. New tickets are classified for
sentiment on arrival so the Account Pulse can count them.

**Tickets are read department-wise.** Every ticket connector has a
`department` (`User.Function`: cs, engineering, sales, analytics,
leadership, other, or blank); tickets synced through it carry that
department, and `services/customers/personal.py:visible_tickets` shows a
person only their own department's tickets plus the undeparted ones.
Leadership reads every department. The rule applies to the Tickets tab
on organisations and accounts, the Ticket Overview and Interactions
dashboards, and the Copilot's retrieval and shared replies.

Other providers (Salesforce, Zoom, …) stay attribution-only: `setup` is
null and `connect/` answers 400.

### `GET/POST /api/v1/connectors/`, `GET/PATCH/DELETE /api/v1/connectors/<id>/`

Reading is open to any member (the Ticket Overview's origin chart and
the Integrations page need it); writing needs `manage_integrations`.
Every row carries what the connector has brought in — `ticket_count`,
`call_count`, and `last_record_at` (the newer of the latest ticket's
`opened_at` and the latest call's date, or null) — annotated in one
query, so the Integrations page can show "169 tickets · last 10 Sep"
without a second call. `DELETE` keeps the records: both foreign keys are
SET_NULL.

```json
[{"id": 3, "provider": "zendesk", "provider_display": "Zendesk", "name": "Zendesk",
  "is_enabled": true, "department": "cs", "department_display": "Customer Success",
  "customers": [{"id": 1, "name": "Apple"}], "accounts": [],
  "is_organisation_wide": false, "ticket_count": 169, "call_count": 0,
  "last_record_at": "2026-09-10",
  "has_credentials": true, "config": {"host": "acme.zendesk.com"},
  "status": "connected", "error": "", "last_synced_at": "2026-09-16T09:00:00Z",
  "last_sync_note": "3 new, 2 updated",
  "setup": {"key": "zendesk", "label": "Zendesk", "uses_oauth": false,
            "fields": [{"name": "subdomain", "label": "Zendesk subdomain", "secret": false, "placeholder": "acme (from acme.zendesk.com)", "required": true},
                       {"name": "email", "label": "Agent email", "secret": false, "placeholder": "…", "required": true},
                       {"name": "api_token", "label": "API token", "secret": true, "placeholder": "", "required": true}],
            "help": "Admin Center › …"},
  "created_at": "2026-08-01T00:00:00Z"}]
```

`POST` accepts `department` alongside `provider` and `name`; `PATCH` may
change it (existing tickets keep the department they were filed with).
Since round 2 delivery 3 a create, an update that changes `name`, `is_enabled`, `department`,
`customer_ids` or `account_ids`, and a delete are audited (`connector.create`,
`connector.update`, `connector.delete`); responses are unchanged. Slack and Jira items that match
no customer are kept for a person to match (see the `work` section and "Agent bundles, round 2
delivery 3").

### `POST /api/v1/connectors/<id>/connect/` — `manage_integrations`

Body is the provider's own form (`setup.fields`). The provider is called
to verify the credentials before anything is stored (`400` with the
provider's message otherwise); success is `201` with the connector and an
audit event `connector.connect`. `{"oauth": true, "channel": "C…"}` asks
for `{authorize_url}` instead when the provider supports sign-in
(Slack, once `SLACK_OAUTH_CLIENT_ID/SECRET` are set); the provider then
lands on `GET /api/v1/connectors/oauth/<provider>/callback/` (public,
trusts only the 15-minute signed state) and the browser is bounced to
`/integrations?connector=connected|error&detail=…`.

**Since Agent bundles delivery 3 the OAuth is bound to the browser that started it.** The start (`connect/` with `{"oauth": true}`, and the agents consent) sets `Set-Cookie: __Host-revenact_connector_oauth=<nonce>; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=900` (over plain http in development: `revenact_connector_oauth`, `Path=/api/v1/connectors/oauth/`); the signed state gains `browser` (the nonce's SHA-256) and `purpose` (`"connect"` or `"agents"`). The callback (`core/oauth_browser.py`; mail's OAuth uses the same module) clears the cookie on every answer and refuses a forwarded link before any code exchange: `?connector=error&detail=Open the link in the browser that started it.`, audited `connector.oauth_refused`. The callback and the inbound webhook are listed in `.soc2/config.yml` `public_routes`. The frontend's OAuth starts send credentials. See "Agent bundles, delivery 3" (section 5.4).

**`agents` block (Agent bundles delivery 3).** `GET /connectors/` and `GET /connectors/<id>/` carry `"agents": {"kinds": ["slack.reply"], "can_act": false, "needs": "consent", "allowed_by": null, "allowed_at": null}`: `kinds` is what agents can do through it (`["slack.reply"]`, `["jira.create", "jira.assign", "jira.comment"]`, else `[]`); `can_act` is the switch on, the grant held and the connector enabled, connected and not in error; `needs` is `"consent"` (Slack through sign-in), `"token"` (Slack with a pasted token), `"permission"` (Jira), `"reconnect"` (the connector is not usable; round 2 D1) or null; `allowed_by` (`{"id", "name"}`) and `allowed_at` while the switch is on. `POST /connectors/<id>/agents/` (`manage_integrations`) sets the switch, with every refusal in "Agent bundles, delivery 3" (section 5.3).

For the webhook provider the `201` also carries `token` (shown once) and
`inbound_url`.

### `DELETE /api/v1/connectors/<id>/credentials/` — `manage_integrations`

Disconnect: the secret is destroyed and the status returns to
`not_connected`; the tickets it brought in stay. Audit event
`connector.disconnect`.

### `POST /api/v1/connectors/<id>/sync/` — `manage_integrations`

Pull now. `200` with the connector plus `created`, `updated`, `unmatched`
counts; a provider that refuses the token leaves the connector in
`status: "error"` with the reason in `error`.

### `POST /api/v1/connectors/<id>/inbound/` — public, secret-authenticated

Where any other system pushes tickets. Authenticated by the connector's
own secret, either `X-Revenact-Token: <secret>` or
`X-Revenact-Signature: sha256=<hex hmac-sha256 of the raw body>`;
unknown connectors and bad secrets are both `404` (and the latter is
audited as `connector.inbound_rejected`). Body: one ticket object, or
`{"tickets": [...]}` up to 200 at a time, 512 KB max:

```json
{"external_id": "77", "title": "Export broken", "description": "…",
 "status": "open|in-progress|on-hold|resolved|closed", "priority": "critical|high|medium|low",
 "requester_email": "sam@pizzahut.com", "requester_name": "Sam", "assignee_name": "Eve",
 "url": "https://helpdesk/77", "opened_at": "2026-09-10", "resolved_at": null}
```

`202` with `{created, updated, unmatched}`. The same `external_id` again
updates the ticket.

### `/api/v1/connectors/jira-link/`: a person's own Jira account (agent bundles round 2 delivery 2)

Auth: `IsAuthenticated` (any member; the callback is public). A link is its owner's alone: no route lists other people's links, admins included (R2D2-11). One link per person; one person per Atlassian account in a workspace (R2D2-3). Optional: nobody must link, and a step with no link acts as the Jira connection's account. Linking is off until `ATLASSIAN_OAUTH_CLIENT_ID` and `ATLASSIAN_OAUTH_CLIENT_SECRET` are set. Tokens live only in `JiraLink.credentials` (Fernet), never in an answer, a log or an audit row.

**`GET /connectors/jira-link/`**

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

`configured`: both Atlassian env vars are set. `connectors`: the workspace's enabled Jira connectors that hold credentials. `link`: the caller's own link or `null`; `covers` lists the ids of `connectors` the link's sites cover (matched by the site url's host against the connector's `config.host`, lower-case); `status: "lost"` keeps the row so the person sees why. Pinned at 2 queries (`JIRA_LINK_QUERIES`).

**`POST /connectors/jira-link/`** (start). Refusals in order:

| Order | When | Answer |
|---|---|---|
| 1 | not configured | `409 {"code": "JIRA_LINK_OFF", "detail": "Linking a Jira account isn't set up on this deployment."}` |
| 2 | no enabled Jira connector with credentials | `409 {"code": "NO_JIRA", "detail": "This workspace has no Jira connection yet."}` |
| 3 | otherwise | `200 {"authorize_url": "https://auth.atlassian.com/authorize?..."}` and the browser cookie `revenact_jira_link` (path `/api/v1/connectors/jira-link/`, 15 minutes) |

The authorize URL carries `audience=api.atlassian.com`, `client_id`, `scope` (`read:jira-work write:jira-work read:jira-user offline_access`), `redirect_uri` (`MAIL_OAUTH_REDIRECT_BASE` or the request origin, plus `/api/v1/connectors/jira-link/callback/`), `state` (signed, salt `connectors.jira_link`), `response_type=code`, `prompt=consent`. Not audited (nothing stored).

**`GET /connectors/jira-link/callback/?code=&state=`** (public). Every answer clears the cookie and redirects to `<FRONTEND_URL>/integrations?jira_link=<outcome>&detail=<sentence>`:

| Order | When | Outcome, sentence | Audit |
|---|---|---|---|
| 1 | `error` in the query | `error`, "You didn't allow Revenact to use your Jira account." | none |
| 2 | state unsigned or older than 15 minutes | `error`, "This link is invalid or has expired. Try again." | none |
| 3 | the state's user unknown or inactive | `error`, "This link is invalid or has expired. Try again." | none |
| 4 | another browser | `error`, "Open the link in the browser that started it." | `jira.link_refused` `other_browser` |
| 5 | Atlassian refused the code, or `/myself` failed or had no `accountId` | `error`, "Atlassian didn't accept the sign-in. Try again." | `jira.link_refused` `exchange` |
| 6 | no `refresh_token` in the answer | `error`, "Atlassian didn't allow Revenact to stay linked. Try again." | `jira.link_refused` `no_refresh` |
| 7 | no Jira site covers any of the workspace's Jira connectors | `error`, "Your Atlassian account can't open acme.atlassian.net, the site Revenact's Jira connection uses." (the first connector's host) | `jira.link_refused` `no_site` |
| 8 | the account is another person's link here | `error`, "Someone else here has linked that Atlassian account." | `jira.link_refused` `taken` |
| 9 | stored (created, or the caller's link replaced) | `linked`, no detail | `jira.link` |

Steps 5 to 9 call `POST https://auth.atlassian.com/oauth/token`, `GET https://api.atlassian.com/oauth/token/accessible-resources` (rows carrying a Jira scope are kept) and `GET https://api.atlassian.com/ex/jira/<first covering cloud_id>/rest/api/3/myself`. Both Atlassian hosts are on the connectors' `ALLOWED_HOSTS`.

**`DELETE /connectors/jira-link/`**: `204`, the tokens deleted, `jira.unlink` (`reason: "person"`) audited; `204` with no audit when there was no link. Atlassian publishes no token revocation endpoint for these apps, so the frontend tells the person to also remove Revenact under Connected apps in their Atlassian account. A person deleted takes their link with them; disconnecting the Jira connection leaves links alone.

### `/api/v1/connectors/slack-link/`: a person's own Slack account (Connections page, 2026-10-16)

Spec: `react-ts-app` `docs/superpowers/specs/2026-10-16-connections-page-design.md` §3 Slack. Mirrors the Jira link above. Auth: `IsAuthenticated` (any member; the callback is public). A link is its owner's alone: no route lists other people's links, admins included. One link per person; one person per Slack account (`slack_user_id`) in a workspace. Optional: nobody must link; a Slack reply by someone with no link posts as the connection's bot. Linking is off until `SLACK_OAUTH_CLIENT_ID` and `SLACK_OAUTH_CLIENT_SECRET` are set (the same Slack app the Slack connector's sign-in uses). The token lives only in `SlackLink.credentials` (Fernet), never in an answer, a log or an audit row. Slack user tokens do not expire, so nothing is refreshed.

**Scopes: user scopes only, `chat:write,users:read`.** Never a DM scope (`im:history`, `mpim:history`, `im:read` are never asked for); no bot scope is requested by this flow.

**`GET /connectors/slack-link/`**

```json
{
  "configured": true,
  "workspace_connected": true,
  "link": {
    "name": "Carl Lee",
    "slack_user_id": "U0CARL",
    "team_id": "T0ACME",
    "status": "linked",
    "linked_at": "2026-10-16T09:12:00Z"
  }
}
```

`configured`: both Slack OAuth env vars are set. `workspace_connected`: the workspace has an enabled Slack connector holding credentials. `link`: the caller's own link or `null`; `status: "lost"` (Slack refused the token on a post) keeps the row so the person sees why.

**`POST /connectors/slack-link/`** (start). Refusals in order:

| Order | When | Answer |
|---|---|---|
| 1 | not configured | `409 {"code": "SLACK_LINK_OFF", "detail": "Linking a Slack account isn't set up on this deployment."}` |
| 2 | no enabled Slack connector with credentials | `409 {"code": "NO_SLACK", "detail": "This workspace has no Slack connection yet."}` |
| 3 | otherwise | `200 {"authorize_url": "https://slack.com/oauth/v2/authorize?..."}` and the browser cookie `revenact_slack_link` (`__Host-` over https; path `/api/v1/connectors/slack-link/` over plain http; 15 minutes) |

The authorize URL carries `client_id`, `user_scope=chat:write,users:read` (no `scope`), `redirect_uri` (`MAIL_OAUTH_REDIRECT_BASE` or the request origin, plus `/api/v1/connectors/slack-link/callback/`) and `state` (signed, salt `connectors.slack_link`). Not audited (nothing stored).

**`GET /connectors/slack-link/callback/?code=&state=`** (public). Every answer clears the cookie and redirects to `<FRONTEND_URL>/settings/connections?slack_link=<linked|error>&detail=<sentence>`:

| Order | When | Outcome, sentence | Audit |
|---|---|---|---|
| 1 | `error` in the query | `error`, "You didn't allow Revenact to use your Slack account." | none |
| 2 | state unsigned or older than 15 minutes, or its user unknown or inactive | `error`, "This link is invalid or has expired. Try again." | none |
| 3 | another browser | `error`, "Open the link in the browser that started it." | `slack.link_refused` `other_browser` |
| 4 | Slack refused the code (`oauth.v2.access`), or answered without `authed_user.access_token`, `authed_user.id` or `team.id` | `error`, "Slack didn't accept the sign-in. Try again." | `slack.link_refused` `exchange` |
| 5 | `team.id` is not the `config.team_id` of any of the workspace's Slack connectors | `error`, "Your Slack account is in a different Slack workspace from Revenact's Slack connection." The token is revoked (`auth.revoke`) and kept nowhere | `slack.link_refused` `other_team` |
| 6 | the Slack account is another person's link here | `error`, "Someone else here has linked that Slack account." | `slack.link_refused` `taken` |
| 7 | stored (created, or the caller's link replaced) | `linked`, no detail | `slack.link` |

The name is `users.info`'s `real_name` with the person's own token (else their Revenact name).

**`DELETE /connectors/slack-link/`**: `204`; Slack's `auth.revoke` is called with the token (best effort: a refusal or no answer still deletes), the row is deleted, `slack.unlink` (`reason: "person"`, `revoked`) audited; `204` with no audit when there was no link.

**Post as me.** `slack.reply` steps (agent bundles) post with the **runner's** token when they have a `linked` link whose `team_id` equals the connector's `config.team_id` (and linking is configured); otherwise with the connector's bot token, as before. The idempotency key still rides in the message metadata, and a Retry's lookup still reads the channel with the bot token. If Slack refuses the person's token with a reauth error (`invalid_auth`, `token_revoked`, `account_inactive`, `not_authed`) the link is marked `lost` (`slack.link_lost`) and the bot posts; `not_in_channel`, `channel_not_found` or `restricted_action` for the person's token also falls back to the bot without losing the link. Any other refusal fails the step as before; no answer is `Unconfirmed` (never posted twice). The step's result gains `slack_as`: `"person"` or `"connection"`. The step preview's `as` still names the bot (the preview has no reader).

**Show who I am.** When a synced channel files a new conversation, `SlackConversation.started_by` is the member whose link has the poster's Slack user id (same team), else, as before, the member with the poster's email. Replies are not attributed (their `user_id` is already in `messages`).

### `POST /api/v1/connectors/slack/interactivity/`: Send to Revenact (Slack message shortcut)

Spec §3, option A (owner 2026-10-16). Slack's interactivity request URL. **Public** (`AllowAny`, no authentication classes); proved by Slack's signature only: `X-Slack-Signature` must equal `v0=` + HMAC-SHA256(`SLACK_SIGNING_SECRET`, `v0:{X-Slack-Request-Timestamp}:{raw body}`), compared in constant time, with the timestamp within 5 minutes of now (either side). An empty `SLACK_SIGNING_SECRET` refuses every request. Throttled per source IP (scope `slack_interactivity`, `THROTTLE_SLACK_INTERACTIVITY`, default `120/min`).

| When | Answer |
|---|---|
| signature missing, wrong, too old, or no secret configured | `401` (empty body); nothing read |
| signed, but the body is not `payload=<JSON object>` | `400` |
| `type` is not `message_action`, or `callback_id` is not `send_to_revenact` | `200`, nothing done |
| otherwise | `200` (empty body, as Slack wants); the person's answer goes through the payload's `response_url` (ephemeral) |

For a `send_to_revenact` message action:

1. **The workspace:** every enabled Slack connector with credentials whose `config.team_id` is the payload's `team.id`.
2. **The person:** a `SlackLink` with the clicker's `user.id` in that team, in one of those workspaces, of an active member; else the one active member of those workspaces whose email is the clicker's Slack email (`users.info` through the connector's bot, which holds `users:read.email`). Two workspaces claiming them, or nobody: ephemeral "Link your Slack account in Revenact (Settings › Connections) first." and **nothing is kept**.
3. **The message:** only `message.text` (at most 3,000 characters), `message.user`, `message.ts` and `channel.id`. The sender's name and email come from `users.info` through the bot. The link back is `https://slack.com/archives/<channel>/p<ts>` (no `chat.getPermalink` call, to stay inside Slack's 3 seconds).
4. **The customer:** the first contact (by id) whose email is the sender's, on a customer or account **the person may open** (`visible_customers` / `visible_accounts`); else none.
5. **The summary:** one model call (`purpose: "slack_triage"`, Gemini's lite tier) with only that message's text: one sentence and a suggested step kind from `task.create`, `jira.create`, `draft.reply`, `note.create`; any failure or other answer falls back to the text's first 200 characters and no step.
6. **The suggestion:** a `work.SlackSuggestion` owned by the person alone (see `work` › Slack messages sent to Work). The same message sent twice by the same person is one row. Audited `slack.message_sent_to_work` (never the text). Ephemeral "Sent to your Work.".

7. **Slack handover (owner, 2026-10-18):** when the message tags colleagues (`<@U…>`, at most 10), each tagged person is resolved to an active, working member of the clicker's workspace (their `SlackLink` there, else the email `users.info` gives through the bot). Never the clicker themself, a bot or app user, someone unknown or without Revenact, or a member of another workspace. **Only someone who could read it in Slack:** a public channel hands it to all of them; a private channel, group DM or DM only to its members (`conversations.info` for `is_private`/`is_im`/`is_mpim`, then `conversations.members` through the bot, 2-second timeouts). Slack refusing or not saying (a DM the bot isn't in) hands it to nobody. Each one handed it gets:
   - **A to-do from the clicker:** a `Task` titled with the model's `todo` (a short imperative, a new optional field of the same one `slack_triage` call), else the message as Slack showed it without its leading mentions (at most 120 characters). Description: the readable message, "Sent from Slack by <clicker>." and the permalink. On the message's record **only if the tagged person may open it** (`can_open`): then `created_by` the clicker, due in 7 days (a task on a record is always dated), told by the normal `task_assigned` notification ("<clicker> assigned you “…” on <record>."). Otherwise a to-do of their own (no record, no date; a to-do is its owner's alone, so `created_by` is them), told `task_assigned` "<clicker> sent you “…” from Slack.". Source `manual`; the `created` event's data carries `from_slack: true`.
   - **Their own copy:** a `SlackSuggestion` they own, `handed_from` the clicker, `task` the to-do, the record only if they may open it, `bundle_state` `pending`, so the Slack-bundles tick proposes **their** bundle (theirs alone, as for any Slack bundle). Its card never shows in the feed; the task stands for it.
   - **Once** per (channel, message, person): a second click makes no second task, copy, notification or audit.

   The clicker's own suggestion is still made, with `handed_to` `[{id, name}]` and `bundle_state` `none` (no plan for the clicker when it was handed over). Audited `slack.handed_over` (ids and counts only). The ephemeral answer: "Sent to <names>'s Work in Revenact. Kept in your Work." and, for tagged members left out because they aren't in the conversation, " Not sent to <names>: they aren't in this channel." Nobody tagged: exactly as before.

8. **Channel tag to-dos (owner, 2026-10-18), no click needed:** a message in a **synced channel** (filed by the Events API or the catch-up, `sync.file_conversation`) that tags colleagues and **asks them to do something** is handed over exactly as in 7, from its **author**, through the same function (`slack_handover.deliver`). No endpoint changes.
   - **Queued at filing:** a new person's message (a top message or a thread reply; an edit never) under an hour old that mentions someone other than its author, whose author the thread's people already resolve as a member, gets a `connectors.SlackTagCheck` row (ids and the ts only, unique per connection, channel and ts). No Slack or model call while Slack waits.
   - **Checked on the per-minute `deliver` tick** (`deliver_pending`, before the Slack bundles, `services/connectors/slack_tag_checks.py:run_pending`): oldest first, at most 20; one over an hour old is dropped unasked; each claimed by a conditional UPDATE and deleted once handled. Gates before any call: the connection enabled and connected, workspace AI on, Slack not switched off as an agent source, the connection's agents switch not **Read only** (`agents_can_act`), the author still a working member. Tagged people resolved as in 7 (the author never); none a member → no call. Then **one model call** (purpose `slack_tag_request`, lite, schema `{request: bool, todo: str}`; the message quoted as data): `request` false (a thank-you, an FYI) → nothing; true → each tagged member who could read it in Slack gets the to-do (titled `todo`, ≤ 120, else the message without its mentions) and their copy, whose plan the Slack-bundles pass then proposes on the same tick. **No copy for the author** (nobody clicked). A model failure (credits, not configured, an error, a bad answer) leaves the check for one retry a tick later, then drops it.
   - **Once with Send to Revenact:** both use the same per-(channel, message, person) key, so a later click on that message makes no second task, copy or notification for someone already handed it.
   - **No second plan:** the thread intake (`intake.pick`, the fast lane) leaves a thread whose message still waits for its check; a message handed over marks its agent thread read up to it (`skipped`, `skip_reason` `handed_over`) when it is the thread's newest, so the record's account team gets no plan for it; a newer message wakes the thread as usual. A message that was not a request is left to the intake as before.
   - Audited `slack.tag_handed_over` (ids and counts only).

The work is done inline (no task queue by design); the model call is the slow part, so it runs on the lite tier. If Slack's 3 seconds pass, Slack shows the person a timeout although the suggestion is made and the "Sent to your Work." answer still arrives through `response_url`. `hooks.slack.com` joins the connectors' `ALLOWED_HOSTS`, and only `https://hooks.slack.com/...` response URLs are ever called.

### Ticket fields added for sources

`TicketSerializer` now also carries `department`, `department_display`,
`description`, `requester_name`, `requester_email`, `external_url` and
`synced_at`. Numbers come from the source: `ZD-1042`, `SUP-12` (Jira key),
`FD-88`, `SL-<ts>`, `WH-<id>`.

## `knowledge` — What the whole company knows (Organization Details › Company View, `CompanyViewTab.tsx`)

### Who may see whose words — the org chart rule

`User.reports_to` is the org chart (set via `/auth/users/` `reports_to_id`,
read as `reports_to {id, name}`; a loop is a `400`). From it,
`services/accounts/hierarchy.scope_ids(user)` is the set of people whose
records a person may see: themselves, everyone below them in the chart,
everyone in their function, and everyone above them in the chain.
Anything addressed to them (a question routed to them, a message that
@mentions them) is theirs regardless, and **responsibility grants
reading**: the people who answer for a customer — its CS owner and its
function owners — see every function's notes and questions on that
customer, whatever the chart says (`knowledge.views.responsible_for_q`). The rule applies to what people
*say*: contributions (`visible_contributions`, plus answers to the
reader's own questions), questions (`visible_questions`), the Copilot's
retrieval (scoped to the asker), and chat turns (below). Customer and
account records keep their capability scoping, with one addition: a
customer's page also opens for a manager whose report owns it (all
the way down the chart), for anyone responsible for it in
any function,
or asked / asked about it, or who wrote about it
(`customers.scoping.visible_customers`) — so a notification that links
there opens for the person it was sent to.

**A mentioned person sees a slice of a chat, not the chat.** A
conversation is visible to its owner, to accepted session participants,
and to anyone a turn routed a question to. The first two see every turn
(each reply someone else asked still checked for them, below);
a mentioned person sees the turns whose author is in their scope **and
which are not addressed to someone else** (a turn that routes a question
to Raj is Raj's, however senior its author), the turns that mention
them **or anyone who reports to them** — a manager sees what was asked
of their team and what the team replied, and the conversation appears
in their list — their own, and the Copilot's replies to those
(`copilot.views.visible_messages`). `GET/POST` conversation payloads
carry `visibility: "full" | "partial"` and each turn its `author`
(`Message.author`, backfilled for older turns from the session's
redirect events). A follow-up posted by a mentioned person is grounded
and given history from their slice only. **A Copilot reply is withheld
from a viewer when it cites a record they may not read** — every cited
record (email, note, ticket, contribution, activity, …) needs its company
open to the viewer (`visible_accounts` for an account-level record — seeing
the account's organisation is not enough — `visible_customers` for an
organisation-level one) *and* must pass its own rule (a contribution
outside their scope, mail outside their chain, another department's
ticket). **This holds for every reader** — the conversation's owner and
accepted session participants as much as a mentioned person: sharing a
conversation shares the conversation, not anyone's data rights
(`copilot.views.per_reader`). The owner and participants always read
their own replies (to questions they asked), Ask or plain. Strict by
design: someone who loses access to a company stops seeing replies that
quoted its records — for a mentioned person, on a plain Copilot or
Communications reply that includes replies to their own questions (an
Ask asker still reads their own Ask reply regardless) — and
shows as "This reply isn't shared with you…" instead (`copilot.views.
_reply_readable_by`); the stored turn is untouched. The question that
reply answers is still shown, with `context: null` for that viewer, and the
conversation's `origin` is `null` for them when it is the first Ask turn's
reply that is not shown to them, withheld or dropped behind a turn they may
not read (see `GET /api/v1/copilot/conversations/`). Pairing a reply with
the question it answers uses `Message.reply_to`, set on every new reply
(a legacy row with none falls back to the immediately preceding user
turn) — ordering alone can't be trusted once two participants can send
concurrently. **A reply to a question asked on the Dashboard carries the
asker's whole filtered book**, not just the records it cites — totals,
top lists, company names never individually sourced — so a sliced viewer
needs every customer in `forecast.filtered_customers(asker, the answered
turn's context.filters)` to be inside their own visible customers, on
top of the per-source checks above; the asker always sees their own
dashboard replies regardless. **Pipeline too:** an Overview or Revenue
reply's figures count the open opportunities and risks the asker could
list, so the reply stores their accounts and departments
(`Message.grounded_pipeline`, `{account_ids, departments}` from
`forecast.counted_pipeline`; empty lists for areas and surfaces whose digest
counts none) and a sliced reader needs every account in their
`visible_accounts` and every department readable under
`pipeline_visible_q`. A follow-up fed the reply folds its snapshot in, as
with customer ids. A reply written before the field existed has none: it
fails closed when it could have carried pipeline (an Overview or Revenue
reply, or a context-less reply fed Ask history) and reads as before
otherwise — no backfill, since what an old reply counted cannot be
re-derived. **Tickets too, separately** (`Message.grounded_tickets`,
`{account_ids, departments}` from `personal.ticket_snapshot`): an Overview
reply's "Open tickets" and attention support items, a Support reply, a
support attention focus (any area) and an Organizations reply's urgent-ticket
signals count tickets the asker could read (`ticket_filters.filtered_tickets`,
`attention.rules.support_tickets`). The ticket department rule exempts
Leadership only (`visible_tickets`), so every mentioned-only reader —
view-all included — needs each department readable under it, and a reader
who doesn't see every account needs each account in `visible_accounts`.
Legacy replies with none fail closed on the Overview and Support areas, a
support attention focus, an Organizations reply, and a context-less reply
fed Ask history, except for a Leadership reader who sees every account. Follow-ups fold it like pipeline. A context-less (Communications/Copilot) reply keeps exactly
the per-source checks for every viewer, the asker included. **Story records too**
(`Message.grounded_records`, migration `0018_message_grounded_records`): an organisation page reply
quotes story items and counts records that it does not cite, so it stores a reference
(`{type, id, company_type, company_id}`, never text) to every story item and focus it quoted and to
every account it covered. A reader is checked against each reference exactly as against a cited
source: the account must be in their `visible_accounts` (or the organisation in their
`visible_customers`), and a note, email, ticket or task must pass its own rule (`RECORD_RULES`, which
gains `task` → `visible_tasks`). So a reader who can open the organisation but not one of their
accounts reads a reply about the whole organisation only when it was narrowed to accounts they see.
Follow-ups fold the references in like the other snapshots. An organisation page reply without them,
or with a malformed list, fails closed. Every other reply written before the field existed quoted no
story, and reads as before. The exception is a legacy context-less reply that was fed Ask history
(its sources are unknown): it fails closed on records, and so does any reply fed it.

**Unknown is not empty.** When a fold is unknown as the reply is written — records, pipeline or
tickets, because a reply it was fed had none — the new reply stores `{"unknown": true}` in that
field, never `null`. Every well-formed check rejects the marker, so the reply fails closed for a
mentioned-only reader on every surface. A context-less follow-up's own asker still reads it (their
per-source checks are unchanged). `null` means only a reply written before the field existed, read
under the legacy rules above.

Demo: `seed_demo_hierarchy` — Alice at the top; Carl, Priya, Raj, Mei
report to her; Dana to Carl.

### The account owner

`Customer.owner` is the **account owner**: the one accountable person for
the relationship, from any function (by convention CS; it can be an
engineer for a technical-led account). The per-function owners are the
team around them. Two rules, in `services/knowledge/ownership.py`, apply
on every path that changes it (`PATCH /customers/<id>/ owner_id`, and the
Company View's CS row `PATCH …/responsible/ {"function": "cs"}`):

- **Who may change it**: the current owner, anyone above them in the
  chart, or `manage_org_settings`; an unowned customer may be claimed by
  anyone (`400` / `403` otherwise).
- **A change is an event**: `handover_note` (customer PATCH) / `note`
  (responsible PATCH) is written down as a contribution by the person who
  made the change — "Account owner changed from Dana to Priya. <note>" —
  and the new owner is notified.

"Your customers" in the Copilot's digest means owned **or** responsible
in your function; the owner cut in the registry is labelled "Account
owner"; the Ops agent and facilitator are given each account's team and
told to assign a task to the person responsible for the function it
needs, falling back to the account owner. The responsible payload carries
`account_owner {id, name, function}`.

### Models — `User.function`, `Contribution`, `FunctionOwner`

`User.function` (`cs`, `engineering`, `sales`, `analytics`, `leadership`,
`other`; default `cs`) is which part of the company someone works in — not
a permission (roles carry those). It stamps their contributions and is
what "the responsible person" is looked up by. Set on create/edit via
`/auth/users/` (`function`), read everywhere a user is serialised
(`function`, `function_display`).

A `Contribution` is one person's knowledge about one customer from their
function: `customer`, `author`, `function` (a snapshot of the author's
function when written), `body`. **Scoped by the org chart** (see above), never by the CSM's book:
every member may write; who may read is the chart rule.
`FunctionOwner` (`customer`, `function`, `user`; unique per customer and
function) says who answers for the customer in each function; CS stays
`Customer.owner`.

### `GET/POST /api/v1/customers/<id>/contributions/`, `GET/PATCH/DELETE /api/v1/contributions/<id>/`

Auth: `IsAuthenticated`, any customer in the caller's organisation
(`404` outside it). `GET` lists newest first, `?function=` narrows.
`POST {"body"}` stamps `author` and `function` from the caller. The
author may edit or delete their own; `manage_users` may delete anyone's
(`403` otherwise).

### `GET/PATCH /api/v1/customers/<id>/responsible/`

`GET` returns `{"customer_id", "responsible": [{function,
function_display, user: {id, name} | null}]}` for every function; CS is
read from the customer's owner. `PATCH {"function", "user_id" | null}`
sets or clears one (CS writes `Customer.owner`) and needs
`view_all_accounts`; an unknown function is a `400`. A PATCH that changes who answers for a function writes `function_owner.changed` (target the customer, `function`, `from`, `to`, user ids; nothing on a refusal or when the person is the same). The change and its audit row commit together; the new owner's notification is sent after commit. Slack escalations D2.

### Models — `Question`

A question routed to a person, on the record: `customer` (optional),
`asked_by`, `assignee`, `text`, `status` (`open`/`answered`), `answer`
(the `Contribution` the answer was stored as), `message` (the Copilot
turn that asked it, if any), `answered_at`. **A question answered once is
knowledge**: the answer is a contribution from the answerer's function,
so the Copilot has it from then on.

### `GET/POST /api/v1/customers/<id>/questions/`, `GET /api/v1/questions/`, `POST /api/v1/questions/<id>/answer/`

`POST {"text", "assignee_id"?}` — with an assignee the question goes to
them; otherwise to whoever the text **@mentions** (`@Mei` by first name
when unique, `@Mei Tanaka` by full name; two Meis and a bare `@Mei`
resolve to nobody rather than the wrong one; never yourself). `400`
when nobody is asked. Each person asked gets a `question_asked`
notification linking to the chat it was asked in (`/copilot?session=<conversation id>`)
when it was asked in one, otherwise to the customer's page; the answer's
notification links the same way. Lists are open first, newest
first; `/questions/` takes `?mine=true` (waiting on the caller),
`?asked=true` (asked by the caller), `?status=`. `answer/ {"body"}`:
the assignee (or `manage_users`) answers once (`409` after); the answer
is stored as a contribution whose body opens `In answer to <asker>'s
question "<text>": …`, the question closes, and the asker gets a
`question_answered` notification. A question about no customer has nothing
to file a contribution on: it closes with `answer: null` and the asker is
told.

**Whose customer it names.** A routed question opens its customer to the
person asked (`visible_customers` admits `questions__assignee`), which is
deliberate when the asker names the customer, on its page or in their own
words. A question routed from an **Ask** turn (`POST /copilot/messages/` with
a `context`) is about the asker's screen instead (a focus on one company, an
Organizations list narrowed to one). There, a person asked who could not
already open that customer gets the question about **no customer**:
- `customer: null` in their inbox;
- the notification reads "<asker> asked you: …", with no "about X";
- no stale-question nudge or knowledge gap names it;
- the question does not open it to them.

Someone who can open it gets it named, as before. On every question payload,
`customer` is `null` for a reader who may not open that customer. This
covers the asker's chart and the assignee's managers, who read questions
they were not asked. The same reader gets the `answer` contribution with
`customer_id: null` and `customer_name: null`, since the answer is filed on the
question's customer. (`services/knowledge/mentions.route_questions`,
`QuestionSerializer.get_customer`/`get_answer`.)

### Questions that age

After three days an open question is **stale** (`services/knowledge/
aging.py`). The registry gains `open_questions`, `stale_questions` and
`contributions_30d` (source `knowledge`), so the Brain counts them and a
month-end records them; `GET /questions/?stale=true` lists the stale
ones and every question payload carries `days_open`.
`run_health_maintenance` (and `nudge_open_questions` alone) reminds each
assignee of their stale questions — a `question_asked` notification
reading "Still waiting: … asked you about X 5 days ago" — at most once
a day (`Question.last_nudged_at`). Answering is the only thing that
clears it.

### `GET /api/v1/knowledge/okf/` — the workspace as an Open Knowledge Format bundle

Auth: `IsAuthenticated` + `CanViewAllAccounts` (`403` otherwise): a whole-workspace export.
Returns `application/zip` (`Content-Disposition: attachment; filename="revenact-<org>-okf.zip"`,
`Cache-Control: no-store`): one directory holding an [OKF v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format)
bundle (`services/knowledge/okf.py`), conformant per OKF §11:

- `index.md` (root carries `okf_version: "0.2"`) and an `index.md` in every directory; `log.md`.
- `metrics/<key>.md`, `type: Metric`: each metric-layer entry's definition, unit, direction, cuts and
  current whole-organisation value.
- `computations/<key>.md`, `type: Attested Computation`: `runtime: python`, the registry call as the
  `# Computation`, `executor`/`attester` pointing into `references/`, `sources` (registry and rollup),
  `verified: process:revenact-month-end` at the latest month-end snapshot and `stale_after` the month
  end after it (absent before the first snapshot).
- `customers/<slug>-<id>.md`, `type: Customer`: profile, who answers for it, links to its notes;
  `stale_after` its renewal date.
- `knowledge/<customer>/note-<id>.md` (`Knowledge Note`) and `question-<id>.md` (`Answered Question`):
  `generated.by` the author as `human:<name>-<id>` (never an email), the customer as their source.
  Only notes the exporter may read (`visible_contributions`: the org chart, answers to their own
  questions, customers they answer for).

Body links are relative so every consumer follows them. Audited `knowledge.okf_export {bytes}`.

### `GET /api/v1/knowledge/activity/?days=30` — is the company writing things down?

Auth: `CanViewAllAccounts`. Per function (`services/knowledge/activity.py`):
`members`, `contributors` (distinct authors in the window),
`contributions` (answers included), `questions_asked` of that
function, `questions_answered` by it, `questions_waiting` on it (open,
any age), `avg_days_to_answer` (null with nothing answered). No model
call. Shown on the Brain overview as "Knowledge by function".

### @mentions in the Copilot

A message to `POST /copilot/messages/` that @mentions members routes a
question to each of them — on the customer the message was found to be
about, if any — attached to the user turn (`messages[].questions`:
`[{id, assignee, status}]`). The model is told the question has been
routed, acknowledges it in a sentence, and answers what the summary
already covers rather than answering for the person asked.

### The Copilot suggests whom to ask

Every assistant turn carries `ask_suggestions`: the people responsible
for the customer the question was about — `[{user_id, name, function,
function_display, customer_id, customer_name}]`, the asker left out,
empty when no customer was identified — a snapshot of who was
responsible when the answer was given. The screen offers them as one
click under the reply; the click is `POST /customers/<id>/questions/`
with `assignee_id` and `message_id` (the user turn), so the question
keeps the turn it came from and the chat shows whom it asked.
When the caller did not write that turn — forwarding someone else's
question — the stored text reads `Alice Admin asked: "…" — can you
answer?`, so the person asked knows whose question it is.

### The Copilot reads all of it

`copilot.retrieval` adds each customer's contributions as candidates —
prompt line `Engineering (Priya Nair, 2026-09-13): …`, source `type:
"contribution"` with label `Engineering · Priya Nair` — and
`copilot.context` looks the mentioned company up **across the whole
organisation**, so an engineer, a sales rep or the CEO with no book of
their own still gets an answer; their own-book figures are simply
omitted. The digest ends with `Responsible for <customer>: Engineering —
Priya; Customer Success — Carl` so the model can point at a person when
the summary runs out, and the persona tells it to.

Demo: `seed_demo_functions --org-email alice@acme.io` (Priya Nair /
Raj Mehta / Mei Tanaka, responsibilities and contributions on the
Analytics Suite accounts).

## `knowledge` — Gaps and the account brief (Organization Details › Company View, `CompanyViewTab.tsx`)

Two additions to the knowledge layer: what the company **cannot** answer
about a customer, and the standing brief on what it can.

### Models

- `KnowledgeGap` — `organisation`, `customer`, `subject`, `fingerprint`
  (the lowercased subject; unique per customer so the same question
  counts twice rather than raising twice), `function` and `assignee`
  (from `FunctionOwner` when there is one), `source` (`copilot` |
  `question`), `question` (the routed `Question` that first
  raised it), `times_asked`, `status` (`open` | `filled` |
  `dismissed`), `filled_by` (the `Contribution` that answered it),
  `first_asked_at`, `last_asked_at`.
- `AccountBrief` — one per customer: `use_cases`, `stakeholders`
  (`{name, cares_about}`), `open_threads`, `sources` (citation
  snapshots), `generated_by`, `generated_at`.

### Conventions specific to this app

Both are **company-wide**, like the rest of the knowledge layer (see
`_company_customer`): whoever can answer a question about an account is
usually in another function and does not own it, so scoping either to a
CSM's own book would hide the question from the person who could close
it. A gap holds a subject and a count, never a record's words.

The brief is generated as the **customer's owner** reads (the same
principal the nightly AI-attribute pass uses), and what a reader is shown
is filtered again for them. `sources` holds only the citations they may
open and `hidden_sources` counts the rest; when anything was withheld the
brief's own words go with it — `use_cases`, `stakeholders` and
`open_threads` come back empty — because they were written from those
records. This is exactly how an AI attribute's `reasoning` is treated. A
written brief that comes back empty with `hidden_sources` above zero
means "not yours to read", not "nothing to say".

Everything the model reads is citable, so nothing can reach the brief
that could not be counted as withheld: contributions arrive through
retrieval, already scoped, rather than through a second unscoped pass.
The only exception is the customer's own contact list, which anyone who
can open the customer can read anyway.

Gaps are raised from real events, never invented: a Copilot answer about
a company where retrieval returned no sources, and a routed `Question`
still open after three days (`aging.STALE_DAYS`), swept nightly by
`run_health_maintenance`. Every question the sweep sees is stamped with
`Question.gap_raised_at`, whether it named a new gap or joined one
somebody else had already raised in the same words, so no question is
swept twice. Writing a `Contribution` on that customer from
the function that owed the answer fills every open gap it covers,
wherever it was written.

### `GET /api/v1/knowledge/gaps/?customer=<id>&status=<status>`

Unpaginated, most-asked first. `status` defaults to `open`; an unknown
one is a 400.

```json
[{"id": 12, "subject": "Which integrations do they run?",
  "customer": {"id": 7, "name": "Pizza Hut"},
  "function": "engineering", "function_display": "Engineering",
  "assignee": {"id": 5, "name": "Mei"}, "source": "copilot",
  "times_asked": 3, "status": "open",
  "first_asked_at": "...", "last_asked_at": "..."}]
```

### `POST /api/v1/knowledge/gaps/<id>/answer/`

`{"body": "They run Salesforce and Slack."}` → 201 `{gap, contribution}`.
The answer is an ordinary `Contribution`, so it lives with everything
else the company knows. 409 when the gap is already closed, so a second
press never writes a second contribution. Audited as
`knowledge.gap_filled`.

### `POST /api/v1/knowledge/gaps/<id>/dismiss/`

Closes it without an answer → the gap. 409 when it is already closed, so
a dismissal never overwrites an answer. Audited as
`knowledge.gap_dismissed`.

### `GET/POST /api/v1/customers/<id>/brief/`

GET returns the brief as this reader sees it, and never 404s for a
customer that has none: an empty brief with `generated_at: null` is the
honest answer, and the open gaps come back beside it either way.

```json
{"use_cases": ["Dispatching field crews"],
 "stakeholders": [{"name": "Priya", "cares_about": "Fewer no-shows"}],
 "open_threads": ["Waiting on the multi-year quote"],
 "sources": [...], "hidden_sources": 1,
 "generated_at": "...", "generated_by": {"id": 5, "name": "Dana"},
 "gaps": [{"id": 12, "subject": "...", "times_asked": 3, "function": "engineering"}]}
```

POST writes a new one (one model call, purpose `account_brief`) and
returns the same shape with 201. 403 when the organisation's Copilot is
off, 429 over budget, 503 unconfigured, 502 upstream. Audited as
`knowledge.brief`.

---

## `webhooks` — Outbound integrations (Settings > Webhooks, `WebhooksPage.tsx`)

Mirrors: `src/pages/settings/WebhooksPage.tsx`. Its own top-level app,
same "tenant-wide, not owned by one Customer/Account" reasoning as
`scenarios`. See `services/webhooks/engine.py`'s own docstring for the
full SSRF-safety reasoning (URL validated at save time and again
immediately before every send; redirects are never followed) and why
only one event exists in v1.

### Models

- `WebhookSubscription` — `url`, `event` (only `customer.created` in
  v1), `secret` (server-generated, ~256 bits, never client-settable —
  signs every delivery's own `X-Revenact-Signature` header), `is_active`
  (default `True` — unlike Scenario's own `is_active`, there's no
  "silently fires on live data" concern here beyond what creating the
  webhook already implies), `created_at`.
- `WebhookDelivery` — one outbound POST attempt: `webhook`, `success`,
  `status_code` (null if the request never got a response at all —
  DNS failure, connection refused, timeout), `error`, `sent_at`. Same
  audit-trail reasoning as `scenarios.ScenarioRun`.

### Conventions specific to this app

Unlike every other Settings tab (Currency/Global Presets/AI Agent,
Entity Uploads), **both GET and PATCH/POST/DELETE are admin-only**
(`IsOrgAdmin`, not `IsAuthenticated`) — a webhook's URL/secret is
credential-adjacent configuration, same reasoning `/auth/csms/` gates
member management to admins only.

Delivery is synchronous, in the same request that triggered it (there's
no task queue in this codebase — see `services/scenarios/engine.py`'s
own docstring for the identical constraint) — a slow or dead receiving
URL adds real latency to whatever created the Customer, bounded by a
5-second timeout per webhook.

### `GET/POST /api/v1/webhooks/`

Auth: `IsOrgAdmin`. GET: every WebhookSubscription the caller's own
organisation owns. **Pagination off** — small collection, same
reasoning as Scenario's own list. POST: `organisation` set from the
caller; `url` is validated (rejects non-http(s) schemes and anything
resolving to a private/loopback/link-local address) — `400` with the
reason if it fails.

**Response `200`/`201`**
```json
[
  {
    "id": 2,
    "url": "https://example.com/hooks/revenact",
    "event": "customer.created",
    "event_display": "Organization Created",
    "secret": "kX8...redacted...",
    "is_active": true,
    "created_at": "2026-09-04T10:00:00Z",
    "recent_deliveries": [
      { "id": 9, "success": true, "status_code": 200, "error": "", "sent_at": "2026-09-04T10:05:00Z" }
    ]
  }
]
```

### `GET/PATCH/DELETE /api/v1/webhooks/<id>/`

Auth: `IsOrgAdmin`. Scoped to the caller's own organisation (404, not
403, otherwise). PATCH is mainly for toggling `is_active`; `url`/`event`
can be changed too (re-validated the same way as on create). `secret`
is read-only here too — there's no "rotate secret" action yet.

**Response `200`** (GET/PATCH) — same shape as the list endpoint's own
entries. **Response `204`** (DELETE) — empty body.

---

## `fx_rates` — Exchange rates (Settings > Currency's own Exchange Rates section)

Mirrors: `src/pages/settings/CurrencyPage.tsx`'s Exchange Rates section
(no separate Settings tab of its own). Its own top-level app, same
"tenant-wide, admin-only-both-ways" reasoning as `webhooks` — an
exchange rate is financial config, not everyday customer data. Exists
to convert a `customers.Customer`'s own `currency` into the org's
reporting currency wherever money is summed across customers that no
longer share one currency — see `GET /api/v1/customers/stats/`'s own
`unconverted_count` field above for the one place this is actually
used today.

### Models

- `FxRate` — `organisation` (FK, server-set, never client-supplied),
  `currency` (choices, same `Organisation.Currency` set — the "from"
  currency; can't be the org's own current currency, and at most one
  row per currency per organisation), `rate_to_org_currency` (decimal,
  6 places — how many units of the org's own currency equal 1 unit of
  `currency`), `created_at`/`updated_at`.

Deliberately manual entry, current rate only — no point-in-time
history. Nothing in this app renders a real historical ARR-over-time
trend from live backend data today, so a dated rate history would be
infrastructure with no consumer yet; a live/current rate is used
everywhere, a documented simplification, not an oversight.

### Conventions specific to this app

Same admin-gate reasoning as `webhooks`: **both GET and POST/PATCH/
DELETE are admin-only** (`IsOrgAdmin`).

**Changing `Organisation.currency` clears every `FxRate` row for that
organisation** (see `OrganisationSettingsView.perform_update`). A
stored rate means "X → the org's *old* currency" — silently
reinterpreting it as "X → the *new* currency" the moment the org
switches would produce a wrong number with no visible sign anything
was wrong, so the admin has to re-enter rates for the new base
currency instead.

### `GET/POST /api/v1/fx-rates/`

Auth: `IsOrgAdmin`. GET: every FxRate the caller's own organisation has
configured. **Pagination off** — small collection, same reasoning as
Webhook's own list. POST: `organisation` set from the caller; `currency`
is validated — `400` if it's the org's own current currency, or if a
rate for that currency already exists for this org (a friendly error;
the DB's own `unique_together` would otherwise raise a raw 500, since
`organisation` isn't a client-facing field DRF can build its usual
`UniqueTogetherValidator` from).

**Response `200`/`201`**
```json
[
  { "id": 3, "currency": "EUR", "currency_display": "Euro (€)", "rate_to_org_currency": "1.080000", "updated_at": "2026-09-04T10:00:00Z" }
]
```

### `GET/PATCH/DELETE /api/v1/fx-rates/<id>/`

Auth: `IsOrgAdmin`. Scoped to the caller's own organisation (404, not
403, otherwise). PATCH is mainly for updating `rate_to_org_currency` as
real-world rates move.

**Response `200`** (GET/PATCH) — same shape as the list endpoint's own
entries. **Response `204`** (DELETE) — empty body.

---

## `custom_objects` — Custom objects (Settings > Custom Objects, `CustomObjectsPage.tsx`; Organization/Account Details' own "Custom Objects" tab, `CustomObjectsTab.tsx`)

Its own top-level app, same "tenant-wide config, not owned by one
Customer/Account" reasoning as `webhooks`/`fx_rates` for *definitions* —
but unlike those, this app's *records* each belong to exactly one
Customer or Account, same shape as `Opportunity`/`Risk`. The SFDC
"custom object" pattern: an org admin declares a brand-new object type
with its own fields, with no code change or migration needed to add
another one later — see `CustomObjectDefinition`'s own docstring.

### Models

- `CustomObjectDefinition` — `organisation`, `name`, `api_name` (slug,
  server-derived from `name`, unique per organisation), 
  `applies_to_customer`/`applies_to_account` (at least one `True`),
  `created_by`, `created_at`.
- `CustomFieldDefinition` — `object_definition`, `name`, `api_name`
  (slug, server-derived, unique per object), `field_type` (`text` |
  `number` | `currency` | `date` | `boolean` | `picklist`),
  `is_required`, `picklist_options` (list of strings; only meaningful
  for `picklist`), `order` (server-assigned, append-only), `created_at`.
- `CustomObjectRecord` — `object_definition`, `customer`/`account`
  (exactly one set, same `CheckConstraint` shape as `Opportunity`),
  `data` (JSON object keyed by each field's own `api_name`), 
  `created_by`, `created_at`, `updated_at`.

### Conventions specific to this app

**Defining** object/field types is admin-only (`IsOrgAdmin` on every
POST/PATCH/DELETE under `/definitions/`); **reading** definitions and
**all record CRUD** is open to any authenticated org member — adding a
custom-object record is like adding a Task, not like changing webhook
config. `data` is validated field-by-field against the definition's own
real `CustomFieldDefinition`s on every write (required fields present,
values type-correct per `field_type`, no unmapped keys) — see
`CustomObjectRecordSerializer._validate_data`/`_coerce_value`.

### `GET/POST /api/v1/custom-objects/definitions/`

Auth: `IsAuthenticated` (GET) / `IsOrgAdmin` (POST). GET: every
definition in the caller's own organisation, `fields` nested,
`records_count` real (across every parent this definition applies to).
**Pagination off**. POST: `name` + `applies_to_customer`/
`applies_to_account`; `api_name`/`organisation`/`created_by` are always
server-derived, never client-set. `400` if neither `applies_to_*` flag
is set.

**Response `200`/`201`**
```json
[
  {
    "id": 4,
    "name": "Opportunity Line Item",
    "api_name": "opportunity_line_item",
    "applies_to_customer": false,
    "applies_to_account": true,
    "fields": [
      { "id": 9, "name": "Product", "api_name": "product", "field_type": "text", "field_type_display": "Text", "is_required": true, "picklist_options": [], "order": 1, "created_at": "2026-09-06T10:00:00Z" },
      { "id": 10, "name": "Quantity", "api_name": "qty", "field_type": "number", "field_type_display": "Number", "is_required": false, "picklist_options": [], "order": 2, "created_at": "2026-09-06T10:00:00Z" }
    ],
    "records_count": 3,
    "created_at": "2026-09-06T10:00:00Z"
  }
]
```

### `GET/PATCH/DELETE /api/v1/custom-objects/definitions/<id>/`

Auth: `IsAuthenticated` (GET) / `IsOrgAdmin` (PATCH/DELETE). Scoped to
the caller's own organisation (404, not 403, otherwise). DELETE
cascades to that definition's own fields and every record ever created
against it.

### `POST /api/v1/custom-objects/definitions/<definition_id>/fields/`

Auth: `IsOrgAdmin`. `name` + `field_type` (+ `is_required`,
`picklist_options` — required non-empty when `field_type` is
`picklist`); `api_name`/`order` are always server-derived.

### `PATCH/DELETE /api/v1/custom-objects/definitions/<definition_id>/fields/<id>/`

Auth: `IsOrgAdmin`. Scoped to that definition within the caller's own
organisation.

### `GET/POST /api/v1/custom-objects/records/?definition=<id>[&customer=<id>|&account=<id>]`

Auth: `IsAuthenticated`. GET always requires `?definition=`; adding
`&customer=<id>` or `&account=<id>` scopes the list to that one
specific parent's own records (**pagination off** — what
`CustomObjectsTab.tsx` calls on a Customer/Account's own page) —
omitting both instead returns every record of that object type across
the caller's whole organisation, any parent, **paginated** with the
shared `PageNumberPagination`/`PAGE_SIZE` (what the org-wide per-object
page, `CustomObjectRecordsPage.tsx`, calls from the sidebar's own
"Custom Objects" section). Every record — parent-scoped or org-wide —
carries `parent_name`/`parent_type` (same pair as `TaskListSerializer`'s
own), so a cross-parent list can say which Organization/Account each
row belongs to.

POST always requires a real parent: `object_definition_id` + exactly
one of `customer_id`/`account_id` + `data`; `400` with a real reason
for a missing required field, a wrong-typed value, an unmapped `data`
key, a picklist value outside its own real options, a parent type the
definition doesn't `applies_to_*`, or a parent outside the caller's own
organisation.

**Response `200`/`201`, parent-scoped (plain array)**
```json
[
  {
    "id": 21,
    "object_definition_id": 4,
    "customer_id": null,
    "account_id": 17,
    "parent_name": "North America",
    "parent_type": "account",
    "data": { "product": "Seat License", "qty": 50 },
    "created_at": "2026-09-06T10:05:00Z",
    "updated_at": "2026-09-06T10:05:00Z"
  }
]
```

**Response `200`, org-wide (`?definition=` only, paginated)**
```json
{
  "count": 42,
  "next": "http://.../api/v1/custom-objects/records/?definition=4&page=2",
  "previous": null,
  "results": [ /* same shape as above, spanning every parent */ ]
}
```

### `GET/PATCH/DELETE /api/v1/custom-objects/records/<id>/`

Auth: `IsAuthenticated`. Scoped to the caller's own organisation via
whichever of `customer`/`account` is set (404, not 403, otherwise).
PATCHing `data` re-validates it in full against the (unchanged)
definition's own fields.

---

## `requests` — Feature requests with revenue (Brain > Feature Requests, `FeatureRequests.tsx`)

Every email, ticket and call the classifier tagged `feature_request`
(`services.customers.taxonomy`) becomes evidence for a named request, so
product can see which asks carry the most ARR. Grouping is done with the
Copilot's local embeddings; only naming a **new** request costs a model
call (purpose `feature_request`).

### Models

- `FeatureRequest` — `organisation`, `title`, `summary`, `status` (`open` |
  `planned` | `shipped` | `declined`), `owner`, `embedding` (the group's
  centroid, used to match later asks without re-reading its evidence),
  `created_at`, `updated_at`.
- `RequestEvidence` — `request` (null when dismissed), `organisation`,
  `kind` (`email` | `ticket` | `call`) + `record_id` (unique together: one
  filing per interaction), `customer`/`account` (exactly one), `snippet`,
  `occurred_at`, `dismissed`.

### Conventions specific to this app

**Reading** is open to any member, but the revenue, the counts and the
evidence are computed **over the companies that member may open**
(evidence on an organisation through `visible_customers`, evidence on an
account through `visible_accounts` — an account under an organisation they
may open can still be closed to them): two people legitimately see different ARR on the
same request. **Gathering and curating** (`PATCH`, merge, evidence move
and dismiss) need `view_all_accounts`, since gather spends credits and
curation is an organisation-wide judgement. An account's ask counts the
ARR of its parent organisations, under the org's own `arr` global
attribute mapping.

### `GET /api/v1/requests/?status=<status>&scope=<scope>`

Unpaginated, most revenue first:

```json
[{"id": 4, "title": "Slack alerts", "summary": "Push alerts into Slack.",
  "status": "open", "owner": {"id": 5, "name": "Dana"},
  "arr": "200000", "companies": 2, "interactions": 2,
  "last_90_days": 2, "previous_90_days": 0,
  "created_at": "...", "updated_at": "..."}]
```

`?scope=me|team|company` (optional, resolved like the Brain's: 400
`SCOPE_UNKNOWN`, 403 `SCOPE_NOT_ALLOWED`) narrows the evidence to that
scope's book before `arr`, `companies` and the counts are worked out; `arr`
then counts only the book's customers the reader may open, and a request
with no evidence left is dropped. Without it (or empty), as before.

### `GET /api/v1/requests/<id>/`

The row above plus `companies_asking` (each `{id, name, arr}`, most
revenue first; `companies` stays the count) and `evidence` (each `{id, kind, record_id, snippet, occurred_at,
company: {type, id, name}}`), both limited to what the reader may open.
`?scope=` narrows the same way; a request with no evidence left in the
scope is a 404. `PATCH` answers with the unscoped detail.

### `PATCH /api/v1/requests/<id>/`

`{"status": "planned", "owner": 5, "title": "...", "summary": "..."}` →
the detail body. `view_all_accounts` only; audited as `request.update`.

### `POST /api/v1/requests/gather/`

Files every unfiled classified ask: into an existing request when its
embedding is close enough, else into new titled requests, one model call
each (naming reads a sample of at most 20 asks, not the whole cluster).
200 `{"created": 2, "linked": 3, "remaining": 0}`. When the model
stops part-way the work already done is kept and returned with the
failure code (429 budget, 503 not configured, 502 upstream) plus
`remaining`. `view_all_accounts` only; 403 when the Copilot is off. Each
new request is audited as `request.create`. The nightly
`run_health_maintenance` pass runs the same thing per organisation.

### `POST /api/v1/requests/<id>/merge/`

`{"into": 7}` moves every piece of evidence and deletes this request →
`{"id": 7, "moved": 2}`. 400 when merging into itself. Audited as
`request.merge`.

### `POST /api/v1/requests/evidence/<id>/move/` and `.../dismiss/`

Refile one ask under another request, or drop it (it stays filed as
`dismissed` so the next gather leaves it alone).

## `mcp` — Somebody's own agent, reading as them (Settings > Agent Access, `AgentAccessPage.tsx`)

An MCP server, so an agent outside Revenact can read what its owner could
read in the app. JSON-RPC 2.0 over one POST; no new dependency, because
MCP is JSON-RPC and a read-only server needs three methods.

### Model

- `McpToken` — `user`, `label`, `token_hash` (SHA-256; the secret is shown
  once and never stored), `hint` (the last few characters), `last_used_at`,
  `revoked_at`.

### Conventions specific to this app

**The token is the person.** Every tool runs under that user's own
visibility, through the same helpers the app uses: their book, their
mail, their department's tickets. There is no wider path, and no
organisation-level key — an agent is somebody's agent. It is also their
*current* access: a token whose owner has been deactivated stops
resolving, and deactivating somebody revokes their tokens outright,
beside the refresh tokens that are already blacklisted.

A key can spend the organisation's model budget through `ask_copilot`, so
requests are rate limited **per key** (`THROTTLE_MCP`, 60/min by default)
rather than per address: one key is one agent wherever it runs.

**Read-only by design.** A tool that changed a record would put a
person's name on an action they did not take. That needs its own
decision, not a default.

Every `tools/call` is audited as `mcp.tool_called` with the tool, the
token's label and the argument names, and its outcome, so a person can
see what their agent did.

### `POST /api/v1/mcp/`

`Authorization: Bearer <token>`. A missing, wrong or revoked token is a
401; everything else is a JSON-RPC response with HTTP 200, including
errors, which is what the protocol asks for.

- `initialize` → `protocolVersion`, `capabilities.tools`, `serverInfo`
  and instructions.
- `tools/list` → each tool's `name`, `description` and `inputSchema`.
- `tools/call` with `{name, arguments}` → `{content: [{type: "text",
  text}], isError}`. A refusal is a result, not a transport failure —
  including a spent budget or an unconfigured model, so an agent can tell
  "out of budget" from "no such company" and act differently.
- A notification (no `id`) is answered with 204.
- Anything else → JSON-RPC `-32601`; a malformed envelope → `-32600`.

**Tools:** `search_companies`, `get_company`, `recent_interactions`,
`list_feature_requests`, `list_anomalies`, `ask_copilot` (one model call,
purpose `mcp`). A company the caller may not open answers the same way as
one that does not exist. `list_anomalies` follows the anomaly title rule (see
`anomalies`): the stored title only for a caller who sees every account.

### `GET/POST /api/v1/mcp/tokens/` and `DELETE /api/v1/mcp/tokens/<id>/`

A person's own keys. POST takes `label` and is the **only** time `token`
is returned:

```json
{"id": 4, "label": "Claude Desktop", "hint": "…7fQx",
 "created_at": "...", "token": "rvn_mcp_..."}
```

GET lists them without it. DELETE revokes one; another person's token is
a 404. Audited as `mcp.token_issued` / `mcp.token_revoked`.

---

## `translation` — Reading in your language, writing in theirs (`CommunicationsPage.tsx`, `ReplyBox.tsx`)

### Models

- `Translation` — `organisation`, `kind` (`email` | `ticket` | `call` |
  `mail_message`) + `record_id` + `language` (unique together: one
  translation per record per language), `detected_language`, `text`, and
  `source_hash`, a digest of the words it was made from so an edited
  record misses the cache rather than showing a translation of what it
  used to say.

### Conventions specific to this app

A translation is a **copy of the record's words**, so reading one is
gated on the record itself, every time: mail under its mailbox owner and
their chain, a ticket under its department, a mailbox message under its
owner, and everything under the company rule as well. A record the
caller may not read is a 404, cached translation or not.

Translating a record keeps the result, so the second person to open the
same message pays nothing. Translating loose text — a reply being
written — keeps nothing, because a draft is not a record.

When a record is translated for the first time, the sender's contact
learns the language it was written in, but only if nobody has set one:
`Contact.language` set by a person is their answer and a detection never
overrules it. The sender is read from `from_address` for mail and
`requester_email` for a ticket; a call has no writer, so nothing is
learned from one. The contact is looked up on the company the record
actually hangs off, customer or account.

The communications queue carries `writer_language` on the rows somebody
wrote, so the reply box can offer to write back in it.

### `POST /api/v1/translations/`

`{"kind": "email", "id": 412, "to": "en"}` → 201 when it was translated
now, 200 when it came from the cache:

```json
{"text": "Can you explain the September invoice?", "to": "en",
 "detected_language": "fr", "made_now": true}
```

`{"text": "Hello there", "to": "fr"}` translates a draft and stores
nothing. 400 without a valid language code or with nothing to translate,
403 when the organisation's Copilot is off, 404 for a record the caller
may not read, 429 over budget, 503 unconfigured, 502 upstream. One model
call, purpose `translate`. Audited as `translation.made` when a record's
translation is written.

`Contact` gains `language`, readable and writable on the contact
endpoints.

---

## `anomalies` — What suddenly started going wrong (Brain > Anomalies, `Anomalies.tsx`)

One fault reported by eight accounts reads as eight tickets everywhere
else in this product. Here it reads as one thing to fix.

### Models

- `Anomaly` — `organisation`, `title`, `summary`, `status` (`live` |
  `acknowledged` | `resolved`), `embedding` (the cluster's centroid, so a
  later report joins it without another model call), `acknowledged_by`,
  `first_seen_at`, `last_seen_at`.
- `AnomalyEvidence` — `anomaly`, `organisation`, `kind` + `record_id`
  (unique together: one filing per interaction), `customer`/`account`
  (exactly one), `snippet`, `mailbox_owner` and `department` copied from
  the source, `occurred_at`.

### How a cluster is found

Over the classified interactions of the last 14 days, detection embeds
each one with the local model, attaches it to an open cluster whose
centroid it is close to, and groups the rest among themselves. A group
becomes an anomaly only when it spans at least **3 different companies**
and is at least **twice** what the same subject drew in the preceding 14
days — a subject that draws the same traffic every fortnight is the
weather, not news. Each window is read by its own query per kind, so a
busy fortnight cannot crowd out the history it is being compared against.
A `resolved` cluster takes no new evidence.

**Naming reads only what nobody owns personally.** Anyone who can see one
report in a cluster sees its name, so the name is written from reports
with no mailbox owner and no department — never from one person's mail or
one department's queue. A cluster with nothing shared in it is named from
its own shape ("Unnamed cluster across 4 companies") and costs no model
call at all. When a name is written, it is one call (purpose `anomaly`),
from a sample of at most 15 reports, told to describe the problem in its
own words and never to quote a report, a person or a company. That last
rule is enforced, not trusted: a returned title that names any of the
organisation's customer or account names (case-insensitive, whole word,
names shorter than 3 characters ignored) falls back to the plain title
above, and a summary that does is stored empty. The rejection is logged
without the rejected text.

### Conventions specific to this app

Reading is open to any member and scoped twice, as everywhere else that
copies record text: the companies they may open (evidence on an
organisation through `visible_customers`, evidence on an account through
`visible_accounts` — an account under an organisation they may open can
still be closed to them), and the records they may read
(`services.customers.personal.readable_evidence_q`, shared with
feature requests). A cluster a reader can see nothing of is left out
rather than shown as a zero, and its detail is a 404 for them: its title
was written from reports they may not read. Detecting and setting a
status need `view_all_accounts`.

**Title rule.** The stored `title` and `summary` are model-written from
reports across the whole organisation, so they are returned as written
only to a viewer who passes `sees_everything` (`view_all_accounts`).
Everyone else gets `title: "Similar reports across <n> of your companies"`
(`<n>` = the distinct companies behind their own visible evidence, the
same number as `companies`) and `summary: null`. One helper
(`services.anomalies.views.title_for`/`summary_for`) serves this API, the
dashboard attention list, Copilot's dashboard grounding and the MCP
`list_anomalies` tool, so they cannot drift apart.

### `GET /api/v1/anomalies/?status=<status>&scope=<scope>`

Unpaginated, most revenue first.

```json
[{"id": 3, "title": "SSO login failures", "summary": "...",
  "status": "live", "arr": "30000", "companies": 3, "interactions": 7,
  "first_seen_at": "...", "last_seen_at": "...", "acknowledged_by": null}]
```

`?scope=me|team|company` (optional, resolved like the Brain's: 400
`SCOPE_UNKNOWN`, 403 `SCOPE_NOT_ALLOWED`) narrows the evidence to that
scope's book before `arr`, `companies` and the counts are worked out; an
anomaly with no evidence left is dropped; titles are gated exactly as
without a scope. Without it (or empty), as before.

### `GET /api/v1/anomalies/<id>/`

The row above plus `companies_hit` (each `{id, name, arr}`, most revenue
first) and `evidence` (each `{id, kind, record_id, snippet, occurred_at,
company}`), both as this reader may see them. `?scope=` narrows the same
way: 404 `{"detail": "No reports you can read."}` when none is left in
the scope.

### `PATCH /api/v1/anomalies/<id>/`

`{"status": "acknowledged"}` → the detail body. `view_all_accounts` only;
audited as `anomaly.update`.

### `POST /api/v1/anomalies/detect/`

Runs detection now → 200 `{"found": 1, "attached": 4}`. The nightly
`run_health_maintenance` pass runs the same thing per organisation. When
the model stops part-way, what was found is kept and returned with the
failure code (429 budget, 503 unconfigured, 502 upstream).
`view_all_accounts` only; 403 when the Copilot is off. Each new cluster is
audited as `anomaly.found`.

---

## `attributes` — AI-filled attributes (Settings > AI Attributes, `AIAttributesPage.tsx`; Organization/Account Details' pinned panel, `AIAttributesPanel.tsx`)

An admin asks a question of every company in plain English ("Which tier
do they use?") and the model answers it per company from the same
evidence the Copilot retrieves, with its reasoning and the records it
cited. Every answer is an append-only row, so the history of a value is
readable, and a person can override in the same timeline.

### Models

- `AIAttribute` — `organisation`, `name`, `api_name` (slug, server-derived,
  unique per organisation), `prompt`, `value_type` (`text` | `number` |
  `boolean` | `picklist`), `picklist_options`, `applies_to_customer` /
  `applies_to_account` (at least one), `refresh` (`manual` | `nightly`),
  `created_by`, `created_at`, `updated_at`.
- `AIAttributeValue` — `attribute`, `customer`/`account` (exactly one),
  `value` (JSON, typed by the attribute; null when insufficient), `reasoning`,
  `sources` (citation snapshots, same shape as a Copilot message's), `status`
  (`filled` | `insufficient` | `failed`), `origin` (`ai` | `human`), `set_by`,
  `computed_at`. Never updated; the newest row is the current value.

### Conventions specific to this app

Defining, updating, deleting and **filling every company at once** are
gated by `manage_custom_objects` (tenant-wide schema and tenant-wide
spend); reading definitions, filling one company and overriding are open
to any member **for companies they may open** (`visible_customers` /
`visible_accounts`; an invisible company is a 404, a non-numeric id a
400). Filling is a model call charged as purpose `attribute`, so it
answers 429 when the budget is spent, 503 when no model is configured and
403 when the organisation's Copilot is off.

**Evidence is read under the asker's own visibility** (personal mail,
private notes, departmental tickets, knowledge contributions: the same
rules as the Copilot). The nightly pass (`run_health_maintenance`) reads
as the company's **owner** would; a company with no owner gets only the
shared records. It fills `refresh=nightly` attributes for companies with
no answer yet or with evidence newer than their last one, oldest answers
first, at most 100 companies per attribute per organisation per night,
and never on top of a person's own answer. One tenant's spent budget skips
that tenant only.

**What a reader sees is filtered again:** `sources` lists only the
citations the reader may open, `hidden_sources` counts the rest, and
`reasoning` is an empty string whenever anything was withheld (it quotes
the records).

### `GET/POST /api/v1/attributes/definitions/`

GET (any member): unpaginated list. POST (`manage_custom_objects`):

```json
{"name": "Product tier", "prompt": "Which tier of our product does this company use?",
 "value_type": "picklist", "picklist_options": ["SMB", "Enterprise"],
 "applies_to_customer": true, "applies_to_account": true, "refresh": "nightly"}
```

201 → the definition with `id`, `api_name` (`product_tier`), timestamps.
400 when a picklist has no options or neither parent type applies.
Audited as `attribute.define`.

### `GET/PATCH/DELETE /api/v1/attributes/definitions/<id>/`

Same read-open / write-gated split. Deleting removes every value ever
recorded; audited as `attribute.update` / `attribute.delete` (with the
number of values that went).

### `POST /api/v1/attributes/definitions/<id>/fill/`

`{"customer": 12}` or `{"account": 7}` → 201, the new value row:

```json
{"id": 90, "attribute": 3, "customer": 12, "account": null,
 "value": "Enterprise", "status": "filled", "origin": "ai",
 "reasoning": "Two notes and a ticket mention the Enterprise tier.",
 "sources": [{"type": "note", "id": 41, "label": "Product usage", "date": "2026-09-22",
              "company": "Pizza Hut", "company_type": "customer", "company_id": 12}],
 "hidden_sources": 0,
 "set_by": {"id": 5, "name": "Dana"}, "computed_at": "2026-09-22T09:00:00Z"}
```

`status` is `insufficient` (value null) when the records do not support
an answer, and `failed` when the answer did not fit the type (the
`reasoning` says why). 400 when the attribute does not apply to that kind
of company.

Empty body (`manage_custom_objects`) → every applicable company the
caller may open, up to 25 per request: 200 `{"filled": 25, "remaining":
40, "values": [...]}`. The rest is picked up by the nightly pass or
another call. Each fill is audited as `attribute.fill`.

### `GET /api/v1/attributes/values/?customer=<id>` (or `?account=<id>`)

Every attribute that applies to the company, with its latest row or null:

```json
[{"attribute": {"id": 3, "name": "Product tier", "api_name": "product_tier",
                "prompt": "...", "value_type": "picklist",
                "picklist_options": ["SMB", "Enterprise"], "refresh": "nightly"},
  "latest": {...value row...}},
 {"attribute": {...}, "latest": null}]
```

400 without a company, 404 for one the caller may not open.

### `POST /api/v1/attributes/values/`

A person's own answer: `{"attribute": 3, "customer": 12, "value": "SMB"}` →
201, a row with `origin: "human"`, `set_by`, no reasoning or sources.
400 when the value does not fit the type or the picklist. Audited as
`attribute.override`.

### `GET /api/v1/attributes/values/history/?attribute=<id>&customer=<id>`

Every row for that attribute on that company, newest first.

## `metrics` — The metric layer (`/api/v1/metrics/`)

Nine dashboards each compute their own rollup, and they agree because the
rules they share (`churn.py`, `contact.py`, `segments.py`) have one home.
A management question cuts across them — "NRR, coverage and shelfware
this quarter against last" — and nothing could answer it, because there
was no list of what the numbers *are*. This app is that list, and the
memory to go with it. It is Phase 1 of turning the product into a
company brain: facts first, then explanations, then decisions.

### Models — `MetricSnapshot`

One number, for one organisation, as a month ended: `organisation`,
`metric` (a registry key), `dimension`/`member` (both empty for the
whole organisation — reserved so a slice by owner or product later is a
row, not a migration), `period_end`, `value` (null when unmeasured that
month — **not zero**), `captured_at`. Unique per
(organisation, metric, dimension, member, period_end).

**Recorded by `run_health_maintenance`**, after the health scores it
reads are fresh, on the same "last completed month" rule as
`HealthSnapshot`, and with the same discipline: an existing row is kept,
never overwritten — it is how the month ended, and upserting it a week
later would replace it with the next month's values so the history
drifted forward every run. A metric added to the registry later is
filled in for a period without touching the rows already there.

### Conventions specific to this app

* **`services/customers/scoping.SystemActor`** — an organisation acting
  as itself. Every rollup takes a `user` and asks scoping what they may
  see; a scheduled job has no user, and impersonating "some admin" would
  tie the job to whoever happens to hold a role. The actor exposes only
  what scoping reads (`organisation`, `has_capability` → True), so a
  rollup that started depending on anything else about a person fails
  loudly rather than seeing something odd.
* **Values are the dashboards' own numbers.** `registry.compute_all`
  runs each source rollup once (`portfolio.build_stats`, the forecast
  bridge, `activity_tracking.build_stats`, a health-mix count over the
  rubric's own `health_category`, an open-ticket count) and each metric
  reads a key out of it. Never a second computation that can drift.
* **Unmeasured stays `None`.** An empty book has no logo retention, no
  NRR and no coverage; it has zero customers and zero open tickets.
* **A source that raises takes its metrics down loudly.** A metric layer
  that swallowed errors and reported `None` would be reporting
  "unmeasured" for what is actually "broken".

### `GET /api/v1/metrics/`

Auth: `CanViewAllAccounts` — every figure is whole-org, and a CSM whose
book is scoped to their own customers would otherwise read the company's
ARR here. `401` unauthenticated, `403` without the capability.

```json
{
  "as_of": "2026-09-12", "currency": "USD",
  "metrics": [{
    "key": "nrr", "label": "Net revenue retention", "unit": "percent", "better": "up",
    "note": "Forecast ARR as a share of opening ARR, before any new logos. ...",
    "dimensions": ["owner", "product"],
    "value": 99.6,
    "previous": {"period_end": "2026-08-31", "value": 97.1},
    "change": 2.5
  }]
}
```

`unit` is `money` (in `currency`), `percent` or `count`; `better` is
`up`, `down` or `none` (context, not a target — a customer count is
neither good nor bad on its own). `previous` is the most recent
month-end snapshot, null when none exists; `change` is null whenever
either side is unmeasured — a move from "unknown" to 40 is not a rise
of 40.

The eighteen metrics in this slice: `active_customers`, `active_arr`,
`average_arr`, `logo_retention`, `churned_arr_12m`, `top_three_share`,
`forecast_arr`, `nrr`, `at_risk_arr`, `seat_utilisation`,
`shelfware_arr`, `at_capacity_arr`, `coverage`, `dark_accounts`,
`dark_arr`, `healthy_share`, `poor_health_count`, `open_tickets`.

### `GET /api/v1/metrics/<key>/by/<dimension>/`

One metric, cut one way — the "why" layer's raw material. `dimension` is
`owner`, `product`, `segment` or `lifecycle`; each metric declares which
cuts it has (`registry.Metric.slices`), and a cut is only ever one the
underlying rollup already draws or a plain regrouping of rows it scored
— never a new rule. Forecast metrics by owner/product go through
`forecast.bridge_by`, which reuses `build_bridge` per group so the
groups' opening ARR, downside and forecast add up to the whole's. A
metric asked for a cut it doesn't have is a `404` that names the cuts
it does.

```json
{"metric": {"key": "at_risk_arr", ...},
 "dimension": {"key": "product", "label": "Product"},
 "currency": "USD",
 "members": [{"member": "4", "label": "Product B", "value": 64090.0,
              "previous": {"period_end": "2026-08-31", "value": 64090.0}, "change": 0.0}]}
```

Members are largest first, unmeasured last; `member` is a stable id (an
owner or product pk, `unassigned`/`none`, a segment key, a lifecycle
value) so the same member's month-end row is found again next month.
`record_period_end` writes these cuts beside the whole-org rows, on the
same keep-don't-overwrite rule.

### `GET /api/v1/metrics/signals/`

The metrics that moved materially since the last month-end, bad news
first, each naming the members that moved it most. "Material" is
deliberately blunt: 5 points for a percent metric, 10% relative for
money and counts — a short list a manager reads, not a statistical test
over one month of history. Empty, with `baseline: null`, until a
month-end exists to compare against; the response says so rather than
inventing a baseline.

```json
{"as_of": "2026-09-12", "baseline": "2026-08-31", "currency": "USD",
 "signals": [{"key": "at_risk_arr", "label": "ARR at risk", ..., "value": 114540.0,
              "previous": {"period_end": "2026-08-31", "value": 80000.0}, "change": 34540.0,
              "improved": false,
              "drivers": [{"dimension": "product", "dimension_label": "Product", "member": "4",
                           "label": "Product B", "value": 64090.0, "change": 30000.0}]}]}
```

`improved` is null for a metric whose `better` is `none`. `drivers` is
the five biggest absolute moves across every cut the metric has, and is
empty for a metric with no cuts.

### `GET /api/v1/metrics/brief/`, `POST /api/v1/metrics/brief/generate/`

The management brief: the metric layer read out loud by Claude. The
per-customer Headlines generator writes one account's story from its
records; this writes the organisation's from the metric layer — the
numbers, what moved since the last month-end, and what the cuts say
drove it — through the same `anthropic_client`.

**Grounded, and checkably so.** The prompt carries exactly the figures
the screen shows (`brief.build_prompt`) — no records, no customer names,
nothing the snapshots don't hold — and the evidence is stored beside the
text (`Brief.evidence`), so any sentence can be checked against the
numbers it was written from. "Unmeasured" is written as unmeasured,
never zero.

**Stored, not regenerated on view.** A brief costs a real model call,
and last month's brief is itself a record. `GET` returns the latest
(`{"brief": null}` before one exists); `POST .../generate/` writes a new
one — an explicit action, never a side effect of loading the page.
Error mapping matches `HeadlineGenerateView`: `503` when no provider is
configured, `502` when the call fails or the answer isn't readable,
`422` for an organisation with no customers. Both gated on
`view_all_accounts`.

```json
{"brief": {"id": 3, "as_of": "2026-09-12", "baseline": "2026-08-31",
           "headline": "…one sentence, a fact…",
           "body": "…3-5 paragraphs, blank-line separated…",
           "watch": ["…2-4 things, each citing a figure…"],
           "generated_at": "2026-09-12T15:40:02Z", "generated_by": "Alice"}}
```

### Initiative `work` — the tasks under a decision

`Task.initiative` (customers migration 0035, SET_NULL) links a to-do to
the decision it serves. `agents.deciding.approve` sets it when a task
proposal carries `initiative`, so approving from Waiting on you (Brain) or
Recommended (Work) is the follow-through, not a separate step. Every initiative payload carries
`work` `{open, done, tasks: [{id, title, parent_name, parent_type,
parent_id, assignee_name, due_date, priority, status}]}`, open first and
soonest due first; task payloads carry `initiative` `{id, title}` or
null.

### `GET /api/v1/metrics/graph/` — the knowledge graph

Auth: `CanViewAllAccounts`. The brain's real relations as one graph
(`services/metrics/graph.py`): `nodes` of five kinds — `owner`,
`customer`, `product`, `initiative` (planned/active), `proposal`
(pending) — and `edges` `{from, to, kind}` only where a real relation
exists: `owns` (owner → customer), `runs_on` (customer → primary
product), `targets` (initiative → the product or owner its cut names),
`acts_on` (task proposal → customer), `serves` (proposal → linked
initiative). Every figure is the dashboards' own: customer `arr`,
`downside`, `risk`, `days_to_renewal` from the forecast rows,
`health_category`/`health_score`, `open_tasks`; product and owner nodes
sum `customers`, `arr`, `downside` over their customers. Node ids are
`kind:pk`. Customers are capped at 200, largest ARR first. Frontend:
`/brain/graph`. Every member reads the scoped graph at
`/api/v1/brain/graph/?scope=`.

```json
{"as_of": "2026-09-13", "currency": "USD",
 "nodes": [{"id": "customer:7", "kind": "customer", "label": "Pizza Hut", "arr": 69600,
            "downside": 17400, "risk": 0.25, "health_category": "average", "health_score": 5.1,
            "days_to_renewal": -34, "open_tasks": 1},
           {"id": "product:4", "kind": "product", "label": "Product B", "customers": 3, "arr": 180000, "downside": 64090},
           {"id": "initiative:1", "kind": "initiative", "label": "Halve the ARR at risk on Product B", "status": "active",
            "metric": "at_risk_arr", "metric_label": "ARR at risk", "member_label": "Product B",
            "target_value": 32000, "target_by": "2026-11-30", "owner": "Carl CSM"}],
 "edges": [{"from": "customer:7", "to": "product:4", "kind": "runs_on"},
           {"from": "initiative:1", "to": "product:4", "kind": "targets"}]}
```

### Models — `Explanation`

Why one metric is where it is, in the model's words, as of one day. The
latest per metric is what the Brain shows beside the number; older rows
stay as a record of what was said about the figure then. `inputs` is
exactly what the prompt carried — the definition, the value and its
month-end, every cut with each member's own move, the accounts carrying
the downside, open decisions on the number — and `evidence` the lines
the model chose to cite.

### `GET /api/v1/metrics/<key>/explanation/`, `POST /api/v1/metrics/<key>/explain/`

Auth: `CanViewAllAccounts`; a key the registry lacks is a `404`.
`GET` returns `{"explanation": {...}}` or `{"explanation": null}` before
one is written — reading is free. `POST` (`services/metrics/explain.py`)
is a real, paid call under the `explain` purpose: 2–4 sentences on why
the number is where it is and, when a month-end exists, what moved it,
naming the members and accounts with their figures; no advice. Every
figure must come from the input; "unmeasured" stays unmeasured. `201`
with the new row; `422` with no live customers; `429`/`503`/`502` as the
brief's. The frontend offers it as **Why?** on every metric tile and
every signal row.

```json
{"explanation": {"id": 3, "metric": "at_risk_arr", "metric_label": "ARR at risk",
  "as_of": "2026-09-13", "baseline": "2026-09-12", "value": 114540, "previous_value": 80000,
  "text": "ARR at risk rose because …", "evidence": ["Product B: USD 64,090 (was USD 34,090)"],
  "generated_at": "2026-09-13T06:10:00Z", "generated_by": "Alice"}}
```

### Models — `Initiative`

A decision, with a number attached. Management's half of the brain: the
metric layer says what the numbers are and what moved them; an
initiative says what someone decided to do about one of them — a
`hypothesis`, a `metric` from the registry (optionally one cut of it,
`dimension` + `member`, which must be a cut the registry has), a
`target_value`, a `target_by`, an `owner` — and is then judged against
the same registry everything else reads, so "did it work" is a fact
rather than a memory.

`baseline_value`/`baseline_as_of` are the starting line, captured when
the initiative is written from the registry as it stood that day, and
never re-read: the point is movement since the decision. `member_label`
is kept as it read at creation so a card still says "Product B" if the
cut is later empty. `status` is `planned`/`active`/`done`/`abandoned`;
closing stamps `closed_at`, reopening clears it; `outcome` is what
happened, written at close.

### `GET/POST /api/v1/metrics/initiatives/`, `GET/PATCH/DELETE /api/v1/metrics/initiatives/<id>/`

Auth: `CanViewAllAccounts`. Unpaginated. Each row carries the live
judgement:

```json
{"id": 1, "title": "Bring Product B's risk down",
 "metric": "at_risk_arr", "metric_label": "ARR at risk",
 "dimension": "product", "dimension_label": "Product", "member": "4", "member_label": "Product B",
 "target_value": "30000.0000", "target_by": "2026-11-11",
 "owner": {"id": 5, "name": "Carl CSM"}, "status": "active", "status_display": "Active",
 "baseline_value": "64090.0000", "baseline_as_of": "2026-09-12",
 "progress": {"baseline": 64090.0, "current": 64090.0, "target": 30000.0,
              "progress_pct": 0.0, "days_left": 60, "direction": "down", "unit": "money", "better": "down"},
 "history": [{"period_end": "2026-09-30", "value": 58000.0}]}
```

`progress.current` is the registry's value now (whole-org or the cut's
member); `progress_pct` is the share of the way from the starting line
to the target, clamped 0–100 and null when either end is unmeasured or
the target equals the baseline; `history` is the month-end snapshots for
that number since the baseline, so a card can draw the path. A page of
initiatives computes the registry once (`initiatives.Figures`), not once
per row. Writes take `owner_id`; validation refuses an unknown metric, a
cut the metric doesn't have (naming the ones it does), a member not in
that cut, a past `target_by` on create, and an owner from another
organisation. Create and PATCH are audited (`initiative.created`,
`initiative.updated`, `scope: "company"`).

### `GET /api/v1/copilot/conversations/<id>/session/` and the WebSocket push — events carry no turn text

The session snapshot (`GET .../session/?since_id=`, and the same
`CopilotSessionSerializer` payload pushed over `ws/copilot/sessions/<id>/`
by `copilot.realtime.broadcast_session_update`) reaches everyone
`conversations_visible_to` admits — including a person who is only
mentioned and may read just a slice of the turns. So each event's
`message` is a **reference only**, never the turn's `content`, `sources`,
`context`, `author`, `questions` or `ask_suggestions`:

```json
{"id": 41, "kind": "redirected", "actor": {"id": 3, "name": "Bob"},
 "message": {"id": 118, "role": "user", "created_at": "2026-09-25T10:02:11Z"},
 "payload": {}, "created_at": "2026-09-25T10:02:11Z"}
```

To show the turn, refetch `GET /api/v1/copilot/conversations/<id>/`,
whose `messages` apply `visible_messages` — the only path turn text
travels. `message` is `null` on events that are not about a turn
(`made_live`, `joined`, `left`, `handed_off`, `closed`); a `handed_off` event's
`payload` carries `to_user_id`, `to_user_name` and the owner's `note`.

**The hand-off note and the company names are per viewer.** On the REST
poll, `payload.note` is the owner's text only for a viewer who sees the
whole conversation (the owner, an accepted present participant —
`copilot.views.sees_whole_conversation`) and `null` for anyone else;
`customer_name` / `account_name` are set only when the viewer may open
that customer / account (`visible_customers` / `visible_accounts`), and
`null` otherwise — `customer_id` / `account_id` are always present. The
WebSocket push is one payload for the whole group, so it always carries
`note: null`, `customer_name: null` and `account_name: null`; a client
reads them from its own `GET .../session/`.

**Only whole-conversation viewers change a session.** Every session-
changing request requires `sees_whole_conversation` (the owner, or an
accepted present participant who holds a grant); a person who is only
mentioned reads a slice and gets `403`. Posting a message is not a
session change:

| Route | Who |
|---|---|
| `POST .../session/` (make live) | owner (404 otherwise) |
| `POST .../session/invite/` | owner (404 otherwise); `user_id` = caller → `400` |
| `POST .../session/handoff/` | owner or participant (`403` otherwise); `to_user_id` = caller → `400` |
| `POST .../session/close/` | owner (404 otherwise) |
| `GET/POST .../session/decisions/` | owner or participant (`403` otherwise) — proposals come from the whole transcript |
| `POST /copilot/messages/` into a conversation with a session (a redirect) | anyone the conversation is visible to, a mentioned person included — not a session change: their history is their own slice (`visible_messages`), grounding their own scope, and the `redirected` event carries the turn's id only |
| `POST /copilot/sessions/invites/<id>/respond/` | the invite's own target only (404 otherwise), and only while it is `pending` (an accepted or declined invite is `400`); accepting is `400` unless the inviter is someone else who still sees the whole conversation |

**Access is valid only along a chain from the owner.** The grant
holders of a conversation are a fixed point: start with the owner; add
the invitee of any accepted invite whose inviter is already a holder
(and is not the invitee); repeat until nothing is added
(`copilot.views.grant_holders`). `sees_whole_conversation` and
`conversations_visible_to` grant a participant the whole conversation
only when they are a holder **and** present; a participant row alone,
a self-issued invite, an invite from a mentioned-only viewer (and
anything its invitee issued after), or one from a since-deleted inviter
grants nothing — rows written before this rule neutralised with no data
migration (the owner re-invites if a legitimate chain broke). Accepting
needs an inviter who is a present holder. `GET /copilot/sessions/invites/`
lists only invites that can be accepted; an invite that can't serializes
with `conversation_title: "Shared conversation"` and `account_label: null`.

**Titles and notices follow visibility too.** A conversation's `title`
is its first turn's opening words, so the list and detail endpoints
return `"Shared conversation"` unless the viewer sees the whole
conversation or that first turn is in their `visible_messages`
(`copilot.views.reads_first_turn`); `origin` is `null` on the same
terms, and also unless the viewer reads the first Ask turn
(`copilot.views.header_for`). The invite and hand-off notifications and
the invite card's `account_label` name the customer/account only when
the recipient may open it (`null` / omitted otherwise), and the hand-off
notification carries the note only when the target already sees the
whole conversation — a pending target reads it on the session after
accepting.

### `POST /api/v1/copilot/conversations/<id>/session/close/` with `capture_decisions`

Body `{"capture_decisions": true}` runs the facilitator in the same
request once the session is closed, returning the closed session plus
`decisions` (the proposals written, **as this reader may see them** — see
"Decisions are served, not just stored" below), `decisions_hidden` (how
many were left out) and `decisions_error` (null, or why nothing was
captured — nobody spoke, budget spent, provider down; on an error,
`decisions: []` and `decisions_hidden: 0`). **The close always stands**:
a failed capture never undoes it. Without the flag the close makes no
model call.

### `GET/POST /api/v1/copilot/conversations/<id>/session/decisions/` — the facilitator

Auth: `IsAuthenticated`, and the conversation must be visible to the
caller (`conversations_visible_to`: owner, or an accepted, still-present
participant) and have a session — otherwise `404`. The facilitator
(`services/metrics/facilitator.py`) reads the session — the transcript
with each human turn's author (the owner sent the opening query; every
later human turn is tagged by its `redirected` event), who took part, who
handed off to whom and why — beside the Ops agent's own evidence, and
writes **what the people decided** as agent actions (Waiting on you, Recommended)
tagged with the session (`Proposal.session`, surfaced as `source`
`{session_id, conversation_id, title}` on every proposal payload).

The prompt also carries **what the rest of the company has written about
the account** — the last ten contributions (function, author, date), so a
decision is not captured blind to engineering, sales or analytics context
— and the agent may cite them as evidence.

Decisions, not suggestions: the prompt admits only what a person decided
or agreed to; an idea the assistant floated that nobody took up is not a
decision, and an empty array is the right answer for a session where
nothing was settled. The session's own account is added to the accounts
the agent may target even when it carries no measurable downside, so a
task on it validates; everything else is validated exactly as the Ops
agent's answers are (`proposals.store_answer`), and approval runs through
`POST /api/v1/agents/actions/<id>/approve/` under its own permission.

`POST` is a real, paid call under the `facilitator` purpose (`201` with
`{"proposals": [...], "hidden": n}`; `422` when nobody has spoken in the
session or the book has no live customers; `429`/`503`/`502` as the Ops
agent's). `GET` lists the proposals already written from this session,
oldest first, in the same `{"proposals": [...], "hidden": n}` shape.

**Decisions are served, not just stored** (`services.metrics.
proposal_access.served_proposals`, `# SOC2:AUTH-02`). The facilitator
always *stores* every proposal it writes — they land in Waiting on you
and Recommended and are decided there under `decided_as`'s own permission
(`services.brain.waiting`) — but what this route *serves* to the caller
is narrower for anyone without `view_all_accounts`:
- `evidence` is `[]` and `rationale` is `null` on every proposal — both
  are model-written from the whole organisation's figures
  (`proposals.build_evidence`), the same reason
  `services.brain.waiting` withholds them on the Me/My team/Company desk.
- `initiative` is `null` on every proposal too, even a `task` about a
  customer the caller can open — a linked initiative is `view_all_accounts`
  only everywhere else (the
  Brain waiting desk), and this route doesn't become the exception.
- `decision_note` is `null` on an `initiative` proposal specifically (its
  decider is always `view_all_accounts`, and the note can quote
  organisation-wide figures); a `task` proposal's `decision_note` is kept,
  since its decider can be the customer's own owner.
- A `task` proposal whose `action.customer_id` names a customer the
  caller cannot open (`visible_customers`), or one that no longer
  exists, is left out of `proposals` entirely and counted in `hidden`
  instead of being served with a stand-in.
- `initiative` proposals are always kept (evidence/rationale/initiative
  withheld the same way).
- A `view_all_accounts` caller gets every proposal unchanged and
  `hidden: 0` — the shape `metrics.proposal_access.proposal_payload` serves.

### Models — `Feedback`

A person correcting something the system said — the feedback log. Three
kinds: `classification` (the model's tags on a ticket/email/call, fixed
by hand), `proposal` (the Ops agent's proposal approved or rejected, with
the note), `health_override` (a CSM overriding the rubric's score, or
clearing the override). Each row keeps `before` (what the system said)
and `after` (what the person said), `subject_type`/`subject_id`/
`subject_label`, `note`, `made_by`. This is the set of cases the next
prompt, taxonomy or rubric change should be read against.

### `PATCH /api/v1/interactions/<ticket|email|call>/<id>/classification/`

Auth: `IsAuthenticated`, and the record must be visible to the caller
(otherwise `404`). Body: any of `area`, `category`, `subcategory`,
`sentiment` — stored values or human labels, the same tolerance the
classifier's parser has — plus an optional `note`. A subcategory must sit
under the chosen category (the taxonomy's rule, `400` otherwise); a
value the taxonomy lacks is a `400`; a no-op is a `200` with
`feedback: null`. Stamps `classification_corrected_at` on the row, and
**`classify_interactions --reclassify` leaves corrected rows alone** from
then on (`--include-corrected` to override): a person's correction
outranks the model. Returns the row's new `keys`, `labels`, `corrected`
and the `Feedback` entry written.

### `GET /api/v1/metrics/feedback/`

Auth: `CanViewAllAccounts`. Newest first, up to 200; `?kind=` narrows;
`counts` gives the total per kind — the cheap answer to "how often is
the model wrong, and about what".

```json
{"counts": {"classification": 2, "proposal": 4, "health_override": 1},
 "feedback": [{"id": 9, "kind": "classification", "kind_display": "Classification corrected",
               "subject_type": "ticket", "subject_id": 12, "subject_label": "Slow page load for large accounts",
               "before": {"area": "support_operations", "category": "integration_support", "subcategory": "webhook_failure", "sentiment": "neutral"},
               "after": {"area": "product_growth", "category": "bug_report", "subcategory": "performance_issue", "sentiment": "neutral"},
               "note": "It's a perf bug, not a webhook.", "made_by": "Carl CSM", "created_at": "2026-09-12T18:20:11Z"}]}
```

### `GET /api/v1/metrics/<key>/history/`

The month-end series for one metric, oldest first, this organisation
only. A month with no row is absent, not zero. Unknown key → `404`.

```json
{"metric": {"key": "active_arr", "label": "ARR", "unit": "money", "better": "up", "note": "..."},
 "currency": "USD",
 "points": [{"period_end": "2026-07-31", "value": 640200.0}, {"period_end": "2026-08-31", "value": 688600.0}]}
```

## `customers` — Communications (`/communications`, `CommunicationsPage.tsx`)

The queue of things where a person is waiting on the caller, merged across four
models. Mirrors `react-ts-app/docs/design/communications.md`, which is the
product specification this was built from.

Two endpoints and no new model. What "waiting" means lives in
`services/customers/communications.py`; the views only turn it into HTTP.

### Why these four, and why one list

A customer email with no reply, a colleague's open question, an open ticket in
your department and a call logged without a summary all mean the same thing to
whoever opens the page: somebody asked and nobody answered. Ordering them by how
long each has waited, rather than by which table they came from, is the whole
product idea. Everything else in the app is scoped to one customer, so there was
previously no way to find an unanswered email without opening accounts one at a
time.

### Visibility

The module owns **no** rules of its own. Each channel starts from the helper
that already decides who may read that model, so the queue can never show a row
the record's own page would hide:

| Channel | Rule | Defined in |
|---|---|---|
| email | mailbox owner and their management chain | `services/mail/visibility.py` |
| question | the assignee | filtered directly on `Question.assignee` |
| ticket | own department plus undeparted; Leadership sees all | `services/customers/personal.py` |
| call | the customers and accounts you can see | `services/customers/scoping.py` |

`?scope=team` widens from the person to the person plus their subtree, which is
what the chain rules already permit. It deliberately does **not** change the
ticket count: a ticket carries a department, not an assignee, so there is no
personal ticket to separate from a team one. `stats` says so in
`ticket_scope_note` rather than pretending the two differ.

A question is routed by assignee, not by customer. Under `?scope=team`, a
report's question about a customer the caller may not open
(`visible_customers`) comes with `account: null` and `context: null`: no name,
id, health, ARR, renewal or owner. A `q` search cannot find it by that name
either. The question's own words (`subject`, `preview`) are shown as before.
Emails, tickets and calls are read through their customer or account's own
visibility already.

### What counts as a reply owed

An `Email` with `direction="received"` that is the **newest message in its
thread** for that mailbox. Expressed as "no later email exists in the same
thread", not "no reply exists", because a thread where they wrote three times
and nobody answered is one debt rather than three: excluding any email with a
later sibling leaves exactly the newest message per thread, and it is owed
precisely when that message came from them. One predicate, and it dedupes.

Mail with no `mailbox_owner` (seeded, or filed by a campaign) is **excluded from
`mine`**. Replies owed is about your own inbox, and an email belonging to nobody
counted in everybody's queue would be nobody's job.

`Email.thread_id` was stored but never queried before this, so migration
`0046_email_thread_index` adds `(mailbox_owner, thread_id, sent_at)`. Without it
the correlated subquery scans the table once per candidate row.

### `GET /api/v1/communications/`

Auth: required (`IsAuthenticated`). Returns DRF's list shape so the frontend's
existing `next`/`previous` walking works unchanged, plus three extra keys.

Query parameters:

| Parameter | Values | Meaning |
|---|---|---|
| `needs` | `true` (default), `false` | The queue, or the Everything stream over the same records |
| `kind` | `email`, `question`, `ticket`, `call`, `slack`, repeatable | Narrow to one channel, what a tile click sends. `slack` (the sidebar's Slack, 2026-10-16) is read only when asked: the Slack threads filed on records the reader may open, under `personal.visible_conversations`, newest first; a row's `who` is who started it, `detail` its `#channel`, `subject`/`snippet`/`preview` read as Slack showed them (the last 5 messages as `Name: text` lines), `action` `open_external` to the thread. No tile, not in the default list, the counts or `/stats/` |
| `scope` | `mine` (default), `team` | Yours, or yours and your reports' |
| `q` | free text | Matches who, subject, snippet and account name |
| `page`, `page_size` | ints, page_size capped at 100 | |

```json
{
  "count": 6,
  "next": null,
  "previous": null,
  "truncated": false,
  "mode": "needs",
  "scope": "mine",
  "results": [
    {
      "id": "email:412",
      "kind": "email",
      "who": "Dana Whitfield",
      "detail": "",
      "subject": "Re: revised renewal terms",
      "snippet": "We would need the revised terms before the board meets…",
      "preview": "…up to 1200 characters…",
      "sentiment": "negative",
      "waiting_since": "2026-09-09",
      "waiting_days": 9,
      "account": { "id": 3, "name": "Pizza Hut", "type": "customer" },
      "context": {
        "health_score": 5.2, "health_category": "average",
        "arr": 128400.0, "renewal_date": "2026-10-22",
        "days_to_renewal": 34, "owner": "Carl"
      },
      "action": "reply",
      "external_url": ""
    }
  ]
}
```

`context` travels with every row on purpose: a renewal question answered without
the renewal date in view is the exact mistake the page exists to prevent, and a
second request per selection would make the detail pane flicker. `preview` is
capped at 1200 characters for the same reason — the pane renders without a
follow-up call, and a page of 25 stays small.

`action` tells the client which composer to show: `reply` (email, through the
caller's own mailbox), `answer` (question, stored as a Contribution),
`open_external` (ticket, out to the source system by `external_url`),
`summarise` (call), or `none`.

`email` and `ticket` rows carry `draft`: `{"id", "agent", "created_at"}` when the reader owns an open reply draft for that email or ticket, else `null`.

`truncated` is `true` when any one channel hit `MAX_PER_KIND` (200). A queue is a
working list: past a couple of hundred debts of one kind the number is the story,
and the payload says so rather than quietly serving a prefix. The merge happens
in Python — four models sharing no columns — so pagination does too, which is
exactly what that cap keeps honest.

Merged, not unioned, for the same reason `interactions.recent_rows` is: aliasing
four different shapes into one SQL union to sort them would cost more than
reading a bounded number of rows per model.

### `POST /api/v1/communications/emails/<id>/reply/`

Answer a queue email from the person's own mailbox. Body `{"body": "…"}`. The
email must be on a customer or account the person may open (`visible_children_q`),
readable under the mailbox rule (owner and management chain), and
must be one somebody wrote to them (`direction=received` with a sender); the
reply goes to that sender under `Re: <subject>`, through the requesting user's
own `MailboxConnection`, and the copy is filed on the same customer or account,
which is what takes the debt out of the queue. Returns **201**
`{id, direction: "sent", subject, sent_at, thread_id}`. 400 when empty or when
the email has nobody to reply to; 404 outside the chain or on a hidden account; 409 when the person has
no mailbox connected; 502 with the provider's reason. Audited as
`mailbox.reply`. The filed reply takes the original's `thread_id` when the provider returns none (Microsoft and SMTP never do), so it clears the original from the queue, and it is sent with `In-Reply-To` and `References` when the original's `provider_message_id` is a Message-ID (IMAP).

The frontend's `ReplyBox` (shared by the queue's detail pane and the mailbox
view) sends here for email rows; the mailbox view sends to
`/mail/messages/<id>/reply/` instead.

### `/api/v1/communications/drafts/` — reply drafts

A draft an agent wrote (`draft.reply`) for a person to send. It is a Revenact row; when its source is in its owner's two-way Gmail it is also a Gmail draft (`mail_draft_id`). An email draft is sent from its owner's own mailbox; a ticket draft is copied into its source and marked sent. A discarded draft no longer exists.

```json
{
  "id": 7, "channel": "email", "status": "open",
  "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
  "source": {"kind": "email", "id": 812, "subject": "Renewal terms",
             "from": {"name": "Ann Lee", "address": "ann@x.com"}, "sent_at": "..."},
  "to": [["Ann Lee", "ann@x.com"]], "subject": "Re: Renewal terms", "body": "Hi Ann, ...",
  "agent": "cs", "agent_action_id": 91, "mail_draft_id": null, "owner": {"id": 3, "name": "Carl CSM"},
  "edited": false, "created_at": "...", "updated_at": "...",
  "sent_at": null, "sent_by": null, "sending": null, "can_edit": true, "can_resolve": false
}
```

- `status` is `open` or `sent`. A draft being sent (the internal claim) reads `status: "sent"`, `sent_at: null`, and `sending`: `"pending"` while its claim (`updated_at`) is under 10 minutes old, `"unconfirmed"` after (its owner may then confirm-sent or reopen it). `sending` is `null` for every other draft. `can_resolve` is true only when `sending` is `"unconfirmed"` and the reader may send this draft (its owner): it is when confirm-sent and reopen are allowed; false otherwise. `can_edit` stays open-only.

- A ticket draft's `source` is `{kind: "ticket", id, number, title, external_url, source_name}` (both last null for a ticket raised in Revenact), and its `to` and `subject` are `null`.
- `edited` is true once the body or subject differs from what the agent wrote. `sent_by` is `{id, name}` once sent or marked sent, else `null`. `can_edit` is true only for the owner while it is open.
- `mail_draft_id`: the linked Gmail draft (`mail/drafts/<id>/`) when the draft's source is in its owner's own two-way Gmail; set for the owner only, `null` for every other reader. A linked draft is one message seen twice: PATCH, DELETE, send, confirm-sent and reopen act on both rows in one transaction; a PATCH's text rewrites the Gmail draft's HTML in paragraphs, its signature kept.
- Recipients: an unlinked draft's `to` is the source email's sender and is fixed. A linked draft's recipients follow the Gmail draft's editor (`mail/drafts/<id>/` may change To, Cc and Bcc; `to` mirrors To). PATCH and send here take only `body` and `subject`; anything else is ignored.
- A linked draft's send goes through the Gmail path and may also answer `413 MESSAGE_TOO_LARGE`, `409 DRAFT_GONE`, `503 GMAIL_BUSY` and `409 ATTACHMENT_UNAVAILABLE`; the answer stays `{draft, email}`.
- Send of a linked draft, as built: `409 DRAFT_CHANGED` returns the ReplyDraft as `draft`; `409 NO_MAILBOX` keeps this route's sentence ("Connect your mailbox to send this."); the other Gmail-path answers pass through unchanged: `409 TWO_WAY_OFF` with `needs_reconnect: true`, `400` for the record or `to`, `410 ATTACHMENT_GONE`, `409 MAILBOX_PAUSED`, `409 DRAFT_GONE`, `504 SEND_UNCONFIRMED`, `502 MAILBOX_REFUSED`.
- DELETE (and the undo of a discard) of a linked draft discards both rows; the Gmail delete is queued and, on a mailbox that is disconnected, waits for the reconnect.
- There is one open draft per source (email or ticket). The agents do not draft again a source a draft reply already answered: an email never, a ticket for 7 days after the action was applied.
- **Who reads a draft:** its owner, and anyone who may open the record and read the source. Anyone else: 404.

| Route | Who | Answers |
|---|---|---|
| `GET /communications/drafts/` | any member | `{"results": [ReplyDraft]}`: the reader's own, newest first, at most 100. `channel` (`email`, `ticket`), `status` (`open` by default, `sent`; `sent` lists drafts being sent too, read as `sent` with `sent_at` null, and `?status=sending` is a 400 with "Choose open or sent."); a bad value is a 400 such as `{"channel": ["Choose email or ticket."]}` or `{"status": ["Choose open or sent."]}` |
| `GET /communications/drafts/<id>/` | a reader | the ReplyDraft |
| `PATCH /communications/drafts/<id>/` | the owner | `{body?, subject?}` → the ReplyDraft. Errors: 404; `403 {"code": "NOT_YOURS", "detail": "Only Carl CSM can change this draft."}`; `409 {"code": "ALREADY_SENT", "detail": "This draft has been sent."}`; 400 field errors: "Write the reply.", "Keep the reply under 20,000 characters.", "Keep the subject under 255 characters.", "A ticket reply has no subject.". Audited `reply_draft.edited {fields}` |
| `POST /communications/drafts/<id>/send/` | the owner, email only | optional `{body?, subject?}`, saved first under the PATCH rules → `200 {"draft", "email": {id, subject, sent_at, thread_id}}`, sent from the reader's connected mailbox, filed on the record, threaded on the source. The draft is claimed (an internal `sending`, read as `sent` with `sent_at` null) and committed before the provider is called: a provider error opens it again (502); a failure after the provider accepted leaves it claimed, and a second Send is `409 ALREADY_SENT`, so it never goes twice. Errors in order: 404; `403 NOT_YOURS` ("Only Carl CSM can send this draft."); `400 {"code": "WRONG_CHANNEL", "detail": "Copy a ticket reply into its source and mark it sent."}`; `409 ALREADY_SENT`; 400 field errors; `409 {"code": "NO_MAILBOX", "detail": "Connect your mailbox to send this."}` (no mailbox, or one in `error`); `502 {"detail": "Your mailbox didn't accept the message. Try again."}` (a reauthorisation error sets the mailbox to `error`). No answer after the request went out (a read timeout, a dropped connection or a broken answer; over SMTP, once the message was handed over): `504 {"code": "SEND_UNCONFIRMED", "detail": "We couldn't confirm this was sent. Check your Sent folder."}`, the draft left claimed (`sending: "pending"`, then `"unconfirmed"`). A failure to reach the provider, or of the token refresh before anything is sent, is the 502 and reopens it. A late answer to a send never changes a draft that was since reopened, sent again or discarded (every write after the claim is conditional on the claim's stamp). A late success then answers `409 {"code": "SEND_SUPERSEDED", "detail": "This reply already went out."}` with no draft (read it again); the email is still filed and audited (`mailbox.reply`), never `reply_draft.sent`. Audited `reply_draft.sent {email}` and `mailbox.reply` |
| `POST /communications/drafts/<id>/confirm-sent/` | the owner | a draft with `sending: "unconfirmed"` (claimed 10 minutes ago or more): it went. → `200` the ReplyDraft, `status: "sent"`, `sent_at` now, `sent_by` the owner (no filed email). Errors: 404; `403 NOT_YOURS` ("Only Carl CSM can send this draft."); `409 {"code": "NOT_UNCONFIRMED", "detail": "This draft isn't waiting for confirmation."}` (open, sent, or claimed under 10 minutes ago; also the second of two clicks). Audited `reply_draft.confirmed_sent` |
| `POST /communications/drafts/<id>/reopen/` | the owner | a draft with `sending: "unconfirmed"`: it did not go. → `200` the ReplyDraft, `status: "open"`, to edit and send again. Errors as confirm-sent. Audited `reply_draft.reopened` |
| `POST /communications/drafts/<id>/mark-sent/` | the owner, ticket only | the ReplyDraft with `status: "sent"`. Errors: 404; `403 NOT_YOURS`; `400 {"code": "WRONG_CHANNEL", "detail": "Send an email draft instead."}`; `409 ALREADY_SENT`. Audited `reply_draft.marked_sent` |
| `DELETE /communications/drafts/<id>/` | the owner | 204. Errors: 404; `403 NOT_YOURS`; `409 ALREADY_SENT`. Audited `reply_draft.discarded` |

### `GET /api/v1/communications/stats/`

Auth: required. The four tile numbers, shipped separately from the list so that
clicking a tile narrows the queue **without** the other three counts moving
underneath it. Same reasoning as `/contacts/stats/` and `/tickets/stats/`.

```json
{
  "counts": { "email": 2, "question": 2, "ticket": 1, "call": 1 },
  "total": 6,
  "oldest_waiting_days": 9,
  "stale_questions": 1,
  "has_mailbox": true,
  "scope": "mine",
  "ticket_scope_note": "Tickets are read by department, so this count is the same for you and your team."
}
```

`has_mailbox` drives the first-run state: with no mailbox connected the replies
tile shows a dash rather than a zero, because zero would be a lie, and the other
three still carry real numbers.

### Deliberately not built in v1

No archive, snooze or "mark handled". A row leaves the queue only because the
underlying thing changed — a reply was sent, a question answered, a ticket
closed, a summary written. A queue you can dismiss without acting stops being
true within a week, and inbox state would be the first new model this page needs.
Keyboard navigation, bulk actions and posting ticket comments back through the
connector are v2 in the specification.

---

## `mail` — The person's own inbox (`/communications?source=mailbox:<provider>`, `MailboxView.tsx`)

Connecting a mailbox used to file only the messages that matched someone in
the book (`customers.Email`, the team's view of a customer). The Communications
page, opened on the mailbox source, now shows the person's mail **whole**: every
message the provider handed back, in the folders the provider keeps, with its
flags and a category. That is `mail.MailMessage`, one row per message per
connection, created at sync next to the filed copy and pointing at it when
there is one.

### Ownership

A mailbox's contents are the owner's and nobody else's. Every endpoint below
filters on `owner=request.user`; a manager reads the **filed** copies under
`services/mail/visibility.py`, never a report's whole inbox.
Disconnecting Outlook or IMAP deletes the personal copy at once (`connection`
cascades). Disconnecting Google keeps the row as a tombstone (credentials
wiped, token revoked) and the copies for `MAIL_DISCONNECT_RETENTION_DAYS` (30);
the nightly prune then deletes them. Filed `Email` rows stay on the customer
either way, with `mailbox` set null once the connection row goes. A manager,
a view-all holder or an admin gets 404 on someone else's message and `[]` for
their labels; labels, cc/bcc, HTML and attachment details never reach them.

### What the provider tells us, and what we keep

`providers.base.Message.labels` carries one vocabulary for all three providers:
`inbox sent draft spam trash archive unread starred important promotions social
updates forums personal`. Gmail maps its label ids (the fetch includes spam,
trash and drafts; a message with no folder label at all is `archive`); Graph
maps `isRead`, `flag`, `importance`, `isDraft` and the six well-known folders
(resolved once per mailbox and kept in the credentials; a message in any other
folder is `archive`); IMAP maps the folder it read from and `\Seen` /
`\Flagged`, wherever the server puts FLAGS in the fetch response.

**Only inbox and sent mail is filed against a customer** (`customers.Email`).
Spam is never evidence, trash was thrown away and a draft has not happened yet:
those are kept in the person's store only, and never reach the timeline, the
classifier or the pulse.

At sync those become `folder` (`inbox sent drafts spam trash`), `is_read`,
`is_starred`, `is_important`, and `category` via `services/mail/categorise.py`:
`financial` (subject mentions an invoice, renewal, payment…), then the
provider's own tab (`promotions`, `social`), `newsletters` (a `List-Unsubscribe`
header), `notifications` (Gmail's updates/forums, or a system sender such as
`noreply@`), else `general`. No model call: a category is a filing decision and
must come out the same every time.

**Two-way Gmail (delivery 1).** For a Google mailbox, Gmail's labels are the
truth: `folder`, `is_read`, `is_starred`, `is_important` and `state` are
derived from `label_ids` at every store and every label change (DRAFT, then
TRASH, then SPAM, then SENT or the mailbox's own address as sender, else
inbox; UNREAD, STARRED, IMPORTANT; none of INBOX SENT DRAFT SPAM TRASH is
archived, `done`, and the Inbox reopens it). `muted` is never touched, the
category is decided once at first store, chats are never stored, and a filed
`Email` is never moved or deleted by a later label change or a Gmail deletion.
**Two-way Gmail (delivery 2): the outbox.** For a two-way Google mailbox an
action changes the row at once (its `label_ids`, then everything they mean)
and writes one `mail.MailOutbox` row per label change; the sync loop sends
them to Gmail at the start of the mailbox's next tick (within 5 seconds: an
action wakes the mailbox). Read then unread sends nothing (a change back to
a pending row's previous value deletes it). While a row is pending or
sending, Gmail's own reports for that label on that message are skipped and
recorded as the row's previous value; once it is sent, Gmail is the truth
again. Calls: `messages.batchModify` per change set (≤ 1,000 ids; a batch
Gmail refuses with 400 or 404 is retried one message at a time),
`messages.trash`/`untrash` one by one (≤ 200 single calls a tick),
`labels.create` first. A 404 fails a row at once; a 5xx, no answer or
another refusal is retried after 30 s, 2 m, 10 m and 1 h and fails on the
fifth; rate limits and lost grants count nothing. A failed row is undone
here and the owner gets one `mail_action_failed` notification per action
and reason. Outlook and IMAP keep the old rule: a PATCH stamps
`locally_changed_at`, what the person did here wins over the provider's
flags, and nothing is written back.

**Locking (as built).** Every write request (PATCH, the reply's mark-read,
the thread PATCH, bulk) locks its messages `select_for_update` in primary-key
order (`actions.lockable`), then locks its `MailboxConnection` row with
`select_for_update(no_key=True)` (`actions.lock_connection`) and runs the
refusal checks against that fresh row, so a request never writes rows for a
mailbox that has just been disconnected or paused; `POST mail/labels/` locks
the connection row the same way before its refusal checks. The flush's
back-off (`Flush._back`), a failure (`Flush._fail`: marking rows failed, the
revert, unwinding a label) and `outbox.unwind_label` lock the messages in pk
order before any outbox row, including every message carrying an unwound
label's `pending:<id>` key (`outbox.lock_messages`). Disconnect locks the
messages with live outbox rows or carrying a made-here label's key before it
deletes the live outbox rows and unwinds those labels, all in one transaction
with the status change. A PATCH and a bulk action share one check-and-perform path
(`actions.run`, `actions.labels_for`).

**How Gmail is synced.** `sync_mail --loop` (below) reads Gmail's change log
(`history.list` since `history_id`: adds, deletes, label changes), imports
the last `MAIL_IMPORT_MONTHS` (12) a page per tick (skipping what it holds),
mirrors the label list every tick, and when Gmail no longer has the history
(404) takes a fresh `history_id` first, then re-lists the last 30 days a page
per tick and deletes what Gmail no longer has. Imported mail is filed as
before; only mail from the last 30 days is classified at once, the rest by the
nightly capped `classify_interactions`. From D1, Gmail rows store `to` (To
only), `cc` and `bcc` apart; Outlook, IMAP and older Gmail rows keep To + Cc in
`to` and answer `cc: []`, `bcc: []`. Filing still counts To + Cc; Bcc never.
HTML is sanitised once, at store, with `nh3` (tables, inline styles and
`<style>` kept; scripts, frames, forms, svg/math, link/meta/base and every
`on*` handler stripped; only `http`, `https`, `mailto` and `cid` URLs; remote
images left for the frontend's sandboxed iframe); over `MAIL_HTML_MAX_BYTES`
(1 MB) it is dropped and the text body shown.

**Existing mailboxes.** Migration `0003` clears every connection's
`sync_cursor`, so the next pass re-lists the provider's window (30 days) and the
personal store fills in; filing and storing are both idempotent on the
provider's id, so nothing is duplicated.

**Sent mail the app itself sent.** Graph and SMTP return no id for a send, so
the app records the send under a `sent:<uuid>` placeholder; when the provider's
own Sent copy is listed later (same subject, within ten minutes) the placeholder
takes its id rather than a second row appearing.

`priority` on a row is `is_important` **or** "from someone in the book"
(`email` is set).

### `GET /api/v1/mail/messages/`

Auth: required. DRF's paginated list shape (`page`, `page_size` ≤ 100).

| Parameter | Values | Meaning |
|---|---|---|
| `folder` | `inbox` (default), `all`, `drafts`, `sent`, `done`, `muted`, `spam`, `trash`, `starred`, `important` | Which list. `inbox` is `folder=inbox` **and** `state=open`; `all` is everything outside trash and spam (Gmail's All Mail); `done`/`muted` are the two triage states; `starred`/`important` are the flags across folders |
| `label` | a `MailLabel` id | Only messages carrying that user label of the caller's own mailbox (a label made here included); `400 {"label": ["Choose one of your labels."]}` otherwise |
| `category` | `general financial newsletters notifications promotions social` | Narrow to one |
| `unread` | `true` | Only unread |
| `priority` | `true` | Only priority (see above) |
| `q` | text | Subject, sender name, sender address, snippet |

Row: `id, thread_id, direction (sent|received), from_name, from_address,
to ([[name, address]…]), cc, bcc (same shape; [] outside Gmail), subject,
snippet (≤300 chars), sent_at, folder, category, state, is_read, is_starred,
is_important, priority, account ({id, name, type: customer|account} from the
filed copy, else null), labels ([{id, name, color: {background, text} | null, pending}],
`pending` true for a label made here that Gmail has not created yet, the message's Gmail user labels by name, `id` Revenact's MailLabel id; unknown
ids ignored), has_attachments (a non-inline file part), sync_issue (below), `draft` (`{id, agent, reply_draft_id}` for a live Gmail draft's row, else null; joined, no extra query)`. No body: that is the
detail's. The page reads the owner's labels in one query (≤ 4 queries a list
page, whatever its size; the detail ≤ 5).

400 for an unknown `folder` or `category`.

### `GET /api/v1/mail/messages/summary/`

The numbers beside the folders and the Categories block at the top of the
inbox.

```json
{
  "has_mailbox": true,
  "address": "dana@acme.io",
  "last_synced_at": "2026-09-21T17:02:11Z",
  "import": {"state": "importing", "imported": 4210, "total_estimate": 18000, "done_at": null},
  "paused_reason": null,
  "folders": {"inbox": 41, "drafts": 2, "sent": 12, "done": 7, "muted": 1},
  "unread": 9,
  "categories": [
    {"category": "financial", "label": "Financial", "count": 2,
     "subjects": ["Subscription renewal", "Invoice 1042"],
     "senders": ["Circleback"], "more_senders": 1}
  ]
}
```

`import` and `paused_reason` are null without a live Google mailbox, and
`has_mailbox` is false for a disconnected one.

`categories` lists each non-general category with **unread inbox** mail, newest
first within it: up to two distinct subjects, the newest sender, and how many
other distinct senders there are. `general` is never a block; it is the list
itself.

### `GET | PATCH /api/v1/mail/messages/<id>/`

GET adds `body`, `html_body` (sanitised; "" when none or too large, and the
text body is shown) and `attachments` ([{id, filename, mime_type, size,
is_inline, content_id, available, preview, download_url}], every file part,
inline ones included for `cid:`). `available`: the file is cached, or its
mailbox is Google, not disconnected and not paused (read from the stored
`paused_reason`; the download route itself checks the pause live).
`preview`: it will be served inline (an image or a PDF whose name and declared
type agree). `download_url`: `/api/v1/mail/attachments/<id>/download/`, null
when not available. Never `rfc_message_id`, `references` or raw label ids.
404 for anyone but the owner, including their manager.

PATCH is partial, with at least one of:

| Field | Values | Gmail |
|---|---|---|
| `is_read` | bool | −/+ `UNREAD` |
| `is_starred` | bool | +/− `STARRED` |
| `state` | `open`, `done`, `muted` | `open` +`INBOX`; `done` −`INBOX`; `muted` none (Revenact's own) |
| `trashed` | bool | `messages.trash` / `untrash` |
| `spam` | bool | +`SPAM` −`INBOX` / the reverse |
| `add_labels`, `remove_labels` | ≤ 20 `MailLabel` ids each | ± that label |

Checks, in order, the first failing one answering:
1. Not the caller's message: 404.
1b. A live draft's row: `409 {"code": "IS_DRAFT", "detail": "This message is a draft."}` (drafts change through `mail/drafts/`).
2. The body: `400 {"non_field_errors": ["Change at least one thing."]}`;
   `["Change one of state, trashed or spam at a time."]`; `["A label can't be
   added and removed at once."]`; `{"add_labels": ["Name each label once."]}`;
   `{"add_labels": ["Choose one of your labels."]}` (a label that is not a
   user label of the caller's Gmail).
3. Outlook or IMAP with `trashed`, `spam` or a label field:
   `400 {"code": "GMAIL_ONLY", "detail": "Only Gmail mailboxes have this."}`.
4. Google, disconnected: `409 NO_MAILBOX` ("This message's mailbox is no longer connected.").
5. Google, paused: `409 MAILBOX_PAUSED` with `paused_reason`.
6. Google, read-only: `409 {"code": "TWO_WAY_OFF", "detail": "Reconnect Google to turn on two-way: changes here can't reach Gmail yet.", "needs_reconnect": true}`.

Checks 4 to 6 skip a mute alone. **200** with the detail, already showing the
new values. Outlook and IMAP: `is_read`, `is_starred` and `state` only, here
only, stamped `locally_changed_at`. ≤ 12 queries plus the detail's own.

### `POST /api/v1/mail/messages/<id>/reply/`

`{"body": "…"}` — sends from the mailbox the message arrived in, to whoever
wrote it (or, for something the person sent, to the same recipients), under
`Re: <subject>`. If the original was filed against a customer the reply is
filed there too (`send_email`, so the team's picture of that account gains the
answer and it is classified like any other email); otherwise it is only the
person's own sent mail. Marks the original read (through the outbox for a two-way Google mailbox). Returns **201** with the sent
message as it now sits in `sent`. 400 when the message names nobody to reply
to; 409 when the mailbox is no longer connected; `409 {"code": "MAILBOX_PAUSED", "detail", "paused_reason"}` when it is a paused Google mailbox (also on customers/<id>/emails/send/, accounts' send, communications/emails/<id>/reply/ and draft Send, always before any provider call, so a draft is never claimed);
502 with the provider's reason when the send fails. On a Google mailbox the reply carries the original's Gmail `threadId` (this mailbox's message), `In-Reply-To` and `References`, and goes through Gmail's upload endpoint; `mailbox.reply` adds `cc: []`, `bcc_count: 0`, `attachments: 0`, `bytes: 0`. Audited as `mailbox.reply`. The filed reply takes the original's `thread_id` when the provider returns none (Microsoft and SMTP never do), so it clears the original from the queue, and it is sent with `In-Reply-To` and `References` when the original's `provider_message_id` is a Message-ID (IMAP).

### `GET /api/v1/mail/threads/`

The person's mail as conversations, paginated like `mail/messages/`, with
the same parameters applied per message. A thread is in a view when any of
its messages matches; it is ordered and shown by its newest matching
message. Outlook threads group by `conversationId`; IMAP messages are each
their own thread.

```json
{
  "id": 9012,
  "thread_id": "18c2f0a9b1d4e7a3",
  "subject": "Re: Renewal terms",
  "snippet": "Works for us.",
  "last_sent_at": "2026-10-11T08:42:10Z",
  "message_count": 4,
  "unread_count": 1,
  "participants": [{"name": "Ann Lee", "address": "ann@pizzahut.com"}],
  "more_participants": 0,
  "is_read": false,
  "is_starred": true,
  "is_important": false,
  "priority": true,
  "state": "open",
  "folder": "inbox",
  "has_attachments": true,
  "labels": [{"id": 7, "name": "Renewals", "color": null, "pending": false}],
  "account": {"id": 2, "name": "Dough Co", "type": "customer"},
  "sync_issue": null,
  "draft": null
}
```

`id` is the newest matching message's (the handle for the routes below).
Counts and flags leave trash and spam out, except in the trash and spam
views. `participants`: distinct senders, oldest first, up to 3. `account`:
the newest filed message's record. `draft`: the anchor's, so it is set only when the thread's newest message is a live draft, and null for sent or discarded drafts. ≤ 6 queries.

### `GET | PATCH /api/v1/mail/messages/<id>/thread/`

The conversation holding message `<id>`, owner-only (404 otherwise):
`{thread_id, subject (the oldest shown), labels, account, sync_issue,
truncated, messages}`, `messages` oldest first in the detail shape, trash and
spam included, at most `MAIL_THREAD_MAX_MESSAGES` (100, the newest;
`truncated` says so). ≤ 7 queries.

PATCH takes the message PATCH's body and checks and applies them to every
message Revenact holds in the thread (not ones older than the import), through
the same path as the message PATCH. Thread expansion leaves a live draft's row out; `message_ids` naming one is `409 IS_DRAFT`; a thread that is only drafts is `409 IS_DRAFT`. Starring stars the newest message only;
unstarring unstars them all. More than `MAIL_ACTION_MAX_MESSAGES` (1,000) is
`400 {"code": "TOO_MANY", "detail": "Select fewer conversations: at most
1,000 messages at a time."}`. **200** with the thread.

### `POST /api/v1/mail/actions/`

`{"op", "message_ids" | "thread_of", "label_id"?}`: one op on 1–1,000
messages, or on whole conversations (`thread_of` expands each id to its
thread; starring stars each thread's newest). Thread expansion leaves a live draft's row out; `message_ids` naming one is `409 IS_DRAFT`; a thread that is only drafts is `409 IS_DRAFT`. Ops: `read unread star unstar
archive inbox trash untrash spam not_spam label_add label_remove mute
unmute`. **200** `{"op", "messages" (changed here), "threads", "unchanged"
(already so)}`. All or nothing: an id that is not the caller's is
`404 {"detail": "Not found."}`, naming none, and a body whose ids resolve to
no message of the caller's is also 404. Refusals: `{"op": ["Choose a
known action."]}`; `{"non_field_errors": ["Send message_ids or thread_of, not
both."]}` (also when neither is sent); `{"label_id": ["Choose one of your
labels."]}`; `{"label_id": ["Only label actions take a label."]}`; `TOO_MANY`
after expansion; then checks 3 to 6 above. `mute` and `unmute` are Revenact's
own (no outbox row) and are allowed while the mailbox is paused, read-only or
disconnected, and on Outlook and IMAP. Outlook and IMAP take `read unread star
unstar archive inbox mute unmute`, here only. ≤ 12 queries, whatever the count.

### Failure notices

`sync_issue` on a message, a thread row and a thread: `{"text": "Couldn't
archive in Gmail: the message no longer exists.", "at"}` for the newest failed
change on it in the last 7 days, until another action is made on it (a later
row of another action; a sibling row of the same action does not clear it);
else null. The verbs: mark as read, mark as unread, star, unstar, archive,
move to the Inbox, delete, restore, report spam, mark as not spam, label "X",
remove the label "X", create the label "X". The clauses: the message no longer
exists, the label no longer exists, Gmail refused the change, Gmail didn't
answer after several tries, Gmail refused the name.

Notification kind `mail_action_failed` ("Mail action failed"), to the mailbox
owner, `actor` null, one per action and reason: the sentence for one
conversation, "Couldn't archive 12 conversations in Gmail: …" for more;
`link` `/communications?source=mailbox:google&message=<id>` (the newest
affected message still held) or `/communications?source=mailbox:google`.

### `GET /api/v1/mail/attachments/<id>/download/`

The bytes of one file part, for its mailbox's owner, or, when its message is
filed, for whoever may open that record **and** read that email (the
twice-filter); 404 for anyone else. Throttled per user (`mail_attachment`,
`THROTTLE_MAIL_ATTACHMENT`, 120/min). On the first open it is fetched from
Gmail through the owner's mailbox (the message re-read for the current
attachment id) and cached under `MEDIA_ROOT`; afterwards it is served from
there. Served as the declared type only when the extension is an accepted
one, the declared type is one of its types and the leading bytes match;
otherwise `application/octet-stream`. `Content-Disposition: inline` only for
PNG, JPEG, GIF, WebP and PDF, and not with `?download=1`. Always
`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src
'none'; sandbox`, `Cache-Control: private, no-store` (the headers the Files
tab's downloads carry, shared in `services/customers/files.py:file_headers`).

| Status | `code` | `detail` |
|---|---|---|
| 409 | `ATTACHMENT_UNAVAILABLE` | This file hasn't been fetched from Gmail yet, and its mailbox isn't connected. |
| 410 | `ATTACHMENT_GONE` | This file is no longer in Gmail. |
| 413 | `ATTACHMENT_TOO_LARGE` | This file is too large to open here. Open it in Gmail. (over `MAIL_ATTACHMENT_MAX_BYTES`, 50 MB) |
| 503 | `GMAIL_BUSY` | Gmail is busy. Try again in a minute. (with `Retry-After`) |

A lost grant on the fetch pauses the mailbox. Every download of a filed
message's file is audited `mailbox.attachment_downloaded`; unfiled mail is the
owner's own and is not.

### Outlook and IMAP in delivery 2

| | Google, two-way | Outlook / IMAP |
|---|---|---|
| read, star, done, open | here and in Gmail | here only (`locally_changed_at`) |
| trash, spam, labels | here and in Gmail | `400 GMAIL_ONLY` |
| mute | here only | here only |
| conversations | Gmail's threads | Graph's `conversationId`; IMAP one message each |
| `sync_issue` | the newest failed change | always null |
| attachments | fetched on first open | none listed |

### Decisions the code forced (delivery 2)

The contract left these open; the code answers them so.

- An empty PATCH is `400 {"non_field_errors": ["Change at least one thing."]}`.
- A label twice in one list is `400 {"add_labels": ["Name each label once."]}`
  (or `remove_labels`); in both lists, `["A label can't be added and removed
  at once."]`.
- Label ids are resolved only for a Google mailbox; Outlook and IMAP with a
  label field go straight to `GMAIL_ONLY`.
- `label_add` and `label_remove` rows store `payload {"label": "<name>"}`, so
  a notice or `sync_issue` can name a label deleted since.
- A row going back to pending while a newer pending row exists on its pair (a
  recovered lease, a rate limit, the single-call cap, a counted retry) hands
  its `previous` to the newer row and is deleted. Only the failure path also
  deletes the newer row when its target equals that `previous`.
- A request locks its messages (pk order), then its connection row, and the
  revert and back-off lock the same messages, so a flush's claim never sends a
  row a request is collapsing (see Locking above).
- One action's rows can fail in different ticks (the single-call cap); a
  notice is skipped when an earlier flush already failed a row with the same
  `action_id` and `reason`.
- A `sent` row older than 24 hours is kept while its message has a `failed`
  row inside the 7-day window, so a fixed issue does not come back.
- `available` in the message detail reads the stored `paused_reason`; the
  download route checks the pause live.
- After a `409` on `labels.create`, if the adopted Gmail id is already a
  mirrored `MailLabel`, the label made here merges into it (keys rewritten,
  the made-here label deleted).
- Disconnecting unwinds labels made here and never created in Gmail (their
  `pending:<id>` keys leave the messages).
- `POST mail/labels/` order: name checks (400), then `GMAIL_ONLY` and the
  three 409s, then `LABEL_EXISTS`. A caller with no mailbox answers
  `409 NO_MAILBOX`, the same as a disconnected one.
- A label name over 225 characters is refused; 225 is accepted.
- The unread count is one raw SQL statement (constant text, one parameter,
  `jsonb_array_elements_text` in a lateral join).
- The thread anchor (newest matching message per thread) is a `RowNumber()`
  window filtered to 1; there is no `DISTINCT` over a join.
- The audit's `content_type` is the declared MIME.
- `MailLabel.key` is the Gmail id, or `pending:<pk>`; every `label_ids` lookup
  uses it.
- Starring a conversation stars its newest message for every provider.
- Cached files are deleted on commit (`transaction.on_commit`), so a
  rolled-back delete never loses a file.
- Gap 23 (a ruling): `sync_issue` is cleared only by a later outbox row of
  another action. A sibling row of the same action (one bulk action's rows)
  does not clear its own failure.

### Connecting a mailbox

Undocumented until delivery 1. Every route is `IsAuthenticated` except the
OAuth callback and the push webhook (`AllowAny`, no authentication).

**`GET /api/v1/mail/connection/`**: `{connection, disconnected, providers}`.
- `connection`: null without a live mailbox, else `id, provider,
  provider_display, address, display_name, status (connected|error), error,
  last_synced_at, created_at, two_way, needs_reconnect, granted_scopes,
  import, push, paused_reason`.
  - `two_way`: Google with gmail.modify, gmail.send and gmail.compose all granted.
  - `needs_reconnect`: Google, and not two-way or `token_revoked`.
  - `granted_scopes`: Gmail scopes by short name.
  - `import`: `{state: importing|done, imported, total_estimate, done_at}`, where `total_estimate` is the whole mailbox's `messagesTotal` (so "about").
  - `push`: a live watch with `GMAIL_PUBSUB_TOPIC` set.
  - `paused_reason`: null, `no_seat`, `suspended`, `workspace_off` or `token_revoked`, computed live.
  - `error`: the reconnect reason, or the latest transient one while backing off. Never mail content.
  - Outlook and IMAP: `two_way` false, `needs_reconnect` false, `granted_scopes` [], `import` null, `push` false, `paused_reason` null.
- `disconnected`: after a Google disconnect, `{provider, address, disconnected_at, delete_after}`; else null.
- `providers`: `[{key, label, uses_oauth, gate}]`. Google's `gate` is the first failing pre-OAuth gate (`GMAIL_NOT_ENABLED`, `MEMBER_SUSPENDED`, `NO_SEAT`, `NO_VERIFIED_DOMAIN`) or null; the others are always null.

**`DELETE /api/v1/mail/connection/`**: 204.
- Google: stop the watch and revoke the token (both best effort), wipe the credentials, clear the sync state, `status=disconnected`, keep the copies for 30 days. Audited `mailbox.disconnect {provider, address, revoked, delete_after}`. A disconnected row then answers like no mailbox everywhere except `mail/messages/*`, which keeps listing the kept copies.
- Outlook and IMAP: deleted at once, as before. Audited `mailbox.disconnect` with `revoked: false, delete_after: null`.

**`POST /api/v1/mail/connect/<provider>/`**: for OAuth `200 {authorize_url}`; for IMAP the form `{address, password, imap_host, imap_port?, smtp_host, smtp_port?, username?, display_name?}` is verified by logging in, `201` with the connection (audited `mailbox.connect` with `scopes: []`, `two_way: false`, as for Microsoft).
- Google asks for `gmail.modify gmail.send gmail.compose openid email profile`, offline, with consent.
- OAuth (Google and Microsoft) also sets a random-nonce cookie, HttpOnly, SameSite=Lax, Max-Age=900, no Domain: over https `__Host-revenact_mail_oauth` (Secure, Path=/, so no sibling subdomain can plant it), over plain http `revenact_mail_oauth` (Path=/api/v1/mail/oauth/). The signed state carries the nonce's SHA-256, binding the flow to this browser. The SPA calls this with `credentials: 'include'` so a cross-origin dev setup (`:5173` → `:8000`) stores it.
- Before OAuth, `403 {"code", "detail"}` for `GMAIL_NOT_ENABLED`, `MEMBER_SUSPENDED`, `NO_SEAT` or `NO_VERIFIED_DOMAIN` (not audited).
- `400 {"detail"}` for an unknown or unconfigured provider.
- Connecting over a row of another provider or address, or over a disconnected Google row, deletes that row first (`mailbox.disconnect`).

**`GET /api/v1/mail/oauth/<provider>/callback/?code=&state=`** (public): `302` to `${FRONTEND_URL}/integrations?mailbox=connected|refused|error[&code=][&detail=≤200]`. Every answer clears the connect cookie (the name for the request's scheme; over https only `__Host-revenact_mail_oauth` is read). For every OAuth provider, after the signed state (15 minutes) and an active user, the cookie must match the state's binding (constant-time), else `refused`/`BROWSER_MISMATCH` ("Finish connecting in the same browser you started from. …") before the code is exchanged, audited `mailbox.connect_refused {provider, code}`: a forwarded authorize link cannot connect the opener's mailbox to the sender. For Google, in order:
1. The signed state (15 minutes), an active user, and the same browser.
2. The workspace, membership and seat gates again.
3. The code exchange.
4. All three Gmail scopes, else `refused`/`SCOPES_MISSING`.
5. `getProfile`'s address on a verified domain exactly, else `WRONG_DOMAIN` ("Connect your acme.io account.") or `NO_VERIFIED_DOMAIN`; and nobody else's live Google connection on it, else `ADDRESS_IN_USE`.
6. Save: the same address resumes the person's row and copies (`mailbox.reconnect`, plus `mailbox.scopes_changed {from, to}`); a new one is `mailbox.connect {provider, address, scopes, two_way}`.
7. Start the import, a 30-day reconcile for a row that was away, and a wake.

Step 2's refusals come before any exchange, so there is nothing to revoke. Every refusal after the code exchange (steps 4 and 5) revokes what Google issued, stores nothing, and is audited `mailbox.connect_refused {provider, code, domain?}` (the domain, never the address). Google's `error=access_denied` is `refused`/`GOOGLE_DENIED`.

**`POST /api/v1/mail/sync/`**:
- No mailbox, or a disconnected one: `400 {"detail": "No mailbox connected."}`.
- Google, paused: `409 MAILBOX_PAUSED`.
- Google: `wake_at = now` and `202` (the connection plus `"filed": null, "queued": true`).
- Outlook and IMAP: sync inline, `200` (the connection plus `"filed": n`).

### `GET | POST /api/v1/mail/labels/`

GET: the caller's own live Google mailbox's user labels, by name, not
paginated: `[{"id", "gmail_id" (null while pending), "name", "color":
{"background", "text"} | null, "unread", "pending"}]`. `unread` counts unread
conversations carrying the label outside trash and spam (one query). `[]`
without one, for a disconnected one, and for Outlook and IMAP. ≤ 3 queries.

POST `{"name": "Vendors/Billing"}`: **201** with the label, `pending: true`.
It exists here at once, sits on messages as `pending:<id>` until Gmail makes
it, and is created in Gmail first thing in the next tick (a name Gmail
already has is adopted). A `name` that is not a string (null, a number, a
list) is treated as blank. Refusals: `400 {"name": ["Name the label."]}`,
`["Keep the name under 225 characters."]`, `["Gmail keeps that name for
itself."]` (INBOX SENT DRAFT DRAFTS SPAM TRASH UNREAD STARRED IMPORTANT
CHAT CATEGORY_*, any case); `400 GMAIL_ONLY`; `409 NO_MAILBOX` (none, or
disconnected), `409 MAILBOX_PAUSED`, `409 TWO_WAY_OFF`; `409 {"code":
"LABEL_EXISTS", "detail": "You already have a label called Renewals.",
"label_id": 7}`. If Gmail refuses the name, the label is removed again and
the owner is told: 'Couldn't create the label "X" in Gmail: Gmail refused
the name.' No rename, delete or colour (D2).

### Two-way Gmail (delivery 3): drafts and sending

A Gmail draft's Revenact side is a `MailDraft`, owner-only; its row in
Drafts is a `MailMessage` with the `DRAFT` label (`pending-draft:<id>`
until Gmail has made it). Drafts may be written while the mailbox is paused;
sending may not. Outlook and IMAP: every route below is
`400 {"code": "GMAIL_ONLY", "detail": "Only Gmail mailboxes have this."}`.

Connection checks, in order: `400 GMAIL_ONLY`; `409 NO_MAILBOX`
("This message's mailbox is no longer connected."); `409 TWO_WAY_OFF` with
`needs_reconnect: true`; and, for a send only, `409 MAILBOX_PAUSED`.

#### `GET /api/v1/mail/compose/?kind=new|reply|reply_all|forward&message=<id>`

The editor's prefill; nothing stored, nothing sent. `{kind, source_message_id,
from: {name, address}, to, cc, bcc, subject, html, signature_html, forwarded:
[attachment], record, suggested_record, total_bytes, max_bytes}`. A reply
goes to the original's Reply-To, else its sender (to its recipients when
the person sent it); reply all adds its To and Cc; the person's own address
goes and each address appears once, To before Cc. `Re: `/`Fwd: ` once. The
html is `<p></p>`, the signature `<div data-revenact-signature>`, then the
quote or the forward block, each wrapped in `<div class="gmail_quote">`.
`forwarded`: the original's non-inline files. `record`: a reply's filed
record, otherwise the suggestion (a contact's address, an account's domain,
an organisation's domain), only records the owner may open. `total_bytes`:
the forwarded files plus the html and its text; `max_bytes`: 26,214,400.
Errors: `400 {"kind": ["Choose new, reply, reply_all or forward."]}`,
`400 {"message": ["Choose a message to answer."]}`, 404 (not the caller's),
`409 IS_DRAFT`, the connection checks (not the pause).

#### `POST /api/v1/mail/drafts/` · `GET | PATCH | DELETE /api/v1/mail/drafts/<id>/`

POST `{kind, source_message_id, to?, cc?, bcc?, subject?, html?, forwarded?,
record?}`: the fields left out are the prefill's. 201 with the draft:

```json
{"id": 55, "kind": "reply_all", "status": "open", "sending": null, "revision": 1,
 "message_id": 9102, "thread_id": "18c2...", "source": {"message_id": 9012, "subject": "...",
 "from": {"name": "Ann Lee", "address": "ann@pizzahut.com"}, "sent_at": "..."},
 "from": {"name": "Dana Ruiz", "address": "dana@doughco.com"}, "to": [["Ann Lee", "ann@pizzahut.com"]],
 "cc": [], "bcc": [], "subject": "Re: ...", "html": "...", "text": "...",
 "attachments": [{"id": 61, "filename": "...", "mime_type": "...", "size": 1, "origin": "upload",
 "download_url": "/api/v1/mail/attachments/61/download/"}], "total_bytes": 274630,
 "max_bytes": 26214400, "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
 "suggested_record": null, "record_chosen": false, "gmail": {"state": "saving"},
 "sync_issue": null, "agent": null, "reply_draft_id": null, "created_at": "...",
 "updated_at": "...", "sent_at": null, "can_resolve": false}
```

- Recipients: `[name, address]` pairs or bare addresses, valid, lower-cased,
  each once across To, Cc, Bcc, at most 100 (`{"non_field_errors": ["A message can go to at most 100 people."]}`;
  `{"to": ["Enter a valid email address."]}`).
- `html` is sanitised (nh3); over 1 MB is `{"html": ["This message is too long."]}`; `text` is derived.
- `forwarded`: the source's files for a forward (`{"forwarded": ["Choose files from the message you are forwarding."]}`).
- `record`: `{kind, id}` or null, a record the owner may open (`{"record": ["Choose a record you can open."]}`);
  setting it sets `record_chosen`; until then a new message or forward follows the suggestion.
  A linked agent draft refuses it: `{"record": ["An agent draft stays on its record."]}`.
- PATCH: partial content plus the `revision` it was edited from
  (`{"revision": ["Send the revision you edited."]}`); a stale one is
  `409 {"code": "DRAFT_CHANGED", "detail": "This draft changed in Gmail. Here is the newest version.", "draft": {...}}`;
  `409 ALREADY_SENT` once sending or sent. A PATCH that changes nothing queues nothing; a record change alone keeps the revision.
- `gmail.state`: `local`, `saving`, `saved`, `failed` (with `sync_issue {text, at}`).
- DELETE discards the draft only (204): it leaves Drafts at once and Gmail's copy is deleted by the next tick.
- GET, PATCH, DELETE: 404 for anyone but the owner, and for a discarded draft.

#### `POST /api/v1/mail/drafts/discard/`

`{"ids": [...]}`, 1 to 100: all or nothing (404 naming none). `200 {"discarded": n}`.

#### `POST /api/v1/mail/drafts/<id>/attachments/` · `DELETE .../attachments/<attachment_id>/`

Multipart `file`, throttled 60/min per user. The Files tab's checks
(`{"file": ["Choose a file."]}`, the type list, the magic bytes, 25 MB a
file); `400 {"code": "TOO_MANY_ATTACHMENTS", "detail": "A message can carry 25 files."}`;
`413 {"code": "DRAFT_TOO_LARGE", "detail": "Attachments are limited to 25 MB in total."}`;
`409 {"code": "DRAFT_SAVING", "detail": "This draft is still saving. Try again in a moment."}`
when the draft has no Drafts row for the moment (the next tick gives it one back).
201 `{attachment, revision, total_bytes}`. DELETE: 200 `{revision, total_bytes}`;
an upload is deleted with its file, a forwarded file only left out.

#### `POST /api/v1/mail/drafts/<id>/send/` · `.../confirm-sent/` · `.../reopen/`

Optional content plus `revision`, saved first and kept. Then, in order:
`400 {"to": ["Add someone to send it to."]}`; `400 {"record": ["Choose a record you can open."]}`;
`413 MESSAGE_TOO_LARGE` ("This message is over Gmail's 25 MB limit. Remove an attachment.");
the connection checks with the pause; `503 GMAIL_BUSY` + `Retry-After` (backoff);
`410 ATTACHMENT_GONE` / `409 ATTACHMENT_UNAVAILABLE` + `attachment_id`
(a part not yet fetched); then the claim (`409 ALREADY_SENT`), committed before
Gmail is called: `drafts.send` when Gmail holds the draft, else `messages.send`,
both through the upload endpoint with the thread id. `200 {draft, message, email}`
(`email` null when unfiled). Gmail's answers: 404 on `drafts.send` →
`409 DRAFT_GONE` ("This draft was sent or discarded in Gmail. Check Sent before sending it again.");
429 → `503 GMAIL_BUSY`; 413 → `413 MESSAGE_TOO_LARGE`; a lost grant → paused and
`502 MAILBOX_REFUSED`; others → `502 MAILBOX_REFUSED` (all reopen the draft); no
answer → `504 SEND_UNCONFIRMED` (left sending); a success on a draft that moved on →
`409 SEND_SUPERSEDED` (still filed and audited). The draft's own row becomes the sent
copy, filed on its record (To + Cc, never Bcc), forwarded files copied, Gmail's
Message-ID read back. confirm-sent and reopen: today's rule (claimed 10 minutes ago
or more, else `409 NOT_UNCONFIRMED`).

As built, beyond the list above:

- The claim can answer `409 DRAFT_CHANGED` (with `draft`) even when the body
  carried no content: the revision moved between the checks and the claim (a
  concurrent upload, say). Connection checks 1 to 3 are re-run under the lock;
  the pause check is not repeated.
- A failure after the claim and before Gmail is called reopens the draft and
  answers `502 MAILBOX_REFUSED`.
- confirm-sent also queues a delete for a Gmail draft the send did not use
  (a 404 from Gmail counts as done). Every reopen (the reopen route,
  Communications' reopen of a linked draft, and a refused or failed send)
  queues the draft's content for Gmail again on a connected mailbox, so it
  reads `gmail.state: "saving"` until the next tick saves it (the claim may
  have dropped a pending save; an identical update is harmless). After
  `DRAFT_GONE` the draft stays `local` and nothing is queued; on a mailbox
  disconnected meanwhile nothing is queued and a `failed` state stays
  visible, else it is `saved` when the draft has a Gmail id, `local` when not.
- History storing the sent message while the send settles is met in a
  savepoint: the row history stored becomes the sent copy (the draft's own
  row goes), and the settle, the filing and the audit still commit.
- A send that succeeded leaves a stored Gmail draft id that is not the draft it
  sent to be deleted by the next tick.

#### `GET /api/v1/mail/gmail/search/?q=&page_token=` · `POST /api/v1/mail/gmail/search/open/`

Throttled 30/min per user (shared). Live `messages.list` (spam and trash left
out, chats excluded), 20 a page: `{results: [{gmail_id, thread_id, subject, from,
to, snippet, sent_at, has_attachments, message_id}], next_page_token,
result_size_estimate}`; `message_id` is the held copy's id or null. The query sent to Gmail is
`(<q>) -in:chats`, so the person's text cannot change what the exclusion means. Nothing is
stored. Errors: `{"q": ["Type something to search for."]}`, `{"q": ["Keep the search under 500 characters."]}`,
`{"q": ["Gmail couldn't run that search."]}`, `GMAIL_ONLY`, `NO_MAILBOX`,
`MAILBOX_PAUSED`, `503 GMAIL_BUSY`. Open `{gmail_id}`: 200 the held copy's detail (a live draft's message
answers the draft's row), or 201 only when it stored the row (filed as the sync files);
`404 {"code": "NOT_IN_GMAIL", "detail": "This message is no longer in Gmail."}`.
A read-only Google mailbox may search.

**Sync.** The tick saves draft rows after label creations and before label rows
(an update waits for a create in flight; Gmail's 404 on an update recreates the
draft; 413 fails at once; a failure keeps the writing and tells the owner once,
`mail_action_failed` linking to the draft). A tick that touched a draft runs
`drafts.list`: drafts written in Gmail appear, ones edited there replace the
content at a new revision unless a Revenact edit is on its way, and vanished ones
are settled as sent there (filed) or discarded. The send-as name and signature are
read once a day. Sent drafts are pruned after 7 days, and discarded drafts 7
days after they were discarded (one is left behind when a disconnect deleted
its pending Gmail delete); a sent or discarded draft that still has a pending
or sending outbox row (a Gmail delete not yet run) is kept until that row
settles.

**Reconcile, as built.** It ignores sent and discarded drafts. History's
delete of a live (open or sending) draft's old Gmail message never deletes
its Drafts row: the reconcile moves the row onto Gmail's new message (or
deletes it with the draft), and a Revenact edit's flush moves it onto the
message Gmail answers with. A live draft found with no Drafts row gets one
back from the flush, the reconcile or history (the row held for its Gmail
message, else a new one showing its content). A draft that
vanished from `drafts.list` is first confirmed with one `messages.get` of its
Gmail message: the `SENT` label settles it as sent (filed); still present, it
waits for the next tick; 404 discards it. When Gmail's edit wins, Gmail's
parts replace the draft's (a local upload not yet flushed is lost). The count
of 25 files includes forwarded files.

**Measured query ceilings** (tests assert these; the contract's numbers were
lower): `POST /drafts/` 20, attachment upload 12 (counting the lock chain, part
insert, row update, total re-read and wake), attachment delete 13, bulk discard
at most 20 whatever the number of ids (it groups ids by mailbox, locks each
mailbox in pk order and wakes each).

**Known limitation.** A draft create retried after an unknown result (no
answer from Gmail) can leave a duplicate Gmail draft; the reconcile imports it
as a second draft.

### `POST /api/v1/mail/google/push/` (public)

Gmail's Pub/Sub push. `AllowAny`, no authentication, throttle `gmail_push`
(`THROTTLE_GMAIL_PUSH`, 600/min per source IP).
- **Body and switch:** a body over 64 KB is `413`; without `GMAIL_PUBSUB_TOPIC` the route is `404`.
- **The token:** the bearer token must be an RS256 OIDC token verified against Google's JWKS (PyJWT, keys cached an hour), with `aud == GMAIL_PUBSUB_AUDIENCE`, `iss` accounts.google.com, `exp` in the future, `email == GMAIL_PUBSUB_SERVICE_ACCOUNT` and `email_verified`.
- **Refusals:** a missing, malformed, badly signed or expired token, a wrong audience or issuer, or an unset audience or service account is `401`; another service account is `403`. Both are audited `mailbox.push_rejected {reason}`, anonymous.
- **A verified push** is always `204`, including a non-JSON or malformed body (nothing is woken). It sets `wake_at = COALESCE(wake_at, now)` on the live, unpaused Google mailbox at `message.data`'s `emailAddress` when its `historyId` is newer than ours. With `MAIL_SYNC_ON_PUSH` on (Cloud Run, where nothing runs between requests) a push that woke a mailbox then runs the `mail` tick inside the request, under that tick's lock; a failure there is logged by class name and the push is still `204`. Nothing from `data` is logged.

### The sync loop and the nightly prune

`python manage.py sync_mail --loop` runs forever and stops cleanly on SIGTERM:
- every `MAIL_SYNC_TICK_SECONDS` (5) it claims up to `MAIL_SYNC_BATCH` (10) due mailboxes with `FOR UPDATE SKIP LOCKED` and a `MAIL_LEASE_SECONDS` lease;
- once a minute it recomputes every Google mailbox's pause, audited `mailbox.paused` / `mailbox.resumed`.

When a mailbox is due:
- **Google:** connected, not paused, not leased, not backing off, and woken (push, Sync now, connect) or not synced for `MAIL_SYNC_INTERVAL_SECONDS` (60).
- **Outlook and IMAP:** every `MAIL_LEGACY_SYNC_INTERVAL_SECONDS` (600), through today's pass, and a failed pass waits the same.

How a Google failure is handled:
- 429, 5xx, no answer and rate-limit 403s back off this mailbox, `min(30 s × 2^(n−1), 15 min)` or Retry-After.
- A lost grant (`invalid_grant`, a 401 after one refresh) or `insufficientPermissions` sets `status=error` and `paused_reason=token_revoked` until a reconnect.
- A Google send that fails (compose and draft Send) the same way pauses the mailbox through the same path (`gmail_sync.pause_revoked`: `token_revoked`, a fixed sentence in `error`, audited `mailbox.paused`); a rate limit, another 403 or a network failure leaves the row untouched. Outlook and IMAP sends are unchanged.

`sync_mail` without `--loop` makes one pass over every live mailbox (`--user` for one). `run_health_maintenance` prunes Google mailboxes disconnected more than 30 days ago, their copies with them (`mailbox.pruned`).

### Where it sits in the frontend

`CommunicationsPage` renders `MailboxView` in the inbox card when the sidebar
source is `mailbox:<provider>`: folders (Inbox, Drafts, Sent, Done, Muted with
counts), Filters (Priority, Unread), Categories (Starred, Important, Spam,
Trash, then the five categories), the Categories block, the list grouped by
month, the open message in place with its reply box. The queue view (the four
kinds of waiting) is unchanged for every other source.

## `attention` — Dashboard Overview's "Needs attention" list

Mirrors: `src/pages/dashboard/...` (the Dashboard Overview redesign,
`react-ts-app/docs/superpowers/specs/2026-09-23-dashboard-redesign-design.md`).

Five kinds of item — **renewal**, **risk**, **going_quiet**, **support**,
**anomaly** — each built from the rule the screen it comes from already owns
(`services.attention.rules.build_items`), so the list can never disagree with
the page an item drills into. Every item is scored `at_stake × urgency`: ARR
in the organisation's currency times a 0.25–1.0 urgency whose formula is
per-kind. Twice filtered, same as every other dashboard here: companies
through `live_customers`, tickets through `visible_tickets`, anomaly evidence
through `visible_evidence` — a rule that reads across models never widens
what any one of them already restricts. No record text reaches an item;
reasons are built from fields only.

**Urgency formulas** (`services.attention.rules`, floor 0.25, ceiling 1.0,
straight line between the two points given):

| Kind | Measure | Formula |
|---|---|---|
| `renewal`, `risk` | days to renewal (negative = overdue) | overdue or ≤ 14 days → 1.0, down to 0.25 at 90 days; no renewal date at all → 0.5 |
| `going_quiet` | days since last contact | never contacted → 1.0; 0.25 at 60 days, up to 1.0 at 120 |
| `support` | the oldest matching open High/Critical ticket's age in days | 0.25 at 0 days, 1.0 at 14 days |
| `anomaly` | days since the anomaly was first seen | ≤ 7 days → 1.0, down to 0.25 at 90 days |

`score = round(at_stake * urgency, 2)`.

### Models

- `AttentionSnooze` — `organisation`, `user`, `key` (unique together),
  `until` (nullable; null means Done), `fingerprint` (JSON, the item's
  fingerprint at snooze time), `created_at`. Rows whose `until` passed more
  than 30 days ago are deleted by the nightly `run_health_maintenance` pass
  (`services.attention.snooze.prune_expired`) — table hygiene, not a
  visibility rule: a snooze that merely expired more recently already shows
  its item again on its own. `until=null` (Done) is never pruned.

### `GET /api/v1/dashboard/attention/?owner=&lifecycle=&customer=`

Auth: `IsAuthenticated`. The viewer's own candidate items — same filter
parsing as `GET /api/v1/customers/forecast/` (bad values ignored, never a
400) — with anything the viewer has snoozed dropped
(`services.attention.snooze.visible_items`), sorted by score desc then
title, capped at 25:

```json
{
  "items": [
    {
      "key": "renewal:42", "kind": "renewal", "title": "Acme",
      "reason": "renewal 5 days overdue · health Poor",
      "at_stake": 100000.0, "urgency": 1.0, "score": 100000.0,
      "customer_id": 42, "companies": [], "fingerprint": {"overdue": true, "health": "poor", "arr": 100000.0}
    }
  ],
  "currency": "USD",
  "filters": {"owners": [...], "lifecycles": [...], "customers": [...]}
}
```

`fingerprint` is the item's facts at the time it was built — the snooze
endpoint stores it, and `worse` below compares against it. Its shape is
internal and can change; clients should not read it. Per kind:

| `kind` | `fingerprint` (every one also carries `arr`, the ARR at stake) |
|---|---|
| `renewal` | `overdue` (bool), `health` (category), `renewal_date` (ISO date) |
| `risk` | `score` (the Triage score) |
| `going_quiet` | `last_contact` (ISO date, or `null` for never contacted) |
| `support` | `count` (open High/Critical tickets), `open_ids` (their ticket ids, sorted) |
| `anomaly` | `companies` (how many of the viewer's companies it spans) |

It holds facts (dates, counts, ids), never a count of days, so time passing
on its own never changes it.

**Size.** The list is built over the viewer's whole (filtered) live book on
every call, and is not capped before scoring — a cap would silently drop
items. For a `view_all_accounts` viewer that is the whole organisation;
the query count is constant, but the work grows with the book.

`companies` is only ever populated for `kind: "anomaly"` (an anomaly can span
several companies in the viewer's book); every other kind carries `[]`. ARR
that can't be converted to the org's currency counts as 0 at stake — the item
still appears, and its `reason` says so — rather than being dropped.

**Anomaly title rule.** The stored, model-written `Anomaly.title` can name a
company outside this viewer's book, or count companies across the whole
organisation, so it is only shown as written to a viewer who passes
`sees_everything` (`view_all_accounts` — `services.customers.scoping`).
Everyone else gets a title built from fields instead: `"Similar reports
across <n> of your companies"`, where `<n>` is the count of companies behind
that anomaly that are actually in their own (filtered) book. Same helper
as `GET /api/v1/anomalies/` (`services.anomalies.views.title_for`).

### `POST /api/v1/dashboard/attention/snooze/`

Auth: `IsAuthenticated`. `{"key": "renewal:42", "days": 7}` (1–90) or
`{"key": "renewal:42", "done": true}`. `key` must be one of the viewer's own
current items *right now*, built with no filters — the same rule the full
list itself reads, so a key from another organisation, or one that has
already resolved, is refused rather than silently stored:

```json
{"key": ["Not an item on your list."]}
```

(400) — also for a malformed key (anything but `<kind>:<id>`). Only the
key's own kind is built to check it, and for a company's kind only that one
company, still read through the viewer's visible book; an `anomaly:<id>` key
builds the anomaly kind only. On success, upserts an `AttentionSnooze` for `(user, key)` with the
item's current fingerprint and `until = now + days` (or `null` for Done).
Returns **201** `{"key": "renewal:42", "until": "2026-10-01T12:00:00Z"}`
(`until: null` for Done). Snoozing is strictly per-user: another member of
the same organisation, or the same account's other owner, still sees the item
until they snooze it themselves. If the item gets worse before the snooze
would have expired, it reappears immediately — a 7-day snooze or Done
alike. "Worse" (`services.attention.rules.worse`) compares the stored
fingerprint with the current one, and any one of these is enough: more ARR
at stake (every kind); a renewal that has become overdue, or whose health
band dropped; a higher risk score; more open High/Critical tickets; an
anomaly spanning more of the viewer's companies. A new episode is worse
too, so a Done lasts one episode, not forever: a renewal with a different
`renewal_date` (a new cycle), a going-quiet item with a different
`last_contact` (a new silence after a contact), a support item with an open
ticket id that wasn't open when it was snoozed (even if the count is the
same). The silence growing is not a change — it is why a going-quiet item
is on the list — and a day passing is never "worse" on its own, so a Done
item stays hidden while its facts hold. A stored fingerprint missing a key
(an older shape) counts as not worse on that key. Audited as `attention.snoozed` (`key`, and `days` or `done`).

### `DELETE /api/v1/dashboard/attention/snooze/<key>/`

Auth: `IsAuthenticated`. Deletes the viewer's own snooze for that key — 404
if there isn't one. `<key>` is matched with Django's `path` converter because
a key contains a `:` (e.g. `renewal:42`); the percent-encoded form a browser
sends for `encodeURIComponent(key)` (`renewal%3A42`) is accepted too.
Returns **204**. Audited as
`attention.unsnoozed` (`key`).

**One verb per URL.** The collection URL (`.../snooze/`) only accepts `POST`;
the key URL (`.../snooze/<key>/`) only accepts `DELETE`. A `POST` to the key
URL or a `DELETE` to the collection URL returns **405** — they are two
separate view classes (`AttentionSnoozeView`, `AttentionSnoozeDetailView`)
rather than one class answering both, precisely so neither wrong combination
can reach a handler that doesn't take the arguments it would need.

## `work` — Work (My work's feed, `/work/team`, the Team queue, the task panel)

Built for the Work round's first and second deliveries (spec: react-ts-app `docs/superpowers/specs/2026-10-07-work-round-design.md` §1, §2).

### Shared shapes

**TaskRow** (every Work list):

```json
{
  "id": 41,
  "title": "Call Pizza Hut",
  "due_date": "2026-10-05",
  "priority": "high",
  "status": "pending",
  "blocked_reason": "",
  "source": "manual",
  "parent": {"kind": "customer", "id": 7, "name": "Pizza Hut"},
  "assignee": {"id": 3, "name": "Carl CSM", "active": true},
  "plan": null,
  "private": false
}
```

- `private`: `true` for a to-do (a task with no record: its creator's alone). A to-do's `parent` is `null` and its `due_date` may be `null`; every other task has both.
- `priority`: `high | medium | low`.
- `status`: `pending | in-progress | blocked | completed`. `blocked_reason` is non-empty exactly
  when `status` is `blocked`.
- `source`: `manual | plan | rule | recommendation | agent`.
- `parent.kind`: `customer` (an organisation, `/organizations/<id>`) or `account`
  (`/accounts/<id>`).
- `assignee`: `{id, name, active}`, or `null` for an old seeded task. `active: false` is a
  deactivated person ("Unassigned (was X)").
- `plan`: `{id, name}` or `null`.

**Event** (a task's activity trail, oldest first):

```json
{
  "id": 9,
  "kind": "status",
  "actor": {"id": 3, "name": "Carl CSM"},
  "data": {"from": "pending", "to": "blocked", "reason": "Waiting on legal"},
  "body": "",
  "created_at": "2026-10-07T09:30:00.123456Z"
}
```

`actor` is `null` when Revenact did it (a rule, a recommendation). `data` by `kind`:

| kind | data | body |
|---|---|---|
| `created` | `{source, assignee: {id, name} \| null}`, plus `plan: <id>` (plan), `rule: <id>` (rule; the rule is never named), `proposal: <id>` (agent), `recommendation: <id>` (a task made from a recommendation), and for an agent task whose suggested person was not used `suggested: "<name>"`, `fallback: "no_member" \| "cannot_open"` | `""` |
| `recommended` | `{facts: ["Renews in 9 days", ...]}` (a task made from a recommendation: its facts) | `""` |
| `assigned` | `{from: {id, name} \| null, to: {id, name}}` | `""` |
| `status` | `{from, to}`, plus `reason` when `to` is `blocked` | `""` |
| `due_changed` | `{from: "YYYY-MM-DD", to: "YYYY-MM-DD"}` | `""` |
| `edited` | `{field: "title" \| "priority", from, to}` or `{field: "description"}` | `""` |
| `comment` | `{}` | the comment |
| `nudged`, `escalated` | delivery 3 | `""` |

### `GET /work/team/?scope=me|team|company`

`scope` defaults to the caller's widest (`GET /brain/scopes/` lists them; Team is shown when the
caller has `team` or `company`). `me`: the caller; `team`: the caller and everyone below them;
`company`: every member of the workspace.

```json
{
  "scope": "team",
  "today": "2026-10-07",
  "people": [
    {
      "person": {"id": 3, "name": "Carl CSM", "active": true},
      "open": 5,
      "overdue": 1,
      "blocked": 1,
      "oldest_overdue": "2026-10-05"
    }
  ],
  "hidden": 1
}
```

- Counts are over open tasks the caller may read. `open` includes overdue and blocked;
  `overdue` is past due and not Blocked; `oldest_overdue` is `null` when nothing is overdue.
- Every active person in the scope has a row, zero or not. A deactivated person appears only
  while they hold readable open tasks (`active: false`).
- Ordered by `overdue` (most first), then `open`, then name.
- `hidden`: open tasks assigned to the scope's people that the caller may not read ("N tasks you
  can't open"). For a view-all reader that is only tasks on records they cannot open (normally
  none); for a Leadership reader without view-all, tasks on records outside what they may open;
  for anyone else, also tasks outside their chain.
- Refusals: `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose me, team or company."}`;
  `403 {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}`.

### `GET /work/tasks/?assignee=<id>&state=open|overdue|blocked`

The Team drill-down: that person's open tasks in that state that the caller may read. `state`
defaults to `open`.

```json
{"tasks": [TaskRow]}
```

- Ordered by `due_date`, then `id`, at most 200 rows. No `hidden` here: the Team row already
  carries the scope's hidden total.
- A person in another workspace, or one the caller reads nothing of, is `{"tasks": []}`.
- Refusals: `400 {"assignee": ["Choose a person."]}`;
  `400 {"state": ["Choose open, overdue or blocked."]}`.

### `GET /work/assignees/?customer=<id>` or `?account=<id>`

The assignee picker for a record: every member of the workspace active for work (an active
user with an `active` membership; suspended and revoked members are left out), with whether
they can open it.

```json
{
  "people": [
    {"id": 1, "name": "Alice Admin", "function": "leadership", "can_open": true},
    {"id": 4, "name": "Dana CSM", "function": "cs", "can_open": false}
  ]
}
```

- Ordered by name. `can_open: false` people are shown disabled ("Can't open this account").
- Refusals: `400 {"detail": "Name one organisation or account."}` (neither, both, or not a
  number); `404 {"detail": "Not found."}` for a record the caller cannot open.

### `GET /tasks/<id>/`

The task panel.

```json
{
  "id": 41,
  "title": "Call Pizza Hut",
  "description": "",
  "due_date": "2026-10-05",
  "priority": "high",
  "priority_display": "High",
  "status": "pending",
  "status_display": "Pending",
  "blocked_reason": "",
  "source": "manual",
  "parent": {"kind": "customer", "id": 7, "name": "Pizza Hut"},
  "parent_name": "Pizza Hut",
  "parent_type": "customer",
  "assignee": {"id": 3, "name": "Carl CSM", "active": true},
  "assignee_name": "Carl CSM",
  "created_by": {"id": 2, "name": "Mona Manager"},
  "created_at": "2026-10-01T08:00:00.000000Z",
  "plan": null,
  "milestone": null,
  "initiative": null,
  "editable": ["title", "description", "status", "due_date", "priority", "assignee"],
  "events": [Event]
}
```

- `plan`/`milestone`: `{id, name}` or `null`; `initiative`: `{id, title}` or `null`.
- `editable`: the fields this caller may change. All six on an ordinary task (for every reader of
  it, view-all and Leadership readers included). A plan's task keeps the plan's rules: all six
  for the plan's editors (its owner and anyone above them) while the plan is open; otherwise
  `["status"]` for those the plan's task route lets tick it (the plan's editors, the task's
  assignee, its creator); `[]` for any other reader, view-all and Leadership included.
- `404 {"detail": "No such task."}` for a task the caller may not read: another workspace, a
  record they cannot open, or (for a caller without `view_all_accounts` or the Leadership function)
  outside the task's chain: its creator, its assignee and anyone above either.

### `PATCH /tasks/<id>/`

Any of:

```json
{
  "title": "Call Pizza Hut again",
  "description": "Ask about the renewal.",
  "status": "blocked",
  "blocked_reason": "Waiting on legal",
  "due_date": "2026-10-10",
  "priority": "medium",
  "assignee_id": 2
}
```

- On a to-do also `customer_id` or `account_id` (attach a record) and `due_date: null`; see Work in one place, delivery 1.
- `200` with the `GET /tasks/<id>/` shape. Unknown keys are ignored; nothing changed writes
  nothing. Clients send only the fields that changed; a field sent with its current value is
  ignored (never refused), so sending the whole form with one real change is that one change.
- `blocked_reason` is required (non-blank, at most 255) when the resulting status is `blocked`,
  may be sent alone to change the reason of a Blocked task, and is cleared when the status is
  anything else.
- Each changed field writes its event (see the table above). A changed assignee is told with a
  `task_assigned` notification, unless they are the caller; the previous assignee is not told.
  The change is audited as `task.update` with `fields`, and `from`/`to` when `status` changed.
- After a change that removes the caller's read access (e.g. handing the task outside their chain), the response still carries the task as saved, with `editable: []`; the next GET is 404.
- A plan's task is also audited as the plan's own task route audits it (`plan.task_changed`,
  `change: "edited"`), and a new assignee is told with `plan_task_assigned` instead of
  `task_assigned`, never the caller.
- Refusals:
  - `400 {"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."}`
    (or `"... this account."`): the new assignee is not an active member of the workspace who
    can open the task's record;
  - `400 {"assignee_id": ["Choose who does it."]}` for `null` or not a number;
  - `400 {"status": ["Choose pending, in progress, blocked or completed."]}`;
  - `400 {"blocked_reason": ["Say what it's blocked on."]}` or
    `{"blocked_reason": ["Keep the reason under 255 characters."]}`;
  - `400 {"title": ["Give the task a title."]}` (blank or missing value) or
    `{"title": ["Keep the title under 255 characters."]}`;
  - `400 {"description": ["Keep the description under 10,000 characters."]}`;
  - `400 {"priority": ["Choose high, medium or low."]}`;
  - `400 {"due_date": ["Choose a date."]}`;
  - `400 {"non_field_errors": ["Send the fields as one object."]}` for a body that is not an
    object;
  - a plan's task: `403 {"detail": "Only the plan's owner or their managers can change it."}`
    for a field other than `status` from someone who doesn't edit the plan,
    `403 {"detail": "Only the task's assignee, its creator or the plan's editors can tick it."}`
    for a `status` change from anyone else, and
    `400 {"non_field_errors": ["This plan is finished; only its tasks can change."]}` for one
    on a finished plan;
  - `404 {"detail": "No such task."}`.

### `POST /tasks/<id>/comments/`

```json
{"body": "Called, left a voicemail."}
```

- `201` with the new `comment` Event. Anyone who may read the task may comment.
- Refusals: `400 {"body": ["Write a comment."]}`;
  `400 {"body": ["Keep a comment under 5,000 characters."]}`; `404 {"detail": "No such task."}`.

### Changed existing routes

**`POST /customers/<id>/tasks/`, `POST /customers/<id>/accounts/<id>/tasks/`,
`POST /accounts/<id>/tasks/`** (New task):

```json
{
  "title": "Prep the QBR",
  "due_date": "2026-10-14",
  "priority": "medium",
  "assignee_id": 3,
  "description": ""
}
```

- `assignee_id` is optional (default: the caller). It must be an active member who can open the
  record, else `400 {"code": "ASSIGNEE_CANNOT_OPEN", ...}` as above.
- `status` (default `pending`) and `blocked_reason` are accepted as on PATCH.
- `201`, and the response row (and every row of these lists' `GET`) now also carries
  `description`, `blocked_reason`, `source` and `created_at`.
- The task gets a `created` event; its assignee is told (`task_assigned`) unless that is the
  caller.

**`GET /tasks/`** is unchanged in shape; a row's `status` may now be `blocked`.

**`PATCH /plans/<id>/tasks/<tid>/`** refuses `status: "blocked"`
(`400 {"status": ["Choose pending, in progress or completed."]}`): Blocked needs a reason, so it
is set from the task panel.

### Notifications

New kind `task_assigned` on `GET /notifications/`:

```json
{
  "id": 12,
  "kind": "task_assigned",
  "message": "Mona Manager assigned you “Prep the QBR” on Pizza Hut.",
  "link": "/work/mine?task=41",
  "actor": {"id": 2, "name": "Mona Manager"},
  "is_read": false,
  "created_at": "2026-10-07T09:30:00.123456Z"
}
```

- Sent when a task is created for someone else (a person, a rule or the AI agent), and when a
  task is reassigned through `PATCH /tasks/<id>/`. Plans keep their own `plan_task_assigned`.
- `actor` is `null` and the message starts "Revenact assigned you" for a rule's task.
- A recipient who cannot open the record reads
  "<who> assigned you a task on an account you can't open." (or "an organisation"), with no
  title or record name.

### Models — `Recommendation`, `WorkSettings`

`Recommendation` (`services/work/models.py`): `organisation`, `customer` (CASCADE), `account` (null; set for an account's own signal, `customer` then being its first organisation), `kind` (`renewal_due`, `health_drop`, `urgent_tickets`, `anomaly` are made; `overdue_tasks`, `open_questions` and `agent_action` stay in the enum for history only), `title`, `why` (`{facts, evidence}`), `proposal` (the AI agent's; CASCADE), `suggested_assignee`, `recipient`, `status` (`open`, `assigned`, `dismissed`, `expired`), `dismiss_reason`, `dismiss_note`, `decided_by`, `decided_at`, `task` (OneToOne, SET_NULL), `signal_value`, `created_at`. One open per organisation, kind and customer when the account is null, and per organisation, kind, customer and account otherwise (both partial unique constraints leave `agent_action` out); one open per proposal (an expired one may sit beside it). Made, refreshed and expired by `services/work/recommend.refresh`: daily from `run_health_maintenance` (before the rules) and on `POST /work/recommendations/refresh/`.

`WorkSettings` (OneToOne `Organisation`, made the first time anyone asks): `recommend_to` (`manager`, `owner`), `sources` (per kind, see `GET /work/settings/`), `dismiss_cooldown_days` (default 14), `timezone` (default `UTC`), `working_days` (default `[0,1,2,3,4]`), `escalate_after_days` (default 2), `digest_enabled` (default true), `digest_hour` (default 8), `updated_by`, `updated_at`. `Task` gains `last_nudged_at` and `escalated_at`, and `User` gains `digest_opt_out`.
`DigestSend` (`user`, `local_date`, `status`: `pending`, `sent`, `empty` or `failed`; one per person per local date) records each person's daily digest.

### What a recommendation is

Revenact reads the workspace once a day (and on "Run now") and recommends a task wherever a
signal triggers: a renewal due, a health drop, urgent tickets or a live anomaly (the four live
kinds). `overdue_tasks`, `open_questions` and `agent_action` were retired in Work in one place, delivery 2: no longer made; open ones were dismissed with reason `retired`. Each lands in one person's queue (the
**recipient**) with a **suggested assignee**. There is at most one open recommendation per kind
and record; a recommendation is open, assigned, dismissed or expired (its signal stopped). One
assigned or dismissed is not made again until its cooldown passes or the signal gets worse.

### Who sees and decides one

- **Decides:** its recipient, anyone above its suggested assignee in the org chart, or a reader
  with `view_all_accounts`. Leadership without `view_all_accounts` has no extra right here.
- **Record rule:** only on an organisation or account the reader may open. A recommendation
  about anything else is counted in `hidden`, never named, and its routes answer 404.

### Shared shapes

**RecommendationRow** (`GET /work/recommendations/` items):

```json
{
  "id": 5,
  "kind": "renewal_due",
  "title": "Prepare Dough Co's renewal",
  "why": {
    "facts": ["Renews in 30 days", "Renewal date 6 Nov"],
    "evidence": [{"label": "Dough Co", "link": "/organizations/2"}]
  },
  "record": {"kind": "customer", "id": 2, "name": "Dough Co"},
  "suggested_assignee": {"id": 3, "name": "Carl CSM", "active": true, "can_open": true},
  "recipient": {"id": 2, "name": "Mona Manager"},
  "defaults": {"title": "Prepare Dough Co's renewal", "due_date": "2026-10-30", "priority": "high"},
  "proposal": null,
  "created_at": "2026-10-07T00:05:00.123456Z"
}
```

- `kind`: `renewal_due | health_drop | urgent_tickets | anomaly` (the four live kinds; nothing
  else is made or listed).
- `why.facts`: plain sentences, shown as a short list. `why.evidence`: links inside the app
  (`/organizations/<id>`, `/accounts/<id>`, `/brain/anomalies`), each `{label, link}`.
- `record.kind`: `customer` (an organisation, `/organizations/<id>`) or `account`
  (`/accounts/<id>`).
- `suggested_assignee`: `null` when nobody could be suggested (the item went to a fallback
  recipient). `can_open: false` or `active: false` means that person can no longer take it: do
  not prefill them (the Assign picker is `GET /work/assignees/?customer=|account=`, delivery 1).
  Whether each distinct suggested assignee on the page can still open their rows' records is
  checked once per assignee, not once per row.
- `defaults`: what Assign prefills. `due_date` is the renewal date minus 7 days for
  `renewal_due` (never before today), otherwise today plus 3 working days (Monday to Friday). `priority` is `high` for
  `renewal_due`, `health_drop`, `urgent_tickets` and `anomaly`.
- `proposal`: always `null` now (kept for the row's shape).

Sentences `facts` take, by kind:

| kind | title | facts |
|---|---|---|
| `renewal_due` | "Prepare <name>'s renewal" | "Renews in 9 days" / "Renews in 1 day" / "Renews today" / "Renewal is 3 days overdue"; "Renewal date 6 Nov" |
| `health_drop` | "Find out why <name>'s health fell" | "Health fell 5.6 → 4.9 since 30 Sep" |
| `urgent_tickets` | "Get <name>'s urgent tickets moving" | "3 urgent tickets open"; "Oldest opened 6 days ago" |
| `anomaly` | "Check <name> against a live anomaly" | "Named in 1 live anomaly"; "Last seen 2 days ago" |

No fact ever names another record, a ticket's, task's or question's text, or an anomaly's
model-written title: only the record itself and counts.

**DecidedRecommendation** (the decision routes, and the 409):

```json
{
  "id": 5,
  "status": "assigned",
  "decided_by": {"id": 2, "name": "Mona Manager"},
  "decided_at": "2026-10-07T09:30:00.123456Z",
  "task_id": 41,
  "dismiss_reason": "",
  "dismiss_note": ""
}
```

- `status`: `open | assigned | dismissed | expired`. `decided_by` and `decided_at` are `null`
  while open; an expired one has `decided_by: null` and `decided_at` when it expired.
- `task_id`: the task it became (assigned only), else `null`.
- `dismiss_reason`: `already_handled | not_relevant | wrong_person | other | retired`, or `""`.
  `dismiss_note`: the reader's text for `other`, else `""`. A retired recommendation reads
  `dismiss_reason: "retired"` (set by migration, never by a person).

### `GET /work/recommendations/?scope=me|team`

The open recommendations the caller may decide, newest first.

```json
{
  "scope": "team",
  "items": [RecommendationRow],
  "count": 3,
  "hidden": 1
}
```

- `me`: those in the caller's own queue (they are the recipient). `team`: everything the caller
  may decide (their queue, those suggesting anyone below them, and for a `view_all_accounts`
  caller every open one in the workspace).
- `scope` defaults to `team` for a caller with reports or `view_all_accounts`, else `me`.
- At most 100 `items`; `count` is the full total. `hidden`: open recommendations in the same set
  about records the caller cannot open ("N more about accounts you can't open"). Counted, never
  listed.
- The sidebar badge is `GET /work/feed/count/`.
- Refusal: `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose me or team."}`.

### `POST /work/recommendations/<id>/assign/`

```json
{
  "assignee_id": 3,
  "due_date": "2026-10-30",
  "title": "Prepare Dough Co's renewal",
  "priority": "high"
}
```

- `assignee_id` is required; `due_date`, `title` and `priority` are optional and default to the
  row's `defaults`.
- `201`:

  ```json
  {"recommendation": DecidedRecommendation, "task": TaskRow}
  ```

- The task: on the recommendation's record, `source: "recommendation"`, `created_by` the caller, `description` built from the facts
  (`"Recommended by Revenact:\n- Renews in 30 days\n- Renewal date 6 Nov"`). Its trail starts
  with `created` (`data` carries `recommendation: <id>`)
  then `recommended` (`data: {facts: [...]}`). The assignee is told (`task_assigned`) unless they
  are the caller.
- Audited as `work.recommendation_assign` (`kind`, `decided_as`: `recipient`, `chain` or
  `company`, as held when the decision is made under its row lock, `task`).
- Refusals, in this order:
  - `404 {"detail": "No such recommendation."}`: another workspace, a record the caller
    cannot open, or a recommendation gone by the time it is locked;
  - `403 {"code": "CANT_DECIDE", "detail": "You can't decide this recommendation."}`, also when
    a refresh re-routed it away from the caller between the check and the decision;
  - `400` field errors: `{"assignee_id": ["Choose who does it."]}` (missing, `null`, not a
    number), `{"due_date": ["Choose a date."]}`, `{"title": ["Give the task a title."]}` or
    `{"title": ["Keep the title under 255 characters."]}`,
    `{"priority": ["Choose high, medium or low."]}`;
  - `409` when it is no longer open (someone decided first, or it expired):

    ```json
    {
      "code": "ALREADY_DECIDED",
      "detail": "Mona Manager already assigned this.",
      "recommendation": DecidedRecommendation
    }
    ```

    `detail` is "<name> already assigned this." / "<name> already dismissed this." /
    "This recommendation has expired.";
  - `400 {"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."}`
    (or `"... this account."`): the assignee is not an active member who can open the record.

### `POST /work/recommendations/<id>/dismiss/`

```json
{"reason": "other", "note": "They are moving to annual billing"}
```

- `reason` is required: `already_handled | not_relevant | wrong_person | other`. `note` is
  required with `other` (non-blank, at most 255 characters after trimming) and ignored, at any
  length, otherwise.
- `200 {"recommendation": DecidedRecommendation}`.
- A dismissed signal is not recommended again for the workspace's `dismiss_cooldown_days`
  unless it gets worse (a renewal becomes overdue; a health drop falls by another full `drop`;
  more tickets or anomalies than when dismissed). Whether an earlier decision
  holds a signal back is read once per kind for every record that kind found this run, not once
  per record.
- Audited as `work.recommendation_dismiss` (`kind`, `decided_as`, `reason`).
- Refusals: as assign (404, 403, then 400, then 409), with the field errors
  `{"reason": ["Choose already handled, not relevant, wrong person or other."]}`,
  `{"note": ["Say why."]}`, `{"note": ["Keep the note under 255 characters."]}`.

### `POST /work/recommendations/refresh/`

"Run now" in Settings › Work. `manage_org_settings` only. No body.

```json
{"created": 2, "updated": 5, "expired": 1, "unrouted": 0, "notified": 2, "failed": []}
```

- `created`: new open recommendations; `updated`: open ones whose title, facts, severity or
  routing actually changed (an open recommendation already up to date is not counted);
  `expired`: open ones whose signal stopped, whose source was turned off, or that is still
  triggering but has become unroutable (no active member can open the record — such a one is
  counted in both `expired` and `unrouted`); `unrouted`: signals nobody could receive this run;
  `notified`: recipients told. The caller is never counted in `notified` or sent
  `recommendations_waiting`, even when they are a recipient of what this run made.
  `failed`: the sources that failed this run (each fails on its own; the others still ran),
  and `"recommendations_waiting"` when the notice failed (the recommendations stand).
- Audited as `work.recommendations_refresh`.
- Refusal: `403 {"detail": "You don't have permission to change organisation settings."}`.

### `GET /work/settings/`

Any member.

```json
{
  "recommend_to": "manager",
  "sources": {
    "renewal_due": {"enabled": true, "days": 30},
    "health_drop": {"enabled": true, "drop": 0.5, "window_days": 14},
    "urgent_tickets": {"enabled": true, "min": 1},
    "anomaly": {"enabled": true}
  },
  "dismiss_cooldown_days": 14,
  "timezone": "Asia/Kolkata",
  "working_days": [0, 1, 2, 3, 4],
  "escalate_after_days": 2,
  "digest_enabled": true,
  "digest_hour": 8,
  "email_ready": false,
  "can_edit": false
}
```

- `recommend_to`: `manager` (the suggested person's manager receives it, when they have an
  active one who can open the record) or `owner` (the suggested person receives it).
- `sources`: exactly the four live kinds, `renewal_due`, `health_drop`, `urgent_tickets` and
  `anomaly`. `overdue_tasks`, `open_questions` and `agent_action` were retired in Work in one place, delivery 2: no longer made; open ones were dismissed with reason `retired`. A stored value for a retired kind is ignored, and a `PATCH` naming one is
  `400 {"sources": {"<kind>": ["Unknown source."]}}`. Per kind: `days` (renewal: within this many days, or overdue), `drop` and
  `window_days` (health now at least `drop` below the latest reading from `window_days` ago or
  earlier), `min` (at least this many open critical or high tickets).
- `can_edit`: the caller holds `manage_org_settings`; everyone else sees the page read-only.
- `timezone`: an IANA name, default `"UTC"` (always accepted). Work's "today", "overdue", "due
  today", "this week" and the Work badge (`GET /work/feed/count/`) are the date in this timezone; Brain and the
  other sections keep the server's date.
- `working_days`: weekday numbers, Monday `0` to Sunday `6`, ascending, no repeats, at least one.
- `escalate_after_days`: whole number 1 to 30, default 2, counted in working days overdue.
- `digest_enabled`: boolean, default `true`. `digest_hour`: whole number 0 to 23, the local hour
  after which the daily digest goes.
- `email_ready`: read only. `false` when the server cannot send email (console or dummy
  `EMAIL_BACKEND`); digests are skipped then.

### `PATCH /work/settings/`

`manage_org_settings` only. Any of the `GET` fields but `can_edit`; inside `sources`, any kind
and any of its fields (the rest keep their values):

```json
{
  "recommend_to": "owner",
  "sources": {"renewal_due": {"days": 45}, "health_drop": {"enabled": false}},
  "dismiss_cooldown_days": 7
}
```

- `200` with the `GET` shape. Unknown top-level keys are ignored; a body that changes nothing
  writes nothing and is not audited. A real change is audited as `work.settings_update`
  (`fields`).
- Limits: `days` and `window_days` whole numbers 1–120; `min` a whole number 1–50; `drop` a
  number 0.1–5 (kept to one decimal place); `dismiss_cooldown_days` a whole number 0–120;
  `enabled` `true` or `false`; `escalate_after_days` a whole number 1–30; `digest_hour` a whole
  number 0–23. `email_ready` and `can_edit` are ignored if sent. `working_days` is stored sorted
  with repeats removed (`[4, 0, 0]` saves as `[0, 4]`).
- Refusals (`400`, nothing saved):
  - `{"timezone": ["Choose a timezone from the list."]}`;
  - `{"working_days": ["Choose at least one working day."]}`;
  - `{"escalate_after_days": ["Choose a whole number from 1 to 30."]}`;
  - `{"digest_enabled": ["Choose on or off."]}`;
  - `{"digest_hour": ["Choose a whole number from 0 to 23."]}`;
  - `{"recommend_to": ["Choose manager or owner."]}`;
  - `{"dismiss_cooldown_days": ["Choose a whole number from 0 to 120."]}`;
  - `{"sources": {"renewal_due": {"days": ["Choose a whole number from 1 to 120."]}}}` (and the
    same for `window_days`);
  - `{"sources": {"urgent_tickets": {"min": ["Choose a whole number from 1 to 50."]}}}`;
  - `{"sources": {"health_drop": {"drop": ["Choose a number from 0.1 to 5."]}}}`;
  - `{"sources": {"<kind>": {"enabled": ["Choose on or off."]}}}`;
  - `{"sources": {"<kind>": {"<field>": ["Unknown setting."]}}}`;
  - `{"sources": {"<kind>": ["Unknown source."]}}`;
  - `{"sources": {"<kind>": ["Send each source's settings as one object."]}}`;
  - `{"sources": ["Send the sources as one object."]}`;
  - `{"non_field_errors": ["Send the fields as one object."]}`;
  - `403 {"detail": "You don't have permission to change organisation settings."}`.

### Changed existing routes (delivery 2)

**`POST /agents/actions/<id>/approve/`** and **`.../reject/`** no longer settle a recommendation
(delivery 2 of Work in one place deleted the cross-settlement): their responses are unchanged.

**Event `created`** (delivery 1's trail) carries `recommendation: <id>` for a task made from a
recommendation.

### Notifications (delivery 2)

New kind `recommendations_waiting` on `GET /notifications/`:

```json
{
  "id": 30,
  "kind": "recommendations_waiting",
  "message": "3 tasks recommended for your team.",
  "link": "/work/mine?kind=suggestion",
  "actor": null,
  "is_read": false,
  "created_at": "2026-10-07T00:05:00.123456Z"
}
```

- After each run, every recipient with new open recommendations, or an open one re-routed to
  them, is told once, and at most once a day; never the person who clicked "Run now".
- One new item, to a recipient who may open its record: "Revenact recommends “Prepare Dough
  Co's renewal”." Otherwise counted: "N tasks recommended for you." when every new item suggests
  the recipient themselves, else "N tasks recommended for your team." Never names a record the
  recipient cannot open.
- Assigned, dismissed and expired recommendations are never notified about again.

### Tracking that pushes (delivery 3)

**Notifications.** Two new kinds on `GET /notifications/`, both linking to
`/work/mine?task=<id>`, with `actor` null (Revenact):

- `task_overdue`, to the task's assignee, at most once per task per workspace-local day, on the
  workspace's working days, while the task is open, past due and not Blocked. A recipient who may
  open the record reads `“Call Pizza Hut” on Pizza Hut is 2 days overdue.` (`1 day overdue`);
  otherwise `A task on an organisation you can't open is overdue.` (or `account`).
- `task_escalated`, once per task, to the assignee's active manager (`reports_to`) in the same
  workspace, else the workspace's active owner, once the task is `escalate_after_days` working
  days overdue (straight away for an assignee no longer active for work). A recipient who may open the record
  reads `“Call Pizza Hut” on Pizza Hut, assigned to Carl CSM, is 2 working days overdue.`;
  otherwise `A task assigned to Carl CSM on an organisation you can't open is overdue.` (or
  `account`). Blocked tasks and tasks with no assignee are never nudged or escalated.
- "Active" here, and everywhere Work picks a person, means active for work: the user is active
  and their membership in the workspace is `active`. A suspended or revoked member is not
  reminded, not escalated to, gets no digest, is never suggested or routed a recommendation
  (nor a draft reply), is not told it is waiting, is not offered in the assignee picker nor accepted as `assignee_id` (the same `ASSIGNEE_CANNOT_OPEN` as an inactive user), is not
  told of a task assigned to them (`task_assigned`), and a rule's task meant for them goes to the
  rule's owner; a task assigned to one escalates straight away. A recommendation's
  `suggested_assignee.active` reads false for them.

**Task events.** `nudged` (`data: {days_overdue, to: {id, name}}`) and `escalated`
(`data: {working_days_overdue, to: {id, name}}`) are now written, `actor` null. Trail sentences:
`Revenact reminded Carl CSM: 2 days overdue.` and
`Revenact told Mona Manager: 2 working days overdue.` Reassigning a task, changing its due date
or re-opening a completed task makes it eligible to escalate again; no event is written for that.

**The daily digest** is an email, with no route. After `digest_hour` in the workspace's timezone,
on its working days, each member active for work with an email who has not set `digest_opt_out` gets one
plain-text digest (overdue, due today, recommendations waiting, blocked, and up to 5 named
items), once per person per local day, only when there is something to report, and only while
`digest_enabled` is on and `email_ready` is true. Counts and items come from the reader's own
My work's feed (`feed_tasks`) and Recommended, so they never name what the reader cannot open.

### Work in one place, delivery 1 (2026-10-12)

### 1. To-dos

A **to-do** is a `customers.Task` with neither `customer` nor `account`. There is no flag: a task
with no record is a to-do, and attaching a record makes it an ordinary task.

| Rule | Detail |
|---|---|
| Who reads it | Its creator (`created_by`) only. Not their manager, not view-all, not Leadership. Anyone else gets `404 {"detail": "No such task."}` from `GET`/`PATCH /tasks/<id>/` and `POST /tasks/<id>/comments/`. |
| Who it is assigned to | Always its creator. Any other assignee is `400 {"assignee": ["A to-do without a record can only be yours."]}`. |
| Due date | Optional. A to-do may have no date (`due_date: null`). A task **with** a record always has a date (see Decision 1). |
| Where it appears | `GET /work/feed/` (kind `todo`) and its count, the task panel, and the creator's own daily digest. Nowhere else: not `GET /tasks/`, not a record's Tasks tab, not `GET /work/team/`, `GET /work/tasks/`, Brain (graph, doing), Copilot, the agents' evidence, recommendations or exports. |
| Tracking | Never nudged or escalated (only tasks with a record and a date are tracked). |
| Agents | No agent action may target a to-do: the evidence never contains one, so a proposal naming one is dropped at generation. |

#### 1.1 `POST /work/todos/`

Creates a to-do, or, with a record, an ordinary task (the same task the record's own
`POST /customers/<id>/tasks/` or `POST /accounts/<id>/tasks/` would make).

Request:

```json
{
  "title": "Book the QBR room",
  "due_date": "2026-10-14",
  "priority": "high",
  "customer_id": 7,
  "account_id": null,
  "assignee_id": 3
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string, 1–255 after trimming | yes | |
| `due_date` | `YYYY-MM-DD` or `null` | no (to-do); **yes** with a record | |
| `priority` | `"high" \| "medium" \| "low"` | no | Default `"medium"`. |
| `customer_id` | integer or `null` | no | An organisation the caller may open. |
| `account_id` | integer or `null` | no | An account the caller may open. Never together with `customer_id`. |
| `assignee_id` | integer or `null` | no | Default: the caller. Without a record it may only be the caller. With a record: an active member who may open that record. |

Unknown keys are ignored. `description` is not accepted here (write it in the task panel).

Response `201`:

```json
{
  "task": { "...": "TaskDetail (§1.3)" },
  "item": { "...": "FeedItem (§2.2), or null" },
  "group": "no_date"
}
```

- `task`: the task panel's shape (`GET /tasks/<id>/`), as saved.
- `item`: the new row exactly as `GET /work/feed/` would show it to the caller, or `null` when the
  task is not on the caller's desk (it was given to someone else).
- `group`: the feed group the item belongs in (`overdue | today | week | later | no_date | blocked`),
  or `null` with a `null` item.

Side effects: a `created` TaskEvent (`source: "manual"`); a `task_assigned` notification to the
assignee when the assignee is not the caller (record tasks only; a to-do is always the caller's).
Not audited (record task creation is not audited either; edits are, as `task.update`).

Errors (400 unless stated; all fields are validated together, then the record, then the rest):

| When | Body |
|---|---|
| `title` missing, blank, null or not a string | `{"title": ["Give the task a title."]}` |
| `title` over 255 | `{"title": ["Keep the title under 255 characters."]}` |
| `due_date` not a date | `{"due_date": ["Choose a date."]}` |
| `priority` not one of the three | `{"priority": ["Choose high, medium or low."]}` |
| `customer_id` / `account_id` not an integer | `{"customer_id": ["Choose an organisation or account you can open."]}` (or `account_id`) |
| `assignee_id` not an integer | `{"assignee_id": ["Choose who does it."]}` |
| both `customer_id` and `account_id` | `{"record": ["Choose an organisation or an account, not both."]}` |
| the record does not exist, is another workspace's, or the caller cannot open it | `{"record": ["Choose an organisation or account you can open."]}` |
| no record and `assignee_id` is someone else | `{"assignee": ["A to-do without a record can only be yours."]}` |
| a record and no `due_date` (missing or null) | `{"due_date": ["Choose a date."]}` |
| a record and an assignee who is not an active member able to open it | `{"code": "ASSIGNEE_CANNOT_OPEN", "detail": "That person can't open this organisation."}` (`account` for an account) |

#### 1.2 `PATCH /tasks/<id>/` (existing route, extended)

Unchanged for ordinary tasks except the two new keys below are refused on them. For a to-do:

- Every existing field works (`title`, `description`, `status` with `blocked_reason`, `due_date`,
  `priority`). **Done** is `{"status": "completed"}`; **undo** is `{"status": "<previous status>"}`
  (with `"blocked_reason"` when the previous status was `blocked`).
- `due_date: null` clears a to-do's date. On a task with a record it is
  `400 {"due_date": ["Choose a date."]}` (as before).
- `assignee_id` other than the creator: `400 {"assignee": ["A to-do without a record can only be yours."]}`.
- **Attaching a record**: send `customer_id` or `account_id` (an integer). The to-do becomes an
  ordinary task under record rules from then on (its creator's chain, view-all and Leadership may
  read it, it is tracked, agents see it).
  - The record must be one the caller may open: else `400 {"record": ["Choose an organisation or account you can open."]}`.
  - Both at once: `400 {"record": ["Choose an organisation or an account, not both."]}`.
  - Not an integer: `400 {"customer_id": ["Choose an organisation or account you can open."]}` (or `account_id`).
  - The task must end up with a date: a to-do with no date needs `due_date` in the same PATCH,
    else `400 {"due_date": ["Choose a date."]}`.
  - `assignee_id` in the same PATCH is checked against the new record (`ASSIGNEE_CANNOT_OPEN` as above).
  - It writes an `edited` TaskEvent `{"field": "record", "from": null, "to": {"kind": "customer", "id": 7, "name": "Pizza Hut"}}`
    and the `task.update` audit lists `"record"` in `fields`.
- `customer_id`/`account_id` sent as `null`, or equal to the task's current record, change nothing.
- `customer_id`/`account_id` naming a different record on a task that already has one:
  `400 {"record": ["A task's organisation or account can't be changed."]}`. A record cannot be removed.

#### 1.3 Shape changes (TaskRow, TaskDetail)

Both shapes stay as documented in `docs/API_CONTRACTS.md` (`work`, "Shared shapes"), plus:

- `private` (boolean, new, on TaskRow and so on TaskDetail): `true` for a to-do.
- For a to-do: `parent: null`, `parent_name: null`, `parent_type: null`.
- `due_date` may be `null`, for a to-do only.
- `editable` on a to-do's TaskDetail is
  `["title", "description", "status", "due_date", "priority", "assignee", "record"]`; on every
  other task it is unchanged (never contains `"record"`).

The record endpoints (`/customers/<id>/tasks/`, `/accounts/<id>/tasks/`, `/tasks/`) never return a
to-do, and `due_date` stays **required** on their `POST` (`{"due_date": ["This field is required."]}`
as today).

---

### 2. The feed

#### 2.1 `GET /work/feed/`

The caller's desk, one list in eight groups. Query parameters:

| Param | Values | Default |
|---|---|---|
| `kind` | comma-separated subset of `approval, rule_review, question, draft, task, todo, suggestion` | every kind |
| `group` | one of the eight group keys | absent: the whole feed |
| `cursor` | a group's `next` value, exactly as received | absent: the first page |

Without `group`: the whole feed (shape below). With `group` (and an optional `cursor`): one
group's page (§2.5).

Response `200`:

```json
{
  "groups": [
    {"key": "decide", "count": 3, "items": [], "next": null},
    {"key": "overdue", "count": 1, "items": [], "next": null},
    {"key": "today", "count": 0, "items": [], "next": null},
    {"key": "week", "count": 0, "items": [], "next": null},
    {"key": "later", "count": 0, "items": [], "next": null},
    {"key": "no_date", "count": 2, "items": [], "next": null},
    {"key": "blocked", "count": 0, "items": [], "next": null},
    {"key": "suggested", "count": 4, "items": [], "next": null}
  ],
  "hidden": 2,
  "failed": []
}
```

- `groups`: always all eight, always in this order, empty ones included (`count: 0`,
  `items: []`, `next: null`). The page hides empty groups.
- `count`: the group's full total for the asked kinds (not just this page). Each group returns
  at most **50** items; `next` is a cursor string when more exist, else `null`.
- `hidden`: how many items of the asked kinds wait on the caller's desk about records they can
  no longer open. Never named, never listed (§2.4).
- `failed`: the asked kinds whose source failed to load, in the order
  `approval, rule_review, question, draft, task, todo, suggestion`. Their items are absent and
  their counts are 0; the rest of the feed is complete. Still `200`. `task` and `todo` share one
  source and always fail together.

| Group key | Holds | Order |
|---|---|---|
| `decide` | `approval`, `rule_review`, `question`, `draft` | oldest `at` first; ties: `rule_review`, `approval`, `question`, `draft`, then id |
| `overdue` | `task`, `todo` past due and not Blocked | `due_date`, then priority (high, medium, low), then `created_at`, then id |
| `today` | due today, not Blocked | same |
| `week` | due in 1 to 7 days, not Blocked | same |
| `later` | due in more than 7 days, not Blocked | same |
| `no_date` | no due date, not Blocked (to-dos only: see Decision 1) | priority, `created_at`, id |
| `blocked` | status `blocked`, whatever the date | `due_date` (no date last), priority, `created_at`, id |
| `suggested` | `suggestion` | newest `at` first, then id descending |

An item is in exactly one group. A Blocked task is only in `blocked`, never `overdue`.

#### 2.2 FeedItem

```json
{
  "key": "agent_action:41",
  "kind": "approval",
  "id": 41,
  "title": "Move Acme to At risk",
  "record": {"type": "customer", "id": 7, "name": "Acme"},
  "from": {"type": "agent", "label": "CS agent"},
  "at": "2026-10-11T09:00:00Z",
  "due_date": null,
  "priority": null,
  "private": false,
  "actions": ["approve", "reject"],
  "detail": {}
}
```

| Field | Type | Meaning |
|---|---|---|
| `key` | string | `<source>:<id>`, stable and unique across the feed. Sources: `agent_action`, `rule_review`, `question`, `draft`, `task` (tasks **and** to-dos: a to-do keeps its key when a record is attached), `recommendation`. |
| `kind` | `approval \| rule_review \| question \| draft \| task \| todo \| suggestion` | |
| `id` | integer | The source row's id: what its action endpoint takes. |
| `title` | string | See the per-kind table. |
| `record` | `{"type": "customer" \| "account", "id", "name"}` or `null` | `customer` links `/organizations/<id>`, `account` links `/accounts/<id>`. Always a record the caller may open. |
| `from` | `{"type": "agent" \| "rule" \| "person" \| "revenact", "label": string}` | Who put it there. |
| `at` | timestamp | When it was proposed, asked, drafted, created or recommended (`created_at` of the row). |
| `due_date` | date or `null` | Tasks and to-dos only; `null` for every other kind and for a dateless to-do. |
| `priority` | `"high" \| "medium" \| "low"` or `null` | Tasks and to-dos only. |
| `private` | boolean | `true` for a to-do only ("Only you"). |
| `actions` | string[] | What the caller may do from the row (§2.3). Empty means read-only. |
| `detail` | object | Kind-specific payload so existing components render without another request (per-kind table). |

| kind | Source (unchanged rules) | `title` | `record` | `from` | `detail` |
|---|---|---|---|---|---|
| `approval` | `AgentAction` status `proposed` on the caller's Me desk (`brain.desk.agent_actions(reader, Me, sessions)`) | the action's title | its record, or `null` (workspace-level) | `{"type": "agent", "label": "CS agent" \| "Sales agent" \| "Ops agent"}` | Brain Waiting's agent-action `detail`: the ActionPayload (`GET /agents/actions/<id>/`) plus `"session": {"id", "title"} \| null` (title `"Shared conversation"` unless the caller sees the whole conversation) |
| `rule_review` | `RuleReview` waiting on one of the caller's rules (`brain.desk.rule_reviews`) | `"<Survey\|Campaign> from <rule name>"` | `null` | `{"type": "rule", "label": "<rule name>"}` | `{"rule_id", "rule_name", "review_kind": "survey" \| "campaign", "counts": RuleReview.counts as stored — survey `{"people", "records"}`, campaign `{"reach", "skipped"}`, "review": RuleReview payload \| null}` (`review` only when the caller owns the rule, always true on My work) |
| `question` | `knowledge.Question` open and assigned to the caller (`brain.desk.questions`) | the question's text, first 200 characters | its organisation or `null` | `{"type": "person", "label": "<asker's name>"}` | `{"text": "<full text>", "asked_by": {"id", "name"}}` |
| `draft` | the caller's own `ReplyDraft` with status `open` (Communications › Drafts) on a record they may open | email: the draft's subject, or `"Reply to an email"` when blank; ticket: `"Reply on <ticket number>"` | its record | `{"type": "agent", "label": "CS agent" \| "Sales agent"}` | `{"channel": "email" \| "ticket"}` |
| `task` | open `Task` (not completed) with a record, assigned to the caller, that they may read (`task_access.openable_tasks`) | the task's title | its record | `agent` → `{"type": "agent", "label": "AI agent"}`; `rule` → `{"type": "rule", "label": "A rule"}`; `recommendation` → `{"type": "revenact", "label": "Revenact"}`; otherwise the creator `{"type": "person", "label": "<name>"}`, or `{"type": "revenact", "label": "Revenact"}` with no creator | the TaskRow (§1.3) |
| `todo` | open `Task` with no record created by the caller | the title | `null` | `{"type": "person", "label": "<caller's name>"}` | the TaskRow (§1.3), `private: true`, `parent: null` |
| `suggestion` | open `Recommendation` with the caller as recipient (`rec_access.decidable(reader, "me")`) of kind `renewal_due`, `health_drop`, `urgent_tickets` or `anomaly`, on a record they may open | the recommendation's title | its record | `{"type": "revenact", "label": "Revenact"}` | the RecommendationRow (`GET /work/recommendations/` item: `id, kind, title, why, record, suggested_assignee, recipient, defaults, agent_action: null, created_at`) |

Recommendations of the kinds `overdue_tasks`, `open_questions` and `agent_action` never appear in
the feed (an overdue task is already in `overdue`, a question in `decide`, an agent action as an
`approval`), so nothing is shown twice.

#### 2.3 Actions and the endpoints they call

The feed never decides anything itself: each action calls the item's existing route, unchanged.

| kind | action | When offered | Call | Success | Conflicts and refusals |
|---|---|---|---|---|---|
| approval | `approve` | `agents.deciding.may_decide(reader, action)` (owner, above the owner, or view-all; an owner change also needs the owner-change right) | `POST /agents/actions/<id>/approve/` body `{}`; a `task.create` may send `{"assignee_id", "title", "due_date", "priority"}` | `200 {"action": ActionPayload}` | `409 {"code": "ALREADY_DECIDED", "detail": "<Name> already applied this.", "action": ...}` (verbs: applied, rejected, undid, expired; `Revenact` when nobody); `409 {"code": "EXPIRED", "detail": "This action has expired: <reason>.", "action": ...}`; `409 CHANGED_SINCE`, `409 OWNER_LIMIT` (detail as sent); `403 {"code": "CANT_DECIDE", "detail": "You can't decide this action."}`; `404 {"code": "NO_SUCH_ACTION", "detail": "No such action."}` |
| approval | `reject` | same | `POST /agents/actions/<id>/reject/` body `{"note"?: string ≤ 255}` | `200 {"action": ...}` | as approve; `400 {"note": ["Keep the note under 255 characters."]}` |
| approval | (undo, from the toast) | after an approve | `POST /agents/actions/<id>/undo/` | `200 {"action": ...}` | `409 NOT_APPLIED`, `410 {"code": "UNDO_EXPIRED", "detail": "Undo is available for 7 days after an action applies."}`, `409 CHANGED_SINCE` |
| rule_review | `approve` | the caller owns the rule | `POST /rules/reviews/<id>/approve/` | `200 {"survey_send_id"}` or `200 {"campaign_send_id"}` | `400` Surveys'/Campaigns' own body (stored on the review); `409 {"detail": "This review has already been decided."}`; `404 {"detail": "Not found."}` |
| rule_review | `skip` | same | `POST /rules/reviews/<id>/skip/` | `200` the review | same 409/404 |
| question | `answer` | the caller is the assignee, or holds `manage_users` | client only: opens Copilot on the question, as Brain › Waiting did | | |
| draft | `open` | always | client only: Communications › Drafts on `detail`'s draft (`GET /communications/drafts/<id>/`) | | |
| task, todo | `done` | always (every task on the desk is the caller's to tick; Decision 12) | `PATCH /tasks/<id>/` body `{"status": "completed"}` | `200` TaskDetail | `404 {"detail": "No such task."}` (lost access or deleted); undo: `PATCH` `{"status": "<previous>"}` (+ `blocked_reason` if it was blocked) |
| task, todo | `open` | always | client only: the task panel (`GET /tasks/<id>/`) | | |
| suggestion | `add` | always on My work (the caller is the recipient) | `POST /work/recommendations/<id>/assign/` body `{"assignee_id": <caller's id>}` (title, date and priority default server-side from `detail.defaults`) | `201 {"recommendation": Decided, "task": TaskRow}` | `409 {"code": "ALREADY_DECIDED", "detail": "<Name> already assigned this." \| "This recommendation has expired." \| "This recommendation was already dismissed.", "recommendation": ...}`; `403 {"code": "CANT_DECIDE", "detail": "You can't decide this recommendation."}`; `404 {"detail": "No such recommendation."}` |
| suggestion | `assign` | same | same route, `{"assignee_id": <chosen>, "title"?, "due_date"?, "priority"?}`; the picker is `GET /work/assignees/?customer=<id>` or `?account=<id>` | same | as add, plus `400 ASSIGNEE_CANNOT_OPEN` |
| suggestion | `dismiss` | same | `POST /work/recommendations/<id>/dismiss/` body `{"reason": "already_handled" \| "not_relevant" \| "wrong_person" \| "other", "note"?: string}` (note required, ≤ 255, for `other`) | `200 {"recommendation": Decided}` | `400 {"reason": ["Choose already handled, not relevant, wrong person or other."]}`, `400 {"note": ["Say why."]}`; 409/403/404 as add |

`actions` values in order: approval `["approve", "reject"]` (or `[]`), rule_review
`["approve", "skip"]` (or `[]`), question `["answer"]` (or `[]`), draft `["open"]`, task and todo
`["done", "open"]`, suggestion `["add", "assign", "dismiss"]`.

A 404 or 403 from an action means the caller lost access: remove the row and add one to the
page's `hidden`. A 409 means someone else decided first: remove the row with the `detail`
sentence when it names a person, else "Already decided."

#### 2.4 Privacy

- Every source is the existing rule, reused: `brain.desk` for approvals, reviews and questions;
  `task_access.openable_tasks` for tasks; `rec_access.decidable` + `openable` for suggestions.
  Nobody sees more than they see today.
- `hidden` counts, for the asked kinds: approvals, reviews and questions on the caller's Me desk
  they can no longer open (`waiting - readable`, as Brain › Waiting did); open tasks assigned to them
  on records they can no longer open (as the old Today did); their own open drafts on records
  they can no longer open; open suggestions of the four kinds sent to them about records they
  can no longer open. To-dos are never hidden.
- A to-do is only ever in its creator's feed.
- Being asked a question about an organisation opens it to you (`scoping.visible_customers`), so a question on your Me desk is never hidden.

#### 2.5 Paging: `GET /work/feed/?group=<key>&cursor=<next>`

Returns one group's next page (or, without `cursor`, its first page: the page's "Try again" for
one failed group uses this):

```json
{
  "group": {"key": "overdue", "count": 61, "items": [], "next": null},
  "failed": []
}
```

- Same `kind` filter as the feed request (send the same `kind`).
- The cursor is opaque (URL-safe text). It is a keyset position ("after this item"), not an
  offset: rows the caller acted on since the first page never cause another row to be skipped
  or repeated. `count` is the group's current total.
- `failed` lists the asked kinds of **this group** whose source failed (their items absent).
- Errors (400):

| When | Body |
|---|---|
| `group` not one of the eight | `{"group": ["Choose decide, overdue, today, week, later, no_date, blocked or suggested."]}` |
| `cursor` without `group` | `{"cursor": ["Say which group to page."]}` |
| `cursor` malformed, or made for another group | `{"cursor": ["That list has changed. Reload Work."]}` |
| `kind` empty or naming an unknown kind (feed, page and filter alike) | `{"kind": ["Choose approval, rule_review, question, draft, task, todo or suggestion."]}` (since Agent bundles delivery 1: `"Choose bundle, rule_review, question, draft, task, todo or suggestion."`) |

#### 2.6 `GET /work/feed/count/`

The one Work badge. No parameters (`kind` is ignored).

```json
{"decide": 3, "overdue": 1, "badge": 4, "failed": []}
```

- `decide`: the full `decide` group count (approvals, reviews, questions and drafts the caller
  may open).
- `overdue`: the full `overdue` group count (tasks and to-dos past due, not Blocked).
- `badge`: `decide + overdue`. Suggestions are not in the badge.
- `failed`: as in the feed; a failed source counts 0.
- Counts only: no rows are read. This replaces the Work badge's two calls
  (`/work/recommendations/` and the removed `/work/today/`) and `/brain/waiting/count/`, both
  routes now gone (delivery 2).

#### 2.7 Performance

- `GET /work/feed/`: the query count does not grow with the number of items (pinned by a test
  that adds every kind five more times and compares). Ceiling: `FEED_CEILING` in
  `services/work/tests/test_feed_queries.py`, set at the measured value, 54 queries (53 before Agent bundles delivery 1).
- `GET /work/feed/count/`: same, ceiling `COUNT_CEILING`, set at the measured value, 23 queries (re-measured for Agent bundles delivery 1: unchanged; Agent bundles delivery 2: 26, the badge counts the reader's own department queue).
- No query uses `DISTINCT` (Postgres 16: a join made unique with DISTINCT plans badly); every
  visibility rule is an `id IN` subquery. A test asserts it over every query of both routes.

Decisions and their costs: `docs/superpowers/plans/2026-10-12-work-one-place-api.md` §3.

### Work in one place, delivery 2 (2026-10-12)

Delivery 2 ("Team and clean-up") adds to delivery 1 above and lists what it removes. Every path is under `/api/v1/`, every route is `IsAuthenticated`.

### Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person
will notice.

| # | Decision | Cost if wrong |
|---|---|---|
| D1 | **Nothing shows twice.** The Team queue leaves out everything already on the reader's own My work: their own approvals, rule reviews, questions, overdue tasks and suggestions. A manager sees what waits on the people below them, not on themselves. | Low: drop one `exclude` per source. |
| D2 | **Team offers My team and Company only.** "Me" leaves the Team switch (My work is your desk). My team needs reports; Company needs view-all or Leadership (Brain's rule, unchanged). `scope=me` is refused on the queue; `GET /work/team/?scope=me` keeps working for old clients. | Low. |
| D3 | **What the queue holds:** approvals, rule reviews, questions, overdue tasks (past due and not Blocked, Work's own meaning), and suggestions. Not drafts (a reply draft is its owner's alone), never to-dos (a to-do is its creator's alone, not even counted), not tasks that are only due soon or Blocked. | Low: another task group is one more source. |
| D4 | **Actions only where today's rules allow.** Approve/Reject an agent action only when the existing approver rule allows it (`agents.deciding.may_decide`). A rule review is read-only (only its rule's owner decides it, and the owner's own reviews are on their My work). Answer a question only with `manage_users` (the existing answer rule). An overdue task only opens the task panel: no Done from the queue. A suggestion offers Assign and Dismiss, not "Add to my work". | Low: Done for managers is one per-row rights check. |
| D5 | **Which suggestions:** open ones of the four live kinds that the reader may decide today (the rule behind Recommended's "My team"), on records they may open, whose recipient is someone in scope other than the reader. Ones the reader may not decide are not listed and not counted. | Low. |
| D6 | **"For" names the person it waits on:** an approval's record owner, a review's rule owner, a question's assignee, a task's assignee, a suggestion's recipient. `null` for an agent action with no record (workspace-level) or on a record nobody owns: the page says "For the whole company". | Trivial. |
| D7 | **Workspace-level agent actions** (no record, e.g. the Ops agent's) appear only in the Company queue and only to view-all readers, exactly as on Brain › Waiting. They are never counted as hidden for anyone else. | None: unchanged rule. |
| D8 | **The queue's shape is the feed's:** three groups (`decide`, `overdue`, `suggested`) with the feed's order, page size (50), keyset cursors and `failed`; no `kind` filter (the Team page has no chips). | Low. |
| D9 | **Retired recommendations are closed, not deleted:** open ones of the three retired kinds become `dismissed` with reason `retired`, no decider, at migration time. History rows keep their kind. Nobody can choose `retired` as a dismissal reason. | Low. |
| D10 | **Retired switches leave the settings API.** `GET /work/settings/` no longer lists `overdue_tasks`, `open_questions` or `agent`; a stored value for them is ignored; a `PATCH` naming one is `400 {"sources": {"<kind>": ["Unknown source."]}}` like any unknown source. | Low: an old browser tab toggling a retired switch sees the refusal. |
| D11 | **AI agent proposals get their own once-a-day notice** (owner decision on Q1). Their old "recommendations waiting" notice came from the mirror recommendation, which is retired; a new `agent_proposal_waiting` notice ("AI proposal waiting") replaces it: at most one per person per day, only to people who could decide a new proposal on their own My work, linking `/work/mine?kind=approval` (§4.1). | Low: one notification kind the bell renders like any other. |
| D12 | **"Run now" on an agent no longer refreshes recommendations** (its proposals are approvals now); it sends the AI proposal notice instead (§4.1). Its answer is unchanged. | None. |
| D13 | **Brain's Ask keeps "what's waiting" as background.** Only the two Waiting routes and the badge count are removed; `brain.waiting.build` stays as one of Ask Revenact's grounding sources (Ask history can name the old tab). | Low: a later round can drop it. |
| D14 | **Links into Work.** Task notices (assigned, overdue, escalated) open the task over My work: `/work/mine?task=<id>`, a manager's escalation included. The daily digest links `/work/mine`; the new-recommendations notice `/work/mine?kind=suggestion`; the rule-review notice `/work/mine?kind=approval`. Notifications already sent keep their old links; the frontend's redirects (`/work/today`, `/work/recommended`, `/brain/waiting`, `/brain/review`) stay, so no stored row is rewritten. | Low. |
| D15 | **`GET /work/recommendations/` stays** (unchanged shape). Nothing in the app reads it after this delivery; it is not removed here. | None. |

### 1. `GET /work/feed/team/`

What waits on the reader's team: the people in scope other than the reader (D1). Query parameters:

| Param | Values | Default |
|---|---|---|
| `scope` | `team` or `company` | the widest the reader has: `company` for view-all or Leadership, else `team` |
| `group` | `decide`, `overdue` or `suggested` | absent: the whole queue |
| `cursor` | a group's `next`, exactly as received | absent: the first page |

Any other parameter (including `kind`) is ignored.

#### 1.1 Access

| Reader | `team` | `company` | no `scope` |
|---|---|---|---|
| Has reports (anyone below them in the chart) | 200 | 403 unless view-all or Leadership | `team` (or `company` if also view-all/Leadership) |
| View-all or Leadership, no reports | 403 | 200 | `company` |
| Neither | 403 | 403 | 403 |

Refusals (checked before anything is read, in this order):

| When | Status | Body |
|---|---|---|
| `scope` is `me`, empty, or not a scope | 400 | `{"code": "SCOPE_UNKNOWN", "detail": "Choose team or company."}` |
| the reader may not use that scope (or has neither) | 403 | `{"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}` |
| `cursor` without `group` | 400 | `{"cursor": ["Say which group to page."]}` |
| `group` not one of the three | 400 | `{"group": ["Choose decide, overdue or suggested."]}` |
| `cursor` malformed, or made for another group | 400 | `{"cursor": ["That list has changed. Reload Work."]}` |

#### 1.2 Response `200` (whole queue)

```json
{
  "scope": "team",
  "groups": [
    {"key": "decide", "count": 2, "items": [], "next": null},
    {"key": "overdue", "count": 1, "items": [], "next": null},
    {"key": "suggested", "count": 0, "items": [], "next": null}
  ],
  "hidden": 1,
  "failed": []
}
```

- `scope`: the scope read (the default when none was asked).
- `groups`: always these three, in this order, empty ones included.
- `count`: the group's full total; at most **50** items per group; `next` a cursor when more exist.
- `hidden`: items waiting on people in scope about records the reader cannot open (or, for a rule
  review, on a rule they cannot read). Counted, never named. To-dos and drafts are never counted.
- `failed`: the kinds whose source failed, in the order `approval, rule_review, question, task,
  suggestion`; their items are absent and their counts 0. Still `200`.

| Group | Holds | Order (the feed's) |
|---|---|---|
| `decide` | `approval`, `rule_review`, `question` | oldest `at` first; ties `rule_review`, `approval`, `question`, then id |
| `overdue` | `task`: open, with a record, past due and not Blocked | `due_date`, priority (high, medium, low), `created_at`, id |
| `suggested` | `suggestion` | newest `at` first, then id descending |

#### 1.3 Paging: `?scope=<s>&group=<key>[&cursor=<next>]`

```json
{"scope": "team", "group": {"key": "overdue", "count": 61, "items": [], "next": null}, "failed": []}
```

The cursor is the feed's keyset position: acting on rows between pages never makes another row
skip or repeat. Without `cursor`, the group's first page (a failed group's Try again). `failed`
lists the failed kinds of this group only.

#### 1.4 TeamItem

Delivery 1's FeedItem (§2.2 of its contract), plus `for`:

```json
{
  "key": "agent_action:41",
  "kind": "approval",
  "id": 41,
  "title": "Move Acme to At risk",
  "record": {"type": "customer", "id": 7, "name": "Acme"},
  "from": {"type": "agent", "label": "CS agent"},
  "at": "2026-10-11T09:00:00Z",
  "due_date": null,
  "priority": null,
  "private": false,
  "actions": ["approve", "reject"],
  "detail": {},
  "for": {"id": 3, "name": "Carl CSM"}
}
```

| kind | Source (existing rule, reused) | `for` | `actions` | `detail` |
|---|---|---|---|---|
| `approval` | `brain.desk.agent_actions(reader, scope, sessions)`, minus the reader's Me desk | the record's owner; `null` with no record or no owner | `["approve", "reject"]` when `agents.deciding.may_decide(reader, action)`, else `[]` | as delivery 1 (ActionPayload + `session`) |
| `rule_review` | `brain.desk.rule_reviews(reader, scope)`, minus the reader's own rules | the rule's owner | always `[]` (D4) | as delivery 1, `review: null` |
| `question` | `brain.desk.questions(reader, scope)`, minus those assigned to the reader | the assignee | `["answer"]` with `manage_users`, else `[]` | as delivery 1 |
| `task` | open `Task` with a record, assigned to someone in scope (not the reader), past due and not Blocked, that the reader may read (`task_access.openable_tasks`) | the assignee | always `["open"]` (D4) | the TaskRow |
| `suggestion` | `rec_access.decidable(reader, "team")` of the four live kinds, recipient in scope and not the reader, cut by `rec_access.openable` | the recipient | always `["assign", "dismiss"]` | the RecommendationRow |

`title`, `record`, `from`, `at`, `due_date`, `priority` and `private` follow delivery 1's per-kind
table. `private` is always `false` here: a to-do never reaches the queue.

#### 1.5 Actions

Each action calls the item's existing route, unchanged (delivery 1 contract §2.3): approve/reject
`/agents/actions/<id>/approve|reject/` (and undo), assign/dismiss
`/work/recommendations/<id>/assign|dismiss/` (the picker is `GET /work/assignees/`), answer and
open are client-only. Their refusals are unchanged: 409 means someone else decided first; 404 or
403 means the reader lost access (the page removes the row and adds one to `hidden`).

#### 1.6 Privacy

- Every source is the existing rule, reused; nobody sees more than Brain › Waiting showed them at
  the same scope.
- A to-do is never listed, counted or hidden. A draft is never listed, counted or hidden. Here "draft" is a reply draft (My work's `draft` kind); a proposed agent action that would send a draft reply is an approval, and when its source is one the reader cannot read it counts in `hidden` (as on Brain › Waiting) but is never named.
- Every AI-made row is filtered twice: on the way in, the source's own rule (the agents' evidence
  rules, `may_read_source` for a draft reply's recommendation, the recommender's record rule); on
  the way out, the reader's record rule (`agents.views.readable`, `rec_access.openable`,
  `task_access.openable_tasks`) before anything is named, and `may_decide` / `decidable` before an
  action is offered.

#### 1.7 Performance

- The query count does not grow with the number of items (pinned by a test that adds every kind
  five more times and compares). Ceiling: `TEAM_CEILING` in
  `services/work/tests/test_feed_team_queries.py`, measured on the branch: 45 queries for `team` and 44 for `company` (re-measured for Agent bundles delivery 1: `TEAM_CEILING` 46, `team` 46 and `company` 45). The suggestions' assignee check costs one or two queries per distinct suggested person
  on the page (as Recommended), never per row.
- No query uses `DISTINCT`; every visibility rule is an `id IN` subquery (Postgres 16). A test
  asserts it over every query of both scopes.

### 2. Retired recommendation kinds

`overdue_tasks`, `open_questions` and `agent_action` are no longer produced.

- **Recommender** (`work.recommend.refresh`, nightly and Settings › Work's Run now): reads the four
  live kinds only. `RefreshResult` keeps its shape; `failed` can only name live kinds and
  `recommendations_waiting`.
- **Data migration** `work.0006_retire_recommendation_kinds`: every open recommendation of a retired
  kind becomes `status: "dismissed"`, `dismiss_reason: "retired"`, `decided_at` = the migration's
  time, `decided_by: null`. Reverse: no-op. `Recommendation.DismissReason` gains `retired`
  ("Retired"); the enum `Kind` keeps all seven values for history.
- **Deciding a retired one** (an old tab): it is no longer open, so assign/dismiss answer the
  existing `409 {"code": "ALREADY_DECIDED", "detail": "This recommendation was already dismissed.", "recommendation": {... "dismiss_reason": "retired"}}`.
- **Dismiss reasons a person may send** stay the four: `already_handled`, `not_relevant`,
  `wrong_person`, `other`. `"retired"` is `400 {"reason": ["Choose already handled, not relevant, wrong person or other."]}`.
- **Settings:** `GET /work/settings/` `sources` has exactly `renewal_due`, `health_drop`,
  `urgent_tickets`, `anomaly`. `PATCH` with `overdue_tasks`, `open_questions` or `agent` under
  `sources` is `400 {"sources": {"<kind>": ["Unknown source."]}}` (D10).
- **Cross-settlement deleted:** deciding an agent action no longer settles a recommendation, and
  deciding a recommendation never applies or rejects an agent action. `POST
  /work/recommendations/<id>/assign/` no longer answers `400 USE_APPLY` (no open recommendation
  carries an agent action).
- **Agents:** `POST /agents/<kind>/run/` no longer runs the recommender afterwards; it sends the AI proposal notice (§4.1) instead (D12).

### 3. Removed

| Route | Was | Now |
|---|---|---|
| `GET /brain/waiting/?scope=` | Brain › Waiting on you | 404 (route gone). Team and company views: `GET /work/feed/team/`; the reader's own: `GET /work/feed/`. |
| `GET /brain/waiting/count/` | Brain's badge | 404. The one badge is `GET /work/feed/count/`. |
| `GET /work/today/` | Work › Today | 404. The reader's tasks are in `GET /work/feed/`. |

`brain.desk` stays (the feed's and the queue's building blocks); `brain.waiting.build` stays for
Ask Revenact's grounding only (D13).

### 4. Notification links (D14)

| Notification kind | Link before | Link now |
|---|---|---|
| `task_assigned`, `task_overdue`, `task_escalated` | `/work/today?task=<id>` | `/work/mine?task=<id>` |
| `recommendations_waiting` | `/work/recommended` | `/work/mine?kind=suggestion` |
| `rule_review` | `/brain/review` | `/work/mine?kind=approval` |
| `agent_proposal_waiting` (new, §4.1) | none | `/work/mine?kind=approval` (since Agent bundles delivery 1: `/work?queue=mine&kind=bundle`) |

The daily digest email's "Open Work" line links `<FRONTEND_URL>/work/mine`. Every other
notification link is unchanged.

**Agent bundles delivery 3:** `agent_step_failed` ("Agent step failed") goes to the run's runner (`bundle.run_by`; a Retry by someone else does not change it, and an Auto bundle sends none), once per run, retry or settled stuck run that left a step failed; link `/work?queue=history&bundle=<id>`; no actor, no daily limit. One failed: `Step 2 failed in “Pizza Hut: login loop”: Jira says the project SUP needs a component.`; several: `2 steps failed in “Pizza Hut: login loop”.` (title cut to 120 characters, message to 500). See "Agent bundles, delivery 3" section 7.

#### 4.1 The AI proposal notice (`agent_proposal_waiting`)

**Since Agent bundles delivery 1** this notice is "Bundles waiting", over bundles: see "Agent bundles, delivery 1" §10.6 below.

Owner decision (D11): AI agent proposals keep a bell notice after their mirror recommendation is
retired.

- **Kind:** `agent_proposal_waiting`, label "AI proposal waiting". Message: `AI proposals are
  waiting for your decision.` Link: `/work/mine?kind=approval`. No actor.
- **Who is told:** a person is told when at least one proposed agent action, made since they were
  last told (and inside the 14-day proposal window), is on their own My work's Approvals (the
  feed's own source, `feed_decide.Approvals`, so the feed's visibility rules exactly) **and** they
  may decide it (`agents.deciding.may_decide`). Someone who only sees a proposal (a session
  participant without the right) or could decide it only from Team (a manager above the owner, a
  view-all reader) is not told. A suspended or revoked member is never told; nor is the person who
  pressed Run now.
- **How often:** at most one per person per workspace day (`work.clock.start_of_day`), and only
  for proposals made after their previous notice of this kind: a proposal never causes a second
  notice.
- **When:** at the end of every recommender pass (`work.recommend.refresh`: nightly and Settings ›
  Work's Run now) and after an agent's Run now (`POST /agents/<kind>/run/`). A failed notice is
  logged and never fails the pass or the run; `RefreshResult` keeps its shape.
- **Cost:** the queries grow with the number of people who might be told, never with the number
  of proposals (pinned by a test, `PROPOSAL_NOTICE_CEILING` in `services/work/tests/test_proposal_notice.py`, set at the measured value, 41 queries; re-measured for Agent bundles delivery 1: unchanged).

### Agent bundles, delivery 1 (2026-10-13)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-13-agent-bundles-d1-api.md` §10; the bundles themselves are in the `agents` section). Work is an inbox of queues: Mine (`GET /work/feed/`), My team and Rest of company (`GET /work/feed/team/?scope=team|company`), and History (`GET /agents/bundles/history/`), listed by `GET /work/queues/`. Agent proposals are `bundle` feed items in place of `approval` ones.


#### 10.1 Feed kinds (`GET /work/feed/`, "Mine")

`KINDS` = `bundle, rule_review, question, draft, task, todo, suggestion` (in `failed` order);
`DECIDE_KINDS` (ties) = `rule_review, bundle, question, draft`. `?kind=approval` is read as
`bundle` (D9). The unknown-kind sentence: `"Choose bundle, rule_review, question, draft, task,
todo or suggestion."`. The decide group's bundle rows: waiting bundles (not read-time expired) with
a waiting step on the reader's Me desk (`brain.desk.agent_actions(reader, ME, sessions)`'s
waiting steps), cut by §8; `hidden` adds the rest. Everything else in the feed is unchanged.

#### 10.2 Queues (`GET /work/feed/team/`)

| `scope` | Queue | Who | What |
|---|---|---|---|
| `team` | My team | has reports | unchanged (Work in one place D2), bundles in place of approvals |
| `company` | **Rest of company** | view-all or Leadership | the company minus the reader and everyone below them (D7); workspace-level bundles for view-all only |

New `?kind=` on this route: `bundle, rule_review, question, task, suggestion` (comma list, as the
feed; `approval` read as `bundle`); others `400 {"kind": ["Choose bundle, rule_review, question,
task or suggestion."]}`. A kind filter drops the groups it empties' sources, exactly as the feed's.
Each bundle row carries `for` (§4.1).

#### 10.3 `GET /work/queues/` (new)

```json
{
  "queues": [
    {"key": "mine", "label": "Mine", "count": 4},
    {"key": "team", "label": "My team", "count": 7},
    {"key": "company", "label": "Rest of company", "count": 12},
    {"key": "history", "label": "History", "count": null}
  ],
  "failed": []
}
```

Only the queues the reader may use, in this order. `count` = decide + overdue (D8), each source in
its own savepoint; a queue with any failed inner source (a count that would be wrong) has
`count: null` and its key in `failed`. **Delivery 2 plugs in
here:** department queues (`department:<id>`, label the department's name, after Rest of company)
and `unassigned` (admins), each also a `scope` of `GET /work/feed/team/`; this delivery's code
keeps the queue list a tuple of `(key, label, may_use, count)` makers so D2 adds rows, not shapes.

#### 10.4 Badge (`GET /work/feed/count/`)

Shape unchanged. `decide` counts bundles in place of approvals. (Delivery 2 adds the reader's
department queues.)

#### 10.5 History (`GET /agents/bundles/history/`)

Query: `agent` (`cs|sales|ops`), `step_kind` (any registry kind: a bundle with at least one step of
it), `status` (`done|partly_done|rejected|expired|superseded`), `page` (1-based). Unknown values:
`400 {"<param>": ["Choose cs, sales or ops."]}` / `["Choose an action kind."]` / `["Choose done,
partly done, rejected, expired or superseded."]`.

```json
{"count": 61, "next": "...?page=2", "previous": null, "results": [<Bundle>], "hidden": 2}
```

Bundles in a finished status the reader may read (§8), ordered `-updated_at, -id`, 50 a page,
each with its steps (results, `outputs`, `error`, `undo`). `hidden`: finished bundles on records
the reader can't open (workspace-level ones a reader isn't shown are not counted, as Activity).
Nothing waiting or running is listed.

#### 10.6 "Bundles waiting" (was "AI proposal waiting")

`Notification.Kind.AGENT_PROPOSAL_WAITING` keeps its value; its label becomes "Bundles waiting"
(`notifications.0014`). Message: `"Bundles are waiting for your decision."` Link:
`/work?queue=mine&kind=bundle`. Who and how often: unchanged rules (Work in one place D2 §4.1)
over bundles: a person is told when a bundle made since they were last told is on their own Mine
and they may run at least one of its steps; once per workspace day.

#### 10.7 Other links

The undo notice links `/work?queue=history&bundle=<bundle id>` (D20). `copilot/skills.py`'s Work
mentions say History (`/work?queue=history`). No other stored or new link changes.

#### Performance (re-measured)

`FEED_CEILING` 54 (was 53), `COUNT_CEILING` 23, `TEAM_CEILING` 46 (`team` 46, was 45; `company` 45), `PROPOSAL_NOTICE_CEILING` 41, and the new `QUEUES_CEILING` 41 (Agent bundles delivery 2: 42, with department and Unassigned rows; `COUNT_CEILING` 26) for `GET /work/queues/` (a manager 41; view-all 40, Leadership only 40, a CSM 25; `services/agents/tests/test_bundle_queries.py`). None grows with the number of bundles; no query uses `DISTINCT`.

### Agent bundles, delivery 2 (2026-10-13)

The queues and the badge learn about message bundles (full text under the `agents` section, "Agent bundles, delivery 2", §4.5 to §4.7 and D2-7 to D2-9, D2-24). Every change adds keys or queues; the D1 frontend ignores what it does not know.

- **`GET /work/queues/`** gains `department:<code>` rows (labelled with the department's name; `<code>` is a `User.Function` value) for that department's people and Leadership, and an `unassigned` row for admins (`manage_org_settings`), each listed when the workspace has an enabled ticket connector in that department (or none, for Unassigned), even with nothing waiting. Order: `mine`, `team`, `company`, department queues in `User.Function` order, `unassigned`, `history`. A department or Unassigned row's `count` is its readable waiting bundles (no overdue); a failed count is `count: null` with the key in `failed`. If the connector read fails the rail keeps its D1 rows. Mine, My team and Rest of company never count or list a department or Unassigned bundle, even when the record's owner later becomes the reader. These queues have no kind chips (`?kind=` is accepted and ignored).
- **Round 2 delivery 3:** every `GET /work/queues/` row gains `needs_customer` and `GET /work/unmatched/`, `POST /work/unmatched/<id>/match/` and `.../dismiss/` list, match and dismiss Slack and Jira messages that match no customer (full text in "Agent bundles, round 2 delivery 3: wider intake", agents section below).
- **`GET /work/feed/team/?scope=department:<code>|unassigned`**: the team shape (`scope`, `groups` decide/overdue/suggested, `hidden`, `failed`) with `overdue` and `suggested` always empty and `decide` holding the queue's waiting bundles (inside 14 days, by the bundle read rule, the rest counted in `hidden`), oldest first, keyset paged by `group=decide&cursor=` (a bad or stale cursor is the `400` cursor error). A code that is not a `User.Function` value is `400 SCOPE_UNKNOWN` ("Choose team, company, a department or unassigned."); a queue the reader may not use is `403 SCOPE_NOT_ALLOWED`.
- **`GET /work/feed/count/`**: shape unchanged; `decide` adds the reader's own department queue's count (their `function`); Unassigned is not counted. A failure there adds `bundle` to `failed`. Mine's count in `/work/queues/` does not include the department queue.
- **A bundle feed item** (`kind: "bundle"`): `detail.source` gains `channel` (null for nightly), and a message bundle's `label` names the channel as the Bundle's source block does (`"Email"`, `"Slack"`, `"Zendesk"`, `"Freshdesk"`, `"Jira"`, `"Webhook"`; nightly stays `"Nightly review"`); `detail` gains `routed_to` (`owner`, `department`, `admins`) and `department` (`{"key", "label"}` or null). `for` is null for a department or Unassigned bundle on an ownerless record.
- **"Bundles waiting"** (`agent_proposal_waiting`): owner-routed bundles notify as before; a new department or Unassigned bundle notifies each person who may read and run one of its steps (department: its people and Leadership; Unassigned: admins), once a workspace day, and the limit is shared with the Mine notice (same kind). Links: `/work?queue=department:<code>&kind=bundle` or `/work?queue=unassigned&kind=bundle`.
- **Performance (re-measured):** `QUEUES_CEILING` 42 (was 41; `QUEUE_QUERIES` carl 26, mona 42, alice 41, lee 41), `COUNT_CEILING` 26 (was 23), the new `DEPARTMENT_QUEUE_CEILING` 11 (`?scope=department:cs`, constant in rows; `services/agents/tests/test_intake_queries.py`). `FEED_CEILING` 54, `TEAM_CEILING` 46 and `PROPOSAL_NOTICE_CEILING` 41 are unchanged. No query uses `DISTINCT`.

### Slack messages sent to Work (Connections page, 2026-10-16)

A Slack message a person sent with the "Send to Revenact" shortcut (see `connectors` › `POST /connectors/slack/interactivity/`). Model `SlackSuggestion` (`services/work/models.py`, migration `work 0007_slack_suggestion`): `organisation`, `owner` (CASCADE), `customer` and `account` (SET_NULL, optional), `summary`, `text` (the one message, at most 3,000 characters), `sender_name`, `sender_slack_id`, `team_id`, `channel`, `message_ts`, `permalink`, `suggested_kind` (an `AgentAction.Kind` value or `""`), `created_at`; unique `(owner, channel, message_ts)`.

**Its owner's alone.** It appears only in the owner's `GET /work/feed/`: never in `GET /work/feed/team/` (any scope), `GET /work/recommendations/`, the badge, a manager's or an admin's view, Copilot or the agents' evidence. Deleted when dismissed and 30 days after it arrived (`slack_views.purge`, run by `sync_tickets` after the unmatched purge; `slack.messages_purged`, counts only).

**Feed item** (kind `slack_message`, in the `suggested` group with Revenact's recommendations, newest first; `?kind=slack_message` filters to them, and `?kind=` now accepts `slack_message`: the refusal reads "Choose bundle, rule_review, question, draft, task, todo, suggestion or slack_message."):

```json
{
  "key": "slack_message:12",
  "kind": "slack_message",
  "id": 12,
  "title": "Ann reports SSO is down since 9am.",
  "record": {"type": "customer", "id": 3, "name": "Pizza Hut"},
  "from": {"type": "slack", "label": "Slack"},
  "at": "2026-10-16T09:20:00Z",
  "due_date": null,
  "priority": null,
  "private": true,
  "actions": ["open", "dismiss"],
  "detail": {
    "summary": "Ann reports SSO is down since 9am.",
    "text": "Carl, our SSO has been down since 9am.",
    "excerpt": "Carl, our SSO has been down since 9am.",
    "sender": "Ann Lee",
    "permalink": "https://slack.com/archives/D0DM/p1760400000000100",
    "suggested_step": {"kind": "jira.create", "label": "Create a Jira issue"}
  }
}
```

`record` is `null` when no contact matched, or when the owner can no longer open that record (checked at read). `suggested_step` is `null` when the model suggested none. `open` is the permalink. The group's `count` adds these rows. `FEED_CEILING` is 59 (+5: the savepoint pair, the count, the page, the records it names read once).

### `DELETE /work/slack-messages/<id>/`

Auth: `IsAuthenticated`. Dismisses (deletes) one of the caller's own Slack messages: `204`, audited `slack.message_dismissed`. Anyone else's, admins and the owner's manager included, or a missing id: `404`.

### `POST /work/slack-messages/<id>/jira/` and `POST /work/slack-messages/<id>/reply/` (2026-10-16)

The item's two one-click actions (owner: one item, two buttons; the reply editable first; issues in KAN). Auth: `IsAuthenticated`; the owner's alone, anyone else (admins and the owner's manager included) or a missing id: `404`. Both reuse the agents' outside tools, so a refusal reads as it does in a bundle.

- **`jira/`** `{summary?, description?}` (the drafts when blank): the Jira issue, as the person (their Jira link, else the connection), in `SLACK_JIRA_PROJECT` (prod: `KAN`) or the connection's project, type Bug, else Task, else the project's first; labelled `revenact-slack-<id>`. Made **once**: a second call answers the same `{key, url}`; a create whose answer was lost is looked up by its label before another is made. `200 {key, url}`; `400 {detail}` (no Jira connection, no project, Jira's refusal). Audited `slack.jira_created` (`issue`).
- **`reply/`** `{text}` (1 to 3,000 characters): posted as the person (their Slack link, else the bot where it may post), in the message's thread, or in a direct message the conversation itself. `{issue}` in the text is replaced with `<key> (<url>)`; before the issue exists that is a `400`. Posted **once**: again is `409`. `200 {url}`; `400 {detail}`. Audited `slack.reply_sent` (no metadata; never the text).

The feed item's `actions` are `["open", "dismiss", "jira", "reply"]`; its `detail` adds `context` (the record's health, ARR, renewal and owner, null when the reader may not open it), `open_tickets` (the record's newest 3 open tickets the reader may read: `{number, title, url, days_open}`), `jira` `{available, project, summary, description, key, url}` and `reply` `{to, draft, with_issue, sent_at, url}` (`with_issue` carries `{issue}`). The model drafts these when the message arrives: only that one message goes to it, with the sender's, the person's and the record's names.

### Slack handover in the feed (2026-10-18)

Migration `work 0010_slack_handover`: `SlackSuggestion.handed_from` (FK user, SET_NULL, nullable), `task` (FK `customers.Task`, SET_NULL, nullable), `handed_to` (JSON list of `{id, name}`, default `[]`).

- The clicker's `slack_message` item: `detail.handed_to` is `[{"id": 7, "name": "Tushar Aggarwal"}]` for the colleagues it was handed to (`[]` otherwise; always present).
- A copy handed to the reader (`handed_from` set) is never a `slack_message` item, and never counted in the group's `count`; its bundle shows as any Slack bundle (the reader's alone).
- The task handed to the reader is an ordinary `task` (on a record) or `todo` item, with `from: {"type": "slack", "label": "From Slack by <clicker>"}` and `detail.from_slack: {"by": "<clicker>", "permalink": "https://slack.com/archives/…" | null}`, read from the reader's own copy (gone once that copy is purged after 30 days; the description keeps the link).

### Slack bundles: Send to Revenact becomes an agent bundle (2026-10-17)

Owner-approved 2026-10-17. After the card is made, the agent proposes an agent bundle (the `agents` bundle machinery: steps, Run, Retry, Undo, History) on the **one** record the message is about. `AgentBundle.source` `slack_message`, `routed_to` `person`, `routed_user` the person who sent the message, `slack_suggestion` the card's row.

**Its sender's alone (privacy).** Only the person who sent the message reads, runs, edits, rejects or undoes a Slack bundle, and only while they may open its record (`services/agents/deciding.py:decided_as` answers the new role `sender`; nobody else has any role on it, not the record's owner, their chain, view-all or Leadership). For anyone else it does not exist: `GET /agents/bundles/<id>/`, its steps under `/agents/actions/` and every bundle route answer `404`, and it is never counted in any `hidden` (`/agents/actions/`, `/agents/bundles/history/`, Work's `GET /work/feed/` and the Team queue): `services/agents/bundles.py:others_slack_bundle_ids` leaves it out before anything is counted, and `brain/desk.agent_actions` takes it off every desk but the sender's own Me desk. The nightly pass never expires, replaces or re-proposes its steps (`models.MESSAGE_SOURCES`); the feedback log and a record's rejected lines name it only as "A suggestion from a message" (no title, rationale or note).

**How it is made.** `POST /connectors/slack/interactivity/` is unchanged and still answers inside Slack's 3 seconds: the card is made with its fast drafts and `SlackSuggestion.bundle_state` `pending` (`""` for a row from before). The per-minute `deliver` tick (`deliver_pending`, `services/agents/slack_bundles.py:propose_pending`) then takes waiting messages under an hour old, oldest first, at most 10 a tick; an older one becomes `none`. Each is claimed by one conditional UPDATE and ends `made`, `none` (no record, a record the sender can't open, AI or the agent off, no valid step) or `failed` (the model failed, no credits, or an error): the card then stays as it is. One message failing never stops the others or the sends of that tick. The agent is `sales` when the sender's function is Sales, else `cs`. One model call per message (purpose `slack_bundle`, tier lite, a response schema of only the allowed kinds), given only that message and that one record's line, open plans, the members who may open it, the templates every member may start, the sender's own segments of its kind and the workspace's Organisations scenarios. Each item is checked by its kind (`validate`, the placeholder check, the outside-text guards) and dropped alone; a step like one already waiting on the record is dropped too. The reply's `{issue}` becomes `{{step N.ticket_key}} ({{step N.ticket_url}})` only when a `jira.create` step was placed (else the plain reply); a placeholder the model wrote itself is never kept (the card's draft is used). A task for nobody in particular is the sender's. No step left: no bundle. Audited `agent_bundle.made` (counts and kinds only).

**Its steps** (fixed order, at most one of each, all on the bundle's record; levels as the Actions & approvals grid says, a kind on `never` is never proposed): `jira.create`, `slack.reply`, `task.create`, `plan.start`, `segment.pin`, `scenario.run`, `survey.record`. The three new kinds (agents `cs` and `sales`, always `ask`) are offered only for a Slack message, never on the nightly pass or a thread's read.

- **`jira.create`** carries `slack_suggestion_id`; its project is `SLACK_JIRA_PROJECT` (else the connection's), as the card's. One issue per message (`target` `jira:create:slack:<id>`): if the card made the issue first the step answers that key without calling Jira, and the issue it makes is written on the card (`jira_key`, `jira_url`), so the card's Create in Jira answers it too.
- **`slack.reply`** answers the message itself: payload `{slack_message_id, connector_id, channel, thread_ts, direct, text, ...}` (`thread_ts` is `""` in a direct message: the conversation itself; else the message's own thread). Posted as the person (their Slack link, else the bot), whatever the connection's department; only `text` is editable (`editable: ["text"]`). Its text may carry `{{step N.ticket_key}} ({{step N.ticket_url}})` of the bundle's `jira.create`; Run first asks Slack whether the conversation is shared outside the company and fails closed: "This conversation is shared outside your company, so the reply can't carry the Jira link. Take it out, then Retry." A reply already sent from the card skips the step ("You already replied to this message from Work."); a reply sent here is written on the card (`replied_at`, `reply_url`), so the card won't post twice. Preview: the `slack` shape with `channel` `"The message's thread"` or `"Direct message"`.
- **`segment.pin`** `{segment_id, segment, kind}`: pins the record into one of the sender's own segments of its kind (not paused, not already pinned), through `PATCH /segments/<id>/members/<record>/`'s own write (`segments.members.set_state`, its audit events). Run re-checks the owner ("This segment isn't yours any more.") and that the runner may open the record; the 500 limit fails the step with the page's sentence. Undo puts the record back where it was (pinned, kept out or neither) unless its place changed since. A record pinned by hand while it waited expires the step ("the record changed since"). Outputs `segment_id`, `segment_url`. Preview:

```json
{"segment_pin": {"segment": {"id": 4, "name": "At-risk renewals", "members": 12}, "record": "Pizza Hut", "from": "Not pinned", "to": "Pinned"}}
```

  `segment.id` is null for anyone but the segment's owner; `from` is `Pinned`, `Kept out` or `Not pinned`.
- **`scenario.run`** `{scenario_id, scenario}`: runs one of the workspace's Organisations scenarios on the organisation (organisations only), as Run Now does (`ScenarioRun.triggered_by` `agent`; the runner must be able to open it). A run the engine marks failed is kept as it went, never a failed step, so no Retry resends its emails; its `result` is `{scenario_run_id, status, note}`. Can't be undone ("This scenario has run."). Preview:

```json
{"scenario_run": {"scenario": {"id": 7, "name": "Escalation playbook"}, "record": "Pizza Hut", "run": {"id": 31, "status": "success", "note": "The scenario ran."}}}
```

  `run` is null until it ran; a failed run's note is "The scenario ran, but a step failed. Its run log says which."
- **`survey.record`** `{survey_type, subject, intro, roles, timing, record}` (`timing` `now` or `after_jira`; `after_jira` adds `issue` `{{step N.ticket_key}}` and `connector_id`; editable: `survey_type`, `subject`, `intro`, `roles`, `timing`; `subject` and `intro` are customer-facing). Run makes a private `SurveySend` owned by the runner on the record (`customer` or `account`, no segment). `now`: sent at once with Send now's rules (`sending.claim`: email set up, the daily limit, the audience the record's own people with the ticked roles as the runner sees them); then it can't be undone ("This survey has been sent."). `after_jira`: the draft waits for the issue (an `IssueWait`), the step's note reads "Sends when KAN-12 is resolved.", and it stays undoable while unsent (`irreversible: false` before it runs and in History); Undo cancels the wait and deletes the draft. Outputs `survey_id`, `survey_url`. Preview:

```json
{"record_survey": {"survey_type": "csat", "question": "How satisfied are you with Acme Inc?", "subject": "How did we do?", "intro": "One question.", "roles": ["Champion"], "record": "Pizza Hut", "timing": "after_jira", "issue": "KAN-12", "audience": null, "wait": {"status": "waiting", "label": "Waiting for KAN-12"}}}
```

  `issue` is null before the Jira step ran; `audience` (Audience counts as the reader) only while the step waits; `wait` null unless it ran with `after_jira`, else `{status, label}` with `status` `waiting`, `due`, `sent`, `refused`, `cancelled` or `expired` and `label` "Waiting for KAN-12", "Sent", "Not sent: <why>" or "Not sent: KAN-12 wasn't resolved within 90 days.". `POST /surveys/<id>/send/` on such a draft sends it the same way (only its owner).

**In Work.** While its bundle stands (waiting inside its 14 days, running, done, partly done or rejected) the card is left out of the sender's feed (and its `count`): the bundle item replaces it in the decide group. An expired or superseded bundle gives the card back. The card's own routes (`DELETE`, `jira/`, `reply/`) keep working on the row; a bundle whose card was dismissed keeps its steps.

The bundle item (`kind: "bundle"`, the sender's Mine only): `detail.source` is `{"kind": "slack_message", "label": "Slack message", "channel": null}`, `detail.routed_to` is `"person"`, `detail.department` null. The Bundle (`GET /agents/bundles/<id>/` and every bundle answer) has `routed_to: "person"`, `for` the sender (also outside History), `can_refresh: false`, and this source block:

```json
{
  "kind": "slack_message",
  "label": "Slack message",
  "sender": "Faiz Jamal",
  "excerpt": "Pizza Hut says SSO is failing again since this morning.",
  "text": "Pizza Hut says SSO is failing again since this morning.",
  "link": "https://slack.com/archives/C0SUPPORT/p1760400000000100",
  "at": "2026-10-17T09:20:00Z",
  "private": true
}
```

`excerpt` is the first 280 characters, `at` when it was sent to Work. Once the card is dismissed (or purged after 30 days) the block keeps its keys with `sender`, `excerpt` and `text` `""`, and `link` and `at` null.

**After Jira** (`services/agents/issue_waits.py`). A wait becomes `due` when its issue is resolved: the ticket sync marks it first thing as it files the issue from that Jira connection (`issue_waits.seen`, one indexed UPDATE, matched to a customer or not), and the `deliver` tick asks Jira for the rest (`GET /issue/<key>?fields=status`, each wait at most every 15 minutes; a 404 cancels it and tells its owner). The same tick, before it delivers surveys, sends what is due as its owner with Send now's rules (`sending.claim`, under the wait's row lock, skip locked): the step must still be applied (an Undo first wins), the draft still a draft (one its owner sent from Surveys counts as sent), the owner still an active member. Sent: the owner is told "Your survey to Pizza Hut was sent: KAN-12 is resolved." A daily-limit refusal (429) stays `due` until the next day; any other refusal ends it as `refused` with Send now's sentence, and the owner is told "Your survey to Pizza Hut wasn't sent: <why>". A wait not resolved within 90 days expires, and the owner is told. Notifications are kind `agent_survey_wait`, linked to `/work?queue=history&bundle=<id>`; the record is named only to an owner who may still open it ("Your survey ..." otherwise). Audited `issue_wait.sent`, `issue_wait.refused`, `issue_wait.cancelled`, `issue_wait.expired` (the issue key, the step id and a short reason code only).



### Guided agent: diagnose, write, send (2026-10-18)

Spec: `docs/superpowers/specs/2026-10-18-guided-agent-design.md`. A message bundle (a thread's or a Slack message's) may hold `record.diagnose -> mail.compose -> mail.send_draft`, which the reader answers one question at a time ("Should I diagnose?", "Should I write an email to save Twilio?", "Should I send it to Dana Smith?"). Such a bundle is **guided**: it is any bundle with a `record.diagnose` step.

**Proposing it.** The three kinds (agents `cs` and `sales`, always `ask`) are offered only by the message proposers, never the nightly pass (`message_only`, plus `on_threads` so a thread's read offers them too). The thread prompt lists them with empty payloads (`{}`) and the rule "propose exactly record.diagnose, then mail.compose, then mail.send_draft, in that order and first ... all three or none"; the Slack message proposer has one answer key `"rescue": {"use": true}` that places all three first. Server-side the trio is checked whole: exactly one of each, in order, on the thread's record, or all three are dropped (the other items stand); a compose or send with no evidence of its own cites the diagnosis's; if one of the three is dropped while placing, the others are deleted with it (`guided.drop_partial`). Each step's payload is the server's own `{"key": <random>}` (one per message: never a twin of another bundle's step). The model never writes a payload, an address or a placeholder for them.

**Priority.** `AgentBundle.priority` is `high` when the message asks urgently (the thread answer's new optional `"priority": "high"`, a fast-lane `urgent_rule`, or the Slack answer's new optional `"urgent": true`) for any message bundle, or, for a guided bundle, when its record's health is poor (category `poor`, or a fall of at least 1.0 over the last 30 days: the oldest HealthSnapshot in the window against today's score). Else `normal`; nightly bundles are always `normal`. A newly made high bundle is told at once (not only in the daily "Bundles waiting"): Notification kind **`agent_bundle_priority`**, message `"Priority: <bundle title>"`, link `/work?queue=mine&kind=bundle&bundle=<id>` (a department or Unassigned bundle: `/work?queue=<key>&kind=bundle&bundle=<id>`), to each active member it is routed to (the routed person, or the queue's people) who may read it and decide one of its steps.

**Feed item** (`GET /work/feed/`, `kind: "bundle"`): `detail` gains `priority` (`"high"` | `"normal"`) and `guided` (bool).

**Bundle** (every bundle answer) gains:

```json
{
  "guided": true,
  "priority": "high",
  "next_step": 812,
  "can_stop": true,
  "steps": [{"id": 812, "kind": "record.diagnose", "question": "Twilio's health dropped from 7.8 to 6.1. Should I diagnose?", "...": "..."}]
}
```

`next_step` is the id of the step asked now (the first waiting step whose earlier steps are all applied or skipped), else null (also null for a bundle that isn't guided or isn't waiting). `can_stop` is true for a waiting guided bundle whose every waiting step the reader may decide. Every step has `question` (a string the server writes, names from the record, never model text; null when the bundle isn't guided). The diagnose question is "<Record>'s health dropped from A to B. Should I diagnose?" after a fall, "<Record>'s health is X, which is poor. Should I diagnose?" when poor, else "Should I diagnose what is going on with <Record>?"; any other kind in a guided bundle asks "Next: <step title>. Should I go ahead?". `can_refresh` is false for a guided bundle once a step has run, and a newer message on its thread flags it (`has_newer_message`) instead of replacing its steps.

#### `record.diagnose` ("Diagnose")

Never irreversible. It changes nothing in the book but one note (2026-10-18 follow-up): on success it files a `Note` on the record authored by the runner (`author` = the runner, so readable by them and their management chain only, like any note, and shown on the record's Story and Notes tab), titled "Diagnosis: <Record>", body the summary, a blank line, then "Findings:" and one "- <finding text> (<source label>)" line per finding (labels only, never a link). When the prompt held mail only the runner may read (or a Slack message sent to them alone) the note leaves out the summary and keeps only findings citing a ticket, call, health, a shared or logged email, or a Slack thread (never a contact, never a private source); with none left no note is filed. Undo deletes the note while its title and body are as filed (else 409 "This note has been edited since.", with `undo.reason` `changed_since` in the meantime); a run that filed no note has `undo: null` (the undo route answers 409 "This diagnosis filed no note, so there is nothing to undo."). Run reads, as the runner and only on a record they may open: health with its components and 30-day change, open tickets they may read (newest 10), calls of the last 90 days (newest 5, the CallSense summary or transcript excerpt), emails of the last 30 days they may read (`visible_emails_q`: their own, shared or logged; never someone else's private mail; newest 10), the bundle's Slack thread (or the Slack message), and the record's contacts with sentiment and last reply. One model call (purpose `agent_diagnose`, Gemini Flash, response schema `{summary, findings: [{text, source: {kind, ref}}]}`); the summary is cut to 400 characters, each finding to 200, at most 5; a finding whose `(kind, ref)` is not one of the sources read is dropped; none left fails the step ("Couldn't diagnose this just now. Retry it."); no credits: "The workspace has no AI credits left.". Bills one AI credit like every model call. Preview before it runs:

```json
{"diagnose": {"record": "Twilio", "reads": ["health", "tickets", "calls", "emails", "slack", "contacts"], "counts": {"tickets": 3, "calls": 1, "emails": 4}, "summary": null, "summary_hidden": false, "findings": [], "note": null}}
```

After it ran (`counts` as read, plus `slack` when a thread was read):

```json
{"diagnose": {"record": "Twilio", "reads": ["..."], "counts": {"tickets": 3, "calls": 1, "emails": 4, "slack": 1}, "summary": "Twilio's EU latency ...", "summary_hidden": false, "findings": [{"text": "Three latency tickets are open, the oldest 9 days.", "source": {"kind": "ticket", "label": "TW-4088: API latency regression", "url": "https://acme.zendesk.com/..."}}], "note": {"id": 4410, "title": "Diagnosis: Twilio"}}}
```

`source.kind` is `ticket`, `call`, `email`, `slack`, `health` or `contact`; `url` is the ticket's or Slack's own https link when it has one, else the record's app path (`/organizations/<id>` or `/accounts/<id>`), or null. The runner sees every finding; anyone else reading the bundle sees only the findings whose source they may open themselves (checked again per reader), and when the prompt held mail only the runner may read (or a Slack message sent to them alone) the summary is `""` with `summary_hidden: true`. `note` is the filed note's `{id, title}` while the step is applied and the reader may read that note (its author and their chain), else null. `outputs` is `{}`.

#### `mail.compose` ("Write an email")

Run needs the diagnosis before it applied, run by the same person ("Only <name> can write this email: they ran the diagnosis."), and the runner's own connected, unpaused two-way Gmail (else the step is disabled with the mail gate's sentence, e.g. "Connect your mailbox to send this.", `disabled_link` `/settings/connections`; Outlook: "Writing an email needs a connected Gmail mailbox."). The server picks who it goes to: the record's main contact the runner may see (champion, then executive sponsor, decision maker, economic buyer, technical lead, then the most recently contacted); none: "Add a contact with an email address to <Record> first.". One model call (purpose `agent_compose`, Gemini Flash, schema `{subject, body}`, the workspace's `ai_agent_tone`), from the diagnosis and the same reads. The text is saved as a new Gmail draft (`MailDraft`, kind `new`, filed on the record) in the runner's mailbox, so it shows in Communications and Gmail's Drafts, and is handed to the bundle's waiting `mail.send_draft` step. `outputs` `{"draft_id": n}`. Undo (the draft's owner only, while it is still a draft) discards the draft and empties the send step. Preview after it ran, for the draft's owner:

```json
{"compose": {"record": "Twilio", "to": {"name": "Dana Smith", "address": "dana.smith@twilio.example"}, "from": "tushar@tryalfred.onworkspace.com", "subject": "Our plan for your latency issues", "body": "Hi Dana, ...", "draft_id": 41, "private": false, "owner": "Tushar"}}
```

For anyone else `to.address`, `from`, `subject`, `body` and `draft_id` are null and `private` is true (the draft is its owner's mail). Before it runs: `to` is the contact it would write to (or null), `from` the reader's usable Gmail address (or null), the rest null.

#### `mail.send_draft` ("Send it")

Outside and irreversible ("This email has been sent."): the mailbox has no delayed send, so there is no Undo. Editable once the draft is written: `to` (an address of one of the record's contacts the runner may see; else "Choose one of <Record>'s contacts."), `subject` (≤ 150), `body` (≤ 4000); both customer-facing (no `{{step N.key}}`). `fields` and `editable` are filled only for the draft's owner (`{}` and `[]` for anyone else). An edit rewrites the draft first, then it is sent through the draft send path (the claim, the sent copy, filing on the record, `mailbox.sent`); only the draft's owner sends it ("Only <name> can send this email: it is in their mailbox."). On success the filed email is added to Revenact (`sharing.set_shared`, `email.shared`), so it is on the record's timeline, and `mail.agent_sent` is audited. A send Gmail didn't confirm leaves the draft `sending` and the step failed; a Retry never sends it again ("We couldn't confirm the email went out. Check your Sent mail before you retry."); a draft already sent (a Retry, or sent from Communications) applies without sending. `outputs` `{"email_id": n}`; `links` "Open the sent email" for its sender. Preview:

```json
{"send": {"to": {"name": "Dana Smith", "address": "dana.smith@twilio.example"}, "from": "tushar@tryalfred.onworkspace.com", "subject": "Our plan for your latency issues", "excerpt": "Hi Dana, ...", "draft_id": 41, "sent": false, "shared": false, "private": false}}
```

`to` is null until the draft is written; for anyone but the draft's owner `to.address`, `from`, `subject`, `excerpt` and `draft_id` are null and `private` is true. After it ran, `sent: true` and `shared` says whether it was added to Revenact.

#### `POST /api/v1/agents/bundles/<id>/steps/<step_id>/run/`

Runs that one step of a guided bundle. Body `{}` or `{"fields": {...}}` (the step's editable keys, checked as Run's). 200 `{"bundle": Bundle}`: the bundle is `waiting` again while steps are still waiting (`next_step` is the next one), `done` / `partly_done` after the last. The step itself may end `failed` (its `error`), as in a whole run. Refusals, in order: 404 `NO_SUCH_BUNDLE` (a bundle or step the reader may not read), 403 `CANT_RUN_STEP`, the 409s of a run (`BUNDLE_RUNNING`, `BUNDLE_RAN`, `BUNDLE_REJECTED`, `BUNDLE_EXPIRED`, `BUNDLE_SUPERSEDED`, each with `bundle`), 409 `NOT_GUIDED` ("Only a guided bundle is run one step at a time."), 409 `STEP_NOT_WAITING`, 409 `NOT_NEXT` (`{"code", "detail": "Answer step 1 first." | "Step 1 didn't run. Retry it first.", "step": <the blocking step's id>, "bundle"}`), 400 `{"steps": {"<id>": {field: [sentence]}}}`. Same rights as Run (`may_decide`, re-checked under the bundle's lock), audited `agent_bundle.run_started` (`guided: true`) and `agent_bundle.run_finished`. A failed step is retried with the existing `.../retry/`; the bundle stays open after it. The whole-bundle `POST .../run/` still works on a guided bundle (desktop checklist); a compose whose diagnosis didn't apply fails "Needs step 1, which didn't run.".

#### `POST /api/v1/agents/bundles/<id>/stop/`

"Not now". Body `{}`. Every waiting step is skipped with the note "Stopped by <name>." and the bundle finishes (`done` when nothing failed, else `partly_done`). 200 `{"bundle": Bundle}`. Refusals: 404 `NO_SUCH_BUNDLE`, 403 `CANT_STOP` ("You can't stop this bundle.": the reader must be able to decide every waiting step, as Reject), the run's 409s, 409 `NOT_GUIDED`. Audited `agent_bundle.stopped` and `agent_action.skipped` per step.

**Implementer's choices.** A separate step route (not `guided: true` on the run body). The trio is linked by bundle order, not placeholders: compose reads the nearest earlier applied `record.diagnose` step's result, and writes the draft into the following waiting `mail.send_draft` step's payload (`draft_id`, `owner_id`, `to`, `to_name`, `contact_id`, `subject`, `body`). Only the diagnoser writes the email and only the draft's owner sends it (the diagnosis may rest on their own mail). Priority's "poor health" includes a 1.0 fall in 30 days (the demo's 6.1 is "average"). Stop is offered only for guided bundles. Fields for anyone but the draft's owner are hidden (a new Kind hook `fields_for`).

**Demo data.** `python manage.py seed_demo_twilio [--apply]` (`services/accounts/management/commands/seed_demo_twilio.py`): anchored on the owner: the workspace is the one the active user `tushar@tryalfred.onworkspace.com` belongs to, refused unless it is named Alfred (any other `--org` is refused too), and Twilio is the one Customer of that name there (two or more: refused, naming the count); a dry run printing counts unless `--apply`; idempotent; a one-line summary on stdout and stderr; after `--apply` it fails (non-zero) unless Twilio has its three open TW tickets and Tushar as owner. Twilio gets three open latency tickets (2, 5 and 9 days old), a call six days ago whose summary flags renewal concerns, HealthSnapshots falling 7.8 -> 6.1 over 14 days (and `health_score` 6.1), a champion (an existing Twilio contact, its address unchanged, else the fictional Dana Smith at `twilio.example`) whose last reply (a logged email) is 14 days old, and Tushar as owner (always, replacing any other owner).


### Sales review report: a meeting-triggered guided bundle (2026-10-18)

Spec: `docs/superpowers/specs/2026-10-18-sales-review-report-design.md`. The day before a meeting whose title contains "sales review" (case-insensitive), its organiser gets a guided, high-priority bundle with one step, `report.sales` ("Prepare the sales report"). They answer "You have Sales review tomorrow at 10:00. Should I prepare the sales report?" with the guided step run (Yes) or stop (Not now), then download a one-page printable report.

**The daily check.** `services/agents/sales_review.check_meetings`, run by the per-minute `deliver_pending` tick (Cloud Scheduler `deliver`). Idempotent, so every minute is the same as once a day: synced `calendar.Meeting` rows (not all-day) starting tomorrow in the workspace's timezone (`work.clock.zone_for`) get one bundle per event and start (`sha1(ical_uid or google_event_id | starts_at)`; the same event on several calendars is one bundle; a step with that `target`, in any status, means it was done). The organiser is the active-for-work member whose email is the meeting's `organizer_email` (else the calendar owner's). Skipped: no such member, workspace AI agents off, the Sales agent off, or `report.sales` on Never. Told at once: Notification `agent_bundle_priority`, `"Priority: Prepare the sales report for <title>"`, link `/work?queue=mine&kind=bundle&bundle=<id>` (in-app and the live socket; no web push). Audited `agent_bundle.made` (`source: "meeting"`, `meeting`: its id).

**Bundle.** `source: "meeting"`, `routed_to: "person"`, `agent: "sales"`, `priority: "high"`, `guided: true`, `record: null`, `for`: the organiser. The source block:

```json
{"kind": "meeting", "label": "Meeting", "title": "Sales review", "starts_at": "2026-10-19T04:30:00+00:00", "ends_at": "2026-10-19T05:00:00+00:00", "meeting_id": 77, "private": true}
```

Feed item (`GET /work/feed/`, decide group): `record: null`, `detail.source.kind: "meeting"`, `detail.priority: "high"`, `detail.guided: true`. **Read rule**: the organiser (`routed_user`) alone reads, runs, stops and undoes it; anyone else, view-all and admins included, gets 404 and it is never counted in `hidden` (a personal bundle, as a Slack message's). Decided as `organiser`.

#### `report.sales` ("Prepare the sales report")

Workspace-level, Sales agent, `ask` at most; made only by the daily check (never by the nightly pass or a message's read). Not irreversible; Undo (7 days, the organiser) discards the stored report. Payload: `{"meeting_key", "meeting_id", "title", "starts_at", "ends_at", "days": 30}`. Question: "You have <title> tomorrow at HH:MM. Should I prepare the sales report?" ("today" on the day; `on Mon 20 Oct` otherwise; 24-hour, workspace timezone).

Preview before it runs (counts the reader may see now):

```json
{"sales_report": {"meeting": {"title": "Sales review", "starts_at": "2026-10-19T04:30:00+00:00"}, "period": {"from": "2026-09-18", "to": "2026-10-18"}, "counts": {"won": 4, "lost": 2, "closing": 4, "open": 6}, "report": null, "download_url": null}}
```

After it ran, `counts` are the report's and, for the person who ran it, `report` is the stored snapshot and `download_url` is `/api/v1/agents/bundles/<id>/steps/<step_id>/report/`:

```json
{
  "period": {"from": "2026-09-18", "to": "2026-10-18"},
  "currency": "USD",
  "generated_at": "2026-10-18T14:31:02+00:00",
  "won": [{"id": 9, "name": "Platform renewal, two years", "record": {"type": "customer", "id": 4, "name": "Twilio"}, "amount": "4200.00", "closed_on": "2026-10-15"}],
  "lost": [{"id": 13, "name": "Pilot to production", "record": {"type": "customer", "id": 6, "name": "Notion"}, "amount": "3100.00", "closed_on": "2026-09-29"}],
  "closing": [{"id": 15, "name": "Enterprise upgrade", "record": {"type": "account", "id": 2, "name": "Stripe EMEA"}, "amount": "5200.00", "stage": "negotiation", "stage_label": "Negotiation", "closes_on": "2026-10-23"}],
  "stages": [{"stage": "negotiation", "label": "Negotiation", "count": 1, "amount": "5200.00", "moved_in": 1, "moved_out": null}],
  "totals": {"won_count": 4, "won_amount": "9550.00", "lost_count": 2, "lost_amount": "4600.00", "closing_count": 4, "closing_amount": "12600.00", "open_count": 6, "open_amount": "20500.00", "win_rate": 67},
  "stage_history": false,
  "summary": "Four deals were won ..."
}
```

Read as the runner from the Pipelines book (`pipelines_portfolio.book.scope`: records they may open, departments they may read), opportunities only. Period: the last 30 days to today (workspace timezone). Won/lost: Closed Won/Lost whose stage changed in the period (`closed_on` = `stage_changed_at`'s date; there is no stage history). Closing: open stages with `expected_close` in [today, today + 30]. `stages` lists all seven stages: current count and amount; `moved_in` counts deals whose stage changed into it in the period; `moved_out` is always null and `stage_history: false` (moves out aren't recorded). Lists are cut to 20 rows (largest first; closing by date), totals count everything. Amounts are `mrr` strings in the workspace currency. `win_rate` is a whole percent, or null with no closed deals. `summary`: one model call (purpose `sales_report`, Gemini Flash, schema `{summary}`), at most 120 words; `""` when the model fails or there are no credits (the figures still stand). Audited `sales_report.prepared` (counts only). `outputs` is `{}`.

#### `GET /api/v1/agents/bundles/<id>/steps/<step_id>/report/`

The stored report as one printable HTML page (light theme, inline CSS, no script): workspace name, meeting, period, totals, summary, won, lost, closing, stages, generated-at. 200 `text/html; charset=utf-8`, `Content-Disposition: inline; filename="sales-report-<period to, YYYY-MM-DD>.html"`, `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`. Every value is escaped. 404 `NO_SUCH_BUNDLE` for anyone but the bundle's person, a step that isn't its `report.sales`, a step that hasn't run, or a report discarded by Undo. Audited `report.downloaded` (`bundle`, `agent_step`). The frontend fetches it with the session's auth and opens it (Download / Print / Save as PDF).

**Demo data.** `python manage.py seed_demo_sales_review [--apply]` (`services/accounts/management/commands/seed_demo_sales_review.py`): anchored on `tushar@tryalfred.onworkspace.com`, refused unless that workspace is Alfred; a dry run unless `--apply`; idempotent (deals by title, the meeting by its demo id). Writes 12 fictional opportunities on existing Alfred customers (4 won and 2 lost in the last 30 days, 6 open across stages, 4 closing in the next 30 days), and a "Sales review" meeting tomorrow 10:00–10:30 workspace time on Tushar's connected calendar (`google_event_id` `revenact-demo-sales-review-<date>`; left out, and said so, without a mailbox connection); with `--apply` it then runs the check for Alfred. Prints a summary to stdout and stderr.


## `agents` — Agents (CS, Sales and Ops): settings, Run now, Activity, decisions

Three agents per workspace: `cs` (organisations and accounts whose owner's function is CS), `sales` (the same for Sales) and `ops` (the whole workspace; the agent Brain used to call the Ops agent). An agent is not a person: an action it took shows `agent` and has no actor. The shapes below are folded in from the delivery's contract (`docs/superpowers/plans/2026-10-08-agents-actions-api.md`). Every route is `IsAuthenticated` under `/api/v1/agents/`, JSON only; "this month" is the calendar month in the workspace timezone (`WorkSettings.timezone`).

**AgentCard** (`agents[]` of the settings): `{kind, label, enabled, monthly_credits, spent_this_month, resets_on, last_run}`. `last_run` is `null` or `{at, proposed, applied, dropped, skipped_reason}`; `skipped_reason` is `null`, `ai_off`, `disabled`, `no_actions`, `budget`, `credits` or `failed`.

**ActionKind** (`kinds[]`, in this order; sent as `{kind, label, example, max_level, agents}`): `record.lifecycle` (auto; cs, sales), `record.owner` (ask; cs, sales), `record.attribute` (auto; cs, sales), `task.create`, `task.reassign`, `task.redate`, `task.snooze` (auto; cs, sales, ops), `task.complete` (ask; cs, sales, ops), `note.create` (auto; cs, sales, ops), `draft.reply` (auto; cs, sales), `plan.start` (ask; cs, sales), `segment.create`, `scenario.create`, `campaign.create` (ask; ops), `canvas.create` (ask; cs, sales, ops), `plan.template` (ask; ops), `initiative.create` (ask; ops). `levels` has every agent and every kind it can use, valued `auto`, `ask` or `never`; a fresh workspace is all `ask`.

**AgentAction** (Activity rows, and `detail` of a feed approval): `{id, agent, kind, title, status, record, preview, rationale, evidence, decided_by, decided_at, auto, applied_at, undo, undone_by, undone_at, result, created_at}`.

- `status`: `proposed`, `applied`, `rejected`, `expired` or `undone`.
- `record`: `null` for a workspace-level kind (`initiative.create`, `segment.create`, `scenario.create`, `campaign.create`, `plan.template`), else `{kind: "customer" | "account", id, name}`.
- `preview` is always present: `{field, from, to}` for `record.*`; `{task: {title, assignee, due_date, priority}}` for `task.create`; `{task: {id, title}, field, from, to}` for the other task kinds (a snooze's `to` is the new date plus " (snoozed: <reason>)"); `{note: {title}}`; `{draft: {channel: "email", to, subject, excerpt}}` or `{draft: {channel: "ticket", ticket, subject, excerpt}}` for `draft.reply`; `{plan: {template, milestones, tasks}}` for `plan.start`; `{segment: {kind, name, conditions, members}}` for `segment.create` (`members` counted as the reader, `conditions` every leaf); `{scenario: {name, segment, trigger, steps}}` (display sentences); `{campaign: {name, segment, roles, subject, excerpt}}` (role labels; the body's first 280 characters); `{canvas: {name, people}}` (the record's people the reader may open); `{template: {kind, name, milestones, tasks}}` (counts); `{initiative: {metric, target}}`. An existing task's `title` and `id` are shown only to a reader who may read that task; anyone else gets `{"id": null, "title": "A task you can't see"}`, and a removed task is `{"id": null, "title": "A removed task"}`. The UI links a task only when its id is a number.
- `evidence`: `[{label, link}]` (`label` is the action's own line the model cited, matched whole or as a fragment, shown as people name it: a ticket line by its number, else its title, and an email or message line without our id, e.g. `ticket ZD-1042: "Login loop", ...`; the stored line keeps the ids the model quotes back), and `[]` unless the reader has `view_all_accounts` (model-written from the whole book, so it cannot be filtered line by line; the same rule as Brain's proposals). `rationale` goes to anyone who may read the action.
- `auto` is true when applied without a person (`decided_by` is then `null`).
- `undo` is `null` unless applied, else `{allowed, until, reason}` with `reason` `null`, `expired` (over 7 days), `cant_decide` (also for `record.owner` without the owner-change right) or `changed_since` (best effort; the POST is the judge).
- `result`: `{task_id, note_id, initiative_id, draft_id, plan_id, segment_id, rule_id, campaign_id, canvas_id, template_id}`. Each key is null unless that kind made it; `scenario.create` sets `rule_id` and `segment_id`, `campaign.create` `campaign_id` and `segment_id`.

| Route | Who | Answers |
|---|---|---|
| `GET /agents/settings/` | any member | `{ai_enabled, tone, agents[cs, sales, ops], kinds, levels, plan_monthly_credits, can_edit, can_run}`; `can_run` is `manage_org_settings` or `view_all_accounts` |
| `PATCH /agents/settings/` | `manage_org_settings` (403 otherwise) | the GET shape. A value equal to the stored one is not a change. Every problem comes back at once as a 400, in two shapes: a list at the key for a problem with an agent or level key (`{"agents": {"xx": ["Unknown agent."]}}`), a list at the field for a bad value. Setting a kind to `never` expires that agent's pending actions of that kind (`expired_reason: "never"`). Audited as `agents.settings_update`. |
| `POST /agents/<kind>/run/` | `manage_org_settings` or `view_all_accounts` | `200` the AgentCard; `404` unknown kind; `403`; `409` `AI_OFF`, `AGENT_OFF`, `NO_ACTIONS`, `BUDGET_USED` (with `resets_on`); `429` when the workspace has no credits. Audited as `agents.run`. |
| `GET /agents/actions/` | any member | `{count, next, previous, results[AgentAction], hidden}`, 50 per page, newest first. Filters `agent`, `kind`, `status`, `customer`, `account`; a bad value is a 400 such as `{"agent": ["Choose cs, sales or ops."]}` or `{"status": ["Choose proposed, applied, rejected, expired, undone, failed or skipped."]}`. Previews are read once for the page, so the query count does not grow with the rows. |
| `GET /agents/actions/<id>/` | any member | one AgentAction for the reader |
| `POST /agents/actions/<id>/approve/` | a decider | `200 {"action"}`; `task.create` may carry `assignee_id`, `title`, `due_date`, `priority` |
| `POST /agents/actions/<id>/reject/` | a decider | `200 {"action"}`; optional `note` up to 255 characters |

**Since Agent bundles delivery 1** `POST /agents/actions/<id>/approve/` and `/reject/` answer `409 USE_BUNDLE` (`{"code": "USE_BUNDLE", "detail": "Open the bundle to decide this.", "bundle": <id>}`) after the 404/403 checks; a step is decided by running or rejecting its bundle (`POST /agents/bundles/<id>/run/`, `/reject/`). `GET /agents/actions/`, the detail and the undo answer gain `bundle` (the step's bundle id). `GET /agents/settings/` `kinds[]` rows gain `irreversible`, `outside` and `locked` (true for an outside kind: always Ask); `PATCH` setting an outside kind to `auto` or `never` answers `400 {"levels": {"<agent>": {"<kind>": ["This action always asks."]}}}`. The decision rules below (who decides, a task's overrides and their checks) now apply per step inside a bundle run, where a refusal fails or expires the step instead of answering an error.
| `POST /agents/actions/<id>/undo/` | anyone who could have approved it | `200 {"action"}` with status `undone` |

**Every action route answers 404 first**, with code `NO_SUCH_ACTION` (`{"code": "NO_SUCH_ACTION", "detail": "No such action."}`): the action is in another workspace, is on a record the reader cannot open, or is workspace-level (`record: null`) and the reader lacks `view_all_accounts`. Only then do the decision rules run.

**Who decides:** an action on a record, its owner, anyone above the owner in the org chart, or a reader with `view_all_accounts`; `initiative.create` and the four workspace builder kinds, view-all only. Undo is the same rule. Approving or undoing `record.owner` also needs the owner-change right (the owner, anyone above them, or `manage_org_settings`), and the feed's `actions` only offer it to those who have it.

**Activity (`GET /agents/actions/`).** 50 per page, newest first. Readers see actions on records they may open; workspace-level actions only with view-all. `hidden` counts only record-level actions that match the filters but sit on records the reader cannot open; a hidden workspace-level action is not counted. A `customer=` or `account=` filter naming a record the reader cannot open returns an empty page with `hidden: 0`, so the filter cannot probe hidden records.

**Approve and reject errors, in order:** `404 NO_SUCH_ACTION`, `403 CANT_DECIDE`, `400` (a bad override, or `ASSIGNEE_CANNOT_OPEN`), `409 ALREADY_DECIDED` (with `action`; the detail says "applied" or "rejected"), `409 EXPIRED` (with `action`; reasons "the record changed since", "its date has passed", "the agent no longer proposes it", "this action is now set to never", "it waited 14 days"), `409 OWNER_LIMIT` (`{"code": "OWNER_LIMIT", "detail": "You already own 50 segments."}`, or scenarios, campaigns, plan templates: the approver owns the most of what it would make; nothing is made and the action stays proposed). Approving `task.create` with a body needs `assignee_id` in it (`{assignee_id, title?, due_date?, priority?}`, checked as Recommended's Assign checks them); with no body the suggested assignee is used. Reject takes `{note?}` up to 255 characters.

**Undo errors, in order:** `404 NO_SUCH_ACTION`, `403 CANT_DECIDE`, `409 ALREADY_DECIDED` (with `action`; it answers even after the 7 days), `409 NOT_APPLIED`, `410 UNDO_EXPIRED`, `409 CHANGED_SINCE` (with `current` and `applied`; a worked-on task, an edited note or an initiative with linked work gets its own sentence; the builder kinds' sentences are under Delivery 3). Whoever approved the action (the record owner when it ran on Auto) is notified with `agent_action_undone`, unless they did the undo.

**Run now.** `409` bodies are `{code, detail}` (`BUDGET_USED` also carries `resets_on`); `429 {"detail": "The workspace has no credits left."}`. A model call that fails (provider down or not configured) answers 200 with `skipped_reason: "failed"`. A model call that fails is refunded; a reply that can't be read still costs its credit. An empty book makes no model call and charges nothing. The budget is checked before the call, not reserved, so a nightly pass and a Run now running at the same moment can each spend one call past the budget. A pass that raises is audited (`agents.run`, outcome `failure`) before the 500. Run now sends the AI proposal notice (`agent_proposal_waiting`, Work in one place delivery 2 §4.1) once the pass is done; a failed notice is logged and never fails the run.

**Where a proposal shows:** a proposed agent action is an approval on the decider's My work (`GET /work/feed/`) and, for the people below the owner, on the Team queue (`GET /work/feed/team/`). It is decided only through `/agents/actions/<id>/approve|reject/`. It no longer has a Recommended row: the `agent_action` recommendation kind was retired (Work in one place, delivery 2), so Recommended's Assign never answers `USE_APPLY` and no recommendation settles with an action or the reverse. `detail` on a feed approval is the AgentAction (plus `session: {id, title}` or `null` for a facilitator action). Workspace-level actions show to view-all readers only, and are never counted in `hidden` for anyone else. A proposal that has waited 14 days is never shown or counted on My work, the Team queue, the badge (`GET /work/feed/count/`) or the "AI proposal waiting" notice, even before a decision or an agent run marks it `expired` (deciding it answers `409 EXPIRED`). `GET /brain/graph/` draws `agent_action` nodes (Delivery 3). **Since Agent bundles delivery 1** a proposal is a step of a bundle and shows as a `bundle` feed item (§4.3 below) on Mine, My team and Rest of company; the "AI proposal waiting" notice is now "Bundles waiting" (`work` section).

**Notifications:** new kind `agent_action_undone`, linking to `/work/activity?action=<id>` (since Agent bundles delivery 1, `/work?queue=history&bundle=<bundle id>`; older stored links keep working through the frontend's redirect); it names the record only to a recipient who can open it. Delivery 2 adds `agent_draft_ready`, sent to a draft's owner when a `draft.reply` applies (not when the owner approved it), linking to `/communications?draft=<id>`: "The CS agent drafted a reply to Ann Lee on Dough Co." or "The CS agent drafted a reply to a ticket on Dough Co.".

**Delivery 2: drafts and plans** (contract `docs/superpowers/plans/2026-10-08-agents-drafts-api.md`).

- `draft.reply` (CS, Sales; cap auto). The model writes `{email_id, body}` or `{ticket_id, body}` (body 1–4,000 characters). It sees at most one email per record (its newest received email in the record owner's own connected mailbox with nothing newer in its thread, no open draft, and no applied draft reply already answering it) and one ticket (its newest open ticket the owner may read, with no open draft and no draft reply applied to it in the last 7 days), each quoted as data. A new customer email is a new source, so it can be drafted again. `target` is `draft:email:<id>` or `draft:ticket:<id>`; `current` is the thread's newest email (sent or received), or for a ticket `"open"` (open, in-progress, on-hold) or `"resolved"` (resolved, closed), so a reply, a new customer email, or resolving or closing the ticket expires it (`changed`); moving between open statuses does not. Apply makes a ReplyDraft owned by the record owner, whoever decides; it expires instead when the email moved on, the owner's mailbox is no longer connected, the owner is inactive, the owner is no longer the email's mailbox owner, the ticket is resolved, or an open draft already answers the source. There is one open draft per source. Undo deletes the draft; `CHANGED_SINCE` with "This draft has been sent.", "This draft has been edited since." or "This draft was discarded.".
- **Who reads a `draft.reply`:** a reader who may open its record **and** read its source (the email's mailbox chain, the ticket's department); deciding also needs delivery 1's rule. Anyone else, view-all included, has it counted in `hidden` and gets 404 on the detail and on approve, reject and undo; My work's feed and the Team queue follow the same rule.
- **Dropped at generation** (besides delivery 1's rules): a source that isn't the one shown for the action's own record; an email draft when the owner has no connected mailbox; a draft citing anything but its own source's line; any other kind citing an email or ticket line, or naming its record's email subject or ticket title (in its title, rationale or payload text); a draft naming a task or note title from any record, or its record's other source.
- `plan.start` (CS, Sales; cap ask). The model writes `{template_id}` from the "Plan templates" block (built-ins and the workspace's `sharing="workspace"` templates, at most 20, by name); each record lists its open plans. A template not listed, or one already open on the record, is dropped. `target` is `plan:<template_id>`; `current` is null. Apply starts the plan for the record's owner (`owner_for`), today, with the approver as actor; `PlanOpen`, `TemplateGone` or a template no longer shared expire it. The plan keeps the action (`started_by_agent`). Undo returns the plan to Draft (its tasks kept on the plan and deleted, `plan.returned_to_draft`); `CHANGED_SINCE` with "This plan has been finished or cancelled.", "Work on this plan has been done: it can't go back to draft." or "This plan has been deleted.".
- Undo notices call the changes "draft reply" and "plan". A fresh workspace is still all `ask`.

**Delivery 3: the builder** (contract `docs/superpowers/plans/2026-10-08-agents-builder-api.md`).

- Builder kinds are capped at Ask: the person who approves owns everything the action makes, checked again as them inside the decision's transaction (nothing is half-made). A check failing at apply expires the action (`changed`); a 50-per-owner limit is `409 OWNER_LIMIT` and the action stays proposed. Auto is refused with "This action can't be set to auto.".
- `segment.create`, `scenario.create`, `campaign.create`, `plan.template` (Ops): workspace-level, view-all only to read and decide, never in Recommended, never counted in `hidden`. `canvas.create` (every agent): record-level, read by the record's openers, decided by its owner, anyone above them or view-all; it reaches Recommended.
- The model writes a segment definition `{kind, name (≤120), description (≤500), rules}` with 1–8 top-level conditions; a scenario `{name, segment, trigger, actions}` with 1–3 steps from notify, task, lifecycle, plan (a listed template) and survey (always reviewed), never a campaign; a campaign `{name, segment, roles, subject (≤150), body (≤1,200, plain, `{first_name}`, `{organisation}`, `{sender_name}` only)}`; a map `{name (≤120)}` citing its record's people line; a template `{kind, name, description, milestones}` with at most 4 milestones and 12 tasks. A builder action cites only the workspace figures (a map, its record's people line); none of its text names a task or note, and the object it would make (name, description, subject, body, step or task text) names no record, while the action's own title and rationale may quote the figures' accounts (only view-all readers read them); a campaign's subject and body name nothing internal; one builder action is kept per pass. Targets: `segment:<kind>:<name>`, `scenario:<name>`, `campaign:<name>`, `template:<name>`, `canvas`.
- Apply makes: a private segment with its baseline; a segment and a switched-off rule on it; a segment and a draft campaign on it; a map of the record's people the approver may open, laid out by role, no links (`created_by` the approver); a template shared with the workspace. Each keeps the action (`agent_action`) and writes its own audit event with the approver as actor.
- Undo (7 days), `409 CHANGED_SINCE`: "This segment has been edited since." / "A scenario, campaign or survey uses this segment now."; "This scenario has been switched on." (any `rule.activated`, even if switched off again) / "This scenario has been edited since."; "This campaign has been sent." / "This campaign has been edited since."; "This map has been edited since." (its `version` moved); "This plan template has been edited since." / "Plans have been started from this template." / "A scenario or a plan start uses this template now."; and "This segment/scenario/campaign/map/plan template has been deleted." when nothing is left. Edited means `updated_at` moved from the value kept in `after`. A scenario's or campaign's segment goes with it unless something else uses it or it was edited.
- Undo notices call the changes "segment", "scenario", "campaign", "map" and "plan template"; a workspace-level one reads "Vic Viewer undid the Ops agent's segment.".
- Every agent's record blocks carry `people: N (role n, …)` (counts, no names). The Ops prompt carries a builder catalogue (fields, operators, values, AI attributes by `api_name`, products, triggers, steps, roles, merge fields, template limits) and the workspace-shared segments and templates by name and kind.

**Compatibility.** `metrics.Proposal` was renamed `AgentAction` in place (table `metrics_proposal`, same ids; every old proposal is an `ops` action of kind `task.create` or `initiative.create`). Delivery 2 removed the `/metrics/proposals/` routes: `GET /metrics/proposals/`, `POST /metrics/proposals/generate/` and `POST /metrics/proposals/<id>/<decision>/` answer 404. Copilot's `GET/POST /copilot/conversations/<id>/session/decisions/` and session close keep their `proposals` shape. `Organisation.ai_agent_enabled` stops agent runs (nightly and Run now).

### Agent bundles, delivery 1 (2026-10-13)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-13-agent-bundles-d1-api.md`; its §10 Work changes are under the `work` section, "Agent bundles, delivery 1"). Every agent proposal is now a **bundle** of steps (a single action is a bundle of one); a step is an `AgentAction` row. Routes, all `IsAuthenticated` under `/api/v1/agents/`: `GET /agents/bundles/<id>/`, `POST /agents/bundles/<id>/run/`, `POST /agents/bundles/<id>/steps/<step_id>/retry/`, `POST /agents/bundles/<id>/reject/`, `GET /agents/bundles/history/`. Section numbers below are the contract's.

### Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person
will notice.

| # | Decision | Cost if wrong |
|---|---|---|
| D1 | **The nightly review makes one bundle per record per pass.** Every new step an agent proposes for the same organisation or account in one pass goes into one bundle, in the order the model wrote them; workspace-level steps of one pass (the Ops agent's builders) share one bundle with no record. Title: the first step's title, plus ", and N more" when there are several. Reason: the first step's rationale. The model's output shape is unchanged (one list of steps); it may now use `{{step N.key}}` (§6). | Low: a model-written bundle title is one prompt field later. |
| D2 | **A step the policy applies on its own (Auto) gets its own bundle of one,** already `done`, run by nobody ("Applied on its own" in History). It never waits in a queue. | Low. |
| D3 | **Any step saved without a bundle gets a bundle of one** (the facilitator's session proposals, scripts, tests). Same title, reason and record as the step. | None. |
| D4 | **A step re-proposed by a later pass stays in its existing bundle.** A step the pass no longer proposes expires as today; when the last waiting step of a bundle expires, the bundle becomes `expired` (or `superseded` when every one of its steps was replaced by a newer proposal). A bundle with some steps expired and others waiting stays `waiting`; the expired steps show disabled with their reason. A re-proposed step can still be named by a later step of the same pass: a step whose placeholders all name steps of one earlier bundle (its re-proposed twins) is renumbered to that bundle's positions and stays only as its own twin there; one naming steps of two bundles, or of an earlier bundle as a new step, is dropped (§6.1). | Low. |
| D5 | **Queues follow the record's current owner,** as the Work feed does today: an owner change moves a waiting bundle to the new owner's Mine. `routed_user` keeps who it was routed to when it was made (History's "for"). | Low. |
| D6 | **Workspace-level bundles** (no record) are `routed_to: "admins"` and show, as today, in Rest of company to view-all readers only. Delivery 2 decides whether they move to the Unassigned queue (§11). | Low. |
| D7 | **Rest of company holds nothing that is in Mine or My team:** the company minus the reader and everyone below them. Its access is today's Company rule (view-all or Leadership). | None: the spec's rule. |
| D8 | **A queue's count is what needs action in it:** decide plus overdue (the badge's rule), for Mine, My team and Rest of company. History has no count. | Trivial. |
| D9 | **Feed kind `bundle` replaces `approval`** for agent proposals. The frontend's Approvals filter now means rule reviews. `?kind=approval` is read as `bundle` so old links and tabs keep working. | Low. |
| D10 | **Edits travel with Run (and Retry); nothing is saved without running.** Closing the panel with edits asks to discard them. Saved edits (and `edited_at` on a waiting bundle) come with delivery 2, where "New message since you edited" needs them. `edited_at`/`edited_by` are set when a run carries a change. | Low: one PATCH route in D2. |
| D11 | **Which steps can be edited in D1:** `task.create` (title, assignee, due date, priority, as today's Approve), `note.create` (title, body), `draft.reply` (body), `campaign.create` (name, subject, body), `campaign.send` and `survey.send` (§7). Every other step can be unticked but not edited. | Low: each kind adds its fields when wanted. |
| D12 | **A field holding a `{{step N.key}}` placeholder is not editable in D1;** it shows its text with a chip ("Task from step 1") and "Filled in from step 1 when it runs." | Low. |
| D13 | **A selected step the runner may not run refuses the whole run** (403, nothing runs). The panel shows such steps unticked and disabled with the reason, so this only happens to an old tab. | Low. |
| D14 | **What a failure is:** a step whose record moved on, or that waited 14 days, or whose kind is now Never, **expires** at Run ("Skipped: the record changed since.") and cannot be retried; any other refusal **fails** the step with a plain sentence and Retry. A step that needs an earlier step that did not run fails with "Needs step N, which didn't run." | Low. |
| D15 | **A run never stays stuck:** a bundle left `running` for 15 minutes (a crashed worker) is settled on its next read and by the nightly pass (even a pass that is then skipped, say with AI agents off): steps still `proposed` and selected become `failed` with "This step didn't finish. Retry it.", the bundle `partly_done`. Audited with no actor: `agent_action.failed` per step (`error: "StuckRun"`) and `agent_bundle.run_finished` (`stuck: true`). | Low. |
| D16 | **Reject bundle** needs the right to run every waiting step (`may_decide`), with a reason from today's four dismiss reasons and an optional note (255 characters). The agent is told the reason and the bundle's title for that record for 30 days, **never the note** (a note is a person's free text and could name what the record's readers can't see). | Low: the note can be added later behind the twice-filter. |
| D17 | **`survey.send` and `campaign.send` build a new segment** from the agent's definition, like today's `campaign.create`; picking an existing segment is not in D1 (the agent cannot know the runner's own segments). Both are the Ops agent's, workspace-level, capped at Ask. A survey's question is its type's fixed question (shown, not edited). | Low. |
| D18 | **The failed-step notice is delivery 3** (with the outside steps whose failures happen out of sight). In D1 every step runs while the runner watches the panel. | None. |
| D19 | **Old action routes.** `GET /agents/actions/`, `GET /agents/actions/<id>/` and `POST /agents/actions/<id>/undo/` stay (undo is per step). `POST /agents/actions/<id>/approve/` and `/reject/` answer `409 USE_BUNDLE` naming the bundle (§9). `GET /agents/actions/?status=` accepts every step status; a bad one is `400 {"status": ["Choose proposed, applied, rejected, expired, undone, failed or skipped."]}`. | Low. |
| D20 | **Links into Work.** Only links whose meaning changed are rewritten: "Bundles waiting" links `/work?queue=mine&kind=bundle`, the undo notice `/work?queue=history&bundle=<id>`. Every other stored and new link (`/work/mine?task=…`, `/work/mine?kind=approval|suggestion`) keeps working through the frontend's redirects. | None. |
| D21 | **Outside kinds are always Ask.** The registry gains `irreversible` and `outside`; `policy.level` reads Ask for an outside kind whatever is stored; `PATCH /agents/settings/` refuses auto or never on one with `"This action always asks."`. No outside kind exists until delivery 3; the rule is built and tested now with a test-only kind. | None. |
| D22 | **History** lists finished bundles the reader may read, 50 a page by page number (as Activity), newest change first, filtered by agent, step kind and status. | Low. |
| D23 | **My team keeps the per-person counts** (`GET /work/team/`, unchanged) under its list, as the Team tab showed them. Ask the agent stays on Rest of company for view-all readers. | Trivial. |

### 1. The bundle

#### 1.1 `AgentBundle` (`services/agents/models.py`, new)

| Field | Type | Meaning |
|---|---|---|
| `organisation` | FK Organisation, cascade | workspace |
| `agent` | `cs`/`sales`/`ops` (`AgentAction.Agent`) | who proposed it |
| `title` | char 255 | D1 |
| `reason` | text | D1 |
| `source` | `nightly` / `thread` | always `nightly` in D1 (`thread` is delivery 2's) |
| `thread` | — | **not in D1**: delivery 2 adds the FK to `SignalThread` |
| `customer`, `account` | FK, nullable, cascade | the record; both null for workspace-level |
| `routed_to` | `owner` / `department` / `admins` | `owner` when there is a record, else `admins` (D6); `department` is delivery 2's |
| `routed_user` | FK User, nullable, set null | the record's owner when it was made (D5) |
| `department` | — | **not in D1**: delivery 2 adds it |
| `status` | `waiting`, `running`, `done`, `partly_done`, `rejected`, `expired`, `superseded` | §1.3 |
| `edited_at`, `edited_by` | nullable | the last run that carried an edit (D10) |
| `run_by`, `run_started_at`, `run_finished_at` | nullable | the run (and the last retry's finish) |
| `reject_reason` | `already_handled`, `not_relevant`, `wrong_person`, `other`, or `""` | D16 |
| `reject_note` | char 255, blank | D16 |
| `created_at`, `updated_at` | auto | |

Indexes: `(organisation, status)`, `(organisation, updated_at)`. A bundle's `__str__` is
`Agent bundle <id>` (an audit row records it; the title names a record).

#### 1.2 Steps are `AgentAction` rows (`services/metrics/models.py`)

`AgentAction` gains:

| Field | Type | Meaning |
|---|---|---|
| `bundle` | FK `agents.AgentBundle`, **non-null** after the migration, cascade, `related_name="steps"` | |
| `position` | positive small int | 1-based order in the bundle; unique per bundle |
| `selected` | bool, default true | the last run's tick |
| `outputs` | JSON, default `{}` | §6.2 |
| `error` | char 500, blank | the last failure, a plain sentence (§9.3) |
| `irreversible` | bool, default false | what the step was when it ran (§3); set at run |

`AgentAction.Status` gains `failed` ("Failed") and `skipped` ("Skipped"). Every other field and
rule of `AgentAction` is unchanged: one open action per target (`agent_action_one_open`),
`before`/`after`, `result`, undo's 7 days, the session link, the 14-day `WAIT`.

`AgentAction.save()` on a row with no bundle first makes a bundle of one (D3):
`title=action.title`, `reason=action.rationale`, the action's record, `agent`, `source="nightly"`,
`routed_to`/`routed_user` by §1.1, `status="waiting"` for a proposed action (else the mapping in
§1.4), and `position=1`.

#### 1.3 Status rules

| Bundle status | When |
|---|---|
| `waiting` | at least one step `proposed`, no run yet |
| `running` | a run or retry holds it (§5) |
| `done` | after a run: every selected step `applied` (or `undone` later) |
| `partly_done` | after a run: any selected step `failed` or `expired` |
| `rejected` | Reject bundle: every step `rejected` |
| `expired` | no step left `proposed` and none ran (they expired or waited), or a run where every selected step expired |
| `superseded` | no step left `proposed`, none ran, and every one expired with reason `replaced` |

`bundles.settle(bundle)` applies the rules after anything changes a step's status outside a run
(the nightly pass's expiries, a kind set to Never in Settings, a decision through a legacy path).

**Read-time expiry** (backend #113's rule, carried over): a `waiting` bundle whose `created_at` is
14 days old or more is never listed, counted or runnable, even before the nightly pass stores
`expired`. Running it answers `409 BUNDLE_EXPIRED` and stores `expired` (its steps `expired`,
reason `waited`).

#### 1.4 Migration: bundles of one

`agents.0002_agent_bundle` (the model) → `metrics.0014_agent_action_steps` (the new fields,
`bundle` nullable; the two new statuses) → `agents.0003_bundles_of_one` (data) →
`metrics.0015_agent_action_bundle_required` (`bundle` non-null; unique `(bundle, position)`).

The data migration gives every existing `AgentAction` its own bundle, in batches of 500:

| Action status | Bundle status | Bundle run fields |
|---|---|---|
| `proposed` | `waiting` | none |
| `applied` | `done` | `run_by=decided_by`, `run_started_at=run_finished_at=decided_at` (null for Auto) |
| `rejected` | `rejected` | `reject_reason=""`, `reject_note=decision_note[:255]` |
| `expired` | `expired` (`superseded` when `expired_reason="replaced"`) | none |
| `undone` | `done` (the step keeps `undone`) | as applied |

`title=title`, `reason=rationale`, `agent`, record, `routed_to`/`routed_user` by §1.1,
`source="nightly"`, `created_at=action.created_at`, `updated_at=decided_at or created_at`;
the step gets `position=1`, `selected=true`, `outputs` from §6.2 over its `result`, and
`irreversible=false`. Session proposals keep their session link. Reverse: delete every bundle
(the step fields go with `metrics.0014`'s reverse).

### 2. The registry (`services/agents/kinds.py` `Kind`)

New fields, all with defaults so existing kinds are unchanged unless named:

| Field | Default | Meaning |
|---|---|---|
| `irreversible` | `False` | can't be undone once it ran (§3) |
| `outside` | `False` | acts outside Revenact; every outside kind is irreversible and always Ask (D21) |
| `editable` | `()` | the payload keys a person may change in the panel (D11) |
| `edit` | `None` | `(action, fields, runner) -> payload`: checks `fields` (only `editable` keys) and returns the new payload; raises `FieldErrors({key: [sentence]})` |
| `outputs` | `()` | the `outputs` keys a run of this kind fills (§6.2) |

Editable keys and outputs in D1:

| Kind | `editable` | `outputs` |
|---|---|---|
| `task.create` | `title`, `assignee_id`, `due_date`, `priority` (today's Approve overrides, same checks and sentences) | `task_id`, `task_url` |
| `note.create` | `title` (1–255, the kind's own limit), `body` (1–4000) | `note_id` |
| `draft.reply` | `body` (1–4000) | `draft_id` |
| `campaign.create` | `name`, `subject` (≤150), `body` (≤1,200) (the kind's own limits and merge-field rule; blank refused) | `campaign_id`, `campaign_url`, `segment_id`, `segment_url` |
| `campaign.send` (new) | `name`, `subject`, `body`, `roles`, `draft_only` | as `campaign.create`, plus `send_id` when sent |
| `survey.send` (new) | `name`, `survey_type`, `subject`, `intro`, `roles`, `draft_only` | `survey_id`, `survey_url`, `segment_id`, `segment_url` |
| `segment.create` | — | `segment_id`, `segment_url` |
| `scenario.create` | — | `rule_id`, `rule_url`, `segment_id`, `segment_url` |
| `canvas.create` | — | `canvas_id`, `canvas_url` |
| `plan.start`, `plan.template`, `initiative.create` | — | `plan_id` / `template_id` / `initiative_id` |
| record and other task kinds | — | — |

`irreversible=True` in D1: `campaign.send`, `survey.send` only. No D1 kind is `outside`.

**Policy (D21):** `policy.level(prefs, agent, kind)` returns `ask` for an `outside` kind whatever
is stored. `GET /agents/settings/` `kinds[]` rows gain `"irreversible": bool`, `"outside": bool`
and `"locked": bool` (true for outside kinds: the grid shows Ask, disabled). `PATCH` with
`auto` or `never` for an outside kind: `400 {"levels": {"<agent>": {"<kind>": ["This action always asks."]}}}`.
Storing `ask` for one is accepted (a no-op).

### 3. "Can't be undone"

A step is irreversible when its kind is `irreversible` and, for a kind with `draft_only` in
`editable`, `draft_only` is false. The step payload (§4.2) carries it, computed from the current
payload; the panel recomputes it as `draft_only` is toggled (`kind_irreversible && !draft_only`).
At Run the step's `irreversible` column stores what actually ran. Undo on an irreversible step
answers the existing `409 CHANGED_SINCE` sentence of its kind ("This campaign has been sent." /
"This survey has been sent."), checked before the 7-day window (so never `UNDO_EXPIRED`); its `undo` block reads `{"allowed": false, "reason": "irreversible", "until": null}`.

### 4. Shapes

#### 4.1 Bundle

```json
{
  "id": 12,
  "agent": "cs",
  "agent_label": "CS agent",
  "title": "Move Acme to At risk, and 1 more",
  "reason": "Health fell from 72 to 41 in two weeks and the renewal is in 30 days.",
  "source": {"kind": "nightly", "label": "Nightly review"},
  "record": {"type": "customer", "id": 7, "name": "Acme"},
  "routed_to": "owner",
  "for": {"id": 3, "name": "Carl CSM"},
  "status": "waiting",
  "created_at": "2026-10-13T02:00:04Z",
  "updated_at": "2026-10-13T02:00:04Z",
  "edited_at": null,
  "edited_by": null,
  "run_by": null,
  "run_started_at": null,
  "run_finished_at": null,
  "reject_reason": "",
  "reject_note": "",
  "has_newer_message": false,
  "step_count": 2,
  "can_run": true,
  "can_reject": true,
  "steps": []
}
```

- `record`: the feed's record ref, or null for workspace-level.
- `for`: the record's current owner (D5); null for workspace-level or no owner ("For the whole
  company"). In History, the person it was routed to (`routed_user`).
- `edited_by`, `run_by`: `{"id", "name"}` or null.
- `has_newer_message`: always `false` in D1 (delivery 2's banner).
- `can_run`: the reader may run at least one waiting step. `can_reject`: they may run every
  waiting step (D16). Both false unless `status` is `waiting`.
- `steps`: in `position` order, every step (including unticked, expired and skipped ones).

#### 4.2 Step

```json
{
  "id": 41,
  "position": 1,
  "kind": "task.create",
  "label": "Create a task",
  "status": "proposed",
  "selected": true,
  "title": "Book a save call with Acme's sponsor",
  "rationale": "Health 41, renewal in 30 days.",
  "fields": {"title": "Book a save call", "assignee_id": 3, "due_date": "2026-10-16", "priority": "high"},
  "editable": ["title", "assignee_id", "due_date", "priority"],
  "placeholders": [],
  "preview": {},
  "irreversible": false,
  "outside": false,
  "can_run": true,
  "disabled_reason": null,
  "outputs": {},
  "error": "",
  "expired_reason": "",
  "undo": null,
  "evidence": []
}
```

- `fields`: the payload's `editable` keys only, as stored (with `task.create`'s `due_in_days`
  already resolved to `due_date`); `{}` for a kind with nothing editable.
- `placeholders`: one row per placeholder found in a text value of the payload:
  `{"field": "title", "step": 1, "key": "task_url", "label": "Task link from step 1"}`. Labels:
  `<thing>_url` → "<Thing> link from step N", `<thing>_id` → "<Thing> from step N"; things are
  Task, Note, Draft, Campaign, Survey, Segment, Scenario, Map, Plan, Template, Initiative, Send.
  A field listed here is not editable (D12): it is left out of `editable`.
- `preview`: the kind's existing preview for the reader (unchanged per kind); `survey.send` and
  `campaign.send` in §7.
- `can_run` / `disabled_reason`: for a `proposed` step, whether the reader may run it, else the
  sentence: `"You can't run this step."` (`may_decide` false) or `"Only people who can read this
  email can run this step."` / `"... this ticket ..."` (a draft reply's source). For any other
  status: `can_run` false, `disabled_reason` null.
- `outputs`: §6.2, after it ran. `error`: the last failure (§9.3), `""` otherwise.
  `expired_reason`: today's reason key when `expired`, else `""`; the sentence is today's
  `deciding.REASONS`.
- `undo`: today's undo block for an `applied` step (D19), else null.
- `evidence`: today's rule (view-all readers only).

#### 4.3 The feed item for a bundle (`kind: "bundle"`)

Work in one place's FeedItem with:

| Key | Value |
|---|---|
| `key` | `bundle:<id>` |
| `kind` | `bundle` |
| `id` | the bundle id |
| `title`, `record` | the bundle's |
| `from` | `{"type": "agent", "label": "CS agent"}` |
| `at` | `created_at` |
| `actions` | `["open"]` (decisions are made in the panel) |
| `detail` | `{"reason", "step_count", "source": {"kind", "label"}, "kinds": [labels of its waiting steps, in order], "can_run"}` |
| `for` | team and company queues only, §4.1's `for` |

### 5. Run, retry, reject

#### 5.1 `POST /agents/bundles/<id>/run/`

```json
{"steps": [
  {"id": 41, "selected": true, "fields": {"title": "Book a save call this week"}},
  {"id": 42, "selected": false}
]}
```

1. **Before anything is locked** (the same order as today's decisions): 404 when the bundle is
   not the reader's to read (§8); 403 `CANT_RUN` when the reader may run none of its waiting steps.
2. **The body.** `steps` must name every `proposed` step exactly once (other statuses may not be
   named); at least one `selected: true`; `fields` only on selected steps, only `editable` keys,
   checked by the kind's `edit`. Refusals: §9.1. Nothing is locked or written when the body is
   refused.
3. **The claim** (one short transaction): the bundle's row is locked
   (`select_for_update(of=("self",))`); anything but `waiting` is a 409 (§9.2); the read-time
   expiry (§1.3) is a 409 and stores `expired`; every selected step is re-checked (`may_decide`,
   source) and a step the reader may not run is `403 CANT_RUN_STEP` (D13). Then: `status=running`,
   `run_by`, `run_started_at=now`, each step's `selected` stored, unticked steps `skipped`; edited
   payloads stored with `edited_at`/`edited_by` when any field differs from what was stored. Audit
   `agent_bundle.run_started` (who, bundle, selected step ids). Commit. **Lock order** (one order
   everywhere): a step's bundle is locked before the step (`deciding.locked()`); code that locks
   several bundles (a kind set to Never, the nightly pass's expiries) takes them in ascending id.
4. **The steps**, selected ones in `position` order, each in **its own transaction** (with the
   step's row locked): placeholders filled from earlier steps' `outputs` (§6); the existing
   checks (`stale_reason`, then the kind's `apply` through `deciding.apply_action` with the
   runner as decider). Success: `applied`, `outputs` stored, `irreversible` stored, audit
   `agent_action.approved` as today (`decided_as`, plus `bundle`). Expiry: `expired` with its
   reason (D14). Any other exception: the step's transaction rolls back, then in a new one the
   step becomes `failed` with `error` (§9.3); audit `agent_action.failed` (kind, bundle, the
   error's class name, never the sentence's record names). A failure never stops later steps,
   except those whose placeholders need it (§6).
5. **The finish** (one short transaction, bundle row locked): `done` or `partly_done` or
   `expired` by §1.3, `run_finished_at=now`. Audit `agent_bundle.run_finished` (status, counts
   per step status). The proposal notice is not sent (nothing new waits).

`200`: `{"bundle": <Bundle>}` (fresh, for the runner). A crash between 3 and 5 leaves the bundle
`running`; D15 settles it.

#### 5.2 `POST /agents/bundles/<id>/steps/<step_id>/retry/`

Body: `{"fields": {...}}` (optional, editable keys only, as in 5.1). Order of refusals: 404
(bundle unreadable, or the step not in it); 403 `CANT_RUN_STEP` when the reader may not run it;
`409 NOT_FAILED` "Only a failed step can be retried." unless the step is `failed`; `409
BUNDLE_RUNNING` while another run holds the bundle. The retry holds the bundle's row lock for its
one step (a retry is short), clears `error`, then runs the step as 5.1.4 inside it; the bundle is
then re-settled (`done` when every selected step is `applied`). Audit `agent_bundle.retried`.
`200 {"bundle": <Bundle>}` whether the retry succeeded or failed again (the step says which).

#### 5.3 `POST /agents/bundles/<id>/reject/`

Body: `{"reason": "not_relevant", "note": "We already called them."}`. Refusals: 404; 403
`CANT_REJECT` "You can't reject this bundle." unless the reader may run every waiting step (D16);
400 `{"reason": ["Choose already handled, not relevant, wrong person or other."]}`; 400
`{"note": ["Keep the note under 255 characters."]}`; the 409s of §9.2. Under the bundle's lock:
every `proposed` step `rejected` (`decided_by`, `decided_at`, `decision_note=note`,
`feedback_log` as today), `status=rejected`, `reject_reason`, `reject_note`. Audit
`agent_bundle.rejected` (reason, never the note). `200 {"bundle": <Bundle>}`.

**Feedback to the agent (spec §4.3):** for each record in an agent's evidence, that agent's own
bundles on it rejected in the last 30 days add one line to the record's block, newest first, at
most 3: `    rejected: "<bundle title>" (<reason label>, <date>)`. Never the note (D16). A bundle
holding a `draft.reply` step is titled `"A draft reply"` there (its title may quote mail or a
ticket; the twice-filter, as the feedback log masks it). These lines are
evidence the model may read but never quote (`match_line` skips them), so no step can cite them.

#### 5.4 `GET /agents/bundles/<id>/`

The Bundle for the reader. Settles a stuck run first (D15). 404 by §8.

### 6. Placeholders (`{{step N.key}}`)

#### 6.1 Grammar and checks

`{{step N.key}}` inside any string value at the top level of a step's payload, where `N` is a
position (1–99) and `key` matches `[a-z_]+`; spaces inside the braces are allowed
(`{{ step 1.task_url }}`). At proposal time (nightly pass) a step is dropped (`Invalid`) when a
placeholder names its own or a later position, or a key the producing step's kind does not list in
`outputs`, or sits in a field a customer reads (`draft.reply` `body`; `campaign.create` and
`campaign.send` `subject`, `body`; `survey.send` `subject`, `intro`). The model numbers its steps
for a record in its own order; a placeholder may name a step it re-proposed (D4) only when every
step it names is in that one earlier bundle and it is itself that bundle's re-proposed twin.
Text that looks like braces but does not match is left as written.

#### 6.2 Outputs

After a step applies, `outputs` is its `result`'s ids plus a link per id that has a page:

| id key | link key | link |
|---|---|---|
| `task_id` | `task_url` | `/work/mine?task=<id>` |
| `campaign_id` | `campaign_url` | `/campaigns/<id>` |
| `survey_id` | `survey_url` | `/surveys/<id>` |
| `segment_id` | `segment_url` | `/segments/<id>` |
| `rule_id` | `rule_url` | `/scenarios/rules/<id>` |
| `canvas_id` | `canvas_url` | `/canvas/<id>` |

Other ids (`note_id`, `draft_id`, `plan_id`, `template_id`, `initiative_id`, `send_id`) are
outputs without links. Links are app paths, never absolute URLs.

#### 6.3 Filling

Just before a step runs, each placeholder is replaced by the producing step's `outputs[key]`
(as text). When the producing step is not `applied` (unticked, failed, expired) or lacks the key,
the step fails with `"Needs step N, which didn't run."` without calling its kind; Retry works
once step N has applied. Filled values are what the step stores and History shows.

### 7. New Revenact steps

Both are the Ops agent's, workspace-level, `max_level` Ask, `builder=True`, `irreversible=True`
(D17). Their payload's `segment` is a `segment.create` definition (the agent's catalogue).
`draft_only` defaults to false. Applying runs as the **runner**, who becomes the owner of the
segment and the survey or campaign (today's builder rule).

#### 7.1 `survey.send`

Payload: `{"name" (≤120), "survey_type": "nps"|"csat"|"ces", "subject" (≤120), "intro" (≤500,
may be ""), "segment": <definition>, "roles": [contact roles], "draft_only": false}`.

Preview (per reader):

```json
{"survey": {
  "name": "Q4 NPS for at-risk champions",
  "survey_type": "nps",
  "question": "How likely are you to recommend Acme to a friend or colleague?",
  "subject": "Two minutes for Acme?",
  "intro": "We'd love your view.",
  "segment": "At-risk champions",
  "roles": ["Champion"],
  "audience": {"contacts": 42, "records": 3, "record_noun": "organisations"},
  "limit": 500
}}
```

`audience` is counted as the reader sees it: the definition's matching records the reader may
open, and their contacts with a chosen role and an email (`builder.audience_counts`; one query
per definition, `id IN` subqueries). It is counted only while the step is `proposed`; once the
step has left `proposed` (History, a run's result) `audience` is `null`. The panel's sentence: "42 contacts across 3 organisations".
`question` is the type's fixed question (`surveys.questions.question_for`).

Apply: make the segment (`builder.create_segment`), then the draft (`SendWriteSerializer` as the
runner); with `draft_only` stop there. Else `surveys.sending.claim(...)` as the runner (email set
up, daily limit, the audience again, at most 500 people, quiet period, unsubscribes), exactly the
"Send now" button's rules. A `Refusal` fails the step with its `detail` sentence; the segment and
draft stay (so Retry sends the same draft: the step's `result` keeps `survey_id`, and a retry
claims that draft instead of making another). **Retry** reuses the kept survey by its id, whatever
its status: one already sent fails with claim's own sentence for a sent survey; a step another
person ran fails with "Only the person who ran this step can retry it."; Retry's edits are written
to the kept draft through the Surveys page's own serializer (`SendWriteSerializer`) as the runner,
with its update audit event. Outputs: `survey_id`, `survey_url`, `segment_id`,
`segment_url`. Undo: a draft-only run deletes the draft and its segment while unsent and
unedited (as `campaign.create`); a sent one is irreversible (§3).

#### 7.2 `campaign.send`

Payload: `campaign.create`'s plus `"draft_only": false`. Preview: `campaign.create`'s plus
`"audience": {"contacts", "records", "record_noun"}` (counted for the reader as in 7.1; `null` once the step left `proposed`) and
`"limit": null` (a campaign has no audience cap). Apply: `campaign.create`'s apply, then (unless `draft_only`)
`campaigns.sending.claim(campaign, kind=MANUAL, by=runner, ...)`. Refusals fail the step with the
refusal's `detail`; a retry claims the campaign already made, by its id, and never re-sends: one
already sent fails with "This campaign has been sent."; a step another person ran fails with
"Only the person who ran this step can retry it."; Retry's edits are written to the kept draft
through the Campaigns page's own serializer (`CampaignWriteSerializer`) as the runner, with its
update audit event. Edits use `campaign.create`'s own limits (subject ≤150, body ≤1,200, blank
refused). Outputs as `campaign.create`, plus
`send_id` when sent. `campaign.create` stays for draft-only proposals.

#### 7.3 Prompt

`prompt.PAYLOADS` gains the two kinds; the system prompt gains one paragraph: steps for the same
record are run together, in order; a later step may use an earlier step's output with
`{{step N.key}}`, the keys being those in §6.2 for the earlier step's kind. The paragraph lists
the outputs of the agent's allowed kinds only (a kind with no outputs is not named).

### 8. Who reads and runs a bundle

- **Read** (detail, run, retry, reject, a queue row): the bundle's record is one the reader may
  open (`visible_customers` / `visible_accounts`), or, workspace-level, the reader is view-all; and
  no step is a draft reply whose source the reader may not read (`source_access`). One `id IN`
  subquery per rule, never a join with DISTINCT. Anything else is `404 {"code": "NO_SUCH_BUNDLE",
  "detail": "No such bundle."}` and, in a queue, counted in `hidden`, never named.
- **Run a step**: today's `deciding.may_decide(reader, step)` (owner, chain, view-all; the
  owner-change right; source readers only).
- **Twice-filter**: every step's text was filtered on the way in by the pass (today's mention
  rules, unchanged); on the way out the bundle is read only by §8's rule and each step's preview by
  its kind's per-reader rule.

### 9. Errors

#### 9.1 `400` bodies (run and retry)

| When | Body |
|---|---|
| `steps` missing or not a list | `{"steps": ["List every waiting step once."]}` |
| a waiting step missing, named twice, or a step that isn't waiting named | same |
| nothing selected | `{"steps": ["Choose at least one step to run."]}` |
| `fields` on an unticked step, or a key not in `editable` | `{"steps": {"<id>": {"<key>": ["This can't be changed here."]}}}` |
| the kind's `edit` refuses | `{"steps": {"<id>": {"<key>": ["<the kind's sentence>"]}}}` |

#### 9.2 `409` bodies (run, retry, reject)

Each carries `"bundle": <Bundle>` as the reader sees it now.

| Status found | `code` | `detail` |
|---|---|---|
| `running` | `BUNDLE_RUNNING` | `"<name> is running this."` |
| `done` / `partly_done` | `BUNDLE_RAN` | `"<name> ran this at 10:42."` (today), `"<name> ran this on 12 Oct at 10:42."` (another day); "Revenact" for an Auto bundle |
| `rejected` | `BUNDLE_REJECTED` | `"<name> rejected this."` |
| `expired` (or read-time) | `BUNDLE_EXPIRED` | `"This bundle expired: <reason>."` with today's `REASONS` sentence (`it waited 14 days`, …) |
| `superseded` | `BUNDLE_SUPERSEDED` | `"A newer bundle replaced this one."` |
| retry on a step not `failed` | `NOT_FAILED` | `"Only a failed step can be retried."` |

`403`: `{"code": "CANT_RUN", "detail": "You can't run this bundle."}`, `{"code": "CANT_RUN_STEP",
"detail": "You can't run step 2.", "step": 42}`, `{"code": "CANT_REJECT", "detail": "You can't
reject this bundle."}`.

Every `AgentAction` payload (`GET /agents/actions/`, `GET /agents/actions/<id>/`, the undo
route's answer) gains `"bundle": <bundle id>`: the frontend's `/work/activity?action=<id>`
redirect opens that bundle in History. `POST /agents/actions/<step id>/undo/` stays the per-step
Undo and answers today's `{"action": <AgentAction>}`; History reads the bundle again after it.

`POST /agents/actions/<id>/approve|reject/` (D19): `409 {"code": "USE_BUNDLE", "detail": "Open the
bundle to decide this.", "bundle": 12}` after the existing 404/403 checks.

#### 9.3 Step errors (`error`)

Plain sentences, never codes, at most 500 characters:

| Cause | Sentence |
|---|---|
| a survey or campaign `Refusal` | its `detail` (e.g. "Email isn't set up for this workspace yet, so surveys can't be sent.", "Nobody to send to.") |
| a DRF `ValidationError` | its first message |
| `OwnerLimit` | its `detail` |
| a placeholder's step didn't run | "Needs step N, which didn't run." |
| rights lost between claim and step | "You can no longer run this step." |
| a stuck run (D15) | "This step didn't finish. Retry it." |
| anything else | "Something went wrong running this step. Retry it." (logged with the class name) |

### 12. Permissions, audit and performance

- Every route: `IsAuthenticated`; another workspace's bundle is 404. Every visibility filter is
  an `id IN` subquery with a `# SOC2:AUTH-02` comment; every audited write `# SOC2:LOG-01`.
- Audit events: `agent_bundle.run_started`, `agent_bundle.run_finished`, `agent_bundle.retried`,
  `agent_bundle.rejected`, `agent_action.approved` (per applied step, with `bundle`),
  `agent_action.failed`, plus the survey's and campaign's own send events. A stuck run settled
  (D15) writes `agent_action.failed` per step (`error: "StuckRun"`) and
  `agent_bundle.run_finished` (`stuck: true`), with no actor.
- **Query ceilings** (pinned by tests that add rows and compare; measured on the branch and
  written into `docs/API_CONTRACTS.md`): `BUNDLE_DETAIL_CEILING` (detail, constant in the number
  of steps up to 8), `HISTORY_CEILING` (a page of 50, constant in rows), `QUEUES_CEILING`
  (`/work/queues/`), and the existing feed, count and team ceilings re-measured (they must not
  grow with bundles). A run's queries grow with its steps, never with the workspace.
  **Measured on the branch** (`services/agents/tests/test_bundle_queries.py`,
  `services/work/tests/`):

  | Ceiling | Queries | Notes |
  |---|---|---|
  | `BUNDLE_DETAIL_CEILING` | 10 | constant for up to 8 `note.create`, `record.lifecycle` and `draft.reply` steps |
  | `AUDIENCE_STEP_QUERIES` | +3 per step | each `survey.send` or `campaign.send` step still `proposed` adds 3 (its audience count, read for the reader); pinned, not batched, so a waiting bundle's detail does grow with its send steps |
  | `HISTORY_CEILING` | 8 | a page of 50, constant in rows, send rows included (a finished step's `audience` is `null`, never counted) |
  | `QUEUES_CEILING` | 41 | a manager (41); view-all 40, Leadership only 40, a CSM 25 |
  | `FEED_CEILING` | 54 | was 53 |
  | `COUNT_CEILING` | 23 | unchanged |
  | `TEAM_CEILING` | 46 | `team` (was 45); `company` 45 |
  | `PROPOSAL_NOTICE_CEILING` | 41 | unchanged |
- No query uses `DISTINCT`; a test asserts it over every query of the feed, queues, history and
  detail (Postgres 16).

### Agent bundles, delivery 2 (2026-10-13)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-13-agent-bundles-d2-api.md`; its Work changes, §4.5 to §4.7, are also summarised under the `work` section, "Agent bundles, delivery 2"). Messages become bundles: the filed mail and ticket threads are read on the workspace's interval and answered with a bundle for the record's owner, a department queue or the admins' Unassigned queue; a bundle's steps are saved as they are edited, and a bundle with a newer message offers Refresh suggestions. Delivery 1's contract still holds except where this section changes it. New routes, all `IsAuthenticated` under `/api/v1/agents/`: `PATCH /agents/bundles/<id>/steps/<step_id>/` (§4.1), `POST /agents/bundles/<id>/refresh/` (§4.2). Changed: the Bundle and Step shapes (§3.1, §3.2), the run's `409 BUNDLE_REFRESHED` (§4.3), reject's `rejected_by` (§4.4), `GET`/`PATCH /agents/settings/` (§4.8), `campaign.create`/`campaign.send` body limit 5,000 (D2-31), `survey.send`/`campaign.send` `draft_only` starting true (D2-29), and `GET /api/schema/` rendering for a signed-out caller (D2-32). Section numbers below are the contract's; italic *as built* notes mark where the code differs from the plan text.

### What D1 left that this delivery builds on (read from the merged code, not the D1 plan)

- `AgentBundle.Source.THREAD` and `RoutedTo.DEPARTMENT` exist; nothing makes them yet.
- `bundle_payload` writes `"has_newer_message": false` and `source: {kind, label}`.
- A customer-facing field never holds a placeholder (D1 final fix wave).
- A queue whose count failed has `count: null` and its key in `failed` (D1 §10.3 as built).
- Retry is by the runner only for send steps (`campaign.send`, `survey.send`).
- `campaign.create`/`campaign.send` body limit is 1,200 (this delivery raises it, D2-31).
- The nightly pass expires every proposed step of its agent that it did not propose again
  (`run._expire_unproposed`); this delivery keeps it off message bundles (D2-27).

### Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person
will notice. **Owner** marks a decision the owner should confirm before the build; the plan is
written to it, and each is one small change if the answer is different.

| # | Decision | Cost if wrong |
|---|---|---|
| D2-1 | **What a thread is.** Mail: the filed `Email` rows of one mailbox with one provider thread id (`mailbox`, `thread_id`); mail with no thread id never feeds agents. Zendesk, Freshdesk, Jira and webhook: one `Ticket` (its connector and external id). Slack: one top-level message, because the Slack connector syncs no replies today. No ticket source syncs comments, so a ticket thread's only "message" is its title and description: it is touched when the ticket is filed, when its title or description changes, and when it is reopened; a status, priority or assignee change alone touches nothing. | Low: a comment sync later just touches the same thread. |
| D2-2 | **Unmatched items stay unmatched** (**Owner**). Today the sync counts and skips a ticket whose requester matches no customer (`connectors/sync.py`), and files only mail that matches one (`mail/sync.py file_message`); neither is stored. This delivery keeps that: every thread has a record. Storing unmatched items would be a new copy of outside text, and no D2 step kind can act on a thread with no record (a task, note or draft needs one); the outside steps of D3 (Slack reply, Jira create) can. So the department and Unassigned queues are fed by threads on records with no owner, or whose owner can't read the source (D2-5). | Medium: department queues stay quiet where most traffic is unmatched. Revisit with D3. |
| D2-3 | **Customer match is the sync's own match, unchanged:** a contact with the sender's email, then the sender's domain (an account's, then an organisation's, never a public domain), then a connector linked to exactly one company (this is how a Slack channel links to a customer). The thread takes the filed row's record. No second matcher. | None. |
| D2-4 | **Mail reaches an agent only when its owner may read it** (**Owner**). Mail is personal: the mailbox owner and their managers read it (`mail.visibility`). A mail thread is processed only when the record's owner is the mailbox owner or above them; any other mail thread is skipped (`no_reader`): no department and no admin may read someone else's mail, so it has no one to go to. | Low: mail from a teammate below the owner is still read. |
| D2-5 | **Routing** (spec §5, made exact). 1: the record has an owner who may read the source → `owner`. 2: else the source has a department (a ticket from a connector with a department) → `department`. 3: else a ticket → `admins` (the Unassigned queue). A mail thread never reaches 2 or 3 (D2-4). "Admins" are people with `manage_org_settings`. Department keys are `User.Function` codes (`cs`, `engineering`, `sales`, `analytics`, `leadership`, `other`). | Low. |
| D2-6 | **Who may run a step in a department or Unassigned bundle** (**Owner**). Today's `may_decide` (owner, chain, view-all; source readers only), plus: on a record with **no owner**, anyone with that department's ticket access (its people and Leadership) may run a department bundle's steps, and an admin an Unassigned bundle's. Without this, most of a department queue's readers could read but never run it. An owner change step still needs the owner-change right. | Medium: if refused, department queues are read-only for everyone without view-all. |
| D2-7 | **Which queues are listed.** A department queue (`department:<code>`, labelled with the department's name) is listed for its people and for Leadership whenever the workspace has an enabled ticket connector in that department, even with nothing waiting (a queue never vanishes under its reader). Unassigned (`unassigned`) is listed for admins whenever an enabled ticket connector has no department. Order: Mine, My team, Rest of company, department queues in `User.Function` order, Unassigned, History. These queues hold only bundles, so they have no kind chips (`?kind=` is accepted and ignored). | Low. |
| D2-8 | **Mine, My team and Rest of company never show a department or Unassigned bundle**, even when its record's owner later becomes the reader: a routed bundle stays where it was routed. The nightly pass's workspace-level bundles stay in Rest of company for view-all readers (D1's D6, settled: they do not move to Unassigned). | Low. |
| D2-9 | **The badge** counts Mine plus the reader's own department's queue (their `function`), as the spec says. Unassigned is not counted; admins hear of it through "Bundles waiting" (D2-24). | Trivial. |
| D2-10 | **Which agent.** A ticket source goes to the **CS agent**. A mail thread goes to the **Sales agent** when its record has an open opportunity (a stage before Closed won/lost) or its owner works in Sales, else to the CS agent. No D2 thread goes to the Ops agent (every thread has a record, D2-2). | Low. |
| D2-11 | **A message never applies anything on its own.** A thread run's steps always wait for a person, whatever the grid says (a kind on Never is still dropped): customer-written text drives the model, so nothing it proposes runs unseen. | Low: Auto for message steps can come later. |
| D2-12 | **A message bundle's steps may quote their thread** (**Owner**). D1 lets only a draft reply cite an email or ticket, because other steps were read more widely. A message bundle is read only by people who may read its source (§5.1), so each of its steps may cite the thread and name its subject. The other twice-filter checks stay (no other record, no task or note some of the record's readers can't read). Once run, a task made from an email is read by everyone who opens the record: the person who runs it chose that text. | Medium: if refused, message bundles can only draft replies and make text-free changes. |
| D2-13 | **What the model reads** (spec §4.3, made exact): the thread's newest 8 messages, oldest first, each quoted up to 600 characters (the sender, the time, sent or received); the record's block as the nightly pass writes it, filtered for the bundle's recipient (the owner's chain rule for tasks and notes; only ownerless tasks and notes for a department or Unassigned bundle); members; plan templates; the agent's rejected bundles on the record for 30 days (reason, never the note). *As built:* mail evidence for a thread is limited to emails filed on the thread's own record. One call per thread, at most 8 steps, purpose `agent_<agent>` (the agent's budget counts it). | Low. |
| D2-14 | **The answer** is one object: `{"title": <the bundle's title, at most 120 characters, naming the record and the matter>, "reason": <one or two sentences>, "actions": [<steps, the nightly shape>]}`. An empty `actions` is "nothing to do". A title or reason that fails the twice-filter checks falls back to the first step's title and rationale. A draft reply is offered only on an owner-routed thread: for mail, only when the owner's own connected mailbox holds it. | Low. |
| D2-15 | **A thread already answered needs no call.** A mail thread whose newest message was sent by us, and a ticket resolved or closed, is skipped without a model call (`answered`, `resolved`); a later customer message makes it due again. | None. |
| D2-16 | **Nothing to do** marks the thread processed. If the thread has a waiting bundle nobody edited, that bundle is superseded (its steps expire `replaced`): the agent re-read the whole thread and no longer proposes it. | Low. |
| D2-17 | **Update versus new.** The thread's waiting bundle (inside its 14 days): untouched (`edited_at` null) → its waiting steps are deleted (never decided, so nothing is lost but the proposal) and the new steps take positions 1..n; title and reason are replaced; it is **re-dated** (`created_at` = now, its 14 days start again; `refreshed_at` = now). Edited → **no model call**: `has_newer_message` is set and the thread is marked processed; Refresh (D2-19) makes the call when a person asks. No waiting bundle → a new bundle. | Low. |
| D2-18 | **Edits are saved as they are made** (D1's D10 deferred this here). `PATCH /agents/bundles/<id>/steps/<step id>/` saves a waiting step's fields and tick; it stamps the step's `edited_at` and the bundle's `edited_at`/`edited_by`. Run still carries the fields it runs with. The panel saves on blur and on a tick, so closing it no longer asks to discard. | Low. |
| D2-19 | **Refresh suggestions** is one synchronous model call (as Run now is), by anyone who may run a waiting step. It replaces the steps nobody edited, keeps every edited step **and every step an edited step names** (`{{step N}}`), renumbers them 1..k in their old order (placeholders follow), appends the new steps after them, and clears `has_newer_message`. A new step that would replace an edited one is dropped. If the bundle changed while the call ran, nothing is written: `409 BUNDLE_CHANGED`. | Low. |
| D2-20 | **A run against replaced steps** (the steps were replaced after the panel loaded) answers `409 BUNDLE_REFRESHED` with the fresh bundle, never the generic "List every waiting step once." | None. |
| D2-21 | **The interval.** `Organisation.ai_signal_interval`: `30m`, `1h` (default), `4h`, `24h`. `run_agent_signals` runs every 15 minutes; a workspace is due when its last run started at least the interval minus 2 minutes ago (so a 30-minute workspace is not pushed to 45 by the cron's own drift), and the run claims it with a compare-and-set so two overlapping runs never both take it. Scheduling: a new `agentsignals` service in `docker-compose.yml`, a sleep loop of 900 s like `ticketsync` (this project has no task queue by design); the production compose in `revenact-infra` gets the same service in a follow-up infra PR. | Low. |
| D2-22 | **The quiet rule and the cap.** A thread is picked when `last_message_at > processed_through` (or never processed) and `last_message_at <= now - 15 min`. At most 25 threads per workspace per run, oldest last message first; the rest wait for the next run. A thread whose last message is over 7 days old when picked is skipped (`stale`). A thread first touched by a message over 7 days old (mail by its `sent_at`, a ticket by its `opened_at`) is made already skipped (`stale`), so a mailbox's or connector's first import never floods the agents. | Low. |
| D2-23 | **Off means not read.** A source switched off in Settings › Agents, AI switched off, or the chosen agent switched off: the thread is marked skipped (`source_off`, `ai_off`, `agent_off`) and its messages so far are never read later; turning it back on reads only new messages. Out of credits is different (spec §4.3): the agent's monthly budget used or the workspace out of AI credits leaves the thread **waiting** (`waiting_credits`, reason `budget` or `credits`), and Settings › Agents says how many wait. | Low. |
| D2-24 | **"Bundles waiting" recipients follow routing.** Owner-routed bundles: today's notice (their Mine). Department and Unassigned bundles: each person who may read and run one of a new such bundle's steps (department: its people and Leadership; Unassigned: admins), once a workspace day for the kind (*as built:* the limit is shared between the Mine notice and the queue notices, which are the same kind), linking `/work?queue=department:<code>&kind=bundle` or `/work?queue=unassigned&kind=bundle`. | Low. |
| D2-25 | **Failure isolation.** Each workspace runs in its own `try`; each thread in its own transaction after the model call. A model call that fails leaves the thread due for the next run; after 3 failures it is skipped (`failed`). One failing never stops the others. | None. |
| D2-26 | **Every source on by default**, every interval at 1 hour: the owner's "every connector feeds agents". Budgets cap the spend (the agents' default budget is a fifth of the plan's credits). | Medium: an existing workspace starts spending credits on deploy; it can switch sources off. |
| D2-27 | **The nightly pass leaves message bundles and edited steps alone:** it never expires a message bundle's step or a step a person edited as "no longer proposed" (only the 14-day wait does), and no pass or refresh ever replaces a step a person edited or a step of a message bundle with a different proposal (the new item is dropped instead). | None. |
| D2-28 | **"Rejected by"** (D1 follow-up). The bundle gains `rejected_by` (who rejected it), backfilled from its steps' `decided_by`; History shows "Rejected by Carl CSM". | Trivial. |
| D2-29 | **"Save as draft only" starts on** for new `survey.send` and `campaign.send` steps (**Owner**; D1 follow-up). A person turns it off to send on Run. Steps already waiting keep what they have. | Low. |
| D2-30 | **Retry stays available from History on a partly done bundle** (D1 by-eye ruling, recorded; no change). | None. |
| D2-31 | **A campaign step's body may be 5,000 characters**, the campaign page's own limit (`campaigns.models.MAX_BODY`), in the proposal, the edit and the prompt (D1 follow-up). | None. |
| D2-32 | **The schema renders for a signed-out caller.** `GET /api/schema/` and `manage.py spectacular` no longer crash on `AnonymousUser` (`customers/serializers.py`, from 36f6541): an unauthenticated serializer context reads no customers. | None. |
| D2-33 | **The source line** links the ticket in its own tool (`external_url`, a new tab) for ticket sources; for mail it links nothing beyond the record (filed mail shows on the record's page to its readers). | Trivial. |

### 1. Data

#### 1.1 `SignalThread` (new, `services/agents/models.py`)

| Field | Type | Meaning |
|---|---|---|
| `organisation` | FK Organisation, cascade | workspace |
| `source_kind` | `mail`, `slack`, `zendesk`, `freshdesk`, `jira`, `webhook` | the source (`Connector.Provider` values for tickets) |
| `external_id` | char 320 | mail `"<mailbox id>:<thread id>"`; ticket `"<connector id>:<external id>"` |
| `customer`, `account` | FK, nullable, cascade | the record (always one in D2, D2-2) |
| `department` | char 16, blank | the ticket's `department` when touched; `""` for mail |
| `mailbox` | FK `mail.MailboxConnection`, nullable, cascade | mail only |
| `mailbox_owner` | FK User, nullable, cascade | mail only: whose mail it is (the read rule, §5.1) |
| `mail_thread` | char 255, blank | mail only: the provider thread id |
| `ticket` | FK `customers.Ticket`, nullable, cascade | ticket sources only |
| `last_message_at` | datetime | the newest message stored (sync time for a ticket) |
| `processed_at`, `processed_through` | datetime, nullable | when the run last finished with it, and the `last_message_at` it saw |
| `status` | `new`, `waiting_quiet`, `waiting_credits`, `processed`, `skipped` | |
| `skip_reason` | char 24, blank | `skipped`: `no_reader`, `answered`, `resolved`, `source_off`, `ai_off`, `agent_off`, `stale`, `failed`; `waiting_credits`: `budget` or `credits` |
| `agent` | `cs`/`sales`/`ops` or blank | the agent last chosen for it |
| `failures` | small int, default 0 | model calls that failed in a row (D2-25) |
| `claimed_at` | datetime, nullable | a run working on it (a claim older than 15 minutes is free again) |
| `created_at`, `updated_at` | auto | |

Unique `(organisation, source_kind, external_id)` (`signal_thread_once`); index
`(organisation, status, last_message_at)` (`signal_thread_due`). `__str__`: `Signal thread <id>`.
No message text is stored on the thread: the run reads the filed `Email` and `Ticket` rows.

#### 1.2 `AgentBundle` gains

| Field | Type | Meaning |
|---|---|---|
| `thread` | FK `SignalThread`, nullable, set null, `related_name="bundles"` | `source="thread"` bundles |
| `department` | char 16, blank | `routed_to="department"`: the `User.Function` code |
| `has_newer_message` | bool, default false | an edited bundle's thread has a newer message (D2-17) |
| `refreshed_at` | datetime, nullable | the last time its steps were replaced (D2-17, D2-19) |
| `rejected_by` | FK User, nullable, set null | who rejected it (D2-28) |

#### 1.3 `AgentAction` gains

`edited_at` (datetime, nullable): the last saved edit to this step (D2-18), or a run that carried
an edit to it.

#### 1.4 `Organisation` gains

| Field | Type | Meaning |
|---|---|---|
| `ai_signal_interval` | `30m`/`1h`/`4h`/`24h`, default `1h` | D2-21 |
| `ai_signal_sources` | JSON, default `{}` | `{source: bool}`; a missing source reads as on (D2-26) |
| `ai_signals_ran_at` | datetime, nullable | the last intake run's start (D2-21) |

#### 1.5 Migrations

`accounts.0016_organisation_agent_signals` → `agents.0004_signal_thread` (the model, the bundle's
five fields) → `agents.0005_bundle_rejected_by` (data: each `rejected` bundle's `rejected_by` from
its first rejected step's `decided_by`; reverse is a no-op) → `metrics.0016_agent_action_edited_at`.

### 2. Intake

#### 2.1 Sync hooks (no agent work at sync time)

- `services/mail/sync.py file_message`, after it creates the `Email`: `threads.touch_mail(email)`.
  Both Gmail (`gmail_store.store_gmail`) and the other providers (`sync_mailbox`) file through
  it. An email with no `mailbox` or no `thread_id` touches nothing.
- `services/connectors/sync.py file_ticket`: a new ticket → `threads.touch_ticket(ticket)`; an
  existing one → touched only when its title or description changed or it went from resolved or
  closed back to open (D2-1). The inbound webhook files through the same function.
- Touching makes the thread when missing (`status="new"`, or `skipped`/`stale` for an old
  message, D2-22) or moves `last_message_at` forward (never back), refreshes the record and the
  department, and sets `status="new"` when it was `processed` or `skipped`. A mail thread's
  `last_message_at` is the email's `sent_at` (never later than now); a ticket's is the sync time. It is one `update_or_create`
  inside the sync's own transaction; it never calls a model and never reads settings.

#### 2.2 `run_agent_signals` (management command)

`python manage.py run_agent_signals [--organisation <id>]`, every 15 minutes (D2-21). For each
active workspace with any thread, in its own `try` (D2-25):

1. **Due?** `ai_signals_ran_at` is null or at most `now - interval + 2 min`. Claim:
   `UPDATE ... SET ai_signals_ran_at = now WHERE pk = id AND ai_signals_ran_at IS NOT DISTINCT FROM
   <read value>`; 0 rows → another run has it, skip.
2. **Quiet:** threads with `last_message_at > now - 15 min` and new messages become
   `waiting_quiet` (one UPDATE). They wait.
3. **Pick** (D2-22): new messages, quiet for 15 minutes, not claimed (or claimed over 15 minutes
   ago), oldest `last_message_at` first, at most 25. Each is claimed with a conditional UPDATE.
4. **Per thread**, in order: stale (D2-22) → skipped; source off, AI off → skipped (D2-23);
   answered or resolved → skipped (`answered`, `resolved`; D2-15); route (D2-5; mail with no reader → skipped
   `no_reader`); choose the agent (D2-10); agent off → skipped `agent_off`; the agent's budget
   used → `waiting_credits`/`budget`; the thread's waiting bundle edited → set
   `has_newer_message`, processed (D2-17, no call); else build the context (D2-13), one model call
   (`BudgetExceeded` → `waiting_credits`/`credits`; a failed call → `failures + 1`, released), and
   place the answer (D2-14, D2-16, D2-17). Every finished thread: `processed_through =
   last_message_at` as read when it was picked, `processed_at = now`, `claimed_at = null`,
   `failures = 0`. A message that arrived during the call leaves the thread due again.
5. **Notify** (D2-24) the bundles this run made or re-dated.
6. One audit entry per workspace run: `agent_signals.run` (no actor; counts per outcome).

#### 2.3 Placing an answer

Each answer item is checked exactly as the nightly pass checks it (`run._consider`: kind
allowed and not Never, evidence quoted from this record's own lines, payload valid, placeholders,
the mention checks), with D2-11 (never Auto) and D2-12 (the thread may be cited). The steps go
into the thread's bundle: `source="thread"`, `thread`, `agent`, the record, `routed_to`,
`routed_user` (the owner when `owner`), `department` (when `department`), `title`/`reason` from
D2-14. Audit `agent_bundle.made` (new) or `agent_bundle.refreshed` (`by_run: true`, steps removed
and added); never message text.

### 3. Shapes

#### 3.1 Bundle (D1 §4.1) gains and changes

```json
{
  "source": {
    "kind": "thread",
    "label": "Zendesk",
    "channel": "zendesk",
    "from": "ann@pizzahut.com",
    "messages": 1,
    "last_message_at": "2026-10-13T09:58:12Z",
    "ticket": "ZD-1042",
    "link": "https://acme.zendesk.com/agent/tickets/1042"
  },
  "department": null,
  "has_newer_message": false,
  "refreshed_at": null,
  "rejected_by": null,
  "can_refresh": true
}
```

- `source`, nightly: `{"kind": "nightly", "label": "Nightly review", "channel": null, "from": "",
  "messages": 0, "last_message_at": null, "ticket": null, "link": null}`.
- `source`, thread: `label` is `Email`, `Slack`, `Zendesk`, `Freshdesk`, `Jira` or `Webhook`;
  `channel` the `source_kind`; `from` the newest received message's sender address for mail, the
  ticket's requester email (else requester name, else `""`) for a ticket; `messages` the thread's
  filed emails for mail, 1 for a ticket; `last_message_at` the thread's; `ticket` the ticket
  number or null; `link` the ticket's `external_url` or null (D2-33). *As built:* a bundle whose
  thread is gone (its record was deleted) is 404 and hidden for everyone, so the plan's "Message"
  block for a gone thread is never served.
- `department`: `{"key": "cs", "label": "Customer Success"}` when `routed_to="department"`, else
  null.
- `for`: unchanged (the record's current owner, or `routed_user` in History); null for a
  department or Unassigned bundle on an ownerless record.
- `has_newer_message`: the stored flag (D2-17).
- `rejected_by`: `{"id", "name"}` or null (D2-28).
- `can_refresh`: `status == "waiting"`, `source.kind == "thread"` and `can_run`.

#### 3.2 Step (D1 §4.2) gains

`"edited": true|false` (`edited_at` is set). `can_run`/`disabled_reason` follow D2-6.

#### 3.3 Feed item for a bundle (D1 §4.3)

`detail.source` gains `channel` (null for nightly), and a message bundle's `label` names the
channel as §3.1 (`"Email"`, `"Zendesk"`, ...; nightly stays `"Nightly review"`). `detail` also gains `routed_to` (`owner`,
`department` or `admins`) and `department` (`{"key", "label"}` or null, as §3.1), so a row in a
department or Unassigned queue can say where it waits. Rows in those queues carry `for` as §3.1.

### 4. Routes

#### 4.1 `PATCH /agents/bundles/<id>/steps/<step_id>/` (new, D2-18)

Body: `{"fields": {...}}`, `{"selected": false}`, or both.

Order of refusals: 404 (`NO_SUCH_BUNDLE`, also for a step of another bundle); 403
`CANT_RUN_STEP` (`"You can't run step 2."`, `step`) when the reader may not decide the step; the
409s of D1 §9.2 when the bundle is not waiting; `409 {"code": "STEP_NOT_WAITING", "detail": "Only
a waiting step can be changed.", "bundle": <Bundle>}`; 400 `{"steps": {"<id>": {"<key>":
["<sentence>"]}}}` for a key not in `editable` (`"This can't be changed here."`), the kind's
`edit` refusals, or `selected` not a boolean (`{"steps": {"<id>": {"selected": ["Choose on or
off."]}}}`); `400 {"steps": ["Send fields or selected."]}` for a body with neither a `selected` key nor a
`fields` object with at least one key (`{}` and `{"fields": {}}` alike).

Under the bundle's row lock, then the step's: the kind's `edit` result replaces the payload (only
when it differs), `selected` is stored, the step's `edited_at = now`, the bundle's `edited_at =
now`, `edited_by = reader`. Audit `agent_bundle.step_edited` (`step`, `fields`: the keys,
`selected`). `200 {"bundle": <Bundle>}`.

#### 4.2 `POST /agents/bundles/<id>/refresh/` (new, D2-19)

No body. Order of refusals: 404; `409 {"code": "NOT_A_THREAD", "detail": "Only a bundle made from
a message can be refreshed."}`; 403 `CANT_RUN` (`"You can't run this bundle."`) unless the reader
may run a waiting step; the 409s of D1 §9.2; then the run's own gates as Run now words them:
`409 AI_OFF` "AI is switched off for this workspace.", `409 AGENT_OFF` "This agent is switched
off.", `409 SOURCE_OFF` "Agents don't read Zendesk messages in this workspace." (the source's
label), `409 BUDGET_USED` "This agent's budget is used up: it resumes on 1 Nov." (with
`resets_on`); `409 NO_READER` "Nobody this bundle is for may read its message any more." (the
record's routing no longer finds a reader, D2-4, D2-5); `429 {"detail": "The workspace has no credits left."}`; `503 {"code":
"REFRESH_FAILED", "detail": "Couldn't refresh the suggestions. Try again."}`; `409 {"code":
"BUNDLE_CHANGED", "detail": "This bundle changed while it refreshed. Review it again.", "bundle":
<Bundle>}`.

The model call is made with no lock held; the result is placed under the bundle's row lock only
if the bundle's `updated_at` is what it was before the call. Then: D2-19's keep set, renumber,
new steps, `has_newer_message = false`, `refreshed_at = now`, the thread's `processed_through =
last_message_at`. Audit `agent_bundle.refreshed` (`by_run: false`, removed, kept, added). `200
{"bundle": <Bundle>}`. A refresh whose answer is "nothing to do" removes the unedited steps and
keeps the edited ones; when nothing is left the bundle is superseded and the answer is that
bundle.

#### 4.3 `POST /agents/bundles/<id>/run/` (D1 §5.1) gains

`409 {"code": "BUNDLE_REFRESHED", "detail": "This bundle was updated with a newer message. Review
it again.", "bundle": <Bundle>}`: the bundle is waiting, has `refreshed_at`, and the body names a
step id that is not one of its steps (D2-20). Checked before the body's 400s. *As built:* a body naming a step id that is not an integer (or is a
boolean) is `400 {"steps": ["List every waiting step once."]}`, not a 500.

#### 4.4 `POST /agents/bundles/<id>/reject/` (D1 §5.3) gains

Stores `rejected_by = reader` (D2-28).

#### 4.5 `GET /work/queues/` (D1 §10.3)

```json
{
  "queues": [
    {"key": "mine", "label": "Mine", "count": 4},
    {"key": "team", "label": "My team", "count": 7},
    {"key": "company", "label": "Rest of company", "count": 12},
    {"key": "department:cs", "label": "Customer Success", "count": 3},
    {"key": "unassigned", "label": "Unassigned", "count": 1},
    {"key": "history", "label": "History", "count": null}
  ],
  "failed": []
}
```

Listed by D2-7 (*as built:* a department or Unassigned queue is listed when an enabled ticket connector exists in that department or without one; no credentials requirement; if the connector read fails, the rail keeps its D1 rows; a bad or stale `cursor` on a queue route is the `400` cursor error); *the Mine `count` leaves out department and Unassigned bundles; only `/work/feed/count/` adds the reader's own department queue (§4.7)*; a department or Unassigned queue's `count` is its readable waiting bundles (no
overdue in these queues); a failed one is `count: null` with its key in `failed`.

#### 4.6 `GET /work/feed/team/?scope=department:<code>|unassigned` (D1 §10.2)

Same shape as a team scope (`scope`, `groups` decide/overdue/suggested, `hidden`, `failed`);
`overdue` and `suggested` are always empty; `decide` holds the queue's waiting bundles (inside
their 14 days, by the bundle read rule; the rest counted in `hidden`), oldest first, with the
same keyset paging (`group=decide&cursor=`). A `department:<code>` with a code that is not a
`User.Function` value: `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose team, company, a
department or unassigned."}`; a queue the reader may not use (D2-7's people rule, not the
connector rule): `403 SCOPE_NOT_ALLOWED`. `?kind=` is parsed as for team scopes and ignored.

#### 4.7 `GET /work/feed/count/` (D1 §10.4)

Shape unchanged; `decide` adds (*as built:* `/work/queues/` Mine does not) the reader's own department queue's count (D2-9). A failure there
adds `bundle` to `failed`.

#### 4.8 `GET /agents/settings/`, `PATCH /agents/settings/`

`GET` gains:

```json
"signals": {
  "interval": "1h",
  "intervals": [
    {"value": "30m", "label": "Every 30 minutes"},
    {"value": "1h", "label": "Every hour"},
    {"value": "4h", "label": "Every 4 hours"},
    {"value": "24h", "label": "Once a day"}
  ],
  "sources": [
    {"key": "mail", "label": "Email filed to a customer", "enabled": true, "connected": true},
    {"key": "slack", "label": "Slack", "enabled": true, "connected": false},
    {"key": "zendesk", "label": "Zendesk", "enabled": true, "connected": true},
    {"key": "freshdesk", "label": "Freshdesk", "enabled": true, "connected": false},
    {"key": "jira", "label": "Jira", "enabled": true, "connected": false},
    {"key": "webhook", "label": "Webhooks", "enabled": true, "connected": false}
  ],
  "last_run_at": "2026-10-13T09:00:02Z"
}
```

*As built:* every source, webhook included, defaults to `enabled: true` (D2-26). `connected`: mail when any mailbox in the workspace is connected; a ticket source when an
enabled connector of that provider has credentials. Each `agents[]` card gains
`"waiting_threads": 3` and `"waiting_reason": "budget"|"credits"|null` (the threads this agent
was chosen for that wait on credits, D2-23; the reason of the most recently stopped one).

`PATCH` accepts `"signal_interval": "4h"` and `"signal_sources": {"slack": false}` (any subset)
with the existing keys; refusals, all at once with the rest:
`{"signal_interval": ["Choose every 30 minutes, every hour, every 4 hours or once a day."]}`,
`{"signal_sources": {"<key>": ["Choose on or off."]}}`, `{"signal_sources": {"<key>": ["Unknown
source."]}}`, `{"signal_sources": ["Send the sources as one object."]}`. Admins only, as today
(`manage_org_settings`). The audit entry `agents.settings_update` lists the two new fields with
their old and new values.

#### 4.9 `GET /agents/bundles/history/` and `GET /agents/bundles/<id>/`

Unchanged routes; message bundles appear under the read rule (§5.1); every bundle carries §3.1.

### 5. Privacy (twice-filter, spec §4.4)

#### 5.1 Who reads a bundle (D1 §8, extended)

D1's rule (record openable, or view-all for workspace-level; no draft reply whose source the
reader can't read) **and**, for a bundle with a `thread`, the reader may read the thread's
source: mail → `chain_visible_q(reader, "mailbox_owner")` over the thread; a ticket source →
`visible_tickets`' department rule over the thread's `department` (Leadership reads every
department). As one `id IN` subquery over `SignalThread`, never a join with DISTINCT; anything
else is 404 and, in a queue, `hidden`.

#### 5.2 In

The model reads only what the bundle's recipient may read (D2-13): the thread (its source is the
recipient's to read by D2-4 and D2-5), the record (the recipient may open it), tasks and notes by
the recipient's rule (the owner's chain; ownerless rows only for a queue bundle), and nothing
from any other record.

#### 5.3 Out

Every step, and the bundle's title and reason, pass the nightly pass's checks before anything is
stored (`foreign_mentions`, `withheld_mentions`, `internal_mentions` for a draft reply,
placeholders refused in customer-facing fields), with D2-12's one change.

### 6. Notifications

`AGENT_PROPOSAL_WAITING` ("Bundles waiting") as D1 §10.6 for owner-routed bundles; D2-24 for
the queues. Message unchanged: "Bundles are waiting for your decision." The intake run calls
both after it commits; a failure is logged and never undoes the run.

### 7. Permissions, audit and performance

- Every new route `IsAuthenticated`; another workspace's bundle is 404. Every visibility filter
  is an `id IN` subquery with `# SOC2:AUTH-02`; every audited write `# SOC2:LOG-01`.
- New audit events: `agent_signals.run` (no actor: `threads`, `made`, `refreshed`,
  `superseded`, `flagged`, `processed`, `skipped`, `waiting`, `failed`), `agent_bundle.made`, `agent_bundle.refreshed`,
  `agent_bundle.step_edited`. `agent_bundle.rejected` gains nothing (the rejecter is the actor).
- **Query ceilings** (pinned by tests that add rows and compare; measured on the branch and
  written into `docs/API_CONTRACTS.md`): `QUEUES_CEILING` re-measured with department and
  Unassigned rows; `DEPARTMENT_QUEUE_CEILING` (`/work/feed/team/?scope=department:cs`, constant
  in rows); `COUNT_CEILING` re-measured; `BUNDLE_DETAIL_CEILING` and `HISTORY_CEILING`
  re-measured with message bundles (the source block is read once per page); `THREAD_RUN_QUERIES`
  (one thread's processing, constant in the number of other threads, records and bundles). No
  query uses `DISTINCT`.

  Measured on the branch (Task 20; `services/agents/tests/test_intake_queries.py`, plus the D1
  tests re-pinned earlier; each constant in rows, none using `DISTINCT`):

  - `QUEUES_CEILING` 42 (was 41): `QUEUE_QUERIES` carl 26, mona 42, alice 41, lee 41 (the rail's
    enabled-connector read).
  - `COUNT_CEILING` 26 (was 23): the badge counts the reader's department queue.
  - `DEPARTMENT_QUEUE_CEILING` 11 (`/work/feed/team/?scope=department:cs`, 1 or 7 bundles).
  - `THREAD_RUN_QUERIES` 32 (33 since D3) (one thread's processing, after the workspace's one-time settings row).
  - Message bundle detail 9 (plan name `MESSAGE_DETAIL_QUERIES`; within `BUNDLE_DETAIL_CEILING` 10).
  - Message bundle History page 9 (plan name `MESSAGE_HISTORY_QUERIES`; nightly `HISTORY_CEILING`
    stays 8 for nightly bundles; a page of message bundles costs one more).

### Changes during the build (as built)

1. A bundle whose thread is gone (its record was deleted) is 404 and hidden for everyone; the §3.1 gone-thread block is never served.
2. Every signal source defaults to `enabled: true`, webhook included (§4.8's example showing webhook `false` was wrong).
3. `/work/queues/` Mine `count` excludes department and Unassigned bundles; only `/work/feed/count/` adds the reader's own department queue.
4. A department or Unassigned queue is listed when an enabled ticket connector exists (no credentials requirement); if the connector read fails the rail keeps its D1 rows.
5. A run body naming a non-integer (or boolean) step id is a `400` "List every waiting step once." (it was a 500); a bad or stale cursor on a queue route is the `400` cursor error.
6. The "Bundles waiting" once-a-day limit is shared between the Mine notice and the queue notices (the same notification kind).
7. Measured ceilings: `THREAD_RUN_QUERIES` 32 (33 since D3); `DEPARTMENT_QUEUE_CEILING` 11; message bundle detail 9 (`BUNDLE_DETAIL_CEILING` 10); a History page with message bundles 9 (nightly `HISTORY_CEILING` 8); `QUEUE_QUERIES` carl 26, mona 42, alice 41, lee 41; `QUEUES_CEILING` 42 (was 41); `COUNT_CEILING` 26 (was 23).
8. Mail evidence for a thread is limited to emails filed on the thread's own record.
9. The feedback log (`GET /metrics/feedback/`, read by view-all users) masks every step of a message bundle as it masks a draft reply: `subject_label` "A suggestion from a message", `before` `{kind, action: null, rationale: ""}`, on run and on reject.
10. A rejected message bundle's title reaches an agent's prompt only on a run or Refresh of that same thread; the nightly pass and every other thread's run read "A suggestion from a message". The reason is a fixed choice's label, never free text.
11. `PATCH /agents/bundles/<id>/steps/<step_id>/` works out the edit again on the step as it is under the lock, so a save or a Refresh's renumbering between the read and the lock is kept. A step a Refresh removed meanwhile answers `409 STEP_NOT_WAITING` with the bundle (never `404 NO_SUCH_ACTION`).
12. The Mine notice and the queue notice each run in their own transaction: a queue notice that fails never undoes the Mine notices.
13. A superseded bundle's `agent_bundle.refreshed` audit counts `removed`, `kept` and `added` as 0 (the renumbering was rolled back). A Refresh removes only waiting steps: the kept steps are numbered 1..k (their placeholders following), a decided step (one the Never sweep expired) moves after them in its old order, and new steps start after the highest position in use.
14. `/work/feed/count/` counts no department queue for a reader whose function is not a queue department. The mail source block's `messages` and `from` count only the thread's emails filed on the thread's own record, as the evidence does.
15. The feedback log stores no note for a message bundle's step (`note: ""`; the reason stays): a reject note is free text that may quote the thread. The bundle's own `reject_note` is unchanged and read under the bundle read rule.

### Agent bundles, delivery 3: outside actions (2026-10-13)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-13-agent-bundles-d3-api.md`; backend and frontend plans `agent-bundles-d3-backend.md` and `agent-bundles-d3-frontend.md`). A bundle's steps can now act outside Revenact: send an email reply from the runner's own mailbox (`mail.send_reply`), reply in Slack (`slack.reply`), create a Jira issue (`jira.create`) and assign one (`jira.assign`). Each tool is Read only or Can act per connection; outside steps are always Ask and can't be undone; each step carries an idempotency key and every Retry looks for an earlier write first; every call is audited; a failed step tells its runner. Delivery 1 and 2's contracts still hold except where this section changes them. New routes, both `IsAuthenticated`: `GET /agents/bundles/<id>/steps/<step_id>/options/<list>/` (section 5.2) and `POST /connectors/<id>/agents/` (section 5.3). Changed: the Step shape (`disabled_link`, `links`, outside `preview` blocks, string `outputs`), `can_reject` (rights only), the Connector shape (`agents` block, in the Connectors section too), the connector OAuth start and callback (browser-bound `__Host-` cookie; the callback and the inbound webhook are in `public_routes`), the `AgentAction.kind` set (23 kinds), History's step-kind filter (D3-27) and `Notification.kind` (`agent_step_failed`, in the Notifications section too). Mail's OAuth uses the same `core/oauth_browser.py`. New settings: `AGENT_TOOL_TIMEOUT_SECONDS`. Section numbers below are the contract's; "as built" notes mark where the code differs from or adds to the plan text.

**As built, in short.** The kinds' step order is section 3; the four kinds' payload, editable fields, outputs, preview and Undo sentence are section 2; the refusal order of the options route is section 5.2's. `services/mail/sync.send_email` was split into `send_via_provider` and `file_sent`; an agent's send files its copy best effort in a savepoint. `set_agents` audits `connector.agent_access` when the switch changes, and on every consent that stores a token (FR-6); disconnecting turns the switch off (FR-7). Measured ceilings (tests pin each; none uses `DISTINCT`):

| Ceiling | Value | Limit |
|---|---|---|
| `OUTSIDE_DETAIL_QUERIES` | 8 (4 and 8 outside steps cost the same) | at most 12 (`BUNDLE_DETAIL_CEILING` 10 + 2) |
| `OUTSIDE_HISTORY_QUERIES` | 7 (constant in rows) | at most 9 (`HISTORY_CEILING` 8 + 1) |
| `OPTIONS_QUERIES` | 8 (constant) | constant |
| `THREAD_RUN_QUERIES` | 33 (was 32: the Jira connector is read once per thread run) | exact pin |

### Decisions narrowing the spec

Where the spec left a choice, the conservative option was taken. Each line says what a person
will notice. **Owner** marks a decision the owner should confirm before the build; the plans are
written to it, and each is one small change if the answer is different.

| # | Decision | Cost if wrong |
|---|---|---|
| D3-1 | **A reply goes from the runner's own mailbox** (spec §7.3) (**Owner**). Whoever presses Run sends from their own connected Gmail (two-way) or Outlook. When the runner is not the person whose mailbox got the email (their manager, say), the reply is a new message from the runner's address, threaded for the customer by `In-Reply-To`/`References` (Gmail; Outlook can't set them, D3-3). IMAP mailboxes can't send agent replies (no reliable Sent-folder lookup for D3-11): the step is disabled. A Retry of a reply is the runner's only, because the lookup reads their mailbox. | Medium: if the owner wants replies only from the mailbox that got the email, the gate gains one rule. |
| D3-2 | **The model never chooses who a reply goes to.** `to` is the newest customer message's sender, `cc` is empty, `subject` is "Re: <subject>"; the model writes the body only (prompt injection can't add a recipient). A person may edit to, cc, subject and body: at most 10 addresses each, one in `to` at least. | Low. |
| D3-3 | **Threading and signature.** Gmail: `In-Reply-To`/`References` from the source (`sync.answering_headers`), Gmail's `threadId` when the runner's mailbox holds the source, and the Gmail send-as signature placed under the body (HTML and text). Outlook: Graph's `sendMail` can't set `In-Reply-To`, so the customer's client threads by subject only, and Graph exposes no signature: none is added. | Low: an Outlook reply looks like a new message in some clients. |
| D3-4 | **Slack posts go to the source thread, or a channel Revenact already reads.** The model proposes `slack.reply` only on a Slack thread, into that thread. A person may move it to another Slack connector's channel (top level there) from the list of enabled Slack connectors that can act and whose department the runner may read (§5.2). No live channel list from Slack: posts never go somewhere Revenact does not read. It posts with that connector's bot token: "as Revenact" when the connector came through Slack sign-in, else as the workspace's own bot, named in the panel. | Low: a person who wants another channel connects it first. |
| D3-5 | **Jira acts as the connection's account** (spec §7.3 "where the tool supports it"): today's Jira connection is one account's API token, so there is no runner's linked account to act as. The panel names the account ("Created in Jira as Jira Bot"); the issue's description ends with "Created by Carl CSM from Revenact." Per-person Jira accounts (OAuth 3LO) are round 2. | Low. |
| D3-6 | **Jira create fields.** Project (default: the connector's configured project, else none and the person must choose), issue type (default: the project's type named "Task", else its first non-sub-task type, resolved at run), summary (≤ 255), description (plain text ≤ 10,000, sent as Atlassian Document Format paragraphs), priority (the model's high/medium/low matched by name at run; none matched leaves Jira's default), assignee (the model names a Revenact member, matched to a Jira user by email at run; a person picks from Jira's assignable list instead). Required fields beyond these (components, versions, custom fields) are not filled: Jira's refusal is shown as a sentence ("Jira says the project SUP needs a component.") and the person picks another project or type, or sets a default in Jira. | Medium: projects with required custom fields need a Jira default. |
| D3-7 | **Jira assign** acts on the source Jira ticket (a thread from a Jira connector) or on `{{step N.ticket_key}}` of an earlier `jira.create` in the same bundle. Only the assignee is editable. Assigning is idempotent by nature: before assigning, the step reads the issue's assignee and does nothing when it is already the one chosen. | None. |
| D3-8 | **Pick lists are read live from Jira through Revenact** (`GET .../options/<list>/`), never from the browser to Jira, for a reader who may run the step; 15-second timeout, no cache, the first 50 (assignees: 20 a search). Reads are logged, not audited. Slack's channel list is local (D3-4). | Low. |
| D3-9 | **Tool permissions are per connector** (spec §7.4): a stored switch, `agents_can_act`, set by people with `manage_integrations`. "Can act" also needs the tool's grant: Slack `chat:write` (Slack sign-in asks for it when the connector came through sign-in and it is configured on the deployment; a pasted token must already hold it, checked with Slack's `X-OAuth-Scopes`); Jira `CREATE_ISSUES` and `ASSIGN_ISSUES` on the project (checked live with `mypermissions`; API tokens have no consent screen). "Read only" turns the switch off; the grant stays with Slack (Revenact never uninstalls). Zendesk, Freshdesk and webhook connectors are always read only in round 1. Mailboxes have no switch: a reply runs only when its runner presses Run, from their own mailbox. | Low. |
| D3-10 | **A blocked step** (no mailbox, tool read only, tool disconnected or gone) shows unticked and disabled with its sentence and a link to Settings › Connections (`disabled_link: "/settings/connections"`). A stale panel that selects it anyway does not refuse the run: the step fails with the same sentence and can be retried once the tool is allowed. `can_reject` follows the reader's rights only, so a bundle with a blocked step can still be rejected. | Low. |
| D3-11 | **Idempotency and lookup** (spec §6.8). Each outside step's key is `b<bundle id>-s<step id>`: the mail header `X-Revenact-Step`, the Slack message's metadata (`event_type: "revenact_step"`), the Jira label `revenact-b<id>-s<id>` (**Owner**: labels are visible on the issue; Jira's issue properties can't be searched without an Atlassian app). **Every Retry of an outside step looks first** (not only after a timeout): Gmail `in:sent after:<first attempt − 10 min>` (up to 100 candidates, paged, their headers read), Outlook Sent Items since then (the key stamped as an extended property, FR-3), Slack the thread's replies (or channel history) since then, Jira `labels = "<label>"`. Found: the step is applied with what was found and nothing is called again. | Low: one extra read per retry. |
| D3-12 | **One outside call, last** (spec §9). A step does its checks and its reads first (the Jira type and priority lookups are reads), then makes its one write. After a successful write the result is recorded in the same transaction; the bookkeeping that follows (filing the sent copy) is best effort in a savepoint and never fails the step. A failure after the write (a crash, a rollback) leaves the step failed or stuck with no result: the next Retry's lookup finds the write. | None. |
| D3-13 | **No answer is not a failure we can trust.** A write that went out and got no answer (timeout, dropped connection) fails the step with "We couldn't confirm …, Retry checks … first." and is never retried on its own. | None. |
| D3-14 | **Audit.** Each outside write and each lookup made by a run or retry writes `agent_outside.call` (actor: the runner; kind, bundle, tool, op, outcome, where, the returned id, the key; never text, names or recipients). A mail send also writes the existing `mailbox.reply` (to, cc, subject: the standing "mail left through a held credential" event). Switches write `connector.agent_access`; a refused OAuth callback writes `connector.oauth_refused`. The `agent_outside.call` row is written in the step's transaction, so a write followed by a crash loses that row; the next Retry's lookup writes one naming the found id. | Low. |
| D3-15 | **The failed-step notice** (spec §8.3, D1 D18): `agent_step_failed`, one per run, retry or settled stuck run that left at least one step failed, to the runner, linking `/work?queue=history&bundle=<id>`. Sent even while the runner watched the panel. | Trivial. |
| D3-16 | **Result links are the server's** (spec §6.6 "History shows their result links"). Each step gains `links` (per reader): D1's app links (task, campaign, survey, segment, scenario, map) and the outside ones, absolute `https` URLs to the tool (the Jira issue, the Slack message). A sent reply's link opens the runner's own mailbox copy, so only the runner gets it. `outputs` keeps its keys for placeholders. | Low. |
| D3-17 | **New outputs and placeholders:** `jira.create` and `jira.assign` make `ticket_key`, `ticket_url`; `slack.reply` makes `slack_ts`, `slack_url`; `mail.send_reply` makes `email_id`. Chips read "Jira ticket from step 1", "Jira ticket link from step 1" (renamed in Slack escalations D4: "Jira key from step N", "Jira link from step N"). Customer-facing fields (a reply's subject and body, a Slack message's text) never hold a placeholder: refused at proposal (D1), refused at edit ("This goes to a customer, so it can't use another step's result."), and never filled at run. So a reply can't quote the Jira key a step before it made (Slack escalations D4, SE4-6: an escalation's Slack reply in a channel not shared outside may carry `{{step N.ticket_key}}` and `{{step N.ticket_url}}` of an earlier step; see that section). | Low: a person types the key after the run, or round 2 relaxes it for Slack. |
| D3-18 | **Who proposes what.** The message intake may propose all four where the thread allows: `mail.send_reply` on a mail thread whose newest message is a customer's; `slack.reply` on a Slack thread; `jira.assign` with `"issue": "source"` on a Jira thread; `jira.create` (and `jira.assign` naming it) wherever the workspace has an enabled, connected Jira connector. The nightly pass may propose `jira.create` and `jira.assign` naming it (no reply: it has no thread). A kind is offered only when its tool is connected (read only or not: a proposal for a read-only tool shows disabled with the link, spec §7.4). One reply per conversation: `draft.reply`, `mail.send_reply` and `slack.reply` share a target per source, so a second is dropped. All four are the CS and Sales agents' (record-level); each is always Ask. | Low. |
| D3-19 | **Text that leaves Revenact passes the out-check of a reply** (twice-filter §4.4). A reply's body and subject, a Slack message's text and a Jira issue's summary and description pass `internal_mentions` (no task, note or plan title, no other source of the record) on top of every existing check; a reply cites only its thread's newest customer message. The prompt says text that leaves Revenact is written from the conversation alone, with no figures, tasks, notes or plans from the record's block. | Low. |
| D3-20 | **The model never picks a Jira project, issue type, Slack channel or recipient:** defaults come from the thread and the connector; people change them in the panel. | Low. |
| D3-21 | **Timeouts.** Slack and Jira calls wait 15 seconds (`AGENT_TOOL_TIMEOUT_SECONDS`); a mail send uses the mailbox's own send timeout (`MAIL_SEND_TIMEOUT_SECONDS`). A run stays synchronous (D1): eight outside steps can take a few minutes; a worker lost mid-run is settled by D1's D15 and its Retry looks first. | Medium: a slow tool makes Run slow. |
| D3-22 | **The connectors' forwarded-link flaw is fixed here,** because "Allow agents to act" starts Slack consent through the same callback. Every connector OAuth start (connect and consent) sets a `__Host-` cookie holding a nonce whose hash is in the signed state; the callback refuses another browser before any code exchange (`?connector=error&detail=Open the link in the browser that started it.`). A consent that comes back for another Slack workspace (another `team_id`) is refused. The callback and the inbound webhook join `public_routes`. The frontend's OAuth starts send credentials. | None. |
| D3-23 | **No new right to run an outside step:** today's `may_decide` (owner, chain, view-all; source readers) decides, plus the tool's switch (admin-held) and, for mail, the runner's own mailbox. | Low. |
| D3-24 | **Can't be undone** (spec §6.6): every outside step is `irreversible`; Undo answers 409 `CHANGED_SINCE` with "This email has been sent." / "This Slack message has been posted." / "This Jira issue has been created." / "This Jira issue has been assigned." | None. |
| D3-25 | **Unmatched items stay unmatched** (**Owner**; D2-2 said "revisit with D3"). Outside steps act on threads that have a record; storing unmatched Slack or Jira items (a new copy of outside text with no record to read it through) is round 2. | Medium: Slack messages from unknown senders still wake no agent. |
| D3-26 | **No loops.** A Jira issue Revenact made (it carries a `revenact-` label) is still synced as a ticket but never touches a thread; a Slack message posted by a bot is never a ticket; a sent reply makes its mail thread "answered" (D2-15). | None. |
| D3-27 | **History's step-kind filter** gains the four kinds (registry order); nothing else changes in History's route. | None. |
| D3-28 | **Never on every other kind still switches an agent off.** Outside kinds are locked to Ask (D1 D21), so they can't be set to Never; an agent whose every other kind is Never is skipped (`no_actions` at night, `agent_off` for a thread) and proposes nothing outside either. | Low. |

### 1. Data

#### 1.1 `Connector` gains (`services/connectors/models.py`; `connectors.0004_connector_agent_access`)

| Field | Type | Meaning |
|---|---|---|
| `granted_scopes` | JSON list, default `[]` | what the tool says Revenact may do: Slack's bot scopes (Slack sign-in's `scope`, or `X-OAuth-Scopes` from `auth.test` for a pasted token); Jira's project permissions found by the last check (`CREATE_ISSUES`, `ASSIGN_ISSUES`, `BROWSE_PROJECTS`) |
| `agents_can_act` | bool, default false | the switch (D3-9) |
| `agents_allowed_by` | FK User, nullable, set null | who switched it on |
| `agents_allowed_at` | datetime, nullable | when |

`config` (non-secret, already serialised) gains: Slack `team_id`, `bot_name`, `via` (`"oauth"` or
`"token"`); Jira `account_name` (the API account's display name). Existing connectors have none of
these until their next connect or switch: a missing `via` reads as `"token"`, a missing name as
the connector's name.

#### 1.2 `AgentAction.Kind` gains (`metrics.0017_agent_action_outside_kinds`)

`mail.send_reply` "Send an email reply", `slack.reply` "Reply in Slack", `jira.create` "Create a
Jira issue", `jira.assign` "Assign a Jira issue" (23 kinds).

#### 1.3 `Notification.Kind` gains (`notifications.0015_agent_step_failed`)

`agent_step_failed` "Agent step failed".

### 2. The four kinds (`services/agents/registry.py`)

All four: `agents=(cs, sales)`, record-level, `max_level="ask"`, `outside=True`,
`irreversible=True`. Payloads below are as stored after the model's answer is checked.

#### 2.1 `mail.send_reply`

| | |
|---|---|
| Model writes | `{"body": <the reply, plain text, ≤ 4,000>}` |
| Stored | `{"email_id": 88, "mailbox_id": 4, "to": ["ann@pizzahut.com"], "cc": [], "subject": "Re: Login loop", "body": "..."}` (`mailbox_id`: the mailbox that got the email, so the panel can say whether the runner's Gmail threads it in place) |
| Offered | a mail thread whose newest message is received with a sender address (D3-18); cites only that message's line |
| Target | `draft:email:<email_id>` (shared with `draft.reply`, D3-18) |
| `current` | the source thread's head (as `draft.reply`): a newer message expires the step ("the record changed since") |
| Editable | `to`, `cc` (lists of addresses), `subject`, `body` |
| `customer_facing` | `subject`, `body` |
| Outputs | `email_id` |
| Preview (per reader) | `{"mail": {"from": "carl@acme.io" or null, "to": [...], "cc": [...], "subject": "...", "excerpt": "<first 280>", "threaded": true}}`. `from`: while waiting, the reader's own sending mailbox (null when they have none that can send); after a run, the address it went from. `threaded`: the mailbox holds the source thread (Gmail threads it in place) |
| Undo | "This email has been sent." |

Edit refusals (field, sentence): `to` empty "Add someone to send it to."; a bad address in `to` or
`cc` "Enter email addresses like ann@example.com."; more than 10 "Send to at most 10 people.";
`subject` blank "Write a subject.", over 255 "Keep the subject under 255 characters."; `body`
blank "Write the reply.", over 4,000 "Keep the reply under 4000 characters."; a placeholder in
`subject` or `body` "This goes to a customer, so it can't use another step's result."

#### 2.2 `slack.reply`

| | |
|---|---|
| Model writes | `{"text": <the reply, plain text, ≤ 3,000>}` |
| Stored | `{"ticket_id": 77, "source_connector_id": 5, "connector_id": 5, "channel": "C0123ABCD", "channel_name": "support", "thread_ts": "1760340000.000100", "text": "..."}` |
| Offered | a Slack thread (its ticket came through a Slack connector) |
| Target | `draft:ticket:<ticket_id>` (shared with `draft.reply`) |
| `current` | the ticket's state, `open` or `resolved` (a ✅ reaction resolves it and expires the step) |
| Editable | `connector_id` (the channel: a Slack connector's id from the `slack_channels` list), `text` |
| `customer_facing` | `text` (Slack escalations D4, SE4-6: an escalation's reply may hold the Jira key and link of an earlier step; see that section) |
| Outputs | `slack_ts`, `slack_url` |
| Preview | `{"slack": {"channel": "#support", "in_thread": true, "as": "Revenact", "excerpt": "<first 280>"}}`; `as` is the connector's `bot_name`, else "the Slack app" |
| Undo | "This Slack message has been posted." |

`thread_ts` always holds the source thread's; it is used only while `connector_id ==
source_connector_id`, so moving the step to another connector posts a top-level message there and
moving it back posts in the source thread again. Edit refusals: `connector_id` not in the reader's
`slack_channels` list "Choose a Slack channel Revenact reads."; `text` blank "Write the message.",
over 3,000 "Keep the message under 3000 characters.", a placeholder "This goes to a customer, so
it can't use another step's result."

#### 2.3 `jira.create`

| | |
|---|---|
| Model writes | `{"summary": <≤ 200>, "description": <plain text ≤ 4,000>, "priority": "high"\|"medium"\|"low", "assignee_id": <member id or null>}` |
| Stored | `{"connector_id": 6, "project": "SUP", "issue_type": {"id": "", "name": "Task"}, "summary": "...", "description": "...", "priority": {"id": "", "name": "High"}, "assignee": null, "assignee_member_id": 12}` |
| Offered | the workspace has an enabled, connected Jira connector: the thread's own when the thread came from Jira, else the oldest one (by id) |
| Target | `jira:create:<summary, casefolded, first 80>` |
| `current` | none (it makes a thing) |
| Editable | `project` (a key), `issue_type`, `priority`, `assignee` (each `{"id", "name"}` from a pick list, or `priority`/`assignee` null), `summary`, `description` |
| Outputs | `ticket_key`, `ticket_url` |
| Preview | `{"jira": {"site": "acme.atlassian.net", "project": "SUP", "issue_type": "Task", "summary": "...", "excerpt": "<first 280 of the description>", "priority": "High" or null, "assignee": {"name": "Priya Shah", "matched_later": true} or null, "as": "Jira Bot"}}`. `matched_later`: the model's member, matched by email when it runs |
| Undo | "This Jira issue has been created." |

An `id` of `""` means "resolve by name when it runs" (D3-6). Choosing an assignee from the list
clears `assignee_member_id`. An explicit `"assignee": null` also clears it (the issue is created unassigned). Changing `project` clears `issue_type`'s id (the name is resolved
again in the new project). Edit refusals: `project` not like `SUP` (`^[A-Z][A-Z0-9_]{0,19}$`)
"Choose a Jira project."; a pick value not `{"id": <≤ 128>, "name": <1..255>}` "Choose from Jira's
list."; `summary` blank "Write a summary.", over 255 "Keep the summary under 255 characters.";
`description` over 10,000 "Keep the description under 10,000 characters."

#### 2.4 `jira.assign`

| | |
|---|---|
| Model writes | `{"issue": "source" or "{{step N.ticket_key}}", "assignee_id": <member id>}` |
| Stored | `{"connector_id": 6, "issue": "SUP-12", "assignee": null, "assignee_member_id": 12}` (or `"issue": "{{step 1.ticket_key}}"`, filled at run) |
| Offered | a Jira thread (`"source"`: its ticket's key) or after a `jira.create` of the same answer |
| Target | `jira:assign:<issue as written>` |
| Editable | `assignee` |
| Outputs | `ticket_key`, `ticket_url` |
| Preview | `{"jira_assign": {"site": "...", "issue": "SUP-12", "assignee": {"name", "matched_later"} or null, "as": "Jira Bot"}}`; an issue still a placeholder is in the step's `placeholders` (chip "Jira ticket from step 1", renamed "Jira key from step 1" in Slack escalations D4) |
| Undo | "This Jira issue has been assigned." |

### 3. Running an outside step

Inside `run_step`'s transaction, with the bundle and the step locked (D1 §5.1.4), in this order:

1. The existing checks: rights (`may_decide`), placeholders filled (never in `customer_facing`
   fields), `stale_reason`.
2. The tool gate (§5.1): blocked → the step fails with the gate's sentence. A Retry of a
   `mail.send_reply` by anyone but its runner fails "Only the person who ran this step can retry it."
3. **A Retry looks first** (D3-11): the tool is asked for a write carrying the step's key since
   the step's first attempt (`result.attempted_at`, else the bundle's `run_started_at`) minus 10
   minutes. Found → step 6 with what was found. Audit `agent_outside.call` `op: "lookup"`,
   `outcome: "found"`, `"not_found"` or `"refused"` (the lookup refused: the step fails with the
   tool's sentence, FR-5).
4. The reads the write needs (Jira's issue type and priority by name, the assignee by email).
5. **The one write.** Refused → the step fails with the tool's sentence (§6) and keeps
   `{"attempted_at", "attempted_by"}` in `result`. No answer → it fails with the "couldn't
   confirm" sentence and keeps the same. Audit `agent_outside.call` `op: "send" | "post" | "create" |
   "assign"`, `outcome: "ok" | "refused" | "unconfirmed"`.
6. Success: the step is applied; `result` holds the ids and links; `outputs` (D3-17) and `links`
   follow. Bookkeeping (filing the sent copy, `mailbox.reply`) in a savepoint; its failure is
   logged and never fails the step.

A generic exception anywhere in an outside step also stores `attempted_at`/`attempted_by` (the
first attempt's time is kept on later ones), so the next Retry looks back far enough.

### 4. Shapes

#### 4.1 Step (D1 §4.2) gains

```json
{
  "disabled_reason": "Allow Revenact to post in Slack.",
  "disabled_link": "/settings/connections",
  "links": [
    {"label": "Open SUP-123 in Jira", "url": "https://acme.atlassian.net/browse/SUP-123", "external": true}
  ]
}
```

- `disabled_reason`: D1's sentences first (source, rights), then the tool gate's (§5.1).
  `disabled_link`: `"/settings/connections"` for a tool gate, else null.
- `links`, per reader, in this order: D1 kinds' app links (labels "Open task", "Open campaign",
  "Open survey", "Open segment", "Open scenario", "Open map"; `external: false`); `jira.create` and
  `jira.assign` "Open SUP-123 in Jira" (`external: true`); `slack.reply` "Open the Slack message"
  (`external: true`); `mail.send_reply` "Open the sent email" (`/communications?source=mailbox:<provider>&message=<id>`,
  `external: false`) for the runner only. Empty unless the step is `applied`. An external URL is
  always `https://slack.com/...` or `https://<site>.atlassian.net/...`.
- `preview` for the four kinds: §2.
- `outputs` may now hold strings (`ticket_key`, `ticket_url`, `slack_ts`, `slack_url`).

#### 4.2 Bundle (D1 §4.1)

`can_reject` is "waiting, and the reader may decide every waiting step" (rights only, D3-10);
`can_run` is unchanged ("the reader may run at least one waiting step", blocked steps excluded).

#### 4.3 Connector (`GET /connectors/`, `GET /connectors/<id>/`) gains

```json
"agents": {
  "kinds": ["slack.reply"],
  "can_act": false,
  "needs": "consent",
  "allowed_by": null,
  "allowed_at": null
}
```

- `kinds`: what agents can do through it in round 1 (`["slack.reply"]`, `["jira.create",
  "jira.assign"]`, else `[]`).
- `can_act`: the switch is on, the grant is held (§1.1), and the connector is enabled, has
  credentials and is not in error.
- `needs` (only when `kinds` is not empty and `can_act` is false): `"consent"` (Slack through
  sign-in, configured on this deployment), `"token"` (Slack with a pasted token), `"permission"`
  (Jira); else null.
- `allowed_by` (`{"id", "name"}`) and `allowed_at`: while the switch is on.

### 5. Routes

#### 5.1 The tool gate (used by the step payload, the run and the pick lists)

| Kind | Blocked when | Sentence |
|---|---|---|
| `mail.send_reply` | the reader (or runner) has no mailbox, or it is disconnected | "Connect your mailbox to send this." |
| | it is IMAP | "Replies can't be sent from an IMAP mailbox yet." |
| | Gmail not two-way, paused or in error; Outlook in error | "Reconnect your mailbox to send this." |
| `slack.reply` | its connector is gone or disabled | "The Slack connection this posts through is gone." |
| | no credentials, or in error | "Reconnect Slack to post this." |
| | not `can_act`, reader has `manage_integrations` | "Allow Revenact to post in Slack." |
| | not `can_act`, anyone else | "Ask an admin to allow Revenact to post in Slack." |
| | its connector's department isn't the reader's to read (a moved step) | "You can't post in #general." |
| `jira.*` | its connector is gone or disabled | "The Jira connection this uses is gone." |
| | no credentials, or in error | "Reconnect Jira to do this." |
| | not `can_act`, reader has `manage_integrations` | "Allow agents to act in Jira." |
| | not `can_act`, anyone else | "Ask an admin to allow agents to act in Jira." |

#### 5.2 `GET /agents/bundles/<id>/steps/<step_id>/options/<list>/` (new, D3-8)

Query: `project` (a key), `query` (≤ 100 characters). Lists per kind: `jira.create`
`jira_projects`, `jira_issue_types` (needs `project`), `jira_priorities`, `jira_assignees`
(`project`, else the step's project; `query`); `jira.assign` `jira_assignees` (by the step's issue,
or for a placeholder issue the producing step's project); `slack.reply` `slack_channels`.

Order of refusals: 404 `NO_SUCH_BUNDLE` (also a step of another bundle); 403 `CANT_RUN_STEP` ("You
can't run step 2.", `step`) when the reader may not decide the step; `409 {"code": "STEP_NOT_WAITING",
"detail": "Only a waiting step can be changed."}` unless the step is waiting, or failed and its
bundle not running; `400 {"list": ["This step has no such list."]}`; `400 {"project": ["Choose a
project first."]}`; `400 {"query": ["Keep the search under 100 characters."]}`; `409 {"code":
"TOOL_BLOCKED", "detail": <the gate's sentence>}` when the connector is gone, disabled or
disconnected (a read-only connector still lists); `409 {"code": "TOOL_REFUSED", "detail": "Jira
refused the login. Reconnect Jira, then try again."}` on a 401 or 403; `502 {"code":
"TOOL_UNREACHABLE", "detail": "Couldn't reach Jira. Try again."}` otherwise.

`200`:

```json
{"options": [{"id": "SUP", "name": "Support", "detail": "SUP"}], "more": false}
```

| List | `id` | `name` | `detail` |
|---|---|---|---|
| `jira_projects` | key | name | key |
| `jira_issue_types` | id | name | `""` (sub-tasks left out) |
| `jira_priorities` | id | name | `""` |
| `jira_assignees` | accountId | display name | email when Jira shows it, else `""` (inactive users left out) |
| `slack_channels` | connector id (as text) | `#<channel_name>` | `"This thread"` for the source connector, else `"A new message"` |

`more`: Jira said there were more than shown. Not audited (D3-8).

#### 5.3 `POST /connectors/<id>/agents/` (new, D3-9)

Body `{"can_act": true}` or `{"can_act": false}`. Needs `manage_integrations` (403 otherwise, the
house sentence); another workspace's connector is 404.

Order of refusals: `400 {"can_act": ["Choose on or off."]}`; `400 {"code": "NO_AGENT_KINDS",
"detail": "Agents can't act in Zendesk yet."}` (the provider's display name); for `true`:
`409 {"code": "NOT_CONNECTED", "detail": "Connect Slack first."}` when it has no credentials, is
disabled or is in error.

`{"can_act": false}` → `200 <Connector>`, switch off.

`{"can_act": true}`, Slack: the token's scopes are read live (`auth.test`'s `X-OAuth-Scopes`) and
stored in `granted_scopes`. Holds `chat:write` → `200 <Connector>`, switch on. Else, `needs ==
"consent"` → `200 {"authorize_url": "https://slack.com/oauth/v2/authorize?..."}` asking for the
connector's scopes plus `chat:write`, with the browser cookie (D3-22); the switch turns on when the
consent comes back with `chat:write`. Else `409 {"code": "SLACK_SCOPE_MISSING", "detail": "This
Slack token can't post. Add chat:write to the Slack app, reinstall it, then reconnect with the new
token."}`. Slack refusing the token: `409 {"code": "RECONNECT", "detail": "Slack refused the
token. Reconnect Slack, then try again."}`; no answer: `502 {"code": "TOOL_UNREACHABLE",
"detail": "Couldn't reach Slack. Try again."}`.

`{"can_act": true}`, Jira: `GET /rest/api/3/mypermissions?permissions=CREATE_ISSUES,ASSIGN_ISSUES,BROWSE_PROJECTS`
(with `projectKey` when the connector has a project); the held ones are stored in
`granted_scopes`. Both `CREATE_ISSUES` and `ASSIGN_ISSUES` → `200 <Connector>`, switch on. Else
`409 {"code": "JIRA_CANT_ACT", "detail": "This Jira account can't create and assign issues in SUP.
Give it those permissions in Jira, then try again."}` ("in your projects" without a project).
401/403: `409 {"code": "RECONNECT", "detail": "Jira refused the login. Reconnect Jira, then try
again."}`; no answer: `502 TOOL_UNREACHABLE` "Couldn't reach Jira. Try again."

Audit `connector.agent_access` (`provider`, `can_act`, `was`, `scopes`) on every change of the
switch, and on every consent that stores a token (`"token_replaced": true` when the switch was
already on; FR-6), with the request.

#### 5.4 Connector OAuth (D3-22)

- `POST /connectors/<id>/connect/` with `{"oauth": true}` and the agents consent (§5.3) set
  `Set-Cookie: __Host-revenact_connector_oauth=<nonce>; Secure; HttpOnly; SameSite=Lax; Path=/;
  Max-Age=900` (over plain http in development: `revenact_connector_oauth`, `Path=/api/v1/connectors/oauth/`).
  The signed state gains `browser` (the nonce's SHA-256) and `purpose` (`"connect"` or `"agents"`).
- `GET /connectors/oauth/<provider>/callback/` (public, `AllowAny`): every answer clears the
  cookie. Order: provider error → `?connector=error&detail=<theirs>`; bad or expired state →
  "This connection link is invalid or has expired."; unknown user or connector → "Unknown
  connector."; **another browser → "Open the link in the browser that started it."**, audited
  `connector.oauth_refused`, before any code exchange; then the exchange. `purpose: "agents"`: a
  different Slack `team_id` than the stored one → "That's a different Slack workspace. Sign in to
  the one this connection reads."; no `chat:write` granted → "Slack didn't grant permission to
  post."; else the token, `granted_scopes`, `team_id` and `bot_name` are stored (the sync cursor
  is kept), the switch turns on, audit `connector.agent_access`, and the browser lands on
  `/integrations?connector=agents_on`.

#### 5.5 Run, retry, undo

Unchanged routes and shapes. New step `error` sentences: §6. Undo of an outside step: `409
CHANGED_SINCE` with the kind's sentence (D3-24).

### 6. Errors (spec §9)

Plain sentences on the step, never codes. `#support` is the channel's name, `SUP` the project,
`SUP-12` the issue, `priya@acme.io` the member's email.

| Tool | When | `error` |
|---|---|---|
| any | a gate (§5.1) | the gate's sentence |
| mail | Gmail's grant lost or a permission missing (the mailbox is paused, as the send routes do) | "Your Gmail connection expired. Reconnect it, then Retry." |
| | Outlook's token refused | "Your Outlook connection expired. Reconnect it, then Retry." |
| | rate limited | "Your mailbox is busy. Retry in a minute." |
| | any other refusal | "Your mailbox didn't accept the message. Retry it." |
| | no answer | "We couldn't confirm the email went out. Retry checks your Sent mail first." |
| | a Retry by someone else | "Only the person who ran this step can retry it." |
| Slack | `not_in_channel` | "Slack refused the post: the app isn't in #support." |
| | `channel_not_found` | "Slack can't find #support any more." |
| | `is_archived` | "Slack refused the post: #support is archived." |
| | `missing_scope`, `not_allowed_token_type` | "Allow Revenact to post in Slack, then Retry." |
| | `invalid_auth`, `token_revoked`, `account_inactive`, `not_authed` | "Your Slack connection expired. Reconnect it, then Retry." |
| | `ratelimited` or HTTP 429 | "Slack is busy. Retry in a minute." |
| | `msg_too_long` | "Slack refused the post: the message is too long." |
| | any other | "Slack refused the post. Retry it." |
| | unreachable | "Couldn't reach Slack. Retry it." |
| | no answer | "We couldn't confirm the Slack post. Retry checks the channel first." |
| Jira | 401 | "Jira refused the login. Reconnect Jira, then Retry." |
| | 403 | "The Jira account can't do this in SUP. Give it permission in Jira, then Retry." (`SUP-12` for an assign) |
| | 404 | "Jira can't find the project SUP." / "Jira can't find SUP-12." |
| | 429 | "Jira is busy. Retry in a minute." |
| | 400, a required field | "Jira says the project SUP needs a component." (components "a component", duedate "a due date", fixVersions "a fix version", versions "an affected version", labels "a label", environment "an environment", reporter "a reporter", anything else "another field") |
| | 400 on the assignee | "Jira won't assign SUP-12 to Priya Shah." |
| | 400, anything else | "Jira refused this: <Jira's own first message, ≤ 200 characters>." |
| | no project chosen | "Choose a Jira project, then Retry." |
| | no usable issue type | "Jira has no issue types to use in SUP." |
| | the member isn't a Jira user | "Jira has no user with priya@acme.io. Choose the assignee from Jira's list, then Retry." |
| | an assignment with no assignee | "Choose who to assign it to, then Retry." |
| | unreachable | "Couldn't reach Jira. Retry it." |
| | no answer (create) | "We couldn't confirm Jira made the issue. Retry checks Jira first." |
| | no answer (assign) | "We couldn't confirm Jira assigned the issue. Retry checks Jira first." |

### 7. Notifications

`agent_step_failed` (D3-15): to the run's runner (`bundle.run_by`; a stuck run's runner too), once
per run, retry or settled stuck run that left at least one of its steps failed, `push_on_commit`.

- One failed: `Step 2 failed in “Pizza Hut: login loop”: Jira says the project SUP needs a component.`
- Several: `2 steps failed in “Pizza Hut: login loop”.`
- The title is cut to 120 characters, the message to 500. Link `/work?queue=history&bundle=<id>`.
  No actor. No daily limit. Not sent for an Auto bundle (no runner).

### 8. Privacy (twice-filter, spec §4.4)

- **In:** unchanged from D2 (the model reads only what the bundle's recipient may read). The
  nightly pass's context gains only the workspace's Jira connector id and its configured project
  (no Jira data).
- **Out:** D3-19 for every outside step's text, on top of D1/D2's checks. A reply cites only its
  thread's newest customer message; a Slack reply only its thread; a nightly `jira.create` cites
  only its record's own lines and names no email or ticket of the record (as every non-draft
  nightly step).
- **Who reads:** unchanged (the bundle's read rule). A sent reply's link is the runner's own.
  Pick lists answer only a reader who may run the step.
- **Out of Revenact:** a person's Run is what sends text to a customer or a tool; nothing outside
  is ever written by an Auto step, a nightly pass or the intake.

### 9. Permissions, audit and performance

- Every new route `IsAuthenticated` except the OAuth callback (public, signed state + browser
  cookie). Another workspace's bundle or connector is 404. Every visibility filter is an `id IN`
  subquery with `# SOC2:AUTH-02`; every audited write `# SOC2:LOG-01`.
- **Audit events** (new): `agent_outside.call`, `connector.agent_access`, `connector.oauth_refused`.
  Reused: `mailbox.reply` for a sent reply, `agent_action.approved` / `agent_action.failed` per
  step, the run's and retry's own.
- **Query ceilings** (pinned by tests that add rows and compare; measured on the branch and
  written into `docs/API_CONTRACTS.md` and "Changes during the build"):
  `OUTSIDE_DETAIL_QUERIES` (a waiting bundle with 1 to 8 outside steps of all four kinds: constant
  in the steps; at most `BUNDLE_DETAIL_CEILING` + 2: the page's connectors and the reader's
  mailbox, each read once), `OUTSIDE_HISTORY_QUERIES` (a History page of 50 bundles with applied
  outside steps: constant in rows, at most `HISTORY_CEILING` + 1), `OPTIONS_QUERIES` (the options
  route, constant; outside calls counted apart), `THREAD_RUN_QUERIES` re-measured (the Jira
  connector read). No query uses `DISTINCT`.
- **Settings:** `AGENT_TOOL_TIMEOUT_SECONDS` (default 15).

### 10. Not in this delivery

Zendesk and Freshdesk replies, notes, status and assignee; Jira comments; per-person Jira accounts;
a live Slack channel list; storing unmatched items (D3-25); the fast lane; Auto for any outside
step.

### Changes during the build (as built)

The build records here every change to this contract (with the measured ceilings), and relays each
to the frontend controller.

- CC-1 (2026-10-13): jira.create `"assignee": null` clears `assignee_member_id` (frontend sends it
  for Unassigned).
- CC-2 (2026-10-13), §7 and D3-15: `agent_step_failed` goes to `bundle.run_by`, the person who
  pressed Run. A Retry does not change `run_by`: when someone else retries and the retry fails, the
  original runner gets the notice (the retrier sees the failure in the panel). An Auto bundle has no
  runner and no notice. No shape changes.
- CC-3 (2026-10-13), §9: `THREAD_RUN_QUERIES` re-pinned from 32 to 33. The extra query reads the
  workspace's Jira connector once per thread run (`evidence._jira`). It stays an exact pin; no query
  uses `DISTINCT`.
- Offer rule (Task 17, 2026-10-13), D3-18: an unusable own Jira or Slack connector (gone, disabled,
  no credentials or in error) is not offered. Jira falls back to the workspace's oldest usable
  Jira connector; `"issue": "source"` on `jira.assign` is then refused (the source ticket's
  connector is not the one used). Mail is offered whenever the thread has a customer's email.
- Send split (2026-10-13), D3-12: `services/mail/sync.send_email` is split into
  `send_via_provider` (the provider call) and `file_sent` (filing the copy); `send_email` still
  calls both. An agent's send files its copy best effort in a savepoint (never fails the step).
  Mail's OAuth now also uses `core/oauth_browser.py` (Task 3). No wire change.
- `connector.agent_access` is audited only when the switch's value changes (§5.3 "on every
  change"): off to off, or on to on, writes no row (except a consent storing a token, FR-6). The refusal order of the options route is §5.2's.
- Measured ceilings (Task 18): `OUTSIDE_DETAIL_QUERIES = 8` (a bundle's detail with 4 or 8 outside
  steps, within `BUNDLE_DETAIL_CEILING` + 2 = 12), `OUTSIDE_HISTORY_QUERIES = 7` (a History page of
  bundles whose outside steps ran, within `HISTORY_CEILING` + 1 = 9), `OPTIONS_QUERIES = 8` (the
  options route), `THREAD_RUN_QUERIES = 33`. No query uses DISTINCT.

#### Final review fix wave (2026-10-13)

- FR-1, §3 and D3-1: the runner a reply's Retry is kept to is `result.attempted_by`, else the
  bundle's `run_by` (a run settled as stuck leaves no attempt; a Retry never changes `run_by`).
  Anyone else's Retry fails "Only the person who ran this step can retry it." before any lookup.
- FR-2, D3-12: a person's own Outlook send posts exactly what it did before D3 (`subject`, `body`,
  `toRecipients`); `ccRecipients`, `internetMessageHeaders` and the extended property are added
  only when there is a cc or a header.
- FR-3, D3-11: Outlook stamps the step's key twice: the `x-revenact-step` header and a
  `singleValueExtendedProperties` entry `String {e23288be-0cca-47dd-827b-5634bf469d0f} Name
  x-revenact-step` (Revenact's own MAPI namespace) holding the key. The Retry's lookup reads Sent
  Items with `$filter=sentDateTime ge <since> and singleValueExtendedProperties/Any(ep: ep/id eq
  '<that id>' and ep/value eq '<key>')`, because Sent Items copies usually drop the x-header. The
  owner's live check against a real Outlook mailbox is still open.
- FR-4, D3-11: lookups read more than one page. Gmail follows `nextPageToken` (20 stubs a page) up
  to 100 candidates in all, within the `after:` window; Slack's `find_message` follows
  `response_metadata.next_cursor` for up to 5 pages of 200 and waits `AGENT_TOOL_TIMEOUT_SECONDS`.
- FR-5, §3 and D3-14: a refused lookup writes `agent_outside.call` `op: "lookup"`,
  `outcome: "refused"` (`where` as for its kind: `mailbox <id>`, the Slack channel, the Jira project
  or issue) before the step fails.
- FR-6, §5.3 and §5.4: the consent callback refuses ("Unknown connector.") a state whose user no
  longer has `manage_integrations`. A consent that stores a token is always audited
  `connector.agent_access`, also when the switch was already on (then `"token_replaced": true`);
  the token and the switch are stored in one transaction. Every `connector.agent_access` row
  carries the request (IP, user agent).
- FR-7, §4.3: disconnecting a connector (`DELETE /connectors/<id>/credentials/`) turns the switch
  off: `agents_can_act` false, `agents_allowed_by`/`agents_allowed_at` null, `granted_scopes` `[]`;
  when it was on, `connector.agent_access` is audited with `"disconnect": true`.
- FR-8, §2.2: a Slack post's text is escaped (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`), so model
  text can't ping `<!channel>`, `<!here>` or `<!everyone>`, nor make a link. Since 2026-10-18 a
  `<@U…>` of someone already in the reply's conversation (its writers and the people it names,
  `SlackConversation.messages[].user_id` and `people`) is restored as a real mention; anyone else
  reads "@someone".
- FR-9, §2.2 and D3-11: an unconfirmed Slack post keeps where it went (`result.unconfirmed_in`:
  connector, channel, thread). A failed step moved to another channel looks there first, then where
  it would post now, and posts only when neither holds it. No shape changes.

### Agent bundles, round 2 delivery 1 (2026-10-13)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-13-agent-bundles-r2d1-api.md`). Scope: Gmail, Outlook, Jira and Slack only (R2D1-1); nothing for Zendesk, Freshdesk, the webhook or any other connector. One migration, `metrics.0018_agent_action_jira_comment`. Delivery 3's contract still holds except where this section changes it.

#### `jira.comment` (24th kind, `services/agents/actions/jira_comments.py`)

Comment on a Jira issue. CS and Sales agents, record-level, `max_level` Ask, outside, irreversible. The nightly pass never proposes it (R2D1-2); the message intake may, on a conversation.

- **Kind:** `jira.comment` "Comment on a Jira issue", after `jira.assign`.
- **Model writes:** `{"issue": "source" or "{{step N.ticket_key}}", "body": <plain text, up to 2,000>}`. **Stored:** `{"connector_id": 6, "issue": "SUP-12", "body": "..."}`; a placeholder issue is filled at run and listed in the step's `placeholders` (chip "Jira ticket from step 1", "Jira key from step 1" since Slack escalations D4). Look placeholders up by field, never by index: the list follows the stored payload's jsonb key order.
- **Target:** `jira:comment:<issue as written>`. **Editable:** `body` (blank "Write the comment."; over 4,000 "Keep the comment under 4000 characters."). Not customer-facing (R2D1-3): the body may hold a placeholder, and passes the outside out-check (`internal_mentions`).
- **Preview:** `{"jira_comment": {"site": "acme.atlassian.net", "issue": "SUP-12", "excerpt": "<first 280>", "as": "Jira Bot", "internal": true}}`.
- **Outputs:** `ticket_key`, `ticket_url`, `comment_url`. **Result:** `attempted_at`, `attempted_by`, `comment_id`, `ticket_key`, `ticket_url`, `comment_url`. **Link:** `[{"label": "Open the comment on SUP-12 in Jira", "url": "https://acme.atlassian.net/browse/SUP-12?focusedCommentId=10031", "external": true}]`. **Undo:** "This Jira comment has been posted."
- **What Jira receives:** `POST /rest/api/3/issue/SUP-12/comment` with an ADF body (the text, then a footer paragraph "Posted by <runner> from Revenact · ref b12-s41.") and `properties: [{"key": "sd.public.comment", "value": {"internal": true}}]`, so the comment is internal. The Jira app needs the `ADD_COMMENTS` scope (kept in `Connector.granted_scopes`).
- **Run:** as every outside step (gate, placeholders, a Retry looks first, one write last). The lookup (`GET /rest/api/3/issue/SUP-12/comment?orderBy=-created&maxResults=100`) finds a comment by its ref: the match is the ref followed by the footer's closing period ("ref b12-s41."), so a longer ref never matches a shorter one. Audited `agent_outside.call` `op: "lookup"` (`found`, `not_found`, `refused`) and `op: "comment"` (`ok`, `refused`, `unconfirmed`), `where` the issue key, `returned` the comment id.
- **Errors** (the step's `error`): 403 "The Jira account can't do this in SUP-12. Give it permission in Jira, then Retry."; 404 "Jira can't find SUP-12."; a 400 with an unreadable body "Jira refused this. Retry it."; a 429 "Jira is busy. Retry in a minute."; unreachable "Couldn't reach Jira. Retry it."; no answer "We couldn't confirm Jira added the comment. Retry checks Jira first."; a placeholder issue whose step didn't run "Needs step 1, which didn't run."
- The tool gate's `jira.*` row now covers `jira.comment`. `jira.comment` has no pick list: `GET .../options/<list>/` answers `400 {"list": ["This step has no such list."]}`.

#### Options route: new refusals (R2D1-7)

After `TOOL_BLOCKED`, in order: `409 TOOL_REFUSED` (unchanged), then `409 {"code": "TOOL_NOT_FOUND", "detail": <sentence>}` (Jira answered 404), `409 {"code": "TOOL_BUSY", "detail": "Jira is busy. Try again in a minute."}` (Jira answered 429), then `502 TOOL_UNREACHABLE` (unchanged). The pick lists read a Jira 404 or 429 as a Run does.

#### Connectors: `agents.kinds` and `needs: "reconnect"` (R2D1-10)

`agents.kinds` for Jira is `["jira.create", "jira.assign", "jira.comment"]`. `agents.needs` gains `"reconnect"`. Order: `null` when there are no kinds or it can act; `"reconnect"` when the connector is not usable (gone credentials or in error); then delivery 3's `"permission"` (Jira), `"consent"`, `"token"`.

#### Connector OAuth callback: audit (R2D1-11)

Answers unchanged. A refusal because the person lost `manage_integrations` writes `connector.oauth_refused` with `metadata: {"provider", "reason": "not_allowed"}`, outcome failure, with the request.

#### Assign lookup: `elsewhere` (R2D1-9)

A `jira.assign` Retry's lookup that finds the issue assigned to someone else writes `agent_outside.call` `op: "lookup"`, `outcome: "elsewhere"` (it was `not_found`); `found` still means already assigned as asked. No shape change.

#### `GET /api/v1/mail/connection/`: `connection.signature` (R2D1-15)

`connection.signature` is `{"text": "Carl CSM\nAcme", "editable": true, "source": "revenact"}`: Outlook `editable: true`, `source: "revenact"`, `text` the stored signature as text (`""` when none); Gmail `editable: false`, `source: "gmail"`, `text` the send-as signature as text (`""` when none); IMAP `null`. `MailboxConnection.signature_html` now also holds an Outlook signature.

#### `PATCH /api/v1/mail/connection/` (new)

Auth: `IsAuthenticated`; acts on the caller's own live mailbox only. Body `{"signature": "<text>"}`. Refusals, in order:

| Order | When | Answer |
|---|---|---|
| 1 | no live mailbox | `404 {"detail": "Connect your mailbox first."}` |
| 2 | `signature` missing or not a string | `400 {"signature": ["Write a signature, or leave it empty."]}` |
| 3 | over 1,000 characters | `400 {"signature": ["Keep the signature under 1000 characters."]}` |
| 4 | over 10 lines | `400 {"signature": ["Keep the signature to 10 lines."]}` |
| 5 | Gmail | `409 {"code": "SIGNATURE_IN_GMAIL", "detail": "Change your signature in Gmail. Revenact uses it from there."}` |
| 6 | IMAP | `409 {"code": "NO_SIGNATURE", "detail": "Signatures are for Outlook mailboxes here."}` |
| 7 | Outlook | `200 {"connection": <as GET>}`; `""` clears it |

Trailing spaces per line and blank lines at the ends are dropped. Not audited (R2D1-15). One helper (`services/mail/signing.py`) adds the signature to an agent reply and to a send without a draft; a draft carries its own, and an edited Gmail draft keeps its signature whole (`html.restore_signature`).

#### Outlook replies thread (R2D1-13, R2D1-14)

An agent reply from an Outlook mailbox that holds the original (found by its Message-ID, `$filter=internetMessageId eq ...`) goes through Graph's reply (`POST /me/messages/<id>/reply`), so the customer's client threads it; the step's stamp rides as the extended property only. Graph's reply is used only when the runner's mailbox holds the source AND the To is unchanged (`to == [source sender]`); an edited To, a copy not held, a refused lookup other than a lost grant, or a 404 on the reply falls back to `sendMail` as in delivery 3 (subject threading only), while a lost grant raises. A person's own Outlook replies (Communications send, personal inbox reply) use it too, and Graph answers the sender or Reply-To. The result records whether it threaded. The owner's live check against a real Outlook mailbox is still open.

#### Audit

New: `agent_outside.call` `op: "comment"`; `outcome: "elsewhere"` on a `jira.assign` lookup; `connector.oauth_refused` `reason: "not_allowed"`. `mailbox.reply` unchanged.

#### Measured ceilings (none moved)

| Ceiling | Value |
|---|---|
| `OUTSIDE_DETAIL_QUERIES` | 8 (a waiting bundle with a Jira comment among its outside steps; equal at 5 and 10 steps) |
| `OUTSIDE_HISTORY_QUERIES` | 7 (equal at 1 and 4 bundles) |
| `OPTIONS_QUERIES` | 8 |
| `THREAD_RUN_QUERIES` | 33 |
| `MAILBOX_QUERIES` | 5 for `GET /mail/connection/` on Outlook (Gmail 9), unchanged by `signature` |

No query uses `DISTINCT`. Only `OUTSIDE_DETAIL_QUERIES` and `OUTSIDE_HISTORY_QUERIES` were measured with all five outside kinds.

### Agent bundles, round 2 delivery 2: act as the person (2026-10-14)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-14-agent-bundles-r2d2-api.md`, with its "Changes during the build"; the as-built behaviour below wins). Scope: Jira and Slack, plus the mail N1 gate (R2D2-1). One migration, `connectors.0005_jira_link`. Every change adds a key, a value, a query parameter or a route; none removes or renames one. The Jira link routes are under `connectors` above.

#### Jira steps act as the runner (R2D2-2, R2D2-5, R2D2-11)

`jira.create`, `jira.assign` and `jira.comment` act through the runner's Jira link when it is `linked` and covers the connector's site (calls go to `https://api.atlassian.com/ex/jira/<cloud_id>/rest/api/3/...` with the person's Bearer token); otherwise through the connection's account as before. A step run by someone else acts as the **runner**, never as the step's routed person. The admin's "Allow agents to act" switch still gates every Jira step. Lookups (a Retry's search by label or ref, the assignee read, the email match) and the pick lists use the same seat as the write. Issue and comment links stay `https://<host>/browse/...`. While linking is off (the Atlassian env vars unset) a lost link neither blocks nor acts: every Jira step acts as the connection and the preview says `link: "off"`.

#### Jira previews: `as_you` and `link` (R2D2-10)

`preview.jira`, `preview.jira_assign`, `preview.jira_comment` each gain `as_you` (bool) and `link`, and are per reader:

| Reader | `as` | `as_you` | `link` |
|---|---|---|---|
| link covers the site | link's name | true | `null` |
| no link, linking configured | connection's name | false | `"none"` |
| link for other sites only | connection's name | false | `"other_site"` |
| linking not configured | connection's name | false | `"off"` |
| link lost | connection's name | false | `null` (the step is blocked) |

#### Run: `acted_as`, `jira_account`; new step errors (§3.5, §3.6)

The step's `result` gains `acted_as` (`"person"` or `"connection"`) and `jira_account` (the seat's name). The seat is resolved once per step after the gate. Errors, rows added to delivery 3's table:

| When | `error` |
|---|---|
| a lost link found at run (the refresh was refused) | "Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot." |
| Atlassian unreachable while refreshing | "Couldn't reach Atlassian to use your Jira link. Retry it." |
| 401 acting as the person | "Jira refused your Jira link. Link Jira again, then Retry." |
| 403 acting as the person | "Your Jira account can't do this in SUP-12. Ask a Jira admin for permission, then Retry." |

A 401 or 403 acting as the connection keeps today's sentences. "Jira Bot" is the connection's `account_name`, "the Jira connection" when it has none. The pick lists acting as the person: a 401 answers `409 TOOL_REFUSED` "Jira refused your Jira link. Link Jira again, then try again."; a lost link `409 TOOL_BLOCKED` with the lost sentence; Atlassian unreachable `502 TOOL_UNREACHABLE` "Couldn't reach Atlassian. Try again."; a 403 as the person keeps today's pick-list refusal.

#### The gate: a lost link, private Slack (§3.2, §4.3)

`gates.blocked` for the three Jira kinds, after the connector checks: the reader's link is `lost` (and linking is configured) → `Blocked("Your Jira link stopped working. Link Jira again, or remove the link to act as Jira Bot.", "/settings/connections")`. For `slack.reply` with `unsynced` and `channel_private`, a reader without `manage_integrations` → `Blocked("Only an admin can post in #leads-private, a private channel Revenact doesn't read.")` with no link (nothing to fix in Settings); Reject stays open and `disabled_link` is `null`, so the frontend shows the excerpt.

#### Tokens are refreshed before the run (R2D2-7, R2D2-8)

Atlassian rotates refresh tokens; every refresh stores the new pair at once. `run_bundle` and `retry_step` call `jira_links.warm(runner)` before any step transaction: a link whose access token expires within 15 minutes (`JIRA_LINK_WARM_SECONDS = 900`) is refreshed in its own committed transaction under `select_for_update`. A step finding its token expired anyway refreshes inline under the same lock; if that step then rolls back, Atlassian's 10-minute reuse interval lets the old refresh token be exchanged again. The pick lists refresh in their own transaction. Only `invalid_grant` (or `unauthorized_client` whose description names the refresh token) loses a link (`jira.link_lost`); any other refusal reads as "Couldn't reach Atlassian to use your Jira link. Retry it." and the link is kept.

#### Options route: the live Slack list (§4.1)

`GET /agents/bundles/<id>/steps/<step>/options/slack_channels/?live=1&query=esc`:

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

- Without `live=1`: today's answer exactly (synced rows only, no `note` key); `query` is ignored.
- With `live=1`: the synced rows (filtered by `query`, a case-insensitive substring of the name), then the channels the bot of a Slack connector the reader may post through **is a member of** (Slack's `users.conversations`) that no Slack connector in the workspace syncs, at most 100 rows (synced first, then by name), `more: true` when more matched. A channel some connector syncs appears only as that connector's row, and only to its readers; synced is matched by the channel id alone (a Slack connector made before team ids were stored included), so such a channel is never an unsynced row and can't be chosen or posted to as one. Private unsynced rows only for `manage_integrations`.
- `users.conversations`: `types=public_channel` (plus `private_channel` when the token holds `groups:read`), `exclude_archived=true`, `limit=200`, cursor-paged, at most 5 pages (1,000 channels) per Slack workspace, read through one connector per workspace (the step's source first, else the lowest id; a connector without a stored team id is its own workspace). Cached per connector for 5 minutes (`agents:slack-channels:<id>`: `[{id, name, private}]`, no message text).
- `note` is `null`, or when the live part failed (the synced rows always answer, status 200): "Slack didn't list its other channels. Try again in a minute." (busy, unreachable, other), or "Add channels:read to the Slack app to choose other channels." (`missing_scope`).
- `query` over 100 characters → `400 {"query": ["Keep the search under 100 characters."]}`. Other refusals unchanged.

#### Choosing a channel: `channel_choice` (§4.2)

`slack.reply` `editable` is now `["connector_id", "channel_choice", "text"]`. `fields.channel_choice` is always present: `"<pk>"` for a never-moved step (old payloads included), `"<pk>:<channel id>"` after a move to an unsynced channel. `PATCH` step, `run` and `retry` `fields` accept `{"channel_choice": "6:C0ESCALATE"}` (or `"6"`). If an edit sends both `connector_id` and `channel_choice`, `connector_id` wins. `connector_id` stays editable for the old panel (ints only).

| When (`channel_choice`) | Sentence |
|---|---|
| not a string, or not `<int>` / `<int>:<channel id>` | "Choose a Slack channel from the list." |
| a synced id the reader can't post through | "Choose a Slack channel Revenact reads." |
| an unsynced channel not in the bot's member list | "Choose a channel the Revenact app is in." |
| a private unsynced channel, reader without `manage_integrations` | "Only an admin can choose a private channel Revenact doesn't read." |
| the list can't be read now | "Couldn't check Slack's channels. Try again." |

An unsynced choice is checked against the cached list (read again when the cache is cold) and stores `connector_id`, `channel`, `channel_name`, `channel_private`, `unsynced: true`; it posts as a new top-level message, never in the thread. `preview.slack` gains `synced` (bool); for an unsynced channel `synced: false`, `in_thread: false`, `channel: "#<name>"`. A run of an unsynced step whose channel has since become synced by some connector fails the step with "Choose a Slack channel from the list." (run time only). The post passes the outside out-check (`internal_mentions`) like every Slack post; nothing new reaches a model.

#### Fixes after the live test (2026-10-14)

From the contract's "Fixes after the live test". A live run as a linked person showed every `jira.create` failing: it read `GET /priority/search` (OAuth scope `manage:jira-configuration`, admin only) even with no priority set, and Jira's `401 "Unauthorized; scope does not match"` was worded as a lost link.

- A create step reads priorities only when its priority has a name and no id; no priority is Jira's default (no read, no `priority` field). A named priority is matched against the project's create screen for the step's issue type, `GET /issue/createmeta/{project}/issuetypes/{issueTypeId}` (`read:jira-work`), field `priority` → `allowedValues`; a name it doesn't offer leaves Jira's default.
- `GET /agents/bundles/<id>/steps/<step_id>/options/jira_priorities/` takes a new optional `issue_type` query parameter: the picked issue type's id (digits, as `jira_issue_types` returns it), sent with `project`. With both, the rows are that create screen's priorities (possibly `[]`). Without `project` the step's project is used; without `issue_type` the step's own issue type id is used when the project is the step's and the id is set. Otherwise: the person's seat reads the site-wide `GET /priority` (`read:jira-work`), the connection's seat `GET /priority/search`. A non-digit `issue_type` (or over 18 digits) → `400 {"issue_type": ["Choose from Jira's list."]}`, checked after `list` and only for `jira_priorities`. Row shape unchanged.
- Jira's 401 whose body says "scope does not match", acting as the person: a step fails "Your Jira link can't do this in Jira. Ask your Revenact admin, then Retry."; a pick list answers `409 {"code": "TOOL_REFUSED", "detail": "Your Jira link can't do this in Jira."}`. A pick list's 403 acting as the person now answers the same `409` sentence (was "Jira refused the login. Reconnect Jira, then try again."). Neither marks the link lost; only a refused refresh token does. Any other 401 as the person keeps "Jira refused your Jira link. Link Jira again, then Retry." / "..., then try again.".
- Connecting Jira (and Zendesk, Freshdesk): the site field keeps only the host of a pasted URL, so `alfiee`, `alfiee.atlassian.net` and `https://alfiee.atlassian.net/jira/your-work` all connect `alfiee.atlassian.net`. Only `http(s)`, no user info, one tenant label under the vendor's domain; anything else is refused as before ("'…' is not a valid atlassian.net tenant.").

#### Mail: N1 (R2D2-19)

`mail.send_reply` from a mailbox whose `credentials` are blank (any non-IMAP row, Outlook included) is blocked with `RECONNECT` ("Reconnect your mailbox to send this.") before the status checks, instead of failing inside the send. Order in `agent_send.blocked`: `CONNECT`, `IMAP`, `RECONNECT`, then Gmail and status.

#### Audit

New: `jira.link`, `jira.unlink`, `jira.link_lost`, `jira.link_refused` (reasons `other_browser`, `exchange`, `no_refresh`, `no_site`, `taken`); `agent_outside.call` `metadata.as` (`person` or `connection`) on Jira calls. Reused: `agent_action.approved` / `failed`. No token, name or email in any row.

#### Measured ceilings

| Ceiling | Value |
|---|---|
| `OUTSIDE_DETAIL_QUERIES` | 9 (a reader with a Jira link; constant in rows; was 8) |
| `OUTSIDE_HISTORY_QUERIES` | 8 (a linked reader; was 7) |
| `OPTIONS_QUERIES` | 9 (Jira; was 8) |
| `SLACK_OPTIONS_QUERIES` | 4 (the live list; warm and cold cache equal) |
| `JIRA_LINK_QUERIES` | 2 (`GET /connectors/jira-link/`) |

The page's Jira previews read the reader's link with one query per reader (`bulk.Bulk.jira_link`); the gate and the run read it through the same helper. No query uses `DISTINCT`.

### Agent bundles, round 2 delivery 3: wider intake (2026-10-14)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-api.md`, with its "Changes during the build"; the as-built behaviour below wins). Scope: Slack and Jira messages that match no customer wait for a person in "Needs a customer" instead of being dropped; an admin may turn on a fast lane that reads urgent threads sooner; connector changes are audited. An unmatched item is never sent to a model. No new env var, no new OAuth scope.

#### Storing (sync)

`services/connectors/unmatched.py:keep(connector, remote)` is called by `file_ticket` when no customer or account matches a Slack or Jira item (R2D3-1). The sync's note and counts are unchanged. A dismissed row is never kept again (a later sync only moves its `last_seen_at`); a resolved or closed remote deletes any waiting row; an item is not kept when the connector is off, has no credentials or its source is switched off for agents, when it was made by Revenact, when it had no activity in the last 7 days, or when the sender is a member of the workspace; at most 500 waiting rows per connector. A kept row holds a plain excerpt of at most 2,000 characters, the sender's name and email, the link, the priority and the connector's department at storage time. When a later sync does match the item, the Ticket is made as before and the row is deleted. `sync_tickets` deletes rows 30 days after they were last seen (`unmatched.purge`, at the end of a full pass, not for `--connector`), audited as `unmatched.purged`. An item that fails to keep (a database error, say) is skipped inside its own savepoint and its class name logged; the rest of the batch is still filed. One connector's unexpected error no longer stops the pass: its class name is logged, the connector counts as needing attention, the rest carry on and the purge still runs.

#### `GET /api/v1/work/unmatched/?queue=department:cs&cursor=`

`queue` is `department:<code>` or `unassigned` (required); only a queue the reader may use. Waiting rows, newest `last_seen_at` first then id descending, 25 a page, `next` an opaque keyset cursor or `null`.

```json
{
  "queue": "department:cs",
  "count": 3,
  "items": [
    {
      "id": 41,
      "source": "jira",
      "connector": {"id": 6, "name": "Jira SUP"},
      "number": "SUP-31",
      "title": "Export fails for the whole team",
      "text": "Since this morning nobody on our side can export ...",
      "from": {"name": "Ann Lee", "email": "ann@newco.io"},
      "url": "https://alfiee.atlassian.net/browse/SUP-31",
      "priority": "critical",
      "opened_on": "2026-10-14",
      "last_seen_at": "2026-10-14T09:12:00Z",
      "deletes_on": "2026-11-13",
      "can_add_contact": true
    }
  ],
  "next": null
}
```

`text` is the stored excerpt. `from.email` may be `""`, and is always `""` for a Slack row (see "Needs a customer" under Slack escalations). `can_add_contact` is true when there is an email and no contact in the workspace has it. `deletes_on` is `last_seen_at` plus 30 days, in the workspace's date.

| When | Answer |
|---|---|
| `queue` missing, not a department or `unassigned`, or an unknown department | `400 {"code": "SCOPE_UNKNOWN", "detail": "Choose a department or unassigned."}` |
| a queue the reader may not use | `403 {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}` (today's queue refusal) |
| a cursor that doesn't parse or belongs to another queue | `400 {"cursor": ["That list has changed. Reload Work."]}` |

#### `POST /api/v1/work/unmatched/<id>/match/`

Body `{"customer_id": 4}` or `{"account_id": 9}`, and optional `"add_contact": true`. `200`:

```json
{
  "ticket": {"id": 812, "number": "SUP-31", "record": {"type": "customer", "id": 4, "name": "Newco"}},
  "contact_added": true
}
```

The ticket carries the connector's department; the item's thread joins the next run like any ticket. `contact_added` is false when `add_contact` was false or a contact with that email already exists. Refusals, in this order:

| Order | When | Answer |
|---|---|---|
| 1 | no waiting or dismissed row with that id in the workspace, or the reader may not use its queue | `404 {"detail": "Not found."}` |
| 2 | not exactly one of `customer_id` / `account_id`, or not a whole number | `400 {"record": ["Choose one customer or account."]}` |
| 3 | `add_contact` present and not a boolean | `400 {"add_contact": ["Choose on or off."]}` |
| 4 | the record is not one the reader may open | `400 {"record": ["Choose a customer or account you can open."]}` |
| 5 | the connector doesn't cover it | `409 {"code": "NOT_COVERED", "detail": "Jira SUP doesn't cover Newco. Choose another, or change the connection in Settings."}` |
| 6 | `add_contact` true and the item has no email | `400 {"add_contact": ["This message has no sender email to add."]}` |
| 7 | the row was matched, dismissed or deleted meanwhile (checked again under the lock), or a Ticket for it exists | `409 {"code": "GONE", "detail": "Someone else dealt with this message. Reload the list."}` |

Done: `ticket.matched` audited.

#### `POST /api/v1/work/unmatched/<id>/dismiss/`

Body `{}`. `200 {"dismissed": true}`; `404` and `409 GONE` as above. The row stays as a tombstone, so a later sync never brings it back: its title, excerpt, sender name and sender email are blanked at once, with no undo; its number, link, priority, department, external id and dates stay. While the source still reports the item, each sync moves the tombstone's `last_seen_at`, so it is purged 30 days after the item goes quiet. Audited `unmatched.dismissed`.

#### `GET /api/v1/work/queues/` gains `needs_customer`

Every row has `needs_customer`: the count of waiting unmatched items for a department or Unassigned queue, `null` for Mine, My team, Rest of company and History. A routed queue whose count fails keeps its `count`, answers `needs_customer: null` and is logged; the rail never fails for it.

#### `GET /api/v1/agents/settings/` gains `signals.fast_lane`

```json
{
  "on": false,
  "rules": {
    "jira_priority": true,
    "slack_connectors": [6],
    "senders": ["ceo@bigco.com", "@bigco.com"],
    "words": ["outage", "data loss"],
    "poor_health": false
  },
  "per_hour": 10,
  "per_day": 50,
  "used_hour": 1,
  "used_day": 3,
  "limits": {"per_hour": 10, "per_day": 50, "senders": 50, "words": 20},
  "slack_choices": [{"id": 6, "name": "Slack #support"}]
}
```

Off by default. `slack_choices` are the workspace's enabled Slack connectors. `used_*` count the workspace's successful fast-lane model calls in the last hour and 24 hours (`ModelCall` rows with `scope_key = "fast_lane"`); a fast-lane call is charged as an agent call.

#### `PATCH /api/v1/agents/settings/` with `fast_lane`

`{"fast_lane": {"on": true}}`, `{"fast_lane": {"rules": {"words": ["outage"]}}}` or `{"fast_lane": {"per_hour": 5}}`: keys present merge over the stored ones (a list replaces the stored list). Errors come back with the page's others at once, under `fast_lane`. `manage_org_settings` only ("Only admins can change the agents."); the page answers the whole settings payload. Words are trimmed and lower-cased, duplicates dropped; senders are lower-cased.

| Key | When | Sentence |
|---|---|---|
| `fast_lane` | not an object | "Send the fast lane as one object." |
| `rules` | not an object | "Send the fast lane as one object." |
| any | unknown key | "Unknown setting." |
| `rules.<key>` | an unknown key inside `rules` | "Unknown setting." |
| `on`, `rules.jira_priority`, `rules.poor_health` | not a boolean | "Choose on or off." |
| `rules.words` | not a list, or more than 20 | "Add at most 20 words." |
| `rules.words` | an entry not 2 to 40 characters after trimming | "Use 2 to 40 characters for each word." |
| `rules.senders` | not a list, or more than 50 | "Add at most 50 senders." |
| `rules.senders` | an entry not an email address or `@domain`, or longer than 254 characters | "Use an email address or @domain for each sender." |
| `rules.slack_connectors` | not a list of the workspace's Slack connector ids | "Choose Slack connections from the list." |
| `per_hour` | not a whole number 0 to 10 | "Choose a whole number from 0 to 10." |
| `per_day` | not a whole number 0 to 50 | "Choose a whole number from 0 to 50." |
| `per_hour` | more than `per_day` after merging | "The hourly limit can't be more than the daily limit." |

The merge uses the stored `per_hour` (default 10): to lower `per_day` below 10, send `per_hour` with it, or the page answers the last sentence under `per_hour`.

#### The fast lane run

Rules (`services/agents/fast_lane.py:rule_for`, first match in this order, only when the lane is on; the result is stored on the thread as `urgent_rule` when the message is filed): `slack_channel` (a chosen Slack connector), `jira_priority` (the Jira issue's priority is critical), `sender` (the sender or its `@domain` is listed), `word` (a listed word in the title or subject plus the first 2,000 characters of the text), `poor_health` (the record's health is Poor). Tickets use the requester's email as the sender, mail the from address.

`intake.run_fast` reads an urgent thread once it has been quiet for 2 minutes, on a 5-minute tick (claimed on the workspace, so overlaps cost nothing), at most 10 threads per tick and within `per_hour` and `per_day` (counting the calls already made). A thread waiting for credits, or whose last read failed, is left to the interval run. A fast read is the same one call, the same evidence and the same routing as an interval read; only when it is read changes. Its `ModelCall` has `scope_key = "fast_lane"`.

`python manage.py run_agent_signals [--organisation N] [--lane interval|fast|both]` (default `both`) prints one line per lane: `read 3 thread(s): ... (interval)` and `fast lane: read 1 thread(s) in 1 workspace(s), 0 capped`. Each lane runs in its own guard: a crash in one prints `<lane> failed: <ClassName>` to stderr, the other lane still runs, and the command exits non-zero. Production runs the command every 5 minutes (`agentsignals`); the interval run decides by each workspace's own interval. Run one `agentsignals` process per deployment: overlapping fast ticks could pass the hourly cap.

`agent_signals.run`'s audit gains `lane` and, on a fast tick, `capped`. A fast tick writes its row only when it read a thread or was capped with urgent threads waiting. `capped` is true when `per_hour` or `per_day` stopped urgent quiet threads, whether the tick read some or none (not when only the per-tick limit of 10 stopped them).

#### Connector audit (F2/F3)

`PATCH /connectors/<id>/` writes `connector.update` with `changes` `{field: {old, new}}` for `name`, `is_enabled`, `department`, `customer_ids`, `account_ids` (ids only), only when one changed. `POST /connectors/` writes `connector.create` (`provider`, `department`). `DELETE` writes `connector.delete` (`provider`, `tickets_kept`). No response shape changes.

#### F1: Jira request types not built

The owner's live checks LC-F1a and LC-F1b were not reported as passed, so there is no `request_type` field on `jira.create`, no `jira_request_types` pick list and no new step errors. Jira Service Management: an issue an agent creates has no request type; set one in Jira so it shows in the portal and in request-type queues.

#### Changes during the build (as built)

- Lowering `per_day` below the stored `per_hour` is refused as above; send both together.
- An urgent thread waiting for credits, or with a failed last read, is not read by the fast tick.
- `capped` on a fast tick is also true when the hour or day limit stopped further threads (see above).
- The interval command line now ends with ` (interval)`.
- F1 not built (above).
- `sync_tickets` carries on past one connector's unexpected error and purges at the end of a full pass.
- A dismissed item's tombstone lives while the source still reports the item: a sync moves its `last_seen_at` (no text), so it is purged 30 days after the item goes quiet.
- An item that fails to keep is skipped in its own savepoint and its class name logged; the rest of the sync batch is still filed.
- Run one `agentsignals` process per deployment: overlapping fast ticks could pass the hourly cap.

#### Measured ceilings

| Ceiling | Value |
|---|---|
| `UNMATCHED_LIST_QUERIES` | 5 (constant in rows and pages) |
| `UNMATCHED_MATCH_QUERIES` | 22 |
| `SETTINGS_QUERIES` | 25 (`GET /agents/settings/`, with the lane's counts and Slack choices) |
| `FAST_TICK_QUERIES` | 8 (per workspace with nothing urgent) |
| `THREAD_RUN_QUERIES` | 33 (unchanged) |
| `QUEUE_QUERIES` | unchanged: carl 26, mona 42, alice 41, lee 41 |
| `ROUTED_QUEUE_QUERIES` | carl 32 (with a CS connector) |

No query uses `DISTINCT`. Owner set-up: production needs the `agentsignals` service (every 5 minutes) in revenact-infra; no new env var, no new OAuth scope.


### Slack escalations, delivery 1: Slack as a conversation (2026-10-15)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-15-slack-escalations-d1-api.md`, with its "Changes during the build"; the as-built behaviour below wins). Scope: a Slack thread is a conversation (`customers.SlackConversation`), never a ticket. No new env var, no new Slack scope (`reactions:read` stays in `SCOPES`, unused).

#### Data

- `customers.SlackConversation` (`customers.0062_slackconversation`): exactly one of `customer` / `account`, `connector` (SET_NULL), `department`, `channel`, `channel_name`, `thread_ts`, `title`, `messages` (at most 50: the top message and the newest 49 replies, each `{ts, user_id, name, text, bot}`, plus `ours` on a reply read from Slack (true only for our own bot's post), text cut at 3,000 characters), `latest_reply`, `started_by` / `started_by_name` / `started_by_email`, `url`, `last_message_at`, `matched_by` (`channel`, `name`, `person`, `earlier`), `external_shared`. Unique on `(connector, thread_ts)` (replaced in delivery 3: unique on `(connector, channel, thread_ts)`).
- `agents.SignalThread.conversation` (`agents.0007`), `connectors.UnmatchedItem.candidates` (`connectors.0007`, at most 5 `{type, id}`), and the data migration `agents.0008_slack_tickets_to_conversations`: every ticket of a Slack connector becomes a conversation (`matched_by="earlier"`), its thread and every `slack.reply` step point at it (`conversation_id`, target `draft:conversation:<id>`), the ticket is deleted. Forwards only; a waiting `draft.reply` on such a ticket reads "changed" (expires) and cannot apply.

#### Sync

**Replaced in delivery 3** (below): a connection is every public channel, not one; messages arrive by Slack's Events API; the 7-day multi-page read and up to 50 reply reads a pass became a catch-up of one history and one replies call a pass; connect no longer checks a channel. As built in delivery 1: each pass reads top messages of the last 7 days (no subtype, no bot post, text required) and `conversations.replies` for threads whose `latest_reply` changed (stored threads first, then new, oldest first, at most 50 a pass). The customer, first hit wins: the connection covers exactly one customer or account (`channel`); exactly one covered record named in the top message (`name`, whole-word, case-folded, a trailing "(QA)" / "Inc" / "Ltd" / "LLC" ignored, an account dropped when its own customer matches too); otherwise the thread is kept in Needs a customer with up to five `candidates` (two similar names file nothing). The poster's email is never used to find the customer. A reply also sent to the channel (`thread_broadcast`) is a reply. One thread's failed `conversations.replies` read leaves that thread as stored (read again next pass); `ratelimited` stops reading replies for the rest of the pass; a revoked token or a failed history page fails the pass. A thread is touched for the agents only when a human message not stored before arrives (another app's post is not human). Connect records the bot's `config.bot_id` and `config.bot_user_id`; only that bot's posts are ours ("we wrote" in the agent block, and they make a thread answered); another app's reply keeps its own name. Connect (`POST /connectors/<id>/connect/`) answered `400 {"detail": "Invite the bot to #<name> first, then connect."}` when the bot was not in the channel (removed in delivery 3: connect takes no channel).

#### `GET /api/v1/slack-conversations/<id>/`

Auth: `IsAuthenticated`. `200` `{id, record: {type, id, name}, channel: "#<name>", url, title, started_by: {id, name}, matched_by, messages: [{ts, name, at, text, bot}]}`. `404 {"detail": "Not found."}` when there is no such conversation in the workspace (the lookup itself is filtered to the reader's organisation), the reader may not open its record, or `visible_conversations` refuses it (Leadership all; otherwise the connection's department or none) (the three read the same).

Slack escalations D4 (CC-14): `title` and each message's `text` read a mention `<@U...>` as "@<name>" from the conversation's people (the sync's names); one with no known name stays `<@U...>`. The story's Slack item `title` and the agents' thread lines (so a Slack step's evidence) read the same; stored text is unchanged.

#### The story

`GET /organizations/<id>/story/` (and the account page's) gains kind `slack` in group `conversations` and `source=slack`; counts and search (`title`, poster name, channel name) follow the same rule. An item has `summary` "#<channel>" then "1 reply" or "<n> replies" ("Slack" when the channel name is blank), `actor` the member or the poster's name, `link.url` the thread, and `replies`. Copilot's digest names it "Slack thread" and the count line now reads "(emails, notes, tasks and Slack threads are not counted)", which supersedes the older wording quoted above in the Copilot sections.

#### Needs a customer

`GET /work/unmatched/` rows gain `mentioned` (`[{type, id, name}]`, only records the reader may open; `[]` for Jira); a Slack row has `number` "#<channel>", `from.email` `""` (the poster is a colleague; their address stays stored, to set the conversation's starter on match, but is never sent), `can_add_contact: false`, `priority: "medium"`. `POST /work/unmatched/<id>/match/` answers `{record, ticket, conversation, contact_added}`: for a Slack row `ticket` is null and `conversation` is `{id}`; for a Jira row `conversation` is null and `record` repeats `ticket.record`. A Slack row with `add_contact: true` is refused `400 {"add_contact": ["A Slack message is from a colleague. Match it without adding a contact."]}`; GONE also when a conversation for the row exists. A colleague's Slack message is now kept (only Jira drops a member's item). Audit: `conversation.matched`.

#### Connectors

The connector payload gains `conversation_count` (a Slack connection's conversations); `last_record_at` also takes a conversation's last message day.

#### Agents

`slack.reply` payload holds `conversation_id` (not `ticket_id`); `target` is `draft:conversation:<id>`; `current` is always `open`. The thread block is the newest 8 messages; `draft.reply` is never offered on a conversation. A Slack bundle's `source` block reads the conversation: `from` the poster's name, `messages` the stored count, `link` the thread URL, `ticket` null. A shared Copilot reply quoting a Slack thread is checked against `visible_conversations` (record kind `slack`, SOC2 AUTH-02). The fast lane reads a conversation through `fast_lane.for_conversation`. An agent reads only a filed conversation's own messages; an unmatched row is never read by a model.

#### Changes during the build


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

#### Measured ceilings

| Ceiling | Value |
|---|---|
| `SLACK_CONVERSATION_QUERIES` | 6 (`GET /slack-conversations/<id>/`) |
| `SLACK_SYNC_QUERIES` | 35 (a pass of 3 threads); 36 since the Connections Slack link (the linked members, read once per pass) |
| `UNMATCHED_LIST_QUERIES` | 7 (was 5; constant in rows and pages) |
| Story and grounding | +2 each: organisation story build 26, organisation story endpoint 30, organisation grounding 44, account grounding 36, account story endpoint 26 (was 24) |
| `THREAD_RUN_QUERIES` | 33 (unchanged) |

No query uses `DISTINCT`. Owner set-up: after `migrate`, delete the QA contacts added only for the old poster-email rule; live checks in the contract's section 12.

### Slack escalations, delivery 2: Account team and department heads (2026-10-15)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-15-slack-escalations-d2-api.md`, with its Changes during the build; the as-built behaviour wins). Scope: a department is a function (`User.Function`); each function may have one head per workspace; `ownership.handler_for` says who handles a record in a function. No route calls `handler_for` yet (the escalation bundle, D3, will).

#### Data

- `knowledge.FunctionHead` (`knowledge.0006_functionhead`): `organisation` (CASCADE, `related_name="function_heads"`), `function` (char 16, `User.Function`), `user` (CASCADE, `related_name="function_headships"`), `updated_at`. Unique `one_head_per_function_per_organisation` on `(organisation, function)`. `clean()` (run by `save()`) refuses a person who is deactivated, works in another function, or is not a member of the workspace ("No such member."). Clearing a head deletes its row.

#### `GET/PATCH /api/v1/function-heads/`

`GET` answers `200`, always the six functions in `User.Function` order, to any member:

```json
[
  {"function": "cs", "function_display": "Customer Success", "user": {"id": 3, "name": "Faiz Jamal"}},
  {"function": "engineering", "function_display": "Engineering", "user": {"id": 7, "name": "Jesh Sanghvi"}},
  {"function": "sales", "function_display": "Sales", "user": null},
  {"function": "analytics", "function_display": "Analytics", "user": null},
  {"function": "leadership", "function_display": "Leadership", "user": null},
  {"function": "other", "function_display": "Other", "user": null}
]
```

A head who left, or moved to another function, reads as `null` (stored rows are not deleted). `PATCH {"function": "engineering", "user_id": 7}` (or `"user_id": null` to clear) needs `manage_org_settings` and answers `200` with the same six rows. Refusals, in this order:

| # | Case | Status | Body |
|---|---|---|---|
| 1 | no token | 401 | DRF's |
| 2 | caller lacks `manage_org_settings` | 403 | `{"detail": "You don't have permission to change organisation settings."}` |
| 3 | `function` missing or not one of the six | 400 | `{"function": ["This field is required."]}` / `{"function": ["\"finance\" is not a valid choice."]}` |
| 4 | `user_id` missing (a missing key never clears a head) | 400 | `{"user_id": ["This field is required."]}` |
| 5 | `user_id` is not a member of the caller's workspace | 400 | `{"user_id": ["No such member."]}` |
| 6 | the person is deactivated | 400 | `{"user_id": ["Jesh Sanghvi is deactivated. Pick an active member."]}` |
| 7 | the person works in another function | 400 | `{"user_id": ["Faiz Jamal is in Customer Success, not Engineering. Pick someone from Engineering."]}` |

A refused PATCH changes nothing and writes no audit row.

#### Who handles a record in a function

`services.knowledge.ownership.handler_for(record, function, *, organisation_id=None)` returns `(user | None, via)`, `via` one of `"team"`, `"head"`, `"nobody"`; an unknown function raises `ValueError`. For a customer, Customer Success is the customer's owner, any other function its account-team person (`FunctionOwner`), when on duty (active, and for a function row still working in it): `via="team"`; else the function's head in the customer's own workspace, when on duty: `"head"`; else `(None, "nobody")`. For an account, Customer Success goes to the account's own owner first, when set and active (any function): `"team"`; otherwise an account with exactly one parent customer takes that customer's answer (its owner, then the Customer Success head), and one with none or several parents falls to the function's head. Every other function follows the parent rule. A customer always uses its own workspace's head; `organisation_id` is only the fallback for an account with no parent customer. Only heads of the record's own workspace are ever used, and an off-duty person is skipped (SE2-4).

#### Audit

| Event | Actor | Target | Metadata |
|---|---|---|---|
| `function_head.changed` | user (`manage_org_settings`) | Organisation | `function`, `from`, `to` (user ids or null); written only when the head changes |
| `function_owner.changed` | user (`view_all_accounts`) | Customer | `function`, `from`, `to` (user ids or null; Customer Success is the owner); written only when the person changes |

#### Query ceilings

`FUNCTION_HEADS_QUERIES` 1 (the GET, whatever the number of heads). `handler_for`: a customer's team hit 1, a fallback to the head 2; an account whose Customer Success owner is on duty 1; an account with one parent, another function, a team hit 2, or a head fallback 3; one parent, Customer Success, parent's owner hit 1; account owner off duty then parent's owner 2, then the head 3; two parents, head fallback 2. No query uses `DISTINCT`.

### Slack escalations, delivery 4: the thread decides (2026-10-17)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-17-slack-escalations-d4-api.md`, decisions SE4-1 to SE4-28, with its "Changes during the build"; the as-built behaviour below wins). Scope: a colleague's Slack thread that needs work becomes **one** bundle: the Jira issue, its assignment, a to-do and the reply in the thread, last. The person is the one the thread named (its decision), else the account team (`handler_for`, D2). The people who wrote in the thread may accept that bundle. The issue is filed under the organisation at once and the thread and the ticket are linked both ways. It works on today's one-channel Slack connection (every public channel is D3). No new env var, no new dependency, no new Slack or Jira scope.

#### Data

- `customers.Ticket.conversation` (`customers.0063_escalation_links`): FK `SlackConversation`, SET_NULL, null, `related_name="tickets"`: the Slack thread the issue was made from.
- `customers.SlackConversation.people` (same migration): JSON, default `{}`, `{slack user id: {"name": str, "member": int | null}}` for the thread's posters and the users its messages mention. Filled by the sync: `member` is the member who linked that Slack user (`SlackLink`), else the active member whose login email is that Slack user's email (`users.info`, read at sync, used and dropped). Names only, never an email. At most 30 people resolved a pass; a person already stored with a member is not asked about again.
- A stored Slack message may carry `"via_app": true` (present only when true): our reply posted **as a person** (its metadata carries our step key). It is not new human text (it never wakes an agent), it answers the thread, it reads "we wrote (as \"Tushar Aggarwal\")" in the agent's lines, and it is never a decision or a participant's message. A top-level message carrying our key never starts a conversation. `SlackConversation.external_shared` is now refreshed each pass from the connection's flag.
- `agents.AgentBundle.escalation` (`agents.0009_escalation_participants`): JSON, default `{}` (not an escalation). For an escalation: `{"function", "user_id", "via", "issue", "shared", "first", "decision": {"by", "by_id", "quote", "named", "ts"} | null, "reply"}` and, after a Change, `"changed": true`. `via` is `thread`, `unresolved`, `team`, `head`, `nobody` or `chosen`; `issue` the `jira.create` step's position or null; `reply` the template text the platform wrote, `""` when the model's reply was kept or a person rewrote it.
- `agents.BundleParticipant` (same migration): `bundle` (CASCADE, `related_name="participants"`), `user` (CASCADE). Unique on `(bundle, user)`, index on `(user, bundle)`. Stored only for an escalation bundle; a refresh keeps the bundle and replaces its rows with the refreshed thread's participants.

#### The escalation bundle

An answer to a **Slack conversation** is an escalation when it has at least one action and has a `jira.create`, or names a valid `function`, or carries a decision that passes the checks below. Anything else is placed as before; `"actions": []` (small talk, thanks) makes no bundle.

Steps, in run order: (1) the model's first `jira.create` (its assignee cleared); (2) `jira.assign` of `{{step 1.ticket_key}}` to the person, `if_found`; (3) `task.create` for them, titled "<record name>: <issue summary>" (just the summary when it already starts with the record name, any case), due in 3 days, the issue's priority; then the model's other steps (at most 4; a placeholder naming the issue follows it to its new step, one naming anything else is dropped); then, last, `slack.reply`. Steps 2 and 3 exist only when step 1 was placed. The model's own `jira.assign`, `task.create`, a second `jira.create` or `slack.reply` are dropped. An escalation's `jira.assign` target is `jira:assign:<issue>:c<conversation id>`, so two threads on one record keep their own.

**The person.** The thread's decision first: the model's `"decision": {"message": n, "quote": "...", "assignee": "..."}` is kept only when message n is a person's message (not a bot's, not `via_app`) whose author is an active member of the workspace, the quote (whitespace folded, case ignored) is in that message's text, and the quote is not a bare mention (with every mention, "@name", punctuation and the words cc, fyi, ping, fwiw, see, also, heads, up, +1 removed, a word is left). The quote is stored as people read it (`<@U0FAIZ>` shown as "@Faiz Jamal"), at most 200 characters. A dropped decision is logged as a code. The assignee: a mention resolves through `people`; a plain name matching exactly one thread person resolves as that person (a guest: nobody); else the one active member with that full name, else with that first name; else nobody (`via: "unresolved"`). With no decision: `handler_for(record, function)` (`via` `team`, `head` or `nobody`). The to-do goes to the person only when they may open the record; otherwise its preview names nobody and the run gives it to the record's owner.

**The reply is always there.** The model's reply is kept when it passes every check; otherwise the platform writes the template:

| Case | Text |
|---|---|
| issue, not shared, person | `Thanks <first>. Logged as {{step <k>.ticket_key}} ({{step <k>.ticket_url}}) with <person> (<Function>).` |
| issue, not shared, nobody | `Thanks <first>. Logged as {{step <k>.ticket_key}} ({{step <k>.ticket_url}}).` |
| issue, shared, person | `Thanks <first>. We've logged this with <person> (<Function>).` |
| issue, shared, nobody | `Thanks <first>. We've logged this.` |
| no issue, person | `Thanks <first>. <person> (<Function>) has this.` |
| no issue, nobody | `Thanks <first>. We're looking into it.` |

`<first>` is the thread starter's first name (no name: "Thanks."); `<Function>` is the person's own department label (none: the name alone). The reply's title is "Reply to <first> in Slack" ("Reply in Slack" without a name).

**The reply's key and link (SE4-6, SE4-7).** Only an escalation's reply, in its own thread (same connection, synced), in a channel not shared outside, may carry `{{step N.ticket_key}}` / `{{step N.ticket_url}}` of an earlier `jira.create` or `jira.assign`; its `text` stays editable with them. Any other placeholder there: `"A reply can carry only the Jira key and link of an earlier step."`; in any other reply: today's `"This goes to a customer, so it can't use another step's result."`. "Shared" is the conversation's `external_shared` or the connection's `config.external_shared`. Shared after the proposal (or a Retry whose text already holds the filled key): the step fails with `"This channel is now shared outside your company, so the reply can't carry the Jira link. Take it out, then Retry."`. An escalation's reply keeps `text` in `editable` once moved or shared too, so the person can take the key out and Retry; the edit refuses adding it there. Placeholder labels everywhere: `ticket_key` "Jira key from step N", `ticket_url` "Jira link from step N".

**Running.** A `jira.create` proposed on a Slack conversation's record carries `conversation_id`, `slack_url`, `slack_channel`; its Jira description is the text, then "From Slack: <thread url>", then the footer. When the issue is made (or found by a Retry), a `Ticket` is filed at once on the step's record (connector the Jira connection, key, summary, open, the step's priority, "Unassigned", the connection's department, the issue's url, the runner as requester, today, `conversation` set) unless the connection does not cover the record; a Ticket already there for the key only gains its `conversation`. Filing never fails the step. Then a remote link (`globalId` `revenact-slack-<conversation id>`, title "Slack: #<channel> thread"); refused, unanswered or failing in any other way, the step's `note` is `"Couldn't add the Slack link in Jira. The description has it."` and it still applies. The `jira.assign` with `if_found`: a person picked from Jira's list wins, else the member by login email; no Jira user with that email ends the step `skipped` with the note `"<First name> has no account in Jira, so the issue is unassigned. Their to-do is in Work."` (nothing applied, no outputs, not retryable, audited `agent_action.skipped`; the bundle still ends `done`); nobody at all fails with "Choose who to assign it to, then Retry.". A successful assign writes the person's name on the filed Ticket (only a real name: a picked Jira user without one leaves it). The reply posts as the runner when they linked Slack in the connection's team, else as the bot (unchanged).

#### Shapes

- **Step** gains `note` (string, `""` when none). `preview.slack` gains `as_you` (boolean): when true, `as` is the reader's own name (they have a usable Slack link in the connection's team); else the bot's name.
- **Bundle** (`GET /agents/bundles/<id>/`, history, run, retry, reject, refresh, edit answers) gains `participant_view` (boolean), `record.can_open` (boolean) and `escalation`:

```json
"participant_view": false,
"record": {"type": "customer", "id": 29, "name": "Globex (QA)", "can_open": true},
"escalation": {
  "function": "engineering",
  "function_label": "Engineering",
  "handler": {"id": 11, "name": "Faiz Jamal", "function_label": "Customer Success"},
  "via": "thread",
  "decision": {"by": "Jesh Sanghvi", "quote": "@Faiz Jamal can you take this?", "named": "Faiz Jamal"},
  "can_change": true
}
```

`escalation` is null for any other bundle; `function`/`function_label` `""` when none was named; `handler` null for nobody; `decision` null when the thread decided nothing (it stays after a Change); `can_change` true while the bundle waits and the reader may decide every waiting step 2 or 3. The stored `changed`, `by_id`, `ts`, `reply` are never sent.
- **The participant view.** A reader who reads the bundle only as a participant gets `participant_view: true`, `reason: ""`, every step's `rationale: ""`, `evidence: []`, `record.can_open: false`; they still get the source block, the escalation block and every step's `fields` and `preview`. Every other reader: `participant_view: false`, `can_open: true`. The Work feed row: `record.can_open` and `detail.participant_view`, `detail.reason` `""` in the participant view.
- **Story item `slack`** (`GET /organizations/<id>/story/`, `GET /accounts/<id>/story/`) gains `tickets` (oldest first: `{id, number, status, assignee, url}`; `assignee` null for "Unassigned" or none; `url` only https, else null) and `hidden_links`. **Story item `ticket`** gains `from_slack` (`{id, channel, started_by}` or null; `started_by` the linked member's name, else the Slack name) and `hidden_links`. **`GET /slack-conversations/<id>/`** gains `tickets` and `hidden_links` as the story item. Twice-filter: a linked side is named only when the reader may read it on its own (its department: Leadership, the reader's own, or none) and it is on the same record (the account when it has one, else the customer) as the side being read; otherwise it is counted in `hidden_links`, never named. Copilot's Ask focus on an item carries the same links.

#### `PATCH /api/v1/agents/bundles/<id>/handler/`

Auth: `IsAuthenticated`. The panel's Change. Body `{"user_id": 13}` (any active member of the workspace; `via` becomes `"chosen"`; `function` the body's when it is one of the six, else kept) or `{"user_id": null, "function": "engineering"}` (asks `handler_for` again: `via` is what it returns, `"team"`, `"head"` or `"nobody"`, and `function` is f). `200 {"bundle": Bundle}`. It rewrites the waiting steps 2 and 3 together (a person picked from Jira's list on step 2 is cleared; the to-do names the person only when they may open the record, else it waits for the owner) and, while the reply is still the platform's template, the reply's text; a reply someone rewrote is left alone (and the stored `reply` becomes `""`). It is an edit (`edited_at`, `edited_by`). The decision stays on the block. Any Change is stored with `"changed": true`, so a later Refresh keeps the changed person (a kept person no longer an active member reads `nobody`). Refusals, in this order; a refusal changes nothing:

| # | Case | Status | Body |
|---|---|---|---|
| 1 | no token | 401 | DRF's |
| 2 | the reader may not read the bundle | 404 | `{"code": "NO_SUCH_BUNDLE", "detail": "No such bundle."}` |
| 3 | not an escalation | 409 | `{"code": "NOT_AN_ESCALATION", "detail": "Only an escalation has someone who handles it."}` |
| 4 | the reader may not decide a waiting step 2 or 3 | 403 | `{"code": "CANT_RUN_STEP", "detail": "You can't run step 2.", "step": <id>}` |
| 5 | the bundle is running, ran, rejected, expired or superseded | 409 | the bundle contract's §9.2 body, with `bundle` |
| 6 | neither step 2 nor 3 waits (also when a Refresh replaced them between the check and the lock) | 409 | `{"code": "STEP_NOT_WAITING", "detail": "Only a waiting step can be changed.", "bundle": ...}` |
| 7 | `user_id` key missing | 400 | `{"user_id": ["This field is required."]}` |
| 8 | `user_id` null and `function` missing or not one of the six | 400 | `{"function": ["Choose a department."]}` |
| 9 | not a member of the bundle's workspace | 400 | `{"user_id": ["No such member."]}` |
| 10 | deactivated | 400 | `{"user_id": ["Faiz Jamal is deactivated. Pick an active member."]}` |

A Change writes `agent_bundle.handler_changed`.

#### Participants may accept

A participant is a member found in the conversation's `people` for the author of a message that is not a bot's and not `via_app`. Stored only for an escalation bundle (`BundleParticipant`). A participant may decide every step of that bundle (`decided_as` role `participant`, after the existing roles, instead of the source-read rule), read it (`bundles.readable` adds `id IN` the reader's participant bundles), and finds it in **Work › Mine** while it waits, whatever it is routed to; it is then left out of My team and Rest of company. The tool gate's "You can't post in #x." is not applied to a participant's reply while it still goes to its own thread (moved to another channel, that channel's department rule applies). Change is open to them. Participants are not sent the new-proposal notice. `GET /work/assignees/` stays closed to a participant who can't open the customer (Change is their route). An owner who took part but does not read the Slack connection's department also reads the bundle in the participant view (`can_open: false`); before this delivery they could not read it at all.

#### Send to Revenact keeps the key out of shared channels (SE4-19)

`POST /work/slack-messages/<id>/reply/` with text carrying the row's Jira key (any case), any "<jira host>/browse/" link, or `{issue}` first asks Slack (`conversations.info`, as the person when linked, else the bot) whether the channel is shared outside (`is_ext_shared` or `is_pending_ext_shared`). Shared: `400 {"detail": "This conversation is shared outside your company, so the reply can't carry the Jira link. Take it out, then send."}`. Slack can't say (an error, or no channel object): `400 {"detail": "Couldn't check whether this conversation is shared outside your company, so the reply can't carry the Jira link. Take it out, or try again."}`. Text without the key is posted as before, with no check. The text is never logged.

#### Prompt

For a Slack conversation the thread prompt opens "A colleague raised this in your company's Slack, about the record <ref>: ...", asks for `"function"` and `"decision"`, states the escalation rule (propose a `jira.create` and name the department; the platform adds the assignment, the to-do and the reply; small talk needs `"actions": []`), the decision rule (a request, a statement or a proposal; a bare mention is not one; the newest wins; never guess), and in a shared channel that a reply never carries a Jira key or link. In a channel not shared, with Jira offered, the reply rule allows `{{step N.ticket_key}}` and `{{step N.ticket_url}}` of an earlier `jira.create`. `OUTSIDE_RULES["slack.reply"]` reads "A slack.reply answers the colleague in their thread: say what was done and who has it." The model reads every stored Slack message (at most 50, 600 characters each; mail and tickets keep 8), then `slack people: <@U0FAIZ> is "Faiz Jamal"; ...` (names only).

#### Audit

| Event | Actor | Target | Metadata |
|---|---|---|---|
| `agent_action.skipped` | the runner | the step | `kind`, `agent`, `before`, `after`, `bundle` |
| `agent_bundle.handler_changed` | the reader | the bundle | `function`, `from`, `to` (user ids or null), `via` |
| `agent_action.approved` / `rejected` (existing) | the reader | the step | `decided_as` may now be `participant` |
| `agent_outside.call` (existing) | the runner | the step | new `op` `remote_link`, outcome `ok` or `refused` |

No quote, reply text, name or email is logged.

#### Measured ceilings

| Pin | Value |
|---|---|
| `THREAD_RUN_QUERIES` (ticket thread) | 33 (unchanged) |
| `ESCALATION_RUN_QUERIES` (Slack thread, issue and function, no decision) | 63 (64 since Slack escalations D3: the channel row's shared flag) |
| `DECISION_RUN_QUERIES` (the same with a decision) | 65 (66 since D3) |
| `SLACK_SYNC_QUERIES` | 38 (was 36: the members by Slack email, once per filed thread with new people) |
| `MESSAGE_DETAIL_QUERIES` / `MESSAGE_HISTORY_QUERIES` | 10 / 10 (was 9 / 9) |
| `OUTSIDE_DETAIL_QUERIES` / `OUTSIDE_HISTORY_QUERIES` | 11 / 10 (was 9 / 8: the reader's Slack link and participant bundles, once per page each) |
| `BUNDLE_DETAIL_CEILING`, `HISTORY_CEILING`, `HISTORY_QUERIES` | 11, 9, 9 (each +1) |
| `DETAIL_QUERIES`, `AUDIENCE_BASE_QUERIES` | {notes 9, drafts_alice 10, drafts_carl 11}, {11, 11} (each +1) |
| `DEPARTMENT_QUEUE_CEILING` | 12 (was 11) |
| Work `FEED_CEILING`, `TEAM_CEILING`, `PROPOSAL_NOTICE_CEILING` | 62, 47, 42 (each +1) |
| `QUEUE_QUERIES`, `ROUTED_QUEUE_QUERIES` | unchanged |
| `StoryQueryCountTests.EXPECTED` | 30 (unchanged: a ticket's thread is joined) |
| `STORY_SLACK_LINKS_QUERIES` | 31 (30 + one read of the page's linked tickets, constant in threads) |
| `SLACK_CONVERSATION_QUERIES` | 7 (was 6: its tickets) |

The escalation block adds no query (its person rides on the page's people read). `PATCH .../handler/` is a write and is not pinned. No query uses `DISTINCT` and no join is made unique.

#### Changes during the build

The delivery's contract lists them (CC-1 to CC-12) with their frontend impact: participants only on escalation bundles; a refresh keeps the bundle and replaces its participants; the prompt quotes names; the run pin split in two (63 / 65); the sync pin 38 and people resolved once; the "posts as you" pins; a department Change returns `handler_for`'s `via` and any Change survives a Refresh; `/work/assignees/` stays closed to participant-only readers; the participant pins, the reply gate, Team and the owner who can't read the thread's department; the block's person read with the page; the both-way link pins.

### Slack escalations, delivery 3: every public channel syncs, pushed by Slack (2026-10-17)

Folded in from the delivery's contract (`docs/superpowers/plans/2026-10-17-slack-escalations-d3-api.md`, decisions SC3-1 to SC3-31, with its "Changes during the build"; the as-built behaviour below wins). Scope: one Slack connection covers every public channel of its Slack workspace. Slack's Events API pushes each message to a public endpoint that files it at once; polling stays only as a slow catch-up, because since 29 May 2025 Slack limits commercially distributed apps outside the Marketplace to 1 request a minute and 15 objects a call on `conversations.history` and `conversations.replies`. The bot joins public channels itself once the connection holds `channels:join`. An admin can switch a channel off or set it to one customer or account. Slack Connect channels are listed but excluded by default. Today's one-channel connections keep working through a data migration. One new setting, with a default: `THROTTLE_SLACK_EVENTS` (`1200/min`). One new Slack scope: `channels:join`.

This replaces three things in the delivery 1 section above: a connection is no longer one channel (`config["channel"]` stays but is unused), connect no longer checks a channel (the "Invite the bot to #<name> first, then connect." refusal is gone), and the 7-day multi-page read with up to 50 reply reads a pass is replaced by the events and the catch-up below.

#### Data

- `connectors.SlackChannel` (`connectors.0009_slackchannel`), one row per channel of a connection: `connector` (CASCADE, `related_name="slack_channels"`), `channel_id` (char 32; unique with `connector`, `slack_channel_once`), `name` (char 80, blank, without `#`), `is_private` (only a migrated private channel), `external_shared` (Slack Connect), `is_member`, `is_archived` (Slack no longer lists it; kept, never read, not shown), `included` (default true), `chosen_by` (User, SET_NULL) and `chosen_at`, `customer` / `account` (SET_NULL, at most one: `slack_channel_one_record`), `join_error` / `read_error` (Slack's codes, or `removed`), `last_message_at`, `read_at` (the catch-up's watermark), `walk_before` / `walk_from` (a catch-up walk in progress), `asked_at` (the last history call: the 60-second guard), `missed` (thread timestamps to read, at most 50), `event_at` (the last event that reached it), `created_at`, `updated_at`.
- `customers.SlackConversation`: the constraint `slack_conversation_once` is now unique on `(connector, channel, thread_ts)` where `connector` is not null (`customers.0064_slackconversation_channel_once`, after Slack escalations D4's `customers.0063_escalation_links`). No column changes.
- Keys carry the channel: a Slack `SignalThread.external_id` is `"<connector id>:<channel>:<ts>"`; a Slack `UnmatchedItem.external_id` is `"<channel>:<ts>"` and its `number` the channel's `#name`.
- `connectors.0010_slack_channels_from_config` (forwards only, noop backwards): each Slack connection with `config["channel"]` gets its `SlackChannel` (`is_member` and `included` true, `is_private` for a `G` id, `external_shared` from config, `read_at` = the migration's time); a connection set to exactly one customer or account moves that record onto the channel and its own list is cleared; its Slack threads and Needs a customer rows get the new keys.

#### Connectors

The connector payload gains `slack_channels` (`null` for any other provider):

```json
"slack_channels": {"synced": 12, "total": 14, "can_join": true, "events_at": "2026-10-17T09:31:02Z"}
```

`total` counts public rows not archived; `synced` those included (a kept private channel is never counted); `can_join` is `channels:join` in the granted scopes; `events_at` the newest `event_at` of its rows, `null` when no event ever arrived. Three subquery annotations: a list page still costs one query. Slack's `setup.fields` is the bot token alone, and `setup.help` reads "Revenact reads every public channel and joins new ones itself once Slack allows it. Leave the token blank to sign in with Slack when it is set up on this deployment." `POST /connectors/<id>/connect/` checks the token (`auth.test`) and stores its scopes; a `channel` sent by an old client is ignored. Sign in with Slack asks for `SCOPES` (now with `channels:join`), plus `chat:write` when the connection already holds it. A connection's own `customer_ids` / `account_ids` now only narrow which names the check looks for and which records a channel may be set to.

#### `GET /api/v1/connectors/<id>/slack-channels/`

Auth: `IsAuthenticated` + `CanManageIntegrations`. `200 {"channels": [Channel row], "can_join": bool, "synced": n, "total": n, "events_at": iso | null}`, every channel not archived, by name. `synced` and `total` count public rows only, as in the connector payload. A Channel row:

```json
{"id": "C0CA7PPRP7A", "name": "all-alfiee", "included": true, "member": true, "shared": false,
 "private": false, "record": {"type": "customer", "id": 29, "name": "Globex (QA)"},
 "conversations": 12, "join_error": "", "read_at": "2026-10-17T09:30:00Z", "chosen_by": {"id": 1, "name": "Tushar Aggarwal"}}
```

`record` is null when the name check files its messages; `conversations` the count filed through this channel; `read_at` null when never caught up; `chosen_by` null when nobody changed it; `join_error` `"removed"` means somebody removed the bot. Refusals:

| # | Case | Status | Body |
|---|---|---|---|
| 1 | no token | 401 | DRF's |
| 2 | not `manage_integrations` | 403 | DRF's permission body |
| 3 | not a connection of the reader's workspace | 404 | `{"detail": "No Connector matches the given query."}` |
| 4 | not Slack | 409 | `{"code": "NOT_SLACK", "detail": "Only a Slack connection has channels."}` |

#### `PATCH /api/v1/connectors/<id>/slack-channels/<channel id>/`

Auth as the list. Body: `{"included": bool}` and/or `{"record": {"type": "customer" | "account", "id": n} | null}`. `200` the Channel row. Refusals, in this order (1 to 4 as the list):

| # | Case | Status | Body |
|---|---|---|---|
| 5 | no such channel on this connection (or archived) | 404 | `{"code": "NO_SUCH_CHANNEL", "detail": "No such channel."}` |
| 6 | neither key | 400 | `{"detail": "Change whether it syncs, or its customer."}` |
| 7 | `included` not a boolean | 400 | `{"included": ["Choose on or off."]}` |
| 8 | `record` not null and not `{type, id}` with a known type and a whole id | 400 | `{"record": ["Choose an organisation or an account."]}` |
| 9 | the record isn't in the workspace | 400 | `{"record": ["No such organisation."]}` ("No such account." for an account) |
| 10 | the connection doesn't cover it | 400 | `{"record": ["Globex (QA) isn't covered by this Slack connection."]}` |

A change sets `chosen_by` and `chosen_at`, clears `join_error` (including `removed`) and `read_error`, and writes `slack_channel.update` when something changed. Nothing already filed moves.

#### `POST /api/v1/connectors/slack/events/` (public: Slack's Events API request URL)

No authentication (`AllowAny`); who is calling is proved by Slack's v0 signature over the raw body (`slack_interactivity.verified`: `SLACK_SIGNING_SECRET`, constant time, 5-minute window, no secret refuses all), checked before the body is parsed. Throttled per source IP (`SlackEventsThrottle`, scope `slack_events`, `THROTTLE_SLACK_EVENTS`, default `1200/min`). Headers read: `X-Slack-Signature`, `X-Slack-Request-Timestamp`, and `X-Slack-Retry-Num` / `X-Slack-Retry-Reason` (logged as digits and Slack's reason word only). OpenAPI operation id `slack_events`.

| # | Case | Status | Body |
|---|---|---|---|
| 1 | signature missing, wrong, older than 5 minutes, or `SLACK_SIGNING_SECRET` empty | 401 | empty |
| 2 | throttled (per IP) | 429 | DRF's |
| 3 | body not JSON, not an object, or over Django's 2.5 MB upload limit | 400 | empty |
| 4 | `{"type": "url_verification", "challenge": "..."}` | 200 | `{"challenge": "<the same string>"}` |
| 5 | `{"type": "event_callback", ...}` | 200 | empty; filed as below |
| 6 | any other `type` (`app_rate_limited` is logged) | 200 | empty |

After a valid signature it always answers 200, whatever it filed, so Slack never turns the subscription off for our own failures; a retry is filed like a first delivery (filing is idempotent by channel and ts). The envelope fields read are `team_id`, `api_app_id`, `is_ext_shared_channel` and `event`; each enabled Slack connection with credentials whose `config.team_id` is the envelope's handles it. Events handled:

- `message` with `channel_type` `channel` (or `group` for an existing private row), in an included, unarchived row. An unknown public channel becomes a row (excluded when the envelope says it is shared). The row's `event_at` is set.
  - A top message (no `thread_ts`, or `thread_ts` = `ts`) with no subtype, a user, text, no `bot_id`, and not ours is filed (below).
  - A reply (`thread_ts` other than `ts`; no subtype, `bot_message` or `thread_broadcast`; text) is merged into its stored conversation: our bot's reply is stored with `bot` and `ours` true and never wakes the agent; another app's reply with `bot` true; a person's post through our app with `via_app` true (never wakes the agent). A reply to a thread waiting in Needs a customer is dropped; a person's reply to an unknown thread is remembered in the row's `missed`, while a bot's reply (`bot_id` or `bot_message`), our own post, an empty message or any other subtype to an unknown thread is ignored.
  - `message_changed` gives the stored message its new text (the title follows the top); `message_deleted` removes a stored reply, turns a stored top's text into "This message was deleted." and forgets a top waiting in Needs a customer. Neither wakes the agent or creates a conversation.
  - Every other subtype is ignored. An excluded channel, an unknown team or a channel type we don't file stores nothing.
- `channel_created`: the channel becomes a row and, with `channels:join`, is joined at once (one `conversations.join`, 2-second timeout; a failure leaves it for the next pass).

A message is ours when its `bot_id` or `user` is the connection's bot (`config.bot_id`, `bot_user_id`), its `metadata.event_type` is `revenact_step`, or its `app_id` is the envelope's `api_app_id` with no `bot_id`. Filing is inline, before the answer (a few queries and at most one `users.info` call, 2-second timeout), and touches the agent thread as before; the agent itself runs on the next `agents` tick (5 minutes, the fast lane's 2-minute quiet window). Any error while filing adds the thread to the row's `missed` list. Each connection of the team files the event on its own: one connection's failure never stops the others. Filing a conversation we already hold reads it under its row lock (`select_for_update`), so an event and the catch-up filing one thread at once never overwrite each other.

#### Which customer

First hit wins: (1) the channel's own record (`matched_by` `channel`); (2) else the name check over the records the connection covers; (3) else Needs a customer. A conversation's `external_shared` is its channel's flag, refreshed whenever it is filed. Replies merge by ts (a new ts is added, a known ts takes the new text); `latest_reply` only moves forward.

#### Each pass (`sync_tickets`, the `tickets` tick)

1. **Listing:** `conversations.list` (`types=public_channel`, `exclude_archived=true`, 200 a page, at most 5 pages). New channels become rows, included unless shared; a row's name, shared flag and membership follow Slack; a row Slack no longer lists is archived; a row the bot was removed from gets `join_error` `removed`. A channel nobody chose that becomes shared is excluded (a conditional update: one an admin chose meanwhile keeps their choice). A pass never writes `included` back, so an admin's change made while the listing runs is kept, and a row an event made meanwhile is kept and used. A failed listing leaves the rows as they are; a revoked token marks the connection as before.
2. **Joining** (only with `channels:join`): at most 5 included, public, unarchived, not-shared channels the bot isn't in and with no `join_error`, oldest first. A refusal stores Slack's code; `ratelimited` stops joining for the pass.
3. **The catch-up**, only when no catch-up call was made for the connection in the last 60 seconds: **one** `conversations.history` call and **at most one** `conversations.replies` call, each `limit=15`. The channel: a walk in progress first, then never caught up, then the longest since `read_at`; a row whose read Slack refused goes after every other for 15 minutes after that try (`asked_at`), then ranks as any other; history reads from the later of 7 days ago and `read_at` minus 2 minutes, below `walk_before`. Every top message on the page is filed; `has_more` continues the walk next time; the end of a walk sets `read_at` to when it began. The thread: the oldest `missed` entry, else the first stored thread whose `latest_reply` moved. `ratelimited` or 429 ends the catch-up for the pass storing only `asked_at`; `not_in_channel` marks the row not a member and `removed`; `channel_not_found` marks it not a member only (so it uses no more history calls until a listing shows the bot in it); any refusal is the row's `read_error` and stamps its `asked_at`, and a refused missed thread leaves `missed`. An admin's channel change saves only the fields it sets, so an event's `event_at`, missed threads and a walk written meanwhile are kept.

No code path calls `conversations.history` or `conversations.replies` more than once per connection per pass or with `limit` above 15, except `SlackProvider.find_message` (a step's Retry, unchanged).

#### Agents

Moving a reply to another channel: every included, joined channel of a connection the reader may post through is a "synced" option with id `"<connection>:<channel>"`; the thread's own channel keeps the id `"<connection>"` ("This thread"). A step is in its thread when its connection and channel are the thread's; payloads made before D3 read as their thread. A `connector_id` edit to a connection other than the source (or a choice that is not a listed id) is refused 400 with "Choose a Slack channel from the list." on that field. A `slack.reply` payload gains `source_channel` and `source_channel_name`.

#### Audit

| Event | Actor | Target | Metadata |
|---|---|---|---|
| `slack_channel.update` | the admin | the connection | `channel` (the row's id), `changes`: `{"included": {"old", "new"}}` and/or `{"record": {"old", "new"}}` with records as `"customer:29"` / `"account:7"` / null |

The listing, joins, events and catch-up reads are not audited (the sync's own work). No log line carries message text, a channel name or a Slack user id.

#### Changes during the build

1. **`SLACK_SYNC_QUERIES` 36 to 42** (one channel, a pass of three threads); no `conversations.info` any more. Frontend impact: none.
2. **A refused catch-up read never freezes the catch-up:** any refusal but a rate limit sets `read_error` and drops a missed thread; `not_in_channel` also sets `join_error` `removed`; a listing that shows the bot back clears it. Frontend impact: `read_error` / `join_error` can read `removed` after a refused read.
3. **`SLACK_EVENT_REPLY_QUERIES` 14.** Unsigned retry headers are logged as digits and the reason word only; a body over 2.5 MB is refused 400 before the signature check. Frontend impact: none.
4. **The channel list is 7 queries** for 2 or 7 channels; `GET /connectors/` stays 5. Frontend impact: none.
5. **`SLACK_OPTIONS_QUERIES` 4 to 5**; the options route is `/steps/{}/options/slack_channels/` with ids `<connection>` and `<connection>:<channel>`. Frontend impact: none.
6. **Counts and help copy:** `total` / `synced` (connector payload and channel list) count public rows only; `setup.help` as quoted above. Frontend impact: its copy and counts already expect this.
7. **Schema:** the Events and interactivity views carry `@extend_schema` (operation ids `slack_events`, `slack_interactivity`), so `manage.py spectacular` describes both; the channel record's type enum is `RecordTypeEnum`. Frontend impact: none.
8. **Final review fixes:** a refused channel is read again 15 minutes after its last try (owner decision), and a refused replies read stamps `asked_at`; only a person's reply to an unknown thread is queued in `missed` (owner decision, refines SC3-26); `channel_not_found` makes the row not a member, without `removed`; the listing never writes `included` back (SC3-4's exclusion is a conditional update) and tolerates a row an event made meanwhile; the channel PATCH saves only its own fields; each connection of a team files an event on its own; `file_conversation` locks a stored conversation. No shape, status or code change; pins unchanged. Frontend impact: none (fewer stuck rows; a removed-by-Slack channel can show `member: false` with no `join_error`).
9. **Rebased onto delivery 4:** `customers.0064_slackconversation_channel_once` follows D4's `0063_escalation_links`. The thread's `people` (D4) are filled by the catch-up and by events (a top's poster, a reply's replier, at most 3 mentioned people an event, none asked about after 1.5 seconds and every lookup answered by 2.5, people the thread already resolved never asked again; an edit that mentions someone new adds them); the shared flag the reply and the agent read is the conversation's or its channel row's, never the connection's config; one rule (`is_ours`) marks our own posts. Pins: `SLACK_SYNC_QUERIES` 44, `SLACK_EVENT_REPLY_QUERIES` 15; a Slack thread's agent run +1 (the channel row's shared flag: `ESCALATION_RUN_QUERIES` 64, `DECISION_RUN_QUERIES` 66, a plain Slack thread 34 against a ticket thread's 33). Moving a reply to another connection names its channel (`"<connection>:<channel>"`, SC3-18), as D4's own move tests now do. Frontend impact: none in shape; event-filed threads now have people, so mentions, decisions and participants work for them.

#### Measured ceilings

| Ceiling | Value |
|---|---|
| `SLACK_CHANNELS_QUERIES` | 7 (`GET /connectors/<id>/slack-channels/`, any number of channels) |
| `CONNECTOR_LIST_QUERIES` | 5 (unchanged, with 1 or 4 Slack channels) |
| `SLACK_EVENT_REPLY_QUERIES` | 15 (one signed reply event into a stored conversation; 14 before D4's people) |
| `SLACK_SYNC_QUERIES` | 44 (was 38 on D4; 42 on D3 before D4's people) |
| `SLACK_OPTIONS_QUERIES` | 5 (was 4) |

No query uses `DISTINCT`. Owner set-up (once, in the Slack app's settings): Event Subscriptions on with the Request URL `https://<backend>/api/v1/connectors/slack/events/` (the deployment's `SLACK_SIGNING_SECRET` must be the app's Signing Secret); subscribe to the bot events `message.channels` and `channel_created`; add the bot scope `channels:join`; reinstall the app, then reconnect the Slack connection in Settings so it holds the new scope.

### Jira project choice: ask which, or make one (2026-10-18)

A `jira.create` step whose connection names no project (its payload `project` is `""`) no longer only fails with "Choose a Jira project, then Retry." The runner's own projects are read as the runner (their Jira link when it covers the site, else the connection's account; the same seat the run uses), only for a reader who may run the step now (`may_decide`, and the tool gate open), only for a `proposed` or `failed` step, and kept 60 seconds per connection and seat (a page, its edit and its run share one read; a project made forgets it).

**Step `preview.jira` gains** (always present on `jira.create`):

| Field | Type | Meaning |
|---|---|---|
| `project` | string | The step's project; when it has none and the runner has exactly one project, that one (written into the payload when the step runs) |
| `needs_project` | bool | True when the step has no project and the runner has none or several |
| `project_choices` | `[{key, name}]` | The runner's projects, sorted by name, at most 20; `[]` when none (or `needs_project` false) |
| `can_create_project` | bool | Only with no projects: whether the runner's Jira account looks able to create one (the connection's account needs Jira's global Administer, read through `/mypermissions?permissions=ADMINISTER`; a person's link needs the `manage:jira-project` OAuth scope, which today's links don't hold, so false). True when Jira can't say: the create's refusal then answers |
| `suggested_project` | `{name, key}` or null | Only when `can_create_project`: `{"name": "Customer Escalations", "key": "CE"}`, the key made unique (`CE2`, `CE3`, ... through `/projectvalidate/key`) |

**Step `question`:** `"Which Jira project should this ticket go in?"` whenever `preview.jira.needs_project` is true, for guided and non-guided bundles alike (it replaces a guided bundle's "Next: ... Should I go ahead?" on that step; other steps unchanged).

**Choosing:** the existing editable field `project` (`PATCH .../steps/<step_id>/`, Run's `fields`, Retry's `fields`, and a guided `POST .../steps/<step_id>/run/` with `{"fields": {"project": "KAN"}}`) now also checks the key is one of the runner's projects (`/project/search?query=<key>`, exact key); another key is the existing `400 {"steps": {"<id>": {"project": ["Choose a Jira project."]}}}`. When Jira can't list them now the key is kept and the run answers. At run with no project, exactly one project is used; none or several is still the last-resort `"Choose a Jira project, then Retry."` (`JIRA_NO_PROJECT`).

#### `POST /api/v1/agents/bundles/<id>/steps/<step_id>/jira-project/` (new, `IsAuthenticated`)

Makes a Jira Software project in Jira as the runner (`POST /rest/api/3/project`, `projectTypeKey: "software"`, template `com.pyxis.greenhopper.jira:gh-simplified-kanban-classic`, `leadAccountId` from `/myself` on the same seat, `assigneeType: "UNASSIGNED"`), then sets it as the step's `project` (its issue type resolved again by name).

Request `{"name": "Customer Escalations", "key": "CE"}`: `name` 1 to 80 characters (trimmed); `key` `^[A-Z][A-Z0-9]{1,9}$`; any other field is refused.

`201 {"bundle": Bundle}`. Errors, in order:

| Status | Body | When |
|---|---|---|
| 404 | `{"code": "NO_SUCH_BUNDLE", ...}` | Bundle unreadable, or the step isn't this bundle's `jira.create` |
| 403 | `{"code": "CANT_RUN_STEP", "detail": "You can't run step N.", "step": id}` | The reader may not decide the step |
| 409 | the bundle's conflicts (`BUNDLE_RAN`, `BUNDLE_RUNNING`, ...) | A `proposed` step's bundle isn't waiting |
| 409 | `{"code": "STEP_NOT_WAITING", "detail": "Only a waiting step can be changed."}` | The step is neither `proposed` nor `failed` (or its bundle is running) |
| 409 | `{"code": "TOOL_BLOCKED", "detail": <gate sentence>, "link": "/settings/connections" or null}` | Jira Read only, gone, needs reconnecting, or the runner's link is lost |
| 400 | `{"name": [...]}` / `{"key": [...]}` / `{"<other>": ["This can't be changed here."]}` | Body check; Jira's own "key in use" is `{"key": ["Jira already has a project with this key. Try another."]}` (name: `{"name": [...]}`) |
| 403 | `{"code": "CANT_CREATE_PROJECT", "detail": "Your Jira account can't create projects. Ask a Jira admin, or choose an existing project."}` | Jira answered 401 or 403 |
| 502 | `{"code": "JIRA_UNCONFIRMED", "detail": "We couldn't confirm Jira made the project. Check Jira, then choose it."}` | No answer from Jira |
| 502 | `{"code": "JIRA_REFUSED", "detail": <sentence>}` | Any other Jira refusal |

Audited `jira.project_created` (ids, key and `as` only). Connections that are Read only refuse (409 `TOOL_BLOCKED`); the AI switch doesn't apply. No migration.

<!--
Template for each new feature section below:

## `<app_name>` — <Frontend feature name>

Mirrors: `src/pages/<domain>/...`, `src/features/<domain>/...`

### Models
- `ModelName` — field: type, notes...

### `<METHOD> /api/v1/<domain>/...`
Auth: <required/AllowAny>
**Request** / **Response** shapes, with a short note on any place the
backend shape deviates from the frontend's current TS interface and why.
-->
