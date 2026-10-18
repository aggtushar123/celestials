---
description: Technical Requirements Document for Revenact — architecture, stack, security, deployment and non-functional requirements.
---

# Revenact — Technical Requirements Document

Current as of 2026-09-18. Every value here was read from the code or config named
beside it. Where a number is configurable, the default is given.

Companion documents: [PRD](01-prd.md), [Backend Schema](05-backend-schema.md),
[App Flow](../../../react-ts-app/docs/04-app-flow.md),
[Implementation Plan](06-implementation-plan.md).

---

## 1. System shape

```
                    Browser (React 19 SPA)
                            │
                   HTTPS + WSS (one origin)
                            │
                    ┌───────▼────────┐
                    │  Caddy         │  TLS, static files, CSP, security headers
                    └───┬────────┬───┘
            /api /ws /admin      │ everything else
                        │        └──► built SPA from a volume
                    ┌───▼──────────┐
                    │ Daphne       │  HTTP + WebSocket, one ASGI process
                    │ Django 5.2   │
                    └─┬───┬────┬───┘
                      │   │    │
          ┌───────────┘   │    └────────────┐
    ┌─────▼─────┐   ┌─────▼─────┐    ┌──────▼───────┐
    │ Postgres  │   │  Redis    │    │ Anthropic    │
    │ 16        │   │ channels  │    │ API or AWS   │
    │           │   │ + cache   │    │ Bedrock      │
    └───────────┘   └───────────┘    └──────────────┘

    scheduler container ──► run_health_maintenance, daily
    mailsync container  ──► sync_mail + sync_tickets, every 10 min
    sender container    ──► deliver_pending, every minute
```

Three repositories:

| Repository | Contains |
|---|---|
| `revenact-backend` | Django project, 15 apps, API, WebSocket consumers, management commands, this document set |
| `react-ts-app` (GitHub: `revenact-frontend`) | React SPA, design system, UI/UX and App Flow documents |
| `revenact-infra` | Terraform, cloud-init, production Compose file, Caddyfile, backup and deploy scripts |

---

## 2. Backend

### 2.1 Stack

| Concern | Choice | Version |
|---|---|---|
| Language / framework | Python 3.13, Django | 5.2.17 |
| API | Django REST Framework | 3.18.1 |
| Auth tokens | djangorestframework-simplejwt | 5.5.1 |
| Schema docs | drf-spectacular | 0.30.0 |
| WebSockets | Channels + channels-redis | 4.3.2 / 4.3.0 |
| ASGI server | Daphne | 4.2.3 |
| Database | PostgreSQL | 16 |
| Driver | psycopg | 3.3.5 |
| Model provider SDK | anthropic (plus boto3 for Bedrock); google-genai for Gemini on Vertex AI | 1.9.0 / 2.31.0 |
| Embeddings | Vertex AI `gemini-embedding-001` (768 dimensions) in production; sentence-transformers `all-MiniLM-L6-v2` for development | 6.1.0 (dev) |
| Vector store | pgvector in Cloud SQL Postgres 16 (`pgvector` Python 0.5.0) | 0.5.0 |
| Password hashing | argon2-cffi (Argon2id) | 25.1.0 |
| Static files | WhiteNoise (Django serves `/static/`) | 6.12.0 |
| Uploaded files | django-storages, Google Cloud Storage when `GS_BUCKET_NAME` is set, local disk otherwise | 1.14.6 |
| Lint / format | ruff | 0.16.6 |

There is no Celery, RQ, Dramatiq or APScheduler anywhere in the tree. Outbound
HTTP uses the standard library `urllib`, not `requests`.

### 2.2 Application layout

`config/` holds settings, the root URLconf and the ASGI entry point. `core/` is
the infrastructure app (audit, logging, middleware, throttling, WebSocket auth,
health check). Every domain lives under `services/` as its own Django app:

`accounts`, `customers`, `copilot`, `metrics`, `knowledge`, `mail`, `connectors`,
`notifications`, `scenarios`, `webhooks`, `campaigns`, `custom_objects`,
`fx_rates`, `brain`. Fourteen apps plus `core`, 148 migrations, 46 concrete models.

`services/` itself is a plain package, not an app. `accounts` and `customers` set
their app label explicitly so every existing `ForeignKey("accounts.User")` string
kept working when they moved under `services/`.

### 2.3 Request pipeline

```
request → RequestIDMiddleware (X-Request-ID, validated or generated)
        → SecurityMiddleware → CorsMiddleware → SessionMiddleware
        → CommonMiddleware → CsrfViewMiddleware → AuthenticationMiddleware
        → DRF view (JWTAuthentication, IsAuthenticated by default)
              ├─ permission class (capability check)
              ├─ scoping helper (which rows this user may see)
              ├─ serializer
              └─ ORM
        → JSON response, X-Request-ID echoed
```

### 2.4 Non-view business logic

Roughly 45 modules hold logic that is neither a view nor a serializer. The ones
worth knowing:

| Module | Responsibility |
|---|---|
| `services/customers/scoping.py` | The single definition of which customers and accounts a user may see. `SystemActor` lets a job run whole-org without impersonating a person |
| `services/accounts/hierarchy.py` | Org-chart maths: ancestors, subtree, combined scope, cycle check |
| `services/customers/personal.py` | Notes, tasks and tickets visibility |
| `services/customers/task_access.py`, `task_changes.py`, `task_payloads.py` | Tasks: the twice-filter (`openable_tasks`), who may be given one (`assignee_for`, 400 `ASSIGNEE_CANNOT_OPEN`), which fields a reader may change; `add_task`, the one way every path makes a task (event, `task_assigned`); one `TaskEvent` per changed field |
| `services/work/` | Work: Team (Brain's scopes), the drill-down and the assignee picker, all over `openable_tasks` as `id IN` subqueries; `clock` is the one place "today" and "a working day" are decided. Recommended: `sources.py` (one rules-only function per signal over a `Book` read as `SystemActor`; no model call), `routing.py` (CS function owner → record owner → their manager in manager mode → first view-all member → workspace owner; everyone active and able to open the record), `recommend.py` (`refresh`: upsert, expire, cooldown and worsened re-raise, each source in its own transaction and failing on its own; the once-a-day `recommendations_waiting`), `rec_access.py` (who decides, which a reader is shown), `deciding.py` (assign and dismiss under row locks). `run_health_maintenance` runs `recommend.refresh_all` before the rules. Delivery 3: `clock.py` takes "today", the start of the local day and working-day counts from the workspace's `WorkSettings.timezone` and `working_days` (Work only; Brain and the rest keep the server date). `tracking.py` runs nightly from `run_health_maintenance`: a nudge to the assignee at most once per task per workspace-local day (the claim is a conditional `UPDATE` on `last_nudged_at` before the start of the local day), an escalation once to the active manager in the same workspace else the active owner (claim: `UPDATE ... WHERE escalated_at IS NULL`; an assignee no longer active for work escalates straight away; "active" is `work.standing`: `is_active` and an `active` membership in that workspace, read once per pass as a set of ids, and applied to the escalation target, the assignee check, routing (`Router.working()`, for `opens` and the fallbacks), draft-reply owners in `sources`, `notify_waiting`, the recommended list's `active`/`can_open`, the assignee picker, `task_assigned` and a rule's task assignee; the rules night reads the ids once per rule run (`run_rule`), pauses a rule whose owner is not in them (`owner_inactive`) and passes them to every task and its `task_assigned` notice, so no task reads them again; Blocked and unassigned tasks are skipped); only the claim that changed a row notifies, so overlapping runs never double up. `digest.py` runs every minute from `deliver_pending`, after `digest_hour` local time on working days: each person's `DigestSend` row is inserted (pending) before anything is built or sent, so a person gets at most one per local date; nothing is claimed while `email_ready` is false (logged once per process); counts and items come from `feed_tasks` and `rec_access.decidable`/`openable`, never a fresh query, and no join is made unique with `.distinct()`. Each workspace and each person fails on its own, and `failed_workspaces` is counted apart from failed people Work in one place (delivery 1, 2026-10-12): `feed.py` composes `GET /work/feed/` and `/work/feed/count/` from `feed_decide` (Brain's desk sources on the reader's Me desk, plus their own open reply drafts), `feed_tasks` (open tasks assigned to the reader and their own to-dos, in six date groups; one aggregate query for the counts) and `feed_suggest` (four recommendation kinds), each in its own savepoint so one failing source only adds its kinds to `failed`; pages are keyset cursors (`feed_shape`), never offsets; `todos.py` is `POST /work/todos/`. The digest reads `feed_tasks`, so it counts the reader's own to-dos. Delivery 2 (2026-10-12): `feed_team.py` serves `GET /work/feed/team/` from `feed_team_decide` (Brain's desk at the scope minus the reader's Me desk), `feed_team_tasks` (overdue tasks with a record, read-only) and `feed_team_suggest` (recommendations the reader may decide, recipient in scope), with `team_scope.resolve_team`; one savepoint per source, the feed's cursors. `today.py` and Brain's Waiting routes are gone; `brain.waiting.build` stays only for Ask Revenact's grounding. The recommender makes the four live kinds only; no code settles a recommendation from an agent action or the reverse. `proposal_notice.py` sends the once-a-day `agent_proposal_waiting` notice at the end of `recommend.refresh` and after an agent's Run now. Agent bundles D1 (2026-10-13): `feed_decide.Bundles` replaces `Approvals`; `queues.py` serves the rail (`GET /work/queues/`); Rest of company leaves out the reader's team (`team_scope.near`); the notice is "Bundles waiting". Agent bundles D2 (2026-10-13): `queue_bundles.py`: department and Unassigned queues; Mine and My team leave routed bundles out; the badge counts the reader's department. |
| `services/mail/visibility.py` | Synced email visibility by mailbox owner and chain |
| `services/customers/health.py` | The health rubric |
| `services/customers/pulse.py` | Account and organisation pulse |
| `services/customers/contact.py` | What counts as a touch, used by both the rubric and Activity Tracking so the two screens cannot disagree |
| `services/customers/classification.py`, `taxonomy.py` | Model-driven sentiment and the three-level taxonomy |
| `services/metrics/registry.py` | 21 metrics defined once, each reading an existing rollup. `shelfware_arr`/`at_capacity_arr` read `None` ("Not measured"), for every actor including Company, when no customer in the book has seats recorded |
| `services/agents/` | Agents. `registry.py` is the one table of the 23 action kinds (payload check, current value, preview, apply, undo); `policy.py` holds the Auto/Ask/Never grid and each agent's budget; `evidence.py` builds each agent's book; `prompt.py` writes and parses the one call; `run.py` is a pass; `deciding.py` holds who may decide a step, the lock (`locked()`: the step's bundle first), applying, expiring and rejecting a step (a person decides through the bundle: `bundle_run.py`; the old approve and reject routes answer `409 USE_BUNDLE`); `undo.py` is the 7-day undo; `views.py` and `settings_api.py` are the routes. Agent bundles D1 (2026-10-13): `AgentBundle` (`models.py`) holds `AgentAction` steps (`bundle`, `position`, `selected`, `outputs`, `error`, `irreversible`); `bundles.py` (bundle of one, status rules, read rule, stuck runs, audited with no actor), `placeholders.py` (`{{step N.key}}`; none in a field a customer reads), `bundle_payloads.py`, `bundle_run.py` (claim under the bundle's row lock, each step its own transaction, retry, reject), `bundle_views.py`; the pass groups a record's new steps into one bundle; `actions/surveys.py` and `actions/campaign_sends.py`. One lock order: a step's bundle before the step (`deciding.locked()`), several bundles in ascending id. Agent bundles D2 (2026-10-13): `SignalThread` (`models.py`), touched by `mail/sync.file_message` and `connectors/sync.file_ticket` (`threads.py`; no agent work at sync time); `run_agent_signals` (`intake.py`: due workspaces, the quiet rule, gates, one call per thread, isolation; every 15 minutes from the `agentsignals` sleep loop); `routing.py` (owner, department, Unassigned; agent choice); `evidence.build_for_thread`; `intake_bundles.py` (new, replaced, superseded, flagged; Refresh keeps edits); saved edits (`bundle_run.save_step`). |
| `services/brain/scope.py` | Me / My team / Company resolver; the only builder of a `ScopeActor` |
| `services/brain/changed.py` | What changed: a scope's figures against its comparison point |
| `services/brain/desk.py` | Waiting on you: per kind, what waits on a scope's people and what the reader may open, as `id IN` subqueries |
| `services/brain/waiting.py` | No routes (removed in Work in one place, delivery 2); `build` stays only as Ask Revenact's grounding source (`decided_as`, the one rule for who may decide a proposal, lives in `services/agents/deciding.py`). The desk's sources are `services/brain/desk.py` |
| `services/brain/doing.py` | What's being done: a scope's initiatives, plans and rules, each named only for what the reader may open; plans they can't are `hidden` |
| `services/brain/initiatives.py` | Initiatives for everyone: owner-cut metrics, `edited_as` (owner, chain, view_all_accounts), the Brain create and edit paths |
| `services/brain/book.py` | A scope's book as `id IN` filters (`customers`, `accounts`, `q`), the set `ScopeActor` reads; narrows `/requests/` and `/anomalies/` on `?scope=` |
| `services/brain/http.py` | `ScopeRefusals` and `optional_scope`: the scope refusals shared by Brain routes and the lists that take `?scope=` |
| `services/brain/customers.py` | What customers are saying: a scope's asks, anomalies, survey scores (from the answers, per window) and who turned negative, each counted only over what the reader may open |
| `services/brain/graph.py` | The knowledge graph for a scope, composed from `metrics/graph.py`'s parts with the delivery 2 and 3 rules |
| `services/plans/figures.py` | A record's health score and ARR as the app reads them; `Plan.start_figures` |
| `services/copilot/anthropic_client.py` | The one place a model is called |
| `services/copilot/retrieval.py`, `embeddings.py`, `context.py` | Grounding, retrieval and citations |
| `services/copilot/dashboard_grounding.py`, `organizations_grounding.py`, `contacts_grounding.py`, `accounts_grounding.py`, `account_detail_grounding.py`, `pipelines_grounding.py`, `brain_grounding.py` | The Ask rails: each recomputes the asker's own screen server-side and fences it as data, never instructions, for the model. Dashboard is asked per area/view; Organizations is asked from the portfolio (`list`/`board`) or one organisation's page (`detail`); Contacts is asked from the filtered list (`list`, at most 50 people) or one person's profile (`person`, their newest 20 calls/emails/tickets the asker may read). Accounts is asked from the portfolio (`list`/`board`, over `services/accounts_portfolio`) or one account's page (`detail`, the organisation story engine over `AccountScope`). Pipelines is asked from the List or Board of either kind (`list`/`board`, over `services/pipelines_portfolio`). The Brain is asked from one of its four tabs for a scope (`brain_context.py`, over the `services/brain` page builders); a shared Brain answer is read past its asker only by a same-organisation reader who sees every account and reads every ticket department, owner and session participants included. Every reader of a shared conversation is checked per reply (`views.per_reader` for the owner and session participants, `views.visible_messages` for a mentioned reader): a reply someone else asked that draws on what they may not open is withheld, the Brain rule being one more check; their own replies always show. The same filtered view is the model history and the facilitator transcript, which always has a requester |
| `services/organizations/`, `services/accounts_portfolio/`, `services/pipelines_portfolio/` | The three portfolios (Organizations, Accounts, Pipelines): each loads the viewer's visible book in a fixed number of queries and computes row signals in Python; the account and pipeline ones import `services/portfolio_core`'s generic helpers (keyset cursor, section order, bulk reasons — shared by Organizations, Accounts and Pipelines) plus the organisation one's own CSV cell helper, and keep their own rules. The pipeline one serves both kinds through one `Kind` object and applies the twice-filter (openable parent, readable department) once, in `book.scope` |
| `services/segments/` | Saved segments. `registry.py` names every field a rule may use and the operators its type takes; `rules.py` checks rules on the way in (ids the writer cannot open read like missing ones) and redacts them on the way out; `compiler.py` turns them into one `Q` over the reader's visible book (reusing the lists' health, NPS, churn and renewal rules, the rubric's last touch, and a latest-value subquery for AI attributes); `evaluate.py` adds pins, removes keep-outs and applies visibility last; members reuse the Organizations and Accounts books through `load_portfolio(scope=)` and the Contacts list; `nightly.py` runs in `run_health_maintenance` as each owner |
| `services/surveys/` | Survey sends. `audience.py` resolves a segment's people from the sender's own view (roles, cap 3 per record, 30-day quiet period, visibility); `sending.py` refuses to send while email is not set up (the console backend outside `DEBUG`), claims a draft under row locks (workspace, owner, send), writes one `queued` invite per person inside the claim (no token yet) so a second send claimed meanwhile skips those people; `deliver` (from the `deliver_pending` command every minute, and the nightly rules step; a review's approval only claims) takes each queued invite with one conditional `UPDATE … WHERE status=queued AND token_hash IS NULL` on the invite's own columns, writing a fresh token's hash, emails one link per person (`services/email.py: send_survey_email`) and, once nobody is queued, freezes the counts and audits `survey.sent`; `resume` counts anyone taken `STALE_MINUTES` (10) ago or more but unconfirmed as emailed (`pending`, hash kept), judged by the row's own `taken_at` so overlapping workers never mark each other's invite in flight; `tokens.py` makes 32-byte links stored as SHA-256; `public_views.py` is the no-sign-in form (`AllowAny`, `SurveyLinkThrottle`, one 404 body); `scores.py` turns answers into the rolling 90-day NPS/CSAT/CES and one `customers.Survey` log row per send and record, and its `refresh_aged` runs in `run_health_maintenance`. Both an answer and the nightly refresh lock the accounts then the customers they rescore (`select_for_update`, by id); the nightly refresh runs each aged record in its own transaction, so one record's failure is logged and never stops the rest |
| `services/rules/` | Rules: when → then. `triggers.py` reads a night's matches as the owner (entries and exits from `SegmentChange`, scores crossing a line against `RuleState`, the schedule); `selection.py` applies the cooldown and the 200 cap and serves the builder's test, which writes nothing; `actions.py` makes tasks, sets the lifecycle under the record's row lock (audited per record) and sends one digest per recipient naming only what they may open; `reviews.py` sends a rule's survey through `surveys.sending.claim`, or a rule's campaign through `campaigns.sending.claim`, with the fired records as its audience, locking the review then the claim's own rows — approving a campaign review locks rule → review → workspace → campaign, since the send's FK to `Rule` takes `FOR KEY SHARE` on the rule's row and a rule edit holds that row before expiring its reviews, so a review-first order would deadlock against it; `nightly.py` runs in `run_health_maintenance` after the segments, each rule in its own transaction and each record and action in its own savepoint, idempotent per rule and night, and after every rule commits, finishes any campaign send nobody is delivering (`campaigns.sending.deliver_pending`) |
| `services/plans/` | Plans: `starting.py` is the one way a plan is made (API and rule alike), locking workspace, record, then template, and copying the template; `status.py` moves milestones and plans under the plan's `FOR NO KEY UPDATE` lock, for the API, the existing task route and `nightly.py` (at risk, done; in `run_health_maintenance` before the rules); visibility is the record's (`id IN` subqueries), each task keeping `personal.visible_tasks`; `builtins.py` seeds the four built-in templates. Lock order is rule → workspace → record → template → plan: a rule with a `plan` action holds the workspace row lock for its whole night's run (contention only — nothing fails on it), and `starting.start_plan` itself takes workspace → record → template → plan, whether called from the API or from a rule |
| `services/campaigns/` | Campaigns: `sending.claim` locks the workspace then the campaign (both `FOR NO KEY UPDATE`), builds the audience again as the owner, and writes the send and every delivery in that one transaction — a second claim in the same workspace queues behind it, which is what makes "once per campaign" and the 3-day gap hold. `deliver` then runs outside any transaction (it refuses to start inside one, `_refuse_if_locked`) and takes each queued delivery with a single-table conditional `UPDATE … WHERE status=queued AND token_hash='' AND contact_id IN (subscribed contacts)`, writing the token's SHA-256 hash as the take; Postgres's concurrent-update recheck only re-applies plain columns of that one table, so the subquery is scoped to `Contact` alone (never a join of the delivery row to `Contact`) or a second worker blocked on the lock can still win and double-send (reproduced on PG15; task-6-report.md). Five consecutive send failures (a dead connection, not one bad address) stop `deliver` early and leave the rest queued for a later resume. A send cut off mid-delivery stays `sending`; `resume`/`deliver_pending` — called from the nightly rules step and the admin's "Finish the selected sends" — skip anyone taken-but-unconfirmed whose take (`CampaignDelivery.taken_at`) is `STALE_MINUTES` (10) old or more — the take's age, not the send's, so two workers on an old send never mark each other's person in flight — then redeliver the rest, never emailing anyone twice. Such a row is `skipped`/`failed` but keeps its token hash, because its email may have gone out (the worker died between SMTP and the mark): its unsubscribe link keeps working (365 days from the send's start) and `audience` counts it as sent for `already_received` and, for 3 days from the send's start, `recent_campaign` (`audience.MAYBE_SENT`); only a failure known to have sent nothing (composing or sending raised) clears the hash. A mail connection that will not open is logged by send id and class name and leaves everyone queued: `deliver` returns the send still `sending`, never raises, so Send now answers `201` with it. A review's approval never delivers: it answers `200` with the send committed `sending` and everyone queued, and the every-minute runner emails them. `claim` takes `expect_kind`/`expect_owner` and re-checks them under the campaign's lock (`CHOOSE_CAMPAIGN` on a mismatch), so the night and approval never read fired record ids as another kind's or build the audience as someone else. `finish` freezes the counts under the send's own `FOR NO KEY UPDATE` lock once nobody is left queued |
| `services/customers/canvas.py`, `canvas_payloads.py`, `canvas_views.py` | Canvas: `canvas.py` checks what a save may hold (people from the map's own record that the saver may open, plus anyone already on it) and lays out a map from people; `canvas_payloads.py` reads maps through two `id IN` subqueries and works out each person's facts (calls, mail under the mailbox rule, the latest survey answer from a send the reader may also read, the unsubscribed flag) for the reader in a fixed number of queries; a save locks the map's row `FOR NO KEY UPDATE` and compares `version` (409 `CANVAS_CHANGED`); delete is the creator's and their chain's (`subtree_ids`) |
| `services/account_story/` | The account page: `AccountScope` (one account, `visible_accounts`) and its Needs attention over the organisation story's engine (`services/organizations/story/`), and the flat `/accounts/<id>/…` routes that mount the nested account views (`scoping.get_url_account`) |

### 2.5 API conventions

- Base path `/api/v1/`, JSON only, no form-encoded bodies.
- Pagination: DRF `PageNumberPagination`, 25 per page, `{count, next, previous, results}`.
  Board-style endpoints (opportunities, risks, health) are deliberately unpaginated; the Pipelines page itself reads the cursor-paged `/pipelines/{kind}/` book, and the unpaginated lists remain for the Deals & risks tabs.
- Errors: DRF shape, `{"detail": "..."}` or `{"field": ["..."]}`.
- Identifiers: `BigAutoField` integers.
- Timestamps: ISO 8601 UTC, `USE_TZ = True`.
- Roughly 150 routes. Six are `AllowAny` by design: health, signup, login, token
  refresh, password reset request and confirm. Three more are unauthenticated
  callbacks with their own proof: the mail OAuth callback (signed state), the
  connector OAuth callback, and the inbound ticket webhook (shared token compared
  in constant time, or HMAC-SHA256 over the raw body).

Wire-level detail for every endpoint lives in [`docs/API_CONTRACTS.md`](../API_CONTRACTS.md)
and the generated OpenAPI schema at `/api/schema/`, `/api/docs/`, `/api/redoc/`.

### 2.6 Real time

| Route | Consumer | Gate | Pushes |
|---|---|---|---|
| `ws/copilot/sessions/<conversation_id>/` | `SessionConsumer` | The same `conversations_visible_to()` the REST endpoints use; otherwise close 4003 | `session.update` on every session event |
| `ws/notifications/` | `NotificationConsumer` | Authenticated user only; group per user | `notification.new` |

A WebSocket handshake cannot carry an Authorization header, so the access token
travels as `?token=`. `core/ws_auth.py` validates it with SimpleJWT before the
consumer runs. Under `manage.py test` the channel layer swaps to Channels'
in-memory implementation, so the suite never needs Redis.

---

## 3. Frontend

| Concern | Choice | Version |
|---|---|---|
| Framework | React + TypeScript | 19.2.8 |
| Build | Vite | 8.3.0 |
| State | Redux Toolkit, 27 slices | 2.12.0 |
| Routing | React Router | 7.18.4 |
| Styling | Tailwind CSS v4, tokens in `@theme` | 4.2.2 |
| Icons | lucide-react, exclusively | 1.43.0 |
| Charts | Recharts | 3.10.1 |
| Graph canvases | @xyflow/react | 12.11.6 |
| Validation | Zod, login form only | 4.5.4 |
| Tests | Vitest, Testing Library, jsdom | 4.1.10 |
| Browser automation for agents | @playwright/cli | 0.1.20 |

`src/lib/apiClient.ts` is the only HTTP path: it attaches the bearer token, and on
a 401 refreshes once, retries, then forces logout. `src/lib/socket.ts` opens
WebSockets against the same origin with the token as a query parameter and
reconnects every two seconds until told to stop.

The production image is a build stage only. It compiles the site and copies it
into a volume that Caddy serves; no Node process runs in production.

---

## 4. AI and model usage

| Aspect | Value |
|---|---|
| Provider | `COPILOT_LLM_PROVIDER`, `anthropic`, `bedrock` or `gemini` (Vertex AI, the runtime's own Google credentials, no API key; `GOOGLE_CLOUD_PROJECT`) |
| Default model | `claude-sonnet-5` via the Anthropic API, or `BEDROCK_MODEL_ID` on Bedrock; on Gemini, chosen per purpose (below) |
| Gemini tiers | lite `gemini-3.5-flash-lite` (asia-south1, thinking MINIMAL) for classification, translate, headlines, attribute; pro `gemini-3.1-pro-preview` (global endpoint only, default thinking) for brief and account_brief; flash `gemini-3.5-flash` (asia-south1, thinking MINIMAL) for every other purpose. `GEMINI_TIERS` / `GEMINI_PURPOSE_TIERS` in settings, each overridable by environment. Thinking tokens share Gemini's output budget, so each call gets the tier's headroom on top of `max_tokens` and thinking counts as output in `ModelCall`. Measured from Mumbai on 2026-10-15: lite about 0.9 s and flash about 1.6 s for a short CSM answer; flash at LOW thinking took about 5 s |
| Entry point | `services/copilot/anthropic_client.get_completion(...)`, the only call site |
| Purposes | copilot, headlines, classification, brief, proposals (history only), facilitator, explain, agent_cs, agent_sales, agent_ops |
| Budget | `ModelBudget` per organisation per purpose per month, default 2,000,000 tokens |
| Over budget | `BudgetExceeded` becomes HTTP 429 in views and a command error in the CLI |
| Not configured | HTTP 503, never a silent failure |
| Provider failure | HTTP 502 |
| Audit | One `ModelCall` row per call: purpose, model, tokens, latency, outcome. No prompt or completion text is stored |
| Embeddings | `services/copilot/embeddings.py`. Gemini `gemini-embedding-001` @768 (`EMBEDDINGS_PROVIDER=gemini`) on Cloud Run; local `all-MiniLM-L6-v2` in development. Every vector is stored once per workspace in `copilot.TextEmbedding` (pgvector, keyed by the text's SHA-256), and Copilot ranks candidates with pgvector cosine distance in Postgres. Retrieval uses Gemini's query and document task types, clustering its similarity type. Thresholds are written on the local model's scale and mapped to Gemini's through measured anchor points (`embeddings.threshold`). Unused vectors are pruned nightly after `EMBEDDING_RETENTION_DAYS` (30) |
| Retrieval | Company identified by mention or semantic match above 0.3, then recent records become snippets with citations |

Under `manage.py test` every provider key is blanked in settings so a test cannot
reach a live model.

Briefs and explanations are also written per Brain scope; `ModelCall.scope_key`
records the scope, and two writes of the same scope's brief (or the same
scope and metric's explanation) are serialised by a Postgres session-level
advisory lock (`services/brain/locks.held`), taken outside any transaction
so the model call never holds a database row lock, making two clicks one
call.

---

## 5. Scheduled and background work

There is no queue. Work runs either in the request, or as an idempotent
management command on a timer.

| Command | Cadence | What it does |
|---|---|---|
| `run_health_maintenance` | Daily | Nudge and escalate overdue Work tasks (workspace-local day, once only), classify new interactions, recompute contact sentiment, recalculate health, write the month-end health snapshot, append a daily pulse dot, record month-end metrics, nudge stale questions, record month-end scope snapshots (Me for every owner, My team for every manager, each counted by that member's own record rules; only within 3 days after the month end, one failing scope never stopping the rest), clear snoozes expired over 30 days ago and Work `DigestSend` rows over 30 days old |
| Agents' pass (inside `run_health_maintenance`) | Daily | Runs after health, sentiment, anomalies and the rest are fresh and *before* Recommended, so new actions are routed the same night (the spec said after; that would delay routing a day). One model call per agent per workspace, each agent and workspace failing on its own; only active workspaces |
| `deliver_pending` | Every minute (the `sender` service) | Send each person's Work daily digest once per local day (skipped, unclaimed, while the server cannot send email); email every campaign and survey send still `sending` and finish it (Send now only claims), resuming any send a crash cut off from whoever is still queued. Each person is taken by one conditional `UPDATE` on the row's own columns, so overlapping runs never email anyone twice; two queries, plus one for the workspaces and one per workspace past its digest hour; the digest batch shares the minute loop with campaign and survey sends (`EMAIL_TIMEOUT` 30 s per hung send). `DigestSend` rows accrue per member per working day; `run_health_maintenance` deletes those whose `local_date` is more than 30 days back (`work.digest.prune_sent`) |
| `sync_mail --loop` | Every 5 s (the `mailsync` service) | Claims due mailboxes under a lease: Gmail every 60 s or on a push (history, one import page, labels, the watch), Outlook and IMAP every 10 minutes; sweeps the Gmail gates once a minute |
| `sync_tickets` | Every 10 minutes | Pull each connected ticket source |
| `classify_interactions` | On demand and inside the daily job | Paid model calls, batched 20 at a time, `--limit` recommended |
| `recalculate_health` | On demand | Scores only, no snapshot |
| `nudge_open_questions` | On demand and inside the daily job | |
| `export_access_review` | Quarterly, for audit | CSV of users, roles, capabilities, last login |

Two behaviours to preserve: health snapshots are **monthly**, dated the last
completed month end, and a month already recorded is **skipped, never
overwritten**. Re-running the job any number of times is safe.

In-request background-ish work: outbound webhook delivery and scenario
On-Event runs execute synchronously in the request, on
`transaction.on_commit`. Survey and campaign Send now only claim the send
(validation, limits and audit in the request) and answer it `sending`; the
`deliver_pending` command, every minute, emails it. A rule review's
approval still delivers straight after its commit, and the nightly rules
step also finishes campaign sends; any of them may overlap without
emailing anyone twice.

Twenty-five `seed_demo_*` commands exist for demo data. They are idempotent, and
orchestrated by a single `seed_demo` command. Re-running `seed_demo_customers`
writes fixture health scores back, so run `recalculate_health` afterwards.

---

## 6. Security

### 6.1 Authentication

| Control | Value |
|---|---|
| Password hashing | Argon2id, PBKDF2 retained for upgrade on login |
| Password policy | Minimum 12 characters plus similarity, common-password and numeric validators |
| Access token | 60 minutes |
| Refresh token | 7 days, rotated on use, previous one blacklisted |
| Idle session (admin) | 30 minutes, refreshed on each request |
| Reset token | 1 hour |
| MFA | Not implemented, formally excepted |

### 6.2 Rate limiting

Per-scope throttles backed by Redis: login 10/min per IP, login 5/min per hashed
email address, signup 5/hour, password reset 5/hour, token refresh 30/min. All
tunable by environment variable and disabled under test.

### 6.3 Authorisation

Three independent layers, each with exactly one definition in code:

1. **Tenant.** Every row hangs off an `Organisation`, directly or through a
   customer or account.
2. **Capability.** DRF permission classes map to the six capabilities.
3. **Record visibility.** `scoping.visible_customers`, `personal.visible_notes`,
   `visible_tasks`, `visible_tickets`, `mail.visibility.visible_emails`,
   `pipeline_visible_q`, and `copilot.conversations_visible_to`. The Copilot
   applies the same rules to retrieval, and withholds a reply that cites records
   the viewer may not read.

### 6.4 Transport and browser hardening

HSTS one year with subdomains, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, a restrictive
`Permissions-Policy`, secure and HttpOnly cookies, and a Content Security Policy
set by Caddy for the SPA: scripts from self only, styles inline plus Google
Fonts, images from self plus the logo provider, connections to this origin only,
`frame-ancestors 'none'`. TLS terminates at Caddy, so Django's own SSL redirect
is deliberately off and `SECURE_PROXY_SSL_HEADER` is set instead.

### 6.5 Logging and audit

`core/audit.py` writes an append-only `AuditEvent` and a structured log line for
every security-relevant event. The catalogue is in
[`docs/audit-events.md`](../audit-events.md). `core/logging.py` redacts bearer
tokens, JWT-shaped strings and password, token, secret, api_key and authorization
pairs before any handler sees the record, and emits one JSON object per line
outside debug. No request bodies or headers are logged.

### 6.6 Secrets

| Secret | At rest |
|---|---|
| Mailbox credentials (OAuth tokens, IMAP passwords) | Fernet-encrypted with `MAIL_TOKEN_KEY`, derived from `SECRET_KEY` when unset |
| Connector credentials | Same |
| User passwords | Argon2id |
| Webhook signing secret | **Plaintext column.** Known gap, `.soc2` DATA-02 |
| Bedrock credentials | Static AWS key in the environment file on the VM. Known gap, INFRA-03 |
| Gemini (Vertex AI) | No key: Cloud Run's service account through Application Default Credentials |
| SPA tokens | `localStorage`. Known gap, AUTH-05 |

### 6.7 Outbound request safety

Mail and connector providers may only reach a fixed host allow-list. Outbound
webhooks go through an SSRF guard, HTTPS only, no redirects followed, a five
second timeout, and an HMAC-SHA256 signature header.

### 6.8 Compliance posture

Both repositories carry a `.soc2/` directory: configuration, a control map, an
exceptions register and scan reports. Scope is the Security and Confidentiality
trust service criteria. As of the 2026-09-15 gap report and the 2026-09-16
remediation, 30 of 44 applicable controls are met.

Open items worth planning around: no retention purge job (DATA-04), logs are not
shipped off the machine (LOG-04), no alerting (LOG-05), webhook secret plaintext
(DATA-02), tokens in `localStorage` (AUTH-05), static Bedrock key (INFRA-03), no
signed commits (CHG-08), no release tags (CHG-06), MFA excepted to 2027-03-31.
All three exceptions still name `[TODO: name]` as approver.

---

## 7. Deployment

### 7.1 Topology

One Azure `Standard_B2ls_v2` virtual machine, 2 vCPU and 4 GiB, 64 GiB SSD, in
South India, created by Terraform in `revenact-infra`. Cloud-init installs
Docker, clones both repositories with read-only deploy keys and brings the stack
up. Seven containers: `caddy`, `backend` (Daphne), `scheduler`, `mailsync`,
`frontend` (build then exit), `db`, `redis`.

Live at `https://revenact.20-219-7-222.sslip.io`. TLS is automatic Let's Encrypt
against the sslip.io hostname, so no DNS setup is needed. Cost is roughly
39 dollars a month with the machine always on.

Model calls go to Bedrock and bill to AWS, not to the Azure credits. Embeddings
ran locally on CPU there; on Google Cloud they come from Gemini and are stored
with pgvector (section 5).

### 7.2 Continuous delivery

Every push to `main` of either application repository starts a Cloud Build
build (`cloudbuild.yaml`) in `revenact-prod`: it builds the image, pushes it to
Artifact Registry and hands its digest to the public `aggtushar123/revenact-deploy`
repository. That repository's workflow records the digest in `releases/`, runs
migrations as a Cloud Run Job, rolls out the web service, smoke-tests the public
URL and rolls back on failure. It deploys as `gh-deployer` through Workload
Identity Federation, so no key is stored. Section 7.4 has the details. The
Azure path (OpenID Connect into `az vm run-command`) is retired.

### 7.3 CI gates

GitHub Actions no longer runs in the application repositories: the account is
out of Actions credits, and both workflows were removed on 2026-10-15. Every
pull request to `main` runs these as Cloud Build checks instead, reported on the
pull request by the Cloud Build GitHub app (triggers in
`revenact-deploy/terraform/cloudbuild.tf`):

| Repository | Tests (`cloudbuild-ci.yaml`) | Security gates (`cloudbuild-soc2.yaml`) |
|---|---|---|
| Backend | ruff lint and format check, the shard-coverage check, migrate, and the full suite on Postgres 16, as four shard builds | gitleaks, `pip-audit --strict`, semgrep (security-audit, secrets, OWASP top ten, Django), Trivy filesystem scan blocking on critical and high plus a report-only Dockerfile scan, and the SOC 2 scan and control-map drift check |
| Frontend | `npm ci`, lint, Vitest, build | gitleaks, `npm audit --omit=dev --audit-level=high`, semgrep (plus React and TypeScript rules), and the same SOC 2 scan |

CI tool images are pinned by version. Dependabot runs weekly with grouped minor
and patch updates. The checks cannot be required while the repositories are
private on GitHub Free (SOC 2 exception EX-002).

### 7.4 Google Cloud (replacing Azure, in progress)

The Azure subscription has been disabled since 2026-10-07. The replacement runs
on Cloud Run in `asia-south1`, project `revenact-prod`. The backend image is built
by Cloud Build (`cloudbuild.yaml`) on every push to `main`. Cloud Build pushes it to
Artifact Registry (`asia-south1-docker.pkg.dev/revenact-prod/revenact/backend`)
and sends its digest to the public `aggtushar123/revenact-deploy` repository,
which runs migrations as a Cloud Run Job (`python manage.py migrate --noinput`;
the image's command only starts Daphne) and rolls the image out. In the web
service Daphne listens on 8000 as a second container behind the frontend's nginx
container on 8080, so the SPA, `/api`, `/ws`, `/admin` and `/static` share one
origin. Uploads go to the private bucket `revenact-prod-media` (`GS_BUCKET_NAME`),
still read only through the authenticated download views. The CI workflow's
Azure deploy job is removed. Infrastructure lives in the deploy repository.

### 7.5 Backups

Daily at 13:00 IST a `pg_dump -Fc` plus the media directory is uploaded to a
private Azure storage account using the machine's managed identity. Blob
versioning and soft delete are on, blobs expire after 35 days, and the last week
also stays on the machine. A restore was tested on 2026-09-16; the next test is
due 2026-12-16.

---

## 8. Non-functional requirements

| Requirement | Target | How it is met today |
|---|---|---|
| Availability | Business hours for a shared team demo | Single VM, containers restart unless stopped, stack returns on boot. No redundancy by design |
| Recovery point | 24 hours | Nightly database and media backup |
| Recovery time | Under an hour | Documented restore procedure in the infra README, tested |
| Request latency | Interactive pages under a second on the demo book | No load testing has been done. The known heavy paths are the health endpoint (unpaginated by necessity) and any model call |
| Model latency | Seconds, visible to the user | Single-shot call, no streaming. Latency recorded per call in `ModelCall` |
| Data volume | Small: tens of customers, thousands of interactions | Postgres on one disk, plain B-tree indexes, no partitioning |
| Tenant isolation | Absolute | Every query goes through a scoping helper; two end-to-end tests assert cross-tenant 404s |
| Auditability | Every security-relevant change | Append-only audit table, 365 day retention |
| Browser support | Current Chrome, Safari, Firefox, Edge | ES2023 build target, no polyfills |
| Accessibility | WCAG 2.1 AA as the stated bar | Partially met, see the UI/UX document's conformance section |

---

## 9. Testing

| Tier | Backend | Frontend |
|---|---|---|
| Unit | `<app>/tests/test_<unit>.py` | Slice and helper tests under `src/features/` |
| Integration | `APITestCase` in `test_views.py`, real stack and test database | Component tests with Testing Library |
| End to end | `e2e/`, `LiveServerTestCase` over real HTTP, no browser | Route-level component tests; browser driving is available through `npm run pw` |

Roughly 1,509 test methods across 78 backend files, and 111 frontend test files.
Under test the backend swaps to the MD5 hasher (Argon2 pushed CI to 13 minutes),
an in-memory channel layer, a local-memory cache, disabled throttles, blanked
model keys and a temporary media root.

Rule inherited from experience: never chain a commit onto a grep of test output,
because grep exits zero when it *finds* the word FAILED. Gate on a match for
`^OK`. And never run two Django test suites at once; the second hangs on the
"test database exists" prompt unless `--noinput` is passed.

---

## 10. Known technical limitations

Deliberate, with the reasoning recorded:

- No task queue. Revisit when work needs retries or fan-out.
- FX rates are current only, with no history.
- Stored vectors have no ANN index yet (pgvector exact distance over a workspace's candidates); add HNSW when a workspace's corpus outgrows exact search.
- Copilot does not stream. A plain send on Gemini may call `search_records` up to 3 times before answering (agentic retrieval, `services/copilot/agentic.py`); Ask surfaces are still one model call per send.
- Scenario "Schedule" trigger has no scheduler behind it; rules (`services/rules`) have weekly and monthly schedules, run nightly.
- Surveys ask one standard question per send; no custom or multi-question surveys, no reminders.
- Notifications are in-app only (no email yet). Ticket and pipeline assignees are still plain text.
- Only five of the thirteen connector providers have implementations.
- Outbound webhooks support one event.

Stale documentation that contradicts the code, and should be fixed rather than
trusted: both repositories' `.agents/workflows/repo-architecture.md`, the backend
`auth-flow.md` (references `/csms/` and `IsOrgAdmin`, which no longer exist), the
frontend `README.md` (claims the app runs on in-memory fixtures), and several
status rows in `docs/API_CONTRACTS.md`.

## Agents (delivery 1)

- **The pass.** `services.agents.run.run_all` is called from `run_health_maintenance` before `recommend.refresh_all`. One model call per agent (`purpose=agent_<kind>`), at most 8 actions as a JSON array, an empty book makes no call.
- **The registry.** `services/agents/registry.REGISTRY` defines the 10 kinds once: `validate`, `current`, `preview`, `apply`, `undo`, the target key and the maximum level (`auto` or `ask`). The prompt, the drop rules, the settings grid and the previews all read it.
- **Drop rules.** A kind the agent may not use or that is Never; a record not in the evidence; an evidence quote that is not the action's own (see Evidence matching); a payload `validate` refuses; a title, rationale or note text naming another book record (not for `initiative.create`) or a task or note title the evidence holds outside the action's own record; a task or note title from the action's own record that someone who may open that record may not read (owner decision 2026-10-08: previews hide such a title per reader, free text cannot, so the action is dropped; `evidence.withheld_mentions`); an identical open action (counted as re-proposed); the same action rejected or undone in the last 14 days. A partial unique constraint keeps one open action per kind, record and target, and a pass treats any open action on the same record and target as the twin whatever its kind (`task.redate` and `task.snooze` share `task:<id>:due`; a different kind is never the same, so the newer replaces it).
- **Evidence matching.** Both sides are normalised (no leading "- ", no quotes, single spaces, casefolded). A quote is kept when it equals one of the action's own lines, or is a fragment of at least 12 characters of exactly one own line and of no other record's block; the matched own line is stored as the evidence label.
- **Locks.** Deciding takes the action's row lock first, then the recommendation's. Expiry, approve, reject, undo and Auto apply all go through it, and a row decided meanwhile is left alone.
- **Expiry.** `changed` (the thing no longer equals the action's `before`, checked at approve and before an Auto apply), `date_passed` (a create, redate or snooze whose date passed while it waited, found at apply), `waited` (14 days proposed), `never` (the kind was set to Never), `not_reproposed` (a successful pass did not propose it again; facilitator and migrated rows are exempt; an empty book counts), `replaced` (same kind, record and target, new payload).
- **Budget accounting.** Spend is the count of `ModelCall` rows with purpose `agent_<kind>` and `outcome=ok` since local midnight on the 1st, times `BILLING_CREDITS_PER_MODEL_CALL`. A model call that fails is refunded; a reply that can't be read still costs its credit. The budget is checked before the call, not reserved, so a nightly pass and a Run now running at the same moment can each spend one call past the budget. The default budget, `round(plan credits * 0.2 / 3)`, is stored on the `AgentProfile` when it is made.
- **Undo.** 7 days from `applied_at`; refused when the thing has changed since. Approving or undoing `record.owner` also needs the owner-change right (`knowledge.ownership.may_change_owner`); `deciding.may_decide` is that rule, and Waiting's `can_decide`, undo's `cant_decide` and Recommended's decide rule (`work.rec_access`) all use it.
- **Privacy.** Every list combines the action's own rule with a record the reader may open (`id IN` subqueries, no DISTINCT, for Postgres 16, the Ops agent's figures included since delivery 2); anything else is counted, not named. Evidence lines go to view_all_accounts readers only. Evidence about notes and tasks follows the record owner's visibility; free text in prompts (task titles, note titles) is quoted as data; and each action may cite only its own record's evidence. A preview names an existing task only to a reader who may read that task (`visible_tasks`, one query per page); anyone else sees "A task you can't see".

## Agents (delivery 2): drafts and plans

- **Two kinds.** `draft.reply` (CS, Sales; Auto allowed) and `plan.start` (CS, Sales; Ask only) join the registry after `note.create`. The contract is `docs/superpowers/plans/2026-10-08-agents-drafts-api.md`.
- **Drafts live in Revenact.** No provider can hold a draft (Gmail is read and send only, Graph `Mail.Read`/`Mail.Send`, IMAP has no APPEND, no ticket connector writes back), so `customers.ReplyDraft` is the row. An email draft is sent from its owner's mailbox through `mail.sync.send_email`; a ticket draft is copied by hand and marked sent. One open draft per source (partial unique constraints).
- **Evidence.** CS and Sales books gain, per record, the newest unanswered received email in the record owner's own connected mailbox (nothing newer in its thread, no open draft, no applied draft reply) and the newest open ticket the owner may read (no open draft, no draft reply applied in the last 7 days, `TICKET_REDRAFT_DAYS`), each quoted as data and cut to 300 characters, plus the record's open plans and one block of shared templates (built-ins and `sharing="workspace"`, at most 20). `id IN` filters, no DISTINCT.
- **Drop rules.** Only a draft cites an email or ticket line, and only its own; no other action names its record's email subject or ticket title; a draft names no task or note title (any record) nor its record's other source; other records' subjects and titles are foreign to every action (`evidence.source_lines`, `source_mentions`, `internal_mentions`, `foreign_mentions`).
- **The source gate.** A `draft.reply` action is read and decided only by readers of its source (`agents.source_access.unreadable_draft_ids`, one `id IN` subquery over `target`). Activity, the detail and decision routes, undo, Work › Recommended (`rec_access.openable`, `decided_as`, and the source, which routes a draft only to an owner who may read it) and Brain › Waiting all apply it; the rest is counted in `hidden`. A page's checks are one query per reader (`bulk.Bulk.unreadable_drafts`).
- **Expiry.** A ticket draft expires only when its ticket is resolved or closed; moving between open statuses does not expire it. An email draft expires when its thread moves on.
- **Plans.** `Plan.Status.DRAFT` is not open. Undoing an agent's `plan.start` returns the plan to Draft (`plans.drafting.return_to_draft`: tasks kept in `draft_tasks`, then deleted); `POST /plans/<id>/start/` makes them again, dates moved to today (`start_from_draft`, locking the workspace, the record, then the plan).
- **Locks.** Undo locks the action, then its draft or plan. The draft routes lock only the draft; Send locks it again around the provider call, so a second Send finds it sent.
- **Threading.** `send_email(..., answering=)` files a reply on its original's thread when the provider names none, and sends `In-Reply-To`/`References` when the original's id is a Message-ID. This covers the Communications reply, the mail inbox reply and a draft's Send.
- **Delivery 1 follow-ups.** A hidden or removed task's preview id is `null`; the `/metrics/proposals/` routes and the legacy delegates are gone; the Ops figures read without DISTINCT (`customers.contact.parent_in_q`).

## Agents (delivery 3): the builder

- **Five kinds.** `segment.create`, `scenario.create`, `campaign.create`, `plan.template` (Ops, workspace-level) and `canvas.create` (every agent, record-level) join the registry after `plan.start`, all capped at Ask. The contract is `docs/superpowers/plans/2026-10-08-agents-builder-api.md`.
- **Apply as the approver.** Each kind reuses its object's own write serializer with the approver as the request's user, inside the decision's transaction (`services/agents/builder.py`); a refused check expires the action, an owner limit (`OwnerLimit`) rolls the decision back as `409 OWNER_LIMIT`. Objects keep the action (`agent_action`), shown as `made_by`.
- **Per-reader previews.** `Kind.per_reader`: a segment's members (`builder.member_counts`, one `id IN` aggregate per segment kind per page) and a map's people (`people.visible_people`) are counted as the reader, once per page in `bulk.Bulk`.
- **Evidence and drop rules.** The Ops prompt gains the builder catalogue and the workspace-shared segments and templates; every record block gains a people-by-role line. `Kind.texts` lists every free-text field for the naming rules; a workspace object's own text (`Kind.texts`) names no record (`record_mentions`), while the action's title and rationale may quote the figures' accounts; one builder action is kept per pass.
- **Graph.** `brain/graph.py` draws `agent_action` nodes from `desk.agent_actions(...).readable`, with `acts_on` to drawn organisations and `serves` to drawn initiatives.
- **Send claims first.** A draft reply is claimed (`sending`, a conditional UPDATE, committed) before the provider is called. A provider refusal opens it again; a read timeout after the request went out (`TimeoutError`) leaves it `sending` (504 `SEND_UNCONFIRMED`), since it may have gone; over SMTP, a dropped connection or timeout once the message was handed over (`smtp.send_message`) raises `mail.providers.base.SendUnconfirmed` (a `TimeoutError`, not a `ProviderError`) to the same effect, while a coded refusal still reopens it. Any connection failure or `http.client.HTTPException` after the request went out is also 504; a token refresh failing (Google, Microsoft `_fresh`) is a `ProviderError`, since nothing was sent. The success write and the refusal's reopen are conditional UPDATEs on `status=sending AND updated_at = <the claim's stamp>`, so a late answer never overwrites a draft its owner reopened, sent again or discarded; a late success then answers 409 `SEND_SUPERSEDED`, still filing and auditing the email (`mailbox.reply`, from what was read at the claim), not `reply_draft.sent`. The payload's `sending` reads `pending`, then `unconfirmed` once `UNCONFIRMED_AFTER` (10 minutes) has passed since the claim (`updated_at`); then the owner settles it with `confirm-sent` (sent, no filed email) or `reopen` (open again), each one conditional UPDATE on `status=sending AND updated_at <= now - UNCONFIRMED_AFTER`, so two clicks never both win.

## Agent bundles (delivery 3): outside actions

- **Agent bundles D3 (2026-10-13).** `services/agents/outside/` (`tools.py` the facade over `services/mail/agent_send.py` and the Slack/Jira providers; `keys.py` the key and look-back; `gates.py` the tool gate; `trail.py` `agent_outside.call`; `sentences.py`; `options.py` the pick lists; `offered.py`), the kinds `actions/mail_replies.py`, `slack_replies.py`, `jira_issues.py`, `failure_notice.py`; connectors gain `agent_access.py` and browser-bound OAuth (`core/oauth_browser.py`, shared with mail's OAuth). One outside write per step, last in its transaction; a Retry looks first; nothing outside on Auto, a nightly pass or the intake.
- **Mail.** `services/mail/sync.send_email` is split into `send_via_provider` (the provider call) and `file_sent` (filing the copy); an agent's send calls them apart and files its copy best effort in a savepoint, so a filing failure never fails a step whose email has gone out.
- **Ceilings.** `OUTSIDE_DETAIL_QUERIES` 8, `OUTSIDE_HISTORY_QUERIES` 7, `OPTIONS_QUERIES` 8, `THREAD_RUN_QUERIES` 33 (was 32: the workspace's Jira connector is read once per thread run); no query uses `DISTINCT`. `AGENT_TOOL_TIMEOUT_SECONDS` (default 15) bounds Slack and Jira calls.

- **Agent bundles round 2 D1 (2026-10-13).** `jira.comment` (`actions/jira_comments.py`; `JiraProvider.add_comment` and `find_comment`, found again by the ref and the footer's closing period; the `ADD_COMMENTS` scope). `services/mail/signing.py` adds a mailbox's signature in one place (it imports `send_as` lazily to avoid a startup import cycle); Outlook replies go through Graph's reply (`MicrosoftProvider.held` finds the original by Message-ID, `_reply`, fallback `sendMail`); `html.restore_signature` keeps an edited Gmail draft's signature whole; `PATCH /mail/connection/` writes an Outlook signature. Ceilings unchanged: `OUTSIDE_DETAIL_QUERIES` 8, `OUTSIDE_HISTORY_QUERIES` 7, `OPTIONS_QUERIES` 8, `THREAD_RUN_QUERIES` 33; `MAILBOX_QUERIES` 5 (Outlook) / 9 (Gmail).

- **Agent bundles round 2 D2 (2026-10-14).** `services/connectors/jira_links.py` (Atlassian 3LO: authorize URL, code exchange, accessible-resources, `/myself`; `Seat(config, creds, person, name, link_id)` and `seat_for(connector, link)`; `fresh_token` refreshes under `select_for_update` and stores the rotated pair at once; `warm(link)` refreshes a link expiring within `JIRA_LINK_WARM_SECONDS` (900) in its own committed transaction, called before any step transaction; `lose` marks a link lost and audits it). `services/connectors/link_views.py` (the four routes; the callback is bound to the starting browser by `core/oauth_browser.py`). `JiraProvider` takes `config["api_base"]` (`https://api.atlassian.com/ex/jira/<cloud_id>`) and sends Bearer when the credentials hold `access_token`; `auth.atlassian.com` joins `ALLOWED_HOSTS`. `services/agents/outside/seats.py` resolves the runner's link once per reader (`bulk.Bulk.jira_link`) and the seat per step; `gates.blocked` adds the lost-link and private-Slack rows. `services/agents/outside/slack_channels.py` reads `users.conversations` (`SlackProvider`), pages at most 5 times, caches `[{id, name, private}]` per connector in Django's cache (LocMem in tests and DEBUG, Redis in production) under `agents:slack-channels:<id>` for 300 seconds, and builds the `live=1` options. `agent_send.blocked` answers `RECONNECT` for blank credentials (N1). Ceilings: `OUTSIDE_DETAIL_QUERIES` 9, `OUTSIDE_HISTORY_QUERIES` 8, `OPTIONS_QUERIES` 9, `SLACK_OPTIONS_QUERIES` 4, `JIRA_LINK_QUERIES` 2. Settings: `ATLASSIAN_OAUTH_CLIENT_ID`, `ATLASSIAN_OAUTH_CLIENT_SECRET` (empty: linking off).

## Agent bundles (round 2 delivery 3): wider intake

- **Unmatched items.** `services/connectors/unmatched.py` (`keep` from `file_ticket`, `purge` from `sync_tickets`, `queue_of`/`waiting_in`/`count`/`page` for the lists and the rail, `match`, `dismiss`); `services/work/unmatched_views.py` serves the three routes; `services/work/queues.py` adds `needs_customer`. Model `connectors.UnmatchedItem`. Constants `EXCERPT_CHARS` 2000, `KEEP_DAYS` 30, `MAX_WAITING_PER_CONNECTOR` 500, `PAGE` 25. No `SignalThread` exists for an unmatched item, so no model reads it; a matched one is filed as a Ticket and read as any thread.
- **The fast lane.** `services/agents/fast_lane.py` (settings, `clean`, `used`, `rule_for`, `for_ticket`, `for_email`); `SignalThread.urgent_rule` is stored when a message is filed; `intake.run_fast` reads urgent quiet threads (2 minutes) on a 5-minute tick claimed through `Organisation.ai_fast_ran_at`, at most 10 a tick within the hour and day caps counted from `ModelCall.scope_key = "fast_lane"`.
- **The loop.** `run_agent_signals --lane interval|fast|both` runs each lane in its own guard; `docker-compose.yml`'s `agentsignals` sleeps 300 seconds. Production (`revenact-infra`) needs the same service every 5 minutes; no new env var or OAuth scope.
- **Ceilings.** `UNMATCHED_LIST_QUERIES` 5, `UNMATCHED_MATCH_QUERIES` 22, `SETTINGS_QUERIES` 25, `FAST_TICK_QUERIES` 8, `THREAD_RUN_QUERIES` 33, `ROUTED_QUEUE_QUERIES` carl 32; no `DISTINCT`. Contract: `docs/superpowers/plans/2026-10-14-agent-bundles-r2d3-api.md`.

## Two-way Gmail (delivery 1): the sync engine

- **Engine.** `services/mail/loop.py` claims due mailboxes in a short transaction (`select_for_update(skip_locked=True)`, `lease_until`), then works outside it, so push's `UPDATE wake_at` never waits (contract decision 18). `gmail_sync.tick` mirrors labels, applies `history.list` since `history_id`, runs one reconcile page and one import page, and renews the watch. The engine writes the connection only with named fields.
- **Recovery.** A history 404 takes `getProfile.historyId` first, then re-lists the last `MAIL_RECONCILE_DAYS` a page per tick (anchored on `reconcile_started_at`) and deletes rows in the window it did not see that existed before it began.
- **Errors.** `ProviderError` carries `status`, `reason` and `retry_after`. 429, 5xx, no answer and rate-limit 403s back off (`min(30 s × 2^(n−1), 15 min)` or Retry-After); `invalid_grant`, a second 401 and `insufficientPermissions` pause with `token_revoked`. A token refresh needs the person only for a lost grant.
- **Gates and pauses.** `services/mail/gates.py`: workspace switch, active membership in an active workspace, an open seat, a verified domain matched exactly; the pause precedence `token_revoked`, `workspace_off`, `suspended`, `no_seat`, computed live for the API and in bulk once a minute; a paused Gmail never sends (409 `MAILBOX_PAUSED`).
- **Push.** Pub/Sub OIDC verified with PyJWT against Google's JWKS (no Google SDK), fail-closed, rate-limited, a wake-up only.
- **Dependencies.** `nh3` (Rust `ammonia`) sanitises mail HTML at store; `cryptography` pinned (Fernet and RS256).
- **Retention.** Google disconnects keep the person's copies 30 days; `run_health_maintenance` prunes them.

## Two-way Gmail (delivery 2): actions

- **The outbox.** `services/mail/outbox.py` turns an action into one `MailOutbox` row per (message, label) change in the request's transaction, with the messages and their pending rows locked. A change back to a pending row's `previous` deletes it; the row is changed at once (`label_ids`, then `gmail_store.derive`); the mailbox is woken on commit.
- **Locking.** Every write request locks its messages in pk order (`actions.lockable`), then its connection row with `select_for_update(no_key=True)` (`actions.lock_connection`) and checks against that fresh row. `POST mail/labels/` locks its connection row the same way before its refusal checks. The flush's back-off, a failure (marking rows failed, the revert, unwinding a label) and `outbox.unwind_label` lock messages in pk order (`outbox.lock_messages`, including every message carrying the label's `pending:<id>` key) before any outbox row. Disconnect locks the messages with live outbox rows or carrying a made-here label's key before deleting live outbox rows and unwinding made-here labels, in one transaction with the status change. PATCH and bulk share `actions.run` and `actions.labels_for`.
- **The skip rule.** `gmail_store.relabel(..., held=)`: a label with a pending or sending row keeps its local presence through history, the reconcile and a store, and the row's `previous` takes Gmail's value. Once sent, Gmail wins again.
- **The flush.** `services/mail/outbox_flush.py` is step 1 of every tick under the lease: label creations (the `pending:<id>` key rewritten to Gmail's id everywhere, a 409 adopting Gmail's label), `batchModify` per (add, remove) set with single `modify` when a batch is refused, then `trash`/`untrash` capped per tick. Rows are `sending` during a call, recovered after `MAIL_LEASE_SECONDS`; the claim is checked before every call.
- **Failures.** 404 fails at once; 5xx, no answer and other refusals count and wait 30 s, 2 m, 10 m, 1 h, failing on the fifth (a 5xx also backs the mailbox off); rate limits and lost grants count nothing. A failed row is reverted unless a newer action on the label stands; one `mail_action_failed` notice per action and reason. `sync_issue` is cleared only by a later row of another action, never by a sibling row of the same action.
- **Conversations.** `services/mail/threads.py`: the newest matching message per thread by a `RowNumber()` window (no DISTINCT over a join); fixed query counts.
- **Attachments.** `services/mail/attachments.py`: fetched on first open through the owner's mailbox, cached, typed only when name, declared type and bytes agree, inline only for images and PDFs, twice-filtered for filed mail and audited (`mailbox.attachment_downloaded`); deleted with the row. Security headers are shared with the Files tab (`services/customers/files.py:file_headers`).
- **Retention.** The nightly `run_health_maintenance` prunes sent outbox rows after 24 hours (kept while their message has a failed row inside the 7-day issue window) and failed ones after 7 days.

## Two-way Gmail (delivery 3): writing

- **Drafts.** `services/mail/drafts.py`: `MailDraft` (owner-only) with a Drafts row that is a `pending-draft:` placeholder until Gmail creates it; content checked, HTML sanitised, text derived; one pending draft row per draft (no body); `revision` refuses stale editors (409 DRAFT_CHANGED).
- **The flush.** `services/mail/draft_flush.py` after label creations and before label rows: MIME built at flush time (`services/mail/mime.py`), sent through Gmail's upload endpoint (`providers/base.http_upload`); updates wait for a create in flight; a lost Gmail draft is recreated; failures keep the writing.
- **The reconcile.** `services/mail/draft_sync.py`: `drafts.list` after any draft change, the import's end and the daily send-as refresh; adopt, take Gmail's edit, settle vanished drafts (sent or discarded); a live Revenact edit wins.
- **Sending.** `services/mail/draft_send.py`: parts cached, then the claim (committed), then `drafts.send` or `messages.send`, never retried; the draft's row becomes the sent copy, filed with `get_or_create`, Message-ID read back. Every Gmail send threads (`sync.answering_headers`).
- **Search.** `services/mail/gmail_search.py`: live `messages.list`, nothing stored until opened.
- **Retention.** Sent drafts pruned after 7 days by `run_health_maintenance`, and discarded drafts left behind (no live outbox row) 7 days after the discard.

## Slack escalations (delivery 1): Slack as a conversation

- **Reading** (replaced by delivery 3 below: events, then a catch-up of one page and one thread a pass; connect takes no channel). `SlackProvider.fetch_threads` (`services/connectors/providers/slack.py`) read top messages of the last 7 days (`WINDOW`) and, for threads whose `latest_reply` changed, `conversations.replies` (threads already stored first, then new ones, oldest first, at most `MAX_REPLY_THREADS` 50 a pass). `fetch_tickets`, `DONE_REACTIONS` and `URGENT_WORDS` are gone. Connect refuses a channel the bot is not in and records the bot's `config.bot_id` / `config.bot_user_id` (only that bot's posts are stored `ours`; another app's reply keeps its own name); `config.external_shared` is refreshed each pass. One thread's failed replies read leaves it as stored for the next pass, and `ratelimited` stops reading replies for the pass; `thread_broadcast` replies are kept.
- **Filing.** `sync.sync_conversations` and `sync.file_conversation` (returns `(outcome, conversation)`: created, updated, unchanged or unmatched) make a `customers.SlackConversation`; the customer is found by `sync._scoped` (the connection's one record), then `services/connectors/naming.py` (`covered_names`, `find`; a folded whole-word name, an account dropped when its customer matches too), else `unmatched.keep(..., candidates=)`. `threads.touch_conversation` wakes the agents only for a new human message.
- **Reading by people.** `personal.visible_conversations` (the ticket rule, after the record's scope) feeds the story's `slack` kind (`services/organizations/story/`), `services/customers/slack_views.py` (`GET /slack-conversations/<id>/`) and a shared Copilot reply's check (`services/copilot/views.py`, record kind `slack`). Needs a customer rows gain `mentioned` (the candidates the reader may open); a Slack match makes a conversation (`conversation.matched`).
- **Agents.** `SignalThread.conversation`; the thread block is the newest 8 messages (`evidence._thread`); `slack.reply` carries `conversation_id` and targets `draft:conversation:<id>`; `fast_lane.for_conversation`.
- **Ceilings.** `SLACK_CONVERSATION_QUERIES` 6, `SLACK_SYNC_QUERIES` 35 (a pass of 3 threads), `UNMATCHED_LIST_QUERIES` 7, story ceilings +2, `THREAD_RUN_QUERIES` 33 (unchanged); no `DISTINCT`. Contract: `docs/superpowers/plans/2026-10-15-slack-escalations-d1-api.md`.

## Slack escalations (delivery 2): account team and department heads

- **Heads.** `services/knowledge/heads.py` (`rows`, `head_for`, `change`, `on_duty`) over `knowledge.FunctionHead`. `GET/PATCH /api/v1/function-heads/` (`FunctionHeadsView`): any member reads; PATCH needs `manage_org_settings` and a member of the caller's own workspace (SOC2 AUTH-02); `change` writes `function_head.changed` only on a real change (SOC2 LOG-01). A head or account-team person who left or moved is off duty at read time (SE2-4), never deleted.
- **Who handles.** `ownership.handler_for(record, function, *, organisation_id=None)` returns `(user, "team" | "head" | "nobody")` (SE2-7). Customer: owner (Customer Success) or `FunctionOwner`, else the head, else nobody. Account: Customer Success goes to the account's own owner first; else one parent customer's answer; else the head. A customer uses its own workspace's head. No route calls it yet.
- **Audit.** `function_owner.changed` on `PATCH /customers/<id>/responsible/` (SE2-9).
- **Ceilings.** `FUNCTION_HEADS_QUERIES` 1; `handler_for` customer team 1, head fallback 2; account 1 to 3 (see `docs/API_CONTRACTS.md`). No `DISTINCT`.

## Slack escalations (delivery 4): the thread decides

- **The thread's people.** The sync fills `SlackConversation.people` (`{slack id: {name, member}}`) for posters and mentioned users: `providers/slack.py` (`MENTION`, `mentions`, `_people_of`, at most `MAX_PEOPLE` 30 `users.info` a pass, a person already stored with a member not asked again), `sync._people` / `_resolved` / `_members_by_email` (the linked member, else the active member with that login email; the email is dropped). Replies are read with their metadata: our reply posted as a person is stored `via_app: true` (`_via_app`), never wakes an agent and answers the thread (`intake.answered`); a top message carrying our key is skipped. The conversation's `external_shared` is refreshed each pass.
- **The prompt.** `prompt.thread_system(..., slack=, shared=)`: the Slack intro, `"function"` and `"decision"` in the answer (`ThreadAnswer.function` / `decision`, shape-checked), the escalation and decision rules, the shared-channel rule, the reply rule that allows an earlier `jira.create`'s key and link (`outside_rules(jira_in_reply=)`). `evidence._thread` shows every stored Slack message (`SLACK_MESSAGES` 50) and the people line.
- **The decision.** `services/agents/decision.py`: `read(ctx, answer)` keeps the model's decision only when its message is a person's (not a bot's, not `via_app`), its author an active member, its quote in the message and not a bare mention (`bare`, `FILLER`); `resolve` finds the person (mention through `people`, a thread name, then `match_member`'s full name, then a first name); `participants`. Drops are logged as codes.
- **The bundle.** `services/agents/escalation.py`: `read` (the person: the decision, else `knowledge.ownership.handler_for`), `split` / `place` (the model's first `jira.create`, then the platform's `jira.assign` `if_found` and `task.create`, the model's other steps, the reply last, the template from `template`), `stored` (`AgentBundle.escalation`), `chosen` (a Refresh keeps a Change), `change_handler` (`PATCH /agents/bundles/<id>/handler/`, `BundleHandlerView`). `intake_bundles.place` sets `ctx.escalation`, writes the escalation and the `BundleParticipant` rows (escalation bundles only; a refresh replaces them).
- **Running.** `kinds.Skipped(note, result=)`: `bundle_run._skip` ends a step `skipped` with `result.note` (audited `agent_action.skipped`), and `bundles.outcome` counts it done. `jira_issues`: an escalation's `jira.assign` skips when the member has no Jira user (`NoJiraAccount`, `no_account_note`); a `jira.create` from a conversation adds "From Slack: <url>", then `services/agents/outside/filing.py:file_made_issue` files the `Ticket` at once (covered records only, never fails the step) and `JiraTool.remote_link` (`JiraProvider.add_remote_link`) links back (`LINK_REFUSED` note). `slack_replies`: `open_keys` / `ESCALATION_KEYS` let an escalation's reply in its own unshared thread carry the key and link (`ONLY_JIRA`, `SHARED_NOW`); `preview(action, reader)` says `as_you` (`Bulk.slack_link`). Placeholder labels "Jira key/link from step N".
- **Participants.** `deciding.participates` and the `participant` role (after every other role); `bundles.readable` adds the reader's participant bundles (`fully_readable` is the old rule); `bundle_payloads.participant_only` gives the participant view; `Bulk.participating` reads it once per page; `outside/gates.blocked` lets a participant post their own thread's reply; `work/feed_decide` lists them on Mine and `feed_team_decide` leaves them off Team.
- **Linked both ways.** `services/customers/conversation_links.py` (`attach`, `tickets_for`, `ticket_line`, `record_of`) under the twice-filter, used by the story, Copilot's `find_item` and `GET /slack-conversations/<id>/`.
- **Send to Revenact.** `work/slack_actions.send_reply` asks `SlackTool.shared` (`SlackProvider.channel_shared`) before posting text that carries the row's Jira key or link; fails closed (`SHARED`, `CANT_CHECK`).
- **Ceilings.** `ESCALATION_RUN_QUERIES` 63 (64 with D3), `DECISION_RUN_QUERIES` 65 (66 with D3), `SLACK_SYNC_QUERIES` 38 (44 with D3), `STORY_SLACK_LINKS_QUERIES` 31, `SLACK_CONVERSATION_QUERIES` 7, the bundle and Work page pins +1 (see `docs/API_CONTRACTS.md`); no `DISTINCT`. Contract: `docs/superpowers/plans/2026-10-17-slack-escalations-d4-api.md`.

## Slack escalations (delivery 3): every public channel, pushed by Slack

- **Why events, not polling.** Since 29 May 2025 Slack allows a commercially distributed app outside its Marketplace 1 request a minute and 15 objects a call on `conversations.history` and `conversations.replies`. Every customer installs our app, so delivery 1's 7-day multi-page read cannot scale to every channel. Slack's Events API pushes each message instead; polling stays only as a slow catch-up. No code path calls either method more than once per connection per pass or with `limit` above 15, except `SlackProvider.find_message` (a step's Retry, unchanged).
- **Provider.** `services/connectors/providers/slack.py`: `connect` takes the token alone (`auth.test`, scopes); `SCOPES` gains `channels:join`; `list_channels` (`conversations.list`, public, 200 a page, at most 5 pages), `join_channel` (`conversations.join`); `read_page` and `read_thread` (one call each, `limit=15`); the shared per-message rules `is_top`, `is_ours`, `reply_of`, `thread_of`. `fetch_threads` and `_replies*` are gone.
- **Channels.** `connectors.SlackChannel`, one row per channel. `services/connectors/slack_channels.py`: each pass lists (new rows included unless Slack Connect; names, membership and shared flags follow Slack; unlisted rows archived; a removed bot marks `join_error` `removed`), joins at most 5 (only with `channels:join`; a refusal stores Slack's code), and picks the catch-up's channel and thread.
- **Catch-up.** `services/connectors/slack_catchup.py`: per connection, at most once every 60 seconds (`asked_at`), one history page (a walk below `walk_before`, `read_at` the watermark, at most 7 days back) and at most one replies read (the oldest `missed` thread, else a stored thread whose `latest_reply` moved). A rate limit ends the catch-up for the pass; any other refusal is the row's `read_error`.
- **Events.** `services/connectors/slack_events_views.py` (`POST /connectors/slack/events/`, public, `SlackEventsThrottle`) verifies Slack's v0 signature over the raw body with #139's `slack_interactivity.verified`, answers `url_verification`, and always answers 200 after a valid signature. `services/connectors/slack_events.py:handle` routes `message` (top, reply, `message_changed`, `message_deleted`) and `channel_created` (row plus an immediate join) for every enabled connection of the envelope's team. Filing is inline before the answer (no task queue; Cloud Run gives a request CPU only until it answers); the agent runs on the next `agents` tick. Anything that can't be filed goes into the row's `missed` list for the catch-up.
- **Filing.** `sync.file_conversation(connector, remote, names, channel=...)`: the channel's own record (`_pinned`, while the connection covers it), else `naming.find`, else Needs a customer. Replies merge by ts; `latest_reply` only moves forward; `stored_remote`, `edit_message`, `delete_message` serve edits and deletes. Keys carry the channel: `SlackConversation` unique on `(connector, channel, thread_ts)`, `SignalThread.external_id` `"<connector>:<channel>:<ts>"`, `UnmatchedItem.external_id` `"<channel>:<ts>"` (`unmatched.slack_key`, `split_slack_key`).
- **Admin routes.** `services/connectors/slack_channel_views.py`: `GET /connectors/<id>/slack-channels/` and `PATCH .../<channel id>/` (`CanManageIntegrations`; audited `slack_channel.update`). The connector payload's `slack_channels` (`synced`, `total`, public rows only; `can_join`; `events_at`) comes from three subquery annotations in `views.with_ingested`.
- **Agents.** `services/agents/outside/slack_channels.py`, `actions/slack_replies.py`, `outside/gates.py`: a reply may move to any included, joined channel (`"<connection>:<channel>"`); its own thread keeps `"<connection>"`.
- **Settings.** `THROTTLE_SLACK_EVENTS` (default `1200/min`, per source IP); `SLACK_SIGNING_SECRET` reused. Owner set-up in the Slack app: Event Subscriptions on, Request URL `<api origin>/api/v1/connectors/slack/events/`, bot events `message.channels` and `channel_created`, bot scope `channels:join`, reinstall, then reconnect the Slack connection.
- **Ceilings.** `SLACK_CHANNELS_QUERIES` 7, `CONNECTOR_LIST_QUERIES` 5 (unchanged), `SLACK_EVENT_REPLY_QUERIES` 15, `SLACK_SYNC_QUERIES` 44 (with D4's people), `SLACK_OPTIONS_QUERIES` 5; no `DISTINCT`. Contract: `docs/superpowers/plans/2026-10-17-slack-escalations-d3-api.md`.

## Connections (2026-10-16): personal Slack link and Send to Revenact

- **The link.** `connectors.SlackLink` (one per person, Fernet `credentials`, unique `(organisation, slack_user_id)`). `services/connectors/slack_links.py`: Slack OAuth v2 with `user_scope=chat:write,users:read` only (`authorize_url`, `exchange` reads `authed_user` and `team.id`), `users.info`, `auth.revoke`, `person_token(link, connector)` (linked, same team, linking configured), `lose`. `services/connectors/slack_link_views.py`: the three link routes and the public callback, bound to the starting browser (`core/oauth_browser.py`, cookie `revenact_slack_link`); the callback refuses an account outside the connectors' Slack teams and revokes its token. All Slack HTTP goes through `providers.slack.http_json`/`http_call`, so the test fake (`services/connectors/tests/slack_fake.py`) covers it.
- **Post as me.** `services/agents/outside/tools.py:SlackTool.post(..., actor)`: the runner's token first, then the bot; a reauth error loses the link; `not_in_channel`, `channel_not_found`, `restricted_action` fall back without losing it. `slack_replies.apply` passes the runner and records `slack_as`.
- **Show who I am.** `services/connectors/sync.py:_started_by`: the linked member for the poster's Slack id (`linked_members`, read once per pass, only when a new thread is filed), else the email match. `SLACK_SYNC_QUERIES` 36 (+1).
- **Send to Revenact.** `services/connectors/slack_interactivity_views.py` (public, `SlackInteractivityThrottle`) verifies Slack's v0 signature over the raw body (`slack_interactivity.verified`, `SLACK_SIGNING_SECRET`, 5-minute window, fail closed) and handles only `message_action` / `send_to_revenact`. `slack_interactivity.send_to_work`: workspace by `config.team_id`, person by SlackLink else email (bot's `users.info`), customer from the sender's email among contacts the person may open, one `get_completion(purpose="slack_triage")` call (lite tier; fallback to the first 200 characters), `work.SlackSuggestion` (`get_or_create` per owner, channel, ts), ephemeral answers through `response_url` (`hooks.slack.com` only; added to `ALLOWED_HOSTS`). Inline: no task queue.
- **Work.** `services/work/feed_slack.py` adds kind `slack_message` to the feed's suggested group (merged with recommendations by `(created_at, id)`), owner-only, record named only while openable. `services/work/slack_views.py`: `DELETE /work/slack-messages/<id>/` and the 30-day `purge` (run by `sync_tickets`). `FEED_CEILING` 59.
- **Settings.** `SLACK_SIGNING_SECRET` (empty: every interactivity request 401), `THROTTLE_SLACK_INTERACTIVITY` (default `120/min`), `GEMINI_PURPOSE_TIERS` gains `slack_triage=lite`; `SLACK_OAUTH_CLIENT_ID`/`SECRET` reused.
