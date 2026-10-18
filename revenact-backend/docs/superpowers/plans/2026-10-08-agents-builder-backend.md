# Agents, delivery 3 ("the builder"): backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Ops agent gains four workspace-level builder kinds (`segment.create`, `scenario.create`, `campaign.create`, `plan.template`) and every agent gains the record-level `canvas.create`. A person approves each one (Ask only), becomes the owner of everything it creates, and can undo it for 7 days while nobody has touched it. Every object an action makes says so (`made_by`), the Brain graph draws every waiting action the reader may read, and a draft reply's Send claims the draft before it calls the provider.

**Architecture:**
- **One module per kind** in `services/agents/actions/` (`segments.py`, `scenarios.py`, `campaigns.py`, `canvases.py`, `templates.py`), registered in `REGISTRY` between `plan.start` and `initiative.create`. What they share lives in `services/agents/builder.py`: a segment definition checked as the workspace when the agent writes it, created again as the approver through `SegmentWriteSerializer`, counted per reader, and released by undo when nothing else uses it.
- **Apply reuses each object's own write serializer** (`SegmentWriteSerializer`, `RuleWriteSerializer`, `CampaignWriteSerializer`, `TemplateWriteSerializer`) with the approver as the request's user, inside the decision's transaction. A refused serializer raises `Stale` (the action expires `changed`); a 50-per-owner limit raises the new `OwnerLimit`, which rolls the whole decision back and answers `409 OWNER_LIMIT`.
- **The objects remember the action.** `Segment`, `Rule`, `Campaign`, `Canvas` and `PlanTemplate` gain a nullable `agent_action` FK (`SET_NULL`); `services/agents/made_by.py` turns it into the payloads' `made_by`.
- **Per-reader previews.** `Kind.per_reader` lets a kind's preview take the reader. A segment's member count and a map's people count are computed once per page per reader through `bulk.Bulk`, so Activity stays bounded.
- **The Ops agent's prompt** gains a builder catalogue (fields, operators, values, triggers, steps, roles, template limits) and the workspace's shared segments and templates. Every agent's record blocks gain a people-by-role line, which `canvas.create` cites.

**Tech Stack:** Django 5.2, DRF, PostgreSQL (CI and prod 16, local 15), `core.audit`, `services.notifications.realtime.notify`.

**Spec:** react-ts-app `docs/superpowers/specs/2026-10-08-agents-builder-design.md` (read from `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/agents3-fe/docs/superpowers/specs/2026-10-08-agents-builder-design.md`). The binding contract is `docs/superpowers/plans/2026-10-08-agents-builder-api.md` in this worktree: every kind, code, sentence, field, preview shape and audit event in it is implemented exactly. Delivery 1 and 2's contracts (`2026-10-08-agents-actions-api.md`, `2026-10-08-agents-drafts-api.md`) still hold where this one is silent.

## Contract questions

Each is a place where the code forced a choice the contract does not state. The plan implements the answer shown; the controller confirms or changes it.

1. **A gone object.** For a one-object kind (segment, map, plan template) undo refuses with "This segment has been deleted." (map, plan template likewise). For a scenario or campaign whose rule or campaign a person deleted, undo still deletes its untouched, unused segment and succeeds; it refuses with "This scenario has been deleted." / "This campaign has been deleted." only when nothing is left to remove.
2. **`members`** is counted by `members_queryset`'s rule over the reader's book (one aggregate per segment kind per page) and tested equal to `members.preview(Draft(...))["count"]`; calling `members.preview` per row would make Activity's query count grow with its rows.
3. **A segment definition** needs 1 to 8 top-level conditions (each a leaf or a group); the preview's `conditions` counts every leaf.
4. **Display sentences are stored.** A scenario's `trigger` and `steps` sentences are worked out at generation and kept in its payload (`shown`), so previews read no rows.
5. **The workspace-level undo notice** now names the change: "Vic Viewer undid the Ops agent's segment." (an initiative: "…'s initiative."), instead of "…undid an agent action on the workspace.".
6. **Audit metadata.** Agent-made objects' events add `agent_action` (the action's id). `plan.template` also writes `plan_template.shared`, as a person's workspace-shared create does.
7. **The graph node** carries no `from_session` (the contract's shape has none). `/metrics/graph/` keeps its `proposal` nodes unchanged.
8. **`canvas.create`** is dropped when its record has no people line or does not cite it, and expires (`changed`) when the approver may open none of the record's people. Its target is `canvas`: one open map proposal per record.
9. **One builder action per pass** counts all five kinds, `canvas.create` included (spec §1, "For all five").
10. **Brain › Waiting** stops counting workspace-level actions in `hidden` for readers without view-all at Company scope, matching Activity and the contract's "never counted in `hidden`".
11. **The owner-limit detail** uses the contract's words for all four ("You already own 50 segments.", "… scenarios.", "… campaigns.", "… plan templates."), not each create view's "You can own at most …".
12. **A survey step's `without_review`** is forced to `false` at generation, and checked again at apply.
13. **An edited segment survives** a scenario's or campaign's undo, as a used one does: only the scenario or campaign goes.
14. **Drafts.** `GET /communications/drafts/?status=sent` lists `sending` drafts too (they read as `sent`); `?status=sending` is a 400 "Choose open or sent.".

## Global Constraints

**Worktree and git:**
- Work in `/Users/tusharaggarwal/Desktop/Projects/Revenact/.worktrees/agents3-be`, on branch `feat/agents-builder`, based on `main` after delivery 2 merged (`417eb00`).
- The worktree's `venv` is untracked. Never commit `venv` or `.superpowers`.
- Stage with `git add <explicit paths>`. Never `git add -A` or `git add .`.
- **Never use `git stash`.**

**Commands:**
- Tests: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test <labels> --noinput`. Parallel agents share the default test database, so **every** test command carries this `DATABASE_URL`.
- Migrations: `venv/bin/python manage.py makemigrations <app> --name <name>`. Never run `migrate` against the shared dev database; tests build their own.
- Lint: `venv/bin/ruff check .` and `venv/bin/ruff format --check .`. Ruff formats the Python fences inside Markdown too, at line length 100: every doc code block stays ruff-clean, and every code fence is closed.

**Commit messages:** conventional (`feat(agents): ...`, `fix(customers): ...`, `test(...)`, `docs: ...`), ending with exactly this line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

**Postgres 16:** never a join de-duplicated with `.distinct()`. Filter with `id__in` subqueries. `Account` has **no** organisation FK; reach it through `Account.customers.through`. Every new list or count has a no-DISTINCT test.

**Privacy:** counted, never named.
- The four workspace kinds are read and decided by view-all readers only, never reach Recommended, and are never counted in `hidden`.
- `canvas.create` is read by whoever may open its record and decided by its owner, anyone above them, or view-all.
- A segment preview's `members` and a map preview's `people` are counted as the reader.
- No builder text (name, description, subject, body, milestone or task title, step text) names a record, a task or a note; a campaign's subject and body name nothing internal.

**Customer text is untrusted data:** every workspace string in a prompt (segment, template, product and attribute names, picklist options) goes through `evidence._q` (`json.dumps`).

**SOC 2:**
- Every access rule carries a `# SOC2:AUTH-02 ...` comment.
- Every audited write calls `audit.record(...)` with `# SOC2:LOG-01`.
- A logged exception logs its class name only. `target_repr` names ids, never a name, subject or body.

**Locking:** row locks are `select_for_update` inside `transaction.atomic`. Fixed orders: an agent action's row, then the approver's `User` row (the 50-per-owner counts), then the objects it creates (apply); an agent action's row, then the rule or campaign, then its segment (undo). A once-only claim is a conditional UPDATE.

**Credentials:** never write a literal password or credential string. People come from `services.segments.tests.fixtures.person()`, mailboxes from `drafts_fixtures.mailbox()` (empty credentials), and the mail provider is always patched with `FakeProvider`.

**Tests:**
- Django `TestCase` on `AgentsFixture` (`services/agents/tests/fixtures.py`), `DoingFixture` (`services/brain/tests/doing_fixtures.py`) and `RecommendFixture` (`services/work/tests/recommend_fixtures.py`).
- Builder actions and definitions come from `services/agents/tests/builder_fixtures.py` (Task 3); contacts from `services.surveys.tests.fixtures.contact`.
- Every list gets a bounded-queries test (`CaptureQueriesContext`, few rows against many).

**Migrations:** `metrics 0013_agent_action_builder`; `segments 0002_segment_agent_action`; `rules 0006_rule_agent_action`; `campaigns 0007_campaign_agent_action`; `customers 0059_canvas_agent_action`, `0060_reply_draft_sending`; `plans 0005_template_agent_action`.

**Docs in the same PR:** `docs/API_CONTRACTS.md` (follow the api-contracts skill), `docs/audit-events.md`, `docs/data-classification.md`, and `docs/product/01-prd.md`, `02-trd.md`, `05-backend-schema.md`, `06-implementation-plan.md`.

**Out of scope:** the frontend; builder kinds from the CS or Sales agents; Auto for builder kinds; links on agent-made maps; two-way connectors. No new URL is added.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `services/metrics/models.py`, `migrations/0013_agent_action_builder.py` | modify / create | five `AgentAction.Kind` choices; `workspace_level` reads the registry |
| `services/agents/kinds.py` | modify | `Kind.builder`, `Kind.per_reader`, `Kind.texts`; `OwnerLimit` |
| `services/agents/payloads.py` | modify | per-reader previews; `result` gains five keys |
| `services/{segments,rules,campaigns,plans}/models.py`, `services/customers/models.py` + one migration each | modify / create | the `agent_action` FK |
| `services/agents/made_by.py` | create | `made_by(obj)`, `RELATED` |
| `services/segments/{payloads,views}.py`, `services/rules/{payloads,views}.py`, `services/campaigns/payloads.py`, `services/customers/canvas_payloads.py`, `services/plans/{payloads,views}.py` | modify | `made_by` on every detail and row, loaded without extra queries |
| `services/agents/views.py` | modify | `409 OWNER_LIMIT` |
| `services/agents/people.py` | create | a record's people by role; the people a reader may open |
| `services/agents/evidence.py` | modify | people line; Ops' shared segments, templates and products; attribute `api_name`; the builder catalogue; `record_mentions`; `sending` drafts are drafted |
| `services/agents/prompt.py` | modify | the catalogue and shared blocks; five payload shapes; the system rules |
| `services/agents/builder.py` | create | definitions, member counts, owner limits, segment create and release |
| `services/agents/bulk.py` | modify | member and people counts once per page and reader |
| `services/agents/actions/{segments,scenarios,campaigns,canvases,templates}.py` | create | the five kinds |
| `services/agents/{registry,undo,run}.py` | modify | registration; nouns and notice; free-text checks; one builder action per pass |
| `services/brain/desk.py` | modify | workspace-level actions are off non-view-all desks (never `hidden`) |
| `services/brain/graph.py` | modify | `agent_action` nodes from `readable` |
| `services/customers/{models,drafts,drafts_views}.py`, `services/agents/actions/drafts.py` | modify | status `sending`; Send claims first |
| `services/agents/tests/builder_fixtures.py` | create | definitions and builder actions for tests |
| `docs/API_CONTRACTS.md`, `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/*.md` | modify | same-PR docs |

Task order: the rows and the framework (Tasks 1–7), evidence and prompt (8–11), the shared builder pieces (12–14), the five kinds (15–21), registration and the run's rules (22–23), who reads and decides (24), the graph (25), the delivery 2 follow-up (26–27), bounded pages and end to end (28), docs (29–30), full verification (31). Each task builds on the ones before it.

---

### Task 1: The five kind choices, and `workspace_level` reads the registry

**Files:**
- Modify: `services/metrics/models.py:259-271` (`AgentAction.Kind`), `:371-373` (`workspace_level`)
- Create: `services/metrics/migrations/0013_agent_action_builder.py` (generated)
- Modify: `services/agents/tests/test_choices.py:11-16`
- Test: `services/agents/tests/test_builder_choices.py` (create)

**Interfaces:**
- Consumes: delivery 2's `AgentAction.Kind`.
- Produces: `AgentAction.Kind.SEGMENT_CREATE` (`"segment.create"`), `SCENARIO_CREATE`, `CAMPAIGN_CREATE`, `CANVAS_CREATE`, `PLAN_TEMPLATE` (`"plan.template"`), after `PLAN_START` and before `INITIATIVE_CREATE`. `AgentAction(kind=...).workspace_level` is the registry's `Kind.workspace_level` (False for an unknown kind).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_builder_choices.py`:

```python
"""Delivery 3's choices (contract): five kinds after plan.start and before
initiative.create; whether a kind is workspace-level is the registry's
word, not the model's."""

from django.test import SimpleTestCase

from services.metrics.models import AgentAction

FIVE = ["segment.create", "scenario.create", "campaign.create", "canvas.create", "plan.template"]


class BuilderChoicesTests(SimpleTestCase):
    def test_the_five_kinds_sit_between_plan_start_and_initiative(self):
        keys = list(AgentAction.Kind.values)
        at = keys.index("plan.start")
        self.assertEqual(keys[at + 1 : at + 6], FIVE)
        self.assertEqual(keys[at + 6], "initiative.create")
        labels = [AgentAction.Kind(key).label for key in FIVE]
        self.assertEqual(
            labels,
            [
                "Build a segment",
                "Build a scenario",
                "Draft a campaign",
                "Map a record's people",
                "Write a plan template",
            ],
        )

    def test_workspace_level_is_the_registrys(self):
        self.assertTrue(AgentAction(kind="initiative.create").workspace_level)
        self.assertFalse(AgentAction(kind="record.lifecycle").workspace_level)
        self.assertFalse(AgentAction(kind="no.such.kind").workspace_level)
```

In `services/agents/tests/test_choices.py`, replace the first assertion of `test_the_two_kinds_sit_between_note_and_initiative` with:

```python
self.assertEqual(keys[at + 1 : at + 3], ["draft.reply", "plan.start"])
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_choices services.agents.tests.test_choices --noinput`
Expected: `test_the_five_kinds_sit_between_plan_start_and_initiative` FAILS (the slice after `plan.start` is `["initiative.create"]`). `test_workspace_level_is_the_registrys` passes before and after: it pins the behaviour the new property must keep.

- [ ] **Step 3: Implement**

In `services/metrics/models.py`, `AgentAction.Kind`, after `PLAN_START`:

```python
        SEGMENT_CREATE = "segment.create", "Build a segment"
        SCENARIO_CREATE = "scenario.create", "Build a scenario"
        CAMPAIGN_CREATE = "campaign.create", "Draft a campaign"
        CANVAS_CREATE = "canvas.create", "Map a record's people"
        PLAN_TEMPLATE = "plan.template", "Write a plan template"
```

Replace the `workspace_level` property:

```python
    @property
    def workspace_level(self):
        """Whether the action's kind acts on no record: the registry's word."""
        from services.agents.registry import REGISTRY

        spec = REGISTRY.get(self.kind)
        return spec is not None and spec.workspace_level
```

Generate the migration:

Run: `venv/bin/python manage.py makemigrations metrics --name agent_action_builder`

Expected file `services/metrics/migrations/0013_agent_action_builder.py`: one `AlterField` on `agentaction.kind` (`max_length=24`), its `choices` the 17 kinds in order, `dependencies = [("metrics", "0012_agent_action_drafts_and_plans")]`. Nothing else.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_choices services.agents.tests.test_choices --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/metrics/models.py services/metrics/migrations/0013_agent_action_builder.py services/agents/tests/test_builder_choices.py services/agents/tests/test_choices.py
git commit -m "feat(metrics): five builder action kinds; workspace_level reads the registry

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `Kind` learns builder, per-reader previews and free text; `OwnerLimit`; five `result` keys

**Files:**
- Modify: `services/agents/kinds.py:20-70`
- Modify: `services/agents/payloads.py:73-94` (`_preview`, `_result`)
- Test: `services/agents/tests/test_builder_framework.py` (create)

**Interfaces:**
- Consumes: delivery 1's `Kind`, `action_payload`.
- Produces:
  - `Kind.builder: bool = False`: at most one builder action is kept per pass (Task 23).
  - `Kind.per_reader: bool = False`: when True, `preview` is `(action, reader) -> dict`.
  - `Kind.texts: Callable | None = None`: `payload -> list[str]`, every free-text field the naming rules check (None: the payload's `title`, `body` and `reason`).
  - `kinds.OwnerLimit(detail)`, with `.detail`: raised by an apply past a 50-per-owner limit.
  - `action_payload(...)["result"]` is `{task_id, note_id, initiative_id, draft_id, plan_id, segment_id, rule_id, campaign_id, canvas_id, template_id}`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_builder_framework.py`:

```python
"""The framework the builder kinds stand on (contract): `result` names every
thing a kind can make, a per-reader preview is written for its reader, and
an owner limit is its own exception."""

import dataclasses
from unittest.mock import patch

from services.agents.kinds import OwnerLimit
from services.agents.payloads import action_payload
from services.agents.registry import REGISTRY
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction


class FrameworkTests(AgentsFixture):
    def note(self, **fields):
        return AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=self.pizza,
            target="note:t",
            title="t",
            rationale="r",
            payload={"title": "t", "body": "b"},
            **fields,
        )

    def test_result_carries_every_made_thing(self):
        action = self.note(status="applied", result={"segment_id": 4, "rule_id": 5})
        self.assertEqual(
            action_payload(action, self.admin)["result"],
            {
                "task_id": None,
                "note_id": None,
                "initiative_id": None,
                "draft_id": None,
                "plan_id": None,
                "segment_id": 4,
                "rule_id": 5,
                "campaign_id": None,
                "canvas_id": None,
                "template_id": None,
            },
        )

    def test_a_per_reader_preview_is_written_for_its_reader(self):
        spec = dataclasses.replace(
            REGISTRY["note.create"],
            per_reader=True,
            preview=lambda action, reader: {"note": {"title": reader.name}},
        )
        action = self.note()
        with patch.dict(REGISTRY, {"note.create": spec}):
            self.assertEqual(
                action_payload(action, self.csm)["preview"], {"note": {"title": "Carl CSM"}}
            )
            self.assertEqual(
                action_payload(action, self.admin)["preview"], {"note": {"title": "Alice Admin"}}
            )

    def test_the_defaults_change_no_existing_kind(self):
        builders = {"segment.create", "scenario.create", "campaign.create", "canvas.create"}
        for spec in REGISTRY.values():
            if spec.key in builders | {"plan.template"}:
                continue
            self.assertFalse(spec.per_reader, spec.key)
            self.assertFalse(spec.builder, spec.key)
            self.assertIsNone(spec.texts, spec.key)

    def test_an_owner_limit_carries_its_sentence(self):
        self.assertEqual(
            OwnerLimit("You already own 50 segments.").detail, "You already own 50 segments."
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_framework --noinput`
Expected: FAIL with `ImportError: cannot import name 'OwnerLimit'`.

- [ ] **Step 3: Implement**

In `services/agents/kinds.py`, after `ChangedSince`:

```python
class OwnerLimit(Exception):
    """The approver already owns the most of one object an action makes: the
    decision is refused (409 OWNER_LIMIT) and the action stays proposed."""

    def __init__(self, detail):
        super().__init__(detail)
        self.detail = detail
```

At the end of the `Kind` dataclass's fields, after `unchanged`:

```python
    #: True for the builder kinds (segment, scenario, campaign, map, plan
    #: template): at most one of them is kept per pass.
    builder: bool = False
    #: True when `preview` is (action, reader) -> dict: a count the reader's
    #: own rules decide (a segment's members, a record's people).
    per_reader: bool = False
    #: payload -> every free-text string it carries, for the naming rules.
    #: None means the payload's `title`, `body` and `reason`.
    texts: Callable | None = None
```

In `services/agents/payloads.py`, the first line of `_preview` becomes:

```python
    spec = REGISTRY[action.kind]
    preview = spec.preview(action, reader) if spec.per_reader else spec.preview(action)
```

and `_result` becomes:

```python
#: Every thing a kind can make, in the contract's order.
RESULT_KEYS = (
    "task_id",
    "note_id",
    "initiative_id",
    "draft_id",
    "plan_id",
    "segment_id",
    "rule_id",
    "campaign_id",
    "canvas_id",
    "template_id",
)


def _result(action):
    result = action.result or {}
    return {key: result.get(key) for key in RESULT_KEYS}
```

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_framework services.agents.tests.test_api_actions --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/kinds.py services/agents/payloads.py services/agents/tests/test_builder_framework.py
git commit -m "feat(agents): builder, per-reader preview and free-text hooks on Kind; OwnerLimit

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Every object an action makes keeps the action

**Files:**
- Modify: `services/segments/models.py` (`Segment`), `services/rules/models.py` (`Rule`), `services/campaigns/models.py` (`Campaign`), `services/customers/models.py:2743-2826` (`Canvas`), `services/plans/models.py:52-101` (`PlanTemplate`)
- Create (generated): `services/segments/migrations/0002_segment_agent_action.py`, `services/rules/migrations/0006_rule_agent_action.py`, `services/campaigns/migrations/0007_campaign_agent_action.py`, `services/customers/migrations/0059_canvas_agent_action.py`, `services/plans/migrations/0005_template_agent_action.py`
- Create: `services/agents/tests/builder_fixtures.py`
- Test: `services/agents/tests/test_builder_links.py` (create)

**Interfaces:**
- Consumes: `AgentAction.Kind` (Task 1).
- Produces:
  - `agent_action` (nullable FK to `metrics.AgentAction`, `SET_NULL`) on `Segment` (`related_name="segments"`), `Rule` (`"rules"`), `Campaign` (`"campaigns"`), `Canvas` (`"canvases"`), `PlanTemplate` (`"plan_templates"`).
  - `builder_fixtures.FIGURES` (a workspace-figures line), `definition(**fields) -> dict` (organisations with poor health), `builder_action(organisation, kind, payload, *, record=None, agent="ops", target=None, **fields) -> AgentAction`.

- [ ] **Step 1: Write the test helpers and the failing test**

Create `services/agents/tests/builder_fixtures.py`:

```python
"""The builder kinds' test helpers (Agents delivery 3): a segment definition
the fixture's workspace accepts, and actions of each builder kind stored as
the agent would store them."""

from services.customers.models import Account
from services.metrics.models import AgentAction

#: A workspace-figures line, as `metrics.proposals.build_prompt` writes one.
FIGURES = "- At risk ARR [at_risk_arr]: $300,000"


def definition(**fields):
    """Organisations with poor health: Dough Co and Taco Bell in AgentsFixture."""
    return {
        "kind": "customer",
        "name": "Poor health",
        "description": "Poor health puts renewals at risk.",
        "rules": {
            "match": "all",
            "conditions": [{"field": "health_category", "op": "is", "value": "poor"}],
        },
        **fields,
    }


def builder_action(organisation, kind, payload, *, record=None, agent="ops", target=None, **fields):
    """A `kind` action with `payload` as stored; on `record` for canvas.create."""
    on = {}
    if record is not None:
        on = {"account" if isinstance(record, Account) else "customer": record}
    name = str(payload.get("name") or kind)
    return AgentAction.objects.create(
        organisation=organisation,
        agent=agent,
        batch="b",
        kind=kind,
        target=target or f"{kind}:{name.casefold()}"[:160],
        title=f"Build {name}",
        rationale="The figures say so.",
        evidence=[FIGURES],
        payload=payload,
        **on,
        **fields,
    )
```

Create `services/agents/tests/test_builder_links.py`:

```python
"""Each object a builder action makes keeps the action (contract, "Made by the
agent"); deleting the action never deletes the object."""

from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign
from services.customers.models import Canvas
from services.plans.models import PlanTemplate
from services.rules.models import Rule
from services.segments.models import Segment


class AgentActionLinkTests(AgentsFixture):
    def test_each_object_keeps_the_action_and_outlives_it(self):
        action = builder_action(self.org, "segment.create", definition())
        segment = Segment.objects.create(
            organisation=self.org, owner=self.admin, name="S", kind="customer", agent_action=action
        )
        rule = Rule.objects.create(
            organisation=self.org,
            owner=self.admin,
            name="R",
            trigger="entered",
            segment=segment,
            actions=[{"action": "task", "title": "Call", "assignee": "record_owner"}],
            agent_action=action,
        )
        campaign = Campaign.objects.create(
            organisation=self.org, owner=self.admin, name="C", segment=segment, agent_action=action
        )
        canvas = Canvas.objects.create(customer=self.pizza, name="M", agent_action=action)
        template = PlanTemplate.objects.create(
            organisation=self.org,
            owner=self.admin,
            name="T",
            kind="save",
            milestones=[{"name": "M", "offset_days": 0, "tasks": []}],
            agent_action=action,
        )
        made = (segment, rule, campaign, canvas, template)
        self.assertEqual(
            [
                list(getattr(action, name).all())
                for name in ("segments", "rules", "campaigns", "canvases", "plan_templates")
            ],
            [[obj] for obj in made],
        )
        action.delete()
        for obj in made:
            obj.refresh_from_db()
            self.assertIsNone(obj.agent_action_id)
```

- [ ] **Step 2: Run it to see it fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_links --noinput`
Expected: FAIL with `TypeError: Segment() got unexpected keyword arguments: 'agent_action'`.

- [ ] **Step 3: Implement**

Add this field to `Segment` (after `last_evaluated_on`), with `related_name="segments"` and the help text "The agent action that made this segment, if one did.":

```python
    agent_action = models.ForeignKey(
        "metrics.AgentAction",
        related_name="segments",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The agent action that made this segment, if one did.",
    )
```

Add the same field to:
- `Rule`, after `paused_reason`: `related_name="rules"`, help text "The agent action that made this scenario, if one did.";
- `Campaign`, after `recipients`: `related_name="campaigns"`, help text "The agent action that made this campaign, if one did.";
- `Canvas`, after `version`: `related_name="canvases"`, help text "The agent action that made this map, if one did.";
- `PlanTemplate`, after `is_builtin`: `related_name="plan_templates"`, help text "The agent action that wrote this template, if one did.".

Generate the five migrations, in this order (each depends on `metrics 0013`):

```bash
venv/bin/python manage.py makemigrations segments --name segment_agent_action
venv/bin/python manage.py makemigrations rules --name rule_agent_action
venv/bin/python manage.py makemigrations campaigns --name campaign_agent_action
venv/bin/python manage.py makemigrations customers --name canvas_agent_action
venv/bin/python manage.py makemigrations plans --name template_agent_action
```

Expected: five files, each one `AddField` of `agent_action` with `on_delete=django.db.models.deletion.SET_NULL`, and a dependency on `("metrics", "0013_agent_action_builder")`. Then `venv/bin/python manage.py makemigrations --check --dry-run` prints "No changes detected".

- [ ] **Step 4: Run it to see it pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_links --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/segments/models.py services/rules/models.py services/campaigns/models.py services/customers/models.py services/plans/models.py services/segments/migrations/0002_segment_agent_action.py services/rules/migrations/0006_rule_agent_action.py services/campaigns/migrations/0007_campaign_agent_action.py services/customers/migrations/0059_canvas_agent_action.py services/plans/migrations/0005_template_agent_action.py services/agents/tests/builder_fixtures.py services/agents/tests/test_builder_links.py
git commit -m "feat(agents): segments, rules, campaigns, maps and templates keep the action that made them

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `made_by`, and segments carry it

**Files:**
- Create: `services/agents/made_by.py`
- Modify: `services/segments/payloads.py:18-50` (`segment_payload`), `:86-116` (`list_rows`)
- Modify: `services/segments/views.py:83-87` (the list's `select_related`), `services/segments/access.py:32` (`get_readable`)
- Test: `services/agents/tests/test_made_by.py` (create)

**Interfaces:**
- Consumes: `Segment.agent_action` (Task 3).
- Produces:
  - `made_by.made_by(obj) -> {"agent": str, "approved_by": {"id", "name"} | None} | None`: None when `obj.agent_action_id` is None; `approved_by` is the action's `decided_by`.
  - `made_by.RELATED == "agent_action__decided_by"`: what a queryset loads so `made_by` reads no row.
  - `GET /segments/<id>/` and every `GET /segments/` row gain `made_by`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_made_by.py`:

```python
"""Made by the agent (contract): segment, scenario, campaign, map and plan
template payloads say which agent made the object and who approved it, and
their lists read no more rows for it."""

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.segments.models import Segment
from services.segments.tests.fixtures import person

UNAPPROVED = {"agent": "ops", "approved_by": None}


class MadeByFixture(AgentsFixture):
    def applied(self, kind="segment.create", payload=None, **fields):
        fields.setdefault("decided_by", self.admin)
        return builder_action(
            self.org,
            kind,
            payload or definition(name=f"Made {timezone.now().timestamp()}"),
            status="applied",
            **fields,
        )

    def approved(self):
        return {"agent": "ops", "approved_by": {"id": self.admin.pk, "name": "Alice Admin"}}

    def queries(self, user, url):
        with CaptureQueriesContext(connection) as captured:
            response = self.client_for(user).get(url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in captured).upper())
        return len(captured)


class SegmentMadeByTests(MadeByFixture):
    def segment(self, name, action=None):
        return Segment.objects.create(
            organisation=self.org, owner=self.admin, name=name, kind="customer", agent_action=action
        )

    def test_the_detail_and_the_row_say_who_made_it(self):
        made = self.segment("Made", self.applied())
        mine = self.segment("Mine")
        client = self.client_for(self.admin)
        self.assertEqual(
            client.get(f"/api/v1/segments/{made.pk}/").json()["made_by"], self.approved()
        )
        self.assertIsNone(client.get(f"/api/v1/segments/{mine.pk}/").json()["made_by"])
        rows = {row["id"]: row for row in client.get("/api/v1/segments/").json()}
        self.assertEqual(rows[made.pk]["made_by"], self.approved())
        self.assertIsNone(rows[mine.pk]["made_by"])

    def test_approved_by_is_null_once_the_decider_is_gone(self):
        # `decided_by` is SET_NULL: deleting the person leaves the agent's name only.
        gone = person("gone@acme.io", "Gone Person", self.org)
        made = self.segment("Made", self.applied(decided_by=gone))
        gone.delete()
        body = self.client_for(self.admin).get(f"/api/v1/segments/{made.pk}/").json()
        self.assertEqual(body["made_by"], UNAPPROVED)

    def test_the_list_reads_no_more_rows_for_made_segments(self):
        self.segment("First", self.applied())
        few = self.queries(self.admin, "/api/v1/segments/")
        for index in range(3):
            self.segment(f"More {index}", self.applied())
        self.assertEqual(self.queries(self.admin, "/api/v1/segments/"), few)
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_made_by --noinput`
Expected: FAIL with `KeyError: 'made_by'`.

- [ ] **Step 3: Implement**

Create `services/agents/made_by.py`:

```python
"""Whether an agent made an object (contract, "Made by the agent"): a
segment, scenario, campaign, map or plan template page names the agent and
the person who approved it. Lists load `RELATED` with the object, so this
reads no row."""

#: What a queryset loads so `made_by` reads nothing more.
RELATED = "agent_action__decided_by"


def made_by(obj):
    """`{"agent", "approved_by": {"id", "name"} | None}`, or None when no
    agent action made `obj`."""
    if obj.agent_action_id is None:
        return None
    action = obj.agent_action
    decider = action.decided_by
    return {
        "agent": action.agent,
        "approved_by": None if decider is None else {"id": decider.pk, "name": decider.name},
    }
```

In `services/segments/payloads.py`, import it (`from services.agents.made_by import made_by`) and add `"made_by": made_by(segment),` after `"updated_at"` in `segment_payload`'s dict, and after `"updated_at"` in `list_rows`'s `row`.

In `services/segments/views.py`, `SegmentListCreateView.get`, the chain becomes:

```python
        segments = (
            segments.select_related("owner", RELATED)
            .defer("rules", "pinned_ids", "excluded_ids", "last_members")
            .order_by("name", "pk")
        )
```

with `from services.agents.made_by import RELATED`. In `services/segments/access.py`, `get_readable`'s queryset becomes `readable_segments(user).select_related("owner", RELATED).defer("last_members")`, with the same import.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_made_by services.segments --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/made_by.py services/segments/payloads.py services/segments/views.py services/segments/access.py services/agents/tests/test_made_by.py
git commit -m "feat(segments): a segment says which agent made it and who approved it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rules and campaigns carry `made_by`

**Files:**
- Modify: `services/rules/payloads.py:110-132` (`_row`), `services/rules/views.py:96` (list), `services/rules/access.py:32` (`get_readable`)
- Modify: `services/campaigns/payloads.py:86-104` (`_row`), `:130` (`list_page`), `:146` (`read_campaign`), `:156` (`campaign_payload`)
- Test: `services/agents/tests/test_made_by.py`

**Interfaces:**
- Consumes: `made_by`, `RELATED` (Task 4); `MadeByFixture`.
- Produces: `GET /rules/`, `/rules/<id>/`, `GET /campaigns/`, `/campaigns/<id>/` rows and details gain `made_by`.

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_made_by.py` (add `from services.campaigns.models import Campaign` and `from services.rules.models import Rule` to the imports):

```python
class RuleAndCampaignMadeByTests(MadeByFixture):
    def setUp(self):
        self.segment = Segment.objects.create(
            organisation=self.org, owner=self.admin, name="Base", kind="customer"
        )

    def rule(self, name, action=None):
        return Rule.objects.create(
            organisation=self.org,
            owner=self.admin,
            name=name,
            trigger="entered",
            segment=self.segment,
            actions=[{"action": "task", "title": "Call", "assignee": "record_owner"}],
            agent_action=action,
        )

    def campaign(self, name, action=None):
        return Campaign.objects.create(
            organisation=self.org,
            owner=self.admin,
            name=name,
            segment=self.segment,
            agent_action=action,
        )

    def test_a_rule_says_who_made_it(self):
        made = self.rule("Made", self.applied("scenario.create", {"name": "Made"}))
        mine = self.rule("Mine")
        client = self.client_for(self.admin)
        self.assertEqual(client.get(f"/api/v1/rules/{made.pk}/").json()["made_by"], self.approved())
        rows = {row["id"]: row for row in client.get("/api/v1/rules/").json()}
        self.assertEqual(rows[made.pk]["made_by"], self.approved())
        self.assertIsNone(rows[mine.pk]["made_by"])

    def test_a_campaign_says_who_made_it(self):
        made = self.campaign("Made", self.applied("campaign.create", {"name": "Made"}))
        mine = self.campaign("Mine")
        client = self.client_for(self.admin)
        detail = client.get(f"/api/v1/campaigns/{made.pk}/").json()
        self.assertEqual(detail["made_by"], self.approved())
        rows = {row["id"]: row for row in client.get("/api/v1/campaigns/").json()["results"]}
        self.assertEqual(rows[made.pk]["made_by"], self.approved())
        self.assertIsNone(rows[mine.pk]["made_by"])

    def test_the_lists_read_no_more_rows_for_made_objects(self):
        self.rule("First", self.applied("scenario.create", {"name": "R0"}))
        self.campaign("First", self.applied("campaign.create", {"name": "C0"}))
        few = [self.queries(self.admin, url) for url in ("/api/v1/rules/", "/api/v1/campaigns/")]
        for index in range(1, 4):
            self.rule(f"R{index}", self.applied("scenario.create", {"name": f"R{index}"}))
            self.campaign(f"C{index}", self.applied("campaign.create", {"name": f"C{index}"}))
        many = [self.queries(self.admin, url) for url in ("/api/v1/rules/", "/api/v1/campaigns/")]
        self.assertEqual(many, few)
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_made_by.RuleAndCampaignMadeByTests --noinput`
Expected: FAIL with `KeyError: 'made_by'`.

- [ ] **Step 3: Implement**

`services/rules/payloads.py`: import `from services.agents.made_by import made_by`, and add `"made_by": made_by(rule),` after `"updated_at"` in `_row`.

`services/rules/views.py`, `RuleListCreateView.get`: `rules = rules.select_related("owner", "segment", RELATED).order_by("name", "pk")`. `services/rules/access.py`, `get_readable`: `readable_rules(user).select_related("owner", "segment", RELATED)`. Both import `from services.agents.made_by import RELATED`.

`services/campaigns/payloads.py`: import `from services.agents.made_by import RELATED, made_by`; add `"made_by": made_by(campaign),` after `"updated_at"` in `_row`; and in `list_page`, `read_campaign` and `campaign_payload` each `.select_related("owner", "segment")` becomes `.select_related("owner", "segment", RELATED)`.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_made_by services.rules services.campaigns --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/rules/payloads.py services/rules/views.py services/rules/access.py services/campaigns/payloads.py services/agents/tests/test_made_by.py
git commit -m "feat(rules,campaigns): a scenario or campaign says which agent made it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Maps and plan templates carry `made_by`

**Files:**
- Modify: `services/customers/canvas_payloads.py:32-33` (`ROW_RELATED`, `DETAIL_RELATED`), `:57-67` (`canvas_row`)
- Modify: `services/plans/payloads.py:29-52` (`template_payload`), `services/plans/views.py:186-188` (`_templates`)
- Test: `services/agents/tests/test_made_by.py`

**Interfaces:**
- Consumes: `made_by`, `RELATED` (Task 4).
- Produces: `GET /canvases/` rows, every record's map rows, `GET /canvases/<id>/`, and each `GET /plans/templates/` item and `/plans/templates/<id>/` gain `made_by`.

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_made_by.py` (add `from services.customers.models import Canvas` and `from services.plans.models import PlanTemplate`):

```python
class MapAndTemplateMadeByTests(MadeByFixture):
    def canvas(self, name, action=None):
        return Canvas.objects.create(customer=self.pizza, name=name, agent_action=action)

    def template(self, name, action=None):
        return PlanTemplate.objects.create(
            organisation=self.org,
            owner=self.admin,
            name=name,
            kind="save",
            sharing="workspace",
            milestones=[{"name": "Call", "offset_days": 0, "tasks": []}],
            agent_action=action,
        )

    def test_a_map_says_who_made_it(self):
        action = self.applied("canvas.create", {"name": "People"}, record=self.pizza)
        made = self.canvas("Made", action)
        mine = self.canvas("Mine")
        client = self.client_for(self.admin)
        self.assertEqual(
            client.get(f"/api/v1/canvases/{made.pk}/").json()["made_by"], self.approved()
        )
        rows = {row["id"]: row for row in client.get("/api/v1/canvases/").json()["results"]}
        self.assertEqual(rows[made.pk]["made_by"], self.approved())
        self.assertIsNone(rows[mine.pk]["made_by"])
        record = client.get(f"/api/v1/customers/{self.pizza.pk}/canvases/").json()["results"]
        self.assertEqual({row["id"]: row["made_by"] for row in record}[made.pk], self.approved())

    def test_a_template_says_who_wrote_it(self):
        made = self.template("Made", self.applied("plan.template", {"name": "Made"}))
        mine = self.template("Mine")
        groups = self.client_for(self.csm).get("/api/v1/plans/templates/").json()
        shared = {item["id"]: item for item in groups["shared"]}
        self.assertEqual(shared[made.pk]["made_by"], self.approved())
        self.assertIsNone(shared[mine.pk]["made_by"])
        detail = self.client_for(self.csm).get(f"/api/v1/plans/templates/{made.pk}/").json()
        self.assertEqual(detail["made_by"], self.approved())

    def test_the_lists_read_no_more_rows_for_made_objects(self):
        self.canvas("M0", self.applied("canvas.create", {"name": "M0"}, record=self.pizza))
        self.template("T0", self.applied("plan.template", {"name": "T0"}))
        urls = ("/api/v1/canvases/", "/api/v1/plans/templates/")
        few = [self.queries(self.admin, url) for url in urls]
        for index in range(1, 4):
            action = self.applied("canvas.create", {"name": f"M{index}"}, record=self.dough)
            self.canvas(f"M{index}", action)
            self.template(f"T{index}", self.applied("plan.template", {"name": f"T{index}"}))
        self.assertEqual([self.queries(self.admin, url) for url in urls], few)
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_made_by.MapAndTemplateMadeByTests --noinput`
Expected: FAIL with `KeyError: 'made_by'`.

- [ ] **Step 3: Implement**

`services/customers/canvas_payloads.py`: import `from services.agents.made_by import RELATED, made_by`, then:

```python
ROW_RELATED = ("customer", "account", "updated_by", RELATED)
DETAIL_RELATED = ("customer", "account", "created_by", "updated_by", RELATED)
```

and add `"made_by": made_by(canvas),` after `"updated_by"` in `canvas_row`.

`services/plans/payloads.py`: import `from services.agents.made_by import made_by`; add `"made_by": made_by(template),` after `"updated_at"` in `template_payload`, and extend its docstring to "Needs `owner` and `agent_action__decided_by` loaded and `shared_with` prefetched."

`services/plans/views.py`, `_templates`:

```python
def _templates(user):
    rows = readable_templates(user).select_related("owner", RELATED).prefetch_related("shared_with")
    return rows.order_by("name", "pk")
```

with `from services.agents.made_by import RELATED`. Any other caller of `template_payload` (`grep -rn "template_payload(" services`) loads its template through `_templates`; one that does not reads two more rows for an agent-made template, which is correct, only slower.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_made_by services.plans services.customers.tests.test_canvas_lists services.customers.tests.test_canvas_detail --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/customers/canvas_payloads.py services/plans/payloads.py services/plans/views.py services/agents/tests/test_made_by.py
git commit -m "feat(canvas,plans): a map or plan template says which agent made it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: A decision past an owner limit answers 409 and changes nothing

**Files:**
- Modify: `services/agents/views.py:23` (import), `:282-313` (`ActionDecisionView.post`)
- Modify: `services/agents/deciding.py:177-199` (`_decide` docstring only)
- Test: `services/agents/tests/test_builder_framework.py`

**Interfaces:**
- Consumes: `OwnerLimit` (Task 2).
- Produces: `POST /agents/actions/<id>/approve/` answers `409 {"code": "OWNER_LIMIT", "detail": <the OwnerLimit's detail>}` when the kind's apply raises `OwnerLimit`. Everything the apply wrote is rolled back, no `agent_action.approved` is audited, and the action stays `proposed`.

- [ ] **Step 1: Write the failing test**

Append to `services/agents/tests/test_builder_framework.py` (add `from core.models import AuditEvent` and `from services.customers.models import Note`):

```python
class OwnerLimitDecisionTests(AgentsFixture):
    def test_a_limit_refuses_with_409_and_leaves_the_action_proposed(self):
        def apply(action, actor, **_):
            Note.objects.create(
                customer=action.customer, title="Made first", body="b", logged_at=self.today
            )
            raise OwnerLimit("You already own 50 segments.")

        spec = dataclasses.replace(REGISTRY["note.create"], apply=apply)
        action = AgentAction.objects.create(
            organisation=self.org,
            agent="cs",
            batch="b",
            kind="note.create",
            customer=self.pizza,
            target="note:t",
            title="t",
            rationale="r",
            payload={"title": "t", "body": "b"},
        )
        with patch.dict(REGISTRY, {"note.create": spec}):
            response = self.client_for(self.csm).post(
                f"/api/v1/agents/actions/{action.pk}/approve/", {}, format="json"
            )
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "OWNER_LIMIT", "detail": "You already own 50 segments."}),
        )
        action.refresh_from_db()
        self.assertEqual((action.status, action.decided_by), ("proposed", None))
        self.assertFalse(Note.objects.filter(title="Made first").exists())
        self.assertFalse(AuditEvent.objects.filter(action="agent_action.approved").exists())
```

- [ ] **Step 2: Run it to see it fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_framework.OwnerLimitDecisionTests --noinput`
Expected: ERROR: `services.agents.kinds.OwnerLimit: You already own 50 segments.` escapes the view.

- [ ] **Step 3: Implement**

`services/agents/views.py`: `from .kinds import ChangedSince, OwnerLimit`. In `ActionDecisionView.post`, after the `except ChangedSince` clause:

```python
        except OwnerLimit as exc:
            # The decision's transaction rolled back: the action is still proposed.
            return _code("OWNER_LIMIT", exc.detail)
```

`services/agents/deciding.py`, `_decide`'s docstring becomes:

```python
    """Lock, check, and `run(action, role)`; an expiry is kept and raised
    after the lock is released. Anything else `run` raises (an OwnerLimit)
    leaves the whole transaction, so nothing the apply wrote is kept and the
    action stays proposed."""
```

- [ ] **Step 4: Run it to see it pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_framework services.agents.tests.test_api_actions --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/views.py services/agents/deciding.py services/agents/tests/test_builder_framework.py
git commit -m "feat(agents): a decision past an owner limit answers 409 OWNER_LIMIT

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Every record's people, counted by role, in every agent's evidence

**Files:**
- Create: `services/agents/people.py`
- Modify: `services/agents/evidence.py:127-145` (`_row`), `:148-181` (`build`), `:494-518` (`record_block`)
- Test: `services/agents/tests/test_evidence_people.py` (create)

**Interfaces:**
- Consumes: `customers.canvas.ROLE_ROWS`, `Account.customers.through`.
- Produces:
  - `people.record_people(contacts, customer_ids, account_ids) -> {ref: Counter(role -> n)}`: an organisation's own contacts and its accounts', an account's own, among the `contacts` queryset. Two queries, `id IN` filters.
  - `people.people_line(counts) -> str | None`: `"people: 6 (decision maker 1, champion 2, other 3)"`, roles in map order (decision maker, economic buyer, champion, influencer, then the rest in `Contact.Role` order); None for nobody.
  - Each evidence row gains `row["people"]` (the line, or None); `record_block` shows it as `"    people: …"` after the record's first line. `canvas.create` cites it (Task 20).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_evidence_people.py`:

```python
"""Each record's people, by role, in every agent's evidence (contract,
canvas.create): counted, never named, an organisation's own and its
accounts', in two queries without DISTINCT."""

from collections import Counter

from django.db import connection
from django.test.utils import CaptureQueriesContext

from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.people import people_line, record_people
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Contact
from services.surveys.tests.fixtures import contact


class PeopleLineTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.pizza, "Ann", Contact.Role.CHAMPION)
        contact(cls.pizza, "Cal", Contact.Role.OTHER)
        contact(cls.emea, "Ben", Contact.Role.DECISION_MAKER)

    def test_an_organisation_counts_its_accounts_people_and_an_account_its_own(self):
        found = record_people(Contact.objects.all(), [self.pizza.pk], [self.emea.pk])
        self.assertEqual(
            found[f"customer:{self.pizza.pk}"],
            Counter({"champion": 1, "other": 1, "decision_maker": 1}),
        )
        self.assertEqual(found[f"account:{self.emea.pk}"], Counter({"decision_maker": 1}))

    def test_the_line_is_counts_in_map_order_and_none_for_nobody(self):
        counts = Counter({"other": 3, "champion": 2, "decision_maker": 1})
        self.assertEqual(people_line(counts), "people: 6 (decision maker 1, champion 2, other 3)")
        self.assertIsNone(people_line(Counter()))

    def test_every_agent_sees_the_line_and_no_name(self):
        org = Organisation.objects.get(pk=self.org.pk)
        for agent in ("cs", "ops"):
            ctx = evidence.build(org, agent, today=self.today)
            row = ctx.records[f"customer:{self.pizza.pk}"]
            line = "people: 3 (decision maker 1, champion 1, other 1)"
            self.assertEqual(row["people"], line)
            self.assertIn(f"    {line}", evidence.record_block(ctx, row))
            self.assertIn(line, evidence.record_lines(ctx, f"customer:{self.pizza.pk}"))
            self.assertIsNone(ctx.records[f"customer:{self.dough.pk}"]["people"])
            block = "\n".join(evidence.record_block(ctx, row))
            for name in ("Ann", "Cal", "Ben"):
                self.assertNotIn(name, block)

    def test_counting_is_two_queries_without_distinct(self):
        with CaptureQueriesContext(connection) as captured:
            record_people(Contact.objects.all(), [self.pizza.pk, self.dough.pk], [self.emea.pk])
        self.assertEqual(len(captured), 2)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in captured).upper())
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_evidence_people --noinput`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.agents.people'`.

- [ ] **Step 3: Implement**

Create `services/agents/people.py`:

```python
"""A record's people, counted by role (contract, canvas.create): an
organisation's own contacts and its accounts', an account's own, as a map
built from people lays them out (`customers.canvas.record_contacts_q`).
Counted, never named; two queries for any number of records."""

from collections import Counter

from django.db.models import Count, Q

from services.customers.canvas import ROLE_ROWS
from services.customers.models import Account, Contact

#: The line's role order: a map's rows first, then every other role.
ORDER = [role for row in ROLE_ROWS for role in row]
ORDER += [role for role in Contact.Role.values if role not in ORDER]
LABELS = dict(Contact.Role.choices)


def record_people(contacts, customer_ids, account_ids):
    """`{ref: Counter(role -> n)}` among `contacts` (a Contact queryset)
    for each record that has any."""
    customer_ids, account_ids = set(customer_ids), set(account_ids)
    parents = {}
    if customer_ids:
        links = Account.customers.through.objects.filter(
            customer_id__in=sorted(customer_ids)
        ).values_list("customer_id", "account_id")
        for customer_id, account_id in links:
            parents.setdefault(account_id, set()).add(customer_id)
    wanted = account_ids | set(parents)
    rows = (
        contacts.filter(Q(customer_id__in=sorted(customer_ids)) | Q(account_id__in=sorted(wanted)))
        .order_by()
        .values("customer_id", "account_id", "role")
        .annotate(n=Count("id"))
    )
    found = {}
    for row in rows:
        refs = set()
        if row["customer_id"] in customer_ids:
            refs.add(f"customer:{row['customer_id']}")
        account_id = row["account_id"]
        if account_id is not None:
            if account_id in account_ids:
                refs.add(f"account:{account_id}")
            refs |= {f"customer:{pk}" for pk in parents.get(account_id, ())}
        for ref in refs:
            found.setdefault(ref, Counter())[row["role"]] += row["n"]
    return found


def people_line(counts):
    """`people: 6 (decision maker 1, champion 2, other 3)`, or None."""
    total = sum(counts.values())
    if not total:
        return None
    parts = [f"{LABELS[role].lower()} {counts[role]}" for role in ORDER if counts.get(role)]
    return f"people: {total} ({', '.join(parts)})"
```

In `services/agents/evidence.py`:
- `_row`'s dict gains `"people": None,` after `"plans": []`.
- In `build`, after `_tasks_and_notes(ctx, owners)`:

```python
    _people(ctx, customer_ids, account_ids)
```

- New function after `_tasks_and_notes`:

```python
def _people(ctx, customer_ids, account_ids):
    """Each record's people line: counts by role, never a name, so every
    agent may see it (contract, canvas.create)."""
    from services.customers.models import Contact

    from .people import people_line, record_people

    found = record_people(Contact.objects.all(), customer_ids, account_ids)
    for ref, row in ctx.records.items():
        row["people"] = people_line(found.get(ref, {}))
```

- In `record_block`, right after `lines = [...]` (the record's first line):

```python
    if row.get("people"):
        lines.append(f"    {row['people']}")
```

`people_line({})` works: `sum({}.values())` is 0.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents --noinput`
Expected: PASS (the existing evidence tests only check that lines are in a block).

- [ ] **Step 5: Commit**

```bash
git add services/agents/people.py services/agents/evidence.py services/agents/tests/test_evidence_people.py
git commit -m "feat(agents): every record's people, counted by role, in the evidence

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The Ops agent sees the shared segments, templates and products, and attribute api names

**Files:**
- Modify: `services/agents/evidence.py:24-56` (`Context`), `:148-181` (`build`), `:192-208` (`_attributes`), after `template_lines` (new `_shared_segments`, `segment_lines`, `_products`)
- Modify: `services/agents/prompt.py:79-102` (`render`)
- Test: `services/agents/tests/test_evidence_builder.py` (create)

**Interfaces:**
- Consumes: delivery 2's `_templates(ctx)` and `template_lines(ctx)`.
- Produces:
  - `Context.segments: {id: {"id", "name", "kind"}}`: the workspace's `sharing="workspace"` segments, by name, at most `SEGMENT_LIMIT = 20`; Ops only.
  - `Context.products: {id: name}`: the workspace's products, by name, at most `PRODUCT_LIMIT = 50`; Ops only.
  - `Context.templates` is now filled for Ops too (built-ins and workspace-shared).
  - `ctx.attributes[id]["api_name"]`.
  - `evidence.segment_lines(ctx)`; `prompt.render` prints a "Shared segments:" block when `ctx.segments`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_evidence_builder.py`:

```python
"""What the Ops agent builds from (contract): the workspace's shared segments
and templates by name and kind, never a private or person-shared one, its
products, and the AI attributes' api names; the CS agent sees none of it."""

from services.accounts.models import Organisation
from services.agents import evidence, prompt
from services.agents.tests.fixtures import AgentsFixture
from services.attributes.models import AIAttribute
from services.customers.models import Product
from services.plans.models import PlanTemplate
from services.segments.models import Segment


class OpsBuilderEvidenceTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        made = {"organisation": cls.org, "owner": cls.admin, "kind": "customer"}
        cls.shared = Segment.objects.create(name='At "risk"', sharing="workspace", **made)
        cls.private = Segment.objects.create(name="Mine only", **made)
        cls.named = Segment.objects.create(name="For Carl", sharing="people", **made)
        milestones = [{"name": "Call", "offset_days": 0, "tasks": []}]
        common = {"organisation": cls.org, "owner": cls.admin, "kind": "save"}
        cls.workspace_template = PlanTemplate.objects.create(
            name="Shared save", sharing="workspace", milestones=milestones, **common
        )
        cls.private_template = PlanTemplate.objects.create(
            name="Private save", milestones=milestones, **common
        )
        cls.product = Product.objects.create(organisation=cls.org, name="Product B")
        cls.tier = AIAttribute.objects.create(
            organisation=cls.org, name="Tier", api_name="tier", prompt="p", value_type="text"
        )

    def ctx(self, agent):
        return evidence.build(Organisation.objects.get(pk=self.org.pk), agent, today=self.today)

    def test_ops_sees_only_what_the_whole_workspace_shares(self):
        ctx = self.ctx("ops")
        self.assertEqual(
            ctx.segments,
            {self.shared.pk: {"id": self.shared.pk, "name": 'At "risk"', "kind": "customer"}},
        )
        self.assertIn(self.workspace_template.pk, ctx.templates)
        self.assertNotIn(self.private_template.pk, ctx.templates)
        self.assertEqual(ctx.products, {self.product.pk: "Product B"})
        self.assertEqual(ctx.attributes[self.tier.pk]["api_name"], "tier")
        text = prompt.render(ctx)
        self.assertIn("Shared segments:", text)
        self.assertIn(f'  segment {self.shared.pk}: "At \\"risk\\"" (customer)', text)
        self.assertNotIn("Mine only", text)
        self.assertNotIn("For Carl", text)
        self.assertNotIn("Private save", text)

    def test_cs_sees_no_segments_or_products(self):
        ctx = self.ctx("cs")
        self.assertEqual((ctx.segments, ctx.products), ({}, {}))
        self.assertNotIn("Shared segments:", prompt.render(ctx))
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_evidence_builder --noinput`
Expected: FAIL with `AttributeError: 'Context' object has no attribute 'segments'`.

- [ ] **Step 3: Implement**

`services/agents/evidence.py`, `Context` gains, after `templates`:

```python
    #: segment id -> {"id", "name", "kind"}: the workspace-shared segments the
    #: Ops agent must not build again (contract, builder evidence)
    segments: dict = field(default_factory=dict)
    #: product id -> name, for a segment's `product` field (Ops only)
    products: dict = field(default_factory=dict)
```

`_attributes`: the attribute dict gains `"api_name": attribute.api_name,` after `"name"`.

`build`: replace `if agent == "ops":` with:

```python
    if agent == "ops":
        from services.metrics.proposals import NothingToProposeFrom, build_evidence

        _templates(ctx)
        _shared_segments(ctx)
        _products(ctx)
        try:
            ctx.figures = build_evidence(organisation)
        except NothingToProposeFrom:
            ctx.figures = None
```

After `template_lines`:

```python
#: Most shared segments and products the Ops prompt lists.
SEGMENT_LIMIT = 20
PRODUCT_LIMIT = 50


def _shared_segments(ctx):
    """The workspace's `sharing="workspace"` segments, by name and kind."""
    from services.segments.models import Segment

    # SOC2:AUTH-02 never a private or person-shared segment: the prompt is
    # the whole workspace's, and only what every member may read reaches it
    rows = Segment.objects.filter(
        organisation=ctx.organisation, sharing=Segment.Sharing.WORKSPACE
    ).order_by("name", "id")[:SEGMENT_LIMIT]
    for segment in rows:
        ctx.segments[segment.pk] = {"id": segment.pk, "name": segment.name, "kind": segment.kind}


def segment_lines(ctx):
    return [f"  segment {s['id']}: {_q(s['name'])} ({s['kind']})" for s in ctx.segments.values()]


def _products(ctx):
    from services.customers.models import Product

    rows = Product.objects.filter(organisation=ctx.organisation).order_by("name", "id")
    ctx.products = dict(rows.values_list("id", "name")[:PRODUCT_LIMIT])
```

`services/agents/prompt.py`, `render`, after the plan templates block:

```python
    if ctx.segments:
        lines.append("\nShared segments:")
        lines.extend(evidence.segment_lines(ctx))
```

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/evidence.py services/agents/prompt.py services/agents/tests/test_evidence_builder.py
git commit -m "feat(agents): the Ops agent sees shared segments, templates, products and attribute api names

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The builder catalogue in the Ops agent's prompt

**Files:**
- Modify: `services/agents/evidence.py` (new `catalogue_lines`, `_field_line`)
- Modify: `services/agents/prompt.py:79-102` (`render`)
- Test: `services/agents/tests/test_evidence_builder.py`

**Interfaces:**
- Consumes: `ctx.attributes[...]["api_name"]`, `ctx.products` (Task 9); `segments.registry.FIELDS`, `OPERATORS`; `rules.models.SCORE_RANGES`.
- Produces: `evidence.catalogue_lines(ctx) -> list[str]`; `prompt.render(ctx)` adds a "BUILDER CATALOGUE:" block for the Ops agent only.

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_evidence_builder.py`:

```python
class CatalogueTests(OpsBuilderEvidenceTests):
    def test_the_ops_prompt_carries_the_catalogue(self):
        text = prompt.render(self.ctx("ops"))
        self.assertIn("\nBUILDER CATALOGUE:", text)
        for wanted in (
            "- segment kinds: customer (organisations), account (accounts), contact (contacts)",
            "health_category choice (good|average|poor)",
            "nps_band choice (promoter|passive|detractor)",
            "- operators: number gt|lt|between|is_empty|is_not_empty;",
            'attr:tier text, options "-"',
            f'- products (id: name): {self.product.pk}: "Product B"',
            '"score": "csat"|"nps"|"ces"|"health"',
            "health 0-10",
            '{"action": "survey", "survey_type": "nps"|"csat"|"ces"',
            "- contact roles: executive_sponsor, champion, economic_buyer",
            "- campaign merge fields: {first_name}, {organisation}, {sender_name}",
            "- template kinds: onboarding, success, save, qbr, other; at most 4 milestones",
        ):
            self.assertIn(wanted, text)

    def test_the_cs_prompt_has_no_catalogue(self):
        self.assertNotIn("BUILDER CATALOGUE", prompt.render(self.ctx("cs")))
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_evidence_builder.CatalogueTests --noinput`
Expected: FAIL: `'\nBUILDER CATALOGUE:' not found`.

- [ ] **Step 3: Implement**

In `services/agents/evidence.py`, after `_products`:

```python
def _field_line(field):
    if field.choices:
        return f"{field.key} {field.type} ({'|'.join(field.choices)})"
    return f"{field.key} {field.type}"


def catalogue_lines(ctx):
    """What the Ops agent may build with (contract): segment fields by kind
    with their operators and values, AI attributes by api name, products,
    scenario triggers and steps, contact roles, merge fields and template
    limits. Workspace strings are quoted as data."""
    from services.campaigns.validation import MERGE_FIELDS
    from services.customers.models import Contact, Survey
    from services.plans.models import Kind as TemplateKind
    from services.rules.models import SCORE_RANGES
    from services.segments import registry

    scores = "|".join(f'"{s}"' for s in SCORE_RANGES)
    ranges = ", ".join(f"{s} {low}-{high}" for s, (low, high) in SCORE_RANGES.items())
    surveys = "|".join(f'"{t}"' for t in Survey.SurveyType.values)
    lines = [
        "- segment kinds: customer (organisations), account (accounts), contact (contacts)",
        "- operators: "
        + "; ".join(f"{kind} {'|'.join(ops)}" for kind, ops in registry.OPERATORS.items()),
        "- values: gt and lt take one value; between takes [low, high]; in takes a list of "
        "1-100; within_next and within_last take a number of days from 1 to 3650; dates are "
        '"YYYY-MM-DD"; is_empty and is_not_empty take no value; an owner is a member id or '
        '"unassigned"',
    ]
    for kind, fields in registry.FIELDS.items():
        lines.append(f"- {kind} fields: " + ", ".join(map(_field_line, fields.values())))
    lines.append("- contact rules may also name parent.<an organisation or account field>")
    for attribute in ctx.attributes.values():
        options = _q(attribute["options"]) if attribute["options"] else '"-"'
        lines.append(f"- attr:{attribute['api_name']} {attribute['type']}, options {options}")
    if ctx.products:
        shown = "; ".join(f"{pk}: {_q(name)}" for pk, name in ctx.products.items())
        lines.append(f"- products (id: name): {shown}")
    lines += [
        '- scenario triggers: {"trigger": "entered"} or {"trigger": "left"} (a record joined '
        f'or left the segment today); {{"trigger": "crossed", "score": {scores}, "direction": '
        f'"below"|"above", "threshold": <{ranges}>}} (not for contacts; accounts have no ces); '
        '{"trigger": "schedule", "cadence": "weekly", "weekday": 0-6} or {"trigger": '
        '"schedule", "cadence": "monthly"}',
        '- scenario steps, 1 to 3, each once: {"action": "notify", "to": "me"|"record_owner"|'
        '"people", "people": [member ids], "message": <at most 280>}; {"action": "task", '
        '"title": <at most 200>, "assignee": "record_owner"|"me", "due_in_days": 0-90}; '
        '{"action": "lifecycle", "stage": <a lifecycle stage>} (not for contacts); '
        '{"action": "plan", "template": <a template id under Plan templates>}; '
        f'{{"action": "survey", "survey_type": {surveys}, "subject": <at most 120>, '
        '"intro": <at most 500>, "roles": [contact roles]} (a person reviews every survey '
        "before it is sent). Never a campaign step.",
        "- contact roles: " + ", ".join(Contact.Role.values),
        "- campaign merge fields: " + ", ".join(f"{{{name}}}" for name in MERGE_FIELDS),
        "- template kinds: "
        + ", ".join(TemplateKind.values)
        + "; at most 4 milestones and 12 tasks in all, offsets 0-365 days",
    ]
    return lines
```

`services/agents/prompt.py`, `render`, before the `WORKSPACE FIGURES` block:

```python
    if ctx.agent == "ops":
        lines.append("\nBUILDER CATALOGUE:")
        lines.extend(evidence.catalogue_lines(ctx))
```

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_evidence_builder --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/evidence.py services/agents/prompt.py services/agents/tests/test_evidence_builder.py
git commit -m "feat(agents): the builder catalogue in the Ops agent's prompt

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The naming rule for workspace objects, the five payload shapes and the system rules

**Files:**
- Modify: `services/agents/evidence.py` (new `record_mentions`, after `foreign_mentions`)
- Modify: `services/agents/prompt.py:13-64` (`PAYLOADS`, `SYSTEM`)
- Modify: `services/agents/tests/test_evidence.py:180-183`
- Test: `services/agents/tests/test_evidence_builder.py`

**Interfaces:**
- Consumes: `ctx.records`, `ctx.figures["accounts"]`.
- Produces:
  - `evidence.record_mentions(ctx, texts) -> bool`: whether any text names, as whole words, a book record or an account under the workspace figures (names under `NAME_MIN` ignored).
  - `prompt.PAYLOADS` gains `segment.create`, `scenario.create`, `campaign.create`, `canvas.create`, `plan.template`.
  - `prompt.SYSTEM` names every workspace-level kind as record-less and states the builder rules.

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_evidence_builder.py`:

```python
class NamingAndPromptTests(AgentsFixture):
    def test_a_workspace_object_names_no_record(self):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)
        self.assertTrue(evidence.record_mentions(ctx, ["Win back Pizza Hut"]))
        self.assertFalse(evidence.record_mentions(ctx, ["Win back pizzas"]))
        ctx.figures = {"accounts": [{"name": "Globex Corp"}]}
        self.assertTrue(evidence.record_mentions(ctx, [None, "Save globex corp now"]))

    def test_the_system_prompt_states_the_builder_rules(self):
        kinds = ["segment.create", "scenario.create", "campaign.create", "plan.template"]
        text = prompt.system("ops", [*kinds, "canvas.create"], "plain")
        for kind in (*kinds, "canvas.create"):
            self.assertIn(f"  - {kind}: ", text)
        self.assertIn("or null for a workspace-level kind", text)
        self.assertIn("at most one of segment.create, scenario.create", text)
        self.assertIn("{first_name}, {organisation} and {sender_name}", text)
        self.assertIn("A canvas.create cites its record's people line.", text)
```

In `services/agents/tests/test_evidence.py`, `test_system_prompt_says_the_input_is_untrusted`, the second assertion becomes:

```python
self.assertIn("WORKSPACE FIGURES only for a workspace-level kind", text)
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_evidence_builder.NamingAndPromptTests services.agents.tests.test_evidence --noinput`
Expected: FAIL with `AttributeError: module 'services.agents.evidence' has no attribute 'record_mentions'` and `KeyError: 'segment.create'`.

- [ ] **Step 3: Implement**

`services/agents/evidence.py`, after `foreign_mentions`:

```python
def record_mentions(ctx, texts):
    """Whether `texts` name, as whole words, any record the evidence holds:
    a book record, or an account under the workspace figures. An object a
    builder action makes is read by people who may not open that record, so
    it names none (contract)."""
    text = " ".join(str(t) for t in texts if t).casefold()
    names = {row["name"] for row in ctx.records.values()}
    names |= {a["name"] for a in (ctx.figures or {}).get("accounts", [])}
    return any(
        _mentions(name.casefold().strip(), text) for name in names if len(name.strip()) >= NAME_MIN
    )
```

`services/agents/prompt.py`, `PAYLOADS` gains, after `"plan.start"`:

```python
    "segment.create": '{"kind": "customer"|"account"|"contact", "name": <at most 120 '
    'characters>, "description": <why, at most 500>, "rules": {"match": "all"|"any", '
    '"conditions": [<1-8 conditions from the BUILDER CATALOGUE>]}}',
    "scenario.create": '{"name": <at most 120>, "segment": <a segment.create payload>, '
    '"trigger": <a scenario trigger>, "actions": [<1-3 scenario steps>]}',
    "campaign.create": '{"name": <at most 120>, "segment": <a segment.create payload>, '
    '"roles": [<contact roles>], "subject": <at most 150>, "body": <plain text, at most '
    "1200 characters>}",
    "canvas.create": '{"name": <the map\'s name, at most 120 characters>}',
    "plan.template": '{"kind": "onboarding"|"success"|"save"|"qbr"|"other", "name": <at most '
    '120>, "description": <at most 500>, "milestones": [{"name": <at most 120>, '
    '"offset_days": <0-365>, "tasks": [{"title": <task title>, "priority": '
    '"high"|"medium"|"low", "offset_days": <0-365>, "assignee_role": '
    '"record_owner"|"plan_owner"}]}]} with at most 4 milestones and 12 tasks in all',
```

In `SYSTEM` (a `str.format` template: literal braces are doubled):
- The `"record"` line becomes:

```text
  "record": the ref of the record it acts on, as given ("customer:12", \
"account:7"), or null for a workspace-level kind (initiative.create, \
segment.create, scenario.create, campaign.create, plan.template).
```

- "(and WORKSPACE FIGURES only for initiative.create)." becomes "(and WORKSPACE FIGURES only for a workspace-level kind, which cites nothing else)."
- Before "- Prefer proposing nothing over guessing.", add:

```text
- Propose at most one of segment.create, scenario.create, campaign.create, \
canvas.create and plan.template in an answer. Build only from the BUILDER \
CATALOGUE, and never repeat a shared segment or template.
- Nothing you build names a record, a task or a note: not its name, \
description, subject, body, milestones, tasks or steps. A campaign goes to \
customers: write it plainly, with only {{first_name}}, {{organisation}} and \
{{sender_name}}.
- A canvas.create cites its record's people line.
```

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/evidence.py services/agents/prompt.py services/agents/tests/test_evidence_builder.py services/agents/tests/test_evidence.py
git commit -m "feat(agents): builder payload shapes, the system rules and the record naming rule

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: A segment definition, checked as the workspace when the agent writes it

**Files:**
- Create: `services/agents/builder.py`
- Test: `services/agents/tests/test_builder_definition.py` (create)

**Interfaces:**
- Consumes: `segments.rules.validate_rules`, `RuleError`; `customers.scoping.SystemActor`.
- Produces (in `services/agents/builder.py`):
  - `NAME_LIMIT = 120`, `DESCRIPTION_LIMIT = 500`, `CONDITION_LIMIT = 8`.
  - `WorkspaceWriter(organisation)`: a `SystemActor` with `organisation_id`, the writer `validate_rules` and the rule step cleaners need at generation.
  - `text(value, limit, *, required=True) -> str`: trimmed; raises `Invalid`.
  - `check_definition(raw, ctx) -> {"kind", "name", "description", "rules"}`: raises `Invalid`.
  - `definition_texts(definition) -> [name, description]`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_builder_definition.py`:

```python
"""A segment definition as the agent writes it (contract): customer, account
or contact; a name and a why; one to eight conditions the segment rules
accept, as the workspace writes them."""

from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.builder import check_definition, definition_texts, text
from services.agents.kinds import Invalid
from services.agents.tests.builder_fixtures import definition
from services.agents.tests.fixtures import AgentsFixture

LEAF = {"field": "health_category", "op": "is", "value": "poor"}


class DefinitionTests(AgentsFixture):
    def setUp(self):
        self.ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)

    def check(self, **fields):
        return check_definition(definition(**fields), self.ctx)

    def test_a_good_definition_comes_back_clean(self):
        clean = self.check(name="  Poor health  ")
        self.assertEqual(clean["name"], "Poor health")
        self.assertEqual(clean["kind"], "customer")
        self.assertEqual(clean["rules"]["conditions"], [LEAF])
        self.assertEqual(definition_texts(clean), ["Poor health", clean["description"]])
        grouped = {"group": {"match": "any", "conditions": [LEAF] * 3}}
        self.check(rules={"match": "all", "conditions": [grouped] * 2})

    def test_what_is_refused(self):
        account = {"field": "organisation", "op": "is", "value": self.globex.pk}
        for fields in (
            {"kind": "deal"},
            {"name": " "},
            {"name": "x" * 121},
            {"description": "x" * 501},
            {"rules": {"match": "all", "conditions": []}},
            {"rules": {"match": "all", "conditions": [LEAF] * 9}},
            {"rules": {"match": "all", "conditions": [{"field": "shoe_size", "op": "is"}]}},
            {"rules": {"match": "all", "conditions": [{**LEAF, "op": "gt"}]}},
            {"rules": "everyone"},
            {"kind": "account", "rules": {"match": "all", "conditions": [account]}},
        ):
            with self.subTest(fields=fields), self.assertRaises(Invalid):
                self.check(**fields)
        with self.assertRaises(Invalid):
            check_definition("a segment", self.ctx)

    def test_text(self):
        self.assertEqual(text(" a ", 5), "a")
        self.assertEqual(text(None, 5, required=False), "")
        for value in ("", 7, "abcdef"):
            with self.subTest(value=value), self.assertRaises(Invalid):
                text(value, 5)
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_definition --noinput`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.agents.builder'`.

- [ ] **Step 3: Implement**

Create `services/agents/builder.py`:

```python
"""What the builder kinds share (Agents delivery 3, contract
`2026-10-08-agents-builder-api.md`): a segment definition checked when the
agent writes it and again as the approver, created as theirs, counted per
reader, and released by undo while nothing else uses it."""

from services.customers.scoping import SystemActor
from services.segments.models import Segment
from services.segments.rules import RuleError, validate_rules

from .kinds import Invalid

NAME_LIMIT = 120
DESCRIPTION_LIMIT = 500
#: Most top-level conditions (a leaf or a group each) an agent's segment holds.
CONDITION_LIMIT = 8
KINDS = tuple(Segment.Kind.values)


class WorkspaceWriter(SystemActor):
    """The workspace as a rule's writer when the agent writes it: it opens
    every record, as the view-all reader who decides a builder action does.
    The approver's own check at apply is the one that counts."""

    def __init__(self, organisation):
        super().__init__(organisation)
        self.organisation_id = organisation.pk


def text(value, limit, *, required=True):
    """`value` trimmed; Invalid when it is not text, empty when required,
    or longer than `limit`."""
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise Invalid("not text")
    value = value.strip()
    if (required and not value) or len(value) > limit:
        raise Invalid("text missing or too long")
    return value


def check_definition(raw, ctx):
    """A segment definition as the agent wrote it, checked: its kind, name,
    why, one to eight conditions, and the segment rules as the workspace
    writes them (`validate_rules`)."""
    if not isinstance(raw, dict):
        raise Invalid("a segment definition is an object")
    kind = raw.get("kind")
    if kind not in KINDS:
        raise Invalid("choose customer, account or contact")
    rules = raw.get("rules")
    conditions = rules.get("conditions") if isinstance(rules, dict) else None
    if not isinstance(conditions, list) or not 1 <= len(conditions) <= CONDITION_LIMIT:
        raise Invalid("one to eight conditions")
    try:
        clean = validate_rules(rules, kind, user=WorkspaceWriter(ctx.organisation))
    except (RuleError, KeyError, TypeError, AttributeError) as exc:
        raise Invalid("the segment rules don't hold") from exc
    return {
        "kind": kind,
        "name": text(raw.get("name"), NAME_LIMIT),
        "description": text(raw.get("description"), DESCRIPTION_LIMIT, required=False),
        "rules": clean,
    }


def definition_texts(definition):
    """A definition's free text, for the naming rules."""
    return [definition.get("name"), definition.get("description")]
```

`RuleError` is a `ValueError`; an organisation id from another workspace is `RuleError(NOT_OPEN[...])`, since `WorkspaceWriter` opens only its own workspace's records.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_definition --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/builder.py services/agents/tests/test_builder_definition.py
git commit -m "feat(agents): an agent's segment definition, checked as the workspace

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: A segment's members, counted as the reader, once per page

**Files:**
- Modify: `services/agents/builder.py` (new `member_counts`, `members_for`)
- Modify: `services/agents/bulk.py:23-110` (`Bulk.__init__`, new `member_count`)
- Test: `services/agents/tests/test_builder_definition.py`

**Interfaces:**
- Consumes: `segments.compiler.Compiler`, `segments.evaluate.visible_records`, `segments.registry.attributes_for`, `segments.rules.leaves`.
- Produces:
  - `builder.member_counts(reader, definitions, *, today) -> list[int]`: each definition's members as the reader sees them, the count `members.preview(Draft(kind, rules), reader, today=...)["count"]` gives; one query per segment kind plus one attribute read and at most one FX read, whatever the number.
  - `builder.members_for(reader, action) -> int`: a `segment.create` action's count, from the page's `Bulk` when one is active.
  - `Bulk.member_count(reader, action_id) -> int | None`: every `segment.create` on the page, counted once per reader.

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_builder_definition.py` (add `from django.db import connection`, `from django.test.utils import CaptureQueriesContext`, `from services.agents.builder import member_counts` and `from services.segments.evaluate import Draft`, `from services.segments.members import preview`):

```python
CONTACTS = {
    "kind": "contact",
    "rules": {"match": "all", "conditions": [{"field": "role", "op": "is", "value": "champion"}]},
}


class MemberCountTests(AgentsFixture):
    def test_each_reader_counts_their_own_members(self):
        rules = definition()["rules"]
        counts = {}
        for reader in (self.admin, self.csm, self.lee):
            (counts[reader.pk],) = member_counts(reader, [definition()], today=self.today)
            expected = preview(Draft("customer", rules), reader, today=self.today)["count"]
            self.assertEqual(counts[reader.pk], expected)
        self.assertGreaterEqual(counts[self.admin.pk], 2)
        self.assertEqual(counts[self.lee.pk], 0)

    def test_one_query_per_kind_however_many_and_no_distinct(self):
        def run(definitions):
            with CaptureQueriesContext(connection) as captured:
                member_counts(self.admin, definitions, today=self.today)
            sql = " ".join(q["sql"] for q in captured).upper()
            self.assertNotIn("DISTINCT", sql)
            return len(captured)

        one = run([definition()])
        self.assertEqual(run([definition()] * 4), one)
        self.assertEqual(run([definition(), CONTACTS, definition()]), one + 1)
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_definition.MemberCountTests --noinput`
Expected: FAIL with `ImportError: cannot import name 'member_counts'`.

- [ ] **Step 3: Implement**

In `services/agents/builder.py`, add the imports:

```python
from django.db.models import Count, Q
from django.utils import timezone

from services.segments import registry
from services.segments.compiler import Compiler
from services.segments.evaluate import visible_records
from services.segments.rules import leaves

from . import bulk
```

and the functions:

```python
def member_counts(reader, definitions, *, today):
    """Each definition's members as `reader` sees them: its rules over the
    reader's own book, as `members.preview` counts an unsaved segment. One
    COUNT per segment kind, each definition an `id IN` subquery, so no join
    and no DISTINCT; the definitions share one attribute read."""
    counts = [0] * len(definitions)
    by_kind = {}
    for index, definition in enumerate(definitions):
        by_kind.setdefault(definition["kind"], []).append(index)
    keys = [c.get("field", "") for d in definitions for c in leaves(d["rules"])]
    cache = {"attributes": registry.attributes_for(reader.organisation_id, keys)}
    for kind, indexes in by_kind.items():
        counted = {}
        for index in indexes:
            compiler = Compiler(kind, user=reader, today=today, cache=cache)
            compiled = compiler.compile(definitions[index]["rules"])
            matched = compiled.apply(visible_records(kind, reader)).values("pk")
            counted[f"n{index}"] = Count("pk", filter=Q(pk__in=matched))
        # SOC2:AUTH-02 counted over the records the reader may open, never named
        row = visible_records(kind, reader).aggregate(**counted)
        for index in indexes:
            counts[index] = row[f"n{index}"]
    return counts


def members_for(reader, action):
    """A segment.create action's member count for `reader`."""
    page = bulk.active()
    if page is not None:
        found = page.member_count(reader, action.pk)
        if found is not None:
            return found
    return member_counts(reader, [action.payload], today=timezone.localdate())[0]
```

In `services/agents/bulk.py`, `Bulk.__init__`, at the end:

```python
# Every segment.create on the page: counted once per reader (`member_count`).
self.definitions = {
    a.pk: a.payload for a in actions if a.kind == "segment.create" and isinstance(a.payload, dict)
}
self._members = {}
```

and a method after `unreadable_drafts`:

```python
    def member_count(self, reader, action_id):
        """`action_id`'s segment's member count for `reader`, or None when it
        is not a segment.create on this page."""
        if action_id not in self.definitions:
            return None
        if reader.pk not in self._members:
            from django.utils import timezone

            from .builder import member_counts

            ids = sorted(self.definitions)
            counts = member_counts(
                reader, [self.definitions[pk] for pk in ids], today=timezone.localdate()
            )
            self._members[reader.pk] = dict(zip(ids, counts, strict=True))
        return self._members[reader.pk][action_id]
```

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_definition services.agents.tests.test_queries --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/builder.py services/agents/bulk.py services/agents/tests/test_builder_definition.py
git commit -m "feat(agents): a proposed segment's members, counted as each reader, once per page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: A segment made as the approver, owner limits, and releasing a segment on undo

**Files:**
- Modify: `services/agents/builder.py` (new `as_request`, `lock_owner`, `check_owner_limit`, `stamp`, `create_segment`, `locked_segment`, `segment_in_use`, `delete_segment`, `release_segment`)
- Test: `services/agents/tests/test_builder_segment_create.py` (create)

**Interfaces:**
- Consumes: `SegmentWriteSerializer`, `segments.baseline.rebaseline`, `segments.models.MAX_OWNED`; `OwnerLimit`, `Stale` (Task 2).
- Produces:
  - `as_request(user)`: what a write serializer reads from a request (`.user` only).
  - `lock_owner(user)`: the user's row lock, as each create view's own limit check takes it.
  - `check_owner_limit(owned, maximum, noun)`: raises `OwnerLimit(f"You already own {maximum} {noun}.")` when `owned.count() >= maximum`.
  - `stamp(model, pk) -> str | None`: the row's stored `updated_at`, ISO 8601.
  - `create_segment(action, definition, approver) -> Segment`: private, owned by the approver, `agent_action` set, baseline set, audited `segment.created {kind, agent_action}` with the approver as actor. `Stale` when the definition no longer holds for the approver; `OwnerLimit` ("segments") past 50.
  - `locked_segment(pk) -> Segment | None` (row lock); `segment_in_use(segment) -> bool` (a rule, campaign or survey send uses it); `delete_segment(segment, action, actor)` (audited `segment.deleted {kind}`); `release_segment(action, segment_id, updated_at, actor) -> bool` (deletes it when it exists, is unedited and unused).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_builder_segment_create.py`:

```python
"""A builder action's segment (contract): made private for the approver, its
rules checked again as them, its baseline set and its event audited with
them as actor; refused past 50; released on undo only while untouched and
unused."""

from datetime import timedelta

from django.utils import timezone

from core.models import AuditEvent
from services.agents import builder
from services.agents.kinds import OwnerLimit, Stale
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign
from services.segments.models import Segment


class CreateSegmentTests(AgentsFixture):
    def setUp(self):
        self.action = builder_action(self.org, "segment.create", definition())

    def test_it_is_the_approvers_private_segment_with_its_baseline(self):
        segment = builder.create_segment(self.action, definition(), self.admin)
        self.assertEqual(
            (segment.owner, segment.sharing, segment.agent_action, segment.kind),
            (self.admin, "private", self.action, "customer"),
        )
        segment.refresh_from_db()
        self.assertIsNotNone(segment.member_count)
        self.assertEqual(segment.last_evaluated_on, timezone.localdate())
        event = AuditEvent.objects.get(action="segment.created")
        self.assertEqual(
            (event.actor, event.metadata),
            (self.admin, {"kind": "customer", "agent_action": self.action.pk}),
        )
        self.assertEqual(
            builder.stamp(Segment, segment.pk),
            Segment.objects.get(pk=segment.pk).updated_at.isoformat(),
        )

    def test_rules_naming_what_the_approver_cannot_open_are_stale(self):
        rules = {
            "match": "all",
            "conditions": [{"field": "organisation", "op": "is", "value": self.pizza.pk}],
        }
        with self.assertRaises(Stale):
            builder.create_segment(self.action, definition(kind="account", rules=rules), self.lee)
        self.assertFalse(Segment.objects.exists())

    def test_past_fifty_it_is_an_owner_limit(self):
        Segment.objects.bulk_create(
            Segment(organisation=self.org, owner=self.admin, name=f"S{i}", kind="customer")
            for i in range(50)
        )
        with self.assertRaises(OwnerLimit) as caught:
            builder.create_segment(self.action, definition(), self.admin)
        self.assertEqual(caught.exception.detail, "You already own 50 segments.")

    def test_release_takes_only_an_untouched_unused_segment(self):
        def made():
            segment = builder.create_segment(self.action, definition(), self.admin)
            return segment, builder.stamp(Segment, segment.pk)

        segment, at = made()
        self.assertTrue(builder.release_segment(self.action, segment.pk, at, self.mona))
        self.assertFalse(Segment.objects.filter(pk=segment.pk).exists())
        event = AuditEvent.objects.get(action="segment.deleted")
        self.assertEqual((event.actor, event.metadata), (self.mona, {"kind": "customer"}))
        self.assertFalse(builder.release_segment(self.action, segment.pk, at, self.mona))

        edited, at = made()
        later = timezone.now() + timedelta(minutes=1)
        Segment.objects.filter(pk=edited.pk).update(updated_at=later)
        self.assertFalse(builder.release_segment(self.action, edited.pk, at, self.mona))

        used, at = made()
        Campaign.objects.create(organisation=self.org, owner=self.admin, name="C", segment=used)
        self.assertTrue(builder.segment_in_use(used))
        self.assertFalse(builder.release_segment(self.action, used.pk, at, self.mona))
        self.assertEqual(Segment.objects.filter(pk__in=[edited.pk, used.pk]).count(), 2)
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_segment_create --noinput`
Expected: FAIL with `AttributeError: module 'services.agents.builder' has no attribute 'create_segment'`.

- [ ] **Step 3: Implement**

In `services/agents/builder.py`, add the imports:

```python
from types import SimpleNamespace

from core import audit
from services.accounts.models import User
from services.segments.baseline import rebaseline
from services.segments.models import MAX_OWNED as SEGMENT_LIMIT
from services.segments.serializers import SegmentWriteSerializer

from .kinds import Invalid, OwnerLimit, Stale
```

(replacing the single `from .kinds import Invalid`), and the functions:

```python
def as_request(user):
    """What the write serializers read from a request: `user` only."""
    return SimpleNamespace(user=user)


def lock_owner(user):
    """The owner's row, locked: two creates for one owner queue here, as each
    create view's own 50-per-owner check does."""
    list(User.objects.select_for_update().filter(pk=user.pk).values_list("pk", flat=True))


def check_owner_limit(owned, maximum, noun):
    """OwnerLimit, in the contract's words, when `owned` is at `maximum`.
    Call after `lock_owner`."""
    if owned.count() >= maximum:
        raise OwnerLimit(f"You already own {maximum} {noun}.")


def stamp(model, pk):
    """The row's stored `updated_at`, for undo's "edited since"."""
    value = model.objects.filter(pk=pk).values_list("updated_at", flat=True).first()
    return None if value is None else value.isoformat()


def create_segment(action, definition, approver):
    """A private segment owned by `approver`, its rules checked again as
    them (`SegmentWriteSerializer`), its baseline set, audited with them as
    actor. Stale when it no longer holds for them; OwnerLimit past 50."""
    data = {
        "name": definition["name"],
        "description": definition["description"],
        "kind": definition["kind"],
        "rules": definition["rules"],
        "sharing": Segment.Sharing.PRIVATE,
    }
    # SOC2:AUTH-02 the rules may name only what the approver may open
    serializer = SegmentWriteSerializer(data=data, context={"request": as_request(approver)})
    if not serializer.is_valid():
        raise Stale("the segment no longer holds for the approver")
    lock_owner(approver)
    check_owner_limit(Segment.objects.filter(owner=approver), SEGMENT_LIMIT, "segments")
    segment = serializer.save(
        owner=approver, organisation_id=action.organisation_id, agent_action=action
    )
    rebaseline(segment, today=timezone.localdate())
    audit.record(  # SOC2:LOG-01
        "segment.created",
        actor=approver,
        organisation=action.organisation,
        target=segment,
        metadata={"kind": segment.kind, "agent_action": action.pk},
    )
    return segment


def locked_segment(pk):
    """The segment under the nightly step's row lock, or None."""
    return (
        Segment.objects.select_for_update(of=("self",)).defer("last_members").filter(pk=pk).first()
    )


def segment_in_use(segment):
    """Whether a rule, a campaign or a survey send uses `segment`."""
    return (
        segment.triggered_rules.exists()
        or segment.campaigns.exists()
        or segment.survey_sends.exists()
    )


def delete_segment(segment, action, actor):
    audit.record(  # SOC2:LOG-01
        "segment.deleted",
        actor=actor,
        organisation=action.organisation,
        target=segment,
        metadata={"kind": segment.kind},
    )
    segment.delete()


def release_segment(action, segment_id, updated_at, actor):
    """Undo's second half for a scenario or campaign: its segment goes too
    while it is unedited and nothing else uses it (a shared segment survives).
    True when it was deleted."""
    segment = locked_segment(segment_id)
    if segment is None or segment.updated_at.isoformat() != updated_at:
        return False
    if segment_in_use(segment):
        return False
    delete_segment(segment, action, actor)
    return True
```

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_segment_create --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/builder.py services/agents/tests/test_builder_segment_create.py
git commit -m "feat(agents): a builder's segment, made and released as the approver, within owner limits

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: The `segment.create` kind

**Files:**
- Create: `services/agents/actions/segments.py`
- Test: `services/agents/tests/test_segment_kind.py` (create)

**Interfaces:**
- Consumes: `builder.check_definition`, `definition_texts` (Task 12); `members_for` (Task 13); `create_segment`, `stamp`, `locked_segment`, `segment_in_use`, `delete_segment` (Task 14).
- Produces: `services.agents.actions.segments.CREATE` (a `Kind`):
  - payload: the clean definition `{kind, name, description, rules}`; target `segment:<kind>:<name casefolded>` (160 characters at most);
  - preview (per reader): `{"segment": {"kind", "name", "conditions": <leaves>, "members": <the reader's count>}}`;
  - apply returns `({"segment_id", "updated_at"}, {"segment_id"})`;
  - undo refuses with "This segment has been deleted.", "This segment has been edited since." or "A scenario, campaign or survey uses this segment now.", else deletes it (`segment.deleted`, the undoer as actor).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_segment_kind.py`:

```python
"""segment.create (contract): the Ops agent's whole segment, workspace-level;
its preview counts the reader's own members; applied, it is the approver's
private segment; undo deletes it while untouched and unused."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.actions import segments
from services.agents.kinds import ChangedSince, Invalid, Stale
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign
from services.segments.models import Segment

CREATE = segments.CREATE


class SegmentKindTests(AgentsFixture):
    def ctx(self):
        return evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)

    def action(self):
        return builder_action(self.org, "segment.create", definition())

    def applied(self):
        action = self.action()
        action.after, action.result = CREATE.apply(action, self.admin)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def undo(self, action, actor=None):
        with transaction.atomic():
            CREATE.undo(action, actor or self.admin)

    def test_the_kind(self):
        self.assertEqual(
            (CREATE.label, CREATE.max_level, CREATE.agents),
            ("Build a segment", "ask", ("ops",)),
        )
        self.assertTrue(CREATE.workspace_level and CREATE.builder and CREATE.per_reader)

    def test_validate_keeps_the_clean_definition_and_refuses_a_record(self):
        ctx = self.ctx()
        clean = CREATE.validate(definition(name=" Poor "), None, ctx, [])
        self.assertEqual(clean["name"], "Poor")
        self.assertEqual(CREATE.target(clean), "segment:customer:poor")
        self.assertEqual(CREATE.texts(clean), ["Poor", clean["description"]])
        row = ctx.records[f"customer:{self.pizza.pk}"]
        with self.assertRaises(Invalid):
            CREATE.validate(definition(), row, ctx, [])

    def test_the_preview_counts_the_readers_own_members(self):
        action = self.action()
        admin = CREATE.preview(action, self.admin)["segment"]
        self.assertEqual(
            {k: admin[k] for k in ("kind", "name", "conditions")},
            {"kind": "customer", "name": "Poor health", "conditions": 1},
        )
        self.assertGreaterEqual(admin["members"], 2)
        self.assertEqual(CREATE.preview(action, self.lee)["segment"]["members"], 0)

    def test_apply_makes_the_approvers_private_segment(self):
        action = self.applied()
        segment = Segment.objects.get(pk=action.result["segment_id"])
        self.assertEqual(
            (segment.owner, segment.sharing, segment.agent_action),
            (self.admin, "private", action),
        )
        self.assertEqual(
            action.after,
            {"segment_id": segment.pk, "updated_at": segment.updated_at.isoformat()},
        )
        self.assertIsNone(CREATE.current(action))
        with self.assertRaises(Stale):
            CREATE.apply(self.action_for("Other"), None)

    def action_for(self, name):
        return builder_action(self.org, "segment.create", definition(name=name))

    def test_undo_deletes_it_and_audits_the_undoer(self):
        action = self.applied()
        self.undo(action, self.lee)
        self.assertFalse(Segment.objects.exists())
        self.assertEqual(AuditEvent.objects.get(action="segment.deleted").actor, self.lee)

    def test_undo_refuses_with_the_contracts_sentences(self):
        action = self.applied()
        segment = Segment.objects.get(pk=action.result["segment_id"])
        Campaign.objects.create(organisation=self.org, owner=self.admin, name="C", segment=segment)
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(
            caught.exception.detail, "A scenario, campaign or survey uses this segment now."
        )
        later = timezone.now() + timedelta(minutes=1)
        Segment.objects.filter(pk=segment.pk).update(updated_at=later)
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This segment has been edited since.")
        Segment.objects.filter(pk=segment.pk).delete()
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This segment has been deleted.")
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_segment_kind --noinput`
Expected: FAIL with `ImportError: cannot import name 'segments'`.

- [ ] **Step 3: Implement**

Create `services/agents/actions/segments.py`:

```python
"""segment.create (Agents delivery 3): the Ops agent proposes a whole
segment; a view-all reader approves it and owns it, private, its baseline
set. Undo deletes it while it is unedited and nothing uses it."""

from services.metrics.models import AgentAction
from services.segments.models import Segment
from services.segments.rules import leaves

from .. import builder
from ..kinds import ASK, ChangedSince, Invalid, Kind, Stale

OPS = (AgentAction.Agent.OPS,)


def validate(payload, row, ctx, evidence):
    if row is not None:
        raise Invalid("a segment is workspace-level")
    return builder.check_definition(payload, ctx)


def target(payload):
    return f"segment:{payload['kind']}:{payload['name'].casefold()}"[:160]


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    return {
        "segment": {
            "kind": payload.get("kind", ""),
            "name": payload.get("name", ""),
            "conditions": len(list(leaves(payload.get("rules") or {}))),
            "members": builder.members_for(reader, action),
        }
    }


def apply(action, actor, **_):
    # Ask only: the approver owns what it makes.
    if actor is None:
        raise Stale("a person approves a segment and owns it")
    segment = builder.create_segment(action, action.payload, actor)
    after = {"segment_id": segment.pk, "updated_at": builder.stamp(Segment, segment.pk)}
    return after, {"segment_id": segment.pk}


def undo(action, actor):
    after = action.after or {}
    segment = builder.locked_segment(after.get("segment_id"))
    if segment is None:
        raise ChangedSince("This segment has been deleted.")
    if segment.updated_at.isoformat() != after.get("updated_at"):
        raise ChangedSince("This segment has been edited since.")
    if builder.segment_in_use(segment):
        raise ChangedSince("A scenario, campaign or survey uses this segment now.")
    builder.delete_segment(segment, action, actor)


CREATE = Kind(
    key=AgentAction.Kind.SEGMENT_CREATE,
    label="Build a segment",
    example="Build a segment of organisations renewing in 60 days with poor health",
    max_level=ASK,
    agents=OPS,
    validate=validate,
    target=target,
    # A re-proposed segment of the same kind and name is the same proposal.
    same=lambda a, b: True,
    # It makes a thing: nothing to compare when deciding it.
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    per_reader=True,
    texts=builder.definition_texts,
)
```

`leaves(rules)` reads `rules.get("conditions")`; `members_for` reads `action.payload`.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_segment_kind --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/actions/segments.py services/agents/tests/test_segment_kind.py
git commit -m "feat(agents): the segment.create kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: A scenario as the agent writes it: trigger, steps and their sentences

**Files:**
- Create: `services/agents/actions/scenarios.py` (generation half)
- Test: `services/agents/tests/test_scenario_kind.py` (create)

**Interfaces:**
- Consumes: `rules.validation.CLEANERS`, `TRIGGER_FIELDS`, `clean_trigger`; `rules.models.MAX_ACTIONS`; `builder.WorkspaceWriter`, `check_definition`, `text`, `NAME_LIMIT`, `definition_texts`; `ctx.templates` (Task 9).
- Produces (in `services/agents/actions/scenarios.py`):
  - `clean_trigger_for(raw, kind) -> dict`: the six trigger fields, `threshold` a float with at most two decimals or None.
  - `clean_steps(actions, kind, ctx) -> list`: 1 to 3 steps from notify, task, lifecycle, plan, survey, each once; a campaign step is refused; a plan step's template must be listed under Plan templates; a survey's `without_review` is always false.
  - `trigger_sentence(trigger) -> str`, `step_sentence(step, templates) -> str`.
  - `validate(payload, row, ctx, evidence) -> {"name", "segment", "trigger", "actions", "shown": {"trigger", "steps"}}`.
  - `texts(payload) -> list[str]`: name, the segment's name and description, and each step's title, message, subject and intro.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_scenario_kind.py`:

```python
"""scenario.create (contract): a segment, a trigger and one to three steps,
never a campaign step, a survey always reviewed; applied, a rule switched
off on the approver's own new segment; undo while never switched on."""

from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.actions import scenarios
from services.agents.kinds import Invalid
from services.agents.tests.builder_fixtures import definition
from services.agents.tests.fixtures import AgentsFixture
from services.plans.models import PlanTemplate

TASK = {"action": "task", "title": "Call the champion", "assignee": "record_owner"}


def scenario(**fields):
    return {
        "name": "Rescue poor health",
        "segment": definition(),
        "trigger": {"trigger": "entered"},
        "actions": [TASK],
        **fields,
    }


class ScenarioGenerationTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.onboarding = PlanTemplate.objects.get(is_builtin=True, kind="onboarding")

    def setUp(self):
        self.ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)

    def validate(self, **fields):
        return scenarios.validate(scenario(**fields), None, self.ctx, [])

    def test_a_good_scenario_and_its_sentences(self):
        notify = {"action": "notify", "to": "me", "message": "Look"}
        survey = {
            "action": "survey",
            "survey_type": "nps",
            "subject": "How are we doing?",
            "roles": ["champion"],
            "without_review": True,
        }
        clean = self.validate(actions=[TASK, notify, survey])
        self.assertEqual(clean["name"], "Rescue poor health")
        self.assertEqual(clean["trigger"]["trigger"], "entered")
        self.assertIs(clean["actions"][2]["without_review"], False)
        self.assertEqual(
            clean["shown"],
            {
                "trigger": "Entered the segment",
                "steps": ["Task the owner", "Notify me", "Send an NPS survey, reviewed first"],
            },
        )
        self.assertIn("Call the champion", scenarios.texts(clean))
        self.assertIn("How are we doing?", scenarios.texts(clean))

    def test_trigger_sentences(self):
        crossed = {"trigger": "crossed", "score": "health", "direction": "below", "threshold": 4}
        weekly = {"trigger": "schedule", "cadence": "weekly", "weekday": 0}
        monthly = {"trigger": "schedule", "cadence": "monthly"}
        cases = (
            ({"trigger": "left"}, "Left the segment"),
            (crossed, "Health goes below 4"),
            (weekly, "Every Monday"),
            (monthly, "On the 1st of each month"),
        )
        for trigger, sentence in cases:
            clean = scenarios.clean_trigger_for(trigger, "customer")
            self.assertEqual(scenarios.trigger_sentence(clean), sentence)
        self.assertEqual(scenarios.clean_trigger_for(crossed, "customer")["threshold"], 4.0)

    def test_a_plan_step_names_a_listed_template(self):
        step = {"action": "plan", "template": self.onboarding.pk}
        clean = self.validate(actions=[step])
        self.assertEqual(clean["actions"], [step])
        self.assertEqual(clean["shown"]["steps"], [f"Start a plan from {self.onboarding.name}"])

    def test_what_is_refused(self):
        crossed = {"trigger": "crossed", "score": "health", "direction": "below"}
        private = PlanTemplate.objects.create(
            organisation=self.org,
            owner=self.admin,
            name="Mine",
            kind="save",
            milestones=self.onboarding.milestones,
        )
        contacts = definition(
            kind="contact",
            rules={"match": "all", "conditions": [{"field": "role", "op": "is", "value": "other"}]},
        )
        for fields in (
            {"name": ""},
            {"segment": {"kind": "deal"}},
            {"trigger": {"trigger": "whenever"}},
            {"trigger": {**crossed, "threshold": 11}},
            {"trigger": {**crossed, "threshold": "4"}},
            {"trigger": {**crossed, "threshold": 4.125}},
            {"segment": contacts, "trigger": {**crossed, "threshold": 4}},
            {"actions": []},
            {"actions": [TASK, TASK]},
            {"actions": [TASK] * 4},
            {"actions": [{"action": "campaign", "campaign": 1}]},
            {"actions": [{"action": "plan", "template": private.pk}]},
            {"actions": [{"action": "notify", "to": "people", "people": [self.stranger.pk]}]},
            {"actions": [{"action": "task", "title": ""}]},
        ):
            with self.subTest(fields=fields), self.assertRaises(Invalid):
                self.validate(**fields)
        with self.assertRaises(Invalid):
            scenarios.validate(
                scenario(), self.ctx.records[f"customer:{self.pizza.pk}"], self.ctx, []
            )
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_scenario_kind --noinput`
Expected: FAIL with `ImportError: cannot import name 'scenarios'`.

- [ ] **Step 3: Implement**

Create `services/agents/actions/scenarios.py`:

```python
"""scenario.create (Agents delivery 3): a rule on its own new segment, as
the Ops agent writes the whole of it. A person approves it and owns both;
the rule is made switched off, so only its owner can switch it on. Undo
deletes it while it has never been switched on and is unedited, and its
segment with it unless that is used or edited."""

import math

from rest_framework.exceptions import ValidationError

from services.customers.models import Customer
from services.rules.models import MAX_ACTIONS
from services.rules.validation import CLEANERS, TRIGGER_FIELDS, clean_trigger

from .. import builder
from ..kinds import Invalid

#: What a scenario may do: never a campaign (owner decision 4).
STEPS = ("notify", "task", "lifecycle", "plan", "survey")
SCORES = {"csat": "CSAT", "nps": "NPS", "ces": "CES", "health": "Health"}
SURVEYS = {"nps": "NPS", "csat": "CSAT", "ces": "CES"}
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def _whole(value):
    return isinstance(value, int) and not isinstance(value, bool)


def clean_trigger_for(raw, kind):
    """The six trigger fields, checked against the segment's kind as a rule's
    own save checks them (`clean_trigger`)."""
    if not isinstance(raw, dict):
        raise Invalid("a trigger is an object")
    values = {name: raw.get(name) for name in TRIGGER_FIELDS}
    threshold = values["threshold"]
    if threshold is not None:
        number = isinstance(threshold, int | float) and not isinstance(threshold, bool)
        if not number or not math.isfinite(threshold) or round(threshold, 2) != threshold:
            raise Invalid("a threshold is a number with at most two decimals")
    try:
        clean = clean_trigger(values, kind)
    except ValidationError as exc:
        raise Invalid("the trigger doesn't hold") from exc
    if clean["threshold"] is not None:
        clean["threshold"] = float(clean["threshold"])
    return clean


def clean_steps(actions, kind, ctx):
    """One to three steps, each once, each as a rule's save cleans it, as the
    workspace writes it. A plan step names a template under Plan templates;
    a survey is always reviewed before it is sent."""
    if not isinstance(actions, list) or not 1 <= len(actions) <= MAX_ACTIONS:
        raise Invalid("one to three steps")
    writer = builder.WorkspaceWriter(ctx.organisation)
    cleaned, seen = [], set()
    for item in actions:
        name = item.get("action") if isinstance(item, dict) else None
        if name not in STEPS or name in seen:
            raise Invalid("each step once, from notify, task, lifecycle, plan and survey")
        seen.add(name)
        if name == "plan":
            template = item.get("template")
            # SOC2:AUTH-02 only a template every member may read
            if not _whole(template) or template not in ctx.templates:
                raise Invalid("not a listed template")
            cleaned.append({"action": "plan", "template": template})
            continue
        if name == "survey":
            item = {**item, "without_review": False}
        try:
            cleaned.append(CLEANERS[name](item, kind, writer))
        except ValidationError as exc:
            raise Invalid("the step doesn't hold") from exc
    return cleaned


def trigger_sentence(trigger):
    when = trigger["trigger"]
    if when == "entered":
        return "Entered the segment"
    if when == "left":
        return "Left the segment"
    if when == "crossed":
        return f"{SCORES[trigger['score']]} goes {trigger['direction']} {trigger['threshold']:g}"
    if trigger["cadence"] == "monthly":
        return "On the 1st of each month"
    return f"Every {WEEKDAYS[trigger['weekday']]}"


def step_sentence(step, templates):
    name = step["action"]
    if name == "notify":
        if step["to"] == "me":
            return "Notify me"
        if step["to"] == "record_owner":
            return "Notify the owner"
        # Counted, never named.
        count = len(step["people"])
        return f"Notify {count} {'person' if count == 1 else 'people'}"
    if name == "task":
        return "Task the owner" if step["assignee"] == "record_owner" else "Task me"
    if name == "lifecycle":
        return f"Move to {Customer.LifecycleStage(step['stage']).label}"
    if name == "plan":
        return f"Start a plan from {templates[step['template']]['name']}"
    article = "an" if step["survey_type"] == "nps" else "a"
    return f"Send {article} {SURVEYS[step['survey_type']]} survey, reviewed first"


def validate(payload, row, ctx, evidence):
    if row is not None:
        raise Invalid("a scenario is workspace-level")
    segment = builder.check_definition(payload.get("segment"), ctx)
    name = builder.text(payload.get("name"), builder.NAME_LIMIT)
    trigger = clean_trigger_for(payload.get("trigger"), segment["kind"])
    steps = clean_steps(payload.get("actions"), segment["kind"], ctx)
    return {
        "name": name,
        "segment": segment,
        "trigger": trigger,
        "actions": steps,
        # Display sentences, worked out once: a preview reads no row.
        "shown": {
            "trigger": trigger_sentence(trigger),
            "steps": [step_sentence(step, ctx.templates) for step in steps],
        },
    }


def texts(payload):
    found = [payload.get("name"), *builder.definition_texts(payload.get("segment") or {})]
    for step in payload.get("actions") or []:
        found += [step.get(key) for key in ("title", "message", "subject", "intro")]
    return found
```

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_scenario_kind --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/actions/scenarios.py services/agents/tests/test_scenario_kind.py
git commit -m "feat(agents): a scenario as the Ops agent writes it, with its sentences

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: The `scenario.create` kind: preview, apply and undo

**Files:**
- Modify: `services/agents/actions/scenarios.py` (new `preview`, `apply`, `undo`, `CREATE`)
- Test: `services/agents/tests/test_scenario_kind.py`

**Interfaces:**
- Consumes: Task 16's `validate`, `texts`; `RuleWriteSerializer`; `rules.models.MAX_OWNED`; Task 14's helpers.
- Produces: `scenarios.CREATE` (a `Kind`):
  - target `scenario:<name casefolded>`;
  - preview `{"scenario": {"name", "segment": <its name>, "trigger": <sentence>, "steps": [<sentences>]}}`;
  - apply creates the segment, then a rule with `is_active: false` on it, both owned by the approver with `agent_action` set; audits `segment.created` and `rule.created {trigger, actions, agent_action}`; returns `({"rule_id", "rule_updated_at", "segment_id", "segment_updated_at"}, {"rule_id", "segment_id"})`; `OwnerLimit` "You already own 50 scenarios.";
  - undo: "This scenario has been switched on." (any `rule.activated` audit row, or on now), "This scenario has been edited since.", then deletes the rule (`rule.deleted`) and releases its segment; "This scenario has been deleted." when neither is left.

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_scenario_kind.py` (add `from datetime import timedelta`, `from django.db import transaction`, `from django.utils import timezone`, `from core.models import AuditEvent`, `from services.agents.kinds import ChangedSince, OwnerLimit`, `from services.agents.tests.builder_fixtures import builder_action`, `from services.campaigns.models import Campaign`, `from services.rules.models import Rule`, `from services.segments.models import Segment`):

```python
class ScenarioApplyTests(AgentsFixture):
    def action(self, name="Rescue poor health"):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)
        payload = scenarios.validate(scenario(name=name), None, ctx, [])
        return builder_action(self.org, "scenario.create", payload)

    def applied(self):
        action = self.action()
        action.after, action.result = scenarios.CREATE.apply(action, self.admin)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def undo(self, action):
        with transaction.atomic():
            scenarios.CREATE.undo(action, self.lee)

    def test_the_kind_and_its_preview(self):
        spec = scenarios.CREATE
        self.assertEqual(
            (spec.label, spec.max_level, spec.agents), ("Build a scenario", "ask", ("ops",))
        )
        self.assertTrue(spec.workspace_level and spec.builder)
        self.assertFalse(spec.per_reader)
        action = self.action()
        self.assertEqual(spec.target(action.payload), "scenario:rescue poor health")
        self.assertEqual(
            spec.preview(action),
            {
                "scenario": {
                    "name": "Rescue poor health",
                    "segment": "Poor health",
                    "trigger": "Entered the segment",
                    "steps": ["Task the owner"],
                }
            },
        )

    def test_apply_makes_a_switched_off_rule_on_the_approvers_segment(self):
        action = self.applied()
        rule = Rule.objects.get(pk=action.result["rule_id"])
        self.assertEqual(
            (rule.owner, rule.is_active, rule.segment_id, rule.agent_action, rule.trigger),
            (self.admin, False, action.result["segment_id"], action, "entered"),
        )
        self.assertEqual(rule.segment.owner, self.admin)
        self.assertEqual(rule.actions[0]["title"], "Call the champion")
        event = AuditEvent.objects.get(action="rule.created")
        self.assertEqual(
            (event.actor, event.metadata),
            (self.admin, {"trigger": "entered", "actions": ["task"], "agent_action": action.pk}),
        )
        self.assertEqual(action.after["rule_updated_at"], rule.updated_at.isoformat())

    def test_past_fifty_rules_nothing_is_made(self):
        Rule.objects.bulk_create(
            Rule(organisation=self.org, owner=self.admin, name=f"R{i}", trigger="entered")
            for i in range(50)
        )
        with self.assertRaises(OwnerLimit) as caught, transaction.atomic():
            scenarios.CREATE.apply(self.action(), self.admin)
        self.assertEqual(caught.exception.detail, "You already own 50 scenarios.")
        self.assertFalse(Segment.objects.exists())

    def test_undo_deletes_the_rule_and_its_segment(self):
        action = self.applied()
        self.undo(action)
        self.assertFalse(Rule.objects.exists())
        self.assertFalse(Segment.objects.exists())
        self.assertEqual(AuditEvent.objects.get(action="rule.deleted").actor, self.lee)

    def test_a_shared_segment_survives(self):
        action = self.applied()
        segment = Segment.objects.get(pk=action.result["segment_id"])
        Campaign.objects.create(organisation=self.org, owner=self.admin, name="C", segment=segment)
        self.undo(action)
        self.assertFalse(Rule.objects.exists())
        self.assertTrue(Segment.objects.filter(pk=segment.pk).exists())

    def test_undo_refuses_with_the_contracts_sentences(self):
        action = self.applied()
        rule = Rule.objects.get(pk=action.result["rule_id"])
        later = timezone.now() + timedelta(minutes=1)
        Rule.objects.filter(pk=rule.pk).update(updated_at=later)
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This scenario has been edited since.")
        # Switched on and off again still counts as switched on.
        AuditEvent.objects.create(
            organisation=self.org,
            action="rule.activated",
            target_type="rules.rule",
            target_id=str(rule.pk),
        )
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This scenario has been switched on.")
        Rule.objects.filter(pk=rule.pk).delete()
        Segment.objects.filter(pk=action.result["segment_id"]).delete()
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This scenario has been deleted.")

    def test_a_rule_deleted_by_a_person_still_releases_its_segment(self):
        action = self.applied()
        Rule.objects.filter(pk=action.result["rule_id"]).delete()
        self.undo(action)
        self.assertFalse(Segment.objects.exists())
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_scenario_kind.ScenarioApplyTests --noinput`
Expected: FAIL with `AttributeError: module 'services.agents.actions.scenarios' has no attribute 'CREATE'`.

- [ ] **Step 3: Implement**

Add to `services/agents/actions/scenarios.py` (imports: `from core import audit`, `from core.models import AuditEvent`, `from services.metrics.models import AgentAction`, `from services.rules.models import MAX_OWNED as RULE_LIMIT, Rule`, `from services.rules.serializers import RuleWriteSerializer`, `from services.segments.models import Segment`; and `from ..kinds import ASK, ChangedSince, Invalid, Kind, Stale`):

```python
def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    shown = payload.get("shown") or {}
    return {
        "scenario": {
            "name": payload.get("name", ""),
            "segment": (payload.get("segment") or {}).get("name", ""),
            "trigger": shown.get("trigger", ""),
            "steps": list(shown.get("steps", [])),
        }
    }


def apply(action, actor, **_):
    """The segment, then the rule on it, both the approver's; the rule is
    off. Checked again as the approver, in the decision's transaction."""
    if actor is None:
        raise Stale("a person approves a scenario and owns it")
    payload = action.payload
    # Never sends on its own: no campaign step, every survey reviewed.
    steps = payload["actions"]
    if any(s["action"] == "campaign" or s.get("without_review") for s in steps):
        raise Stale("a scenario only ever waits on a person")
    segment = builder.create_segment(action, payload["segment"], actor)
    data = {
        "name": payload["name"],
        "segment": segment.pk,
        "is_active": False,
        "actions": steps,
        **payload["trigger"],
    }
    # SOC2:AUTH-02 the steps are checked as their owner (templates, teammates)
    serializer = RuleWriteSerializer(data=data, context={"request": builder.as_request(actor)})
    if not serializer.is_valid():
        raise Stale("the scenario no longer holds for the approver")
    builder.check_owner_limit(Rule.objects.filter(owner=actor), RULE_LIMIT, "scenarios")
    rule = serializer.save(owner=actor, organisation_id=action.organisation_id, agent_action=action)
    audit.record(  # SOC2:LOG-01
        "rule.created",
        actor=actor,
        organisation=action.organisation,
        target=rule,
        metadata={
            "trigger": rule.trigger,
            "actions": [step["action"] for step in rule.actions],
            "agent_action": action.pk,
        },
    )
    after = {
        "rule_id": rule.pk,
        "rule_updated_at": builder.stamp(Rule, rule.pk),
        "segment_id": segment.pk,
        "segment_updated_at": builder.stamp(Segment, segment.pk),
    }
    return after, {"rule_id": rule.pk, "segment_id": segment.pk}


def _ever_switched_on(rule):
    """Any `rule.activated` row counts, even if it was switched off again."""
    return AuditEvent.objects.filter(
        action="rule.activated", target_type=Rule._meta.label_lower, target_id=str(rule.pk)
    ).exists()


def undo(action, actor):
    """The rule (lock taken after the action's), then its segment."""
    after = action.after or {}
    rule = Rule.objects.select_for_update(of=("self",)).filter(pk=after.get("rule_id")).first()
    if rule is not None:
        if rule.is_active or _ever_switched_on(rule):
            raise ChangedSince("This scenario has been switched on.")
        if rule.updated_at.isoformat() != after.get("rule_updated_at"):
            raise ChangedSince("This scenario has been edited since.")
        audit.record(  # SOC2:LOG-01
            "rule.deleted",
            actor=actor,
            organisation=action.organisation,
            target=rule,
            metadata={"trigger": rule.trigger},
        )
        rule.delete()
    released = builder.release_segment(
        action, after.get("segment_id"), after.get("segment_updated_at"), actor
    )
    if rule is None and not released:
        raise ChangedSince("This scenario has been deleted.")


CREATE = Kind(
    key=AgentAction.Kind.SCENARIO_CREATE,
    label="Build a scenario",
    example="Build a scenario that tasks the owner when health drops below 4",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"scenario:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    texts=texts,
)
```

The rule's `rule.created` metadata is the view's own plus `agent_action`. `Rule.segment` is `SET_NULL`, so the deleted rule no longer "uses" its segment when `release_segment` looks.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_scenario_kind --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/actions/scenarios.py services/agents/tests/test_scenario_kind.py
git commit -m "feat(agents): the scenario.create kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: The `campaign.create` kind

**Files:**
- Create: `services/agents/actions/campaigns.py`
- Test: `services/agents/tests/test_campaign_kind.py` (create)

**Interfaces:**
- Consumes: `builder` (Tasks 12, 14); `campaigns.validation.merge_field_errors`; `CampaignWriteSerializer`; `campaigns.audit.record`; `campaigns.models.MAX_OWNED`; `evidence.internal_mentions`.
- Produces: `services.agents.actions.campaigns.CREATE` (a `Kind`):
  - payload `{"name", "segment": <definition>, "roles", "subject", "body"}`: name 1–120, subject 1–150, body 1–1,200 with only `{first_name}`, `{organisation}`, `{sender_name}`; roles from `Contact.Role` (at least one, or `[]` for a contact segment); subject and body name no task, note or plan (`internal_mentions`);
  - target `campaign:<name casefolded>`;
  - preview `{"campaign": {"name", "segment", "roles": [labels], "subject", "excerpt": <first 280 characters>}}`;
  - apply: the segment, then a `draft` campaign on it, both the approver's; audits `segment.created`, `campaign.created {segment, agent_action}`; returns `({"campaign_id", "campaign_updated_at", "segment_id", "segment_updated_at"}, {"campaign_id", "segment_id"})`; `OwnerLimit` "You already own 50 campaigns.";
  - undo: "This campaign has been sent.", "This campaign has been edited since.", then deletes it (`campaign.deleted`) and releases its segment; "This campaign has been deleted." when neither is left.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_campaign_kind.py`:

```python
"""campaign.create (contract): a segment, roles and plain words with three
merge fields, naming nothing internal; applied, a draft on the approver's
own new segment; undo while unsent and unedited."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.actions import campaigns
from services.agents.kinds import ChangedSince, Invalid, OwnerLimit
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture
from services.campaigns.models import Campaign, CampaignSend
from services.customers.models import Note
from services.segments.models import Segment

CREATE = campaigns.CREATE


def campaign(**fields):
    return {
        "name": "Champion check-in",
        "segment": definition(),
        "roles": ["champion", "champion"],
        "subject": "A quick check-in, {first_name}",
        "body": "Hi {first_name}, how is {organisation} finding things? {sender_name}",
        **fields,
    }


class CampaignKindTests(AgentsFixture):
    def ctx(self):
        return evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)

    def validate(self, **fields):
        return CREATE.validate(campaign(**fields), None, self.ctx(), [])

    def action(self, name="Champion check-in"):
        return builder_action(self.org, "campaign.create", self.validate(name=name))

    def applied(self):
        action = self.action()
        action.after, action.result = CREATE.apply(action, self.admin)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def undo(self, action):
        with transaction.atomic():
            CREATE.undo(action, self.lee)

    def test_the_kind_validate_and_preview(self):
        self.assertEqual(
            (CREATE.label, CREATE.max_level, CREATE.agents), ("Draft a campaign", "ask", ("ops",))
        )
        self.assertTrue(CREATE.workspace_level and CREATE.builder)
        clean = self.validate()
        self.assertEqual(clean["roles"], ["champion"])
        self.assertEqual(CREATE.target(clean), "campaign:champion check-in")
        self.assertIn("A quick check-in, {first_name}", CREATE.texts(clean))
        contacts = definition(
            kind="contact",
            rules={"match": "all", "conditions": [{"field": "role", "op": "is", "value": "other"}]},
        )
        self.assertEqual(self.validate(segment=contacts)["roles"], [])
        body = "x" * 300
        action = builder_action(self.org, "campaign.create", self.validate(body=body))
        self.assertEqual(
            CREATE.preview(action),
            {
                "campaign": {
                    "name": "Champion check-in",
                    "segment": "Poor health",
                    "roles": ["Champion"],
                    "subject": "A quick check-in, {first_name}",
                    "excerpt": "x" * 280,
                }
            },
        )

    def test_what_is_refused(self):
        Note.objects.create(
            customer=self.pizza, title="Discount promised to Ann", body="b", logged_at=self.today
        )
        for fields in (
            {"name": ""},
            {"subject": "x" * 151},
            {"body": "x" * 1201},
            {"body": "Hi {last_name}"},
            {"subject": "Hi {company}"},
            {"roles": []},
            {"roles": ["ceo"]},
            {"roles": "champion"},
            {"body": "About the Discount promised to Ann, {first_name}."},
        ):
            with self.subTest(fields=fields), self.assertRaises(Invalid):
                self.validate(**fields)

    def test_apply_makes_a_draft_on_the_approvers_segment(self):
        action = self.applied()
        made = Campaign.objects.get(pk=action.result["campaign_id"])
        self.assertEqual(
            (made.owner, made.status, made.segment_id, made.agent_action, made.roles),
            (self.admin, "draft", action.result["segment_id"], action, ["champion"]),
        )
        self.assertEqual(made.segment.owner, self.admin)
        event = AuditEvent.objects.get(action="campaign.created")
        self.assertEqual(
            (event.actor, event.metadata),
            (self.admin, {"segment": made.segment_id, "agent_action": action.pk}),
        )

    def test_past_fifty_campaigns_nothing_is_made(self):
        Campaign.objects.bulk_create(
            Campaign(organisation=self.org, owner=self.admin, name=f"C{i}") for i in range(50)
        )
        with self.assertRaises(OwnerLimit) as caught, transaction.atomic():
            CREATE.apply(self.action(), self.admin)
        self.assertEqual(caught.exception.detail, "You already own 50 campaigns.")
        self.assertFalse(Segment.objects.exists())

    def test_undo_deletes_the_draft_and_its_segment(self):
        action = self.applied()
        self.undo(action)
        self.assertFalse(Campaign.objects.exists())
        self.assertFalse(Segment.objects.exists())
        self.assertEqual(AuditEvent.objects.get(action="campaign.deleted").actor, self.lee)

    def test_undo_refuses_with_the_contracts_sentences(self):
        action = self.applied()
        made = Campaign.objects.get(pk=action.result["campaign_id"])
        later = timezone.now() + timedelta(minutes=1)
        Campaign.objects.filter(pk=made.pk).update(updated_at=later)
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This campaign has been edited since.")
        CampaignSend.objects.create(campaign=made, kind="manual", started_at=timezone.now())
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This campaign has been sent.")
        CampaignSend.objects.all().delete()
        Campaign.objects.filter(pk=made.pk).delete()
        Segment.objects.all().delete()
        with self.assertRaises(ChangedSince) as caught:
            self.undo(action)
        self.assertEqual(caught.exception.detail, "This campaign has been deleted.")
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_campaign_kind --noinput`
Expected: FAIL with `ImportError: cannot import name 'campaigns' from 'services.agents.actions'`.

- [ ] **Step 3: Implement**

Create `services/agents/actions/campaigns.py`:

```python
"""campaign.create (Agents delivery 3): a campaign draft on its own new
segment, as the Ops agent writes the whole of it. A person approves it and
owns both; only its owner can send it. Undo deletes it while nothing has
been sent and it is unedited, and its segment with it unless that is used
or edited."""

from rest_framework.exceptions import ValidationError

from services.campaigns import audit as campaign_audit
from services.campaigns.models import MAX_OWNED as CAMPAIGN_LIMIT
from services.campaigns.models import Campaign
from services.campaigns.serializers import CampaignWriteSerializer
from services.campaigns.validation import merge_field_errors
from services.customers.models import Contact
from services.metrics.models import AgentAction
from services.segments.models import Segment

from .. import builder
from .. import evidence as evidence_
from ..kinds import ASK, ChangedSince, Invalid, Kind, Stale

SUBJECT_LIMIT = 150
BODY_LIMIT = 1200
#: How much of the body a preview shows.
EXCERPT = 280
ROLE_LABELS = dict(Contact.Role.choices)


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
        raise Invalid("a campaign is workspace-level")
    segment = builder.check_definition(payload.get("segment"), ctx)
    subject = builder.text(payload.get("subject"), SUBJECT_LIMIT)
    body = builder.text(payload.get("body"), BODY_LIMIT)
    if merge_field_errors(subject) or merge_field_errors(body):
        raise Invalid("only {first_name}, {organisation} and {sender_name}")
    # SOC2:AUTH-02 a campaign goes to customers: it names no task, note or plan
    if evidence_.internal_mentions(ctx, None, [subject, body], "email"):
        raise Invalid("a campaign names something internal")
    return {
        "name": builder.text(payload.get("name"), builder.NAME_LIMIT),
        "segment": segment,
        "roles": _roles(payload.get("roles"), segment["kind"]),
        "subject": subject,
        "body": body,
    }


def texts(payload):
    found = [payload.get("name"), payload.get("subject"), payload.get("body")]
    return found + builder.definition_texts(payload.get("segment") or {})


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    return {
        "campaign": {
            "name": payload.get("name", ""),
            "segment": (payload.get("segment") or {}).get("name", ""),
            "roles": [ROLE_LABELS.get(role, role) for role in payload.get("roles", [])],
            "subject": payload.get("subject", ""),
            "excerpt": str(payload.get("body", ""))[:EXCERPT],
        }
    }


def apply(action, actor, **_):
    """The segment, then a draft on it, both the approver's."""
    if actor is None:
        raise Stale("a person approves a campaign and owns it")
    payload = action.payload
    segment = builder.create_segment(action, payload["segment"], actor)
    data = {
        "name": payload["name"],
        "subject": payload["subject"],
        "body": payload["body"],
        "segment": segment.pk,
        "roles": payload["roles"],
    }
    # SOC2:AUTH-02 a campaign goes only to its owner's own segment
    serializer = CampaignWriteSerializer(data=data, context={"request": builder.as_request(actor)})
    try:
        serializer.is_valid(raise_exception=True)
    except ValidationError as exc:
        raise Stale("the campaign no longer holds for the approver") from exc
    builder.check_owner_limit(Campaign.objects.filter(owner=actor), CAMPAIGN_LIMIT, "campaigns")
    made = serializer.save(owner=actor, organisation_id=action.organisation_id, agent_action=action)
    campaign_audit.record(  # SOC2:LOG-01
        "created",
        made,
        actor=actor,
        metadata={"segment": segment.pk, "agent_action": action.pk},
    )
    after = {
        "campaign_id": made.pk,
        "campaign_updated_at": builder.stamp(Campaign, made.pk),
        "segment_id": segment.pk,
        "segment_updated_at": builder.stamp(Segment, segment.pk),
    }
    return after, {"campaign_id": made.pk, "segment_id": segment.pk}


def undo(action, actor):
    """The campaign (under a send's claim lock, taken after the action's),
    then its segment."""
    after = action.after or {}
    made = (
        Campaign.objects.select_for_update(of=("self",))
        .select_related("organisation")
        .filter(pk=after.get("campaign_id"))
        .first()
    )
    if made is not None:
        if made.sends.exists():
            raise ChangedSince("This campaign has been sent.")
        if made.updated_at.isoformat() != after.get("campaign_updated_at"):
            raise ChangedSince("This campaign has been edited since.")
        campaign_audit.record("deleted", made, actor=actor)  # SOC2:LOG-01
        made.delete()
    released = builder.release_segment(
        action, after.get("segment_id"), after.get("segment_updated_at"), actor
    )
    if made is None and not released:
        raise ChangedSince("This campaign has been deleted.")


CREATE = Kind(
    key=AgentAction.Kind.CAMPAIGN_CREATE,
    label="Draft a campaign",
    example="Draft a check-in campaign to champions of at-risk organisations",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"campaign:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    texts=texts,
)
```

`campaigns.audit.record` already carries `# SOC2:LOG-01` and writes `campaign.<verb>`; the new comments mark the call sites.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_campaign_kind --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/actions/campaigns.py services/agents/tests/test_campaign_kind.py
git commit -m "feat(agents): the campaign.create kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: The people a reader may open on a record, once per page

**Files:**
- Modify: `services/agents/people.py` (new `visible_people`)
- Modify: `services/agents/bulk.py` (`Bulk.__init__`, new `people_count`)
- Test: `services/agents/tests/test_evidence_people.py`

**Interfaces:**
- Consumes: `record_people` (Task 8); `customers.scoping.visible_children_q`.
- Produces:
  - `people.visible_people(reader, refs) -> {ref: int}`: how many of each record's people `reader` may open; two queries for any number of records.
  - `people.ref_of(action) -> str`: `"customer:<id>"` or `"account:<id>"`.
  - `Bulk.people_count(reader, action_id) -> int | None`: every `canvas.create` on the page, counted once per reader.

- [ ] **Step 1: Write the failing tests**

Append to `services/agents/tests/test_evidence_people.py` (add `from services.agents.people import visible_people`):

```python
class VisiblePeopleTests(AgentsFixture):
    """Taco Bell's people: Tia on it, Eve on Taco East (Carl's), Tom on Taco
    West (Dana's). Carl opens Taco Bell through Taco East, but not Taco
    West."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        contact(cls.taco, "Tia", Contact.Role.CHAMPION)
        contact(cls.east, "Eve", Contact.Role.INFLUENCER)
        contact(cls.west, "Tom", Contact.Role.OTHER)

    def test_each_reader_counts_only_who_they_may_open(self):
        refs = [f"customer:{self.taco.pk}", f"account:{self.west.pk}"]
        self.assertEqual(visible_people(self.other, refs), dict(zip(refs, [3, 1], strict=True)))
        self.assertEqual(visible_people(self.csm, refs), dict(zip(refs, [2, 0], strict=True)))
        self.assertEqual(visible_people(self.lee, refs), dict(zip(refs, [0, 0], strict=True)))

    def test_two_queries_without_distinct(self):
        with CaptureQueriesContext(connection) as captured:
            visible_people(self.csm, [f"customer:{self.taco.pk}", f"account:{self.west.pk}"])
        self.assertEqual(len(captured), 2)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in captured).upper())
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_evidence_people.VisiblePeopleTests --noinput`
Expected: FAIL with `ImportError: cannot import name 'visible_people'`.

- [ ] **Step 3: Implement**

Append to `services/agents/people.py` (import `from services.customers.scoping import visible_children_q`):

```python
def ref_of(action):
    if action.account_id is not None:
        return f"account:{action.account_id}"
    return f"customer:{action.customer_id}"


def visible_people(reader, refs):
    """`{ref: how many of the record's people reader may open}`."""
    ids = {"customer": set(), "account": set()}
    for ref in refs:
        kind, _, pk = ref.partition(":")
        ids[kind].add(int(pk))
    # SOC2:AUTH-02 counted over the people the reader may open, never named
    seen = Contact.objects.filter(visible_children_q(reader))
    found = record_people(seen, ids["customer"], ids["account"])
    return {ref: sum(found.get(ref, {}).values()) for ref in refs}
```

In `services/agents/bulk.py`, `Bulk.__init__`, at the end:

```python
        # Every canvas.create's record: its people counted once per reader.
        self.maps = {}
        for action in actions:
            if action.kind == "canvas.create":
                from .people import ref_of

                self.maps[action.pk] = ref_of(action)
        self._people = {}
```

and the method:

```python
    def people_count(self, reader, action_id):
        """How many of `action_id`'s record's people `reader` may open, or
        None when it is not a canvas.create on this page."""
        if action_id not in self.maps:
            return None
        if reader.pk not in self._people:
            from .people import visible_people

            self._people[reader.pk] = visible_people(reader, sorted(set(self.maps.values())))
        return self._people[reader.pk][self.maps[action_id]]
```

`visible_children_q` filters with `customer__in` / `account__in` subqueries: no join.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_evidence_people --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/people.py services/agents/bulk.py services/agents/tests/test_evidence_people.py
git commit -m "feat(agents): the people a reader may open on a record, counted once per page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: The `canvas.create` kind

**Files:**
- Create: `services/agents/actions/canvases.py`
- Test: `services/agents/tests/test_canvas_kind.py` (create)

**Interfaces:**
- Consumes: `row["people"]` (Task 8); `people.visible_people`, `ref_of`, `Bulk.people_count` (Task 19); `customers.canvas.clean_name`, `people_nodes`; `builder.text`.
- Produces: `services.agents.actions.canvases.CREATE` (a `Kind`, record-level, agents cs, sales and ops):
  - payload `{"name"}` (1–120); validate needs the record's people line among the cited evidence;
  - target `canvas` (one open map proposal per record);
  - preview (per reader) `{"canvas": {"name", "people": <the record's people the reader may open>}}`;
  - apply: a map on the record from `people_nodes(approver, ...)`, `edges: []`, `created_by` and `updated_by` the approver, `agent_action` set; audits `canvas.created {start: "people", nodes, agent_action}`; returns `({"canvas_id", "version"}, {"canvas_id"})`; Stale when the approver may not open the record or none of its people;
  - undo: "This map has been deleted.", "This map has been edited since." (version moved), else deletes it (`canvas.deleted`).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_canvas_kind.py`:

```python
"""canvas.create (contract, owner decision 2): a map of a record's people,
laid out by role with no links, citing the record's people line; applied as
the approver from the people they may open; undo while its version is the
one applied."""

from django.db import transaction

from core.models import AuditEvent
from services.accounts.models import Organisation
from services.agents import bulk, evidence
from services.agents.actions import canvases
from services.agents.kinds import ChangedSince, Invalid, Stale
from services.agents.tests.builder_fixtures import builder_action
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Canvas, Contact
from services.surveys.tests.fixtures import contact

CREATE = canvases.CREATE


class CanvasKindTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.tia = contact(cls.taco, "Tia", Contact.Role.CHAMPION)
        cls.eve = contact(cls.east, "Eve", Contact.Role.DECISION_MAKER)
        cls.tom = contact(cls.west, "Tom", Contact.Role.OTHER)

    def action(self, record=None, agent="cs"):
        record = record or self.taco
        return builder_action(
            self.org,
            "canvas.create",
            {"name": "Taco people"},
            record=record,
            agent=agent,
            target="canvas",
        )

    def applied(self, actor):
        action = self.action()
        action.after, action.result = CREATE.apply(action, actor)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def test_the_kind(self):
        self.assertEqual(
            (CREATE.label, CREATE.max_level, CREATE.agents),
            ("Map a record's people", "ask", ("cs", "sales", "ops")),
        )
        self.assertTrue(CREATE.builder and CREATE.per_reader)
        self.assertFalse(CREATE.workspace_level)

    def test_validate_needs_the_people_line_cited(self):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "ops", today=self.today)
        row = ctx.records[f"customer:{self.taco.pk}"]
        line = row["people"]
        self.assertEqual(line, "people: 3 (decision maker 1, champion 1, other 1)")
        self.assertEqual(CREATE.validate({"name": " Map "}, row, ctx, [line]), {"name": "Map"})
        self.assertEqual(CREATE.target({"name": "Map"}), "canvas")
        with self.assertRaises(Invalid):
            CREATE.validate({"name": "Map"}, row, ctx, ["something else"])
        with self.assertRaises(Invalid):
            CREATE.validate({"name": "x" * 121}, row, ctx, [line])
        with self.assertRaises(Invalid):
            CREATE.validate({"name": "Map"}, None, ctx, [line])
        nobody = ctx.records[f"customer:{self.dough.pk}"]
        with self.assertRaises(Invalid):
            CREATE.validate({"name": "Map"}, nobody, ctx, ["people: 0"])

    def test_the_preview_counts_the_readers_people(self):
        action = self.action()
        self.assertEqual(
            CREATE.preview(action, self.other), {"canvas": {"name": "Taco people", "people": 3}}
        )
        self.assertEqual(CREATE.preview(action, self.csm)["canvas"]["people"], 2)
        with bulk.using([action]):
            self.assertEqual(CREATE.preview(action, self.csm)["canvas"]["people"], 2)

    def test_apply_maps_the_people_the_approver_may_open(self):
        action = self.applied(self.csm)
        canvas = Canvas.objects.get(pk=action.result["canvas_id"])
        on_map = {node["data"]["contact_id"] for node in canvas.nodes}
        self.assertEqual(on_map, {self.tia.pk, self.eve.pk})
        self.assertEqual(
            (canvas.customer, canvas.edges, canvas.created_by, canvas.agent_action),
            (self.taco, [], self.csm, action),
        )
        self.assertEqual(action.after, {"canvas_id": canvas.pk, "version": 1})
        event = AuditEvent.objects.get(action="canvas.created")
        self.assertEqual(
            (event.actor, event.target_repr, event.metadata),
            (
                self.csm,
                f"Canvas {canvas.pk}",
                {"start": "people", "nodes": 2, "agent_action": action.pk},
            ),
        )

    def test_apply_is_stale_without_a_person_or_anyone_to_map(self):
        with self.assertRaises(Stale):
            CREATE.apply(self.action(), None)
        with self.assertRaises(Stale):
            CREATE.apply(self.action(), self.lee)
        with self.assertRaises(Stale):
            CREATE.apply(self.action(record=self.dough), self.csm)

    def test_undo_deletes_it_until_it_is_edited(self):
        action = self.applied(self.other)
        canvas_id = action.result["canvas_id"]
        Canvas.objects.filter(pk=canvas_id).update(version=2)
        with self.assertRaises(ChangedSince) as caught, transaction.atomic():
            CREATE.undo(action, self.other)
        self.assertEqual(caught.exception.detail, "This map has been edited since.")
        Canvas.objects.filter(pk=canvas_id).update(version=1)
        with transaction.atomic():
            CREATE.undo(action, self.other)
        self.assertFalse(Canvas.objects.exists())
        self.assertEqual(AuditEvent.objects.get(action="canvas.deleted").actor, self.other)
        with self.assertRaises(ChangedSince) as caught, transaction.atomic():
            CREATE.undo(action, self.other)
        self.assertEqual(caught.exception.detail, "This map has been deleted.")
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_canvas_kind --noinput`
Expected: FAIL with `ImportError: cannot import name 'canvases'`.

- [ ] **Step 3: Implement**

Create `services/agents/actions/canvases.py`:

```python
"""canvas.create (Agents delivery 3, owner decision 2): a map of the record's
people, laid out by role, with no links (links would be guesses). Record-
level: decided like any record action. Applied as the approver, from the
people they may open; undo deletes it while nobody has saved it since."""

from rest_framework.exceptions import ValidationError

from core import audit
from services.customers.canvas import MAX_NAME, clean_name, people_nodes
from services.customers.models import Canvas
from services.customers.scoping import visible_accounts, visible_customers
from services.metrics.models import AgentAction

from .. import builder, bulk
from ..kinds import ALL_AGENTS, ASK, ChangedSince, Invalid, Kind, Stale
from ..people import ref_of, visible_people


def validate(payload, row, ctx, evidence):
    if row is None:
        raise Invalid("a map is on a record")
    if not row.get("people") or row["people"] not in evidence:
        raise Invalid("a map cites its record's people line")
    return {"name": builder.text(payload.get("name"), MAX_NAME)}


def _people(reader, action):
    page = bulk.active()
    if page is not None:
        found = page.people_count(reader, action.pk)
        if found is not None:
            return found
    ref = ref_of(action)
    return visible_people(reader, [ref])[ref]


def preview(action, reader):
    payload = action.payload if isinstance(action.payload, dict) else {}
    return {"canvas": {"name": payload.get("name", ""), "people": _people(reader, action)}}


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person approves a map")
    record = action.record
    if record is None:
        raise Stale("the record no longer exists")
    if action.account_id is not None:
        on, visible = {"account_id": action.account_id}, visible_accounts
    else:
        on, visible = {"customer_id": action.customer_id}, visible_customers
    # SOC2:AUTH-02 a map is made only on a record the approver may open, from
    # the people they may open
    if not visible(actor).filter(pk=record.pk).exists():
        raise Stale("the approver may not open the record")
    try:
        name = clean_name(action.payload.get("name"))
    except ValidationError as exc:
        raise Stale("the name no longer holds") from exc
    nodes = people_nodes(actor, **on)
    if not nodes:
        raise Stale("nobody on the record the approver may open")
    canvas = Canvas.objects.create(
        name=name,
        nodes=nodes,
        edges=[],
        created_by=actor,
        updated_by=actor,
        agent_action=action,
        **on,
    )
    audit.record(  # SOC2:LOG-01
        "canvas.created",
        actor=actor,
        organisation=action.organisation,
        target=canvas,
        target_repr=f"Canvas {canvas.pk}",
        metadata={"start": "people", "nodes": len(nodes), "agent_action": action.pk},
    )
    return {"canvas_id": canvas.pk, "version": canvas.version}, {"canvas_id": canvas.pk}


def undo(action, actor):
    after = action.after or {}
    canvas = (
        Canvas.objects.select_for_update(of=("self",)).filter(pk=after.get("canvas_id")).first()
    )
    if canvas is None:
        raise ChangedSince("This map has been deleted.")
    if canvas.version != after.get("version"):
        raise ChangedSince("This map has been edited since.")
    audit.record(  # SOC2:LOG-01
        "canvas.deleted",
        actor=actor,
        organisation=action.organisation,
        target=canvas,
        target_repr=f"Canvas {canvas.pk}",
    )
    canvas.delete()


CREATE = Kind(
    key=AgentAction.Kind.CANVAS_CREATE,
    label="Map a record's people",
    example="Map the people at Dough Co",
    max_level=ASK,
    agents=ALL_AGENTS,
    validate=validate,
    # One open map proposal per record, whatever its name.
    target=lambda payload: "canvas",
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    builder=True,
    per_reader=True,
    texts=lambda payload: [payload.get("name")],
)
```

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_canvas_kind --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/actions/canvases.py services/agents/tests/test_canvas_kind.py
git commit -m "feat(agents): the canvas.create kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: The `plan.template` kind

**Files:**
- Create: `services/agents/actions/templates.py`
- Test: `services/agents/tests/test_template_kind.py` (create)

**Interfaces:**
- Consumes: `plans.validation.clean_template_milestones`, `task_count`; `TemplateWriteSerializer`; `plans.models.Kind`, `Sharing`, `MAX_OWNED_TEMPLATES`, `MAX_NAME`, `MAX_DESCRIPTION`; `builder` (Tasks 12, 14).
- Produces: `services.agents.actions.templates.WRITE` (a `Kind`):
  - payload `{"kind", "name", "description", "milestones"}`: at most 4 milestones and 12 tasks in all, offsets 0–365, `assignee_role` `record_owner` or `plan_owner`;
  - target `template:<name casefolded>`;
  - preview `{"template": {"kind", "name", "milestones": <count>, "tasks": <count>}}`;
  - apply: a template owned by the approver with `sharing: "workspace"` and `agent_action` set; audits `plan_template.created {kind, milestones, tasks, agent_action}` and `plan_template.shared {sharing, shared_with}`; returns `({"template_id", "updated_at"}, {"template_id"})`; `OwnerLimit` "You already own 50 plan templates.";
  - undo: "This plan template has been deleted.", "This plan template has been edited since.", "Plans have been started from this template.", "A scenario or a plan start uses this template now.", else deletes it (`plan_template.deleted {kind}`).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_template_kind.py`:

```python
"""plan.template (contract): a whole template, at most 4 milestones and 12
tasks; applied, the approver's and shared with the workspace; undo while
unedited, unstarted and unused."""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from core.models import AuditEvent
from services.agents.actions import templates
from services.agents.kinds import ChangedSince, Invalid, OwnerLimit
from services.agents.tests.builder_fixtures import builder_action
from services.agents.tests.fixtures import AgentsFixture
from services.metrics.models import AgentAction
from services.plans.models import Plan, PlanTemplate
from services.rules.models import Rule

WRITE = templates.WRITE
TASK = {"title": "Call the champion", "priority": "high", "offset_days": 2}


def template(**fields):
    return {
        "kind": "save",
        "name": "Save at-risk renewals",
        "description": "Poor health close to renewal.",
        "milestones": [
            {"name": "Diagnose", "offset_days": 0, "tasks": [TASK, TASK]},
            {"name": "Recover", "offset_days": 14, "tasks": [TASK]},
        ],
        **fields,
    }


class TemplateKindTests(AgentsFixture):
    def validate(self, **fields):
        return WRITE.validate(template(**fields), None, None, [])

    def applied(self):
        action = builder_action(self.org, "plan.template", self.validate())
        action.after, action.result = WRITE.apply(action, self.admin)
        action.status = "applied"
        action.save(update_fields=["after", "result", "status"])
        return action

    def undo(self, action):
        with transaction.atomic():
            WRITE.undo(action, self.lee)

    def test_the_kind_validate_and_preview(self):
        self.assertEqual(
            (WRITE.label, WRITE.max_level, WRITE.agents),
            ("Write a plan template", "ask", ("ops",)),
        )
        self.assertTrue(WRITE.workspace_level and WRITE.builder)
        clean = self.validate()
        self.assertEqual(clean["milestones"][0]["tasks"][0]["assignee_role"], "record_owner")
        self.assertEqual(WRITE.target(clean), "template:save at-risk renewals")
        self.assertIn("Call the champion", WRITE.texts(clean))
        self.assertIn("Recover", WRITE.texts(clean))
        action = builder_action(self.org, "plan.template", clean)
        self.assertEqual(
            WRITE.preview(action),
            {
                "template": {
                    "kind": "save",
                    "name": "Save at-risk renewals",
                    "milestones": 2,
                    "tasks": 3,
                }
            },
        )

    def test_what_is_refused(self):
        one = {"name": "M", "offset_days": 0, "tasks": [TASK]}
        for fields in (
            {"kind": "rescue"},
            {"name": ""},
            {"description": "x" * 501},
            {"milestones": []},
            {"milestones": [one] * 5},
            {"milestones": [{"name": "M", "offset_days": 0, "tasks": [TASK] * 13}]},
            {"milestones": [{"name": "M", "offset_days": 400, "tasks": []}]},
            {
                "milestones": [
                    {"name": "M", "offset_days": 0, "tasks": [{**TASK, "assignee_role": "ceo"}]}
                ]
            },
        ):
            with self.subTest(fields=fields), self.assertRaises(Invalid):
                self.validate(**fields)

    def test_apply_shares_it_with_the_workspace_as_the_approvers(self):
        action = self.applied()
        made = PlanTemplate.objects.get(pk=action.result["template_id"])
        self.assertEqual(
            (made.owner, made.sharing, made.agent_action, made.kind),
            (self.admin, "workspace", action, "save"),
        )
        self.assertEqual(action.after["updated_at"], made.updated_at.isoformat())
        created = AuditEvent.objects.get(action="plan_template.created")
        self.assertEqual(
            (created.actor, created.metadata),
            (self.admin, {"kind": "save", "milestones": 2, "tasks": 3, "agent_action": action.pk}),
        )
        self.assertTrue(AuditEvent.objects.filter(action="plan_template.shared").exists())

    def test_past_fifty_templates_it_is_an_owner_limit(self):
        PlanTemplate.objects.bulk_create(
            PlanTemplate(organisation=self.org, owner=self.admin, name=f"T{i}", kind="other")
            for i in range(50)
        )
        action = builder_action(self.org, "plan.template", self.validate())
        with self.assertRaises(OwnerLimit) as caught, transaction.atomic():
            WRITE.apply(action, self.admin)
        self.assertEqual(caught.exception.detail, "You already own 50 plan templates.")

    def test_undo_deletes_it(self):
        action = self.applied()
        self.undo(action)
        self.assertFalse(PlanTemplate.objects.filter(pk=action.result["template_id"]).exists())
        self.assertEqual(AuditEvent.objects.get(action="plan_template.deleted").actor, self.lee)

    def test_undo_refuses_with_the_contracts_sentences(self):
        action = self.applied()
        made = PlanTemplate.objects.get(pk=action.result["template_id"])

        def refused():
            with self.assertRaises(ChangedSince) as caught:
                self.undo(action)
            return caught.exception.detail

        start = builder_action(
            self.org,
            "plan.start",
            {"template_id": made.pk},
            record=self.pizza,
            agent="cs",
            target=f"plan:{made.pk}",
        )
        self.assertEqual(refused(), "A scenario or a plan start uses this template now.")
        AgentAction.objects.filter(pk=start.pk).update(status="rejected")
        Rule.objects.create(
            organisation=self.org,
            owner=self.admin,
            name="R",
            trigger="entered",
            actions=[{"action": "plan", "template": made.pk}],
        )
        self.assertEqual(refused(), "A scenario or a plan start uses this template now.")
        Rule.objects.all().delete()
        Plan.objects.create(
            organisation=self.org,
            customer=self.pizza,
            template=made,
            name="Save",
            kind="save",
            owner=self.csm,
            start_date=self.today,
            target_date=self.today,
        )
        self.assertEqual(refused(), "Plans have been started from this template.")
        later = timezone.now() + timedelta(minutes=1)
        PlanTemplate.objects.filter(pk=made.pk).update(updated_at=later)
        self.assertEqual(refused(), "This plan template has been edited since.")
        PlanTemplate.objects.filter(pk=made.pk).delete()
        self.assertEqual(refused(), "This plan template has been deleted.")
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_template_kind --noinput`
Expected: FAIL with `ImportError: cannot import name 'templates'`.

- [ ] **Step 3: Implement**

Create `services/agents/actions/templates.py`:

```python
"""plan.template (Agents delivery 3): the Ops agent writes a whole plan
template; a person approves it, owns it, and it is shared with the
workspace so plan.start and every member can use it. Undo deletes it while
it is unedited, no plan was started from it, and no scenario or waiting
plan start names it."""

from rest_framework.exceptions import ValidationError

from core import audit
from services.metrics.models import AgentAction
from services.plans.models import (
    MAX_DESCRIPTION,
    MAX_NAME,
    MAX_OWNED_TEMPLATES,
    Kind as TemplateKind,
    PlanTemplate,
    Sharing,
)
from services.plans.serializers import TemplateWriteSerializer
from services.plans.validation import clean_template_milestones, task_count
from services.rules.models import Rule

from .. import builder
from ..kinds import ASK, ChangedSince, Invalid, Kind, Stale

MILESTONE_LIMIT = 4
TASK_LIMIT = 12


def validate(payload, row, ctx, evidence):
    if row is not None:
        raise Invalid("a template is workspace-level")
    if payload.get("kind") not in TemplateKind.values:
        raise Invalid("choose a template kind")
    milestones = payload.get("milestones")
    if not isinstance(milestones, list) or not 1 <= len(milestones) <= MILESTONE_LIMIT:
        raise Invalid("one to four milestones")
    try:
        clean = clean_template_milestones(milestones)
    except ValidationError as exc:
        raise Invalid("the milestones don't hold") from exc
    if task_count(clean) > TASK_LIMIT:
        raise Invalid("at most twelve tasks")
    return {
        "kind": payload["kind"],
        "name": builder.text(payload.get("name"), MAX_NAME),
        "description": builder.text(payload.get("description"), MAX_DESCRIPTION, required=False),
        "milestones": clean,
    }


def texts(payload):
    found = [payload.get("name"), payload.get("description")]
    for milestone in payload.get("milestones") or []:
        found.append(milestone.get("name"))
        found += [task.get("title") for task in milestone.get("tasks") or []]
    return found


def preview(action):
    payload = action.payload if isinstance(action.payload, dict) else {}
    milestones = payload.get("milestones") or []
    return {
        "template": {
            "kind": payload.get("kind", ""),
            "name": payload.get("name", ""),
            "milestones": len(milestones),
            "tasks": task_count(milestones),
        }
    }


def apply(action, actor, **_):
    if actor is None:
        raise Stale("a person approves a template and owns it")
    payload = action.payload
    data = {
        "name": payload["name"],
        "kind": payload["kind"],
        "description": payload["description"],
        "milestones": payload["milestones"],
        "sharing": Sharing.WORKSPACE,
    }
    serializer = TemplateWriteSerializer(data=data, context={"request": builder.as_request(actor)})
    if not serializer.is_valid():
        raise Stale("the template no longer holds")
    builder.lock_owner(actor)
    owned = PlanTemplate.objects.filter(owner=actor, is_builtin=False)
    builder.check_owner_limit(owned, MAX_OWNED_TEMPLATES, "plan templates")
    made = serializer.save(owner=actor, organisation_id=action.organisation_id, agent_action=action)
    for name, metadata in (
        (
            "plan_template.created",
            {
                "kind": made.kind,
                "milestones": len(made.milestones),
                "tasks": task_count(made.milestones),
                "agent_action": action.pk,
            },
        ),
        ("plan_template.shared", {"sharing": made.sharing, "shared_with": []}),
    ):
        audit.record(  # SOC2:LOG-01
            name, actor=actor, organisation=action.organisation, target=made, metadata=metadata
        )
    after = {"template_id": made.pk, "updated_at": builder.stamp(PlanTemplate, made.pk)}
    return after, {"template_id": made.pk}


def _in_use(template, organisation_id):
    """A rule's plan step names it, or a waiting plan.start does."""
    step = [{"action": "plan", "template": template.pk}]
    return (
        Rule.objects.filter(organisation_id=organisation_id, actions__contains=step).exists()
        or AgentAction.objects.filter(
            organisation_id=organisation_id,
            kind=AgentAction.Kind.PLAN_START,
            status=AgentAction.Status.PROPOSED,
            payload__template_id=template.pk,
        ).exists()
    )


def undo(action, actor):
    after = action.after or {}
    made = (
        PlanTemplate.objects.select_for_update(of=("self",))
        .filter(pk=after.get("template_id"))
        .first()
    )
    if made is None:
        raise ChangedSince("This plan template has been deleted.")
    if made.updated_at.isoformat() != after.get("updated_at"):
        raise ChangedSince("This plan template has been edited since.")
    if made.plans.exists():
        raise ChangedSince("Plans have been started from this template.")
    if _in_use(made, action.organisation_id):
        raise ChangedSince("A scenario or a plan start uses this template now.")
    audit.record(  # SOC2:LOG-01
        "plan_template.deleted",
        actor=actor,
        organisation=action.organisation,
        target=made,
        metadata={"kind": made.kind},
    )
    made.delete()


WRITE = Kind(
    key=AgentAction.Kind.PLAN_TEMPLATE,
    label="Write a plan template",
    example="Write a save-plan template for at-risk renewals",
    max_level=ASK,
    agents=(AgentAction.Agent.OPS,),
    validate=validate,
    target=lambda payload: f"template:{payload['name'].casefold()}"[:160],
    same=lambda a, b: True,
    current=lambda action: None,
    preview=preview,
    apply=apply,
    undo=undo,
    workspace_level=True,
    builder=True,
    texts=texts,
)
```

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_template_kind --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/actions/templates.py services/agents/tests/test_template_kind.py
git commit -m "feat(agents): the plan.template kind

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Register the five kinds; the undo notice names the change

**Files:**
- Modify: `services/agents/registry.py`
- Modify: `services/agents/undo.py:22-35` (`CHANGE`), `:94-121` (`_tell`)
- Test: `services/agents/tests/test_builder_registry.py` (create)

**Interfaces:**
- Consumes: `segments.CREATE`, `scenarios.CREATE`, `campaigns.CREATE`, `canvases.CREATE`, `templates.WRITE` (Tasks 15–21).
- Produces:
  - `REGISTRY` order: … `plan.start`, `segment.create`, `scenario.create`, `campaign.create`, `canvas.create`, `plan.template`, `initiative.create`. `GET /agents/settings/` lists them so; `canvas.create` is in every agent's grid, the other four in Ops' only, all at `ask`; `auto` for any of them is a 400 "This action can't be set to auto."
  - `undo.CHANGE` nouns: `segment`, `scenario`, `campaign`, `map`, `plan template`.
  - A workspace-level undo notice reads "`<undoer>` undid the `<agent>`'s `<noun>`.".

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_builder_registry.py`:

```python
"""The five kinds registered (contract): in order, capped at Ask, the
workspace kinds the Ops agent's only; auto refused; undone, the approver is
told in the contract's nouns."""

from unittest.mock import patch

from services.agents import deciding, undo
from services.agents.registry import REGISTRY, kinds_for
from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture, viewer
from services.metrics.models import AgentAction
from services.notifications.models import Notification
from services.surveys.tests.fixtures import contact

FIVE = ["segment.create", "scenario.create", "campaign.create", "canvas.create", "plan.template"]
URL = "/api/v1/agents/settings/"


class RegistryTests(AgentsFixture):
    def setUp(self):
        plan = patch("services.agents.policy.plan_credits", return_value=2000)
        plan.start()
        self.addCleanup(plan.stop)

    def test_the_settings_list_them_in_order_capped_at_ask(self):
        data = self.client_for(self.admin).get(URL).data
        keys = [kind["kind"] for kind in data["kinds"]]
        at = keys.index("plan.start")
        self.assertEqual(keys[at + 1 : at + 7], [*FIVE, "initiative.create"])
        shown = {kind["kind"]: kind for kind in data["kinds"]}
        self.assertEqual(
            shown["canvas.create"],
            {
                "kind": "canvas.create",
                "label": "Map a record's people",
                "example": "Map the people at Dough Co",
                "max_level": "ask",
                "agents": ["cs", "sales", "ops"],
            },
        )
        for kind in FIVE:
            self.assertEqual(shown[kind]["max_level"], "ask")
            self.assertEqual(data["levels"]["ops"][kind], "ask")
        self.assertEqual([k for k in FIVE if k in data["levels"]["cs"]], ["canvas.create"])
        self.assertIn("segment.create", kinds_for("ops"))
        self.assertNotIn("segment.create", kinds_for("sales"))

    def test_workspace_level_follows_the_registry(self):
        for kind in FIVE:
            expected = kind != "canvas.create"
            self.assertEqual(AgentAction(kind=kind).workspace_level, expected, kind)
            self.assertEqual(REGISTRY[kind].workspace_level, expected, kind)

    def test_auto_is_refused(self):
        response = self.client_for(self.admin).patch(
            URL,
            {"levels": {"ops": {"segment.create": "auto"}, "cs": {"canvas.create": "auto"}}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["levels"],
            {
                "ops": {"segment.create": ["This action can't be set to auto."]},
                "cs": {"canvas.create": ["This action can't be set to auto."]},
            },
        )


class UndoNoticeTests(AgentsFixture):
    def test_the_approver_is_told_in_the_contracts_nouns(self):
        self.assertEqual(
            [undo.CHANGE[kind] for kind in FIVE],
            ["segment", "scenario", "campaign", "map", "plan template"],
        )
        vic = viewer(self.org)
        action = builder_action(self.org, "segment.create", definition())
        deciding.approve(self.admin, action.pk)
        undo.undo(vic, action.pk)
        note = Notification.objects.get(recipient=self.admin)
        self.assertEqual(note.message, "Vic Viewer undid the Ops agent's segment.")

    def test_a_map_undo_names_its_record(self):
        contact(self.pizza, "Ann")
        action = builder_action(
            self.org,
            "canvas.create",
            {"name": "People"},
            record=self.pizza,
            agent="cs",
            target="canvas",
        )
        deciding.approve(self.mona, action.pk)
        undo.undo(self.csm, action.pk)
        note = Notification.objects.get(recipient=self.mona)
        self.assertEqual(note.message, "Carl CSM undid the CS agent's map on Pizza Hut.")
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_registry --noinput`
Expected: FAIL: the settings' kinds jump from `plan.start` to `initiative.create`, and `KeyError: 'segment.create'`.

- [ ] **Step 3: Implement**

`services/agents/registry.py`:

```python
"""Every action kind an agent may take (spec §1.3), in the contract's
order."""

from .actions import (
    campaigns,
    canvases,
    drafts,
    initiatives,
    notes,
    plan_starts,
    records,
    scenarios,
    segments,
    tasks,
    templates,
)

REGISTRY = {
    spec.key: spec
    for spec in (
        records.LIFECYCLE,
        records.OWNER,
        records.ATTRIBUTE,
        tasks.CREATE,
        tasks.REASSIGN,
        tasks.REDATE,
        tasks.COMPLETE,
        tasks.SNOOZE,
        notes.CREATE,
        drafts.REPLY,
        plan_starts.START,
        segments.CREATE,
        scenarios.CREATE,
        campaigns.CREATE,
        canvases.CREATE,
        templates.WRITE,
        initiatives.CREATE,
    )
}
```

(keep `spec` and `kinds_for` as they are).

`services/agents/undo.py`, `CHANGE` gains, after `"plan.start": "plan",`:

```python
    "segment.create": "segment",
    "scenario.create": "scenario",
    "campaign.create": "campaign",
    "canvas.create": "map",
    "plan.template": "plan template",
```

and in `_tell`, the workspace-level branch becomes:

```python
    elif record is None:
        message = f"{reader.name} undid the {agent}'s {CHANGE[action.kind]}."
```

Update `services/agents/tests/test_undo.py` wherever it asserts "undid an agent action on the workspace." (`grep -n "on the workspace" services/agents/tests`) to the new sentence, e.g. "Vic Viewer undid the Ops agent's initiative.".

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/registry.py services/agents/undo.py services/agents/tests/test_builder_registry.py services/agents/tests/test_undo.py
git commit -m "feat(agents): register the five builder kinds; undo notices name the change

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: A pass checks every free-text field and keeps one builder action

**Files:**
- Modify: `services/agents/run.py:128-226` (`_consider`), `:289-290` (`run`'s `kept`)
- Test: `services/agents/tests/test_run_builder.py` (create)

**Interfaces:**
- Consumes: `Kind.texts`, `Kind.builder` (Task 2); `evidence.record_mentions` (Task 11); the registered kinds (Task 22).
- Produces: `_consider`:
  - checks `[title, rationale, *spec.texts(payload)]` (or delivery 1's payload `title`, `body`, `reason`) with `foreign_mentions`, `withheld_mentions` and `source_mentions`;
  - drops a workspace-level builder action whose texts name any record (`record_mentions`);
  - drops a builder action once one is kept in the pass (`kept["builder"]`).

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_run_builder.py`:

```python
"""Builder actions in a pass (contract): proposed only citing the workspace
figures (a map: its record's people line), never naming a record, task or
note in any text, and at most one a pass."""

import json
from unittest.mock import patch

from services.accounts.models import Organisation
from services.agents import evidence, run
from services.agents.policy import profiles_for
from services.agents.tests.builder_fixtures import FIGURES, definition
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import Contact, Task
from services.metrics.models import AgentAction
from services.surveys.tests.fixtures import contact

TASK = {"title": "Call the champion", "priority": "high", "offset_days": 2}


def item(kind, payload, *, cite=FIGURES, record=None, title="Build it"):
    return {
        "kind": kind,
        "record": record,
        "title": title,
        "rationale": "Poor health is rising.",
        "evidence": [cite],
        "payload": payload,
    }


def segment(**fields):
    return item("segment.create", definition(**fields))


def template(**fields):
    milestones = [{"name": "Diagnose", "offset_days": 0, "tasks": [TASK]}]
    payload = {"kind": "save", "name": "Save plan", "description": "", "milestones": milestones}
    return item("plan.template", {**payload, **fields})


class BuilderRunTests(AgentsFixture):
    def setUp(self):
        with patch("services.agents.policy.plan_credits", return_value=3000):
            profiles_for(self.org)

    def org_now(self):
        return Organisation.objects.get(pk=self.org.pk)

    def pass_(self, *items, agent="ops"):
        with (
            patch("services.agents.run.get_completion", return_value=json.dumps(list(items))),
            patch("services.agents.evidence.figure_lines", return_value=[FIGURES]),
        ):
            return run.run(self.org_now(), agent)

    def test_a_segment_citing_the_figures_is_proposed(self):
        result = self.pass_(segment())
        self.assertEqual((result.proposed, result.dropped), (1, 0))
        action = AgentAction.objects.get(kind="segment.create")
        self.assertEqual((action.status, action.customer, action.account), ("proposed", None, None))
        self.assertEqual(action.payload["name"], "Poor health")
        self.assertEqual(action.evidence, [FIGURES])

    def test_a_builder_citing_a_record_line_is_dropped(self):
        ctx = evidence.build(self.org_now(), "ops", today=self.today)
        line = next(
            x
            for x in sorted(evidence.record_lines(ctx, f"customer:{self.pizza.pk}"))
            if x.startswith("- ")
        )
        result = self.pass_({**segment(), "evidence": [line]})
        self.assertEqual((result.proposed, result.dropped), (0, 1))

    def test_no_text_names_a_record_task_or_note(self):
        Task.objects.create(
            customer=self.pizza,
            title="Escalate the invoice dispute",
            due_date=self.today,
        )
        result = self.pass_(
            segment(name="Pizza Hut and friends"),
            segment(description="Like Dough Co, poor health."),
            {**segment(), "title": "Build a Taco Bell segment"},
            segment(description="Escalate the invoice dispute first."),
            template(
                milestones=[
                    {"name": "M", "offset_days": 0, "tasks": [{**TASK, "title": "Call Soup Co"}]}
                ]
            ),
        )
        self.assertEqual((result.proposed, result.dropped), (0, 5))

    def test_one_builder_action_a_pass(self):
        result = self.pass_(segment(), template())
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        self.assertEqual(
            list(AgentAction.objects.values_list("kind", flat=True)), ["segment.create"]
        )

    def test_a_dropped_builder_leaves_room_for_the_next(self):
        result = self.pass_(segment(kind="deal"), template())
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        self.assertTrue(AgentAction.objects.filter(kind="plan.template").exists())

    def test_a_map_cites_its_records_people_line(self):
        contact(self.pizza, "Ann", Contact.Role.CHAMPION)
        ref = f"customer:{self.pizza.pk}"
        ctx = evidence.build(self.org_now(), "cs", today=self.today)
        line = ctx.records[ref]["people"]
        other = next(x for x in sorted(evidence.record_lines(ctx, ref)) if x.startswith("- "))
        result = self.pass_(
            item("canvas.create", {"name": "Pizza people"}, cite=other, record=ref),
            item("canvas.create", {"name": "Pizza people"}, cite=line, record=ref),
            agent="cs",
        )
        self.assertEqual((result.proposed, result.dropped), (1, 1))
        action = AgentAction.objects.get(kind="canvas.create")
        self.assertEqual(
            (action.customer, action.target, action.evidence), (self.pizza, "canvas", [line])
        )
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_run_builder --noinput`
Expected: FAIL in `test_no_text_names_a_record_task_or_note` (names in a name or description are kept) and `test_one_builder_action_a_pass` (both are proposed).

- [ ] **Step 3: Implement**

In `services/agents/run.py`, `_consider`, replace the `texts = [...]` line with:

```python
    extra = (
        spec.texts(payload)
        if spec.texts is not None
        else [payload.get(k) for k in ("title", "body", "reason")]
    )
    texts = [title, rationale, *extra]
```

After the `elif evidence_.source_mentions(...)` branch, add:

```python
    # SOC2:AUTH-02 an object a workspace builder makes is read by people who
    # may not open a record it would name: it names none
    if spec.builder and spec.workspace_level and evidence_.record_mentions(ctx, texts):
        raise Invalid("a built object names a record")
```

After the `if key in kept["keys"]` check, add:

```python
    if spec.builder and kept["builder"]:
        # One builder action a pass: the output budget holds one object.
        raise Invalid("one builder action per pass")
```

In both places a kept action is recorded (the re-proposed twin's `kept["ids"].add(twin.pk)` and the new action's `kept["ids"].add(action.pk)`), add:

```python
        kept["builder"] = kept["builder"] or spec.builder
```

(indented to match each site). In `run`, `kept = {"keys": set(), "ids": set(), "builder": False}`.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/agents/run.py services/agents/tests/test_run_builder.py
git commit -m "feat(agents): builder text never names a record, task or note; one builder action a pass

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: Who reads and decides builder actions; Recommended and Waiting

**Files:**
- Modify: `services/brain/desk.py:78-110` (`agent_actions`)
- Test: `services/agents/tests/test_builder_access.py` (create)

**Interfaces:**
- Consumes: delivery 1's `views.readable`, `deciding.decided_as`, `work.sources.agent_action`; the registered kinds (Task 22); `OWNER_LIMIT` (Task 7).
- Produces:
  - Proved, unchanged: the four workspace kinds are read and decided only with view-all (404 `NO_SUCH_ACTION` otherwise), never counted in Activity's `hidden`, never in Recommended; `canvas.create` is read by the record's openers and reaches Recommended.
  - Changed: `desk.agent_actions` leaves workspace-level actions off a non-view-all reader's desk, so Brain › Waiting never counts them in `hidden`.

- [ ] **Step 1: Write the failing tests**

Create `services/agents/tests/test_builder_access.py`:

```python
"""Who reads and decides builder actions (contract): the four workspace kinds,
view-all only, never hidden, never Recommended; a map, like any record
action. A decision past an owner limit changes nothing."""

from services.agents.tests.builder_fixtures import builder_action, definition
from services.agents.tests.fixtures import AgentsFixture, viewer
from services.customers.models import Product
from services.metrics.models import AgentAction
from services.segments.models import Segment
from services.work.models import Recommendation
from services.work.tests.recommend_fixtures import RecommendFixture

ACTIONS = "/api/v1/agents/actions/"


class WorkspaceBuilderAccessTests(AgentsFixture):
    def setUp(self):
        self.action = builder_action(self.org, "segment.create", definition())

    def test_view_all_reads_it_and_nobody_else_counts_it(self):
        admin = self.client_for(self.admin).get(ACTIONS).json()
        (row,) = [r for r in admin["results"] if r["id"] == self.action.pk]
        self.assertIsNone(row["record"])
        self.assertEqual(row["preview"]["segment"]["name"], "Poor health")
        for reader in (self.mona, self.lee, self.csm):
            data = self.client_for(reader).get(ACTIONS).json()
            self.assertEqual((data["count"], data["hidden"]), (0, 0))
            detail = self.client_for(reader).get(f"{ACTIONS}{self.action.pk}/")
            self.assertEqual(detail.json()["code"], "NO_SUCH_ACTION")
            decide = self.client_for(reader).post(f"{ACTIONS}{self.action.pk}/approve/")
            self.assertEqual(decide.status_code, 404)

    def test_a_view_all_reader_approves_it_and_owns_the_segment(self):
        vic = viewer(self.org)
        response = self.client_for(vic).post(f"{ACTIONS}{self.action.pk}/approve/")
        self.assertEqual(response.status_code, 200, response.data)
        result = response.data["action"]["result"]
        self.assertEqual(Segment.objects.get(pk=result["segment_id"]).owner, vic)
        self.assertEqual(
            response.data["action"]["decided_by"], {"id": vic.pk, "name": "Vic Viewer"}
        )

    def test_past_the_owner_limit_it_stays_proposed(self):
        Segment.objects.bulk_create(
            Segment(organisation=self.org, owner=self.admin, name=f"S{i}", kind="customer")
            for i in range(50)
        )
        response = self.client_for(self.admin).post(f"{ACTIONS}{self.action.pk}/approve/")
        self.assertEqual(
            (response.status_code, response.data),
            (409, {"code": "OWNER_LIMIT", "detail": "You already own 50 segments."}),
        )
        self.action.refresh_from_db()
        self.assertEqual(self.action.status, "proposed")
        self.assertEqual(Segment.objects.count(), 50)

    def test_a_check_failing_at_apply_expires_it_changed(self):
        product = Product.objects.create(organisation=self.org, name="Product B")
        rules = {
            "match": "all",
            "conditions": [{"field": "product", "op": "is", "value": product.pk}],
        }
        action = builder_action(self.org, "segment.create", definition(name="On B", rules=rules))
        product.delete()
        response = self.client_for(self.admin).post(f"{ACTIONS}{action.pk}/approve/")
        self.assertEqual((response.status_code, response.data["code"]), (409, "EXPIRED"))
        action.refresh_from_db()
        self.assertEqual((action.status, action.expired_reason), ("expired", "changed"))
        self.assertFalse(Segment.objects.exists())

    def test_waiting_never_counts_it_hidden(self):
        lee = self.client_for(self.lee).get("/api/v1/brain/waiting/?scope=company").json()
        self.assertEqual(lee["hidden"], 0)
        self.assertEqual(lee["counts"]["agent_action"], 0)
        admin = self.client_for(self.admin).get("/api/v1/brain/waiting/?scope=company").json()
        self.assertEqual(admin["counts"]["agent_action"], 1)


class MapAccessTests(AgentsFixture):
    def test_a_map_is_read_by_the_records_openers_and_decided_by_its_owner(self):
        action = builder_action(
            self.org,
            "canvas.create",
            {"name": "People"},
            record=self.pizza,
            agent="cs",
            target="canvas",
        )
        for reader, status in ((self.csm, 200), (self.mona, 200), (self.other, 404)):
            response = self.client_for(reader).get(f"{ACTIONS}{action.pk}/")
            self.assertEqual(response.status_code, status, reader.name)
        self.assertEqual(self.client_for(self.other).get(ACTIONS).json()["hidden"], 1)


class BuilderRecommendedTests(RecommendFixture):
    def test_only_the_map_becomes_a_recommendation(self):
        made = builder_action(self.org, "segment.create", definition())
        mapped = builder_action(
            self.org,
            "canvas.create",
            {"name": "People"},
            record=self.pizza,
            agent="cs",
            target="canvas",
        )
        self.only("agent")
        self.refresh_now()
        on = set(Recommendation.objects.values_list("agent_action_id", flat=True))
        self.assertIn(mapped.pk, on)
        self.assertNotIn(made.pk, on)
        self.assertEqual(AgentAction.objects.get(pk=made.pk).status, "proposed")
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_access --noinput`
Expected: only `test_waiting_never_counts_it_hidden` FAILS (`1 != 0`: Lee's Company desk counts the segment action in `hidden`). The others pass: they prove delivery 1's rules already cover the builder kinds.

- [ ] **Step 3: Implement**

In `services/brain/desk.py`, `agent_actions`, add the imports `from services.agents.registry import REGISTRY` and `from services.customers.scoping import sees_everything`, and after `base = AgentAction.objects.filter(...)`:

```python
    if not sees_everything(reader):
        # SOC2:AUTH-02 a workspace-level action is view-all's alone: off
        # everyone else's desk, so never counted as hidden (contract)
        workspace = [key for key, spec in REGISTRY.items() if spec.workspace_level]
        base = base.exclude(kind__in=workspace)
```

The docstring's second sentence becomes: "workspace-level ones on Company, for view_all readers only (never counted as hidden for anyone else)."

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents services.brain --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/brain/desk.py services/agents/tests/test_builder_access.py
git commit -m "fix(brain): workspace-level agent actions are never counted as hidden in Waiting

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: The Brain graph draws every waiting action the reader may read

**Files:**
- Modify: `services/brain/graph.py`
- Modify: `services/brain/tests/test_graph.py`

**Interfaces:**
- Consumes: `desk.agent_actions(reader, scope, sessions).readable`; `metrics.graph._edge`.
- Produces: `GET /brain/graph/?scope=` nodes of kind `agent_action`, `{"id": "agent_action:<id>", "kind": "agent_action", "label": <title>, "agent", "action_kind", "action_id"}`, for every proposed action `readable` returns, of any kind and agent. Edges:
  - `acts_on` to `customer:<id>` for an action on a drawn organisation;
  - `acts_on` to `customer:<id>` for an action on an account, for each of the account's organisations that is drawn (drawn means the reader may open it);
  - `serves` to `initiative:<id>` through `AgentAction.initiative`, when that initiative is drawn;
  - none for a workspace-level action.
  The `proposal` node and `proposal_kind` are gone here; `/metrics/graph/` is unchanged.

- [ ] **Step 1: Write the failing tests**

In `services/brain/tests/test_graph.py`:
- Module docstring: replace "waiting proposals" with "waiting agent actions".
- In `test_initiatives_and_proposals_are_the_scopes` (rename it `test_initiatives_and_actions_are_the_scopes`), replace the two `proposal` assertions with:

```python
self.assertEqual(self.ids(payload, "agent_action"), {f"agent_action:{on_pizza.id}"})
self.assertIn((f"agent_action:{on_pizza.id}", f"customer:{self.pizza.id}", "acts_on"), edges)
```

- Delete `test_only_the_ops_agents_two_old_kinds_are_drawn`, `test_a_proposals_session_title_is_neutral_outside_its_participants` and `test_a_proposal_serving_an_initiative_draws_the_serves_edge`, and add to `ScopedGraphTests`:

```python
def act(self, kind="record.lifecycle", agent="cs", initiative=None, **on):
    return AgentAction.objects.create(
        organisation=self.org,
        agent=agent,
        batch="b",
        kind=kind,
        target=f"{kind}:{sorted(on)}",
        title=f"{kind} by {agent}",
        rationale="r",
        payload={},
        initiative=initiative,
        **on,
    )


def test_every_readable_kind_and_agent_is_drawn(self):
    lifecycle = self.act(customer=self.pizza)
    task = self.act(kind="task.create", agent="ops", customer=self.dough)
    payload = self.graph(self.csm, "me")
    self.assertEqual(
        self.ids(payload, "agent_action"),
        {f"agent_action:{lifecycle.id}", f"agent_action:{task.id}"},
    )
    node = next(n for n in payload["nodes"] if n["id"] == f"agent_action:{lifecycle.id}")
    self.assertEqual(
        node,
        {
            "id": f"agent_action:{lifecycle.id}",
            "kind": "agent_action",
            "label": "record.lifecycle by cs",
            "agent": "cs",
            "action_kind": "record.lifecycle",
            "action_id": lifecycle.id,
        },
    )
    self.assertEqual(self.ids(payload, "proposal"), set())


def test_an_account_action_acts_on_its_drawn_organisation_only(self):
    on_emea = self.act(account=self.emea)
    on_east = self.act(kind="task.create", account=self.east)
    payload = self.graph(self.csm, "me")
    edges = {(e["from"], e["to"], e["kind"]) for e in payload["edges"]}
    self.assertIn((f"agent_action:{on_emea.id}", f"customer:{self.pizza.id}", "acts_on"), edges)
    # Taco East's organisation, Taco Bell, is not in Carl's Me: no edge.
    self.assertIn(f"agent_action:{on_east.id}", self.ids(payload, "agent_action"))
    self.assertFalse([e for e in edges if e[0] == f"agent_action:{on_east.id}"])


def test_a_workspace_action_is_view_alls_and_has_no_edge(self):
    built = self.act(kind="segment.create", agent="ops")
    company = self.graph(self.admin, "company")
    self.assertIn(f"agent_action:{built.id}", self.ids(company, "agent_action"))
    self.assertFalse([e for e in company["edges"] if e["from"] == f"agent_action:{built.id}"])
    self.assertNotIn(
        f"agent_action:{built.id}", self.ids(self.graph(self.lee, "company"), "agent_action")
    )


def test_an_action_serving_an_initiative_draws_the_serves_edge(self):
    initiative = self.initiative(self.csm, cut=self.csm, title="Halve ARR at risk")
    served = self.act(customer=self.pizza, initiative=initiative)
    edges = {(e["from"], e["to"], e["kind"]) for e in self.graph(self.csm, "me")["edges"]}
    self.assertIn((f"agent_action:{served.id}", f"initiative:{initiative.id}", "serves"), edges)
```

- In `GraphQueryGuardTests.fill`, after `self.proposal(customer, f"Save play {i}")`, add an account action so the organisations lookup is exercised:

```python
            account = self.account(f"Extra account {i}", customer, self.csm)
            AgentAction.objects.create(
                organisation=self.org,
                agent="cs",
                batch="b1",
                kind="record.lifecycle",
                account=account,
                target="lifecycle",
                title=f"Move {i}",
                rationale="r",
                payload={"stage": "renewal"},
            )
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.brain.tests.test_graph --noinput`
Expected: FAIL: no node has kind `agent_action`.

- [ ] **Step 3: Implement**

In `services/brain/graph.py`, delete the `NEUTRAL_TITLE`, `proposal_part`, `LEGACY_KIND` and `AgentAction` imports, import `from services.customers.models import Account, Task` and `from services.metrics.graph import _edge, customer_part, initiative_part, payload`, and add:

```python
def agent_action_part(actions, customer_ids, initiative_ids):
    """`agent_action` nodes, with `acts_on` to the organisation an action is
    on (an account's organisations, where drawn: drawn means the reader may
    open it) and `serves` to a drawn initiative. A workspace-level action
    has no edge. One query for every account's organisations."""
    actions = list(actions)
    drawn = sorted(customer_ids)
    accounts = sorted({a.account_id for a in actions if a.account_id is not None})
    parents = {}
    if accounts:
        links = Account.customers.through.objects.filter(
            account_id__in=accounts, customer_id__in=drawn
        ).values_list("account_id", "customer_id")
        for account_id, customer_id in links:
            parents.setdefault(account_id, []).append(customer_id)
    nodes, edges = [], []
    for action in actions:
        node = f"agent_action:{action.pk}"
        nodes.append(
            {
                "id": node,
                "kind": "agent_action",
                "label": action.title,
                "agent": action.agent,
                "action_kind": action.kind,
                "action_id": action.pk,
            }
        )
        if action.customer_id in customer_ids:
            edges.append(_edge(node, f"customer:{action.customer_id}", "acts_on"))
        for customer_id in sorted(parents.get(action.account_id, ())):
            edges.append(_edge(node, f"customer:{customer_id}", "acts_on"))
        if action.initiative_id in initiative_ids:
            edges.append(_edge(node, f"initiative:{action.initiative_id}", "serves"))
    return nodes, edges
```

and in `build`, replace everything from `sessions = desk.session_ids_seen_whole(reader)` to the `proposal_part(...)` call with:

```python
    sessions = desk.session_ids_seen_whole(reader)
    # SOC2:AUTH-02 every waiting action the reader may read, of any kind and
    # agent: `readable` is Activity's own rule (drafts by their source too)
    actions = desk.agent_actions(reader, scope, sessions).readable.order_by("created_at", "id")
    more_p, links_p = agent_action_part(actions, set(customer_ids), {i.id for i in initiatives})
```

Update the module docstring's last sentences: "…and its waiting agent actions the reader may read (delivery 2's desk, Activity's `readable`), of any kind and agent. `hidden` counts the scope's customers the reader can't open." (drop the session-title sentence).

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.brain services.metrics --noinput`
Expected: PASS (`/metrics/graph/`'s own tests still see `proposal`).

- [ ] **Step 5: Commit**

```bash
git add services/brain/graph.py services/brain/tests/test_graph.py
git commit -m "feat(brain): the graph draws every waiting agent action the reader may read

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: A draft can be `sending`, and reads as sent

**Files:**
- Modify: `services/customers/models.py:1811-1813` (`ReplyDraft.Status`), `:1886-1895` (the two partial unique constraints)
- Create (generated): `services/customers/migrations/0060_reply_draft_sending.py`
- Modify: `services/customers/drafts.py:105-127` (`draft_payload`)
- Modify: `services/customers/drafts_views.py:75-93` (list), `:111`, `:125`, `:145`, `:168` (the sent checks)
- Modify: `services/agents/evidence.py:349` (`drafted`), `services/agents/actions/drafts.py:212` (`undo`)
- Test: `services/customers/tests/test_drafts_sending.py` (create)

**Interfaces:**
- Consumes: delivery 2's `ReplyDraft`, `draft`, `inbound`, `mailbox`, `draft_action` fixtures.
- Produces:
  - `ReplyDraft.Status.SENDING = "sending"`, between `OPEN` and `SENT`; one open **or sending** draft per email and per ticket.
  - The API's `status` stays `open | sent`: a `sending` draft reads `sent` with `sent_at` null, is listed under `?status=sent`, and `?status=sending` is a 400 "Choose open or sent.".
  - Edit, discard, mark sent and send answer `409 ALREADY_SENT` for anything not open; an agent's undo of a sending draft is "This draft has been sent."; the evidence leaves a sending draft's source out, as an open one's.

- [ ] **Step 1: Write the failing tests**

Create `services/customers/tests/test_drafts_sending.py`:

```python
"""A draft being sent (contract, delivery 2 follow-up): `sending` is internal;
it reads as sent, takes no edit, is drafted no second time, and holds its
source as an open draft does."""

from django.db import IntegrityError, transaction

from services.accounts.models import Organisation
from services.agents import evidence
from services.agents.actions import drafts as draft_kind
from services.agents.kinds import ChangedSince
from services.agents.tests.drafts_fixtures import draft, draft_action, inbound, mailbox
from services.agents.tests.fixtures import AgentsFixture
from services.customers.models import ReplyDraft

URL = "/api/v1/communications/drafts/"


class SendingDraftTests(AgentsFixture):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        mailbox(cls.csm)
        cls.mail = inbound(cls.pizza, cls.csm)

    def setUp(self):
        self.mine = draft(self.mail, self.csm, status=ReplyDraft.Status.SENDING)

    def test_it_reads_as_sent_with_no_sent_at(self):
        client = self.client_for(self.csm)
        body = client.get(f"{URL}{self.mine.pk}/").data
        self.assertEqual((body["status"], body["sent_at"], body["can_edit"]), ("sent", None, False))
        sent = client.get(URL, {"status": "sent"}).data["results"]
        self.assertEqual([row["id"] for row in sent], [self.mine.pk])
        self.assertEqual(client.get(URL).data["results"], [])
        refused = client.get(URL, {"status": "sending"})
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.data, {"status": ["Choose open or sent."]})

    def test_no_write_touches_it(self):
        client = self.client_for(self.csm)
        for response in (
            client.patch(f"{URL}{self.mine.pk}/", {"body": "Changed"}, format="json"),
            client.delete(f"{URL}{self.mine.pk}/"),
            client.post(f"{URL}{self.mine.pk}/send/", {}, format="json"),
        ):
            self.assertEqual((response.status_code, response.data["code"]), (409, "ALREADY_SENT"))
        self.mine.refresh_from_db()
        self.assertEqual(self.mine.status, "sending")

    def test_its_source_is_held_and_not_drafted_again(self):
        ctx = evidence.build(Organisation.objects.get(pk=self.org.pk), "cs", today=self.today)
        self.assertNotIn(self.mail.pk, ctx.emails)
        with self.assertRaises(IntegrityError), transaction.atomic():
            draft(self.mail, self.csm)

    def test_an_agents_undo_calls_it_sent(self):
        action = draft_action(
            self.org, self.mail, status="applied", result={"draft_id": self.mine.pk}
        )
        with self.assertRaises(ChangedSince) as caught, transaction.atomic():
            draft_kind.REPLY.undo(action, self.csm)
        self.assertEqual(caught.exception.detail, "This draft has been sent.")
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.customers.tests.test_drafts_sending --noinput`
Expected: FAIL: `ReplyDraft.objects.create(status="sending")` saves (choices are not enforced) but reads back `"sending"`, the list filter finds nothing under `sent`, and the PATCH succeeds.

- [ ] **Step 3: Implement**

`services/customers/models.py`, `ReplyDraft.Status`:

```python
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        #: Internal: claimed by a Send, the provider not yet answered. Reads as sent.
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
```

and the two partial unique constraints' conditions become `models.Q(status__in=["open", "sending"], email__isnull=False)` and `models.Q(status__in=["open", "sending"], ticket__isnull=False)` (names unchanged). Generate:

Run: `venv/bin/python manage.py makemigrations customers --name reply_draft_sending`

Expected: `0060_reply_draft_sending.py` with an `AlterField` on `replydraft.status` (three choices, `max_length=8`) and, for each constraint, `RemoveConstraint` then `AddConstraint`.

`services/customers/drafts.py`, `draft_payload`: `"status": draft.status,` becomes

```python
        # `sending` is internal: a draft being sent reads as sent (sent_at null).
        "status": ReplyDraft.Status.OPEN if draft.status == ReplyDraft.Status.OPEN else "sent",
```

`services/customers/drafts_views.py`:
- `DraftListView.get`: replace the status check and filter with

```python
        wanted = params.get("status", ReplyDraft.Status.OPEN)
        if wanted not in ("open", "sent"):
            errors["status"] = [CHOOSE_STATUS]
        ...
        statuses = (
            [ReplyDraft.Status.OPEN]
            if wanted == "open"
            else [ReplyDraft.Status.SENDING, ReplyDraft.Status.SENT]
        )
        # SOC2:AUTH-02 the list is the reader's own drafts only
        rows = ReplyDraft.objects.filter(
            organisation_id=request.user.organisation_id,
            owner_id=request.user.pk,
            status__in=statuses,
        )
```

  (the `...` is the unchanged `channel` lines and `if errors: raise ValidationError(errors)` between them).
- In `DraftDetailView.patch`, `DraftDetailView.delete`, `DraftMarkSentView.post` and `DraftSendView._refused`, every `if draft.status == ReplyDraft.Status.SENT:` becomes `if draft.status != ReplyDraft.Status.OPEN:`.

`services/agents/evidence.py`: `drafted = ReplyDraft.objects.filter(status=ReplyDraft.Status.OPEN)` becomes `drafted = ReplyDraft.objects.filter(status__in=[ReplyDraft.Status.OPEN, ReplyDraft.Status.SENDING])`.

`services/agents/actions/drafts.py`, `undo`: `if draft.status == ReplyDraft.Status.SENT:` becomes `if draft.status != ReplyDraft.Status.OPEN:`.

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.customers.tests.test_drafts_sending services.customers.tests.test_drafts_api services.customers.tests.test_drafts_send services.customers.tests.test_reply_draft_model services.agents --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/customers/models.py services/customers/migrations/0060_reply_draft_sending.py services/customers/drafts.py services/customers/drafts_views.py services/agents/evidence.py services/agents/actions/drafts.py services/customers/tests/test_drafts_sending.py
git commit -m "feat(customers): an internal sending status for reply drafts, read as sent

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: Send claims the draft before it calls the provider

**Files:**
- Modify: `services/customers/drafts_views.py:154-235` (`DraftSendView.post`)
- Test: `services/customers/tests/test_drafts_send.py`

**Interfaces:**
- Consumes: `ReplyDraft.Status.SENDING` (Task 26); `mail.sync.send_email`.
- Produces: `POST /communications/drafts/<id>/send/`, in order:
  1. under the draft's row lock: the refusals, the edit, the mailbox check, then a conditional UPDATE from `open` to `sending`; committed;
  2. `send_email` outside any lock;
  3. under the lock again: `sent`, `sent_at`, `sent_by`, `sent_email`, audits.
  A `ProviderError` returns the draft to `open` (conditional UPDATE from `sending`) and answers 502. A database failure after the provider accepted leaves it `sending`; a later Send answers `409 ALREADY_SENT`.

- [ ] **Step 1: Write the failing tests**

Append to `DraftSendTests` in `services/customers/tests/test_drafts_send.py` (add `from django.db import DatabaseError` to the imports):

```python
def test_the_claim_is_committed_before_the_provider_is_called(self):
    mine = draft(self.mail, self.csm)
    seen = []

    class Watching(FakeProvider):
        def send(self, creds, **message):
            seen.append(ReplyDraft.objects.get(pk=mine.pk).status)
            return super().send(creds, **message)

    with patch("services.mail.sync.get_provider", return_value=Watching()):
        response = self.send(self.csm, mine)
    self.assertEqual(response.status_code, 200, response.data)
    self.assertEqual(seen, ["sending"])
    mine.refresh_from_db()
    self.assertEqual(mine.status, "sent")


def test_a_refusal_puts_it_back_to_open(self):
    mine = draft(self.mail, self.csm)
    with patch("services.mail.sync.get_provider", return_value=Refusing()):
        self.assertEqual(self.send(self.csm, mine).status_code, 502)
    mine.refresh_from_db()
    self.assertEqual(mine.status, "open")
    self.assertEqual(self.send(self.csm, mine).status_code, 200)


def test_a_failure_after_the_provider_accepted_never_sends_twice(self):
    mine = draft(self.mail, self.csm)
    with (
        patch(
            "services.customers.drafts_views.send_email",
            side_effect=DatabaseError("filing failed"),
        ),
        self.assertRaises(DatabaseError),
    ):
        self.send(self.csm, mine)
    mine.refresh_from_db()
    self.assertEqual(mine.status, "sending")
    again = self.send(self.csm, mine)
    self.assertEqual((again.status_code, again.data["code"]), (409, "ALREADY_SENT"))
    self.assertEqual(FakeProvider.sent, [])
```

- [ ] **Step 2: Run them to see them fail**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.customers.tests.test_drafts_send --noinput`
Expected: FAIL: `seen == ["open"]`, and after the `DatabaseError` the draft is still `open`.

- [ ] **Step 3: Implement**

Replace `DraftSendView.post` (its `_refused` is Task 26's):

```python
    def post(self, request, pk):
        data = request.data if request.data else {}
        with transaction.atomic():
            draft = _readable(request, pk, lock=True)
            refused = self._refused(request, draft)
            if refused is not None:
                return refused
            changed = apply_edits(draft, clean_edits(draft, data))
            if changed:
                _audit(request, "reply_draft.edited", draft, fields=changed)
            connection = MailboxConnection.objects.filter(user_id=request.user.pk).first()
            if connection is None or connection.status != MailboxConnection.Status.CONNECTED:
                # The edit is kept: it commits with this block.
                return _code("NO_MAILBOX", NO_MAILBOX, status.HTTP_409_CONFLICT)
            # The claim, committed before the provider is called: a second
            # Send, or a retry after a failure, finds it taken and never
            # sends it again.
            claimed = ReplyDraft.objects.filter(pk=draft.pk, status=ReplyDraft.Status.OPEN).update(
                status=ReplyDraft.Status.SENDING
            )
            if not claimed:
                return _code("ALREADY_SENT", ALREADY_SENT, status.HTTP_409_CONFLICT)
        to = [address for _, address in draft.to]
        try:
            email = send_email(
                connection,
                to=to,
                subject=draft.subject,
                body=draft.body,
                customer=draft.customer,
                account=draft.account,
                answering=draft.email,
            )
        except ProviderError as exc:
            # Nothing left: the draft is open again, to send once more.
            ReplyDraft.objects.filter(pk=draft.pk, status=ReplyDraft.Status.SENDING).update(
                status=ReplyDraft.Status.OPEN
            )
            if exc.reauth:
                connection.status = MailboxConnection.Status.ERROR
                connection.error = str(exc)[:255]
                connection.save(update_fields=["status", "error", "updated_at"])
            return Response({"detail": MAILBOX_REFUSED}, status=status.HTTP_502_BAD_GATEWAY)
        # Any other failure from here leaves it `sending`: never sent twice.
        with transaction.atomic():
            draft = _readable(request, pk, lock=True)
            draft.status = ReplyDraft.Status.SENT
            draft.sent_at, draft.sent_by, draft.sent_email = timezone.now(), request.user, email
            draft.save(update_fields=["status", "sent_at", "sent_by", "sent_email", "updated_at"])
            _audit(request, "reply_draft.sent", draft, email=email.pk)
            # SOC2:LOG-01 mail left through a credential we hold
            audit.record(
                "mailbox.reply",
                request=request,
                target=draft.email,
                metadata={"to": to, "subject": draft.subject},
            )
        return Response(
            {
                "draft": draft_payload(draft, request.user),
                "email": {
                    "id": email.pk,
                    "subject": email.subject,
                    "sent_at": stamp(email.sent_at),
                    "thread_id": email.thread_id,
                },
            }
        )
```

Update the class docstring: "…The edit is saved first, under the PATCH rules, and kept even if the provider then refuses. The draft is claimed (`sending`) and committed before the provider is called, so it is never sent twice; a refusal opens it again."

- [ ] **Step 4: Run them to see them pass**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.customers.tests.test_drafts_send services.customers.tests.test_drafts_sending services.agents.tests.test_drafts_e2e --noinput`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/customers/drafts_views.py services/customers/tests/test_drafts_send.py
git commit -m "fix(customers): Send claims a draft before calling the provider, so it never goes twice

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 28: Bounded pages with builder actions, and one journey end to end

**Files:**
- Modify: `services/agents/tests/builder_fixtures.py` (new `add_builder_actions`)
- Test: `services/agents/tests/test_builder_e2e.py` (create)

**Interfaces:**
- Consumes: everything above.
- Produces: `builder_fixtures.add_builder_actions(fixture, number)`: a fresh organisation of Carl's with a contact, one waiting action of each builder kind (the map on it), named by `number`.

- [ ] **Step 1: Write the tests**

Append to `services/agents/tests/builder_fixtures.py`:

```python
def add_builder_actions(fixture, number):
    """A fresh organisation of Carl's with a contact on it, and one waiting
    action of each builder kind, `number` in every name."""
    from services.surveys.tests.fixtures import contact

    record = fixture.customer(f"Built {number}", fixture.csm, 10_000, "2.0")
    contact(record, f"Pat{number}")
    task = {"action": "task", "title": "Call", "assignee": "record_owner", "due_in_days": 7}
    milestones = [{"name": "M", "offset_days": 0, "tasks": []}]
    payloads = {
        "segment.create": definition(name=f"Segment {number}"),
        "scenario.create": {
            "name": f"Scenario {number}",
            "segment": definition(),
            "trigger": {"trigger": "entered"},
            "actions": [task],
            "shown": {"trigger": "Entered the segment", "steps": ["Task the owner"]},
        },
        "campaign.create": {
            "name": f"Campaign {number}",
            "segment": definition(),
            "roles": ["champion"],
            "subject": "Hello",
            "body": "Hi {first_name}",
        },
        "plan.template": {
            "kind": "save",
            "name": f"Template {number}",
            "description": "",
            "milestones": milestones,
        },
    }
    made = [builder_action(fixture.org, kind, payload) for kind, payload in payloads.items()]
    made.append(
        builder_action(
            fixture.org,
            "canvas.create",
            {"name": f"Map {number}"},
            record=record,
            agent="cs",
            target="canvas",
        )
    )
    return record, made
```

Create `services/agents/tests/test_builder_e2e.py`:

```python
"""Builder actions end to end (contract): Activity, Waiting and the graph stay
bounded with every builder kind on the page, and a segment goes from
proposed to applied to undone over HTTP."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from core.models import AuditEvent
from services.agents.tests.builder_fixtures import add_builder_actions, builder_action, definition
from services.agents.tests.fixtures import AgentsFixture, viewer
from services.segments.models import Segment

ACTIONS = "/api/v1/agents/actions/"


class BuilderPagesTests(AgentsFixture):
    def count(self, user, url):
        with CaptureQueriesContext(connection) as queries:
            response = self.client_for(user).get(url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("DISTINCT", " ".join(q["sql"] for q in queries).upper())
        return len(queries)

    def test_the_count_does_not_grow_with_builder_actions(self):
        vic = viewer(self.org)
        pages = (
            (self.admin, ACTIONS),
            (vic, ACTIONS),
            (self.csm, ACTIONS),
            (self.admin, "/api/v1/brain/waiting/?scope=company"),
            (self.admin, "/api/v1/brain/graph/?scope=company"),
            (self.csm, "/api/v1/brain/graph/?scope=me"),
        )
        add_builder_actions(self, 0)
        few = [self.count(user, url) for user, url in pages]
        for number in range(1, 4):
            add_builder_actions(self, number)
        self.assertEqual([self.count(user, url) for user, url in pages], few)

    def test_every_builder_preview_reads_for_its_reader(self):
        add_builder_actions(self, 0)
        rows = self.client_for(self.admin).get(ACTIONS).json()["results"]
        previews = {row["kind"]: row["preview"] for row in rows}
        self.assertEqual(previews["canvas.create"], {"canvas": {"name": "Map 0", "people": 1}})
        self.assertEqual(previews["segment.create"]["segment"]["conditions"], 1)
        self.assertEqual(
            set(previews),
            {
                "segment.create",
                "scenario.create",
                "campaign.create",
                "plan.template",
                "canvas.create",
            },
        )
        mine = self.client_for(self.csm).get(ACTIONS).json()["results"]
        self.assertEqual([row["kind"] for row in mine], ["canvas.create"])


class SegmentJourneyTests(AgentsFixture):
    def test_proposed_approved_opened_and_undone(self):
        action = builder_action(self.org, "segment.create", definition())
        client = self.client_for(self.admin)
        approved = client.post(f"{ACTIONS}{action.pk}/approve/").json()["action"]
        self.assertEqual(approved["status"], "applied")
        segment_id = approved["result"]["segment_id"]
        made = client.get(f"/api/v1/segments/{segment_id}/").json()
        self.assertEqual(
            made["made_by"],
            {"agent": "ops", "approved_by": {"id": self.admin.pk, "name": "Alice Admin"}},
        )
        self.assertEqual(client.get(f"{ACTIONS}{action.pk}/").json()["undo"]["allowed"], True)
        undone = client.post(f"{ACTIONS}{action.pk}/undo/").json()["action"]
        self.assertEqual(undone["status"], "undone")
        self.assertFalse(Segment.objects.filter(pk=segment_id).exists())
        actions = list(AuditEvent.objects.order_by("pk").values_list("action", flat=True))
        self.assertEqual(
            [a for a in actions if a.startswith(("segment.", "agent_action."))],
            ["segment.created", "agent_action.approved", "segment.deleted", "agent_action.undone"],
        )

    def test_undo_after_an_edit_says_so(self):
        action = builder_action(self.org, "segment.create", definition())
        client = self.client_for(self.admin)
        segment_id = client.post(f"{ACTIONS}{action.pk}/approve/").json()["action"]["result"][
            "segment_id"
        ]
        client.patch(f"/api/v1/segments/{segment_id}/", {"name": "Renamed"}, format="json")
        response = client.post(f"{ACTIONS}{action.pk}/undo/")
        self.assertEqual(
            (response.status_code, response.json()["code"], response.json()["detail"]),
            (409, "CHANGED_SINCE", "This segment has been edited since."),
        )
```

- [ ] **Step 2: Run them**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test services.agents.tests.test_builder_e2e --noinput`
Expected: PASS. If the bounded test fails, the failing page reads something per row: find it with `CaptureQueriesContext` (compare the two runs' SQL) and move that read into `bulk.Bulk` (Tasks 13, 19) or a `select_related`; never loosen the assertion.

- [ ] **Step 3: Commit**

```bash
git add services/agents/tests/builder_fixtures.py services/agents/tests/test_builder_e2e.py
git commit -m "test(agents): bounded pages with every builder kind; a segment's whole journey

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 29: `docs/API_CONTRACTS.md`

**Files:**
- Modify: `docs/API_CONTRACTS.md` (the `agents` section at the end; `### GET /api/v1/brain/graph/`; `segments`; `rules`; `campaigns`; `Models — Canvas`; plan templates; `/communications/drafts/`)

**Interfaces:**
- Consumes: Tasks 1–28.
- Produces: the contract, folded into the API document (api-contracts skill: every changed endpoint's shape, errors and who may call it).

- [ ] **Step 1: Edit the `agents` section**

- **ActionKind** list: after `plan.start` (ask; cs, sales), insert "`segment.create`, `scenario.create`, `campaign.create` (ask; ops), `canvas.create` (ask; cs, sales, ops), `plan.template` (ask; ops)," before `initiative.create`.
- `record` bullet: "`null` for a workspace-level kind (`initiative.create`, `segment.create`, `scenario.create`, `campaign.create`, `plan.template`), else `{kind: "customer" | "account", id, name}`."
- `preview` bullet, before `{initiative: …}`, add: "`{segment: {kind, name, conditions, members}}` for `segment.create` (`members` counted as the reader, `conditions` every leaf); `{scenario: {name, segment, trigger, steps}}` (display sentences); `{campaign: {name, segment, roles, subject, excerpt}}` (role labels; the body's first 280 characters); `{canvas: {name, people}}` (the record's people the reader may open); `{template: {kind, name, milestones, tasks}}` (counts);".
- `result` bullet: "`{task_id, note_id, initiative_id, draft_id, plan_id, segment_id, rule_id, campaign_id, canvas_id, template_id}`. Each key is null unless that kind made it; `scenario.create` sets `rule_id` and `segment_id`, `campaign.create` `campaign_id` and `segment_id`."
- **Who decides:** "…`initiative.create` and the four workspace builder kinds, view-all only."
- **Approve and reject errors, in order:** after `400 …`, insert "`409 OWNER_LIMIT` (`{"code": "OWNER_LIMIT", "detail": "You already own 50 segments."}`, or scenarios, campaigns, plan templates: the approver owns the most of what it would make; nothing is made and the action stays proposed),".
- **Undo errors:** after "…gets its own sentence", add "(the builder kinds' sentences are under Delivery 3)".
- **Brain › Waiting on you:** replace "`GET /brain/graph/` is unchanged and still reads `proposal` nodes (the Ops agent's `task.create` and `initiative.create` rows)." with "Workspace-level actions are off the desk of a reader without view-all, so they are never counted in `hidden`. `GET /brain/graph/` draws `agent_action` nodes (Delivery 3)."
- Append, before **Compatibility**:

```text
**Delivery 3: the builder** (contract `docs/superpowers/plans/2026-10-08-agents-builder-api.md`).

- Builder kinds are capped at Ask: the person who approves owns everything the action makes, checked again as them inside the decision's transaction (nothing is half-made). A check failing at apply expires the action (`changed`); a 50-per-owner limit is `409 OWNER_LIMIT` and the action stays proposed. Auto is refused with "This action can't be set to auto.".
- `segment.create`, `scenario.create`, `campaign.create`, `plan.template` (Ops): workspace-level, view-all only to read and decide, never in Recommended, never counted in `hidden`. `canvas.create` (every agent): record-level, read by the record's openers, decided by its owner, anyone above them or view-all; it reaches Recommended.
- The model writes a segment definition `{kind, name (≤120), description (≤500), rules}` with 1–8 top-level conditions; a scenario `{name, segment, trigger, actions}` with 1–3 steps from notify, task, lifecycle, plan (a listed template) and survey (always reviewed), never a campaign; a campaign `{name, segment, roles, subject (≤150), body (≤1,200, plain, `{first_name}`, `{organisation}`, `{sender_name}` only)}`; a map `{name (≤120)}` citing its record's people line; a template `{kind, name, description, milestones}` with at most 4 milestones and 12 tasks. A builder action cites only the workspace figures (a map, its record's people line); none of its text names a record, task or note; a campaign's subject and body name nothing internal; one builder action is kept per pass. Targets: `segment:<kind>:<name>`, `scenario:<name>`, `campaign:<name>`, `template:<name>`, `canvas`.
- Apply makes: a private segment with its baseline; a segment and a switched-off rule on it; a segment and a draft campaign on it; a map of the record's people the approver may open, laid out by role, no links (`created_by` the approver); a template shared with the workspace. Each keeps the action (`agent_action`) and writes its own audit event with the approver as actor.
- Undo (7 days), `409 CHANGED_SINCE`: "This segment has been edited since." / "A scenario, campaign or survey uses this segment now."; "This scenario has been switched on." (any `rule.activated`, even if switched off again) / "This scenario has been edited since."; "This campaign has been sent." / "This campaign has been edited since."; "This map has been edited since." (its `version` moved); "This plan template has been edited since." / "Plans have been started from this template." / "A scenario or a plan start uses this template now."; and "This segment/scenario/campaign/map/plan template has been deleted." when nothing is left. Edited means `updated_at` moved from the value kept in `after`. A scenario's or campaign's segment goes with it unless something else uses it or it was edited.
- Undo notices call the changes "segment", "scenario", "campaign", "map" and "plan template"; a workspace-level one reads "Vic Viewer undid the Ops agent's segment.".
- Every agent's record blocks carry `people: N (role n, …)` (counts, no names). The Ops prompt carries a builder catalogue (fields, operators, values, AI attributes by `api_name`, products, triggers, steps, roles, merge fields, template limits) and the workspace-shared segments and templates by name and kind.
```

- [ ] **Step 2: Edit the object sections**

Add this line to each, as named:
- `segments` (after the model's description), `rules` (after the GET/POST list example), `campaigns` (in **Models**, `Campaign`), `Models — Canvas`, and plan templates (after the template example):

```text
`made_by`: `{"agent": "ops", "approved_by": {"id", "name"} | null}` on the detail and on every list row when an agent action made the object (`agent_action`, SET_NULL), else `null`. `approved_by` is the action's decider, and `null` once that person no longer exists. Lists load it with the row: no extra query.
```

- [ ] **Step 3: Edit the Brain graph and the drafts**

`### GET /api/v1/brain/graph/`: replace the **Proposals** bullet with:

```text
- **Agent actions.** Every waiting action the reader may read (Activity's `readable`: drafts by their source too), of any kind and agent, as `{"id": "agent_action:91", "kind": "agent_action", "label": <title>, "agent", "action_kind", "action_id"}`. `acts_on` runs to `customer:<id>` for an action on a drawn organisation, and for an account action to each of the account's organisations that is drawn (drawn: the reader may open it); `serves` runs to the initiative of `AgentAction.initiative` when drawn; a workspace-level action has no edge. The `proposal` node and `proposal_kind` are gone here.
```

`/communications/drafts/` table: in the `GET` row, after "`status` (`open` by default, `sent`)" add "(`sent` lists drafts being sent too)"; in the `send/` row, after "threaded on the source." add "The draft is claimed (an internal `sending`, read as `sent` with `sent_at` null) and committed before the provider is called: a provider error opens it again (502); a failure after the provider accepted leaves it claimed, and a second Send is `409 ALREADY_SENT`, so it never goes twice."

- [ ] **Step 4: Check the fences and commit**

Run: `venv/bin/ruff format --check docs/API_CONTRACTS.md` (expected: no change) and `grep -c '^```' docs/API_CONTRACTS.md` (expected: an even number).

```bash
git add docs/API_CONTRACTS.md
git commit -m "docs: the builder kinds, made_by, the agent-action graph and Send's claim in the API contracts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 30: The audit catalogue, data classification and product docs

**Files:**
- Modify: `docs/audit-events.md`, `docs/data-classification.md`, `docs/product/01-prd.md`, `docs/product/02-trd.md`, `docs/product/05-backend-schema.md`, `docs/product/06-implementation-plan.md`

**Interfaces:**
- Consumes: Tasks 1–28.
- Produces: the same-PR docs.

- [ ] **Step 1: `docs/audit-events.md`**

- `segment.created`, `segment.deleted`: add the caller "`services.agents.builder` (a builder action applied or undone; actor the approver or the undoer)"; `segment.created` metadata gains "`agent_action` (id) when an agent action made it".
- `rule.created`, `rule.deleted`: add "`services.agents.actions.scenarios` (apply, undo)"; `rule.created` metadata gains `agent_action`.
- `campaign.created`, `campaign.deleted`: add "`services.agents.actions.campaigns`"; `campaign.created` gains `agent_action`.
- `canvas.created`, `canvas.deleted`: add "`services.agents.actions.canvases`"; `canvas.created` gains `agent_action` (`start` is `people`).
- `plan_template.created`, `plan_template.shared`, `plan_template.deleted`: add "`services.agents.actions.templates`"; `plan_template.created` gains `agent_action`.
- `reply_draft.sent`: append "written after the provider accepted; the draft was claimed (`sending`) before the call".

- [ ] **Step 2: `docs/data-classification.md`**

- `metrics.AgentAction` row: add "Builder actions' payloads hold segment rules, scenario steps, campaign subject and body, and template text, model-written from the workspace figures; they never name a record, task or note (dropped before they are stored), and the four workspace kinds are read only by `view_all_accounts`. A `canvas.create` preview counts the record's people the reader may open, never naming them."
- `segments.Segment`, `customers.Canvas`, and the rules, campaigns and plans rows: add "`agent_action` (the action that made it; SET_NULL); `made_by` names the agent and the approver, a teammate's name."
- `customers.ReplyDraft` row: add "`status` `sending` is internal (a claimed Send) and reads as `sent`."
- Flows: add a row "Agent prompt (Ops) → LLM provider | the builder catalogue (field keys, operators, choice values, AI attribute api names and picklist options, product names) and the workspace-shared segments' and templates' names; each record's people counted by role | internal | workspace strings quoted as data (`json.dumps`); private and person-shared segments and templates never sent; no contact is named".

- [ ] **Step 3: Product docs**

- `01-prd.md`, the features table, after "Agents: start a plan (delivery 2, backend)", add:

```text
| Agents: the builder (delivery 3, backend) | Built | The Ops agent proposes a whole segment, scenario, campaign draft or plan template, and every agent a map of a record's people. A person approves each (never Auto) and owns what it makes; a scenario starts switched off and a campaign as a draft, so only its owner switches it on or sends it. Each object says which agent made it and who approved it, and undo removes it for 7 days while nobody has touched it. The Brain graph shows every waiting action the reader may read |
```

- `02-trd.md`: after "## Agents (delivery 2): drafts and plans" and its bullets, add a section:

```text
## Agents (delivery 3): the builder

- **Five kinds.** `segment.create`, `scenario.create`, `campaign.create`, `plan.template` (Ops, workspace-level) and `canvas.create` (every agent, record-level) join the registry after `plan.start`, all capped at Ask. The contract is `docs/superpowers/plans/2026-10-08-agents-builder-api.md`.
- **Apply as the approver.** Each kind reuses its object's own write serializer with the approver as the request's user, inside the decision's transaction (`services/agents/builder.py`); a refused check expires the action, an owner limit (`OwnerLimit`) rolls the decision back as `409 OWNER_LIMIT`. Objects keep the action (`agent_action`), shown as `made_by`.
- **Per-reader previews.** `Kind.per_reader`: a segment's members (`builder.member_counts`, one `id IN` aggregate per segment kind per page) and a map's people (`people.visible_people`) are counted as the reader, once per page in `bulk.Bulk`.
- **Evidence and drop rules.** The Ops prompt gains the builder catalogue and the workspace-shared segments and templates; every record block gains a people-by-role line. `Kind.texts` lists every free-text field for the naming rules; a workspace object names no record (`record_mentions`); one builder action is kept per pass.
- **Graph.** `brain/graph.py` draws `agent_action` nodes from `desk.agent_actions(...).readable`, with `acts_on` to drawn organisations and `serves` to drawn initiatives.
- **Send claims first.** A draft reply is claimed (`sending`, a conditional UPDATE, committed) before the provider is called.
```

- `05-backend-schema.md`: in the `AgentAction` row, "one of 12: delivery 2 added `draft.reply` and `plan.start`" becomes "one of 17: delivery 2 added `draft.reply` and `plan.start`, delivery 3 `segment.create`, `scenario.create`, `campaign.create`, `canvas.create` and `plan.template`", and "(null for `initiative.create`)" becomes "(null for a workspace-level kind)". In the `ReplyDraft` row, "`status` (open, sent)" becomes "`status` (open, sending: an internal claim read as sent, sent)" and "One open draft per email and per ticket" becomes "One open or sending draft per email and per ticket". Add "`agent_action` (SET_NULL: the agent action that made it)" to the `Segment`, `Rule`, `Campaign`, `Canvas` and `PlanTemplate` rows.
- `06-implementation-plan.md`: append

```text
## Done: Agents delivery 3, the builder (2026-10-08, backend)

- `segment.create`, `scenario.create`, `campaign.create`, `plan.template` (Ops) and `canvas.create` (every agent), Ask only, applied as and owned by the approver, undone while untouched; `agent_action` and `made_by` on segments, scenarios, campaigns, maps and templates; `409 OWNER_LIMIT`; the builder catalogue and people lines in the evidence; one builder action per pass; workspace-level actions never hidden in Waiting.
- The Brain graph's `agent_action` nodes; a draft reply's Send claims the draft first.
- Migrations: `metrics 0013`, `segments 0002`, `rules 0006`, `campaigns 0007`, `customers 0059`, `0060`, `plans 0005`.
```

- [ ] **Step 4: Check and commit**

Run: `venv/bin/ruff format --check docs` (expected: no change).

```bash
git add docs/audit-events.md docs/data-classification.md docs/product/01-prd.md docs/product/02-trd.md docs/product/05-backend-schema.md docs/product/06-implementation-plan.md
git commit -m "docs: the builder delivery in the audit catalogue, data classification and product docs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 31: Full verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Migrations are complete**

Run: `venv/bin/python manage.py makemigrations --check --dry-run`
Expected: "No changes detected".

- [ ] **Step 2: Lint and format**

Run: `venv/bin/ruff check . && venv/bin/ruff format --check .`
Expected: "All checks passed!" and every file already formatted (the Markdown fences included).

- [ ] **Step 3: The whole suite, in parallel**

Run: `DATABASE_URL=postgres://revenact:revenact@localhost:5432/revenact_t3 venv/bin/python manage.py test --parallel auto --noinput`
Expected: every test passes. A failure is fixed at its cause (superpowers:systematic-debugging), never by loosening a test.

- [ ] **Step 4: No DISTINCT, and the SOC 2 markers**

Run: `git diff 417eb00 --stat` and read the diff for: every new access rule with `# SOC2:AUTH-02`, every new `audit.record` with `# SOC2:LOG-01`, no `.distinct()` on a join, no literal password or credential.
Expected: none missing.

- [ ] **Step 5: Commit any fixes**

If Steps 1–4 changed anything:

```bash
git add <the files changed>
git commit -m "fix(agents): verification fixes for the builder

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
