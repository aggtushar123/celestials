# Brain delivery 3: What's being done (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One payload per Brain scope that answers "what is being done about the numbers in my scope, and is it moving them?": the scope's initiatives with progress and work, its plans with health and ARR then → now, and the rules at work on its people's books. Any member can also start and edit an initiative on their own book.

**Architecture:** `Plan.start_figures` (new nullable JSON column) is written once in `plans.starting.start_plan` from `services/plans/figures.record_figures`, the same reader that gives "now". `services/brain/doing.py` builds the three sections. Each section filters to the scope's book with `id IN (subquery)` and names only what the reader may open. Plans the reader can't open are counted in `hidden`. `services/brain/initiatives.py` holds the rules for who may edit (`edited_as`), which metrics can be tracked for one person (`OWNER_METRICS`), and the create/edit paths, which go through `metrics.initiatives.create_initiative` so the baseline is captured the usual way. Three `BrainView` routes serve them: `GET doing/`, `POST initiatives/` and `PATCH initiatives/<id>/`.

**Tech Stack:** Django 5.2, DRF, PostgreSQL 16 (CI/prod), Django test runner with `--parallel`.

**Spec:** `/Users/tusharaggarwal/Desktop/Projects/Revenact/react-ts-app/docs/superpowers/specs/2026-10-05-brain-doing-design.md`. This plan covers §0, Decisions, §1 and §3. §3 is the API contract shared with the frontend plan. Scope rules come from `react-ts-app/docs/superpowers/specs/2026-10-05-brain-what-changed-design.md` (delivery 1) and `2026-10-05-brain-waiting-design.md` (delivery 2).

## Global Constraints

- Postgres 16: use `id__in` subqueries, never joins + `.distinct()`. A test checks every query `doing.build` runs for `DISTINCT`.
- Tests: `venv/bin/python manage.py test <labels> --parallel --noinput`.
- `venv/bin/ruff check .` and `venv/bin/ruff format --check .` (ruff also formats Markdown code blocks).
- `venv/bin/python manage.py makemigrations --check --dry-run` (after Task 1 it must report no changes).
- `venv/bin/python scripts/ci_shard_labels.py --check 4`.
- Never run two Django test runs at once.
- Every commit ends with exactly:
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- SOC2 markers: `# SOC2:AUTH-02` on every who-may-read and who-may-edit rule, `# SOC2:LOG-01` on every audit write.
- Twice-filter: name only records the reader can open, and count the rest in `hidden`. Pass the plain reader to visibility helpers (`visible_customers`, `visible_accounts`, `visible_plans`, `visible_tasks`, `readable_rules`, `rules.records.visible_q`), never `scope.actor`. `scope.actor` is only for computing figures, and this delivery computes none per scope.
- Query count stays constant as items grow: one test runs `doing.build` with 1 and with 6 of every kind and asserts the same number of queries.
- The migration for `Plan.start_figures` must be safe on existing data: add it nullable with no default, so old plans read `null`.
- Stay on branch `feat/brain-doing`; never push.

## Decisions (where the spec is silent)

1. **Whose book a new initiative tracks.** In Me, the person is always the reader, and `for_user` is ignored. In My team, `for_user` defaults to the reader. Otherwise it must be someone in `subtree_ids(reader)`, active and in the reader's organisation; anything else is 400 `{"for_user": ["Choose yourself or someone below you."]}`. The initiative is `owner=<that person>`, `dimension="owner"`, `member=str(<their id>)`, `member_label=<their name>`, `created_by=<reader>`.
2. **A person's book is always a valid owner cut.** The brain route does not require the member to appear in today's slice, unlike `/metrics/initiatives/`. A person with no customers yet still gets their initiative; its baseline is `null` (`progress()` already handles that).
3. **Initiative figures stay organisation-wide.** `baseline`/`current` come from `metrics.initiatives.Figures(organisation)`: the registry's owner cut computed as the whole organisation (`SystemActor`), exactly as `/metrics/initiatives/` reads them. Baseline and current then always come from the same rule. Nothing is computed with `scope.actor`.
4. **Which initiatives show.** Open ones (`planned`, `active`), plus those closed (`done`, `abandoned`) in the last 30 days by `closed_at`. Order: active, then planned, then closed; within each, soonest `target_by` first, then id. At most 100.
5. **Which plans show.** Open ones (`not_started`, `on_track`, `at_risk`), plus those finished in the last 30 days: `done` by `done_at`, `cancelled` by `updated_at` (there is no `cancelled_at` column). Order: at_risk, on_track, not_started (each soonest `target_date` first), then closed (most recent first), then id. At most 100.
6. **The plans book.** For Me and My team, the book is plans on customers owned by the desk, and on accounts owned by the desk or linked to a desk customer. That is the `ScopeActor` book, written out in `doing.plans_in` rather than read through `scope.actor`. For Company it is every plan in the organisation. `readable` is that set filtered by `visible_plans(reader)`. `hidden = book − readable`, over the same window.
7. **`then.arr` is null when the currency moved.** If the stored `start_figures.currency` is no longer the workspace's currency, `then.arr` is `null` rather than a figure in the wrong money.
8. **`taken_on`** is the day the plan was started (`timezone.localdate()` in `start_plan`), not the plan's `start_date`.
9. **Who may edit.** `edited_as(reader, initiative)` returns `"me"` (the reader owns it), `"team"` (the owner is below the reader) or `"company"` (`view_all_accounts`), checked in that order, and otherwise `None`. An initiative with no owner can be edited only through `view_all_accounts`. A cut to someone does not make them an editor. `can_edit` on every row and the PATCH route both ask this one rule. The audit `scope` of an edit is its `edited_as`.
10. **What a brain PATCH may change:** `title`, `hypothesis`, `target_value`, `target_by`, `status`, `outcome`. Sending `metric`, `dimension`, `member`, `owner_id` or `for_user` is 400 with `["This can't be changed here."]` on each. Changing the metric would leave a baseline from a different number. `/metrics/initiatives/` keeps its own rules. `target_by` in the past is refused only on create, as today. Closing stamps `closed_at` and reopening clears it, through one shared `metrics.initiatives.closed_at_after`.
11. **Rules at work.** Every rule owned by someone on the desk is listed, private ones included (spec decision 5: name, segment and status are shown). For a rule that isn't the reader's, `last_run.fired` is the number fired among records the reader may open now. That is `runs_page`'s `seen_fired`, through the same `tallies` query, never the raw total. Order: active first, then by name, then id. At most 100.
12. **Knowledge by function needs nothing new from the backend.** `GET /api/v1/knowledge/activity/` stays `view_all_accounts`, so the frontend shows the panel in Company only for readers who hold it. A Leadership reader without it would get a 403 there.
13. **`hidden` counts plans only**, as the spec says. An initiative's tasks the reader can't read are left out of `work.tasks`. `work.open`/`done` are the full counts, so the difference is visible without naming anything.

## Contract notes (real code that forces a §3 / §1 detail)

1. **Metric key.** The registry key is `at_risk_arr` (label "ARR at risk"). §3's `arr_at_risk` is illustrative. The owner-cut metrics are `forecast_arr`, `nrr`, `at_risk_arr`, `healthy_share` and `poor_health_count`.
2. **Health scale.** `health_score` on customers and accounts is the stored 0.0–10.0 score, so `then`/`now` carry e.g. `4.8`, not `48`. ARR is in the workspace currency (`currency` at the top). For a customer it is the column the workspace's global-attribute mapping names, converted through the FX table (`null` with no rate). For an account it is `Account.arr`.
3. **Additive fields, nothing in §3 removed or renamed:**
   - `trackable`: `[{key, label, unit, better}]`, the owner-cut metrics. The New initiative form needs this list outside Company, and members can't read `/metrics/`.
   - `initiatives[].hypothesis` and `initiatives[].outcome` (the row expands to the hypothesis; editing and closing need both). `initiatives[].work.tasks[]` uses the existing `/metrics/initiatives/` `work.tasks` row shape and lists only tasks the reader may read on records they may open.
   - `rules[].readable` tells the frontend whether to link the name, and `rules[].paused_message` is the human reason, as the rules list already serves it. `segment` is the segment's name, or `null` once the segment is deleted. `paused_reason` is `null` when the rule is not paused.
4. **`initiative.created` / `initiative.updated` did not exist.** `core/audit` has no initiative events today. This delivery adds them on the brain routes (`scope` `me`/`team`, or for an edit the `edited_as` value) and on `/metrics/initiatives/` create and PATCH (`scope: "company"`), with `target_repr` `"Initiative <id>"`, never the title.
5. **POST in Company:** 403 `{"code": "SCOPE_NOT_ALLOWED", "detail": "Company initiatives are started from the Company initiatives page."}`. A scope the reader may not use (e.g. My team without reports) is the usual `{"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}`.
6. **Non-owner `fired`.** For someone else's rule, `last_run.fired` is the count among records the reader may open now (Decision 11), which can be lower than the rule's own total.

## File Structure

| File | Responsibility |
| --- | --- |
| `services/plans/models.py` (modify) | `Plan.start_figures` JSONField, null |
| `services/plans/migrations/0003_plan_start_figures.py` (create) | AddField, nullable, no default |
| `services/plans/figures.py` (create) | `record_figures(record, organisation, rates=None)`, `start_figures(record, organisation, today)` |
| `services/plans/starting.py` (modify) | writes `start_figures` when a plan is created |
| `services/metrics/initiatives.py` (modify) | `CLOSED`, `closed_at_after()` shared by both edit paths |
| `services/metrics/serializers.py` (modify) | `update` uses `closed_at_after` |
| `services/metrics/views.py` (modify) | `initiative.created` / `initiative.updated` audit on the Company routes |
| `services/rules/payloads.py` (modify) | `_tallies` renamed `tallies` (now shared) |
| `services/brain/initiatives.py` (create) | `OWNER_METRICS`, `trackable()`, `edited_as()`, the create/edit forms, `start()`, `edit()` |
| `services/brain/doing.py` (create) | the three sections and `build()` |
| `services/brain/views.py`, `urls.py` (modify) | `DoingView`, `InitiativeCreateView`, `InitiativeDetailView` |
| `services/brain/tests/doing_fixtures.py` (create) | `DoingFixture`: initiative/plan/rule/night makers over `BrainFixture` |
| `services/brain/tests/test_doing.py` (create) | the sections, `build`, query count, no DISTINCT |
| `services/brain/tests/test_api_doing.py` (create) | `GET doing/`, `POST`/`PATCH initiatives/` over HTTP |
| `services/brain/tests/test_doing_e2e.py` (create) | the four journeys |
| `services/plans/tests/test_start_figures.py` (create) | figures kept at start |
| `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md` (modify) | docs |

The fixture world is `services/brain/tests/fixtures.py` `BrainFixture`. Alice (admin, `view_all_accounts`); Lee (Leadership function, no `view_all_accounts`); Mona manages Carl; Dana manages nobody; Gus is another tenant. Customers: Pizza Hut (Carl, 300k, health 8.0), Dough Co (Carl, 100k, 2.0, renews in 30 days), Soup Co (Mona, 50k), Taco Bell (Dana, 200k, 2.0), Loose Ltd (nobody, 80k). Accounts: Pizza EMEA (Carl, under Pizza Hut), Taco East (Carl, under Taco Bell), Taco West (Dana, under Taco Bell).

---

### Task 1: Plans keep their starting figures

**Files:**
- Create: `services/plans/figures.py`
- Create: `services/plans/migrations/0003_plan_start_figures.py` (generated)
- Modify: `services/plans/models.py` (`Plan`, after `done_at`)
- Modify: `services/plans/starting.py` (`start_plan`)
- Test: `services/plans/tests/test_start_figures.py`

**Interfaces:**
- Consumes: `services.fx_rates.conversion.convert_to_org_currency(amount, from_currency, organisation, rates=None)`, `Organisation.effective_global_attributes()["arr"]`.
- Produces:
  - `services.plans.figures.record_figures(record, organisation, rates=None) -> {"health_score": float|None, "arr": float|None}`
  - `services.plans.figures.start_figures(record, organisation, today) -> {"health_score", "arr", "currency", "taken_on"}`
  - `Plan.start_figures` (dict or `None`)

- [ ] **Step 1: Write the failing tests**

`services/plans/tests/test_start_figures.py`:

```python
"""Plans keep their starting figures (Brain delivery 3 spec §1.1): the
record's health score and ARR, as the rest of the app reads them, written
once when a plan starts by a person or a rule, and never again. Plans made
before this delivery read null."""

from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APIClient

from services.accounts.models import Organisation, User
from services.customers.models import Account, Customer
from services.fx_rates.models import FxRate
from services.plans.figures import record_figures
from services.plans.models import Plan
from services.plans.tests.test_starting import StartFixture


class StartFiguresTests(StartFixture):
    def setUp(self):
        Customer.objects.filter(pk=self.pizza.pk).update(
            arr_billed_at_account=Decimal("40000"),
            arr_billed_at_hq=Decimal("90000"),
            health_score=Decimal("6.2"),
        )
        self.pizza.refresh_from_db()
        self.carl = User.objects.get(pk=self.csm.pk)

    def started(self, record=None, **kwargs):
        kwargs.setdefault("owner", self.carl)
        kwargs.setdefault("actor", self.carl)
        plan = self.start(record=record or self.pizza, **kwargs)
        plan.refresh_from_db()
        return plan

    def test_a_plan_started_by_a_person_keeps_the_records_figures(self):
        plan = self.started()
        self.assertEqual(
            plan.start_figures,
            {
                "health_score": 6.2,
                "arr": 40000.0,
                "currency": "USD",
                "taken_on": timezone.localdate().isoformat(),
            },
        )

    def test_a_plan_started_by_a_rule_keeps_them_too(self):
        rule = self.make_rule(name="Onboard new")
        plan = self.started(actor=None, rule=rule)
        self.assertEqual(plan.start_figures["health_score"], 6.2)
        self.assertEqual(plan.start_figures["arr"], 40000.0)

    def test_arr_is_the_column_the_workspace_maps(self):
        Organisation.objects.filter(pk=self.org.pk).update(
            global_attributes={"arr": "arr_billed_at_hq"}
        )
        self.carl = User.objects.get(pk=self.csm.pk)
        self.assertEqual(self.started().start_figures["arr"], 90000.0)

    def test_another_currency_is_converted_or_left_null(self):
        Customer.objects.filter(pk=self.pizza.pk).update(currency="EUR")
        self.pizza.refresh_from_db()
        self.assertIsNone(record_figures(self.pizza, self.org)["arr"])
        FxRate.objects.create(organisation=self.org, currency="EUR", rate_to_org_currency="1.1")
        self.assertEqual(record_figures(self.pizza, self.org)["arr"], 44000.0)

    def test_an_account_reads_its_own_arr_and_health(self):
        Account.objects.filter(pk=self.emea.pk).update(arr=Decimal("12000"), health_score="7.5")
        self.emea.refresh_from_db()
        plan = self.started(record=self.emea)
        self.assertEqual(
            (plan.start_figures["health_score"], plan.start_figures["arr"]), (7.5, 12000.0)
        )

    def test_they_are_never_updated_afterwards(self):
        plan = self.started()
        kept = dict(plan.start_figures)
        Customer.objects.filter(pk=self.pizza.pk).update(health_score=Decimal("9.9"))
        client = APIClient()
        client.force_authenticate(self.carl)
        response = client.patch(f"/api/v1/plans/{plan.pk}/", {"name": "Renamed"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        plan.refresh_from_db()
        self.assertEqual(plan.start_figures, kept)

    def test_plans_from_before_read_null(self):
        field = Plan._meta.get_field("start_figures")
        self.assertTrue(field.null)
        self.assertIsNone(self.build_plan().start_figures)
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `venv/bin/python manage.py test services.plans.tests.test_start_figures --parallel --noinput`
Expected: ERROR, `ModuleNotFoundError: No module named 'services.plans.figures'`.

- [ ] **Step 3: Add the field and generate the migration**

In `services/plans/models.py`, add to `Plan` after `done_at`:

```python
    start_figures = models.JSONField(
        null=True,
        blank=True,
        help_text="The record's health score and ARR when the plan started "
        "({health_score, arr, currency, taken_on}); null for plans started before "
        "these were kept. Written once, by plans.starting.",
    )
```

Run: `venv/bin/python manage.py makemigrations plans --name plan_start_figures`
Expected: `services/plans/migrations/0003_plan_start_figures.py` with a single `migrations.AddField(model_name="plan", name="start_figures", field=models.JSONField(blank=True, help_text=..., null=True))` and `dependencies = [("plans", "0002_builtin_templates")]`. It has no `default` and no `RunPython`, so existing rows read `NULL`.

- [ ] **Step 4: Write the figures reader**

`services/plans/figures.py`:

```python
"""A plan's record, in figures: its health score and ARR as the rest of the
app reads them (Brain delivery 3 spec §1.1). `start_plan` keeps them when a
plan starts; What's being done (`services/brain/doing.py`) reads them now.

A customer's ARR is the column the workspace's global-attribute mapping
names, converted into the workspace currency through the one conversion
hook (null when there is no rate, never an unconverted figure). An
account's ARR is `Account.arr`, already in the workspace currency (see
`accounts_portfolio.book`)."""

from decimal import Decimal

from services.customers.models import Customer
from services.fx_rates.conversion import convert_to_org_currency


def _number(value):
    return None if value is None else float(value)


def record_figures(record, organisation, rates=None):
    """`{"health_score", "arr"}` for a Customer or an Account. Pass `rates`
    (`fx_rates.conversion.rates_for`) when reading many customers."""
    if isinstance(record, Customer):
        column = organisation.effective_global_attributes()["arr"]
        arr = convert_to_org_currency(
            Decimal(getattr(record, column) or 0), record.currency, organisation, rates=rates
        )
    else:
        arr = record.arr
    return {"health_score": _number(record.health_score), "arr": _number(arr)}


def start_figures(record, organisation, today):
    """What `Plan.start_figures` keeps: the figures, the currency they are in
    and the day they were taken."""
    return {
        **record_figures(record, organisation),
        "currency": organisation.currency,
        "taken_on": today.isoformat(),
    }
```

- [ ] **Step 5: Write them in `start_plan`**

In `services/plans/starting.py`, add the imports:

```python
from django.utils import timezone

from .figures import start_figures
```

In `start_plan`, inside the `Plan.objects.create(...)` call, add after `started_by_rule=rule,`:

```
                    start_figures=start_figures(
                        record, owner.organisation, timezone.localdate()
                    ),
```

Add a line to the module docstring: "The record's health score and ARR are kept on the plan as it starts (`start_figures`) and never written again."

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.plans services.rules.tests.test_plan_action --parallel --noinput`
Expected: PASS. The lock-order test still passes, because the figures need no lock.

Run: `venv/bin/python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 7: Commit**

```bash
git add services/plans/figures.py services/plans/models.py services/plans/starting.py \
  services/plans/migrations/0003_plan_start_figures.py services/plans/tests/test_start_figures.py
git commit -m "feat(plans): keep the record's health and ARR when a plan starts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The Initiatives section

**Files:**
- Create: `services/brain/initiatives.py` (access and the trackable metrics; Task 5 adds writes)
- Create: `services/brain/doing.py` (initiatives part; Tasks 3–4 add plans, rules, `build`)
- Create: `services/brain/tests/doing_fixtures.py`
- Test: `services/brain/tests/test_doing.py`

**Interfaces:**
- Consumes: `metrics.initiatives.Figures(organisation)` (`value_of`, `label_of`), `metrics.initiatives.progress(initiative, current, today)`, `metrics.registry.METRICS`, `BY_KEY`, `OWNER`, `scope.owner_ids`, `scope.is_company`, `ME`/`TEAM`/`COMPANY` from `services.brain.scope`.
- Produces:
  - `services.brain.initiatives.OWNER_METRICS: tuple[str, ...]`, `trackable() -> list[dict]`
  - `services.brain.initiatives.edited_as(reader, initiative, *, below=None, everything=None) -> "me"|"team"|"company"|None`
  - `services.brain.doing.LIMIT = 100`, `RECENT_DAYS = 30`, `owners_of(scope)`, `day_start(day)`, `person(user)`
  - `services.brain.doing.initiatives_in(reader, scope, today) -> QuerySet[Initiative]`
  - `services.brain.doing.initiative_items(reader, initiatives, figures, today) -> list[dict]` (the §3 rows)
  - `services.brain.doing.initiative_payload(reader, pk, today) -> dict` (one row; for the POST/PATCH responses)
  - `DoingFixture.initiative(owner=None, *, cut=None, metric="at_risk_arr", status="active", closed_days_ago=None, target_in=60, title=...)`

- [ ] **Step 1: Write the fixture**

`services/brain/tests/doing_fixtures.py`:

```python
"""What's being done: BrainFixture's people and book, plus makers for
initiatives (this task), plans and rules (later tasks). Carl (CSM) reports
to Mona; Dana is nobody's; Alice has view_all_accounts; Lee reads Company
through Leadership only."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from services.accounts.models import User
from services.brain.scope import resolve
from services.brain.tests.fixtures import BrainFixture
from services.metrics.models import Initiative


class DoingFixture(BrainFixture):
    def initiative(
        self,
        owner=None,
        *,
        cut=None,
        metric="at_risk_arr",
        status="active",
        closed_days_ago=None,
        target_in=60,
        title="Halve ARR at risk",
    ):
        """An initiative made row by row. `cut` is the person whose owner cut
        it tracks; without one it is on the whole company."""
        closed_at = None
        if closed_days_ago is not None:
            closed_at = timezone.now() - timedelta(days=closed_days_ago)
        return Initiative.objects.create(
            organisation=self.org,
            title=title,
            hypothesis="If we act, then the number moves.",
            metric=metric,
            dimension="owner" if cut else "",
            member=str(cut.pk) if cut else "",
            member_label=cut.name if cut else "",
            target_value=Decimal("0"),
            target_by=self.today + timedelta(days=target_in),
            owner=owner,
            status=status,
            baseline_value=Decimal("1000"),
            baseline_as_of=self.today,
            closed_at=closed_at,
        )

    def reader_and_scope(self, user, key):
        """A fresh reader (no memoised org chart) and their scope."""
        reader = User.objects.get(pk=user.pk)
        return reader, resolve(reader, key)
```

- [ ] **Step 2: Write the failing tests**

`services/brain/tests/test_doing.py`:

```python
"""What's being done (spec §1.2): each section filtered to the scope's book,
named only for what the reader may open."""

from services.brain import doing
from services.brain.initiatives import OWNER_METRICS, edited_as, trackable
from services.brain.tests.doing_fixtures import DoingFixture
from services.customers.models import Task
from services.metrics.initiatives import Figures
from services.metrics.registry import METRICS


class InitiativeSectionTests(DoingFixture):
    def items(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        rows = doing.initiatives_in(reader, scope, self.today)
        return doing.initiative_items(reader, rows, Figures(self.org), self.today)

    def ids(self, user, key):
        return [row["id"] for row in self.items(user, key)]

    def test_me_is_what_i_own_and_what_is_cut_to_my_book(self):
        owned = self.initiative(self.csm)
        cut = self.initiative(self.admin, cut=self.csm)
        self.initiative(self.other)
        self.initiative(self.admin)
        self.assertCountEqual(self.ids(self.csm, "me"), [owned.pk, cut.pk])

    def test_my_team_is_the_same_for_everyone_on_my_desk(self):
        carls = self.initiative(self.csm)
        monas = self.initiative(self.mona)
        cut = self.initiative(self.admin, cut=self.csm)
        self.initiative(self.other)
        self.initiative(self.admin, cut=self.other)
        self.assertCountEqual(self.ids(self.mona, "team"), [carls.pk, monas.pk, cut.pk])

    def test_company_is_every_one(self):
        made = [self.initiative(self.csm), self.initiative(self.other), self.initiative(None)]
        self.assertCountEqual(self.ids(self.admin, "company"), [i.pk for i in made])
        self.assertCountEqual(self.ids(self.lee, "company"), [i.pk for i in made])

    def test_closed_ones_stay_thirty_days(self):
        recent = self.initiative(self.csm, status="done", closed_days_ago=10)
        self.initiative(self.csm, status="abandoned", closed_days_ago=40)
        self.assertEqual(self.ids(self.csm, "me"), [recent.pk])

    def test_active_then_planned_then_closed_soonest_first(self):
        late = self.initiative(self.csm, target_in=90)
        soon = self.initiative(self.csm, target_in=10)
        planned = self.initiative(self.csm, status="planned", target_in=5)
        done = self.initiative(self.csm, status="done", closed_days_ago=1, target_in=1)
        self.assertEqual(self.ids(self.csm, "me"), [soon.pk, late.pk, planned.pk, done.pk])

    def test_the_row_shape(self):
        mine = self.initiative(self.mona, cut=self.csm)
        whole = self.initiative(self.mona, metric="nrr")
        rows = {row["id"]: row for row in self.items(self.mona, "team")}
        row = rows[mine.pk]
        self.assertEqual(
            set(row),
            {
                "id", "title", "hypothesis", "outcome", "metric", "metric_label", "for",
                "status", "owner", "target_by", "progress", "work", "can_edit",
            },
        )  # fmt: skip
        self.assertEqual(row["metric_label"], "ARR at risk")
        self.assertEqual(
            row["for"], {"dimension": "owner", "member": str(self.csm.pk), "label": "Carl CSM"}
        )
        self.assertEqual(row["owner"], {"id": self.mona.pk, "name": "Mona Manager"})
        self.assertEqual(
            set(row["progress"]),
            {"baseline", "current", "target", "progress_pct", "days_left", "direction", "unit",
             "better"},
        )  # fmt: skip
        self.assertEqual(row["progress"]["baseline"], 1000.0)
        self.assertIsNone(rows[whole.pk]["for"])

    def test_work_counts_everything_and_names_only_readable_tasks(self):
        initiative = self.initiative(self.csm, cut=self.csm)
        due = self.today

        def task(customer, assignee, status, title):
            return Task.objects.create(
                customer=customer,
                initiative=initiative,
                title=title,
                assignee=assignee,
                assignee_name=assignee.name,
                created_by=assignee,
                due_date=due,
                priority=Task.Priority.HIGH,
                status=status,
            )

        task(self.pizza, self.csm, Task.Status.PENDING, "Call Pizza Hut")
        task(self.pizza, self.csm, Task.Status.COMPLETED, "Send the deck")
        task(self.taco, self.other, Task.Status.PENDING, "Call Taco Bell")
        (row,) = self.items(self.mona, "team")
        self.assertEqual((row["work"]["open"], row["work"]["done"]), (2, 1))
        self.assertEqual(
            [t["title"] for t in row["work"]["tasks"]], ["Call Pizza Hut", "Send the deck"]
        )
        self.assertEqual(
            set(row["work"]["tasks"][0]),
            {"id", "title", "parent_name", "parent_type", "parent_id", "assignee_name",
             "due_date", "priority", "status"},
        )  # fmt: skip

    def test_can_edit_follows_edited_as(self):
        carls = self.initiative(self.csm)
        (row,) = self.items(self.mona, "team")
        self.assertTrue(row["can_edit"])
        self.assertTrue(self.items(self.csm, "me")[0]["can_edit"])
        unowned = self.initiative(None, cut=self.csm)
        rows = {row["id"]: row for row in self.items(self.csm, "me")}
        self.assertTrue(rows[carls.pk]["can_edit"])
        self.assertFalse(rows[unowned.pk]["can_edit"])

    def test_one_payload(self):
        made = self.initiative(self.csm, cut=self.csm, status="done", closed_days_ago=90)
        row = doing.initiative_payload(self.csm, made.pk, self.today)
        self.assertEqual(row["id"], made.pk)
        self.assertEqual(row["status"], "done")


class EditedAsTests(DoingFixture):
    def test_owner_then_chain_then_company(self):
        carls = self.initiative(self.csm)
        self.assertEqual(edited_as(self.csm, carls), "me")
        self.assertEqual(edited_as(self.mona, carls), "team")
        self.assertEqual(edited_as(self.admin, carls), "company")
        self.assertIsNone(edited_as(self.other, carls))
        self.assertIsNone(edited_as(self.lee, carls))
        self.assertIsNone(edited_as(self.stranger, carls))

    def test_an_initiative_with_no_owner_is_company_only(self):
        unowned = self.initiative(None, cut=self.csm)
        self.assertIsNone(edited_as(self.csm, unowned))
        self.assertEqual(edited_as(self.admin, unowned), "company")


class TrackableTests(DoingFixture):
    def test_only_metrics_with_an_owner_cut(self):
        self.assertEqual(
            OWNER_METRICS, ("forecast_arr", "nrr", "at_risk_arr", "healthy_share",
                            "poor_health_count"),
        )  # fmt: skip
        self.assertEqual(OWNER_METRICS, tuple(m.key for m in METRICS if "owner" in m.slices))
        self.assertEqual(
            trackable()[2], {"key": "at_risk_arr", "label": "ARR at risk", "unit": "money",
                             "better": "down"},
        )  # fmt: skip
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_doing --parallel --noinput`
Expected: ERROR, `ImportError: cannot import name 'doing' from 'services.brain'`.

- [ ] **Step 4: Write the access rules**

`services/brain/initiatives.py`:

```python
"""Initiatives for everyone (spec §1.3): which numbers can be tracked for
one person's book, and who may change an initiative. `edited_as` is the one
rule: every row's `can_edit` and `PATCH initiatives/<id>/` both ask it, so
the page offers exactly what the route allows."""

from services.accounts.hierarchy import subtree_ids
from services.customers.scoping import sees_everything
from services.metrics.registry import METRICS, OWNER

from .scope import COMPANY, ME, TEAM

#: The metrics with an owner cut: the only ones Me and My team can track.
OWNER_METRICS = tuple(metric.key for metric in METRICS if OWNER in metric.slices)


def trackable():
    """The owner-cut metrics, for the New initiative form outside Company."""
    return [
        {"key": m.key, "label": m.label, "unit": m.unit, "better": m.better}
        for m in METRICS
        if m.key in OWNER_METRICS
    ]


def edited_as(reader, initiative, *, below=None, everything=None):
    """How `reader` may change `initiative`: "me" (they own it), "team" (its
    owner is below them), "company" (view_all_accounts), or None. A page of
    rows passes `below` (subtree_ids) and `everything` (sees_everything)
    computed once."""
    # SOC2:AUTH-02 an initiative is changed by its owner, anyone above them,
    # or view_all_accounts; never across organisations
    if initiative.organisation_id != reader.organisation_id:
        return None
    owner_id = initiative.owner_id
    if owner_id is not None:
        if owner_id == reader.id:
            return ME
        if owner_id in (subtree_ids(reader) if below is None else below):
            return TEAM
    if sees_everything(reader) if everything is None else everything:
        return COMPANY
    return None
```

- [ ] **Step 5: Write the Initiatives section**

`services/brain/doing.py`:

```python
"""What's being done: the initiatives, plans and rules working on a scope's
numbers (spec: react-ts-app docs/superpowers/specs/2026-10-05-brain-doing-
design.md §1.2).

Whose book: Me is the reader, My team the reader and everyone below them
(`scope.owner_ids`), Company everyone. Inside it, everything is named by the
reader's own rights, never the scope's: visibility helpers get the plain
reader, never `scope.actor`. A plan on a record the reader can't open is
counted in `hidden`, not shown.

Each section is a fixed number of queries whatever its length, and every
"in the book" filter is an `id IN (subquery)`, never a join made unique with
DISTINCT: Postgres 16 plans that badly (services.customers.scoping). A test
checks every query here for DISTINCT."""

from collections import defaultdict
from datetime import datetime, time, timedelta

from django.db.models import Case, Count, IntegerField, OuterRef, Q, Subquery, Value, When
from django.db.models.functions import Coalesce
from django.utils import timezone

from services.accounts.hierarchy import subtree_ids
from services.customers.models import Task
from services.customers.personal import visible_tasks
from services.customers.scoping import sees_everything, visible_accounts, visible_customers
from services.metrics.initiatives import Figures, progress
from services.metrics.models import Initiative
from services.metrics.registry import BY_KEY, OWNER

from .initiatives import edited_as

#: Most rows a section carries.
LIMIT = 100
#: How long a finished initiative or plan stays on the page.
RECENT_DAYS = 30


def owners_of(scope):
    """The desk's people, or None for Company (everyone)."""
    return None if scope.is_company else sorted(scope.owner_ids)


def day_start(day):
    return timezone.make_aware(datetime.combine(day, time.min))


def person(user):
    return {"id": user.id, "name": user.name} if user is not None else None


# ── Initiatives ──────────────────────────────────────────────────────────

OPEN_INITIATIVES = (Initiative.Status.ACTIVE, Initiative.Status.PLANNED)
INITIATIVE_RANK = Case(
    When(status=Initiative.Status.ACTIVE, then=Value(0)),
    When(status=Initiative.Status.PLANNED, then=Value(1)),
    default=Value(2),
    output_field=IntegerField(),
)


def initiatives_in(reader, scope, today):
    """Me and My team: initiatives the desk owns or that track a desk
    person's owner cut. Company: all of them. Open ones, and those closed in
    the last RECENT_DAYS."""
    rows = Initiative.objects.filter(organisation_id=reader.organisation_id)
    owners = owners_of(scope)
    if owners is not None:
        rows = rows.filter(
            Q(owner_id__in=owners) | Q(dimension=OWNER, member__in=[str(pk) for pk in owners])
        )
    since = day_start(today - timedelta(days=RECENT_DAYS))
    return rows.filter(Q(status__in=OPEN_INITIATIVES) | Q(closed_at__gte=since))


def _task_count(tasks):
    counted = (
        tasks.filter(initiative_id=OuterRef("pk"))
        .order_by()
        .values("initiative_id")
        .annotate(n=Count("id"))
        .values("n")[:1]
    )
    return Coalesce(Subquery(counted, output_field=IntegerField()), 0)


def _ordered(tasks):
    """Open first, soonest due first; then done, newest first (the
    /metrics/initiatives/ order)."""
    done = [t for t in tasks if t.status == Task.Status.COMPLETED]
    open_ = [t for t in tasks if t.status != Task.Status.COMPLETED]
    return sorted(open_, key=lambda t: (t.due_date, -t.id)) + sorted(done, key=lambda t: -t.id)


def _readable_tasks(reader, initiative_ids):
    """`{initiative_id: [Task]}`: the tasks the reader may read, on records
    they may open. One query."""
    if not initiative_ids:
        return {}
    # SOC2:AUTH-02 a task is listed only for someone who may read it, on a
    # record they may open; the rest are only counted
    readable = visible_tasks(reader, Task.objects.filter(initiative_id__in=initiative_ids)).filter(
        Q(customer_id__in=visible_customers(reader).values("id"))
        | Q(account_id__in=visible_accounts(reader).values("id"))
    )
    found = defaultdict(list)
    for task in readable.select_related("customer", "account"):
        found[task.initiative_id].append(task)
    return {pk: _ordered(tasks) for pk, tasks in found.items()}


def _task_row(task):
    parent = task.customer if task.customer_id else task.account
    return {
        "id": task.pk,
        "title": task.title,
        "parent_name": parent.name,
        "parent_type": "customer" if task.customer_id else "account",
        "parent_id": parent.pk,
        "assignee_name": task.assignee_name,
        "due_date": task.due_date.isoformat(),
        "priority": task.priority,
        "status": task.status,
    }


def _initiative(initiative, figures, today, tasks, can_edit):
    metric = BY_KEY.get(initiative.metric)
    cut = None
    if initiative.dimension:
        cut = {
            "dimension": initiative.dimension,
            "member": initiative.member,
            "label": figures.label_of(initiative),
        }
    return {
        "id": initiative.pk,
        "title": initiative.title,
        "hypothesis": initiative.hypothesis,
        "outcome": initiative.outcome,
        "metric": initiative.metric,
        "metric_label": metric.label if metric else initiative.metric,
        "for": cut,
        "status": initiative.status,
        "owner": person(initiative.owner),
        "target_by": initiative.target_by.isoformat(),
        "progress": progress(initiative, figures.value_of(initiative), today),
        "work": {
            "open": initiative.open_tasks,
            "done": initiative.done_tasks,
            "tasks": [_task_row(task) for task in tasks],
        },
        "can_edit": can_edit,
    }


def initiative_items(reader, initiatives, figures, today):
    """The section's rows: active, planned, then closed, soonest target
    first, at most LIMIT. `figures` (one `Figures` per request) runs the
    registry once however many rows there are."""
    rows = list(
        initiatives.select_related("owner")
        .annotate(
            rank=INITIATIVE_RANK,
            open_tasks=_task_count(Task.objects.exclude(status=Task.Status.COMPLETED)),
            done_tasks=_task_count(Task.objects.filter(status=Task.Status.COMPLETED)),
        )
        .order_by("rank", "target_by", "id")[:LIMIT]
    )
    tasks = _readable_tasks(reader, [row.pk for row in rows])
    below, everything = subtree_ids(reader), sees_everything(reader)
    return [
        _initiative(
            row,
            figures,
            today,
            tasks.get(row.pk, []),
            edited_as(reader, row, below=below, everything=everything) is not None,
        )
        for row in rows
    ]


def initiative_payload(reader, pk, today):
    """One initiative as a row of `doing/`: what POST and PATCH return."""
    rows = Initiative.objects.filter(organisation_id=reader.organisation_id, pk=pk)
    (row,) = initiative_items(reader, rows, Figures(reader.organisation), today)
    return row
```

- [ ] **Step 6: Run the tests**

Run: `venv/bin/python manage.py test services.brain.tests.test_doing --parallel --noinput`
Expected: PASS (10 tests).

Run: `venv/bin/ruff check services/brain && venv/bin/ruff format --check services/brain`
Expected: clean. Apply `ruff format` if needed, but keep the `# fmt: skip` tuples.

- [ ] **Step 7: Commit**

```bash
git add services/brain/initiatives.py services/brain/doing.py \
  services/brain/tests/doing_fixtures.py services/brain/tests/test_doing.py
git commit -m "feat(brain): the initiatives on a scope's book, with progress, work and who may edit

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The Plans section, then → now, and `hidden`

**Files:**
- Modify: `services/brain/doing.py` (add the plans part)
- Modify: `services/brain/tests/doing_fixtures.py` (add `plan`)
- Test: `services/brain/tests/test_doing.py` (add `PlanSectionTests`)

**Interfaces:**
- Consumes: `services.plans.access.visible_plans(user)`, `services.plans.models.OPEN`, `Plan`, `Milestone`, `services.plans.figures.record_figures` (Task 1), `services.fx_rates.conversion.rates_for`, `owners_of`, `day_start`, `person`, `LIMIT`, `RECENT_DAYS` (Task 2).
- Produces:
  - `services.brain.doing.plans_in(reader, scope, today) -> QuerySet[Plan]` (the book, every status in the window)
  - `services.brain.doing.plan_section(reader, scope, today) -> tuple[list[dict], int]` (`(items, hidden)`)
  - `services.brain.doing.then_of(plan, currency) -> dict|None`
  - `DoingFixture.plan(record, *, owner=None, status="on_track", figures=None, milestones=(False, False), target_in=30, name="Renewal save play")`

- [ ] **Step 1: Add the plan maker to the fixture**

In `services/brain/tests/doing_fixtures.py`, add the imports:

```python
from services.customers.models import Customer
from services.plans.models import Milestone, Plan
```

and the method to `DoingFixture`:

```python
    def plan(
        self,
        record,
        *,
        owner=None,
        status="on_track",
        figures=None,
        milestones=(False, False),
        target_in=30,
        name="Renewal save play",
    ):
        """A plan made row by row on `record` (a Customer or an Account),
        owned by the record's owner unless told otherwise; `milestones` says
        which are done; `figures` is its `start_figures` (None: an old plan)."""
        on = {"customer": record} if isinstance(record, Customer) else {"account": record}
        plan = Plan.objects.create(
            organisation=self.org,
            name=name,
            kind="save",
            owner=owner or record.owner or self.admin,
            start_date=self.today,
            target_date=self.today + timedelta(days=target_in),
            status=status,
            start_figures=figures,
            **on,
        )
        for position, done in enumerate(milestones):
            Milestone.objects.create(
                plan=plan,
                name=f"Step {position + 1}",
                position=position,
                due_date=self.today + timedelta(days=7 * (position + 1)),
                done_at=timezone.now() if done else None,
            )
        return plan
```

- [ ] **Step 2: Write the failing tests**

Append to `services/brain/tests/test_doing.py` (add `from datetime import timedelta`, `from decimal import Decimal`, `from django.utils import timezone`, `from services.customers.models import Customer` and `from services.plans.models import Plan` to the imports):

```python
class PlanSectionTests(DoingFixture):
    def section(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return doing.plan_section(reader, scope, self.today)

    def ids(self, user, key):
        return [row["id"] for row in self.section(user, key)[0]]

    def test_me_is_plans_on_my_customers_and_accounts(self):
        mine = [self.plan(self.pizza), self.plan(self.dough), self.plan(self.emea),
                self.plan(self.east)]  # fmt: skip
        self.plan(self.taco)
        self.plan(self.west)
        self.plan(self.soup)
        self.assertCountEqual(self.ids(self.csm, "me"), [p.pk for p in mine])

    def test_my_team_adds_the_desk(self):
        shown = [self.plan(self.pizza), self.plan(self.soup), self.plan(self.east)]
        self.plan(self.west)
        self.plan(self.loose)
        self.assertCountEqual(self.ids(self.mona, "team"), [p.pk for p in shown])

    def test_company_is_everything_and_hides_what_the_reader_cant_open(self):
        on_pizza = self.plan(self.pizza)
        on_loose = self.plan(self.loose)
        items, hidden = self.section(self.admin, "company")
        self.assertCountEqual([row["id"] for row in items], [on_pizza.pk, on_loose.pk])
        self.assertEqual(hidden, 0)
        items, hidden = self.section(self.lee, "company")
        self.assertEqual([row["id"] for row in items], [on_loose.pk])
        self.assertEqual(hidden, 1)

    def test_open_by_status_then_the_last_thirty_days_closed(self):
        on_track = self.plan(self.pizza, status="on_track", target_in=5)
        not_started = self.plan(self.pizza, status="not_started", target_in=1)
        at_risk = self.plan(self.pizza, status="at_risk", target_in=50)
        at_risk_sooner = self.plan(self.dough, status="at_risk", target_in=20)
        done = self.plan(self.pizza, status="done")
        Plan.objects.filter(pk=done.pk).update(done_at=timezone.now() - timedelta(days=3))
        old = self.plan(self.pizza, status="done")
        Plan.objects.filter(pk=old.pk).update(done_at=timezone.now() - timedelta(days=40))
        cancelled = self.plan(self.dough, status="cancelled")
        Plan.objects.filter(pk=cancelled.pk).update(updated_at=timezone.now() - timedelta(days=10))
        stale = self.plan(self.dough, status="cancelled")
        Plan.objects.filter(pk=stale.pk).update(updated_at=timezone.now() - timedelta(days=31))
        self.assertEqual(
            self.ids(self.csm, "me"),
            [at_risk_sooner.pk, at_risk.pk, on_track.pk, not_started.pk, done.pk, cancelled.pk],
        )

    def test_then_and_now(self):
        kept = {"health_score": 2.0, "arr": 100000.0, "currency": "USD",
                "taken_on": "2026-10-06"}  # fmt: skip
        new = self.plan(self.dough, figures=kept, milestones=(True, False, False))
        old = self.plan(self.pizza)
        Customer.objects.filter(pk=self.dough.pk).update(health_score=Decimal("4.5"))
        rows = {row["id"]: row for row in self.section(self.csm, "me")[0]}
        row = rows[new.pk]
        self.assertEqual(
            set(row),
            {"id", "name", "status", "record", "owner", "target_date", "milestones", "then",
             "now"},
        )  # fmt: skip
        self.assertEqual(
            row["record"], {"type": "customer", "id": self.dough.pk, "name": "Dough Co"}
        )
        self.assertEqual(row["owner"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(row["milestones"], {"done": 1, "total": 3})
        self.assertEqual(
            row["then"], {"health_score": 2.0, "arr": 100000.0, "taken_on": "2026-10-06"}
        )
        self.assertEqual(row["now"], {"health_score": 4.5, "arr": 100000.0})
        self.assertIsNone(rows[old.pk]["then"])
        self.assertEqual(rows[old.pk]["now"], {"health_score": 8.0, "arr": 300000.0})

    def test_an_account_plan_reads_the_account(self):
        plan = self.plan(self.emea)
        (row,) = self.section(self.csm, "me")[0]
        self.assertEqual(row["record"], {"type": "account", "id": self.emea.pk,
                                         "name": "Pizza EMEA"})  # fmt: skip
        self.assertEqual(row["now"], {"health_score": 5.0, "arr": 0.0})
        self.assertEqual(row["id"], plan.pk)

    def test_then_arr_is_null_once_the_currency_moved(self):
        kept = {"health_score": 2.0, "arr": 90000.0, "currency": "EUR",
                "taken_on": "2026-10-06"}  # fmt: skip
        self.plan(self.dough, figures=kept)
        (row,) = self.section(self.csm, "me")[0]
        self.assertEqual(row["then"], {"health_score": 2.0, "arr": None, "taken_on": "2026-10-06"})
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_doing.PlanSectionTests --parallel --noinput`
Expected: ERROR, `AttributeError: module 'services.brain.doing' has no attribute 'plan_section'`.

- [ ] **Step 4: Write the Plans section**

In `services/brain/doing.py`, extend the imports:

```python
from django.db.models import (
    Case,
    Count,
    DateField,
    F,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Value,
    When,
)

from services.customers.models import Account, Customer, Task
from services.fx_rates.conversion import rates_for
from services.plans.access import visible_plans
from services.plans.figures import record_figures
from services.plans.models import OPEN, Milestone, Plan
```

Append:

```python
# ── Plans ────────────────────────────────────────────────────────────────

PLAN_RANK = Case(
    When(status=Plan.Status.AT_RISK, then=Value(0)),
    When(status=Plan.Status.ON_TRACK, then=Value(1)),
    When(status=Plan.Status.NOT_STARTED, then=Value(2)),
    default=Value(3),
    output_field=IntegerField(),
)


def plans_in(reader, scope, today):
    """The scope's plans, whoever may open them: Me and My team, plans on
    the desk's customers and on accounts the desk owns or that sit under a
    desk customer (the ScopeActor book, written out); Company, every plan.
    Open ones, and those done or cancelled in the last RECENT_DAYS."""
    plans = Plan.objects.filter(organisation_id=reader.organisation_id)
    owners = owners_of(scope)
    if owners is not None:
        customers = Customer.objects.filter(
            organisation_id=reader.organisation_id, owner_id__in=owners
        ).values("id")
        under = Account.customers.through.objects.filter(customer_id__in=customers).values(
            "account_id"
        )
        accounts = Account.objects.filter(Q(owner_id__in=owners) | Q(id__in=under)).values("id")
        plans = plans.filter(Q(customer_id__in=customers) | Q(account_id__in=accounts))
    since = day_start(today - timedelta(days=RECENT_DAYS))
    return plans.filter(
        Q(status__in=OPEN)
        | Q(status=Plan.Status.DONE, done_at__gte=since)
        | Q(status=Plan.Status.CANCELLED, updated_at__gte=since)
    )


def then_of(plan, currency):
    """The kept starting figures, or None for a plan from before they were
    kept. ARR is null once the workspace's currency is no longer the one it
    was kept in."""
    kept = plan.start_figures
    if kept is None:
        return None
    return {
        "health_score": kept.get("health_score"),
        "arr": kept.get("arr") if kept.get("currency") == currency else None,
        "taken_on": kept.get("taken_on"),
    }


def _plan(plan, organisation, rates, milestones):
    record = plan.customer if plan.customer_id else plan.account
    counted = milestones.get(plan.pk, {"done": 0, "total": 0})
    return {
        "id": plan.pk,
        "name": plan.name,
        "status": plan.status,
        "record": {
            "type": "customer" if plan.customer_id else "account",
            "id": record.pk,
            "name": record.name,
        },
        "owner": person(plan.owner),
        "target_date": plan.target_date.isoformat(),
        "milestones": {"done": counted["done"], "total": counted["total"]},
        "then": then_of(plan, organisation.currency),
        "now": record_figures(record, organisation, rates),
    }


def plan_items(reader, readable):
    """Rows for plans the reader may open: open ones by status (at risk
    first) and soonest target, then the closed, most recent first. A fixed
    number of queries: the plans, their milestone counts, the FX rates."""
    plans = list(
        readable.select_related("customer", "account", "owner")
        .annotate(
            rank=PLAN_RANK,
            open_due=Case(
                When(status__in=OPEN, then=F("target_date")),
                default=None,
                output_field=DateField(),
            ),
            closed_on=Coalesce("done_at", "updated_at"),
        )
        .order_by("rank", F("open_due").asc(nulls_last=True), F("closed_on").desc(), "id")[:LIMIT]
    )
    if not plans:
        return []
    organisation = reader.organisation
    milestones = {
        row["plan_id"]: row
        for row in Milestone.objects.filter(plan_id__in=[plan.pk for plan in plans])
        .order_by()
        .values("plan_id")
        .annotate(total=Count("id"), done=Count("id", filter=Q(done_at__isnull=False)))
    }
    rates = rates_for(organisation) if any(plan.customer_id for plan in plans) else None
    return [_plan(plan, organisation, rates, milestones) for plan in plans]


def plan_section(reader, scope, today):
    """`(items, hidden)`: the scope's plans the reader may open, and how many
    more are in the scope on records they can't."""
    in_book = plans_in(reader, scope, today)
    # SOC2:AUTH-02 a plan is named only to someone who may open its record;
    # the rest of the scope's plans are counted, never named
    readable = in_book.filter(id__in=visible_plans(reader).values("id"))
    hidden = in_book.count() - readable.count()
    return plan_items(reader, readable), hidden
```

- [ ] **Step 5: Run the tests**

Run: `venv/bin/python manage.py test services.brain.tests.test_doing --parallel --noinput`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/brain/doing.py services/brain/tests/doing_fixtures.py services/brain/tests/test_doing.py
git commit -m "feat(brain): the plans on a scope's book, health and ARR then and now, hidden counted

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Rules at work, `build`, and `GET doing/`

**Files:**
- Modify: `services/rules/payloads.py` (rename `_tallies` → `tallies`, one call site in `runs_page`)
- Modify: `services/brain/doing.py` (rules part and `build`)
- Modify: `services/brain/views.py`, `services/brain/urls.py` (`DoingView`)
- Modify: `services/brain/tests/doing_fixtures.py` (add `rule`, `night`)
- Test: `services/brain/tests/test_doing.py` (add `RuleSectionTests`, `BuildTests`)
- Test: `services/brain/tests/test_api_doing.py` (create, `DoingApiTests`)

**Interfaces:**
- Consumes: `services.rules.access.readable_rules(user)`, `services.rules.models.Rule`/`RuleRun`, `services.rules.payloads.tallies(run_ids, viewer) -> {run_id: {total, seen, seen_fired}}`, `trackable()` (Task 2), `initiatives_in`/`initiative_items` (Task 2), `plan_section` (Task 3), `BrainView.scope(request)`.
- Produces:
  - `services.brain.doing.rules_in(reader, scope) -> QuerySet[Rule]`, `rule_items(reader, rules) -> list[dict]`
  - `services.brain.doing.build(reader, scope, today) -> {"scope", "currency", "hidden", "trackable", "initiatives", "plans", "rules"}`
  - `GET /api/v1/brain/doing/?scope=` (`name="brain-doing"`)
  - `DoingFixture.rule(owner, *, name=..., sharing="private", segment=None, is_active=True, paused_reason="")`, `DoingFixture.night(rule, *, fired=0, matched=0, skipped=None, days_ago=0, records=())`

- [ ] **Step 1: Add the rule makers to the fixture**

In `services/brain/tests/doing_fixtures.py`, add the import:

```python
from services.rules.models import Rule, RuleRun, RuleRunRecord, empty_skips
```

and the methods:

```
    def rule(
        self,
        owner,
        *,
        name="Detractor follow-up",
        sharing="private",
        segment=None,
        is_active=True,
        paused_reason="",
    ):
        return Rule.objects.create(
            organisation=self.org,
            owner=owner,
            name=name,
            trigger="entered",
            sharing=sharing,
            segment=segment,
            is_active=is_active,
            paused_reason=paused_reason,
        )

    def night(self, rule, *, fired=0, matched=0, skipped=None, days_ago=0, records=()):
        """A night of `rule`; each of `records` (Customers or Accounts) fired."""
        run = RuleRun.objects.create(
            rule=rule,
            run_on=self.today - timedelta(days=days_ago),
            matched=matched,
            fired=fired,
            skipped=skipped or empty_skips(),
            started_at=timezone.now(),
        )
        for record in records:
            RuleRunRecord.objects.create(
                run=run,
                record_kind="customer" if isinstance(record, Customer) else "account",
                record_id=record.pk,
                outcome=RuleRunRecord.Outcome.FIRED,
            )
        return run
```

- [ ] **Step 2: Write the failing tests**

Append to `services/brain/tests/test_doing.py` (add `from django.db import connection`, `from django.test.utils import CaptureQueriesContext`, `from services.rules.models import empty_skips` and `from services.segments.models import Segment` to the imports):

```python
class RuleSectionTests(DoingFixture):
    def items(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return doing.rule_items(reader, doing.rules_in(reader, scope))

    def test_the_desks_rules_private_ones_included(self):
        carls = self.rule(self.csm, name="Carl's")
        monas = self.rule(self.mona, name="Mona's")
        self.rule(self.other, name="Dana's")
        self.assertCountEqual(
            [r["id"] for r in self.items(self.mona, "team")], [carls.pk, monas.pk]
        )
        self.assertEqual([r["id"] for r in self.items(self.csm, "me")], [carls.pk])
        self.assertEqual(len(self.items(self.lee, "company")), 3)

    def test_my_own_rule_shows_every_count(self):
        rule = self.rule(self.csm)
        self.night(rule, fired=1, days_ago=1)
        self.night(rule, fired=4, matched=12, skipped={**empty_skips(), "cooldown": 2},
                   records=(self.pizza,))  # fmt: skip
        (row,) = self.items(self.csm, "me")
        self.assertEqual(
            row,
            {
                "id": rule.pk, "name": "Detractor follow-up", "segment": None,
                "is_active": True, "paused_reason": None, "paused_message": None,
                "mine": True, "readable": True,
                "last_run": {"run_on": self.today.isoformat(), "fired": 4, "matched": 12,
                             "skipped": 2},
            },
        )  # fmt: skip

    def test_someone_elses_rule_shows_only_what_fired_that_i_may_open(self):
        rule = self.rule(self.csm)
        self.night(rule, fired=3, matched=9, records=(self.pizza, self.dough, self.taco))
        (row,) = self.items(self.mona, "team")
        self.assertEqual((row["mine"], row["readable"]), (False, False))
        self.assertEqual(row["last_run"], {"run_on": self.today.isoformat(), "fired": 2})
        (row,) = [r for r in self.items(self.lee, "company") if r["id"] == rule.pk]
        self.assertEqual(row["last_run"]["fired"], 0)

    def test_a_shared_rule_is_readable(self):
        self.rule(self.csm, sharing="workspace")
        (row,) = self.items(self.mona, "team")
        self.assertTrue(row["readable"])

    def test_paused_with_its_segment_and_no_night_yet(self):
        segment = Segment.objects.create(
            organisation=self.org, owner=self.csm, name="Detractors", kind="customer",
            rules={"match": "all", "conditions": []},
        )  # fmt: skip
        self.rule(self.csm, segment=segment, is_active=False, paused_reason="owner_inactive")
        (row,) = self.items(self.csm, "me")
        self.assertEqual(row["segment"], "Detractors")
        self.assertEqual(
            (row["is_active"], row["paused_reason"], row["paused_message"], row["last_run"]),
            (False, "owner_inactive", "Its owner is no longer active.", None),
        )

    def test_active_first_then_by_name(self):
        b = self.rule(self.csm, name="B")
        a = self.rule(self.csm, name="A")
        off = self.rule(self.csm, name="0 off", is_active=False)
        self.assertEqual([r["id"] for r in self.items(self.csm, "me")], [a.pk, b.pk, off.pk])


class BuildTests(DoingFixture):
    def build(self, user, key):
        reader, scope = self.reader_and_scope(user, key)
        return doing.build(reader, scope, self.today)

    def test_the_shape(self):
        body = self.build(self.mona, "team")
        self.assertEqual(
            set(body), {"scope", "currency", "hidden", "trackable", "initiatives", "plans", "rules"}
        )
        self.assertEqual((body["scope"], body["currency"], body["hidden"]), ("team", "USD", 0))
        self.assertEqual([m["key"] for m in body["trackable"]], list(OWNER_METRICS))

    def test_hidden_counts_the_plans_the_reader_cant_open(self):
        self.plan(self.pizza)
        self.plan(self.taco)
        self.assertEqual(self.build(self.lee, "company")["hidden"], 2)
        self.assertEqual(self.build(self.admin, "company")["hidden"], 0)

    def fill(self, n):
        for _ in range(n):
            self.initiative(self.csm, cut=self.csm)
            self.initiative(self.mona)
            self.plan(self.pizza, milestones=(True, False))
            self.plan(self.emea)
            self.night(self.rule(self.csm), fired=1, records=(self.pizza,))
            self.night(self.rule(self.mona), fired=1)

    def queries(self):
        reader, scope = self.reader_and_scope(self.mona, "team")
        with CaptureQueriesContext(connection) as captured:
            doing.build(reader, scope, self.today)
        return captured.captured_queries

    def test_the_query_count_does_not_grow_with_the_items(self):
        self.fill(1)
        few = self.queries()
        self.fill(5)
        many = self.queries()
        self.assertEqual(len(few), len(many))
        for query in many:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
```

`services/brain/tests/test_api_doing.py`:

```python
"""`doing/` over HTTP (spec §1.4, §3)."""

from rest_framework.test import APIClient

from services.brain.tests.doing_fixtures import DoingFixture

DOING = "/api/v1/brain/doing/"


class DoingApiTests(DoingFixture):
    def test_the_contract_shape(self):
        self.initiative(self.csm, cut=self.csm)
        self.plan(self.pizza)
        self.night(self.rule(self.csm), fired=1)
        body = self.as_user(self.mona).get(f"{DOING}?scope=team").json()
        self.assertEqual(
            set(body), {"scope", "currency", "hidden", "trackable", "initiatives", "plans", "rules"}
        )
        self.assertEqual(
            (len(body["initiatives"]), len(body["plans"]), len(body["rules"])), (1, 1, 1)
        )

    def test_no_scope_reads_the_default(self):
        self.assertEqual(self.as_user(self.mona).get(DOING).json()["scope"], "team")
        self.assertEqual(self.as_user(self.csm).get(DOING).json()["scope"], "me")
        self.assertEqual(self.as_user(self.lee).get(DOING).json()["scope"], "company")

    def test_scope_refusals(self):
        response = self.as_user(self.csm).get(f"{DOING}?scope=team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(), {"code": "SCOPE_NOT_ALLOWED", "detail": "You can't see that view."}
        )
        response = self.as_user(self.csm).get(f"{DOING}?scope=everyone")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "SCOPE_UNKNOWN")

    def test_anonymous_is_refused(self):
        self.assertEqual(APIClient().get(DOING).status_code, 401)

    def test_another_tenant_sees_none_of_ours(self):
        self.initiative(self.csm, cut=self.csm)
        self.plan(self.pizza)
        self.rule(self.csm)
        body = self.as_user(self.stranger).get(f"{DOING}?scope=me").json()
        self.assertEqual(
            (body["initiatives"], body["plans"], body["rules"], body["hidden"]), ([], [], [], 0)
        )
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_doing services.brain.tests.test_api_doing --parallel --noinput`
Expected: FAIL/ERROR: `rule_items` and `build` don't exist, and `doing/` is a 404.

- [ ] **Step 4: Share the rules' tallies**

In `services/rules/payloads.py`, rename `def _tallies(run_ids, viewer):` to `def tallies(run_ids, viewer):`. In `runs_page`, the result of the one call is held in a local that was also called `tallies`; rename that local to `counted` so it doesn't shadow the function:

```python
    counted = tallies([run.pk for run in page], viewer)
    ...
        tally = counted.get(run.pk, {"total": 0, "seen": 0, "seen_fired": 0})
```

Run: `grep -rn "_tallies" services/rules` → only `invite_tallies` in surveys remains elsewhere; nothing in rules.

- [ ] **Step 5: Write the Rules section and `build`**

In `services/brain/doing.py`, add the imports:

```python
from services.rules.access import readable_rules
from services.rules.models import Rule, RuleRun
from services.rules.payloads import tallies

from .initiatives import edited_as, trackable
```

Append:

```python
# ── Rules at work ────────────────────────────────────────────────────────


def rules_in(reader, scope):
    """Rules owned by someone on the desk (Company: every rule)."""
    rules = Rule.objects.filter(organisation_id=reader.organisation_id)
    owners = owners_of(scope)
    return rules if owners is None else rules.filter(owner_id__in=owners)


def _skipped(run):
    return sum(int(n) for n in (run.skipped or {}).values())


def _rule(rule, reader, readable, run, seen):
    mine = rule.owner_id == reader.pk
    last_run = None
    if run is not None:
        if mine:
            last_run = {
                "run_on": run.run_on.isoformat(),
                "fired": run.fired,
                "matched": run.matched,
                "skipped": _skipped(run),
            }
        else:
            last_run = {
                "run_on": run.run_on.isoformat(),
                "fired": seen.get(run.pk, {}).get("seen_fired", 0),
            }
    return {
        "id": rule.pk,
        "name": rule.name,
        "segment": rule.segment.name if rule.segment_id else None,
        "is_active": rule.is_active,
        "paused_reason": rule.paused_reason or None,
        "paused_message": Rule.Paused(rule.paused_reason).label if rule.paused_reason else None,
        "mine": mine,
        "readable": readable,
        "last_run": last_run,
    }


def rule_items(reader, rules):
    """Rows: active first, then by name; each with its latest night. The
    reader's own rules carry every count; anyone else's only what fired
    among the records the reader may open now (runs_page's rule). A fixed
    number of queries: the rules with their latest run id, which the reader
    may read, the runs, the tallies."""
    latest = RuleRun.objects.filter(rule_id=OuterRef("pk")).order_by("-run_on", "-pk").values("pk")
    rows = list(
        rules.select_related("segment")
        .annotate(latest_run=Subquery(latest[:1]))
        .order_by("-is_active", "name", "id")[:LIMIT]
    )
    if not rows:
        return []
    readable = set(
        readable_rules(reader).filter(pk__in=[r.pk for r in rows]).values_list("pk", flat=True)
    )
    runs = RuleRun.objects.in_bulk([r.latest_run for r in rows if r.latest_run is not None])
    # SOC2:AUTH-02 someone else's rule shows only what fired among the records
    # the reader may open now, never the record names or the full counts
    seen = tallies(
        [r.latest_run for r in rows if r.latest_run is not None and r.owner_id != reader.pk],
        reader,
    )
    return [_rule(r, reader, r.pk in readable, runs.get(r.latest_run), seen) for r in rows]


# ── The page ─────────────────────────────────────────────────────────────


def build(reader, scope, today):
    """`GET doing/`: the scope's initiatives, plans and rules, each naming
    only what the reader may open; `hidden` is the scope's plans they can't."""
    plans, hidden = plan_section(reader, scope, today)
    return {
        "scope": scope.key,
        "currency": reader.organisation.currency,
        "hidden": hidden,
        "trackable": trackable(),
        "initiatives": initiative_items(
            reader, initiatives_in(reader, scope, today), Figures(reader.organisation), today
        ),
        "plans": plans,
        "rules": rule_items(reader, rules_in(reader, scope)),
    }
```

- [ ] **Step 6: Add the route**

In `services/brain/views.py`, change `from . import briefs, changed, explanations, waiting` to `from . import briefs, changed, doing, explanations, waiting` and append:

```python
class DoingView(BrainView):
    """GET /api/v1/brain/doing/?scope= — what is being done about the
    scope's numbers: its initiatives, plans and rules at work, each naming
    only what the reader may open (plans they can't are counted in
    `hidden`)."""

    def get(self, request):
        scope = self.scope(request)
        return Response(doing.build(request.user, scope, timezone.localdate()))
```

In `services/brain/urls.py` add:

```
    path("doing/", views.DoingView.as_view(), name="brain-doing"),
```

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.brain services.rules --parallel --noinput`
Expected: PASS, including the 1-vs-6 query test and the DISTINCT check.

- [ ] **Step 8: Commit**

```bash
git add services/rules/payloads.py services/brain/doing.py services/brain/views.py services/brain/urls.py \
  services/brain/tests/doing_fixtures.py services/brain/tests/test_doing.py services/brain/tests/test_api_doing.py
git commit -m "feat(brain): GET doing/?scope= with the rules at work on the desk's books

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Initiatives for everyone: `POST`/`PATCH initiatives/` and their audit

**Files:**
- Modify: `services/metrics/initiatives.py` (`CLOSED`, `closed_at_after`)
- Modify: `services/metrics/serializers.py` (`InitiativeSerializer.update`)
- Modify: `services/metrics/views.py` (`_InitiativeViewMixin` audit)
- Modify: `services/brain/initiatives.py` (forms, `start`, `edit`, messages)
- Modify: `services/brain/views.py`, `services/brain/urls.py`
- Test: `services/brain/tests/test_api_doing.py` (add `InitiativeStartTests`, `InitiativeEditTests`)
- Test: `services/metrics/tests/test_initiatives.py` (add the Company audit test)

**Interfaces:**
- Consumes: `metrics.initiatives.create_initiative(organisation, created_by, **fields)`, `edited_as` (Task 2), `doing.initiative_payload(reader, pk, today)` (Task 2), `core.audit.record`, `ScopeNotAllowed.code`.
- Produces:
  - `services.metrics.initiatives.CLOSED`, `closed_at_after(initiative, new_status, now)`
  - `services.brain.initiatives.NotTrackable`, `start(reader, scope, data, *, request=None) -> Initiative`, `edit(initiative, data, *, edited_as, request=None) -> Initiative`
  - messages `NOT_TRACKABLE`, `NOT_EDITOR`, `COMPANY_ELSEWHERE`, `NOT_BELOW`, `LOCKED_FIELD`
  - `POST /api/v1/brain/initiatives/?scope=` (`brain-initiatives`), `PATCH /api/v1/brain/initiatives/<id>/` (`brain-initiative`)
  - audit `initiative.created` (`scope`, `metric`, `for_user` on the brain route; `scope`, `metric` on Company) and `initiative.updated` (`scope`, `fields`)

- [ ] **Step 1: Write the failing tests**

Append to `services/brain/tests/test_api_doing.py` (imports: `from datetime import timedelta`, `from core.models import AuditEvent`, `from services.brain import initiatives as say`, `from services.metrics.models import Initiative`, `from services.metrics.signals import number`):

```python
INITIATIVES = "/api/v1/brain/initiatives/"


class InitiativeStartTests(DoingFixture):
    def body(self, **extra):
        return {
            "title": "Halve my ARR at risk",
            "hypothesis": "If we run a save play on Dough Co, then ARR at risk halves.",
            "metric": "at_risk_arr",
            "target_value": "0",
            "target_by": (self.today + timedelta(days=60)).isoformat(),
            **extra,
        }

    def post(self, user, scope="me", **extra):
        return self.as_user(user).post(f"{INITIATIVES}?scope={scope}", self.body(**extra),
                                       format="json")  # fmt: skip

    def test_me_starts_one_on_my_own_book(self):
        response = self.post(self.csm)
        self.assertEqual(response.status_code, 201, response.json())
        body = response.json()
        self.assertEqual(
            body["for"], {"dimension": "owner", "member": str(self.csm.pk), "label": "Carl CSM"}
        )
        self.assertEqual(body["owner"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertTrue(body["can_edit"])
        row = Initiative.objects.get(pk=body["id"])
        self.assertEqual(
            (row.created_by, row.owner, row.dimension, row.member, row.status),
            (self.csm, self.csm, "owner", str(self.csm.pk), "active"),
        )
        self.assertEqual(row.baseline_as_of, self.today)
        self.assertEqual(body["progress"]["baseline"], number(row.baseline_value))
        event = AuditEvent.objects.get(action="initiative.created")
        self.assertEqual(
            event.metadata, {"scope": "me", "metric": "at_risk_arr", "for_user": self.csm.pk}
        )
        self.assertEqual(event.target_repr, f"Initiative {row.pk}")

    def test_me_ignores_for_user(self):
        body = self.post(self.csm, for_user=self.other.pk).json()
        self.assertEqual(body["owner"]["id"], self.csm.pk)

    def test_my_team_starts_one_for_someone_below_me(self):
        response = self.post(self.mona, "team", for_user=self.csm.pk)
        self.assertEqual(response.status_code, 201, response.json())
        row = Initiative.objects.get(pk=response.json()["id"])
        self.assertEqual((row.owner, row.created_by, row.member), (self.csm, self.mona,
                                                                    str(self.csm.pk)))  # fmt: skip
        self.assertEqual(AuditEvent.objects.get(action="initiative.created").metadata["scope"],
                         "team")  # fmt: skip

    def test_my_team_defaults_to_my_own_book(self):
        body = self.post(self.mona, "team").json()
        self.assertEqual(body["owner"]["id"], self.mona.pk)

    def test_my_team_refuses_anyone_not_below_me(self):
        for someone in (self.other, self.stranger, self.admin):
            response = self.post(self.mona, "team", for_user=someone.pk)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json(), {"for_user": [say.NOT_BELOW]})
        self.assertFalse(Initiative.objects.exists())

    def test_a_number_without_an_owner_cut_is_refused(self):
        response = self.post(self.csm, metric="coverage")
        self.assertEqual(
            (response.status_code, response.json()), (400, {"detail": say.NOT_TRACKABLE})
        )
        response = self.post(self.csm, metric="nope")
        self.assertEqual(response.status_code, 400)
        self.assertIn("metric", response.json())

    def test_a_past_date_is_refused(self):
        response = self.post(self.csm, target_by=(self.today - timedelta(days=1)).isoformat())
        self.assertEqual(response.status_code, 400)
        self.assertIn("target_by", response.json())

    def test_company_is_started_elsewhere(self):
        for path in (f"{INITIATIVES}?scope=company", INITIATIVES):
            response = self.as_user(self.admin).post(path, self.body(), format="json")
            self.assertEqual(response.status_code, 403)
            self.assertEqual(
                response.json(), {"code": "SCOPE_NOT_ALLOWED", "detail": say.COMPANY_ELSEWHERE}
            )

    def test_a_scope_i_dont_have_is_refused(self):
        response = self.post(self.csm, "team")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["detail"], "You can't see that view.")

    def test_anonymous_is_refused(self):
        self.assertEqual(APIClient().post(INITIATIVES, {}, format="json").status_code, 401)


class InitiativeEditTests(DoingFixture):
    def setUp(self):
        self.mine = self.initiative(self.csm, cut=self.csm)

    def patch(self, user, initiative, body):
        return self.as_user(user).patch(f"{INITIATIVES}{initiative.pk}/", body, format="json")

    def test_the_owner_their_chain_and_company_may_edit(self):
        for user, as_ in ((self.csm, "me"), (self.mona, "team"), (self.admin, "company")):
            response = self.patch(user, self.mine, {"title": f"By {user.name}"})
            self.assertEqual(response.status_code, 200, response.json())
            self.assertEqual(response.json()["title"], f"By {user.name}")
            event = AuditEvent.objects.filter(action="initiative.updated").latest("id")
            self.assertEqual(event.metadata, {"scope": as_, "fields": ["title"]})
            self.assertEqual(event.target_repr, f"Initiative {self.mine.pk}")

    def test_anyone_else_is_refused(self):
        for user in (self.other, self.lee):
            response = self.patch(user, self.mine, {"title": "Mine now"})
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json(), {"detail": say.NOT_EDITOR})
        self.mine.refresh_from_db()
        self.assertEqual(self.mine.title, "Halve ARR at risk")
        self.assertFalse(AuditEvent.objects.filter(action="initiative.updated").exists())

    def test_an_initiative_with_no_owner_is_company_only(self):
        unowned = self.initiative(None, cut=self.csm)
        self.assertEqual(self.patch(self.csm, unowned, {"title": "x"}).status_code, 403)
        self.assertEqual(self.patch(self.admin, unowned, {"title": "x"}).status_code, 200)

    def test_another_tenant_gets_a_404(self):
        self.assertEqual(self.patch(self.stranger, self.mine, {"title": "x"}).status_code, 404)

    def test_closing_stamps_and_reopening_clears(self):
        self.patch(self.csm, self.mine, {"status": "done", "outcome": "Saved Dough Co."})
        self.mine.refresh_from_db()
        closed_at = self.mine.closed_at
        self.assertIsNotNone(closed_at)
        self.patch(self.csm, self.mine, {"status": "abandoned"})
        self.mine.refresh_from_db()
        self.assertEqual(self.mine.closed_at, closed_at)
        self.patch(self.csm, self.mine, {"status": "active"})
        self.mine.refresh_from_db()
        self.assertIsNone(self.mine.closed_at)

    def test_what_it_tracks_cant_be_changed_here(self):
        response = self.patch(self.csm, self.mine, {"metric": "nrr", "owner_id": self.other.pk})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(), {"metric": [say.LOCKED_FIELD], "owner_id": [say.LOCKED_FIELD]}
        )

    def test_a_patch_that_changes_nothing_records_nothing(self):
        response = self.patch(self.csm, self.mine, {"title": "Halve ARR at risk"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(AuditEvent.objects.filter(action="initiative.updated").exists())
```

Append to `InitiativeAPITests` in `services/metrics/tests/test_initiatives.py` (import `from core.models import AuditEvent`):

```python
    def test_company_creates_and_edits_are_audited(self):
        created = self._post().data
        event = AuditEvent.objects.get(action="initiative.created")
        self.assertEqual(event.metadata, {"scope": "company", "metric": "at_risk_arr"})
        self.assertEqual(event.target_repr, f"Initiative {created['id']}")
        self.client.patch(f"{self.url}{created['id']}/", {"title": "Halve it"}, format="json")
        self.assertEqual(
            AuditEvent.objects.get(action="initiative.updated").metadata,
            {"scope": "company", "fields": ["title"]},
        )
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `venv/bin/python manage.py test services.brain.tests.test_api_doing services.metrics.tests.test_initiatives --parallel --noinput`
Expected: FAIL. `initiatives/` is a 404 and no `initiative.*` audit rows exist.

- [ ] **Step 3: Share the closing rule**

In `services/metrics/initiatives.py`, append:

```python
CLOSED = ("done", "abandoned")


def closed_at_after(initiative, new_status, now):
    """`closed_at` once `initiative` moves to `new_status`: stamped `now` when
    it closes, kept while it stays closed, cleared when it reopens. The one
    rule for /metrics/initiatives/ and the Brain's PATCH."""
    if new_status not in CLOSED:
        return None
    return initiative.closed_at if initiative.status in CLOSED else now
```

In `services/metrics/serializers.py`, replace the body of `InitiativeSerializer.update` with:

```python
    def update(self, instance, validated_data):
        validated_data["closed_at"] = initiatives.closed_at_after(
            instance, validated_data.get("status", instance.status), timezone.now()
        )
        return super().update(instance, validated_data)
```

- [ ] **Step 4: Audit the Company routes**

In `services/metrics/views.py`, add to `_InitiativeViewMixin` (`audit` and `COMPANY_SCOPE` are already imported):

```
    def perform_create(self, serializer):
        initiative = serializer.save()
        audit.record(  # SOC2:LOG-01
            "initiative.created",
            request=self.request,
            target=initiative,
            target_repr=f"Initiative {initiative.pk}",
            metadata={"scope": COMPANY_SCOPE, "metric": initiative.metric},
        )

    def perform_update(self, serializer):
        before = {name: getattr(serializer.instance, name) for name in serializer.validated_data}
        initiative = serializer.save()
        fields = sorted(name for name, old in before.items() if getattr(initiative, name) != old)
        if fields:
            audit.record(  # SOC2:LOG-01
                "initiative.updated",
                request=self.request,
                target=initiative,
                target_repr=f"Initiative {initiative.pk}",
                metadata={"scope": COMPANY_SCOPE, "fields": fields},
            )
```

- [ ] **Step 5: Write the brain create and edit paths**

In `services/brain/initiatives.py`, extend the imports:

```python
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from core import audit
from services.accounts.models import User
from services.metrics.initiatives import closed_at_after, create_initiative
from services.metrics.models import Initiative
from services.metrics.registry import BY_KEY, METRICS, OWNER
```

Append:

```python
NOT_TRACKABLE = "That number can't be tracked for one person's book."
NOT_EDITOR = "You can't change this initiative."
COMPANY_ELSEWHERE = "Company initiatives are started from the Company initiatives page."
NOT_BELOW = "Choose yourself or someone below you."
LOCKED_FIELD = "This can't be changed here."
#: What a Brain edit may not change: what the initiative tracks, and whose it is.
LOCKED = ("metric", "dimension", "member", "owner_id", "for_user")


class NotTrackable(Exception):
    """The metric has no owner cut."""


class InitiativeForm(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    hypothesis = serializers.CharField(allow_blank=True, default="")
    metric = serializers.CharField(max_length=64)
    target_value = serializers.DecimalField(max_digits=18, decimal_places=4)
    target_by = serializers.DateField()
    status = serializers.ChoiceField(
        choices=Initiative.Status.choices, default=Initiative.Status.ACTIVE
    )
    for_user = serializers.IntegerField(required=False, allow_null=True)

    def validate_metric(self, key):
        if key not in BY_KEY:
            raise serializers.ValidationError(f"No metric called {key!r}.")
        return key

    def validate_target_by(self, day):
        if day < timezone.localdate():
            raise serializers.ValidationError("The target date is in the past.")
        return day


class InitiativeEdit(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    hypothesis = serializers.CharField(allow_blank=True, required=False)
    target_value = serializers.DecimalField(max_digits=18, decimal_places=4, required=False)
    target_by = serializers.DateField(required=False)
    status = serializers.ChoiceField(choices=Initiative.Status.choices, required=False)
    outcome = serializers.CharField(allow_blank=True, required=False)

    def validate(self, attrs):
        locked = [name for name in LOCKED if name in self.initial_data]
        if locked:
            raise serializers.ValidationError({name: [LOCKED_FIELD] for name in locked})
        return attrs


def book_person(reader, scope, user_id):
    """Whose book a new initiative is on: the reader in Me; in My team the
    reader or someone below them."""
    if scope.key == ME or user_id is None or user_id == reader.pk:
        return reader
    # SOC2:AUTH-02 My team starts initiatives only on the reader's own book or
    # the book of someone below them, in their own organisation
    found = None
    if user_id in subtree_ids(reader):
        found = User.objects.filter(
            pk=user_id, organisation_id=reader.organisation_id, is_active=True
        ).first()
    if found is None:
        raise ValidationError({"for_user": [NOT_BELOW]})
    return found


def start(reader, scope, data, *, request=None):
    """A new initiative on one person's book, tracking the owner cut of a
    metric that has one. Through `create_initiative`, so the baseline is
    captured as every initiative's is. Raises ValidationError or
    NotTrackable."""
    form = InitiativeForm(data=data)
    form.is_valid(raise_exception=True)
    values = dict(form.validated_data)
    wanted = values.pop("for_user", None)
    if OWNER not in BY_KEY[values["metric"]].slices:
        raise NotTrackable(values["metric"])
    person = book_person(reader, scope, wanted)
    initiative = create_initiative(
        reader.organisation,
        reader,
        dimension=OWNER,
        member=str(person.pk),
        member_label=person.name,
        owner=person,
        **values,
    )
    audit.record(  # SOC2:LOG-01
        "initiative.created",
        request=request,
        target=initiative,
        target_repr=f"Initiative {initiative.pk}",
        metadata={"scope": scope.key, "metric": initiative.metric, "for_user": person.pk},
    )
    return initiative


def edit(initiative, data, *, edited_as, request=None):
    """Applies an edit the caller has already allowed (`edited_as`). A PATCH
    that changes nothing writes and records nothing."""
    form = InitiativeEdit(data=data)
    form.is_valid(raise_exception=True)
    changes = {
        name: value
        for name, value in form.validated_data.items()
        if getattr(initiative, name) != value
    }
    if not changes:
        return initiative
    if "status" in changes:
        initiative.closed_at = closed_at_after(initiative, changes["status"], timezone.now())
    for name, value in changes.items():
        setattr(initiative, name, value)
    initiative.save()
    audit.record(  # SOC2:LOG-01
        "initiative.updated",
        request=request,
        target=initiative,
        target_repr=f"Initiative {initiative.pk}",
        metadata={"scope": edited_as, "fields": sorted(changes)},
    )
    return initiative
```

The `metrics.registry` import line becomes `from services.metrics.registry import BY_KEY, METRICS, OWNER`. Keep the existing `subtree_ids`, `sees_everything` and `.scope` imports.

- [ ] **Step 6: Add the routes**

In `services/brain/views.py`, add the imports:

```python
from django.shortcuts import get_object_or_404

from services.metrics.models import Initiative

from . import initiatives
```

(`from . import briefs, changed, doing, explanations, initiatives, waiting` in one line.) Append:

```python
class InitiativeCreateView(BrainView):
    """POST /api/v1/brain/initiatives/?scope=me|team — an initiative on one
    person's book (the reader's in Me; the reader's or a report's in My
    team), tracking the owner cut of a metric that has one. Company
    initiatives stay on /api/v1/metrics/initiatives/."""

    def post(self, request):
        scope = self.scope(request)
        if scope.is_company:
            return Response(
                {"code": ScopeNotAllowed.code, "detail": initiatives.COMPANY_ELSEWHERE},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            row = initiatives.start(request.user, scope, request.data, request=request)
        except initiatives.NotTrackable:
            return Response(
                {"detail": initiatives.NOT_TRACKABLE}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            doing.initiative_payload(request.user, row.pk, timezone.localdate()),
            status=status.HTTP_201_CREATED,
        )


class InitiativeDetailView(BrainView):
    """PATCH /api/v1/brain/initiatives/<id>/ — the initiative's owner, anyone
    above them, or view_all_accounts (`initiatives.edited_as`); anyone else
    in the organisation 403, another organisation's 404."""

    def patch(self, request, pk):
        initiative = get_object_or_404(
            Initiative.objects.filter(organisation_id=request.user.organisation_id), pk=pk
        )
        # SOC2:AUTH-02 the same rule every row's can_edit asks
        edited_as = initiatives.edited_as(request.user, initiative)
        if edited_as is None:
            return Response({"detail": initiatives.NOT_EDITOR}, status=status.HTTP_403_FORBIDDEN)
        initiatives.edit(initiative, request.data, edited_as=edited_as, request=request)
        return Response(doing.initiative_payload(request.user, initiative.pk, timezone.localdate()))
```

In `services/brain/urls.py` add:

```
    path("initiatives/", views.InitiativeCreateView.as_view(), name="brain-initiatives"),
    path(
        "initiatives/<int:pk>/", views.InitiativeDetailView.as_view(), name="brain-initiative"
    ),
```

- [ ] **Step 7: Run the tests**

Run: `venv/bin/python manage.py test services.brain services.metrics --parallel --noinput`
Expected: PASS. The existing `/metrics/initiatives/` closing tests still pass on `closed_at_after`.

- [ ] **Step 8: Commit**

```bash
git add services/metrics/initiatives.py services/metrics/serializers.py services/metrics/views.py \
  services/metrics/tests/test_initiatives.py services/brain/initiatives.py services/brain/views.py \
  services/brain/urls.py services/brain/tests/test_api_doing.py
git commit -m "feat(brain): anyone may start an initiative on their own book; owner, chain or company edit it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: End-to-end journeys and docs

**Files:**
- Test: `services/brain/tests/test_doing_e2e.py` (create)
- Modify: `docs/API_CONTRACTS.md` (brain section, after `waiting/count/`)
- Modify: `docs/audit-events.md` (after `proposal.approved`)
- Modify: `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`

**Interfaces:**
- Consumes: every route above, `POST /api/v1/plans/` (`{"template", "customer"}`), `DoingFixture` makers.
- Produces: nothing new in code.

- [ ] **Step 1: Write the journeys**

`services/brain/tests/test_doing_e2e.py`:

```python
"""End to end over HTTP: the four journeys the plan names. A CSM starts an
initiative on their own ARR at risk and their manager sees it in My team; a
plan started now shows then → now while an old one has no starting figures;
non-owners see only a rule's fired count; a member can't edit someone else's
initiative outside their chain."""

from datetime import timedelta
from decimal import Decimal

from services.brain.tests.doing_fixtures import DoingFixture
from services.customers.models import Customer
from services.metrics.models import Initiative
from services.plans.models import Plan, PlanTemplate
from services.rules.models import empty_skips

DOING = "/api/v1/brain/doing/"
INITIATIVES = "/api/v1/brain/initiatives/"
PLANS = "/api/v1/plans/"


class DoingEndToEndTests(DoingFixture):
    def start_mine(self):
        response = self.as_user(self.csm).post(
            f"{INITIATIVES}?scope=me",
            {
                "title": "Halve my ARR at risk",
                "hypothesis": "If Dough Co gets a save play, my ARR at risk halves.",
                "metric": "at_risk_arr",
                "target_value": "0",
                "target_by": (self.today + timedelta(days=60)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.json())
        return response.json()

    def test_a_csm_starts_one_on_their_own_arr_at_risk_and_their_manager_sees_it(self):
        made = self.start_mine()
        self.assertEqual(made["metric_label"], "ARR at risk")
        # Dough Co is Carl's, in poor health and renewing in 30 days.
        self.assertGreater(made["progress"]["baseline"], 0)
        mine = self.as_user(self.csm).get(f"{DOING}?scope=me").json()["initiatives"]
        self.assertEqual([row["id"] for row in mine], [made["id"]])
        team = self.as_user(self.mona).get(f"{DOING}?scope=team").json()["initiatives"]
        (seen,) = [row for row in team if row["id"] == made["id"]]
        self.assertEqual(seen["for"]["label"], "Carl CSM")
        self.assertTrue(seen["can_edit"])
        self.assertEqual(
            self.as_user(self.other).get(f"{DOING}?scope=me").json()["initiatives"], []
        )

    def test_a_member_cant_edit_someone_elses_initiative_outside_their_chain(self):
        made = self.start_mine()
        path = f"{INITIATIVES}{made['id']}/"
        response = self.as_user(self.other).patch(path, {"status": "abandoned"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json(), {"detail": "You can't change this initiative."})
        self.assertEqual(Initiative.objects.get(pk=made["id"]).status, "active")
        closed = self.as_user(self.mona).patch(
            path, {"status": "done", "outcome": "Dough Co renewed."}, format="json"
        )
        self.assertEqual(closed.status_code, 200, closed.json())
        self.assertEqual((closed.json()["status"], closed.json()["outcome"]),
                         ("done", "Dough Co renewed."))  # fmt: skip

    def test_a_plan_started_now_shows_then_and_now_and_an_old_one_has_none(self):
        old = Plan.objects.create(
            organisation=self.org,
            customer=self.pizza,
            name="Old QBR",
            kind="qbr",
            owner=self.csm,
            start_date=self.today - timedelta(days=20),
            target_date=self.today + timedelta(days=10),
            status="on_track",
        )
        carl = self.as_user(self.csm)
        save = PlanTemplate.objects.get(is_builtin=True, kind="save")
        started = carl.post(PLANS, {"template": save.pk, "customer": self.dough.pk}, format="json")
        self.assertEqual(started.status_code, 201, started.content)
        Customer.objects.filter(pk=self.dough.pk).update(health_score=Decimal("4.5"))
        plans = {row["id"]: row for row in carl.get(f"{DOING}?scope=me").json()["plans"]}
        new = plans[started.json()["id"]]
        self.assertEqual(
            new["then"], {"health_score": 2.0, "arr": 100000.0, "taken_on": self.today.isoformat()}
        )
        self.assertEqual(new["now"], {"health_score": 4.5, "arr": 100000.0})
        self.assertIsNone(plans[old.pk]["then"])
        self.assertEqual(plans[old.pk]["now"], {"health_score": 8.0, "arr": 300000.0})

    def test_non_owners_see_only_a_rules_fired_count(self):
        rule = self.rule(self.csm)
        self.night(rule, fired=2, matched=12, skipped={**empty_skips(), "cooldown": 2},
                   records=(self.pizza, self.dough))  # fmt: skip
        (mine,) = self.as_user(self.csm).get(f"{DOING}?scope=me").json()["rules"]
        self.assertEqual(
            mine["last_run"],
            {"run_on": self.today.isoformat(), "fired": 2, "matched": 12, "skipped": 2},
        )
        (theirs,) = self.as_user(self.mona).get(f"{DOING}?scope=team").json()["rules"]
        self.assertEqual((theirs["mine"], theirs["readable"]), (False, False))
        self.assertEqual(theirs["last_run"], {"run_on": self.today.isoformat(), "fired": 2})
        company = self.as_user(self.lee).get(f"{DOING}?scope=company").json()["rules"]
        (seen,) = [row for row in company if row["id"] == rule.pk]
        self.assertEqual(seen["last_run"], {"run_on": self.today.isoformat(), "fired": 0})
```

- [ ] **Step 2: Run them**

Run: `venv/bin/python manage.py test services.brain.tests.test_doing_e2e --parallel --noinput`
Expected: PASS. A failure here is a bug in Tasks 1–5: fix it there, not in this test.

- [ ] **Step 3: API contract**

In `docs/API_CONTRACTS.md`, rename the section heading `## \`brain\` — Scopes and What changed (\`/brain\`)` to `## \`brain\` — Scopes, What changed, Waiting on you and What's being done (\`/brain\`)`. After the `### \`GET /api/v1/brain/waiting/count/\`` block (before the `---` that opens `segments`), add:

````markdown
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
  whole-company initiative. `work.open`/`done` count every task;
  `work.tasks` lists only the tasks the reader may read, on records they
  may open (the `/metrics/initiatives/` row shape). `can_edit`: the owner,
  anyone above them, or `view_all_accounts`.
- **Plans**: on the desk's customers and on accounts the desk owns or
  that sit under a desk customer (Company: every plan); open ones by
  status (at risk first) and soonest target, then those done or cancelled
  in the last 30 days. `then` is the record's figures when the plan
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
default, or someone below them; ignored in Me). The initiative tracks that
person's owner cut (`dimension=owner`), is owned by them and created by the
reader; its baseline is captured as every initiative's is. 201 with the
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
````

In the `metrics` section, under the `/metrics/initiatives/` description, add one line: "Create and PATCH are audited (`initiative.created`, `initiative.updated`, `scope: "company"`)."

- [ ] **Step 4: Audit catalogue**

In `docs/audit-events.md`, after the `proposal.approved` row add:

```markdown
| `initiative.created` | `services.brain.initiatives.start` (`POST /brain/initiatives/`) and `services.metrics.views.InitiativeListCreateView` | user | Initiative (`target_repr` "Initiative <id>", never the title) | `scope` (`me`, `team` or `company`), `metric`; from the Brain also `for_user` (whose book) |
| `initiative.updated` | `services.brain.initiatives.edit` (`PATCH /brain/initiatives/<id>/`) and `services.metrics.views.InitiativeDetailView` (PATCH) | user | Initiative | `scope`: from the Brain, how the editor was allowed (`me` the owner, `team` above the owner, `company` view_all_accounts); `company` from `/metrics/`; `fields`: the changed field names only; a PATCH that changes nothing records nothing |
```

In the `plan.started` row, append to its metadata cell: "; the plan keeps the record's health score and ARR (`start_figures`), which are figures, not personal data, and are not audited."

- [ ] **Step 5: Schema, PRD, TRD**

`docs/product/05-backend-schema.md`: in the `Plan` row, after `done_at` add "`start_figures` (JSON, null: `{health_score, arr, currency, taken_on}` when the plan started; null for plans from before 2026-10-05; written once by `plans.starting`)". Add migration `plans 0003_plan_start_figures` wherever that file lists migrations per app.

`docs/product/01-prd.md`:
- After the "Brain: Waiting on you" feature row add:
  `| Brain: What's being done (Me / My team / Company) | Built (backend) | Initiatives, plans (health and ARR then → now) and rules at work on the scope's books; anyone may start an initiative on their own book; only records the reader may open (the rest counted) |`
- In the roles table, CSM row: append ", What's being done (their own initiatives)".
- Changelog: `| 2026-10-05 | Brain delivery 3: What's being done (backend); initiatives for everyone; plans keep their starting figures |`

`docs/product/02-trd.md`: after the `services/brain/waiting.py` row add:

```markdown
| `services/brain/doing.py` | What's being done: a scope's initiatives, plans and rules, each named only for what the reader may open; plans they can't are `hidden` |
| `services/brain/initiatives.py` | Initiatives for everyone: owner-cut metrics, `edited_as` (owner, chain, view_all_accounts), the Brain create and edit paths |
| `services/plans/figures.py` | A record's health score and ARR as the app reads them; `Plan.start_figures` |
```

Update the migration count in "Fourteen apps plus `core`, N migrations": recount with `ls services/*/migrations/0*.py core/migrations/0*.py | wc -l` and write that number.

- [ ] **Step 6: Full verification**

Run each, one at a time:

```bash
venv/bin/python manage.py test services.brain services.plans services.metrics services.rules --parallel --noinput
venv/bin/ruff check .
venv/bin/ruff format --check .
venv/bin/python manage.py makemigrations --check --dry-run
venv/bin/python scripts/ci_shard_labels.py --check 4
```

Expected: all tests pass; ruff clean (run `venv/bin/ruff format docs/API_CONTRACTS.md` if it reflows the JSON block); "No changes detected"; the shard check passes with the new test modules.

- [ ] **Step 7: Commit**

```bash
git add services/brain/tests/test_doing_e2e.py docs/API_CONTRACTS.md docs/audit-events.md \
  docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md
git commit -m "docs(brain): What's being done contracts, initiative audit, start figures; e2e journeys

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.**
- §0: read and reused. `create_initiative`, `progress()`, `Figures`, `work`, `visible_plans`, `runs_page`'s rule (as `tallies`) and `readable_rules`.
- Decision 1 (three sections, each on the scope's book): Tasks 2–4, `build`.
- Decision 2 (initiatives per scope): Task 2 `initiatives_in`.
- Decision 3 (anyone starts one on their own book; Company stays `view_all_accounts`; owner/above/`view_all_accounts` edit): Task 5, plus `edited_as` in Task 2.
- Decision 4 (plans keep starting figures; then → now; null for old ones): Tasks 1 and 3.
- Decision 5 (rules at work; non-owners see fired only): Task 4.
- Decision 6 (Knowledge by function in Company): no backend change (plan Decision 12).
- Decision 7 (redirect): frontend only.
- §1.1: Task 1. §1.2: Tasks 2–4. §1.3: Task 5. §1.4: Tasks 4–5. §1.5: Task 5 (audit) and Task 6 (docs). §3: shapes in Tasks 2–5, additions listed under Contract notes.

**Placeholder scan.** Every code step has the code, and each task lists the exact imports it adds to the shared test module and `doing.py`.

**Type consistency.**
- `edited_as(reader, initiative, *, below=None, everything=None)` is used the same way in `doing.initiative_items` and `InitiativeDetailView`.
- `initiative_payload(reader, pk, today)` is used in both views.
- `plan_section` returns `(items, hidden)`, which `build` unpacks.
- `tallies(run_ids, viewer)` is renamed in `rules.payloads` and used in `rule_items`.
- `record_figures(record, organisation, rates=None)` is used in `start_figures` and `_plan`.
- The fixture makers' names (`initiative`, `plan`, `rule`, `night`, `reader_and_scope`) match across all tests.
