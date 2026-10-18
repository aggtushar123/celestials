# Brain, delivery 1: scopes and "What changed", backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every member a Brain scoped to **Me**, **My team** or **Company**: a scope resolver, figures recomputed over the scope's own book, a per-scope history (month-end rows and a baseline on first view), the "What changed" payload, and briefs and explanations written and kept per scope, all under `/api/v1/brain/`.

**Architecture:**
- `services/customers/scoping.py` gains `ScopeActor(organisation, owner_ids)`, a `SystemActor` whose `owner_scope` narrows `visible_customers`/`visible_accounts` to one set of owners' book. The registry's `compute_*` functions take an optional `actor`, and a new `compute_figures` reads values and cuts in one pass.
- A new app `services/brain` holds the resolver (`scope.py`, the only place a `ScopeActor` is built), `figures` (`metrics.py`), `ScopeSnapshot` and `BriefLock` (`models.py`), the comparison point and month-end recording (`history.py`), the "What changed" payload (`changed.py`), the per-scope brief and explanation reads and writes (`briefs.py`, `explanations.py`, `exposure.py`, `payloads.py`) and the five routes (`views.py`).
- `services/metrics` keeps the prompts: `signals_for` accepts a caller's comparison point, `brief`/`explain` gain `evidence_from` builders and store `scope_key` and `figures_digest`, and `ModelCall` records the scope key. The existing `/api/v1/metrics/` readers keep reading the Company rows only.

**Tech Stack:** Django 5.2, DRF 3.18, PostgreSQL 16 in CI and production (`SELECT ... FOR UPDATE`, unique constraints), `TestCase`/`APIClient`, `LiveServerTestCase` for e2e.

**Spec:** `react-ts-app/docs/superpowers/specs/2026-10-05-brain-what-changed-design.md` (frontend repo), agreed with the owner on 2026-10-05. This plan covers §0, §1 and §4 (the API contract, binding for both plans). §2 is the frontend and is read here for context only.

**Branch:** `feat/brain-changed` (already checked out, from main at `77abe51`). Stay on it and do not push.

**Merge order:** this backend PR merges and deploys **before** the frontend PR. Nothing existing changes shape: `/api/v1/metrics/` answers as today, reading only the Company rows.

## Global Constraints

Copied from the spec; quoted text is verbatim. Every task's requirements include this section.

- **Scopes (§1.1).** "**Keys**: `me`, `team`, `company`. A resolved scope has a stored key: `me:<user id>`, `team:<user id>` or `company`." "**Me**: customers whose `owner` is the reader, and accounts whose `owner` is the reader or that sit under one of those customers. Strict "my book", not everything the reader may open." "**My team**: the same rule with owners = the reader plus `subtree_ids(reader)`. Offered only when `subtree_ids(reader)` is not empty." "**Company**: the whole organisation, unassigned customers included. Offered only when `sees_everything(reader)` or `reader.function == User.Function.LEADERSHIP`." "**Default**: the widest scope the reader has (Company, then My team, then Me)."
- **Resolver (§1.1).** "`resolve(reader, key) -> Scope` is the only constructor. It raises `ScopeNotAllowed` for a scope the reader can't use; views answer **403** with `{"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}`. An unknown key is **400** `{"code": "SCOPE_UNKNOWN", "detail": "Choose me, team or company."}`." "`Scope` carries `key`, `stored_key`, `owner_ids` (a frozenset; `None` for Company), `label` ("Me", "My team", "Company") and `actor`."
- **ScopeActor (§1.1).** "in `services/customers/scoping.py`, next to `SystemActor` and built the same way (only `organisation`, `has_capability`, `owner_scope`)." "One `id IN (subquery)` per way in; never a join plus `.distinct()` (#86)." "A Company scope's actor is `SystemActor(organisation)`, unchanged." "**No view builds a `ScopeActor` itself.** A test greps the services for `ScopeActor(` outside `brain/scope.py` and the tests."
- **Scoped metrics (§1.2).** "`registry.compute_all`, `compute_slices` and `compute_slice` gain an optional `actor` argument; with none they build `SystemActor` as today, so every existing caller is unchanged." "`brain.metrics.figures(scope)` returns `{key: value}` and the cuts for the scope, from one pass over the sources." "A metric whose source has nothing to measure for the scope … reads `None` and shows "Not measured". A source that raises still raises."
- **Scope history (§1.3).** `ScopeSnapshot` fields as the spec's block, "unique (organisation, scope_key, taken_on)", "index (organisation, scope_key, -taken_on)". "Company keeps using `MetricSnapshot`; nothing already recorded changes." "**Month-end**: `run_health_maintenance`, after `record_period_end`, calls `brain.history.record_month_end(organisation, period_end)`. It writes Me for every active member who owns at least one customer or account, and My team for every active member with reports. Existing rows for that day are kept, not overwritten … The command prints the counts and the time taken." "**Baseline on first view** … writes a `baseline` row for today. It runs under the unique constraint, so two first views at once write one row." "**Team changed**: if the latest row's `owner_ids` differ from the scope's current owners, moves are not compared across the change. The response carries `team_changed_on` (today) and a new `baseline` row is written." "**Deactivated members** get no new rows; their old rows stay."
- **What changed (§1.4).** "**Compared against**: the scope's latest `ScopeSnapshot` (Company: the latest whole-organisation `MetricSnapshot` month-end, as today)." "`signals.signals_for` gains an optional `previous` mapping and `previous_slices` … Material = 5 points or 10%, bad news first, drivers from the cuts." "**Handovers** (Me and My team): customers in the current book but not in the latest row's `customer_ids`, and the reverse." "`handover: {in: n, out: n, people: ["Dana CSM"]}` when any customer moved". "driver labels and handover names are owners, products, segments and lifecycle stages, never customer names."
- **Briefs (§1.5).** "`Brief` gains `scope_key` (CharField(32), default `company`; existing rows become `company`) and `figures_digest` (CharField(64), blank; a SHA-256 of the sorted figures the prompt carried)." "It is **stale** when the scope's current figures digest differs, or a newer month-end exists than its `baseline`. Stale briefs are still returned, with `stale: true`." "**Writing** … anyone who can use the scope." "Me and My team prompts may include the scope's customers by name". "The Company prompt stays figures, cuts and member names only, as today". "Calls `get_completion` with purpose `brief`, recording the scope key on the `ModelCall`. Budget and credit accounting are unchanged." Refusals "422 `NothingToBrief`, 429 `BudgetExceeded`, 503 `CopilotNotConfigured`, 502 `CopilotRequestFailed` or an unusable answer (`ValueError`)", "with the exception's own message as `detail`". "**Once at a time**: a `select_for_update` on a per-organisation lock row (`brain.BriefLock(organisation, scope_key)`) is held while writing. A second request that waited returns the brief the first one wrote if it is newer than the request (answer 200, not 201)". "On failure the previous brief stays."
- **Explanations (§1.6).** "`Explanation` gains `scope_key` (default `company`) and `figures_digest` … stale on the same two rules as a brief." "The exposure list is built as the **reader** (not the scope actor) so it names only accounts the reader can open, plus `hidden: <count>` for the rest." "Purpose `explain`, scope key on the `ModelCall`."
- **API (§1.7, §4).** All under `/api/v1/brain/`, "all `IsAuthenticated`; scope through `resolve`". Every path and field in §4 is binding and not renamed. "The `/api/v1/metrics/` routes are unchanged and stay Company-only (`CanViewAllAccounts`)".
- **Audit, logs, docs (§1.8).** "ids and scope key only, never figures or text": "`brain.brief_written` (target Brief; `scope`, `stale_before` bool)", "`brain.explanation_written` (target Explanation; `scope`, `metric`)", "`brain.scope_baseline_recorded` (target ScopeSnapshot; `scope`, `reason`: `first_view` or `team_changed`)". "Logs: month-end recording counts and duration; never figures." "Docs: API_CONTRACTS (new `brain` section), audit-events, schema (ScopeSnapshot, BriefLock, the two new fields), PRD, TRD, data classification (ScopeSnapshot holds aggregate figures and record ids: internal)."
- **Out of scope (§3).** Waiting on you, What's being done, What customers are saying, "Scoping the Slack brief and MCP server."

House rules (every task):

- **Postgres 16 in CI/prod — visibility as `id__in` subqueries, never joins + `.distinct()`** (add a query-shape test for `ScopeActor` visibility: Task 1). CI and production run PostgreSQL 16, where the join-and-DISTINCT shape cost about a second a call (#86).
- **SOC2 markers:** `# SOC2:AUTH-02 <why>` on the resolver and on every visibility rule this plan adds or changes (`ScopeActor` branches, `available`, `first_readable`, `exposure`); `# SOC2:LOG-01` on every `audit.record` call.
- **Run tests with `venv/bin/python manage.py test <labels> --parallel --noinput`.** One module at a time while iterating is fine with the same command and a single label.
- **`venv/bin/ruff check .` and `venv/bin/ruff format --check .`** (line length 100; rules E, F, I). Ruff also formats the Python fences inside Markdown: run `venv/bin/ruff format <file.md>` on any doc you edit.
- **`venv/bin/python manage.py makemigrations --check --dry-run`** must print "No changes detected" at the end of every task.
- **The CI shard check:** `venv/bin/python scripts/ci_shard_labels.py --check 4` after adding test modules.
- **Every commit message ends with a blank line and exactly** `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Conventional commits (`feat(brain): …`, `test(e2e): …`, `docs(brain): …`). Do not push.
- **Logs and audit carry ids, keys, counts and booleans only**: never a figure, a customer's name or model text. Exceptions in logs and command output by class name only.
- **Tests**: unit (`SimpleTestCase`/`TestCase`), integration (`APIClient`), e2e (`LiveServerTestCase` in `e2e/`). Test classes build their world once with `setUpTestData` (`BrainFixture`, Task 1). Model calls are always patched; nothing reaches a provider.
- **Never write the literal `ScopeActor(` in a docstring or comment outside `services/brain/scope.py` and tests**: the Task 4 grep test counts it.

## Contract notes

Each note either follows the real code where the spec disagrees with it, or settles something §4 leaves open. **No §4 field is renamed or removed.**

1. **Metric keys are the registry's.** §4's examples (`"arr"`, `"arr_at_risk"`) are illustrative; the real keys are `active_arr`, `at_risk_arr` and the rest of `services/metrics/registry.py`. There are **21** metrics, not 15 (§0 miscounts); `metrics` lists all 21 in registry order.
2. **`handover` rides on every money-unit metric**: `active_arr`, `average_arr`, `churned_arr_12m`, `forecast_arr`, `at_risk_arr`, `shelfware_arr`, `at_capacity_arr`, `dark_arr`. The registry has no "expansion" metric (§1.4 names one).
3. **`sees_everything` lives in `services/customers/scoping.py`**, not `services/accounts/hierarchy.py` (§0). The resolver imports it from there.
4. **"Accounts" in an explanation's exposure list are organisations (`Customer`)**: `forecast.exposure_list` ranks customers. `hidden` counts customers carrying downside in the scope that the reader may not open.
5. **A missing `?scope=` reads the reader's default scope** (not a 400). An empty `?scope=` is treated as missing.
6. **Order of refusals on explanations:** the scope is checked first (400/403), then the metric (404 `{"detail": "No such metric."}`).
7. **Scope refusals carry `code` and `detail`; AI refusals carry `detail` only**, exactly as today's `BriefGenerateView`/`MetricExplainView`.
8. **`team_changed_on` stays set while the team-changed baseline is the comparison point**, not only on the request that reset it, so the page keeps saying "Your team changed on …" until the next month-end. It is `null` otherwise.
9. **Stored prose is shown only to a reader who may open every customer it names** (the twice-filter rule). `GET brief/` and `GET explanations/<metric>/` return the newest row for the scope that passes; otherwise `null`. Me and My team rows are only ever read by their owner; this bites on Company explanations, whose exposure list differs per writer. Explanations written before this delivery (no recorded customer ids) are shown only to readers who see every customer.
10. **The existing Company readers ignore scoped rows:** `GET /metrics/brief/`, `GET /metrics/<key>/explanation/` and the Slack delivery (`delivery.latest_brief`) read `scope_key="company"` only, so a Me or My team brief, which may name customers, never reaches them.
11. **`metrics[]` rows and `signals[].drivers[]` carry exactly the §4 fields** (no `note`, `dimension_label` or `value`).
12. **`since` for Me and My team is never null**: the first view writes a baseline, so `since` is that day and `since_kind` is `baseline`.

## Decisions made while planning

The spec left these open. The owner may overrule any of them; each is applied in the tasks below.

1. **`ScopeActor` subclasses `SystemActor`.** It is an organisation-level principal, not a person: `activity_tracking.readable` keeps treating it like `SystemActor` (no mail chain or department narrows what its aggregate counts read), and `has_capability` is inherited. `visible_customers`/`visible_accounts` read `owner_scope` **before** `sees_everything`.
2. **Knowledge metrics are scoped by people:** for a scope, `open_questions`/`stale_questions` count open questions assigned to its owners and `contributions_30d` counts what its owners wrote. Company is unchanged.
3. **`shelfware_arr` and `at_capacity_arr` read `None` when no customer in the book has seats recorded** (`measured_count == 0`), for every actor including Company. They read `0.0` today in that case, which says "measured, none" when nothing was measured.
4. **The book (`customer_ids`, handovers) is every customer the owners own, archived and churned included**, so a churn is not a handover. `people` are the current owners of the customers that left (or "Unassigned"); a deleted customer counts in `out` and names nobody.
5. **A team change on the same day as the baseline replaces that baseline in place** (it is a starting line, not a record of a month). Otherwise a new row is written for today and the older rows stay. `ScopeSnapshot` gains `reason` (`first_view`, `team_changed`, blank on month-ends) so `team_changed_on` survives a reload (contract note 8). `Scope` also carries `user`, the person whose scope it is.
6. **Brain explanations carry no initiatives.** Initiatives belong to delivery 3 and are gated on `view_all_accounts`; the `/metrics/` explanation keeps them.
7. **A model failure does not roll back its own audit trail.** The write runs inside the lock's transaction; the AI exceptions are caught inside it and re-raised after it commits, so the `ModelCall` row and any credit refund are kept.
8. **Figures are computed per request; no cache.** `GET brief/` and `GET explanations/` compute them only when a stored row exists (to say whether it is stale).
9. **Digests** are SHA-256 over canonical JSON (`sort_keys`, compact separators) of number-normalised figures: a brief digests every metric's value; an explanation digests its metric's value and each cut member's value (labels excluded, so a renamed owner is not a move). The `/metrics/` writers digest the same way, so a Company brief written there reads as fresh in the Brain.
10. **Month-end owners** are active members owning a customer of the organisation or an account under one; managers are active members with any report (`subtree_ids`). Rows are built through `resolve`, never by hand. A failure in one organisation is reported by class name and never stops the job.
11. **The Company prompt is today's prompt**: no Scope line, no customer list. Me and My team prompts add a `Scope:` line and up to six customers carrying downside, each as name, owner, ARR, downside, renewal and health.
12. **`BriefLock.scope_key` is 96 characters** and also serialises explanations, keyed `explain:<metric>:<stored key>`.
13. **POST also records the comparison point**: writing a Me or My team brief or explanation before any `changed/` call writes the baseline, as a view would.
14. **The audit `scope` is the stored key** (`team:12`), an id. Baseline audits name the scope's person as actor.
15. **The e2e's concurrent-brief check is the one test that starts threads.** It is made deterministic by holding the first model call until `pg_stat_activity` shows the second request waiting on a lock (bounded at 10 s).

## Reuse map

Each helper below was read in the current code before this plan relied on it.

| Need | Source | Use |
|---|---|---|
| Visibility | `customers.scoping.visible_customers`, `visible_accounts`, `live_customers`, `visible_children_q`, `sees_everything`, `SystemActor` | `ScopeActor`, `figures`, `exposure`, `first_readable` |
| Org chart | `accounts.hierarchy.subtree_ids(user)` (memoised per instance; `refresh_from_db` clears it) | `available`, `resolve`, month-end |
| Rollups | `metrics.registry.SOURCES`, `METRICS`, `BY_KEY`, `MONEY`, `_sources_for` | `compute_figures` |
| Signals | `metrics.signals.signals_for`, `material`, `number`, `latest_whole_org`, `latest_by_member` | `moves`, `previous_from_snapshots` |
| Exposure | `customers.forecast.filtered_customers`, `build_rows`, `horizon_days`, `exposure_list` (rows carry `id`, `name`, `owner`, `arr`, `downside`, `days_to_renewal`, `health_category`, `factors`) | `exposure` |
| Model calls | `copilot.anthropic_client.get_completion` (+ `BudgetExceeded`, `CopilotNotConfigured`, `CopilotRequestFailed`), `copilot.usage.record_call` | briefs, explanations |
| Prompts | `metrics.brief.build_prompt`, `_parse`, `NothingToBrief`; `metrics.explain.build_prompt`, `_parse`, `EXPOSURE_LIMIT`, `NothingToExplain` | Task 3 |
| Audit | `core.audit.record(action, *, request, actor, organisation, target, target_repr, metadata)` | Tasks 5, 7, 8 |
| Month-end | `run_health_maintenance` (`captured_on = last_completed_month_end()`, `organisations`, `verb`) | Task 5 |
| Test users | `segments.tests.fixtures.person(email, name, organisation, **extra)` (CSM, Customer Success by default) | `BrainFixture` |
| e2e HTTP | `e2e/http.py` `http_get`, `http_post` | Task 9 |

## File Structure

| File | Responsibility |
|---|---|
| `services/customers/scoping.py` (modify) | `ScopeActor`; `owner_scope` branches in `visible_customers`, `visible_accounts` |
| `services/metrics/registry.py` (modify) | `actor` on `compute_all`/`compute_slices`/`compute_slice`; `compute_figures`; scoped `_knowledge`; unmeasured seat money |
| `services/metrics/signals.py` (modify) | `signals_for(previous=, previous_slices=, slices=, baseline=)`; `previous_from_snapshots`; `digest`, `brief_digest`, `explanation_digest` |
| `services/metrics/models.py` (modify) | `COMPANY_SCOPE`; `Brief`/`Explanation` `scope_key`, `figures_digest` |
| `services/metrics/migrations/0009_brief_explanation_scope.py` (generated) | The four fields and two indexes |
| `services/metrics/brief.py`, `explain.py` (modify) | `evidence_from`, scoped prompts, `scope_key`/`figures_digest` on write |
| `services/metrics/views.py`, `delivery.py` (modify) | Company rows only |
| `services/copilot/models.py`, `anthropic_client.py` (modify) | `ModelCall.scope_key`; `get_completion(scope_key=)` |
| `services/copilot/migrations/0019_modelcall_scope_key.py` (generated) | The field |
| `services/brain/__init__.py`, `apps.py` (new) | The app |
| `services/brain/models.py`, `migrations/0001_initial.py` (new) | `ScopeSnapshot`, `BriefLock` |
| `services/brain/scope.py` (new) | `Scope`, `resolve`, `available`, `default_key`, the two refusals |
| `services/brain/metrics.py` (new) | `Figures`, `figures`, `stored_slices` |
| `services/brain/history.py` (new) | `latest`, `comparison_point`, `team_changed_on`, `record_month_end` |
| `services/brain/changed.py` (new) | `Comparison`, `compare`, `moves`, `build` |
| `services/brain/payloads.py` (new) | `iso`, `first_readable`, `is_stale`, `brief_payload`, `explanation_payload` |
| `services/brain/exposure.py` (new) | `exposure`, `customer_line` |
| `services/brain/briefs.py`, `explanations.py` (new) | Read with staleness, write under the lock, audit |
| `services/brain/views.py`, `urls.py` (new) | The five routes |
| `config/settings.py`, `config/urls.py` (modify) | Register the app and mount `/api/v1/brain/` |
| `services/customers/management/commands/run_health_maintenance.py` (modify) | Scope month-ends after the metric month-ends |
| `services/brain/tests/fixtures.py` (new) | `BrainFixture` |
| `services/brain/tests/test_scope.py`, `test_history.py`, `test_changed.py`, `test_api_changed.py`, `test_briefs.py`, `test_explanations.py` (new) | Unit and integration |
| `services/customers/tests/test_scoping.py`, `services/metrics/tests/test_registry.py`, `test_brief.py`, `test_explain.py`, `services/copilot/tests/test_usage.py` (modify) | ScopeActor, registry, metrics and copilot changes |
| `services/metrics/tests/test_signals_scoped.py` (new) | Signals against a given comparison point, digests |
| `e2e/test_brain_flow.py` (new) | Manager, report and Leadership reader end to end |
| `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md` (modify) | Docs |

---

### Task 1: ScopeActor, scoped registry and the test world

**Files:**
- Modify: `services/customers/scoping.py` (`SystemActor` at ~line 58, `visible_customers` ~line 92, `visible_accounts` ~line 160)
- Modify: `services/metrics/registry.py` (`_knowledge` ~line 168, the `shelfware_arr`/`at_capacity_arr` entries ~line 320, `_sources_for` onwards ~line 434)
- Create: `services/brain/__init__.py` (empty), `services/brain/tests/__init__.py` (empty), `services/brain/tests/fixtures.py`
- Test: `services/customers/tests/test_scoping.py`, `services/metrics/tests/test_registry.py`

**Interfaces:**
- Produces: `ScopeActor(organisation, owner_ids)` (subclass of `SystemActor`; attribute `owner_scope: frozenset[int]`). `visible_customers(actor)` → the organisation's customers with `owner_id IN owner_scope`; `visible_accounts(actor)` → accounts with `owner_id IN owner_scope` or linked to a customer whose `owner_id IN owner_scope`.
- Produces: `registry.compute_all(organisation, today=None, actor=None)`, `compute_slices(organisation, actor=None)`, `compute_slice(organisation, metric, dimension, actor=None)`, `compute_figures(organisation, actor=None) -> tuple[dict, dict]` (values `{key: value}`, cuts `{key: {dimension: [(member, label, value)]}}`).
- Produces: `BrainFixture` (`services/brain/tests/fixtures.py`) with `today`, `org`, `admin` (Alice Admin, admin, Leadership), `lee` (Lee Lead, CSM role, Leadership), `mona` (Mona Manager), `csm` (Carl CSM, reports to Mona), `other` (Dana CSM), `other_org`, `stranger` (Gus); customers `pizza` (Carl, 300k, 8.0), `dough` (Carl, 100k, 2.0, renews in 30 days), `soup` (Mona, 50k, 8.0), `taco` (Dana, 200k, 2.0, renews in 30 days), `loose` (nobody, 80k, 8.0), `globex` (Gus, other tenant); accounts `emea` (Carl, under Pizza Hut), `east` (Carl, under Taco Bell), `west` (Dana, under Taco Bell); `customer(name, owner, arr, health, **fields)`, `account(name, customer, owner)`, `as_user(user) -> APIClient`.

- [ ] **Step 1: Write the fixture**

Create `services/brain/__init__.py` and `services/brain/tests/__init__.py` (both empty), and `services/brain/tests/fixtures.py`:

```python
"""The Brain tests' shared world, built once per class (`setUpTestData`).

Acme (USD): Alice (admin, Leadership) sees everything and manages nobody;
Lee (CSM role, Leadership function) reads Company through his function and
owns nothing; Mona (CSM) manages Carl; Dana (CSM) manages nobody. Gus is
Globex's.

Customers: Pizza Hut (Carl, 300k, healthy), Dough Co (Carl, 100k, poor,
renews in 30 days), Soup Co (Mona, 50k, healthy), Taco Bell (Dana, 200k,
poor, renews in 30 days), Loose Ltd (nobody, 80k, healthy). Accounts: Pizza
EMEA (Carl, under Pizza Hut), Taco East (Carl, under Dana's Taco Bell), Taco
West (Dana, under Taco Bell).

Carl's Me: Pizza Hut and Dough Co (ARR 400k). Mona's My team: those and Soup
Co (450k). Company: 730k."""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from services.accounts.models import Organisation, User
from services.customers.models import Account, Customer
from services.segments.tests.fixtures import person


class BrainFixture(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.today = timezone.localdate()
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")
        cls.admin = person(
            "alice@acme.io",
            "Alice Admin",
            cls.org,
            role=User.Role.ADMIN,
            function=User.Function.LEADERSHIP,
        )
        cls.lee = person("lee@acme.io", "Lee Lead", cls.org, function=User.Function.LEADERSHIP)
        cls.mona = person("mona@acme.io", "Mona Manager", cls.org)
        cls.csm = person("carl@acme.io", "Carl CSM", cls.org, reports_to=cls.mona)
        cls.other = person("dana@acme.io", "Dana CSM", cls.org)
        cls.other_org = Organisation.objects.create(name="Globex", currency="USD")
        cls.stranger = person("gus@globex.io", "Gus Globex", cls.other_org)

        renews = cls.today + timedelta(days=30)
        cls.pizza = cls.customer("Pizza Hut", cls.csm, 300_000, "8.0")
        cls.dough = cls.customer("Dough Co", cls.csm, 100_000, "2.0", renewal_date=renews)
        cls.soup = cls.customer("Soup Co", cls.mona, 50_000, "8.0")
        cls.taco = cls.customer("Taco Bell", cls.other, 200_000, "2.0", renewal_date=renews)
        cls.loose = cls.customer("Loose Ltd", None, 80_000, "8.0")
        cls.globex = cls.customer(
            "Globex Corp", cls.stranger, 999_000, "8.0", organisation=cls.other_org
        )
        cls.emea = cls.account("Pizza EMEA", cls.pizza, cls.csm)
        cls.east = cls.account("Taco East", cls.taco, cls.csm)
        cls.west = cls.account("Taco West", cls.taco, cls.other)

    @classmethod
    def customer(cls, name, owner, arr, health, **fields):
        fields.setdefault("organisation", cls.org)
        return Customer.objects.create(
            name=name,
            owner=owner,
            arr_billed_at_account=Decimal(arr),
            health_score=Decimal(health),
            **fields,
        )

    @staticmethod
    def account(name, customer, owner):
        account = Account.objects.create(name=name, owner=owner)
        account.customers.add(customer)
        return account

    def as_user(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client
```

- [ ] **Step 2: Write the failing scoping tests**

Append to `services/customers/tests/test_scoping.py` (add `ScopeActor` to its `services.customers.scoping` import and `from services.brain.tests.fixtures import BrainFixture`):

```python
class ScopeActorTests(BrainFixture):
    """A scope's book is exactly its owners' customers, and the accounts its
    owners own or that sit under those customers: no unowned records, no
    reach through an account up to its organisation."""

    def ids(self, queryset):
        return set(queryset.values_list("id", flat=True))

    def test_me_is_the_owners_own_book(self):
        me = ScopeActor(self.org, {self.csm.id})
        self.assertEqual(self.ids(visible_customers(me)), {self.pizza.id, self.dough.id})
        # Taco East is Carl's although Taco Bell is Dana's; Taco West is not.
        self.assertEqual(self.ids(visible_accounts(me)), {self.emea.id, self.east.id})

    def test_a_team_adds_every_owner_and_nothing_unowned(self):
        team = ScopeActor(self.org, {self.mona.id, self.csm.id})
        self.assertEqual(
            self.ids(visible_customers(team)), {self.pizza.id, self.dough.id, self.soup.id}
        )
        self.assertNotIn(self.loose.id, self.ids(visible_customers(team)))

    def test_no_owners_and_another_tenant_see_nothing(self):
        self.assertEqual(self.ids(visible_customers(ScopeActor(self.org, set()))), set())
        stray = ScopeActor(self.other_org, {self.csm.id})
        self.assertEqual(self.ids(visible_customers(stray)), set())
        self.assertEqual(self.ids(visible_accounts(stray)), set())

    def test_live_customers_still_drop_the_archived(self):
        Customer.objects.filter(pk=self.dough.pk).update(is_archived=True)
        me = ScopeActor(self.org, {self.csm.id})
        self.assertEqual(self.ids(live_customers(me)), {self.pizza.id})


class ScopeActorQueryShapeTests(BrainFixture):
    """Same rule as VisibilityQueryShapeTests: one `id IN (...)` per way in."""

    def test_no_distinct_and_no_outer_joins(self):
        actor = ScopeActor(self.org, {self.mona.id, self.csm.id})
        for queryset in (visible_customers(actor), visible_accounts(actor)):
            sql = str(queryset.query).upper()
            self.assertNotIn("DISTINCT", sql)
            self.assertNotIn("LEFT OUTER JOIN", sql)
```

(Add `live_customers` to the scoping import and `Customer` to the models import if the file lacks them.)

- [ ] **Step 3: Write the failing registry tests**

Append to `services/metrics/tests/test_registry.py` (add `ScopeActor` to its scoping import and `from services.brain.tests.fixtures import BrainFixture`, `from services.knowledge.models import Contribution, Question`):

```python
class ScopedRegistryTests(BrainFixture):
    def test_a_scope_is_recomputed_over_its_own_book(self):
        me = registry.compute_all(self.org, actor=ScopeActor(self.org, {self.csm.id}))
        team = registry.compute_all(
            self.org, actor=ScopeActor(self.org, {self.csm.id, self.mona.id})
        )
        self.assertEqual(me["active_arr"], 400_000.0)
        self.assertEqual(team["active_arr"], 450_000.0)
        # Recomputed over the team's book, not the mean of 200k and 50k.
        self.assertEqual(team["average_arr"], 150_000.0)
        # No actor is the whole organisation, as before.
        self.assertEqual(registry.compute_all(self.org)["active_arr"], 730_000.0)

    def test_values_and_cuts_come_from_one_pass(self):
        calls = []
        original = registry.SOURCES["forecast"]
        registry.SOURCES["forecast"] = lambda actor: (calls.append(1), original(actor))[1]
        try:
            values, cuts = registry.compute_figures(
                self.org, actor=ScopeActor(self.org, {self.csm.id, self.mona.id})
            )
        finally:
            registry.SOURCES["forecast"] = original
        self.assertEqual(len(calls), 1)
        self.assertEqual(values["active_arr"], 450_000.0)
        owners = {member for member, _label, _value in cuts["at_risk_arr"]["owner"]}
        self.assertEqual(owners, {str(self.csm.id), str(self.mona.id)})

    def test_knowledge_counts_the_scopes_own_people(self):
        for assignee in (self.csm, self.other):
            Question.objects.create(
                organisation=self.org, asked_by=self.admin, assignee=assignee, text="Why?"
            )
        Contribution.objects.create(
            organisation=self.org, customer=self.pizza, author=self.csm, function="cs", body="x"
        )
        Contribution.objects.create(
            organisation=self.org, customer=self.taco, author=self.other, function="cs", body="y"
        )
        me = registry.compute_all(self.org, actor=ScopeActor(self.org, {self.csm.id}))
        self.assertEqual((me["open_questions"], me["contributions_30d"]), (1, 1))
        self.assertEqual(registry.compute_all(self.org)["open_questions"], 2)

    def test_seat_money_is_unmeasured_when_no_customer_has_seats(self):
        values = registry.compute_all(self.org, actor=ScopeActor(self.org, {self.csm.id}))
        self.assertIsNone(values["seat_utilisation"])
        self.assertIsNone(values["shelfware_arr"])
        self.assertIsNone(values["at_capacity_arr"])
```

- [ ] **Step 4: Run them to see them fail**

Run: `venv/bin/python manage.py test services.customers.tests.test_scoping services.metrics.tests.test_registry --parallel --noinput`
Expected: ERROR, `ImportError: cannot import name 'ScopeActor'`.

- [ ] **Step 5: Add `ScopeActor` and its branches**

In `services/customers/scoping.py`, after `class SystemActor` (keep its body; add one class attribute `owner_scope = None` under `id = None`), add:

```python
class ScopeActor(SystemActor):
    """A slice of the organisation acting as itself: the book of one set of
    owners — a reader's Me (themselves) or My team (themselves and everyone
    below them). Built only by `services.brain.scope.resolve`; a test greps
    the services to keep it that way.

    Like `SystemActor` it is not a person: no mail chain or department
    narrows the aggregate figures its rollups count. What it changes is the
    book: `visible_customers` and `visible_accounts` read `owner_scope`
    before anything else and return exactly the owners' customers and
    accounts — no unowned records, and no reach through an account up to its
    organisation."""

    def __init__(self, organisation, owner_ids):
        super().__init__(organisation)
        self.owner_scope = frozenset(owner_ids)

    def __repr__(self):
        return f"{type(self).__name__}({self.organisation!r}, {sorted(self.owner_scope)})"
```

In `visible_customers`, directly after `base = Customer.objects.filter(organisation=user.organisation)`:

```python
    owner_scope = getattr(user, "owner_scope", None)
    if owner_scope is not None:
        # SOC2:AUTH-02 a Brain scope's book is exactly its owners' customers
        return base.filter(owner_id__in=sorted(owner_scope))
```

In `visible_accounts`, directly after the `base = Account.objects.filter(...)` statement:

```python
    owner_scope = getattr(user, "owner_scope", None)
    if owner_scope is not None:
        owners = sorted(owner_scope)
        # SOC2:AUTH-02 a Brain scope's accounts: its owners' own and those under its owners' customers
        return base.filter(
            Q(owner_id__in=owners)
            | Q(id__in=links.filter(customer__owner_id__in=owners).values("account_id"))
        )
```

- [ ] **Step 6: Scope the registry**

In `services/metrics/registry.py`, replace `_knowledge` with:

```python
def _knowledge(actor):
    """What the company is asking and telling itself — services.knowledge.
    Questions waiting on people, how many have waited too long, and how much
    the functions have written down lately. A Brain scope counts its own
    people: questions assigned to them, and what they wrote."""
    from datetime import timedelta

    from services.knowledge.aging import STALE_DAYS, open_questions, stale_open_questions
    from services.knowledge.models import Contribution

    organisation = actor.organisation
    waiting = open_questions(organisation)
    stale = stale_open_questions(organisation, STALE_DAYS)
    written = Contribution.objects.filter(
        organisation=organisation, created_at__gte=timezone.now() - timedelta(days=30)
    )
    owner_scope = getattr(actor, "owner_scope", None)
    if owner_scope is not None:
        people = sorted(owner_scope)
        waiting = waiting.filter(assignee_id__in=people)
        stale = stale.filter(assignee_id__in=people)
        written = written.filter(author_id__in=people)
    return {
        "open_questions": waiting.count(),
        "stale_questions": stale.count(),
        "contributions_30d": written.count(),
    }
```

Change the `read` of `shelfware_arr` and `at_capacity_arr`:

```python
(lambda s: s["kpis"]["shelfware_arr"] if s["kpis"]["measured_count"] else None,)
```

```python
(lambda s: s["kpis"]["at_capacity_arr"] if s["kpis"]["measured_count"] else None,)
```

and append to each metric's `note`: `" Unmeasured when no account has seats recorded."` (inside the existing string concatenation).

Replace everything from `def _sources_for` to `def as_of` with:

```python
def _sources_for(organisation, metrics, actor=None):
    """Each source a metric in `metrics` reads, computed once, as `actor` —
    the whole organisation (`SystemActor`) unless a Brain scope passes its
    own."""
    actor = actor if actor is not None else SystemActor(organisation)
    computed = {}
    for metric in metrics:
        if metric.source not in computed:
            computed[metric.source] = SOURCES[metric.source](actor)
    return computed


def _values(computed):
    return {metric.key: metric.read(computed[metric.source]) for metric in METRICS}


def _cuts(computed, metrics):
    return {
        metric.key: {
            dimension: read(computed[metric.source]) for dimension, read in metric.slices.items()
        }
        for metric in metrics
        if metric.slices
    }


def compute_all(organisation, today=None, actor=None):
    """`{metric key: value}` for the whole organisation (or `actor`'s book),
    right now.

    Each source rollup runs once. A source that raises takes its metrics down
    with it, loudly — a metric layer that swallowed errors and reported None
    would be reporting "unmeasured" for what is actually "broken".
    """
    return _values(_sources_for(organisation, METRICS, actor))


def compute_slices(organisation, actor=None):
    """`{metric key: {dimension: [(member, label, value), ...]}}` for every
    metric that has a cut. Same sources, computed once."""
    sliced = [metric for metric in METRICS if metric.slices]
    return _cuts(_sources_for(organisation, sliced, actor), sliced)


def compute_slice(organisation, metric, dimension, actor=None):
    """One metric, one cut — `[(member, label, value)]`."""
    computed = _sources_for(organisation, [metric], actor)
    return metric.slices[dimension](computed[metric.source])


def compute_figures(organisation, actor=None):
    """`(values, cuts)` from one pass over every source — what a Brain scope
    reads, so its figures and its cuts can never come from two runs."""
    computed = _sources_for(organisation, METRICS, actor)
    return _values(computed), _cuts(computed, METRICS)
```

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.customers.tests.test_scoping services.metrics services.customers.tests.test_usage --parallel --noinput`
Expected: PASS (the existing registry, signals, brief and explain tests unchanged).

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff check services && venv/bin/ruff format services
venv/bin/python manage.py makemigrations --check --dry-run
git add services/customers/scoping.py services/metrics/registry.py services/brain/__init__.py services/brain/tests services/customers/tests/test_scoping.py services/metrics/tests/test_registry.py
git commit -m "feat(brain): ScopeActor and figures over one owner set's book

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Signals against a given comparison point, and figure digests

**Files:**
- Modify: `services/metrics/signals.py`
- Test: `services/metrics/tests/test_signals_scoped.py` (new)

**Interfaces:**
- Consumes: `registry.METRICS`, `compute_all`, `compute_slices` (Task 1).
- Produces: `signals_for(organisation, values=None, *, previous=None, previous_slices=None, slices=None, baseline=None) -> dict` (same payload shape as today; with `previous` given, each signal's `previous.period_end` is `baseline`). `previous` is `{metric key: number | None}`, `previous_slices` is `{metric key: {dimension: {member: number | None}}}`, `slices` is `{metric key: {dimension: [(member, label, value)]}}` and **must** be passed with `previous`.
- Produces: `previous_from_snapshots(organisation) -> tuple[date | None, dict, dict]` (`baseline`, `previous`, `previous_slices` from the latest whole-org and member `MetricSnapshot` rows).
- Produces: `digest(figures) -> str` (64 hex chars), `brief_digest(values: dict) -> str`, `explanation_digest(value, cuts: dict) -> str` (`cuts` is one metric's `{dimension: [(member, label, value)]}`).

- [ ] **Step 1: Write the failing tests**

Create `services/metrics/tests/test_signals_scoped.py`:

```python
"""signals_for against a caller's own comparison point, and the digests that
say whether a stored brief or explanation still matches the figures."""

from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase, TestCase

from services.accounts.models import Organisation
from services.metrics import signals
from services.metrics.models import MetricSnapshot
from services.metrics.registry import METRICS


def _values(**overrides):
    values = {metric.key: None for metric in METRICS}
    values.update(overrides)
    return values


class GivenComparisonTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Acme Inc", currency="USD")

    def test_the_given_point_is_used_instead_of_the_month_end(self):
        MetricSnapshot.objects.create(
            organisation=self.org,
            metric="active_arr",
            period_end=date(2026, 8, 31),
            value=Decimal("1"),
        )
        payload = signals.signals_for(
            self.org,
            _values(active_arr=300_000.0, at_risk_arr=60_000.0),
            previous=_values(active_arr=400_000.0, at_risk_arr=10_000.0),
            previous_slices={"at_risk_arr": {"owner": {"7": 10_000.0}}},
            slices={"at_risk_arr": {"owner": [("7", "Carl CSM", 60_000.0)], "product": []}},
            baseline=date(2026, 10, 1),
        )
        by_key = {s["key"]: s for s in payload["signals"]}
        self.assertEqual(payload["baseline"], "2026-10-01")
        self.assertEqual(
            by_key["active_arr"]["previous"], {"period_end": "2026-10-01", "value": 400_000.0}
        )
        self.assertEqual(by_key["active_arr"]["change"], -100_000.0)
        self.assertIs(by_key["at_risk_arr"]["improved"], False)
        self.assertEqual(
            [(d["member"], d["change"]) for d in by_key["at_risk_arr"]["drivers"]],
            [("7", 50_000.0)],
        )
        # Both bad; ARR at risk moved 500%, ARR 25%.
        self.assertEqual([s["key"] for s in payload["signals"]], ["at_risk_arr", "active_arr"])

    def test_an_empty_point_makes_no_signal(self):
        payload = signals.signals_for(
            self.org, _values(active_arr=1.0), previous={}, previous_slices={}, slices={}
        )
        self.assertEqual((payload["signals"], payload["baseline"]), ([], None))

    def test_the_month_end_point_is_the_latest_row_per_metric_and_member(self):
        for period, value in ((date(2026, 8, 31), "1"), (date(2026, 9, 30), "2")):
            MetricSnapshot.objects.create(
                organisation=self.org, metric="active_arr", period_end=period, value=Decimal(value)
            )
            MetricSnapshot.objects.create(
                organisation=self.org,
                metric="at_risk_arr",
                dimension="owner",
                member="7",
                period_end=period,
                value=Decimal(value) + 4,
            )
        baseline, previous, cuts = signals.previous_from_snapshots(self.org)
        self.assertEqual(baseline, date(2026, 9, 30))
        self.assertEqual(previous, {"active_arr": 2.0})
        self.assertEqual(cuts, {"at_risk_arr": {"owner": {"7": 6.0}}})


class DigestTests(SimpleTestCase):
    def test_a_brief_digest_ignores_key_order_and_number_types(self):
        one = signals.brief_digest({"b": Decimal("1.5"), "a": None})
        self.assertEqual(one, signals.brief_digest({"a": None, "b": 1.5}))
        self.assertEqual(len(one), 64)
        self.assertNotEqual(one, signals.brief_digest({"a": None, "b": 1.6}))

    def test_an_explanation_digest_covers_values_not_labels(self):
        one = signals.explanation_digest(10.0, {"owner": [("7", "Carl", 4.0)]})
        self.assertEqual(one, signals.explanation_digest(10.0, {"owner": [("7", "Carl C.", 4.0)]}))
        self.assertNotEqual(one, signals.explanation_digest(10.0, {"owner": [("7", "Carl", 5.0)]}))
        self.assertNotEqual(one, signals.explanation_digest(11.0, {"owner": [("7", "Carl", 4.0)]}))
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.metrics.tests.test_signals_scoped --parallel --noinput`
Expected: ERROR/FAIL, `TypeError: signals_for() got an unexpected keyword argument 'previous'` and `AttributeError: ... has no attribute 'brief_digest'`.

- [ ] **Step 3: Implement**

In `services/metrics/signals.py`, add `import hashlib` and `import json` to the imports, then add after `number`:

```python
def digest(figures):
    """SHA-256 of `figures` as canonical JSON: what a stored brief or
    explanation was written from, so a later read can tell whether the
    numbers have moved since."""
    payload = json.dumps(figures, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def brief_digest(values):
    """Every metric's value, number-normalised."""
    return digest({key: number(value) for key, value in values.items()})


def explanation_digest(value, cuts):
    """One metric's value and each cut member's value — labels left out, so
    a renamed owner is not a move. `cuts` is `{dimension: [(member, label,
    value)]}`."""
    return digest(
        {
            "value": number(value),
            "cuts": {
                dimension: {member: number(v) for member, _label, v in members}
                for dimension, members in (cuts or {}).items()
            },
        }
    )
```

After `latest_by_member`, add:

```python
def previous_from_snapshots(organisation):
    """The whole organisation's comparison point: `(baseline, previous,
    previous_slices)` from the latest month-end row per metric and per cut
    member — what Company's "What changed" reads."""
    latest = latest_whole_org(organisation)
    baseline = max((row.period_end for row in latest.values()), default=None)
    previous = {key: number(row.value) for key, row in latest.items()}
    cuts = {}
    rows = (
        MetricSnapshot.objects.filter(organisation=organisation)
        .exclude(dimension="")
        .order_by("metric", "dimension", "member", "-period_end")
    )
    for row in rows:
        members = cuts.setdefault(row.metric, {}).setdefault(row.dimension, {})
        members.setdefault(row.member, number(row.value))
    return baseline, previous, cuts
```

Replace `signals_for` with:

```python
def signals_for(
    organisation,
    values=None,
    *,
    previous=None,
    previous_slices=None,
    slices=None,
    baseline=None,
):
    """The signals payload: `as_of`, `baseline`, `currency`, `signals`.

    `values` may be passed by a caller that has already run compute_all, so
    the brief doesn't pay for the rollups twice.

    With no `previous`, moves are measured from the whole organisation's
    latest month-end, as always. A Brain scope passes its own comparison
    point instead — `previous` `{key: number | None}`, `previous_slices`
    `{key: {dimension: {member: number | None}}}`, the `baseline` date they
    were taken on — together with its own current `slices`, so the same rule
    runs over the scope's book.
    """
    values = values if values is not None else compute_all(organisation)
    if previous is None:
        latest = latest_whole_org(organisation)
        baseline = max((row.period_end for row in latest.values()), default=None)
        previous = {key: number(row.value) for key, row in latest.items()}
        periods = {key: row.period_end for key, row in latest.items()}

        def member_values(key, dimension):
            rows = latest_by_member(organisation, key, dimension)
            return {member: number(row.value) for member, row in rows.items()}

    else:
        periods = {key: baseline for key in previous}

        def member_values(key, dimension):
            return (previous_slices or {}).get(key, {}).get(dimension, {})

    signals = []
    for metric in METRICS:
        now = number(values[metric.key])
        previous_value = previous.get(metric.key)
        if not material(metric, now, previous_value):
            continue
        change = round(now - previous_value, 4)
        improved = None if metric.better == "none" else (change > 0) == (metric.better == "up")

        drivers = []
        if metric.slices:
            if slices is None:
                slices = compute_slices(organisation)
            for dimension, members in slices.get(metric.key, {}).items():
                was_by_member = member_values(metric.key, dimension)
                for member, label, value in members:
                    was = was_by_member.get(member)
                    if value is None or was is None:
                        continue
                    move = round(number(value) - was, 4)
                    if move:
                        drivers.append(
                            {
                                "dimension": dimension,
                                "dimension_label": DIMENSION_LABELS[dimension],
                                "member": member,
                                "label": label,
                                "value": number(value),
                                "change": move,
                            }
                        )
            drivers.sort(key=lambda d: -abs(d["change"]))

        signals.append(
            {
                **describe(metric),
                "value": now,
                "previous": {
                    "period_end": periods[metric.key].isoformat(),
                    "value": previous_value,
                },
                "change": change,
                "improved": improved,
                "drivers": drivers[:DRIVER_LIMIT],
            }
        )

    # Bad news first, biggest relative move first within it.
    def rank(signal):
        rel = abs(signal["change"]) / abs(signal["previous"]["value"] or 1)
        return (signal["improved"] is not False, -rel)

    signals.sort(key=rank)
    return {
        "as_of": as_of().isoformat(),
        "baseline": baseline.isoformat() if baseline else None,
        "currency": organisation.currency,
        "signals": signals,
    }
```

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.metrics --parallel --noinput`
Expected: PASS (the existing signals, brief and view tests unchanged).

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check services/metrics && venv/bin/ruff format services/metrics
git add services/metrics/signals.py services/metrics/tests/test_signals_scoped.py
git commit -m "feat(metrics): signals from a given comparison point; figure digests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Scope keys on model calls, briefs and explanations

**Files:**
- Modify: `services/copilot/models.py` (`ModelCall`, ~line 358), `services/copilot/anthropic_client.py` (`get_completion`, ~line 89)
- Create: `services/copilot/migrations/0019_modelcall_scope_key.py` (generated)
- Modify: `services/metrics/models.py` (`Brief`, `Explanation`), `services/metrics/brief.py`, `services/metrics/explain.py`, `services/metrics/views.py` (`BriefView`, `MetricExplanationView`), `services/metrics/delivery.py` (`latest_brief`)
- Create: `services/metrics/migrations/0009_brief_explanation_scope.py` (generated)
- Test: `services/copilot/tests/test_usage.py`, `services/metrics/tests/test_brief.py`, `services/metrics/tests/test_explain.py`

**Interfaces:**
- Consumes: `signals.brief_digest`, `explanation_digest`, `number` (Task 2).
- Produces: `ModelCall.scope_key` (CharField(32), blank); `get_completion(..., scope_key: str = "")`.
- Produces: `metrics.models.COMPANY_SCOPE = "company"`; `Brief.scope_key`, `Brief.figures_digest`, `Explanation.scope_key`, `Explanation.figures_digest`.
- Produces: `brief.evidence_from(organisation, *, values, slices, previous, baseline, signals, scope_label=None, customers=None) -> dict` (raises `NothingToBrief`); `customers` is a list of `{"id", "name", "owner", "arr", "downside", "days_to_renewal", "health"}` and is stored as `evidence["customers"]` plus `evidence["customer_ids"]`; `brief.generate_brief(organisation, *, generated_by=None, evidence=None, scope_key=COMPANY_SCOPE, figures_digest=None) -> Brief`.
- Produces: `explain.account_line(row) -> dict`; `explain.evidence_from(organisation, key, *, value, previous_value, baseline, cuts, previous_cuts, accounts, hidden=0, customer_ids=(), initiatives=()) -> dict` (`evidence["hidden"]`, `evidence["customer_ids"]`); `explain.explain(organisation, key, *, generated_by=None, evidence=None, scope_key=COMPANY_SCOPE, figures_digest=None) -> Explanation`.

- [ ] **Step 1: Write the failing tests**

Append to `services/copilot/tests/test_usage.py`:

```python
class ScopeKeyTests(TestCase):
    def test_the_scope_a_call_was_made_for_is_logged(self):
        org = Organisation.objects.create(name="Acme Inc")
        with patch(
            "services.copilot.anthropic_client._build_client_and_model",
            return_value=(_fake_client(), "m"),
        ):
            get_completion("sys", [], purpose="brief", organisation=org, scope_key="team:12")
            get_completion("sys", [], purpose="brief", organisation=org)
        self.assertEqual(
            sorted(ModelCall.objects.values_list("scope_key", flat=True)), ["", "team:12"]
        )
```

Append to `services/metrics/tests/test_brief.py` (add imports: `from datetime import timedelta`, `from django.utils import timezone`, `from services.metrics import delivery, registry, signals`):

```python
CUSTOMER = {
    "id": 5,
    "name": "Shaky",
    "owner": "Carl",
    "arr": 100_000.0,
    "downside": 17_400.0,
    "days_to_renewal": 30,
    "health": "poor",
}


class ScopedBriefTests(TestCase):
    def setUp(self):
        self.org, self.admin, self.csm = _org()

    def test_a_scope_prompt_says_whose_book_and_names_its_customers(self):
        evidence = brief.evidence_from(
            self.org,
            values=registry.compute_all(self.org),
            slices=registry.compute_slices(self.org),
            previous={},
            baseline=None,
            signals=[],
            scope_label="My team",
            customers=[CUSTOMER],
        )
        prompt = brief.build_prompt(evidence)
        self.assertTrue(prompt.startswith("Scope: My team."))
        self.assertIn(
            "- Shaky (owner Carl): ARR USD 100,000, downside USD 17,400, renews in 30 days, "
            "health poor",
            prompt,
        )
        self.assertEqual(evidence["customer_ids"], [5])

    def test_the_company_prompt_is_unchanged(self):
        prompt = brief.build_prompt(brief.build_evidence(self.org))
        self.assertNotIn("Scope:", prompt)
        self.assertNotIn("CUSTOMERS IN THIS BOOK", prompt)

    def test_generate_stores_the_scope_and_the_digest_and_logs_the_scope(self):
        evidence = brief.build_evidence(self.org)
        with patch(PATH, return_value=ANSWER) as call:
            row = brief.generate_brief(
                self.org,
                generated_by=self.admin,
                evidence=evidence,
                scope_key="team:9",
                figures_digest="d" * 64,
            )
        self.assertEqual((row.scope_key, row.figures_digest), ("team:9", "d" * 64))
        self.assertEqual(call.call_args.kwargs["scope_key"], "team:9")

    def test_a_company_brief_digests_its_own_figures(self):
        with patch(PATH, return_value=ANSWER):
            row = brief.generate_brief(self.org, generated_by=self.admin)
        self.assertEqual(row.scope_key, "company")
        self.assertEqual(row.figures_digest, signals.brief_digest(registry.compute_all(self.org)))

    def test_the_company_readers_never_return_a_scope_brief(self):
        company = Brief.objects.create(
            organisation=self.org,
            as_of=date(2026, 10, 1),
            headline="Company",
            body="b",
            evidence={},
            generated_at=timezone.now() - timedelta(hours=1),
        )
        Brief.objects.create(
            organisation=self.org,
            as_of=date(2026, 10, 2),
            headline="Mine",
            body="b",
            evidence={},
            generated_at=timezone.now(),
            scope_key=f"me:{self.csm.id}",
        )
        client = APIClient()
        client.force_authenticate(self.admin)
        self.assertEqual(client.get("/api/v1/metrics/brief/").data["brief"]["headline"], "Company")
        self.assertEqual(delivery.latest_brief(self.org), company)
```

(Add `from rest_framework.test import APIClient` if absent.)

Append to `services/metrics/tests/test_explain.py` (add `from services.metrics import signals` and `from rest_framework.test import APIClient` if absent):

```python
class ScopedExplanationTests(TestCase):
    def setUp(self):
        self.org, self.admin, self.csm = _org()
        Customer.objects.filter(organisation=self.org, name="Shaky").update(
            renewal_date=timezone.localdate() + timedelta(days=30)
        )

    def test_hidden_accounts_are_counted_not_named(self):
        evidence = explain.evidence_from(
            self.org,
            "at_risk_arr",
            value=17_400.0,
            previous_value=None,
            baseline=None,
            cuts={},
            previous_cuts={},
            accounts=[],
            hidden=2,
        )
        prompt = explain.build_prompt(evidence)
        self.assertIn("- 2 more that this reader cannot open; not named here", prompt)
        self.assertNotIn("- none:", prompt)
        self.assertEqual((evidence["hidden"], evidence["customer_ids"]), (2, []))

    def test_the_company_evidence_records_the_customers_it_names(self):
        evidence = explain.build_evidence(self.org, "at_risk_arr")
        shaky = Customer.objects.get(organisation=self.org, name="Shaky")
        self.assertEqual(evidence["customer_ids"], [shaky.id])

    def test_explain_stores_the_scope_and_a_digest_of_its_figures(self):
        evidence = explain.build_evidence(self.org, "at_risk_arr")
        with patch(PATH, return_value=ANSWER) as call:
            row = explain.explain(
                self.org, "at_risk_arr", generated_by=self.admin, scope_key="me:3"
            )
        cuts = {
            c["dimension"]: [(m["member"], m["label"], m["value"]) for m in c["members"]]
            for c in evidence["cuts"]
        }
        self.assertEqual(row.scope_key, "me:3")
        self.assertEqual(row.figures_digest, signals.explanation_digest(evidence["value"], cuts))
        self.assertEqual(call.call_args.kwargs["scope_key"], "me:3")

    def test_the_company_route_ignores_scoped_rows(self):
        with patch(PATH, return_value=ANSWER):
            explain.explain(self.org, "at_risk_arr", scope_key=f"me:{self.csm.id}")
        client = APIClient()
        client.force_authenticate(self.admin)
        response = client.get("/api/v1/metrics/at_risk_arr/explanation/")
        self.assertIsNone(response.data["explanation"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.copilot.tests.test_usage services.metrics.tests.test_brief services.metrics.tests.test_explain --parallel --noinput`
Expected: ERROR/FAIL (`unexpected keyword argument 'scope_key'`, `no attribute 'evidence_from'`).

- [ ] **Step 3: `ModelCall.scope_key` and `get_completion`**

In `services/copilot/models.py`, `class ModelCall`, after `purpose`:

```python
    scope_key = models.CharField(
        max_length=32,
        blank=True,
        help_text='The Brain scope a brief or explanation was written for ("company", '
        '"team:12"); blank for every other call.',
    )
```

In `services/copilot/anthropic_client.py`, add `scope_key: str = "",` after `user=None,` in the signature; add to the docstring's audit paragraph: "`scope_key` names the Brain scope a brief or explanation was written for."; and pass `scope_key=scope_key,` in `log`'s `usage.record_call(...)` call after `purpose=purpose,`.

Run: `venv/bin/python manage.py makemigrations copilot --name modelcall_scope_key`
Expected: `services/copilot/migrations/0019_modelcall_scope_key.py` with one `AddField`.

- [ ] **Step 4: `Brief`/`Explanation` fields**

In `services/metrics/models.py`, above `class MetricSnapshot`:

```python
#: The scope key of the whole organisation's briefs and explanations — the
#: ones `/api/v1/metrics/` and the Slack delivery read. A Brain scope stores
#: `me:<user id>` or `team:<user id>` (services/brain/scope.py).
COMPANY_SCOPE = "company"
```

In `class Brief`, after `generated_at`:

```python
    scope_key = models.CharField(
        max_length=32,
        default=COMPANY_SCOPE,
        help_text='Whose figures: "company", or a Brain scope "me:<id>" / "team:<id>".',
    )
    figures_digest = models.CharField(
        max_length=64,
        blank=True,
        help_text="SHA-256 of the figures the prompt carried; a different digest today "
        "means the numbers have moved since (stale).",
    )
```

and in its `Meta` add `indexes = [models.Index(fields=["organisation", "scope_key", "-generated_at"], name="metrics_brief_scope_latest")]`.

In `class Explanation`, after `generated_at`, the same two fields (help text for the digest: "SHA-256 of the metric's value and cuts the prompt carried."), and in its `Meta` append to `indexes`: `models.Index(fields=["organisation", "scope_key", "metric", "-generated_at"], name="metrics_expl_scope_latest")`.

Run: `venv/bin/python manage.py makemigrations metrics --name brief_explanation_scope`
Expected: `services/metrics/migrations/0009_brief_explanation_scope.py` with four `AddField` (existing rows take `scope_key="company"` and a blank digest) and two `AddIndex`.

- [ ] **Step 5: `brief.evidence_from`, the scoped prompt and the write**

In `services/metrics/brief.py`: import `COMPANY_SCOPE` with `Brief` from `.models`, and `brief_digest, number` with `signals_for` from `.signals`. Add to `SYSTEM_PROMPT`'s rules, before the last rule:

```
- If a Scope line is given, the figures are that part of the book only: say \
so once, and name customers only from the CUSTOMERS list.
```

Replace `build_evidence` with:

```python
def evidence_from(
    organisation,
    *,
    values,
    slices,
    previous,
    baseline,
    signals,
    scope_label=None,
    customers=None,
):
    """Everything the model is allowed to know, as plain data, for any part
    of the book: `values`/`slices` as `registry.compute_figures` returns
    them, `previous` `{key: number}` taken on `baseline`, `signals` in
    `signals_for`'s shape. A Brain scope adds its label and the customers in
    its book it may name; the Company brief names none."""
    if not values["active_customers"] and not values["churned_arr_12m"]:
        raise NothingToBrief("There are no customers to write a brief about yet.")

    currency = organisation.currency
    period = baseline.isoformat() if baseline else None
    metrics = []
    for metric in METRICS:
        now = number(values[metric.key])
        had = metric.key in previous
        previous_value = number(previous.get(metric.key))
        metrics.append(
            {
                "key": metric.key,
                "label": metric.label,
                "unit": metric.unit,
                "better": metric.better,
                "value": now,
                "previous": {"period_end": period, "value": previous_value} if had else None,
                "change": (
                    round(now - previous_value, 4)
                    if now is not None and previous_value is not None
                    else None
                ),
            }
        )

    cuts = []
    for key in CUT_METRICS:
        metric = BY_KEY[key]
        for dimension, members in slices.get(key, {}).items():
            ranked = sorted(
                ((m, label, number(v)) for m, label, v in members),
                key=lambda item: (item[2] is None, -(item[2] or 0)),
            )[:CUT_MEMBERS]
            cuts.append(
                {
                    "metric": key,
                    "label": metric.label,
                    "unit": metric.unit,
                    "dimension": dimension,
                    "dimension_label": DIMENSION_LABELS[dimension],
                    "members": [
                        {"member": m, "label": label, "value": v} for m, label, v in ranked
                    ],
                }
            )

    evidence = {
        "as_of": as_of().isoformat(),
        "baseline": period,
        "currency": currency,
        "metrics": metrics,
        "signals": signals,
        "cuts": cuts,
    }
    if scope_label:
        evidence["scope"] = scope_label
    if customers is not None:
        evidence["customers"] = list(customers)
        evidence["customer_ids"] = [customer["id"] for customer in customers]
    return evidence


def build_evidence(organisation):
    """The whole organisation's evidence, compared with its latest month-end."""
    from .signals import latest_whole_org

    values = compute_all(organisation)
    if not values["active_customers"] and not values["churned_arr_12m"]:
        raise NothingToBrief("There are no customers to write a brief about yet.")
    payload = signals_for(organisation, values)
    latest = latest_whole_org(organisation)
    return evidence_from(
        organisation,
        values=values,
        slices=compute_slices(organisation),
        previous={key: number(row.value) for key, row in latest.items()},
        baseline=date.fromisoformat(payload["baseline"]) if payload["baseline"] else None,
        signals=payload["signals"],
    )
```

(Import `as_of` from `.registry` alongside the existing names.)

In `build_prompt`, replace its first line with:

```python
currency = evidence["currency"]
lines = []
if evidence.get("scope"):
    lines.append(
        f"Scope: {evidence['scope']}. These figures are this part of the organisation's book only."
    )
lines.append(f"Figures as of {evidence['as_of']}. Currency: {currency}.")
```

and before `return "\n".join(lines)`:

```python
    if evidence.get("customers"):
        lines.append("\nCUSTOMERS IN THIS BOOK CARRYING DOWNSIDE (largest first):")
        for c in evidence["customers"]:
            lines.append(
                f"- {c['name']} (owner {c['owner']}): ARR {_money(c['arr'], currency)}, "
                f"downside {_money(c['downside'], currency)}, {_renewal(c['days_to_renewal'])}, "
                f"health {c['health']}"
            )
```

with, next to `_money`:

```python
def _renewal(days):
    if days is None:
        return "no renewal date"
    if days < 0:
        return f"renewal overdue by {-days} days"
    return f"renews in {days} days"
```

Replace `generate_brief`'s signature, its first statement, the `get_completion` call's keywords and the `create` with:

```python
def generate_brief(
    organisation,
    *,
    generated_by=None,
    evidence=None,
    scope_key=COMPANY_SCOPE,
    figures_digest=None,
):
    """Write and store a brief. Costs one model call.

    With no `evidence`, the whole organisation's (`build_evidence`); a Brain
    scope passes its own and its `scope_key`. Lets CopilotNotConfigured /
    CopilotRequestFailed / BudgetExceeded through untouched, so the view can
    map them to 503/502/429. Raises NothingToBrief on an empty book and
    ValueError on an unreadable answer.
    """
    evidence = evidence if evidence is not None else build_evidence(organisation)
    raw = get_completion(
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_prompt(evidence)}],
        max_tokens=OUTPUT_TOKENS,
        purpose="brief",
        organisation=organisation,
        user=generated_by,
        scope_key=scope_key,
    )
    headline, body, watch = _parse(raw)
    if figures_digest is None:
        figures_digest = brief_digest({m["key"]: m["value"] for m in evidence["metrics"]})
    # Real dates, not the ISO strings the evidence carries: the instance is
    # returned as-is, and a string would only become a date on reload.
    return Brief.objects.create(
        organisation=organisation,
        as_of=date.fromisoformat(evidence["as_of"]),
        baseline=date.fromisoformat(evidence["baseline"]) if evidence["baseline"] else None,
        headline=headline,
        body=body,
        watch=watch,
        evidence=evidence,
        generated_by=generated_by,
        generated_at=timezone.now(),
        scope_key=scope_key,
        figures_digest=figures_digest,
    )
```

- [ ] **Step 6: `explain.evidence_from`, hidden accounts and the write**

In `services/metrics/explain.py`: import `COMPANY_SCOPE` with the models, and `explanation_digest` with the signals names. Replace `build_evidence` with:

```python
def account_line(row):
    """One `forecast.exposure_list` row as the prompt's account entry."""
    return {
        "name": row["name"],
        "owner": row["owner"],
        "arr": row["arr"],
        "downside": row["downside"],
        "days_to_renewal": row["days_to_renewal"],
        "health": row["health_category"],
        "factors": [f["label"] for f in row["factors"]] if row["factors"] else [],
    }


def evidence_from(
    organisation,
    key,
    *,
    value,
    previous_value,
    baseline,
    cuts,
    previous_cuts,
    accounts,
    hidden=0,
    customer_ids=(),
    initiatives=(),
):
    """What the prompt may carry about `key`, for any part of the book.
    `cuts` is this metric's `{dimension: [(member, label, value)]}` and
    `previous_cuts` `{dimension: {member: value}}`; `accounts` are
    `account_line`s of customers the reader may open, `hidden` how many more
    carry downside, `customer_ids` the ids of the named ones."""
    metric = BY_KEY[key]
    return {
        "as_of": as_of().isoformat(),
        "baseline": baseline.isoformat() if baseline else None,
        "currency": organisation.currency,
        "metric": {
            "key": metric.key,
            "label": metric.label,
            "unit": metric.unit,
            "better": metric.better,
            "note": metric.note,
        },
        "value": number(value),
        "previous_value": number(previous_value),
        "cuts": [
            {
                "dimension": dimension,
                "dimension_label": DIMENSION_LABELS[dimension],
                "members": [
                    {
                        "member": m,
                        "label": label,
                        "value": number(v),
                        "previous": (previous_cuts.get(dimension) or {}).get(m),
                    }
                    for m, label, v in members
                ],
            }
            for dimension, members in cuts.items()
        ],
        "accounts": list(accounts),
        "hidden": hidden,
        "customer_ids": list(customer_ids),
        "initiatives": list(initiatives),
    }


def build_evidence(organisation, key):
    metric = BY_KEY.get(key)
    if metric is None:
        raise UnknownMetric(f"No metric called {key!r}.")
    actor = SystemActor(organisation)
    if not live_customers(actor).exists():
        raise NothingToExplain("There are no live customers, so there is nothing to explain.")

    values = compute_all(organisation)
    previous = latest_whole_org(organisation).get(key)
    cuts = compute_slices(organisation)[key] if metric.slices else {}
    previous_cuts = {
        dimension: {
            member: number(row.value)
            for member, row in latest_by_member(organisation, key, dimension).items()
        }
        for dimension in cuts
    }

    customers = list(forecast.filtered_customers(actor, {}))
    rows = forecast.build_rows(
        customers, organisation, viewer=actor, horizon=forecast.horizon_days({})
    )
    exposed = forecast.exposure_list(rows, limit=EXPOSURE_LIMIT)
    initiatives = [
        {
            "title": i.title,
            "member_label": i.member_label,
            "target_value": number(i.target_value),
            "target_by": i.target_by.isoformat(),
        }
        for i in Initiative.objects.filter(
            organisation=organisation,
            metric=key,
            status__in=[Initiative.Status.PLANNED, Initiative.Status.ACTIVE],
        )
    ]
    return evidence_from(
        organisation,
        key,
        value=values[key],
        previous_value=number(previous.value) if previous else None,
        baseline=previous.period_end if previous else None,
        cuts=cuts,
        previous_cuts=previous_cuts,
        accounts=[account_line(row) for row in exposed],
        customer_ids=[row["id"] for row in exposed],
        initiatives=initiatives,
    )
```

In `build_prompt`, replace the accounts block's opening (`if not evidence["accounts"]:` … `lines.append("- none: …")`) with:

```python
    hidden = evidence.get("hidden", 0)
    if not evidence["accounts"] and not hidden:
        lines.append("- none: no account carries measurable downside right now")
```

and after the `for a in evidence["accounts"]:` loop:

```python
    if hidden:
        lines.append(f"- {hidden} more that this reader cannot open; not named here")
```

Replace `explain`'s signature and body:

```python
def explain(
    organisation,
    key,
    *,
    generated_by=None,
    evidence=None,
    scope_key=COMPANY_SCOPE,
    figures_digest=None,
):
    """One model call → the stored explanation of `key` as it stands today.

    With no `evidence`, the whole organisation's (`build_evidence`); a Brain
    scope passes its own and its `scope_key`. Lets CopilotNotConfigured /
    CopilotRequestFailed / BudgetExceeded through for the view; raises
    UnknownMetric, NothingToExplain, or ValueError on an unreadable answer.
    """
    evidence = evidence if evidence is not None else build_evidence(organisation, key)
    raw = get_completion(
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": build_prompt(evidence)}],
        max_tokens=OUTPUT_TOKENS,
        purpose="explain",
        organisation=organisation,
        user=generated_by,
        scope_key=scope_key,
    )
    text, cited = _parse(raw)
    if figures_digest is None:
        cuts = {
            c["dimension"]: [(m["member"], m["label"], m["value"]) for m in c["members"]]
            for c in evidence["cuts"]
        }
        figures_digest = explanation_digest(evidence["value"], cuts)
    return Explanation.objects.create(
        organisation=organisation,
        metric=key,
        as_of=date.fromisoformat(evidence["as_of"]),
        baseline=date.fromisoformat(evidence["baseline"]) if evidence["baseline"] else None,
        value=as_decimal(evidence["value"]),
        previous_value=as_decimal(evidence["previous_value"]),
        text=text,
        evidence=cited,
        inputs=evidence,
        generated_by=generated_by,
        generated_at=timezone.now(),
        scope_key=scope_key,
        figures_digest=figures_digest,
    )
```

- [ ] **Step 7: The Company readers read Company rows only**

`services/metrics/views.py` `BriefView.get`: `Brief.objects.filter(organisation=request.user.organisation, scope_key=COMPANY_SCOPE).first()`. `MetricExplanationView.get`: `Explanation.objects.filter(organisation=request.user.organisation, metric=key, scope_key=COMPANY_SCOPE).first()`. Import `COMPANY_SCOPE` with the other `.models` names. `services/metrics/delivery.py` `latest_brief`:

```python
def latest_brief(organisation):
    # Company only: a Me or My team brief may name customers, and never
    # leaves its owner's screen.
    return (
        Brief.objects.filter(organisation=organisation, scope_key=COMPANY_SCOPE)
        .order_by("-as_of", "-id")
        .first()
    )
```

- [ ] **Step 8: Run the tests**

Run: `venv/bin/python manage.py test services.metrics services.copilot --parallel --noinput && venv/bin/python manage.py makemigrations --check --dry-run`
Expected: PASS; "No changes detected".

- [ ] **Step 9: Commit**

```bash
venv/bin/ruff check services && venv/bin/ruff format services
git add services/copilot services/metrics
git commit -m "feat(metrics): briefs and explanations carry a scope and a figures digest

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The brain app, its models, the resolver and figures

**Files:**
- Create: `services/brain/apps.py`, `services/brain/models.py`, `services/brain/migrations/__init__.py`, `services/brain/migrations/0001_initial.py` (generated), `services/brain/scope.py`, `services/brain/metrics.py`
- Modify: `config/settings.py` (`INSTALLED_APPS`, after `"services.plans",`)
- Test: `services/brain/tests/test_scope.py`

**Interfaces:**
- Consumes: `ScopeActor`, `SystemActor`, `sees_everything`, `visible_customers` (Task 1); `registry.compute_figures` (Task 1); `signals.number`; `metrics.models.COMPANY_SCOPE` (Task 3).
- Produces: `ScopeSnapshot` (`organisation`, `scope_key`, `user`, `taken_on`, `kind` ∈ `ScopeSnapshot.Kind.MONTH_END`/`BASELINE`, `reason`, `owner_ids`, `customer_ids`, `values`, `slices`, `created_at`); `BriefLock` (`organisation`, `scope_key` ≤ 96).
- Produces: `scope.ME`, `TEAM`, `COMPANY`, `LABELS`; `ScopeUnknown`, `ScopeNotAllowed` (each with `.code`, `.detail`); `Scope(key, stored_key, owner_ids, label, actor, user)` with property `is_company`; `available(reader) -> list[str]` (narrowest first); `default_key(reader) -> str`; `resolve(reader, key) -> Scope`.
- Produces: `brain.metrics.Figures(values, slices, book)` (`book`: frozenset of customer ids, `None` for Company); `figures(scope) -> Figures`; `stored_slices(slices) -> {key: {dimension: {member: value}}}`.

- [ ] **Step 1: Write the failing tests**

Create `services/brain/tests/test_scope.py`:

```python
"""Who may read which slice of the book, and the figures for each."""

import re

from django.conf import settings
from django.test import SimpleTestCase

from services.brain import scope
from services.brain.metrics import figures
from services.brain.tests.fixtures import BrainFixture
from services.customers.scoping import ScopeActor, SystemActor


class AvailableTests(BrainFixture):
    def test_each_reader_gets_their_scopes_narrowest_first_and_the_widest_by_default(self):
        cases = {
            self.csm: ["me"],
            self.mona: ["me", "team"],
            self.lee: ["me", "company"],
            self.admin: ["me", "company"],
            self.other: ["me"],
        }
        for reader, keys in cases.items():
            with self.subTest(reader=reader.name):
                self.assertEqual(scope.available(reader), keys)
                self.assertEqual(scope.default_key(reader), keys[-1])


class ResolveTests(BrainFixture):
    def test_me_and_team_carry_their_owners_and_a_stored_key(self):
        me = scope.resolve(self.csm, "me")
        self.assertEqual(
            (me.key, me.stored_key, me.label, me.owner_ids, me.user),
            ("me", f"me:{self.csm.id}", "Me", frozenset({self.csm.id}), self.csm),
        )
        team = scope.resolve(self.mona, "team")
        self.assertEqual(team.owner_ids, frozenset({self.mona.id, self.csm.id}))
        self.assertEqual((team.stored_key, team.label), (f"team:{self.mona.id}", "My team"))
        self.assertIsInstance(team.actor, ScopeActor)
        self.assertFalse(team.is_company)

    def test_company_is_the_organisation_itself(self):
        company = scope.resolve(self.lee, "company")
        self.assertEqual(
            (company.stored_key, company.owner_ids, company.label), ("company", None, "Company")
        )
        self.assertIs(type(company.actor), SystemActor)
        self.assertTrue(company.is_company)

    def test_a_scope_the_reader_cannot_use_is_refused(self):
        for reader, key in ((self.csm, "team"), (self.csm, "company"), (self.mona, "company")):
            with self.subTest(reader=reader.name, key=key):
                with self.assertRaises(scope.ScopeNotAllowed) as caught:
                    scope.resolve(reader, key)
                self.assertEqual(
                    (caught.exception.code, caught.exception.detail),
                    ("SCOPE_NOT_ALLOWED", "You can't see that view."),
                )
        with self.assertRaises(scope.ScopeUnknown) as caught:
            scope.resolve(self.admin, "everyone")
        self.assertEqual(
            (caught.exception.code, caught.exception.detail),
            ("SCOPE_UNKNOWN", "Choose me, team or company."),
        )


class FiguresTests(BrainFixture):
    def test_figures_are_recomputed_over_each_scopes_book(self):
        me = figures(scope.resolve(self.csm, "me"))
        team = figures(scope.resolve(self.mona, "team"))
        company = figures(scope.resolve(self.admin, "company"))
        self.assertEqual(me.values["active_arr"], 400_000.0)
        self.assertEqual(team.values["average_arr"], 150_000.0)
        self.assertEqual(company.values["active_arr"], 730_000.0)
        self.assertEqual(me.book, frozenset({self.pizza.id, self.dough.id}))
        self.assertIsNone(company.book)
        owners = {member for member, _label, _value in team.slices["at_risk_arr"]["owner"]}
        self.assertEqual(owners, {str(self.csm.id), str(self.mona.id)})

    def test_an_empty_book_counts_nothing_and_measures_nothing(self):
        empty = figures(scope.resolve(self.lee, "me"))
        self.assertEqual(empty.book, frozenset())
        self.assertEqual(empty.values["active_customers"], 0)
        self.assertIsNone(empty.values["nrr"])
        self.assertIsNone(empty.values["shelfware_arr"])


class OnlyTheResolverBuildsAScopeActorTests(SimpleTestCase):
    """§1.1: no view builds a ScopeActor itself."""

    def test_no_module_outside_the_resolver_and_the_tests_builds_one(self):
        root = settings.BASE_DIR / "services"
        allowed = root / "brain" / "scope.py"
        # Also catches `scoping.ScopeActor(`; only the class statement is exempt.
        pattern = re.compile(r"\bScopeActor\(")
        offenders = []
        for path in root.rglob("*.py"):
            if "tests" in path.parts or path == allowed:
                continue
            for number, line in enumerate(path.read_text().splitlines(), start=1):
                if pattern.search(line) and not line.lstrip().startswith("class "):
                    offenders.append(f"{path.relative_to(root)}:{number}")
        self.assertEqual(offenders, [])
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_scope --parallel --noinput`
Expected: ERROR, `ImportError: cannot import name 'scope' from 'services.brain'`.

- [ ] **Step 3: The app and its models**

Create `services/brain/apps.py`:

```python
from django.apps import AppConfig


class BrainConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "services.brain"
    verbose_name = "Brain"
```

Add `"services.brain",` to `INSTALLED_APPS` in `config/settings.py` after `"services.plans",`. Create the empty `services/brain/migrations/__init__.py`. Create `services/brain/models.py`:

```python
"""The Brain's own records: each scope's history, and the lock that writes
one brief at a time.

Company's history is `metrics.MetricSnapshot`, unchanged. A Me or My team
scope's figures are recomputed over its own book (services/brain/metrics.py),
so they cannot be read off the whole organisation's rows: they are kept
here, one row per scope per day — at each month-end, and as a baseline the
first time a scope is viewed or after its team changed.
"""

from django.conf import settings
from django.db import models

from services.accounts.models import Organisation


class ScopeSnapshot(models.Model):
    class Kind(models.TextChoices):
        MONTH_END = "month_end", "Month end"
        BASELINE = "baseline", "Baseline"

    organisation = models.ForeignKey(
        Organisation, related_name="scope_snapshots", on_delete=models.CASCADE
    )
    scope_key = models.CharField(max_length=32, help_text='"me:12" or "team:12".')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
        help_text="The person the scope belongs to.",
    )
    taken_on = models.DateField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    reason = models.CharField(
        max_length=16,
        blank=True,
        help_text='Why a baseline was written: "first_view" or "team_changed". Blank on a '
        "month-end.",
    )
    owner_ids = models.JSONField(default=list, help_text="The owners the scope covered.")
    customer_ids = models.JSONField(
        default=list, help_text="Every customer in the book then, archived and churned too."
    )
    values = models.JSONField(default=dict, help_text="{metric key: number | null}")
    slices = models.JSONField(
        default=dict, help_text="{metric key: {dimension: {member: number | null}}}"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "scope_key", "taken_on"],
                name="scopesnapshot_one_per_scope_day",
            )
        ]
        indexes = [
            models.Index(
                fields=["organisation", "scope_key", "-taken_on"], name="brain_scope_latest"
            )
        ]

    def __str__(self):
        return f"ScopeSnapshot {self.scope_key} @ {self.taken_on}"


class BriefLock(models.Model):
    """One row per organisation and key, locked `FOR UPDATE` while a brief or
    an explanation for that key is written, so two clicks make one model
    call. Holds nothing else."""

    organisation = models.ForeignKey(Organisation, related_name="+", on_delete=models.CASCADE)
    scope_key = models.CharField(
        max_length=96, help_text='A scope\'s stored key, or "explain:<metric>:<stored key>".'
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "scope_key"], name="brieflock_one_per_key"
            )
        ]

    def __str__(self):
        return f"BriefLock {self.scope_key}"
```

Run: `venv/bin/python manage.py makemigrations brain`
Expected: `services/brain/migrations/0001_initial.py` creating both models, the two constraints and the index.

- [ ] **Step 4: The resolver**

Create `services/brain/scope.py`:

```python
"""Me, My team and Company: which slice of the book a reader's Brain reads.

`resolve` is the only constructor of a Scope, and the only place a
`ScopeActor` is built (a test greps for it). Every Brain route resolves the
reader's `?scope=` here, so a scope the reader may not use is refused before
any figure is computed.
"""

from dataclasses import dataclass

from services.accounts.hierarchy import subtree_ids
from services.accounts.models import User
from services.customers.scoping import ScopeActor, SystemActor, sees_everything
from services.metrics.models import COMPANY_SCOPE

ME, TEAM, COMPANY = "me", "team", COMPANY_SCOPE
LABELS = {ME: "Me", TEAM: "My team", COMPANY: "Company"}


class ScopeUnknown(Exception):
    code = "SCOPE_UNKNOWN"
    detail = "Choose me, team or company."


class ScopeNotAllowed(Exception):
    code = "SCOPE_NOT_ALLOWED"
    detail = "You can't see that view."


@dataclass(frozen=True)
class Scope:
    key: str
    stored_key: str
    owner_ids: frozenset | None
    label: str
    actor: object
    #: The person the scope belongs to: the reader who resolved it.
    user: object

    @property
    def is_company(self):
        return self.key == COMPANY


def available(reader):
    """The scopes `reader` may use, narrowest first."""
    # SOC2:AUTH-02 My team needs reports; Company needs view_all_accounts or Leadership
    keys = [ME]
    if subtree_ids(reader):
        keys.append(TEAM)
    if sees_everything(reader) or reader.function == User.Function.LEADERSHIP:
        keys.append(COMPANY)
    return keys


def default_key(reader):
    """The widest scope the reader has."""
    return available(reader)[-1]


def resolve(reader, key):
    """The reader's scope for `key`, or ScopeUnknown / ScopeNotAllowed."""
    if key not in LABELS:
        raise ScopeUnknown(key)
    # SOC2:AUTH-02 a scope the reader may not use is refused before anything is read
    if key not in available(reader):
        raise ScopeNotAllowed(key)
    organisation = reader.organisation
    if key == COMPANY:
        return Scope(COMPANY, COMPANY, None, LABELS[COMPANY], SystemActor(organisation), reader)
    owners = frozenset({reader.id}) if key == ME else frozenset({reader.id, *subtree_ids(reader)})
    return Scope(
        key, f"{key}:{reader.id}", owners, LABELS[key], ScopeActor(organisation, owners), reader
    )
```

- [ ] **Step 5: Figures**

Create `services/brain/metrics.py`:

```python
"""A scope's figures: every metric and every cut, recomputed over the
scope's own book in one pass over the sources. Percent metrics cannot be
added up, so a team's NRR is the NRR of the team's customers, never a sum or
a mean of its members'."""

from dataclasses import dataclass

from services.customers.scoping import visible_customers
from services.metrics.registry import compute_figures
from services.metrics.signals import number


@dataclass(frozen=True)
class Figures:
    #: {metric key: number | None}
    values: dict
    #: {metric key: {dimension: [(member, label, number | None)]}}
    slices: dict
    #: Every customer id in the scope's book (archived and churned too);
    #: None for Company, which has no handovers.
    book: frozenset | None


def figures(scope):
    organisation = scope.actor.organisation
    values, slices = compute_figures(organisation, actor=scope.actor)
    book = None
    if not scope.is_company:
        book = frozenset(visible_customers(scope.actor).values_list("id", flat=True))
    return Figures(
        values={key: number(value) for key, value in values.items()},
        slices={
            key: {
                dimension: [(member, label, number(value)) for member, label, value in members]
                for dimension, members in cuts.items()
            }
            for key, cuts in slices.items()
        },
        book=book,
    )


def stored_slices(slices):
    """`Figures.slices` as a ScopeSnapshot keeps them: labels dropped, a
    member's id is what a later month finds it by."""
    return {
        key: {
            dimension: {member: value for member, _label, value in members}
            for dimension, members in cuts.items()
        }
        for key, cuts in slices.items()
    }
```

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.brain --parallel --noinput && venv/bin/python manage.py makemigrations --check --dry-run`
Expected: PASS; "No changes detected".

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check services config && venv/bin/ruff format services config
git add config/settings.py services/brain
git commit -m "feat(brain): scope resolver, scope snapshots and per-scope figures

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Scope history: baselines, team changes and month-ends

**Files:**
- Create: `services/brain/history.py`
- Modify: `services/customers/management/commands/run_health_maintenance.py` (after the metric month-end block, ~line 270; `import time` at the top)
- Test: `services/brain/tests/test_history.py`

**Interfaces:**
- Consumes: `resolve`, `ME`, `TEAM` (Task 4); `figures`, `stored_slices`, `Figures` (Task 4); `ScopeSnapshot` (Task 4).
- Produces: `history.FIRST_VIEW = "first_view"`, `TEAM_CHANGED = "team_changed"`; `latest(scope) -> ScopeSnapshot | None`; `comparison_point(scope, figs, today, *, request=None) -> ScopeSnapshot` (Me/My team only; writes and audits a baseline when needed); `team_changed_on(row) -> date | None`; `record_month_end(organisation, period_end, *, dry_run=False) -> tuple[int, int]` (`written`, `kept`).

- [ ] **Step 1: Write the failing tests**

Create `services/brain/tests/test_history.py`:

```python
"""A scope's comparison point: a baseline on first view, a fresh start when
the team changes, and a row per scope at each month-end."""

from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command

from core.models import AuditEvent
from services.accounts.models import User
from services.brain import history
from services.brain.metrics import figures
from services.brain.models import ScopeSnapshot
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.customers.management.commands.run_health_maintenance import (
    last_completed_month_end,
)
from services.customers.models import Customer
from services.segments.tests.fixtures import person


class FirstViewTests(BrainFixture):
    def test_the_first_view_writes_one_baseline_and_audits_it(self):
        team = resolve(self.mona, "team")
        figs = figures(team)
        row = history.comparison_point(team, figs, self.today)
        again = history.comparison_point(team, figs, self.today)

        self.assertEqual(row.pk, again.pk)
        self.assertEqual(
            (row.kind, row.reason, row.taken_on), ("baseline", "first_view", self.today)
        )
        self.assertEqual(row.owner_ids, sorted([self.mona.id, self.csm.id]))
        self.assertEqual(set(row.customer_ids), {self.pizza.id, self.dough.id, self.soup.id})
        self.assertEqual(row.values["active_arr"], 450_000.0)
        self.assertIn(str(self.csm.id), row.slices["at_risk_arr"]["owner"])
        self.assertIsNone(history.team_changed_on(row))
        event = AuditEvent.objects.get(action="brain.scope_baseline_recorded")
        self.assertEqual(event.metadata, {"scope": team.stored_key, "reason": "first_view"})
        self.assertEqual((event.actor, event.target_id), (self.mona, str(row.pk)))

    def test_two_first_views_at_once_write_one_row(self):
        team = resolve(self.mona, "team")
        figs = figures(team)
        history.comparison_point(team, figs, self.today)
        # The second request read "no row" before the first one wrote it.
        with patch("services.brain.history.latest", return_value=None):
            history.comparison_point(team, figs, self.today)
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=team.stored_key).count(), 1)
        self.assertEqual(
            AuditEvent.objects.filter(action="brain.scope_baseline_recorded").count(), 1
        )


class TeamChangedTests(BrainFixture):
    def test_a_changed_team_starts_again_from_today_and_keeps_its_history(self):
        team = resolve(self.mona, "team")
        ScopeSnapshot.objects.create(
            organisation=self.org,
            scope_key=team.stored_key,
            user=self.mona,
            taken_on=self.today - timedelta(days=20),
            kind="month_end",
            owner_ids=[self.mona.id],
        )
        row = history.comparison_point(team, figures(team), self.today)
        self.assertEqual(
            (row.taken_on, row.kind, row.reason), (self.today, "baseline", "team_changed")
        )
        self.assertEqual(history.team_changed_on(row), self.today)
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=team.stored_key).count(), 2)
        event = AuditEvent.objects.get(action="brain.scope_baseline_recorded")
        self.assertEqual(event.metadata["reason"], "team_changed")

    def test_a_change_on_the_baselines_own_day_replaces_it(self):
        first = history.comparison_point(
            resolve(self.mona, "team"), figures(resolve(self.mona, "team")), self.today
        )
        ed = person("ed@acme.io", "Ed CSM", self.org, reports_to=self.mona)
        mona = User.objects.get(pk=self.mona.pk)  # a fresh walk of the chart
        team = resolve(mona, "team")
        row = history.comparison_point(team, figures(team), self.today)
        self.assertEqual(row.pk, first.pk)
        self.assertEqual(row.reason, "team_changed")
        self.assertIn(ed.id, row.owner_ids)


class MonthEndTests(BrainFixture):
    period_end = date(2026, 9, 30)

    def keys(self):
        return set(ScopeSnapshot.objects.values_list("scope_key", flat=True))

    def test_me_for_every_owner_and_team_for_every_manager(self):
        written, kept = history.record_month_end(self.org, self.period_end)
        self.assertEqual((written, kept), (4, 0))
        self.assertEqual(
            self.keys(),
            {
                f"me:{self.csm.id}",
                f"me:{self.mona.id}",
                f"me:{self.other.id}",
                f"team:{self.mona.id}",
            },
        )
        for row in ScopeSnapshot.objects.all():
            self.assertEqual(
                (row.kind, row.reason, row.taken_on), ("month_end", "", self.period_end)
            )

    def test_a_recorded_month_is_kept_not_overwritten(self):
        history.record_month_end(self.org, self.period_end)
        Customer.objects.filter(pk=self.pizza.pk).update(arr_billed_at_account=Decimal(1))
        self.assertEqual(history.record_month_end(self.org, self.period_end), (0, 4))
        row = ScopeSnapshot.objects.get(scope_key=f"me:{self.csm.id}")
        self.assertEqual(row.values["active_arr"], 400_000.0)

    def test_deactivated_members_get_no_rows_and_dry_run_writes_nothing(self):
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        self.assertEqual(history.record_month_end(self.org, self.period_end, dry_run=True), (3, 0))
        self.assertEqual(self.keys(), set())
        history.record_month_end(self.org, self.period_end)
        self.assertNotIn(f"me:{self.other.id}", self.keys())


class NightlyJobTests(BrainFixture):
    def test_the_job_records_the_scopes_and_says_how_long_it_took(self):
        out = StringIO()
        call_command("run_health_maintenance", "--org-email", "alice@acme.io", stdout=out)
        self.assertTrue(
            ScopeSnapshot.objects.filter(
                scope_key=f"team:{self.mona.id}", taken_on=last_completed_month_end()
            ).exists()
        )
        self.assertRegex(
            out.getvalue(),
            r"recorded 4 scope snapshot\(s\) for \d{4}-\d{2}-\d{2} across 1 organisation\(s\); "
            r"0 already recorded \(\d+\.\ds\)\.",
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_history --parallel --noinput`
Expected: ERROR, `ImportError: cannot import name 'history'`.

- [ ] **Step 3: Implement `history.py`**

Create `services/brain/history.py`:

```python
"""Where a Me or My team scope's moves are measured from.

The latest ScopeSnapshot of the scope, if it covered the same owners. The
first time a scope is viewed there is none, so a baseline is written for
today; when the team has changed since (someone joined or left below the
reader), moves across the change would compare two different books, so a
new baseline starts them again. Month-end rows are written by the nightly
job and kept, never overwritten.
"""

import logging
import time

from django.db import transaction

from core import audit
from services.accounts.hierarchy import subtree_ids
from services.accounts.models import User
from services.customers.models import Account, Customer

from .metrics import figures, stored_slices
from .models import ScopeSnapshot
from .scope import ME, TEAM, resolve

logger = logging.getLogger(__name__)

FIRST_VIEW, TEAM_CHANGED = "first_view", "team_changed"


def latest(scope):
    return (
        ScopeSnapshot.objects.filter(
            organisation=scope.actor.organisation, scope_key=scope.stored_key
        )
        .order_by("-taken_on")
        .first()
    )


def _row_fields(scope, figs):
    return {
        "user": scope.user,
        "owner_ids": sorted(scope.owner_ids),
        "customer_ids": sorted(figs.book),
        "values": figs.values,
        "slices": stored_slices(figs.slices),
    }


def comparison_point(scope, figs, today, *, request=None):
    """The row this scope's moves are measured from, writing a baseline for
    `today` when there is none or the owners changed. Two first views at
    once write one row: the unique constraint decides, `get_or_create`
    returns the winner's."""
    row = latest(scope)
    if row is not None and set(row.owner_ids) == set(scope.owner_ids):
        return row
    reason = FIRST_VIEW if row is None else TEAM_CHANGED
    fields = {**_row_fields(scope, figs), "kind": ScopeSnapshot.Kind.BASELINE, "reason": reason}
    organisation = scope.actor.organisation
    with transaction.atomic():
        if row is not None and row.taken_on == today and row.kind == ScopeSnapshot.Kind.BASELINE:
            # Today's baseline is a starting line, not a record of a month:
            # a team change on the same day moves it.
            ScopeSnapshot.objects.filter(pk=row.pk).update(**fields)
            row.refresh_from_db()
            created = True
        else:
            row, created = ScopeSnapshot.objects.get_or_create(
                organisation=organisation,
                scope_key=scope.stored_key,
                taken_on=today,
                defaults=fields,
            )
    if created:
        # SOC2:LOG-01 ids and the reason only, never the figures
        audit.record(
            "brain.scope_baseline_recorded",
            request=request,
            actor=scope.user,
            organisation=organisation,
            target=row,
            metadata={"scope": scope.stored_key, "reason": reason},
        )
    return row


def team_changed_on(row):
    if row.kind == ScopeSnapshot.Kind.BASELINE and row.reason == TEAM_CHANGED:
        return row.taken_on
    return None


def _owners(organisation):
    """Everyone owning a customer of the organisation or an account under one."""
    links = Account.customers.through.objects.filter(customer__organisation=organisation)
    customers = Customer.objects.filter(organisation=organisation, owner__isnull=False)
    accounts = Account.objects.filter(id__in=links.values("account_id"), owner__isnull=False)
    return set(customers.values_list("owner_id", flat=True)) | set(
        accounts.values_list("owner_id", flat=True)
    )


def record_month_end(organisation, period_end, *, dry_run=False):
    """Me for every active member who owns a customer or an account, My team
    for every active member with reports, each recomputed over that book and
    dated `period_end`. A row already there is kept. Deactivated members get
    nothing new. Returns `(written, kept)`; logs counts and time, never
    figures."""
    started = time.monotonic()
    owners = _owners(organisation)
    have = set(
        ScopeSnapshot.objects.filter(organisation=organisation, taken_on=period_end).values_list(
            "scope_key", flat=True
        )
    )
    written = kept = 0
    for member in User.objects.filter(organisation=organisation, is_active=True).order_by("id"):
        keys = ([ME] if member.id in owners else []) + ([TEAM] if subtree_ids(member) else [])
        for key in keys:
            scope = resolve(member, key)
            if scope.stored_key in have:
                kept += 1
                continue
            written += 1
            if dry_run:
                continue
            ScopeSnapshot.objects.get_or_create(
                organisation=organisation,
                scope_key=scope.stored_key,
                taken_on=period_end,
                defaults={
                    **_row_fields(scope, figures(scope)),
                    "kind": ScopeSnapshot.Kind.MONTH_END,
                    "reason": "",
                },
            )
    logger.info(
        "brain month-end organisation=%s period_end=%s written=%s kept=%s seconds=%.2f",
        organisation.pk,
        period_end,
        written,
        kept,
        time.monotonic() - started,
    )
    return written, kept
```

- [ ] **Step 4: Call it from the nightly job**

In `run_health_maintenance.py`, add `import time` with the imports. Directly after the `self.stdout.write(... metric snapshot(s) ...)` call (before the "Questions that have waited too long" block), add:

```python
# The Brain's scopes, after the metric month-end: Me for every member
# who owns customers, My team for every manager, each recomputed over
# that book (services.brain.history). Kept, not overwritten, like the
# rows above; one organisation's failure never stops the job.
from services.brain.history import record_month_end

started = time.monotonic()
scope_rows, scopes_had = 0, 0
for organisation in organisations:
    try:
        rows, had = record_month_end(organisation, captured_on, dry_run=options["dry_run"])
    except Exception as exc:  # noqa: BLE001 - reported, never fatal
        # the class name only: an exception's text can quote a row's values
        self.stdout.write(
            self.style.WARNING(
                f"scope snapshots skipped for organisation {organisation.pk}: {type(exc).__name__}"
            )
        )
        continue
    scope_rows += rows
    scopes_had += had
self.stdout.write(
    self.style.SUCCESS(
        f"{verb} {scope_rows} scope snapshot(s) for {captured_on} across "
        f"{organisations.count()} organisation(s); {scopes_had} already recorded "
        f"({time.monotonic() - started:.1f}s)."
    )
)
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.brain services.customers.tests.test_health_maintenance --parallel --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
venv/bin/ruff check services && venv/bin/ruff format services
venv/bin/python manage.py makemigrations --check --dry-run
git add services/brain/history.py services/brain/tests/test_history.py services/customers/management/commands/run_health_maintenance.py
git commit -m "feat(brain): scope baselines, team changes and month-end scope snapshots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: What changed, `scopes/` and `changed/`

**Files:**
- Create: `services/brain/payloads.py` (`iso` only in this task; Task 7 adds the rest), `services/brain/changed.py`, `services/brain/views.py`, `services/brain/urls.py`
- Modify: `config/urls.py` (after the `api/v1/metrics/` include, ~line 211)
- Test: `services/brain/tests/test_changed.py`, `services/brain/tests/test_api_changed.py`

**Interfaces:**
- Consumes: `resolve`, `available`, `default_key`, `LABELS`, `ScopeUnknown`, `ScopeNotAllowed` (Task 4); `figures` (Task 4); `history.comparison_point`, `latest`, `team_changed_on` (Task 5); `signals_for(previous=…)`, `previous_from_snapshots`, `material` (Task 2).
- Produces: `payloads.iso(value) -> str | None`; `changed.Comparison(since, since_kind, team_changed_on, previous, previous_slices, handover)`; `changed.compare(scope, figs, today, *, record=True, request=None) -> Comparison`; `changed.moves(scope, figs, comparison) -> list[dict]` (signals in `signals_for`'s shape); `changed.build(scope, today, *, request=None) -> dict` (§4 `changed/` body).
- Produces: `views.BrainView` (base: `IsAuthenticated`, `scope(request) -> Scope`, scope refusals → 400/403), `views.REFUSALS`, `views.refusal(exc) -> Response`, `views.ScopesView`, `views.ChangedView`; URL names `brain-scopes`, `brain-changed`, `brain-brief`, `brain-explanation` (the last two wired in Tasks 7 and 8).

- [ ] **Step 1: Write the failing unit tests**

Create `services/brain/tests/test_changed.py`:

```python
"""The "What changed" payload for each scope."""

from datetime import date
from decimal import Decimal

from services.accounts.models import User
from services.brain import changed
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.customers.models import Customer
from services.metrics.models import MetricSnapshot
from services.metrics.registry import METRICS
from services.segments.tests.fixtures import person

METRIC_KEYS = {"key", "label", "unit", "better", "now", "then", "change", "material"}
SIGNAL_KEYS = {"key", "label", "unit", "better", "now", "then", "change", "improved", "drivers"}


def row(payload, key):
    return next(m for m in payload["metrics"] if m["key"] == key)


class CompanyTests(BrainFixture):
    def test_with_no_month_end_nothing_is_compared(self):
        payload = changed.build(resolve(self.admin, "company"), self.today)
        self.assertEqual(
            (payload["scope"], payload["since"], payload["since_kind"], payload["team_changed_on"]),
            ("company", None, "month_end", None),
        )
        self.assertEqual(
            (payload["empty"], payload["currency"], payload["signals"]), (False, "USD", [])
        )
        self.assertEqual(len(payload["metrics"]), len(METRICS))
        for metric in payload["metrics"]:
            self.assertEqual(set(metric), METRIC_KEYS)
            self.assertEqual(
                (metric["then"], metric["change"], metric["material"]), (None, None, False)
            )

    def test_moves_are_measured_from_the_latest_month_end(self):
        MetricSnapshot.objects.create(
            organisation=self.org,
            metric="active_arr",
            period_end=date(2026, 9, 30),
            value=Decimal("1000000"),
        )
        payload = changed.build(resolve(self.lee, "company"), self.today)
        arr = row(payload, "active_arr")
        self.assertEqual(
            (arr["then"], arr["now"], arr["change"], arr["material"]),
            (1_000_000.0, 730_000.0, -270_000.0, True),
        )
        self.assertEqual(payload["since"], "2026-09-30")
        [signal] = payload["signals"]
        self.assertEqual(set(signal), SIGNAL_KEYS)
        self.assertIs(signal["improved"], False)


class TeamTests(BrainFixture):
    def test_the_first_view_is_its_own_baseline(self):
        payload = changed.build(resolve(self.mona, "team"), self.today)
        self.assertEqual(
            (payload["since"], payload["since_kind"], payload["team_changed_on"]),
            (self.today.isoformat(), "baseline", None),
        )
        self.assertEqual(payload["signals"], [])
        arr = row(payload, "active_arr")
        self.assertEqual((arr["now"], arr["then"], arr["change"]), (450_000.0, 450_000.0, 0.0))

    def test_a_customer_handed_out_is_named_by_its_new_owner_on_money_moves(self):
        team = resolve(self.mona, "team")
        changed.build(team, self.today)
        Customer.objects.filter(pk=self.dough.pk).update(owner=self.other)

        payload = changed.build(team, self.today)
        by_key = {s["key"]: s for s in payload["signals"]}
        self.assertEqual(
            by_key["active_arr"]["handover"], {"in": 0, "out": 1, "people": ["Dana CSM"]}
        )
        self.assertIn("healthy_share", by_key)
        for signal in payload["signals"]:
            self.assertEqual("handover" in signal, signal["unit"] == "money")
        driver = by_key["at_risk_arr"]["drivers"][0]
        self.assertEqual(set(driver), {"dimension", "member", "label", "change"})
        self.assertNotIn("Dough Co", str(payload))

    def test_after_a_team_change_moves_start_again(self):
        team = resolve(self.mona, "team")
        changed.build(team, self.today)
        Customer.objects.filter(pk=self.soup.pk).update(owner=self.other)
        person("ed@acme.io", "Ed CSM", self.org, reports_to=self.mona)
        payload = changed.build(resolve(User.objects.get(pk=self.mona.pk), "team"), self.today)
        self.assertEqual(payload["team_changed_on"], self.today.isoformat())
        self.assertEqual(payload["signals"], [])


class EmptyTests(BrainFixture):
    def test_a_me_with_no_customers_is_flagged_empty(self):
        payload = changed.build(resolve(self.lee, "me"), self.today)
        self.assertTrue(payload["empty"])
        self.assertEqual(row(payload, "active_customers")["now"], 0)
```

- [ ] **Step 2: Write the failing API tests**

Create `services/brain/tests/test_api_changed.py`:

```python
"""`scopes/` and `changed/` over HTTP: §4's shapes and refusals."""

from rest_framework.test import APIClient

from services.brain.tests.fixtures import BrainFixture

SCOPES = "/api/v1/brain/scopes/"
CHANGED = "/api/v1/brain/changed/"


class ScopesApiTests(BrainFixture):
    def test_each_reader_gets_their_scopes_and_default(self):
        self.assertEqual(
            self.as_user(self.mona).get(SCOPES).json(),
            {
                "scopes": [{"key": "me", "label": "Me"}, {"key": "team", "label": "My team"}],
                "default": "team",
            },
        )
        self.assertEqual(
            self.as_user(self.lee).get(SCOPES).json(),
            {
                "scopes": [{"key": "me", "label": "Me"}, {"key": "company", "label": "Company"}],
                "default": "company",
            },
        )
        self.assertEqual(self.as_user(self.csm).get(SCOPES).json()["default"], "me")

    def test_anonymous_is_refused(self):
        self.assertEqual(APIClient().get(SCOPES).status_code, 401)


class ChangedApiTests(BrainFixture):
    def test_scope_refusals(self):
        client = self.as_user(self.csm)
        response = client.get(f"{CHANGED}?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(), {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}
        )
        response = client.get(f"{CHANGED}?scope=everyone")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(), {"code": "SCOPE_UNKNOWN", "detail": "Choose me, team or company."}
        )

    def test_no_scope_reads_the_default(self):
        self.assertEqual(self.as_user(self.mona).get(CHANGED).json()["scope"], "team")
        self.assertEqual(self.as_user(self.mona).get(f"{CHANGED}?scope=").json()["scope"], "team")

    def test_the_contract_shape(self):
        body = self.as_user(self.lee).get(f"{CHANGED}?scope=company").json()
        self.assertEqual(
            set(body),
            {
                "scope",
                "as_of",
                "since",
                "since_kind",
                "team_changed_on",
                "currency",
                "empty",
                "metrics",
                "signals",
            },
        )
        self.assertEqual(body["as_of"], self.today.isoformat())

    def test_another_tenant_reads_only_its_own_book(self):
        body = self.as_user(self.stranger).get(f"{CHANGED}?scope=me").json()
        arr = next(m for m in body["metrics"] if m["key"] == "active_arr")
        self.assertEqual(arr["now"], 999_000.0)
```

- [ ] **Step 3: Run them to see them fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_changed services.brain.tests.test_api_changed --parallel --noinput`
Expected: ERROR, `ImportError: cannot import name 'changed'`.

- [ ] **Step 4: Implement `payloads.iso` and `changed.py`**

Create `services/brain/payloads.py`:

```python
"""What the Brain's routes return, and the rules every read of stored model
prose follows."""


def iso(value):
    return value.isoformat() if value else None
```

Create `services/brain/changed.py`:

```python
"""What changed: a scope's figures now, against its comparison point.

Company compares with the whole organisation's latest month-end, as the
metric layer always has. Me and My team compare with their own latest
ScopeSnapshot (services/brain/history.py), and say when customers have been
handed in or out of the book since — by count and by the people they went
to, never by customer name.
"""

from dataclasses import dataclass
from datetime import date

from services.customers.models import Customer
from services.metrics.registry import METRICS, MONEY
from services.metrics.signals import material, previous_from_snapshots, signals_for

from . import history
from .metrics import figures
from .payloads import iso


@dataclass(frozen=True)
class Comparison:
    since: date | None
    since_kind: str
    team_changed_on: date | None
    #: {metric key: number | None}
    previous: dict
    #: {metric key: {dimension: {member: number | None}}}
    previous_slices: dict
    #: {"in", "out", "people"} when a customer moved; else None
    handover: dict | None


def _handover(scope, figs, row):
    was, now = set(row.customer_ids), set(figs.book)
    moved_in, moved_out = now - was, was - now
    if not moved_in and not moved_out:
        return None
    left = Customer.objects.filter(
        organisation=scope.actor.organisation, id__in=moved_out
    ).select_related("owner")
    people = sorted({c.owner.name if c.owner_id else "Unassigned" for c in left})
    return {"in": len(moved_in), "out": len(moved_out), "people": people}


def compare(scope, figs, today, *, record=True, request=None):
    """The scope's comparison point. `record=False` reads without writing a
    baseline (a GET of a stored brief only asks how old it is)."""
    if scope.is_company:
        baseline, previous, previous_slices = previous_from_snapshots(scope.actor.organisation)
        return Comparison(baseline, "month_end", None, previous, previous_slices, None)
    if record:
        row = history.comparison_point(scope, figs, today, request=request)
    else:
        row = history.latest(scope)
    if row is None:
        return Comparison(None, "baseline", None, {}, {}, None)
    return Comparison(
        since=row.taken_on,
        since_kind=row.kind,
        team_changed_on=history.team_changed_on(row),
        previous=row.values,
        previous_slices=row.slices,
        handover=_handover(scope, figs, row),
    )


def moves(scope, figs, comparison):
    """The material moves, in `signals_for`'s own shape — the same rule the
    metric layer runs, over the scope's book."""
    if comparison.since is None:
        return []
    return signals_for(
        scope.actor.organisation,
        figs.values,
        previous=comparison.previous,
        previous_slices=comparison.previous_slices,
        slices=figs.slices,
        baseline=comparison.since,
    )["signals"]


def _metric_row(metric, now, then):
    both = now is not None and then is not None
    return {
        "key": metric.key,
        "label": metric.label,
        "unit": metric.unit,
        "better": metric.better,
        "now": now,
        "then": then,
        "change": round(now - then, 4) if both else None,
        "material": material(metric, now, then),
    }


def _signal_row(signal, handover):
    row = {
        "key": signal["key"],
        "label": signal["label"],
        "unit": signal["unit"],
        "better": signal["better"],
        "now": signal["value"],
        "then": signal["previous"]["value"],
        "change": signal["change"],
        "improved": signal["improved"],
        "drivers": [
            {
                "dimension": d["dimension"],
                "member": d["member"],
                "label": d["label"],
                "change": d["change"],
            }
            for d in signal["drivers"]
        ],
    }
    if handover and signal["unit"] == MONEY:
        row["handover"] = handover
    return row


def build(scope, today, *, request=None):
    """The `changed/` body (§4)."""
    figs = figures(scope)
    comparison = compare(scope, figs, today, request=request)
    then = comparison.previous if comparison.since else {}
    return {
        "scope": scope.key,
        "as_of": today.isoformat(),
        "since": iso(comparison.since),
        "since_kind": comparison.since_kind,
        "team_changed_on": iso(comparison.team_changed_on),
        "currency": scope.actor.organisation.currency,
        "empty": figs.book is not None and not figs.book,
        "metrics": [
            _metric_row(metric, figs.values[metric.key], then.get(metric.key)) for metric in METRICS
        ],
        "signals": [_signal_row(s, comparison.handover) for s in moves(scope, figs, comparison)],
    }
```

- [ ] **Step 5: The views and routes**

Create `services/brain/views.py`:

```python
"""The Brain over the API, for every member.

`IsAuthenticated` only: the reader's scope (services/brain/scope.py), not a
capability, decides which figures come back, and `resolve` refuses a scope
the reader may not use before anything is computed. The whole-organisation
`/api/v1/metrics/` routes stay gated on view_all_accounts and unchanged.
"""

from django.utils import timezone
from rest_framework import status, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
)
from services.metrics.brief import NothingToBrief
from services.metrics.explain import NothingToExplain

from . import changed
from .scope import LABELS, ScopeNotAllowed, ScopeUnknown, available, default_key, resolve

#: The AI refusals, as today's BriefGenerateView and MetricExplainView map them.
REFUSALS = (
    (NothingToBrief, status.HTTP_422_UNPROCESSABLE_ENTITY),
    (NothingToExplain, status.HTTP_422_UNPROCESSABLE_ENTITY),
    (BudgetExceeded, status.HTTP_429_TOO_MANY_REQUESTS),
    (CopilotNotConfigured, status.HTTP_503_SERVICE_UNAVAILABLE),
    (CopilotRequestFailed, status.HTTP_502_BAD_GATEWAY),
    (ValueError, status.HTTP_502_BAD_GATEWAY),
)
REFUSED = tuple(kind for kind, _code in REFUSALS)


def refusal(exc):
    code = next(code for kind, code in REFUSALS if isinstance(exc, kind))
    return Response({"detail": str(exc)}, status=code)


class BrainView(views.APIView):
    permission_classes = [IsAuthenticated]

    def scope(self, request):
        # SOC2:AUTH-02 every Brain read resolves the reader's own scope
        key = request.query_params.get("scope") or default_key(request.user)
        return resolve(request.user, key)

    def handle_exception(self, exc):
        if isinstance(exc, ScopeUnknown):
            return Response(
                {"code": exc.code, "detail": exc.detail}, status=status.HTTP_400_BAD_REQUEST
            )
        if isinstance(exc, ScopeNotAllowed):
            return Response(
                {"code": exc.code, "detail": exc.detail}, status=status.HTTP_403_FORBIDDEN
            )
        return super().handle_exception(exc)


class ScopesView(BrainView):
    """GET /api/v1/brain/scopes/ — the reader's scopes, narrowest first."""

    def get(self, request):
        keys = available(request.user)
        return Response(
            {"scopes": [{"key": key, "label": LABELS[key]} for key in keys], "default": keys[-1]}
        )


class ChangedView(BrainView):
    """GET /api/v1/brain/changed/?scope= — the scope's figures against its
    comparison point. The first view of a Me or My team scope writes its
    baseline."""

    def get(self, request):
        scope = self.scope(request)
        return Response(changed.build(scope, timezone.localdate(), request=request))
```

Create `services/brain/urls.py`:

```python
from django.urls import path

from . import views

urlpatterns = [
    path("scopes/", views.ScopesView.as_view(), name="brain-scopes"),
    path("changed/", views.ChangedView.as_view(), name="brain-changed"),
]
```

In `config/urls.py`, after `path("api/v1/metrics/", include("services.metrics.urls")),`:

```python
# The Brain (services/brain): every member, scoped to Me, My team or
# Company. IsAuthenticated; the scope resolver decides what comes back.
(path("api/v1/brain/", include("services.brain.urls")),)
```

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.brain --parallel --noinput`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
venv/bin/ruff check services config && venv/bin/ruff format services config
venv/bin/python manage.py makemigrations --check --dry-run
git add config/urls.py services/brain
git commit -m "feat(brain): scopes and What changed endpoints

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Briefs per scope

**Files:**
- Modify: `services/brain/payloads.py`, `services/brain/views.py`, `services/brain/urls.py`
- Create: `services/brain/exposure.py`, `services/brain/briefs.py`
- Test: `services/brain/tests/test_briefs.py`

**Interfaces:**
- Consumes: `brief.evidence_from`, `generate_brief(..., evidence=, scope_key=, figures_digest=)`, `NothingToBrief` (Task 3); `signals.brief_digest` (Task 2); `figures` (Task 4); `changed.compare`, `moves`, `Comparison` (Task 6); `BriefLock` (Task 4); `views.BrainView`, `REFUSED`, `refusal` (Task 6).
- Produces: `payloads.READ_DEPTH = 20`, `first_readable(rows, reader, ids_of) -> row | None`, `is_stale(row, current_digest, since) -> bool`, `brief_payload(row, scope, *, stale) -> dict`.
- Produces: `exposure.exposure(scope, reader, *, limit) -> tuple[list[dict], int]` (forecast exposure rows the reader may open, at most `limit`, and the count of the rest); `exposure.customer_line(row) -> dict`.
- Produces: `briefs.CUSTOMER_LIMIT = 6`; `briefs.latest(scope, reader) -> Brief | None`; `briefs.read(scope, reader, today) -> dict | None`; `briefs.write(scope, request, *, requested_at, today) -> tuple[Brief, bool]`; `views.BriefView` (`GET`/`POST brief/`).

- [ ] **Step 1: Write the failing tests**

Create `services/brain/tests/test_briefs.py`:

```python
"""A brief per scope: kept, stale when the figures move, written once at a
time, refused as today."""

from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.db import connection
from django.test import RequestFactory
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from core.models import AuditEvent
from services.brain import briefs
from services.brain.models import ScopeSnapshot
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
)
from services.copilot.models import ModelCall
from services.customers.models import Customer
from services.metrics.models import Brief

PATH = "services.metrics.brief.get_completion"
URL = "/api/v1/brain/brief/"
ANSWER = (
    '{"headline": "Dough Co carries the team\'s risk.", "body": "One.\\n\\nTwo.", '
    '"watch": ["Dough Co renewal"]}'
)
BRIEF_KEYS = {
    "id",
    "scope",
    "as_of",
    "baseline",
    "headline",
    "body",
    "watch",
    "generated_at",
    "generated_by",
    "stale",
}


def provider(text):
    response = SimpleNamespace(
        content=[SimpleNamespace(type="text", text=text)],
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    )
    return SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: response))


class BriefReadTests(BrainFixture):
    def write(self, user, key):
        with patch(PATH, return_value=ANSWER):
            return self.as_user(user).post(f"{URL}?scope={key}")

    def test_none_yet_reads_null(self):
        self.assertEqual(self.as_user(self.mona).get(f"{URL}?scope=team").json(), {"brief": None})

    def test_a_kept_brief_is_fresh_until_the_numbers_move(self):
        response = self.write(self.mona, "team")
        self.assertEqual(response.status_code, 201)
        brief = response.json()["brief"]
        self.assertEqual(set(brief), BRIEF_KEYS)
        self.assertEqual(
            (brief["scope"], brief["generated_by"], brief["stale"], brief["baseline"]),
            ("team", "Mona Manager", False, self.today.isoformat()),
        )
        client = self.as_user(self.mona)
        self.assertFalse(client.get(f"{URL}?scope=team").json()["brief"]["stale"])
        Customer.objects.filter(pk=self.soup.pk).update(arr_billed_at_account=Decimal(60_000))
        self.assertTrue(client.get(f"{URL}?scope=team").json()["brief"]["stale"])

    def test_a_newer_month_end_makes_it_stale(self):
        self.write(self.mona, "team")
        team = resolve(self.mona, "team")
        ScopeSnapshot.objects.filter(scope_key=team.stored_key).update(
            taken_on=self.today - timedelta(days=40)
        )
        Brief.objects.update(baseline=self.today - timedelta(days=40))
        ScopeSnapshot.objects.create(
            organisation=self.org,
            scope_key=team.stored_key,
            taken_on=self.today - timedelta(days=5),
            kind="month_end",
            owner_ids=sorted(team.owner_ids),
        )
        self.assertTrue(self.as_user(self.mona).get(f"{URL}?scope=team").json()["brief"]["stale"])

    def test_a_scope_brief_is_its_owners_alone(self):
        self.write(self.mona, "team")
        self.assertIsNone(self.as_user(self.csm).get(f"{URL}?scope=me").json()["brief"])
        self.assertIsNone(self.as_user(self.lee).get(f"{URL}?scope=company").json()["brief"])


class BriefWriteTests(BrainFixture):
    def test_the_team_prompt_names_its_customers_and_the_company_prompt_does_not(self):
        with patch(PATH, return_value=ANSWER) as call:
            self.as_user(self.mona).post(f"{URL}?scope=team")
            self.as_user(self.admin).post(f"{URL}?scope=company")
        team_prompt = call.call_args_list[0].kwargs["messages"][0]["content"]
        company_prompt = call.call_args_list[1].kwargs["messages"][0]["content"]
        self.assertTrue(team_prompt.startswith("Scope: My team."))
        self.assertIn("- Dough Co (owner Carl CSM)", team_prompt)
        self.assertNotIn("Taco Bell", team_prompt)
        self.assertNotIn("Scope:", company_prompt)
        self.assertNotIn("Dough Co", company_prompt)
        self.assertEqual(
            [c.kwargs["scope_key"] for c in call.call_args_list],
            [f"team:{self.mona.id}", "company"],
        )

    def test_a_request_that_waited_gets_the_brief_written_meanwhile(self):
        team = resolve(self.mona, "team")
        request = RequestFactory().post(URL)
        request.user = self.mona
        requested_at = timezone.now()
        written = Brief.objects.create(
            organisation=self.org,
            scope_key=team.stored_key,
            as_of=self.today,
            headline="h",
            body="b",
            evidence={},
            generated_at=timezone.now(),
        )
        with patch(PATH) as call:
            row, created = briefs.write(team, request, requested_at=requested_at, today=self.today)
        self.assertEqual((row.pk, created), (written.pk, False))
        call.assert_not_called()

    def test_the_write_holds_the_scope_lock(self):
        with CaptureQueriesContext(connection) as queries, patch(PATH, return_value=ANSWER):
            self.as_user(self.mona).post(f"{URL}?scope=team")
        locked = [q["sql"] for q in queries if "FOR UPDATE" in q["sql"]]
        self.assertTrue(any("brain_brieflock" in sql for sql in locked))

    def test_refusals_keep_the_previous_brief(self):
        client = self.as_user(self.mona)
        with patch(PATH, return_value=ANSWER):
            client.post(f"{URL}?scope=team")
        cases = (
            (CopilotNotConfigured("No model provider is configured."), 503),
            (CopilotRequestFailed("rate limited"), 502),
            (BudgetExceeded("Monthly token budget spent."), 429),
        )
        for exc, code in cases:
            with self.subTest(code=code), patch(PATH, side_effect=exc):
                response = client.post(f"{URL}?scope=team")
                self.assertEqual(
                    (response.status_code, response.json()), (code, {"detail": str(exc)})
                )
        with patch(PATH, return_value="not json"):
            self.assertEqual(client.post(f"{URL}?scope=team").status_code, 502)
        self.assertEqual(Brief.objects.filter(scope_key=f"team:{self.mona.id}").count(), 1)

    def test_an_empty_book_has_nothing_to_brief(self):
        response = self.as_user(self.lee).post(f"{URL}?scope=me")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(
            response.json(), {"detail": "There are no customers to write a brief about yet."}
        )

    def test_the_model_call_is_logged_with_its_scope_even_when_the_answer_is_unusable(self):
        build = "services.copilot.anthropic_client._build_client_and_model"
        client = self.as_user(self.mona)
        with patch(build, return_value=(provider(ANSWER), "m")):
            self.assertEqual(client.post(f"{URL}?scope=team").status_code, 201)
        with patch(build, return_value=(provider("not json"), "m")):
            self.assertEqual(client.post(f"{URL}?scope=team").status_code, 502)
        self.assertEqual(
            list(ModelCall.objects.values_list("scope_key", flat=True)),
            [f"team:{self.mona.id}"] * 2,
        )

    def test_writing_is_audited_with_ids_only(self):
        with patch(PATH, return_value=ANSWER):
            self.as_user(self.mona).post(f"{URL}?scope=team")
            Customer.objects.filter(pk=self.soup.pk).update(arr_billed_at_account=Decimal(1))
            self.as_user(self.mona).post(f"{URL}?scope=team")
        events = AuditEvent.objects.filter(action="brain.brief_written").order_by("id")
        self.assertEqual(
            [e.metadata for e in events],
            [
                {"scope": f"team:{self.mona.id}", "stale_before": False},
                {"scope": f"team:{self.mona.id}", "stale_before": True},
            ],
        )
        self.assertEqual(events[0].target_type, "metrics.brief")
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_briefs --parallel --noinput`
Expected: FAIL/ERROR (404 on `/api/v1/brain/brief/`, `ImportError: cannot import name 'briefs'`).

- [ ] **Step 3: The shared read rules**

Append to `services/brain/payloads.py` (add the imports at its top):

```python
from services.customers.scoping import sees_everything, visible_customers

#: How many stored rows a read looks through for one the reader may see.
READ_DEPTH = 20


def first_readable(rows, reader, ids_of):
    """The first of `rows` (newest first) that names only customers
    `reader` may open. `ids_of(row)` is the customer ids the row's prompt
    named, or None for a row written before they were recorded — shown only
    to someone who sees every customer."""
    # SOC2:AUTH-02 model prose naming customers is as private as the customers it names
    named = [ids_of(row) for row in rows]
    wanted = {i for ids in named if ids for i in ids}
    openable = set()
    if wanted:
        openable = set(visible_customers(reader).filter(id__in=wanted).values_list("id", flat=True))
    everything = None
    for row, ids in zip(rows, named):
        if ids is None:
            if everything is None:
                everything = sees_everything(reader)
            if everything:
                return row
        elif set(ids) <= openable:
            return row
    return None


def is_stale(row, current_digest, since):
    """The figures moved since the row was written, or a newer comparison
    point exists than the one it was written against."""
    if row.figures_digest != current_digest:
        return True
    return since is not None and (row.baseline is None or since > row.baseline)


def brief_payload(row, scope, *, stale):
    return {
        "id": row.id,
        "scope": scope.key,
        "as_of": iso(row.as_of),
        "baseline": iso(row.baseline),
        "headline": row.headline,
        "body": row.body,
        "watch": row.watch,
        "generated_at": row.generated_at.isoformat(),
        "generated_by": row.generated_by.name if row.generated_by else None,
        "stale": stale,
    }
```

- [ ] **Step 4: Exposure**

Create `services/brain/exposure.py`:

```python
"""The customers carrying a scope's downside, as the reader may name them.

Ranked by the forecast's own rule (`forecast.exposure_list`) over the
scope's book, so the ranking matches the at-risk figure; then split by what
the **reader** may open (§1.6): those are named, the rest are only counted.
"""

from services.customers import forecast
from services.customers.scoping import visible_customers


def exposure(scope, reader, *, limit):
    organisation = scope.actor.organisation
    customers = list(forecast.filtered_customers(scope.actor, {}))
    rows = forecast.build_rows(
        customers, organisation, viewer=scope.actor, horizon=forecast.horizon_days({})
    )
    ranked = forecast.exposure_list(rows, limit=len(rows))
    ids = [row["id"] for row in ranked]
    # SOC2:AUTH-02 a customer reaches the prompt only if the reader may open it
    openable = set(visible_customers(reader).filter(id__in=ids).values_list("id", flat=True))
    readable = [row for row in ranked if row["id"] in openable]
    return readable[:limit], len(ranked) - len(readable)


def customer_line(row):
    """One exposure row as the brief's customer entry."""
    return {
        "id": row["id"],
        "name": row["name"],
        "owner": row["owner"],
        "arr": row["arr"],
        "downside": row["downside"],
        "days_to_renewal": row["days_to_renewal"],
        "health": row["health_category"],
    }
```

- [ ] **Step 5: Briefs**

Create `services/brain/briefs.py`:

```python
"""A brief per scope (§1.5): kept until the numbers move or a newer
comparison point lands, written on demand, once at a time.

Me and My team briefs may name the scope's customers: only their owner reads
them (`team:<id>` resolves for that person alone). The Company brief is
today's prompt — figures, cuts and member names — so one Company brief is
safe for every Company reader.
"""

from django.db import transaction

from core import audit
from services.copilot.anthropic_client import (
    BudgetExceeded,
    CopilotNotConfigured,
    CopilotRequestFailed,
)
from services.metrics import brief as metrics_brief
from services.metrics.models import Brief
from services.metrics.signals import brief_digest

from . import changed
from .exposure import customer_line, exposure
from .metrics import figures
from .models import BriefLock
from .payloads import READ_DEPTH, brief_payload, first_readable, is_stale

CUSTOMER_LIMIT = 6

#: Failures that still leave a ModelCall (and maybe a refund) to keep.
MODEL_FAILURES = (BudgetExceeded, CopilotNotConfigured, CopilotRequestFailed, ValueError)


def latest(scope, reader):
    rows = list(
        Brief.objects.filter(
            organisation=scope.actor.organisation, scope_key=scope.stored_key
        ).select_related("generated_by")[:READ_DEPTH]
    )
    # A brief that never named customers (every Company brief) is readable by
    # anyone who may use the scope.
    return first_readable(rows, reader, lambda row: row.evidence.get("customer_ids", []))


def read(scope, reader, today):
    row = latest(scope, reader)
    if row is None:
        return None
    figs = figures(scope)
    since = changed.compare(scope, figs, today, record=False).since
    return brief_payload(row, scope, stale=is_stale(row, brief_digest(figs.values), since))


def evidence(scope, reader, figs, comparison):
    customers = None
    if not scope.is_company:
        named, _hidden = exposure(scope, reader, limit=CUSTOMER_LIMIT)
        customers = [customer_line(row) for row in named]
    return metrics_brief.evidence_from(
        scope.actor.organisation,
        values=figs.values,
        slices=figs.slices,
        previous=comparison.previous if comparison.since else {},
        baseline=comparison.since,
        signals=changed.moves(scope, figs, comparison),
        scope_label=None if scope.is_company else scope.label,
        customers=customers,
    )


def write(scope, request, *, requested_at, today):
    """Write the scope's brief under its lock. Returns `(brief, created)`:
    a request that waited for another one's write gets that brief back
    (`created=False`) instead of paying for a second. NothingToBrief and the
    model failures propagate; the previous brief stays either way."""
    reader = request.user
    organisation = scope.actor.organisation
    lock, _ = BriefLock.objects.get_or_create(organisation=organisation, scope_key=scope.stored_key)
    failure = None
    with transaction.atomic():
        BriefLock.objects.select_for_update().get(pk=lock.pk)
        newest = Brief.objects.filter(organisation=organisation, scope_key=scope.stored_key).first()
        if newest is not None and newest.generated_at > requested_at:
            return newest, False
        figs = figures(scope)
        comparison = changed.compare(scope, figs, today, request=request)
        current = brief_digest(figs.values)
        stale_before = newest is not None and is_stale(newest, current, comparison.since)
        prompt_evidence = evidence(scope, reader, figs, comparison)
        try:
            row = metrics_brief.generate_brief(
                organisation,
                generated_by=reader,
                evidence=prompt_evidence,
                scope_key=scope.stored_key,
                figures_digest=current,
            )
        except MODEL_FAILURES as exc:
            # Caught inside so the transaction commits the ModelCall row and
            # any credit refund; raised again below.
            failure = exc
        else:
            # SOC2:LOG-01 ids and the scope key only, never figures or text
            audit.record(
                "brain.brief_written",
                request=request,
                target=row,
                metadata={"scope": scope.stored_key, "stale_before": stale_before},
            )
    if failure is not None:
        raise failure
    return row, True
```

- [ ] **Step 6: The route**

In `services/brain/views.py`, import `briefs` alongside `changed` and `brief_payload` from `.payloads`, then add:

```python
class BriefView(BrainView):
    """GET /api/v1/brain/brief/?scope= — the scope's kept brief, or null.
    POST — write one now (a paid model call): 201 with the new brief, 200
    with the one another request wrote while this one waited."""

    def get(self, request):
        scope = self.scope(request)
        return Response({"brief": briefs.read(scope, request.user, timezone.localdate())})

    def post(self, request):
        requested_at = timezone.now()
        scope = self.scope(request)
        try:
            row, created = briefs.write(
                scope, request, requested_at=requested_at, today=timezone.localdate()
            )
        except REFUSED as exc:
            return refusal(exc)
        return Response(
            {"brief": brief_payload(row, scope, stale=False)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
```

In `services/brain/urls.py` add `path("brief/", views.BriefView.as_view(), name="brain-brief"),`.

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.brain services.metrics --parallel --noinput`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
venv/bin/ruff check services && venv/bin/ruff format services
venv/bin/python manage.py makemigrations --check --dry-run
git add services/brain
git commit -m "feat(brain): briefs per scope, kept, stale-aware and written once at a time

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Explanations per scope

**Files:**
- Create: `services/brain/explanations.py`
- Modify: `services/brain/payloads.py`, `services/brain/views.py`, `services/brain/urls.py`
- Test: `services/brain/tests/test_explanations.py`

**Interfaces:**
- Consumes: `explain.evidence_from`, `account_line`, `explain(..., evidence=, scope_key=, figures_digest=)`, `EXPOSURE_LIMIT`, `NothingToExplain` (Task 3); `signals.explanation_digest` (Task 2); `exposure` (Task 7); `first_readable`, `is_stale`, `READ_DEPTH` (Task 7); `changed.compare` (Task 6); `BriefLock` (Task 4).
- Produces: `payloads.explanation_payload(row, scope, *, stale) -> dict`; `explanations.lock_key(scope, metric) -> str`; `explanations.latest(scope, reader, metric)`, `read(scope, reader, metric, today) -> dict | None`, `write(scope, request, metric, *, requested_at, today) -> tuple[Explanation, bool]`; `views.ExplanationView` (`GET`/`POST explanations/<metric>/`).

- [ ] **Step 1: Write the failing tests**

Create `services/brain/tests/test_explanations.py`:

```python
"""Why one number moved, per scope: built from the scope's figures, naming
only the customers the reader may open."""

from unittest.mock import patch

from django.test import RequestFactory
from django.utils import timezone

from core.models import AuditEvent
from services.brain import explanations
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.copilot.anthropic_client import BudgetExceeded
from services.metrics.models import Explanation

PATH = "services.metrics.explain.get_completion"
URL = "/api/v1/brain/explanations/at_risk_arr/"
ANSWER = '{"text": "ARR at risk sits on one renewal.", "evidence": ["one renewal"]}'
KEYS = {
    "id",
    "metric",
    "scope",
    "as_of",
    "text",
    "evidence",
    "hidden",
    "generated_at",
    "generated_by",
    "stale",
}


def prompt_of(call):
    return call.call_args.kwargs["messages"][0]["content"]


class ExplanationApiTests(BrainFixture):
    def test_the_scope_is_checked_before_the_metric(self):
        response = self.as_user(self.mona).get("/api/v1/brain/explanations/nope/?scope=team")
        self.assertEqual(
            (response.status_code, response.json()), (404, {"detail": "No such metric."})
        )
        response = self.as_user(self.csm).get("/api/v1/brain/explanations/nope/?scope=company")
        self.assertEqual(response.status_code, 403)

    def test_none_yet_reads_null(self):
        response = self.as_user(self.mona).get(f"{URL}?scope=team")
        self.assertEqual(response.json(), {"explanation": None})

    def test_written_from_the_scopes_figures_and_kept(self):
        client = self.as_user(self.mona)
        with patch(PATH, return_value=ANSWER) as call:
            response = client.post(f"{URL}?scope=team")
        self.assertEqual(response.status_code, 201)
        body = response.json()["explanation"]
        self.assertEqual(set(body), KEYS)
        self.assertEqual(
            (body["metric"], body["scope"], body["hidden"], body["generated_by"], body["stale"]),
            ("at_risk_arr", "team", 0, "Mona Manager", False),
        )
        self.assertIn("- Dough Co (owner Carl CSM)", prompt_of(call))
        self.assertNotIn("Taco Bell", prompt_of(call))
        self.assertEqual(call.call_args.kwargs["scope_key"], f"team:{self.mona.id}")
        self.assertEqual(client.get(f"{URL}?scope=team").json()["explanation"]["id"], body["id"])

    def test_a_company_reader_who_cannot_open_the_accounts_gets_a_count(self):
        with patch(PATH, return_value=ANSWER) as call:
            response = self.as_user(self.lee).post(f"{URL}?scope=company")
        self.assertEqual(response.json()["explanation"]["hidden"], 2)
        self.assertNotIn("Dough Co", prompt_of(call))
        self.assertNotIn("Taco Bell", prompt_of(call))
        self.assertIn("- 2 more that this reader cannot open; not named here", prompt_of(call))

    def test_an_explanation_naming_customers_reaches_only_readers_who_can_open_them(self):
        with patch(PATH, return_value=ANSWER):
            alices = self.as_user(self.admin).post(f"{URL}?scope=company").json()
        self.assertIsNone(self.as_user(self.lee).get(f"{URL}?scope=company").json()["explanation"])
        with patch(PATH, return_value=ANSWER):
            lees = self.as_user(self.lee).post(f"{URL}?scope=company").json()
        lee_reads = self.as_user(self.lee).get(f"{URL}?scope=company").json()["explanation"]
        alice_reads = self.as_user(self.admin).get(f"{URL}?scope=company").json()["explanation"]
        self.assertEqual(lee_reads["id"], lees["explanation"]["id"])
        self.assertEqual(alice_reads["id"], lees["explanation"]["id"])
        self.assertNotEqual(alices["explanation"]["id"], lees["explanation"]["id"])

    def test_refusals_and_the_audit(self):
        client = self.as_user(self.mona)
        with patch(PATH, side_effect=BudgetExceeded("Monthly token budget spent.")):
            response = client.post(f"{URL}?scope=team")
        self.assertEqual(
            (response.status_code, response.json()),
            (429, {"detail": "Monthly token budget spent."}),
        )
        response = self.as_user(self.lee).post(f"{URL}?scope=me")
        self.assertEqual(response.status_code, 422)
        with patch(PATH, return_value=ANSWER):
            client.post(f"{URL}?scope=team")
        event = AuditEvent.objects.get(action="brain.explanation_written")
        self.assertEqual(event.metadata, {"scope": f"team:{self.mona.id}", "metric": "at_risk_arr"})
        self.assertEqual(event.target_type, "metrics.explanation")

    def test_a_request_that_waited_gets_the_one_written_meanwhile(self):
        team = resolve(self.mona, "team")
        request = RequestFactory().post(URL)
        request.user = self.mona
        requested_at = timezone.now()
        written = Explanation.objects.create(
            organisation=self.org,
            metric="at_risk_arr",
            scope_key=team.stored_key,
            as_of=self.today,
            text="t",
            inputs={"customer_ids": []},
            generated_at=timezone.now(),
        )
        with patch(PATH) as call:
            row, created = explanations.write(
                team, request, "at_risk_arr", requested_at=requested_at, today=self.today
            )
        self.assertEqual((row.pk, created), (written.pk, False))
        call.assert_not_called()
```

- [ ] **Step 2: Run them to see them fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_explanations --parallel --noinput`
Expected: FAIL/ERROR (404 on the route, `ImportError: cannot import name 'explanations'`).

- [ ] **Step 3: Implement**

Append to `services/brain/payloads.py`:

```python
def explanation_payload(row, scope, *, stale):
    return {
        "id": row.id,
        "metric": row.metric,
        "scope": scope.key,
        "as_of": iso(row.as_of),
        "text": row.text,
        "evidence": row.evidence,
        "hidden": row.inputs.get("hidden", 0),
        "generated_at": row.generated_at.isoformat(),
        "generated_by": row.generated_by.name if row.generated_by else None,
        "stale": stale,
    }
```

Create `services/brain/explanations.py`:

```python
"""Why one number is where it is, per scope (§1.6).

Same prompt as the metric layer's, built from the scope's figures and cuts.
The accounts it names are those carrying the scope's downside that the
**reader** may open; the rest are a count. A stored explanation is shown
only to a reader who may open every customer it names.
"""

from django.db import transaction

from core import audit
from services.customers.scoping import live_customers
from services.metrics import explain as metrics_explain
from services.metrics.explain import EXPOSURE_LIMIT, NothingToExplain, account_line
from services.metrics.models import Explanation
from services.metrics.signals import explanation_digest

from . import changed
from .briefs import MODEL_FAILURES
from .exposure import exposure
from .metrics import figures
from .models import BriefLock
from .payloads import READ_DEPTH, explanation_payload, first_readable, is_stale


def lock_key(scope, metric):
    return f"explain:{metric}:{scope.stored_key}"


def latest(scope, reader, metric):
    rows = list(
        Explanation.objects.filter(
            organisation=scope.actor.organisation, scope_key=scope.stored_key, metric=metric
        ).select_related("generated_by")[:READ_DEPTH]
    )
    # None for a row written before the named ids were recorded.
    return first_readable(rows, reader, lambda row: row.inputs.get("customer_ids"))


def _digest(figs, metric):
    return explanation_digest(figs.values[metric], figs.slices.get(metric, {}))


def read(scope, reader, metric, today):
    row = latest(scope, reader, metric)
    if row is None:
        return None
    figs = figures(scope)
    since = changed.compare(scope, figs, today, record=False).since
    return explanation_payload(row, scope, stale=is_stale(row, _digest(figs, metric), since))


def evidence(scope, reader, metric, figs, comparison):
    if not live_customers(scope.actor).exists():
        raise NothingToExplain("There are no live customers here, so there is nothing to explain.")
    named, hidden = exposure(scope, reader, limit=EXPOSURE_LIMIT)
    compared = comparison.since is not None
    return metrics_explain.evidence_from(
        scope.actor.organisation,
        metric,
        value=figs.values[metric],
        previous_value=comparison.previous.get(metric) if compared else None,
        baseline=comparison.since,
        cuts=figs.slices.get(metric, {}),
        previous_cuts=comparison.previous_slices.get(metric, {}) if compared else {},
        accounts=[account_line(row) for row in named],
        hidden=hidden,
        customer_ids=[row["id"] for row in named],
    )


def write(scope, request, metric, *, requested_at, today):
    """As `briefs.write`, for one metric: `(explanation, created)`."""
    organisation = scope.actor.organisation
    lock, _ = BriefLock.objects.get_or_create(
        organisation=organisation, scope_key=lock_key(scope, metric)
    )
    failure = None
    with transaction.atomic():
        BriefLock.objects.select_for_update().get(pk=lock.pk)
        newest = Explanation.objects.filter(
            organisation=organisation, scope_key=scope.stored_key, metric=metric
        ).first()
        if newest is not None and newest.generated_at > requested_at:
            return newest, False
        figs = figures(scope)
        comparison = changed.compare(scope, figs, today, request=request)
        prompt_evidence = evidence(scope, request.user, metric, figs, comparison)
        try:
            row = metrics_explain.explain(
                organisation,
                metric,
                generated_by=request.user,
                evidence=prompt_evidence,
                scope_key=scope.stored_key,
                figures_digest=_digest(figs, metric),
            )
        except MODEL_FAILURES as exc:
            failure = exc
        else:
            # SOC2:LOG-01 ids, the scope key and the metric key only
            audit.record(
                "brain.explanation_written",
                request=request,
                target=row,
                metadata={"scope": scope.stored_key, "metric": metric},
            )
    if failure is not None:
        raise failure
    return row, True
```

In `services/brain/views.py`, import `explanations` with `briefs`/`changed`, `explanation_payload` with `brief_payload`, and `from services.metrics.registry import BY_KEY`; add:

```python
class ExplanationView(BrainView):
    """GET /api/v1/brain/explanations/<metric>/?scope= — the scope's kept
    explanation of one metric, or null. POST — write one now (a paid model
    call), 201 / 200 as for briefs. The scope is checked before the metric."""

    def unknown(self, metric):
        if metric not in BY_KEY:
            return Response({"detail": "No such metric."}, status=status.HTTP_404_NOT_FOUND)
        return None

    def get(self, request, metric):
        scope = self.scope(request)
        if missing := self.unknown(metric):
            return missing
        payload = explanations.read(scope, request.user, metric, timezone.localdate())
        return Response({"explanation": payload})

    def post(self, request, metric):
        requested_at = timezone.now()
        scope = self.scope(request)
        if missing := self.unknown(metric):
            return missing
        try:
            row, created = explanations.write(
                scope, request, metric, requested_at=requested_at, today=timezone.localdate()
            )
        except REFUSED as exc:
            return refusal(exc)
        return Response(
            {"explanation": explanation_payload(row, scope, stale=False)},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
```

In `services/brain/urls.py` add:

```python
(
    path(
        "explanations/<str:metric>/",
        views.ExplanationView.as_view(),
        name="brain-explanation",
    ),
)
```

- [ ] **Step 4: Run the tests**

Run: `venv/bin/python manage.py test services.brain services.metrics --parallel --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
venv/bin/ruff check services && venv/bin/ruff format services
venv/bin/python manage.py makemigrations --check --dry-run
git add services/brain
git commit -m "feat(brain): explanations per scope, naming only what the reader may open

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: End to end, and the docs

**Files:**
- Create: `e2e/test_brain_flow.py`
- Modify: `docs/API_CONTRACTS.md` (new section after the `metrics` brief-delivery section, ~line 4270), `docs/audit-events.md` (after the `brief.sent` row, line 72), `docs/data-classification.md` (after line 50), `docs/product/05-backend-schema.md` (§2 overview ~line 72, §7 ~line 233, §11 visibility ~line 435), `docs/product/01-prd.md` (§3.3 table ~line 73–88, §5.3 ~line 186, §9 release history ~line 317), `docs/product/02-trd.md` (§2.2 app list ~line 82, §2.4 table ~line 119, §4 AI ~line 189, §5 scheduled work ~line 217)

**Interfaces:**
- Consumes: every route of Tasks 6–8; `ScopeSnapshot`; `e2e.http.http_get`, `http_post`.

- [ ] **Step 1: Write the e2e test**

Create `e2e/test_brain_flow.py`:

```python
"""End-to-end tier: real server, real HTTP, real test DB.

A workspace with a manager (Mona) and her report (Carl), a CSM on another
branch (Dana) and a Leadership reader (Lee). Each reader is offered their
own scopes; Carl is refused My team. Mona's first view of My team writes
one baseline; a customer handed to Dana shows as a handover; a new report
resets the baseline. Lee's Company view has no month-end yet. Two clicks of
"Write my brief" at once make one model call: one 201, one 200."""

import threading
import time
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import LiveServerTestCase
from django.utils import timezone

from e2e.http import http_get, http_post
from services.accounts.models import User
from services.brain.models import ScopeSnapshot
from services.customers.models import Customer
from services.metrics.models import Brief

PATH = "services.metrics.brief.get_completion"
ANSWER = (
    '{"headline": "The team book is steady.", "body": "One.\\n\\nTwo.", '
    '"watch": ["Dough Co renewal"]}'
)


class BrainFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password):
        status, body = http_post(self.api("/auth/login/"), {"email": email, "password": password})
        self.assertEqual(status, 200, body)
        return body["access"]

    def member(self, admin, name, email):
        status, body = http_post(
            self.api("/auth/users/"),
            {"name": name, "email": email, "password": "memberpass12"},
            token=admin,
        )
        self.assertEqual(status, 201, body)
        return User.objects.get(pk=body["id"])

    def waiting_on_a_lock(self):
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE datname = current_database() AND wait_event_type = 'Lock'"
            )
            return cursor.fetchone()[0] > 0

    def test_full_flow(self):
        # 1. The workspace and its people; the chart and functions by hand.
        status, body = http_post(
            self.api("/auth/signup/"),
            {
                "organisation_name": "Acme Inc",
                "name": "Alice Admin",
                "email": "alice@acme.io",
                "password": "supersecret1",
            },
        )
        self.assertEqual(status, 201, body)
        alice = body["access"]
        mona = self.member(alice, "Mona Manager", "mona@acme.io")
        carl = self.member(alice, "Carl CSM", "carl@acme.io")
        dana = self.member(alice, "Dana CSM", "dana@acme.io")
        lee = self.member(alice, "Lee Lead", "lee@acme.io")
        User.objects.filter(pk=carl.pk).update(reports_to=mona)
        User.objects.filter(pk=lee.pk).update(function=User.Function.LEADERSHIP)
        org = mona.organisation
        for name, owner, arr in (
            ("Pizza Hut", carl, 300_000),
            ("Dough Co", carl, 100_000),
            ("Soup Co", mona, 50_000),
            ("Taco Bell", dana, 200_000),
        ):
            Customer.objects.create(
                organisation=org, name=name, owner=owner, arr_billed_at_account=Decimal(arr)
            )
        tokens = {
            who: self.login(f"{who}@acme.io", "memberpass12") for who in ("mona", "carl", "lee")
        }

        # 2. Each reader's scopes.
        expected = {
            "carl": (["me"], "me"),
            "mona": (["me", "team"], "team"),
            "lee": (["me", "company"], "company"),
        }
        for who, (keys, default) in expected.items():
            status, body = http_get(self.api("/brain/scopes/"), token=tokens[who])
            self.assertEqual(status, 200, body)
            self.assertEqual(([s["key"] for s in body["scopes"]], body["default"]), (keys, default))

        # 3. Refusals.
        status, body = http_get(self.api("/brain/changed/?scope=team"), token=tokens["carl"])
        self.assertEqual((status, body["code"]), (403, "SCOPE_NOT_ALLOWED"))
        status, body = http_get(self.api("/brain/changed/?scope=all"), token=tokens["carl"])
        self.assertEqual((status, body["code"]), (400, "SCOPE_UNKNOWN"))

        # 4. Mona's first view of My team is its own baseline, written once.
        today = timezone.localdate().isoformat()
        team_key = f"team:{mona.pk}"
        for _ in range(2):
            status, body = http_get(self.api("/brain/changed/?scope=team"), token=tokens["mona"])
            self.assertEqual(status, 200, body)
            self.assertEqual((body["since"], body["since_kind"]), (today, "baseline"))
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=team_key).count(), 1)
        arr = next(m for m in body["metrics"] if m["key"] == "active_arr")
        self.assertEqual(arr["now"], 450_000.0)

        # 5. Dough Co handed to Dana: a handover on the money moves.
        Customer.objects.filter(name="Dough Co").update(owner=dana)
        status, body = http_get(self.api("/brain/changed/?scope=team"), token=tokens["mona"])
        moved = next(s for s in body["signals"] if s["key"] == "active_arr")
        self.assertEqual(moved["handover"], {"in": 0, "out": 1, "people": ["Dana CSM"]})

        # 6. A new report: the baseline starts again, still one row today.
        ed = self.member(alice, "Ed CSM", "ed@acme.io")
        User.objects.filter(pk=ed.pk).update(reports_to=mona)
        status, body = http_get(self.api("/brain/changed/?scope=team"), token=tokens["mona"])
        self.assertEqual((body["team_changed_on"], body["signals"]), (today, []))
        self.assertEqual(ScopeSnapshot.objects.filter(scope_key=team_key).count(), 1)

        # 7. Lee's Company view: no month-end yet.
        status, body = http_get(self.api("/brain/changed/?scope=company"), token=tokens["lee"])
        self.assertEqual((status, body["since"], body["signals"]), (200, None, []))
        self.assertTrue(all(m["then"] is None for m in body["metrics"]))

        # 8. Two "Write my brief" clicks at once: one model call, 201 and 200.
        calls, release, tick = [], threading.Event(), threading.Event()

        def slow(*args, **kwargs):
            calls.append(kwargs.get("scope_key"))
            release.wait(timeout=10)
            return ANSWER

        results = []

        def click():
            results.append(
                http_post(self.api("/brain/brief/?scope=team"), None, token=tokens["mona"])
            )

        with patch(PATH, side_effect=slow):
            first = threading.Thread(target=click)
            first.start()
            deadline = time.monotonic() + 10
            while not calls and time.monotonic() < deadline:
                tick.wait(0.02)
            second = threading.Thread(target=click)
            second.start()
            while not self.waiting_on_a_lock() and time.monotonic() < deadline:
                tick.wait(0.02)
            release.set()
            first.join(15)
            second.join(15)
        self.assertEqual(sorted(status for status, _ in results), [200, 201])
        self.assertEqual(calls, [team_key])
        self.assertEqual(Brief.objects.filter(scope_key=team_key).count(), 1)
        self.assertEqual(results[0][1]["brief"]["id"], results[1][1]["brief"]["id"])

        # 9. The kept brief reads fresh for Mona; Lee has no Company brief.
        status, body = http_get(self.api("/brain/brief/?scope=team"), token=tokens["mona"])
        self.assertEqual(
            (body["brief"]["scope"], body["brief"]["stale"], body["brief"]["generated_by"]),
            ("team", False, "Mona Manager"),
        )
        status, body = http_get(self.api("/brain/brief/?scope=company"), token=tokens["lee"])
        self.assertEqual((status, body), (200, {"brief": None}))
```

Run: `venv/bin/python manage.py test e2e.test_brain_flow --noinput`
Expected: PASS. (If `/auth/users/` rejects the password or answers another shape, mirror `e2e/test_plans_flow.py`'s `created()` call exactly; it is the reference.)

- [ ] **Step 2: API_CONTRACTS**

Add to `docs/API_CONTRACTS.md`, after the `metrics` brief-delivery section, a section `## \`brain\` — Scopes and What changed (\`/brain\`)` containing, in the file's existing style:

- **Model**: `ScopeSnapshot` (fields, unique per organisation/scope key/day, `kind` `month_end`|`baseline`, `reason`), `BriefLock`; `Brief.scope_key`/`figures_digest`, `Explanation.scope_key`/`figures_digest`, `ModelCall.scope_key`.
- **Conventions**: every route `IsAuthenticated`; `?scope=me|team|company` (missing or empty → the reader's default); 400 `SCOPE_UNKNOWN` and 403 `SCOPE_NOT_ALLOWED` bodies verbatim; Me / My team / Company rules (§1.1); a Me or My team scope's first `changed/` (or POST) writes a baseline; a team change starts a new one; stored prose is shown only to readers who may open every customer it names; `/api/v1/metrics/` reads Company rows only.
- One `###` per route — `GET /api/v1/brain/scopes/`, `GET /api/v1/brain/changed/`, `GET/POST /api/v1/brain/brief/`, `GET/POST /api/v1/brain/explanations/<metric>/` — each with §4's JSON verbatim, but with the real metric keys (`active_arr`, `at_risk_arr`; contract note 1), the 201/200 rule, and the refusal table (422 `NothingToBrief`/`NothingToExplain`, 429 `BudgetExceeded`, 503 `CopilotNotConfigured`, 502 `CopilotRequestFailed` or unusable answer, 404 `{"detail": "No such metric."}`).
- In the `Status` table near the top, a row for `brain` marked built (2026-10-05).

- [ ] **Step 3: audit-events, data classification, schema**

`docs/audit-events.md`, after the `brief.sent` row:

```
| `brain.brief_written` | `services.brain.briefs.write` | user | Brief | `scope` (stored key, e.g. `team:12`), `stale_before`; never figures or text |
| `brain.explanation_written` | `services.brain.explanations.write` | user | Explanation | `scope`, `metric` |
| `brain.scope_baseline_recorded` | `services.brain.history.comparison_point` | the scope's person | ScopeSnapshot | `scope`, `reason` (`first_view` or `team_changed`) |
```

`docs/data-classification.md`: after the `metrics.Brief, metrics.Explanation` row add

```
| `brain.ScopeSnapshot` | internal | user | aggregate figures and cuts of one person's or team's book, with owner and customer **ids** only; no names, no record text |
| `brain.BriefLock` | internal | — | a lock row; holds nothing |
```

and extend the `metrics.Brief, metrics.Explanation` notes: "`scope_key` says whose figures; a Me or My team brief may name that book's customers and is read only by its owner; a Company explanation is shown only to readers who may open every customer it names". Extend the `copilot.ModelCall` notes with "`scope_key` for Brain briefs and explanations".

`docs/product/05-backend-schema.md`: add `brain` to the §2 entity overview (`ScopeSnapshot, BriefLock`); in §7 add "`scope_key` and `figures_digest`" to the `Brief` and `Explanation` rows; add a `## 7a. \`brain\`` table with `ScopeSnapshot` (one row per organisation, scope key and day: month-end or baseline; owners, book, values, cuts) and `BriefLock`; in §11 add a paragraph: "Brain scopes. `ScopeActor(organisation, owner_ids)` (customers/scoping.py) narrows `visible_customers`/`visible_accounts` to one owner set's book: customers they own, accounts they own or under those customers; built only by `brain.scope.resolve`."

- [ ] **Step 4: PRD and TRD**

`docs/product/01-prd.md`: in §3.3, change the `view_all_accounts` row's "the entire Knowledge Brain section" to "Company scope in the Brain (with Leadership)"; in §3.5 add to the CSM persona "their own Brain (Me)" and to the CS lead "My team in the Brain"; in §5.3 add a row `| Brain scopes and What changed (Me / My team / Company) | Built | Every member; figures recomputed over the scope's own book; briefs and explanations kept per scope |`; in §9 add `| 2026-10-05 | Brain delivery 1: scopes and What changed (backend) |`.

`docs/product/02-trd.md`: add `brain` to the §2.2 app list; in §2.4 add `| \`services/brain/scope.py\` | Me / My team / Company resolver; the only builder of a \`ScopeActor\` |` and `| \`services/brain/changed.py\` | What changed: a scope's figures against its comparison point |`; in §4 add a sentence: "Briefs and explanations are written per Brain scope; `ModelCall.scope_key` records the scope, and a lock row (`BriefLock`) makes two clicks one call."; in §5's `run_health_maintenance` row append "record month-end scope snapshots (Me for every owner, My team for every manager)".

- [ ] **Step 5: Verify everything**

Run, in order:

```bash
venv/bin/ruff format docs/API_CONTRACTS.md docs/product/05-backend-schema.md docs/superpowers/plans/2026-10-05-brain-what-changed-backend.md
venv/bin/ruff check . && venv/bin/ruff format --check .
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python scripts/ci_shard_labels.py --check 4
venv/bin/python manage.py test --parallel --noinput
```

Expected: no lint or format findings; "No changes detected"; the shard check passes; the whole suite passes.

- [ ] **Step 6: Commit**

```bash
git add e2e/test_brain_flow.py docs
git commit -m "test(e2e): Brain scopes, baselines, handovers and one brief per double click

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(If the docs are large enough to review apart, commit them separately as `docs(brain): contracts, audit events, schema, PRD and TRD for scopes` with the same trailer.)

---

## Self-review

**Spec coverage.**
- §1.1 scopes, keys, rules, default, refusals, `Scope` fields, `ScopeActor`, Company actor, the grep test: Tasks 1 and 4.
- §1.2 `actor` on the three `compute_*`, `figures` in one pass, unmeasured reads `None`, raising sources still raise: Tasks 1 and 4 (Decision 3).
- §1.3 `ScopeSnapshot` (plus `reason`, Decision 5), month-end from the nightly job with counts and time, kept-not-overwritten, first-view baseline under the unique constraint, team change, deactivated members: Tasks 4 and 5.
- §1.4 comparison points, `signals_for(previous=…)`, handovers on money metrics, no customer names: Tasks 2 and 6.
- §1.5 `Brief.scope_key`/`figures_digest`, staleness, Me/My team prompts naming customers, Company prompt unchanged, `scope_key` on `ModelCall`, refusals, `BriefLock` with 200-on-wait, previous brief kept: Tasks 3 and 7.
- §1.6 `Explanation` fields, exposure as the reader with `hidden`, purpose `explain`, staleness: Tasks 3 and 8.
- §1.7/§4 five routes, `IsAuthenticated`, shapes; `/metrics/` unchanged and Company-only: Tasks 3, 6, 7, 8 (contract notes 1–12).
- §1.8 three audit events with ids only, month-end logs, every named doc: Tasks 5, 7, 8, 9.
- User-requested e2e (manager, report, Leadership reader across me/team/company; baseline on first view; team change reset; concurrent brief write once): Task 9.

**Placeholder scan.** No TBD/TODO; every code step carries the code. Docs steps name the exact rows and paragraphs to add.

**Type consistency.** `resolve(reader, key) -> Scope(key, stored_key, owner_ids, label, actor, user)` is used the same way in Tasks 4–9. `Figures(values, slices, book)` from Task 4 feeds `history`, `changed`, `briefs`, `explanations`. `Comparison(since, since_kind, team_changed_on, previous, previous_slices, handover)` is defined in Task 6 and read in Tasks 7–8. `signals_for(..., previous=, previous_slices=, slices=, baseline=)` (Task 2) is called only by `changed.moves`. `brief.evidence_from(..., values, slices, previous, baseline, signals, scope_label, customers)` and `explain.evidence_from(..., value, previous_value, baseline, cuts, previous_cuts, accounts, hidden, customer_ids)` (Task 3) match their callers in Tasks 7–8. `first_readable(rows, reader, ids_of)`, `is_stale(row, current_digest, since)` and `READ_DEPTH` (Task 7) are reused in Task 8. Audit metadata keys (`scope`, `stale_before`, `metric`, `reason`) match the docs rows in Task 9.
