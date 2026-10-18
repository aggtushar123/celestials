# Agent bundles, delivery 1 (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every agent proposal becomes a bundle of ready-to-run steps: `AgentBundle`, steps on `AgentAction`, existing actions migrated to bundles of one, the nightly pass making bundles, the run route (claim lock, steps in order each in its own transaction, partial failure, retry, reject with a reason fed back to the agent, `{{step N.key}}` placeholders), the two new steps `survey.send` and `campaign.send`, and Work reading bundles (Mine, My team, Rest of company, History, the queue rail's counts, the badge and the "Bundles waiting" notice).

**Architecture:** A bundle is a thin parent row (`services/agents/models.py` `AgentBundle`); its steps are today's `AgentAction` rows with five new fields, so Approve's checks, Undo, rights, budgets and privacy filters carry over unchanged. Small single-purpose modules carry the new behaviour: `bundles.py` (bundle of one, status rules, read rule, stuck runs), `placeholders.py` (grammar, checks, filling, outputs), `bundle_payloads.py` (the contract's shapes), `bundle_run.py` (run, retry, reject) and `bundle_views.py` (the routes). Work swaps its `Approvals` source for a `Bundles` source over the same desk rule, adds a kind filter and Rest of company to the Team queue, and gains `queues.py` for the rail.

**Tech Stack:** Python 3.13, Django 5.2, DRF 3.18, Postgres 16 (CI/prod; local may be 15). Tests: `django.test`, `rest_framework.test`, `LiveServerTestCase` + `e2e/http.py`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-13-agent-bundles-design.md` (§3, §5, §6, §7.1, §7.2, §8; the D1 row of §11). **Binding contract:** `docs/superpowers/plans/2026-10-13-agent-bundles-d1-api.md` (this repo). Read the contract's "Decisions narrowing the spec" table (D1–D23) before any task; every decision is a requirement here.

## Global Constraints

- Work only in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/bundles-be` on branch `feat/agent-bundles`. Never merge, never open a PR, never touch the servers on ports 8000 or 5173 (the owner is using them).
- Python: the worktree's own venv if present, else `../work-two-be/venv/bin/python` (written `PY` below; e.g. `PY=../work-two-be/venv/bin/python`). Ruff: the same venv's `ruff`.
- Run tests as `$PY manage.py test <labels> --parallel auto --noinput`. Never the whole suite serially.
- Lint before each commit: `../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .` (`ruff format` also formats Python blocks inside Markdown; run `ruff format .` if the check fails, including on this plan and the docs).
- Every commit message is a conventional commit and ends with exactly `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Stage explicit paths (`git add <paths>`, `git rm` for deletions); never `git add -A` or `git add .`.
- **CI is blocked by GitHub billing:** local checks are the gate. A task is done only when its tests pass locally; the last task runs the full suite (`--parallel auto`), `makemigrations --check` and ruff.
- **Postgres 16:** no visibility rule may be a join made unique with `DISTINCT`; use `id IN (subquery)`. Every new list (feed, queues, history, detail) is covered by a DISTINCT-free assertion test (Task 16). Query counts are pinned in tests.
- Every visibility filter carries a `# SOC2:AUTH-02 ...` comment in the house style; every audited write `# SOC2:LOG-01`.
- **Twice-filter:** a bundle is read only by §8 of the contract (record openable or view-all for workspace-level, and no step a draft reply whose source the reader can't read); each step's preview by its kind's per-reader rule; rows the reader can't read are counted in `hidden`, never named. The rejection feedback to the agent carries the reason and the bundle title, never the note (D16).
- **Nothing real is sent.** Tests use Django's locmem mail backend (the test runner's default); survey and campaign steps call `claim` only (they queue invites/deliveries); no test calls `deliver_pending` or any network client. Anthropic calls are always patched (`services.agents.run.get_completion`).
- User-facing sentences are exactly the contract's (§9 and the per-section sentences). Reused sentences keep their existing constants.
- No new dependency. New migrations: `agents.0002_agent_bundle`, `metrics.0014_agent_action_steps`, `agents.0003_bundles_of_one`, `metrics.0015_agent_action_bundle_required`, `notifications.0014_bundles_waiting`. The local dev database is migrated only with the owner's OK (the owner's server on port 8000 uses it; Task 18).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `services/agents/kinds.py` | modify | `Kind` gains `irreversible`, `outside`, `editable`, `edit`, `outputs`; `FieldErrors`, `StepFailed` |
| `services/agents/policy.py` | modify | `level` reads Ask for an outside kind (D21) |
| `services/agents/settings_api.py` | modify | kinds rows gain `irreversible`, `outside`, `locked`; PATCH refuses auto/never on an outside kind |
| `services/agents/models.py` | modify | `AgentBundle` |
| `services/metrics/models.py` | modify | `AgentAction.bundle`, `position`, `selected`, `outputs`, `error`, `irreversible`; statuses `failed`, `skipped`; kinds `survey.send`, `campaign.send`; `save()` makes a bundle of one |
| `services/agents/migrations/0002_agent_bundle.py`, `0003_bundles_of_one.py` | create | the model; the data migration |
| `services/metrics/migrations/0014_agent_action_steps.py`, `0015_agent_action_bundle_required.py` | create | step fields; `bundle` non-null |
| `services/agents/bundles.py` | create | `bundle_of_one`, `routing_for`, `settle`, `outcome`, `live_waiting`, `settle_stuck`, `settle_stuck_all`, `readable`, `unreadable_bundle_ids` |
| `services/agents/placeholders.py` | create | `find`, `check`, `fill`, `NeedsStep`, `outputs_for`, `label` |
| `services/agents/bundle_payloads.py` | create | `bundle_payload`, `step_payload`, `irreversible_now`, `bundle_for` |
| `services/agents/payloads.py` | modify | `_preview`, `_undo` become `preview_for`, `undo_block`; `undo_block` knows `irreversible`; `action_payload` gains `bundle` |
| `services/agents/bundle_run.py` | create | `run_bundle`, `retry_step`, `reject_bundle`, `ran_sentence`, the refusals |
| `services/agents/bundle_views.py` | create | detail, run, retry, reject, history routes |
| `services/agents/urls.py` | modify | `bundles/...` routes |
| `services/agents/deciding.py` | modify | `approve`/`reject` settle the step's bundle |
| `services/agents/views.py` | modify | approve/reject → `409 USE_BUNDLE` |
| `services/agents/undo.py` | modify | undo notice link; irreversible refusal |
| `services/agents/run.py` | modify | one bundle per record per pass, Auto bundles, settle after expiries, placeholder checks, stuck runs |
| `services/agents/prompt.py` | modify | `PAYLOADS` for the two new kinds, the bundles paragraph |
| `services/agents/evidence.py` | modify | rejected-bundle lines per record (never quotable) |
| `services/agents/actions/tasks.py`, `notes.py`, `drafts.py`, `campaigns.py` | modify | `editable`, `edit`, `outputs` |
| `services/agents/actions/segments.py`, `scenarios.py`, `canvases.py`, `plan_starts.py`, `templates.py`, `initiatives.py` | modify | `outputs` |
| `services/agents/actions/surveys.py` | create | `survey.send` |
| `services/agents/actions/campaign_sends.py` | create | `campaign.send` |
| `services/agents/registry.py` | modify | the two kinds |
| `services/agents/builder.py` | modify | `audience_counts` |
| `services/surveys/audience.py` | modify | public `reach(kind, roles, viewer, members)` |
| `services/work/feed_shape.py`, `feed_decide.py`, `feed.py` | modify | kind `bundle`, the `Bundles` source, `approval` alias |
| `services/work/team_scope.py`, `feed_team_decide.py`, `feed_team.py`, `views.py` | modify | Rest of company, team kind filter, `TeamBundles` |
| `services/work/queues.py` | create | `GET /work/queues/` |
| `services/work/urls.py` | modify | `queues/` |
| `services/work/proposal_notice.py` | modify | "Bundles waiting" over bundles |
| `services/notifications/models.py`, `migrations/0014_bundles_waiting.py` | modify/create | the label |
| `services/copilot/skills.py` | modify | History wording |
| tests | create/modify | listed per task |
| `e2e/test_agent_bundles_flow.py` | create | the journey |
| docs | modify | Task 18 |

## Shared test fixture (used from Task 2 on)

`services/agents/tests/bundle_fixtures.py` (created in Task 2) is the bundles' world: `AgentsFixture`'s people and book, plus makers. Every later task imports it.

---

### Task 1: Registry flags, outside kinds always Ask

**Files:**
- Modify: `services/agents/kinds.py`, `services/agents/policy.py`, `services/agents/settings_api.py`
- Test: `services/agents/tests/test_outside_kinds.py` (create)

**Interfaces:**
- Produces: `Kind.irreversible: bool = False`, `Kind.outside: bool = False`, `Kind.editable: tuple = ()`, `Kind.edit: Callable | None = None` (`(action, fields, runner) -> payload`), `Kind.outputs: tuple = ()`; `class FieldErrors(Exception)` with `.errors: dict[str, list[str]]`; `class StepFailed(Exception)` with `.detail: str`, `.result: dict | None`; `settings_api.ALWAYS_ASKS = "This action always asks."`; settings `kinds[]` rows carry `irreversible`, `outside`, `locked`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_outside_kinds.py`:

```python
"""Outside kinds are always Ask (contract D21, §2): the grid reads Ask
whatever is stored, shows the kind locked, and refuses auto or never. No
D1 kind acts outside Revenact, so a test-only kind stands in."""

import dataclasses
from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents.models import AgentPolicy
from services.agents.policy import level, policy_for
from services.agents.registry import REGISTRY
from services.agents.tests.fixtures import AgentsFixture

SETTINGS = "/api/v1/agents/settings/"
OUTSIDE = dataclasses.replace(
    REGISTRY["note.create"],
    key="test.outside",
    label="Act outside",
    outside=True,
    irreversible=True,
)


class OutsideKindTests(AgentsFixture):
    def setUp(self):
        patcher = patch.dict(REGISTRY, {"test.outside": OUTSIDE})
        patcher.start()
        self.addCleanup(patcher.stop)
        patch_credits = patch("services.agents.policy.plan_credits", return_value=3000)
        patch_credits.start()
        self.addCleanup(patch_credits.stop)

    def test_a_stored_auto_or_never_reads_as_ask(self):
        org = Organisation.objects.get(pk=self.org.pk)
        for stored in ("auto", "never", "ask"):
            AgentPolicy.objects.update_or_create(
                organisation=org, defaults={"levels": {"cs": {"test.outside": stored}}}
            )
            with self.subTest(stored=stored):
                self.assertEqual(level(policy_for(org), "cs", "test.outside"), "ask")

    def test_the_grid_shows_it_locked(self):
        body = self.client_for(self.admin).get(SETTINGS).json()
        row = next(k for k in body["kinds"] if k["kind"] == "test.outside")
        self.assertEqual((row["outside"], row["irreversible"], row["locked"]), (True, True, True))
        note = next(k for k in body["kinds"] if k["kind"] == "note.create")
        self.assertEqual(
            (note["outside"], note["irreversible"], note["locked"]), (False, False, False)
        )

    def test_auto_and_never_are_refused_and_ask_is_a_no_op(self):
        for value in ("auto", "never"):
            response = self.client_for(self.admin).patch(
                SETTINGS, {"levels": {"cs": {"test.outside": value}}}, format="json"
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(
                response.json(), {"levels": {"cs": {"test.outside": ["This action always asks."]}}}
            )
        response = self.client_for(self.admin).patch(
            SETTINGS, {"levels": {"cs": {"test.outside": "ask"}}}, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def test_every_d1_kind_is_inside_and_only_the_sends_are_irreversible(self):
        inside = {key: spec for key, spec in REGISTRY.items() if key != "test.outside"}
        self.assertFalse(any(spec.outside for spec in inside.values()))
        self.assertEqual(
            sorted(key for key, spec in inside.items() if spec.irreversible), []
        )  # Task 9 and Task 10 add survey.send and campaign.send
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_outside_kinds --parallel auto --noinput`
Expected: FAIL with `TypeError: ... unexpected keyword argument 'outside'` (from `dataclasses.replace`).

- [ ] **Step 3: The registry fields and the two exceptions**

In `services/agents/kinds.py`, after `OwnerLimit` add:

```python
class FieldErrors(Exception):
    """A person's edit to a step doesn't hold: `{key: [sentence]}` (contract §9.1)."""

    def __init__(self, errors):
        super().__init__(errors)
        self.errors = errors


class StepFailed(Exception):
    """The step can't finish now (a send refused, say): it fails with
    `detail`, a plain sentence, and keeps what it made so far (`result`), so
    a Retry carries on from there instead of making it again (contract §7)."""

    def __init__(self, detail, *, result=None):
        super().__init__(detail)
        self.detail = detail
        self.result = result
```

At the end of the `Kind` dataclass add:

```python
    #: Can't be undone once it ran (contract §3).
    irreversible: bool = False
    #: Acts outside Revenact: always irreversible and always Ask (D21).
    outside: bool = False
    #: The payload keys a person may change in the bundle panel (D11).
    editable: tuple = ()
    #: (action, fields, runner) -> the new payload; raises FieldErrors.
    edit: Callable | None = None
    #: The `outputs` keys a run of this kind fills (contract §6.2).
    outputs: tuple = ()
```

- [ ] **Step 4: Policy reads Ask; settings show and refuse**

In `services/agents/policy.py` `level`, right after the `if spec is None or agent not in spec.agents: return NEVER` line:

```python
    if spec.outside:
        # An outside kind is always Ask, whatever is stored (D21).
        return ASK
```

In `services/agents/settings_api.py`: add `ALWAYS_ASKS = "This action always asks."` next to `NO_AUTO`; in `payload`'s kinds rows add after `"agents": list(spec.agents),`:

```python
                "irreversible": spec.irreversible or spec.outside,
                "outside": spec.outside,
                "locked": spec.outside,
```

In `_levels`, before the `elif RANK[value] < RANK[spec.max_level]:` branch:

```python
            elif spec.outside and value != ASK:
                wrong[kind] = [ALWAYS_ASKS]
```

and import `ASK` from `.kinds` (`from .kinds import ASK, LEVELS, NEVER, RANK`).

- [ ] **Step 5: Run them to see them pass, and the agents settings tests**

Run: `$PY manage.py test services.agents.tests.test_outside_kinds services.agents.tests.test_api_settings services.agents.tests.test_policy --parallel auto --noinput`
Expected: PASS. (`test_api_settings` may compare a whole kinds row: add the three keys to its expected row, `False`, `False`, `False`.)

- [ ] **Step 6: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/kinds.py services/agents/policy.py services/agents/settings_api.py services/agents/tests/test_outside_kinds.py services/agents/tests/test_api_settings.py
git commit -m "feat(agents): registry flags for irreversible and outside kinds, always Ask

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `AgentBundle`, step fields, bundles of one and the migration

**Files:**
- Modify: `services/agents/models.py`, `services/metrics/models.py`
- Create: `services/agents/bundles.py` (first part), `services/agents/migrations/0002_agent_bundle.py`, `services/metrics/migrations/0014_agent_action_steps.py`, `services/agents/migrations/0003_bundles_of_one.py`, `services/metrics/migrations/0015_agent_action_bundle_required.py`
- Create: `services/agents/tests/bundle_fixtures.py`, `services/agents/tests/test_bundle_model.py`, `services/agents/tests/test_bundles_migration.py`

**Interfaces:**
- Produces: `AgentBundle` with `Source` (`NIGHTLY="nightly"`, `THREAD="thread"`), `RoutedTo` (`OWNER`, `DEPARTMENT`, `ADMINS`), `Status` (`WAITING`, `RUNNING`, `DONE`, `PARTLY_DONE`, `REJECTED`, `EXPIRED`, `SUPERSEDED`), `FINISHED` tuple, `record` property; `AgentAction.bundle` (`related_name="steps"`), `position`, `selected`, `outputs`, `error`, `irreversible`; `AgentAction.Status.FAILED`, `SKIPPED`; `AgentAction.Kind.SURVEY_SEND = "survey.send"`, `CAMPAIGN_SEND = "campaign.send"`; `bundles.STEP_TO_BUNDLE`, `bundles.routing_for(record) -> (routed_to, routed_user)`, `bundles.bundle_of_one(action) -> AgentBundle` (saved); fixture `BundleFixture` with `step(record, *, kind="record.lifecycle", bundle=None, position=None, **fields) -> AgentAction`, `bundle_of(record, *kinds_and_payloads, agent="cs", title=...) -> AgentBundle`, `BUNDLES = "/api/v1/agents/bundles/"`.

- [ ] **Step 1: Write the fixture and the failing model tests**

Create `services/agents/tests/bundle_fixtures.py`:

```python
"""The bundles' tests' world: AgentsFixture's people and book (Carl owns
Pizza Hut, Dough Co, Pizza EMEA and Taco East and reports to Mona; Dana owns
Taco Bell and Taco West; Mona owns Soup Co; Loose Ltd has no owner; Alice is
an admin with view-all; Lee is Leadership without it), plus makers for
steps and bundles stored as the nightly pass stores them."""

import itertools

from services.accounts.models import User
from services.agents.models import AgentBundle
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Account
from services.metrics.models import AgentAction

BUNDLES = "/api/v1/agents/bundles/"
HISTORY = "/api/v1/agents/bundles/history/"
_targets = itertools.count(1)


def lifecycle(stage="renewal"):
    return ("record.lifecycle", {"stage": stage})


def note(title="Called the sponsor", body="They renew if support improves."):
    return ("note.create", {"title": title, "body": body})


class BundleFixture(AgentsFixture):
    def step(self, record, *, kind="record.lifecycle", payload=None, bundle=None, **fields):
        """One step on `record` (None: workspace-level), in `bundle` (None: a bundle of one)."""
        on = {}
        if record is not None:
            on = {"account" if isinstance(record, Account) else "customer": record}
        payload = payload if payload is not None else {"stage": "renewal"}
        before = record.lifecycle_stage if kind == "record.lifecycle" and record else None
        defaults = {
            "agent": "cs",
            "batch": "b",
            "kind": kind,
            "target": f"{kind}:{next(_targets)}",
            "title": f"{kind} on {getattr(record, 'name', 'the workspace')}",
            "rationale": "Renews soon.",
            "evidence": ["Renews in 30 days"],
            "payload": payload,
            "before": before,
        }
        if bundle is not None:
            defaults["bundle"] = bundle
            defaults["position"] = bundle.steps.count() + 1
        return AgentAction.objects.create(organisation=self.org, **on, **{**defaults, **fields})

    def bundle_of(self, record, *steps, agent="cs", title="Save Pizza Hut", **fields):
        """A waiting bundle on `record` holding `steps` ((kind, payload) pairs), in order."""
        from services.agents.bundles import routing_for

        routed_to, routed_user = routing_for(record)
        on = {}
        if record is not None:
            on = {"account" if isinstance(record, Account) else "customer": record}
        bundle = AgentBundle.objects.create(
            organisation=self.org,
            agent=agent,
            title=title,
            reason="Health fell and the renewal is close.",
            routed_to=routed_to,
            routed_user=routed_user,
            **on,
            **fields,
        )
        for kind, payload in steps:
            self.step(record, kind=kind, payload=payload, bundle=bundle, agent=agent)
        return bundle

    def fresh(self, user):
        return User.objects.get(pk=user.pk)
```

Create `services/agents/tests/test_bundle_model.py`:

```python
"""A bundle and its steps (contract §1.1, §1.2, D3): a step saved without a
bundle gets a bundle of one; steps are ordered by position; the routing
follows the record."""

from django.db import IntegrityError, transaction

from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BundleFixture, lifecycle, note
from services.metrics.models import AgentAction


class BundleOfOneTests(BundleFixture):
    def test_a_step_saved_alone_gets_a_bundle_of_one(self):
        action = self.step(self.pizza, title="Move Pizza Hut to renewal", rationale="Renews in 30.")
        bundle = action.bundle
        self.assertEqual(
            (action.position, action.selected, action.outputs, action.error), (1, True, {}, "")
        )
        self.assertEqual(
            (bundle.title, bundle.reason, bundle.agent, bundle.source, bundle.status),
            ("Move Pizza Hut to renewal", "Renews in 30.", "cs", "nightly", "waiting"),
        )
        self.assertEqual((bundle.customer_id, bundle.account_id), (self.pizza.pk, None))
        self.assertEqual((bundle.routed_to, bundle.routed_user_id), ("owner", self.csm.pk))

    def test_workspace_level_and_ownerless_routing(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        built = builder_action(self.org, "segment.create", definition())
        self.assertEqual((built.bundle.routed_to, built.bundle.routed_user_id), ("admins", None))
        loose = self.step(self.loose)
        self.assertEqual((loose.bundle.routed_to, loose.bundle.routed_user_id), ("owner", None))

    def test_a_decided_step_alone_gets_a_finished_bundle(self):
        for status, expected in (
            ("applied", "done"),
            ("rejected", "rejected"),
            ("expired", "expired"),
            ("undone", "done"),
        ):
            with self.subTest(status=status):
                self.assertEqual(self.step(self.pizza, status=status).bundle.status, expected)

    def test_steps_keep_their_order_and_positions_are_unique(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        self.assertEqual(
            list(bundle.steps.order_by("position").values_list("kind", "position")),
            [("record.lifecycle", 1), ("note.create", 2)],
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.step(self.pizza, bundle=bundle, position=1)

    def test_the_new_statuses_and_kinds_exist(self):
        self.assertIn("failed", AgentAction.Status.values)
        self.assertIn("skipped", AgentAction.Status.values)
        self.assertIn("survey.send", AgentAction.Kind.values)
        self.assertIn("campaign.send", AgentAction.Kind.values)
        bundle = self.step(self.pizza).bundle
        self.assertEqual(str(bundle), f"Agent bundle {bundle.pk}")
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_bundle_model --parallel auto --noinput`
Expected: FAIL with `ImportError: cannot import name 'AgentBundle'`.

- [ ] **Step 3: The model**

Append to `services/agents/models.py`:

```python
class AgentBundle(models.Model):
    """One proposal of ready-to-run steps (Agent bundles, contract §1.1).
    Its steps are `metrics.AgentAction` rows (`steps`), run in `position`
    order. `thread` and `department` arrive with delivery 2."""

    class Source(models.TextChoices):
        NIGHTLY = "nightly", "Nightly review"
        THREAD = "thread", "Message"

    class RoutedTo(models.TextChoices):
        OWNER = "owner", "Record owner"
        DEPARTMENT = "department", "Department"
        ADMINS = "admins", "Admins"

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        RUNNING = "running", "Running"
        DONE = "done", "Done"
        PARTLY_DONE = "partly_done", "Partly done"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"
        SUPERSEDED = "superseded", "Superseded"

    class RejectReason(models.TextChoices):
        ALREADY_HANDLED = "already_handled", "Already handled"
        NOT_RELEVANT = "not_relevant", "Not relevant"
        WRONG_PERSON = "wrong_person", "Wrong person"
        OTHER = "other", "Other"

    organisation = models.ForeignKey(
        Organisation, related_name="agent_bundles", on_delete=models.CASCADE
    )
    agent = models.CharField(max_length=8, choices=AgentAction.Agent.choices)
    title = models.CharField(max_length=255)
    reason = models.TextField(blank=True)
    source = models.CharField(max_length=16, choices=Source.choices, default=Source.NIGHTLY)
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    account = models.ForeignKey(
        "customers.Account", null=True, blank=True, on_delete=models.CASCADE, related_name="+"
    )
    routed_to = models.CharField(max_length=16, choices=RoutedTo.choices, default=RoutedTo.OWNER)
    routed_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.WAITING)
    edited_at = models.DateTimeField(null=True, blank=True)
    edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    run_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    run_started_at = models.DateTimeField(null=True, blank=True)
    run_finished_at = models.DateTimeField(null=True, blank=True)
    reject_reason = models.CharField(max_length=16, choices=RejectReason.choices, blank=True)
    reject_note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["organisation", "status"], name="agent_bundle_status"),
            models.Index(fields=["organisation", "updated_at"], name="agent_bundle_updated"),
        ]

    def __str__(self):
        # Not the title: an audit row records this, and the title names a record.
        return f"Agent bundle {self.pk}"

    @property
    def record(self):
        if self.account_id is not None:
            return self.account
        return self.customer


#: The statuses History lists (contract §10.5).
FINISHED = (
    AgentBundle.Status.DONE,
    AgentBundle.Status.PARTLY_DONE,
    AgentBundle.Status.REJECTED,
    AgentBundle.Status.EXPIRED,
    AgentBundle.Status.SUPERSEDED,
)
```

- [ ] **Step 4: The step fields and `save()`**

In `services/metrics/models.py` `AgentAction`:
- `Kind` gains, after `INITIATIVE_CREATE`: `SURVEY_SEND = "survey.send", "Send a survey"` and `CAMPAIGN_SEND = "campaign.send", "Send a campaign"`.
- `Status` gains `FAILED = "failed", "Failed"` and `SKIPPED = "skipped", "Skipped"`.
- After `created_at`:

```python
    bundle = models.ForeignKey(
        "agents.AgentBundle",
        null=True,
        on_delete=models.CASCADE,
        related_name="steps",
        help_text="The bundle this step belongs to; a lone action is a bundle of one.",
    )
    position = models.PositiveSmallIntegerField(default=1)
    selected = models.BooleanField(default=True, help_text="The last run's tick.")
    outputs = models.JSONField(
        default=dict, blank=True, help_text="What the step produced, for later steps."
    )
    error = models.CharField(max_length=500, blank=True)
    irreversible = models.BooleanField(
        default=False, help_text="Whether it could not be undone when it ran."
    )
```

- `Meta.constraints` gains (after `agent_action_one_open`):

```python
(models.UniqueConstraint(fields=["bundle", "position"], name="agent_action_bundle_position"),)
```

- Add the method (above `record`):

```python
    def save(self, *args, **kwargs):
        """A step saved without a bundle gets a bundle of one (contract D3):
        the facilitator's session proposals, scripts and tests."""
        if self.bundle_id is None:
            from services.agents.bundles import bundle_of_one

            self.bundle = bundle_of_one(self)
            self.position = 1
        super().save(*args, **kwargs)
```

- [ ] **Step 5: `bundles.py`, first part**

Create `services/agents/bundles.py`:

```python
"""Bundles (Agent bundles, contract §1): a bundle of one for a lone step,
who it is routed to, its status rules, the read rule and stuck runs. The
status rules are the only place a bundle's status is worked out from its
steps."""

from services.metrics.models import AgentAction

from .models import AgentBundle

B = AgentBundle.Status
S = AgentAction.Status
#: A lone step's status -> its bundle's (contract §1.4).
STEP_TO_BUNDLE = {
    S.PROPOSED: B.WAITING,
    S.APPLIED: B.DONE,
    S.UNDONE: B.DONE,
    S.REJECTED: B.REJECTED,
    S.EXPIRED: B.EXPIRED,
    S.FAILED: B.PARTLY_DONE,
    S.SKIPPED: B.EXPIRED,
}


def routing_for(record):
    """(routed_to, routed_user) for a bundle on `record` (contract §1.1, D6)."""
    if record is None:
        return AgentBundle.RoutedTo.ADMINS, None
    return AgentBundle.RoutedTo.OWNER, record.owner


def bundle_of_one(action):
    """A saved bundle holding only `action` (not saved here)."""
    record = action.record
    routed_to, routed_user = routing_for(record)
    status = STEP_TO_BUNDLE.get(action.status, B.WAITING)
    if status == B.EXPIRED and action.expired_reason == "replaced":
        status = B.SUPERSEDED
    finished = action.decided_at if status in (B.DONE, B.PARTLY_DONE) else None
    return AgentBundle.objects.create(
        organisation_id=action.organisation_id,
        agent=action.agent,
        title=action.title,
        reason=action.rationale,
        customer_id=action.customer_id,
        account_id=action.account_id,
        routed_to=routed_to,
        routed_user=routed_user,
        status=status,
        run_by_id=action.decided_by_id if finished else None,
        run_started_at=finished,
        run_finished_at=finished,
        reject_note=(action.decision_note or "")[:255] if status == B.REJECTED else "",
    )
```

- [ ] **Step 6: The schema migrations**

Run: `$PY manage.py makemigrations agents metrics --name agent_bundle`
Expected: two files. Rename them so the names are the contract's: the agents one to `services/agents/migrations/0002_agent_bundle.py` (CreateModel `AgentBundle`), the metrics one to `services/metrics/migrations/0014_agent_action_steps.py` (AddField ×6, AlterField `kind` and `status` choices, AddConstraint `agent_action_bundle_position`); fix the metrics file's dependency name to `("agents", "0002_agent_bundle")`. Then open `0014_agent_action_steps.py` and **move the `AddConstraint` operation out** (it goes in 0015, after every row has a bundle and a position).

Create `services/agents/migrations/0003_bundles_of_one.py`:

```python
"""Every existing agent action becomes a bundle of one (Agent bundles,
contract §1.4). Batches of 500; the bundle keeps the action's dates."""

from django.db import migrations

BATCH = 500
BUNDLE = {
    "proposed": "waiting",
    "applied": "done",
    "undone": "done",
    "rejected": "rejected",
    "expired": "expired",
}
LINK = {
    "task_id": ("task_url", "/work/mine?task={}"),
    "campaign_id": ("campaign_url", "/campaigns/{}"),
    "survey_id": ("survey_url", "/surveys/{}"),
    "segment_id": ("segment_url", "/segments/{}"),
    "rule_id": ("rule_url", "/scenarios/rules/{}"),
    "canvas_id": ("canvas_url", "/canvas/{}"),
}
IDS = ("note_id", "draft_id", "plan_id", "template_id", "initiative_id", "send_id", *LINK)


def outputs(result):
    out = {}
    for key in IDS:
        value = (result or {}).get(key)
        if isinstance(value, int) and not isinstance(value, bool):
            out[key] = value
            if key in LINK:
                link_key, pattern = LINK[key]
                out[link_key] = pattern.format(value)
    return out


def forwards(apps, schema_editor):
    Action = apps.get_model("metrics", "AgentAction")
    Bundle = apps.get_model("agents", "AgentBundle")
    rows = Action.objects.filter(bundle__isnull=True).select_related("customer", "account")
    while True:
        batch = list(rows.order_by("id")[:BATCH])
        if not batch:
            return
        for action in batch:
            record = action.account if action.account_id else action.customer
            status = BUNDLE.get(action.status, "expired")
            if status == "expired" and action.expired_reason == "replaced":
                status = "superseded"
            ran = status == "done"
            bundle = Bundle.objects.create(
                organisation_id=action.organisation_id,
                agent=action.agent,
                title=action.title,
                reason=action.rationale,
                source="nightly",
                customer_id=action.customer_id,
                account_id=action.account_id,
                routed_to="owner" if record is not None else "admins",
                routed_user_id=getattr(record, "owner_id", None),
                status=status,
                run_by_id=action.decided_by_id if ran else None,
                run_started_at=action.decided_at if ran else None,
                run_finished_at=action.decided_at if ran else None,
                reject_note=(action.decision_note or "")[:255] if status == "rejected" else "",
            )
            Bundle.objects.filter(pk=bundle.pk).update(
                created_at=action.created_at, updated_at=action.decided_at or action.created_at
            )
            Action.objects.filter(pk=action.pk).update(
                bundle_id=bundle.pk, position=1, selected=True, outputs=outputs(action.result)
            )


def backwards(apps, schema_editor):
    Action = apps.get_model("metrics", "AgentAction")
    Action.objects.update(bundle_id=None)
    apps.get_model("agents", "AgentBundle").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0002_agent_bundle"),
        ("metrics", "0014_agent_action_steps"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
```

Create `services/metrics/migrations/0015_agent_action_bundle_required.py`:

```python
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0003_bundles_of_one"),
        ("metrics", "0014_agent_action_steps"),
    ]

    operations = [
        migrations.AlterField(
            model_name="agentaction",
            name="bundle",
            field=models.ForeignKey(
                help_text="The bundle this step belongs to; a lone action is a bundle of one.",
                on_delete=django.db.models.deletion.CASCADE,
                related_name="steps",
                to="agents.agentbundle",
            ),
        ),
        migrations.AddConstraint(
            model_name="agentaction",
            constraint=models.UniqueConstraint(
                fields=("bundle", "position"), name="agent_action_bundle_position"
            ),
        ),
    ]
```

Then make the model's field match: in `AgentAction.bundle` remove `null=True`.

Run: `$PY manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 7: The migration test**

Create `services/agents/tests/test_bundles_migration.py`:

```python
"""agents.0003_bundles_of_one (contract §1.4): every action becomes a bundle
of one with the mapped status, dates and outputs."""

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone

BEFORE = [("agents", "0002_agent_bundle"), ("metrics", "0014_agent_action_steps")]
AFTER = [("agents", "0003_bundles_of_one")]


class BundlesOfOneMigrationTests(TransactionTestCase):
    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def tearDown(self):
        self.migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    def test_each_action_gets_its_own_bundle(self):
        apps = self.migrate(BEFORE)
        Organisation = apps.get_model("accounts", "Organisation")
        User = apps.get_model("accounts", "User")
        Customer = apps.get_model("customers", "Customer")
        Action = apps.get_model("metrics", "AgentAction")
        org = Organisation.objects.create(name="Acme Inc", currency="USD")
        carl = User.objects.create(email="carl@acme.io", name="Carl CSM", organisation=org)
        pizza = Customer.objects.create(organisation=org, name="Pizza Hut", owner=carl)
        now = timezone.now()
        common = {
            "organisation": org,
            "agent": "cs",
            "batch": "b",
            "rationale": "Why.",
            "payload": {},
        }
        rows = {
            status: Action.objects.create(
                **common,
                kind="task.create",
                customer=pizza,
                target=f"t:{status}",
                title=f"Do {status}",
                status=status,
                decided_by=carl if status != "proposed" else None,
                decided_at=now if status != "proposed" else None,
                decision_note="Not now." if status == "rejected" else "",
                expired_reason="replaced" if status == "expired" else "",
                result={"task_id": 9} if status == "applied" else {},
            )
            for status in ("proposed", "applied", "rejected", "expired", "undone")
        }
        workspace = Action.objects.create(
            **common, kind="segment.create", target="s", title="Build", status="proposed"
        )
        apps = self.migrate(AFTER)
        Action = apps.get_model("metrics", "AgentAction")
        expected = {
            "proposed": "waiting",
            "applied": "done",
            "rejected": "rejected",
            "expired": "superseded",
            "undone": "done",
        }
        for status, action in rows.items():
            step = Action.objects.select_related("bundle").get(pk=action.pk)
            with self.subTest(status=status):
                self.assertEqual(step.bundle.status, expected[status])
                self.assertEqual((step.position, step.selected), (1, True))
                self.assertEqual(step.bundle.title, f"Do {status}")
                self.assertEqual(step.bundle.created_at, action.created_at)
                self.assertEqual(
                    (step.bundle.routed_to, step.bundle.routed_user_id), ("owner", carl.pk)
                )
        applied = Action.objects.select_related("bundle").get(pk=rows["applied"].pk)
        self.assertEqual(applied.outputs, {"task_id": 9, "task_url": "/work/mine?task=9"})
        self.assertEqual(applied.bundle.run_by_id, carl.pk)
        rejected = Action.objects.select_related("bundle").get(pk=rows["rejected"].pk)
        self.assertEqual(rejected.bundle.reject_note, "Not now.")
        lone = Action.objects.select_related("bundle").get(pk=workspace.pk)
        self.assertEqual((lone.bundle.routed_to, lone.bundle.routed_user_id), ("admins", None))
```

- [ ] **Step 8: Run the tests, then every agents and work test (save() must keep them green)**

Run: `$PY manage.py test services.agents.tests.test_bundle_model services.agents.tests.test_bundles_migration --parallel auto --noinput`
Expected: PASS.

Run: `$PY manage.py test services.agents services.work services.metrics services.brain services.copilot --parallel auto --noinput`
Expected: PASS (every existing test that creates an `AgentAction` now gets a bundle of one). A failure here is a `values()`/serializer snapshot that lists every field of an action: add the new keys to its expectation, never drop a privacy assertion.

- [ ] **Step 9: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/models.py services/metrics/models.py services/agents/bundles.py services/agents/migrations/0002_agent_bundle.py services/agents/migrations/0003_bundles_of_one.py services/metrics/migrations/0014_agent_action_steps.py services/metrics/migrations/0015_agent_action_bundle_required.py services/agents/tests/bundle_fixtures.py services/agents/tests/test_bundle_model.py services/agents/tests/test_bundles_migration.py
git commit -m "feat(agents): AgentBundle, steps on AgentAction, bundles of one

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Status rules, read-time expiry and stuck runs

**Files:**
- Modify: `services/agents/bundles.py`, `services/agents/deciding.py`, `services/agents/settings_api.py`
- Test: `services/agents/tests/test_bundle_status.py` (create)

**Interfaces:**
- Consumes: Task 2's model and `STEP_TO_BUNDLE`.
- Produces: `bundles.WAIT` (= `deciding.WAIT`), `bundles.STUCK = timedelta(minutes=15)`, `bundles.STUCK_ERROR = "This step didn't finish. Retry it."`; `bundles.outcome(steps) -> str` (a finished status after a run); `bundles.settle(bundle) -> AgentBundle` (waiting with nothing proposed → expired/superseded; call with the bundle row locked or inside the caller's transaction); `bundles.live_waiting(queryset, now=None) -> QuerySet` (waiting, inside the 14 days); `bundles.read_expired(bundle, now) -> bool`; `bundles.expire_bundle(bundle, reason, actor=None)` (stores `expired`, every proposed step expired with `reason`); `bundles.settle_stuck(bundle, now=None) -> AgentBundle`; `bundles.settle_stuck_all(organisation, now=None) -> int`; `deciding.settle_bundle_of(action)`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_bundle_status.py`:

```python
"""A bundle's status (contract §1.3, D4, D15): what a run ends as, a waiting
bundle with nothing left proposed, the 14-day read-time rule, stuck runs, and
legacy paths that decide a step settling its bundle."""

from datetime import timedelta

from django.utils import timezone

from services.agents import bundles, deciding
from services.agents.deciding import expire
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BundleFixture, lifecycle, note
from services.metrics.models import AgentAction


class OutcomeTests(BundleFixture):
    def statuses(self, bundle, *pairs):
        for step, (status, selected) in zip(bundle.steps.order_by("position"), pairs, strict=True):
            AgentAction.objects.filter(pk=step.pk).update(status=status, selected=selected)
        return list(bundle.steps.order_by("position"))

    def test_done_partly_done_and_expired(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note(), note("Two", "B"))
        cases = [
            ((("applied", True), ("skipped", False), ("applied", True)), "done"),
            ((("applied", True), ("failed", True), ("skipped", False)), "partly_done"),
            ((("applied", True), ("expired", True), ("skipped", False)), "partly_done"),
            ((("expired", True), ("expired", True), ("skipped", False)), "expired"),
            ((("undone", True), ("applied", True), ("applied", True)), "done"),
        ]
        for pairs, expected in cases:
            with self.subTest(pairs=pairs):
                self.assertEqual(bundles.outcome(self.statuses(bundle, *pairs)), expected)


class SettleTests(BundleFixture):
    def test_a_waiting_bundle_with_nothing_proposed_expires_or_is_superseded(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        first, second = bundle.steps.order_by("position")
        expire(first, "not_reproposed")
        self.assertEqual(bundles.settle(AgentBundle.objects.get(pk=bundle.pk)).status, "waiting")
        expire(second, "replaced")
        self.assertEqual(bundles.settle(AgentBundle.objects.get(pk=bundle.pk)).status, "expired")
        other = self.bundle_of(self.pizza, note("Replaced", "X"))
        expire(other.steps.get(), "replaced")
        self.assertEqual(bundles.settle(AgentBundle.objects.get(pk=other.pk)).status, "superseded")

    def test_a_legacy_decision_settles_its_bundle(self):
        bundle = self.bundle_of(self.pizza, lifecycle())
        step = bundle.steps.get()
        deciding.reject(self.fresh(self.csm), step.pk)
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "rejected")
        again = self.bundle_of(self.pizza, lifecycle("adoption"))
        deciding.approve(self.fresh(self.csm), again.steps.get().pk)
        again.refresh_from_db()
        self.assertEqual((again.status, again.run_by_id), ("done", self.csm.pk))

    def test_setting_a_kind_to_never_settles(self):
        bundle = self.bundle_of(self.pizza, note())
        response = self.client_for(self.admin).patch(
            "/api/v1/agents/settings/", {"levels": {"cs": {"note.create": "never"}}}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "expired")


class ReadTimeExpiryTests(BundleFixture):
    def test_live_waiting_drops_a_bundle_14_days_old(self):
        young = self.bundle_of(self.pizza, lifecycle())
        old = self.bundle_of(self.pizza, note())
        AgentBundle.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=14))
        rows = bundles.live_waiting(AgentBundle.objects.filter(organisation=self.org))
        self.assertEqual(list(rows.values_list("pk", flat=True)), [young.pk])
        self.assertTrue(bundles.read_expired(AgentBundle.objects.get(pk=old.pk), timezone.now()))

    def test_expire_bundle_expires_every_proposed_step(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        bundles.expire_bundle(AgentBundle.objects.get(pk=bundle.pk), "waited")
        bundle.refresh_from_db()
        self.assertEqual(bundle.status, "expired")
        self.assertEqual(
            set(bundle.steps.values_list("status", "expired_reason")), {("expired", "waited")}
        )


class StuckRunTests(BundleFixture):
    def stuck(self, minutes):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        first, second = bundle.steps.order_by("position")
        AgentAction.objects.filter(pk=first.pk).update(status="applied")
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="running",
            run_by=self.csm,
            run_started_at=timezone.now() - timedelta(minutes=minutes),
        )
        return AgentBundle.objects.get(pk=bundle.pk), second

    def test_a_run_left_15_minutes_is_settled_partly_done(self):
        bundle, second = self.stuck(15)
        settled = bundles.settle_stuck(bundle)
        second.refresh_from_db()
        self.assertEqual(settled.status, "partly_done")
        self.assertIsNotNone(settled.run_finished_at)
        self.assertEqual(
            (second.status, second.error), ("failed", "This step didn't finish. Retry it.")
        )

    def test_a_fresh_run_is_left_alone_and_the_sweep_counts(self):
        bundle, _second = self.stuck(5)
        self.assertEqual(bundles.settle_stuck(bundle).status, "running")
        self.stuck(20)
        self.assertEqual(bundles.settle_stuck_all(self.org), 1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_bundle_status --parallel auto --noinput`
Expected: FAIL with `AttributeError: module 'services.agents.bundles' has no attribute 'outcome'`.

- [ ] **Step 3: The rules**

Append to `services/agents/bundles.py` (and add `from datetime import timedelta`, `from django.db import transaction`, `from django.utils import timezone` at the top):

```python
WAIT = timedelta(days=14)
STUCK = timedelta(minutes=15)
STUCK_ERROR = "This step didn't finish. Retry it."
RAN = (S.APPLIED, S.UNDONE)


def outcome(steps):
    """What a run ends as (contract §1.3), from its steps after the run."""
    chosen = [step for step in steps if step.selected and step.status != S.SKIPPED]
    statuses = {step.status for step in chosen}
    if chosen and statuses <= set(RAN):
        return B.DONE
    if chosen and statuses == {S.EXPIRED}:
        return B.EXPIRED
    return B.PARTLY_DONE


def settle(bundle):
    """A waiting bundle with no step left proposed: expired, or superseded when
    every step was replaced. Anything else is left as it is."""
    if bundle.status != B.WAITING:
        return bundle
    steps = list(bundle.steps.values_list("status", "expired_reason"))
    if any(status == S.PROPOSED for status, _ in steps):
        return bundle
    if any(status in RAN for status, _ in steps):
        bundle.status = B.DONE
    elif steps and all(reason == "replaced" for _, reason in steps):
        bundle.status = B.SUPERSEDED
    elif all(status == S.REJECTED for status, _ in steps):
        bundle.status = B.REJECTED
    else:
        bundle.status = B.EXPIRED
    bundle.save(update_fields=["status", "updated_at"])
    return bundle


def live_waiting(queryset, now=None):
    """`queryset` cut to waiting bundles inside their 14 days (backend #113's rule)."""
    return queryset.filter(status=B.WAITING, created_at__gt=(now or timezone.now()) - WAIT)


def read_expired(bundle, now):
    return bundle.status == B.WAITING and bundle.created_at <= now - WAIT


def expire_bundle(bundle, reason, actor=None):
    """Store `expired`: every proposed step expires with `reason`. Call with the bundle locked."""
    from .deciding import expire

    for step in bundle.steps.select_for_update().filter(status=S.PROPOSED).order_by("position"):
        expire(step, reason, actor)
    bundle.status = B.EXPIRED
    bundle.save(update_fields=["status", "updated_at"])
    return bundle


def settle_stuck(bundle, now=None):
    """A run left `running` for 15 minutes (a crashed worker, D15): its selected
    steps still proposed fail, retryable, and the bundle is partly done."""
    now = now or timezone.now()
    if bundle.status != B.RUNNING or bundle.run_started_at is None:
        return bundle
    if bundle.run_started_at > now - STUCK:
        return bundle
    with transaction.atomic():
        fresh = AgentBundle.objects.select_for_update(of=("self",)).get(pk=bundle.pk)
        if fresh.status != B.RUNNING or fresh.run_started_at > now - STUCK:
            return fresh
        fresh.steps.filter(status=S.PROPOSED, selected=True).update(
            status=S.FAILED, error=STUCK_ERROR
        )
        fresh.status = B.PARTLY_DONE
        fresh.run_finished_at = now
        fresh.save(update_fields=["status", "run_finished_at", "updated_at"])
    return fresh


def settle_stuck_all(organisation, now=None):
    """The nightly sweep: every stuck run in the workspace. Returns how many."""
    now = now or timezone.now()
    stuck = AgentBundle.objects.filter(
        organisation=organisation, status=B.RUNNING, run_started_at__lte=now - STUCK
    )
    count = 0
    for bundle in stuck:
        if settle_stuck(bundle, now).status == B.PARTLY_DONE:
            count += 1
    return count
```

- [ ] **Step 4: Legacy decisions settle their bundle**

In `services/agents/deciding.py` add:

```python
def settle_bundle_of(action, actor=None):
    """After a decision outside a bundle run (a legacy path, Auto, a pass's
    expiry): the step's bundle follows (contract §1.3). A lone applied step's
    bundle is run by whoever decided it."""
    from .bundles import settle
    from .models import AgentBundle

    bundle = AgentBundle.objects.select_for_update(of=("self",)).get(pk=action.bundle_id)
    was = bundle.status
    settle(bundle)
    if was != bundle.status and bundle.status == AgentBundle.Status.DONE:
        bundle.run_by = actor
        bundle.run_started_at = bundle.run_finished_at = action.decided_at
        bundle.save(update_fields=["run_by", "run_started_at", "run_finished_at", "updated_at"])
    return bundle
```

In `approve`'s inner `run`, after `apply_action(...)`: `settle_bundle_of(action, reader)`. In `reject_locked`, after `feedback_log.record_proposal_decision(...)`: `settle_bundle_of(action, reader)`. In `expire`, after `_audit(...)`: `settle_bundle_of(action)`.

(`expire` is called by the pass, settings' Never, and decisions; each now settles the bundle. `settle` leaves any bundle that still has a proposed step alone, so a bundle mid-run is never touched: its status is `running`.)

`settings_api.save` needs nothing more: it calls `expire`.

- [ ] **Step 5: Run them to see them pass, and every agents test**

Run: `$PY manage.py test services.agents --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/bundles.py services/agents/deciding.py services/agents/tests/test_bundle_status.py
git commit -m "feat(agents): bundle status rules, read-time expiry and stuck runs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Who reads a bundle, its shapes, and `GET /agents/bundles/<id>/`

**Files:**
- Modify: `services/agents/bundles.py`, `services/agents/payloads.py`, `services/agents/urls.py`
- Create: `services/agents/bundle_payloads.py`, `services/agents/bundle_views.py`
- Test: `services/agents/tests/test_bundle_detail.py` (create)

**Interfaces:**
- Consumes: Task 2's fixture; `source_access.unreadable_draft_ids`, `deciding.may_decide`, `deciding.REASONS`, `bulk.using`.
- Produces: `bundles.unreadable_bundle_ids(reader) -> QuerySet[{"bundle_id"}]`; `bundles.readable(reader, queryset) -> QuerySet[AgentBundle]`; `payloads.preview_for(action, reader)`, `payloads.undo_block(action, reader)` (renamed from `_preview`, `_undo`); `action_payload(...)["bundle"]: int`; `bundle_payloads.NO_SUCH_BUNDLE = "No such bundle."`, `no_such_bundle() -> NotFound`, `bundle_for(reader, pk, *, lock=False) -> AgentBundle` (404 by §8), `editable_keys(step) -> list[str]`, `irreversible_now(step) -> bool`, `step_payload(step, reader) -> dict`, `bundle_payload(bundle, reader, *, history=False) -> dict`, `item_detail(bundle, reader) -> dict` (the feed row's `detail`), `SOURCE_LABELS`; route `GET /api/v1/agents/bundles/<id>/` named `agent-bundle`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_bundle_detail.py`:

```python
"""GET /agents/bundles/<id>/ (contract §4, §5.4, §8): the twice-filter, the
bundle and step shapes, disabled steps with their reasons, evidence for
view-all only, and a stuck run settled on read."""

from datetime import timedelta

from django.utils import timezone

from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture, lifecycle, note
from services.agents.tests.fixtures import viewer
from services.metrics.models import AgentAction


class BundleDetailTests(BundleFixture):
    def get(self, user, bundle):
        return self.client_for(user).get(f"{BUNDLES}{bundle.pk}/")

    def test_the_owner_reads_the_whole_shape(self):
        bundle = self.bundle_of(self.pizza, lifecycle(), note())
        body = self.get(self.csm, bundle).json()
        self.assertEqual(
            {
                k: body[k]
                for k in ("id", "agent", "agent_label", "status", "step_count", "routed_to")
            },
            {
                "id": bundle.pk,
                "agent": "cs",
                "agent_label": "CS agent",
                "status": "waiting",
                "step_count": 2,
                "routed_to": "owner",
            },
        )
        self.assertEqual(body["source"], {"kind": "nightly", "label": "Nightly review"})
        self.assertEqual(
            body["record"], {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(body["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(
            (body["can_run"], body["can_reject"], body["has_newer_message"]), (True, True, False)
        )
        first, second = body["steps"]
        self.assertEqual(
            (first["position"], first["kind"], first["label"]),
            (1, "record.lifecycle", "Change lifecycle stage"),
        )
        self.assertEqual((first["fields"], first["editable"]), ({}, []))
        self.assertEqual(
            second["fields"],
            {"title": "Called the sponsor", "body": "They renew if support improves."},
        )
        self.assertEqual(second["editable"], ["title", "body"])
        for step in body["steps"]:
            self.assertEqual(
                (
                    step["status"],
                    step["can_run"],
                    step["disabled_reason"],
                    step["irreversible"],
                    step["outside"],
                ),
                ("proposed", True, None, False, False),
            )
            self.assertEqual(
                (step["outputs"], step["error"], step["expired_reason"], step["undo"]),
                ({}, "", "", None),
            )
            self.assertEqual(step["evidence"], [])
        admin = self.get(self.admin, bundle).json()
        self.assertEqual(admin["steps"][0]["evidence"][0]["label"], "Renews in 30 days")

    def test_nobody_outside_reads_it(self):
        bundle = self.bundle_of(self.soup, note())
        for reader in (self.csm, self.other, self.lee, self.stranger):
            with self.subTest(reader=reader.name):
                response = self.get(reader, bundle)
                self.assertEqual(response.status_code, 404)
                self.assertEqual(
                    response.json(), {"code": "NO_SUCH_BUNDLE", "detail": "No such bundle."}
                )

    def test_a_workspace_level_bundle_is_view_all_only(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        built = builder_action(self.org, "segment.create", definition())
        self.assertEqual(self.get(self.admin, built.bundle).status_code, 200)
        self.assertEqual(self.get(self.lee, built.bundle).status_code, 404)
        body = self.get(self.admin, built.bundle).json()
        self.assertEqual((body["record"], body["for"], body["routed_to"]), (None, None, "admins"))

    def test_a_step_the_reader_may_not_run_is_disabled_with_the_reason(self):
        vic = viewer(self.org)
        bundle = self.bundle_of(self.pizza, ("record.owner", {"owner_id": self.other.pk}), note())
        body = self.get(vic, bundle).json()
        owner_step, note_step = body["steps"]
        self.assertEqual(
            (owner_step["can_run"], owner_step["disabled_reason"]),
            (False, "You can't run this step."),
        )
        self.assertTrue(note_step["can_run"])
        self.assertEqual((body["can_run"], body["can_reject"]), (True, False))

    def test_a_bundle_with_an_unreadable_draft_source_is_missing(self):
        from services.agents.tests.drafts_fixtures import ticket

        source = ticket(self.pizza, number="TKT-9", department="finance")
        bundle = self.bundle_of(
            self.pizza, ("draft.reply", {"ticket_id": source.pk, "body": "Hi"}), note()
        )
        self.assertEqual(self.get(self.csm, bundle).status_code, 404)

    def test_a_stuck_run_is_settled_on_read(self):
        bundle = self.bundle_of(self.pizza, note())
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="running", run_by=self.csm, run_started_at=timezone.now() - timedelta(minutes=20)
        )
        body = self.get(self.csm, bundle).json()
        self.assertEqual(body["status"], "partly_done")
        self.assertEqual(body["steps"][0]["error"], "This step didn't finish. Retry it.")
        self.assertEqual(body["run_by"], {"id": self.csm.pk, "name": "Carl CSM"})

    def test_an_applied_steps_undo_and_the_action_names_its_bundle(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        from services.agents import deciding

        deciding.approve(self.fresh(self.csm), step.pk)
        body = self.get(self.csm, bundle).json()
        self.assertTrue(body["steps"][0]["undo"]["allowed"])
        action = self.client_for(self.csm).get(f"/api/v1/agents/actions/{step.pk}/").json()
        self.assertEqual(action["bundle"], bundle.pk)
        AgentAction.objects.filter(pk=step.pk).update(irreversible=True)
        body = self.get(self.csm, bundle).json()
        self.assertEqual(
            body["steps"][0]["undo"], {"allowed": False, "until": None, "reason": "irreversible"}
        )
```

Check `services/agents/tests/drafts_fixtures.py`'s `ticket()` signature before running: it takes the record and keyword fields; if its department keyword is named differently (e.g. `dept`), use that name. The point of the test is a ticket in a department Carl may not read.

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_bundle_detail --parallel auto --noinput`
Expected: FAIL (404 for every request: the route does not exist).

- [ ] **Step 3: The read rule**

Append to `services/agents/bundles.py` (imports: `from django.db.models import Q`, `from services.customers.scoping import sees_everything, visible_accounts, visible_customers`):

```python
def unreadable_bundle_ids(reader):
    """Bundles holding a draft reply whose source `reader` may not read, as
    an `id IN` subquery over `bundle_id`."""
    from .source_access import unreadable_draft_ids

    return AgentAction.objects.filter(id__in=unreadable_draft_ids(reader)).values("bundle_id")


def readable(reader, queryset):
    """`queryset` cut to the bundles `reader` may read (contract §8): its
    record is one they may open (workspace-level: view-all only), and no step
    quotes a source they may not read."""
    # SOC2:AUTH-02 a bundle is read only by its record's readers and its sources' readers
    queryset = queryset.filter(organisation_id=reader.organisation_id).exclude(
        id__in=unreadable_bundle_ids(reader)
    )
    if sees_everything(reader):
        return queryset
    # SOC2:AUTH-02 the twice-filter, as id IN subqueries (no join, no DISTINCT)
    return queryset.filter(
        Q(customer_id__in=visible_customers(reader).values("id"))
        | Q(account_id__in=visible_accounts(reader).values("id"))
    )
```

- [ ] **Step 4: The shared payload helpers**

In `services/agents/payloads.py`: rename `_preview` to `preview_for` and `_undo` to `undo_block` (grep `_preview(\|_undo(` in `services/` and update every caller). In `undo_block`, right after the `if action.status != AgentAction.Status.APPLIED: return None` line:

```python
    if action.irreversible:
        return {"allowed": False, "until": None, "reason": "irreversible"}
```

In `action_payload`, add `"bundle": action.bundle_id,` after `"id": action.pk,`.

- [ ] **Step 5: The bundle shapes**

Create `services/agents/bundle_payloads.py`:

```python
"""The contract's Bundle and Step shapes (Agent bundles, contract §4), written
for one reader, and the feed row's detail. A step's preview, undo and
evidence are the agents' own rules (`payloads`)."""

from rest_framework import serializers
from rest_framework.exceptions import NotFound

from services.customers.models import Customer
from services.customers.scoping import sees_everything
from services.customers.task_changes import person
from services.metrics.models import AgentAction

from . import bulk, placeholders
from .bundles import readable, settle_stuck
from .deciding import may_decide
from .models import AgentBundle
from .payloads import preview_for, undo_block
from .registry import REGISTRY
from .source_access import may_read_source

S = AgentAction.Status
B = AgentBundle.Status
NO_SUCH_BUNDLE = "No such bundle."
CANT_RUN_STEP = "You can't run this step."
SOURCE_ONLY = "Only people who can read this {noun} can run this step."
SOURCE_LABELS = dict(AgentBundle.Source.choices)
AGENT_LABELS = dict(AgentAction.Agent.choices)
_stamp = serializers.DateTimeField().to_representation


def no_such_bundle():
    return NotFound({"code": "NO_SUCH_BUNDLE", "detail": NO_SUCH_BUNDLE})


def bundle_for(reader, pk, *, lock=False):
    """The bundle `pk` if `reader` may read it (contract §8), else 404."""
    rows = AgentBundle.objects.filter(pk=pk)
    if lock:
        rows = rows.select_for_update(of=("self",))
    # SOC2:AUTH-02 a bundle the reader may not read is missing, never forbidden
    bundle = readable(reader, rows).first()
    if bundle is None:
        raise no_such_bundle()
    return bundle


def _stamp_or_none(value):
    return None if value is None else _stamp(value)


def _record_ref(record):
    if record is None:
        return None
    kind = "customer" if isinstance(record, Customer) else "account"
    return {"type": kind, "id": record.pk, "name": record.name}


def editable_keys(step):
    """The step's `editable` keys, minus any field holding a placeholder (D12)."""
    held = {field for field, _n, _key in placeholders.find(step.payload)}
    return [key for key in REGISTRY[step.kind].editable if key not in held]


def irreversible_now(step):
    """Contract §3: what the step would be if it ran now; what it was once it ran."""
    if step.status in (S.APPLIED, S.UNDONE):
        return step.irreversible
    spec = REGISTRY[step.kind]
    payload = step.payload if isinstance(step.payload, dict) else {}
    if "draft_only" in spec.editable and payload.get("draft_only"):
        return False
    return spec.irreversible or spec.outside


def _disabled(step, reader):
    if not may_read_source(reader, step):
        noun = "email" if "email_id" in (step.payload or {}) else "ticket"
        return SOURCE_ONLY.format(noun=noun)
    if not may_decide(reader, step):
        return CANT_RUN_STEP
    return None


def step_payload(step, reader):
    spec = REGISTRY[step.kind]
    payload = step.payload if isinstance(step.payload, dict) else {}
    keys = editable_keys(step)
    proposed = step.status == S.PROPOSED
    reason = _disabled(step, reader) if proposed else None
    link = (
        f"/{'organizations' if step.customer_id else 'accounts'}/{step.record.pk}"
        if step.record
        else None
    )
    return {
        "id": step.pk,
        "position": step.position,
        "kind": step.kind,
        "label": spec.label,
        "status": step.status,
        "selected": step.selected,
        "title": step.title,
        "rationale": step.rationale,
        "fields": {key: payload.get(key) for key in keys if key in payload},
        "editable": keys,
        "placeholders": [
            {"field": field, "step": n, "key": key, "label": placeholders.label(n, key)}
            for field, n, key in placeholders.find(payload)
        ],
        "preview": preview_for(step, reader),
        "irreversible": irreversible_now(step),
        "outside": spec.outside,
        "can_run": proposed and reason is None,
        "disabled_reason": reason,
        "outputs": step.outputs or {},
        "error": step.error,
        "expired_reason": step.expired_reason if step.status == S.EXPIRED else "",
        "undo": undo_block(step, reader),
        # SOC2:AUTH-02 evidence is written from the whole book: view_all_accounts only
        "evidence": [{"label": str(line), "link": link} for line in step.evidence]
        if sees_everything(reader)
        else [],
    }


def _for(bundle, history):
    if history:
        return person(bundle.routed_user)
    record = bundle.record
    return None if record is None else person(record.owner)


def bundle_payload(bundle, reader, *, history=False):
    """The Bundle for `reader`. `history`: `for` is who it was routed to."""
    bundle = settle_stuck(bundle)
    steps = list(
        bundle.steps.select_related(
            "customer__owner", "account__owner", "decided_by", "undone_by", "organisation"
        ).order_by("position")
    )
    # The previews' reads are done once for the bundle, not once per step.
    with bulk.using(steps):
        rows = [step_payload(step, reader) for step in steps]
    waiting = bundle.status == B.WAITING
    runnable = [row["can_run"] for row in rows if row["status"] == S.PROPOSED]
    return {
        "id": bundle.pk,
        "agent": bundle.agent,
        "agent_label": AGENT_LABELS.get(bundle.agent, "AI agent"),
        "title": bundle.title,
        "reason": bundle.reason,
        "source": {"kind": bundle.source, "label": SOURCE_LABELS[bundle.source]},
        "record": _record_ref(bundle.record),
        "routed_to": bundle.routed_to,
        "for": _for(bundle, history),
        "status": bundle.status,
        "created_at": _stamp(bundle.created_at),
        "updated_at": _stamp(bundle.updated_at),
        "edited_at": _stamp_or_none(bundle.edited_at),
        "edited_by": person(bundle.edited_by),
        "run_by": person(bundle.run_by),
        "run_started_at": _stamp_or_none(bundle.run_started_at),
        "run_finished_at": _stamp_or_none(bundle.run_finished_at),
        "reject_reason": bundle.reject_reason,
        "reject_note": bundle.reject_note,
        "has_newer_message": False,
        "step_count": len(steps),
        "can_run": waiting and any(runnable),
        "can_reject": waiting and bool(runnable) and all(runnable),
        "steps": rows,
    }


def item_detail(bundle, reader, steps):
    """The feed row's `detail` (contract §4.3) from the bundle's `steps`
    (already read for the page)."""
    waiting = [step for step in steps if step.status == S.PROPOSED]
    return {
        "reason": bundle.reason,
        "step_count": len(steps),
        "source": {"kind": bundle.source, "label": SOURCE_LABELS[bundle.source]},
        "kinds": [REGISTRY[step.kind].label for step in waiting],
        "can_run": any(may_decide(reader, step) for step in waiting),
    }
```

- [ ] **Step 6: The route**

Create `services/agents/bundle_views.py`:

```python
"""The bundle routes (Agent bundles, contract §5, §10.5): detail, run,
retry, reject and History. 404 for a bundle the reader may not read (§8),
then 403, then the run's own refusals."""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .bundle_payloads import bundle_for, bundle_payload


class BundleDetailView(APIView):
    """GET /api/v1/agents/bundles/<id>/."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        return Response(bundle_payload(bundle_for(request.user, pk), request.user))
```

In `services/agents/urls.py`, import `bundle_views` and add before the `<str:kind>/run/` route:

```python
(path("bundles/<int:pk>/", bundle_views.BundleDetailView.as_view(), name="agent-bundle"),)
```

`placeholders` is Task 5's module; create it now with only what this task reads (Task 5 adds the rest and its tests):

```python
"""`{{step N.key}}` (Agent bundles, contract §6)."""

import re

PATTERN = re.compile(r"\{\{\s*step\s+(\d{1,2})\.([a-z_]+)\s*\}\}")
THINGS = {
    "task": "Task",
    "note": "Note",
    "draft": "Draft",
    "campaign": "Campaign",
    "survey": "Survey",
    "segment": "Segment",
    "rule": "Scenario",
    "canvas": "Map",
    "plan": "Plan",
    "template": "Template",
    "initiative": "Initiative",
    "send": "Send",
}


def find(payload):
    """[(field, position, key)] for every placeholder in a top-level text value."""
    found = []
    for field, value in (payload or {}).items() if isinstance(payload, dict) else ():
        if isinstance(value, str):
            found += [(field, int(n), key) for n, key in PATTERN.findall(value)]
    return found


def label(n, key):
    thing, _, tail = key.rpartition("_")
    name = THINGS.get(thing, thing.replace("_", " ").capitalize() or "Result")
    return f"{name} link from step {n}" if tail == "url" else f"{name} from step {n}"
```

- [ ] **Step 7: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_bundle_detail services.agents.tests.test_api_actions --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 8: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/bundles.py services/agents/payloads.py services/agents/bundle_payloads.py services/agents/bundle_views.py services/agents/placeholders.py services/agents/urls.py services/agents/tests/test_bundle_detail.py
git commit -m "feat(agents): the bundle read rule, its shapes and GET /agents/bundles/<id>/

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Placeholders and outputs

**Files:**
- Modify: `services/agents/placeholders.py`
- Modify: `services/agents/actions/tasks.py`, `notes.py`, `drafts.py`, `campaigns.py`, `segments.py`, `scenarios.py`, `canvases.py`, `plan_starts.py`, `templates.py`, `initiatives.py` (each kind's `outputs`)
- Test: `services/agents/tests/test_placeholders.py` (create)

**Interfaces:**
- Consumes: Task 4's `PATTERN`, `find`, `label`.
- Produces: `placeholders.LINKS: dict[str, tuple[str, str]]`, `placeholders.IDS: tuple`, `outputs_for(result) -> dict`, `check(payload, position, kinds_by_position: dict[int, str])` (raises `kinds.Invalid`), `fill(payload, outputs_by_position: dict[int, dict]) -> dict` (raises `NeedsStep`), `class NeedsStep(Exception)` with `.position: int`, `needs_sentence(n) -> str` (`"Needs step N, which didn't run."`).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_placeholders.py`:

```python
"""`{{step N.key}}` (contract §6): found in top-level text, checked against
earlier steps' outputs at proposal, filled at run, and outputs carry links."""

from django.test import SimpleTestCase

from services.agents import placeholders
from services.agents.kinds import Invalid
from services.agents.registry import REGISTRY


class FindAndLabelTests(SimpleTestCase):
    def test_find_reads_top_level_text_and_allows_spaces(self):
        payload = {
            "title": "Follow up {{step 1.task_url}}",
            "body": "See {{ step 2.campaign_id }}",
            "n": 3,
        }
        self.assertEqual(
            placeholders.find(payload), [("title", 1, "task_url"), ("body", 2, "campaign_id")]
        )
        self.assertEqual(placeholders.find({"title": "{{step x.y}} and {braces}"}), [])

    def test_labels(self):
        self.assertEqual(placeholders.label(1, "task_url"), "Task link from step 1")
        self.assertEqual(placeholders.label(2, "campaign_id"), "Campaign from step 2")
        self.assertEqual(placeholders.label(1, "rule_url"), "Scenario link from step 1")
        self.assertEqual(placeholders.label(1, "canvas_id"), "Map from step 1")


class CheckTests(SimpleTestCase):
    def test_a_placeholder_must_name_an_earlier_producer(self):
        kinds = {1: "task.create", 2: "note.create"}
        placeholders.check({"body": "{{step 1.task_url}}"}, 2, kinds)
        for payload, position in (
            ({"body": "{{step 2.note_id}}"}, 2),  # itself
            ({"body": "{{step 3.task_url}}"}, 2),  # later
            ({"body": "{{step 1.campaign_url}}"}, 2),  # not what task.create makes
            ({"body": "{{step 9.task_url}}"}, 2),  # no such step
        ):
            with self.subTest(payload=payload), self.assertRaises(Invalid):
                placeholders.check(payload, position, kinds)


class FillTests(SimpleTestCase):
    def test_fill_replaces_from_outputs(self):
        filled = placeholders.fill(
            {"title": "Chase {{step 1.task_url}}", "priority": "high"},
            {1: {"task_id": 9, "task_url": "/work/mine?task=9"}},
        )
        self.assertEqual(filled, {"title": "Chase /work/mine?task=9", "priority": "high"})

    def test_a_step_that_did_not_run_is_needed(self):
        with self.assertRaises(placeholders.NeedsStep) as caught:
            placeholders.fill({"title": "Chase {{step 1.task_url}}"}, {})
        self.assertEqual(caught.exception.position, 1)
        self.assertEqual(placeholders.needs_sentence(1), "Needs step 1, which didn't run.")


class OutputsTests(SimpleTestCase):
    def test_ids_and_their_links(self):
        self.assertEqual(
            placeholders.outputs_for({"task_id": 9, "customer_id": 4}),
            {"task_id": 9, "task_url": "/work/mine?task=9"},
        )
        self.assertEqual(
            placeholders.outputs_for({"campaign_id": 3, "segment_id": 5}),
            {
                "campaign_id": 3,
                "campaign_url": "/campaigns/3",
                "segment_id": 5,
                "segment_url": "/segments/5",
            },
        )
        self.assertEqual(placeholders.outputs_for({"note_id": 2}), {"note_id": 2})
        self.assertEqual(placeholders.outputs_for(None), {})

    def test_every_kind_declares_what_it_makes(self):
        expected = {
            "task.create": ("task_id", "task_url"),
            "note.create": ("note_id",),
            "draft.reply": ("draft_id",),
            "campaign.create": ("campaign_id", "campaign_url", "segment_id", "segment_url"),
            "segment.create": ("segment_id", "segment_url"),
            "scenario.create": ("rule_id", "rule_url", "segment_id", "segment_url"),
            "canvas.create": ("canvas_id", "canvas_url"),
            "plan.start": ("plan_id",),
            "plan.template": ("template_id",),
            "initiative.create": ("initiative_id",),
        }
        for kind, outputs in expected.items():
            with self.subTest(kind=kind):
                self.assertEqual(REGISTRY[kind].outputs, outputs)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_placeholders --parallel auto --noinput`
Expected: FAIL with `AttributeError: module 'services.agents.placeholders' has no attribute 'check'`.

- [ ] **Step 3: The rest of `placeholders.py`**

Append:

```python
#: id key -> (link key, link), contract §6.2. Links are app paths.
LINKS = {
    "task_id": ("task_url", "/work/mine?task={}"),
    "campaign_id": ("campaign_url", "/campaigns/{}"),
    "survey_id": ("survey_url", "/surveys/{}"),
    "segment_id": ("segment_url", "/segments/{}"),
    "rule_id": ("rule_url", "/scenarios/rules/{}"),
    "canvas_id": ("canvas_url", "/canvas/{}"),
}
IDS = ("note_id", "draft_id", "plan_id", "template_id", "initiative_id", "send_id", *LINKS)
NEEDS = "Needs step {n}, which didn't run."


class NeedsStep(Exception):
    def __init__(self, position):
        super().__init__(position)
        self.position = position


def needs_sentence(n):
    return NEEDS.format(n=n)


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def outputs_for(result):
    """A step's `outputs` from its `result`: its ids, and a link per id with a page."""
    out = {}
    for key in IDS:
        value = (result or {}).get(key)
        if _whole(value):
            out[key] = value
            if key in LINKS:
                link_key, pattern = LINKS[key]
                out[link_key] = pattern.format(value)
    return out


def check(payload, position, kinds_by_position):
    """Invalid when a placeholder names this or a later step, or a key the
    producing step's kind does not make (contract §6.1)."""
    from .kinds import Invalid
    from .registry import REGISTRY

    for _field, n, key in find(payload):
        producer = kinds_by_position.get(n)
        if n >= position or producer is None or key not in REGISTRY[producer].outputs:
            raise Invalid("a placeholder names no earlier step's output")


def fill(payload, outputs_by_position):
    """`payload` with every placeholder replaced; NeedsStep for the first
    producing step that did not run or lacks the key (contract §6.3)."""

    def replace(match):
        n, key = int(match.group(1)), match.group(2)
        outputs = outputs_by_position.get(n) or {}
        if key not in outputs:
            raise NeedsStep(n)
        return str(outputs[key])

    if not isinstance(payload, dict):
        return payload
    return {
        field: PATTERN.sub(replace, value) if isinstance(value, str) else value
        for field, value in payload.items()
    }
```

- [ ] **Step 4: Each kind's `outputs`**

Add the `outputs=` argument to each `Kind(...)`:

| File | Kind constant | `outputs=` |
|---|---|---|
| `actions/tasks.py` | `CREATE` | `("task_id", "task_url")` |
| `actions/notes.py` | `CREATE` | `("note_id",)` |
| `actions/drafts.py` | `REPLY` | `("draft_id",)` |
| `actions/campaigns.py` | `CREATE` | `("campaign_id", "campaign_url", "segment_id", "segment_url")` |
| `actions/segments.py` | `CREATE` | `("segment_id", "segment_url")` |
| `actions/scenarios.py` | `CREATE` | `("rule_id", "rule_url", "segment_id", "segment_url")` |
| `actions/canvases.py` | `CREATE` | `("canvas_id", "canvas_url")` |
| `actions/plan_starts.py` | `START` | `("plan_id",)` |
| `actions/templates.py` | `WRITE` | `("template_id",)` |
| `actions/initiatives.py` | `CREATE` | `("initiative_id",)` |

Check each kind's `apply` returns those ids in its `result` (`grep -n '"_id"\|_id":' services/agents/actions/*.py`); a kind whose result key differs (e.g. a scenario's `rule_id`) keeps its key, and the table follows the code.

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_placeholders --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/placeholders.py services/agents/actions/tasks.py services/agents/actions/notes.py services/agents/actions/drafts.py services/agents/actions/campaigns.py services/agents/actions/segments.py services/agents/actions/scenarios.py services/agents/actions/canvases.py services/agents/actions/plan_starts.py services/agents/actions/templates.py services/agents/actions/initiatives.py services/agents/tests/test_placeholders.py
git commit -m "feat(agents): step placeholders and the outputs each kind makes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: What a person may edit in a step

**Files:**
- Create: `services/agents/edits.py`
- Modify: `services/agents/actions/tasks.py`, `notes.py`, `drafts.py`, `campaigns.py`
- Test: `services/agents/tests/test_step_edits.py` (create)

**Interfaces:**
- Consumes: `kinds.FieldErrors`; `work.views.AssignSerializer`'s fields and sentences; `customers.task_access.assignee_for`, `AssigneeCannotOpen`; `campaigns.serializers.subject_field`, `body_field`, `check_merge_fields`.
- Produces: `edits.checked(serializer_class, fields) -> dict` (validated data; raises `FieldErrors` with the first message per key); `edits.PAST = "Choose today or a later date."`; `edits.NO_NOTE_TITLE = "Give the note a title."`, `NO_NOTE_BODY = "Write the note."`, `LONG_NOTE_BODY = "Keep the note under 4000 characters."`, `NO_REPLY = "Write the reply."`, `LONG_REPLY = "Keep the reply under 4000 characters."`, `NO_NAME = "Name it."`; the kinds' `editable`/`edit`: `task.create` (`title`, `assignee_id`, `due_date`, `priority`), `note.create` (`title`, `body`), `draft.reply` (`body`), `campaign.create` (`name`, `subject`, `body`).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_step_edits.py`:

```python
"""A person's edits to a step (contract §2, D11): only the kind's editable
keys, each checked with the sentences the same field has elsewhere."""

from datetime import timedelta

from services.agents.kinds import FieldErrors
from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import BundleFixture


class TaskEditTests(BundleFixture):
    def task(self):
        payload = {
            "title": "Book a save call",
            "assignee_id": None,
            "assignee_name": "",
            "due_date": (self.today + timedelta(days=3)).isoformat(),
            "priority": "medium",
        }
        return self.step(self.pizza, kind="task.create", payload=payload)

    def edit(self, step, fields, runner=None):
        return REGISTRY["task.create"].edit(step, fields, runner or self.fresh(self.csm))

    def test_title_priority_date_and_assignee(self):
        step = self.task()
        due = (self.today + timedelta(days=5)).isoformat()
        payload = self.edit(
            step,
            {
                "title": "Call the sponsor",
                "priority": "high",
                "due_date": due,
                "assignee_id": self.csm.pk,
            },
        )
        self.assertEqual(
            payload,
            {
                "title": "Call the sponsor",
                "assignee_id": self.csm.pk,
                "assignee_name": "Carl CSM",
                "due_date": due,
                "priority": "high",
            },
        )
        self.assertEqual(
            REGISTRY["task.create"].editable, ("title", "assignee_id", "due_date", "priority")
        )

    def test_refusals_use_the_task_sentences(self):
        step = self.task()
        cases = [
            ({"title": ""}, {"title": ["Give the task a title."]}),
            ({"priority": "urgent"}, {"priority": ["Choose high, medium or low."]}),
            ({"due_date": "soon"}, {"due_date": ["Choose a date."]}),
            (
                {"due_date": (self.today - timedelta(days=1)).isoformat()},
                {"due_date": ["Choose today or a later date."]},
            ),
            (
                {"assignee_id": self.other.pk},
                {"assignee_id": ["That person can't open this organisation."]},
            ),
        ]
        for fields, errors in cases:
            with self.subTest(fields=fields), self.assertRaises(FieldErrors) as caught:
                self.edit(step, fields)
            self.assertEqual(caught.exception.errors, errors)


class NoteDraftCampaignEditTests(BundleFixture):
    def test_note(self):
        step = self.step(self.pizza, kind="note.create", payload={"title": "T", "body": "B"})
        spec = REGISTRY["note.create"]
        self.assertEqual(
            spec.edit(step, {"body": "New"}, self.fresh(self.csm)), {"title": "T", "body": "New"}
        )
        with self.assertRaises(FieldErrors) as caught:
            spec.edit(step, {"title": " ", "body": "x" * 4001}, self.fresh(self.csm))
        self.assertEqual(
            caught.exception.errors,
            {"title": ["Give the note a title."], "body": ["Keep the note under 4000 characters."]},
        )

    def test_draft_reply(self):
        spec = REGISTRY["draft.reply"]
        self.assertEqual(spec.editable, ("body",))
        step = self.step(self.pizza, kind="note.create", payload={"ticket_id": 1, "body": "Hi"})
        self.assertEqual(
            spec.edit(step, {"body": "Hello"}, None), {"ticket_id": 1, "body": "Hello"}
        )
        with self.assertRaises(FieldErrors) as caught:
            spec.edit(step, {"body": ""}, None)
        self.assertEqual(caught.exception.errors, {"body": ["Write the reply."]})

    def test_campaign(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        payload = {
            "name": "Check-in",
            "segment": definition(),
            "roles": ["champion"],
            "subject": "Hello",
            "body": "Hi {first_name}",
        }
        step = builder_action(self.org, "campaign.create", payload)
        spec = REGISTRY["campaign.create"]
        edited = spec.edit(step, {"subject": "Quick check-in"}, self.fresh(self.admin))
        self.assertEqual(edited, {**payload, "subject": "Quick check-in"})
        with self.assertRaises(FieldErrors) as caught:
            spec.edit(step, {"body": "Hi {nickname}", "name": ""}, self.fresh(self.admin))
        self.assertEqual(set(caught.exception.errors), {"body", "name"})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_step_edits --parallel auto --noinput`
Expected: FAIL (`TypeError: 'NoneType' object is not callable`: no kind has `edit`).

- [ ] **Step 3: `edits.py`**

```python
"""Checking a person's edits to a step (Agent bundles, contract §2, D11).
Each kind's `edit` runs a small serializer over the fields it allows and
returns the new payload; a refusal is `FieldErrors` with the first sentence
per field, the same sentence that field has on its own page."""

from rest_framework import serializers

from .kinds import FieldErrors

PAST = "Choose today or a later date."
NO_NOTE_TITLE = "Give the note a title."
NO_NOTE_BODY = "Write the note."
LONG_NOTE_BODY = "Keep the note under 4000 characters."
NO_REPLY = "Write the reply."
LONG_REPLY = "Keep the reply under 4000 characters."
NO_NAME = "Name it."


def _first(value):
    if isinstance(value, dict):
        return _first(next(iter(value.values()), ""))
    if isinstance(value, list):
        return _first(value[0]) if value else ""
    return str(value)


def checked(serializer_class, fields, **context):
    body = serializer_class(data=fields, context=context)
    if not body.is_valid():
        raise FieldErrors({key: [_first(value)] for key, value in body.errors.items()})
    return body.validated_data


def text_field(limit, empty, long):
    return serializers.CharField(
        required=False,
        max_length=limit,
        error_messages={"blank": empty, "null": empty, "invalid": empty, "max_length": long},
    )
```

- [ ] **Step 4: Each kind's `edit`**

`services/agents/actions/tasks.py`, above `CREATE`:

```python
class _TaskEdit(serializers.Serializer):
    """Today's Approve overrides (`work.views.AssignSerializer`), every field optional."""

    title = serializers.CharField(
        required=False,
        max_length=255,
        error_messages={
            "blank": NO_TITLE,
            "null": NO_TITLE,
            "invalid": NO_TITLE,
            "max_length": LONG_TITLE,
        },
    )
    assignee_id = serializers.IntegerField(
        required=False,
        error_messages={"invalid": CHOOSE_ASSIGNEE, "null": CHOOSE_ASSIGNEE},
    )
    due_date = serializers.DateField(
        required=False,
        error_messages={"invalid": CHOOSE_DATE, "null": CHOOSE_DATE, "datetime": CHOOSE_DATE},
    )
    priority = serializers.ChoiceField(
        required=False,
        choices=Task.Priority.choices,
        error_messages={"invalid_choice": CHOOSE_PRIORITY, "null": CHOOSE_PRIORITY},
    )


def create_edit(action, fields, runner):
    from services.customers.task_access import AssigneeCannotOpen, assignee_for

    from ..edits import PAST, checked

    clean = checked(_TaskEdit, fields)
    payload = dict(action.payload)
    if "title" in clean:
        payload["title"] = clean["title"].strip()
    if "priority" in clean:
        payload["priority"] = clean["priority"]
    if "due_date" in clean:
        if clean["due_date"] < today_for(action.organisation):
            raise FieldErrors({"due_date": [PAST]})
        payload["due_date"] = clean["due_date"].isoformat()
    if "assignee_id" in clean:
        try:
            # SOC2:AUTH-02 the task goes only to an active member who can open its record
            member = assignee_for(action.organisation_id, clean["assignee_id"], action.record)
        except AssigneeCannotOpen as exc:
            raise FieldErrors({"assignee_id": [str(exc.detail["detail"])]}) from None
        payload["assignee_id"], payload["assignee_name"] = member.pk, member.name
    return payload
```

Imports to add at the top of `tasks.py`: `from rest_framework import serializers`, `from services.customers.task_views import CHOOSE_ASSIGNEE, CHOOSE_DATE, CHOOSE_PRIORITY, LONG_TITLE, NO_TITLE`, and `FieldErrors` from `..kinds` (check `today_for` and `Task` are already imported; they are used by `_not_past` and `PRIORITIES`). If importing `customers.task_views` at module level makes a cycle, import those names inside `create_edit` and build `_TaskEdit` there.

In `CREATE = Kind(...)` add `editable=("title", "assignee_id", "due_date", "priority"), edit=create_edit,`.

`services/agents/actions/notes.py`:

```python
class _NoteEdit(serializers.Serializer):
    title = text_field(255, NO_NOTE_TITLE, "Keep the title under 255 characters.")
    body = text_field(BODY_LIMIT, NO_NOTE_BODY, LONG_NOTE_BODY)


def edit(action, fields, runner):
    clean = checked(_NoteEdit, fields)
    return {**action.payload, **{key: value.strip() for key, value in clean.items()}}
```

with `from rest_framework import serializers` and `from ..edits import LONG_NOTE_BODY, NO_NOTE_BODY, NO_NOTE_TITLE, checked, text_field`; `CREATE` gains `editable=("title", "body"), edit=edit,`.

`services/agents/actions/drafts.py`:

```python
class _ReplyEdit(serializers.Serializer):
    body = text_field(BODY_LIMIT, NO_REPLY, LONG_REPLY)


def edit(action, fields, runner):
    clean = checked(_ReplyEdit, fields)
    return {**action.payload, **clean}
```

`REPLY` gains `editable=("body",), edit=edit,`.

`services/agents/actions/campaigns.py`:

```python
class _CampaignEdit(serializers.Serializer):
    name = text_field(builder.NAME_LIMIT, NO_NAME, "Keep the name under 120 characters.")
    subject = subject_field()
    body = body_field()

    def validate_subject(self, value):
        return check_merge_fields(value)

    def validate_body(self, value):
        return check_merge_fields(value)


def edit(action, fields, runner):
    clean = checked(_CampaignEdit, fields)
    return {**action.payload, **clean}
```

with `from services.campaigns.serializers import body_field, check_merge_fields, subject_field`; `CREATE` gains `editable=("name", "subject", "body"), edit=edit,`.

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_step_edits services.agents.tests.test_task_kinds services.agents.tests.test_campaign_kind --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/edits.py services/agents/actions/tasks.py services/agents/actions/notes.py services/agents/actions/drafts.py services/agents/actions/campaigns.py services/agents/tests/test_step_edits.py
git commit -m "feat(agents): editable step fields with their own sentences

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `POST /agents/bundles/<id>/run/`

**Files:**
- Create: `services/agents/bundle_run.py`
- Modify: `services/agents/bundle_views.py`, `services/agents/urls.py`
- Test: `services/agents/tests/test_bundle_run.py` (create)

**Interfaces:**
- Consumes: Tasks 2–6 (`bundles.*`, `bundle_payloads.*`, `placeholders.*`, `kinds.StepFailed`, `kinds.FieldErrors`), `deciding.locked`, `apply_action`, `stale_reason`, `expire`, `may_decide`, `decided_as`, `_audit`.
- Produces: `bundle_run.Refused(status, body)`; `run_bundle(reader, pk, data) -> AgentBundle`; `run_step(step_id, runner, outputs_by_position, *, retry=False) -> AgentAction`; `outputs_by_position(bundle) -> dict[int, dict]`; `ran_sentence(bundle, now) -> str`; `conflict(bundle, reader, now) -> Refused | None`; `parse_body(steps, data, reader) -> (set[int], dict[int, dict])`; sentences `LIST_STEPS = "List every waiting step once."`, `CHOOSE_ONE = "Choose at least one step to run."`, `CANT_CHANGE = "This can't be changed here."`, `LOST_RIGHTS = "You can no longer run this step."`, `GENERIC = "Something went wrong running this step. Retry it."`, `CANT_RUN = "You can't run this bundle."`; route `POST /api/v1/agents/bundles/<id>/run/` (`agent-bundle-run`).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_bundle_run.py`:

```python
"""Running a bundle (contract §5.1, §6.3, §9): the body's checks, the claim,
steps in order each in its own transaction, partial failure, placeholders,
the 409s and 403s, and the audit trail."""

import dataclasses
from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core.models import AuditEvent
from services.agents.models import AgentBundle
from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture, lifecycle, note
from services.agents.tests.fixtures import viewer
from services.customers.models import Note, Task
from services.metrics.models import AgentAction
from services.work.clock import local_now


def boom(action, actor, **_):
    raise ValidationError("Jira says the project SUP needs a component.")


class RunTests(BundleFixture):
    def run_as(self, user, bundle, steps):
        return self.client_for(user).post(
            f"{BUNDLES}{bundle.pk}/run/", {"steps": steps}, format="json"
        )

    def all_of(self, bundle, **fields):
        return [{"id": s.pk, "selected": True, **fields} for s in bundle.steps.order_by("position")]

    def test_run_with_one_edited_and_one_unticked(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle(), note("Second", "Two"))
        first, second, third = bundle.steps.order_by("position")
        response = self.run_as(
            self.csm,
            bundle,
            [
                {"id": first.pk, "selected": True, "fields": {"body": "Edited body"}},
                {"id": second.pk, "selected": False},
                {"id": third.pk, "selected": True},
            ],
        )
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()["bundle"]
        self.assertEqual(body["status"], "done")
        self.assertEqual([s["status"] for s in body["steps"]], ["applied", "skipped", "applied"])
        self.assertEqual(body["run_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(body["edited_by"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(
            Note.objects.get(pk=body["steps"][0]["outputs"]["note_id"]).body, "Edited body"
        )
        self.assertEqual(AgentAction.objects.get(pk=second.pk).selected, False)
        events = list(
            AuditEvent.objects.filter(action__startswith="agent_bundle.").values_list(
                "action", flat=True
            )
        )
        self.assertEqual(sorted(events), ["agent_bundle.run_finished", "agent_bundle.run_started"])
        self.assertEqual(AuditEvent.objects.filter(action="agent_action.approved").count(), 2)

    def test_untouched_fields_leave_edited_at_empty(self):
        bundle = self.bundle_of(self.pizza, note())
        self.run_as(self.csm, bundle, self.all_of(bundle, fields={"title": "Called the sponsor"}))
        self.assertIsNone(AgentBundle.objects.get(pk=bundle.pk).edited_at)

    def test_a_failure_does_not_stop_later_steps(self):
        broken = dataclasses.replace(REGISTRY["note.create"], apply=boom)
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        with patch.dict(REGISTRY, {"note.create": broken}):
            body = self.run_as(self.csm, bundle, self.all_of(bundle)).json()["bundle"]
        self.assertEqual(body["status"], "partly_done")
        failed, applied = body["steps"]
        self.assertEqual(
            (failed["status"], failed["error"]),
            ("failed", "Jira says the project SUP needs a component."),
        )
        self.assertEqual(applied["status"], "applied")
        self.assertEqual(Note.objects.filter(customer=self.pizza).count(), 0)
        self.assertTrue(AuditEvent.objects.filter(action="agent_action.failed").exists())

    def test_an_unknown_error_reads_as_a_plain_sentence(self):
        def crash(action, actor, **_):
            raise RuntimeError("secret internals")

        bundle = self.bundle_of(self.pizza, note())
        with patch.dict(
            REGISTRY, {"note.create": dataclasses.replace(REGISTRY["note.create"], apply=crash)}
        ):
            step = self.run_as(self.csm, bundle, self.all_of(bundle)).json()["bundle"]["steps"][0]
        self.assertEqual(step["error"], "Something went wrong running this step. Retry it.")

    def test_a_stale_step_expires_and_a_bundle_of_only_that_expires(self):
        bundle = self.bundle_of(self.pizza, lifecycle())
        type(self.pizza).objects.filter(pk=self.pizza.pk).update(lifecycle_stage="churn")
        body = self.run_as(self.csm, bundle, self.all_of(bundle)).json()["bundle"]
        self.assertEqual(body["status"], "expired")
        self.assertEqual(
            (body["steps"][0]["status"], body["steps"][0]["expired_reason"]), ("expired", "changed")
        )

    def test_placeholders_fill_from_earlier_steps_and_need_them(self):
        task = (
            "task.create",
            {
                "title": "Call the sponsor",
                "assignee_id": None,
                "assignee_name": "",
                "due_date": (self.today + timedelta(days=3)).isoformat(),
                "priority": "high",
            },
        )
        follow = ("note.create", {"title": "Logged", "body": "Task: {{step 1.task_url}}"})
        bundle = self.bundle_of(self.pizza, task, follow)
        body = self.run_as(self.csm, bundle, self.all_of(bundle)).json()["bundle"]
        task_id = body["steps"][0]["outputs"]["task_id"]
        self.assertEqual(body["steps"][0]["outputs"]["task_url"], f"/work/mine?task={task_id}")
        made = Note.objects.get(pk=body["steps"][1]["outputs"]["note_id"])
        self.assertEqual(made.body, f"Task: /work/mine?task={task_id}")
        self.assertTrue(Task.objects.filter(pk=task_id).exists())

        again = self.bundle_of(self.pizza, ("task.create", {**task[1], "title": "Other"}), follow)
        first, second = again.steps.order_by("position")
        body = self.run_as(
            self.csm,
            again,
            [{"id": first.pk, "selected": False}, {"id": second.pk, "selected": True}],
        ).json()["bundle"]
        self.assertEqual(body["status"], "partly_done")
        self.assertEqual(
            (body["steps"][1]["status"], body["steps"][1]["error"]),
            ("failed", "Needs step 1, which didn't run."),
        )


class RunRefusalTests(BundleFixture):
    def run_as(self, user, bundle, steps):
        return self.client_for(user).post(
            f"{BUNDLES}{bundle.pk}/run/", {"steps": steps}, format="json"
        )

    def test_404_then_403(self):
        bundle = self.bundle_of(self.soup, note())
        step = bundle.steps.get()
        self.assertEqual(
            self.run_as(self.csm, bundle, [{"id": step.pk, "selected": True}]).status_code, 404
        )
        vic = viewer(self.org)
        owner_only = self.bundle_of(self.pizza, ("record.owner", {"owner_id": self.other.pk}))
        response = self.run_as(
            vic, owner_only, [{"id": owner_only.steps.get().pk, "selected": True}]
        )
        self.assertEqual((response.status_code, response.json()["code"]), (403, "CANT_RUN"))
        self.assertEqual(response.json()["detail"], "You can't run this bundle.")

    def test_a_selected_step_the_runner_may_not_run_refuses_the_whole_run(self):
        vic = viewer(self.org)
        bundle = self.bundle_of(self.pizza, ("record.owner", {"owner_id": self.other.pk}), note())
        first, second = bundle.steps.order_by("position")
        response = self.run_as(
            vic, bundle, [{"id": first.pk, "selected": True}, {"id": second.pk, "selected": True}]
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json(),
            {"code": "CANT_RUN_STEP", "detail": "You can't run step 1.", "step": first.pk},
        )
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "waiting")

    def test_the_body_checks(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        first, second = bundle.steps.order_by("position")
        listing = {"steps": ["List every waiting step once."]}
        for steps, errors in (
            ([{"id": first.pk, "selected": True}], listing),
            ([{"id": first.pk, "selected": True}, {"id": first.pk, "selected": True}], listing),
            (
                [{"id": first.pk, "selected": False}, {"id": second.pk, "selected": False}],
                {"steps": ["Choose at least one step to run."]},
            ),
            (
                [
                    {"id": first.pk, "selected": False, "fields": {"body": "x"}},
                    {"id": second.pk, "selected": True},
                ],
                {"steps": {str(first.pk): {"body": ["This can't be changed here."]}}},
            ),
            (
                [
                    {"id": first.pk, "selected": True},
                    {"id": second.pk, "selected": True, "fields": {"stage": "live"}},
                ],
                {"steps": {str(second.pk): {"stage": ["This can't be changed here."]}}},
            ),
            (
                [
                    {"id": first.pk, "selected": True, "fields": {"body": ""}},
                    {"id": second.pk, "selected": True},
                ],
                {"steps": {str(first.pk): {"body": ["Write the note."]}}},
            ),
        ):
            with self.subTest(steps=steps):
                response = self.run_as(self.csm, bundle, steps)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json(), errors)
        self.assertEqual(
            self.client_for(self.csm).post(f"{BUNDLES}{bundle.pk}/run/", {}, format="json").json(),
            listing,
        )
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "waiting")

    def test_409s(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        self.assertEqual(
            self.run_as(self.csm, bundle, [{"id": step.pk, "selected": True}]).status_code, 200
        )
        again = self.run_as(self.mona, bundle, [{"id": step.pk, "selected": True}])
        finished = AgentBundle.objects.get(pk=bundle.pk).run_finished_at
        at = local_now(self.org, finished).strftime("%H:%M")
        self.assertEqual(again.status_code, 409)
        self.assertEqual(
            (again.json()["code"], again.json()["detail"]),
            ("BUNDLE_RAN", f"Carl CSM ran this at {at}."),
        )
        self.assertEqual(again.json()["bundle"]["status"], "done")

        running = self.bundle_of(self.pizza, note("R", "R"))
        AgentBundle.objects.filter(pk=running.pk).update(
            status="running", run_by=self.csm, run_started_at=timezone.now()
        )
        response = self.run_as(
            self.mona, running, [{"id": running.steps.get().pk, "selected": True}]
        )
        self.assertEqual(
            (response.json()["code"], response.json()["detail"]),
            ("BUNDLE_RUNNING", "Carl CSM is running this."),
        )

        old = self.bundle_of(self.pizza, note("O", "O"))
        AgentBundle.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=15))
        response = self.run_as(self.csm, old, [{"id": old.steps.get().pk, "selected": True}])
        self.assertEqual(
            (response.status_code, response.json()["code"], response.json()["detail"]),
            (409, "BUNDLE_EXPIRED", "This bundle expired: it waited 14 days."),
        )
        self.assertEqual(AgentBundle.objects.get(pk=old.pk).status, "expired")

    def test_ran_on_another_day(self):
        from services.agents.bundle_run import ran_sentence

        bundle = self.bundle_of(self.pizza, note())
        when = timezone.now() - timedelta(days=2)
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="done", run_by=self.csm, run_finished_at=when
        )
        local = local_now(self.org, when)
        self.assertEqual(
            ran_sentence(AgentBundle.objects.get(pk=bundle.pk), timezone.now()),
            f"Carl CSM ran this on {local.day} {local:%b} at {local:%H:%M}.",
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_bundle_run --parallel auto --noinput`
Expected: FAIL (404s: the route does not exist).

- [ ] **Step 3: `bundle_run.py`: the body, the conflicts and one step**

```python
"""Running a bundle (Agent bundles, contract §5, §6.3, §9): the body is
checked before anything is locked; a short claim under the bundle's row lock
marks it running; each selected step then runs in order in its own
transaction; a short finish settles it. Retry and reject (Task 8) share the
conflicts and `run_step`."""

import logging

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core import audit
from services.metrics.models import AgentAction
from services.work.clock import local_now

from . import placeholders
from .bundle_payloads import bundle_for, bundle_payload, editable_keys, irreversible_now
from .bundles import expire_bundle, outcome, read_expired, settle_stuck
from .deciding import (
    REASONS,
    _audit,
    apply_action,
    decided_as,
    expire,
    locked,
    may_decide,
    stale_reason,
)
from .kinds import FieldErrors, OwnerLimit, Stale, StepFailed
from .models import AgentBundle
from .registry import REGISTRY

logger = logging.getLogger(__name__)
S = AgentAction.Status
B = AgentBundle.Status
LIST_STEPS = "List every waiting step once."
CHOOSE_ONE = "Choose at least one step to run."
CANT_CHANGE = "This can't be changed here."
LOST_RIGHTS = "You can no longer run this step."
GENERIC = "Something went wrong running this step. Retry it."
CANT_RUN = "You can't run this bundle."
SUPERSEDED = "A newer bundle replaced this one."
ERROR_LIMIT = 500


class Refused(Exception):
    """A refusal: the response's status and body."""

    def __init__(self, status, body):
        super().__init__(status)
        self.status = status
        self.body = body


def _name(user):
    return "Revenact" if user is None else user.name


def ran_sentence(bundle, now):
    finished = local_now(bundle.organisation, bundle.run_finished_at or now)
    today = local_now(bundle.organisation, now).date()
    if finished.date() == today:
        return f"{_name(bundle.run_by)} ran this at {finished:%H:%M}."
    return f"{_name(bundle.run_by)} ran this on {finished.day} {finished:%b} at {finished:%H:%M}."


def conflict(bundle, reader, now):
    """The 409 for a bundle that isn't waiting (contract §9.2), else None. A
    waiting bundle past its 14 days is stored expired first."""
    if read_expired(bundle, now):
        expire_bundle(bundle, "waited")
    body = None
    if bundle.status == B.RUNNING:
        body = {"code": "BUNDLE_RUNNING", "detail": f"{_name(bundle.run_by)} is running this."}
    elif bundle.status in (B.DONE, B.PARTLY_DONE):
        body = {"code": "BUNDLE_RAN", "detail": ran_sentence(bundle, now)}
    elif bundle.status == B.REJECTED:
        rejecter = (
            bundle.steps.exclude(decided_by=None).values_list("decided_by__name", flat=True).first()
        )
        body = {"code": "BUNDLE_REJECTED", "detail": f"{rejecter or 'Revenact'} rejected this."}
    elif bundle.status == B.EXPIRED:
        reason = (
            bundle.steps.exclude(expired_reason="").values_list("expired_reason", flat=True).first()
        )
        sentence = REASONS.get(reason or "waited", "it expired")
        body = {"code": "BUNDLE_EXPIRED", "detail": f"This bundle expired: {sentence}."}
    elif bundle.status == B.SUPERSEDED:
        body = {"code": "BUNDLE_SUPERSEDED", "detail": SUPERSEDED}
    if body is None:
        return None
    return Refused(409, {**body, "bundle": bundle_payload(bundle, reader)})


def parse_body(steps, data, reader):
    """(selected step ids, {step id: edited payload}) or Refused(400)."""
    waiting = {step.pk: step for step in steps if step.status == S.PROPOSED}
    rows = data.get("steps") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        raise Refused(400, {"steps": [LIST_STEPS]})
    seen = {}
    for row in rows:
        pk = row.get("id") if isinstance(row, dict) else None
        if pk not in waiting or pk in seen:
            raise Refused(400, {"steps": [LIST_STEPS]})
        seen[pk] = row
    if set(seen) != set(waiting):
        raise Refused(400, {"steps": [LIST_STEPS]})
    selected = {pk for pk, row in seen.items() if row.get("selected") is True}
    if not selected:
        raise Refused(400, {"steps": [CHOOSE_ONE]})
    edits, errors = {}, {}
    for pk, row in seen.items():
        fields = row.get("fields") or {}
        if not fields:
            continue
        step = waiting[pk]
        allowed = set(editable_keys(step))
        if not isinstance(fields, dict):
            errors[str(pk)] = {"fields": [CANT_CHANGE]}
            continue
        wrong = {key: [CANT_CHANGE] for key in fields if pk not in selected or key not in allowed}
        if wrong:
            errors[str(pk)] = wrong
            continue
        try:
            edits[pk] = REGISTRY[step.kind].edit(step, fields, reader)
        except FieldErrors as exc:
            errors[str(pk)] = exc.errors
    if errors:
        raise Refused(400, {"steps": errors})
    return selected, edits


def _sentence(exc):
    if isinstance(exc, ValidationError):
        detail = exc.detail
        if isinstance(detail, dict) and "detail" in detail:
            detail = detail["detail"]
        while isinstance(detail, (list, dict)) and detail:
            detail = detail[0] if isinstance(detail, list) else next(iter(detail.values()))
        return str(detail)[:ERROR_LIMIT] or GENERIC
    if isinstance(exc, OwnerLimit):
        return exc.detail[:ERROR_LIMIT]
    logger.warning("agents: a bundle step failed: %s", type(exc).__name__)
    return GENERIC


def _fail(step_id, runner, detail, *, result=None, error_class=""):
    with transaction.atomic():
        step = locked(step_id)
        step.status = S.FAILED
        step.error = detail[:ERROR_LIMIT]
        if result:
            step.result = {**(step.result or {}), **result}
        step.save(update_fields=["status", "error", "result"])
        _audit(
            "agent_action.failed",
            step,
            runner,
            bundle=step.bundle_id,
            error=error_class or "StepFailed",
        )
    return step


def outputs_by_position(bundle):
    return {
        position: outputs or {}
        for position, outputs in bundle.steps.filter(status=S.APPLIED).values_list(
            "position", "outputs"
        )
    }


def run_step(step_id, runner, outputs, *, retry=False):
    """One step in its own transaction (contract §5.1.4): applied, expired
    (D14) or failed (§9.3). A failure never raises. A kind that stops with
    `StepFailed` keeps what it made so far (a survey's draft and segment):
    its inner savepoint commits, the outer transaction ends normally, and the
    step is then marked failed in a transaction of its own."""
    runnable = (S.PROPOSED, S.FAILED) if retry else (S.PROPOSED,)
    kept = None
    try:
        with transaction.atomic():
            step = locked(step_id)
            if step.status not in runnable:
                return step
            # SOC2:AUTH-02 re-checked at the step: rights can change mid-run
            if not may_decide(runner, step):
                raise StepFailed(LOST_RIGHTS)
            try:
                payload = placeholders.fill(step.payload, outputs)
            except placeholders.NeedsStep as exc:
                raise StepFailed(placeholders.needs_sentence(exc.position)) from None
            reason = stale_reason(step, timezone.now())
            if reason is None:
                if payload != step.payload:
                    step.payload = payload
                    step.save(update_fields=["payload"])
                try:
                    with transaction.atomic():
                        try:
                            apply_action(step, runner)
                        except StepFailed as exc:
                            kept = exc
                except Stale as exc:
                    reason = exc.reason
            if reason is not None:
                expire(step, reason, runner)
                return step
            if kept is None:
                step.outputs = placeholders.outputs_for(step.result)
                step.irreversible = irreversible_now(step)
                step.error = ""
                step.save(update_fields=["outputs", "irreversible", "error"])
                _audit(
                    "agent_action.approved",
                    step,
                    runner,
                    decided_as=decided_as(runner, step),
                    auto=False,
                    bundle=step.bundle_id,
                )
                return step
    except StepFailed as exc:
        return _fail(step_id, runner, exc.detail, result=exc.result)
    except Exception as exc:  # noqa: BLE001 - one step never stops the others (§5.1)
        return _fail(step_id, runner, _sentence(exc), error_class=type(exc).__name__)
    return _fail(step_id, runner, kept.detail, result=kept.result)
```

`apply_action` raises before it touches the step's own fields (the kind's `apply` runs first), so a kept failure leaves the step `proposed` until `_fail` marks it. Task 10's `test_a_refused_send_keeps_the_draft_and_retry_sends_it` pins the keep path.

- [ ] **Step 4: `run_bundle`**

Append:

```python
def _claim(reader, pk, selected, edits, now):
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        refused = conflict(bundle, reader, now)
        if refused is not None:
            return bundle, refused
        steps = list(bundle.steps.select_for_update().order_by("position"))
        for step in steps:
            if step.pk in selected and step.status == S.PROPOSED and not may_decide(reader, step):
                # SOC2:AUTH-02 a step the runner may not decide refuses the whole run (D13)
                return bundle, Refused(
                    403,
                    {
                        "code": "CANT_RUN_STEP",
                        "detail": f"You can't run step {step.position}.",
                        "step": step.pk,
                    },
                )
        edited = False
        for step in steps:
            fields = ["selected"]
            if step.status != S.PROPOSED:
                step.selected = False
            elif step.pk in selected:
                step.selected = True
                if step.pk in edits and edits[step.pk] != step.payload:
                    step.payload = edits[step.pk]
                    fields.append("payload")
                    edited = True
            else:
                step.selected = False
                step.status = S.SKIPPED
                fields.append("status")
            step.save(update_fields=fields)
        bundle.status = B.RUNNING
        bundle.run_by = reader
        bundle.run_started_at = now
        bundle.run_finished_at = None
        update = ["status", "run_by", "run_started_at", "run_finished_at", "updated_at"]
        if edited:
            bundle.edited_at, bundle.edited_by = now, reader
            update += ["edited_at", "edited_by"]
        bundle.save(update_fields=update)
        audit.record(  # SOC2:LOG-01
            "agent_bundle.run_started",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={"steps": sorted(selected), "edited": edited},
        )
    return bundle, None


def finish(bundle_id, reader, *, event="agent_bundle.run_finished"):
    with transaction.atomic():
        bundle = AgentBundle.objects.select_for_update(of=("self",)).get(pk=bundle_id)
        steps = list(bundle.steps.all())
        bundle.status = outcome(steps)
        bundle.run_finished_at = timezone.now()
        bundle.save(update_fields=["status", "run_finished_at", "updated_at"])
        counts = {}
        for step in steps:
            counts[step.status] = counts.get(step.status, 0) + 1
        audit.record(  # SOC2:LOG-01
            event,
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={"status": bundle.status, "steps": counts},
        )
    return bundle


def run_bundle(reader, pk, data):
    """Run `pk` as `reader` (contract §5.1). Raises Refused or 404."""
    bundle = settle_stuck(bundle_for(reader, pk))
    steps = list(
        bundle.steps.select_related("customer", "account", "organisation").order_by("position")
    )
    waiting = [step for step in steps if step.status == S.PROPOSED]
    if bundle.status == B.WAITING and waiting and not any(may_decide(reader, s) for s in waiting):
        raise Refused(403, {"code": "CANT_RUN", "detail": CANT_RUN})
    now = timezone.now()
    if bundle.status == B.WAITING and not read_expired(bundle, now):
        selected, edits = parse_body(steps, data, reader)
    else:
        selected, edits = set(), {}
    bundle, refused = _claim(reader, pk, selected, edits, now)
    if refused is not None:
        raise refused
    outputs = {}
    for step in bundle.steps.filter(selected=True, status=S.PROPOSED).order_by("position"):
        done = run_step(step.pk, reader, outputs)
        if done.status == S.APPLIED:
            outputs[done.position] = done.outputs
    return finish(bundle.pk, reader)
```

- [ ] **Step 5: The route**

In `bundle_views.py` add:

```python
class BundleRunView(APIView):
    """POST /api/v1/agents/bundles/<id>/run/."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            bundle = bundle_run.run_bundle(request.user, pk, request.data)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})
```

(import `from . import bundle_run`), and in `urls.py`:

```python
(path("bundles/<int:pk>/run/", bundle_views.BundleRunView.as_view(), name="agent-bundle-run"),)
```

- [ ] **Step 6: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_bundle_run --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/bundle_run.py services/agents/bundle_views.py services/agents/urls.py services/agents/tests/test_bundle_run.py
git commit -m "feat(agents): run a bundle, steps in order, each in its own transaction

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Retry a step, reject a bundle, and tell the agent why

**Files:**
- Modify: `services/agents/bundle_run.py`, `services/agents/bundle_views.py`, `services/agents/urls.py`, `services/agents/evidence.py`
- Test: `services/agents/tests/test_bundle_retry_reject.py` (create), `services/agents/tests/test_rejection_feedback.py` (create)

**Interfaces:**
- Consumes: Task 7's `Refused`, `conflict`, `run_step`, `outputs_by_position`, `finish`, `parse_body`'s `CANT_CHANGE`.
- Produces: `bundle_run.retry_step(reader, pk, step_pk, data) -> AgentBundle`; `bundle_run.reject_bundle(reader, pk, data) -> AgentBundle`; `NOT_FAILED = "Only a failed step can be retried."`, `CANT_REJECT = "You can't reject this bundle."`, `CHOOSE_REASON = "Choose already handled, not relevant, wrong person or other."`, `LONG_NOTE = "Keep the note under 255 characters."`; routes `agent-bundle-retry` (`bundles/<pk>/steps/<step_pk>/retry/`), `agent-bundle-reject` (`bundles/<pk>/reject/`); `evidence.REJECTED_DAYS = 30`, `evidence.REJECTED_PER_RECORD = 3`, `evidence.rejected_line(bundle) -> str`; record rows gain `"rejected": [line]`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_bundle_retry_reject.py`:

```python
"""Retry a failed step and reject a bundle (contract §5.2, §5.3, D16)."""

import dataclasses
from unittest.mock import patch

from rest_framework.exceptions import ValidationError

from core.models import AuditEvent
from services.agents.models import AgentBundle
from services.agents.registry import REGISTRY
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture, lifecycle, note
from services.agents.tests.fixtures import viewer
from services.metrics.models import AgentAction


def boom(action, actor, **_):
    raise ValidationError("This campaign's audience is empty now.")


class RetryTests(BundleFixture):
    def partly(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        steps = [{"id": s.pk, "selected": True} for s in bundle.steps.order_by("position")]
        with patch.dict(
            REGISTRY, {"note.create": dataclasses.replace(REGISTRY["note.create"], apply=boom)}
        ):
            self.client_for(self.csm).post(
                f"{BUNDLES}{bundle.pk}/run/", {"steps": steps}, format="json"
            )
        return bundle, bundle.steps.get(position=1)

    def retry(self, user, bundle, step, fields=None):
        url = f"{BUNDLES}{bundle.pk}/steps/{step.pk}/retry/"
        return self.client_for(user).post(url, {"fields": fields} if fields else {}, format="json")

    def test_a_retry_that_works_finishes_the_bundle(self):
        bundle, step = self.partly()
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "partly_done")
        response = self.retry(self.csm, bundle, step, {"title": "Second try"})
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()["bundle"]
        self.assertEqual(
            (body["status"], body["steps"][0]["status"], body["steps"][0]["error"]),
            ("done", "applied", ""),
        )
        self.assertTrue(AuditEvent.objects.filter(action="agent_bundle.retried").exists())

    def test_a_retry_that_fails_again_says_so(self):
        bundle, step = self.partly()
        with patch.dict(
            REGISTRY, {"note.create": dataclasses.replace(REGISTRY["note.create"], apply=boom)}
        ):
            body = self.retry(self.csm, bundle, step).json()["bundle"]
        self.assertEqual((body["status"], body["steps"][0]["status"]), ("partly_done", "failed"))

    def test_refusals(self):
        bundle, step = self.partly()
        applied = bundle.steps.get(position=2)
        response = self.retry(self.csm, bundle, applied)
        self.assertEqual(
            (response.status_code, response.json()["code"], response.json()["detail"]),
            (409, "NOT_FAILED", "Only a failed step can be retried."),
        )
        self.assertEqual(self.retry(self.other, bundle, step).status_code, 404)
        other = self.bundle_of(self.pizza, note("X", "Y"))
        self.assertEqual(self.retry(self.csm, other, step).status_code, 404)
        AgentBundle.objects.filter(pk=bundle.pk).update(status="running", run_by=self.mona)
        AgentAction.objects.filter(pk=step.pk).update(status="failed")
        response = self.retry(self.csm, bundle, step)
        self.assertEqual((response.status_code, response.json()["code"]), (409, "BUNDLE_RUNNING"))


class RejectTests(BundleFixture):
    def reject(self, user, bundle, **body):
        return self.client_for(user).post(f"{BUNDLES}{bundle.pk}/reject/", body, format="json")

    def test_reject_with_a_reason_and_note(self):
        bundle = self.bundle_of(self.pizza, note(), lifecycle())
        response = self.reject(self.csm, bundle, reason="already_handled", note="We called them.")
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()["bundle"]
        self.assertEqual(
            (body["status"], body["reject_reason"], body["reject_note"]),
            ("rejected", "already_handled", "We called them."),
        )
        self.assertEqual({s["status"] for s in body["steps"]}, {"rejected"})
        event = AuditEvent.objects.get(action="agent_bundle.rejected")
        self.assertEqual(event.metadata, {"reason": "already_handled"})
        again = self.reject(self.mona, bundle, reason="other")
        self.assertEqual(
            (again.status_code, again.json()["detail"]), (409, "Carl CSM rejected this.")
        )

    def test_refusals(self):
        bundle = self.bundle_of(self.pizza, ("record.owner", {"owner_id": self.other.pk}), note())
        vic = viewer(self.org)
        response = self.reject(vic, bundle, reason="other")
        self.assertEqual(
            (response.status_code, response.json()),
            (403, {"code": "CANT_REJECT", "detail": "You can't reject this bundle."}),
        )
        response = self.reject(self.csm, bundle, reason="retired")
        self.assertEqual(
            response.json(),
            {"reason": ["Choose already handled, not relevant, wrong person or other."]},
        )
        response = self.reject(self.csm, bundle, reason="other", note="x" * 256)
        self.assertEqual(response.json(), {"note": ["Keep the note under 255 characters."]})
        self.assertEqual(self.reject(self.other, bundle, reason="other").status_code, 404)
```

Create `services/agents/tests/test_rejection_feedback.py`:

```python
"""The agent is told why bundles on a record were rejected (spec §4.3, D16):
the title and the reason, 30 days, three at most, never the note, and never
quotable as evidence."""

from datetime import timedelta

from django.utils import timezone

from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BundleFixture, note


class RejectionFeedbackTests(BundleFixture):
    def rejected(self, record, title, reason, *, days=1, note_text="Secret: Soup Co churns"):
        bundle = self.bundle_of(record, note(), title=title)
        AgentBundle.objects.filter(pk=bundle.pk).update(
            status="rejected",
            reject_reason=reason,
            reject_note=note_text,
            updated_at=timezone.now() - timedelta(days=days),
        )
        return bundle

    def test_the_record_block_names_the_title_and_reason_never_the_note(self):
        self.rejected(self.pizza, "Move Pizza Hut to renewal", "not_relevant")
        self.rejected(self.pizza, "Old one", "other", days=31)
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)
        lines = evidence.record_block(ctx, ctx.records[f"customer:{self.pizza.pk}"])
        found = [line for line in lines if line.strip().startswith("rejected:")]
        self.assertEqual(len(found), 1)
        self.assertIn('"Move Pizza Hut to renewal" (Not relevant,', found[0])
        self.assertNotIn("Secret", "\n".join(lines))
        self.assertNotIn("Old one", "\n".join(lines))

    def test_at_most_three_and_never_quotable(self):
        for number in range(5):
            self.rejected(self.pizza, f"Rejected {number}", "other", days=number + 1)
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)
        ref = f"customer:{self.pizza.pk}"
        lines = [l for l in evidence.record_block(ctx, ctx.records[ref]) if "rejected:" in l]
        self.assertEqual(len(lines), 3)
        self.assertIsNone(evidence.match_line(ctx, ref, lines[0].strip()))
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_bundle_retry_reject services.agents.tests.test_rejection_feedback --parallel auto --noinput`
Expected: FAIL (404 on the routes; `KeyError: 'rejected'` or no line).

- [ ] **Step 3: Retry and reject**

Append to `bundle_run.py`:

```python
NOT_FAILED = "Only a failed step can be retried."
CANT_REJECT = "You can't reject this bundle."
CHOOSE_REASON = "Choose already handled, not relevant, wrong person or other."
LONG_NOTE = "Keep the note under 255 characters."
NOTE_LIMIT = 255


def retry_step(reader, pk, step_pk, data):
    """Retry one failed step under the bundle's lock (contract §5.2)."""
    bundle = settle_stuck(bundle_for(reader, pk))
    step = (
        bundle.steps.select_related("customer", "account", "organisation")
        .filter(pk=step_pk)
        .first()
    )
    if step is None:
        raise Refused(404, {"code": "NO_SUCH_BUNDLE", "detail": "No such bundle."})
    if not may_decide(reader, step):
        raise Refused(
            403,
            {
                "code": "CANT_RUN_STEP",
                "detail": f"You can't run step {step.position}.",
                "step": step.pk,
            },
        )
    if step.status != S.FAILED:
        raise Refused(
            409,
            {"code": "NOT_FAILED", "detail": NOT_FAILED, "bundle": bundle_payload(bundle, reader)},
        )
    fields = (data or {}).get("fields") or {}
    edited = None
    if fields:
        allowed = set(editable_keys(step))
        wrong = {key: [CANT_CHANGE] for key in fields if key not in allowed}
        if wrong:
            raise Refused(400, {"steps": {str(step.pk): wrong}})
        try:
            edited = REGISTRY[step.kind].edit(step, fields, reader)
        except FieldErrors as exc:
            raise Refused(400, {"steps": {str(step.pk): exc.errors}}) from None
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        if bundle.status == B.RUNNING:
            raise Refused(
                409,
                {
                    "code": "BUNDLE_RUNNING",
                    "detail": f"{_name(bundle.run_by)} is running this.",
                    "bundle": bundle_payload(bundle, reader),
                },
            )
        fresh = locked(step.pk)
        update = ["error"]
        fresh.error = ""
        if edited is not None and edited != fresh.payload:
            fresh.payload = edited
            update.append("payload")
            bundle.edited_at, bundle.edited_by = timezone.now(), reader
            bundle.save(update_fields=["edited_at", "edited_by", "updated_at"])
        fresh.save(update_fields=update)
        run_step(fresh.pk, reader, outputs_by_position(bundle), retry=True)
        audit.record(  # SOC2:LOG-01
            "agent_bundle.retried",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            metadata={"step": step.pk},
        )
    return finish(bundle.pk, reader, event="agent_bundle.run_finished")


def reject_bundle(reader, pk, data):
    """Reject every waiting step with a reason (contract §5.3, D16)."""
    from .deciding import reject_locked

    data = data if isinstance(data, dict) else {}
    bundle = settle_stuck(bundle_for(reader, pk))
    waiting = list(
        bundle.steps.filter(status=S.PROPOSED).select_related("customer", "account", "organisation")
    )
    if bundle.status == B.WAITING and waiting and not all(may_decide(reader, s) for s in waiting):
        raise Refused(403, {"code": "CANT_REJECT", "detail": CANT_REJECT})
    reason = data.get("reason")
    if reason not in AgentBundle.RejectReason.values:
        raise Refused(400, {"reason": [CHOOSE_REASON]})
    note = str(data.get("note") or "")
    if len(note) > NOTE_LIMIT:
        raise Refused(400, {"note": [LONG_NOTE]})
    now = timezone.now()
    with transaction.atomic():
        bundle = bundle_for(reader, pk, lock=True)
        refused = conflict(bundle, reader, now)
        if refused is not None:
            raise refused
        for step in bundle.steps.filter(status=S.PROPOSED).order_by("position"):
            reject_locked(locked(step.pk), reader, note)
        bundle.refresh_from_db()
        bundle.status = B.REJECTED
        bundle.reject_reason = reason
        bundle.reject_note = note
        bundle.save(update_fields=["status", "reject_reason", "reject_note", "updated_at"])
        audit.record(  # SOC2:LOG-01
            "agent_bundle.rejected",
            actor=reader,
            organisation=bundle.organisation,
            target=bundle,
            target_repr=str(bundle),
            # The reason only: the note is a person's free text.
            metadata={"reason": reason},
        )
    return bundle
```

(`finish` after a retry re-settles with `outcome`: `done` when every selected step is applied. A retried bundle's `run_finished_at` moves to the retry.)

Routes in `bundle_views.py`:

```python
class BundleRetryView(APIView):
    """POST /api/v1/agents/bundles/<id>/steps/<step_id>/retry/."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, step_pk):
        try:
            bundle = bundle_run.retry_step(request.user, pk, step_pk, request.data)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})


class BundleRejectView(APIView):
    """POST /api/v1/agents/bundles/<id>/reject/."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            bundle = bundle_run.reject_bundle(request.user, pk, request.data)
        except bundle_run.Refused as refused:
            return Response(refused.body, status=refused.status)
        return Response({"bundle": bundle_payload(bundle, request.user)})
```

`urls.py`:

```python
(
    path(
        "bundles/<int:pk>/steps/<int:step_pk>/retry/",
        bundle_views.BundleRetryView.as_view(),
        name="agent-bundle-retry",
    ),
)
(
    path(
        "bundles/<int:pk>/reject/",
        bundle_views.BundleRejectView.as_view(),
        name="agent-bundle-reject",
    ),
)
```

- [ ] **Step 4: The feedback lines**

In `services/agents/evidence.py`:
- `_row` gains `"rejected": []`.
- Add:

```python
REJECTED_DAYS = 30
REJECTED_PER_RECORD = 3
REJECTED_PREFIX = "rejected: "


def rejected_line(bundle):
    from .models import AgentBundle

    label = dict(AgentBundle.RejectReason.choices).get(bundle.reject_reason, "Other")
    return f'    {REJECTED_PREFIX}"{_q(bundle.title)}" ({label}, {bundle.updated_at.date().isoformat()})'


def _rejected(ctx, customer_ids, account_ids, now):
    """The bundles on the book's records rejected in the last 30 days, newest
    first, three per record: their title and reason, never the note (D16)."""
    from .models import AgentBundle

    rows = (
        AgentBundle.objects.filter(
            organisation=ctx.organisation,
            status=AgentBundle.Status.REJECTED,
            updated_at__gte=now - timedelta(days=REJECTED_DAYS),
        )
        .filter(Q(customer_id__in=customer_ids) | Q(account_id__in=account_ids))
        .only("title", "reject_reason", "updated_at", "customer_id", "account_id")
        .order_by("-updated_at", "-id")
    )
    for bundle in rows:
        ref = (
            _ref("account", bundle.account_id)
            if bundle.account_id
            else _ref("customer", bundle.customer_id)
        )
        row = ctx.records.get(ref)
        if row is not None and len(row["rejected"]) < REJECTED_PER_RECORD:
            row["rejected"].append(rejected_line(bundle))
```

  (`timedelta`, `Q` and `timezone` imports as needed.)
- In `build`, after `_people(...)`: `_rejected(ctx, customer_ids, account_ids, timezone.now())`.
- In `record_block`, before `return lines`: `lines.extend(row.get("rejected", []))`.
- In `record_lines`, skip the feedback lines so no step may cite them:

```python
return {
    line.strip() for line in lines if line.strip() and not line.strip().startswith(REJECTED_PREFIX)
}
```

- [ ] **Step 5: Run them to see them pass, and the evidence suites**

Run: `$PY manage.py test services.agents.tests.test_bundle_retry_reject services.agents.tests.test_rejection_feedback services.agents.tests.test_evidence services.agents.tests.test_run --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/bundle_run.py services/agents/bundle_views.py services/agents/urls.py services/agents/evidence.py services/agents/tests/test_bundle_retry_reject.py services/agents/tests/test_rejection_feedback.py
git commit -m "feat(agents): retry a failed step, reject a bundle with a reason the agent reads

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: The nightly pass makes bundles

**Files:**
- Modify: `services/agents/run.py`, `services/agents/placeholders.py`, `services/agents/prompt.py`
- Test: `services/agents/tests/test_run_bundles.py` (create)

**Interfaces:**
- Consumes: `bundles.routing_for`, `bundles.settle_stuck_all`, `deciding.settle_bundle_of`, `placeholders.check`.
- Produces: `placeholders.renumber(payload, mapping: dict[int, int]) -> dict` (raises `Invalid` for an index not in `mapping`); `run.WORKSPACE = "workspace"` (the bundle key of workspace-level steps); `run.bundle_title(first_title, count) -> str`; `kept` gains `"bundles"`, `"kinds"`, `"seen"`, `"placed"`; `run()` settles stuck runs first.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_run_bundles.py`:

```python
"""The nightly pass makes bundles (contract D1, D2, D4, §6.1): one per
record per pass in the model's order, Auto steps in their own done bundle,
re-proposed steps staying where they are, placeholders renumbered to the
bundle's positions, and expiries settling bundles."""

import json
from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents import evidence, run
from services.agents.models import AgentBundle, AgentPolicy
from services.agents.policy import profiles_for
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction
from services.work.clock import today_for

PATH = "services.agents.run.get_completion"


class RunBundlesTests(AgentsFixture):
    def setUp(self):
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles_for(self.org)

    def org_now(self):
        return Organisation.objects.get(pk=self.org.pk)

    def line(self, record):
        org = self.org_now()
        ctx = evidence.build(org, "cs", today=today_for(org))
        ref = f"customer:{record.pk}"
        return next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))

    def item(self, record, kind, payload, title):
        return {
            "kind": kind,
            "record": f"customer:{record.pk}",
            "title": title,
            "rationale": f"Because of {record.name}.",
            "evidence": [self.line(record)],
            "payload": payload,
        }

    def pass_(self, *items):
        with patch(PATH, return_value=json.dumps(list(items))):
            return run.run(self.org_now(), "cs")

    def test_one_bundle_per_record_in_the_models_order(self):
        result = self.pass_(
            self.item(
                self.pizza, "note.create", {"title": "Sponsor left", "body": "B"}, "File the news"
            ),
            self.item(
                self.dough, "record.lifecycle", {"stage": "renewal"}, "Move Dough Co to renewal"
            ),
            self.item(
                self.pizza, "record.lifecycle", {"stage": "renewal"}, "Move Pizza Hut to renewal"
            ),
        )
        self.assertEqual(result.proposed, 3)
        pizza = AgentBundle.objects.get(customer=self.pizza)
        self.assertEqual(pizza.title, "File the news, and 1 more")
        self.assertEqual(pizza.reason, "Because of Pizza Hut.")
        self.assertEqual(
            list(pizza.steps.order_by("position").values_list("kind", "position")),
            [("note.create", 1), ("record.lifecycle", 2)],
        )
        dough = AgentBundle.objects.get(customer=self.dough)
        self.assertEqual(
            (dough.title, dough.steps.count(), dough.status),
            ("Move Dough Co to renewal", 1, "waiting"),
        )
        self.assertEqual((pizza.routed_to, pizza.routed_user_id), ("owner", self.csm.pk))

    def test_an_auto_step_gets_its_own_done_bundle(self):
        AgentPolicy.objects.update_or_create(
            organisation=self.org, defaults={"levels": {"cs": {"note.create": "auto"}}}
        )
        self.pass_(
            self.item(
                self.pizza, "note.create", {"title": "Sponsor left", "body": "B"}, "File the news"
            ),
            self.item(
                self.pizza, "record.lifecycle", {"stage": "renewal"}, "Move Pizza Hut to renewal"
            ),
        )
        auto = AgentAction.objects.get(kind="note.create")
        self.assertEqual(
            (auto.status, auto.bundle.status, auto.bundle.run_by_id), ("applied", "done", None)
        )
        self.assertEqual(auto.bundle.steps.count(), 1)
        ask = AgentAction.objects.get(kind="record.lifecycle")
        self.assertEqual(
            (ask.bundle.status, ask.bundle.title), ("waiting", "Move Pizza Hut to renewal")
        )

    def test_a_reproposed_step_stays_and_an_unproposed_one_settles_its_bundle(self):
        note = self.item(
            self.pizza, "note.create", {"title": "Sponsor left", "body": "B"}, "File the news"
        )
        move = self.item(
            self.pizza, "record.lifecycle", {"stage": "renewal"}, "Move Pizza Hut to renewal"
        )
        self.pass_(note, move)
        first = AgentBundle.objects.get(customer=self.pizza)
        self.pass_(note)
        self.assertEqual(AgentBundle.objects.filter(customer=self.pizza).count(), 1)
        first.refresh_from_db()
        self.assertEqual(first.status, "waiting")
        self.assertEqual(
            sorted(first.steps.values_list("kind", "status")),
            [("note.create", "proposed"), ("record.lifecycle", "expired")],
        )
        self.pass_()  # an empty answer: nothing proposed
        first.refresh_from_db()
        self.assertEqual(first.status, "expired")

    def test_placeholders_are_renumbered_or_dropped(self):
        task = {
            "title": "Call the sponsor",
            "assignee_id": None,
            "due_in_days": 3,
            "priority": "high",
        }
        self.pass_(
            self.item(self.dough, "note.create", {"title": "Other", "body": "B"}, "Note Dough"),
            self.item(self.pizza, "task.create", task, "Call"),
            self.item(
                self.pizza,
                "note.create",
                {"title": "Logged", "body": "See {{step 1.task_url}}"},
                "Log",
            ),
            self.item(
                self.pizza,
                "note.create",
                {"title": "Bad", "body": "See {{step 5.task_url}}"},
                "Bad",
            ),
        )
        bundle = AgentBundle.objects.get(customer=self.pizza)
        self.assertEqual(
            list(bundle.steps.order_by("position").values_list("kind", "payload__body")),
            [("task.create", None), ("note.create", "See {{step 1.task_url}}")],
        )

    def test_a_stuck_run_is_settled_by_the_pass(self):
        with patch("services.agents.run.settle_stuck_all") as sweep:
            self.pass_()
        sweep.assert_called_once()
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_run_bundles --parallel auto --noinput`
Expected: FAIL (every step lands in its own bundle; `settle_stuck_all` is not imported in `run`).

- [ ] **Step 3: `placeholders.renumber`**

Append to `placeholders.py`:

```python
def renumber(payload, mapping):
    """`payload` with each `{{step N.key}}` pointing at `mapping[N]` (the
    model's Nth step for this record -> its position in the bundle).
    Invalid when N is not a step this pass placed in the bundle."""
    from .kinds import Invalid

    def replace(match):
        n = int(match.group(1))
        if n not in mapping:
            raise Invalid("a placeholder names a step that is not in the bundle")
        return f"{{{{step {mapping[n]}.{match.group(2)}}}}}"

    if not isinstance(payload, dict):
        return payload
    return {
        field: PATTERN.sub(replace, value) if isinstance(value, str) else value
        for field, value in payload.items()
    }
```

Add to `test_placeholders.py`'s `FillTests`:

```python
    def test_renumber(self):
        self.assertEqual(
            placeholders.renumber({"body": "See {{ step 2.task_url }}"}, {2: 1}),
            {"body": "See {{step 1.task_url}}"},
        )
        with self.assertRaises(Invalid):
            placeholders.renumber({"body": "{{step 3.task_url}}"}, {2: 1})
```

- [ ] **Step 4: Bundles in the pass**

In `services/agents/run.py`:

1. Imports: `from . import placeholders`, `from .bundles import routing_for, settle_stuck_all`, `from .deciding import settle_bundle_of` (with the existing deciding imports), `from .models import AgentBundle`.
2. Add:

```python
WORKSPACE = "workspace"


def bundle_title(first_title, count):
    """Contract D1: the first step's title, plus how many more."""
    if count <= 1:
        return first_title
    return f"{first_title}, and {count - 1} more"[:255]
```

3. In `run()`, `kept = {"keys": set(), "ids": set(), "builder": False}` becomes:

```python
        kept = {
            "keys": set(),
            "ids": set(),
            "builder": False,
            # bundle key (a record ref, or WORKSPACE) -> this pass's bundle
            "bundles": {},
            # bundle key -> {position: kind}
            "kinds": {},
            # bundle key -> how many items the answer gave for it so far
            "seen": {},
            # bundle key -> {the model's index: position in the bundle}
            "placed": {},
        }
```

   and after the `for item in items:` loop (before `_expire_unproposed`):

```python
        for key, bundle in kept["bundles"].items():
            count = len(kept["kinds"][key])
            if count > 1:
                bundle.title = bundle_title(bundle.title, count)
                bundle.save(update_fields=["title", "updated_at"])
```

   At the very start of the `try:` in `run()` (before `allowed = ...`): `settle_stuck_all(organisation, now)`.

4. In `_consider`, right after `row, fields = _record_fields(ctx, item, spec)` and `ref = ...`:

```python
    key_of_bundle = ref or WORKSPACE
    kept["seen"][key_of_bundle] = kept["seen"].get(key_of_bundle, 0) + 1
    index = kept["seen"][key_of_bundle]
    auto = level(prefs, agent, kind) == AUTO
```

   After `payload = spec.validate(...)`:

```python
    # Placeholders name the model's earlier steps for this record; they must be
    # steps placed in this pass's bundle, and are renumbered to its positions.
    placed = {} if auto else kept["placed"].get(key_of_bundle, {})
    payload = placeholders.renumber(payload, placed)
    position = len(kept["kinds"].get(key_of_bundle, {})) + 1
    placeholders.check(payload, position, kept["kinds"].get(key_of_bundle, {}))
```

   Inside the `with transaction.atomic():` block, replace the `action = AgentAction(...)` construction with:

```python
        bundle = None if auto else kept["bundles"].get(key_of_bundle)
        made_bundle = False
        if not auto and bundle is None:
            routed_to, routed_user = routing_for(fields.get("account") or fields.get("customer"))
            bundle = AgentBundle.objects.create(
                organisation=organisation,
                agent=agent,
                title=title,
                reason=rationale,
                routed_to=routed_to,
                routed_user=routed_user,
                **fields,
            )
            made_bundle = True
        action = AgentAction(
            organisation=organisation,
            agent=agent,
            batch=batch,
            kind=kind,
            target=target,
            title=title,
            rationale=rationale,
            evidence=evidence,
            payload=payload,
            generated_by=actor,
            bundle=bundle,
            position=1 if auto else position,
            **fields,
        )
        action.before = spec.current(action)
        action.save()
    if not auto:
        if made_bundle:
            kept["bundles"][key_of_bundle] = bundle
        kept["kinds"].setdefault(key_of_bundle, {})[position] = kind
        kept["placed"].setdefault(key_of_bundle, {})[index] = position
```

   (An Auto step saves with `bundle=None`, so `AgentAction.save()` makes its bundle of one.) Replace `if level(prefs, agent, kind) == AUTO:` with `if auto:`.

5. In `_apply_auto`, after `apply_action(fresh, None, auto=True)`: `settle_bundle_of(fresh)` (inside the same `with transaction.atomic():`), so the bundle of one is `done` with no runner.

- [ ] **Step 5: The prompt**

In `services/agents/prompt.py`:
- `PAYLOADS` gains (Tasks 10 and 11 register the kinds):

```python
    "survey.send": '{"name": <at most 120>, "survey_type": "nps"|"csat"|"ces", "subject": '
    '<at most 120>, "intro": <at most 500 or "">, "segment": <a segment.create payload>, '
    '"roles": [<contact roles>]}',
    "campaign.send": '{"name": <at most 120>, "segment": <a segment.create payload>, '
    '"roles": [<contact roles>], "subject": <at most 150>, "body": <plain text, at most '
    "1200 characters>}",
```

- `SYSTEM`'s first paragraph becomes: "You are the {label} inside a customer platform. You work for the people who own these records and act only inside the product: nothing you propose runs until a person reviews it, and only a person sends anything to a customer."
- In "Rules:", after "- At most one action per record and field." add:

```
- The actions for one record are run together, in the order you write them. \
A later action may use an earlier one's result with {{{{step N.key}}}}, N being \
that earlier action's place among this record's actions (1 for the first), and \
key one of: task_id, task_url (task.create); note_id (note.create); campaign_id, \
campaign_url, segment_id, segment_url (campaign.create, campaign.send); \
survey_id, survey_url (survey.send). Never refer to a later action.
```

   (Quadruple braces: `SYSTEM` goes through `str.format`, so `{{{{` prints `{{`.)
- The builder rule's list becomes "segment.create, scenario.create, campaign.create, campaign.send, survey.send, canvas.create and plan.template"; and the null-record list in `"record"` adds `campaign.send, survey.send`.

- [ ] **Step 6: Run them to see them pass, and every run suite**

Run: `$PY manage.py test services.agents.tests.test_run_bundles services.agents.tests.test_placeholders services.agents.tests.test_run services.agents.tests.test_run_builder services.agents.tests.test_run_drafts services.agents.tests.test_choices --parallel auto --noinput`
Expected: PASS. (`test_choices` may pin the prompt's text or the PAYLOADS keys against the registry; if it asserts PAYLOADS keys equal REGISTRY keys, it passes after Tasks 10–11 register the kinds: run it again then.)

- [ ] **Step 7: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/run.py services/agents/placeholders.py services/agents/prompt.py services/agents/tests/test_run_bundles.py services/agents/tests/test_placeholders.py
git commit -m "feat(agents): the nightly pass makes one bundle per record

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `survey.send`

**Files:**
- Create: `services/agents/actions/surveys.py`
- Modify: `services/agents/registry.py`, `services/agents/builder.py`, `services/surveys/audience.py`, `services/agents/undo.py` (the `CHANGE` word)
- Test: `services/agents/tests/test_survey_send_kind.py` (create)

**Interfaces:**
- Consumes: `builder.check_definition`, `create_segment`, `release_segment`, `stamp`, `as_request`, `text`, `NAME_LIMIT`, `bulk`; `surveys.serializers.SendWriteSerializer`, `clean_roles`; `surveys.sending.claim`, `Refusal`, `email_is_set_up`, `EMAIL_NOT_SET_UP`; `surveys.questions.question_for`; `surveys.models.SurveySend`, `MAX_PEOPLE`; `kinds.StepFailed`.
- Produces: `surveys.audience.reach(kind, roles, viewer, members) -> (people, hidden, capped)` (public wrapper of `_candidates`); `builder.audience_counts(reader, definition, roles, *, today) -> {"contacts", "records", "record_noun"}`; `actions.surveys.SEND` (`Kind` key `survey.send`); undo's `CHANGE["survey.send"] = "survey"`, `CHANGE["campaign.send"] = "campaign"`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_survey_send_kind.py`:

```python
"""survey.send (contract §7.1): validated as the agent writes it, previewed
for the reader with the audience, made and sent as the runner on Run, or
saved as a draft only; a refused send keeps the draft for Retry. Nothing
leaves the building: the send is only claimed (invites queued)."""

from django.core import mail

from services.agents.kinds import Invalid
from services.agents.models import AgentBundle
from services.agents.registry import REGISTRY
from services.agents.tests.builder_fixtures import definition
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture
from services.surveys.models import SurveyInvite, SurveySend
from services.surveys.tests.fixtures import contact

SPEC = REGISTRY["survey.send"]


def payload(**fields):
    return {
        "name": "Q4 NPS",
        "survey_type": "nps",
        "subject": "Two minutes?",
        "intro": "We'd love your view.",
        "segment": definition(),
        "roles": ["champion"],
        "draft_only": False,
        **fields,
    }


class SurveySendTests(BundleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.dough, "Ann")
        contact(cls.taco, "Tia")

    def bundle(self, **fields):
        return self.bundle_of(
            None, ("survey.send", payload(**fields)), agent="ops", title="Ask for NPS"
        )

    def run(self, user, bundle, **fields):
        step = bundle.steps.get()
        body = {
            "steps": [{"id": step.pk, "selected": True, **({"fields": fields} if fields else {})}]
        }
        return self.client_for(user).post(f"{BUNDLES}{bundle.pk}/run/", body, format="json")

    def test_the_registry_entry(self):
        self.assertEqual(
            (SPEC.max_level, SPEC.agents, SPEC.workspace_level, SPEC.builder, SPEC.irreversible),
            ("ask", ("ops",), True, True, True),
        )
        self.assertEqual(
            SPEC.editable, ("name", "survey_type", "subject", "intro", "roles", "draft_only")
        )
        self.assertEqual(SPEC.outputs, ("survey_id", "survey_url", "segment_id", "segment_url"))

    def test_preview_counts_the_audience_for_the_reader(self):
        bundle = self.bundle()
        body = self.client_for(self.admin).get(f"{BUNDLES}{bundle.pk}/").json()
        survey = body["steps"][0]["preview"]["survey"]
        self.assertEqual(
            survey["audience"], {"contacts": 2, "records": 2, "record_noun": "organisations"}
        )
        self.assertEqual(
            survey["question"], "How likely are you to recommend Acme Inc to a friend or colleague?"
        )
        self.assertEqual(
            (survey["limit"], survey["segment"], survey["roles"]),
            (500, "Poor health", ["Champion"]),
        )
        self.assertTrue(body["steps"][0]["irreversible"])

    def test_run_makes_and_sends_it_as_the_runner(self):
        bundle = self.bundle()
        response = self.run(self.admin, bundle)
        self.assertEqual(response.status_code, 200, response.data)
        step = response.json()["bundle"]["steps"][0]
        self.assertEqual(step["status"], "applied")
        send = SurveySend.objects.get(pk=step["outputs"]["survey_id"])
        self.assertEqual(
            (send.owner_id, send.status, send.segment.owner_id),
            (self.admin.pk, "sending", self.admin.pk),
        )
        self.assertEqual(step["outputs"]["survey_url"], f"/surveys/{send.pk}")
        self.assertEqual(SurveyInvite.objects.filter(send=send, status="queued").count(), 2)
        self.assertEqual(len(mail.outbox), 0)  # delivery is the minute runner's; never run in tests
        self.assertTrue(step["irreversible"])
        self.assertEqual(step["undo"], {"allowed": False, "until": None, "reason": "irreversible"})

    def test_save_as_draft_only(self):
        bundle = self.bundle()
        step = self.run(self.admin, bundle, draft_only=True).json()["bundle"]["steps"][0]
        send = SurveySend.objects.get(pk=step["outputs"]["survey_id"])
        self.assertEqual(send.status, "draft")
        self.assertFalse(step["irreversible"])
        self.assertTrue(step["undo"]["allowed"])
        undone = self.client_for(self.admin).post(f"/api/v1/agents/actions/{step['id']}/undo/")
        self.assertEqual(undone.status_code, 200, undone.data)
        self.assertFalse(SurveySend.objects.filter(pk=send.pk).exists())

    def test_a_refused_send_keeps_the_draft_and_retry_sends_it(self):
        bundle = self.bundle()
        with self.settings(
            DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"
        ):
            step = self.run(self.admin, bundle).json()["bundle"]["steps"][0]
        self.assertEqual(
            (step["status"], step["error"]),
            ("failed", "Email isn't set up for this workspace yet, so surveys can't be sent."),
        )
        drafts = SurveySend.objects.filter(owner=self.admin)
        self.assertEqual(list(drafts.values_list("status", flat=True)), ["draft"])
        self.assertEqual(AgentBundle.objects.get(pk=bundle.pk).status, "partly_done")
        retried = (
            self.client_for(self.admin)
            .post(f"{BUNDLES}{bundle.pk}/steps/{step['id']}/retry/", {}, format="json")
            .json()["bundle"]
        )
        self.assertEqual((retried["status"], retried["steps"][0]["status"]), ("done", "applied"))
        self.assertEqual(list(drafts.values_list("status", flat=True)), ["sending"])

    def test_validate_refuses_what_the_agent_may_not_write(self):
        from services.accounts.models import Organisation
        from services.agents import evidence

        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)
        clean = SPEC.validate(payload(), None, ctx, [])
        self.assertEqual(clean["draft_only"], False)
        for bad in (
            payload(survey_type="poll"),
            payload(subject=""),
            payload(roles=[]),
            payload(segment={"kind": "customer"}),
        ):
            with self.subTest(bad=bad), self.assertRaises(Invalid):
                SPEC.validate(bad, None, ctx, [])

    def test_edits(self):
        bundle = self.bundle()
        step = bundle.steps.get()
        edited = SPEC.edit(
            step, {"subject": "Quick question", "survey_type": "csat"}, self.fresh(self.admin)
        )
        self.assertEqual((edited["subject"], edited["survey_type"]), ("Quick question", "csat"))
        from services.agents.kinds import FieldErrors

        with self.assertRaises(FieldErrors) as caught:
            SPEC.edit(step, {"survey_type": "poll", "roles": []}, self.fresh(self.admin))
        self.assertEqual(set(caught.exception.errors), {"survey_type", "roles"})
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_survey_send_kind --parallel auto --noinput`
Expected: FAIL with `KeyError: 'survey.send'`.

- [ ] **Step 3: `reach` and `audience_counts`**

In `services/surveys/audience.py`, after `_candidates`:

```python
def reach(kind, roles, viewer, members):
    """`_candidates` for a segment kind and members that are not a saved
    segment (an agent's unsaved definition, counted for the preview)."""
    from types import SimpleNamespace

    return _candidates(SimpleNamespace(kind=kind), roles, viewer, members)
```

In `services/agents/builder.py`, after `member_counts`:

```python
RECORD_NOUNS = {"customer": "organisations", "account": "accounts", "contact": "contacts"}


def audience_counts(reader, definition, roles, *, today):
    """Who a survey or campaign on `definition` would reach, as `reader` sees
    it (contract §7.1): the matching records they may open, and those
    records' contacts with a chosen role and an email. `id IN` subqueries."""
    from services.surveys.audience import reach

    kind = definition["kind"]
    keys = [c.get("field", "") for c in leaves(definition["rules"])]
    cache = {"attributes": registry.attributes_for(reader.organisation_id, keys)}
    compiled = Compiler(kind, user=reader, today=today, cache=cache).compile(definition["rules"])
    # SOC2:AUTH-02 counted over the records the reader may open, never named
    members = compiled.apply(visible_records(kind, reader))
    people, _hidden, _capped = reach(kind, roles, reader, members)
    return {
        "contacts": sum(1 for person in people if person.email.strip()),
        "records": members.count(),
        "record_noun": RECORD_NOUNS[kind],
    }
```

- [ ] **Step 4: The kind**

Create `services/agents/actions/surveys.py`:

```python
"""survey.send (Agent bundles, contract §7.1): a survey on its own new
segment, as the Ops agent writes it. On Run the runner owns the segment and
the survey and it is sent with the "Send now" button's own rules; "Save as
draft only" stops at the draft. A refused send keeps the draft so Retry
sends that same draft. Sent, it can't be undone; a draft is undone while
unsent and unedited, with its segment."""

from django.utils import timezone
from rest_framework import serializers

from core import audit
from services.customers.models import Contact, Survey
from services.metrics.models import AgentAction
from services.segments.models import Segment
from services.surveys.models import MAX_PEOPLE, SurveySend
from services.surveys.questions import question_for
from services.surveys.serializers import SendWriteSerializer, roles_field
from services.surveys.sending import EMAIL_NOT_SET_UP, Refusal, claim, email_is_set_up

from .. import builder
from ..edits import NO_NAME, checked, text_field
from ..kinds import ASK, ChangedSince, FieldErrors, Invalid, Kind, Stale, StepFailed

SUBJECT_LIMIT = 120
INTRO_LIMIT = 500
TYPES = tuple(Survey.SurveyType.values)
ROLE_LABELS = dict(Contact.Role.choices)
CHOOSE_TYPE = "Choose NPS, CSAT or CES."
NO_SUBJECT = "Write a subject."


def _roles(raw, kind):
    if not isinstance(raw, list) or not all(role in ROLE_LABELS for role in raw):
        raise Invalid("roles from the contact roles")
    roles = list(dict.fromkeys(raw))
    if kind == "contact":
        return []
    if not roles:
        raise Invalid("at least one role")
    return roles


def validate(payload, row, ctx, evidence):
    if row is not None:
        raise Invalid("a survey is workspace-level")
    if payload.get("survey_type") not in TYPES:
        raise Invalid("choose nps, csat or ces")
    segment = builder.check_definition(payload.get("segment"), ctx)
    return {
        "name": builder.text(payload.get("name"), builder.NAME_LIMIT),
        "survey_type": payload["survey_type"],
        "subject": builder.text(payload.get("subject"), SUBJECT_LIMIT),
        "intro": builder.text(payload.get("intro"), INTRO_LIMIT, required=False),
        "segment": segment,
        "roles": _roles(payload.get("roles"), segment["kind"]),
        "draft_only": False,
    }


def texts(payload):
    found = [payload.get("name"), payload.get("subject"), payload.get("intro")]
    return found + builder.definition_texts(payload.get("segment") or {})


class _Edit(serializers.Serializer):
    name = text_field(builder.NAME_LIMIT, NO_NAME, "Keep the name under 120 characters.")
    survey_type = serializers.ChoiceField(
        required=False,
        choices=TYPES,
        error_messages={"invalid_choice": CHOOSE_TYPE, "null": CHOOSE_TYPE},
    )
    subject = text_field(SUBJECT_LIMIT, NO_SUBJECT, "Keep the subject under 120 characters.")
    intro = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=INTRO_LIMIT,
        error_messages={"max_length": "Keep the intro under 500 characters."},
    )
    roles = roles_field(required=False)
    draft_only = serializers.BooleanField(required=False)


def edit(action, fields, runner):
    clean = checked(_Edit, fields)
    payload = {**action.payload, **clean}
    if "roles" in clean:
        kind = (payload.get("segment") or {}).get("kind")
        if kind != "contact" and not clean["roles"]:
            raise FieldErrors({"roles": ["Choose at least one role."]})
    return payload


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    definition = payload.get("segment") or {}
    audience = None
    if definition.get("rules"):
        audience = builder.audience_counts(
            reader, definition, payload.get("roles", []), today=timezone.localdate()
        )
    survey_type = payload.get("survey_type", "nps")
    return {
        "survey": {
            "name": payload.get("name", ""),
            "survey_type": survey_type,
            "question": question_for(survey_type, action.organisation.name),
            "subject": payload.get("subject", ""),
            "intro": payload.get("intro", ""),
            "segment": definition.get("name", ""),
            "roles": [ROLE_LABELS.get(role, role) for role in payload.get("roles", [])],
            "audience": audience,
            "limit": MAX_PEOPLE,
        }
    }


def _draft(action, actor):
    """The draft this step made before (a Retry), else a new one on a new segment."""
    made = SurveySend.objects.filter(
        pk=(action.result or {}).get("survey_id"), owner=actor, status=SurveySend.Status.DRAFT
    ).first()
    if made is not None:
        return made, made.segment
    payload = action.payload
    segment = builder.create_segment(action, payload["segment"], actor)
    data = {
        "name": payload["name"],
        "survey_type": payload["survey_type"],
        "subject": payload["subject"],
        "intro": payload.get("intro", ""),
        "segment": segment.pk,
        "roles": payload["roles"],
    }
    # SOC2:AUTH-02 a survey goes only to its owner's own segment
    serializer = SendWriteSerializer(data=data, context={"request": builder.as_request(actor)})
    if not serializer.is_valid():
        raise Stale("the survey no longer holds for the runner")
    made = serializer.save(owner=actor, organisation_id=action.organisation_id)
    audit.record(  # SOC2:LOG-01
        "survey.created",
        actor=actor,
        organisation=action.organisation,
        target=made,
        metadata={"survey_type": made.survey_type, "agent_action": action.pk},
    )
    return made, segment


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person runs a survey and owns it")
    made, segment = _draft(action, actor)
    result = {"survey_id": made.pk, "segment_id": segment.pk if segment else None}
    if not action.payload.get("draft_only"):
        if not email_is_set_up():
            raise StepFailed(EMAIL_NOT_SET_UP, result=result)
        try:
            claim(made.pk, actor, today=timezone.localdate(), now=timezone.now(), actor=actor)
        except Refusal as refused:
            raise StepFailed(str(refused.body.get("detail", "")), result=result) from None
    after = {
        "survey_id": made.pk,
        "survey_updated_at": builder.stamp(SurveySend, made.pk),
        "segment_id": result["segment_id"],
        "segment_updated_at": builder.stamp(Segment, result["segment_id"]),
    }
    return after, result


def undo(action, actor):
    """A draft-only run: the draft (while unsent and unedited), then its segment."""
    after = action.after or {}
    made = (
        SurveySend.objects.select_for_update(of=("self",)).filter(pk=after.get("survey_id")).first()
    )
    if made is not None:
        if made.status != SurveySend.Status.DRAFT:
            raise ChangedSince("This survey has been sent.")
        if made.updated_at.isoformat() != after.get("survey_updated_at"):
            raise ChangedSince("This survey has been edited since.")
        audit.record(
            "survey.deleted", actor=actor, organisation=action.organisation, target=made
        )  # SOC2:LOG-01
        made.delete()
    released = builder.release_segment(
        action, after.get("segment_id"), after.get("segment_updated_at"), actor
    )
    if made is None and not released:
        raise ChangedSince("This survey has been deleted.")


SEND = Kind(
    key=AgentAction.Kind.SURVEY_SEND,
    label="Send a survey",
    example="Ask champions of at-risk organisations for an NPS score",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"survey:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    per_reader=True,
    texts=texts,
    irreversible=True,
    editable=("name", "survey_type", "subject", "intro", "roles", "draft_only"),
    edit=edit,
    outputs=("survey_id", "survey_url", "segment_id", "segment_url"),
)
```

Check the audit event names `survey.created` / `survey.deleted` against `docs/audit-events.md` (the survey views write `survey.created`; use the delete view's exact name). Register in `services/agents/registry.py`: `from .actions import surveys` and `surveys.SEND` after `initiatives.CREATE`. In `undo.py`'s `CHANGE`, add `"survey.send": "survey"` and `"campaign.send": "campaign"` (Task 11's kind).

- [ ] **Step 5: Run them to see them pass, and the builder suites**

Run: `$PY manage.py test services.agents.tests.test_survey_send_kind services.agents.tests.test_builder_registry services.agents.tests.test_choices services.surveys --parallel auto --noinput`
Expected: PASS. (`test_builder_registry` may list the builder kinds: add `survey.send`.)

- [ ] **Step 6: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/actions/surveys.py services/agents/registry.py services/agents/builder.py services/agents/undo.py services/surveys/audience.py services/agents/tests/test_survey_send_kind.py services/agents/tests/test_builder_registry.py
git commit -m "feat(agents): survey.send, made and sent on Run or saved as a draft

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `campaign.send`

**Files:**
- Create: `services/agents/actions/campaign_sends.py`
- Modify: `services/agents/registry.py`
- Test: `services/agents/tests/test_campaign_send_kind.py` (create)

**Interfaces:**
- Consumes: `actions.campaigns.validate`, `apply`, `undo`, `preview`, `texts`, `edit`, `_CampaignEdit`; `builder.audience_counts`; `campaigns.sending.claim`, `Refusal`, `before_claim`; `campaigns.models.CampaignSend`.
- Produces: `actions.campaign_sends.SEND` (`campaign.send`), outputs `("campaign_id", "campaign_url", "segment_id", "segment_url", "send_id")`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_campaign_send_kind.py`:

```python
"""campaign.send (contract §7.2): campaign.create plus sending on Run (the
send is only claimed: deliveries queued, nothing emailed), "Save as draft
only", a refusal failing the step with a Retry that claims the same campaign."""

from django.core import mail

from services.agents.registry import REGISTRY
from services.agents.tests.builder_fixtures import definition
from services.agents.tests.bundle_fixtures import BUNDLES, BundleFixture
from services.campaigns.models import Campaign, CampaignSend
from services.surveys.tests.fixtures import contact

SPEC = REGISTRY["campaign.send"]


def payload(**fields):
    return {
        "name": "Check-in",
        "segment": definition(),
        "roles": ["champion"],
        "subject": "Hello",
        "body": "Hi {first_name}",
        "draft_only": False,
        **fields,
    }


class CampaignSendTests(BundleFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.dough, "Ann")

    def run(self, user, bundle, **fields):
        step = bundle.steps.get()
        body = {
            "steps": [{"id": step.pk, "selected": True, **({"fields": fields} if fields else {})}]
        }
        return self.client_for(user).post(f"{BUNDLES}{bundle.pk}/run/", body, format="json")

    def bundle(self, **fields):
        return self.bundle_of(
            None, ("campaign.send", payload(**fields)), agent="ops", title="Check in"
        )

    def test_the_registry_entry_and_preview(self):
        self.assertEqual((SPEC.irreversible, SPEC.max_level, SPEC.agents), (True, "ask", ("ops",)))
        self.assertEqual(SPEC.editable, ("name", "subject", "body", "roles", "draft_only"))
        body = self.client_for(self.admin).get(f"{BUNDLES}{self.bundle().pk}/").json()
        campaign = body["steps"][0]["preview"]["campaign"]
        self.assertEqual(
            campaign["audience"], {"contacts": 1, "records": 2, "record_noun": "organisations"}
        )
        self.assertEqual(campaign["subject"], "Hello")

    def test_run_sends_it_as_the_runner(self):
        step = self.run(self.admin, self.bundle()).json()["bundle"]["steps"][0]
        self.assertEqual(step["status"], "applied", step)
        made = Campaign.objects.get(pk=step["outputs"]["campaign_id"])
        sent = CampaignSend.objects.get(campaign=made)
        self.assertEqual(
            (made.owner_id, sent.sent_by_id, sent.kind), (self.admin.pk, self.admin.pk, "manual")
        )
        self.assertEqual(step["outputs"]["send_id"], sent.pk)
        self.assertEqual(step["outputs"]["campaign_url"], f"/campaigns/{made.pk}")
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(step["undo"]["reason"], "irreversible")

    def test_draft_only_and_a_refusal_with_retry(self):
        step = self.run(self.admin, self.bundle(), draft_only=True).json()["bundle"]["steps"][0]
        self.assertFalse(
            CampaignSend.objects.filter(campaign_id=step["outputs"]["campaign_id"]).exists()
        )
        self.assertFalse(step["irreversible"])

        bundle = self.bundle(name="Second", segment=definition(name="Second segment"))
        with self.settings(
            DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend"
        ):
            step = self.run(self.admin, bundle).json()["bundle"]["steps"][0]
        self.assertEqual(step["status"], "failed")
        self.assertEqual(Campaign.objects.filter(name="Second").count(), 1)
        retried = (
            self.client_for(self.admin)
            .post(f"{BUNDLES}{bundle.pk}/steps/{step['id']}/retry/", {}, format="json")
            .json()["bundle"]
        )
        self.assertEqual(retried["steps"][0]["status"], "applied")
        self.assertEqual(Campaign.objects.filter(name="Second").count(), 1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_campaign_send_kind --parallel auto --noinput`
Expected: FAIL with `KeyError: 'campaign.send'`.

- [ ] **Step 3: The kind**

Create `services/agents/actions/campaign_sends.py`:

```python
"""campaign.send (Agent bundles, contract §7.2): campaign.create, then sent
on Run as the runner with the campaign page's own rules, unless "Save as
draft only". A refusal keeps the campaign so Retry claims the same one."""

from django.utils import timezone
from rest_framework import serializers

from services.campaigns.models import Campaign, CampaignSend
from services.campaigns.sending import Refusal, before_claim, claim
from services.metrics.models import AgentAction
from services.segments.models import Segment
from services.surveys.serializers import roles_field

from .. import builder
from ..edits import checked
from ..kinds import ASK, FieldErrors, Kind, StepFailed
from . import campaigns


def validate(payload, row, ctx, evidence):
    return {**campaigns.validate(payload, row, ctx, evidence), "draft_only": False}


class _Edit(campaigns._CampaignEdit):
    roles = roles_field(required=False)
    draft_only = serializers.BooleanField(required=False)


def edit(action, fields, runner):
    clean = checked(_Edit, fields)
    payload = {**action.payload, **clean}
    if (
        "roles" in clean
        and (payload.get("segment") or {}).get("kind") != "contact"
        and not clean["roles"]
    ):
        raise FieldErrors({"roles": ["Choose at least one role."]})
    return payload


def preview(action, reader):
    shown = campaigns.preview(action)
    payload = action.payload if isinstance(action.payload, dict) else {}
    definition = payload.get("segment") or {}
    shown["campaign"]["audience"] = (
        builder.audience_counts(
            reader, definition, payload.get("roles", []), today=timezone.localdate()
        )
        if definition.get("rules")
        else None
    )
    shown["campaign"]["limit"] = None
    return shown


def _made(action, actor):
    found = Campaign.objects.filter(
        pk=(action.result or {}).get("campaign_id"), owner=actor
    ).first()
    if found is not None:
        return found, {"campaign_id": found.pk, "segment_id": found.segment_id}, None
    after, result = campaigns.apply(action, actor)
    return Campaign.objects.get(pk=result["campaign_id"]), result, after


def apply(action, actor, **_):
    made, result, after = _made(action, actor)
    if after is None:
        after = {
            "campaign_id": made.pk,
            "campaign_updated_at": builder.stamp(Campaign, made.pk),
            "segment_id": made.segment_id,
            "segment_updated_at": builder.stamp(Segment, made.segment_id),
        }
    if not action.payload.get("draft_only"):
        refusal = before_claim(made)
        if refusal:
            raise StepFailed(refusal["detail"], result=result)
        try:
            sent = claim(
                made.pk,
                kind=CampaignSend.Kind.MANUAL,
                by=actor,
                today=timezone.localdate(),
                now=timezone.now(),
            )
        except Refusal as refused:
            raise StepFailed(str(refused.body.get("detail", "")), result=result) from None
        result = {**result, "send_id": sent.pk}
    return after, result


SEND = Kind(
    key=AgentAction.Kind.CAMPAIGN_SEND,
    label="Send a campaign",
    example="Send a check-in campaign to champions of at-risk organisations",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"campaign:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=campaigns.undo,
    workspace_level=True,
    builder=True,
    per_reader=True,
    texts=campaigns.texts,
    irreversible=True,
    editable=("name", "subject", "body", "roles", "draft_only"),
    edit=edit,
    outputs=("campaign_id", "campaign_url", "segment_id", "segment_url", "send_id"),
)
```

(`campaigns.undo` already refuses "This campaign has been sent." once a send exists; for a sent step the panel shows `irreversible` and never offers Undo.) `campaign.send` and `campaign.create` share the target prefix `campaign:<name>`: the one-open rule keeps one open proposal per campaign name, as intended. Register `campaign_sends.SEND` in `registry.py` after `surveys.SEND`.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_campaign_send_kind services.agents.tests.test_campaign_kind services.agents.tests.test_outside_kinds services.agents.tests.test_choices services.campaigns --parallel auto --noinput`
Expected: PASS. Update `test_outside_kinds.test_every_d1_kind_is_inside_and_only_the_sends_are_irreversible`'s expectation to `["campaign.send", "survey.send"]` (and drop its trailing comment).

- [ ] **Step 5: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/actions/campaign_sends.py services/agents/registry.py services/agents/tests/test_campaign_send_kind.py services/agents/tests/test_outside_kinds.py
git commit -m "feat(agents): campaign.send, sent on Run or saved as a draft

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12: Work's Mine reads bundles (`kind: "bundle"`)

**Files:**
- Modify: `services/work/feed_shape.py`, `services/work/feed_decide.py`, `services/work/feed.py`
- Test: `services/work/tests/test_feed_bundles.py` (create); update `services/work/tests/test_feed_api.py`, `test_feed_decide.py`, `test_feed_shape.py`, `test_expired_proposals.py`, `test_privacy.py` (see Step 6)

**Interfaces:**
- Consumes: `brain.desk.agent_actions`, `session_ids_seen_whole`; `agents.bundles.readable`, `live_waiting`; `bundle_payloads.item_detail`.
- Produces: `feed_shape.BUNDLE = "bundle"`; `KINDS = (BUNDLE, RULE_REVIEW, QUESTION, DRAFT, TASK, TODO, SUGGESTION)`; `DECIDE_KINDS = (RULE_REVIEW, BUNDLE, QUESTION, DRAFT)`; `ALIASES = {"approval": "bundle"}`; `CHOOSE_KIND = "Choose bundle, rule_review, question, draft, task, todo or suggestion."`; `feed_decide.waiting_bundles(reader, steps) -> QuerySet[AgentBundle]`; `feed_decide.bundle_items(bundles, reader, extra=None) -> list[dict]` (`extra(bundle) -> dict` merged into each row); `feed_decide.Bundles(reader)` (`kind=BUNDLE`, `rank=1`), `MAKERS[BUNDLE]`. `Approvals` is deleted.

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_feed_bundles.py`:

```python
"""Mine's bundle rows (contract §4.3, §10.1, D9): one row per waiting bundle
on the reader's desk, the twice-filter, the 14-day rule, `approval` read as
`bundle`, and the badge counting bundles."""

from datetime import timedelta

from django.utils import timezone

from services.agents.models import AgentBundle
from services.work.tests.feed_fixtures import COUNT, FeedFixture


class FeedBundleTests(FeedFixture):
    def bundle(self, record, *titles):
        first = self.proposal(record, title=titles[0])
        for title in titles[1:]:
            self.proposal(record, title=title)
        return first.bundle

    def test_a_bundle_row(self):
        bundle = self.bundle(self.pizza, "Save play")
        body = self.body(self.csm)
        (row,) = self.group(body, "decide")["items"]
        self.assertEqual(
            {k: row[k] for k in ("key", "kind", "id", "title", "actions")},
            {
                "key": f"bundle:{bundle.pk}",
                "kind": "bundle",
                "id": bundle.pk,
                "title": "Save play",
                "actions": ["open"],
            },
        )
        self.assertEqual(
            row["record"], {"type": "customer", "id": self.pizza.pk, "name": "Pizza Hut"}
        )
        self.assertEqual(row["from"], {"type": "agent", "label": "Ops agent"})
        self.assertEqual(
            row["detail"],
            {
                "reason": "Because the figures say so.",
                "step_count": 1,
                "source": {"kind": "nightly", "label": "Nightly review"},
                "kinds": ["Create a task"],
                "can_run": True,
            },
        )

    def test_the_twice_filter_and_hidden(self):
        self.bundle(self.pizza, "Mine")
        self.bundle(self.soup, "Not Carl's")
        body = self.body(self.csm)
        self.assertEqual([i["title"] for i in self.group(body, "decide")["items"]], ["Mine"])
        self.assertEqual(body["hidden"], 0)  # Soup Co is Mona's desk, not Carl's
        mona = self.body(self.mona)
        self.assertEqual([i["title"] for i in self.group(mona, "decide")["items"]], ["Not Carl's"])

    def test_a_bundle_14_days_old_is_neither_shown_nor_counted(self):
        bundle = self.bundle(self.pizza, "Old")
        AgentBundle.objects.filter(pk=bundle.pk).update(
            created_at=timezone.now() - timedelta(days=14)
        )
        self.assertEqual(self.group(self.body(self.csm), "decide")["items"], [])
        self.assertEqual(self.as_user(self.fresh(self.csm)).get(COUNT).json()["decide"], 0)

    def test_approval_is_read_as_bundle(self):
        self.bundle(self.pizza, "Save play")
        for kind in ("approval", "bundle"):
            with self.subTest(kind=kind):
                items = self.group(self.body(self.csm, kind=kind), "decide")["items"]
                self.assertEqual([i["kind"] for i in items], ["bundle"])
        response = self.feed(self.csm, kind="approvals")
        self.assertEqual(
            response.json(),
            {"kind": ["Choose bundle, rule_review, question, draft, task, todo or suggestion."]},
        )

    def test_the_badge_counts_bundles_not_steps(self):
        first = self.proposal(self.pizza, title="One")
        self.proposal(self.pizza, title="Two")  # its own bundle of one
        from services.metrics.models import AgentAction

        AgentAction.objects.filter(title="Two").update(bundle=first.bundle, position=2)
        AgentBundle.objects.filter(steps__isnull=True).delete()
        self.assertEqual(self.as_user(self.fresh(self.csm)).get(COUNT).json()["decide"], 1)

    def fresh(self, user):
        from services.accounts.models import User

        return User.objects.get(pk=user.pk)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.work.tests.test_feed_bundles --parallel auto --noinput`
Expected: FAIL (rows are `approval` with key `agent_action:<id>`).

- [ ] **Step 3: The words**

In `services/work/feed_shape.py`: add `BUNDLE = "bundle"` (keep `APPROVAL = "approval"` for the alias), set

```python
#: Every kind, in the order `failed` lists them.
KINDS = (BUNDLE, RULE_REVIEW, QUESTION, DRAFT, TASK, TODO, SUGGESTION)
#: The decide group's kinds, in the order a tie on `at` is broken.
DECIDE_KINDS = (RULE_REVIEW, BUNDLE, QUESTION, DRAFT)
#: Old kind words read as their new ones (Agent bundles D9).
ALIASES = {APPROVAL: BUNDLE}
CHOOSE_KIND = "Choose bundle, rule_review, question, draft, task, todo or suggestion."
```

and in `parse_kinds`: `asked = {ALIASES.get(part.strip(), part.strip()) for part in raw.split(",") if part.strip()}`.

- [ ] **Step 4: The `Bundles` source**

In `services/work/feed_decide.py` replace the `Approvals` class with:

```python
def waiting_bundles(reader, steps):
    """The waiting bundles (inside their 14 days) holding any of `steps`."""
    from services.agents.bundles import live_waiting
    from services.agents.models import AgentBundle

    return live_waiting(
        AgentBundle.objects.filter(
            organisation_id=reader.organisation_id, id__in=steps.values("bundle_id")
        )
    )


def bundle_items(bundles, reader, extra=None):
    """FeedItems for `bundles` (a page), their steps read once for the page."""
    from services.agents import bulk
    from services.agents.bundle_payloads import item_detail

    steps = {}
    rows = AgentAction.objects.filter(bundle_id__in=[b.pk for b in bundles]).select_related(
        "customer__owner", "account__owner", "organisation"
    )
    for step in rows.order_by("bundle_id", "position"):
        steps.setdefault(step.bundle_id, []).append(step)
    every = [step for found in steps.values() for step in found]
    out = []
    # The rights' reads are done once for the page, not once per row.
    with bulk.using(every):
        for bundle in bundles:
            record = bundle.record
            row = item(
                key=f"bundle:{bundle.pk}",
                kind=BUNDLE,
                pk=bundle.pk,
                title=bundle.title,
                record=None if record is None else record_ref(record),
                source={"type": "agent", "label": AGENTS.get(bundle.agent, "AI agent")},
                at=bundle.created_at,
                actions=["open"],
                detail=item_detail(bundle, reader, steps.get(bundle.pk, [])),
            )
            out.append({**row, **(extra(bundle) if extra else {})})
    return out


class Bundles(Source):
    kind, rank = BUNDLE, 1
    related = ("customer__owner", "account__owner")

    def __init__(self, reader):
        from services.agents.bundles import readable

        self.reader = reader
        self.sessions = desk.session_ids_seen_whole(reader)
        steps = desk.agent_actions(reader, resolve(reader, ME), self.sessions).waiting
        self.waiting = waiting_bundles(reader, steps)
        # SOC2:AUTH-02 the bundle read rule (record openable, sources readable)
        self.readable = readable(reader, self.waiting)

    def items(self, bundles):
        return bundle_items(bundles, self.reader)
```

Import `BUNDLE` from `.feed_shape` (drop `APPROVAL` from the import if unused), delete `from services.agents.deciding import may_decide` if now unused, and set `MAKERS = {RULE_REVIEW: RuleReviews, BUNDLE: Bundles, QUESTION: Questions, DRAFT: Drafts}`.

`feed.py` needs no change beyond what the constants do (`_decide` loops `DECIDE_KINDS` and `MAKERS`). `count()` loops `DECIDE_KINDS` too, so the badge counts bundles.

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.work.tests.test_feed_bundles --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Bring the older Work tests to bundles**

Find them: `grep -rn '"approval"\|agent_action:\|Approvals\|kind="approval' services/work/tests services/brain/tests services/agents/tests | grep -v test_feed_bundles`.

Change each the same way, never loosening a privacy assertion:

| Was | Now |
|---|---|
| `"kind": "approval"` / `["approval"]` in feed items or `failed` | `"bundle"` / `["bundle"]` |
| `f"agent_action:{action.pk}"` | `f"bundle:{action.bundle_id}"` |
| `item["id"] == action.pk` | `item["id"] == action.bundle_id` |
| `item["actions"] == ["approve", "reject"]` (Mine) | `["open"]`; the "may decide" assertion moves to `item["detail"]["can_run"]` (True/False as before) |
| `item["detail"]["preview"]` / ActionPayload keys | assert on `GET /api/v1/agents/bundles/<id>/`'s `steps[0]` instead |
| `CHOOSE_KIND` text | the new sentence |
| `feed_decide.Approvals` patched to fail (`test_feed_api` failure test) | `feed_decide.Bundles`; the log line reads `bundle failed: RuntimeError` |
| `kind="approval,rule_review"` with order `["rule_review", "approval"]` | same query (alias), order `["rule_review", "bundle"]` |

Run: `$PY manage.py test services.work services.brain --parallel auto --noinput`
Expected: PASS. (The Team queue's tests still read approvals until Task 13; if `test_feed_team_*` fail here only because `feed_decide.Approvals` is gone, leave them for Task 13 and run the rest: `$PY manage.py test services.work --exclude-tag=team` is not available, so run the modules one by one: `services.work.tests.test_feed_api services.work.tests.test_feed_decide services.work.tests.test_feed_shape services.work.tests.test_feed_queries services.work.tests.test_expired_proposals services.work.tests.test_privacy`.)

- [ ] **Step 7: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/work/feed_shape.py services/work/feed_decide.py services/work/tests/test_feed_bundles.py services/work/tests/test_feed_api.py services/work/tests/test_feed_decide.py services/work/tests/test_feed_shape.py services/work/tests/test_expired_proposals.py services/work/tests/test_privacy.py
git commit -m "feat(work): Mine lists waiting bundles in place of single approvals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add to `git add` any other test file Step 6 changed.)

---

### Task 13: My team and Rest of company, with a kind filter

**Files:**
- Modify: `services/work/team_scope.py`, `services/work/feed_team_decide.py`, `services/work/feed_team.py`, `services/work/views.py`
- Test: `services/work/tests/test_team_bundles.py` (create); update `test_team_scope.py`, `test_feed_team_decide.py`, `test_feed_team_api.py`, `test_feed_team_e2e.py`

**Interfaces:**
- Consumes: Task 12's `waiting_bundles`, `bundle_items`, `Bundles`.
- Produces: `team_scope.near(reader, scope) -> list[int]` (the reader for My team; the reader and everyone below them for Rest of company); `team_scope.people(reader, scope)` excludes `near` for company; `team_scope.owned_by_q(organisation_id, ids) -> Q`; `feed_team_decide.TeamBundles(reader, scope)`; `MAKERS = {RULE_REVIEW: TeamReviews, BUNDLE: TeamBundles, QUESTION: TeamQuestions}`; `feed_team.TEAM_KINDS = (BUNDLE, RULE_REVIEW, QUESTION, TASK, SUGGESTION)`; `feed_team.CHOOSE_TEAM_KIND = "Choose bundle, rule_review, question, task or suggestion."`; `feed_team.parse_team_kinds(raw) -> frozenset`; `feed_team.build(reader, scope, *, today, kinds=frozenset(TEAM_KINDS))`, `page(..., kinds=...)`, `counts(reader, scope, *, today) -> int` (decide + overdue).

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_team_bundles.py`:

```python
"""My team and Rest of company over bundles (contract §10.2, D7, D23): bundle
rows say who they are for; Rest of company holds nothing in Mine or My team;
the kind filter; workspace-level bundles for view-all only."""

from services.accounts.models import User
from services.work.tests.feed_fixtures import FeedFixture


class TeamBundleTests(FeedFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        # Alice (view-all) manages Dana, so Dana's work is Alice's My team.
        User.objects.filter(pk=cls.other.pk).update(reports_to=cls.admin)

    def test_my_team_lists_a_reports_bundle_for_them(self):
        action = self.proposal(self.pizza, title="Save play")
        body = self.queue_body(self.mona, scope="team")
        (row,) = self.group(body, "decide")["items"]
        self.assertEqual((row["key"], row["kind"]), (f"bundle:{action.bundle_id}", "bundle"))
        self.assertEqual(row["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(row["actions"], ["open"])

    def test_rest_of_company_leaves_out_mine_and_my_team(self):
        dana = self.proposal(self.taco, title="Dana's")  # Alice's My team
        carl = self.proposal(self.pizza, title="Carl's")  # neither: Rest of company
        team = self.queue_body(self.admin, scope="team")
        rest = self.queue_body(self.admin, scope="company")
        self.assertEqual([i["id"] for i in self.group(team, "decide")["items"]], [dana.bundle_id])
        self.assertEqual([i["id"] for i in self.group(rest, "decide")["items"]], [carl.bundle_id])

    def test_rest_of_company_tasks_and_suggestions_leave_out_my_team_too(self):
        self.due(self.other, self.taco, due_in=-1, title="Dana late")
        self.due(self.csm, self.pizza, due_in=-1, title="Carl late")
        rest = self.queue_body(self.admin, scope="company")
        self.assertEqual([i["title"] for i in self.group(rest, "overdue")["items"]], ["Carl late"])

    def test_the_kind_filter(self):
        self.proposal(self.pizza, title="Save play")
        self.due(self.csm, self.pizza, due_in=-1, title="Late")
        body = self.queue_body(self.mona, scope="team", kind="task")
        self.assertEqual(self.group(body, "decide")["items"], [])
        self.assertEqual([i["title"] for i in self.group(body, "overdue")["items"]], ["Late"])
        approval = self.queue_body(self.mona, scope="team", kind="approval")
        self.assertEqual([i["kind"] for i in self.group(approval, "decide")["items"]], ["bundle"])
        response = self.queue(self.mona, scope="team", kind="todo")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json(), {"kind": ["Choose bundle, rule_review, question, task or suggestion."]}
        )

    def test_a_workspace_level_bundle_is_view_all_only(self):
        from services.agents.tests.builder_fixtures import builder_action, definition

        built = builder_action(self.org, "segment.create", definition())
        rest = self.queue_body(self.admin, scope="company")
        row = next(i for i in self.group(rest, "decide")["items"] if i["id"] == built.bundle_id)
        self.assertIsNone(row["for"])
        lee = self.queue_body(self.lee, scope="company")
        self.assertNotIn(built.bundle_id, [i["id"] for i in self.group(lee, "decide")["items"]])
        self.assertEqual(lee["hidden"], 0)
```

In `services/work/tests/test_team_scope.py` add:

```python
    def test_rest_of_company_leaves_out_the_readers_reports(self):
        from services.work.team_scope import near

        User.objects.filter(pk=self.other.pk).update(reports_to=self.admin)
        admin = self.fresh(self.admin)
        scope = resolve_team(admin, "company")
        self.assertEqual(sorted(near(admin, scope)), sorted([self.admin.pk, self.other.pk]))
        self.assertNotIn(self.other.pk, [row["id"] for row in people(admin, scope)])
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.work.tests.test_team_bundles services.work.tests.test_team_scope --parallel auto --noinput`
Expected: FAIL (`ImportError: cannot import name 'near'`; rows are `approval`).

- [ ] **Step 3: `team_scope`**

In `services/work/team_scope.py`:

```python
def near(reader, scope):
    """Who is left out of a Team scope: the reader for My team; the reader and
    everyone below them for Rest of company (Agent bundles D7)."""
    if scope.is_company:
        return sorted({reader.pk, *subtree_ids(reader)})
    return [reader.pk]


def people(reader, scope):
    """The scope's members other than `near`, as an `id IN` subquery."""
    rows = User.objects.filter(organisation_id=reader.organisation_id).exclude(
        pk__in=near(reader, scope)
    )
    if not scope.is_company:
        rows = rows.filter(id__in=sorted(scope.owner_ids))
    return rows.values("id")


def owned_by_q(organisation_id, ids):
    """Rows (with customer/account FKs) on records owned by `ids`, as `id IN` subqueries."""
    from django.db.models import Q

    from services.customers.models import Account, Customer

    customers = Customer.objects.filter(organisation_id=organisation_id, owner_id__in=ids).values(
        "id"
    )
    accounts = Account.objects.filter(owner_id__in=ids).values("id")
    return Q(customer_id__in=customers) | Q(account_id__in=accounts)
```

(import `subtree_ids` from `services.accounts.hierarchy`; update the module docstring: "Rest of company leaves out the reader's own team".)

- [ ] **Step 4: The Team sources**

In `services/work/feed_team_decide.py`:
- `TeamReviews.__init__`: replace both `.exclude(rule__owner_id=reader.pk)` with `.exclude(rule__owner_id__in=near(reader, scope))`.
- `TeamQuestions.__init__`: replace `.exclude(assignee_id=reader.pk)` with `.exclude(assignee_id__in=near(reader, scope))`.
- Replace `TeamApprovals` with:

```python
class TeamBundles(feed_decide.Bundles):
    def __init__(self, reader, scope):
        from services.agents.bundles import readable

        self.reader = reader
        self.sessions = desk.session_ids_seen_whole(reader)
        steps = desk.agent_actions(reader, scope, self.sessions).waiting
        mine = desk.agent_actions(reader, resolve(reader, ME), self.sessions).waiting
        # Decision D1 (Work in one place): what is on the reader's Me desk stays on Mine.
        found = feed_decide.waiting_bundles(reader, steps).exclude(id__in=mine.values("bundle_id"))
        if scope.is_company:
            # D7: Rest of company holds nothing that is in My team.
            found = found.exclude(owned_by_q(reader.organisation_id, near(reader, scope)))
        self.waiting = found
        # SOC2:AUTH-02 the bundle read rule (record openable, sources readable)
        self.readable = readable(reader, found)

    def items(self, bundles):
        return feed_decide.bundle_items(bundles, self.reader, lambda b: {"for": named(_owner(b))})
```

  (`_owner` already reads `record.owner`; it works for a bundle too.) `MAKERS = {RULE_REVIEW: TeamReviews, BUNDLE: TeamBundles, QUESTION: TeamQuestions}`; import `BUNDLE`, `near`, `owned_by_q`.

`feed_team_tasks.TeamOverdue` and `feed_team_suggest.TeamSuggestions` use `people()`, so Rest of company already leaves out the reader's team.

- [ ] **Step 5: The kind filter and the count**

In `services/work/feed_team.py`:

```python
from .feed_shape import ALIASES, BUNDLE, BadQuery

TEAM_DECIDE_KINDS = (RULE_REVIEW, BUNDLE, QUESTION)
TEAM_KINDS = (BUNDLE, RULE_REVIEW, QUESTION, TASK, SUGGESTION)
CHOOSE_TEAM_KIND = "Choose bundle, rule_review, question, task or suggestion."


def parse_team_kinds(raw):
    if raw is None:
        return frozenset(TEAM_KINDS)
    asked = {ALIASES.get(p.strip(), p.strip()) for p in raw.split(",") if p.strip()}
    if not asked or not asked <= set(TEAM_KINDS):
        raise BadQuery("kind", CHOOSE_TEAM_KIND)
    return frozenset(asked)
```

Thread `kinds` through: `_decide(reader, scope, after, failed, kinds)` skips kinds not in `kinds`; `_overdue` returns `group(OVERDUE, 0, []), 0` when `TASK not in kinds`; `_suggested` likewise for `SUGGESTION`; `build(reader, scope, *, today, kinds=frozenset(TEAM_KINDS))` and `page(..., kinds=frozenset(TEAM_KINDS))` pass them on. Add:

```python
def counts(reader, scope, *, today):
    """The queue rail's count (contract D8): decide plus overdue."""
    failed = []
    total = 0
    for kind in TEAM_DECIDE_KINDS:
        got = attempt(
            [kind],
            failed,
            lambda kind=kind: (feed_team_decide.MAKERS[kind](reader, scope).count(),),
        )
        total += 0 if got is None else got[0]
    got = attempt([TASK], failed, lambda: (TeamOverdue(reader, scope, today).count(),))
    total += 0 if got is None else got[0]
    return total, failed
```

In `services/work/views.py` `TeamQueueView.get`, inside the `try:`, first line: `kinds = parse_team_kinds(params.get("kind"))`; pass `kinds=kinds` to `feed_team.build` and `feed_team.page`.

- [ ] **Step 6: Run them, and bring the older Team tests to bundles**

Run: `$PY manage.py test services.work.tests.test_team_bundles services.work.tests.test_team_scope --parallel auto --noinput`
Expected: PASS.

Then apply Task 12 Step 6's table to `test_feed_team_decide.py` (`TeamApprovals` → `TeamBundles`, approval rows → bundle rows; the "decidable by the manager" assertion moves to `item["detail"]["can_run"]`), `test_feed_team_api.py`, `test_feed_team_e2e.py`, `test_feed_team_queries.py`. The Company tests that assumed Company = everyone but the reader keep passing (no fixture manager has view-all except where a test sets it).

Run: `$PY manage.py test services.work --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/work/team_scope.py services/work/feed_team_decide.py services/work/feed_team.py services/work/views.py services/work/tests/test_team_bundles.py services/work/tests/test_team_scope.py services/work/tests/test_feed_team_decide.py services/work/tests/test_feed_team_api.py services/work/tests/test_feed_team_e2e.py services/work/tests/test_feed_team_queries.py
git commit -m "feat(work): My team and Rest of company over bundles, with a kind filter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: `GET /work/queues/`

**Files:**
- Create: `services/work/queues.py`
- Modify: `services/work/views.py`, `services/work/urls.py`
- Test: `services/work/tests/test_queues.py` (create)

**Interfaces:**
- Consumes: `feed.count`, `feed_team.counts`, `brain.scope.available`, `team_scope.resolve_team`.
- Produces: `queues.Queue` (namedtuple `key, label, may_use, count`), `queues.MAKERS: tuple[Queue, ...]` (the D2 plug-in: delivery 2 appends department and Unassigned makers), `queues.build(reader, *, today) -> dict`; route `GET /api/v1/work/queues/` (`work-queues`).

- [ ] **Step 1: Write the failing tests**

Create `services/work/tests/test_queues.py`:

```python
"""The queue rail (contract §10.3, D8): the queues the reader may use, in
order, each counting what needs action (decide plus overdue); History has no
count; a failing queue has a null count and is named in `failed`."""

from unittest.mock import patch

from services.accounts.models import User
from services.work.tests.feed_fixtures import FeedFixture

QUEUES = "/api/v1/work/queues/"


class QueuesTests(FeedFixture):
    def get(self, user):
        response = self.as_user(User.objects.get(pk=user.pk)).get(QUEUES)
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_each_reader_gets_their_queues(self):
        self.proposal(self.pizza, title="Carl's")
        self.due(self.csm, self.pizza, due_in=-1, title="Late")
        self.suggestion(self.csm, self.pizza)  # not counted (D8)
        carl = self.get(self.csm)
        self.assertEqual(
            carl,
            {
                "queues": [
                    {"key": "mine", "label": "Mine", "count": 2},
                    {"key": "history", "label": "History", "count": None},
                ],
                "failed": [],
            },
        )
        mona = self.get(self.mona)
        self.assertEqual(
            [(q["key"], q["count"]) for q in mona["queues"]],
            [("mine", 0), ("team", 2), ("history", None)],
        )
        alice = self.get(self.admin)
        self.assertEqual(
            [(q["key"], q["label"], q["count"]) for q in alice["queues"]],
            [("mine", "Mine", 0), ("company", "Rest of company", 2), ("history", "History", None)],
        )

    def test_a_failing_queue(self):
        with patch("services.work.feed_team.counts", side_effect=RuntimeError("down")):
            body = self.get(self.mona)
        self.assertEqual(body["failed"], ["team"])
        self.assertIsNone(next(q for q in body["queues"] if q["key"] == "team")["count"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.work.tests.test_queues --parallel auto --noinput`
Expected: FAIL (404).

- [ ] **Step 3: `queues.py`**

```python
"""The queue rail (Agent bundles, contract §10.3): Mine, My team, Rest of
company and History, those the reader may use, each counting what needs
action (decide plus overdue, D8). Delivery 2 appends its department and
Unassigned queues to `MAKERS`: rows, not shapes."""

import logging
from collections import namedtuple

from django.db import transaction

from services.brain.scope import COMPANY, TEAM, available

from . import feed, feed_team
from .team_scope import resolve_team

logger = logging.getLogger(__name__)
Queue = namedtuple("Queue", "key label may_use count")


def _mine(reader, today):
    return feed.count(reader, today=today)["badge"]


def _team(key):
    def count(reader, today):
        total, _failed = feed_team.counts(reader, resolve_team(reader, key), today=today)
        return total

    return count


MAKERS = (
    Queue("mine", "Mine", lambda reader: True, _mine),
    Queue("team", "My team", lambda reader: TEAM in available(reader), _team(TEAM)),
    Queue(
        "company", "Rest of company", lambda reader: COMPANY in available(reader), _team(COMPANY)
    ),
    Queue("history", "History", lambda reader: True, None),
)


def build(reader, *, today):
    queues, failed = [], []
    for queue in MAKERS:
        # SOC2:AUTH-02 a queue the reader may not use is neither listed nor counted
        if not queue.may_use(reader):
            continue
        count = None
        if queue.count is not None:
            try:
                with transaction.atomic():
                    count = queue.count(reader, today)
            except Exception as exc:  # noqa: BLE001 - one queue never stops the rail
                logger.warning("work queues: %s failed: %s", queue.key, type(exc).__name__)
                failed.append(queue.key)
        queues.append({"key": queue.key, "label": queue.label, "count": count})
    return {"queues": queues, "failed": failed}
```

`views.py`:

```python
class QueuesView(APIView):
    """GET /api/v1/work/queues/ — the queue rail (Agent bundles contract §10.3)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(queues.build(request.user, today=today_for(request.user.organisation)))
```

(import `queues` in the `from . import (...)` list), and in `urls.py` after `feed/team/`: `path("queues/", views.QueuesView.as_view(), name="work-queues"),`.

- [ ] **Step 4: Run them to see them pass**

Run: `$PY manage.py test services.work.tests.test_queues --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/work/queues.py services/work/views.py services/work/urls.py services/work/tests/test_queues.py
git commit -m "feat(work): GET /work/queues/ for the queue rail

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: History (`GET /agents/bundles/history/`)

**Files:**
- Modify: `services/agents/bundle_payloads.py`, `services/agents/bundle_views.py`, `services/agents/urls.py`
- Test: `services/agents/tests/test_bundle_history.py` (create)

**Interfaces:**
- Consumes: `bundles.readable`, `models.FINISHED`, `views.CHOOSE_AGENT`, `views.CHOOSE_KIND`.
- Produces: `bundle_payloads.bundle_payloads(bundles, reader, *, history=False) -> list[dict]` (one steps query and one `bulk.using` for the page; `bundle_payload` delegates to it); `bundle_views.HISTORY_PAGE = 50`, `CHOOSE_BUNDLE_STATUS = "Choose done, partly done, rejected, expired or superseded."`; route `GET /api/v1/agents/bundles/history/` (`agent-bundle-history`, declared **before** `bundles/<int:pk>/`).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_bundle_history.py`:

```python
"""History (contract §10.5, D22): finished bundles the reader may read,
newest change first, 50 a page, filtered by agent, step kind and status;
nothing waiting; hidden counted, never named."""

from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import HISTORY, BundleFixture, lifecycle, note


class HistoryTests(BundleFixture):
    def finished(self, record, status, *steps, agent="cs", title="Done"):
        bundle = self.bundle_of(record, *(steps or (note(),)), agent=agent, title=title)
        AgentBundle.objects.filter(pk=bundle.pk).update(status=status, run_by=self.csm)
        return bundle

    def get(self, user, **params):
        response = self.client_for(user).get(HISTORY, params)
        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        return response.json()

    def test_lists_finished_bundles_only_newest_first(self):
        self.bundle_of(self.pizza, note())  # waiting: never in History
        first = self.finished(self.pizza, "done", title="First")
        second = self.finished(self.pizza, "rejected", title="Second")
        body = self.get(self.csm)
        self.assertEqual([b["id"] for b in body["results"]], [second.pk, first.pk])
        self.assertEqual(
            (body["count"], body["next"], body["previous"], body["hidden"]), (2, None, None, 0)
        )
        self.assertEqual(body["results"][1]["for"], {"id": self.csm.pk, "name": "Carl CSM"})
        self.assertEqual(len(body["results"][1]["steps"]), 1)

    def test_hidden_is_counted_never_named(self):
        self.finished(self.soup, "done", title="Mona's")
        body = self.get(self.csm)
        self.assertEqual((body["count"], body["hidden"]), (0, 1))
        self.assertNotIn("Mona's", str(body))

    def test_filters(self):
        self.finished(self.pizza, "done", note(), title="Note")
        self.finished(self.pizza, "partly_done", lifecycle(), agent="sales", title="Move")
        self.assertEqual(
            [b["title"] for b in self.get(self.csm, agent="sales")["results"]], ["Move"]
        )
        self.assertEqual(
            [b["title"] for b in self.get(self.csm, step_kind="note.create")["results"]], ["Note"]
        )
        self.assertEqual(
            [b["title"] for b in self.get(self.csm, status="partly_done")["results"]], ["Move"]
        )
        for params, errors in (
            ({"agent": "hr"}, {"agent": ["Choose cs, sales or ops."]}),
            ({"step_kind": "x"}, {"step_kind": ["Choose an action kind."]}),
            (
                {"status": "waiting"},
                {"status": ["Choose done, partly done, rejected, expired or superseded."]},
            ),
        ):
            with self.subTest(params=params):
                response = self.client_for(self.csm).get(HISTORY, params)
                self.assertEqual((response.status_code, response.json()), (400, errors))

    def test_pages_of_50(self):
        for number in range(51):
            self.finished(self.pizza, "done", title=f"B{number}")
        first = self.get(self.csm)
        self.assertEqual((first["count"], len(first["results"])), (51, 50))
        self.assertTrue(first["next"].endswith("page=2"))
        self.assertEqual(len(self.get(self.csm, page=2)["results"]), 1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_bundle_history --parallel auto --noinput`
Expected: FAIL (`history` is read as a bundle id: 404).

- [ ] **Step 3: Batched payloads**

In `bundle_payloads.py`, turn `bundle_payload` into a batch with a one-row wrapper:

```python
RELATED = ("customer__owner", "account__owner", "decided_by", "undone_by", "organisation")


def bundle_payloads(bundles, reader, *, history=False):
    """Bundles for `reader`, their steps read once for the whole page."""
    bundles = [settle_stuck(bundle) for bundle in bundles]
    steps = {}
    rows = AgentAction.objects.filter(bundle_id__in=[b.pk for b in bundles]).select_related(
        *RELATED
    )
    for step in rows.order_by("bundle_id", "position"):
        steps.setdefault(step.bundle_id, []).append(step)
    every = [step for found in steps.values() for step in found]
    # The previews' reads are done once for the page, not once per row.
    with bulk.using(every):
        return [_one(bundle, steps.get(bundle.pk, []), reader, history) for bundle in bundles]


def bundle_payload(bundle, reader, *, history=False):
    return bundle_payloads([bundle], reader, history=history)[0]
```

and move the body of the old `bundle_payload` (from `waiting = ...` to the returned dict) into `_one(bundle, steps, reader, history)`, building `rows = [step_payload(step, reader) for step in steps]` there.

- [ ] **Step 4: The route**

In `bundle_views.py`:

```python
from django.db.models import Q
from rest_framework.exceptions import ValidationError
from rest_framework.utils.urls import replace_query_param

from services.customers.scoping import sees_everything
from services.metrics.models import AgentAction

from .bundle_payloads import bundle_payloads
from .bundles import readable
from .models import FINISHED, AgentBundle
from .policy import AGENTS
from .registry import REGISTRY
from .views import CHOOSE_AGENT, CHOOSE_KIND

HISTORY_PAGE = 50
CHOOSE_BUNDLE_STATUS = "Choose done, partly done, rejected, expired or superseded."


class BundleHistoryView(APIView):
    """GET /api/v1/agents/bundles/history/?agent=&step_kind=&status=&page=."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        rows = AgentBundle.objects.filter(
            organisation_id=request.user.organisation_id, status__in=FINISHED
        )
        errors = {}
        if "agent" in params:
            if params["agent"] in AGENTS:
                rows = rows.filter(agent=params["agent"])
            else:
                errors["agent"] = [CHOOSE_AGENT]
        if "step_kind" in params:
            if params["step_kind"] in REGISTRY:
                rows = rows.filter(
                    id__in=AgentAction.objects.filter(kind=params["step_kind"]).values("bundle_id")
                )
            else:
                errors["step_kind"] = [CHOOSE_KIND]
        if "status" in params:
            if params["status"] in FINISHED:
                rows = rows.filter(status=params["status"])
            else:
                errors["status"] = [CHOOSE_BUNDLE_STATUS]
        if errors:
            raise ValidationError(errors)
        # SOC2:AUTH-02 the bundle read rule; the rest counted, never named
        shown = readable(request.user, rows)
        count = shown.count()
        number = max(int(params["page"]) if str(params.get("page", "")).isdigit() else 1, 1)
        start = (number - 1) * HISTORY_PAGE
        page = list(
            shown.select_related(
                "customer", "account", "run_by", "edited_by", "routed_user"
            ).order_by("-updated_at", "-id")[start : start + HISTORY_PAGE]
        )
        url = request.build_absolute_uri()
        return Response(
            {
                "count": count,
                "next": replace_query_param(url, "page", number + 1)
                if start + HISTORY_PAGE < count
                else None,
                "previous": replace_query_param(url, "page", number - 1) if number > 1 else None,
                "results": bundle_payloads(page, request.user, history=True),
                "hidden": self._hidden(request.user, rows, count),
            }
        )

    def _hidden(self, reader, rows, count):
        """Activity's rule: a workspace-level bundle a reader isn't shown is not counted."""
        if sees_everything(reader):
            return rows.count() - count
        return rows.filter(Q(customer__isnull=False) | Q(account__isnull=False)).count() - count
```

`urls.py`, **before** `bundles/<int:pk>/`:

```python
(path("bundles/history/", bundle_views.BundleHistoryView.as_view(), name="agent-bundle-history"),)
```

- [ ] **Step 5: Run them to see them pass, and every bundle test**

Run: `$PY manage.py test services.agents.tests.test_bundle_history services.agents.tests.test_bundle_detail services.agents.tests.test_bundle_run services.agents.tests.test_bundle_retry_reject --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/bundle_payloads.py services/agents/bundle_views.py services/agents/urls.py services/agents/tests/test_bundle_history.py
git commit -m "feat(agents): History lists finished bundles with filters

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 16: Old routes, links and "Bundles waiting"

**Files:**
- Modify: `services/agents/views.py`, `services/agents/undo.py`, `services/work/proposal_notice.py`, `services/notifications/models.py`, `services/copilot/skills.py`
- Create: `services/notifications/migrations/0014_bundles_waiting.py` (generated)
- Modify: `services/agents/tests/bundle_fixtures.py` (a `run_one` helper)
- Test: `services/agents/tests/test_legacy_bundle_routes.py` (create); update the tests listed in Step 6

**Interfaces:**
- Consumes: Task 12's `feed_decide.Bundles`.
- Produces: `views.USE_BUNDLE = "Open the bundle to decide this."`; undo notice link `/work?queue=history&bundle=<id>`; `proposal_notice.PROPOSALS_LINK = "/work?queue=mine&kind=bundle"`, `MESSAGE = "Bundles are waiting for your decision."`; `Notification.Kind.AGENT_PROPOSAL_WAITING` label "Bundles waiting"; fixture helper `BundleFixture.run_one(user, action, **fields) -> Response` (and a module-level `run_one(client, action, **fields)` for other fixtures).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_legacy_bundle_routes.py`:

```python
"""Old action routes and links (contract D19, D20, §10.6, §10.7)."""

from services.agents.tests.bundle_fixtures import BundleFixture, note
from services.notifications.models import Notification
from services.work import proposal_notice
from services.work.clock import today_for

LIST = "/api/v1/agents/actions/"


class LegacyRouteTests(BundleFixture):
    def test_approve_and_reject_point_at_the_bundle(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        for decision in ("approve", "reject"):
            with self.subTest(decision=decision):
                response = self.client_for(self.csm).post(
                    f"{LIST}{step.pk}/{decision}/", {}, format="json"
                )
                self.assertEqual(response.status_code, 409)
                self.assertEqual(
                    response.json(),
                    {
                        "code": "USE_BUNDLE",
                        "detail": "Open the bundle to decide this.",
                        "bundle": bundle.pk,
                    },
                )
        self.assertEqual(
            self.client_for(self.other).post(f"{LIST}{step.pk}/approve/").status_code, 404
        )

    def test_list_detail_and_undo_still_work(self):
        bundle = self.bundle_of(self.pizza, note())
        step = bundle.steps.get()
        self.run_one(self.csm, step)
        self.assertEqual(
            self.client_for(self.csm).get(LIST).json()["results"][0]["bundle"], bundle.pk
        )
        response = self.client_for(self.mona).post(f"{LIST}{step.pk}/undo/")
        self.assertEqual(response.status_code, 200, response.data)
        told = Notification.objects.get(recipient=self.csm, kind="agent_action_undone")
        self.assertEqual(told.link, f"/work?queue=history&bundle={bundle.pk}")

    def test_the_notice_is_bundles_waiting(self):
        self.bundle_of(self.pizza, note())
        told = proposal_notice.notify_proposals(self.org, today=today_for(self.org))
        self.assertEqual(told, 1)
        notice = Notification.objects.get(recipient=self.csm, kind="agent_proposal_waiting")
        self.assertEqual(
            (notice.message, notice.link, notice.get_kind_display()),
            (
                "Bundles are waiting for your decision.",
                "/work?queue=mine&kind=bundle",
                "Bundles waiting",
            ),
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `$PY manage.py test services.agents.tests.test_legacy_bundle_routes --parallel auto --noinput`
Expected: FAIL (`AttributeError: ... has no attribute 'run_one'`, then 200 from approve).

- [ ] **Step 3: The fixture helper**

Append to `services/agents/tests/bundle_fixtures.py`:

```python
def run_one(client, action, **fields):
    """Run `action`'s bundle with only `action` ticked (and `fields` edited):
    what today's Approve did, through the bundle route."""
    from services.metrics.models import AgentAction

    steps = []
    for step in AgentAction.objects.filter(bundle_id=action.bundle_id, status="proposed"):
        row = {"id": step.pk, "selected": step.pk == action.pk}
        if step.pk == action.pk and fields:
            row["fields"] = fields
        steps.append(row)
    return client.post(f"{BUNDLES}{action.bundle_id}/run/", {"steps": steps}, format="json")
```

and in `BundleFixture`:

```python
    def run_one(self, user, action, **fields):
        return run_one(self.client_for(user), action, **fields)
```

- [ ] **Step 4: The routes, the links and the notice**

`services/agents/views.py`: add `USE_BUNDLE = "Open the bundle to decide this."`; in `ActionDecisionView.post`, right after `action = _visible_action(request, pk)`:

```python
        if decision in ("approve", "reject"):
            # Agent bundles D19: a step is decided by running or rejecting its bundle.
            return _code("USE_BUNDLE", USE_BUNDLE, bundle=action.bundle_id)
```

(`deciding.approve`/`reject` stay: Auto, the facilitator's tests and `settle_bundle_of` use them; `_overrides` is now unused: delete it and the `AssignSerializer`/`assignee_for` imports it needed.)

`services/agents/undo.py` `_tell`: `link=f"/work?queue=history&bundle={action.bundle_id}",`.

`services/notifications/models.py`: `AGENT_PROPOSAL_WAITING = "agent_proposal_waiting", "Bundles waiting"`. Then run `$PY manage.py makemigrations notifications --name bundles_waiting` (expected: `0014_bundles_waiting.py`, one `AlterField` on `kind`).

`services/work/proposal_notice.py`:

```python
PROPOSALS_LINK = "/work?queue=mine&kind=bundle"
MESSAGE = "Bundles are waiting for your decision."


def candidates(organisation, since):
    """Everyone a bundle made after `since` could sit on the Mine of: its
    record's owner, and its steps' sessions' owners and present participants.
    A superset: `notify_proposals` applies the exact rule to each."""
    bundles = AgentBundle.objects.filter(
        organisation=organisation, status=AgentBundle.Status.WAITING, created_at__gt=since
    )
    proposed = AgentAction.objects.filter(
        bundle_id__in=bundles.values("id"), status=AgentAction.Status.PROPOSED
    )
    people = set()
    for owners in proposed.values_list(
        "customer__owner_id", "account__owner_id", "session__conversation__user_id"
    ):
        people.update(pk for pk in owners if pk)
    sessions = proposed.filter(session__isnull=False).values("session_id")
    people.update(
        SessionParticipant.objects.filter(
            session_id__in=sessions, left_at__isnull=True
        ).values_list("user_id", flat=True)
    )
    return people
```

and in `notify_proposals`, replace the `waiting = (Approvals(user)...)` block with:

```python
        # SOC2:AUTH-02 the feed's own rule: only bundles on the person's Mine
        # (the bundle read rule), and only if they may run one of their steps
        bundles = Bundles(user).readable.filter(created_at__gt=since)
        waiting = (
            AgentAction.objects.filter(
                bundle_id__in=bundles.values("id"), status=AgentAction.Status.PROPOSED
            )
            .select_related("customer__owner", "account__owner", "organisation")
            .order_by("created_at", "id")
        )
```

(import `Bundles` from `.feed_decide`, `AgentBundle` from `services.agents.models`; update the module docstring: "Bundles waiting", "on their Mine".)

`services/copilot/skills.py`: the three agent skills' link `"/work/activity"` becomes `"/work?queue=history"`; their one-line descriptions "Proposes ... into Recommended." become "Proposes bundles of steps on the ... book, for a person to run." (CS: "on the CS book"; Sales: "on the sales book"); the Ops skill's "Proposes actions across every live record and the workspace figures." becomes "Proposes bundles of steps across every live record and the workspace figures.".

- [ ] **Step 5: Run them to see them pass**

Run: `$PY manage.py test services.agents.tests.test_legacy_bundle_routes services.work.tests.test_proposal_notice services.copilot --parallel auto --noinput`
Expected: `test_legacy_bundle_routes` PASS; `test_proposal_notice` fails only on the old message/link: update its expected `MESSAGE`/`PROPOSALS_LINK` (it imports them or spells them: use the constants) and keep every "who is told" assertion as it is; re-run to PASS.

- [ ] **Step 6: Bring the approve-route tests to bundles**

The files: `services/agents/tests/test_api_actions.py`, `test_builder_access.py`, `test_builder_e2e.py`, `test_builder_framework.py`, `test_drafts_e2e.py`, `test_privacy.py`, `test_draft_privacy.py`, `test_undo.py`, `services/brain/tests/test_deciding.py`, `services/metrics/tests/test_facilitator.py`, `services/work/tests/test_no_settlement.py`, `services/work/tests/test_feed_team_e2e.py`, `e2e/test_work_one_place_flow.py`, `e2e/test_work_one_place_team_flow.py` (find any more with `grep -rn "/approve/\|/reject/" services e2e | grep agents`; rule reviews' own `/rules/.../approve/` routes are not this).

| Was | Now |
|---|---|
| `client.post(f"{LIST}{a.pk}/approve/", body)` expecting 200 | `run_one(client, a, **body)` (fixture helper; in e2e: `http_post(api(f"/agents/bundles/{a.bundle_id}/run/"), {"steps": [{"id": a.pk, "selected": True}]}, token=...)`) |
| `response.data["action"]["status"] == "applied"` | `response.json()["bundle"]["steps"][<position-1>]["status"] == "applied"` |
| `response.data["action"]["undo"]...` | the same keys on that step |
| `.../reject/` with a `note` expecting 200 | `client.post(f"{BUNDLES}{a.bundle_id}/reject/", {"reason": "other", "note": note})`; status asserted on `["bundle"]["steps"][0]["status"] == "rejected"` |
| 409 `ALREADY_DECIDED` "X already applied this." | 409 `BUNDLE_RAN` with `ran_sentence` (or `BUNDLE_REJECTED` "X rejected this.") |
| 409 `EXPIRED` on approve | 200 with the step `expired` and the bundle `expired` (D14) |
| 403 `CANT_DECIDE` on approve | 403 `CANT_RUN` (every step undecidable) |
| 404 for a reader who can't open the record | unchanged (404 `NO_SUCH_BUNDLE`) |
| 409 `OWNER_LIMIT` on approve | 200 with the step `failed` and `error` = the limit sentence; the bundle `partly_done` |
| approve with `assignee_id`/`title` overrides | `run_one(client, a, assignee_id=..., title=...)` (task.create's `edit`); a refused assignee is `400 {"steps": {"<id>": {"assignee_id": ["That person can't open this organisation."]}}}` |
| tests asserting that the approve route itself applies | one assertion that it now answers `409 USE_BUNDLE` (keep the test, change the expectation) |
| `test_undo` link `/work/activity?action=<id>` | `/work?queue=history&bundle=<bundle id>` |

Run: `$PY manage.py test services.agents services.brain services.metrics services.work services.copilot e2e.test_work_one_place_flow e2e.test_work_one_place_team_flow --parallel auto --noinput`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/views.py services/agents/undo.py services/work/proposal_notice.py services/notifications/models.py services/notifications/migrations/0014_bundles_waiting.py services/copilot/skills.py services/agents/tests/bundle_fixtures.py services/agents/tests/test_legacy_bundle_routes.py
git add services/agents/tests/test_api_actions.py services/agents/tests/test_builder_access.py services/agents/tests/test_builder_e2e.py services/agents/tests/test_builder_framework.py services/agents/tests/test_drafts_e2e.py services/agents/tests/test_privacy.py services/agents/tests/test_draft_privacy.py services/agents/tests/test_undo.py services/brain/tests/test_deciding.py services/metrics/tests/test_facilitator.py services/work/tests/test_no_settlement.py services/work/tests/test_feed_team_e2e.py services/work/tests/test_proposal_notice.py e2e/test_work_one_place_flow.py e2e/test_work_one_place_team_flow.py
git commit -m "feat(agents): decide steps through their bundle; Bundles waiting notice and links

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Stage only the files Step 6 actually changed.)

---

### Task 17: Query ceilings and no DISTINCT

**Files:**
- Test: `services/agents/tests/test_bundle_queries.py` (create); re-measure `services/work/tests/test_feed_queries.py`, `test_feed_team_queries.py`, `test_proposal_notice.py`

**Interfaces:**
- Produces: `BUNDLE_DETAIL_CEILING`, `HISTORY_CEILING`, `QUEUES_CEILING` (measured on the branch), and re-measured `FEED_CEILING`, `COUNT_CEILING`, `TEAM_CEILING`, `PROPOSAL_NOTICE_CEILING`.

- [ ] **Step 1: Write the tests**

Create `services/agents/tests/test_bundle_queries.py`:

```python
"""Bundles cost the same however many rows there are (contract §12): the
detail up to 8 steps, a History page, and the queue rail. No query uses
DISTINCT (Postgres 16)."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.agents.models import AgentBundle
from services.agents.tests.bundle_fixtures import BUNDLES, HISTORY, BundleFixture, lifecycle, note

#: Measured on this branch (Task 17); raise only with a reason in the commit.
BUNDLE_DETAIL_CEILING = 40
HISTORY_CEILING = 40
QUEUES_CEILING = 60


class BundleQueryTests(BundleFixture):
    def measure(self, user, url):
        self.client_for(user).get(url)  # warm per-process caches
        client = self.client_for(user)
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(client.get(url).status_code, 200)
        for query in queries.captured_queries:
            self.assertNotIn("DISTINCT", query["sql"].upper(), query["sql"])
        return len(queries)

    def test_the_detail_does_not_grow_with_its_steps(self):
        small = self.bundle_of(self.pizza, note("N0", "B"), lifecycle())
        big = self.bundle_of(self.pizza, *(note(f"N{n}", "B") for n in range(7)), lifecycle())
        few = self.measure(self.csm, f"{BUNDLES}{small.pk}/")
        many = self.measure(self.csm, f"{BUNDLES}{big.pk}/")
        self.assertEqual(few, many)
        self.assertLessEqual(many, BUNDLE_DETAIL_CEILING)

    def finished(self, n):
        for number in range(n):
            bundle = self.bundle_of(self.pizza, note(f"H{number}", "B"), lifecycle())
            AgentBundle.objects.filter(pk=bundle.pk).update(status="done", run_by=self.csm)

    def test_a_history_page_does_not_grow_with_its_rows(self):
        self.finished(2)
        few = self.measure(self.csm, HISTORY)
        self.finished(10)
        many = self.measure(self.csm, HISTORY)
        self.assertEqual(few, many)
        self.assertLessEqual(many, HISTORY_CEILING)

    def test_the_queue_rail_does_not_grow(self):
        self.bundle_of(self.pizza, note())
        few = self.measure(self.admin, "/api/v1/work/queues/")
        for number in range(6):
            self.bundle_of(self.pizza, note(f"Q{number}", "B"))
        many = self.measure(self.admin, "/api/v1/work/queues/")
        self.assertEqual(few, many)
        self.assertLessEqual(many, QUEUES_CEILING)
        for reader in (self.csm, self.mona, self.lee):
            self.measure(reader, "/api/v1/work/queues/")
```

- [ ] **Step 2: Run them and pin the numbers**

Run: `$PY manage.py test services.agents.tests.test_bundle_queries --parallel auto --noinput`
Expected: PASS, or a `few != many` failure. A growing count is a per-row query: find it in the failure's SQL list and batch it (the usual culprits: `may_decide` outside `bulk.using`, `person(...)` on an unselected FK, `settle_stuck` reading each bundle; `settle_stuck` must not query for a bundle that is not `running`, which its first `if` guarantees). Never raise the ceiling to hide growth. When equal, print the measured numbers (`print(few, many)` temporarily) and set each ceiling to the measured value.

- [ ] **Step 3: Re-measure the Work ceilings**

Run: `$PY manage.py test services.work.tests.test_feed_queries services.work.tests.test_feed_team_queries services.work.tests.test_proposal_notice --parallel auto --noinput`
Expected: PASS. If a ceiling is exceeded but `few == many` still holds (bundles cost a constant few more queries than single approvals did), raise that constant to the measured value with the reason in the commit message ("bundles read their steps once per page"). If `few != many`, batch the per-row query first.

- [ ] **Step 4: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add services/agents/tests/test_bundle_queries.py services/work/tests/test_feed_queries.py services/work/tests/test_feed_team_queries.py services/work/tests/test_proposal_notice.py
git commit -m "test(agents): pin the bundle, History and queue rail query ceilings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: The end-to-end journey

**Files:**
- Create: `e2e/test_agent_bundles_flow.py`

- [ ] **Step 1: Write the journey**

```python
"""End-to-end tier: real server, real HTTP, real test DB.

Carl owns Pizza Hut. The CS agent's nightly pass proposes two steps for it
(a note, then a lifecycle move), so Carl's Mine shows one bundle. Carl edits
the note, unticks the move and runs it: done. A second bundle's note step
fails (its record changed under a lifecycle step), Carl retries after
fixing nothing that needed fixing, and rejects a third with a reason. History
lists all three; the old approve route points at the bundle; Mona sees
Carl's bundle on My team; the queue rail counts it."""

import json
from decimal import Decimal
from unittest.mock import patch

from django.test import LiveServerTestCase

from e2e.http import http_get, http_post
from services.accounts.models import Organisation, User
from services.agents import evidence, run
from services.billing.models import BillingAccount
from services.customers.models import Customer
from services.metrics.models import AgentAction
from services.work.clock import today_for


class AgentBundlesFlowTests(LiveServerTestCase):
    def api(self, path):
        return f"{self.live_server_url}/api/v1{path}"

    def login(self, email, password="memberpass12"):
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

    def nightly(self, org, *items):
        with (
            patch("services.agents.policy.plan_credits", return_value=3000),
            patch("services.agents.run.get_completion", return_value=json.dumps(list(items))),
        ):
            return run.run(Organisation.objects.get(pk=org.pk), "cs")

    def test_full_flow(self):
        # 1. Alice's workspace; Mona above Carl; Carl's Pizza Hut.
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
        BillingAccount.objects.filter(organisation__name="Acme Inc").update(seats_limit=10)
        mona = self.member(alice, "Mona Manager", "mona@acme.io")
        carl = self.member(alice, "Carl CSM", "carl@acme.io")
        User.objects.filter(pk=carl.pk).update(reports_to=mona, function=User.Function.CS)
        org = carl.organisation
        pizza = Customer.objects.create(
            organisation=org, name="Pizza Hut", owner=carl, arr_billed_at_account=Decimal(300_000)
        )
        tokens = {who: self.login(f"{who}@acme.io") for who in ("mona", "carl")}

        # 2. The nightly pass: one bundle of two steps for Pizza Hut.
        ref = f"customer:{pizza.pk}"
        ctx = evidence.build(Organisation.objects.get(pk=org.pk), "cs", today=today_for(org))
        line = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))

        def item(kind, payload, title):
            return {
                "kind": kind,
                "record": ref,
                "title": title,
                "rationale": "Renews soon.",
                "evidence": [line],
                "payload": payload,
            }

        result = self.nightly(
            org,
            item(
                "note.create",
                {"title": "Sponsor left", "body": "Find a new sponsor."},
                "File the news",
            ),
            item("record.lifecycle", {"stage": "renewal"}, "Move Pizza Hut to renewal"),
        )
        self.assertEqual(result.proposed, 2)
        status, feed = http_get(self.api("/work/feed/?kind=bundle"), token=tokens["carl"])
        (row,) = next(g for g in feed["groups"] if g["key"] == "decide")["items"]
        self.assertEqual(
            (row["kind"], row["title"], row["detail"]["step_count"]),
            ("bundle", "File the news, and 1 more", 2),
        )
        status, queues = http_get(self.api("/work/queues/"), token=tokens["mona"])
        self.assertEqual(
            [(q["key"], q["count"]) for q in queues["queues"]],
            [("mine", 0), ("team", 1), ("history", None)],
        )

        # 3. Carl edits the note, unticks the move, runs: done.
        status, bundle = http_get(self.api(f"/agents/bundles/{row['id']}/"), token=tokens["carl"])
        note_step, move_step = bundle["steps"]
        status, ran = http_post(
            self.api(f"/agents/bundles/{row['id']}/run/"),
            {
                "steps": [
                    {
                        "id": note_step["id"],
                        "selected": True,
                        "fields": {"body": "Call the CFO instead."},
                    },
                    {"id": move_step["id"], "selected": False},
                ]
            },
            token=tokens["carl"],
        )
        self.assertEqual(status, 200, ran)
        self.assertEqual(ran["bundle"]["status"], "done")
        self.assertEqual([s["status"] for s in ran["bundle"]["steps"]], ["applied", "skipped"])
        status, again = http_post(
            self.api(f"/agents/bundles/{row['id']}/run/"), {"steps": []}, token=tokens["mona"]
        )
        self.assertEqual((status, again["code"]), (409, "BUNDLE_RAN"))

        # 4. A failing step: partly done, then Retry.
        failing = AgentAction.objects.create(
            organisation=org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=pizza,
            target="note:x",
            title="Log it",
            rationale="Why.",
            evidence=[line],
            payload={"title": "Log it", "body": "See {{step 2.task_url}}"},
        )
        status, ran = http_post(
            self.api(f"/agents/bundles/{failing.bundle_id}/run/"),
            {"steps": [{"id": failing.pk, "selected": True}]},
            token=tokens["carl"],
        )
        self.assertEqual(ran["bundle"]["status"], "partly_done")
        self.assertEqual(ran["bundle"]["steps"][0]["error"], "Needs step 2, which didn't run.")
        AgentAction.objects.filter(pk=failing.pk).update(
            payload={"title": "Log it", "body": "Done."}
        )
        status, retried = http_post(
            self.api(f"/agents/bundles/{failing.bundle_id}/steps/{failing.pk}/retry/"),
            {},
            token=tokens["carl"],
        )
        self.assertEqual((status, retried["bundle"]["status"]), (200, "done"))

        # 5. Reject a third with a reason.
        third = AgentAction.objects.create(
            organisation=org,
            agent="cs",
            batch="b",
            kind="record.lifecycle",
            customer=pizza,
            target="lifecycle",
            title="Move to churn",
            rationale="Why.",
            evidence=[line],
            payload={"stage": "churn"},
            before=pizza.lifecycle_stage,
        )
        status, rejected = http_post(
            self.api(f"/agents/bundles/{third.bundle_id}/reject/"),
            {"reason": "not_relevant", "note": "They are renewing."},
            token=tokens["carl"],
        )
        self.assertEqual((status, rejected["bundle"]["status"]), (200, "rejected"))

        # 6. History lists all three, newest change first; the old route points at a bundle.
        status, history = http_get(self.api("/agents/bundles/history/"), token=tokens["carl"])
        self.assertEqual([b["status"] for b in history["results"]], ["rejected", "done", "done"])
        status, old = http_post(
            self.api(f"/agents/actions/{third.pk}/approve/"), {}, token=tokens["carl"]
        )
        self.assertEqual((status, old["code"], old["bundle"]), (409, "USE_BUNDLE", third.bundle_id))
```

Step 4 uses a placeholder naming a step that doesn't exist in a bundle of one to force a failure the way a real run would meet one (`fill` raises before the kind is called). The model path never stores such a step (`placeholders.check` drops it); this row is written directly to exercise the failure and Retry over HTTP.

- [ ] **Step 2: Run it**

Run: `$PY manage.py test e2e.test_agent_bundles_flow --noinput`
Expected: PASS. (`run.run` builds the evidence from the database the live server shares; if `User.Function.CS` is the default already, the `update` is a no-op.)

- [ ] **Step 3: Lint and commit**

```bash
../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check .
git add e2e/test_agent_bundles_flow.py
git commit -m "test(e2e): the agent bundles journey from the nightly pass to History

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Docs, the full suite, and the local database

**Files:**
- Modify: `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `.soc2/CONTROL_MAP.md`
- Modify: `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md` (the four backend product docs)
- Modify: `docs/superpowers/plans/2026-10-13-agent-bundles-d1-api.md` (the measured ceilings)

- [ ] **Step 1: `docs/API_CONTRACTS.md`** (follow the `api-contracts` skill's house rules)

1. In the `agents` section, add `### Agent bundles, delivery 1 (2026-10-13)`: the D1 contract's "Decisions narrowing the spec" table and §1–§9 and §12, copied with each heading demoted one level, and the measured `BUNDLE_DETAIL_CEILING`, `HISTORY_CEILING`, `QUEUES_CEILING`.
2. In the `agents` section's `POST /agents/actions/<id>/approve|reject/`: "Since Agent bundles delivery 1 these answer `409 USE_BUNDLE` after the 404/403 checks; a step is decided by running or rejecting its bundle (`POST /agents/bundles/<id>/run/`, `/reject/`)." `GET /agents/actions/` and the detail gain `bundle`.
3. `GET /agents/settings/`: kinds rows gain `irreversible`, `outside`, `locked`; the `This action always asks.` refusal.
4. In the `work` section: the feed kinds (`bundle` replaces `approval`, `approval` read as `bundle`, the new `CHOOSE_KIND` sentence), the Team queue's `kind` and Rest of company (contract §10.2), `GET /work/queues/` (§10.3), the badge (§10.4), and "Bundles waiting" (§10.6) replacing "AI proposal waiting"; re-measured `FEED_CEILING`, `COUNT_CEILING`, `TEAM_CEILING`, `PROPOSAL_NOTICE_CEILING`.
5. Wherever notification links are listed: the undo notice and Bundles waiting links (§10.7).

- [ ] **Step 2: Audit events, data classification, controls**

- `docs/audit-events.md`: add rows `agent_bundle.run_started` (bundle; `steps`, `edited`), `agent_bundle.run_finished` (`status`, `steps` counts), `agent_bundle.retried` (`step`), `agent_bundle.rejected` (`reason`; never the note), `agent_action.failed` (`kind`, `agent`, `bundle`, `error`: the exception's class name); `agent_action.approved` gains `bundle` when a bundle run applied it.
- `docs/data-classification.md`: a row for `agents.AgentBundle` (internal; `title`/`reason` agent-written from record evidence, read under the bundle read rule; `reject_note` a person's free text, never sent to a model); the `metrics.AgentAction` row gains `outputs` (ids and app links) and `error` (plain sentences, no record names beyond what the kind's own refusal says).
- `.soc2/CONTROL_MAP.md` AUTH-02 evidence: "...agent bundles are read through `services/agents/bundles.py:readable` (record openable or view-all for workspace-level, and no step quoting a source the reader can't read), each step run re-checks `deciding.may_decide`; ...". LOG-01: add the `agent_bundle.*` events.

- [ ] **Step 3: The product docs**

- `docs/product/01-prd.md`, Agents: "Every agent proposal is a bundle of ready-to-run steps (a single action is a bundle of one). A person edits a step, unticks any, and presses Run selected; steps run in order, a failed step shows its error and Retry while the others still run; Reject takes a reason the agent reads for 30 days. The Ops agent can also propose sending a survey or a campaign, previewed with its audience, or saving it as a draft only; a sent one can't be undone. Work is an inbox: Mine, My team, Rest of company and History." 
- `docs/product/02-trd.md`, `services/agents/` row, append: "Agent bundles D1 (2026-10-13): `AgentBundle` (`models.py`) holds `AgentAction` steps (`bundle`, `position`, `selected`, `outputs`, `error`, `irreversible`); `bundles.py` (bundle of one, status rules, read rule, stuck runs), `placeholders.py` (`{{step N.key}}`), `bundle_payloads.py`, `bundle_run.py` (claim under the bundle's row lock, each step its own transaction, retry, reject), `bundle_views.py`; the pass groups a record's new steps into one bundle; `actions/surveys.py` and `actions/campaign_sends.py`." `services/work/` row: "`feed_decide.Bundles` replaces `Approvals`; `queues.py` serves the rail; Rest of company leaves out the reader's team (`team_scope.near`)."
- `docs/product/05-backend-schema.md`: an `AgentBundle` table (every field from contract §1.1, indexes, `__str__`); `AgentAction` gains the six fields, the two statuses, the two kinds, the `agent_action_bundle_position` constraint and the save() rule; the `Notification` kind label "Bundles waiting"; migrations `agents.0002`, `agents.0003`, `metrics.0014`, `metrics.0015`, `notifications.0014`.
- `docs/product/06-implementation-plan.md`: "Agent bundles, delivery 1 (2026-10-13, backend): bundles and steps, the run/retry/reject routes, placeholders, `survey.send` and `campaign.send`, Work over bundles (Mine, My team, Rest of company, History, the queue rail). Next: delivery 2 (message intake), delivery 3 (outside actions)."

- [ ] **Step 4: Check the schema shows the routes**

Run: `$PY manage.py shell -c "from django.test import Client; from services.accounts.models import User; c = Client(); c.force_login(User.objects.filter(is_active=True).first()); r = c.get('/api/schema/'); print(r.status_code, b'/api/v1/agents/bundles/{id}/run/' in r.content, b'/api/v1/work/queues/' in r.content)"`
Expected: `200 True True`. (This reads the local dev database's users only; it writes nothing.)

- [ ] **Step 5: Lint, migrations, the full suite**

Run: `../work-two-be/venv/bin/ruff check . && ../work-two-be/venv/bin/ruff format --check . && $PY manage.py makemigrations --check --dry-run`
Expected: clean, `No changes detected`.

Run: `$PY manage.py test --parallel auto --noinput`
Expected: `OK`. CI is blocked by GitHub billing, so this run is the gate: paste its last lines into the PR description later. A failure in a test this plan did not touch means an existing reader changed: find it with `systematic-debugging`; never loosen the test.

- [ ] **Step 6: The local dev database (owner's OK first)**

The owner's server on port 8000 uses the local dev database. Do **not** migrate it without the owner's explicit OK. When given: `$PY manage.py migrate --noinput`, expected `Applying agents.0002_agent_bundle... OK`, `metrics.0014_agent_action_steps... OK`, `agents.0003_bundles_of_one... OK`, `metrics.0015_agent_action_bundle_required... OK`, `notifications.0014_bundles_waiting... OK`. Until then, record "dev DB not migrated (needs owner OK)" in the hand-off.

- [ ] **Step 7: Commit**

```bash
git add docs/API_CONTRACTS.md docs/audit-events.md docs/data-classification.md .soc2/CONTROL_MAP.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md docs/superpowers/plans/2026-10-13-agent-bundles-d1-api.md
git commit -m "docs: agent bundles delivery 1 (bundles, run, History, queues)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: The Chrome by-eye test**

The delivery ends with one joint Chrome test, run by the frontend plan's last task (`react-ts-app` `docs/superpowers/plans/2026-10-13-agent-bundles-d1-frontend.md`) against this branch's backend on its own port (never 8000 or 5173). From this side: start the branch's server on a free port (`$PY manage.py runserver 8002`) against a **copy** of the dev database or a fresh one seeded with a bundle per kind, and leave it running for that task.
